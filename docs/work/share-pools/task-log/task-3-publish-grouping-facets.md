### Task

Publish the grouping facets the Graph group-by (Task 4) and the Pools tab
(Task 6) need, as canonical projection facts: per-copy share scope, tag
pool and bundles, plus the tag pools themselves and orphan tags —
derived in the resolution pipeline, never in views.

### Status

DONE

All four acceptance criteria pinned in the new
`derive-grouping-facets.spec.ts` (15 tests). UI suite 533, bridge 93,
collector 82, guards 68 — all green.

### Files Modified

- `shared/store/resolution/grouping-model.ts` (new) — `TagPool`,
  `OrphanPoolTag`, `PoolTagDeclaration`, `TagPoolDerivation`,
  `CopyGroupingFacets`, `TagPoolId`.
- `shared/store/resolution/derive-grouping-facets.ts` (new) —
  `deriveTagPools(evidence)` and
  `deriveCopyGroupingFacets(evidence, copies, bundleClaims, tagPools)`.
- `shared/store/resolution/projection-model.ts`,
  `build-canonical-projection.ts` — projection gains `tagPools`,
  `orphanPoolTags`, `copyGroupingFacets`; builder takes them as inputs.
- `shared/store/resolution/index.ts` — exports both derivations and the
  grouping types.
- `shared/store/ingest.ts` — wires the two derivations.
- Specs: new `derive-grouping-facets.spec.ts`;
  `build-canonical-projection.spec.ts` (pipeline helper, shape and
  barrel pins); graph `seededProjection` helpers (empty facets).
- `docs/work/share-pools/plan.md` — Task 3 rule wording.

### Key Decisions

- **Sibling list instead of a new copy field:** `copyGroupingFacets` is
  one entry per copy in `copies` order, so `ResolvedDependencyCopy` and
  every copy snapshot/spec stay untouched.
- **Pool threshold = 2 members** (orchestrator `buildPools`), not the
  plan's 2 members × 2 remotes: a single-remote pool is still a pool to
  the orchestrator (it only skips it in `poolFamily`). `remotes` is
  published so Task 6 can say "nothing to coordinate". Plan amended.
- **Pool name by `localeCompare`**, exactly as `groupByMembership`
  sorts; all other ordering uses the codebase's code-unit `compareText`.
- **Copy facets from the evidenced source only:** shared declaration →
  its external; ambiguous sources count only when every candidate is the
  same external (pool) / scope (scope); private and target-only copies
  get `null`. Consumer-side resolution domains are not used.
- **Equal registry keys merge** into one pool candidate: the orchestrator
  keys storage by package name.

### Review Focus

- **Behavior claims:** `pool-tag-coherent` → one pool `@nf-lab/ui-core`
  (members ui-core, ui-dom; tags `mfe1:ui`, `mfe2:ui`); `pool-tag-anchored`
  pool includes untagged mfe3 and the host in `remotes`; `pool-tag-orphan`
  → no pool, one orphan; `strict-scope` → none; V2 `pooling-anchor` →
  pool of conflict-lib + `/extra` (only mfe1 tags).
- **Read next:** `deriveTagPools` (union rules) and the T3-AC-04 block.

### Test Evidence

- `ng test devtools-ui --include '**/derive-grouping-facets.spec.ts'` —
  15/15; mutation check: making tag nodes remote-agnostic fails exactly
  "tags are remote-local" (restored).
- Full suites as listed under Status; `tsc -p tsconfig.app.json` and
  `tsconfig.spec.json` clean (pre-existing TS6059 rootDir noise only).

### Acceptance Coverage

- **T3-AC-01 — passed:** `scope-isolation` → `__GLOBAL__`,
  `strict-scope` → `strict`, `scoped` (private) → `null`. No capture has
  a named share scope; covered by the hand-built `ng22` case.
- **T3-AC-02 — passed:** coherent / orphan / strict as specified;
  islanded scoped copies keep their pool; bundles from bundle claims.
- **T3-AC-03 — passed:** determinism over three fixtures; existing
  projection determinism spec still green.
- **T3-AC-04 — passed:** remote-local tags, different tags joining
  through a shared member, entrypoint-follows-package, orphan + strict,
  scope separation and stable naming.

### Open Issues

- No real capture witnesses a named share scope (`shareScope: 'ng22'`);
  worth an nf-lab scenario before Task 4's share-scope grouping ships.

### Context for Next Task

- Task 4 reads `projection.copyGroupingFacets[i]` alongside
  `projection.copies[i]`; pool cluster label = `TagPool.name`, tooltip
  from `TagPool.tags`.

### Git State

- Branch `share-pools`, committed as `task-3`.
