import { placementReasonText } from '../../shared/placement-text';
import { PoolChipVm, poolChipOf } from '../../shared/pool-chip';
import type { FederationModel, RemoteEntity } from '../../shared/store/federation-model';
import type {
  DeclarationResolutionClaim,
  DeclarationVerdictRecord,
  PackageScopeVerdicts,
  ParticipantDeclaration,
  ResolvedDependencyCopy,
} from '../../shared/store/resolution';
import { ownCopyFallbackOf, subpoolWhereOf } from '../../shared/verdict-text';
import {
  CanonicalIndexes,
  GLOBAL_SCOPE,
  STRICT_SCOPE,
  copySourceVmOf,
  isHostRemote,
  packageId,
  participantDisplay,
  targetFileName,
} from '../../shared/view-conventions';

/**
 * Where one declared package runs from, seen from its remote (orchestrator 4.8: every entrypoint
 * of a package from one build):
 * - `self`: its own build, the one the map serves to everyone
 * - `shared`: another remote's build
 * - `subpool` / `owner`: a subpool runs another remote's build / this remote's build
 * - `own`: its own build, off the shared one (a `scope` row; shown as `scoped`)
 * - `off`: another remote's build, outside its declared range
 * - `unresolved`: no binding resolves
 * - `unknown`: a copy without an evidenced source
 */
export type RunsKind =
  'self' | 'shared' | 'subpool' | 'owner' | 'own' | 'off' | 'unresolved' | 'unknown';

export interface RemoteRefVm {
  name: string;
  host: boolean;
  /** `select` payload for the /remotes cross-link. */
  select: string;
}

export interface RunsEntrypointVm {
  specifier: string;
  file: string | null;
  targetUrl: string | null;
  /** The build it resolves to when that is not the row's build (pre-4.8 stitching). */
  source: RemoteRefVm | null;
  /** Why it is off the row's build or resolves nowhere; null otherwise. */
  note: string | null;
}

export interface RunsRowVm {
  /** Declaration ID of the row's package. */
  key: string;
  kind: RunsKind;
  packageName: string;
  packageSelect: string;
  /** Null in the global scope. */
  scopeLabel: string | null;
  /** The tag the remote runs; null when nothing resolves. */
  tag: string | null;
  from: { label: string | null; remote: RemoteRefVm | null };
  /** Only off the norm: a short label, the full reason as its tooltip. */
  why: { label: string; note: string } | null;
  /** `^1.0.0 · strict`, or `exact 1.2.0` in the strict scope. */
  declared: string;
  /** The tag of the remote's own registration. */
  ships: string;
  pool: PoolChipVm | null;
  entrypoints: RunsEntrypointVm[];
  /** Other remotes running this remote's build of the package. */
  servedTo: RemoteRefVm[];
}

export interface RunsTallyVm {
  kind: RunsKind;
  label: string;
}

export interface RunsVm {
  rows: RunsRowVm[];
  tally: RunsTallyVm[];
}

const ORDER: Record<RunsKind, number> = {
  unresolved: 0,
  off: 1,
  own: 2,
  owner: 3,
  subpool: 4,
  unknown: 5,
  shared: 6,
  self: 7,
};

/** Tally words for the kinds off the norm. */
export const KIND_LABELS: Partial<Record<RunsKind, string>> = {
  unresolved: 'not mapped',
  off: 'out of range',
  own: 'scoped',
  owner: 'subpool owner',
  subpool: 'subpool',
};

const remoteRef = (name: string): RemoteRefVm => ({
  name: participantDisplay(name),
  host: isHostRemote(name),
  select: name,
});

const scopeLabelOf = (scope: string) => (scope === GLOBAL_SCOPE ? null : scope);

// `cause: text` from placement-text; the cause is the label.
function placementWhy(text: string | null, fallback: string): RunsRowVm['why'] {
  if (text === null) return null;
  const match = /^([a-z ]{1,24}): /.exec(text);
  return { label: match ? match[1] : fallback, note: text };
}

const QUALIFIER_LABELS: Record<string, string> = {
  'ambiguous-source': 'several sources match',
  'observed-target-source': 'matched by scope URL',
  'unknown-source': 'no source record',
};

function unresolvedStateOf(
  claim: DeclarationResolutionClaim | undefined,
  indexes: CanonicalIndexes,
): { label: string; short: string; note: string } {
  if (claim === undefined) {
    return {
      label: 'declared',
      short: 'no entrypoints',
      note: 'declaration without entrypoint candidates — no resolution claim derivable',
    };
  }
  const resolution = indexes.resolutionById.get(claim.effectiveResolutionId);
  switch (resolution?.status) {
    case 'unmapped':
      return {
        label: 'not mapped',
        short: 'no import-map entry',
        note: 'no applicable import-map binding for this specifier in this capture',
      };
    case 'blocked':
      return {
        label: 'blocked',
        short: 'entry blocked',
        note: `the matching import-map entry terminally blocks this binding (${resolution.blockedReason})`,
      };
    case 'unknown':
      return {
        label: 'unknown',
        short: 'evidence missing',
        note: `required evidence missing: ${resolution.unknownReasons.join(', ')}`,
      };
    default:
      return {
        label: 'unknown',
        short: 'evidence missing',
        note: 'mapping state not derivable from the captured evidence',
      };
  }
}

interface Context {
  remote: RemoteEntity;
  model: FederationModel;
  indexes: CanonicalIndexes;
  verdictsByDeclaration: Map<string, PackageScopeVerdicts>;
}

function kindOf(
  record: DeclarationVerdictRecord | undefined,
  self: string,
  source: string | null,
): RunsKind {
  switch (record?.verdict) {
    case 'own-copy':
      return 'own';
    case 'subpool':
      return record.subpoolOf === self ? 'owner' : 'subpool';
    case 'out-of-range':
      return 'off';
    default:
      return source === null ? 'unknown' : source === self ? 'self' : 'shared';
  }
}

function fromOf(
  kind: RunsKind,
  record: DeclarationVerdictRecord | undefined,
  copy: ResolvedDependencyCopy,
  ctx: Context,
): RunsRowVm['from'] {
  const source = copySourceVmOf(copy);
  const sourceRef = source.remoteSelect === null ? null : remoteRef(source.remoteSelect);
  switch (kind) {
    case 'self':
      return { label: 'self', remote: null };
    case 'own':
      return source.remoteSelect === null || source.remoteSelect === ctx.remote.name
        ? { label: 'scoped', remote: null }
        : { label: 'scoped copy of', remote: sourceRef };
    case 'owner':
      return { label: 'self · subpool', remote: null };
    case 'subpool':
      return {
        label: 'subpool of',
        remote: record?.subpoolOf ? remoteRef(record.subpoolOf) : sourceRef,
      };
    case 'off':
      return { label: 'out of range', remote: sourceRef };
    case 'shared':
      return { label: isQualified(copy) ? source.label : null, remote: sourceRef };
    default:
      return { label: source.label, remote: null };
  }
}

const isQualified = (copy: ResolvedDependencyCopy) => {
  const { qualifier } = copySourceVmOf(copy);
  return qualifier !== 'exact-target-source' && qualifier !== 'explicit-anchor';
};

function whyOf(
  kind: RunsKind,
  record: DeclarationVerdictRecord | undefined,
  copy: ResolvedDependencyCopy,
  ctx: Context,
): RunsRowVm['why'] {
  const verdicts = record && ctx.verdictsByDeclaration.get(record.declarationId);
  const reason = record?.reason ? placementReasonText(record.reason) : null;
  if (record !== undefined) {
    switch (kind) {
      case 'own':
        return placementWhy(
          reason ?? (verdicts ? ownCopyFallbackOf(record, verdicts) : null),
          record.strictVersion && record.acceptsElected === false
            ? 'strict range'
            : 'no reason stored',
        );
      case 'owner':
      case 'subpool':
        return placementWhy(reason ?? subpoolWhereOf(record), 'no reason stored');
      case 'off':
        return {
          label: `${record.requiredVersion} rejects ${verdicts?.electedTag}`,
          note: `${record.requiredVersion} rejects ${verdicts?.electedTag} · not strict, runs it anyway — the orchestrator stores a plain skip`,
        };
    }
  }
  const source = copySourceVmOf(copy);
  const label = QUALIFIER_LABELS[source.qualifier];
  return label === undefined ? null : { label, note: `${source.label}: ${source.note}` };
}

function declaredOf(declaration: ParticipantDeclaration, scope: string, tag: string): string {
  if (scope === STRICT_SCOPE) return `exact ${tag}`;
  return `${declaration.requiredVersion}${declaration.strictVersion ? ' · strict' : ''}`;
}

function missingOf(record: DeclarationVerdictRecord | undefined): Map<string, string> {
  const miss = record?.reason?.miss;
  if (miss?.kind !== 'coverage') return new Map();
  const where =
    record!.reason!.scope === 'pool' || record!.reason!.build === null
      ? 'not on the global map'
      : `not in ${participantDisplay(record!.reason!.build)}'s build`;
  return new Map(miss.missing.map((specifier) => [specifier, where]));
}

function rowOf(declaration: ParticipantDeclaration, ctx: Context): RunsRowVm | null {
  const { indexes } = ctx;
  const registration = indexes.registrationById.get(declaration.versionRegistrationId);
  const external =
    registration === undefined
      ? undefined
      : indexes.sharedExternalById.get(registration.sharedExternalId);
  if (registration === undefined || external === undefined) return null;

  const record = indexes.verdictByDeclaration.get(declaration.id);
  const claims = indexes.claimsByDeclaration.get(declaration.id) ?? [];
  const copyOf = (claim: DeclarationResolutionClaim) =>
    claim.copyId === null ? undefined : indexes.copyById.get(claim.copyId);
  const resolved = claims.filter((claim) => copyOf(claim) !== undefined);
  const main =
    resolved.find((claim) => claim.specifier === external.packageName) ?? resolved[0] ?? null;
  const mainCopy = main === null ? undefined : copyOf(main);
  const base = {
    key: declaration.id,
    packageName: external.packageName,
    packageSelect: packageId(external.shareScope, external.packageName),
    scopeLabel: scopeLabelOf(external.shareScope),
    declared: declaredOf(declaration, external.shareScope, registration.tag),
    ships: registration.tag,
    pool: poolChipOf(declaration, ctx.model.resolutionProjection),
    servedTo: [],
  };

  if (mainCopy === undefined) {
    const state = unresolvedStateOf(claims[0], indexes);
    return {
      ...base,
      kind: 'unresolved',
      tag: null,
      from: { label: state.label, remote: null },
      why: { label: state.short, note: state.note },
      entrypoints: claims.map((claim) => ({
        specifier: claim.specifier,
        file: null,
        targetUrl: null,
        source: null,
        note: unresolvedStateOf(claim, indexes).label,
      })),
    };
  }

  const mainSource = copySourceVmOf(mainCopy).remoteSelect;
  const kind = kindOf(record, ctx.remote.name, mainSource);
  const missing = missingOf(record);
  return {
    ...base,
    kind,
    tag: mainCopy.resolvedTag ?? record?.runsTag ?? null,
    from: fromOf(kind, record, mainCopy, ctx),
    why: whyOf(kind, record, mainCopy, ctx),
    entrypoints: claims.map((claim) => {
      const copy = copyOf(claim);
      if (copy === undefined) {
        return {
          specifier: claim.specifier,
          file: null,
          targetUrl: null,
          source: null,
          note: unresolvedStateOf(claim, indexes).label,
        };
      }
      const resolution = indexes.resolutionById.get(claim.effectiveResolutionId);
      const targetUrl =
        resolution?.status === 'mapped'
          ? resolution.targetUrl
          : (copy.entrypoints[claim.specifier] ?? null);
      const source = copySourceVmOf(copy);
      const foreign =
        copy.id !== mainCopy.id &&
        (source.remoteSelect === null || source.remoteSelect !== mainSource);
      return {
        specifier: claim.specifier,
        file: targetUrl === null ? null : targetFileName(targetUrl),
        targetUrl,
        source: foreign && source.remoteSelect !== null ? remoteRef(source.remoteSelect) : null,
        note:
          missing.get(claim.specifier) ??
          (foreign && source.remoteSelect === null ? source.label : null),
      };
    }),
  };
}

const sameOutcome = (a: RunsRowVm, b: RunsRowVm) =>
  a.kind === b.kind &&
  a.tag === b.tag &&
  a.from.label === b.from.label &&
  a.from.remote?.select === b.from.remote?.select &&
  a.why?.note === b.why?.note;

/**
 * Flat externals register each secondary entrypoint as its own package. A secondary folds into
 * its name-derived parent (the shortest same-scope prefix that has a row) when it runs the same
 * way; one that runs differently keeps its own row.
 */
function foldSecondaries(rows: RunsRowVm[]): RunsRowVm[] {
  const byName = new Map(rows.map((row) => [`${row.scopeLabel}|${row.packageName}`, row]));
  const kept: RunsRowVm[] = [];
  for (const row of rows) {
    let parent: RunsRowVm | undefined;
    for (let i = row.packageName.indexOf('/'); i > 0; i = row.packageName.indexOf('/', i + 1)) {
      parent = byName.get(`${row.scopeLabel}|${row.packageName.slice(0, i)}`);
      if (parent !== undefined) break;
    }
    if (parent !== undefined && parent !== row && sameOutcome(parent, row)) {
      parent.entrypoints.push(...row.entrypoints);
    } else {
      kept.push(row);
    }
  }
  return kept;
}

// Every copy sourced by this remote's declarations lands on its package's row, with its other consumers.
function attachServes(rows: readonly RunsRowVm[], ctx: Context): void {
  const { remote, model, indexes } = ctx;
  for (const copy of model.resolutionProjection.copies) {
    if (copy.source.kind !== 'shared-declaration') continue;
    const declaration = indexes.declarationById.get(copy.source.declarationId);
    if (declaration?.participant !== remote.name) continue;
    const registration = indexes.registrationById.get(declaration.versionRegistrationId);
    const external = registration && indexes.sharedExternalById.get(registration.sharedExternalId);
    if (external === undefined) continue;
    const row = rowOfPackage(external.packageName, external.shareScope, rows);
    if (row === undefined) continue;
    for (const relation of indexes.relationsByCopy.get(copy.id) ?? []) {
      const consumer = relation.consumerRemote;
      if (consumer !== remote.name && !row.servedTo.some((ref) => ref.select === consumer)) {
        row.servedTo.push(remoteRef(consumer));
      }
    }
  }
}

// A served secondary lands on the row it folded into.
function rowOfPackage(packageName: string, scope: string, rows: readonly RunsRowVm[]) {
  const label = scopeLabelOf(scope);
  return rows.find(
    (r) =>
      r.scopeLabel === label &&
      (r.packageName === packageName ||
        r.entrypoints.some((entrypoint) => entrypoint.specifier === packageName)),
  );
}

function tallyOf(rows: readonly RunsRowVm[]): RunsTallyVm[] {
  const tally = new Map<string, RunsTallyVm & { count: number }>();
  for (const row of rows) {
    const what =
      row.kind === 'shared' || row.kind === 'subpool'
        ? `${row.kind === 'subpool' ? 'subpool of' : 'from'} ${row.from.remote?.name ?? row.from.label}`
        : row.kind === 'unknown'
          ? 'unknown source'
          : (KIND_LABELS[row.kind] ?? row.from.label ?? row.kind);
    const entry = tally.get(what) ?? { kind: row.kind, label: what, count: 0 };
    entry.count += 1;
    tally.set(what, entry);
  }
  return [...tally.values()]
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
    .map(({ kind, label, count }) => ({ kind, label: `${count} ${label}` }));
}

export function buildRuns(
  remote: RemoteEntity,
  model: FederationModel,
  indexes: CanonicalIndexes,
): RunsVm {
  const verdictsByDeclaration = new Map<string, PackageScopeVerdicts>();
  for (const verdicts of model.resolutionProjection.packageScopeVerdicts) {
    for (const record of verdicts.declarations) {
      verdictsByDeclaration.set(record.declarationId, verdicts);
    }
  }
  const ctx: Context = { remote, model, indexes, verdictsByDeclaration };
  const rows = foldSecondaries(
    model.registryEvidence.participantDeclarations
      .filter((declaration) => declaration.participant === remote.name)
      .map((declaration) => rowOf(declaration, ctx))
      .filter((row): row is RunsRowVm => row !== null),
  ).sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.packageName.localeCompare(b.packageName));
  attachServes(rows, ctx);
  return { rows, tally: tallyOf(rows) };
}
