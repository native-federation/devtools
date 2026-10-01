/**
 * Grouping facets (share-pools Task 3): tag pools mirrored from the
 * orchestrator's `groupByMembership` with tag edges only, and per-copy share
 * scope / pool / bundle keys read off the copy's evidenced source.
 *
 * Fixture ACs run the real ingest pipeline over nf-lab and V2 corpus
 * captures; the membership rules (T3-AC-04) run on hand-built registries,
 * because no capture combines the edge cases.
 */
import { describe, expect, it } from 'vitest';
import { FIXTURES, type FixtureId, type SnapshotV1 } from 'devtools-bridge';

import { ingestSnapshot } from '../ingest';
import { deriveTagPools } from './derive-grouping-facets';
import { normalizeRegistryEvidence } from './normalize-registry-evidence';

const projectionOf = (id: FixtureId) => ingestSnapshot(FIXTURES[id]).resolutionProjection;

/** `copy source package → shareScope | tagPool name` over one fixture's copies. */
function facetsByPackage(id: FixtureId) {
  const projection = projectionOf(id);
  const poolNames = new Map(projection.tagPools.map((pool) => [pool.id, pool.name]));
  return projection.copies.map((copy, index) => {
    const facets = projection.copyGroupingFacets[index];
    expect(facets.copyId).toBe(copy.id);
    return {
      pkg: copy.sourcePackage,
      disposition: copy.sourceDisposition,
      shareScope: facets.shareScope,
      pool: facets.tagPoolId === null ? null : poolNames.get(facets.tagPoolId),
      builds: facets.builds.map((build) => `${build.remote} · ${build.bundle}`),
    };
  });
}

describe('copy share scope (T3-AC-01)', () => {
  it('publishes the source registration scope; private copies have none', () => {
    expect(new Set(facetsByPackage('scope-isolation').map((f) => f.shareScope))).toEqual(
      new Set(['__GLOBAL__']),
    );
    expect(new Set(facetsByPackage('strict-scope').map((f) => f.shareScope))).toEqual(
      new Set(['strict']),
    );
    const scoped = facetsByPackage('scoped');
    expect(scoped.length).toBeGreaterThan(0);
    expect(
      scoped.every((f) => f.disposition === 'private-registration' && f.shareScope === null),
    ).toBe(true);
  });
});

describe('tag pools and copy pools (T3-AC-02)', () => {
  it('pool-tag-coherent: one pool named as the orchestrator stored it (v4.7: its tag), formed by `ui`', () => {
    const { tagPools, orphanPoolTags } = projectionOf('pool-tag-coherent');
    expect(orphanPoolTags).toEqual([]);
    expect(
      tagPools.map(({ name, shareScope, members, remotes }) => ({
        name,
        shareScope,
        members,
        remotes,
      })),
    ).toEqual([
      {
        name: 'ui',
        shareScope: '__GLOBAL__',
        members: ['@nf-lab/ui-core', '@nf-lab/ui-dom'],
        remotes: ['mfe1', 'mfe2'],
      },
    ]);
    expect([...new Set(tagPools[0].tags.map((tag) => `${tag.remote}:${tag.tag}`))]).toEqual([
      'mfe1:ui',
      'mfe2:ui',
    ]);

    const facets = facetsByPackage('pool-tag-coherent');
    for (const f of facets.filter((f) => f.pkg?.startsWith('@nf-lab/ui-')))
      expect(f.pool).toBe('ui');
    expect(facets.find((f) => f.pkg === '@nf-lab/utils')?.pool).toBeNull();
  });

  it('pool-tag-anchored: an untagged remote declaring a member takes part', () => {
    const [pool] = projectionOf('pool-tag-anchored').tagPools;
    expect(pool.remotes).toEqual(['__NF-HOST__', 'mfe1', 'mfe2', 'mfe3']);
    expect([...new Set(pool.tags.map((tag) => tag.remote))]).toEqual(['mfe1', 'mfe2']);
  });

  it('pool-tag-islanded: scoped copies keep their pool', () => {
    const facets = facetsByPackage('pool-tag-islanded').filter(
      (f) => f.disposition === 'scope-registration',
    );
    expect(facets.length).toBeGreaterThan(0);
    expect(facets.every((f) => f.pool === 'ui')).toBe(true);
  });

  it('pool-tag-orphan: a lone tag forms no pool and is reported', () => {
    const { tagPools, orphanPoolTags } = projectionOf('pool-tag-orphan');
    expect(tagPools).toEqual([]);
    expect(
      orphanPoolTags.map(({ packageName, tags }) => ({
        packageName,
        tags: tags.map((t) => `${t.remote}:${t.tag}`),
      })),
    ).toEqual([{ packageName: '@nf-lab/ui-core', tags: ['mfe1:ui'] }]);
  });

  it('strict-scope and the V2 pooling-anchor capture', () => {
    expect(projectionOf('strict-scope').tagPools).toEqual([]);
    const [pool] = projectionOf('pooling-anchor').tagPools;
    expect(pool.members).toEqual(['@nf-lab/conflict-lib', '@nf-lab/conflict-lib/extra']);
    expect(pool.remotes).toEqual(['__NF-HOST__', 'mfe1', 'mfe2']);
  });

  it('builds: the copy carries the (remote, bundle) outputs of its bundle claims', () => {
    const facets = facetsByPackage('dense-chunking-only').filter((f) =>
      f.pkg?.startsWith('@nf-lab/dense-lib'),
    );
    expect(facets.length).toBeGreaterThan(0);
    expect(facets.every((f) => JSON.stringify(f.builds) === '["mfe1 · browser-shared"]')).toBe(
      true,
    );
    expect(facetsByPackage('dense-externals-only').every((f) => f.builds.length === 0)).toBe(true);
  });
});

describe('projection determinism (T3-AC-03)', () => {
  it.each(['pool-tag-anchored', 'dense-both', 'frankenstein-live'] as const)('%s', (id) => {
    const { tagPools, orphanPoolTags, copyGroupingFacets } = projectionOf(id);
    const again = projectionOf(id);
    expect({ tagPools, orphanPoolTags, copyGroupingFacets }).toEqual({
      tagPools: again.tagPools,
      orphanPoolTags: again.orphanPoolTags,
      copyGroupingFacets: again.copyGroupingFacets,
    });
  });
});

// `scope → package → [participant, tag?][]`, one `share` registration per package.
type Registry = Record<string, Record<string, [string, string?][]>>;

function poolsOf(registry: Registry) {
  const sharedExternals: NonNullable<SnapshotV1['runtime']>['sharedExternals'] = {};
  for (const [scope, packages] of Object.entries(registry)) {
    sharedExternals[scope] = {};
    for (const [pkg, participants] of Object.entries(packages)) {
      sharedExternals[scope][pkg] = {
        dirty: false,
        versions: [
          {
            tag: '1.0.0',
            action: 'share',
            host: false,
            remotes: participants.map(([name, pool]) => ({
              name,
              requiredVersion: '^1.0.0',
              strictVersion: true,
              file: null,
              entries: { [pkg]: `${name}-${pkg}.js` },
              cached: false,
              bundle: null,
              ...(pool === undefined ? {} : { pool }),
              servedFiles: [{ entry: pkg, file: `${name}-${pkg}.js` }],
              generation: 'v4.5' as const,
            })),
          },
        ],
      };
    }
  }
  const snapshot = {
    ...FIXTURES['pool-tag-coherent'],
    runtime: { ...FIXTURES['pool-tag-coherent'].runtime!, scopedExternals: {}, sharedExternals },
  } satisfies SnapshotV1;
  const { tagPools, orphanPoolTags } = deriveTagPools(normalizeRegistryEvidence(snapshot));
  return {
    pools: tagPools.map((pool) => `${pool.shareScope} ${pool.name}: ${pool.members.join(',')}`),
    orphans: orphanPoolTags.map((orphan) => `${orphan.shareScope} ${orphan.packageName}`),
  };
}

describe('tag-pool membership rules (T3-AC-04)', () => {
  it('tags are remote-local: one tag string on disjoint members forms two pools', () => {
    expect(
      poolsOf({
        __GLOBAL__: {
          a: [['mfe1', 'ui']],
          b: [['mfe1', 'ui']],
          c: [['mfe2', 'ui']],
          d: [['mfe2', 'ui']],
        },
      }),
    ).toEqual({ pools: ['__GLOBAL__ a: a,b', '__GLOBAL__ c: c,d'], orphans: [] });
  });

  it('different tags join through a shared member', () => {
    expect(
      poolsOf({
        __GLOBAL__: {
          react: [
            ['mfe1', 'react'],
            ['mfe2', 'ui'],
          ],
          'react-dom': [['mfe1', 'react']],
          lodash: [['mfe2', 'ui']],
        },
      }).pools,
    ).toEqual(['__GLOBAL__ lodash: lodash,react,react-dom']);
  });

  it('an untagged entrypoint follows its declared package', () => {
    expect(
      poolsOf({
        __GLOBAL__: {
          '@x/core': [['mfe1', 'x'], ['mfe2']],
          '@x/dom': [['mfe1', 'x']],
          '@x/dom/client': [['mfe1'], ['mfe2']],
          '@y/other/sub': [['mfe1']],
        },
      }).pools,
    ).toEqual(['__GLOBAL__ @x/core: @x/core,@x/dom,@x/dom/client']);
  });

  it('a single tagged member is an orphan; the strict scope never pools', () => {
    expect(
      poolsOf({
        __GLOBAL__: { a: [['mfe1', 'ui']], b: [['mfe2']] },
        strict: { c: [['mfe1', 's']], d: [['mfe1', 's']] },
      }),
    ).toEqual({ pools: [], orphans: ['__GLOBAL__ a'] });
  });

  it('pools stay within their share scope and are named reload-stably', () => {
    const registry: Registry = {
      ng22: {
        zeta: [['mfe2', 'p']],
        alpha: [
          ['mfe1', 'p'],
          ['mfe2', 'p'],
        ],
      },
      __GLOBAL__: { alpha: [['mfe1', 'p']] },
    };
    expect(poolsOf(registry)).toEqual({
      pools: ['ng22 alpha: alpha,zeta'],
      orphans: ['__GLOBAL__ alpha'],
    });
    expect(poolsOf(registry)).toEqual(poolsOf(registry));
  });
});
