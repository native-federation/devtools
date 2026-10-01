/**
 * Derived V2 store model — the projection target of one `deriveFederation`
 * pass over a `FederationModel`. All derived knowledge lives here, never in
 * views; every derived field carries a provenance tag (`rule`) naming the
 * rule that produced it, so detail views can surface it and Diagnostics
 * findings can cite it.
 *
 * Derivations never invent evidence: each rule has honest degraded
 * outcomes (ambiguous / unattributable providers, a winner-less arrow,
 * explicit chunk-evidence absence, a missing parent yielding no link).
 */
import type { SnapshotGenerationV1 } from 'devtools-bridge';

import type { ChunkGroup, SharedParticipantRow } from './federation-model';

/**
 * Provenance tags — one per derivation rule. `'source-derived'` marks
 * values grounded in orchestrator source reading instead of capture
 * evidence (bounded residual: no capture exhibits losing bundle-bearing
 * copies).
 */
export type DerivationRule =
  | 'scope-prefix-match'
  | 'registry-election'
  | 'bundle-chunk-join'
  | 'chunk-pseudo-externals'
  | 'no-chunk-evidence'
  | 'source-derived'
  | 'name-derived'
  | 'shared-chunks-lists'
  | 'integrity-map-present'
  | 'participant-bundle'
  | 'multi-entry-map'
  | 'generation-aggregate'
  | 'mapped-multiplicity'
  | 'strict-scope-policy';

/**
 * Three honest provider outcomes: exactly one most-specific scope-prefix
 * match, a most-specific tie, or no matching scope at all (CDN / foreign
 * origin).
 */
export type ProviderOutcome = 'derived' | 'ambiguous' | 'unattributable';

/** Which deployment serves one effective-map target URL. */
export interface ProviderDerivation {
  targetUrl: string;
  outcome: ProviderOutcome;
  /** Providing remote name for 'derived'; null otherwise. */
  remote: string | null;
  /**
   * True when the host won only as the least-specific fallback (no remote
   * prefix matched at all) — the host never outranks a matching remote.
   */
  hostFallback: boolean;
  /** Every remote whose scope prefix matched, most specific first. */
  candidates: string[];
  rule: 'scope-prefix-match';
}

/**
 * The per-participant resolution arrow: a skip participant consumes the
 * winner's served file, a share participant and a scope row serve their
 * own copy.
 */
export interface ResolutionArrow {
  /** 'winner' for skip rows, 'own' for share and scope rows. */
  kind: 'winner' | 'own';
  /**
   * Participant serving the arrow target; null when a skip row finds no
   * unique winner (honest absence, never a guess).
   */
  providerParticipant: string | null;
  /** Served file name backing the arrow; null when none is declared. */
  file: string | null;
  /** Map-backed URL of the arrow target; null when no map entry joins. */
  targetUrl: string | null;
  rule: 'registry-election';
}

/** Secondary-entry parent link (`pkg/subpath` → `pkg`), name-derived. */
export interface ParentLink {
  parentPackage: string;
  rule: 'name-derived';
}

/**
 * Files a losing copy declared that resolve to no effective-map target.
 * Source-derived by doctrine: no capture shows losing bundle-bearing
 * copies, the rule rests on orchestrator source reading.
 */
export interface DeclaredNotMapped {
  files: string[];
  rule: 'source-derived';
}

/** Derived facts of one shared participant row (`row` is the ingest object). */
export interface SharedRowFacts {
  row: SharedParticipantRow;
  arrow: ResolutionArrow;
  /** Provider of the row's resolved target; null when no map entry joins. */
  provider: ProviderDerivation | null;
  /** Present only for `pkg/subpath` rows whose parent package is in the store. */
  parentLink: ParentLink | null;
  /**
   * Present on strict-scope rows: `requiredVersion` is pinned to the exact
   * tag at store time — views must never render it as a declared range.
   */
  strictPinned: { rule: 'strict-scope-policy' } | null;
  /** Present on losing (skip) rows; empty `files` means every copy is mapped. */
  declaredNotMapped: DeclaredNotMapped | null;
}

/** Level-1 chunk data: package → bundle → chunk files. */
export interface PackageChunkAttribution {
  packageName: string;
  bundleName: string;
  /** Chunk files of the bundle; [] when the bundle has no recorded list. */
  files: string[];
  rule: 'bundle-chunk-join';
}

/**
 * The three-level attribution ladder of one remote:
 * - 'package' — participants carry `bundle` AND the remote has
 *   `shared-chunks` bundle lists: package → bundle → chunk files.
 * - 'remote' — chunk groups exist but no package join is possible
 *   (v4.5 non-dense `@nf-internal/` pseudo-externals): chunks belong to
 *   the remote, package attribution is explicitly not derivable.
 * - 'none' — no chunk evidence at all: explicit absence, explained by the
 *   capability badge.
 */
export interface RemoteChunkAttribution {
  remote: string;
  level: 'package' | 'remote' | 'none';
  /** Populated at level 'package' only. */
  packages: PackageChunkAttribution[];
  /** The remote's chunk groups (ingest objects); [] at level 'none'. */
  groups: ChunkGroup[];
  packageAttribution: 'derived' | 'not-derivable' | 'no-evidence';
  rule: 'bundle-chunk-join' | 'chunk-pseudo-externals' | 'no-chunk-evidence';
}

/**
 * Capability badges of one remote. Chunk lists and participant `bundle` are
 * both denseChunking facets; `rule` names the first facet found.
 */
export interface RemoteBadges {
  remote: string;
  denseChunking: { present: boolean; rule: 'shared-chunks-lists' | 'participant-bundle' };
  sri: { present: boolean; rule: 'integrity-map-present' };
  multiEntry: { present: boolean; rule: 'multi-entry-map' };
}

/** Per-snapshot generation badge from the mapper-recorded provenance. */
export interface GenerationBadge {
  generation: SnapshotGenerationV1;
  rule: 'generation-aggregate';
}

/**
 * Conflict indicator of one (scope, package): more than one version exists
 * as a MAPPED copy (share and scope rows). Declared-only multiplicity — a
 * skip row whose copy is never mapped — is the election succeeding, not a
 * conflict, and must not raise the indicator. In the share scope `strict`
 * every exact version is `share` by design — the indicator is excluded
 * there (`strictExcluded`).
 */
export interface PackageConflict {
  scope: string;
  packageName: string;
  /** Distinct declared version tags (any action), store order. */
  declaredTags: string[];
  /** Distinct tags of mapped copies (share and scope rows), store order. */
  mappedTags: string[];
  conflict: boolean;
  strictExcluded: boolean;
  rule: 'mapped-multiplicity';
}

export interface DerivedFederation {
  /** One derivation per unique effective-map target URL, sorted by URL. */
  providers: ProviderDerivation[];
  /** One facts object per `model.sharedRows` entry, same order. */
  sharedRowFacts: SharedRowFacts[];
  /** One ladder entry per remote, model order. */
  chunkAttribution: RemoteChunkAttribution[];
  /** One badge set per remote, model order. */
  remoteBadges: RemoteBadges[];
  generationBadge: GenerationBadge;
  /** One entry per (scope, package) of the core relation, store order. */
  packageConflicts: PackageConflict[];
}
