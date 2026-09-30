import { describe, expect, it } from 'vitest';
import { FIXTURES, PRIMARY_FIXTURE_ID } from './fixtures';
import { SnapshotV1 } from './snapshot-v1';

const fixtureEntries = Object.entries(FIXTURES) as [string, SnapshotV1][];
const primary: SnapshotV1 = FIXTURES[PRIMARY_FIXTURE_ID];

function sharedParticipants(snapshot: SnapshotV1) {
  return Object.values(snapshot.runtime?.sharedExternals ?? {}).flatMap((packages) =>
    Object.values(packages).flatMap((external) =>
      external.versions.flatMap((version) => version.remotes),
    ),
  );
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

describe('SnapshotV1 (T2-AC-01)', () => {
  it.each(fixtureEntries)('%s survives a serialize → parse round-trip', (_id, fixture) => {
    const roundTripped = JSON.parse(JSON.stringify(fixture));
    expect(roundTripped).toEqual(fixture);
  });

  it.each(fixtureEntries)('%s is versioned with schemaVersion 1', (_id, fixture) => {
    expect(fixture.schemaVersion).toBe(1);
    expect(fixture.capture.mode).toBe('passive');
  });

  it('keeps runtime outcome and import-map resolution structurally separate', () => {
    expect(Object.keys(primary.runtime!)).toEqual([
      'remotes',
      'scopedExternals',
      'sharedExternals',
      'sharedChunks',
      'generation',
    ]);
    expect(Object.keys(primary.importMaps!)).toEqual(['documentMaps', 'effective']);
    // The runtime layer must not absorb import-map concepts and vice versa.
    expect(primary.runtime).not.toHaveProperty('imports');
    expect(primary.runtime).not.toHaveProperty('effective');
    expect(primary.importMaps).not.toHaveProperty('remotes');
    expect(primary.importMaps).not.toHaveProperty('sharedExternals');
  });
});

describe('SnapshotV1 pooling-anchor compatibility (T2.1-AC-01, T2.1-AC-02)', () => {
  it('round-trips witnessed pool and servedBy presence without changing schemaVersion', () => {
    const roundTripped: SnapshotV1 = JSON.parse(JSON.stringify(FIXTURES['pooling-anchor']));

    expect(roundTripped.schemaVersion).toBe(1);
    expect(roundTripped.capture.collectorVersion).toBe('nf-devtools-collector/4');

    const declarations = Object.entries(roundTripped.runtime!.sharedExternals).flatMap(
      ([scope, packages]) =>
        Object.entries(packages).flatMap(([packageName, external]) =>
          external.versions.flatMap((version) =>
            version.remotes.map((remote) => ({
              scope,
              packageName,
              tag: version.tag,
              name: remote.name,
              pool: hasOwn(remote, 'pool') ? remote.pool : '<absent>',
              servedBy: hasOwn(remote, 'servedBy') ? remote.servedBy : '<absent>',
            })),
          ),
        ),
    );

    expect(declarations).toEqual([
      {
        scope: '__GLOBAL__',
        packageName: '@nf-lab/conflict-lib',
        tag: '2.0.0',
        name: '__NF-HOST__',
        pool: '<absent>',
        servedBy: '<absent>',
      },
      {
        scope: '__GLOBAL__',
        packageName: '@nf-lab/conflict-lib',
        tag: '1.0.0',
        name: 'mfe1',
        pool: 'family',
        servedBy: 'mfe1',
      },
      {
        scope: '__GLOBAL__',
        packageName: '@nf-lab/conflict-lib',
        tag: '1.0.0',
        name: 'mfe2',
        pool: '<absent>',
        servedBy: 'mfe1',
      },
      {
        scope: '__GLOBAL__',
        packageName: '@nf-lab/conflict-lib/extra',
        tag: '1.0.0',
        name: 'mfe1',
        pool: 'family',
        servedBy: '<absent>',
      },
      {
        scope: '__GLOBAL__',
        packageName: '@nf-lab/conflict-lib/extra',
        tag: '1.0.0',
        name: 'mfe2',
        pool: '<absent>',
        servedBy: '<absent>',
      },
    ]);
  });

  it('round-trips persisted collector /2 snapshots without inventing anchor keys', () => {
    const persisted = JSON.stringify({
      ...FIXTURES['frankenstein-live'],
      capture: {
        ...FIXTURES['frankenstein-live'].capture,
        collectorVersion: 'nf-devtools-collector/2',
      },
    });
    const roundTripped: SnapshotV1 = JSON.parse(persisted);
    const participants = sharedParticipants(roundTripped);

    expect(roundTripped.schemaVersion).toBe(1);
    expect(roundTripped.capture.collectorVersion).toBe('nf-devtools-collector/2');
    expect(participants).toHaveLength(20);
    for (const participant of participants) {
      expect(hasOwn(participant, 'pool')).toBe(false);
      expect(hasOwn(participant, 'servedBy')).toBe(false);
    }
  });
});

describe('primary fixture derives from the frankenstein-live capture (T2-AC-02)', () => {
  it('contains the host plus the mermaid and whiteboard remotes', () => {
    expect(Object.keys(primary.runtime!.remotes).sort()).toEqual([
      '__NF-HOST__',
      'mermaid',
      'whiteboard',
    ]);
    const whiteboard = primary.runtime!.remotes['whiteboard'];
    expect(whiteboard.exposes).toHaveLength(1);
    expect(whiteboard.exposes[0].moduleName.endsWith('/Bootstrap')).toBe(true);
  });

  it('contains the react 18.3.1 share example with whiteboard as sole provider', () => {
    const react = primary.runtime!.sharedExternals['__GLOBAL__']['react'];
    expect(react.versions).toHaveLength(1);
    const version = react.versions[0];
    expect(version.tag).toBe('18.3.1');
    expect(version.action).toBe('share');
    expect(version.host).toBe(false);
    expect(version.remotes).toHaveLength(1);
    expect(version.remotes[0]).toEqual({
      name: 'whiteboard',
      requiredVersion: '^18.3.1',
      strictVersion: true,
      file: 'react.QYXZqQxJ1j.js',
      entries: null,
      cached: true,
      bundle: null,
      servedFiles: [{ entry: null, file: 'react.QYXZqQxJ1j.js' }],
      generation: 'v4',
    });
  });

  it('contains the 22-import shim map with one scope and 29 integrity entries', () => {
    const effective = primary.importMaps!.effective!;
    expect(effective.imports).toHaveLength(22);
    expect(effective.scopes).toHaveLength(1);
    expect(effective.integrityFor).toHaveLength(29);
    // Presence only — no SRI hash may leak into the fixture.
    for (const target of effective.integrityFor) {
      expect(target).not.toMatch(/^sha(256|384|512)-/);
    }
  });

  it('carries a sanitized page URL', () => {
    expect(primary.capture.pageUrl).not.toMatch(/[?#@]/);
  });
});

describe('synthetic fixtures (T2-AC-02)', () => {
  const synthetic = fixtureEntries.filter(([id]) => id.startsWith('synthetic-'));

  it('exist for collision, dense-entries, empty-page, hostile, missing-channel, multi-version, no-import-maps, not-recognized, and storage-source states', () => {
    expect(synthetic.map(([id]) => id).sort()).toEqual([
      'synthetic-collision',
      'synthetic-custom-namespace',
      'synthetic-custom-storage',
      'synthetic-dense-entries',
      'synthetic-empty-page',
      'synthetic-hostile',
      'synthetic-legacy-session-storage',
      'synthetic-local-storage',
      'synthetic-missing-channel',
      'synthetic-multi-version',
      'synthetic-no-import-maps',
      'synthetic-not-recognized',
    ]);
  });

  it.each(synthetic)('%s is labeled synthetic', (id, fixture) => {
    expect(id).toMatch(/^synthetic-/);
    expect(fixture.capture.pageUrl).toContain('synthetic');
    expect(fixture.capture.collectorVersion).toContain('synthetic');
  });

  it('missing-channel: runtime is null with an explicit reason, import maps partial', () => {
    const fixture = FIXTURES['synthetic-missing-channel'];
    expect(fixture.channels.nativeFederationGlobals.state).toBe('unavailable');
    expect(fixture.runtime).toBeNull();
    expect(fixture.importMaps!.documentMaps).toHaveLength(1);
    expect(fixture.importMaps!.effective).toBeNull();
  });

  it('not-recognized: channel carries a reason and no runtime is invented', () => {
    const fixture: SnapshotV1 = FIXTURES['synthetic-not-recognized'];
    const channel = fixture.channels.nativeFederationGlobals;
    expect(channel.state).toBe('not-recognized');
    expect(channel.state !== 'available' && channel.reason.length > 0).toBe(true);
    expect(fixture.runtime).toBeNull();
  });

  it('collision: two distinct remotes expose the same module key', () => {
    const fixture = FIXTURES['synthetic-collision'];
    const remotes = fixture.runtime!.remotes;
    const collidingKey = remotes['calendar'].exposes[0].moduleName;
    expect(remotes['chat'].exposes[0].moduleName).toBe(collidingKey);
    expect(remotes['calendar'].exposes[0].file).not.toBe(remotes['chat'].exposes[0].file);
  });

  it('multi-version: one package carries two distinct version tags, neither marked as winner', () => {
    const fixture = FIXTURES['synthetic-multi-version'];
    const versions = fixture.runtime!.sharedExternals['__GLOBAL__']['ui-lib'].versions;
    expect(versions).toHaveLength(2);
    expect(versions.map((version) => version.tag)).toEqual(['1.2.3', '2.0.0']);
    // The DTO records both tags as plain entries — no field singles one out.
    expect(versions.map((version) => version.action)).toEqual(['share', 'share']);
    expect(versions.map((version) => version.remotes[0].name)).toEqual(['calendar', 'chat']);
  });

  it('no-import-maps: both import-map channels are unavailable with reasons and importMaps is null', () => {
    const fixture: SnapshotV1 = FIXTURES['synthetic-no-import-maps'];
    const { domImportMaps, importShim } = fixture.channels;
    expect(domImportMaps.state).toBe('unavailable');
    expect(importShim.state).toBe('unavailable');
    expect(domImportMaps.state !== 'available' && domImportMaps.reason.length > 0).toBe(true);
    expect(importShim.state !== 'available' && importShim.reason.length > 0).toBe(true);
    expect(fixture.importMaps).toBeNull();
  });

  it('hostile: all channels available, adversarial-but-sanitized data, non-empty errors', () => {
    const fixture = FIXTURES['synthetic-hostile'];
    expect(Object.values(fixture.channels).map((channel) => channel.state)).toEqual([
      'available',
      'available',
      'available',
    ]);
    expect(fixture.runtime).not.toBeNull();
    expect(fixture.importMaps!.effective).not.toBeNull();
    expect(fixture.errors.length).toBeGreaterThan(0);
    // Errors survive with nested detail — the export must carry them verbatim.
    expect(fixture.errors[0].detail).toMatchObject({ repository: 'sharedChunks' });
  });

  it('empty-page: zero maps is an observation, not missing evidence', () => {
    const fixture = FIXTURES['synthetic-empty-page'];
    expect(fixture.channels.domImportMaps.state).toBe('available');
    expect(fixture.importMaps!.documentMaps).toHaveLength(0);
    expect(fixture.runtime).toBeNull();
  });
});
