/**
 * Static tests on the fixed probe sources (T7-AC-01, contributes to
 * XC-01): both sources are single fixed template literals with no
 * page-derived interpolation, and neither contains a write operation
 * targeting page state. The main probe additionally must not contain the
 * one sanctioned page-function call — that exception belongs exclusively
 * to the shim map probe source.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PASSIVE_PROBE_SOURCE } from './passive-probe';
import { SHIM_MAP_PROBE_SOURCE } from './shim-map-probe';
import { STORAGE_PROBE_SOURCE } from './storage-probe';

/** Ported from the research repo's static probe test, with additions. */
const FORBIDDEN_EVERYWHERE = [
  'localStorage',
  'sessionStorage',
  'setItem',
  'removeItem',
  'fetch(',
  'XMLHttpRequest',
  '.reload(',
  'import(',
  '.click(',
  'innerHTML',
  'outerHTML',
  'appendChild',
  'removeChild',
  'new Function',
  'document.cookie',
  'postMessage',
  'dispatchEvent',
];

function sourceFile(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');
}

function expectFixedExpression(source: string): void {
  expect(typeof source).toBe('string');
  expect(source.startsWith('(() =>')).toBe(true);
  expect(source.endsWith('})()')).toBe(true);
  expect(source.includes('${')).toBe(false);
}

/**
 * The module's code (everything from `export const` on — the doc comment
 * above it may use backticks) must contain exactly one template literal
 * and no interpolation: the exported source cannot have been assembled
 * from anything, page-derived or otherwise.
 */
function expectSingleFixedLiteral(fileName: string): void {
  const file = sourceFile(fileName);
  const exportIndex = file.indexOf('export const');
  expect(exportIndex).toBeGreaterThan(-1);
  expect(file.indexOf('export const', exportIndex + 1)).toBe(-1);
  const code = file.slice(exportIndex);
  expect(code.includes('${')).toBe(false);
  expect(code.split('`').length - 1).toBe(2);
}

describe('PASSIVE_PROBE_SOURCE (static)', () => {
  it('is one fixed expression without interpolation', () => {
    expectFixedExpression(PASSIVE_PROBE_SOURCE);
    expectSingleFixedLiteral('passive-probe.ts');
  });

  it('contains no active or page-derived operation', () => {
    for (const forbidden of [...FORBIDDEN_EVERYWHERE, 'getImportMap']) {
      expect(PASSIVE_PROBE_SOURCE.includes(forbidden), forbidden).toBe(false);
    }
  });
});

describe('SHIM_MAP_PROBE_SOURCE (static)', () => {
  it('is one fixed expression without interpolation', () => {
    expectFixedExpression(SHIM_MAP_PROBE_SOURCE);
    expectSingleFixedLiteral('shim-map-probe.ts');
  });

  it('contains no active operation except the sanctioned getImportMap call', () => {
    for (const forbidden of FORBIDDEN_EVERYWHERE) {
      expect(SHIM_MAP_PROBE_SOURCE.includes(forbidden), forbidden).toBe(false);
    }
    expect(SHIM_MAP_PROBE_SOURCE.includes('getImportMap')).toBe(true);
  });
});

describe('STORAGE_PROBE_SOURCE (static)', () => {
  it('is one fixed expression without interpolation', () => {
    expectFixedExpression(STORAGE_PROBE_SOURCE);
    expectSingleFixedLiteral('storage-probe.ts');
  });

  // The storage names are its sanctioned exception; every Storage method —
  // reading ones included, since a page can patch them — stays forbidden.
  it('contains no active operation beyond reaching the two storages', () => {
    const allowed = new Set(['localStorage', 'sessionStorage']);
    const forbidden = [
      ...FORBIDDEN_EVERYWHERE.filter((token) => !allowed.has(token)),
      'getImportMap',
      'getItem',
      '.key(',
      '.clear(',
      'JSON.parse',
    ];
    for (const token of forbidden) {
      expect(STORAGE_PROBE_SOURCE.includes(token), token).toBe(false);
    }
    expect(STORAGE_PROBE_SOURCE.includes('globalThis.localStorage')).toBe(true);
    expect(STORAGE_PROBE_SOURCE.includes('globalThis.sessionStorage')).toBe(true);
  });
});
