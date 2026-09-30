import {
  PASSIVE_PROBE_SOURCE,
  SHIM_MAP_PROBE_SOURCE,
  STORAGE_PROBE_SOURCE,
  mapProbeResult,
  storageProbeIndicated,
} from 'collector';
import { SnapshotProvider } from './snapshot-provider';
import { CollectionErrorV1, SnapshotV1 } from './snapshot-v1';

/** Milliseconds before a DevTools eval is abandoned — a hostile page can hang either probe. */
const EVAL_TIMEOUT_MS = 2000;

/**
 * Failure flags of the DevTools eval exceptionInfo. The other fields
 * (description, value, details) carry page-controlled text and are
 * deliberately never read — bridge errors use a fixed vocabulary so no
 * page data can leak into the snapshot or its export.
 */
interface EvalExceptionInfo {
  isError?: boolean;
  isException?: boolean;
}

type EvalCallback = (result: unknown, exceptionInfo?: EvalExceptionInfo) => void;

/** The `chrome` global as far as the bridge consumes it. */
interface DevtoolsHost {
  devtools?: {
    inspectedWindow?: {
      eval?: (expression: string, callback: EvalCallback) => void;
    };
  };
}

/** A host whose eval chain has been verified present. */
interface AvailableDevtoolsHost {
  devtools: {
    inspectedWindow: {
      eval: (expression: string, callback: EvalCallback) => void;
    };
  };
}

type EvalOutcome =
  | { kind: 'value'; value: unknown }
  | { kind: 'exception' }
  | { kind: 'timeout' };

type ProbeLabel = 'passive-probe' | 'shim-map-probe' | 'storage-probe';

/**
 * Live provider for the packaged extension: evaluates the collector's
 * fixed probe sources in the inspected page and maps the untrusted raw
 * results into `SnapshotV1`. Capture never rejects — every failure mode
 * (missing DevTools global, eval exception, timeout) resolves to the
 * mapper's honest availability states plus a fixed-code bridge error.
 */
export class ChromeSnapshotProvider implements SnapshotProvider {
  async captureSnapshot(): Promise<SnapshotV1> {
    const context = { capturedAt: new Date().toISOString() };

    const host = devtoolsEvalHost();
    if (host === null) {
      return withBridgeErrors(mapProbeResult(null, null, context), [
        { stage: 'bridge', code: 'inspected-window-unavailable' },
      ]);
    }

    const probeOutcome = await evaluateSource(host, PASSIVE_PROBE_SOURCE);
    if (probeOutcome.kind !== 'value') {
      return withBridgeErrors(mapProbeResult(null, null, context), [
        evalFailure(probeOutcome, 'passive-probe'),
      ]);
    }

    const bridgeErrors: CollectionErrorV1[] = [];
    let rawShimMap: unknown = null;
    if (shimProbeIndicated(probeOutcome.value)) {
      const shimOutcome = await evaluateSource(host, SHIM_MAP_PROBE_SOURCE);
      if (shimOutcome.kind === 'value') {
        rawShimMap = shimOutcome.value;
      } else {
        bridgeErrors.push(evalFailure(shimOutcome, 'shim-map-probe'));
      }
    }

    let rawStorage: unknown = null;
    if (storageProbeIndicated(probeOutcome.value)) {
      const storageOutcome = await evaluateSource(host, STORAGE_PROBE_SOURCE);
      if (storageOutcome.kind === 'value') {
        rawStorage = storageOutcome.value;
      } else {
        bridgeErrors.push(evalFailure(storageOutcome, 'storage-probe'));
      }
    }

    return withBridgeErrors(
      mapProbeResult(probeOutcome.value, rawShimMap, context, rawStorage),
      bridgeErrors,
    );
  }
}

function devtoolsEvalHost(): AvailableDevtoolsHost | null {
  const host = (globalThis as { chrome?: DevtoolsHost }).chrome;
  return typeof host?.devtools?.inspectedWindow?.eval === 'function'
    ? (host as AvailableDevtoolsHost)
    : null;
}

function evaluateSource(host: AvailableDevtoolsHost, expression: string): Promise<EvalOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (outcome: EvalOutcome): void => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(outcome);
      }
    };
    const timer = setTimeout(() => settle({ kind: 'timeout' }), EVAL_TIMEOUT_MS);
    try {
      // Full property chain on purpose: the bundle check sanctions exactly
      // the literal `inspectedWindow.eval(` call shape — a local alias for
      // the function would fail the packaged-extension build.
      host.devtools.inspectedWindow.eval(expression, (result, exceptionInfo) => {
        if (exceptionInfo && (exceptionInfo.isError === true || exceptionInfo.isException === true)) {
          settle({ kind: 'exception' });
        } else {
          settle({ kind: 'value', value: result });
        }
      });
    } catch {
      settle({ kind: 'exception' });
    }
  });
}

/** Mirrors the mapper's gate: the shim probe runs only for a data-descriptor `importShim`. */
function shimProbeIndicated(rawProbe: unknown): boolean {
  const globals = readObject(readObject(rawProbe)?.['globals']);
  const summary = readObject(globals?.['importShim']);
  return summary?.['present'] === true && summary?.['descriptor'] === 'data';
}

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function evalFailure(outcome: { kind: 'exception' | 'timeout' }, probe: ProbeLabel): CollectionErrorV1 {
  return {
    stage: 'bridge',
    code: outcome.kind === 'timeout' ? 'eval-timeout' : 'eval-exception',
    detail: probe,
  };
}

function withBridgeErrors(snapshot: SnapshotV1, bridgeErrors: CollectionErrorV1[]): SnapshotV1 {
  snapshot.errors.push(...bridgeErrors);
  return snapshot;
}
