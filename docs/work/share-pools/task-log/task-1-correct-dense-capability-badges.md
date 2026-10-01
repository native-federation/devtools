### Task

Correct the dense capability badges. The "dense externals" capability
fired on participants carrying `bundle`, but core writes `bundle` only
under `features.denseChunking` (`bundle-shared.ts:283`,
`bundle-exposed-and-mappings.ts:160`), so the badge presented a second
denseChunking facet under the denseExternals name. Fold the `bundle`
facet into dense chunking and replace dense externals with a
"multi-entry registrations" capability that names both possible
producers and claims neither.

### Status

DONE

All three acceptance criteria are pinned by new specs; the full
repository suite is green (UI 508, bridge 79, collector 75, guards 53).

### Files Modified

- `projects/devtools-ui/src/app/views/remotes/remotes-detail-vm.ts`
  (modified) — `capabilitiesOf`: dense chunking fires on either
  `shared-chunks` groups of this emitter or own registrations with a
  bundle, the note joins whichever facets were found; own registrations
  now include private (scoped-externals) registrations. New
  `multi-entry registrations` capability when an own registration has
  more than one entrypoint candidate. The T8.5 JSDoc is replaced by a
  three-line `//` comment pointing at the plan's persisted-evidence table.
- `projects/devtools-ui/src/app/shared/store/derived-model.ts`
  (modified) — `RemoteBadges.denseExternals` → `multiEntry` (rule
  `multi-entry-map`, added to `DerivationRule`); `denseChunking.rule`
  is `'shared-chunks-lists' | 'participant-bundle'` (first facet found).
- `projects/devtools-ui/src/app/shared/store/derivations.ts` (modified)
  — `deriveBadges` mirrors the view logic on the legacy rows
  (`servedFiles.length > 1` for multi-entry).
- `projects/devtools-ui/src/app/views/kit-demo.html` (modified) — demo
  badge renamed to `multi-entry registrations`.
- Specs: `remotes-view-model.spec.ts` (live host expectation + new
  `dense capabilities (share-pools T1)` block),
  `remotes.spec.ts` (DOM capability words), `derivations.spec.ts`
  (badge matrix, new multi-entry case, rule matrix).

### Files Read (Context Only)

- Upstream (shallow clones in the session scratchpad):
  `native-federation-core@28a037d` — `bundle-shared.ts`,
  `bundle-exposed-and-mappings.ts`, `assemble-federation-info.ts`
  (`densifyExternals`), `with-native-federation.ts` (both flags default
  `false`); `orchestrator@ccd98f4` — `version.contract.ts` (every
  registration normalized to `entries`), `mode.config.ts` /
  `docs/config.md` (`convertFlatSharedInfo` default `false`; core v4.3.0
  emits dense natively).
- `projects/devtools-bridge/src/lib/fixtures/` — `pooling-anchor`,
  `non-dense`, `synthetic-dense-entries`, `frankenstein-live` (bundle /
  entries survey for the acceptance fixtures).
- `shared/store/resolution/model.ts` — `ParticipantDeclaration`,
  `PrivateRegistration` (`bundle`, `entrypointCandidateIds`).

### Key Decisions

- **One dense-chunking capability, two facets:** chunk lists and
  `bundle` are the same build flag; showing them as two badges was the
  defect. The note lists the facets found, so the evidence stays visible.
- **Multi-entry names both producers:** build-side
  `features.denseExternals` and host-side `feature.convertFlatSharedInfo`
  produce the identical stored shape; the note says the registry does not
  record which.
- **Reversed an earlier rule deliberately:** `derived-model.ts` said
  multi-key `entries` "must not be the marker" (for dense externals,
  when no capture showed it). It is now the marker of its own, honestly
  named capability — not of a build flag.
- **Private registrations included** in both facets: core sets `bundle`
  on every external under denseChunking, and dense `entries` applies to
  non-singleton externals too; the old code ignored them.
- **Legacy `remoteBadges` updated, not removed:** no view reads it, but
  removal belongs to the single-truth cutover (resolution-model Task 11).

### Review Focus

- **Behavior claims:** `frankenstein-live` host now shows one dense
  chunking line naming both facets and no multi-entry line (v4 `file`
  spelling); `pooling-anchor` mfe1/mfe2 show dense chunking only;
  `synthetic-dense-entries` mfe-dense shows multi-entry only.
- **Read next:** `capabilitiesOf` in `remotes-detail-vm.ts` and the new
  spec block in `remotes-view-model.spec.ts`.

### Test Evidence

- `npx ng test devtools-ui --watch=false` — 37 files / 508 tests green.
- `npx ng test devtools-bridge --watch=false` — 79 green;
  `npm run test:collector` — 75 green; `npm run test:guards` — 53 green.
- `prettier --check` clean on all changed files (an unrelated
  pre-existing rewrap in `kit-demo.html` was left as-is).
- Pre-existing `graph.spec.ts` cap-message timeout (also failing on
  `main`) fixed separately in `b0d9c08`.

### Acceptance Coverage

- **T1-AC-01 — passed:** `pooling-anchor` mfe1/mfe2 → dense chunking,
  no multi-entry.
- **T1-AC-02 — passed:** `synthetic-dense-entries` mfe-dense →
  multi-entry note citing both flags verbatim.
- **T1-AC-03 — passed:** every `non-dense` remote shows neither.

### Open Issues

- The T8.5 task log (`docs/work/resolution-model/task-log/task-8.5-…`)
  still records the old "both dense facets cite the same flag" rationale
  as history; this log supersedes it.

### Context for Next Task

- Task 2 (witness captures) needs the playground repo
  (`nf/playground`, `lab/v2-scenarios`) and `scripts/lab-capture-dump.js`;
  `dense-externals-only` should replace `synthetic-dense-entries` as the
  real multi-entry witness.

### Git State

- Branch `share-pools` (from `main` at `7ec977a`); `b0d9c08`
  graph spec fix; this task committed as `task-1`.
