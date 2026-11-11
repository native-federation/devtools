/**
 * The shim map probe — the one sanctioned exception to the "never executes
 * page code" property of the passive probe.
 *
 * `importShim.getImportMap()` is the documented read API of
 * es-module-shims and the only way to observe the merged effective import
 * map. Calling it executes a page-provided function, which the strictly
 * passive probe (passive-probe.ts) must never do — so the call lives in
 * this separate fixed source instead of weakening the main probe's
 * guarantee. The bridge evaluates it only after the main probe reported
 * `importShim` as a present data property.
 *
 * What is enforceable here is containment, not the callee's behavior: on a
 * genuine es-module-shims page the call is a side-effect-free read that
 * returns a copy of internal state; a hostile page can hang, throw, or
 * return garbage under this name. The source is still one fixed
 * expression (never assembled from page-derived strings), the call is
 * gated and wrapped in try/catch, the copied result is capped inline, and
 * the mapper re-projects it host-side before anything reaches a snapshot.
 * Every other access in this source is a descriptor-level read.
 */
export const SHIM_MAP_PROBE_SOURCE = `(() => {
  "use strict";

  const limits = Object.freeze({
    maxErrors: 128,
    maxObjectKeys: 4096,
    maxStringLength: 4096,
    maxTotalEntries: 16384
  });
  const errors = [];
  let retainedEntries = 0;

  const addError = (code, path) => {
    if (errors.length >= limits.maxErrors) return;
    errors.push(typeof path === "string"
      ? { stage: "shim-probe", code, detail: { path: path.slice(0, 512) } }
      : { stage: "shim-probe", code });
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
  const defineSafe = (target, key, value) => {
    if (!isSafeKey(key)) return;
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true
    });
  };
  const boundedString = (value, path) => {
    if (typeof value !== "string") return null;
    if (value.length > limits.maxStringLength) addError("string-limit", path);
    return value.slice(0, limits.maxStringLength);
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
  const ownKeys = (value, path) => {
    if (!isObjectLike(value)) return [];
    let keys;
    try {
      keys = Object.keys(value);
    } catch {
      addError("keys-unavailable", path);
      return [];
    }
    const remaining = Math.max(0, limits.maxTotalEntries - retainedEntries);
    const maximum = Math.min(limits.maxObjectKeys, remaining);
    if (keys.length > maximum) addError("object-key-limit", path);
    const output = [];
    for (let index = 0; index < keys.length && output.length < maximum; index += 1) {
      if (isSafeKey(keys[index])) output.push(keys[index]);
    }
    retainedEntries += output.length;
    return output;
  };
  const copyStringMap = (value, path) => {
    if (!isObjectLike(value)) return undefined;
    const output = {};
    const keys = ownKeys(value, path);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const item = readData(value, key, path + ".entry");
      if (item.status !== "data") continue;
      const projected = boundedString(item.value, path + ".entry");
      if (projected !== null) defineSafe(output, key.slice(0, limits.maxStringLength), projected);
    }
    return output;
  };

  let map = null;
  const shim = readData(globalThis, "importShim", "globalThis.importShim");
  if (shim.status !== "data" || !isObjectLike(shim.value)) {
    addError("shim-not-readable", "importShim");
  } else {
    const method = readData(shim.value, "getImportMap", "importShim.getImportMap");
    if (method.status !== "data" || typeof method.value !== "function") {
      addError("map-method-unavailable", "importShim.getImportMap");
    } else {
      let raw;
      let called = false;
      try {
        raw = method.value.call(shim.value);
        called = true;
      } catch {
        addError("map-call-threw", "importShim.getImportMap");
      }
      if (called && isObjectLike(raw)) {
        map = {};
        const imports = readData(raw, "imports", "map.imports");
        if (imports.status === "data") {
          const copied = copyStringMap(imports.value, "map.imports");
          if (copied !== undefined) map.imports = copied;
        }
        const integrity = readData(raw, "integrity", "map.integrity");
        if (integrity.status === "data") {
          const copied = copyStringMap(integrity.value, "map.integrity");
          if (copied !== undefined) map.integrity = copied;
        }
        const scopes = readData(raw, "scopes", "map.scopes");
        if (scopes.status === "data" && isObjectLike(scopes.value)) {
          const output = {};
          const keys = ownKeys(scopes.value, "map.scopes");
          for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index];
            const item = readData(scopes.value, key, "map.scopes.entry");
            if (item.status !== "data") continue;
            const copied = copyStringMap(item.value, "map.scopes.entry");
            if (copied !== undefined) defineSafe(output, key.slice(0, limits.maxStringLength), copied);
          }
          map.scopes = output;
        }
      } else if (called) {
        addError("map-not-an-object", "importShim.getImportMap");
      }
    }
  }

  return { schemaVersion: "shim-map-probe/1", map, errors };
})()`;
