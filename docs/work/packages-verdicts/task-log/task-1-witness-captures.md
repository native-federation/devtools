### Task

Witness the Packages tab's new findings (out of range, torn at scale,
merged, multi-scope) with real lossless captures and derive SnapshotV1
fixtures from them.

### Status

DONE

Four scenarios captured on orchestrator 4.7.0 with zero collection errors;
all three corpora validate. UI 610, bridge 105, collector 102, guards 81
green. Existing fixtures re-derived byte-identical.

### Files Modified

Playground (`native-federation/playground`, branch
`lab/grouping-and-pooling`, local commit `5b67e9c`, not pushed; recorded
from a worktree at `../angular-examples-lab` so the main checkout stays on
`main`):

- `lab/packages/kit@{1.2.0,1.3.0,1.4.0,2.0.0}/` — fake `@nf-lab/kit` with
  different secondary entrypoint sets per version.
- `lab/scenarios/{out-of-range-nonstrict,torn-many,merged-entrypoints,multi-scope}.mjs`,
  `lab/README.md`.

Devtools:

- `scripts/lab-corpora.mjs` — third corpus `nf-lab-verdicts`
  (`manifest-nf-lab-verdicts.json`).
- `scripts/validate-lab-corpus.mjs` — evidence predicates for the four
  scenarios (`KIT`, `kitRows` helpers).
- `captures/<4 scenarios>/20261001T164530Z.json` (+ console logs),
  `captures/manifest-nf-lab-verdicts.json`, `captures/README.md` section.
- `projects/devtools-bridge/src/lib/fixtures/<4>.fixture.ts` (generated)
  + `index.ts` registration.
- `projects/collector/src/lib/fixture-drift.spec.ts` — 22 → 26 derived fixtures.

### Key Decisions

- **Own corpus instead of extending nf-lab:** a manifest pins one
  playground commit; appending to nf-lab would have stamped the new
  commit on captures taken at `93a924e`.
- **Host pins the elected version:** the host version wins unconditionally
  (version-resolver, priority rule 1), so each scenario's election is
  deterministic without relying on the extra-downloads heuristic.
- **Torn and merged need `denseExternals`:** flat builds register every
  secondary as its own registry key, resolved independently; only an
  `entries` map makes secondaries follow their package's version.
- **`co-declared-share` is not a merged witness:** its two copies declare
  identical entries, so nothing is served from a second build. The new
  `merged-entrypoints` scenario covers it.

### Upstream fields exhibited

| Scenario | Stored evidence |
|---|---|
| `out-of-range-nonstrict` | `kit` 2.0.0 `share` (host, mfe3, `^2.0.0` strict); 1.2.0 `skip` mfe1 `^1.0.0` `strictVersion: false`; 1.3.0 `scope` mfe2 strict; shim scope `/mfe2/` only |
| `torn-many` | 1.4.0 `share` (host, entries `{kit}`); 1.2.0 / 1.3.0 `skip` with 6 / 4 entries; global imports map the 8 secondaries to `/mfe1/` and `/mfe2/` files |
| `merged-entrypoints` | one 1.2.0 `share` row, remotes host (1 entry) and mfe1 (3 entries, same `kit` file name); `kit/table` and `kit/dialog` mapped to `/mfe1/` |
| `multi-scope` | `share` in `__GLOBAL__` 1.4.0 (mfe1 1.2.0 `skip`), `team-a` 1.3.0 (mfe3 1.2.0 `skip`, scoped to mfe2's file), `strict` 2.0.0 and 1.3.0 |

Finding for Task 3 (checked in Task 2 against the claim pipeline): in
`merged-entrypoints` mfe1's secondaries resolve `own-selected` to mfe1's
copy, and both 1.2.0 copies are `ordinary-shared` — merged is not
mistaken for a self-fill. Torn is the `self-filled` claim state onto a
copy of another tag (`torn-many`).

### Acceptance Coverage

- **T1-AC-01** — all four pass the collector schemas and
  `fixture-drift.spec.ts` (26 derived fixtures).
- **T1-AC-02** — `manifest-nf-lab-verdicts.json` pins playground
  `5b67e9c…` and orchestrator 4.7.0.
- **T1-AC-03** — out of range: `out-of-range-nonstrict`; torn:
  `torn-many` (and `self-fill` for one specifier); merged:
  `merged-entrypoints`; multi-scope: `multi-scope` (strict alone also
  `strict-scope`).
