import { FIXTURES } from 'devtools-bridge';
import type {
  ExternalRemoteV1,
  ExternalScopesV1,
  ExternalVersionV1,
  RemoteV1,
  RuntimeRepositoriesV1,
  ScopedExternalsV1,
  SnapshotV1,
} from 'devtools-bridge';

import type { CanonicalRegistryEvidence } from './model';
import { normalizeRegistryEvidence } from './normalize-registry-evidence';

const SEEDED_PAGE = 'https://seeded.example/app/';

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

function sharedRepository(
  shareScope: string,
  packageName: string,
  versions: ExternalVersionV1[],
  dirty = false,
): ExternalScopesV1 {
  return {
    [shareScope]: {
      [packageName]: { dirty, versions },
    },
  };
}

function seededSnapshot(overrides: Partial<RuntimeRepositoriesV1> = {}): SnapshotV1 {
  return {
    schemaVersion: 1,
    capture: {
      pageUrl: SEEDED_PAGE,
      capturedAt: '2026-08-14T00:00:00.000Z',
      mode: 'passive',
      collectorVersion: 'seeded-normalization-spec/1',
    },
    channels: {
      nativeFederationGlobals: { state: 'available' },
      domImportMaps: { state: 'unavailable', reason: 'seeded: no document map' },
      importShim: { state: 'unavailable', reason: 'seeded: no shim' },
    },
    runtime: {
      remotes: {},
      scopedExternals: {},
      sharedExternals: {},
      sharedChunks: {},
      generation: 'unknown',
      ...overrides,
    },
    importMaps: null,
    errors: [],
  };
}

function expectNonemptyEvidence(evidence: CanonicalRegistryEvidence): void {
  const records = [
    ...evidence.sharedExternals,
    ...evidence.versionRegistrations,
    ...evidence.participantDeclarations,
    ...evidence.privateRegistrations,
    ...evidence.entrypointCandidates,
    ...evidence.diagnostics,
  ];

  for (const record of records) {
    expect(record.provenance.evidence.length).toBeGreaterThan(0);
    for (const reference of record.provenance.evidence) {
      expect(reference.source).toBe('snapshot');
      expect(reference.path.length).toBeGreaterThan(0);
    }
  }
}

describe('normalizeRegistryEvidence — corpus-backed declarations', () => {
  it('preserves co-declared participants as two separately addressable candidates', () => {
    const evidence = normalizeRegistryEvidence(FIXTURES['co-declared-share']);

    expect({
      shared: evidence.sharedExternals.length,
      versions: evidence.versionRegistrations.length,
      declarations: evidence.participantDeclarations.length,
      privateRegistrations: evidence.privateRegistrations.length,
      candidates: evidence.entrypointCandidates.length,
      diagnostics: evidence.diagnostics.length,
    }).toEqual({
      shared: 1,
      versions: 1,
      declarations: 2,
      privateRegistrations: 0,
      candidates: 2,
      diagnostics: 0,
    });

    const wrapper = evidence.sharedExternals[0];
    const registration = evidence.versionRegistrations[0];
    expect(wrapper).toMatchObject({
      shareScope: '__GLOBAL__',
      packageName: '@nf-lab/conflict-lib',
      dirty: false,
      ordinal: 0,
    });
    expect(wrapper.versionRegistrationIds).toEqual([registration.id]);
    expect(registration.participantDeclarationIds).toEqual(
      evidence.participantDeclarations.map((declaration) => declaration.id),
    );
    expect(
      evidence.participantDeclarations.map(({ participant, pool, servedBy }) => ({
        participant,
        pool,
        servedBy,
      })),
    ).toEqual([
      { participant: 'mfe1', pool: null, servedBy: null },
      { participant: 'mfe2', pool: null, servedBy: null },
    ]);
    expect(
      evidence.participantDeclarations.map((declaration) => declaration.entrypointCandidateIds),
    ).toEqual(evidence.entrypointCandidates.map((candidate) => [candidate.id]));

    expect(
      evidence.entrypointCandidates.map(
        ({ ownerRemote, specifier, file, candidateUrl, candidateUrlState }) => ({
          ownerRemote,
          specifier,
          file,
          candidateUrl,
          candidateUrlState,
        }),
      ),
    ).toEqual([
      {
        ownerRemote: 'mfe1',
        specifier: '@nf-lab/conflict-lib',
        file: '_nf_lab_conflict_lib.JF7uEdSVsN.js',
        candidateUrl: 'http://localhost:4300/mfe1/_nf_lab_conflict_lib.JF7uEdSVsN.js',
        candidateUrlState: 'available',
      },
      {
        ownerRemote: 'mfe2',
        specifier: '@nf-lab/conflict-lib',
        file: '_nf_lab_conflict_lib.JF7uEdSVsN.js',
        candidateUrl: 'http://localhost:4300/mfe2/_nf_lab_conflict_lib.JF7uEdSVsN.js',
        candidateUrlState: 'available',
      },
    ]);

    expect(Object.hasOwn(wrapper, 'dirty')).toBe(true);
    for (const record of [
      ...evidence.versionRegistrations,
      ...evidence.participantDeclarations,
      ...evidence.entrypointCandidates,
    ]) {
      expect(Object.hasOwn(record, 'dirty')).toBe(false);
    }
  });

  it('normalizes witnessed pooling anchors independently without changing registry cardinality', () => {
    const snapshot = FIXTURES['pooling-anchor'];
    const runtime = snapshot.runtime;
    if (runtime === null) {
      throw new Error('The pooling-anchor fixture must contain runtime evidence.');
    }

    const anchorCases: Array<{
      packageName: string;
      versionIndex: number;
      participantIndex: number;
      participant: string;
      pool: string | null;
      servedBy: string | null;
      hasPool: boolean;
      hasServedBy: boolean;
    }> = [
      {
        packageName: '@nf-lab/conflict-lib',
        versionIndex: 0,
        participantIndex: 0,
        participant: '__NF-HOST__',
        pool: null,
        servedBy: null,
        hasPool: false,
        hasServedBy: false,
      },
      {
        packageName: '@nf-lab/conflict-lib',
        versionIndex: 1,
        participantIndex: 0,
        participant: 'mfe1',
        pool: 'family',
        servedBy: 'mfe1',
        hasPool: true,
        hasServedBy: true,
      },
      {
        packageName: '@nf-lab/conflict-lib',
        versionIndex: 1,
        participantIndex: 1,
        participant: 'mfe2',
        pool: null,
        servedBy: 'mfe1',
        hasPool: false,
        hasServedBy: true,
      },
      {
        packageName: '@nf-lab/conflict-lib/extra',
        versionIndex: 0,
        participantIndex: 0,
        participant: 'mfe1',
        pool: 'family',
        servedBy: null,
        hasPool: true,
        hasServedBy: false,
      },
      {
        packageName: '@nf-lab/conflict-lib/extra',
        versionIndex: 0,
        participantIndex: 1,
        participant: 'mfe2',
        pool: null,
        servedBy: null,
        hasPool: false,
        hasServedBy: false,
      },
    ];
    const rawParticipants: ExternalRemoteV1[] = anchorCases.map(
      ({ packageName, versionIndex, participantIndex }) =>
        runtime.sharedExternals['__GLOBAL__'][packageName].versions[versionIndex].remotes[
          participantIndex
        ],
    );
    const rawOwnKeys = () =>
      rawParticipants.map((raw) => [Object.hasOwn(raw, 'pool'), Object.hasOwn(raw, 'servedBy')]);
    const rawOwnKeysBefore = rawOwnKeys();

    expect(rawOwnKeysBefore).toEqual(
      anchorCases.map(({ hasPool, hasServedBy }) => [hasPool, hasServedBy]),
    );
    expect(rawParticipants.map(({ name, pool, servedBy }) => [name, pool, servedBy])).toEqual(
      anchorCases.map(({ participant, pool, servedBy }) => [
        participant,
        pool ?? undefined,
        servedBy ?? undefined,
      ]),
    );

    const evidence = normalizeRegistryEvidence(snapshot);

    expect(rawOwnKeys()).toEqual(rawOwnKeysBefore);
    expect({
      shared: evidence.sharedExternals.length,
      versions: evidence.versionRegistrations.length,
      declarations: evidence.participantDeclarations.length,
      privateRegistrations: evidence.privateRegistrations.length,
      candidates: evidence.entrypointCandidates.length,
      diagnostics: evidence.diagnostics.length,
    }).toEqual({
      shared: 2,
      versions: 3,
      declarations: 5,
      privateRegistrations: 0,
      candidates: 5,
      diagnostics: 0,
    });
    expect(
      evidence.participantDeclarations.map(
        ({ participant, pool, servedBy, entrypointCandidateIds }) => ({
          participant,
          pool,
          servedBy,
          candidateCount: entrypointCandidateIds.length,
        }),
      ),
    ).toEqual(
      anchorCases.map(({ participant, pool, servedBy }) => ({
        participant,
        pool,
        servedBy,
        candidateCount: 1,
      })),
    );
    expect(
      evidence.participantDeclarations.map((declaration) => declaration.entrypointCandidateIds),
    ).toEqual(evidence.entrypointCandidates.map((candidate) => [candidate.id]));

    for (const [index, anchorCase] of anchorCases.entries()) {
      const participantPath = [
        'runtime',
        'sharedExternals',
        '__GLOBAL__',
        anchorCase.packageName,
        'versions',
        anchorCase.versionIndex,
        'remotes',
        anchorCase.participantIndex,
      ];
      expect(evidence.participantDeclarations[index].provenance.evidence).toEqual([
        {
          source: 'snapshot',
          path: participantPath,
          state: 'present',
        },
        {
          source: 'snapshot',
          path: [...participantPath, 'pool'],
          state: anchorCase.hasPool ? 'present' : 'missing',
        },
        {
          source: 'snapshot',
          path: [...participantPath, 'servedBy'],
          state: anchorCase.hasServedBy ? 'present' : 'missing',
        },
        // The v4.6.0 corpus predates `poolCause` (orchestrator v4.7).
        {
          source: 'snapshot',
          path: [...participantPath, 'poolCause'],
          state: 'missing',
        },
      ]);
    }
  });

  it('keeps scoped externals as private registrations without shared semantics', () => {
    const evidence = normalizeRegistryEvidence(FIXTURES.scoped);

    expect(evidence.sharedExternals).toEqual([]);
    expect(evidence.versionRegistrations).toEqual([]);
    expect(evidence.participantDeclarations).toEqual([]);
    expect(evidence.diagnostics).toEqual([]);
    expect(evidence.privateRegistrations).toHaveLength(2);
    expect(evidence.entrypointCandidates).toHaveLength(2);

    expect(
      evidence.privateRegistrations.map(
        ({ ownerRemote, packageName, tag, bundle, ordinal, entrypointCandidateIds }) => ({
          ownerRemote,
          packageName,
          tag,
          bundle,
          ordinal,
          candidateCount: entrypointCandidateIds.length,
        }),
      ),
    ).toEqual([
      {
        ownerRemote: 'mfe1',
        packageName: '@nf-lab/conflict-lib',
        tag: '1.0.0',
        bundle: 'browser-shared',
        ordinal: 0,
        candidateCount: 1,
      },
      {
        ownerRemote: 'mfe2',
        packageName: '@nf-lab/conflict-lib',
        tag: '2.0.0',
        bundle: 'browser-shared',
        ordinal: 0,
        candidateCount: 1,
      },
    ]);
    expect(
      evidence.entrypointCandidates.map(
        ({ ownerRemote, specifier, candidateUrl, candidateUrlState }) => ({
          ownerRemote,
          specifier,
          candidateUrl,
          candidateUrlState,
        }),
      ),
    ).toEqual([
      {
        ownerRemote: 'mfe1',
        specifier: '@nf-lab/conflict-lib',
        candidateUrl: 'http://localhost:4300/mfe1/_nf_lab_conflict_lib.JF7uEdSVsN.js',
        candidateUrlState: 'available',
      },
      {
        ownerRemote: 'mfe2',
        specifier: '@nf-lab/conflict-lib',
        candidateUrl: 'http://localhost:4300/mfe2/_nf_lab_conflict_lib.jvcc6K1csg.js',
        candidateUrlState: 'available',
      },
    ]);

    for (const registration of evidence.privateRegistrations) {
      expect(Object.hasOwn(registration, 'action')).toBe(false);
      expect(Object.hasOwn(registration, 'shareScope')).toBe(false);
    }

    const pseudoExternalEvidence = normalizeRegistryEvidence(FIXTURES['non-dense']);
    expect(pseudoExternalEvidence.privateRegistrations).toHaveLength(7);
    expect(
      pseudoExternalEvidence.privateRegistrations.every((registration) =>
        registration.packageName.startsWith('@nf-internal/'),
      ),
    ).toBe(true);
  });
});

describe('normalizeRegistryEvidence — generation-neutral entrypoints and explicit URL states', () => {
  it('normalizes v4 and v4.5 spellings uniformly and keeps missing ownership explicit', () => {
    const packageName = 'pkg';
    const participants = [
      seededParticipant('v4', {
        file: 'single.js',
        entries: null,
        servedFiles: [{ entry: null, file: 'single.js' }],
        generation: 'v4',
      }),
      seededParticipant('v45-one', {
        file: null,
        entries: { pkg: 'single.js' },
        servedFiles: [{ entry: 'pkg', file: 'single.js' }],
        generation: 'v4.5',
      }),
      seededParticipant('v45-many', {
        file: null,
        entries: { pkg: 'main.js', 'pkg/secondary': 'secondary.js' },
        servedFiles: [
          { entry: 'pkg', file: 'main.js' },
          { entry: 'pkg/secondary', file: 'secondary.js' },
        ],
        generation: 'v4.5',
      }),
      seededParticipant('missing-owner', {
        file: 'missing.js',
        servedFiles: [{ entry: null, file: 'missing.js' }],
      }),
      seededParticipant('unusable-owner', {
        file: 'unusable.js',
        servedFiles: [{ entry: null, file: 'unusable.js' }],
      }),
    ];
    const snapshot = seededSnapshot({
      remotes: {
        v4: seededRemote('./v4/'),
        'v45-one': seededRemote('./v45-one/'),
        'v45-many': seededRemote('./v45-many/'),
        'unusable-owner': seededRemote('http://['),
      },
      sharedExternals: sharedRepository('__GLOBAL__', packageName, [
        { tag: '1.0.0', action: 'share', host: false, remotes: participants },
      ]),
      generation: 'mixed',
    });

    const evidence = normalizeRegistryEvidence(snapshot);
    expect(evidence.participantDeclarations.map((declaration) => declaration.generation)).toEqual([
      'v4',
      'v4.5',
      'v4.5',
      'v4',
      'v4',
    ]);
    expect(evidence.entrypointCandidates).toHaveLength(6);

    const candidateFieldSets = evidence.entrypointCandidates.map((candidate) =>
      Object.keys(candidate).sort(),
    );
    expect(candidateFieldSets).toEqual(
      Array.from({ length: 6 }, () => [
        'candidateUrl',
        'candidateUrlState',
        'file',
        'id',
        'ordinal',
        'ownerRemote',
        'provenance',
        'sourceRecord',
        'specifier',
      ]),
    );
    expect(
      evidence.entrypointCandidates.map(
        ({ ownerRemote, specifier, file, candidateUrl, candidateUrlState }) => ({
          ownerRemote,
          specifier,
          file,
          candidateUrl,
          candidateUrlState,
        }),
      ),
    ).toEqual([
      {
        ownerRemote: 'v4',
        specifier: 'pkg',
        file: 'single.js',
        candidateUrl: 'https://seeded.example/app/v4/single.js',
        candidateUrlState: 'available',
      },
      {
        ownerRemote: 'v45-one',
        specifier: 'pkg',
        file: 'single.js',
        candidateUrl: 'https://seeded.example/app/v45-one/single.js',
        candidateUrlState: 'available',
      },
      {
        ownerRemote: 'v45-many',
        specifier: 'pkg',
        file: 'main.js',
        candidateUrl: 'https://seeded.example/app/v45-many/main.js',
        candidateUrlState: 'available',
      },
      {
        ownerRemote: 'v45-many',
        specifier: 'pkg/secondary',
        file: 'secondary.js',
        candidateUrl: 'https://seeded.example/app/v45-many/secondary.js',
        candidateUrlState: 'available',
      },
      {
        ownerRemote: 'missing-owner',
        specifier: 'pkg',
        file: 'missing.js',
        candidateUrl: null,
        candidateUrlState: 'missing-owner-scope',
      },
      {
        ownerRemote: 'unusable-owner',
        specifier: 'pkg',
        file: 'unusable.js',
        candidateUrl: null,
        candidateUrlState: 'unusable-owner-scope',
      },
    ]);

    const missing = evidence.entrypointCandidates[4];
    const unusable = evidence.entrypointCandidates[5];
    expect(missing.provenance.evidence).toContainEqual({
      source: 'snapshot',
      path: ['runtime', 'remotes', 'missing-owner', 'scopeUrl'],
      state: 'missing',
    });
    expect(unusable.provenance.evidence).toContainEqual({
      source: 'snapshot',
      path: ['runtime', 'remotes', 'unusable-owner', 'scopeUrl'],
      state: 'present',
    });
  });
});

describe('normalizeRegistryEvidence — lossless identity and diagnostics', () => {
  it('is byte-stable and preserves delimiter-bearing duplicate occurrences in source order', () => {
    const shareScope = 'scope|:[\"shared\"],';
    const packageName = 'pkg|:[\"name\"],';
    const participantName = 'remote|:[\"owner\"],';
    const file = 'same|:[\"file\"].js';
    // Both source spellings are intentional here: canonical normalization must
    // retain duplicate-looking raw evidence even when the collector normally
    // rejects this seeded shape before it reaches SnapshotV1.
    const duplicateParticipant = seededParticipant(participantName, {
      file,
      entries: { [packageName]: file },
      servedFiles: [
        { entry: null, file },
        { entry: packageName, file },
      ],
      generation: 'v4.5',
    });
    const duplicateVersion: ExternalVersionV1 = {
      tag: '1.0.0|:[\"tag\"],',
      action: 'share',
      host: false,
      remotes: [duplicateParticipant, duplicateParticipant],
    };
    const snapshot = seededSnapshot({
      remotes: { [participantName]: seededRemote('./owner/') },
      sharedExternals: sharedRepository(shareScope, packageName, [
        duplicateVersion,
        duplicateVersion,
      ]),
      generation: 'v4.5',
    });

    const first = normalizeRegistryEvidence(snapshot);
    const second = normalizeRegistryEvidence(snapshot);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));

    expect(
      first.sharedExternals.map(({ shareScope: scope, packageName: name }) => [scope, name]),
    ).toEqual([[shareScope, packageName]]);
    expect(first.versionRegistrations).toHaveLength(2);
    expect(first.versionRegistrations.map((registration) => registration.ordinal)).toEqual([0, 1]);
    expect(first.participantDeclarations).toHaveLength(4);
    expect(first.participantDeclarations.map((declaration) => declaration.ordinal)).toEqual([
      0, 1, 0, 1,
    ]);
    expect(first.entrypointCandidates).toHaveLength(8);
    expect(first.entrypointCandidates.map((candidate) => candidate.ordinal)).toEqual([
      0, 1, 0, 1, 0, 1, 0, 1,
    ]);
    expect(
      new Set(
        first.entrypointCandidates.map((candidate) =>
          JSON.stringify([candidate.ownerRemote, candidate.specifier, candidate.file]),
        ),
      ).size,
    ).toBe(1);

    for (const records of [
      first.sharedExternals,
      first.versionRegistrations,
      first.participantDeclarations,
      first.entrypointCandidates,
    ]) {
      expect(new Set(records.map((record) => record.id)).size).toBe(records.length);
    }
    expect(first.sharedExternals[0].versionRegistrationIds).toEqual(
      first.versionRegistrations.map((registration) => registration.id),
    );
    for (const [index, registration] of first.versionRegistrations.entries()) {
      expect(registration.participantDeclarationIds).toEqual(
        first.participantDeclarations
          .slice(index * 2, index * 2 + 2)
          .map((declaration) => declaration.id),
      );
    }
    for (const [index, declaration] of first.participantDeclarations.entries()) {
      expect(declaration.entrypointCandidateIds).toEqual(
        first.entrypointCandidates.slice(index * 2, index * 2 + 2).map((candidate) => candidate.id),
      );
    }

    const delimiterCollisionEvidence = normalizeRegistryEvidence(
      seededSnapshot({
        sharedExternals: {
          'scope|part': { pkg: { dirty: false, versions: [] } },
          scope: { 'part|pkg': { dirty: false, versions: [] } },
        },
      }),
    );
    expect(delimiterCollisionEvidence.sharedExternals.map((record) => record.id)).toHaveLength(2);
    expect(
      new Set(delimiterCollisionEvidence.sharedExternals.map((record) => record.id)).size,
    ).toBe(2);
  });

  it('treats an explicit undefined anchor as missing in a hand-seeded snapshot', () => {
    const participant = seededParticipant('owner', {
      pool: undefined,
      servedBy: 'owner',
    });
    expect(Object.hasOwn(participant, 'pool')).toBe(true);

    const evidence = normalizeRegistryEvidence(
      seededSnapshot({
        sharedExternals: sharedRepository('__GLOBAL__', 'pkg', [
          { tag: '1.0.0', action: 'share', host: false, remotes: [participant] },
        ]),
      }),
    );
    const declaration = evidence.participantDeclarations[0];
    const participantPath = [
      'runtime',
      'sharedExternals',
      '__GLOBAL__',
      'pkg',
      'versions',
      0,
      'remotes',
      0,
    ];

    expect(declaration).toMatchObject({ pool: null, servedBy: 'owner', poolCause: null });
    expect(declaration.provenance.evidence.slice(-3, -1)).toEqual([
      {
        source: 'snapshot',
        path: [...participantPath, 'pool'],
        state: 'missing',
      },
      {
        source: 'snapshot',
        path: [...participantPath, 'servedBy'],
        state: 'present',
      },
    ]);
  });

  it('retains an unknown raw action, emits its diagnostic, and keeps all evidence explicit', () => {
    const participant = seededParticipant('owner', {
      file: 'shared.js',
      servedFiles: [{ entry: null, file: 'shared.js' }],
    });
    const scopedExternals: ScopedExternalsV1 = {
      owner: {
        private: {
          tag: '2.0.0',
          bundle: null,
          entries: { private: 'private.js' },
        },
      },
    };
    const snapshot = seededSnapshot({
      remotes: { owner: seededRemote('./owner/') },
      sharedExternals: sharedRepository('__GLOBAL__', 'shared', [
        {
          tag: '1.0.0',
          action: 'future-action|raw',
          host: false,
          remotes: [participant],
        },
      ]),
      scopedExternals,
      generation: 'v4',
    });

    const evidence = normalizeRegistryEvidence(snapshot);
    expect(evidence.versionRegistrations).toHaveLength(1);
    expect(evidence.versionRegistrations[0]).toMatchObject({
      action: 'unknown',
      rawAction: 'future-action|raw',
    });
    expect(evidence.diagnostics).toHaveLength(1);
    expect(evidence.diagnostics[0]).toMatchObject({
      code: 'unknown-action',
      severity: 'warning',
      versionRegistrationId: evidence.versionRegistrations[0].id,
      rawValue: 'future-action|raw',
      message: 'Unrecognized shared-external action; raw value was preserved.',
    });
    expect(
      evidence.participantDeclarations.map(({ pool, servedBy }) => ({ pool, servedBy })),
    ).toEqual([{ pool: null, servedBy: null }]);
    expect(evidence.participantDeclarations[0].provenance.evidence).toEqual(
      expect.arrayContaining([
        {
          source: 'snapshot',
          path: [
            'runtime',
            'sharedExternals',
            '__GLOBAL__',
            'shared',
            'versions',
            0,
            'remotes',
            0,
            'pool',
          ],
          state: 'missing',
        },
        {
          source: 'snapshot',
          path: [
            'runtime',
            'sharedExternals',
            '__GLOBAL__',
            'shared',
            'versions',
            0,
            'remotes',
            0,
            'servedBy',
          ],
          state: 'missing',
        },
      ]),
    );
    expectNonemptyEvidence(evidence);
  });
});
