import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { TreeTable, TreeTableRow, TreeTableToggle } from './tree-table';

interface RowPayload {
  name: string;
}

// Test scaffolding only — real consumers keep templates in separate files.
@Component({
  imports: [TreeTable],
  template: `
    <nf-tree-table
      [rows]="rows()"
      [selectedId]="selectedId()"
      label="test tree"
      (toggleRow)="toggles.push($event)"
      (selectRow)="selections.push($event)"
    >
      <ng-template let-payload let-row="row">
        <span class="cell-name">{{ payload.name }}</span>
      </ng-template>
    </nf-tree-table>
  `,
})
class TreeTableHost {
  readonly rows = signal<readonly TreeTableRow<RowPayload>[]>(makeRows());
  readonly selectedId = signal<string | null>(null);
  readonly toggles: TreeTableToggle[] = [];
  readonly selections: TreeTableRow[] = [];
}

function makeRows(): TreeTableRow<RowPayload>[] {
  return [
    {
      id: 'parent',
      depth: 0,
      expandable: true,
      expanded: true,
      payload: { name: '@scope/parent' },
    },
    { id: 'child', depth: 1, expandable: false, expanded: false, payload: { name: 'child.js' } },
    {
      id: 'sibling',
      depth: 0,
      expandable: true,
      expanded: false,
      payload: { name: '@scope/sibling' },
    },
  ];
}

function createHost() {
  const fixture = TestBed.createComponent(TreeTableHost);
  fixture.detectChanges();
  const rowEls = () =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.tree-row'));
  return { fixture, host: fixture.componentInstance, rowEls };
}

function keydown(el: HTMLElement, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('TreeTable (view kit)', () => {
  // T9-AC-01: depth-indented rows from a flat input, payload via template.
  it('renders depth-indented rows from a flat row list', () => {
    const { rowEls } = createHost();
    const rows = rowEls();
    expect(rows).toHaveLength(3);
    expect(rows.map((el) => el.getAttribute('aria-level'))).toEqual(['1', '2', '1']);
    expect(rows.map((el) => el.style.getPropertyValue('--tree-depth'))).toEqual(['0', '1', '0']);
    expect(rows[0].querySelector('.cell-name')?.textContent).toBe('@scope/parent');
    expect(rows[1].querySelector('.cell-name')?.textContent).toBe('child.js');
  });

  // T9-AC-01: expand/collapse only emits — the component holds no expansion
  // state; re-rendering with updated input is the caller's job.
  it('twisty click emits a toggle request without changing its own rendering', () => {
    const { fixture, host, rowEls } = createHost();
    const sibling = () => rowEls()[2];
    sibling().querySelector<HTMLButtonElement>('.twisty')!.click();
    fixture.detectChanges();

    expect(host.toggles).toEqual([{ id: 'sibling', expanded: true }]);
    // A twisty click is not a selection click.
    expect(host.selections).toEqual([]);
    // Input unchanged — the row still renders collapsed.
    expect(sibling().getAttribute('aria-expanded')).toBe('false');

    host.rows.update((rows) =>
      rows.map((row) => (row.id === 'sibling' ? { ...row, expanded: true } : row)),
    );
    fixture.detectChanges();
    expect(sibling().getAttribute('aria-expanded')).toBe('true');
  });

  // T9-AC-02: Up/Down move focus via roving tabindex.
  it('moves focus with ArrowDown and ArrowUp', () => {
    const { fixture, rowEls } = createHost();
    const rows = rowEls();
    rows[0].focus();
    keydown(rows[0], 'ArrowDown');
    fixture.detectChanges();

    expect(document.activeElement).toBe(rows[1]);
    expect(rows.map((el) => el.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);

    keydown(rows[1], 'ArrowUp');
    fixture.detectChanges();
    expect(document.activeElement).toBe(rows[0]);
    expect(rows[0].getAttribute('tabindex')).toBe('0');
  });

  // T9-AC-02: Right/Left emit expand/collapse requests, never mutate rows.
  it('ArrowRight and ArrowLeft emit expansion requests on expandable rows only', () => {
    const { host, rowEls } = createHost();
    const [parent, child, sibling] = rowEls();

    keydown(sibling, 'ArrowRight');
    expect(host.toggles).toEqual([{ id: 'sibling', expanded: true }]);

    keydown(parent, 'ArrowLeft');
    expect(host.toggles).toEqual([
      { id: 'sibling', expanded: true },
      { id: 'parent', expanded: false },
    ]);

    // Already in the requested state, or not expandable: no emit.
    keydown(parent, 'ArrowRight');
    keydown(sibling, 'ArrowLeft');
    keydown(child, 'ArrowRight');
    keydown(child, 'ArrowLeft');
    expect(host.toggles).toHaveLength(2);
  });

  // T9-AC-02: Enter selects; ARIA roles present.
  it('Enter and click emit selection; tree semantics are present', () => {
    const { fixture, host, rowEls } = createHost();
    const tree = (fixture.nativeElement as HTMLElement).querySelector('[role="tree"]')!;
    expect(tree.getAttribute('aria-label')).toBe('test tree');
    const rows = rowEls();
    expect(rows.every((el) => el.getAttribute('role') === 'treeitem')).toBe(true);
    // aria-expanded only on expandable rows.
    expect(rows.map((el) => el.getAttribute('aria-expanded'))).toEqual(['true', null, 'false']);

    keydown(rows[1], 'Enter');
    expect(host.selections).toEqual([host.rows()[1]]);
    rows[0].click();
    expect(host.selections).toEqual([host.rows()[1], host.rows()[0]]);
  });

  it('highlights the selected row from caller-owned selection state', () => {
    const { fixture, host, rowEls } = createHost();
    host.selectedId.set('child');
    fixture.detectChanges();

    const rows = rowEls();
    expect(rows[1].classList.contains('selected')).toBe(true);
    expect(rows[1].getAttribute('aria-selected')).toBe('true');
    expect(rows[0].classList.contains('selected')).toBe(false);
    // The selected row is the roving tab stop while nothing was focused.
    expect(rows.map((el) => el.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('renders an empty row list without errors', () => {
    const { fixture, host, rowEls } = createHost();
    host.rows.set([]);
    fixture.detectChanges();
    expect(rowEls()).toHaveLength(0);
  });
});
