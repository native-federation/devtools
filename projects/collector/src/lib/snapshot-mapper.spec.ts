/**
 * Mapper tests:
 *  - T7-AC-06: the full probe→mapper pipeline over the frankenstein
 *    fixture page reproduces the checked-in fixture's evidence layers and
 *    round-trips as `SnapshotV1`.
 *  - T7-AC-04 (→ XC-02): an unrecognized `__NATIVE_FEDERATION__` shape
 *    yields `not-recognized` with no raw copy of unrecognized data.
 *  - T7-AC-05 (→ XC-02): every URL in mapper output is stripped of
 *    userinfo, query, and fragment (verified with the repo privacy scan).
 */
import { describe, expect, it } from 'vitest';
import type { SnapshotV1 } from '../../../devtools-bridge/src/lib/snapshot-v1';
import { frankensteinLiveFixture } from '../../../devtools-bridge/src/lib/fixtures/frankenstein-live.fixture';
import { scanForPrivacyViolations } from '../../../../guards/privacy-scan';
import { COLLECTOR_VERSION, DEFAULT_LIMITS } from './constants';
import { PASSIVE_PROBE_SOURCE } from './passive-probe';
import { SHIM_MAP_PROBE_SOURCE } from './shim-map-probe';
import { mapProbeResult } from './snapshot-mapper';
import {
  buildFrankensteinPage,
  buildHostilePage,
  evaluateProbe,
  makeBarePage,
} from '../testing/fixture-pages';

const CAPTURED_AT = '2026-07-24T13:50:22Z';

function capturePage(sandbox: Record<string, unknown>): SnapshotV1 {
  const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, sandbox);
  const shim = evaluateProbe(SHIM_MAP_PROBE_SOURCE, sandbox);
  return mapProbeResult(raw, shim, { capturedAt: CAPTURED_AT });
}

// `poolCause` is orchestrator v4.7 (native-federation/orchestrator#87).
const ANCHOR_FIELDS = ['pool', 'servedBy', 'poolCause'] as const;

type AnchorField = (typeof ANCHOR_FIELDS)[number];

function makeAnchorParticipant(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'anchor-remote',
    requiredVersion: '^1.0.0',
    strictVersion: true,
    file: 'anchor.js',
    cached: true,
    ...extra,
  };
}

function makeAnchorSharedExternals(
  participant: Record<string, unknown>,
  external: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    __GLOBAL__: {
      'anchor-package': {
        ...external,
        dirty: false,
        versions: [
          {
            tag: '1.0.0',
            action: 'share',
            host: false,
            remotes: [participant],
          },
        ],
      },
    },
  };
}

function captureInlineAnchor(
  participant: Record<string, unknown>,
  external: Record<string, unknown> = {},
): SnapshotV1 {
  const sandbox = makeBarePage({
    __NATIVE_FEDERATION__: {
      remotes: {},
      'scoped-externals': {},
      'shared-externals': makeAnchorSharedExternals(participant, external),
      'shared-chunks': {},
    },
  });
  const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, sandbox);
  return mapProbeResult(raw, null, { capturedAt: CAPTURED_AT });
}

function makeRawAnchorProbe(
  participant: Record<string, unknown>,
  external: Record<string, unknown> = {},
): Record<string, unknown> {
  const repository = (value: Record<string, unknown>) => ({
    present: true,
    descriptor: 'data',
    valueType: 'object',
    value,
  });

  return {
    schemaVersion: 'passive-probe/3',
    page: { origin: 'https://edge.example', path: '/', readyState: 'complete' },
    globals: {
      nativeFederation: {
        present: true,
        descriptor: 'data',
        valueType: 'object',
        repositories: {
          remotes: repository({}),
          'scoped-externals': repository({}),
          'shared-externals': repository(makeAnchorSharedExternals(participant, external)),
          'shared-chunks': repository({}),
        },
      },
      importShim: { present: false },
    },
    importMaps: [],
    errors: [],
  };
}

function captureHostAnchor(
  participant: Record<string, unknown>,
  external: Record<string, unknown> = {},
): SnapshotV1 {
  return mapProbeResult(makeRawAnchorProbe(participant, external), null, {
    capturedAt: CAPTURED_AT,
  });
}

function capturedAnchor(snapshot: SnapshotV1) {
  return snapshot.runtime!.sharedExternals['__GLOBAL__']['anchor-package'].versions[0].remotes[0];
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function registerAnchorProjectionTests(
  label: string,
  errorStage: 'probe' | 'mapper',
  capture: (participant: Record<string, unknown>, external?: Record<string, unknown>) => SnapshotV1,
): void {
  describe(`witnessed anchors through ${label} (T2.1-AC-01, T2.1-AC-03)`, () => {
    it('keeps v4.7 poolName and poolCause, and omits them when absent', () => {
      const stored = capture(makeAnchorParticipant({ poolCause: 'uncovered' }), {
        poolName: 'framework~2',
      });
      const external = stored.runtime!.sharedExternals['__GLOBAL__']['anchor-package'];
      expect(external.poolName).toBe('framework~2');
      expect(capturedAnchor(stored).poolCause).toBe('uncovered');

      const legacy = capture(makeAnchorParticipant());
      expect(hasOwn(legacy.runtime!.sharedExternals['__GLOBAL__']['anchor-package'], 'poolName')).toBe(
        false,
      );
      expect(hasOwn(capturedAnchor(legacy), 'poolCause')).toBe(false);
    });

    it.each(ANCHOR_FIELDS)('omits a non-string %s without coercion', (field: AnchorField) => {
      let coercionCalls = 0;
      const coercedSecret = `coerced-${field}-secret`;
      const nonString = {
        toString() {
          coercionCalls += 1;
          return coercedSecret;
        },
      };

      const snapshot = capture(makeAnchorParticipant({ [field]: nonString }));
      const remote = capturedAnchor(snapshot);

      expect(coercionCalls).toBe(0);
      expect(hasOwn(remote, field)).toBe(false);
      expect(snapshot.errors).toEqual([]);
      expect(JSON.stringify(snapshot)).not.toContain(coercedSecret);
    });

    it.each(ANCHOR_FIELDS)(
      'skips a throwing accessor-backed %s without invoking it',
      (field: AnchorField) => {
        let getterCalls = 0;
        const participant = makeAnchorParticipant();
        Object.defineProperty(participant, field, {
          enumerable: true,
          configurable: true,
          get() {
            getterCalls += 1;
            throw new Error(`${field}-accessor-secret`);
          },
        });

        const snapshot = capture(participant);
        const remote = capturedAnchor(snapshot);

        expect(getterCalls).toBe(0);
        expect(hasOwn(remote, field)).toBe(false);
        expect(
          snapshot.errors.some(
            (error) =>
              error.stage === errorStage &&
              error.code === 'accessor-skipped' &&
              JSON.stringify(error.detail).includes(field),
          ),
        ).toBe(true);
        expect(JSON.stringify(snapshot)).not.toContain(`${field}-accessor-secret`);
      },
    );

    it.each(ANCHOR_FIELDS)(
      'bounds an oversized %s without leaking its suffix',
      (field: AnchorField) => {
        const retainedPrefix = `${field}:`.padEnd(DEFAULT_LIMITS.maxStringLength, 'x');
        const rejectedSuffix = `__${field.toUpperCase()}_UNBOUNDED_SUFFIX__`;
        const snapshot = capture(
          makeAnchorParticipant({ [field]: retainedPrefix + rejectedSuffix }),
        );
        const remote = capturedAnchor(snapshot);

        expect(remote[field]).toBe(retainedPrefix);
        expect(remote[field]).toHaveLength(DEFAULT_LIMITS.maxStringLength);
        expect(
          snapshot.errors.some(
            (error) =>
              error.stage === errorStage &&
              error.code === 'string-limit' &&
              JSON.stringify(error.detail).includes(field),
          ),
        ).toBe(true);
        expect(JSON.stringify(snapshot)).not.toContain(rejectedSuffix);
      },
    );
  });
}

// The descriptor orchestrator v4.7 publishes (native-federation/orchestrator#86): frozen, with a
// `get` function the passive probe must never call.
describe('orchestrator version from __NF_ORCHESTRATOR__', () => {
  const orchestratorPage = (entry: Record<string, unknown>) => {
    const counters = { getCalls: 0 };
    const sandbox = makeBarePage({
      __NATIVE_FEDERATION__: {
        remotes: {},
        'scoped-externals': {},
        'shared-externals': {},
        'shared-chunks': {},
      },
      __NF_ORCHESTRATOR__: Object.freeze({
        storage: Object.freeze({
          __NATIVE_FEDERATION__: Object.freeze({
            type: 'globalThis',
            namespace: '__NATIVE_FEDERATION__',
            keys: ['remotes', 'shared-externals', 'scoped-externals', 'shared-chunks'],
            get: () => {
              counters.getCalls += 1;
              return {};
            },
            ...entry,
          }),
        }),
      }),
    });
    const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, sandbox);
    return { snapshot: mapProbeResult(raw, null, { capturedAt: CAPTURED_AT }), counters };
  };

  it('carries the published version without calling get', () => {
    const { snapshot, counters } = orchestratorPage({ version: '4.7.0' });
    expect(snapshot.runtime!.orchestratorVersion).toBe('4.7.0');
    expect(counters.getCalls).toBe(0);
    expect(snapshot.errors).toEqual([]);
  });

  it('omits the version when the page publishes no descriptor (before v4.7)', () => {
    const snapshot = captureInlineAnchor(makeAnchorParticipant());
    expect(hasOwn(snapshot.runtime!, 'orchestratorVersion')).toBe(false);
  });

  it('drops a version that is not a version token', () => {
    const { snapshot } = orchestratorPage({ version: '4.7.0 <script>' });
    expect(hasOwn(snapshot.runtime!, 'orchestratorVersion')).toBe(false);
    expect(snapshot.errors.map((error) => error.code)).toContain('orchestrator-version-invalid');
  });

  it('skips an accessor-backed version without invoking it', () => {
    let getterCalls = 0;
    const entry = {};
    Object.defineProperty(entry, 'version', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return '4.7.0';
      },
    });
    const sandbox = makeBarePage({
      __NATIVE_FEDERATION__: { remotes: {} },
      __NF_ORCHESTRATOR__: { storage: { __NATIVE_FEDERATION__: entry } },
    });
    const snapshot = mapProbeResult(evaluateProbe(PASSIVE_PROBE_SOURCE, sandbox), null, {
      capturedAt: CAPTURED_AT,
    });
    expect(getterCalls).toBe(0);
    expect(hasOwn(snapshot.runtime!, 'orchestratorVersion')).toBe(false);
    expect(snapshot.errors.map((error) => error.code)).toContain('accessor-skipped');
  });
});

registerAnchorProjectionTests('the inline probe schema', 'probe', captureInlineAnchor);
registerAnchorProjectionTests('the host mapper schema', 'mapper', captureHostAnchor);

describe('frankenstein pipeline (T7-AC-06)', () => {
  it('reproduces the derived fixture evidence layers from a live-shaped page', () => {
    const page = buildFrankensteinPage();
    const snapshot = capturePage(page.sandbox);

    expect(snapshot.channels).toEqual(frankensteinLiveFixture.channels);
    expect(snapshot.runtime).toEqual(frankensteinLiveFixture.runtime);
    expect(snapshot.importMaps).toEqual(frankensteinLiveFixture.importMaps);
    expect(snapshot.capture.pageUrl).toBe(frankensteinLiveFixture.capture.pageUrl);
    expect(snapshot.capture.capturedAt).toBe(CAPTURED_AT);
    expect(snapshot.capture.mode).toBe('passive');
    expect(snapshot.capture.collectorVersion).toBe(COLLECTOR_VERSION);
    expect(snapshot.errors).toEqual([]);
  });

  it('round-trips through JSON without loss', () => {
    const page = buildFrankensteinPage();
    const snapshot = capturePage(page.sandbox);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});

describe('unrecognized shapes (T7-AC-04)', () => {
  it('yields not-recognized without copying unrecognized data', () => {
    const sandbox = makeBarePage({
      __NATIVE_FEDERATION__: {
        totallySurprising: { customerRecord: 'RAW_SECRET_VALUE' },
      },
    });
    const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, sandbox);
    const snapshot = mapProbeResult(raw, null, { capturedAt: CAPTURED_AT });

    // All four repository keys are lazily absent here — but a global
    // carrying none of them is not recognized as Native Federation.
    expect(snapshot.channels.nativeFederationGlobals).toEqual({
      state: 'not-recognized',
      reason: 'global present but carries none of the four repository keys',
    });
    expect(snapshot.runtime).toBeNull();
    // No raw copy anywhere — neither in the probe result nor the snapshot.
    expect(JSON.stringify(raw)).not.toContain('totallySurprising');
    expect(JSON.stringify(raw)).not.toContain('RAW_SECRET_VALUE');
    expect(JSON.stringify(snapshot)).not.toContain('totallySurprising');
    expect(JSON.stringify(snapshot)).not.toContain('RAW_SECRET_VALUE');
  });

  it('yields not-recognized for a primitive global', () => {
    const sandbox = makeBarePage({ __NATIVE_FEDERATION__: 'not-an-object' });
    const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, sandbox);
    const snapshot = mapProbeResult(raw, null, { capturedAt: CAPTURED_AT });
    expect(snapshot.channels.nativeFederationGlobals).toEqual({
      state: 'not-recognized',
      reason: "global has type 'string' instead of object",
    });
    expect(snapshot.runtime).toBeNull();
    expect(JSON.stringify(snapshot)).not.toContain('not-an-object');
  });

  it('projects a lazily-absent scoped-externals repository as zero entries', () => {
    // Playground-shaped global: the runtime creates `scoped-externals`
    // lazily, so a page without scoped externals has no such key at all.
    const sandbox = makeBarePage({
      __NATIVE_FEDERATION__: {
        remotes: {},
        'shared-externals': {},
        'shared-chunks': {},
      },
    });
    const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, sandbox);
    const snapshot = mapProbeResult(raw, null, { capturedAt: CAPTURED_AT });

    expect(snapshot.channels.nativeFederationGlobals).toEqual({ state: 'available' });
    expect(snapshot.runtime).toEqual({
      remotes: {},
      scopedExternals: {},
      sharedExternals: {},
      sharedChunks: {},
      generation: 'unknown',
    });
    expect(snapshot.errors).toEqual([]);
  });

  it('projects a lazily-absent shared-chunks repository as zero entries', () => {
    // Non-dense-build shape: chunks ship as scoped pseudo-externals, the
    // shared-chunks repo never goes dirty, so its key never exists.
    const sandbox = makeBarePage({
      __NATIVE_FEDERATION__: {
        remotes: {},
        'scoped-externals': {},
        'shared-externals': {},
      },
    });
    const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, sandbox);
    const snapshot = mapProbeResult(raw, null, { capturedAt: CAPTURED_AT });

    expect(snapshot.channels.nativeFederationGlobals).toEqual({ state: 'available' });
    expect(snapshot.runtime).toEqual({
      remotes: {},
      scopedExternals: {},
      sharedExternals: {},
      sharedChunks: {},
      generation: 'unknown',
    });
    expect(snapshot.errors).toEqual([]);
  });

  it('projects v4.5-generation external remotes with bundle and entries kept (T4-AC-01)', () => {
    // V4.5-generation shared external (orchestrator v4.6.0, `8e5e0b3`):
    // participants carry `bundle` + `entries` instead of a single `file`.
    const sandbox = makeBarePage({
      __NATIVE_FEDERATION__: {
        remotes: {},
        'shared-externals': {
          __GLOBAL__: {
            '@angular/core': {
              dirty: false,
              versions: [
                {
                  tag: '22.0.8',
                  action: 'share',
                  host: true,
                  remotes: [
                    {
                      name: '__NF-HOST__',
                      bundle: 'browser-angular_core',
                      strictVersion: true,
                      cached: true,
                      requiredVersion: '~22.0.0',
                      entries: { '@angular/core': '_angular_core.EWio10v_5e.js' },
                    },
                  ],
                },
              ],
            },
          },
        },
        'shared-chunks': {},
      },
    });
    const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, sandbox);
    const snapshot = mapProbeResult(raw, null, { capturedAt: CAPTURED_AT });

    expect(snapshot.channels.nativeFederationGlobals).toEqual({ state: 'available' });
    const external = snapshot.runtime!.sharedExternals['__GLOBAL__']['@angular/core'];
    expect(external.dirty).toBe(false);
    expect(external.versions[0].remotes).toEqual([
      {
        name: '__NF-HOST__',
        requiredVersion: '~22.0.0',
        strictVersion: true,
        file: null,
        entries: { '@angular/core': '_angular_core.EWio10v_5e.js' },
        cached: true,
        bundle: 'browser-angular_core',
        servedFiles: [{ entry: '@angular/core', file: '_angular_core.EWio10v_5e.js' }],
        generation: 'v4.5',
      },
    ]);
    expect(snapshot.runtime!.generation).toBe('v4.5');
    expect(snapshot.errors).toEqual([]);
  });

  it('records a participant carrying both or neither spelling as a collection error (T4-AC-03)', () => {
    const participant = (extra: Record<string, unknown>) => ({
      name: 'r',
      requiredVersion: '^1.0.0',
      strictVersion: true,
      cached: true,
      ...extra,
    });
    const page = (remotes: unknown[]) =>
      makeBarePage({
        __NATIVE_FEDERATION__: {
          remotes: {},
          'shared-externals': {
            __GLOBAL__: {
              pkg: { dirty: false, versions: [{ tag: '1.0.0', action: 'share', host: false, remotes }] },
            },
          },
        },
      });

    for (const [extra, spelling] of [
      [{ file: 'a.js', entries: { pkg: 'a.js' } }, 'both'],
      [{}, 'neither'],
    ] as const) {
      const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, page([participant(extra)]));
      const snapshot = mapProbeResult(raw, null, { capturedAt: CAPTURED_AT });
      // The participant row is dropped, never silently normalized…
      expect(snapshot.runtime!.sharedExternals['__GLOBAL__']['pkg'].versions[0].remotes).toEqual([]);
      // …and the drop is recorded loudly.
      expect(snapshot.errors).toContainEqual({
        stage: 'mapper',
        code: 'participant-spelling-invalid',
        detail: { path: 'shared-externals.pkg', participant: 'r', spelling },
      });
    }
  });

  it('records a scoped package without a tag as a collection error (T4-AC-04)', () => {
    const sandbox = makeBarePage({
      __NATIVE_FEDERATION__: {
        remotes: {},
        'scoped-externals': {
          mfe1: {
            ok: { tag: '1.0.0', entries: { ok: 'ok.js' } },
            broken: { entries: { broken: 'broken.js' } },
          },
        },
      },
    });
    const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, sandbox);
    const snapshot = mapProbeResult(raw, null, { capturedAt: CAPTURED_AT });

    expect(snapshot.runtime!.scopedExternals['mfe1']).toEqual({
      ok: { tag: '1.0.0', bundle: null, entries: { ok: 'ok.js' } },
    });
    expect(snapshot.errors).toContainEqual({
      stage: 'mapper',
      code: 'scoped-package-incomplete',
      detail: { path: 'scoped-externals.broken' },
    });
  });

  it('aggregates mixed participant spellings as generation mixed (T4-AC-02)', () => {
    const sandbox = makeBarePage({
      __NATIVE_FEDERATION__: {
        remotes: {},
        'shared-externals': {
          __GLOBAL__: {
            pkg: {
              dirty: false,
              versions: [
                {
                  tag: '1.0.0',
                  action: 'share',
                  host: false,
                  remotes: [
                    { name: 'a', requiredVersion: '^1', strictVersion: false, cached: true, file: 'a.js' },
                    { name: 'b', requiredVersion: '^1', strictVersion: false, cached: true, entries: { pkg: 'b.js' } },
                  ],
                },
              ],
            },
          },
        },
      },
    });
    const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, sandbox);
    const snapshot = mapProbeResult(raw, null, { capturedAt: CAPTURED_AT });
    expect(snapshot.runtime!.generation).toBe('mixed');
    expect(snapshot.errors).toEqual([]);
  });

  it('keeps not-recognized when scoped-externals exists but is unreadable', () => {
    const nf: Record<string, unknown> = {
      remotes: {},
      'shared-externals': {},
      'shared-chunks': {},
    };
    Object.defineProperty(nf, 'scoped-externals', { get: () => ({}) });
    const sandbox = makeBarePage({ __NATIVE_FEDERATION__: nf });
    const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, sandbox);
    const snapshot = mapProbeResult(raw, null, { capturedAt: CAPTURED_AT });

    expect(snapshot.channels.nativeFederationGlobals).toEqual({
      state: 'not-recognized',
      reason: 'global present but repositories unreadable: scoped-externals',
    });
    expect(snapshot.runtime).toBeNull();
  });

  it('yields unavailable when the global is absent', () => {
    const snapshot = capturePage(makeBarePage());
    expect(snapshot.channels.nativeFederationGlobals).toEqual({
      state: 'unavailable',
      reason: 'window.__NATIVE_FEDERATION__ is not defined',
    });
    expect(snapshot.channels.importShim).toEqual({
      state: 'unavailable',
      reason: 'window.importShim is not present',
    });
    // Zero DOM maps is a real observation, not missing evidence.
    expect(snapshot.channels.domImportMaps).toEqual({ state: 'available' });
    expect(snapshot.importMaps).toEqual({ documentMaps: [], effective: null });
  });
});

describe('URL sanitization (T7-AC-05)', () => {
  it('strips userinfo, query, and fragment from every URL in the output', () => {
    const importShim = () => {};
    Object.assign(importShim, {
      getImportMap: () => ({
        imports: {
          bare: 'https://cdn.example/lib.js?version=1#hash',
          'https://scoped.example/pkg?q=1': 'https://user:pw@cdn.example/pkg.js',
          '/a.js?token=hidden-secret': 'https://cdn.example/a.js',
          'foo?x': 'https://cdn.example/foo.js',
        },
        scopes: {
          'https://scope.example/app/?scope-query=1': {
            inner: 'https://cdn.example/inner.js#frag',
          },
          '/app/?q=scope-leaked': {
            './b?y=also-leaked': 'https://cdn.example/b.js',
          },
        },
        integrity: {
          'https://cdn.example/lib.js?integrity-query=1': `sha384-${'A'.repeat(64)}`,
        },
      }),
    });
    const mapNode = {
      getAttribute: (name: string) => (name === 'type' ? 'importmap' : null),
      textContent: '{"imports":{"a":"/a.js?token-like=1"}}',
    };
    const validSri = `sha384-${'A'.repeat(64)}`;
    const sandbox = makeBarePage({
      __NATIVE_FEDERATION__: {
        remotes: {
          r: {
            scopeUrl: 'https://user:pw@remote.example/app/?query=1#frag',
            exposes: [
              {
                file: './entry.js?v=session-token-123',
                moduleName: 'https://remote.example/entry.js?m=1',
              },
            ],
            // Integrity keys are file names (relative URLs); valid SRI
            // values are kept by policy, invalid ones rejected loudly.
            integrity: {
              'entry.js?v=sig-leaked': validSri,
              'bad.js': 'not-an-sri-hash',
            },
          },
        },
        'scoped-externals': {
          mfe1: {
            'scoped-pkg': {
              tag: '1.0.0',
              entries: { 'scoped-pkg': './scoped.js?q=scoped-entry-leaked#frag' },
            },
          },
        },
        'shared-externals': {
          __GLOBAL__: {
            pkg: {
              dirty: false,
              versions: [
                {
                  tag: '1.0.0',
                  action: 'share',
                  host: false,
                  remotes: [
                    {
                      name: 'r',
                      requiredVersion: '^1.0.0',
                      strictVersion: false,
                      file: 'chunk.js?sig=file-leaked',
                      cached: true,
                    },
                    {
                      name: 'v45-remote',
                      requiredVersion: '^1.0.0',
                      strictVersion: false,
                      entries: { pkg: './pkg.js?token=entries-leaked#frag' },
                      cached: true,
                    },
                  ],
                },
              ],
            },
          },
        },
        'shared-chunks': {},
      },
      document: { readyState: 'complete', querySelectorAll: () => [mapNode] },
      importShim,
    });

    const snapshot = capturePage(sandbox);

    expect(snapshot.runtime!.remotes['r'].scopeUrl).toBe('https://remote.example/app/');
    expect(snapshot.runtime!.remotes['r'].exposes[0]).toEqual({
      moduleName: 'https://remote.example/entry.js',
      file: './entry.js',
    });
    // Valid SRI kept under a sanitized key; the invalid one is rejected.
    expect(snapshot.runtime!.remotes['r'].integrity).toEqual({ 'entry.js': validSri });
    expect(snapshot.errors.some((error) => error.code === 'invalid-integrity')).toBe(true);
    // `file` fields are URLs too — sanitized even without a path prefix.
    const participants = snapshot.runtime!.sharedExternals['__GLOBAL__']['pkg'].versions[0].remotes;
    expect(participants[0].file).toBe('chunk.js');
    expect(participants[0].servedFiles).toEqual([{ entry: null, file: 'chunk.js' }]);
    // `entries` values are file names too — sanitized like every URL, and
    // the normalized served files carry the sanitized value.
    expect(participants[1].entries).toEqual({ pkg: './pkg.js' });
    expect(participants[1].servedFiles).toEqual([{ entry: 'pkg', file: './pkg.js' }]);
    expect(snapshot.runtime!.scopedExternals['mfe1']['scoped-pkg']).toEqual({
      tag: '1.0.0',
      bundle: null,
      entries: { 'scoped-pkg': './scoped.js' },
    });
    const effective = snapshot.importMaps!.effective!;
    expect(effective.imports).toEqual([
      { specifier: 'bare', target: 'https://cdn.example/lib.js' },
      { specifier: 'https://scoped.example/pkg', target: 'https://cdn.example/pkg.js' },
      { specifier: '/a.js', target: 'https://cdn.example/a.js' },
      // Bare specifiers are names, not URLs — nothing may be stripped.
      { specifier: 'foo?x', target: 'https://cdn.example/foo.js' },
    ]);
    expect(effective.scopes).toEqual([
      {
        scope: 'https://scope.example/app/',
        imports: [{ specifier: 'inner', target: 'https://cdn.example/inner.js' }],
      },
      {
        scope: '/app/',
        imports: [{ specifier: './b', target: 'https://cdn.example/b.js' }],
      },
    ]);
    expect(effective.integrityFor).toEqual(['https://cdn.example/lib.js']);
    for (const leak of [
      'hidden-secret',
      'scope-leaked',
      'also-leaked',
      'session-token-123',
      'file-leaked',
      'entries-leaked',
      'scoped-entry-leaked',
      'sig-leaked',
      'not-an-sri-hash',
    ]) {
      expect(JSON.stringify(snapshot)).not.toContain(leak);
    }

    // The document map tag's content rides the same allowlist projection —
    // the raw text (with its query) never reaches the snapshot.
    expect(snapshot.importMaps!.documentMaps).toEqual([
      {
        kind: 'importmap',
        parsed: true,
        importCount: 1,
        scopeCount: 0,
        imports: [{ specifier: 'a', target: '/a.js' }],
        scopes: [],
        integrity: {},
      },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('token-like');

    expect(scanForPrivacyViolations(snapshot)).toEqual([]);
  });

  it('produces a scan-clean snapshot for the hostile page', () => {
    const page = buildHostilePage();
    const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, page.sandbox);
    const shim = evaluateProbe(SHIM_MAP_PROBE_SOURCE, page.sandbox);
    const snapshot = mapProbeResult(raw, shim, { capturedAt: CAPTURED_AT });

    // The getter-backed remote lacks a readable scopeUrl and is dropped.
    expect(snapshot.runtime!.remotes).toEqual({});
    expect(snapshot.errors.some((error) => error.code === 'remote-incomplete')).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain('should-never-be-read');
    // The hostile getImportMap threw — the channel says so honestly.
    expect(snapshot.channels.importShim).toEqual({
      state: 'not-recognized',
      reason: 'importShim present but the effective map could not be read',
    });
    expect(snapshot.errors.some((error) => error.code === 'map-call-threw')).toBe(true);
    // The hostile document map's query survives only stripped from the
    // projected tag content.
    expect(snapshot.importMaps!.documentMaps[0].imports).toEqual([
      { specifier: 'a', target: '/a.js' },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('hidden');
    expect(scanForPrivacyViolations(snapshot)).toEqual([]);
  });
});

describe('document map tag content', () => {
  const tagNode = (type: string, text: string) => ({
    getAttribute: (name: string) => (name === 'type' ? type : null),
    textContent: text,
  });
  const captureTags = (nodes: unknown[]): SnapshotV1 => {
    const sandbox = makeBarePage({
      document: { readyState: 'complete', querySelectorAll: () => nodes },
    });
    const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, sandbox);
    return mapProbeResult(raw, null, { capturedAt: CAPTURED_AT });
  };

  it('projects per-tag imports, scopes, and integrity with hash values kept', () => {
    const validSri = `sha384-${'B'.repeat(64)}`;
    const snapshot = captureTags([
      tagNode(
        'importmap-shim',
        JSON.stringify({
          imports: { pkg: './pkg.js' },
          scopes: { './mfe1/': { inner: './inner.js' } },
          integrity: { './pkg.js': validSri },
        }),
      ),
      tagNode('importmap-shim', '{"imports":{"pkg":"./pkg-v2.js"}}'),
    ]);

    expect(snapshot.importMaps!.documentMaps).toEqual([
      {
        kind: 'importmap-shim',
        parsed: true,
        importCount: 1,
        scopeCount: 1,
        imports: [{ specifier: 'pkg', target: './pkg.js' }],
        scopes: [{ scope: './mfe1/', imports: [{ specifier: 'inner', target: './inner.js' }] }],
        integrity: { './pkg.js': validSri },
      },
      {
        kind: 'importmap-shim',
        parsed: true,
        importCount: 1,
        scopeCount: 0,
        imports: [{ specifier: 'pkg', target: './pkg-v2.js' }],
        scopes: [],
        integrity: {},
      },
    ]);
    expect(scanForPrivacyViolations(snapshot)).toEqual([]);
  });

  it('records an unparsable tag as parsed:false with no content claim', () => {
    const snapshot = captureTags([tagNode('importmap', 'not json {')]);

    expect(snapshot.importMaps!.documentMaps).toEqual([
      {
        kind: 'importmap',
        parsed: false,
        importCount: 0,
        scopeCount: 0,
        imports: [],
        scopes: [],
        integrity: {},
      },
    ]);
  });

  it('rejects an invalid SRI value in tag integrity loudly', () => {
    const snapshot = captureTags([
      tagNode('importmap-shim', '{"integrity":{"./pkg.js":"not-an-sri"}}'),
    ]);

    expect(snapshot.importMaps!.documentMaps[0].integrity).toEqual({});
    expect(snapshot.errors.some((error) => error.code === 'invalid-integrity')).toBe(true);
  });
});

describe('entry-cap truncation is loud (T4-AC-06)', () => {
  it('surfaces probe-side truncation of a chunk-heavy page in the snapshot errors', () => {
    // 30 bundles × 40 files = 1200 entries — far over the probe's global
    // entry cap (maxTotalEntries: 512). Truncation must never be silent:
    // the probe records it and the mapper carries it into the snapshot.
    const bundles: Record<string, string[]> = {};
    for (let index = 0; index < 30; index += 1) {
      bundles[`bundle-${index}`] = Array.from(
        { length: 40 },
        (_, file) => `chunk-${index}-${file}.js`,
      );
    }
    const sandbox = makeBarePage({
      __NATIVE_FEDERATION__: {
        remotes: {},
        'shared-externals': {},
        'shared-chunks': { host: bundles },
      },
    });
    const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, sandbox);
    const snapshot = mapProbeResult(raw, null, { capturedAt: CAPTURED_AT });

    expect(snapshot.channels.nativeFederationGlobals).toEqual({ state: 'available' });
    const retained = Object.values(snapshot.runtime!.sharedChunks['host']).reduce(
      (count, files) => count + files.length,
      0,
    );
    expect(retained).toBeLessThan(1200);
    expect(snapshot.errors.map((error) => error.code)).toContain('array-item-limit');
  });
});

describe('degenerate probe input', () => {
  it('rejects an otherwise-valid passive-probe/2 result after the /3 contract bump (T2.1-AC-01)', () => {
    const legacyRaw = {
      ...makeRawAnchorProbe(makeAnchorParticipant({ pool: 'legacy-pool' })),
      schemaVersion: 'passive-probe/2',
    };

    const snapshot = mapProbeResult(legacyRaw, null, { capturedAt: CAPTURED_AT });

    expect(snapshot.channels).toEqual({
      nativeFederationGlobals: { state: 'unavailable', reason: 'probe result unavailable' },
      domImportMaps: { state: 'unavailable', reason: 'probe result unavailable' },
      importShim: { state: 'unavailable', reason: 'probe result unavailable' },
    });
    expect(snapshot.runtime).toBeNull();
    expect(snapshot.importMaps).toBeNull();
    expect(snapshot.errors).toEqual([{ stage: 'mapper', code: 'probe-result-invalid' }]);
  });

  it('maps garbage probe results to explicit unavailable states', () => {
    for (const garbage of [null, undefined, 42, 'nope', { schemaVersion: 'other/1' }]) {
      const snapshot = mapProbeResult(garbage, null, { capturedAt: CAPTURED_AT });
      expect(snapshot.channels.nativeFederationGlobals.state).toBe('unavailable');
      expect(snapshot.channels.domImportMaps.state).toBe('unavailable');
      expect(snapshot.channels.importShim.state).toBe('unavailable');
      expect(snapshot.runtime).toBeNull();
      expect(snapshot.importMaps).toBeNull();
      expect(snapshot.capture.pageUrl).toBe('');
      expect(snapshot.errors.some((error) => error.code === 'probe-result-invalid')).toBe(true);
      expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    }
  });

  it('marks the shim channel not-recognized when the shim probe result is missing or invalid', () => {
    const page = buildFrankensteinPage();
    const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, page.sandbox);

    const withoutShim = mapProbeResult(raw, null, { capturedAt: CAPTURED_AT });
    expect(withoutShim.channels.importShim).toEqual({
      state: 'not-recognized',
      reason: 'importShim present but the shim map probe returned no result',
    });
    expect(withoutShim.importMaps!.effective).toBeNull();
    // The DOM channel still carries the document maps.
    expect(withoutShim.importMaps!.documentMaps.length).toBe(1);

    const withGarbageShim = mapProbeResult(raw, 'garbage', { capturedAt: CAPTURED_AT });
    expect(withGarbageShim.channels.importShim.state).toBe('not-recognized');
    expect(withGarbageShim.errors.some((error) => error.code === 'shim-result-invalid')).toBe(true);
  });
});
