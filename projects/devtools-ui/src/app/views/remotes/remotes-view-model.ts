/**
 * Remotes view model — the per-remote perspective (spec 4.2): what is the
 * state of this remote? The detail is the transposed projection — all
 * packages from one participant's point of view; a package's full
 * negotiation is deliberately NOT repeated here (one click away via the
 * package link). Inputs are the store model's canonical read surface plus
 * caller-owned UI state; the output is render-ready only: templates
 * consume these rows, never store types (XC-06).
 *
 * This file is the FACADE: the left list and the public surface. The
 * detail half lives beside it (`remotes-detail-vm.ts`). Views import from
 * here only.
 */
import type { TreeTableRow } from '../../shared/kit/tree-table';
import type { FederationModel } from '../../shared/store/federation-model';
import { buildCanonicalIndexes, countClaim } from '../../shared/view-conventions';
import { RemoteDetailVm, buildRemoteDetail } from './remotes-detail-vm';
import { LISTED_KINDS, RunsKind, buildRuns } from './remotes-runs-vm';

export type {
  AnnotationVm,
  CapabilityVm,
  ExposeVm,
  RelationConsumerVm,
  RemoteChunkRowVm,
  RemoteChunkSectionVm,
  RemoteDetailVm,
  ScopedClaimVm,
  ScopedPackageVm,
} from './remotes-detail-vm';
export type {
  RemoteRefVm,
  RunsEntrypointVm,
  RunsKind,
  RunsRowVm,
  RunsTallyVm,
  RunsVm,
  ServesRowVm,
} from './remotes-runs-vm';

/** Caller-owned UI state — selection lives in the view. */
export interface RemotesUiState {
  /** Verbatim remote name, seeded from the `select` query param. */
  selectedName: string | null;
}

/** One remote of the left list, model order. */
export interface RemoteRowVm {
  kind: 'remote';
  /** Verbatim remote name — selection and select payloads match it. */
  name: string;
  host: boolean;
  /** What runs off the norm (`2 own build`); empty reads as `ok`. */
  marks: { kind: RunsKind; label: string }[];
  /** Distinct remotes running one of its builds; null when none does. */
  serves: { label: string; note: string } | null;
}

export interface RemotesVm {
  remoteCount: number;
  rows: TreeTableRow<RemoteRowVm>[];
  detail: RemoteDetailVm | null;
  /** Capture-boundary statement — what this list cannot enumerate. */
  boundaryNote: string;
  /** Honest empty note; null while the list has rows. */
  emptyNote: string | null;
}

/**
 * A remote without any registry trace is indistinguishable from an absent
 * one in passive capture data, so the claim is a capture boundary, never an
 * error (spec 2.3) — and never a statement about loading or delivery.
 */
export const REMOTES_BOUNDARY_NOTE =
  'a remote without a registry trace in this capture cannot appear here — this list cannot enumerate what the capture cannot see';

export function buildRemotesVm(model: FederationModel, ui: RemotesUiState): RemotesVm {
  const indexes = buildCanonicalIndexes(model);
  const rows: TreeTableRow<RemoteRowVm>[] = model.remotes.map((remote) => {
    const runs = buildRuns(remote, model, indexes);
    const counts = new Map<RunsKind, number>();
    for (const row of runs.rows) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
    const marks = (Object.keys(LISTED_KINDS) as RunsKind[])
      .filter((kind) => counts.has(kind))
      .map((kind) => ({ kind, label: `${counts.get(kind)} ${LISTED_KINDS[kind]}` }));
    const served = [...new Set(runs.serves.flatMap((row) => row.to.map((ref) => ref.name)))];
    return {
      id: remote.name,
      depth: 0,
      expandable: false,
      expanded: false,
      payload: {
        kind: 'remote' as const,
        name: remote.name,
        host: remote.isHost,
        marks,
        serves:
          served.length === 0
            ? null
            : {
                label: `serves ${served.length}`,
                note: `${countClaim(served.length, 'remote')} ${served.length === 1 ? 'runs' : 'run'} one of its builds: ${served.join(', ')}`,
              },
      },
    };
  });

  return {
    remoteCount: model.remotes.length,
    rows,
    detail: buildRemoteDetail(model, indexes, ui.selectedName),
    boundaryNote: REMOTES_BOUNDARY_NOTE,
    emptyNote: rows.length === 0 ? 'no remotes in this capture' : null,
  };
}
