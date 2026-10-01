### Task

Cross-link the Pools tab, the Graph's Pool grouping, and the pool chips
of Packages and Remotes.

### Status

DONE

All three acceptance criteria pinned through the real routes
(`RouterTestingHarness`). UI 563, bridge 93, collector 82, guards 68
green; typecheck and Prettier clean. Clicked through live (Pools → show
in Graph → explain), no console errors.

### Files Modified

- `views/graph/graph-types.ts` — `GraphCluster.poolId`, `nodeKeys`.
- `views/graph/graph-grouping.ts`, `graph-model.ts` — pool clusters carry
  their pool ID; every cluster lists its node keys.
- `views/graph/graph.{ts,html,css}` — `?group=` seeds the grouping,
  `?select=` the focused pool (`focusedPoolId`); focused cluster outlined,
  other dependency nodes dimmed (hover trace still wins), toolbar
  "showing pool …" + Clear; `explain` link on pool cluster headers.
- `views/pools/pools.{ts,html,css}` — `?select=` highlights the card;
  "show in Graph" link per card.
- `views/packages/package-detail.html`, `views/remotes/remote-detail.html`
  — pool chips link to `/pools?select=<pool ID>` (orphan chips to
  `/pools`; strict-scope tags stay plain — no tab would exist).
- `views/pools/pools-cross-links.spec.ts` (new); plan Task 7 amended.

### Key Decisions

- **Emphasis instead of the remote filter:** the Graph's click-to-filter
  selects consumer remotes; a pool is a set of packages, so the link
  outlines its cluster and dims the rest instead. Plan amended.
- **`select` = pool ID** everywhere (already scope-qualified).
- **Query params seed, not overwrite:** the grouping follows `?group=`
  when present; the focus is a plain signal (like `groupBy`), so it
  survives the store's first model emission; an unknown ID matches
  nothing (T7-AC-03).

### Acceptance Coverage

- **T7-AC-01 — passed:** "show in Graph" → `/graph?group=pool&select=…`
  lands on Pool with `pool @nf-lab/ui-core (2)` focused and utils dimmed;
  the cluster's `explain` link → `/pools?select=…` with the card selected.
- **T7-AC-02 — passed:** both Package-detail chips on ui-core link to the
  pool.
- **T7-AC-03 — passed:** unknown `select` on Graph and Pools → no
  emphasis, no error.

### Git State

- Branch `share-pools`, committed as `task-7`.
