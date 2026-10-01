### Task

Rewrite the Pools wording contract for the matrix, confirm the Stage 1
cross-links still hold, and update the PR description.

### Status

DONE

UI 606 green; the Pools and cross-link specs (27) pass unchanged.

### Files Modified

- `design/pools-explainer-mock.md` — rewritten for Stage 2: principles,
  layout (header, columns, bands, rows, cells), the cell-state table with
  colours and tooltips, the verdict table and cause labels, pending, the
  version warning, membership notes, acceptance reference on the 4.7.0
  fixtures.
- PR #1 description — Pools tab, v4.7 state, captures, and design-choice
  bullets updated for the matrix, the `semver` conflict rule and the
  corpus split (nf-lab on 4.7.0, v2 pinned to the preserved probe).

### Key Decisions

- **Graph tooltip left as is:** it builds its own `formed by: <remote>
  "<tag>"` line from the tag pool rather than reusing the Pools header, so
  the header's switch to `tag(s):` does not touch it.

### Acceptance Coverage

- **T12-AC-01 — passed:** every contract string matches one pinned in
  `pools-view-model.spec.ts` (verdict lines, band notes, tooltips,
  warnings, notes).
- **T12-AC-02 — passed:** `pools-cross-links.spec.ts` (Stage 1 T7-AC-01…03)
  green: Pools → Graph with the pool focused, the cluster's `explain` link
  back with the card selected, Package-detail chips, unknown `select`.

### Open Issues

- Commits from `cf46783` on (Stage 2 plan, tasks 8–12) and the playground
  commit `93a924e` are local; the PR description already describes them.

### Git State

- Branch `share-pools`, committed as `task-12`.
