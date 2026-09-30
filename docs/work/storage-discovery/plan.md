# Native Federation DevTools — Storage Discovery Plan

Upstream: native-federation/orchestrator#86 (merged, `98c0bfd`, ships in 4.7.0) — publishes
`globalThis.__NF_ORCHESTRATOR__.storage[<namespace>] = { version, type, namespace, keys, get? }`,
frozen, with `type ∈ 'globalThis' | 'localStorage' | 'sessionStorage' | 'custom'`.
Branch scope: storage-discovery (from main)

Problem: the collector hard-codes `globalThis.__NATIVE_FEDERATION__`. A host that configures
`storage: localStorageEntry` / `sessionStorageEntry`, a custom `storageNamespace`, or a custom
adapter shows up as "not detected" today.

Hard constraints for every task:

- Discovery first, defaults second. When `__NF_ORCHESTRATOR__` is a readable data property, its
  entries decide where state lives. Only when it is absent (orchestrator < 4.7) does the
  collector fall back to the default namespace `__NATIVE_FEDERATION__`, tried in the order
  globalThis → localStorage → sessionStorage.
- The descriptor's `get` is never read or called. Custom adapters are not supported: `'custom'`
  yields an `unavailable` channel plus a `custom-storage-unsupported` collection error, never a
  guess.
- `PASSIVE_PROBE_SOURCE` stays strictly passive (descriptor reads only; `localStorage` /
  `sessionStorage` stay on its forbidden list). Web storage is read by a new, separate fixed
  source, `STORAGE_PROBE_SOURCE`: the second sanctioned exception after `SHIM_MAP_PROBE_SOURCE`,
  gated by the bridge the same way.
- Probe sources remain single fixed template literals. Namespaces are page data and are only
  used as property keys (`isSafeKey`-validated), never interpolated into source.
- Web-storage values leave the page as bounded raw strings. `JSON.parse` and the
  `REPOSITORY_SCHEMAS` allowlist projection happen host-side in the mapper, the same way
  document import-map text is handled today.
- Backwards compatible. `SnapshotV1` changes are additive and optional, so existing fixtures,
  captures and exported snapshots still load. A page on orchestrator < 4.7 with the default
  globalThis storage produces exactly today's snapshot, apart from the version stamps.

> The executing agent may adjust scope and ordering based on more up-to-date context discovered
> during implementation, as long as each task still satisfies the constraints above.
>
> Close each task with `/wrap-up N` → `/commit N`.

## Task 1: Discover the orchestrator descriptor in the passive probe

### Instructions

- In `passive-probe.ts`, read `globalThis.__NF_ORCHESTRATOR__` → `storage` using `readData` /
  `ownKeys` only. For each namespace entry (cap: 8, overflow → `namespace-limit` error), project
  the fields `version`, `type`, `namespace` and `keys` (a string array, max 16). Never touch
  `get`. Emit them as `globals.orchestrator`: `{ present, descriptor, entries: [...] }`, the
  same summary shape as the other globals.
- Choose the namespace to read, deterministically:
  1. descriptor present → the `__NATIVE_FEDERATION__` entry if there is one, otherwise the
     first entry by sorted namespace;
  2. no descriptor → `__NATIVE_FEDERATION__`, type `globalThis` (legacy default).
- When the chosen entry's type is `globalThis`, read the repositories from `globalThis[namespace]`
  instead of the literal. Read the entry's `keys` list only as evidence; the probe keeps its own
  four schema-backed repository names, and an unknown key is recorded, not projected.
- Record the choice as `globals.nativeFederation.source =
  { type, namespace, discovery: 'descriptor' | 'default' }`.
- Bump `schemaVersion` to `passive-probe/4`. Mirror everything in `runtime-schema.ts` and the
  mapper (hand-sync rule in the probe's header).

### Acceptance

- The descriptor is absent in the whole existing corpus, and every existing corpus/fixture spec
  passes unchanged apart from the version stamps.
- A descriptor with a custom globalThis namespace (`__MY_NF__`) is read from `globalThis.__MY_NF__`.
- The passivity harness proves `get` never fires: a counting function on the descriptor stays at 0.
- Hostile inputs are contained with error entries and no throw: a descriptor behind a getter, a
  proxy, a non-object `storage`, an unsafe namespace key, or more than 8 entries.

## Task 2: `STORAGE_PROBE_SOURCE` — read orchestrator keys from web storage

### Instructions

- New file `projects/collector/src/lib/storage-probe.ts`: one fixed expression, with a header
  that states the exception like `shim-map-probe.ts` does. It works out the target on its own
  (the same descriptor-then-default rules as Task 1, because a fixed source cannot take the
  namespace as a parameter):
  - descriptor says `localStorage` / `sessionStorage` → that storage, that namespace;
  - no descriptor → `localStorage`, then `sessionStorage`, under `__NATIVE_FEDERATION__`.
- The sanctioned part: accessing `globalThis.localStorage` / `sessionStorage` runs the native
  Window getter, which can throw `SecurityError` (sandboxed iframes, blocked site data). Wrap
  it and record `storage-unavailable`.
- Read items as own property descriptors of the Storage object:
  `Object.getOwnPropertyDescriptor(storage, namespace + "." + key)`. Web Storage exposes its
  items as named properties, so the probe never calls `getItem`, which a page could patch.
  Read only the four known `<namespace>.<key>` names. Never enumerate storage and never read
  other keys.
- Return `{ schemaVersion: 'storage-probe/1', type, namespace, discovery, items: { [key]: string
  | absent }, errors }`. Cap each item at `maxStorageTextLength` (256 KiB, overflow →
  `storage-text-limit`, truncated text is then rejected by the mapper, never half-parsed).
- `probe-source.spec.ts`: add a block for the new source. It must be a fixed expression and may
  mention `localStorage` / `sessionStorage`, but none of `getItem`, `setItem`, `removeItem`,
  `.clear(`, `.key(`, `Object.keys(storage` or anything else in `FORBIDDEN_EVERYWHERE`.
- `fixture-pages.ts`: `makeStorage` gains named item properties plus counting `getItem` / `key`
  methods. The passivity harness asserts that storage digests stay identical and that
  `storageOps` (every method call, including `getItem`) stays 0.

### Acceptance

- Local and session variants each return exactly the four items, and nothing else stored under
  other keys (tripwire key `unrelated.secret` never shows up in the output).
- A throwing `localStorage` getter becomes an error entry and a JSON-serializable result.

## Task 3: Bridge gating and mapper integration

### Instructions

- `chrome-snapshot-provider.ts`: run `STORAGE_PROBE_SOURCE` only when the passive probe reports
  either
  - a chosen descriptor entry of type `localStorage` / `sessionStorage`, or
  - no descriptor and no `__NATIVE_FEDERATION__` global (legacy fallback).

  Put the gate in one function mirrored by the mapper (see `shimProbeIndicated`). Timeouts and
  exceptions use the existing fixed bridge-error vocabulary (`detail: 'storage-probe'`).
- `mapProbeResult(rawProbe, rawShimMap, context, rawStorage?)`: the extra argument is optional,
  so existing callers still compile.
  - Web storage: `JSON.parse` each item in a try/catch (a failure → `storage-json-invalid`, the
    repository counts as unreadable), then run the existing repository projection. A missing
    item means "zero entries", the same as a lazily absent globalThis key.
  - Custom: `nativeFederationGlobals` = `unavailable`, reason `custom storage adapters are not
    supported (namespace '<ns>')`, plus a `mapper` / `custom-storage-unsupported` error.
  - Legacy fallback: if both local and session hold state, take localStorage (the stated
    order) and add a `storage-ambiguous` error.
- `SnapshotV1`: add an optional `runtimeSource?: RuntimeSourceV1`:

  ```ts
  interface RuntimeSourceV1 {
    storage: 'globalThis' | 'localStorage' | 'sessionStorage' | 'custom';
    namespace: string;
    discovery: 'descriptor' | 'default';
    orchestratorVersion: string | null; // from the descriptor; null on legacy pages
    otherNamespaces: string[];          // further descriptor entries, not captured
  }
  ```

  Keep the channel key `nativeFederationGlobals` so exports stay compatible. Bump
  `COLLECTOR_VERSION` to `nf-devtools-collector/4`.
- `privacy-scan` / `export-privacy` guards: add the new source and the new DTO field to the scans.

### Acceptance

- The mapper matrix is covered by specs: descriptor×{globalThis, globalThis with custom
  namespace, local, session, custom}, legacy×{global, local, session, both, none}, and
  hostile×{invalid JSON, truncated item, accessor descriptor}.
- The bridge spec proves that the storage probe does not run for a default globalThis page, runs
  for a localStorage descriptor, and runs for the legacy empty-global case.

## Task 4: Fixtures, corpus and panel wording

### Instructions

- Synthetic fixtures in `devtools-bridge/src/lib/fixtures/`: `descriptor-local-storage`,
  `descriptor-session-storage`, `descriptor-custom-storage`, `descriptor-custom-namespace`,
  `descriptor-multi-namespace`, `legacy-local-storage`. Register them in the fixture picker.
- Lab corpus: make `scripts/lab-capture-dump.js` also dump the descriptor and the four
  web-storage items, then capture one real orchestrator 4.7 scenario with `localStorageEntry`
  (`captures/local-storage/…`) so at least one variant is witnessed rather than synthetic.
- `capture-status-strip`: show the source (`localStorage · __NATIVE_FEDERATION__ ·
  orchestrator 4.7.0`). Web storage found through the legacy default gets a "may be from an
  earlier visit" hint, because localStorage outlives the page session. `not-detected` shows
  "custom storage adapters are not supported" for the custom case.
- Docs: `PRIVACY.md` currently says the extension "does not read … browser storage". Amend it to
  say it reads only the orchestrator's own `<namespace>.<key>` items, never enumerates storage and
  never writes. Update `docs/DEVELOPMENT.md` (probe list) and the README requirement line.

### Acceptance

- Every new fixture renders an honest state in the panel.
- `npm test`, the guards and `check-panel-bundle` pass.

## Decisions (confirmed)

1. Legacy fallback with both web storages filled: localStorage wins, plus a `storage-ambiguous`
   error.
2. Multi-namespace pages: capture one namespace (the default if present, otherwise the first
   sorted one) and list the others in `runtimeSource.otherNamespaces`. Side-by-side rendering is
   a follow-up.
3. Custom adapters: not supported for now (see Task 3). An opt-in active read through `get` is a
   possible follow-up.
