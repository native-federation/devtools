/**
 * Remotes view specs — the component half of remotes-v48: the list names what runs off the
 * norm; the detail is one meta line (remoteEntry URL, exposes), flat-build warnings, a tally, the Runs table
 * whose rows open onto declaration, pool, who else runs it and entrypoints, and the occasional sections
 * (private registrations, claim-less bindings, collapsed chunks). Tooltips are `data-tip`.
 */
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import {
  FIXTURES,
  FixtureId,
  NF_HOST,
  SNAPSHOT_PROVIDER,
  SnapshotProvider,
  SnapshotV1,
} from 'devtools-bridge';

import { provideParticipantColors } from '../../shared/store/participant-colors-provider';
import { RemotesView } from './remotes';

class FixtureSnapshotProvider implements SnapshotProvider {
  constructor(private readonly source: FixtureId | SnapshotV1 | null) {}

  captureSnapshot(): Promise<SnapshotV1> {
    if (this.source === null) {
      return Promise.reject(new Error('capture failed'));
    }
    return Promise.resolve(
      structuredClone(typeof this.source === 'string' ? FIXTURES[this.source] : this.source),
    );
  }
}

/** Flush the store's pending capture promise, then re-render. */
async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function createView(options: { fixture: FixtureId | SnapshotV1 | null; select?: string }) {
  await TestBed.configureTestingModule({
    imports: [RemotesView],
    providers: [
      provideRouter([]),
      // Mirrors the app.config.ts binding — identity-dot pins run against
      // the real store-backed lookup.
      provideParticipantColors(),
      { provide: SNAPSHOT_PROVIDER, useValue: new FixtureSnapshotProvider(options.fixture) },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: convertToParamMap(
              options.select === undefined ? {} : { select: options.select },
            ),
          },
        },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(RemotesView);
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

function runRow(el: HTMLElement, packageName: string): HTMLElement {
  return Array.from(el.querySelectorAll<HTMLElement>('tbody.run')).find(
    (row) => row.querySelector('td .mono')?.textContent === packageName,
  )!;
}

function headings(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('h3')).map((h) => h.textContent?.trim() ?? '');
}

/**
 * Seed for the review-round DOM witnesses (T8 review H1/H2): r1 and r2
 * share one scope URL. `alias-lib` is selected from r1's candidate while
 * r2 declares it WITHOUT candidates (relation-only consumer); `amb-lib`
 * resolves to a target both equal scope prefixes match (ambiguous scope).
 */
const QUALIFIER_SEED: SnapshotV1 = {
  schemaVersion: 1,
  capture: {
    pageUrl: 'https://seed.example/',
    capturedAt: '2026-08-21T00:00:00.000Z',
    mode: 'passive',
    collectorVersion: 'seed/1',
  },
  channels: {
    nativeFederationGlobals: { state: 'available' },
    domImportMaps: { state: 'available' },
    importShim: { state: 'unavailable', reason: 'window.importShim is not present' },
  },
  runtime: {
    remotes: {
      '__NF-HOST__': { scopeUrl: 'https://seed.example/', exposes: [], integrity: {} },
      r1: { scopeUrl: 'https://seed.example/shared/', exposes: [], integrity: {} },
      r2: { scopeUrl: 'https://seed.example/shared/', exposes: [], integrity: {} },
    },
    scopedExternals: {},
    sharedExternals: {
      __GLOBAL__: {
        'alias-lib': {
          dirty: false,
          versions: [
            {
              tag: '1.0.0',
              action: 'share',
              host: false,
              remotes: [
                {
                  name: 'r1',
                  requiredVersion: '^1.0.0',
                  strictVersion: false,
                  file: null,
                  entries: { 'alias-lib': 'lib.js' },
                  cached: true,
                  bundle: null,
                  servedFiles: [{ entry: 'alias-lib', file: 'lib.js' }],
                  generation: 'v4.5',
                },
                {
                  name: 'r2',
                  requiredVersion: '^1.0.0',
                  strictVersion: false,
                  file: null,
                  entries: {},
                  cached: true,
                  bundle: null,
                  servedFiles: [],
                  generation: 'v4.5',
                },
              ],
            },
          ],
        },
        'amb-lib': {
          dirty: false,
          versions: [
            {
              tag: '1.0.0',
              action: 'share',
              host: false,
              remotes: [
                {
                  name: 'r1',
                  requiredVersion: '^1.0.0',
                  strictVersion: false,
                  file: null,
                  entries: { 'amb-lib': 'a.js' },
                  cached: true,
                  bundle: null,
                  servedFiles: [{ entry: 'amb-lib', file: 'a.js' }],
                  generation: 'v4.5',
                },
              ],
            },
          ],
        },
      },
    },
    sharedChunks: {},
    generation: 'v4.5',
  },
  importMaps: {
    documentMaps: [
      {
        kind: 'importmap',
        parsed: true,
        importCount: 1,
        scopeCount: 1,
        imports: [{ specifier: 'amb-lib', target: './shared/b.js' }],
        scopes: [
          { scope: './shared/', imports: [{ specifier: 'alias-lib', target: './shared/lib.js' }] },
        ],
        integrity: {},
      },
    ],
    effective: { imports: [], scopes: [], integrityFor: [] },
  },
  errors: [],
};

describe('RemotesView', () => {
  it('renders the three live remotes with the host chip and the boundary note', async () => {
    const fixture = await createView({ fixture: 'frankenstein-live' });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.tree-row')).toHaveLength(3);
    expect(el.querySelectorAll('.twisty')).toHaveLength(0);
    const hostChip = el.querySelector<HTMLElement>('.tree-row .chip-host')!;
    expect(hostChip.textContent).toBe('host');
    expect(hostChip.title).toBe(NF_HOST);
    expect(el.textContent).not.toContain(NF_HOST);
    // The boundary claim lives in the heading tooltip while the list has rows.
    expect(el.querySelector<HTMLElement>('h1')!.dataset['tip']).toContain(
      'cannot enumerate what the capture cannot see',
    );
    expect(el.textContent).not.toContain('cannot enumerate what the capture cannot see');
    // Every live remote runs the norm — each row reads ok.
    expect(el.querySelectorAll('.tree-row .mark-off, .tree-row .mark-unresolved')).toHaveLength(0);

    // T7.7-AC-02/-AC-04: identity dots from the one sorted-name lookup.
    const chipOf = (name: string) =>
      Array.from(el.querySelectorAll<HTMLElement>('.tree-row .chip-remote')).find(
        (chip) => chip.textContent === name,
      )!;
    expect(chipOf('mermaid').querySelector('.dot')?.classList.contains('dot-1')).toBe(true);
    expect(chipOf('whiteboard').querySelector('.dot')?.classList.contains('dot-2')).toBe(true);
    expect(hostChip.querySelector('.dot')).toBeNull();
  });

  it('keeps the list to problems and whom a remote serves', async () => {
    const fixture = await createView({ fixture: 'pool-showcase' });
    const el = fixture.nativeElement as HTMLElement;
    const marksOf = (name: string) =>
      Array.from(el.querySelectorAll<HTMLElement>('.tree-row'))
        .find((row) => row.querySelector('nf-participant-chip')?.textContent?.trim() === name)!
        .querySelector<HTMLElement>('.row-marks')!;

    // Own builds and subpools stay off the list.
    expect(marksOf('dashboard').textContent?.trim()).toBe('');
    expect(marksOf('catalog').textContent?.trim()).toBe('');
    const serves = marksOf('admin').querySelector<HTMLElement>('.mark.tip')!;
    expect(serves.textContent).toBe('serves 2');
    expect(serves.dataset['tip']).toBe('2 remotes run one of its builds: catalog, checkout');
    expect(marksOf('host').textContent?.trim()).toBe('');
  });

  it('renders the remoteEntry URL and exposes on one meta line, flat settings as warnings', async () => {
    const fixture = await createView({ fixture: 'frankenstein-live', select: NF_HOST });
    const el = fixture.nativeElement as HTMLElement;

    const name = el.querySelector<HTMLElement>('.detail-name span')!;
    expect(name.textContent?.trim()).toBe('host');
    expect(name.dataset['tip']).toBe(NF_HOST);
    const meta = el.querySelector<HTMLElement>('.detail-meta')!;
    // The remoteEntry.json URL is derived from the scope, as the orchestrator does.
    const entry = meta.querySelector<HTMLAnchorElement>('a.entry-url')!;
    expect(entry.textContent).toBe(
      'https://lutzleonhardt.de/frankenstein-meeting-room/remoteEntry.json',
    );
    expect(entry.getAttribute('href')).toBe(entry.textContent);
    expect(entry.dataset['tip']).toContain('scope URL: ./');
    expect(entry.dataset['tip']).toContain('a custom file name is not recorded');
    expect(meta.textContent).toContain('exposes');
    expect(meta.textContent).toContain('none');
    expect(meta.textContent).not.toContain('capabilities');
    // Secondaries registered on their own: the one flat setting this host shows.
    const warnings = Array.from(el.querySelectorAll<HTMLElement>('.warnings .warning'));
    expect(warnings.map((w) => w.textContent?.trim())).toEqual(['⚠ flat externals']);
    expect(warnings[0].dataset['tip']).toContain('features.denseExternals: true');
  });

  it('renders the dense host as calm runs, one row per package, chunks collapsed', async () => {
    const fixture = await createView({ fixture: 'frankenstein-live', select: NF_HOST });
    const el = fixture.nativeElement as HTMLElement;

    expect(headings(el).map((h) => h.split(/\s/)[0])).toEqual(['Runs', 'Chunks']);
    expect(el.querySelector('.tally')?.textContent?.trim()).toBe('5 self');
    const rows = Array.from(el.querySelectorAll<HTMLElement>('tbody.run'));
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.classList.contains('calm'))).toBe(true);
    expect(el.querySelector('.why-text')).toBeNull();
    // The Why column has no visible header.
    expect(el.querySelector('.runs-table thead th:last-child')?.textContent?.trim()).toBe('Why');
    expect(el.querySelector('.runs-table thead th:last-child .visually-hidden')).not.toBeNull();
    expect(el.querySelector('tbody.dive')).toBeNull();

    // A row opens onto its declaration and the secondaries it runs with.
    const core = runRow(el, '@angular/core');
    core.click();
    fixture.detectChanges();
    expect(core.getAttribute('aria-expanded')).toBe('true');
    const dive = el.querySelector<HTMLElement>('tbody.dive')!;
    expect(dive.querySelector('.facts dd.mono')?.textContent).toBe('^21.2.0 · strict');
    expect(dive.querySelectorAll('.entrypoints li')).toHaveLength(6);
    const packages = Array.from(dive.querySelectorAll<HTMLAnchorElement>('a.pool-link')).find((a) =>
      a.textContent?.includes('Packages'),
    )!;
    expect(decodeURIComponent(packages.getAttribute('href') ?? '')).toBe(
      '/packages?select=__GLOBAL__|@angular/core',
    );
    core.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(el.querySelector('tbody.dive')).toBeNull();

    // Chunks render once per bundle, always open.
    const chunks = el.querySelector<HTMLElement>('section.chunks')!;
    expect(chunks.querySelector('h3')?.textContent).toContain('5 bundles');
    const bundles = Array.from(chunks.querySelectorAll('.chunk-head > .mono')).map(
      (b) => b.textContent,
    );
    expect(bundles.filter((b) => b === 'browser-angular_core')).toHaveLength(1);
  });

  it('names the build a skipping remote runs, linked to that remote', async () => {
    const fixture = await createView({ fixture: 'clean-skip', select: 'mfe1' });
    const el = fixture.nativeElement as HTMLElement;

    const row = runRow(el, '@nf-lab/conflict-lib');
    expect(row.querySelector('.run-tag')?.textContent).toBe('2.0.0');
    const from = row.querySelector<HTMLElement>('.from')!;
    expect(from.querySelector('.kind')).toBeNull();
    expect(from.dataset['tip']).toBeUndefined();
    expect(row.querySelector('td.why')?.textContent?.trim()).toBe('');
    const link = from.querySelector<HTMLAnchorElement>('a.chip-link')!;
    expect(decodeURIComponent(link.getAttribute('href') ?? '')).toBe('/remotes?select=mfe2');
    expect(row.querySelector('.serves-hint')).toBeNull();

    row.click();
    fixture.detectChanges();
    expect(el.querySelector('tbody.dive')?.textContent).toContain('not used — runs 2.0.0');
  });

  it('says on the row who else runs a remote’s build', async () => {
    const fixture = await createView({ fixture: 'clean-skip', select: 'mfe2' });
    const el = fixture.nativeElement as HTMLElement;

    const row = runRow(el, '@nf-lab/conflict-lib');
    const hint = row.querySelector<HTMLElement>('.serves-hint')!;
    expect(hint.textContent).toBe('serves 1');
    expect(hint.dataset['tip']).toBe('also run by: mfe1');
    row.click();
    fixture.detectChanges();
    const facts = el.querySelector<HTMLElement>('tbody.dive .facts')!;
    expect(facts.querySelector('dt')?.textContent).toBe('Serves');
    expect(facts.querySelector('dd a.chip-link .chip')?.textContent).toBe('mfe1');
  });

  // The case the old provides zone left silent.
  it('strict-uncovered: says why mfe1 runs its own build and which entrypoints host lacks', async () => {
    const fixture = await createView({ fixture: 'strict-uncovered', select: 'mfe1' });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.tally')?.textContent?.trim()).toBe('1 scoped');
    const row = runRow(el, '@nf-lab/kit');
    expect(row.classList.contains('calm')).toBe(false);
    expect(row.querySelector('.from .kind-own')?.textContent).toBe('scoped');
    const why = row.querySelector<HTMLElement>('.why-text')!;
    expect(why.textContent).toBe('not covered');
    expect(why.dataset['tip']).toBe(
      'not covered: the serving build of host lacks @nf-lab/kit/table, @nf-lab/kit/dialog',
    );
    row.click();
    fixture.detectChanges();
    const notes = Array.from(el.querySelectorAll('tbody.dive .entry-note')).map(
      (n) => n.textContent,
    );
    expect(notes).toEqual(["not in host's build", "not in host's build"]);
  });

  it('names a subpool and links its pool to this remote’s row in Pools', async () => {
    const fixture = await createView({ fixture: 'pool-showcase', select: 'catalog' });
    const el = fixture.nativeElement as HTMLElement;

    const row = runRow(el, '@nf-lab/ui-core');
    expect(row.querySelector('.from .kind-subpool')?.textContent).toBe('subpool of');
    expect(row.querySelector('.from a.chip-link .chip')?.textContent).toBe('admin');
    row.click();
    fixture.detectChanges();
    const pool = el.querySelector<HTMLAnchorElement>('tbody.dive a.pool-chip')!;
    expect(pool.textContent?.trim()).toBe('ui →');
    expect(pool.getAttribute('href')).toMatch(/^\/pools\?select=.+&remote=catalog$/);
  });

  it('closes the open row when another remote is selected', async () => {
    const fixture = await createView({ fixture: 'pool-showcase', select: 'catalog' });
    const el = fixture.nativeElement as HTMLElement;
    runRow(el, '@nf-lab/ui-core').click();
    fixture.detectChanges();
    expect(el.querySelector('tbody.dive')).not.toBeNull();

    Array.from(el.querySelectorAll<HTMLElement>('.tree-row'))
      .find((row) => row.textContent?.includes('checkout'))!
      .click();
    fixture.detectChanges();
    expect(el.querySelector('.detail-name')?.textContent?.trim()).toBe('checkout');
    expect(el.querySelector('tbody.dive')).toBeNull();
  });

  it('keeps a declaration that resolves nowhere as a not-mapped row', async () => {
    const fixture = await createView({ fixture: 'synthetic-multi-version', select: 'calendar' });
    const el = fixture.nativeElement as HTMLElement;

    const row = runRow(el, 'ui-lib');
    expect(row.querySelector('.run-tag')?.textContent).toBe('–');
    const state = row.querySelector<HTMLElement>('.from .kind-unresolved')!;
    expect(state.textContent).toBe('not mapped');
    expect(row.querySelector<HTMLElement>('.why-text')?.dataset['tip']).toContain(
      'in this capture',
    );
  });

  it('renders private registrations in their own section', async () => {
    const fixture = await createView({ fixture: 'scoped', select: 'mfe1' });
    const el = fixture.nativeElement as HTMLElement;

    expect(headings(el)).toContain('Private registrations');
    expect(el.querySelector('tbody.run')).toBeNull();
    const item = el.querySelector<HTMLElement>('.scoped-item')!;
    expect(item.querySelector('.mono')?.textContent).toBe('@nf-lab/conflict-lib');
    expect(item.querySelector<HTMLElement>('.mono.tip')?.dataset['tip']).toContain(
      'no share action, no share scope',
    );
    const state = item.querySelector<HTMLElement>('.state-chip')!;
    expect(state.textContent).toBe('own mapping');
    expect(item.textContent).toContain('_nf_lab_conflict_lib.JF7uEdSVsN.js');
  });

  it('renders reclassified chunks in the chunk section, never as scoped packages', async () => {
    const fixture = await createView({ fixture: 'non-dense', select: 'mfe3' });
    const el = fixture.nativeElement as HTMLElement;

    expect(headings(el)).not.toContain('Private registrations');
    const title = el.querySelector<HTMLElement>('section.chunks h3')!;
    expect(title.dataset['tip']).toContain('rule: chunk-pseudo-externals');
    const labels = Array.from(el.querySelectorAll('section.chunks .chunk-row .mono')).map(
      (label) => label.textContent,
    );
    expect(labels.some((label) => label?.startsWith('@nf-internal/'))).toBe(true);
  });

  it('links each expose to the Import Map with its file and SRI in the tooltip', async () => {
    const fixture = await createView({ fixture: 'frankenstein-live', select: 'whiteboard' });
    const el = fixture.nativeElement as HTMLElement;

    const expose = el.querySelector<HTMLAnchorElement>('a.expose-link')!;
    expect(expose.textContent).toBe('Bootstrap');
    expect(decodeURIComponent(expose.getAttribute('href') ?? '')).toBe(
      '/import-map?select=whiteboard/./Bootstrap',
    );
    expect(expose.dataset['tip']).toBe(
      'whiteboard/./Bootstrap\nfile: Bootstrap-7COJRA5I.js\nSRI: hash recorded',
    );
    // No chunk evidence: no chunk section at all.
    expect(el.querySelector('section.chunks')).toBeNull();
  });

  // T8.6-AC-05 (DOM half): a qualified attribution keeps its qualifier.
  it('renders an ambiguous source as a qualified From, never self', async () => {
    const fixture = await createView({ fixture: QUALIFIER_SEED, select: 'r1' });
    const el = fixture.nativeElement as HTMLElement;

    const amb = runRow(el, 'amb-lib');
    expect(amb.querySelector('.from .kind-unknown')?.textContent).toBe('ambiguous source');
    expect(amb.querySelector<HTMLElement>('.why-text')?.dataset['tip']).toBe(
      'ambiguous source: equally specific remote scope prefixes match this target — none is chosen',
    );
    expect(runRow(el, 'alias-lib').querySelector('.from .kind-self')?.textContent).toBe('self');
  });

  // T8 review H2 (DOM half): a claim-less consumer relation stays visible.
  it('renders the relation-only consumer binding of an alias scope', async () => {
    const fixture = await createView({ fixture: QUALIFIER_SEED, select: 'r2' });
    const el = fixture.nativeElement as HTMLElement;

    expect(headings(el)).toContain('Bindings without an own claim');
    const item = el.querySelector<HTMLElement>('.relation-item')!;
    expect(item.querySelector('.mono')?.textContent).toBe('alias-lib');
    expect(item.querySelector('.run-tag')?.textContent).toBe('1.0.0');
    expect(item.querySelector<HTMLElement>('.state-chip')?.textContent).toBe('r1');
    expect(item.textContent).toContain('alias-lib → lib.js');
    // The candidate-less declaration itself runs nowhere of its own.
    expect(runRow(el, 'alias-lib').querySelector('.from .kind')?.textContent).toBe('declared');
  });

  it('selects a remote on row click', async () => {
    const fixture = await createView({ fixture: 'clean-skip' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.detail-name')).toBeNull();
    expect(el.textContent).toContain('Select a remote on the left.');

    el.querySelector<HTMLElement>('.tree-row')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.detail-name')?.textContent?.trim()).toBe('mfe1');
  });

  it('speaks the fixed vocabulary across list and detail', async () => {
    const fixture = await createView({ fixture: 'frankenstein-live', select: NF_HOST });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).not.toMatch(/\buses\b/);
    expect(el.textContent).not.toMatch(/\bused by\b/);
    expect(el.textContent).not.toMatch(/\bloaded\b/);
    expect(el.querySelector('[title]:not(.chip)')).toBeNull();
  });

  it('renders an honest observation when no snapshot is captured', async () => {
    const fixture = await createView({ fixture: null });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('no captured snapshot to render');
    expect(el.querySelector('.tree-row')).toBeNull();
  });
});
