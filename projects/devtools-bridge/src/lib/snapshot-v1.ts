/**
 * SnapshotV1 — versioned, JSON-serializable projection of the passive
 * federation evidence a page exposes.
 *
 * Layering rule: `runtime` (resolver outcome from the page global
 * `__NATIVE_FEDERATION__`) and `importMaps` (import-map resolution) are
 * separate evidence layers and must never be merged into one interpreted
 * structure. Missing evidence is an explicit channel state with a reason —
 * never an invented default.
 *
 * Field names inside the runtime projection follow the page repositories
 * verbatim (as projected by the collector) to keep the Task-7 collector
 * port a subset-copy, not a mapping layer.
 */

/** Availability of one evidence channel. */
export type ChannelStateV1 =
  | { state: 'available' }
  | { state: 'unavailable'; reason: string }
  | { state: 'not-recognized'; reason: string };

export interface CaptureMetaV1 {
  /** Sanitized page URL: origin + path only — never userinfo, query, or fragment. */
  pageUrl: string;
  /** ISO-8601 timestamp of the capture. */
  capturedAt: string;
  mode: 'passive';
  collectorVersion: string;
}

export interface ChannelsV1 {
  /** The page global `__NATIVE_FEDERATION__` (feeds `runtime`). */
  nativeFederationGlobals: ChannelStateV1;
  /** Import-map script tags in the document (feeds `importMaps.documentMaps`). */
  domImportMaps: ChannelStateV1;
  /** es-module-shims on the page (feeds `importMaps.effective`). */
  importShim: ChannelStateV1;
}

export interface ExposeV1 {
  moduleName: string;
  file: string;
}

export interface RemoteV1 {
  scopeUrl: string;
  exposes: ExposeV1[];
  /**
   * Per-remote SRI map: file name → SRI hash. Hash values are collected by
   * policy (corpus decision, see docs/work/v2/shape-validation.md); {} when
   * the runtime records none.
   */
  integrity: Record<string, string>;
}

/**
 * Registry-format generation, named by the release that introduced the
 * format and discriminated by the served-files spelling a participant
 * carries: 'v4' is the format since v4.0 (a single `file` string),
 * 'v4.5' the format since v4.5.0 (an `entries` map — commit `a424249`,
 * "Support for integrated secondary entrypoints"). The corpus's pinned
 * orchestrator commit `8e5e0b3` is the released v4.6.0.
 */
export type GenerationV1 = 'v4' | 'v4.5';

/**
 * Generation aggregated over every participant in a snapshot. 'mixed'
 * keeps mixed-generation pages representable; 'unknown' means no
 * participant was observed, so the spelling evidence is absent.
 */
export type SnapshotGenerationV1 = GenerationV1 | 'mixed' | 'unknown';

/** One served file of a participant, normalized from either spelling. */
export interface ServedFileV1 {
  /** Entry name from the v4.5 `entries` map; null for the v4 single-file spelling. */
  entry: string | null;
  file: string;
}

/**
 * One remote's participation in a resolved external version. Exactly one
 * of `file` and `entries` is non-null — a participant carrying both or
 * neither is recorded as a collection error and dropped, never silently
 * normalized.
 */
export interface ExternalRemoteV1 {
  name: string;
  requiredVersion: string;
  strictVersion: boolean;
  /** v4 spelling: one relative file name. */
  file: string | null;
  /** v4.5 spelling: entry name → file name. */
  entries: Record<string, string> | null;
  cached: boolean;
  /** Bundle name (join key into shared-chunks); optional in both generations. */
  bundle: string | null;
  /** Raw participant pool label when the runtime declaration carries one. */
  pool?: string;
  /** Raw per-declaration anchor when the runtime declaration carries one. */
  servedBy?: string;
  /** Why pooling made this copy serve itself (orchestrator v4.7+); raw, e.g. 'incompatible'. */
  poolCause?: string;
  /** Normalized served files, fed by whichever spelling is present. */
  servedFiles: ServedFileV1[];
  /** Generation this participant's spelling discriminates. */
  generation: GenerationV1;
}

/** One resolved version of an external. */
export interface ExternalVersionV1 {
  /** Concrete version, e.g. '18.3.1'. */
  tag: string;
  /** Resolver outcome; demonstrated value: 'share'. */
  action: string;
  /** True when the host provides this version. */
  host: boolean;
  remotes: ExternalRemoteV1[];
}

export interface ExternalV1 {
  dirty: boolean;
  /** The pool this external resolves in, as the orchestrator (v4.7+) stored it. */
  poolName?: string;
  versions: ExternalVersionV1[];
}

/**
 * scope ('__GLOBAL__' or a scope URL) → package name → external. No scope
 * key is guaranteed — `strict` scopes can be the only ones, so nothing may
 * assume '__GLOBAL__' exists.
 */
export type ExternalScopesV1 = Record<string, Record<string, ExternalV1>>;

/**
 * One package in the scoped-externals repository: a single object per
 * package — no `versions` array, no `dirty`, no negotiation fields
 * (corpus-proven own schema, distinct from the shared repository).
 */
export interface ScopedPackageV1 {
  tag: string;
  /** Bundle name; optional. */
  bundle: string | null;
  /** entry name → file name. */
  entries: Record<string, string>;
}

/** remote/scope key → package name → scoped package. */
export type ScopedExternalsV1 = Record<string, Record<string, ScopedPackageV1>>;

/** Reserved remote name under which the host registers itself in the repositories. */
export const NF_HOST = '__NF-HOST__';

/**
 * Projection of the four repositories on `__NATIVE_FEDERATION__`.
 * Non-null only when the channel is available: at least one repository key
 * was present and every present one was readable (otherwise the channel is
 * 'not-recognized'). The runtime's storage creates ALL repository keys
 * lazily on first commit, so an explicitly absent key is the observation
 * "zero entries" and projects to an empty container — but a global
 * carrying none of the four keys is not recognized as Native Federation.
 */
export interface RuntimeRepositoriesV1 {
  /** remote name → remote; '__NF-HOST__' is the host's own registration. */
  remotes: Record<string, RemoteV1>;
  scopedExternals: ScopedExternalsV1;
  sharedExternals: ExternalScopesV1;
  /** provider remote name → bundle name → chunk files. */
  sharedChunks: Record<string, Record<string, string[]>>;
  /** Aggregate of the participant generation discriminators. */
  generation: SnapshotGenerationV1;
  /** `__NF_ORCHESTRATOR__.storage.__NATIVE_FEDERATION__.version`; absent before orchestrator v4.7. */
  orchestratorVersion?: string;
}

export interface ImportMapEntryV1 {
  specifier: string;
  target: string;
}

export interface ImportMapScopeV1 {
  scope: string;
  imports: ImportMapEntryV1[];
}

/**
 * A document-declared import map. The tags are the map ground truth: the
 * V2 store merges them in document order into the page's effective map, so
 * each tag carries its parsed content — as-authored, meaning targets,
 * scope prefixes, and integrity keys stay relative when the tag wrote them
 * relative; resolving against the page base is the store's job. Counts
 * reflect the raw tag JSON, content is the sanitized projection — entries
 * an attacker-shaped tag loses to sanitization make the two diverge.
 */
export interface DocumentImportMapV1 {
  /** Script type, demonstrated: 'importmap-shim'. */
  kind: string;
  parsed: boolean;
  importCount: number;
  scopeCount: number;
  /** Empty when `parsed` is false — an unparsable tag has no content claim. */
  imports: ImportMapEntryV1[];
  scopes: ImportMapScopeV1[];
  /** As-authored URL → SRI hash; hash values are collected by policy. */
  integrity: Record<string, string>;
}

export interface EffectiveImportMapV1 {
  imports: ImportMapEntryV1[];
  scopes: ImportMapScopeV1[];
  /** Target URLs that carry an SRI integrity entry — presence only, hashes are never copied. */
  integrityFor: string[];
}

export interface ImportMapsV1 {
  documentMaps: DocumentImportMapV1[];
  /** Merged effective map reported by the shim; null when importShim is not available. */
  effective: EffectiveImportMapV1 | null;
}

export type CollectionErrorDetailV1 =
  | string
  | number
  | boolean
  | null
  | { [key: string]: CollectionErrorDetailV1 };

export interface CollectionErrorV1 {
  stage: string;
  code: string;
  detail?: CollectionErrorDetailV1;
}

export interface SnapshotV1 {
  schemaVersion: 1;
  capture: CaptureMetaV1;
  channels: ChannelsV1;
  /** Runtime resolver outcome; null when nativeFederationGlobals is not available. */
  runtime: RuntimeRepositoriesV1 | null;
  /** Import-map evidence; null when neither import-map channel yielded data. */
  importMaps: ImportMapsV1 | null;
  errors: CollectionErrorV1[];
}
