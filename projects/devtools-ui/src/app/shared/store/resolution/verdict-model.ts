import type { ResolvedDependencyCopyId } from './copies-model';
import type { PoolMiss } from './pool-family-model';
import type {
  ParticipantDeclarationId,
  RegistryEvidenceId,
  SharedExternalId,
  VersionRegistrationId,
} from './model';

export type PackageScopeVerdictsId = RegistryEvidenceId<'package-scope-verdicts'>;

/**
 * What the resolver decided for one declaration (version-resolver step 2), read from the stored
 * row action; the range check only tells `reuses-shared` from `out-of-range` on `skip` rows.
 * - `provides`: first participant of a `share` row, whose file the mapping publishes
 * - `same-version`: another participant of a `share` row, or a `skip` row of the elected tag
 * - `reuses-shared`: `skip`, and the range accepts the elected tag
 * - `subpool`: `skip` with a `servedBy` — pooling runs it on that remote's build (orchestrator 4.8)
 * - `own-copy`: `scope`
 * - `out-of-range`: `skip`, not strict, and the range rejects the elected tag
 * - `unknown`: no elected tag, an unreadable range or version, or a row the rules cannot explain
 */
export type DeclarationVerdict =
  | 'provides'
  | 'same-version'
  | 'reuses-shared'
  | 'subpool'
  | 'own-copy'
  | 'out-of-range'
  | 'unknown';

/**
 * - `shared` / `scoped`: some row of the tag carries action `share` / `scope`
 * - `subpool`: neither, yet a copy of the tag materializes for a `servedBy` subpool
 * - `skipped`: every row is `skip` and no copy of the tag materializes
 * - `unknown`: a copy no stored row explains, or a row of an unknown action
 */
export type VersionStatus = 'shared' | 'scoped' | 'subpool' | 'skipped' | 'unknown';

/**
 * Why a declaration is off the global map (orchestrator 4.8): its `own-copy` or `subpool` verdict.
 * `pool`: pooling placed the remote's whole family — the reason is the pool's (Pools tab). `package`: the package's
 * stored `servingBuild` does not serve it, recomputed as `serving.ts` `fallsBack` judges it: its
 * strict range rejects the serving tag, it ships entrypoints the serving build does not publish, or
 * it ships the package at two tags. A null `miss` is a placement the stored rows do not reproduce.
 */
export interface PlacementReason {
  scope: 'pool' | 'package';
  /** The pool's winner or the package's serving build; null when none is stored. */
  build: string | null;
  miss: PoolMiss | { kind: 'two-tags'; tags: string[] } | null;
  /** The stored `poolCause` (pooled copies only). */
  storedCause: string | null;
}

export interface DeclarationVerdictRecord {
  declarationId: ParticipantDeclarationId;
  participant: string;
  /** The tag this declaration ships. */
  tag: string;
  verdict: DeclarationVerdict;
  /** Whether the declaration accepts the elected tag (its own tag always passes); null when unreadable or none is elected. */
  acceptsElected: boolean | null;
  /** Set on `own-copy` and `subpool` verdicts. */
  reason: PlacementReason | null;
  /** The stored `servedBy`: the subpool whose build the declaration runs (its owner names itself). */
  subpoolOf: string | null;
  /** Tag of the copy the package's own specifier resolves to; null when it resolves nowhere. */
  runsTag: string | null;
  requiredVersion: string;
  strictVersion: boolean;
  /** Whether `requiredVersion` accepts each registered tag of the scope (semver descending); null when unreadable. */
  acceptance: { tag: string; accepts: boolean | null }[];
}

/** One mapped entry file of a build. */
export interface BuildEntryFile {
  specifier: string;
  url: string;
  /** The mapped target carries an SRI hash in the effective map. */
  hasIntegrity: boolean;
}

/** A recorded chunk file of a build's bundle, resolved against its emitter's scope. */
export interface BuildChunkFile {
  file: string;
  url: string | null;
}

/** One build (copy) serving a version: its remote, the specifiers it serves, its files. */
export interface VersionBuild {
  copyId: ResolvedDependencyCopyId;
  /** The remote whose build the copy is; null for a target-only copy. */
  sourceRemote: string | null;
  /** The copy comes from a `share` row, so the map may publish its files for the version. */
  fromShareRow: boolean;
  specifiers: string[];
  entryFiles: BuildEntryFile[];
  /** Chunks of the copy's `mapped-source` bundle claims, registry order. */
  chunkFiles: BuildChunkFile[];
  /** A bundle claim of the copy lists no chunk files: `source-only` or `ambiguous`. */
  unlistedChunks: boolean;
}

export interface VersionVerdict {
  tag: string;
  status: VersionStatus;
  registrationIds: VersionRegistrationId[];
  /** Declarations shipping this tag, registry order. */
  declarationIds: ParticipantDeclarationId[];
  /** Copies of this tag that materialize in this scope. */
  copyIds: ResolvedDependencyCopyId[];
  /** The copies as builds: the one serving the package's own specifier first, then copy order. */
  builds: VersionBuild[];
  /**
   * A shared version the map assembles from more than one `share`-row build: only without a
   * serving build, each specifier from the first copy declaring it (docs: "Copies of one version").
   */
  merged: boolean;
}

/** The resolver's decisions for one registry key (share scope, package). */
export interface PackageScopeVerdicts {
  id: PackageScopeVerdictsId;
  sharedExternalId: SharedExternalId;
  shareScope: string;
  packageName: string;
  /** Tag of the `share` row; null in the `strict` scope, which elects none, or without a `share` row. */
  electedTag: string | null;
  /** First participant of the `share` row — the build the mapping publishes. */
  electedDeclarationId: ParticipantDeclarationId | null;
  /** Every registered tag, semver descending. */
  versions: VersionVerdict[];
  /** Every declaration, registry order. */
  declarations: DeclarationVerdictRecord[];
  /** The stored build serving the package in this scope (orchestrator 4.8); null when none is stored. */
  servingBuild: string | null;
}
