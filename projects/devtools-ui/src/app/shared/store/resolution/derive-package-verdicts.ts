import { compareSemver } from '../semver-compare';
import { satisfiesRange } from '../semver-range';
import type { BundleClaim, ChunkGroupProjection } from './bundle-claims-model';
import type { DeclarationResolutionClaim } from './claims-model';
import type { ResolvedDependencyCopy } from './copies-model';
import { registryEvidenceId } from './ids';
import type {
  CanonicalRegistryEvidence,
  EffectiveConsumerResolution,
  ParticipantDeclaration,
  SharedExternalId,
  VersionRegistration,
} from './model';
import type { RemoteProjection } from './projection-model';
import type {
  BuildChunkFile,
  DeclarationVerdict,
  DeclarationVerdictRecord,
  PackageScopeVerdicts,
  TornEntrypoint,
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
}

export function derivePackageVerdicts(
  evidence: CanonicalRegistryEvidence,
  { claims, copies, resolutions, bundleClaims, chunkGroups, remotes }: PackageVerdictInputs,
): PackageScopeVerdicts[] {
  const registrationById = new Map(evidence.versionRegistrations.map((r) => [r.id, r]));
  const declarationById = new Map(evidence.participantDeclarations.map((d) => [d.id, d]));
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
          electedTag === null ? null : satisfiesRange(electedTag, declaration.requiredVersion);
        return {
          declarationId: declaration.id,
          participant: declaration.participant,
          tag: registration.tag,
          verdict: verdictOf(registration, declaration, index, electedTag, acceptsElected),
          acceptsElected,
          runsTag: runsTagOf(declaration),
          requiredVersion: declaration.requiredVersion,
          strictVersion: declaration.strictVersion,
          acceptance: tags.map((tag) => ({
            tag,
            accepts: satisfiesRange(tag, declaration.requiredVersion),
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
        merged: status === 'shared' && builds.length > 1,
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
      torn: tornOf(external.packageName, electedTag, scopeCopies, claims),
    };
  });
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

// A tear is a self-filled claim onto a copy of another tag; a same-tag fill is a merged build.
function tornOf(
  packageName: string,
  electedTag: string | null,
  scopeCopies: readonly ResolvedDependencyCopy[],
  claims: readonly DeclarationResolutionClaim[],
): TornEntrypoint[] {
  if (electedTag === null) return [];
  const copyById = new Map(scopeCopies.map((copy) => [copy.id, copy]));
  const bySpecifier = new Map<string, TornEntrypoint>();
  for (const claim of claims) {
    if (claim.mappingState !== 'self-filled' || claim.copyId === null) continue;
    if (claim.consumerRegistryPackage !== packageName) continue;
    const copy = copyById.get(claim.copyId);
    if (copy === undefined || copy.resolvedTag === null || copy.resolvedTag === electedTag)
      continue;
    const entry = bySpecifier.get(claim.specifier) ?? {
      specifier: claim.specifier,
      fillingTag: copy.resolvedTag,
      fillingRemote: sourceRemoteOf(copy),
      copyId: copy.id,
      consumerRemotes: [],
    };
    if (!entry.consumerRemotes.includes(claim.consumerRemote)) {
      entry.consumerRemotes = [...entry.consumerRemotes, claim.consumerRemote].sort();
    }
    bySpecifier.set(claim.specifier, entry);
  }
  return [...bySpecifier.values()].sort((a, b) => (a.specifier < b.specifier ? -1 : 1));
}
