/**
 * Detail half of the Remotes vm builder: one remote's identity, flat-build warnings and exposes, where
 * each of its packages runs from and whom its builds serve (`remotes-runs-vm.ts`), then what
 * only some captures carry — private registrations, claim-less consumer relations, chunks.
 *
 * Everything joins the canonical read surface — `model.resolutionProjection`,
 * `model.effectiveConsumerResolutions`, `model.registryEvidence` — by ID
 * only. Nothing re-derives elections, share counts, or source semantics.
 */
import type { FederationModel, RemoteEntity } from '../../shared/store/federation-model';
import type { BundleClaimStatus, DeclarationResolutionClaim } from '../../shared/store/resolution';
import {
  CanonicalIndexes,
  chunkFileClaim,
  copySourceVmOf,
  countClaim,
  participantDisplay,
  targetFileName,
} from '../../shared/view-conventions';
import { RunsVm, buildRuns } from './remotes-runs-vm';

/** One annotated fact — state chip or grounded note. */
export interface AnnotationVm {
  label: string;
  /** Grounded reason (tooltip); every annotation carries one. */
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
  /** Derived like the orchestrator does (`join(scopeUrl, 'remoteEntry.json')`): only the scope is stored. */
  remoteEntryUrl: string;
  /** Build settings the capture proves are flat; empty when nothing is proven. */
  warnings: AnnotationVm[];
  exposes: ExposeVm[];
  runs: RunsVm;
  /** Consumer-copy relations without an own claim. */
  relationOnly: RelationConsumerVm[];
  chunks: RemoteChunkSectionVm;
  scoped: ScopedPackageVm[];
  /** Muted divergence footer; empty renders nothing. */
  diagnostics: AnnotationVm[];
}

const CHUNK_EXPLANATION = "code shared between this remote's exposes, plus lazy modules";

// Chunk lists and `bundle` are both written only under `features.denseChunking` (see
// docs/work/share-pools/plan.md, persisted-evidence table). Flat externals show only when a
// secondary entrypoint is registered as its own external; single-entry packages look the same
// either way, so they prove nothing.
function warningsOf(
  remote: RemoteEntity,
  model: FederationModel,
  indexes: CanonicalIndexes,
): AnnotationVm[] {
  const evidence = model.registryEvidence;
  const declarations = evidence.participantDeclarations.filter(
    (d) => d.participant === remote.name,
  );
  if (declarations.length === 0) return [];
  const warnings: AnnotationVm[] = [];

  const keys = new Set<string>();
  for (const declaration of declarations) {
    const registration = indexes.registrationById.get(declaration.versionRegistrationId);
    const external = registration && indexes.sharedExternalById.get(registration.sharedExternalId);
    if (external) keys.add(`${external.shareScope}|${external.packageName}`);
  }
  const secondaries = [...keys].filter((key) => {
    for (let i = key.indexOf('/', key.indexOf('|')); i > 0; i = key.indexOf('/', i + 1)) {
      if (keys.has(key.slice(0, i))) return true;
    }
    return false;
  });
  if (secondaries.length > 0) {
    const names = secondaries.map((key) => key.slice(key.indexOf('|') + 1));
    warnings.push({
      label: 'flat externals',
      note: [
        `${countClaim(names.length, 'secondary entrypoint')} registered as ${names.length === 1 ? 'its own external' : 'their own externals'}: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ', …' : ''}`,
        'each carries its own version and flags; one that disagrees splits the package, and a split package falls back as a whole (native-federation#176)',
        'config: features.denseExternals: true, default false, since core v4.3.0',
      ].join('\n'),
    });
  }

  const ownRegistrations = [
    ...declarations,
    ...evidence.privateRegistrations.filter((r) => r.ownerRemote === remote.name),
  ];
  const chunked =
    model.resolutionProjection.chunkGroups.some(
      (group) => group.emitterRemote === remote.name && group.origin === 'shared-chunks',
    ) || ownRegistrations.some((registration) => registration.bundle !== null);
  if (!chunked) {
    warnings.push({
      label: 'flat chunking',
      note: [
        'the registry records no chunk lists or bundles for this remote',
        "its shared chunks can't be attributed to a package",
        'config: features.denseChunking: true, default false, since core v4.0.0',
      ].join('\n'),
    });
  }
  return warnings;
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

/** Divergence-only footer (Packages pattern) — silent otherwise. */
function diagnosticsOf(runs: RunsVm): AnnotationVm[] {
  const unknown = runs.rows.filter(
    (row) => row.kind === 'unresolved' && row.from.label === 'unknown',
  );
  return unknown.length === 0
    ? []
    : [
        {
          label: `unknown states: ${unknown.length}`,
          note: `${countClaim(unknown.length, 'declaration')} without a derivable mapping state in this capture`,
        },
      ];
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
  const runs = buildRuns(remote, model, indexes);
  return {
    name: remote.name,
    display,
    host: remote.isHost,
    scopeUrl: remote.scopeUrl,
    resolvedScopeUrl: remote.resolvedScopeUrl,
    remoteEntryUrl: `${remote.resolvedScopeUrl.replace(/\/?$/, '/')}remoteEntry.json`,
    warnings: warningsOf(remote, model, indexes),
    exposes: exposesOf(remote),
    runs,
    relationOnly: relationOnlyOf(remote, model, indexes),
    chunks: chunksOf(remote, display, model, indexes),
    scoped: scopedOf(remote, display, model, indexes),
    diagnostics: diagnosticsOf(runs),
  };
}
