import type { ExternalRemoteV1, RemoteV1, SnapshotV1 } from 'devtools-bridge';

import type { ResolutionBase } from '../merge-document-maps';
import { nextEqualKeyOrdinal, registryEvidenceId } from './ids';
import type {
  CandidateUrlState,
  CanonicalRegistryEvidence,
  EntrypointCandidate,
  EntrypointCandidateId,
  EntrypointCandidateSource,
  EvidencePathSegment,
  EvidenceProvenance,
  EvidenceRef,
  ParticipantDeclaration,
  ParticipantDeclarationId,
  PrivateRegistration,
  PrivateRegistrationId,
  RegistrationAction,
  RegistryEvidenceDiagnostic,
  SharedExternalId,
  SharedExternalRecord,
  VersionRegistration,
  VersionRegistrationId,
} from './model';

interface CandidateUrlResult {
  candidateUrl: string | null;
  candidateUrlState: CandidateUrlState;
  evidence: EvidenceRef[];
}

interface AddCandidateOptions {
  sourceRecord: EntrypointCandidateSource;
  sourceRecordId: ParticipantDeclarationId | PrivateRegistrationId;
  ownerRemote: string;
  specifier: string;
  file: string;
  sourceEvidence: EvidenceRef[];
}

export interface NormalizeRegistryEvidenceOptions {
  /**
   * Base for resolving relative remote scope URLs — the runtime resolved
   * them against the document base at load time, which SPA navigation moves
   * away from `capture.pageUrl`. Defaults to `capture.pageUrl` (the two
   * coincide on a never-navigated page).
   */
  resolutionBase?: ResolutionBase;
}

/**
 * Projects raw runtime registries into canonical evidence exactly once.
 * Source order and duplicate array elements are retained; no winner is selected.
 */
export function normalizeRegistryEvidence(
  snapshot: SnapshotV1,
  options: NormalizeRegistryEvidenceOptions = {},
): CanonicalRegistryEvidence {
  const sharedExternals: SharedExternalRecord[] = [];
  const versionRegistrations: VersionRegistration[] = [];
  const participantDeclarations: ParticipantDeclaration[] = [];
  const privateRegistrations: PrivateRegistration[] = [];
  const entrypointCandidates: EntrypointCandidate[] = [];
  const diagnostics: RegistryEvidenceDiagnostic[] = [];

  const sharedOccurrences = new Map<string, number>();
  const versionOccurrences = new Map<string, number>();
  const participantOccurrences = new Map<string, number>();
  const privateOccurrences = new Map<string, number>();
  const candidateOccurrences = new Map<string, number>();
  const diagnosticOccurrences = new Map<string, number>();

  const runtime = snapshot.runtime;
  const remotes = runtime?.remotes ?? {};
  const sharedRepo = runtime?.sharedExternals ?? {};
  const scopedRepo = runtime?.scopedExternals ?? {};
  const resolutionBase = options.resolutionBase ?? {
    url: snapshot.capture.pageUrl,
    source: 'page-url' as const,
  };

  const addCandidate = (options: AddCandidateOptions): EntrypointCandidateId => {
    const candidateKey = [options.sourceRecordId, options.specifier, options.file] as const;
    const ordinal = nextEqualKeyOrdinal(candidateOccurrences, candidateKey);
    const id = registryEvidenceId('entrypoint-candidate', candidateKey, ordinal);
    const url = constructCandidateUrl(resolutionBase, remotes, options.ownerRemote, options.file);

    entrypointCandidates.push({
      id,
      sourceRecord: options.sourceRecord,
      ordinal,
      ownerRemote: options.ownerRemote,
      specifier: options.specifier,
      file: options.file,
      candidateUrl: url.candidateUrl,
      candidateUrlState: url.candidateUrlState,
      provenance: provenance(...options.sourceEvidence, ...url.evidence),
    });
    return id;
  };

  for (const [shareScope, packages] of Object.entries(sharedRepo)) {
    for (const [packageName, external] of Object.entries(packages)) {
      const sharedPath: EvidencePathSegment[] = [
        'runtime',
        'sharedExternals',
        shareScope,
        packageName,
      ];
      const sharedKey = [shareScope, packageName] as const;
      const sharedOrdinal = nextEqualKeyOrdinal(sharedOccurrences, sharedKey);
      const sharedExternalId: SharedExternalId = registryEvidenceId(
        'shared-external',
        sharedKey,
        sharedOrdinal,
      );
      const versionRegistrationIds: VersionRegistrationId[] = [];

      external.versions.forEach((version, versionIndex) => {
        const versionPath = [...sharedPath, 'versions', versionIndex];
        const versionKey = [sharedExternalId, version.tag, version.action] as const;
        const versionOrdinal = nextEqualKeyOrdinal(versionOccurrences, versionKey);
        const versionRegistrationId: VersionRegistrationId = registryEvidenceId(
          'version-registration',
          versionKey,
          versionOrdinal,
        );
        const participantDeclarationIds: ParticipantDeclarationId[] = [];

        version.remotes.forEach((participant, participantIndex) => {
          const participantPath = [...versionPath, 'remotes', participantIndex];
          const participantKey = [versionRegistrationId, participant.name] as const;
          const participantOrdinal = nextEqualKeyOrdinal(participantOccurrences, participantKey);
          const participantDeclarationId: ParticipantDeclarationId = registryEvidenceId(
            'participant-declaration',
            participantKey,
            participantOrdinal,
          );
          const entrypointCandidateIds: EntrypointCandidateId[] = [];

          if (participant.file !== null) {
            entrypointCandidateIds.push(
              addCandidate({
                sourceRecord: {
                  kind: 'participant-file',
                  participantDeclarationId,
                },
                sourceRecordId: participantDeclarationId,
                ownerRemote: participant.name,
                specifier: packageName,
                file: participant.file,
                sourceEvidence: [
                  presentEvidence(sharedPath),
                  presentEvidence([...participantPath, 'name']),
                  presentEvidence([...participantPath, 'file']),
                ],
              }),
            );
          }
          if (participant.entries !== null) {
            for (const [specifier, file] of Object.entries(participant.entries)) {
              entrypointCandidateIds.push(
                addCandidate({
                  sourceRecord: {
                    kind: 'participant-entry',
                    participantDeclarationId,
                  },
                  sourceRecordId: participantDeclarationId,
                  ownerRemote: participant.name,
                  specifier,
                  file,
                  sourceEvidence: [
                    presentEvidence([...participantPath, 'name']),
                    presentEvidence([...participantPath, 'entries', specifier]),
                  ],
                }),
              );
            }
          }

          const pool = normalizeParticipantAnchor(participant, 'pool', participantPath);
          const servedBy = normalizeParticipantAnchor(participant, 'servedBy', participantPath);
          const poolCause = normalizeParticipantAnchor(participant, 'poolCause', participantPath);

          participantDeclarations.push({
            id: participantDeclarationId,
            versionRegistrationId,
            ordinal: participantOrdinal,
            participant: participant.name,
            requiredVersion: participant.requiredVersion,
            strictVersion: participant.strictVersion,
            bundle: participant.bundle,
            cached: participant.cached,
            generation: participant.generation,
            pool: pool.value,
            servedBy: servedBy.value,
            poolCause: poolCause.value,
            entrypointCandidateIds,
            provenance: provenance(
              presentEvidence(participantPath),
              pool.evidence,
              servedBy.evidence,
              poolCause.evidence,
            ),
          });
          participantDeclarationIds.push(participantDeclarationId);
        });

        const action = normalizeAction(version.action);
        versionRegistrations.push({
          id: versionRegistrationId,
          sharedExternalId,
          ordinal: versionOrdinal,
          tag: version.tag,
          action,
          rawAction: version.action,
          host: version.host,
          participantDeclarationIds,
          provenance: provenance(presentEvidence(versionPath)),
        });
        versionRegistrationIds.push(versionRegistrationId);

        if (action === 'unknown') {
          const diagnosticKey = [versionRegistrationId, 'unknown-action'] as const;
          const diagnosticOrdinal = nextEqualKeyOrdinal(diagnosticOccurrences, diagnosticKey);
          diagnostics.push({
            id: registryEvidenceId('diagnostic', diagnosticKey, diagnosticOrdinal),
            code: 'unknown-action',
            severity: 'warning',
            versionRegistrationId,
            rawValue: version.action,
            message: 'Unrecognized shared-external action; raw value was preserved.',
            provenance: provenance(presentEvidence([...versionPath, 'action'])),
          });
        }
      });

      sharedExternals.push({
        id: sharedExternalId,
        ordinal: sharedOrdinal,
        shareScope,
        packageName,
        dirty: external.dirty,
        poolName: typeof external.poolName === 'string' ? external.poolName : null,
        versionRegistrationIds,
        provenance: provenance(presentEvidence(sharedPath)),
      });
    }
  }

  for (const [ownerRemote, packages] of Object.entries(scopedRepo)) {
    for (const [packageName, privateExternal] of Object.entries(packages)) {
      const privatePath: EvidencePathSegment[] = [
        'runtime',
        'scopedExternals',
        ownerRemote,
        packageName,
      ];
      const privateKey = [ownerRemote, packageName] as const;
      const privateOrdinal = nextEqualKeyOrdinal(privateOccurrences, privateKey);
      const privateRegistrationId: PrivateRegistrationId = registryEvidenceId(
        'private-registration',
        privateKey,
        privateOrdinal,
      );
      const entrypointCandidateIds: EntrypointCandidateId[] = [];

      for (const [specifier, file] of Object.entries(privateExternal.entries)) {
        entrypointCandidateIds.push(
          addCandidate({
            sourceRecord: { kind: 'private-entry', privateRegistrationId },
            sourceRecordId: privateRegistrationId,
            ownerRemote,
            specifier,
            file,
            sourceEvidence: [
              presentEvidence(privatePath),
              presentEvidence([...privatePath, 'entries', specifier]),
            ],
          }),
        );
      }

      privateRegistrations.push({
        id: privateRegistrationId,
        ordinal: privateOrdinal,
        ownerRemote,
        packageName,
        tag: privateExternal.tag,
        bundle: privateExternal.bundle,
        entrypointCandidateIds,
        provenance: provenance(presentEvidence(privatePath)),
      });
    }
  }

  return {
    sharedExternals,
    versionRegistrations,
    participantDeclarations,
    privateRegistrations,
    entrypointCandidates,
    diagnostics,
  };
}

function normalizeAction(rawAction: string): RegistrationAction {
  switch (rawAction) {
    case 'share':
    case 'skip':
    case 'scope':
      return rawAction;
    default:
      return 'unknown';
  }
}

function normalizeParticipantAnchor(
  participant: ExternalRemoteV1,
  field: 'pool' | 'servedBy' | 'poolCause',
  participantPath: EvidencePathSegment[],
): { value: string | null; evidence: EvidenceRef } {
  const path = [...participantPath, field];
  const value = hasOwn(participant, field) ? participant[field] : undefined;
  if (value === undefined) {
    return { value: null, evidence: missingEvidence(path) };
  }

  return {
    value,
    evidence: presentEvidence(path),
  };
}

function constructCandidateUrl(
  base: ResolutionBase,
  remotes: Record<string, RemoteV1>,
  ownerRemote: string,
  file: string,
): CandidateUrlResult {
  const baseEvidence =
    base.source === 'shim-effective-map'
      ? presentEvidence(['importMaps', 'effective'])
      : presentEvidence(['capture', 'pageUrl']);
  const scopePath: EvidencePathSegment[] = ['runtime', 'remotes', ownerRemote, 'scopeUrl'];
  if (!hasOwn(remotes, ownerRemote)) {
    return {
      candidateUrl: null,
      candidateUrlState: 'missing-owner-scope',
      evidence: [baseEvidence, missingEvidence(scopePath)],
    };
  }

  let ownerScopeUrl: string;
  try {
    ownerScopeUrl = new URL(remotes[ownerRemote].scopeUrl, base.url).href;
    // A syntactically valid non-hierarchical URL (for example `mailto:`)
    // still cannot act as the required base for a recorded relative file.
    new URL('.', ownerScopeUrl);
  } catch {
    return {
      candidateUrl: null,
      candidateUrlState: 'unusable-owner-scope',
      evidence: [baseEvidence, presentEvidence(scopePath)],
    };
  }

  try {
    return {
      candidateUrl: new URL(file, ownerScopeUrl).href,
      candidateUrlState: 'available',
      evidence: [baseEvidence, presentEvidence(scopePath)],
    };
  } catch {
    return {
      candidateUrl: null,
      candidateUrlState: 'unusable-file',
      evidence: [baseEvidence, presentEvidence(scopePath)],
    };
  }
}

function presentEvidence(path: EvidencePathSegment[]): EvidenceRef {
  return { source: 'snapshot', path, state: 'present' };
}

function missingEvidence(path: EvidencePathSegment[]): EvidenceRef {
  return { source: 'snapshot', path, state: 'missing' };
}

function provenance(...evidence: EvidenceRef[]): EvidenceProvenance {
  return { evidence };
}

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}
