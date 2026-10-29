import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { PARTICIPANT_COLOR_LOOKUP } from '../../shared/kit/participant-colors';
import { TipHost, TipPopup } from '../../shared/kit/tip';
import { FederationStore } from '../../shared/store/federation-store';
import { countClaim } from '../../shared/view-conventions';
import { nodeKeyOf } from './graph-element-factories';
import { buildGraphModel, graphAdjacencyOf } from './graph-model';
import {
  BundleEdgeRef,
  FILTER_MODE_OPTIONS,
  FilterMode,
  GROUP_BY_OPTIONS,
  GraphEdge,
  GraphModel,
  GroupBy,
} from './graph-types';

/**
 * Graph tab — the resolution graph over the canonical projection:
 * remotes, resolved dependency copies clustered by evidenced source, and
 * claimed chunk files clustered by emitter · bundle, one consume edge per
 * `ConsumerCopyRelation`. Dumb component over the pure `buildGraphModel`
 * builder; the template draws the precomputed primitives only and tracks by
 * canonical IDs. Cluster hues come from the app-wide participant color
 * assignment, so a remote's cluster carries the same identity color as its
 * chip dots. All wording stays resolution-honest: an edge shows what the
 * captured map resolves, never what was requested or executed.
 *
 * Interaction state is `{ selectedRemotes, selectedDependencies, hovered }`
 * plus the `groupBy` and `filterMode` preferences — everything else derives
 * per change. Clicking a remote toggles the consumer filter (OR semantics,
 * inverted in exclude mode, applied inside the builder); clicking a
 * dependency toggles its selection, which narrows the build files to the
 * selected copies' and draws every line, lit or grey. Hovering traces a node
 * by emphasis only — classes flip and the hovered node's precomputed bundle
 * edges are revealed, but the model itself never changes on hover.
 */
@Component({
  selector: 'nf-graph-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TipPopup],
  hostDirectives: [TipHost],
  templateUrl: './graph.html',
  styleUrl: './graph.css',
})
export class GraphView {
  private readonly store = inject(FederationStore);
  private readonly participantColors = inject(PARTICIPANT_COLOR_LOOKUP);

  /**
   * The whole interaction state. Both signals reset with every new capture
   * (`linkedSignal` on the store model): view state is per capture — a
   * fixture switch reloads the app, an in-place Refresh resets here — so
   * no selection or hover can carry names a newer capture no longer has.
   */
  protected readonly selectedRemotes = linkedSignal({
    source: this.store.model,
    computation: (): ReadonlySet<string> => new Set(),
  });
  private readonly route = inject(ActivatedRoute);

  // A preference, not capture state: it names no capture value, so it survives capture replacement.
  protected readonly groupBy = signal<GroupBy>('provider');
  protected readonly groupByOptions = GROUP_BY_OPTIONS;
  // A preference like groupBy; switching it keeps the selection and inverts its meaning.
  protected readonly filterMode = signal<FilterMode>('include');
  protected readonly filterModeOptions = FILTER_MODE_OPTIONS;
  /**
   * Pool emphasised by a `/graph?group=pool&select=<poolId>` cross-link. A
   * plain signal so it outlives the store's first model emission; an ID the
   * capture does not know simply matches no cluster.
   */
  protected readonly focusedPoolId = signal<string | null>(null);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const group = params.get('group');
      const option = GROUP_BY_OPTIONS.find((candidate) => candidate.value === group);
      if (option !== undefined) {
        this.groupBy.set(option.value);
      }
      this.focusedPoolId.set(params.get('select'));
    });
  }

  /** Render keys of the focused pool's cluster; null without a (known) focus. */
  private readonly focusedKeys = computed<ReadonlySet<string> | null>(() => {
    const focused = this.focusedPoolId();
    const cluster =
      focused === null || this.groupBy() !== 'pool'
        ? undefined
        : this.vm()?.clusters.find((candidate) => candidate.poolId === focused);
    return cluster === undefined ? null : new Set(cluster.nodeKeys);
  });

  protected readonly selectedDependencies = linkedSignal({
    source: this.store.model,
    computation: (): ReadonlySet<string> => new Set(),
  });

  protected readonly selectingDependencies = computed(() => this.selectedDependencies().size > 0);

  // Accordion state of the build-files column: at most one open build group.
  protected readonly expandedBuildKey = linkedSignal({
    source: this.store.model,
    computation: (): string | null => null,
  });

  /** Render key of the hovered node; null without a hover. */
  protected readonly hovered = linkedSignal({
    source: this.store.model,
    computation: (): string | null => null,
  });

  protected readonly vm = computed<GraphModel | null>(() => {
    const model = this.store.model();
    return model === null
      ? null
      : buildGraphModel(model.resolutionProjection, {
          participantColors: this.participantColors(),
          selectedRemotes: this.selectedRemotes(),
          filterMode: this.filterMode(),
          groupBy: this.groupBy(),
          selectedDependencies: this.selectedDependencies(),
          expandedBuildKey: this.expandedBuildKey(),
        });
  });

  /** Undirected adjacency — derived once per model, not per hover. */
  private readonly adjacency = computed<ReadonlyMap<string, ReadonlySet<string>>>(() => {
    const vm = this.vm();
    return vm === null ? new Map() : graphAdjacencyOf(vm);
  });

  /** Emphasis set of the hover trace: the hovered node plus its neighbors. */
  private readonly traced = computed<ReadonlySet<string> | null>(() => {
    const hovered = this.hovered();
    if (hovered === null) {
      return null;
    }
    return new Set([hovered, ...(this.adjacency().get(hovered) ?? [])]);
  });

  /**
   * Bundle edges on show: all of them while dependencies are selected (the
   * build files are then the selection's own), else the hovered node's.
   */
  protected readonly shownBundleEdges = computed<BundleEdgeRef[]>(() => {
    const hovered = this.hovered();
    const vm = this.vm();
    if (vm === null) {
      return [];
    }
    if (this.selectingDependencies()) {
      return vm.bundleEdgeRefs;
    }
    return hovered === null
      ? []
      : vm.bundleEdgeRefs.filter(
          (ref) => ref.dependencyKey === hovered || ref.chunkKey === hovered,
        );
  });

  protected nodeDimmed(key: string): boolean {
    const traced = this.traced();
    if (traced !== null) {
      return !traced.has(key);
    }
    const focused = this.focusedKeys();
    return focused !== null && key.startsWith('dependency:') && !focused.has(key);
  }

  protected clusterFocused(poolId: string | null): boolean {
    return poolId !== null && this.focusedKeys() !== null && poolId === this.focusedPoolId();
  }

  // White while selecting: the edge lands on a selected dependency; every other edge goes grey.
  protected edgeLit(edge: GraphEdge): boolean {
    return this.selectedDependencies().has(edge.targetId);
  }

  protected bundleEdgeDimmed(edge: BundleEdgeRef): boolean {
    const hovered = this.hovered();
    return hovered !== null && edge.dependencyKey !== hovered && edge.chunkKey !== hovered;
  }

  protected edgeDimmed(edge: GraphEdge): boolean {
    const hovered = this.hovered();
    return (
      hovered !== null &&
      nodeKeyOf('remote', edge.sourceId) !== hovered &&
      nodeKeyOf('dependency', edge.targetId) !== hovered
    );
  }

  protected toggleDependency(copyId: string): void {
    const next = new Set(this.selectedDependencies());
    if (!next.delete(copyId)) {
      next.add(copyId);
    }
    this.selectedDependencies.set(next);
  }

  // Opened explicitly: the SVG link's own target="_blank" did nothing in the DevTools panel.
  protected openFile(event: MouseEvent, href: string): void {
    event.preventDefault();
    window.open(href, '_blank', 'noopener');
  }

  protected toggleBuild(clusterKey: string): void {
    this.expandedBuildKey.update((open) => (open === clusterKey ? null : clusterKey));
  }

  protected setGroupBy(groupBy: GroupBy): void {
    this.groupBy.set(groupBy);
  }

  protected focusLine(): string | null {
    const focused = this.focusedPoolId();
    const cluster = this.vm()?.clusters.find((candidate) => candidate.poolId === focused);
    return this.focusedKeys() === null || cluster === undefined ? null : `showing ${cluster.label}`;
  }

  protected setHovered(key: string | null): void {
    this.hovered.set(key);
  }

  protected toggleRemote(name: string): void {
    const next = new Set(this.selectedRemotes());
    if (!next.delete(name)) {
      next.add(name);
    }
    this.selectedRemotes.set(next);
  }

  // Ticked = the remote's consumers are shown; in exclude mode nothing selected means all ticked.
  protected remoteChecked(name: string): boolean {
    return this.selectedRemotes().has(name) !== (this.filterMode() === 'exclude');
  }

  protected setFilterMode(mode: FilterMode): void {
    this.filterMode.set(mode);
  }

  protected clearSelection(): void {
    this.selectedRemotes.set(new Set());
    this.selectedDependencies.set(new Set());
    this.focusedPoolId.set(null);
  }

  // The focus line, the remote filter and the dependency selection, joined; null when all are idle.
  protected selectionLine(): string | null {
    const remotes = this.selectedRemotes().size;
    const dependencies = this.selectedDependencies().size;
    const parts = [
      this.focusLine(),
      remotes === 0
        ? null
        : this.filterMode() === 'exclude'
          ? `excluding ${countClaim(remotes, 'remote')}`
          : `filtering by ${countClaim(remotes, 'remote')}`,
      dependencies === 0
        ? null
        : `build files of ${countClaim(dependencies, 'selected dependency', 'selected dependencies')}`,
    ].filter((part) => part !== null);
    return parts.length === 0 ? null : parts.join(' · ');
  }

  protected cappedLine(count: number): string {
    return `${countClaim(count, 'additional bundle link')} hidden to keep the graph responsive.`;
  }

  /** Footer line for relations whose consumer has no rendered node. */
  protected droppedRelationLine(count: number): string {
    return `${countClaim(count, 'relation')} not drawn — consumer not among the capture's remotes`;
  }
}
