import type { PlacementReason } from './store/resolution';
import { participantDisplay } from './view-conventions';

// Wording contract: docs/work/pools-v48/design/pools-reasons-mock.md. Shared by Pools, Packages, Remotes.

// The orchestrator's `PoolCause` (4.8). Any other value, such as 4.7's `torn` / `unshared`, is shown raw.
const CAUSE_LABELS: Record<string, string> = {
  incompatible: 'version conflict',
  uncovered: 'not covered',
  'two-versions': 'two versions',
};

export function causeLabel(cause: string): string {
  return CAUSE_LABELS[cause] ?? cause;
}

export type PlacementMiss = PlacementReason['miss'] & {};

// A package-level fallback for shipping two tags has no pool cause; it gets its own label.
export function causeOfMiss(miss: PlacementMiss): string {
  return miss.kind === 'range'
    ? 'incompatible'
    : miss.kind === 'two-tags'
      ? 'two-versions'
      : 'uncovered';
}

/**
 * Every rejection and every missing entrypoint, not only the first the orchestrator logs.
 * `surface` names what the copy was judged against: `the global map` or a package's serving build.
 */
export function missText(miss: PlacementMiss, surface = 'the global map'): string {
  switch (miss.kind) {
    case 'range':
      return rangeText(miss.rejections, surface === 'the global map' ? 'global' : 'served');
    case 'coverage':
      return `${surface} lacks ${miss.missing.join(', ')}`;
    case 'unshipped':
      return `every entrypoint is on ${surface}, but no single build ships ${miss.gap} with the rest`;
    case 'two-tags':
      return `it ships the package at two versions (${miss.tags.join(', ')})`;
  }
}

type Rejection = Extract<PlacementMiss, { kind: 'range' }>['rejections'][number];

// One clause per range and tag, naming packages; the entrypoints are in the cells' tooltips.
function rangeText(rejections: readonly Rejection[], which: string): string {
  const groups = new Map<string, Rejection[]>();
  for (const r of rejections) {
    const key = JSON.stringify([r.requiredVersion, r.tag]);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const clauses = [...groups.values()].map((group) => {
    const strictness = (strict: boolean) => (strict ? 'strict' : 'not strict');
    const packagesOf = (rs: readonly Rejection[]) => {
      const members = [...new Set(rs.map((r) => r.member))];
      const entrypoints = rs.length > members.length ? ` (${rs.length} entrypoints)` : '';
      return `${members.join(', ')}${entrypoints}`;
    };
    const { requiredVersion, tag } = group[0];
    const strict = group.filter((r) => r.strict);
    const loose = group.filter((r) => !r.strict);
    if (strict.length === 0 || loose.length === 0)
      return `${requiredVersion} (${strictness(loose.length === 0)}) rejects the ${which} ${tag} of ${packagesOf(group)}`;
    return `${requiredVersion} rejects the ${which} ${tag} of ${packagesOf(strict)} (strict) and ${packagesOf(loose)} (not strict)`;
  });
  return `its range ${clauses.join('; ')}`;
}

/** `<cause>: <text>` for a package verdict's reason; null when nothing explains it. */
export function placementReasonText(reason: PlacementReason): string | null {
  const surface =
    reason.scope === 'pool' || reason.build === null
      ? 'the global map'
      : `the serving build of ${participantDisplay(reason.build)}`;
  if (reason.miss === null) {
    return reason.storedCause === null
      ? null
      : `${causeLabel(reason.storedCause)}: the stored rows do not reproduce why`;
  }
  const derived = causeOfMiss(reason.miss);
  const mismatch =
    reason.storedCause !== null && reason.storedCause !== derived
      ? ` — but the stored cause is '${reason.storedCause}'`
      : '';
  return `${causeLabel(derived)}: ${missText(reason.miss, surface)}${mismatch}`;
}
