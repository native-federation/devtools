# Native Federation DevTools — Orchestrator 4.8: Remotes Says Where It Runs

Branch scope: remotes-v48 (stacked on packages-v48, PR #8)
Upstream verified against: orchestrator v4.8.0, native-federation-core v4.8.0, discussion native-federation#176.

Goal: 4.8 resolves every entrypoint of a package from one build ("A micro frontend resolves every
entrypoint of a package from one build", #176), so for one remote and one package there is one
answer: it serves it, it runs another remote's build, a subpool, or its own build for a reason.
The Remotes tab still showed the pre-4.8 per-claim zones (provides / consumes / unresolved) with
every file line, so that answer was spread over two zones and chips, and the strict per-tag
fallback (`strict-uncovered` mfe1) was not shown at all. This scope rebuilds the detail around
that one answer. Mock: `design/remotes-mock.html` (real lab data).

Hard constraints (inherited): views consume only the canonical read surface; where a package runs
from is read from the stored declaration verdicts (`PackageScopeVerdicts`) — the same records
Packages' Shipped by / Used by use — and the copy its main specifier resolves to; reasons are
phrased by `shared/placement-text.ts`. Nothing re-derives an election.

## Task 1: Runs, Serves and a list that says what is off

Status: DONE (see task log).

### Instructions

- `remotes-runs-vm.ts` (new): one Runs row per declaration — kind (`self`, `shared`, `subpool`,
  `owner`, `own`, `off`, `unresolved`, `unknown`), the tag it runs, From (label, remote chip),
  Why only off the norm or for a qualified source — one line, the full reason in its tooltip and
  in the opened row — and for the opened row: declared range, the
  shipped tag, pool link, entrypoints with `not in <build>'s build` / source markers. Flat
  secondaries fold into their name-derived parent when they run the same way. Serves: copies
  sourced by this remote's declarations with their other consumers. A tally line.
- The verdict wording moves from Packages to `shared/verdict-text.ts`; both views use it.
- List: `marks` (`2 own build`, `1 out of range`, `2 subpool`, `2 subpool owner`, `1 not
  mapped`) and `serves N`, replacing `1 expose · 5 declarations` and the `⚠` marker.
- Detail: one meta line (scope URL, exposes linked to the Import Map, capabilities), tally,
  Runs table, Serves; private registrations, claim-less bindings and chunks (collapsed) only when
  present. Pools-style `data-tip` tooltips instead of `title`.
- Docs: README, `DEVELOPMENT.md`, data model wording; Remotes README and store screenshots.

### Acceptance

- **T1-AC-01** — `strict-uncovered` mfe1: `own build`, why `not covered: the serving build of host
  lacks @nf-lab/kit/table, @nf-lab/kit/dialog`, both entrypoints marked; host serves mfe2 only.
- **T1-AC-02** — `pool-showcase`: dashboard `2 own build · 2 from checkout` with the version
  conflict; catalog `subpool of admin`; admin `subpool owner`, serves catalog and checkout.
- **T1-AC-03** — `out-of-range-nonstrict` mfe1 `out of range` from host, ships 1.2.0, runs 2.0.0.
- **T1-AC-04** — qualified sources (ambiguous, observed, unknown) keep their qualifier on From;
  a secondary resolving away from the row's build is flagged.
- **T1-AC-05** — pool links open Pools on this remote's row (pools-v48 T8 still green).

## Out of scope

- Discussion #176 ideas: name-based package grouping, a flat/dense marker per build, remedy hints.
- Counting duplicate singletons per page (the denatys case in #176).
