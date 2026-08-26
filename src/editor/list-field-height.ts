/*
 * How tall a list-shaped textarea stands: as tall as what it holds.
 *
 * The layout editor has two of these — the reset triggers and the function
 * library — and both hold one entry per line. They were sized by a fixed `rows`
 * each, 3 and 6, neither with a reason recorded, and both were wrong in
 * opposite directions: ten triggers showed three and cut the fourth at 46% of
 * its line height, while one definition sat in six rows of empty space.
 *
 * The cut is the part that mattered. A line sliced through the middle of its
 * glyphs does not read as "there is more below", it reads as a rendering fault
 * — and on macOS, where overlay scrollbars appear only while scrolling, that
 * half-line was the *only* signal that seven more entries existed. The counter
 * underneath said "10 triggers defined" and the field said nothing.
 *
 * Growing to content removes the question. Under the cap there is no clipping
 * at all, which is the case that actually occurs; past it the field scrolls
 * with a partial line at the bottom edge, and there the partial line is doing
 * honest work, because something genuinely is below.
 *
 * Shared rather than copied, which departs from §1's "extract on the third
 * consumer" default, deliberately and on evidence: these two fields have
 * already drifted apart twice — once on `rows`, once on the CSS that gave one
 * of them the full width and left the other in the narrow control column. The
 * copy is how they disagreed, so there is no copy.
 */

/**
 * The floor. Three lines read as a field for a list rather than a single-line
 * input that happens to be tall, and it is enough to see an entry arrive above
 * and below the one being typed.
 */
export const MIN_ROWS = 3;

/**
 * The ceiling. A layout with more triggers than this is possible and must not
 * push the rest of the panel off the screen; at that point scrolling inside the
 * field is the lesser cost.
 */
export const MAX_ROWS = 12;

/** Lines the value occupies. Exact, because these fields never soft-wrap. */
function lineCount(value: string): number {
	return value === '' ? 1 : value.split('\n').length;
}

/**
 * Size the field to its content, within the bounds above.
 *
 * Through `rows` rather than an inline height in pixels: the browser turns it
 * into exactly that many lines plus the padding and border, which is the sum
 * this would otherwise have to recompute from the resolved font every time the
 * theme changed. It also leaves `resize: vertical` alone — a user who has
 * dragged the field to a size of their own has set an inline height, and that
 * keeps winning, which is the right answer about whose intent counts.
 */
export function fitToContent(input: HTMLTextAreaElement): void {
	input.rows = Math.max(MIN_ROWS, Math.min(MAX_ROWS, lineCount(input.value)));
}

/** Fit now, and again on every edit. */
export function bindFitToContent(input: HTMLTextAreaElement): void {
	fitToContent(input);
	input.addEventListener('input', () => fitToContent(input));
}
