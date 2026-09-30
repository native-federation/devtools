import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { StateBadge } from '../shared/honest-state/state-badge';
import { FederationStore } from '../shared/store/federation-store';
import { CaptureStatusSource, buildCaptureStatus } from './capture-status';

/**
 * Shell-owned channel signaling: whether each evidence channel fed the
 * current capture, mapped to the tab it feeds. Views never re-signal
 * channel state.
 */
@Component({
  selector: 'nf-capture-status-strip',
  imports: [StateBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './capture-status-strip.html',
  styleUrl: './capture-status-strip.css',
})
export class CaptureStatusStrip {
  private readonly store = inject(FederationStore);

  private readonly source = computed<CaptureStatusSource>(() => {
    const state = this.store.state();
    if (state.status !== 'captured') {
      return { status: state.status };
    }
    const model = this.store.model();
    const derived = this.store.derived();
    // model/derived are non-null whenever a snapshot is captured; the
    // fallback only satisfies the type system.
    if (model === null || derived === null) {
      return { status: 'capturing' };
    }
    return {
      status: 'captured',
      channels: model.channels,
      mapMode: model.mapMode,
      effectiveMap: model.effectiveMap,
      generation: derived.generationBadge.generation,
      runtimeSource: model.provenance.runtimeSource,
    };
  });

  protected readonly vm = computed(() => buildCaptureStatus(this.source()));
}
