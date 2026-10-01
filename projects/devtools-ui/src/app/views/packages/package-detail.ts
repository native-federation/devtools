import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { StateBadge } from '../../shared/honest-state/state-badge';
import { ParticipantChip } from '../../shared/kit/participant-chip';
import { PackageDetailVm } from './packages-view-model';

/**
 * Detail pane of the Packages view — meta line, then one block per resolved
 * copy (header, mapped file lines with SRI, consumer rows with deviation
 * annotations, nested chunk claims), the `unresolved` bucket, and the muted
 * diagnostics footer (T7.5). Dumb over `PackageDetailVm`; renders the
 * selection prompt while `detail` is null.
 */
@Component({
  selector: 'nf-package-detail',
  imports: [ParticipantChip, RouterLink, StateBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './package-detail.html',
  styleUrl: './package-detail.css',
})
export class PackageDetail {
  readonly detail = input.required<PackageDetailVm | null>();
  /** Inside a scope block: the package header and meta line come from the block. */
  readonly embedded = input(false);
}
