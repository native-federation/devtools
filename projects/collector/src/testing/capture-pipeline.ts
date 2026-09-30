/**
 * The capture→snapshot step shared by the fixture deriver
 * (scripts/derive-fixtures.mjs) and the fixture drift spec: reconstruct a
 * page from a lossless corpus capture, evaluate the real probe sources,
 * map. `capturedAt` comes from the envelope, so derivation is
 * deterministic — one implementation, fixture == pipeline output by
 * construction.
 */
import type { SnapshotV1 } from '../../../devtools-bridge/src/lib/snapshot-v1';
import { PASSIVE_PROBE_SOURCE } from '../lib/passive-probe';
import { SHIM_MAP_PROBE_SOURCE } from '../lib/shim-map-probe';
import { mapProbeResult, storageProbeIndicated } from '../lib/snapshot-mapper';
import { STORAGE_PROBE_SOURCE } from '../lib/storage-probe';
import { buildCapturePage, evaluateProbe } from './fixture-pages';

/**
 * Mirrors ChromeSnapshotProvider's gate: the shim map probe (the one
 * sanctioned page-code call) runs only after the passive probe reported
 * `importShim` as a readable data property.
 */
function shimProbeIndicated(rawProbe: unknown): boolean {
  const summary = (rawProbe as Record<string, any> | null)?.['globals']?.importShim;
  return summary?.present === true && summary?.descriptor === 'data';
}

export function deriveCaptureSnapshot(capture: Record<string, any>): SnapshotV1 {
  const sandbox = buildCapturePage(capture);
  const rawProbe = evaluateProbe(PASSIVE_PROBE_SOURCE, sandbox);
  const rawShimMap = shimProbeIndicated(rawProbe)
    ? evaluateProbe(SHIM_MAP_PROBE_SOURCE, sandbox)
    : null;
  const rawStorage = storageProbeIndicated(rawProbe)
    ? evaluateProbe(STORAGE_PROBE_SOURCE, sandbox)
    : null;
  return mapProbeResult(rawProbe, rawShimMap, { capturedAt: capture['capturedAt'] }, rawStorage);
}
