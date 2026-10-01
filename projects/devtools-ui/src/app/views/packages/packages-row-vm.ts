/**
 * Row half of the Packages vm builder — one row per package across its
 * share scopes (packages-verdicts T4). A row is the package name, status
 * marks for the deviations the projection publishes (out of range,
 * isolated, torn), a `strict` tag when any scope is `strict`, and how many
 * copies the import map materializes. Scope names, versions and entrypoints live in
 * the detail.
 *
 * Flat-build secondaries that are their own registry keys stay their own
 * rows, indented under their name-derived parent.
 */
import type { TreeTableRow } from '../../shared/kit/tree-table';
import type { PackageScopeVerdicts } from '../../shared/store/resolution';
import { GLOBAL_SCOPE, STRICT_SCOPE, type PackageGroup } from './packages-vm-shared';

export type PackageMarkKind = 'out-of-range' | 'isolated' | 'torn';

export interface PackageMarkVm {
  kind: PackageMarkKind;
  /** Grounded reason (tooltip). */
  note: string;
}

export interface PackageRowVm {
  kind: 'package';
  /** Row and selection key: the package name, unique across scopes. */
  packageName: string;
  /** Subpath suffix (`/extra`) on linked rows, full name otherwise. */
  displayName: string;
  marks: PackageMarkVm[];
  /** Present when one of the package's scopes is `strict`. */
  strict: { note: string } | null;
  /** Copies the import map materializes, summed over scopes. */
  copies: { count: number; label: string; note: string };
  linked: { parentPackage: string; rule: 'name-derived' } | null;
}

export type PackagesRowPayload = PackageRowVm;

/** One package across its share scopes; the unit of the list and the detail. */
export interface PackageEntry {
  packageName: string;
  /** Scope groups in store order. */
  groups: PackageGroup[];
  /** The projection's verdicts, one per group, same order. */
  verdicts: PackageScopeVerdicts[];
  /** Remotes involved in any scope. */
  involved: Set<string>;
  /** Some non-strict scope resolves more than one version. */
  multiVersion: boolean;
  /** Copies without a uniquely evidenced source tag; they count, but name no version. */
  unknownTagCopies: number;
  /** Why nothing materializes, for the zero-copy row. */
  noCopyNote: string;
}

const scopeLabel = (scope: string) => (scope === GLOBAL_SCOPE ? 'global' : scope);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function mappedVersionsOf(entry: PackageEntry): { tag: string; scope: string }[] {
  return entry.verdicts.flatMap((verdicts) =>
    verdicts.versions
      .filter((version) => version.copyIds.length > 0)
      .map((version) => ({ tag: version.tag, scope: verdicts.shareScope })),
  );
}

export function marksOf(entry: PackageEntry): PackageMarkVm[] {
  const declarations = entry.verdicts.flatMap((v) => v.declarations);
  const names = (verdict: string) => [
    ...new Set(declarations.filter((d) => d.verdict === verdict).map((d) => d.participant)),
  ];
  const marks: PackageMarkVm[] = [];
  const outOfRange = names('out-of-range');
  if (outOfRange.length > 0) {
    marks.push({
      kind: 'out-of-range',
      note: `${outOfRange.join(', ')} ${outOfRange.length === 1 ? 'resolves' : 'resolve'} to a shared version ${outOfRange.length === 1 ? 'its' : 'their'} range rejects (not strict)`,
    });
  }
  const isolated = names('own-copy');
  if (isolated.length > 0) {
    marks.push({
      kind: 'isolated',
      note: `${isolated.join(', ')} ${isolated.length === 1 ? 'keeps its' : 'keep their'} own copy`,
    });
  }
  const torn = entry.verdicts.flatMap((v) => v.torn);
  if (torn.length > 0) {
    marks.push({
      kind: 'torn',
      note: `${plural(torn.length, 'entrypoint resolves', 'entrypoints resolve')} to a different version than the package`,
    });
  }
  return marks;
}

function rowOf(entry: PackageEntry, linked: { parentPackage: string } | null): PackageRowVm {
  const mapped = mappedVersionsOf(entry);
  const count = mapped.length + entry.unknownTagCopies;
  const listed = [
    ...mapped.map((d) => `${d.tag} (${scopeLabel(d.scope)})`),
    ...(entry.unknownTagCopies > 0
      ? [
          `${plural(entry.unknownTagCopies, 'copy', 'copies')} without a uniquely evidenced source tag`,
        ]
      : []),
  ];
  return {
    kind: 'package',
    packageName: entry.packageName,
    displayName: linked ? entry.packageName.slice(linked.parentPackage.length) : entry.packageName,
    marks: marksOf(entry),
    strict: entry.groups.some((group) => group.scope === STRICT_SCOPE)
      ? { note: "shareScope: 'strict' · no election, every exact version is shared side by side" }
      : null,
    copies: {
      count,
      label: count === 0 ? 'no copy' : plural(count, 'copy', 'copies'),
      note:
        count === 0
          ? entry.noCopyNote
          : `${plural(count, 'copy', 'copies')} mapped: ${listed.join(', ')}`,
    },
    linked: linked ? { parentPackage: linked.parentPackage, rule: 'name-derived' } : null,
  };
}

/** Name-derived parent among the given packages: the longest `/`-prefix that is a package. */
function parentNameOf(name: string, names: ReadonlySet<string>): string | null {
  let index = name.lastIndexOf('/');
  while (index > 0) {
    const candidate = name.slice(0, index);
    if (names.has(candidate) && candidate !== name) {
      // Scoped names (`@scope/pkg`) never parent on the bare scope.
      return candidate.startsWith('@') && !candidate.includes('/') ? null : candidate;
    }
    index = name.lastIndexOf('/', index - 1);
  }
  return null;
}

/**
 * Rows in the given (filtered, sorted) order. A linked subpath renders under
 * its parent when both are visible; with its parent filtered out it stands
 * on its own row.
 */
export function buildRows(entries: readonly PackageEntry[]): TreeTableRow<PackagesRowPayload>[] {
  const visible = new Set(entries.map((entry) => entry.packageName));
  const children = new Map<string, PackageEntry[]>();
  const bases: PackageEntry[] = [];
  for (const entry of entries) {
    const parent = parentNameOf(entry.packageName, visible);
    if (parent === null) {
      bases.push(entry);
    } else {
      children.set(parent, [...(children.get(parent) ?? []), entry]);
    }
  }
  const rows: TreeTableRow<PackagesRowPayload>[] = [];
  const push = (entry: PackageEntry, depth: number, parent: string | null) => {
    rows.push({
      id: entry.packageName,
      depth,
      expandable: false,
      expanded: false,
      payload: rowOf(entry, parent === null ? null : { parentPackage: parent }),
    });
    for (const child of children.get(entry.packageName) ?? []) {
      push(child, depth + 1, entry.packageName);
    }
  };
  for (const base of bases) push(base, 0, null);
  return rows;
}
