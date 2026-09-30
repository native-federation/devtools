import { ChannelStateV1, ChannelsV1, RuntimeSourceV1, SnapshotGenerationV1 } from 'devtools-bridge';

import { EffectiveMap, MapMode } from '../shared/store/federation-model';

/** The four nav tabs the strip signals for, in nav order. */
export type StripTab = 'Packages' | 'Remotes' | 'Import Map' | 'Diagnostics';

/**
 * Non-quiet channel indicator of one tab. `available` never appears here —
 * it renders quietly (no indicator), so a fully healthy capture yields an
 * empty entry list. `off` is a normal state on non-federated pages, not an
 * error; `warning` marks a channel the collector did not recognize.
 */
export type StripIndicator =
  | { kind: 'off'; tooltip: string }
  | { kind: 'partial'; tooltip: string }
  | { kind: 'warning'; tooltip: string };

export interface StripEntry {
  tab: StripTab;
  indicator: StripIndicator;
}

export interface RuntimeSourceBadge {
  label: string;
  tooltip: string;
  /** Web storage found without an orchestrator descriptor. */
  stale: boolean;
}

export interface CaptureStatusVm {
  /**
   * Single summary replacing all per-tab entries when no channel carries
   * any federation evidence (every tab would be off) — the normal state
   * on non-federated pages. Tooltip carries the channel reasons verbatim.
   */
  noFederation: { tooltip: string } | null;
  /** Non-quiet indicators in nav order; empty when every channel is healthy. */
  entries: StripEntry[];
  /** Generation label from snapshot provenance; null suppresses the badge. */
  generation: SnapshotGenerationV1 | null;
  /**
   * Where the runtime state was read from; null for the default
   * `window.__NATIVE_FEDERATION__`, which renders quietly.
   */
  source: RuntimeSourceBadge | null;
}

export type CaptureStatusSource =
  | { status: 'capturing' }
  | { status: 'error' }
  | {
      status: 'captured';
      channels: ChannelsV1;
      mapMode: MapMode;
      effectiveMap: EffectiveMap;
      generation: SnapshotGenerationV1;
      /** Absent for snapshots from collectors before runtime-source discovery. */
      runtimeSource?: RuntimeSourceV1 | null;
    };

/**
 * Pure strip view model over the captured evidence — the vm layer of
 * the four-layer data path (see `FederationStore`). Spec 4.6 mapping:
 * Packages and Remotes reflect `nativeFederationGlobals`; Import Map
 * aggregates `domImportMaps` + `importShim`; Diagnostics depends on both
 * layers. While capturing and on capture error no channel state is
 * claimed at all (`null`).
 *
 * Mode comes from observed tag types (`mapMode`), never from
 * populated-channel counts — an empty `importShim.getImportMap()` is the
 * healthy norm in native mode. The merged tag map is consulted as ground
 * truth on top: tags that merge to an empty map declare no resolvable
 * setup and render partial in both tag modes.
 */
export function buildCaptureStatus(source: CaptureStatusSource): CaptureStatusVm | null {
  if (source.status !== 'captured') {
    return null;
  }

  const runtimeSource = source.runtimeSource ?? null;
  const globals = globalsIndicator(source.channels.nativeFederationGlobals, runtimeSource);
  const importMap = importMapIndicator(source.channels, source.mapMode, source.effectiveMap);
  const generation = source.generation === 'unknown' ? null : source.generation;
  const sourceBadge = runtimeSourceBadge(runtimeSource);

  if (globals?.kind === 'off' && importMap?.kind === 'off') {
    return {
      noFederation: { tooltip: `${globals.tooltip}; ${importMap.tooltip}` },
      entries: [],
      generation,
      source: sourceBadge,
    };
  }

  const entries: StripEntry[] = [];
  if (globals) {
    entries.push({ tab: 'Packages', indicator: globals }, { tab: 'Remotes', indicator: globals });
  }
  if (importMap) {
    entries.push({ tab: 'Import Map', indicator: importMap });
  }
  const diagnostics = diagnosticsIndicator(globals, importMap);
  if (diagnostics) {
    entries.push({ tab: 'Diagnostics', indicator: diagnostics });
  }

  return { noFederation: null, entries, generation, source: sourceBadge };
}

// A custom adapter is a federated page we cannot read, not a quiet "off".
function globalsIndicator(
  channel: ChannelStateV1,
  runtimeSource: RuntimeSourceV1 | null,
): StripIndicator | null {
  if (channel.state === 'unavailable' && runtimeSource?.storage === 'custom') {
    return { kind: 'warning', tooltip: channel.reason };
  }
  switch (channel.state) {
    case 'available':
      return null;
    case 'unavailable':
      return { kind: 'off', tooltip: channel.reason };
    case 'not-recognized':
      return { kind: 'warning', tooltip: channel.reason };
  }
}

const DEFAULT_NAMESPACE = '__NATIVE_FEDERATION__';

function runtimeSourceBadge(source: RuntimeSourceV1 | null): RuntimeSourceBadge | null {
  if (source === null || source.storage === 'custom') {
    return null;
  }
  const isDefault = source.storage === 'globalThis' && source.namespace === DEFAULT_NAMESPACE;
  if (isDefault && source.otherNamespaces.length === 0) {
    return null;
  }
  const stale = source.discovery === 'default' && source.storage !== 'globalThis';
  const where =
    source.storage === 'globalThis'
      ? `window.${source.namespace}`
      : `${source.storage} (${source.namespace}.*)`;
  const parts = [
    `Runtime state read from ${where}`,
    source.orchestratorVersion === null ? null : `orchestrator ${source.orchestratorVersion}`,
    stale
      ? 'found without an orchestrator storage descriptor — may be left over from an earlier visit'
      : null,
    source.otherNamespaces.length > 0
      ? `other namespaces on this page, not captured: ${source.otherNamespaces.join(', ')}`
      : null,
  ];
  return {
    label: source.storage === 'globalThis' ? source.namespace : source.storage,
    tooltip: parts.filter((part) => part !== null).join('; '),
    stale,
  };
}

function importMapIndicator(
  channels: ChannelsV1,
  mapMode: MapMode,
  effectiveMap: EffectiveMap,
): StripIndicator | null {
  const dom = channels.domImportMaps;
  if (dom.state === 'not-recognized') {
    return { kind: 'warning', tooltip: dom.reason };
  }
  if (dom.state === 'unavailable') {
    return { kind: 'off', tooltip: dom.reason };
  }
  if (mapMode === 'none') {
    return { kind: 'off', tooltip: 'no import-map script tags observed' };
  }
  if (isEmptyMap(effectiveMap)) {
    return { kind: 'partial', tooltip: 'import-map tags present but they merge to an empty map' };
  }
  if (mapMode === 'shim') {
    // Shim mode: the shim is the loader — tags nobody executes are broken.
    // In native mode the shim channel plays no role at all.
    const shim = channels.importShim;
    if (shim.state === 'not-recognized') {
      return { kind: 'warning', tooltip: shim.reason };
    }
    if (shim.state === 'unavailable') {
      return { kind: 'partial', tooltip: shim.reason };
    }
  }
  return null;
}

/** Integrity alone resolves nothing, so it does not count as content. */
function isEmptyMap(map: EffectiveMap): boolean {
  return (
    Object.keys(map.imports).length === 0 &&
    Object.values(map.scopes).every((scope) => Object.keys(scope).length === 0)
  );
}

/**
 * Diagnostics lints registry ↔ map, so it needs both layers: a warning on
 * either side propagates, one unhealthy side renders partial. Never
 * called with both sides off — that collapses to the no-federation
 * summary before any per-tab entry is built.
 */
function diagnosticsIndicator(
  runtimeSide: StripIndicator | null,
  mapSide: StripIndicator | null,
): StripIndicator | null {
  if (runtimeSide === null && mapSide === null) {
    return null;
  }
  const parts = [
    ...(runtimeSide ? [`runtime layer: ${runtimeSide.tooltip}`] : []),
    ...(mapSide ? [`import-map layer: ${mapSide.tooltip}`] : []),
  ];
  const tooltip = parts.join('; ');
  if (runtimeSide?.kind === 'warning' || mapSide?.kind === 'warning') {
    return { kind: 'warning', tooltip };
  }
  return { kind: 'partial', tooltip };
}
