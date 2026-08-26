/*
 * One heading over a run of fields in a form.
 *
 * Whether it heads a set of fields sharing a `group`, a list field such as
 * entries, or one of the layout's two textarea fields, all three sit at the same
 * level and so must look the same — and rendering them from separate code paths
 * is what let them drift apart before.
 *
 * A module at the third consumer, which is where `docs/PATTERNS.md` §1 extracts.
 * The third arrived when the editor became a pane: the panel gained a title
 * naming what it configures, and the two textarea fields were still drawing
 * themselves with Obsidian's own section heading — the rank the title now
 * holds — so a panel's heading tied with its own sections.
 */

import { Setting } from 'obsidian';

/**
 * A heading over a run of fields inside a form.
 *
 * Deliberately quieter than the panel's own title: muted, uppercase and small
 * against the title's full-contrast sentence case, because this names a section
 * and the title names the whole thing being configured.
 */
export function groupHeading(
	form: HTMLElement,
	title: string,
	description?: string,
	/** Entries in the list this heads, so a bounded list says what it holds. */
	count?: number,
): void {
	const heading = form.createDiv('sheetsmith-form-group');
	heading.createDiv({ cls: 'sheetsmith-form-group-title' }, (el) => {
		el.appendText(title);
		if (count !== undefined) {
			el.createSpan({ cls: 'sheetsmith-form-group-count', text: String(count) });
		}
	});
	if (description) {
		heading.createDiv({ cls: 'setting-item-description', text: description });
	}
}

/**
 * What the panel is configuring, said at the top of it.
 *
 * The settings tab needed no such line: a form was drawn directly under the row
 * carrying its name, so the name was one line above it. Splitting the two into
 * columns took that away and left the identity of the thing being edited to the
 * contents of the `Label` text field — the one place a reader does not look for
 * a heading — and to a tree row a column away that scrolls on its own. Three
 * Groups called Weapons, Tools and Armour produced three identical panels.
 *
 * Obsidian's own section heading rather than a mark of this plugin's
 * (`docs/UI.md` §9): it is a heading over a list of settings, which is exactly
 * what `.setting-item-heading` is for, and it outranks every `groupHeading`
 * below it.
 */
export function panelTitle(form: HTMLElement, name: string): void {
	new Setting(form).setHeading().setName(name);
}
