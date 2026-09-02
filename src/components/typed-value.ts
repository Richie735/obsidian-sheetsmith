/*
 * What a typed value stored as text means, before any formula runs.
 *
 * Three rules a component reading typed fields has to hold, and they were three
 * verbatim copies in `table.ts` and `record-set.ts`:
 *
 * - **What a stored value is worth to a formula.** A blank in a field the layout
 *   declared numeric is **zero** and not a missing name; a toggle is a boolean; a
 *   level is its index, held inside the field's own range. Untrained skills are
 *   left blank on every character sheet ever printed, and a sheet that made you
 *   type 0 into eighteen rows before it would compute anything would be answering
 *   a question nobody asked.
 * - **What a typed number is held to.** A value outside the declared bounds is
 *   clamped; text that is not a number is left exactly as typed, because silently
 *   replacing what somebody wrote with a number they did not is worse than storing
 *   it.
 * - **What a computed value reads as.** `?` where it did not resolve, `+` where
 *   the field asked for a sign, `✓`/`—` for a boolean.
 *
 * **This is `docs/PATTERNS.md` §1's one-step tier and not its behaviour ladder.**
 * The ladder shares on the third consumer and allows duplication at two under a
 * test driving both copies; a *policy* climbs in one step, because the only thing
 * such a test could assert is that the copies still say the same thing — which is
 * what one name says for free. And here the drift is not hypothetical: the first
 * rule decides what `sum(spells, Level)` and `sum(inventory, Weight)` are adding
 * up, so two copies disagreeing means one component's blank cell counts as zero
 * and the other's does not, in arithmetic a reader cannot see.
 *
 * **A module named for the behaviour rather than an addition to
 * `column-types.ts`**, which is §1's own instruction. That file holds a
 * vocabulary — which types exist, which is the default, which can be totalled or
 * published — and §10 records it as tested through its consumers precisely
 * because "a file of its own could assert little past a constant equalling
 * itself". Behaviour there would make that sentence false.
 *
 * **And behaviour here earns a test file, which is §10's default rule rather than
 * one of its exceptions.** This is not a gesture, so there is no control it can
 * only be driven through; it is not a vocabulary, which is the paragraph above;
 * and it is not a note-format primitive, since nothing here is about bytes in a
 * file. `typed-value.test.ts` sits beside it. The claim this header used to make
 * instead — "its consumers drive every one of them" — was measurably false: two
 * of nine one-rule mutations survived the whole suite, the `min` clamp and the
 * two glyphs a boolean reads as. Both holes predated the extraction, which is the
 * point rather than the excuse: three rules two components happened to agree on
 * became one shared contract, and a shared contract is a thing to assert rather
 * than a thing to hope both callers still want.
 *
 * In `components/` beside `level-ring.ts` and `stored-flag.ts`, whose policies it
 * applies, and on the sibling allowlist in `eslint.config.mts` — which §2 says is
 * the decision rather than the inheritance. It is in no registry, declares no
 * `ComponentDefinition`, imports nothing from `obsidian` and touches no file.
 */

import { ColumnType, DEFAULT_COLUMN_TYPE } from './column-types';
import { LevelColumn, levelOf } from './level-ring';
import { isFlagSet } from './stored-flag';

/**
 * The parts of a column or a field these rules read.
 *
 * Structural rather than either caller's own interface, so `TableColumn` and
 * `RecordField` both satisfy it without this module naming a table or a record
 * (§1's rule from the pool's gesture engine).
 */
export interface TypedField extends LevelColumn {
	type?: ColumnType;
	min?: number;
}

/** What a field with no declared type is, which the vocabulary decides. */
export function typeOf(field: TypedField): ColumnType {
	return field.type ?? DEFAULT_COLUMN_TYPE;
}

/** What a stored value means to a formula. */
export function typedValue(
	field: TypedField,
	raw: string | undefined,
): string | number | boolean {
	const text = (raw ?? '').trim();
	switch (typeOf(field)) {
		case 'toggle':
			return isFlagSet(text);
		case 'level':
			return levelOf(field, text);
		case 'number': {
			if (text === '') return 0;
			const numeric = Number(text);
			return Number.isNaN(numeric) ? text : numeric;
		}
		default:
			return text;
	}
}

/** Hold a typed number to the field's bounds. Text that is not a number is left. */
export function boundedText(raw: string, field: TypedField): string {
	const text = raw.trim();
	if (text === '') return text;
	const value = Number(text);
	if (!Number.isFinite(value)) return text;
	let next = value;
	if (field.min !== undefined) next = Math.max(field.min, next);
	if (field.max !== undefined) next = Math.min(field.max, next);
	return next === value ? text : String(next);
}

/** Format a computed value: "?" when unresolved, signed when asked for. */
export function formatComputed(
	value: string | number | boolean | null,
	signed: boolean,
): string {
	if (value === null) return '?';
	if (typeof value === 'number' && signed && value >= 0) return `+${value}`;
	if (typeof value === 'boolean') return value ? '✓' : '—';
	return String(value);
}
