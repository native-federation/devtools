// `satisfiesRange` delegates to npm `semver`, as the orchestrator does; these
// cases pin the null contract and the ranges the Pools tab actually meets.
import { describe, expect, it } from 'vitest';

import { satisfiesRange } from './semver-range';

describe('satisfiesRange', () => {
  it.each([
    ['1.4.0', '^1.2.3', true],
    ['2.0.0', '^1.0.0', false],
    ['1.5.0', '^1.4.0', true],
    ['0.3.0', '^0.2.3', false],
    ['1.3.0', '~1.2.3', false],
    ['2.0.0', '>=1.0.0', true],
    ['3.1.0', '^1.0.0 || ^3.0.0', true],
    ['2.3.5', '1.2.3 - 2.3.4', false],
    // Default options, as in the orchestrator: a prerelease only matches a range naming its own triple.
    ['2.0.0-rc.1', '^1.0.0 || ^2.0.0', false],
    ['2.0.0-rc.2', '^2.0.0-rc.1', true],
  ])('%s against %s is %s', (version, range, expected) => {
    expect(satisfiesRange(version, range)).toBe(expected);
  });

  it.each([
    ['2.0.0', 'latest'],
    ['2.0.0', 'workspace:*'],
    ['not-a-version', '^1.0.0'],
  ])('declines %s against %s instead of answering false', (version, range) => {
    expect(satisfiesRange(version, range)).toBeNull();
  });
});
