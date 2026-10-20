import type {
  DeclarationResolutionClaim,
  ResolutionClaimsDerivation,
  ResolutionSubject,
  SourceMatch,
} from './claims-model';
import type {
  ResolvedCopyEffectiveRole,
  ResolvedCopyResolutionContext,
  ResolvedCopySource,
  ResolvedCopySourceDisposition,
  ResolvedCopySourceRegistrationRef,
  ResolvedDependencyCopy,
  ResolvedDependencyCopyId,
} from './copies-model';
import { encodeRegistryIdTuple, registryEvidenceId } from './ids';
import type {
  CanonicalRegistryEvidence,
  EffectiveConsumerResolution,
  EntrypointCandidate,
  EvidenceRef,
  MappedEffectiveConsumerResolution,
  ParticipantDeclaration,
  PrivateRegistration,
  RegistrationAction,
  SharedExternalRecord,
  VersionRegistration,
  VersionRegistrationId,
} from './model';

export interface MaterializeResolvedCopiesContext {
  /**
   * Opaque identity of the snapshot the derivation ran on, used only to
   * namespace URL-identified copy IDs for cross-snapshot storage. Producers
   * derive it from capture identity; it never influences source-identified
   * copies.
   */
  snapshotIdentity: string;
}

/**
 * Materializes resolved dependency copies from mapped effective resolutions
 * and their claims. Candidates and participant membership alone never create
 * a copy; unmapped, blocked, and unknown bindings contribute nothing. The
 * derivation is pure: byte-equal inputs produce byte-equal copies.
 */
export function materializeResolvedCopies(
  evidence: CanonicalRegistryEvidence,
  resolutions: readonly EffectiveConsumerResolution[],
  claims: ResolutionClaimsDerivation,
  context: MaterializeResolvedCopiesContext,
): ResolvedDependencyCopy[] {
  const records = indexEvidence(evidence);
  const sourceMatchByResolution = new Map(
    claims.sourceMatches.map((sourceMatch) => [sourceMatch.resolutionId, sourceMatch]),
  );
  const providerByResolution = new Map(
    claims.observedTargetProviders.map((provider) => [provider.resolutionId, provider]),
  );
  const slotByRegistration = new Map(
    claims.registryServingSlotClaims.map((slot) => [slot.versionRegistrationId, slot]),
  );
  const claimsByResolution = new Map<string, DeclarationResolutionClaim[]>();
  for (const claim of claims.declarationResolutionClaims) {
    const list = claimsByResolution.get(claim.effectiveResolutionId) ?? [];
    list.push(claim);
    claimsByResolution.set(claim.effectiveResolutionId, list);
  }

  interface Member {
    resolution: MappedEffectiveConsumerResolution;
    sourceMatch: SourceMatch;
  }
  const sourceGroups = new Map<string, { source: ResolutionSubject; members: Member[] }>();
  const urlGroups = new Map<string, Member[]>();
  for (const resolution of resolutions) {
    if (resolution.status !== 'mapped') {
      continue;
    }
    const sourceMatch = requireRecord(sourceMatchByResolution, resolution.id, 'source match');
    if (sourceMatch.outcome === 'exact-candidate' && sourceMatch.source !== null) {
      const key = subjectKey(sourceMatch.source);
      const group = sourceGroups.get(key) ?? { source: sourceMatch.source, members: [] };
      group.members.push({ resolution, sourceMatch });
      sourceGroups.set(key, group);
    } else {
      const members = urlGroups.get(resolution.targetUrl) ?? [];
      members.push({ resolution, sourceMatch });
      urlGroups.set(resolution.targetUrl, members);
    }
  }

  // An exact source copy is never duplicated because another consumer context
  // or external record points at one of its candidate URLs: a URL group whose
  // URL is owned by exactly one materialized source joins that copy instead.
  const owningSubjectByUrl = new Map<string, Set<string>>();
  for (const group of sourceGroups.values()) {
    for (const url of sourceCandidateUrls(group.source, records)) {
      const owners = owningSubjectByUrl.get(url) ?? new Set();
      owners.add(subjectKey(group.source));
      owningSubjectByUrl.set(url, owners);
    }
  }
  for (const [url, members] of [...urlGroups]) {
    const owners = owningSubjectByUrl.get(url);
    if (owners === undefined || owners.size !== 1) {
      continue;
    }
    const [ownerKey] = owners;
    const owningGroup = sourceGroups.get(ownerKey);
    if (owningGroup !== undefined) {
      owningGroup.members.push(...members);
      urlGroups.delete(url);
    }
  }

  const copies: ResolvedDependencyCopy[] = [];
  for (const group of sourceGroups.values()) {
    copies.push(
      assembleCopy({
        id: registryEvidenceId(
          'resolved-dependency-copy',
          ['source', group.source.kind, subjectRecordId(group.source)],
          0,
        ),
        ...sourceFacts(group.source, records),
        members: group.members,
      }),
    );
  }
  for (const [url, members] of urlGroups) {
    const ambiguous = members.some(
      (member) => member.sourceMatch.outcome === 'ambiguous-candidate',
    );
    const evidencedSources = ambiguous ? ambiguousSourceEvidence(members, records) : null;
    copies.push(
      assembleCopy({
        id: registryEvidenceId(
          'resolved-dependency-copy',
          ['target-url', context.snapshotIdentity, url],
          0,
        ),
        source: { kind: 'target-url', targetUrl: url },
        sourcePackage: null,
        resolvedTag: null,
        sourceDisposition: ambiguous ? 'ambiguous-source' : 'target-only',
        sourceActions: evidencedSources?.actions ?? [],
        sourceRegistrationRefs: evidencedSources?.registrationRefs ?? [],
        sourceEvidence: members.flatMap((member) => member.sourceMatch.provenance.evidence),
        members,
      }),
    );
  }
  return copies.sort((a, b) => compareText(a.id, b.id));

  interface CopyAssembly {
    id: ResolvedDependencyCopyId;
    source: ResolvedCopySource;
    sourcePackage: string | null;
    resolvedTag: string | null;
    sourceDisposition: ResolvedCopySourceDisposition;
    sourceActions: (RegistrationAction | 'private')[];
    sourceRegistrationRefs: ResolvedCopySourceRegistrationRef[];
    sourceEvidence: EvidenceRef[];
    members: Member[];
  }

  function assembleCopy(assembly: CopyAssembly): ResolvedDependencyCopy {
    const roles = new Set<ResolvedCopyEffectiveRole>();
    const contextsByKey = new Map<string, ResolvedCopyResolutionContext>();
    for (const member of assembly.members) {
      for (const claim of claimsByResolution.get(member.resolution.id) ?? []) {
        const role = claimRole(claim, assembly.sourceDisposition);
        if (role !== null) {
          roles.add(role);
        }
        const contextKey = encodeRegistryIdTuple([
          claim.resolutionDomain.kind,
          claim.resolutionDomain.kind === 'share-scope'
            ? claim.resolutionDomain.name
            : claim.resolutionDomain.remote,
          claim.consumerRegistryPackage,
        ]);
        const resolutionContext = contextsByKey.get(contextKey) ?? {
          resolutionDomain: claim.resolutionDomain,
          consumerRegistryPackage: claim.consumerRegistryPackage,
          claimIds: [],
        };
        resolutionContext.claimIds.push(claim.id);
        contextsByKey.set(contextKey, resolutionContext);
      }
    }
    if (roles.size === 0) {
      roles.add('unclassified');
    }
    const resolutionContexts = [...contextsByKey.entries()]
      .sort(([a], [b]) => compareText(a, b))
      .map(([, resolutionContext]) => ({
        ...resolutionContext,
        claimIds: [...resolutionContext.claimIds].sort(compareText),
      }));
    const sortedMembers = [...assembly.members].sort((a, b) =>
      compareText(a.resolution.id, b.resolution.id),
    );
    const entrypoints = Object.fromEntries(
      sortedMembers
        .map((member) => [member.resolution.specifier, member.resolution.targetUrl] as const)
        .sort(([a], [b]) => compareText(a, b)),
    );
    const observedTargetProviders = sortedMembers
      .map((member) =>
        requireRecord(providerByResolution, member.resolution.id, 'observed provider'),
      )
      .sort((a, b) => compareText(a.id, b.id));
    const registryServingSlotClaims = assembly.sourceRegistrationRefs
      .filter((ref): ref is { kind: 'shared'; id: VersionRegistrationId } => ref.kind === 'shared')
      .map((ref) => requireRecord(slotByRegistration, ref.id, 'registry serving slot'))
      .sort((a, b) => compareText(a.id, b.id));
    return {
      id: assembly.id,
      sourcePackage: assembly.sourcePackage,
      resolvedTag: assembly.resolvedTag,
      source: assembly.source,
      sourceDisposition: assembly.sourceDisposition,
      effectiveRoles: [...roles].sort(compareText),
      sourceActions: assembly.sourceActions,
      entrypoints,
      effectiveResolutionIds: sortedDistinct(sortedMembers.map((member) => member.resolution.id)),
      resolutionContexts,
      sourceRegistrationRefs: assembly.sourceRegistrationRefs,
      observedTargetProviders,
      registryServingSlotClaims,
      // `attachBundleClaimIds` completes the field after bundle-claim derivation.
      bundleClaimIds: [],
      provenance: { evidence: assembly.sourceEvidence },
    };
  }
}

/**
 * Completes the canonical claim contract after materialization: mapped claims
 * reference the copy their binding materializes; unmapped, blocked, and
 * unknown claims carry an explicit null.
 */
export function attachCopyIds(
  declarationResolutionClaims: readonly DeclarationResolutionClaim[],
  copies: readonly ResolvedDependencyCopy[],
): DeclarationResolutionClaim[] {
  const copyIdByClaim = new Map<string, ResolvedDependencyCopyId>();
  for (const copy of copies) {
    for (const resolutionContext of copy.resolutionContexts) {
      for (const claimId of resolutionContext.claimIds) {
        copyIdByClaim.set(claimId, copy.id);
      }
    }
  }
  return declarationResolutionClaims.map((claim) => ({
    ...claim,
    copyId: copyIdByClaim.get(claim.id) ?? null,
  }));
}

interface EvidenceIndex {
  sharedById: ReadonlyMap<string, SharedExternalRecord>;
  versionsById: ReadonlyMap<string, VersionRegistration>;
  declarationsById: ReadonlyMap<string, ParticipantDeclaration>;
  privatesById: ReadonlyMap<string, PrivateRegistration>;
  candidatesById: ReadonlyMap<string, EntrypointCandidate>;
}

function indexEvidence(evidence: CanonicalRegistryEvidence): EvidenceIndex {
  return {
    sharedById: new Map(evidence.sharedExternals.map((record) => [record.id, record])),
    versionsById: new Map(evidence.versionRegistrations.map((record) => [record.id, record])),
    declarationsById: new Map(
      evidence.participantDeclarations.map((record) => [record.id, record]),
    ),
    privatesById: new Map(evidence.privateRegistrations.map((record) => [record.id, record])),
    candidatesById: new Map(evidence.entrypointCandidates.map((record) => [record.id, record])),
  };
}

/** Source facts come from the uniquely matched source records only. */
function sourceFacts(
  source: ResolutionSubject,
  records: EvidenceIndex,
): {
  source: ResolvedCopySource;
  sourcePackage: string;
  resolvedTag: string;
  sourceDisposition: ResolvedCopySourceDisposition;
  sourceActions: (RegistrationAction | 'private')[];
  sourceRegistrationRefs: ResolvedCopySourceRegistrationRef[];
  sourceEvidence: EvidenceRef[];
} {
  if (source.kind === 'shared') {
    const declaration = requireRecord(
      records.declarationsById,
      source.participantDeclarationId,
      'participant declaration',
    );
    const registration = requireRecord(
      records.versionsById,
      declaration.versionRegistrationId,
      'version registration',
    );
    const shared = requireRecord(
      records.sharedById,
      registration.sharedExternalId,
      'shared external',
    );
    return {
      source: {
        kind: 'shared-declaration',
        declarationId: declaration.id,
        participant: declaration.participant,
      },
      sourcePackage: shared.packageName,
      resolvedTag: registration.tag,
      sourceDisposition: sharedDisposition(registration.action),
      sourceActions: [registration.action],
      sourceRegistrationRefs: [{ kind: 'shared', id: registration.id }],
      sourceEvidence: [...registration.provenance.evidence, ...declaration.provenance.evidence],
    };
  }
  const privateRegistration = requireRecord(
    records.privatesById,
    source.privateRegistrationId,
    'private registration',
  );
  return {
    source: {
      kind: 'private-registration',
      registrationId: privateRegistration.id,
      ownerRemote: privateRegistration.ownerRemote,
    },
    sourcePackage: privateRegistration.packageName,
    resolvedTag: privateRegistration.tag,
    sourceDisposition: 'private-registration',
    sourceActions: ['private'],
    sourceRegistrationRefs: [{ kind: 'private', id: privateRegistration.id }],
    sourceEvidence: [...privateRegistration.provenance.evidence],
  };
}

function sharedDisposition(action: RegistrationAction): ResolvedCopySourceDisposition {
  switch (action) {
    case 'share':
      return 'share-registration';
    case 'skip':
      return 'skip-registration';
    case 'scope':
      return 'scope-registration';
    case 'unknown':
      return 'unknown-registration';
  }
}

function sourceCandidateUrls(source: ResolutionSubject, records: EvidenceIndex): string[] {
  const candidateIds =
    source.kind === 'shared'
      ? requireRecord(records.declarationsById, source.participantDeclarationId, 'declaration')
          .entrypointCandidateIds
      : requireRecord(records.privatesById, source.privateRegistrationId, 'private registration')
          .entrypointCandidateIds;
  const urls: string[] = [];
  for (const candidateId of candidateIds) {
    const candidate = requireRecord(records.candidatesById, candidateId, 'entrypoint candidate');
    if (candidate.candidateUrl !== null) {
      urls.push(candidate.candidateUrl);
    }
  }
  return urls;
}

/** Evidenced sources behind an ambiguous exact match; never a consumer claim's action. */
function ambiguousSourceEvidence(
  members: readonly { sourceMatch: SourceMatch }[],
  records: EvidenceIndex,
): {
  actions: (RegistrationAction | 'private')[];
  registrationRefs: ResolvedCopySourceRegistrationRef[];
} {
  const actions = new Set<RegistrationAction | 'private'>();
  const refsByKey = new Map<string, ResolvedCopySourceRegistrationRef>();
  for (const member of members) {
    for (const candidateId of member.sourceMatch.candidateIds) {
      const candidate = requireRecord(records.candidatesById, candidateId, 'entrypoint candidate');
      if (candidate.sourceRecord.kind === 'private-entry') {
        actions.add('private');
        const id = candidate.sourceRecord.privateRegistrationId;
        refsByKey.set(encodeRegistryIdTuple(['private', id]), { kind: 'private', id });
        continue;
      }
      const declaration = requireRecord(
        records.declarationsById,
        candidate.sourceRecord.participantDeclarationId,
        'participant declaration',
      );
      const registration = requireRecord(
        records.versionsById,
        declaration.versionRegistrationId,
        'registration',
      );
      actions.add(registration.action);
      refsByKey.set(encodeRegistryIdTuple(['shared', registration.id]), {
        kind: 'shared',
        id: registration.id,
      });
    }
  }
  return {
    actions: [...actions].sort(compareText),
    registrationRefs: [...refsByKey.entries()]
      .sort(([a], [b]) => compareText(a, b))
      .map(([, ref]) => ref),
  };
}

/**
 * The effective role one claim contributes, derived from the claim and the
 * source action — never from consumer counts: a selected `share` surface is
 * `ordinary-shared`, a `scope` declaration's own mapping is `isolated-own`,
 * and memberships outside the closed rules contribute nothing (the copy-level
 * backstop is `unclassified`).
 */
function claimRole(
  claim: DeclarationResolutionClaim,
  disposition: ResolvedCopySourceDisposition,
): ResolvedCopyEffectiveRole | null {
  switch (claim.mappingState) {
    case 'anchored':
      return 'anchor-source';
    case 'fallback':
      return 'ordinary-shared';
    case 'own-selected':
      switch (disposition) {
        case 'share-registration':
          return 'ordinary-shared';
        case 'scope-registration':
          return 'isolated-own';
        case 'private-registration':
          return 'private-own';
        default:
          return null;
      }
    default:
      return null;
  }
}

function subjectKey(subject: ResolutionSubject): string {
  return encodeRegistryIdTuple([subject.kind, subjectRecordId(subject)]);
}

function subjectRecordId(subject: ResolutionSubject): string {
  return subject.kind === 'shared'
    ? subject.participantDeclarationId
    : subject.privateRegistrationId;
}

function sortedDistinct<Value extends string>(values: readonly Value[]): Value[] {
  return [...new Set(values)].sort(compareText);
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function requireRecord<Key, RecordType>(
  records: ReadonlyMap<Key, RecordType>,
  id: Key,
  label: string,
): RecordType {
  const record = records.get(id);
  if (record === undefined) {
    throw new Error(
      `Resolved-copy derivation references a missing ${String(label)}: ${String(id)}`,
    );
  }
  return record;
}
