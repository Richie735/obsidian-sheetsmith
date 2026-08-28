/*
 * The layout's bonus types (SPEC §5), read as a set.
 *
 * The same split `parse/triggers.ts` and the function library follow, and for
 * the same reason: whether `modifierTypes` is a list of strings at all is the
 * file format's business and refuses the layout in `parseLayout`, while whether
 * a name in it is usable — blank, repeated, or named by a column that no
 * longer matches one — is contents, reported where it can be fixed while every
 * sheet on the layout goes on rendering.
 *
 * **The dangling-column check has to live here, and that is a correction to the
 * feature spec rather than a preference.** The spec asked for "a column whose
 * `modifierType` is not in the layout's list" as a configuration error in
 * Table's own `configError` — and `configError` is reached from `read(body,
 * config)`, which is handed one component's config and never the layout. A
 * component cannot see the list, so it cannot check against it. This is exactly
 * where a reset binding pointing at no trigger is reported, for exactly the
 * reason that comment gives: a component is parsed without the layout around it,
 * so nothing at that point knows which names exist.
 *
 * The stakes are also lower than the spec assumed, which is why reporting rather
 * than refusing is the right answer here. **Nothing stored ever names a type**:
 * the type is on the column, so a layout edit that drops one cannot orphan a
 * character note (SPEC §10), and the arithmetic on the sheet is whatever the
 * column says — an undeclared type still stacks with its own kind. What is lost
 * is only the author's own vocabulary, and the editor is where they are looking.
 */

import { Layout } from './layout';
import { ComponentConfig } from '../types';
import { walkComponents } from './layout-walk';

/** Something wrong with a bonus type or with a column naming one. */
export interface ModifierTypeProblem {
	message: string;
	/**
	 * The label of the component whose column is at fault, where the problem is
	 * a column rather than a declaration. The editor shows the problem on that
	 * component's form; a declaration problem belongs to the list.
	 */
	component?: string;
}

export interface ParsedModifierTypes {
	/**
	 * The usable type names, in declaration order, with blanks dropped and
	 * repeats collapsed to their first appearance. This is what a modifier
	 * column's **Bonus type** select offers.
	 */
	names: readonly string[];
	problems: readonly ModifierTypeProblem[];
}

/** A column as this reads one: enough to see what type it claims. */
interface TypedColumn {
	modifier?: boolean;
	modifierType?: string;
}

/**
 * Every bonus type a component's columns claim.
 *
 * Reads `columns` off the config as a shape rather than asking the registry
 * which component has any, because that is what keeps this module pure
 * (Constraint 5) — and `columns` is already a key the parser walks past
 * untouched. A component with no columns claims nothing, which is the answer for
 * every component but one.
 */
function claimed(config: ComponentConfig): readonly string[] {
	const columns = (config as { columns?: unknown }).columns;
	if (!Array.isArray(columns)) return [];
	const found: string[] = [];
	for (const entry of columns as readonly TypedColumn[]) {
		if (entry.modifier !== true) continue;
		const name = (entry.modifierType ?? '').trim();
		if (name !== '') found.push(name);
	}
	return found;
}

/**
 * Read a layout's bonus types and check every modifier column against them.
 *
 * Takes the whole layout because the two questions have one answer, exactly as
 * `parseTriggers` does: a type nothing declares and a column naming no type are
 * the same mistake seen from either end.
 */
export function parseModifierTypes(layout: Layout): ParsedModifierTypes {
	const problems: ModifierTypeProblem[] = [];
	const names: string[] = [];
	const seen = new Set<string>();

	for (const raw of layout.modifierTypes ?? []) {
		const name = raw.trim();
		if (name === '') {
			// A column stores the name it was given, and an empty one already
			// means untyped — so a blank line here would offer a second spelling
			// of "no type" in the select.
			problems.push({ message: 'A bonus type needs a name.' });
			continue;
		}
		if (seen.has(name)) {
			problems.push({
				message: `"${name}" is declared more than once. The second is ignored, since two types with one name could not be told apart.`,
			});
			continue;
		}
		seen.add(name);
		names.push(name);
	}

	for (const { config } of walkComponents(layout.components)) {
		for (const name of claimed(config)) {
			if (seen.has(name)) continue;
			problems.push({
				component: config.label,
				message: `"${config.label}" has a modifier column typed "${name}", which this layout does not declare. Those modifiers still stack only against each other, and the type will not appear in the list until a bonus type of that name exists.`,
			});
		}
	}

	return { names, problems };
}
