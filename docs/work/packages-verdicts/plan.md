# Native Federation DevTools — Packages Tab: Versions & Verdicts Plan

Branch scope: packages-verdicts (from share-pools — needs its pool facts, `semver-range.ts` and the Graph's "see usage details" link)
Upstream verified against: orchestrator `0d2ad3f` (v4.7.0), docs `native-federation.com/docs/v4` (version-resolver: step 2, secondary entrypoints, entrypoint coverage and tearing).
Design: `docs/work/packages-verdicts/design/packages-verdicts-mock.html` (published as https://claude.ai/artifact/U1WGGtdx1jCRCGRXffCEFf). The mock-up's example data and its in-page semver check are illustration only; every fact below comes from the projection.

Goal: turn the Packages tab from "what resolved" into "what was decided, and why". One list row per package; the detail shows, per share scope, every available version with the resolver's verdict per remote, and a per-version deep dive (shipped by, entrypoints, files). New findings: **out of range** (a non-strict remote runs a shared version its range rejects), **torn** (entrypoints served from another version) and **merged** (one version assembled from several builds — not a problem, lightly marked).

Hard constraints (inherited from docs/work/graph-view/plan.md and share-pools, unchanged): views consume only `CanonicalResolutionProjection` and derive no domain facts; every rendered identity is a canonical ID; wording is resolution-honest and never delivery-claiming; the collector stays passive. Unresolved declarations and the diagnostics footer of today's detail are kept — the redesign moves them, it never drops a declaration.

What the stored data supports (governs every task):

| Fact | Evidence | Rule |
|---|---|---|
| Elected version per (scope, package) | the registration with action `share`; the `strict` scope elects none (every tag `share`) | `update-cache.ts:93–96` |
| Verdict per declaration | registration `action`, declaration `requiredVersion` / `strictVersion`, elected tag | resolver step 2; range check through `shared/store/semver-range.ts` (npm `semver`, same call as Pools) |
| Out of range | action `skip` + `strictVersion: false` + range rejects the elected tag | the orchestrator stores a plain `skip` (strict mismatches become `scope`, `update-cache.ts:99`), so this is only visible by re-checking the range |
| Downloaded versions | resolved copies per scope (`ResolvedDependencyCopy.resolvedTag`) | a copy exists only where the effective import map materializes it |
| Merged | ≥2 copies with the same (scope, resolvedTag), each a distinct source build serving its own specifiers | docs "Copies of one version always merge"; observed from the map, not recomputed from the host/served/widest order |
| Torn | claims with `mappingState: 'self-filled'` (copy role `self-filled-source`) | `generate-import-map.ts:194` |

An unreadable range or a missing elected tag yields no verdict claim (`unknown`), never a guessed one.

> The executing agent may adjust scope and ordering based on more
> up-to-date context discovered during implementation, as long as
> each task still satisfies the sizing rules above.
>
> When a task is finished (DONE or BLOCKED), close it with the
> `/wrap-up N` → `/commit N` pair. `/wrap-up N` writes or extends
> `docs/work/<scope>/task-log/task-{N}-{slug}.md`, where `<scope>`
> is derived from the current git branch, and is safe to run multiple
> times across sessions — it merges. `/commit N` reads that log,
> stages code + summary, and commits them together after showing
> the plan and waiting for confirmation. Optionally run `/review`
> (quick per-task, full before a PR) between wrap-up and commit;
> a second `/wrap-up N` can absorb the review findings.

## Task 1: Witness captures for the new findings

### Instructions

- Check the existing corpora first; reuse before recording:
  `self-fill` (torn, one specifier), `strict-scope` / `strict-split`,
  `scope-isolation`, `clean-skip`, `co-declared-share` (likely the
  merged case — confirm its copies serve disjoint specifiers).
- Add nf-lab scenarios (`native-federation/playground`, `lab/`, second
  corpus, `captures/manifest-nf-lab.json`) for what is missing:
  - `out-of-range-nonstrict` — one remote `strictVersion: false` with a
    range that rejects the elected major;
  - `torn-many` — the shared version's copies lack 5+ secondary
    entrypoints that two other versions fill;
  - `merged-entrypoints` — two remotes ship the same tag, the
    non-first copy adds an entrypoint the first lacks;
  - `multi-scope` — one package in global, two named scopes and `strict`.
- Derive SnapshotV1 fixtures via `scripts/derive-fixtures.mjs`; record
  in the task log which stored fields each capture exhibits.

### Acceptance

- **T1-AC-01** — each capture passes the collector schemas and `fixture-drift.spec.ts`.
- **T1-AC-02** — the manifest pins playground and orchestrator commits per scenario.
- **T1-AC-03** — the task log names, per finding (out of range, torn, merged, multi-scope), the fixture that witnesses it.

### Key Locations

- `captures/`, `scripts/lab-capture-dump.js`, `scripts/derive-fixtures.mjs`, `scripts/lab-corpora.mjs`
- `projects/devtools-bridge/src/lib/fixtures/`

## Task 2: Publish version verdicts on the projection

### Instructions

- Add a `packageScopeVerdicts` list to the projection (types in
  `resolution/verdict-model.ts`), one entry per (scope, package):
  - `electedTag` (null in `strict`) and its source declaration;
  - `versions`: every registered tag, each with `status`
    (`shared` | `scoped` | `partly-loaded` | `not-loaded`), the IDs of
    the declarations shipping it, and the copy IDs that materialize it;
  - per declaration a `verdict`: `provides` | `same-version` |
    `reuses-shared` | `own-copy` | `out-of-range` | `strict-exact` |
    `unknown`, with `acceptsElected: boolean | null` and the version it
    runs (the copy its claims resolve to).
- `partly-loaded`: a version none of whose shippers run it, but whose
  build fills torn entrypoints (it is downloaded).
- Read the verdict from the stored action first; the range check only
  separates `reuses-shared` from `out-of-range`. Reuse
  `satisfiesRange`; if `derive-pool-families.ts` already computes
  `acceptsShared` the same way, extract one shared helper instead of
  a second copy.

### Acceptance

- **T2-AC-01** — `out-of-range-nonstrict`: the non-strict remote is `out-of-range`, runs the elected tag; nothing else in the capture is.
- **T2-AC-02** — `scope-isolation`: the strict mismatch is `own-copy`, its version `scoped`.
- **T2-AC-03** — `strict-scope`: `electedTag` null, every version `shared`, every declaration `provides` / `same-version` / `strict-exact`.
- **T2-AC-04** — an unreadable `requiredVersion` (synthetic) yields `unknown`, never `out-of-range`.
- **T2-AC-05** — verdicts agree with the Pools matrix on every pool fixture (no cell is a conflict in one view and accepted in the other).

### Key Locations

- `shared/store/resolution/build-canonical-projection.ts`, `projection-model.ts`
- `shared/store/semver-range.ts`, `resolution/derive-pool-families.ts`

## Task 3: Publish build surface: merged builds and torn entrypoints

### Instructions

- Per (scope, version) publish the builds that serve it: for each copy,
  its source remote, the specifiers it serves (`entrypoints`), its entry
  files and its bundle chunk files (from `bundleClaimIds`), and whether
  every mapped file carries SRI.
- `merged`: true when ≥2 builds serve one (scope, version); builds keep
  the order the map evidences (first = the copy serving the package's
  own specifier).
- `torn`: per (scope, package) the self-filled specifiers, each with the
  filling version and build; grouped by filling version in the view,
  but published flat.
- `downloadedCopyCount` per package: Σ over scopes of downloaded
  versions (shared + scoped + partly-loaded), for the list and sort.

### Acceptance

- **T3-AC-01** — `merged-entrypoints` (or `co-declared-share`): one version, `merged`, two builds, each listing only its own specifiers.
- **T3-AC-02** — `torn-many`: every self-filled specifier listed once with its filling version; filling versions count as `partly-loaded`.
- **T3-AC-03** — `self-fill`: one torn specifier, matching today's `self-filled` consumer chip.
- **T3-AC-04** — SRI is reported as all / some / none per build; "SRI ✓" is never claimed for a build with an unhashed file.

### Key Locations

- `resolution/materialize-resolved-copies.ts`, `derive-bundle-claims.ts`, `derive-chunk-groups.ts`
- `views/packages/packages-chunk-vm.ts` (current chunk-claim wording to carry over)

## Task 4: List: one row per package, filters, search, sort

### Instructions

- Rows become one per package across scopes (today: per scope ×
  package). Row: name (ellipsis, full name on hover), status dots
  (out of range red, isolated orange, torn amber — no dot for merged),
  a `strict` tag when any scope is `strict`, and `N copies`
  (`downloadedCopyCount`, grey at 1). No other scope names.
- Toolbar: search, filters All / Multiple versions / Out of range /
  Isolated / Torn with counts, sort name / copies / remotes. Remember
  filter and sort per panel session like the Graph's toggles do.
- Keep `?select=` stable: accept today's (scope, package) IDs and map
  them to the package plus that scope's block, so links from Graph,
  Import map and Pools keep working; Graph's "see usage details" opens
  the package's scope block.
- Linked subpath rows and dense-secondary sub-rows (T7.10) fold into the
  deep dive's entrypoints; check no secondary entrypoint loses its only
  visible place.

### Acceptance

- **T4-AC-01** — `multi-scope`: one row, `strict` tag, copy count = downloaded versions over all scopes.
- **T4-AC-02** — each filter count equals the number of packages the projection flags; Torn excludes merged-only packages.
- **T4-AC-03** — every existing `/packages?select=` link in the app lands on the right package and scope.
- **T4-AC-04** — a 60-character package name keeps dots, tag and count visible at the narrowest master width.

### Key Locations

- `views/packages/packages-row-vm.ts`, `packages-view-model.ts`, `packages.html`, `packages.ts`
- `views/graph/graph.html` (usage-details link), `views/import-map/import-map.html`, `views/pools/`

## Task 5: Detail: scope blocks and the versions table

### Instructions

- Header: package name, scope count, Graph link. One block per scope,
  separated by spacing (no divider), headed by the scope tag (tooltip:
  shareScope wording) and "shares X from ● remote" (or "every exact
  version shared"), plus the pool link where the PR's pool facts apply.
- Versions table, one row per version: ▸ version (downloaded versions
  full contrast with a small green dot, others muted), status, shipped
  by (count), runs in (count), notes — only deviations: "remote out of
  range", "remote own copy", "fills N torn entrypoints", grey
  "merged · N builds". Every note carries its grounded reason as a
  tooltip.
- No STRICT flag; the range tooltip in the deep dive carries
  `strictVersion`.
- Range check: collapsed `details` under the table, summary names the
  rejecting remotes; matrix of ranges × versions. Not rendered for
  `strict` or single-version scopes.
- Torn banner per scope: grouped counts per filling version, "Torn"
  with the definition tooltip, "What is torn? ↗" to
  `…/orchestrator/version-resolver/#entrypoint-coverage-and-tearing`.
  Verify external links open from the devtools panel (may need
  `chrome.tabs.create`).
- Unresolved declarations and diagnostics: kept per scope block, below
  the table, in today's wording.

### Acceptance

- **T5-AC-01** — `@angular/core`-shaped fixture: elected row first, notes only on deviating versions, no row repeats a remote.
- **T5-AC-02** — the range check's summary and matrix agree with the T2 verdicts.
- **T5-AC-03** — the banner link opens the docs in a new tab from the real panel.
- **T5-AC-04** — every declaration of the old detail still renders somewhere (verdict row, unresolved or diagnostics).

### Key Locations

- `views/packages/packages-detail-vm.ts`, `package-detail.html`, `package-detail.css`
- `shared/kit/` (tooltip, chip conventions)

## Task 6: Version deep dive

### Instructions

- Clicking a version (or Enter) opens its deep dive inline under the
  row; clicking again closes it; one open version per scope block; all
  closed by default. Open row and deep dive share the neutral surface
  fill — no accent colour.
- Content: facts (Built by — every build, "merged" note when >1;
  Mapped — for every remote / only for X / not mapped; Runs in — chips,
  out-of-range ones red), then three lists:
  - Shipped by: remote, declared range (tooltip with `strictVersion`),
    verdict label (tooltip: reason);
  - Entrypoints: plain list for one build, grouped under build headers
    when merged; on the elected version a collapsed "N torn entrypoints"
    group, grouped by filling version; on a filling version a "fills
    torn entrypoints" note and a `torn` marker per specifier;
  - Files: entry files then chunks, no "chunk" label, grouped under
    build headers when merged; each file opens its URL in a new tab;
    SRI stated once in the heading (all / n of m).
- Versions no remote runs show facts and Shipped by only, saying who
  ships it and that they use the elected version.

### Acceptance

- **T6-AC-01** — `merged-entrypoints`: entrypoints and files grouped by build; single-build versions show no headers.
- **T6-AC-02** — `torn-many`: the torn group scales (collapsed by default, grouped, counts match T3).
- **T6-AC-03** — keyboard: Tab reaches each version row, Enter toggles, focus stays on the row.

### Key Locations

- `views/packages/package-detail.*`, new `packages-version-vm.ts` if the detail VM grows past one concern

## Task 7: Docs and assets

### Instructions

- Update the Packages section of `README.md` and the store listing copy;
  re-shoot `docs/assets/readme/packages-*.png` and
  `docs/assets/store/screenshot-2-packages.png` from a capture (light
  and dark).
- Record in the task log which old Packages elements were removed or
  moved (copy blocks, linked subpath rows, entrypoint sub-rows).

### Acceptance

- **T7-AC-01** — screenshots show the versions table with one deep dive open and no example data from the mock.

### Key Locations

- `README.md`, `docs/assets/`
