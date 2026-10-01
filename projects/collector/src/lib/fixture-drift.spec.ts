/**
 * Fixture drift guard (T5-AC-01/02/03, contributes to XC-02): every
 * corpus-derived fixture module equals a fresh run of the real collector
 * pipeline over its source capture — the same capture-pipeline step
 * `scripts/derive-fixtures.mjs` uses. Catches hand-edited fixture modules
 * and collector-schema changes whose fixtures were not re-derived.
 */
import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../../../devtools-bridge/src/lib/fixtures';
import { deriveCaptureSnapshot } from '../testing/capture-pipeline';
import { loadLabCapture } from '../testing/lab-corpus';

const LIVE_ID = 'frankenstein-live';
const LIVE_FILE = '20260811T115536Z-01-initial.json';

// `synthetic-` fixtures are hand-written; `exported-` fixtures are verbatim
// panel exports without a lab-lossless envelope — neither has a capture to
// re-derive from.
const derivedIds = Object.keys(FIXTURES).filter(
  (id) => !id.startsWith('synthetic-') && !id.startsWith('exported-'),
);

describe('corpus-derived fixtures equal fresh pipeline output (T5-AC-01, T2.1-AC-02)', () => {
  it.each(derivedIds)('%s', (id) => {
    const capture = loadLabCapture(id, id === LIVE_ID ? LIVE_FILE : undefined);
    expect(deriveCaptureSnapshot(capture)).toEqual(FIXTURES[id as keyof typeof FIXTURES]);
  });

  // 12 v2 lab scenarios + 9 nf-lab scenarios (scripts/lab-corpora.mjs) + the live capture.
  it('covers every lab scenario of both corpora plus the live capture', () => {
    expect(derivedIds).toHaveLength(26);
    expect(derivedIds).toContain('co-declared-share');
    expect(derivedIds).toContain('pooling-anchor');
    expect(derivedIds).toContain('pool-tag-anchored');
    expect(derivedIds).toContain('dense-externals-only');
    expect(derivedIds).toContain(LIVE_ID);
  });

  it('preserves the witnessed pooling fields and their independent omission (T2.1-AC-01)', () => {
    const fixture = JSON.parse(JSON.stringify(FIXTURES['pooling-anchor']));
    const shared = fixture.runtime.sharedExternals['__GLOBAL__'];
    const hasOwn = (record: object, key: string) =>
      Object.prototype.hasOwnProperty.call(record, key);
    const participant = (pkg: string, tag: string, action: string, name: string) =>
      shared[pkg].versions
        .find((version: any) => version.tag === tag && version.action === action)
        .remotes.find((remote: any) => remote.name === name);
    const main = '@nf-lab/conflict-lib';
    const rows = [
      ['host-main', participant(main, '2.0.0', 'share', '__NF-HOST__')],
      ['mfe1-main', participant(main, '1.0.0', 'skip', 'mfe1')],
      ['mfe2-main', participant(main, '1.0.0', 'skip', 'mfe2')],
      ['mfe1-extra', participant(`${main}/extra`, '1.0.0', 'share', 'mfe1')],
      ['mfe2-extra', participant(`${main}/extra`, '1.0.0', 'share', 'mfe2')],
    ].map(([id, remote]) => ({
      id,
      poolPresent: hasOwn(remote, 'pool'),
      pool: hasOwn(remote, 'pool') ? remote.pool : null,
      servedByPresent: hasOwn(remote, 'servedBy'),
      servedBy: hasOwn(remote, 'servedBy') ? remote.servedBy : null,
    }));

    expect(rows).toEqual([
      {
        id: 'host-main',
        poolPresent: false,
        pool: null,
        servedByPresent: false,
        servedBy: null,
      },
      {
        id: 'mfe1-main',
        poolPresent: true,
        pool: 'family',
        servedByPresent: true,
        servedBy: 'mfe1',
      },
      {
        id: 'mfe2-main',
        poolPresent: false,
        pool: null,
        servedByPresent: true,
        servedBy: 'mfe1',
      },
      {
        id: 'mfe1-extra',
        poolPresent: true,
        pool: 'family',
        servedByPresent: false,
        servedBy: null,
      },
      {
        id: 'mfe2-extra',
        poolPresent: false,
        pool: null,
        servedByPresent: false,
        servedBy: null,
      },
    ]);
  });
});

describe('frankenstein-live fixture provenance (T5-AC-02)', () => {
  it('is the released-generation snapshot of the public deployment', () => {
    const fixture = FIXTURES[LIVE_ID];
    expect(fixture.capture.pageUrl).toBe('https://lutzleonhardt.de/frankenstein-meeting-room/');
    expect(fixture.runtime?.generation).toBe('v4');

    const participants = Object.values(fixture.runtime!.sharedExternals['__GLOBAL__']).flatMap(
      (external) => external.versions.flatMap((version) => version.remotes),
    );
    expect(participants).toHaveLength(20);
    for (const participant of participants) {
      expect(typeof participant.file).toBe('string');
      expect(participant.entries).toBeNull();
    }
  });
});

// The lab probe records __NF_ORCHESTRATOR__ from orchestrator v4.7 on; no corpus capture carries
// the channel yet, so this adds one to a stored capture in the shape a 4.7.0 page produced.
describe('orchestratorGlobal channel', () => {
  const withOrchestratorGlobal = () => {
    const capture = structuredClone(loadLabCapture('pool-tag-coherent'));
    capture['channels'].orchestratorGlobal = {
      availability: 'available',
      observedAt: capture['capturedAt'],
      data: {
        present: true,
        valueType: 'object',
        keys: ['storage'],
        storage: {
          __NATIVE_FEDERATION__: {
            version: '4.7.0',
            type: 'globalThis',
            namespace: '__NATIVE_FEDERATION__',
            keys: ['remotes', 'shared-externals', 'scoped-externals', 'shared-chunks'],
            hasGet: true,
          },
        },
      },
    };
    return capture;
  };

  it('derives the exposed orchestrator version into the snapshot', () => {
    const snapshot = deriveCaptureSnapshot(withOrchestratorGlobal());
    expect(snapshot.runtime!.orchestratorVersion).toBe('4.7.0');
    expect(snapshot.errors).toEqual([]);
  });

  it('leaves a capture without the channel exactly as before', () => {
    expect(deriveCaptureSnapshot(loadLabCapture('pool-tag-coherent'))).toEqual(
      FIXTURES['pool-tag-coherent'],
    );
  });
});
