### Task

Derive, per pool and remote, where orchestrator 4.8 placed it (global map,
subpool, own build) and why (range rejection, missing entrypoints,
unshipped combination), checked against the stored `poolCause`.

### Status

DONE

UI 703, bridge 126, collector 149, guards 92 green.

### Files Modified

- `shared/store/semver-range.ts` + spec — `acceptsTag`: a copy always
  accepts its own version, semver-equal (orchestrator `createAcceptsTag`).
- `resolution/pool-family-model.ts` — `PoolPlacement`
  (`global | subpool{owner} | self | unknown`), `PoolMiss`
  (`range{rejections} | coverage{missing} | unshipped{gap}`),
  `PoolRangeRejection`, `PoolSurfaceEntry`; `PoolConsumer` now carries
  `placement`, `miss`, `storedCause`, `consistent` (the `outcome` enum is
  gone); `PoolFamily.winner`, `globalSurface`; bands `global | subpool |
  isolated | unknown`; verdict `redirected.cause` replaces `mixes`.
- `resolution/derive-pool-families.ts` — rewritten: first row per remote and
  member (as `copiesByRemote`), the global surface from the serving build's
  copy at the `share` tag, `missOf` / `unwitnessedGap` ported, a local
  `SpecifierTags` with `pinnedTag`; members are `unshared` only when neither a
  share row nor a subpool serves them; pending also while the scope is in
  `cache-state.undecidedScopes`.
- `shared/store/ingest.ts` — passes `undecidedScopes`.
- `views/pools/pools-view-model.ts` — redirected verdict states the derived
  cause; no hard-coded "would mix builds", no "shared versions come from";
  band label for an unknown placement.
- Specs: `derive-pool-families.spec.ts` rewritten; `pools-view-model.spec.ts`
  band order and verdict line.
- `docs/resolution-data-model.md` — pooling paragraph.

### Key Decisions

- **Placement read, reason recomputed:** the stored rows decide the band;
  the recomputed miss explains it. A stored `poolCause` is never replaced: if
  the recomputation disagrees, `consistent` is false (Task 5 shows that as
  unexplained).
- **The global surface, not `poolWinner`'s copies:** 4.8 extends the winner
  with packages it does not ship (`pool-unshipped`: ui-dom from mfe1), so
  coverage is judged against what the map serves.
- **All rejections and all missing specifiers** are listed, not only the
  first one `missOf` would log; the order follows its precedence.
- **No cause guessing:** the isolation cause is the stored one only when
  every isolated remote stores the same; otherwise null.
- **Pre-4.8 records** use the same reading; the 4.6 `pooling-anchor` anchor
  reads as a subpool owned by mfe1. The global band's owner falls back to the
  first shared member's build when no winner is stored.

### Acceptance Coverage

- **T4-AC-01 — passed:** every consumer of every 4.8 pool fixture is
  `consistent` (31+ checked); per-scenario reasons pinned (`ui-core/testing`
  gap, non-strict rejections, strict-first order, unshipped `ui-dom`, subpool
  coverage of `ui-dom` / `acme-forms` + `acme-animations`).
- **T4-AC-02 — passed:** hand-built stored `uncovered` with only a range
  rejection → `consistent: false`.
- **T4-AC-03 — passed:** hand-built own-tag-out-of-range → no rejection,
  `acceptsShared: true`.

### Context for Next Task

- Task 5 renders: `family.winner`, `globalSurface` (coverage summary),
  per consumer `placement` / `miss` / `storedCause` / `consistent`, bands by
  kind. Cell states are unchanged (`gap` / `rejected` cells are Task 5).
- The VM still says "Redirected" for subpools and "Isolated" for own builds.

### Open Issues

- None.

### Git State

- Branch `pools-v48`, committed as `task-4`.
