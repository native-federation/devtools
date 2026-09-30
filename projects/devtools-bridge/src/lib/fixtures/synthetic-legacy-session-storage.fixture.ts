// SYNTHETIC fixture — hand-written, not derived from a real capture.
// UI state: an orchestrator < 4.7 (no storage descriptor) configured with
// sessionStorageEntry. The state was found under the default namespace, so
// the source badge is marked as possibly stale.

import { SnapshotV1 } from '../snapshot-v1';

export const syntheticLegacySessionStorageFixture = {
  schemaVersion: 1,
  capture: {
    pageUrl: 'https://synthetic-fixture.example/legacy-session-storage/',
    capturedAt: '2026-09-29T00:00:00.000Z',
    mode: 'passive',
    collectorVersion: 'synthetic-fixture/1',
  },
  channels: {
    nativeFederationGlobals: { state: 'available' },
    domImportMaps: { state: 'available' },
    importShim: { state: 'unavailable', reason: 'window.importShim is not present' },
  },
  runtimeSource: {
    storage: 'sessionStorage',
    namespace: '__NATIVE_FEDERATION__',
    discovery: 'default',
    orchestratorVersion: null,
    otherNamespaces: [],
  },
  runtime: {
    remotes: {
      '__NF-HOST__': {
        scopeUrl: 'https://synthetic-fixture.example/legacy-session-storage/',
        exposes: [],
        integrity: {},
      },
      mfe1: {
        scopeUrl: 'https://synthetic-fixture.example/legacy-session-storage/mfe1/',
        exposes: [{ moduleName: './Component', file: 'Component-AAAA1111.js' }],
        integrity: {},
      },
    },
    scopedExternals: {},
    sharedExternals: {},
    sharedChunks: {},
    generation: 'unknown',
  },
  importMaps: {
    documentMaps: [],
    effective: null,
  },
  errors: [],
} satisfies SnapshotV1;
