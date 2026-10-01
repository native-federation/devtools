/**
 * Pools view model (share-pools Stage 2, Task 11) against the wording
 * contract in docs/work/share-pools/design/pools-explainer-mock.md and
 * the mock-up design/pools-matrix-mock.html. The pool-showcase, pool-portfolio
 * and pool-tag-* fixtures are orchestrator 4.7.0 captures; pooling-anchor is
 * 4.6.0. States no capture reaches (torn, pending, the rarer membership notes)
 * run on edited clones.
 */
import { describe, expect, it } from 'vitest';
import { FIXTURES, NF_HOST, type FixtureId, type SnapshotV1 } from 'devtools-bridge';

import { ingestSnapshot } from '../../shared/store/ingest';
import type { CanonicalResolutionProjection } from '../../shared/store/resolution';
import { buildPoolsVm, hasPoolTags, type PoolCardVm } from './pools-view-model';

// Each fixture carries the version its page exposed: 4.7.0 for the nf-lab corpus, none for v2.
const vmOfSnapshot = (snapshot: SnapshotV1) => {
  const model = ingestSnapshot(snapshot);
  return buildPoolsVm(model.resolutionProjection, model.provenance.orchestratorVersion);
};
const vmOf = (id: FixtureId) => vmOfSnapshot(FIXTURES[id]);
const projectionOf = (id: FixtureId) => ingestSnapshot(FIXTURES[id]).resolutionProjection;
const cardOf = (id: FixtureId, name: string) => vmOf(id).pools.find((pool) => pool.name === name)!;

// The matrix as a reader scans it: one line per band, then `remote [tag] cell…` per row.
const sketch = (card: PoolCardVm) =>
  card.bands.map((band) => ({
    band: band.label + (band.note ? ` · ${band.note}` : ''),
    rows: band.rows.map(
      (row) =>
        `${row.remote.name}${row.tag ? ` [${row.tag}]` : ''}${row.redirected ? ' ↪' : ''} ${row.cells
          .map((cell) => (cell.state ? `${cell.text}:${cell.state}` : cell.text))
          .join(' ')}`,
    ),
  }));
const verdictLine = (card: PoolCardVm) => {
  const v = card.verdict!;
  return `${v.icon} ${v.type}${v.cause ? ` · ${v.cause}` : ''} — ${v.who}${v.why ? ` · ${v.why}` : ''}`;
};
const allCells = (card: PoolCardVm) => card.bands.flatMap((b) => b.rows).flatMap((r) => r.cells);
const tooltip = (card: PoolCardVm, remote: string, column: number) =>
  card.bands.flatMap((b) => b.rows).find((r) => r.remote.name === remote)!.cells[column].tooltip;

describe('buildPoolsVm (share-pools T11)', () => {
  it('T11-AC-01: pool-showcase — problem pools first, orphan section, no warning', () => {
    const vm = vmOf('pool-showcase');
    expect(vm.pools.map((pool) => pool.name)).toEqual(['charts', 'ui', 'form-kit']);
    expect(vm.orphans).toEqual([
      '@nf-lab/icons: tag "icons" by catalog joined nothing — likely a typo or a missing sibling',
    ]);
    expect(vm.versionWarning).toBeNull();
  });

  it('charts: catalog isolated by one conflict; dashboard runs chart-core unshared', () => {
    const card = cardOf('pool-showcase', 'charts');
    expect(card).toMatchObject({
      counts: '2 packages · 2 remotes',
      tags: 'tag: charts',
      scopePrefix: '@nf-lab',
      columns: [
        { packageName: '@nf-lab/chart-core', label: 'chart-core' },
        { packageName: '@nf-lab/chart-dom', label: 'chart-dom' },
      ],
    });
    expect(sketch(card)).toEqual([
      { band: 'Build of dashboard', rows: ['dashboard [charts] 1.0.0:not-shared 2.0.0:unchanged'] },
      {
        band: 'Build of catalog · isolated',
        rows: ['catalog [charts] 1.1.0:isolated 1.1.0:conflict'],
      },
    ]);
    expect(verdictLine(card)).toBe('✕ Isolated · version conflict — catalog · 1 conflict');
    expect(card.verdict!.tone).toBe('isolated');
    expect(tooltip(card, 'catalog', 1)).toBe(
      'catalog · @nf-lab/chart-dom 1.1.0\nConflict: needs ^1.0.0, shared is 2.0.0',
    );
    expect(tooltip(card, 'catalog', 0)).toBe(
      "catalog · @nf-lab/chart-core 1.1.0\nIsolated: follows catalog's conflict, since a pool comes from one build.",
    );
    expect(tooltip(card, 'dashboard', 0)).toBe(
      'dashboard · @nf-lab/chart-core 1.0.0\nNot shared: no remote shares this package, so each loads its own',
    );
  });

  it("ui: admin and checkout redirected onto catalog's build", () => {
    const card = cardOf('pool-showcase', 'ui');
    expect(sketch(card)).toEqual([
      {
        band: 'Build of catalog · serves 2 others · 2 redirected',
        rows: [
          'catalog [ui] 1.0.0:serves-others 1.0.0:serves-others',
          'admin [no tag] ↪ 1.0.0:unchanged 1.0.0:unchanged',
          'checkout [ui] ↪ 1.0.0:unchanged 1.0.0:unchanged',
        ],
      },
      { band: 'Build of host · host precedence', rows: [`${NF_HOST} 2.0.0:unchanged ·`] },
    ]);
    expect(verdictLine(card)).toBe(
      '↪ Redirected · would mix builds — admin, checkout → build of catalog · shared versions come from host and catalog',
    );
    expect(card.verdict!.tone).toBe('quiet');
    expect(tooltip(card, 'admin', 0)).toBe(
      'admin · @nf-lab/ui-core 1.0.0\nRedirected to the build of catalog',
    );
    expect(tooltip(card, 'catalog', 0)).toBe(
      'catalog · @nf-lab/ui-core 1.0.0\nServes 2 other remotes',
    );
  });

  it('form-kit: one build under two tags', () => {
    const card = cardOf('pool-showcase', 'form-kit');
    expect(card.tags).toBe('tags: form-kit, forms');
    expect(sketch(card)).toEqual([
      {
        band: 'Build of checkout · serves 1 other',
        rows: [
          'checkout [forms] 1.1.0:serves-others 1.1.0:serves-others',
          'dashboard [form-kit] 1.1.0:unchanged 1.1.0:unchanged',
        ],
      },
    ]);
    expect(verdictLine(card)).toBe('✓ One build — build of checkout');
    expect(card.notes).toEqual([
      'tags "form-kit", "forms" form one pool — they meet through @nf-lab/form-core, @nf-lab/form-dom',
    ]);
  });

  it('pool-portfolio: legacy isolated on two conflicts, the redirect folded into its verdict', () => {
    const card = cardOf('pool-portfolio', 'acme');
    expect(card.columns.map((c) => c.label)).toEqual([
      'acme-animations',
      'acme-common',
      'acme-core',
      'acme-forms',
      'acme-router',
    ]);
    expect(card.bands.map((b) => `${b.label} · ${b.note}`)).toEqual([
      'Build of host · serves 5 others · host precedence',
      'Build of orders · serves 4 others · 4 redirected',
      'Build of legacy · isolated',
    ]);
    expect(verdictLine(card)).toBe(
      '✕ Isolated · version conflict — legacy · 2 conflicts · 4 remotes redirected',
    );
    expect(tooltip(card, 'legacy', 1)).toBe(
      "legacy · @nf-lab/acme-common 16.2.12\nIsolated: follows legacy's conflicts, since a pool comes from one build. Its own range (^16.0.0, not strict) wouldn't have blocked the shared 18.2.0.",
    );
    expect(tooltip(card, 'products', 2)).toBe(
      'products · @nf-lab/acme-core 18.2.0\nUnchanged: the build of host',
    );
    const reports = card.bands[1].rows.find((r) => r.remote.name === 'reports')!;
    expect(reports).toMatchObject({ tag: 'no tag', redirected: true });
  });

  it('pooling-anchor (4.6.0): first-member name, redirect verdict, the version warning', () => {
    const vm = vmOf('pooling-anchor');
    const [card] = vm.pools;
    expect(card.name).toBe('@nf-lab/conflict-lib');
    expect(verdictLine(card)).toBe(
      '↪ Redirected · would mix builds — mfe2 → build of mfe1 · shared versions come from host and mfe1',
    );
    expect(vm.versionWarning).toBe(
      'No orchestrator version found (exposed from 4.7.0). Pool names and reasons may be missing.',
    );
  });

  it('pool-tag-orphan: no pool, the orphan line, the tab still has content', () => {
    const vm = vmOf('pool-tag-orphan');
    expect(vm.pools).toEqual([]);
    expect(vm.orphans).toEqual([
      '@nf-lab/ui-core: tag "ui" by mfe1 joined nothing — likely a typo or a missing sibling',
    ]);
    expect(vm.emptyNote).toBeNull();
    expect(hasPoolTags(projectionOf('pool-tag-orphan'))).toBe(true);
  });

  it('no pool tags: empty note, no tab', () => {
    expect(vmOf('frankenstein-live')).toEqual({
      versionWarning: null,
      pools: [],
      orphans: [],
      emptyNote: 'No pool tags in this capture.',
    });
    expect(hasPoolTags(projectionOf('frankenstein-live'))).toBe(false);
  });

  describe('states no capture reaches', () => {
    it('a dirty record shows plain versions and no verdict while pending', () => {
      const snapshot: SnapshotV1 = structuredClone(FIXTURES['pool-tag-coherent']);
      for (const external of Object.values(snapshot.runtime!.sharedExternals['__GLOBAL__']))
        external.dirty = true;
      const [card] = vmOfSnapshot(snapshot).pools;
      expect(card.pendingNote).toBe('pending re-election — outcomes not settled yet');
      expect(card.verdict).toBeNull();
      expect(allCells(card).every((cell) => cell.state === null)).toBe(true);
    });

    it('a torn combination leads with Mixed builds', () => {
      const base = projectionOf('pool-tag-coherent');
      const [family] = base.poolFamilies;
      const projection: CanonicalResolutionProjection = {
        ...base,
        poolFamilies: [
          {
            ...family,
            statusMatrix: {
              ...family.statusMatrix,
              verdict: { ...family.statusMatrix.verdict, kind: 'torn', torn: ['mfe2'] },
            },
          },
        ],
      };
      const [card] = buildPoolsVm(projection, '4.7.0').pools;
      expect(verdictLine(card)).toBe(
        '✕ Mixed builds — mfe2 · no single build ships their combination',
      );
      expect(card.verdict!.tone).toBe('torn');
    });

    it('membership notes: a lone remote, a shared tag string, an untagged entrypoint', () => {
      const base = projectionOf('pool-tag-coherent');
      const [pool] = base.tagPools;
      const [family] = base.poolFamilies;
      const other = {
        ...pool,
        id: 'tag-pool:["__GLOBAL__","zz",0]' as typeof pool.id,
        name: 'zz',
        remotes: ['mfe1'],
      };
      const projection: CanonicalResolutionProjection = {
        ...base,
        tagPools: [pool, other],
        poolFamilies: [
          {
            ...family,
            members: [
              family.members[0],
              { ...family.members[1], followsPackage: '@nf-lab/ui-core' },
            ],
          },
          { ...family, poolId: other.id },
        ],
      };
      const [card, lone] = buildPoolsVm(projection, '4.7.0').pools;
      expect(card.notes).toEqual([
        'tag "ui" also forms pool zz — tags only connect through a shared package',
        '@nf-lab/ui-dom follows its package @nf-lab/ui-core',
      ]);
      expect(lone.notes[0]).toBe('only one remote declares its members — nothing to coordinate');
    });

    it('an unknown stored cause is shown raw', () => {
      const snapshot: SnapshotV1 = structuredClone(FIXTURES['pool-tag-islanded']);
      for (const external of Object.values(snapshot.runtime!.sharedExternals['__GLOBAL__']))
        for (const version of external.versions)
          for (const remote of version.remotes)
            if (remote.name === 'mfe1') remote.poolCause = 'future';
      expect(verdictLine(vmOfSnapshot(snapshot).pools[0])).toBe(
        '✕ Isolated · future — mfe1 · 1 conflict',
      );
    });

    // mfe1's ui-dom copy (strict ^1.0.0 against the shared 2.0.0) is the capture's one conflict.
    it.each([
      ['a range that accepts the shared tag', { requiredVersion: '>=1.0.0' }],
      ['a range it cannot read', { requiredVersion: 'latest' }],
      ['a non-strict copy', { strictVersion: false }],
    ])('marks no conflict for %s', (_case, override) => {
      const snapshot: SnapshotV1 = structuredClone(FIXTURES['pool-tag-islanded']);
      const dom = snapshot.runtime!.sharedExternals['__GLOBAL__']['@nf-lab/ui-dom'];
      Object.assign(dom.versions.find((v) => v.action === 'scope')!.remotes[0], override);
      const [card] = vmOfSnapshot(snapshot).pools;
      expect(verdictLine(card)).toBe('✕ Isolated · version conflict — mfe1');
      expect(allCells(card).some((cell) => cell.state === 'conflict')).toBe(false);
    });
  });

  describe('pre-4.7.0 warning', () => {
    const warningOf = (version: string | null, snapshot: SnapshotV1 = FIXTURES['pooling-anchor']) =>
      buildPoolsVm(ingestSnapshot(snapshot).resolutionProjection, version).versionWarning;

    it('warns once, at the top, for an older or unexposed version', () => {
      expect(warningOf(null)).toBe(
        'No orchestrator version found (exposed from 4.7.0). Pool names and reasons may be missing.',
      );
      expect(warningOf('4.6.0')).toBe(
        "This page runs orchestrator 4.6.0, which doesn't store pool names or why a remote got its own copy — this tab may be incomplete.",
      );
    });

    it('does not warn from 4.7.0 on, for an unreleased build, or when there is nothing to show', () => {
      expect(warningOf('4.7.0')).toBeNull();
      expect(warningOf('5.0.0-rc.1')).toBeNull();
      expect(warningOf('dev')).toBeNull();
      expect(warningOf(null, FIXTURES['frankenstein-live'])).toBeNull();
    });

    // The version is exposed by a best-effort write; a stored poolName proves v4.7 without it.
    it('does not warn when the record carries v4.7 pool state but no version was exposed', () => {
      expect(warningOf(null, FIXTURES['pool-tag-islanded'])).toBeNull();
    });
  });
});
