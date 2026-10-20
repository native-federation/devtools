# Development & Architecture

Technical companion to the [README](../README.md): what the views show in
detail, the design constraints the code enforces, and how to build, run, and
test the extension.

**Status:** pre-release, under active development. The Packages, Remotes,
Import Map, Graph, and Pools tabs are implemented; the Diagnostics tab is
hidden until its view lands.

## What it shows

**Packages** — one row per package; per share scope the elected version and
every registered version with its status (shared, scoped, partly mapped, not
mapped) and the resolver's verdict per declaration (provides, same version,
reuses shared, own copy, out of range). Filters for multiple versions, out of
range and isolated packages; a range check per scope; a per-version deep dive
with shipped by, entrypoints and files (grouped per build when a version has
several), SRI coverage; the per-copy bindings stay available per scope.
Orchestrator 4.8 borrows no entrypoint from another build, so the devtool shows
no torn entrypoints; older pages render without them.

**Remotes** — the same data from each participant's point of view: exposes
with their mapped targets, the remote's own dependency declarations and where
each one resolves, capability evidence (SRI, dense chunking), chunk
attribution, and scoped externals.

**Graph** — remotes, dependencies, and build files as one traceable picture:
tick remotes to include or exclude their consumers, hover to trace a
resolution path, expand a dependency for its secondary entrypoints or a build
for its files. The dependency column groups by provider (default), share
scope, pool, or build; dashed nodes mark isolated copies, dotted edges mark
borrowed dependencies.

**Import Map** — the raw evidence view: sectioned tables in map order with
owner-consensus headers, each row attributed to its package, provider, and
chunk bundle — with honest outcomes where attribution cannot be proven.

**Pools** — one card per explicit pool tag (`pool` on a shared external): a
matrix of every remote's copy of every member, grouped by the build it loads,
and one verdict per pool (one build, redirected, isolated). Membership is
rebuilt from the stored tags exactly as the orchestrator forms it; the
outcomes are read off the rows pooling wrote back (`servedBy`, `scope`) and
the stored `poolCause` (orchestrator 4.8: `incompatible` or `uncovered`; older
values are shown raw). The tab appears only when the
capture carries a pool tag.

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

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load
unpacked** → select the built extension directory. Open DevTools on any Native
Federation application; the panel appears as a new tab.

## Development

```bash
npm start        # dev panel in the browser, with fixtures
npm test         # UI, bridge, collector, and guard suites
```

The dev panel can replay captured scenarios without a running application via
`?fixture=<id>` — strict share scopes, split versions across remotes, scope
isolation, dynamic initialization, explicit pool tags (coherent, islanded,
anchored, orphan, a four-pool showcase, a twelve-remote portfolio), the dense
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
| `extension/` | MV3 manifest and DevTools page |
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
