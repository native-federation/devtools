import type {
  CanonicalResolutionProjection,
  PoolBuildBand,
  PoolCellState,
  PoolConsumer,
  PoolFamily,
  PoolLens,
  PoolLensCell,
  PoolMiss,
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
  /** In an issue line: the subpool this owner stands for, its remotes named; absent otherwise. */
  subpool?: { count: number; names: string };
}

export interface PoolColumnVm {
  packageName: string;
  /** The name without its npm scope (shown once above, or in the matrix corner). */
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
  /** Context, not a cause (`runs on: …`): shown quieter. */
  aside?: boolean;
}

/** Remotes as chips, capped so a pool of 50 stays readable; the rest are named on hover. */
export interface PoolRemoteListVm {
  shown: PoolRemoteVm[];
  more: number;
  moreNames: string;
}

const REMOTE_CHIP_LIMIT = 6;

export function remoteListOf(remotes: readonly PoolRemoteVm[]): PoolRemoteListVm {
  const shown =
    remotes.length > REMOTE_CHIP_LIMIT ? remotes.slice(0, REMOTE_CHIP_LIMIT - 1) : [...remotes];
  const rest = remotes.slice(shown.length);
  return {
    shown,
    more: rest.length,
    moreNames: rest.map((remote) => participantDisplay(remote.name)).join(', '),
  };
}

export interface PoolRowVm {
  remote: PoolRemoteVm;
  /** Its pool tag, `no tag`, or null for the host. */
  tag: string | null;
  /** In a subpool on another remote's build. */
  redirected: boolean;
  /** Short cause next to the remote (`version conflict`, `unexplained`); its tooltip lists `reasons`. */
  chip: { label: string; unexplained: boolean; tooltip: string } | null;
  /** Why it is off the global map, then why no subpool's build serves it either. */
  reasons: PoolReasonVm[];
  cells: PoolCellVm[];
}

export interface PoolBandVm {
  label: string;
  note: string | null;
  /** The build a click judges the pool against; null for the global map (judged as stored). */
  lensOwner: string | null;
  /** A click selects it: the global map always, another build when it has a lens. */
  selectable: boolean;
  /** Selected: its issues show in the warning, and it is tinted. */
  active: boolean;
  rows: PoolRowVm[];
}

/**
 * One problem and the remotes it hits: a range rejecting a version (packages grouped), an
 * entrypoint nothing serves, or a combination no single build ships.
 */
export interface PoolIssueVm {
  kind: 'conflict' | 'missing' | 'unshipped';
  label: string;
  subject: string;
  /** Every package when `subject` abbreviates them; null otherwise. */
  subjectAll: string | null;
  detail: string | null;
  /** Who it hits, a subpool shown once as its owner. */
  remotes: PoolRemoteListVm;
  /** Every remote it hits, for highlighting their rows. */
  all: PoolRemoteVm[];
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
  coverage: {
    text: string;
    complete: boolean;
    /** What keeps remotes off the map (or the judged build), one line per problem, not per remote. */
    issues: PoolIssueVm[];
  };
  /** The npm scope every column shares, shown once in the matrix corner. */
  scopePrefix: string | null;
  /** With several scopes: one header cell per run of columns sharing a scope (`''` unscoped); else null. */
  scopeGroups: { label: string; span: number }[] | null;
  columns: PoolColumnVm[];
  bands: PoolBandVm[];
  /** Null while the pool is pending. */
  verdict: PoolVerdictVm | null;
  /** The build the card is judged against instead of the global map; null for the global map. */
  lens: string | null;
  /** A pool (band) is selected: the warning shows its issues. */
  selected: boolean;
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

/**
 * The selected band of one pool card: `owner` null selects the global map (as stored), else the
 * card is judged against that remote's build (`PoolLens`).
 */
export interface PoolLensSelection {
  poolId: string;
  owner: string | null;
}

export function buildPoolsVm(
  projection: CanonicalResolutionProjection,
  orchestratorVersion: string | null,
  lensSelection: PoolLensSelection | null = null,
): PoolsVm {
  const pools = projection.tagPools
    .map((pool, index) => ({
      card: poolCardOf(
        pool,
        projection.poolFamilies[index],
        projection.tagPools,
        lensSelection?.poolId === pool.id ? lensSelection : null,
      ),
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

function poolCardOf(
  pool: TagPool,
  family: PoolFamily,
  allPools: readonly TagPool[],
  selection: PoolLensSelection | null,
): PoolCardVm {
  const lens =
    selection?.owner == null
      ? null
      : (family.lenses.find((l) => l.owner === selection.owner) ?? null);
  // An owner without a lens (gone after a refresh) selects nothing.
  const selected = selection !== null && (selection.owner === null || lens !== null);
  const tagStrings = [...new Set(pool.tags.map((tag) => tag.tag))].sort();
  const scopes = new Set(pool.members.map(npmScope));
  const scopePrefix = scopes.size === 1 ? [...scopes][0] : null;
  const pending = family.pending;
  const consumerOf = new Map(family.consumers.map((c) => [c.remote, c]));
  const bands = family.statusMatrix.bands.map((band) =>
    bandOf(band, family, pool.members, consumerOf, pending, lens, selected),
  );

  return {
    id: pool.id,
    name: pool.name,
    scopeLabel: pool.shareScope === GLOBAL_SCOPE ? null : pool.shareScope,
    counts: `${pool.members.length} packages · ${pool.remotes.length} remotes`,
    tags: `${tagStrings.length === 1 ? 'tag' : 'tags'}: ${tagStrings.join(', ')}`,
    coverage: lens ? lensCoverageOf(lens, family.consumers) : coverageOf(family, pending, selected),
    scopePrefix,
    scopeGroups: scopes.size > 1 ? scopeGroupsOf(pool.members) : null,
    columns: pool.members.map((packageName) => {
      const scope = npmScope(packageName);
      return { packageName, label: scope ? packageName.slice(scope.length + 1) : packageName };
    }),
    bands,
    verdict: lens
      ? lensVerdictOf(lens)
      : pending
        ? null
        : verdictOf(family.statusMatrix.verdict, family.consumers),
    lens: lens?.owner ?? null,
    selected,
    pendingNote: pending
      ? family.undecided
        ? 'a runtime load changed this share scope — the next init decides it again; outcomes not settled yet'
        : 'pending re-election — outcomes not settled yet'
      : null,
    notes: notesOf(pool, family, tagStrings, allPools),
  };
}

function coverageOf(
  family: PoolFamily,
  pending: boolean,
  selected: boolean,
): PoolCardVm['coverage'] {
  const { declared, served, missing } = family.coverage;
  // Only remotes the stored rows keep off the global map; a pending pool has no settled reasons.
  const off = pending ? [] : family.consumers.filter((c) => c.placement.kind !== 'global');
  return {
    text:
      missing.length === 0
        ? `Global map serves all ${plural(declared, 'entrypoint')} the remotes import`
        : `Global map serves ${served} of ${plural(declared, 'entrypoint')} the remotes import`,
    complete: missing.length === 0,
    // The warning only while the global map is selected.
    issues: selected
      ? issuesOf(
          off.map((c) => ({ remote: c.remote, miss: c.miss })),
          missing,
          'global',
          family.consumers,
        )
      : [],
  };
}

const PACKAGES_SHOWN = 2;

function issuesOf(
  misses: readonly { remote: string; miss: PoolMiss | null }[],
  missing: readonly { specifier: string; remotes: string[] }[],
  which: string,
  consumers: readonly PoolConsumer[],
): PoolIssueVm[] {
  const ownerOf = new Map(
    consumers.flatMap((c) =>
      c.placement.kind === 'subpool' ? [[c.remote, c.placement.owner]] : [],
    ),
  );
  const remoteOf = (name: string): PoolRemoteVm => ({ name, host: isHostRemote(name) });
  const conflicts = new Map<
    string,
    { tag: string; range: string; strict: boolean; members: Set<string>; remotes: Set<string> }
  >();
  const unshipped = new Map<string, string[]>();
  for (const { remote, miss } of misses) {
    if (miss?.kind === 'range')
      for (const r of miss.rejections) {
        const key = JSON.stringify([r.requiredVersion, r.strict, r.tag]);
        const group = conflicts.get(key) ?? {
          tag: r.tag,
          range: r.requiredVersion,
          strict: r.strict,
          members: new Set<string>(),
          remotes: new Set<string>(),
        };
        group.members.add(r.member);
        group.remotes.add(remote);
        conflicts.set(key, group);
      }
    if (miss?.kind === 'unshipped')
      unshipped.set(miss.gap, [...(unshipped.get(miss.gap) ?? []), remote]);
  }
  const issue = (
    kind: PoolIssueVm['kind'],
    label: string,
    subjects: readonly string[],
    detail: string | null,
    remotes: readonly string[],
  ): PoolIssueVm => {
    const all = remotes.map(remoteOf);
    // A subpool's remotes run its owner's build: one entry, the owner, standing for all of them.
    const bySubpool = new Map<string, string[]>();
    for (const remote of remotes) {
      const key = ownerOf.get(remote) ?? remote;
      bySubpool.set(key, [...(bySubpool.get(key) ?? []), remote]);
    }
    const shown = [...bySubpool].map(([name, members]): PoolRemoteVm => {
      const subpool = [...ownerOf.values()].includes(name);
      return subpool
        ? {
            ...remoteOf(name),
            subpool: { count: members.length, names: members.map(participantDisplay).join(', ') },
          }
        : remoteOf(name);
    });
    const more = subjects.length - PACKAGES_SHOWN;
    return {
      kind,
      label,
      subject:
        more > 1 ? `${subjects.slice(0, PACKAGES_SHOWN).join(', ')} +${more}` : subjects.join(', '),
      subjectAll: more > 1 ? subjects.join(', ') : null,
      detail,
      remotes: remoteListOf(shown),
      all,
    };
  };
  return [
    // Strict first: those are what `strictExternalCompatibility` refuses; then by how many it hits.
    ...[...conflicts.values()]
      .sort((a, b) => Number(b.strict) - Number(a.strict) || b.remotes.size - a.remotes.size)
      .map((c) =>
        issue(
          'conflict',
          'conflict',
          [...c.members],
          `${which} ${c.tag} · needs ${c.range}${c.strict ? ' (strict)' : ''}`,
          [...c.remotes],
        ),
      ),
    ...missing.map((m) => issue('missing', 'missing', [m.specifier], null, m.remotes)),
    ...[...unshipped].map(([gap, remotes]) =>
      issue('unshipped', 'unshipped', [gap], 'with the rest in no single build', remotes),
    ),
  ];
}

function bandOf(
  band: PoolBuildBand,
  family: PoolFamily,
  members: readonly string[],
  consumerOf: ReadonlyMap<string, PoolConsumer>,
  pending: boolean,
  lens: PoolLens | null,
  selected: boolean,
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
    lens
      ? lensRowOf(row, members, consumerOf.get(row.remote)!, lens)
      : rowOf(row, band, members, consumerOf.get(row.remote)!, pending),
  );
  const lensOwner =
    band.kind !== 'global' &&
    band.owner !== null &&
    family.lenses.some((l) => l.owner === band.owner)
      ? band.owner
      : null;
  return {
    label,
    note: note.length > 0 ? note.join(' · ') : null,
    lensOwner,
    selectable: band.kind === 'global' || lensOwner !== null,
    active:
      selected &&
      (band.kind === 'global' ? lens === null : lensOwner !== null && lens?.owner === lensOwner),
    rows,
  };
}

const reasonLine = (reason: PoolReasonVm) =>
  reason.cause ? `${reason.cause}: ${reason.text}` : reason.text;

function chipOf(reasons: readonly PoolReasonVm[]): PoolRowVm['chip'] {
  const [main] = reasons;
  if (main === undefined || (main.cause === null && !main.unexplained)) return null;
  return {
    label: main.unexplained ? 'unexplained' : main.cause!,
    unexplained: main.unexplained,
    tooltip: reasons.map(reasonLine).join('\n'),
  };
}

// Recomputed like the orchestrator's `serves`: the subpool's build, not the global map.
function subpoolReasonOf({ owner, miss }: PoolConsumer['subpoolMisses'][number]): PoolReasonVm {
  return {
    cause: `not in the subpool of ${participantDisplay(owner)}`,
    text:
      miss === null
        ? 'it fits its build — the stored rows do not say why'
        : missText(miss, 'its build'),
    unexplained: miss === null,
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
  const main = pending ? null : reasonOf(consumer);
  const reasons = main === null ? [] : [main, ...consumer.subpoolMisses.map(subpoolReasonOf)];
  return {
    remote: { name: row.remote, host },
    tag: row.tag ?? (host ? null : 'no tag'),
    redirected: row.redirected,
    chip: chipOf(reasons),
    reasons,
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

function lensRowOf(
  row: PoolStatusRow,
  members: readonly string[],
  consumer: PoolConsumer,
  lens: PoolLens,
): PoolRowVm {
  const host = isHostRemote(row.remote);
  const build = `the build of ${participantDisplay(lens.owner)}`;
  const own = row.remote === lens.owner;
  const miss = lens.consumers.find((c) => c.remote === row.remote)?.miss ?? null;
  const judged: PoolReasonVm = own
    ? { cause: null, text: 'this build', unexplained: false }
    : miss === null
      ? {
          cause: `fits ${build}`,
          text: 'its ranges accept every version, and the build ships every entrypoint it imports',
          unexplained: false,
        }
      : {
          cause: `${causeLabel(causeOfMiss(miss))} with ${build}`,
          text: missText(miss, 'the build'),
          unexplained: false,
        };
  const runs: PoolReasonVm = {
    cause: 'runs on',
    text: placementText(consumer),
    unexplained: false,
    aside: true,
  };
  const cells = lens.cells[row.remote] ?? [];
  return {
    remote: { name: row.remote, host },
    tag: row.tag ?? (host ? null : 'no tag'),
    redirected: row.redirected,
    // Chips flag what does not fit; the list still says every remote fits.
    chip:
      !own && miss === null
        ? null
        : {
            label: own ? 'this build' : causeLabel(causeOfMiss(miss!)),
            unexplained: false,
            tooltip: [judged, runs].map(reasonLine).join('\n'),
          },
    reasons: own ? [runs] : [judged, runs],
    cells: members.map((member, index) => {
      const cell = cells[index] ?? null;
      return cell === null
        ? { text: '·', state: null, tooltip: null }
        : {
            text: cell.tag ?? '—',
            state: lensStateOf(cell, own),
            tooltip: `${participantDisplay(row.remote)} · ${member} on ${build}\n${lensCellText(cell, own, build)}`,
          };
    }),
  };
}

function lensStateOf(cell: PoolLensCell, own: boolean): PoolCellState {
  if (cell.state !== 'accepted') return cell.state;
  return own ? 'serves-others' : 'unchanged';
}

function lensCellText(cell: PoolLensCell, own: boolean, build: string): string {
  switch (cell.state) {
    case 'rejected':
      return `Rejected: needs ${cell.requiredVersion}${cell.strictVersion ? '' : ' (not strict)'}, ${build} has ${cell.tag}`;
    case 'gap':
      return `Not covered: ${build} lacks ${cell.missing.join(', ')}`;
    case 'accepted':
      return own ? 'This build' : `Fits: ${build} ships it at ${cell.tag}`;
  }
}

function placementText({ placement, remote }: PoolConsumer): string {
  switch (placement.kind) {
    case 'global':
      return 'the global map';
    case 'subpool':
      return placement.owner === remote
        ? 'its own build, which serves its subpool'
        : `the subpool of ${participantDisplay(placement.owner)}`;
    case 'self':
      return 'its own build';
    case 'unknown':
      return 'a placement the stored rows do not settle';
  }
}

function lensCoverageOf(
  lens: PoolLens,
  consumers: readonly PoolConsumer[],
): PoolCardVm['coverage'] {
  const build = `Build of ${participantDisplay(lens.owner)}`;
  const { declared, served, missing } = lens.coverage;
  return {
    text:
      missing.length === 0
        ? `${build} ships all ${plural(declared, 'entrypoint')} the remotes import`
        : `${build} ships ${served} of ${plural(declared, 'entrypoint')} the remotes import`,
    complete: missing.length === 0,
    issues: issuesOf(
      lens.consumers.filter((c) => c.remote !== lens.owner),
      missing,
      `build of ${participantDisplay(lens.owner)}`,
      consumers,
    ),
  };
}

function lensVerdictOf(lens: PoolLens): PoolVerdictVm {
  const misses = lens.consumers.flatMap((c) => (c.miss === null ? [] : [c.miss]));
  const conflicts = misses.filter((m) => m.kind === 'range').length;
  const why = [
    conflicts > 0 ? `${conflicts} version ${conflicts === 1 ? 'conflict' : 'conflicts'}` : null,
    misses.length > conflicts ? `${misses.length - conflicts} not covered` : null,
  ].filter((part) => part !== null);
  return {
    icon: '◎',
    tone: 'quiet',
    type: `Build of ${participantDisplay(lens.owner)}`,
    cause: null,
    who: `fits ${lens.consumers.length - misses.length} of ${plural(lens.consumers.length, 'remote')}`,
    why: why.length > 0 ? why.join(' · ') : null,
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

// Members are sorted, so a scope's packages form one run.
function scopeGroupsOf(members: readonly string[]): { label: string; span: number }[] {
  const groups: { label: string; span: number }[] = [];
  for (const member of members) {
    const scope = npmScope(member);
    const label = scope ? `${scope}/` : '';
    const last = groups.at(-1);
    if (last?.label === label) last.span++;
    else groups.push({ label, span: 1 });
  }
  return groups;
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
