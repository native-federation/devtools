import { afterEach, describe, expect, it, vi } from 'vitest';
import { PASSIVE_PROBE_SOURCE, SHIM_MAP_PROBE_SOURCE, STORAGE_PROBE_SOURCE } from 'collector';
import { ChromeSnapshotProvider } from './chrome-snapshot-provider';

// Raw probe results as they come back over the DevTools eval boundary —
// minimal but schema-valid shapes (see the collector's passive probe).
const rawProbe = (importShim: Record<string, unknown>) => ({
  schemaVersion: 'passive-probe/4',
  page: { origin: 'https://lab.example', path: '/app', readyState: 'complete' },
  globals: {
    nativeFederation: { present: false },
    importShim,
  },
  importMaps: [],
  errors: [],
});

// A passive-probe/4 result carrying the runtime source the storage gate reads.
const rawSourcedProbe = (
  source: Record<string, unknown>,
  nativeFederation: Record<string, unknown> = { present: false },
) => {
  const probe = rawProbe({ present: false });
  return { ...probe, globals: { ...probe.globals, nativeFederation: { ...nativeFederation, source } } };
};

const RAW_STORAGE = {
  schemaVersion: 'storage-probe/1',
  source: { type: 'localStorage', namespace: '__NATIVE_FEDERATION__', discovery: 'descriptor' },
  storages: {
    localStorage: {
      available: true,
      items: {
        remotes: {
          present: true,
          descriptor: 'data',
          text: JSON.stringify({
            host: { scopeUrl: 'https://lab.example/', exposes: [], integrity: {} },
          }),
        },
        'scoped-externals': { present: false },
        'shared-externals': { present: false },
        'shared-chunks': { present: false },
      },
    },
  },
  errors: [],
};

const RAW_SHIM_MAP = {
  schemaVersion: 'shim-map-probe/1',
  map: { imports: { react: 'https://lab.example/react.js' }, scopes: {}, integrity: {} },
  errors: [],
};

type EvalCallback = (result?: unknown, exceptionInfo?: Record<string, unknown>) => void;

function installChrome(evalImpl: (expression: string, callback: EvalCallback) => void) {
  const evalMock = vi.fn(evalImpl);
  (globalThis as { chrome?: unknown }).chrome = {
    devtools: { inspectedWindow: { eval: evalMock } },
  };
  return evalMock;
}

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
  vi.useRealTimers();
});

describe('ChromeSnapshotProvider', () => {
  it('captures a live snapshot and runs the shim probe when importShim is a data descriptor', async () => {
    const evalMock = installChrome((expression, callback) => {
      callback(
        expression === PASSIVE_PROBE_SOURCE
          ? rawProbe({ present: true, descriptor: 'data', valueType: 'function' })
          : RAW_SHIM_MAP,
      );
    });

    const snapshot = await new ChromeSnapshotProvider().captureSnapshot();

    expect(evalMock).toHaveBeenCalledTimes(2);
    expect(evalMock.mock.calls[0][0]).toBe(PASSIVE_PROBE_SOURCE);
    expect(evalMock.mock.calls[1][0]).toBe(SHIM_MAP_PROBE_SOURCE);
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.capture.pageUrl).toBe('https://lab.example/app');
    expect(snapshot.capture.mode).toBe('passive');
    expect(new Date(snapshot.capture.capturedAt).toISOString()).toBe(snapshot.capture.capturedAt);
    expect(snapshot.channels.importShim.state).toBe('available');
    expect(snapshot.importMaps?.effective?.imports).toEqual([
      { specifier: 'react', target: 'https://lab.example/react.js' },
    ]);
    expect(snapshot.errors).toEqual([]);
  });

  it('skips the shim probe when importShim is not a data descriptor', async () => {
    const evalMock = installChrome((_expression, callback) => {
      callback(rawProbe({ present: false }));
    });

    const snapshot = await new ChromeSnapshotProvider().captureSnapshot();

    expect(evalMock).toHaveBeenCalledTimes(1);
    expect(snapshot.channels.importShim.state).toBe('unavailable');
    expect(snapshot.channels.domImportMaps.state).toBe('available');
    expect(snapshot.importMaps?.effective).toBeNull();
    expect(snapshot.errors).toEqual([]);
  });

  it('translates an eval exception into availability states, never a crash', async () => {
    installChrome((_expression, callback) => {
      callback(undefined, { isException: true, value: 'page-controlled text' });
    });

    const snapshot = await new ChromeSnapshotProvider().captureSnapshot();

    expect(snapshot.channels.nativeFederationGlobals.state).toBe('unavailable');
    expect(snapshot.channels.domImportMaps.state).toBe('unavailable');
    expect(snapshot.channels.importShim.state).toBe('unavailable');
    expect(snapshot.runtime).toBeNull();
    expect(snapshot.importMaps).toBeNull();
    expect(snapshot.errors).toContainEqual({
      stage: 'bridge',
      code: 'eval-exception',
      detail: 'passive-probe',
    });
    // The page-controlled exception text must not appear anywhere in the DTO.
    expect(JSON.stringify(snapshot)).not.toContain('page-controlled text');
  });

  it('translates a missing DevTools global into availability states', async () => {
    const snapshot = await new ChromeSnapshotProvider().captureSnapshot();

    expect(snapshot.channels.nativeFederationGlobals.state).toBe('unavailable');
    expect(snapshot.runtime).toBeNull();
    expect(snapshot.importMaps).toBeNull();
    expect(snapshot.errors).toContainEqual({
      stage: 'bridge',
      code: 'inspected-window-unavailable',
    });
  });

  it('abandons a hanging eval after the timeout', async () => {
    vi.useFakeTimers();
    installChrome(() => {
      // Callback never fires — models a hostile page hanging the probe.
    });

    const pending = new ChromeSnapshotProvider().captureSnapshot();
    await vi.advanceTimersByTimeAsync(2000);
    const snapshot = await pending;

    expect(snapshot.channels.nativeFederationGlobals.state).toBe('unavailable');
    expect(snapshot.errors).toContainEqual({
      stage: 'bridge',
      code: 'eval-timeout',
      detail: 'passive-probe',
    });
  });

  it('keeps the main probe result when only the shim eval fails', async () => {
    installChrome((expression, callback) => {
      if (expression === PASSIVE_PROBE_SOURCE) {
        callback(rawProbe({ present: true, descriptor: 'data', valueType: 'function' }));
      } else {
        callback(undefined, { isError: true });
      }
    });

    const snapshot = await new ChromeSnapshotProvider().captureSnapshot();

    expect(snapshot.capture.pageUrl).toBe('https://lab.example/app');
    expect(snapshot.channels.domImportMaps.state).toBe('available');
    expect(snapshot.channels.importShim.state).toBe('not-recognized');
    expect(snapshot.errors).toContainEqual({
      stage: 'bridge',
      code: 'eval-exception',
      detail: 'shim-map-probe',
    });
  });

  it('runs the storage probe when the descriptor names a web storage', async () => {
    const evalMock = installChrome((expression, callback) => {
      callback(
        expression === PASSIVE_PROBE_SOURCE
          ? rawSourcedProbe(RAW_STORAGE.source)
          : expression === STORAGE_PROBE_SOURCE
            ? RAW_STORAGE
            : undefined,
      );
    });

    const snapshot = await new ChromeSnapshotProvider().captureSnapshot();

    expect(evalMock.mock.calls.map((call) => call[0])).toEqual([
      PASSIVE_PROBE_SOURCE,
      STORAGE_PROBE_SOURCE,
    ]);
    expect(snapshot.channels.nativeFederationGlobals.state).toBe('available');
    expect(snapshot.runtime?.remotes['host'].scopeUrl).toBe('https://lab.example/');
    expect(snapshot.runtimeSource?.storage).toBe('localStorage');
  });

  it('skips the storage probe when the default global is present', async () => {
    const evalMock = installChrome((_expression, callback) => {
      callback(
        rawSourcedProbe(
          { type: 'globalThis', namespace: '__NATIVE_FEDERATION__', discovery: 'default' },
          { present: true, descriptor: 'data', valueType: 'object', repositories: {} },
        ),
      );
    });

    await new ChromeSnapshotProvider().captureSnapshot();

    expect(evalMock).toHaveBeenCalledTimes(1);
  });

  it('runs the storage probe for a descriptor-less page without the default global', async () => {
    const evalMock = installChrome((expression, callback) => {
      callback(
        expression === PASSIVE_PROBE_SOURCE
          ? rawSourcedProbe({
              type: 'globalThis',
              namespace: '__NATIVE_FEDERATION__',
              discovery: 'default',
            })
          : undefined,
        expression === PASSIVE_PROBE_SOURCE ? undefined : { isException: true },
      );
    });

    const snapshot = await new ChromeSnapshotProvider().captureSnapshot();

    expect(evalMock.mock.calls[1][0]).toBe(STORAGE_PROBE_SOURCE);
    expect(snapshot.channels.nativeFederationGlobals.state).toBe('unavailable');
    expect(snapshot.errors).toContainEqual({
      stage: 'bridge',
      code: 'eval-exception',
      detail: 'storage-probe',
    });
  });
});
