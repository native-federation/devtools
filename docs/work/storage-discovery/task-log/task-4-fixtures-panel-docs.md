# Task 4: Fixtures, corpus and panel wording

### Status
DONE (lab corpus capture deferred, see below)

### Summary
- Panel (`capture-status.ts`, strip): a `source` badge names where the runtime state came from
  when it is not the default `window.__NATIVE_FEDERATION__`. The label is the storage type or the
  namespace. The tooltip carries the namespace, orchestrator version and any uncaptured other
  namespaces. Web storage found without a descriptor gets a dashed border and a "may be left over
  from an earlier visit" note. A custom adapter renders as a warning ("!") with the "custom
  storage adapters are not supported" reason instead of a quiet n/a, and never collapses into
  "no Native Federation detected".
- `StoreProvenance.runtimeSource` carries the DTO field into the store (null for older snapshots).
- Synthetic fixtures: `synthetic-local-storage` (descriptor, plus an extra namespace),
  `synthetic-legacy-session-storage`, `synthetic-custom-namespace`, `synthetic-custom-storage`.
  They appear in the `?fixture=` picker automatically.
- Docs: PRIVACY.md now lists the four web-storage entries and the storage probe's limits (read by
  name, no enumeration, no `getItem`, no writes) and states that custom adapters are unsupported.
  README requirements explain storage support. DEVELOPMENT.md gains a probe table.

### Deviations from plan
- Four fixtures instead of six, all prefixed `synthetic-`. The drift guard skips only
  `synthetic-` / `exported-`, and the plan's `descriptor-*` names would have been treated as
  corpus-derived. Multi-namespace is folded into `synthetic-local-storage`. There is no separate
  descriptor-session fixture, because the session case differs from local only in the label.
- `NotDetected` is unused by the views (channel reasons surface only through the strip), so the
  custom-adapter wording lives in the strip tooltip.
- Lab corpus not extended: `scripts/lab-capture-dump.js` and a real orchestrator 4.7
  `localStorageEntry` capture need the playground lab app on 4.7. Follow-up: extend the dump
  with the descriptor and the four storage items, teach `buildCapturePage` to rebuild storage,
  capture `captures/local-storage/…`, and re-derive.

### Tests
- `capture-status.spec.ts`: +4 (web-storage badge, stale legacy badge, custom namespace, custom
  adapter warning); `source: null` added to existing whole-vm expectations.
- Collector 113/113, bridge 94/94, guards 57/57 (new fixtures privacy-scanned), UI 511/512. The
  failure is the graph cap-message timeout, which also fails on `main`.
- `npm run build:extension` + `check:panel-bundle` pass.
