# Task 2: Isolated nodes and subpool edges say why

Status: DONE.

- `DependencyGraphNode.note`: a `scope-registration` copy reads `runs its own build — <reason>`
  (the source declaration's `PlacementReason`, phrased by `placementReasonText`); without a reason,
  the Remotes `isolated` wording; a private registration says it is a scoped external. Rendered in
  the node's `<title>` under the label.
- Anchored edges read `served by <owner>`: the copy's source remote is the subpool owner, so no
  claim or verdict lookup is needed; the owner's own edge reads `its own copy`. Revised after
  review: no pool or subpool wording and no reason on edges — that detail is the Pools tab's, and in
  the Graph it was noise on every edge of a pool. Remotes' `subpoolChipOf` stays as it was.

Acceptance: T2-AC-01 `fallback-uncovered` (model + DOM title), T2-AC-02
`pool-incompatible-nonstrict`, T2-AC-03 `pool-showcase` (member and owner edge, no pool wording), T2-AC-04 via the
existing all-tabs render over older captures.

Checks: `npm test` (UI 751, bridge 126, collector 149, guards 92), `build:extension`,
`check:panel-bundle` pass. Tooltips are native `<title>`s, no styling changed, so no light/dark
pass in the browser.
