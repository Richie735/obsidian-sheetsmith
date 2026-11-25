/*
 * A select's chosen value, drawn in a face the plugin ellipsises
 * (`docs/features/select-long-value.md`).
 *
 * A `<select>` clips its own face, and how it clips is the engine's: Chromium
 * honours `text-overflow: ellipsis` on a select and WebKit does not, so on iOS
 * the modifier form's **Value** read *Abilities · S1* where the text is
 * *Abilities · ST…* — a value that looks damaged rather than truncated. No width
 * or label rule reaches it, since the picker's labels are full width by ruling
 * and an author's names are unbounded.
 *
 * **So the plugin draws the face itself.** The select is wrapped in a stack and
 * a sibling span over it holds the chosen option's text; the select's own text
 * goes transparent beneath it, by the stylesheet (`shared.css`, "A select's
 * face"). That is the stacking `docs/UI.md` §9 already names for a field under a
 * link layer, applied to a select. A span ellipsises with ordinary
 * `text-overflow` on every engine, so nothing here branches on one.
 *
 * What stays the select's: its menu, its focus, its accessible name and value,
 * its box and its chevron. The face is `aria-hidden` and takes no pointer, so a
 * press, a key and a screen reader all reach the select exactly as before.
 *
 * **The face reads the select a microtask after every `change`**, not inside
 * the event, so it shows what the select holds once every listener has run,
 * whatever order they were added in: a caller that puts a refused value back
 * inside its own handler is read after it has done so. A microtask runs before
 * the next paint, so no stale face is ever drawn. A caller that sets `value` in
 * code outside an event calls the returned `refresh`, which reads at once.
 *
 * `ui/` rather than `components/`, because nothing here knows what a component
 * is (`PATTERNS` §2): a select, its options and two spans are the vocabulary.
 * The families that take it name their own stack by the parent they sit in.
 */

/** The class on the wrapper that takes the select's place in its parent. */
const SELECT_STACK_CLASS = 'sheetsmith-select-stack';
/** The class on the span that draws the chosen value. */
export const SELECT_FACE_CLASS = 'sheetsmith-select-face';
/** The class on the select, whose own text the stylesheet then hides. */
const SELECT_FACED_CLASS = 'sheetsmith-select-faced';

/**
 * The element a control sits in, past its face's stack where it has one: where
 * a caller hangs a message under the control's field. One predicate for every
 * caller, so a select and a text input find the same field.
 */
export function controlField(control: HTMLElement): HTMLElement | null {
	const parent = control.parentElement;
	return parent?.classList.contains(SELECT_STACK_CLASS) === true ? parent.parentElement : parent;
}

/** The chosen option's own text, or empty where nothing is chosen. */
function chosenText(select: HTMLSelectElement): string {
	return select.options[select.selectedIndex]?.text ?? '';
}

/**
 * Wrap `select` in place in a stack, draw its chosen value in a face beside it,
 * and return what redraws the face after a `value` set in code.
 *
 * Called once per select. A second call on the same select wraps nothing again
 * and returns the first face's refresh, so a caller that cannot tell whether it
 * already drew one is safe.
 */
export function drawSelectFace(select: HTMLSelectElement): () => void {
	const existing = select.parentElement;
	if (
		select.classList.contains(SELECT_FACED_CLASS) &&
		existing?.classList.contains(SELECT_STACK_CLASS) === true
	) {
		const face = existing.querySelector<HTMLElement>(`:scope > .${SELECT_FACE_CLASS}`);
		const again = (): void => {
			if (face !== null) face.textContent = chosenText(select);
		};
		again();
		return again;
	}
	// Made through the parent where there is one, so the stack comes from the
	// select's own document (a popout's included) and takes its place; the
	// global form only for a select nothing holds yet.
	let stack: HTMLElement;
	if (existing !== null) {
		stack = existing.createSpan(SELECT_STACK_CLASS);
		existing.insertBefore(stack, select);
	} else {
		stack = createSpan(SELECT_STACK_CLASS);
	}
	stack.appendChild(select);
	select.classList.add(SELECT_FACED_CLASS);
	const face = stack.createSpan(SELECT_FACE_CLASS);
	// The select already says its name and its value, so the face says nothing.
	face.setAttribute('aria-hidden', 'true');
	const refresh = (): void => {
		face.textContent = chosenText(select);
	};
	refresh();
	// Deferred, so no caller has to attach its own listener first.
	select.addEventListener('change', () => queueMicrotask(refresh));
	return refresh;
}
