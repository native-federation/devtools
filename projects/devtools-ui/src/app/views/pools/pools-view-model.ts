import type {
  CanonicalResolutionProjection,
  PoolBuildBand,
  PoolCellState,
  PoolConsumer,
  PoolFamily,
  PoolStatusCell,
  PoolStatusRow,
  PoolVerdict,
  TagPool,
} from '../../shared/store/resolution';
import { causeLabel, causeOfMiss, missText } from '../../shared/placement-text';
import { GLOBAL_SCOPE, isHostRemote, participantDisplay } from '../../shared/view-conventions';

// Wording contract: docs/work/pools-v48/design/pools-reasons-mock.md.

export const POOLS_DEFINITION =
  'A pool is a set of packages that must come from the same build. Each pool lists its builds and the remotes that load them.';
export const POOLING_DOCS_URL = 'https://native-federation.com/docs/v4/orchestrator/pooling/';

export const POOL_LEGEND: readonly { state: PoolCellState; label: string }[] = [
  { state: 'rejected', label: 'range rejects the global version' },
  { state: 'gap', label: 'entrypoint not on the global map' },
  { state: 'isolated', label: 'own build / not shared' },
  { state: 'serves-others', label: 'build that serves other remotes' },
  { state: 'unchanged', label: 'global map or subpool' },
];

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

/** Why the remote is where it is; null on the global map with nothing to explain. */
export interface PoolReasonVm {
  /** The cause label (`version conflict`, `not covered`), or a stored value shown raw. */
  cause: string | null;
  text: string;
  /** The stored rows do not reproduce the stored cause or the placement. */
  unexplained: boolean;
}

export interface PoolRowVm {
  remote: PoolRemoteVm;
  /** Its pool tag, `no tag`, or null for the host. */
  tag: string | null;
  /** In a subpool on another remote's build. */
  redirected: boolean;
  reason: PoolReasonVm | null;
  cells: PoolCellVm[];
}

export interface PoolBandVm {
  label: string;
  note: string | null;
  /** The reason every row of the band shares, lifted out of the rows (full width); null otherwise. */
  reason: PoolReasonVm | null;
  rows: PoolRowVm[];
}

export interface PoolVerdictVm {
  icon: string;
  /** Only an own build is coloured. */
  tone: 'isolated' | 'quiet';
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
  /** How much of what the remotes import the global map serves. */
  coverage: { text: string; complete: boolean; missing: string[] };
  /** The npm scope every column shares, shown once in the matrix corner. */
  scopePrefix: string | null;
  columns: PoolColumnVm[];
  bands: PoolBandVm[];
  /** Null while the pool is pending. */
  verdict: PoolVerdictVm | null;
  pendingNote: string | null;
  notes: string[];
}

export interface PoolsVm {
  /** Set when the capture comes from an orchestrator before 4.8.0, whose pooling the reasons follow. */
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
  return ['isolated', 'redirected', 'one-build'].indexOf(family.statusMatrix.verdict.kind);
}

function poolCardOf(pool: TagPool, family: PoolFamily, allPools: readonly TagPool[]): PoolCardVm {
  const tagStrings = [...new Set(pool.tags.map((tag) => tag.tag))].sort();
  const scopes = new Set(pool.members.map(npmScope));
  const scopePrefix = scopes.size === 1 ? [...scopes][0] : null;
  const pending = family.pending;
  const consumerOf = new Map(family.consumers.map((c) => [c.remote, c]));

  return {
    id: pool.id,
    name: pool.name,
    scopeLabel: pool.shareScope === GLOBAL_SCOPE ? null : pool.shareScope,
    counts: `${pool.members.length} packages · ${pool.remotes.length} remotes`,
    tags: `${tagStrings.length === 1 ? 'tag' : 'tags'}: ${tagStrings.join(', ')}`,
    coverage: coverageOf(family),
    scopePrefix,
    columns: pool.members.map((packageName) => ({
      packageName,
      label: scopePrefix ? packageName.slice(scopePrefix.length + 1) : packageName,
    })),
    bands: family.statusMatrix.bands.map((band) =>
      bandOf(band, family, pool.members, consumerOf, pending),
    ),
    verdict: pending ? null : verdictOf(family.statusMatrix.verdict, family.consumers),
    pendingNote: pending
      ? family.undecided
        ? 'a runtime load changed this share scope — the next init decides it again; outcomes not settled yet'
        : 'pending re-election — outcomes not settled yet'
      : null,
    notes: notesOf(pool, family, tagStrings, allPools),
  };
}

function coverageOf(family: PoolFamily): PoolCardVm['coverage'] {
  const { declared, served, missing } = family.coverage;
  if (missing.length === 0)
    return {
      text: `Global map serves all ${plural(declared, 'entrypoint')} the remotes import`,
      complete: true,
      missing: [],
    };
  return {
    text: `Global map serves ${served} of ${plural(declared, 'entrypoint')} the remotes import`,
    complete: false,
    missing: missing.map((m) => `${m.specifier} (${m.remotes.map(participantDisplay).join(', ')})`),
  };
}

function bandOf(
  band: PoolBuildBand,
  family: PoolFamily,
  members: readonly string[],
  consumerOf: ReadonlyMap<string, PoolConsumer>,
  pending: boolean,
): PoolBandVm {
  const owner = band.owner === null ? null : participantDisplay(band.owner);
  const note: string[] = [];
  if (band.servesOthers > 0) note.push(`serves ${plural(band.servesOthers, 'other')}`);
  if (band.hostPrecedence) note.push('host precedence');
  if (band.kind === 'global') {
    // Packages the winner does not ship, which the global map takes from another build.
    const extensions = new Map<string, string>();
    for (const entry of family.globalSurface)
      if (entry.build !== band.owner && !extensions.has(entry.member))
        extensions.set(
          entry.member,
          `${entry.member} ${entry.tag} from ${participantDisplay(entry.build)}`,
        );
    note.push(...extensions.values());
  }
  const label =
    band.kind === 'global'
      ? `Global map · build of ${owner}`
      : band.kind === 'subpool'
        ? `Subpool · build of ${owner}`
        : band.kind === 'isolated'
          ? `Own build · ${owner}`
          : 'Unknown placement';
  const rows = band.rows.map((row) =>
    rowOf(row, band, members, consumerOf.get(row.remote)!, pending),
  );
  const [first] = rows;
  const shared =
    first !== undefined &&
    first.reason !== null &&
    rows.every((row) => JSON.stringify(row.reason) === JSON.stringify(first.reason));
  return {
    label,
    note: note.length > 0 ? note.join(' · ') : null,
    reason: shared ? first.reason : null,
    rows: shared ? rows.map((row) => ({ ...row, reason: null })) : rows,
  };
}

function rowOf(
  row: PoolStatusRow,
  band: PoolBuildBand,
  members: readonly string[],
  consumer: PoolConsumer,
  pending: boolean,
): PoolRowVm {
  const host = isHostRemote(row.remote);
  return {
    remote: { name: row.remote, host },
    tag: row.tag ?? (host ? null : 'no tag'),
    redirected: row.redirected,
    reason: pending ? null : reasonOf(consumer),
    cells: row.cells.map((cell, index) =>
      cell === null
        ? { text: '·', state: null, tooltip: null }
        : {
            text: cell.servedTag,
            state: pending ? null : cell.state,
            tooltip: pending
              ? null
              : `${participantDisplay(row.remote)} · ${members[index]} ${cell.servedTag}\n${cellText(cell, row, band)}`,
          },
    ),
  };
}

function reasonOf(consumer: PoolConsumer): PoolReasonVm | null {
  const { placement, miss, storedCause, consistent } = consumer;
  const derived = miss === null ? null : causeOfMiss(miss);
  if (placement.kind === 'global' && consistent) return null;
  if (placement.kind === 'unknown')
    return {
      cause: null,
      text: 'some rows run its own build, others not — a record orchestrator 4.8 does not write',
      unexplained: true,
    };
  if (miss === null) {
    if (placement.kind === 'subpool' && placement.owner === consumer.remote)
      return {
        cause: null,
        text: 'the global map would serve it; its build stays for the remotes of its subpool',
        unexplained: false,
      };
    return {
      cause: storedCause === null ? null : causeLabel(storedCause),
      text: 'the stored rows do not reproduce why it is off the global map',
      unexplained: true,
    };
  }
  const text = missText(miss);
  if (placement.kind === 'global')
    return {
      cause: causeLabel(derived!),
      text: `on the global map although ${text}`,
      unexplained: true,
    };
  if (!consistent)
    return {
      cause: causeLabel(storedCause ?? derived!),
      text: `${text} — but the stored cause is '${storedCause}'`,
      unexplained: true,
    };
  return { cause: causeLabel(derived!), text, unexplained: false };
}

function cellText(cell: PoolStatusCell, row: PoolStatusRow, band: PoolBuildBand): string {
  const owner = band.owner === null ? null : participantDisplay(band.owner);
  switch (cell.state) {
    case 'rejected':
      return `Rejected: needs ${cell.requiredVersion}${cell.strictVersion ? '' : ' (not strict)'}, the global map has ${cell.sharedTag}`;
    case 'gap':
      return `Not on the global map: ${cell.missing.join(', ')}`;
    case 'isolated':
      return `Own build: runs the whole pool from its own build.${rangeNote(cell)}`;
    case 'not-shared':
      return 'Not shared: no remote shares this package, so each loads its own';
    case 'serves-others':
      return `Serves ${plural(band.servesOthers, 'other remote')}`;
    case 'unchanged':
      if (owner === null) return 'Placement not readable from the stored rows';
      if (row.redirected) return `Subpool: runs the build of ${owner}`;
      if (cell.servedBy === row.remote) return 'Its own build';
      return `Global map: the build of ${participantDisplay(cell.servedBy)}`;
  }
}

// For an own-build copy whose range did not reject: say so, as the cause lies elsewhere.
function rangeNote(cell: PoolStatusCell): string {
  if (cell.sharedTag === null || cell.acceptsShared !== true) return '';
  return ` Its range (${cell.requiredVersion}) accepts the global ${cell.sharedTag}.`;
}

function verdictOf(verdict: PoolVerdict, consumers: readonly PoolConsumer[]): PoolVerdictVm {
  const subpool = verdict.redirected;
  const unexplained = consumers.filter((c) => reasonOf(c)?.unexplained).length;
  const unexplainedNote = unexplained > 0 ? `${unexplained} unexplained` : null;
  switch (verdict.kind) {
    case 'isolated': {
      const isolated = verdict.isolated!;
      const why = [
        isolated.conflicts > 0 ? plural(isolated.conflicts, 'rejection') : null,
        subpool ? `${plural(subpool.remotes.length, 'remote')} in a subpool` : null,
        unexplainedNote,
      ].filter((part) => part !== null);
      return {
        icon: '✕',
        tone: 'isolated',
        type: 'Own build',
        cause: isolated.cause === null ? null : causeLabel(isolated.cause),
        who: names(isolated.remotes),
        why: why.length > 0 ? why.join(' · ') : null,
      };
    }
    case 'redirected':
      return {
        icon: '↪',
        tone: 'quiet',
        type: 'Subpool',
        cause: subpool!.cause === null ? null : causeLabel(subpool!.cause),
        who: `${names(subpool!.remotes)} → build of ${subpool!.anchors.map(participantDisplay).join(', ')}`,
        why: unexplainedNote,
      };
    case 'one-build':
      return {
        icon: '✓',
        tone: 'quiet',
        type: verdict.builds.length === 1 ? 'One build' : 'Unchanged',
        cause: null,
        who: `${verdict.builds.length === 1 ? 'build' : 'builds'} of ${verdict.builds.map(participantDisplay).join(', ')}`,
        why: unexplainedNote,
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
  if (version === null) {
    return projection.poolFamilies.some((family) => family.recorded)
      ? null
      : 'No orchestrator version found (exposed from 4.7.0). Pool names and reasons may be missing.';
  }
  if (!isBefore(version, 8)) return null;
  if (isBefore(version, 7))
    return `This page runs orchestrator ${version}, which doesn't store pool names or why a remote got its own copy — this tab may be incomplete.`;
  return `This page runs orchestrator ${version}. The reasons follow 4.8's pooling and may not explain every placement.`;
}

// Before 4.<minor>; a non-semver version ('dev', from an unreleased build) is taken as current.
function isBefore(version: string, minor: number): boolean {
  const match = /^(\d+)\.(\d+)\./.exec(version);
  if (match === null) return false;
  const [major, found] = [Number(match[1]), Number(match[2])];
  return major < 4 || (major === 4 && found < minor);
}

function scopeSuffix(scope: string): string {
  return scope === GLOBAL_SCOPE ? '' : ` (${scope})`;
}
