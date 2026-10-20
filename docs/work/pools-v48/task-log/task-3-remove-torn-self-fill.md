### Task

Remove torn, self-fill and mixed-build verdicts: orchestrator 4.8 never
borrows an entrypoint from another build. Pre-4.8 pages must still render.

### Status

DONE

UI 689, bridge 126, collector 149, guards 92 green; all four lab corpora
validate; `build:extension` passes.

### Files Modified

- Store: `claims-model.ts` / `derive-declaration-claims.ts` — `self-filled`
  mapping state gone; `copies-model.ts` / `materialize-resolved-copies.ts` —
  `self-filled-source` role gone; `verdict-model.ts` /
  `derive-package-verdicts.ts` — `TornEntrypoint`, `torn`, `tornOf` gone,
  `VersionBuild.fromShareRow` added, `merged` counts share-row builds only;
  `pool-family-model.ts` / `derive-pool-families.ts` — `coherent`,
  `combination`, verdict `torn` gone; `bundle-claims-model.ts` comment.
- Views: Packages (torn mark, filter, banner, `fills torn` note, torn
  entrypoint chips and group, `self-filled` chip and role note, CSS); Remotes
  and Import Map `self-filled` chips/labels; Pools `torn` tone and the
  `torn`/`unshared` cause labels (now shown raw).
- New `views/tabs-render.spec.ts` — every tab's vm for every fixture, every
  package and remote selected, plus a clone with 4.7's `torn`/`unshared`.
- Fixtures/captures: `self-fill` (4.6) deleted (capture, fixture, v2
  manifest entry, corpus list, validator predicate); `torn-many` renamed
  `fallback-uncovered` in the lab (local commit `a59ce41`) and all 17 lab
  scenarios re-recorded (runstamp `20261020T085859Z`; builds are
  deterministic, only timestamps changed).
- Specs moved off `self-fill` onto `dense-chunking-only` (same flat
  `/extra` shape) or `pooling-anchor`; self-fill claim specs now pin how a
  pre-4.8 self-fill reads (`own-selected` / `not-selected`, role
  `unclassified`).
- Docs: `README.md`, `docs/DEVELOPMENT.md`, `docs/resolution-data-model.md`,
  `captures/README.md`; a 4.8 note on the resolution-model and graph-view
  specs (dated design records, not rewritten).

### Key Decisions

- **`merged` kept, narrowed:** 4.8 still assembles a version from several
  `share` copies when no serving build is recorded (docs "Copies of one
  version"); a scoped copy of the shared tag is no longer counted. On the 4.8
  corpus nothing is merged.
- **`mixed-builds` kept for now:** on 4.8 a global remote can legitimately
  run on several builds (the winner plus extensions — `pool-unshipped`); it is
  no tear. Task 4 replaces the outcomes with global / subpool / own-build.
- **`partly-mapped` kept:** on 4.8 it marks a tag only a subpool's build
  serves; its deep-dive text now says so ("only for the remotes its build
  serves").
- **Stored values 4.8 removed render raw**, not mapped to a 4.8 cause.

### Acceptance Coverage

- **T3-AC-01 — passed:** `grep -riE 'torn|self.?fill' projects/` finds only
  pre-4.8 compatibility comments and spec names.
- **T3-AC-02 — passed:** full suite green.
- **T3-AC-03 — passed:** `tabs-render.spec.ts` (42 fixtures, including the
  4.6 corpus and the live v4 page, plus the 4.7-cause clone).

### Context for Next Task

- Task 4 still has the pre-4.8 pool derivation: `not-shared` for subpool
  members the host does not ship, the guessed isolation `cause`, the
  hard-coded "would mix builds", `mixed-builds`.
- `MemberRow.specifiers` stays for Task 4's coverage check.

### Open Issues

- None.

### Git State

- Branch `pools-v48`, committed as `task-3`.
