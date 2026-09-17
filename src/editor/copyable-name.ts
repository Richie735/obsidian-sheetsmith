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
export function copyableName(
	into: HTMLElement,
	text: string,
	/**
	 * Where what a chip *shows* is not the whole of what it copies.
	 *
	 * The published-name inventory is what this exists for: a group draws
	 * `abilities.STR` once and then the forms that build on it as `.value` and
	 * `mod.`, each showing only the part it adds while copying the composed
	 * name. Every existing caller passes neither and is untouched.
	 *
	 * The accessible name is composed from what is *visible*, never from what is
	 * copied, so a control's own text is always contained in its name
	 * (WCAG 2.5.3, `docs/UI.md` §6) — and `title` is what adds the rest, which
	 * is the same rule read the other way round.
	 */
	options?: { shown?: string; title?: string },
): HTMLElement {
	const shown = options?.shown ?? text;
	/*
	 * **What it copies, where that contains what it shows; what it shows
	 * otherwise.** WCAG 2.5.3 asks that a control's visible label be contained in
	 * its accessible name, and that is the whole of the constraint — so a form
	 * chip showing `.value` announces `abilities.STR.value`, which contains it,
	 * and stops the announcement being a false statement about what the press
	 * does. An aggregate chip shows `sum(traits, …)` and copies `sum(traits, `,
	 * which does *not* contain it, so that one announces what it shows and the
	 * ellipsis is the honest half.
	 */
	const named = text.includes(shown) ? text : shown;
	const code = into.createEl('code', { cls: 'sheetsmith-copyable', text: shown });
	code.setAttribute('tabindex', '0');
	code.setAttribute('role', 'button');
	code.setAttribute('aria-label', `Copy "${named}" to the clipboard`);
	if (options?.title !== undefined) code.setAttribute('title', options.title);
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
