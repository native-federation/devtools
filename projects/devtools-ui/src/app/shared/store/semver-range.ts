import satisfies from 'semver/functions/satisfies';
import valid from 'semver/functions/valid';
import validRange from 'semver/ranges/valid';

// The orchestrator's own check (`version.check.ts` `isCompatible`: `satisfies` with default options).
// Null where `satisfies` would answer false only because it cannot read the version or the range.
export function satisfiesRange(version: string, range: string): boolean | null {
  if (valid(version) === null || validRange(range) === null) return null;
  return satisfies(version, range);
}
