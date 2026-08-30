/**
 * Focus the element under `scope` whose `data-sheetsmith-focus` matches
 * `token`, restoring focus to whatever a rebuild replaced.
 *
 * Shared by `canvas.ts` and `layout-editor.ts` (`docs/PATTERNS.md` §1: a
 * duplicated predicate is extracted on the second consumer, since drift in
 * *which* element a token resolves to is the whole risk). `instanceOf`
 * rather than `instanceof` for the same reason `cell-focus.ts` and
 * `field-error.ts` already use it here: it holds across a popout window's
 * own `HTMLElement`, where the bare global does not.
 */
export function focusToken(scope: HTMLElement, token: string): void {
	for (const candidate of Array.from(
		scope.querySelectorAll('[data-sheetsmith-focus]'),
	)) {
		if (
			candidate.instanceOf(HTMLElement) &&
			candidate.dataset.sheetsmithFocus === token
		) {
			candidate.focus({ preventScroll: true });
			return;
		}
	}
}
