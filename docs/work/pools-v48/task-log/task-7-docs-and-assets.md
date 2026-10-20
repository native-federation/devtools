### Task

Docs and assets for the 4.8 placements: README, development notes, data
model, and a Pools screenshot.

### Status

DONE

UI 717, bridge 126, collector 149, guards 92 green; `build:extension`
passes; all four lab corpora validate.

### Files Modified

- `README.md` — Packages and Pools bullets; new "Why a remote left the
  pool" section with the Pools screenshot.
- `docs/assets/readme/pools-{light,dark}.png` (new) — `pool-portfolio`
  Pools card at 1170 CSS px, 2× (2292×1020); Playwright (the lab's
  `playwright-core` and its Chromium) against `ng serve` with
  `?fixture=pool-portfolio&theme=<light|dark>`.
- `docs/DEVELOPMENT.md` — Packages (subpool verdict, reasons, Why line,
  entrypoint markers, own-version exemption), Remotes chips, Pools
  (placements, reasons, gap/rejected cells, pending), fixture list.
- `docs/resolution-data-model.md` — package verdicts: `subpool`,
  `reason`, `servingBuild`, own-tag acceptance; class diagram fields.

### Key Decisions

- **Store listing screenshots not re-shot:** `docs/assets/store/*` come
  from the live `exported-playground-checkout` page; this branch changes
  nothing they show.
- **Existing README Packages / Remotes screenshots kept:** same fixture, and
  the visible parts did not change.

### Acceptance Coverage

- **T7-AC-01 — passed:** README, DEVELOPMENT, data model and captures
  README mention torn only in the 4.8 compatibility note (and the
  `fallback-uncovered` row's provenance).

### Open Issues

- Pool chip → remote row link in Pools (Task 6 open issue).
- Strict-scope per-tag fallbacks and runtime-load decisions stay out of
  scope (plan).

### Git State

- Branch `pools-v48`, committed as `task-7`.
