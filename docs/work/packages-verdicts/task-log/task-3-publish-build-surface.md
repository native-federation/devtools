### Task

Publish, per version, the builds that serve it (merged when more than
one), and per (scope, package) the torn entrypoints.

### Status

DONE

UI 624 (+5), bridge 105, collector 102, guards 81 green.

### Files Modified

- `shared/store/resolution/verdict-model.ts` — `VersionBuild`,
  `BuildEntryFile`, `BuildChunkFile`, `TornEntrypoint`;
  `VersionVerdict.builds` / `merged`; `PackageScopeVerdicts.torn`.
- `shared/store/resolution/derive-package-verdicts.ts` — inputs object
  (`PackageVerdictInputs`: claims, copies, resolutions, bundle claims,
  chunk groups, remotes); `buildFactory`, `tornOf`, `sourceRemoteOf`.
- `shared/store/ingest.ts` — `projectedRemotes` shared by the projection
  and the verdicts.
- `derive-package-verdicts.spec.ts` (+5), `build-canonical-projection.spec.ts`
  (pipeline mirror).

### Key Decisions

- **Builds are copies.** The pipeline already materializes one copy per
  build of a version (two 1.2.0 copies in `merged-entrypoints`), so a
  build is a copy with its source remote, entrypoints and files. The
  build serving the package's own specifier leads; that is the copy the
  map evidences first, not a recomputation of the host / served / widest
  order.
- **`merged` only on shared versions.** Two scoped copies of one tag are
  two isolated copies, not a merge.
- **Torn = `self-filled` claim onto a copy of another tag**, attributed by
  the claim's `consumerRegistryPackage`. Same-tag fills don't occur (the
  Task 2 check showed merged secondaries resolve `own-selected`), and the
  rule excludes them anyway.
- **SRI is per mapped entry file** (`hasIntegrity` of the copy's mapped
  resolutions). Chunk files carry no integrity flag: the effective map
  records SRI per mapped target, and chunk files are not targets. Task 6
  must word the heading for entry files, not claim it for chunks.
- **No `downloadedCopyCount` field.** It is the count of versions whose
  status is not `not-loaded`, summed over scopes; the list view sums the
  published statuses instead of a second copy of the same fact.
- **Chunk URLs** resolve against the emitter's scope, like the Graph's
  Build files column (`graph-model.ts`).

### Acceptance Coverage

- **T3-AC-01** — `merged-entrypoints`: `merged`, builds host `{kit}` then
  mfe1 `{kit/dialog, kit/table}`.
- **T3-AC-02** — `torn-many`: eight torn specifiers, each once, filling
  tags 1.2.0 / 1.3.0; no version reads merged.
- **T3-AC-03** — changed: `self-fill` is a flat V2 capture whose `/extra`
  is its own registry key, so it is not torn by this definition; the spec
  pins that. `torn-many` is the torn witness.
- **T3-AC-04** — `frankenstein-live`: every entry file is a mapped copy
  target and SRI follows the map; chunks carry no SRI claim (see above).
- Extra: `dense-chunking-only` chunk files resolve to scope URLs.
