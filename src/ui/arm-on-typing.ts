/*
 * When a type-ahead may open: only after the reader has typed.
 *
 * One job: keep the one flag that tells an `AbstractInputSuggest` subclass
 * whether the refresh it is being asked to answer came from typing or from
 * merely arriving. The class calls `getSuggestions` on `focus` as well as on
 * `input`, with no way to tell them apart from inside, so a field tabbed into to
 * be read would pop a list over the text. The answer is ordering: the listeners
 * here are registered on the input *before* the class is constructed, so they
 * run first and the class's own handler finds the flag already saying which of
 * the two it is. Typing arms; focus and blur disarm.
 *
 * **Two consumers, one extraction, on the one-step tier** (`docs/PATTERNS.md`
 * §1): the formula inputs in the layout editor and a Record set's group name on
 * the sheet each carried this wiring, and the whole of the risk is the
 * ordering, which a comment in each cannot hold. What stays with each caller is
 * what differs — the formula field's accept splices text and dispatches an
 * `input`, so it passes `suspended` to keep that dispatch from re-arming; a
 * group name's accept replaces the whole value and has nothing to suspend.
 *
 * **The caret moves too.** Left and Right, and a press inside the field, leave
 * the list talking about text the caret has left, so they disarm and close it.
 * Up and Down are the popup's own while it is open and are not touched.
 */

/** The flag a suggester reads. Held by the caller, which may carry more beside it. */
export interface Armed {
	armed: boolean;
}

/**
 * Wire the arming listeners onto `input`. **Call before constructing the
 * suggester**, then call the returned function with it, which adds the two that
 * need something to close.
 *
 * `suspended` is true while the caller is writing to the field itself, so that
 * write is not read as the reader asking for a list.
 */
export function armOnTyping(
	input: HTMLInputElement,
	state: Armed,
	suspended: () => boolean = () => false,
): (suggest: { close(): void }) => void {
	input.addEventListener('focus', () => {
		state.armed = false;
	});
	input.addEventListener('input', () => {
		if (!suspended()) state.armed = true;
	});
	input.addEventListener('blur', () => {
		state.armed = false;
	});
	return (suggest) => {
		input.addEventListener('keydown', (event) => {
			if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
				state.armed = false;
				suggest.close();
			}
		});
		input.addEventListener('pointerdown', () => {
			state.armed = false;
			suggest.close();
		});
	};
}
