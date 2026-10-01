/**
 * Graph builder specs — DOM-free pins over the pure `buildGraphModel`
 * derivation: node derivation and ordering, the dependency label fallback
 * chain, truncation, edge styles from relation mapping states (including the
 * vacuously solid claim-less relation), the fixed-column geometry, and
 * determinism. Fixture cases run through the real ingest pipeline; synthetic
 * seeds pin the rules the corpus does not reach.
 */
import { FIXTURES, FixtureId } from 'devtools-bridge';

import {
  PARTICIPANT_PALETTE_SIZE,
  assignParticipantColors,
} from '../../shared/kit/participant-colors';
import { ingestSnapshot } from '../../shared/store/ingest';
import type {
  BundleClaim,
  BundleClaimId,
  BundleClaimStatus,
  CanonicalResolutionProjection,
  ChunkGroupId,
  ChunkGroupProjection,
  ClaimMappingState,
  ConsumerCopyRelation,
  ConsumerCopyRelationId,
  ObservedTargetProvider,
  RemoteProjection,
  ResolvedDependencyCopy,
  ResolvedDependencyCopyId,
} from '../../shared/store/resolution';
import { buildPackagesVm } from '../packages/packages-view-model';
import { buildGraphModel, graphAdjacencyOf } from './graph-model';
import {
  CLUSTER_HEADER,
  CLUSTER_PAD,
  COL_GAP,
  ChunkGraphNode,
  DependencyGraphNode,
  GraphModel,
  HEADER_H,
  LABEL_MAX,
  LIST_ROW_H,
  MARGIN,
  MAX_BUNDLE_EDGES,
  NODE_H,
  NODE_VGAP,
  NODE_W,
  RemoteGraphNode,
  SUB_LABEL_MAX,
} from './graph-types';

function projectionOf(fixtureId: FixtureId): CanonicalResolutionProjection {
  return ingestSnapshot(structuredClone(FIXTURES[fixtureId])).resolutionProjection;
}

function modelOf(fixtureId: FixtureId): GraphModel {
  return buildGraphModel(projectionOf(fixtureId));
}

/** Union-narrowing selectors over the node list. */
function remoteNodesOf(model: GraphModel): RemoteGraphNode[] {
  return model.nodes.filter((node): node is RemoteGraphNode => node.kind === 'remote');
}

function dependencyNodesOf(model: GraphModel): DependencyGraphNode[] {
  return model.nodes.filter((node): node is DependencyGraphNode => node.kind === 'dependency');
}

function chunkNodesOf(model: GraphModel): ChunkGraphNode[] {
  return model.nodes.filter((node): node is ChunkGraphNode => node.kind === 'chunk');
}

function clusterLabelsOf(model: GraphModel, column: 'dependencies' | 'chunks'): [string, number][] {
  return model.clusters.filter((c) => c.column === column).map((c) => [c.label, c.count]);
}

/** Synthetic seed helpers — minimal canonical shapes with branded-ID casts. */
function remoteOf(name: string, isHost = false): RemoteProjection {
  return { name, isHost, scopeUrl: `./${name}/`, resolvedScopeUrl: `https://page.test/${name}/` };
}

function copyOf(
  id: string,
  partial: Partial<
    Pick<
      ResolvedDependencyCopy,
      | 'sourcePackage'
      | 'resolvedTag'
      | 'source'
      | 'sourceDisposition'
      | 'resolutionContexts'
      | 'entrypoints'
      | 'observedTargetProviders'
      | 'bundleClaimIds'
    >
  > = {},
): ResolvedDependencyCopy {
  return {
    id: id as ResolvedDependencyCopyId,
    sourcePackage: null,
    resolvedTag: null,
    source: { kind: 'target-url', targetUrl: 'https://cdn.test/mod.js' },
    sourceDisposition: 'target-only',
    effectiveRoles: ['unclassified'],
    sourceActions: [],
    entrypoints: {},
    effectiveResolutionIds: [],
    resolutionContexts: [],
    sourceRegistrationRefs: [],
    observedTargetProviders: [],
    registryServingSlotClaims: [],
    bundleClaimIds: [],
    provenance: { evidence: [] },
    ...partial,
  };
}

function relationOf(
  consumerRemote: string,
  copyId: string,
  mappingStates: ClaimMappingState[],
): ConsumerCopyRelation {
  return {
    id: `consumer-copy-relation:[${consumerRemote},${copyId}]` as ConsumerCopyRelationId,
    consumerRemote,
    copyId: copyId as ResolvedDependencyCopyId,
    effectiveResolutionIds: [],
    claimIds: [],
    mappingStates,
  };
}

function observedProviderOf(
  remote: string | null,
  outcome: ObservedTargetProvider['outcome'],
): ObservedTargetProvider {
  return {
    id: `observed:${remote}` as ObservedTargetProvider['id'],
    resolutionId: 'resolution-1' as ObservedTargetProvider['resolutionId'],
    remote,
    outcome,
    rule: 'scope-prefix-match',
    provenance: { evidence: [] },
  };
}

function chunkGroupOf(
  id: string,
  emitterRemote: string,
  bundleName: string,
  files: string[],
): ChunkGroupProjection {
  return {
    id: id as ChunkGroupId,
    emitterRemote,
    origin: 'shared-chunks',
    bundleName,
    pseudoPackage: null,
    files,
    provenance: { evidence: [] },
  };
}

function bundleClaimOf(
  id: string,
  copyId: string,
  status: BundleClaimStatus,
  sourceRemote: string | null,
  bundle: string,
  chunkGroupIds: string[] = [],
): BundleClaim {
  return {
    id: id as BundleClaimId,
    copyId: copyId as ResolvedDependencyCopyId,
    source: null,
    sourceRemote,
    bundle,
    chunkGroupIds: chunkGroupIds as ChunkGroupId[],
    status,
    provenance: { evidence: [] },
  };
}

function syntheticProjection(
  partial: Partial<
    Pick<
      CanonicalResolutionProjection,
      'remotes' | 'copies' | 'consumerRelations' | 'chunkGroups' | 'bundleClaims'
    >
  >,
): CanonicalResolutionProjection {
  return {
    remotes: [],
    copies: [],
    consumerRelations: [],
    chunkGroups: [],
    bundleClaims: [],
    declarationResolutionClaims: [],
    registryServingSlotClaims: [],
    observedTargetProviders: [],
    sourceComparisons: [],
    packageMeasures: [],
    tagPools: [],
    orphanPoolTags: [],
    poolFamilies: [],
    copyGroupingFacets: [],
    packageScopeVerdicts: [],
    completeness: {
      total: {
        unknownResolutions: 0,
        unmappedResolutions: 0,
        blockedResolutions: 0,
        ambiguousSourceClaims: 0,
      },
      byConsumer: {},
      consumerIssues: [],
    },
    ...partial,
  };
}

describe('buildGraphModel', () => {
  // T1-AC-04: identical projection input produces a deeply equal model.
  it('is deterministic: two independent ingests produce a deeply equal model', () => {
    expect(modelOf('co-declared-share')).toEqual(modelOf('co-declared-share'));
    expect(modelOf('frankenstein-live')).toEqual(modelOf('frankenstein-live'));
  });

  // T1-AC-01 (model level): one dependency node, mfe1 solid, mfe2 dotted
  // with `not-selected`, resolved tag as right-aligned sub-label.
  it('renders co-declared-share as one copy with a solid and a dotted consume edge', () => {
    const projection = projectionOf('co-declared-share');
    const model = buildGraphModel(projection);

    expect(remoteNodesOf(model).map((n) => n.id)).toEqual(['__NF-HOST__', 'mfe1', 'mfe2']);
    const dependencies = dependencyNodesOf(model);
    expect(dependencies.length).toBe(1);
    expect(dependencies[0].id).toBe(projection.copies[0].id);
    expect(dependencies[0].label).toBe('@nf-lab/conflict-lib');
    expect(dependencies[0].subLabel).toBe('1.0.0');
    expect(dependencies[0].isolated).toBe(false);

    expect(model.edges.length).toBe(2);
    const bySource = new Map(model.edges.map((e) => [e.sourceId, e]));
    expect(bySource.get('mfe1')).toEqual(
      expect.objectContaining({ style: 'solid', tooltip: null }),
    );
    expect(bySource.get('mfe2')).toEqual(
      expect.objectContaining({ style: 'dotted', tooltip: 'not-selected' }),
    );
  });

  // T1-AC-02 (model level): one remote node per projection remote (host
  // first), one dependency node per copy, one edge per relation — all keyed
  // by canonical IDs.
  it('maps frankenstein-live one-to-one onto canonical identities', () => {
    const projection = projectionOf('frankenstein-live');
    const model = buildGraphModel(projection);

    const remoteNodes = remoteNodesOf(model);
    expect(remoteNodes.map((n) => n.id)).toEqual(['__NF-HOST__', 'mermaid', 'whiteboard']);
    expect(remoteNodes[0].isHost).toBe(true);
    // Display mapping: the sentinel renders as `host`, the verbatim name
    // stays reachable as tooltip, the id stays canonical.
    expect(remoteNodes[0].label).toBe('host');
    expect(remoteNodes[0].labelTooltip).toBe('__NF-HOST__');
    expect(remoteNodes[1].labelTooltip).toBeNull();

    const dependencyIds = dependencyNodesOf(model).map((n) => n.id);
    expect(dependencyIds.length).toBe(projection.copies.length);
    expect(new Set(dependencyIds)).toEqual(new Set(projection.copies.map((c) => c.id)));

    expect(model.edges.map((e) => e.id).sort()).toEqual(
      projection.consumerRelations.map((r) => r.id).sort(),
    );
    expect(model.droppedRelationIds).toEqual([]);
    const nodeIds = new Set(model.nodes.map((n) => n.id));
    for (const edge of model.edges) {
      expect(nodeIds.has(edge.sourceId)).toBe(true);
      expect(nodeIds.has(edge.targetId)).toBe(true);
    }
  });

  // T1-AC-03 (model level): anchored relations render dotted with `anchored`
  // listed; since T2, cluster order (host first, then mfe1) precedes the
  // label/copy-ID order within a cluster.
  it('renders pooling-anchor anchored relations dotted and orders equal labels by copy ID', () => {
    const model = modelOf('pooling-anchor');

    const anchored = model.edges.filter((e) => e.tooltip === 'anchored');
    expect(anchored.length).toBe(2);
    expect(anchored.every((e) => e.style === 'dotted')).toBe(true);
    expect(anchored.map((e) => e.sourceId).sort()).toEqual(['mfe1', 'mfe2']);

    const dependencies = dependencyNodesOf(model);
    expect(dependencies.map((n) => [n.label, n.subLabel])).toEqual([
      ['@nf-lab/conflict-lib', '2.0.0'],
      ['@nf-lab/conflict-lib', '1.0.0'],
      ['@nf-lab/conflict-lib/extra', '1.0.0'],
    ]);
  });

  // T1-AC-03 (model level): private copies carry the isolated metadata.
  it('marks the scoped fixture private copies as isolated', () => {
    const model = modelOf('scoped');
    const dependencies = dependencyNodesOf(model);
    expect(dependencies.length).toBe(2);
    expect(dependencies.every((n) => n.isolated)).toBe(true);
  });

  it('marks only scope- and private-registration dispositions as isolated', () => {
    const model = buildGraphModel(
      syntheticProjection({
        copies: [
          copyOf('copy-share', { sourcePackage: 'a', sourceDisposition: 'share-registration' }),
          copyOf('copy-skip', { sourcePackage: 'b', sourceDisposition: 'skip-registration' }),
          copyOf('copy-scope', { sourcePackage: 'c', sourceDisposition: 'scope-registration' }),
          copyOf('copy-private', { sourcePackage: 'd', sourceDisposition: 'private-registration' }),
          copyOf('copy-url', { sourcePackage: 'e', sourceDisposition: 'target-only' }),
        ],
      }),
    );
    expect(dependencyNodesOf(model).map((n) => [n.label, n.isolated])).toEqual([
      ['a', false],
      ['b', false],
      ['c', true],
      ['d', true],
      ['e', false],
    ]);
  });

  it('labels dependencies by source package, else first context package, else first entrypoint URL', () => {
    const model = buildGraphModel(
      syntheticProjection({
        copies: [
          copyOf('copy-source', {
            sourcePackage: 'named-source',
            resolutionContexts: [
              {
                resolutionDomain: { kind: 'share-scope', name: '__GLOBAL__' },
                consumerRegistryPackage: 'aaa-context',
                claimIds: [],
              },
            ],
          }),
          copyOf('copy-context', {
            resolutionContexts: [
              {
                resolutionDomain: { kind: 'share-scope', name: '__GLOBAL__' },
                consumerRegistryPackage: 'zeta-pkg',
                claimIds: [],
              },
              {
                resolutionDomain: { kind: 'share-scope', name: '__GLOBAL__' },
                consumerRegistryPackage: 'alpha-pkg',
                claimIds: [],
              },
            ],
          }),
          copyOf('copy-url', {
            entrypoints: {
              'zeta-specifier': 'https://cdn.test/zeta.js',
              'alpha-specifier': 'https://cdn.test/alpha.js',
            },
          }),
        ],
      }),
    );
    expect(
      dependencyNodesOf(model)
        .map((n) => n.label)
        .sort(),
    ).toEqual(['alpha-pkg', 'https://cdn.test/alpha.js', 'named-source']);
  });

  // T1-AC-04: labels above the budget truncate with `…`, full text as tooltip.
  // Dependency nodes give two chars of LABEL_MAX (44) to the expand arrow → 41 + `…`.
  it('truncates long labels and keeps the full text as tooltip', () => {
    const long = '@nf-lab/a-very-long-package-name-that-overflows';
    const short = 'fits-within-the-limit';
    const model = buildGraphModel(
      syntheticProjection({
        copies: [
          copyOf('copy-long', { sourcePackage: long }),
          copyOf('copy-short', { sourcePackage: short }),
        ],
      }),
    );
    // Codepoint label sort puts `@nf-lab/…` before `fits-…`.
    const [truncated, fits] = model.nodes;
    expect(truncated.label).toBe(`${long.slice(0, LABEL_MAX - 3)}…`);
    expect(truncated.label.length).toBe(LABEL_MAX - 2);
    expect(truncated.labelTooltip).toBe(long);
    expect(fits.label).toBe(short);
    expect(fits.labelTooltip).toBeNull();
  });

  // T1 open issue closed here: a tagged dependency reserves the tag's
  // characters (plus a two-char gap) in its label budget, so a near-limit
  // label never runs under the right-aligned tag.
  it('reserves sub-label space when truncating a tagged dependency label', () => {
    const long = '@nf-lab/a-very-long-package-name-that-overflows';
    const model = buildGraphModel(
      syntheticProjection({
        copies: [copyOf('copy-tagged', { sourcePackage: long, resolvedTag: '21.2.12' })],
      }),
    );
    const [node] = dependencyNodesOf(model);
    // Budget = LABEL_MAX - 2 (arrow) - 7 (tag) - 2 (gap) = 33 → 32 chars + `…`.
    expect(node.label).toBe(`${long.slice(0, 32)}…`);
    expect(node.label.length).toBe(33);
    expect(node.labelTooltip).toBe(long);
    expect(node.subLabel).toBe('21.2.12');
    expect(node.subLabelTooltip).toBeNull();
  });

  // Codex review fix: the overlap invariant must hold for LONG tags too —
  // the displayed tag is bounded by SUB_LABEL_MAX (full tag as tooltip),
  // and the label budget derives from the DISPLAYED tag, so label + gap +
  // tag can never exceed the node's character budget.
  it('bounds a long resolved tag with a tooltip and keeps the label clear of it', () => {
    const tag = '1.2.3-canary.20260824.abc1234';
    const model = buildGraphModel(
      syntheticProjection({
        copies: [
          copyOf('copy-pre', {
            sourcePackage: '@nf-lab/a-very-long-package-name-that-overflows',
            resolvedTag: tag,
          }),
        ],
      }),
    );
    const [node] = dependencyNodesOf(model);
    expect(node.subLabel).toBe(`${tag.slice(0, SUB_LABEL_MAX - 1)}…`);
    expect(node.subLabel!.length).toBe(SUB_LABEL_MAX);
    expect(node.subLabelTooltip).toBe(tag);
    // Label budget from the displayed tag: 44 - 2 (arrow) - 16 - 2 = 24 chars.
    expect(node.label.length).toBe(24);
    expect(node.label.length + 2 + node.subLabel!.length + 2).toBeLessThanOrEqual(LABEL_MAX);
  });

  // A claim-less relation carries no deviation evidence: the all-own-selected
  // rule is vacuously true and the edge renders solid without a tooltip.
  it('renders a claim-less relation (empty mapping states) solid', () => {
    const model = buildGraphModel(
      syntheticProjection({
        remotes: [remoteOf('host', true)],
        copies: [copyOf('copy-1', { sourcePackage: 'pkg' })],
        consumerRelations: [relationOf('host', 'copy-1', [])],
      }),
    );
    expect(model.edges).toEqual([expect.objectContaining({ style: 'solid', tooltip: null })]);
  });

  it('lists all distinct mapping states verbatim on a mixed dotted edge', () => {
    const model = buildGraphModel(
      syntheticProjection({
        remotes: [remoteOf('host', true)],
        copies: [copyOf('copy-1', { sourcePackage: 'pkg' })],
        consumerRelations: [
          relationOf('host', 'copy-1', ['fallback', 'not-selected', 'own-selected']),
        ],
      }),
    );
    expect(model.edges[0].style).toBe('dotted');
    expect(model.edges[0].tooltip).toBe('fallback, not-selected, own-selected');
  });

  // Review regression: remote names are arbitrary capture strings — one that
  // textually equals a copy ID must not merge lookups, corrupt the edge, or
  // duplicate render keys.
  it('keeps a remote whose name equals a copy ID distinct from that copy', () => {
    const model = buildGraphModel(
      syntheticProjection({
        remotes: [remoteOf('copy-1', true)],
        copies: [copyOf('copy-1', { sourcePackage: 'pkg' })],
        consumerRelations: [relationOf('copy-1', 'copy-1', [])],
      }),
    );

    expect(model.nodes.map((n) => n.key)).toEqual(['remote:copy-1', 'dependency:copy-1']);
    expect(model.droppedRelationIds).toEqual([]);
    expect(model.edges.length).toBe(1);
    // The edge must anchor at the remote node (column 0), not the same-ID
    // copy: right-mid (364, 67) → left-mid inside the `unknown` cluster
    // (514, 54 + CLUSTER_HEADER + CLUSTER_PAD + 13 = 99), dx = max(24, 75).
    expect(model.edges[0].path).toBe('M 364,67 C 439,67 439,99 514,99');
  });

  // Review regression: a relation without a rendered endpoint is never a
  // silent omission — it is reported, and no node is invented for it.
  it('reports relations whose consumer remote has no rendered node', () => {
    const relation = relationOf('ghost', 'copy-1', ['own-selected']);
    const model = buildGraphModel(
      syntheticProjection({
        remotes: [remoteOf('host', true)],
        copies: [copyOf('copy-1', { sourcePackage: 'pkg' })],
        consumerRelations: [relation],
      }),
    );
    expect(model.edges).toEqual([]);
    expect(model.droppedRelationIds).toEqual([relation.id]);
    expect(model.nodes.length).toBe(2);
  });

  it('pins the three-column geometry, the cluster boxes, and the Bézier edge path', () => {
    const model = modelOf('co-declared-share');

    expect(model.columns.map((c) => [c.key, c.x])).toEqual([
      ['remotes', MARGIN],
      ['dependencies', MARGIN + NODE_W + COL_GAP],
      ['chunks', MARGIN + 2 * (NODE_W + COL_GAP)],
    ]);
    const remoteYs = remoteNodesOf(model).map((n) => n.y);
    const firstY = MARGIN + HEADER_H;
    expect(remoteYs).toEqual([
      firstY,
      firstY + NODE_H + NODE_VGAP,
      firstY + 2 * (NODE_H + NODE_VGAP),
    ]);

    // One dependency cluster (mfe1) with one node: the box encloses the
    // node with the header band and padding; the node sits inset in y only.
    const dependencyCluster = model.clusters.find((c) => c.column === 'dependencies');
    expect(dependencyCluster).toEqual(
      expect.objectContaining({
        label: 'mfe1',
        count: 1,
        x: MARGIN + NODE_W + COL_GAP - CLUSTER_PAD,
        y: firstY,
        width: NODE_W + 2 * CLUSTER_PAD,
        height: CLUSTER_HEADER + CLUSTER_PAD + NODE_H + CLUSTER_PAD,
      }),
    );
    const dependency = dependencyNodesOf(model)[0];
    expect(dependency.y).toBe(firstY + CLUSTER_HEADER + CLUSTER_PAD);

    expect(model.width).toBe(MARGIN + 2 * (NODE_W + COL_GAP) + NODE_W + CLUSTER_PAD + MARGIN);
    // Remotes column (3 flat rows) is the tallest of the three columns.
    expect(model.height).toBe(MARGIN + HEADER_H + 3 * (NODE_H + NODE_VGAP) - NODE_VGAP + MARGIN);

    // mfe1 (row 1, column 0) → the single copy (cluster row 0, column 1):
    // right-mid (364, 99) → left-mid (514, 86 + 13 = 99), dx = max(24, 75).
    const mfe1Edge = model.edges.find((e) => e.sourceId === 'mfe1');
    expect(mfe1Edge?.path).toBe('M 364,99 C 439,99 439,99 514,99');
  });

  // T1-AC-06 (model level): a projection with no nodes flags empty.
  it('flags an empty capture as nothing to graph', () => {
    const model = modelOf('synthetic-empty-page');
    expect(model.empty).toBe(true);
    expect(model.nodes).toEqual([]);
    expect(model.edges).toEqual([]);
  });

  it('keeps remotes without copies renderable (not empty)', () => {
    const model = modelOf('synthetic-multi-version');
    expect(model.empty).toBe(false);
    expect(model.nodes.every((n) => n.kind === 'remote')).toBe(true);
    expect(model.edges).toEqual([]);
  });

  // ---- Task 2: source clustering, chunk column, honest footer data ----

  // T2-AC-01 (model level): dependency clusters by evidenced source with
  // host first; cluster boxes enclose exactly their nodes.
  it('clusters frankenstein-live dependencies by evidenced source with host first', () => {
    const model = modelOf('frankenstein-live');
    expect(clusterLabelsOf(model, 'dependencies')).toEqual([
      ['host', 12],
      ['mermaid', 1],
      ['whiteboard', 7],
    ]);
    for (const cluster of model.clusters.filter((c) => c.column === 'dependencies')) {
      const enclosed = dependencyNodesOf(model).filter(
        (n) =>
          n.x >= cluster.x &&
          n.x + n.width <= cluster.x + cluster.width &&
          n.y >= cluster.y &&
          n.y + n.height <= cluster.y + cluster.height,
      );
      expect(enclosed.length).toBe(cluster.count);
    }
  });

  // T2-AC-01 (model level): the build-files column renders every build
  // under `emitter · bundle` heads — each copy's entry files plus its
  // bundle's chunk files; builds without bundle info head by remote only.
  it('derives frankenstein-live build-file clusters as emitter · bundle', () => {
    const model = modelOf('frankenstein-live');
    expect(clusterLabelsOf(model, 'chunks')).toEqual([
      ['host · browser-angular_common', 3],
      ['host · browser-angular_core', 11],
      ['host · browser-angular_platform_browser', 1],
      ['host · browser-rxjs', 3],
      ['host · browser-tslib', 1],
      ['mermaid', 1],
      ['whiteboard', 7],
    ]);
    const files = chunkNodesOf(model);
    expect(files.length).toBe(27);
    // The two former source-only stubs are covered by their entry files.
    expect(files.every((n) => n.qualifier === null && n.href !== null)).toBe(true);

    // The 36 chunk references minus the 2 replaced stubs, plus one entry
    // reference per entrypoint of the 20 copies = 54.
    expect(model.bundleEdgeRefs.length).toBe(54);
    expect(model.cappedEdges).toBe(0);
    const nodeKeys = new Set(model.nodes.map((n) => n.key));
    for (const ref of model.bundleEdgeRefs) {
      expect(nodeKeys.has(ref.dependencyKey)).toBe(true);
      expect(nodeKeys.has(ref.chunkKey)).toBe(true);
    }
  });

  // T2-AC-02: chunk evidence follows the selected source — the emitting
  // remote's cluster carries it, the borrowing consumer contributes nothing.
  it('clusters clean-skip chunk evidence under the emitting source remote only', () => {
    const projection = projectionOf('clean-skip');
    const model = buildGraphModel(projection);
    expect(clusterLabelsOf(model, 'dependencies')).toEqual([['mfe2', 1]]);
    expect(clusterLabelsOf(model, 'chunks')).toEqual([['mfe2 · browser-shared', 1]]);
    // Every consumer still relates to the copy through consume edges …
    expect(model.edges.length).toBe(projection.consumerRelations.length);
    // … but the build-files column holds only the emitter's file: the
    // source-only bundle needs no stub once its entry file is listed.
    expect(chunkNodesOf(model).map((n) => [n.label, n.qualifier, n.href])).toEqual([
      [
        '_nf_lab_conflict_lib.jvcc6K1csg.js',
        null,
        'http://localhost:4300/mfe2/_nf_lab_conflict_lib.jvcc6K1csg.js',
      ],
    ]);
  });

  // T2-AC-03 (model level): ambiguous claims keep their qualifier and
  // attribute no chunk files; the copy itself sits in its honest bucket.
  it('keeps ambiguous bundle claims qualified without attributing chunk files', () => {
    const model = buildGraphModel(
      syntheticProjection({
        copies: [
          copyOf('copy-amb', {
            sourcePackage: 'pkg',
            sourceDisposition: 'ambiguous-source',
            bundleClaimIds: ['claim-a', 'claim-b'] as BundleClaimId[],
          }),
        ],
        bundleClaims: [
          bundleClaimOf('claim-a', 'copy-amb', 'ambiguous', 'mfe1', 'browser-shared'),
          bundleClaimOf('claim-b', 'copy-amb', 'ambiguous', 'mfe2', 'browser-shared'),
        ],
      }),
    );
    expect(chunkNodesOf(model).map((n) => [n.label, n.qualifier])).toEqual([
      ['browser-shared', 'ambiguous — no unique source'],
      ['browser-shared', 'ambiguous — no unique source'],
    ]);
    expect(clusterLabelsOf(model, 'chunks')).toEqual([
      ['mfe1 · browser-shared', 1],
      ['mfe2 · browser-shared', 1],
    ]);
    expect(clusterLabelsOf(model, 'dependencies')).toEqual([['ambiguous source', 1]]);
  });

  // T2-AC-04: the honest buckets render named and pinned last — never
  // collapsed into one `(unresolved)` bucket. `zzz-remote` sorts after every
  // bucket name, so the order below proves pinning, not sorting.
  it('pins the honest buckets last and never collapses them', () => {
    const model = buildGraphModel(
      syntheticProjection({
        copies: [
          copyOf('copy-sourced', {
            sourcePackage: 'a-sourced',
            source: {
              kind: 'shared-declaration',
              declarationId: 'decl-1' as never,
              participant: 'zzz-remote',
            },
            sourceDisposition: 'share-registration',
          }),
          copyOf('copy-ambiguous', {
            sourcePackage: 'b-ambiguous',
            sourceDisposition: 'ambiguous-source',
          }),
          copyOf('copy-observed', {
            sourcePackage: 'c-observed',
            observedTargetProviders: [observedProviderOf('mfe1', 'scope-derived')],
          }),
          copyOf('copy-unknown', { sourcePackage: 'd-unknown' }),
        ],
      }),
    );
    const labels = clusterLabelsOf(model, 'dependencies').map(([label]) => label);
    expect(labels).toEqual(['zzz-remote', 'ambiguous source', 'target only', 'unknown']);
    expect(labels).not.toContain('(unresolved)');
  });

  // T2-AC-06 (model level): hues come from the injected app-wide
  // assignment; the host and the honest buckets stay neutral by rule.
  it('maps cluster hues through the injected assignment and keeps the host neutral', () => {
    const projection = projectionOf('pooling-anchor');
    const colors = new Map([
      ['__NF-HOST__', 1],
      ['mfe1', 2],
    ]);
    const model = buildGraphModel(projection, { participantColors: colors });
    const byLabel = new Map(model.clusters.map((c) => [c.label, c.colorIndex]));
    expect(byLabel.get('host')).toBeNull();
    expect(byLabel.get('mfe1')).toBe(2);
    expect(byLabel.get('host · browser-shared')).toBeNull();
    expect(byLabel.get('mfe1 · browser-shared')).toBe(2);
    // Identical inputs render identical hues.
    expect(buildGraphModel(projection, { participantColors: colors })).toEqual(model);
  });

  // T2-AC-06: above the palette size the app-wide assignment is empty —
  // every cluster renders neutral, no recycling code path exists.
  it('renders every cluster neutral above the palette size', () => {
    const names = Array.from({ length: PARTICIPANT_PALETTE_SIZE + 1 }, (_, i) => `remote-${i}`);
    const overflow = assignParticipantColors(names);
    expect(overflow.size).toBe(0);
    const model = buildGraphModel(projectionOf('pooling-anchor'), {
      participantColors: overflow,
    });
    expect(model.clusters.every((c) => c.colorIndex === null)).toBe(true);
  });

  it('keeps honest buckets neutral even when the lookup names them', () => {
    const model = buildGraphModel(
      syntheticProjection({ copies: [copyOf('copy-u', { sourcePackage: 'pkg' })] }),
      { participantColors: new Map([['unknown', 4]]) },
    );
    expect(model.clusters.map((c) => [c.label, c.colorIndex])).toEqual([['unknown', null]]);
  });

  // T2-AC-07 (model level): completeness passes through untouched and
  // gates the divergence footer.
  it('passes completeness through and flags divergence', () => {
    expect(modelOf('co-declared-share').divergent).toBe(false);
    const divergent = modelOf('synthetic-multi-version');
    expect(divergent.divergent).toBe(true);
    expect(divergent.completeness.unmappedResolutions).toBe(2);
  });

  it('caps bundle-edge references at consume-edge count + MAX_BUNDLE_EDGES', () => {
    const files = Array.from({ length: MAX_BUNDLE_EDGES + 100 }, (_, i) => `chunk-${i}.js`);
    const model = buildGraphModel(
      syntheticProjection({
        remotes: [remoteOf('host', true)],
        copies: [
          copyOf('copy-1', {
            sourcePackage: 'pkg',
            bundleClaimIds: ['claim-1'] as BundleClaimId[],
          }),
        ],
        consumerRelations: [relationOf('host', 'copy-1', ['own-selected'])],
        bundleClaims: [
          bundleClaimOf('claim-1', 'copy-1', 'mapped-source', 'mfe1', 'bundle-x', ['group-1']),
        ],
        chunkGroups: [chunkGroupOf('group-1', 'mfe1', 'bundle-x', files)],
      }),
    );
    // One consume edge raises the cap to 1 + MAX_BUNDLE_EDGES — the
    // edges.length summand is part of the pinned arithmetic (review fix).
    expect(model.edges.length).toBe(1);
    expect(model.bundleEdgeRefs.length).toBe(MAX_BUNDLE_EDGES + 1);
    expect(model.cappedEdges).toBe(99);
    // The cap limits references, never nodes — every recorded file renders.
    expect(chunkNodesOf(model).length).toBe(files.length);
  });

  // ---- Task 3: consumer filter (selection input) ----

  it('treats an empty selection as no filter', () => {
    const projection = projectionOf('frankenstein-live');
    expect(buildGraphModel(projection, { selectedRemotes: new Set() })).toEqual(
      buildGraphModel(projection),
    );
  });

  // T3-AC-03 (model level): OR over a copy's consumers — the co-declared
  // copy is kept when only its borrowing consumer is selected, and the
  // unselected consumer's edge drops while the remote column stays complete.
  it('keeps a copy consumed by a selected remote and drops unselected consume edges', () => {
    const projection = projectionOf('co-declared-share');
    const model = buildGraphModel(projection, { selectedRemotes: new Set(['mfe2']) });

    expect(remoteNodesOf(model).map((n) => n.id)).toEqual(['__NF-HOST__', 'mfe1', 'mfe2']);
    expect(dependencyNodesOf(model).length).toBe(1);
    // The copy's evidenced source cluster is untouched by the filter.
    expect(clusterLabelsOf(model, 'dependencies')).toEqual([['mfe1', 1]]);
    expect(model.edges).toEqual([
      expect.objectContaining({ sourceId: 'mfe2', style: 'dotted', tooltip: 'not-selected' }),
    ]);
  });

  // Exclude mode inverts the selection: excluding one remote renders exactly
  // what including every other remote renders.
  it('excludes the selected remotes as the complement of including the rest', () => {
    const projection = projectionOf('frankenstein-live');
    const all = remoteNodesOf(buildGraphModel(projection)).map((n) => n.id);
    const excluded = buildGraphModel(projection, {
      selectedRemotes: new Set(['whiteboard']),
      filterMode: 'exclude',
    });
    expect(excluded).toEqual(
      buildGraphModel(projection, {
        selectedRemotes: new Set(all.filter((name) => name !== 'whiteboard')),
      }),
    );
    expect(excluded.edges.some((e) => e.sourceId === 'whiteboard')).toBe(false);
    expect(dependencyNodesOf(excluded).length).toBeLessThan(20);
  });

  // Unlike an empty include selection, excluding every remote leaves no consumer.
  it('renders no dependencies when every remote is excluded', () => {
    const projection = projectionOf('co-declared-share');
    const model = buildGraphModel(projection, {
      selectedRemotes: new Set(['__NF-HOST__', 'mfe1', 'mfe2']),
      filterMode: 'exclude',
    });
    expect(remoteNodesOf(model).length).toBe(3);
    expect(dependencyNodesOf(model)).toEqual([]);
    expect(model.edges).toEqual([]);
  });

  // T3-AC-02 (model level): chunk attribution ignores the selection — with
  // only the borrowing consumer (mfe1) selected, the mfe2-sourced copy and
  // its qualified chunk stub stay although the emitter is unselected.
  it('keeps clean-skip chunk evidence when only the borrowing consumer is selected', () => {
    const projection = projectionOf('clean-skip');
    const model = buildGraphModel(projection, { selectedRemotes: new Set(['mfe1']) });

    expect(clusterLabelsOf(model, 'dependencies')).toEqual([['mfe2', 1]]);
    expect(clusterLabelsOf(model, 'chunks')).toEqual([['mfe2 · browser-shared', 1]]);
    expect(chunkNodesOf(model).map((n) => [n.label, n.qualifier])).toEqual([
      ['_nf_lab_conflict_lib.jvcc6K1csg.js', null],
    ]);
    expect(model.bundleEdgeRefs.length).toBe(1);
    expect(model.edges.map((e) => e.sourceId)).toEqual(['mfe1']);
    expect(remoteNodesOf(model).map((n) => n.id)).toEqual(['__NF-HOST__', 'mfe1', 'mfe2']);
  });

  // T3-AC-03 (model level): multi-select is OR — two selected remotes keep
  // the union of their copies; cluster hues stay the app-wide identity
  // slots in every filter state.
  it('keeps the union of copies under a multi-remote selection', () => {
    const projection = projectionOf('frankenstein-live');
    const colors = new Map([
      ['mermaid', 1],
      ['whiteboard', 2],
    ]);
    const model = buildGraphModel(projection, {
      participantColors: colors,
      selectedRemotes: new Set(['mermaid', 'whiteboard']),
    });

    expect(clusterLabelsOf(model, 'dependencies')).toEqual([
      ['mermaid', 1],
      ['whiteboard', 7],
    ]);
    expect(dependencyNodesOf(model).length).toBe(8);
    expect(model.edges.length).toBe(8);
    expect(remoteNodesOf(model).map((n) => n.id)).toEqual(['__NF-HOST__', 'mermaid', 'whiteboard']);
    // The mermaid/whiteboard copies carry no bundle claims — the column
    // lists only their own entry files, never the host's chunk evidence.
    expect(clusterLabelsOf(model, 'chunks')).toEqual([
      ['mermaid', 1],
      ['whiteboard', 7],
    ]);
    expect(chunkNodesOf(model).every((n) => n.qualifier === null)).toBe(true);
    const byLabel = new Map(model.clusters.map((c) => [c.label, c.colorIndex]));
    expect(byLabel.get('mermaid')).toBe(1);
    expect(byLabel.get('whiteboard')).toBe(2);
  });

  // Capture honesty is selection-independent: a ghost-consumer relation is
  // reported in every filter state, while a relation removed by the filter
  // is merely filtered — never "dropped".
  it('keeps droppedRelationIds selection-independent', () => {
    const ghost = relationOf('ghost', 'copy-1', ['own-selected']);
    const projection = syntheticProjection({
      remotes: [remoteOf('host', true), remoteOf('other')],
      copies: [
        copyOf('copy-1', { sourcePackage: 'a-pkg' }),
        copyOf('copy-2', { sourcePackage: 'b-pkg' }),
      ],
      consumerRelations: [
        relationOf('host', 'copy-1', ['own-selected']),
        relationOf('other', 'copy-2', ['own-selected']),
        ghost,
      ],
    });

    const filtered = buildGraphModel(projection, { selectedRemotes: new Set(['host']) });
    expect(filtered.droppedRelationIds).toEqual([ghost.id]);
    // `other`'s relation is filtered: no edge, no copy-2 node, no report.
    expect(filtered.edges.map((e) => e.sourceId)).toEqual(['host']);
    expect(dependencyNodesOf(filtered).map((n) => n.label)).toEqual(['a-pkg']);
    expect(buildGraphModel(projection).droppedRelationIds).toEqual([ghost.id]);
  });

  // A revealed bundle edge inherits the hue of its claiming dependency's
  // cluster — host-sourced copies stay neutral by the forced-neutral rule.
  it('stamps bundle-edge references with the source cluster hue', () => {
    const model = buildGraphModel(
      syntheticProjection({
        remotes: [remoteOf('host-r', true), remoteOf('zzz-remote')],
        copies: [
          copyOf('copy-colored', {
            sourcePackage: 'a-colored',
            source: {
              kind: 'shared-declaration',
              declarationId: 'decl-1' as never,
              participant: 'zzz-remote',
            },
            sourceDisposition: 'share-registration',
            bundleClaimIds: ['claim-z'] as BundleClaimId[],
          }),
          copyOf('copy-host', {
            sourcePackage: 'b-host',
            source: {
              kind: 'shared-declaration',
              declarationId: 'decl-2' as never,
              participant: 'host-r',
            },
            sourceDisposition: 'share-registration',
            bundleClaimIds: ['claim-h'] as BundleClaimId[],
          }),
        ],
        bundleClaims: [
          bundleClaimOf('claim-z', 'copy-colored', 'mapped-source', 'zzz-remote', 'bundle-z', [
            'group-z',
          ]),
          bundleClaimOf('claim-h', 'copy-host', 'mapped-source', 'host-r', 'bundle-h', ['group-h']),
        ],
        chunkGroups: [
          chunkGroupOf('group-z', 'zzz-remote', 'bundle-z', ['z.js']),
          chunkGroupOf('group-h', 'host-r', 'bundle-h', ['h.js']),
        ],
      }),
      { participantColors: new Map([['zzz-remote', 3]]) },
    );

    const byDependency = new Map(model.bundleEdgeRefs.map((r) => [r.dependencyKey, r.colorIndex]));
    expect(byDependency.get('dependency:copy-colored')).toBe(3);
    expect(byDependency.get('dependency:copy-host')).toBeNull();
  });
});

describe('graphAdjacencyOf', () => {
  // T3-AC-01 (model level): adjacency is undirected over ALL edges — a
  // dependency neighbors its consuming remotes AND its claimed chunks; a
  // remote without relations has no entry and traces alone.
  it('derives undirected adjacency from consume edges and bundle references', () => {
    const model = modelOf('clean-skip');
    const adjacency = graphAdjacencyOf(model);
    const [dependency] = dependencyNodesOf(model);
    const [chunk] = chunkNodesOf(model);

    expect(adjacency.get(dependency.key)).toEqual(
      new Set(['remote:mfe1', 'remote:mfe2', chunk.key]),
    );
    expect(adjacency.get(chunk.key)).toEqual(new Set([dependency.key]));
    expect(adjacency.get('remote:mfe1')).toEqual(new Set([dependency.key]));
    // The host consumes nothing in clean-skip — no adjacency entry.
    expect(adjacency.get('remote:__NF-HOST__')).toBeUndefined();
  });
});

// share-pools Task 4: the group-by switch re-clusters the dependency
// column from the projection's `copyGroupingFacets`; nothing else may move.
describe('buildGraphModel — group-by (share-pools T4)', () => {
  const GROUPINGS = ['provider', 'shareScope', 'pool', 'build'] as const;
  const dependencyClusterLabels = (model: GraphModel) =>
    model.clusters
      .filter((cluster) => cluster.column === 'dependencies')
      .map((cluster) => `${cluster.label} (${cluster.count})`);
  const groupedModel = (id: FixtureId, groupBy: (typeof GROUPINGS)[number]) =>
    buildGraphModel(projectionOf(id), { groupBy });

  it('T4-AC-01: clusters by share scope, pool, and build', () => {
    expect(dependencyClusterLabels(groupedModel('frankenstein-live', 'shareScope'))).toEqual([
      `default share scope (${dependencyNodesOf(modelOf('frankenstein-live')).length})`,
    ]);
    expect(dependencyClusterLabels(groupedModel('scoped', 'shareScope'))).toEqual([
      `(private) (${dependencyNodesOf(modelOf('scoped')).length})`,
    ]);
    expect(dependencyClusterLabels(groupedModel('strict-scope', 'shareScope'))).toEqual([
      `strict (${dependencyNodesOf(modelOf('strict-scope')).length})`,
    ]);
    expect(dependencyClusterLabels(groupedModel('pool-tag-coherent', 'pool'))).toEqual([
      'pool ui (2)',
      '(not pooled) (1)',
    ]);
    // Host-provided utils carries no bundle; mfe1's dense-lib entrypoints do.
    expect(dependencyClusterLabels(groupedModel('dense-chunking-only', 'build'))).toEqual([
      'mfe1 · browser-shared (2)',
      '(no build info) (1)',
    ]);
    // The host's per-package bundles are separate builds of one remote.
    expect(dependencyClusterLabels(groupedModel('frankenstein-live', 'build'))).toContain(
      'host · browser-angular_core (6)',
    );
  });

  it('T4-AC-01: pool clusters explain themselves; only a remote build takes a hue', () => {
    const model = groupedModel('pool-tag-anchored', 'pool');
    const pool = model.clusters.find((cluster) => cluster.label === 'pool ui')!;
    expect(pool.tooltip).toBe('formed by: mfe1 "ui", mfe2 "ui"');
    for (const groupBy of ['shareScope', 'pool'] as const) {
      const clusters = buildGraphModel(projectionOf('frankenstein-live'), {
        groupBy,
        participantColors: new Map([['whiteboard', 1]]),
      }).clusters.filter((cluster) => cluster.column === 'dependencies');
      expect(clusters.every((cluster) => cluster.colorIndex === null)).toBe(true);
    }
    const build = buildGraphModel(projectionOf('dense-chunking-only'), {
      groupBy: 'build',
      participantColors: new Map([['mfe1', 2]]),
    }).clusters.filter((cluster) => cluster.column === 'dependencies');
    expect(build.map((cluster) => [cluster.label, cluster.colorIndex])).toEqual([
      ['mfe1 · browser-shared', 2],
      ['(no build info)', null],
    ]);
  });

  it('T4-AC-02: every grouping keeps the node and edge set', () => {
    const identity = (model: GraphModel) => ({
      nodes: model.nodes.map((node) => node.key).sort(),
      edges: model.edges.map((edge) => edge.id).sort(),
      refs: model.bundleEdgeRefs.map((ref) => ref.key).sort(),
    });
    for (const id of [
      'frankenstein-live',
      'scoped',
      'pool-tag-coherent',
      'dense-chunking-only',
    ] as const) {
      const provider = identity(groupedModel(id, 'provider'));
      for (const groupBy of GROUPINGS)
        expect(identity(groupedModel(id, groupBy))).toEqual(provider);
    }
  });

  it('T4-AC-01: deterministic per grouping; provider equals the default', () => {
    for (const groupBy of GROUPINGS) {
      expect(groupedModel('pool-tag-anchored', groupBy)).toEqual(
        groupedModel('pool-tag-anchored', groupBy),
      );
    }
    expect(groupedModel('frankenstein-live', 'provider')).toEqual(modelOf('frankenstein-live'));
  });
});

// Accordion: an open dependency lists its secondary entrypoints; build-files
// groups collapse to one summary row unless open (at most one per column).
describe('buildGraphModel — accordion', () => {
  const copyIdOf = (id: FixtureId, label: string) =>
    dependencyNodesOf(modelOf(id)).find((node) => node.label === label)!.id;

  it('lists a flat build’s secondary copies under the open dependency', () => {
    const projection = projectionOf('frankenstein-live');
    const common = copyIdOf('frankenstein-live', '@angular/common');
    const model = buildGraphModel(projection, { expandedCopyId: common });
    expect(model.listItems.map((item) => [item.text, item.packageSelect])).toEqual([
      ['@angular/common/http', null],
      ['see usage details', '__GLOBAL__|@angular/common'],
    ]);
    expect(
      dependencyNodesOf(model)
        .filter((node) => node.expanded)
        .map((n) => n.label),
    ).toEqual(['@angular/common']);
    // Rows (entrypoint + usage link) push the following node down by their height.
    const before = dependencyNodesOf(modelOf('frankenstein-live'));
    const after = dependencyNodesOf(model);
    const index = before.findIndex((node) => node.id === common);
    expect(after[index + 1].y - before[index + 1].y).toBe(2 * LIST_ROW_H + NODE_VGAP);
  });

  it('lists a dense build’s own entries-map secondaries', () => {
    const lib = copyIdOf('dense-both', '@nf-lab/dense-lib');
    const model = buildGraphModel(projectionOf('dense-both'), { expandedCopyId: lib });
    expect(model.listItems.map((item) => [item.text, item.packageSelect])).toEqual([
      ['@nf-lab/dense-lib/extra', null],
      ['see usage details', '__GLOBAL__|@nf-lab/dense-lib'],
    ]);
    const utils = copyIdOf('dense-both', '@nf-lab/utils');
    expect(
      buildGraphModel(projectionOf('dense-both'), { expandedCopyId: utils }).listItems.map(
        (item) => item.text,
      ),
    ).toEqual(['no secondary entrypoints', 'see usage details']);
  });

  it('collapses build groups to summary rows; one open group shows its files', () => {
    const projection = projectionOf('frankenstein-live');
    const collapsed = buildGraphModel(projection, { expandedBuildKey: null });
    // Single-file builds show their file directly and cannot collapse.
    expect(chunkNodesOf(collapsed).map((node) => (node.summary ? node.label : 'file'))).toEqual([
      '3 files',
      '11 files',
      'file',
      '3 files',
      'file',
      'file',
      '7 files',
    ]);
    expect(collapsed.clusters.filter((c) => c.column === 'chunks').map((c) => c.expanded)).toEqual([
      false,
      false,
      null,
      false,
      null,
      null,
      false,
    ]);
    // One reference per (copy, build): 20 copies, one build each.
    expect(collapsed.bundleEdgeRefs.length).toBe(20);

    const core = collapsed.clusters.find((c) => c.label === 'host · browser-angular_core')!;
    const open = buildGraphModel(projection, { expandedBuildKey: core.key });
    expect(open.clusters.find((c) => c.key === core.key)!.expanded).toBe(true);
    expect(chunkNodesOf(open).filter((node) => !node.summary).length).toBe(14);
    expect(chunkNodesOf(open).filter((node) => node.summary).length).toBe(3);
    // Grouping and filtering never change the accordion's node identity rule.
    expect(buildGraphModel(projection, { expandedBuildKey: core.key })).toEqual(open);
  });

  // The "see usage details" link must land on a Packages entry whose detail
  // lists this very copy — checked against the real Packages VM for every
  // copy of every fixture, so the two grouping rules cannot drift apart.
  it('links every expandable copy to the Packages entry that lists it', () => {
    let linked = 0;
    for (const fixtureId of Object.keys(FIXTURES) as FixtureId[]) {
      const model = ingestSnapshot(structuredClone(FIXTURES[fixtureId]));
      for (const copy of model.resolutionProjection.copies) {
        const link = buildGraphModel(model.resolutionProjection, {
          expandedCopyId: copy.id,
        }).listItems.find((item) => item.packageSelect !== null);
        if (link === undefined) {
          continue;
        }
        linked += 1;
        const detail = buildPackagesVm(model, {
          filter: 'all',
          selectedParticipant: null,
          selectedId: link.packageSelect,
        }).detail;
        expect(
          detail?.blocks.map((block) => block.copyId),
          `${fixtureId}: ${copy.id} -> ${link.packageSelect}`,
        ).toContain(copy.id);
      }
    }
    expect(linked).toBeGreaterThan(0);
  });
});
