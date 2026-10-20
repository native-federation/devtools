# Native Federation DevTools — Graph View Specification

Status: draft for the `graph-view` branch scope (2026-08-23).
Note (2026-10-20, `pools-v48`): the `self-filled` mapping state below no longer exists; orchestrator
4.8 borrows no entrypoint from another build.
Consumes: the canonical resolution projection delivered by the
`resolution-model` scope (Tasks 1–6, migrated views 7–9.5).
External challenger: `/home/lutz/Downloads/DEPENDENCY-GRAPH.md`,
SHA-256 `5977479c34433256c89790a2ab2a3068817a11b24a39a764a480b7d486f693d3`
(third-party document, referenced but deliberately not copied into the
repo and not treated as an oracle; its accompanying screenshot contains
third-party data and is a visual reference only — never committed).

## 1. Goal

A read-only, interactive three-column flow map — **Remotes |
Dependencies | Chunks** — as a new panel view `Graph (preview)`. It
renders the consumer → copy → chunk spine that Packages, Remotes, and
Import Map already pivot on, as one picture: fan-in of shared copies,
isolated/private copies standing out, and the chunk groups behind each
copy. Demo target: the frankenstein fixtures and the public
frankenstein live app.

This is **not** a force-directed graph. Three fixed columns of stacked
boxes plus an SVG edge overlay; all geometry computed in a pure
builder.

## 2. Relationship to the external challenger

The challenger document splits cleanly:

**Adopted (presentation and interaction design):** the three-column
layout with fixed geometry constants; cluster boxes; horizontal cubic
Bézier edges; label truncation with full-text tooltips; pure
builder-owns-geometry discipline; click-to-filter on the remote column
(OR semantics, the remote column itself is never filtered); layer
toggles with the "toggles are always authoritative" precedence rule;
hover trace with undirected adjacency dimming; bundle edges rendered
only for the hovered node plus a hard edge cap surfaced as an honest
count; single inspect card whose subject is looked up in the current
model, never stored; derive-don't-store state discipline;
"every visual channel carries exactly one meaning".

**Rejected (semantics — the canonical model already owns these):** the
raw-cache reader and its rebuild of resolution semantics (a second
resolver, forbidden by resolution-model XC-05); `remotes[0]` as *the*
provider (our registry serving slot is a qualified claim, and observed
sources can mismatch it); delivery vocabulary (`loaded`, `downloads`,
"cost on the wire" — forbidden by XC-06); tag-based node identity
(rejected by resolution-model Task 5 — copy identity is
source/target-oriented); pool labels as clustering identity (raw pool
labels are not canonical identities); silently dropping skips without
a winner (unresolved evidence stays visible); silently skipping
bundles without chunk lists (`source-only` is a qualified state, not
an absence).

## 3. Data contract (hard constraints)

- The graph consumes **only** `CanonicalResolutionProjection`
  (`shared/store/resolution/projection-model.ts`): `remotes`, `copies`,
  `consumerRelations`, `chunkGroups`, `bundleClaims`, and
  `completeness`. No `SnapshotV1`, no raw repositories, no ingest, no
  resolution algorithms, no `sharedRows`.
- The graph derives **no new domain facts**. It re-groups and lays out
  canonical records; every ID it renders is a canonical ID
  (`remote.name`, `copyId`, `bundleClaimId`, `chunkGroupId`).
- The builder is a pure function
  `(projection, viewState, options) → GraphModel` with all geometry
  inside; the renderer draws primitives only. Deterministic: identical
  inputs produce an identical model.
- Templates are VM-only with canonical-ID render tracking, components
  use `templateUrl`/`styleUrl` with separate `.html`/`.css` files.

## 4. Graph model

Three layers, two edge kinds:

| Layer | One node per | Canonical source | Identity |
| --- | --- | --- | --- |
| `remote` | remote in the capture | `RemoteProjection` | `remote.name` |
| `dependency` | resolved copy | `ResolvedDependencyCopy` | `copyId` |
| `chunk` | chunk file per emitter | `ChunkGroupProjection.files` | `(chunkGroupId, file)` |

- **consume edge** (`remote → dependency`): one per
  `ConsumerCopyRelation` (`(consumerRemote, copyId)` key). Always
  drawn (subject to filters).
- **bundle edge** (`dependency → chunk`): via
  `copy.bundleClaimIds → BundleClaim.chunkGroupIds → files`. Drawn
  only for the hovered node; hard-capped with a surfaced
  `cappedEdges` count.

Node/edge/cluster records carry precomputed `x/y/w/h`, palette index,
truncated label + full tooltip text, exactly as in the challenger's
model shape.

## 5. Semantic mapping (challenger concept → canonical record)

| Challenger | Canonical replacement |
| --- | --- |
| dependency node = "one copy the browser downloads" | `ResolvedDependencyCopy` — proves map resolution, not delivery |
| `dep:{scope}::{pkg}::{tag}` identity | `copyId` (source/target-oriented; scope-action copies are separate copies by construction) |
| provider = `version.remotes[0]` | the copy's evidenced source (`source`, `sourceDisposition`, `sourceRegistrationRefs`); serving slot stays a qualified claim |
| skip → fallback edge to the winner | `ConsumerCopyRelation.mappingStates` (`fallback`, `not-selected`, `anchored`, `self-filled`) |
| no anchors representable | `anchored` relations render like fallback edges with an anchor tooltip |
| `loaded` / `deduped` card flags | selected / `not selected` / `skipped own <tag>` (Task-4 vocabulary) |
| skip without winner → dropped | unresolved claims stay visible (footer counts from `completeness`; no silent drops) |
| bundle without chunk list → skipped | `BundleClaim.status` `source-only` renders a qualified stub; `ambiguous` keeps its qualifier |
| chunks per emitter, never merged | `ChunkGroupProjection` is per `(emitterRemote, bundle)` already |
| `mapping-or-exposed` exclusion | `ChunkGroupOrigin`: only dependency-attributable origins enter the chunk column |
| pool sub-clustering under provider | pool is card/tooltip metadata only — raw labels are not canonical identities |

## 6. Layout (adopted)

Geometry constants as in the challenger §6: `NODE_W 280`, `NODE_H 26`,
`NODE_VGAP 6`, `CLUSTER_HEADER 22`, `CLUSTER_PAD 10`,
`CLUSTER_VGAP 20`, `COL_GAP 150`, `MARGIN 24`, `HEADER_H 30`,
`LABEL_MAX 36`, `MAX_BUNDLE_EDGES 4000`. Remote column flat and
alphabetical, host first is permitted as a deliberate deviation;
dependency and chunk columns clustered. Edges attach right-mid →
left-mid and render as horizontal cubic Béziers
(`dx = max(24, (x2 - x1) / 2)`).

## 7. Interaction

- **Hover = trace** (transient, stateless): hovered node plus
  undirected-adjacent nodes stay full opacity, everything else dims;
  non-adjacent consume edges dim hard; bundle edges of the hovered
  node appear. Native tooltips carry the full text.
- **Click on a remote** toggles it in the selection set; a dependency
  is kept when **at least one consumer relation touches a selected
  remote** (OR). The remote column always renders completely. Toolbar
  shows the filter state and a clear action; unfiltered state shows
  the affordance hint line.
- **Chunk attribution ignores the remote selection** — the emitter is
  not the consumer; a selected remote borrowing a copy from an
  unselected source keeps the backing chunks. (Highest-value
  regression test, adopted from the challenger.)
- **Layer toggles** Shared / Scoped / Chunks, all on by default,
  always authoritative over the remote selection. "Scoped" covers
  copies with disposition `private-registration` / `scope-registration`
  (isolated copies).
- **Click on a dependency or chunk** opens the single inspect card
  (later stage; POC may ship tooltip-only). Card subject is resolved
  against the current model; consumer rows use Task-4 vocabulary and
  the copy's entrypoints map; file links resolve from
  `copy.entrypoints` / chunk group files.
- **Keyboard**: nodes are focusable in reading order; Enter/Space maps
  to click; focus mirrors hover emphasis (closes the challenger's
  declared accessibility gap; may land after the POC).

## 8. Grouping (dependency column)

Segmented **Group by** toggle; each axis defined canonically:

- `source` (mock default): cluster by the copy's evidenced source
  remote; `(host)` pinned first; `ambiguous-source`, `target-only`,
  and `unknown-registration` buckets pinned last under their honest
  names — never `(unresolved)` collapsed into one lie.
- `bundle`: cluster by `BundleClaim.bundle` (`(no bundle)` last); the
  only axis sharing its palette with the chunk column.
- `share scope`: cluster by the copy's resolution domain
  (`__GLOBAL__` first, named scopes alphabetical, private/scoped
  bucket last).

Chunk clusters are always `emitter · bundle`, colored by bundle. POC
ships one axis; the toggle is a follow-up.

## 9. Visual encoding and color

| Channel | Meaning |
| --- | --- |
| column (x) | layer: remote → dependency → chunk |
| cluster box | active grouping axis |
| hue | cluster identity |
| solid vs dashed node border | shared copy vs isolated/private copy (`sourceDisposition`) |
| solid vs dotted consume edge | own-selected vs borrowed (`fallback` / `not-selected` / `anchored` / `self-filled`; tooltip names the states) |
| fill + heavier stroke | remote selected in the filter |
| heaviest stroke | inspected node |
| opacity | hover emphasis only — never data |

Color rules: cluster hues assigned from the **full unfiltered** set so
they never shift under filters; **no recycling** — above the palette
size, clusters render neutral (the T7.7 honesty rule, deviating from
the challenger's `mod 10`). Remote-column nodes are neutral; when the
T7.7 participant palette is active (remote count ≤ palette size), each
remote node carries its participant color dot for cross-view identity.

## 10. Vocabulary contract

Resolution-honest wording only: declared, mapped, resolves to,
selected, not selected, skipped own, anchored, available for loading,
registered chunks. Forbidden: loaded, downloaded, fetched, wire cost,
byte size, cache hit, executed. The resolution-model Task-11 wording
guard covers this view when it lands; the view must pass it
unmodified.

## 11. Honesty rules

- Unresolved claims (unknown / unmapped / blocked) have no copy and no
  edge, but never vanish silently: a muted footer renders the
  `completeness` counts with a link to the Remotes view.
- `source-only` and `ambiguous` bundle claims render qualified, never
  as mapped chunk lists.
- Edge-cap and empty states are explicit (`N additional bundle links
  hidden…`, "Nothing to graph", no-snapshot empty state reuses the
  panel's existing empty handling).

## 12. Staging

**Stage 1 — POC (demo 2026-08-25):** builder + renderer with three
columns, consume edges, hover trace, click-to-filter, one grouping
axis, chunk column with hover-only bundle edges, honest footer,
tooltips. Focused specs for the builder (mapping table §5, filter OR
semantics, chunk-attribution-ignores-selection, determinism).

**Stage 2 — follow-ups:** group-by toggle, layer toggles, inspect
cards, keyboard focus path, participant dots, panel-widening. Each a
separate plan task; nothing in stage 1 may block them structurally.

## 13. Non-goals

No mutation, no live tracking, no refetch/replay of resolution, no
text search (structural filtering only), no force layout, no runtime
delivery/cost instrumentation, no second resolver, no raw-value
dumping (the existing views own that), no pixel goldens.
