/*
 * The modal a gesture opened, and the button in it.
 *
 * Scaffolding rather than a case (`docs/PATTERNS.md` §2): a modal hangs off
 * `document.body` rather than off the surface under test, so every test that
 * drives one has to find it the same way — and four sites in one feature were
 * each spelling the label search out, one as a local helper and three as inline
 * loops over `querySelectorAll('button')`.
 *
 * **By label rather than by position or a token.** These modals set no
 * `data-sheetsmith-focus`: that attribute is the layout editor pane's
 * focus-restoration vocabulary, resolved after a *rebuild*, and a modal is built
 * once in `onOpen` and emptied in `onClose`, so nothing ever resolves one there.
 * A token would be a test selector wearing a production name. The label is what
 * a reader presses the button by, which makes it the right thing for a test to
 * name.
 *
 * `ConfirmModal`'s own button is deliberately not reached through here: its
 * caller finds it by `.mod-warning`, because what that case is about is the
 * destructive control's treatment rather than its words.
 */

/** The open modal, or a failure naming what is missing. */
export function openModal(): HTMLElement {
	const el = document.body.querySelector('.modal-container');
	if (!el) throw new Error('no modal is open');
	return el as HTMLElement;
}

/** Whether a modal is open at all. */
export function modalIsOpen(): boolean {
	return document.body.querySelector('.modal-container') !== null;
}

/** The button in the open modal carrying this label. */
export function modalButton(label: string): HTMLButtonElement {
	for (const el of Array.from(openModal().querySelectorAll('button'))) {
		if (el.textContent === label) return el;
	}
	throw new Error(`no button labelled "${label}"`);
}

/** Press it, which is what every caller does next. */
export function pressModalButton(label: string): void {
	modalButton(label).click();
}
