/**
 * Test-only fixture pages for the probe safety tests.
 *
 * Pages are modelled as `node:vm` sandboxes. `buildCapturePage`
 * reconstructs a page from a lossless corpus capture (envelope
 * `lab-lossless-capture/1`, see captures/README.md) — the same
 * reconstruction the fixture deriver runs. The frankenstein page is that
 * reconstruction over the frankenstein-live capture plus passivity
 * tripwires: getters, functions, and storage traps with call counters —
 * every counter that stays at zero is a passivity proof.
 */
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { loadLabCapture } from './lab-corpus';

const LIVE_CAPTURE_FILE = '20260811T115536Z-01-initial.json';

const IMPORT_MAP_SELECTOR = 'script[type="importmap"],script[type="importmap-shim"]';

export interface PageCounters {
  getterCalls: number;
  loaderCalls: number;
  storageOps: number;
  getImportMapCalls: number;
}

export interface FixturePage {
  sandbox: Record<string, unknown>;
  counters: PageCounters;
  /** The state regions whose digest must be byte-identical before/after. */
  digestTargets: Record<string, unknown>;
}

export function evaluateProbe(source: string, sandbox: object): unknown {
  return vm.runInNewContext(source, sandbox);
}

/**
 * Reconstructs a page sandbox from a lossless corpus capture: location
 * from the page block, DOM import-map script nodes from the captured raw
 * tag text, `__NATIVE_FEDERATION__` as a clone of the captured namespace,
 * and `importShim` returning the captured effective map. Channels the
 * capture recorded as absent stay absent on the page.
 */
export function buildCapturePage(capture: Record<string, any>): Record<string, unknown> {
  const channels = capture['channels'];

  const domImportMaps = channels.domImportMaps;
  const scriptNodes: Record<string, unknown>[] =
    domImportMaps?.availability === 'available'
      ? (domImportMaps.data.maps ?? []).map((map: any) => makeScriptNode(map.type, map.text))
      : [];

  const sandbox: Record<string, unknown> = {
    location: { origin: capture['page'].origin, pathname: capture['page'].path },
    document: {
      readyState: capture['page'].readyState,
      querySelectorAll: (selector: string) => (selector === IMPORT_MAP_SELECTOR ? scriptNodes : []),
    },
  };

  const globals = channels.nativeFederationGlobals;
  if (globals?.availability === 'available' && globals.data?.present === true) {
    sandbox['__NATIVE_FEDERATION__'] = structuredClone(globals.data.namespace);
  }

  // Captures from before the lab recorded this channel lack it, like pages before orchestrator v4.7.
  const orchestrator = channels.orchestratorGlobal;
  if (orchestrator?.availability === 'available' && orchestrator.data?.present === true) {
    const storage: Record<string, unknown> = {};
    for (const [namespace, { hasGet, ...entry }] of Object.entries<any>(
      orchestrator.data.storage,
    )) {
      storage[namespace] = Object.freeze({ ...entry, ...(hasGet && { get: () => undefined }) });
    }
    sandbox['__NF_ORCHESTRATOR__'] = Object.freeze({ storage: Object.freeze(storage) });
  }

  const shim = channels.importShim;
  if (shim?.availability === 'available' && shim.data?.present === true) {
    const importShim = () => {};
    Object.assign(importShim, {
      version: shim.data.version,
      getImportMap: () => structuredClone(shim.data.map),
    });
    sandbox['importShim'] = importShim;
  }

  return sandbox;
}

function makeScriptNode(type: string, text: string): Record<string, unknown> {
  return {
    getAttribute: (name: string) => (name === 'type' ? type : null),
    textContent: text,
  };
}

function makeStorage(counters: PageCounters, sentinel: string): Record<string, unknown> {
  return {
    sentinel,
    setItem: () => {
      counters.storageOps += 1;
    },
    removeItem: () => {
      counters.storageOps += 1;
    },
    clear: () => {
      counters.storageOps += 1;
    },
  };
}

/**
 * A page reconstructed from the frankenstein-live capture (phase
 * 01-initial), with passivity tripwires added outside the recognized
 * schema surface: a getter and a loader function that the probe must
 * never touch.
 */
export function buildFrankensteinPage(): FixturePage {
  const capture = loadLabCapture('frankenstein-live', LIVE_CAPTURE_FILE);
  const counters: PageCounters = {
    getterCalls: 0,
    loaderCalls: 0,
    storageOps: 0,
    getImportMapCalls: 0,
  };

  const sandbox = buildCapturePage(capture);

  const federation = sandbox['__NATIVE_FEDERATION__'] as Record<string, unknown>;
  federation['loadRemoteModule'] = () => {
    counters.loaderCalls += 1;
  };
  // Non-schema field on a remote object: the schema-directed projection
  // must never read it, so the getter must never fire.
  Object.defineProperty(
    (federation['remotes'] as Record<string, object>)['mermaid'],
    'businessPayload',
    {
      enumerable: true,
      configurable: true,
      get() {
        counters.getterCalls += 1;
        return 'private meeting notes';
      },
    },
  );

  const inner = sandbox['importShim'] as { version: string; getImportMap: () => unknown };
  const importShim = () => {};
  Object.assign(importShim, {
    version: inner.version,
    getImportMap: () => {
      counters.getImportMapCalls += 1;
      return inner.getImportMap();
    },
  });
  sandbox['importShim'] = importShim;

  const localStorage = makeStorage(counters, 'local-unchanged');
  const sessionStorage = makeStorage(counters, 'session-unchanged');
  sandbox['localStorage'] = localStorage;
  sandbox['sessionStorage'] = sessionStorage;

  const scriptNodes = (
    sandbox['document'] as { querySelectorAll: (s: string) => unknown[] }
  ).querySelectorAll(IMPORT_MAP_SELECTOR);

  return {
    sandbox,
    counters,
    digestTargets: { federation, scriptNodes, localStorage, sessionStorage },
  };
}

/**
 * A hostile page: getters on schema fields, a proxied repository whose
 * traps count observations, storage behind an access-counting proxy, a
 * throwing `getImportMap`, and a sentinel global. State must be
 * byte-identical before and after probing; getters and page functions
 * must never fire. The proxy traps are expected to observe descriptor
 * reads (proxies are undetectable — see safe.ts); the assertion for them
 * is unchanged state, not zero trap calls.
 */
export function buildHostilePage(): FixturePage & {
  trapCalls: { count: number };
  storageBacking: Record<string, string>;
} {
  const counters: PageCounters = {
    getterCalls: 0,
    loaderCalls: 0,
    storageOps: 0,
    getImportMapCalls: 0,
  };

  const hostileRemote: Record<string, unknown> = {
    exposes: [{ file: 'Bootstrap.js', moduleName: 'https://hostile.example/entry.js' }],
    integrity: {},
  };
  Object.defineProperty(hostileRemote, 'scopeUrl', {
    enumerable: true,
    configurable: true,
    get() {
      counters.getterCalls += 1;
      return 'https://should-never-be-read.example/';
    },
  });

  const trapCalls = { count: 0 };
  const proxiedChunks = new Proxy(
    {},
    {
      ownKeys(target) {
        trapCalls.count += 1;
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, key) {
        trapCalls.count += 1;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    },
  );

  const federation: Record<string, unknown> = {
    remotes: { hostile: hostileRemote },
    'scoped-externals': {},
    'shared-externals': {},
    'shared-chunks': proxiedChunks,
    loadRemoteModule: () => {
      counters.loaderCalls += 1;
    },
  };

  const storageBacking: Record<string, string> = { sentinel: 'storage-unchanged' };
  const storageProxy = new Proxy(storageBacking, {
    get(target, key, receiver) {
      counters.storageOps += 1;
      return Reflect.get(target, key, receiver);
    },
    set(target, key, value, receiver) {
      counters.storageOps += 1;
      return Reflect.set(target, key, value, receiver);
    },
    has(target, key) {
      counters.storageOps += 1;
      return Reflect.has(target, key);
    },
    deleteProperty(target, key) {
      counters.storageOps += 1;
      return Reflect.deleteProperty(target, key);
    },
  });

  const scriptNode = makeScriptNode('importmap-shim', '{"imports":{"a":"/a.js?token=hidden"}}');
  const brokenNode = {
    getAttribute: () => {
      throw new Error('hostile getAttribute');
    },
    textContent: 'irrelevant',
  };

  const importShim = () => {};
  Object.assign(importShim, {
    version: 'hostile',
    getImportMap: () => {
      counters.getImportMapCalls += 1;
      throw new Error('hostile getImportMap');
    },
  });

  const sentinel = { marker: 'sentinel-unchanged' };

  const sandbox: Record<string, unknown> = {
    location: { origin: 'https://hostile.example', pathname: '/app' },
    document: {
      readyState: 'complete',
      querySelectorAll: () => [scriptNode, brokenNode],
    },
    localStorage: storageProxy,
    sessionStorage: storageProxy,
    __NATIVE_FEDERATION__: federation,
    __SENTINEL__: sentinel,
    importShim,
  };

  return {
    sandbox,
    counters,
    trapCalls,
    storageBacking,
    digestTargets: {
      federation,
      scriptText: scriptNode,
      storageBacking,
      sentinel,
    },
  };
}

/** Minimal page for edge-case sandboxes. */
export function makeBarePage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    location: { origin: 'https://edge.example', pathname: '/' },
    document: { readyState: 'complete', querySelectorAll: () => [] },
    ...overrides,
  };
}

/**
 * Descriptor-level snapshot for digests: copies own property names
 * without ever invoking a getter (accessors are recorded as markers), so
 * digesting cannot itself violate passivity.
 */
function dataSnapshot(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return value;
  }
  if (typeof value === 'function') {
    return `[function ${value.name}]`;
  }
  if (seen.has(value)) {
    return '[cycle]';
  }
  seen.add(value);
  const output: Record<string, unknown> = {};
  for (const name of Object.getOwnPropertyNames(value).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor) {
      continue;
    }
    output[name] = 'value' in descriptor ? dataSnapshot(descriptor.value, seen) : '[accessor]';
  }
  return output;
}

/** sha256 hex digest over the descriptor-level snapshot of the targets. */
export function digestState(targets: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(dataSnapshot(targets)))
    .digest('hex');
}
