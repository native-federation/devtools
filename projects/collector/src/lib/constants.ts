/**
 * Hard caps for everything the collector copies out of an inspected page.
 * Ported from the research collector (constants.js) and trimmed to the
 * passive Phase-1 surface: HAR, artifact, recording, and session limits
 * are dropped, and so is the unused override-clamping helper — the
 * defaults are the limits.
 */
export const DEFAULT_LIMITS = Object.freeze({
  maxDepth: 12,
  maxEntries: 512,
  maxObjectKeys: 128,
  maxArrayItems: 128,
  maxStringLength: 4096,
  maxErrorDetailLength: 512,
  maxErrors: 128,
  maxImportMaps: 32,
  maxUrlLength: 4096,
});

export type CollectorLimits = typeof DEFAULT_LIMITS;

/** Version stamp the mapper writes into `SnapshotV1.capture.collectorVersion`. */
export const COLLECTOR_VERSION = 'nf-devtools-collector/4';
