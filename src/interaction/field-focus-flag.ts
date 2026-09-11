/*
 * A container flagged for as long as one field inside it holds focus.
 *
 * **This exists because of a linter, and that is worth saying plainly.** Every
 * one of its four consumers used to spell the same thing in CSS and spell it
 * better:
 *
 *     .sheetsmith-table-linked:has(.sheetsmith-table-input:focus) { … }
 *
 * Obsidian's plugin review reports `:has()` as a performance risk — broad
 * selector invalidation — so the question moves from the stylesheet into two
 * listeners and a class. Nothing is gained in behaviour. What is lost is that
 * the selector could not go stale and this can, which is the whole reason it is
 * one module and not four copies: a single pair of listeners is a single place
 * for that staleness to be reasoned about.
 *
 * **Why not `:focus-within`, which needs neither `:has()` nor JavaScript.**
 * Because every one of these containers has an anchor in it, and an anchor is
 * focusable. Under `:focus-within` the link layer would go inert between a
 * link's own mousedown and its mouseup: the mouseup would land on the field
 * underneath, the browser would dispatch the click to their common ancestor
 * instead of the anchor, and following a link would quietly stop working. The
 * flag is keyed on one *named* field for exactly that reason, and the four
 * stylesheet comments that used to carry this argument now point here.
 *
 * Nothing in a unit test sees that failure — happy-dom has no hit testing, and
 * a dispatched click skips it — which is why the argument is written down at
 * the length it is rather than left to be rediscovered.
 *
 * **The class name stays with the caller**, per `PATTERNS.md` §1: a module in
 * `interaction/` is handed `'sheetsmith-table-field-focused'` rather than
 * knowing that a table exists.
 *
 * Four consumers, so §1's one-step tier does not need arguing: Table's linked
 * cell, Rich text's box, and Record set's name and body.
 */

/**
 * Flag `container` while `field` has focus, and unflag it when focus leaves.
 *
 * No teardown, deliberately. Every consumer rebuilds by `replaceChildren()`, so
 * the field and its listeners are dropped together and an orphaned listener
 * holds nothing but the two elements it was given. That is the same lifetime
 * `editable.ts` and `arm-to-confirm.ts` rely on, and unlike theirs this one
 * touches nothing outside the pair — an orphan cannot write to a card that is
 * no longer on screen, because the only thing it writes to is its own
 * container.
 */
export function flagWhileFocused(
	container: HTMLElement,
	field: HTMLElement,
	className: string,
): void {
	// `focus`/`blur` rather than `focusin`/`focusout`: these do not bubble, and
	// not bubbling is the point. A second focusable descendant — the anchor the
	// header argues about — must not flag the container, and with the bubbling
	// pair it would.
	field.addEventListener('focus', () => container.addClass(className));
	field.addEventListener('blur', () => container.removeClass(className));
	// The state at the moment of wiring, for the case where the field is already
	// focused. A rebuild that restores focus does exactly that, and without this
	// line the container would come back unflagged under a focused field.
	if (field.ownerDocument.activeElement === field) container.addClass(className);
}
