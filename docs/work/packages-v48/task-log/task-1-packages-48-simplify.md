### Task

Align the Packages tab with orchestrator 4.8.0 (no stitching, orchestrator#113
strict per-tag serving build, discussion native-federation#176) and simplify
the version deep dive: Pools-style tooltips, statuses named after the row
actions, no per-copy bindings section.

### Status

DONE

UI 731, bridge 128, collector 150, guards 94 green; `build:extension`
passes; all four lab corpora validate. Checked in the dev panel on
`strict-uncovered`, `out-of-range-nonstrict`, `pool-showcase`,
`synthetic-multi-version` and `frankenstein-live`.

### Files Modified

- Lab (`angular-examples-lab`, local commit `f1c8fb8`, not pushed): scenario
  `strict-uncovered` — strict kit 1.2.0 led by the host, mfe1 ships
  secondaries the host's build lacks.
- `captures/strict-uncovered/` (new), `captures/manifest-nf-lab-placements.json`,
  `captures/README.md`, `scripts/lab-corpora.mjs`,
  `scripts/validate-lab-corpus.mjs` (predicate), fixture
  `strict-uncovered.fixture.ts` + `fixtures/index.ts`; the other placement
  fixtures only change their corpus-run header; `fixture-drift.spec.ts` count.
- Store: `derive-package-verdicts.ts` — `strictServing` (`serving.ts`
  `strictTagScopes`: lead of the root's share row at the tag, else the
  package's first); a strict share-row shipper whose own specifier resolves to
  its own copy is `own-copy` with a coverage reason; `merged` ignores own-copy
  builds; statuses `subpool` (copy for a `servedBy` subpool) / `skipped` (only
  skip rows, no copy) / `unknown`; `VersionBuild.unlistedChunks`.
  `verdict-model.ts` types.
- `shared/kit/tip.ts` + `tip.css` (new) — the Pools tooltip as a host
  directive (`TipHost`) and popup (`<nf-tip />`); Pools and Packages use it,
  every Packages `title` is a `data-tip`.
- Packages deep dive (`package-versions.*`, `packages-version-vm.ts`): Served
  from / Shipped by (chips, range and verdict in the tooltip; a pooled
  shipper links to its Pools row) / Used by; Entrypoints link to the Import
  Map; Files note `no chunk list`; the Mapped and Why rows and the Shipped by
  list are gone; the status cell has a tooltip; the range check is the
  always-shown "Compatibility" matrix (also one version, strict scope).
- Bindings per copy removed: `package-detail.*` renders only the no-copies
  line, unresolved bindings and diagnostics, and only when present;
  `packages-detail-vm.ts` lost the copy blocks, `packages-chunk-vm.ts`
  deleted, `copySourceDisplay` removed.
- Specs re-pinned (`derive-package-verdicts`, `packages-version-vm`,
  `packages`, `packages-view-model`, `pools`, `pools-cross-links`,
  `graph-model`); copy-block-only tests removed.
- Docs: `DEVELOPMENT.md`, `resolution-data-model.md`, `README.md` caption and
  alt; `docs/assets/readme/packages-{light,dark}.png` and
  `docs/assets/store/screenshot-2-packages.png` re-shot.

### Key Decisions

- **Strict fallback is observed, not only derived.** 4.8 stores nothing of the
  per-tag fallback, so a shipper counts as off the serving build only when the
  map resolves its own specifier to its own copy; pre-4.8 (stitched) strict
  captures keep their old reading.
- **`skipped` only for all-`skip` rows.** A tag with an unknown action or a
  copy no row explains is `unknown`, never a guessed status.
- **Reasons live where they are seen:** range conflicts in the Compatibility
  matrix, coverage gaps on the entrypoints, pool placements in the Pools tab
  (shipper chip link); the full reason stays in each shipper's tooltip.
- **Bindings per copy dropped after a fixture survey:** no fixture has
  untagged copies or diagnostics; only unresolved bindings and bundles
  without a chunk list were unique to it, both kept.
- **Screenshots** re-shot with Playwright against `ng serve` on
  `exported-playground-checkout`, `@angular/core` 22.0.8 open (README 1170×505
  @2×, store 1280×800 dark).

### Acceptance Coverage

- `strict-uncovered`: mfe1 `own-copy`, "not covered: the serving build of
  host lacks kit/table, kit/dialog", no `merged`; 4.6 `strict-scope` unchanged.
- Statuses, tooltips, links and the Compatibility matrix pinned in
  `packages-version-vm.spec.ts`, `packages.spec.ts`, `pools-cross-links.spec.ts`.

### Open Issues

- Remotes still uses native `title` tooltips.
- Discussion #176 ideas not done: show name-based package grouping, a
  flat/dense marker per build, remedy hints (keepAll / denseExternals).

### Git State

- Branch `packages-v48` (from `graph-v48`), committed as `task-1`.
