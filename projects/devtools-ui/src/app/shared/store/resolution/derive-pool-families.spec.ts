/**
 * Pool families (share-pools Task 6, pools-v48 Task 4): per tag pool, where pooling put each
 * remote (read off the stored rows) and why (recomputed against the global surface). The 4.8
 * expectations follow the pools-v48 Task 2 log's evidence table; pooling-anchor is the 4.6.0 v2
 * capture, read with the same rules.
 */
import { describe, expect, it } from 'vitest';
import { FIXTURES, NF_HOST, type FixtureId, type SnapshotV1 } from 'devtools-bridge';

import { ingestSnapshot } from '../ingest';
import { deriveTagPools } from './derive-grouping-facets';
import { derivePoolFamilies } from './derive-pool-families';
import { normalizeRegistryEvidence } from './normalize-registry-evidence';
import type { PoolFamily } from './pool-family-model';

const poolsOf = (id: FixtureId): Map<string, PoolFamily> => {
  const projection = ingestSnapshot(FIXTURES[id]).resolutionProjection;
  expect(projection.poolFamilies).toHaveLength(projection.tagPools.length);
  return new Map(projection.tagPools.map((pool, i) => [pool.name, projection.poolFamilies[i]]));
};
const familyOf = (id: FixtureId, name?: string) => {
  const pools = poolsOf(id);
  return name === undefined ? [...pools.values()][0] : pools.get(name)!;
};
const consumer = (family: PoolFamily, remote: string) =>
  family.consumers.find((entry) => entry.remote === remote)!;
// `remote:placement[:owner]` per consumer, pool order.
const placements = (family: PoolFamily) =>
  family.consumers.map(({ remote, placement }) =>
    placement.kind === 'subpool'
      ? `${remote}:subpool:${placement.owner}`
      : `${remote}:${placement.kind}`,
  );

describe('derivePoolFamilies — placements and reasons (pools-v48 T4-AC-01)', () => {
  it('every 4.8 placement is what its recomputed reason predicts', () => {
    let checked = 0;
    for (const id of Object.keys(FIXTURES) as FixtureId[]) {
      if ((FIXTURES[id] as SnapshotV1).runtimeSource?.orchestratorVersion !== '4.8.0') continue;
      for (const family of poolsOf(id).values())
        for (const entry of family.consumers) {
          expect(entry.consistent, `${id} ${entry.remote}`).toBe(true);
          checked += 1;
        }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('pool-uncovered-gap: mfe1 lacks ui-core/testing on the global surface', () => {
    const family = familyOf('pool-uncovered-gap');
    expect(family.winner).toBe(NF_HOST);
    expect(placements(family)).toEqual([`${NF_HOST}:global`, 'mfe1:self', 'mfe2:global']);
    expect(consumer(family, 'mfe1')).toMatchObject({
      storedCause: 'uncovered',
      miss: { kind: 'coverage', missing: ['@nf-lab/ui-core/testing'] },
    });
    expect(consumer(family, 'mfe2').miss).toBeNull();
  });

  it('pool-incompatible-nonstrict: a non-strict range rejects both members', () => {
    const family = familyOf('pool-incompatible-nonstrict');
    expect(consumer(family, 'mfe1')).toMatchObject({
      placement: { kind: 'self' },
      storedCause: 'incompatible',
      miss: {
        kind: 'range',
        rejections: [
          { member: '@nf-lab/ui-core', tag: '2.0.0', requiredVersion: '^1.0.0', strict: false },
          { member: '@nf-lab/ui-dom', tag: '2.0.0', requiredVersion: '^1.0.0', strict: false },
        ],
      },
    });
    expect(consumer(family, 'mfe2').placement).toEqual({ kind: 'global' });
  });

  it('pool-portfolio: strict rejections lead, then the non-strict one', () => {
    const legacy = consumer(familyOf('pool-portfolio'), 'legacy');
    expect(legacy.miss).toMatchObject({ kind: 'range' });
    expect(
      legacy.miss!.kind === 'range' &&
        legacy.miss!.rejections.map((r) => `${r.member.slice(8)}:${r.strict}`),
    ).toEqual(['acme-core:true', 'acme-router:true', 'acme-common:false']);
  });

  it('pool-unshipped: every tag is mapped, but no build ships the combination', () => {
    const family = familyOf('pool-unshipped');
    // ui-dom is an extension the global map serves from mfe1's build.
    expect(family.globalSurface.map((e) => `${e.specifier}@${e.tag}:${e.build}`)).toEqual([
      `@nf-lab/chart-core@1.1.0:${NF_HOST}`,
      `@nf-lab/ui-core@2.0.0:${NF_HOST}`,
      '@nf-lab/ui-dom@2.0.0:mfe1',
    ]);
    expect(placements(family)).toEqual([`${NF_HOST}:global`, 'mfe1:global', 'mfe2:self']);
    expect(consumer(family, 'mfe2')).toMatchObject({
      storedCause: 'uncovered',
      miss: { kind: 'unshipped', gap: '@nf-lab/ui-dom' },
    });
  });

  it('pool-showcase ui: a subpool on admin, which names itself, for the ui-dom the host lacks', () => {
    const family = familyOf('pool-showcase', 'ui');
    expect(placements(family)).toEqual([
      `${NF_HOST}:global`,
      'admin:subpool:admin',
      'catalog:subpool:admin',
      'checkout:subpool:admin',
    ]);
    expect(consumer(family, 'catalog')).toMatchObject({
      storedCause: null,
      miss: { kind: 'coverage', missing: ['@nf-lab/ui-dom'] },
      servingBuilds: { '@nf-lab/ui-core': 'admin', '@nf-lab/ui-dom': 'admin' },
    });
    // A subpool serves ui-dom, so it is not "not shared".
    expect(family.members.every((m) => !m.unshared)).toBe(true);
  });

  it('pool-tag-islanded: mfe1 wins, mfe2 runs its own copy of everything', () => {
    const family = familyOf('pool-tag-islanded');
    expect(placements(family)).toEqual(['mfe1:global', 'mfe2:self']);
    expect(family.members.find((member) => member.packageName === '@nf-lab/ui-core')).toEqual({
      packageName: '@nf-lab/ui-core',
      followsPackage: null,
      unshared: false,
      scopedRemotes: ['mfe2'],
    });
  });

  it('pool-tag-coherent: every consumer global, nothing redirected, not pending', () => {
    const family = familyOf('pool-tag-coherent');
    expect(family.pending).toBe(false);
    expect(placements(family)).toEqual(['mfe1:global', 'mfe2:global']);
    expect(consumer(family, 'mfe2').servingBuilds).toEqual({
      '@nf-lab/ui-core': 'mfe1',
      '@nf-lab/ui-dom': 'mfe1',
    });
  });

  it('pooling-anchor (4.6.0): no stored winner, the anchor read as a subpool', () => {
    const family = familyOf('pooling-anchor');
    expect(family.winner).toBeNull();
    expect(placements(family)).toEqual([
      `${NF_HOST}:global`,
      'mfe1:subpool:mfe1',
      'mfe2:subpool:mfe1',
    ]);
  });
});

// Hand-built rows for states no capture reaches.
describe('derivePoolFamilies — hand-built records', () => {
  type Row = {
    remote: string;
    tag: string;
    action: string;
    pool?: string;
    servedBy?: string;
    poolCause?: string;
    requiredVersion?: string;
    strictVersion?: boolean;
  };
  const familyFrom = (
    packages: Record<string, Row[]>,
    { dirty = false, undecidedScopes = [] as string[] } = {},
  ) => {
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
              requiredVersion: row.requiredVersion ?? '*',
              strictVersion: row.strictVersion ?? false,
              file: null,
              entries: { [pkg]: `${row.remote}-${pkg}-${tag}.js` },
              cached: false,
              bundle: null,
              ...(row.pool ? { pool: row.pool } : {}),
              ...(row.servedBy ? { servedBy: row.servedBy } : {}),
              ...(row.poolCause ? { poolCause: row.poolCause } : {}),
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
    return derivePoolFamilies(
      evidence,
      deriveTagPools(evidence).tagPools,
      NF_HOST,
      undecidedScopes,
    )[0];
  };
  const strict = (requiredVersion: string) => ({ requiredVersion, strictVersion: true });

  it('T4-AC-02: a stored cause the recomputed reason contradicts is inconsistent', () => {
    // mfe1 stores `uncovered`, but its only miss is a range rejecting the global 2.0.0.
    const family = familyFrom({
      a: [
        { remote: 'host', tag: '2.0.0', action: 'share', pool: 'p', ...strict('^2.0.0') },
        {
          remote: 'mfe1',
          tag: '1.0.0',
          action: 'scope',
          pool: 'p',
          poolCause: 'uncovered',
          ...strict('^1.0.0'),
        },
      ],
      b: [
        { remote: 'host', tag: '2.0.0', action: 'share', pool: 'p', ...strict('^2.0.0') },
        {
          remote: 'mfe1',
          tag: '1.0.0',
          action: 'scope',
          pool: 'p',
          poolCause: 'uncovered',
          ...strict('^1.0.0'),
        },
      ],
    });
    expect(consumer(family, 'mfe1')).toMatchObject({
      placement: { kind: 'self' },
      storedCause: 'uncovered',
      miss: { kind: 'range' },
      consistent: false,
    });
  });

  it('a global remote whose range rejects the global tag is inconsistent', () => {
    const family = familyFrom({
      a: [
        { remote: 'host', tag: '2.0.0', action: 'share', pool: 'p' },
        { remote: 'mfe1', tag: '1.0.0', action: 'skip', pool: 'p', ...strict('^1.0.0') },
      ],
      b: [{ remote: 'host', tag: '2.0.0', action: 'share', pool: 'p' }],
    });
    expect(consumer(family, 'mfe1')).toMatchObject({
      placement: { kind: 'global' },
      consistent: false,
    });
  });

  it('T4-AC-03: a range that excludes the copy own tag rejects nothing', () => {
    const family = familyFrom({
      a: [
        { remote: 'host', tag: '1.2.0', action: 'share', pool: 'p', ...strict('^2.0.0') },
        { remote: 'mfe1', tag: '1.2.0', action: 'skip', pool: 'p', ...strict('^1.0.0') },
      ],
      b: [{ remote: 'host', tag: '1.0.0', action: 'share', pool: 'p' }],
    });
    expect(consumer(family, 'host')).toMatchObject({ miss: null, consistent: true });
    expect(family.statusMatrix.bands[0].rows[0].cells[0]).toMatchObject({
      acceptsShared: true,
      state: 'serves-others',
    });
  });

  it('a mix of scope and shared rows is an unknown placement', () => {
    const family = familyFrom({
      a: [
        { remote: 'host', tag: '2.0.0', action: 'share', pool: 'p' },
        { remote: 'mfe1', tag: '1.0.0', action: 'scope', pool: 'p' },
      ],
      b: [
        { remote: 'host', tag: '2.0.0', action: 'share', pool: 'p' },
        { remote: 'mfe1', tag: '2.0.0', action: 'share', pool: 'p' },
      ],
    });
    expect(consumer(family, 'mfe1')).toMatchObject({
      placement: { kind: 'unknown' },
      consistent: false,
    });
    expect(family.statusMatrix.bands.map((b) => b.kind)).toEqual(['global', 'unknown']);
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
      { dirty: true },
    );
    expect(family.pending).toBe(true);
    expect(
      family.members.map(({ packageName, followsPackage }) => ({ packageName, followsPackage })),
    ).toEqual([
      { packageName: '@x/core', followsPackage: null },
      { packageName: '@x/core/sub', followsPackage: '@x/core' },
    ]);
  });

  it('marks a pool pending while a runtime load left its scope undecided', () => {
    const rows = {
      a: [
        { remote: 'mfe1', tag: '1.0.0', action: 'share', pool: 'p' },
        { remote: 'mfe2', tag: '1.0.0', action: 'skip', pool: 'p' },
      ],
      b: [{ remote: 'mfe1', tag: '1.0.0', action: 'share', pool: 'p' }],
    };
    expect(familyFrom(rows).pending).toBe(false);
    expect(familyFrom(rows, { undecidedScopes: ['__GLOBAL__'] }).pending).toBe(true);
  });
});

// Stage 2 Task 10: the status matrix, against the orchestrator 4.8.0 captures of the nf-lab
// corpus (pool-showcase, pool-portfolio) and the 4.6.0 v2 corpus (pooling-anchor).
describe('derivePoolFamilies — status matrix', () => {
  // One line per band, then `remote: state…` per row: the matrix as a reader scans it.
  const sketch = (id: FixtureId, name: string) =>
    familyOf(id, name).statusMatrix.bands.map((band) => ({
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

  it('T10-AC-01: pool-showcase — ui in the subpool of admin, charts isolates dashboard, form-kit one build', () => {
    expect(sketch('pool-showcase', 'ui')).toEqual([
      {
        band: `global:${NF_HOST} serves=0 redirected=0 host`,
        rows: [`${NF_HOST} [no tag] 2.0.0:unchanged ·`],
      },
      {
        band: 'subpool:admin serves=2 redirected=2',
        rows: [
          'admin [no tag] 1.0.0:serves-others 1.0.0:gap',
          'catalog ↪ [ui] 1.0.0:unchanged 1.0.0:gap',
          'checkout ↪ [ui] 1.0.0:unchanged 1.0.0:gap',
        ],
      },
    ]);
    expect(sketch('pool-showcase', 'charts')).toEqual([
      {
        band: 'global:catalog serves=0 redirected=0',
        rows: ['catalog [charts] 1.1.0:unchanged 1.1.0:unchanged'],
      },
      {
        band: 'isolated:dashboard serves=0 redirected=0',
        rows: ['dashboard [charts] 1.0.0:isolated 2.0.0:rejected'],
      },
    ]);
    expect(sketch('pool-showcase', 'form-kit')).toEqual([
      {
        band: 'global:checkout serves=1 redirected=0',
        rows: [
          'checkout [forms] 1.1.0:serves-others 1.1.0:serves-others',
          'dashboard [form-kit] 1.1.0:unchanged 1.1.0:unchanged',
        ],
      },
    ]);
  });

  it('T10-AC-01: pool-showcase verdicts', () => {
    expect(familyOf('pool-showcase', 'ui').statusMatrix.verdict).toEqual({
      kind: 'redirected',
      isolated: null,
      redirected: { remotes: ['catalog', 'checkout'], anchors: ['admin'], cause: 'uncovered' },
      builds: [NF_HOST, 'admin'],
    });
    expect(familyOf('pool-showcase', 'charts').statusMatrix.verdict).toMatchObject({
      kind: 'isolated',
      isolated: { remotes: ['dashboard'], conflicts: 1, cause: 'incompatible' },
      redirected: null,
    });
    expect(familyOf('pool-showcase', 'form-kit').statusMatrix.verdict).toMatchObject({
      kind: 'one-build',
      isolated: null,
      redirected: null,
      builds: ['checkout'],
    });
  });

  it('T10-AC-02: pool-portfolio — legacy strict on two packages, the subpool folded in', () => {
    const family = familyOf('pool-portfolio', 'acme');
    const bands = family.statusMatrix.bands;
    expect(
      bands.map((b) => `${b.kind}:${b.owner} ${b.rows.map((r) => r.remote).join(',')}`),
    ).toEqual([
      `global:${NF_HOST} ${NF_HOST},cart,products,profile,search,settings`,
      'subpool:contacts contacts,invoices,onboarding,orders,reports',
      'isolated:legacy legacy',
    ]);
    // Members sort as animations, common, core, forms, router; 4.8 rejects non-strict too.
    const legacy = bands[2].rows[0].cells;
    expect(legacy.map((cell) => cell!.state)).toEqual([
      'gap',
      'rejected',
      'rejected',
      'gap',
      'rejected',
    ]);
    expect(legacy[0]).toMatchObject({ missing: ['@nf-lab/acme-animations'] });
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
      isolated: { remotes: ['legacy'], conflicts: 3, cause: 'incompatible' },
      redirected: {
        remotes: ['invoices', 'onboarding', 'orders', 'reports'],
        anchors: ['contacts'],
        cause: 'uncovered',
      },
    });
  });

  it('T10-AC-03: pre-4.7 pooling-anchor derives bands and verdict without poolCause', () => {
    const family = familyOf('pooling-anchor', '@nf-lab/conflict-lib');
    expect(
      family.statusMatrix.bands.map(
        (b) => `${b.kind}:${b.owner} ${b.rows.map((r) => r.remote).join(',')}`,
      ),
    ).toEqual([`global:${NF_HOST} ${NF_HOST}`, 'subpool:mfe1 mfe1,mfe2']);
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
    const mfe2 = family.statusMatrix.bands.find((b) => b.owner === 'mfe2')!.rows[0];
    expect(mfe2.cells.map((cell) => cell?.state)).toEqual(['isolated', 'isolated']);
    expect(mfe2.cells[1]).toMatchObject({ acceptsShared: null });
    // Nothing explains the stored `incompatible` any more, so the placement reads inconsistent.
    expect(consumer(family, 'mfe2')).toMatchObject({ miss: null, consistent: false });
    expect(family.statusMatrix.verdict.isolated).toMatchObject({
      conflicts: 0,
      cause: 'incompatible',
    });
  });
});
