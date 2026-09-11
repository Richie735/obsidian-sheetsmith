/*
 * A settings row whose description grows, changes, and says what the control
 * beside it is about to do.
 *
 * `docs/UI.md` §9's settled rule, in one place instead of two. What it holds is
 * not the class name — that was already shared — but the **five-part recipe**
 * the class is only one part of: both classes, the description moved below the
 * controls, an id on it, the control's `aria-describedby` pointing at that id,
 * and a repaint of the copy per choice. `docs/PATTERNS.md` §1's own worked
 * example of getting this half-right is `--sheetsmith-grid-row`, "a policy
 * shared and its application duplicated": the number became one name while the
 * declarations using it stayed written out at both sites.
 *
 * A module at the second consumer rather than the third, on §1's one-step tier:
 * what is duplicated is a *policy*, so the only thing a guard test over two
 * copies could assert is that they still do the same five things — and the two
 * copies of that assertion were themselves near-transcriptions, which is the
 * rung §1 explicitly does not offer, since a test that fails when the copies
 * disagree is what two consumers are allowed to have instead of a module.
 *
 * **No test file of its own**, under `docs/PATTERNS.md` §10's boundary for this
 * folder: it has an entry point but no reportable output of its own — what it
 * produces is markup on a `Setting` it was handed, which becomes observable only
 * in a consumer. Both consumers assert it, through the one shared assertion in
 * `src/test/described-row.ts`, which is what a second copy of the treatment used
 * to be checked by.
 *
 * **The id is a parameter, because the two consumers cannot share one.** The
 * pane's row is drawn once per render and a redraw replaces the whole
 * container, so a module literal there is safe and readable. A modal can be
 * opened, closed and opened again, so its id is generated per instance or two
 * live elements carry the same one. That difference is the caller's, and it is
 * the only one.
 */

import { Setting } from 'obsidian';

/** A row wired to its own description. */
export interface DescribedRow {
	/**
	 * Repaint the description for a chosen value.
	 *
	 * Call it once with the initial choice as well as on every change: a row
	 * that only repaints on change opens with an empty description.
	 */
	describe(value: string): void;
	/**
	 * Point a control at the description.
	 *
	 * A second member rather than a fourth argument because the control does
	 * not exist yet when the row-side work is done: both consumers create theirs
	 * inside `Setting.addDropdown`'s callback, and the alternative is a `let`
	 * holding a placeholder until it is overwritten.
	 */
	describes(control: HTMLElement): void;
}

/**
 * Give a row a description that sits below its controls and follows the choice.
 *
 * `text` maps the chosen value to the copy for it. Returning `''` is the honest
 * answer where a choice has nothing to add — the empty description is
 * `display: none`, which assistive tech skips, so the association costs such a
 * choice nothing.
 */
export function describedRow(
	row: Setting,
	id: string,
	text: (value: string) => string,
): DescribedRow {
	/*
	 * The description goes *below* the row rather than under the name, and that
	 * is a layout decision rather than a styling one. In the info column it is
	 * copy that grows from nothing to several lines depending on which option is
	 * chosen, and a settings row is a centred flex line: the info column widens,
	 * the control column wraps, and the control the author is reaching for moves
	 * while they are still choosing what to press it for — measured at about
	 * 35px on the **Add component** row.
	 *
	 * Moved rather than reserved. Reserving a line of height shows an empty one
	 * for every choice whose copy happens to be empty, and only fits the
	 * shortest copy anyway; clamping to one line with the rest in a `title`
	 * hides text that is often the only explanation a control gets
	 * (`docs/PATTERNS.md` §8). `descEl` keeps its own class and Obsidian's own
	 * treatment; only where it sits changes.
	 *
	 * **What this fixes is the row's own first line, and how much more depends
	 * on what follows the row.** The control being operated stays put whatever
	 * is chosen, which is the whole of it — and on the pane's **Add component**
	 * row the copy then grows into space nothing is placed in, so the
	 * destination dropdown and **Add** beside it stop moving too. In a modal
	 * three rows follow, so a switch still moves everything below: growing the
	 * copy by a line pushes **Name** and **Create** down, and revealing a source
	 * row pushes them further. The treatment does not claim to fix that, and a
	 * reader of only the pane's case would think it did.
	 *
	 * Both classes are bare and unscoped, which is why this paints in a modal
	 * too — the scoping test `.sheetsmith-input-invalid` failed and the problem
	 * list passed.
	 */
	row.settingEl.addClass('sheetsmith-add-row', 'sheetsmith-wrapping-row');
	row.settingEl.appendChild(row.descEl);
	row.descEl.id = id;

	return {
		describe(value: string): void {
			row.setDesc(text(value));
		},
		describes(control: HTMLElement): void {
			// Named, so the control is described by it (`docs/UI.md` §6). The
			// copy is the only explanation a choice gets and choosing repaints
			// it — painted alone, a screen reader hears the option's own two
			// words and stops there.
			control.setAttribute('aria-describedby', id);
		},
	};
}
