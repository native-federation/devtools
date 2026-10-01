### Task

Derive the Pools tab's status matrix in the pipeline: remotes grouped into
build bands, a state per copy, and one verdict per pool.

### Status

DONE

`PoolFamily.statusMatrix` published on the projection; the view still
reads the old `matrix`/outcomes until Task 11. UI 600 green (5 new).

### Files Modified

- `resolution/pool-family-model.ts` — `PoolCellState`, `PoolStatusCell`,
  `PoolStatusRow`, `PoolBuildBand`, `PoolVerdict`, `PoolStatusMatrix`;
  `PoolFamily.statusMatrix`.
- `resolution/derive-pool-families.ts` — `statusMatrixOf` and `verdictOf`,
  built from the existing per-consumer facts (serving builds, outcome,
  coherence) and each member's basis.
- `resolution/derive-pool-families.spec.ts` — Task 10 acceptance on the
  4.7.0 `pool-showcase`/`pool-portfolio` fixtures and 4.6.0
  `pooling-anchor`.
- `plan.md` — T10-AC-01 names `dashboard` (renamed in Task 9).

### Key Decisions

- **Bands from serving builds:** a consumer's band is its single serving
  build; `own-copy` is its own `isolated` band; several builds is the
  ownerless `mixed` band (torn, which pooling prevents). Owner row first,
  others in pool order. Shared bands sort by size, host first on ties,
  then isolated, then mixed.
- **Cell precedence** conflict > isolated > not-shared > serves-others >
  unchanged. `conflict` is the fact "strict and `semver` rejects the
  shared tag", independent of `poolCause`, so pre-4.7 records get it too.
- **`servedTag` vs `declaredTag`:** a cell shows what the remote gets
  (products declares acme-core 18.1.3, gets the host's 18.2.0).
- **Verdict carries summaries, not strings:** `kind` is the worst outcome;
  `isolated`/`redirected` stay set when they also occurred, so Task 11
  folds them into one line. Isolated `cause`: the stored `poolCause` when
  the copies agree, else `incompatible` from conflict evidence, else null.
  Redirect `mixes`: the builds the shared versions come from (host first).

### Acceptance Coverage

- **T10-AC-01 — passed:** `pool-showcase` bands and verdicts for ui,
  charts, form-kit.
- **T10-AC-02 — passed:** `pool-portfolio` — legacy conflicts on core and
  router only, non-strict members `isolated` with `acceptsShared: false`;
  verdict `isolated` with the orders redirect folded in.
- **T10-AC-03 — passed:** `pooling-anchor` (no `poolCause`) derives bands
  and a `redirected` verdict.
- **T10-AC-04 — passed:** an unreadable range gives no conflict; the cell
  stays `isolated`, `acceptsShared: null`.

### Context for Next Task

- Task 11 renders `statusMatrix` and can then drop `PoolFamily.matrix`,
  `PoolMatrixCell`, and the consumer fields only the outcome sentences
  read (`poolCauses`, `conflicts`, `sharedCombinationMixes` — check the
  Graph and chips first).

### Git State

- Branch `share-pools`, committed as `task-10`.
