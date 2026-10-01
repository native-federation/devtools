/**
 * Remotes view-model specs — fixture-driven acceptance for the zone
 * redesign (T8.6): three zones decided PER CLAIM.
 *  - T8.6-AC-01: frankenstein-live host — provides blocks fold the own
 *    DECLARED-BY row into the head, secondaries indent under their
 *    name-derived parents, consumes stays honest-empty, and the chunk
 *    section dedupes to ONE row per bundle with a `serves` tail.
 *  - T8.6-AC-02: clean-skip / co-declared-share — foreign-resolving claims
 *    render as consumes rows with `skipped own <tag>` / `own <tag> not selected`
 *    chips and the winner file `from` the source remote.
 *  - T8.6-AC-03: strict-split isolated audience without a `kept own copy`
 *    chip; pooling-anchor as the registry-action ≠ zone proof case
 *    (skip + anchored → provides block, skip only in the registration
 *    tooltip).
 *  - T8.6-AC-04: synthetic-multi-version — both zones honest-empty, the
 *    unresolved bucket in Packages grammar with `offered <tag>`, and the
 *    list `⚠` marker with its count tooltip.
 *  - T8.6-AC-05: seed witnesses — one declaration rendering in BOTH zones
 *    (`via`-prefixed consumes row) and qualified attributions that never
 *    form provides blocks.
 *  - T8.6-AC-06 (builder half): capability meta notes carry the T8.5
 *    `(config: …)` provenance verbatim; purity stays pinned.
 * The T8 seed harness (qualified-source ladder, relation-only, private
 * claims) carries over with zone-shaped expectations.
 */
import { FIXTURES, NF_HOST, SnapshotV1 } from 'devtools-bridge';

import type { FederationModel } from '../../shared/store/federation-model';
import { ingestSnapshot } from '../../shared/store/ingest';
import { RemoteDetailVm, RemotesUiState, RemotesVm, buildRemotesVm } from './remotes-view-model';

function modelOf(name: keyof typeof FIXTURES): FederationModel {
  return ingestSnapshot(FIXTURES[name]);
}

function vmOf(name: keyof typeof FIXTURES, ui: Partial<RemotesUiState> = {}): RemotesVm {
  return buildRemotesVm(modelOf(name), { selectedName: null, ...ui });
}

function detailOf(name: keyof typeof FIXTURES, selectedName: string): RemoteDetailVm {
  return vmOf(name, { selectedName }).detail!;
}

const SKIP_NOTE = 'registered with action skip — the registry election does not take this copy';
const SCOPE_NOTE =
  'registered with action scope — an isolated registration outside the version election';

describe('buildRemotesVm — left list', () => {
  it('lists the three live remotes in model order with the host marked', () => {
    const vm = vmOf('frankenstein-live');

    expect(vm.remoteCount).toBe(3);
    expect(vm.rows.map((row) => row.payload.name)).toEqual(['whiteboard', 'mermaid', NF_HOST]);
    expect(vm.rows.map((row) => row.payload.host)).toEqual([false, false, true]);
    // Flat list — nothing expands.
    expect(vm.rows.every((row) => !row.expandable && row.depth === 0)).toBe(true);
    expect(vm.emptyNote).toBeNull();
  });

  it('summarizes expose and DECLARATION counts per remote (clean-skip ground truth)', () => {
    const vm = vmOf('clean-skip');

    const summaries = new Map(vm.rows.map((row) => [row.payload.name, row.payload.summary]));
    // Declarations are called declarations — never versions, copies, or
    // providers (T8 instruction).
    expect(summaries.get('mfe1')).toBe('1 expose · 1 declaration');
    expect(summaries.get('mfe2')).toBe('1 expose · 1 declaration');
    expect(summaries.get(NF_HOST)).toBe('0 exposes · 0 declarations');
  });

  it('counts true private registrations in the summary, never chunk carriers', () => {
    const scopedSummaries = new Map(
      vmOf('scoped').rows.map((row) => [row.payload.name, row.payload.summary]),
    );
    expect(scopedSummaries.get('mfe1')).toContain('1 private registration');

    // non-dense mfe3 carries 7 reclassified `@nf-internal/` chunk carriers —
    // registry evidence, but presented as chunks, not as registrations.
    const nonDense = new Map(
      vmOf('non-dense').rows.map((row) => [row.payload.name, row.payload.summary]),
    );
    expect(nonDense.get('mfe3')).toContain('14 declarations');
    expect(nonDense.get('mfe3')).not.toContain('private registration');
  });

  // T8.6-AC-04: the ⚠ marker exists exactly for remotes with unresolved
  // declarations, and its tooltip carries the count.
  it('marks only remotes with unresolved declarations, count in the tooltip', () => {
    const multi = vmOf('synthetic-multi-version');
    const markers = new Map(multi.rows.map((row) => [row.payload.name, row.payload.unresolved]));
    expect(markers.get('calendar')).toEqual({
      count: 1,
      note: '1 declaration of this remote resolves nowhere in this capture',
    });
    expect(markers.get('chat')).toEqual({
      count: 1,
      note: '1 declaration of this remote resolves nowhere in this capture',
    });

    // Remotes whose declarations all resolve carry no marker.
    const live = vmOf('frankenstein-live');
    expect(live.rows.map((row) => row.payload.unresolved)).toEqual([null, null, null]);
  });

  it('renders an honest empty note when the capture holds no remotes', () => {
    const vm = vmOf('synthetic-empty-page');

    expect(vm.rows).toEqual([]);
    expect(vm.emptyNote).toBe('no remotes in this capture');
    expect(vm.detail).toBeNull();
  });
});

describe('buildRemoteDetail — identity, selection, capabilities', () => {
  it('resolves the host selection by the verbatim sentinel, displayed as host', () => {
    const detail = detailOf('frankenstein-live', NF_HOST);

    expect(detail.name).toBe(NF_HOST);
    expect(detail.display).toBe('host');
    expect(detail.host).toBe(true);
    // Scope URL as recorded (live registries keep relative URLs) plus the
    // resolved form.
    expect(detail.scopeUrl).toBe('./');
    expect(detail.resolvedScopeUrl).toBe('https://lutzleonhardt.de/frankenstein-meeting-room/');
  });

  it('yields no detail without a selection or for an unknown remote', () => {
    expect(vmOf('frankenstein-live').detail).toBeNull();
    expect(vmOf('frankenstein-live', { selectedName: 'display name' }).detail).toBeNull();
  });

  // T8.6-AC-06: the capability tooltips carry the source-verified
  // `(config: …)` provenance verbatim (T8.5 amendment). Chunk lists and
  // `bundle` are both denseChunking facets, so the live host gets one dense
  // chunking line naming both, and no multi-entry line (v4 `file` spelling).
  it('grounds the live capability matrix with the verified config provenance', () => {
    const host = detailOf('frankenstein-live', NF_HOST);
    expect(host.capabilities).toEqual([
      {
        label: 'dense chunking',
        note: "the registry records per-bundle chunk lists for this remote; this remote's registrations carry their serving bundle (config: features.denseChunking: true, default false, since core v4.0.0)",
      },
      {
        label: 'SRI',
        note: `integrity hashes recorded for this remote's files (config: features.integrityHashes: true, default false, since core v4.1.2)`,
      },
    ]);

    for (const remote of ['whiteboard', 'mermaid']) {
      const detail = detailOf('frankenstein-live', remote);
      expect(detail.capabilities.map((capability) => capability.label)).toEqual(['SRI']);
    }
  });
});

// share-pools T1: `bundle` is a denseChunking facet (core
// `bundle-shared.ts`), and a multi-entry `entries` map is the only stored trace
// of denseExternals — shared with host-side `convertFlatSharedInfo`.
describe('buildRemoteDetail — dense capabilities (share-pools T1)', () => {
  const labelsOf = (fixture: keyof typeof FIXTURES, remote: string) =>
    detailOf(fixture, remote).capabilities.map((capability) => capability.label);

  it('T1-AC-01: bundles with single-entry maps show dense chunking only', () => {
    for (const remote of ['mfe1', 'mfe2']) {
      expect(labelsOf('pooling-anchor', remote)).toContain('dense chunking');
      expect(labelsOf('pooling-anchor', remote)).not.toContain('multi-entry registrations');
    }
  });

  it('T1-AC-02: a multi-entry map shows the badge citing both producer flags', () => {
    const detail = detailOf('synthetic-dense-entries', 'mfe-dense');
    expect(detail.capabilities).toContainEqual({
      label: 'multi-entry registrations',
      note: 'a registration of this remote maps several entrypoints in one entries map (config: features.denseExternals: true at build, default false, since core v4.3.0 — or feature.convertFlatSharedInfo: true on the host, default false; the registry does not record which)',
    });
    // Its registrations carry no bundle and the fixture records no chunk lists.
    expect(labelsOf('synthetic-dense-entries', 'mfe-dense')).not.toContain('dense chunking');
  });

  // Real witnesses from the nf-lab corpus (share-pools T2): each build flag alone, and both.
  it.each([
    ['dense-chunking-only', ['dense chunking']],
    ['dense-externals-only', ['multi-entry registrations']],
    ['dense-both', ['dense chunking', 'multi-entry registrations']],
  ] as const)('%s: mfe1 shows exactly its dense capabilities', (fixture, expected) => {
    expect(labelsOf(fixture, 'mfe1').filter((label) => label !== 'SRI')).toEqual(expected);
  });

  it('T1-AC-03: a flat, bundle-less build shows neither dense capability', () => {
    for (const remote of modelOf('non-dense').remotes.map((entity) => entity.name)) {
      const labels = labelsOf('non-dense', remote);
      expect(labels).not.toContain('dense chunking');
      expect(labels).not.toContain('multi-entry registrations');
    }
  });
});

describe('buildRemoteDetail — provides zone (T8.6-AC-01)', () => {
  it('folds the own DECLARED-BY row into the block head and indents secondaries', () => {
    const detail = detailOf('frankenstein-live', NF_HOST);

    // Top-level blocks in registry order; secondaries grouped under their
    // name-derived parents (REAL registry keys, not entries-map sub-rows).
    expect(detail.provides.map((block) => block.packageName)).toEqual([
      '@angular/common',
      '@angular/platform-browser',
      'rxjs',
      'tslib',
      '@angular/core',
    ]);

    const common = detail.provides[0];
    expect(common.resolvedTag).toBe('21.2.12');
    expect(common.declared).toEqual({
      text: '^21.2.0',
      pinned: false,
      note: 'offers this copy to the version election',
    });
    expect(common.strict).toBe(true);
    expect(common.scopeLabel).toBeNull();
    // The norm renders no deviation chips — and never a `kept own copy`.
    expect(common.deviations).toEqual([]);
    expect(common.packageSelect).toBe('__GLOBAL__|@angular/common');
    expect(common.files).toHaveLength(1);
    expect(common.files[0].specifier).toBe('@angular/common');
    expect(common.files[0].showSpecifier).toBe(false);
    expect(common.secondaries.map((secondary) => secondary.suffix)).toEqual(['/http']);
    expect(common.secondaries[0].packageName).toBe('@angular/common/http');
    expect(common.secondaries[0].resolvedTag).toBe('21.2.12');
    expect(common.secondaries[0].strict).toBe(true);

    const core = detail.provides[4];
    expect(core.secondaries.map((secondary) => secondary.suffix)).toEqual([
      '/event-dispatch-contract.min.js',
      '/primitives/di',
      '/primitives/event-dispatch',
      '/primitives/signals',
      '/rxjs-interop',
    ]);

    // Self-consumption folds into the blocks — nothing else renders.
    expect(detail.consumes).toEqual([]);
    expect(detail.relationOnly).toEqual([]);
    expect(detail.unresolved).toEqual([]);
    expect(detail.diagnostics).toEqual([]);
  });

  it('keeps the strict share scope pinned with its scope chip on the block head', () => {
    for (const [remote, tag] of [
      ['mfe1', '1.0.0'],
      ['mfe2', '2.0.0'],
    ] as const) {
      const detail = detailOf('strict-scope', remote);
      expect(detail.provides).toHaveLength(1);
      const [block] = detail.provides;
      expect(block.scopeLabel).toBe('strict');
      expect(block.resolvedTag).toBe(tag);
      expect(block.declared.text).toBe(tag);
      expect(block.declared.pinned).toBe(true);
      expect(block.declared.note).toContain('exact tag');
      expect(block.declared.note).toContain('offers this copy to the version election');
      expect(block.deviations).toEqual([]);
      expect(detail.consumes).toEqual([]);
    }
  });
});

describe('buildRemoteDetail — consumes zone (T8.6-AC-02)', () => {
  it('renders the skip consumer as a consumes row with the skipped-own chip', () => {
    const detail = detailOf('clean-skip', 'mfe1');

    // The own copy lost the election — nothing is sourced by this remote.
    expect(detail.provides).toEqual([]);
    expect(detail.consumes).toHaveLength(1);
    const [row] = detail.consumes;
    expect(row.packageName).toBe('@nf-lab/conflict-lib');
    expect(row.packageSelect).toBe('__GLOBAL__|@nf-lab/conflict-lib');
    expect(row.declared.text).toBe('>=1.0.0 <3.0.0');
    expect(row.declared.pinned).toBe(false);
    // Registry action lives in the registration tooltip only (T8-H4).
    expect(row.declared.note).toBe(SKIP_NOTE);
    expect(row.via).toBeNull();
    expect(row.deviations.map((state) => state.label)).toEqual(['skipped own 1.0.0']);
    expect(row.deviations[0].note).toContain('registered with action skip');
    expect(row.deviations[0].note).toContain('resolves to the elected copy');
    // Winner file for the own file line — no arrow (screenshot review 3).
    expect(row.file).toBe('_nf_lab_conflict_lib.jvcc6K1csg.js');
    expect(row.source.label).toBe('mfe2');
    expect(row.source.remoteSelect).toBe('mfe2');
    expect(row.source.host).toBe(false);
    expect(row.source.note).toContain('exact target source');
    expect(detail.unresolved).toEqual([]);
  });

  it('keeps the selected consumer entirely on the provides side', () => {
    const detail = detailOf('clean-skip', 'mfe2');

    expect(detail.provides).toHaveLength(1);
    expect(detail.provides[0].packageName).toBe('@nf-lab/conflict-lib');
    expect(detail.provides[0].resolvedTag).toBe('2.0.0');
    expect(detail.provides[0].deviations).toEqual([]);
    expect(detail.consumes).toEqual([]);
  });

  it('renders the co-declared consumer with the not-selected chip from the source', () => {
    const detail = detailOf('co-declared-share', 'mfe2');

    expect(detail.provides).toEqual([]);
    expect(detail.consumes).toHaveLength(1);
    const [row] = detail.consumes;
    expect(row.declared.note).toBe('offers this copy to the version election');
    // The chip names its subject — a bare `not selected` next to the
    // winner file read as a statement about the elected copy (review 4).
    expect(row.deviations.map((state) => state.label)).toEqual(['own 1.0.0 not selected']);
    expect(row.deviations[0].note).toContain('a different composition may select it');
    expect(row.file).toBe('_nf_lab_conflict_lib.JF7uEdSVsN.js');
    expect(row.source.label).toBe('mfe1');
    expect(row.source.remoteSelect).toBe('mfe1');
  });
});

describe('buildRemoteDetail — registry action ≠ zone (T8.6-AC-03)', () => {
  it('renders the isolated copy with its audience and no kept-own-copy chip', () => {
    const detail = detailOf('strict-split', 'mfe3');

    expect(detail.provides).toHaveLength(1);
    const [block] = detail.provides;
    expect(block.resolvedTag).toBe('1.0.0');
    expect(block.deviations).toEqual([
      {
        label: 'isolated',
        note: 'the evidenced source is registered with action scope — an isolated copy',
      },
      {
        label: 'mapped only for mfe3',
        note: 'the scope registration’s own declarers — the isolated copy is mapped for them alone',
      },
    ]);
    // The scope action stays in the registration tooltip.
    expect(block.declared.note).toBe(SCOPE_NOTE);
    const labels = [
      ...block.deviations.map((deviation) => deviation.label),
      ...detail.consumes.flatMap((row) => row.deviations.map((state) => state.label)),
    ];
    expect(labels).not.toContain('kept own copy');
  });

  it('keeps the pooling anchor a provides block: anchored chip, skip in the tooltip', () => {
    const mfe1 = detailOf('pooling-anchor', 'mfe1');

    // skip + anchored → the copy still sits in PROVIDES; the skip action is
    // visible ONLY through the registration tooltip.
    expect(mfe1.provides).toHaveLength(1);
    const [block] = mfe1.provides;
    expect(block.packageName).toBe('@nf-lab/conflict-lib');
    expect(block.deviations).toEqual([
      {
        label: 'anchored',
        note: "explicit servedBy anchor: mfe1 — the binding resolves through the anchor's copy",
      },
    ]);
    expect(block.declared.note).toBe(SKIP_NOTE);
    // The secondary registry key indents under its parent block.
    expect(block.secondaries.map((secondary) => secondary.suffix)).toEqual(['/extra']);
    expect(block.secondaries[0].deviations).toEqual([]);
    // Both own claims fold into the blocks — no consumes row, no unresolved.
    expect(mfe1.consumes).toEqual([]);
    expect(mfe1.unresolved).toEqual([]);
  });

  it('renders the pooled consumer with anchored and not-selected consumes rows', () => {
    const mfe2 = detailOf('pooling-anchor', 'mfe2');

    expect(mfe2.provides).toEqual([]);
    expect(mfe2.consumes).toHaveLength(2);
    const [anchor, extra] = mfe2.consumes;
    expect(anchor.packageName).toBe('@nf-lab/conflict-lib');
    expect(anchor.deviations.map((state) => state.label)).toEqual(['anchored']);
    expect(anchor.file).toBe('_nf_lab_conflict_lib.JF7uEdSVsN.js');
    expect(anchor.source.label).toBe('mfe1');
    expect(anchor.declared.note).toBe(SKIP_NOTE);
    expect(extra.packageName).toBe('@nf-lab/conflict-lib/extra');
    expect(extra.deviations.map((state) => state.label)).toEqual(['own 1.0.0 not selected']);
    expect(extra.file).toBe('_nf_lab_conflict_lib_extra.GWjTDmPaoo.js');
    expect(extra.source.label).toBe('mfe1');
  });
});

describe('buildRemoteDetail — unresolved bucket (T8.6-AC-04)', () => {
  it('keeps both zones honest-empty and buckets the unmapped claim with its offer', () => {
    for (const [remote, tag] of [
      ['calendar', '1.2.3'],
      ['chat', '2.0.0'],
    ] as const) {
      const detail = detailOf('synthetic-multi-version', remote);
      expect(detail.provides).toEqual([]);
      expect(detail.consumes).toEqual([]);
      expect(detail.unresolved).toHaveLength(1);
      const [row] = detail.unresolved;
      expect(row.packageName).toBe('ui-lib');
      expect(row.strict).toBe(true);
      expect(row.specifier).toBeNull();
      expect(row.state).toEqual({
        label: 'not mapped',
        note: 'no applicable import-map binding for this specifier in this capture',
      });
      expect(row.offered).toEqual({
        label: `offered ${tag}`,
        note: 'the tag of the remote’s own version registration — this claim’s binding does not resolve in this capture',
      });
    }
  });
});

describe('buildRemoteDetail — deduped chunk section (T8.6-AC-01)', () => {
  it('dedupes the dense host to one row per bundle with a serves tail', () => {
    const chunks = detailOf('frankenstein-live', NF_HOST).chunks;

    expect(chunks.level).toBe('bundle-claims');
    if (chunks.level !== 'bundle-claims') {
      return;
    }
    expect(chunks.rule).toBe('canonical-bundle-claims');
    expect(chunks.note).toContain('one row per bundle');

    // Six copies claim browser-angular_core — the section renders it ONCE.
    const coreRows = chunks.rows.filter((row) => row.bundle === 'browser-angular_core');
    expect(coreRows).toHaveLength(1);
    const [core] = coreRows;
    expect(core.status).toBe('mapped-source');
    expect(core.fileClaim).toBe('5 chunk files');
    expect(core.files).toHaveLength(5);
    expect(core.serves).toBe('serves @angular/core +5 entries');
    expect(core.servesNote).toContain('@angular/core/rxjs-interop');

    // Two-package bundles list both keys, the secondary as its suffix.
    const common = chunks.rows.find((row) => row.bundle === 'browser-angular_common')!;
    expect(common.serves).toBe('serves @angular/common, /http');
    expect(common.fileClaim).toBe('1 chunk file');
    const rxjs = chunks.rows.find((row) => row.bundle === 'browser-rxjs')!;
    expect(rxjs.serves).toBe('serves rxjs, /operators');
    // A suffix-shortened tail keeps its grounded full-list tooltip…
    expect(rxjs.servesNote).toContain('rxjs/operators');

    // source-only bundles stay visibly qualified with the explicit absence.
    const tslib = chunks.rows.find((row) => row.bundle === 'browser-tslib')!;
    expect(tslib.status).toBe('source-only');
    expect(tslib.statusNote).toBe(
      'the source names this bundle, but the capture registers no chunk list for it',
    );
    expect(tslib.fileClaim).toBe('no chunk list recorded in this capture');
    expect(tslib.serves).toBe('serves tslib');
    // …while a tail that already names everything drops the noise tooltip
    // (screenshot review 2).
    expect(tslib.servesNote).toBeNull();
    // Presentation order: rows with a recorded chunk list precede the
    // list-less rows, bundle order within each group (screenshot review 2).
    expect(chunks.rows.map((row) => row.bundle)).toEqual([
      'browser-angular_common',
      'browser-angular_core',
      'browser-rxjs',
      'browser-angular_platform_browser',
      'browser-tslib',
    ]);
  });

  it('states explicit chunk absence for the v4 live remotes', () => {
    const chunks = detailOf('frankenstein-live', 'whiteboard').chunks;

    expect(chunks.level).toBe('none');
    if (chunks.level !== 'none') {
      return;
    }
    // Short visible line; the grounded explanation rides the tooltip
    // (screenshot review 3).
    expect(chunks.label).toBe('none in this capture');
    expect(chunks.note).toContain('no chunk evidence recorded');
    expect(chunks.note).toContain('dense-chunking capability absent');
  });

  it('renders reclassified carrier groups at their own level, never as scoped packages', () => {
    const detail = detailOf('non-dense', 'mfe3');

    expect(detail.scoped).toEqual([]);
    expect(detail.chunks.level).toBe('carrier-groups');
    if (detail.chunks.level !== 'carrier-groups') {
      return;
    }
    expect(detail.chunks.note).toContain('package attribution is not derivable');
    expect(detail.chunks.groups).toHaveLength(7);
    for (const group of detail.chunks.groups) {
      expect(group.groupId).toContain('chunk-group');
      expect(group.label.startsWith('@nf-internal/')).toBe(true);
      expect(group.fileClaim).toBe('1 file');
    }
  });

  it('attributes the private-sourced bundle claim with its serves tail', () => {
    const chunks = detailOf('scoped', 'mfe1').chunks;

    expect(chunks.level).toBe('bundle-claims');
    if (chunks.level !== 'bundle-claims') {
      return;
    }
    expect(chunks.rows).toHaveLength(1);
    expect(chunks.rows[0].bundle).toBe('browser-shared');
    expect(chunks.rows[0].status).toBe('source-only');
    expect(chunks.rows[0].serves).toBe('serves @nf-lab/conflict-lib');
  });
});

describe('buildRemoteDetail — private registrations (T8-AC-03 carry-over)', () => {
  it('renders two complete private registration → claim → resolution → copy paths', () => {
    const expectations = [
      ['mfe1', '1.0.0', '_nf_lab_conflict_lib.JF7uEdSVsN.js'],
      ['mfe2', '2.0.0', '_nf_lab_conflict_lib.jvcc6K1csg.js'],
    ] as const;
    for (const [remote, tag, file] of expectations) {
      const detail = detailOf('scoped', remote);

      // Private registrations never leak into the shared zones.
      expect(detail.provides).toEqual([]);
      expect(detail.consumes).toEqual([]);
      expect(detail.scoped).toHaveLength(1);
      const [scoped] = detail.scoped;
      // The canonical PrivateRegistrationId is retained as the identity.
      expect(scoped.registrationId).toContain('private-registration');
      expect(scoped.registrationId).toContain(remote);
      expect(scoped.packageName).toBe('@nf-lab/conflict-lib');
      expect(scoped.tag).toBe(tag);
      expect(scoped.bundle).toBe('browser-shared');
      expect(scoped.domainNote).toContain('no share action, no share scope');
      // No share action or share scope is fabricated — the vm shape has no
      // such field at all.
      expect(Object.keys(scoped).sort()).toEqual([
        'bundle',
        'claims',
        'domainNote',
        'packageName',
        'registrationId',
        'tag',
      ]);

      // claim → resolution → copy, complete.
      expect(scoped.claims).toHaveLength(1);
      const [claim] = scoped.claims;
      expect(claim.specifier).toBe('@nf-lab/conflict-lib');
      expect(claim.state.label).toBe('own mapping');
      expect(claim.state.note).toContain('private domain, no share action, no share scope');
      expect(claim.file).toBe(file);
      expect(claim.targetUrl).toContain(`/${remote}/`);
      expect(claim.copyTag).toBe(tag);
    }
  });
});

describe('buildRemoteDetail — exposes', () => {
  it('qualifies exposes with the remote name and joins the live /./ map target', () => {
    const detail = detailOf('frankenstein-live', 'whiteboard');

    expect(detail.exposes).toEqual([
      {
        qualified: 'whiteboard/./Bootstrap',
        moduleName: './Bootstrap',
        file: 'Bootstrap-7COJRA5I.js',
        mapTarget:
          'https://lutzleonhardt.de/frankenstein-meeting-room/whiteboard/Bootstrap-7COJRA5I.js',
        // T8.6-AC-06: the expose line carries the recorded integrity fact.
        hasIntegrity: true,
      },
    ]);
    expect(detail.exposes[0].qualified).toContain('/./');
  });

  it('keeps the host expose list honestly empty', () => {
    expect(detailOf('frankenstein-live', NF_HOST).exposes).toEqual([]);
  });
});

describe('buildRemotesVm — capture boundary and purity (T8.6-AC-06)', () => {
  it('claims the enumeration boundary as a capture limit in registry language', () => {
    const vm = vmOf('frankenstein-live');

    expect(vm.boundaryNote).toContain('registry trace');
    expect(vm.boundaryNote).toContain('cannot enumerate what the capture cannot see');
    // Delivery wording is gone — the capture records registry evidence,
    // never loading.
    expect(vm.boundaryNote).not.toContain('loaded');
    expect(vm.boundaryNote).not.toContain('error');
  });

  it('is pure: identical inputs produce identical output and stay unmodified', () => {
    const model = modelOf('pooling-anchor');
    const modelBefore = JSON.stringify(model);
    const ui: RemotesUiState = { selectedName: 'mfe2' };

    const first = buildRemotesVm(model, ui);
    const second = buildRemotesVm(model, ui);

    expect(second).toEqual(first);
    expect(JSON.stringify(model)).toBe(modelBefore);
  });
});

/** One seeded shared-external declaration (v4.5 spelling). */
function declarationOf(
  name: string,
  entries: Record<string, string>,
  bundle: string | null = null,
) {
  return {
    name,
    requiredVersion: '^1.0.0',
    strictVersion: false,
    file: null,
    entries,
    cached: true,
    bundle,
    servedFiles: Object.entries(entries).map(([entry, file]) => ({ entry, file })),
    generation: 'v4.5',
  } as const;
}

/** Minimal synthetic snapshot around seeded externals and map entries. */
function seedSnapshot(options: {
  remotes: Record<string, string>;
  sharedExternals?: NonNullable<SnapshotV1['runtime']>['sharedExternals'];
  scopedExternals?: NonNullable<SnapshotV1['runtime']>['scopedExternals'];
  imports?: { specifier: string; target: string }[];
  scopes?: { scope: string; imports: { specifier: string; target: string }[] }[];
}): SnapshotV1 {
  return {
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
      remotes: Object.fromEntries(
        Object.entries(options.remotes).map(([name, scopeUrl]) => [
          name,
          { scopeUrl, exposes: [], integrity: {} },
        ]),
      ),
      scopedExternals: options.scopedExternals ?? {},
      sharedExternals: options.sharedExternals ?? {},
      sharedChunks: {},
      generation: 'v4.5',
    },
    importMaps: {
      documentMaps: [
        {
          kind: 'importmap',
          parsed: true,
          importCount: options.imports?.length ?? 0,
          scopeCount: options.scopes?.length ?? 0,
          imports: options.imports ?? [],
          scopes: options.scopes ?? [],
          integrity: {},
        },
      ],
      effective: { imports: [], scopes: [], integrityFor: [] },
    },
    errors: [],
  };
}

function seededDetail(seed: SnapshotV1, selectedName: string): RemoteDetailVm {
  return buildRemotesVm(ingestSnapshot(seed), { selectedName }).detail!;
}

/**
 * Two equally specific remote scope prefixes match the resolved target and
 * no exact candidate does — the canonical attribution is `ambiguous-scope`
 * and it must NEVER form a provides block: the row renders on the consumes
 * side with the AMBIGUOUS qualifier chip visible (T8-H1, T8.6-AC-05).
 */
const AMBIGUOUS_SCOPE_SEED = seedSnapshot({
  remotes: {
    '__NF-HOST__': 'https://seed.example/',
    r1: 'https://seed.example/shared/',
    r2: 'https://seed.example/shared/',
  },
  sharedExternals: {
    __GLOBAL__: {
      'amb-lib': {
        dirty: false,
        versions: [
          {
            tag: '1.0.0',
            action: 'share',
            host: false,
            remotes: [declarationOf('r1', { 'amb-lib': 'a.js' })],
          },
        ],
      },
    },
  },
  imports: [{ specifier: 'amb-lib', target: './shared/b.js' }],
});

/**
 * The resolved target lives under the HOST scope only — the observed
 * attribution is the host as least-specific fallback and must render as an
 * observed (not exact, not own) source on the consumes side (T8-H1).
 */
const HOST_FALLBACK_SEED = seedSnapshot({
  remotes: {
    '__NF-HOST__': 'https://seed.example/',
    r1: 'https://seed.example/r1/',
  },
  sharedExternals: {
    __GLOBAL__: {
      'host-lib': {
        dirty: false,
        versions: [
          {
            tag: '1.0.0',
            action: 'share',
            host: false,
            remotes: [declarationOf('r1', { 'host-lib': 'a.js' })],
          },
        ],
      },
    },
  },
  imports: [{ specifier: 'host-lib', target: './host-lib.js' }],
});

/**
 * The resolved target lives on a foreign origin — no source record and no
 * scope prefix matches; the source must stay a QUALIFIED unknown
 * (T8-H1).
 */
const UNKNOWN_SOURCE_SEED = seedSnapshot({
  remotes: {
    '__NF-HOST__': 'https://seed.example/',
    r1: 'https://seed.example/r1/',
  },
  sharedExternals: {
    __GLOBAL__: {
      'cdn-lib': {
        dirty: false,
        versions: [
          {
            tag: '1.0.0',
            action: 'share',
            host: false,
            remotes: [declarationOf('r1', { 'cdn-lib': 'a.js' })],
          },
        ],
      },
    },
  },
  imports: [{ specifier: 'cdn-lib', target: 'https://cdn.example/lib.js' }],
});

describe('buildRemoteDetail — qualified attributions never provide (T8.6-AC-05)', () => {
  it('renders an ambiguous-scope attribution as a consumes row, never a provides block', () => {
    const detail = seededDetail(AMBIGUOUS_SCOPE_SEED, 'r1');

    expect(detail.provides).toEqual([]);
    expect(detail.consumes).toHaveLength(1);
    const [row] = detail.consumes;
    expect(row.file).toBe('b.js');
    expect(row.source.label).toBe('ambiguous source');
    expect(row.source.remoteSelect).toBeNull();
    // The outcome note names the remote's own registered file (T7.9).
    expect(row.deviations).toEqual([
      {
        label: 'own 1.0.0 not selected',
        note: 'own copy a.js is registered but not selected in this capture — the binding resolves to the selected copy; a different composition may select it',
      },
      {
        label: 'ambiguous source',
        note: 'equally specific remote scope prefixes match this target — none is chosen',
      },
    ]);
  });

  it('renders a host-fallback attribution as an observed target source', () => {
    const detail = seededDetail(HOST_FALLBACK_SEED, 'r1');

    expect(detail.provides).toEqual([]);
    expect(detail.consumes).toHaveLength(1);
    const [row] = detail.consumes;
    expect(row.file).toBe('host-lib.js');
    expect(row.source.label).toBe('host');
    expect(row.source.remoteSelect).toBe(NF_HOST);
    expect(row.source.host).toBe(true);
    expect(row.deviations.map((state) => state.label)).toEqual([
      'own 1.0.0 not selected',
      'observed target source',
    ]);
    const observed = row.deviations.find((state) => state.label === 'observed target source')!;
    expect(observed.note).toContain('host as least-specific fallback');
    expect(observed.note).toContain('not an exact candidate match');
  });

  it('keeps a source-less foreign target a QUALIFIED unknown source', () => {
    const detail = seededDetail(UNKNOWN_SOURCE_SEED, 'r1');

    expect(detail.provides).toEqual([]);
    expect(detail.consumes).toHaveLength(1);
    const [row] = detail.consumes;
    expect(row.file).toBe('lib.js');
    expect(row.source.label).toBe('unknown source');
    expect(row.deviations.map((state) => state.label)).toEqual([
      'own 1.0.0 not selected',
      'unknown source',
    ]);
    const unknown = row.deviations.find((state) => state.label === 'unknown source')!;
    expect(unknown.note).toBe(
      'only the resolved URL is evidenced — no source record or scope prefix matches',
    );
  });
});

/**
 * One declaration, TWO entrypoint claims with DIFFERENT outcomes: the main
 * specifier selects the own copy (→ provides block), the secondary
 * resolves to a foreign target no source or scope explains (→ consumes
 * row). The declaration renders in BOTH zones, the consumes row
 * `via`-prefixed — collapsing zones per declaration would hide a
 * confirmed-HIGH class of qualification (T8 round 2, T8.6-AC-05).
 */
const MULTI_ENTRY_QUALIFIER_SEED = seedSnapshot({
  remotes: {
    '__NF-HOST__': 'https://seed.example/',
    r1: 'https://seed.example/r1/',
  },
  sharedExternals: {
    __GLOBAL__: {
      'me-lib': {
        dirty: false,
        versions: [
          {
            tag: '1.0.0',
            action: 'share',
            host: false,
            remotes: [declarationOf('r1', { 'me-lib': 'main.js', 'me-lib/extra': 'x.js' })],
          },
        ],
      },
    },
  },
  imports: [{ specifier: 'me-lib/extra', target: 'https://cdn.example/extra.js' }],
  scopes: [{ scope: './r1/', imports: [{ specifier: 'me-lib', target: './r1/main.js' }] }],
});

/**
 * A scope-action registration whose own claim is selected: the provides
 * block carries `isolated` + audience, the scope action stays in the
 * registration tooltip, and NO `kept own copy` chip exists anywhere
 * (T8 round 2 grounding, T8.6 zone doctrine).
 */
const SCOPE_ACTION_SEED = seedSnapshot({
  remotes: {
    '__NF-HOST__': 'https://seed.example/',
    r1: 'https://seed.example/r1/',
  },
  sharedExternals: {
    __GLOBAL__: {
      'iso-lib': {
        dirty: false,
        versions: [
          {
            tag: '1.0.0',
            action: 'scope',
            host: false,
            remotes: [declarationOf('r1', { 'iso-lib': 'iso.js' })],
          },
        ],
      },
    },
  },
  scopes: [{ scope: './r1/', imports: [{ specifier: 'iso-lib', target: './r1/iso.js' }] }],
});

describe('buildRemoteDetail — one declaration, both zones (T8.6-AC-05)', () => {
  it('renders the own main claim as a provides block and the foreign secondary via-prefixed', () => {
    const detail = seededDetail(MULTI_ENTRY_QUALIFIER_SEED, 'r1');

    // Main claim: own copy → provides block (quiet head, no chips).
    expect(detail.provides).toHaveLength(1);
    expect(detail.provides[0].packageName).toBe('me-lib');
    expect(detail.provides[0].deviations).toEqual([]);
    // Secondary claim: foreign-resolving → consumes row, via-prefixed, with
    // its mapping state AND its source qualification visible.
    expect(detail.consumes).toHaveLength(1);
    const [row] = detail.consumes;
    expect(row.via).toBe('me-lib/extra');
    expect(row.deviations.map((state) => state.label)).toEqual([
      'own 1.0.0 not selected',
      'unknown source',
    ]);
    expect(row.file).toBe('extra.js');
    expect(row.source.label).toBe('unknown source');
    expect(detail.unresolved).toEqual([]);
  });

  it('keeps the isolated own copy a provides block with the scope note in the tooltip', () => {
    const detail = seededDetail(SCOPE_ACTION_SEED, 'r1');

    expect(detail.provides).toHaveLength(1);
    const [block] = detail.provides;
    expect(block.declared.note).toBe(SCOPE_NOTE);
    expect(block.deviations.map((deviation) => deviation.label)).toEqual([
      'isolated',
      'mapped only for r1',
    ]);
    expect(block.deviations.map((deviation) => deviation.label)).not.toContain('kept own copy');
    expect(detail.consumes).toEqual([]);
  });
});

/**
 * One remote, one bundle name, two DIFFERENTLY qualified claims: r1's own
 * copy claims `bundle-x` exactly (source-only — no chunk list recorded)
 * while an ambiguous-source copy lists r1 as one candidate for the SAME
 * bundle. The chunk section keeps one row PER QUALIFICATION — merging
 * would either hide the ambiguity or contaminate the exact claim
 * (Codex review 2).
 */
const MIXED_BUNDLE_SEED = seedSnapshot({
  remotes: {
    '__NF-HOST__': 'https://seed.example/',
    r1: 'https://seed.example/shared/',
    r2: 'https://seed.example/shared/',
  },
  sharedExternals: {
    __GLOBAL__: {
      'own-lib': {
        dirty: false,
        versions: [
          {
            tag: '1.0.0',
            action: 'share',
            host: false,
            remotes: [declarationOf('r1', { 'own-lib': 'own.js' }, 'bundle-x')],
          },
        ],
      },
      'dup-lib': {
        dirty: false,
        versions: [
          {
            tag: '1.0.0',
            action: 'share',
            host: false,
            remotes: [
              declarationOf('r1', { 'dup-lib': 'dup.js' }, 'bundle-x'),
              declarationOf('r2', { 'dup-lib': 'dup.js' }, 'bundle-y'),
            ],
          },
        ],
      },
    },
  },
  scopes: [
    {
      scope: './shared/',
      imports: [
        { specifier: 'own-lib', target: './shared/own.js' },
        { specifier: 'dup-lib', target: './shared/dup.js' },
      ],
    },
  ],
});

describe('buildRemoteDetail — mixed bundle qualifications stay separate rows', () => {
  it('keeps an exact and an ambiguous claim of one bundle as two qualified rows', () => {
    const detail = seededDetail(MIXED_BUNDLE_SEED, 'r1');

    // The ambiguous copy forms no provides block; only the own copy does.
    expect(detail.provides.map((block) => block.packageName)).toEqual(['own-lib']);

    const chunks = detail.chunks;
    expect(chunks.level).toBe('bundle-claims');
    if (chunks.level !== 'bundle-claims') {
      return;
    }
    const rows = chunks.rows.filter((row) => row.bundle === 'bundle-x');
    expect(rows.map((row) => row.status).sort()).toEqual(['ambiguous', 'source-only']);
    const ambiguous = rows.find((row) => row.status === 'ambiguous')!;
    expect(ambiguous.statusNote).toBe(
      'ambiguous source — this remote is one candidate for the bundle; chunks are not attributed',
    );
    expect(ambiguous.files).toEqual([]);
    const sourceOnly = rows.find((row) => row.status === 'source-only')!;
    expect(sourceOnly.fileClaim).toBe('no chunk list recorded in this capture');
    expect(sourceOnly.serves).toBe('serves own-lib');
    // The zone note says so explicitly.
    expect(chunks.note).toContain(
      'a differently qualified claim of the same bundle keeps its own row',
    );
  });
});

/**
 * r1 and r2 share one scope URL; r1's candidate is selected, r2 declares
 * WITHOUT entrypoint candidates. The canonical projection still records a
 * consumer-copy relation for r2 (a claim-less binding still relates) — the
 * consumes zone must surface it instead of dropping it (T8-H2).
 */
const RELATION_ONLY_SEED = seedSnapshot({
  remotes: {
    '__NF-HOST__': 'https://seed.example/',
    r1: 'https://seed.example/shared/',
    r2: 'https://seed.example/shared/',
  },
  sharedExternals: {
    __GLOBAL__: {
      'alias-lib': {
        dirty: false,
        versions: [
          {
            tag: '1.0.0',
            action: 'share',
            host: false,
            remotes: [declarationOf('r1', { 'alias-lib': 'lib.js' }), declarationOf('r2', {})],
          },
        ],
      },
    },
  },
  scopes: [
    {
      scope: './shared/',
      imports: [{ specifier: 'alias-lib', target: './shared/lib.js' }],
    },
  ],
});

describe('buildRemoteDetail — relation-only consumers stay visible (T8-H2)', () => {
  it('surfaces the claim-less consumer relation with copy, source, and binding', () => {
    const detail = seededDetail(RELATION_ONLY_SEED, 'r2');

    // The candidate-less declaration lands in the unresolved bucket…
    expect(detail.unresolved).toHaveLength(1);
    expect(detail.unresolved[0].state).toEqual({
      label: 'declared',
      note: 'declaration without entrypoint candidates — no resolution claim derivable',
    });
    expect(detail.unresolved[0].offered).toEqual({
      label: 'offered 1.0.0',
      note: 'the tag of the remote’s own version registration — no resolution claim is derivable for this declaration',
    });

    // …while the canonical relation shows where the binding resolves.
    expect(detail.relationOnly).toHaveLength(1);
    const [relation] = detail.relationOnly;
    expect(relation.relationId).toContain('consumer-copy-relation');
    expect(relation.packageName).toBe('alias-lib');
    expect(relation.copyTag).toBe('1.0.0');
    expect(relation.source.label).toBe('r1');
    expect(relation.source.note).toContain('exact target source');
    expect(relation.bindings).toEqual([
      {
        resolutionId: expect.stringContaining('alias-lib'),
        specifier: 'alias-lib',
        file: 'lib.js',
        targetUrl: 'https://seed.example/shared/lib.js',
      },
    ]);
    // "resolution claim", not "declaration" — a candidate-less DECLARATION
    // exists in this very seed (T8 review round 2).
    expect(relation.note).toContain('without an own resolution claim');
  });

  it('keeps the claim-backed consumer free of relation-only rows', () => {
    const detail = seededDetail(RELATION_ONLY_SEED, 'r1');

    expect(detail.provides).toHaveLength(1);
    expect(detail.consumes).toEqual([]);
    expect(detail.relationOnly).toEqual([]);
  });

  it('yields no relation-only rows in the fixture corpus (every relation is claim-backed)', () => {
    for (const name of ['co-declared-share', 'clean-skip', 'scoped', 'pooling-anchor'] as const) {
      const model = modelOf(name);
      for (const remote of model.remotes) {
        expect(buildRemotesVm(model, { selectedName: remote.name }).detail!.relationOnly).toEqual(
          [],
        );
      }
    }
  });
});

/**
 * A private registration whose own candidate is NOT the effective binding:
 * the claim maps (copyId attached) but the state must ground on the
 * canonical mappingState, never on the mere existence of a copy
 * (T8 review H3).
 */
const PRIVATE_NOT_SELECTED_SEED = seedSnapshot({
  remotes: {
    '__NF-HOST__': 'https://seed.example/',
    mfe1: 'https://seed.example/mfe1/',
  },
  scopedExternals: {
    mfe1: {
      'priv-lib': {
        tag: '1.0.0',
        bundle: 'bundle-p',
        entries: { 'priv-lib': 'own.js' },
      },
    },
  },
  scopes: [{ scope: './mfe1/', imports: [{ specifier: 'priv-lib', target: './mfe1/other.js' }] }],
});

/** A private registration serving TWO specifiers — both paths stay visible. */
const PRIVATE_MULTI_SEED = seedSnapshot({
  remotes: {
    '__NF-HOST__': 'https://seed.example/',
    mfe1: 'https://seed.example/mfe1/',
  },
  scopedExternals: {
    mfe1: {
      'multi-lib': {
        tag: '2.0.0',
        bundle: 'bundle-m',
        entries: { 'multi-lib': 'main.js', 'multi-lib/extra': 'extra.js' },
      },
    },
  },
  scopes: [
    {
      scope: './mfe1/',
      imports: [
        { specifier: 'multi-lib', target: './mfe1/main.js' },
        { specifier: 'multi-lib/extra', target: './mfe1/extra.js' },
      ],
    },
  ],
});

describe('buildRemoteDetail — private claim states ground on mappingState (T8-H3)', () => {
  it('renders a mapped-but-not-own private claim as NOT selected, never own mapping', () => {
    const detail = seededDetail(PRIVATE_NOT_SELECTED_SEED, 'mfe1');

    expect(detail.scoped).toHaveLength(1);
    const [scoped] = detail.scoped;
    expect(scoped.tag).toBe('1.0.0');
    expect(scoped.claims).toHaveLength(1);
    const [claim] = scoped.claims;
    expect(claim.state.label).toBe('not selected');
    expect(claim.state.note).toContain('not the effective binding in this capture');
    // The path stays complete: the binding's actual target and copy remain
    // visible beside the honest state.
    expect(claim.file).toBe('other.js');
    expect(claim.copyTag).toBeNull();
  });

  it('keeps every specifier path of a multi-entrypoint private registration visible', () => {
    const detail = seededDetail(PRIVATE_MULTI_SEED, 'mfe1');

    expect(detail.scoped).toHaveLength(1);
    const [scoped] = detail.scoped;
    expect(scoped.claims.map((claim) => claim.specifier)).toEqual(['multi-lib', 'multi-lib/extra']);
    for (const claim of scoped.claims) {
      expect(claim.state.label).toBe('own mapping');
      expect(claim.copyTag).toBe('2.0.0');
    }
    expect(scoped.claims.map((claim) => claim.file)).toEqual(['main.js', 'extra.js']);
  });
});

// share-pools T5: pool chips in the remote's provides / consumes rows.
describe('buildRemoteDetail — pool chips (share-pools T5)', () => {
  const tagsOf = (fixture: keyof typeof FIXTURES, remote: string) => {
    const detail = detailOf(fixture, remote);
    const rows = [
      ...detail.provides.flatMap((block) => [block, ...block.secondaries]),
      ...detail.consumes,
      ...detail.unresolved,
    ];
    return Object.fromEntries(rows.map((row) => [row.packageName, row.pool?.tag ?? null]));
  };

  it('T5-AC-01: mfe1 provides the tagged family; mfe2 consumes it, tagged too', () => {
    expect(tagsOf('pool-tag-coherent', 'mfe1')).toEqual({
      '@nf-lab/ui-core': 'ui',
      '@nf-lab/ui-dom': 'ui',
    });
    expect(tagsOf('pool-tag-coherent', 'mfe2')).toEqual({
      '@nf-lab/ui-core': 'ui',
      '@nf-lab/ui-dom': 'ui',
    });
    expect(tagsOf('pool-tag-anchored', 'mfe3')).toEqual({
      '@nf-lab/ui-core': null,
      '@nf-lab/ui-dom': null,
    });
  });

  it('T5-AC-01: the orphan tag is flagged on its declaring remote', () => {
    const detail = detailOf('pool-tag-orphan', 'mfe1');
    const core = [...detail.provides, ...detail.consumes].find(
      (row) => row.packageName === '@nf-lab/ui-core',
    )!;
    expect(core.pool).toMatchObject({ tag: 'ui', orphan: true });
  });
});
