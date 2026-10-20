### Task

Make the Pools tab readable on a real 4.8 page with 20–50 remotes: compact
reasons, fixed layout, pool (band) selection with a per-build view, an
issue-centric warning, proper tooltips — and check the recomputation
against the orchestrator.

### Status

DONE

UI 746, bridge 126, collector 149, guards 92 green; extension build and
panel-bundle check pass. Checked in the dev panel and with headless Chrome
(Playwright from the orchestrator repo) in light and dark, at 634/1280 px
and on `pool-portfolio` temporarily inflated to 40 remotes (not committed).

### Files Modified

- Store: `pool-family-model.ts` — `PoolConsumer.subpoolMisses`, `PoolLens`,
  `PoolLensCell`, `PoolFamily.lenses`. `derive-pool-families.ts` — `lensOf`
  (every remote judged against one remote's build, the orchestrator's
  `serves`: range, then coverage); subpool misses read off the lenses.
  `derive-grouping-facets.ts` — pool membership: a stored `poolName` groups
  first; else v4.8 records (`poolWinner`) link one label across every remote
  (`membership.ts`), older ones per remote (`pool-graph.ts`).
- `shared/placement-text.ts` — range reasons grouped per range and tag,
  naming packages with an entrypoint count; `placement-text.spec.ts` (new).
- `views/pools/pools-view-model.ts` — cause chips (tooltip: every reason,
  incl. `not in the subpool of X`, `runs on`), lens rows/coverage/verdict,
  band `selectable`/`active`, card `selected`, `coverage.issues` (conflict /
  missing / unshipped, one line per problem, a subpool collapsed to its
  owner), scope groups for mixed npm scopes, `remoteListOf` (chips cap at
  six).
- `views/pools/pools.ts|html|css` — band headers (global map included) and
  rows select a pool; nothing selected by default; the warning box under the
  matrix only while a pool is selected; summary card with `clear selection`;
  fixed column widths via `<colgroup>`, remote column measured (≤ 420px),
  sticky remote column and band labels; scope header row; own tooltips
  (`data-tip`, instant, keyboard, flips above, hides on scroll); hover
  cross-highlighting rows ↔ issue lines; selected band tinted.
- Specs: Pools VM and DOM (selection, lens, issues, tooltips, hover, scopes,
  chip cap), grouping rule (v4.8 label vs per-remote, stored `poolName`),
  lenses vs stored placements on every 4.8 fixture, every fixture × every
  lens renders.
- Docs: `plan.md` (Task 9), `design/pools-reasons-mock.md`.

### Key Decisions

- **Where is stored, why is recomputed; the election is not re-implemented.**
  The per-build view is the orchestrator's `serves` check ("fits"), never a
  prediction (ranking, subpool order, extensions, host precedence not
  re-run), to stay decoupled from `election.ts`.
- **Orchestrator parity check (not committed):** 460 portfolios from the
  orchestrator's own `generate-portfolio.ts` run through its real 4.8 init,
  records fed through the derivation — 852 pools, 6,843 placements. 4
  disagreed, all from the pool-label rule above; 0 after the fix.
- **Issues, not remotes:** a per-remote list was unreadable at 20 remotes;
  the warning groups by problem and puts per-remote detail in the chip
  tooltip.
- **A chip landing selects the global map** (why the remote is off it), a row
  click selects the row's own pool.
- `pools.css` stays under its 8 kB error budget (focus rules merged, dead
  rules dropped); still over the 4 kB warning, like other views.

### Acceptance Coverage

- **T9-AC-01 — passed:** rows one line high (measured on the inflated
  fixture).
- **T9-AC-02 — passed:** grouped range wording pinned on `pool-portfolio`.
- **T9-AC-03 — passed:** secondaries collapse with an entrypoint count.
- **T9-AC-04 — passed:** chip tooltip carries every reason; issue lines group
  remotes.
- **T9-AC-05 — passed:** mixed / unscoped packages.
- **T9-AC-06 — passed:** legacy's `not in the subpool of contacts`.
- **T9-AC-07 — passed:** contacts' build fits 11 of 12; the global band /
  `clear selection` returns.

### Context for Next Task

- Docs follow-up (separate commit): README Pools section and screenshots
  (`pool-portfolio`, global map selected, 1180 CSS px at 2×, headless Chrome
  via the orchestrator repo's Playwright), DEVELOPMENT Pools paragraph, data
  model (grouping rule, `lenses`, `subpoolMisses`).
- The parity harness lives only in the session scratchpad; committing a
  trimmed corpus (~40 portfolios) would keep it in CI.

### Open Issues

- Unparseable ranges: the orchestrator rejects them; the view calls them
  unexplained.
- Pre-4.8 evidence is thin: one pooled fixture (`pooling-anchor`); reasons
  follow 4.8's rules there, under the version banner.
