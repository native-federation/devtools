### Task

One list row per package across its share scopes, with status marks, a
`strict` tag and the downloaded-copy count; status filters, search and
sort in the toolbar.

### Status

DONE

UI 627, bridge 105, collector 102, guards 81 green. The detail still
renders the existing copy blocks for one scope (the selected link's
scope, else the first); Task 5 replaces it.

### Files Modified

- `views/packages/packages-row-vm.ts` — rewritten: `PackageEntry`,
  `PackageRowVm` (`marks`, `strict`, `copies`, `linked`), `buildRows`,
  `marksOf`, `downloadedVersionsOf`. Entrypoint sub-rows removed.
- `views/packages/packages-view-model.ts` — package entries per name,
  filters `all | multi | out-of-range | isolated | torn` with counts,
  `query` and `sort` (optional in `PackagesUiState`), `parseSelection`,
  `selectedPackage`; empty notes per filter.
- `views/packages/packages.ts`, `packages.html`, `packages.css` — search
  input, status buttons with mark dots, sort select, new row template;
  sub-row and versions-cell styles removed.
- Specs: `packages-view-model.spec.ts` (row assertions rewritten, sub-row
  block replaced, +4 T4 cases), `packages.spec.ts` (row DOM, filter
  labels, +1 truncation case).

### Key Decisions

- **The participant filter stays.** The mock-up didn't show it, but it is
  existing behaviour and combines with the new filters; the scopes summary
  stays too.
- **Rows are keyed by package name; `?select=` keeps `<scope>|<pkg>`.**
  Package names never contain `|`, so `parseSelection` splits on the last
  one; row clicks select by name. Every inbound link (Graph, Import map,
  Remotes, Pools) keeps working without changes.
- **Copy count = materialized copies**, not `share` rows: a version
  counts when its `copyIds` is non-empty, plus copies without an evidenced
  tag (named as such in the tooltip). A map-less capture reads `no copy`
  with the existing grounded note.
- **"Multiple versions" keeps the old Conflicts rule** (resolved-tag
  multiplicity in a non-strict scope), so the strict scope never flags.
- **Subpaths nest under their nearest package prefix** (`foo/bar/baz` at
  depth 2, display `/baz`), and stand alone when the parent is filtered out.
- **No persisted filter/sort:** the plan said "like the Graph's toggles",
  but the Graph persists nothing; the state lives in the component.
- **Found on an existing capture:** `strict-split`'s mfe1 (`~1.0.0`, not
  strict) runs the shared 2.0.0 — out of range. The spec now pins it.

### Acceptance Coverage

- **T4-AC-01** — `multi-scope`: one row, `strict` tag, `4 copies` with
  the per-scope list.
- **T4-AC-02** — filter counts on `out-of-range-nonstrict`, `torn-many`,
  `merged-entrypoints` (merged is never torn).
- **T4-AC-03** — every `<scope>|<pkg>` of four fixtures lands on its
  package and that scope's detail.
- **T4-AC-04** — `.pkg-name` ellipsis; `.pkg-strict` / `.pkg-copies`
  `flex-shrink: 0` (jsdom computed style).
