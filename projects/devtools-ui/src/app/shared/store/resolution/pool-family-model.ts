import type { TagPoolId } from './grouping-model';

export interface PoolFamilyMember {
  packageName: string;
  /** The declared owning package this untagged entrypoint joined through; null otherwise. */
  followsPackage: string | null;
  /** True when no row of the member is `share` (the orchestrator's "scoped-only" case). */
  unshared: boolean;
  /** Remotes whose rows of the member are `scope`. */
  scopedRemotes: string[];
}

export type PoolConsumerOutcome = 'one-build' | 'redirected' | 'own-copy' | 'mixed-builds';

/** How one remote runs a pool's members, read off its stored rows. */
export interface PoolConsumer {
  remote: string;
  host: boolean;
  outcome: PoolConsumerOutcome;
  /** Stored `poolCause`s of this consumer's member copies, sorted by cause; empty before v4.7. */
  poolCauses: { cause: string; members: string[] }[];
  /** Member package → the remote whose build serves it to this consumer. */
  servingBuilds: Record<string, string>;
  /** Whether some single build ships the resolved specifier → tag combination; null for the host. */
  coherent: boolean | null;
  /** Resolved `specifier@tag` combination (sorted). */
  combination: string[];
}

/**
 * What happened to one remote's copy of one member, in precedence order: `conflict` (a strict range
 * that rejects the shared tag), `isolated` (the remote runs the whole pool from its own build),
 * `not-shared` (no remote shares the member), `serves-others` (the build's owner, when another
 * remote loads its build), `unchanged`.
 */
export type PoolCellState = 'conflict' | 'isolated' | 'not-shared' | 'serves-others' | 'unchanged';

export interface PoolStatusCell {
  state: PoolCellState;
  /** The version this remote gets: the serving build's tag. */
  servedTag: string;
  /** The version this remote declared. */
  declaredTag: string;
  requiredVersion: string;
  strictVersion: boolean;
  /** The member's shared tag; null when nobody shares it. */
  sharedTag: string | null;
  /** Whether `requiredVersion` accepts `sharedTag` per `semver`; null when either is missing or unreadable. */
  acceptsShared: boolean | null;
}

export interface PoolStatusRow {
  remote: string;
  host: boolean;
  /** The remote's `pool` tag on this pool's members; null when it tags none. */
  tag: string | null;
  /** Pooling pointed it at another remote's build (`servedBy`). */
  redirected: boolean;
  /** Follows the family's `members`; null where the remote does not declare the member. */
  cells: (PoolStatusCell | null)[];
}

/**
 * The remotes that load one build. `isolated` is a remote running the whole pool from its own
 * build; `mixed` collects remotes served by several builds (a torn combination, which pooling
 * prevents), so it has no owner.
 */
export interface PoolBuildBand {
  kind: 'shared' | 'isolated' | 'mixed';
  owner: string | null;
  /** The owner first, then the others in pool order. */
  rows: PoolStatusRow[];
  servesOthers: number;
  redirected: number;
  hostPrecedence: boolean;
}

/**
 * One verdict per pool: `kind` is its worst outcome (torn > isolated > redirected > one-build); the
 * other outcome summaries stay set when they also occurred, so a view can fold them into one line.
 */
export interface PoolVerdict {
  kind: 'torn' | 'isolated' | 'redirected' | 'one-build';
  torn: string[];
  isolated: {
    remotes: string[];
    conflicts: number;
    /** Stored `poolCause` when the isolated copies agree on one; else `incompatible` from conflict evidence; else null. */
    cause: string | null;
  } | null;
  redirected: {
    remotes: string[];
    anchors: string[];
    /** The builds the shared versions come from, which a redirected remote would have mixed. */
    mixes: string[];
  } | null;
  /** Owners of the shared bands. */
  builds: string[];
}

export interface PoolStatusMatrix {
  bands: PoolBuildBand[];
  verdict: PoolVerdict;
}

/** A tag pool's family view: matrix, per-consumer outcomes, pending state. */
export interface PoolFamily {
  poolId: TagPoolId;
  members: PoolFamilyMember[];
  /** Remotes grouped by the build they load, with every copy's state; the Pools tab's matrix. */
  statusMatrix: PoolStatusMatrix;
  consumers: PoolConsumer[];
  /** A member record is `dirty`: pending re-election, outcomes not settled. */
  pending: boolean;
  /** A member carries a stored `poolName`: the record was written by orchestrator v4.7+. */
  recorded: boolean;
}
