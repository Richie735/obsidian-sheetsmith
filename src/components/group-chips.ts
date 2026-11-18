/*
 * The chip list a set of modifier groups is chosen in
 * (`docs/features/table-row-modifier-target.md` D11, D12).
 *
 * **One control, two surfaces**: the sheet's modifier form draws it under
 * **Value** once a group is chosen, which is how one part names several, and
 * the layout editor draws it wherever a card, an entry or a row names the groups
 * it is in. The two must not disagree about how a group is added or removed, so
 * there is one copy (`PATTERNS.md` §1), and it lives beside the components
 * because the form is one; the editor imports it as it imports
 * `fillTargetOptions`.
 *
 * **It knows what a group list looks like and nothing about where it is
 * stored.** Every change is reported through `onChange` as the whole list, in
 * order; the caller spells it, as `@a, @b` in a cell or as a `groups` array in a
 * layout. Not a component: in no registry, declaring no `ComponentDefinition`,
 * importing nothing from `obsidian` — the remove glyph arrives as `icon`, on
 * `modifier-form.ts`'s terms — and touching no file.
 *
 * **What it draws**: a chip per group the list holds, by label, each with a
 * remove button named for it, so a keyboard reader can take one out without a
 * pointer; a chip per group the list inherits, faint and with no remove, its
 * name ending with where it comes from; a group the layout no longer declares as
 * a chip saying so, on the Value select's stray-option rule; and an **Add a
 * group** select offering every declared group not already there.
 */

import { ModifierGroup } from '../types';
import { element } from '../ui/element';

export interface GroupChipsOptions {
	/** The list's own groups, by name, in order. */
	chosen: readonly string[];
	/** The layout's declared groups, which is what **Add a group** offers. */
	declared: readonly ModifierGroup[];
	/**
	 * Groups the value is in without the list naming them — a row's from its
	 * table's default — drawn faint and with no remove. Absent is none.
	 */
	inherited?: readonly string[];
	/** Where `inherited` comes from, for their accessible names: `the table`. */
	inheritedFrom?: string;
	/** Whether the reader may change the list. */
	disabled?: boolean;
	/**
	 * The **Add a group** select's accessible name, where the surface has a party
	 * to name: `Add a group to Acrobatics` on a row (`docs/UI.md` §6). Absent is
	 * the select's own words.
	 */
	addLabel?: string;
	/** Paint a Lucide icon into an element, handed in rather than imported. */
	icon: (into: HTMLElement, name: string) => void;
	/** The list after a change, in order. */
	onChange: (next: readonly string[]) => void;
}

/** The label a reader knows a group by, saying so where nothing declares it. */
function chipLabel(name: string, declared: readonly ModifierGroup[]): string {
	const group = declared.find((one) => one.name === name);
	return group === undefined ? `${name} (not declared)` : group.label;
}

/**
 * Draw the list into `parent`, returning its root. The caller redraws it on
 * every change it commits, so nothing here holds state.
 */
export function renderGroupChips(parent: HTMLElement, options: GroupChipsOptions): HTMLElement {
	const root = element('div', 'sheetsmith-group-chips', parent);
	const inherited = (options.inherited ?? []).filter((name) => !options.chosen.includes(name));
	for (const name of inherited) {
		const chip = element('span', 'sheetsmith-group-chip sheetsmith-group-chip-inherited', root);
		chip.createSpan({ text: chipLabel(name, options.declared) });
		if (options.inheritedFrom !== undefined) {
			chip.createSpan({ cls: 'sheetsmith-sr-only', text: ` from ${options.inheritedFrom}` });
		}
	}
	options.chosen.forEach((name, at) => {
		const label = chipLabel(name, options.declared);
		const chip = element('span', 'sheetsmith-group-chip', root);
		if (!options.declared.some((group) => group.name === name)) {
			chip.classList.add('sheetsmith-group-chip-stray');
		}
		chip.createSpan({ text: label });
		if (options.disabled === true) return;
		const remove = element('button', 'sheetsmith-group-chip-remove', chip);
		remove.type = 'button';
		remove.setAttribute('aria-label', `Remove ${label}`);
		options.icon(remove, 'x');
		remove.addEventListener('click', () => {
			options.onChange(options.chosen.filter((_, index) => index !== at));
		});
	});
	const offered = options.declared.filter(
		(group) => !options.chosen.includes(group.name) && !inherited.includes(group.name),
	);
	if (options.disabled !== true && offered.length > 0) {
		const add = element('select', 'dropdown sheetsmith-group-chips-add', root);
		add.setAttribute('aria-label', options.addLabel ?? 'Add a group');
		add.createEl('option', { value: '', text: 'Add a group' });
		for (const group of offered) add.createEl('option', { value: group.name, text: group.label });
		add.value = '';
		add.addEventListener('change', () => {
			if (add.value === '') return;
			options.onChange([...options.chosen, add.value]);
		});
	}
	return root;
}
