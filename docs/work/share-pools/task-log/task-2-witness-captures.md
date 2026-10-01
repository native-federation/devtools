### Task

Witness explicit pool tags and the dense remoteEntry formats with real
lossless captures, and derive SnapshotV1 fixtures from them. The V2
scenario runner (`nf/playground`, `lab/v2-scenarios`, commit `acdd0dd`)
exists neither locally nor on the remote, so the lab was rebuilt.

### Status

DONE

Seven scenarios captured with zero collection errors, validated with
per-scenario evidence predicates, and derived into fixtures through the
real collector pipeline. All suites green: UI 515 (+1 new `it.each` of
3), bridge 93, collector 82, guards 68.

### Files Modified

Playground (`../angular-examples` = `native-federation/playground`,
branch `lab/grouping-and-pooling`, local commit `2973777`, not pushed):

- `lab/run-scenario.mjs` — builds one scenario into `out/<id>/`, serves
  single-origin on `:4300` (host `/`, remotes `/<app>/`), `--capture`
  evaluates `devtools/scripts/lab-capture-dump.js` headlessly (Playwright
  Chromium) and writes the envelope + a console log.
- `lab/build-app.mjs` — one federation build per child process.
- `lab/capture-all.mjs`, `lab/README.md`, `lab/package.json` (core 4.7.0,
  esbuild adapter 4.1.0, orchestrator **4.6.0**, es-module-shims).
- `lab/packages/<name>@<version>/` — fake `@nf-lab/ui-core`, `ui-dom`
  (1.0.0, 1.1.0, 2.0.0), `utils`, `dense-lib` (with an internal module
  both entrypoints import, to force a split chunk).
- `lab/scenarios/*.mjs` — the seven scenarios.

Devtools:

- `scripts/lab-corpora.mjs` (new) — corpus table: `v2` (existing,
  `manifest.json`, live captures) and `nf-lab` (`manifest-nf-lab.json`,
  `playwright-cdp` collector).
- `scripts/build-lab-manifest.mjs` — `--corpus <id>` (default `v2`);
  catalog, repository, runner and collector from the table.
- `scripts/validate-lab-corpus.mjs` — validates every corpus
  (`validateCorpus`), stray-file check across all manifests, evidence
  predicates for the seven new scenarios.
- `scripts/derive-fixtures.ts` — derives every corpus; live fixture only
  for corpora with `live`.
- `captures/<7 scenarios>/20260929T151127Z.json`,
  `captures/manifest-nf-lab.json`, `captures/README.md` (new section).
- `projects/devtools-bridge/src/lib/fixtures/<7>.fixture.ts` (generated)
  + `index.ts` registration.
- `projects/collector/src/lib/fixture-drift.spec.ts` — 13 → 20 derived
  fixtures.
- `projects/devtools-ui/src/app/views/remotes/remotes-view-model.spec.ts`
  — Task 1 capabilities pinned on the three real dense fixtures.
- `docs/work/share-pools/plan.md` — Task 2 lab location; pool
  scenario package names in Tasks 2/3.

### Key Decisions

- **Orchestrator pinned to 4.6.0:** the probe stamps `8e5e0b3` (= tag
  `v4.6.0`) in runner mode. Pinning keeps that stamp true without
  touching the probe, whose sha256 both manifests pin.
- **Second corpus, own manifest:** the manifest schema has one
  playground commit and one collector per run; merging would misstate
  the V2 corpus's provenance. Scenario ids stay unique across corpora
  because they share `captures/`.
- **One build per child process:** the esbuild service keeps the cwd of
  its first build; in-process builds of a second app resolved against
  the first app's directory.
- **`share()` in generated configs:** a plain `shared` object skips
  `includeSecondaries` expansion.
- **Shim mode:** matches the V2 corpus (populated `importShim` channel;
  the validator requires every channel available).

### Upstream fields exhibited

| Scenario | Stored evidence |
|---|---|
| `pool-tag-coherent` | `pool: "ui"` on all four ui participants; share/skip rows only; no `servedBy`; empty shim scopes |
| `pool-tag-islanded` | mfe1's `ui-core@1.1.0` and `ui-dom@1.1.0` both `scope`; `ui-core` has no `share` row (mfe2's `1.0.0` also `scope`); `ui-dom@2.0.0` shared from mfe2 |
| `pool-tag-anchored` | host shares `ui-core@2.0.0`; mfe1/mfe2/mfe3 `ui-core@1.0.0` skip rows all `servedBy: "mfe1"` (mfe3 untagged); shim scopes point every remote's `ui-core` at mfe1's file |
| `pool-tag-orphan` | one `pool` tag (mfe1 `ui-core`); no writes |
| `dense-chunking-only` | `bundle: "browser-shared"` on every participant, separate `dense-lib` and `dense-lib/extra` keys, `shared-chunks.mfe1["browser-shared"] = ["chunk-Y6UYBMA7.js"]` |
| `dense-externals-only` | one `dense-lib` registration with `entries` for both specifiers; no `bundle`, no `shared-chunks` |
| `dense-both` | the two combined |

### Test Evidence

- `node scripts/validate-lab-corpus.mjs` — both corpora valid; a
  hand-tampered `servedBy` in `pool-tag-anchored` (manifest rebuilt)
  fails with the expected anchor diff, then restored.
- Rebuilding the V2 manifest with the refactored builder differs only in
  `createdAt` and playground provenance (reverted — see Open Issues).
- `node scripts/derive-fixtures.mjs` — the 13 existing fixtures are
  byte-identical; 7 new ones written.
- Suites as listed under Status.

### Acceptance Coverage

- **T2-AC-01 — passed:** every capture passes the collector schemas
  (derivation is error-free) and `fixture-drift.spec.ts`.
- **T2-AC-02 — passed:** `captures/manifest-nf-lab.json` pins the
  playground commit (`2973777…`) and orchestrator commit (`8e5e0b3`).

### Open Issues

- `build-lab-manifest.mjs` without `--corpus` rebuilds the V2 manifest
  from whatever `--playground` points at; the V2 source checkout is gone,
  so never rebuild `v2` from `../angular-examples`.
- The lab branch exists only locally in `../angular-examples`; the
  manifest references its commit. Push it (or keep the checkout) before
  anyone else regenerates.
- `synthetic-dense-entries` stays: its split-lib case (same key, deviating
  secondary) has no real witness yet.

### Context for Next Task

- Task 3 derives tag pools from `pool` tags; `pool-tag-coherent`,
  `pool-tag-anchored` (pool incl. untagged mfe3) and `pool-tag-orphan`
  are the acceptance fixtures; the pool ID in the coherent case is
  `@nf-lab/ui-core`.

### Git State

- Devtools: branch `share-pools`, committed as `task-2`.
- Playground: branch `lab/grouping-and-pooling`, `2973777` (local).
