import type { GenerationV1 } from 'devtools-bridge';

declare const registryEvidenceIdKind: unique symbol;
declare const effectiveConsumerResolutionIdKind: unique symbol;

/** A deterministic, structurally encoded identity for one canonical evidence record. */
export type RegistryEvidenceId<Kind extends string> = string & {
  readonly [registryEvidenceIdKind]: Kind;
};

export type SharedExternalId = RegistryEvidenceId<'shared-external'>;
export type VersionRegistrationId = RegistryEvidenceId<'version-registration'>;
export type ParticipantDeclarationId = RegistryEvidenceId<'participant-declaration'>;
export type PrivateRegistrationId = RegistryEvidenceId<'private-registration'>;
export type EntrypointCandidateId = RegistryEvidenceId<'entrypoint-candidate'>;
export type RegistryEvidenceDiagnosticId = RegistryEvidenceId<'diagnostic'>;

/** Stable identity of one unique `(scope-context-or-missing-key, specifier)` lookup. */
export type EffectiveConsumerResolutionId = string & {
  readonly [effectiveConsumerResolutionIdKind]: 'effective-consumer-resolution';
};

export type EvidencePathSegment = string | number;

/** A JSON-safe pointer to present or explicitly absent snapshot evidence. */
export interface EvidenceRef {
  source: 'snapshot';
  path: EvidencePathSegment[];
  state: 'present' | 'missing';
}

/** Every fact used to construct a canonical or derived evidence record. */
export interface EvidenceProvenance {
  evidence: EvidenceRef[];
}

export type RegistrationAction = 'share' | 'skip' | 'scope' | 'unknown';

/**
 * One shared-external wrapper per captured `(shareScope, packageName)` key.
 * Wrapper-level `dirty` belongs here only; registrations retain their raw order.
 */
export interface SharedExternalRecord {
  id: SharedExternalId;
  /** Equal-key occurrence, normally zero because repository object keys are unique. */
  ordinal: number;
  shareScope: string;
  packageName: string;
  dirty: boolean;
  /** Stored pool name (orchestrator v4.7+), or null when the raw key is absent; never inferred. */
  poolName: string | null;
  versionRegistrationIds: VersionRegistrationId[];
  provenance: EvidenceProvenance;
}

/**
 * One exact element of a shared external's captured `versions[]` array.
 * It is evidence of registration, not a winning version or resolved copy.
 */
export interface VersionRegistration {
  id: VersionRegistrationId;
  sharedExternalId: SharedExternalId;
  /** Occurrence among equal `(tag, rawAction)` keys under the same shared external. */
  ordinal: number;
  tag: string;
  action: RegistrationAction;
  rawAction: string;
  host: boolean;
  participantDeclarationIds: ParticipantDeclarationId[];
  provenance: EvidenceProvenance;
}

/**
 * One exact element of a version registration's captured `remotes[]` array.
 * A participant is neither a version registration nor proof of an effective copy.
 */
export interface ParticipantDeclaration {
  id: ParticipantDeclarationId;
  versionRegistrationId: VersionRegistrationId;
  /** Occurrence among equal participant names under the same version registration. */
  ordinal: number;
  participant: string;
  requiredVersion: string;
  strictVersion: boolean;
  bundle: string | null;
  cached: boolean;
  generation: GenerationV1;
  /** Direct snapshot pool label, or null when the raw key is absent; never inferred. */
  pool: string | null;
  /** Direct snapshot anchor, or null when the raw key is absent; never inferred. */
  servedBy: string | null;
  /** Stored reason pooling made this copy serve itself (v4.7+), or null when absent; never inferred. */
  poolCause: string | null;
  entrypointCandidateIds: EntrypointCandidateId[];
  provenance: EvidenceProvenance;
}

/**
 * One private registration per captured scoped-external
 * `(ownerRemote, packageName)` key. It has no shared action or share scope.
 */
export interface PrivateRegistration {
  id: PrivateRegistrationId;
  /** Equal-key occurrence, normally zero because repository object keys are unique. */
  ordinal: number;
  ownerRemote: string;
  packageName: string;
  tag: string;
  bundle: string | null;
  entrypointCandidateIds: EntrypointCandidateId[];
  provenance: EvidenceProvenance;
}

/** The source spelling from which a generation-neutral candidate was derived. */
export type EntrypointCandidateSource =
  | {
      kind: 'participant-file';
      participantDeclarationId: ParticipantDeclarationId;
    }
  | {
      kind: 'participant-entry';
      participantDeclarationId: ParticipantDeclarationId;
    }
  | {
      kind: 'private-entry';
      privateRegistrationId: PrivateRegistrationId;
    };

/** Why an entrypoint candidate does or does not have a constructed absolute URL. */
export type CandidateUrlState =
  'available' | 'missing-owner-scope' | 'unusable-owner-scope' | 'unusable-file';

/**
 * One ordered specifier/file pair derived from captured participant or private
 * registration evidence. A candidate URL is possible evidence, never an effective binding.
 */
export interface EntrypointCandidate {
  id: EntrypointCandidateId;
  sourceRecord: EntrypointCandidateSource;
  /** Occurrence among equal `(specifier, file)` keys under the same source record. */
  ordinal: number;
  ownerRemote: string;
  specifier: string;
  file: string;
  candidateUrl: string | null;
  candidateUrlState: CandidateUrlState;
  provenance: EvidenceProvenance;
}

/** A lossless warning emitted while canonical evidence is normalized. */
export interface RegistryEvidenceDiagnostic {
  id: RegistryEvidenceDiagnosticId;
  code: 'unknown-action';
  severity: 'warning';
  versionRegistrationId: VersionRegistrationId;
  rawValue: string;
  message: string;
  provenance: EvidenceProvenance;
}

/**
 * Canonical, ordered registry evidence. Flat arrays make every raw occurrence
 * independently addressable while parent/child ID lists retain containment.
 */
export interface CanonicalRegistryEvidence {
  sharedExternals: SharedExternalRecord[];
  versionRegistrations: VersionRegistration[];
  participantDeclarations: ParticipantDeclaration[];
  privateRegistrations: PrivateRegistration[];
  entrypointCandidates: EntrypointCandidate[];
  diagnostics: RegistryEvidenceDiagnostic[];
}

/** The exact merged import-map entry that decided a mapped or blocked lookup. */
export interface EffectiveMapEntryProvenance {
  source: 'effective-import-map';
  /** Null identifies the top-level `imports` map. */
  scope: string | null;
  specifier: string;
  target: string;
  match: 'exact' | 'prefix';
}

interface EffectiveConsumerResolutionBase {
  id: EffectiveConsumerResolutionId;
  /** Structural key for either a normalized consumer scope URL or one missing-scope sentinel. */
  scopeContextKey: string;
  /**
   * Normalized remote scope URL used as the resolution context at the
   * consumer's scope root. This is not an observed importer-module URL;
   * modules under more specific scopes or outside this scope can resolve
   * differently.
   */
  consumerScopeUrl: string | null;
  specifier: string;
  /** Sorted, de-duplicated consumer aliases represented by this lookup. */
  consumerRemotes: string[];
}

export interface MappedEffectiveConsumerResolution extends EffectiveConsumerResolutionBase {
  status: 'mapped';
  targetUrl: string;
  hasIntegrity: boolean;
  mapEntry: EffectiveMapEntryProvenance;
}

/** Known map and consumer scope context, but no applicable import-map binding. */
export interface UnmappedEffectiveConsumerResolution extends EffectiveConsumerResolutionBase {
  status: 'unmapped';
  targetUrl: null;
  mapEntry: null;
}

/** Why the matching import-map entry cannot produce a valid target. */
export type EffectiveConsumerResolutionBlockedReason =
  | 'invalid-target-url'
  | 'prefix-target-missing-trailing-slash'
  | 'invalid-prefix-expansion'
  | 'prefix-target-backtracking';

/** A matching entry terminally prevents a valid target and any further fallback. */
export interface BlockedEffectiveConsumerResolution extends EffectiveConsumerResolutionBase {
  status: 'blocked';
  targetUrl: null;
  mapEntry: EffectiveMapEntryProvenance;
  blockedReason: EffectiveConsumerResolutionBlockedReason;
}

export type EffectiveConsumerResolutionUnknownReason =
  'missing-map-channel' | 'missing-consumer-scope';

/** The import-map binding cannot be evaluated because required evidence is missing. */
export interface UnknownEffectiveConsumerResolution extends EffectiveConsumerResolutionBase {
  status: 'unknown';
  targetUrl: null;
  mapEntry: null;
  unknownReasons: EffectiveConsumerResolutionUnknownReason[];
}

/** One canonical lookup outcome per unique consumer scope context (or sentinel) and specifier. */
export type EffectiveConsumerResolution =
  | MappedEffectiveConsumerResolution
  | UnmappedEffectiveConsumerResolution
  | BlockedEffectiveConsumerResolution
  | UnknownEffectiveConsumerResolution;
