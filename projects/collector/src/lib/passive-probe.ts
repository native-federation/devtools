/**
 * The fixed passive probe: page metadata, the four `__NATIVE_FEDERATION__`
 * repositories, the orchestrator version published on `__NF_ORCHESTRATOR__`
 * (v4.7+), DOM import-map inventory, and an `importShim` presence
 * summary. The repository schemas are the corpus-validated V2 shapes
 * (ground truth: captures/ + docs/work/v2/shape-validation.md) and accept
 * both registry-format generations — participants carry `entries` (v4.5+)
 * or `file` (v4), scoped-externals has its own single-object schema,
 * remotes carry per-remote `integrity` maps whose SRI hash values are
 * collected by policy.
 *
 * Hand-sync discipline: these inline schemas are deliberately duplicated
 * in runtime-schema.ts (the host-side re-projection) — a change here needs
 * mirroring there, and the corpus-shaped specs cover both layers.
 *
 * This is deliberately one fixed expression rather than a source builder —
 * the inspected page never contributes executable text to the eval call.
 * The DevTools `inspectedWindow.eval` API runs it in the inspected page's
 * main world with console-equivalent power; read-only behavior is enforced
 * by this fixed source plus the tests, not by the browser.
 *
 * The precise passivity guarantee (see also safe.ts): the probe performs
 * descriptor-level reads only — it never invokes getters or any page
 * function, and it never writes page state. Proxies are transparent and
 * undetectable; a proxied value observes the descriptor reads and
 * `Object.keys` calls through its traps. Against proxies the guarantee is
 * containment: every access is wrapped, a throwing trap becomes a
 * structured error entry, inline caps bound the copied data, and the
 * result is always a JSON-serializable value.
 *
 * `importShim.getImportMap()` is intentionally NOT called here — invoking
 * a page-provided function would break the "never executes page code"
 * property of this source. The one sanctioned call lives in its own fixed
 * source (shim-map-probe.ts) where it is gated, contained, and separately
 * tested.
 */
export const PASSIVE_PROBE_SOURCE = `(() => {
  "use strict";

  const limits = Object.freeze({
    maxArrayItems: 128,
    maxErrors: 128,
    maxImportMaps: 32,
    maxImportMapTextLength: 131072,
    maxObjectKeys: 128,
    maxStringLength: 4096,
    maxTotalEntries: 512
  });
  const errors = [];
  let retainedEntries = 0;

  const addError = (stage, code, path, observed) => {
    if (errors.length >= limits.maxErrors) return;
    const detail = {};
    if (typeof path === "string") detail.path = path.slice(0, 512);
    if (typeof observed === "number" && Number.isFinite(observed)) detail.observed = observed;
    errors.push(Object.keys(detail).length > 0 ? { stage, code, detail } : { stage, code });
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
    if (value.length > limits.maxStringLength) addError("probe", "string-limit", path, value.length);
    return value.slice(0, limits.maxStringLength);
  };
  const readData = (value, key, path) => {
    if (!isObjectLike(value)) return { status: "invalid" };
    try {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) return { status: "missing" };
      if (!("value" in descriptor)) {
        addError("probe", "accessor-skipped", path);
        return { status: "accessor" };
      }
      return { status: "data", value: descriptor.value };
    } catch {
      addError("probe", "property-unavailable", path);
      return { status: "error" };
    }
  };
  const ownKeys = (value, path) => {
    if (!isObjectLike(value)) return [];
    let keys;
    try {
      keys = Object.keys(value);
    } catch {
      addError("probe", "keys-unavailable", path);
      return [];
    }
    const remaining = Math.max(0, limits.maxTotalEntries - retainedEntries);
    const maximum = Math.min(limits.maxObjectKeys, remaining);
    if (keys.length > maximum) addError("probe", "object-key-limit", path, keys.length);
    const output = [];
    for (let index = 0; index < keys.length && output.length < maximum; index += 1) {
      if (isSafeKey(keys[index])) output.push(keys[index]);
    }
    retainedEntries += output.length;
    return output;
  };
  const arrayLength = (value, path) => {
    let array;
    try {
      array = Array.isArray(value);
    } catch {
      addError("probe", "array-unavailable", path);
      return null;
    }
    if (!array) return null;
    const length = readData(value, "length", path + ".length");
    if (length.status !== "data" || !Number.isSafeInteger(length.value) || length.value < 0) return null;
    const remaining = Math.max(0, limits.maxTotalEntries - retainedEntries);
    const maximum = Math.min(limits.maxArrayItems, remaining);
    if (length.value > maximum) addError("probe", "array-item-limit", path, length.value);
    const retained = Math.min(length.value, maximum);
    retainedEntries += retained;
    return retained;
  };
  const scalar = (value, kind, path) => {
    if (kind === "string") return boundedString(value, path);
    if (kind === "boolean") return typeof value === "boolean" ? value : null;
    return null;
  };

  const schemas = {};
  schemas.string = { type: "scalar", kind: "string" };
  schemas.boolean = { type: "scalar", kind: "boolean" };
  schemas.fileEntries = { type: "map", value: schemas.string };
  schemas.remoteProvider = {
    type: "record",
    fields: {
      bundle: schemas.string,
      cached: schemas.boolean,
      entries: schemas.fileEntries,
      file: schemas.string,
      name: schemas.string,
      pool: schemas.string,
      poolCause: schemas.string,
      requiredVersion: schemas.string,
      servedBy: schemas.string,
      strictVersion: schemas.boolean
    }
  };
  schemas.version = {
    type: "record",
    fields: {
      action: schemas.string,
      host: schemas.boolean,
      remotes: { type: "array", item: schemas.remoteProvider },
      tag: schemas.string
    }
  };
  schemas.external = {
    type: "record",
    fields: {
      dirty: schemas.boolean,
      poolName: schemas.string,
      versions: { type: "array", item: schemas.version }
    }
  };
  schemas.externalPackages = { type: "map", value: schemas.external };
  schemas.externalScopes = { type: "map", value: schemas.externalPackages };
  schemas.scopedPackage = {
    type: "record",
    fields: {
      bundle: schemas.string,
      entries: schemas.fileEntries,
      tag: schemas.string
    }
  };
  schemas.scopedScopes = { type: "map", value: { type: "map", value: schemas.scopedPackage } };
  schemas.expose = { type: "record", fields: { file: schemas.string, moduleName: schemas.string } };
  schemas.remote = {
    type: "record",
    fields: {
      exposes: { type: "array", item: schemas.expose },
      integrity: { type: "map", value: schemas.string },
      scopeUrl: schemas.string
    }
  };
  schemas.remotes = { type: "map", value: schemas.remote };
  schemas.chunks = { type: "map", value: { type: "map", value: { type: "array", item: schemas.string } } };

  const project = (value, schema, path, depth) => {
    if (depth > 12 || !schema) {
      addError("probe", "depth-limit", path);
      return undefined;
    }
    if (schema.type === "scalar") {
      const projected = scalar(value, schema.kind, path);
      return projected === null ? undefined : projected;
    }
    if (schema.type === "array") {
      const length = arrayLength(value, path);
      if (length === null) return undefined;
      const output = [];
      for (let index = 0; index < length; index += 1) {
        const item = readData(value, String(index), path + "[" + index + "]");
        if (item.status !== "data") continue;
        const projected = project(item.value, schema.item, path + "[" + index + "]", depth + 1);
        if (projected !== undefined) output.push(projected);
      }
      return output;
    }
    if (schema.type === "record") {
      if (!isObjectLike(value)) return undefined;
      const output = {};
      const fields = Object.keys(schema.fields);
      for (let index = 0; index < fields.length; index += 1) {
        const key = fields[index];
        const item = readData(value, key, path + "." + key);
        if (item.status !== "data") continue;
        const projected = project(item.value, schema.fields[key], path + "." + key, depth + 1);
        if (projected !== undefined) output[key] = projected;
      }
      return output;
    }
    if (schema.type === "map") {
      if (!isObjectLike(value)) return undefined;
      const output = {};
      const keys = ownKeys(value, path);
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        const item = readData(value, key, path + ".entry");
        if (item.status !== "data") continue;
        const projected = project(item.value, schema.value, path + ".entry", depth + 1);
        if (projected !== undefined) defineSafe(output, key.slice(0, limits.maxStringLength), projected);
      }
      return output;
    }
    return undefined;
  };

  const descriptorSummary = (name) => {
    const result = readData(globalThis, name, "globalThis." + name);
    if (result.status === "missing") return { present: false };
    if (result.status !== "data") return { present: true, descriptor: "accessor", valueType: "unavailable" };
    return { present: true, descriptor: "data", valueType: result.value === null ? "null" : typeof result.value, value: result.value };
  };

  const nativeSummary = descriptorSummary("__NATIVE_FEDERATION__");
  if (Object.prototype.hasOwnProperty.call(nativeSummary, "value")) {
    const nativeValue = nativeSummary.value;
    delete nativeSummary.value;
    nativeSummary.repositories = {};
    const repositorySchemas = {
      remotes: schemas.remotes,
      "scoped-externals": schemas.scopedScopes,
      "shared-externals": schemas.externalScopes,
      "shared-chunks": schemas.chunks
    };
    const names = Object.keys(repositorySchemas);
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index];
      const repository = readData(nativeValue, name, "__NATIVE_FEDERATION__." + name);
      if (repository.status === "missing") {
        nativeSummary.repositories[name] = { present: false };
        continue;
      }
      if (repository.status !== "data") {
        nativeSummary.repositories[name] = { present: true, descriptor: "accessor", valueType: "unavailable" };
        continue;
      }
      const valueType = repository.value === null ? "null" : typeof repository.value;
      const projected = project(repository.value, repositorySchemas[name], "repository." + name, 0);
      nativeSummary.repositories[name] = projected === undefined
        ? { present: true, descriptor: "data", valueType }
        : { present: true, descriptor: "data", valueType, value: projected };
    }
  }

  // Only the plain version data property of the entry for the namespace read above; get is never called.
  const orchestratorSummary = descriptorSummary("__NF_ORCHESTRATOR__");
  if (Object.prototype.hasOwnProperty.call(orchestratorSummary, "value")) {
    const path = "__NF_ORCHESTRATOR__.storage.__NATIVE_FEDERATION__";
    const storage = readData(orchestratorSummary.value, "storage", "__NF_ORCHESTRATOR__.storage");
    const entry = storage.status === "data" ? readData(storage.value, "__NATIVE_FEDERATION__", path) : null;
    const version = entry && entry.status === "data" ? readData(entry.value, "version", path + ".version") : null;
    delete orchestratorSummary.value;
    const bounded = version && version.status === "data" ? boundedString(version.value, path + ".version") : null;
    if (bounded !== null) orchestratorSummary.version = bounded;
  }

  const importShimSummary = descriptorSummary("importShim");
  if (Object.prototype.hasOwnProperty.call(importShimSummary, "value")) delete importShimSummary.value;

  const page = { origin: null, path: null, readyState: null };
  try {
    page.origin = boundedString(globalThis.location.origin, "page.origin");
    page.path = boundedString(globalThis.location.pathname, "page.path");
    page.readyState = boundedString(globalThis.document.readyState, "page.readyState");
  } catch {
    addError("probe", "page-metadata-unavailable", "page");
  }

  let importMaps = null;
  try {
    const nodes = globalThis.document.querySelectorAll('script[type="importmap"],script[type="importmap-shim"]');
    const observed = typeof nodes.length === "number" && Number.isFinite(nodes.length) ? nodes.length : 0;
    const retained = Math.min(observed, limits.maxImportMaps);
    if (observed > retained) addError("probe", "import-map-count-limit", "importMaps", observed);
    const collected = [];
    for (let index = 0; index < retained; index += 1) {
      const node = nodes[index];
      let type = null;
      let text = null;
      try {
        type = node.getAttribute("type");
        text = node.textContent;
      } catch {
        addError("probe", "import-map-node-unavailable", "importMaps[" + index + "]");
      }
      if (type !== "importmap" && type !== "importmap-shim") continue;
      if (typeof text !== "string") text = "";
      if (text.length > limits.maxImportMapTextLength) {
        addError("probe", "import-map-text-limit", "importMaps[" + index + "]", text.length);
        text = text.slice(0, limits.maxImportMapTextLength);
      }
      collected.push({ index, type, text });
    }
    importMaps = collected;
  } catch {
    addError("probe", "import-map-inventory-unavailable", "importMaps");
  }

  return {
    schemaVersion: "passive-probe/3",
    page,
    globals: {
      nativeFederation: nativeSummary,
      orchestrator: orchestratorSummary,
      importShim: importShimSummary
    },
    importMaps,
    errors
  };
})()`;
