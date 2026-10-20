# Task 2: Isolated nodes and subpool edges say why

Status: DONE.

- `DependencyGraphNode.note`: a `scope-registration` copy reads `runs its own build — <reason>`
  (the source declaration's `PlacementReason`, phrased by `placementReasonText`); without a reason,
  the Remotes `isolated` wording; a private registration says it is a scoped external. Rendered in
  the node's `<title>` under the label.
- Anchored edges: `subpoolWhereText(subpoolOf, participant)` plus the reason, from the consumer's
  anchored claim → declaration verdict. `subpoolWhereText` moved from Remotes' `subpoolChipOf` into
  `shared/placement-text.ts`; Remotes uses it unchanged.

Acceptance: T2-AC-01 `fallback-uncovered` (model + DOM title), T2-AC-02
`pool-incompatible-nonstrict`, T2-AC-03 `pool-showcase` (member and owner edge), T2-AC-04 via the
existing all-tabs render over older captures.

Checks: `npm test` (UI 751, bridge 126, collector 149, guards 92), `build:extension`,
`check:panel-bundle` pass. Tooltips are native `<title>`s, no styling changed, so no light/dark
pass in the browser.
