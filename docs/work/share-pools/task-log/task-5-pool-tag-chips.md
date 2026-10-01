### Task

Surface each declaration's explicit `pool` tag as a chip in Package
detail and Remote detail rows, flagging tags that joined nothing.

### Status

DONE

T5-AC-01 pinned by VM specs in both views. UI 542, guards 68 green;
typecheck and Prettier clean.

### Files Modified

- `shared/pool-chip.ts` (new) — `PoolChipVm` and `poolChipOf(declaration,
  projection)`; outcomes indexed once per projection (`WeakMap`).
- `shared/view-conventions.ts` — `CanonicalIndexes.projection`.
- `views/packages/packages-detail-vm.ts`, `package-detail.{html,css}` —
  `pool` on consumer rows (shared, foreign-declared; private rows null)
  and unresolved rows; chip after the declared range.
- `views/remotes/remotes-detail-vm.ts`, `remote-detail.{html,css}` —
  `pool` on provides blocks (incl. secondaries), consumes rows and
  unresolved rows; chip after the scope chip.
- Specs: `packages-view-model.spec.ts`, `remotes-view-model.spec.ts`.

### Key Decisions

- **No chip for an untagged declaration** — never "no pool": auto-pooling
  leaves no trace, so absence of a tag says nothing about pooling.
- **Three notes:** member of pool `<name>` (+ "nothing to coordinate" for
  single-remote pools), orphan ("likely a typo or a missing sibling",
  warning styling), or strict-scope tag ("the strict share scope is
  never pooled").
- **`poolSelect` = the pool ID** (already scope-qualified) — Task 7 uses
  it as `/pools?select=`; the plan's `<scope>|<poolId>` would repeat the
  scope.
- **`servedBy` notes unchanged:** the plan asked to name the anchored
  declaration's pool tag there; the chip on the same row already does.

### Acceptance Coverage

- **T5-AC-01 — passed:** `pool-tag-coherent` — ui-core and ui-dom rows
  of mfe1 and mfe2 carry `pool: ui` (member of `@nf-lab/ui-core`) in
  Packages, and in Remotes (mfe1 provides, mfe2 consumes);
  `pool-tag-anchored` mfe3 rows carry none; `pool-tag-orphan` mfe1's
  ui-core chip is an orphan, mfe2's untagged row has none.

### Context for Next Task

- Task 6 reuses `TagPool` / `OrphanPoolTag` and links chips to
  `/pools?select=<poolSelect>` in Task 7.

### Git State

- Branch `share-pools`, committed as `task-5`.
