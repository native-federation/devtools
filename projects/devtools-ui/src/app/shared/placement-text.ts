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
      return `its range rejects the ${surface === 'the global map' ? 'global' : 'served'} ${miss.rejections
        .map(
          (r) =>
            `${r.specifier} ${r.tag} (${r.requiredVersion}${r.strict ? ', strict' : ', not strict'})`,
        )
        .join(', ')}`;
    case 'coverage':
      return `${surface} lacks ${miss.missing.join(', ')}`;
    case 'unshipped':
      return `every entrypoint is on ${surface}, but no single build ships ${miss.gap} with the rest`;
    case 'two-tags':
      return `it ships the package at two versions (${miss.tags.join(', ')})`;
  }
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
