// SYNTHETIC fixture — hand-written, not derived from a real capture.
// UI state: globalThis storage under a custom storageNamespace, found
// through the storage descriptor.

import { SnapshotV1 } from '../snapshot-v1';

export const syntheticCustomNamespaceFixture = {
  schemaVersion: 1,
  capture: {
    pageUrl: 'https://synthetic-fixture.example/custom-namespace/',
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
    storage: 'globalThis',
    namespace: '__MY_NF__',
    discovery: 'descriptor',
    orchestratorVersion: '4.7.0',
    otherNamespaces: [],
  },
  runtime: {
    remotes: {
      '__NF-HOST__': {
        scopeUrl: 'https://synthetic-fixture.example/custom-namespace/',
        exposes: [],
        integrity: {},
      },
      mfe1: {
        scopeUrl: 'https://synthetic-fixture.example/custom-namespace/mfe1/',
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
