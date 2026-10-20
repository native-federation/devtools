/**
 * Pools view model (share-pools Stage 2 Task 11, pools-v48 Task 5) against the
 * wording contract in docs/work/pools-v48/design/pools-reasons-mock.md. The pool-showcase, pool-portfolio
 * and pool-tag-* fixtures are orchestrator 4.8.0 captures; pooling-anchor is
 * 4.6.0. States no capture reaches (pending, the rarer membership notes) run on
 * edited clones.
 */
import { describe, expect, it } from 'vitest';
import { FIXTURES, NF_HOST, type FixtureId, type SnapshotV1 } from 'devtools-bridge';

import { ingestSnapshot } from '../../shared/store/ingest';
import type { CanonicalResolutionProjection } from '../../shared/store/resolution';
import { buildPoolsVm, hasPoolTags, remoteListOf, type PoolCardVm } from './pools-view-model';

// Each fixture carries the version its page exposed: 4.8.0 for the nf-lab corpora, none for v2.
const vmOfSnapshot = (snapshot: SnapshotV1) => {
  const model = ingestSnapshot(snapshot);
  return buildPoolsVm(
    model.resolutionProjection,
    model.provenance.runtimeSource?.orchestratorVersion ?? null,
  );
};
const vmOf = (id: FixtureId) => vmOfSnapshot(FIXTURES[id]);
const projectionOf = (id: FixtureId) => ingestSnapshot(FIXTURES[id]).resolutionProjection;
const cardOf = (id: FixtureId, name: string) => vmOf(id).pools.find((pool) => pool.name === name)!;
// The card with its global-map band selected: the warning lists the pool's issues.
const selectedCard = (id: FixtureId, name: string) => {
  const model = ingestSnapshot(FIXTURES[id]);
  const pool = model.resolutionProjection.tagPools.find((p) => p.name === name)!;
  return buildPoolsVm(
    model.resolutionProjection,
    model.provenance.runtimeSource?.orchestratorVersion ?? null,
    { poolId: pool.id, owner: null },
  ).pools.find((card) => card.id === pool.id)!;
};

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
// The warning box as a reader scans it: `<remotes> <label> <subject> [detail]`, a subpool as
// `<owner> (subpool: <its remotes>)`.
const issueLines = (card: PoolCardVm) =>
  card.coverage.issues.map((i) =>
    [
      i.remotes.shown
        .map((r) => (r.subpool ? `${r.name} (subpool: ${r.subpool.names})` : r.name))
        .join(', ') + (i.remotes.more > 0 ? ` +${i.remotes.more}` : ''),
      i.label,
      i.subjectAll ?? i.subject,
      i.detail,
    ]
      .filter((part) => part !== null)
      .join(' '),
  );
const gaps = (card: PoolCardVm) =>
  card.coverage.issues
    .filter((i) => i.kind === 'missing')
    .map((i) => `${i.subject} (${i.all.map((r) => r.name).join(', ')})`);
const allCells = (card: PoolCardVm) => card.bands.flatMap((b) => b.rows).flatMap((r) => r.cells);
// A row's reason, or its band's when every row of the band shares it.
const reasonOf = (card: PoolCardVm, remote: string) => {
  const band = card.bands.find((b) => b.rows.some((r) => r.remote.name === remote))!;
  const [reason = null] = band.rows.find((r) => r.remote.name === remote)!.reasons;
  return reason === null ? null : `${reason.cause ? `${reason.cause}: ` : ''}${reason.text}`;
};
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

  it('mixed scopes: one header cell per scope, labels without their own scope', () => {
    // The coherent ui pool with ui-dom moved to another scope and a third, unscoped member
    // renamed in: a design-system package next to a framework, as real pools mix them.
    const snapshot: SnapshotV1 = JSON.parse(
      JSON.stringify(FIXTURES['pool-tag-coherent']).replaceAll('@nf-lab/ui-dom', '@nf-ds/buttons'),
    );
    const [card] = vmOfSnapshot(snapshot).pools;
    expect(card.scopePrefix).toBeNull();
    expect(card.scopeGroups).toEqual([
      { label: '@nf-ds/', span: 1 },
      { label: '@nf-lab/', span: 1 },
    ]);
    expect(card.columns.map((column) => column.label)).toEqual(['buttons', 'ui-core']);
  });

  it('an unscoped package (like rxjs) gets its own unlabelled run after the scoped ones', () => {
    const snapshot: SnapshotV1 = JSON.parse(
      JSON.stringify(FIXTURES['pool-tag-coherent']).replaceAll('@nf-lab/ui-dom', 'ui-dom'),
    );
    const [card] = vmOfSnapshot(snapshot).pools;
    expect(card.scopeGroups).toEqual([
      { label: '@nf-lab/', span: 1 },
      { label: '', span: 1 },
    ]);
    expect(card.columns.map((column) => column.label)).toEqual(['ui-core', 'ui-dom']);
  });

  it('only unscoped packages: no corner prefix, no scope row, full names', () => {
    const snapshot: SnapshotV1 = JSON.parse(
      JSON.stringify(FIXTURES['pool-tag-coherent']).replaceAll('@nf-lab/ui-', 'ui-'),
    );
    const [card] = vmOfSnapshot(snapshot).pools;
    expect(card.scopePrefix).toBeNull();
    expect(card.scopeGroups).toBeNull();
    expect(card.columns.map((column) => column.label)).toEqual(['ui-core', 'ui-dom']);
  });

  it('a single scope keeps the corner prefix and no scope row', () => {
    expect(cardOf('pool-showcase', 'charts').scopeGroups).toBeNull();
  });

  it('charts: dashboard on its own build, its range rejecting the global chart-dom', () => {
    const card = cardOf('pool-showcase', 'charts');
    expect(card).toMatchObject({
      counts: '2 packages · 2 remotes',
      tags: 'tag: charts',
      coverage: { text: 'Global map serves all 2 entrypoints the remotes import', complete: true },
      scopePrefix: '@nf-lab',
      columns: [
        { packageName: '@nf-lab/chart-core', label: 'chart-core' },
        { packageName: '@nf-lab/chart-dom', label: 'chart-dom' },
      ],
    });
    expect(sketch(card)).toEqual([
      {
        band: 'Global map · build of catalog',
        rows: ['catalog [charts] 1.1.0:unchanged 1.1.0:unchanged'],
      },
      { band: 'Own build · dashboard', rows: ['dashboard [charts] 1.0.0:isolated 2.0.0:rejected'] },
    ]);
    expect(reasonOf(card, 'dashboard')).toBe(
      'version conflict: its range ^2.0.0 (strict) rejects the global 1.1.0 of @nf-lab/chart-dom',
    );
    expect(reasonOf(card, 'catalog')).toBeNull();
    expect(verdictLine(card)).toBe('✕ Own build · version conflict — dashboard · 1 rejection');
    expect(card.verdict!.tone).toBe('isolated');
    expect(tooltip(card, 'dashboard', 1)).toBe(
      'dashboard · @nf-lab/chart-dom 2.0.0\nRejected: needs ^2.0.0, the global map has 1.1.0',
    );
    expect(tooltip(card, 'dashboard', 0)).toBe(
      'dashboard · @nf-lab/chart-core 1.0.0\nOwn build: runs the whole pool from its own build. Its range (^1.0.0) accepts the global 1.1.0.',
    );
  });

  it("ui: catalog and checkout in the subpool on admin's build, for the ui-dom the host lacks", () => {
    const card = selectedCard('pool-showcase', 'ui');
    expect(card.coverage).toMatchObject({
      text: 'Global map serves 1 of 2 entrypoints the remotes import',
      complete: false,
    });
    expect(gaps(card)).toEqual(['@nf-lab/ui-dom (admin, catalog, checkout)']);
    expect(sketch(card)).toEqual([
      {
        band: 'Global map · build of host · host precedence',
        rows: [`${NF_HOST} 2.0.0:unchanged ·`],
      },
      {
        band: 'Subpool · build of admin · serves 2 others',
        rows: [
          'admin [no tag] 1.0.0:serves-others 1.0.0:gap',
          'catalog [ui] ↪ 1.0.0:unchanged 1.0.0:gap',
          'checkout [ui] ↪ 1.0.0:unchanged 1.0.0:gap',
        ],
      },
    ]);
    expect(reasonOf(card, 'catalog')).toBe('not covered: the global map lacks @nf-lab/ui-dom');
    expect(verdictLine(card)).toBe('↪ Subpool · not covered — catalog, checkout → build of admin');
    expect(card.verdict!.tone).toBe('quiet');
    expect(tooltip(card, 'catalog', 0)).toBe(
      'catalog · @nf-lab/ui-core 1.0.0\nSubpool: runs the build of admin',
    );
    expect(tooltip(card, 'catalog', 1)).toBe(
      'catalog · @nf-lab/ui-dom 1.0.0\nNot on the global map: @nf-lab/ui-dom',
    );
    expect(tooltip(card, 'admin', 0)).toBe('admin · @nf-lab/ui-core 1.0.0\nServes 2 other remotes');
  });

  it('form-kit: one build under two tags', () => {
    const card = cardOf('pool-showcase', 'form-kit');
    expect(card.tags).toBe('tags: form-kit, forms');
    expect(sketch(card)).toEqual([
      {
        band: 'Global map · build of checkout · serves 1 other',
        rows: [
          'checkout [forms] 1.1.0:serves-others 1.1.0:serves-others',
          'dashboard [form-kit] 1.1.0:unchanged 1.1.0:unchanged',
        ],
      },
    ]);
    expect(verdictLine(card)).toBe('✓ One build — build of checkout');
    expect(tooltip(card, 'dashboard', 0)).toBe(
      'dashboard · @nf-lab/form-core 1.1.0\nGlobal map: the build of checkout',
    );
    expect(card.notes).toEqual([
      'tags "form-kit", "forms" form one pool — they meet through @nf-lab/form-core, @nf-lab/form-dom',
    ]);
  });

  it("pool-portfolio: legacy also says why contacts' subpool does not take it", () => {
    const card = selectedCard('pool-portfolio', 'acme');
    const legacy = card.bands[2].rows[0];
    expect(legacy.reasons.map((r) => `${r.cause}: ${r.text}`)).toEqual([
      'version conflict: its range ^16.0.0 rejects the global 18.2.0 of @nf-lab/acme-core, @nf-lab/acme-router (strict) and @nf-lab/acme-common (not strict)',
      'not in the subpool of contacts: its range ^16.0.0 rejects the served 18.1.3 of @nf-lab/acme-core, @nf-lab/acme-router (strict) and @nf-lab/acme-animations, @nf-lab/acme-common, @nf-lab/acme-forms (not strict)',
    ]);
    expect(legacy.chip).toMatchObject({ label: 'version conflict', unexplained: false });
    // The warning box: legacy's conflicts first (strict, then not), then the two missing packages.
    expect(issueLines(card)).toEqual([
      'legacy conflict @nf-lab/acme-core, @nf-lab/acme-router global 18.2.0 · needs ^16.0.0 (strict)',
      'legacy conflict @nf-lab/acme-common global 18.2.0 · needs ^16.0.0',
      'contacts (subpool: contacts, invoices, onboarding, orders, reports), legacy missing @nf-lab/acme-animations',
      'contacts (subpool: contacts, invoices, onboarding, orders, reports), legacy missing @nf-lab/acme-forms',
    ]);
  });

  it('pool-portfolio: every rejection of legacy listed, the subpool folded into the verdict', () => {
    const card = cardOf('pool-portfolio', 'acme');
    expect(card.columns.map((c) => c.label)).toEqual([
      'acme-animations',
      'acme-common',
      'acme-core',
      'acme-forms',
      'acme-router',
    ]);
    expect(card.bands.map((b) => `${b.label} · ${b.note}`)).toEqual([
      'Global map · build of host · serves 5 others · host precedence',
      'Subpool · build of contacts · serves 4 others',
      'Own build · legacy · null',
    ]);
    expect(reasonOf(card, 'legacy')).toBe(
      'version conflict: its range ^16.0.0 rejects the global 18.2.0 of @nf-lab/acme-core, @nf-lab/acme-router (strict) and @nf-lab/acme-common (not strict)',
    );
    expect(reasonOf(card, 'reports')).toBe(
      'not covered: the global map lacks @nf-lab/acme-animations, @nf-lab/acme-forms',
    );
    expect(verdictLine(card)).toBe(
      '✕ Own build · version conflict — legacy · 3 rejections · 4 remotes in a subpool',
    );
    expect(tooltip(card, 'legacy', 1)).toBe(
      'legacy · @nf-lab/acme-common 16.2.12\nRejected: needs ^16.0.0 (not strict), the global map has 18.2.0',
    );
    expect(tooltip(card, 'products', 2)).toBe(
      'products · @nf-lab/acme-core 18.2.0\nGlobal map: the build of host',
    );
    const reports = card.bands[1].rows.find((r) => r.remote.name === 'reports')!;
    expect(reports).toMatchObject({ tag: 'no tag', redirected: true });
  });

  it('pool-uncovered-gap: the secondary entrypoint the global map lacks', () => {
    const card = selectedCard('pool-uncovered-gap', 'ui');
    expect(card.coverage.text).toBe('Global map serves 2 of 3 entrypoints the remotes import');
    expect(gaps(card)).toEqual(['@nf-lab/ui-core/testing (mfe1)']);
    expect(sketch(card)[1]).toEqual({
      band: 'Own build · mfe1',
      rows: ['mfe1 [ui] 1.0.0:gap 1.0.0:isolated'],
    });
    expect(reasonOf(card, 'mfe1')).toBe(
      'not covered: the global map lacks @nf-lab/ui-core/testing',
    );
    expect(tooltip(card, 'mfe1', 0)).toBe(
      'mfe1 · @nf-lab/ui-core 1.0.0\nNot on the global map: @nf-lab/ui-core/testing',
    );
    expect(verdictLine(card)).toBe('✕ Own build · not covered — mfe1');
  });

  it('pool-incompatible-nonstrict: a non-strict range rejects too', () => {
    const card = cardOf('pool-incompatible-nonstrict', 'ui');
    expect(reasonOf(card, 'mfe1')).toBe(
      'version conflict: its range ^1.0.0 (not strict) rejects the global 2.0.0 of @nf-lab/ui-core, @nf-lab/ui-dom',
    );
    expect(verdictLine(card)).toBe('✕ Own build · version conflict — mfe1 · 2 rejections');
  });

  it('pool-unshipped: an extension in the band, the unshipped combination as the reason', () => {
    const card = cardOf('pool-unshipped', 'ui');
    expect(card.bands[0].label + ' · ' + card.bands[0].note).toBe(
      'Global map · build of host · serves 1 other · host precedence · @nf-lab/ui-dom 2.0.0 from mfe1',
    );
    expect(reasonOf(card, 'mfe2')).toBe(
      'not covered: every entrypoint is on the global map, but no single build ships @nf-lab/ui-dom with the rest',
    );
  });

  it('pooling-anchor (4.6.0): first-member name, redirect verdict, the version warning', () => {
    const vm = vmOf('pooling-anchor');
    const [card] = vm.pools;
    expect(card.name).toBe('@nf-lab/conflict-lib');
    expect(verdictLine(card)).toBe('↪ Subpool · not covered — mfe2 → build of mfe1');
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
            if (remote.name === 'mfe2') remote.poolCause = 'future';
      const [card] = vmOfSnapshot(snapshot).pools;
      expect(verdictLine(card)).toBe('✕ Own build · future — mfe2 · 1 rejection · 1 unexplained');
      expect(card.bands[1].rows[0].reasons[0]).toEqual({
        cause: 'future',
        text: "its range ^2.0.0 (strict) rejects the global 1.1.0 of @nf-lab/ui-dom — but the stored cause is 'future'",
        unexplained: true,
      });
    });

    // mfe2's ui-dom copy (strict ^2.0.0 against the global 1.1.0) is the capture's one rejection.
    it.each([
      ['a range that accepts the global tag', { requiredVersion: '>=1.0.0' }],
      ['a range it cannot read', { requiredVersion: 'latest' }],
    ])('marks no rejection for %s and calls the stored cause unexplained', (_case, override) => {
      const snapshot: SnapshotV1 = structuredClone(FIXTURES['pool-tag-islanded']);
      const dom = snapshot.runtime!.sharedExternals['__GLOBAL__']['@nf-lab/ui-dom'];
      Object.assign(dom.versions.find((v) => v.action === 'scope')!.remotes[0], override);
      const [card] = vmOfSnapshot(snapshot).pools;
      expect(verdictLine(card)).toBe('✕ Own build · version conflict — mfe2 · 1 unexplained');
      expect(allCells(card).some((cell) => cell.state === 'rejected')).toBe(false);
      expect(reasonOf(card, 'mfe2')).toBe(
        'version conflict: the stored rows do not reproduce why it is off the global map',
      );
    });

    it('a non-strict copy whose range rejects still counts as a rejection (4.8)', () => {
      const snapshot: SnapshotV1 = structuredClone(FIXTURES['pool-tag-islanded']);
      const dom = snapshot.runtime!.sharedExternals['__GLOBAL__']['@nf-lab/ui-dom'];
      dom.versions.find((v) => v.action === 'scope')!.remotes[0].strictVersion = false;
      const [card] = vmOfSnapshot(snapshot).pools;
      expect(verdictLine(card)).toBe('✕ Own build · version conflict — mfe2 · 1 rejection');
    });

    it('a runtime load that left the scope undecided keeps the pool pending', () => {
      const snapshot: SnapshotV1 = structuredClone(FIXTURES['pool-tag-coherent']);
      snapshot.runtime!.cacheState = { version: '4.8.0', undecidedScopes: ['__GLOBAL__'] };
      const [card] = vmOfSnapshot(snapshot).pools;
      expect(card.pendingNote).toBe(
        'a runtime load changed this share scope — the next init decides it again; outcomes not settled yet',
      );
      expect(card.verdict).toBeNull();
    });
  });

  describe('pre-4.8.0 warning', () => {
    const warningOf = (version: string | null, snapshot: SnapshotV1 = FIXTURES['pooling-anchor']) =>
      buildPoolsVm(ingestSnapshot(snapshot).resolutionProjection, version).versionWarning;

    it('warns once, at the top, for an older or unexposed version', () => {
      expect(warningOf(null)).toBe(
        'No orchestrator version found (exposed from 4.7.0). Pool names and reasons may be missing.',
      );
      expect(warningOf('4.6.0')).toBe(
        "This page runs orchestrator 4.6.0, which doesn't store pool names or why a remote got its own copy — this tab may be incomplete.",
      );
      expect(warningOf('4.7.0')).toBe(
        "This page runs orchestrator 4.7.0. The reasons follow 4.8's pooling and may not explain every placement.",
      );
    });

    it('does not warn from 4.8.0 on, for an unreleased build, or when there is nothing to show', () => {
      expect(warningOf('4.8.0')).toBeNull();
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

describe('buildPoolsVm — many remotes', () => {
  it('shows up to six remote chips; beyond that five, and the rest named on hover', () => {
    const remotes = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ name: `mfe${i + 1}`, host: false }));
    expect(remoteListOf(remotes(6))).toMatchObject({ more: 0, moreNames: '' });
    expect(remoteListOf(remotes(6)).shown.length).toBe(6);
    // 50 micro frontends: five chips, "+45 more".
    const many = remoteListOf(remotes(50));
    expect(many.shown.map((r) => r.name)).toEqual(['mfe1', 'mfe2', 'mfe3', 'mfe4', 'mfe5']);
    expect(many.more).toBe(45);
    expect(many.moreNames.startsWith('mfe6, mfe7')).toBe(true);
  });

  it("pool-portfolio: a subpool's five remotes collapse into its owner, named on hover", () => {
    const animations = selectedCard('pool-portfolio', 'acme').coverage.issues.find(
      (i) => i.kind === 'missing',
    )!;
    expect(animations.subject).toBe('@nf-lab/acme-animations');
    expect(animations.remotes.shown).toEqual([
      {
        name: 'contacts',
        host: false,
        subpool: { count: 5, names: 'contacts, invoices, onboarding, orders, reports' },
      },
      { name: 'legacy', host: false },
    ]);
    // Hovering the line still lights every remote it hits.
    expect(animations.all.length).toBe(6);
  });
});

// A band click judges the pool against that band's build: what-if evidence next to where each remote runs.
describe('buildPoolsVm — judged against one build', () => {
  const lensCard = (id: FixtureId, name: string, owner: string | null) => {
    const model = ingestSnapshot(FIXTURES[id]);
    const projection = model.resolutionProjection;
    const pool = projection.tagPools.find((p) => p.name === name)!;
    return buildPoolsVm(projection, '4.8.0', { poolId: pool.id, owner }).pools.find(
      (card) => card.id === pool.id,
    )!;
  };
  const rowOf = (card: PoolCardVm, remote: string) =>
    card.bands.flatMap((b) => b.rows).find((r) => r.remote.name === remote)!;
  const lines = (card: PoolCardVm, remote: string) =>
    rowOf(card, remote).reasons.map((r) => `${r.cause}: ${r.text}`);

  it("pool-portfolio, contacts' build: who fits it, and where each actually runs", () => {
    const card = lensCard('pool-portfolio', 'acme', 'contacts');
    expect(card.lens).toBe('contacts');
    expect(verdictLine(card)).toBe(
      '◎ Build of contacts — fits 11 of 12 remotes · 1 version conflict',
    );
    expect(card.coverage).toMatchObject({
      text: 'Build of contacts ships all 5 entrypoints the remotes import',
      complete: true,
    });
    expect(issueLines(card)).toEqual([
      'legacy conflict @nf-lab/acme-core, @nf-lab/acme-router build of contacts 18.1.3 · needs ^16.0.0 (strict)',
      'legacy conflict @nf-lab/acme-animations, @nf-lab/acme-common, @nf-lab/acme-forms build of contacts 18.1.3 · needs ^16.0.0',
    ]);
    // Judged against the build first, then where it really runs.
    expect(lines(card, 'legacy')).toEqual([
      'version conflict with the build of contacts: its range ^16.0.0 rejects the served 18.1.3 of @nf-lab/acme-core, @nf-lab/acme-router (strict) and @nf-lab/acme-animations, @nf-lab/acme-common, @nf-lab/acme-forms (not strict)',
      'runs on: its own build',
    ]);
    expect(lines(card, 'cart')).toEqual([
      'fits the build of contacts: its ranges accept every version, and the build ships every entrypoint it imports',
      'runs on: the global map',
    ]);
    expect(lines(card, 'contacts')).toEqual(['runs on: its own build, which serves its subpool']);
    expect(rowOf(card, 'contacts').chip?.label).toBe('this build');
    expect(rowOf(card, 'legacy').cells.map((c) => c.state)).toEqual(Array(5).fill('rejected'));
    // Every band selects; only the selected one is active. The global map has no lens of its own.
    expect(card.bands.map((b) => [b.lensOwner, b.selectable, b.active])).toEqual([
      [null, true, false],
      ['contacts', true, true],
      ['legacy', true, false],
    ]);
  });

  it('nothing selected by default: no warning, no active band', () => {
    const card = cardOf('pool-portfolio', 'acme');
    expect(card.selected).toBe(false);
    expect(card.coverage.issues).toEqual([]);
    expect(card.bands.some((b) => b.active)).toBe(false);
  });

  it('the global map selected: its band active, the warning lists the pool issues', () => {
    const card = lensCard('pool-portfolio', 'acme', null);
    expect(card).toMatchObject({ selected: true, lens: null });
    expect(card.bands.map((b) => b.active)).toEqual([true, false, false]);
    expect(card.coverage.issues.length).toBe(4);
    expect(card.verdict?.type).toBe('Own build');
  });

  it('a lens for another pool, or an unknown owner, leaves the card on the global map', () => {
    const card = lensCard('pool-portfolio', 'acme', 'nope');
    expect(card.lens).toBeNull();
    expect(card.selected).toBe(false);
    expect(card.verdict?.type).toBe('Own build');
  });
});

// Older orchestrators (the v2 corpus is 4.6; 4.7 records carry no poolWinner) and every lens.
describe('buildPoolsVm — every fixture, every build', () => {
  it('renders each pool judged against each of its builds without throwing', () => {
    let lenses = 0;
    for (const id of Object.keys(FIXTURES) as FixtureId[]) {
      const model = ingestSnapshot(FIXTURES[id]);
      const projection = model.resolutionProjection;
      const version = model.provenance.runtimeSource?.orchestratorVersion ?? null;
      projection.tagPools.forEach((pool, index) => {
        for (const lens of projection.poolFamilies[index].lenses) {
          const card = buildPoolsVm(projection, version, {
            poolId: pool.id,
            owner: lens.owner,
          }).pools.find((c) => c.id === pool.id)!;
          expect(card.lens).toBe(lens.owner);
          expect(card.bands.flatMap((b) => b.rows).length).toBe(pool.remotes.length);
          lenses++;
        }
      });
    }
    expect(lenses).toBeGreaterThan(20);
  });
});
