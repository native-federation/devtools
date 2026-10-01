/**
 * Detail half of the Remotes vm builder — the transposed projection of one
 * remote against the canonical resolution model, presented as three zones
 * decided PER CLAIM (T8.6):
 *
 *  - `provides` — resolved copies whose evidenced source is this remote
 *    (source qualifier `exact-target-source` or `explicit-anchor` with this
 *    remote as target). The block head folds the remote's own DECLARED-BY
 *    row; the remote consumes its own copies in place unless a chip says
 *    otherwise. Qualified attributions (ambiguous / observed / unknown
 *    source) NEVER form provides blocks.
 *  - `consumes` — claims whose binding resolves to ANOTHER remote's copy,
 *    plus every qualified attribution with its qualifier chip visible, plus
 *    the relation-only sub-bucket (claim-less consumer relations, T8-H2).
 *  - `unresolved` — claims without a copy and candidate-less declarations,
 *    in the Packages bucket grammar with `offered <tag>`.
 *
 * Registry action ≠ zone (T8-H4): share/scope/skip stay registry-evidence
 * tooltips on the declared version; where a binding resolves is said by
 * zone membership and state chips alone — pooling-anchor witnesses
 * skip + anchored → a provides block with an `anchored` chip.
 *
 * Everything joins the canonical read surface — `model.resolutionProjection`,
 * `model.effectiveConsumerResolutions`, `model.registryEvidence` — by ID
 * only. Nothing re-derives elections, share counts, or source semantics.
 */
import { PoolChipVm, poolChipOf } from '../../shared/pool-chip';
import type { FederationModel, RemoteEntity } from '../../shared/store/federation-model';
import type {
  BundleClaimStatus,
  DeclarationResolutionClaim,
  ParticipantDeclaration,
  ResolvedDependencyCopy,
  SharedExternalRecord,
  VersionRegistration,
} from '../../shared/store/resolution';
import {
  ACTION_NOTES,
  CanonicalIndexes,
  GLOBAL_SCOPE,
  STRICT_SCOPE,
  chunkFileClaim,
  copySourceVmOf,
  countClaim,
  packageId,
  participantDisplay,
  targetFileName,
} from '../../shared/view-conventions';

/** One annotated fact — state chip or grounded note. */
export interface AnnotationVm {
  label: string;
  /** Grounded reason (tooltip); every annotation carries one. */
  note: string;
}

/** One observed capability of the remote (meta-line word with tooltip). */
export interface CapabilityVm {
  label: string;
  note: string;
}

export interface ExposeVm {
  /**
   * Remote-qualified module identity (the V1 rule: remote name + expose
   * key, never the key alone). Matches the naive map-join specifier, so
   * live maps keep their literal `/./` infix.
   */
  qualified: string;
  moduleName: string;
  file: string;
  /** Joined map target; null when no map entry joins (honest absence). */
  mapTarget: string | null;
  /** True when the remote's recorded integrity map carries this file. */
  hasIntegrity: boolean;
}

/**
 * Display form of the remote's own declared version, with the grounded
 * registration tooltip (registry evidence only — T8-H4: the action never
 * claims a mapping outcome; zones and chips do).
 */
export interface DeclaredDisplayVm {
  text: string;
  /** True in the strict share scope — the exact tag, never a range. */
  pinned: boolean;
  note: string;
}

/** One mapped entrypoint file line (Packages file-line grammar). */
export interface ZoneFileVm {
  specifier: string;
  /** True when the specifier is not the registry key itself. */
  showSpecifier: boolean;
  file: string;
  targetUrl: string;
  hasIntegrity: boolean;
  /** `select` payload for the /import-map cross-link. */
  importMapSelect: string;
}

/**
 * One resolved copy this remote is the evidenced source of. The head folds
 * the remote's own DECLARED-BY row (name · resolved tag · own declared
 * range · strict); deviation chips speak only for exceptions — there is
 * deliberately NO `kept own copy` chip (zone membership already says it).
 * Secondary registry keys group under their name-derived parent block as
 * compact sub-rows (presentational grouping of REAL registry keys — not
 * the Packages entries-map `entry` sub-row semantics).
 */
export interface ProvidesBlockVm {
  /** Canonical copy ID (render tracking key). */
  copyId: string;
  packageName: string;
  /** `select` payload for the /packages cross-link. */
  packageSelect: string;
  /** Verbatim share-scope chip; null in the global scope. */
  scopeLabel: string | null;
  /** This remote's explicit pool tag on the package; null when untagged. */
  pool: PoolChipVm | null;
  resolvedTag: string | null;
  /** Why the tag is unknown; null while `resolvedTag` exists. */
  unknownTagNote: string | null;
  declared: DeclaredDisplayVm;
  strict: boolean;
  /** `isolated` (+ audience), `anchored`, `self-filled` — the norm renders none. */
  deviations: AnnotationVm[];
  files: ZoneFileVm[];
  /** Display suffix under the parent block; null on top-level blocks. */
  suffix: string | null;
  secondaries: ProvidesBlockVm[];
}

/** Qualified source of a consumed copy (file-line provider + from-chip). */
export interface ConsumesSourceVm {
  /** Provider text — qualified display name or qualified label. */
  label: string;
  /** Grounded tooltip of the source attribution. */
  note: string;
  /** `select` payload for the /remotes cross-link; null without a remote. */
  remoteSelect: string | null;
  host: boolean;
}

/**
 * One claim of this remote resolving to another remote's copy (or to a
 * qualified attribution — those never form provides blocks and render
 * here with their qualifier chip visible). Renders as a two-line
 * mini-block in the provides grammar: head line with the claim facts, the
 * winner file `from` its source on an own file line (screenshot review 3
 * — no arrow glyph).
 */
export interface ConsumesRowVm {
  /** Canonical claim ID (render tracking key). */
  claimId: string;
  packageName: string;
  packageSelect: string;
  scopeLabel: string | null;
  pool: PoolChipVm | null;
  declared: DeclaredDisplayVm;
  strict: boolean;
  /** Claimed specifier when it is not the registry key itself. */
  via: string | null;
  /** Deviation chips incl. the source qualifier chip; the norm renders none. */
  deviations: AnnotationVm[];
  /** Display file of the winner binding (file-line grammar). */
  file: string;
  /** Mapped target URL of the winner binding; null when not evidenced. */
  targetUrl: string | null;
  source: ConsumesSourceVm;
}

/** One claim that resolves nowhere — the `unresolved` bucket (T7 grammar). */
export interface RemoteUnresolvedRowVm {
  /** Canonical claim ID, or the declaration ID for claim-less declarations. */
  key: string;
  packageName: string;
  packageSelect: string;
  scopeLabel: string | null;
  pool: PoolChipVm | null;
  declared: DeclaredDisplayVm;
  strict: boolean;
  /** Claimed specifier when it is not the registry key itself; null otherwise. */
  specifier: string | null;
  state: AnnotationVm;
  /** Tag of the remote's own registration — offered, never resolved. */
  offered: AnnotationVm | null;
}

/**
 * One canonical consumer-copy relation of this remote WITHOUT an own claim
 * behind it — an alias or claim-less consumer whose binding still resolves
 * to a copy (T8-H2). Renders inside the consumes zone under its own muted
 * note; hiding these rows would silently drop canonical knowledge.
 */
export interface RelationConsumerVm {
  /** Canonical ConsumerCopyRelationId (render tracking key). */
  relationId: string;
  /** Source package of the related copy; null stays honest. */
  packageName: string | null;
  /** Resolved tag of the related copy; null stays honest. */
  copyTag: string | null;
  /** Qualified source of the copy — display name or qualified label. */
  source: AnnotationVm;
  /** The mapped bindings this relation rests on. */
  bindings: { resolutionId: string; specifier: string; file: string; targetUrl: string }[];
  /** Grounded rule note for the whole row. */
  note: string;
}

/**
 * One chunk row — one bundle, deduped across the resolved copies claiming
 * it, with the muted `serves <packages>` tail. Chunks render exactly once,
 * provider-side; they are never nested into blocks and never shown under
 * consumes.
 */
export interface RemoteChunkRowVm {
  /** Render tracking key (bundle + status). */
  key: string;
  bundle: string;
  status: BundleClaimStatus;
  /** Grounded qualification of the claim (tooltip). */
  statusNote: string;
  /** Shared chunk-file wording; claims absence explicitly. */
  fileClaim: string;
  files: string[];
  /** Muted tail naming the packages of the claiming copies; null without one. */
  serves: string | null;
  /** Grounded full list; null when the visible tail already says it all. */
  servesNote: string | null;
}

/** Chunk section — exclusively canonical bundle claims and chunk groups. */
export type RemoteChunkSectionVm =
  | {
      level: 'bundle-claims';
      note: string;
      rows: RemoteChunkRowVm[];
      rule: 'canonical-bundle-claims';
    }
  | {
      level: 'carrier-groups';
      note: string;
      groups: { groupId: string; label: string; fileClaim: string }[];
      rule: 'chunk-pseudo-externals';
    }
  | {
      level: 'none';
      /** Short honest-empty line (unified empty grammar). */
      label: string;
      /** Grounded explanation — the line's tooltip (screenshot review 3). */
      note: string;
      rule: 'no-chunk-evidence';
    };

/** One claim of a private registration with its resolution and copy. */
export interface ScopedClaimVm {
  /** Canonical claim ID (render tracking key). */
  claimId: string;
  specifier: string;
  state: AnnotationVm;
  /** Display file of the mapped target; null while unresolved. */
  file: string | null;
  targetUrl: string | null;
  /** Resolved tag of the materialized copy; null without a copy. */
  copyTag: string | null;
}

/**
 * One true private registration of this remote (never a reclassified chunk
 * carrier), with its complete claim → resolution → copy path. Private
 * registrations carry no shared action and no share scope — none is invented.
 */
export interface ScopedPackageVm {
  /** Canonical PrivateRegistrationId (render tracking key). */
  registrationId: string;
  packageName: string;
  tag: string;
  bundle: string | null;
  /** Grounded domain wording — private owner, never a share action/scope. */
  domainNote: string;
  claims: ScopedClaimVm[];
}

export interface RemoteDetailVm {
  /** Verbatim remote name (select payloads must match it). */
  name: string;
  /** Display form — the `__NF-HOST__` sentinel reads as 'host'. */
  display: string;
  host: boolean;
  /** Scope URL as recorded (live registries keep relative URLs). */
  scopeUrl: string;
  resolvedScopeUrl: string;
  capabilities: CapabilityVm[];
  exposes: ExposeVm[];
  provides: ProvidesBlockVm[];
  consumes: ConsumesRowVm[];
  /** Consumer-copy relations without an own claim (consumes sub-bucket). */
  relationOnly: RelationConsumerVm[];
  unresolved: RemoteUnresolvedRowVm[];
  chunks: RemoteChunkSectionVm;
  scoped: ScopedPackageVm[];
  /** Muted divergence footer; empty renders nothing. */
  diagnostics: AnnotationVm[];
}

const CHUNK_EXPLANATION = "code shared between this remote's exposes, plus lazy modules";

const UNKNOWN_TAG_NOTE = 'no uniquely evidenced source tag for this copy';

const PINNED_TAG_NOTE =
  'exact tag — pinned by the strict share scope; the configured requiredVersion range is not stored';

// Chunk lists and `bundle` are both written only under `features.denseChunking`; a multi-entry map
// can come from `features.denseExternals` or host-side `convertFlatSharedInfo`, so that note claims
// neither (see docs/work/share-pools/plan.md, persisted-evidence table).
function capabilitiesOf(remote: RemoteEntity, model: FederationModel): CapabilityVm[] {
  const capabilities: CapabilityVm[] = [];
  const evidence = model.registryEvidence;
  const ownRegistrations = [
    ...evidence.participantDeclarations.filter((d) => d.participant === remote.name),
    ...evidence.privateRegistrations.filter((r) => r.ownerRemote === remote.name),
  ];

  const chunkFacets: string[] = [];
  if (
    model.resolutionProjection.chunkGroups.some(
      (group) => group.emitterRemote === remote.name && group.origin === 'shared-chunks',
    )
  ) {
    chunkFacets.push('the registry records per-bundle chunk lists for this remote');
  }
  if (ownRegistrations.some((registration) => registration.bundle !== null)) {
    chunkFacets.push("this remote's registrations carry their serving bundle");
  }
  if (chunkFacets.length > 0) {
    capabilities.push({
      label: 'dense chunking',
      note: `${chunkFacets.join('; ')} (config: features.denseChunking: true, default false, since core v4.0.0)`,
    });
  }
  if (ownRegistrations.some((registration) => registration.entrypointCandidateIds.length > 1)) {
    capabilities.push({
      label: 'multi-entry registrations',
      note: 'a registration of this remote maps several entrypoints in one entries map (config: features.denseExternals: true at build, default false, since core v4.3.0 — or feature.convertFlatSharedInfo: true on the host, default false; the registry does not record which)',
    });
  }
  if (Object.keys(remote.integrity).length > 0) {
    capabilities.push({
      label: 'SRI',
      note: `integrity hashes recorded for this remote's files (config: features.integrityHashes: true, default false, since core v4.1.2)`,
    });
  }
  return capabilities;
}

function exposesOf(remote: RemoteEntity): ExposeVm[] {
  return remote.exposes.map((expose) => ({
    qualified: `${remote.name}/${expose.moduleName}`,
    moduleName: expose.moduleName,
    file: expose.file,
    mapTarget: expose.mapTarget,
    hasIntegrity: remote.integrity[expose.file] !== undefined,
  }));
}

/** One declaration of the remote with its registry joins, registry order. */
interface DeclarationRow {
  declaration: ParticipantDeclaration;
  registration: VersionRegistration;
  external: SharedExternalRecord;
  claims: DeclarationResolutionClaim[];
}

function declarationRowsOf(
  remote: RemoteEntity,
  model: FederationModel,
  indexes: CanonicalIndexes,
): DeclarationRow[] {
  const rows: DeclarationRow[] = [];
  for (const declaration of model.registryEvidence.participantDeclarations) {
    if (declaration.participant !== remote.name) {
      continue;
    }
    const registration = indexes.registrationById.get(declaration.versionRegistrationId);
    const external =
      registration === undefined
        ? undefined
        : indexes.sharedExternalById.get(registration.sharedExternalId);
    if (registration === undefined || external === undefined) {
      continue;
    }
    rows.push({
      declaration,
      registration,
      external,
      claims: indexes.claimsByDeclaration.get(declaration.id) ?? [],
    });
  }
  return rows;
}

function declaredDisplayOf(row: DeclarationRow): DeclaredDisplayVm {
  const registrationNote =
    ACTION_NOTES[row.registration.action] ?? 'registry action recorded verbatim';
  return row.external.shareScope === STRICT_SCOPE
    ? { text: row.registration.tag, pinned: true, note: `${PINNED_TAG_NOTE}; ${registrationNote}` }
    : { text: row.declaration.requiredVersion, pinned: false, note: registrationNote };
}

function scopeLabelOf(external: SharedExternalRecord): string | null {
  return external.shareScope === GLOBAL_SCOPE ? null : external.shareScope;
}

/** Mapped entrypoint file lines of one copy (Packages file-line grammar). */
function filesOf(
  copy: ResolvedDependencyCopy,
  packageName: string,
  indexes: CanonicalIndexes,
): ZoneFileVm[] {
  const integrityByTarget = new Map<string, boolean>();
  for (const resolutionId of copy.effectiveResolutionIds) {
    const resolution = indexes.resolutionById.get(resolutionId);
    if (resolution?.status === 'mapped') {
      integrityByTarget.set(resolution.targetUrl, resolution.hasIntegrity);
    }
  }
  return Object.entries(copy.entrypoints).map(([specifier, targetUrl]) => ({
    specifier,
    showSpecifier: specifier !== packageName,
    file: targetFileName(targetUrl),
    targetUrl,
    hasIntegrity: integrityByTarget.get(targetUrl) ?? false,
    importMapSelect: specifier,
  }));
}

/**
 * Audience of an isolated copy: the scope registration's own declarers,
 * checked against the copy's canonical consumer relations. As soon as a
 * consumer beyond the declarers resolves to the copy, claiming "mapped
 * only for X" would be false — the "only" drops and the note says why.
 */
function audienceOf(
  copy: ResolvedDependencyCopy,
  registration: VersionRegistration,
  model: FederationModel,
  indexes: CanonicalIndexes,
): AnnotationVm {
  const declarers = model.registryEvidence.participantDeclarations.filter(
    (declaration) => declaration.versionRegistrationId === registration.id,
  );
  const declarerNames = new Set(declarers.map((declarer) => declarer.participant));
  const audience = declarers.map((declarer) => participantDisplay(declarer.participant)).join(', ');
  const external = (indexes.relationsByCopy.get(copy.id) ?? []).some(
    (relation) => !declarerNames.has(relation.consumerRemote),
  );
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

/**
 * Deviation chips of one provides block. The norm (selected share source,
 * consumed in place) renders none; there is NO `kept own copy` chip — the
 * provides zone plus the `isolated` disposition already say it (a fact
 * renders once). The registry action stays in the registration tooltip.
 */
function providesDeviationsOf(
  copy: ResolvedDependencyCopy,
  row: DeclarationRow,
  ownClaims: DeclarationResolutionClaim[],
  model: FederationModel,
  indexes: CanonicalIndexes,
): AnnotationVm[] {
  const deviations: AnnotationVm[] = [];
  if (copy.sourceDisposition === 'scope-registration') {
    deviations.push({
      label: 'isolated',
      note: 'the evidenced source is registered with action scope — an isolated copy',
    });
    deviations.push(audienceOf(copy, row.registration, model, indexes));
  }
  if (
    copy.effectiveRoles.includes('anchor-source') ||
    ownClaims.some((claim) => claim.mappingState === 'anchored')
  ) {
    const anchor = row.declaration.servedBy;
    deviations.push({
      label: 'anchored',
      note: `explicit servedBy anchor: ${
        anchor === null ? 'unknown' : participantDisplay(anchor)
      } — the binding resolves through the anchor's copy`,
    });
  }
  if (
    copy.effectiveRoles.includes('self-filled-source') ||
    ownClaims.some((claim) => claim.mappingState === 'self-filled')
  ) {
    deviations.push({
      label: 'self-filled',
      note: 'no applicable shared source — the consumer’s own copy fills the binding',
    });
  }
  if (copy.effectiveRoles.includes('unclassified')) {
    deviations.push({ label: 'unclassified', note: 'no closed rule explains this copy' });
  }
  return deviations;
}

/**
 * Deviation chips of one consumes row from its claim's canonical mapping
 * state and the remote's own registration action. Outcome notes name the
 * remote's own registered file when the claim evidence carries it (T7.9);
 * capture-relative wording — an unselected own copy may be selected under
 * a different composition. A plain fallback stays chip-less: the zone and
 * the winner arrow speak.
 */
function consumesDeviationsOf(
  claim: DeclarationResolutionClaim,
  row: DeclarationRow,
  indexes: CanonicalIndexes,
): AnnotationVm[] {
  const deviations: AnnotationVm[] = [];
  const ownFile = indexes.candidateById.get(claim.candidateId)?.file ?? null;
  if (claim.mappingState === 'anchored') {
    const anchor = row.declaration.servedBy;
    deviations.push({
      label: 'anchored',
      note: `explicit servedBy anchor: ${
        anchor === null ? 'unknown' : participantDisplay(anchor)
      } — the binding resolves through the anchor's copy`,
    });
  }
  if (claim.mappingState === 'self-filled') {
    deviations.push({
      label: 'self-filled',
      note: 'no applicable shared source — the consumer’s own copy fills the binding',
    });
  }
  const skipped =
    row.registration.action === 'skip' &&
    (claim.mappingState === 'fallback' || claim.mappingState === 'not-selected');
  if (skipped) {
    deviations.push({
      label: `skipped own ${row.registration.tag}`,
      note:
        ownFile === null || ownFile === ''
          ? `own copy ${row.registration.tag} is registered with action skip — the consumer resolves to the elected copy`
          : `own copy ${ownFile} (${row.registration.tag}) is registered with action skip — the consumer resolves to the elected copy`,
    });
  } else if (claim.mappingState === 'not-selected') {
    // The chip names its subject (screenshot review 4): next to the winner
    // file `from <source>`, a bare `not selected` reads as a statement
    // about the ELECTED copy. Mirrors the `skipped own <tag>` grammar.
    deviations.push({
      label: `own ${row.registration.tag} not selected`,
      note:
        ownFile === null || ownFile === ''
          ? 'the own candidate is not selected in this capture — the binding resolves to the selected copy; a different composition may select it'
          : `own copy ${ownFile} is registered but not selected in this capture — the binding resolves to the selected copy; a different composition may select it`,
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
  return { label: 'unknown', note: 'mapping state not derivable from the captured evidence' };
}

interface ZoneSplit {
  provides: ProvidesBlockVm[];
  consumes: ConsumesRowVm[];
  unresolved: RemoteUnresolvedRowVm[];
}

/**
 * The zone partition. Provides blocks are copy-driven (every copy whose
 * evidenced source is one of this remote's declarations, exact/anchor
 * qualified); claims are partitioned per claim — a claim resolving to one
 * of those own copies folds into its block, a claim resolving anywhere
 * else becomes a consumes row, a claim without a copy lands in the
 * unresolved bucket. A declaration can therefore render in BOTH zones
 * (own main claim + foreign-resolving secondary).
 */
function zonesOf(
  remote: RemoteEntity,
  model: FederationModel,
  indexes: CanonicalIndexes,
): ZoneSplit {
  const rows = declarationRowsOf(remote, model, indexes);

  const copiesByDeclaration = new Map<string, ResolvedDependencyCopy[]>();
  for (const copy of model.resolutionProjection.copies) {
    if (copy.source.kind !== 'shared-declaration') {
      continue;
    }
    copiesByDeclaration.set(copy.source.declarationId, [
      ...(copiesByDeclaration.get(copy.source.declarationId) ?? []),
      copy,
    ]);
  }
  const ownClaimsByCopy = new Map<string, DeclarationResolutionClaim[]>();
  for (const row of rows) {
    for (const claim of row.claims) {
      if (claim.copyId !== null) {
        ownClaimsByCopy.set(claim.copyId, [...(ownClaimsByCopy.get(claim.copyId) ?? []), claim]);
      }
    }
  }

  const blockEntries: { scope: string; vm: ProvidesBlockVm }[] = [];
  for (const row of rows) {
    for (const copy of copiesByDeclaration.get(row.declaration.id) ?? []) {
      const source = copySourceVmOf(copy);
      // Zone rule: provides requires exact/anchor source evidence. Shared-
      // declaration sources always qualify; the guard keeps the rule
      // explicit should the ladder ever grow.
      if (source.qualifier !== 'exact-target-source' && source.qualifier !== 'explicit-anchor') {
        continue;
      }
      blockEntries.push({
        scope: row.external.shareScope,
        vm: {
          copyId: copy.id,
          packageName: row.external.packageName,
          packageSelect: packageId(row.external.shareScope, row.external.packageName),
          scopeLabel: scopeLabelOf(row.external),
          pool: poolChipOf(row.declaration, model.resolutionProjection),
          resolvedTag: copy.resolvedTag,
          unknownTagNote: copy.resolvedTag === null ? UNKNOWN_TAG_NOTE : null,
          declared: declaredDisplayOf(row),
          strict: row.declaration.strictVersion,
          deviations: providesDeviationsOf(
            copy,
            row,
            ownClaimsByCopy.get(copy.id) ?? [],
            model,
            indexes,
          ),
          files: filesOf(copy, row.external.packageName, indexes),
          suffix: null,
          secondaries: [],
        },
      });
    }
  }
  const providedCopyIds = new Set(blockEntries.map((entry) => entry.vm.copyId));

  const consumes: ConsumesRowVm[] = [];
  const unresolved: RemoteUnresolvedRowVm[] = [];
  for (const row of rows) {
    const declared = declaredDisplayOf(row);
    const base = {
      packageName: row.external.packageName,
      packageSelect: packageId(row.external.shareScope, row.external.packageName),
      scopeLabel: scopeLabelOf(row.external),
      pool: poolChipOf(row.declaration, model.resolutionProjection),
      strict: row.declaration.strictVersion,
    };
    if (row.claims.length === 0) {
      unresolved.push({
        ...base,
        key: row.declaration.id,
        declared,
        specifier: null,
        state: {
          label: 'declared',
          note: 'declaration without entrypoint candidates — no resolution claim derivable',
        },
        offered: {
          label: `offered ${row.registration.tag}`,
          note: 'the tag of the remote’s own version registration — no resolution claim is derivable for this declaration',
        },
      });
      continue;
    }
    for (const claim of row.claims) {
      const copy = claim.copyId === null ? undefined : indexes.copyById.get(claim.copyId);
      if (copy === undefined) {
        unresolved.push({
          ...base,
          key: claim.id,
          declared,
          specifier: claim.specifier === row.external.packageName ? null : claim.specifier,
          state:
            claim.copyId === null
              ? unresolvedStateOf(claim, indexes)
              : { label: 'unknown', note: 'mapping evidence missing in this capture' },
          offered: {
            label: `offered ${row.registration.tag}`,
            note: 'the tag of the remote’s own version registration — this claim’s binding does not resolve in this capture',
          },
        });
        continue;
      }
      if (providedCopyIds.has(copy.id)) {
        // Self-consumption folds into the provides block — a fact renders once.
        continue;
      }
      const source = copySourceVmOf(copy);
      const resolution = indexes.resolutionById.get(claim.effectiveResolutionId);
      const targetUrl =
        resolution?.status === 'mapped'
          ? resolution.targetUrl
          : (copy.entrypoints[claim.specifier] ?? null);
      const deviations = consumesDeviationsOf(claim, row, indexes);
      // Qualified attributions render their qualifier chip on the row —
      // ambiguity renders as ambiguity, never as silent provides membership.
      if (source.qualifier !== 'exact-target-source' && source.qualifier !== 'explicit-anchor') {
        deviations.push({ label: source.label, note: source.note });
      }
      consumes.push({
        ...base,
        claimId: claim.id,
        declared,
        via: claim.specifier === row.external.packageName ? null : claim.specifier,
        deviations,
        file: targetUrl === null ? '(no target file evidenced)' : targetFileName(targetUrl),
        targetUrl,
        source: {
          label: source.display ?? source.label,
          note: `${source.label} — ${source.note}`,
          remoteSelect: source.remoteSelect,
          host: source.host,
        },
      });
    }
  }

  return { provides: groupSecondaries(blockEntries), consumes, unresolved };
}

/**
 * Groups secondary registry keys under their name-derived parent block:
 * the SHORTEST same-scope prefix that exists as a provides block (the
 * Packages list rule). Presentational grouping of REAL registry keys —
 * a secondary without its parent in this remote's provides stays a
 * top-level block.
 */
function groupSecondaries(entries: { scope: string; vm: ProvidesBlockVm }[]): ProvidesBlockVm[] {
  const byKey = new Map<string, ProvidesBlockVm>();
  for (const entry of entries) {
    const key = `${entry.scope}|${entry.vm.packageName}`;
    if (!byKey.has(key)) {
      byKey.set(key, entry.vm);
    }
  }
  const top: ProvidesBlockVm[] = [];
  for (const entry of entries) {
    const name = entry.vm.packageName;
    let parent: ProvidesBlockVm | null = null;
    let index = name.indexOf('/');
    while (index > 0 && index < name.length - 1) {
      const candidate = byKey.get(`${entry.scope}|${name.slice(0, index)}`);
      if (candidate !== undefined) {
        parent = candidate;
        break;
      }
      index = name.indexOf('/', index + 1);
    }
    if (parent === null || parent === entry.vm) {
      top.push(entry.vm);
    } else {
      parent.secondaries.push({ ...entry.vm, suffix: name.slice(parent.packageName.length) });
    }
  }
  return top;
}

/**
 * Canonical consumer-copy relations of this remote that no own claim backs
 * (`claimIds` empty): alias consumers of a shared scope URL and candidate-
 * less declarations still relate to the copies their bindings resolve to
 * (spec: a claim-less binding still relates). Claim-backed relations are
 * already rendered through the zones and private-registration rows.
 */
function relationOnlyOf(
  remote: RemoteEntity,
  model: FederationModel,
  indexes: CanonicalIndexes,
): RelationConsumerVm[] {
  const rows: RelationConsumerVm[] = [];
  for (const relation of model.resolutionProjection.consumerRelations) {
    if (relation.consumerRemote !== remote.name || relation.claimIds.length > 0) {
      continue;
    }
    const copy = indexes.copyById.get(relation.copyId);
    if (copy === undefined) {
      continue;
    }
    const source = copySourceVmOf(copy);
    rows.push({
      relationId: relation.id,
      packageName: copy.sourcePackage,
      copyTag: copy.resolvedTag,
      source: {
        label: source.display ?? source.label,
        note: `${source.label} — ${source.note}`,
      },
      bindings: relation.effectiveResolutionIds.flatMap((resolutionId) => {
        const resolution = indexes.resolutionById.get(resolutionId);
        return resolution?.status === 'mapped'
          ? [
              {
                resolutionId,
                specifier: resolution.specifier,
                file: targetFileName(resolution.targetUrl),
                targetUrl: resolution.targetUrl,
              },
            ]
          : [];
      }),
      note: 'this remote is a consumer of these mapped bindings without an own resolution claim in this capture (rule: consumer-copy-relation)',
    });
  }
  return rows;
}

function bundleStatusNote(status: BundleClaimStatus): string {
  switch (status) {
    case 'mapped-source':
      return `registered chunk list of this source's bundle — capture evidence, not proof of delivery`;
    case 'source-only':
      return 'the source names this bundle, but the capture registers no chunk list for it';
    case 'ambiguous':
      return 'ambiguous source — this remote is one candidate for the bundle; chunks are not attributed';
  }
}

/**
 * Muted serves tail of one deduped bundle row. The grounded full-list note
 * renders only when it ADDS something the visible tail does not already
 * say — truncated (`+N entries`) or suffix-shortened tails; a tooltip
 * repeating the visible text is noise (screenshot review 2).
 */
function servesOf(packages: string[]): { serves: string | null; servesNote: string | null } {
  const names = [...new Set(packages)].sort();
  if (names.length === 0) {
    return { serves: null, servesNote: null };
  }
  const display = names.map((name, index) =>
    index > 0 && name.startsWith(`${names[0]}/`) ? name.slice(names[0].length) : name,
  );
  const truncated = names.length > 2;
  const shortened = display.some((entry, index) => entry !== names[index]);
  return {
    serves: truncated
      ? `serves ${names[0]} +${names.length - 1} entries`
      : `serves ${display.join(', ')}`,
    servesNote:
      truncated || shortened
        ? `packages of the resolved copies claiming this bundle: ${names.join(', ')}`
        : null,
  };
}

/**
 * Chunk section from the canonical projection only: the bundle claims whose
 * evidenced source is this remote — deduped to ONE row per (bundle,
 * qualification) across the copies claiming it — else the remote's
 * pseudo-external carrier groups, else the honest absence. Equally
 * qualified claims of one bundle collapse (six copies, one row); a
 * DIFFERENTLY qualified claim keeps its own row: an ambiguous candidacy is
 * not the same fact as an exact chunk claim, and merging them would either
 * hide the ambiguity or contaminate the exact row (T8-H1 doctrine,
 * Codex review 2).
 */
function chunksOf(
  remote: RemoteEntity,
  display: string,
  model: FederationModel,
  indexes: CanonicalIndexes,
): RemoteChunkSectionVm {
  const projection = model.resolutionProjection;
  const claims = projection.bundleClaims.filter((claim) => claim.sourceRemote === remote.name);
  if (claims.length > 0) {
    const groups = new Map<
      string,
      { bundle: string; status: BundleClaimStatus; files: string[]; packages: string[] }
    >();
    for (const claim of claims) {
      const key = `${claim.bundle}|${claim.status}`;
      const group = groups.get(key) ?? {
        bundle: claim.bundle,
        status: claim.status,
        files: [],
        packages: [],
      };
      for (const groupId of claim.chunkGroupIds) {
        for (const file of indexes.chunkGroupById.get(groupId)?.files ?? []) {
          if (!group.files.includes(file)) {
            group.files.push(file);
          }
        }
      }
      const packageName = indexes.copyById.get(claim.copyId)?.sourcePackage;
      if (packageName !== undefined && packageName !== null) {
        group.packages.push(packageName);
      }
      groups.set(key, group);
    }
    return {
      level: 'bundle-claims',
      note: `${CHUNK_EXPLANATION} — one row per bundle, attributed through the canonical bundle claims of ${display}'s resolved copies; a differently qualified claim of the same bundle keeps its own row`,
      // Rows with a recorded chunk list first, list-less rows after
      // (bundle order within each) — presentation order only, the calmer
      // rhythm of the screenshot review; every claim stays qualified.
      rows: [...groups.values()]
        .sort(
          (a, b) =>
            Number(a.files.length === 0) - Number(b.files.length === 0) ||
            a.bundle.localeCompare(b.bundle) ||
            a.status.localeCompare(b.status),
        )
        .map((group) => ({
          key: `${group.bundle}|${group.status}`,
          bundle: group.bundle,
          status: group.status,
          statusNote: bundleStatusNote(group.status),
          fileClaim: chunkFileClaim(group.files),
          files: group.files,
          ...servesOf(group.packages),
        })),
      rule: 'canonical-bundle-claims',
    };
  }
  const carriers = projection.chunkGroups.filter(
    (group) => group.emitterRemote === remote.name && group.origin === 'scoped-pseudo-external',
  );
  if (carriers.length > 0) {
    return {
      level: 'carrier-groups',
      note: `${CHUNK_EXPLANATION} — chunks belong to ${display}; package attribution is not derivable in this capture`,
      groups: carriers.map((group) => ({
        groupId: group.id,
        label: group.pseudoPackage ?? group.bundleName ?? '(unnamed group)',
        fileClaim: countClaim(group.files.length, 'file'),
      })),
      rule: 'chunk-pseudo-externals',
    };
  }
  const unclaimed = projection.chunkGroups.some((group) => group.emitterRemote === remote.name);
  return {
    level: 'none',
    label: unclaimed ? 'none claimed in this capture' : 'none in this capture',
    note: unclaimed
      ? `chunk lists are recorded for ${display}, but no resolved copy claims them in this capture`
      : `no chunk evidence recorded for ${display} — the capture shows no chunk lists (dense-chunking capability absent)`,
    rule: 'no-chunk-evidence',
  };
}

/**
 * State chip of one private-registration claim (no share vocabulary). The
 * chip grounds on the claim's canonical `mappingState` — an attached
 * `copyId` only proves the binding MAPS, not that the registration's own
 * candidate is the binding (a private claim can be not-selected and still
 * point at the materialized copy).
 */
function scopedClaimStateOf(
  claim: DeclarationResolutionClaim,
  indexes: CanonicalIndexes,
): AnnotationVm {
  if (claim.copyId !== null) {
    if (claim.mappingState === 'own-selected') {
      return {
        label: 'own mapping',
        note: 'the registration’s own candidate is the effective import-map binding of its owner — private domain, no share action, no share scope',
      };
    }
    if (claim.mappingState === 'not-selected') {
      return {
        label: 'not selected',
        note: 'the registration’s own candidate is not the effective binding in this capture — the binding resolves to another copy',
      };
    }
    return {
      label: claim.mappingState,
      note: 'canonical mapping state of this private claim, recorded verbatim',
    };
  }
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
  return { label: 'unknown', note: 'mapping state not derivable from the captured evidence' };
}

/**
 * True private registrations of this remote with their full canonical
 * paths. Chunk-carrier pseudo packages (identified via the projection's
 * `scoped-pseudo-external` groups, never by name convention) stay in the
 * chunk section and are excluded here.
 */
function scopedOf(
  remote: RemoteEntity,
  display: string,
  model: FederationModel,
  indexes: CanonicalIndexes,
): ScopedPackageVm[] {
  const carrierPackages = new Set(
    model.resolutionProjection.chunkGroups
      .filter((group) => group.origin === 'scoped-pseudo-external')
      .map((group) => group.pseudoPackage)
      .filter((name): name is string => name !== null),
  );
  const claimsByRegistration = new Map<string, DeclarationResolutionClaim[]>();
  for (const claim of model.resolutionProjection.declarationResolutionClaims) {
    if (claim.subject.kind !== 'private') {
      continue;
    }
    const id = claim.subject.privateRegistrationId;
    claimsByRegistration.set(id, [...(claimsByRegistration.get(id) ?? []), claim]);
  }
  return model.registryEvidence.privateRegistrations
    .filter(
      (registration) =>
        registration.ownerRemote === remote.name && !carrierPackages.has(registration.packageName),
    )
    .map((registration) => ({
      registrationId: registration.id,
      packageName: registration.packageName,
      tag: registration.tag,
      bundle: registration.bundle,
      domainNote: `private registration of ${display} — resolved in its own private domain, no share action, no share scope`,
      claims: (claimsByRegistration.get(registration.id) ?? []).map((claim) => {
        const resolution = indexes.resolutionById.get(claim.effectiveResolutionId);
        const targetUrl = resolution?.status === 'mapped' ? resolution.targetUrl : null;
        const copy = claim.copyId === null ? undefined : indexes.copyById.get(claim.copyId);
        return {
          claimId: claim.id,
          specifier: claim.specifier,
          state: scopedClaimStateOf(claim, indexes),
          file: targetUrl === null ? null : targetFileName(targetUrl),
          targetUrl,
          copyTag: copy?.resolvedTag ?? null,
        };
      }),
    }));
}

/**
 * Distinct declarations of the remote whose claims resolve nowhere in this
 * capture (candidate-less, claim without a copy, or missing copy evidence)
 * — the grounding of the list's `⚠` marker.
 */
export function unresolvedDeclarationCount(
  remoteName: string,
  model: FederationModel,
  indexes: CanonicalIndexes,
): number {
  let count = 0;
  for (const declaration of model.registryEvidence.participantDeclarations) {
    if (declaration.participant !== remoteName) {
      continue;
    }
    const registration = indexes.registrationById.get(declaration.versionRegistrationId);
    const external =
      registration === undefined
        ? undefined
        : indexes.sharedExternalById.get(registration.sharedExternalId);
    if (registration === undefined || external === undefined) {
      continue;
    }
    const claims = indexes.claimsByDeclaration.get(declaration.id) ?? [];
    if (
      claims.length === 0 ||
      claims.some((claim) => claim.copyId === null || !indexes.copyById.has(claim.copyId))
    ) {
      count += 1;
    }
  }
  return count;
}

/** Divergence-only footer (Packages pattern) — silent otherwise. */
function diagnosticsOf(
  provides: ProvidesBlockVm[],
  unresolved: RemoteUnresolvedRowVm[],
): AnnotationVm[] {
  const diagnostics: AnnotationVm[] = [];
  const unknownStates = unresolved.filter((row) => row.state.label === 'unknown').length;
  if (unknownStates > 0) {
    diagnostics.push({
      label: `unknown states: ${unknownStates}`,
      note: `${countClaim(unknownStates, 'declaration claim')} without a derivable mapping state in this capture`,
    });
  }
  const allBlocks = provides.flatMap((block) => [block, ...block.secondaries]);
  const unknownTags = allBlocks.filter((block) => block.resolvedTag === null).length;
  if (unknownTags > 0) {
    diagnostics.push({
      label: `unknown tags: ${unknownTags}`,
      note: `${countClaim(unknownTags, 'provided copy', 'provided copies')} without a uniquely evidenced source tag`,
    });
  }
  return diagnostics;
}

export function buildRemoteDetail(
  model: FederationModel,
  indexes: CanonicalIndexes,
  selectedName: string | null,
): RemoteDetailVm | null {
  const remote =
    selectedName === null
      ? null
      : (model.remotes.find((candidate) => candidate.name === selectedName) ?? null);
  if (remote === null) {
    return null;
  }
  const display = participantDisplay(remote.name);
  const zones = zonesOf(remote, model, indexes);
  return {
    name: remote.name,
    display,
    host: remote.isHost,
    scopeUrl: remote.scopeUrl,
    resolvedScopeUrl: remote.resolvedScopeUrl,
    capabilities: capabilitiesOf(remote, model),
    exposes: exposesOf(remote),
    provides: zones.provides,
    consumes: zones.consumes,
    relationOnly: relationOnlyOf(remote, model, indexes),
    unresolved: zones.unresolved,
    chunks: chunksOf(remote, display, model, indexes),
    scoped: scopedOf(remote, display, model, indexes),
    diagnostics: diagnosticsOf(zones.provides, zones.unresolved),
  };
}
