<div align="center">

<img src="docs/assets/readme/native-federation-logo.png" alt="Native Federation logo" width="110">

# Native Federation DevTools

**See what your micro frontends actually negotiated.**

A read-only Chrome DevTools panel for [Native Federation](https://native-federation.com) applications running the **v4 Orchestrator**.

![License: MIT](https://img.shields.io/badge/license-MIT-blue)
[![Latest release](https://img.shields.io/github/v/release/native-federation/devtools?include_prereleases&label=release)](https://github.com/native-federation/devtools/releases)
![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-coming_soon-orange)
![Manifest V3](https://img.shields.io/badge/manifest-v3-informational)
![Requires Orchestrator v4](https://img.shields.io/badge/requires-orchestrator_v4-important)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/hero-graph-dark.png">
  <img src="docs/assets/readme/hero-graph-light.png" alt="The Graph tab: remotes, the dependency copies they resolve to, and the chunk files those copies load">
</picture>

</div>

> *Which version of `@angular/core` won? Who provided it? Why did that remote
> end up with its own copy?*

The negotiation happens once at startup — then it disappears into the import
map. Native Federation DevTools reads it back out of the running page and
explains it: every shared package, every remote, every chunk. Evidence, not
guesses.

## What you get

- 📦 **Packages** — the negotiation, per package: every candidate version, who
  declared which range, which file actually serves it. Conflicts are called
  out, not averaged away.
- 🛰️ **Remotes** — each participant from its own point of view: what it
  exposes, what it declares, and where every single dependency really
  resolves.
- 🕸️ **Graph** — remotes, dependency copies, and chunks as one traceable
  picture. Hover to trace, click to filter.
- 🗺️ **Import Map** — the effective map, row by row, each entry attributed
  to its package, its provider, and the chunk bundle that serves it.
- 📤 **Export JSON** — freeze the entire snapshot to a file. Doubles as a
  reproducible bug report.
- 🔒 **Read-only, zero permissions** — no host permissions, no content
  scripts. The panel inspects; it never mutates the page. Enforced by tests,
  not by convention.

In progress: **Diagnostics** (registry↔map lint) and global search.

## Hover to trace

One hover answers *"who shares this — and which files does it load?"*

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/hover-trace-dark.gif">
  <img src="docs/assets/readme/hover-trace-light.gif" alt="Hovering nodes in the Graph tab: the trace lights up the hovered node's remotes, dependency copies, and chunk files while everything else dims">
</picture>

Dashed nodes are isolated copies, dotted edges are borrowed dependencies —
the sharing story is visible at a glance.

## Every negotiation, explained

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/packages-dark.png">
  <img src="docs/assets/readme/packages-light.png" alt="The Packages tab: @angular/core with its mapped files, SRI coverage, the four participants that declared it with their ranges, and the chunk files it loads">
</picture>

Four participants declared `@angular/core` — one version won, three were not
selected, and every mapped file is accounted for, SRI included.

## Every remote, from its own point of view

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/remotes-dark.png">
  <img src="docs/assets/readme/remotes-light.png" alt="The Remotes tab: a remote's exposes with mapped files, what it provides to the federation, and every dependency it consumes from other remotes">
</picture>

Exposes, provided packages, and — line by line — which dependency this remote
consumes from whom, and which own version lost the negotiation.

## Requirements

> **Requires the v4 Orchestrator.** The panel reads the registry that
> [`@softarc/native-federation-orchestrator`](https://github.com/native-federation/orchestrator)
> keeps in the page (`window.__NATIVE_FEDERATION__`). Applications on the
> classic **v3 runtime** (`@softarc/native-federation-runtime`) do not expose
> this registry and are **not supported** — on such pages the panel shows
> *No Native Federation detected*.
>
> The registry is found under the default storage options, a custom
> `storageNamespace`, and `localStorage` / `sessionStorage` storage. Since
> orchestrator 4.7 the panel follows the storage descriptor the orchestrator
> publishes (`window.__NF_ORCHESTRATOR__`). On older versions it falls back to
> the default namespace in `window`, then `localStorage`, then
> `sessionStorage`. **Custom storage adapters are not supported.**

## Install

🛒 **Chrome Web Store: coming soon** — the extension will be published under
the official Native Federation presence. Until then, install it from a GitHub
release. No build toolchain needed — it takes about a minute.

### From a release

1. Download `native-federation-devtools-<version>.zip` from the
   [releases page](https://github.com/native-federation/devtools/releases)
   and unzip it into a folder of its own (the zip has no top-level folder).
   Keep that folder — Chrome loads the extension from it.
2. Open `chrome://extensions` in Chrome — type it into the address bar.
3. Turn on **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the unzipped folder.
5. Open Chrome DevTools (`F12`, or `Ctrl+Shift+I` / `⌥⌘I`) on an application
   that runs the v4 Orchestrator. The panel appears as a new
   **Native Federation** tab — if DevTools was already open, close and reopen
   it once.

Unpacked extensions do not update themselves. To upgrade, unzip the new
release into the same folder and click the ↻ reload icon on the extension's
card in `chrome://extensions`. Automatic updates come with the Web Store.

### From source

Contributors can build the extension themselves — see
[Development & Architecture](docs/DEVELOPMENT.md#install-development-build).

## Native Federation ecosystem

| Project | What it is |
| --- | --- |
| [native-federation.com](https://native-federation.com) | Project home — docs, guides, team, resources |
| [orchestrator](https://github.com/native-federation/orchestrator) | Runtime micro frontend orchestrator (v4) — the runtime this panel reads |
| **devtools** (this repo) | Chrome DevTools panel for inspecting running federations |

## Documentation

- [Development & Architecture](docs/DEVELOPMENT.md) — build, run, test,
  repository layout, and the design constraints behind the tool
- [Resolution data model](docs/resolution-data-model.md) — how a captured
  snapshot becomes the model behind the views

## About

Developed and maintained by [Lutz Leonhardt](https://lutzleonhardt.de) as
part of the official Native Federation project.

Built in an agentic workflow with Claude Code and Codex as pair programmers —
architecture, review, and verification stay with the maintainer.

Licensed under [MIT](LICENSE).
