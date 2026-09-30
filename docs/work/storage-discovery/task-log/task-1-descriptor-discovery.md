# Task 1: Discover the orchestrator descriptor in the passive probe

### Status
DONE

### Summary
- `PASSIVE_PROBE_SOURCE` (now `passive-probe/4`) reads `globalThis.__NF_ORCHESTRATOR__.storage`
  at descriptor level: per namespace (sorted, capped at 8) only `type` and `version`. `get` and
  `keys` are never read. It emits `globals.orchestrator` and a `nativeFederation.source`
  (`{ type, namespace, discovery }`).
- Namespace choice: `__NATIVE_FEDERATION__` when the descriptor lists it, otherwise the first
  sorted entry. Without a readable descriptor the default is `__NATIVE_FEDERATION__` on
  globalThis, the same as before.
- For a globalThis source the repositories are read from `globalThis[namespace]`. Error paths
  keep the literal `__NATIVE_FEDERATION__.` prefix for the default namespace and `namespace.` for
  page-chosen ones, so page strings stay out of paths.
- Mapper: `mapRuntime` split into the source dispatch, `mapGlobalRuntime` and a reusable
  `mapRepositories` (Task 3 feeds web storage through it). `custom` → `unavailable` +
  `custom-storage-unsupported`; unknown type → `not-recognized`.
- `SnapshotV1.runtimeSource?: RuntimeSourceV1` (additive, optional). It is set when state was found,
  and always on the descriptor path. `COLLECTOR_VERSION` is now `nf-devtools-collector/4` and the
  corpus fixtures were re-derived (the only diff is `collectorVersion` + `runtimeSource`).

### Deviation from plan
- The plan said legacy pages produce "exactly today's snapshot". They now also carry
  `runtimeSource: { storage: 'globalThis', discovery: 'default', … }`. The field is additive.
- The descriptor's `keys` list is not projected: nothing consumes it yet.

### Tests
- New `storage-discovery.spec.ts` (13 cases): custom namespace, untouched `get`, custom
  adapter, namespace preference, missing global, unknown type, legacy fallback, hostile
  descriptors (accessor, non-object storage, throwing proxy, namespace cap, unsafe keys).
- Collector 88/88, bridge 79/79, UI 503/504. The failure is
  `graph.spec.ts › shows the cap message when bundle references were capped`, which times out
  on `main` too (pre-existing).
