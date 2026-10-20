# Pools Tab — Placements and Reasons (orchestrator 4.8)

Supersedes the Stage 2 contract in
`docs/work/share-pools/design/pools-explainer-mock.md` where they differ;
everything not named here (definition line, legend placement, header, orphan
section, notes, conditional tab) is unchanged. `pools-view-model.spec.ts`
pins these strings on the 4.8 nf-lab corpora.

## Principles

- **Where is stored, why is recomputed.** A remote's band comes from its
  stored rows (global map, `servedBy` subpool, all-`scope` own build). The
  reason is recomputed against the global surface with the orchestrator's own
  rules (`election.ts` `missOf`) and checked against the stored `poolCause`.
- **Every reason, not the first.** All range rejections (strict first) and
  all missing entrypoints are listed; the orchestrator only logs the first.
- **Unexplained, never guessed.** A stored cause the rows do not reproduce is
  shown as stored, marked unexplained (warning colour).

## Layout

```
pool acme  5 packages · 12 remotes · tag: acme                       show in Graph
Global map serves 3 of 5 entrypoints the remotes import · missing: @nf-lab/acme-animations (contacts, …), …
@nf-lab/           acme-animations acme-common acme-core acme-forms acme-router
Global map · build of host · serves 5 others · host precedence
  host                   ·        18.2.0■     18.2.0■      ·      18.2.0■
  cart [acme]            ·        18.2.0      18.2.0       ·      18.2.0
Subpool · build of contacts · serves 4 others
not covered: the global map lacks @nf-lab/acme-animations, @nf-lab/acme-forms
  contacts [acme]      18.1.3▒   18.1.3■     18.1.3■   18.1.3▒   18.1.3■
  invoices [acme] ↪ subpool  18.1.3▒  18.1.3 …
Own build · legacy
version conflict: its range rejects the global @nf-lab/acme-core 18.2.0 (^16.0.0, strict), @nf-lab/acme-router 18.2.0 (^16.0.0, strict), @nf-lab/acme-common 18.2.0 (^16.0.0, not strict)
  legacy [acme]        16.2.12▒  16.2.12✕   16.2.12✕  16.2.12▒  16.2.12✕
✕ Own build · version conflict  legacy · 3 rejections · 4 remotes in a subpool
```

- **Coverage line** (under the header): `Global map serves all <n>
  entrypoints the remotes import`, or `… serves <s> of <n> … · missing:
  <specifier> (<remotes>), …` in warning colour.
- **Bands:** `Global map · build of <winner>` (stored `poolWinner`; before 4.8
  the build serving the first shared member), `Subpool · build of <owner>`,
  `Own build · <remote>`, `Unknown placement`. Note: `serves <n> other(s)`,
  `host precedence`, and on the global band each extension
  `<member> <tag> from <build>`.
- **Reason line:** under the band label when every row of the band shares it
  (a subpool's members, a one-remote own build), else under the remote.
  `<cause>: <text>`:

| Miss | Text |
|---|---|
| range | `its range rejects the global <specifier> <tag> (<range>, strict \| not strict), …` |
| coverage | `the global map lacks <specifier>, …` |
| unshipped | `every entrypoint is on the global map, but no single build ships <gap> with the rest` |
| subpool owner the map would serve | `the global map would serve it; its build stays for the remotes of its subpool` |
| stored cause, no miss | `the stored rows do not reproduce why it is off the global map` (unexplained) |
| miss contradicts stored cause | `<text> — but the stored cause is '<stored>'` (unexplained) |
| global with a miss | `on the global map although <text>` (unexplained) |
| unknown placement | `some rows run its own build, others not — a record orchestrator 4.8 does not write` (unexplained) |

- **Rows:** `↪ subpool` replaces `↪ redirected`.

## Cell states

| State | Colour | When | Tooltip |
|---|---|---|---|
| rejected | solid red | the range rejects the global tag (own tag exempt), strict or not | `Rejected: needs <range>[ (not strict)], the global map has <tag>` |
| gap | amber, dashed | the copy ships an entrypoint the global map does not serve | `Not on the global map: <specifiers>` |
| isolated | orange | own build | `Own build: runs the whole pool from its own build.` + ` Its range (<r>) accepts the global <tag>.` when it does |
| not shared | orange | no share row and no subpool serves the member | unchanged |
| serves others | green | band owner serving others | `Serves <n> other remote(s)` |
| unchanged | grey | otherwise | `Subpool: runs the build of <owner>` / `Global map: the build of <build>` / `Its own build` |

## Verdict

| Outcome | Line |
|---|---|
| own build | `✕ Own build · <stored cause>  <remotes> · <n> rejections · <n> remotes in a subpool · <n> unexplained` |
| subpool | `↪ Subpool · <recomputed cause>  <remotes> → build of <owner>[ · <n> unexplained]` |
| one build | `✓ One build  build of <owner>` |

Causes: `incompatible` → `version conflict`, `uncovered` → `not covered`;
anything else (4.7's `torn`, `unshared`) raw.

## Pending and version warning

- Pending: `dirty` → `pending re-election — outcomes not settled yet`; scope in
  `cache-state.undecidedScopes` → `a runtime load changed this share scope —
  the next init decides it again; outcomes not settled yet`.
- Below 4.7: unchanged. 4.7.x: `This page runs orchestrator <v>. The reasons
  follow 4.8's pooling and may not explain every placement.`
