/**
 * Bring an element to the top of the one box that scrolls it, where a press on
 * it is answered (`docs/features/layout-editor-narrow-regime.md` §4).
 * `visibleBox` is here because it is the same box: the reveal asks it whether
 * the panel is out of sight before asking this module to bring it in.
 *
 * **The one place `editor/` reaches past the element it is handed**, which
 * `docs/PATTERNS.md` §2 otherwise rules out, and owned here rather than moved
 * to `view/`: the editor is still the only caller, so a module there would
 * change the folder and not the reach. It names no leaf and no app class. The
 * box it scrolls is found by what it does, the nearest ancestor whose
 * `overflow-y` scrolls, which in the app is the leaf's scroller, and the window
 * where nothing between scrolls. It reads and moves that one box, never more.
 *
 * **Its own scroller only, never `scrollIntoView`.** That scrolls every
 * scrolling ancestor up to the window, `overflow: hidden` ones included. In
 * Mobile Safari on the iOS simulator, with the harness held to the window
 * (`&bounded`), the jump scrolled the document itself 40px and took the
 * harness's view header off the screen (`docs/features/layout-editor-narrow-regime.md`,
 * How it was measured). And it aligns the element it is given and nothing round
 * it, so aligning the title's name left the 44px button beside it, centred on a
 * 20px name, 12px above the leaf's top edge, where a tap reaches nothing.
 */

/**
 * The nearest scrolling ancestor, which is the leaf's own scroller in the app,
 * or null where nothing between scrolls and the window does.
 */
function scrollerOf(el: HTMLElement): HTMLElement | null {
	const view = el.ownerDocument.defaultView;
	for (let at = el.parentElement; at !== null; at = at.parentElement) {
		const overflow = view?.getComputedStyle(at).overflowY;
		if (overflow === 'auto' || overflow === 'scroll') return at;
	}
	return null;
}

/** The box a reader can see `el` through: its scroller's, or the window's. */
export function visibleBox(el: HTMLElement): { top: number; bottom: number } {
	const scroller = scrollerOf(el);
	if (scroller === null) return { top: 0, bottom: el.win.innerHeight };
	const box = scroller.getBoundingClientRect();
	return { top: box.top, bottom: box.bottom };
}

/**
 * Scroll `target`'s scroller so `target` starts where the scroller's content
 * starts, and then below whatever answers a press at the top of `probe`'s
 * centre line instead of `probe`.
 *
 * **The content edge, not the scroller's own top**: the scroller's top padding
 * is where the pane's first row sits unscrolled, so the jump lands the row
 * where the reader has already seen a top row sit, rather than flush against
 * the edge.
 *
 * **Covered is measured, not assumed.** A floating header, a theme's own
 * chrome or anything the app draws over the leaf all cover its top without the
 * scroller's box knowing, and on an iPhone the measured row answered a tap on
 * its bottom 10px of 44. A hit test is the one question that sees all of them,
 * so the first point down the probe's centre line that reaches it says how
 * much is covered, and the target goes that much further down.
 *
 * **What it does not see**, stated so nobody reads more into it: one line,
 * the probe's centre, so a cover beside that line goes unnoticed; and one
 * correction, not a loop, so a probe nothing reaches anywhere on that line —
 * covered whole, or not displayed and so with no box to walk — is left where
 * the first scroll put it.
 */
export function scrollToTop(target: HTMLElement, probe: HTMLElement): void {
	const scroller = scrollerOf(target);
	const scrollBy = (dy: number): void => {
		if (scroller === null) target.win.scrollBy(0, dy);
		else scroller.scrollTop += dy;
	};
	const inset = scroller === null
		? 0
		: parseFloat(target.win.getComputedStyle(scroller).paddingTop) || 0;
	scrollBy(target.getBoundingClientRect().top - (visibleBox(target).top + inset));
	// Back up by what is covered, so the row moves down by it.
	const covered = coveredAbove(probe);
	if (covered > 0) scrollBy(-covered);
}

/**
 * How far down `probe` a press first reaches it, in CSS px: 0 where its top
 * edge answers, or where nothing on its centre line does.
 */
function coveredAbove(probe: HTMLElement): number {
	const box = probe.getBoundingClientRect();
	const x = box.left + box.width / 2;
	for (let y = box.top; y < box.bottom; y += 2) {
		const hit = probe.ownerDocument.elementFromPoint(x, y);
		if (hit !== null && probe.contains(hit)) return y - box.top;
	}
	return 0;
}
