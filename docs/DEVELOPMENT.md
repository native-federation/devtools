# Development & Architecture

Technical companion to the [README](../README.md): what the views show in
detail, the design constraints the code enforces, and how to build, run, and
test the extension.

**Status:** pre-release, under active development. The Packages, Remotes,
Import Map, Graph, and Pools tabs are implemented; the Diagnostics tab is
hidden until its view lands.

## What it shows

**Packages** — one row per package; per share scope the elected version and
every registered version with its status (shared, scoped, subpool, skipped)
and the resolver's verdict per declaration (provides, same version, reuses
shared, subpool, own copy, out of range). An own copy or subpool says why, as a
short cause with the full reason in its tooltip: in a pool, the pool's reason;
otherwise what the package's serving build does not serve (a strict range it
rejects, entrypoints it lacks, a second version). In the `strict` scope the
serving build of each tag is derived (orchestrator 4.8 stores none), and a
shipper counts as running its own copy only when the import map shows it.
Explanations use the same tooltip as the Pools tab.
Filters for multiple versions, out of range and isolated
packages; a range check per scope (a copy's own version always passes); a
per-version deep dive with whose build it is served from, who ships it (range and verdict in each chip's
tooltip), who uses it, entrypoints (marked where
the serving build or global map lacks them, each linking to the Import Map) and
files (grouped per build when a version has several), SRI coverage and a note
when a bundle registers no chunk list. A shipper its pool placed off the map links
to its row in the Pools tab. The range-check matrix ("Compatibility")
always shows under the versions table, also with one version or in the strict
scope. Declarations that resolve nowhere and registry/map
divergences show under the versions only when there are any.
Orchestrator 4.8 borrows no entrypoint from another build, so the devtool shows
no torn entrypoints; older pages render without them.

**Remotes** — the same data from each participant's point of view, read from
the declaration verdicts Packages uses: one Runs row per declared package with
the tag it runs, whose build (`self`, a remote, `scoped`, `subpool of`,
`out of range`, `not mapped`) and the reason when off the norm; flat secondaries
fold into their package when they run the same way. A row this remote serves
says which other remotes run it (`serves 2`, the names in the opened row).
The remoteEntry.json URL (derived from the scope URL, as the orchestrator does)
and exposes share one meta line. Instead of capabilities, a warning flags flat
externals (a secondary entrypoint registered as its own external) or flat
chunking (no chunk list or bundle recorded) — only what the capture proves. The
list marks only out-of-range and unresolved declarations. Private
registrations, claim-less bindings and chunks show only when the capture has
them.

**Graph** — remotes, dependencies, and build files as one traceable picture:
tick remotes to include or exclude their consumers, hover to trace a
resolution path (a dependency's tooltip lists all its entrypoints, ↗ opens it
in Packages), select dependencies to narrow the build files to theirs — every
line is then drawn, white into a selected dependency, grey elsewhere — or
expand a build for its files. The dependency column groups by provider
(default), share scope, pool, or build; dashed nodes mark isolated copies (why
they run their own build is in Remotes and Packages), dotted edges are served
by another remote (the tooltip names it). Tooltips use the same popup as Pools
and Packages.

**Import Map** — the raw evidence view: sectioned tables in map order with
owner-consensus headers, each row attributed to its package, provider, and
chunk bundle — with honest outcomes where attribution cannot be proven.

**Pools** — one card per explicit pool tag (`pool` on a shared external): how
much of what the remotes import the global map serves, then a matrix of every
remote's copy of every member, banded by the pool it runs in — the global map
(the stored winner, plus packages it takes from other builds), a subpool on
another remote's build, or its own build — and one verdict per card. Each
remote off the global map carries a cause chip (`version conflict`, `not
covered`, `unexplained`) whose tooltip lists every reason: every range
rejection (strict or not, own version exempt), every entrypoint the global map
lacks, a combination no single build ships, and for an own build why no
subpool's build serves it either. Nothing is selected by default; a band label
or a row selects that pool. Then a warning under the matrix lists one line per
problem, remotes first, a subpool collapsed to its owner — and selecting a
subpool or own build judges every remote against that build (the
orchestrator's `serves` check, never a re-run of the election), next to where
each actually runs. Membership is rebuilt from the stored tags as the
orchestrator that stored them forms it; placement is read off the rows pooling
wrote back (`servedBy`, `scope`), the reason is recomputed with the
orchestrator 4.8 rules and checked against the stored `poolCause`; a
contradiction reads as unexplained, never guessed. A pool is pending while a
member is `dirty` or a runtime load left its scope undecided (`cache-state`).
Pool chips in Packages and Remotes open the card on that remote's row. The tab
appears only when the capture carries a pool tag.

Any snapshot can be exported as JSON, which doubles as a reproducible bug
report.

In progress: **Diagnostics** (registry↔map lint) and global search. The data
layer behind them is in place — the views are not.

## Design constraints

**Read-only by construction.** The extension inspects without invoking getters
or triggering side effects, apart from two sanctioned, isolated exceptions
(the shim's `getImportMap()` call and the native web-storage getter, see
[Probes](#probes)) — it never mutates the application it is pointed at. This
is enforced by tests in `guards/` and the collector's probe-source specs, not
by convention.

**Explicit about what it cannot know.** Where the runtime data proves
resolution but not intent, the UI says so instead of inferring. Derived values
are labelled (`source-derived`); missing chunk evidence is stated rather than
silently omitted.

**No permissions.** The manifest requests none — no host permissions, no
content scripts. The panel talks to the inspected page through the DevTools
API only.

## Resolution data model

One captured `SnapshotV1` becomes one `FederationModel`: a probe observes
what the page really declared, ingest orders it into canonical evidence,
pure derivations compute which package lands where for which consumer — and
why — and one raw-free projection publishes the result to the views.

The maintained model documentation — the big picture plus five class-diagram
views (registry evidence, effective resolution, declaration claims, resolved
copies, canonical projection) — lives in
[resolution-data-model.md](resolution-data-model.md).

## Install (development build)

```bash
npm install
npm run build:extension
```

This assembles `dist/extension/` for Chrome and `dist/extension-firefox/` for
Firefox; the two differ only in the manifest (the Firefox one adds
`browser_specific_settings.gecko`).

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load
unpacked** → select `dist/extension/`. Open DevTools on any Native
Federation application; the panel appears as a new tab.

In Firefox: `npm run start:firefox` starts a fresh profile with the add-on
loaded and DevTools open (`web-ext run`), or load
`dist/extension-firefox/manifest.json` via `about:debugging` → **Load Temporary
Add-on…**. `npm run lint:firefox` runs the addons.mozilla.org linter; its one
warning, about Firefox for Android, does not apply — Android has no DevTools.

## Development

```bash
npm start        # dev panel in the browser, with fixtures
npm test         # UI, bridge, collector, and guard suites
```

The dev panel can replay captured scenarios without a running application via
`?fixture=<id>` — strict share scopes, split versions across remotes, scope
isolation, dynamic initialization, explicit pool tags (coherent, islanded,
anchored, orphan, a four-pool showcase, a twelve-remote portfolio) and the 4.8
placement reasons (uncovered gap, non-strict rejection, unshipped combination,
own-version range, a strict tag its serving build does not cover), the dense
remoteEntry formats, a live capture of a deployed Angular/React host, and
synthetic storage-discovery states (web storage, custom namespace, custom
adapter).

## Probes

The collector evaluates up to three fixed expressions in the inspected page,
each one a single template literal with no page-derived text:

| Source | Runs | Reads |
| --- | --- | --- |
| `passive-probe.ts` | always | page metadata, the orchestrator storage descriptor (`__NF_ORCHESTRATOR__`), the globalThis registry it points at, DOM import maps; descriptor-level reads only |
| `shim-map-probe.ts` | `importShim` is a data property | `importShim.getImportMap()`, the one sanctioned page-function call |
| `storage-probe.ts` | the descriptor names web storage, or a descriptor-less page has no default global | the four `<namespace>.<key>` items from `localStorage` / `sessionStorage`, as named own properties (never `getItem`) |

The gate for the storage probe (`storageProbeIndicated`) is shared by the
bridge and the fixture pipeline. Custom storage adapters are reported as
unsupported; the descriptor's `get` is never called. Background and design:
[`work/storage-discovery/plan.md`](work/storage-discovery/plan.md).

## Repository layout

| Path | Contents |
| --- | --- |
| `extension/` | MV3 manifest and DevTools page (Chrome and Firefox) |
| `projects/` | collector, bridge, and UI libraries |
| `captures/` | raw runtime captures and the corpus manifests (one per lab corpus) |
| `guards/` | invariant tests, including the privacy scan |
| `docs/` | specs and validation reports |
| `scripts/` | capture, fixture derivation, and build tooling |

Captures are lab data of this project's own scenario runner and its own
deployed demo application only — never third-party pages. See
[`captures/README.md`](../captures/README.md) for the corpus policy,
provenance, and regeneration steps.

The product boundary is defined in
[`specs/native-federation-devtools.md`](specs/native-federation-devtools.md).
