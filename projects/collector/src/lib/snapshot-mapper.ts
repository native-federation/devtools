/**
 * Maps raw probe results to `SnapshotV1`.
 *
 * Both inputs are untrusted: they crossed the eval boundary out of the
 * inspected page, so on a hostile page they are attacker-shaped
 * regardless of what the probes intended to return. Everything is read
 * defensively, re-projected through the schema allowlist (which sanitizes
 * every URL), and reduced to the DTO shape — document import-map tags are
 * parsed here and their content rides the same allowlist projection as the
 * shim map; the raw tag text itself never reaches the snapshot. Channel
 * states follow the honest-state rules of the DTO:
 * missing evidence is an explicit state with a reason, never an invented
 * default, and an unrecognized shape yields `not-recognized` with no raw
 * data copied.
 */
import type {
  ChannelStateV1,
  DocumentImportMapV1,
  EffectiveImportMapV1,
  ExposeV1,
  ExternalRemoteV1,
  ExternalScopesV1,
  ExternalV1,
  ExternalVersionV1,
  GenerationV1,
  ImportMapEntryV1,
  ImportMapScopeV1,
  ImportMapsV1,
  RemoteV1,
  RuntimeRepositoriesV1,
  ScopedExternalsV1,
  ScopedPackageV1,
  SnapshotGenerationV1,
  SnapshotV1,
} from 'devtools-bridge';
import { COLLECTOR_VERSION, DEFAULT_LIMITS, type CollectorLimits } from './constants';
import { appendError, projectCollectionError, type CollectionError } from './errors';
import { createContext, dataValue, defineSafe, isObjectLike } from './safe';
import { sanitizeUrl } from './privacy';
import { EFFECTIVE_IMPORT_MAP_SCHEMA, projectSchema, REPOSITORY_SCHEMAS } from './runtime-schema';

export interface CaptureContext {
  /** ISO-8601 capture timestamp, supplied by the caller (no clock access here). */
  capturedAt: string;
}

/**
 * All four repository keys are created lazily: the orchestrator's storage
 * writes a key on its first commit only, so pages that never register such
 * an entry have no key at all — corpus-proven for every key except
 * `remotes` (`scoped-externals` absent in most lab scenarios,
 * `shared-externals` absent in the all-scoped scenario, `shared-chunks`
 * absent on non-dense builds). An explicitly absent repository is the
 * observation "zero entries" and maps to an empty projection; an
 * unreadable one still means `not-recognized`, and a global carrying NONE
 * of the four keys is not recognized as Native Federation at all.
 */
const REPOSITORY_KEYS = [
  'remotes',
  'scoped-externals',
  'shared-externals',
  'shared-chunks',
] as const;

type RepositoryKey = (typeof REPOSITORY_KEYS)[number];

/**
 * `rawProbe` is the evaluated `PASSIVE_PROBE_SOURCE` result; `rawShimMap`
 * is the evaluated `SHIM_MAP_PROBE_SOURCE` result, or `null`/`undefined`
 * when the shim probe was not run (e.g. because the main probe reported no
 * readable `importShim`).
 */
export function mapProbeResult(
  rawProbe: unknown,
  rawShimMap: unknown,
  context: CaptureContext,
): SnapshotV1 {
  const limits = DEFAULT_LIMITS;
  const errors: CollectionError[] = [];

  if (!isObjectLike(rawProbe) || dataValue(rawProbe, 'schemaVersion') !== 'passive-probe/3') {
    appendError(errors, limits, 'mapper', 'probe-result-invalid');
    const reason = 'probe result unavailable';
    return {
      schemaVersion: 1,
      capture: emptyCapture(context),
      channels: {
        nativeFederationGlobals: { state: 'unavailable', reason },
        domImportMaps: { state: 'unavailable', reason },
        importShim: { state: 'unavailable', reason },
      },
      runtime: null,
      importMaps: null,
      errors,
    };
  }

  carryErrors(dataValue(rawProbe, 'errors'), errors, limits);

  const pageUrl = mapPageUrl(dataValue(rawProbe, 'page'), errors, limits);
  const globals = dataValue(rawProbe, 'globals');

  const { nfChannel, runtime } = mapRuntime(dataValue(globals, 'nativeFederation'), errors, limits);
  const orchestratorVersion = mapOrchestratorVersion(dataValue(globals, 'orchestrator'), errors, limits);
  if (runtime !== null && orchestratorVersion !== null) runtime.orchestratorVersion = orchestratorVersion;
  const { domChannel, documentMaps } = mapDocumentMaps(
    dataValue(rawProbe, 'importMaps'),
    errors,
    limits,
  );
  const { shimChannel, effective } = mapEffective(
    dataValue(globals, 'importShim'),
    rawShimMap,
    errors,
    limits,
  );

  const importMaps: ImportMapsV1 | null =
    domChannel.state === 'available' || shimChannel.state === 'available'
      ? { documentMaps, effective }
      : null;

  return {
    schemaVersion: 1,
    capture: {
      pageUrl,
      capturedAt: context.capturedAt,
      mode: 'passive',
      collectorVersion: COLLECTOR_VERSION,
    },
    channels: {
      nativeFederationGlobals: nfChannel,
      domImportMaps: domChannel,
      importShim: shimChannel,
    },
    runtime,
    importMaps,
    errors,
  };
}

function emptyCapture(context: CaptureContext): SnapshotV1['capture'] {
  return {
    pageUrl: '',
    capturedAt: context.capturedAt,
    mode: 'passive',
    collectorVersion: COLLECTOR_VERSION,
  };
}

function carryErrors(value: unknown, errors: CollectionError[], limits: CollectorLimits): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const entry of value.slice(0, limits.maxErrors)) {
    if (errors.length >= limits.maxErrors) {
      break;
    }
    errors.push(projectCollectionError(entry));
  }
}

function mapPageUrl(page: unknown, errors: CollectionError[], limits: CollectorLimits): string {
  const origin = dataValue(page, 'origin');
  const path = dataValue(page, 'path');
  if (typeof origin === 'string' && typeof path === 'string') {
    const sanitized = sanitizeUrl(origin + path);
    if (sanitized !== null) {
      return sanitized;
    }
  }
  appendError(errors, limits, 'mapper', 'page-url-unavailable');
  return '';
}

/** Bounds a page-derived string before it is interpolated into a reason. */
function boundedReasonToken(value: unknown): string {
  return String(value).slice(0, 64);
}

// --- runtime repositories -------------------------------------------------

// A version token or nothing: anything else a page put there is dropped, never carried as text.
const VERSION_TOKEN = /^[0-9A-Za-z.+-]{1,64}$/;

function mapOrchestratorVersion(
  summary: unknown,
  errors: CollectionError[],
  limits: CollectorLimits,
): string | null {
  const version = dataValue(summary, 'version');
  if (version === undefined) return null;
  if (typeof version === 'string' && VERSION_TOKEN.test(version)) return version;
  appendError(errors, limits, 'mapper', 'orchestrator-version-invalid');
  return null;
}

function mapRuntime(
  summary: unknown,
  errors: CollectionError[],
  limits: CollectorLimits,
): { nfChannel: ChannelStateV1; runtime: RuntimeRepositoriesV1 | null } {
  if (!isObjectLike(summary) || dataValue(summary, 'present') !== true) {
    return {
      nfChannel: { state: 'unavailable', reason: 'window.__NATIVE_FEDERATION__ is not defined' },
      runtime: null,
    };
  }
  if (dataValue(summary, 'descriptor') !== 'data') {
    return {
      nfChannel: {
        state: 'not-recognized',
        reason: 'global is accessor-backed; passive read skipped',
      },
      runtime: null,
    };
  }
  const valueType = dataValue(summary, 'valueType');
  if (valueType !== 'object') {
    return {
      nfChannel: {
        state: 'not-recognized',
        reason: `global has type '${boundedReasonToken(valueType)}' instead of object`,
      },
      runtime: null,
    };
  }

  const repositories = dataValue(summary, 'repositories');
  const projected: Partial<Record<RepositoryKey, unknown>> = {};
  const unreadable: string[] = [];
  let presentKeys = 0;
  for (const key of REPOSITORY_KEYS) {
    const repository = dataValue(repositories, key);
    if (isObjectLike(repository) && dataValue(repository, 'present') === false) {
      // Lazily-absent key: the observation "zero entries".
      projected[key] = {};
      continue;
    }
    const readable =
      isObjectLike(repository) &&
      dataValue(repository, 'present') === true &&
      dataValue(repository, 'descriptor') === 'data'
        ? dataValue(repository, 'value')
        : undefined;
    if (readable === undefined) {
      unreadable.push(key);
      continue;
    }
    const projection = projectSchema(
      readable,
      REPOSITORY_SCHEMAS[key],
      createContext(limits, errors, 'mapper', `repository.${key}`),
    );
    if (projection === undefined) {
      unreadable.push(key);
    } else {
      projected[key] = projection;
      presentKeys += 1;
    }
  }
  if (unreadable.length > 0) {
    return {
      nfChannel: {
        state: 'not-recognized',
        reason: `global present but repositories unreadable: ${unreadable.join(', ')}`,
      },
      runtime: null,
    };
  }
  if (presentKeys === 0) {
    return {
      nfChannel: {
        state: 'not-recognized',
        reason: 'global present but carries none of the four repository keys',
      },
      runtime: null,
    };
  }

  const sharedExternals = toExternalScopes(projected['shared-externals'], errors, limits);
  return {
    nfChannel: { state: 'available' },
    runtime: {
      remotes: toRemotes(projected['remotes'], errors, limits),
      scopedExternals: toScopedExternals(projected['scoped-externals'], errors, limits),
      sharedExternals,
      sharedChunks: toSharedChunks(projected['shared-chunks']),
      generation: deriveGeneration(sharedExternals),
    },
  };
}

function toRemotes(
  value: unknown,
  errors: CollectionError[],
  limits: CollectorLimits,
): Record<string, RemoteV1> {
  const output: Record<string, RemoteV1> = {};
  if (!isObjectLike(value)) {
    return output;
  }
  for (const [name, remote] of Object.entries(value)) {
    if (!isObjectLike(remote)) {
      continue;
    }
    const scopeUrl = dataValue(remote, 'scopeUrl');
    if (typeof scopeUrl !== 'string') {
      appendError(errors, limits, 'mapper', 'remote-incomplete', { path: `remotes.${name}` });
      continue;
    }
    const exposes: ExposeV1[] = [];
    const exposesRaw = dataValue(remote, 'exposes');
    if (Array.isArray(exposesRaw)) {
      for (const entry of exposesRaw) {
        const file = dataValue(entry, 'file');
        const moduleName = dataValue(entry, 'moduleName');
        if (typeof file === 'string' && typeof moduleName === 'string') {
          exposes.push({ moduleName, file });
        } else {
          appendError(errors, limits, 'mapper', 'expose-incomplete', { path: `remotes.${name}` });
        }
      }
    }
    // Invalid SRI entries were already rejected (with an error) by the
    // schema's integrity node — only validated pairs arrive here.
    const integrity: Record<string, string> = {};
    const integrityRaw = dataValue(remote, 'integrity');
    if (isObjectLike(integrityRaw)) {
      for (const [fileName, hash] of Object.entries(integrityRaw)) {
        if (typeof hash === 'string') {
          integrity[fileName] = hash;
        }
      }
    }
    output[name] = { scopeUrl, exposes, integrity };
  }
  return output;
}

function toExternalScopes(
  value: unknown,
  errors: CollectionError[],
  limits: CollectorLimits,
): ExternalScopesV1 {
  const output: ExternalScopesV1 = {};
  if (!isObjectLike(value)) {
    return output;
  }
  for (const [scopeKey, packages] of Object.entries(value)) {
    const scope = sanitizeMaybeUrl(scopeKey);
    if (scope === null) {
      appendError(errors, limits, 'mapper', 'scope-key-dropped', { path: 'shared-externals' });
      continue;
    }
    if (!isObjectLike(packages)) {
      continue;
    }
    const scopeOutput: Record<string, ExternalV1> = {};
    for (const [pkg, externalRaw] of Object.entries(packages)) {
      if (!isObjectLike(externalRaw)) {
        continue;
      }
      const poolName = dataValue(externalRaw, 'poolName');
      scopeOutput[pkg] = {
        dirty: dataValue(externalRaw, 'dirty') === true,
        ...(typeof poolName === 'string' ? { poolName } : {}),
        versions: toExternalVersions(dataValue(externalRaw, 'versions'), errors, limits, `shared-externals.${pkg}`),
      };
    }
    output[scope] = scopeOutput;
  }
  return output;
}

function toScopedExternals(
  value: unknown,
  errors: CollectionError[],
  limits: CollectorLimits,
): ScopedExternalsV1 {
  const output: ScopedExternalsV1 = {};
  if (!isObjectLike(value)) {
    return output;
  }
  for (const [scopeKey, packages] of Object.entries(value)) {
    const scope = sanitizeMaybeUrl(scopeKey);
    if (scope === null) {
      appendError(errors, limits, 'mapper', 'scope-key-dropped', { path: 'scoped-externals' });
      continue;
    }
    if (!isObjectLike(packages)) {
      continue;
    }
    const scopeOutput: Record<string, ScopedPackageV1> = {};
    for (const [pkg, packageRaw] of Object.entries(packages)) {
      if (!isObjectLike(packageRaw)) {
        continue;
      }
      const tag = dataValue(packageRaw, 'tag');
      if (typeof tag !== 'string') {
        appendError(errors, limits, 'mapper', 'scoped-package-incomplete', {
          path: `scoped-externals.${pkg}`,
        });
        continue;
      }
      const bundle = dataValue(packageRaw, 'bundle');
      scopeOutput[pkg] = {
        tag,
        bundle: typeof bundle === 'string' ? bundle : null,
        entries: toFileEntries(dataValue(packageRaw, 'entries')) ?? {},
      };
    }
    output[scope] = scopeOutput;
  }
  return output;
}

function toExternalVersions(
  value: unknown,
  errors: CollectionError[],
  limits: CollectorLimits,
  path: string,
): ExternalVersionV1[] {
  const versions: ExternalVersionV1[] = [];
  if (!Array.isArray(value)) {
    return versions;
  }
  for (const versionRaw of value) {
    const tag = dataValue(versionRaw, 'tag');
    const action = dataValue(versionRaw, 'action');
    if (typeof tag !== 'string' || typeof action !== 'string') {
      appendError(errors, limits, 'mapper', 'external-version-incomplete', { path });
      continue;
    }
    versions.push({
      tag,
      action,
      host: dataValue(versionRaw, 'host') === true,
      remotes: toExternalRemotes(dataValue(versionRaw, 'remotes'), errors, limits, path),
    });
  }
  return versions;
}

function toExternalRemotes(
  value: unknown,
  errors: CollectionError[],
  limits: CollectorLimits,
  path: string,
): ExternalRemoteV1[] {
  const remotes: ExternalRemoteV1[] = [];
  if (!Array.isArray(value)) {
    return remotes;
  }
  for (const remoteRaw of value) {
    const name = dataValue(remoteRaw, 'name');
    const requiredVersion = dataValue(remoteRaw, 'requiredVersion');
    if (typeof name !== 'string' || typeof requiredVersion !== 'string') {
      appendError(errors, limits, 'mapper', 'external-remote-incomplete', { path });
      continue;
    }
    // The served-files spelling discriminates the registry-format
    // generation: v4 records a single `file`, v4.5 (and later) an
    // `entries` map. A participant carrying both or neither is a collection
    // error — recorded and dropped, never silently normalized.
    const fileRaw = dataValue(remoteRaw, 'file');
    const file = typeof fileRaw === 'string' ? fileRaw : null;
    const entries = toFileEntries(dataValue(remoteRaw, 'entries'));
    if ((file !== null) === (entries !== null)) {
      appendError(errors, limits, 'mapper', 'participant-spelling-invalid', {
        path,
        participant: name,
        spelling: file !== null ? 'both' : 'neither',
      });
      continue;
    }
    const bundle = dataValue(remoteRaw, 'bundle');
    const pool = dataValue(remoteRaw, 'pool');
    const servedBy = dataValue(remoteRaw, 'servedBy');
    const poolCause = dataValue(remoteRaw, 'poolCause');
    remotes.push({
      name,
      requiredVersion,
      strictVersion: dataValue(remoteRaw, 'strictVersion') === true,
      file,
      entries,
      cached: dataValue(remoteRaw, 'cached') === true,
      bundle: typeof bundle === 'string' ? bundle : null,
      ...(typeof pool === 'string' ? { pool } : {}),
      ...(typeof servedBy === 'string' ? { servedBy } : {}),
      ...(typeof poolCause === 'string' ? { poolCause } : {}),
      servedFiles:
        entries !== null
          ? Object.entries(entries).map(([entry, entryFile]) => ({ entry, file: entryFile }))
          : [{ entry: null, file: file as string }],
      generation: entries !== null ? 'v4.5' : 'v4',
    });
  }
  return remotes;
}

/**
 * Projects an `entries` map (entry name → file name) to a plain record;
 * null when the value is not object-like — the discriminator between a
 * present (possibly empty) map and an absent one.
 */
function toFileEntries(value: unknown): Record<string, string> | null {
  if (!isObjectLike(value)) {
    return null;
  }
  const output: Record<string, string> = {};
  for (const [entry, file] of Object.entries(value)) {
    if (typeof file === 'string') {
      output[entry] = file;
    }
  }
  return output;
}

/**
 * Aggregates the per-participant generation discriminators: 'mixed' when
 * both spellings occur, 'unknown' when no participant was observed (the
 * spelling evidence is absent — e.g. an all-scoped page).
 */
function deriveGeneration(sharedExternals: ExternalScopesV1): SnapshotGenerationV1 {
  const seen = new Set<GenerationV1>();
  for (const packages of Object.values(sharedExternals)) {
    for (const external of Object.values(packages)) {
      for (const version of external.versions) {
        for (const remote of version.remotes) {
          seen.add(remote.generation);
        }
      }
    }
  }
  if (seen.size === 0) {
    return 'unknown';
  }
  if (seen.size > 1) {
    return 'mixed';
  }
  return seen.has('v4.5') ? 'v4.5' : 'v4';
}

function toSharedChunks(value: unknown): Record<string, Record<string, string[]>> {
  const output: Record<string, Record<string, string[]>> = {};
  if (!isObjectLike(value)) {
    return output;
  }
  for (const [provider, bundles] of Object.entries(value)) {
    if (!isObjectLike(bundles)) {
      continue;
    }
    const providerOutput: Record<string, string[]> = {};
    for (const [bundleName, files] of Object.entries(bundles)) {
      providerOutput[bundleName] = Array.isArray(files)
        ? files.filter((file): file is string => typeof file === 'string')
        : [];
    }
    output[provider] = providerOutput;
  }
  return output;
}

// --- import maps ----------------------------------------------------------

function mapDocumentMaps(
  value: unknown,
  errors: CollectionError[],
  limits: CollectorLimits,
): { domChannel: ChannelStateV1; documentMaps: DocumentImportMapV1[] } {
  if (!Array.isArray(value)) {
    return {
      domChannel: {
        state: 'unavailable',
        reason: 'DOM import-map inventory could not be read',
      },
      documentMaps: [],
    };
  }
  const documentMaps: DocumentImportMapV1[] = [];
  for (const entry of value.slice(0, limits.maxImportMaps)) {
    if (!isObjectLike(entry)) {
      continue;
    }
    const kindRaw = dataValue(entry, 'type');
    const kind = typeof kindRaw === 'string' ? kindRaw.slice(0, 64) : 'unknown';
    const text = dataValue(entry, 'text');
    let parsed = false;
    let importCount = 0;
    let scopeCount = 0;
    let content: MapContent = { imports: [], scopes: [], integrity: {} };
    if (typeof text === 'string') {
      try {
        const parsedMap: unknown = JSON.parse(text);
        if (isObjectLike(parsedMap) && !Array.isArray(parsedMap)) {
          parsed = true;
          const imports = dataValue(parsedMap, 'imports');
          const scopes = dataValue(parsedMap, 'scopes');
          importCount = isObjectLike(imports) ? Object.keys(imports).length : 0;
          scopeCount = isObjectLike(scopes) ? Object.keys(scopes).length : 0;
          const path = `documentMaps[${documentMaps.length}]`;
          const projection = projectSchema(
            parsedMap,
            EFFECTIVE_IMPORT_MAP_SCHEMA,
            createContext(limits, errors, 'mapper', path),
          );
          content = toMapContent(projection, errors, limits, path);
        }
      } catch {
        // parsed stays false — the DTO records the parse failure as data.
      }
    }
    documentMaps.push({ kind, parsed, importCount, scopeCount, ...content });
  }
  return { domChannel: { state: 'available' }, documentMaps };
}

function mapEffective(
  summary: unknown,
  rawShimMap: unknown,
  errors: CollectionError[],
  limits: CollectorLimits,
): { shimChannel: ChannelStateV1; effective: EffectiveImportMapV1 | null } {
  if (!isObjectLike(summary) || dataValue(summary, 'present') !== true) {
    return {
      shimChannel: { state: 'unavailable', reason: 'window.importShim is not present' },
      effective: null,
    };
  }
  if (dataValue(summary, 'descriptor') !== 'data') {
    return {
      shimChannel: {
        state: 'not-recognized',
        reason: 'importShim is accessor-backed; passive read skipped',
      },
      effective: null,
    };
  }

  if (
    !isObjectLike(rawShimMap) ||
    dataValue(rawShimMap, 'schemaVersion') !== 'shim-map-probe/1'
  ) {
    if (rawShimMap !== null && rawShimMap !== undefined) {
      appendError(errors, limits, 'mapper', 'shim-result-invalid');
    }
    return {
      shimChannel: {
        state: 'not-recognized',
        reason: 'importShim present but the shim map probe returned no result',
      },
      effective: null,
    };
  }

  carryErrors(dataValue(rawShimMap, 'errors'), errors, limits);

  const rawMap = dataValue(rawShimMap, 'map');
  if (!isObjectLike(rawMap)) {
    return {
      shimChannel: {
        state: 'not-recognized',
        reason: 'importShim present but the effective map could not be read',
      },
      effective: null,
    };
  }

  const projection = projectSchema(
    rawMap,
    EFFECTIVE_IMPORT_MAP_SCHEMA,
    createContext(limits, errors, 'mapper', 'effectiveImportMap'),
  );
  return {
    shimChannel: { state: 'available' },
    effective: toEffective(projection, errors, limits),
  };
}

function toEffective(
  value: unknown,
  errors: CollectionError[],
  limits: CollectorLimits,
): EffectiveImportMapV1 {
  const content = toMapContent(value, errors, limits, 'effectiveImportMap');
  // The shim map's SRI hash values are dropped here — presence only; the
  // per-tag document-map integrity keeps them by policy.
  return {
    imports: content.imports,
    scopes: content.scopes,
    integrityFor: Object.keys(content.integrity),
  };
}

interface MapContent {
  imports: ImportMapEntryV1[];
  scopes: ImportMapScopeV1[];
  integrity: Record<string, string>;
}

/**
 * Converts an allowlist-projected import map (shim map or parsed document
 * tag) to the DTO shape. The integrity projection keys are already
 * sanitized URLs and the values validated SRI hashes.
 */
function toMapContent(
  value: unknown,
  errors: CollectionError[],
  limits: CollectorLimits,
  path: string,
): MapContent {
  const imports = toEntries(dataValue(value, 'imports'), errors, limits, `${path}.imports`);
  const scopes: ImportMapScopeV1[] = [];
  const scopesRaw = dataValue(value, 'scopes');
  if (isObjectLike(scopesRaw)) {
    for (const [scopeKey, scopeImports] of Object.entries(scopesRaw)) {
      const scope = sanitizeMaybeUrl(scopeKey);
      if (scope === null) {
        appendError(errors, limits, 'mapper', 'scope-key-dropped', {
          path: `${path}.scopes`,
        });
        continue;
      }
      scopes.push({
        scope,
        imports: toEntries(scopeImports, errors, limits, `${path}.scopes`),
      });
    }
  }
  const integrityRaw = dataValue(value, 'integrity');
  const integrity: Record<string, string> = {};
  if (isObjectLike(integrityRaw)) {
    for (const [urlKey, hash] of Object.entries(integrityRaw)) {
      if (typeof hash === 'string') {
        defineSafe(integrity, urlKey, hash);
      }
    }
  }
  return { imports, scopes, integrity };
}

function toEntries(
  value: unknown,
  errors: CollectionError[],
  limits: CollectorLimits,
  path: string,
): ImportMapEntryV1[] {
  const entries: ImportMapEntryV1[] = [];
  if (!isObjectLike(value)) {
    return entries;
  }
  for (const [specifierKey, target] of Object.entries(value)) {
    if (typeof target !== 'string') {
      continue;
    }
    const specifier = sanitizeMaybeUrl(specifierKey);
    if (specifier === null) {
      appendError(errors, limits, 'mapper', 'specifier-dropped', { path });
      continue;
    }
    entries.push({ specifier, target });
  }
  return entries;
}

/**
 * Map keys can be bare specifiers or URLs. URL-shaped keys — absolute,
 * protocol-relative, or path-relative (`/`, `./`, `../`) — are sanitized
 * like every other URL (userinfo, query, and fragment stripped). Bare
 * specifiers pass through untouched: `foo?x` is a legal specifier name,
 * not a URL, so nothing may be stripped there. Returns null when a
 * URL-shaped key cannot be sanitized — the caller drops the entry.
 */
function sanitizeMaybeUrl(key: string): string | null {
  if (
    /^https?:\/\//i.test(key) ||
    key.startsWith('/') ||
    key.startsWith('./') ||
    key.startsWith('../')
  ) {
    return sanitizeUrl(key);
  }
  return key;
}
