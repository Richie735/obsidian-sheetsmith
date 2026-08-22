/*
 * Putting focus back after the sheet rebuilds.
 *
 * The view re-renders on every committed edit, which detaches whatever control
 * the user had tabbed or clicked into while the rebuild's layout read was in
 * flight. Structural identity survives that rebuild where the layout has not
 * changed — which cell, which control inside it, where the caret was — so it is
 * captured before the grid is emptied and applied after it is rebuilt.
 *
 * Its own module because it is the part with no view in it: two pure functions
 * over a root element, which is what makes the one rule with a trap in it
 * testable at all. `SheetView` cannot be built without a workspace around it.
 */

/**
 * What counts as a control for the purpose of putting focus back.
 *
 * One constant because capture and restore have to agree exactly: they identify
 * a control by its index among these, so a selector that listed one more kind on
 * one side than the other would restore focus to the wrong control rather than
 * fail visibly. Anchors are here because a cell may hold a rendered wikilink.
 *
 * Exported because the component tests that assert a control keeps its index
 * across a rebuild were each carrying their own copy of it, which is three
 * answers to "what does the view count?" and two of them silently stale the
 * moment this one grows a kind (PATTERNS §1).
 */
export const FOCUSABLE = 'input, select, textarea, button, a[href]';

export interface CapturedFocus {
	cell: number;
	control: number;
	start: number | null;
	end: number | null;
}

/**
 * The cell holding this element, as an index into `root`'s cells, or -1.
 *
 * **The innermost one.** A container's children each get a cell of their own on
 * the container's inner grid, so a control inside a group sits in two cells at
 * once, and `querySelectorAll` returns them in document order with the ancestor
 * first. Taking the first match would number every child's controls against the
 * whole group — so adding a card to a group would renumber every control after
 * it, and a commit racing a rebuild would land focus on a different component.
 * The last match is the cell the control actually belongs to, which is what
 * keeps a control's identity local to its own component.
 *
 * A reverse scan rather than `findLastIndex`, which is ES2023 and past what
 * `tsconfig.json` declares.
 */
function innermostCell(cells: readonly Element[], active: Element): number {
	for (let i = cells.length - 1; i >= 0; i--) {
		if (cells[i]?.contains(active)) return i;
	}
	return -1;
}

export function captureFocus(root: HTMLElement): CapturedFocus | null {
	const active = root.ownerDocument.activeElement;
	// instanceOf rather than instanceof: constructors are per-window, and the
	// sheet may live in a popout.
	if (!active || !active.instanceOf(HTMLElement) || !root.contains(active)) {
		return null;
	}
	const cells = Array.from(root.querySelectorAll('.sheetsmith-cell'));
	const cellIndex = innermostCell(cells, active);
	if (cellIndex < 0) return null;
	const controls = Array.from(
		(cells[cellIndex] as Element).querySelectorAll(FOCUSABLE),
	);
	const controlIndex = controls.indexOf(active);
	if (controlIndex < 0) return null;
	const input = active.instanceOf(HTMLInputElement) ? active : null;
	return {
		cell: cellIndex,
		control: controlIndex,
		start: input ? input.selectionStart : null,
		end: input ? input.selectionEnd : null,
	};
}

export function restoreFocus(
	root: HTMLElement,
	saved: CapturedFocus | null,
): void {
	if (!saved) return;
	const cell = root.querySelectorAll('.sheetsmith-cell')[saved.cell];
	if (!cell) return;
	const control = cell.querySelectorAll(FOCUSABLE)[saved.control];
	if (!control || !control.instanceOf(HTMLElement)) return;
	control.focus({ preventScroll: true });
	if (control.instanceOf(HTMLInputElement) && saved.start !== null) {
		control.setSelectionRange(saved.start, saved.end);
	}
}
