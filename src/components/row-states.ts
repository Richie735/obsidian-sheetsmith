/*
 * What a row's levels and flags are once a modifier may set them
 * (`docs/features/non-number-modifiers.md`): which columns are states, how a
 * change names each, and how a row's scope reads them through the sheet.
 *
 * One sentence, `PATTERNS` §1's test: it is the per-row half of a state, for a
 * component whose rows have columns. **Table and Roster are its two consumers**,
 * and it is extracted at two on §1's one-step tier, because what is shared is a
 * policy — which column a change names by `column` and which by its target
 * alone, what happens to a refusal, which sentence a cell shows first — and two
 * copies of it could only be tested for still agreeing. The two components keep
 * what differs: Table's row values, Roster's `stat`.
 *
 * Pure, and it knows no component: a column is the structural shape both
 * columns satisfy. In no registry, declaring no `ComponentDefinition`, importing
 * nothing from `obsidian` and touching no file.
 */

import { FieldValue, StateReader, StateShape } from '../types';
import { TypedField, typedState } from './typed-value';
import { referencesName } from '../formula/expression';

/** The parts of a column these rules read. */
export interface StateColumn extends TypedField {
	key: string;
	name?: string;
	publish?: boolean;
}

/** A column as a state a modifier may set, named by its heading where it has one. */
export function columnState(column: StateColumn): StateShape | undefined {
	return typedState(column, column.name ?? column.key);
}

/**
 * The column a change names to set this one, or null where the column is the
 * one the row publishes: that column's state is the row's own value, named by
 * the target alone, since one meaning gets one spelling (D3).
 */
export function stateColumn(column: StateColumn): string | null {
	return column.publish === true ? null : column.key;
}

/**
 * The levels and flags on a named row a change may set by `column` (D3): every
 * `level` and `toggle` column but the published one, as `ScopeEntry.states`.
 * Empty where there is none, so an entry is the object it always was.
 */
export function rowStateShapes(
	columns: readonly StateColumn[],
): { states?: Record<string, StateShape> } {
	const states: Record<string, StateShape> = {};
	for (const column of columns) {
		const shape = columnState(column);
		if (shape !== undefined && stateColumn(column) !== null) states[column.key] = shape;
	}
	return Object.keys(states).length === 0 ? {} : { states };
}

/**
 * Read a row's levels and flags through the sheet, over a scope already
 * holding what the note stores under each column's key.
 *
 * **A refusal is recorded and the name left out where `refusals` is given**, so
 * only an expression reading that column fails and an aggregate names the row;
 * **thrown where it is not**, which is how a published name carries the
 * sentence to the card reading it (D7).
 */
export function overlayRowStates(
	scope: Record<string, FieldValue>,
	columns: readonly StateColumn[],
	states: { name: string; read: StateReader } | undefined,
	refusals?: Map<string, string>,
): void {
	if (states === undefined) return;
	for (const column of columns) {
		if (columnState(column) === undefined || !Object.hasOwn(scope, column.key)) continue;
		try {
			const read = states.read(states.name, stateColumn(column), scope[column.key]);
			if (read !== undefined) scope[column.key] = read;
		} catch (error) {
			if (refusals === undefined) throw error;
			delete scope[column.key];
			refusals.set(column.key, error instanceof Error ? error.message : String(error));
		}
	}
}

/**
 * The sentence a computed cell shows for a value that did not resolve: a
 * refused level or flag's own sentence, which names the row and the fix, where
 * the cell's formula reads that column (D7) — and the formula's own reason
 * otherwise, since a cell failing for a reason of its own beside a refusal it
 * never reads must not be blamed on it.
 */
export function refusalFirst(
	refusals: ReadonlyMap<string, string>,
	formula: string | undefined,
	explained: () => string,
): string {
	for (const [key, sentence] of refusals) {
		if (formula !== undefined && referencesName(formula, key)) return sentence;
	}
	return explained();
}
