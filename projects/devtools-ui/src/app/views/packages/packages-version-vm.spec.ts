/**
 * Packages detail per scope (packages-verdicts T5/T6): the versions table,
 * range check, torn banner and the version deep dive, read through
 * `buildPackagesVm` from the real captures of the Task 1 log.
 */
import { FIXTURES, NF_HOST } from 'devtools-bridge';

import { ingestSnapshot } from '../../shared/store/ingest';
import { PackageViewVm, ScopeBlockVm, TORN_DOCS_URL, buildPackagesVm } from './packages-view-model';

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
    expect(block.versions.map((v) => [v.tag, v.status, v.mapped, v.shippedBy, v.runsIn])).toEqual([
      ['2.0.0', 'shared', true, 2, 3],
      ['1.3.0', 'scoped', true, 1, 1],
      ['1.2.0', 'not mapped', false, 1, 0],
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
    expect(block.rangeCheck!.summary).toBe('mfe2, mfe1 reject 2.0.0 · no version fits every range');
    const electedColumn = block.rangeCheck!.versions.findIndex((v) => v.elected);
    const rejecting = block
      .rangeCheck!.rows.filter((row) => row.cells[electedColumn].accepts === false)
      .map((row) => row.remote.name)
      .sort();
    const notes = block.versions.flatMap((v) => v.notes).filter((n) => n.kind !== 'merged');
    expect(rejecting).toEqual(['mfe1', 'mfe2']);
    expect(notes.map((n) => n.label.split(' ')[0]).sort()).toEqual(rejecting);
    // No range check without an election, or with a single version.
    expect(scopeOf(viewOf('multi-scope', `strict|${KIT}`), 'strict').rangeCheck).toBeNull();
    expect(scopeOf(viewOf('merged-entrypoints', `__GLOBAL__|${KIT}`)).rangeCheck).toBeNull();
  });

  it('T5-AC-03 the torn banner groups by filling version and links the docs', () => {
    const block = scopeOf(viewOf('torn-many', `__GLOBAL__|${KIT}`));
    expect(block.torn).toMatchObject({
      count: 8,
      text: '8 entrypoints resolve to a different version than 1.4.0: 5 from 1.2.0 (mfe1), 3 from 1.3.0 (mfe2)',
      docsUrl: TORN_DOCS_URL,
    });
    expect(TORN_DOCS_URL).toContain('#entrypoint-coverage-and-tearing');
    expect(versionOf(block, '1.2.0').notes.map((n) => n.label)).toEqual([
      'fills 5 torn entrypoints',
    ]);
    expect(versionOf(block, '1.2.0').status).toBe('partly mapped');
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
    expect(dive.merged).not.toBeNull();
    expect(dive.builtBy.map((r) => r.name)).toEqual(['host', 'mfe1']);
    expect(
      dive.entrypoints!.groups.map((g) => [g.build?.name, g.items.map((i) => i.specifier)]),
    ).toEqual([
      ['host', [KIT]],
      ['mfe1', [`${KIT}/dialog`, `${KIT}/table`]],
    ]);
    expect(dive.files!.groups.map((g) => g.build?.name)).toEqual(['host', 'mfe1']);
    // A single build renders no headers.
    const single = versionOf(
      scopeOf(viewOf('out-of-range-nonstrict', `__GLOBAL__|${KIT}`)),
      '2.0.0',
    ).dive;
    expect(single.entrypoints!.groups.map((g) => g.build)).toEqual([null]);
    expect(single.files!.groups.map((g) => g.build)).toEqual([null]);
  });

  it('T6-AC-02 torn-many: the elected version groups its torn entrypoints by filling version', () => {
    const block = scopeOf(viewOf('torn-many', `__GLOBAL__|${KIT}`));
    const tornGroup = versionOf(block, '1.4.0').dive.entrypoints!.tornGroup!;
    expect(tornGroup.summary).toBe('8 torn entrypoints');
    expect(tornGroup.groups.map((g) => [g.tag, g.remote?.name, g.specifiers.length])).toEqual([
      ['1.2.0', 'mfe1', 5],
      ['1.3.0', 'mfe2', 3],
    ]);
    // The filling version marks each specifier it fills.
    const filler = versionOf(block, '1.3.0').dive.entrypoints!;
    expect(filler.fillsTorn).not.toBeNull();
    expect(filler.groups[0].items.filter((i) => i.torn !== null).map((i) => i.specifier)).toEqual([
      `${KIT}/charts`,
      `${KIT}/charts/legend`,
      `${KIT}/date-picker`,
    ]);
  });

  it('names who a version resolves for, out of range in red, and why nobody does', () => {
    const block = scopeOf(viewOf('out-of-range-nonstrict', `__GLOBAL__|${KIT}`));
    const elected = versionOf(block, '2.0.0').dive;
    expect(elected.runsIn.map((r) => [r.remote.name, r.outOfRange])).toEqual([
      ['host', false],
      ['mfe3', false],
      ['mfe1', true],
    ]);
    const unused = versionOf(block, '1.2.0').dive;
    expect(unused.runsIn).toEqual([]);
    expect(unused.runsInEmpty).toBe('no remote · its shipper resolves to the shared 2.0.0');
    expect(unused.entrypoints).toBeNull();
    expect(
      unused.shippedBy.map((s) => [s.remote.name, s.range, s.rangeNote, s.verdict.label]),
    ).toEqual([['mfe1', '^1.0.0', '^1.0.0 · strictVersion: false', 'out of range']]);
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
