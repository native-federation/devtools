/**
 * Bundle-claim specs (Task 6): attribution only through the copy's selected
 * source — a non-selected bundle-bearing declaration donates nothing, a
 * selected secondary declaration and an identifiable anchor contribute only
 * their own emitter-aware bundles (T6-AC-01); a skip copy's own mapping distinguishes
 * `mapped-source` from `source-only` (T6-AC-02); equal filenames from
 * different emitters never merge (T6-AC-03); ambiguity surfaces candidates
 * without choosing; `@nf-internal/...` carriers stay outside dependency
 * attribution; and `attachBundleClaimIds` completes the copy contract.
 */
import { FIXTURES, NF_HOST, type SnapshotV1 } from 'devtools-bridge';

import { mergeDocumentMaps, resolveUrl } from '../merge-document-maps';
import type { BundleClaim, ChunkGroupProjection } from './bundle-claims-model';
import type { DeclarationResolutionClaim, ResolutionClaimsDerivation } from './claims-model';
import type { ResolvedDependencyCopy } from './copies-model';
import { attachBundleClaimIds, deriveBundleClaims } from './derive-bundle-claims';
import { deriveChunkGroups } from './derive-chunk-groups';
import { deriveResolutionClaims } from './derive-declaration-claims';
import { attachCopyIds, materializeResolvedCopies } from './materialize-resolved-copies';
import type { CanonicalRegistryEvidence, EffectiveConsumerResolution } from './model';
import { normalizeRegistryEvidence } from './normalize-registry-evidence';
import { resolveEffectiveConsumerBindings } from './resolve-effective-consumer-bindings';

const PAGE_URL = 'https://seeded.example/app/';

interface SeedParticipant {
  name: string;
  entries: Record<string, string>;
  bundle?: string;
  pool?: string;
  servedBy?: string;
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
  scoped?: Record<
    string,
    Record<string, { tag: string; bundle?: string; entries: Record<string, string> }>
  >;
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
        bundle: scopedPackage.bundle ?? null,
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

interface Harness {
  evidence: CanonicalRegistryEvidence;
  resolutions: EffectiveConsumerResolution[];
  claims: ResolutionClaimsDerivation;
  copies: ResolvedDependencyCopy[];
  attached: DeclarationResolutionClaim[];
  chunkGroups: ChunkGroupProjection[];
  bundleClaims: BundleClaim[];
  /** Copies completed with `bundleClaimIds` via `attachBundleClaimIds`. */
  attachedCopies: ResolvedDependencyCopy[];
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
  const copies = materializeResolvedCopies(evidence, resolutions, claims, {
    snapshotIdentity: `${snapshot.capture.capturedAt}|${snapshot.capture.pageUrl}`,
  });
  const attached = attachCopyIds(claims.declarationResolutionClaims, copies);
  const chunkGroups = deriveChunkGroups(evidence, snapshot.runtime?.sharedChunks ?? {});
  const bundleClaims = deriveBundleClaims(evidence, claims, copies, chunkGroups);
  const attachedCopies = attachBundleClaimIds(copies, bundleClaims);
  return {
    evidence,
    resolutions,
    claims,
    copies,
    attached,
    chunkGroups,
    bundleClaims,
    attachedCopies,
  };
}

function copyForTarget(
  copies: ResolvedDependencyCopy[],
  targetUrl: string,
): ResolvedDependencyCopy {
  const matches = copies.filter((copy) => Object.values(copy.entrypoints).includes(targetUrl));
  expect(matches).toHaveLength(1);
  return matches[0];
}

function claimsOfCopy(harness: Harness, copy: ResolvedDependencyCopy): BundleClaim[] {
  return harness.bundleClaims.filter((bundleClaim) => bundleClaim.copyId === copy.id);
}

describe('deriveBundleClaims — selected-source attribution (T6-AC-01)', () => {
  it('lets only the selected declaration claim; a non-selected bundle-bearing declaration donates nothing', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { mfe1: './mfe1/', mfe2: './mfe2/' },
        shared: {
          __GLOBAL__: {
            pkg: [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [
                  { name: 'mfe1', entries: { pkg: 'pkg.mfe1.js' }, bundle: 'bundle-mfe1' },
                  { name: 'mfe2', entries: { pkg: 'pkg.mfe2.js' }, bundle: 'bundle-mfe2' },
                ],
              },
            ],
          },
        },
        sharedChunks: {
          mfe1: { 'bundle-mfe1': ['chunk-m1.js'] },
          mfe2: { 'bundle-mfe2': ['chunk-m2.js'] },
        },
        imports: { pkg: './mfe1/pkg.mfe1.js' },
      }),
    );
    const copy = copyForTarget(harness.copies, `${PAGE_URL}mfe1/pkg.mfe1.js`);

    expect(harness.copies).toHaveLength(1);
    expect(harness.bundleClaims).toHaveLength(1);
    const [claim] = harness.bundleClaims;
    expect(claim.copyId).toBe(copy.id);
    const selectedDeclaration = harness.evidence.participantDeclarations.find(
      (declaration) => declaration.participant === 'mfe1',
    );
    expect(claim.source).toEqual({
      kind: 'shared',
      declarationId: selectedDeclaration!.id,
    });
    expect(claim.sourceRemote).toBe('mfe1');
    expect(claim.bundle).toBe('bundle-mfe1');
    expect(claim.status).toBe('mapped-source');
    expect(claim.chunkGroupIds).toHaveLength(1);
    const [groupId] = claim.chunkGroupIds;
    const group = harness.chunkGroups.find((candidate) => candidate.id === groupId);
    expect(group?.emitterRemote).toBe('mfe1');
    expect(group?.files).toEqual(['chunk-m1.js']);
    // mfe2's bundle and registered chunks never appear on the selected copy.
    expect(harness.bundleClaims.some((candidate) => candidate.bundle === 'bundle-mfe2')).toBe(
      false,
    );
  });

  it('lets a selected secondary declaration contribute only its own emitter-aware bundle', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { mfe1: './mfe1/', mfe2: './mfe2/' },
        shared: {
          __GLOBAL__: {
            pkg: [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [
                  { name: 'mfe1', entries: { pkg: 'pkg.js' }, bundle: 'bundle-a' },
                  { name: 'mfe2', entries: { 'pkg/extra': 'extra.js' }, bundle: 'bundle-b' },
                ],
              },
            ],
          },
        },
        sharedChunks: {
          mfe1: { 'bundle-a': ['chunk-a.js'] },
          mfe2: { 'bundle-b': ['chunk-b.js'] },
        },
        imports: { pkg: './mfe1/pkg.js', 'pkg/extra': './mfe2/extra.js' },
      }),
    );
    const primary = copyForTarget(harness.copies, `${PAGE_URL}mfe1/pkg.js`);
    const secondary = copyForTarget(harness.copies, `${PAGE_URL}mfe2/extra.js`);

    const primaryClaims = claimsOfCopy(harness, primary);
    const secondaryClaims = claimsOfCopy(harness, secondary);
    expect(primaryClaims.map((claim) => [claim.sourceRemote, claim.bundle, claim.status])).toEqual([
      ['mfe1', 'bundle-a', 'mapped-source'],
    ]);
    expect(
      secondaryClaims.map((claim) => [claim.sourceRemote, claim.bundle, claim.status]),
    ).toEqual([['mfe2', 'bundle-b', 'mapped-source']]);
    // Neither copy references the other emitter's chunk group.
    const groupEmitter = (claim: BundleClaim) =>
      harness.chunkGroups.find((group) => group.id === claim.chunkGroupIds[0])?.emitterRemote;
    expect(groupEmitter(primaryClaims[0])).toBe('mfe1');
    expect(groupEmitter(secondaryClaims[0])).toBe('mfe2');
  });

  it('uses the identifiable anchor source for servedBy consumption (pooling-anchor corpus)', () => {
    const harness = derive(FIXTURES['pooling-anchor']);
    const anchorCopies = harness.copies.filter((copy) =>
      copy.effectiveRoles.includes('anchor-source'),
    );

    expect(anchorCopies).toHaveLength(1);
    const [anchorCopy] = anchorCopies;
    expect(anchorCopy.source.kind).toBe('shared-declaration');
    const anchorClaims = claimsOfCopy(harness, anchorCopy);
    expect(anchorClaims).toHaveLength(1);
    expect(anchorClaims[0].sourceRemote).toBe('mfe1');
    expect(anchorClaims[0].bundle).toBe('browser-shared');
    // The corpus registers no dense chunks — the claim stays qualified as
    // source-only instead of pretending missing or downloaded chunks.
    expect(anchorClaims[0].status).toBe('source-only');
    expect(anchorClaims[0].chunkGroupIds).toEqual([]);
  });
});

// Pre-4.8 records: a skip copy mapped in its own scope (4.8 would store it as `scope`).
describe('deriveBundleClaims — own-mapped skip chunk evidence (T6-AC-02)', () => {
  const ownSkipSeed = (options: { shareScope: string; registerChunks: boolean }): Seed => ({
    remotes: { mfe1: './mfe1/', mfe2: './mfe2/' },
    shared: {
      [options.shareScope]: {
        pkg: [
          {
            tag: '2.0.0',
            action: 'share',
            participants: [
              { name: 'mfe2', entries: { pkg: 'pkg.mfe2.js' }, bundle: 'bundle-share' },
            ],
          },
          {
            tag: '1.0.0',
            action: 'skip',
            participants: [
              { name: 'mfe1', entries: { pkg: 'pkg.mfe1.js' }, bundle: 'bundle-skip' },
            ],
          },
        ],
      },
    },
    sharedChunks: options.registerChunks ? { mfe1: { 'bundle-skip': ['chunk-own.js'] } } : {},
    imports: { pkg: './mfe2/pkg.mfe2.js' },
    scopes: { './mfe1/': { pkg: './mfe1/pkg.mfe1.js' } },
  });

  it('reports a global own-mapped skip copy with registered chunks as mapped-source', () => {
    const harness = derive(
      seedSnapshot(ownSkipSeed({ shareScope: '__GLOBAL__', registerChunks: true })),
    );
    const ownCopy = copyForTarget(harness.copies, `${PAGE_URL}mfe1/pkg.mfe1.js`);

    const claims = claimsOfCopy(harness, ownCopy);
    expect(claims).toHaveLength(1);
    expect(claims[0].bundle).toBe('bundle-skip');
    expect(claims[0].status).toBe('mapped-source');
    expect(claims[0].chunkGroupIds).toHaveLength(1);
  });

  it('keeps a named-scope own-mapped skip copy without registered bundles qualified as source-only', () => {
    const harness = derive(
      seedSnapshot(ownSkipSeed({ shareScope: 'family', registerChunks: false })),
    );
    const ownCopy = copyForTarget(harness.copies, `${PAGE_URL}mfe1/pkg.mfe1.js`);

    const claims = claimsOfCopy(harness, ownCopy);
    expect(claims).toHaveLength(1);
    expect(claims[0].bundle).toBe('bundle-skip');
    expect(claims[0].status).toBe('source-only');
    expect(claims[0].chunkGroupIds).toEqual([]);
  });

  it('keeps the dynamic-override corpus qualified: declared bundles without dense chunks stay source-only', () => {
    const harness = derive(FIXTURES['dynamic-override']);

    expect(harness.bundleClaims.length).toBeGreaterThan(0);
    for (const claim of harness.bundleClaims) {
      expect(claim.status).toBe('source-only');
      expect(claim.chunkGroupIds).toEqual([]);
    }
  });
});

describe('deriveBundleClaims — emitter separation and qualification (T6-AC-03)', () => {
  it('references only the own emitter group when equal bundle and file names exist twice', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { mfe1: './mfe1/', mfe2: './mfe2/' },
        shared: {
          __GLOBAL__: {
            pkgA: [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [
                  { name: 'mfe1', entries: { pkgA: 'pkgA.js' }, bundle: 'browser-shared' },
                ],
              },
            ],
            pkgB: [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [
                  { name: 'mfe2', entries: { pkgB: 'pkgB.js' }, bundle: 'browser-shared' },
                ],
              },
            ],
          },
        },
        sharedChunks: {
          mfe1: { 'browser-shared': ['chunk-EQUAL.js'] },
          mfe2: { 'browser-shared': ['chunk-EQUAL.js'] },
        },
        imports: { pkgA: './mfe1/pkgA.js', pkgB: './mfe2/pkgB.js' },
      }),
    );
    const copyA = copyForTarget(harness.copies, `${PAGE_URL}mfe1/pkgA.js`);
    const copyB = copyForTarget(harness.copies, `${PAGE_URL}mfe2/pkgB.js`);

    const claimA = claimsOfCopy(harness, copyA)[0];
    const claimB = claimsOfCopy(harness, copyB)[0];
    expect(claimA.chunkGroupIds).toHaveLength(1);
    expect(claimB.chunkGroupIds).toHaveLength(1);
    expect(claimA.chunkGroupIds[0]).not.toBe(claimB.chunkGroupIds[0]);
    const emitterOf = (claim: BundleClaim) =>
      harness.chunkGroups.find((group) => group.id === claim.chunkGroupIds[0])?.emitterRemote;
    expect(emitterOf(claimA)).toBe('mfe1');
    expect(emitterOf(claimB)).toBe('mfe2');
  });

  it('surfaces ambiguous sources per candidate pair without choosing or attributing chunks', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { mfe1: './mfe1/', mfe2: './mfe2/' },
        shared: {
          __GLOBAL__: {
            pkg: [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [
                  { name: 'mfe1', entries: { pkg: '/shared/pkg.js' }, bundle: 'bundle-1' },
                  { name: 'mfe2', entries: { pkg: '/shared/pkg.js' }, bundle: 'bundle-2' },
                ],
              },
            ],
          },
        },
        sharedChunks: {
          mfe1: { 'bundle-1': ['chunk-1.js'] },
          mfe2: { 'bundle-2': ['chunk-2.js'] },
        },
        imports: { pkg: '/shared/pkg.js' },
      }),
    );

    expect(harness.copies).toHaveLength(1);
    const [copy] = harness.copies;
    expect(copy.sourceDisposition).toBe('ambiguous-source');
    const claims = claimsOfCopy(harness, copy);
    expect(claims.map((claim) => [claim.sourceRemote, claim.bundle, claim.status])).toEqual([
      ['mfe1', 'bundle-1', 'ambiguous'],
      ['mfe2', 'bundle-2', 'ambiguous'],
    ]);
    for (const claim of claims) {
      expect(claim.source).toBeNull();
      expect(claim.chunkGroupIds).toEqual([]);
    }
  });

  it('never lets an @nf-internal carrier claim as a dependency source', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { mfe1: './mfe1/' },
        scoped: {
          mfe1: {
            '@nf-internal/chunk-Q': {
              tag: '0.0.0',
              bundle: 'bundle-q',
              entries: { '@nf-internal/chunk-Q': 'chunk-Q.js' },
            },
          },
        },
        scopes: { './mfe1/': { '@nf-internal/chunk-Q': './mfe1/chunk-Q.js' } },
      }),
    );
    const pseudoCopies = harness.copies.filter(
      (copy) => copy.source.kind === 'private-registration',
    );

    expect(pseudoCopies).toHaveLength(1);
    expect(harness.bundleClaims).toEqual([]);
    // The carrier still exists as an emitter-aware pseudo chunk group.
    expect(harness.chunkGroups.map((group) => group.pseudoPackage)).toEqual([
      '@nf-internal/chunk-Q',
    ]);
  });

  it('emits no bundle claim for a scope-derived target-only copy', () => {
    // Spec §9 rule 1: a declaration whose candidate did not supply the
    // selected target never donates its bundle — scope-prefix ownership is
    // URL attribution, not bundle evidence. The observed remote stays
    // visible through the copy's provider attribution instead.
    const harness = derive(
      seedSnapshot({
        remotes: { mfe1: './mfe1/' },
        shared: {
          __GLOBAL__: {
            pkg: [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [{ name: 'mfe1', entries: { pkg: 'pkg.js' }, bundle: 'bundle-a' }],
              },
            ],
          },
        },
        sharedChunks: { mfe1: { 'bundle-a': ['chunk-a.js'] } },
        // The mapped target lies under mfe1's scope but matches no candidate.
        imports: { pkg: './mfe1/override.js' },
      }),
    );

    expect(harness.copies).toHaveLength(1);
    const [copy] = harness.copies;
    expect(copy.source.kind).toBe('target-url');
    expect(copy.sourceDisposition).toBe('target-only');
    expect(
      copy.observedTargetProviders.map((provider) => [provider.outcome, provider.remote]),
    ).toEqual([['scope-derived', 'mfe1']]);
    expect(harness.bundleClaims).toEqual([]);
  });
});

describe('attachBundleClaimIds', () => {
  it('completes every copy: claim owners get sorted ids, others an explicit empty list', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { mfe1: './mfe1/', mfe2: './mfe2/' },
        shared: {
          __GLOBAL__: {
            pkg: [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [{ name: 'mfe1', entries: { pkg: 'pkg.js' }, bundle: 'bundle-a' }],
              },
            ],
            unbundled: [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [{ name: 'mfe2', entries: { unbundled: 'unbundled.js' } }],
              },
            ],
          },
        },
        sharedChunks: { mfe1: { 'bundle-a': ['chunk-a.js'] } },
        imports: { pkg: './mfe1/pkg.js', unbundled: './mfe2/unbundled.js' },
      }),
    );
    const bundled = copyForTarget(harness.attachedCopies, `${PAGE_URL}mfe1/pkg.js`);
    const unbundled = copyForTarget(harness.attachedCopies, `${PAGE_URL}mfe2/unbundled.js`);

    // Materialization emits the field empty; the attach stage completes it.
    for (const copy of harness.copies) {
      expect(copy.bundleClaimIds).toEqual([]);
    }
    expect(bundled.bundleClaimIds).toEqual(
      claimsOfCopy(harness, bundled)
        .map((claim) => claim.id)
        .sort(),
    );
    expect(bundled.bundleClaimIds).toHaveLength(1);
    expect(unbundled.bundleClaimIds).toEqual([]);
  });
});
