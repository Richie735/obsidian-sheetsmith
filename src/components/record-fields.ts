/*
 * A fenced record's typed fields, as data: what each declared field stores, what
 * it reads as, what its ceiling is, and what a write or a reset leaves in it.
 *
 * **Shared by Record set and Stat block** (`docs/features/character-forms.md`),
 * which store one record the same way — a `###` heading, a `sheet` fence of
 * typed entries, then prose — and must read and write it the same way. Moved
 * out of `record-set.ts` rather than copied, on `docs/PATTERNS.md` §1's
 * two-consumer rung: every function here is a rule about the note's bytes or
 * about a record's arithmetic, and two copies of "what `full` writes into a
 * record whose ceiling is a formula" could only be tested for still agreeing.
 *
 * In no registry, declaring no `ComponentDefinition`, importing nothing from
 * `obsidian` and touching no file — the sibling allowlist's terms
 * (`eslint.config.mts`). What it does not hold is anything either component
 * *draws*; that is `record-controls.ts`.
 */

import { splitBounded, withValue } from '../parse/bounded-entry';
import { readFenced, writeFenced } from '../parse/fenced';
import { bodyText, writeBodyText } from '../parse/markdown-body';
import {
	RecordBlock,
	renameRecord,
	splitRecordBody,
	withRecordBody,
	appendRecord,
	RecordSection,
} from '../parse/records';
import { expressionProblem } from '../formula/expression';
import { displayText } from '../parse/wikilink';
import { ColumnType, HOLDER_MAX_SOURCE, MaxSource, Placement } from './column-types';
import { boundedText, TypedField, typedValue, typeOf } from './typed-value';
import { flagText } from './stored-flag';
import {
	ExpressionExplainer,
	ExpressionResolver,
	FieldResolver,
	FieldValue,
	ResetBinding,
	ResetColumn,
	ResetContext,
	ResetReach,
	ResetResult,
	RowValues,
} from '../types';
import { heldCondition } from '../formula/field-condition';

/**
 * The configuration a list of records shares, whatever component holds it: the
 * fields every record declares and what one record is called.
 */
export interface RecordListConfig {
	recordName?: string;
	fields?: RecordField[];
}

/**
 * The records a component holds, by position in the note, with the edits a
 * write carries beside them. Record set's data shape, and Stat block's without
 * its preamble.
 */
export interface RecordList {
	records: Record<number, Partial<RecordEntry>>;
	/** Records to append, in order. */
	added?: readonly { name: string }[];
	/** Positions to remove, as read. */
	removed?: readonly number[];
}

/** One typed value every record holds, stored as an entry in its fence. */
export interface RecordField {
	/** Entry key in the note, and the name a formula reads the value by. */
	key: string;
	/** What the field is called on the sheet, when it should differ from the key. */
	name?: string;
	/**
	 * Defaults to text. Record set refuses text unless it is the group key;
	 * Stat block takes it as a one-line field.
	 */
	type?: ColumnType;
	/** For a computed field: the expression, evaluated in the record's scope. */
	formula?: string;
	/**
	 * Bounds for a number field, applied to typing and arrow steps alike; `max`
	 * is also what a `full` reset restores to and what the field draws its value
	 * against, which is what makes a number field with a maximum a uses counter
	 * rather than a bounded number. For a level field, `max` is its highest
	 * level and `min` is always 0, because "none" is a state every level needs.
	 */
	min?: number;
	max?: number;
	/**
	 * Where a number field's ceiling comes from: the field, one number every
	 * record is read against, or each record, a number or a formula the reader
	 * types on the sheet beside the value and the note keeps inside that
	 * record's own entry (`docs/features/record-ceiling-formula.md`).
	 *
	 * Absent means `'field'`, so every layout written before this reads exactly
	 * as it did. Under `'record'` the field's own `max` is not read at all — it
	 * survives untouched in the layout, so switching back restores the previous
	 * reading exactly, which is Pool's own rule for a note carrying a `max`
	 * entry: read in both modes, used in one.
	 *
	 * A string union rather than a boolean, so a third source could be added
	 * rather than replacing a flag. A *field-level* formula `max` was the
	 * obvious third and was refused: one formula speaks for every record, and a
	 * features list needs `prof`, a typed number, `abilities.CHA` and no ceiling
	 * side by side — so a formula is something a record's own ceiling may hold
	 * instead. Ignored on every other field type, on `secondary`'s
	 * rule: it promises nothing the component would have to deliver, and a
	 * hand-edited layout may carry it.
	 *
	 * The union is `column-types.ts`'s rather than this file's, for that file's
	 * own reason: the editor spells the same two ids and imports nothing from a
	 * component, so two copies would drift in silence.
	 */
	maxSource?: MaxSource;
	/**
	 * Where the field is drawn: on the record's summary line, or inside the
	 * opened record, in a block above its prose, for a value read once and
	 * changed rarely. Absent means the summary line, so every layout written
	 * before this reads as it did.
	 *
	 * **Display only.** The fence, the formulas, the resets and the modifiers do
	 * not know it exists: a body field is the same control drawn by the same
	 * `drawField`, only attached to the body, and a closed record simply does not
	 * show it. Any value but `BODY_PLACEMENT` reads as the summary line with no
	 * configuration error, on `maxSource`'s precedent, and is carried untouched.
	 */
	placement?: Placement;
	/**
	 * A boolean formula in the record's own scope, and where it is false on a
	 * record the field is not drawn on that record
	 * (`docs/features/conditional-field-visibility.md`). Absent or blank means
	 * always shown; a hand-written `true` or `false` is its own answer.
	 *
	 * **Not `ConfigFieldSpec.visibleWhen`, and the shared word is all they
	 * share.** That one is the plugin's own declaration over a closed set of
	 * config keys, checked by `editor/config-fields.ts`'s `conditionMet`, and it
	 * fails *closed*: a typo in the plugin's own declaration hides a control,
	 * which is the safer way to be wrong. This one is an author's formula over
	 * character data, evaluated by the formula engine, and it fails *open*: a
	 * condition that cannot be worked out shows the field and says why, because
	 * a hidden value still counting is the worse way to be wrong. Different
	 * grammar, different evaluator, opposite failure — so do not unify them.
	 *
	 * **Display only, like `placement`.** A hidden field keeps its value in the
	 * note and goes on counting in every aggregate, modifier and reset: no value
	 * reads visibility, so the dependency graph cannot close through it. A
	 * condition naming its own key is refused and the field shown, since a field
	 * that can hide itself vanishes under the cursor.
	 */
	visibleWhen?: string | boolean;
	/**
	 * Names for a level field's states, from none upwards. Naming them settles
	 * how many there are. A name may say what its ring shows after a colon; see
	 * level-ring.ts, which owns that rule.
	 */
	levels?: string[];
	/** How a level field is edited. Defaults to cycling on press. */
	input?: 'cycle' | 'select';
	/** Prefix a non-negative computed number with "+". Defaults to false. */
	signed?: boolean;
	/**
	 * Ignored: a record's fields are already secondary to its name and its body,
	 * so a second quiet rank inside one summary line would be a difference nobody
	 * could read. Still declared, because a layout hand-edited from a Table's
	 * columns may carry it and the key must survive the round trip.
	 */
	secondary?: boolean;
	/**
	 * Ignored, and **not** honoured now that a strip exists: the strip is the
	 * component's and not the field's, and a hole in it over a ring would leave
	 * exactly the unnamed ring the strip is there to name. Declared for
	 * `secondary`'s reason — a hand-edited layout may carry a Table's, and the
	 * key must survive the round trip.
	 */
	hideHeading?: boolean;
	/**
	 * Refused: a list of records draws no totals row for a total to sit in, so
	 * `sum(<id>, <key>)` from elsewhere on the sheet is the arithmetic instead.
	 */
	total?: boolean;
	/**
	 * Refused: every record is the character's, and a name a formula reads has to
	 * be knowable when the formula is written — so there is nothing for a
	 * per-record name to be. `count()` and `sum()` over the list are what read it.
	 */
	publish?: boolean;
}

/** One record, as the note holds it. */
export interface RecordEntry {
	/** The record's name, exactly as its heading spells it. */
	name: string;
	/** Stored field values by the key the fence spells. */
	fields: Record<string, string>;
	/** The prose after the fence, with the record's own framing removed. */
	body: string;
	/**
	 * Why this record's fence would not read, or null where it read.
	 *
	 * A member rather than a failed `read`, because the unit of failure here is
	 * the record: a section holding forty spells must not be blanked by one
	 * hand-typed colon (SPEC §10, read one level in).
	 */
	error: string | null;
}

/** Shared with Table through `typed-value.ts`, so the default cannot drift. */
export const fieldType = typeOf;

/** Fields whose values live in the fence. Computed ones are never stored. */
export function storedFields(fields: readonly RecordField[] | undefined): RecordField[] {
	return (fields ?? []).filter(
		(field) => fieldType(field) !== 'computed',
	);
}

/** What a record's field is called on the sheet. */
export function fieldLabel(field: RecordField): string {
	return (field.name ?? '').trim() || field.key;
}

/** Whether this field's ceiling belongs to each record rather than to the field. */
export function recordsOwnMax(field: RecordField): boolean {
	return (
		fieldType(field) === 'number' && field.maxSource === HOLDER_MAX_SOURCE
	);
}

/**
 * The half of a stored entry that is the *value*.
 *
 * **Applied to every `number` field's entry whatever the mode, and that is the
 * decision rather than an over-reach.** Gating the split on `maxSource` would
 * mean that switching a field back to the field's own ceiling turned every
 * composite already in the note into text — and `typedValue` hands text back as
 * text, so `sum(features, Uses)` would start reading `'2 / 3'` as a name that is
 * not a number and take a card down with a `?`. The value half is what the
 * input, the clamp, `typedValue` and `scopeRows` see in both modes; only the
 * *ceiling* half changes meaning with the mode.
 */
export function storedValue(field: RecordField, raw: string | undefined): string {
	return fieldType(field) === 'number'
		? splitBounded(raw ?? '').value
		: (raw ?? '');
}

/**
 * What a typed ceiling's text is worth as a number, or null where it is not a
 * number at all.
 *
 * **The rule every ceiling read before a ceiling could be a formula**, kept as
 * the first step of `ceilingOf` so a typed number never reaches the evaluator:
 * `03`, `1.5`, `+3` and `1e3` read exactly what they always read, whatever the
 * expression grammar thinks of them. A field-owned `max` is read by this alone,
 * since a literal the layout declared is never evaluated.
 */
export function typedCeiling(text: string): number | null {
	const trimmed = text.trim();
	if (trimmed === '') return null;
	const value = Number(trimmed);
	return Number.isFinite(value) ? value : null;
}

/**
 * What a record's ceiling comes to: a number, `null` where nothing is there,
 * or why it cannot be worked out (`docs/features/record-ceiling-formula.md`).
 */
export type Ceiling = number | null | { error: string };

/** The evaluator a ceiling is worked out with, as a host hands it over. */
export interface CeilingReaders {
	resolveExpression?: ExpressionResolver;
	explainExpression?: ExpressionExplainer;
}

/** A sentence as the record's line ends it, whoever wrote it. */
export function asSentence(text: string): string {
	const trimmed = text.trim();
	return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * What a record-owned ceiling's text comes to, in that record's stored scope.
 *
 * **One function, and every channel takes its answer** — the drawn number, the
 * value's clamp, the announcement's "of 3" and every reset — which is the lesson
 * of the defect this function's predecessor recorded: the announcement once took
 * the raw text where the clamp parsed it, and said "of lots" about a ceiling the
 * clamp and the reset both read as none. Two channels disagreeing about whether a
 * record has a ceiling is the failure, so there is one spelling.
 *
 * In order: blank is nothing; a typed number is that number, by `typedCeiling`;
 * text the parser refuses is its sentence; and anything else is evaluated. **Text
 * that is not a number is no longer "no ceiling"**, and that is the decision: a
 * mistyped `prfo` read as uncapped would be the silent default §5 forbids, and
 * `lots` and `prfo` cannot be told apart — both are perfectly good names to a
 * parser. So both say so, on the record that holds them.
 *
 * **An evaluated ceiling is held to the field's floor**, as a typed one is at its
 * commit, because a ceiling under the floor describes a range no value can
 * occupy; a typed one is not held here, so it reads exactly as before.
 *
 * **No evaluator is loud, not silent.** A host with no sheet draws every
 * expression ceiling as unresolved with its line, never as a number and never as
 * no ceiling.
 */
export function ceilingOf(
	text: string,
	field: RecordField,
	scope: Readonly<Record<string, FieldValue>>,
	readers: CeilingReaders,
): Ceiling {
	const trimmed = text.trim();
	if (trimmed === '') return null;
	const typed = typedCeiling(trimmed);
	if (typed !== null) return typed;
	const problem = expressionProblem(trimmed);
	if (problem !== null) return { error: asSentence(problem) };
	if (readers.resolveExpression === undefined) {
		return { error: `there is no sheet here to work "${trimmed}" out against.` };
	}
	const value = readers.resolveExpression(trimmed, scope);
	if (value === null) {
		return {
			error: asSentence(
				readers.explainExpression?.(trimmed, scope) ?? 'it did not resolve.',
			),
		};
	}
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return { error: `it came to "${String(value)}", which is not a number.` };
	}
	return field.min === undefined ? value : Math.max(field.min, value);
}

/** A ceiling's number where it has one, and null where it has none or cannot be read. */
export function ceilingNumber(ceiling: Ceiling): number | null {
	return typeof ceiling === 'number' ? ceiling : null;
}

/** Why a ceiling cannot be worked out, or null where it can or is absent. */
export function ceilingProblem(ceiling: Ceiling): string | null {
	return ceiling !== null && typeof ceiling === 'object' ? ceiling.error : null;
}

/**
 * The ceiling this record holds for this field, or null where it holds none —
 * and always null where the ceiling is the field's, whose half of an entry is
 * carried and never evaluated.
 */
export function recordCeiling(
	field: RecordField,
	raw: string | undefined,
	scope: Readonly<Record<string, FieldValue>>,
	readers: CeilingReaders,
): Ceiling {
	if (!recordsOwnMax(field)) return null;
	return ceilingOf(splitBounded(raw ?? '').ceiling ?? '', field, scope, readers);
}

/**
 * The bounds a number field's value is held to on this record: the field's own
 * floor, and whichever ceiling applies. A ceiling that cannot be worked out
 * holds nothing, so a value committed under one is not clamped.
 *
 * The floor is the layout's in both modes, which is why it is not conditional.
 * `typed-value.ts` goes on being handed one number — the splitting happens on
 * the record component's side of the call, which is what keeps this feature out of
 * Table by construction.
 */
export function fieldBounds(field: RecordField, ceiling: Ceiling): TypedField {
	if (!recordsOwnMax(field)) return field;
	const max = ceilingNumber(ceiling);
	return max === null
		? { type: 'number', min: field.min }
		: { type: 'number', min: field.min, max };
}

/**
 * Whether an action passes over this field on this record because its own
 * ceiling cannot be worked out (`docs/features/record-ceiling-formula.md`).
 *
 * `full` restores to the ceiling and `formula` holds its amount to it, so
 * neither has anything to write against; `empty` needs no ceiling, so a list
 * whose ceilings are broken can still be spent. **Per record and field**, as the
 * no-ceiling skip is: a toggle on the record still resets, and so does a second
 * number field whose ceiling reads.
 */
export function skipsUnreadCeiling(
	field: RecordField,
	action: NonNullable<ResetBinding['action']>,
	ceiling: Ceiling,
): boolean {
	return (
		action !== 'empty' &&
		recordsOwnMax(field) &&
		ceilingProblem(ceiling) !== null
	);
}

/**
 * What a reset says about the records it reached and passed over, in this
 * component's own words: `1 feature skipped, its maximum could not be worked out`.
 * "Maximum" rather than "ceiling", because the field's own name says maximum.
 */
export function skippedSentence(count: number, noun: string): string {
	return count === 1
		? `${countOf(count, noun)} skipped, its maximum could not be worked out`
		: `${countOf(count, noun)} skipped, their maximums could not be worked out`;
}

/**
 * What a record is called, wherever something has to name one.
 *
 * As a reader sees it, never as the file spells it: a heading may hold a
 * wikilink, and a delete control announcing "[[Sunblade|sword]]" names nothing a
 * listener could recognise. A blank name never reaches the note — the name field
 * refuses one, because a `### ` with nothing after it is not a heading and the
 * record would vanish on the next read — so this only meets one in a draft.
 */
export function recordLabel(name: string, noun: string): string {
	const shown = displayText(name).trim();
	return shown === '' ? `Unnamed ${noun.toLowerCase()}` : shown;
}

/** Every record the list draws, in file order. */
export function recordViews(data: RecordList | null): RecordEntry[] {
	const held = data?.records ?? {};
	const positions = Object.keys(held).map(Number);
	const count = positions.length === 0 ? 0 : Math.max(...positions) + 1;
	const out: RecordEntry[] = [];
	for (let at = 0; at < count; at++) {
		const entry = held[at];
		out.push({
			name: entry?.name ?? '',
			fields: entry?.fields ?? {},
			body: entry?.body ?? '',
			error: entry?.error ?? null,
		});
	}
	return out;
}

/**
 * One record's stored names: every stored field by its key, never a computed
 * one — what a computed field, a condition and a reset's `where` all read.
 *
 * **One spelling for three readers**, because what is shared is the scope a
 * formula on a record sees, and two of those disagreeing is a condition that
 * admits a record on the sheet and not at the press. The value half, never the
 * whole entry: a record's `Uses` name is worth `2` when the entry says `2 / 3`,
 * which is what `sum(features, Uses)` added up before the ceiling was the
 * record's and what it must go on adding up.
 */
export function storedLayer(
	fields: readonly RecordField[] | undefined,
	record: RecordEntry,
): Record<string, FieldValue> {
	const stored: Record<string, FieldValue> = {};
	for (const field of storedFields(fields)) {
		// A text field is a group key and nothing a formula can read: the language
		// has no strings, and a name that resolved to one would be the accident a
		// modifier field's raw text already is.
		if (fieldType(field) === 'text') continue;
		stored[field.key] = typedValue(
			field,
			storedValue(field, record.fields[field.key]),
		);
	}
	return stored;
}

/**
 * One record's names as a formula reads them: every stored field by its key,
 * then the computed fields over the top.
 *
 * **Every computed field resolves against the stored layer, never against
 * another computed field**, which is Table's own rule for the same reason: the
 * value on screen and the value an aggregate reads must not disagree about what
 * a record says.
 */
export function recordValues(
	fields: readonly RecordField[] | undefined,
	/** What one record is called, for a record with no name. */
	noun: string,
	record: RecordEntry,
	resolve: FieldResolver,
): RowValues {
	const stored = storedLayer(fields, record);
	const values: Record<string, FieldValue> = { ...stored };
	(fields ?? []).forEach((field, at) => {
		if (fieldType(field) !== 'computed') return;
		const value = resolve(`fields.${at}.formula`, stored);
		// A field that would not resolve is absent rather than zero, so an
		// expression reading it fails and the aggregate says which record.
		if (value !== null) values[field.key] = value;
	});
	return { label: recordLabel(record.name, noun), values };
}

/**
 * What one field of one record is written as under an action, or null where
 * nothing is written (`docs/features/record-set-reset-field-targeting.md`,
 * Part 3).
 *
 * **One writer for the binding naming a field and the binding naming none**, on
 * `docs/PATTERNS.md` §1's one-step tier: what `empty`, `full` and `formula` mean
 * for a counter and a flag is a policy, and two copies of it could only drift —
 * a flag set on at one amount under **Every field** and at another under
 * **Acts on**. `amount` is `formula`'s, worked out by the caller in whichever
 * scope its binding reads: once for the sheet, or once per record.
 *
 * - A `number` is written through the join, so the ceiling survives every
 *   action: an emptied counter is `Uses: 0 / 3` and never `Uses: 0`, since a
 *   reset that deleted the reader's own ceiling would be Constraint 4 broken by
 *   the one control whose job is to restore. The number is held to whichever
 *   ceiling applies, so a `formula` writing 3 into a record whose ceiling is 2
 *   writes 2. Under `full`, a record with no ceiling of its own is null —
 *   skipped, and never written as a zero, which `resetWrite` argues.
 * - A `toggle`'s flag is **derived from the amount rather than set true** under
 *   `formula`, which is `track.ts`'s rule for a flag card: set unconditionally,
 *   `to: '0'` wrote zero into every counter *and turned every toggle on*.
 *   Derived, `formula` generalises the other two rather than being a third
 *   rule: `to: '0'` is `empty` and `to: '3'` is `full` on a field with that
 *   ceiling.
 * - Anything else — a `level` above all — is left alone by every action.
 */
export function fieldWrite(
	field: RecordField,
	action: NonNullable<ResetBinding['action']>,
	amount: number | undefined,
	raw: string,
	/** This record's own ceiling for the field, worked out by the caller in its scope. */
	ceiling: Ceiling,
): string | null {
	const type = fieldType(field);
	if (type === 'toggle') {
		return flagText(action === 'formula' ? (amount ?? 0) >= 1 : action === 'full');
	}
	if (type !== 'number') return null;
	if (skipsUnreadCeiling(field, action, ceiling)) return null;
	const value =
		action === 'empty'
			? 0
			: action === 'formula'
				? (amount ?? null)
				: recordsOwnMax(field)
					? ceilingNumber(ceiling)
					: (field.max ?? null);
	if (value === null) return null;
	return withValue(raw, boundedText(String(value), fieldBounds(field, ceiling)));
}

/**
 * Every field a reset writes on one record, and whether a ceiling that would
 * not work out made it pass one over.
 *
 * **One loop for the binding naming a field and the binding naming none**, so
 * the two cannot disagree about which ceiling a record is held to or which
 * record counts as skipped. Each ceiling is worked out in that record's stored
 * scope, where `visibleWhen`, `where` and a per-record `to` are worked out.
 */
export function recordWrites(
	/** Every field the layout declares, for the record's stored scope. */
	declared: readonly RecordField[] | undefined,
	record: RecordEntry,
	fields: readonly RecordField[],
	action: NonNullable<ResetBinding['action']>,
	amount: number | undefined,
	context: ResetContext,
): { fields: Record<string, string>; skipped: boolean } {
	const scope = storedLayer(declared, record);
	const readers = { resolveExpression: context.resolveExpression };
	const written: Record<string, string> = {};
	let skipped = false;
	for (const field of fields) {
		const raw = record.fields[field.key] ?? '';
		const ceiling = recordCeiling(field, raw, scope, readers);
		if (skipsUnreadCeiling(field, action, ceiling)) skipped = true;
		const next = fieldWrite(field, action, amount, raw, ceiling);
		if (next !== null) written[field.key] = next;
	}
	return { fields: written, skipped };
}

/**
 * `1 feature` or `2 features`: a count of records in the author's own word, for
 * every surface that counts them — the problem lines above, a reset's skipped
 * sentence and a group header's count.
 */
export function countOf(count: number, noun: string): string {
	return `${count} ${noun.toLowerCase()}${count === 1 ? '' : 's'}`;
}

/** Whether a field stores a value a reset trigger can restore. */
export function restorable(field: RecordField): boolean {
	const type = fieldType(field);
	return type === 'number' || type === 'toggle';
}

/**
 * Why `full` cannot restore a field whose ceiling is the field's and missing.
 * One sentence for the binding naming the field and the binding naming none,
 * which both reach it.
 */
export function noMaximum(field: RecordField): string {
	return `the field "${fieldLabel(field)}" has no maximum to restore to. Give it one, or set this trigger to empty.`;
}

/** One record's stored pieces, with the delta applied and nothing else touched. */
export function applyDelta(
	block: RecordBlock,
	delta: Partial<RecordEntry>,
	known: ReadonlyMap<string, string>,
): RecordBlock {
	// A blank name is refused at the control rather than here, because a `### `
	// with nothing after it is not a heading: the record would vanish on the next
	// read and its body would be swallowed by the record above it (Constraint 4).
	const named =
		delta.name !== undefined && delta.name.trim() !== ''
			? renameRecord(block, delta.name)
			: block;

	let head = named.head;
	if (delta.fields !== undefined) {
		const updates = new Map<string, string | null>();
		for (const [key, value] of Object.entries(delta.fields)) {
			// Mapped back to the layout's own spelling, so the entry the note
			// already holds is the one that is rewritten. A key the layout no
			// longer declares is never reached at all (SPEC §10).
			const spelled = known.get(key.toLowerCase());
			if (spelled !== undefined) updates.set(spelled, value);
		}
		// Written into the head alone, so a fresh fence lands between the heading
		// and the prose rather than after it.
		if (updates.size > 0) head = writeFenced(head, updates);
	}

	let rest = named.rest;
	if (delta.body !== undefined && delta.body !== bodyText(rest)) {
		rest = writeBodyText(rest, delta.body);
	}

	if (head === named.head && rest === named.rest) return named;
	// A fence written into a record that had none arrives as one string; the
	// split puts it back into the two pieces the join expects.
	const framed = splitRecordBody(head);
	return withRecordBody(named, framed.head, framed.rest + rest);
}

/**
 * Every record a section holds, read: its name, its fields, its prose, and the
 * reason its fence will not read, where it will not.
 *
 * **Failure is per record**, which is Record set's one departure from Table and
 * Stat block's too: a list of forty must not be blanked by one hand-typed colon,
 * so a record whose fence will not read keeps its name and body and says so, and
 * every other record goes on working.
 */
export function recordEntries(
	blocks: readonly RecordBlock[],
	/** What one record is called, for the sentence a broken one ends with. */
	noun: string,
): Record<number, RecordEntry> {
	const records: Record<number, RecordEntry> = {};
	blocks.forEach((block, at) => {
		// The whole block rather than its fence alone, so a second fence and an
		// unclosed one are both reported rather than silently drawn as prose.
		const parsed = readFenced(block.head + block.rest);
		const fields: Record<string, string> = Object.create(null) as Record<
			string,
			string
		>;
		if (parsed.ok && parsed.values !== null) {
			for (const [key, value] of parsed.values) fields[key] = value;
		}
		records[at] = {
			name: block.name,
			fields,
			body: bodyText(block.rest),
			// `readFenced` already says what to fix, and where; what only this
			// list knows is that the damage stops at this one record.
			error: parsed.ok
				? null
				: `${parsed.error} Every other ${noun.toLowerCase()} on this list still works.`,
		};
	});
	return records;
}

/**
 * A section's records with an edit applied: each delta onto its record, then
 * the removals, then the appends, and nothing else touched.
 *
 * **A record the component cannot read is one it must not write.** Which lines
 * are the fence and which are the prose comes out of the read, so a block whose
 * fence is unreadable would take a write aimed at a line nobody meant.
 * Recomputed here rather than trusted from the render the edit came from,
 * because this side is the file boundary.
 */
export function editRecords(
	section: RecordSection,
	data: RecordList,
	fields: readonly RecordField[] | undefined,
): RecordSection {
	const records = [...section.records];
	const known = new Map(
		storedFields(fields).map((field) => [field.key.toLowerCase(), field.key]),
	);
	for (const [position, delta] of Object.entries(data.records ?? {})) {
		const at = Number(position);
		const block = records[at];
		if (block === undefined) continue;
		if (!readFenced(block.head + block.rest).ok) continue;
		records[at] = applyDelta(block, delta, known);
	}
	// Highest first, so an earlier removal cannot shift a later one's position.
	const removed = [...new Set(data.removed ?? [])]
		.filter((at) => records[at] !== undefined)
		.sort((left, right) => right - left);
	for (const at of removed) records.splice(at, 1);

	let next: RecordSection = { preamble: section.preamble, records };
	for (const record of data.added ?? []) {
		next = appendRecord(next, record.name);
	}
	return next;
}

/** What one record is called where the layout has not said. */
export const DEFAULT_RECORD_NAME = 'Record';

/** What one record is called, in the author's own word. */
export function recordNoun(config: RecordListConfig): string {
	return (config.recordName ?? '').trim() || DEFAULT_RECORD_NAME;
}

/**
 * How many records something happened on, in the words a list's problem lines
 * use: `every feature` where it was all of the readable ones, else `1 feature`
 * or `2 features`.
 *
 * One spelling for the `visibleWhen` problem line and a reset's refusal, which
 * both count failed records against the readable ones (`docs/PATTERNS.md` §1's
 * one-step tier: two copies of a count's wording can only drift).
 */
export function recordCount(count: number, readable: number, noun: string): string {
	if (count >= readable) return `every ${noun.toLowerCase()}`;
	return countOf(count, noun);
}

/**
 * Which records a binding's `where` admits, or why that could not be told
 * (`docs/features/record-set-reset-scope.md`).
 *
 * **Null where the binding holds no condition**: every readable record, and no
 * reach, so the confirmation stays the bare label rather than gaining "7 of 7".
 *
 * **Evaluated once per record in that record's own scope**, which is the grammar
 * `visibleWhen` fixed — the stored layer, then the sheet, never a computed field
 * — and the answer has to be true or false. **It fails closed, and whole**: one
 * record whose condition cannot be worked out, whether the name is unknown, the
 * text will not parse or it came to a number, and the binding writes nothing on
 * this list. That is the opposite of `visibleWhen`'s fail-open on purpose: on a
 * sheet the worse way to be wrong is a hidden value, and at a rest it is writing
 * records the author excluded, while writing nothing and saying so is the
 * direction a reader can recover from. A partial rest would leave them
 * reconciling record by record; the sentence names the first record instead, so
 * the fix is one field away.
 *
 * **An unreadable record is never evaluated**: it is left byte-identical, as
 * every reset leaves it, and counts in `of` because the reader sees it.
 */
export function admittedRecords(
	config: RecordListConfig,
	records: readonly RecordEntry[],
	reset: ResetBinding,
	context: ResetContext,
): { error: string } | { admitted: ReadonlySet<number>; reach: ResetReach } | null {
	const condition = heldCondition(reset.where);
	if (typeof condition !== 'string') return null;
	const noun = recordNoun(config).toLowerCase();
	const admitted = new Set<number>();
	let readable = 0;
	let failed = 0;
	let first: { name: string; why: string } | null = null;
	for (const [at, record] of records.entries()) {
		if (record.error !== null) continue;
		readable += 1;
		const scope = storedLayer(config.fields, record);
		const value = context.resolve('reset.where', scope);
		if (typeof value === 'boolean') {
			if (value) admitted.add(at);
			continue;
		}
		failed += 1;
		first ??= {
			name: recordLabel(record.name, noun),
			why:
				value === null
					? (context.explain('reset.where', scope) ??
						'the condition did not resolve.')
					: `it came to "${String(value)}", which is not true or false.`,
		};
	}
	if (first !== null) {
		const on = failedOn(failed, readable, first.name, noun);
		return {
			error: `its condition under Only where could not be worked out on ${on}, so it resets none: ${first.why} Fix it under Only where in the layout editor.`,
		};
	}
	return { admitted, reach: { reached: admitted.size, of: records.length } };
}

/**
 * Which records a whole-binding failure happened on, for the sentence that says
 * so: `every feature`, `"Rage"`, or `2 features, starting with "Rage"`.
 *
 * The count is `recordCount`, which the list's own `visibleWhen` problem line
 * reads too; what this adds is the first record's name wherever not every record
 * failed, because a reset refuses the whole list and the reader has to know
 * which record to go and fix, where a shown field is already on screen.
 *
 * **One spelling for a condition that will not work out and an amount that will
 * not** (`docs/features/record-set-reset-field-targeting.md`, Part 4), on §1's
 * one-step tier: two copies of a count's wording could only drift.
 */
export function failedOn(
	failed: number,
	readable: number,
	first: string,
	noun: string,
): string {
	if (failed >= readable) return recordCount(failed, readable, noun);
	return failed === 1
		? `"${first}"`
		: `${recordCount(failed, readable, noun)}, starting with "${first}"`;
}

/**
 * Which fields a reset binding may name, and why one refuses an action
 * (`docs/features/record-set-reset-field-targeting.md`, Part 1).
 *
 * **One list, two readers**, Table's own arrangement: the layout editor draws
 * its **Acts on** picker from this and `applyReset` looks a binding up in it, so
 * the two cannot disagree about which fields are eligible or about why one
 * refuses an action.
 *
 * `number` and `toggle` only. A `computed` field stores nothing and a `modifier`
 * field holds words; a `level` is left out on the ground the Table entry
 * recorded — a rest restoring a graded level has no reading in any system anyone
 * can name — and every action already leaves one alone.
 *
 * **Only a field-owned ceiling refuses `full`.** A field whose ceiling is each
 * record's refuses nothing: a record with none is skipped at the press rather
 * than failed, which `resetWrite` argues and which the editor cannot see.
 */
export function resetColumnsOf(config: RecordListConfig): ResetColumn[] {
	return (
		(config.fields ?? [])
			// A field with no key is one `configError` refuses, but the editor
			// does not run `read`, and an option valued `''` would persist
			// `column: ""`, which `parseBinding` refuses outright.
			.filter((field) => (field.key ?? '').trim() !== '')
			.filter(restorable)
			.map((field) => {
				const uncapped =
					fieldType(field) === 'number' &&
					!recordsOwnMax(field) &&
					field.max === undefined;
				return {
					key: field.key,
					...(field.name !== undefined && field.name.trim() !== ''
						? { label: field.name }
						: {}),
					...(uncapped ? { refuses: { full: noMaximum(field) } } : {}),
				};
			})
	);
}

/**
 * A binding that names a field: that field, and only that field, of each record
 * the binding reaches (`docs/features/record-set-reset-field-targeting.md`,
 * Parts 3 and 4).
 *
 * **Every other field is left out of the delta**, so a reached record's `Save DC`
 * keeps its bytes when its `Uses` is refilled — the whole of what naming the field
 * is for. The per-field rules are `resetWrite`'s, restricted to one field, and
 * every write still goes through the join so a reader-set ceiling survives.
 *
 * **`full` fails only on the named field**: its refusal is the one `resetColumns`
 * declares, so a DC with no maximum no longer blocks refilling `Uses`.
 *
 * **`to` is worked out on each reached record, in that record's own scope** —
 * the stored layer, then the sheet, never a computed field — which is the grammar
 * `where` already uses, and only after `where` has been worked out on every
 * readable record, so a broken condition is the one reported. It fails closed and
 * whole, as `where` does: one record whose amount cannot be worked out and the
 * binding writes nothing on this list, with the sentence naming the first.
 */
export function fieldReset(
	config: RecordListConfig,
	records: readonly RecordEntry[],
	reset: ResetBinding & { action: NonNullable<ResetBinding['action']> },
	context: ResetContext,
): ResetResult<RecordList> {
	const named = resetColumnsOf(config).find(
		(entry) => entry.key === reset.column,
	);
	const field = (config.fields ?? []).find(
		(entry) => entry.key === named?.key,
	);
	if (named === undefined || field === undefined) {
		// Two mistakes with two fixes, told apart as Table tells them apart: a
		// field that is gone wants the trigger pointed elsewhere, and one that
		// stores no restorable value wants a different field.
		const declared = (config.fields ?? []).some(
			(entry) => entry.key === reset.column,
		);
		return {
			ok: false,
			error: declared
				? `the field "${reset.column ?? ''}" holds no value a trigger can restore. Point this trigger at a number or toggle field instead.`
				: `this list has no field called "${reset.column ?? ''}". Point the trigger at one it has, or remove the binding.`,
		};
	}
	const refusal = named.refuses?.[reset.action];
	if (refusal !== undefined) return { ok: false, error: refusal };

	const scope = admittedRecords(config, records, reset, context);
	if (scope !== null && 'error' in scope) return { ok: false, error: scope.error };
	const reached = [...records.entries()].filter(
		([at, record]) =>
			record.error === null && (scope === null || scope.admitted.has(at)),
	);

	const amounts = new Map<number, number>();
	if (reset.action === 'formula') {
		const noun = recordNoun(config).toLowerCase();
		const readable = records.filter((record) => record.error === null).length;
		let failed = 0;
		let first: { name: string; why: string } | null = null;
		for (const [at, record] of reached) {
			const layer = storedLayer(config.fields, record);
			const value = context.resolve('reset.to', layer);
			const number = value === null ? NaN : Number(value);
			if (Number.isFinite(number)) {
				amounts.set(at, number);
				continue;
			}
			failed += 1;
			first ??= {
				name: recordLabel(record.name, noun),
				why:
					value === null
						? (context.explain('reset.to', layer) ??
							'its reset formula is empty.')
						: `it came to "${String(value)}", which is not a number.`,
			};
		}
		if (first !== null) {
			const on = failedOn(failed, readable, first.name, noun);
			return {
				ok: false,
				error: `its reset formula could not be worked out on ${on}, so it resets none: ${first.why} Fix it under Resets to in the layout editor.`,
			};
		}
	}

	const next: RecordList = { records: {} };
	let skipped = 0;
	for (const [at, record] of reached) {
		const written = recordWrites(config.fields,
			record,
			[field],
			reset.action,
			amounts.get(at),
			context,
		);
		if (written.skipped) skipped += 1;
		if (Object.keys(written.fields).length > 0) {
			next.records[at] = { fields: written.fields };
		}
	}
	return resetOutcome(config, next, scope?.reach, skipped);
}

/**
 * A reset that applied, with its reach where it narrowed and its skipped
 * records where a ceiling would not work out — each absent where it says
 * nothing, so a confirmation with neither reads exactly as it did.
 */
export function resetOutcome(
	config: RecordListConfig,
	data: RecordList,
	reach: ResetReach | undefined,
	skipped: number,
): ResetResult<RecordList> {
	return {
		ok: true,
		data,
		...(reach === undefined ? {} : { reach }),
		...(skipped === 0
			? {}
			: { skipped: skippedSentence(skipped, recordNoun(config)) }),
	};
}
