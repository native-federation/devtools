### Task

Detail pane per package: one block per share scope with its election,
the versions table (deviations as notes), the range check, the torn
banner, and the existing per-copy view kept as collapsed bindings.

### Status

DONE (with Task 6 in one commit; the component holds both)

UI 638, bridge 105, collector 102, guards 81 green; extension build and
panel-bundle check pass. Checked in the dev server (`?fixture=`) with
Playwright screenshots: torn-many, strict-split, merged-entrypoints (dark),
multi-scope.

### Files Modified

- `views/packages/packages-version-vm.ts` (new) — `buildPackageView`:
  `ScopeBlockVm`, `VersionRowVm`, `RangeCheckVm`, `TornBannerVm`,
  `TORN_DOCS_URL`.
- `views/packages/package-versions.{ts,html,css}` (new) — the detail
  component; `packages.html` / `packages.ts` render it.
- `views/packages/package-detail.{ts,html}` — `embedded` input hides the
  header and meta line inside a scope block.
- `views/packages/packages-view-model.ts` — `packageView` beside the
  kept `detail` (the focused scope's per-copy view).
- `shared/store/resolution/verdict-model.ts`, `derive-package-verdicts.ts` —
  `requiredVersion`, `strictVersion` and per-tag `acceptance` on each
  declaration record (the range check reads them; views derive no
  semver facts). `VersionStatus` `partly-loaded` / `not-loaded` renamed
  `partly-mapped` / `not-mapped`.
- Specs: `packages-version-vm.spec.ts` (new, 9), `packages.spec.ts`
  (header assertions moved to the scope head, +2), wording updates.

### Key Decisions

- **Wording follows the resolution-honest rule, not the mock-up.** The
  vocabulary test bans "uses" / "loaded" in visible text: the capture is
  the import map, not what the browser fetched or ran. So: `not mapped`,
  `partly mapped`, column and fact **Resolves for** (mock: "Runs in"),
  the green dot "mapped" (mock: "downloaded"), tooltips "resolves to the
  shared copy" / "keeps its own copy". Layout and structure are the
  mock-up's.
- **Copy blocks kept as "Bindings per copy"** (collapsed) per scope: they
  carry grounded facts the versions table doesn't (anchored, not
  selected, declared under another package, chunk claims). The section
  opens by itself while a declaration resolves nowhere, and its summary
  counts unresolved declarations and diagnostics, so nothing is hidden.
- **No plain Graph link.** The Graph's `select` only focuses a pool, so a
  pooled package links to `/pools?select=` and
  `/graph?group=pool&select=`; others get no Graph link.
- **Out-of-range pills use the solid conflict colour** with its contrast
  text (`--nf-color-conflict-contrast` is white in both themes, so it
  can't be a background).
- **Range check** only with an election and two or more versions.
- **Docs link opens with `target="_blank"`** — verified in the real
  devtools panel (unpacked `dist/extension`, lab `torn-many`): it opens a
  new tab that lands on the "Entrypoint coverage and tearing" section, so
  no `chrome.tabs.create` is needed.

### Acceptance Coverage

- **T5-AC-01** — `out-of-range-nonstrict`: elected 2.0.0 first; notes only
  on 1.3.0 (`mfe2 own copy`) and 1.2.0 (`mfe1 out of range`); shippers
  partition the declarations.
- **T5-AC-02** — the range check's rejecting rows equal the verdict notes.
- **T5-AC-03** — DOM: banner link `href` and `target="_blank"`; in the real
  panel the link opens the docs in a new tab, scrolled to the section
  (checked by hand; an automated Claude-in-Chrome tab didn't scroll to the
  anchor, a normal tab does).
- **T5-AC-04** — every declaration of four fixtures (all scopes) renders as
  a shipper; every block keeps its bindings.
