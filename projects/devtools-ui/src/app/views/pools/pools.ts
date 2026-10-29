import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ParticipantChip } from '../../shared/kit/participant-chip';
import { TipHost, TipPopup } from '../../shared/kit/tip';
import { FederationStore } from '../../shared/store/federation-store';
import {
  POOLING_DOCS_URL,
  POOLS_DEFINITION,
  POOL_LEGEND,
  PoolBandVm,
  PoolCardVm,
  PoolLensSelection,
  PoolRemoteVm,
  PoolIssueVm,
  PoolsVm,
  buildPoolsVm,
} from './pools-view-model';

/**
 * Pools tab — one card per explicit-tag pool: a matrix of every remote's copy
 * of every member, grouped by the build it loads, and one verdict under it.
 */
@Component({
  selector: 'nf-pools-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, ParticipantChip, RouterLink, TipPopup],
  templateUrl: './pools.html',
  styleUrl: './pools.css',
  hostDirectives: [TipHost],
})
export class PoolsView {
  private readonly store = inject(FederationStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  // `/pools?select=<pool ID>&remote=<remote>` from a chip or a graph cluster; an unknown ID highlights nothing.
  protected readonly selectedId = signal<string | null>(null);
  protected readonly selectedRemote = signal<string | null>(null);

  private scrolledToSelection = false;

  protected readonly remoteWidth = signal<string | null>(null);

  // Remotes under the pointer, in the matrix or the card, so the other side lights up too.
  private readonly hovered = signal<{ poolId: string; names: ReadonlySet<string> } | null>(null);

  constructor() {
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.selectedId.set(params.get('select'));
        this.selectedRemote.set(params.get('remote'));
      });
    effect(() => {
      if (this.vm() === null) return;
      // One remote-column width for every card, so the version columns line up; capped, then clipped.
      setTimeout(() => {
        const widths = Array.from(
          this.host.nativeElement.querySelectorAll<HTMLElement>('.pool-remote'),
          (remote) => remote.scrollWidth,
        );
        const widest = Math.max(0, ...widths);
        this.remoteWidth.set(widest > 0 ? `${Math.min(widest + 20, 420)}px` : null);
      });
    });
    // A chip that names a remote lands with the global map selected, once: its issues say why the
    // remote runs where it does.
    effect(() => {
      const poolId = this.selectedId();
      const card = this.vm()?.pools.find((p) => p.id === poolId);
      if (this.landedOnRemote || !card || this.selectedRemote() === null) return;
      this.landedOnRemote = true;
      untracked(() => this.lens.set({ poolId: card.id, owner: null }));
    });
    effect(() => {
      if (this.selectedId() === null || this.vm() === null || this.scrolledToSelection) {
        return;
      }
      // Defer past the render pass that materializes the cards.
      setTimeout(() => {
        const el = this.host.nativeElement;
        const target =
          el.querySelector('.pool-row.selected') ?? el.querySelector('.pool-card.selected');
        if (target !== null) {
          this.scrolledToSelection = true;
          target.scrollIntoView?.({ block: 'center' });
        }
      });
    });
  }

  protected isSelectedRow(poolId: string, remote: string): boolean {
    return this.selectedId() === poolId && this.selectedRemote() === remote;
  }

  // Nothing selected by default. A band (pool) selected shows its issues; another build's judges the card against it.
  protected readonly lens = signal<PoolLensSelection | null>(null);
  private landedOnRemote = false;

  protected toggleBand(pool: PoolCardVm, band: PoolBandVm): void {
    if (band.active) this.lens.set(null);
    else this.selectBand(pool, band);
  }

  // A click on a remote's row selects the band it runs in.
  protected selectBand(pool: PoolCardVm, band: PoolBandVm): void {
    if (!band.active) this.lens.set({ poolId: pool.id, owner: band.lensOwner });
  }

  protected hoverRemotes(poolId: string | null, remotes: readonly PoolRemoteVm[] = []): void {
    this.hovered.set(
      poolId === null ? null : { poolId, names: new Set(remotes.map((remote) => remote.name)) },
    );
  }

  protected isHovered(poolId: string, remote: string): boolean {
    const hovered = this.hovered();
    return hovered?.poolId === poolId && hovered.names.has(remote);
  }

  protected isHoveredIssue(poolId: string, issue: PoolIssueVm): boolean {
    return issue.all.some((remote) => this.isHovered(poolId, remote.name));
  }

  protected isSelectedIssue(poolId: string, issue: PoolIssueVm): boolean {
    return issue.all.some((remote) => this.isSelectedRow(poolId, remote.name));
  }

  protected readonly definition = POOLS_DEFINITION;
  protected readonly docsUrl = POOLING_DOCS_URL;
  protected readonly legend = POOL_LEGEND;

  protected readonly vm = computed<PoolsVm | null>(() => {
    const model = this.store.model();
    return model === null
      ? null
      : buildPoolsVm(
          model.resolutionProjection,
          model.provenance.runtimeSource?.orchestratorVersion ?? null,
          this.lens(),
        );
  });
}
