/**
 * Edge cases (T7-AC-03): cyclic, accessor-backed, proxied, oversized, and
 * malformed values produce bounded data or structured collection errors —
 * the capture as a whole never throws and always returns a
 * JSON-serializable value.
 */
import { describe, expect, it } from 'vitest';
import { PASSIVE_PROBE_SOURCE } from './passive-probe';
import { SHIM_MAP_PROBE_SOURCE } from './shim-map-probe';
import { evaluateProbe, makeBarePage } from '../testing/fixture-pages';

interface ProbeResultLike {
  errors: { code: string; detail?: { observed?: number } }[];
  map?: { imports?: Record<string, string> } | null;
  importMaps?: { text: string }[] | null;
  globals?: {
    nativeFederation: Record<string, unknown> & {
      repositories?: Record<string, { value?: unknown }>;
    };
  };
}

function runMain(sandbox: Record<string, unknown>): ProbeResultLike {
  const result = evaluateProbe(PASSIVE_PROBE_SOURCE, sandbox) as ProbeResultLike;
  // The capture as a whole never throws and is always JSON-serializable.
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  return result;
}

function runShim(sandbox: Record<string, unknown>): ProbeResultLike {
  const result = evaluateProbe(SHIM_MAP_PROBE_SOURCE, sandbox) as ProbeResultLike;
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  return result;
}

describe('edge cases: cyclic values', () => {
  it('projects cyclic structures into finite, serializable output', () => {
    // Cycles through schema fields terminate because the schema depth is
    // finite; cycles through non-schema fields are never traversed.
    const version: Record<string, unknown> = { tag: 'v1', action: 'share', host: true };
    version['remotes'] = [version];
    const external: Record<string, unknown> = { dirty: false, versions: [version] };
    const scopes: Record<string, unknown> = { __GLOBAL__: { pkg: external } };
    (scopes['__GLOBAL__'] as Record<string, unknown>)['cycle'] = scopes;
    const remote: Record<string, unknown> = { scopeUrl: 'https://edge.example/r/', exposes: [] };
    remote['self'] = remote;

    const sandbox = makeBarePage({
      __NATIVE_FEDERATION__: {
        remotes: { r: remote },
        'scoped-externals': {},
        'shared-externals': scopes,
        'shared-chunks': {},
      },
    });
    runMain(sandbox);
  });
});

describe('edge cases: accessor-backed values', () => {
  it('skips getters on schema fields without invoking them', () => {
    let getterCalls = 0;
    const remote: Record<string, unknown> = { exposes: [] };
    Object.defineProperty(remote, 'scopeUrl', {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('never invoked anyway');
      },
    });
    const sandbox = makeBarePage({
      __NATIVE_FEDERATION__: {
        remotes: { r: remote },
        'scoped-externals': {},
        'shared-externals': {},
        'shared-chunks': {},
      },
    });
    const raw = runMain(sandbox);
    expect(getterCalls).toBe(0);
    expect(raw.errors.some((error) => error.code === 'accessor-skipped')).toBe(true);
  });

  it('reports an accessor-backed global as unreadable instead of reading it', () => {
    let getterCalls = 0;
    const sandbox = makeBarePage();
    Object.defineProperty(sandbox, '__NATIVE_FEDERATION__', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        return {};
      },
    });
    const raw = runMain(sandbox);
    expect(getterCalls).toBe(0);
    expect(raw.globals!.nativeFederation['descriptor']).toBe('accessor');
    expect('value' in raw.globals!.nativeFederation).toBe(false);
  });
});

describe('edge cases: proxied values', () => {
  it('contains throwing proxy traps as structured errors', () => {
    const throwingProxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('hostile ownKeys');
        },
        getOwnPropertyDescriptor() {
          throw new Error('hostile descriptor');
        },
      },
    );
    const sandbox = makeBarePage({
      __NATIVE_FEDERATION__: {
        remotes: throwingProxy,
        'scoped-externals': {},
        'shared-externals': {},
        'shared-chunks': {},
      },
    });
    const raw = runMain(sandbox);
    expect(
      raw.errors.some(
        (error) => error.code === 'keys-unavailable' || error.code === 'property-unavailable',
      ),
    ).toBe(true);
  });

  it('survives the federation global itself being a hostile proxy', () => {
    const hostileGlobal = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error('hostile');
        },
      },
    );
    const sandbox = makeBarePage({ __NATIVE_FEDERATION__: hostileGlobal });
    const raw = runMain(sandbox);
    expect(raw.errors.some((error) => error.code === 'property-unavailable')).toBe(true);
  });
});

describe('edge cases: oversized values', () => {
  it('caps strings, arrays, object keys, and import-map inventory', () => {
    // 'big' is inserted first: only the first 4096 map keys survive the
    // object-key cap, and the oversized remote must be among them for the
    // string and array limits to be exercised.
    const hugeExposes = Array.from({ length: 5000 }, (_, index) => ({
      file: `file-${index}.js`,
      moduleName: 'https://edge.example/m.js',
    }));
    const manyRemotes: Record<string, unknown> = {
      big: { scopeUrl: `https://edge.example/${'x'.repeat(5000)}`, exposes: hugeExposes },
    };
    for (let index = 0; index < 4200; index += 1) {
      manyRemotes[`remote-${index}`] = {
        scopeUrl: 'https://edge.example/',
        exposes: [],
      };
    }

    const mapNodes = Array.from({ length: 40 }, () => ({
      getAttribute: (name: string) => (name === 'type' ? 'importmap' : null),
      textContent: '{"imports":{}}',
    }));
    mapNodes[0] = {
      getAttribute: (name: string) => (name === 'type' ? 'importmap' : null),
      textContent: `{"imports":{"pad":"${'y'.repeat(1100000)}"}}`,
    };

    const sandbox = makeBarePage({
      __NATIVE_FEDERATION__: {
        remotes: manyRemotes,
        'scoped-externals': {},
        'shared-externals': {},
        'shared-chunks': {},
      },
      document: {
        readyState: 'complete',
        querySelectorAll: () => mapNodes,
      },
    });
    const raw = runMain(sandbox);

    const codes = raw.errors.map((error) => error.code);
    expect(codes).toContain('object-key-limit');
    expect(codes).toContain('string-limit');
    expect(codes).toContain('array-item-limit');
    expect(codes).toContain('import-map-count-limit');
    expect(codes).toContain('import-map-text-limit');
    expect(raw.importMaps!.length).toBeLessThanOrEqual(32);
    for (const map of raw.importMaps!) {
      expect(map.text.length).toBeLessThanOrEqual(1048576);
    }
    const remotes = raw.globals!.nativeFederation.repositories!['remotes'].value as Record<
      string,
      unknown
    >;
    expect(Object.keys(remotes).length).toBeLessThanOrEqual(4096);
  });

  it('caps oversized shim maps', () => {
    const hugeImports: Record<string, string> = {};
    for (let index = 0; index < 5000; index += 1) {
      hugeImports[`specifier-${index}`] = 'https://edge.example/m.js';
    }
    const importShim = () => {};
    Object.assign(importShim, {
      getImportMap: () => ({ imports: hugeImports, scopes: {}, integrity: {} }),
    });
    const sandbox = makeBarePage({ importShim });
    const shim = runShim(sandbox);
    expect(shim.errors.some((error) => error.code === 'object-key-limit')).toBe(true);
    expect(Object.keys(shim.map!.imports!).length).toBeLessThanOrEqual(4096);
  });
});

describe('edge cases: malformed values', () => {
  it('handles a primitive federation global without copying anything', () => {
    const sandbox = makeBarePage({ __NATIVE_FEDERATION__: 'not-an-object' });
    const raw = runMain(sandbox);
    expect(raw.globals!.nativeFederation['valueType']).toBe('string');
    expect(JSON.stringify(raw)).not.toContain('not-an-object');
  });

  it('handles a shim map with dangerous keys and non-object fields', () => {
    const withDangerousKey: Record<string, string> = { safe: 'https://edge.example/a.js' };
    Object.defineProperty(withDangerousKey, '__proto__', {
      enumerable: true,
      configurable: true,
      value: 'https://edge.example/evil.js',
    });
    const importShim = () => {};
    Object.assign(importShim, {
      getImportMap: () => ({ imports: withDangerousKey, scopes: 42, integrity: null }),
    });
    const sandbox = makeBarePage({ importShim });
    const shim = runShim(sandbox);
    expect(Object.keys(shim.map!.imports!)).toEqual(['safe']);
  });

  it('reports a primitive shim map result as an error', () => {
    const importShim = () => {};
    Object.assign(importShim, { getImportMap: () => 'nonsense' });
    const sandbox = makeBarePage({ importShim });
    const shim = runShim(sandbox);
    expect(shim.map).toBeNull();
    expect(shim.errors.some((error) => error.code === 'map-not-an-object')).toBe(true);
  });

  it('keeps malformed document import-map text as data for the mapper', () => {
    const node = {
      getAttribute: (name: string) => (name === 'type' ? 'importmap' : null),
      textContent: '{not json at all',
    };
    const sandbox = makeBarePage({
      document: { readyState: 'complete', querySelectorAll: () => [node] },
    });
    const raw = runMain(sandbox);
    expect(raw.importMaps![0].text).toBe('{not json at all');
    expect(raw.errors).toEqual([]);
  });
});
