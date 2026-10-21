### Task

Rebuild the Remotes tab around orchestrator 4.8's one-build-per-package rule: per remote, where
each declared package runs from and why, and who runs its builds.

### Status

DONE

UI 728, bridge 128, collector 150, guards 94 green; `build:extension` passes. Checked in the dev
server on `pool-showcase`, `strict-uncovered`, `out-of-range-nonstrict`, `fallback-uncovered` and
`exported-playground-checkout`, light and dark.

### Files Modified

- `views/remotes/remotes-runs-vm.ts` (new) — Runs rows (with who else runs them), tally, kind labels.
- `shared/verdict-text.ts` (new) — `verdictNoteOf` and helpers moved out of
  `packages-version-vm.ts`.
- `views/remotes/remotes-detail-vm.ts` — provides / consumes / unresolved zones removed;
  capabilities, exposes, chunks, private registrations, relation-only kept; `runs` added.
- `views/remotes/remotes-view-model.ts` — list `marks` / `serves`; `summary` and `unresolved`
  removed.
- `views/remotes/remote-detail.{html,css,ts}`, `remotes.{html,css,ts}` — new layout, open-row
  state, `TipHost` tooltips.
- `styles.css` — `--nf-color-subpool-text`; `shared/kit/tree-table.css` re-points the kind
  colours on the selected row.
- Specs: `remotes-view-model.spec.ts`, `remotes.spec.ts` rewritten for Runs and warnings;
  `pools-cross-links.spec.ts` opens the run row before reading the pool link.
- Docs: README, `DEVELOPMENT.md`, `resolution-data-model.md`; `docs/assets/readme/remotes-*.png`
  and `docs/assets/store/screenshot-3-remotes.png` re-shot on `pool-showcase` → dashboard
  (README 1170×505 @2×, store 1280×800 dark).

### Key Decisions

- **Kind from the verdict, From from the map.** `own-copy`, `subpool`, `out-of-range` come from
  the stored verdict; otherwise the source of the copy the main specifier resolves to decides
  `self` / `shared` / `unknown`, so a qualified attribution never reads as self.
- **Secondaries fold only when they run the same way.** Flat externals stay one row per package;
  a pre-4.8 stitched secondary keeps its own row or its entrypoint marker.
- **Unresolved is a row, not a section.** `not mapped` / `declared` sort first and mark the list.
- **After review in the panel:** the reason column is unlabeled and shows a short label with
  the full reason as tooltip and in the opened row; From has no tooltip; Serves folded into the
  rows (`serves N`); a scope row reads `scoped`, as in Packages; the remoteEntry.json URL
  (derived like the orchestrator's cache check) replaces the scope URL; capabilities give way to
  `flat externals` / `flat chunking` warnings shown only when proven; the list marks only
  out-of-range and unresolved declarations and is narrower (`--nf-master-width`); chunks are an
  open section, hidden only without chunk evidence.

### Open Issues

- None.

### Git State

- Branch `remotes-v48` (from `packages-v48`), committed as `task-1`.
