/**
 * Normalized V2 store model — the projection target of one `SnapshotV1`
 * ingest (`ingestSnapshot`). Every V2 view renders from this model.
 *
 * The snapshot's two evidence layers (runtime registry, import maps) stay
 * unmerged in the DTO; they meet here only through explicit,
 * corpus-verified joins. The effective map is computed from document tags,
 * then the canonical consumer resolver records mapped, unmapped, blocked, or
 * unknown outcomes before compatibility rows project those results.
 */
import type {
  ChannelsV1,
  GenerationV1,
  RuntimeSourceV1,
  ServedFileV1,
  SnapshotGenerationV1,
} from 'devtools-bridge';

import type {
  CanonicalRegistryEvidence,
  CanonicalResolutionProjection,
  EffectiveConsumerResolution,
} from './resolution';

/** Which loader owns the page's import maps, from observed tag types. */
export type MapMode = 'native' | 'shim' | 'none';

/**
 * Merged effective import map — the map ground truth computed from the
 * document tags. All keys and targets are absolute (resolved against the
 * page base); bare specifiers stay verbatim.
 */
export interface EffectiveMap {
  imports: Record<string, string>;
  scopes: Record<string, Record<string, string>>;
  /** Absolute target URL → SRI hash. */
  integrity: Record<string, string>;
}

/** Snapshot provenance carried into the store. */
export interface StoreProvenance {
  schemaVersion: 1;
  pageUrl: string;
  capturedAt: string;
  collectorVersion: string;
  generation: SnapshotGenerationV1;
  /** null for snapshots that carry no runtime source. */
  runtimeSource: RuntimeSourceV1 | null;
}

/** Joined effective resolution of one participant row. */
export interface EffectiveResolution {
  targetUrl: string;
  hasIntegrity: boolean;
}

/**
 * One row of the core relation, keyed
 * (scope, package, version tag, action, participant).
 *
 * `scope` is the share-scope name verbatim — '__GLOBAL__', a scope URL, or
 * a `strict` scope. The strict scope pins `requiredVersion` to the exact
 * tag at store time (config ranges lost); the scope name stays on the row
 * so Task-7 derivations can flag it.
 */
export interface SharedParticipantRow {
  scope: string;
  packageName: string;
  tag: string;
  action: string;
  /** Package-level dirty flag, denormalized onto each row. */
  dirty: boolean;
  /** Version-level: the host provides this version. */
  host: boolean;
  /** Remote name; '__NF-HOST__' is the host's own registration. */
  participant: string;
  requiredVersion: string;
  strictVersion: boolean;
  bundle: string | null;
  cached: boolean;
  /** Normalized served files (Task-4 mapper output — never the raw spelling). */
  servedFiles: ServedFileV1[];
  generation: GenerationV1;
  /** Compatibility projection of a mapped canonical result; otherwise null. */
  resolution: EffectiveResolution | null;
}

export interface ExposeJoin {
  moduleName: string;
  file: string;
  /**
   * Map target joined via the naive `<remoteName>/<moduleName>` specifier
   * (live maps join naively, so the literal `/./` infix is tolerated on
   * both sides); null when no map entry joins.
   */
  mapTarget: string | null;
}

export interface RemoteEntity {
  name: string;
  isHost: boolean;
  /** As recorded — live registries keep relative scope URLs. */
  scopeUrl: string;
  /** Resolved against the page base. */
  resolvedScopeUrl: string;
  exposes: ExposeJoin[];
  /** File name → SRI hash, as recorded per remote. */
  integrity: Record<string, string>;
}

/**
 * A true scoped package. Secondary-entry externals (`pkg/subpath`) stay
 * their own rows at ingest — parent linking is a Task-7 derivation.
 */
export interface ScopedPackageRow {
  scope: string;
  packageName: string;
  tag: string;
  bundle: string | null;
  entries: Record<string, string>;
}

export type ChunkOrigin = 'scoped-pseudo-external' | 'shared-chunks';

/**
 * A chunk group of its owning remote, reclassified from the union of both
 * chunk sources: `@nf-internal/` pseudo-externals in scoped-externals
 * (v4.5 non-dense builds) and `shared-chunks` bundle lists (v4/dense).
 * Chunk groups never count as packages.
 */
export interface ChunkGroup {
  owningRemote: string;
  /** Bundle name when the source carries one. */
  bundleName: string | null;
  /** The `@nf-internal/...` package name for reclassified scoped externals. */
  pseudoPackage: string | null;
  origin: ChunkOrigin;
  files: string[];
  /** Every file resolves to a target of the effective map. */
  mapped: boolean;
}

/** One flattened entry of the effective map. */
export interface ImportMapEntryRow {
  specifier: string;
  target: string;
  /** Owning scope prefix (absolute); null for top-level imports. */
  scope: string | null;
  hasIntegrity: boolean;
}

export interface FederationModel {
  provenance: StoreProvenance;
  /** Channel availability pass-through for honest-state rendering. */
  channels: ChannelsV1;
  mapMode: MapMode;
  effectiveMap: EffectiveMap;
  /** Canonical ordered registry evidence; all new resolution work starts here. */
  registryEvidence: CanonicalRegistryEvidence;
  /** Canonical import-map outcome per unique consumer scope context and package specifier. */
  effectiveConsumerResolutions: EffectiveConsumerResolution[];
  /**
   * The raw-free canonical resolution projection — copies, consumer-copy
   * relations, chunk groups, bundle claims, claims, measures, and
   * completeness. Migrated views and any future graph read this surface.
   */
  resolutionProjection: CanonicalResolutionProjection;
  /** Sorted (scope, package, semver tag desc, action); participants keep registry order. */
  sharedRows: SharedParticipantRow[];
  scopedPackages: ScopedPackageRow[];
  remotes: RemoteEntity[];
  chunkGroups: ChunkGroup[];
  importMapEntries: ImportMapEntryRow[];
}
