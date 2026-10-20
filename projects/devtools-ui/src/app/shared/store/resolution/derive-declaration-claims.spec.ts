/**
 * Declaration-resolution-claim specs (Task 4): the complete mapping-state
 * precedence (T4-AC-01), distinct action paths (T4-AC-02), convergence
 * without binding duplication and retained raw action/domain evidence
 * (T4-AC-03), and the co-declared two-claims-one-target case (T4-AC-06).
 * Seeded branches without a real capture are `source-confirmed-unobserved`.
 */
import { FIXTURES, NF_HOST, type SnapshotV1 } from 'devtools-bridge';

import { mergeDocumentMaps, resolveUrl } from '../merge-document-maps';
import type {
  DeclarationResolutionClaim,
  ResolutionClaimsDerivation,
  SourceComparison,
  SourceComparisonKind,
} from './claims-model';
import { deriveResolutionClaims } from './derive-declaration-claims';
import type { CanonicalRegistryEvidence, EffectiveConsumerResolution } from './model';
import { normalizeRegistryEvidence } from './normalize-registry-evidence';
import { resolveEffectiveConsumerBindings } from './resolve-effective-consumer-bindings';

const PAGE_URL = 'https://seeded.example/app/';

interface SeedParticipant {
  name: string;
  entries: Record<string, string>;
  pool?: string;
  servedBy?: string;
  cached?: boolean;
}

interface SeedRegistration {
  tag: string;
  action: string;
  host?: boolean;
  participants: SeedParticipant[];
}

interface Seed {
  remotes: Record<string, string>;
  shared?: Record<string, Record<string, SeedRegistration[]>>;
  scoped?: Record<string, Record<string, { tag: string; entries: Record<string, string> }>>;
  imports?: Record<string, string>;
  scopes?: Record<string, Record<string, string>>;
}

function seedSnapshot(seed: Seed): SnapshotV1 {
  const sharedExternals: NonNullable<SnapshotV1['runtime']>['sharedExternals'] = {};
  for (const [shareScope, packages] of Object.entries(seed.shared ?? {})) {
    sharedExternals[shareScope] = {};
    for (const [packageName, registrations] of Object.entries(packages)) {
      sharedExternals[shareScope][packageName] = {
        dirty: false,
        versions: registrations.map((registration) => ({
          tag: registration.tag,
          action: registration.action,
          host: registration.host ?? false,
          remotes: registration.participants.map((participant) => ({
            name: participant.name,
            requiredVersion: '*',
            strictVersion: false,
            file: null,
            entries: participant.entries,
            cached: participant.cached ?? false,
            bundle: null,
            ...(participant.pool === undefined ? {} : { pool: participant.pool }),
            ...(participant.servedBy === undefined ? {} : { servedBy: participant.servedBy }),
            servedFiles: Object.entries(participant.entries).map(([entry, file]) => ({
              entry,
              file,
            })),
            generation: 'v4.5' as const,
          })),
        })),
      };
    }
  }
  const scopedExternals: NonNullable<SnapshotV1['runtime']>['scopedExternals'] = {};
  for (const [ownerRemote, packages] of Object.entries(seed.scoped ?? {})) {
    scopedExternals[ownerRemote] = {};
    for (const [packageName, scopedPackage] of Object.entries(packages)) {
      scopedExternals[ownerRemote][packageName] = {
        tag: scopedPackage.tag,
        bundle: null,
        entries: scopedPackage.entries,
      };
    }
  }
  const imports = Object.entries(seed.imports ?? {}).map(([specifier, target]) => ({
    specifier,
    target,
  }));
  const scopes = Object.entries(seed.scopes ?? {}).map(([scope, entries]) => ({
    scope,
    imports: Object.entries(entries).map(([specifier, target]) => ({ specifier, target })),
  }));
  return {
    schemaVersion: 1,
    capture: {
      pageUrl: PAGE_URL,
      capturedAt: '2026-08-18T00:00:00.000Z',
      mode: 'passive',
      collectorVersion: 'nf-devtools-collector/3',
    },
    channels: {
      nativeFederationGlobals: { state: 'available' },
      domImportMaps: { state: 'available' },
      importShim: { state: 'available' },
    },
    runtime: {
      remotes: Object.fromEntries(
        Object.entries(seed.remotes).map(([name, scopeUrl]) => [
          name,
          { scopeUrl, exposes: [], integrity: {} },
        ]),
      ),
      scopedExternals,
      sharedExternals,
      sharedChunks: {},
      generation: 'v4.5',
    },
    importMaps: {
      documentMaps: [
        {
          kind: 'importmap',
          parsed: true,
          importCount: imports.length,
          scopeCount: scopes.length,
          imports,
          scopes,
          integrity: {},
        },
      ],
      effective: null,
    },
    errors: [],
  };
}

interface Harness {
  evidence: CanonicalRegistryEvidence;
  resolutions: EffectiveConsumerResolution[];
  claims: ResolutionClaimsDerivation;
}

function derive(snapshot: SnapshotV1): Harness {
  const pageUrl = snapshot.capture.pageUrl;
  const effectiveMap = mergeDocumentMaps(snapshot.importMaps?.documentMaps ?? [], pageUrl);
  const remoteScopeUrlByName = new Map(
    Object.entries(snapshot.runtime?.remotes ?? {}).map(([name, remote]) => [
      name,
      resolveUrl(remote.scopeUrl, pageUrl),
    ]),
  );
  const evidence = normalizeRegistryEvidence(snapshot);
  const resolutions = resolveEffectiveConsumerBindings(evidence, {
    resolutionBaseUrl: pageUrl,
    mapAvailable: snapshot.channels.domImportMaps.state === 'available',
    effectiveMap,
    consumerScopeUrlByRemote: remoteScopeUrlByName,
  });
  const claims = deriveResolutionClaims(evidence, resolutions, {
    remoteScopeUrlByName,
    hostRemote: NF_HOST,
  });
  return { evidence, resolutions, claims };
}

function claimFor(
  harness: Harness,
  consumerRemote: string,
  specifier: string,
): DeclarationResolutionClaim {
  const matches = harness.claims.declarationResolutionClaims.filter(
    (claim) => claim.consumerRemote === consumerRemote && claim.specifier === specifier,
  );
  expect(matches).toHaveLength(1);
  return matches[0];
}

function comparisonOf(
  harness: Harness,
  claim: DeclarationResolutionClaim,
  kind: SourceComparisonKind,
): SourceComparison {
  const comparison = harness.claims.sourceComparisons.find(
    (candidate) => candidate.claimId === claim.id && candidate.kind === kind,
  );
  expect(comparison).toBeDefined();
  return comparison!;
}

function resolutionOf(harness: Harness, claim: DeclarationResolutionClaim) {
  const resolution = harness.resolutions.find(
    (candidate) => candidate.id === claim.effectiveResolutionId,
  );
  expect(resolution).toBeDefined();
  return resolution!;
}

describe('deriveResolutionClaims — corpus-backed mapping states (T4-AC-01)', () => {
  it('keeps explicit anchors anchored, including a valid self-anchor, independent of own selection', () => {
    const harness = derive(FIXTURES['pooling-anchor']);
    expect(harness.claims.declarationResolutionClaims).toHaveLength(5);

    const hostClaim = claimFor(harness, NF_HOST, '@nf-lab/conflict-lib');
    expect(hostClaim.mappingState).toBe('own-selected');
    expect(hostClaim.ownCandidateSelected).toBe(true);

    // servedBy === consumerRemote stays anchored and outranks own-selected.
    const selfAnchor = claimFor(harness, 'mfe1', '@nf-lab/conflict-lib');
    expect(selfAnchor.mappingState).toBe('anchored');
    expect(selfAnchor.ownCandidateSelected).toBe(true);
    expect(selfAnchor.sourceAction).toBe('skip');

    const anchored = claimFor(harness, 'mfe2', '@nf-lab/conflict-lib');
    expect(anchored.mappingState).toBe('anchored');
    expect(anchored.ownCandidateSelected).toBe(false);

    for (const claim of [selfAnchor, anchored]) {
      expect(comparisonOf(harness, claim, 'anchor-vs-observed').status).toBe('match');
      expect(claim.comparisonIds).toHaveLength(3);
    }
    expect(claimFor(harness, 'mfe1', '@nf-lab/conflict-lib/extra').mappingState).toBe(
      'own-selected',
    );
    expect(claimFor(harness, 'mfe2', '@nf-lab/conflict-lib/extra').mappingState).toBe(
      'not-selected',
    );
  });

  it('explains a losing skip consumer as shared fallback with its raw action retained', () => {
    const harness = derive(FIXTURES['clean-skip']);
    const skipClaim = claimFor(harness, 'mfe1', '@nf-lab/conflict-lib');
    expect(skipClaim.mappingState).toBe('fallback');
    expect(skipClaim.sourceAction).toBe('skip');
    expect(skipClaim.ownCandidateSelected).toBe(false);
    expect(claimFor(harness, 'mfe2', '@nf-lab/conflict-lib').mappingState).toBe('own-selected');
  });
});

describe('deriveResolutionClaims — co-declared share (T4-AC-06)', () => {
  it('yields two claims against one target URL: mfe1 selected exactly, mfe2 visible as not selected', () => {
    const harness = derive(FIXTURES['co-declared-share']);
    const target = 'http://localhost:4300/mfe1/_nf_lab_conflict_lib.JF7uEdSVsN.js';

    expect(harness.claims.declarationResolutionClaims).toHaveLength(2);
    const selected = claimFor(harness, 'mfe1', '@nf-lab/conflict-lib');
    const notSelected = claimFor(harness, 'mfe2', '@nf-lab/conflict-lib');

    expect(selected.mappingState).toBe('own-selected');
    expect(selected.ownCandidateSelected).toBe(true);
    expect(selected.ownCandidateUrl).toBe(target);
    expect(notSelected.mappingState).toBe('not-selected');
    expect(notSelected.ownCandidateSelected).toBe(false);

    const selectedResolution = resolutionOf(harness, selected);
    const notSelectedResolution = resolutionOf(harness, notSelected);
    expect(selectedResolution.status).toBe('mapped');
    expect(notSelectedResolution.status).toBe('mapped');
    expect(selectedResolution.targetUrl).toBe(target);
    expect(notSelectedResolution.targetUrl).toBe(target);
    expect(comparisonOf(harness, notSelected, 'candidate-vs-target').status).toBe('mismatch');
  });
});

describe('deriveResolutionClaims — action and domain evidence retention (T4-AC-03)', () => {
  it('keeps strict-split share, skip, and scope claims on their own action paths', () => {
    const harness = derive(FIXTURES['strict-split']);

    const hostClaim = claimFor(harness, NF_HOST, '@nf-lab/conflict-lib');
    expect(hostClaim).toMatchObject({ mappingState: 'own-selected', sourceAction: 'share' });

    const skipClaim = claimFor(harness, 'mfe1', '@nf-lab/conflict-lib');
    expect(skipClaim).toMatchObject({ mappingState: 'fallback', sourceAction: 'skip' });

    // scope maps each declaration's own file; its registration has no basis slot.
    const scopeClaim = claimFor(harness, 'mfe3', '@nf-lab/conflict-lib');
    expect(scopeClaim).toMatchObject({ mappingState: 'own-selected', sourceAction: 'scope' });
    expect(scopeClaim.comparisonIds).toHaveLength(1);
    expect(scopeClaim.resolutionDomain).toEqual({ kind: 'share-scope', name: '__GLOBAL__' });
  });

  it('keeps strict-scope share claims per consumer context in the strict share scope', () => {
    const harness = derive(FIXTURES['strict-scope']);
    const mfe1Claim = claimFor(harness, 'mfe1', '@nf-lab/conflict-lib');
    const mfe2Claim = claimFor(harness, 'mfe2', '@nf-lab/conflict-lib');

    expect(mfe1Claim).toMatchObject({ mappingState: 'own-selected', sourceAction: 'share' });
    expect(mfe2Claim).toMatchObject({ mappingState: 'own-selected', sourceAction: 'share' });
    expect(mfe1Claim.resolutionDomain).toEqual({ kind: 'share-scope', name: 'strict' });
    expect(mfe1Claim.effectiveResolutionId).not.toBe(mfe2Claim.effectiveResolutionId);
  });

  it('keeps private registrations as private-domain claims with their own candidates', () => {
    const harness = derive(FIXTURES['scoped']);
    const mfe1Claim = claimFor(harness, 'mfe1', '@nf-lab/conflict-lib');
    const mfe2Claim = claimFor(harness, 'mfe2', '@nf-lab/conflict-lib');

    for (const claim of [mfe1Claim, mfe2Claim]) {
      expect(claim.sourceAction).toBe('private');
      expect(claim.subject.kind).toBe('private');
      expect(claim.mappingState).toBe('own-selected');
      expect(claim.comparisonIds).toHaveLength(1);
    }
    expect(mfe1Claim.resolutionDomain).toEqual({ kind: 'private-owner', remote: 'mfe1' });
  });

  it('converges alias claims on one effective binding without duplicating it', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { [NF_HOST]: './', 'alias-a': './shared/', 'alias-b': './shared/' },
        shared: {
          __GLOBAL__: {
            'converge-pkg': [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [
                  { name: 'alias-a', entries: { 'converge-pkg': 'f.js' } },
                  { name: 'alias-b', entries: { 'converge-pkg': 'f.js' } },
                ],
              },
            ],
          },
        },
        imports: { 'converge-pkg': './shared/f.js' },
      }),
    );
    const bindings = harness.resolutions.filter(
      (resolution) => resolution.specifier === 'converge-pkg',
    );
    expect(bindings).toHaveLength(1);
    expect(bindings[0].consumerRemotes).toEqual(['alias-a', 'alias-b']);

    const claims = harness.claims.declarationResolutionClaims;
    expect(claims).toHaveLength(2);
    expect(claims[0].effectiveResolutionId).toBe(bindings[0].id);
    expect(claims[1].effectiveResolutionId).toBe(bindings[0].id);
    // Equal candidate URLs from two declarations stay an observed ambiguity.
    const sourceMatch = harness.claims.sourceMatches.find(
      (match) => match.resolutionId === bindings[0].id,
    );
    expect(sourceMatch?.outcome).toBe('ambiguous-candidate');
  });
});

describe('deriveResolutionClaims — seeded action paths (source-confirmed-unobserved, T4-AC-01/T4-AC-02)', () => {
  // Orchestrator 4.8 maps no skip copy's own files; a pre-4.8 self-fill reads as plain own selection.
  it('reads a pre-4.8 global skip self-fill as own-selected, its later consumers not-selected', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { [NF_HOST]: './', mfe1: './m1/', mfe2: './m2/' },
        shared: {
          __GLOBAL__: {
            'lab-pkg': [
              {
                tag: '1.0.0',
                action: 'skip',
                participants: [
                  { name: 'mfe1', entries: { 'lab-pkg': 'own1.js' } },
                  { name: 'mfe2', entries: { 'lab-pkg': 'own2.js' } },
                ],
              },
            ],
          },
        },
        imports: { 'lab-pkg': './m1/own1.js' },
      }),
    );
    const ownFill = claimFor(harness, 'mfe1', 'lab-pkg');
    expect(ownFill.mappingState).toBe('own-selected');
    expect(ownFill.ownCandidateSelected).toBe(true);

    const laterConsumer = claimFor(harness, 'mfe2', 'lab-pkg');
    expect(laterConsumer.mappingState).toBe('not-selected');
    expect(laterConsumer.ownCandidateSelected).toBe(false);
  });

  it('keeps a blocked binding terminal: no selection, no source attribution', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { [NF_HOST]: './', mfe1: './m1/' },
        shared: {
          __GLOBAL__: {
            'blocked-pkg': [
              {
                tag: '1.0.0',
                action: 'skip',
                participants: [{ name: 'mfe1', entries: { 'blocked-pkg': 'own.js' } }],
              },
            ],
          },
        },
        imports: { 'blocked-pkg': 'https://' },
      }),
    );
    const claim = claimFor(harness, 'mfe1', 'blocked-pkg');
    expect(claim.mappingState).toBe('blocked');
    expect(claim.ownCandidateSelected).toBeNull();
    expect(resolutionOf(harness, claim).status).toBe('blocked');
    expect(comparisonOf(harness, claim, 'candidate-vs-target').status).toBe('unknown');
    const sourceMatch = harness.claims.sourceMatches.find(
      (match) => match.resolutionId === claim.effectiveResolutionId,
    );
    expect(sourceMatch?.outcome).toBe('unknown');
  });

  it('keeps claims unknown when consumer scope evidence or the candidate URL is missing', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { [NF_HOST]: './' },
        shared: {
          __GLOBAL__: {
            'ghost-pkg': [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [{ name: 'ghost', entries: { 'ghost-pkg': 'g.js' } }],
              },
            ],
          },
        },
        imports: { 'ghost-pkg': './g.js' },
      }),
    );
    const claim = claimFor(harness, 'ghost', 'ghost-pkg');
    expect(claim.mappingState).toBe('unknown');
    expect(claim.ownCandidateUrl).toBeNull();
    expect(claim.ownCandidateSelected).toBeNull();
    expect(resolutionOf(harness, claim).status).toBe('unknown');
  });

  it('lets a later declaration supply a secondary entrypoint of the same share registration', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { [NF_HOST]: './', mfe1: './m1/', mfe2: './m2/' },
        shared: {
          __GLOBAL__: {
            'multi-pkg': [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [
                  { name: 'mfe1', entries: { 'multi-pkg': 'a.js' } },
                  { name: 'mfe2', entries: { 'multi-pkg': 'b.js', 'multi-pkg/sub': 'c.js' } },
                ],
              },
            ],
          },
        },
        imports: { 'multi-pkg': './m1/a.js', 'multi-pkg/sub': './m2/c.js' },
      }),
    );
    expect(claimFor(harness, 'mfe1', 'multi-pkg').mappingState).toBe('own-selected');
    expect(claimFor(harness, 'mfe2', 'multi-pkg').mappingState).toBe('not-selected');

    const secondary = claimFor(harness, 'mfe2', 'multi-pkg/sub');
    expect(secondary.mappingState).toBe('own-selected');
    // The basis slot stays the first declaration; the expected secondary-entry
    // disagreement remains comparison data instead of re-electing the slot.
    expect(comparisonOf(harness, secondary, 'slot-vs-observed').status).toBe('mismatch');
  });

  it('resolves a named-scope skip through the override union, then its own uncovered candidate', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { [NF_HOST]: './', mfe1: './m1/', mfe2: './m2/' },
        shared: {
          team: {
            'team-pkg': [
              {
                tag: '2.0.0',
                action: 'share',
                participants: [{ name: 'mfe1', entries: { 'team-pkg': 'shared.js' } }],
              },
              {
                tag: '1.0.0',
                action: 'skip',
                participants: [
                  {
                    name: 'mfe2',
                    entries: { 'team-pkg': 'own.js', 'team-pkg/extra': 'extra.js' },
                  },
                ],
              },
            ],
          },
        },
        scopes: {
          './m2/': { 'team-pkg': './m1/shared.js', 'team-pkg/extra': './m2/extra.js' },
        },
      }),
    );
    const covered = claimFor(harness, 'mfe2', 'team-pkg');
    expect(covered.mappingState).toBe('fallback');
    expect(covered.resolutionDomain).toEqual({ kind: 'share-scope', name: 'team' });

    const uncovered = claimFor(harness, 'mfe2', 'team-pkg/extra');
    expect(uncovered.mappingState).toBe('own-selected');
    expect(uncovered.ownCandidateSelected).toBe(true);
  });

  it('never unions equal tags in separate registrations', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { [NF_HOST]: './', mfe1: './m1/', mfe2: './m2/' },
        shared: {
          __GLOBAL__: {
            'dupe-pkg': [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [{ name: 'mfe1', entries: { 'dupe-pkg': 'a.js' } }],
              },
              {
                tag: '1.0.0',
                action: 'share',
                participants: [{ name: 'mfe2', entries: { 'dupe-pkg': 'b.js' } }],
              },
            ],
          },
        },
        imports: { 'dupe-pkg': './m1/a.js' },
      }),
    );
    expect(claimFor(harness, 'mfe1', 'dupe-pkg').mappingState).toBe('own-selected');
    // The second registration's claim never joins the first registration's union.
    expect(claimFor(harness, 'mfe2', 'dupe-pkg').mappingState).toBe('not-selected');
    expect(harness.claims.registryServingSlotClaims).toHaveLength(2);
  });

  it('anchors across external records within the share scope and separates consumer and source packages', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { [NF_HOST]: './', mfe1: './m1/', mfe2: './m2/' },
        shared: {
          __GLOBAL__: {
            '@lab/a': [
              {
                tag: '1.0.0',
                action: 'skip',
                participants: [
                  { name: 'mfe2', entries: { '@lab/a': 'own-a.js' }, servedBy: 'mfe1' },
                ],
              },
            ],
            '@lab/b': [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [
                  { name: 'mfe1', entries: { '@lab/b': 'main.js', '@lab/a': 'cross.js' } },
                ],
              },
            ],
          },
        },
        scopes: { './m2/': { '@lab/a': './m1/cross.js' } },
      }),
    );
    const claim = claimFor(harness, 'mfe2', '@lab/a');
    expect(claim.mappingState).toBe('anchored');
    expect(claim.consumerRegistryPackage).toBe('@lab/a');
    expect(claim.ownCandidateSelected).toBe(false);
    expect(comparisonOf(harness, claim, 'anchor-vs-observed').status).toBe('match');
    // The anchor supplies the specifier as an entry of another external record.
    const sourceMatch = harness.claims.sourceMatches.find(
      (match) => match.resolutionId === claim.effectiveResolutionId,
    );
    expect(sourceMatch?.outcome).toBe('exact-candidate');
  });

  it('keeps the dynamic global path on the committed surface and never invents an anchor', () => {
    const committed = derive(FIXTURES['dynamic-override']);
    const skipClaim = claimFor(committed, 'mfe1', '@nf-lab/conflict-lib');
    expect(skipClaim.mappingState).toBe('fallback');
    expect(resolutionOf(committed, skipClaim).targetUrl).toBe(
      'http://localhost:4300/_nf_lab_conflict_lib.jvcc6K1csg.js',
    );

    // An additive dynamic override without a registry explanation stays an
    // observed mapping with a scope-derived source, not an invented anchor.
    const overridden = derive(
      seedSnapshot({
        remotes: { [NF_HOST]: './', dyn: './dyn/' },
        shared: {
          __GLOBAL__: {
            'dyn-pkg': [
              {
                tag: '2.0.0',
                action: 'share',
                host: true,
                participants: [{ name: NF_HOST, entries: { 'dyn-pkg': 'h.js' } }],
              },
            ],
          },
        },
        imports: { 'dyn-pkg': './dyn/override.js' },
      }),
    );
    const hostClaim = claimFor(overridden, NF_HOST, 'dyn-pkg');
    expect(hostClaim.mappingState).toBe('not-selected');
    const provider = overridden.claims.observedTargetProviders.find(
      (candidate) => candidate.resolutionId === hostClaim.effectiveResolutionId,
    );
    expect(provider).toMatchObject({ remote: 'dyn', outcome: 'scope-derived' });
  });
});

describe('deriveResolutionClaims — surface boundaries and traceability (T4-AC-02/T4-AC-03/T4-AC-05, source-confirmed-unobserved)', () => {
  it('reads a pre-4.8 fill across skip registrations of one external as own selection', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { [NF_HOST]: './', mfe1: './m1/', mfe2: './m2/' },
        shared: {
          __GLOBAL__: {
            'cross-pkg': [
              {
                tag: '2.0.0',
                action: 'skip',
                participants: [{ name: 'mfe1', entries: { 'cross-pkg': 'a.js' } }],
              },
              {
                tag: '1.0.0',
                action: 'skip',
                participants: [{ name: 'mfe2', entries: { 'cross-pkg': 'b.js' } }],
              },
            ],
          },
        },
        imports: { 'cross-pkg': './m1/a.js' },
      }),
    );
    // The filler sits in another skip registration of the SAME shared external.
    expect(claimFor(harness, 'mfe1', 'cross-pkg').mappingState).toBe('own-selected');
    expect(claimFor(harness, 'mfe2', 'cross-pkg').mappingState).toBe('not-selected');
  });

  it('never guesses between ambiguous share sources for a skip claim', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { [NF_HOST]: './', 'alias-a': './shared/', 'alias-b': './shared/', mfe2: './m2/' },
        shared: {
          __GLOBAL__: {
            'ambiguous-pkg': [
              {
                tag: '2.0.0',
                action: 'share',
                participants: [{ name: 'alias-a', entries: { 'ambiguous-pkg': 'f.js' } }],
              },
              {
                tag: '1.9.0',
                action: 'share',
                participants: [{ name: 'alias-b', entries: { 'ambiguous-pkg': 'f.js' } }],
              },
              {
                tag: '1.0.0',
                action: 'skip',
                participants: [{ name: 'mfe2', entries: { 'ambiguous-pkg': 'own.js' } }],
              },
            ],
          },
        },
        imports: { 'ambiguous-pkg': './shared/f.js' },
      }),
    );
    const claim = claimFor(harness, 'mfe2', 'ambiguous-pkg');
    expect(claim.mappingState).toBe('not-selected');
    const sourceMatch = harness.claims.sourceMatches.find(
      (match) => match.resolutionId === claim.effectiveResolutionId,
    );
    expect(sourceMatch?.outcome).toBe('ambiguous-candidate');
    expect(sourceMatch?.candidateIds).toHaveLength(2);
  });

  it('excludes an anchored declaration from the ordinary fallback surface while keeping it observed', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { [NF_HOST]: './', mfe1: './m1/', mfe2: './m2/' },
        shared: {
          __GLOBAL__: {
            'anchored-src-pkg': [
              {
                tag: '2.0.0',
                action: 'share',
                participants: [
                  { name: 'mfe1', entries: { 'anchored-src-pkg': 'f.js' }, servedBy: 'mfe3' },
                ],
              },
              {
                tag: '1.0.0',
                action: 'skip',
                participants: [{ name: 'mfe2', entries: { 'anchored-src-pkg': 'own.js' } }],
              },
            ],
          },
        },
        imports: { 'anchored-src-pkg': './m1/f.js' },
      }),
    );
    // The anchored share declaration is outside the eligible explanation set:
    // the exact source stays observed evidence and yields a mismatch, never a
    // silently adopted fallback story.
    const claim = claimFor(harness, 'mfe2', 'anchored-src-pkg');
    expect(claim.mappingState).toBe('not-selected');
    expect(comparisonOf(harness, claim, 'candidate-vs-target').status).toBe('mismatch');
    const sourceMatch = harness.claims.sourceMatches.find(
      (match) => match.resolutionId === claim.effectiveResolutionId,
    );
    expect(sourceMatch?.outcome).toBe('exact-candidate');
  });

  it('traces every candidate-vs-target comparison to the deciding resolution record', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { [NF_HOST]: './', mfe1: './m1/' },
        shared: {
          __GLOBAL__: {
            'map-ok': [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [{ name: 'mfe1', entries: { 'map-ok': 'ok.js' } }],
              },
            ],
            'map-blocked': [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [{ name: 'mfe1', entries: { 'map-blocked': 'blocked.js' } }],
              },
            ],
            'map-miss': [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [{ name: 'mfe1', entries: { 'map-miss': 'miss.js' } }],
              },
            ],
            'map-unknown': [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [{ name: 'ghost', entries: { 'map-unknown': 'g.js' } }],
              },
            ],
          },
        },
        imports: { 'map-ok': './m1/ok.js', 'map-blocked': 'https://' },
      }),
    );

    const mapped = claimFor(harness, 'mfe1', 'map-ok');
    const mappedResolution = resolutionOf(harness, mapped);
    const mappedComparison = comparisonOf(harness, mapped, 'candidate-vs-target');
    expect(mappedComparison.right).toMatchObject({
      kind: 'effective-target',
      resolutionId: mappedResolution.id,
      normalizedUrl: 'https://seeded.example/app/m1/ok.js',
    });
    expect(mappedResolution).toMatchObject({
      status: 'mapped',
      // Document-map targets are already page-base-normalized by the merge.
      mapEntry: {
        specifier: 'map-ok',
        target: 'https://seeded.example/app/m1/ok.js',
        match: 'exact',
      },
    });
    expect(mapped.provenance.evidence.length).toBeGreaterThan(0);
    const mappedSourceMatch = harness.claims.sourceMatches.find(
      (match) => match.resolutionId === mappedResolution.id,
    );
    expect(mappedSourceMatch?.provenance.evidence.length).toBeGreaterThan(0);

    const blocked = claimFor(harness, 'mfe1', 'map-blocked');
    const blockedResolution = resolutionOf(harness, blocked);
    expect(comparisonOf(harness, blocked, 'candidate-vs-target').right).toMatchObject({
      resolutionId: blockedResolution.id,
      normalizedUrl: null,
    });
    // The deciding entry and closed reason stay on the referenced resolution.
    expect(blockedResolution).toMatchObject({
      status: 'blocked',
      blockedReason: 'invalid-target-url',
      mapEntry: { specifier: 'map-blocked', target: 'https://' },
    });

    const unmapped = claimFor(harness, 'mfe1', 'map-miss');
    expect(resolutionOf(harness, unmapped)).toMatchObject({ status: 'unmapped', mapEntry: null });
    expect(comparisonOf(harness, unmapped, 'candidate-vs-target').status).toBe('unknown');

    const unknown = claimFor(harness, 'ghost', 'map-unknown');
    const unknownResolution = resolutionOf(harness, unknown);
    expect(unknownResolution.status).toBe('unknown');
    expect(
      unknownResolution.status === 'unknown' ? unknownResolution.unknownReasons : [],
    ).toContain('missing-consumer-scope');
  });

  it('keeps a candidate-less declaration claim-free while its package binding survives', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { [NF_HOST]: './', mfe1: './m1/' },
        shared: {
          __GLOBAL__: {
            'bare-pkg': [
              { tag: '1.0.0', action: 'share', participants: [{ name: 'mfe1', entries: {} }] },
            ],
          },
        },
      }),
    );
    expect(harness.claims.declarationResolutionClaims).toHaveLength(0);
    expect(harness.claims.sourceComparisons).toHaveLength(0);
    const binding = harness.resolutions.find(
      (resolution) =>
        resolution.specifier === 'bare-pkg' && resolution.consumerRemotes.includes('mfe1'),
    );
    expect(binding).toMatchObject({ status: 'unmapped' });
    expect(harness.claims.registryServingSlotClaims).toHaveLength(1);
  });
});
