// SYNTHETIC fixture — hand-written, not derived from a real capture.
// UI state: the host uses a custom storage adapter. The passive collector
// never calls the descriptor's get, so the runtime layer is unsupported and
// the strip warns instead of rendering a quiet n/a.

import { SnapshotV1 } from '../snapshot-v1';

export const syntheticCustomStorageFixture = {
  schemaVersion: 1,
  capture: {
    pageUrl: 'https://synthetic-fixture.example/custom-storage/',
    capturedAt: '2026-09-29T00:00:00.000Z',
    mode: 'passive',
    collectorVersion: 'synthetic-fixture/1',
  },
  channels: {
    nativeFederationGlobals: {
      state: 'unavailable',
      reason: "custom storage adapters are not supported (namespace '__NATIVE_FEDERATION__')",
    },
    domImportMaps: { state: 'available' },
    importShim: { state: 'unavailable', reason: 'window.importShim is not present' },
  },
  runtimeSource: {
    storage: 'custom',
    namespace: '__NATIVE_FEDERATION__',
    discovery: 'descriptor',
    orchestratorVersion: '4.7.0',
    otherNamespaces: [],
  },
  runtime: null,
  importMaps: {
    documentMaps: [],
    effective: null,
  },
  errors: [{ stage: 'mapper', code: 'custom-storage-unsupported' }],
} satisfies SnapshotV1;
