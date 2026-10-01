/**
 * Pool families (share-pools Task 6): per tag pool, who serves each
 * consumer each member and whether the result is one some single build
 * shipped — read off the rows pooling wrote back. Expectations follow the
 * stored rows of each capture (see the Task 2 log's evidence table).
 */
import { describe, expect, it } from 'vitest';
import { FIXTURES, NF_HOST, type FixtureId, type SnapshotV1 } from 'devtools-bridge';

import { ingestSnapshot } from '../ingest';
import { deriveTagPools } from './derive-grouping-facets';
import { derivePoolFamilies } from './derive-pool-families';
import { normalizeRegistryEvidence } from './normalize-registry-evidence';

const familyOf = (id: FixtureId) => {
  const projection = ingestSnapshot(FIXTURES[id]).resolutionProjection;
  expect(projection.poolFamilies).toHaveLength(projection.tagPools.length);
  return projection.poolFamilies[0];
};
const consumer = (id: FixtureId, remote: string) =>
  familyOf(id).consumers.find((entry) => entry.remote === remote)!;

describe('derivePoolFamilies — outcomes from stored rows', () => {
  it('pooling-anchor: mfe2 is redirected onto mfe1, whose build it serves', () => {
    expect(consumer('pooling-anchor', NF_HOST)).toMatchObject({
      outcome: 'one-build',
      coherent: null,
    });
    expect(consumer('pooling-anchor', 'mfe1')).toMatchObject({
      outcome: 'one-build',
      coherent: true,
    });
    expect(consumer('pooling-anchor', 'mfe2')).toMatchObject({
      outcome: 'redirected',
      servingBuilds: { '@nf-lab/conflict-lib': 'mfe1', '@nf-lab/conflict-lib/extra': 'mfe1' },
      coherent: true,
    });
  });

  it('pool-tag-anchored: both remotes anchored on mfe1, untagged mfe3 included', () => {
    const family = familyOf('pool-tag-anchored');
    expect(family.consumers.map(({ remote, outcome }) => `${remote}:${outcome}`)).toEqual([
      `${NF_HOST}:one-build`,
      'mfe1:one-build',
      'mfe2:redirected',
      'mfe3:redirected',
    ]);
    const [mfe1Build] = family.statusMatrix.bands;
    expect(mfe1Build).toMatchObject({ owner: 'mfe1', servesOthers: 2, redirected: 2 });
    expect(mfe1Build.rows.map((row) => `${row.remote}:${row.tag ?? '-'}`)).toEqual([
      'mfe1:ui',
      'mfe2:ui',
      'mfe3:-',
    ]);
    expect(family.statusMatrix.verdict.redirected).toMatchObject({ mixes: [NF_HOST, 'mfe1'] });
  });

  it('pool-tag-islanded: mfe1 runs its own copy of everything; ui-core is left unshared', () => {
    const family = familyOf('pool-tag-islanded');
    expect(consumer('pool-tag-islanded', 'mfe1').outcome).toBe('own-copy');
    expect(consumer('pool-tag-islanded', 'mfe2')).toMatchObject({
      outcome: 'one-build',
      coherent: true,
    });
    expect(family.members.find((member) => member.packageName === '@nf-lab/ui-core')).toEqual({
      packageName: '@nf-lab/ui-core',
      followsPackage: null,
      unshared: true,
      scopedRemotes: ['mfe1', 'mfe2'],
    });
  });

  it('pool-tag-coherent: every consumer one build, nothing redirected, not pending', () => {
    const family = familyOf('pool-tag-coherent');
    expect(family.pending).toBe(false);
    expect(family.consumers.every((entry) => entry.outcome === 'one-build' && entry.coherent)).toBe(
      true,
    );
    expect(consumer('pool-tag-coherent', 'mfe2').servingBuilds).toEqual({
      '@nf-lab/ui-core': 'mfe1',
      '@nf-lab/ui-dom': 'mfe1',
    });
  });
});

// Hand-built rows for states no capture reaches: a torn combination (which
// pooling prevents), a dirty record, and an entrypoint joining untagged.
describe('derivePoolFamilies — hand-built records', () => {
  type Row = { remote: string; tag: string; action: string; pool?: string; servedBy?: string };
  const familyFrom = (packages: Record<string, Row[]>, dirty = false) => {
    const base = FIXTURES['pool-tag-coherent'];
    const shared: NonNullable<SnapshotV1['runtime']>['sharedExternals'] = { __GLOBAL__: {} };
    for (const [pkg, rows] of Object.entries(packages)) {
      const versions = [...new Set(rows.map((row) => `${row.tag}|${row.action}`))].map((key) => {
        const [tag, action] = key.split('|');
        return {
          tag,
          action,
          host: false,
          remotes: rows
            .filter((row) => row.tag === tag && row.action === action)
            .map((row) => ({
              name: row.remote,
              requiredVersion: '*',
              strictVersion: false,
              file: null,
              entries: { [pkg]: `${row.remote}-${pkg}-${tag}.js` },
              cached: false,
              bundle: null,
              ...(row.pool ? { pool: row.pool } : {}),
              ...(row.servedBy ? { servedBy: row.servedBy } : {}),
              servedFiles: [{ entry: pkg, file: `${row.remote}-${pkg}-${tag}.js` }],
              generation: 'v4.5' as const,
            })),
        };
      });
      shared['__GLOBAL__'][pkg] = { dirty, versions };
    }
    const snapshot = {
      ...base,
      runtime: { ...base.runtime!, scopedExternals: {}, sharedExternals: shared },
    };
    const evidence = normalizeRegistryEvidence(snapshot);
    return derivePoolFamilies(evidence, deriveTagPools(evidence).tagPools, NF_HOST)[0];
  };

  it('flags a torn combination no single build shipped', () => {
    // mfe2 takes a@2 from mfe3 and b@1 from mfe1; no build ships a@2 + b@1.
    const family = familyFrom({
      a: [
        { remote: 'mfe3', tag: '2.0.0', action: 'share', pool: 'p' },
        { remote: 'mfe2', tag: '1.0.0', action: 'skip', pool: 'p' },
        { remote: 'mfe1', tag: '1.0.0', action: 'skip', pool: 'p' },
      ],
      b: [
        { remote: 'mfe1', tag: '1.0.0', action: 'share', pool: 'p' },
        { remote: 'mfe2', tag: '1.0.0', action: 'skip', pool: 'p' },
      ],
    });
    const mfe2 = family.consumers.find((entry) => entry.remote === 'mfe2')!;
    expect(mfe2).toMatchObject({
      outcome: 'mixed-builds',
      coherent: false,
      combination: ['a@2.0.0', 'b@1.0.0'],
    });
  });

  it('marks a dirty record pending and names an untagged entrypoint joining its package', () => {
    const family = familyFrom(
      {
        '@x/core': [
          { remote: 'mfe1', tag: '1.0.0', action: 'share', pool: 'x' },
          { remote: 'mfe2', tag: '1.0.0', action: 'skip' },
        ],
        '@x/core/sub': [{ remote: 'mfe1', tag: '1.0.0', action: 'share' }],
      },
      true,
    );
    expect(family.pending).toBe(true);
    expect(
      family.members.map(({ packageName, followsPackage }) => ({ packageName, followsPackage })),
    ).toEqual([
      { packageName: '@x/core', followsPackage: null },
      { packageName: '@x/core/sub', followsPackage: '@x/core' },
    ]);
  });
});

// Stage 2 Task 10: the status matrix, against the orchestrator 4.7.0 captures of the nf-lab
// corpus (pool-showcase, pool-portfolio) and the 4.6.0 v2 corpus (pooling-anchor).
describe('derivePoolFamilies — status matrix', () => {
  const poolsOf = (id: FixtureId) => {
    const projection = ingestSnapshot(FIXTURES[id]).resolutionProjection;
    return new Map(
      projection.tagPools.map((pool, i) => [
        pool.name,
        { pool, family: projection.poolFamilies[i] },
      ]),
    );
  };
  // One line per band, then `remote: state…` per row: the matrix as a reader scans it.
  const sketch = (id: FixtureId, name: string) => {
    const { family } = poolsOf(id).get(name)!;
    return family.statusMatrix.bands.map((band) => ({
      band: `${band.kind}:${band.owner ?? '-'} serves=${band.servesOthers} redirected=${band.redirected}${
        band.hostPrecedence ? ' host' : ''
      }`,
      rows: band.rows.map(
        (row) =>
          `${row.remote}${row.redirected ? ' ↪' : ''} [${row.tag ?? 'no tag'}] ${row.cells
            .map((cell) => (cell === null ? '·' : `${cell.servedTag}:${cell.state}`))
            .join(' ')}`,
      ),
    }));
  };

  it('T10-AC-01: pool-showcase — ui anchored on catalog, charts isolates catalog, form-kit one build', () => {
    expect(sketch('pool-showcase', 'ui')).toEqual([
      {
        band: 'shared:catalog serves=2 redirected=2',
        rows: [
          'catalog [ui] 1.0.0:serves-others 1.0.0:serves-others',
          'admin ↪ [no tag] 1.0.0:unchanged 1.0.0:unchanged',
          'checkout ↪ [ui] 1.0.0:unchanged 1.0.0:unchanged',
        ],
      },
      {
        band: `shared:${NF_HOST} serves=0 redirected=0 host`,
        rows: [`${NF_HOST} [no tag] 2.0.0:unchanged ·`],
      },
    ]);
    expect(sketch('pool-showcase', 'charts')).toEqual([
      {
        band: 'shared:dashboard serves=0 redirected=0',
        rows: ['dashboard [charts] 1.0.0:not-shared 2.0.0:unchanged'],
      },
      {
        band: 'isolated:catalog serves=0 redirected=0',
        rows: ['catalog [charts] 1.1.0:isolated 1.1.0:conflict'],
      },
    ]);
    expect(sketch('pool-showcase', 'form-kit')).toEqual([
      {
        band: 'shared:checkout serves=1 redirected=0',
        rows: [
          'checkout [forms] 1.1.0:serves-others 1.1.0:serves-others',
          'dashboard [form-kit] 1.1.0:unchanged 1.1.0:unchanged',
        ],
      },
    ]);
  });

  it('T10-AC-01: pool-showcase verdicts', () => {
    const pools = poolsOf('pool-showcase');
    expect(pools.get('ui')!.family.statusMatrix.verdict).toEqual({
      kind: 'redirected',
      torn: [],
      isolated: null,
      redirected: {
        remotes: ['admin', 'checkout'],
        anchors: ['catalog'],
        mixes: [NF_HOST, 'catalog'],
      },
      builds: ['catalog', NF_HOST],
    });
    expect(pools.get('charts')!.family.statusMatrix.verdict).toMatchObject({
      kind: 'isolated',
      isolated: { remotes: ['catalog'], conflicts: 1, cause: 'incompatible' },
      redirected: null,
    });
    expect(pools.get('form-kit')!.family.statusMatrix.verdict).toMatchObject({
      kind: 'one-build',
      isolated: null,
      redirected: null,
      builds: ['checkout'],
    });
  });

  it('T10-AC-02: pool-portfolio — legacy strict on two packages, the redirect folded in', () => {
    const { family } = poolsOf('pool-portfolio').get('acme')!;
    const bands = family.statusMatrix.bands;
    expect(
      bands.map((b) => `${b.kind}:${b.owner} ${b.rows.map((r) => r.remote).join(',')}`),
    ).toEqual([
      `shared:${NF_HOST} ${NF_HOST},cart,products,profile,search,settings`,
      'shared:orders orders,contacts,invoices,onboarding,reports',
      'isolated:legacy legacy',
    ]);
    // Members sort as animations, common, core, forms, router.
    const legacy = bands[2].rows[0].cells;
    expect(legacy.map((cell) => cell!.state)).toEqual([
      'isolated',
      'isolated',
      'conflict',
      'isolated',
      'conflict',
    ]);
    expect(legacy[1]).toMatchObject({
      strictVersion: false,
      requiredVersion: '^16.0.0',
      sharedTag: '18.2.0',
      acceptsShared: false,
    });
    expect(bands[0].rows.find((r) => r.remote === 'products')!.cells[2]).toMatchObject({
      servedTag: '18.2.0',
      declaredTag: '18.1.3',
      state: 'unchanged',
    });
    expect(family.statusMatrix.verdict).toMatchObject({
      kind: 'isolated',
      isolated: { remotes: ['legacy'], conflicts: 2, cause: 'incompatible' },
      redirected: {
        remotes: ['contacts', 'invoices', 'onboarding', 'reports'],
        anchors: ['orders'],
        mixes: [NF_HOST, 'orders'],
      },
    });
  });

  it('T10-AC-03: pre-4.7 pooling-anchor derives bands and verdict without poolCause', () => {
    const { family } = poolsOf('pooling-anchor').get('@nf-lab/conflict-lib')!;
    expect(
      family.statusMatrix.bands.map(
        (b) => `${b.kind}:${b.owner} ${b.rows.map((r) => r.remote).join(',')}`,
      ),
    ).toEqual(['shared:mfe1 mfe1,mfe2', `shared:${NF_HOST} ${NF_HOST}`]);
    expect(family.statusMatrix.verdict).toMatchObject({
      kind: 'redirected',
      redirected: { remotes: ['mfe2'], anchors: ['mfe1'] },
    });
  });

  it('T10-AC-04: an unreadable range is no conflict; the isolated remote keeps its state', () => {
    const snapshot: SnapshotV1 = structuredClone(FIXTURES['pool-tag-islanded']);
    const dom = snapshot.runtime!.sharedExternals['__GLOBAL__']['@nf-lab/ui-dom'];
    dom.versions.find((v) => v.action === 'scope')!.remotes[0].requiredVersion = 'latest';
    const family = ingestSnapshot(snapshot).resolutionProjection.poolFamilies[0];
    const mfe1 = family.statusMatrix.bands.find((b) => b.owner === 'mfe1')!.rows[0];
    expect(mfe1.cells.map((cell) => cell?.state)).toEqual(['isolated', 'isolated']);
    expect(mfe1.cells[1]).toMatchObject({ acceptsShared: null });
    expect(family.statusMatrix.verdict.isolated).toMatchObject({
      conflicts: 0,
      cause: 'incompatible',
    });
  });
});
