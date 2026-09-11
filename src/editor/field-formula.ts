/*
 * What a formula *field* in the layout editor makes of the text it holds.
 *
 * One rule, and it is the file-format half rather than the language half: a
 * blank field means the key is absent, which is a state every component reading
 * one of these keys already has an answer for — a Card with no `derived`
 * publishes its stored value, a computed column with no formula draws an empty
 * cell. So blank is checked here and everything else is handed to the parser.
 *
 * A module of its own rather than a second export from `field-error.ts`, on
 * `docs/PATTERNS.md` §1's other test: that file's job is where a message is
 * drawn and how it survives a rebuild of the pane, and "blank means absent, and
 * this is what the parser said" is a rule rather than a drawing. And the blank
 * half stays out of `formula/expression.ts` for the mirror reason: absence is
 * the editor's own rule, spelled in `setOptional` in `list-fields.ts`, not
 * something the expression language has an opinion about — the parser, asked
 * about an empty string, correctly reports that it expected a value.
 *
 * **`field-formula.ts` and not `formula-field.ts`, which is the name this file
 * shipped under for one review.** The folder's names carry their head noun
 * last: `X-field.ts` is a field and every one of the six renders one, while
 * `field-X.ts` — `field-commit.ts`, `field-error.ts`, `field-lines.ts` — is a
 * policy *about* fields, which is what this is. `list-field-height.ts` is the
 * same rule rather than a counterexample: what it owns is a height. Under the
 * old name a reader looking for the widget that draws a formula field found a
 * predicate, and the name the widget would want was taken.
 */

import { expressionProblem } from '../formula/expression';

/**
 * What is wrong with a formula field's contents, or `null` where there is
 * nothing to say. The one answer for both moments a field is checked: nothing
 * is refused and nothing reverts, so a commit and a render have the same thing
 * to report about the same text (`docs/features/formula-field-errors.md`).
 */
export function formulaProblem(
	/**
	 * The field's own value, as the config may hold one: a string, a number
	 * where the layout wrote arithmetic as arithmetic — a track row's segment
	 * count — or absent.
	 */
	source: string | number | undefined,
): string | null {
	// Absent, or a number, which is already a value and so has no text to be
	// wrong about. Written as the two cases rather than `typeof !== 'string'`
	// so that the *type* carries the guard (`docs/PATTERNS.md` §1, §10): widen
	// the parameter one day — a key holding a list of expressions — and this
	// stops compiling instead of quietly answering `null` for a list of broken
	// ones.
	if (source === undefined || typeof source === 'number') return null;
	const trimmed = source.trim();
	if (trimmed === '') return null;
	return expressionProblem(trimmed);
}
