/**
 * Pure effective-consumer resolution specs (Task 3): import-map matching,
 * honest outcome states, consumer grouping, provenance, and hostile keys.
 */
import { FIXTURES } from 'devtools-bridge';

import type { EffectiveMap } from '../federation-model';
import { mergeDocumentMaps, resolveUrl } from '../merge-document-maps';
import { registryEvidenceId } from './ids';
import type {
  CanonicalRegistryEvidence,
  EffectiveConsumerResolution,
  EvidenceProvenance,
} from './model';
import { normalizeRegistryEvidence } from './normalize-registry-evidence';
import { resolveEffectiveConsumerBindings } from './resolve-effective-consumer-bindings';

const PAGE_URL = 'https://seeded.example/app/';
const EMPTY_PROVENANCE: EvidenceProvenance = { evidence: [] };

interface Claim {
  consumerRemote: string;
  specifier: string;
}

function evidenceFor(claims: readonly Claim[]): CanonicalRegistryEvidence {
  const grouped = new Map<string, string[]>();
  for (const claim of claims) {
    const consumers = grouped.get(claim.specifier) ?? [];
    consumers.push(claim.consumerRemote);
    grouped.set(claim.specifier, consumers);
  }

  const evidence: CanonicalRegistryEvidence = {
    sharedExternals: [],
    versionRegistrations: [],
    participantDeclarations: [],
    privateRegistrations: [],
    entrypointCandidates: [],
    diagnostics: [],
  };

  for (const [specifier, consumers] of grouped) {
    const sharedId = registryEvidenceId('shared-external', ['__GLOBAL__', specifier], 0);
    const versionId = registryEvidenceId('version-registration', [sharedId, '1.0.0', 'share'], 0);
    const participantIds = consumers.map((consumerRemote, index) => {
      const participantId = registryEvidenceId(
        'participant-declaration',
        [versionId, consumerRemote],
        index,
      );
      evidence.participantDeclarations.push({
        id: participantId,
        versionRegistrationId: versionId,
        ordinal: index,
        participant: consumerRemote,
        requiredVersion: '*',
        strictVersion: false,
        bundle: null,
        cached: false,
        generation: 'v4.5',
        pool: null,
        servedBy: null,
        poolCause: null,
        entrypointCandidateIds: [],
        provenance: EMPTY_PROVENANCE,
      });
      return participantId;
    });

    evidence.versionRegistrations.push({
      id: versionId,
      sharedExternalId: sharedId,
      ordinal: 0,
      tag: '1.0.0',
      action: 'share',
      rawAction: 'share',
      host: false,
      participantDeclarationIds: participantIds,
      provenance: EMPTY_PROVENANCE,
    });
    evidence.sharedExternals.push({
      id: sharedId,
      ordinal: 0,
      shareScope: '__GLOBAL__',
      packageName: specifier,
      dirty: false,
      poolName: null,
      versionRegistrationIds: [versionId],
      provenance: EMPTY_PROVENANCE,
    });
  }
  return evidence;
}

function ownRecord(entries: readonly (readonly [string, string])[]): Record<string, string> {
  return Object.fromEntries(entries);
}

function seededMap(
  options: {
    imports?: readonly (readonly [string, string])[];
    scopes?: readonly (readonly [string, readonly (readonly [string, string])[]])[];
    integrity?: readonly (readonly [string, string])[];
  } = {},
): EffectiveMap {
  return {
    imports: ownRecord(options.imports ?? []),
    scopes: Object.fromEntries(
      (options.scopes ?? []).map(([scope, entries]) => [scope, ownRecord(entries)]),
    ),
    integrity: ownRecord(options.integrity ?? []),
  };
}

function byConsumer(
  resolutions: readonly EffectiveConsumerResolution[],
  consumerRemote: string,
): EffectiveConsumerResolution {
  const result = resolutions.find((candidate) =>
    candidate.consumerRemotes.includes(consumerRemote),
  );
  expect(result).toBeDefined();
  return result!;
}

describe('resolveEffectiveConsumerBindings — import-map lookup (T3-AC-01)', () => {
  it('applies exact/prefix precedence and falls through scopes from specific to top-level', () => {
    const exactScope = 'https://seeded.example/exact-consumer.js';
    const outerScope = 'https://seeded.example/remotes/';
    const deepScope = 'https://seeded.example/remotes/deep/';
    const prefixScope = 'https://seeded.example/prefix/';
    const consumerScopes = new Map<string, string>([
      ['exact-over-prefix', 'https://seeded.example/other/'],
      ['longest-prefix', `${deepScope}consumer.js`],
      ['non-prefix', 'https://seeded.example/other/'],
      ['invalid-prefix', `${deepScope}consumer.js`],
      ['invalid-exact', `${deepScope}consumer.js`],
      ['invalid-expansion', `${deepScope}consumer.js`],
      ['blocked-prefix', `${deepScope}consumer.js`],
      ['exact-scope', exactScope],
      ['scope-boundary', `${exactScope}/child.js`],
      ['slash-scope', `${prefixScope}child/module.js`],
      ['longest-scope', `${deepScope}consumer.js`],
      ['scope-fallback', `${deepScope}consumer.js`],
      ['top-fallback', `${deepScope}consumer.js`],
    ]);
    const effectiveMap = seededMap({
      imports: [
        ['pkg/', './top/pkg/'],
        ['pkg/exact', './top/exact.js'],
        ['plain', './must-not-prefix.js'],
        ['broken/', './not-a-directory.js'],
        ['invalid-exact', './top-invalid-exact-must-not-fallback.js'],
        ['pkg/http://[', './top-invalid-expansion-must-not-fallback.js'],
        ['pkg/../escape', './must-not-fallback.js'],
        ['top-fallback', './top/fallback.js'],
        ['scope-boundary', './top/scope-boundary.js'],
      ],
      scopes: [
        [
          exactScope,
          [
            ['exact-scope', './scoped/exact.js'],
            ['scope-boundary', './scoped/must-not-prefix.js'],
          ],
        ],
        [prefixScope, [['slash-scope', './scoped/prefix.js']]],
        [
          outerScope,
          [
            ['longest-scope', './outer-choice.js'],
            ['scope-fallback', './outer-fallback.js'],
            ['pkg/../escape', './outer-must-not-fallback.js'],
            ['pkg/http://[', './outer-invalid-expansion-must-not-fallback.js'],
            ['broken/deep/child.js', './outer-prefix-must-not-fallback.js'],
          ],
        ],
        [
          deepScope,
          [
            ['pkg/', './deep/general/'],
            ['pkg/deep/', './deep/specific/'],
            ['broken/', './deep-valid/'],
            ['broken/deep/', './deep-not-a-directory.js'],
            ['invalid-exact', 'http://['],
            ['longest-scope', './deep-choice.js'],
          ],
        ],
      ],
    });
    const resolutions = resolveEffectiveConsumerBindings(
      evidenceFor([
        { consumerRemote: 'exact-over-prefix', specifier: 'pkg/exact' },
        { consumerRemote: 'longest-prefix', specifier: 'pkg/deep/item.js' },
        { consumerRemote: 'non-prefix', specifier: 'plain-child' },
        { consumerRemote: 'invalid-prefix', specifier: 'broken/deep/child.js' },
        { consumerRemote: 'invalid-exact', specifier: 'invalid-exact' },
        { consumerRemote: 'invalid-expansion', specifier: 'pkg/http://[' },
        { consumerRemote: 'blocked-prefix', specifier: 'pkg/../escape' },
        { consumerRemote: 'exact-scope', specifier: 'exact-scope' },
        { consumerRemote: 'scope-boundary', specifier: 'scope-boundary' },
        { consumerRemote: 'slash-scope', specifier: 'slash-scope' },
        { consumerRemote: 'longest-scope', specifier: 'longest-scope' },
        { consumerRemote: 'scope-fallback', specifier: 'scope-fallback' },
        { consumerRemote: 'top-fallback', specifier: 'top-fallback' },
      ]),
      {
        resolutionBaseUrl: PAGE_URL,
        mapAvailable: true,
        effectiveMap,
        consumerScopeUrlByRemote: consumerScopes,
      },
    );

    expect(byConsumer(resolutions, 'exact-over-prefix')).toMatchObject({
      status: 'mapped',
      targetUrl: 'https://seeded.example/app/top/exact.js',
      mapEntry: { scope: null, specifier: 'pkg/exact', match: 'exact' },
    });
    expect(byConsumer(resolutions, 'longest-prefix')).toMatchObject({
      status: 'mapped',
      targetUrl: 'https://seeded.example/app/deep/specific/item.js',
      mapEntry: {
        scope: deepScope,
        specifier: 'pkg/deep/',
        target: './deep/specific/',
        match: 'prefix',
      },
    });
    expect(byConsumer(resolutions, 'non-prefix')).toMatchObject({ status: 'unmapped' });
    expect(byConsumer(resolutions, 'invalid-prefix')).toMatchObject({
      status: 'blocked',
      targetUrl: null,
      blockedReason: 'prefix-target-missing-trailing-slash',
      mapEntry: {
        scope: deepScope,
        specifier: 'broken/deep/',
        target: './deep-not-a-directory.js',
        match: 'prefix',
      },
    });
    expect(byConsumer(resolutions, 'invalid-exact')).toMatchObject({
      status: 'blocked',
      targetUrl: null,
      blockedReason: 'invalid-target-url',
      mapEntry: {
        scope: deepScope,
        specifier: 'invalid-exact',
        target: 'http://[',
        match: 'exact',
      },
    });
    expect(byConsumer(resolutions, 'invalid-expansion')).toMatchObject({
      status: 'blocked',
      targetUrl: null,
      blockedReason: 'invalid-prefix-expansion',
      mapEntry: {
        scope: deepScope,
        specifier: 'pkg/',
        target: './deep/general/',
        match: 'prefix',
      },
    });
    expect(byConsumer(resolutions, 'blocked-prefix')).toMatchObject({
      status: 'blocked',
      targetUrl: null,
      blockedReason: 'prefix-target-backtracking',
      mapEntry: {
        scope: deepScope,
        specifier: 'pkg/',
        target: './deep/general/',
        match: 'prefix',
      },
    });
    expect(byConsumer(resolutions, 'exact-scope')).toMatchObject({
      status: 'mapped',
      mapEntry: { scope: exactScope, match: 'exact' },
    });
    expect(byConsumer(resolutions, 'scope-boundary')).toMatchObject({
      status: 'mapped',
      targetUrl: 'https://seeded.example/app/top/scope-boundary.js',
      mapEntry: { scope: null, match: 'exact' },
    });
    expect(byConsumer(resolutions, 'slash-scope')).toMatchObject({
      status: 'mapped',
      mapEntry: { scope: prefixScope, match: 'exact' },
    });
    expect(byConsumer(resolutions, 'longest-scope')).toMatchObject({
      status: 'mapped',
      targetUrl: 'https://seeded.example/app/deep-choice.js',
      mapEntry: { scope: deepScope },
    });
    expect(byConsumer(resolutions, 'scope-fallback')).toMatchObject({
      status: 'mapped',
      targetUrl: 'https://seeded.example/app/outer-fallback.js',
      mapEntry: { scope: outerScope },
    });
    expect(byConsumer(resolutions, 'top-fallback')).toMatchObject({
      status: 'mapped',
      targetUrl: 'https://seeded.example/app/top/fallback.js',
      mapEntry: { scope: null },
    });
  });
});

describe('resolveEffectiveConsumerBindings — honest states (T3-AC-02)', () => {
  it('distinguishes missing channels/consumer scopes from a map miss without a page fallback', () => {
    const fallbackTrap = seededMap({
      imports: [['pkg', './top-level.js']],
      scopes: [[PAGE_URL, [['pkg', './page-scope.js']]]],
    });
    const knownConsumerScope = new Map([['known', 'https://seeded.example/remote/']]);

    const missingMap = resolveEffectiveConsumerBindings(
      evidenceFor([{ consumerRemote: 'known', specifier: 'pkg' }]),
      {
        resolutionBaseUrl: PAGE_URL,
        mapAvailable: false,
        effectiveMap: fallbackTrap,
        consumerScopeUrlByRemote: knownConsumerScope,
      },
    )[0];
    expect(missingMap).toMatchObject({
      status: 'unknown',
      targetUrl: null,
      mapEntry: null,
      unknownReasons: ['missing-map-channel'],
    });

    const missingConsumerScope = resolveEffectiveConsumerBindings(
      evidenceFor([{ consumerRemote: 'missing', specifier: 'pkg' }]),
      {
        resolutionBaseUrl: PAGE_URL,
        mapAvailable: true,
        effectiveMap: fallbackTrap,
        consumerScopeUrlByRemote: new Map(),
      },
    )[0];
    expect(missingConsumerScope).toMatchObject({
      consumerScopeUrl: null,
      status: 'unknown',
      targetUrl: null,
      mapEntry: null,
      unknownReasons: ['missing-consumer-scope'],
    });
    expect(missingConsumerScope.scopeContextKey).not.toContain(PAGE_URL);

    const availableMiss = resolveEffectiveConsumerBindings(
      evidenceFor([{ consumerRemote: 'known', specifier: 'absent' }]),
      {
        resolutionBaseUrl: PAGE_URL,
        mapAvailable: true,
        effectiveMap: seededMap(),
        consumerScopeUrlByRemote: knownConsumerScope,
      },
    )[0];
    expect(availableMiss).toMatchObject({ status: 'unmapped', targetUrl: null, mapEntry: null });

    const bothMissing = resolveEffectiveConsumerBindings(
      evidenceFor([{ consumerRemote: 'missing', specifier: 'pkg' }]),
      {
        resolutionBaseUrl: PAGE_URL,
        mapAvailable: false,
        effectiveMap: fallbackTrap,
        consumerScopeUrlByRemote: new Map(),
      },
    )[0];
    expect(bothMissing.status).toBe('unknown');
    if (bothMissing.status === 'unknown') {
      expect(new Set(bothMissing.unknownReasons)).toEqual(
        new Set(['missing-map-channel', 'missing-consumer-scope']),
      );
    }
  });

  it('keeps a URL-like specifier without an import-map binding unmapped', () => {
    const [result] = resolveEffectiveConsumerBindings(
      evidenceFor([
        { consumerRemote: 'known', specifier: 'https://cdn.example.test/direct-module.js' },
      ]),
      {
        resolutionBaseUrl: PAGE_URL,
        mapAvailable: true,
        effectiveMap: seededMap(),
        consumerScopeUrlByRemote: new Map([['known', 'https://seeded.example/remote/consumer.js']]),
      },
    );

    expect(result).toMatchObject({
      specifier: 'https://cdn.example.test/direct-module.js',
      status: 'unmapped',
      targetUrl: null,
      mapEntry: null,
    });
  });
});

describe('resolveEffectiveConsumerBindings — consumer identity (T3-AC-03)', () => {
  it('collapses aliases at one scope context and retains distinct co-declared contexts', () => {
    const aliasConsumerScope = 'https://seeded.example/shared-consumer/';
    const aliases = resolveEffectiveConsumerBindings(
      evidenceFor([
        { consumerRemote: 'z-alias', specifier: 'pkg' },
        { consumerRemote: 'a-alias', specifier: 'pkg' },
        { consumerRemote: 'a-alias', specifier: 'pkg' },
      ]),
      {
        resolutionBaseUrl: PAGE_URL,
        mapAvailable: true,
        effectiveMap: seededMap({ imports: [['pkg', './pkg.js']] }),
        consumerScopeUrlByRemote: new Map([
          ['z-alias', aliasConsumerScope],
          ['a-alias', aliasConsumerScope],
        ]),
      },
    );
    expect(aliases).toHaveLength(1);
    expect(aliases[0]).toMatchObject({
      consumerScopeUrl: aliasConsumerScope,
      specifier: 'pkg',
      consumerRemotes: ['a-alias', 'z-alias'],
      status: 'mapped',
    });

    const snapshot = FIXTURES['co-declared-share'];
    const map = mergeDocumentMaps(snapshot.importMaps!.documentMaps, snapshot.capture.pageUrl);
    const consumerScopeUrlByRemote = new Map(
      Object.entries(snapshot.runtime!.remotes).map(([remote, value]) => [
        remote,
        resolveUrl(value.scopeUrl, snapshot.capture.pageUrl),
      ]),
    );
    const distinct = resolveEffectiveConsumerBindings(normalizeRegistryEvidence(snapshot), {
      resolutionBaseUrl: snapshot.capture.pageUrl,
      mapAvailable: true,
      effectiveMap: map,
      consumerScopeUrlByRemote,
    });
    expect(distinct).toHaveLength(2);
    expect(distinct.map((result) => result.consumerScopeUrl).sort()).toEqual([
      'http://localhost:4300/mfe1/',
      'http://localhost:4300/mfe2/',
    ]);
    expect(distinct.map((result) => result.consumerRemotes)).toEqual([['mfe1'], ['mfe2']]);
  });
});

describe('resolveEffectiveConsumerBindings — provenance and determinism (T3-AC-04)', () => {
  it('retains the contributing entry and emits byte-stable IDs and ordering', () => {
    const consumerScopeUrl = 'https://seeded.example/consumer/';
    const target = 'https://seeded.example/app/mapped.js';
    const evidence = evidenceFor([
      { consumerRemote: 'z-consumer', specifier: 'z-package' },
      { consumerRemote: 'a-consumer', specifier: 'a-package' },
    ]);
    const context = {
      resolutionBaseUrl: PAGE_URL,
      mapAvailable: true,
      effectiveMap: seededMap({
        scopes: [
          [
            consumerScopeUrl,
            [
              ['z-package', './mapped.js'],
              ['a-package', './mapped.js'],
            ],
          ],
        ],
        integrity: [[target, 'sha384-seeded']],
      }),
      consumerScopeUrlByRemote: new Map([
        ['z-consumer', consumerScopeUrl],
        ['a-consumer', consumerScopeUrl],
      ]),
    };

    const first = resolveEffectiveConsumerBindings(evidence, context);
    const second = resolveEffectiveConsumerBindings(evidence, context);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.map((result) => result.specifier)).toEqual(['a-package', 'z-package']);
    expect(first.map((result) => result.id)).toEqual(second.map((result) => result.id));
    for (const result of first) {
      expect(result).toMatchObject({
        status: 'mapped',
        targetUrl: target,
        hasIntegrity: true,
        mapEntry: {
          source: 'effective-import-map',
          scope: consumerScopeUrl,
          specifier: result.specifier,
          target: './mapped.js',
          match: 'exact',
        },
      });
    }
  });
});

describe('resolveEffectiveConsumerBindings — hostile keys (T3-AC-05)', () => {
  it('uses own properties and structural keys for prototype-like and delimiter-bearing inputs', () => {
    const hostileScope = 'https://seeded.example/__proto__|scope/';
    const delimiterScopeA = 'https://seeded.example/collision|part';
    const delimiterScopeB = 'https://seeded.example/collision';
    const results = resolveEffectiveConsumerBindings(
      evidenceFor([
        { consumerRemote: 'prototype', specifier: '__proto__|package' },
        { consumerRemote: 'prototype-scope', specifier: 'constructor' },
        { consumerRemote: 'inherited', specifier: 'toString' },
        { consumerRemote: 'delimiter-a', specifier: 'tail' },
        { consumerRemote: 'delimiter-b', specifier: 'part|tail' },
        { consumerRemote: 'missing|part', specifier: 'tail' },
        { consumerRemote: 'missing', specifier: 'part|tail' },
      ]),
      {
        resolutionBaseUrl: PAGE_URL,
        mapAvailable: true,
        effectiveMap: seededMap({
          imports: [
            ['tail', './tail.js'],
            ['part|tail', './part-tail.js'],
          ],
          scopes: [
            [hostileScope, [['__proto__|package', './prototype.js']]],
            ['__proto__', [['constructor', './constructor.js']]],
          ],
        }),
        consumerScopeUrlByRemote: new Map([
          ['prototype', `${hostileScope}child.js`],
          ['prototype-scope', '__proto__'],
          ['inherited', `${hostileScope}child.js`],
          ['delimiter-a', delimiterScopeA],
          ['delimiter-b', delimiterScopeB],
        ]),
      },
    );

    expect(byConsumer(results, 'prototype')).toMatchObject({
      status: 'mapped',
      targetUrl: 'https://seeded.example/app/prototype.js',
      mapEntry: { scope: hostileScope, specifier: '__proto__|package' },
    });
    expect(byConsumer(results, 'inherited')).toMatchObject({ status: 'unmapped' });
    expect(byConsumer(results, 'prototype-scope')).toMatchObject({
      status: 'mapped',
      targetUrl: 'https://seeded.example/app/constructor.js',
      mapEntry: { scope: '__proto__', specifier: 'constructor' },
    });

    const delimiterResults = [
      byConsumer(results, 'delimiter-a'),
      byConsumer(results, 'delimiter-b'),
    ];
    expect(delimiterResults.map((result) => result.targetUrl).sort()).toEqual([
      'https://seeded.example/app/part-tail.js',
      'https://seeded.example/app/tail.js',
    ]);
    expect(new Set(delimiterResults.map((result) => result.id)).size).toBe(2);

    const missingResults = [byConsumer(results, 'missing|part'), byConsumer(results, 'missing')];
    expect(missingResults.every((result) => result.status === 'unknown')).toBe(true);
    expect(new Set(missingResults.map((result) => result.scopeContextKey)).size).toBe(2);
    expect(new Set(missingResults.map((result) => result.id)).size).toBe(2);
  });
});

describe('resolveEffectiveConsumerBindings — claims-set domain (T4-AC-02/T4-AC-03)', () => {
  it('resolves every candidate specifier and private registration in its consumer context', () => {
    const evidence = evidenceFor([{ consumerRemote: 'consumer', specifier: 'pkg' }]);
    const declaration = evidence.participantDeclarations[0];
    const secondaryId = registryEvidenceId(
      'entrypoint-candidate',
      [declaration.id, 'pkg/sub', 'sub.js'],
      0,
    );
    evidence.entrypointCandidates.push({
      id: secondaryId,
      sourceRecord: { kind: 'participant-entry', participantDeclarationId: declaration.id },
      ordinal: 0,
      ownerRemote: 'consumer',
      specifier: 'pkg/sub',
      file: 'sub.js',
      candidateUrl: 'https://seeded.example/app/consumer/sub.js',
      candidateUrlState: 'available',
      provenance: EMPTY_PROVENANCE,
    });
    declaration.entrypointCandidateIds.push(secondaryId);

    const privateId = registryEvidenceId('private-registration', ['owner', 'private-pkg'], 0);
    const privateCandidateId = registryEvidenceId(
      'entrypoint-candidate',
      [privateId, 'private-pkg', 'p.js'],
      0,
    );
    evidence.privateRegistrations.push({
      id: privateId,
      ordinal: 0,
      ownerRemote: 'owner',
      packageName: 'private-pkg',
      tag: '1.0.0',
      bundle: null,
      entrypointCandidateIds: [privateCandidateId],
      provenance: EMPTY_PROVENANCE,
    });
    evidence.entrypointCandidates.push({
      id: privateCandidateId,
      sourceRecord: { kind: 'private-entry', privateRegistrationId: privateId },
      ordinal: 0,
      ownerRemote: 'owner',
      specifier: 'private-pkg',
      file: 'p.js',
      candidateUrl: 'https://seeded.example/app/owner/p.js',
      candidateUrlState: 'available',
      provenance: EMPTY_PROVENANCE,
    });

    const results = resolveEffectiveConsumerBindings(evidence, {
      resolutionBaseUrl: PAGE_URL,
      mapAvailable: true,
      effectiveMap: seededMap({
        imports: [
          ['pkg', './pkg.js'],
          ['pkg/sub', './sub.js'],
          ['private-pkg', './p.js'],
        ],
      }),
      consumerScopeUrlByRemote: new Map([
        ['consumer', 'https://seeded.example/app/consumer/'],
        ['owner', 'https://seeded.example/app/owner/'],
      ]),
    });

    const byKey = (consumerRemote: string, specifier: string) =>
      results.find(
        (result) =>
          result.consumerRemotes.includes(consumerRemote) && result.specifier === specifier,
      );
    expect(results).toHaveLength(3);
    expect(byKey('consumer', 'pkg')).toMatchObject({ status: 'mapped' });
    expect(byKey('consumer', 'pkg/sub')).toMatchObject({
      status: 'mapped',
      targetUrl: 'https://seeded.example/app/sub.js',
    });
    expect(byKey('owner', 'private-pkg')).toMatchObject({
      status: 'mapped',
      targetUrl: 'https://seeded.example/app/p.js',
    });
  });
});
