import { ChannelsV1, FIXTURES, FixtureId } from 'devtools-bridge';

import { deriveFederation } from '../shared/store/derivations';
import { EffectiveMap, MapMode } from '../shared/store/federation-model';
import { ingestSnapshot } from '../shared/store/ingest';
import { CaptureStatusSource, buildCaptureStatus } from './capture-status';

/** Captured source built through the real ingest → derive chain. */
function capturedSource(fixtureId: FixtureId): CaptureStatusSource {
  const model = ingestSnapshot(FIXTURES[fixtureId]);
  return {
    status: 'captured',
    channels: model.channels,
    mapMode: model.mapMode,
    effectiveMap: model.effectiveMap,
    generation: deriveFederation(model).generationBadge.generation,
    runtimeSource: model.provenance.runtimeSource,
  };
}

const AVAILABLE = { state: 'available' } as const;
const HEALTHY_CHANNELS: ChannelsV1 = {
  nativeFederationGlobals: AVAILABLE,
  domImportMaps: AVAILABLE,
  importShim: AVAILABLE,
};
const NON_EMPTY_MAP: EffectiveMap = {
  imports: { app: 'https://seeded.example/app.js' },
  scopes: {},
  integrity: {},
};
const EMPTY_MAP: EffectiveMap = { imports: {}, scopes: {}, integrity: {} };

/** SEEDED captured source; overrides on top of a healthy shim-mode page. */
function seeded(
  overrides: Partial<{ channels: ChannelsV1; mapMode: MapMode; effectiveMap: EffectiveMap }>,
): CaptureStatusSource {
  return {
    status: 'captured',
    channels: HEALTHY_CHANNELS,
    mapMode: 'shim',
    effectiveMap: NON_EMPTY_MAP,
    generation: 'v4.5',
    ...overrides,
  };
}

describe('buildCaptureStatus', () => {
  // T8-AC-03: healthy native mode — native tags parsed, shim map empty —
  // renders the Import Map channel quietly: no partial, no warning.
  it('keeps the whole strip quiet for the healthy native fixture', () => {
    const vm = buildCaptureStatus(capturedSource('dynamic-init-native'));
    expect(vm).toEqual({ noFederation: null, entries: [], generation: 'v4.5', source: null });
  });

  it('keeps the whole strip quiet for the healthy shim fixture', () => {
    const vm = buildCaptureStatus(capturedSource('dynamic-init-shim'));
    expect(vm).toEqual({ noFederation: null, entries: [], generation: 'v4.5', source: null });
  });

  // T8-AC-04 (SEEDED): shim tags present but the shim yielded nothing —
  // the loader that should execute the tags is unreadable.
  it('renders shim-mode partial with the verbatim reason when the shim is unavailable', () => {
    const vm = buildCaptureStatus(
      seeded({
        channels: {
          ...HEALTHY_CHANNELS,
          importShim: { state: 'unavailable', reason: 'window.importShim is not present' },
        },
      }),
    );
    expect(vm?.entries).toEqual([
      {
        tab: 'Import Map',
        indicator: { kind: 'partial', tooltip: 'window.importShim is not present' },
      },
      {
        tab: 'Diagnostics',
        indicator: {
          kind: 'partial',
          tooltip: 'import-map layer: window.importShim is not present',
        },
      },
    ]);
  });

  // T8-AC-04 (SEEDED): tags that merge to an empty map declare no
  // resolvable setup — ground truth beats channel availability.
  it('renders shim-mode partial when the tags merge to an empty map', () => {
    const vm = buildCaptureStatus(seeded({ effectiveMap: EMPTY_MAP }));
    expect(vm?.entries[0]).toEqual({
      tab: 'Import Map',
      indicator: {
        kind: 'partial',
        tooltip: 'import-map tags present but they merge to an empty map',
      },
    });
  });

  // SEEDED (documented deviation): the empty-merge rule applies in native
  // mode too — "tags parsed" alone no longer renders quietly.
  it('renders native-mode partial when the tags merge to an empty map', () => {
    const vm = buildCaptureStatus(seeded({ mapMode: 'native', effectiveMap: EMPTY_MAP }));
    expect(vm?.entries[0]?.tab).toBe('Import Map');
    expect(vm?.entries[0]?.indicator.kind).toBe('partial');
  });

  // T8-AC-04: no tags of either type → muted off dot.
  it('renders the muted off state when no tags of either type were observed', () => {
    const vm = buildCaptureStatus(seeded({ mapMode: 'none', effectiveMap: EMPTY_MAP }));
    expect(vm?.entries[0]).toEqual({
      tab: 'Import Map',
      indicator: { kind: 'off', tooltip: 'no import-map script tags observed' },
    });
  });

  // T8-AC-05: a not-recognized channel renders in warning tone with the
  // reason verbatim; the warning propagates into Diagnostics.
  it('renders not-recognized globals as warnings with the verbatim reason', () => {
    const vm = buildCaptureStatus(capturedSource('synthetic-not-recognized'));
    const reason = 'global present but carries none of the four repository keys';
    expect(vm?.entries).toEqual([
      { tab: 'Packages', indicator: { kind: 'warning', tooltip: reason } },
      { tab: 'Remotes', indicator: { kind: 'warning', tooltip: reason } },
      {
        tab: 'Diagnostics',
        indicator: { kind: 'warning', tooltip: `runtime layer: ${reason}` },
      },
    ]);
  });

  // T8-AC-06: while capturing and on capture error, no channel state is
  // claimed at all.
  it('claims nothing while capturing and on error', () => {
    expect(buildCaptureStatus({ status: 'capturing' })).toBeNull();
    expect(buildCaptureStatus({ status: 'error' })).toBeNull();
  });

  // T8-AC-07: identical nativeFederationGlobals state, differing only in
  // import-map evidence — the strips must be distinguishable.
  it('distinguishes missing-channel from empty-page', () => {
    const missingChannel = buildCaptureStatus(capturedSource('synthetic-missing-channel'));
    const emptyPage = buildCaptureStatus(capturedSource('synthetic-empty-page'));
    const globalsOff = {
      kind: 'off',
      tooltip: 'window.__NATIVE_FEDERATION__ is not defined',
    };

    // Native tags with content: Import Map quiet, Diagnostics partial
    // (runtime layer missing).
    expect(missingChannel?.entries).toEqual([
      { tab: 'Packages', indicator: globalsOff },
      { tab: 'Remotes', indicator: globalsOff },
      {
        tab: 'Diagnostics',
        indicator: {
          kind: 'partial',
          tooltip: 'runtime layer: window.__NATIVE_FEDERATION__ is not defined',
        },
      },
    ]);

    // No import-map evidence either: all tabs would be off — the strip
    // collapses to the single no-federation summary (channel reasons
    // joined verbatim in the tooltip).
    expect(emptyPage).toEqual({
      noFederation: {
        tooltip:
          'window.__NATIVE_FEDERATION__ is not defined; no import-map script tags observed',
      },
      entries: [],
      generation: null,
      source: null,
    });

    expect(missingChannel?.noFederation).toBeNull();
    expect(missingChannel).not.toEqual(emptyPage);
  });

  // T8-AC-08: the generation badge is provenance surfaced by the shell —
  // v4 live, v4.5 lab, and 'unknown' suppresses the badge.
  it('passes the generation badge through and suppresses unknown', () => {
    expect(buildCaptureStatus(capturedSource('frankenstein-live'))?.generation).toBe('v4');
    expect(buildCaptureStatus(capturedSource('clean-skip'))?.generation).toBe('v4.5');
    expect(buildCaptureStatus(capturedSource('synthetic-empty-page'))?.generation).toBeNull();
  });

  // Storage discovery: the default global renders quietly; any other
  // source is named, legacy web storage is flagged as possibly stale.
  it('names a descriptor-discovered web storage and the uncaptured namespaces', () => {
    expect(buildCaptureStatus(capturedSource('synthetic-local-storage'))?.source).toEqual({
      label: 'localStorage',
      tooltip:
        'Runtime state read from localStorage (__NATIVE_FEDERATION__.*); orchestrator 4.7.0; ' +
        'other namespaces on this page, not captured: __ADMIN_NF__',
      stale: false,
    });
  });

  it('flags web storage found without a descriptor as possibly stale', () => {
    const source = buildCaptureStatus(capturedSource('synthetic-legacy-session-storage'))?.source;
    expect(source?.label).toBe('sessionStorage');
    expect(source?.stale).toBe(true);
    expect(source?.tooltip).toContain('may be left over from an earlier visit');
  });

  it('names a custom globalThis namespace', () => {
    expect(buildCaptureStatus(capturedSource('synthetic-custom-namespace'))?.source).toEqual({
      label: '__MY_NF__',
      tooltip: 'Runtime state read from window.__MY_NF__; orchestrator 4.7.0',
      stale: false,
    });
  });

  it('warns on custom storage adapters instead of a quiet n/a', () => {
    const vm = buildCaptureStatus(capturedSource('synthetic-custom-storage'));
    const reason = "custom storage adapters are not supported (namespace '__NATIVE_FEDERATION__')";
    expect(vm?.noFederation).toBeNull();
    expect(vm?.source).toBeNull();
    expect(vm?.entries).toContainEqual({
      tab: 'Packages',
      indicator: { kind: 'warning', tooltip: reason },
    });
  });
});
