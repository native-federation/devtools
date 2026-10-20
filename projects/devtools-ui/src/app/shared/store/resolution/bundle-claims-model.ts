import type { ResolvedDependencyCopyId } from './copies-model';
import type {
  EvidenceProvenance,
  ParticipantDeclarationId,
  PrivateRegistrationId,
  RegistryEvidenceId,
} from './model';

export type ChunkGroupId = RegistryEvidenceId<'chunk-group'>;
export type BundleClaimId = RegistryEvidenceId<'bundle-claim'>;

/**
 * Which witnessed chunk source emitted a group: the dense `shared-chunks`
 * registry (v4/dense builds) or a legacy `@nf-internal/...` pseudo-external
 * (v4.5 non-dense builds). Only `shared-chunks` groups join dependency
 * bundle claims; pseudo-external groups retain their raw provenance and stay
 * outside shared-dependency attribution.
 */
export type ChunkGroupOrigin = 'shared-chunks' | 'scoped-pseudo-external';

/**
 * One emitter-aware chunk group. Identity retains the emitter remote, the
 * origin, and the bundle or pseudo-package, so equal chunk filenames from
 * different emitters never merge. Files are recorded registry evidence, not
 * proof of requests or downloads.
 */
export interface ChunkGroupProjection {
  id: ChunkGroupId;
  emitterRemote: string;
  origin: ChunkGroupOrigin;
  /** Bundle name when the source carries one; the dependency-attribution join key. */
  bundleName: string | null;
  /** The `@nf-internal/...` package name for pseudo-external groups. */
  pseudoPackage: string | null;
  /** Recorded chunk file names in registry order. */
  files: string[];
  provenance: EvidenceProvenance;
}

/**
 * Whether a copy's bundle evidence is backed by registered chunks. Only
 * `mapped-source` may be presented without qualification; `source-only`
 * (bundle declared, no registered chunk group — e.g. a named share scope) and `ambiguous` (no unique source) surface uncertainty.
 */
export type BundleClaimStatus = 'mapped-source' | 'source-only' | 'ambiguous';

/** The uniquely evidenced source record behind a bundle claim. */
export type BundleClaimSource =
  | { kind: 'shared'; declarationId: ParticipantDeclarationId }
  | { kind: 'private'; registrationId: PrivateRegistrationId };

/**
 * One copy's claim on an emitted bundle, attributed only through the copy's
 * selected source. A declaration's raw `bundle` never attributes to every
 * related resolution, and a non-selected bundle-bearing declaration donates
 * nothing. Ambiguous claims retain each candidate `(sourceRemote, bundle)`
 * pair without choosing a source or attributing chunk groups.
 */
export interface BundleClaim {
  id: BundleClaimId;
  copyId: ResolvedDependencyCopyId;
  /** Null under ambiguity: candidates are surfaced, never chosen. */
  source: BundleClaimSource | null;
  sourceRemote: string | null;
  bundle: string;
  /** Registered `shared-chunks` groups of `(sourceRemote, bundle)`; sorted. */
  chunkGroupIds: ChunkGroupId[];
  status: BundleClaimStatus;
  provenance: EvidenceProvenance;
}
