### Task

Collect the orchestrator 4.8 evidence: per-external `poolWinner` and
`servingBuild`, and the new `cache-state` key (`version`,
`undecidedScopes`), from probe through DTO into the normalized store.

### Status

DONE

UI 648, bridge 120, collector 146, guards 85 green.

### Files Modified

- `collector/src/lib/passive-probe.ts`, `runtime-schema.ts` — external
  fields `poolWinner`, `servingBuild`; `cache-state` record schema;
  stamp `passive-probe/5`.
- `collector/src/lib/storage-probe.ts` — reads `<namespace>.cache-state`
  as a fifth item; stamp `storage-probe/2`.
- `collector/src/lib/snapshot-mapper.ts` — `toCacheState` (scope names
  sanitized like scope keys); copies `poolWinner` / `servingBuild` only
  when strings.
- `collector/src/lib/constants.ts` — `nf-devtools-collector/5`.
- `devtools-bridge/src/lib/snapshot-v1.ts` — `ExternalV1.poolWinner`,
  `servingBuild`; `RuntimeRepositoriesV1.cacheState?: CacheStateV1`.
- `shared/store/resolution/model.ts`, `normalize-registry-evidence.ts` —
  `SharedExternalRecord.poolWinner` / `servingBuild` (null when absent).
- `shared/store/federation-model.ts`, `ingest.ts` —
  `StoreProvenance.cacheState`.
- All 26 fixtures re-derived (only `collectorVersion` changes: no
  capture holds `cache-state` yet).
- `captures/README.md` — stamp table and data-flow diagram.
- Specs: storage-probe (five items), storage-mapping (4.8 web storage,
  global, unreadable cache-state), snapshot-mapper (4.8 fields through
  probe and mapper), ingest (provenance + records), two record literals.

### Key Decisions

- **`cache-state` lives on `runtime`, not `runtimeSource`** (the plan
  said `runtimeSource`): it is stored state read from the same holder as
  the repositories, not descriptor metadata.
- **`cache-state` is not a repository:** it neither makes a holder
  recognizable nor turns the channel `not-recognized` when unreadable —
  an unreadable or version-less value is simply omitted.
- **Stamps bumped** (probe /5, storage /2, collector /5) because the
  result schema grew; older snapshots stay valid (all new fields optional).
- The lab capture script clones the whole namespace, so 4.8 captures
  (Task 2) carry `cache-state` without script changes.

### Acceptance Coverage

- **T1-AC-01 — passed:** `storage-mapping.spec.ts` and
  `snapshot-mapper.spec.ts` round-trip the 4.8 fields; `ingest.spec.ts`
  carries them into the store; 4.7 fixtures map them to null (only the
  collector stamp changed on re-derivation).
- **T1-AC-02 — passed:** fixture-drift, privacy-scan and export-privacy
  guards green.

### Context for Next Task

- Task 2 records the 4.8 corpus; `poolWinner`, `servingBuild` and
  `cacheState` then become witnessed rather than hand-built.
- Store access: `model.registryEvidence.sharedExternals[*].poolWinner /
  servingBuild`, `model.provenance.cacheState`.

### Open Issues

- None.

### Git State

- Branch `pools-v48`, committed as `task-1`.
