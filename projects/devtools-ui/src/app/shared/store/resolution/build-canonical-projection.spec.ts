/**
 * Canonical-projection specs (Task 6): the raw-free surface shape with every
 * copy role, disposition, relation, claim, chunk, and provenance retained
 * (T6-AC-04); consumer-copy relations keyed `(consumerRemote, copyId)` that
 * never collapse specifier paths; completeness totals, per-consumer counts,
 * and issue records without double-counting a binding shared by several
 * consumer contexts (T6-AC-05); determinism; and the pinned public surface
 * of the resolution layer — no graph model or delivery inference (T6-AC-06).
 */
import { FIXTURES, NF_HOST, type SnapshotV1 } from 'devtools-bridge';

import { mergeDocumentMaps, resolveUrl } from '../merge-document-maps';
import { buildCanonicalProjection } from './build-canonical-projection';
import { attachBundleClaimIds, deriveBundleClaims } from './derive-bundle-claims';
import { deriveChunkGroups } from './derive-chunk-groups';
import { deriveCopyGroupingFacets, deriveTagPools } from './derive-grouping-facets';
import { derivePackageVerdicts } from './derive-package-verdicts';
import { derivePoolFamilies } from './derive-pool-families';
import { deriveResolutionClaims } from './derive-declaration-claims';
import * as resolutionBarrel from './index';
import { attachCopyIds, materializeResolvedCopies } from './materialize-resolved-copies';
import { aggregatePackageMeasures } from './aggregate-package-measures';
import { normalizeRegistryEvidence } from './normalize-registry-evidence';
import type { CanonicalResolutionProjection } from './projection-model';
import { resolveEffectiveConsumerBindings } from './resolve-effective-consumer-bindings';

const PAGE_URL = 'https://seeded.example/app/';

interface SeedParticipant {
  name: string;
  entries: Record<string, string>;
  bundle?: string;
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
  sharedChunks?: Record<string, Record<string, string[]>>;
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
            cached: false,
            bundle: participant.bundle ?? null,
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
      scopedExternals: {},
      sharedExternals,
      sharedChunks: seed.sharedChunks ?? {},
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

/** Mirrors the ingest wiring: the complete canonical pipeline plus assembly. */
function project(snapshot: SnapshotV1): CanonicalResolutionProjection {
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
  const copies = materializeResolvedCopies(evidence, resolutions, claims, {
    snapshotIdentity: `${snapshot.capture.capturedAt}|${snapshot.capture.pageUrl}`,
  });
  const declarationResolutionClaims = attachCopyIds(claims.declarationResolutionClaims, copies);
  const chunkGroups = deriveChunkGroups(evidence, snapshot.runtime?.sharedChunks ?? {});
  const bundleClaims = deriveBundleClaims(evidence, claims, copies, chunkGroups);
  const attachedCopies = attachBundleClaimIds(copies, bundleClaims);
  const tagPools = deriveTagPools(evidence);
  const projectedRemotes = Object.entries(snapshot.runtime?.remotes ?? {}).map(
    ([name, remote]) => ({
      name,
      isHost: name === NF_HOST,
      scopeUrl: remote.scopeUrl,
      resolvedScopeUrl: resolveUrl(remote.scopeUrl, pageUrl),
    }),
  );
  return buildCanonicalProjection({
    remotes: projectedRemotes,
    resolutions,
    claims: { ...claims, declarationResolutionClaims },
    copies: attachedCopies,
    chunkGroups,
    bundleClaims,
    packageMeasures: aggregatePackageMeasures(
      evidence,
      declarationResolutionClaims,
      attachedCopies,
    ),
    tagPools,
    copyGroupingFacets: deriveCopyGroupingFacets(
      evidence,
      attachedCopies,
      bundleClaims,
      tagPools.tagPools,
    ),
    poolFamilies: derivePoolFamilies(evidence, tagPools.tagPools, NF_HOST),
    packageScopeVerdicts: derivePackageVerdicts(evidence, {
      claims: declarationResolutionClaims,
      copies: attachedCopies,
      resolutions,
      bundleClaims,
      chunkGroups,
      remotes: projectedRemotes,
    }),
  });
}

describe('buildCanonicalProjection — raw-free surface (T6-AC-04)', () => {
  it('pins the projection shape: no raw snapshot, cache, or sharedRows surface', () => {
    const projection = project(FIXTURES['pooling-anchor']);

    expect(Object.keys(projection).sort()).toEqual([
      'bundleClaims',
      'chunkGroups',
      'completeness',
      'consumerRelations',
      'copies',
      'copyGroupingFacets',
      'declarationResolutionClaims',
      'observedTargetProviders',
      'orphanPoolTags',
      'packageMeasures',
      'packageScopeVerdicts',
      'poolFamilies',
      'registryServingSlotClaims',
      'remotes',
      'sourceComparisons',
      'tagPools',
    ]);
    expect(Object.keys(projection.completeness).sort()).toEqual([
      'byConsumer',
      'consumerIssues',
      'total',
    ]);
  });

  it('retains copy roles, dispositions, relation ids, claims, and provenance', () => {
    const projection = project(FIXTURES['pooling-anchor']);

    expect(projection.copies.length).toBeGreaterThan(0);
    for (const copy of projection.copies) {
      expect(copy.effectiveRoles.length).toBeGreaterThan(0);
      expect(copy.sourceDisposition).toEqual(expect.any(String));
      expect(copy.provenance.evidence.length).toBeGreaterThan(0);
      expect(Array.isArray(copy.bundleClaimIds)).toBe(true);
    }
    const copyIds = new Set(projection.copies.map((copy) => copy.id));
    const claimIds = new Set(projection.declarationResolutionClaims.map((claim) => claim.id));
    const chunkGroupIds = new Set(projection.chunkGroups.map((group) => group.id));
    const bundleClaimIds = new Set(projection.bundleClaims.map((claim) => claim.id));
    for (const relation of projection.consumerRelations) {
      expect(copyIds.has(relation.copyId)).toBe(true);
      for (const claimId of relation.claimIds) {
        expect(claimIds.has(claimId)).toBe(true);
      }
      expect(relation.mappingStates.length).toBeGreaterThan(0);
    }
    for (const bundleClaim of projection.bundleClaims) {
      expect(copyIds.has(bundleClaim.copyId)).toBe(true);
      for (const chunkGroupId of bundleClaim.chunkGroupIds) {
        expect(chunkGroupIds.has(chunkGroupId)).toBe(true);
      }
    }
    for (const copy of projection.copies) {
      for (const bundleClaimId of copy.bundleClaimIds) {
        expect(bundleClaimIds.has(bundleClaimId)).toBe(true);
      }
    }
    // Every claim carries its copy link or an explicit null — never undefined.
    for (const claim of projection.declarationResolutionClaims) {
      expect(claim.copyId === null || copyIds.has(claim.copyId)).toBe(true);
    }
  });

  it('is deterministic: two builds from one snapshot are deep-equal', () => {
    expect(project(FIXTURES['pooling-anchor'])).toEqual(project(FIXTURES['pooling-anchor']));
  });
});

describe('buildCanonicalProjection — consumer-copy relations', () => {
  it('keys one relation per (consumerRemote, copyId) with all supporting ids and states', () => {
    const projection = project(FIXTURES['co-declared-share']);

    expect(projection.copies).toHaveLength(1);
    const [copy] = projection.copies;
    const relations = projection.consumerRelations.filter(
      (relation) => relation.copyId === copy.id,
    );
    expect(relations.map((relation) => relation.consumerRemote).sort()).toEqual(['mfe1', 'mfe2']);
    const byConsumer = new Map(relations.map((relation) => [relation.consumerRemote, relation]));
    expect(byConsumer.get('mfe1')?.mappingStates).toEqual(['own-selected']);
    expect(byConsumer.get('mfe2')?.mappingStates).toEqual(['not-selected']);
    for (const relation of relations) {
      expect(relation.claimIds).toHaveLength(1);
      expect(relation.effectiveResolutionIds).toHaveLength(1);
    }
  });

  it('retains every specifier path instead of collapsing to one edge', () => {
    const projection = project(
      seedSnapshot({
        remotes: { mfe1: './mfe1/' },
        shared: {
          __GLOBAL__: {
            pkg: [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [
                  { name: 'mfe1', entries: { pkg: 'pkg.js', 'pkg/extra': 'extra.js' } },
                ],
              },
            ],
          },
        },
        imports: { pkg: './mfe1/pkg.js', 'pkg/extra': './mfe1/extra.js' },
      }),
    );

    expect(projection.copies).toHaveLength(1);
    expect(projection.consumerRelations).toHaveLength(1);
    const [relation] = projection.consumerRelations;
    expect(relation.consumerRemote).toBe('mfe1');
    expect(relation.effectiveResolutionIds).toHaveLength(2);
    expect(relation.claimIds).toHaveLength(2);
  });
});

describe('buildCanonicalProjection — completeness (T6-AC-05)', () => {
  it('counts a binding shared by aliased consumers once in total but per consumer in byConsumer', () => {
    const projection = project(
      seedSnapshot({
        remotes: { alias1: './app/', alias2: './app/' },
        shared: {
          __GLOBAL__: {
            pkg: [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [
                  { name: 'alias1', entries: { pkg: 'pkg.js' } },
                  { name: 'alias2', entries: { pkg: 'pkg.js' } },
                ],
              },
            ],
          },
        },
      }),
    );

    expect(projection.completeness.total).toEqual({
      unknownResolutions: 0,
      unmappedResolutions: 1,
      blockedResolutions: 0,
      ambiguousSourceClaims: 0,
    });
    expect(projection.completeness.byConsumer['alias1'].unmappedResolutions).toBe(1);
    expect(projection.completeness.byConsumer['alias2'].unmappedResolutions).toBe(1);
    const issues = projection.completeness.consumerIssues;
    expect(issues).toHaveLength(2);
    expect(new Set(issues.map((issue) => issue.effectiveResolutionId)).size).toBe(1);
    expect(issues.map((issue) => issue.consumerRemote).sort()).toEqual(['alias1', 'alias2']);
    for (const issue of issues) {
      expect(issue.issues).toEqual(['unmapped-resolution']);
      expect(issue.ambiguousClaimIds).toEqual([]);
    }
  });

  it('exposes unknown, unmapped, blocked, and ambiguous results distinctly', () => {
    const projection = project(
      seedSnapshot({
        remotes: { mfe1: './mfe1/', mfe2: './mfe2/' },
        shared: {
          __GLOBAL__: {
            unmapped: [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [{ name: 'mfe1', entries: { unmapped: 'unmapped.js' } }],
              },
            ],
            blocked: [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [{ name: 'mfe1', entries: { blocked: 'blocked.js' } }],
              },
            ],
            orphaned: [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [{ name: 'missing-remote', entries: { orphaned: 'orphaned.js' } }],
              },
            ],
            ambiguous: [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [
                  { name: 'mfe1', entries: { ambiguous: '/shared/ambiguous.js' } },
                  { name: 'mfe2', entries: { ambiguous: '/shared/ambiguous.js' } },
                ],
              },
            ],
          },
        },
        imports: { blocked: 'http://[', ambiguous: '/shared/ambiguous.js' },
      }),
    );
    const { total, byConsumer, consumerIssues } = projection.completeness;

    expect(total.unmappedResolutions).toBe(1);
    expect(total.blockedResolutions).toBe(1);
    expect(total.unknownResolutions).toBe(1);
    expect(total.ambiguousSourceClaims).toBe(2);
    expect(byConsumer['mfe1']).toEqual({
      unknownResolutions: 0,
      unmappedResolutions: 1,
      blockedResolutions: 1,
      ambiguousSourceClaims: 1,
    });
    expect(byConsumer['mfe2']).toEqual({
      unknownResolutions: 0,
      unmappedResolutions: 0,
      blockedResolutions: 0,
      ambiguousSourceClaims: 1,
    });
    expect(byConsumer['missing-remote']).toEqual({
      unknownResolutions: 1,
      unmappedResolutions: 0,
      blockedResolutions: 0,
      ambiguousSourceClaims: 0,
    });
    const ambiguousIssues = consumerIssues.filter((issue) =>
      issue.issues.includes('ambiguous-source'),
    );
    expect(ambiguousIssues).toHaveLength(2);
    for (const issue of ambiguousIssues) {
      expect(issue.ambiguousClaimIds).toHaveLength(1);
    }
    const kinds = new Set(consumerIssues.flatMap((issue) => issue.issues));
    expect([...kinds].sort()).toEqual([
      'ambiguous-source',
      'blocked-resolution',
      'unknown-resolution',
      'unmapped-resolution',
    ]);
  });

  it('counts an ambiguous scope attribution once per binding and issues it to every consumer', () => {
    const projection = project(
      seedSnapshot({
        remotes: { alias1: './app/', alias2: './app/' },
        shared: {
          __GLOBAL__: {
            pkg: [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [
                  { name: 'alias1', entries: { pkg: 'pkg.js' } },
                  { name: 'alias2', entries: { pkg: 'pkg.js' } },
                ],
              },
            ],
          },
        },
        // The mapped target lies under the shared scope of both aliases but
        // matches no candidate URL: attribution stays ambiguous-scope.
        imports: { pkg: './app/override.js' },
      }),
    );
    const { total, byConsumer, consumerIssues } = projection.completeness;

    expect(total).toEqual({
      unknownResolutions: 0,
      unmappedResolutions: 0,
      blockedResolutions: 0,
      ambiguousSourceClaims: 1,
    });
    expect(byConsumer['alias1'].ambiguousSourceClaims).toBe(1);
    expect(byConsumer['alias2'].ambiguousSourceClaims).toBe(1);
    expect(consumerIssues).toHaveLength(2);
    expect(consumerIssues.map((issue) => issue.consumerRemote).sort()).toEqual([
      'alias1',
      'alias2',
    ]);
    for (const issue of consumerIssues) {
      expect(issue.issues).toEqual(['ambiguous-source']);
      // Scope-level ambiguity names no declaration claim.
      expect(issue.ambiguousClaimIds).toEqual([]);
    }
  });

  it('initializes explicit zero counts for a published remote without declarations', () => {
    const projection = project(
      seedSnapshot({
        remotes: { idle: './idle/', mfe1: './mfe1/' },
        shared: {
          __GLOBAL__: {
            pkg: [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [{ name: 'mfe1', entries: { pkg: 'pkg.js' } }],
              },
            ],
          },
        },
        imports: { pkg: './mfe1/pkg.js' },
      }),
    );

    expect(Object.keys(projection.completeness.byConsumer).sort()).toEqual(['idle', 'mfe1']);
    expect(projection.completeness.byConsumer['idle']).toEqual({
      unknownResolutions: 0,
      unmappedResolutions: 0,
      blockedResolutions: 0,
      ambiguousSourceClaims: 0,
    });
  });
});

describe('resolution layer surface (T6-AC-06)', () => {
  it('exports exactly the canonical pipeline — no graph model or builder', () => {
    const runtimeExports = Object.keys(resolutionBarrel).sort();

    expect(runtimeExports).toEqual([
      'aggregatePackageMeasures',
      'attachBundleClaimIds',
      'attachCopyIds',
      'buildCanonicalProjection',
      'deriveBundleClaims',
      'deriveChunkGroups',
      'deriveCopyGroupingFacets',
      'derivePackageVerdicts',
      'derivePoolFamilies',
      'deriveResolutionClaims',
      'deriveTagPools',
      'materializeResolvedCopies',
      'normalizeRegistryEvidence',
      'projectSharedRows',
      'resolveEffectiveConsumerBindings',
    ]);
  });
});
