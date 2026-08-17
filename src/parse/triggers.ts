/*
 * The layout's reset triggers (SPEC §6), read as a set.
 *
 * The split here is §5's, the same one the function library follows. Whether
 * `triggers` is a list of strings at all is the file format's business and
 * refuses the layout in parseLayout. Whether a name in it is usable — blank,
 * repeated, or named by a binding that matches nothing — is contents, and
 * contents are reported where they can be fixed while every sheet on the
 * layout goes on rendering. One trigger typed twice must not blank a party's
 * worth of characters.
 *
 * The dangling-binding check has to live here rather than beside the rest of
 * the binding's validation, and not by preference: a component is parsed
 * without the layout around it, so nothing at that point knows which triggers
 * exist.
 */

import { Layout } from './layout';

/** Something wrong with a trigger name or a binding to one. */
export interface TriggerProblem {
	message: string;
	/**
	 * The label of the component whose binding is at fault, where the problem
	 * is a binding rather than a declaration. The editor shows the problem on
	 * that component's form; a declaration problem belongs to the list.
	 */
	component?: string;
}

export interface ParsedTriggers {
	/**
	 * The usable trigger names, in declaration order, with blanks dropped and
	 * repeats collapsed to their first appearance. This is what the sheet
	 * draws buttons from and what the editor offers a binding.
	 */
	names: readonly string[];
	problems: readonly TriggerProblem[];
}

export const NO_TRIGGERS: ParsedTriggers = { names: [], problems: [] };

/**
 * Read a layout's triggers and check every binding against them.
 *
 * Takes the components as well as the names because the two questions have
 * one answer: a trigger nothing binds to and a binding pointing at no trigger
 * are the same mistake seen from either end, and reporting them together is
 * what lets the editor say which it is.
 */
export function parseTriggers(layout: Layout): ParsedTriggers {
	const declared = layout.triggers ?? [];
	const problems: TriggerProblem[] = [];
	const names: string[] = [];
	const seen = new Set<string>();

	for (const raw of declared) {
		const name = raw.trim();
		if (name === '') {
			// Not merely useless: a binding stores the name it matched, and an
			// empty one would match every component that has no trigger set.
			problems.push({ message: 'A trigger needs a name.' });
			continue;
		}
		if (seen.has(name)) {
			problems.push({
				message: `"${name}" is declared more than once. The second is ignored, since two buttons with one name could not be told apart.`,
			});
			continue;
		}
		seen.add(name);
		names.push(name);
	}

	for (const component of layout.components) {
		for (const reset of component.reset ?? []) {
			if (seen.has(reset.trigger)) continue;
			problems.push({
				component: component.label,
				message: `"${component.label}" resets on "${reset.trigger}", which this layout does not declare. It will not reset until a trigger of that name exists.`,
			});
		}
	}

	return { names, problems };
}
