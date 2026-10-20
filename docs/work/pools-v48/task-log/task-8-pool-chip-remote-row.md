### Task

A `pool: <tag>` chip in Packages or Remotes opens Pools with its card
selected and the declaring remote's row marked and scrolled into view
(moved here from Task 6's out-of-scope list).

### Status

DONE — committed together with Task 9 (same Pools files).

UI 746, bridge 126, collector 149, guards 92 green; checked on the dev
server (`pool-portfolio`: Remotes → `orders` chip → its row in the contacts
subpool, light and dark).

### Files Modified

- `shared/pool-chip.ts` — `poolSelect` → `poolQuery: { select, remote }`.
- `views/remotes/remote-detail.html` (×3), `views/packages/package-detail.html`
  (×2) — chips bind `[queryParams]="pool.poolQuery ?? {}"`.
- `views/pools/pools.ts|html|css` — reads `remote` next to `select`; the
  matching row gets `.selected` and `aria-current`; scrolls once (the
  `import-map.ts` effect + `setTimeout` pattern).
- `app.routes.ts` — query-parameter convention.
- Specs: `pools-cross-links.spec.ts` (T8), `packages-view-model.spec.ts`.

### Key Decisions

- The chip block was not extracted into a component: each view styles
  `.pool-chip` in its own CSS.
- The version-level pool link in `package-versions.html` stays pool-only (no
  single remote).
- Landing (amended in Task 9) also selects the card's global-map band, so the
  warning says why the remote runs where it does.

### Acceptance Coverage

- **T8-AC-01 — passed:** Remotes chip href carries `&remote=`; landing marks
  exactly that row in that card.
- **T8-AC-02 — passed:** same from a Packages deep-dive chip.
- **T8-AC-03 — passed:** `pool-incompatible-nonstrict`: the marked row sits in
  `Own build · mfe1` with its `version conflict` chip; the global map is
  selected and its issue line marked.
- **T8-AC-04 — passed:** unknown `remote` or `remote` without `select` marks
  nothing.
- **T8-AC-05 — passed.**

### Context for Next Task

- The PR #6 description still lists the pool-chip link under "Not in this PR".

### Open Issues

None.
