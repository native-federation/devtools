/**
 * Shared internals of the Packages vm builder — the canonical (share scope,
 * package) group shape and the ID-keyed store-façade indexes used by the row
 * half (`packages-row-vm.ts`) and the detail half (`packages-detail-vm.ts`).
 * Views import from the `packages-view-model.ts` facade only.
 *
 * Everything here joins the canonical read surface —
 * `model.resolutionProjection`, `model.effectiveConsumerResolutions`, and
 * `model.registryEvidence` — by ID only. Nothing re-derives resolver,
 * action, or copy semantics; the builders group and label precomputed
 * knowledge (T7).
 *
 * The cross-view vocabulary (scope constants, select ids, sentinel
 * display) lives in `shared/view-conventions.ts` since T11, joined by the
 * canonical-façade join helpers (indexes, copy-source attribution, target
 * file display) lifted there with their second consumer (T8 Remotes); the
 * re-exports keep this module's import sites stable.
 */
import type {
  DeclarationResolutionClaim,
  ParticipantDeclaration,
  ResolvedDependencyCopy,
  SharedExternalId,
  VersionRegistration,
} from '../../shared/store/resolution';

export {
  GLOBAL_SCOPE,
  STRICT_SCOPE,
  buildCanonicalIndexes,
  copySourceRemote,
  isHostRemote,
  packageId,
  participantDisplay,
  targetFileName,
  type CanonicalIndexes,
} from '../../shared/view-conventions';
import {
  CanonicalIndexes,
  STRICT_SCOPE,
  copySourceRemote,
  packageId,
} from '../../shared/view-conventions';

/** One version registration of the group with its declarations, registry order. */
export interface RegistrationGroup {
  registration: VersionRegistration;
  declarations: ParticipantDeclaration[];
}

/**
 * The canonical (share scope, package) group every Packages half consumes.
 * Groups exist per shared-external record only — an empty share scope
 * manufactures no packages, and private registrations stay with Remotes.
 */
export interface PackageGroup {
  id: string;
  scope: string;
  packageName: string;
  registrations: RegistrationGroup[];
  /**
   * Source-first attributed copies (same attribution rule as
   * `packageMeasures`): a source-identified copy joins its source's
   * external; a copy without a unique source joins each consumer registry
   * package of its share-scope contexts.
   */
  copies: ResolvedDependencyCopy[];
  /** Distinct non-null resolved tags across the group's copies, copy order. */
  resolvedTags: string[];
  /** Copies of the group without a uniquely evidenced source tag. */
  unknownTagCopyCount: number;
  /**
   * More than one distinct version RESOLVES in this share scope. Copy
   * multiplicity with one resolved tag never sets it, and the strict scope
   * shares side by side by design and never flags.
   */
  multiVersion: boolean;
}

/**
 * The declaration's claim for the group's own package specifier, else its
 * first claim (secondary-entrypoint declarations claim subpath specifiers).
 */
export function mainClaimOf(
  declaration: ParticipantDeclaration,
  packageName: string,
  indexes: CanonicalIndexes,
): DeclarationResolutionClaim | null {
  const claims = indexes.claimsByDeclaration.get(declaration.id) ?? [];
  return claims.find((claim) => claim.specifier === packageName) ?? claims[0] ?? null;
}

/**
 * Base package the group's name extends (`name-derived`): the SHORTEST
 * same-scope prefix that exists as a group. The shortest existing prefix has
 * no existing prefix itself, so every linked subpath — however deep — hangs
 * directly under a base row and the flat two-level list loses no package.
 */
export function parentOf(
  group: PackageGroup,
  byId: ReadonlyMap<string, PackageGroup>,
): PackageGroup | null {
  let index = group.packageName.indexOf('/');
  while (index > 0 && index < group.packageName.length - 1) {
    const candidate = byId.get(packageId(group.scope, group.packageName.slice(0, index)));
    if (candidate !== undefined && candidate !== group) {
      return candidate;
    }
    index = group.packageName.indexOf('/', index + 1);
  }
  return null;
}

/** Whether any declaration claim of the group resolves to a canonical copy. */
export function groupHasMappedClaim(group: PackageGroup, indexes: CanonicalIndexes): boolean {
  return group.registrations.some(({ declarations }) =>
    declarations.some((declaration) =>
      (indexes.claimsByDeclaration.get(declaration.id) ?? []).some(
        (claim) => claim.copyId !== null,
      ),
    ),
  );
}

/**
 * Honest wording for a group without any attributed copy: only when no claim
 * maps at all is the import map the reason — bindings can legitimately
 * resolve to copies attributed to OTHER packages (cross-external anchor,
 * converging specifiers), and that must not read as a missing binding.
 */
export function noCopyNoteOf(group: PackageGroup, indexes: CanonicalIndexes): string {
  return groupHasMappedClaim(group, indexes)
    ? 'no source copy is attributed to this package — its bindings resolve to copies of other packages'
    : 'declared, but no import-map binding resolves this package in this capture';
}

/**
 * Participants involved in one group — its declarers, the evidenced sources
 * of its copies, and every consumer whose binding resolves to one of them.
 * This is the participant-filter membership rule (T7.5): raw names, the
 * host sentinel included verbatim.
 */
export function involvedParticipantsOf(
  group: PackageGroup,
  indexes: CanonicalIndexes,
): Set<string> {
  const names = new Set<string>();
  for (const { declarations } of group.registrations) {
    for (const declaration of declarations) {
      names.add(declaration.participant);
    }
  }
  for (const copy of group.copies) {
    const source = copySourceRemote(copy);
    if (source !== null) {
      names.add(source);
    }
    for (const relation of indexes.relationsByCopy.get(copy.id) ?? []) {
      names.add(relation.consumerRemote);
    }
  }
  return names;
}

/** Whether the group flags resolved-version multiplicity (never in `strict`). */
export function multiVersionOf(scope: string, resolvedTags: string[]): boolean {
  return scope !== STRICT_SCOPE && resolvedTags.length > 1;
}

/**
 * Groups a copy to its Packages rows, source-first (the `packageMeasures`
 * attribution rule): a shared-declaration source joins its external's
 * (scope, package); private-registration sources stay out of the shared
 * list; a copy without a unique source joins each consumer registry package
 * of its share-scope resolution contexts.
 */
export function copyGroupIds(
  copy: ResolvedDependencyCopy,
  indexes: CanonicalIndexes,
  knownGroupIds: ReadonlySet<string>,
  groupIdBySharedExternal: ReadonlyMap<SharedExternalId, string>,
): string[] {
  if (copy.source.kind === 'shared-declaration') {
    const declaration = indexes.declarationById.get(copy.source.declarationId);
    const registration =
      declaration === undefined
        ? undefined
        : indexes.registrationById.get(declaration.versionRegistrationId);
    const groupId =
      registration === undefined
        ? undefined
        : groupIdBySharedExternal.get(registration.sharedExternalId);
    return groupId === undefined ? [] : [groupId];
  }
  if (copy.source.kind === 'private-registration') {
    return [];
  }
  const ids = new Set<string>();
  for (const context of copy.resolutionContexts) {
    if (context.resolutionDomain.kind !== 'share-scope') {
      continue;
    }
    const id = packageId(context.resolutionDomain.name, context.consumerRegistryPackage);
    if (knownGroupIds.has(id)) {
      ids.add(id);
    }
  }
  return [...ids];
}
