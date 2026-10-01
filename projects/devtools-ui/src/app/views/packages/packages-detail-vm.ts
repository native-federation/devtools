/**
 * Detail half of the Packages vm builder — one block per resolved copy
 * (T7.5): block header with resolved tag, disposition, and qualified source;
 * mapped file lines with per-entrypoint SRI; consumer rows carrying only
 * deviation annotations; the copy's bundle-claim chunks nested inside the
 * block. Declarations whose claims resolve nowhere render under the
 * `unresolved` bucket; residual divergences (unknown tags, offers without a
 * consumer row, claims resolving to other packages' copies) surface in the
 * muted diagnostics footer.
 *
 * Claim doctrine (T7, unchanged): every declaration stays visible with its
 * canonical mapping state; deviation-first presentation means the happy path
 * renders almost nothing — default qualifiers (exact target source,
 * share-registration, ordinary-shared) live in tooltips only, and every
 * annotation keeps its grounded reason. Nothing here implies requests,
 * downloads, or execution.
 */
import type {
  DeclarationResolutionClaim,
  ParticipantDeclaration,
  ResolvedCopyEffectiveRole,
  ResolvedCopySourceDisposition,
  ResolvedDependencyCopy,
  VersionRegistration,
} from '../../shared/store/resolution';
import { PoolChipVm, poolChipOf } from '../../shared/pool-chip';
import { ChunkClaimVm, buildCopyChunkClaims } from './packages-chunk-vm';
import {
  CanonicalIndexes,
  CopySourceVm,
  GLOBAL_SCOPE,
  PackageGroup,
  STRICT_SCOPE,
  copySourceVmOf,
  isHostRemote,
  noCopyNoteOf,
  parentOf,
  participantDisplay,
  targetFileName,
} from './packages-vm-shared';

export type { CopySourceVm } from './packages-vm-shared';

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

/** One consumer whose binding resolves to the block's copy. */
export interface ConsumerRowVm {
  /** Canonical declaration ID (render tracking key — names can repeat). */
  declarationId: string;
  name: string;
  host: boolean;
  declared: DeclaredVm;
  strict: boolean;
  /** Deviation annotations only; the happy path renders none. */
  deviations: AnnotationVm[];
  /**
   * Specifiers of this row's claims when none of them names the package
   * itself (secondary-entrypoint-only resolution); empty otherwise.
   */
  viaSpecifiers: string[];
  /** `select` payload for the /remotes cross-link. */
  remoteSelect: string;
  /** The declaration's explicit pool tag; null when untagged or private. */
  pool: PoolChipVm | null;
}

/** One mapped entrypoint file line of a copy block. */
export interface CopyFileVm {
  specifier: string;
  /** True when the specifier is not the package name itself. */
  showSpecifier: boolean;
  /** Display file name of the target (last URL segment). */
  file: string;
  targetUrl: string;
  hasIntegrity: boolean;
  /** `select` payload for the /import-map cross-link. */
  importMapSelect: string;
}

/** Header disposition of a copy block (`shared`/`isolated`, else verbatim). */
export interface CopyDispositionVm {
  label: string;
  /**
   * Audience wording of an isolated copy — "mapped only for X" while every
   * consumer is an own declarer; the "only" drops as soon as external
   * consumers (e.g. anchored ones) resolve to the copy too.
   */
  audience: AnnotationVm | null;
  /** Grounded disposition note plus the notes of the folded default roles. */
  note: string;
}

/** One resolved copy of the package with its consumers and chunks (T7.5). */
export interface CopyBlockVm {
  /** Canonical copy ID (render tracking key). */
  copyId: string;
  /** Tag of the uniquely matched source registration; null stays honest. */
  resolvedTag: string | null;
  /** Why the tag is unknown; null while `resolvedTag` exists. */
  unknownTagNote: string | null;
  source: CopySourceVm;
  disposition: CopyDispositionVm;
  /** Copy-level deviations no other element renders (e.g. unclassified). */
  deviations: AnnotationVm[];
  files: CopyFileVm[];
  consumers: ConsumerRowVm[];
  /** The copy's canonical bundle claims; empty renders nothing. */
  chunks: ChunkClaimVm[];
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
  /** Display form of the scope — the `__GLOBAL__` sentinel reads as 'global'. */
  scopeDisplay: string;
  scopeLabel: string | null;
  strictScope: boolean;
  parent: { packageName: string; packageId: string; rule: 'name-derived' } | null;
  /** Resolved-tag multiplicity header; null without a conflict. */
  conflict: AnnotationVm | null;
  /** Honest zero-copy line; null while blocks exist. */
  noCopies: AnnotationVm | null;
  blocks: CopyBlockVm[];
  unresolved: UnresolvedRowVm[];
  /** Muted divergence footer; empty renders nothing. */
  diagnostics: AnnotationVm[];
}

const DISPOSITION_NOTES: Record<ResolvedCopySourceDisposition, string> = {
  'share-registration': 'the evidenced source is registered with action share',
  'scope-registration': 'the evidenced source is registered with action scope — an isolated copy',
  'skip-registration':
    'the evidenced source is registered with action skip — its copy still serves the binding',
  'private-registration': 'the evidenced source is a private (scoped) registration',
  'target-only': 'only the resolved target URL is evidenced — no source record matches',
  'ambiguous-source': 'several candidate sources match this target — none is chosen',
  'unknown-registration': 'the source registration carries an unrecognized action',
};

const ROLE_NOTES: Record<ResolvedCopyEffectiveRole, string> = {
  'ordinary-shared': 'the selected shared copy of its share scope',
  'isolated-own': 'mapped only for its own declarers',
  'self-filled-source': 'fills its consumer’s binding without an applicable shared source',
  'anchor-source': 'selected through an explicit servedBy anchor',
  'private-own': 'a private registration’s own mapping',
  unclassified: 'no closed rule explains this copy',
};

const UNKNOWN_TAG_NOTE = 'no uniquely evidenced source tag for this copy';

/**
 * Header disposition: `share-registration` reads as `shared`,
 * `scope-registration` as `isolated` with its declarer audience; every other
 * disposition stays a verbatim, visibly qualified deviation. Default roles
 * fold into the note — they are rendered by other elements (`shared`/
 * `isolated` themselves, the explicit-anchor qualifier, the consumers'
 * self-filled chips) and must not render twice.
 */
function dispositionVmOf(
  copy: ResolvedDependencyCopy,
  group: PackageGroup,
  indexes: CanonicalIndexes,
  consumers: ConsumerRowVm[],
): CopyDispositionVm {
  const roleClauses = copy.effectiveRoles
    .filter((role) => role !== 'unclassified')
    .map((role) => `; ${role}: ${ROLE_NOTES[role]}`)
    .join('');
  const note = `${DISPOSITION_NOTES[copy.sourceDisposition]}${roleClauses}`;
  if (copy.sourceDisposition === 'share-registration') {
    return { label: 'shared', audience: null, note };
  }
  if (copy.sourceDisposition === 'scope-registration') {
    return { label: 'isolated', audience: audienceOf(copy, group, indexes, consumers), note };
  }
  return { label: copy.sourceDisposition, audience: null, note };
}

/**
 * Audience of an isolated copy: the scope registration's own declarers,
 * checked against the block's ACTUAL consumer rows. Canonical copies can be
 * `isolated-own` and `anchor-source` at once — as soon as a consumer beyond
 * the declarers resolves to the copy, claiming "mapped only for X" would be
 * false, so the "only" drops and the note says why.
 */
function audienceOf(
  copy: ResolvedDependencyCopy,
  group: PackageGroup,
  indexes: CanonicalIndexes,
  consumers: ConsumerRowVm[],
): AnnotationVm | null {
  if (copy.source.kind !== 'shared-declaration') {
    return null;
  }
  const declaration = indexes.declarationById.get(copy.source.declarationId);
  if (declaration === undefined) {
    return null;
  }
  const registration = group.registrations.find(
    ({ registration: candidate }) => candidate.id === declaration.versionRegistrationId,
  );
  const declarers = registration?.declarations ?? [declaration];
  const declarerNames = new Set(declarers.map((declarer) => declarer.participant));
  const audience = declarers.map((declarer) => participantDisplay(declarer.participant)).join(', ');
  const external = consumers.some((consumer) => !declarerNames.has(consumer.remoteSelect));
  return external
    ? {
        label: `mapped for ${audience}`,
        note: 'the scope registration’s own declarers — consumers beyond them also resolve to this copy in this capture',
      }
    : {
        label: `mapped only for ${audience}`,
        note: 'the scope registration’s own declarers — the isolated copy is mapped for them alone',
      };
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

/**
 * Display list of the own registered files evidenced behind the given
 * claims — each claim's own entrypoint candidate, joined in claim order.
 * Null when no claim's candidate is part of the canonical evidence: the
 * outcome then renders without a file name, never with an invented one.
 */
function evidencedOwnFilesOf(
  claims: DeclarationResolutionClaim[],
  indexes: CanonicalIndexes,
): string | null {
  const files: string[] = [];
  for (const claim of claims) {
    const file = indexes.candidateById.get(claim.candidateId)?.file;
    if (file !== undefined && file !== '' && !files.includes(file)) {
      files.push(file);
    }
  }
  return files.length === 0 ? null : files.join(', ');
}

/**
 * Deviation annotations of one consumer row from its claims' mapping states
 * and the consumer's own registration action. The happy path (selected share
 * declaration) contributes nothing; skip consumers say what they skipped,
 * scope consumers that they kept their own copy. Outcome notes name the
 * consumer's own registered file when the claim evidence carries it —
 * capture-relative wording: an unselected own copy may be selected under a
 * different composition.
 */
function consumerDeviationsOf(
  declaration: ParticipantDeclaration,
  registration: VersionRegistration,
  claims: DeclarationResolutionClaim[],
  indexes: CanonicalIndexes,
): AnnotationVm[] {
  const states = new Set(claims.map((claim) => claim.mappingState));
  const filesInStates = (...triggering: DeclarationResolutionClaim['mappingState'][]) =>
    evidencedOwnFilesOf(
      claims.filter((claim) => triggering.includes(claim.mappingState)),
      indexes,
    );
  const deviations: AnnotationVm[] = [];
  if (states.has('anchored')) {
    const anchor = declaration.servedBy;
    const anchorDisplay = anchor === null ? 'unknown' : participantDisplay(anchor);
    deviations.push({
      label: 'anchored',
      note: `explicit servedBy anchor: ${anchorDisplay} — the binding resolves through the anchor's copy`,
    });
  }
  if (states.has('self-filled')) {
    deviations.push({
      label: 'self-filled',
      note: 'no applicable shared source — the consumer’s own copy fills the binding',
    });
  }
  if (states.has('own-selected') && registration.action === 'scope') {
    const files = filesInStates('own-selected');
    deviations.push({
      label: 'kept own copy',
      note:
        files === null
          ? 'registered with action scope — keeps its own copy, mapped only for its own declarers'
          : `own copy ${files} is registered with action scope — the consumer keeps it, mapped only for its own declarers`,
    });
  }
  if (registration.action === 'skip' && (states.has('fallback') || states.has('not-selected'))) {
    const files = filesInStates('fallback', 'not-selected');
    deviations.push({
      label: `skipped own ${registration.tag}`,
      note:
        files === null
          ? `own copy ${registration.tag} is registered with action skip — the consumer resolves to the elected copy`
          : `own copy ${files} (${registration.tag}) is registered with action skip — the consumer resolves to the elected copy`,
    });
  } else if (states.has('not-selected')) {
    const files = filesInStates('not-selected');
    deviations.push({
      label: 'not selected',
      note:
        files === null
          ? 'the consumer’s own candidate is not selected in this capture — its binding resolves to this copy'
          : `own copy ${files} is registered but not selected in this capture — the binding resolves to this copy; a different composition may select it`,
    });
  }
  return deviations;
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

/**
 * Consumer rows of one copy: this group's declarations whose claims resolve
 * to it, reconciled against the canonical `ConsumerCopyRelation`s — a
 * consumer declaring under ANOTHER registry package (cross-package
 * convergence) still resolves to the copy, counts as involvement, and must
 * not disappear from the block. Such rows carry a `declared under X`
 * annotation instead of silently posing as local declarers.
 */
function consumersOf(
  copy: ResolvedDependencyCopy,
  group: PackageGroup,
  rows: GroupedClaims[],
  indexes: CanonicalIndexes,
): ConsumerRowVm[] {
  const consumers: ConsumerRowVm[] = [];
  const groupDeclarationIds = new Set(rows.map((row) => row.declaration.id));
  for (const { registration, declaration, claims } of rows) {
    const copyClaims = claims.filter((claim) => claim.copyId === copy.id);
    if (copyClaims.length === 0) {
      continue;
    }
    const specifiers = copyClaims.map((claim) => claim.specifier);
    consumers.push({
      declarationId: declaration.id,
      name: participantDisplay(declaration.participant),
      host: isHostRemote(declaration.participant),
      declared: declaredOf(declaration, registration, group.scope),
      strict: declaration.strictVersion,
      deviations: consumerDeviationsOf(declaration, registration, copyClaims, indexes),
      viaSpecifiers: specifiers.includes(group.packageName) ? [] : specifiers,
      remoteSelect: declaration.participant,
      pool: poolChipOf(declaration, indexes.projection),
    });
  }

  // Claims of the copy's relations whose subject is NOT one of this group's
  // declarations, grouped per subject record (one row per foreign subject).
  const foreignBySubject = new Map<string, DeclarationResolutionClaim[]>();
  for (const relation of indexes.relationsByCopy.get(copy.id) ?? []) {
    for (const claimId of relation.claimIds) {
      const claim = indexes.claimById.get(claimId);
      if (claim === undefined) {
        continue;
      }
      if (
        claim.subject.kind === 'shared' &&
        groupDeclarationIds.has(claim.subject.participantDeclarationId)
      ) {
        continue;
      }
      const subjectId: string =
        claim.subject.kind === 'shared'
          ? claim.subject.participantDeclarationId
          : claim.subject.privateRegistrationId;
      foreignBySubject.set(subjectId, [...(foreignBySubject.get(subjectId) ?? []), claim]);
    }
  }
  for (const claims of foreignBySubject.values()) {
    const subject = claims[0].subject;
    const declaredUnder: AnnotationVm = {
      label: `declared under ${claims[0].consumerRegistryPackage}`,
      note:
        subject.kind === 'shared'
          ? 'this consumer declares the specifier under another registry package — its binding still resolves to this copy'
          : 'this consumer’s private (scoped) registration resolves to this copy',
    };
    if (subject.kind === 'shared') {
      const declaration = indexes.declarationById.get(subject.participantDeclarationId);
      const registration =
        declaration === undefined
          ? undefined
          : indexes.registrationById.get(declaration.versionRegistrationId);
      if (declaration === undefined || registration === undefined) {
        continue;
      }
      const scope =
        indexes.sharedExternalById.get(registration.sharedExternalId)?.shareScope ?? group.scope;
      consumers.push({
        declarationId: declaration.id,
        name: participantDisplay(declaration.participant),
        host: isHostRemote(declaration.participant),
        declared: declaredOf(declaration, registration, scope),
        strict: declaration.strictVersion,
        deviations: [
          declaredUnder,
          ...consumerDeviationsOf(declaration, registration, claims, indexes),
        ],
        viaSpecifiers: [],
        remoteSelect: declaration.participant,
        pool: poolChipOf(declaration, indexes.projection),
      });
    } else {
      const registration = indexes.privateRegistrationById.get(subject.privateRegistrationId);
      if (registration === undefined) {
        continue;
      }
      consumers.push({
        declarationId: registration.id,
        name: participantDisplay(registration.ownerRemote),
        host: isHostRemote(registration.ownerRemote),
        declared: { text: registration.tag, pinned: false },
        strict: false,
        deviations: [declaredUnder],
        viaSpecifiers: [],
        remoteSelect: registration.ownerRemote,
        pool: null,
      });
    }
  }
  return consumers;
}

/** Blocks in elected-first order: shared-elected copies lead, store order within. */
function blocksOf(
  group: PackageGroup,
  indexes: CanonicalIndexes,
  rows: GroupedClaims[],
): CopyBlockVm[] {
  const blockOf = (copy: ResolvedDependencyCopy): CopyBlockVm => {
    const integrityByTarget = new Map<string, boolean>();
    for (const resolutionId of copy.effectiveResolutionIds) {
      const resolution = indexes.resolutionById.get(resolutionId);
      if (resolution?.status === 'mapped') {
        integrityByTarget.set(resolution.targetUrl, resolution.hasIntegrity);
      }
    }
    const source = copySourceVmOf(copy);
    const consumers = consumersOf(copy, group, rows, indexes);
    const specifiers = Object.keys(copy.entrypoints);
    const deviations: AnnotationVm[] = copy.effectiveRoles
      .filter((role) => role === 'unclassified')
      .map((role) => ({ label: role, note: ROLE_NOTES[role] }));
    // T7.10: without the package's own specifier among the entrypoints, the
    // head tag would read as a full-package version — the fact names the
    // specifiers actually served instead.
    if (specifiers.length > 0 && !specifiers.includes(group.packageName)) {
      deviations.push({
        label: 'secondary entrypoint only',
        note: `this copy serves ${specifiers.join(', ')} — the package’s own specifier ${group.packageName} does not resolve to it in this capture; the tag names the entrypoint’s registration, not a version of the whole package`,
      });
    }
    return {
      copyId: copy.id,
      resolvedTag: copy.resolvedTag,
      unknownTagNote: copy.resolvedTag === null ? UNKNOWN_TAG_NOTE : null,
      source,
      disposition: dispositionVmOf(copy, group, indexes, consumers),
      deviations,
      files: Object.entries(copy.entrypoints).map(([specifier, targetUrl]) => ({
        specifier,
        showSpecifier: specifier !== group.packageName,
        file: targetFileName(targetUrl),
        targetUrl,
        hasIntegrity: integrityByTarget.get(targetUrl) ?? false,
        importMapSelect: specifier,
      })),
      consumers,
      chunks: buildCopyChunkClaims(copy, indexes, source.remoteSelect),
    };
  };
  const elected = group.copies.filter((copy) => copy.effectiveRoles.includes('ordinary-shared'));
  const others = group.copies.filter((copy) => !elected.includes(copy));
  return [...elected, ...others].map(blockOf);
}

export function buildDetail(
  groups: PackageGroup[],
  indexes: CanonicalIndexes,
  selectedId: string | null,
): PackageDetailVm | null {
  const group = selectedId === null ? null : (groups.find((g) => g.id === selectedId) ?? null);
  if (group === null) {
    return null;
  }
  const byId = new Map(groups.map((g) => [g.id, g]));
  const parent = parentOf(group, byId);

  // Every (registration, declaration) with its claims, registry order — the
  // one spine consumer rows, the bucket, and the diagnostics all read from.
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
    scopeDisplay: group.scope === GLOBAL_SCOPE ? 'global' : group.scope,
    scopeLabel: group.scope === GLOBAL_SCOPE ? null : group.scope,
    strictScope: group.scope === STRICT_SCOPE,
    parent:
      parent === null
        ? null
        : {
            packageName: parent.packageName,
            packageId: parent.id,
            rule: 'name-derived',
          },
    conflict: group.multiVersion
      ? {
          label: `⚠ ${group.resolvedTags.length} resolved versions`,
          note: 'more than one distinct version resolves in this share scope (rule: resolved-tag-multiplicity)',
        }
      : null,
    noCopies:
      group.copies.length === 0 && rows.length > 0
        ? { label: 'no resolved copies in this capture', note: noCopyNoteOf(group, indexes) }
        : null,
    blocks: blocksOf(group, indexes, rows),
    unresolved,
    diagnostics,
  };
}
