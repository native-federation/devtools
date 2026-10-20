/**
 * Resolved-dependency-copy specs (Task 5): corpus copy cardinality
 * (T5-AC-01, T5-AC-02), hierarchical source-record/URL identity with the
 * no-duplication merge rule and claim `copyId` completion (T5-AC-03),
 * action-derived source-disposition/effective-role separation (T5-AC-04),
 * the mapped-only boundary, and registry-order and `cached` invariance
 * against the mutable registry slot (T5-AC-05).
 */
import { FIXTURES, NF_HOST, type SnapshotV1 } from 'devtools-bridge';

import { mergeDocumentMaps, resolveUrl } from '../merge-document-maps';
import type { DeclarationResolutionClaim, ResolutionClaimsDerivation } from './claims-model';
import type { ResolvedCopySource, ResolvedDependencyCopy } from './copies-model';
import { deriveResolutionClaims } from './derive-declaration-claims';
import { attachCopyIds, materializeResolvedCopies } from './materialize-resolved-copies';
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
  copies: ResolvedDependencyCopy[];
  /** Claims completed with `copyId` via `attachCopyIds`. */
  attached: DeclarationResolutionClaim[];
}

function snapshotIdentityOf(snapshot: SnapshotV1): string {
  return `${snapshot.capture.capturedAt}|${snapshot.capture.pageUrl}`;
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
    snapshotIdentity: snapshotIdentityOf(snapshot),
  });
  const attached = attachCopyIds(claims.declarationResolutionClaims, copies);
  return { evidence, resolutions, claims, copies, attached };
}

function copyForTarget(
  copies: ResolvedDependencyCopy[],
  targetUrl: string,
): ResolvedDependencyCopy {
  const matches = copies.filter((copy) => Object.values(copy.entrypoints).includes(targetUrl));
  expect(matches).toHaveLength(1);
  return matches[0];
}

/** Sorted distinct consumer remotes of the claims completed onto this copy. */
function consumersOf(harness: Harness, copy: ResolvedDependencyCopy): string[] {
  return [
    ...new Set(
      harness.attached
        .filter((claim) => claim.copyId === copy.id)
        .map((claim) => claim.consumerRemote),
    ),
  ].sort();
}

function sharedDeclarationSource(
  harness: Harness,
  participant: string,
  packageName: string,
): ResolvedCopySource {
  const declaration = harness.evidence.participantDeclarations.find((candidate) => {
    if (candidate.participant !== participant) {
      return false;
    }
    const registration = harness.evidence.versionRegistrations.find(
      (record) => record.id === candidate.versionRegistrationId,
    );
    const shared = harness.evidence.sharedExternals.find(
      (record) => record.id === registration?.sharedExternalId,
    );
    return shared?.packageName === packageName;
  });
  expect(declaration).toBeDefined();
  return { kind: 'shared-declaration', declarationId: declaration!.id, participant };
}

describe('materializeResolvedCopies — corpus copy cardinality (T5-AC-01, T5-AC-02)', () => {
  it('materializes one copy from one registration, two declarations, and two consumer resolutions', () => {
    const harness = derive(FIXTURES['co-declared-share']);

    expect(harness.evidence.versionRegistrations).toHaveLength(1);
    expect(harness.evidence.participantDeclarations).toHaveLength(2);
    const mapped = harness.resolutions.filter((resolution) => resolution.status === 'mapped');
    expect(mapped).toHaveLength(2);
    expect(new Set(mapped.map((resolution) => resolution.targetUrl)).size).toBe(1);

    expect(harness.copies).toHaveLength(1);
    const copy = harness.copies[0];
    expect(copy.source).toEqual(sharedDeclarationSource(harness, 'mfe1', '@nf-lab/conflict-lib'));
    expect(copy.resolvedTag).toBe('1.0.0');
    expect(copy.entrypoints).toEqual({
      '@nf-lab/conflict-lib': 'http://localhost:4300/mfe1/_nf_lab_conflict_lib.JF7uEdSVsN.js',
    });
    expect(copy.effectiveResolutionIds).toHaveLength(2);
    expect(consumersOf(harness, copy)).toEqual(['mfe1', 'mfe2']);
    expect(copy.resolutionContexts).toHaveLength(1);
    expect(copy.resolutionContexts[0].consumerRegistryPackage).toBe('@nf-lab/conflict-lib');
    expect(copy.resolutionContexts[0].claimIds).toHaveLength(2);
    expect(copy.effectiveRoles).toEqual(['ordinary-shared']);
  });

  it('keeps one clean-skip copy despite two registrations with two declared tags', () => {
    const harness = derive(FIXTURES['clean-skip']);

    expect(harness.evidence.versionRegistrations).toHaveLength(2);
    expect(
      new Set(harness.evidence.versionRegistrations.map((registration) => registration.tag)).size,
    ).toBe(2);

    expect(harness.copies).toHaveLength(1);
    const copy = harness.copies[0];
    expect(copy.source).toEqual(sharedDeclarationSource(harness, 'mfe2', '@nf-lab/conflict-lib'));
    expect(copy.resolvedTag).toBe('2.0.0');
    expect(copy.sourceDisposition).toBe('share-registration');
    expect(copy.sourceActions).toEqual(['share']);
    expect(copy.sourceRegistrationRefs).toHaveLength(1);
    expect(copy.sourceRegistrationRefs[0].kind).toBe('shared');
    expect(consumersOf(harness, copy)).toEqual(['mfe1', 'mfe2']);
    expect(copy.effectiveRoles).toEqual(['ordinary-shared']);
  });

  it('splits strict-split into two copies while the skip registration yields none', () => {
    const harness = derive(FIXTURES['strict-split']);

    expect(harness.evidence.versionRegistrations).toHaveLength(3);
    expect(
      new Set(harness.evidence.versionRegistrations.map((registration) => registration.tag)).size,
    ).toBe(2);
    expect(harness.copies).toHaveLength(2);

    const hostCopy = copyForTarget(
      harness.copies,
      'http://localhost:4300/_nf_lab_conflict_lib.jvcc6K1csg.js',
    );
    expect(hostCopy.source).toEqual(
      sharedDeclarationSource(harness, NF_HOST, '@nf-lab/conflict-lib'),
    );
    expect(hostCopy.resolvedTag).toBe('2.0.0');
    expect(consumersOf(harness, hostCopy)).toEqual([NF_HOST, 'mfe1']);
    expect(hostCopy.effectiveRoles).toEqual(['ordinary-shared']);

    const strictCopy = copyForTarget(
      harness.copies,
      'http://localhost:4300/mfe3/_nf_lab_conflict_lib.JF7uEdSVsN.js',
    );
    expect(strictCopy.source).toEqual(
      sharedDeclarationSource(harness, 'mfe3', '@nf-lab/conflict-lib'),
    );
    expect(strictCopy.sourceDisposition).toBe('scope-registration');
    expect(strictCopy.effectiveRoles).toEqual(['isolated-own']);
    expect(consumersOf(harness, strictCopy)).toEqual(['mfe3']);

    expect(harness.copies.map((copy) => copy.source)).not.toContainEqual(
      sharedDeclarationSource(harness, 'mfe1', '@nf-lab/conflict-lib'),
    );
  });

  it('materializes two private copies from the scoped corpus', () => {
    const harness = derive(FIXTURES['scoped']);

    expect(harness.copies).toHaveLength(2);
    for (const copy of harness.copies) {
      expect(copy.source.kind).toBe('private-registration');
      expect(copy.sourceDisposition).toBe('private-registration');
      expect(copy.sourceActions).toEqual(['private']);
      expect(copy.effectiveRoles).toEqual(['private-own']);
      expect(copy.sourcePackage).toBe('@nf-lab/conflict-lib');
    }
    const mfe1Registration = harness.evidence.privateRegistrations.find(
      (registration) => registration.ownerRemote === 'mfe1',
    );
    const mfe1Copy = copyForTarget(
      harness.copies,
      'http://localhost:4300/mfe1/_nf_lab_conflict_lib.JF7uEdSVsN.js',
    );
    expect(mfe1Copy.source).toEqual({
      kind: 'private-registration',
      registrationId: mfe1Registration!.id,
      ownerRemote: mfe1Registration!.ownerRemote,
    });
    expect(mfe1Copy.resolvedTag).toBe('1.0.0');
    const mfe2Copy = copyForTarget(
      harness.copies,
      'http://localhost:4300/mfe2/_nf_lab_conflict_lib.jvcc6K1csg.js',
    );
    expect(mfe2Copy.resolvedTag).toBe('2.0.0');
  });
});

describe('materializeResolvedCopies — dense multi-entry witness (T7.8-AC-02, T7.8-AC-04)', () => {
  function registrationsOfPackage(harness: Harness, packageName: string) {
    const shared = harness.evidence.sharedExternals.filter(
      (record) => record.packageName === packageName,
    );
    expect(shared).toHaveLength(1);
    return harness.evidence.versionRegistrations.filter(
      (registration) => registration.sharedExternalId === shared[0].id,
    );
  }

  it('materializes one copy carrying both entrypoints from one dense registration', () => {
    const harness = derive(FIXTURES['synthetic-dense-entries']);

    expect(registrationsOfPackage(harness, '@nf-lab/dense-lib')).toHaveLength(1);
    const copies = harness.copies.filter((copy) => copy.sourcePackage === '@nf-lab/dense-lib');
    expect(copies).toHaveLength(1);
    const copy = copies[0];
    expect(copy.source).toEqual(sharedDeclarationSource(harness, 'mfe-dense', '@nf-lab/dense-lib'));
    expect(copy.resolvedTag).toBe('1.2.0');
    expect(copy.entrypoints).toEqual({
      '@nf-lab/dense-lib':
        'https://synthetic-fixture.example/dense-entries/mfe-dense/_nf_lab_dense_lib.h4PpYcAsEa.js',
      '@nf-lab/dense-lib/secondary':
        'https://synthetic-fixture.example/dense-entries/mfe-dense/_nf_lab_dense_lib_secondary.s3CnDaRyEa.js',
    });
    expect(consumersOf(harness, copy)).toEqual(['mfe-dense']);
    expect(copy.resolutionContexts).toHaveLength(1);
    expect(copy.resolutionContexts[0].claimIds).toHaveLength(2);
    expect(copy.effectiveRoles).toEqual(['ordinary-shared']);
  });

  it('keeps separate copies when the deviating secondary splits under one registry key', () => {
    const harness = derive(FIXTURES['synthetic-dense-entries']);

    // One registry key, two registrations — the densification split.
    const registrations = registrationsOfPackage(harness, '@nf-lab/split-lib');
    expect(registrations.map((registration) => registration.tag).sort()).toEqual([
      '3.0.0',
      '3.1.4',
    ]);

    const copies = harness.copies.filter((copy) => copy.sourcePackage === '@nf-lab/split-lib');
    expect(copies).toHaveLength(2);
    const parentCopy = copyForTarget(
      copies,
      'https://synthetic-fixture.example/dense-entries/mfe-dense/_nf_lab_split_lib.p4R3nTcAsE.js',
    );
    expect(parentCopy.resolvedTag).toBe('3.0.0');
    expect(Object.keys(parentCopy.entrypoints)).toEqual(['@nf-lab/split-lib']);
    const secondaryCopy = copyForTarget(
      copies,
      'https://synthetic-fixture.example/dense-entries/mfe-dense/_nf_lab_split_lib_secondary.d3Vi4tInGa.js',
    );
    expect(secondaryCopy.resolvedTag).toBe('3.1.4');
    // Never a merged lie: the deviating secondary stays its own copy.
    expect(Object.keys(secondaryCopy.entrypoints)).toEqual(['@nf-lab/split-lib/secondary']);
  });
});

describe('materializeResolvedCopies — hierarchical identity (T5-AC-03)', () => {
  it('groups all mapped entrypoints of one source declaration across consumer contexts', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { mfe1: './mfe1/', mfe2: './mfe2/' },
        shared: {
          default: {
            pkg: [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [
                  { name: 'mfe1', entries: { pkg: 'pkg-main.js', 'pkg/sub': 'pkg-sub.js' } },
                  { name: 'mfe2', entries: { pkg: 'pkg-mfe2.js' } },
                ],
              },
            ],
          },
        },
        imports: {
          pkg: './mfe1/pkg-main.js',
          'pkg/sub': './mfe1/pkg-sub.js',
        },
      }),
    );

    expect(harness.copies).toHaveLength(1);
    const copy = harness.copies[0];
    expect(copy.source).toEqual(sharedDeclarationSource(harness, 'mfe1', 'pkg'));
    expect(copy.entrypoints).toEqual({
      pkg: 'https://seeded.example/app/mfe1/pkg-main.js',
      'pkg/sub': 'https://seeded.example/app/mfe1/pkg-sub.js',
    });
    expect(consumersOf(harness, copy)).toEqual(['mfe1', 'mfe2']);
    expect(copy.resolutionContexts).toHaveLength(1);
    expect(copy.resolutionContexts[0].claimIds).toHaveLength(3);
    expect(copy.resolvedTag).toBe('1.0.0');
  });

  it('groups one URL-identified copy without claiming a source and keeps its tag null', () => {
    const snapshot = seedSnapshot({
      remotes: { mfe1: './mfe1/', mfe2: './mfe2/' },
      shared: {
        default: {
          pkg: [
            {
              tag: '1.0.0',
              action: 'share',
              participants: [
                { name: 'mfe1', entries: { pkg: 'pkg-mfe1.js' } },
                { name: 'mfe2', entries: { pkg: 'pkg-mfe2.js' } },
              ],
            },
          ],
        },
      },
      imports: { pkg: 'https://cdn.example/pkg.js' },
    });
    const harness = derive(snapshot);

    expect(harness.copies).toHaveLength(1);
    const copy = harness.copies[0];
    expect(copy.source).toEqual({ kind: 'target-url', targetUrl: 'https://cdn.example/pkg.js' });
    // Cross-snapshot storage namespaces the URL identity by snapshot identity.
    expect(copy.id).toContain(snapshotIdentityOf(snapshot));
    expect(copy.sourcePackage).toBeNull();
    expect(copy.resolvedTag).toBeNull();
    expect(copy.sourceDisposition).toBe('target-only');
    expect(copy.sourceActions).toEqual([]);
    expect(copy.sourceRegistrationRefs).toEqual([]);
    expect(copy.registryServingSlotClaims).toEqual([]);
    expect(consumersOf(harness, copy)).toEqual(['mfe1', 'mfe2']);
    expect(copy.resolutionContexts).toHaveLength(1);
    expect(copy.resolutionContexts[0].claimIds).toHaveLength(2);
    expect(copy.effectiveRoles).toEqual(['unclassified']);
  });

  it('never duplicates an exact source copy because another external record points at its URL', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { mfe1: './mfe1/', mfe2: './mfe2/' },
        shared: {
          default: {
            pkgA: [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [{ name: 'mfe1', entries: { pkgA: 'file-a.js' } }],
              },
            ],
            pkgB: [
              {
                tag: '2.0.0',
                action: 'share',
                participants: [{ name: 'mfe2', entries: { pkgB: 'file-b.js' } }],
              },
            ],
          },
        },
        imports: {
          pkgA: './mfe1/file-a.js',
          pkgB: './mfe1/file-a.js',
        },
      }),
    );

    expect(harness.copies).toHaveLength(1);
    const copy = harness.copies[0];
    expect(copy.source).toEqual(sharedDeclarationSource(harness, 'mfe1', 'pkgA'));
    expect(copy.resolvedTag).toBe('1.0.0');
    expect(copy.entrypoints).toEqual({
      pkgA: 'https://seeded.example/app/mfe1/file-a.js',
      pkgB: 'https://seeded.example/app/mfe1/file-a.js',
    });
    expect(consumersOf(harness, copy)).toEqual(['mfe1', 'mfe2']);
    expect(
      copy.resolutionContexts.map((resolutionContext) => resolutionContext.consumerRegistryPackage),
    ).toEqual(['pkgA', 'pkgB']);
    expect(copy.effectiveRoles).toEqual(['ordinary-shared']);
  });

  it('completes the claim contract: mapped claims reference their copy, others carry null', () => {
    const harness = derive(FIXTURES['pooling-anchor']);

    expect(harness.attached).toHaveLength(5);
    expect(harness.attached.every((claim) => claim.copyId !== null)).toBe(true);
    const hostClaim = harness.attached.find((claim) => claim.consumerRemote === NF_HOST);
    const hostCopy = copyForTarget(
      harness.copies,
      'http://localhost:4300/_nf_lab_conflict_lib.jvcc6K1csg.js',
    );
    expect(hostClaim!.copyId).toBe(hostCopy.id);
    // The raw derivation stays null until attachment completes the contract.
    expect(harness.claims.declarationResolutionClaims.every((claim) => claim.copyId === null)).toBe(
      true,
    );
  });
});

describe('materializeResolvedCopies — source dispositions vs effective roles (T5-AC-04)', () => {
  it('keeps the anchored skip source disposition while roles describe the anchor relation', () => {
    const harness = derive(FIXTURES['pooling-anchor']);
    expect(harness.copies).toHaveLength(3);

    const anchorCopy = copyForTarget(
      harness.copies,
      'http://localhost:4300/mfe1/_nf_lab_conflict_lib.JF7uEdSVsN.js',
    );
    expect(anchorCopy.sourceDisposition).toBe('skip-registration');
    expect(anchorCopy.sourceActions).toEqual(['skip']);
    expect(anchorCopy.effectiveRoles).toEqual(['anchor-source']);
    expect(consumersOf(harness, anchorCopy)).toEqual(['mfe1', 'mfe2']);
    expect(anchorCopy.resolvedTag).toBe('1.0.0');

    // A selected share surface is ordinary-shared even with one consumer.
    const hostCopy = copyForTarget(
      harness.copies,
      'http://localhost:4300/_nf_lab_conflict_lib.jvcc6K1csg.js',
    );
    expect(hostCopy.sourceDisposition).toBe('share-registration');
    expect(hostCopy.effectiveRoles).toEqual(['ordinary-shared']);

    const extraCopy = copyForTarget(
      harness.copies,
      'http://localhost:4300/mfe1/_nf_lab_conflict_lib_extra.GWjTDmPaoo.js',
    );
    expect(extraCopy.source).toEqual(
      sharedDeclarationSource(harness, 'mfe1', '@nf-lab/conflict-lib/extra'),
    );
    expect(extraCopy.effectiveRoles).toEqual(['ordinary-shared']);
  });

  it('lets a committed scope copy retain isolated-own and also act as anchor-source', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { mfe1: './mfe1/', mfe2: './mfe2/' },
        shared: {
          default: {
            pkg: [
              {
                tag: '1.0.0',
                action: 'scope',
                participants: [{ name: 'mfe1', entries: { pkg: 'pkg-scope.js' } }],
              },
              {
                tag: '1.1.0',
                action: 'skip',
                participants: [{ name: 'mfe2', entries: { pkg: 'pkg-mfe2.js' }, servedBy: 'mfe1' }],
              },
            ],
          },
        },
        imports: { pkg: './mfe1/pkg-scope.js' },
      }),
    );

    expect(harness.copies).toHaveLength(1);
    const copy = harness.copies[0];
    expect(copy.source).toEqual(sharedDeclarationSource(harness, 'mfe1', 'pkg'));
    expect(copy.sourceDisposition).toBe('scope-registration');
    expect(copy.effectiveRoles).toEqual(['anchor-source', 'isolated-own']);
    expect(consumersOf(harness, copy)).toEqual(['mfe1', 'mfe2']);
  });

  // A pre-4.8 self-fill: the skip copy's own selection contributes no closed role.
  it('leaves a skip copy selected for its own and a later consumer unclassified', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { mfe1: './mfe1/', mfe3: './mfe3/' },
        shared: {
          default: {
            pkg: [
              {
                tag: '1.0.0',
                action: 'skip',
                participants: [
                  { name: 'mfe1', entries: { pkg: 'pkg-skip.js' } },
                  { name: 'mfe3', entries: { pkg: 'pkg-mfe3.js' } },
                ],
              },
            ],
          },
        },
        imports: { pkg: './mfe1/pkg-skip.js' },
      }),
    );

    expect(harness.copies).toHaveLength(1);
    const copy = harness.copies[0];
    expect(copy.source).toEqual(sharedDeclarationSource(harness, 'mfe1', 'pkg'));
    expect(copy.sourceDisposition).toBe('skip-registration');
    expect(copy.effectiveRoles).toEqual(['unclassified']);
    expect(copy.resolutionContexts).toHaveLength(1);
    expect(copy.resolutionContexts[0].claimIds).toHaveLength(2);
  });
});

describe('materializeResolvedCopies — mapped-only boundary', () => {
  it('creates copies only from mapped resolutions, never from unmapped, blocked, or unknown ones', () => {
    const harness = derive(
      seedSnapshot({
        remotes: { mfe1: './mfe1/' },
        shared: {
          default: {
            'mapped-pkg': [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [{ name: 'mfe1', entries: { 'mapped-pkg': 'mapped.js' } }],
              },
            ],
            'missing-pkg': [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [{ name: 'mfe1', entries: { 'missing-pkg': 'missing.js' } }],
              },
            ],
            'blocked-pkg': [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [{ name: 'mfe1', entries: { 'blocked-pkg/sub': 'blocked.js' } }],
              },
            ],
            'unknown-pkg': [
              {
                tag: '1.0.0',
                action: 'share',
                participants: [{ name: 'ghost', entries: { 'unknown-pkg': 'ghost.js' } }],
              },
            ],
          },
        },
        imports: {
          'mapped-pkg': './mfe1/mapped.js',
          'blocked-pkg/': './blocked',
        },
      }),
    );

    const statuses = new Set(harness.resolutions.map((resolution) => resolution.status));
    expect(statuses).toEqual(new Set(['mapped', 'unmapped', 'blocked', 'unknown']));

    expect(harness.copies).toHaveLength(1);
    expect(harness.copies[0].entrypoints).toEqual({
      'mapped-pkg': 'https://seeded.example/app/mfe1/mapped.js',
    });
    expect(harness.copies[0].source).toEqual(
      sharedDeclarationSource(harness, 'mfe1', 'mapped-pkg'),
    );

    const copyIdBySpecifier = new Map(
      harness.attached.map((claim) => [claim.specifier, claim.copyId]),
    );
    expect(copyIdBySpecifier.get('mapped-pkg')).toBe(harness.copies[0].id);
    expect(copyIdBySpecifier.get('missing-pkg')).toBeNull();
    expect(copyIdBySpecifier.get('blocked-pkg/sub')).toBeNull();
    expect(copyIdBySpecifier.get('unknown-pkg')).toBeNull();
  });
});

describe('materializeResolvedCopies — registry order and cached invariance (T5-AC-05)', () => {
  /** The identity/ownership/relation core; slots, providers, and evidence paths are order-sensitive. */
  function identityCore(copies: ResolvedDependencyCopy[]) {
    return copies.map((copy) => ({
      id: copy.id,
      sourcePackage: copy.sourcePackage,
      resolvedTag: copy.resolvedTag,
      source: copy.source,
      sourceDisposition: copy.sourceDisposition,
      sourceActions: copy.sourceActions,
      effectiveRoles: copy.effectiveRoles,
      entrypoints: copy.entrypoints,
      effectiveResolutionIds: copy.effectiveResolutionIds,
      resolutionContexts: copy.resolutionContexts,
      sourceRegistrationRefs: copy.sourceRegistrationRefs,
    }));
  }

  it('keeps copy identity and target ownership when registry-only order reverses', () => {
    const coDeclaredBaseline = derive(FIXTURES['co-declared-share']);
    const coDeclaredReversed = structuredClone(FIXTURES['co-declared-share']);
    coDeclaredReversed.runtime!.sharedExternals!['__GLOBAL__'][
      '@nf-lab/conflict-lib'
    ].versions[0].remotes.reverse();
    const coDeclaredFlipped = derive(coDeclaredReversed);

    expect(identityCore(coDeclaredFlipped.copies)).toEqual(identityCore(coDeclaredBaseline.copies));
    // The qualified registry slot is order-sensitive and may legitimately move.
    expect(coDeclaredFlipped.claims.registryServingSlotClaims[0].declarationId).not.toBe(
      coDeclaredBaseline.claims.registryServingSlotClaims[0].declarationId,
    );

    const strictBaseline = derive(FIXTURES['strict-split']);
    const strictReversed = structuredClone(FIXTURES['strict-split']);
    strictReversed.runtime!.sharedExternals!['__GLOBAL__'][
      '@nf-lab/conflict-lib'
    ].versions.reverse();
    expect(identityCore(derive(strictReversed).copies)).toEqual(
      identityCore(strictBaseline.copies),
    );
  });

  it('keeps copies byte-identical when only cached flags change', () => {
    const baseline = derive(FIXTURES['strict-split']);
    const mutated = structuredClone(FIXTURES['strict-split']);
    for (const external of Object.values(mutated.runtime!.sharedExternals!['__GLOBAL__'])) {
      for (const version of external.versions) {
        for (const remote of version.remotes) {
          remote.cached = !remote.cached;
        }
      }
    }
    expect(derive(mutated).copies).toEqual(baseline.copies);
  });
});
