import type {
  CanonicalResolutionProjection,
  PoolBuildBand,
  PoolCellState,
  PoolFamily,
  PoolStatusCell,
  PoolStatusRow,
  PoolVerdict,
  TagPool,
} from '../../shared/store/resolution';
import { GLOBAL_SCOPE, isHostRemote, participantDisplay } from '../../shared/view-conventions';

// Wording contract: docs/work/share-pools/design/pools-explainer-mock.md.

export const POOLS_DEFINITION =
  'A pool is a set of packages that must come from the same build. Each pool lists its builds and the remotes that load them.';
export const POOLING_DOCS_URL = 'https://native-federation.com/docs/v4/orchestrator/pooling/';

export const POOL_LEGEND: readonly { state: PoolCellState; label: string }[] = [
  { state: 'conflict', label: 'conflict' },
  { state: 'isolated', label: 'isolated / not shared' },
  { state: 'serves-others', label: 'build that serves other remotes' },
  { state: 'unchanged', label: 'unchanged or redirected' },
];

// The orchestrator's `PoolCause` (v4.7+), as the short label a verdict leads with. An unknown value is shown raw.
const CAUSE_LABELS: Record<string, string> = {
  incompatible: 'version conflict',
  uncovered: 'not covered',
  torn: 'would mix builds',
  unshared: 'no shared copy',
};

export interface PoolRemoteVm {
  name: string;
  host: boolean;
}

export interface PoolColumnVm {
  packageName: string;
  /** The name without the pool's shared npm scope. */
  label: string;
}

export interface PoolCellVm {
  /** The version the remote gets; `·` where it does not use the package. */
  text: string;
  /** Null for a package the remote does not use, and while the pool is pending. */
  state: PoolCellState | null;
  tooltip: string | null;
}

export interface PoolRowVm {
  remote: PoolRemoteVm;
  /** Its pool tag, `no tag`, or null for the host. */
  tag: string | null;
  redirected: boolean;
  cells: PoolCellVm[];
}

export interface PoolBandVm {
  label: string;
  note: string | null;
  rows: PoolRowVm[];
}

export interface PoolVerdictVm {
  icon: string;
  /** Only isolation and a torn combination are coloured. */
  tone: 'isolated' | 'torn' | 'quiet';
  type: string;
  cause: string | null;
  who: string;
  why: string | null;
}

export interface PoolCardVm {
  /** Canonical pool ID (tracking key and `select` payload). */
  id: string;
  name: string;
  /** Share scope when not the default one. */
  scopeLabel: string | null;
  counts: string;
  tags: string;
  /** The npm scope every column shares, shown once in the matrix corner. */
  scopePrefix: string | null;
  columns: PoolColumnVm[];
  bands: PoolBandVm[];
  /** Null while a member record is pending re-election. */
  verdict: PoolVerdictVm | null;
  pendingNote: string | null;
  notes: string[];
}

export interface PoolsVm {
  /** Set when the capture comes from an orchestrator before 4.7.0, which stores no pool results. */
  versionWarning: string | null;
  pools: PoolCardVm[];
  orphans: string[];
  /** Set when the capture holds no pool tag at all. */
  emptyNote: string | null;
}

export function buildPoolsVm(
  projection: CanonicalResolutionProjection,
  orchestratorVersion: string | null,
): PoolsVm {
  const pools = projection.tagPools
    .map((pool, index) => ({
      card: poolCardOf(pool, projection.poolFamilies[index], projection.tagPools),
      rank: severity(projection.poolFamilies[index]),
      index,
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ card }) => card);
  const orphans = projection.orphanPoolTags.flatMap((orphan) =>
    orphan.tags.map(
      (tag) =>
        `${orphan.packageName}${scopeSuffix(orphan.shareScope)}: tag "${tag.tag}" by ${participantDisplay(tag.remote)} joined nothing — likely a typo or a missing sibling`,
    ),
  );
  const hasContent = pools.length > 0 || orphans.length > 0;
  return {
    versionWarning: hasContent ? versionWarningOf(projection, orchestratorVersion) : null,
    pools,
    orphans,
    emptyNote: hasContent ? null : 'No pool tags in this capture.',
  };
}

/** Whether the Pools tab has anything to show. */
export function hasPoolTags(projection: CanonicalResolutionProjection): boolean {
  return projection.tagPools.length > 0 || projection.orphanPoolTags.length > 0;
}

// Problem pools first, in the verdict's own order.
function severity(family: PoolFamily): number {
  return ['torn', 'isolated', 'redirected', 'one-build'].indexOf(family.statusMatrix.verdict.kind);
}

function poolCardOf(pool: TagPool, family: PoolFamily, allPools: readonly TagPool[]): PoolCardVm {
  const tagStrings = [...new Set(pool.tags.map((tag) => tag.tag))].sort();
  const scopes = new Set(pool.members.map(npmScope));
  const scopePrefix = scopes.size === 1 ? [...scopes][0] : null;
  const pending = family.pending;

  return {
    id: pool.id,
    name: pool.name,
    scopeLabel: pool.shareScope === GLOBAL_SCOPE ? null : pool.shareScope,
    counts: `${pool.members.length} packages · ${pool.remotes.length} remotes`,
    tags: `${tagStrings.length === 1 ? 'tag' : 'tags'}: ${tagStrings.join(', ')}`,
    scopePrefix,
    columns: pool.members.map((packageName) => ({
      packageName,
      label: scopePrefix ? packageName.slice(scopePrefix.length + 1) : packageName,
    })),
    bands: family.statusMatrix.bands.map((band) => bandOf(band, pool.members, pending)),
    verdict: pending ? null : verdictOf(family.statusMatrix.verdict),
    pendingNote: pending ? 'pending re-election — outcomes not settled yet' : null,
    notes: notesOf(pool, family, tagStrings, allPools),
  };
}

function bandOf(band: PoolBuildBand, members: readonly string[], pending: boolean): PoolBandVm {
  const note: string[] = [];
  if (band.kind === 'isolated') note.push('isolated');
  if (band.servesOthers > 0) note.push(`serves ${plural(band.servesOthers, 'other')}`);
  if (band.redirected > 0) note.push(`${band.redirected} redirected`);
  if (band.hostPrecedence) note.push('host precedence');
  return {
    label: band.owner === null ? 'Mixed builds' : `Build of ${participantDisplay(band.owner)}`,
    note: note.length > 0 ? note.join(' · ') : null,
    rows: band.rows.map((row) => rowOf(row, band, members, pending)),
  };
}

function rowOf(
  row: PoolStatusRow,
  band: PoolBuildBand,
  members: readonly string[],
  pending: boolean,
): PoolRowVm {
  const host = isHostRemote(row.remote);
  const conflicts = row.cells.filter((cell) => cell?.state === 'conflict').length;
  return {
    remote: { name: row.remote, host },
    tag: row.tag ?? (host ? null : 'no tag'),
    redirected: row.redirected,
    cells: row.cells.map((cell, index) =>
      cell === null
        ? { text: '·', state: null, tooltip: null }
        : {
            text: cell.servedTag,
            state: pending ? null : cell.state,
            tooltip: pending
              ? null
              : `${participantDisplay(row.remote)} · ${members[index]} ${cell.servedTag}\n${cellText(cell, row, band, conflicts)}`,
          },
    ),
  };
}

function cellText(
  cell: PoolStatusCell,
  row: PoolStatusRow,
  band: PoolBuildBand,
  conflicts: number,
): string {
  const owner = band.owner === null ? null : participantDisplay(band.owner);
  switch (cell.state) {
    case 'conflict':
      return `Conflict: needs ${cell.requiredVersion}, shared is ${cell.sharedTag}`;
    case 'isolated': {
      const why =
        conflicts > 0
          ? `follows ${participantDisplay(row.remote)}'s ${conflicts === 1 ? 'conflict' : 'conflicts'}, since a pool comes from one build`
          : 'runs the whole pool from its own build';
      return `Isolated: ${why}.${rangeNote(cell)}`;
    }
    case 'not-shared':
      return 'Not shared: no remote shares this package, so each loads its own';
    case 'serves-others':
      return `Serves ${plural(band.servesOthers, 'other remote')}`;
    case 'unchanged':
      if (owner === null) return 'Served by several builds';
      if (row.redirected) return `Redirected to the build of ${owner}`;
      return band.owner === row.remote
        ? 'Unchanged: its own build'
        : `Unchanged: the build of ${owner}`;
  }
}

// For a copy that did not conflict itself: whether its own range would have blocked sharing.
function rangeNote(cell: PoolStatusCell): string {
  if (cell.sharedTag === null || cell.acceptsShared === null) return '';
  if (cell.acceptsShared)
    return ` Its range (${cell.requiredVersion}) accepts the shared ${cell.sharedTag}.`;
  return cell.strictVersion
    ? ''
    : ` Its own range (${cell.requiredVersion}, not strict) wouldn't have blocked the shared ${cell.sharedTag}.`;
}

function verdictOf(verdict: PoolVerdict): PoolVerdictVm {
  const redirect = verdict.redirected;
  switch (verdict.kind) {
    case 'torn':
      return {
        icon: '✕',
        tone: 'torn',
        type: 'Mixed builds',
        cause: null,
        who: names(verdict.torn),
        why: 'no single build ships their combination',
      };
    case 'isolated': {
      const isolated = verdict.isolated!;
      const why = [
        isolated.conflicts > 0 ? plural(isolated.conflicts, 'conflict') : null,
        redirect ? `${plural(redirect.remotes.length, 'remote')} redirected` : null,
      ].filter((part) => part !== null);
      return {
        icon: '✕',
        tone: 'isolated',
        type: 'Isolated',
        cause: isolated.cause === null ? null : causeLabel(isolated.cause),
        who: names(isolated.remotes),
        why: why.length > 0 ? why.join(' · ') : null,
      };
    }
    case 'redirected':
      return {
        icon: '↪',
        tone: 'quiet',
        type: 'Redirected',
        cause: 'would mix builds',
        who: `${names(redirect!.remotes)} → build of ${redirect!.anchors.map(participantDisplay).join(', ')}`,
        why: `shared versions come from ${redirect!.mixes.map(participantDisplay).join(' and ')}`,
      };
    case 'one-build':
      return {
        icon: '✓',
        tone: 'quiet',
        type: verdict.builds.length === 1 ? 'One build' : 'Unchanged',
        cause: null,
        who: `${verdict.builds.length === 1 ? 'build' : 'builds'} of ${verdict.builds.map(participantDisplay).join(', ')}`,
        why: null,
      };
  }
}

function notesOf(
  pool: TagPool,
  family: PoolFamily,
  tagStrings: readonly string[],
  allPools: readonly TagPool[],
): string[] {
  const notes: string[] = [];
  if (pool.remotes.length < 2) {
    notes.push('only one remote declares its members — nothing to coordinate');
  }
  if (tagStrings.length > 1) {
    const linking = pool.members.filter(
      (member) =>
        new Set(pool.tags.filter((t) => t.packageName === member).map((t) => t.tag)).size > 1,
    );
    notes.push(
      `tags ${tagStrings.map((t) => `"${t}"`).join(', ')} form one pool — they meet through ${linking.length > 0 ? linking.join(', ') : 'a shared package'}`,
    );
  }
  for (const tag of tagStrings) {
    for (const other of allPools) {
      if (
        other.id !== pool.id &&
        other.shareScope === pool.shareScope &&
        other.tags.some((t) => t.tag === tag)
      ) {
        notes.push(
          `tag "${tag}" also forms pool ${other.name} — tags only connect through a shared package`,
        );
      }
    }
  }
  for (const member of family.members) {
    if (member.followsPackage !== null) {
      notes.push(`${member.packageName} follows its package ${member.followsPackage}`);
    }
  }
  return notes;
}

function causeLabel(cause: string): string {
  return CAUSE_LABELS[cause] ?? cause;
}

// Up to two names; a longer list reads as a count, and the matrix shows who.
function names(remotes: readonly string[]): string {
  return remotes.length <= 2
    ? remotes.map(participantDisplay).join(', ')
    : plural(remotes.length, 'remote');
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function npmScope(packageName: string): string | null {
  return packageName.startsWith('@') ? packageName.split('/')[0] : null;
}

// Without a published version (it arrived in v4.7 too), stored pool results are the only evidence of v4.7.
function versionWarningOf(
  projection: CanonicalResolutionProjection,
  version: string | null,
): string | null {
  const legacy =
    version === null
      ? !projection.poolFamilies.some((family) => family.recorded)
      : isBefore47(version);
  if (!legacy) return null;
  if (version === null) {
    return 'No orchestrator version found (exposed from 4.7.0). Pool names and reasons may be missing.';
  }
  return `This page runs orchestrator ${version}, which doesn't store pool names or why a remote got its own copy — this tab may be incomplete.`;
}

// A non-semver version ('dev', from an unreleased build) is taken as current.
function isBefore47(version: string): boolean {
  const match = /^(\d+)\.(\d+)\./.exec(version);
  if (match === null) return false;
  const [major, minor] = [Number(match[1]), Number(match[2])];
  return major < 4 || (major === 4 && minor < 7);
}

function scopeSuffix(scope: string): string {
  return scope === GLOBAL_SCOPE ? '' : ` (${scope})`;
}
