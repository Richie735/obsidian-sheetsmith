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
	tokenTarget(scope, token)?.focus({ preventScroll: true });
}

/**
 * The element under `scope` a focus token names, or null where none can take
 * focus: the one spelling of that lookup, so a way back, a reveal and a restore
 * cannot resolve one token to two elements.
 *
 * **An element inside `inert` is passed over**, decided here once: it cannot
 * take focus, so a caller handed one would focus nothing and stop looking,
 * where the token's next match — or the caller's own fallback — could have
 * answered (`docs/features/layout-editor-narrow-regime.md` §4).
 */
export function tokenTarget(scope: HTMLElement, token: string): HTMLElement | null {
	for (const candidate of Array.from(
		scope.querySelectorAll('[data-sheetsmith-focus]'),
	)) {
		if (
			candidate.instanceOf(HTMLElement) &&
			candidate.dataset.sheetsmithFocus === token &&
			candidate.closest('[inert]') === null
		) {
			return candidate;
		}
	}
	return null;
}
