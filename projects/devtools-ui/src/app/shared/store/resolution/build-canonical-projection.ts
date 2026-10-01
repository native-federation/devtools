import type { BundleClaim, ChunkGroupProjection } from './bundle-claims-model';
import type { DeclarationResolutionClaim, ResolutionClaimsDerivation } from './claims-model';
import type { PackageResolutionMeasures, ResolvedDependencyCopy } from './copies-model';
import type { CopyGroupingFacets, TagPoolDerivation } from './grouping-model';
import type { PoolFamily } from './pool-family-model';
import { registryEvidenceId } from './ids';
import type { EffectiveConsumerResolution } from './model';
import type {
  CanonicalResolutionProjection,
  CompletenessCounts,
  ConsumerCopyRelation,
  ConsumerResolutionIssue,
  IncompleteConsumerResolution,
  RemoteProjection,
} from './projection-model';

export interface CanonicalProjectionInputs {
  /** Remotes in preserved registry order. */
  remotes: readonly RemoteProjection[];
  resolutions: readonly EffectiveConsumerResolution[];
  /** Claims derivation whose declaration claims are already copy-attached. */
  claims: ResolutionClaimsDerivation;
  /** Copies with attached `bundleClaimIds`. */
  copies: readonly ResolvedDependencyCopy[];
  chunkGroups: readonly ChunkGroupProjection[];
  bundleClaims: readonly BundleClaim[];
  packageMeasures: readonly PackageResolutionMeasures[];
  tagPools: TagPoolDerivation;
  copyGroupingFacets: readonly CopyGroupingFacets[];
  poolFamilies: readonly PoolFamily[];
}

/**
 * Assembles the raw-free canonical projection: consumer-copy relations from
 * the materialized copies and their attached claims, plus completeness
 * totals, per-consumer counts, and per-consumer issue records for unknown,
 * unmapped, blocked, and ambiguous results. Aggregation counts each unique
 * binding once — a binding shared by several consumer contexts never double
 * counts in `total`, and per-consumer counts overlap by design.
 */
export function buildCanonicalProjection(
  inputs: CanonicalProjectionInputs,
): CanonicalResolutionProjection {
  return {
    remotes: [...inputs.remotes],
    copies: [...inputs.copies],
    consumerRelations: deriveConsumerRelations(inputs),
    chunkGroups: [...inputs.chunkGroups],
    bundleClaims: [...inputs.bundleClaims],
    declarationResolutionClaims: [...inputs.claims.declarationResolutionClaims],
    registryServingSlotClaims: [...inputs.claims.registryServingSlotClaims],
    observedTargetProviders: [...inputs.claims.observedTargetProviders],
    sourceComparisons: [...inputs.claims.sourceComparisons],
    packageMeasures: [...inputs.packageMeasures],
    tagPools: [...inputs.tagPools.tagPools],
    orphanPoolTags: [...inputs.tagPools.orphanPoolTags],
    poolFamilies: [...inputs.poolFamilies],
    copyGroupingFacets: [...inputs.copyGroupingFacets],
    completeness: deriveCompleteness(inputs),
  };
}

function deriveConsumerRelations(inputs: CanonicalProjectionInputs): ConsumerCopyRelation[] {
  const resolutionsById = new Map(
    inputs.resolutions.map((resolution) => [resolution.id, resolution]),
  );
  const relations = new Map<string, ConsumerCopyRelation>();
  const relation = (consumerRemote: string, copyId: ResolvedDependencyCopy['id']) => {
    const id = registryEvidenceId('consumer-copy-relation', [consumerRemote, copyId], 0);
    let record = relations.get(id);
    if (record === undefined) {
      record = {
        id,
        consumerRemote,
        copyId,
        effectiveResolutionIds: [],
        claimIds: [],
        mappingStates: [],
      };
      relations.set(id, record);
    }
    return record;
  };
  // A relation exists for every consumer that resolves to the copy, even
  // when a candidate-less declaration left the binding without a claim.
  for (const copy of inputs.copies) {
    for (const resolutionId of copy.effectiveResolutionIds) {
      const resolution = resolutionsById.get(resolutionId);
      if (resolution === undefined) {
        throw new Error(`Projection references a missing resolution: ${resolutionId}`);
      }
      for (const consumerRemote of resolution.consumerRemotes) {
        relation(consumerRemote, copy.id).effectiveResolutionIds.push(resolutionId);
      }
    }
  }
  for (const claim of inputs.claims.declarationResolutionClaims) {
    if (claim.copyId === null) {
      continue;
    }
    const record = relation(claim.consumerRemote, claim.copyId);
    record.claimIds.push(claim.id);
    record.mappingStates.push(claim.mappingState);
  }
  return [...relations.values()]
    .map((record) => ({
      ...record,
      effectiveResolutionIds: sortedDistinct(record.effectiveResolutionIds),
      claimIds: sortedDistinct(record.claimIds),
      mappingStates: sortedDistinct(record.mappingStates),
    }))
    .sort((a, b) => compareText(a.id, b.id));
}

function deriveCompleteness(
  inputs: CanonicalProjectionInputs,
): CanonicalResolutionProjection['completeness'] {
  const sourceMatchByResolution = new Map(
    inputs.claims.sourceMatches.map((sourceMatch) => [sourceMatch.resolutionId, sourceMatch]),
  );
  const claimsByResolution = new Map<string, DeclarationResolutionClaim[]>();
  for (const claim of inputs.claims.declarationResolutionClaims) {
    const list = claimsByResolution.get(claim.effectiveResolutionId) ?? [];
    list.push(claim);
    claimsByResolution.set(claim.effectiveResolutionId, list);
  }

  const total = emptyCounts();
  const byConsumer = new Map<string, CompletenessCounts>();
  const counts = (consumerRemote: string): CompletenessCounts => {
    let record = byConsumer.get(consumerRemote);
    if (record === undefined) {
      record = emptyCounts();
      byConsumer.set(consumerRemote, record);
    }
    return record;
  };
  // Every published remote carries explicit counts — a remote without any
  // declaration is vacuously complete at zero, never absent from the record.
  for (const remote of inputs.remotes) {
    counts(remote.name);
  }
  const consumerIssues: IncompleteConsumerResolution[] = [];

  for (const resolution of inputs.resolutions) {
    for (const consumerRemote of resolution.consumerRemotes) {
      counts(consumerRemote);
    }
    // Both ambiguity kinds are ambiguous source claims: ambiguous exact
    // candidates count each affected declaration claim, an ambiguous scope
    // attribution counts its single provider claim once per binding.
    const sourceMatch = sourceMatchByResolution.get(resolution.id);
    const scopeAmbiguous = sourceMatch?.outcome === 'ambiguous-scope';
    const ambiguousCandidateIds =
      sourceMatch?.outcome === 'ambiguous-candidate' ? new Set(sourceMatch.candidateIds) : null;
    const ambiguousClaims =
      ambiguousCandidateIds === null
        ? []
        : (claimsByResolution.get(resolution.id) ?? []).filter((claim) =>
            ambiguousCandidateIds.has(claim.candidateId),
          );

    let statusIssue: ConsumerResolutionIssue | null = null;
    if (resolution.status === 'unknown') {
      total.unknownResolutions += 1;
      statusIssue = 'unknown-resolution';
    } else if (resolution.status === 'unmapped') {
      total.unmappedResolutions += 1;
      statusIssue = 'unmapped-resolution';
    } else if (resolution.status === 'blocked') {
      total.blockedResolutions += 1;
      statusIssue = 'blocked-resolution';
    }
    if (ambiguousClaims.length > 0) {
      total.ambiguousSourceClaims += ambiguousClaims.length;
    } else if (scopeAmbiguous) {
      total.ambiguousSourceClaims += 1;
    }
    if (statusIssue === null && ambiguousClaims.length === 0 && !scopeAmbiguous) {
      continue;
    }
    for (const consumerRemote of resolution.consumerRemotes) {
      const record = counts(consumerRemote);
      if (resolution.status === 'unknown') {
        record.unknownResolutions += 1;
      } else if (resolution.status === 'unmapped') {
        record.unmappedResolutions += 1;
      } else if (resolution.status === 'blocked') {
        record.blockedResolutions += 1;
      }
      const consumerAmbiguousClaimIds = ambiguousClaims
        .filter((claim) => claim.consumerRemote === consumerRemote)
        .map((claim) => claim.id);
      record.ambiguousSourceClaims += consumerAmbiguousClaimIds.length + (scopeAmbiguous ? 1 : 0);
      const issues: ConsumerResolutionIssue[] = [];
      if (statusIssue !== null) {
        issues.push(statusIssue);
      }
      // Claim-level ambiguity attaches to the owners of the ambiguous
      // claims; scope-level ambiguity affects every consumer of the binding.
      if (consumerAmbiguousClaimIds.length > 0 || scopeAmbiguous) {
        issues.push('ambiguous-source');
      }
      if (issues.length === 0) {
        continue;
      }
      consumerIssues.push({
        consumerRemote,
        effectiveResolutionId: resolution.id,
        issues,
        ambiguousClaimIds: sortedDistinct(consumerAmbiguousClaimIds),
      });
    }
  }

  return {
    total,
    byConsumer: Object.fromEntries([...byConsumer.entries()].sort(([a], [b]) => compareText(a, b))),
    consumerIssues: consumerIssues.sort(
      (a, b) =>
        compareText(a.consumerRemote, b.consumerRemote) ||
        compareText(a.effectiveResolutionId, b.effectiveResolutionId),
    ),
  };
}

function emptyCounts(): CompletenessCounts {
  return {
    unknownResolutions: 0,
    unmappedResolutions: 0,
    blockedResolutions: 0,
    ambiguousSourceClaims: 0,
  };
}

function sortedDistinct<Value extends string>(values: readonly Value[]): Value[] {
  return [...new Set(values)].sort(compareText);
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
