# Task 1: Graph wording without "borrowed"

Status: DONE.

- Toolbar hint: `dotted edge = served by another remote`; a dotted edge's tooltip names the
  remote: `served by <source remote of the copy>` (+ `(it skips its own)` / `(its own is not
  selected)`), falling back to `EDGE_STATE_TEXT` when the copy has no evidenced source.
- Edge tooltip names each distinct mapping state in words (`EDGE_STATE_TEXT` in
  `graph-element-factories.ts`), joined with `; `. A graph-local table: Import Map's
  `STATE_LABELS` are single words for a claim row, not sentences about an edge.
- README, DEVELOPMENT and the spec legend drop "borrowed" and `self-filled`.

Acceptance: T1-AC-01 (only spec-file comments still say "borrow"), T1-AC-02 (`graph-model.spec.ts`,
`graph.spec.ts` pin the worded tooltips). Graph specs: 66 passed.
