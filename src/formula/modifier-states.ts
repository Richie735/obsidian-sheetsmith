/*
 * A level or a flag a modifier sets, folded onto what the note stores
 * (`docs/features/non-number-modifiers.md`).
 *
 * One job: given the shape of one stored choice, the changes the walk found
 * aimed at it, and what the note holds, answer the position the sheet draws and
 * the account a door reads. The walk itself stays in `modifiers.ts`, where it is
 * still one walk: a change aimed at a state is a third reduction of it, beside
 * the slot and the notes, and never reaches the slot — so `mod.<target>` and a
 * number's breakdown are untouched by one. Which values are states is a fact
 * the components state on `ScopeEntry`, collected statically by
 * `modifier-targets.ts`'s `stateTargets`, the same way the accepting set is.
 *
 * **A flag is a level with two positions**, off 0 and on 1, so one fold covers
 * both: Sets takes the highest of the Sets amounts, and At least raises what
 * that came to — or the stored position, where nothing set it — to the highest
 * floor. That is SPEC §5's override-then-floor order applied to positions, and
 * for the same reason the result cannot depend on walk order: max is
 * commutative, and two Sets of opposite values on a flag give on.
 *
 * Pure, so Constraint 5 holds.
 */

import {
	FieldValue,
	ModifierLine,
	ModifierOperator,
	OPERATORS,
	StateAccount,
	StateReader,
	StateShape,
	StateTarget,
} from '../types';
import { OPERATOR_LABELS, TEXT } from '../en';
import { FormulaError } from './expression';
import { isNoteOnly } from '../parse/modifier-cell';
import { suppressionWording } from './suppression-wording';
import { called, Enrolment } from './modifier-definitions';

/**
 * Why a change aimed at a level or a flag may not add to it, and what to choose
 * instead (D6): the fault from `src/en.ts`, the fix in the operators' own words,
 * so a renamed operator renames the advice. The one spelling the sheet's row
 * popup, the modifier form and the layout editor's report all show.
 */
export const STATE_REFUSES_ADD = `${TEXT.stateRefusesAdd} Choose ${OPERATOR_LABELS.override} or ${OPERATOR_LABELS.upgrade}.`;

/** The one key an address is held under: the name, and the column or none. */
export function stateKey(name: string, column: string | null): string {
	return `${name}\u0000${column ?? ''}`;
}

/** Every declared state on the sheet, by `stateKey`. */
export type StateShapes = ReadonlyMap<string, StateShape>;

/**
 * The declared levels and flags as the walk and every reader of an address
 * look them up: by `stateKey`, from `stateTargets`. One spelling, so the walk,
 * the editor's report and the form cannot key one state two ways.
 */
export function shapesOf(targets: readonly StateTarget[]): StateShapes {
	return new Map(targets.map((target) => [stateKey(target.name, target.column ?? null), target.shape]));
}

/**
 * The operators a change may take at a value, in the order an author is
 * offered them (D6): every one at a number, Sets and At least at a level or a
 * flag. A stored Adds to is kept in the list there, so the select can show
 * what the change says while the refusal says why it does nothing.
 */
export function operatorsAt(atState: boolean, stored: ModifierOperator): readonly ModifierOperator[] {
	return atState ? OPERATORS.filter((id) => id !== 'add' || stored === 'add') : OPERATORS;
}

/**
 * The operator a change keeps when it is moved onto a value: an Adds to moved
 * onto a level or a flag becomes a Sets, since nothing could make it valid
 * there; every other one is kept.
 */
export function operatorOnto(atState: boolean, operator: ModifierOperator): ModifierOperator {
	return atState && operator === 'add' ? 'override' : operator;
}

/** What a change aimed at one name, with or without a column, is aimed at. */
export type StateAddress =
	/** No state: the ordinary arithmetic at a published name. */
	| { kind: 'number' }
	/** A declared level or flag. */
	| { kind: 'state'; key: string; shape: StateShape }
	/**
	 * A column the target does not hold, or one naming the state the target
	 * already is (D5). Shown as written and never corrected: it changes nothing,
	 * and the row that wrote it says why.
	 */
	| { kind: 'stray'; reason: string };

/**
 * Where a change lands. `label` names the target for the stray sentences, in
 * the reader's own word for it.
 */
export function addressOf(
	shapes: StateShapes,
	target: string,
	column: string | null,
	label: (name: string) => string = (name) => name,
): StateAddress {
	const own = shapes.get(stateKey(target, null));
	if (column === null) {
		return own === undefined
			? { kind: 'number' }
			: { kind: 'state', key: stateKey(target, null), shape: own };
	}
	const shape = shapes.get(stateKey(target, column));
	if (shape !== undefined) return { kind: 'state', key: stateKey(target, column), shape };
	/*
	 * One meaning, one spelling: a value whose own value is the state is named
	 * by its target alone, so a column naming the column that value is read from
	 * is told to go rather than quietly accepted as a second way to say it.
	 */
	if (own?.column !== undefined && own.column === column) {
		return {
			kind: 'stray',
			reason: `${label(target)} already is "${column}", so this change needs no column. Clear it.`,
		};
	}
	return {
		kind: 'stray',
		reason: `${label(target)} has no level or flag called "${column}".`,
	};
}

/**
 * What one resolved part does at the address it names, in the one order every
 * reader takes it (D5, D6): the walk reduces by it, the row's popup words it,
 * and the layout editor's report reads its first two branches off the stored
 * change. **One copy, because three re-derivations of this order could only be
 * tested for still agreeing** (`PATTERNS.md` §1).
 *
 * - `number`: no level or flag; the arithmetic's business. A boolean amount
 *   there is `refused` with the shipped `is not a number` sentence instead.
 * - `stray`: a column the target does not hold, or one naming the state it
 *   already is. Changes nothing and refuses nothing; said at the row.
 * - `quiet`: a state the part says nothing to — a note alone, a condition that
 *   is false, an unfinished typed part.
 * - `refused`: an Adds to, an amount that would not resolve, or one off the
 *   list. Refuses the state, the first refusal naming the row.
 * - `set`: a position, ready to reduce.
 */
export type StateVerdict =
	| { kind: 'number' }
	| { kind: 'stray'; reason: string }
	| { kind: 'quiet'; key: string; shape: StateShape }
	| { kind: 'refused'; reason: string; key: string | null; shape: StateShape | null }
	| { kind: 'set'; key: string; shape: StateShape; position: number };

/** The verdict on one resolved part. `label` names the target for a stray. */
export function stateVerdict(
	shapes: StateShapes,
	found: Exclude<Enrolment, { kind: 'unknown' }>,
	label?: (name: string) => string,
): StateVerdict {
	const { fields } = found;
	const address = addressOf(shapes, fields.target, fields.column, label);
	if (address.kind === 'stray') return address;
	if (address.kind === 'number') {
		return found.kind === 'applies' && found.contribution.notNumber !== undefined
			? { kind: 'refused', reason: found.contribution.notNumber, key: null, shape: null }
			: { kind: 'number' };
	}
	const { key, shape } = address;
	if (found.kind === 'noted' || found.kind === 'inactive' || found.kind === 'unfinished') {
		return { kind: 'quiet', key, shape };
	}
	if (found.kind === 'unreadable' && isNoteOnly(fields)) return { kind: 'quiet', key, shape };
	// Adds to whatever its amount came to, since no amount makes it valid (D6).
	if (fields.operator === 'add') return { kind: 'refused', reason: STATE_REFUSES_ADD, key, shape };
	if (found.kind === 'unreadable') return { kind: 'refused', reason: found.reason, key, shape };
	const { contribution } = found;
	const position = statePosition(
		shape,
		contribution.operator,
		contribution.literal ?? contribution.amount,
		called(found),
	);
	return 'reason' in position
		? { kind: 'refused', reason: position.reason, key, shape }
		: { kind: 'set', key, shape, position: position.position };
}

/**
 * The verdict a stored change earns before anything is evaluated: the layout
 * editor's report, which has the change's words and no row. `stateVerdict`'s
 * own first branches, in its order, so the report and the sheet name one fault.
 */
export function storedStateFault(
	shapes: StateShapes,
	change: { target: string; column?: string; operator?: ModifierOperator; amount?: string; note?: string },
	label?: (name: string) => string,
): { kind: 'number' } | { kind: 'state'; fault: string | null } {
	const address = addressOf(shapes, change.target, change.column ?? null, label);
	if (address.kind === 'stray') return { kind: 'state', fault: address.reason };
	if (address.kind === 'number') return { kind: 'number' };
	const add = (change.operator ?? 'add') === 'add' && !isNoteOnly(change);
	return { kind: 'state', fault: add ? STATE_REFUSES_ADD : null };
}

/**
 * A flag as a state: two positions, off and on, called `off` and `on` unless
 * the caller names them — a checkbox Track naming its two levels. One spelling
 * of what a flag is, for every component that declares one.
 */
export function flagShape(label: string, words: readonly string[] = ['off', 'on']): StateShape {
	return { flag: true, positions: 2, words, label };
}

/**
 * Why a floor did not raise a level or a flag: the state already at or past
 * it, named — `already Proficient`, `already on`. A number's line keeps §5's
 * `already higher`, since a number has no word for where it is.
 */
export function alreadyAt(shape: StateShape, position: number): string {
	return `already ${positionWord(shape, position)}`;
}

/** What a position is called: its word where the positions are named. */
export function positionWord(shape: StateShape, position: number): string {
	return shape.words[position] ?? String(position);
}

/**
 * The amount a change aimed at a state comes to, as a position, or why it has
 * none (D2, D6). `called` is how the sentence names the modifier.
 *
 * **Adds to is refused outright**, because a position has no sum: "one grade
 * higher" is a different operator this feature does not define. A flag reads
 * the note's two spellings of a stored flag, `true`/`false` and `1`/`0`; a
 * level takes a whole number on its list and nothing else, a boolean included,
 * because the language gives yes and no no numeric meaning.
 */
export function statePosition(
	shape: StateShape,
	operator: ModifierOperator,
	amount: number | boolean,
	called: string,
): { position: number } | { reason: string } {
	if (operator === 'add') return { reason: STATE_REFUSES_ADD };
	if (shape.flag) {
		if (amount === true || amount === 1) return { position: 1 };
		if (amount === false || amount === 0) return { position: 0 };
		return {
			reason: `"${String(amount)}" is not true or false, so ${called} has no amount. Give it true or false.`,
		};
	}
	if (typeof amount === 'number' && Number.isInteger(amount) && amount >= 0 && amount < shape.positions) {
		return { position: amount };
	}
	const top = shape.positions - 1;
	// One sentence for the fix, in the list's own numbers and, where it names
	// them, its own words: a level is what an amount names it by.
	const range =
		shape.words.length > 0
			? `0 (${positionWord(shape, 0)}) to ${top} (${positionWord(shape, top)})`
			: `0 to ${top}`;
	return {
		reason: `"${String(amount)}" is not a level of ${shape.label}, so ${called} has no amount. Give it a level from ${range}.`,
	};
}

/**
 * The note's value as a position, read the way the row scope already reads it:
 * a blank level is 0 and a missing flag is off. A number on a flag is a count
 * of marks, ticked at one or more, which is how a flag Track reads one.
 */
export function storedPosition(shape: StateShape, stored: FieldValue | undefined): number {
	if (shape.flag) {
		if (typeof stored === 'boolean') return stored ? 1 : 0;
		return typeof stored === 'number' && stored >= 1 ? 1 : 0;
	}
	if (typeof stored !== 'number' || !Number.isFinite(stored)) return 0;
	return Math.max(0, Math.min(shape.positions - 1, Math.floor(stored)));
}

/** A position as the stored value's own kind: a flag's boolean, a level's number. */
export function positionValue(shape: StateShape, position: number): FieldValue {
	return shape.flag ? position >= 1 : position;
}

/** What the walk found at one address, before the note's own value is known. */
export type StateResult =
	| { shape: StateShape; lines: readonly ModifierLine[] }
	| { shape: StateShape; error: string };

/**
 * What the walk found at one address, or null where nothing is declared there.
 * A declared address nothing addresses answers with no lines.
 */
export type StateLookup = (name: string, column: string | null) => StateResult | null;

/** The lookup with no sheet around it: nothing is declared, so nothing folds. */
export const NO_STATES: StateLookup = () => null;

/**
 * Fold the lines found at one address onto what the note stores.
 *
 * Sets first: the highest wins and every other one is listed saying so. Then
 * the floor, on what that came to, and its winning line takes the verdict —
 * `already higher` where the position was already at or past it, which is the
 * one fact the walk could not know, since it needs the note.
 */
export function foldState(
	result: StateResult,
	stored: FieldValue | undefined,
): StateAccount {
	const { shape } = result;
	const own = storedPosition(shape, stored);
	if ('error' in result) {
		return { shape, stored: own, drawn: own, lines: [], error: result.error };
	}
	return foldLines(shape, result.lines, own);
}

/**
 * The same account against another stored position: what a ring draws once a
 * press has moved what the note holds and before the sheet has rebuilt. The
 * lines are the walk's, so only their verdicts move.
 */
export function refold(account: StateAccount, stored: number): StateAccount {
	if (account.error !== null) return { ...account, stored, drawn: stored };
	return foldLines(account.shape, account.lines, stored);
}

function foldLines(
	shape: StateShape,
	listed: readonly ModifierLine[],
	own: number,
): StateAccount {
	const result = { lines: listed };
	let sets: number | null = null;
	let floor: number | null = null;
	for (const line of result.lines) {
		if (line.operator === 'override') sets = sets === null ? line.amount : Math.max(sets, line.amount);
		else if (line.operator === 'upgrade') floor = floor === null ? line.amount : Math.max(floor, line.amount);
	}
	const base = sets ?? own;
	const drawn = floor !== null && floor > base ? floor : base;
	const taken = new Set<ModifierOperator>();
	const lines = result.lines.map((line): ModifierLine => {
		const winner = line.operator === 'override' ? sets : floor;
		if (line.amount !== winner || taken.has(line.operator)) {
			const kind = line.operator === 'override' ? 'override' : 'at least';
			return { ...line, suppressed: suppressionWording(kind, line.amount === winner, 'value') };
		}
		taken.add(line.operator);
		if (line.operator === 'upgrade' && floor !== null && floor <= base) {
			// The level the state already is, named: a position has a word where a
			// number has only "higher" (`alreadyAt`).
			return { ...line, suppressed: alreadyAt(shape, base) };
		}
		return { ...line, suppressed: null };
	});
	return { shape, stored: own, drawn, lines, error: null };
}

/**
 * The reader every component's row scope and the name table fold through.
 *
 * **Returns `stored` itself wherever nothing addresses the state**, which is
 * what keeps every sheet with no such push the sheet it was: the same value,
 * the same type, nothing re-spelled. A refusal throws, as a refused slot does,
 * so a formula reading the modified state draws `?` with the row named (D7).
 */
export function stateReaderOf(lookup: StateLookup): StateReader {
	return (name, column, stored) => {
		const result = lookup(name, column);
		if (result === null) return stored;
		if ('error' in result) throw new FormulaError(result.error);
		if (result.lines.length === 0) return stored;
		const account = foldState(result, stored);
		return positionValue(result.shape, account.drawn);
	};
}

/** The reader with no sheet around it: every state as stored. */
export const READ_AS_STORED: StateReader = (_name, _column, stored) => stored;
