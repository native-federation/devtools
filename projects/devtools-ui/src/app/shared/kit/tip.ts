import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  signal,
} from '@angular/core';

export interface Tip {
  head: string | null;
  lines: { label: string | null; text: string }[];
  list: boolean;
  above: boolean;
  x: number;
  y: number;
}

/**
 * Delegated tooltips for every `[data-tip]` under the host: `\n` separates lines, `label: text`
 * lines get their label set off, `data-tip-head` turns the first line into a heading and
 * `data-tip-list` splits on `, ` into columns. Render them with `<nf-tip />` inside the host.
 */
@Directive({
  selector: '[nfTips]',
  host: {
    '(mouseover)': 'show($event)',
    '(focusin)': 'show($event)',
    '(mouseout)': 'hide($event)',
    '(focusout)': 'hide($event)',
  },
})
export class TipHost {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly tip = signal<Tip | null>(null);
  private target: Element | null = null;

  constructor() {
    // A scroll anywhere (the page, a table scrolling sideways) moves the target away from its tooltip.
    const hide = () => this.hide();
    document.addEventListener('scroll', hide, true);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('scroll', hide, true));
  }

  show(event: Event): void {
    const target = (event.target as Element | null)?.closest<HTMLElement>('[data-tip]');
    if (!target || target === this.target || !this.host.nativeElement.contains(target)) return;
    const text = target.dataset['tip'];
    if (!text) return;
    this.target = target;
    const list = target.hasAttribute('data-tip-list');
    const lines = (list ? text.split(', ') : text.split('\n')).map(tipLine);
    const head = target.hasAttribute('data-tip-head') ? (lines.shift()?.text ?? null) : null;
    const rect = target.getBoundingClientRect();
    const above = rect.bottom + 160 > window.innerHeight && rect.top > 160;
    this.tip.set({
      head,
      lines: list ? lines.map((line) => ({ label: null, text: line.text })) : lines,
      list,
      above,
      x: Math.max(8, Math.min(rect.left, window.innerWidth - 368)),
      y: above ? rect.top - 6 : rect.bottom + 6,
    });
  }

  hide(event?: Event): void {
    const next = (event as MouseEvent | FocusEvent | undefined)?.relatedTarget as Node | null;
    if (next && this.target?.contains(next)) return;
    this.target = null;
    this.tip.set(null);
  }
}

// `cause: text` lines get their cause set off; a version like `^1.0.0` never reads as a label.
function tipLine(line: string): { label: string | null; text: string } {
  const match = /^([^:]{1,60}): (.*)$/s.exec(line);
  return match ? { label: match[1], text: match[2] } : { label: null, text: line };
}

@Component({
  selector: 'nf-tip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (host.tip(); as t) {
      <div
        class="nf-tip"
        role="tooltip"
        [class.nf-tip-above]="t.above"
        [class.nf-tip-list]="t.list"
        [style.left.px]="t.x"
        [style.top.px]="t.y"
      >
        @if (t.head) {
          <div class="nf-tip-head">{{ t.head }}</div>
        }
        @for (line of t.lines; track $index) {
          <div class="nf-tip-line">
            @if (line.label) {
              <span class="nf-tip-label">{{ line.label }}:</span>
            }
            {{ line.text }}
          </div>
        }
      </div>
    }
  `,
  styleUrl: './tip.css',
})
export class TipPopup {
  protected readonly host = inject(TipHost);
}
