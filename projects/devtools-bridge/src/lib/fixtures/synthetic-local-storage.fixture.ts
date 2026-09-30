// SYNTHETIC fixture — hand-written, not derived from a real capture.
// UI state: an orchestrator >= 4.7 configured with localStorageEntry. The
// storage descriptor names localStorage; a second namespace on the page is
// listed but not captured. The strip shows the source badge.

import { SnapshotV1 } from '../snapshot-v1';

export const syntheticLocalStorageFixture = {
  schemaVersion: 1,
  capture: {
    pageUrl: 'https://synthetic-fixture.example/local-storage/',
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
    storage: 'localStorage',
    namespace: '__NATIVE_FEDERATION__',
    discovery: 'descriptor',
    orchestratorVersion: '4.7.0',
    otherNamespaces: ['__ADMIN_NF__'],
  },
  runtime: {
    remotes: {
      '__NF-HOST__': {
        scopeUrl: 'https://synthetic-fixture.example/local-storage/',
        exposes: [],
        integrity: {},
      },
      mfe1: {
        scopeUrl: 'https://synthetic-fixture.example/local-storage/mfe1/',
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
