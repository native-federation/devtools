/**
 * `ingestSnapshot` — one ingest of a `SnapshotV1` produces the
 * `FederationModel` every V2 view projects.
 *
 * Ingest rules (corpus-derived, see the V2 plan/spec):
 * - Chunk reclassification reads the UNION of both sources: scoped
 *   externals named `@nf-internal/...` (v4.5 non-dense) and the
 *   `shared-chunks` bundle lists (v4/dense). Reclassified entries
 *   become chunk groups of their owning remote and never count as
 *   packages; true scoped packages stay scoped externals.
 * - Version rows sort (semver tag desc, action) in the store — the
 *   registry's semver order is reliable, its same-tag tie order is not.
 * - An absent repository key equals `{}` (the mapper already projects
 *   lazily-absent keys to empty containers; `runtime: null` means the
 *   whole channel was missing — the one zero-entry accessor lives here).
 * - Expose joining tolerates the literal `/./` infix: live maps join
 *   naively (`<remoteName>/./<moduleName>`).
 * - Secondary-entry externals (`pkg/subpath`) stay their own externals —
 *   parent linking is a Task-7 derivation.
 * - Load-time-relative values (relative map targets, remote scope URLs)
 *   resolve against the recovered parse-time base
 *   (`deriveResolutionBase`), not `capture.pageUrl` — SPA navigation moves
 *   the capture URL away from the base the loader resolved against.
 */
import { NF_HOST, type SnapshotV1 } from 'devtools-bridge';
import type {
  ChunkGroup,
  EffectiveMap,
  ExposeJoin,
  FederationModel,
  ImportMapEntryRow,
  RemoteEntity,
  ScopedPackageRow,
} from './federation-model';
import {
  deriveResolutionBase,
  detectMapMode,
  mergeDocumentMaps,
  resolveUrl,
} from './merge-document-maps';
import {
  aggregatePackageMeasures,
  attachBundleClaimIds,
  attachCopyIds,
  buildCanonicalProjection,
  deriveBundleClaims,
  deriveChunkGroups,
  deriveResolutionClaims,
  materializeResolvedCopies,
  normalizeRegistryEvidence,
  projectSharedRows,
  resolveEffectiveConsumerBindings,
} from './resolution';

/** Stable specifier marker of chunk pseudo-externals in both generations. */
const CHUNK_PSEUDO_PACKAGE_PREFIX = '@nf-internal/';

export function ingestSnapshot(snapshot: SnapshotV1): FederationModel {
  const pageUrl = snapshot.capture.pageUrl;
  const tags = snapshot.importMaps?.documentMaps ?? [];
  const mapMode = detectMapMode(tags);
  // Load-time-relative values (map targets, remote scope URLs) resolve
  // against the parse-time document base, not the capture URL — on an SPA
  // page `pushState` has moved `pageUrl` away from the base the loader and
  // the NF runtime already resolved against.
  const resolutionBase = deriveResolutionBase(tags, snapshot.importMaps?.effective ?? null, pageUrl);
  const baseUrl = resolutionBase.url;
  const effectiveMap = mergeDocumentMaps(tags, baseUrl);
  const mapTargets = collectTargets(effectiveMap);

  const runtime = snapshot.runtime;
  const remotesRepo = runtime?.remotes ?? {};
  const scopedRepo = runtime?.scopedExternals ?? {};
  const chunksRepo = runtime?.sharedChunks ?? {};

  const remotes: RemoteEntity[] = Object.entries(remotesRepo).map(([name, remote]) => ({
    name,
    isHost: name === NF_HOST,
    scopeUrl: remote.scopeUrl,
    resolvedScopeUrl: resolveUrl(remote.scopeUrl, baseUrl),
    exposes: remote.exposes.map((expose): ExposeJoin => ({
      moduleName: expose.moduleName,
      file: expose.file,
      mapTarget: joinExpose(name, expose.moduleName, effectiveMap),
    })),
    integrity: remote.integrity,
  }));
  const scopeUrlByRemote = new Map(remotes.map((remote) => [remote.name, remote.resolvedScopeUrl]));
  const registryEvidence = normalizeRegistryEvidence(snapshot, { resolutionBase });
  const effectiveConsumerResolutions = resolveEffectiveConsumerBindings(registryEvidence, {
    resolutionBaseUrl: baseUrl,
    // Document tags are the merge ground truth; the shim map is only a
    // cross-check — plus the base-recovery oracle after SPA navigation.
    mapAvailable: snapshot.channels.domImportMaps.state === 'available',
    effectiveMap,
    consumerScopeUrlByRemote: scopeUrlByRemote,
  });
  const sharedRows = projectSharedRows(registryEvidence, {
    effectiveConsumerResolutions,
  });

  const resolutionClaims = deriveResolutionClaims(registryEvidence, effectiveConsumerResolutions, {
    remoteScopeUrlByName: scopeUrlByRemote,
    hostRemote: NF_HOST,
  });
  const materializedCopies = materializeResolvedCopies(
    registryEvidence,
    effectiveConsumerResolutions,
    resolutionClaims,
    // URL-identified copy IDs are namespaced by capture identity.
    { snapshotIdentity: `${snapshot.capture.capturedAt}|${pageUrl}` },
  );
  const declarationResolutionClaims = attachCopyIds(
    resolutionClaims.declarationResolutionClaims,
    materializedCopies,
  );
  const canonicalChunkGroups = deriveChunkGroups(registryEvidence, chunksRepo);
  const bundleClaims = deriveBundleClaims(
    registryEvidence,
    resolutionClaims,
    materializedCopies,
    canonicalChunkGroups,
  );
  const resolvedCopies = attachBundleClaimIds(materializedCopies, bundleClaims);
  const resolutionProjection = buildCanonicalProjection({
    remotes: remotes.map(({ name, isHost, scopeUrl, resolvedScopeUrl }) => ({
      name,
      isHost,
      scopeUrl,
      resolvedScopeUrl,
    })),
    resolutions: effectiveConsumerResolutions,
    claims: { ...resolutionClaims, declarationResolutionClaims },
    copies: resolvedCopies,
    chunkGroups: canonicalChunkGroups,
    bundleClaims,
    packageMeasures: aggregatePackageMeasures(
      registryEvidence,
      declarationResolutionClaims,
      resolvedCopies,
    ),
  });

  const scopedPackages: ScopedPackageRow[] = [];
  const chunkGroups: ChunkGroup[] = [];
  for (const [scope, packages] of Object.entries(scopedRepo)) {
    for (const [packageName, scopedPackage] of Object.entries(packages)) {
      if (packageName.startsWith(CHUNK_PSEUDO_PACKAGE_PREFIX)) {
        const files = Object.values(scopedPackage.entries);
        chunkGroups.push({
          owningRemote: scope,
          bundleName: scopedPackage.bundle,
          pseudoPackage: packageName,
          origin: 'scoped-pseudo-external',
          files,
          mapped: allFilesMapped(files, scope, scopeUrlByRemote, baseUrl, mapTargets),
        });
      } else {
        scopedPackages.push({
          scope,
          packageName,
          tag: scopedPackage.tag,
          bundle: scopedPackage.bundle,
          entries: scopedPackage.entries,
        });
      }
    }
  }
  for (const [remoteName, bundles] of Object.entries(chunksRepo)) {
    for (const [bundleName, files] of Object.entries(bundles)) {
      // The registry writes structural zero-entry bundle lists
      // ('mapping-or-exposed' is empty in every capture — nothing may
      // depend on its contents); zero files contribute zero chunks.
      if (files.length === 0) {
        continue;
      }
      chunkGroups.push({
        owningRemote: remoteName,
        bundleName,
        pseudoPackage: null,
        origin: 'shared-chunks',
        files,
        mapped: allFilesMapped(files, remoteName, scopeUrlByRemote, baseUrl, mapTargets),
      });
    }
  }

  const importMapEntries: ImportMapEntryRow[] = [];
  for (const [specifier, target] of Object.entries(effectiveMap.imports)) {
    importMapEntries.push({
      specifier,
      target,
      scope: null,
      hasIntegrity: hasOwn(effectiveMap.integrity, target),
    });
  }
  for (const [scope, entries] of Object.entries(effectiveMap.scopes)) {
    for (const [specifier, target] of Object.entries(entries)) {
      importMapEntries.push({
        specifier,
        target,
        scope,
        hasIntegrity: hasOwn(effectiveMap.integrity, target),
      });
    }
  }

  return {
    provenance: {
      schemaVersion: snapshot.schemaVersion,
      pageUrl,
      capturedAt: snapshot.capture.capturedAt,
      collectorVersion: snapshot.capture.collectorVersion,
      generation: runtime?.generation ?? 'unknown',
      runtimeSource: snapshot.runtimeSource ?? null,
    },
    channels: snapshot.channels,
    mapMode,
    effectiveMap,
    registryEvidence,
    effectiveConsumerResolutions,
    resolutionProjection,
    sharedRows,
    scopedPackages,
    remotes,
    chunkGroups,
    importMapEntries,
  };
}

/** Finds the map target for an expose via the naive `<remote>/<moduleName>` join. */
function joinExpose(
  remoteName: string,
  moduleName: string,
  effectiveMap: EffectiveMap,
): string | null {
  const wanted = collapseDotInfix(`${remoteName}/${moduleName}`);
  for (const [specifier, target] of Object.entries(effectiveMap.imports)) {
    if (collapseDotInfix(specifier) === wanted) {
      return target;
    }
  }
  for (const scopeImports of Object.values(effectiveMap.scopes)) {
    for (const [specifier, target] of Object.entries(scopeImports)) {
      if (collapseDotInfix(specifier) === wanted) {
        return target;
      }
    }
  }
  return null;
}

function collapseDotInfix(specifier: string): string {
  return specifier.replace(/\/\.\//g, '/');
}

function allFilesMapped(
  files: string[],
  owningRemote: string,
  scopeUrlByRemote: Map<string, string>,
  resolutionBaseUrl: string,
  mapTargets: Set<string>,
): boolean {
  const base = scopeUrlByRemote.get(owningRemote) ?? resolutionBaseUrl;
  return files.every((file) => mapTargets.has(resolveUrl(file, base)));
}

function collectTargets(effectiveMap: EffectiveMap): Set<string> {
  const targets = new Set(Object.values(effectiveMap.imports));
  for (const scopeImports of Object.values(effectiveMap.scopes)) {
    for (const target of Object.values(scopeImports)) {
      targets.add(target);
    }
  }
  return targets;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}
