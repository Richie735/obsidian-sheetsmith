/*
 * A parsed modifier definition, built the way a case reads best.
 *
 * `ModifierDefinitionView` is the normalised shape — a name, an optional
 * condition, and a list of changes each carrying its own target, operator,
 * amount, bonus type and phase — and a case that means "a ring adding one to
 * armour class" should say that rather than spelling a one-entry list around it.
 *
 * **Scaffolding and not a test case** (`PATTERNS.md` §2), on `pointer.ts`'s own
 * terms: the shape belongs to no one module, and **five test files build it** —
 * `formula/sheet.test.ts`, `formula/modifiers.test.ts`,
 * `formula/modifier-definitions.test.ts`, `components/table.test.ts` and
 * `components/modifier-breakdown.test.ts`. §1 extracts on the third. What it
 * saves is not typing — it is that a case which meant to name one value cannot
 * accidentally build a definition naming none, which is a green test asserting
 * the wrong thing.
 *
 * **No `parse/` consumer, deliberately.** A case about the parser calls the
 * parser and reads what comes out; building the output shape by hand there would
 * be the test asserting against its own construction. This header claimed six
 * files across three folders when it was written and there were four across two,
 * which is the count going stale in the same commit that set it — so it names
 * them rather than counting them.
 *
 * Deliberately **not** a re-implementation of `parseModifierDefinitions`: it
 * normalises nothing, reports nothing and labels nothing. A case that is about
 * the parser calls the parser.
 */

import {
	ModifierChangeView,
	ModifierDefinitionView,
	ModifierOutcome,
} from '../types';

/**
 * One change, with the two required members defaulted to blank and the label
 * defaulted to the target's own name.
 *
 * Private: `definitionView` is the only caller, and §1 keeps a one-consumer
 * helper inside the module that wants it.
 *
 * Blank rather than a plausible value, so a case that forgot to say what a change
 * does fails on the arithmetic rather than passing on a number this file chose.
 */
function changeView(
	over: Partial<ModifierChangeView> = {},
): ModifierChangeView {
	const target = over.target ?? '';
	return {
		target,
		amount: over.amount ?? '',
		targetLabel: over.targetLabel ?? target,
		// Spelled key by key rather than spread, because a partial holding an
		// explicit `undefined` would otherwise write the key back in — and an
		// `operator: undefined` is not what a definition that says nothing is.
		...(over.operator === undefined ? {} : { operator: over.operator }),
		...(over.bonusType === undefined ? {} : { bonusType: over.bonusType }),
		...(over.applies === undefined ? {} : { applies: over.applies }),
	};
}

/**
 * A definition, spelled flat for the one-change case and with `changes` for the
 * rest.
 *
 * `definitionView({ name: 'Ring', target: 'armour_class', amount: '1' })` is one
 * change; `definitionView({ name: 'Ring', changes: [{ … }, { … }] })` is two.
 */
export function definitionView(
	over: Partial<ModifierChangeView> & {
		name?: string;
		when?: string;
		changes?: readonly Partial<ModifierChangeView>[];
	} = {},
): ModifierDefinitionView {
	const { name = 'Modifier', when, changes, ...flat } = over;
	return {
		name,
		...(when === undefined ? {} : { when }),
		changes: (changes ?? [flat]).map(changeView),
	};
}

/**
 * What one change of one part comes to, with the members a case is not about
 * defaulted to "nothing resolved".
 *
 * **Nine members, six of which are the same in almost every case**: what a case
 * is usually about is `applies`, `amount` and `suppressed`, and nine-member
 * literals hide that. It lives here rather than in a component's own file
 * because it was written out three times — a Card's, a Card set's and a Table's,
 * the first two byte-identical — and each of those copies carried a comment
 * saying that adding a member to the contract would be one edit. Adding `change`
 * for a definition naming several values was three edits and two more hand-built
 * literals, which is the measurement that moved it.
 */
export function outcomeView(
	over: Partial<ModifierOutcome> = {},
): ModifierOutcome {
	return {
		definition: null,
		change: null,
		typed: null,
		target: '',
		targetLabel: '',
		applies: false,
		amount: null,
		condition: null,
		suppressed: null,
		...over,
	};
}
