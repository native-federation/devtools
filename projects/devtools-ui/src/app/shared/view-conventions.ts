/**
 * Cross-view vm conventions — the vocabulary every V2 view renders
 * identically: sentinel display mapping, grounded registry-action notes,
 * select-payload builders of the cross-link convention (see
 * `app.routes.ts`), and the canonical-façade join helpers shared by the
 * migrated views (ID-keyed indexes, copy-source attribution, target file
 * display). Established with the Packages view (T10, T10.5), lifted here
 * with its second consumer (Remotes, T11); the canonical helpers moved up
 * from `views/packages/packages-vm-shared.ts` with THEIR second consumer
 * (Remotes migration, T8).
 *
 * Pure vocabulary and joins of the vm layer: no component, no
 * interpretation beyond display, no derivation of resolver, action, or
 * copy semantics. This deliberately does NOT live in the kit — the kit
 * interprets no registry names.
 */
import { NF_HOST } from 'devtools-bridge';

import type { FederationModel } from './store/federation-model';
import type {
  BundleClaim,
  BundleClaimId,
  CanonicalResolutionProjection,
  ChunkGroupId,
  ChunkGroupProjection,
  ConsumerCopyRelation,
  DeclarationResolutionClaim,
  DeclarationResolutionClaimId,
  EffectiveConsumerResolution,
  EffectiveConsumerResolutionId,
  EntrypointCandidate,
  EntrypointCandidateId,
  ParticipantDeclaration,
  ParticipantDeclarationId,
  PrivateRegistration,
  PrivateRegistrationId,
  ResolvedDependencyCopy,
  ResolvedDependencyCopyId,
  SharedExternalId,
  SharedExternalRecord,
  VersionRegistration,
  VersionRegistrationId,
} from './store/resolution';

/** The registry's strict share scope name (spec-pinned, matches derivations). */
export const STRICT_SCOPE = 'strict';
export const GLOBAL_SCOPE = '__GLOBAL__';

/** Selection / `select`-param id of one (share scope, package). */
export function packageId(scope: string, packageName: string): string {
  return `${scope}|${packageName}`;
}

/** Display form of a participant — the `__NF-HOST__` sentinel reads as 'host'. */
export function participantDisplay(name: string): string {
  return name === NF_HOST ? 'host' : name;
}

/**
 * Grounded action vocabulary (rule: registry-election). Verbatim action
 * stays the label. Notes state REGISTRY evidence only — where a binding
 * actually resolves is the claim's business (zone/state chips), never the
 * action's: an anchored skip consumer can resolve to its own copy. Since
 * T8.6 these notes render as registration tooltips only — the glyph
 * column, action chips, and glyph legend are gone with the zone redesign.
 */
export const ACTION_NOTES: Record<string, string> = {
  share: 'offers this copy to the version election',
  skip: 'registered with action skip — the registry election does not take this copy',
  scope: 'registered with action scope — an isolated registration outside the version election',
};

/**
 * Pluralizing count claim of an observed quantity — `3 files`,
 * `1 chunk file`; irregular plurals pass their own form
 * (`countClaim(2, 'entry', 'entries')`).
 */
export function countClaim(count: number, noun: string, plural: string = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`;
}

/**
 * The chunk-file claim of one bundle (rule: bundle-chunk-join). An empty
 * list is the no-list marker (spec-pinned since T7): the participant names
 * the bundle, the chunks repository holds no list — claim the absence
 * explicitly instead of masquerading as "0 files" (T11 doctrine).
 */
export function chunkFileClaim(files: string[]): string {
  return files.length === 0
    ? 'no chunk list recorded in this capture'
    : countClaim(files.length, 'chunk file');
}

/** ID-keyed lookups over the canonical read surface; built once per vm. */
export interface CanonicalIndexes {
  sharedExternalById: Map<SharedExternalId, SharedExternalRecord>;
  declarationById: Map<ParticipantDeclarationId, ParticipantDeclaration>;
  registrationById: Map<VersionRegistrationId, VersionRegistration>;
  privateRegistrationById: Map<PrivateRegistrationId, PrivateRegistration>;
  candidateById: Map<EntrypointCandidateId, EntrypointCandidate>;
  resolutionById: Map<EffectiveConsumerResolutionId, EffectiveConsumerResolution>;
  claimsByDeclaration: Map<ParticipantDeclarationId, DeclarationResolutionClaim[]>;
  /** Every attached claim (shared and private subjects), by canonical ID. */
  claimById: Map<DeclarationResolutionClaimId, DeclarationResolutionClaim>;
  copyById: Map<ResolvedDependencyCopyId, ResolvedDependencyCopy>;
  relationsByCopy: Map<ResolvedDependencyCopyId, ConsumerCopyRelation[]>;
  bundleClaimById: Map<BundleClaimId, BundleClaim>;
  chunkGroupById: Map<ChunkGroupId, ChunkGroupProjection>;
  projection: CanonicalResolutionProjection;
}

export function buildCanonicalIndexes(model: FederationModel): CanonicalIndexes {
  const projection = model.resolutionProjection;
  const claimsByDeclaration = new Map<ParticipantDeclarationId, DeclarationResolutionClaim[]>();
  for (const claim of projection.declarationResolutionClaims) {
    if (claim.subject.kind !== 'shared') {
      continue;
    }
    const declarationId = claim.subject.participantDeclarationId;
    claimsByDeclaration.set(declarationId, [
      ...(claimsByDeclaration.get(declarationId) ?? []),
      claim,
    ]);
  }
  const relationsByCopy = new Map<ResolvedDependencyCopyId, ConsumerCopyRelation[]>();
  for (const relation of projection.consumerRelations) {
    relationsByCopy.set(relation.copyId, [
      ...(relationsByCopy.get(relation.copyId) ?? []),
      relation,
    ]);
  }
  return {
    projection,
    sharedExternalById: new Map(
      model.registryEvidence.sharedExternals.map((record) => [record.id, record]),
    ),
    declarationById: new Map(
      model.registryEvidence.participantDeclarations.map((record) => [record.id, record]),
    ),
    registrationById: new Map(
      model.registryEvidence.versionRegistrations.map((record) => [record.id, record]),
    ),
    privateRegistrationById: new Map(
      model.registryEvidence.privateRegistrations.map((record) => [record.id, record]),
    ),
    candidateById: new Map(
      model.registryEvidence.entrypointCandidates.map((record) => [record.id, record]),
    ),
    resolutionById: new Map(
      model.effectiveConsumerResolutions.map((resolution) => [resolution.id, resolution]),
    ),
    claimsByDeclaration,
    claimById: new Map(projection.declarationResolutionClaims.map((claim) => [claim.id, claim])),
    copyById: new Map(projection.copies.map((copy) => [copy.id, copy])),
    relationsByCopy,
    bundleClaimById: new Map(projection.bundleClaims.map((claim) => [claim.id, claim])),
    chunkGroupById: new Map(projection.chunkGroups.map((group) => [group.id, group])),
  };
}

/**
 * Source remote of a copy — the participant/owner of its uniquely evidenced
 * source record; null for URL-identified copies (no source claim is made).
 * A pure copy read since the source variants embed their evidenced remote
 * name — no registry-evidence lookup is involved.
 */
export function copySourceRemote(copy: ResolvedDependencyCopy): string | null {
  switch (copy.source.kind) {
    case 'shared-declaration':
      return copy.source.participant;
    case 'private-registration':
      return copy.source.ownerRemote;
    case 'target-url':
      return null;
  }
}

/** Display form of a copy's source remote; null when no source is evidenced. */
export function copySourceDisplay(copy: ResolvedDependencyCopy): string | null {
  const remote = copySourceRemote(copy);
  return remote === null ? null : participantDisplay(remote);
}

export function isHostRemote(name: string | null): boolean {
  return name === NF_HOST;
}

/** Display file name of a target URL — its last path segment (query/hash stripped). */
export function targetFileName(targetUrl: string): string {
  const withoutQuery = targetUrl.split(/[?#]/, 1)[0];
  const segments = withoutQuery.split('/').filter((segment) => segment.length > 0);
  return segments.length > 0 ? segments[segments.length - 1] : targetUrl;
}

/** Qualified source wording of one resolved copy (T7 vocabulary). */
export interface CopySourceVm {
  /** Display form of the source remote; null when no source is evidenced. */
  display: string | null;
  host: boolean;
  /** `select` payload for the /remotes cross-link; null without a remote. */
  remoteSelect: string | null;
  qualifier:
    | 'exact-target-source'
    | 'explicit-anchor'
    | 'observed-target-source'
    | 'ambiguous-source'
    | 'unknown-source';
  label: string;
  note: string;
}

/**
 * Qualified source wording of one copy: explicit anchor when the copy
 * serves through `servedBy`, exact target source for a uniquely evidenced
 * record, observed target source for scope-prefix attribution, ambiguous
 * and unknown stay qualified. The registry-slot comparison rides along in
 * the note when slot evidence exists. Established with Packages (T7),
 * lifted here with its second consumer (T8 Remotes) — ambiguity must
 * render as ambiguity in every view, never as unknown. A pure copy read —
 * every input of the qualifier ladder is copy-embedded.
 */
export function copySourceVmOf(copy: ResolvedDependencyCopy): CopySourceVm {
  const remote = copySourceRemote(copy);
  const display = remote === null ? null : participantDisplay(remote);
  const base = { display, host: isHostRemote(remote), remoteSelect: remote };

  let vm: CopySourceVm;
  if (copy.source.kind !== 'target-url') {
    if (copy.effectiveRoles.includes('anchor-source')) {
      vm = {
        ...base,
        qualifier: 'explicit-anchor',
        label: 'explicit anchor',
        note: 'selected through an explicit servedBy anchor of the registry evidence',
      };
    } else {
      vm = {
        ...base,
        qualifier: 'exact-target-source',
        label: 'exact target source',
        note: 'uniquely evidenced source record — its candidate URL matches the resolved target exactly',
      };
    }
  } else if (copy.sourceDisposition === 'ambiguous-source') {
    vm = {
      ...base,
      qualifier: 'ambiguous-source',
      label: 'ambiguous source',
      note: 'several candidate sources match this target — none is chosen',
    };
  } else if (
    copy.observedTargetProviders.some((provider) => provider.outcome === 'ambiguous-scope')
  ) {
    // Scope-level ambiguity chooses no remote (`remote: null`) — it must
    // stay a qualified ambiguity, never fall through to "unknown source".
    vm = {
      ...base,
      qualifier: 'ambiguous-source',
      label: 'ambiguous source',
      note: 'equally specific remote scope prefixes match this target — none is chosen',
    };
  } else {
    const observed = copy.observedTargetProviders.find(
      (provider) =>
        provider.remote !== null &&
        (provider.outcome === 'scope-derived' || provider.outcome === 'host-fallback'),
    );
    if (observed !== undefined) {
      vm = {
        display: participantDisplay(observed.remote!),
        host: isHostRemote(observed.remote),
        remoteSelect: observed.remote,
        qualifier: 'observed-target-source',
        label: 'observed target source',
        note:
          observed.outcome === 'host-fallback'
            ? 'attributed by scope-prefix match with the host as least-specific fallback — not an exact candidate match'
            : 'attributed by scope-prefix match — not an exact candidate match',
      };
    } else {
      vm = {
        ...base,
        qualifier: 'unknown-source',
        label: 'unknown source',
        note: 'only the resolved URL is evidenced — no source record or scope prefix matches',
      };
    }
  }

  const slots = copy.registryServingSlotClaims.filter((slot) => slot.status === 'basis-slot');
  if (slots.length > 0 && copy.source.kind === 'shared-declaration') {
    const declarationId = copy.source.declarationId;
    const matches = slots.some((slot) => slot.declarationId === declarationId);
    vm = {
      ...vm,
      note: `${vm.note}; ${
        matches
          ? 'matches the registry serving slot'
          : 'the registry serving slot names another declaration'
      }`,
    };
  }
  return vm;
}
