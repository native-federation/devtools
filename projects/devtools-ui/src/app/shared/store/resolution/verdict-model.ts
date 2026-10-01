import type { ResolvedDependencyCopyId } from './copies-model';
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
 * - `own-copy`: `scope`
 * - `out-of-range`: `skip`, not strict, and the range rejects the elected tag
 * - `unknown`: no elected tag, an unreadable range or version, or a row the rules cannot explain
 */
export type DeclarationVerdict =
  'provides' | 'same-version' | 'reuses-shared' | 'own-copy' | 'out-of-range' | 'unknown';

/**
 * - `shared` / `scoped`: some row of the tag carries action `share` / `scope`
 * - `partly-mapped`: neither, yet a copy of the tag materializes (it fills another version's
 *   entrypoints)
 * - `not-mapped`: no copy of the tag materializes
 */
export type VersionStatus = 'shared' | 'scoped' | 'partly-mapped' | 'not-mapped';

export interface DeclarationVerdictRecord {
  declarationId: ParticipantDeclarationId;
  participant: string;
  /** The tag this declaration ships. */
  tag: string;
  verdict: DeclarationVerdict;
  /** Whether `requiredVersion` accepts the elected tag per `semver`; null when either is unreadable or none is elected. */
  acceptsElected: boolean | null;
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
  specifiers: string[];
  entryFiles: BuildEntryFile[];
  /** Chunks of the copy's `mapped-source` bundle claims, registry order. */
  chunkFiles: BuildChunkFile[];
}

/** A specifier the elected version's copies lack, served from another version's build (a tear). */
export interface TornEntrypoint {
  specifier: string;
  fillingTag: string;
  fillingRemote: string | null;
  copyId: ResolvedDependencyCopyId;
  /** Consumers whose claim for the specifier is self-filled, sorted. */
  consumerRemotes: string[];
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
  /** A shared version assembled from more than one build (docs: "Copies of one version always merge"). */
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
  /** Torn specifiers, sorted; empty without an election. */
  torn: TornEntrypoint[];
}
