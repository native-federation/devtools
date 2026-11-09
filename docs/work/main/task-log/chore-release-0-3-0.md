### Task

Package release 0.3.0: bump the manifest version and build the upload
artefacts for the first Firefox Add-ons (AMO) submission and the Chrome Web
Store.

### Status

DONE

No independent review performed; the only source change is the version
field. Tag, GitHub release and the store/AMO uploads are the maintainer's
steps after this commit.

### Root Cause

Not a bug. Both stores reject an upload whose version is not strictly higher
than the previous one, and the manifest version is shared by the Chrome and
Firefox builds. `0.2.0` is tagged and was packaged for the Chrome Web Store;
since then the panel gained the Firefox build and the Graph changes
(secondary entrypoints on hover, dependency selection, shared tooltips), so
the next version is a minor bump, `0.3.0`.

### Files Modified

- `extension/manifest.json` (modified) — `version` `0.2.0` → `0.3.0`; nothing
  else changes (still no permissions, host permissions, content scripts or
  background).

Build artefacts, not part of the commit (`/dist` is gitignored):

- `dist/native-federation-devtools-v0.3.0.zip` — Chrome, 205 KB, 13 entries,
  `manifest.json` at the root; bundle `panel/main-WHUB6BSW.js`.
- `dist/amo/native_federation_devtools-0.3.0.zip` — Firefox, 205 KB, built
  with `web-ext build -s dist/extension-firefox`.
- `dist/amo/source.zip` — source archive for AMO review (the panel is
  minified): `git archive` of the working tree with this bump, i.e. this
  commit's tree.
- `dist/amo/SUBMISSION.md` — reviewer notes (build environment and steps,
  permissions) and listing text.

### Files Read (Context Only)

- `docs/work/main/task-log/chore-release-0-2-0.md`,
  `docs/work/firefox/plan.md`, `scripts/build-extension.mjs`, `README.md`,
  `PRIVACY.md`, tags `v0.1.0`–`v0.2.0`

### Key Decisions

- **`0.3.0`, not `0.0.3`:** a lower version than the released `0.2.0` would
  be rejected by the Chrome Web Store, which shares the manifest version.
- **Source archive for AMO:** required because the Angular panel bundle is
  minified; reviewer notes give `npm ci && npm run build:extension` on
  Node 24.16.0 / npm 11.

### Review Focus

- **Behavior claims:** both zips carry `"version": "0.3.0"`; the Firefox one
  keeps the add-on id `devtools@native-federation.com`, which becomes
  permanent on the first AMO signing.
- **Plan deviations:** No plan (fix lane).
- **Assumptions / choices:** the version number; `0.2.0` is assumed to be the
  last version uploaded to the Chrome store dashboard.
- **Scope notes:** None.
- **Read next:** `extension/manifest.json` — the one changed line.

### Test Evidence

- `npm run build:extension` → `Extension bundle check passed`, both
  `dist/extension` and `dist/extension-firefox` assembled.
- `npm run lint:firefox` → 0 errors, 1 warning
  (`KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`; Android has no DevTools).
- `unzip -p` on both zips → `"version": "0.3.0"`.
- `npm run test:guards` → 4 files, 97 tests passed.
- `npx prettier --check extension/manifest.json` → clean.
- Not run: a clean rebuild from `source.zip` (`npm ci` in a scratch copy was
  not permitted in the session).

### Open Issues

None.

### Context for Next Task

- After this commit: `git tag -a v0.3.0` with release notes (Firefox build,
  Graph entrypoints/selection/tooltips), push the tag, attach the Chrome zip
  as the GitHub release asset, upload it to the Chrome store dashboard.
- AMO: submit `dist/amo/native_federation_devtools-0.3.0.zip` with
  `dist/amo/source.zip` per `dist/amo/SUBMISSION.md`; untick Firefox for
  Android. Then close the "Open" item in `docs/work/firefox/plan.md`.

### Git State

```
 extension/manifest.json | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```

### Sessions

- claude-code f387f663-d292-4db4-bdef-f98064be8b64 (2026-11-09) — transcript: ~/.claude/projects/-home-auke-Projects-nf-devtools/f387f663-d292-4db4-bdef-f98064be8b64.jsonl
