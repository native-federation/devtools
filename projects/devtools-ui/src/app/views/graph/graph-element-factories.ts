import type {
  BundleClaim,
  ConsumerCopyRelation,
  RemoteProjection,
  ResolvedDependencyCopy,
} from '../../shared/store/resolution';
import {
  copySourceRemote,
  copySourceVmOf,
  participantDisplay,
} from '../../shared/view-conventions';
import {
  CHECKBOX_GAP,
  CHECKBOX_SIZE,
  COL_GAP,
  DependencyGraphNode,
  GraphEdge,
  GraphNode,
  GraphNodeBase,
  HEADER_H,
  HonestBucket,
  LABEL_BASELINE,
  LABEL_MAX,
  LABEL_PAD,
  MARGIN,
  NODE_H,
  NODE_VGAP,
  NODE_W,
  RemoteGraphNode,
  SUB_LABEL_MAX,
  TOGGLE_W,
} from './graph-types';

/**
 * Element-level rules and factories of the graph model: ordering, label
 * derivation, geometry primitives, and the constructors that turn one
 * projection element (remote, copy, relation) into its finished, positioned
 * model piece. The whole-model assembly lives in `buildGraphModel`.
 */

/** Locale-independent codepoint comparison — determinism over collation. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function truncated(
  full: string,
  max: number = LABEL_MAX,
): Pick<GraphNodeBase, 'label' | 'labelTooltip'> {
  if (full.length <= max) {
    return { label: full, labelTooltip: null };
  }
  return { label: `${full.slice(0, max - 1)}…`, labelTooltip: full };
}

/**
 * Label budget of a dependency node: the DISPLAYED tag sub-label reserves
 * its own characters plus a two-char gap inside the shared node width, so a
 * near-limit label never runs under the tag (T1 open issue). Because the
 * displayed tag is itself bounded by `SUB_LABEL_MAX`, label + gap + tag
 * never exceed `LABEL_MAX`; the floor is a pure defensive bound.
 */
function dependencyLabelBudget(shownTag: string | null): number {
  // The expand arrow takes about two characters of the label budget.
  const budget = LABEL_MAX - 2;
  return shownTag === null ? budget : Math.max(12, budget - shownTag.length - 2);
}

/**
 * Label rule for a dependency node: the evidenced source package first, else
 * the alphabetically first consumer registry package of the copy's
 * resolution contexts, else the target URL of the first (alphabetically
 * first specifier) entrypoint.
 */
export function dependencyLabelOf(copy: ResolvedDependencyCopy): string {
  if (copy.sourcePackage !== null) {
    return copy.sourcePackage;
  }
  const contextPackages = copy.resolutionContexts
    .map((context) => context.consumerRegistryPackage)
    .sort(compareStrings);
  if (contextPackages.length > 0) {
    return contextPackages[0];
  }
  const specifiers = Object.keys(copy.entrypoints).sort(compareStrings);
  return specifiers.length > 0 ? copy.entrypoints[specifiers[0]] : copy.id;
}

/** Isolated/private copies render dashed; every other disposition is solid. */
function isIsolated(copy: ResolvedDependencyCopy): boolean {
  return (
    copy.sourceDisposition === 'scope-registration' ||
    copy.sourceDisposition === 'private-registration'
  );
}

export function columnX(index: number): number {
  return MARGIN + index * (NODE_W + COL_GAP);
}

/**
 * Kind-qualified render key (`<kind>:<id>`) — the one identity rule shared
 * by node construction and every key-based lookup (hover adjacency).
 */
export function nodeKeyOf(kind: GraphNode['kind'], id: string): string {
  return `${kind}:${id}`;
}

export function nodeBaseAt(
  kind: GraphNode['kind'],
  id: string,
  fullLabel: string,
  x: number,
  y: number,
  labelMax: number = LABEL_MAX,
): GraphNodeBase {
  return {
    id,
    key: nodeKeyOf(kind, id),
    ...truncated(fullLabel, labelMax),
    x,
    y,
    width: NODE_W,
    height: NODE_H,
    labelX: x + LABEL_PAD,
    labelY: y + LABEL_BASELINE,
  };
}

export function remoteNodeAt(remote: RemoteProjection, rowIndex: number): RemoteGraphNode {
  const y = MARGIN + HEADER_H + rowIndex * (NODE_H + NODE_VGAP);
  // Chip convention: the `__NF-HOST__` sentinel reads as `host`; the
  // verbatim name stays reachable as tooltip, and `id` stays canonical.
  const display = participantDisplay(remote.name);
  const x = columnX(0);
  // The checkbox takes about two characters of the label budget.
  const base = nodeBaseAt('remote', remote.name, display, x, y, LABEL_MAX - 2);
  return {
    ...base,
    labelTooltip: display === remote.name ? base.labelTooltip : remote.name,
    labelX: x + LABEL_PAD + CHECKBOX_SIZE + CHECKBOX_GAP,
    kind: 'remote',
    isHost: remote.isHost,
    checkX: x + LABEL_PAD,
    checkY: y + (NODE_H - CHECKBOX_SIZE) / 2,
  };
}

export function dependencyNodeAt(
  copy: ResolvedDependencyCopy,
  fullLabel: string,
  y: number,
): DependencyGraphNode {
  const x = columnX(1);
  const tag = copy.resolvedTag === null ? null : truncated(copy.resolvedTag, SUB_LABEL_MAX);
  return {
    ...nodeBaseAt(
      'dependency',
      copy.id,
      fullLabel,
      x,
      y,
      dependencyLabelBudget(tag?.label ?? null),
    ),
    kind: 'dependency',
    subLabel: tag === null ? null : tag.label,
    subLabelTooltip: tag === null ? null : tag.labelTooltip,
    isolated: isIsolated(copy),
    expanded: false,
    subLabelX: x + NODE_W - LABEL_PAD - TOGGLE_W,
    subLabelY: y + LABEL_BASELINE,
    toggleX: x + NODE_W - LABEL_PAD,
  };
}

export function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(24, (x2 - x1) / 2);
  return `M ${x1},${y1} C ${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

export function remoteOrder(a: RemoteProjection, b: RemoteProjection): number {
  if (a.isHost !== b.isHost) {
    return a.isHost ? -1 : 1;
  }
  return compareStrings(a.name, b.name);
}

export function edgeOf(
  relation: ConsumerCopyRelation,
  source: RemoteGraphNode,
  target: DependencyGraphNode,
): GraphEdge {
  const solid = relation.mappingStates.every((state) => state === 'own-selected');
  return {
    id: relation.id,
    sourceId: source.id,
    targetId: target.id,
    style: solid ? 'solid' : 'dotted',
    tooltip: solid ? null : Array.from(new Set(relation.mappingStates)).join(', '),
    path: edgePath(
      source.x + source.width,
      source.y + source.height / 2,
      target.x,
      target.y + target.height / 2,
    ),
  };
}

/**
 * Dependency cluster of one copy, from the shared source attribution: an
 * evidenced source remote (`exact-target-source` / `explicit-anchor`)
 * clusters under that remote; everything else stays in its honest bucket —
 * a scope-prefix observation is not an evidenced source.
 */
export function dependencyClusterOf(
  copy: ResolvedDependencyCopy,
): { kind: 'source'; remote: string } | { kind: 'bucket'; bucket: HonestBucket } {
  const qualifier = copySourceVmOf(copy).qualifier;
  switch (qualifier) {
    case 'exact-target-source':
    case 'explicit-anchor':
      // The qualifier ladder only reaches these for an evidenced source
      // record, whose variant embeds its remote name.
      return { kind: 'source', remote: copySourceRemote(copy)! };
    case 'ambiguous-source':
      return { kind: 'bucket', bucket: 'ambiguous source' };
    case 'observed-target-source':
      return { kind: 'bucket', bucket: 'target only' };
    case 'unknown-source':
      return { kind: 'bucket', bucket: 'unknown' };
  }
}

/** Tooltip of a chunk stub: why no file is listed. */
export function stubTooltipOf(claim: BundleClaim): string {
  return claim.status === 'ambiguous'
    ? `${claim.bundle} — several source registrations name a bundle; none is chosen, so no chunk files are attributed`
    : `${claim.bundle} — the copy's source names this bundle, but its remote recorded no split chunk files for it: the copy's own file is the whole output`;
}

/** Qualifier line of a chunk stub; only `mapped-source` claims list files. */
export function stubQualifierOf(claim: BundleClaim): string {
  return claim.status === 'ambiguous'
    ? 'ambiguous — no unique source'
    : 'no chunk files recorded for this bundle';
}
