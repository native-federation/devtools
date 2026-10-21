import { placementReasonText } from './placement-text';
import type { DeclarationVerdictRecord, PackageScopeVerdicts } from './store/resolution';
import { participantDisplay } from './view-conventions';

// Shared by Packages (Shipped by / Used by) and Remotes (Runs).
export function verdictNoteOf(
  record: DeclarationVerdictRecord,
  verdicts: PackageScopeVerdicts,
  electedRemote: string | null,
): string {
  const elected = verdicts.electedTag;
  const range = record.requiredVersion;
  switch (record.verdict) {
    case 'provides':
      return elected === null
        ? `strict scope · shares exact ${record.tag}`
        : `provides the shared ${record.tag} — the mapping publishes this build`;
    case 'same-version':
      return elected === null
        ? `strict scope · exact match of ${record.tag}`
        : `same version as the shared copy${electedRemote ? ` · resolves to ${participantDisplay(electedRemote)}'s build` : ''}`;
    case 'reuses-shared':
      return `${range} accepts ${elected} · resolves to the shared copy`;
    case 'subpool': {
      const why = record.reason === null ? null : placementReasonText(record.reason);
      return why === null ? subpoolWhereOf(record) : `${subpoolWhereOf(record)} · ${why}`;
    }
    case 'own-copy': {
      const why = record.reason === null ? null : placementReasonText(record.reason);
      if (why !== null) return `${why} · runs ${ownWholeOf(record)} from its own build`;
      return ownCopyFallbackOf(record, verdicts);
    }
    case 'out-of-range':
      return `${range} rejects ${elected} · not strict · resolves to ${elected} anyway — the orchestrator stores a plain skip`;
    case 'unknown':
      return 'the stored row and the declared range do not determine a verdict in this capture';
  }
}

export function subpoolWhereOf(record: DeclarationVerdictRecord): string {
  if (record.subpoolOf === record.participant) return 'its build serves a subpool of its pool';
  const owner = record.subpoolOf === null ? 'another remote' : participantDisplay(record.subpoolOf);
  return `runs ${owner}'s build in a subpool of its pool`;
}

export function ownWholeOf(record: DeclarationVerdictRecord): string {
  return record.reason?.scope === 'pool' ? 'its whole pool' : `its own ${record.tag}`;
}

// Before 4.8 nothing names the serving build; a strict rejection is the one reading the rows allow.
export function ownCopyFallbackOf(
  record: DeclarationVerdictRecord,
  verdicts: PackageScopeVerdicts,
): string {
  return record.strictVersion && record.acceptsElected === false
    ? `${record.requiredVersion} rejects ${verdicts.electedTag} · strict · keeps its own ${record.tag}`
    : `keeps its own ${record.tag} · the stored rows do not say why`;
}
