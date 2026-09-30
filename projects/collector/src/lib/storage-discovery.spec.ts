/**
 * Storage discovery through `globalThis.__NF_ORCHESTRATOR__` (orchestrator
 * >= 4.7, native-federation/orchestrator#86): the passive probe follows the
 * descriptor to the namespace it names, never touches the descriptor's
 * `get`, and falls back to the default `__NATIVE_FEDERATION__` global when
 * the descriptor is absent or unreadable.
 */
import { describe, expect, it } from 'vitest';
import { PASSIVE_PROBE_SOURCE } from './passive-probe';
import { mapProbeResult } from './snapshot-mapper';
import { evaluateProbe, makeBarePage } from '../testing/fixture-pages';

const CAPTURED_AT = '2026-09-29T00:00:00.000Z';

// Minimal namespace: one remote, the other three keys lazily absent.
function namespaceState(scopeUrl = 'https://host.example/'): Record<string, unknown> {
  return { remotes: { host: { scopeUrl, exposes: [], integrity: {} } } };
}

function descriptorEntry(
  namespace: string,
  type: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: '4.7.0',
    type,
    namespace,
    keys: ['remotes', 'shared-externals', 'scoped-externals', 'shared-chunks'],
    ...extra,
  };
}

function orchestrator(entries: Record<string, unknown>): Record<string, unknown> {
  return { storage: entries };
}

function capture(globals: Record<string, unknown>) {
  const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, makeBarePage(globals)) as Record<string, any>;
  return { raw, snapshot: mapProbeResult(raw, null, { capturedAt: CAPTURED_AT }) };
}

describe('descriptor discovery (passive probe + mapper)', () => {
  it('reads a globalThis namespace other than the default', () => {
    const { snapshot } = capture({
      __NF_ORCHESTRATOR__: orchestrator({ __MY_NF__: descriptorEntry('__MY_NF__', 'globalThis') }),
      __MY_NF__: namespaceState(),
      // Must be ignored: the descriptor points elsewhere.
      __NATIVE_FEDERATION__: namespaceState('https://stale.example/'),
    });

    expect(snapshot.channels.nativeFederationGlobals).toEqual({ state: 'available' });
    expect(snapshot.runtime?.remotes['host'].scopeUrl).toBe('https://host.example/');
    expect(snapshot.runtimeSource).toEqual({
      storage: 'globalThis',
      namespace: '__MY_NF__',
      discovery: 'descriptor',
      orchestratorVersion: '4.7.0',
      otherNamespaces: [],
    });
  });

  it('never reads or calls the descriptor get', () => {
    let touched = 0;
    const entry = descriptorEntry('__NATIVE_FEDERATION__', 'globalThis');
    Object.defineProperty(entry, 'get', {
      enumerable: true,
      get() {
        touched += 1;
        return () => {
          touched += 1;
        };
      },
    });

    const { snapshot } = capture({
      __NF_ORCHESTRATOR__: orchestrator({ __NATIVE_FEDERATION__: entry }),
      __NATIVE_FEDERATION__: namespaceState(),
    });

    expect(touched).toBe(0);
    expect(snapshot.channels.nativeFederationGlobals.state).toBe('available');
  });

  it('reports custom storage adapters as unsupported', () => {
    const { snapshot } = capture({
      __NF_ORCHESTRATOR__: orchestrator({
        __NATIVE_FEDERATION__: descriptorEntry('__NATIVE_FEDERATION__', 'custom'),
      }),
    });

    expect(snapshot.channels.nativeFederationGlobals).toEqual({
      state: 'unavailable',
      reason: "custom storage adapters are not supported (namespace '__NATIVE_FEDERATION__')",
    });
    expect(snapshot.runtime).toBeNull();
    expect(snapshot.runtimeSource?.storage).toBe('custom');
    expect(snapshot.errors).toContainEqual({ stage: 'mapper', code: 'custom-storage-unsupported' });
  });

  it('prefers the default namespace and lists the others', () => {
    const { snapshot } = capture({
      __NF_ORCHESTRATOR__: orchestrator({
        __A__: descriptorEntry('__A__', 'globalThis'),
        __NATIVE_FEDERATION__: descriptorEntry('__NATIVE_FEDERATION__', 'globalThis'),
      }),
      __A__: namespaceState('https://a.example/'),
      __NATIVE_FEDERATION__: namespaceState(),
    });

    expect(snapshot.runtime?.remotes['host'].scopeUrl).toBe('https://host.example/');
    expect(snapshot.runtimeSource?.namespace).toBe('__NATIVE_FEDERATION__');
    expect(snapshot.runtimeSource?.otherNamespaces).toEqual(['__A__']);
  });

  it('picks the first sorted namespace when the default is not among them', () => {
    const { snapshot } = capture({
      __NF_ORCHESTRATOR__: orchestrator({
        __B__: descriptorEntry('__B__', 'globalThis'),
        __A__: descriptorEntry('__A__', 'globalThis'),
      }),
      __A__: namespaceState('https://a.example/'),
      __B__: namespaceState('https://b.example/'),
    });

    expect(snapshot.runtime?.remotes['host'].scopeUrl).toBe('https://a.example/');
    expect(snapshot.runtimeSource?.otherNamespaces).toEqual(['__B__']);
  });

  it('keeps the descriptor source when its global is missing', () => {
    const { snapshot } = capture({
      __NF_ORCHESTRATOR__: orchestrator({ __MY_NF__: descriptorEntry('__MY_NF__', 'globalThis') }),
    });

    expect(snapshot.channels.nativeFederationGlobals).toEqual({
      state: 'unavailable',
      reason: 'window.__MY_NF__ is not defined',
    });
    expect(snapshot.runtimeSource?.discovery).toBe('descriptor');
  });

  it('marks an unknown storage type as not recognized', () => {
    const { snapshot } = capture({
      __NF_ORCHESTRATOR__: orchestrator({
        __NATIVE_FEDERATION__: descriptorEntry('__NATIVE_FEDERATION__', 'indexedDB'),
      }),
    });

    expect(snapshot.channels.nativeFederationGlobals).toEqual({
      state: 'not-recognized',
      reason: "orchestrator reports unknown storage type 'indexedDB'",
    });
  });

  it('falls back to the default global without a descriptor (orchestrator < 4.7)', () => {
    const { raw, snapshot } = capture({ __NATIVE_FEDERATION__: namespaceState() });

    expect(raw['globals'].orchestrator).toEqual({ present: false });
    expect(raw['globals'].nativeFederation.source).toEqual({
      type: 'globalThis',
      namespace: '__NATIVE_FEDERATION__',
      discovery: 'default',
    });
    expect(snapshot.runtimeSource).toEqual({
      storage: 'globalThis',
      namespace: '__NATIVE_FEDERATION__',
      discovery: 'default',
      orchestratorVersion: null,
      otherNamespaces: [],
    });
  });
});

describe('hostile descriptors are contained', () => {
  it('skips an accessor-backed descriptor and falls back to the default', () => {
    let getterCalls = 0;
    const sandbox = makeBarePage({ __NATIVE_FEDERATION__: namespaceState() });
    Object.defineProperty(sandbox, '__NF_ORCHESTRATOR__', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return orchestrator({ __X__: descriptorEntry('__X__', 'custom') });
      },
    });

    const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, sandbox) as Record<string, any>;
    const snapshot = mapProbeResult(raw, null, { capturedAt: CAPTURED_AT });

    expect(getterCalls).toBe(0);
    expect(snapshot.channels.nativeFederationGlobals.state).toBe('available');
    expect(snapshot.runtimeSource?.discovery).toBe('default');
  });

  it('treats a non-object storage map as no descriptor', () => {
    const { snapshot } = capture({
      __NF_ORCHESTRATOR__: { storage: 'nope' },
      __NATIVE_FEDERATION__: namespaceState(),
    });

    expect(snapshot.runtimeSource?.discovery).toBe('default');
  });

  it('contains a throwing proxy descriptor', () => {
    const hostile = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error('hostile trap');
        },
      },
    );
    const { raw, snapshot } = capture({
      __NF_ORCHESTRATOR__: hostile,
      __NATIVE_FEDERATION__: namespaceState(),
    });

    expect(raw['errors']).toContainEqual({
      stage: 'probe',
      code: 'property-unavailable',
      detail: { path: '__NF_ORCHESTRATOR__.storage' },
    });
    expect(snapshot.channels.nativeFederationGlobals.state).toBe('available');
    expect(JSON.parse(JSON.stringify(raw))).toEqual(raw);
  });

  it('caps the number of namespaces', () => {
    const entries: Record<string, unknown> = {};
    for (let index = 0; index < 10; index += 1) {
      entries[`__NS_${index}__`] = descriptorEntry(`__NS_${index}__`, 'globalThis');
    }
    const { raw } = capture({ __NF_ORCHESTRATOR__: orchestrator(entries) });

    expect(raw['globals'].orchestrator.entries).toHaveLength(8);
    expect(raw['errors']).toContainEqual({
      stage: 'probe',
      code: 'namespace-limit',
      detail: { path: '__NF_ORCHESTRATOR__.storage', observed: 10 },
    });
  });

  it('keeps unsafe namespace keys out of the output', () => {
    const { raw } = capture({
      __NF_ORCHESTRATOR__: orchestrator({
        'bad\u0000key': descriptorEntry('bad', 'globalThis'),
      }),
      __NATIVE_FEDERATION__: namespaceState(),
    });

    expect(raw['globals'].orchestrator.entries).toEqual([]);
    expect(raw['globals'].nativeFederation.source.discovery).toBe('default');
  });
});
