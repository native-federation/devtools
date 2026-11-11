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
 * `data-tip-list` splits on `, ` into a scrollable list and `data-tip-cursor` places it at the pointer (for
 * targets whose box says little, like a graph edge). Render them with `<nf-tip />` inside the host.
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
    // A scroll anywhere (the page, a table scrolling sideways) moves the target away from its tooltip;
    // scrolling the list inside the tooltip itself doesn't.
    const hide = (event: Event) => {
      if (!isInTip(event.target)) this.hide();
    };
    document.addEventListener('scroll', hide, true);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('scroll', hide, true));
  }

  show(event: Event): void {
    const target = (event.target as Element | null)?.closest<HTMLElement | SVGElement>(
      '[data-tip]',
    );
    if (!target || target === this.target || !this.host.nativeElement.contains(target)) return;
    const text = target.dataset['tip'];
    if (!text) return;
    this.target = target;
    const list = target.hasAttribute('data-tip-list');
    const lines = (list ? text.split(', ') : text.split('\n')).map(tipLine);
    const head = target.hasAttribute('data-tip-head') ? (lines.shift()?.text ?? null) : null;
    const rect =
      target.hasAttribute('data-tip-cursor') && event instanceof MouseEvent
        ? new DOMRect(event.clientX, event.clientY, 0, 12)
        : target.getBoundingClientRect();
    const room = list ? 260 : 160;
    const above = rect.bottom + room > window.innerHeight && rect.top > room;
    // No gap under a list: the pointer must reach it without crossing anything that hides it.
    const gap = list ? 0 : 6;
    this.tip.set({
      head,
      lines: list ? lines.map((line) => ({ label: null, text: line.text })) : lines,
      list,
      above,
      // Keep the widest tip (see tip.css max-width) inside the viewport.
      x: Math.max(8, Math.min(rect.left, window.innerWidth - (list ? 568 : 368))),
      y: above ? rect.top - gap : rect.bottom + gap,
    });
  }

  hide(event?: Event): void {
    const next = (event as MouseEvent | FocusEvent | undefined)?.relatedTarget as Node | null;
    if (next && (this.target?.contains(next) || isInTip(next))) return;
    this.target = null;
    this.tip.set(null);
  }
}

function isInTip(node: EventTarget | null): boolean {
  return node instanceof Element && node.closest('.nf-tip') !== null;
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
