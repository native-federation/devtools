### Task

Render the Task 10 status matrix and verdict in the Pools tab, replacing
the tag matrix, the per-remote outcome sentences and the untagged
footnote.

### Status

DONE

UI 606, guards 72 green; `build:extension` and `check:panel-bundle` pass,
the Pools stylesheet stays under the 4 kB component budget. Checked
visually in the dev build (headless Chromium, `?fixture=` + `?theme=`):
`pool-showcase` light and dark, `pool-portfolio` dark at 760 px — no
sideways page scroll, no console errors.

### Files Modified

- `views/pools/pools-view-model.ts` — rewritten: cards carry columns (a
  shared npm scope shown once), bands (`Build of <owner>` + `serves N
  others · N redirected · host precedence` / `isolated`), rows (chip, tag
  or `no tag`, `↪ redirected`), cells (served version, state, tooltip) and
  one verdict (`<icon> <Type> · <cause>  <who> · <why>`); legend; problem
  pools first. Kept: definition + docs link, version warning, orphans,
  pending, membership notes.
- `views/pools/pools.{html,css,ts}` — header → matrix → verdict → notes;
  cells focusable with `title` and `aria-label`; the matrix scrolls inside
  its card.
- `styles.css` — semantic tokens `--nf-color-conflict(-contrast)`,
  `--nf-color-isolated-{text,bg}`, `--nf-color-serves-{text,bg}` in the
  light and both dark blocks.
- `resolution/pool-family-model.ts`, `derive-pool-families.ts` — removed
  what only the old view read: `PoolFamily.matrix`, `PoolMatrixCell`,
  `PoolConsumer.conflicts`/`servesOthers`/`sharedCombinationMixes`,
  `PoolVersionConflict`.
- Specs — `pools-view-model.spec.ts` rewritten on the 4.7.0 fixtures;
  `pools.spec.ts` DOM checks for the new layout; `derive-pool-families.spec.ts`
  moved its removed-field asserts onto `statusMatrix`.

### Key Decisions

- **Verdict wording deviates from the mock-up where the data calls for
  it:** the redirect `why` is "shared versions come from host and catalog"
  (the builds, not per-package analysis); more than two remotes read as a
  count ("4 remotes redirected"), since the matrix shows who.
- **Colours only where something happened:** the verdict colours only its
  type, and only for isolation (orange) or a torn combination (red).
- **State rules scoped to the cell** (`.pool-matrix td[data-state=…]`):
  plain attribute selectors lost to the muted `.pool-matrix td` colour,
  which made conflict text unreadable — caught in the screenshot pass.

### Acceptance Coverage

- **T11-AC-01 — passed:** `pool-showcase` renders charts, ui, form-kit
  (problem-first), one legend, the orphan; verdict right under the matrix.
- **T11-AC-02 — passed:** every coloured cell has `tabindex=0`, `title`
  and a matching `aria-label`; unused cells have none; both themes checked
  in screenshots.
- **T11-AC-03 — passed:** the vocabulary pin covers `pool-showcase` and
  `pool-portfolio` too.
- **T11-AC-04 — passed:** the matrix sits in `.pool-matrix-wrap`
  (`overflow-x: auto`); `pool-portfolio` at 760 px does not scroll the page.

### Context for Next Task

- Task 12 rewrites `design/pools-explainer-mock.md` for these strings; the
  view-model spec pins them.

### Git State

- Branch `share-pools`, committed as `task-11`.
