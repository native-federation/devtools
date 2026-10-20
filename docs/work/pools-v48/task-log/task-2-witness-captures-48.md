### Task

Witness captures on orchestrator 4.8.0: re-record the nf-lab and
nf-lab-verdicts corpora and add one scenario per pool placement reason
the existing scenarios do not already show.

### Status

DONE

UI 649, bridge 128, collector 150, guards 94 green; all four lab corpora
validate.

### Files Modified

- Playground `angular-examples-lab` (branch `lab/grouping-and-pooling`,
  local commit `52a199c`, not pushed): orchestrator 4.8.0, core 4.8.1;
  scenarios `pool-uncovered-gap`, `pool-incompatible-nonstrict`,
  `pool-unshipped`, `own-tag-out-of-range`; README.
- `captures/<13 nf-lab + verdicts scenarios>/` — 4.7 runstamps replaced by
  `20261020T083840Z`; four new scenario directories.
- `captures/manifest-nf-lab*.json` — rebuilt; new
  `manifest-nf-lab-placements.json`.
- `scripts/lab-corpora.mjs` — corpus `nf-lab-placements`.
- `scripts/validate-lab-corpus.mjs` — 4.8 predicates (`expectPoolWinner`,
  `expectGlobal`, cause-aware `expectIsolated`), new-scenario predicates,
  version/`cache-state` stamp check for any 4.7+ corpus.
- Fixtures: 13 re-derived, four new, registered in `fixtures/index.ts`.
- Specs re-pinned to the 4.8 data: `derive-pool-families`,
  `pools-view-model`, `pools`, `derive-package-verdicts`,
  `packages-version-vm`, `packages-view-model`, `ingest` (now on the real
  `pool-unshipped` capture), `fixture-drift` (30 derived fixtures).
- Removed specs with no 4.8 witness: torn banner (T5-AC-03), torn group
  (T6-AC-02), torn banner docs link.
- `captures/README.md` — 4.8 corpora, placements table, regeneration.

### Key Decisions

- **Replaced, not kept, the 4.7 captures** (the plan said keep the 4.7
  manifests): scenario ids are unique across `captures/`, and the user
  chose the 4.8 direction with only no-crash support for older pages; the
  4.6 V2 corpus still covers older orchestrators.
- **No `fallback-unpooled` scenario:** the 4.8 `torn-many` and
  `merged-entrypoints` recaptures already witness an unpooled coverage
  fallback (`scope` row, no cause, `servingBuild` set).
- **No separate strict-incompatible scenario:** `pool-showcase` (charts)
  and `pool-portfolio` (legacy) witness it.
- **Characterization, not correction:** the old derivations are pinned to
  what they compute on 4.8 data, including known misreads, each commented
  in the spec — `not-shared` for subpool members the host does not ship
  (Task 4) and `merged: true` for a version whose second build is a scoped
  copy (Task 3).
- The esbuild adapter 4.2.0 declares a `~4.7.0` core peer; it builds 4.8.1
  unchanged.

### Evidence (4.8.0)

| Reason | Witness | Stored |
|---|---|---|
| subpool | `pool-showcase` ui (admin), `pool-portfolio` (contacts), `pool-tag-anchored` (mfe1) | `skip` + `servedBy: <owner>`, owner names itself |
| incompatible, strict | `pool-showcase` charts (dashboard), `pool-tag-islanded` (mfe2), `pool-portfolio` (legacy) | `scope` + `poolCause: incompatible` |
| incompatible, non-strict | `pool-incompatible-nonstrict` (mfe1) | same; strictness not stored |
| uncovered, gap | `pool-uncovered-gap` (mfe1, `ui-core/testing`) | `scope` + `poolCause: uncovered`; gap only logged |
| uncovered, unshipped | `pool-unshipped` (mfe2) | same; `ui-dom` `servingBuild: mfe1` (extension) |
| unpooled coverage fallback | `torn-many`, `merged-entrypoints` | `scope`, no cause, `servingBuild` |
| own tag out of range | `own-tag-out-of-range` | host `share` with `^2.0.0` on 1.2.0 |

### Acceptance Coverage

- **T2-AC-01 — passed:** evidence table above; each pinned by a validator
  predicate.
- **T2-AC-02 — passed:** `torn-many` predicate — mfe1/mfe2 `scope`, no kit
  secondary on the global map.

### Context for Next Task

- The global surface of a pool is the winner's tags **plus extensions**
  from other builds (`pool-unshipped`: ui-dom from mfe1); Task 4 must
  check gaps against what the global map serves for the pool, not only
  `poolWinner`'s copies.
- Task 3 deletes `self-fill` (4.6) and the torn/merged notions; the
  specs commented "pre-4.8 reading" are the ones that change.

### Open Issues

- The playground commit `52a199c` stays local by choice; the manifests'
  `source.playground.commit` resolves only on this machine.
- No runtime-load witness for `dirty` / `undecidedScopes` yet (the lab
  runner has no dynamic init).

### Git State

- Branch `pools-v48`, committed as `task-2`.
