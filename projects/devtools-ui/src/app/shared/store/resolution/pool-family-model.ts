import type { TagPoolId } from './grouping-model';

export interface PoolFamilyMember {
  packageName: string;
  /** The declared owning package this untagged entrypoint joined through; null otherwise. */
  followsPackage: string | null;
  /** True when no remote shares the member: no `share` row and no subpool serves it. */
  unshared: boolean;
  /** Remotes whose rows of the member are `scope`. */
  scopedRemotes: string[];
}

/**
 * Where pooling put a remote, read off its stored rows (orchestrator 4.8 `records.ts`): every row
 * `scope` → its own build; a `servedBy` → that remote's subpool (its owner names itself);
 * otherwise the global map. `unknown` is a mix 4.8 never writes (a pre-4.8 record).
 */
export type PoolPlacement =
  { kind: 'global' } | { kind: 'subpool'; owner: string } | { kind: 'self' } | { kind: 'unknown' };

/** A range of the remote that rejects a member's global tag (its own tag always passes). */
export interface PoolRangeRejection {
  member: string;
  specifier: string;
  /** The global tag the range rejects. */
  tag: string;
  requiredVersion: string;
  strict: boolean;
}

/**
 * Why the global map does not serve a remote, recomputed against the pool's global surface in the
 * orchestrator's precedence (`election.ts` `missOf`): range rejections (strict first), else the
 * specifiers the surface lacks, else the first specifier no single build ships with the rest.
 */
export type PoolMiss =
  | { kind: 'range'; rejections: PoolRangeRejection[] }
  | { kind: 'coverage'; missing: string[] }
  | { kind: 'unshipped'; gap: string };

/** How one remote runs a pool's members. */
export interface PoolConsumer {
  remote: string;
  host: boolean;
  placement: PoolPlacement;
  /** Null when the global surface serves the remote. */
  miss: PoolMiss | null;
  /** Stored `poolCause` of its copies when they agree on one; null when none is stored. */
  storedCause: string | null;
  /**
   * The placement is what `miss` predicts: on the global map without a miss, in a subpool or its
   * own build with one whose cause matches `storedCause` where one is stored. A subpool owner the
   * global map would serve keeps its build, so it is consistent either way.
   */
  consistent: boolean;
  /** Member package → the remote whose build serves it to this consumer. */
  servingBuilds: Record<string, string>;
  /**
   * On its own build: why each subpool's build does not serve it either, recomputed like the
   * orchestrator's `serves` (range, then coverage). A null miss: it fits that build.
   */
  subpoolMisses: { owner: string; miss: PoolMiss | null }[];
}

/** One specifier the global map serves for the pool, at the tag of the build it comes from. */
export interface PoolSurfaceEntry {
  specifier: string;
  member: string;
  tag: string;
  build: string;
}

/**
 * What happened to one remote's copy of one member, in precedence order: `rejected` (its range
 * rejects the global tag; strict or not, either keeps it off the global map), `gap` (it ships an
 * entrypoint the global map does not serve), `isolated` (the remote runs the whole pool from its
 * own build), `not-shared` (no remote shares the member), `serves-others` (the build's owner, when
 * another remote loads its build), `unchanged`.
 */
export type PoolCellState =
  'rejected' | 'gap' | 'isolated' | 'not-shared' | 'serves-others' | 'unchanged';

export interface PoolStatusCell {
  state: PoolCellState;
  /** The version this remote gets: the serving build's tag. */
  servedTag: string;
  /** The version this remote declared. */
  declaredTag: string;
  requiredVersion: string;
  strictVersion: boolean;
  /** The member's tag on the global map; null when the global map does not serve it. */
  sharedTag: string | null;
  /** Whether the copy accepts `sharedTag` (its own tag always passes); null when unreadable or none. */
  acceptsShared: boolean | null;
  /** Entrypoints of this copy the global map does not serve. */
  missing: string[];
  /** The remote whose build serves this copy. */
  servedBy: string;
}

export interface PoolStatusRow {
  remote: string;
  host: boolean;
  /** The remote's `pool` tag on this pool's members; null when it tags none. */
  tag: string | null;
  /** In a subpool on another remote's build. */
  redirected: boolean;
  /** Follows the family's `members`; null where the remote does not declare the member. */
  cells: (PoolStatusCell | null)[];
}

/**
 * The remotes that load one build: `global` on the global map (owner: the stored winner), `subpool`
 * on its owner's build, `isolated` one remote on its own build, `unknown` a pre-4.8 mix.
 */
export interface PoolBuildBand {
  kind: 'global' | 'subpool' | 'isolated' | 'unknown';
  owner: string | null;
  /** The owner first, then the others in pool order. */
  rows: PoolStatusRow[];
  servesOthers: number;
  redirected: number;
  hostPrecedence: boolean;
}

/**
 * One verdict per pool: `kind` is its worst outcome (isolated > redirected > one-build); the other
 * outcome summaries stay set when they also occurred, so a view can fold them into one line.
 */
export interface PoolVerdict {
  kind: 'isolated' | 'redirected' | 'one-build';
  isolated: {
    remotes: string[];
    /** `rejected` cells of the isolated remotes. */
    conflicts: number;
    /** Stored `poolCause` when every isolated remote stores the same one; else null. */
    cause: string | null;
  } | null;
  redirected: {
    remotes: string[];
    /** Subpool owners. */
    anchors: string[];
    /** `incompatible` / `uncovered` when every redirected remote's miss has that cause; else null. */
    cause: string | null;
  } | null;
  /** Owners of the global and subpool bands. */
  builds: string[];
}

/** How much of what the pool's remotes import the global map serves. */
export interface PoolCoverage {
  /** Distinct specifiers any remote of the pool ships. */
  declared: number;
  served: number;
  /** The specifiers it does not serve, with the remotes shipping each. */
  missing: { specifier: string; remotes: string[] }[];
}

/** One copy judged against a lens build: its range rejects the build's tag, the build lacks an entrypoint, or it fits. */
export interface PoolLensCell {
  state: 'rejected' | 'gap' | 'accepted';
  /** The lens build's tag for the member; null when it does not ship it. */
  tag: string | null;
  requiredVersion: string;
  strictVersion: boolean;
  /** Entrypoints of the copy the lens build does not ship. */
  missing: string[];
}

/**
 * Every remote judged against one remote's build instead of the global map, recomputed like the
 * orchestrator's `serves` (range, then coverage). What-if evidence: placement stays as stored.
 */
export interface PoolLens {
  owner: string;
  coverage: PoolCoverage;
  /** Pool remote order; a null miss: it fits the build (not a prediction of the election). */
  consumers: { remote: string; miss: PoolMiss | null }[];
  /** Remote → cells following the family's `members`; null where it does not declare the member. */
  cells: Record<string, (PoolLensCell | null)[]>;
}

export interface PoolStatusMatrix {
  bands: PoolBuildBand[];
  verdict: PoolVerdict;
}

/** A tag pool's family view: matrix, per-consumer placements and reasons, pending state. */
export interface PoolFamily {
  poolId: TagPoolId;
  members: PoolFamilyMember[];
  /** Stored winner of the pool's last election (orchestrator 4.8); null before. */
  winner: string | null;
  /** What the global map serves for the pool's members, specifier order. */
  globalSurface: PoolSurfaceEntry[];
  coverage: PoolCoverage;
  /** Remotes grouped by the build they load, with every copy's state; the Pools tab's matrix. */
  statusMatrix: PoolStatusMatrix;
  consumers: PoolConsumer[];
  /** One per remote that ships a member: the pool judged against that remote's build. */
  lenses: PoolLens[];
  /** A member record is `dirty`, or its scope awaits a re-decision: outcomes not settled. */
  pending: boolean;
  /** A runtime load wrote the pool's scope since its serving builds were decided (`undecidedScopes`). */
  undecided: boolean;
  /** A member carries a stored `poolName`: the record was written by orchestrator v4.7+. */
  recorded: boolean;
}
