/**
 * Detail half of the Packages vm builder (packages-verdicts T5/T6): one
 * block per share scope of the selected package, each with the versions
 * table (one row per registered version, deviations as notes), the range
 * check, and per version the deep dive (who ships it, who
 * it resolves for, its entrypoints and files). Every fact comes from the
 * projection's `packageScopeVerdicts`; the existing copy blocks stay
 * available per scope as the collapsed bindings section.
 */
import type {
  DeclarationVerdict,
  DeclarationVerdictRecord,
  PackageScopeVerdicts,
  TagPool,
  VersionVerdict,
} from '../../shared/store/resolution';
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

export type VersionNoteKind = 'out-of-range' | 'own-copy' | 'merged';

export interface VersionNoteVm extends LabelNoteVm {
  kind: VersionNoteKind;
}

export interface VerdictVm extends LabelNoteVm {
  kind: DeclarationVerdict;
}

export interface ShipperVm {
  remote: RemoteRefVm;
  range: string;
  /** `strictVersion` of the declaration (tooltip on the range). */
  rangeNote: string;
  verdict: VerdictVm;
}

export interface RunnerVm {
  remote: RemoteRefVm;
  outOfRange: boolean;
  note: string;
}

export interface EntrypointVm {
  specifier: string;
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
  builtBy: RemoteRefVm[];
  merged: LabelNoteVm | null;
  mapped: string;
  runsIn: RunnerVm[];
  /** Why no binding resolves to it; null while some do. */
  runsInEmpty: string | null;
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
  } | null;
}

export interface VersionRowVm {
  tag: string;
  status: string;
  /** A copy of this version materializes in the import map. */
  mapped: boolean;
  shippedBy: number;
  runsIn: number;
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
  summary: string;
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
  /** The existing per-copy view of this scope (bindings, unresolved, diagnostics). */
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
  'partly-mapped': 'partly mapped',
  'not-mapped': 'not mapped',
};

const VERDICT_LABELS: Record<DeclarationVerdict, string> = {
  provides: 'provides',
  'same-version': 'same version',
  'reuses-shared': 'reuses shared',
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

function verdictNoteOf(
  record: DeclarationVerdictRecord,
  verdicts: PackageScopeVerdicts,
  electedRemote: string | null,
): string {
  const elected = verdicts.electedTag;
  const range = record.requiredVersion;
  switch (record.verdict) {
    case 'provides':
      return elected === null
        ? `strict scope · shares exact ${record.tag}`
        : `provides the shared ${record.tag} — the mapping publishes this build`;
    case 'same-version':
      return elected === null
        ? `strict scope · exact match of ${record.tag}`
        : `same version as the shared copy${electedRemote ? ` · resolves to ${participantDisplay(electedRemote)}'s build` : ''}`;
    case 'reuses-shared':
      return `${range} accepts ${elected} · resolves to the shared copy`;
    case 'own-copy':
      return `${range} rejects ${elected} · strict · keeps its own ${record.tag}`;
    case 'out-of-range':
      return `${range} rejects ${elected} · not strict · resolves to ${elected} anyway — the orchestrator stores a plain skip`;
    case 'unknown':
      return 'the stored row and the declared range do not determine a verdict in this capture';
  }
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

  const mapped =
    version.status === 'shared'
      ? elected === null
        ? 'for the remotes that ship it'
        : 'for every remote in this scope'
      : version.status === 'scoped'
        ? `only for ${shippers
            .filter((d) => d.verdict === 'own-copy')
            .map((d) => participantDisplay(d.participant))
            .join(', ')}`
        : version.status === 'partly-mapped'
          ? 'only for the remotes its build serves'
          : 'not mapped';

  const entrypoints =
    builds.length === 0
      ? null
      : {
          count: builds.reduce((n, b) => n + b.specifiers.length, 0),
          groups: builds.map((b) => ({
            build: multi && b.sourceRemote ? remoteRef(b.sourceRemote) : null,
            items: b.specifiers.map((specifier) => ({ specifier })),
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
        };

  return {
    builtBy:
      builds.length > 0
        ? builds.flatMap((b) => (b.sourceRemote ? [remoteRef(b.sourceRemote)] : []))
        : shippers.map((d) => remoteRef(d.participant)),
    merged: version.merged ? { label: 'merged', note: mergedNoteOf(version) } : null,
    mapped,
    runsIn: runners.map((d) => ({
      remote: remoteRef(d.participant),
      outOfRange: d.verdict === 'out-of-range',
      note: verdictNoteOf(d, verdicts, electedRemote),
    })),
    runsInEmpty:
      runners.length > 0
        ? null
        : elected === null || version.tag === elected
          ? 'no remote resolves to it in this capture'
          : `no remote · ${shippers.length === 1 ? 'its shipper resolves' : 'its shippers resolve'} to the shared ${elected}`,
    shippedBy: shippers.map((d) => ({
      remote: remoteRef(d.participant),
      range: d.requiredVersion,
      rangeNote:
        elected === null
          ? 'strict scope · the exact version, the configured range is not stored'
          : `${d.requiredVersion} · strictVersion: ${d.strictVersion}`,
      verdict: {
        kind: d.verdict,
        label: VERDICT_LABELS[d.verdict],
        note: verdictNoteOf(d, verdicts, electedRemote),
      },
    })),
    entrypoints,
    files,
  };
}

function rangeCheckOf(verdicts: PackageScopeVerdicts): RangeCheckVm | null {
  const elected = verdicts.electedTag;
  if (elected === null || verdicts.versions.length < 2) return null;
  const rejecting = verdicts.declarations.filter((d) => d.acceptsElected === false);
  const universal = verdicts.versions
    .map((v) => v.tag)
    .filter((tag) =>
      verdicts.declarations.every((d) => d.acceptance.find((a) => a.tag === tag)?.accepts === true),
    );
  const summary =
    rejecting.length === 0
      ? `every range accepts ${elected}`
      : `${rejecting.map((d) => participantDisplay(d.participant)).join(', ')} ${rejecting.length === 1 ? 'rejects' : 'reject'} ${elected}${universal.length === 0 ? ' · no version fits every range' : ''}`;
  return {
    summary,
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
          status: STATUS_LABELS[version.status],
          mapped: version.copyIds.length > 0,
          shippedBy: shippers.length,
          runsIn: verdicts.declarations.filter((d) => d.runsTag === version.tag).length,
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
