/*
 * The layout's modifier definitions (SPEC §5), read as a list.
 *
 * The same split `parse/triggers.ts`, the function library and the bonus types
 * follow: whether `modifiers` is an array of objects at all is the file format's
 * business and refuses the layout in `parseLayout`, while whether a definition
 * is *usable* — no name, a name twice, no target, a target that reads no
 * modifier, an amount that will not parse — is contents, reported where it can
 * be fixed while every sheet on the layout goes on rendering. One typo must not
 * blank a party's worth of characters.
 *
 * **It takes the accepting-set sources as well as the layout, and that is a
 * departure from `parse/modifier-types.ts`'s "exact argument" that could not be
 * avoided.** Two of the problems below are about a *target*, and whether a name
 * is published — and whether its own formula reads a modifier — is a question
 * about the components' definitions in the registry, which a pure module may not
 * reach (Constraint 5). `modifierTargetSource` is what every caller already has
 * in hand for exactly that reason, so the sources arrive as an argument and the
 * one derivation of the accepting set stays in `formula/modifier-targets.ts`.
 *
 * **The cell's own format is `parse/modifier-cell.ts`'s**, and the two name checks
 * below import from it rather than spelling either. That is one fact and not two:
 * the character that separates two parts of a cell and the shape that marks a part
 * as typed are exactly the two things a name may not be, so two declarations of
 * them could drift apart — which is the one way this feature could silently
 * produce a cell nobody can spell.
 *
 * Pure, so Constraint 5 holds; the direction of the import into `formula/` is
 * the one `parse/layout.ts` already runs.
 */

import {
	acceptingTargets,
	ModifierTargetSource,
	publishedTargets,
} from '../formula/modifier-targets';
import { Layout } from './layout';
import { unspellableName } from './modifier-cell';
import {
	ModifierDefinitionView,
	ModifierPhase,
	operatorOf,
} from '../types';
import { parseExpression } from '../formula/expression';

/** Something wrong with one modifier definition, or with the list. */
export interface ModifierDefinitionProblem {
	message: string;
	/**
	 * The definition the problem belongs to, where it belongs to one rather than
	 * to the list. Drawn as a quieter locator before the message, which is the
	 * shape `parse/triggers.ts` already returns.
	 */
	definition?: string;
}

export interface ParsedModifierDefinitions {
	/**
	 * The usable definitions, in declaration order, with unnamed ones dropped
	 * and repeats collapsed to their first appearance. This is what a modifier
	 * cell's picker offers and what the sheet resolves an enrolment against.
	 *
	 * **A definition with a reported target is still usable**, deliberately: a
	 * target that reads no modifier is a formula to edit somewhere else, and the
	 * row that enrols in it is not wrong. Only a definition nothing could resolve
	 * at all — no name — is dropped.
	 */
	definitions: readonly ModifierDefinitionView[];
	problems: readonly ModifierDefinitionProblem[];
}

/** A definition as the file may hold one: every member a free `unknown`. */
type RawDefinition = Record<string, unknown>;

/** A string member, trimmed, or the empty string where the file holds none. */
function text(raw: RawDefinition, key: string): string {
	const value = raw[key];
	return typeof value === 'string' ? value.trim() : '';
}

/** Whether an expression parses, without evaluating it. */
function parses(source: string): boolean {
	try {
		parseExpression(source);
		return true;
	} catch {
		return false;
	}
}

/**
 * Read a layout's modifier definitions and report what cannot be used.
 *
 * Takes the whole layout rather than the list, on `parseTriggers`' shape, so a
 * caller reading a field back can hand this the layout it is editing with the
 * typed value substituted in.
 *
 * **The undeclared-bonus-type problem is deliberately not here.** It is the
 * shipped check with its input moved, and its home is `parse/modifier-types.ts`
 * — reported under the **Bonus types** field, which is where the fix is and
 * where an author already reads about types. Reporting it in both places would
 * be `docs/UI.md` §9's two answers to one question.
 */
export function parseModifierDefinitions(
	layout: Layout,
	/**
	 * Required, and that is the whole of what this parameter has to say.
	 *
	 * With no sources both name sets are empty, so **every definition with a
	 * target earns "this layout publishes no value under it"** — including every
	 * correct one. A default of `[]` therefore does not mean "check what you can";
	 * it means "report confident nonsense", and the one caller that took it got
	 * away with it only by discarding `problems`. The header above argues at length
	 * that these must arrive as an argument; a default is that argument declining
	 * to be one.
	 */
	sources: readonly ModifierTargetSource[],
): ParsedModifierDefinitions {
	const problems: ModifierDefinitionProblem[] = [];
	const definitions: ModifierDefinitionView[] = [];
	const seen = new Set<string>();

	const accepting = new Map(
		acceptingTargets(sources).map((target) => [target.name, target.label]),
	);
	// Both through `modifier-targets.ts`, which is the one derivation of either:
	// the accepting set says whether a target is offered, and the published set
	// says whether it exists at all — which is what separates a typo from a
	// formula that reads no slot.
	const published = new Map(
		publishedTargets(sources).map((target) => [target.name, target.label]),
	);
	// Read as a shape rather than as the declared type: `parseLayout` checked that
	// each entry is an object and nothing more, so every member here is still a
	// free `unknown` and a hand-edited file may hold a number where a name goes.
	const raws = (layout.modifiers ?? []) as unknown as readonly RawDefinition[];
	for (const raw of raws) {
		const name = text(raw, 'name');
		if (name === '') {
			// A cell stores the name it was given, so a definition with none is one
			// no row could ever enrol in — there is nothing to write in the cell.
			problems.push({ message: 'A modifier needs a name.' });
			continue;
		}
		/*
		 * **A name a cell could not spell unambiguously is reported and dropped**,
		 * both shapes through one call. Dropped as well as reported, on the argument
		 * the nameless case above already makes: a cell stores the name it was given,
		 * so a name no cell could spell is a name no row could ever enrol in.
		 *
		 * **Not merely reported-and-kept**, which is the tempting middle: such a
		 * definition would work in a cell naming only it and tear in half the moment
		 * a second part joined it, and a rule a reader meets once by surprise in the
		 * middle of an edit is worse than one that refuses up front.
		 *
		 * **The name is constrained rather than the separator made safe**, because
		 * there is no character a name cannot hold: a name is free text out of a JSON
		 * file, and even the pipe survives — `parse/table.ts` escapes it to `\|` on
		 * the way into a cell and hands it back whole.
		 *
		 * The sentences are `parse/modifier-cell.ts`'s, beside the predicates that
		 * produce them, so this report and the panel's own refusal cannot come apart
		 * (`PATTERNS.md` §1). **The blank case is not routed through it**, and that is
		 * deliberate: a list entry with no name and a reader who has just pressed
		 * **Save to the layout** are two readers, and each gets the sentence its own
		 * surface owes — "A modifier needs a name." above, "Give it a name to reuse it
		 * by." there.
		 */
		const unspellable = unspellableName(name);
		if (unspellable !== null) {
			problems.push({ definition: name, message: unspellable });
			continue;
		}
		if (seen.has(name)) {
			problems.push({
				definition: name,
				message: `"${name}" is declared more than once. The second is ignored, since two definitions with one name could not be told apart.`,
			});
			continue;
		}
		seen.add(name);

		const target = text(raw, 'target');
		const operator = operatorOf(raw);
		const amount = text(raw, 'amount');
		const bonusType = text(raw, 'bonusType');
		/*
		 * **Anything but the word `result` is the value phase** (SPEC §5), which is
		 * what keeps a hand-edited layout safe: a typo leaves the modifier doing
		 * what it did before phases existed rather than moving it somewhere the
		 * author did not ask for. A stray spelling is reported below and dropped to
		 * the default, on §10's "rendered, not corrected" — the layout file keeps
		 * whatever was typed.
		 */
		const storedPhase = text(raw, 'applies');
		const applies: ModifierPhase = storedPhase === 'result' ? 'result' : 'value';
		const when = text(raw, 'when');

		if (target === '') {
			problems.push({
				definition: name,
				message: `"${name}" changes nothing, because it names no value. Choose one under Changes.`,
			});
		} else if (!published.has(target)) {
			problems.push({
				definition: name,
				message: `"${name}" changes "${target}", which this layout publishes no value under. Choose one it does, or correct the spelling.`,
			});
		} else if (!accepting.has(target)) {
			// dnd5e#3900 caught in the editor rather than on a sheet: an effect
			// aimed at a value whose own formula reads no slot adds nothing and
			// says nothing. Reported per definition, with the fix in it.
			problems.push({
				definition: name,
				message: `"${target}" reads no modifier, so "${name}" changes nothing. Add "+ mod.self" to that value's own formula.`,
			});
		}

		if (amount === '') {
			problems.push({
				definition: name,
				message: `"${name}" has no amount, so it changes nothing. Give it an expression under Amount.`,
			});
		} else if (!parses(amount)) {
			problems.push({
				definition: name,
				message: `"${name}" has an amount that is not an expression: "${amount}".`,
			});
		}

		if (when !== '' && !parses(when)) {
			problems.push({
				definition: name,
				message: `"${name}" has a condition that is not an expression: "${when}".`,
			});
		}

		if (storedPhase !== '' && storedPhase !== 'value' && storedPhase !== 'result') {
			problems.push({
				definition: name,
				message: `"${name}" applies to "${storedPhase}", which is not a phase. Use "value" to change the number behind the formula, or "result" to change what the formula came to.`,
			});
		} else if (applies === 'result' && operator === 'override') {
			// An override already replaces the published number, which is the result
			// phase by construction; saying so a second way would be two spellings
			// for one behaviour.
			problems.push({
				definition: name,
				message: `"${name}" sets a value, so it always applies to the result and "applies" is ignored. Clear it, or make this modifier add to the value instead.`,
			});
		}

		if (bonusType !== '' && operator === 'override') {
			// Ignored in the arithmetic rather than refused, because overrides do
			// not contest by type: the highest wins whatever either was called.
			problems.push({
				definition: name,
				message: `"${name}" sets a value, so its bonus type "${bonusType}" is ignored: overrides are not contested by type. Clear it, or make this modifier add to the value instead.`,
			});
		}

		definitions.push({
			name,
			target,
			operator,
			amount,
			...(bonusType !== '' ? { bonusType } : {}),
			// Omitted for the value phase, so a layout gains a key only where it
			// means something other than the default (PATTERNS §8).
			...(applies === 'result' && operator !== 'override'
				? { applies }
				: {}),
			...(when !== '' ? { when } : {}),
			/*
			 * The reader's own words for the value, wherever there are any.
			 *
			 * The accepting map first, since it is the same derivation and already in
			 * hand; then the published one, which is the case the sheet had wrong —
			 * a definition aimed at a value that reads no modifier is *published*, so
			 * it has a label, and falling straight through to the identifier put
			 * `passive_perception` in a popover on a player's inventory row. The bare
			 * name is left only for a target this layout does not publish at all,
			 * where there is nothing else it could be called, and the definition's own
			 * name for a definition with no target at all.
			 */
			targetLabel:
				accepting.get(target) ??
				published.get(target) ??
				(target === '' ? name : target),
		});
	}

	return { definitions, problems };
}
