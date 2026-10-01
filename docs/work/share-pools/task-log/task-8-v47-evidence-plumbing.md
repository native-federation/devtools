### Task

Land the orchestrator v4.7 evidence plumbing the Stage 2 pools matrix
builds on: strict-range conflict evidence via npm `semver`, the terser
conflict wording, and the lab capture script's `__NF_ORCHESTRATOR__`
channel.

### Status

DONE

The work was already on the working tree; this task verified and
committed it. UI 594, bridge 93, collector 96, guards 68 green;
`build:extension` and `check:panel-bundle` pass.

### Files Modified

- `shared/store/semver-range.ts` (new) + spec — `satisfiesRange`: npm
  `semver` `satisfies` with default options, as the orchestrator's
  `version.check.ts` `isCompatible`; null when `valid`/`validRange` cannot
  read the version or range.
- `resolution/derive-pool-families.ts`, `pool-family-model.ts` —
  `conflicts` only for strict copies whose range `semver` says rejects the
  shared tag (`determine`'s objector rule).
- `views/pools/pools-view-model.ts` + spec — incompatible reason
  "version conflict: not all its packages accept the shared versions",
  with `(<pkg> needs <range>, shared is <tag>)` as evidence, not a culprit;
  fallbacks for an accepting range, an unreadable range and a non-strict
  copy.
- `package.json`, `package-lock.json` — `semver` ^7.8.5, `@types/semver`.
- `angular.json` — `allowedCommonJsDependencies: ["semver"]`.
- `scripts/lab-capture-dump.js` — `orchestratorGlobal` channel (storage
  entries' plain fields, `get` as `hasGet`; absent → `{ present: false }`,
  no collection error).
- `collector/src/testing/fixture-pages.ts` — `buildCapturePage` restores
  `__NF_ORCHESTRATOR__` from that channel.
- `collector/src/lib/fixture-drift.spec.ts` — the channel derives
  `runtime.orchestratorVersion`; a capture without it stays identical to
  its fixture.
- `captures/README.md`, `design/pools-explainer-mock.md` — channel and
  wording documented.

### Key Decisions

- **npm `semver` over a hand-written range parser:** same library, major
  and call as the orchestrator, so the devtools cannot disagree with its
  range verdicts. Costs ~19 kB (5 kB gzip); the initial bundle was already
  over its 500 kB warning budget (511 → 530 kB), far from the 1 MB error.
- **Evidence, not attribution:** the record stores `incompatible` on every
  copy of an isolated remote, not which conflict triggered it.

### Acceptance Coverage

- **T8-AC-01 — passed:** all suites green; extension CSP check passes.
- **T8-AC-02 — passed:** pinned in `fixture-drift.spec.ts`
  ("orchestratorGlobal channel").

### Open Issues

- `validate-lab-corpus.mjs` reports probe sha256 drift for both corpora
  (the capture script changed); cleared by Task 9's re-capture and
  manifest rebuilds.

### Git State

- Branch `share-pools`, committed as `task-8`.
