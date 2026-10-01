import type { BundleClaim } from './bundle-claims-model';
import type { ResolvedDependencyCopy } from './copies-model';
import type {
  CopyBuild,
  CopyGroupingFacets,
  OrphanPoolTag,
  PoolTagDeclaration,
  TagPool,
  TagPoolDerivation,
  TagPoolId,
} from './grouping-model';
import { registryEvidenceId } from './ids';
import type { CanonicalRegistryEvidence, SharedExternalId, SharedExternalRecord } from './model';

const STRICT_SCOPE = 'strict';

interface PoolCandidate {
  ids: SharedExternalId[];
  tags: PoolTagDeclaration[];
  remotes: Set<string>;
  storedPoolNames: Set<string>;
}

/** Tag pools per share scope, mirroring the orchestrator's `groupByMembership` with tag edges only. */
export function deriveTagPools(evidence: CanonicalRegistryEvidence): TagPoolDerivation {
  const registrationById = new Map(evidence.versionRegistrations.map((r) => [r.id, r]));
  const declarationById = new Map(evidence.participantDeclarations.map((d) => [d.id, d]));

  const declarationsOf = (external: SharedExternalRecord) =>
    external.versionRegistrationIds.flatMap((id) =>
      (registrationById.get(id)?.participantDeclarationIds ?? []).map((d) =>
        declarationById.get(d)!,
      ),
    );

  // Equal keys (ordinal > 0) are one external to the orchestrator: it keys storage by name.
  const byScope = new Map<string, Map<string, PoolCandidate>>();
  for (const external of evidence.sharedExternals) {
    if (external.shareScope === STRICT_SCOPE) continue;
    const scope = byScope.get(external.shareScope) ?? new Map<string, PoolCandidate>();
    byScope.set(external.shareScope, scope);
    const candidate = scope.get(external.packageName) ?? {
      ids: [],
      tags: [],
      remotes: new Set(),
      storedPoolNames: new Set(),
    };
    scope.set(external.packageName, candidate);
    candidate.ids.push(external.id);
    if (external.poolName !== null) candidate.storedPoolNames.add(external.poolName);
    for (const declaration of declarationsOf(external)) {
      candidate.remotes.add(declaration.participant);
      const tag = declaration.pool?.trim();
      if (tag) {
        candidate.tags.push({
          remote: declaration.participant,
          tag,
          packageName: external.packageName,
          declarationId: declaration.id,
        });
      }
    }
  }

  const tagPools: TagPool[] = [];
  const orphanPoolTags: OrphanPoolTag[] = [];
  for (const [shareScope, candidates] of [...byScope].sort(([a], [b]) => compareText(a, b))) {
    const components = new UnionFind();
    const extNode = (name: string) => JSON.stringify(['ext', name]);
    // Tag nodes are per remote: identical tag strings of two remotes meet only through a shared member.
    const tagNode = (remote: string, tag: string) => JSON.stringify(['tag', remote, tag]);
    for (const [name, candidate] of candidates) {
      components.add(extNode(name));
      for (const { remote, tag } of candidate.tags)
        components.union(extNode(name), tagNode(remote, tag));
    }
    for (const name of candidates.keys()) {
      const owner = owningPackage(name);
      if (owner !== undefined && candidates.has(owner))
        components.union(extNode(name), extNode(owner));
    }

    const membersByRoot = new Map<string, string[]>();
    for (const name of candidates.keys()) {
      const root = components.find(extNode(name));
      membersByRoot.set(root, [...(membersByRoot.get(root) ?? []), name]);
    }
    for (const names of membersByRoot.values()) {
      const tags = names.flatMap((name) => candidates.get(name)!.tags).sort(compareTags);
      if (tags.length === 0) continue;
      // Before v4.7 the orchestrator stored no name and named the pool after its localeCompare-first member.
      const members = [...names].sort((a, b) => a.localeCompare(b));
      const stored = new Set(members.flatMap((name) => [...candidates.get(name)!.storedPoolNames]));
      if (members.length < 2) {
        const only = candidates.get(members[0])!;
        orphanPoolTags.push({
          shareScope,
          packageName: members[0],
          sharedExternalId: only.ids[0],
          tags,
        });
        continue;
      }
      tagPools.push({
        id: tagPoolId(shareScope, members[0]),
        name: stored.size === 1 ? [...stored][0] : members[0],
        shareScope,
        members: [...members].sort(compareText),
        sharedExternalIds: members.flatMap((name) => candidates.get(name)!.ids).sort(compareText),
        tags,
        remotes: [...new Set(members.flatMap((name) => [...candidates.get(name)!.remotes]))].sort(
          compareText,
        ),
      });
    }
  }

  return {
    tagPools: tagPools.sort((a, b) => compareText(a.id, b.id)),
    orphanPoolTags: orphanPoolTags.sort(
      (a, b) =>
        compareText(a.shareScope, b.shareScope) || compareText(a.packageName, b.packageName),
    ),
  };
}

export function deriveCopyGroupingFacets(
  evidence: CanonicalRegistryEvidence,
  copies: readonly ResolvedDependencyCopy[],
  bundleClaims: readonly BundleClaim[],
  tagPools: readonly TagPool[],
): CopyGroupingFacets[] {
  const externalById = new Map(evidence.sharedExternals.map((e) => [e.id, e]));
  const registrationById = new Map(evidence.versionRegistrations.map((r) => [r.id, r]));
  const declarationById = new Map(evidence.participantDeclarations.map((d) => [d.id, d]));
  const poolByExternal = new Map<SharedExternalId, TagPoolId>();
  for (const pool of tagPools)
    for (const id of pool.sharedExternalIds) poolByExternal.set(id, pool.id);
  const buildsByCopy = new Map<string, Map<string, CopyBuild>>();
  for (const claim of bundleClaims) {
    const builds = buildsByCopy.get(claim.copyId) ?? new Map<string, CopyBuild>();
    buildsByCopy.set(claim.copyId, builds);
    builds.set(JSON.stringify([claim.sourceRemote, claim.bundle]), {
      remote: claim.sourceRemote,
      bundle: claim.bundle,
    });
  }

  return copies.map((copy) => {
    const registrationIds =
      copy.source.kind === 'shared-declaration'
        ? [declarationById.get(copy.source.declarationId)!.versionRegistrationId]
        : copy.source.kind === 'private-registration'
          ? []
          : copy.sourceRegistrationRefs.flatMap((ref) => (ref.kind === 'shared' ? [ref.id] : []));
    const externalIds = [
      ...new Set(registrationIds.map((id) => registrationById.get(id)!.sharedExternalId)),
    ];
    const scopes = [...new Set(externalIds.map((id) => externalById.get(id)!.shareScope))];
    return {
      copyId: copy.id,
      shareScope: scopes.length === 1 ? scopes[0] : null,
      tagPoolId: externalIds.length === 1 ? (poolByExternal.get(externalIds[0]) ?? null) : null,
      builds: [...(buildsByCopy.get(copy.id)?.values() ?? [])].sort(
        (a, b) => compareText(a.remote ?? '', b.remote ?? '') || compareText(a.bundle, b.bundle),
      ),
    };
  });
}

function tagPoolId(shareScope: string, name: string): TagPoolId {
  return registryEvidenceId('tag-pool', [shareScope, name], 0);
}

// `pool-graph.ts` `owningPackage`: an npm name carries at most one `/` after an optional `@scope`.
export function owningPackage(name: string): string | undefined {
  const depth = name.startsWith('@') ? 2 : 1;
  let cut = -1;
  for (let seen = 0; seen < depth; seen++) {
    cut = name.indexOf('/', cut + 1);
    if (cut === -1) return undefined;
  }
  return name.slice(0, cut);
}

class UnionFind {
  private readonly parent = new Map<string, string>();

  add(key: string): void {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    this.add(key);
    let root = key;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    this.parent.set(key, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}

function compareTags(a: PoolTagDeclaration, b: PoolTagDeclaration): number {
  return (
    compareText(a.remote, b.remote) ||
    compareText(a.tag, b.tag) ||
    compareText(a.packageName, b.packageName)
  );
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
