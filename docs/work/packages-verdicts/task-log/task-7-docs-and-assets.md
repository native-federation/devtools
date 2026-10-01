### Task

README and development notes for the new Packages tab; re-shoot the
README Packages screenshots.

### Status

DONE

UI 638, bridge 105, collector 102, guards 81 green.

### Files Modified

- `README.md` — Packages feature bullet; screenshot alt text and caption.
- `docs/DEVELOPMENT.md` — Packages paragraph.
- `docs/assets/readme/packages-{light,dark}.png` — re-shot at the old size
  (1170×505 CSS px, 2× → 2340×1010) from `exported-playground-checkout`,
  `@angular/core`, the 22.0.8 deep dive open; Playwright against
  `ng serve` with `?fixture=`.
- Fixes the screenshots surfaced at panel width:
  `package-versions.css` (Shipped by rows wrap instead of overlapping
  long remote names), `packages.html` / `packages.css` (sort sits beside
  the status filters and the scopes summary ends the participants line,
  so the toolbar wraps to two lines, not three), `packages.spec.ts`
  (toolbar zone assertion).

### Key Decisions

- **No store listing assets on this branch.** `docs/assets/store/` exists
  on `main` (Chrome Web Store prep) but not on `share-pools`, so
  there is no `screenshot-2-packages.png` to re-shoot here; redo it after
  this branch merges with `main`.
- **Same fixture and framing as before**, so the README image swaps
  without changing the page layout.

### Removed or moved from the old Packages tab

- List: resolved-version tags and the ⚠ glyph per row → status marks and
  the copy count; entrypoint sub-rows (dense secondaries) → the version
  deep dive's Entrypoints; the scope chip per row → the detail's scope
  blocks (only `strict` stays as a row tag).
- Detail: the package header's share scope / pinned scope meta line →
  each scope block's tag; the multiplicity header → version notes; copy
  blocks, the unresolved bucket and the diagnostics footer → kept,
  under "Bindings per copy" per scope (opens by itself while declarations
  are unresolved).
- Filter: Conflicts → Multiple versions (same rule), plus Out of range,
  Isolated, Torn; new search and sort.

### Acceptance Coverage

- **T7-AC-01** — both screenshots show the versions table with the 22.0.8
  deep dive open, from a capture fixture, no mock data.
