### Task

Re-record the nf-lab capture corpus on orchestrator 4.7.0, add the
`pool-showcase` and `pool-portfolio` scenarios, and move the v4.7 tests
from hand-edited 4.6 captures onto the real fixtures.

### Status

DONE

Nine nf-lab scenarios captured with zero collection errors on 4.7.0;
both corpora validate. UI 595, bridge 97, collector 98, guards 72 green.

### Files Modified

Playground (`../angular-examples`, branch `lab/grouping-and-pooling`,
commit `93a924e`, not pushed): lab on orchestrator 4.7.0 / esbuild adapter
4.2.0 (the user's bump), `scenarios/pool-showcase.mjs`,
`scenarios/pool-portfolio.mjs`, fake `chart-*`, `form-*`, `icons`,
`acme-*` packages, `LAB_PORT` in `run-scenario.mjs`, README.

Devtools:

- `scripts/lab-capture-dump.js` — runner mode stamps the version exposed
  on `__NF_ORCHESTRATOR__` as `orchestratorCommit`, the pinned `8e5e0b3`
  only when none is exposed.
- `scripts/lab-capture-dump-v1.js` (new) — byte-identical copy of the
  probe that produced the v2 corpus (sha256 `c9060b95…`).
- `scripts/validate-lab-corpus.mjs` — hashes the probe file each manifest
  names; v4.7 predicates (`poolName`, `poolCause`, `servedBy` anchors) for
  `pool-tag-islanded`, `pool-showcase`, `pool-portfolio`; every capture of
  a 4.7.0 corpus must carry `orchestratorGlobal` version 4.7.0.
- `scripts/lab-corpora.mjs` — nf-lab catalog +2 scenarios.
- `scripts/derive-fixtures.ts` — banner names the real orchestrator
  (`v4.7.0`, or `v4.6.0 (8e5e0b3)`), no longer a hard-coded v4.6.0.
- `captures/` — nf-lab run `20260930T113012Z` replaces `20260929T151127Z`;
  `manifest-nf-lab.json` rebuilt; `manifest.json` (v2) points at
  `lab-capture-dump-v1.js`; README section rewritten. The runner's
  `<capture>.console.log` side files (all empty, half of them from the
  run `20260930T112604Z`, which kept no captures) were committed by
  mistake and removed afterwards.
- `scripts/validate-lab-corpus.mjs` — the stray-file check covers every
  file under `captures/` (except `README.md`), not only `*.json`, so
  side files like those logs fail validation.
- `devtools-bridge/src/lib/fixtures/` — nf-lab fixtures re-derived,
  `pool-showcase` and `pool-portfolio` added and registered.
- Specs — drift count 20 → 22; pool-name expectations `@nf-lab/ui-core` →
  the stored `ui` (graph, packages, pools, facets); `pools-view-model.spec`
  v4.7 cases on the real islanded fixture, pre-4.7 cases on
  `pooling-anchor`.

### Key Decisions

- **Preserve the old probe rather than rebuild the v2 manifest:** a
  rebuilt manifest would claim the new probe produced captures it never
  took. The v2 runner no longer exists, so that corpus stays the pre-4.7
  coverage.
- **Remote names avoid the privacy guard's forbidden keys:** `account` →
  `dashboard`, `customers` → `contacts` (the guard rejects keys matching
  `account|customer|…`, and remote names become keys).
- **`servedBy` expectations follow the stored shape:** set only where a
  copy's build differs from its version's basis, and on the anchor itself.
  In `pool-portfolio` that is core/common/router (host-shared), not forms
  and animations (shared from orders' build).

### Acceptance Coverage

- **T9-AC-01 — passed:** `validate-lab-corpus.mjs` valid for both corpora.
- **T9-AC-02 — passed:** `pool-tag-islanded` carries `poolName: "ui"`,
  `poolCause: "incompatible"` (mfe1) and `"unshared"` (mfe2's ui-core);
  `pool-showcase` and `pool-portfolio` fixtures exist; drift count 22.
- **T9-AC-03 — passed:** hand-edited v4.7 tests replaced by the real
  fixture; only targeted variations (unknown cause, accepting/unreadable
  range, non-strict copy) still edit a clone of it.

### Context for Next Task

- `pool-portfolio` as the orchestrator decided it: host's build serves
  products, search, settings, profile, cart; orders' build serves
  invoices, contacts, onboarding, reports (`servedBy: orders` on the
  host-shared members); legacy isolated, `poolCause: incompatible` on all
  five, strict (and so conflicting) on core and router only.
- `pool-showcase`: ui anchored on catalog (admin, checkout redirected);
  charts isolates catalog (chart-dom ^1 vs shared 2.0.0), dashboard's
  chart-core unshared; form-kit one build (checkout's); icons orphan.

### Git State

- Branch `share-pools`, committed as `task-9`.
