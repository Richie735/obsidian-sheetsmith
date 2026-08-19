/*
 * Reveal text that does not fit, and only text that does not fit.
 *
 * Two rules pull against each other on a sheet. Anything ellipsised has to stay
 * readable somehow, or a clipped value reads as damaged data rather than as
 * truncation (`UI.md` §12). And a tooltip repeating a value that is already
 * fully legible is noise fired at every pass, which is what the stat card's label
 * learned when a row of wide cards popped one on every crossing.
 *
 * Both are satisfied by deciding late: on hover, when the text has been laid out
 * and truncation is a fact rather than a guess.
 *
 * A module rather than a copy in each caller, and the reason is `PATTERNS` §1
 * read honestly. Two consumers may duplicate *if* a test drives both copies over
 * the same cases — and no such test can exist here, because `scrollWidth` and
 * `clientWidth` are both 0 under happy-dom, so neither copy's branch is
 * reachable. With the guard unavailable the duplication is not allowed, and one
 * function with faked metrics is testable where two copies are not.
 */

/**
 * Give `el` a tooltip carrying its own text, for as long as `el` is clipping it.
 *
 * Its own text rather than a string passed in, so the binding cannot go stale:
 * a cell repainted after an edit has new text and the same element, and a caller
 * that had handed over the old string would reveal the old string — or re-bind on
 * every repaint and accumulate a listener per commit.
 *
 * Re-measured on every hover rather than once, for the same reason: a cell's
 * width follows the table, the table follows the container, and what fit when the
 * sheet was drawn does not fit after a split is dragged narrower.
 */
export function revealWhenTruncated(el: HTMLElement): void {
	el.addEventListener('pointerenter', () => {
		if (el.scrollWidth > el.clientWidth) el.title = el.textContent ?? '';
		else el.removeAttribute('title');
	});
}
