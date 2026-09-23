/*
 * What the component picker lists, and which of it a query leaves showing
 * (`docs/features/component-picker.md` §4, §11).
 *
 * The flattening the **Add component** dropdown did, moved out of
 * `layout-editor.ts` when the dropdown was deleted. **Not a second consumer**:
 * the picker replaces the first, so the flattening does not climb to the
 * registry. It leaves the editor for a module of its own on
 * `docs/PATTERNS.md` §1's *atomic* rule — a picker's catalog and its search are
 * one job, and drawing them is another — and not on its *reusable* one. What
 * the registry owns is which entries exist; how a picker spells them is here.
 *
 * Pure, with no DOM, so both halves are tested without a pane.
 */

import { getComponent, listComponentTypes, paletteEntries } from '../components';
import { componentDisplayName } from './component-name';
import { ComponentConfig } from '../types';

/**
 * One line of the picker: a bare type, or a type with its config prefilled.
 *
 * A type is a line and its entries follow it, because an author who wants a
 * plain Track has to be able to ask for one (SPEC §4.2): an entry is a starting
 * point they then edit, not a variant with capabilities of its own.
 */
export interface PickerChoice {
	/**
	 * Stable address: a type on its own, or the type and the entry's index.
	 *
	 * The index rather than a machine id on the entry itself, because the value
	 * only has to tell one line from another inside one list, and a member for it
	 * would be a member every future entry has to invent a value for. A colon
	 * rather than a hash, because the harness addresses a line by query string
	 * and `#` starts a fragment; a type id is lower-case and hyphenated, so a
	 * colon parses unambiguously.
	 */
	value: string;
	type: string;
	/** The line's name, and the label the new component starts with. */
	name: string;
	/** One sentence saying what it is: the type's, or the entry's own. */
	description: string;
	/** Whether it is a prefill of the type above it, which is what indents it. */
	entry: boolean;
	/** What an insert writes. A bare type writes nothing, never its example. */
	config: Readonly<Partial<ComponentConfig>>;
}

/** Every type in registry order, each followed by its own palette entries. */
export function pickerCatalog(): PickerChoice[] {
	return listComponentTypes().flatMap((type) => [
		{
			value: type,
			type,
			name: componentDisplayName(type),
			description: getComponent(type)?.description ?? '',
			entry: false,
			config: {},
		},
		...paletteEntries(type).map((entry, index) => ({
			value: `${type}:${index}`,
			type,
			name: entry.name,
			description: entry.description,
			entry: true,
			config: entry.config,
		})),
	]);
}

/**
 * The lines a query leaves showing, in catalog order.
 *
 * Case-insensitive, split on whitespace, and every term must appear somewhere
 * in the line's name or its description. **Names and descriptions only, never
 * a job word**: a job does not name one component across systems, so a keyword
 * list would be system flavour in the catalog (SPEC §13). A job reaches the
 * picker through a palette entry's own words or not at all.
 *
 * **Grouping decides visibility, and nothing is ranked.** A type that matches
 * shows its whole block, since its entries *are* that type configured; an
 * entry that matches shows under its type, and the type line comes with it,
 * because an entry never floats without the type it prefills. So a filtered
 * list is always a slice of the catalog in its own order.
 */
export function filterCatalog(
	choices: readonly PickerChoice[],
	query: string,
): PickerChoice[] {
	const terms = query.toLowerCase().split(/\s+/).filter((term) => term !== '');
	if (terms.length === 0) return [...choices];
	const matches = (choice: PickerChoice): boolean => {
		const text = `${choice.name} ${choice.description}`.toLowerCase();
		return terms.every((term) => text.includes(term));
	};
	const shown: PickerChoice[] = [];
	for (const head of choices.filter((choice) => !choice.entry)) {
		const block = choices.filter((choice) => choice.type === head.type);
		if (matches(head)) {
			shown.push(...block);
			continue;
		}
		const entries = block.filter((choice) => choice.entry && matches(choice));
		if (entries.length > 0) shown.push(head, ...entries);
	}
	return shown;
}

/**
 * The shape words the empty state offers in place of a query that found
 * nothing (`docs/features/component-picker.md` §10). Each matches at least one
 * line today, which `picker-catalog.test.ts` holds.
 */
export const SHAPE_WORDS = ['number', 'boxes', 'list', 'table', 'picture', 'text'] as const;

/** What the list says when a query found nothing: the query, then the fix. */
export function noMatchMessage(query: string): string {
	return `Nothing matches "${query.trim()}". Search by shape: ${SHAPE_WORDS.join(', ')}.`;
}
