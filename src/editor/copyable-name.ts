/*
 * A name in code type that copies itself when pressed.
 *
 * Its own module for the same reason as `field-error.ts` beside it: nothing
 * about it is list-shaped, so `list-fields.ts` was not its home. Two consumers
 * rather than three, and `docs/PATTERNS.md` §1's ladder is not what moved it —
 * it was already one function with one name, so this is where it lives, not a
 * generalisation earned by a third caller.
 */

import { Notice } from 'obsidian';

/**
 * A name in code type that copies itself when pressed.
 *
 * The component id wears one at the top of the form, on the argument that it
 * is the one thing about a component that cannot be discovered anywhere else
 * and is what gets retyped into every formula reading it. A published row's
 * name is the same thing one level down, so the two share the control rather
 * than growing a second spelling of it.
 */
export function copyableName(into: HTMLElement, text: string): HTMLElement {
	const code = into.createEl('code', { cls: 'sheetsmith-copyable', text });
	code.setAttribute('tabindex', '0');
	code.setAttribute('role', 'button');
	code.setAttribute('aria-label', `Copy "${text}" to the clipboard`);
	const copy = () => {
		void navigator.clipboard.writeText(text).then(
			() => new Notice(`Copied "${text}"`),
			() => new Notice('Could not copy to the clipboard.'),
		);
	};
	code.addEventListener('click', copy);
	code.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		copy();
	});
	return code;
}
