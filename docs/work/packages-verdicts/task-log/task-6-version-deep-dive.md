### Task

Per-version deep dive opened inline under its row: facts (built by,
mapped, resolves for), then Shipped by, Entrypoints and Files.

### Status

DONE (committed together with Task 5)

### Files Modified

- `views/packages/packages-version-vm.ts` — `DeepDiveVm`, `ShipperVm`,
  `RunnerVm`, `EntrypointVm`, `FileVm`, `TornGroupVm`, `diveOf`, `sriOf`.
- `views/packages/package-versions.{ts,html,css}` — open state per scope
  block (one version, all closed at first), click / Enter / Space toggle.

### Key Decisions

- **One open version per scope block**, kept in the component; closing
  happens by clicking the open row again.
- **Build headers only when merged:** a single build lists plainly;
  entrypoints and files group under remote headers when more than one
  build serves the version.
- **Torn at scale:** the elected version collapses its torn entrypoints
  into one `details` (summary "8 torn entrypoints"), grouped by filling
  version, largest first; a filling version marks each specifier and its
  heading says "fills torn entrypoints".
- **SRI** is one label in the Files heading — `SRI ✓` (green) only when
  every mapped entry file is hashed, else `SRI n/m` or `no SRI` (muted);
  the tooltip says chunk files carry no recorded integrity.
- **File names link to their URL in a new tab** and wrap, so a long hashed
  name never pushes the SRI label out of the pane.

### Acceptance Coverage

- **T6-AC-01** — `merged-entrypoints`: entrypoints and files grouped under
  host and mfe1; a single-build version has no headers.
- **T6-AC-02** — `torn-many`: torn group "8 torn entrypoints", groups
  1.2.0/mfe1 (5) and 1.3.0/mfe2 (3); the filling version marks its three.
- **T6-AC-03** — DOM: rows are tab stops, click and Enter toggle, one dive
  open per block, focus stays on the row.
