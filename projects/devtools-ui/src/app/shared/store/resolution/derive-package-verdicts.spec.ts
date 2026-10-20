/**
 * Package verdicts (packages-verdicts Task 2): the resolver's decision per
 * declaration, read from the stored row action, plus a semver re-check that
 * separates a reused shared version from one a non-strict range rejects.
 * Expectations follow the stored rows in the Task 1 log's evidence table.
 */
import { describe, expect, it } from 'vitest';
import { FIXTURES, NF_HOST, type FixtureId, type SnapshotV1 } from 'devtools-bridge';

import { ingestSnapshot } from '../ingest';
import type { PackageScopeVerdicts } from './verdict-model';

const verdictsOf = (snapshot: SnapshotV1) =>
  ingestSnapshot(snapshot).resolutionProjection.packageScopeVerdicts;
const entry = (id: FixtureId, scope: string, pkg: string): PackageScopeVerdicts =>
  verdictsOf(FIXTURES[id]).find((v) => v.shareScope === scope && v.packageName === pkg)!;
const byRemote = (verdicts: PackageScopeVerdicts) =>
  Object.fromEntries(verdicts.declarations.map((d) => [d.participant, d]));

const KIT = '@nf-lab/kit';

describe('derivePackageVerdicts — verdicts from stored rows', () => {
  it('T2-AC-01 out-of-range-nonstrict: only the non-strict mismatch runs out of range', () => {
    const kit = entry('out-of-range-nonstrict', '__GLOBAL__', KIT);
    expect(kit.electedTag).toBe('2.0.0');
    expect(byRemote(kit)).toMatchObject({
      [NF_HOST]: { verdict: 'provides', runsTag: '2.0.0' },
      mfe3: { verdict: 'same-version', runsTag: '2.0.0' },
      // ^1.0.0 rejects 2.0.0 and is not strict: stored `skip`, runs the elected tag anyway.
      mfe1: { verdict: 'out-of-range', acceptsElected: false, runsTag: '2.0.0' },
      mfe2: { verdict: 'own-copy', acceptsElected: false, runsTag: '1.3.0' },
    });
    const outOfRange = verdictsOf(FIXTURES['out-of-range-nonstrict'])
      .flatMap((v) => v.declarations)
      .filter((d) => d.verdict === 'out-of-range');
    expect(outOfRange.map((d) => d.participant)).toEqual(['mfe1']);
  });

  it('T2-AC-02 scope-isolation: the strict mismatch keeps its own copy, its version scoped', () => {
    const [lib] = verdictsOf(FIXTURES['scope-isolation']).filter((v) => v.declarations.length > 1);
    const own = lib.declarations.filter((d) => d.verdict === 'own-copy');
    expect(own).toHaveLength(1);
    expect(lib.versions.find((v) => v.tag === own[0].tag)?.status).toBe('scoped');
  });

  it('T2-AC-03 strict-scope: no election, every version shared side by side', () => {
    const strict = verdictsOf(FIXTURES['strict-scope']).filter((v) => v.shareScope === 'strict');
    expect(strict.length).toBeGreaterThan(0);
    for (const scope of strict) {
      expect(scope.electedTag).toBeNull();
      expect(scope.versions.every((v) => v.status === 'shared')).toBe(true);
      expect(
        scope.declarations.every((d) => ['provides', 'same-version'].includes(d.verdict)),
      ).toBe(true);
    }
  });

  it('T2-AC-04 an unreadable range yields unknown, never out-of-range', () => {
    const snapshot = structuredClone(FIXTURES['out-of-range-nonstrict']) as SnapshotV1;
    const kit = (snapshot.runtime as any).sharedExternals['__GLOBAL__'][KIT];
    const mfe1 = kit.versions.flatMap((v: any) => v.remotes).find((r: any) => r.name === 'mfe1');
    mfe1.requiredVersion = 'not a range';
    const verdicts = verdictsOf(snapshot).find((v) => v.packageName === KIT)!;
    expect(byRemote(verdicts)['mfe1']).toMatchObject({ verdict: 'unknown', acceptsElected: null });
  });

  it('T2-AC-05 verdicts agree with the Pools matrix on every pool fixture', () => {
    const poolFixtures: FixtureId[] = [
      'pooling-anchor',
      'pool-tag-coherent',
      'pool-tag-islanded',
      'pool-tag-anchored',
      'pool-showcase',
      'pool-portfolio',
    ];
    let compared = 0;
    for (const id of poolFixtures) {
      const projection = ingestSnapshot(FIXTURES[id]).resolutionProjection;
      for (const family of projection.poolFamilies) {
        const pool = projection.tagPools.find((p) => p.id === family.poolId)!;
        for (const row of family.statusMatrix.bands.flatMap((band) => band.rows)) {
          row.cells.forEach((cell, index) => {
            if (cell === null) return;
            const verdicts = projection.packageScopeVerdicts.find(
              (v) =>
                v.shareScope === pool.shareScope &&
                v.packageName === family.members[index].packageName,
            )!;
            const record = verdicts.declarations.find((d) => d.participant === row.remote)!;
            expect(record.acceptsElected, `${id} ${row.remote}`).toBe(cell.acceptsShared);
            if (cell.state === 'rejected') expect(record.verdict).not.toBe('reuses-shared');
            compared += 1;
          });
        }
      }
    }
    expect(compared).toBeGreaterThan(20);
  });
});

describe('derivePackageVerdicts — version statuses', () => {
  // Orchestrator 4.8 borrows no entrypoint: a remote the shared build does not cover runs its own copy.
  it('fallback-uncovered: remotes whose secondaries the shared version lacks keep their own copies', () => {
    const kit = entry('fallback-uncovered', '__GLOBAL__', KIT);
    expect(kit.versions.map((v) => `${v.tag}:${v.status}`)).toEqual([
      '1.4.0:shared',
      '1.3.0:scoped',
      '1.2.0:scoped',
    ]);
    expect(byRemote(kit)).toMatchObject({
      mfe1: { verdict: 'own-copy', runsTag: '1.2.0' },
      mfe2: { verdict: 'own-copy', runsTag: '1.3.0' },
    });
  });

  it('merged-entrypoints: same version, but mfe1 adds secondaries, so it keeps its own copy', () => {
    const kit = entry('merged-entrypoints', '__GLOBAL__', KIT);
    expect(kit.versions).toHaveLength(1);
    expect(kit.versions[0]).toMatchObject({ tag: '1.2.0', status: 'shared' });
    expect(kit.versions[0].copyIds).toHaveLength(2);
    expect(byRemote(kit)).toMatchObject({
      [NF_HOST]: { verdict: 'provides' },
      mfe1: { verdict: 'own-copy' },
    });
  });

  it('multi-scope: each scope elects on its own; strict elects none', () => {
    const kits = verdictsOf(FIXTURES['multi-scope']).filter((v) => v.packageName === KIT);
    expect(kits.map((v) => `${v.shareScope}:${v.electedTag}`).sort()).toEqual([
      '__GLOBAL__:1.4.0',
      'strict:null',
      'team-a:1.3.0',
    ]);
    const teamA = kits.find((v) => v.shareScope === 'team-a')!;
    expect(byRemote(teamA)).toMatchObject({
      mfe2: { verdict: 'provides' },
      mfe3: { verdict: 'reuses-shared', runsTag: '1.3.0' },
    });
  });

  it('lists every registered tag semver descending', () => {
    const kit = entry('out-of-range-nonstrict', '__GLOBAL__', KIT);
    expect(kit.versions.map((v) => `${v.tag}:${v.status}`)).toEqual([
      '2.0.0:shared',
      '1.3.0:scoped',
      '1.2.0:not-mapped',
    ]);
  });
});

describe('derivePackageVerdicts — build surface', () => {
  it('T3-AC-01 merged-entrypoints: two builds of 1.2.0, mfe1 keeping its secondaries', () => {
    const [version] = entry('merged-entrypoints', '__GLOBAL__', KIT).versions;
    expect(version.builds.map((b) => [b.sourceRemote, [...b.specifiers].sort()])).toEqual([
      ['mfe1', [KIT, `${KIT}/dialog`, `${KIT}/table`]],
      [NF_HOST, [KIT]],
    ]);
  });

  // 4.8 records a serving build, so the host's copy alone serves the shared 1.2.0.
  it('T3-AC-02 merged-entrypoints: a scoped copy of the shared tag is no merge', () => {
    const [version] = entry('merged-entrypoints', '__GLOBAL__', KIT).versions;
    expect(version.merged).toBe(false);
    expect(version.builds.map((b) => [b.sourceRemote, b.fromShareRow])).toEqual([
      ['mfe1', false],
      [NF_HOST, true],
    ]);
  });

  it('T3-AC-04 SRI per entry file follows the effective map', () => {
    const projection = ingestSnapshot(FIXTURES['frankenstein-live']).resolutionProjection;
    const files = projection.packageScopeVerdicts.flatMap((v) =>
      v.versions.flatMap((version) => version.builds.flatMap((b) => b.entryFiles)),
    );
    expect(files.length).toBeGreaterThan(0);
    const mapped = new Map<string, boolean>();
    for (const copy of projection.copies) {
      for (const url of Object.values(copy.entrypoints)) mapped.set(url, false);
    }
    for (const file of files) expect(mapped.has(file.url)).toBe(true);
    expect(files.some((f) => f.hasIntegrity)).toBe(true);
  });

  it('dense-chunking-only: the bundle chunks ride with their build, resolved to URLs', () => {
    const builds = verdictsOf(FIXTURES['dense-chunking-only']).flatMap((v) =>
      v.versions.flatMap((version) => version.builds),
    );
    const chunks = builds.flatMap((b) => b.chunkFiles);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.url?.startsWith('http://localhost:4300/'))).toBe(true);
  });
});

// pools-v48 Task 6: why a declaration is off the global map, against orchestrator 4.8 records.
describe('derivePackageVerdicts — placement reasons (pools-v48 T6)', () => {
  it('T6-AC-01 fallback-uncovered: the serving build lacks every secondary the remote ships', () => {
    const kit = entry('fallback-uncovered', '__GLOBAL__', KIT);
    expect(kit.servingBuild).toBe(NF_HOST);
    expect(byRemote(kit)['mfe2'].reason).toEqual({
      scope: 'package',
      build: NF_HOST,
      miss: {
        kind: 'coverage',
        missing: [`${KIT}/charts`, `${KIT}/charts/legend`, `${KIT}/date-picker`],
      },
      storedCause: null,
    });
  });

  it('out-of-range-nonstrict: a strict range that rejects the serving tag', () => {
    expect(
      byRemote(entry('out-of-range-nonstrict', '__GLOBAL__', KIT))['mfe2'].reason,
    ).toMatchObject({
      scope: 'package',
      miss: {
        kind: 'range',
        rejections: [{ tag: '2.0.0', requiredVersion: '^1.0.0', strict: true }],
      },
    });
  });

  it('T6-AC-02 a pooled own copy carries the pool reason, not a strict-range guess', () => {
    const core = entry('pool-uncovered-gap', '__GLOBAL__', '@nf-lab/ui-core');
    expect(byRemote(core)['mfe1']).toMatchObject({
      verdict: 'own-copy',
      acceptsElected: true,
      reason: {
        scope: 'pool',
        build: NF_HOST,
        miss: { kind: 'coverage', missing: ['@nf-lab/ui-core/testing'] },
        storedCause: 'uncovered',
      },
    });
  });

  it('a subpool member runs its owner build, with the pool reason', () => {
    const dom = entry('pool-showcase', '__GLOBAL__', '@nf-lab/ui-dom');
    expect(byRemote(dom)['catalog']).toMatchObject({
      verdict: 'subpool',
      subpoolOf: 'admin',
      reason: { scope: 'pool', miss: { kind: 'coverage', missing: ['@nf-lab/ui-dom'] } },
    });
  });

  it('own-tag-out-of-range: a range that excludes its own version still accepts it', () => {
    const kit = entry('own-tag-out-of-range', '__GLOBAL__', KIT);
    expect(byRemote(kit)[NF_HOST]).toMatchObject({
      requiredVersion: '^2.0.0',
      acceptsElected: true,
    });
    expect(kit.declarations.every((d) => d.verdict !== 'out-of-range')).toBe(true);
  });
});
