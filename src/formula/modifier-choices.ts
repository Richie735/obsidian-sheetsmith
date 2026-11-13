/*
 * A dropdown's option a modifier chooses, folded onto what the note stores
 * (`docs/features/text-value-modifiers.md`).
 *
 * One job: given the shape of one Card dropdown, the changes the walk found
 * choosing its option, and what the note holds, answer the option the sheet
 * draws and the account its door reads. The walk itself stays in
 * `modifiers.ts`, where it is still one walk: a change carrying `option` is a
 * fifth reduction of it, beside the slot, the notes, the states and the
 * buffers, and never reaches the slot — so `mod.<target>` and a number's
 * breakdown are untouched by one. Which values are dropdowns is a fact Card
 * states on `ScopeEntry.choice`, collected statically by
 * `modifier-targets.ts`'s `choiceTargets`.
 *
 * **No order is read anywhere** (the spec's amendment 1). A dropdown's order is
 * the order its author typed the options in, so "later wins" means nothing for
 * an alignment: only Sets chooses, two Sets naming one option tie, and two
 * naming different options refuse the choice rather than one of them winning by
 * a rule nobody wrote down (D5). That is also why the result cannot depend on
 * walk order: only the refusal's wording does.
 *
 * **The literal is an address, not a value in the language.** It is matched
 * byte for byte against the options' values, as a stored value is (D4), and a
 * literal matching none refuses the choice, loudly, in three places.
 *
 * Pure, so Constraint 5 holds.
 */

import {
	ChoiceAccount,
	ChoiceLine,
	ChoiceReader,
	ChoiceShape,
	ChoiceTarget,
	ModifierOperator,
} from '../types';
import { OPERATOR_LABELS, TEXT } from '../en';
import { FormulaError } from './expression';
import { isOptionChange } from '../parse/modifier-cell';
import { suppressionWording } from './suppression-wording';
import { called, Enrolment } from './modifier-definitions';

/** Why an Adds to may not choose an option, and what to choose instead (D3). */
export const CHOICE_REFUSES_ADD = `${TEXT.choiceRefusesAdd} Choose ${OPERATOR_LABELS.override}.`;

/** Why an At least may not choose an option, and what to choose instead (D3). */
export const CHOICE_REFUSES_AT_LEAST = `${TEXT.choiceRefusesAtLeast} Choose ${OPERATOR_LABELS.override}.`;

/** Every declared dropdown on the sheet, by the name a change's target spells. */
export type ChoiceShapes = ReadonlyMap<string, ChoiceShape>;

/**
 * The declared dropdowns as the walk and every reader of one look them up. One
 * spelling, so the walk, the editor's report and the form cannot key one
 * dropdown two ways.
 */
export function choiceShapesOf(targets: readonly ChoiceTarget[]): ChoiceShapes {
	return new Map(targets.map((target) => [target.name, target.shape]));
}

/** The word a card shows for an option's value: its label, or the value itself. */
export function optionWord(shape: ChoiceShape, value: string): string {
	return shape.options.find((option) => option.value === value)?.label ?? value;
}

/** A list as a sentence offers a choice from it: `a, b or c`. */
function orSeries(words: readonly string[]): string {
	if (words.length <= 1) return words.join('');
	return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
}

/**
 * Why a literal names no option, in its fix the option *values* in list order,
 * since the literal has to spell a value (D4). `called` names the modifier.
 */
export function noOptionReason(shape: ChoiceShape, literal: string, called: string): string {
	return `"${literal}" is not an option of ${shape.label}, so ${called} chooses nothing. Choose ${orSeries(shape.options.map((option) => option.value))}.`;
}

/** Why an operator other than Sets may not choose an option, or null for Sets (D3). */
export function choiceOperatorFault(operator: ModifierOperator): string | null {
	if (operator === 'add') return CHOICE_REFUSES_ADD;
	if (operator === 'upgrade') return CHOICE_REFUSES_AT_LEAST;
	return null;
}

/**
 * The two strays a change carrying `option` can be, before its row is known
 * (D7): aimed at a name that shows no options, or naming a column on a
 * dropdown. Shown as written and never corrected: it changes nothing at the
 * target, and the row or the report that wrote it says why. `label` names the
 * target in the reader's own word for it.
 */
function strayOf(
	shapes: ChoiceShapes,
	target: string,
	column: string | null,
	label: (name: string) => string,
): string | null {
	if (!shapes.has(target)) {
		return `${label(target)} shows no options, so this change has none to choose. Give it an amount instead.`;
	}
	if (column !== null) return `${label(target)} is a dropdown, so this change needs no column. Clear it.`;
	return null;
}

/**
 * What one resolved part does at the dropdown it names, in the one order every
 * reader takes it (D7, D3, D4): the walk reduces by it, the row's popup words
 * it, and the layout editor's report reads it off the stored change.
 *
 * - `none`: the part carries no option; the other reductions' business.
 * - `stray`: no dropdown there, or a column on one. Changes nothing, refuses
 *   nothing; said at the row.
 * - `quiet`: a condition that is false, or an option not chosen yet.
 * - `refused`: an operator other than Sets, a condition that would not
 *   resolve, a missing option on a definition, or a literal naming no option.
 *   Refuses the choice, the first refusal naming the row.
 * - `set`: an option, ready to reduce.
 */
export type ChoiceVerdict =
	| { kind: 'none' }
	| { kind: 'stray'; reason: string }
	| { kind: 'quiet'; shape: ChoiceShape }
	| { kind: 'refused'; reason: string; shape: ChoiceShape }
	| { kind: 'set'; shape: ChoiceShape; option: string };

/**
 * Whether a literal names one of a dropdown's options: byte for byte against
 * the values, §4.2's comparison for a stored value (D4). One spelling for the
 * walk, the report and both pickers' stray line.
 */
export function namesOption(shape: ChoiceShape, literal: string): boolean {
	return shape.options.some((option) => option.value === literal);
}

/**
 * The faults a change carrying an option has, **in the one order every reader
 * takes them** (D7, D3, D4): the stray, the operator, the literal. A reader
 * with a row puts what only the row knows between them — the walk's quiet
 * after the stray, an unreadable condition after the operator — through the
 * two hooks; the report, with the change's words alone, passes none. One copy,
 * so the sheet and the report cannot name two faults first (`PATTERNS.md` §1).
 * A blank literal names no fault here: the walk never meets one, and the report
 * says so in its own sentence.
 */
function choiceFaults(
	shapes: ChoiceShapes,
	change: { target: string; column: string | null; operator: ModifierOperator; option: string },
	calledAs: string,
	label: (name: string) => string,
	row: {
		afterStray?: (shape: ChoiceShape) => ChoiceVerdict | null;
		afterOperator?: (shape: ChoiceShape) => ChoiceVerdict | null;
	} = {},
): ChoiceVerdict {
	const stray = strayOf(shapes, change.target, change.column, label);
	if (stray !== null) return { kind: 'stray', reason: stray };
	const shape = shapes.get(change.target) as ChoiceShape;
	const quiet = row.afterStray?.(shape) ?? null;
	if (quiet !== null) return quiet;
	const operator = choiceOperatorFault(change.operator);
	if (operator !== null) return { kind: 'refused', reason: operator, shape };
	const unread = row.afterOperator?.(shape) ?? null;
	if (unread !== null) return unread;
	if (change.option !== '' && !namesOption(shape, change.option)) {
		return { kind: 'refused', reason: noOptionReason(shape, change.option, calledAs), shape };
	}
	return { kind: 'set', shape, option: change.option };
}

/** The verdict on one resolved part. `label` names the target for a stray. */
export function choiceVerdict(
	shapes: ChoiceShapes,
	found: Exclude<Enrolment, { kind: 'unknown' }>,
	label: (name: string) => string = (name) => name,
): ChoiceVerdict {
	const { fields } = found;
	if (fields.option === null) return { kind: 'none' };
	return choiceFaults(
		shapes,
		{ target: fields.target, column: fields.column, operator: fields.operator, option: fields.option },
		called(found),
		label,
		{
			afterStray: (shape) =>
				found.kind === 'inactive' || found.kind === 'unfinished' || found.kind === 'noted'
					? { kind: 'quiet', shape }
					: null,
			afterOperator: (shape) =>
				found.kind === 'unreadable' ? { kind: 'refused', reason: found.reason, shape } : null,
		},
	);
}

/**
 * The faults a stored change earns before anything is evaluated: the layout
 * editor's report, which has the change's words and no row. `choiceFaults`'
 * own order, so the report and the sheet name one fault; an amount beside the
 * option is said first, whatever else is. Null where the change carries no
 * option.
 */
export function storedChoiceFaults(
	shapes: ChoiceShapes,
	change: { target: string; column?: string; operator?: ModifierOperator; option?: string; amount?: string },
	/** How the definition is named in the no-match sentence. */
	calledAs: string,
	label: (name: string) => string = (name) => name,
): readonly string[] | null {
	if (!isOptionChange(change)) return null;
	const faults: string[] = [];
	if ((change.amount ?? '').trim() !== '') {
		faults.push('This change has both an amount and an option, so the amount is ignored. Clear one.');
	}
	const verdict = choiceFaults(
		shapes,
		{
			target: change.target,
			column: (change.column ?? '').trim() || null,
			operator: change.operator ?? 'add',
			option: (change.option ?? '').trim(),
		},
		calledAs,
		label,
	);
	if (verdict.kind === 'stray' || verdict.kind === 'refused') faults.push(verdict.reason);
	return faults;
}

/** What the walk found at one dropdown, before the note's own value is known. */
export type ChoiceResult =
	| { shape: ChoiceShape; lines: readonly ChoiceLine[] }
	| { shape: ChoiceShape; error: string };

/**
 * What the walk found at one dropdown, or null where nothing is declared
 * there. A declared dropdown nothing chooses for answers with no lines.
 */
export type ChoiceLookup = (name: string) => ChoiceResult | null;

/** The lookup with no sheet around it: nothing is declared, so nothing folds. */
export const NO_CHOICES: ChoiceLookup = () => null;

/**
 * How the disagreement sentence names a line's source: the three tokens §9's
 * line carries, the modifier dropped where the row is already called by it.
 */
function sourceOf(line: ChoiceLine): string {
	const tokens = [line.source, line.label];
	if (line.definition !== undefined && line.definition !== line.label) tokens.push(line.definition);
	return tokens.filter((token) => token !== '').join(' · ');
}

/**
 * Fold the lines found at one dropdown onto what the note stores (D5).
 *
 * Every line is a Sets, the walk having refused any other operator. Lines
 * naming one option tie: the first applies and the rest say so in the shipped
 * tie wording. Lines naming different options refuse the choice, naming each
 * option once with the first line that named it, in walk order — the order
 * changes the sentence and never the result.
 */
export function foldChoice(result: ChoiceResult, stored: FieldStored): ChoiceAccount {
	const { shape } = result;
	const own = storedText(stored);
	if ('error' in result) return { shape, stored: own, drawn: own, lines: [], error: result.error };
	const firsts = new Map<string, ChoiceLine>();
	for (const line of result.lines) if (!firsts.has(line.option)) firsts.set(line.option, line);
	if (firsts.size > 1) {
		const named = [...firsts.values()].map(
			(line) => `${optionWord(shape, line.option)} by ${sourceOf(line)}`,
		);
		const said = `${named.slice(0, -1).join(', to ')} and to ${named[named.length - 1]}`;
		const error = `${shape.label} is set to ${said}, so ${firsts.size === 2 ? 'neither applies' : 'none of them applies'}. Turn ${firsts.size === 2 ? 'one of them' : 'all but one of them'} off.`;
		return { shape, stored: own, drawn: own, lines: [], error };
	}
	let taken = false;
	const lines = result.lines.map((line): ChoiceLine => {
		if (taken) return { ...line, suppressed: suppressionWording('override', true, 'value') };
		taken = true;
		return { ...line, suppressed: null };
	});
	const winner = lines[0];
	return { shape, stored: own, drawn: winner === undefined ? own : winner.option, lines, error: null };
}

/** What a note may hold for a dropdown's value, as the name table reads it. */
type FieldStored = string | number | boolean | undefined;

/** The note's value as text, `''` where it holds none. */
function storedText(stored: FieldStored): string {
	return stored === undefined ? '' : String(stored).trim();
}

/**
 * The reader the name table and a Card's `derived` fold through.
 *
 * **Returns `stored` itself wherever nothing chooses for the dropdown**, which
 * is what keeps every sheet with no option change the sheet it was. A refusal
 * throws, as a refused slot does, so a formula reading the bare name draws `?`
 * with the reason (D3, D4, D5); `.value` still resolves.
 */
export function choiceReaderOf(lookup: ChoiceLookup): ChoiceReader {
	return (name, stored) => {
		const result = lookup(name);
		if (result === null) return stored;
		if ('error' in result) throw new FormulaError(result.error);
		if (result.lines.length === 0) return stored;
		const account = foldChoice(result, stored);
		if (account.error !== null) throw new FormulaError(account.error);
		return account.drawn;
	};
}

/** The reader with no sheet around it: every choice as stored. */
export const READ_CHOICE_AS_STORED: ChoiceReader = (_name, stored) => stored;

/**
 * The same account against another stored value: what a card draws once its
 * menu has written a new choice and before the sheet has rebuilt. The lines are
 * the walk's and every Sets applies whatever the note holds, so only the own
 * value moves — and the drawn one, where the choice is refused and draws what
 * the note stores.
 */
export function refoldChoice(account: ChoiceAccount, stored: string): ChoiceAccount {
	return account.error !== null || account.lines.length === 0
		? { ...account, stored, drawn: stored }
		: { ...account, stored };
}
