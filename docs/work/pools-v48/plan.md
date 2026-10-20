# Native Federation DevTools — Orchestrator 4.8: Drop Torn, Explain Pool Placements

Branch scope: pools-v48 (from main)
Upstream verified against: orchestrator `37806bda` (v4.8.0, 2026-10-17), native-federation-core v4.8.0 / 4.8.1 `14e93f9`, website `c506964` ("correct the orchestrator version resolver for 4.8.0"), discussion native-federation#176.

Goal: (a) remove every torn / self-fill / mixed-builds notion, because 4.8 never borrows an entrypoint from another build (no stitching), and (b) make the Pools tab answer **why** each remote landed where it did: the global build, a **subpool** (another remote's build), or **its own build** — and for the last two, whether it was an **invalid range** (incompatible: which member, which tag, strict or not) or **missing entrypoints** (uncovered: which specifiers the elected build lacks, or `unshipped`).

Hard constraints (inherited): views consume only `CanonicalResolutionProjection` and derive no domain facts; the collector stays passive; wording is resolution-honest. Placement is **read** from stored rows; reason **evidence** is derived against the stored winner and labelled as derived. A stored `poolCause` is never overridden — if derived evidence disagrees, the reason is shown as "unexplained", not guessed.

What 4.8 persists vs only logs (source-verified, governs every task):

| Fact | Persisted (4.8.0) | Only logged / computed |
|---|---|---|
| Placement | `skip` + `servedBy: <owner>` = subpool (owner names itself); `scope` + `poolCause` = own build; `share`/`skip` w/o `servedBy` = global (`records.ts:187-198`) | — |
| Cause | `poolCause: 'incompatible' \| 'uncovered'` (`version.contract.ts:23`; `torn`/`unshared` removed) | strict vs non-strict, member + tag, `gap` specifier, `unshipped` (`election.ts:20-38`, warn at `pool-shared-externals.ts:131-152`) |
| Elected build | `SharedExternal.poolWinner`, `servingBuild` (`external.contract.ts:12-22`) | round-1 ranking |
| Pending | `dirty` on pooled members after a runtime load; `cache-state.undecidedScopes` | — |
| Unpooled fallback | `scope` row + `servingBuild`, **no cause** | `fallsBack` rules (`serving.ts:276-299, 349-414`) |
| Strict scope per-tag fallback | nothing (clones in `strictTagScopes`, `serving.ts:123-154`) | — |
| Own-tag range | a copy's own tag is always accepted, even if `requiredVersion` excludes it (`compatibility.ts:117-123`) | warn in `store-remote-entry.ts:109-117` |

Notes: 4.8 clears any 4.7-shaped cache on first init (`cache-state.version` stamp), so a page never mixes shapes. 4.8.1 core drops CSS/assets from `chunks` — no impact beyond fixtures.

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

## Task 1: Collect the 4.8 evidence

### Instructions

- Add `poolWinner` and `servingBuild` (per external) to the passive probe
  schemas, `runtime-schema.ts`, storage probe, snapshot mapper and DTO
  (`snapshot-v1.ts`); copy only when strings, as with `poolName`.
- Read the new `cache-state` key (`{ version, undecidedScopes }`) in the
  storage probe and the descriptor walk; publish it on `runtimeSource`.
- Bump the probe/storage stamps; normalize into `RES/model.ts` (null when
  absent, never inferred).

### Acceptance

- **T1-AC-01** — a 4.8 capture round-trips `poolWinner`, `servingBuild`, `undecidedScopes`; 4.7 fixtures map them to null unchanged.
- **T1-AC-02** — fixture-drift and privacy guards pass.

### Key Locations

- `projects/collector/src/lib/{passive-probe,runtime-schema,storage-probe,snapshot-mapper}.ts`, `projects/devtools-bridge/src/lib/snapshot-v1.ts`, `RES/normalize-registry-evidence.ts`

## Task 2: Witness captures on 4.8.0

### Instructions

- Re-record the `nf-lab` and `nf-lab-verdicts` corpora on orchestrator
  4.8.0 (new manifests; keep the 4.7 manifests for regression).
- New lab scenarios, one fact each:
  - `pool-subpool` — two remotes share a build the host's doesn't cover; one owns the subpool, one is served by it.
  - `pool-incompatible-strict` / `pool-incompatible-nonstrict` — a range rejects a member tag of the elected build.
  - `pool-uncovered-gap` — the elected build lacks a secondary entrypoint a remote imports (e.g. `*/rxjs-interop`).
  - `pool-unshipped` — every specifier is mapped, but no single build ships the combination.
  - `fallback-unpooled` — unpooled package, remote falls back on coverage (`servingBuild` set, no cause).
  - `own-tag-out-of-range` — `requiredVersion` excludes the copy's own tag.
- Validate predicates in `scripts/validate-lab-corpus.mjs`; derive fixtures.

### Acceptance

- **T2-AC-01** — the task log names, per reason (subpool, incompatible strict/non-strict, uncovered gap, unshipped, unpooled fallback, own-tag), its witnessing fixture.
- **T2-AC-02** — the 4.8 re-record of `torn-many` shows the would-be-torn remotes in `scope` rows (no self-fill) — the witness that torn is gone.

### Key Locations

- `captures/`, `scripts/{lab-corpora,validate-lab-corpus,build-lab-manifest,derive-fixtures}.mjs`, `captures/README.md`

## Task 3: Remove torn, self-fill and mixed builds

### Instructions

- Store: drop `ClaimMappingState 'self-filled'`, copy role
  `self-filled-source`, the self-fill `source-only` bundle path,
  `TornEntrypoint`, `PackageScopeVerdicts.torn`, `tornOf`; re-check whether
  `VersionStatus 'partly-mapped'` still has a witness without fills (drop if not).
- Pools: drop verdict `torn`, `PoolConsumerOutcome 'mixed-builds'`,
  `coherent` / `combination`, the `torn` / `unshared` cause labels.
- Views: Packages torn mark/filter/banner/groups/"fills N torn entrypoints";
  Remotes/Import Map self-filled chips and labels; Pools torn tone.
- 4.7 pages: no torn support kept. They must only not crash: show the
  existing pre-version banner ("recorded before 4.8; explanations assume
  4.8"); claims that used to be self-filled fall to `unknown`; stored
  `poolCause` values outside `incompatible | uncovered` render verbatim.
- Fixtures: delete `self-fill` and 4.7 `torn-many` (captures, fixtures,
  corpus entries, validator predicates); the 4.8 re-record from T2 replaces `torn-many`;
  update specs, `README.md:37`, `DEVELOPMENT.md`, `resolution-data-model.md`,
  `specs/native-federation-resolution-model.md` (RM-CL-11), devtools-v2 spec.

### Acceptance

- **T3-AC-01** — `grep -riE 'torn|self-fill|mixed-builds' projects/` finds nothing outside 4.7 regression notes.
- **T3-AC-02** — every remaining fixture renders without a torn/self-filled artefact; full suite green.
- **T3-AC-03** — every remaining 4.7 (and older) fixture renders every tab without throwing, with the pre-4.8 banner.

### Key Locations

- `RES/{claims-model,derive-declaration-claims,copies-model,materialize-resolved-copies,bundle-claims-model,verdict-model,derive-package-verdicts,pool-family-model,derive-pool-families}.ts`, `views/{packages,remotes,import-map,pools}/`

## Task 4: Derive pool placements and reasons

### Instructions

- New store derivation per (scope, pool, remote) → `PoolPlacement`:
  - `global` | `subpool { owner }` | `self { cause }` — read from rows only.
  - `reason` (derived against the elected build = `poolWinner`'s specifier→tag
    table), mirroring `missOf` precedence (`election.ts:325-344`):
    1. `range { member, tag, range, strict }[]` — every rejection, strict first;
    2. `coverage { missing: Specifier[] }` — entrypoints the remote imports that the elected build doesn't ship (all, not just the first);
    3. `coverage { unshipped: true }` — mapped, but no single build ships the combination;
    4. `none` (subpool owner the global map would serve).
  - `consistent: boolean` — derived reason agrees with stored `poolCause`; otherwise the view says "unexplained".
- Range check applies the own-tag exemption (semver-equal tag always accepted).
- For subpools, also record what the owner's build covers that the winner's does not (why the owner could host it).
- Publish on the projection; replace `PoolVerdict.cause` guessing
  (`derive-pool-families.ts:287-293`) and the invented "would mix builds".

### Acceptance

- **T4-AC-01** — each T2 scenario yields its expected placement + reason; `consistent` is true on all.
- **T4-AC-02** — a hand-built record with stored `uncovered` but only a range rejection derives `consistent: false`.
- **T4-AC-03** — `own-tag-out-of-range` reports no range reason.

### Key Locations

- `RES/derive-pool-families.ts`, `RES/pool-family-model.ts`, `RES/projection-model.ts`, `shared/store/semver-range.ts`, orchestrator `src/lib/core/1.domain/pooling/{election,rules,records}.ts`

## Task 5: Pools tab — show why

### Instructions

- Card header: elected build ("Build of X", from `poolWinner`), host-led or not;
  pending chip when `dirty` or scope in `undecidedScopes`.
- Bands: "Global · build of X", "Subpool · build of Y" (owner marked),
  "Own build" per isolated remote.
- Per-remote reason line under its row:
  - range: "`@angular/core` requires `^17`, elected ships `18.2.0` · strict";
  - coverage: "elected build lacks `@angular/core/rxjs-interop`, `…` (2)";
  - unshipped: "every entrypoint is mapped, but no build ships this combination";
  - unexplained: stored cause shown verbatim with "not reproducible from storage".
- New cell states: `gap` (member the remote imports, absent from the elected
  build) and `rejected` (range rejects the elected tag; strict/non-strict in the
  tooltip, declared vs served tag from `declaredTag`).
- Verdict lines rewritten per placement kind with counts; drop the
  hard-coded cause. Coverage summary per card: "elected build ships N/M
  entrypoints the pool's remotes import".
- Update `design/pools-explainer-mock.md` first; keep the forbidden-vocabulary pins.

### Acceptance

- **T5-AC-01** — `pool-subpool`: subpool band names its owner and each member's reason.
- **T5-AC-02** — `pool-uncovered-gap`: the missing secondary appears as a `gap` cell and in the reason line.
- **T5-AC-03** — `pool-incompatible-*`: the rejecting cell is `rejected`, tooltip names range, tag, strictness.
- **T5-AC-04** — cells stay keyboard-reachable with aria-labels carrying the reason.

### Key Locations

- `views/pools/{pools-view-model.ts,pools.html,pools.css,pools.spec.ts}`, `docs/work/share-pools/design/pools-explainer-mock.md`

## Task 6: Align Packages and Remotes with placements

### Instructions

- Packages: a `scope` row no longer always says "strict remote rejects";
  use the placement reason when pooled, and for unpooled fallbacks derive the
  `fallsBack` reason against `servingBuild` (coverage gap, ships two tags,
  strict rejection, off-surface specifier). Show `servingBuild`.
- Out-of-range verdict applies the own-tag exemption.
- Remotes: replace the `anchored` chip with "subpool of X" + reason;
  isolated chip carries the reason.
- Pool chip links to the remote's row in Pools.

### Acceptance

- **T6-AC-01** — `fallback-unpooled` explains the fallback as a coverage gap naming the specifiers.
- **T6-AC-02** — pooled isolations never read "strict rejects" unless the reason is a strict range.

### Key Locations

- `views/packages/{packages-version-vm,packages-row-vm,packages-view-model}.ts`, `views/remotes/remotes-detail-vm.ts`, `shared/pool-chip.ts`, `RES/derive-package-verdicts.ts`

## Task 7: Docs and assets

### Instructions

- `README.md`, `docs/DEVELOPMENT.md`, `docs/resolution-data-model.md`
  (placement model, derived vs stored, 4.8 fields), link the orchestrator's
  `docs/version-resolver.md` "What pooling stores" section; refresh screenshots.

### Acceptance

- **T7-AC-01** — no doc mentions torn/self-fill except a 4.7 compatibility note.

## Out of scope

- Strict-scope per-tag fallbacks (not stored; recompute later from `strictTagScopes` rules).
- Reading orchestrator log lines (gap/strict detail is re-derived instead).
- A page-wide "no tear" import walk (the orchestrator's test oracle `page-graph.ts`).
- Reason for runtime-load decisions (`update-cache.ts` `Decision`) beyond the resulting rows.
