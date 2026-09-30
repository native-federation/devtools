# Task 2: `STORAGE_PROBE_SOURCE` — read orchestrator keys from web storage

### Status
DONE

### Summary
- New fixed source `projects/collector/src/lib/storage-probe.ts` (`storage-probe/1`), exported
  from the collector's public API. It works out the target the same way the passive probe does
  (descriptor entry, preferring `__NATIVE_FEDERATION__`, otherwise the first sorted data entry;
  with no descriptor, both storages under the default namespace).
- The only non-descriptor access is `globalThis.localStorage` / `globalThis.sessionStorage`,
  wrapped so that a throw is recorded as `storage-unavailable`. Items are read as the Storage
  object's named own properties for the four `<namespace>.<key>` names only. No Storage method
  is called and storage is never enumerated.
- Output: `{ schemaVersion, source, storages: { [name]: { available, items } }, errors }`.
  An item is `{ present: false }`, `{ present: true, descriptor: 'data', text }`,
  `{ …, truncated: true }` (over 256 KiB, text withheld, `storage-text-limit`), or
  `{ present: true, descriptor: 'unavailable' }` (accessor or non-string).
- Test helper `makeStorage` is now Storage-like: items as own data properties and
  non-enumerable methods (`getItem`, `key`, `setItem`, `removeItem`, `clear`) that count as
  storage ops.

### Tests
- `probe-source.spec.ts`: new source is one fixed literal. Everything in the forbidden list
  except the two storage names is still forbidden, plus `getItem`, `.key(`, `.clear(` and
  `JSON.parse`.
- `storage-probe.spec.ts` (8 cases): local/session descriptor reads with an `unrelated.secret`
  tripwire, no read for globalThis/custom, legacy dual read, throwing getter (installed in-context
  because node:vm ignores sandbox accessors), oversized item, accessor item, hostile page digest.
- Passivity harness also runs the storage probe on the frankenstein page; `storageOps` stays 0.
- Collector 98/98.
