/**
 * Packages view-model specs over the T7 model. The builder consumes the Store
 * façade only (`resolutionProjection`, `effectiveConsumerResolutions`,
 * `registryEvidence`); every pin navigates canonical IDs through that
 * surface:
 *  - T7.5-AC-02: resolved bindings (skip, not-selected) never land in the
 *    `unresolved` bucket.
 *  - T7.5-AC-04: synthetic-multi-version renders the honest no-copies line
 *    and the `unresolved` bucket with offered tags.
 *  - T7.5-AC-05: rows are name + copy count + marks; the single-select
 *    participant filter combines with the status filters.
 *  - T7.5-AC-06: every annotation keeps a grounded note; purity.
 *  - T7.10-AC-01/-05: dense secondaries grow no list rows; flat-generation
 *    secondaries stay linked rows.
 */
import { FIXTURES, SnapshotV1 } from 'devtools-bridge';

import type { FederationModel } from '../../shared/store/federation-model';
import { ingestSnapshot } from '../../shared/store/ingest';
import {
  PackageDetailVm,
  PackageRowVm,
  PackagesFilter,
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
  return vm.rows.map((row) => row.payload);
}

/** Packages a status filter keeps within the participant selection. */
function countOf(vm: PackagesVm, id: PackagesFilter = 'all'): number {
  return vm.filters.find((option) => option.id === id)!.count;
}

/** Every annotation of the detail must carry a grounded note (T7.5-AC-06). */
function allAnnotationsOf(detail: PackageDetailVm): { label: string; note: string }[] {
  return [
    ...detail.unresolved.flatMap((row) => [row.state, ...(row.offered ? [row.offered] : [])]),
    ...detail.diagnostics,
    ...(detail.noCopies ? [detail.noCopies] : []),
  ];
}

const CONFLICT_LIB = packageId('__GLOBAL__', '@nf-lab/conflict-lib');

describe('buildPackagesVm — resolved bindings stay out of the bucket (T7.5-AC-02, co-declared)', () => {
  it('keeps the not-selected declaration out of the unresolved bucket', () => {
    const vm = vmOf('co-declared-share', { selectedId: CONFLICT_LIB });
    // Two consumer resolutions, one copy — the not-selected declaration
    // resolves, so it is NEVER an unresolved entry.
    expect(vm.detail!.noCopies).toBeNull();
    expect(vm.detail!.unresolved).toEqual([]);
    expect(vm.detail!.diagnostics).toEqual([]);
  });
});

describe('buildPackagesVm — frankenstein-live /primitives/signals (T7.5-AC-01)', () => {
  const signals = packageId('__GLOBAL__', '@angular/core/primitives/signals');
  const vm = vmOf('frankenstein-live', { selectedId: signals });
  const detail = vm.detail!;

  it('renders no bindings section facts for the resolved strict host binding', () => {
    expect(detail.noCopies).toBeNull();
    expect(detail.unresolved).toEqual([]);
    expect(detail.diagnostics).toEqual([]);
  });

  it('keeps the name-derived parent link of the secondary entrypoint', () => {
    expect(detail.parent).toEqual({
      packageName: '@angular/core',
      packageId: packageId('__GLOBAL__', '@angular/core'),
      rule: 'name-derived',
    });
  });
});

describe('buildPackagesVm — skip resolves, never unresolved (T7.5-AC-02, clean-skip)', () => {
  it('keeps the skipping consumer out of the unresolved bucket', () => {
    const vm = vmOf('clean-skip', { selectedId: CONFLICT_LIB });
    expect(vm.detail!.unresolved).toEqual([]);
    expect(vm.detail!.diagnostics).toEqual([]);
  });
});

describe('buildPackagesVm — two resolved versions (T7.5-AC-03, strict-split)', () => {
  const vm = vmOf('strict-split', { selectedId: CONFLICT_LIB });

  it('reduces the list row to the copy count and its marks', () => {
    const [row] = packageRows(vm);
    expect(row.copies).toMatchObject({ count: 2, label: '2 copies' });
    // mfe1's non-strict ~1.0.0 rejects the shared 2.0.0 but is stored `skip`.
    expect(row.marks).toEqual([
      {
        kind: 'out-of-range',
        note: 'mfe1 resolves to a shared version its range rejects (not strict)',
      },
      { kind: 'isolated', note: 'mfe3 keeps its own copy' },
    ]);
    expect(countOf(vm, 'multi')).toBe(1);
  });
});

describe('buildPackagesVm — anchored bindings resolve (pooling-anchor)', () => {
  it('keeps /extra’s not-selected mfe2 out of the unresolved bucket', () => {
    const vm = vmOf('pooling-anchor', {
      selectedId: packageId('__GLOBAL__', '@nf-lab/conflict-lib/extra'),
    });
    expect(vm.detail!.unresolved).toEqual([]);
  });
});

describe('buildPackagesVm — strict scope shares side by side (T7.5-AC-03)', () => {
  it('marks nothing and counts no multiple versions in the strict scope', () => {
    const vm = vmOf('strict-scope', { selectedId: packageId('strict', '@nf-lab/conflict-lib') });
    const detail = vm.detail!;
    expect(detail.scope).toBe('strict');
    expect(detail.unresolved).toEqual([]);
    const [row] = packageRows(vm);
    expect(row.marks).toEqual([]);
    expect(row.strict).not.toBeNull();
    expect(countOf(vm, 'multi')).toBe(0);
  });
});

describe('buildPackagesVm — honest empty + unresolved bucket (T7.5-AC-04)', () => {
  const uiLib = packageId('__GLOBAL__', 'ui-lib');
  const vm = vmOf('synthetic-multi-version', { selectedId: uiLib });

  it('renders the no-copies line for the map-less capture', () => {
    expect(vm.detail!.noCopies).toEqual({
      label: 'no resolved copies in this capture',
      note: 'declared, but no import-map binding resolves this package in this capture',
    });
    const [row] = packageRows(vm);
    expect(row.copies).toEqual({
      count: 0,
      label: 'no copy',
      note: 'declared, but no import-map binding resolves this package in this capture',
    });
    expect(row.marks).toEqual([]);
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
 * selecting its own copy — two copies, one resolved tag, no conflict.
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

describe('buildPackagesVm — equal-tag copies are no conflict', () => {
  const model = ingestSnapshot(EQUAL_TAG_SEED);
  const vm = buildPackagesVm(model, {
    filter: 'all',
    selectedParticipant: null,
    selectedId: packageId('__GLOBAL__', 'ui-lib'),
  });

  it('counts one resolved tag and raises no multiple-versions mark', () => {
    const [row] = packageRows(vm);
    expect(row.copies).toMatchObject({ count: 1, label: '1 copy' });
    expect(row.marks).toEqual([]);
    expect(countOf(vm, 'multi')).toBe(0);
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
    expect(countOf(vm)).toBe(3);
    // Each subpath nests under its nearest package prefix.
    expect(vm.rows.map((row) => ({ id: row.id, depth: row.depth }))).toEqual([
      { id: 'foo', depth: 0 },
      { id: 'foo/bar', depth: 1 },
      { id: 'foo/bar/baz', depth: 2 },
    ]);
    expect(packageRows(vm).map((row) => row.displayName)).toEqual(['foo', '/bar', '/baz']);
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
 * (remote: null), so the copy's tag stays unknown.
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

describe('buildPackagesVm — ambiguous scope attribution leaves the tag unknown', () => {
  const model = ingestSnapshot(AMBIGUOUS_SCOPE_SEED);
  const vm = buildPackagesVm(model, {
    filter: 'all',
    selectedParticipant: null,
    selectedId: packageId('__GLOBAL__', 'amb-lib'),
  });

  it('surfaces the unknown-tag residual on the row and in the diagnostics footer', () => {
    const [row] = packageRows(vm);
    expect(row.copies).toEqual({
      count: 1,
      label: '1 copy',
      note: '1 copy mapped: 1 copy without a uniquely evidenced source tag',
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
  it('lists the unmapped secondary claim in the bucket, not the resolved main claim', () => {
    const model = ingestSnapshot(MULTI_ENTRY_SEED);
    const vm = buildPackagesVm(model, {
      filter: 'all',
      selectedParticipant: null,
      selectedId: packageId('__GLOBAL__', 'ui-lib'),
    });
    // Only the unmapped secondary claim is an unresolved entry, with its specifier.
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
    expect(row.copies).toEqual({
      count: 0,
      label: 'no copy',
      note: 'no source copy is attributed to this package — its bindings resolve to copies of other packages',
    });
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
    expect(countOf(all)).toBe(2);
    // host sources/consumes only the base package — /extra is mfe1/mfe2 land.
    const host = vmOf('pooling-anchor', { selectedParticipant: '__NF-HOST__' });
    expect(countOf(host)).toBe(1);
    expect(packageRows(host).map((row) => row.packageName)).toEqual(['@nf-lab/conflict-lib']);
    // Consumers count as involvement: mfe2 resolves to both packages' copies.
    const mfe2 = vmOf('pooling-anchor', { selectedParticipant: 'mfe2' });
    expect(countOf(mfe2)).toBe(2);
  });

  it('combines with the status filter and stays honest when empty', () => {
    const combined = vmOf('pooling-anchor', {
      filter: 'multi',
      selectedParticipant: '__NF-HOST__',
    });
    expect(countOf(combined, 'multi')).toBe(1);
    expect(packageRows(combined).map((row) => row.packageName)).toEqual(['@nf-lab/conflict-lib']);

    const empty = vmOf('dense-chunking-only', { filter: 'multi', selectedParticipant: 'mfe1' });
    expect(empty.rows).toEqual([]);
    expect(empty.emptyNote).toBe('no packages with multiple versions involve mfe1 in this capture');
  });
});

describe('buildPackagesVm — flat list, links, filter, scopes (structure preserved)', () => {
  it('lists all 20 live packages as flat leaf rows', () => {
    const vm = vmOf('frankenstein-live');
    expect(countOf(vm)).toBe(20);
    expect(packageRows(vm)).toHaveLength(20);
    expect(vm.rows.every((row) => !row.expandable)).toBe(true);
    expect(vm.scopes.reduce((sum, scope) => sum + scope.packageCount, 0)).toBe(20);
  });

  it('renders /extra as a linked sibling directly under its parent', () => {
    const vm = vmOf('dense-chunking-only');
    const extraRow = vm.rows.find((row) => row.id === '@nf-lab/dense-lib/extra')!;
    expect(extraRow.depth).toBe(1);
    expect(vm.rows.indexOf(extraRow)).toBe(1);
    expect(extraRow.payload).toMatchObject({
      kind: 'package',
      displayName: '/extra',
      linked: { parentPackage: '@nf-lab/dense-lib', rule: 'name-derived' },
    });
  });

  // declared-packages (orchestrator 4.9): three packages a dense build declared under one npm name.
  it('links no declared package under the name above it; without dense it links them', () => {
    const linkedOf = (vm: PackagesVm) =>
      packageRows(vm).map((row) => [row.displayName, row.linked?.parentPackage ?? null]);
    expect(linkedOf(vmOf('declared-packages'))).toEqual([
      ['@nf-lab/ws', null],
      ['@nf-lab/ws/dialog', null],
      ['@nf-lab/ws/table', null],
    ]);

    const snapshot = structuredClone(FIXTURES['declared-packages']) as SnapshotV1;
    for (const external of Object.values(snapshot.runtime!.sharedExternals['__GLOBAL__']))
      for (const version of external.versions)
        for (const copy of version.remotes) delete copy.dense;
    const vm = buildPackagesVm(ingestSnapshot(snapshot), {
      filter: 'all',
      selectedParticipant: null,
      selectedId: null,
    });
    expect(linkedOf(vm)).toEqual([
      ['@nf-lab/ws', null],
      ['/dialog', '@nf-lab/ws'],
      ['/table', '@nf-lab/ws'],
    ]);
  });

  it('narrows Multiple versions to resolved-tag multiplicity only', () => {
    const clean = vmOf('dense-chunking-only', { filter: 'multi' });
    expect(countOf(clean, 'multi')).toBe(0);
    expect(clean.rows).toEqual([]);
    expect(clean.emptyNote).toBe('no packages with multiple versions in this capture');

    const split = vmOf('strict-split', { filter: 'multi' });
    expect(countOf(split, 'multi')).toBe(1);
    expect(packageRows(split).map((row) => row.packageName)).toEqual(['@nf-lab/conflict-lib']);
  });

  it('reads the __GLOBAL__ sentinel as the global label, verbatim preserved', () => {
    const vm = vmOf('clean-skip');
    expect(vm.scopes).toEqual([{ scope: '__GLOBAL__', label: 'global', packageCount: 1 }]);
    const detail = vmOf('clean-skip', { selectedId: CONFLICT_LIB }).detail!;
    expect(detail.scope).toBe('__GLOBAL__');
  });
});

describe('buildPackagesVm — dense secondaries (T7.10)', () => {
  it('lists one row per registry package; dense secondaries grow no list rows', () => {
    // Secondaries of an entries map are not registry keys: they live in the
    // version deep dive (packages-verdicts T6), never in the list.
    const vm = vmOf('synthetic-dense-entries');
    expect(countOf(vm)).toBe(2);
    expect(vm.rows.map((row) => [row.id, row.depth])).toEqual([
      ['@nf-lab/dense-lib', 0],
      ['@nf-lab/split-lib', 0],
    ]);
  });

  it('keeps a filtered-out own registry key out of the list (T7.10-AC-05)', () => {
    // CROSS_SOURCE: lib-b's entries map carries lib-a, which is also its own
    // registry key. The mfe2 filter hides lib-a (only mfe1 is involved).
    const model = ingestSnapshot(CROSS_SOURCE_SEED);
    const filtered = buildPackagesVm(model, {
      filter: 'all',
      selectedParticipant: 'mfe2',
      selectedId: null,
    });
    expect(filtered.rows.map((row) => row.id)).toEqual(['lib-b']);
    const unfiltered = buildPackagesVm(model, {
      filter: 'all',
      selectedParticipant: null,
      selectedId: null,
    });
    expect(unfiltered.rows.map((row) => row.id).sort()).toEqual(['lib-a', 'lib-b']);
  });

  it('keeps the linked presentation of flat-generation secondaries (T7.10-AC-05)', () => {
    // Flat builds register secondaries as their own registry keys — they stay
    // rows, linked under their name-derived parent.
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
    const model = modelOf('dense-chunking-only');
    const modelBefore = JSON.stringify(model);
    const ui: PackagesUiState = {
      filter: 'all',
      selectedParticipant: 'mfe1',
      selectedId: packageId('__GLOBAL__', '@nf-lab/dense-lib'),
    };

    const first = buildPackagesVm(model, ui);
    const second = buildPackagesVm(model, ui);

    expect(second).toEqual(first);
    expect(JSON.stringify(model)).toBe(modelBefore);
  });
});

describe('buildPackagesVm — one row per package (packages-verdicts T4)', () => {
  it('T4-AC-01 multi-scope: one row, strict tag, copies counted over every scope', () => {
    const [row, ...rest] = packageRows(vmOf('multi-scope'));
    expect(rest).toEqual([]);
    expect(row.packageName).toBe('@nf-lab/kit');
    expect(row.strict).not.toBeNull();
    // global 1.4.0, team-a 1.3.0, strict 2.0.0 and 1.3.0 (mfe1's and mfe3's 1.2.0 load nothing).
    expect(row.copies).toEqual({
      count: 4,
      label: '4 copies',
      note: '4 copies mapped: 1.4.0 (global), 1.3.0 (team-a), 2.0.0 (strict), 1.3.0 (strict)',
    });
  });

  it('T4-AC-02 each status filter counts the packages the projection flags', () => {
    const counts = (id: Parameters<typeof vmOf>[0]) => {
      const vm = vmOf(id);
      return ['multi', 'out-of-range', 'isolated'].map((f) => countOf(vm, f as PackagesFilter));
    };
    expect(counts('out-of-range-nonstrict')).toEqual([1, 1, 1]);
    // 4.8: the remotes the shared version does not cover keep their own copies.
    expect(counts('fallback-uncovered')).toEqual([1, 0, 1]);
    expect(counts('merged-entrypoints')).toEqual([0, 0, 1]);
  });

  it('T4-AC-03 every <scope>|<pkg> link lands on its package and scope', () => {
    for (const id of [
      'multi-scope',
      'frankenstein-live',
      'strict-scope',
      'pooling-anchor',
    ] as const) {
      const model = modelOf(id);
      for (const external of model.registryEvidence.sharedExternals) {
        const vm = buildPackagesVm(model, {
          filter: 'all',
          selectedParticipant: null,
          selectedId: packageId(external.shareScope, external.packageName),
        });
        expect(vm.selectedPackage).toBe(external.packageName);
        expect(vm.detail?.scope).toBe(external.shareScope);
      }
    }
  });

  it('searches names case-insensitively and sorts by copies or remotes', () => {
    const search = vmOf('frankenstein-live', { query: 'SIGNALS' });
    expect(packageRows(search).every((row) => row.packageName.includes('signals'))).toBe(true);
    expect(search.rows.length).toBeGreaterThan(0);
    const none = vmOf('frankenstein-live', { query: 'no-such-package' });
    expect(none.emptyNote).toBe('no packages match “no-such-package”');

    const byCopies = packageRows(vmOf('strict-split', { sort: 'copies' }));
    expect(byCopies[0].copies.count).toBeGreaterThanOrEqual(byCopies.at(-1)!.copies.count);
  });
});
