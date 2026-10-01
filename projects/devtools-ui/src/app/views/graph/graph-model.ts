import type {
  BundleClaim,
  CanonicalResolutionProjection,
  ChunkGroupProjection,
  CopyGroupingFacets,
  ResolvedDependencyCopy,
} from '../../shared/store/resolution';
import {
  copySourceRemote,
  countClaim,
  packageId,
  participantDisplay,
} from '../../shared/view-conventions';
import {
  columnX,
  compareStrings,
  dependencyClusterOf,
  dependencyLabelOf,
  dependencyNodeAt,
  edgeOf,
  edgePath,
  nodeBaseAt,
  nodeKeyOf,
  remoteNodeAt,
  remoteOrder,
  stubQualifierOf,
  stubTooltipOf,
} from './graph-element-factories';
import { groupDependencies } from './graph-grouping';
import {
  BundleEdgeRef,
  CLUSTER_HEADER,
  CLUSTER_LABEL_BASELINE,
  CLUSTER_PAD,
  CLUSTER_VGAP,
  ChunkGraphNode,
  DependencyGraphNode,
  GraphBuildOptions,
  GraphCluster,
  GraphEdge,
  GraphModel,
  GraphNode,
  HEADER_BASELINE,
  HEADER_H,
  GraphListItem,
  HONEST_BUCKETS,
  HonestBucket,
  LABEL_PAD,
  LIST_ROW_H,
  MARGIN,
  MAX_BUNDLE_EDGES,
  NODE_H,
  NODE_VGAP,
  NODE_W,
  QUALIFIER_BASELINE,
  RemoteGraphNode,
  STUB_NODE_H,
} from './graph-types';

/**
 * Pure graph model over the canonical resolution projection: three columns
 * (remotes, resolved dependency copies clustered by their evidenced source,
 * claimed chunk files clustered by emitter · bundle), one consume edge per
 * `ConsumerCopyRelation`, and precomputed `dependency → chunk` references
 * for the hover trace. The builder computes all geometry; the renderer draws
 * primitives only. Identical inputs produce a deeply equal model. Every
 * rendered identity chains to canonical IDs (remote name, copy ID, relation
 * ID, bundle-claim ID, chunk-group ID + recorded file), and nothing here
 * claims delivery — an edge proves what the captured map resolves, never
 * that anything was requested or executed. The model shapes and layout
 * constants live in `graph-types`, the element-level rules and constructors
 * in `graph-element-factories`.
 */

interface ClusterSeed {
  key: string;
  label: string;
  tooltip: string | null;
  poolId?: string | null;
  /** Hue owner; null renders neutral (host, honest buckets, no emitter). */
  hueRemote: string | null;
}

/** Node blueprint of the chunks column before geometry is assigned. */
type ChunkNodeSeed =
  | { kind: 'file'; id: string; label: string; href: string | null; tooltip: string | null }
  | { kind: 'stub'; id: string; label: string; qualifier: string; tooltip: string };

export function buildGraphModel(
  projection: CanonicalResolutionProjection,
  options: GraphBuildOptions = {},
): GraphModel {
  const participantColors = options.participantColors ?? new Map<string, number>();
  const hostNames = new Set(
    projection.remotes.filter((remote) => remote.isHost).map((remote) => remote.name),
  );
  const clusterHueOf = (owner: string | null): number | null =>
    owner === null || hostNames.has(owner) ? null : (participantColors.get(owner) ?? null);
  // Cluster names follow the chip convention (`host`, verbatim otherwise) —
  // the same display form the remote node carries.
  const remoteClusterDisplay = (name: string): string => participantDisplay(name);

  const remoteNodes = [...projection.remotes]
    .sort(remoteOrder)
    .map((remote, row) => remoteNodeAt(remote, row));

  // --- Consumer filter (OR over a copy's consume relations) --------------
  // The remote column is never filtered, and the honesty surfaces below
  // (`droppedRelationIds`, `completeness`) stay selection-independent.
  const selectedRemotes = options.selectedRemotes ?? new Set<string>();
  const filtering = selectedRemotes.size > 0;
  const excluding = options.filterMode === 'exclude';
  const consumerShown = (name: string): boolean =>
    !filtering || selectedRemotes.has(name) !== excluding;
  const consumersByCopyId = new Map<string, Set<string>>();
  for (const relation of projection.consumerRelations) {
    const consumers = consumersByCopyId.get(relation.copyId) ?? new Set<string>();
    consumers.add(relation.consumerRemote);
    consumersByCopyId.set(relation.copyId, consumers);
  }
  const copyKept = (copyId: string): boolean =>
    !filtering || [...(consumersByCopyId.get(copyId) ?? [])].some(consumerShown);

  // --- Dependency clustering by evidenced source -------------------------
  const sortedCopies = projection.copies
    .filter((copy) => copyKept(copy.id))
    .map((copy) => ({ copy, fullLabel: dependencyLabelOf(copy) }))
    .sort(
      (a, b) => compareStrings(a.fullLabel, b.fullLabel) || compareStrings(a.copy.id, b.copy.id),
    );

  const sourceClusterEntries = new Map<string, typeof sortedCopies>();
  const bucketClusterEntries = new Map<HonestBucket, typeof sortedCopies>();
  for (const entry of sortedCopies) {
    const cluster = dependencyClusterOf(entry.copy);
    if (cluster.kind === 'source') {
      sourceClusterEntries.set(cluster.remote, [
        ...(sourceClusterEntries.get(cluster.remote) ?? []),
        entry,
      ]);
    } else {
      bucketClusterEntries.set(cluster.bucket, [
        ...(bucketClusterEntries.get(cluster.bucket) ?? []),
        entry,
      ]);
    }
  }

  // Host first, other source remotes alphabetical, honest buckets last.
  const sourceClusterNames = [...sourceClusterEntries.keys()].sort((a, b) => {
    const aHost = hostNames.has(a);
    const bHost = hostNames.has(b);
    if (aHost !== bHost) {
      return aHost ? -1 : 1;
    }
    return compareStrings(a, b);
  });

  const clusters: GraphCluster[] = [];
  const dependencyNodes: DependencyGraphNode[] = [];
  const orderedDependencyEntries: typeof sortedCopies = [];
  /** Cluster hue of each copy — a revealed bundle edge inherits it. */
  const dependencyHueByCopyId = new Map<string, number | null>();
  let dependencyCursor = MARGIN + HEADER_H;

  const listItems: GraphListItem[] = [];
  const facetsByCopyId = new Map(projection.copyGroupingFacets.map((f) => [f.copyId, f]));
  const expandedCopyId = options.expandedCopyId ?? null;
  const layoutDependencyCluster = (seed: ClusterSeed, entries: typeof sortedCopies): void => {
    const colorIndex = clusterHueOf(seed.hueRemote);
    const boxY = dependencyCursor;
    let nodeY = boxY + CLUSTER_HEADER + CLUSTER_PAD;
    for (const entry of entries) {
      const expanded = entry.copy.id === expandedCopyId;
      const node = { ...dependencyNodeAt(entry.copy, entry.fullLabel, nodeY), expanded };
      dependencyNodes.push(node);
      orderedDependencyEntries.push(entry);
      dependencyHueByCopyId.set(entry.copy.id, colorIndex);
      nodeY += NODE_H + NODE_VGAP;
      if (expanded) {
        const rows = secondaryEntrypointsOf(entry.copy, entry.fullLabel, projection.copies);
        const packageSelect = packageSelectOf(entry.copy, facetsByCopyId.get(entry.copy.id));
        if (packageSelect !== null) {
          rows.push({ text: 'see usage details', tooltip: 'open in Packages', packageSelect });
        }
        rows.forEach((row, index) => {
          const y = nodeY + index * LIST_ROW_H + LIST_ROW_H - 4;
          listItems.push({
            key: `${node.key}\n${row.text}`,
            ownerKey: node.key,
            ...row,
            x: node.x + 2 * LABEL_PAD,
            y,
          });
        });
        nodeY += rows.length * LIST_ROW_H + NODE_VGAP;
      }
    }
    const boxHeight = nodeY - NODE_VGAP - boxY + CLUSTER_PAD;
    const boxX = columnX(1) - CLUSTER_PAD;
    clusters.push({
      key: seed.key,
      column: 'dependencies',
      label: seed.label,
      tooltip: seed.tooltip,
      poolId: seed.poolId ?? null,
      nodeKeys: entries.map((entry) => nodeKeyOf('dependency', entry.copy.id)),
      expanded: null,
      count: entries.length,
      colorIndex,
      x: boxX,
      y: boxY,
      width: NODE_W + 2 * CLUSTER_PAD,
      height: boxHeight,
      labelX: boxX + CLUSTER_PAD,
      labelY: boxY + CLUSTER_LABEL_BASELINE,
    });
    dependencyCursor = boxY + boxHeight + CLUSTER_VGAP;
  };

  const groupBy = options.groupBy ?? 'provider';
  if (groupBy === 'provider') {
    for (const name of sourceClusterNames) {
      layoutDependencyCluster(
        {
          key: `dependencies:source:${name}`,
          label: remoteClusterDisplay(name),
          tooltip: null,
          hueRemote: name,
        },
        sourceClusterEntries.get(name)!,
      );
    }
    for (const bucket of HONEST_BUCKETS) {
      const entries = bucketClusterEntries.get(bucket);
      if (entries !== undefined) {
        layoutDependencyCluster(
          { key: `dependencies:bucket:${bucket}`, label: bucket, tooltip: null, hueRemote: null },
          entries,
        );
      }
    }
  } else {
    for (const group of groupDependencies(groupBy, sortedCopies, projection)) {
      layoutDependencyCluster(group, group.entries);
    }
  }

  // Kind-separated lookups: a remote name may textually equal a copy ID, and
  // an edge source must always resolve to a remote, a target to a copy.
  const remoteNodeByName = new Map<string, RemoteGraphNode>(
    remoteNodes.map((node) => [node.id, node]),
  );
  const dependencyNodeById = new Map<string, DependencyGraphNode>(
    dependencyNodes.map((node) => [node.id, node]),
  );

  // --- Build-files column: each copy's entry files and its bundle's chunks
  // Entry files are the copy's mapped entrypoint targets; chunk files come
  // only from the copy's attached bundle claims (the selected source path),
  // so pseudo/`mapping-or-exposed` groups are excluded structurally. Both
  // share the `remote · bundle` cluster of the build that emitted them.
  // Chunk files are recorded relative to the emitter's scope, as the orchestrator resolves them.
  const scopeUrlByRemote = new Map(
    projection.remotes.map((remote) => [remote.name, remote.resolvedScopeUrl]),
  );
  const fileHref = (emitter: string, file: string): string | null => {
    const scope = scopeUrlByRemote.get(emitter);
    if (scope === undefined) {
      return null;
    }
    try {
      return new URL(file, scope).href;
    } catch {
      return null;
    }
  };
  const claimById = new Map<string, BundleClaim>(
    projection.bundleClaims.map((claim) => [claim.id, claim]),
  );
  const groupById = new Map<string, ChunkGroupProjection>(
    projection.chunkGroups.map((group) => [group.id, group]),
  );

  interface ChunkClusterCollector {
    emitter: string | null;
    bundle: string | null;
    seeds: ChunkNodeSeed[];
  }
  const chunkClusterByKey = new Map<string, ChunkClusterCollector>();
  const seenChunkNodeIds = new Set<string>();
  const refPairs: { copyId: string; chunkNodeId: string }[] = [];
  const seenRefPairs = new Set<string>();

  const collectChunkNode = (
    emitter: string | null,
    bundle: string | null,
    seed: ChunkNodeSeed,
    copyId: string,
  ): void => {
    const clusterKey = `chunks:${JSON.stringify([emitter, bundle])}`;
    if (!seenChunkNodeIds.has(seed.id)) {
      seenChunkNodeIds.add(seed.id);
      const collector = chunkClusterByKey.get(clusterKey) ?? { emitter, bundle, seeds: [] };
      collector.seeds.push(seed);
      chunkClusterByKey.set(clusterKey, collector);
    }
    const refKey = `${copyId}\n${seed.id}`;
    if (!seenRefPairs.has(refKey)) {
      seenRefPairs.add(refKey);
      refPairs.push({ copyId, chunkNodeId: seed.id });
    }
  };

  for (const { copy } of orderedDependencyEntries) {
    const claims = copy.bundleClaimIds
      .map((claimId) => claimById.get(claimId))
      .filter((claim): claim is BundleClaim => claim !== undefined);
    const bundles = [
      ...new Set(claims.filter((c) => c.status !== 'ambiguous').map((c) => c.bundle)),
    ];
    const entryBuild = {
      emitter: copySourceRemote(copy),
      bundle: bundles.length === 1 ? bundles[0] : null,
    };
    for (const specifier of Object.keys(copy.entrypoints).sort(compareStrings)) {
      const target = copy.entrypoints[specifier];
      collectChunkNode(
        entryBuild.emitter,
        entryBuild.bundle,
        {
          kind: 'file',
          id: `entry\n${target}`,
          label: fileNameOf(target),
          href: target,
          tooltip: `entry file of ${specifier}`,
        },
        copy.id,
      );
    }
    for (const claim of claims) {
      if (claim.status === 'mapped-source') {
        for (const groupId of claim.chunkGroupIds) {
          const group = groupById.get(groupId);
          if (group === undefined) {
            continue;
          }
          for (const file of group.files) {
            collectChunkNode(
              group.emitterRemote,
              group.bundleName ?? claim.bundle,
              // The pair (chunk group, recorded file) is the node identity;
              // equal filenames from different emitters stay distinct.
              {
                kind: 'file',
                id: `${group.id}\n${file}`,
                label: file,
                href: fileHref(group.emitterRemote, file),
                tooltip: null,
              },
              copy.id,
            );
          }
        }
      } else if (
        claim.status === 'ambiguous' ||
        Object.keys(copy.entrypoints).length === 0 ||
        claim.sourceRemote !== entryBuild.emitter ||
        claim.bundle !== entryBuild.bundle
      ) {
        // A source-only bundle whose entry file already sits in its cluster needs no stub.
        collectChunkNode(
          claim.sourceRemote,
          claim.bundle,
          {
            kind: 'stub',
            id: claim.id,
            label: claim.bundle,
            qualifier: stubQualifierOf(claim),
            tooltip: stubTooltipOf(claim),
          },
          copy.id,
        );
      }
    }
  }

  // Host-emitter clusters first, then alphabetical by emitter and bundle;
  // an emitter-less cluster (no evidenced source remote on the claim) last.
  const orderedChunkClusters = [...chunkClusterByKey.entries()].sort(([, a], [, b]) => {
    const aHost = a.emitter !== null && hostNames.has(a.emitter);
    const bHost = b.emitter !== null && hostNames.has(b.emitter);
    if (aHost !== bHost) {
      return aHost ? -1 : 1;
    }
    if ((a.emitter === null) !== (b.emitter === null)) {
      return a.emitter === null ? 1 : -1;
    }
    return (
      compareStrings(a.emitter ?? '', b.emitter ?? '') ||
      compareStrings(a.bundle ?? '', b.bundle ?? '')
    );
  });

  const chunkNodes: ChunkGraphNode[] = [];
  const chunkNodeById = new Map<string, ChunkGraphNode>();
  /** Seed ID → rendered node ID: a collapsed cluster's files resolve to its summary node. */
  const renderedChunkId = new Map<string, string>();
  const expandedBuildKey =
    options.expandedBuildKey === undefined ? 'all' : options.expandedBuildKey;
  let chunkCursor = MARGIN + HEADER_H;
  for (const [clusterKey, collector] of orderedChunkClusters) {
    const boxY = chunkCursor;
    let nodeY = boxY + CLUSTER_HEADER + CLUSTER_PAD;
    const x = columnX(2);
    // A single-file group shows its file directly: there is nothing to expand.
    const collapsible = collector.seeds.length > 1;
    const expanded = !collapsible || expandedBuildKey === 'all' || expandedBuildKey === clusterKey;
    if (!expanded) {
      const id = `summary\n${clusterKey}`;
      const node: ChunkGraphNode = {
        ...nodeBaseAt('chunk', id, countClaim(collector.seeds.length, 'file'), x, nodeY),
        labelTooltip: 'click the group to list its files',
        kind: 'chunk',
        href: null,
        summary: true,
        clusterKey,
        qualifier: null,
        qualifierX: x + LABEL_PAD,
        qualifierY: nodeY + QUALIFIER_BASELINE,
      };
      chunkNodes.push(node);
      chunkNodeById.set(id, node);
      for (const seed of collector.seeds) renderedChunkId.set(seed.id, id);
      nodeY += NODE_H + NODE_VGAP;
    }
    for (const seed of expanded ? collector.seeds : []) {
      const height = seed.kind === 'stub' ? STUB_NODE_H : NODE_H;
      const base = nodeBaseAt('chunk', seed.id, seed.label, x, nodeY);
      const node: ChunkGraphNode = {
        ...base,
        labelTooltip: seed.tooltip ?? base.labelTooltip,
        kind: 'chunk',
        height,
        href: seed.kind === 'file' ? seed.href : null,
        summary: false,
        clusterKey,
        qualifier: seed.kind === 'stub' ? seed.qualifier : null,
        qualifierX: x + LABEL_PAD,
        qualifierY: nodeY + QUALIFIER_BASELINE,
      };
      chunkNodes.push(node);
      chunkNodeById.set(node.id, node);
      renderedChunkId.set(seed.id, node.id);
      nodeY += height + NODE_VGAP;
    }
    const boxHeight = nodeY - NODE_VGAP - boxY + CLUSTER_PAD;
    const boxX = x - CLUSTER_PAD;
    const emitter = collector.emitter === null ? null : remoteClusterDisplay(collector.emitter);
    const label =
      emitter === null
        ? (collector.bundle ?? '(no evidenced source)')
        : collector.bundle === null
          ? emitter
          : `${emitter} · ${collector.bundle}`;
    clusters.push({
      key: clusterKey,
      column: 'chunks',
      label,
      tooltip: null,
      poolId: null,
      nodeKeys: [
        ...new Set(
          collector.seeds.map((seed) => nodeKeyOf('chunk', renderedChunkId.get(seed.id)!)),
        ),
      ],
      expanded: collapsible ? expanded : null,
      count: collector.seeds.length,
      colorIndex: clusterHueOf(collector.emitter),
      x: boxX,
      y: boxY,
      width: NODE_W + 2 * CLUSTER_PAD,
      height: boxHeight,
      labelX: boxX + CLUSTER_PAD,
      labelY: boxY + CLUSTER_LABEL_BASELINE,
    });
    chunkCursor = boxY + boxHeight + CLUSTER_VGAP;
  }

  // --- Consume edges -----------------------------------------------------
  // One edge per relation. A relation endpoint outside the projection's
  // remotes and copies cannot be drawn; such relations are reported via
  // `droppedRelationIds` — selection-independent, so an incomplete capture
  // reads the same in every filter state. A relation from an unselected
  // consumer is merely filtered, never "dropped". Nodes come only from the
  // projection's remotes and copies, never invented for an edge.
  const projectionCopyIds = new Set(projection.copies.map((copy) => copy.id));
  const edges: GraphEdge[] = [];
  const droppedRelationIds: string[] = [];
  for (const relation of projection.consumerRelations) {
    const source = remoteNodeByName.get(relation.consumerRemote);
    if (source === undefined || !projectionCopyIds.has(relation.copyId)) {
      droppedRelationIds.push(relation.id);
      continue;
    }
    if (!consumerShown(relation.consumerRemote)) {
      continue;
    }
    // A selected (or unfiltered) consumer's relation is exactly what keeps
    // its copy rendered, so the node lookup cannot miss.
    edges.push(edgeOf(relation, source, dependencyNodeById.get(relation.copyId)!));
  }

  // --- Bundle-edge references (rendered by the hover trace only) ---------
  const referenceCap = edges.length + MAX_BUNDLE_EDGES;
  const bundleEdgeRefs: BundleEdgeRef[] = [];
  // A collapsed group's files share one summary node: their references merge.
  const renderedPairs = [
    ...new Map(
      refPairs.map((pair) => {
        const chunkNodeId = renderedChunkId.get(pair.chunkNodeId)!;
        return [`${pair.copyId}\n${chunkNodeId}`, { copyId: pair.copyId, chunkNodeId }];
      }),
    ).values(),
  ];
  for (const pair of renderedPairs.slice(0, referenceCap)) {
    const dependency = dependencyNodeById.get(pair.copyId)!;
    const chunk = chunkNodeById.get(pair.chunkNodeId)!;
    bundleEdgeRefs.push({
      key: `${dependency.key}\n${chunk.key}`,
      dependencyKey: dependency.key,
      chunkKey: chunk.key,
      colorIndex: dependencyHueByCopyId.get(pair.copyId) ?? null,
      path: edgePath(
        dependency.x + dependency.width,
        dependency.y + dependency.height / 2,
        chunk.x,
        chunk.y + chunk.height / 2,
      ),
    });
  }
  const cappedEdges = Math.max(0, renderedPairs.length - referenceCap);

  // --- Canvas ------------------------------------------------------------
  const nodes: GraphNode[] = [...remoteNodes, ...dependencyNodes, ...chunkNodes];
  const remotesBottom =
    remoteNodes.length > 0
      ? MARGIN + HEADER_H + remoteNodes.length * (NODE_H + NODE_VGAP) - NODE_VGAP
      : MARGIN + HEADER_H;
  const dependenciesBottom =
    dependencyNodes.length > 0 ? dependencyCursor - CLUSTER_VGAP : MARGIN + HEADER_H;
  const chunksBottom = chunkNodes.length > 0 ? chunkCursor - CLUSTER_VGAP : MARGIN + HEADER_H;

  const completeness = projection.completeness.total;
  return {
    columns: [
      {
        key: 'remotes',
        label: 'Remotes',
        x: columnX(0),
        headerX: columnX(0),
        headerY: MARGIN + HEADER_BASELINE,
      },
      {
        key: 'dependencies',
        label: 'Dependencies',
        x: columnX(1),
        headerX: columnX(1),
        headerY: MARGIN + HEADER_BASELINE,
      },
      {
        key: 'chunks',
        label: 'Build files',
        x: columnX(2),
        headerX: columnX(2),
        headerY: MARGIN + HEADER_BASELINE,
      },
    ],
    clusters,
    nodes,
    listItems,
    edges,
    bundleEdgeRefs,
    cappedEdges,
    droppedRelationIds,
    completeness,
    divergent:
      completeness.unknownResolutions > 0 ||
      completeness.unmappedResolutions > 0 ||
      completeness.blockedResolutions > 0 ||
      completeness.ambiguousSourceClaims > 0,
    width: columnX(2) + NODE_W + CLUSTER_PAD + MARGIN,
    height: Math.max(remotesBottom, dependenciesBottom, chunksBottom) + MARGIN,
    empty: nodes.length === 0,
  };
}

/**
 * Undirected adjacency over ALL of the model's edges — consume edges and
 * bundle-edge references alike — keyed by node render keys. Derived once per
 * model; the hover trace is then a pure lookup: the hovered node plus its
 * neighbors keep full opacity, everything else dims. Undirected on purpose:
 * hovering a dependency lights both its consuming remotes and its chunks.
 */
export function graphAdjacencyOf(model: GraphModel): ReadonlyMap<string, ReadonlySet<string>> {
  const adjacency = new Map<string, Set<string>>();
  const neighborsOf = (key: string): Set<string> => {
    const existing = adjacency.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const created = new Set<string>();
    adjacency.set(key, created);
    return created;
  };
  const link = (a: string, b: string): void => {
    neighborsOf(a).add(b);
    neighborsOf(b).add(a);
  };
  for (const edge of model.edges) {
    link(nodeKeyOf('remote', edge.sourceId), nodeKeyOf('dependency', edge.targetId));
  }
  for (const ref of model.bundleEdgeRefs) {
    link(ref.dependencyKey, ref.chunkKey);
  }
  return adjacency;
}

/** Last path segment of a target URL — the file name a build emitted. */
function fileNameOf(url: string): string {
  const path = url.split(/[?#]/)[0];
  return path.slice(path.lastIndexOf('/') + 1) || url;
}

/**
 * Rows of an expanded dependency: entrypoints of its own `entries` map beyond
 * the package itself (dense builds), then sibling copies registered under a
 * secondary name of the package by the same source (flat builds; the
 * name-derived parent rule of Packages).
 */
function secondaryEntrypointsOf(
  copy: ResolvedDependencyCopy,
  label: string,
  copies: readonly ResolvedDependencyCopy[],
): Pick<GraphListItem, 'text' | 'tooltip' | 'packageSelect'>[] {
  const rows = new Map<string, Pick<GraphListItem, 'text' | 'tooltip' | 'packageSelect'>>();
  for (const specifier of Object.keys(copy.entrypoints).sort(compareStrings)) {
    if (specifier !== label) {
      rows.set(specifier, {
        text: specifier,
        tooltip: "secondary entrypoint in this copy's entries map",
        packageSelect: null,
      });
    }
  }
  const source = copySourceRemote(copy);
  for (const other of [...copies].sort((a, b) => compareStrings(a.id, b.id))) {
    const name = other.sourcePackage;
    if (
      other.id !== copy.id &&
      name !== null &&
      name.startsWith(`${label}/`) &&
      !rows.has(name) &&
      copySourceRemote(other) === source
    ) {
      rows.set(name, {
        text: name,
        tooltip: 'secondary entrypoint registered as its own copy (name-derived parent)',
        packageSelect: null,
      });
    }
  }
  return rows.size > 0
    ? [...rows.values()].sort((a, b) => compareStrings(a.text, b.text))
    : [{ text: 'no secondary entrypoints', tooltip: null, packageSelect: null }];
}

// Mirrors the Packages view's copyGroupIds: private sources have no Packages row.
function packageSelectOf(
  copy: ResolvedDependencyCopy,
  facets: CopyGroupingFacets | undefined,
): string | null {
  if (copy.source.kind === 'private-registration') {
    return null;
  }
  if (copy.source.kind === 'shared-declaration') {
    const scope = facets?.shareScope ?? null;
    return scope === null || copy.sourcePackage === null
      ? null
      : packageId(scope, copy.sourcePackage);
  }
  for (const { resolutionDomain, consumerRegistryPackage } of copy.resolutionContexts) {
    if (resolutionDomain.kind === 'share-scope') {
      return packageId(resolutionDomain.name, consumerRegistryPackage);
    }
  }
  return null;
}
