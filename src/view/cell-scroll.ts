/*
 * Putting each scroller's sideways offset back after the sheet rebuilds.
 *
 * The sibling of `cell-focus.ts`, for the same rebuild: every committed edit
 * empties the sheet and draws it again, and a scroller drawn new starts at
 * `scrollLeft` 0. A Table or a Roster scrolled right to reach a column came back
 * at its start, so the control focus was restored to sat past the far edge
 * (`docs/features/table-scroll-across-rebuild.md`). Captured before the sheet is
 * emptied, restored once it is rebuilt.
 *
 * **It names no component class.** A view selecting a table's scroller by its
 * class would be the view knowing that Table and Roster exist, so a scroller is
 * found by what it does — a `scrollLeft` that is not 0 — and keyed by where it
 * is: the innermost cell holding it, as `cell-focus.ts` keys a control, and the
 * child-index path from that cell's element down to it. A path rather than a
 * class string, so a class a component stamps after drawing cannot break the
 * match, and so two scrollers of one class in one cell — a Roster in card
 * layout draws one per card — stay apart by where each card sits.
 *
 * **Where the path misses, nothing is restored, and that is the failure in the
 * safe direction.** A commit that changes the structure *above* a scroller in
 * its cell points the path elsewhere or nowhere: nowhere drops the offset, and
 * an element elsewhere that does not scroll clamps the offset to 0.
 *
 * Not one of the view's posture maps, though those hold reader posture too:
 * they hold what a component *reports* through its context, and an offset is
 * readable off the outgoing DOM at the moment it matters, so a map would need a
 * contract member and buy nothing.
 *
 * `scrollLeft` only. A component's own vertical scroller is the `docs/BACKLOG.md`
 * § UI row of that name.
 */

import { innermostCell, sheetCells } from './cell-focus';

export interface CapturedScroll {
	/** The innermost cell's index among `root`'s cells. */
	cell: number;
	/** Each step's index among its parent's element children, outermost first. */
	path: number[];
	left: number;
}

/**
 * Every element under `root` that may scroll, in document order.
 *
 * **The walk skips an SVG's subtree whole**, which is the limit it can take
 * without naming a component: every glyph on a sheet is an inline Lucide SVG of
 * several paths, and none of it can be a scroller. Everything else is read,
 * since nothing short of a class says which `div` is a table's scroller, and a
 * `scrollLeft` read on clean layout costs nothing per element.
 */
function scrollCandidates(root: HTMLElement): HTMLElement[] {
	const found: HTMLElement[] = [];
	const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
		acceptNode: (node) =>
			(node as Element).instanceOf(HTMLElement)
				? NodeFilter.FILTER_ACCEPT
				: NodeFilter.FILTER_REJECT,
	});
	for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
		found.push(node as HTMLElement);
	}
	return found;
}

/**
 * The offset of every element in a cell scrolled sideways. **Not 0 rather than
 * greater than 0**, so a right-to-left scroller, whose offsets are negative, is
 * kept too.
 */
export function captureScroll(root: HTMLElement): CapturedScroll[] {
	const cells = sheetCells(root);
	const saved: CapturedScroll[] = [];
	for (const el of scrollCandidates(root)) {
		if (el.scrollLeft === 0) continue;
		const cellIndex = innermostCell(cells, el);
		if (cellIndex < 0) continue;
		const cell = cells[cellIndex] as Element;
		// A cell holds itself, and a scrolled cell is not a scroller inside one.
		if (cell === el) continue;
		const path: number[] = [];
		for (let step: Element = el; step !== cell; ) {
			const parent = step.parentElement;
			if (parent === null) break;
			path.unshift(Array.from(parent.children).indexOf(step));
			step = parent;
		}
		saved.push({ cell: cellIndex, path, left: el.scrollLeft });
	}
	return saved;
}

/**
 * Give each saved offset back to the element at the same cell and path. A cell
 * or a step missing after the rebuild is skipped, and an offset past the new
 * `scrollWidth` is the browser's to clamp.
 */
export function restoreScroll(root: HTMLElement, saved: readonly CapturedScroll[]): void {
	if (saved.length === 0) return;
	const cells = sheetCells(root);
	for (const one of saved) {
		let el: Element | undefined = cells[one.cell];
		for (const index of one.path) {
			if (el === undefined) break;
			el = el.children[index];
		}
		if (el === undefined) continue;
		el.scrollLeft = one.left;
	}
}
