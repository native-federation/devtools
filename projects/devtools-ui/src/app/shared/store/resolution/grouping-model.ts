import type { ResolvedDependencyCopyId } from './copies-model';
import type { ParticipantDeclarationId, RegistryEvidenceId, SharedExternalId } from './model';

export type TagPoolId = RegistryEvidenceId<'tag-pool'>;

/** One participant's explicit `pool` tag on one shared external. */
export interface PoolTagDeclaration {
  remote: string;
  tag: string;
  packageName: string;
  declarationId: ParticipantDeclarationId;
}

/**
 * A pool as the orchestrator forms it from explicit tags alone (`pool-graph.ts`
 * `groupByMembership` without auto-pooling edges): the connected component of
 * `package — (remote, tag)` edges plus `entrypoint — owning package`, with at
 * least two members, within one non-strict share scope. Auto-pooling is not
 * persisted, so a pool the runtime widened by npm scope appears here as its
 * tagged part only.
 */
export interface TagPool {
  id: TagPoolId;
  /**
   * The orchestrator's pool name: the stored `poolName` (v4.7+, most-declared tag), else the
   * alphabetically smallest member as older runtimes named it. `id` always keys on the latter.
   */
  name: string;
  shareScope: string;
  /** Registry package names, sorted; entrypoints that joined through their package included. */
  members: string[];
  sharedExternalIds: SharedExternalId[];
  /** The tags that formed the pool, sorted by remote, tag, package. */
  tags: PoolTagDeclaration[];
  /** Every remote declaring any member, sorted. */
  remotes: string[];
}

/** A tagged shared external that joined nothing (the orchestrator warns "likely a typo"). */
export interface OrphanPoolTag {
  shareScope: string;
  packageName: string;
  sharedExternalId: SharedExternalId;
  tags: PoolTagDeclaration[];
}

export interface TagPoolDerivation {
  tagPools: TagPool[];
  orphanPoolTags: OrphanPoolTag[];
}

export interface CopyBuild {
  remote: string | null;
  bundle: string;
}

/**
 * Grouping keys of one resolved copy, read off its evidenced source only. A
 * copy without a unique shared source (private, target-only, sources across
 * several externals) has no share scope and no pool.
 */
export interface CopyGroupingFacets {
  copyId: ResolvedDependencyCopyId;
  shareScope: string | null;
  tagPoolId: TagPoolId | null;
  /** Build outputs of the copy's bundle claims: emitting remote (null under ambiguity) and bundle. */
  builds: CopyBuild[];
}
