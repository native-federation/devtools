/**
 * STORAGE_PROBE_SOURCE behavior: it reads exactly the four
 * `<namespace>.<key>` items of the storage the descriptor names (or both
 * storages under the default namespace without a descriptor), by
 * descriptor only — no Storage method is ever called, nothing else stored
 * is copied, and page state stays byte-identical.
 */
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { STORAGE_PROBE_SOURCE } from './storage-probe';
import {
  buildHostilePage,
  digestState,
  evaluateProbe,
  makeBarePage,
  makeCounters,
  makeStorage,
} from '../testing/fixture-pages';

const REMOTES = JSON.stringify({
  host: { scopeUrl: 'https://host.example/', exposes: [], integrity: {} },
});

function descriptor(namespace: string, type: string): Record<string, unknown> {
  return { storage: { [namespace]: { version: '4.7.0', type, namespace, keys: [] } } };
}

function run(sandbox: Record<string, unknown>): Record<string, any> {
  return evaluateProbe(STORAGE_PROBE_SOURCE, sandbox) as Record<string, any>;
}

describe('storage probe (descriptor path)', () => {
  it.each(['localStorage', 'sessionStorage'])(
    'reads the four items of %s and nothing else',
    (type) => {
      const counters = makeCounters();
      const storage = makeStorage(counters, 'unchanged', {
        '__MY_NF__.remotes': REMOTES,
        '__MY_NF__.shared-externals': '{}',
        'unrelated.secret': 'session-token',
      });
      const sandbox = makeBarePage({
        __NF_ORCHESTRATOR__: descriptor('__MY_NF__', type),
        [type]: storage,
      });
      const before = digestState({ storage });

      const raw = run(sandbox);

      expect(raw['schemaVersion']).toBe('storage-probe/1');
      expect(raw['source']).toEqual({ type, namespace: '__MY_NF__', discovery: 'descriptor' });
      expect(Object.keys(raw['storages'])).toEqual([type]);
      expect(raw['storages'][type]).toEqual({
        available: true,
        items: {
          remotes: { present: true, descriptor: 'data', text: REMOTES },
          'scoped-externals': { present: false },
          'shared-externals': { present: true, descriptor: 'data', text: '{}' },
          'shared-chunks': { present: false },
        },
      });
      expect(JSON.stringify(raw)).not.toContain('session-token');
      expect(counters.storageOps).toBe(0);
      expect(digestState({ storage })).toBe(before);
      expect(raw['errors']).toEqual([]);
    },
  );

  it('reads no storage for a globalThis or custom descriptor', () => {
    const counters = makeCounters();
    for (const type of ['globalThis', 'custom']) {
      const raw = run(
        makeBarePage({
          __NF_ORCHESTRATOR__: descriptor('__NATIVE_FEDERATION__', type),
          localStorage: makeStorage(counters, 'l'),
          sessionStorage: makeStorage(counters, 's'),
        }),
      );
      expect(raw['storages']).toEqual({});
    }
  });
});

describe('storage probe (legacy default path)', () => {
  it('reads both storages under the default namespace', () => {
    const counters = makeCounters();
    const raw = run(
      makeBarePage({
        localStorage: makeStorage(counters, 'l', { '__NATIVE_FEDERATION__.remotes': REMOTES }),
        sessionStorage: makeStorage(counters, 's'),
      }),
    );

    expect(raw['source']).toEqual({
      type: 'globalThis',
      namespace: '__NATIVE_FEDERATION__',
      discovery: 'default',
    });
    expect(raw['storages']['localStorage'].items.remotes).toEqual({
      present: true,
      descriptor: 'data',
      text: REMOTES,
    });
    expect(raw['storages']['sessionStorage'].items.remotes).toEqual({ present: false });
    expect(counters.storageOps).toBe(0);
  });
});

describe('storage probe containment', () => {
  it('turns a throwing storage getter into an error entry', () => {
    // node:vm ignores accessors defined on the sandbox from outside, so the
    // throwing getter (a sandboxed frame's SecurityError) is installed in-context.
    const sandbox = vm.createContext(makeBarePage({}));
    vm.runInContext(
      'Object.defineProperty(globalThis, "localStorage", { get() { throw new Error("SecurityError"); } })',
      sandbox,
    );

    const raw = run(sandbox);

    expect(raw['storages']['localStorage']).toEqual({ available: false });
    expect(raw['errors']).toContainEqual({
      stage: 'storage-probe',
      code: 'storage-unavailable',
      detail: { path: 'localStorage' },
    });
    expect(JSON.parse(JSON.stringify(raw))).toEqual(raw);
  });

  it('withholds an oversized item instead of truncating it', () => {
    const counters = makeCounters();
    const raw = run(
      makeBarePage({
        localStorage: makeStorage(counters, 'l', {
          '__NATIVE_FEDERATION__.remotes': 'x'.repeat(262145),
        }),
      }),
    );

    expect(raw['storages']['localStorage'].items.remotes).toEqual({
      present: true,
      descriptor: 'data',
      truncated: true,
    });
    expect(raw['errors']).toContainEqual({
      stage: 'storage-probe',
      code: 'storage-text-limit',
      detail: { path: 'localStorage.remotes', observed: 262145 },
    });
  });

  it('never fires an accessor-backed item', () => {
    const counters = makeCounters();
    const storage = makeStorage(counters, 'l');
    let getterCalls = 0;
    Object.defineProperty(storage, '__NATIVE_FEDERATION__.remotes', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return REMOTES;
      },
    });

    const raw = run(makeBarePage({ localStorage: storage }));

    expect(getterCalls).toBe(0);
    expect(raw['storages']['localStorage'].items.remotes).toEqual({
      present: true,
      descriptor: 'unavailable',
    });
  });

  it('leaves the hostile page untouched', () => {
    const page = buildHostilePage();
    const before = digestState(page.digestTargets);

    const raw = run(page.sandbox);

    expect(digestState(page.digestTargets)).toBe(before);
    expect(page.counters.storageOps).toBe(0);
    expect(page.counters.getterCalls).toBe(0);
    expect(page.counters.loaderCalls).toBe(0);
    expect(JSON.parse(JSON.stringify(raw))).toEqual(raw);
  });
});
