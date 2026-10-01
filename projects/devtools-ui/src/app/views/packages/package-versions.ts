import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ParticipantChip } from '../../shared/kit/participant-chip';
import { PackageDetail } from './package-detail';
import type { PackageDetailVm, PackageViewVm } from './packages-view-model';

/**
 * Detail pane of the Packages view (packages-verdicts T5/T6): one block per
 * share scope with the versions table, a version's deep dive opened inline
 * under its row, the range check, the torn banner and the per-copy bindings.
 * Dumb over `PackageViewVm`; which version is open is view state.
 */
@Component({
  selector: 'nf-package-versions',
  imports: [ParticipantChip, PackageDetail, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './package-versions.html',
  styleUrl: './package-versions.css',
})
export class PackageVersions {
  readonly view = input.required<PackageViewVm | null>();
  /** The focused scope's per-copy view; its parent link heads the pane. */
  readonly detail = input<PackageDetailVm | null>(null);

  // Open version per scope block (`<scope>|<pkg>` → tag); one per block, all closed at first.
  private readonly open = signal<ReadonlyMap<string, string>>(new Map());

  protected isOpen(scopeId: string, tag: string): boolean {
    return this.open().get(scopeId) === tag;
  }

  protected toggle(scopeId: string, tag: string): void {
    this.open.update((current) => {
      const next = new Map(current);
      if (next.get(scopeId) === tag) {
        next.delete(scopeId);
      } else {
        next.set(scopeId, tag);
      }
      return next;
    });
  }

  protected onKey(event: KeyboardEvent, scopeId: string, tag: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggle(scopeId, tag);
    }
  }
}
