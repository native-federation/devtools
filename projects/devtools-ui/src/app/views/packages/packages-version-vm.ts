/**
 * Detail half of the Packages vm builder (packages-verdicts T5/T6): one
 * block per share scope of the selected package, each with the versions
 * table (one row per registered version, deviations as notes), the
 * compatibility matrix, and per version the deep dive (whose build serves it,
 * who ships and uses it, its entrypoints and files). Every fact comes from the
 * projection's `packageScopeVerdicts`; bindings that resolve nowhere and
 * divergences come from the per-scope detail.
 */
import type {
  DeclarationVerdict,
  DeclarationVerdictRecord,
  PackageScopeVerdicts,
  TagPool,
  VersionVerdict,
} from '../../shared/store/resolution';
import { verdictNoteOf } from '../../shared/verdict-text';
import { PackageDetailVm, buildDetail } from './packages-detail-vm';
import type { PackageEntry } from './packages-row-vm';
import {
  CanonicalIndexes,
  GLOBAL_SCOPE,
  PackageGroup,
  STRICT_SCOPE,
  isHostRemote,
  packageId,
  participantDisplay,
  targetFileName,
} from './packages-vm-shared';

export interface RemoteRefVm {
  /** Display name — the host sentinel reads as 'host'. */
  name: string;
  host: boolean;
  /** `select` payload for the /remotes cross-link. */
  select: string;
}

export interface LabelNoteVm {
  label: string;
  note: string;
}

export type VersionNoteKind = 'out-of-range' | 'subpool' | 'own-copy' | 'merged';

export interface VersionNoteVm extends LabelNoteVm {
  kind: VersionNoteKind;
}

export interface VerdictVm extends LabelNoteVm {
  kind: DeclarationVerdict;
}

export interface ShipperVm {
  remote: RemoteRefVm;
  verdict: VerdictVm;
  /** Its pool placed it off the global map: the chip opens its row in the Pools tab. */
  pooled: boolean;
  /** Range, strictness and verdict, as tooltip lines under a `<remote> · <verdict>` head. */
  tip: string;
}

export interface RunnerVm {
  remote: RemoteRefVm;
  outOfRange: boolean;
  note: string;
}

export interface EntrypointVm {
  specifier: string;
  /** Set when the serving build or global map lacks it — why its shipper is off the map. */
  missing: string | null;
}

export interface BuildGroupVm<Item> {
  /** Null when only one build serves the version — no header renders. */
  build: RemoteRefVm | null;
  items: Item[];
}

export interface FileVm {
  name: string;
  url: string | null;
}

export interface DeepDiveVm {
  /** Remotes whose build files the import map points to for this version; empty when none does. */
  servedFrom: RemoteRefVm[];
  merged: LabelNoteVm | null;
  usedBy: RunnerVm[];
  /** Why no binding resolves to it; null while some do. */
  usedByEmpty: string | null;
  shippedBy: ShipperVm[];
  /** Null for a version none of whose builds materialize. */
  entrypoints: {
    count: number;
    groups: BuildGroupVm<EntrypointVm>[];
  } | null;
  files: {
    count: number;
    /** Entry files first, then chunks, per build. */
    groups: BuildGroupVm<FileVm>[];
    sri: LabelNoteVm & { complete: boolean };
    /** Set when a build's bundle registers no chunk list, so its chunks are not listed. */
    unlistedChunks: LabelNoteVm | null;
  } | null;
}

export interface VersionRowVm {
  tag: string;
  status: LabelNoteVm;
  /** A copy of this version materializes in the import map. */
  mapped: boolean;
  shippedBy: number;
  usedBy: number;
  notes: VersionNoteVm[];
  dive: DeepDiveVm;
}

export interface RangeCellVm {
  accepts: boolean | null;
  elected: boolean;
  ships: boolean;
  note: string;
}

export interface RangeCheckVm {
  versions: { tag: string; elected: boolean }[];
  rows: { remote: RemoteRefVm; range: string; cells: RangeCellVm[] }[];
}

export interface ScopeBlockVm {
  /** `<scope>|<pkg>` — the block's anchor and the `select` value of links into it. */
  id: string;
  scope: string;
  label: string;
  note: string;
  /** The link's scope: the detail scrolls it into view. */
  focused: boolean;
  elected: { tag: string; remote: RemoteRefVm | null } | null;
  /** Shown instead of `elected` in the strict scope or without a `share` row. */
  electionNote: string | null;
  pool: { label: string; note: string; poolSelect: string } | null;
  versions: VersionRowVm[];
  rangeCheck: RangeCheckVm | null;
  /** Unresolved bindings, the no-copies line and diagnostics of this scope. */
  bindings: PackageDetailVm | null;
}

export interface PackageViewVm {
  packageName: string;
  scopeCount: number;
  scopes: ScopeBlockVm[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const scopeLabelOf = (scope: string) => (scope === GLOBAL_SCOPE ? 'global' : scope);
const remoteRef = (name: string): RemoteRefVm => ({
  name: participantDisplay(name),
  host: isHostRemote(name),
  select: name,
});

const STATUS_LABELS: Record<VersionVerdict['status'], string> = {
  shared: 'shared',
  scoped: 'scoped',
  subpool: 'subpool',
  skipped: 'skipped',
  unknown: 'unknown',
};

const names = (records: readonly DeclarationVerdictRecord[]) =>
  [...new Set(records.map((d) => participantDisplay(d.participant)))].join(', ');

const VERDICT_LABELS: Record<DeclarationVerdict, string> = {
  provides: 'provides',
  'same-version': 'same version',
  'reuses-shared': 'reuses shared',
  subpool: 'subpool',
  'own-copy': 'own copy',
  'out-of-range': 'out of range',
  unknown: 'unknown',
};

function scopeNoteOf(scope: string): string {
  if (scope === GLOBAL_SCOPE) return 'the default share scope — no shareScope configured';
  if (scope === STRICT_SCOPE) {
    return "shareScope: 'strict' · no election, every exact version is shared side by side";
  }
  return `configured via shareScope: '${scope}'`;
}

function notesOf(
  version: VersionVerdict,
  verdicts: PackageScopeVerdicts,
  shippers: DeclarationVerdictRecord[],
): VersionNoteVm[] {
  const notes: VersionNoteVm[] = [];
  const named = (verdict: DeclarationVerdict) => shippers.filter((d) => d.verdict === verdict);
  const outOfRange = named('out-of-range');
  if (outOfRange.length > 0) {
    notes.push({
      kind: 'out-of-range',
      label: `${outOfRange.map((d) => participantDisplay(d.participant)).join(', ')} out of range`,
      note: outOfRange
        .map((d) => `${participantDisplay(d.participant)}: ${verdictNoteOf(d, verdicts, null)}`)
        .join('\n'),
    });
  }
  const subpool = named('subpool');
  if (subpool.length > 0) {
    notes.push({
      kind: 'subpool',
      label: `${subpool.map((d) => participantDisplay(d.participant)).join(', ')} subpool`,
      note: subpool
        .map((d) => `${participantDisplay(d.participant)}: ${verdictNoteOf(d, verdicts, null)}`)
        .join('\n'),
    });
  }
  const own = named('own-copy');
  if (own.length > 0) {
    notes.push({
      kind: 'own-copy',
      label: `${own.map((d) => participantDisplay(d.participant)).join(', ')} own copy`,
      note: own
        .map((d) => `${participantDisplay(d.participant)}: ${verdictNoteOf(d, verdicts, null)}`)
        .join('\n'),
    });
  }
  if (version.merged) {
    notes.push({
      kind: 'merged',
      label: `merged · ${plural(shareBuildsOf(version).length, 'build', 'builds')}`,
      note: mergedNoteOf(version),
    });
  }
  return notes;
}

const shareBuildsOf = (version: VersionVerdict) => version.builds.filter((b) => b.fromShareRow);

function mergedNoteOf(version: VersionVerdict): string {
  const builds = shareBuildsOf(version).map((b) =>
    b.sourceRemote ? participantDisplay(b.sourceRemote) : 'a build',
  );
  return `No serving build is recorded, so the map serves each entrypoint of ${version.tag} from the first copy that declares it (${builds.join(', ')}). One version, several builds.`;
}

function sriOf(version: VersionVerdict): LabelNoteVm & { complete: boolean } {
  const files = version.builds.flatMap((b) => b.entryFiles);
  const hashed = files.filter((f) => f.hasIntegrity).length;
  const chunkNote = version.builds.some((b) => b.chunkFiles.length > 0)
    ? ' Chunk files are not import-map targets, so the map records no integrity for them.'
    : '';
  if (hashed === files.length) {
    return {
      label: 'SRI ✓',
      note: `every mapped entry file carries an SRI hash.${chunkNote}`,
      complete: true,
    };
  }
  if (hashed === 0) {
    return {
      label: 'no SRI',
      note: `no mapped entry file carries an SRI hash in the captured import map.${chunkNote}`,
      complete: false,
    };
  }
  return {
    label: `SRI ${hashed}/${files.length}`,
    note: `${hashed} of ${files.length} mapped entry files carry an SRI hash.${chunkNote}`,
    complete: false,
  };
}

function diveOf(
  version: VersionVerdict,
  verdicts: PackageScopeVerdicts,
  shippers: DeclarationVerdictRecord[],
  electedRemote: string | null,
): DeepDiveVm {
  const elected = verdicts.electedTag;
  const runners = verdicts.declarations.filter((d) => d.runsTag === version.tag);
  const builds = version.builds.filter((b) => b.specifiers.length > 0 || b.chunkFiles.length > 0);
  const multi = builds.length > 1;
  const offMap = shippers.filter((d) => d.reason !== null);
  const lacking = new Map<string, string>();
  for (const d of offMap) {
    const miss = d.reason!.miss;
    if (miss?.kind !== 'coverage') continue;
    const where =
      d.reason!.scope === 'pool' || d.reason!.build === null
        ? 'not on the global map'
        : `not in ${participantDisplay(d.reason!.build)}'s build`;
    for (const specifier of miss.missing) lacking.set(specifier, where);
  }

  const entrypoints =
    builds.length === 0
      ? null
      : {
          count: builds.reduce((n, b) => n + b.specifiers.length, 0),
          groups: builds.map((b) => ({
            build: multi && b.sourceRemote ? remoteRef(b.sourceRemote) : null,
            items: b.specifiers.map((specifier) => ({
              specifier,
              missing: lacking.get(specifier) ?? null,
            })),
          })),
        };
  const files =
    builds.length === 0
      ? null
      : {
          count: builds.reduce((n, b) => n + b.entryFiles.length + b.chunkFiles.length, 0),
          groups: builds.map((b) => ({
            build: multi && b.sourceRemote ? remoteRef(b.sourceRemote) : null,
            items: [
              ...b.entryFiles.map((f) => ({ name: targetFileName(f.url), url: f.url })),
              ...b.chunkFiles.map((f) => ({ name: f.file, url: f.url })),
            ],
          })),
          sri: sriOf(version),
          unlistedChunks: unlistedChunksOf(builds),
        };

  return {
    servedFrom: builds.flatMap((b) => (b.sourceRemote ? [remoteRef(b.sourceRemote)] : [])),
    merged: version.merged ? { label: 'merged', note: mergedNoteOf(version) } : null,
    usedBy: runners.map((d) => ({
      remote: remoteRef(d.participant),
      outOfRange: d.verdict === 'out-of-range',
      note: verdictNoteOf(d, verdicts, electedRemote),
    })),
    usedByEmpty:
      runners.length > 0
        ? null
        : elected === null || version.tag === elected
          ? 'no remote resolves to it in this capture'
          : `no remote · ${shippers.length === 1 ? 'its shipper resolves' : 'its shippers resolve'} to the shared ${elected}`,
    shippedBy: shippers.map((d) => {
      const note = verdictNoteOf(d, verdicts, electedRemote);
      const range =
        elected === null
          ? `range: exact ${d.tag} (strict scope stores no configured range)`
          : `range: ${d.requiredVersion} (${d.strictVersion ? 'strict' : 'not strict'})`;
      return {
        remote: remoteRef(d.participant),
        verdict: { kind: d.verdict, label: VERDICT_LABELS[d.verdict], note },
        pooled: d.reason?.scope === 'pool',
        tip: [
          `${participantDisplay(d.participant)} · ${VERDICT_LABELS[d.verdict]}`,
          range,
          ...note.split(' · '),
        ].join('\n'),
      };
    }),
    entrypoints,
    files,
  };
}

function unlistedChunksOf(builds: VersionVerdict['builds']): LabelNoteVm | null {
  const unlisted = builds.filter((b) => b.unlistedChunks);
  if (unlisted.length === 0) return null;
  const whose = unlisted.map((b) =>
    b.sourceRemote ? participantDisplay(b.sourceRemote) : 'a build',
  );
  return {
    label: 'no chunk list',
    note: `the capture registers no chunk list for the bundle of ${whose.join(', ')}\nits chunk files are not listed here`,
  };
}

function mappedOf(
  version: VersionVerdict,
  verdicts: PackageScopeVerdicts,
  shippers: DeclarationVerdictRecord[],
): string {
  const own = shippers.filter((d) => d.verdict === 'own-copy');
  switch (version.status) {
    case 'shared': {
      const who =
        verdicts.electedTag === null ? 'the remotes that ship it' : 'every remote in this scope';
      return own.length === 0 ? `for ${who}` : `for ${who} but ${names(own)}`;
    }
    case 'scoped':
      return `only for ${names(own)}`;
    case 'subpool': {
      const owners = new Set(shippers.map((d) => d.subpoolOf).filter((o) => o !== null));
      const members = verdicts.declarations.filter(
        (d) => d.subpoolOf !== null && owners.has(d.subpoolOf),
      );
      return `only for the subpool of ${[...owners].map(participantDisplay).join(', ')}: ${names(members)}`;
    }
    case 'skipped':
      return 'not mapped';
    case 'unknown':
      return version.copyIds.length > 0 ? 'mapped, but no stored row says for whom' : 'not mapped';
  }
}

function statusNoteOf(
  version: VersionVerdict,
  verdicts: PackageScopeVerdicts,
  shippers: DeclarationVerdictRecord[],
): string {
  const mapped = mappedOf(version, verdicts, shippers);
  switch (version.status) {
    case 'shared':
      return `a share row\nthe map publishes it ${mapped}`;
    case 'scoped':
      return `a scope row\nmapped ${mapped}, from its own build`;
    case 'subpool':
      return `every row is a skip, yet a subpool runs it\nmapped ${mapped}`;
    case 'skipped':
      return 'every row is a skip\nno copy of it is mapped';
    case 'unknown':
      return `the stored rows do not explain this version\n${mapped}`;
  }
}

function rangeCheckOf(verdicts: PackageScopeVerdicts): RangeCheckVm | null {
  const elected = verdicts.electedTag;
  if (verdicts.declarations.length === 0) return null;
  return {
    versions: verdicts.versions.map((v) => ({ tag: v.tag, elected: v.tag === elected })),
    rows: verdicts.declarations.map((d) => ({
      remote: remoteRef(d.participant),
      range: d.requiredVersion,
      cells: d.acceptance.map(({ tag, accepts }) => ({
        accepts,
        elected: tag === elected,
        ships: tag === d.tag,
        note: `${d.requiredVersion} ${accepts === null ? 'cannot be read against' : accepts ? 'accepts' : 'rejects'} ${tag}${tag === d.tag ? ` · ${participantDisplay(d.participant)} ships ${tag}` : ''}`,
      })),
    })),
  };
}

function poolOf(verdicts: PackageScopeVerdicts, pools: readonly TagPool[]): ScopeBlockVm['pool'] {
  const pool = pools.find((p) => p.sharedExternalIds.includes(verdicts.sharedExternalId));
  return pool === undefined
    ? null
    : {
        label: `pool: ${pool.name}`,
        note: `member of tag pool ${pool.name} — open it in the Pools tab`,
        poolSelect: pool.id,
      };
}

export function buildPackageView(
  entry: PackageEntry,
  allGroups: PackageGroup[],
  indexes: CanonicalIndexes,
  focusedScope: string | null,
): PackageViewVm {
  const scopes = entry.verdicts.map((verdicts): ScopeBlockVm => {
    const group = entry.groups.find((g) => g.scope === verdicts.shareScope)!;
    const electedRemote =
      verdicts.electedDeclarationId === null
        ? null
        : (indexes.declarationById.get(verdicts.electedDeclarationId)?.participant ?? null);
    const recordById = new Map(verdicts.declarations.map((d) => [d.declarationId, d]));
    return {
      id: packageId(verdicts.shareScope, verdicts.packageName),
      scope: verdicts.shareScope,
      label: scopeLabelOf(verdicts.shareScope),
      note: scopeNoteOf(verdicts.shareScope),
      focused: verdicts.shareScope === focusedScope,
      elected:
        verdicts.electedTag === null
          ? null
          : {
              tag: verdicts.electedTag,
              remote: electedRemote === null ? null : remoteRef(electedRemote),
            },
      electionNote:
        verdicts.electedTag !== null
          ? null
          : verdicts.shareScope === STRICT_SCOPE
            ? 'every exact version shared'
            : 'no shared version elected in this capture',
      pool: poolOf(verdicts, indexes.projection.tagPools),
      versions: verdicts.versions.map((version) => {
        const shippers = version.declarationIds.map((id) => recordById.get(id)!).filter(Boolean);
        return {
          tag: version.tag,
          status: {
            label: STATUS_LABELS[version.status],
            note: statusNoteOf(version, verdicts, shippers),
          },
          mapped: version.copyIds.length > 0,
          shippedBy: shippers.length,
          usedBy: verdicts.declarations.filter((d) => d.runsTag === version.tag).length,
          notes: notesOf(version, verdicts, shippers),
          dive: diveOf(version, verdicts, shippers, electedRemote),
        };
      }),
      rangeCheck: rangeCheckOf(verdicts),
      bindings: buildDetail(allGroups, indexes, group.id),
    };
  });
  return { packageName: entry.packageName, scopeCount: scopes.length, scopes };
}
