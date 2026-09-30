# Privacy Policy — Native Federation DevTools

_Last updated: 2026-09-29_

**Short version: the extension collects nothing. No data ever leaves your
machine.**

Native Federation DevTools is a read-only Chrome DevTools panel. It has a
single purpose: showing how a Native Federation application resolved its
shared dependencies — packages, remotes, the import map, and the resulting
dependency graph.

## What the extension reads

Only while DevTools is open on a page you inspect, and only when you open the
Native Federation panel, the extension reads:

- `location.origin`, `location.pathname`, and `document.readyState` of the
  inspected page
- the Native Federation registry the runtime keeps in the page: by default
  `window.__NATIVE_FEDERATION__`, or wherever the orchestrator's storage
  descriptor (`window.__NF_ORCHESTRATOR__`) says it lives
- when the application stores that registry in `localStorage` or
  `sessionStorage`: exactly the four orchestrator entries
  `<namespace>.remotes`, `<namespace>.shared-externals`,
  `<namespace>.scoped-externals` and `<namespace>.shared-chunks`, nothing else
- the import maps present in the page's DOM
- whether an `importShim` global is present

That is the complete list. The read is performed by one fixed expression that
ships inside the extension bundle
([`passive-probe.ts`](projects/collector/src/lib/passive-probe.ts)); the
inspected page never contributes executable text to it, and the probe performs
descriptor-level reads only — it never calls page functions and never writes
page state. The four web-storage entries are read by a separate fixed
expression ([`storage-probe.ts`](projects/collector/src/lib/storage-probe.ts))
that runs only when the registry lives in web storage. It reads those entries
by name, never lists or modifies storage, and never calls `getItem` or any
other storage method.

## What the extension does not do

- It declares **no permissions** and **no host permissions**, has no content
  scripts and no background page.
- It makes **no network requests** of any kind: no analytics, no telemetry, no
  crash or error reporting, no update pings.
- It loads and executes **no remote code**. Everything it runs is in the
  package you installed.
- It does not read cookies, form input, credentials, browsing history, other
  browser-storage entries, or page content beyond the fields listed above.
- It does not read custom storage adapters: when the orchestrator reports one,
  the panel says it is not supported.
- It never modifies the inspected page.

## Where the data goes

Nowhere. The snapshot lives in memory in the DevTools panel while the panel is
open and is discarded when you close DevTools.

The **Export JSON** button writes that snapshot to a file you choose, on your
own machine. The file is not uploaded anywhere; what you do with it afterwards
is entirely up to you.

## URLs in snapshots

Every URL is passed through a sanitizer
([`privacy.ts`](projects/collector/src/lib/privacy.ts)) before it can enter a
snapshot: user info, query string, and fragment are stripped. Access tokens or
session identifiers carried in query parameters therefore never reach the
panel or an exported file.

## Third parties

There are none. No data is shared, sold, or transferred to anyone, and nothing
is used for advertising, profiling, or creditworthiness assessment.

## Contact

Questions or concerns: please open an issue at
<https://github.com/native-federation/devtools/issues>.
