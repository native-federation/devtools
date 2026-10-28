import type { CanonicalRegistryEvidence } from './model';

export type PackageOf = (specifier: string) => string;

// An npm name carries at most one `/` after an optional `@scope`: `@angular/common/http` → `@angular/common`.
export function npmPackageOf(name: string): string {
  const depth = name.startsWith('@') ? 2 : 1;
  let cut = -1;
  for (let seen = 0; seen < depth; seen++) {
    cut = name.indexOf('/', cut + 1);
    if (cut === -1) return name;
  }
  return name.slice(0, cut);
}

/**
 * The orchestrator's package rule per share scope (4.9 `externals/specifier.ts` `packageOfIn`): a copy
 * stored `dense` whose record is deeper than its npm name declares a package of its own; records that
 * share a name or a specifier merge, named by the shortest name. Without such a copy, which is every
 * capture before 4.9, it is the npm name.
 */
export function packageRuleOf(
  evidence: CanonicalRegistryEvidence,
): (shareScope: string) => PackageOf {
  const registrationById = new Map(evidence.versionRegistrations.map((r) => [r.id, r]));
  const declarationById = new Map(evidence.participantDeclarations.map((d) => [d.id, d]));
  const candidateById = new Map(evidence.entrypointCandidates.map((c) => [c.id, c]));
  const rules = new Map<string, PackageOf>();

  const ruleOf = (shareScope: string): PackageOf => {
    const copies = evidence.sharedExternals
      .filter((external) => external.shareScope === shareScope)
      .flatMap((external) =>
        external.versionRegistrationIds.flatMap((id) =>
          registrationById.get(id)!.participantDeclarationIds.map((d) => ({
            name: external.packageName,
            declaration: declarationById.get(d)!,
          })),
        ),
      );
    if (!copies.some(({ name, declaration }) => declaration.dense && npmPackageOf(name) !== name))
      return npmPackageOf;

    const components = new UnionFind();
    const shortest = new Map<string, string>();
    for (const { name, declaration } of copies) {
      const anchor = declaration.dense ? name : npmPackageOf(name);
      for (const id of declaration.entrypointCandidateIds) {
        const specifier = candidateById.get(id)!.specifier;
        const best = shorter(
          shortest.get(components.find(anchor)) ?? anchor,
          shortest.get(components.find(specifier)) ?? specifier,
        );
        components.union(anchor, specifier);
        shortest.set(components.find(anchor), best);
      }
    }
    // An unlisted specifier joins whatever its npm name joined.
    return (specifier) => {
      const npm = npmPackageOf(specifier);
      return shortest.get(components.find(specifier)) ?? shortest.get(components.find(npm)) ?? npm;
    };
  };

  return (shareScope) => {
    let rule = rules.get(shareScope);
    if (rule === undefined) rules.set(shareScope, (rule = ruleOf(shareScope)));
    return rule;
  };
}

function shorter(a: string, b: string): string {
  return b.length < a.length || (b.length === a.length && b < a) ? b : a;
}

export class UnionFind {
  private readonly parent = new Map<string, string>();

  add(key: string): void {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    this.add(key);
    let root = key;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    this.parent.set(key, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}
