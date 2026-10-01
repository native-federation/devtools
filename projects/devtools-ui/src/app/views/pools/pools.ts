import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ParticipantChip } from '../../shared/kit/participant-chip';
import { FederationStore } from '../../shared/store/federation-store';
import {
  POOLING_DOCS_URL,
  POOLS_DEFINITION,
  POOL_LEGEND,
  PoolsVm,
  buildPoolsVm,
} from './pools-view-model';

/**
 * Pools tab — one card per explicit-tag pool: a matrix of every remote's copy
 * of every member, grouped by the build it loads, and one verdict under it.
 */
@Component({
  selector: 'nf-pools-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ParticipantChip, RouterLink],
  templateUrl: './pools.html',
  styleUrl: './pools.css',
})
export class PoolsView {
  private readonly store = inject(FederationStore);

  // `/pools?select=<pool ID>` from a chip or a graph cluster; an unknown ID highlights nothing.
  protected readonly selectedId = signal<string | null>(null);

  constructor() {
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed())
      .subscribe((params) => this.selectedId.set(params.get('select')));
  }

  protected readonly definition = POOLS_DEFINITION;
  protected readonly docsUrl = POOLING_DOCS_URL;
  protected readonly legend = POOL_LEGEND;

  protected readonly vm = computed<PoolsVm | null>(() => {
    const model = this.store.model();
    return model === null
      ? null
      : buildPoolsVm(model.resolutionProjection, model.provenance.orchestratorVersion);
  });
}
