/**
 * Packages view specs — the component half of the T7.5 redesign: templates
 * render vm rows only, UI state wiring (status × participant filter),
 * canonical IDs seed the selection through the Store façade, plus DOM-level
 * checks of the bindings section (no-copies line, unresolved bucket) and
 * cross-link hrefs. T7.10 adds the entrypoint level: muted sub-rows for
 * dense secondaries (excluded from the All count, click selects the parent)
 * and the three level-vocabulary tooltips.
 */
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, ParamMap, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import {
  FIXTURES,
  FixtureId,
  SNAPSHOT_PROVIDER,
  SnapshotProvider,
  SnapshotV1,
} from 'devtools-bridge';

import { provideParticipantColors } from '../../shared/store/participant-colors-provider';
import { PackagesView } from './packages';

class FixtureSnapshotProvider implements SnapshotProvider {
  constructor(private readonly id: FixtureId | null) {}

  captureSnapshot(): Promise<SnapshotV1> {
    return this.id === null
      ? Promise.reject(new Error('capture failed'))
      : Promise.resolve(structuredClone(FIXTURES[this.id]));
  }
}

/** Flush the store's pending capture promise, then re-render. */
async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function createView(options: { fixture: FixtureId | null; select?: string }) {
  // Live query params: within-/packages navigation reuses the component and
  // only emits on this observable — the stub must model that.
  const queryParams = new BehaviorSubject<ParamMap>(
    convertToParamMap(options.select === undefined ? {} : { select: options.select }),
  );
  await TestBed.configureTestingModule({
    imports: [PackagesView],
    providers: [
      provideRouter([]),
      // Mirrors the app.config.ts binding — identity-dot pins run against
      // the real store-backed lookup.
      provideParticipantColors(),
      { provide: SNAPSHOT_PROVIDER, useValue: new FixtureSnapshotProvider(options.fixture) },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: queryParams.value },
          queryParamMap: queryParams.asObservable(),
        },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(PackagesView);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, queryParams };
}

const CONFLICT_LIB = '__GLOBAL__|@nf-lab/conflict-lib';

/** Rendered state-chip labels of the detail pane, DOM order. */
function stateChipsOf(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll<HTMLElement>('.pkg-detail .state-chip')).map((chip) =>
    chip.textContent!.trim(),
  );
}

describe('PackagesView', () => {
  // Flat leaf list, reduced to name + resolved versions: no participant
  // chips on rows — the participant axis lives in the filter zone.
  it('renders one minimal flat leaf row per (scope, package) of the live fixture', async () => {
    const { fixture } = await createView({ fixture: 'frankenstein-live' });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.tree-row')).toHaveLength(20);
    expect(el.querySelectorAll('.twisty')).toHaveLength(0);
    // Rows carry no participant chips anymore (T7.5-AC-05).
    expect(el.querySelectorAll('.tree-row .chip')).toHaveLength(0);
    // The __GLOBAL__ sentinel reads as 'global'; verbatim stays in the tooltip.
    const scopeName = el.querySelector<HTMLElement>('.scope-name')!;
    expect(scopeName.textContent).toBe('global');
    expect(scopeName.dataset['tip']).toBe('__GLOBAL__');
    expect(el.textContent).not.toContain('__GLOBAL__');
    // Linked secondaries render the glyph, no visible rule chip.
    expect(el.querySelectorAll('.linked-glyph').length).toBeGreaterThan(0);
    expect(el.textContent).not.toContain('name-derived');

    // T7.7-AC-02 (cross-view witness): the live fixture's filter chips carry
    // the exact slots remotes.spec and import-map.spec pin for these names
    // (mermaid → 1, whiteboard → 2) — same lookup, same fixture, three views.
    const chips = Array.from(el.querySelectorAll<HTMLElement>('.participant-toggle .chip-remote'));
    const chipOf = (name: string) => chips.find((chip) => chip.textContent === name)!;
    expect(chipOf('mermaid').querySelector('.dot')?.classList.contains('dot-1')).toBe(true);
    expect(chipOf('whiteboard').querySelector('.dot')?.classList.contains('dot-2')).toBe(true);
  });

  // T7.5-AC-05: the participant filter renders every involved participant
  // as a single-select chip toggle and combines with the status filter.
  it('filters by participant via single-select chips (on / off / switch)', async () => {
    const { fixture } = await createView({ fixture: 'pooling-anchor' });
    const el = fixture.nativeElement as HTMLElement;

    const toggles = Array.from(el.querySelectorAll<HTMLButtonElement>('.participant-toggle'));
    expect(toggles.map((toggle) => toggle.textContent!.trim())).toEqual(['host', 'mfe1', 'mfe2']);
    const hostToggle = toggles[0];
    expect(hostToggle.querySelector<HTMLElement>('.chip-host')?.title).toBe('__NF-HOST__');
    expect(el.querySelectorAll('.tree-row')).toHaveLength(2);

    // T7.7-AC-02/-AC-04: identity dots from the one sorted-name lookup
    // (mfe1 → slot 1, mfe2 → slot 2); the host chip never carries a dot.
    expect(toggles[1].querySelector('.chip .dot')?.classList.contains('dot-1')).toBe(true);
    expect(toggles[2].querySelector('.chip .dot')?.classList.contains('dot-2')).toBe(true);
    expect(hostToggle.querySelector('.dot')).toBeNull();

    // T7.6-AC-01: buttons + chips form one filter zone with a visible divider
    // between them; the scopes summary ends the zone's last line, pushed to
    // the right edge via its auto margin (packages-verdicts T7: inside the
    // zone, so a wrapped toolbar stays two lines).
    const zone = el.querySelector<HTMLElement>('.filter-zone')!;
    expect(zone.querySelector('.filter-group')).not.toBeNull();
    expect(zone.querySelector('.participant-filter')).not.toBeNull();
    expect(zone.lastElementChild?.classList.contains('scopes-summary')).toBe(true);
    expect(getComputedStyle(el.querySelector('.participant-filter')!).borderLeftWidth).toBe('1px');
    expect(getComputedStyle(el.querySelector('.scopes-summary')!).marginLeft).toBe('auto');

    // on: narrow to the packages the host is involved in
    hostToggle.click();
    fixture.detectChanges();
    expect(hostToggle.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelectorAll('.tree-row')).toHaveLength(1);

    // switch: another chip replaces the selection
    toggles[2].click();
    fixture.detectChanges();
    expect(hostToggle.getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelectorAll('.tree-row')).toHaveLength(2);

    // off: clicking the active chip clears the filter
    toggles[2].click();
    fixture.detectChanges();
    expect(toggles[2].getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelectorAll('.tree-row')).toHaveLength(2);
  });

  // Every declaration resolves, so nothing beyond the versions renders: no bindings section.
  it('renders no bindings section when every declaration resolves', async () => {
    const { fixture } = await createView({ fixture: 'clean-skip', select: CONFLICT_LIB });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('nf-package-detail')).toBeNull();
    expect(el.querySelector('.unresolved-heading')).toBeNull();
    expect(el.textContent).not.toContain('Bindings per copy');
  });

  // T7.5-AC-03 (DOM half): two versions with their notes; the row compresses to
  // one mark per deviation with the reason in its tooltip.
  it('renders strict-split as two versions with their notes', async () => {
    const { fixture } = await createView({ fixture: 'strict-split', select: CONFLICT_LIB });
    const el = fixture.nativeElement as HTMLElement;

    const versions = Array.from(el.querySelectorAll<HTMLElement>('tbody.version'));
    expect(versions.map((v) => v.querySelector('.version-tag')?.textContent)).toEqual([
      '2.0.0',
      '1.0.0',
    ]);
    expect(
      Array.from(versions[1].querySelectorAll('.version-note')).map((n) => n.textContent),
    ).toEqual(['mfe1 out of range', 'mfe3 own copy']);
    expect(versions[0].querySelectorAll('.version-note')).toHaveLength(0);
    // Row: one mark per deviation with its reason, and the copy count.
    const marks = Array.from(el.querySelectorAll<HTMLElement>('.pkg-marks .mark-dot'));
    expect(marks.map((mark) => mark.className)).toEqual([
      'mark-dot mark-out-of-range',
      'mark-dot mark-isolated',
    ]);
    expect(marks[1].dataset['tip']).toBe('mfe3 keeps its own copy');
    const copies = el.querySelector<HTMLElement>('.pkg-copies')!;
    expect(copies.textContent).toBe('2 copies');
    expect(copies.dataset['tip']).toBe('2 copies mapped: 2.0.0 (global), 1.0.0 (global)');

    const multiButton = Array.from(el.querySelectorAll<HTMLButtonElement>('.filter-button')).find(
      (button) => button.textContent?.includes('Multiple versions'),
    )!;
    expect(multiButton.textContent?.trim()).toBe('Multiple versions (1)');
    multiButton.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.tree-row')).toHaveLength(1);
  });

  // packages-verdicts T4: dense secondaries are no registry keys and grow no
  // list rows; they live in the version deep dive.
  it('lists dense packages as one row each, without entrypoint sub-rows', async () => {
    const { fixture } = await createView({ fixture: 'synthetic-dense-entries' });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.tree-row')).toHaveLength(2);
    const allButton = Array.from(el.querySelectorAll<HTMLButtonElement>('.filter-button')).find(
      (button) => button.textContent?.includes('All'),
    )!;
    expect(allButton.textContent?.trim()).toBe('All (2)');

    const rows = Array.from(el.querySelectorAll<HTMLElement>('.tree-row'));
    rows[1].click();
    fixture.detectChanges();
    expect(el.querySelector('.detail-name-text')?.textContent?.trim()).toBe('@nf-lab/split-lib');
    expect(rows[1].getAttribute('aria-selected')).toBe('true');
  });

  // T7.10-AC-05: flat-generation captures keep their tree — secondaries as
  // own registry keys with the linked glyph, never entrypoint sub-rows.
  it('keeps the flat-generation tree free of entrypoint sub-rows', async () => {
    const { fixture } = await createView({ fixture: 'non-dense' });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.linked-glyph').length).toBeGreaterThan(0);
  });

  it('narrows a single-version capture to the empty note under Multiple versions', async () => {
    const { fixture } = await createView({ fixture: 'dense-chunking-only' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.tree-row')).toHaveLength(3);

    const multiButton = Array.from(el.querySelectorAll<HTMLButtonElement>('.filter-button')).find(
      (button) => button.textContent?.includes('Multiple versions'),
    )!;
    expect(multiButton.textContent?.trim()).toBe('Multiple versions (0)');
    multiButton.click();
    fixture.detectChanges();

    expect(el.querySelectorAll('.tree-row')).toHaveLength(0);
    expect(el.textContent).toContain('no packages with multiple versions in this capture');
  });

  // Linked sibling carries its association as a tooltip on the name.
  it('renders the linked sibling with a name tooltip instead of a chip', async () => {
    const { fixture } = await createView({ fixture: 'dense-chunking-only' });
    const el = fixture.nativeElement as HTMLElement;

    const names = Array.from(el.querySelectorAll<HTMLElement>('.pkg-name'));
    expect(names.map((name) => name.textContent)).toEqual([
      '@nf-lab/dense-lib',
      '/extra',
      '@nf-lab/utils',
    ]);
    expect(names[1].dataset['tip']).toBe(
      '@nf-lab/dense-lib/extra — secondary entry of @nf-lab/dense-lib',
    );
    // Every name carries its full form, so an ellipsis never hides it.
    expect(names[0].dataset['tip']).toBe('@nf-lab/dense-lib');
  });

  it('seeds the selection from the select param and renders cross-links', async () => {
    const { fixture } = await createView({ fixture: 'clean-skip', select: CONFLICT_LIB });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.detail-name')?.textContent).toContain('@nf-lab/conflict-lib');
    el.querySelector<HTMLElement>('tbody.version')!.click();
    fixture.detectChanges();

    const hrefs = Array.from(el.querySelectorAll<HTMLAnchorElement>('tbody.dive a')).map((anchor) =>
      decodeURIComponent(anchor.getAttribute('href') ?? ''),
    );
    expect(hrefs.some((href) => href.startsWith('/remotes?select='))).toBe(true);
    // Each entrypoint opens the Import Map at its specifier.
    expect(hrefs).toContain('/import-map?select=@nf-lab/conflict-lib');
    // The participant chips themselves are the /remotes links.
    expect(el.querySelectorAll('tbody.dive a.chip-link .chip').length).toBeGreaterThan(0);
  });

  it('names the config origin of scopes and the strict marker in tooltips', async () => {
    const { fixture: strictFixture } = await createView({
      fixture: 'strict-scope',
      select: 'strict|@nf-lab/conflict-lib',
    });
    const strictEl = strictFixture.nativeElement as HTMLElement;
    expect(strictEl.querySelector<HTMLElement>('.pkg-strict')?.dataset['tip']).toBe(
      "shareScope: 'strict' · no election, every exact version is shared side by side",
    );
    const scopeTag = strictEl.querySelector<HTMLElement>('.scope-tag')!;
    expect(scopeTag.textContent).toBe('strict');
    expect(scopeTag.dataset['tip']).toContain("shareScope: 'strict'");
    // The strict scope elects nothing — the head says so instead of "shares X".
    expect(strictEl.querySelector('.scope-elected')?.textContent?.trim()).toBe(
      'every exact version shared',
    );
    expect(strictEl.querySelector('.range-check')).not.toBeNull();
  });

  it('marks the global scope as the unconfigured default in the detail tooltip', async () => {
    const { fixture } = await createView({ fixture: 'clean-skip', select: CONFLICT_LIB });
    const el = fixture.nativeElement as HTMLElement;
    const scopeTag = el.querySelector<HTMLElement>('.scope-tag')!;
    expect(scopeTag.textContent).toBe('global');
    expect(scopeTag.dataset['tip']).toBe('the default share scope — no shareScope configured');
  });

  it('selects a package on row click', async () => {
    const { fixture } = await createView({ fixture: 'clean-skip' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.detail-name')).toBeNull();

    el.querySelector<HTMLElement>('.tree-row')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.detail-name')?.textContent).toContain('@nf-lab/conflict-lib');
  });

  // T7.5-AC-06: the parent cross-link navigates WITHIN /packages, where the
  // router reuses the component — the selection must follow later
  // query-param emissions, not only the creation snapshot.
  it('follows later select query-param emissions (parent link within /packages)', async () => {
    const { fixture, queryParams } = await createView({
      fixture: 'dense-chunking-only',
      select: '__GLOBAL__|@nf-lab/dense-lib/extra',
    });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.detail-name-text')?.textContent).toContain('/extra');

    queryParams.next(convertToParamMap({ select: '__GLOBAL__|@nf-lab/dense-lib' }));
    fixture.detectChanges();
    expect(el.querySelector('.detail-name-text')?.textContent?.trim()).toBe('@nf-lab/dense-lib');
  });

  it('speaks the resolution-honest vocabulary across list and detail', async () => {
    const { fixture } = await createView({
      fixture: 'frankenstein-live',
      select: '__GLOBAL__|@angular/common',
    });
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLElement>('tbody.version')!.click();
    fixture.detectChanges();

    expect(el.querySelectorAll('tbody.dive .file-link').length).toBeGreaterThan(0);
    expect(el.textContent).not.toMatch(/\buses\b/);
    expect(el.textContent).not.toMatch(/\bloaded\b/);
    expect(el.textContent).not.toMatch(/\bwinner\b/);
    expect(el.textContent).not.toMatch(/\bprovider\b/);
  });

  // A bundle the capture lists no chunks for says so beside the files, never implying none exist.
  it('claims chunk-list absence beside the files', async () => {
    const { fixture } = await createView({
      fixture: 'frankenstein-live',
      select: '__GLOBAL__|tslib',
    });
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLElement>('tbody.version')!.click();
    fixture.detectChanges();

    const unlisted = el.querySelector<HTMLElement>('tbody.dive .unlisted')!;
    expect(unlisted.textContent).toBe('no chunk list');
    expect(unlisted.dataset['tip']).toContain('registers no chunk list');
  });

  // T7.5-AC-04 (DOM half): the honest no-copies line and the
  // unresolved bucket with states and offered tags.
  it('renders the honest empty detail with the unresolved bucket', async () => {
    const { fixture } = await createView({
      fixture: 'synthetic-multi-version',
      select: '__GLOBAL__|ui-lib',
    });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.pkg-copies')?.textContent).toBe('no copy');
    expect(el.querySelector('.pkg-marks')).toBeNull();
    expect(el.querySelector('.no-copies')?.textContent?.trim()).toBe(
      'no resolved copies in this capture',
    );
    expect(el.querySelector('.unresolved-heading')?.textContent).toBe('unresolved');
    expect(stateChipsOf(el)).toEqual(['not mapped', 'not mapped']);
    const offered = Array.from(el.querySelectorAll<HTMLElement>('.offered-chip'));
    expect(offered.map((chip) => chip.textContent)).toEqual(['offered 1.2.3', 'offered 2.0.0']);
    expect(offered[0].dataset['tip']!.length).toBeGreaterThan(0);
  });

  // T4-AC-04: a long name truncates; marks, strict tag and count never shrink.
  it('truncates long names before the marks and the copy count', async () => {
    const { fixture } = await createView({ fixture: 'multi-scope' });
    const el = fixture.nativeElement as HTMLElement;
    const name = getComputedStyle(el.querySelector('.pkg-name')!);
    expect(name.textOverflow).toBe('ellipsis');
    expect(name.overflow).toBe('hidden');
    for (const selector of ['.pkg-strict', '.pkg-copies']) {
      expect(getComputedStyle(el.querySelector(selector)!).flexShrink).toBe('0');
    }
  });

  // T6-AC-03: a version row opens its deep dive inline (click or Enter), one
  // per scope block, and closes again; focus stays on the row.
  it('opens one version deep dive at a time per scope, by click and keyboard', async () => {
    const { fixture } = await createView({
      fixture: 'out-of-range-nonstrict',
      select: '__GLOBAL__|@nf-lab/kit',
    });
    const el = fixture.nativeElement as HTMLElement;
    const rows = () => Array.from(el.querySelectorAll<HTMLElement>('tbody.version'));
    expect(el.querySelector('tbody.dive')).toBeNull();
    expect(rows().every((row) => row.tabIndex === 0)).toBe(true);

    rows()[0].click();
    fixture.detectChanges();
    expect(rows()[0].getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelectorAll('tbody.dive')).toHaveLength(1);
    expect(el.querySelector('tbody.dive .facts')?.textContent).toContain('Served from');

    // Enter on another row moves the single open dive there.
    rows()[2].focus();
    rows()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(rows()[0].getAttribute('aria-expanded')).toBe('false');
    expect(rows()[2].getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(rows()[2]);
    expect(el.querySelector('tbody.dive .shipper-off')?.getAttribute('data-tip')).toContain(
      'out of range',
    );

    rows()[2].click();
    fixture.detectChanges();
    expect(el.querySelector('tbody.dive')).toBeNull();
  });

  it('renders an honest observation when no snapshot is captured', async () => {
    const { fixture } = await createView({ fixture: null });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('no captured snapshot to render');
    expect(el.querySelector('.tree-row')).toBeNull();
  });
});
