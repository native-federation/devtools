/**
 * Pools ↔ Graph ↔ detail cross-links (share-pools Task 7), driven
 * through the real routes with RouterTestingHarness so query params arrive
 * exactly as a click would deliver them.
 */
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  FIXTURES,
  FixtureId,
  SNAPSHOT_PROVIDER,
  SnapshotProvider,
  SnapshotV1,
} from 'devtools-bridge';

import { routes } from '../../app.routes';
import { provideParticipantColors } from '../../shared/store/participant-colors-provider';

const POOL_ID = 'tag-pool:["__GLOBAL__","@nf-lab/ui-core",0]';

class FixtureSnapshotProvider implements SnapshotProvider {
  constructor(private readonly id: FixtureId) {}

  captureSnapshot(): Promise<SnapshotV1> {
    return Promise.resolve(structuredClone(FIXTURES[this.id]));
  }
}

async function harnessAt(id: FixtureId, url: string) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      provideParticipantColors(),
      { provide: SNAPSHOT_PROVIDER, useValue: new FixtureSnapshotProvider(id) },
    ],
  });
  const harness = await RouterTestingHarness.create(url);
  await new Promise((resolve) => setTimeout(resolve));
  harness.detectChanges();
  await harness.fixture.whenStable();
  harness.detectChanges();
  return harness;
}

const hrefOf = (el: Element | null) => decodeURIComponent(el?.getAttribute('href') ?? '');

describe('pool cross-links (share-pools T7)', () => {
  it('T7-AC-01: Pools → Graph lands on Pool grouping with the pool emphasised', async () => {
    const pools = await harnessAt('pool-tag-coherent', '/pools');
    const link = pools.routeNativeElement!.querySelector('.pool-graph-link');
    expect(hrefOf(link)).toBe(`/graph?group=pool&select=${POOL_ID}`);

    const graph = await harnessAt(
      'pool-tag-coherent',
      `/graph?group=pool&select=${encodeURIComponent(POOL_ID)}`,
    );
    const el = graph.routeNativeElement!;
    const pressed = el.querySelector('.graph-group-by-button[aria-pressed="true"]');
    expect(pressed?.textContent?.trim()).toBe('Pool');
    expect(
      el.querySelector('.graph-cluster.focused .graph-cluster-label')?.textContent?.trim(),
    ).toBe('pool ui (2)');
    // The unpooled utils copy dims; the pool's two copies stay lit.
    expect(el.querySelectorAll('.graph-node.dependency.dim').length).toBe(1);
    expect(el.querySelector('.graph-toolbar-line')?.textContent?.trim()).toBe('showing pool ui');
  });

  it("T7-AC-01: the pool cluster's explain link returns to the same pool, selected", async () => {
    const graph = await harnessAt('pool-tag-coherent', '/graph?group=pool');
    expect(hrefOf(graph.routeNativeElement!.querySelector('.graph-cluster-link'))).toBe(
      `/pools?select=${POOL_ID}`,
    );
    const pools = await harnessAt(
      'pool-tag-coherent',
      `/pools?select=${encodeURIComponent(POOL_ID)}`,
    );
    expect(
      pools.routeNativeElement!.querySelector('.pool-card.selected')?.getAttribute('data-pool-id'),
    ).toBe(POOL_ID);
  });

  it('T7-AC-02: a Package-detail pool chip links to its pool', async () => {
    const harness = await harnessAt(
      'pool-tag-coherent',
      `/packages?select=${encodeURIComponent('__GLOBAL__|@nf-lab/ui-core')}`,
    );
    const chips = Array.from(harness.routeNativeElement!.querySelectorAll('a.pool-chip'));
    expect(chips.length).toBe(2);
    for (const chip of chips) expect(hrefOf(chip)).toBe(`/pools?select=${POOL_ID}`);
  });

  it('T7-AC-03: an unknown select falls back to no emphasis', async () => {
    const graph = await harnessAt('pool-tag-coherent', '/graph?group=pool&select=tag-pool:nope');
    const el = graph.routeNativeElement!;
    expect(el.querySelector('.graph-cluster.focused')).toBeNull();
    expect(el.querySelectorAll('.graph-node.dim').length).toBe(0);
    const pools = await harnessAt('pool-tag-coherent', '/pools?select=nope');
    expect(pools.routeNativeElement!.querySelector('.pool-card.selected')).toBeNull();
  });
});
