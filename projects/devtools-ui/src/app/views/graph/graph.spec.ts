/**
 * Graph view specs — DOM half of the walking skeleton: the template renders
 * the precomputed model primitives only (nodes, Bézier edges, native
 * tooltips), tracks by canonical IDs, keeps the two empty states honest, and
 * never emits delivery-claiming vocabulary (T1-AC-05 rendered-text pin).
 */
import { Provider, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  FIXTURES,
  FixtureId,
  SNAPSHOT_PROVIDER,
  SnapshotProvider,
  SnapshotV1,
} from 'devtools-bridge';

import { PARTICIPANT_COLOR_LOOKUP } from '../../shared/kit/participant-colors';
import type { FederationModel } from '../../shared/store/federation-model';
import { FederationStore } from '../../shared/store/federation-store';
import { ingestSnapshot } from '../../shared/store/ingest';
import { provideParticipantColors } from '../../shared/store/participant-colors-provider';
import type {
  BundleClaim,
  BundleClaimId,
  CanonicalResolutionProjection,
  ChunkGroupId,
  ChunkGroupProjection,
  ConsumerCopyRelation,
  ConsumerCopyRelationId,
  ResolvedDependencyCopy,
  ResolvedDependencyCopyId,
} from '../../shared/store/resolution';
import { GraphView } from './graph';
import { MAX_BUNDLE_EDGES } from './graph-types';

class FixtureSnapshotProvider implements SnapshotProvider {
  /** Mutable so a test can change the captured content between refreshes. */
  constructor(public id: FixtureId | null) {}

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

async function createViewFixture(fixtureId: FixtureId | null, extraProviders: Provider[] = []) {
  await TestBed.configureTestingModule({
    imports: [GraphView],
    providers: [
      provideRouter([]),
      provideParticipantColors(),
      { provide: SNAPSHOT_PROVIDER, useValue: new FixtureSnapshotProvider(fixtureId) },
      ...extraProviders,
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(GraphView);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

async function createView(fixtureId: FixtureId | null, extraProviders: Provider[] = []) {
  return (await createViewFixture(fixtureId, extraProviders)).el;
}

/**
 * Seeded projection harness for cases no fixture reaches (ghost consumer):
 * the store is stubbed with a model carrying only the projection — the
 * component reads nothing else. The color lookup stays the neutral kit
 * default here.
 */
async function createSeededView(projection: CanonicalResolutionProjection): Promise<HTMLElement> {
  return (await createSeededViewFixture(projection)).el;
}

async function createSeededViewFixture(projection: CanonicalResolutionProjection) {
  await TestBed.configureTestingModule({
    imports: [GraphView],
    providers: [
      provideRouter([]),
      {
        provide: FederationStore,
        useValue: { model: signal({ resolutionProjection: projection } as FederationModel) },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(GraphView);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

/** Minimal canonical seeds (branded-ID casts) for the seeded harness. */
function seededCopy(id: string, bundleClaimIds: string[] = []): ResolvedDependencyCopy {
  return {
    id: id as ResolvedDependencyCopyId,
    sourcePackage: 'pkg',
    resolvedTag: null,
    source: { kind: 'target-url', targetUrl: 'https://cdn.test/mod.js' },
    sourceDisposition: 'target-only',
    effectiveRoles: ['unclassified'],
    sourceActions: [],
    entrypoints: {},
    effectiveResolutionIds: [],
    resolutionContexts: [],
    sourceRegistrationRefs: [],
    observedTargetProviders: [],
    registryServingSlotClaims: [],
    bundleClaimIds: bundleClaimIds as BundleClaimId[],
    provenance: { evidence: [] },
  };
}

function seededClaim(id: string, copyId: string, chunkGroupIds: string[]): BundleClaim {
  return {
    id: id as BundleClaimId,
    copyId: copyId as ResolvedDependencyCopyId,
    source: null,
    sourceRemote: 'host',
    bundle: 'bundle-x',
    chunkGroupIds: chunkGroupIds as ChunkGroupId[],
    status: 'mapped-source',
    provenance: { evidence: [] },
  };
}

function seededChunkGroup(id: string, files: string[]): ChunkGroupProjection {
  return {
    id: id as ChunkGroupId,
    emitterRemote: 'host',
    origin: 'shared-chunks',
    bundleName: 'bundle-x',
    pseudoPackage: null,
    files,
    provenance: { evidence: [] },
  };
}

function seededRelation(consumerRemote: string, copyId: string): ConsumerCopyRelation {
  return {
    id: `consumer-copy-relation:[${consumerRemote},${copyId}]` as ConsumerCopyRelationId,
    consumerRemote,
    copyId: copyId as ResolvedDependencyCopyId,
    effectiveResolutionIds: [],
    claimIds: [],
    mappingStates: [],
  };
}

function seededProjection(
  partial: Partial<
    Pick<
      CanonicalResolutionProjection,
      'remotes' | 'copies' | 'consumerRelations' | 'chunkGroups' | 'bundleClaims' | 'completeness'
    >
  >,
): CanonicalResolutionProjection {
  return {
    remotes: [],
    copies: [],
    consumerRelations: [],
    chunkGroups: [],
    bundleClaims: [],
    declarationResolutionClaims: [],
    registryServingSlotClaims: [],
    observedTargetProviders: [],
    sourceComparisons: [],
    packageMeasures: [],
    tagPools: [],
    orphanPoolTags: [],
    poolFamilies: [],
    copyGroupingFacets: [],
    packageScopeVerdicts: [],
    completeness: {
      total: {
        unknownResolutions: 0,
        unmappedResolutions: 0,
        blockedResolutions: 0,
        ambiguousSourceClaims: 0,
      },
      byConsumer: {},
      consumerIssues: [],
    },
    ...partial,
  };
}

/** Tooltip texts of the edge groups whose visible path is (not) dotted. */
function edgeTitles(el: HTMLElement, dotted: boolean): string[] {
  return Array.from(el.querySelectorAll<SVGGElement>('g.graph-edge-group'))
    .filter((group) => (group.querySelector('path.graph-edge.dotted') !== null) === dotted)
    .map((group) => group.querySelector('title')?.textContent?.trim() ?? '');
}

/** Whitespace-normalized text content. */
function textOf(node: Element | null): string {
  return node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/** Normalized cluster label texts in render order. */
/** Opens a build-files group (the column starts collapsed) by clicking its header. */
function openBuild(el: HTMLElement, label: string): void {
  const group = Array.from(el.querySelectorAll<SVGGElement>('g.graph-cluster.toggle')).find(
    (candidate) => textOf(candidate.querySelector('.graph-cluster-label')).startsWith(label),
  );
  if (group === undefined) {
    throw new Error(`no build group labelled ${label}`);
  }
  group.dispatchEvent(new MouseEvent('click'));
}

function clusterLabels(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('.graph-cluster-label')).map((label) => textOf(label));
}

/** The node group of the given kind whose main label matches exactly. */
function nodeByLabel(el: HTMLElement, kind: 'remote' | 'dependency', label: string): SVGGElement {
  const groups = Array.from(el.querySelectorAll<SVGGElement>(`g.graph-node.${kind}`));
  const match = groups.find((group) => textOf(group.querySelector('.graph-node-label')) === label);
  if (match === undefined) {
    throw new Error(`no ${kind} node labeled ${label}`);
  }
  return match;
}

const TOOLBAR_HINT =
  'click remotes to include · click a dependency or build to expand · hover to trace · dashed node = isolated copy · dotted edge = borrowed';

describe('GraphView', () => {
  // T1-AC-01: one dependency node with a solid and a dotted consume edge;
  // the dotted tooltip lists `not-selected`; the resolved tag is the
  // right-aligned sub-label.
  it('renders co-declared-share with one copy, a solid and a dotted edge', async () => {
    const el = await createView('co-declared-share');

    expect(el.querySelectorAll('.graph-node.dependency').length).toBe(1);
    expect(el.querySelectorAll('.graph-node.remote').length).toBe(3);
    expect(el.querySelector('.graph-node-sublabel')?.textContent?.trim()).toBe('1.0.0');

    const edges = el.querySelectorAll<SVGPathElement>('path.graph-edge');
    expect(edges.length).toBe(2);
    expect(el.querySelectorAll('path.graph-edge.dotted').length).toBe(1);
    expect(edgeTitles(el, true)).toEqual(['not-selected']);
    expect(edgeTitles(el, false)).toEqual(['']);

    // Review follow-up: every edge carries an invisible wide hit path with
    // the same geometry — the 1.5px stroke alone is no usable hover target.
    for (const group of Array.from(el.querySelectorAll('g.graph-edge-group'))) {
      const hit = group.querySelector('path.graph-edge-hit');
      const visible = group.querySelector('path.graph-edge');
      expect(hit?.getAttribute('d')).toBe(visible?.getAttribute('d'));
    }
  });

  // T1-AC-02: one remote node per projection remote (host first) and one
  // dependency node per projection copy; identities are canonical IDs.
  it('renders frankenstein-live one-to-one against its projection', async () => {
    const projection = ingestSnapshot(
      structuredClone(FIXTURES['frankenstein-live']),
    ).resolutionProjection;
    const el = await createView('frankenstein-live');

    const remoteLabels = Array.from(
      el.querySelectorAll('.graph-node.remote .graph-node-label'),
    ).map((label) => label.textContent?.trim());
    // The host sentinel reads as `host` (chip convention); its node still
    // tracks the canonical `__NF-HOST__` identity.
    expect(remoteLabels).toEqual(['host', 'mermaid', 'whiteboard']);
    expect(el.querySelector('.graph-node.remote')?.classList.contains('host')).toBe(true);

    expect(el.querySelectorAll('.graph-node.dependency').length).toBe(projection.copies.length);
    expect(el.querySelectorAll('path.graph-edge').length).toBe(projection.consumerRelations.length);
  });

  // T1-AC-03: the anchored relation renders dotted with `anchored` listed;
  // private copies render with the isolated (dashed) metadata.
  it('renders pooling-anchor anchored edges dotted and scoped copies isolated', async () => {
    const anchorEl = await createView('pooling-anchor');
    const dottedTitles = edgeTitles(anchorEl, true);
    expect(dottedTitles.filter((title) => title === 'anchored').length).toBe(2);

    TestBed.resetTestingModule();
    const scopedEl = await createView('scoped');
    const dependencies = Array.from(scopedEl.querySelectorAll('.graph-node.dependency'));
    expect(dependencies.length).toBe(2);
    expect(dependencies.every((node) => node.classList.contains('isolated'))).toBe(true);
    expect(scopedEl.querySelectorAll('.graph-node.remote.isolated').length).toBe(0);
  });

  // T1-AC-05: forbidden delivery vocabulary never reaches the rendered DOM.
  it('keeps delivery-claiming vocabulary out of the rendered graph', async () => {
    const forbidden = /\b(loaded|downloaded|fetched|executed|wire cost|byte size|cache hit)\b/i;
    const fixtureIds: FixtureId[] = [
      'co-declared-share',
      'pooling-anchor',
      'scoped',
      'clean-skip',
      'frankenstein-live',
      'synthetic-multi-version',
      'synthetic-empty-page',
    ];
    for (const id of fixtureIds) {
      TestBed.resetTestingModule();
      const el = await createView(id);
      expect(el.textContent).not.toMatch(forbidden);
      for (const withTitle of Array.from(el.querySelectorAll('[title], [aria-label]'))) {
        expect(withTitle.getAttribute('title') ?? '').not.toMatch(forbidden);
        expect(withTitle.getAttribute('aria-label') ?? '').not.toMatch(forbidden);
      }
    }
  });

  // share-pools T4: the switch re-clusters in place and keeps the
  // forbidden vocabulary out of every grouping's labels and tooltips.
  it('switches the dependency grouping from the toolbar', async () => {
    const forbidden = /\b(loaded|downloaded|fetched|executed|wire cost|byte size|cache hit)\b/i;
    const { fixture, el } = await createViewFixture('pool-tag-coherent');
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('.graph-group-by-button'));
    expect(buttons.map((button) => textOf(button))).toEqual([
      'Provider',
      'Share scope',
      'Pool',
      'Build',
    ]);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    const nodeKeys = () =>
      Array.from(el.querySelectorAll('.graph-node .graph-node-label'))
        .map((label) => textOf(label))
        .sort();
    const before = nodeKeys();

    buttons[2].click();
    await settle(fixture);
    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
    expect(
      Array.from(el.querySelectorAll('.graph-cluster-label')).map((label) => textOf(label)),
    ).toEqual(['pool ui (2)', '(not pooled) (1)', 'host (1)', 'mfe1 (2)']);
    expect(el.querySelector('.graph-cluster title')?.textContent?.trim()).toBe(
      'formed by: mfe1 "ui", mfe2 "ui"',
    );
    expect(nodeKeys()).toEqual(before);

    for (const button of buttons) {
      button.click();
      await settle(fixture);
      expect(el.textContent).not.toMatch(forbidden);
    }
  });

  // Accordion: one open dependency and one open build group at a time.
  it('opens one dependency and one build group at a time', async () => {
    const { fixture, el } = await createViewFixture('frankenstein-live');
    const click = (node: Element) => {
      node.dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();
    };
    click(nodeByLabel(el, 'dependency', '@angular/common'));
    expect(Array.from(el.querySelectorAll('.graph-list-text')).map((t) => textOf(t))).toEqual([
      '@angular/common/http',
      'see usage details',
    ]);
    click(nodeByLabel(el, 'dependency', 'rxjs'));
    expect(Array.from(el.querySelectorAll('.graph-list-text')).map((t) => textOf(t))).toEqual([
      'rxjs/operators',
      'see usage details',
    ]);
    const usage = el.querySelector('a.graph-list-link');
    expect(textOf(usage)).toBe('see usage details');
    expect(usage?.getAttribute('href')).toBe(
      `/packages?select=${encodeURIComponent('__GLOBAL__|rxjs')}`,
    );
    expect(el.querySelectorAll('.graph-node.dependency.expanded').length).toBe(1);
    expect(textOf(nodeByLabel(el, 'dependency', 'rxjs').querySelector('.graph-node-toggle'))).toBe(
      '▾',
    );
    expect(
      textOf(nodeByLabel(el, 'dependency', '@angular/common').querySelector('.graph-node-toggle')),
    ).toBe('▸');
    click(nodeByLabel(el, 'dependency', 'rxjs'));
    expect(el.querySelectorAll('.graph-list-item').length).toBe(0);

    // Three single-file builds always show their file.
    openBuild(el, 'host · browser-rxjs');
    fixture.detectChanges();
    expect(el.querySelectorAll('.graph-node.chunk:not(.summary)').length).toBe(3 + 3);
    openBuild(el, 'whiteboard');
    fixture.detectChanges();
    expect(el.querySelectorAll('.graph-node.chunk:not(.summary)').length).toBe(3 + 7);
    const toggleOf = (label: string) =>
      Array.from(el.querySelectorAll('g.graph-cluster.toggle'))
        .find((group) => textOf(group.querySelector('.graph-cluster-label')).startsWith(label))!
        .querySelector('.graph-cluster-toggle');
    expect(textOf(toggleOf('whiteboard'))).toBe('▾');
    expect(textOf(toggleOf('host · browser-rxjs'))).toBe('▸');
    // A summary row toggles its group too.
    click(el.querySelector('.graph-node.chunk.summary')!);
    expect(el.querySelectorAll('.graph-node.chunk:not(.summary)').length).toBe(3 + 3);
  });

  // T1-AC-06: a capture producing no nodes says so; a missing snapshot
  // reuses the panel's existing empty wording.
  it('renders the two empty states honestly', async () => {
    const emptyEl = await createView('synthetic-empty-page');
    expect(emptyEl.querySelector('.view-observation')?.textContent?.trim()).toBe(
      'Nothing to graph.',
    );
    expect(emptyEl.querySelector('svg')).toBeNull();

    TestBed.resetTestingModule();
    const missingEl = await createView(null);
    expect(missingEl.querySelector('.view-observation')?.textContent?.trim()).toBe(
      'no captured snapshot to render',
    );
    expect(missingEl.querySelector('svg')).toBeNull();
  });

  // ---- Task 2: clustered columns, chunk stubs, honest footer ----

  // T2-AC-01: the three-column mock reading — dependency clusters with
  // host first and counts, host chunk groups under emitter · bundle heads.
  it('renders frankenstein-live as three clustered columns', async () => {
    const el = await createView('frankenstein-live');

    const headers = Array.from(el.querySelectorAll('.graph-column-header')).map((h) => textOf(h));
    expect(headers).toEqual(['Remotes', 'Dependencies', 'Build files']);
    expect(clusterLabels(el)).toEqual([
      'host (12)',
      'mermaid (1)',
      'whiteboard (7)',
      'host · browser-angular_common (3)',
      'host · browser-angular_core (11)',
      'host · browser-angular_platform_browser (1)',
      'host · browser-rxjs (3)',
      'host · browser-tslib (1)',
      'mermaid (1)',
      'whiteboard (7)',
    ]);
    // The build-files column starts collapsed: one summary row per
    // multi-file build; single-file builds show their file directly.
    expect(el.querySelectorAll('.graph-node.chunk').length).toBe(7);
    expect(el.querySelectorAll('.graph-node.chunk.summary').length).toBe(4);
    expect(el.querySelectorAll('a.graph-chunk-link[href]').length).toBe(3);
    expect(el.querySelectorAll('.graph-cluster.toggle').length).toBe(4);
  });

  // T2-AC-02 + T2-AC-03: the emitting source remote carries the copy's
  // entry file (linked), the borrowing consumer contributes nothing, and no
  // chunk file is fabricated; bundle references stay unrendered (Task 3).
  it('renders the clean-skip entry file under the emitting remote without fabricated chunks', async () => {
    const projection = ingestSnapshot(structuredClone(FIXTURES['clean-skip'])).resolutionProjection;
    const el = await createView('clean-skip');

    expect(clusterLabels(el)).toEqual(['mfe2 (1)', 'mfe2 · browser-shared (1)']);
    // One file: shown directly, no summary row and no toggle.
    expect(el.querySelector('.graph-node.chunk.summary')).toBeNull();
    expect(el.querySelector('.graph-cluster.toggle')).toBeNull();
    expect(el.querySelectorAll('.graph-node.chunk').length).toBe(1);
    expect(el.querySelector('.graph-node.chunk.stub')).toBeNull();
    const link = el.querySelector('.graph-node.chunk a.graph-chunk-link');
    expect(textOf(link?.querySelector('.graph-node-label') ?? null)).toBe(
      '_nf_lab_conflict_lib.jvcc6K1csg.js',
    );
    expect(link?.getAttribute('href')).toBe(
      'http://localhost:4300/mfe2/_nf_lab_conflict_lib.jvcc6K1csg.js',
    );
    expect(link?.getAttribute('target')).toBe('_blank');
    // The click opens the tab itself instead of relying on SVG link navigation.
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const click = new MouseEvent('click', { cancelable: true });
    link!.dispatchEvent(click);
    expect(open).toHaveBeenCalledWith(
      'http://localhost:4300/mfe2/_nf_lab_conflict_lib.jvcc6K1csg.js',
      '_blank',
      'noopener',
    );
    expect(click.defaultPrevented).toBe(true);
    open.mockRestore();
    // Rendered paths are exactly the consume edges (hit + visible per
    // relation) — bundle-edge references wait for the hover trace.
    expect(el.querySelectorAll('path').length).toBe(2 * projection.consumerRelations.length);
  });

  // T2-AC-06: source clusters carry the same identity slots as the chip
  // dots (mermaid → 1, whiteboard → 2 on frankenstein-live); host
  // clusters stay neutral.
  it('carries the chip color slots on source clusters and keeps host neutral', async () => {
    const el = await createView('frankenstein-live');
    const clusters = Array.from(el.querySelectorAll<SVGGElement>('g.graph-cluster'));
    const labelOf = (group: SVGGElement) => textOf(group.querySelector('.graph-cluster-label'));

    const mermaid = clusters.find((group) => labelOf(group).startsWith('mermaid'));
    const whiteboard = clusters.find((group) => labelOf(group).startsWith('whiteboard'));
    expect(mermaid?.classList.contains('hue-1')).toBe(true);
    expect(whiteboard?.classList.contains('hue-2')).toBe(true);
    const hostClusters = clusters.filter((group) => labelOf(group).startsWith('host'));
    expect(hostClusters.length).toBe(6);
    for (const group of hostClusters) {
      expect(Array.from(group.classList).some((c) => c.startsWith('hue-'))).toBe(false);
    }
  });

  // T2-AC-07: the completeness footer renders only on divergence, with the
  // four counts and the Remotes link; an all-zero capture renders none.
  it('renders the completeness footer only on divergence', async () => {
    const divergentEl = await createView('synthetic-multi-version');
    const line = divergentEl.querySelector('.graph-footer-line');
    expect(textOf(line)).toBe(
      '0 unknown · 2 unmapped · 0 blocked · 0 ambiguous — details in the Remotes view',
    );
    expect(line?.querySelector('a')?.getAttribute('href')).toBe('/remotes');

    TestBed.resetTestingModule();
    const cleanEl = await createView('co-declared-share');
    expect(cleanEl.querySelector('.graph-footer')).toBeNull();
  });

  // T2-AC-07: a consumer-less relation renders the dropped-relation line —
  // reported, never silently omitted, and no node is invented for it.
  it('renders the dropped-relation line for a consumer-less relation', async () => {
    const el = await createSeededView(
      seededProjection({
        remotes: [
          {
            name: 'host',
            isHost: true,
            scopeUrl: './host/',
            resolvedScopeUrl: 'https://page.test/host/',
          },
        ],
        copies: [seededCopy('copy-1')],
        consumerRelations: [seededRelation('ghost', 'copy-1')],
      }),
    );

    const lines = Array.from(el.querySelectorAll('.graph-footer-line')).map((line) => textOf(line));
    expect(lines).toEqual(["1 relation not drawn — consumer not among the capture's remotes"]);
    expect(el.querySelectorAll('path.graph-edge').length).toBe(0);
    expect(el.querySelectorAll('.graph-node').length).toBe(2);
  });

  // Codex review fix (T2-AC-07): a capture can diverge without yielding a
  // single node — the footer must render next to the empty state, or an
  // incomplete capture looks merely blank.
  it('renders the divergence footer even when the capture yields no nodes', async () => {
    const el = await createSeededView(
      seededProjection({
        completeness: {
          total: {
            unknownResolutions: 1,
            unmappedResolutions: 0,
            blockedResolutions: 0,
            ambiguousSourceClaims: 0,
          },
          byConsumer: {},
          consumerIssues: [],
        },
      }),
    );

    expect(textOf(el.querySelector('.view-observation'))).toBe('Nothing to graph.');
    expect(el.querySelector('svg')).toBeNull();
    expect(textOf(el.querySelector('.graph-footer-line'))).toBe(
      '1 unknown · 0 unmapped · 0 blocked · 0 ambiguous — details in the Remotes view',
    );
  });

  // Codex review fix (T2-AC-06 hardening): the hue class binding is pinned
  // for a high palette slot, not only the slots the corpus reaches.
  it('binds high palette slots to their hue class', async () => {
    const el = await createView('frankenstein-live', [
      {
        provide: PARTICIPANT_COLOR_LOOKUP,
        useValue: signal<ReadonlyMap<string, number>>(new Map([['mermaid', 8]])).asReadonly(),
      },
    ]);

    const clusters = Array.from(el.querySelectorAll<SVGGElement>('g.graph-cluster'));
    const mermaid = clusters.find((group) =>
      textOf(group.querySelector('.graph-cluster-label')).startsWith('mermaid'),
    );
    expect(mermaid?.classList.contains('hue-8')).toBe(true);
    // Only mermaid's clusters are colored under this lookup: its dependency
    // cluster and its build-files cluster.
    expect(
      clusters.filter((group) => Array.from(group.classList).some((c) => c.startsWith('hue-')))
        .length,
    ).toBe(2);
  });

  // ---- Task 3: hover trace and click-to-filter ----

  // T3-AC-01: hovering a dependency reveals exactly its bundle edges and
  // keeps its consumer remote + claimed chunk nodes at full opacity while
  // everything else dims; leaving the graph area restores everything.
  it('reveals the hovered dependency bundle edges and dims the untraced rest', async () => {
    const { fixture, el } = await createViewFixture('frankenstein-live');
    openBuild(el, 'host · browser-angular_core');
    fixture.detectChanges();
    const core = nodeByLabel(el, 'dependency', '@angular/core');
    core.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    // Exactly the hovered copy's entry file plus its 5 browser-angular_core
    // chunk files appear as bundle edges — nothing else is revealed.
    expect(el.querySelectorAll('path.graph-bundle-edge').length).toBe(6);
    expect(core.classList.contains('dim')).toBe(false);
    expect(nodeByLabel(el, 'remote', 'host').classList.contains('dim')).toBe(false);
    expect(nodeByLabel(el, 'remote', 'mermaid').classList.contains('dim')).toBe(true);
    expect(nodeByLabel(el, 'remote', 'whiteboard').classList.contains('dim')).toBe(true);

    // The open group's 11 files plus the other six builds' summary rows.
    const chunks = Array.from(el.querySelectorAll('g.graph-node.chunk'));
    expect(chunks.length).toBe(17);
    // Lit: @angular/core's entry file and its 5 chunk files.
    expect(chunks.filter((chunk) => !chunk.classList.contains('dim')).length).toBe(6);
    const dependencies = Array.from(el.querySelectorAll('g.graph-node.dependency'));
    expect(dependencies.filter((node) => !node.classList.contains('dim')).length).toBe(1);
    const edgeGroups = Array.from(el.querySelectorAll('g.graph-edge-group'));
    expect(edgeGroups.length).toBe(20);
    expect(edgeGroups.filter((group) => !group.classList.contains('dim')).length).toBe(1);

    el.querySelector('svg')!.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(el.querySelectorAll('path.graph-bundle-edge').length).toBe(0);
    expect(el.querySelectorAll('.dim').length).toBe(0);
  });

  // T3-AC-05: hover changes emphasis only — the rendered node and
  // consume-edge multiset is identical before, during, and after hover;
  // the revealed bundle edges are the AC-01 overlay, not a model change.
  it('keeps the node and consume-edge multiset identical across hover', async () => {
    const { fixture, el } = await createViewFixture('frankenstein-live');
    const snapshot = () => ({
      nodes: Array.from(el.querySelectorAll('g.graph-node .graph-node-label'))
        .map((label) => textOf(label))
        .sort(),
      edges: Array.from(el.querySelectorAll('path.graph-edge'))
        .map((path) => path.getAttribute('d'))
        .sort(),
    });
    const before = snapshot();

    nodeByLabel(el, 'dependency', '@angular/core').dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(snapshot()).toEqual(before);

    el.querySelector('svg')!.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(snapshot()).toEqual(before);
    expect(el.querySelectorAll('path.graph-bundle-edge').length).toBe(0);
  });

  // T3-AC-02: with only the borrowing consumer selected, the shared copy
  // is kept (OR over consumers) and its chunks stay rendered although the
  // emitting source remote is unselected — the emitter is not the consumer.
  it('keeps the borrowed copy and its chunks when only the borrower is selected', async () => {
    const { fixture, el } = await createViewFixture('clean-skip');
    nodeByLabel(el, 'remote', 'mfe1').dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();

    expect(textOf(el.querySelector('.graph-toolbar'))).toContain('filtering by 1 remote');
    expect(nodeByLabel(el, 'remote', 'mfe1').classList.contains('selected')).toBe(true);
    expect(nodeByLabel(el, 'remote', 'mfe2').classList.contains('selected')).toBe(false);
    // Chunk attribution ignores the selection: the mfe2-emitted stub stays.
    expect(clusterLabels(el)).toEqual(['mfe2 (1)', 'mfe2 · browser-shared (1)']);
    expect(el.querySelectorAll('.graph-node.chunk').length).toBe(1);
    expect(el.querySelectorAll('.graph-node.remote').length).toBe(3);
    expect(el.querySelectorAll('path.graph-edge').length).toBe(1);
  });

  // T3-AC-03: multi-select is OR — two selected remotes keep the union of
  // their copies, the remote column renders completely in every filter
  // state, and Clear restores the unfiltered view.
  it('filters by the union of selected remotes and restores on Clear', async () => {
    const { fixture, el } = await createViewFixture('frankenstein-live');
    expect(el.querySelectorAll('.graph-node.dependency').length).toBe(20);

    nodeByLabel(el, 'remote', 'mermaid').dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();
    expect(el.querySelectorAll('.graph-node.dependency').length).toBe(1);
    expect(el.querySelectorAll('.graph-node.remote').length).toBe(3);

    nodeByLabel(el, 'remote', 'whiteboard').dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();
    expect(textOf(el.querySelector('.graph-toolbar'))).toContain('filtering by 2 remotes');
    expect(el.querySelectorAll('.graph-node.dependency').length).toBe(8);
    expect(el.querySelectorAll('.graph-node.remote').length).toBe(3);

    (el.querySelector('.graph-toolbar-clear') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.graph-node.dependency').length).toBe(20);
    expect(el.querySelectorAll('.graph-node.remote').length).toBe(3);
    expect(textOf(el.querySelector('.graph-toolbar-hint'))).toBe(TOOLBAR_HINT);
  });

  // Exclude mode: checkboxes start all ticked, clicking a remote unticks it
  // and hides its consumers; switching back keeps the selection as an include.
  it('inverts the remote selection in exclude mode with checkbox feedback', async () => {
    const { fixture, el } = await createViewFixture('frankenstein-live');
    const checked = () =>
      Array.from(el.querySelectorAll('g.graph-node.remote'))
        .filter((node) => node.getAttribute('aria-checked') === 'true')
        .map((node) => textOf(node.querySelector('.graph-node-label')));
    const modeButton = (label: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('.graph-filter-mode-button')).find(
        (button) => textOf(button) === label,
      )!;
    expect(checked()).toEqual([]);

    modeButton('Exclude').click();
    fixture.detectChanges();
    expect(modeButton('Exclude').getAttribute('aria-pressed')).toBe('true');
    expect(checked()).toEqual(['host', 'mermaid', 'whiteboard']);
    expect(el.querySelectorAll('.graph-remote-check-mark').length).toBe(3);
    expect(textOf(el.querySelector('.graph-toolbar-hint'))).toContain('click remotes to exclude');

    nodeByLabel(el, 'remote', 'whiteboard').dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();
    expect(checked()).toEqual(['host', 'mermaid']);
    expect(nodeByLabel(el, 'remote', 'whiteboard').classList.contains('excluded')).toBe(true);
    expect(nodeByLabel(el, 'remote', 'whiteboard').classList.contains('selected')).toBe(false);
    expect(textOf(el.querySelector('.graph-toolbar'))).toContain('excluding 1 remote');
    expect(el.querySelectorAll('.graph-node.dependency').length).toBeLessThan(20);

    modeButton('Include').click();
    fixture.detectChanges();
    expect(checked()).toEqual(['whiteboard']);
    expect(el.querySelectorAll('.graph-node.dependency').length).toBe(7);
  });

  // T3-AC-04: the toolbar switches hint line ↔ filter state; the cap
  // message appears only when references were actually capped.
  it('switches the toolbar states and shows the cap message only when capped', async () => {
    const { fixture, el } = await createViewFixture('co-declared-share');
    expect(textOf(el.querySelector('.graph-toolbar-hint'))).toBe(TOOLBAR_HINT);
    expect(el.querySelector('.graph-toolbar-clear')).toBeNull();
    expect(el.querySelector('.graph-toolbar-cap')).toBeNull();

    nodeByLabel(el, 'remote', 'mfe1').dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();
    expect(el.querySelector('.graph-toolbar-hint')).toBeNull();
    expect(textOf(el.querySelector('.graph-toolbar-line'))).toBe('filtering by 1 remote');
    expect(el.querySelector('.graph-toolbar-clear')).not.toBeNull();
    expect(el.querySelector('.graph-toolbar-cap')).toBeNull();
  });

  // Codex review fix: interaction state is per capture — an in-place
  // Refresh resets selection and hover, so no stale remote name can filter
  // a newer capture's graph empty and no stale hover key can dim it. (A
  // fixture switch reloads the whole app; this covers the in-place path.)
  it('resets selection and hover when a new capture arrives', async () => {
    const provider = new FixtureSnapshotProvider('clean-skip');
    const { fixture, el } = await createViewFixture('clean-skip', [
      { provide: SNAPSHOT_PROVIDER, useValue: provider },
    ]);
    nodeByLabel(el, 'remote', 'mfe1').dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();
    nodeByLabel(el, 'dependency', '@nf-lab/conflict-lib').dispatchEvent(
      new MouseEvent('mouseenter'),
    );
    fixture.detectChanges();
    expect(textOf(el.querySelector('.graph-toolbar'))).toContain('filtering by 1 remote');
    expect(el.querySelectorAll('.dim').length).toBeGreaterThan(0);

    // The inspected content changes underneath the open panel, then Refresh.
    provider.id = 'frankenstein-live';
    await TestBed.inject(FederationStore).refresh();
    await settle(fixture);

    expect(textOf(el.querySelector('.graph-toolbar-hint'))).toBe(TOOLBAR_HINT);
    expect(el.querySelectorAll('.graph-node.remote.selected').length).toBe(0);
    expect(el.querySelectorAll('.graph-node.dependency').length).toBe(20);
    expect(el.querySelectorAll('.dim').length).toBe(0);
    expect(el.querySelectorAll('path.graph-bundle-edge').length).toBe(0);
  });

  // T3-AC-04: the cap message renders with the honest overflow count when
  // the reference budget is exceeded (seeded — no fixture reaches the cap).
  // References are (copy, chunk file) pairs, so 41 copies sharing one
  // 100-file group reach 4100 refs while rendering ~140 nodes; one file per
  // ref (4100 chunk nodes) made jsdom take 8–10s and time out.
  it('shows the cap message when bundle references were capped', async () => {
    const copyCount = 41;
    const files = Array.from({ length: 100 }, (_, i) => `chunk-${i}.js`);
    const copyIds = Array.from({ length: copyCount }, (_, i) => `copy-${i}`);
    expect(copyCount * files.length).toBe(MAX_BUNDLE_EDGES + 100);
    const { fixture, el } = await createSeededViewFixture(
      seededProjection({
        remotes: [
          {
            name: 'host',
            isHost: true,
            scopeUrl: './host/',
            resolvedScopeUrl: 'https://page.test/host/',
          },
        ],
        copies: copyIds.map((id) => seededCopy(id, [`claim-${id}`])),
        // One consume edge raises the cap to 1 + MAX_BUNDLE_EDGES → 99 over.
        consumerRelations: [seededRelation('host', 'copy-0')],
        bundleClaims: copyIds.map((id) => seededClaim(`claim-${id}`, id, ['group-1'])),
        chunkGroups: [seededChunkGroup('group-1', files)],
      }),
    );

    // Collapsed, the 4100 references merge onto one summary row per copy.
    expect(el.querySelector('.graph-toolbar-cap')).toBeNull();
    openBuild(el, 'host · bundle-x');
    fixture.detectChanges();
    expect(textOf(el.querySelector('.graph-toolbar-cap'))).toBe(
      '99 additional bundle links hidden to keep the graph responsive.',
    );
  });
});
