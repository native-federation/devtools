import { compareSemver } from '../semver-compare';
import { acceptsTag } from '../semver-range';
import type { BundleClaim, ChunkGroupProjection } from './bundle-claims-model';
import type { DeclarationResolutionClaim } from './claims-model';
import { owningPackage } from './derive-grouping-facets';
import type { TagPool } from './grouping-model';
import type { ResolvedDependencyCopy } from './copies-model';
import { registryEvidenceId } from './ids';
import type {
  CanonicalRegistryEvidence,
  EffectiveConsumerResolution,
  ParticipantDeclaration,
  SharedExternalId,
  SharedExternalRecord,
  VersionRegistration,
} from './model';
import type { PoolFamily, PoolRangeRejection } from './pool-family-model';
import type { RemoteProjection } from './projection-model';
import type {
  BuildChunkFile,
  DeclarationVerdict,
  DeclarationVerdictRecord,
  PlacementReason,
  PackageScopeVerdicts,
  VersionBuild,
  VersionStatus,
  VersionVerdict,
} from './verdict-model';

const STRICT_SCOPE = 'strict';

export interface PackageVerdictInputs {
  /** Declaration claims with attached copy IDs. */
  claims: readonly DeclarationResolutionClaim[];
  copies: readonly ResolvedDependencyCopy[];
  resolutions: readonly EffectiveConsumerResolution[];
  bundleClaims: readonly BundleClaim[];
  chunkGroups: readonly ChunkGroupProjection[];
  remotes: readonly RemoteProjection[];
  tagPools?: readonly TagPool[];
  poolFamilies?: readonly PoolFamily[];
}

export function derivePackageVerdicts(
  evidence: CanonicalRegistryEvidence,
  {
    claims,
    copies,
    resolutions,
    bundleClaims,
    chunkGroups,
    remotes,
    tagPools = [],
    poolFamilies = [],
  }: PackageVerdictInputs,
): PackageScopeVerdicts[] {
  const registrationById = new Map(evidence.versionRegistrations.map((r) => [r.id, r]));
  const declarationById = new Map(evidence.participantDeclarations.map((d) => [d.id, d]));
  const reasonOf = placementReasons(evidence, tagPools, poolFamilies);
  const copyById = new Map(copies.map((copy) => [copy.id, copy]));
  const buildOf = buildFactory(resolutions, bundleClaims, chunkGroups, remotes);

  const copiesByExternal = new Map<SharedExternalId, ResolvedDependencyCopy[]>();
  for (const copy of copies) {
    const externals = new Set(
      copy.sourceRegistrationRefs
        .filter((ref) => ref.kind === 'shared')
        .map((ref) => registrationById.get(ref.id)?.sharedExternalId)
        .filter((id): id is SharedExternalId => id !== undefined),
    );
    for (const external of externals) {
      copiesByExternal.set(external, [...(copiesByExternal.get(external) ?? []), copy]);
    }
  }
  const claimsByDeclaration = new Map<string, DeclarationResolutionClaim[]>();
  for (const claim of claims) {
    if (claim.subject.kind !== 'shared') continue;
    const id = claim.subject.participantDeclarationId;
    claimsByDeclaration.set(id, [...(claimsByDeclaration.get(id) ?? []), claim]);
  }

  return evidence.sharedExternals.map((external) => {
    const registrations = external.versionRegistrationIds.map((id) => registrationById.get(id)!);
    const strict = external.shareScope === STRICT_SCOPE;
    const elected = strict ? undefined : registrations.find((r) => r.action === 'share');
    const electedTag = elected?.tag ?? null;
    const scopeCopies = copiesByExternal.get(external.id) ?? [];

    const runsTagOf = (declaration: ParticipantDeclaration): string | null => {
      const own = claimsByDeclaration.get(declaration.id) ?? [];
      const claim =
        own.find((c) => c.specifier === external.packageName && c.copyId !== null) ??
        own.find((c) => c.copyId !== null);
      return claim?.copyId ? (copyById.get(claim.copyId)?.resolvedTag ?? null) : null;
    };

    const tags = [...new Set(registrations.map((r) => r.tag))].sort((a, b) => compareSemver(b, a));
    const declarations: DeclarationVerdictRecord[] = registrations.flatMap((registration) =>
      registration.participantDeclarationIds.map((id, index) => {
        const declaration = declarationById.get(id)!;
        const acceptsElected =
          electedTag === null
            ? null
            : acceptsTag(electedTag, registration.tag, declaration.requiredVersion);
        const verdict = verdictOf(registration, declaration, index, electedTag, acceptsElected);
        return {
          declarationId: declaration.id,
          participant: declaration.participant,
          tag: registration.tag,
          verdict,
          acceptsElected,
          reason:
            verdict === 'own-copy' || verdict === 'subpool'
              ? reasonOf(external, declaration.participant)
              : null,
          subpoolOf: declaration.servedBy,
          runsTag: runsTagOf(declaration),
          requiredVersion: declaration.requiredVersion,
          strictVersion: declaration.strictVersion,
          acceptance: tags.map((tag) => ({
            tag,
            accepts: acceptsTag(tag, registration.tag, declaration.requiredVersion),
          })),
        };
      }),
    );

    const versions: VersionVerdict[] = tags.map((tag) => {
      const rows = registrations.filter((r) => r.tag === tag);
      const tagCopies = scopeCopies.filter((copy) => copy.resolvedTag === tag);
      // The copy serving the package's own specifier leads; the rest keep copy order.
      const builds = [
        ...tagCopies.filter((copy) => external.packageName in copy.entrypoints),
        ...tagCopies.filter((copy) => !(external.packageName in copy.entrypoints)),
      ].map(buildOf);
      const status: VersionStatus = rows.some((r) => r.action === 'share')
        ? 'shared'
        : rows.some((r) => r.action === 'scope')
          ? 'scoped'
          : tagCopies.length > 0
            ? 'partly-mapped'
            : 'not-mapped';
      return {
        tag,
        status,
        registrationIds: rows.map((r) => r.id),
        declarationIds: rows.flatMap((r) => r.participantDeclarationIds),
        copyIds: tagCopies.map((copy) => copy.id),
        builds,
        merged: status === 'shared' && builds.filter((b) => b.fromShareRow).length > 1,
      };
    });

    return {
      id: registryEvidenceId(
        'package-scope-verdicts',
        [external.shareScope, external.packageName],
        external.ordinal,
      ),
      sharedExternalId: external.id,
      shareScope: external.shareScope,
      packageName: external.packageName,
      electedTag,
      electedDeclarationId: elected?.participantDeclarationIds[0] ?? null,
      versions,
      declarations,
      servingBuild: external.servingBuild,
    };
  });
}

interface PlacedCopy {
  member: string;
  tag: string;
  action: VersionRegistration['action'];
  /** First participant of a `host` row: the host serves every tag it ships. */
  hostLead: boolean;
  requiredVersion: string;
  strict: boolean;
  specifiers: string[];
}

// Per (share scope, remote): why its copies are off the global map. Packages group a root and its
// flat secondaries by name, as the orchestrator does (`packageOf`).
function placementReasons(
  evidence: CanonicalRegistryEvidence,
  tagPools: readonly TagPool[],
  poolFamilies: readonly PoolFamily[],
): (external: SharedExternalRecord, remote: string) => PlacementReason {
  const registrationById = new Map(evidence.versionRegistrations.map((r) => [r.id, r]));
  const declarationById = new Map(evidence.participantDeclarations.map((d) => [d.id, d]));
  const candidateById = new Map(evidence.entrypointCandidates.map((c) => [c.id, c]));
  const packageOf = (external: SharedExternalRecord) =>
    `${external.shareScope}\n${owningPackage(external.packageName) ?? external.packageName}`;
  const packages = new Map<string, SharedExternalRecord[]>();
  for (const external of evidence.sharedExternals)
    packages.set(packageOf(external), [...(packages.get(packageOf(external)) ?? []), external]);

  const placedOf = (externals: readonly SharedExternalRecord[], remote: string): PlacedCopy[] =>
    externals.flatMap((external) =>
      external.versionRegistrationIds.flatMap((id) => {
        const registration = registrationById.get(id)!;
        return registration.participantDeclarationIds.flatMap((declarationId, index) => {
          const declaration = declarationById.get(declarationId)!;
          if (declaration.participant !== remote) return [];
          return [
            {
              member: external.packageName,
              tag: registration.tag,
              action: registration.action,
              hostLead: registration.host && index === 0,
              requiredVersion: declaration.requiredVersion,
              strict: declaration.strictVersion,
              specifiers: declaration.entrypointCandidateIds.map(
                (c) => candidateById.get(c)!.specifier,
              ),
            },
          ];
        });
      }),
    );

  return (external, remote) => {
    const index = tagPools.findIndex((pool) => pool.sharedExternalIds.includes(external.id));
    if (index !== -1) {
      const family = poolFamilies[index];
      const consumer = family?.consumers.find((c) => c.remote === remote);
      return {
        scope: 'pool',
        build: family?.winner ?? null,
        miss: consumer?.miss ?? null,
        storedCause: consumer?.storedCause ?? null,
      };
    }
    const externals = packages.get(packageOf(external))!;
    const serving = externals.find((e) => e.servingBuild !== null)?.servingBuild ?? null;
    if (serving === null) return { scope: 'package', build: null, miss: null, storedCause: null };

    // `serving.ts` `surfaceOf`: the serving build's copies at its share tag, and every host-led row.
    const servingCopies = placedOf(externals, serving).filter((p) => p.action === 'share');
    const servingTag =
      servingCopies.find((p) => p.member === external.packageName)?.tag ?? servingCopies[0]?.tag;
    const surface = new Map<string, string>();
    for (const e of externals)
      for (const p of placedOf([e], serving))
        if (p.action === 'share' && p.tag === servingTag)
          for (const s of p.specifiers) if (!surface.has(s)) surface.set(s, p.tag);
    for (const e of externals)
      for (const id of e.versionRegistrationIds) {
        const registration = registrationById.get(id)!;
        const lead = declarationById.get(registration.participantDeclarationIds[0]);
        if (registration.action !== 'share' || !registration.host || lead === undefined) continue;
        for (const c of lead.entrypointCandidateIds) {
          const specifier = candidateById.get(c)!.specifier;
          if (!surface.has(specifier)) surface.set(specifier, registration.tag);
        }
      }

    const placed = placedOf(externals, remote);
    const rejections: PoolRangeRejection[] =
      servingTag === undefined
        ? []
        : placed
            .filter((p) => p.strict && acceptsTag(servingTag, p.tag, p.requiredVersion) === false)
            .map((p) => ({
              member: p.member,
              specifier: p.specifiers[0] ?? p.member,
              tag: servingTag,
              requiredVersion: p.requiredVersion,
              strict: true,
            }));
    const missing = placed.flatMap((p) => p.specifiers).filter((s) => !surface.has(s));
    const tags = [...new Set(placed.map((p) => p.tag))];
    const miss: PlacementReason['miss'] =
      rejections.length > 0
        ? { kind: 'range', rejections }
        : missing.length > 0
          ? { kind: 'coverage', missing }
          : tags.length > 1 && !placed.some((p) => p.hostLead)
            ? { kind: 'two-tags', tags: tags.sort(compareSemver) }
            : null;
    return { scope: 'package', build: serving, miss, storedCause: null };
  };
}

function verdictOf(
  registration: VersionRegistration,
  declaration: ParticipantDeclaration,
  index: number,
  electedTag: string | null,
  acceptsElected: boolean | null,
): DeclarationVerdict {
  switch (registration.action) {
    // The mapping publishes the first participant's file (`remotes[0]`).
    case 'share':
      return index === 0 ? 'provides' : 'same-version';
    case 'scope':
      return 'own-copy';
    case 'skip':
      if (declaration.servedBy !== null) return 'subpool';
      if (electedTag === null) return 'unknown';
      if (registration.tag === electedTag) return 'same-version';
      if (acceptsElected === true) return 'reuses-shared';
      // A strict range that rejects the elected tag is stored as `scope`, so a strict `skip` here
      // is a row the resolver rules do not explain.
      if (acceptsElected === false && !declaration.strictVersion) return 'out-of-range';
      return 'unknown';
    default:
      return 'unknown';
  }
}

function sourceRemoteOf(copy: ResolvedDependencyCopy): string | null {
  switch (copy.source.kind) {
    case 'shared-declaration':
      return copy.source.participant;
    case 'private-registration':
      return copy.source.ownerRemote;
    default:
      return null;
  }
}

function buildFactory(
  resolutions: readonly EffectiveConsumerResolution[],
  bundleClaims: readonly BundleClaim[],
  chunkGroups: readonly ChunkGroupProjection[],
  remotes: readonly RemoteProjection[],
): (copy: ResolvedDependencyCopy) => VersionBuild {
  const resolutionById = new Map(resolutions.map((r) => [r.id, r]));
  const claimById = new Map(bundleClaims.map((claim) => [claim.id, claim]));
  const groupById = new Map(chunkGroups.map((group) => [group.id, group]));
  const scopeUrlByRemote = new Map(remotes.map((r) => [r.name, r.resolvedScopeUrl]));
  // Chunk files are recorded relative to the emitter's scope, as the orchestrator resolves them.
  const chunkUrl = (emitter: string, file: string): string | null => {
    const scope = scopeUrlByRemote.get(emitter);
    if (scope === undefined) return null;
    try {
      return new URL(file, scope).href;
    } catch {
      return null;
    }
  };
  return (copy) => {
    const integrityByTarget = new Map<string, boolean>();
    for (const id of copy.effectiveResolutionIds) {
      const resolution = resolutionById.get(id);
      if (resolution?.status === 'mapped') {
        integrityByTarget.set(resolution.targetUrl, resolution.hasIntegrity);
      }
    }
    const chunkFiles: BuildChunkFile[] = [];
    for (const claimId of copy.bundleClaimIds) {
      const claim = claimById.get(claimId);
      if (claim?.status !== 'mapped-source') continue;
      for (const group of claim.chunkGroupIds.map((id) => groupById.get(id))) {
        for (const file of group?.files ?? []) {
          chunkFiles.push({ file, url: chunkUrl(group!.emitterRemote, file) });
        }
      }
    }
    return {
      copyId: copy.id,
      sourceRemote: sourceRemoteOf(copy),
      fromShareRow: copy.sourceDisposition === 'share-registration',
      specifiers: Object.keys(copy.entrypoints),
      entryFiles: Object.entries(copy.entrypoints).map(([specifier, url]) => ({
        specifier,
        url,
        hasIntegrity: integrityByTarget.get(url) ?? false,
      })),
      chunkFiles,
    };
  };
}
