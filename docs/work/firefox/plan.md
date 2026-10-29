# Native Federation DevTools — Firefox

Branch scope: firefox (stacked on packages-v49)

Goal: the same panel in Firefox DevTools. The panel touches the browser in two places only —
`extension/devtools.js` (`devtools.panels.create`, `panels.themeName`) and the bridge's
`inspectedWindow.eval` — and Firefox exposes both, with callbacks, on the `chrome` global in
devtools pages and panels. So this is a packaging scope: no change to the collector, the bridge
contract or the views, unless running in Firefox shows otherwise.

Hard constraints (inherited): the read-only probe sources stay byte-identical across browsers;
`chrome.*` stays confined to the bridge and the extension shell (bridge-boundary guard); the
packaged panel stays MV3-CSP-safe (`check-panel-bundle.mjs`) in both builds.

## Task 1: A Firefox build that runs the panel

Status: DONE. Verified in Firefox 158 via `web-ext run` (dark and light DevTools themes):
frankenstein-meeting-room (shim mode) shows 3 remotes, 20 packages and 22 import-map entries,
as in its Chrome capture; lab `pool-showcase` (4.9.0) reads as remotes-v48 T1-AC-02; example.com
reads *no Native Federation detected*; Refresh re-captures. No code change outside the shell and
the build was needed. `web-ext lint`: 0 errors, one warning about Firefox for Android, which has
no DevTools.

### Instructions

- `build-extension.mjs` assembles a second directory, `dist/extension-firefox/`, from the same
  shell and panel; its manifest is the Chrome manifest plus `browser_specific_settings.gecko`
  (add-on id `devtools@native-federation.com`, permanent once signed on AMO; `strict_min_version`
  140 — the ESR line, and the first that knows `data_collection_permissions`, which AMO requires
  for new add-ons: `{ required: ["none"] }`). The Chrome manifest stays free of Gecko keys, so Chrome shows no unknown-key warning. The bundle
  check scans both directories.
- `devtools.js` passes the 32px icon to `panels.create` (Firefox renders the empty path as a
  broken image; Chrome ignores it either way).
- `npm run start:firefox`: `web-ext run` on the Firefox build, with DevTools opened on start.
- Docs: README install section and `DEVELOPMENT.md` gain the Firefox route (temporary add-on
  via `about:debugging`, or `web-ext run`); the ecosystem table no longer says Chrome-only.

### Acceptance

- **T1-AC-01** — `web-ext lint` on `dist/extension-firefox/` reports no errors.
- **T1-AC-02** — In Firefox, the Native Federation tab appears in DevTools, themed as DevTools.
- **T1-AC-03** — On a live 4.x application (frankenstein-meeting-room, and a local lab
  scenario), the panel captures a snapshot: Overview, Remotes, Packages and the Import Map show
  the same model as Chrome on the same page; no `inspected-window-unavailable`, `eval-exception`
  or `eval-timeout` bridge error.
- **T1-AC-04** — On a page without Native Federation, the panel reads *No Native Federation
  detected*, as in Chrome.
- **T1-AC-05** — `npm test` and `npm run build:extension` stay green; the Chrome build is
  byte-identical to before apart from the icon argument in `devtools.js`.

### Open

- AMO signing and listing (unlisted self-distribution or public) — outside this scope.
