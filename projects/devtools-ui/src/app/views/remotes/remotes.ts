import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { MasterDetail } from '../../shared/kit/master-detail';
import { TipHost, TipPopup } from '../../shared/kit/tip';
import { ParticipantChip } from '../../shared/kit/participant-chip';
import { TreeTable, TreeTableRow } from '../../shared/kit/tree-table';
import { FederationStore } from '../../shared/store/federation-store';
import { RemoteDetail } from './remote-detail';
import {
  REMOTES_BOUNDARY_NOTE,
  RemoteRowVm,
  RemotesVm,
  buildRemotesVm,
} from './remotes-view-model';

/**
 * Remotes tab — the per-remote perspective: what is the state of this
 * remote? Dumb component over the pure `buildRemotesVm` builder; the left
 * list holds the remotes in model order (host marked by the chip), the
 * detail pane (`nf-remote-detail`) renders the transposed projection.
 * Selection is view-owned UI state, never store state; the `select` query
 * param seeds it with the VERBATIM remote name — cross-links arrive as
 * `/remotes?select=__NF-HOST__` (cross-link convention, see
 * `app.routes.ts`).
 */
@Component({
  selector: 'nf-remotes-view',
  imports: [TreeTable, MasterDetail, ParticipantChip, RemoteDetail, TipPopup],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './remotes.html',
  styleUrl: './remotes.css',
  hostDirectives: [TipHost],
})
export class RemotesView {
  private readonly store = inject(FederationStore);

  /** Heading tooltip — the list's capture-boundary claim (screenshot review). */
  protected readonly boundaryNote = REMOTES_BOUNDARY_NOTE;

  protected readonly selectedName = signal<string | null>(
    inject(ActivatedRoute).snapshot.queryParamMap.get('select'),
  );

  protected readonly vm = computed<RemotesVm | null>(() => {
    const model = this.store.model();
    if (model === null) {
      return null;
    }
    return buildRemotesVm(model, { selectedName: this.selectedName() });
  });

  protected onSelect(row: TreeTableRow): void {
    this.selectedName.set((row.payload as RemoteRowVm).name);
  }
}
