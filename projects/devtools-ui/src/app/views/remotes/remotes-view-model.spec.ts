/**
 * Remotes view-model specs — fixture-driven acceptance for the per-remote view (remotes-v48):
 * the list names what runs off the norm; the detail's Runs table says where each declared
 * package runs from, why, and which other remotes run this remote's build of it. Capabilities, exposes,
 * chunks, private registrations and claim-less relations carry over from the T8.6 redesign;
 * the T8 seed harness (qualified-source ladder, relation-only, private claims) stays.
 */
import { FIXTURES, NF_HOST, SnapshotV1 } from 'devtools-bridge';

import type { FederationModel } from '../../shared/store/federation-model';
import { ingestSnapshot } from '../../shared/store/ingest';
import {
  RemoteDetailVm,
  RemotesUiState,
  RemotesVm,
  RunsRowVm,
  buildRemotesVm,
} from './remotes-view-model';

function modelOf(name: keyof typeof FIXTURES): FederationModel {
  return ingestSnapshot(FIXTURES[name]);
}

function vmOf(name: keyof typeof FIXTURES, ui: Partial<RemotesUiState> = {}): RemotesVm {
  return buildRemotesVm(modelOf(name), { selectedName: null, ...ui });
}

function detailOf(name: keyof typeof FIXTURES, selectedName: string): RemoteDetailVm {
  return vmOf(name, { selectedName }).detail!;
}

function runOf(detail: RemoteDetailVm, packageName: string): RunsRowVm {
  return detail.runs.rows.find((row) => row.packageName === packageName)!;
}

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

  // remotes-v48: the row says what runs off the norm instead of counting declarations.
  it('marks only problems per remote, and whom it serves', () => {
    const vm = vmOf('pool-showcase');
    const rows = new Map(vm.rows.map((row) => [row.payload.name, row.payload]));
    // Own builds and subpools are the Runs table's job — the list stays quiet.
    for (const name of ['catalog', 'checkout', 'dashboard', 'admin', NF_HOST]) {
      expect(rows.get(name)!.marks).toEqual([]);
    }
    expect(rows.get('admin')!.serves).toEqual({
      label: 'serves 2',
      note: '2 remotes run one of its builds: catalog, checkout',
    });
    expect(rows.get('checkout')!.serves).toEqual({
      label: 'serves 1',
      note: '1 remote runs one of its builds: dashboard',
    });
    expect(rows.get(NF_HOST)!.serves).toBeNull();
  });

  it('marks out of range and declarations that resolve nowhere', () => {
    const marksOf = (fixture: keyof typeof FIXTURES) =>
      Object.fromEntries(
        vmOf(fixture).rows.map((row) => [row.payload.name, row.payload.marks.map((m) => m.label)]),
      );
    expect(marksOf('out-of-range-nonstrict')).toEqual({
      mfe1: ['1 out of range'],
      mfe2: [],
      mfe3: [],
      [NF_HOST]: [],
    });
    expect(marksOf('synthetic-multi-version')).toMatchObject({
      calendar: ['1 not mapped'],
      chat: ['1 not mapped'],
    });
    expect(marksOf('frankenstein-live')).toEqual({ whiteboard: [], mermaid: [], [NF_HOST]: [] });
  });

  it('renders an honest empty note when the capture holds no remotes', () => {
    const vm = vmOf('synthetic-empty-page');

    expect(vm.rows).toEqual([]);
    expect(vm.emptyNote).toBe('no remotes in this capture');
    expect(vm.detail).toBeNull();
  });
});

describe('buildRemoteDetail — identity, selection, warnings', () => {
  it('resolves the host selection by the verbatim sentinel, displayed as host', () => {
    const detail = detailOf('frankenstein-live', NF_HOST);

    expect(detail.name).toBe(NF_HOST);
    expect(detail.display).toBe('host');
    expect(detail.host).toBe(true);
    // Scope URL as recorded (live registries keep relative URLs) plus the
    // resolved form.
    expect(detail.scopeUrl).toBe('./');
    expect(detail.resolvedScopeUrl).toBe('https://lutzleonhardt.de/frankenstein-meeting-room/');
    expect(detail.remoteEntryUrl).toBe(
      'https://lutzleonhardt.de/frankenstein-meeting-room/remoteEntry.json',
    );
  });

  it('yields no detail without a selection or for an unknown remote', () => {
    expect(vmOf('frankenstein-live').detail).toBeNull();
    expect(vmOf('frankenstein-live', { selectedName: 'display name' }).detail).toBeNull();
  });

  // remotes-v48: capabilities are gone; only what the capture proves flat is flagged.
  it('flags flat externals when secondaries are registered on their own', () => {
    const host = detailOf('frankenstein-live', NF_HOST);
    expect(host.warnings.map((w) => w.label)).toEqual(['flat externals']);
    expect(host.warnings[0].note).toContain('registered as their own externals');
    expect(host.warnings[0].note).toContain('features.denseExternals: true');
  });

  it('flags flat chunking when no chunk list or bundle is recorded', () => {
    const whiteboard = detailOf('frankenstein-live', 'whiteboard');
    expect(whiteboard.warnings.map((w) => w.label)).toContain('flat chunking');
    expect(whiteboard.warnings.find((w) => w.label === 'flat chunking')!.note).toContain(
      'features.denseChunking: true',
    );
  });
});

// share-pools T2 witnesses: each build flag alone, and both.
describe('buildRemoteDetail — flat-build warnings', () => {
  const labelsOf = (fixture: keyof typeof FIXTURES, remote: string) =>
    detailOf(fixture, remote).warnings.map((warning) => warning.label);

  it.each([
    ['dense-chunking-only', ['flat externals']],
    ['dense-externals-only', ['flat chunking']],
    ['dense-both', []],
  ] as const)('%s: mfe1 warns about exactly what is flat', (fixture, expected) => {
    expect(labelsOf(fixture, 'mfe1')).toEqual(expected);
  });

  it('warns nothing for a remote that declares no shared packages', () => {
    expect(detailOf('clean-skip', NF_HOST).warnings).toEqual([]);
  });
});

describe('buildRemoteDetail — runs (remotes-v48)', () => {
  it('folds flat secondaries into the package they run with', () => {
    const detail = detailOf('frankenstein-live', NF_HOST);

    expect(detail.runs.rows.map((row) => [row.packageName, row.kind])).toEqual([
      ['@angular/common', 'self'],
      ['@angular/core', 'self'],
      ['@angular/platform-browser', 'self'],
      ['rxjs', 'self'],
      ['tslib', 'self'],
    ]);
    const core = runOf(detail, '@angular/core');
    expect(core.tag).toBe('21.2.12');
    expect(core.declared).toBe('^21.2.0 · strict');
    expect(core.from).toMatchObject({ label: 'self', remote: null });
    expect(core.why).toBeNull();
    expect(core.packageSelect).toBe('__GLOBAL__|@angular/core');
    expect(core.entrypoints.map((entrypoint) => entrypoint.specifier)).toEqual([
      '@angular/core',
      '@angular/core/event-dispatch-contract.min.js',
      '@angular/core/primitives/di',
      '@angular/core/primitives/event-dispatch',
      '@angular/core/primitives/signals',
      '@angular/core/rxjs-interop',
    ]);
    expect(core.entrypoints.every((entrypoint) => entrypoint.note === null)).toBe(true);
    expect(detail.runs.tally).toEqual([{ kind: 'self', label: '5 self' }]);
    expect(detail.relationOnly).toEqual([]);
    expect(detail.diagnostics).toEqual([]);
  });

  it('pins the strict scope to its exact tag', () => {
    for (const [remote, tag] of [
      ['mfe1', '1.0.0'],
      ['mfe2', '2.0.0'],
    ] as const) {
      const [row] = detailOf('strict-scope', remote).runs.rows;
      expect(row.scopeLabel).toBe('strict');
      expect(row.tag).toBe(tag);
      expect(row.declared).toBe(`exact ${tag}`);
      expect(row.kind).toBe('self');
    }
  });

  it('names the build a skipping remote runs, and that remote serves it', () => {
    const mfe1 = detailOf('clean-skip', 'mfe1');
    expect(mfe1.runs.rows).toHaveLength(1);
    const [row] = mfe1.runs.rows;
    expect(row.kind).toBe('shared');
    expect(row.tag).toBe('2.0.0');
    expect(row.ships).toBe('1.0.0');
    expect(row.declared).toBe('>=1.0.0 <3.0.0');
    expect(row.from.label).toBeNull();
    expect(row.from.remote).toEqual({ name: 'mfe2', host: false, select: 'mfe2' });
    expect(row.why).toBeNull();
    expect(row.servedTo).toEqual([]);

    const mfe2 = detailOf('clean-skip', 'mfe2');
    expect(mfe2.runs.rows.map((r) => r.kind)).toEqual(['self']);
    expect(mfe2.runs.rows[0].servedTo).toEqual([{ name: 'mfe1', host: false, select: 'mfe1' }]);
  });

  it('reads a co-declared share from the build the map serves', () => {
    const [row] = detailOf('co-declared-share', 'mfe2').runs.rows;
    expect(row.kind).toBe('shared');
    expect(row.from.remote?.name).toBe('mfe1');
  });

  // The 4.8 acceptance case the old provides zone left silent: mfe1 runs its own kit because
  // host's build lacks two of its entrypoints.
  it('strict-uncovered: says why mfe1 runs its own build and marks the missing entrypoints', () => {
    const detail = detailOf('strict-uncovered', 'mfe1');
    const [row] = detail.runs.rows;
    expect(row.kind).toBe('own');
    expect(row.tag).toBe('1.2.0');
    expect(row.from).toMatchObject({ label: 'own build', remote: null });
    expect(row.why).toEqual({
      label: 'not covered',
      note: 'not covered: the serving build of host lacks @nf-lab/kit/table, @nf-lab/kit/dialog',
    });
    expect(
      row.entrypoints.filter((entrypoint) => entrypoint.note).map((e) => [e.specifier, e.note]),
    ).toEqual([
      ['@nf-lab/kit/table', "not in host's build"],
      ['@nf-lab/kit/dialog', "not in host's build"],
    ]);
    expect(detail.runs.tally).toEqual([{ kind: 'own', label: '1 own build' }]);

    // host serves mfe2, not mfe1.
    const host = detailOf('strict-uncovered', NF_HOST);
    expect(host.runs.rows[0].servedTo.map((r) => r.name)).toEqual(['mfe2']);
  });

  it('pool-showcase: own builds from a pool conflict, a subpool and its owner', () => {
    const dashboard = detailOf('pool-showcase', 'dashboard');
    expect(dashboard.runs.rows.map((row) => [row.packageName, row.kind, row.tag])).toEqual([
      ['@nf-lab/chart-core', 'own', '1.0.0'],
      ['@nf-lab/chart-dom', 'own', '2.0.0'],
      ['@nf-lab/form-core', 'shared', '1.1.0'],
      ['@nf-lab/form-dom', 'shared', '1.1.0'],
    ]);
    expect(runOf(dashboard, '@nf-lab/chart-dom').why).toEqual({
      label: 'version conflict',
      note: 'version conflict: its range ^2.0.0 (strict) rejects the global 1.1.0 of @nf-lab/chart-dom',
    });
    expect(runOf(dashboard, '@nf-lab/form-core').from.remote?.name).toBe('checkout');
    expect(runOf(dashboard, '@nf-lab/form-core').ships).toBe('1.0.0');
    expect(dashboard.runs.tally.map((item) => item.label)).toEqual([
      '2 own build',
      '2 from checkout',
    ]);

    const catalog = detailOf('pool-showcase', 'catalog');
    const ui = runOf(catalog, '@nf-lab/ui-core');
    expect(ui.kind).toBe('subpool');
    expect(ui.from).toMatchObject({ label: 'subpool of', remote: { name: 'admin' } });
    expect(ui.why).toEqual({
      label: 'not covered',
      note: 'not covered: the global map lacks @nf-lab/ui-dom',
    });
    expect(ui.pool?.tag).toBe('ui');

    const admin = detailOf('pool-showcase', 'admin');
    expect(admin.runs.rows.map((row) => [row.kind, row.from.label])).toEqual([
      ['owner', 'self · subpool'],
      ['owner', 'self · subpool'],
    ]);
    expect(
      admin.runs.rows.map((row) => [row.packageName, row.servedTo.map((r) => r.name)]),
    ).toEqual([
      ['@nf-lab/ui-core', ['catalog', 'checkout']],
      ['@nf-lab/ui-dom', ['catalog', 'checkout']],
    ]);
  });

  it('reads a 4.6 pooling anchor with 4.8 rules: subpool owner and its member', () => {
    const mfe1 = detailOf('pooling-anchor', 'mfe1');
    const anchor = runOf(mfe1, '@nf-lab/conflict-lib');
    expect(anchor.kind).toBe('owner');
    expect(anchor.why).toEqual({
      label: 'not covered',
      note: 'not covered: every entrypoint is on the global map, but no single build ships @nf-lab/conflict-lib/extra with the rest',
    });
    expect(anchor.servedTo.map((r) => r.name)).toEqual(['mfe2']);

    const mfe2 = detailOf('pooling-anchor', 'mfe2');
    const member = runOf(mfe2, '@nf-lab/conflict-lib');
    expect(member.kind).toBe('subpool');
    expect(member.from.remote?.name).toBe('mfe1');
  });

  it('out-of-range-nonstrict: runs the shared build outside its range', () => {
    const [row] = detailOf('out-of-range-nonstrict', 'mfe1').runs.rows;
    expect(row.kind).toBe('off');
    expect(row.tag).toBe('2.0.0');
    expect(row.ships).toBe('1.2.0');
    expect(row.from).toMatchObject({ label: 'out of range', remote: { name: 'host', host: true } });
    expect(row.why).toEqual({
      label: '^1.0.0 rejects 2.0.0',
      note: '^1.0.0 rejects 2.0.0 · not strict, runs it anyway — the orchestrator stores a plain skip',
    });
  });

  it('keeps a declaration that resolves nowhere as a not-mapped row', () => {
    for (const [remote, tag] of [
      ['calendar', '1.2.3'],
      ['chat', '2.0.0'],
    ] as const) {
      const detail = detailOf('synthetic-multi-version', remote);
      expect(detail.runs.rows).toHaveLength(1);
      const [row] = detail.runs.rows;
      expect(row.packageName).toBe('ui-lib');
      expect(row.kind).toBe('unresolved');
      expect(row.tag).toBeNull();
      expect(row.ships).toBe(tag);
      expect(row.from).toEqual({ label: 'not mapped', remote: null });
      expect(row.why).toEqual({
        label: 'no import-map entry',
        note: 'no applicable import-map binding for this specifier in this capture',
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

      // Private registrations never leak into the shared runs.
      expect(detail.runs.rows).toEqual([]);
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
 * and it must never read as the remote's own build: the row keeps the
 * AMBIGUOUS qualifier visible (T8-H1, T8.6-AC-05).
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
 * observed (not exact, not own) source (T8-H1).
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

describe('buildRemoteDetail — qualified sources stay qualified (T8.6-AC-05)', () => {
  it('reads an ambiguous-scope attribution as an unknown source, never self', () => {
    const [row] = seededDetail(AMBIGUOUS_SCOPE_SEED, 'r1').runs.rows;
    expect(row.kind).toBe('unknown');
    expect(row.from.label).toBe('ambiguous source');
    expect(row.from.remote).toBeNull();
    expect(row.why).toEqual({
      label: 'several sources match',
      note: 'ambiguous source: equally specific remote scope prefixes match this target — none is chosen',
    });
    expect(row.entrypoints[0].file).toBe('b.js');
  });

  it('reads a host-fallback attribution as an observed host source', () => {
    const [row] = seededDetail(HOST_FALLBACK_SEED, 'r1').runs.rows;
    expect(row.kind).toBe('shared');
    expect(row.from.label).toBe('observed target source');
    expect(row.from.remote).toEqual({ name: 'host', host: true, select: NF_HOST });
    expect(row.why?.label).toBe('matched by scope URL');
    expect(row.why?.note).toContain('observed target source: ');
    expect(row.why?.note).toContain('host as least-specific fallback');
  });

  it('keeps a source-less foreign target a QUALIFIED unknown source', () => {
    const [row] = seededDetail(UNKNOWN_SOURCE_SEED, 'r1').runs.rows;
    expect(row.kind).toBe('unknown');
    expect(row.from.label).toBe('unknown source');
    expect(row.why).toEqual({
      label: 'no source record',
      note: 'unknown source: only the resolved URL is evidenced — no source record or scope prefix matches',
    });
  });
});

/**
 * One declaration, TWO entrypoint claims with DIFFERENT outcomes: the main
 * specifier selects the own copy, the secondary resolves to a foreign
 * target no source or scope explains. The row runs from its own build and
 * flags the secondary — hiding it would hide a confirmed-HIGH class of
 * qualification (T8 round 2, T8.6-AC-05).
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
 * A scope-action registration whose own claim is selected: it runs its own
 * build, and without a 4.8 reason the stored rows do not say why.
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

describe('buildRemoteDetail — one declaration, two sources (T8.6-AC-05)', () => {
  it('flags the secondary that resolves away from the main build', () => {
    const [row] = seededDetail(MULTI_ENTRY_QUALIFIER_SEED, 'r1').runs.rows;
    expect(row.packageName).toBe('me-lib');
    expect(row.kind).toBe('self');
    expect(row.entrypoints.map((e) => [e.specifier, e.file, e.note])).toEqual([
      ['me-lib', 'main.js', null],
      ['me-lib/extra', 'extra.js', 'unknown source'],
    ]);
  });

  it('reads a scope registration as its own build', () => {
    const [row] = seededDetail(SCOPE_ACTION_SEED, 'r1').runs.rows;
    expect(row.kind).toBe('own');
    expect(row.from.label).toBe('own build');
    expect(row.why?.label).toBe('no reason stored');
    expect(row.why?.note).toContain('keeps its own 1.0.0');
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

    // The ambiguous copy has no source; only the own copy runs from r1.
    expect(detail.runs.rows.map((row) => [row.packageName, row.kind])).toEqual([
      ['dup-lib', 'unknown'],
      ['own-lib', 'self'],
    ]);

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
 * detail must surface it instead of dropping it (T8-H2).
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

    // The candidate-less declaration resolves nowhere of its own…
    expect(detail.runs.rows).toHaveLength(1);
    expect(detail.runs.rows[0].kind).toBe('unresolved');
    expect(detail.runs.rows[0].from).toEqual({ label: 'declared', remote: null });
    expect(detail.runs.rows[0].why?.label).toBe('no entrypoints');
    expect(detail.runs.rows[0].why?.note).toBe(
      'declaration without entrypoint candidates — no resolution claim derivable',
    );

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

    expect(detail.runs.rows.map((row) => row.kind)).toEqual(['self']);
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

// share-pools T5: pool tags on the remote's runs rows.
describe('buildRemoteDetail — pool chips (share-pools T5)', () => {
  const tagsOf = (fixture: keyof typeof FIXTURES, remote: string) =>
    Object.fromEntries(
      detailOf(fixture, remote).runs.rows.map((row) => [row.packageName, row.pool?.tag ?? null]),
    );

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
    const core = runOf(detailOf('pool-tag-orphan', 'mfe1'), '@nf-lab/ui-core');
    expect(core.pool).toMatchObject({ tag: 'ui', orphan: true });
  });
});
