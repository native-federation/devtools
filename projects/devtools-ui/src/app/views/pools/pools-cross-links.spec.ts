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

  // A shipper its pool placed off the map links to that remote's row in its pool.
  it('T7-AC-02: a pooled shipper links to the remote in its pool', async () => {
    const harness = await harnessAt(
      'pool-showcase',
      `/packages?select=${encodeURIComponent('__GLOBAL__|@nf-lab/ui-core')}`,
    );
    const el = harness.routeNativeElement!;
    const version = Array.from(el.querySelectorAll<HTMLElement>('tbody.version')).find(
      (row) => row.querySelector('.version-tag')?.textContent?.trim() === '1.0.0',
    )!;
    version.click();
    harness.detectChanges();
    const links = Array.from(el.querySelectorAll('a.shipper')).map(hrefOf);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toMatch(/^\/pools\?select=[^&]+&remote=\w+$/);
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

describe('pool chip → remote row (pools-v48 T8)', () => {
  const markedRows = (el: HTMLElement) => Array.from(el.querySelectorAll('.pool-row.selected'));
  const rowRemote = (row: Element) => row.querySelector('nf-participant-chip')?.textContent?.trim();

  it('T8-AC-01: a Remotes-detail chip lands on that remote, in that pool', async () => {
    const remotes = await harnessAt('pool-tag-coherent', '/remotes?select=mfe2');
    const hrefs = Array.from(remotes.routeNativeElement!.querySelectorAll('a.pool-chip')).map(
      hrefOf,
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href).toBe(`/pools?select=${POOL_ID}&remote=mfe2`);

    const pools = await harnessAt(
      'pool-tag-coherent',
      `/pools?select=${encodeURIComponent(POOL_ID)}&remote=mfe2`,
    );
    const el = pools.routeNativeElement!;
    const rows = markedRows(el);
    expect(rows.length).toBe(1);
    expect(rowRemote(rows[0])).toContain('mfe2');
    expect(rows[0].closest('.pool-card')?.getAttribute('data-pool-id')).toBe(POOL_ID);
    expect(rows[0].querySelector('th[scope="row"]')?.getAttribute('aria-current')).toBe('true');
  });

  it('T8-AC-02: a Package-detail chip lands on its declaring remote', async () => {
    const pools = await harnessAt(
      'pool-tag-coherent',
      `/pools?select=${encodeURIComponent(POOL_ID)}&remote=mfe1`,
    );
    const rows = markedRows(pools.routeNativeElement!);
    expect(rows.length).toBe(1);
    expect(rowRemote(rows[0])).toContain('mfe1');
  });

  it('T8-AC-03: an own-build remote is marked inside its Own build band, reason included', async () => {
    const remotes = await harnessAt('pool-incompatible-nonstrict', '/remotes?select=mfe1');
    const href = hrefOf(remotes.routeNativeElement!.querySelector('a.pool-chip'));
    expect(href).toMatch(/&remote=mfe1$/);

    const pools = await harnessAt('pool-incompatible-nonstrict', encodeURI(href));
    const rows = markedRows(pools.routeNativeElement!);
    expect(rows.length).toBe(1);
    const band = rows[0].closest('tbody')?.querySelector('.pool-band-label')?.textContent?.trim();
    expect(band).toBe('Own build · mfe1');
    expect(rows[0].closest('tbody')?.textContent).toContain('version conflict');
    // Landing selects the global map: the warning says why mfe1 is off it.
    const el = pools.routeNativeElement!;
    expect(el.querySelector('.pool-lens-button[aria-pressed="true"]')?.textContent?.trim()).toMatch(
      /^Global map/,
    );
    expect(el.querySelector('.pool-issues li.selected')?.textContent).toContain('mfe1');
  });

  it('T8-AC-04: an unknown remote, or a remote without select, marks no row', async () => {
    const unknown = await harnessAt(
      'pool-tag-coherent',
      `/pools?select=${encodeURIComponent(POOL_ID)}&remote=nope`,
    );
    expect(markedRows(unknown.routeNativeElement!).length).toBe(0);
    expect(unknown.routeNativeElement!.querySelector('.pool-card.selected')).not.toBeNull();

    const bare = await harnessAt('pool-tag-coherent', '/pools?remote=mfe1');
    expect(markedRows(bare.routeNativeElement!).length).toBe(0);
    expect(bare.routeNativeElement!.querySelector('.pool-card.selected')).toBeNull();
  });
});
