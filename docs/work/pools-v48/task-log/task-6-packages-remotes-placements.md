### Task

Align Packages and Remotes with the 4.8 placements: say why a declaration
runs its own copy or a subpool (pooled: the pool's reason; unpooled: the
package's serving build), apply the own-version exemption, and replace the
`anchored` chip.

### Status

DONE

UI 717, bridge 126, collector 149, guards 92 green; checked in the dev
server on `fallback-uncovered` (Packages deep dive).

### Files Modified

- Store: `verdict-model.ts` — verdict `subpool` (a `skip` with `servedBy`),
  `PlacementReason` (`scope: pool | package`, `build`, `miss` incl.
  `two-tags`, `storedCause`), `DeclarationVerdictRecord.reason` /
  `subpoolOf`, `PackageScopeVerdicts.servingBuild`.
  `derive-package-verdicts.ts` — `placementReasons`: pooled from the pool
  family consumer; unpooled recomputed against the stored `servingBuild`
  (`serving.ts` `surfaceOf` / `fallsBack`: strict range rejecting the
  serving tag, entrypoints outside the serving surface, two tags);
  `acceptsElected` / `acceptance` use `acceptsTag` (own tag exempt).
  `ingest.ts` derives pool families first and passes them in.
- `shared/placement-text.ts` (new) — cause labels and reason phrasing shared
  by Pools, Packages and Remotes (Pools vm now uses it).
- `shared/view-conventions.ts` — `CanonicalIndexes.verdictByDeclaration`.
- Packages: verdict notes for `own-copy` (reason, or the pre-4.8 strict
  reading) and `subpool`; a `subpool` version note; deep dive `Why` line per
  off-map shipper and a `not in <build>'s build` / `not on the global map`
  marker per entrypoint; Isolated filter note reworded; styles.
- Remotes: `anchored` chip → `subpool of <owner>` / `subpool owner` with the
  reason; `isolated` chip note carries the reason.
- Specs: package verdict reasons (fallback-uncovered, out-of-range strict,
  pooled coverage, subpool member, own-tag), Packages notes and dive, Remotes
  chips (4.8 pool-showcase case added; pooling-anchor re-pinned).

### Key Decisions

- **Unpooled reasons are judged on the stored rows** after the orchestrator
  scoped the fallbacks, so `fallsBack`'s "part on, part off the map" cannot be
  told apart afterwards; what remains (range, coverage, two tags) is
  reported, anything else reads as "the stored rows do not say why".
- **`two-tags` gets its own label** (`two versions`): it is a package-level
  fallback with no pool cause.
- **Reasons made visible, not only in tooltips:** after the visual check the
  deep dive gained the `Why` line and per-entrypoint markers.
- Pre-4.8 records keep the old strict-rejection note when the rows support
  it.
- **Not done:** the plan's "pool chip links to the remote's row in Pools"
  (the chip already links to the pool card; a row anchor needs a Pools
  `remote` query param) — left for Task 7 or later.

### Acceptance Coverage

- **T6-AC-01 — passed:** `fallback-uncovered` own-copy note and dive name
  `@nf-lab/kit/charts`, `/charts/legend`, `/date-picker` against host's
  build.
- **T6-AC-02 — passed:** `pool-uncovered-gap` own-copy note reads the pool
  coverage reason and contains no "strict".

### Context for Next Task

- Docs (Task 7): README / DEVELOPMENT / data model need the `subpool`
  verdict, `PlacementReason`, Remotes chips; screenshots of Pools and the
  Packages dive.

### Open Issues

- Pool chip → remote row link (see above).

### Git State

- Branch `pools-v48`, committed as `task-6`.
