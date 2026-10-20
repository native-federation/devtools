import {
  attributeObservedTargetProviders,
  candidateSubject,
  type ObservedTargetAttributionContext,
} from './attribute-observed-target-providers';
import type {
  ClaimMappingState,
  DeclarationResolutionClaim,
  ResolutionClaimsDerivation,
  ResolutionSubject,
  SourceComparison,
} from './claims-model';
import {
  candidateTargetStatus,
  createSourceComparison,
  observedAgreementStatus,
} from './compare-sources';
import { deriveRegistryServingSlots } from './derive-registry-serving-slots';
import { encodeRegistryIdTuple, registryEvidenceId } from './ids';
import type {
  CanonicalRegistryEvidence,
  EffectiveConsumerResolution,
  EntrypointCandidate,
  RegistrationAction,
  SharedExternalId,
  SharedExternalRecord,
  VersionRegistration,
} from './model';

export type ResolutionClaimsContext = ObservedTargetAttributionContext;

/**
 * Explains every canonical resolution claim against its already computed
 * effective binding. This module owns the action-path and mapping-state
 * rules; it never reruns import-map lookup, and a `blocked` binding stays
 * terminal with no target or source attribution.
 */
export function deriveResolutionClaims(
  evidence: CanonicalRegistryEvidence,
  resolutions: readonly EffectiveConsumerResolution[],
  context: ResolutionClaimsContext,
): ResolutionClaimsDerivation {
  const sharedById = new Map(evidence.sharedExternals.map((record) => [record.id, record]));
  const versionsById = new Map(
    evidence.versionRegistrations.map((registration) => [registration.id, registration]),
  );
  const declarationsById = new Map(
    evidence.participantDeclarations.map((declaration) => [declaration.id, declaration]),
  );
  const candidatesById = new Map(
    evidence.entrypointCandidates.map((candidate) => [candidate.id, candidate]),
  );

  const registryServingSlotClaims = deriveRegistryServingSlots(evidence);
  const slotByRegistration = new Map(
    registryServingSlotClaims.map((slot) => [slot.versionRegistrationId, slot]),
  );
  const { observedTargetProviders, sourceMatches } = attributeObservedTargetProviders(
    evidence,
    resolutions,
    context,
  );
  const providerByResolution = new Map(
    observedTargetProviders.map((provider) => [provider.resolutionId, provider]),
  );
  const sourceMatchByResolution = new Map(
    sourceMatches.map((sourceMatch) => [sourceMatch.resolutionId, sourceMatch]),
  );
  const resolutionsByConsumer = indexResolutionsByConsumer(resolutions);
  const surfaces = indexCandidateSurfaces(evidence, sharedById, versionsById);

  const declarationResolutionClaims: DeclarationResolutionClaim[] = [];
  const sourceComparisons: SourceComparison[] = [];

  for (const declaration of evidence.participantDeclarations) {
    const registration = requireRecord(
      versionsById,
      declaration.versionRegistrationId,
      'version registration',
    );
    const shared = requireRecord(sharedById, registration.sharedExternalId, 'shared external');
    for (const candidateId of declaration.entrypointCandidateIds) {
      const candidate = requireRecord(candidatesById, candidateId, 'entrypoint candidate');
      const resolution = requireResolution(
        resolutionsByConsumer,
        declaration.participant,
        candidate.specifier,
      );
      const claimId = registryEvidenceId(
        'declaration-resolution-claim',
        ['shared', declaration.id, candidate.id],
        0,
      );
      const provider = requireRecord(providerByResolution, resolution.id, 'observed provider');
      const sourceMatch = requireRecord(sourceMatchByResolution, resolution.id, 'source match');
      const targetUrl = resolution.status === 'mapped' ? resolution.targetUrl : null;
      const mappingState = sharedMappingState({
        resolution,
        action: registration.action,
        servedBy: declaration.servedBy,
        shareScope: shared.shareScope,
        sharedExternalId: shared.id,
        ownCandidateUrl: candidate.candidateUrl,
        surfaces,
      });

      const comparisons: SourceComparison[] = [];
      const slot = requireRecord(slotByRegistration, registration.id, 'registry serving slot');
      if (slot.status === 'basis-slot' && slot.declarationId !== null) {
        const slotDeclaration = requireRecord(
          declarationsById,
          slot.declarationId,
          'participant declaration',
        );
        comparisons.push(
          createSourceComparison({
            claimId,
            kind: 'slot-vs-observed',
            left: {
              kind: 'registry-serving-slot',
              slotClaimId: slot.id,
              declarationId: slot.declarationId,
            },
            right: {
              kind: 'observed-target-source',
              observedTargetProviderId: provider.id,
              subject: sourceMatch.source,
            },
            status: observedAgreementStatus({
              declarationId: slot.declarationId,
              remote: slotDeclaration.participant,
              sourceMatch,
              provider,
            }),
            provenance: {
              evidence: [...slot.provenance.evidence, ...provider.provenance.evidence],
            },
          }),
        );
      }
      if (declaration.servedBy !== null) {
        comparisons.push(
          createSourceComparison({
            claimId,
            kind: 'anchor-vs-observed',
            left: {
              kind: 'explicit-anchor',
              declarationId: declaration.id,
              remote: declaration.servedBy,
            },
            right: {
              kind: 'observed-target-source',
              observedTargetProviderId: provider.id,
              subject: sourceMatch.source,
            },
            status: observedAgreementStatus({
              declarationId: null,
              remote: declaration.servedBy,
              sourceMatch,
              provider,
            }),
            provenance: {
              evidence: [...declaration.provenance.evidence, ...provider.provenance.evidence],
            },
          }),
        );
      }
      comparisons.push(
        createSourceComparison({
          claimId,
          kind: 'candidate-vs-target',
          left: {
            kind: 'own-candidate',
            candidateId: candidate.id,
            normalizedUrl: candidate.candidateUrl,
          },
          right: {
            kind: 'effective-target',
            resolutionId: resolution.id,
            normalizedUrl: targetUrl,
          },
          status: candidateTargetStatus(candidate.candidateUrl, targetUrl),
          provenance: { evidence: [...candidate.provenance.evidence] },
        }),
      );
      sourceComparisons.push(...comparisons);

      declarationResolutionClaims.push({
        id: claimId,
        subject: { kind: 'shared', participantDeclarationId: declaration.id },
        consumerRemote: declaration.participant,
        resolutionDomain: { kind: 'share-scope', name: shared.shareScope },
        consumerRegistryPackage: shared.packageName,
        specifier: candidate.specifier,
        candidateId: candidate.id,
        effectiveResolutionId: resolution.id,
        ownCandidateUrl: candidate.candidateUrl,
        ownCandidateSelected: ownCandidateSelected(candidate.candidateUrl, targetUrl),
        mappingState,
        sourceAction: registration.action,
        copyId: null,
        comparisonIds: comparisons.map((comparison) => comparison.id),
        provenance: {
          evidence: [
            ...registration.provenance.evidence,
            ...declaration.provenance.evidence,
            ...candidate.provenance.evidence,
          ],
        },
      });
    }
  }

  for (const privateRegistration of evidence.privateRegistrations) {
    for (const candidateId of privateRegistration.entrypointCandidateIds) {
      const candidate = requireRecord(candidatesById, candidateId, 'entrypoint candidate');
      const resolution = requireResolution(
        resolutionsByConsumer,
        privateRegistration.ownerRemote,
        candidate.specifier,
      );
      const claimId = registryEvidenceId(
        'declaration-resolution-claim',
        ['private', privateRegistration.id, candidate.id],
        0,
      );
      const targetUrl = resolution.status === 'mapped' ? resolution.targetUrl : null;

      const comparison = createSourceComparison({
        claimId,
        kind: 'candidate-vs-target',
        left: {
          kind: 'own-candidate',
          candidateId: candidate.id,
          normalizedUrl: candidate.candidateUrl,
        },
        right: {
          kind: 'effective-target',
          resolutionId: resolution.id,
          normalizedUrl: targetUrl,
        },
        status: candidateTargetStatus(candidate.candidateUrl, targetUrl),
        provenance: { evidence: [...candidate.provenance.evidence] },
      });
      sourceComparisons.push(comparison);

      declarationResolutionClaims.push({
        id: claimId,
        subject: { kind: 'private', privateRegistrationId: privateRegistration.id },
        consumerRemote: privateRegistration.ownerRemote,
        resolutionDomain: { kind: 'private-owner', remote: privateRegistration.ownerRemote },
        consumerRegistryPackage: privateRegistration.packageName,
        specifier: candidate.specifier,
        candidateId: candidate.id,
        effectiveResolutionId: resolution.id,
        ownCandidateUrl: candidate.candidateUrl,
        ownCandidateSelected: ownCandidateSelected(candidate.candidateUrl, targetUrl),
        mappingState: privateMappingState(resolution, candidate.candidateUrl),
        sourceAction: 'private',
        copyId: null,
        comparisonIds: [comparison.id],
        provenance: {
          evidence: [...privateRegistration.provenance.evidence, ...candidate.provenance.evidence],
        },
      });
    }
  }

  return {
    registryServingSlotClaims,
    declarationResolutionClaims,
    observedTargetProviders,
    sourceMatches,
    sourceComparisons,
  };
}

/**
 * Candidate surfaces used by anchor and skip explanations. Keys are
 * structural, so equal tags in separate registrations never form one union;
 * every explanation stays within its share scope or shared external. An
 * anchored declaration serves only through the anchor surface — it never
 * feeds the ordinary share or skip explanation surface.
 */
interface CandidateSurfaces {
  /** `(shareScope, anchorRemote, specifier)` -> shared candidates across externals. */
  anchorCandidates: ReadonlyMap<string, EntrypointCandidate[]>;
  /** `(sharedExternalId, action, specifier)` -> non-anchored same-external candidates. */
  sameExternalCandidates: ReadonlyMap<string, EntrypointCandidate[]>;
}

function indexCandidateSurfaces(
  evidence: CanonicalRegistryEvidence,
  sharedById: ReadonlyMap<SharedExternalId, SharedExternalRecord>,
  versionsById: ReadonlyMap<VersionRegistration['id'], VersionRegistration>,
): CandidateSurfaces {
  const anchorCandidates = new Map<string, EntrypointCandidate[]>();
  const sameExternalCandidates = new Map<string, EntrypointCandidate[]>();
  const candidatesById = new Map(
    evidence.entrypointCandidates.map((candidate) => [candidate.id, candidate]),
  );

  for (const declaration of evidence.participantDeclarations) {
    const registration = requireRecord(
      versionsById,
      declaration.versionRegistrationId,
      'version registration',
    );
    const shared = requireRecord(sharedById, registration.sharedExternalId, 'shared external');
    for (const candidateId of declaration.entrypointCandidateIds) {
      const candidate = requireRecord(candidatesById, candidateId, 'entrypoint candidate');
      push(
        anchorCandidates,
        encodeRegistryIdTuple([shared.shareScope, declaration.participant, candidate.specifier]),
        candidate,
      );
      if (declaration.servedBy === null) {
        push(
          sameExternalCandidates,
          encodeRegistryIdTuple([shared.id, registration.action, candidate.specifier]),
          candidate,
        );
      }
    }
  }
  return { anchorCandidates, sameExternalCandidates };
}

function push(
  index: Map<string, EntrypointCandidate[]>,
  key: string,
  candidate: EntrypointCandidate,
): void {
  const list = index.get(key) ?? [];
  list.push(candidate);
  index.set(key, list);
}

/**
 * The normative mapping-state precedence: `anchored`, `own-selected`,
 * `fallback`, `not-selected`, `blocked`, `unknown`.
 */
function sharedMappingState(options: {
  resolution: EffectiveConsumerResolution;
  action: RegistrationAction;
  servedBy: string | null;
  shareScope: string;
  sharedExternalId: SharedExternalId;
  ownCandidateUrl: string | null;
  surfaces: CandidateSurfaces;
}): ClaimMappingState {
  const { resolution, surfaces } = options;
  const targetUrl = resolution.status === 'mapped' ? resolution.targetUrl : null;

  if (options.servedBy !== null && targetUrl !== null) {
    const anchorKey = encodeRegistryIdTuple([
      options.shareScope,
      options.servedBy,
      resolution.specifier,
    ]);
    if (anyCandidateMatches(surfaces.anchorCandidates.get(anchorKey), targetUrl)) {
      return 'anchored';
    }
  }
  if (
    targetUrl !== null &&
    options.ownCandidateUrl !== null &&
    targetUrl === options.ownCandidateUrl
  ) {
    return 'own-selected';
  }
  if (targetUrl !== null && options.action === 'skip') {
    const shareKey = encodeRegistryIdTuple([
      options.sharedExternalId,
      'share',
      resolution.specifier,
    ]);
    if (uniqueSubjectMatches(surfaces.sameExternalCandidates.get(shareKey), targetUrl)) {
      return 'fallback';
    }
  }
  if (targetUrl !== null && options.ownCandidateUrl !== null) {
    return 'not-selected';
  }
  if (resolution.status === 'blocked') {
    return 'blocked';
  }
  return 'unknown';
}

function privateMappingState(
  resolution: EffectiveConsumerResolution,
  ownCandidateUrl: string | null,
): ClaimMappingState {
  const targetUrl = resolution.status === 'mapped' ? resolution.targetUrl : null;
  if (targetUrl !== null && ownCandidateUrl !== null) {
    return targetUrl === ownCandidateUrl ? 'own-selected' : 'not-selected';
  }
  if (resolution.status === 'blocked') {
    return 'blocked';
  }
  return 'unknown';
}

function ownCandidateSelected(
  ownCandidateUrl: string | null,
  effectiveTargetUrl: string | null,
): boolean | null {
  if (ownCandidateUrl === null || effectiveTargetUrl === null) {
    return null;
  }
  return ownCandidateUrl === effectiveTargetUrl;
}

function anyCandidateMatches(
  candidates: readonly EntrypointCandidate[] | undefined,
  targetUrl: string,
): boolean {
  return (candidates ?? []).some(
    (candidate) => candidate.candidateUrl !== null && candidate.candidateUrl === targetUrl,
  );
}

/** True when exactly one subject's candidates match the target URL. */
function uniqueSubjectMatches(
  candidates: readonly EntrypointCandidate[] | undefined,
  targetUrl: string,
): boolean {
  const subjects = new Set<string>();
  for (const candidate of candidates ?? []) {
    if (candidate.candidateUrl !== null && candidate.candidateUrl === targetUrl) {
      subjects.add(subjectKey(candidateSubject(candidate)));
    }
  }
  return subjects.size === 1;
}

function subjectKey(subject: ResolutionSubject): string {
  return encodeRegistryIdTuple([
    subject.kind,
    subject.kind === 'shared' ? subject.participantDeclarationId : subject.privateRegistrationId,
  ]);
}

function indexResolutionsByConsumer(
  resolutions: readonly EffectiveConsumerResolution[],
): ReadonlyMap<string, ReadonlyMap<string, EffectiveConsumerResolution>> {
  const byConsumer = new Map<string, Map<string, EffectiveConsumerResolution>>();
  for (const resolution of resolutions) {
    for (const consumerRemote of resolution.consumerRemotes) {
      let bySpecifier = byConsumer.get(consumerRemote);
      if (bySpecifier === undefined) {
        bySpecifier = new Map();
        byConsumer.set(consumerRemote, bySpecifier);
      }
      if (bySpecifier.has(resolution.specifier)) {
        throw new Error(
          `Multiple effective resolutions for consumer ${consumerRemote} and specifier ${resolution.specifier}`,
        );
      }
      bySpecifier.set(resolution.specifier, resolution);
    }
  }
  return byConsumer;
}

function requireResolution(
  resolutionsByConsumer: ReadonlyMap<string, ReadonlyMap<string, EffectiveConsumerResolution>>,
  consumerRemote: string,
  specifier: string,
): EffectiveConsumerResolution {
  const resolution = resolutionsByConsumer.get(consumerRemote)?.get(specifier);
  if (resolution === undefined) {
    throw new Error(
      `Missing effective resolution for consumer ${consumerRemote} and specifier ${specifier}`,
    );
  }
  return resolution;
}

function requireRecord<Key, RecordType>(
  records: ReadonlyMap<Key, RecordType>,
  id: Key,
  label: string,
): RecordType {
  const record = records.get(id);
  if (record === undefined) {
    throw new Error(`Canonical evidence references a missing ${label}: ${String(id)}`);
  }
  return record;
}
