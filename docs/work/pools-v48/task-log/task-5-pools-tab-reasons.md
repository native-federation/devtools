### Task

Pools tab: show why each remote is on the global map, in a subpool, or on
its own build — every range rejection, every missing entrypoint, the
unshipped combination — plus coverage and 4.8 band labels.

### Status

DONE

UI 707, bridge 126, collector 149, guards 92 green; `build:extension`
passes; checked in the dev server on `pool-portfolio`, `pool-showcase`,
`pool-unshipped`.

### Files Modified

- Store: `pool-family-model.ts` — cell states `rejected` (replaces
  `conflict`, strict or not) and `gap`; `PoolStatusCell.missing`,
  `servedBy`; `PoolFamily.coverage`, `undecided`. `derive-pool-families.ts`
  computes them.
- `views/pools/pools-view-model.ts` — rewritten wording: band labels
  (`Global map` / `Subpool` / `Own build`), extension notes, reason lines
  (`PoolReasonVm`, lifted to the band when every row shares it), coverage
  line, verdicts (`Own build`, `Subpool`, `N unexplained`), cell tooltips,
  pending for undecided scopes, version warning below 4.8.
- `pools.html` / `pools.css` — coverage line, reason lines, `gap` cell,
  `↪ subpool`, band label span.
- Specs: `pools-view-model.spec.ts` (new scenarios: uncovered gap,
  non-strict, unshipped, unexplained, undecided, 4.7 warning),
  `pools.spec.ts`, `derive-pool-families.spec.ts`,
  `derive-package-verdicts.spec.ts` (state rename).
- `docs/work/pools-v48/design/pools-reasons-mock.md` — the contract.

### Key Decisions

- **All rejections listed** (user's call), strict first, each with
  specifier, global tag, range and strictness.
- **Non-strict rejections are `rejected` cells:** in 4.8 they isolate too
  (`pool-incompatible-nonstrict`); the 4.7 "wouldn't have blocked" note is
  gone.
- **Reason lifted to the band** when all its rows share it, after the first
  render repeated the same subpool reason on five rows and squeezed the
  legacy rejections into the name column.
- **Coverage per card** comes from the store (`family.coverage`), not the
  view.

### Acceptance Coverage

- **T5-AC-01 — passed:** `pool-showcase` ui: `Subpool · build of admin`,
  reason `not covered: the global map lacks @nf-lab/ui-dom`.
- **T5-AC-02 — passed:** `pool-uncovered-gap`: `gap` cell on mfe1's ui-core
  (tooltip names `@nf-lab/ui-core/testing`), reason and coverage line.
- **T5-AC-03 — passed:** `pool-incompatible-nonstrict` / `pool-portfolio`:
  `rejected` cells, tooltips with range, global tag and strictness.
- **T5-AC-04 — passed:** `pools.spec.ts` T11-AC-02 — every coloured cell
  focusable with `aria-label` = tooltip; forbidden-vocabulary pin extended to
  the new fixtures.

### Context for Next Task

- Task 6 aligns Packages/Remotes: Packages still says "rejects … strict ·
  keeps its own" for every `scope` row and its `acceptsElected` has no
  own-tag exemption (`acceptsTag` in `semver-range.ts` is ready).

### Open Issues

- None.

### Git State

- Branch `pools-v48`, committed as `task-5`.
