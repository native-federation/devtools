# Capture corpus (checked-in subset)

Raw runtime captures. Two corpora live here:

- the **lab lossless scenario corpus** (`<scenario>/` directories +
  `manifest.json`) — the V2 shape-validation ground truth, and
- the **frankenstein-live captures** (`frankenstein-live/`) — lossless
  phase captures of the publicly deployed frankenstein meeting room
  (real released-orchestrator evidence for shape-validation rows
  12–16).

Both feed the checked-in SnapshotV1 fixtures via
`scripts/derive-fixtures.mjs` (see the versioning map and data flow at
the end of this file). The legacy allowlist-projected frankenstein
capture (`frankenstein/`, envelope `frankenstein-runtime-capture/1`)
was retired in V2 task 5 — the lossless frankenstein-live corpus
supersedes it as evidence, and no tool in this repository reads that
envelope anymore.

## Lab lossless scenario corpus (V2)

One capture per scenario of the playground scenario catalog (separate
repository, `nf/playground`, branch `lab/v2-scenarios` — see
`captures/manifest.json` for the exact commits). Envelope
`lab-lossless-capture/1`: the full `__NATIVE_FEDERATION__` registry
namespace cloned **losslessly** (no allowlist, no caps), the DOM
import-map tag inventory, and the effective `importShim.getImportMap()`
copy including SRI integrity hash values. Captures from orchestrator
v4.7 on can also carry an `orchestratorGlobal` channel: the
`__NF_ORCHESTRATOR__` storage descriptor with its exposed `version`
(`get` recorded as `hasGet`, never called). Older pages record it as
`{ present: false }`, and captures from before the channel existed don't
have it at all.

Produced by evaluating `scripts/lab-capture-dump.js` unchanged in the
served scenario page (chrome-devtools MCP session; the probe is one
async function expression and works identically from any headless CDP
driver). Regeneration:

1. playground checkout: `node run-scenario.mjs <scenario>` (serves on
   `http://localhost:4300/`),
2. evaluate `scripts/lab-capture-dump.js` in the page, save the result
   as `captures/<scenario>/<runstamp>.json` (pretty-printed, 2 spaces),
3. `node scripts/build-lab-manifest.mjs` — rewrites `manifest.json`
   (per-file sha256, commits, probe hash),
4. `node scripts/validate-lab-corpus.mjs` — checks hashes, scenario
   set, envelope structure, and per-scenario losslessness evidence.

A re-capture of the same scenario is semantically identical to the
committed file modulo `capturedAt`/`observedAt` timestamps (verified
A→A including a full rebuild).

The captures are lab data of this project's own scenario runner
(vanilla lab elements, `@nf-lab/conflict-lib` version levers). The
lab-data-only policy below applies; SRI hashes may stay.

Probe revision note: the 10 lab captures of run `20260811T095850Z` were
produced with the probe at revision `38c180aeab83…` (sha256), before the
Task-3 fallback branch for pages without `__NF_SCENARIO_READY__` was
added. The fallback branch is unreachable when the runner defines the
ready promise, so lab behavior is unchanged — verified A→A on
`clean-skip` with the current probe (semantically identical modulo
timestamps). The manifest pins the *current* probe (regeneration
contract); the validator additionally rejects any lab capture carrying
fallback-mode scenario keys.

## nf-lab scenario corpus (share-pools)

Nine scenarios witnessing explicit pool tags and the dense remoteEntry
formats, listed in `captures/manifest-nf-lab.json` (own manifest: a
different playground commit and collector than the V2 corpus). Captured
on orchestrator **v4.7.0**, so the records carry `poolName`/`poolCause`
and the `orchestratorGlobal` channel, and the probe stamps the exposed
version (`4.7.0`) as `orchestratorCommit`. Same envelope and serving
origin as the V2 corpus; scenario ids are unique across both corpora
because they share the `captures/` root. The corpus table lives in
`scripts/lab-corpora.mjs`.

The V2 corpus cannot be re-captured (its runner is gone) and stays the
pre-4.7 coverage (orchestrator v4.6.0, `8e5e0b3`). Its manifest pins
`scripts/lab-capture-dump-v1.js`, a byte-identical copy of the probe that
produced it; the validator hashes whichever probe file a manifest names.

| Scenario | Witnesses |
|---|---|
| `pool-tag-coherent` | tagged family already served whole by one build — pooling writes nothing |
| `pool-tag-islanded` | gate 1: one remote scoped across the whole family; a member left with no share row |
| `pool-tag-anchored` | gate 2: `servedBy` onto one remote build, an untagged remote included |
| `pool-tag-orphan` | a tag that joins nothing — no pool forms |
| `pool-showcase` | four independent pools on one page: redirected, version conflict, one build under two tags, orphan tag |
| `pool-portfolio` | one family across the host and eleven remotes: the host's build, a redirect group, one isolated remote strict on two packages |
| `dense-chunking-only` | `bundle` + a `browser-shared` chunk list, flat entries |
| `dense-externals-only` | one registration with a two-entry `entries` map, no bundle |
| `dense-both` | both |

Source: `native-federation/playground`, branch `lab/grouping-and-pooling`,
directory `lab/` (esbuild adapter, core 4.7.0, fake `@nf-lab/*` packages;
see its README). Captured headlessly (Playwright Chromium over CDP,
es-module-shims in shim mode). Regeneration, from the playground `lab/`:

1. `node capture-all.mjs ../../devtools/captures <runstamp>`,
2. `node scripts/build-lab-manifest.mjs --corpus nf-lab --playground ../angular-examples`,
3. `node scripts/validate-lab-corpus.mjs` (validates both corpora),
4. `node scripts/derive-fixtures.mjs`.

## nf-lab verdicts corpus (packages-verdicts)

Four scenarios witnessing the Packages tab's version verdicts, listed in
`captures/manifest-nf-lab-verdicts.json`. Same lab, runner, probe and
orchestrator (v4.7.0) as the nf-lab corpus, recorded later from a newer
playground commit, so it carries its own manifest rather than restating
the nf-lab one's provenance. All four share the fake `@nf-lab/kit`
(1.2.0, 1.3.0, 1.4.0 and 2.0.0 with different secondary entrypoints).

| Scenario | Witnesses |
|---|---|
| `out-of-range-nonstrict` | host shares 2.0.0; a non-strict `^1.0.0` stored as a plain `skip`, a strict one `scope` |
| `torn-many` | the shared 1.4.0 lacks eight secondaries; the map serves five from 1.2.0 and three from 1.3.0 builds |
| `merged-entrypoints` | one shared 1.2.0 row, two copies: the host's declares only the package, mfe1's adds secondaries the map serves from its build |
| `multi-scope` | one package in `__GLOBAL__`, `team-a` and `strict`, each with its own election |

Regeneration, from the playground `lab/`:

1. `node run-scenario.mjs <scenario> --capture ../../devtools/captures/<scenario>/<runstamp>.json` for each of the four,
2. `node scripts/build-lab-manifest.mjs --corpus nf-lab-verdicts --playground <playground>`,
3. `node scripts/validate-lab-corpus.mjs`,
4. `node scripts/derive-fixtures.mjs`.

## Frankenstein-live captures (V2, rows 12–16)

`frankenstein-live/<runstamp>-<phase>.json` — lossless phase captures
of <https://lutzleonhardt.de/frankenstein-meeting-room/>, this
project's own app, publicly deployed and listed among the official
Native Federation resources. Same envelope (`lab-lossless-capture/1`)
and probe as the lab corpus; the probe falls back to its settled-page
condition (`scenario.readySource: "page-settled"`, `scenario.phase`
label) because the live page has no scenario runner.

Phases: `01-initial` (post-init state after load) and
`02-post-interaction` (after selecting a meeting, which loads the
whiteboard and mermaid remote modules). The deployed app performs **no
dynamic post-init `initRemoteEntry`** — all three `remoteEntry.json`
fetches happen during startup, and the phase-identity check in the
validator proves the registry, DOM map tags, and effective shim map
stay byte-identical across the interaction.

Unlike lab scenarios these captures are **deployment-dependent, not
regenerable from checkouts** (XC-01 exempts them): the live app may be
redeployed at any time. Provenance lives in
`frankenstein-live/provenance.json` (capture URL + date, best-known
orchestrator version and how it was determined) and is embedded into
`manifest.json` by the builder; per-file sha256 pins the observed
state. To re-capture after a redeploy: delete the superseded phase
files, repeat the capture flow against the live URL (set
`__NF_SCENARIO_ID__`/`__NF_SCENARIO_PHASE__` in the page, evaluate the
probe, pretty-print), update `provenance.json`, rebuild the manifest,
re-run the validator — its live-evidence predicates intentionally fail
loudly if the deployed registry shapes changed, pointing at the shape
report.

This is our own application; the lab-data-only policy holds and SRI
hashes may stay.

## Versioning map

Every version stamp in the repository, what it versions, and when to
bump it:

| Stamp | Kind | Meaning | Bump when |
| --- | --- | --- | --- |
| `lab-capture-dump/1` | producer version | `collector.probe` in capture envelopes: which lab probe produced the file | the probe's observable output changes (also re-pins `source.probe.sha256` in the manifest via the builder) |
| `lab-lossless-capture/1` | envelope id (wire contract) | structure of a capture file under `captures/` (lab and live) | the envelope structure changes — the validator and `scripts/derive-fixtures.mjs` gate on it |
| `lab-lossless-corpus/1` | envelope id (wire contract) | structure of `captures/manifest.json` | the manifest structure changes |
| `passive-probe/3` | probe↔mapper contract | result schema of the product's passive probe; the mapper rejects other stamps | the probe/mapper schemas change — probe string and `runtime-schema.ts` are hand-synced and ship in lockstep |
| `shim-map-probe/1` | probe↔mapper contract | result schema of the shim map probe | its result schema changes |
| `nf-devtools-collector/3` | producer version | `COLLECTOR_VERSION`, recorded as `SnapshotV1.capture.collectorVersion` | projection semantics change (bumped with `passive-probe/*`) |
| `SnapshotV1.schemaVersion: 1` | DTO wire contract | snapshot shape consumed by UI, export, and fixtures | only on a breaking DTO change — V2 grew it additively and kept `1` |
| v4.5 / v4 | observed registry-format generations | registry-format generations in the corpus, named by the release that introduced the format: v4.5 (`entries` map since v4.5.0, commit `a424249`; the lab scenarios run the released v4.6.0, commit `8e5e0b3`) vs. v4 (`file` string; frankenstein-live) | never bumped by us — a newly observed generation means new captures plus shape re-validation |

## Data flow

```
nf/playground (branch lab/v2-scenarios)          lutzleonhardt.de/frankenstein-meeting-room/
  run-scenario.mjs <scenario>                        (public deployment, fallback readiness)
        │  served scenario page                            │
        └────────────┬─────────────────────────────────────┘
                     ▼
        scripts/lab-capture-dump.js  (evaluated in the page)
                     │  writes lab-lossless-capture/1
                     ▼
        captures/<scenario>/<runstamp>.json
        captures/frankenstein-live/<runstamp>-<phase>.json  (+ provenance.json sidecar)
                     │
        scripts/build-lab-manifest.mjs   → captures/manifest.json  (lab-lossless-corpus/1)
        scripts/validate-lab-corpus.mjs  → reads manifest + every capture (hashes, envelope,
                     │                     losslessness + live-evidence predicates)
                     ▼
        scripts/derive-fixtures.mjs      → reads manifest + capture envelopes, runs the REAL
                     │                     collector pipeline (passive-probe/3, shim-map-probe/1,
                     │                     mapper → nf-devtools-collector/3)
                     ▼
        projects/devtools-bridge/src/lib/fixtures/<id>.fixture.ts   (SnapshotV1, schemaVersion 1)
                     │
        FixtureSnapshotProvider (dev panel, ?fixture=<id>) · specs · guards
        (drift guard: projects/collector/src/lib/fixture-drift.spec.ts re-derives
         every fixture from its capture and compares)
```

## Policy

Only captures of this project's own lab applications may be checked in
here — never captures of real or third-party pages, regardless of how
harmless they look. The privacy guard (`guards/privacy-scan.spec.ts`)
scans every checked-in capture for URL userinfo/query/fragment and
forbidden key names. Captures may keep SRI integrity hashes; the fixture
projection is the minimal layer on top and drops them.
