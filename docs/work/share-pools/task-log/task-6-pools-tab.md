### Task

Conditional Pools tab: per explicit-tag pool a tag matrix, one outcome
line per remote read off the stored rows, membership notes, and orphan
tags — with the presentation contract written first.

### Status

DONE

All seven acceptance criteria pinned. UI 559, bridge 93, collector 82,
guards 68 green; typecheck clean. Verified live (headless Chromium on
`pool-tag-anchored`, `pool-tag-islanded`, `pool-tag-orphan`; nav on
`frankenstein-live` without Pools), no console errors.

### Files Modified

- `docs/work/share-pools/design/pools-explainer-mock.md` (new)
  — presentation contract (wording, layout, acceptance reference).
- `shared/store/resolution/pool-family-model.ts`,
  `derive-pool-families.ts` (new) — `PoolFamily` per tag pool: members
  (`followsPackage`, `unshared`, `scopedRemotes`), matrix cells, consumers
  (`outcome`, `servingBuilds`, `servesOthers`, `coherent`, `combination`,
  `sharedCombinationMixes`), `pending`. Published as
  `projection.poolFamilies` (same order as `tagPools`).
- `derive-grouping-facets.ts` exports `owningPackage`; projection model,
  builder, barrel, ingest wired; projection spec shape/barrel pins.
- `views/pools/pools-view-model.ts`, `pools.{ts,html,css}` (new);
  `app.routes.ts` (`/pools`), `app.{ts,html}` (conditional nav tab).
- Specs: `derive-pool-families.spec.ts`, `pools-view-model.spec.ts`,
  `pools.spec.ts`, `app.spec.ts` (two nav cases); graph seeds.

### Key Decisions

- **Serving build per (consumer, member), from the row:** `scope` → own
  build; `servedBy` → named build (itself when it is the anchor);
  `share`/`skip` → the `share` row's first participant (what the global
  mapping publishes).
- **Outcome ladder:** own copy (every row `scope`) → redirected (a
  `servedBy` onto another build) → one build → packages from different
  builds. `servesOthers` is orthogonal ("· mfe2 uses this build").
- **Coherence** mirrors `findTornRemotes`: some single build's own
  specifier → tag table ships the consumer's resolved combination; every
  build counts, `scope` rows included (a build is coherent by
  construction). Host consumers are not judged (`coherent: null`).
- **The one stated reason** is for redirected consumers: the combination
  the shared versions alone would have produced, only when no build ships
  it — a check on stored tags, not a guess at the gate.
- **Pending suppresses outcomes** (any member record `dirty`).
- **Presentation contract not separately reviewed:** the design was agreed
  in the planning conversation; the mock freezes that agreement. Flagged
  for the user.

### Acceptance Coverage

- **T6-AC-01 — passed:** `pooling-anchor` — formed by `family`, matrix
  host `2.0.0`/—, mfe1 tagged, mfe2 declared; host own build (host
  precedence), mfe1 used by mfe2, mfe2 redirected naming
  `conflict-lib@2.0.0 + extra@1.0.0`; footnote names host and mfe2.
- **T6-AC-02 — passed:** `pool-tag-islanded` — mfe1 own copy of every
  package; unshared ui-core note.
- **T6-AC-03 — passed:** `pool-tag-coherent` — one build for everyone, no
  notes, no findings.
- **T6-AC-04 — passed:** `pool-tag-orphan` — orphan line, nav tab shown.
- **T6-AC-05 — passed:** hand-built torn combination (derivation and VM),
  pending record, two-tags-one-pool, one-tag-two-pools and
  entrypoint-follows notes.
- **T6-AC-06 — passed:** no pool tags → no nav tab; `/pools` renders the
  empty line.
- **T6-AC-07 — passed:** vocabulary pin over four fixtures.

### Open Issues

- Plan's "requiredVersion next to the shared tag as plain inputs" is not
  rendered; the matrix already shows each remote's tag, and ranges live
  in Packages. Revisit if users ask why a remote was islanded.

### Context for Next Task

- Task 7: pool cards carry `data-pool-id` (= `TagPool.id`); chips carry
  `poolSelect` (= pool ID); graph pool clusters are keyed
  `dependencies:pool:<poolId>`.

### Git State

- Branch `share-pools`, committed as `task-6`.
