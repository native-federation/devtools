# Pools Tab — Presentation Contract

Stage 2 (Tasks 10–11), agreed on the mock-up `pools-matrix-mock.html`
(2026-09-30); replaces the Stage 1 tag matrix and outcome sentences. UI
strings are the intended English wording; `pools-view-model.spec.ts` pins
them on the orchestrator 4.7.0 fixtures. Scope: explicit `pool` tags only
(see plan, "Pooling scope").

## Principles

- **Show what happened to every copy.** One matrix per pool: every remote's
  copy of every member, grouped by the build it loads, coloured by what
  happened to it. The verdict names the outcome; the cells show where.
- **Stored, never inferred.** Every state is read off stored rows
  (`action`, `servedBy`, tags, `requiredVersion`, `strictVersion`, and from
  orchestrator v4.7 `poolName` and `poolCause`). The one computation is a
  range check with npm `semver`, the call the orchestrator itself makes.
- **Quiet by default.** Colour marks what happened; the verdict colours
  only its type, and only for isolation or a torn combination.
- **One warning for an older runtime** at the top of the tab instead of
  per-field markers (see "Version warning").
- **Conditional tab.** The `Pools` nav tab exists only when the capture
  holds a tag pool or an orphan tag; `/pools` stays reachable and says
  "No pool tags in this capture." otherwise.

## Layout

Definition line, linking the pooling docs, then the version warning when
it applies, then one legend for every matrix:

> A pool is a set of packages that must come from the same build. Each
> pool lists its builds and the remotes that load them.

Per pool, top to bottom: header, matrix, verdict, notes. Problem pools
first (torn, isolated, redirected, one build).

```
pool acme  5 packages · 12 remotes · tag: acme                 show in Graph
@nf-lab/           acme-animations acme-common acme-core acme-forms acme-router
Build of host · serves 5 others · host precedence
  host                    ·        18.2.0■     18.2.0■      ·      18.2.0■
  cart [acme]             ·        18.2.0      18.2.0       ·      18.2.0
  …
Build of orders · serves 4 others · 4 redirected
  orders [acme]         18.1.3■    18.1.3■     18.1.3■   18.1.3■   18.1.3■
  reports [no tag] ↪ redirected   18.1.3 …
Build of legacy · isolated
  legacy [acme]         16.2.12▲   16.2.12▲    16.2.12✕  16.2.12▲  16.2.12✕
✕ Isolated · version conflict  legacy · 2 conflicts · 4 remotes redirected
```

- **Header:** pool name as the orchestrator names it (the stored
  `poolName`, v4.7+; the smallest member before) — the pool ID keys on the
  smallest member either way; share scope when not the default; `<n>
  packages · <n> remotes · tag(s): <distinct tags>`; `show in Graph`.
- **Columns:** the pool's members; a shared npm scope is shown once in the
  corner (`@nf-lab/`) and dropped from the column labels.
- **Bands:** one per build, `Build of <owner>` with a muted note joining
  `isolated`, `serves <n> other(s)`, `<n> redirected`, `host precedence`.
  A remote served by several builds lands in a `Mixed builds` band.
  Order: shared bands by size (host first on ties), isolated, mixed.
- **Rows:** owner first. Participant chip, then the remote's tag or
  `no tag` (nothing for the host), then `↪ redirected` when pooling pointed
  it at another remote's build.
- **Cells:** the version the remote gets (the serving build's tag, not
  necessarily the one it declared); `·` where it does not use the member.

## Cell states

| State | Colour | When | Tooltip (after `<remote> · <package> <version>`) |
|---|---|---|---|
| conflict | solid red | strict copy whose range `semver` says rejects the shared tag | `Conflict: needs <range>, shared is <tag>` |
| isolated | orange | the remote runs the whole pool from its own build | `Isolated: follows <remote>'s conflict(s), since a pool comes from one build.` or `Isolated: runs the whole pool from its own build.`, plus ` Its range (<r>) accepts the shared <tag>.` or ` Its own range (<r>, not strict) wouldn't have blocked the shared <tag>.` when that is known |
| not shared | orange | no remote shares the member, the remote is not isolated | `Not shared: no remote shares this package, so each loads its own` |
| serves others | green | the band's owner, when another remote loads its build | `Serves <n> other remote(s)` |
| unchanged / redirected | grey | everything else | `Redirected to the build of <owner>` / `Unchanged: its own build` / `Unchanged: the build of <owner>` |

Precedence top to bottom. A range `semver` cannot read is never a
conflict. Conflicts are evidence, not a culprit: the orchestrator stores
`incompatible` on every copy of an isolated remote, not which conflict
triggered it, so every conflicting package is marked.

## Verdict

One line per pool, directly under its matrix: `<icon> <Type> · <cause>`
in bold, then `<who> · <why>`. Only the type is coloured, and only for
isolation (orange) or a torn combination (red). The worst outcome leads;
a redirect that also happened folds into `<why>`. More than two remotes
read as a count; the matrix shows who.

| Outcome | Line |
|---|---|
| torn | `✕ Mixed builds  <remotes> · no single build ships their combination` |
| isolated | `✕ Isolated · <cause>  <remotes> · <n> conflict(s) · <n> remotes redirected` |
| redirected | `↪ Redirected · would mix builds  <remotes> → build of <anchor> · shared versions come from <builds>` |
| one build | `✓ One build  build of <owner>` (`✓ Unchanged  builds of …` for several) |

Isolated `<cause>`: the stored `poolCause` when the isolated copies agree
on one, else `version conflict` from conflict evidence, else none.

| `poolCause` | Label |
|---|---|
| `incompatible` | version conflict |
| `uncovered` | not covered |
| `torn` | would mix builds |
| `unshared` | no shared copy |
| other | `<raw>` |

A `dirty` record shows the matrix with plain versions, no states and no
verdict, and "pending re-election — outcomes not settled yet".

## Version warning

The version comes from `__NF_ORCHESTRATOR__.storage.__NATIVE_FEDERATION__.version`
(orchestrator v4.7+, native-federation/orchestrator#86). The warning shows when
the tab has content and the version is below 4.7.0, or when no version is
exposed and no pool carries a stored `poolName`. A non-semver version
(`dev`) counts as current.

> This page runs orchestrator 4.6.0, which doesn't store pool names or why a
> remote got its own copy — this tab may be incomplete.

Without a version, which is an observation rather than a claim about the
runtime (exposing it is best-effort, and the probe reads one namespace):

> No orchestrator version found (exposed from 4.7.0). Pool names and
> reasons may be missing.

## Membership notes (only when they occurred)

| Case | Note |
|---|---|
| a single remote | `only one remote declares its members — nothing to coordinate` |
| different tags, one pool | `tags "a", "b" form one pool — they meet through <package>` |
| one tag, several pools | `tag "t" also forms pool <other> — tags only connect through a shared package` |
| untagged entrypoint joined | `<entrypoint> follows its package <package>` |
| orphan (own section) | `<package>: tag "t" by <remote> joined nothing — likely a typo or a missing sibling` |

## Acceptance reference

- `pool-showcase` (4.7.0): charts `✕ Isolated · version conflict  catalog ·
  1 conflict`; ui `↪ Redirected · would mix builds  admin, checkout → build
  of catalog · shared versions come from host and catalog`; form-kit `✓ One
  build  build of checkout` with the two-tags note; icons orphan.
- `pool-portfolio` (4.7.0): as drawn above.
- `pooling-anchor` (4.6.0): pool `@nf-lab/conflict-lib`, mfe2 redirected
  onto mfe1, the no-version warning.
- `pool-tag-orphan`: no pool; orphan section only.
