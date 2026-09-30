/*
 * Public API surface of the framework-free collector library — exactly
 * what the devtools-bridge (Task 8) consumes: the three fixed probe sources
 * and the mapper. Everything else (safe reads, schema projection, URL
 * sanitization, error structure) is an internal building block; import it
 * relatively inside this library if needed.
 */
export { PASSIVE_PROBE_SOURCE } from './lib/passive-probe';
export { SHIM_MAP_PROBE_SOURCE } from './lib/shim-map-probe';
export { STORAGE_PROBE_SOURCE } from './lib/storage-probe';
export { mapProbeResult, storageProbeIndicated, type CaptureContext } from './lib/snapshot-mapper';
export { COLLECTOR_VERSION } from './lib/constants';
