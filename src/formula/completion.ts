/*
 * What a caret in a half-typed formula is pointing at.
 *
 * One job: given the text of a formula field and a caret offset, say which run
 * of characters the caret is inside, how that run breaks into a dotted path, and
 * whether it sits in an argument of `sum(` or `count(`. It offers nothing, knows
 * no component and reads no layout — the vocabulary beside it answers what the
 * names *are*, and this answers where the author is standing.
 *
 * **In `formula/` and not in `editor/`**, because everything it knows is the
 * language's own syntax: which characters make a name, that `(` and `,`
 * structure a call, and that two of those calls take a component reference as
 * their first argument (SPEC §5). Nothing it knows is about an input, a popup or
 * a pane, and it imports nothing from `obsidian` (Constraint 5).
 *
 * **It is a character scan and never a parse, and that is not an optimisation.**
 * `parseExpression` throws on most of the text a field holds while it is being
 * typed — `10 + abil` is a name that does not exist, `sum(inventory, ` is a call
 * with a missing argument — so a parser would answer "nothing" on exactly the
 * keystrokes a suggester exists for. This never throws: every path returns a
 * `Completion` or `null`.
 */

import { AGGREGATE_NAMES } from './expression';

/**
 * Which argument of which aggregate the caret sits in.
 *
 * `table` is the text of the first argument as the author has typed it so far,
 * which may name no component at all — the vocabulary decides what to do with
 * that, because "no such component" is a state a half-typed call is in for as
 * long as it takes to type the name.
 */
export interface Aggregate {
	/** The first argument's text, trimmed. Possibly empty, possibly nonsense. */
	table: string;
	/** 0 for the component reference, 1 and up for the expression arguments. */
	argument: number;
}

/** Where the caret is, and what a suggestion would replace. */
export interface Completion {
	/** Start of the fragment, inclusive. An accepted name replaces `[start, end)`. */
	start: number;
	/** End of the fragment, exclusive. */
	end: number;
	/** The fragment's segments before the last dot: `['mod', 'abilities']`. */
	path: readonly string[];
	/** The text after the last dot, which is what a candidate is matched against. */
	prefix: string;
	/** The enclosing `sum(` or `count(`, where there is one. */
	aggregate?: Aggregate;
}

/**
 * What a fragment is made of.
 *
 * **Deliberately not `expression.ts`'s own `SEGMENT`**, and the digit is the
 * whole of the difference: a name grammar refuses a leading digit outright,
 * while this has to *admit* one in order to recognise `10` as a number literal
 * and then refuse to complete it. A predicate that could not spell `10` would
 * report the caret after it as sitting on an empty fragment, which is the same
 * answer for a different reason and stops being the same answer the moment a
 * rule changes.
 */
function isFragmentChar(char: string): boolean {
	return /[A-Za-z0-9_.]/.test(char);
}

/** A character a name may be made of — the aggregate scan's own alphabet. */
function isNameChar(char: string): boolean {
	return /[A-Za-z0-9_]/.test(char);
}

/**
 * The completion context at `caret`, or `null` where nothing should be offered.
 *
 * Two refusals, and both are the popup staying shut rather than a failure:
 *
 * - **An empty fragment.** Nothing is offered unsolicited — not on focus, not
 *   after a space, not after `(`. The author asks by typing a character or a
 *   dot, and `abilities.` is a *non-empty* fragment with an empty prefix, which
 *   is how the second level opens.
 * - **A fragment beginning with a digit.** That is a number literal, or a caret
 *   sitting just after one, and a list popping up over `10` is the single most
 *   reported defect of the surveyed completers. The check is on the fragment's
 *   first character rather than on the caret's own neighbour, so `2d6` is silent
 *   while `d6` is a name like any other.
 */
export function completionAt(text: string, caret: number): Completion | null {
	const at = Math.max(0, Math.min(caret, text.length));

	// The maximal run around the caret, extended in both directions. Both
	// directions rather than leftwards only, so a caret put in the middle of an
	// existing name replaces that whole name instead of cutting it in half.
	let start = at;
	while (start > 0 && isFragmentChar(text[start - 1] as string)) start -= 1;
	let end = at;
	while (end < text.length && isFragmentChar(text[end] as string)) end += 1;

	const fragment = text.slice(start, end);
	if (fragment === '') return null;
	if (/[0-9]/.test(fragment[0] as string)) return null;

	const segments = fragment.split('.');
	const prefix = segments[segments.length - 1] as string;
	const path = segments.slice(0, -1);

	const aggregate = aggregateAt(text, start);
	return aggregate === null
		? { start, end, path, prefix }
		: { start, end, path, prefix, aggregate };
}

/**
 * Walk outward from the fragment looking for the `sum(` or `count(` it is an
 * argument of.
 *
 * Parentheses are counted rather than matched: a `)` met on the way out deepens,
 * because it closes a call that opened before the caret and whose own `(` is
 * therefore not ours. A `,` counts only at depth zero, so a nested call's
 * argument separators do not shift which argument the caret is in.
 *
 * **An identifier that is not an aggregate resets the comma count and the walk
 * keeps going**, because the caret is then inside an argument of a call nested
 * in whatever encloses *that* — `sum(inventory, floor(We` is argument 1 of the
 * sum, not argument 0 of the floor.
 */
function aggregateAt(text: string, from: number): Aggregate | null {
	let depth = 0;
	let commas = 0;
	let index = from - 1;
	while (index >= 0) {
		const char = text[index] as string;
		if (char === ')') {
			depth += 1;
			index -= 1;
			continue;
		}
		if (char === ',') {
			if (depth === 0) commas += 1;
			index -= 1;
			continue;
		}
		if (char !== '(') {
			index -= 1;
			continue;
		}
		if (depth > 0) {
			depth -= 1;
			index -= 1;
			continue;
		}
		// An open parenthesis at depth zero: whatever called it encloses the
		// caret. Read the identifier immediately to its left.
		let nameStart = index;
		while (nameStart > 0 && isNameChar(text[nameStart - 1] as string)) {
			nameStart -= 1;
		}
		const name = text.slice(nameStart, index);
		// The language's own list, so a third aggregate is recognised here the
		// day it parses rather than the day somebody notices it is not.
		if (AGGREGATE_NAMES.includes(name)) {
			const rest = text.slice(index + 1);
			const comma = rest.indexOf(',');
			return {
				table: (comma === -1 ? rest : rest.slice(0, comma)).trim(),
				argument: commas,
			};
		}
		commas = 0;
		index = nameStart - 1;
	}
	return null;
}
