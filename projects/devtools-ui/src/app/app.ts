import { NgComponentOutlet } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { environment } from '../environments/environment';
import { SnapshotExportService } from './shared/snapshot-export.service';
import { FederationStore } from './shared/store/federation-store';
import { hasPoolTags } from './views/pools/pools-view-model';
import { CaptureStatusStrip } from './shell/capture-status-strip';

@Component({
  selector: 'nf-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CaptureStatusStrip, NgComponentOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly exporter = inject(SnapshotExportService);
  private readonly store = inject(FederationStore);

  /** Dev-only shell additions (fixture picker); empty in the extension build. */
  protected readonly shellExtras = environment.shellExtras;

  protected readonly capturing = computed(() => this.store.state().status === 'capturing');

  protected readonly hasPools = computed(() => {
    const model = this.store.model();
    return model !== null && hasPoolTags(model.resolutionProjection);
  });

  /**
   * Capture identity of the current snapshot. Read from the store directly,
   * not through a view-model builder: the shell is channel-agnostic — which
   * page was captured when is evidence even when nothing was detected.
   * `capturedDate` is the UTC date part of the verbatim ISO stamp; the
   * full stamp stays available as the tooltip.
   */
  protected readonly capture = computed(() => {
    const state = this.store.state();
    if (state.status !== 'captured') {
      return null;
    }
    const { pageUrl, capturedAt } = state.snapshot.capture;
    return { pageUrl, capturedAt, capturedDate: capturedAt.slice(0, 10) };
  });

  protected refresh(): void {
    void this.store.refresh();
  }
}
