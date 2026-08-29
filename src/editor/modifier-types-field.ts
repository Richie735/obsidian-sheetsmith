/*
 * The layout's bonus types (SPEC §5, §7), as a field in the layout editor.
 *
 * A textarea, one name per line: the types are read as a set, a Pathfinder
 * layout's list is three lines, and a name that cannot be used is reported here
 * rather than refused at load so the sheets on this layout go on rendering while
 * it is fixed.
 *
 * It sits beside the function library because it is the same category — the
 * layout's own vocabulary, shared by every component using it. A per-table list
 * would make one table's "item" and another table's "item" two types that stack,
 * which is the arithmetic being wrong for a reason nothing on screen shows.
 *
 * Columns naming a type this layout no longer declares are reported here too,
 * since this is the one place with the whole picture — and it is the *only* place
 * that can have it, because Table's own `configError` is handed a config and
 * never the layout (`parse/modifier-types.ts`).
 *
 * **The form itself is `line-list-field.ts`**, shared with the trigger list. This
 * module is the layout key, the copy, and how a bonus-type list is read.
 */

import {
	commitLineList,
	LineListField,
	LineListSpec,
	renderLineList,
} from './line-list-field';
import { Layout } from '../parse/layout';
import { parseModifierTypes } from '../parse/modifier-types';

/**
 * Sample types for the field. Constants rather than prose for the reason the
 * function library's are: these are names an author types into a column's
 * **Bonus type**, and sentence case would make them different names — an "Item"
 * bonus and an "item" bonus would be two types that stack.
 */
const TYPE_EXAMPLE = 'item';
const TYPE_PLACEHOLDER = 'status';

/** Everything the shared field cannot work out for itself. */
function spec(layout: Layout): LineListSpec {
	return {
		key: 'modifierTypes',
		/*
		 * **Bonus types**, matching every other name for this on screen.
		 *
		 * There were three words for one thing: this heading said "Modifier types",
		 * the description under it "bonus types", the count line "3 bonus types
		 * defined", and the per-column control **Bonus type**. `docs/UI.md` §9
		 * wants one, and the count is not close — seven of the eight user-facing
		 * strings already said bonus type, including the control an author actually
		 * touches and both parse messages. The control it names is a definition's
		 * **Bonus type** now rather than a column's; the word did not move.
		 *
		 * The layout key stays `modifierTypes`. It is a file-format name rather
		 * than a label, renaming it would need a migration of every layout that
		 * has one, and `parse/layout.ts` already spells the pairing out the right
		 * way round: it names the key and then calls the thing a bonus type.
		 */
		heading: 'Bonus types',
		description:
			'The bonus types this layout\'s modifiers may declare, one per line. Two modifiers of one type do not add: the best bonus and the worst penalty apply, and different types add. A modifier this layout names picks one of these; a modifier typed on a character\'s row may name a type this list does not have, which still stacks only against its own kind and is shown as not declared. Removing one changes no character note.',
		example: TYPE_EXAMPLE,
		placeholder: TYPE_PLACEHOLDER,
		className: 'sheetsmith-modifier-types',
		token: 'modifier-types',
		problemsId: 'sheetsmith-modifier-type-problems',
		noun: 'bonus type',
		read: (names) => {
			const { names: usable, problems } = parseModifierTypes({
				...layout,
				modifierTypes: [...names],
			});
			// A dangling type belongs to a definition now rather than to a
			// component's column, which is the whole of what moved here.
			return {
				usable,
				problems: problems.map(({ message, definition }) => ({
					message,
					...(definition !== undefined ? { locator: definition } : {}),
				})),
			};
		},
	};
}

/** Kept as a name of its own, so the pane and its tests read as they did. */
export type ModifierTypesField = LineListField;

export type ModifierTypesContext = Parameters<typeof renderLineList>[3];

export function commitModifierTypes(field: ModifierTypesField | null): boolean {
	return commitLineList(field);
}

export function renderModifierTypes(
	container: HTMLElement,
	layout: Layout,
	context: ModifierTypesContext,
): ModifierTypesField {
	return renderLineList(container, layout, spec(layout), context);
}
