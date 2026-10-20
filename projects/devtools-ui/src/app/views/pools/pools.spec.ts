/**
 * Pools DOM (share-pools Stage 2, Task 11): each card renders the
 * status matrix with the verdict under it, coloured cells carry a reachable
 * tooltip, and no delivery-claiming vocabulary reaches the page.
 */
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  FIXTURES,
  FixtureId,
  SNAPSHOT_PROVIDER,
  SnapshotProvider,
  SnapshotV1,
} from 'devtools-bridge';

import { provideParticipantColors } from '../../shared/store/participant-colors-provider';
import { PoolsView } from './pools';

class FixtureSnapshotProvider implements SnapshotProvider {
  constructor(private readonly id: FixtureId) {}

  captureSnapshot(): Promise<SnapshotV1> {
    return Promise.resolve(structuredClone(FIXTURES[this.id]));
  }
}

async function createView(id: FixtureId): Promise<HTMLElement> {
  return (await createFixture(id)).nativeElement as HTMLElement;
}

async function createFixture(id: FixtureId) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [PoolsView],
    providers: [
      provideRouter([]),
      provideParticipantColors(),
      { provide: SNAPSHOT_PROVIDER, useValue: new FixtureSnapshotProvider(id) },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(PoolsView);
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('PoolsView', () => {
  it('T11-AC-01: pool-showcase renders three cards, the legend once, and the orphan', async () => {
    const fixture = await createFixture('pool-showcase');
    const el = fixture.nativeElement as HTMLElement;
    const cards = Array.from(el.querySelectorAll('.pool-card'));
    expect(cards.map((card) => card.querySelector('.pool-name')?.textContent?.trim())).toEqual([
      'pool charts',
      'pool ui',
      'pool form-kit',
    ]);
    expect(el.querySelectorAll('.pools-legend').length).toBe(1);
    expect(el.querySelectorAll('.pool-orphan').length).toBe(1);

    // The verdict heads the explainer card right under the matrix.
    const [charts] = cards;
    const explainer = charts.querySelector('.pool-matrix-wrap')?.nextElementSibling;
    expect(explainer?.classList).toContain('pool-explainer');
    expect(explainer?.firstElementChild?.classList).toContain('pool-verdict');
    expect(charts.querySelector('.pool-verdict')?.getAttribute('data-tone')).toBe('isolated');
    expect(
      Array.from(charts.querySelectorAll('.pool-band-label')).map((th) =>
        th.textContent?.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual(['Global map · build of catalog', 'Own build · dashboard']);
    expect(charts.querySelector('td[data-state="rejected"]')?.textContent?.trim()).toBe('2.0.0');
    // A cause chip next to the remote carries the reason; the list under the matrix spells it out.
    const chip = charts.querySelector('.pool-cause');
    expect(chip?.textContent?.trim()).toBe('version conflict');
    expect(chip?.getAttribute('data-tip')).toBe(
      'version conflict: its range ^2.0.0 (strict) rejects the global 1.1.0 of @nf-lab/chart-dom',
    );
    // No warning until a pool is selected; the global map's names the conflict once, with whom it hits.
    expect(charts.querySelector('.pool-issues')).toBeNull();
    expect(charts.querySelector('.pool-coverage')?.hasAttribute('data-complete')).toBe(false);
    charts.querySelector<HTMLButtonElement>('.pool-lens-button')!.click();
    fixture.detectChanges();
    const conflict = charts.querySelector('.pool-issues li');
    // Remotes first, then the problem.
    expect(conflict?.querySelector('.pool-remote-list')?.textContent?.trim()).toBe('dashboard');
    expect(
      Array.from(conflict?.querySelector('.pool-issue-problem')?.children ?? []).map((part) =>
        part.textContent?.trim(),
      ),
    ).toEqual(['conflict', '@nf-lab/chart-dom', 'global 1.1.0 · needs ^2.0.0 (strict)']);
    expect(charts.querySelector('.pool-coverage')?.nextElementSibling?.classList).toContain(
      'pool-matrix-wrap',
    );
  });

  it('T9: nothing selected by default; a band click selects it, a second click clears', async () => {
    const fixture = await createFixture('pool-portfolio');
    const el = fixture.nativeElement as HTMLElement;
    const buttons = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.pool-lens-button'));
    const pressed = () => buttons().map((b) => b.getAttribute('aria-pressed'));
    const verdict = () =>
      el.querySelector('.pool-verdict-type')?.textContent?.replace(/\s+/g, ' ').trim();
    expect(buttons().map((b) => b.textContent?.trim())).toEqual([
      'Global map · build of host',
      'Subpool · build of contacts',
      'Own build · legacy',
    ]);
    expect(pressed()).toEqual(['false', 'false', 'false']);
    expect(el.querySelector('.pool-issues')).toBeNull();

    // The global map: its band tinted, the warning up, the stored verdict.
    buttons()[0].click();
    fixture.detectChanges();
    expect(pressed()).toEqual(['true', 'false', 'false']);
    expect(el.querySelector('tbody.pool-band-lens .pool-band-label')?.textContent?.trim()).toBe(
      'Global map · build of host',
    );
    expect(el.querySelectorAll('.pool-issues li').length).toBe(4);
    expect(verdict()).toBe('✕ Own build · version conflict');

    // Another build: the card is judged against it.
    buttons()[1].click();
    fixture.detectChanges();
    expect(pressed()).toEqual(['false', 'true', 'false']);
    expect(verdict()).toBe('◎ Build of contacts');

    buttons()[1].click();
    fixture.detectChanges();
    expect(pressed()).toEqual(['false', 'false', 'false']);
    expect(el.querySelector('.pool-issues')).toBeNull();

    // The card's own way out.
    buttons()[2].click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.pool-lens-reset')!.click();
    fixture.detectChanges();
    expect(pressed()).toEqual(['false', 'false', 'false']);
    expect(el.querySelector('.pool-lens-reset')).toBeNull();
  });

  it("a click on a remote's row selects the pool it runs in", async () => {
    const fixture = await createFixture('pool-portfolio');
    const el = fixture.nativeElement as HTMLElement;
    const row = (name: string) =>
      Array.from(el.querySelectorAll<HTMLElement>('.pool-row')).find(
        (r) => r.querySelector('nf-participant-chip')?.textContent?.trim() === name,
      )!;
    const active = () =>
      el.querySelector('tbody.pool-band-lens .pool-band-label')?.textContent?.trim();
    row('orders').click();
    fixture.detectChanges();
    expect(active()).toBe('Subpool · build of contacts');
    row('cart').click();
    fixture.detectChanges();
    expect(active()).toBe('Global map · build of host');
    // A second click on a row of the selected pool keeps it selected.
    row('products').click();
    fixture.detectChanges();
    expect(active()).toBe('Global map · build of host');
  });

  it('T11-AC-02: every coloured cell is focusable and exposes its tooltip', async () => {
    const el = await createView('pool-portfolio');
    const cells = Array.from(el.querySelectorAll('.pool-matrix td[data-state]'));
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.getAttribute('tabindex')).toBe('0');
      expect(cell.getAttribute('data-tip')).toBeTruthy();
      expect(cell.getAttribute('aria-label')).toBe(cell.getAttribute('data-tip'));
    }
    // A package the remote does not use carries neither state nor tooltip.
    const unused = Array.from(el.querySelectorAll('.pool-matrix td:not([data-state])'));
    expect(unused.length).toBeGreaterThan(0);
    for (const cell of unused) expect(cell.hasAttribute('tabindex')).toBe(false);
  });

  it('a hovered cell shows its tooltip: the copy as header, the cause set off', async () => {
    const fixture = await createFixture('pool-portfolio');
    const el = fixture.nativeElement as HTMLElement;
    const rejected = el.querySelector<HTMLElement>('td[data-state="rejected"]')!;
    rejected.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    fixture.detectChanges();
    const tip = el.querySelector('.pool-tip');
    expect(tip?.getAttribute('role')).toBe('tooltip');
    expect(tip?.querySelector('.pool-tip-head')?.textContent?.trim()).toBe(
      'legacy · @nf-lab/acme-common 16.2.12',
    );
    expect(tip?.querySelector('.pool-tip-label')?.textContent?.trim()).toBe('Rejected:');

    rejected.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('.pool-tip')).toBeNull();
  });

  it("hovering a remote's row lights up its issues in the warning, and back", async () => {
    const fixture = await createFixture('pool-portfolio');
    const el = fixture.nativeElement as HTMLElement;
    const legacyRow = Array.from(el.querySelectorAll('.pool-row')).find((row) =>
      row.textContent?.includes('legacy'),
    )!;
    el.querySelector<HTMLButtonElement>('.pool-lens-button')!.click(); // the global map
    fixture.detectChanges();
    legacyRow.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    // legacy: its two conflicts and both missing packages it imports.
    expect(el.querySelectorAll('.pool-issues li.hovered').length).toBe(4);

    legacyRow.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(el.querySelector('.hovered')).toBeNull();

    // And back: a conflict line lights legacy's row only.
    const conflict = el.querySelector('.pool-issues li[data-kind="conflict"]')!;
    conflict.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(
      Array.from(el.querySelectorAll('.pool-row.hovered')).map((row) =>
        row.querySelector('nf-participant-chip')?.textContent?.trim(),
      ),
    ).toEqual(['legacy']);
  });

  it('T11-AC-04: a wide pool scrolls inside its own card', async () => {
    const el = await createView('pool-portfolio');
    expect(el.querySelector('.pool-card .pool-matrix-wrap .pool-matrix')).not.toBeNull();
  });

  it('shows the empty line without pool tags', async () => {
    const el = await createView('frankenstein-live');
    expect(el.querySelector('.view-observation')?.textContent?.trim()).toBe(
      'No pool tags in this capture.',
    );
  });

  // T6-AC-07 / T11-AC-03: forbidden delivery vocabulary never reaches the rendered DOM.
  it('keeps delivery-claiming vocabulary out of the view', async () => {
    const forbidden = /\b(loaded|downloaded|fetched|executed|wire cost|byte size|cache hit)\b/i;
    for (const id of [
      'pooling-anchor',
      'pool-showcase',
      'pool-portfolio',
      'pool-tag-anchored',
      'pool-tag-islanded',
      'pool-tag-orphan',
      'pool-uncovered-gap',
      'pool-unshipped',
    ] as const) {
      const el = await createView(id);
      expect(el.textContent).not.toMatch(forbidden);
      for (const withTip of Array.from(el.querySelectorAll('[title], [data-tip]'))) {
        expect(withTip.getAttribute('title') ?? '').not.toMatch(forbidden);
        expect(withTip.getAttribute('data-tip') ?? '').not.toMatch(forbidden);
      }
    }
  });
});
