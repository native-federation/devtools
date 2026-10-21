import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ParticipantChip } from '../../shared/kit/participant-chip';
import { countClaim } from '../../shared/view-conventions';
import { RemoteChunkSectionVm, RemoteDetailVm } from './remotes-view-model';

/**
 * Detail pane of the Remotes view: identity and exposes on one meta line, where each package
 * runs from (a row opens its declaration, pool and entrypoints), whom its builds serve, then
 * private registrations, claim-less bindings and chunks when the capture has them.
 * Dumb over `RemoteDetailVm`; which row is open is view state.
 */
@Component({
  selector: 'nf-remote-detail',
  imports: [ParticipantChip, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './remote-detail.html',
  styleUrl: './remote-detail.css',
})
export class RemoteDetail {
  readonly detail = input.required<RemoteDetailVm | null>();

  private readonly open = signal<string | null>(null);
  private readonly name = computed(() => this.detail()?.name ?? null);

  constructor() {
    // Another remote closes the open row; a refresh of the same one keeps it.
    effect(() => {
      this.name();
      this.open.set(null);
    });
  }

  protected isOpen(key: string): boolean {
    return this.open() === key;
  }

  protected toggle(key: string): void {
    this.open.update((current) => (current === key ? null : key));
  }

  protected onKey(event: KeyboardEvent, key: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggle(key);
    }
  }

  protected chunkCount(chunks: RemoteChunkSectionVm): string {
    switch (chunks.level) {
      case 'bundle-claims':
        return countClaim(chunks.rows.length, 'bundle');
      case 'carrier-groups':
        return countClaim(chunks.groups.length, 'group');
      default:
        return '';
    }
  }
}
