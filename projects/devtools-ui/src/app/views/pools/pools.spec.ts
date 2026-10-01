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
  return fixture.nativeElement as HTMLElement;
}

describe('PoolsView', () => {
  it('T11-AC-01: pool-showcase renders three cards, the legend once, and the orphan', async () => {
    const el = await createView('pool-showcase');
    const cards = Array.from(el.querySelectorAll('.pool-card'));
    expect(cards.map((card) => card.querySelector('.pool-name')?.textContent?.trim())).toEqual([
      'pool charts',
      'pool ui',
      'pool form-kit',
    ]);
    expect(el.querySelectorAll('.pools-legend').length).toBe(1);
    expect(el.querySelectorAll('.pool-orphan').length).toBe(1);

    // The verdict sits right under the matrix.
    const [charts] = cards;
    expect(charts.querySelector('.pool-matrix-wrap')?.nextElementSibling?.classList).toContain(
      'pool-verdict',
    );
    expect(charts.querySelector('.pool-verdict')?.getAttribute('data-tone')).toBe('isolated');
    expect(
      Array.from(charts.querySelectorAll('.pool-band th')).map((th) =>
        th.textContent?.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual(['Build of dashboard', 'Build of catalog · isolated']);
    expect(charts.querySelector('td[data-state="conflict"]')?.textContent?.trim()).toBe('1.1.0');
  });

  it('T11-AC-02: every coloured cell is focusable and exposes its tooltip', async () => {
    const el = await createView('pool-portfolio');
    const cells = Array.from(el.querySelectorAll('.pool-matrix td[data-state]'));
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.getAttribute('tabindex')).toBe('0');
      expect(cell.getAttribute('title')).toBeTruthy();
      expect(cell.getAttribute('aria-label')).toBe(cell.getAttribute('title'));
    }
    // A package the remote does not use carries neither state nor tooltip.
    const unused = Array.from(el.querySelectorAll('.pool-matrix td:not([data-state])'));
    expect(unused.length).toBeGreaterThan(0);
    for (const cell of unused) expect(cell.hasAttribute('tabindex')).toBe(false);
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
    ] as const) {
      const el = await createView(id);
      expect(el.textContent).not.toMatch(forbidden);
      for (const withTitle of Array.from(el.querySelectorAll('[title]'))) {
        expect(withTitle.getAttribute('title') ?? '').not.toMatch(forbidden);
      }
    }
  });
});
