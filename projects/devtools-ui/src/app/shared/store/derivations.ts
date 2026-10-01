/**
 * `deriveFederation` — one pass over a `FederationModel` produces every
 * derived projection of the V2 store (providers, resolution arrows, the
 * chunk-attribution ladder, parent links, capability badges, strict-scope
 * semantics). Views render derived knowledge from here only.
 *
 * Derivation rules (corpus-derived, see the V2 plan/spec):
 * - Provider matching is most-specific scope-prefix matching over the
 *   remotes' resolved scope URLs. The host never outranks a matching
 *   remote — it wins only as the least-specific fallback when no remote
 *   prefix matches at all (a bare longest-prefix rule would let a host
 *   scoped at the page base claim every same-origin file).
 * - Registry scope URLs end with '/' in every capture, so plain prefix
 *   comparison cannot over-match across sibling directories.
 * - The share scope named 'strict' shares every exact version by design:
 *   the conflict indicator is excluded there, and `requiredVersion` is
 *   pinned to the exact tag at store time (config ranges are lost).
 * - Generation ('v4' | 'v4.5') is visible only as the badge and the rows'
 *   provenance — no derivation branches on the participant spelling.
 */
import type {
  ChunkGroup,
  EffectiveMap,
  FederationModel,
  RemoteEntity,
  SharedParticipantRow,
} from './federation-model';
import type {
  DeclaredNotMapped,
  DerivedFederation,
  PackageChunkAttribution,
  PackageConflict,
  ParentLink,
  ProviderDerivation,
  RemoteBadges,
  RemoteChunkAttribution,
  ResolutionArrow,
  SharedRowFacts,
} from './derived-model';
import { resolveUrl } from './merge-document-maps';

/** The strict share scope's registry name (spec-pinned). */
const STRICT_SCOPE = 'strict';

export function deriveFederation(model: FederationModel): DerivedFederation {
  const providers = deriveProviders(model);
  const providerByTarget = new Map(providers.map((provider) => [provider.targetUrl, provider]));
  const mapTargets = new Set(providerByTarget.keys());

  const shareRowsByPackage = groupBy(
    model.sharedRows.filter((row) => row.action === 'share'),
    packageKey,
  );
  const packagesByScope = new Map<string, Set<string>>();
  for (const row of model.sharedRows) {
    let names = packagesByScope.get(row.scope);
    if (names === undefined) {
      names = new Set();
      packagesByScope.set(row.scope, names);
    }
    names.add(row.packageName);
  }

  const sharedRowFacts: SharedRowFacts[] = model.sharedRows.map((row) => ({
    row,
    arrow: deriveArrow(row, shareRowsByPackage.get(packageKey(row)) ?? []),
    provider:
      row.resolution === null ? null : (providerByTarget.get(row.resolution.targetUrl) ?? null),
    parentLink: deriveParentLink(row, packagesByScope),
    strictPinned: row.scope === STRICT_SCOPE ? { rule: 'strict-scope-policy' } : null,
    declaredNotMapped: deriveDeclaredNotMapped(row, model, mapTargets),
  }));

  return {
    providers,
    sharedRowFacts,
    chunkAttribution: model.remotes.map((remote) => deriveChunkAttribution(remote.name, model)),
    remoteBadges: model.remotes.map((remote) =>
      deriveBadges(remote, model.sharedRows, model.chunkGroups),
    ),
    generationBadge: { generation: model.provenance.generation, rule: 'generation-aggregate' },
    packageConflicts: deriveConflicts(model.sharedRows),
  };
}

/** Most-specific scope-prefix matching over every unique effective-map target. */
function deriveProviders(model: FederationModel): ProviderDerivation[] {
  return [...collectTargets(model.effectiveMap)].sort(compareText).map((targetUrl) => {
    const matches = model.remotes
      .filter((remote) => targetUrl.startsWith(remote.resolvedScopeUrl))
      .sort(
        (a, b) =>
          b.resolvedScopeUrl.length - a.resolvedScopeUrl.length || compareText(a.name, b.name),
      );
    const nonHost = matches.filter((remote) => !remote.isHost);
    const host = matches.find((remote) => remote.isHost);
    // Host demoted behind every matching remote, whatever the lengths.
    const candidates = [...nonHost.map((remote) => remote.name), ...(host ? [host.name] : [])];
    if (nonHost.length > 0) {
      const topLength = nonHost[0].resolvedScopeUrl.length;
      const top = nonHost.filter((remote) => remote.resolvedScopeUrl.length === topLength);
      return top.length === 1
        ? provider(targetUrl, 'derived', top[0].name, false, candidates)
        : provider(targetUrl, 'ambiguous', null, false, candidates);
    }
    if (host !== undefined) {
      return provider(targetUrl, 'derived', host.name, true, candidates);
    }
    return provider(targetUrl, 'unattributable', null, false, candidates);
  });
}

function provider(
  targetUrl: string,
  outcome: ProviderDerivation['outcome'],
  remote: string | null,
  hostFallback: boolean,
  candidates: string[],
): ProviderDerivation {
  return { targetUrl, outcome, remote, hostFallback, candidates, rule: 'scope-prefix-match' };
}

/**
 * Skip rows point at the winner's served file; share and scope rows point
 * at their own copy. A skip row without a unique share row in its
 * (scope, package) group gets a winner-less arrow.
 */
function deriveArrow(
  row: SharedParticipantRow,
  shareRows: SharedParticipantRow[],
): ResolutionArrow {
  if (row.action === 'skip') {
    const winner = shareRows.length === 1 ? shareRows[0] : null;
    return {
      kind: 'winner',
      providerParticipant: winner?.participant ?? null,
      file: winner === null ? null : servedFileOf(winner),
      targetUrl: winner?.resolution?.targetUrl ?? null,
      rule: 'registry-election',
    };
  }
  return {
    kind: 'own',
    providerParticipant: row.participant,
    file: servedFileOf(row),
    targetUrl: row.resolution?.targetUrl ?? null,
    rule: 'registry-election',
  };
}

/** The row's served file for its own package specifier. */
function servedFileOf(row: SharedParticipantRow): string | null {
  const match = row.servedFiles.find(
    (served) => served.entry === row.packageName || served.entry === null,
  );
  return match?.file ?? row.servedFiles[0]?.file ?? null;
}

/**
 * `pkg/subpath` → parent package of the same share scope. The base is the
 * first two segments for scoped names ('@angular/common/http' →
 * '@angular/common', also multi-segment and file-shaped subpaths), the
 * first segment for unscoped names ('rxjs/operators' → 'rxjs').
 */
function deriveParentLink(
  row: SharedParticipantRow,
  packagesByScope: Map<string, Set<string>>,
): ParentLink | null {
  const segments = row.packageName.split('/');
  const baseLength = row.packageName.startsWith('@') ? 2 : 1;
  if (segments.length <= baseLength) {
    return null;
  }
  const parentPackage = segments.slice(0, baseLength).join('/');
  return packagesByScope.get(row.scope)?.has(parentPackage)
    ? { parentPackage, rule: 'name-derived' }
    : null;
}

/**
 * Losing-copy diff: declared files (served files plus the copy's bundle
 * chunk lists) that resolve to no effective-map target. Source-derived by
 * doctrine — no capture exhibits losing bundle-bearing copies.
 */
function deriveDeclaredNotMapped(
  row: SharedParticipantRow,
  model: FederationModel,
  mapTargets: Set<string>,
): DeclaredNotMapped | null {
  if (row.action !== 'skip') {
    return null;
  }
  const base =
    model.remotes.find((remote) => remote.name === row.participant)?.resolvedScopeUrl ??
    model.provenance.pageUrl;
  const declared = [
    ...row.servedFiles.map((served) => served.file),
    ...model.chunkGroups
      .filter(
        (group) =>
          group.owningRemote === row.participant &&
          group.origin === 'shared-chunks' &&
          group.bundleName === row.bundle,
      )
      .flatMap((group) => group.files),
  ];
  const files = declared
    .map((file) => resolveUrl(file, base))
    .filter((url) => !mapTargets.has(url));
  return { files, rule: 'source-derived' };
}

/** The three-level attribution ladder of one remote. */
function deriveChunkAttribution(
  remoteName: string,
  model: FederationModel,
): RemoteChunkAttribution {
  const groups = model.chunkGroups.filter((group) => group.owningRemote === remoteName);
  const chunkFilesByBundle = new Map<string, string[]>();
  for (const group of groups) {
    if (group.origin === 'shared-chunks' && group.bundleName !== null) {
      chunkFilesByBundle.set(group.bundleName, [
        ...(chunkFilesByBundle.get(group.bundleName) ?? []),
        ...group.files,
      ]);
    }
  }
  const bundleRows = model.sharedRows.filter(
    (row) => row.participant === remoteName && row.bundle !== null,
  );
  if (bundleRows.length > 0 && chunkFilesByBundle.size > 0) {
    const packages: PackageChunkAttribution[] = [];
    const seen = new Set<string>();
    for (const row of bundleRows) {
      const key = `${row.packageName}\u0000${row.bundle}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      packages.push({
        packageName: row.packageName,
        bundleName: row.bundle as string,
        files: chunkFilesByBundle.get(row.bundle as string) ?? [],
        rule: 'bundle-chunk-join',
      });
    }
    return {
      remote: remoteName,
      level: 'package',
      packages,
      groups,
      packageAttribution: 'derived',
      rule: 'bundle-chunk-join',
    };
  }
  if (groups.length > 0) {
    return {
      remote: remoteName,
      level: 'remote',
      packages: [],
      groups,
      packageAttribution: 'not-derivable',
      rule: 'chunk-pseudo-externals',
    };
  }
  return {
    remote: remoteName,
    level: 'none',
    packages: [],
    groups: [],
    packageAttribution: 'no-evidence',
    rule: 'no-chunk-evidence',
  };
}

function deriveBadges(
  remote: RemoteEntity,
  sharedRows: SharedParticipantRow[],
  chunkGroups: ChunkGroup[],
): RemoteBadges {
  const ownRows = sharedRows.filter((row) => row.participant === remote.name);
  const chunkLists = chunkGroups.some(
    (group) => group.owningRemote === remote.name && group.origin === 'shared-chunks',
  );
  return {
    remote: remote.name,
    denseChunking: {
      present: chunkLists || ownRows.some((row) => row.bundle !== null),
      rule: chunkLists ? 'shared-chunks-lists' : 'participant-bundle',
    },
    sri: {
      present: Object.keys(remote.integrity).length > 0,
      rule: 'integrity-map-present',
    },
    multiEntry: {
      present: ownRows.some((row) => row.servedFiles.length > 1),
      rule: 'multi-entry-map',
    },
  };
}

/**
 * One conflict indicator per (scope, package), store order. The flag keys
 * on MAPPED multiplicity (share and scope rows): more than one mapped tag
 * means more than one copy actually exists side by side. Declared-only
 * multiplicity (a skip row resolving to the elected copy) is the election
 * succeeding — recorded in `declaredTags`, never flagged.
 */
function deriveConflicts(sharedRows: SharedParticipantRow[]): PackageConflict[] {
  const conflicts: PackageConflict[] = [];
  const byPackage = new Map<string, PackageConflict>();
  for (const row of sharedRows) {
    const key = packageKey(row);
    let entry = byPackage.get(key);
    if (entry === undefined) {
      entry = {
        scope: row.scope,
        packageName: row.packageName,
        declaredTags: [],
        mappedTags: [],
        conflict: false,
        strictExcluded: false,
        rule: 'mapped-multiplicity',
      };
      byPackage.set(key, entry);
      conflicts.push(entry);
    }
    if (!entry.declaredTags.includes(row.tag)) {
      entry.declaredTags.push(row.tag);
    }
    if (row.action !== 'skip' && !entry.mappedTags.includes(row.tag)) {
      entry.mappedTags.push(row.tag);
    }
  }
  for (const entry of conflicts) {
    const multiple = entry.mappedTags.length > 1;
    entry.conflict = multiple && entry.scope !== STRICT_SCOPE;
    entry.strictExcluded = multiple && entry.scope === STRICT_SCOPE;
  }
  return conflicts;
}

function packageKey(row: SharedParticipantRow): string {
  return `${row.scope}\u0000${row.packageName}`;
}

function collectTargets(effectiveMap: EffectiveMap): Set<string> {
  const targets = new Set(Object.values(effectiveMap.imports));
  for (const scopeImports of Object.values(effectiveMap.scopes)) {
    for (const target of Object.values(scopeImports)) {
      targets.add(target);
    }
  }
  return targets;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const groupKey = key(item);
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), item]);
  }
  return groups;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
