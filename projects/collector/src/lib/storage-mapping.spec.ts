/**
 * Runtime source matrix, end to end through the real probes and the gate:
 * descriptor × {globalThis, custom namespace, local, session, custom},
 * legacy × {global, local, session, both, none}, and hostile storage
 * contents (invalid JSON, oversized item, accessor item, mismatched
 * storage probe result).
 */
import { describe, expect, it } from 'vitest';
import { PASSIVE_PROBE_SOURCE } from './passive-probe';
import { mapProbeResult, storageProbeIndicated } from './snapshot-mapper';
import { STORAGE_PROBE_SOURCE } from './storage-probe';
import { evaluateProbe, makeBarePage, makeCounters, makeStorage } from '../testing/fixture-pages';

const CAPTURED_AT = '2026-09-29T00:00:00.000Z';

const remotes = (scopeUrl: string) => ({
  host: { scopeUrl, exposes: [{ moduleName: './App', file: 'App.js' }], integrity: {} },
});

// What the orchestrator's web-storage entries write: JSON per key.
function webItems(namespace: string, scopeUrl: string): Record<string, string> {
  return {
    [`${namespace}.remotes`]: JSON.stringify(remotes(scopeUrl)),
    [`${namespace}.shared-externals`]: JSON.stringify({}),
  };
}

function descriptor(namespace: string, type: string): Record<string, unknown> {
  return { storage: { [namespace]: { version: '4.7.0', type, namespace, keys: [] } } };
}

function capture(globals: Record<string, unknown>) {
  const counters = makeCounters();
  const page = makeBarePage({
    localStorage: makeStorage(counters, 'l', (globals['local'] as Record<string, string>) ?? {}),
    sessionStorage: makeStorage(
      counters,
      's',
      (globals['session'] as Record<string, string>) ?? {},
    ),
    ...Object.fromEntries(
      Object.entries(globals).filter(([key]) => key !== 'local' && key !== 'session'),
    ),
  });
  const rawProbe = evaluateProbe(PASSIVE_PROBE_SOURCE, page);
  const indicated = storageProbeIndicated(rawProbe);
  const rawStorage = indicated ? evaluateProbe(STORAGE_PROBE_SOURCE, page) : null;
  const snapshot = mapProbeResult(rawProbe, null, { capturedAt: CAPTURED_AT }, rawStorage);
  expect(counters.storageOps).toBe(0);
  return { indicated, snapshot, rawProbe, rawStorage };
}

describe('descriptor path', () => {
  it('does not run the storage probe for globalThis', () => {
    const { indicated, snapshot } = capture({
      __NF_ORCHESTRATOR__: descriptor('__NATIVE_FEDERATION__', 'globalThis'),
      __NATIVE_FEDERATION__: { remotes: remotes('https://global.example/') },
    });

    expect(indicated).toBe(false);
    expect(snapshot.runtime?.remotes['host'].scopeUrl).toBe('https://global.example/');
  });

  it.each(['localStorage', 'sessionStorage'] as const)('reads %s state', (type) => {
    const { indicated, snapshot } = capture({
      __NF_ORCHESTRATOR__: descriptor('__MY_NF__', type),
      [type === 'localStorage' ? 'local' : 'session']: webItems(
        '__MY_NF__',
        'https://web.example/',
      ),
      // A stale default global must not win over the descriptor.
      __NATIVE_FEDERATION__: { remotes: remotes('https://stale.example/') },
    });

    expect(indicated).toBe(true);
    expect(snapshot.channels.nativeFederationGlobals).toEqual({ state: 'available' });
    expect(snapshot.runtime?.remotes['host']).toEqual({
      scopeUrl: 'https://web.example/',
      exposes: [{ moduleName: './App', file: 'App.js' }],
      integrity: {},
    });
    expect(snapshot.runtime?.scopedExternals).toEqual({});
    expect(snapshot.runtimeSource).toEqual({
      storage: type,
      namespace: '__MY_NF__',
      discovery: 'descriptor',
      orchestratorVersion: '4.7.0',
      otherNamespaces: [],
    });
    expect(snapshot.errors).toEqual([]);
  });

  it('reports an empty web storage as unavailable, not unrecognized', () => {
    const { snapshot } = capture({
      __NF_ORCHESTRATOR__: descriptor('__NATIVE_FEDERATION__', 'localStorage'),
    });

    expect(snapshot.channels.nativeFederationGlobals).toEqual({
      state: 'unavailable',
      reason: 'no Native Federation state in localStorage',
    });
    expect(snapshot.runtimeSource?.storage).toBe('localStorage');
  });

  it('reports a missing storage probe result', () => {
    const counters = makeCounters();
    const page = makeBarePage({
      __NF_ORCHESTRATOR__: descriptor('__NATIVE_FEDERATION__', 'sessionStorage'),
      sessionStorage: makeStorage(counters, 's'),
    });
    const snapshot = mapProbeResult(evaluateProbe(PASSIVE_PROBE_SOURCE, page), null, {
      capturedAt: CAPTURED_AT,
    });

    expect(snapshot.channels.nativeFederationGlobals).toEqual({
      state: 'unavailable',
      reason: 'storage probe result unavailable',
    });
  });

  it('does not run the storage probe for custom adapters', () => {
    const { indicated, snapshot } = capture({
      __NF_ORCHESTRATOR__: descriptor('__NATIVE_FEDERATION__', 'custom'),
      local: webItems('__NATIVE_FEDERATION__', 'https://web.example/'),
    });

    expect(indicated).toBe(false);
    expect(snapshot.channels.nativeFederationGlobals.state).toBe('unavailable');
    expect(snapshot.errors).toContainEqual({ stage: 'mapper', code: 'custom-storage-unsupported' });
  });
});

describe('legacy default path (no descriptor)', () => {
  it('keeps reading the global without running the storage probe', () => {
    const { indicated, snapshot } = capture({
      __NATIVE_FEDERATION__: { remotes: remotes('https://global.example/') },
      local: webItems('__NATIVE_FEDERATION__', 'https://web.example/'),
    });

    expect(indicated).toBe(false);
    expect(snapshot.runtime?.remotes['host'].scopeUrl).toBe('https://global.example/');
    expect(snapshot.runtimeSource?.storage).toBe('globalThis');
  });

  it.each([
    ['local', 'localStorage'],
    ['session', 'sessionStorage'],
  ] as const)('falls back to %sStorage', (holder, storage) => {
    const { indicated, snapshot } = capture({
      [holder]: webItems('__NATIVE_FEDERATION__', 'https://web.example/'),
    });

    expect(indicated).toBe(true);
    expect(snapshot.runtime?.remotes['host'].scopeUrl).toBe('https://web.example/');
    expect(snapshot.runtimeSource).toEqual({
      storage,
      namespace: '__NATIVE_FEDERATION__',
      discovery: 'default',
      orchestratorVersion: null,
      otherNamespaces: [],
    });
    expect(snapshot.errors).toEqual([]);
  });

  it('prefers localStorage when both hold state, and says so', () => {
    const { snapshot } = capture({
      local: webItems('__NATIVE_FEDERATION__', 'https://local.example/'),
      session: webItems('__NATIVE_FEDERATION__', 'https://session.example/'),
    });

    expect(snapshot.runtime?.remotes['host'].scopeUrl).toBe('https://local.example/');
    expect(snapshot.runtimeSource?.storage).toBe('localStorage');
    expect(snapshot.errors).toContainEqual({ stage: 'mapper', code: 'storage-ambiguous' });
  });

  it('stays unavailable when nothing holds state', () => {
    const { snapshot } = capture({});

    expect(snapshot.channels.nativeFederationGlobals).toEqual({
      state: 'unavailable',
      reason:
        'window.__NATIVE_FEDERATION__ is not defined; no state in localStorage or sessionStorage',
    });
    expect(snapshot.runtimeSource).toBeUndefined();
  });
});

describe('hostile storage contents', () => {
  it('marks invalid JSON as unreadable', () => {
    const { snapshot } = capture({
      __NF_ORCHESTRATOR__: descriptor('__NATIVE_FEDERATION__', 'localStorage'),
      local: { '__NATIVE_FEDERATION__.remotes': '{not json' },
    });

    expect(snapshot.channels.nativeFederationGlobals).toEqual({
      state: 'not-recognized',
      reason: 'localStorage present but repositories unreadable: remotes',
    });
    expect(snapshot.errors).toContainEqual({
      stage: 'mapper',
      code: 'storage-json-invalid',
      detail: { path: 'localStorage.remotes' },
    });
  });

  it('never half-parses an oversized item', () => {
    const { snapshot } = capture({
      __NF_ORCHESTRATOR__: descriptor('__NATIVE_FEDERATION__', 'localStorage'),
      local: { '__NATIVE_FEDERATION__.remotes': JSON.stringify({ pad: 'x'.repeat(262144) }) },
    });

    expect(snapshot.channels.nativeFederationGlobals.state).toBe('not-recognized');
    expect(snapshot.errors.map((error) => error.code)).toContain('storage-text-limit');
  });

  it('projects parsed storage through the schema allowlist', () => {
    const { snapshot } = capture({
      __NF_ORCHESTRATOR__: descriptor('__NATIVE_FEDERATION__', 'localStorage'),
      local: {
        '__NATIVE_FEDERATION__.remotes': JSON.stringify({
          host: {
            scopeUrl: 'https://user:pw@web.example/?token=secret#frag',
            exposes: [],
            integrity: {},
            businessPayload: 'private meeting notes',
          },
        }),
      },
    });

    expect(snapshot.runtime?.remotes['host'].scopeUrl).toBe('https://web.example/');
    expect(JSON.stringify(snapshot)).not.toContain('private meeting notes');
    expect(JSON.stringify(snapshot)).not.toContain('secret');
  });

  it('rejects a storage probe result for another namespace', () => {
    const counters = makeCounters();
    const page = makeBarePage({
      __NF_ORCHESTRATOR__: descriptor('__NATIVE_FEDERATION__', 'localStorage'),
      localStorage: makeStorage(
        counters,
        'l',
        webItems('__NATIVE_FEDERATION__', 'https://web.example/'),
      ),
    });
    const rawProbe = evaluateProbe(PASSIVE_PROBE_SOURCE, page);
    const rawStorage = evaluateProbe(STORAGE_PROBE_SOURCE, page) as Record<string, any>;
    rawStorage['source'] = { ...rawStorage['source'], namespace: '__OTHER__' };

    const snapshot = mapProbeResult(rawProbe, null, { capturedAt: CAPTURED_AT }, rawStorage);

    expect(snapshot.runtime).toBeNull();
    expect(snapshot.errors).toContainEqual({ stage: 'mapper', code: 'storage-source-mismatch' });
  });

  it('rejects a storage probe result for another storage type', () => {
    // The page swapped its descriptor from sessionStorage to localStorage
    // between the passive eval and the storage eval.
    const counters = makeCounters();
    const page = makeBarePage({
      __NF_ORCHESTRATOR__: descriptor('__NATIVE_FEDERATION__', 'sessionStorage'),
      sessionStorage: makeStorage(
        counters,
        's',
        webItems('__NATIVE_FEDERATION__', 'https://web.example/'),
      ),
    });
    const rawProbe = evaluateProbe(PASSIVE_PROBE_SOURCE, page);
    const rawStorage = evaluateProbe(STORAGE_PROBE_SOURCE, page) as Record<string, any>;
    rawStorage['source'] = { ...rawStorage['source'], type: 'localStorage' };

    const snapshot = mapProbeResult(rawProbe, null, { capturedAt: CAPTURED_AT }, rawStorage);

    expect(snapshot.runtime).toBeNull();
    expect(snapshot.errors).toContainEqual({ stage: 'mapper', code: 'storage-source-mismatch' });
  });
});
