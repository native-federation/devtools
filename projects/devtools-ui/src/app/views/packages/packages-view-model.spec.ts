/**
 * Packages view-model specs — canonical corpus acceptance of the T7.5
 * copy-block redesign over the T7 model. The builder consumes the Store
 * façade only (`resolutionProjection`, `effectiveConsumerResolutions`,
 * `registryEvidence`); every pin navigates canonical IDs through that
 * surface:
 *  - T7.5-AC-01: frankenstein-live `/primitives/signals` — exactly one copy
 *    block (21.2.12, host source, mapped file with SRI, `^21.2.0` STRICT
 *    consumer, 5 chunk files); default qualifiers are tooltip data only.
 *  - T7.5-AC-02: clean-skip renders the skip as a `skipped own 1.0.0` row
 *    annotation; co-declared-share renders mfe2 as a `not selected`
 *    consumer row of the single block, never unresolved.
 *  - T7.5-AC-03: strict-split renders two blocks (shared-elected first,
 *    isolated with audience) under the `⚠ 2 resolved versions` header.
 *  - T7.5-AC-04: synthetic-multi-version renders zero blocks, the honest
 *    no-copies line, and the `unresolved` bucket with offered tags.
 *  - T7.5-AC-05: rows are name + resolved versions only; the single-select
 *    participant filter combines with the Conflicts filter.
 *  - T7.5-AC-06: canonical IDs chain through the façade; every annotation
 *    keeps a grounded note; purity.
 *  - T7.9-AC-01/-02: the DECLARED BY outcome notes name the consumer's own
 *    registered file when the claim's candidate evidence carries it; with
 *    the evidence removed the outcome states itself alone.
 *  - T7.10-AC-01/-02/-03/-05: dense secondaries render as entrypoint
 *    sub-rows under their parent leaf (entries-map provenance, excluded
 *    from the package count, parent id as select target); copies without
 *    the package's own specifier carry the `secondary entrypoint only`
 *    head fact; flat-generation captures grow no sub-rows.
 */
import { FIXTURES, SnapshotV1 } from 'devtools-bridge';

import type { FederationModel } from '../../shared/store/federation-model';
import { ingestSnapshot } from '../../shared/store/ingest';
import {
  ConsumerRowVm,
  CopyBlockVm,
  PackageDetailVm,
  PackageRowVm,
  PackagesUiState,
  PackagesVm,
  buildPackagesVm,
  packageId,
} from './packages-view-model';

function modelOf(name: keyof typeof FIXTURES): FederationModel {
  return ingestSnapshot(FIXTURES[name]);
}

function vmOf(name: keyof typeof FIXTURES, ui: Partial<PackagesUiState> = {}): PackagesVm {
  return buildPackagesVm(modelOf(name), {
    filter: 'all',
    selectedParticipant: null,
    selectedId: null,
    ...ui,
  });
}

function packageRows(vm: PackagesVm): PackageRowVm[] {
  return vm.rows
    .map((row) => row.payload)
    .filter((payload): payload is PackageRowVm => payload.kind === 'package');
}

function consumerOf(block: CopyBlockVm, name: string): ConsumerRowVm {
  const consumer = block.consumers.find((candidate) => candidate.name === name);
  if (consumer === undefined) {
    throw new Error(`no consumer row ${name}`);
  }
  return consumer;
}

/** Every annotation of the detail must carry a grounded note (T7.5-AC-06). */
function allAnnotationsOf(detail: PackageDetailVm): { label: string; note: string }[] {
  return [
    ...detail.blocks.flatMap((block) => [
      ...block.deviations,
      ...block.consumers.flatMap((consumer) => consumer.deviations),
    ]),
    ...detail.unresolved.flatMap((row) => [row.state, ...(row.offered ? [row.offered] : [])]),
    ...detail.diagnostics,
    ...(detail.conflict ? [detail.conflict] : []),
    ...(detail.noCopies ? [detail.noCopies] : []),
  ];
}

const CONFLICT_LIB = packageId('__GLOBAL__', '@nf-lab/conflict-lib');

describe('buildPackagesVm — one block, consumers as rows (T7.5-AC-02, co-declared)', () => {
  const model = modelOf('co-declared-share');
  const vm = buildPackagesVm(model, {
    filter: 'all',
    selectedParticipant: null,
    selectedId: CONFLICT_LIB,
  });

  it('renders one copy block with mfe1 quiet and mfe2 as a not-selected consumer row', () => {
    expect(vm.detail!.blocks).toHaveLength(1);
    const [block] = vm.detail!.blocks;
    expect(block.resolvedTag).toBe('1.0.0');
    expect(block.source.display).toBe('mfe1');
    expect(block.disposition.label).toBe('shared');
    expect(block.files).toEqual([
      {
        specifier: '@nf-lab/conflict-lib',
        showSpecifier: false,
        file: '_nf_lab_conflict_lib.JF7uEdSVsN.js',
        targetUrl: 'http://localhost:4300/mfe1/_nf_lab_conflict_lib.JF7uEdSVsN.js',
        hasIntegrity: false,
        importMapSelect: '@nf-lab/conflict-lib',
      },
    ]);
    expect(consumerOf(block, 'mfe1').deviations).toEqual([]);
    expect(consumerOf(block, 'mfe2').deviations.map((deviation) => deviation.label)).toEqual([
      'not selected',
    ]);
    // Two consumer resolutions, one copy — the not-selected declaration is
    // a consumer row of the block, NEVER an unresolved entry.
    expect(vm.detail!.unresolved).toEqual([]);
    expect(vm.detail!.conflict).toBeNull();
  });

  it('grounds the not-selected note in the own registered file (T7.9-AC-01)', () => {
    const [block] = vm.detail!.blocks;
    // Capture-relative wording: the unselected own copy stays a legitimate
    // registration that a different composition may select — never dead weight.
    expect(consumerOf(block, 'mfe2').deviations).toEqual([
      {
        label: 'not selected',
        note: 'own copy _nf_lab_conflict_lib.JF7uEdSVsN.js is registered but not selected in this capture — the binding resolves to this copy; a different composition may select it',
      },
    ]);
  });

  it('chains the block and its consumers to the canonical projection by ID (T7.5-AC-06)', () => {
    const projection = model.resolutionProjection;
    expect(vm.detail!.blocks.map((block) => block.copyId)).toEqual(
      projection.copies.map((copy) => copy.id),
    );
    // The not-selected claim references the same copy the block renders.
    const claim = projection.declarationResolutionClaims.find(
      (candidate) => candidate.consumerRemote === 'mfe2',
    )!;
    expect(claim.copyId).toBe(vm.detail!.blocks[0].copyId);
    // Consumer rows track by canonical declaration IDs.
    const declarationIds = new Set(
      model.registryEvidence.participantDeclarations.map((declaration) => declaration.id),
    );
    for (const consumer of vm.detail!.blocks[0].consumers) {
      expect(declarationIds.has(consumer.declarationId as never)).toBe(true);
    }
  });
});

describe('buildPackagesVm — outcome without an evidenced own file (T7.9-AC-02)', () => {
  it('renders the outcome note without a file name when no candidate evidence exists', () => {
    // Seeded absence at the vm boundary: the same capture with its canonical
    // entrypoint-candidate evidence removed. The outcome must state itself
    // alone — no file name is ever invented.
    const base = modelOf('co-declared-share');
    const model: FederationModel = {
      ...base,
      registryEvidence: { ...base.registryEvidence, entrypointCandidates: [] },
    };
    const vm = buildPackagesVm(model, {
      filter: 'all',
      selectedParticipant: null,
      selectedId: CONFLICT_LIB,
    });
    const [block] = vm.detail!.blocks;
    expect(consumerOf(block, 'mfe2').deviations).toEqual([
      {
        label: 'not selected',
        note: 'the consumer’s own candidate is not selected in this capture — its binding resolves to this copy',
      },
    ]);
  });
});

describe('buildPackagesVm — frankenstein-live /primitives/signals (T7.5-AC-01)', () => {
  const signals = packageId('__GLOBAL__', '@angular/core/primitives/signals');
  const vm = vmOf('frankenstein-live', { selectedId: signals });
  const detail = vm.detail!;

  it('renders exactly one copy block with tag, host source, SRI file, STRICT consumer', () => {
    expect(detail.blocks).toHaveLength(1);
    const [block] = detail.blocks;
    expect(block.resolvedTag).toBe('21.2.12');
    expect(block.source.display).toBe('host');
    expect(block.source.host).toBe(true);
    expect(block.disposition.label).toBe('shared');
    expect(block.files).toEqual([
      expect.objectContaining({
        file: '_angular_core_primitives_signals.ePwPWbaXlE.js',
        showSpecifier: false,
        hasIntegrity: true,
      }),
    ]);
    expect(block.consumers).toEqual([
      expect.objectContaining({
        name: 'host',
        declared: { text: '^21.2.0', pinned: false },
        strict: true,
        deviations: [],
        viaSpecifiers: [],
      }),
    ]);
    expect(detail.unresolved).toEqual([]);
    expect(detail.diagnostics).toEqual([]);
  });

  it('nests the mapped-source chunk claim with its five files inside the block', () => {
    const [block] = detail.blocks;
    expect(block.chunks).toHaveLength(1);
    expect(block.chunks[0]).toEqual(
      expect.objectContaining({
        bundle: 'browser-angular_core',
        status: 'mapped-source',
        files: [
          'chunk-RCIWTGS7.js',
          'chunk-K6ZMRNMW.js',
          'chunk-APTZXQMF.js',
          'chunk-V2SUVJ7R.js',
          'chunk-2VMXMS7J.js',
        ],
        fileClaim: '5 chunk files',
        showSource: false,
      }),
    );
  });

  it('keeps default qualifiers as tooltip data only (never a visible label)', () => {
    const [block] = detail.blocks;
    // The default qualifier and roles stay notes; the visible vocabulary is
    // `shared` and the source chip.
    expect(block.source.qualifier).toBe('exact-target-source');
    expect(block.source.note).toContain('uniquely evidenced source record');
    expect(block.disposition.note).toContain('registered with action share');
    expect(block.disposition.note).toContain('ordinary-shared');
    expect(block.deviations).toEqual([]);
  });

  it('keeps the name-derived parent link of the secondary entrypoint', () => {
    expect(detail.parent).toEqual({
      packageName: '@angular/core',
      packageId: packageId('__GLOBAL__', '@angular/core'),
      rule: 'name-derived',
    });
  });
});

describe('buildPackagesVm — skip is a row annotation (T7.5-AC-02, clean-skip)', () => {
  const vm = vmOf('clean-skip', { selectedId: CONFLICT_LIB });

  it('renders one block whose mfe1 row carries skipped own 1.0.0 with a grounded note', () => {
    expect(vm.detail!.blocks).toHaveLength(1);
    const [block] = vm.detail!.blocks;
    expect(block.resolvedTag).toBe('2.0.0');
    expect(block.source.display).toBe('mfe2');
    expect(consumerOf(block, 'mfe2').deviations).toEqual([]);
    const skip = consumerOf(block, 'mfe1').deviations;
    // T7.9-AC-01: the outcome note names the consumer's own registered file.
    expect(skip).toEqual([
      {
        label: 'skipped own 1.0.0',
        note: 'own copy _nf_lab_conflict_lib.JF7uEdSVsN.js (1.0.0) is registered with action skip — the consumer resolves to the elected copy',
      },
    ]);
    // No separate skip section, no unresolved entry — the annotation IS the trace.
    expect(vm.detail!.unresolved).toEqual([]);
  });

  it('keeps the source-only chunk claim visibly qualified with the absence wording', () => {
    const [block] = vm.detail!.blocks;
    expect(block.chunks).toEqual([
      expect.objectContaining({
        bundle: 'browser-shared',
        status: 'source-only',
        files: [],
        fileClaim: 'no chunk list recorded in this capture',
      }),
    ]);
  });
});

describe('buildPackagesVm — conflict = visibly two blocks (T7.5-AC-03, strict-split)', () => {
  const vm = vmOf('strict-split', { selectedId: CONFLICT_LIB });
  const detail = vm.detail!;

  it('renders the ⚠ 2 resolved versions header and the elected block first', () => {
    expect(detail.conflict).toEqual({
      label: '⚠ 2 resolved versions',
      note: 'more than one distinct version resolves in this share scope (rule: resolved-tag-multiplicity)',
    });
    expect(detail.blocks.map((block) => block.resolvedTag)).toEqual(['2.0.0', '1.0.0']);
  });

  it('renders the shared block with the host source and the mfe1 skip row', () => {
    const [shared] = detail.blocks;
    expect(shared.disposition.label).toBe('shared');
    expect(shared.source.display).toBe('host');
    expect(shared.source.host).toBe(true);
    expect(consumerOf(shared, 'host').declared).toEqual({
      text: '>=1.0.0 <3.0.0',
      pinned: false,
    });
    expect(consumerOf(shared, 'host').deviations).toEqual([]);
    expect(consumerOf(shared, 'mfe1').declared.text).toBe('~1.0.0');
    expect(consumerOf(shared, 'mfe1').deviations.map((deviation) => deviation.label)).toEqual([
      'skipped own 1.0.0',
    ]);
  });

  it('renders the isolated block mapped only for mfe3 with STRICT and kept own copy', () => {
    const [, isolated] = detail.blocks;
    expect(isolated.disposition.label).toBe('isolated');
    expect(isolated.disposition.audience).toEqual({
      label: 'mapped only for mfe3',
      note: 'the scope registration’s own declarers — the isolated copy is mapped for them alone',
    });
    expect(isolated.source.display).toBe('mfe3');
    const mfe3 = consumerOf(isolated, 'mfe3');
    expect(mfe3.strict).toBe(true);
    // T7.9-AC-01: the outcome note names the consumer's own registered file.
    expect(mfe3.deviations).toEqual([
      {
        label: 'kept own copy',
        note: 'own copy _nf_lab_conflict_lib.JF7uEdSVsN.js is registered with action scope — the consumer keeps it, mapped only for its own declarers',
      },
    ]);
  });

  it('reduces the list row to versions with the non-elected one muted plus the glyph', () => {
    const [row] = packageRows(vm);
    expect(row.versions).toEqual([
      { tag: '2.0.0', muted: false, note: null },
      { tag: '1.0.0', muted: true, note: 'own copy of mfe3 (scope)' },
    ]);
    expect(row.conflict).toEqual({
      label: '⚠',
      note: '2 resolved versions — rule: resolved-tag-multiplicity',
    });
  });
});

describe('buildPackagesVm — anchored copies stay qualified (pooling-anchor)', () => {
  it('renders the anchor block with explicit-anchor source and anchored consumer rows', () => {
    const vm = vmOf('pooling-anchor', { selectedId: CONFLICT_LIB });
    const anchor = vm.detail!.blocks.find((block) => block.resolvedTag === '1.0.0')!;
    expect(anchor.source.qualifier).toBe('explicit-anchor');
    expect(anchor.source.display).toBe('mfe1');
    // The skip disposition stays a visibly qualified deviation, verbatim.
    expect(anchor.disposition.label).toBe('skip-registration');
    expect(anchor.disposition.note).toContain('anchor-source');
    for (const name of ['mfe1', 'mfe2']) {
      const deviations = consumerOf(anchor, name).deviations;
      expect(deviations.map((deviation) => deviation.label)).toEqual(['anchored']);
      expect(deviations[0].note).toContain('servedBy anchor: mfe1');
    }
  });

  it('renders /extra as one block where mfe2 is a not-selected consumer row', () => {
    const vm = vmOf('pooling-anchor', {
      selectedId: packageId('__GLOBAL__', '@nf-lab/conflict-lib/extra'),
    });
    expect(vm.detail!.blocks).toHaveLength(1);
    const [block] = vm.detail!.blocks;
    expect(block.source.display).toBe('mfe1');
    expect(consumerOf(block, 'mfe2').deviations.map((deviation) => deviation.label)).toEqual([
      'not selected',
    ]);
    // Only the selected declaration's bundle claim renders (T7-AC-04 kept).
    expect(block.chunks).toHaveLength(1);
    expect(block.chunks[0].status).toBe('source-only');
    expect(vm.detail!.unresolved).toEqual([]);
  });
});

describe('buildPackagesVm — strict scope shares side by side (T7.5-AC-03)', () => {
  it('renders two quiet shared blocks with pinned declared tags and no conflict', () => {
    const vm = vmOf('strict-scope', { selectedId: packageId('strict', '@nf-lab/conflict-lib') });
    const detail = vm.detail!;
    expect(detail.conflict).toBeNull();
    expect(detail.strictScope).toBe(true);
    expect(detail.blocks.map((block) => block.resolvedTag)).toEqual(['1.0.0', '2.0.0']);
    expect(detail.blocks.map((block) => block.disposition.label)).toEqual(['shared', 'shared']);
    expect(consumerOf(detail.blocks[0], 'mfe1').declared).toEqual({
      text: '1.0.0',
      pinned: true,
    });
    expect(consumerOf(detail.blocks[1], 'mfe2').declared).toEqual({
      text: '2.0.0',
      pinned: true,
    });
    expect(
      detail.blocks.flatMap((block) => block.consumers).every((c) => !c.deviations.length),
    ).toBe(true);
    const [row] = packageRows(vm);
    expect(row.conflict).toBeNull();
    expect(vm.conflictCount).toBe(0);
  });
});

describe('buildPackagesVm — honest empty + unresolved bucket (T7.5-AC-04)', () => {
  const uiLib = packageId('__GLOBAL__', 'ui-lib');
  const vm = vmOf('synthetic-multi-version', { selectedId: uiLib });

  it('renders zero blocks and the no-copies line for the map-less capture', () => {
    expect(vm.detail!.blocks).toEqual([]);
    expect(vm.detail!.noCopies).toEqual({
      label: 'no resolved copies in this capture',
      note: 'declared, but no import-map binding resolves this package in this capture',
    });
    const [row] = packageRows(vm);
    expect(row.versions).toEqual([]);
    expect(row.noCopy).toEqual({
      label: 'no copy',
      note: 'declared, but no import-map binding resolves this package in this capture',
    });
    expect(row.conflict).toBeNull();
  });

  it('lists every declaration in the unresolved bucket with state and offered tag', () => {
    expect(vm.detail!.unresolved).toEqual([
      expect.objectContaining({
        name: 'calendar',
        declared: { text: '^1.2.0', pinned: false },
        specifier: null,
        state: expect.objectContaining({ label: 'not mapped' }) as never,
        offered: expect.objectContaining({ label: 'offered 1.2.3' }) as never,
      }),
      expect.objectContaining({
        name: 'chat',
        declared: { text: '^2.0.0', pinned: false },
        state: expect.objectContaining({ label: 'not mapped' }) as never,
        offered: expect.objectContaining({ label: 'offered 2.0.0' }) as never,
      }),
    ]);
  });
});

/** One seeded shared-external declaration (v4.5 spelling). */
function declarationOf(
  name: string,
  entries: Record<string, string>,
  bundle: string | null = null,
  servedBy?: string,
) {
  return {
    name,
    requiredVersion: '^1.0.0',
    strictVersion: false,
    file: null,
    entries,
    cached: true,
    bundle,
    ...(servedBy === undefined ? {} : { servedBy }),
    servedFiles: Object.entries(entries).map(([entry, file]) => ({ entry, file })),
    generation: 'v4.5',
  } as const;
}

/** Minimal synthetic snapshot around seeded externals and map entries. */
function seedSnapshot(options: {
  remotes: Record<string, string>;
  sharedExternals: NonNullable<SnapshotV1['runtime']>['sharedExternals'];
  imports?: { specifier: string; target: string }[];
  scopes?: { scope: string; imports: { specifier: string; target: string }[] }[];
}): SnapshotV1 {
  return {
    schemaVersion: 1,
    capture: {
      pageUrl: 'https://seed.example/',
      capturedAt: '2026-08-19T00:00:00.000Z',
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
      scopedExternals: {},
      sharedExternals: options.sharedExternals,
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

const SEED_REMOTES = {
  '__NF-HOST__': 'https://seed.example/',
  mfe1: 'https://seed.example/mfe1/',
  mfe2: 'https://seed.example/mfe2/',
};

/**
 * Equal-tag seed: two share registrations of the SAME tag (and action —
 * canonical ordinals keep them distinct), each consumer's scoped map
 * selecting its own copy — two blocks, one resolved tag, no conflict.
 */
const EQUAL_TAG_SEED = seedSnapshot({
  remotes: SEED_REMOTES,
  sharedExternals: {
    __GLOBAL__: {
      'ui-lib': {
        dirty: false,
        versions: [
          {
            tag: '1.0.0',
            action: 'share',
            host: false,
            remotes: [declarationOf('mfe1', { 'ui-lib': 'ui-lib.AAAA.js' }, 'bundle-a')],
          },
          {
            tag: '1.0.0',
            action: 'share',
            host: false,
            remotes: [declarationOf('mfe2', { 'ui-lib': 'ui-lib.BBBB.js' }, 'bundle-b')],
          },
        ],
      },
    },
  },
  scopes: [
    { scope: './mfe1/', imports: [{ specifier: 'ui-lib', target: './mfe1/ui-lib.AAAA.js' }] },
    { scope: './mfe2/', imports: [{ specifier: 'ui-lib', target: './mfe2/ui-lib.BBBB.js' }] },
  ],
});

describe('buildPackagesVm — equal-tag copies are two blocks, no conflict', () => {
  const model = ingestSnapshot(EQUAL_TAG_SEED);
  const vm = buildPackagesVm(model, {
    filter: 'all',
    selectedParticipant: null,
    selectedId: packageId('__GLOBAL__', 'ui-lib'),
  });

  it('renders two blocks with one resolved tag and no conflict indicator', () => {
    expect(vm.detail!.blocks).toHaveLength(2);
    expect(new Set(vm.detail!.blocks.map((block) => block.resolvedTag))).toEqual(
      new Set(['1.0.0']),
    );
    expect(vm.detail!.conflict).toBeNull();
    const [row] = packageRows(vm);
    expect(row.versions).toEqual([{ tag: '1.0.0', muted: false, note: null }]);
    expect(row.conflict).toBeNull();
    expect(vm.conflictCount).toBe(0);
  });

  it('tracks blocks and consumer rows by canonical IDs (equal keys never collide)', () => {
    expect(new Set(vm.detail!.blocks.map((block) => block.copyId)).size).toBe(2);
    const declarationIds = vm.detail!.blocks.flatMap((block) =>
      block.consumers.map((consumer) => consumer.declarationId),
    );
    expect(new Set(declarationIds).size).toBe(2);
  });
});

/** Same package name in TWO share scopes — blocks must stay scope-specific. */
const MULTI_SCOPE_SEED = seedSnapshot({
  remotes: SEED_REMOTES,
  sharedExternals: {
    __GLOBAL__: {
      'ui-lib': {
        dirty: false,
        versions: [
          {
            tag: '1.0.0',
            action: 'share',
            host: false,
            remotes: [declarationOf('mfe1', { 'ui-lib': 'ui-lib.AAAA.js' })],
          },
        ],
      },
    },
    team: {
      'ui-lib': {
        dirty: false,
        versions: [
          {
            tag: '2.0.0',
            action: 'share',
            host: false,
            remotes: [declarationOf('mfe2', { 'ui-lib': 'ui-lib.BBBB.js' })],
          },
        ],
      },
    },
  },
  scopes: [
    { scope: './mfe1/', imports: [{ specifier: 'ui-lib', target: './mfe1/ui-lib.AAAA.js' }] },
    { scope: './mfe2/', imports: [{ specifier: 'ui-lib', target: './mfe2/ui-lib.BBBB.js' }] },
  ],
});

describe('buildPackagesVm — scope-specific blocks', () => {
  const model = ingestSnapshot(MULTI_SCOPE_SEED);
  const build = (selectedId: string) =>
    buildPackagesVm(model, { filter: 'all', selectedParticipant: null, selectedId });

  it('keeps each share scope of an equally named package to its own blocks', () => {
    const globalDetail = build(packageId('__GLOBAL__', 'ui-lib')).detail!;
    expect(globalDetail.blocks.map((block) => block.source.display)).toEqual(['mfe1']);
    expect(globalDetail.blocks.map((block) => block.resolvedTag)).toEqual(['1.0.0']);

    const teamDetail = build(packageId('team', 'ui-lib')).detail!;
    expect(teamDetail.blocks.map((block) => block.source.display)).toEqual(['mfe2']);
    expect(teamDetail.blocks.map((block) => block.resolvedTag)).toEqual(['2.0.0']);
  });
});

/** Deep subpath chain — every package keeps a row in the flat list. */
const SUBPATH_SEED = seedSnapshot({
  remotes: SEED_REMOTES,
  sharedExternals: {
    __GLOBAL__: {
      foo: {
        dirty: false,
        versions: [
          {
            tag: '1.0.0',
            action: 'share',
            host: false,
            remotes: [declarationOf('mfe1', { foo: 'foo.js' })],
          },
        ],
      },
      'foo/bar': {
        dirty: false,
        versions: [
          {
            tag: '1.0.0',
            action: 'share',
            host: false,
            remotes: [declarationOf('mfe1', { 'foo/bar': 'foo-bar.js' })],
          },
        ],
      },
      'foo/bar/baz': {
        dirty: false,
        versions: [
          {
            tag: '1.0.0',
            action: 'share',
            host: false,
            remotes: [declarationOf('mfe1', { 'foo/bar/baz': 'foo-bar-baz.js' })],
          },
        ],
      },
    },
  },
});

describe('buildPackagesVm — deep subpath chains keep every row', () => {
  it('links every subpath to its base package and loses no package', () => {
    const model = ingestSnapshot(SUBPATH_SEED);
    const vm = buildPackagesVm(model, {
      filter: 'all',
      selectedParticipant: null,
      selectedId: null,
    });
    expect(vm.packageCount).toBe(3);
    expect(vm.rows.map((row) => ({ id: row.id, depth: row.depth }))).toEqual([
      { id: packageId('__GLOBAL__', 'foo'), depth: 0 },
      { id: packageId('__GLOBAL__', 'foo/bar'), depth: 1 },
      { id: packageId('__GLOBAL__', 'foo/bar/baz'), depth: 1 },
    ]);
    expect(packageRows(vm).map((row) => row.displayName)).toEqual(['foo', '/bar', '/bar/baz']);
    const detail = buildPackagesVm(model, {
      filter: 'all',
      selectedParticipant: null,
      selectedId: packageId('__GLOBAL__', 'foo/bar/baz'),
    }).detail!;
    expect(detail.parent).toEqual({
      packageName: 'foo',
      packageId: packageId('__GLOBAL__', 'foo'),
      rule: 'name-derived',
    });
  });
});

/**
 * Two equally specific remote scope prefixes match the resolved target and
 * no exact candidate does — the canonical attribution is `ambiguous-scope`
 * (remote: null) and must render as an ambiguous source, never "unknown".
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

describe('buildPackagesVm — ambiguous scope attribution stays ambiguous', () => {
  const model = ingestSnapshot(AMBIGUOUS_SCOPE_SEED);
  const vm = buildPackagesVm(model, {
    filter: 'all',
    selectedParticipant: null,
    selectedId: packageId('__GLOBAL__', 'amb-lib'),
  });

  it('qualifies the block source as ambiguous and the tag as unknown', () => {
    const [block] = vm.detail!.blocks;
    expect(block.source.qualifier).toBe('ambiguous-source');
    expect(block.source.display).toBeNull();
    expect(block.source.note).toContain('equally specific remote scope prefixes');
    expect(block.disposition.label).toBe('target-only');
    expect(block.resolvedTag).toBeNull();
    expect(block.unknownTagNote).toBe('no uniquely evidenced source tag for this copy');
    expect(consumerOf(block, 'r1').name).toBe('r1');
  });

  it('surfaces the unknown-tag residual on the row and in the diagnostics footer', () => {
    const [row] = packageRows(vm);
    expect(row.unknownTagged).toEqual({
      count: 1,
      note: '1 copy without a uniquely evidenced source tag',
    });
    expect(vm.detail!.diagnostics).toEqual([
      {
        label: 'unknown tags: 1',
        note: '1 copy without a uniquely evidenced source tag',
      },
    ]);
  });
});

/**
 * One declaration claiming TWO specifiers: the main specifier resolves, the
 * secondary entrypoint stays unmapped — its claim must remain visible in
 * the unresolved bucket, never collapsed away.
 */
const MULTI_ENTRY_SEED = seedSnapshot({
  remotes: SEED_REMOTES,
  sharedExternals: {
    __GLOBAL__: {
      'ui-lib': {
        dirty: false,
        versions: [
          {
            tag: '1.0.0',
            action: 'share',
            host: false,
            remotes: [
              declarationOf('mfe1', {
                'ui-lib': 'ui-lib.AAAA.js',
                'ui-lib/sub': 'ui-lib-sub.BBBB.js',
              }),
            ],
          },
        ],
      },
    },
  },
  imports: [{ specifier: 'ui-lib', target: './mfe1/ui-lib.AAAA.js' }],
});

describe('buildPackagesVm — multi-entrypoint declarations keep every claim', () => {
  it('renders the resolved main claim as a row and the unmapped secondary in the bucket', () => {
    const model = ingestSnapshot(MULTI_ENTRY_SEED);
    const vm = buildPackagesVm(model, {
      filter: 'all',
      selectedParticipant: null,
      selectedId: packageId('__GLOBAL__', 'ui-lib'),
    });
    const [block] = vm.detail!.blocks;
    expect(consumerOf(block, 'mfe1').deviations).toEqual([]);
    expect(consumerOf(block, 'mfe1').viaSpecifiers).toEqual([]);
    // The unmapped secondary claim materializes no file line …
    expect(block.files.map((file) => file.specifier)).toEqual(['ui-lib']);
    // … and stays visible as its own unresolved entry with its specifier.
    expect(vm.detail!.unresolved).toEqual([
      expect.objectContaining({
        name: 'mfe1',
        specifier: 'ui-lib/sub',
        state: expect.objectContaining({ label: 'not mapped' }) as never,
        // The offered note is scoped to THIS claim — the same registration's
        // tag DOES resolve through the main claim, so the wording must never
        // assert capture-wide absence.
        offered: {
          label: 'offered 1.0.0',
          note: 'the tag of the consumer’s own version registration — this claim’s binding does not resolve in this capture',
        },
      }),
    ]);
  });
});

/**
 * Cross-package source convergence: this package's bindings map, but the
 * resolved copy is attributed to ANOTHER package's source. The no-copies
 * wording must not claim a missing import-map binding, and the mapped
 * binding surfaces as a diagnostics divergence, never as unresolved.
 */
const CROSS_SOURCE_SEED = seedSnapshot({
  remotes: SEED_REMOTES,
  sharedExternals: {
    __GLOBAL__: {
      'lib-a': {
        dirty: false,
        versions: [
          {
            tag: '1.0.0',
            action: 'share',
            host: false,
            remotes: [declarationOf('mfe1', { 'lib-a': 'a.js' })],
          },
        ],
      },
      'lib-b': {
        dirty: false,
        versions: [
          {
            tag: '1.0.0',
            action: 'share',
            host: false,
            remotes: [declarationOf('mfe2', { 'lib-a': 'shared.js', 'lib-b': 'b.js' })],
          },
        ],
      },
    },
  },
  imports: [
    { specifier: 'lib-a', target: './mfe2/shared.js' },
    { specifier: 'lib-b', target: './mfe2/b.js' },
  ],
});

describe('buildPackagesVm — missing source copy is not a missing binding', () => {
  it('states source-copy absence and reports the foreign resolution as divergence', () => {
    const model = ingestSnapshot(CROSS_SOURCE_SEED);
    const vm = buildPackagesVm(model, {
      filter: 'all',
      selectedParticipant: null,
      selectedId: packageId('__GLOBAL__', 'lib-a'),
    });
    const detail = vm.detail!;
    expect(detail.blocks).toEqual([]);
    expect(detail.noCopies).toEqual({
      label: 'no resolved copies in this capture',
      note: 'no source copy is attributed to this package — its bindings resolve to copies of other packages',
    });
    // The mapped binding is NOT unresolved — it diverges into the footer.
    expect(detail.unresolved).toEqual([]);
    expect(detail.diagnostics).toEqual([
      {
        label: 'mfe1 resolves lib-a to a copy of another package',
        note: "the claim's mapped binding materializes shared.js attributed to lib-b — no copy of this package is involved",
      },
    ]);
    const row = packageRows(vm).find((candidate) => candidate.packageName === 'lib-a')!;
    expect(row.noCopy).toEqual({
      label: 'no copy',
      note: 'no source copy is attributed to this package — its bindings resolve to copies of other packages',
    });
  });

  it('keeps the cross-package consumer visible under the copy it resolves to', () => {
    const model = ingestSnapshot(CROSS_SOURCE_SEED);
    const vm = buildPackagesVm(model, {
      filter: 'all',
      selectedParticipant: null,
      selectedId: packageId('__GLOBAL__', 'lib-b'),
    });
    // mfe1 declares under lib-a, resolves to lib-b's copy — it counts as
    // involvement, so it must render as a consumer row of that block, with
    // the foreign registry package named instead of posing as a declarer.
    const block = vm.detail!.blocks.find((candidate) =>
      candidate.files.some((file) => file.file === 'shared.js'),
    )!;
    expect(block.consumers.map((consumer) => consumer.name)).toEqual(['mfe2', 'mfe1']);
    const foreign = block.consumers[1];
    expect(foreign.declared).toEqual({ text: '^1.0.0', pinned: false });
    expect(foreign.deviations[0]).toEqual({
      label: 'declared under lib-a',
      note: 'this consumer declares the specifier under another registry package — its binding still resolves to this copy',
    });
    // The copy merges by its unique source (mfe2's declaration owns both
    // entrypoints), so the local declarer's claims include the package's
    // own specifier — its row stays quiet, the file lines carry lib-a.
    expect(block.consumers[0].viaSpecifiers).toEqual([]);
    expect(block.files.map((file) => file.specifier).sort()).toEqual(['lib-a', 'lib-b']);
  });
});

/**
 * Isolated copy with an anchored external consumer (the spec's canonical
 * `isolated-own` + `anchor-source` coexistence): the audience wording must
 * not claim "mapped only for" while an external consumer resolves there.
 */
const SCOPE_ANCHOR_SEED = seedSnapshot({
  remotes: SEED_REMOTES,
  sharedExternals: {
    __GLOBAL__: {
      'iso-lib': {
        dirty: false,
        versions: [
          {
            tag: '1.0.0',
            action: 'scope',
            host: false,
            remotes: [declarationOf('mfe1', { 'iso-lib': 'iso.js' })],
          },
          {
            tag: '1.0.0',
            action: 'skip',
            host: false,
            remotes: [declarationOf('mfe2', { 'iso-lib': 'iso-b.js' }, null, 'mfe1')],
          },
        ],
      },
    },
  },
  scopes: [
    { scope: './mfe1/', imports: [{ specifier: 'iso-lib', target: './mfe1/iso.js' }] },
    { scope: './mfe2/', imports: [{ specifier: 'iso-lib', target: './mfe1/iso.js' }] },
  ],
});

describe('buildPackagesVm — isolated audience stays honest under external consumers', () => {
  it('drops the "only" wording when consumers beyond the declarers resolve to the copy', () => {
    const model = ingestSnapshot(SCOPE_ANCHOR_SEED);
    const vm = buildPackagesVm(model, {
      filter: 'all',
      selectedParticipant: null,
      selectedId: packageId('__GLOBAL__', 'iso-lib'),
    });
    const [block] = vm.detail!.blocks;
    expect(block.disposition.label).toBe('isolated');
    expect(block.disposition.audience).toEqual({
      label: 'mapped for mfe1',
      note: 'the scope registration’s own declarers — consumers beyond them also resolve to this copy in this capture',
    });
    expect(consumerOf(block, 'mfe1').deviations.map((deviation) => deviation.label)).toEqual([
      'kept own copy',
    ]);
    expect(consumerOf(block, 'mfe2').deviations.map((deviation) => deviation.label)).toEqual([
      'anchored',
    ]);
  });
});

describe('buildPackagesVm — participant filter (T7.5-AC-05)', () => {
  it('lists every involved participant as a chip, host first', () => {
    const vm = vmOf('frankenstein-live');
    expect(vm.participants).toEqual([
      { name: '__NF-HOST__', host: true },
      { name: 'whiteboard', host: false },
      { name: 'mermaid', host: false },
    ]);
  });

  it('narrows the list to packages the participant is involved in', () => {
    const all = vmOf('pooling-anchor');
    expect(all.packageCount).toBe(2);
    // host sources/consumes only the base package — /extra is mfe1/mfe2 land.
    const host = vmOf('pooling-anchor', { selectedParticipant: '__NF-HOST__' });
    expect(host.packageCount).toBe(1);
    expect(packageRows(host).map((row) => row.packageName)).toEqual(['@nf-lab/conflict-lib']);
    // Consumers count as involvement: mfe2 resolves to both packages' copies.
    const mfe2 = vmOf('pooling-anchor', { selectedParticipant: 'mfe2' });
    expect(mfe2.packageCount).toBe(2);
  });

  it('combines with the Conflicts filter and stays honest when empty', () => {
    const combined = vmOf('pooling-anchor', {
      filter: 'conflicts',
      selectedParticipant: '__NF-HOST__',
    });
    expect(combined.conflictCount).toBe(1);
    expect(packageRows(combined).map((row) => row.packageName)).toEqual(['@nf-lab/conflict-lib']);

    const empty = vmOf('self-fill', { filter: 'conflicts', selectedParticipant: 'mfe1' });
    expect(empty.rows).toEqual([]);
    expect(empty.emptyNote).toBe('no version conflicts involve mfe1 in this capture');
  });
});

describe('buildPackagesVm — flat list, links, filter, scopes (structure preserved)', () => {
  it('lists all 20 live packages as flat leaf rows', () => {
    const vm = vmOf('frankenstein-live');
    expect(vm.packageCount).toBe(20);
    expect(packageRows(vm)).toHaveLength(20);
    expect(vm.rows.every((row) => !row.expandable)).toBe(true);
    expect(vm.scopes.reduce((sum, scope) => sum + scope.packageCount, 0)).toBe(20);
  });

  it('renders /extra as a linked sibling directly under its parent', () => {
    const vm = vmOf('self-fill');
    const extraRow = vm.rows.find(
      (row) => row.id === packageId('__GLOBAL__', '@nf-lab/conflict-lib/extra'),
    )!;
    expect(extraRow.depth).toBe(1);
    expect(vm.rows.indexOf(extraRow)).toBe(1);
    expect(extraRow.payload).toMatchObject({
      kind: 'package',
      displayName: '/extra',
      linked: { parentPackage: '@nf-lab/conflict-lib', rule: 'name-derived' },
    });
  });

  it('narrows the Conflicts filter to resolved-tag multiplicity only', () => {
    const clean = vmOf('self-fill', { filter: 'conflicts' });
    expect(clean.conflictCount).toBe(0);
    expect(clean.rows).toEqual([]);
    expect(clean.emptyNote).toBe('no version conflicts in this capture');

    const split = vmOf('strict-split', { filter: 'conflicts' });
    expect(split.conflictCount).toBe(1);
    expect(packageRows(split).map((row) => row.packageName)).toEqual(['@nf-lab/conflict-lib']);
  });

  it('reads the __GLOBAL__ sentinel as the global label, verbatim preserved', () => {
    const vm = vmOf('clean-skip');
    expect(vm.scopes).toEqual([{ scope: '__GLOBAL__', label: 'global', packageCount: 1 }]);
    const detail = vmOf('clean-skip', { selectedId: CONFLICT_LIB }).detail!;
    expect(detail.scope).toBe('__GLOBAL__');
    expect(detail.scopeDisplay).toBe('global');
  });
});

describe('buildPackagesVm — entrypoint sub-rows and the secondary-only head fact (T7.10)', () => {
  const DENSE_LIB = packageId('__GLOBAL__', '@nf-lab/dense-lib');
  const SPLIT_LIB = packageId('__GLOBAL__', '@nf-lab/split-lib');

  it('renders dense secondaries as sub-rows under their leaf, excluded from the count (T7.10-AC-01)', () => {
    const vm = vmOf('synthetic-dense-entries');
    // All (n) counts registry keys of the share register — never sub-rows.
    expect(vm.packageCount).toBe(2);
    expect(vm.rows.map((row) => [row.payload.kind, row.depth])).toEqual([
      ['package', 0],
      ['entrypoint', 1],
      ['package', 0],
      ['entrypoint', 1],
    ]);
    // The sub-row payload carries the PARENT group id (T7.10-AC-02: the
    // existing select convention reads packageId, so a click selects the
    // parent), the tag of its own registration, and entries-map provenance.
    const subRows = vm.rows.filter((row) => row.payload.kind === 'entrypoint');
    expect(subRows.map((row) => row.id)).toEqual([
      `${DENSE_LIB}|entry|@nf-lab/dense-lib/secondary`,
      `${SPLIT_LIB}|entry|@nf-lab/split-lib/secondary`,
    ]);
    expect(subRows.map((row) => row.payload)).toEqual([
      {
        kind: 'entrypoint',
        packageId: DENSE_LIB,
        specifier: '@nf-lab/dense-lib/secondary',
        displaySpecifier: '/secondary',
        tags: ['1.2.0'],
        provenance: {
          label: 'entry',
          note: 'registered via the entries map of @nf-lab/dense-lib@1.2.0 — no own registry key in this capture',
        },
      },
      {
        kind: 'entrypoint',
        packageId: SPLIT_LIB,
        specifier: '@nf-lab/split-lib/secondary',
        displaySpecifier: '/secondary',
        tags: ['3.1.4'],
        provenance: {
          label: 'entry',
          note: 'registered via the entries map of @nf-lab/split-lib@3.1.4 — no own registry key in this capture',
        },
      },
    ]);
  });

  it('follows the parent through the Conflicts and participant filters (T7.10-AC-01)', () => {
    // Conflicts: only split-lib flags multiplicity — its sub-row rides along,
    // dense-lib and its sub-row disappear together.
    const conflicts = vmOf('synthetic-dense-entries', { filter: 'conflicts' });
    expect(conflicts.rows.map((row) => [row.payload.kind, row.payload.packageId])).toEqual([
      ['package', SPLIT_LIB],
      ['entrypoint', SPLIT_LIB],
    ]);
    // Participant: mfe-dense is involved in both groups — all rows stay.
    const filtered = vmOf('synthetic-dense-entries', { selectedParticipant: 'mfe-dense' });
    expect(filtered.rows).toHaveLength(4);
  });

  it('never turns a filtered-out own registry key into a sub-row (T7.10-AC-05)', () => {
    // CROSS_SOURCE: lib-b's registration carries lib-a in its entries map
    // AND lib-a exists as its own registry key. The mfe2 filter hides lib-a
    // from the view (only mfe1 is involved there) — but "no own registry
    // key in this capture" is a CAPTURE claim, so the suppression must not
    // depend on the filtered hierarchy.
    const model = ingestSnapshot(CROSS_SOURCE_SEED);
    const filtered = buildPackagesVm(model, {
      filter: 'all',
      selectedParticipant: 'mfe2',
      selectedId: null,
    });
    expect(filtered.rows.map((row) => [row.payload.kind, row.payload.packageId])).toEqual([
      ['package', packageId('__GLOBAL__', 'lib-b')],
    ]);
    // Unfiltered, both keys render as rows — never as sub-rows.
    const unfiltered = buildPackagesVm(model, {
      filter: 'all',
      selectedParticipant: null,
      selectedId: null,
    });
    expect(unfiltered.rows.every((row) => row.payload.kind === 'package')).toBe(true);
  });

  it('witnesses several secondaries and multi-tag provenance under one leaf (T7.10-AC-01)', () => {
    // One leaf, two dense secondaries; /alpha is additionally carried by a
    // SECOND registration's entries map — the sub-row lists both tags and
    // the provenance names both registrations, join order = registry order.
    const seed = seedSnapshot({
      remotes: SEED_REMOTES,
      sharedExternals: {
        __GLOBAL__: {
          'ui-lib': {
            dirty: false,
            versions: [
              {
                tag: '1.0.0',
                action: 'share',
                host: false,
                remotes: [
                  declarationOf('mfe1', {
                    'ui-lib': 'ui-lib.AAAA.js',
                    'ui-lib/alpha': 'ui-lib-alpha.AAAA.js',
                    'ui-lib/beta': 'ui-lib-beta.AAAA.js',
                  }),
                ],
              },
              {
                tag: '2.0.0',
                action: 'share',
                host: false,
                remotes: [declarationOf('mfe2', { 'ui-lib/alpha': 'ui-lib-alpha.BBBB.js' })],
              },
            ],
          },
        },
      },
      imports: [
        { specifier: 'ui-lib', target: './mfe1/ui-lib.AAAA.js' },
        { specifier: 'ui-lib/alpha', target: './mfe1/ui-lib-alpha.AAAA.js' },
        { specifier: 'ui-lib/beta', target: './mfe1/ui-lib-beta.AAAA.js' },
      ],
    });
    const vm = buildPackagesVm(ingestSnapshot(seed), {
      filter: 'all',
      selectedParticipant: null,
      selectedId: null,
    });
    expect(vm.packageCount).toBe(1);
    expect(vm.rows.map((row) => [row.payload.kind, row.depth])).toEqual([
      ['package', 0],
      ['entrypoint', 1],
      ['entrypoint', 1],
    ]);
    const UI_LIB = packageId('__GLOBAL__', 'ui-lib');
    expect(
      vm.rows.filter((row) => row.payload.kind === 'entrypoint').map((row) => row.payload),
    ).toEqual([
      {
        kind: 'entrypoint',
        packageId: UI_LIB,
        specifier: 'ui-lib/alpha',
        displaySpecifier: '/alpha',
        tags: ['1.0.0', '2.0.0'],
        provenance: {
          label: 'entry',
          note: 'registered via the entries map of ui-lib@1.0.0, ui-lib@2.0.0 — no own registry key in this capture',
        },
      },
      {
        kind: 'entrypoint',
        packageId: UI_LIB,
        specifier: 'ui-lib/beta',
        displaySpecifier: '/beta',
        tags: ['1.0.0'],
        provenance: {
          label: 'entry',
          note: 'registered via the entries map of ui-lib@1.0.0 — no own registry key in this capture',
        },
      },
    ]);
  });

  it('flags copies without the package’s own specifier on the head (T7.10-AC-03)', () => {
    const split = vmOf('synthetic-dense-entries', { selectedId: SPLIT_LIB }).detail!;
    const secondary = split.blocks.find((block) => block.resolvedTag === '3.1.4')!;
    expect(secondary.deviations).toEqual([
      {
        label: 'secondary entrypoint only',
        note: 'this copy serves @nf-lab/split-lib/secondary — the package’s own specifier @nf-lab/split-lib does not resolve to it in this capture; the tag names the entrypoint’s registration, not a version of the whole package',
      },
    ]);
    expect(split.blocks.find((block) => block.resolvedTag === '3.0.0')!.deviations).toEqual([]);
    // The happy dense block (parent + secondary in one copy) carries no fact.
    const dense = vmOf('synthetic-dense-entries', { selectedId: DENSE_LIB }).detail!;
    expect(dense.blocks).toHaveLength(1);
    expect(dense.blocks[0].deviations).toEqual([]);
  });

  it('grows no sub-rows on flat-generation captures (T7.10-AC-05)', () => {
    // Flat builds register secondaries as their own registry keys — the
    // linked presentation stays, and no entrypoint sub-row appears.
    for (const fixture of ['non-dense', 'self-fill', 'frankenstein-live'] as const) {
      const vm = vmOf(fixture);
      expect(vm.rows.every((row) => row.payload.kind === 'package')).toBe(true);
    }
    const nonDense = vmOf('non-dense');
    expect(packageRows(nonDense).some((row) => row.linked !== null)).toBe(true);
  });
});

describe('buildPackagesVm — grounded annotations and purity (T7.5-AC-06)', () => {
  it('gives every annotation of the corpus details a non-empty grounded note', () => {
    const cases: [keyof typeof FIXTURES, string][] = [
      ['co-declared-share', CONFLICT_LIB],
      ['clean-skip', CONFLICT_LIB],
      ['strict-split', CONFLICT_LIB],
      ['pooling-anchor', CONFLICT_LIB],
      ['synthetic-multi-version', packageId('__GLOBAL__', 'ui-lib')],
      ['synthetic-dense-entries', packageId('__GLOBAL__', '@nf-lab/split-lib')],
      ['frankenstein-live', packageId('__GLOBAL__', '@angular/core/primitives/signals')],
    ];
    for (const [fixture, selectedId] of cases) {
      const detail = vmOf(fixture, { selectedId }).detail!;
      for (const annotation of allAnnotationsOf(detail)) {
        expect(annotation.note.length).toBeGreaterThan(0);
      }
    }
  });

  it('is pure: identical inputs produce identical output and stay unmodified', () => {
    const model = modelOf('self-fill');
    const modelBefore = JSON.stringify(model);
    const ui: PackagesUiState = {
      filter: 'all',
      selectedParticipant: 'mfe1',
      selectedId: CONFLICT_LIB,
    };

    const first = buildPackagesVm(model, ui);
    const second = buildPackagesVm(model, ui);

    expect(second).toEqual(first);
    expect(JSON.stringify(model)).toBe(modelBefore);
  });
});

// share-pools T5: a declaration's explicit pool tag renders as a
// chip; an orphan tag (joined nothing) is flagged. Untagged rows get none.
describe('buildPackageDetail — pool chips (share-pools T5)', () => {
  const chipsOf = (fixture: keyof typeof FIXTURES, pkg: string) => {
    const detail = vmOf(fixture, { selectedId: `__GLOBAL__|${pkg}` }).detail!;
    return detail.blocks
      .flatMap((block) => block.consumers)
      .map((consumer) => ({ name: consumer.name, pool: consumer.pool }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  it('T5-AC-01: both family members carry the tag for both remotes', () => {
    for (const pkg of ['@nf-lab/ui-core', '@nf-lab/ui-dom']) {
      const chips = chipsOf('pool-tag-coherent', pkg);
      expect(chips.map((chip) => chip.name)).toEqual(['mfe1', 'mfe2']);
      for (const { pool } of chips) {
        expect(pool).toEqual({
          tag: 'ui',
          note: 'explicit pool tag declared by this remote (config: pool on the shared external) — member of pool ui',
          orphan: false,
          poolSelect: 'tag-pool:["__GLOBAL__","@nf-lab/ui-core",0]',
        });
      }
    }
  });

  it('T5-AC-01: an orphan tag warns; an untagged declaration shows no chip', () => {
    const chips = chipsOf('pool-tag-orphan', '@nf-lab/ui-core');
    expect(chips.find((chip) => chip.name === 'mfe1')!.pool).toMatchObject({
      tag: 'ui',
      orphan: true,
      poolSelect: null,
    });
    expect(chips.find((chip) => chip.name === 'mfe1')!.pool!.note).toContain(
      'likely a typo or a missing sibling',
    );
    expect(chips.find((chip) => chip.name === 'mfe2')!.pool).toBeNull();
  });
});
