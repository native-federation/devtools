/**
 * deriveFederation specs — fixture-driven acceptance plus seeded cases for
 * outcomes no capture exhibits (tagged SEEDED):
 *  - T7-AC-01: frankenstein-live — 20/20 providers derived uniquely, each
 *    target equals scopeUrl + servedFile, the host claims no
 *    whiteboard/mermaid file.
 *  - T7-AC-02: SEEDED most-specific tie → ambiguous; foreign origin →
 *    unattributable.
 *  - T7-AC-03: strict-split arrows (skip → winner, scope → own);
 *    self-fill `/extra` own arrow + parent link.
 *  - T7-AC-04: live subpath externals parent-link across all four
 *    spellings; SEEDED orphan subpath yields no link.
 *  - T7-AC-05: capability badges (live matrix) + generation badge.
 *  - T7-AC-06: attribution ladder levels 1–3; losing-copy
 *    declared-not-mapped carries the source-derived tag.
 *  - T7-AC-07: conflict indicator excludes the strict scope; strict rows
 *    carry the pinned-range flag.
 *  - T7-AC-08: every derived field carries its rule tag.
 *  - XC-02: SEEDED spelling pair (v4 `file` / v4.5 `entries`) derives
 *    equivalent projections — generation shows up only as provenance.
 */
import { FIXTURES, NF_HOST } from 'devtools-bridge';
import type {
  DocumentImportMapV1,
  ExternalRemoteV1,
  ExternalScopesV1,
  RemoteV1,
  SnapshotV1,
} from 'devtools-bridge';

import type { DerivedFederation, SharedRowFacts } from './derived-model';
import { deriveFederation } from './derivations';
import { ingestSnapshot } from './ingest';

const SEEDED_PAGE = 'https://seeded.example/app/';

function seededSnapshot(overrides: {
  remotes?: Record<string, RemoteV1>;
  sharedExternals?: ExternalScopesV1;
  documentMaps?: DocumentImportMapV1[];
}): SnapshotV1 {
  return {
    schemaVersion: 1,
    capture: {
      pageUrl: SEEDED_PAGE,
      capturedAt: '2026-08-12T00:00:00.000Z',
      mode: 'passive',
      collectorVersion: 'seeded-spec/1',
    },
    channels: {
      nativeFederationGlobals: { state: 'available' },
      domImportMaps: { state: 'available' },
      importShim: { state: 'unavailable', reason: 'seeded: no shim' },
    },
    runtime: {
      remotes: overrides.remotes ?? {},
      scopedExternals: {},
      sharedExternals: overrides.sharedExternals ?? {},
      sharedChunks: {},
      generation: 'unknown',
    },
    importMaps: { documentMaps: overrides.documentMaps ?? [], effective: null },
    errors: [],
  };
}

function seededRemote(scopeUrl: string): RemoteV1 {
  return { scopeUrl, exposes: [], integrity: {} };
}

function seededParticipant(
  name: string,
  overrides: Partial<ExternalRemoteV1> = {},
): ExternalRemoteV1 {
  return {
    name,
    requiredVersion: '^1.0.0',
    strictVersion: false,
    file: 'entry.js',
    entries: null,
    cached: false,
    bundle: null,
    servedFiles: [{ entry: null, file: 'entry.js' }],
    generation: 'v4',
    ...overrides,
  };
}

function mapTag(
  imports: Record<string, string>,
  scopes: Record<string, Record<string, string>> = {},
): DocumentImportMapV1 {
  return {
    kind: 'importmap',
    parsed: true,
    importCount: Object.keys(imports).length,
    scopeCount: Object.keys(scopes).length,
    imports: Object.entries(imports).map(([specifier, target]) => ({ specifier, target })),
    scopes: Object.entries(scopes).map(([scope, entries]) => ({
      scope,
      imports: Object.entries(entries).map(([specifier, target]) => ({ specifier, target })),
    })),
    integrity: {},
  };
}

function deriveFixture(name: keyof typeof FIXTURES): DerivedFederation {
  return deriveFederation(ingestSnapshot(FIXTURES[name]));
}

function factsOf(
  derived: DerivedFederation,
  participant: string,
  packageName?: string,
): SharedRowFacts {
  const facts = derived.sharedRowFacts.find(
    (candidate) =>
      candidate.row.participant === participant &&
      (packageName === undefined || candidate.row.packageName === packageName),
  );
  expect(facts).toBeDefined();
  return facts!;
}

describe('deriveFederation — provider derivation (T7-AC-01)', () => {
  const model = ingestSnapshot(FIXTURES['frankenstein-live']);
  const derived = deriveFederation(model);
  const scopeUrlOf = new Map(model.remotes.map((remote) => [remote.name, remote.resolvedScopeUrl]));

  it('derives all 20 row providers uniquely', () => {
    expect(derived.sharedRowFacts).toHaveLength(20);
    for (const facts of derived.sharedRowFacts) {
      expect(facts.provider).not.toBeNull();
      expect(facts.provider!.outcome).toBe('derived');
      expect(facts.provider!.remote).not.toBeNull();
    }
  });

  it('reproduces every row target as scopeUrl + servedFile', () => {
    for (const facts of derived.sharedRowFacts) {
      const providerScope = scopeUrlOf.get(facts.provider!.remote!);
      expect(facts.row.resolution!.targetUrl).toBe(`${providerScope}${facts.arrow.file}`);
    }
  });

  it('never lets the host claim whiteboard or mermaid files', () => {
    const remoteOwned = derived.providers.filter((provider) =>
      /\/(whiteboard|mermaid)\//.test(provider.targetUrl),
    );
    expect(remoteOwned.length).toBeGreaterThan(0);
    for (const provider of remoteOwned) {
      expect(provider.remote).not.toBe(NF_HOST);
      expect(provider.outcome).toBe('derived');
      expect(provider.hostFallback).toBe(false);
    }
  });

  it('attributes host files to the host only as least-specific fallback', () => {
    const hostRows = derived.sharedRowFacts.filter((facts) => facts.row.participant === NF_HOST);
    expect(hostRows).toHaveLength(12);
    for (const facts of hostRows) {
      expect(facts.provider!.remote).toBe(NF_HOST);
      expect(facts.provider!.hostFallback).toBe(true);
    }
  });
});

describe('deriveFederation — provider edge outcomes (T7-AC-02)', () => {
  it('SEEDED: nested remote prefixes without a unique most-specific winner derive ambiguous', () => {
    const derived = deriveFederation(
      ingestSnapshot(
        seededSnapshot({
          remotes: {
            'team-a': seededRemote('./team/app/'),
            'team-b': seededRemote('./team/app/'),
            'team-root': seededRemote('./team/'),
            [NF_HOST]: seededRemote('./'),
          },
          documentMaps: [mapTag({ pkg: './team/app/pkg.js', root: './team/root.js' })],
        }),
      ),
    );

    const tied = derived.providers.find(
      (provider) => provider.targetUrl === `${SEEDED_PAGE}team/app/pkg.js`,
    )!;
    expect(tied.outcome).toBe('ambiguous');
    expect(tied.remote).toBeNull();
    expect(tied.candidates).toEqual(['team-a', 'team-b', 'team-root', NF_HOST]);

    // Nested prefixes WITH a unique most-specific winner stay derived.
    const nested = derived.providers.find(
      (provider) => provider.targetUrl === `${SEEDED_PAGE}team/root.js`,
    )!;
    expect(nested.outcome).toBe('derived');
    expect(nested.remote).toBe('team-root');
  });

  it('SEEDED: a foreign-origin target derives unattributable', () => {
    const derived = deriveFederation(
      ingestSnapshot(
        seededSnapshot({
          remotes: { [NF_HOST]: seededRemote('./') },
          documentMaps: [mapTag({ cdn: 'https://cdn.example/lib.js' })],
        }),
      ),
    );

    expect(derived.providers).toEqual([
      {
        targetUrl: 'https://cdn.example/lib.js',
        outcome: 'unattributable',
        remote: null,
        hostFallback: false,
        candidates: [],
        rule: 'scope-prefix-match',
      },
    ]);
  });
});

describe('deriveFederation — resolution arrows (T7-AC-03)', () => {
  it('points the strict-split skip row at the winner and the scope row at its own copy', () => {
    const derived = deriveFixture('strict-split');

    expect(factsOf(derived, 'mfe1').arrow).toEqual({
      kind: 'winner',
      providerParticipant: NF_HOST,
      file: '_nf_lab_conflict_lib.jvcc6K1csg.js',
      targetUrl: 'http://localhost:4300/_nf_lab_conflict_lib.jvcc6K1csg.js',
      rule: 'registry-election',
    });
    expect(factsOf(derived, 'mfe3').arrow).toEqual({
      kind: 'own',
      providerParticipant: 'mfe3',
      file: '_nf_lab_conflict_lib.JF7uEdSVsN.js',
      targetUrl: 'http://localhost:4300/mfe3/_nf_lab_conflict_lib.JF7uEdSVsN.js',
      rule: 'registry-election',
    });
  });

  it('keeps the self-fill /extra external on its own share row with an own arrow and a parent link', () => {
    const derived = deriveFixture('self-fill');
    const extra = factsOf(derived, 'mfe1', '@nf-lab/conflict-lib/extra');

    expect(extra.row.action).toBe('share');
    expect(extra.arrow).toEqual({
      kind: 'own',
      providerParticipant: 'mfe1',
      file: '_nf_lab_conflict_lib_extra.GWjTDmPaoo.js',
      targetUrl: 'http://localhost:4300/mfe1/_nf_lab_conflict_lib_extra.GWjTDmPaoo.js',
      rule: 'registry-election',
    });
    expect(extra.parentLink).toEqual({
      parentPackage: '@nf-lab/conflict-lib',
      rule: 'name-derived',
    });
  });
});

describe('deriveFederation — secondary-entry parent linking (T7-AC-04)', () => {
  it('links the live subpath externals across all four corpus spellings', () => {
    const derived = deriveFixture('frankenstein-live');
    const parentOf = (packageName: string) => factsOf(derived, NF_HOST, packageName).parentLink;

    expect(parentOf('@angular/common/http')).toEqual({
      parentPackage: '@angular/common',
      rule: 'name-derived',
    });
    expect(parentOf('rxjs/operators')).toEqual({ parentPackage: 'rxjs', rule: 'name-derived' });
    expect(parentOf('@angular/core/primitives/di')).toEqual({
      parentPackage: '@angular/core',
      rule: 'name-derived',
    });
    expect(parentOf('@angular/core/event-dispatch-contract.min.js')).toEqual({
      parentPackage: '@angular/core',
      rule: 'name-derived',
    });
    // Base packages carry no link.
    expect(parentOf('@angular/common')).toBeNull();
    expect(parentOf('rxjs')).toBeNull();
  });

  it('SEEDED: an orphan subpath yields no link', () => {
    const derived = deriveFederation(
      ingestSnapshot(
        seededSnapshot({
          sharedExternals: {
            __GLOBAL__: {
              'lonely/sub': {
                dirty: false,
                versions: [
                  {
                    tag: '1.0.0',
                    action: 'share',
                    host: false,
                    remotes: [seededParticipant('mfe-a')],
                  },
                ],
              },
            },
          },
        }),
      ),
    );

    expect(derived.sharedRowFacts).toHaveLength(1);
    expect(derived.sharedRowFacts[0].parentLink).toBeNull();
  });
});

describe('deriveFederation — capability badges (T7-AC-05)', () => {
  it('derives the live badge matrix: host dense chunking + SRI, whiteboard/mermaid SRI only', () => {
    const derived = deriveFixture('frankenstein-live');
    const badgesOf = (remote: string) =>
      derived.remoteBadges.find((badges) => badges.remote === remote)!;

    const host = badgesOf(NF_HOST);
    expect(host.denseChunking).toEqual({ present: true, rule: 'shared-chunks-lists' });
    // Released v4 spells every participant as a single `file`.
    expect(host.multiEntry.present).toBe(false);
    expect(host.sri.present).toBe(true);

    for (const remote of ['whiteboard', 'mermaid']) {
      const badges = badgesOf(remote);
      expect(badges.sri.present).toBe(true);
      expect(badges.denseChunking.present).toBe(false);
      expect(badges.multiEntry.present).toBe(false);
    }
  });

  it('derives multi-entry from a participant serving several entrypoints', () => {
    const badges = deriveFixture('synthetic-dense-entries').remoteBadges.find(
      (entry) => entry.remote === 'mfe-dense',
    )!;
    expect(badges.multiEntry.present).toBe(true);
    expect(badges.denseChunking.present).toBe(false);
  });

  it('derives the generation badge from provenance: released v4 live, v4.5 lab', () => {
    expect(deriveFixture('frankenstein-live').generationBadge).toEqual({
      generation: 'v4',
      rule: 'generation-aggregate',
    });
    expect(deriveFixture('clean-skip').generationBadge).toEqual({
      generation: 'v4.5',
      rule: 'generation-aggregate',
    });
  });
});

describe('deriveFederation — chunk-attribution ladder (T7-AC-06)', () => {
  it('yields level-1 package chunk data for the dense live host', () => {
    const derived = deriveFixture('frankenstein-live');
    const host = derived.chunkAttribution.find((entry) => entry.remote === NF_HOST)!;

    expect(host.level).toBe('package');
    expect(host.packageAttribution).toBe('derived');
    expect(host.rule).toBe('bundle-chunk-join');
    const byPackage = new Map(host.packages.map((entry) => [entry.packageName, entry]));
    expect(byPackage.get('@angular/common')).toEqual({
      packageName: '@angular/common',
      bundleName: 'browser-angular_common',
      files: ['chunk-WW26EZ22.js'],
      rule: 'bundle-chunk-join',
    });
    expect(byPackage.get('@angular/core')!.files).toEqual([
      'chunk-RCIWTGS7.js',
      'chunk-K6ZMRNMW.js',
      'chunk-APTZXQMF.js',
      'chunk-V2SUVJ7R.js',
      'chunk-2VMXMS7J.js',
    ]);
    // A bundle without a recorded chunk list keeps an explicit empty claim.
    expect(byPackage.get('tslib')).toEqual({
      packageName: 'tslib',
      bundleName: 'browser-tslib',
      files: [],
      rule: 'bundle-chunk-join',
    });
  });

  it('yields level-2 remote-only attribution for the non-dense chunk groups', () => {
    const derived = deriveFixture('non-dense');
    const mfe3 = derived.chunkAttribution.find((entry) => entry.remote === 'mfe3')!;

    expect(mfe3.level).toBe('remote');
    expect(mfe3.packages).toEqual([]);
    expect(mfe3.groups).toHaveLength(7);
    expect(mfe3.packageAttribution).toBe('not-derivable');
    expect(mfe3.rule).toBe('chunk-pseudo-externals');
  });

  it('yields level-3 explicit absence for a v4 remote without bundle grouping', () => {
    const derived = deriveFixture('frankenstein-live');
    const whiteboard = derived.chunkAttribution.find((entry) => entry.remote === 'whiteboard')!;

    expect(whiteboard.level).toBe('none');
    expect(whiteboard.groups).toEqual([]);
    expect(whiteboard.packageAttribution).toBe('no-evidence');
    expect(whiteboard.rule).toBe('no-chunk-evidence');
  });

  it('tags the losing-copy declared-not-mapped diff as source-derived', () => {
    const derived = deriveFixture('strict-split');

    expect(factsOf(derived, 'mfe1').declaredNotMapped).toEqual({
      files: ['http://localhost:4300/mfe1/_nf_lab_conflict_lib.JF7uEdSVsN.js'],
      rule: 'source-derived',
    });
    // Winning and scope rows carry no losing-copy diff.
    expect(factsOf(derived, NF_HOST).declaredNotMapped).toBeNull();
    expect(factsOf(derived, 'mfe3').declaredNotMapped).toBeNull();
  });
});

describe('deriveFederation — strict-scope semantics (T7-AC-07)', () => {
  it('excludes the strict scope from the conflict indicator and pins its rows', () => {
    const derived = deriveFixture('strict-scope');

    expect(derived.packageConflicts).toEqual([
      {
        scope: 'strict',
        packageName: '@nf-lab/conflict-lib',
        declaredTags: ['2.0.0', '1.0.0'],
        mappedTags: ['2.0.0', '1.0.0'],
        conflict: false,
        strictExcluded: true,
        rule: 'mapped-multiplicity',
      },
    ]);
    expect(derived.sharedRowFacts).toHaveLength(2);
    for (const facts of derived.sharedRowFacts) {
      expect(facts.strictPinned).toEqual({ rule: 'strict-scope-policy' });
    }
  });

  // T10.5 amendment: the flag keys on mapped multiplicity — a clean skip
  // (declared, resolved to the elected copy) is the election succeeding.
  it('keeps the clean-skip election conflict-free — one mapped version', () => {
    const derived = deriveFixture('clean-skip');

    expect(derived.packageConflicts).toEqual([
      {
        scope: '__GLOBAL__',
        packageName: '@nf-lab/conflict-lib',
        declaredTags: ['2.0.0', '1.0.0'],
        mappedTags: ['2.0.0'],
        conflict: false,
        strictExcluded: false,
        rule: 'mapped-multiplicity',
      },
    ]);
    for (const facts of derived.sharedRowFacts) {
      expect(facts.strictPinned).toBeNull();
    }
  });

  it('flags the strict-split package — a scoped second copy is mapped', () => {
    const derived = deriveFixture('strict-split');

    expect(derived.packageConflicts).toEqual([
      {
        scope: '__GLOBAL__',
        packageName: '@nf-lab/conflict-lib',
        declaredTags: ['2.0.0', '1.0.0'],
        mappedTags: ['2.0.0', '1.0.0'],
        conflict: true,
        strictExcluded: false,
        rule: 'mapped-multiplicity',
      },
    ]);
  });
});

describe('deriveFederation — provenance tags (T7-AC-08)', () => {
  const fixtures = ['frankenstein-live', 'strict-split', 'strict-scope', 'non-dense'] as const;

  it('tags every derived field with the rule that produced it', () => {
    for (const name of fixtures) {
      const derived = deriveFixture(name);
      for (const provider of derived.providers) {
        expect(provider.rule).toBe('scope-prefix-match');
      }
      for (const facts of derived.sharedRowFacts) {
        expect(facts.arrow.rule).toBe('registry-election');
        expect(facts.provider?.rule ?? 'scope-prefix-match').toBe('scope-prefix-match');
        expect(facts.parentLink?.rule ?? 'name-derived').toBe('name-derived');
        expect(facts.strictPinned?.rule ?? 'strict-scope-policy').toBe('strict-scope-policy');
        expect(facts.declaredNotMapped?.rule ?? 'source-derived').toBe('source-derived');
      }
      for (const attribution of derived.chunkAttribution) {
        expect(['bundle-chunk-join', 'chunk-pseudo-externals', 'no-chunk-evidence']).toContain(
          attribution.rule,
        );
        for (const entry of attribution.packages) {
          expect(entry.rule).toBe('bundle-chunk-join');
        }
      }
      for (const badges of derived.remoteBadges) {
        expect(['shared-chunks-lists', 'participant-bundle']).toContain(badges.denseChunking.rule);
        expect(badges.sri.rule).toBe('integrity-map-present');
        expect(badges.multiEntry.rule).toBe('multi-entry-map');
      }
      expect(derived.generationBadge.rule).toBe('generation-aggregate');
      for (const conflict of derived.packageConflicts) {
        expect(conflict.rule).toBe('mapped-multiplicity');
      }
    }
  });
});

describe('deriveFederation — generation equivalence (XC-02)', () => {
  function spellingSnapshot(generation: 'v4' | 'v4.5'): SnapshotV1 {
    const spelling =
      generation === 'v4'
        ? {
            file: 'pkg.abc.js',
            entries: null,
            servedFiles: [{ entry: null, file: 'pkg.abc.js' }],
            generation: 'v4' as const,
          }
        : {
            file: null,
            entries: { pkg: 'pkg.abc.js' },
            servedFiles: [{ entry: 'pkg', file: 'pkg.abc.js' }],
            generation: 'v4.5' as const,
          };
    return seededSnapshot({
      remotes: { 'mfe-a': seededRemote('./a/'), [NF_HOST]: seededRemote('./') },
      sharedExternals: {
        __GLOBAL__: {
          pkg: {
            dirty: false,
            versions: [
              {
                tag: '1.0.0',
                action: 'share',
                host: false,
                remotes: [seededParticipant('mfe-a', spelling)],
              },
            ],
          },
        },
      },
      documentMaps: [mapTag({ pkg: './a/pkg.abc.js' })],
    });
  }

  it('SEEDED: both participant spellings derive equivalent projections', () => {
    const v4 = deriveFederation(ingestSnapshot(spellingSnapshot('v4')));
    const v45 = deriveFederation(ingestSnapshot(spellingSnapshot('v4.5')));

    const facts = (derived: DerivedFederation) =>
      derived.sharedRowFacts.map(({ row: _row, ...derivedFacts }) => derivedFacts);
    expect(facts(v4)).toEqual(facts(v45));
    expect(v4.providers).toEqual(v45.providers);
    expect(v4.chunkAttribution).toEqual(v45.chunkAttribution);
    expect(v4.remoteBadges).toEqual(v45.remoteBadges);
    expect(v4.packageConflicts).toEqual(v45.packageConflicts);
    // The spelling surfaces ONLY as generation provenance.
    expect(ingestSnapshot(spellingSnapshot('v4')).sharedRows[0].generation).toBe('v4');
    expect(ingestSnapshot(spellingSnapshot('v4.5')).sharedRows[0].generation).toBe('v4.5');
  });
});
