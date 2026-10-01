/**
 * Packages view model — the pure vm layer of the default V2 view. Inputs are
 * the canonical Store façade (`model.resolutionProjection`,
 * `model.effectiveConsumerResolutions`, `model.registryEvidence`) plus
 * caller-owned UI state; the output is render-ready only: templates consume
 * these rows, never store types (T7-AC-05).
 *
 * This file is the FACADE: grouping per package, scopes summary, the
 * combinable filters (status × participant × search), sort, and the public
 * surface. The halves live beside it — `packages-row-vm.ts` (one row per
 * package across scopes, status marks, copy count) and
 * `packages-detail-vm.ts` (copy blocks, unresolved bucket, diagnostics
 * footer; chunks via `packages-chunk-vm.ts`); shared internals in
 * `packages-vm-shared.ts`. Views import from here only.
 *
 * Presentation doctrine (packages-verdicts, over the T7 model): the list
 * names deviations the projection publishes (`packageScopeVerdicts`) and
 * nothing else; scopes, versions and entrypoints live in the detail.
 *
 * The builder groups and flattens precomputed knowledge — it derives
 * nothing new.
 */
import type { TreeTableRow } from '../../shared/kit/tree-table';
import type { FederationModel } from '../../shared/store/federation-model';
import type { PackageScopeVerdicts, SharedExternalId } from '../../shared/store/resolution';
import { PackageDetailVm, buildDetail } from './packages-detail-vm';
import { PackageViewVm, buildPackageView } from './packages-version-vm';
import {
  PackageEntry,
  PackagesRowPayload,
  buildRows,
  mappedVersionsOf,
  marksOf,
} from './packages-row-vm';
import {
  CanonicalIndexes,
  GLOBAL_SCOPE,
  PackageGroup,
  buildCanonicalIndexes,
  copyGroupIds,
  involvedParticipantsOf,
  isHostRemote,
  multiVersionOf,
  noCopyNoteOf,
  packageId,
  participantDisplay,
} from './packages-vm-shared';

export { packageId } from './packages-vm-shared';
export type {
  PackageMarkKind,
  PackageMarkVm,
  PackageRowVm,
  PackagesRowPayload,
} from './packages-row-vm';
export type {
  AnnotationVm,
  ConsumerRowVm,
  CopyBlockVm,
  CopyFileVm,
  CopySourceVm,
  DeclaredVm,
  PackageDetailVm,
  UnresolvedRowVm,
} from './packages-detail-vm';
export type { ChunkClaimVm } from './packages-chunk-vm';
export type * from './packages-version-vm';
export { TORN_DOCS_URL } from './packages-version-vm';

export type PackagesFilter = 'all' | 'multi' | 'out-of-range' | 'isolated' | 'torn';
export type PackagesSort = 'name' | 'copies' | 'remotes';

/** Caller-owned UI state — filters, search, sort and selection live in the view. */
export interface PackagesUiState {
  filter: PackagesFilter;
  /** Raw participant name; null shows every package (single-select chips). */
  selectedParticipant: string | null;
  /** Case-insensitive substring of the package name; empty or absent shows all. */
  query?: string;
  /** Defaults to `name`. */
  sort?: PackagesSort;
  /**
   * A package name (row clicks) or a `<scope>|<pkg>` package id (cross-links
   * from other tabs, the `select` query param); the latter also focuses that scope.
   */
  selectedId: string | null;
}

export interface ScopeSummaryVm {
  /** Verbatim share-scope name (registry evidence, tooltip). */
  scope: string;
  /** Display label — the `__GLOBAL__` sentinel reads as 'global'. */
  label: string;
  packageCount: number;
}

/** One participant-filter chip; `name` is the raw select value. */
export interface ParticipantChipVm {
  name: string;
  host: boolean;
}

export interface FilterOptionVm {
  id: PackagesFilter;
  label: string;
  /** Packages it keeps within the participant selection. */
  count: number;
  /** What it keeps (tooltip); null on All. */
  note: string | null;
}

export interface PackagesVm {
  scopes: ScopeSummaryVm[];
  filters: FilterOptionVm[];
  /** Every participant involved anywhere in the capture — host first. */
  participants: ParticipantChipVm[];
  rows: TreeTableRow<PackagesRowPayload>[];
  /** The selected package's row key; null without a selection. */
  selectedPackage: string | null;
  /** The selected package across its scopes; null without a selection. */
  packageView: PackageViewVm | null;
  /** The per-copy view of the focused scope (the link's scope, else the first). */
  detail: PackageDetailVm | null;
  /** Honest empty note; null while the list has rows. */
  emptyNote: string | null;
}

const FILTER_NOUNS: Record<PackagesFilter, string> = {
  all: 'packages',
  multi: 'packages with multiple versions',
  'out-of-range': 'packages running out of range',
  isolated: 'isolated packages',
  torn: 'torn packages',
};

const FILTERS: { id: PackagesFilter; label: string; note: string | null }[] = [
  { id: 'all', label: 'All', note: null },
  {
    id: 'multi',
    label: 'Multiple versions',
    note: 'more than one version resolves in a share scope (strict excluded)',
  },
  {
    id: 'out-of-range',
    label: 'Out of range',
    note: 'a non-strict remote resolves to a shared version its range rejects',
  },
  {
    id: 'isolated',
    label: 'Isolated',
    note: 'a strict remote rejects the shared version and keeps its own copy',
  },
  { id: 'torn', label: 'Torn', note: 'entrypoints run a different version than their package' },
];

function keeps(filter: PackagesFilter, entry: PackageEntry): boolean {
  if (filter === 'all') return true;
  if (filter === 'multi') return entry.multiVersion;
  return marksOf(entry).some((mark) => mark.kind === filter);
}

/** `<scope>|<pkg>` ids carry a scope; package names never contain `|`. */
export function parseSelection(
  selectedId: string | null,
): { packageName: string; scope: string | null } | null {
  if (selectedId === null) return null;
  const bar = selectedId.lastIndexOf('|');
  return bar === -1
    ? { packageName: selectedId, scope: null }
    : { packageName: selectedId.slice(bar + 1), scope: selectedId.slice(0, bar) };
}

export function buildPackagesVm(model: FederationModel, ui: PackagesUiState): PackagesVm {
  const indexes = buildCanonicalIndexes(model);
  const groups = groupPackages(model, indexes);
  const scopes = summarizeScopes(groups);
  const entries = entriesOf(groups, model.resolutionProjection.packageScopeVerdicts, indexes);

  const participants = participantChips(entries);
  const selected = ui.selectedParticipant;
  const involvedEntries =
    selected === null ? entries : entries.filter((entry) => entry.involved.has(selected));
  const filters = FILTERS.map((option) => ({
    ...option,
    count: involvedEntries.filter((entry) => keeps(option.id, entry)).length,
  }));

  const query = (ui.query ?? '').trim().toLowerCase();
  const visible = involvedEntries
    .filter((entry) => keeps(ui.filter, entry))
    .filter((entry) => query === '' || entry.packageName.toLowerCase().includes(query))
    .sort(sorter(ui.sort ?? 'name'));
  const rows = buildRows(visible);

  const selection = parseSelection(ui.selectedId);
  const selectedEntry =
    selection === null ? undefined : entries.find((e) => e.packageName === selection.packageName);
  const focusedGroup =
    selectedEntry?.groups.find((group) => group.scope === selection?.scope) ??
    selectedEntry?.groups[0];
  const detail = buildDetail(groups, indexes, focusedGroup?.id ?? null);

  let emptyNote: string | null = null;
  if (groups.length === 0) {
    emptyNote = 'no shared packages in this capture';
  } else if (rows.length === 0) {
    const who = selected === null ? null : participantDisplay(selected);
    const what = FILTER_NOUNS[ui.filter];
    emptyNote =
      query !== ''
        ? `no ${what} match “${(ui.query ?? '').trim()}”`
        : who === null
          ? `no ${what} in this capture`
          : `no ${what} involve ${who} in this capture`;
  }

  return {
    scopes,
    filters,
    participants,
    rows,
    selectedPackage: selectedEntry?.packageName ?? null,
    packageView:
      selectedEntry === undefined
        ? null
        : buildPackageView(selectedEntry, groups, indexes, selection?.scope ?? null),
    detail,
    emptyNote,
  };
}

function sorter(sort: PackagesSort): (a: PackageEntry, b: PackageEntry) => number {
  const byName = (a: PackageEntry, b: PackageEntry) =>
    a.packageName < b.packageName ? -1 : a.packageName > b.packageName ? 1 : 0;
  if (sort === 'copies') {
    return (a, b) => mappedVersionsOf(b).length - mappedVersionsOf(a).length || byName(a, b);
  }
  if (sort === 'remotes') {
    return (a, b) => b.involved.size - a.involved.size || byName(a, b);
  }
  return byName;
}

/** Scope groups joined per package, store order, with the projection's verdicts. */
function entriesOf(
  groups: PackageGroup[],
  verdicts: readonly PackageScopeVerdicts[],
  indexes: CanonicalIndexes,
): PackageEntry[] {
  const verdictsById = new Map(verdicts.map((v) => [packageId(v.shareScope, v.packageName), v]));
  const byName = new Map<string, PackageEntry>();
  for (const group of groups) {
    let entry = byName.get(group.packageName);
    if (entry === undefined) {
      entry = {
        packageName: group.packageName,
        groups: [],
        verdicts: [],
        involved: new Set(),
        multiVersion: false,
        unknownTagCopies: 0,
        noCopyNote: noCopyNoteOf(group, indexes),
      };
      byName.set(group.packageName, entry);
    }
    entry.groups.push(group);
    const groupVerdicts = verdictsById.get(group.id);
    if (groupVerdicts !== undefined) entry.verdicts.push(groupVerdicts);
    for (const name of involvedParticipantsOf(group, indexes)) entry.involved.add(name);
    entry.multiVersion ||= group.multiVersion;
    entry.unknownTagCopies += group.unknownTagCopyCount;
  }
  return [...byName.values()];
}

/** Distinct involved participants over all packages — host first, then first seen. */
function participantChips(entries: PackageEntry[]): ParticipantChipVm[] {
  const seen = new Set<string>();
  const chips: ParticipantChipVm[] = [];
  for (const entry of entries) {
    for (const name of entry.involved) {
      if (!seen.has(name)) {
        seen.add(name);
        chips.push({ name, host: isHostRemote(name) });
      }
    }
  }
  return [...chips.filter((chip) => chip.host), ...chips.filter((chip) => !chip.host)];
}

/**
 * One group per (share scope, package) from the canonical shared-external
 * records, store order; copies join source-first (the `packageMeasures`
 * attribution). An empty share scope holds no records and manufactures no
 * packages (T7-AC-02).
 */
function groupPackages(model: FederationModel, indexes: CanonicalIndexes): PackageGroup[] {
  const groups: PackageGroup[] = [];
  const byId = new Map<string, PackageGroup>();
  const groupIdBySharedExternal = new Map<SharedExternalId, string>();
  for (const external of model.registryEvidence.sharedExternals) {
    const id = packageId(external.shareScope, external.packageName);
    groupIdBySharedExternal.set(external.id, id);
    let group = byId.get(id);
    if (group === undefined) {
      group = {
        id,
        scope: external.shareScope,
        packageName: external.packageName,
        registrations: [],
        copies: [],
        resolvedTags: [],
        unknownTagCopyCount: 0,
        multiVersion: false,
      };
      byId.set(id, group);
      groups.push(group);
    }
    for (const registrationId of external.versionRegistrationIds) {
      const registration = indexes.registrationById.get(registrationId);
      if (registration === undefined) {
        continue;
      }
      group.registrations.push({
        registration,
        declarations: registration.participantDeclarationIds.flatMap((declarationId) => {
          const declaration = indexes.declarationById.get(declarationId);
          return declaration === undefined ? [] : [declaration];
        }),
      });
    }
  }

  const knownGroupIds = new Set(byId.keys());
  for (const copy of model.resolutionProjection.copies) {
    for (const groupId of copyGroupIds(copy, indexes, knownGroupIds, groupIdBySharedExternal)) {
      const group = byId.get(groupId);
      if (group === undefined) {
        continue;
      }
      group.copies.push(copy);
      if (copy.resolvedTag === null) {
        group.unknownTagCopyCount += 1;
      } else if (!group.resolvedTags.includes(copy.resolvedTag)) {
        group.resolvedTags.push(copy.resolvedTag);
      }
    }
  }
  for (const group of groups) {
    group.multiVersion = multiVersionOf(group.scope, group.resolvedTags);
  }
  return groups;
}

function summarizeScopes(groups: PackageGroup[]): ScopeSummaryVm[] {
  const counts = new Map<string, number>();
  for (const group of groups) {
    counts.set(group.scope, (counts.get(group.scope) ?? 0) + 1);
  }
  return [...counts.entries()].map(([scope, packageCount]) => ({
    scope,
    label: scope === GLOBAL_SCOPE ? 'global' : scope,
    packageCount,
  }));
}
