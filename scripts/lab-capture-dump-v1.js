/**
 * Lab capture probe — lossless in-page dump for the V2 scenario corpus.
 *
 * This file is ONE async function expression, evaluated verbatim in the
 * page: by the chrome-devtools MCP (`evaluate_script`) today, or by any
 * headless CDP script tomorrow (`Runtime.evaluate("(" + source + ")()",
 * { awaitPromise: true })`). It must stay driver-agnostic — no arguments,
 * no session state.
 *
 * Deliberately NOT the product probe: no allowlist, no string caps, no
 * descriptor-level defensive reads. This measures our own lab app
 * (playground scenario runner), not a hostile page — losslessness is the
 * whole point (the allowlist is what made the previous corpus unusable
 * for shape validation). The product probes stay untouched until the
 * shapes captured here are validated.
 *
 * Envelope: `lab-lossless-capture/1`, a structurally compatible sibling
 * of the research corpus's `frankenstein-runtime-capture/1` — same
 * top-level blocks (`page`, `collector`, `channels` with per-channel
 * `availability`/`observedAt`/`data`, `collectionErrors`), plus a
 * `scenario` block. `collector.kind` lives in the run manifest, not
 * here: the page cannot know its driver, and hardcoding one would lie
 * as soon as the headless script reuses this file.
 */
(async () => {
  "use strict";

  const ORCHESTRATOR_COMMIT = "8e5e0b3";
  const READY_TIMEOUT_MS = 20000;

  const collectionErrors = [];
  const addError = (code, path, detail) => {
    const entry = { stage: "lab-probe", code };
    if (path !== undefined || detail !== undefined) {
      entry.detail = {};
      if (path !== undefined) entry.detail.path = path;
      if (detail !== undefined) entry.detail.info = String(detail);
    }
    collectionErrors.push(entry);
  };

  // Lossless JSON round-trip. `undefined` result (functions, undefined)
  // is recorded, not silently dropped.
  const cloneJson = (value, path) => {
    try {
      const text = JSON.stringify(value);
      if (text === undefined) {
        addError("non-json-value", path);
        return null;
      }
      return JSON.parse(text);
    } catch (error) {
      addError("clone-failed", path, error && error.message);
      return null;
    }
  };

  const now = () => new Date().toISOString();

  // --- scenario readiness -------------------------------------------------
  // Two modes, decided by the presence of the runner's ready promise. Lab
  // scenarios define `__NF_SCENARIO_READY__` (runner contract) and are
  // awaited exactly as before — their envelope shape is unchanged. Live
  // pages (frankenstein-live) do not; instead of recording an error, fall
  // back to a settled-page condition and say so via `readySource`/`phase`
  // — keys that exist ONLY in fallback mode. `orchestratorCommit` is the
  // pinned lab commit in runner mode and null in fallback mode: a live
  // deployment's version is provenance, recorded in the run manifest as
  // far as observable, never stamped by the probe.
  const scenario = {
    scenarioId: null,
    orchestratorCommit: ORCHESTRATOR_COMMIT,
    ready: false,
    readyError: null
  };
  try {
    scenario.scenarioId =
      typeof globalThis.__NF_SCENARIO_ID__ === "string" ? globalThis.__NF_SCENARIO_ID__ : null;
    const readyPromise = globalThis.__NF_SCENARIO_READY__;
    if (readyPromise === undefined) {
      scenario.orchestratorCommit = null;
      scenario.readySource = "page-settled";
      scenario.phase =
        typeof globalThis.__NF_SCENARIO_PHASE__ === "string" ? globalThis.__NF_SCENARIO_PHASE__ : null;
      await new Promise((resolveSettled, rejectSettled) => {
        const timer = setTimeout(
          () => rejectSettled(new Error("settle-timeout after " + READY_TIMEOUT_MS + "ms")),
          READY_TIMEOUT_MS
        );
        const settle = () => {
          clearTimeout(timer);
          resolveSettled();
        };
        if (globalThis.document.readyState === "complete") settle();
        else globalThis.addEventListener("load", settle, { once: true });
      });
      scenario.ready = true;
    } else {
      await Promise.race([
        Promise.resolve(readyPromise),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("ready-timeout after " + READY_TIMEOUT_MS + "ms")), READY_TIMEOUT_MS)
        )
      ]);
      scenario.ready = true;
    }
  } catch (error) {
    // Capture proceeds anyway (verify-scenario precedent): a failed
    // scenario's registry state is still evidence.
    scenario.readyError = String((error && error.message) || error);
    addError("scenario-ready-rejected", "scenario", scenario.readyError);
  }

  // --- page ---------------------------------------------------------------
  const page = { url: null, origin: null, path: null, title: null, readyState: null };
  try {
    page.url = globalThis.location.href;
    page.origin = globalThis.location.origin;
    page.path = globalThis.location.pathname;
    page.title = globalThis.document.title;
    page.readyState = globalThis.document.readyState;
  } catch (error) {
    addError("page-metadata-unavailable", "page", error && error.message);
  }

  // --- channel: nativeFederationGlobals (lossless namespace clone) --------
  const nativeFederationGlobals = { availability: "unavailable", observedAt: now(), data: null };
  try {
    const namespaceValue = globalThis.__NATIVE_FEDERATION__;
    if (namespaceValue === undefined || namespaceValue === null) {
      nativeFederationGlobals.data = { present: false };
      addError("namespace-missing", "channels.nativeFederationGlobals");
    } else {
      // ALL own keys (incl. non-enumerable), not just the four known
      // repositories — unexpected sections of future orchestrator
      // versions must stay visible.
      const namespaceKeys = Object.getOwnPropertyNames(namespaceValue);
      const namespace = {};
      for (const key of namespaceKeys) {
        namespace[key] = cloneJson(namespaceValue[key], "channels.nativeFederationGlobals.namespace." + key);
      }
      nativeFederationGlobals.availability = "available";
      nativeFederationGlobals.data = {
        present: true,
        valueType: typeof namespaceValue,
        namespaceKeys,
        namespace
      };
    }
  } catch (error) {
    addError("namespace-unreadable", "channels.nativeFederationGlobals", error && error.message);
  }

  // --- channel: domImportMaps (tag inventory, document order) -------------
  // Adapted from projects/collector/src/lib/passive-probe.ts:279-307,
  // minus count/length caps; raw text is the ground truth, `map` is the
  // parsed convenience copy.
  const domImportMaps = { availability: "unavailable", observedAt: now(), data: null };
  try {
    const nodes = globalThis.document.querySelectorAll('script[type="importmap"],script[type="importmap-shim"]');
    const maps = [];
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const type = node.getAttribute("type");
      if (type !== "importmap" && type !== "importmap-shim") continue;
      const text = typeof node.textContent === "string" ? node.textContent : "";
      let parsed = false;
      let map = null;
      try {
        map = JSON.parse(text);
        parsed = true;
      } catch (error) {
        addError("import-map-parse-failed", "channels.domImportMaps.maps[" + index + "]", error && error.message);
      }
      maps.push({ index, type, text, parsed, map });
    }
    domImportMaps.availability = "available";
    domImportMaps.data = { count: maps.length, maps };
  } catch (error) {
    addError("import-map-inventory-unavailable", "channels.domImportMaps", error && error.message);
  }

  // --- channel: importShim (effective merged map incl. integrity) ---------
  // Same read as projects/collector/src/lib/shim-map-probe.ts
  // (importShim.getImportMap() returns a copy of internal state), but the
  // result is cloned losslessly — integrity hash values are kept.
  const importShim = { availability: "unavailable", observedAt: now(), data: null };
  try {
    const shimValue = globalThis.importShim;
    const present = typeof shimValue === "function" || (typeof shimValue === "object" && shimValue !== null);
    if (!present) {
      importShim.data = { present: false };
      addError("shim-missing", "channels.importShim");
    } else {
      const data = {
        present: true,
        valueType: typeof shimValue,
        version: typeof shimValue.version === "string" ? shimValue.version : null,
        map: null
      };
      if (typeof shimValue.getImportMap === "function") {
        try {
          data.map = cloneJson(shimValue.getImportMap(), "channels.importShim.map");
        } catch (error) {
          addError("shim-map-call-threw", "channels.importShim.map", error && error.message);
        }
      } else {
        addError("shim-map-method-unavailable", "channels.importShim.map");
      }
      importShim.availability = "available";
      importShim.data = data;
    }
  } catch (error) {
    addError("shim-unreadable", "channels.importShim", error && error.message);
  }

  return {
    schemaVersion: "lab-lossless-capture/1",
    capturedAt: now(),
    scenario,
    page,
    collector: {
      probe: "lab-capture-dump/1",
      sanitization: "lossless"
    },
    channels: {
      nativeFederationGlobals,
      domImportMaps,
      importShim
    },
    collectionErrors
  };
})
