/**
 * Detail half of the Packages vm builder — the per-scope bindings shown under
 * a scope block: the honest no-copies line, declarations whose claims resolve
 * nowhere (the `unresolved` bucket), and residual divergences (unknown tags,
 * offers without a consumer row, claims resolving to other packages' copies)
 * in the muted diagnostics footer.
 *
 * Claim doctrine (T7, unchanged): every annotation keeps its grounded reason.
 * Nothing here implies requests, downloads, or execution.
 */
import type {
  DeclarationResolutionClaim,
  ParticipantDeclaration,
  VersionRegistration,
} from '../../shared/store/resolution';
import { PoolChipVm, poolChipOf } from '../../shared/pool-chip';
import {
  CanonicalIndexes,
  PackageGroup,
  STRICT_SCOPE,
  isHostRemote,
  noCopyNoteOf,
  parentOf,
  type SamePackage,
  participantDisplay,
  targetFileName,
} from './packages-vm-shared';

/** One annotated fact — deviation chip, bucket state, or diagnostics line. */
export interface AnnotationVm {
  label: string;
  /** Grounded reason (tooltip); every annotation carries one. */
  note: string;
}

/** What the consumer declares, display-ready (strict scope pins the tag). */
export interface DeclaredVm {
  text: string;
  /** True in the strict share scope — the exact tag, never a range. */
  pinned: boolean;
}

/** One declaration claim that resolves nowhere — the `unresolved` bucket. */
export interface UnresolvedRowVm {
  /** Canonical claim ID, or the declaration ID for claim-less declarations. */
  key: string;
  name: string;
  host: boolean;
  declared: DeclaredVm;
  strict: boolean;
  /** Claimed specifier when it is not the package name itself; null otherwise. */
  specifier: string | null;
  state: AnnotationVm;
  /** Tag of the consumer's own registration — offered, never resolved. */
  offered: AnnotationVm | null;
  /** `select` payload for the /remotes cross-link. */
  remoteSelect: string;
  /** The declaration's explicit pool tag; null when untagged or private. */
  pool: PoolChipVm | null;
}

export interface PackageDetailVm {
  packageId: string;
  packageName: string;
  scope: string;
  parent: { packageName: string; packageId: string; rule: 'name-derived' } | null;
  /** Honest zero-copy line; null while copies exist. */
  noCopies: AnnotationVm | null;
  unresolved: UnresolvedRowVm[];
  /** Muted divergence footer; empty renders nothing. */
  diagnostics: AnnotationVm[];
}

/** Kit declared-version — strict-scope rows render the exact tag, never a range. */
function declaredOf(
  declaration: ParticipantDeclaration,
  registration: VersionRegistration,
  scope: string,
): DeclaredVm {
  return scope === STRICT_SCOPE
    ? { text: registration.tag, pinned: true }
    : { text: declaration.requiredVersion, pinned: false };
}

/** Bucket state of one claim that resolves nowhere (grounded, honest). */
function unresolvedStateOf(
  claim: DeclarationResolutionClaim,
  indexes: CanonicalIndexes,
): AnnotationVm {
  const resolution = indexes.resolutionById.get(claim.effectiveResolutionId);
  if (resolution?.status === 'unmapped') {
    return {
      label: 'not mapped',
      note: 'no applicable import-map binding for this specifier in this capture',
    };
  }
  if (resolution?.status === 'blocked') {
    return {
      label: 'blocked',
      note: `the matching import-map entry terminally blocks this binding (${resolution.blockedReason})`,
    };
  }
  if (resolution?.status === 'unknown') {
    return {
      label: 'unknown',
      note: `required evidence missing: ${resolution.unknownReasons.join(', ')}`,
    };
  }
  return {
    label: 'unknown',
    note: 'mapping state not derivable from the captured evidence',
  };
}

/**
 * Offered tag of one unresolved entry. The note is scoped to THAT entry —
 * the same registration's tag can legitimately resolve through another
 * claim (multi-entrypoint declarations), so it never claims capture-wide
 * absence.
 */
function offeredOf(registration: VersionRegistration, note: string): AnnotationVm {
  return { label: `offered ${registration.tag}`, note };
}

interface GroupedClaims {
  registration: VersionRegistration;
  declaration: ParticipantDeclaration;
  claims: DeclarationResolutionClaim[];
}

export function buildDetail(
  groups: PackageGroup[],
  indexes: CanonicalIndexes,
  selectedId: string | null,
  samePackage: SamePackage,
): PackageDetailVm | null {
  const group = selectedId === null ? null : (groups.find((g) => g.id === selectedId) ?? null);
  if (group === null) {
    return null;
  }
  const byId = new Map(groups.map((g) => [g.id, g]));
  const parent = parentOf(group, byId, samePackage);

  // Every (registration, declaration) with its claims, registry order — the
  // one spine the bucket and the diagnostics read from.
  const rows: GroupedClaims[] = group.registrations.flatMap(({ registration, declarations }) =>
    declarations.map((declaration) => ({
      registration,
      declaration,
      claims: indexes.claimsByDeclaration.get(declaration.id) ?? [],
    })),
  );
  const groupCopyIds = new Set(group.copies.map((copy) => copy.id));

  const unresolved: UnresolvedRowVm[] = [];
  const diagnostics: AnnotationVm[] = [];
  for (const { registration, declaration, claims } of rows) {
    const base = {
      name: participantDisplay(declaration.participant),
      host: isHostRemote(declaration.participant),
      declared: declaredOf(declaration, registration, group.scope),
      strict: declaration.strictVersion,
      remoteSelect: declaration.participant,
      pool: poolChipOf(declaration, indexes.projection),
    };
    if (claims.length === 0) {
      unresolved.push({
        ...base,
        key: declaration.id,
        specifier: null,
        state: {
          label: 'declared',
          note: 'declaration without entrypoint candidates — no resolution claim derivable',
        },
        offered: offeredOf(
          registration,
          'the tag of the consumer’s own version registration — no resolution claim is derivable for this declaration',
        ),
      });
      continue;
    }
    for (const claim of claims) {
      if (claim.copyId === null) {
        unresolved.push({
          ...base,
          key: claim.id,
          specifier: claim.specifier === group.packageName ? null : claim.specifier,
          state: unresolvedStateOf(claim, indexes),
          offered: offeredOf(
            registration,
            'the tag of the consumer’s own version registration — this claim’s binding does not resolve in this capture',
          ),
        });
      } else if (!groupCopyIds.has(claim.copyId)) {
        // Mapped, but to another package's copy — a divergence, not an
        // unresolved claim: the footer says so instead of the bucket lying.
        const copy = indexes.copyById.get(claim.copyId);
        const resolution = indexes.resolutionById.get(claim.effectiveResolutionId);
        const target =
          resolution?.status === 'mapped' ? targetFileName(resolution.targetUrl) : 'a target';
        diagnostics.push({
          label: `${base.name} resolves ${claim.specifier} to a copy of another package`,
          note: `the claim's mapped binding materializes ${target} attributed to ${
            copy?.sourcePackage ?? 'no evidenced source package'
          } — no copy of this package is involved`,
        });
      }
    }
  }

  if (group.unknownTagCopyCount > 0) {
    diagnostics.push({
      label: `unknown tags: ${group.unknownTagCopyCount}`,
      note: `${group.unknownTagCopyCount} ${
        group.unknownTagCopyCount === 1 ? 'copy' : 'copies'
      } without a uniquely evidenced source tag`,
    });
  }
  for (const { registration, declarations } of group.registrations) {
    if (declarations.length === 0) {
      diagnostics.push({
        label: `offered ${registration.tag} — no participant declarations recorded`,
        note: 'this version registration lists no participants; nothing can consume it in this capture',
      });
    }
  }

  return {
    packageId: group.id,
    packageName: group.packageName,
    scope: group.scope,
    parent:
      parent === null
        ? null
        : {
            packageName: parent.packageName,
            packageId: parent.id,
            rule: 'name-derived',
          },
    noCopies:
      group.copies.length === 0 && rows.length > 0
        ? { label: 'no resolved copies in this capture', note: noCopyNoteOf(group, indexes) }
        : null,
    unresolved,
    diagnostics,
  };
}
