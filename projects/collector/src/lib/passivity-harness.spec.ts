/**
 * Passivity harness (T7-AC-02, contributes to XC-01): evaluating both
 * probe sources against fixture pages — including a hostile one — leaves
 * sentinel globals, DOM import maps, and storage digests byte-identical,
 * fires no getter and no page function except the single sanctioned
 * `getImportMap` call, and returns detached, JSON-serializable data.
 */
import { describe, expect, it } from 'vitest';
import { PASSIVE_PROBE_SOURCE } from './passive-probe';
import { SHIM_MAP_PROBE_SOURCE } from './shim-map-probe';
import { STORAGE_PROBE_SOURCE } from './storage-probe';
import {
  buildFrankensteinPage,
  buildHostilePage,
  digestState,
  evaluateProbe,
} from '../testing/fixture-pages';

interface ProbeErrorLike {
  code: string;
}

interface ProbeResultLike {
  errors: ProbeErrorLike[];
  map?: unknown;
  globals?: {
    nativeFederation: {
      repositories: Record<string, { value?: Record<string, { exposes: { file: string }[] }> }>;
    };
  };
}

describe('passivity harness (frankenstein page)', () => {
  it('leaves page state byte-identical and calls only getImportMap, exactly once', () => {
    const page = buildFrankensteinPage();
    const before = digestState(page.digestTargets);

    const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, page.sandbox) as ProbeResultLike;
    // The strictly passive probe must not have called any page function.
    expect(page.counters.getImportMapCalls).toBe(0);

    const shim = evaluateProbe(SHIM_MAP_PROBE_SOURCE, page.sandbox) as ProbeResultLike;
    // Reads both storages on this descriptor-less page; storageOps proves no Storage method ran.
    evaluateProbe(STORAGE_PROBE_SOURCE, page.sandbox);

    const after = digestState(page.digestTargets);
    expect(after).toBe(before);
    expect(page.counters.getterCalls).toBe(0);
    expect(page.counters.loaderCalls).toBe(0);
    expect(page.counters.storageOps).toBe(0);
    expect(page.counters.getImportMapCalls).toBe(1);

    // Both results are JSON-serializable, error-free on this page.
    expect(JSON.parse(JSON.stringify(raw))).toEqual(raw);
    expect(JSON.parse(JSON.stringify(shim))).toEqual(shim);
    expect(raw.errors).toEqual([]);
    expect(shim.errors).toEqual([]);
  });

  it('returns detached data, not live page references', () => {
    const page = buildFrankensteinPage();
    const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, page.sandbox) as ProbeResultLike;

    const remotes = raw.globals!.nativeFederation.repositories['remotes'].value!;
    remotes['mermaid'].exposes[0].file = 'changed.js';

    const federation = page.sandbox['__NATIVE_FEDERATION__'] as Record<
      string,
      Record<string, { exposes: { file: string }[] }>
    >;
    expect(federation['remotes']['mermaid'].exposes[0].file).not.toBe('changed.js');
  });
});

describe('passivity harness (hostile page)', () => {
  it('leaves hostile page state byte-identical; getters and loaders never fire', () => {
    const page = buildHostilePage();
    const before = digestState(page.digestTargets);

    const raw = evaluateProbe(PASSIVE_PROBE_SOURCE, page.sandbox) as ProbeResultLike;
    const shim = evaluateProbe(SHIM_MAP_PROBE_SOURCE, page.sandbox) as ProbeResultLike;

    const after = digestState(page.digestTargets);
    expect(after).toBe(before);
    expect(page.counters.getterCalls).toBe(0);
    expect(page.counters.loaderCalls).toBe(0);
    expect(page.counters.storageOps).toBe(0);
    expect(page.storageBacking['sentinel']).toBe('storage-unchanged');

    // The getter-backed schema field was skipped, not read.
    expect(raw.errors.some((error) => error.code === 'accessor-skipped')).toBe(true);
    // The hostile getImportMap was called once, threw, and was contained.
    expect(page.counters.getImportMapCalls).toBe(1);
    expect(shim.map).toBeNull();
    expect(shim.errors.some((error) => error.code === 'map-call-threw')).toBe(true);

    // Honest scope: proxies are undetectable, so their traps DO observe
    // our descriptor reads (and the digest's). The guarantee is unchanged
    // state — asserted above — not trap silence.
    expect(page.trapCalls.count).toBeGreaterThan(0);

    expect(JSON.parse(JSON.stringify(raw))).toEqual(raw);
    expect(JSON.parse(JSON.stringify(shim))).toEqual(shim);
  });
});
