/**
 * The orchestrator 4.9 package rule (`externals/specifier.ts` `packageOfIn`). Cases are ported from
 * the orchestrator's `specifier.spec.ts` at v4.9.0, over the canonical evidence instead of a share scope.
 */
import { describe, expect, it } from 'vitest';

import type { CanonicalRegistryEvidence } from './model';
import { npmPackageOf, packageRuleOf } from './package-rule';

// One stored copy: `dense` when its remoteEntry published the external dense.
type Stored = { remote: string; entries: string[]; dense?: boolean };

// Only the fields the rule reads; every copy sits in its own registration.
function evidenceOf(scopes: Record<string, Record<string, Stored[]>>): CanonicalRegistryEvidence {
  const evidence = {
    sharedExternals: [],
    versionRegistrations: [],
    participantDeclarations: [],
    entrypointCandidates: [],
  } as unknown as CanonicalRegistryEvidence;
  let next = 0;
  for (const [shareScope, externals] of Object.entries(scopes))
    for (const [packageName, copies] of Object.entries(externals)) {
      const versionRegistrationIds = copies.map((copy) => {
        const entrypointCandidateIds = copy.entries.map((specifier) => {
          const id = `c${next++}`;
          evidence.entrypointCandidates.push({ id, specifier } as never);
          return id;
        });
        const declarationId = `d${next++}`;
        evidence.participantDeclarations.push({
          id: declarationId,
          participant: copy.remote,
          dense: copy.dense === true,
          entrypointCandidateIds,
        } as never);
        const id = `r${next++}`;
        evidence.versionRegistrations.push({
          id,
          participantDeclarationIds: [declarationId],
        } as never);
        return id;
      });
      evidence.sharedExternals.push({ shareScope, packageName, versionRegistrationIds } as never);
    }
  return evidence;
}

const SCOPE = '__GLOBAL__';
const ruleOf = (externals: Record<string, Stored[]>) =>
  packageRuleOf(evidenceOf({ [SCOPE]: externals }))(SCOPE);

const SPECIFIERS = [
  '@s/c',
  '@s/c/t',
  '@s/c/t/sort',
  '@s/c/u',
  '@s/c/u/y',
  'rxjs',
  'rxjs/operators',
];
const packages = (externals: Record<string, Stored[]>) => {
  const packageOf = ruleOf(externals);
  return Object.fromEntries(SPECIFIERS.map((s) => [s, packageOf(s)]));
};

// What the npm-name rule gives every specifier above: the grouping of every orchestrator before 4.9.
const BY_NAME = {
  '@s/c': '@s/c',
  '@s/c/t': '@s/c',
  '@s/c/t/sort': '@s/c',
  '@s/c/u': '@s/c',
  '@s/c/u/y': '@s/c',
  rxjs: 'rxjs',
  'rxjs/operators': 'rxjs',
};

// Declaring remotes: each library a dense external of its own, deeper than its npm name.
const paths = (remote: string, ...libs: [string, string[]][]): Record<string, Stored[]> =>
  Object.fromEntries(libs.map(([pkg, entries]) => [pkg, [{ remote, entries, dense: true }]]));

describe('npmPackageOf', () => {
  it('cuts after the scope and one name', () => {
    expect(
      ['@angular/common/http', 'rxjs/operators', '@s/c', 'rxjs', '@s'].map(npmPackageOf),
    ).toEqual(['@angular/common', 'rxjs', '@s/c', 'rxjs', '@s']);
  });
});

describe('packageRuleOf', () => {
  it('is the npm-name rule when no copy is dense, as in every capture before 4.9', () => {
    const externals = {
      '@s/c/t': [{ remote: 'old', entries: ['@s/c/t'] }],
      'rxjs/operators': [{ remote: 'old', entries: ['rxjs/operators'] }],
    };
    expect(ruleOf(externals)).toBe(npmPackageOf);
    expect(packages(externals)).toEqual(BY_NAME);
  });

  it('is the npm-name rule when every dense external is an npm name', () => {
    // An older core's dense externals group exactly what the name rule groups.
    expect(
      ruleOf({
        '@s/c': [{ remote: 'old', entries: ['@s/c/t', '@s/c/u'], dense: true }],
        rxjs: [{ remote: 'old', entries: ['rxjs', 'rxjs/operators'], dense: true }],
      }),
    ).toBe(npmPackageOf);
  });

  it('serves each dense record no other record overlaps as its own package', () => {
    expect(
      packages({
        ...paths('a', ['@s/c/t', ['@s/c/t', '@s/c/t/sort']]),
        '@s/c/u': [
          { remote: 'a', entries: ['@s/c/u'], dense: true },
          { remote: 'b', entries: ['@s/c/u', '@s/c/u/y'], dense: true },
        ],
      }),
    ).toEqual({
      ...BY_NAME,
      '@s/c/t': '@s/c/t',
      '@s/c/t/sort': '@s/c/t',
      '@s/c/u': '@s/c/u',
      '@s/c/u/y': '@s/c/u',
    });
  });

  it('merges dense records that list the same specifier, named by the shortest name', () => {
    expect(
      packages({
        '@s/c/t': [
          { remote: 'a', entries: ['@s/c/t', '@s/c/t/sort'], dense: true },
          { remote: 'b', entries: ['@s/c/t'], dense: true },
        ],
        '@s/c/t/sort': [{ remote: 'b', entries: ['@s/c/t/sort'], dense: true }],
      }),
    ).toMatchObject({ '@s/c/t': '@s/c/t', '@s/c/t/sort': '@s/c/t' });
  });

  it('merges a dense record with a flat copy of any of its specifiers into the npm name', () => {
    // An older core's flat secondary: its build bundles every mapping, so it is at least the npm package.
    expect(
      packages({
        '@s/c/t': [
          { remote: 'a', entries: ['@s/c/t', '@s/c/t/sort'], dense: true },
          { remote: 'old', entries: ['@s/c/t'] },
        ],
        ...paths('a', ['@s/c/u', ['@s/c/u']]),
      }),
    ).toEqual({ ...BY_NAME, '@s/c/u': '@s/c/u' });
  });

  it('serves a record that lists only entrypoints as its own package', () => {
    const packageOf = ruleOf(paths('a', ['m/table', ['m/table/x']]));
    expect([packageOf('m/table'), packageOf('m/table/x')]).toEqual(['m/table', 'm/table']);
  });

  it('decides each share scope on its own copies', () => {
    const rule = packageRuleOf(
      evidenceOf({
        [SCOPE]: paths('a', ['@s/c/t', ['@s/c/t']]),
        strict: { '@s/c/t': [{ remote: 'b', entries: ['@s/c/t'] }] },
      }),
    );
    expect([rule(SCOPE)('@s/c/t'), rule('strict')('@s/c/t')]).toEqual(['@s/c/t', '@s/c']);
  });
});
