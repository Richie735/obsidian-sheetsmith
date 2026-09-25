/*
 * The `beforeinput` a test types into a prose field with.
 *
 * Extracted on PATTERNS §1's two-consumer rung, and on `pointer.ts`'s argument
 * rather than a count: the event carries two fields a caller can get wrong
 * with nothing failing. Without `cancelable`, `preventDefault` does nothing, so
 * every "the keystroke went through" assertion passes whatever the handler
 * did. And built from a window other than the field's own, it is the realm
 * mistake PATTERNS §5 exists to catch, made in the test instead of the code.
 *
 * `interaction/markdown-typing.ts` keys on this event and never on `keydown`,
 * which is the reason it exists (docs/features/prose-field-editing.md).
 * Dispatching is the caller's, since only some callers go on to make the edit
 * the browser would have made.
 */

export function beforeinput(
	field: HTMLElement,
	inputType: string,
	data: string | null = null,
	init: { isComposing?: boolean } = {},
): InputEvent {
	const view = field.ownerDocument.defaultView;
	if (view === null) throw new Error('the field is in no window');
	return new view.InputEvent('beforeinput', {
		inputType,
		data,
		cancelable: true,
		bubbles: true,
		isComposing: init.isComposing ?? false,
	});
}
