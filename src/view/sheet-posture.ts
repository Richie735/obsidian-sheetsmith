/*
 * Where the reader was on the sheet, carried across a rebuild in one order.
 *
 * Three parts, each its own module's or one line: which control had focus
 * (`cell-focus.ts`), how far each scroller in a cell was scrolled sideways
 * (`cell-scroll.ts`), and how far the sheet itself was scrolled down. What this
 * module owns is the **order they go back in**, which is the one rule with a
 * reason a reader cannot see from either half:
 *
 * **Each scroller's offset before focus**, so the `focusin` the restore fires
 * reaches `ui/pinned-column-focus.ts` against the geometry the reader left, and
 * a control the commit left behind a sticky name is scrolled clear of it. Focus
 * first would be measured at `scrollLeft` 0, where no name covers anything, and
 * the offset would then move the control with nothing left to correct it: what
 * the reader can see wins over where they were
 * (`docs/features/table-scroll-across-rebuild.md`). **The sheet's own
 * `scrollTop` last**, as `b99c000` placed it, after everything that could move
 * the page has run.
 *
 * Its own module because two hosts rebuild a sheet, the view and the harness,
 * and the order was written out in both: `harness/measure-groups.mjs` check 10
 * drives the harness, so a swap in the view alone would have stayed green. One
 * function is what lets the check hold the plugin (`docs/PATTERNS.md` §1, a
 * policy extracts on the second consumer).
 */

import { CapturedFocus, captureFocus, restoreFocus } from './cell-focus';
import { CapturedScroll, captureScroll, restoreScroll } from './cell-scroll';

export interface SheetPosture {
	focus: CapturedFocus | null;
	scroll: CapturedScroll[];
	/** The root's own `scrollTop`: the sheet's scroll container in the view. */
	top: number;
}

/**
 * Read before the sheet is emptied. `root` is the scroll container, and emptying
 * it collapses its scroll height to zero, clamping `scrollTop` to 0 with it, so
 * nothing here can be read afterwards.
 */
export function capturePosture(root: HTMLElement): SheetPosture {
	return {
		focus: captureFocus(root),
		scroll: captureScroll(root),
		top: root.scrollTop,
	};
}

/** Put it back once the sheet is rebuilt, in the order the header argues. */
export function restorePosture(root: HTMLElement, saved: SheetPosture): void {
	restoreScroll(root, saved.scroll);
	restoreFocus(root, saved.focus);
	root.scrollTop = saved.top;
}
