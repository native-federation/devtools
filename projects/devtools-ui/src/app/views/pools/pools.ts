import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
  imports: [NgTemplateOutlet, ParticipantChip, RouterLink],
  templateUrl: './pools.html',
  styleUrl: './pools.css',
  host: {
    '(mouseover)': 'showTip($event)',
    '(focusin)': 'showTip($event)',
    '(mouseout)': 'hideTip($event)',
    '(focusout)': 'hideTip($event)',
  },
})
export class PoolsView {
  private readonly store = inject(FederationStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  // `/pools?select=<pool ID>&remote=<remote>` from a chip or a graph cluster; an unknown ID highlights nothing.
  protected readonly selectedId = signal<string | null>(null);
  protected readonly selectedRemote = signal<string | null>(null);

  private scrolledToSelection = false;

  protected readonly remoteWidth = signal<string | null>(null);

  protected readonly tip = signal<PoolTip | null>(null);
  private tipTarget: Element | null = null;

  // Remotes under the pointer, in the matrix or the card, so the other side lights up too.
  private readonly hovered = signal<{ poolId: string; names: ReadonlySet<string> } | null>(null);

  constructor() {
    // A scroll anywhere (the page, a matrix scrolling sideways) moves the target away from its tooltip.
    const hide = () => this.hideTip();
    document.addEventListener('scroll', hide, true);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('scroll', hide, true));

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

  protected showTip(event: Event): void {
    const target = (event.target as Element | null)?.closest<HTMLElement>('[data-tip]');
    if (!target || target === this.tipTarget || !this.host.nativeElement.contains(target)) return;
    const text = target.dataset['tip'];
    if (!text) return;
    this.tipTarget = target;
    const list = target.hasAttribute('data-tip-list');
    const lines = (list ? text.split(', ') : text.split('\n')).map(tipLine);
    const head = target.hasAttribute('data-tip-head') ? (lines.shift()?.text ?? null) : null;
    const rect = target.getBoundingClientRect();
    const above = rect.bottom + 160 > window.innerHeight && rect.top > 160;
    this.tip.set({
      head,
      lines: list ? lines.map((line) => ({ label: null, text: line.text })) : lines,
      list,
      above,
      x: Math.max(8, Math.min(rect.left, window.innerWidth - 368)),
      y: above ? rect.top - 6 : rect.bottom + 6,
    });
  }

  protected hideTip(event?: Event): void {
    const next = (event as MouseEvent | FocusEvent | undefined)?.relatedTarget as Node | null;
    if (next && this.tipTarget?.contains(next)) return;
    this.tipTarget = null;
    this.tip.set(null);
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

interface PoolTip {
  head: string | null;
  lines: { label: string | null; text: string }[];
  list: boolean;
  above: boolean;
  x: number;
  y: number;
}

// `cause: text` lines get their cause set off; a version like `^1.0.0` never reads as a label.
function tipLine(line: string): { label: string | null; text: string } {
  const match = /^([^:]{1,60}): (.*)$/s.exec(line);
  return match ? { label: match[1], text: match[2] } : { label: null, text: line };
}
