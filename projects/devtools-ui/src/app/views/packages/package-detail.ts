import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ParticipantChip } from '../../shared/kit/participant-chip';
import { PackageDetailVm } from './packages-view-model';

/**
 * Bindings section of one scope block in the Packages view — the no-copies
 * line, the `unresolved` bindings, and the muted diagnostics footer. Dumb
 * over `PackageDetailVm`; renders the selection prompt while `detail` is null.
 */
@Component({
  selector: 'nf-package-detail',
  imports: [ParticipantChip, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './package-detail.html',
  styleUrl: './package-detail.css',
})
export class PackageDetail {
  readonly detail = input.required<PackageDetailVm | null>();
}
