import type { CompletenessCounts } from '../../shared/store/resolution';

/**
 * Contract of the pure graph model: the layout constants and the shapes
 * `buildGraphModel` emits. The renderer draws these precomputed primitives
 * only; every rendered identity chains to canonical IDs (remote name, copy
 * ID, relation ID, bundle-claim ID, chunk-group ID + recorded file).
 */

export const NODE_W = 340;
export const NODE_H = 26;
export const NODE_VGAP = 6;
export const COL_GAP = 150;
export const MARGIN = 24;
export const HEADER_H = 30;
export const LABEL_MAX = 44;
/** Display budget of the right-aligned tag sub-label; overflow gets a tooltip. */
export const SUB_LABEL_MAX = 16;

/** Cluster box geometry: header band, inner padding, gap between clusters. */
export const CLUSTER_HEADER = 22;
export const CLUSTER_PAD = 10;
export const CLUSTER_VGAP = 20;

/** Two-line chunk stub (bundle name + qualifier) of a claim without files. */
export const STUB_NODE_H = 40;

/** Row height of an expanded dependency's entrypoint list. */
export const LIST_ROW_H = 16;

/**
 * Bundle-edge reference budget on top of the consume edges: references are
 * capped at `edges.length + MAX_BUNDLE_EDGES`; the overflow count is
 * reported as `cappedEdges`, never silently dropped.
 */
export const MAX_BUNDLE_EDGES = 4000;

/** Text baselines inside the header band and inside a node box. */
export const HEADER_BASELINE = 18;
export const LABEL_BASELINE = 17;
export const LABEL_PAD = 8;
/** Width reserved at a dependency node's right edge for its expand arrow. */
export const TOGGLE_W = 14;
/** Side of a remote node's filter checkbox, and the gap before its label. */
export const CHECKBOX_SIZE = 10;
export const CHECKBOX_GAP = 6;
/** Cluster label baseline inside the cluster header band. */
export const CLUSTER_LABEL_BASELINE = 15;
/** Second-line baseline of a chunk stub's qualifier text. */
export const QUALIFIER_BASELINE = 32;

/**
 * The honest dependency buckets for copies without an evidenced source
 * remote — always pinned after the source-remote clusters, in this order,
 * and never collapsed into one another.
 */
export const HONEST_BUCKETS = ['ambiguous source', 'target only', 'unknown'] as const;
export type HonestBucket = (typeof HONEST_BUCKETS)[number];

/** Axis the dependency column clusters by; `provider` is the evidenced-source clustering. */
export const GROUP_BY_OPTIONS = [
  {
    value: 'provider',
    label: 'Provider',
    hint: 'cluster copies by the remote whose registration they resolve to',
  },
  {
    value: 'shareScope',
    label: 'Share scope',
    hint: 'cluster copies by the share scope of their source registration',
  },
  {
    value: 'pool',
    label: 'Pool',
    hint: 'cluster copies by the explicit pool tag pool of their package',
  },
  {
    value: 'build',
    label: 'Build',
    hint: 'cluster copies by the build output (remote · bundle) their source was bundled in',
  },
] as const;
export type GroupBy = (typeof GROUP_BY_OPTIONS)[number]['value'];

export const FILTER_MODE_OPTIONS = [
  { value: 'include', label: 'Include', hint: 'show only the consumers of the selected remotes' },
  { value: 'exclude', label: 'Exclude', hint: 'hide the consumers of the selected remotes' },
] as const;
export type FilterMode = (typeof FILTER_MODE_OPTIONS)[number]['value'];

export type GraphColumnKey = 'remotes' | 'dependencies' | 'chunks';

export interface GraphColumn {
  key: GraphColumnKey;
  label: string;
  /** Left edge shared by the column's nodes. */
  x: number;
  /** Header text position (baseline). */
  headerX: number;
  headerY: number;
}

/** Fields every node kind shares; the union members discriminate on `kind`. */
export interface GraphNodeBase {
  /** Canonical identity: remote name, copy ID, claim ID, or group ID + file. */
  id: string;
  /**
   * Kind-qualified render key (`<kind>:<id>`). Remote names are arbitrary
   * capture strings and may textually equal a copy ID, so the bare `id` is
   * not unique across kinds.
   */
  key: string;
  /** Truncated to `LABEL_MAX`; the full text moves to `labelTooltip`. */
  label: string;
  /** Full label when truncated, else null. */
  labelTooltip: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  labelX: number;
  labelY: number;
}

export interface RemoteGraphNode extends GraphNodeBase {
  kind: 'remote';
  /** The capture's host. */
  isHost: boolean;
  /** Top-left corner of the filter checkbox. */
  checkX: number;
  checkY: number;
}

export interface DependencyGraphNode extends GraphNodeBase {
  kind: 'dependency';
  /**
   * Resolved tag of the copy, right-aligned and truncated to
   * `SUB_LABEL_MAX`; null when not evidenced.
   */
  subLabel: string | null;
  /** Full tag when truncated, else null. */
  subLabelTooltip: string | null;
  /** Isolated/private copy — rendered with a dashed border. */
  isolated: boolean;
  /** Right-aligned sub-label anchor (text-anchor: end). */
  subLabelX: number;
  subLabelY: number;
  /** Right-aligned expand-arrow anchor. */
  toggleX: number;
  /** The accordion-open copy: its secondary entrypoints list below it. */
  expanded: boolean;
}

export interface ChunkGraphNode extends GraphNodeBase {
  kind: 'chunk';
  /**
   * Qualifier line of a stub (a claim without registered chunk files):
   * `source-only` and `ambiguous` claims must surface their uncertainty
   * instead of inventing files. Null on a recorded chunk-file node.
   */
  qualifier: string | null;
  qualifierX: number;
  qualifierY: number;
  /** Recorded file resolved against its emitter's scope URL; null on a stub or an unknown emitter. */
  href: string | null;
  /** Stand-in for a collapsed build group (`N files`); its references are the group's. */
  summary: boolean;
  /** Key of the build-files cluster the node belongs to (the accordion toggle target). */
  clusterKey: string;
}

/** One row of an expanded dependency's secondary-entrypoint list. */
export interface GraphListItem {
  key: string;
  /** Render key of the dependency node it belongs to. */
  ownerKey: string;
  /** The import name (specifier), or the link text of a Packages link row. */
  text: string;
  tooltip: string | null;
  /** Packages `select` id when the row links to the Packages view; null on an entrypoint row. */
  packageSelect: string | null;
  x: number;
  y: number;
}

export type GraphNode = RemoteGraphNode | DependencyGraphNode | ChunkGraphNode;

/** One cluster box of a clustered column (dependencies or chunks). */
export interface GraphCluster {
  /** Kind-qualified render key — cluster names are arbitrary capture strings. */
  key: string;
  column: 'dependencies' | 'chunks';
  /** `host`, source-remote display, honest bucket, group-by key, or `emitter · bundle`. */
  label: string;
  /** Native tooltip explaining the cluster key; null when the label says it all. */
  tooltip: string | null;
  /** Tag pool of a Pool-grouping cluster (the /pools cross-link target); null otherwise. */
  poolId: string | null;
  /** Render keys of the enclosed nodes. */
  nodeKeys: string[];
  /** Open state of a collapsible build-files cluster; null when it cannot collapse (dependency or single-file cluster). */
  expanded: boolean | null;
  /** Number of enclosed nodes. */
  count: number;
  /**
   * 1-based `--nf-participant-color-N` index of the owning remote from the
   * injected app-wide assignment; null renders neutral. The host and the
   * honest buckets are always neutral — a hue is an identity claim.
   */
  colorIndex: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  labelX: number;
  labelY: number;
}

export interface GraphEdge {
  /** Canonical `ConsumerCopyRelation` ID. */
  id: string;
  /** Consumer remote name. */
  sourceId: string;
  /** Copy ID. */
  targetId: string;
  /**
   * Solid when every mapping state of the relation is `own-selected` —
   * vacuously solid for a claim-less relation, whose binding carries no
   * deviation evidence. Dotted otherwise.
   */
  style: 'solid' | 'dotted';
  /** Distinct mapping states verbatim on dotted edges; null on solid ones. */
  tooltip: string | null;
  /** Cubic Bézier from source right-mid to target left-mid. */
  path: string;
}

/**
 * One `dependency → chunk` reference of a bundle claim. Computed into the
 * model with full geometry but not rendered as a standing edge — the hover
 * trace (Task 3) draws the references of the hovered node only.
 */
export interface BundleEdgeRef {
  key: string;
  /** Render key of the claiming dependency node. */
  dependencyKey: string;
  /** Render key of the claimed chunk node. */
  chunkKey: string;
  /**
   * Hue slot of the claiming dependency's cluster (null renders neutral) —
   * the hover trace colors a revealed bundle edge by its source cluster.
   */
  colorIndex: number | null;
  path: string;
}

export interface GraphModel {
  columns: GraphColumn[];
  clusters: GraphCluster[];
  nodes: GraphNode[];
  listItems: GraphListItem[];
  edges: GraphEdge[];
  /** Capped at `edges.length + MAX_BUNDLE_EDGES`; overflow in `cappedEdges`. */
  bundleEdgeRefs: BundleEdgeRef[];
  /** Bundle-edge references dropped by the cap — counted, never silent. */
  cappedEdges: number;
  /**
   * Relations whose consumer remote (or copy) has no rendered node — nodes
   * come only from the projection's remotes and copies, never invented for
   * an edge. Empty on every demonstrated capture; surfaced as data so the
   * omission is never silent.
   */
  droppedRelationIds: string[];
  /** `projection.completeness.total` passthrough for the divergence footer. */
  completeness: CompletenessCounts;
  /** True when any completeness count is non-zero — the footer's gate. */
  divergent: boolean;
  width: number;
  height: number;
  /** True when the projection yields no nodes at all. */
  empty: boolean;
}

export interface GraphBuildOptions {
  /**
   * The app-wide participant color assignment (name → 1-based palette
   * index, host excluded, empty above the palette threshold) — the same
   * lookup the participant chips render, so a remote's cluster hue equals
   * its identity-dot slot in every view. Its domain covers the capture's
   * renderable participants independent of any graph filtering, which keeps
   * cluster hues stable under later filtering.
   */
  participantColors?: ReadonlyMap<string, number>;
  /**
   * Consumer filter: with a non-empty selection a copy is kept when at
   * least one of its consume relations names a selected remote (OR), and
   * consume edges from unselected remotes drop. The remote column always
   * renders completely, and chunk attribution follows the kept copies'
   * claims regardless of the emitter's selection state — the emitter is
   * not the consumer. Capture honesty (`droppedRelationIds`,
   * `completeness`) stays selection-independent: a relation removed by the
   * filter is filtered, never "dropped".
   */
  selectedRemotes?: ReadonlySet<string>;
  /** `exclude` inverts the selection: every remote except the selected ones counts. Defaults to `include`. */
  filterMode?: FilterMode;
  /** Dependency-column clustering; defaults to `provider`. The node and edge set never depends on it. */
  groupBy?: GroupBy;
  /** Copy whose secondary entrypoints list below it (accordion: at most one). */
  expandedCopyId?: string | null;
  /**
   * Open build-files cluster (accordion: at most one); every other cluster
   * collapses to a summary node. `'all'` (the default) opens every cluster.
   */
  expandedBuildKey?: string | null | 'all';
}
