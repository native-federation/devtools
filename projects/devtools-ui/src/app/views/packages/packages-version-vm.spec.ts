/**
 * Packages detail per scope (packages-verdicts T5/T6): the versions table,
 * range check and the version deep dive, read through
 * `buildPackagesVm` from the real captures of the Task 1 log.
 */
import { FIXTURES, NF_HOST } from 'devtools-bridge';

import { ingestSnapshot } from '../../shared/store/ingest';
import { PackageViewVm, ScopeBlockVm, buildPackagesVm } from './packages-view-model';

const KIT = '@nf-lab/kit';

function viewOf(fixture: keyof typeof FIXTURES, select: string): PackageViewVm {
  return buildPackagesVm(ingestSnapshot(FIXTURES[fixture]), {
    filter: 'all',
    selectedParticipant: null,
    selectedId: select,
  }).packageView!;
}
const scopeOf = (view: PackageViewVm, scope = '__GLOBAL__'): ScopeBlockVm =>
  view.scopes.find((s) => s.scope === scope)!;
const versionOf = (block: ScopeBlockVm, tag: string) => block.versions.find((v) => v.tag === tag)!;

describe('package view — versions table (T5)', () => {
  it('T5-AC-01 out-of-range-nonstrict: elected first, notes only on deviating versions', () => {
    const block = scopeOf(viewOf('out-of-range-nonstrict', `__GLOBAL__|${KIT}`));
    expect(block.elected).toEqual({
      tag: '2.0.0',
      remote: { name: 'host', host: true, select: NF_HOST },
    });
    expect(
      block.versions.map((v) => [v.tag, v.status.label, v.mapped, v.shippedBy, v.usedBy]),
    ).toEqual([
      ['2.0.0', 'shared', true, 2, 3],
      ['1.3.0', 'scoped', true, 1, 1],
      ['1.2.0', 'skipped', false, 1, 0],
    ]);
    expect(block.versions.map((v) => v.notes.map((n) => n.label))).toEqual([
      [],
      ['mfe2 own copy'],
      ['mfe1 out of range'],
    ]);
    // No remote ships two rows: shippers partition the declarations.
    const shippers = block.versions.flatMap((v) => v.dive.shippedBy.map((s) => s.remote.select));
    expect(new Set(shippers).size).toBe(shippers.length);
  });

  it('T5-AC-02 the range check agrees with the published verdicts', () => {
    const block = scopeOf(viewOf('out-of-range-nonstrict', `__GLOBAL__|${KIT}`));
    const electedColumn = block.rangeCheck!.versions.findIndex((v) => v.elected);
    const rejecting = block
      .rangeCheck!.rows.filter((row) => row.cells[electedColumn].accepts === false)
      .map((row) => row.remote.name)
      .sort();
    const notes = block.versions.flatMap((v) => v.notes).filter((n) => n.kind !== 'merged');
    expect(rejecting).toEqual(['mfe1', 'mfe2']);
    expect(notes.map((n) => n.label.split(' ')[0]).sort()).toEqual(rejecting);
    // Always shown: also without an election (no column marked elected) and with one version.
    const strict = scopeOf(viewOf('multi-scope', `strict|${KIT}`), 'strict').rangeCheck!;
    expect(strict.versions.some((v) => v.elected)).toBe(false);
    expect(strict.rows.length).toBeGreaterThan(0);
    const single = scopeOf(viewOf('merged-entrypoints', `__GLOBAL__|${KIT}`)).rangeCheck!;
    expect(single.versions).toEqual([{ tag: '1.2.0', elected: true }]);
  });

  it('T5-AC-04 every declaration renders as a shipper, and the bindings keep the rest', () => {
    for (const fixture of [
      'frankenstein-live',
      'pool-portfolio',
      'strict-split',
      'synthetic-multi-version',
    ] as const) {
      const model = ingestSnapshot(FIXTURES[fixture]);
      for (const external of model.registryEvidence.sharedExternals) {
        const view = buildPackagesVm(model, {
          filter: 'all',
          selectedParticipant: null,
          selectedId: `${external.shareScope}|${external.packageName}`,
        }).packageView!;
        const block = scopeOf(view, external.shareScope);
        const shipped = block.versions.reduce((n, v) => n + v.dive.shippedBy.length, 0);
        const declared = external.versionRegistrationIds
          .map((id) => model.registryEvidence.versionRegistrations.find((r) => r.id === id)!)
          .reduce((n, r) => n + r.participantDeclarationIds.length, 0);
        expect(shipped, `${fixture} ${external.packageName}`).toBe(declared);
        expect(block.bindings).not.toBeNull();
      }
    }
  });

  it('marks the link scope as focused and heads each scope with its election', () => {
    const view = viewOf('multi-scope', `team-a|${KIT}`);
    expect(view.scopeCount).toBe(3);
    expect(view.scopes.map((s) => [s.label, s.focused, s.elected?.tag ?? s.electionNote])).toEqual([
      ['global', false, '1.4.0'],
      ['team-a', true, '1.3.0'],
      ['strict', false, 'every exact version shared'],
    ]);
  });
});

describe('package view — version deep dive (T6)', () => {
  it('T6-AC-01 merged-entrypoints: entrypoints and files grouped by build', () => {
    const dive = versionOf(
      scopeOf(viewOf('merged-entrypoints', `__GLOBAL__|${KIT}`)),
      '1.2.0',
    ).dive;
    // mfe1's copy is scoped, not a second `share` build, so 4.8's 1.2.0 is not merged.
    expect(dive.merged).toBeNull();
    expect(dive.servedFrom.map((r) => r.name)).toEqual(['mfe1', 'host']);
    expect(
      dive.entrypoints!.groups.map((g) => [g.build?.name, g.items.map((i) => i.specifier)]),
    ).toEqual([
      ['mfe1', [KIT, `${KIT}/dialog`, `${KIT}/table`]],
      ['host', [KIT]],
    ]);
    expect(dive.files!.groups.map((g) => g.build?.name)).toEqual(['mfe1', 'host']);
    // A single build renders no headers.
    const single = versionOf(
      scopeOf(viewOf('out-of-range-nonstrict', `__GLOBAL__|${KIT}`)),
      '2.0.0',
    ).dive;
    expect(single.entrypoints!.groups.map((g) => g.build)).toEqual([null]);
    expect(single.files!.groups.map((g) => g.build)).toEqual([null]);
  });

  it('names who a version resolves for, out of range in red, and why nobody does', () => {
    const block = scopeOf(viewOf('out-of-range-nonstrict', `__GLOBAL__|${KIT}`));
    const elected = versionOf(block, '2.0.0').dive;
    expect(elected.usedBy.map((r) => [r.remote.name, r.outOfRange])).toEqual([
      ['host', false],
      ['mfe3', false],
      ['mfe1', true],
    ]);
    const unused = versionOf(block, '1.2.0').dive;
    expect(unused.usedBy).toEqual([]);
    expect(unused.usedByEmpty).toBe('no remote · its shipper resolves to the shared 2.0.0');
    expect(unused.entrypoints).toBeNull();
    expect(unused.shippedBy.map((s) => [s.remote.name, s.verdict.label])).toEqual([
      ['mfe1', 'out of range'],
    ]);
    expect(unused.shippedBy[0].tip.split('\n').slice(0, 2)).toEqual([
      'mfe1 · out of range',
      'range: ^1.0.0 (not strict)',
    ]);
  });

  it('states SRI per build and keeps chunk files apart from it', () => {
    const live = ingestSnapshot(FIXTURES['frankenstein-live']);
    const external = live.registryEvidence.sharedExternals.find(
      (e) => e.packageName === '@angular/core',
    )!;
    const view = buildPackagesVm(live, {
      filter: 'all',
      selectedParticipant: null,
      selectedId: `${external.shareScope}|${external.packageName}`,
    }).packageView!;
    const files = scopeOf(view, external.shareScope).versions.find((v) => v.mapped)!.dive.files!;
    expect(files.sri.label).toMatch(/^(SRI ✓|SRI \d+\/\d+|no SRI)$/);
    expect(files.sri.complete).toBe(files.sri.label === 'SRI ✓');
  });
});

describe('package view — placement reasons (pools-v48 T6)', () => {
  it('T6-AC-01 fallback-uncovered: the own-copy note names the missing secondaries', () => {
    const block = scopeOf(viewOf('fallback-uncovered', `__GLOBAL__|${KIT}`));
    expect(versionOf(block, '1.3.0').notes).toContainEqual({
      kind: 'own-copy',
      label: 'mfe2 own copy',
      note: `mfe2: not covered: the serving build of host lacks ${KIT}/charts, ${KIT}/charts/legend, ${KIT}/date-picker · runs its own 1.3.0 from its own build`,
    });
  });

  it("the shipper's tooltip says why, and the entrypoints the serving build lacks are marked", () => {
    const dive = versionOf(
      scopeOf(viewOf('fallback-uncovered', `__GLOBAL__|${KIT}`)),
      '1.3.0',
    ).dive;
    // Heads with the shipper, then its range, then one clause of the reason per line.
    expect(dive.shippedBy.map((s) => [s.remote.name, s.pooled, s.tip])).toEqual([
      [
        'mfe2',
        false,
        `mfe2 · own copy\nrange: ^1.0.0 (strict)\nnot covered: the serving build of host lacks ${KIT}/charts, ${KIT}/charts/legend, ${KIT}/date-picker\nruns its own 1.3.0 from its own build`,
      ],
    ]);
    expect(dive.entrypoints!.groups[0].items).toEqual([
      { specifier: KIT, missing: null },
      { specifier: `${KIT}/charts`, missing: "not in host's build" },
      { specifier: `${KIT}/charts/legend`, missing: "not in host's build" },
      { specifier: `${KIT}/date-picker`, missing: "not in host's build" },
    ]);
  });

  it('T6-AC-02 a pooled own copy never reads as a strict rejection', () => {
    const block = scopeOf(viewOf('pool-uncovered-gap', '__GLOBAL__|@nf-lab/ui-core'));
    const [note] = versionOf(block, '1.0.0').notes.filter((n) => n.kind === 'own-copy');
    expect(note.note).toBe(
      'mfe1: not covered: the global map lacks @nf-lab/ui-core/testing · runs its whole pool from its own build',
    );
    expect(note.note).not.toContain('strict');
  });

  it('names the subpool a member runs in', () => {
    const block = scopeOf(viewOf('pool-showcase', '__GLOBAL__|@nf-lab/ui-core'));
    expect(versionOf(block, '1.0.0').notes.find((n) => n.kind === 'subpool')).toMatchObject({
      label: 'admin, catalog, checkout subpool',
    });
  });
});
