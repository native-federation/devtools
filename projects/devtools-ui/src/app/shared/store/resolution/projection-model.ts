import type { BundleClaim, ChunkGroupProjection } from './bundle-claims-model';
import type {
  ClaimMappingState,
  DeclarationResolutionClaim,
  DeclarationResolutionClaimId,
  ObservedTargetProvider,
  RegistryServingSlotClaim,
  SourceComparison,
} from './claims-model';
import type {
  PackageResolutionMeasures,
  ResolvedDependencyCopy,
  ResolvedDependencyCopyId,
} from './copies-model';
import type { CopyGroupingFacets, OrphanPoolTag, TagPool } from './grouping-model';
import type { EffectiveConsumerResolutionId, RegistryEvidenceId } from './model';
import type { PoolFamily } from './pool-family-model';
import type { PackageScopeVerdicts } from './verdict-model';

export type ConsumerCopyRelationId = RegistryEvidenceId<'consumer-copy-relation'>;

/** One remote of the capture as the projection presents it to views. */
export interface RemoteProjection {
  name: string;
  isHost: boolean;
  /** As recorded — live registries keep relative scope URLs. */
  scopeUrl: string;
  /** Resolved against the page base. */
  resolvedScopeUrl: string;
}

/**
 * How one consumer remote relates to one resolved copy, keyed
 * `(consumerRemote, copyId)`. Every supporting resolution ID, claim ID, and
 * mapping state is retained; multiple specifier paths never collapse into a
 * first-edge-wins or a single boolean.
 */
export interface ConsumerCopyRelation {
  id: ConsumerCopyRelationId;
  consumerRemote: string;
  copyId: ResolvedDependencyCopyId;
  effectiveResolutionIds: EffectiveConsumerResolutionId[];
  claimIds: DeclarationResolutionClaimId[];
  mappingStates: ClaimMappingState[];
}

/**
 * Unique-binding counts; a binding shared by consumers is counted once.
 * `ambiguousSourceClaims` covers both ambiguity kinds of §6: ambiguous exact
 * candidates count each affected declaration claim, and an ambiguous scope
 * attribution counts its single ambiguous provider claim per binding.
 */
export interface CompletenessCounts {
  unknownResolutions: number;
  unmappedResolutions: number;
  blockedResolutions: number;
  ambiguousSourceClaims: number;
}

export type ConsumerResolutionIssue =
  'unknown-resolution' | 'unmapped-resolution' | 'blocked-resolution' | 'ambiguous-source';

/** One consumer's view of one incomplete or ambiguous resolution outcome. */
export interface IncompleteConsumerResolution {
  consumerRemote: string;
  effectiveResolutionId: EffectiveConsumerResolutionId;
  issues: ConsumerResolutionIssue[];
  /**
   * This consumer's claims whose exact source attribution stayed ambiguous;
   * empty for a scope-level ambiguity, whose `ambiguous-source` issue names
   * no declaration claim.
   */
  ambiguousClaimIds: DeclarationResolutionClaimId[];
}

/**
 * Completeness of the projection. `total` counts unique bindings and claims;
 * `byConsumer` counts per consumer remote — every published remote appears
 * with explicit (possibly zero) counts — and must never be summed into a
 * unique-binding total because one binding can belong to several consumers.
 * A filtered aggregate de-duplicates `consumerIssues` by effective-resolution
 * ID and claim ID.
 */
export interface ResolutionCompleteness {
  total: CompletenessCounts;
  byConsumer: Record<string, CompletenessCounts>;
  consumerIssues: IncompleteConsumerResolution[];
}

/**
 * The raw-free canonical resolution projection — the one surface migrated
 * views and any future graph read. It never exposes `SnapshotV1`, the raw
 * repositories, or the compatibility `sharedRows`; resolution IDs resolve
 * against the canonical `effectiveConsumerResolutions` collection. Nothing
 * in it proves requests, downloads, cache hits, or execution.
 */
export interface CanonicalResolutionProjection {
  remotes: RemoteProjection[];
  /** Every canonical source disposition and effective role stays visible. */
  copies: ResolvedDependencyCopy[];
  consumerRelations: ConsumerCopyRelation[];
  chunkGroups: ChunkGroupProjection[];
  bundleClaims: BundleClaim[];
  /** The complete claim surface, `copyId` links attached. */
  declarationResolutionClaims: DeclarationResolutionClaim[];
  registryServingSlotClaims: RegistryServingSlotClaim[];
  observedTargetProviders: ObservedTargetProvider[];
  sourceComparisons: SourceComparison[];
  packageMeasures: PackageResolutionMeasures[];
  tagPools: TagPool[];
  orphanPoolTags: OrphanPoolTag[];
  /** One family view per `tagPools` entry, same order. */
  poolFamilies: PoolFamily[];
  /** One entry per copy, in `copies` order. */
  copyGroupingFacets: CopyGroupingFacets[];
  packageScopeVerdicts: PackageScopeVerdicts[];
  completeness: ResolutionCompleteness;
}
