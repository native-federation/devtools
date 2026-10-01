import { provideRouter, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import {
  FIXTURES,
  FixtureId,
  PRIMARY_FIXTURE_ID,
  SNAPSHOT_PROVIDER,
  SnapshotProvider,
  SnapshotV1,
} from 'devtools-bridge';
import { App } from './app';
import { appConfig } from './app.config';
import { routes } from './app.routes';
import { SnapshotExportService } from './shared/snapshot-export.service';

class StubSnapshotProvider implements SnapshotProvider {
  captureSnapshot(): Promise<SnapshotV1> {
    return Promise.resolve(structuredClone(FIXTURES[PRIMARY_FIXTURE_ID]));
  }
}

/**
 * Fixture-backed provider that counts captureSnapshot() invocations and
 * serves the listed fixtures in call order (the last one repeats).
 */
class SequenceSnapshotProvider implements SnapshotProvider {
  calls = 0;

  constructor(private readonly fixtureIds: readonly FixtureId[]) {}

  captureSnapshot(): Promise<SnapshotV1> {
    const id = this.fixtureIds[Math.min(this.calls, this.fixtureIds.length - 1)];
    this.calls++;
    return Promise.resolve(structuredClone(FIXTURES[id]));
  }
}

/** Flush the store's pending capture promise, then re-render. */
async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        { provide: SNAPSHOT_PROVIDER, useClass: StubSnapshotProvider },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  // T8-AC-01 + T4-AC-01 (graph-view): the nav shows the V2 tab set in spec
  // order, without the Diagnostics tab (hidden until resolution-model
  // Task 10 lands).
  it('renders the V2 tab set', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const labels = Array.from(compiled.querySelectorAll('.shell-nav a')).map((a) =>
      a.textContent?.trim(),
    );
    expect(labels).toEqual(['Packages', 'Remotes', 'Import Map', 'Graph']);
  });

  // T8-AC-01: `/packages` is the default route (since Task 10 the real
  // Packages view, since Task 11 the real Remotes view, since Task 12 the
  // real Import Map view). T4-AC-01 (graph-view): the diagnostics route is
  // no nav tab anymore but stays reachable by direct URL and still renders
  // the honest placeholder.
  it('defaults to /packages and renders honest placeholders on the open tabs', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    await settle(fixture);
    expect(router.url).toBe('/packages');
    const packagesView = (fixture.nativeElement as HTMLElement).querySelector('.view')!;
    expect(packagesView.querySelector('h1')?.textContent).toBe('Packages');
    expect(packagesView.textContent).not.toContain('view not implemented yet');

    for (const [url, title] of [
      ['/remotes', 'Remotes'],
      ['/import-map', 'Import Map'],
      ['/graph', 'Graph'],
    ]) {
      await router.navigateByUrl(url);
      await settle(fixture);
      const view = (fixture.nativeElement as HTMLElement).querySelector('.view')!;
      expect(view.querySelector('h1')?.textContent).toBe(title);
      expect(view.textContent).not.toContain('view not implemented yet');
    }

    await router.navigateByUrl('/diagnostics');
    await settle(fixture);
    const diagnosticsView = (fixture.nativeElement as HTMLElement).querySelector('.view')!;
    expect(diagnosticsView.querySelector('h1')?.textContent).toBe('Diagnostics');
    expect(diagnosticsView.textContent).toContain('view not implemented yet');
  });

  // T6: the shell-level export button follows the snapshot state.
  it('enables the export button once a snapshot is captured', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.shell-export',
    )!;
    expect(button.textContent?.trim()).toBe('Export JSON');
    expect(button.disabled).toBe(true);

    await settle(fixture);
    expect(button.disabled).toBe(false);
  });

  // T8-AC-06 (shell level): while capturing, neither capture meta nor any
  // channel state is claimed; once captured, the identity line appears.
  it('shows page URL and captured-at in the shell status once captured', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.shell-status')).toBeNull();
    expect(el.querySelector('nf-capture-status-strip')).toBeNull();
    expect(el.querySelector<HTMLButtonElement>('.shell-refresh')!.disabled).toBe(true);

    await settle(fixture);
    const status = el.querySelector('.shell-status')!;
    const url = status.querySelector<HTMLAnchorElement>('a.shell-status-url')!;
    expect(url.textContent).toContain('https://lutzleonhardt.de/frankenstein-meeting-room/');
    expect(url.getAttribute('href')).toBe('https://lutzleonhardt.de/frankenstein-meeting-room/');
    expect(url.target).toBe('_blank');
    const date = status.querySelector<HTMLElement>('.shell-status-date')!;
    expect(date.textContent?.trim()).toBe('2026-08-11');
    expect(date.title).toBe('2026-08-11T11:56:25.504Z');
    expect(el.querySelector<HTMLButtonElement>('.shell-refresh')!.disabled).toBe(false);
  });

  // T8-AC-08: the generation badge is provenance surfaced by the shell —
  // v4 for the live fixture; the healthy live strip claims nothing else.
  it('shows the v4 generation badge and an otherwise quiet strip for the live fixture', async () => {
    const fixture = TestBed.createComponent(App);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const badge = el.querySelector<HTMLAnchorElement>('a.strip-generation')!;
    expect(badge.textContent?.trim()).toBe('v4');
    expect(badge.getAttribute('href')).toBe('https://native-federation.com/');
    expect(badge.target).toBe('_blank');
    expect(el.querySelectorAll('.strip-entry')).toHaveLength(0);
  });

  // share-pools T6-AC-04/06: the Pools tab appears only for a
  // capture carrying pool tags (a pool or an orphan tag).
  it('shows the Pools tab only when the capture carries pool tags', async () => {
    const navOf = async (id: FixtureId) => {
      TestBed.overrideProvider(SNAPSHOT_PROVIDER, { useValue: new SequenceSnapshotProvider([id]) });
      const fixture = TestBed.createComponent(App);
      await settle(fixture);
      return Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.shell-nav a'),
      ).map((a) => a.textContent?.trim());
    };
    expect(await navOf('pool-tag-orphan')).toEqual([
      'Packages',
      'Remotes',
      'Import Map',
      'Graph',
      'Pools',
    ]);
  });

  it('hides the Pools tab without pool tags', async () => {
    TestBed.overrideProvider(SNAPSHOT_PROVIDER, {
      useValue: new SequenceSnapshotProvider(['frankenstein-live']),
    });
    const fixture = TestBed.createComponent(App);
    await settle(fixture);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Pools');
  });

  // T8-AC-08: lab fixtures carry the v4.5 generation.
  it('shows the v4.5 generation badge for a lab fixture', async () => {
    TestBed.overrideProvider(SNAPSHOT_PROVIDER, {
      useValue: new SequenceSnapshotProvider(['clean-skip']),
    });
    const fixture = TestBed.createComponent(App);
    await settle(fixture);
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.strip-generation')
        ?.textContent?.trim(),
    ).toBe('v4.5');
  });

  // T8-AC-05: a not-recognized channel renders in warning tone with the
  // reason verbatim as tooltip; the capture meta stays visible.
  it('renders not-recognized channels as warnings with the verbatim reason', async () => {
    const provider = new SequenceSnapshotProvider(['synthetic-not-recognized']);
    TestBed.overrideProvider(SNAPSHOT_PROVIDER, { useValue: provider });
    const fixture = TestBed.createComponent(App);
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.shell-status')?.textContent).toContain('synthetic-fixture.example');
    const warnings = Array.from(el.querySelectorAll<HTMLElement>('.strip-warning'));
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].title).toBe('global present but carries none of the four repository keys');
  });

  // The shell refresh re-invokes captureSnapshot() through the single
  // store; meta and strip follow the refreshed snapshot.
  it('refresh re-captures through the shared store', async () => {
    const provider = new SequenceSnapshotProvider(['frankenstein-live', 'synthetic-empty-page']);
    TestBed.overrideProvider(SNAPSHOT_PROVIDER, { useValue: provider });
    const fixture = TestBed.createComponent(App);
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(provider.calls).toBe(1);
    expect(el.querySelector('.shell-status')?.textContent).toContain('frankenstein-meeting-room');

    el.querySelector<HTMLButtonElement>('.shell-refresh')!.click();
    await settle(fixture);

    expect(provider.calls).toBe(2);
    expect(el.querySelector('.shell-status')?.textContent).toContain('synthetic-fixture.example');
    // The empty page collapses to the no-federation summary (a normal
    // state), with no warnings and no per-tab entries.
    expect(el.querySelector('.strip-none')?.textContent).toContain('no Native Federation detected');
    expect(el.querySelectorAll('.strip-entry')).toHaveLength(0);
    expect(el.querySelectorAll('.strip-warning')).toHaveLength(0);
  });

  // Dev environment only: the fixture picker mounts in the status line via
  // environment.shellExtras (the extension environment ships an empty list).
  it('mounts the dev fixture picker in the status line', async () => {
    const fixture = TestBed.createComponent(App);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.shell-status nf-fixture-picker select')).not.toBeNull();
  });

  // T6: clicking the button delegates to the export service.
  it('delegates the export click to the export service', async () => {
    const service = TestBed.inject(SnapshotExportService);
    const exportSpy = vi.spyOn(service, 'exportCurrent').mockImplementation(() => {});

    const fixture = TestBed.createComponent(App);
    await settle(fixture);
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.shell-export')!
      .click();

    expect(exportSpy).toHaveBeenCalledTimes(1);
  });
});

// T2: dev mode serves fixture-backed snapshots through the real DI wiring.
describe('appConfig snapshot provider', () => {
  it('provides the primary fixture snapshot', async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers] });
    const provider = TestBed.inject(SNAPSHOT_PROVIDER);
    const snapshot = await provider.captureSnapshot();
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.capture.mode).toBe('passive');
    expect(Object.keys(snapshot.runtime!.remotes)).toContain('whiteboard');
    expect(PRIMARY_FIXTURE_ID).toBe('frankenstein-live');
  });
});
