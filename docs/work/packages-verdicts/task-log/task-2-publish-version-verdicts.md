### Task

Publish the resolver's decisions per (share scope, package) on the
canonical projection: the elected version, every registered version with
its status, and a verdict per declaration.

### Status

DONE

UI 619 (+9), bridge 105, collector 102, guards 81 green.

### Files Modified

- `shared/store/resolution/verdict-model.ts` (new) — `PackageScopeVerdicts`,
  `VersionVerdict`, `DeclarationVerdictRecord`, `DeclarationVerdict`,
  `VersionStatus`.
- `shared/store/resolution/derive-package-verdicts.ts` (new) +
  `derive-package-verdicts.spec.ts`.
- `projection-model.ts`, `build-canonical-projection.ts` — new
  `packageScopeVerdicts` field; `index.ts` barrel export.
- `shared/store/ingest.ts` — wiring.
- Spec fallout: `build-canonical-projection.spec.ts` (pipeline mirror,
  pinned key list, barrel list), `views/graph/graph.spec.ts`,
  `graph-model.spec.ts` (projection literals).

### Key Decisions

- **Verdicts read the stored action first.** `share` → `provides` for the
  row's first participant (the file the mapping publishes, the rule
  `derive-pool-families.ts` already uses), `same-version` for the rest;
  `scope` → `own-copy`. Only `skip` rows are re-checked with
  `satisfiesRange`: accepted → `reuses-shared`, rejected and not strict →
  `out-of-range`. A strict `skip` that rejects, a missing election or an
  unreadable range is `unknown` — the resolver rules don't explain it, so
  no verdict is invented.
- **No `strict-exact` verdict** (the plan listed one): in the `strict`
  scope every row is `share`, so `provides` / `same-version` already
  says it; `electedTag: null` marks the scope.
- **`runsTag` from claims:** the copy the package's own specifier resolves
  to (else any resolving claim), so out-of-range shows the elected tag and
  own-copy the remote's own.
- **No shared semver helper extracted:** pools call `satisfiesRange`
  inline once; the T2-AC-05 spec pins the two views to the same answer
  instead.
- **Anchored `skip` rows** (pooling `servedBy`) read as `reuses-shared`
  when the range accepts; the anchor itself stays the existing consumer
  annotation. Revisit in Task 5 if the versions table needs to say it.

### Acceptance Coverage

- **T2-AC-01** — `out-of-range-nonstrict`: mfe1 `out-of-range`, runs
  2.0.0; the only one in the capture.
- **T2-AC-02** — `scope-isolation`: one `own-copy`, its version `scoped`.
- **T2-AC-03** — `strict-scope`: `electedTag` null, all versions
  `shared`, declarations `provides` / `same-version`.
- **T2-AC-04** — a synthetic unreadable range on mfe1 yields `unknown`,
  `acceptsElected: null`.
- **T2-AC-05** — `acceptsElected` equals the Pools cell's `acceptsShared`
  on every cell of six pool fixtures (>20 cells), and no conflict cell
  reads `reuses-shared`.
- Extra: `torn-many` statuses (`partly-loaded` filling versions),
  `merged-entrypoints` (one shared version, two copies), `multi-scope`
  (per-scope elections).
