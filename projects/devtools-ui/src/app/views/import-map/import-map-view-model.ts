/**
 * Import Map view model — the raw evidence view (spec 4.3): unchanged in
 * role, demoted as a destination, promoted as a data source. Sections
 * render the store's flattened effective map verbatim in map order
 * (GLOBAL IMPORTS first, then one section per scope prefix); every
 * annotation joins the canonical read surface — the view derives nothing
 * itself. A row is annotated by the effective consumer resolutions whose
 * recorded map-entry provenance IS this row (mapped and blocked), their
 * declaration resolution claims, the resolved copy with its qualified
 * source, the copy's bundle claims, recorded chunk groups whose files
 * resolve to the row's target, and the ingest's expose join. Several
 * consumers or claims annotate one row; they never duplicate it. Honest
 * outcomes stay visible: ambiguity renders as ambiguity, a foreign-origin
 * target states "unattributable", a row no canonical binding resolves
 * through simply carries no resolution claim — never a guessed owner.
 * Unmapped and unknown resolutions carry no map-entry provenance by
 * definition: they annotate nothing here and never invent a row (their
 * distinguishable rendering lives in Remotes/Packages; aggregation is
 * Task-10 diagnostics territory).
 *
 * Within a section, rows regroup into evidence homes (T9.5): `EXPOSES`,
 * annotation-signature groups (global section only), ungrouped rows,
 * `CHUNK WIRING` (collapsed by default), and `UNREFERENCED`. A row's home
 * derives from its canonical joins with precedence expose > chunk >
 * package — the precedence decides the grouping home only; annotations
 * never drop from a row. A group head factors the annotation its rows
 * share (source, bundle, qualifier, uniform SRI) exactly once; qualified
 * language moves into the head verbatim, it never disappears into
 * membership. Order invariant (supersedes the T9 map-order clause): the
 * rendered triples are a deterministic permutation of the recorded
 * entries — sections in map first-appearance order, homes in the fixed
 * order above, signature groups by first appearance, rows in map order
 * within every home. Map order carries no resolution semantics; Export
 * JSON keeps the artifact verbatim.
 *
 * Inputs are the store's model plus caller-owned UI state; the output is
 * render-ready only: templates consume these rows, never store types
 * (XC-06).
 */
import type { FederationModel, ImportMapEntryRow } from '../../shared/store/federation-model';
import { resolveUrl } from '../../shared/store/merge-document-maps';
import type {
  BundleClaimId,
  ClaimMappingState,
  DeclarationResolutionClaim,
  DeclarationResolutionClaimId,
  EffectiveConsumerResolution,
  EffectiveConsumerResolutionId,
  ResolvedDependencyCopy,
  ResolvedDependencyCopyId,
} from '../../shared/store/resolution';
import {
  CanonicalIndexes,
  buildCanonicalIndexes,
  copySourceVmOf,
  countClaim,
  isHostRemote,
  packageId,
  participantDisplay,
} from '../../shared/view-conventions';

/** Caller-owned UI state — the `select` payload seeds row highlighting. */
export interface ImportMapUiState {
  /** Specifier payload (cross-link convention); `/./` infixes tolerated. */
  selected: string | null;
}

/** The V1 honesty caption, verbatim (spec 4.3). */
export const IMPORT_MAP_CAPTION =
  'This layer proves resolution only — an import-mapped file is not necessarily requested, and a requested file is not proof of execution.';

/**
 * Qualified source language of one row's resolved copy — the shared T7
 * ladder plus `unattributable` for targets whose observed attribution is
 * a CDN/foreign origin (kept distinct from `unknown-source`).
 */
export type RowSourceQualifier =
  | 'exact-target-source'
  | 'explicit-anchor'
  | 'observed-target-source'
  | 'ambiguous-source'
  | 'unattributable'
  | 'unknown-source';

/** The resolved copy annotation of a row — qualified source, never bare. */
export interface RowSourceVm {
  copyId: ResolvedDependencyCopyId;
  /** Display form of the source remote; null when no source is evidenced. */
  display: string | null;
  host: boolean;
  /** `select` payload for the /remotes cross-link; null without a remote. */
  remoteSelect: string | null;
  qualifier: RowSourceQualifier;
  label: string;
  note: string;
}

/** One consumer claim annotating a row (state vocabulary shared with T7/T8). */
export interface RowClaimVm {
  claimId: DeclarationResolutionClaimId;
  consumer: string;
  display: string;
  host: boolean;
  /** Verbatim `select` payload for the /remotes cross-link. */
  select: string;
  state: ClaimMappingState;
  /** Exact own-candidate/target equality (claim evidence); null when not evaluable. */
  ownCandidateSelected: boolean | null;
  /** Speaking state word; `own-selected` renders as 'selected'. */
  stateLabel: string;
  note: string;
  /**
   * True for the unmarked norm: a single own-selected claim restates the
   * row itself — only exceptions speak (T10 doctrine). Multi-claim rows
   * always speak so annotation multiplicity stays visible.
   */
  quiet: boolean;
}

/** A consumer whose binding resolves through the row without an own claim. */
export interface RowConsumerVm {
  consumer: string;
  display: string;
  host: boolean;
  select: string;
  note: string;
}

/** One bundle claim of the row's copy; only `mapped-source` renders plain. */
export interface RowBundleVm {
  bundleClaimId: BundleClaimId;
  /** The bundle name. */
  label: string;
  status: 'mapped-source' | 'source-only' | 'ambiguous';
  /** True when the status must render visibly next to the label. */
  qualified: boolean;
  /** `select` payload of the claim's source remote; null under ambiguity. */
  select: string | null;
  note: string;
}

/** Recorded chunk-group attribution of a row (canonical chunk groups). */
export interface RowChunkVm {
  emitterRemote: string;
  display: string;
  host: boolean;
  /** Verbatim `select` payload for the /remotes cross-link. */
  select: string;
  /** Group label — the bundle name, or the pseudo package for v4.5 groups. */
  groupLabel: string;
  /** Annotation noun: 'bundle'/'bundles' with bundle names, 'chunk group' otherwise. */
  groupNoun: 'bundle' | 'bundles' | 'chunk group';
  note: string;
}

/** The ingest's expose join: this row's target is a recorded exposed module. */
export interface RowExposeVm {
  remote: string;
  display: string;
  host: boolean;
  select: string;
  moduleName: string;
  note: string;
}

/** Blocked-binding annotation — the matching entry terminally blocks lookups. */
export interface RowBlockedVm {
  reasons: string[];
  note: string;
}

export interface ImportMapRowVm {
  specifier: string;
  /** Verbatim target URL (tooltip evidence). */
  target: string;
  /**
   * Display form: relative to the page base — the verbatim URL stays one
   * hover away. A foreign-origin target keeps its absolute URL and
   * visibly stands out (honest signal, matches `unattributable`).
   */
  targetDisplay: string;
  hasIntegrity: boolean;
  /** Every effective resolution whose recorded map entry is this row. */
  resolutionIds: EffectiveConsumerResolutionId[];
  /** Resolved copies materializing this row's binding (one per copy ID). */
  sources: RowSourceVm[];
  /**
   * True when the sources merely restate the scope-section owner with an
   * exact qualifier — the header carries the claim, the row stays quiet
   * (only exceptions speak). Always false in the global section.
   */
  sourceQuiet: boolean;
  claims: RowClaimVm[];
  /** Consumers of the row's resolutions no claim covers (relation-only). */
  claimlessConsumers: RowConsumerVm[];
  bundles: RowBundleVm[];
  /** One annotation per emitter — emitter-distinct groups never merge. */
  chunks: RowChunkVm[];
  /** Every recorded exposed module whose map target is this row's target. */
  exposes: RowExposeVm[];
  blocked: RowBlockedVm | null;
  /** `/packages?select=` payload of the claimed registry package, where unique. */
  packageSelect: string | null;
  /**
   * A global entry maps the same specifier to a different target — for
   * modules resolved under this scope URL, this entry takes precedence.
   * Map-structural evidence only (`importMapEntries` vs
   * `importMapEntries`); no resolution or execution claim. Always false
   * on global rows and for same-target duplicates.
   */
  overridesGlobal: boolean;
  selected: boolean;
}

/** Fixed tooltip of the `overrides global` marker (scope precedence). */
export const OVERRIDES_GLOBAL_NOTE =
  'a global entry maps this specifier to a different target — for modules resolved under this scope URL, this entry takes precedence (rule: scope-precedence)';

/** Section-count tooltip — the raw-pivot/order contract of this view. */
export const IMPORT_MAP_SECTION_CONTRACT =
  'one row per recorded (scope, specifier, target) entry, grouped by its resolution evidence — recorded map order carries no resolution semantics; Export JSON preserves the artifact verbatim. Sources stay qualified; nothing claims requests or execution.';

/** One factored source fact of a signature-group head (set semantics). */
export interface GroupSourceVm {
  /** Display form of the source remote; null when no source is evidenced. */
  display: string | null;
  host: boolean;
  /** `select` payload for the /remotes cross-link; null without a remote. */
  remoteSelect: string | null;
  qualifier: RowSourceQualifier;
  label: string;
  /** Fixed factoring string per qualifier — never a per-copy tag. */
  note: string;
}

/** One factored bundle fact of a signature-group head (set semantics). */
export interface GroupBundleVm {
  label: string;
  status: 'mapped-source' | 'source-only' | 'ambiguous';
  qualified: boolean;
  select: string | null;
  /** Fixed factoring string per status — never a per-claim id. */
  note: string;
}

export type ImportMapGroupKind =
  'exposes' | 'signature' | 'ungrouped' | 'chunk-wiring' | 'unreferenced';

/**
 * Home label of the package home (screenshot round 1): signature groups
 * and ungrouped package rows share one `PACKAGES` head — the counterpart
 * of the `EXPOSES`/`CHUNK WIRING`/`UNREFERENCED` kind words. Carried by
 * the FIRST group of the home; the count spans the whole home.
 */
export interface PackagesHomeHeadVm {
  /** e.g. "20 entries" — every package-kind row of the section. */
  countClaim: string;
  note: string;
}

/**
 * One evidence home of a section. A group head renders the annotation its
 * rows share exactly once; membership claims nothing beyond what each row
 * already said. `ungrouped` renders no head — its rows keep the full
 * per-row channel and always self-mark integrity.
 */
export interface ImportMapGroupVm {
  kind: ImportMapGroupKind;
  /** Head count claim; the exposes head renders the bare number. */
  countClaim: string;
  /**
   * Uniform integrity hoisted into the head: true = `SRI ✓`, false =
   * `no SRI`, null = mixed or headless — the rows mark themselves.
   */
  integrityHoist: boolean | null;
  /** Factored source facts of a signature head; empty on other kinds. */
  sources: GroupSourceVm[];
  /** Factored bundle facts of a signature head; empty on other kinds. */
  bundles: GroupBundleVm[];
  /**
   * Collapsed chunk-wiring summary, e.g. "in 3 bundles" (screenshot
   * round 3 — counts, not label lists); null on other kinds.
   */
  bundleSummary: string | null;
  /**
   * Bundle names behind the summary, one hover away; null when the
   * tooltip would add nothing (pseudo-package groups restate their
   * specifiers on the expanded rows).
   */
  bundleSummaryNote: string | null;
  /** True when the group holds the selected row (fold auto-expansion). */
  containsSelection: boolean;
  /** Grounded head tooltip of the kind groups; null on signature/ungrouped. */
  note: string | null;
  /** The `PACKAGES` home label, on the home's first group; null elsewhere. */
  packagesHead: PackagesHomeHeadVm | null;
  rows: ImportMapRowVm[];
}

/**
 * Scope-section identity — remotes whose registered (resolved) scope URL
 * equals the section's scope prefix. An identity join, never a
 * most-specific election; a scope no registered remote matches carries no
 * owner claim. Per the pooling doctrine a consumer scope only names the
 * CONSUMER — where its rows resolve is said per row, never here.
 */
export type SectionOwnerVm =
  | {
      kind: 'remote';
      remote: string;
      display: string;
      host: boolean;
      select: string;
      note: string;
    }
  | {
      kind: 'shared-scope-url';
      remotes: { remote: string; display: string; host: boolean; select: string }[];
      note: string;
    };

export interface ImportMapSectionVm {
  kind: 'global' | 'scope';
  /** 'GLOBAL IMPORTS', or the scope prefix verbatim. */
  label: string;
  scope: string | null;
  /** Scope-URL identity of a scope section; null on global or without a match. */
  owner: SectionOwnerVm | null;
  /** e.g. "22 entries". */
  countClaim: string;
  /** Evidence homes in fixed order; every recorded row lives in exactly one. */
  groups: ImportMapGroupVm[];
}

export interface ImportMapVm {
  sections: ImportMapSectionVm[];
  caption: string;
  /** Honest empty state; null while the map has entries. */
  emptyNote: string | null;
}

const GLOBAL_LABEL = 'GLOBAL IMPORTS';

/** Select matching tolerates the literal `/./` infix (same rule as the ingest expose join). */
function collapseDotInfix(specifier: string): string {
  return specifier.replace(/\/\.\//g, '/');
}

/**
 * Row identity — the exact recorded map entry (scope, specifier, target)
 * as a structural JSON tuple: delimiter-safe, and a null scope never
 * collides with an empty-string scope.
 */
function rowKey(scope: string | null, specifier: string, target: string): string {
  return JSON.stringify([scope, specifier, target]);
}

const STATE_LABELS: Record<ClaimMappingState, string> = {
  'own-selected': 'selected',
  'not-selected': 'not selected',
  anchored: 'anchored',
  fallback: 'fallback',
  blocked: 'blocked',
  unknown: 'unknown',
};

const STATE_NOTES: Record<ClaimMappingState, string> = {
  'own-selected': 'its own candidate URL is the resolved target of this entry',
  'not-selected':
    'its own candidate is not the selected target — the binding still resolves through this entry',
  anchored: 'an explicit servedBy anchor selects this target',
  fallback: 'the binding resolves to the elected shared copy through this entry',
  blocked: 'the matching entry terminally blocks this binding',
  unknown: 'mapping state not derivable from the captured evidence',
};

function claimVmOf(claim: DeclarationResolutionClaim): RowClaimVm {
  const display = participantDisplay(claim.consumerRemote);
  const domain =
    claim.resolutionDomain.kind === 'share-scope'
      ? `share scope ${claim.resolutionDomain.name}`
      : `private registration of ${participantDisplay(claim.resolutionDomain.remote)}`;
  return {
    claimId: claim.id,
    consumer: claim.consumerRemote,
    display,
    host: isHostRemote(claim.consumerRemote),
    select: claim.consumerRemote,
    state: claim.mappingState,
    ownCandidateSelected: claim.ownCandidateSelected,
    stateLabel: STATE_LABELS[claim.mappingState],
    note: `claim of ${display} under ${domain} for '${claim.specifier}' — ${STATE_NOTES[claim.mappingState]} (rule: declaration-resolution claim)`,
    quiet: false,
  };
}

/**
 * Qualified source of one copy — the shared ladder, refined with the
 * `unattributable` outcome the copy's observed attribution evidences (a
 * CDN/foreign origin is an honest external URL, not an unknown).
 */
function rowSourceOf(copy: ResolvedDependencyCopy): RowSourceVm {
  const ladder = copySourceVmOf(copy);
  const unattributable =
    ladder.qualifier === 'unknown-source' &&
    copy.observedTargetProviders.some((provider) => provider.outcome === 'unattributable');
  const vm: Omit<RowSourceVm, 'copyId'> = unattributable
    ? {
        display: ladder.display,
        host: ladder.host,
        remoteSelect: ladder.remoteSelect,
        qualifier: 'unattributable',
        label: 'unattributable',
        note: 'no registry scope matches this target — CDN or foreign origin (rule: scope-prefix-match)',
      }
    : ladder;
  return {
    copyId: copy.id,
    ...vm,
    note: copy.resolvedTag === null ? vm.note : `${vm.note}; resolved tag ${copy.resolvedTag}`,
  };
}

function bundleVmOf(bundleClaimId: BundleClaimId, indexes: CanonicalIndexes): RowBundleVm | null {
  const claim = indexes.bundleClaimById.get(bundleClaimId);
  if (claim === undefined) {
    return null;
  }
  const notes: Record<RowBundleVm['status'], string> = {
    'mapped-source': `bundle of the selected source ${
      claim.sourceRemote === null ? '' : participantDisplay(claim.sourceRemote)
    } — registered chunk groups back it (rule: bundle-claim)`,
    'source-only': `bundle declared by the selected source ${
      claim.sourceRemote === null ? '' : participantDisplay(claim.sourceRemote)
    } — no registered chunk group backs it in this capture (rule: bundle-claim)`,
    ambiguous: 'bundle of an ambiguous candidate source — no source is chosen (rule: bundle-claim)',
  };
  return {
    bundleClaimId,
    label: claim.bundle,
    status: claim.status,
    qualified: claim.status !== 'mapped-source',
    select: claim.sourceRemote,
    note: notes[claim.status],
  };
}

interface ChunkJoin {
  emitterRemote: string;
  bundleName: string | null;
  pseudoPackage: string | null;
}

function chunkVmsOf(joins: ChunkJoin[] | undefined): RowChunkVm[] {
  if (joins === undefined) {
    return [];
  }
  // Emitter-aware: equal chunk filenames from different emitters never
  // merge (T6 doctrine) — one annotation per emitter. Within ONE emitter
  // several groups can record one file (registry evidence, e.g. one
  // esbuild chunk in two bundle lists) — the label names them all, never
  // silently just the first.
  const byEmitter = new Map<string, ChunkJoin[]>();
  for (const join of joins) {
    byEmitter.set(join.emitterRemote, [...(byEmitter.get(join.emitterRemote) ?? []), join]);
  }
  return [...byEmitter.entries()].map(([emitterRemote, emitterJoins]) => {
    const display = participantDisplay(emitterRemote);
    const labels = [
      ...new Set(
        emitterJoins.map((join) => join.bundleName ?? join.pseudoPackage ?? 'chunk group'),
      ),
    ];
    const hasBundle = emitterJoins.some((join) => join.bundleName !== null);
    return {
      emitterRemote,
      display,
      host: isHostRemote(emitterRemote),
      select: emitterRemote,
      groupLabel: labels.join(' · '),
      groupNoun: hasBundle ? (labels.length > 1 ? 'bundles' : 'bundle') : 'chunk group',
      note: `recorded chunk file of ${display} — the file resolves to this entry's target (rule: chunk-group join)`,
    };
  });
}

/** Canonical row joins, built once per vm from the three façade surfaces. */
interface RowJoins {
  resolutionsByRow: Map<string, EffectiveConsumerResolution[]>;
  claimsByResolution: Map<EffectiveConsumerResolutionId, DeclarationResolutionClaim[]>;
  copiesByResolution: Map<EffectiveConsumerResolutionId, ResolvedDependencyCopy[]>;
  chunksByTarget: Map<string, ChunkJoin[]>;
  exposesByTarget: Map<string, RowExposeVm[]>;
}

function buildRowJoins(model: FederationModel): RowJoins {
  const projection = model.resolutionProjection;

  const resolutionsByRow = new Map<string, EffectiveConsumerResolution[]>();
  for (const resolution of model.effectiveConsumerResolutions) {
    if (resolution.mapEntry === null) {
      continue;
    }
    const key = rowKey(
      resolution.mapEntry.scope,
      resolution.mapEntry.specifier,
      resolution.mapEntry.target,
    );
    resolutionsByRow.set(key, [...(resolutionsByRow.get(key) ?? []), resolution]);
  }

  const claimsByResolution = new Map<EffectiveConsumerResolutionId, DeclarationResolutionClaim[]>();
  for (const claim of projection.declarationResolutionClaims) {
    claimsByResolution.set(claim.effectiveResolutionId, [
      ...(claimsByResolution.get(claim.effectiveResolutionId) ?? []),
      claim,
    ]);
  }

  const copiesByResolution = new Map<EffectiveConsumerResolutionId, ResolvedDependencyCopy[]>();
  for (const copy of projection.copies) {
    for (const resolutionId of copy.effectiveResolutionIds) {
      copiesByResolution.set(resolutionId, [...(copiesByResolution.get(resolutionId) ?? []), copy]);
    }
  }

  // Canonical chunk groups joined by resolved file URL — the emitter's
  // registered scope URL is the base (page base when the emitter is not
  // in the remotes projection), reproducing the ingest's join rule.
  const scopeUrlByRemote = new Map(
    projection.remotes.map((remote) => [remote.name, remote.resolvedScopeUrl]),
  );
  const chunksByTarget = new Map<string, ChunkJoin[]>();
  for (const group of projection.chunkGroups) {
    const base = scopeUrlByRemote.get(group.emitterRemote) ?? model.provenance.pageUrl;
    for (const file of group.files) {
      const target = resolveUrl(file, base);
      chunksByTarget.set(target, [
        ...(chunksByTarget.get(target) ?? []),
        {
          emitterRemote: group.emitterRemote,
          bundleName: group.bundleName,
          pseudoPackage: group.pseudoPackage,
        },
      ]);
    }
  }

  // The ingest's expose join (`mapTarget`): a row whose target is a
  // recorded exposed module names its remote — registry evidence, no
  // delivery claim.
  const exposesByTarget = new Map<string, RowExposeVm[]>();
  for (const remote of model.remotes) {
    for (const expose of remote.exposes) {
      if (expose.mapTarget === null) {
        continue;
      }
      const display = participantDisplay(remote.name);
      exposesByTarget.set(expose.mapTarget, [
        ...(exposesByTarget.get(expose.mapTarget) ?? []),
        {
          remote: remote.name,
          display,
          host: remote.isHost,
          select: remote.name,
          moduleName: expose.moduleName,
          note: `recorded exposed module '${expose.moduleName}' of ${display} (rule: expose join)`,
        },
      ]);
    }
  }

  return {
    resolutionsByRow,
    claimsByResolution,
    copiesByResolution,
    chunksByTarget,
    exposesByTarget,
  };
}

/** `/packages?select=` payload — unique claimed share-scope registry package. */
function packageSelectOf(
  entry: ImportMapEntryRow,
  claims: DeclarationResolutionClaim[],
): string | null {
  const payloads = new Set(
    claims
      .filter(
        (claim) =>
          claim.resolutionDomain.kind === 'share-scope' && claim.specifier === entry.specifier,
      )
      .map((claim) =>
        claim.resolutionDomain.kind === 'share-scope'
          ? packageId(claim.resolutionDomain.name, claim.consumerRegistryPackage)
          : '',
      ),
  );
  return payloads.size === 1 ? [...payloads][0] : null;
}

function blockedVmOf(resolutions: EffectiveConsumerResolution[]): RowBlockedVm | null {
  const reasons = [
    ...new Set(
      resolutions.flatMap((resolution) =>
        resolution.status === 'blocked' ? [resolution.blockedReason] : [],
      ),
    ),
  ].sort();
  if (reasons.length === 0) {
    return null;
  }
  return {
    reasons,
    note: `the matching import-map entry terminally blocks this binding (${reasons.join(', ')})`,
  };
}

/**
 * Fixed factoring strings of the signature heads — the doctrine sentence
 * per qualifier, never a per-copy tag (the resolved tag stays on the row
 * VMs and reaches the user via the specifier's /packages cross-link).
 */
const HEAD_SOURCE_NOTES: Record<RowSourceQualifier, string> = {
  'exact-target-source':
    'uniquely evidenced source record — its candidate URL matches the resolved target exactly',
  'explicit-anchor': 'selected through an explicit servedBy anchor of the registry evidence',
  'observed-target-source': 'attributed by scope-prefix match — not an exact candidate match',
  'ambiguous-source': 'several candidate sources match this target — none is chosen',
  unattributable:
    'no registry scope matches this target — CDN or foreign origin (rule: scope-prefix-match)',
  'unknown-source': 'only the resolved URL is evidenced — no source record or scope prefix matches',
};

const HEAD_BUNDLE_NOTES: Record<GroupBundleVm['status'], string> = {
  'mapped-source':
    'bundle of the selected source — registered chunk groups back it (rule: bundle-claim)',
  'source-only':
    'bundle declared by the selected source — no registered chunk group backs it in this capture (rule: bundle-claim)',
  ambiguous: 'bundle of an ambiguous candidate source — no source is chosen (rule: bundle-claim)',
};

const GROUP_NOTES: Partial<Record<ImportMapGroupKind, string>> = {
  exposes:
    'import-map entries whose targets are recorded exposed modules (rule: expose join) — registry evidence, no delivery claim',
  'chunk-wiring':
    'import-map entries wiring internal chunk specifiers — the delivery wiring of the recorded bundles; the chunk evidence itself lives on the Remotes page',
  unreferenced:
    'no canonical evidence references these entries — no consumer resolution, no expose, no chunk group; the map records them, nothing explains them (honest absence, never a guessed owner)',
};

/** Fixed tooltip of the `PACKAGES` home label (kind derivation). */
const PACKAGES_HOME_NOTE =
  'import-map entries at least one effective consumer resolution resolves through — grouped by the resolution evidence their rows share; a row’s home derives from its canonical joins (precedence: expose > chunk > package)';

/**
 * Signature equality is exactly the rendered head facts: the SET of
 * `(remoteSelect, host, qualifier)` over the row's sources plus the SET
 * of `(label, status, select)` over its bundles. Copy IDs, bundle-claim
 * IDs, resolved tags, and note strings are excluded — several copies of
 * one source share a group; two rows differing in any keyed fact never
 * merge. An empty signature (no copy, no bundle) has no head to share —
 * those rows render ungrouped.
 */
function signatureKeyOf(row: ImportMapRowVm): string {
  const sources = [
    ...new Set(
      row.sources.map((source) =>
        JSON.stringify([source.remoteSelect, source.host, source.qualifier]),
      ),
    ),
  ].sort();
  const bundles = [
    ...new Set(
      row.bundles.map((bundle) => JSON.stringify([bundle.label, bundle.status, bundle.select])),
    ),
  ].sort();
  return JSON.stringify([sources, bundles]);
}

/** Factored head facts of one signature group, deduped in first-row order. */
function signatureFactsOf(rows: ImportMapRowVm[]): {
  sources: GroupSourceVm[];
  bundles: GroupBundleVm[];
} {
  const sources = new Map<string, GroupSourceVm>();
  const bundles = new Map<string, GroupBundleVm>();
  for (const row of rows) {
    for (const source of row.sources) {
      const key = JSON.stringify([source.remoteSelect, source.host, source.qualifier]);
      if (!sources.has(key)) {
        sources.set(key, {
          display: source.display,
          host: source.host,
          remoteSelect: source.remoteSelect,
          qualifier: source.qualifier,
          label: source.label,
          note: HEAD_SOURCE_NOTES[source.qualifier],
        });
      }
    }
    for (const bundle of row.bundles) {
      const key = JSON.stringify([bundle.label, bundle.status, bundle.select]);
      if (!bundles.has(key)) {
        bundles.set(key, {
          label: bundle.label,
          status: bundle.status,
          qualified: bundle.qualified,
          select: bundle.select,
          note: HEAD_BUNDLE_NOTES[bundle.status],
        });
      }
    }
  }
  return { sources: [...sources.values()], bundles: [...bundles.values()] };
}

/** Uniform integrity of a headed group; null = mixed, the rows self-mark. */
function integrityHoistOf(rows: ImportMapRowVm[]): boolean | null {
  if (rows.every((row) => row.hasIntegrity)) {
    return true;
  }
  return rows.some((row) => row.hasIntegrity) ? null : false;
}

/**
 * Collapsed-head summary of the chunk-wiring fold: entry count plus
 * bundle count ("in 3 bundles"), the bundle names one hover away —
 * ordered by row count (first appearance breaking ties). Pseudo-package
 * groups without a bundle name compress to their count ("in 7 chunk
 * groups") with no tooltip — the specifiers restate themselves on the
 * expanded rows.
 */
function bundleSummaryOf(rows: ImportMapRowVm[]): { label: string; note: string | null } {
  const counts = new Map<string, number>();
  const pseudoLabels = new Set<string>();
  for (const row of rows) {
    for (const chunk of row.chunks) {
      if (chunk.groupNoun === 'chunk group') {
        pseudoLabels.add(chunk.groupLabel);
      } else {
        counts.set(chunk.groupLabel, (counts.get(chunk.groupLabel) ?? 0) + 1);
      }
    }
  }
  if (counts.size === 0) {
    return { label: `in ${countClaim(pseudoLabels.size, 'chunk group')}`, note: null };
  }
  const labels = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  return { label: `in ${countClaim(counts.size, 'bundle')}`, note: labels.join(', ') };
}

function groupVmOf(kind: ImportMapGroupKind, rows: ImportMapRowVm[]): ImportMapGroupVm {
  const signature = kind === 'signature' ? signatureFactsOf(rows) : null;
  const summary = kind === 'chunk-wiring' ? bundleSummaryOf(rows) : null;
  return {
    kind,
    countClaim: kind === 'exposes' ? `${rows.length}` : countClaim(rows.length, 'entry', 'entries'),
    // Ungrouped rows render without a head — they always self-mark.
    integrityHoist: kind === 'ungrouped' ? null : integrityHoistOf(rows),
    sources: signature?.sources ?? [],
    bundles: signature?.bundles ?? [],
    bundleSummary: summary?.label ?? null,
    bundleSummaryNote: summary?.note ?? null,
    containsSelection: rows.some((row) => row.selected),
    note: GROUP_NOTES[kind] ?? null,
    packagesHead: null,
    rows,
  };
}

/**
 * Evidence homes of one section, in fixed order: `EXPOSES` → signature
 * groups (global only, by first appearance) → ungrouped rows →
 * `CHUNK WIRING` → `UNREFERENCED`. The home derives from the row's
 * canonical joins with precedence expose > chunk > package (the
 * `scoped-pseudo-external` precedent: v4.5 wiring entries carry
 * pseudo-external claims, the wiring home wins); rows keep map order
 * within every home. Empty homes render nothing.
 */
function groupsOf(kind: 'global' | 'scope', rows: ImportMapRowVm[]): ImportMapGroupVm[] {
  const exposeRows: ImportMapRowVm[] = [];
  const chunkRows: ImportMapRowVm[] = [];
  const packageRows: ImportMapRowVm[] = [];
  const unreferencedRows: ImportMapRowVm[] = [];
  for (const row of rows) {
    if (row.exposes.length > 0) {
      exposeRows.push(row);
    } else if (row.chunks.length > 0) {
      chunkRows.push(row);
    } else if (row.resolutionIds.length > 0) {
      packageRows.push(row);
    } else {
      unreferencedRows.push(row);
    }
  }

  // Signature groups render in the global section only; every scope
  // package row keeps the full per-row channel (witnessed max: 1 per
  // scope), as do global rows with an empty signature.
  const signatureGroups = new Map<string, ImportMapRowVm[]>();
  const ungroupedRows: ImportMapRowVm[] = [];
  for (const row of packageRows) {
    if (kind === 'scope' || (row.sources.length === 0 && row.bundles.length === 0)) {
      ungroupedRows.push(row);
      continue;
    }
    const key = signatureKeyOf(row);
    signatureGroups.set(key, [...(signatureGroups.get(key) ?? []), row]);
  }

  // The package home (signature groups + ungrouped package rows) carries
  // one `PACKAGES` label on its first group; the count spans the home.
  const packageHomeGroups = [
    ...[...signatureGroups.values()].map((groupRows) => groupVmOf('signature', groupRows)),
    ...(ungroupedRows.length > 0 ? [groupVmOf('ungrouped', ungroupedRows)] : []),
  ];
  if (packageHomeGroups.length > 0) {
    packageHomeGroups[0].packagesHead = {
      countClaim: countClaim(packageRows.length, 'entry', 'entries'),
      note: PACKAGES_HOME_NOTE,
    };
  }

  return [
    ...(exposeRows.length > 0 ? [groupVmOf('exposes', exposeRows)] : []),
    ...packageHomeGroups,
    ...(chunkRows.length > 0 ? [groupVmOf('chunk-wiring', chunkRows)] : []),
    ...(unreferencedRows.length > 0 ? [groupVmOf('unreferenced', unreferencedRows)] : []),
  ];
}

export function buildImportMapVm(model: FederationModel, ui: ImportMapUiState): ImportMapVm {
  if (model.mapMode === 'none') {
    return {
      sections: [],
      caption: IMPORT_MAP_CAPTION,
      emptyNote: 'no import map recorded in this capture',
    };
  }

  const indexes = buildCanonicalIndexes(model);
  const joins = buildRowJoins(model);
  const wanted = ui.selected === null ? null : collapseDotInfix(ui.selected);
  const pageBase = model.provenance.pageUrl;

  // Map-structural scope-precedence evidence: global targets per
  // specifier, from `importMapEntries` alone.
  const globalTargetsBySpecifier = new Map<string, Set<string>>();
  for (const entry of model.importMapEntries) {
    if (entry.scope === null) {
      globalTargetsBySpecifier.set(
        entry.specifier,
        new Set([...(globalTargetsBySpecifier.get(entry.specifier) ?? []), entry.target]),
      );
    }
  }

  const rowOf = (entry: ImportMapEntryRow): ImportMapRowVm => {
    const resolutions =
      joins.resolutionsByRow.get(rowKey(entry.scope, entry.specifier, entry.target)) ?? [];
    const claims = resolutions.flatMap(
      (resolution) => joins.claimsByResolution.get(resolution.id) ?? [],
    );
    const copies = [
      ...new Map(
        resolutions
          .flatMap((resolution) => joins.copiesByResolution.get(resolution.id) ?? [])
          .map((copy) => [copy.id, copy] as const),
      ).values(),
    ];
    const claimVms = claims.map(claimVmOf);
    if (claimVms.length === 1 && claimVms[0].state === 'own-selected') {
      claimVms[0].quiet = true;
    }
    const claimedConsumers = new Set(claims.map((claim) => claim.consumerRemote));
    const claimlessConsumers = [
      ...new Set(resolutions.flatMap((resolution) => resolution.consumerRemotes)),
    ]
      .filter((consumer) => !claimedConsumers.has(consumer))
      .map((consumer) => ({
        consumer,
        display: participantDisplay(consumer),
        host: isHostRemote(consumer),
        select: consumer,
        note: `binding of ${participantDisplay(consumer)} resolves through this entry without an own resolution claim`,
      }));
    return {
      specifier: entry.specifier,
      target: entry.target,
      targetDisplay:
        entry.target.startsWith(pageBase) && entry.target.length > pageBase.length
          ? entry.target.slice(pageBase.length)
          : entry.target,
      hasIntegrity: entry.hasIntegrity,
      resolutionIds: resolutions.map((resolution) => resolution.id),
      sources: copies.map((copy) => rowSourceOf(copy)),
      sourceQuiet: false,
      claims: claimVms,
      claimlessConsumers,
      bundles: [...new Set(copies.flatMap((copy) => copy.bundleClaimIds))].flatMap(
        (bundleClaimId) => {
          const vm = bundleVmOf(bundleClaimId, indexes);
          return vm === null ? [] : [vm];
        },
      ),
      chunks: chunkVmsOf(joins.chunksByTarget.get(entry.target)),
      exposes: joins.exposesByTarget.get(entry.target) ?? [],
      blocked: blockedVmOf(resolutions),
      packageSelect: packageSelectOf(entry, claims),
      overridesGlobal:
        entry.scope !== null &&
        [...(globalTargetsBySpecifier.get(entry.specifier) ?? [])].some(
          (target) => target !== entry.target,
        ),
      selected: wanted !== null && collapseDotInfix(entry.specifier) === wanted,
    };
  };

  /** Scope-URL identity of a section (never a most-specific election). */
  const ownerOf = (scope: string): SectionOwnerVm | null => {
    const matches = model.resolutionProjection.remotes.filter(
      (remote) => remote.resolvedScopeUrl === scope,
    );
    if (matches.length === 0) {
      return null;
    }
    if (matches.length === 1) {
      const remote = matches[0];
      const display = participantDisplay(remote.name);
      return {
        kind: 'remote',
        remote: remote.name,
        display,
        host: remote.isHost,
        select: remote.name,
        note: `this scope prefix is the registered scope URL of ${display} (rule: scope-url identity)`,
      };
    }
    const remotes = matches.map((remote) => ({
      remote: remote.name,
      display: participantDisplay(remote.name),
      host: remote.isHost,
      select: remote.name,
    }));
    return {
      kind: 'shared-scope-url',
      remotes,
      note: `this scope prefix is the registered scope URL of ${remotes
        .map((remote) => remote.display)
        .join(' and ')} (rule: scope-url identity)`,
    };
  };

  // The flattened effective map is already in map order (top-level first,
  // then scopes); sections keep first-appearance order. Rows collect in
  // map order per section, then regroup into their evidence homes.
  interface SectionDraft {
    kind: 'global' | 'scope';
    label: string;
    scope: string | null;
    owner: SectionOwnerVm | null;
    rows: ImportMapRowVm[];
  }
  const drafts: SectionDraft[] = [];
  const byScope = new Map<string | null, SectionDraft>();
  for (const entry of model.importMapEntries) {
    let draft = byScope.get(entry.scope);
    if (draft === undefined) {
      draft = {
        kind: entry.scope === null ? 'global' : 'scope',
        label: entry.scope ?? GLOBAL_LABEL,
        scope: entry.scope,
        owner: entry.scope === null ? null : ownerOf(entry.scope),
        rows: [],
      };
      byScope.set(entry.scope, draft);
      drafts.push(draft);
    }
    draft.rows.push(rowOf(entry));
  }
  for (const draft of drafts) {
    // Only exceptions speak: a source chip restating the section's
    // identity-owned remote with an exact qualifier stays quiet; every
    // non-exact qualifier and every foreign source keeps speaking.
    if (draft.owner?.kind === 'remote') {
      const owner = draft.owner;
      for (const row of draft.rows) {
        row.sourceQuiet =
          row.sources.length > 0 &&
          row.sources.every(
            (source) =>
              source.qualifier === 'exact-target-source' && source.remoteSelect === owner.remote,
          );
      }
    }
  }
  const sections: ImportMapSectionVm[] = drafts.map((draft) => ({
    kind: draft.kind,
    label: draft.label,
    scope: draft.scope,
    owner: draft.owner,
    countClaim: countClaim(draft.rows.length, 'entry', 'entries'),
    groups: groupsOf(draft.kind, draft.rows),
  }));

  return {
    sections,
    caption: IMPORT_MAP_CAPTION,
    emptyNote: sections.length === 0 ? 'the recorded import map tags merge to an empty map' : null,
  };
}
