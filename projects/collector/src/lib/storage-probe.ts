/**
 * The storage probe — the second sanctioned exception to the passive
 * probe's guarantees, next to shim-map-probe.ts.
 *
 * An orchestrator configured with `localStorageEntry` / `sessionStorageEntry`
 * keeps its four repositories as JSON strings under `<namespace>.<key>`
 * in web storage instead of on a global. Reaching a Storage object means
 * running the Window's `localStorage` / `sessionStorage` getter, which the
 * strictly passive probe (passive-probe.ts) must never do — so the access
 * lives in this separate fixed source, which the bridge evaluates only
 * when the passive probe reported a web-storage namespace, or found no
 * default global on a page without a descriptor.
 *
 * Contained, not trusted: the getter is native on a genuine page but can
 * throw (sandboxed frames, blocked site data) or be replaced by a hostile
 * page. Past that one access everything is descriptor-level: items are
 * read as the Storage object's named own properties, so `getItem` (which a
 * page could patch) is never called, storage is never enumerated, and only
 * the four `<namespace>.<key>` names are read. Values leave as bounded raw
 * strings; JSON parsing and schema projection happen host-side in the
 * mapper.
 *
 * Target choice mirrors passive-probe.ts (a fixed source cannot take the
 * namespace as a parameter): the `__NF_ORCHESTRATOR__` descriptor when
 * readable, otherwise both storages under the default namespace.
 */
export const STORAGE_PROBE_SOURCE = `(() => {
  "use strict";

  const limits = Object.freeze({
    maxErrors: 128,
    maxNamespaces: 8,
    maxObjectKeys: 128,
    maxStorageTextLength: 262144,
    maxStringLength: 4096
  });
  const errors = [];

  const addError = (code, path, observed) => {
    if (errors.length >= limits.maxErrors) return;
    const detail = {};
    if (typeof path === "string") detail.path = path.slice(0, 512);
    if (typeof observed === "number" && Number.isFinite(observed)) detail.observed = observed;
    errors.push(Object.keys(detail).length > 0
      ? { stage: "storage-probe", code, detail }
      : { stage: "storage-probe", code });
  };

  const isObjectLike = (value) => value !== null && (typeof value === "object" || typeof value === "function");
  const isSafeKey = (key) => {
    if (typeof key !== "string" || key.length === 0 || key.length > 512) return false;
    if (key === "__proto__" || key === "prototype" || key === "constructor") return false;
    for (let index = 0; index < key.length; index += 1) {
      const code = key.charCodeAt(index);
      if (code < 32 || code === 127) return false;
    }
    return true;
  };
  const readData = (value, key, path) => {
    if (!isObjectLike(value)) return { status: "invalid" };
    try {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) return { status: "missing" };
      if (!("value" in descriptor)) {
        addError("accessor-skipped", path);
        return { status: "accessor" };
      }
      return { status: "data", value: descriptor.value };
    } catch {
      addError("property-unavailable", path);
      return { status: "error" };
    }
  };
  const safeKeys = (value, path) => {
    if (!isObjectLike(value)) return [];
    let keys;
    try {
      keys = Object.keys(value);
    } catch {
      addError("keys-unavailable", path);
      return [];
    }
    const output = [];
    for (let index = 0; index < keys.length && output.length < limits.maxObjectKeys; index += 1) {
      if (isSafeKey(keys[index])) output.push(keys[index]);
    }
    return output;
  };

  let source = { type: "globalThis", namespace: "__NATIVE_FEDERATION__", discovery: "default" };
  const orchestrator = readData(globalThis, "__NF_ORCHESTRATOR__", "globalThis.__NF_ORCHESTRATOR__");
  if (orchestrator.status === "data") {
    const storage = readData(orchestrator.value, "storage", "__NF_ORCHESTRATOR__.storage");
    const namespaces = storage.status === "data"
      ? safeKeys(storage.value, "__NF_ORCHESTRATOR__.storage").sort().slice(0, limits.maxNamespaces)
      : [];
    let chosen = null;
    for (let index = 0; index < namespaces.length; index += 1) {
      const entry = readData(storage.value, namespaces[index], "__NF_ORCHESTRATOR__.storage.entry");
      if (entry.status !== "data") continue;
      if (chosen === null || namespaces[index] === "__NATIVE_FEDERATION__") {
        chosen = { namespace: namespaces[index], entry: entry.value };
      }
    }
    if (chosen !== null) {
      const type = readData(chosen.entry, "type", "__NF_ORCHESTRATOR__.storage.entry.type");
      source = {
        type: type.status === "data" && typeof type.value === "string" ? type.value.slice(0, limits.maxStringLength) : null,
        namespace: chosen.namespace,
        discovery: "descriptor"
      };
    }
  }

  const storageNames = source.discovery === "default"
    ? ["localStorage", "sessionStorage"]
    : ["localStorage", "sessionStorage"].filter((name) => name === source.type);
  const repositoryKeys = ["remotes", "scoped-externals", "shared-externals", "shared-chunks"];

  const readStorage = (name) => {
    let storage;
    try {
      storage = name === "localStorage" ? globalThis.localStorage : globalThis.sessionStorage;
    } catch {
      addError("storage-unavailable", name);
      return { available: false };
    }
    if (!isObjectLike(storage)) return { available: false };
    const items = {};
    for (let index = 0; index < repositoryKeys.length; index += 1) {
      const key = repositoryKeys[index];
      const item = readData(storage, source.namespace + "." + key, name + "." + key);
      if (item.status === "missing" || item.status === "invalid") {
        items[key] = { present: false };
      } else if (item.status !== "data" || typeof item.value !== "string") {
        items[key] = { present: true, descriptor: "unavailable" };
      } else if (item.value.length > limits.maxStorageTextLength) {
        addError("storage-text-limit", name + "." + key, item.value.length);
        items[key] = { present: true, descriptor: "data", truncated: true };
      } else {
        items[key] = { present: true, descriptor: "data", text: item.value };
      }
    }
    return { available: true, items };
  };

  const storages = {};
  for (let index = 0; index < storageNames.length; index += 1) {
    storages[storageNames[index]] = readStorage(storageNames[index]);
  }

  return {
    schemaVersion: "storage-probe/1",
    source,
    storages,
    errors
  };
})()`;
