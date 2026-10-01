/**
 * Remotes view specs — the component half of the T8.6 zone redesign:
 * templates render vm rows only; the three zones with their honest-empty
 * lines; provides blocks without `→ own copy`, glyphs, action chips, or a
 * legend (T8.6-AC-01); consumes rows with state chips and the winner file
 * `from` the colored source chip (T8.6-AC-02/-AC-05); the pooling-anchor
 * proof case (T8.6-AC-03); the unresolved bucket and the list `⚠` marker
 * (T8.6-AC-04); cross-links, `private registrations`, the capabilities
 * meta line, and expose SRI (T8.6-AC-06). The boundary note speaks
 * capture/registry language, never delivery.
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

function groupLabelsOf(el: HTMLElement): (string | null)[] {
  return Array.from(el.querySelectorAll<HTMLElement>('.group-label')).map(
    (label) => label.textContent?.trim() ?? null,
  );
}

/** The one `.group-label` element with the given (trimmed) text. */
function groupLabelEl(el: HTMLElement, text: string): HTMLElement {
  return Array.from(el.querySelectorAll<HTMLElement>('.group-label')).find(
    (label) => label.textContent?.trim() === text,
  )!;
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
  // The live remotes render as a flat list with the host chip; sentinels
  // never as visible text; the boundary note renders in capture language.
  it('renders the three live remotes with the host chip and the boundary note', async () => {
    const fixture = await createView({ fixture: 'frankenstein-live' });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.tree-row')).toHaveLength(3);
    expect(el.querySelectorAll('.twisty')).toHaveLength(0);
    const hostChip = el.querySelector<HTMLElement>('.tree-row .chip-host')!;
    expect(hostChip.textContent).toBe('host');
    expect(hostChip.title).toBe(NF_HOST);
    expect(el.textContent).not.toContain(NF_HOST);
    // The boundary claim lives in the heading tooltip while the list has
    // rows (screenshot review) — never as permanent visible prose.
    expect(el.querySelector<HTMLElement>('h1')!.title).toContain(
      'cannot enumerate what the capture cannot see',
    );
    expect(el.textContent).not.toContain('cannot enumerate what the capture cannot see');
    expect(el.textContent).not.toContain('never loaded');
    // Every live declaration resolves — no ⚠ marker anywhere (T8.6-AC-04).
    expect(el.querySelector('.row-warn')).toBeNull();

    // T7.7-AC-02/-AC-04: identity dots from the one sorted-name lookup
    // (mermaid → slot 1, whiteboard → slot 2 — the same slots Packages and
    // Import Map render for these names); the host chip never carries one.
    const chipOf = (name: string) =>
      Array.from(el.querySelectorAll<HTMLElement>('.tree-row .chip-remote')).find(
        (chip) => chip.textContent === name,
      )!;
    expect(chipOf('mermaid').querySelector('.dot')?.classList.contains('dot-1')).toBe(true);
    expect(chipOf('whiteboard').querySelector('.dot')?.classList.contains('dot-2')).toBe(true);
    expect(hostChip.querySelector('.dot')).toBeNull();
  });

  // T8.6-AC-04 (DOM half): the ⚠ marker with its count tooltip on remotes
  // with unresolved declarations.
  it('marks remotes with unresolved declarations in the list', async () => {
    const fixture = await createView({ fixture: 'synthetic-multi-version' });
    const el = fixture.nativeElement as HTMLElement;

    const warns = Array.from(el.querySelectorAll<HTMLElement>('.tree-row .row-warn'));
    expect(warns).toHaveLength(2);
    for (const warn of warns) {
      expect(warn.textContent).toBe('⚠');
      expect(warn.title).toBe('1 declaration of this remote resolves nowhere in this capture');
    }
  });

  // T8.6-AC-06: capabilities collapse to ONE muted meta line whose words
  // carry the source-verified `(config: …)` tooltips; identity uses colon
  // meta.
  it('renders identity and capabilities as colon meta lines', async () => {
    const fixture = await createView({ fixture: 'frankenstein-live', select: NF_HOST });
    const el = fixture.nativeElement as HTMLElement;

    const name = el.querySelector<HTMLElement>('.detail-name')!;
    expect(name.textContent?.trim()).toBe('host');
    expect(name.title).toBe(NF_HOST);
    expect(el.textContent).toContain('scope URL:');
    expect(el.textContent).toContain('resolved:');

    // The badge section is gone; one meta line carries the words.
    expect(el.querySelector('.capability')).toBeNull();
    const words = Array.from(el.querySelectorAll<HTMLElement>('.capability-word'));
    expect(words.map((word) => word.textContent)).toEqual(['dense chunking', 'SRI']);
    expect(words[0].title).toBe(
      "the registry records per-bundle chunk lists for this remote; this remote's registrations carry their serving bundle (config: features.denseChunking: true, default false, since core v4.0.0)",
    );
    expect(words[1].title).toContain('(config: features.integrityHashes: true');
  });

  // T8.6-AC-01 (DOM half): provides blocks with folded head, indented
  // secondaries, honest-empty consumes, deduped chunks — and none of the
  // removed elements (own arrow, glyphs, action chips, legend).
  it('renders the dense host as provides blocks without arrows, glyphs, or legend', async () => {
    const fixture = await createView({ fixture: 'frankenstein-live', select: NF_HOST });
    const el = fixture.nativeElement as HTMLElement;

    // Removed elements stay removed.
    expect(el.textContent).not.toContain('→ own copy');
    expect(el.querySelector('.glyph-legend')).toBeNull();
    expect(el.querySelector('.action-chip')).toBeNull();
    expect(el.querySelector('.dep-symbol')).toBeNull();

    const labels = groupLabelsOf(el);
    for (const label of ['exposes', 'provides', 'consumes from other remotes', 'chunks']) {
      expect(labels).toContain(label);
    }
    // Zone doctrine sentences live in the header tooltips (screenshot
    // review) — never as permanently visible zone notes.
    expect(groupLabelEl(el, 'provides').title).toContain(
      'consumed in place unless a chip says otherwise',
    );
    // The offer-vs-resolution disambiguation (screenshot review 3).
    expect(groupLabelEl(el, 'provides').title).toContain('never here');
    expect(groupLabelEl(el, 'consumes from other remotes').title).toContain(
      'own copies under provides are consumed in place',
    );
    expect(groupLabelEl(el, 'chunks').title).toContain('one row per bundle');
    expect(groupLabelEl(el, 'chunks').title).toContain('rule: canonical-bundle-claims');
    expect(el.querySelector('.zone-note')).toBeNull();

    // Five top-level blocks; the core block indents its five secondaries.
    const blocks = Array.from(el.querySelectorAll<HTMLElement>('.provides-block'));
    expect(blocks).toHaveLength(5);
    const core = blocks.find(
      (block) => block.querySelector('.pkg-link')?.textContent === '@angular/core',
    )!;
    const subBlocks = Array.from(core.querySelectorAll<HTMLElement>('.sub-block'));
    expect(subBlocks).toHaveLength(5);
    expect(subBlocks[1].querySelector('.sub-row .pkg-link')?.textContent).toBe('/primitives/di');
    expect(subBlocks[1].querySelector<HTMLAnchorElement>('.pkg-link')?.title).toContain(
      'rule: name-derived',
    );
    // Two-line mini-block (screenshot review): the head keeps its OWN
    // version facts (never inherit-by-absence), the file renders on its
    // own file line beneath — and the parent's FILES label is gone.
    expect(subBlocks[1].querySelector('.sub-row .copy-tag')?.textContent).toBe('21.2.12');
    expect(subBlocks[1].querySelector('.sub-row .file-name')).toBeNull();
    expect(subBlocks[1].querySelector('.file-line .file-name')?.textContent).toBe(
      '_angular_core_primitives_di.QUc60-Xs6C.js',
    );
    expect(el.querySelector('.files-label')).toBeNull();
    // Head anatomy: name link · tag · own range · muted STRICT.
    const head = core.querySelector<HTMLElement>('.copy-head')!;
    expect(head.querySelector('.copy-tag')?.textContent).toBe('21.2.12');
    expect(head.querySelector('.head-declared')?.textContent).toBe('^21.2.0');
    expect(head.querySelector('.head-strict')?.textContent).toBe('STRICT');

    // Honest-empty consumes zone (unified empty grammar).
    expect(el.querySelector<HTMLElement>('.consumes-empty')?.textContent).toBe(
      'none in this capture',
    );

    // Chunk dedupe: exactly ONE browser-angular_core row with a serves tail.
    const chunkBundles = Array.from(el.querySelectorAll<HTMLElement>('.chunk-bundle')).map(
      (bundle) => bundle.textContent,
    );
    expect(chunkBundles.filter((bundle) => bundle === 'browser-angular_core')).toHaveLength(1);
    const coreRow = Array.from(el.querySelectorAll<HTMLElement>('.chunk-row')).find(
      (row) => row.querySelector('.chunk-bundle')?.textContent === 'browser-angular_core',
    )!;
    expect(coreRow.querySelector('.chunk-serves')?.textContent).toBe(
      'serves @angular/core +5 entries',
    );
    expect(coreRow.querySelectorAll('.chunk-item')).toHaveLength(5);
    // A rendered chunk list needs no count — the files ARE the claim
    // (screenshot review); the count only ever claims absence.
    expect(coreRow.querySelector('.chunk-count')).toBeNull();
    // The truncated serves tail keeps its tooltip affordance.
    expect(coreRow.querySelector('.chunk-serves')?.classList.contains('tip')).toBe(true);
    // source-only bundles stay visibly qualified — the chip ALONE claims
    // the absence (grounded note in its tooltip), no extra absence text
    // and no tooltip that would only repeat the serves tail (review 2).
    const tslibRow = Array.from(el.querySelectorAll<HTMLElement>('.chunk-row')).find(
      (row) => row.querySelector('.chunk-bundle')?.textContent === 'browser-tslib',
    )!;
    const tslibStatus = tslibRow.querySelector<HTMLElement>('.chunk-status')!;
    expect(tslibStatus.textContent).toBe('source-only');
    expect(tslibStatus.title).toContain('registers no chunk list');
    expect(tslibRow.textContent).not.toContain('no chunk list recorded in this capture');
    expect(tslibRow.querySelector('.chunk-count')).toBeNull();
    const tslibServes = tslibRow.querySelector<HTMLElement>('.chunk-serves')!;
    expect(tslibServes.textContent).toBe('serves tslib');
    expect(tslibServes.getAttribute('title')).toBeNull();
    expect(tslibServes.classList.contains('tip')).toBe(false);
  });

  // T8.6-AC-02 (DOM half): the skip consumer's consumes row — chip, winner
  // file, and the colored from-chip linking to /remotes.
  it('renders the skip consumer as a consumes row with the from-chip', async () => {
    const fixture = await createView({ fixture: 'clean-skip', select: 'mfe1' });
    const el = fixture.nativeElement as HTMLElement;

    // Provides stays honest-empty (unified empty grammar).
    expect(el.querySelector('.provides-block')).toBeNull();
    expect(el.querySelector<HTMLElement>('.provides-empty')?.textContent).toBe(
      'none in this capture',
    );

    const rows = el.querySelectorAll('.consumes-row');
    expect(rows).toHaveLength(1);
    const row = rows[0];
    const chips = Array.from(row.querySelectorAll<HTMLElement>('.state-chip'));
    expect(chips.map((chip) => chip.textContent)).toEqual(['skipped own 1.0.0']);
    expect(chips[0].title).toContain('registered with action skip');

    // Two-line mini-block (screenshot review 3): NO arrow glyph — the
    // winner file sits on its own file line, `from` the colored chip.
    expect(row.querySelector('.arrow')).toBeNull();
    const fileLine = row.querySelector<HTMLElement>('.file-line')!;
    expect(fileLine.querySelector('.file-name')?.textContent).toBe(
      '_nf_lab_conflict_lib.jvcc6K1csg.js',
    );
    expect(fileLine.getAttribute('aria-label')).toBe(
      'resolves to _nf_lab_conflict_lib.jvcc6K1csg.js (source: mfe2)',
    );
    expect(fileLine.querySelector('.source-word')?.textContent).toBe('from');
    const sourceLink = fileLine.querySelector<HTMLAnchorElement>('a.chip-link')!;
    expect(decodeURIComponent(sourceLink.getAttribute('href') ?? '')).toBe('/remotes?select=mfe2');
    expect(sourceLink.querySelector('.chip')?.textContent).toBe('mfe2');

    // No action chip, no glyph — the registry action lives in the
    // registration tooltip on the declared range (T8-H4).
    expect(el.querySelector('.action-chip')).toBeNull();
    expect(row.querySelector<HTMLElement>('.head-declared')?.title).toBe(
      'registered with action skip — the registry election does not take this copy',
    );

    // The package name IS the /packages cross-link.
    const link = row.querySelector<HTMLAnchorElement>('a.pkg-link')!;
    expect(decodeURIComponent(link.getAttribute('href') ?? '')).toBe(
      '/packages?select=__GLOBAL__|@nf-lab/conflict-lib',
    );
  });

  it('renders the selected consumer as a quiet provides block', async () => {
    const fixture = await createView({ fixture: 'clean-skip', select: 'mfe2' });
    const el = fixture.nativeElement as HTMLElement;

    const block = el.querySelector<HTMLElement>('.provides-block')!;
    expect(block.querySelector('.pkg-link')?.textContent).toBe('@nf-lab/conflict-lib');
    expect(block.querySelector('.copy-tag')?.textContent).toBe('2.0.0');
    // The norm renders no chips at all.
    expect(block.querySelector('.copy-fact')).toBeNull();
    expect(el.querySelector('.consumes-row')).toBeNull();
    expect(el.querySelector<HTMLElement>('.consumes-empty')?.textContent).toBe(
      'none in this capture',
    );
  });

  // T8.6-AC-02: the co-declared consumer renders its not-selected chip and
  // the winner file from the source chip.
  it('renders the co-declared consumer with its claim state and from-chip', async () => {
    const fixture = await createView({ fixture: 'co-declared-share', select: 'mfe2' });
    const el = fixture.nativeElement as HTMLElement;

    const row = el.querySelector<HTMLElement>('.consumes-row')!;
    const chip = row.querySelector<HTMLElement>('.state-chip')!;
    // Subject-naming chip (review 4) — a bare `not selected` next to
    // `from mfe1` read as a statement about the elected copy.
    expect(chip.textContent).toBe('own 1.0.0 not selected');
    expect(chip.title).toContain('a different composition may select it');
    expect(row.querySelector('.file-line .file-name')?.textContent).toBe(
      '_nf_lab_conflict_lib.JF7uEdSVsN.js',
    );
    expect(row.querySelector('a.chip-link .chip')?.textContent).toBe('mfe1');
  });

  // T8.6-AC-03 (DOM half): pooling-anchor — provides block with anchored
  // chip; skip only in the registration tooltip. strict-split — isolated
  // audience without a kept-own-copy chip.
  it('keeps the pooling anchor a provides block with the anchored chip', async () => {
    const fixture = await createView({ fixture: 'pooling-anchor', select: 'mfe1' });
    const el = fixture.nativeElement as HTMLElement;

    const block = el.querySelector<HTMLElement>('.provides-block')!;
    const facts = Array.from(block.querySelectorAll<HTMLElement>('.copy-fact'));
    expect(facts.map((fact) => fact.textContent)).toEqual(['anchored']);
    expect(facts[0].title).toContain('explicit servedBy anchor: mfe1');
    // The skip action appears ONLY in the registration tooltip.
    expect(block.querySelector<HTMLElement>('.head-declared')?.title).toBe(
      'registered with action skip — the registry election does not take this copy',
    );
    expect(el.textContent).not.toContain('skip ');
    // The secondary registry key indents under its parent.
    expect(block.querySelector('.sub-row .pkg-link')?.textContent).toBe('/extra');
  });

  it('renders the isolated audience without a kept-own-copy chip', async () => {
    const fixture = await createView({ fixture: 'strict-split', select: 'mfe3' });
    const el = fixture.nativeElement as HTMLElement;

    const block = el.querySelector<HTMLElement>('.provides-block')!;
    const facts = Array.from(block.querySelectorAll<HTMLElement>('.copy-fact')).map(
      (fact) => fact.textContent,
    );
    expect(facts).toEqual(['isolated', 'mapped only for mfe3']);
    expect(el.textContent).not.toContain('kept own copy');
  });

  // T8.6-AC-04 (DOM half): honest-empty zones and the unresolved bucket in
  // Packages grammar.
  it('renders the unresolved bucket with state and offered chips', async () => {
    const fixture = await createView({ fixture: 'synthetic-multi-version', select: 'calendar' });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.provides-block')).toBeNull();
    expect(el.querySelector('.provides-empty')).not.toBeNull();
    expect(el.querySelector('.consumes-row')).toBeNull();
    expect(el.querySelector('.consumes-empty')).not.toBeNull();
    expect(groupLabelsOf(el)).toContain('unresolved');
    expect(groupLabelEl(el, 'unresolved').title).toBe(
      'declarations whose claims resolve nowhere in this capture',
    );

    const row = el.querySelector<HTMLElement>('.unresolved-row')!;
    expect(row.querySelector('.pkg-link')?.textContent).toBe('ui-lib');
    const state = row.querySelector<HTMLElement>('.state-chip')!;
    expect(state.textContent).toBe('not mapped');
    expect(state.title).toContain('in this capture');
    const offered = row.querySelector<HTMLElement>('.offered-chip')!;
    expect(offered.textContent).toBe('offered 1.2.3');
    expect(offered.title).toContain('version registration');
  });

  // T8.6-AC-06: the private registrations rename with unchanged row anatomy.
  it('renders the private registration path under the renamed section', async () => {
    const fixture = await createView({ fixture: 'scoped', select: 'mfe1' });
    const el = fixture.nativeElement as HTMLElement;

    expect(groupLabelsOf(el)).toContain('private registrations');
    expect(el.textContent).not.toContain('Scoped externals');
    const item = el.querySelector<HTMLElement>('.scoped-item')!;
    expect(item.querySelector('.mono')?.textContent).toBe('@nf-lab/conflict-lib');
    expect(item.querySelector<HTMLElement>('.mono.tip')?.title).toContain(
      'no share action, no share scope',
    );
    expect(item.querySelector('.scoped-tag')?.textContent).toBe('1.0.0');
    const state = item.querySelector<HTMLElement>('.state-chip')!;
    expect(state.textContent).toBe('own mapping');
    expect(state.title).toContain('private domain');
    expect(item.querySelector('.scoped-file')?.textContent).toBe(
      '_nf_lab_conflict_lib.JF7uEdSVsN.js',
    );
  });

  it('renders reclassified chunks in the chunk section, never as scoped packages', async () => {
    const fixture = await createView({ fixture: 'non-dense', select: 'mfe3' });
    const el = fixture.nativeElement as HTMLElement;

    expect(groupLabelsOf(el)).not.toContain('private registrations');
    // Carrier-group explanation + rule live in the chunks header tooltip.
    const chunksLabel = groupLabelEl(el, 'chunks');
    expect(chunksLabel.title).toContain('rule: chunk-pseudo-externals');
    expect(chunksLabel.title).toContain('package attribution is not derivable');
    expect(el.textContent).not.toContain('package attribution is not derivable');
    const groupLabels = Array.from(el.querySelectorAll<HTMLElement>('.chunk-head .mono')).map(
      (label) => label.textContent,
    );
    expect(groupLabels.some((label) => label?.startsWith('@nf-internal/'))).toBe(true);
  });

  // Exposes adopt the file-line grammar: qualified name, file, mapped
  // link, SRI (T8.6-AC-06).
  it('renders exposes in file-line grammar with the SRI fact', async () => {
    const fixture = await createView({ fixture: 'frankenstein-live', select: 'whiteboard' });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.expose-name')?.textContent).toBe('whiteboard/./Bootstrap');
    const line = el.querySelector<HTMLElement>('.expose-list .file-line')!;
    expect(line.querySelector('.file-name')?.textContent).toBe('Bootstrap-7COJRA5I.js');
    const mapped = line.querySelector<HTMLAnchorElement>('a.file-mapped')!;
    expect(mapped.title).toBe(
      'https://lutzleonhardt.de/frankenstein-meeting-room/whiteboard/Bootstrap-7COJRA5I.js',
    );
    expect(decodeURIComponent(mapped.getAttribute('href') ?? '')).toBe(
      '/import-map?select=whiteboard/./Bootstrap',
    );
    const sri = line.querySelector<HTMLElement>('.file-sri')!;
    expect(sri.textContent).toBe('SRI ✓');
    expect(sri.title).toContain('integrity hash recorded');

    // Chunks 'none' level: short honest-empty line, grounded explanation
    // in the tooltip (screenshot review 3).
    const chunkNone = Array.from(el.querySelectorAll<HTMLElement>('.view-observation.tip')).find(
      (observation) => observation.title.includes('rule: no-chunk-evidence'),
    )!;
    expect(chunkNone.textContent?.trim()).toBe('none in this capture');
    expect(chunkNone.title).toContain('dense-chunking capability absent');
    expect(el.textContent).not.toContain('no chunk evidence recorded');
  });

  // T8.6-AC-05 (DOM half): a qualified attribution renders as a consumes
  // row with its qualifier chip visible — never a provides block.
  it('renders an ambiguous source qualification on the consumes row', async () => {
    const fixture = await createView({ fixture: QUALIFIER_SEED, select: 'r1' });
    const el = fixture.nativeElement as HTMLElement;

    const rows = Array.from(el.querySelectorAll<HTMLElement>('.consumes-row'));
    const ambRow = rows.find((row) => row.querySelector('.pkg-link')?.textContent === 'amb-lib')!;
    const chips = Array.from(ambRow.querySelectorAll<HTMLElement>('.state-chip'));
    expect(chips.map((chip) => chip.textContent)).toEqual([
      'own 1.0.0 not selected',
      'ambiguous source',
    ]);
    expect(chips[1].title).toBe(
      'equally specific remote scope prefixes match this target — none is chosen',
    );
    expect(ambRow.querySelector('.source-provider')?.textContent).toBe('ambiguous source');
    // No provides block claims the ambiguous copy; alias-lib stays r1's.
    const blockNames = Array.from(
      el.querySelectorAll<HTMLElement>('.provides-block > .copy-head .pkg-link'),
    ).map((link) => link.textContent);
    expect(blockNames).toEqual(['alias-lib']);
  });

  // T8 review H2 (DOM half): a claim-less consumer relation renders inside
  // the consumes zone with copy, qualified source, and binding.
  it('renders the relation-only consumer binding of an alias scope', async () => {
    const fixture = await createView({ fixture: QUALIFIER_SEED, select: 'r2' });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('resolved bindings without an own resolution claim');
    // A relation-only consumer IS canonical consumption — the zone must not
    // simultaneously claim emptiness (Codex review 1).
    expect(el.querySelector('.consumes-empty')).toBeNull();
    const item = el.querySelector<HTMLElement>('.relation-item')!;
    expect(item.querySelector('.mono')?.textContent).toBe('alias-lib');
    expect(item.querySelector('.scoped-tag')?.textContent).toBe('1.0.0');
    expect(item.querySelector<HTMLElement>('.state-chip')?.textContent).toBe('r1');
    expect(item.querySelector<HTMLElement>('.state-chip')?.title).toContain('exact target source');
    const binding = item.querySelector<HTMLElement>('.relation-binding')!;
    expect(binding.textContent).toBe('alias-lib → lib.js');
    expect(binding.title).toBe('https://seed.example/shared/lib.js');
    // The candidate-less declaration itself lands in the unresolved bucket.
    const unresolvedRow = el.querySelector<HTMLElement>('.unresolved-row')!;
    expect(unresolvedRow.querySelector('.state-chip')?.textContent).toBe('declared');
    expect(unresolvedRow.querySelector('.offered-chip')?.textContent).toBe('offered 1.0.0');
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

  // Wording rules: "resolves to", never "uses"; no delivery claims; arrows
  // carry the fixed aria vocabulary.
  it('speaks the fixed vocabulary across list and detail', async () => {
    const fixture = await createView({ fixture: 'frankenstein-live', select: NF_HOST });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).not.toMatch(/\buses\b/);
    expect(el.textContent).not.toMatch(/\bused by\b/);
    expect(el.textContent).not.toMatch(/\bloaded\b/);
    // No arrow glyphs anywhere (screenshot review 3); winner file lines
    // keep the fixed aria vocabulary.
    expect(el.querySelector('.arrow')).toBeNull();
    for (const line of el.querySelectorAll('.consumes-row .file-line')) {
      expect(line.getAttribute('aria-label')).toMatch(/^resolves to/);
    }
  });

  it('renders an honest observation when no snapshot is captured', async () => {
    const fixture = await createView({ fixture: null });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('no captured snapshot to render');
    expect(el.querySelector('.tree-row')).toBeNull();
  });
});
