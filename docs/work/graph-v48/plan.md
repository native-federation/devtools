# Native Federation DevTools — Orchestrator 4.8: Graph Says Why

Branch scope: graph-v48 (stacked on pools-v48, PR #6)
Upstream verified against: orchestrator v4.8.0, native-federation-core v4.8.0, discussion native-federation#176.

Goal: the Graph tab already draws 4.8 correctly — every copy is one build, a fallback (`scope` row)
is a dashed node, a remote on another remote's build has a dotted edge. What it does not do is say
**why**, and its wording predates 4.8: "borrowed" is now the discussion's word for stitching (taking
an entrypoint from another build), which 4.8 never does, and the edge tooltip shows raw mapping
states (`anchored`, `not-selected`). This scope brings the Graph in line with Packages and Remotes.

Hard constraints (inherited): views consume only `CanonicalResolutionProjection` and derive no domain
facts; reasons come from the existing `PackageScopeVerdicts` (`DeclarationVerdictRecord.reason`,
`subpoolOf`) and are phrased by `shared/placement-text.ts`, never re-derived in the view. The node
and edge set never changes — only tooltips and hint text.

Not a change: the Build grouping's `a + b` label (one copy from several builds) no longer occurs on
4.8 pages but stays for older captures. The core 4.8.0 changes (`strictImports`, wildcard `.patch()`,
tsconfig mappings, secondary version stamps) are build-time and do not reach the Graph.

## Task 1: Graph wording without "borrowed"

Status: DONE (`e6b56f6`). Amendment: the edge-state table is graph-local (`EDGE_STATE_TEXT`);
Import Map's labels are single words for a claim row.

### Instructions

- Toolbar hint (`graph.html`): `dotted edge = borrowed` → `dotted edge = another remote's copy`.
- Edge tooltip (`edgeOf`): the distinct mapping states in words, not raw values — reuse one label
  table shared with Import Map's `STATE_LABELS` if it fits, else a graph-local one.
- Docs: `README.md` and `docs/DEVELOPMENT.md` Graph paragraphs; the spec legend table
  (`docs/specs/native-federation-graph-view.md` §channels) drops `self-filled` and "borrowed".

### Acceptance

- **T1-AC-01** — `grep -rn borrowed projects/devtools-ui/src/app/views/graph` finds only test-file comments.
- **T1-AC-02** — no edge tooltip contains a raw state value (`not-selected`, `own-selected`, `anchored`).

## Task 2: Isolated nodes and subpool edges say why

Status: DONE. Amendment: T2-AC-04 is covered by the existing all-tabs render spec over the
pre-4.8 corpus; no new pin.

### Instructions

- `DependencyGraphNode` gets a `note: string | null`, rendered in the node's `<title>` after the label:
  - `scope-registration` copy: `runs its own build — <placementReasonText>`; without a reason, the
    Remotes `isolated` note (`registered with action scope`).
  - `private-registration` copy: `private registration — a scoped external, not shared`.
  - every other copy: null.
  The reason is the copy's source declaration verdict (`copy.source.declarationId` →
  `packageScopeVerdicts[].declarations`), the same lookup Remotes uses.
- An edge whose relation is `anchored` names the subpool: `runs <owner>'s build in a subpool — <reason>`,
  from the consumer's declaration verdict (`relation.claimIds` → claim `declarationId` → verdict
  `subpoolOf`, `reason`), worded as Remotes' `subpoolChipOf`. Move that wording into
  `shared/placement-text.ts` so both views share it.

### Acceptance

- **T2-AC-01** — `fallback-uncovered`: the falling-back remote's dashed node names the missing entrypoints.
- **T2-AC-02** — `pool-incompatible-nonstrict`: the isolated node names the range, tag and strictness.
- **T2-AC-03** — `pool-showcase`: the `ui-dom` edge of a subpool member names `admin`'s build and its reason.
- **T2-AC-04** — a pre-4.8 capture renders without a reason and without throwing; full UI suite green.

### Key Locations

- `views/graph/{graph-types,graph-element-factories,graph-model,graph.html}.ts`, `shared/placement-text.ts`,
  `views/remotes/remotes-detail-vm.ts`, `RES/verdict-model.ts`

## Out of scope

- A badge or colour for fallback copies beyond the existing dashed border.
- Counting duplicate singletons per page (the denatys case in #176): a Packages/Pools concern.
