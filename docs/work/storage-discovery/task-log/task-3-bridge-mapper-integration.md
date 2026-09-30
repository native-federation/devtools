# Task 3: Bridge gating and mapper integration

### Status
DONE

### Summary
- `storageProbeIndicated(rawProbe)` (collector public API) is the single gate, shared by
  `ChromeSnapshotProvider` and the capture pipeline. It holds when the probe's source names
  `localStorage` / `sessionStorage` through the descriptor, or when a descriptor-less page has no
  default global. A raw probe without a `source` (for example a hand-written test shape) never
  triggers it.
- `mapProbeResult(rawProbe, rawShimMap, context, rawStorage?)`: the new argument is optional, so
  existing callers are unchanged.
  - The storage result is validated first (`storage-probe-result-invalid`). Its source must match
    the passive probe's namespace and discovery (`storage-source-mismatch`), because the two evals
    choose independently. Its errors are carried over.
  - Items are `JSON.parse`d host-side (`storage-json-invalid`) and fed through the same
    `mapRepositories` + schema allowlist as the global (URLs sanitized, unknown fields dropped).
  - Web storage without any of the four items → `unavailable` ("no Native Federation state in
    localStorage"), because the orchestrator writes keys lazily.
  - Legacy fallback only when the default global is absent: localStorage wins over
    sessionStorage and a `storage-ambiguous` error is added when both hold state. With neither,
    the reason becomes "window.__NATIVE_FEDERATION__ is not defined; no state in localStorage or
    sessionStorage".
- Bridge: the third eval, with the fixed error vocabulary `detail: 'storage-probe'`.

### Deviation from plan
- The guards needed no change: `privacy-scan.spec.ts` already scans every fixture, so the Task 4
  fixtures are covered automatically.

### Tests
- `storage-mapping.spec.ts` (16 cases), end to end through both probes and the gate, covering
  the descriptor, legacy and hostile matrix from the plan plus allowlist projection of parsed
  storage. Every case asserts `storageOps === 0`.
- Bridge spec: +3 (runs for a localStorage descriptor, skipped with the default global present,
  runs for the legacy empty-global case with an eval failure mapped to `storage-probe`).
- Collector 113/113, bridge 82/82, guards 53/53.
