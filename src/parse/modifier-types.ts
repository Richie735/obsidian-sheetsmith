/*
 * The layout's bonus types (SPEC §5), read as a set.
 *
 * The same split `parse/triggers.ts` and the function library follow, and for
 * the same reason: whether `modifierTypes` is a list of strings at all is the
 * file format's business and refuses the layout in `parseLayout`, while whether
 * a name in it is usable — blank, repeated, or named by a definition that no
 * longer matches one — is contents, reported where it can be fixed while every
 * sheet on the layout goes on rendering.
 *
 * **The dangling check reads the layout's modifier definitions**, where it used
 * to walk every component's columns looking for a `modifierType`. Same check,
 * moved input: the bonus type is on the definition now, which is what lets one
 * table's rows carry different types. What that also buys is that the check no
 * longer has to read a component's config as a shape to find the columns in it.
 *
 * **It has to live here rather than in a component's own `configError`, and that
 * is not a preference.** `configError` is reached from `read(body, config)`,
 * which is handed one component's config and never the layout, so no component
 * can see the declared list — and a definition is not a component's at all now.
 * This is exactly where a reset binding pointing at no trigger is reported, for
 * exactly the reason that comment gives.
 *
 * The stakes are also lower than a refusal would assume, and **the reason is now a
 * rule rather than a construction guarantee.** SPEC §5 used to say that nothing
 * stored ever names a type, so a layout edit dropping one could not reach a
 * character note at all; a row can now type its own effect and name a type in it,
 * which amends that sentence (SPEC §5). What replaces it is the rule §10
 * gains: **a stored type the layout no longer declares is rendered, not
 * corrected** — the effect applies, contests as its own kind, and the form shows
 * it as `<type> (not declared)`.
 *
 * So a dropped type still loses no character data and still changes no number,
 * because the arithmetic contests by the *string* a modifier carries and never by
 * this list. What is lost is the author's own vocabulary, and the editor is where
 * they are looking. The conclusion is the same; the premise it rests on is the
 * rule and not the guarantee, and a comment still citing the guarantee would be
 * arguing from something this feature removed.
 */

import { Layout } from './layout';

/** Something wrong with a bonus type or with a definition naming one. */
export interface ModifierTypeProblem {
	message: string;
	/**
	 * The modifier definition whose bonus type is at fault, where the problem is
	 * a definition rather than a declaration. Drawn as a quieter locator before
	 * the message; a declaration problem belongs to the list itself.
	 */
	definition?: string;
}

export interface ParsedModifierTypes {
	/**
	 * The usable type names, in declaration order, with blanks dropped and
	 * repeats collapsed to their first appearance. This is what a definition's
	 * **Bonus type** select offers.
	 */
	names: readonly string[];
	problems: readonly ModifierTypeProblem[];
}

/**
 * Read a layout's bonus types and check every definition against them.
 *
 * Takes the whole layout because the two questions have one answer, exactly as
 * `parseTriggers` does: a type nothing declares and a definition naming no type
 * are the same mistake seen from either end.
 */
export function parseModifierTypes(layout: Layout): ParsedModifierTypes {
	const problems: ModifierTypeProblem[] = [];
	const names: string[] = [];
	const seen = new Set<string>();

	for (const raw of layout.modifierTypes ?? []) {
		const name = raw.trim();
		if (name === '') {
			// A definition stores the name it was given, and an empty one already
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

	for (const definition of layout.modifiers ?? []) {
		const label = (definition.name ?? '').trim();
		const named = (definition.bonusType ?? '').trim();
		if (label === '' || named === '' || seen.has(named)) continue;
		problems.push({
			definition: label,
			message: `"${label}" is typed "${named}", which this layout does not declare. It still stacks only against modifiers of that same type, and the type will not appear in the list until a bonus type of that name exists.`,
		});
	}

	return { names, problems };
}
