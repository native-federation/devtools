import type {
  CanonicalResolutionProjection,
  OrphanPoolTag,
  ParticipantDeclaration,
  TagPool,
} from './store/resolution';

/** A declaration's explicit `pool` tag as a detail-row chip. */
export interface PoolChipVm {
  tag: string;
  note: string;
  orphan: boolean;
  /** `select` payload for the /pools cross-link: the pool ID, or null for an orphan or strict tag. */
  poolSelect: string | null;
}

const TAG_NOTE = 'explicit pool tag declared by this remote (config: pool on the shared external)';

type TagOutcome = { kind: 'pool'; pool: TagPool } | { kind: 'orphan'; orphan: OrphanPoolTag };

const outcomesByProjection = new WeakMap<CanonicalResolutionProjection, Map<string, TagOutcome>>();

function outcomesOf(projection: CanonicalResolutionProjection): Map<string, TagOutcome> {
  let outcomes = outcomesByProjection.get(projection);
  if (outcomes === undefined) {
    outcomes = new Map();
    for (const pool of projection.tagPools) {
      for (const tag of pool.tags) outcomes.set(tag.declarationId, { kind: 'pool', pool });
    }
    for (const orphan of projection.orphanPoolTags) {
      for (const tag of orphan.tags) outcomes.set(tag.declarationId, { kind: 'orphan', orphan });
    }
    outcomesByProjection.set(projection, outcomes);
  }
  return outcomes;
}

/** Null without a raw `pool` tag — an untagged declaration shows no chip (auto-pooling is not recorded). */
export function poolChipOf(
  declaration: ParticipantDeclaration,
  projection: CanonicalResolutionProjection,
): PoolChipVm | null {
  const tag = declaration.pool?.trim();
  if (!tag) {
    return null;
  }
  const outcome = outcomesOf(projection).get(declaration.id);
  if (outcome?.kind === 'pool') {
    const single =
      outcome.pool.remotes.length < 2
        ? '; only one remote declares its members — nothing to coordinate'
        : '';
    return {
      tag,
      note: `${TAG_NOTE} — member of pool ${outcome.pool.name}${single}`,
      orphan: false,
      poolSelect: outcome.pool.id,
    };
  }
  if (outcome?.kind === 'orphan') {
    return {
      tag,
      note: `${TAG_NOTE} — no other external joined this pool: likely a typo or a missing sibling`,
      orphan: true,
      poolSelect: null,
    };
  }
  return {
    tag,
    note: `${TAG_NOTE} — the strict share scope is never pooled`,
    orphan: false,
    poolSelect: null,
  };
}
