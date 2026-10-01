/**
 * Registry-serving-slot specs (Task 4): the basis slot derives from stored
 * order only — `scope` stays not-applicable, an empty registration stays
 * empty, and `cached` never re-elects the slot.
 */
import { FIXTURES } from 'devtools-bridge';

import { deriveRegistryServingSlots } from './derive-registry-serving-slots';
import { registryEvidenceId } from './ids';
import type {
  CanonicalRegistryEvidence,
  EvidenceProvenance,
  ParticipantDeclarationId,
  RegistrationAction,
  VersionRegistrationId,
} from './model';
import { normalizeRegistryEvidence } from './normalize-registry-evidence';

const EMPTY_PROVENANCE: EvidenceProvenance = { evidence: [] };

interface SeedRegistration {
  action: RegistrationAction;
  participants: { name: string; cached: boolean }[];
}

function seededEvidence(registrations: SeedRegistration[]): CanonicalRegistryEvidence {
  const evidence: CanonicalRegistryEvidence = {
    sharedExternals: [],
    versionRegistrations: [],
    participantDeclarations: [],
    privateRegistrations: [],
    entrypointCandidates: [],
    diagnostics: [],
  };
  const sharedId = registryEvidenceId('shared-external', ['__GLOBAL__', 'pkg'], 0);
  const versionIds: VersionRegistrationId[] = [];
  registrations.forEach((registration, index) => {
    const tag = `${index + 1}.0.0`;
    const versionId = registryEvidenceId(
      'version-registration',
      [sharedId, tag, registration.action],
      0,
    );
    const participantIds: ParticipantDeclarationId[] = registration.participants.map(
      (participant) => {
        const participantId = registryEvidenceId(
          'participant-declaration',
          [versionId, participant.name],
          0,
        );
        evidence.participantDeclarations.push({
          id: participantId,
          versionRegistrationId: versionId,
          ordinal: 0,
          participant: participant.name,
          requiredVersion: '*',
          strictVersion: false,
          bundle: null,
          cached: participant.cached,
          generation: 'v4.5',
          pool: null,
          servedBy: null,
          poolCause: null,
          entrypointCandidateIds: [],
          provenance: EMPTY_PROVENANCE,
        });
        return participantId;
      },
    );
    evidence.versionRegistrations.push({
      id: versionId,
      sharedExternalId: sharedId,
      ordinal: 0,
      tag,
      action: registration.action,
      rawAction: registration.action === 'unknown' ? 'mystery' : registration.action,
      host: false,
      participantDeclarationIds: participantIds,
      provenance: EMPTY_PROVENANCE,
    });
    versionIds.push(versionId);
  });
  evidence.sharedExternals.push({
    id: sharedId,
    ordinal: 0,
    shareScope: '__GLOBAL__',
    packageName: 'pkg',
    dirty: false,
    poolName: null,
    versionRegistrationIds: versionIds,
    provenance: EMPTY_PROVENANCE,
  });
  return evidence;
}

describe('deriveRegistryServingSlots — stored-order basis (T4-AC-05 identity, T4-AC-02 paths)', () => {
  it('derives one deterministic slot per corpus registration from stored order', () => {
    const evidence = normalizeRegistryEvidence(FIXTURES['pooling-anchor']);
    const slots = deriveRegistryServingSlots(evidence);

    expect(slots).toHaveLength(evidence.versionRegistrations.length);
    slots.forEach((slot, index) => {
      const registration = evidence.versionRegistrations[index];
      expect(slot.versionRegistrationId).toBe(registration.id);
      expect(slot.id).toBe(registryEvidenceId('registry-serving-slot-claim', [registration.id], 0));
      // Non-scope corpus registrations keep their first stored declaration.
      expect(slot.status).toBe('basis-slot');
      expect(slot.declarationId).toBe(registration.participantDeclarationIds[0]);
    });
  });

  it('marks a scope registration not-applicable while its raw first declaration stays available', () => {
    const evidence = normalizeRegistryEvidence(FIXTURES['strict-split']);
    const slots = deriveRegistryServingSlots(evidence);
    const scopeRegistration = evidence.versionRegistrations.find(
      (registration) => registration.action === 'scope',
    );
    expect(scopeRegistration).toBeDefined();
    const scopeSlot = slots.find((slot) => slot.versionRegistrationId === scopeRegistration!.id);

    expect(scopeSlot).toMatchObject({ status: 'not-applicable', declarationId: null });
    expect(scopeRegistration!.participantDeclarationIds.length).toBeGreaterThan(0);
    const skipSlot = slots.find(
      (slot) =>
        evidence.versionRegistrations.find(
          (registration) => registration.id === slot.versionRegistrationId,
        )!.action === 'skip',
    );
    // A skip registration records its basis precedence like any non-scope row.
    expect(skipSlot).toMatchObject({ status: 'basis-slot' });
  });

  it('keeps the first stored declaration when only a later declaration is cached (source-confirmed-unobserved)', () => {
    const evidence = seededEvidence([
      {
        action: 'share',
        participants: [
          { name: 'first-uncached', cached: false },
          { name: 'later-cached', cached: true },
        ],
      },
    ]);
    const [slot] = deriveRegistryServingSlots(evidence);

    expect(slot.status).toBe('basis-slot');
    expect(slot.declarationId).toBe(evidence.versionRegistrations[0].participantDeclarationIds[0]);
    expect(evidence.participantDeclarations[0].participant).toBe('first-uncached');
  });

  it('marks empty registrations empty and keeps unknown actions on the stored-order slot (source-confirmed-unobserved)', () => {
    const evidence = seededEvidence([
      { action: 'share', participants: [] },
      {
        action: 'unknown',
        participants: [
          { name: 'first', cached: false },
          { name: 'second', cached: false },
        ],
      },
    ]);
    const slots = deriveRegistryServingSlots(evidence);

    expect(slots[0]).toMatchObject({ status: 'empty', declarationId: null });
    expect(slots[1]).toMatchObject({
      status: 'basis-slot',
      declarationId: evidence.versionRegistrations[1].participantDeclarationIds[0],
    });
  });
});
