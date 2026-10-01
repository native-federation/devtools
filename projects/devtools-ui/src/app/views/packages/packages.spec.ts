/**
 * Packages view specs — the component half of the T7.5 redesign: templates
 * render vm rows only, UI state wiring (status × participant filter),
 * canonical IDs seed the selection through the Store façade, plus DOM-level
 * checks of the copy-block presentation: deviation-only annotations with
 * grounded tooltips, default qualifiers as tooltip data, per-file SRI, the
 * unresolved bucket, and cross-link hrefs. T7.10 adds the entrypoint level:
 * muted sub-rows for dense secondaries (excluded from the All count, click
 * selects the parent), the `secondary entrypoint only` head fact, and the
 * three level-vocabulary tooltips.
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
    expect(scopeName.title).toBe('__GLOBAL__');
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

  // T7.5-AC-01 (DOM half): one copy block, none of the removed sections,
  // default qualifiers only in tooltips, per-file SRI, nested chunk files.
  it('renders the signals package as one copy block without the legacy sections', async () => {
    const { fixture } = await createView({
      fixture: 'frankenstein-live',
      select: '__GLOBAL__|@angular/core/primitives/signals',
    });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.copy-block')).toHaveLength(1);
    // The five legacy sections are gone — no headings render at all here.
    expect(el.querySelectorAll('.pkg-detail h3')).toHaveLength(0);
    for (const heading of ['Resolution', 'Negotiation', 'Resolved copies', 'Integrity']) {
      expect(el.querySelector('.pkg-detail')!.textContent).not.toContain(heading);
    }
    // Header: tag · shared · from [host]; default qualifiers as tooltips.
    const head = el.querySelector<HTMLElement>('.copy-head')!;
    expect(head.querySelector('.copy-tag')?.textContent).toBe('21.2.12');
    expect(head.querySelector('.copy-disposition')?.textContent).toBe('shared');
    expect(head.querySelector<HTMLElement>('.copy-disposition')?.title).toContain(
      'ordinary-shared',
    );
    // T7.6-AC-03: the connective reads 'from'; the qualifier stays tooltip data.
    expect(head.querySelector('.source-word')?.textContent).toBe('from');
    expect(head.querySelector<HTMLElement>('.source-word')?.title).toContain('exact target source');
    expect(el.querySelector('.pkg-detail')!.textContent).not.toContain('exact target source');
    expect(el.querySelector('.pkg-detail')!.textContent).not.toContain('ordinary-shared');
    // File line: name, mapped cross-link, SRI marker.
    const fileLine = el.querySelector<HTMLElement>('.file-line')!;
    expect(fileLine.querySelector('.file-name')?.textContent).toBe(
      '_angular_core_primitives_signals.ePwPWbaXlE.js',
    );
    expect(fileLine.querySelector('.file-sri')?.textContent).toBe('SRI ✓');
    // Consumer row: chip + range + STRICT, no state chips (happy path).
    const consumer = el.querySelector<HTMLElement>('.consumer-row')!;
    expect(consumer.querySelector('.chip')?.textContent).toBe('host');
    expect(consumer.querySelector('.consumer-declared')?.textContent).toBe('^21.2.0');
    expect(consumer.querySelector('.consumer-strict')?.textContent).toBe('STRICT');
    expect(stateChipsOf(el)).toEqual([]);
    // T7.6-AC-04: consumers and chunks sit under group labels; file list,
    // both labels, and the chunk claims are direct siblings under the block
    // (one CHUNKS label per block, bundle heads as rows beneath).
    const block = el.querySelector<HTMLElement>('.copy-block')!;
    expect(
      Array.from(block.querySelectorAll(':scope > .group-label')).map((label) => label.textContent),
    ).toEqual(['files', 'declared by', 'chunks']);
    expect(block.querySelector(':scope > .file-list')).not.toBeNull();
    expect(block.querySelector(':scope > .chunk-claim')).not.toBeNull();
    expect(block.querySelector('.chunk-claim .group-label')).toBeNull();
    // The arrow glyph is gone — 'resolves to' stays participant-row kit
    // vocabulary and does not leak into the copy block.
    expect(block.textContent).not.toContain('→');
    // T7.6-AC-05: STRICT is a configuration fact — muted like the declared
    // range, never warning-colored.
    expect(getComputedStyle(consumer.querySelector('.consumer-strict')!).color).toBe(
      getComputedStyle(consumer.querySelector('.consumer-declared')!).color,
    );
    // Chunks nest inside the block: five files, unqualified (mapped-source).
    expect(el.querySelectorAll('.copy-block .chunk-item')).toHaveLength(5);
    expect(el.querySelector('.chunk-status')).toBeNull();
    expect(el.querySelector<HTMLElement>('.chunk-list')?.title).toContain('available for loading');
  });

  // T7.5-AC-02 (DOM half): skip renders as a grounded row annotation; the
  // absent SRI stays a quiet, visible observation.
  it('renders the clean-skip block with the skipped-own annotation and no skip section', async () => {
    const { fixture } = await createView({ fixture: 'clean-skip', select: CONFLICT_LIB });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.copy-block')).toHaveLength(1);
    expect(stateChipsOf(el)).toEqual(['skipped own 1.0.0']);
    const skipChip = el.querySelector<HTMLElement>('.pkg-detail .state-chip')!;
    expect(skipChip.title).toContain('registered with action skip');
    expect(el.querySelector('.file-sri-missing')?.textContent).toBe('no SRI');
    // No glyph legend, no action glyphs — the annotation is the trace.
    expect(el.querySelector('.glyph-legend')).toBeNull();
    expect(el.textContent).not.toContain('●');
    expect(el.querySelector('.unresolved-heading')).toBeNull();
  });

  // T7.9-AC-01 (DOM half): the outcome tooltip is the rendered title
  // attribute and names the consumer's own registered file; the visible
  // chip text stays the outcome label alone.
  it('grounds the skipped-own tooltip in the own registered file', async () => {
    const { fixture } = await createView({ fixture: 'clean-skip', select: CONFLICT_LIB });
    const el = fixture.nativeElement as HTMLElement;

    const skipChip = el.querySelector<HTMLElement>('.pkg-detail .state-chip')!;
    expect(skipChip.textContent).toBe('skipped own 1.0.0');
    expect(skipChip.title).toBe(
      'own copy _nf_lab_conflict_lib.JF7uEdSVsN.js (1.0.0) is registered with action skip — the consumer resolves to the elected copy',
    );
  });

  // T7.5-AC-03 (DOM half): two blocks under the multiplicity header; the
  // row compresses to the ⚠ glyph with the rule in its tooltip.
  it('renders strict-split as two versions with their notes and two copy blocks', async () => {
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
    const blocks = Array.from(el.querySelectorAll<HTMLElement>('.copy-block'));
    expect(blocks).toHaveLength(2);
    expect(blocks[0].querySelector('.copy-tag')?.textContent).toBe('2.0.0');
    expect(blocks[0].querySelector('.copy-disposition')?.textContent).toBe('shared');
    expect(blocks[1].querySelector('.copy-tag')?.textContent).toBe('1.0.0');
    expect(blocks[1].querySelector('.copy-disposition')?.textContent).toBe('isolated');
    expect(blocks[1].querySelector('.copy-audience')?.textContent).toBe('mapped only for mfe3');
    expect(stateChipsOf(el)).toEqual(['skipped own 1.0.0', 'kept own copy']);
    // T7.6-AC-04: the sparse isolated block (one consumer row, no chunk
    // list) still renders both group labels.
    expect(
      Array.from(blocks[1].querySelectorAll(':scope > .group-label')).map(
        (label) => label.textContent,
      ),
    ).toEqual(['files', 'declared by', 'chunks']);
    expect(blocks[1].querySelectorAll('.consumer-row')).toHaveLength(1);
    expect(blocks[1].querySelector('.chunk-list')).toBeNull();
    // T7.6-AC-05: STRICT stays muted alongside the declared range.
    const strictColor = getComputedStyle(el.querySelector('.consumer-strict')!).color;
    expect(strictColor).toBe(getComputedStyle(el.querySelector('.consumer-declared')!).color);

    // Row: one mark per deviation with its reason, and the copy count.
    const marks = Array.from(el.querySelectorAll<HTMLElement>('.pkg-marks .mark-dot'));
    expect(marks.map((mark) => mark.className)).toEqual([
      'mark-dot mark-out-of-range',
      'mark-dot mark-isolated',
    ]);
    expect(marks[1].title).toBe('mfe3 keeps its own copy');
    const copies = el.querySelector<HTMLElement>('.pkg-copies')!;
    expect(copies.textContent).toBe('2 copies');
    expect(copies.title).toBe('2 copies mapped: 2.0.0 (global), 1.0.0 (global)');

    const multiButton = Array.from(el.querySelectorAll<HTMLButtonElement>('.filter-button')).find(
      (button) => button.textContent?.includes('Multiple versions'),
    )!;
    expect(multiButton.textContent?.trim()).toBe('Multiple versions (1)');
    multiButton.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.tree-row')).toHaveLength(1);
  });

  // T7.8-AC-03 (XC-06): the dense multi-entry fixture is the end-to-end
  // witness for the plural FILES group — until now only synthetic VM seeds
  // exercised it. One block, ONE files label, two file lines; the secondary
  // line names its specifier, the parent line (specifier == package name)
  // stays unlabeled.
  it('renders the dense multi-entry copy as one block with two FILES lines', async () => {
    const { fixture } = await createView({
      fixture: 'synthetic-dense-entries',
      select: '__GLOBAL__|@nf-lab/dense-lib',
    });
    const el = fixture.nativeElement as HTMLElement;

    const blocks = Array.from(el.querySelectorAll<HTMLElement>('.copy-block'));
    expect(blocks).toHaveLength(1);
    expect(el.querySelector('.detail-conflict')).toBeNull();
    const block = blocks[0];
    expect(block.querySelector('.copy-tag')?.textContent).toBe('1.2.0');
    const labels = Array.from(block.querySelectorAll(':scope > .group-label')).map(
      (label) => label.textContent,
    );
    // No chunks group: the fixture carries no bundle/chunk evidence at all.
    expect(labels).toEqual(['files', 'declared by']);

    const lines = Array.from(block.querySelectorAll<HTMLElement>('.file-line'));
    expect(lines).toHaveLength(2);
    expect(lines[0].querySelector('.file-specifier')).toBeNull();
    expect(lines[0].querySelector('.file-name')?.textContent).toBe(
      '_nf_lab_dense_lib.h4PpYcAsEa.js',
    );
    expect(lines[1].querySelector('.file-specifier')?.textContent).toBe(
      '@nf-lab/dense-lib/secondary',
    );
    expect(lines[1].querySelector('.file-name')?.textContent).toBe(
      '_nf_lab_dense_lib_secondary.s3CnDaRyEa.js',
    );
    // Both lines belong to the one copy: a single declaring consumer row.
    expect(block.querySelectorAll('.consumer-row')).toHaveLength(1);
    expect(block.querySelector('.consumer-row .chip')?.textContent).toBe('mfe-dense');
    // T7.10-AC-03: the happy dense block (parent + secondary) carries no
    // secondary-only head fact.
    expect(block.querySelector('.copy-fact')).toBeNull();
  });

  // T7.8-AC-04 (DOM half): the deviating secondary split into its own
  // registration under the same registry key — two separate blocks, each
  // with its own FILES group, never one merged block.
  it('renders the split secondary as its own block, never merged', async () => {
    const { fixture } = await createView({
      fixture: 'synthetic-dense-entries',
      select: '__GLOBAL__|@nf-lab/split-lib',
    });
    const el = fixture.nativeElement as HTMLElement;

    const blocks = Array.from(el.querySelectorAll<HTMLElement>('.copy-block'));
    expect(blocks).toHaveLength(2);
    const parentBlock = blocks.find(
      (block) => block.querySelector('.copy-tag')?.textContent === '3.0.0',
    )!;
    const secondaryBlock = blocks.find(
      (block) => block.querySelector('.copy-tag')?.textContent === '3.1.4',
    )!;
    expect(parentBlock.querySelectorAll('.file-line')).toHaveLength(1);
    expect(parentBlock.querySelector('.file-specifier')).toBeNull();
    expect(secondaryBlock.querySelectorAll('.file-line')).toHaveLength(1);
    expect(secondaryBlock.querySelector('.file-specifier')?.textContent).toBe(
      '@nf-lab/split-lib/secondary',
    );
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

  // T7.10-AC-03/-AC-04 (DOM half): the secondary-only head fact renders with
  // its grounded tooltip on the split block, and the detail-head/DECLARED BY
  // level tooltips render without changing the visible text.
  it('grounds the secondary-only head fact and the level-vocabulary tooltips', async () => {
    const { fixture } = await createView({
      fixture: 'synthetic-dense-entries',
      select: '__GLOBAL__|@nf-lab/split-lib',
    });
    const el = fixture.nativeElement as HTMLElement;

    const blocks = Array.from(el.querySelectorAll<HTMLElement>('.copy-block'));
    const secondaryBlock = blocks.find(
      (block) => block.querySelector('.copy-tag')?.textContent === '3.1.4',
    )!;
    const fact = secondaryBlock.querySelector<HTMLElement>('.copy-fact')!;
    expect(fact.textContent).toBe('secondary entrypoint only');
    expect(fact.title).toBe(
      'this copy serves @nf-lab/split-lib/secondary — the package’s own specifier @nf-lab/split-lib does not resolve to it in this capture; the tag names the entrypoint’s registration, not a version of the whole package',
    );
    const parentBlock = blocks.find(
      (block) => block.querySelector('.copy-tag')?.textContent === '3.0.0',
    )!;
    expect(parentBlock.querySelector('.copy-fact')).toBeNull();

    // T7.10-AC-04 (carriers 2 + 3): tooltips only — visible text unchanged.
    const name = el.querySelector<HTMLElement>('.detail-name-text')!;
    expect(name.textContent).toBe('@nf-lab/split-lib');
    expect(el.querySelector<HTMLElement>('.scope-tag')?.title).toBe(
      'the default share scope — no shareScope configured',
    );
    const declaredByLabels = Array.from(el.querySelectorAll<HTMLElement>('.group-label')).filter(
      (label) => label.textContent === 'declared by',
    );
    expect(declaredByLabels.length).toBeGreaterThan(0);
    for (const label of declaredByLabels) {
      expect(label.querySelector<HTMLElement>('.tip')?.title).toBe(
        'participants that declared this dependency and their requirements — the registration itself is the version row under the registry key',
      );
    }
  });

  // T7.10-AC-05: flat-generation captures keep their tree — secondaries as
  // own registry keys with the linked glyph, never entrypoint sub-rows.
  it('keeps the flat-generation tree free of entrypoint sub-rows', async () => {
    const { fixture } = await createView({ fixture: 'non-dense' });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.linked-glyph').length).toBeGreaterThan(0);
  });

  it('narrows the clean self-fill capture to the empty note under Multiple versions', async () => {
    const { fixture } = await createView({ fixture: 'self-fill' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.tree-row')).toHaveLength(2);

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
    const { fixture } = await createView({ fixture: 'self-fill' });
    const el = fixture.nativeElement as HTMLElement;

    const names = Array.from(el.querySelectorAll<HTMLElement>('.pkg-name'));
    expect(names.map((name) => name.textContent)).toEqual(['@nf-lab/conflict-lib', '/extra']);
    expect(names[1].title).toBe(
      '@nf-lab/conflict-lib/extra — secondary entry of @nf-lab/conflict-lib',
    );
    // Every name carries its full form, so an ellipsis never hides it.
    expect(names[0].title).toBe('@nf-lab/conflict-lib');
  });

  // Cross-link convention: the select query param seeds the selection;
  // source chips, consumer chips, and file lines carry select payloads.
  it('seeds the selection from the select param and renders cross-links', async () => {
    const { fixture } = await createView({ fixture: 'clean-skip', select: CONFLICT_LIB });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.detail-name')?.textContent).toContain('@nf-lab/conflict-lib');

    const hrefs = Array.from(el.querySelectorAll<HTMLAnchorElement>('.pkg-detail a')).map(
      (anchor) => decodeURIComponent(anchor.getAttribute('href') ?? ''),
    );
    expect(hrefs).toContain('/remotes?select=mfe2');
    expect(hrefs).toContain('/remotes?select=mfe1');
    expect(hrefs.some((href) => href.includes('/import-map?select=@nf-lab/conflict-lib'))).toBe(
      true,
    );
    // The participant chips themselves are the /remotes links.
    expect(el.querySelectorAll('.pkg-detail a.chip-link .chip').length).toBeGreaterThan(0);
  });

  it('names the config origin of scopes and the strict marker in tooltips', async () => {
    const { fixture: strictFixture } = await createView({
      fixture: 'strict-scope',
      select: 'strict|@nf-lab/conflict-lib',
    });
    const strictEl = strictFixture.nativeElement as HTMLElement;
    expect(strictEl.querySelector<HTMLElement>('.pkg-strict')?.title).toBe(
      "shareScope: 'strict' · no election, every exact version is shared side by side",
    );
    const scopeTag = strictEl.querySelector<HTMLElement>('.scope-tag')!;
    expect(scopeTag.textContent).toBe('strict');
    expect(scopeTag.title).toContain("shareScope: 'strict'");
    // The strict scope elects nothing — the head says so instead of "shares X".
    expect(strictEl.querySelector('.scope-elected')?.textContent?.trim()).toBe(
      'every exact version shared',
    );
    expect(strictEl.querySelector('.range-check')).toBeNull();
  });

  it('marks the global scope as the unconfigured default in the detail tooltip', async () => {
    const { fixture } = await createView({ fixture: 'clean-skip', select: CONFLICT_LIB });
    const el = fixture.nativeElement as HTMLElement;
    const scopeTag = el.querySelector<HTMLElement>('.scope-tag')!;
    expect(scopeTag.textContent).toBe('global');
    expect(scopeTag.title).toBe('the default share scope — no shareScope configured');
  });

  // T7.6-AC-03: the copy-head connective reads 'from' for every disposition;
  // the standalone word 'source' is gone from the copy-block DOM.
  it('reads skip-registration from [mfe1] on the pooling-anchor block', async () => {
    const { fixture } = await createView({ fixture: 'pooling-anchor', select: CONFLICT_LIB });
    const el = fixture.nativeElement as HTMLElement;

    const anchor = Array.from(el.querySelectorAll<HTMLElement>('.copy-block')).find(
      (block) => block.querySelector('.copy-tag')?.textContent === '1.0.0',
    )!;
    expect(anchor.querySelector('.copy-disposition')?.textContent).toBe('skip-registration');
    expect(anchor.querySelector('.copy-head .source-word')?.textContent).toBe('from');
    expect(anchor.querySelector('.copy-head .chip-link .chip')?.textContent).toBe('mfe1');
    // T7.7-AC-02: detail chips read the same lookup — mfe1 keeps palette
    // slot 1, identical to its toolbar chip.
    expect(
      anchor.querySelector('.copy-head .chip-link .chip .dot')?.classList.contains('dot-1'),
    ).toBe(true);
    for (const block of Array.from(el.querySelectorAll<HTMLElement>('.copy-block'))) {
      expect(block.textContent).not.toMatch(/(?<![\w-])source(?![\w-])/);
    }
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
      fixture: 'self-fill',
      select: '__GLOBAL__|@nf-lab/conflict-lib/extra',
    });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.detail-name-text')?.textContent).toContain('/extra');

    queryParams.next(convertToParamMap({ select: CONFLICT_LIB }));
    fixture.detectChanges();
    expect(el.querySelector('.detail-name-text')?.textContent?.trim()).toBe('@nf-lab/conflict-lib');
  });

  // Wording rules (T7): resolution-honest vocabulary only — "mapped",
  // "available for loading" (as grounding tooltips); never "uses", never
  // implied delivery, never a winner claim.
  it('speaks the resolution-honest vocabulary across list and detail', async () => {
    const { fixture } = await createView({
      fixture: 'frankenstein-live',
      select: '__GLOBAL__|@angular/common',
    });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.file-mapped').length).toBeGreaterThan(0);
    expect(el.querySelector<HTMLElement>('.chunk-list')?.title).toContain('available for loading');
    expect(el.textContent).not.toMatch(/\buses\b/);
    expect(el.textContent).not.toMatch(/\bloaded\b/);
    expect(el.textContent).not.toMatch(/\bwinner\b/);
    expect(el.textContent).not.toMatch(/\bprovider\b/);
  });

  it('qualifies the source-only bundle claim and claims chunk-list absence', async () => {
    const { fixture } = await createView({
      fixture: 'frankenstein-live',
      select: '__GLOBAL__|tslib',
    });
    const el = fixture.nativeElement as HTMLElement;

    const claim = el.querySelector<HTMLElement>('.chunk-claim')!;
    const status = claim.querySelector<HTMLElement>('.chunk-status')!;
    expect(status.textContent).toBe('source-only');
    expect(status.classList.contains('chunk-status-qualified')).toBe(true);
    expect(status.title).toContain('registers no chunk list');
    expect(claim.querySelector('.chunk-absence')?.textContent).toBe(
      '(no chunk list recorded in this capture)',
    );
    expect(claim.querySelector('.chunk-list')).toBeNull();
  });

  // T7.5-AC-04 (DOM half): zero blocks, the honest no-copies line, and the
  // unresolved bucket with states and offered tags.
  it('renders the honest empty detail with the unresolved bucket', async () => {
    const { fixture } = await createView({
      fixture: 'synthetic-multi-version',
      select: '__GLOBAL__|ui-lib',
    });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.pkg-copies')?.textContent).toBe('no copy');
    expect(el.querySelector('.pkg-marks')).toBeNull();
    expect(el.querySelectorAll('.copy-block')).toHaveLength(0);
    expect(el.querySelector('.no-copies')?.textContent).toBe('no resolved copies in this capture');
    expect(el.querySelector('.unresolved-heading')?.textContent).toBe('unresolved');
    // The bucket keeps its own heading — no DECLARED BY label (T7.6-AC-04).
    expect(el.querySelector('.unresolved-list .group-label')).toBeNull();
    expect(stateChipsOf(el)).toEqual(['not mapped', 'not mapped']);
    const offered = Array.from(el.querySelectorAll<HTMLElement>('.offered-chip'));
    expect(offered.map((chip) => chip.textContent)).toEqual(['offered 1.2.3', 'offered 2.0.0']);
    expect(offered[0].title.length).toBeGreaterThan(0);
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
    expect(el.querySelector('tbody.dive .facts')?.textContent).toContain(
      'for every remote in this scope',
    );

    // Enter on another row moves the single open dive there.
    rows()[2].focus();
    rows()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(rows()[0].getAttribute('aria-expanded')).toBe('false');
    expect(rows()[2].getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(rows()[2]);
    expect(el.querySelector('tbody.dive .shipped')?.textContent).toContain('out of range');

    rows()[2].click();
    fixture.detectChanges();
    expect(el.querySelector('tbody.dive')).toBeNull();
  });

  it('links the torn banner to the docs in a new tab', async () => {
    const { fixture } = await createView({
      fixture: 'torn-many',
      select: '__GLOBAL__|@nf-lab/kit',
    });
    const el = fixture.nativeElement as HTMLElement;
    const link = el.querySelector<HTMLAnchorElement>('.torn-banner a')!;
    expect(link.href).toContain('version-resolver/#entrypoint-coverage-and-tearing');
    expect(link.target).toBe('_blank');
    expect(el.querySelector<HTMLElement>('.torn-word')?.title).toContain('Torn:');
  });

  it('renders an honest observation when no snapshot is captured', async () => {
    const { fixture } = await createView({ fixture: null });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('no captured snapshot to render');
    expect(el.querySelector('.tree-row')).toBeNull();
  });
});
