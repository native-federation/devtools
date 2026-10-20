import type { ResolvedDependencyCopyId } from './copies-model';
import type {
  EffectiveConsumerResolutionId,
  EntrypointCandidateId,
  EvidenceProvenance,
  ParticipantDeclarationId,
  PrivateRegistrationId,
  RegistrationAction,
  RegistryEvidenceId,
  VersionRegistrationId,
} from './model';

export type RegistryServingSlotClaimId = RegistryEvidenceId<'registry-serving-slot-claim'>;
export type DeclarationResolutionClaimId = RegistryEvidenceId<'declaration-resolution-claim'>;
export type ObservedTargetProviderId = RegistryEvidenceId<'observed-target-provider'>;
export type SourceComparisonId = RegistryEvidenceId<'source-comparison'>;

/** The registry record whose candidate claims one specifier for one consumer. */
export type ResolutionSubject =
  | { kind: 'shared'; participantDeclarationId: ParticipantDeclarationId }
  | { kind: 'private'; privateRegistrationId: PrivateRegistrationId };

/** The registry resolution domain a claim belongs to; never an import-map URL scope. */
export type ResolutionDomain =
  { kind: 'share-scope'; name: string } | { kind: 'private-owner'; remote: string };

/**
 * The source-defined basis slot of one version registration, read from stored
 * order only. It answers a registry question and is never a universal
 * per-specifier provider; secondary entrypoints can be supplied by later
 * declarations of the same registration.
 */
export interface RegistryServingSlotClaim {
  id: RegistryServingSlotClaimId;
  versionRegistrationId: VersionRegistrationId;
  /** First stored declaration for `basis-slot`; null for `not-applicable`/`empty`. */
  declarationId: ParticipantDeclarationId | null;
  status: 'basis-slot' | 'not-applicable' | 'empty';
  provenance: EvidenceProvenance;
}

/**
 * How one claim relates to its computed binding, in normative precedence
 * order. No state means requested, downloaded, evaluated, or used.
 */
export type ClaimMappingState =
  'anchored' | 'own-selected' | 'fallback' | 'not-selected' | 'blocked' | 'unknown';

/**
 * One shared declaration or private registration candidate claiming one
 * specifier for one consumer. Several claims may point at the same effective
 * binding; the claim never duplicates the binding.
 */
export interface DeclarationResolutionClaim {
  id: DeclarationResolutionClaimId;
  subject: ResolutionSubject;
  consumerRemote: string;
  resolutionDomain: ResolutionDomain;
  /** The registry package the consumer declared under, not the source package. */
  consumerRegistryPackage: string;
  specifier: string;
  candidateId: EntrypointCandidateId;
  effectiveResolutionId: EffectiveConsumerResolutionId;
  ownCandidateUrl: string | null;
  /** Exact own-candidate/target equality; null when either side cannot be evaluated. */
  ownCandidateSelected: boolean | null;
  mappingState: ClaimMappingState;
  sourceAction: RegistrationAction | 'private';
  /**
   * The resolved copy this claim's mapped binding materializes; explicit null
   * for unmapped, blocked, and unknown bindings. `deriveResolutionClaims`
   * emits null; `attachCopyIds` completes the field after materialization.
   */
  copyId: ResolvedDependencyCopyId | null;
  comparisonIds: SourceComparisonId[];
  provenance: EvidenceProvenance;
}

/** Attribution strength for one observed effective target; never delivery proof. */
export type SourceMatchOutcome =
  | 'exact-candidate'
  | 'ambiguous-candidate'
  | 'scope-derived'
  | 'ambiguous-scope'
  | 'host-fallback'
  | 'unattributable'
  | 'unknown';

/** The remote attributed from one effective target URL, with its qualifying rule. */
export interface ObservedTargetProvider {
  id: ObservedTargetProviderId;
  resolutionId: EffectiveConsumerResolutionId;
  remote: string | null;
  outcome: SourceMatchOutcome;
  rule: 'exact-candidate' | 'scope-prefix-match' | 'host-fallback' | 'none';
  provenance: EvidenceProvenance;
}

/**
 * The observed source attribution of one effective resolution. `source` names
 * a unique exact subject only; ambiguity retains all candidates and chooses none.
 */
export interface SourceMatch {
  resolutionId: EffectiveConsumerResolutionId;
  outcome: SourceMatchOutcome;
  source: ResolutionSubject | null;
  candidateIds: EntrypointCandidateId[];
  observedTargetProviderId: ObservedTargetProviderId;
  provenance: EvidenceProvenance;
}

export type SourceComparisonKind =
  'slot-vs-observed' | 'anchor-vs-observed' | 'candidate-vs-target';

/** One qualified side of a comparison; the qualifier is part of the claim. */
export type QualifiedSourceClaim =
  | {
      kind: 'registry-serving-slot';
      slotClaimId: RegistryServingSlotClaimId;
      declarationId: ParticipantDeclarationId | null;
    }
  | { kind: 'explicit-anchor'; declarationId: ParticipantDeclarationId; remote: string }
  | { kind: 'own-candidate'; candidateId: EntrypointCandidateId; normalizedUrl: string | null }
  | {
      kind: 'observed-target-source';
      observedTargetProviderId: ObservedTargetProviderId;
      subject: ResolutionSubject | null;
    }
  | {
      kind: 'effective-target';
      resolutionId: EffectiveConsumerResolutionId;
      normalizedUrl: string | null;
    };

/**
 * A comparison between two qualified source claims. Agreement never erases
 * either side; mismatch and ambiguity remain data, not overwrite permission.
 * Orientation is canonical: registry slot, explicit anchor, or own candidate
 * is always `left`; observed source or effective target is always `right`.
 */
export interface SourceComparison {
  id: SourceComparisonId;
  claimId: DeclarationResolutionClaimId;
  kind: SourceComparisonKind;
  left: QualifiedSourceClaim;
  right: QualifiedSourceClaim;
  status: 'match' | 'mismatch' | 'unknown';
  provenance: EvidenceProvenance;
}

/** The complete pure derivation output for one canonical model state. */
export interface ResolutionClaimsDerivation {
  registryServingSlotClaims: RegistryServingSlotClaim[];
  declarationResolutionClaims: DeclarationResolutionClaim[];
  observedTargetProviders: ObservedTargetProvider[];
  sourceMatches: SourceMatch[];
  sourceComparisons: SourceComparison[];
}
