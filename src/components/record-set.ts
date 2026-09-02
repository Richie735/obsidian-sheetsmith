/*
 * Record set — a list of records the character adds, where a record carries
 * prose too long for a cell (SPEC §4.2). Covers a spellbook, a features and
 * traits list, a feats list, an abilities list.
 *
 * **It is not a Table with more configuration**, and that question was asked
 * before this file existed, because the catalog has refused to grow five times.
 * The test §12 sets is to name in one sentence what this has that a Table does
 * not, and exactly one sentence survives it: **a record has a body, and a
 * markdown table row has nowhere to keep one.** `|` splits a cell and a newline
 * ends the row, so a per-record body cannot be held without changing the file
 * format — and every one of the five folds held storage constant. A fold that
 * has to change the file format is not a fold.
 *
 * Three things it deliberately does *not* claim as the difference, because all
 * three are already Table's and repeating them is how this component gets
 * redesigned by the next reader. A typed ` when ` clause on a modifier already
 * makes a change conditional on the row's own toggle. A wikilink in a row name
 * is already a live link. And per-row scope, typed columns and aggregates are
 * already there.
 *
 * **The unit is a Record**, and its storage is one `###` block per record: the
 * heading is the name, a `sheet` fence under it holds the typed fields, and
 * everything after the fence is the body. That is Rich text's shape one level
 * down, and it is what Constraints 2 and 3 are satisfied by:
 *
 * - **No wikilink inside a fence, and the *inputs* are where that is actually
 *   held.** The claim used to be that no field type this component offers can
 *   hold one — a `text` field is refused as a configuration error, and the
 *   refusal is not a cut, since SPEC §5's language has no strings — and that is
 *   true of the *type* and false of the *input*. A `number` field is an
 *   `<input type="text">` and `boundedText` leaves text that is not a number
 *   exactly as typed, so a pasted `[[Ring]]` reached the fence; a scan over the
 *   offered types could not see it. Every free-text route into a fence entry now
 *   goes through `refuseLink`. The link-bearing halves of a record, its heading
 *   and its prose, are plain markdown, so backlinks, graph view, hover preview
 *   and rename propagation all work.
 * - **Parse then serialise is byte-identical per record**, because
 *   `parse/records.ts` keeps every byte in a piece and rejoins them, the fence
 *   keeps its own spelling through `parse/fenced.ts`, the prose keeps its
 *   framing through `parse/markdown-body.ts`, and a `number` entry keeps its own
 *   spelling of the slash through `parse/bounded-entry.ts`. `RecordEntry.fields`
 *   holds the note's own bytes whatever an entry carries — the split into a
 *   value and its ceiling happens *above* `read`, wherever this component turns
 *   a stored entry into a value — so `writeFenced`'s "rewrite only the lines
 *   whose value changed" comparison sees an identical string for anything the
 *   reader did not touch.
 *
 * **It publishes no names at all.** `<id>.<name>` is a fixed-row mechanism — a
 * name a formula can write has to be knowable when the formula is written — and
 * every record here is the character's, so there is no `scopeValues` and
 * `spells.Fireball` fails as an unknown name exactly as `inventory.Dagger` does.
 * What it publishes instead is the two members that need no names: `scopeRows`,
 * so `count(spells, Prepared)` is arithmetic the layout writes, and
 * `scopeModifiers`, so a record pushes at names it has never heard of.
 *
 * **Failure is per record rather than per section**, which is the one departure
 * from Table. A section holding forty spells must not be blanked by one
 * hand-typed colon, so a record whose fence will not read draws its name, its
 * body and a problem line, and every other record goes on working. `read` fails
 * for one case only: a configuration this component refuses.
 */

import { setIcon } from 'obsidian';
import { bindEditable, bindMultiline } from '../interaction/editable';
import { armRegister, bindArmToConfirm } from '../interaction/arm-to-confirm';
import {
	splitBounded,
	withCeiling,
	withValue,
} from '../parse/bounded-entry';
import { readFenced, writeFenced } from '../parse/fenced';
import { bodyText, writeBodyText } from '../parse/markdown-body';
import { cellParts, spellParts, storedParts } from '../parse/modifier-cell';
import {
	appendRecord,
	joinRecords,
	RecordBlock,
	renameRecord,
	splitRecordBody,
	splitRecords,
	startsRecord,
	withRecordBody,
} from '../parse/records';
import { startsSection } from '../parse/character';
import { displayText, hasLink } from '../parse/wikilink';
import { ColumnType, HOLDER_MAX_SOURCE, MaxSource } from './column-types';
import {
	boundedText,
	formatComputed,
	TypedField,
	typedValue,
	typeOf,
} from './typed-value';
import {
	ComponentConfig,
	ComponentDefinition,
	FieldResolver,
	FieldValue,
	ModifierPush,
	ModifierSource,
	ReadResult,
	ResetBinding,
	ResetContext,
	ResetResult,
	RowsSource,
	RowValues,
	showsOwnLabel,
} from '../types';
import {
	levelCount,
	levelName,
	levelOf,
	paintLevelRing,
	parseLevel,
} from './level-ring';
import { adoptRenderedLinks, paintLinkedText } from './linked-text';
import {
	ModifierFormState,
	modifierFormState,
	renderModifierForm,
} from './modifier-form';
import {
	modifierRowName,
	modifierRowText,
	rowModifiers,
} from './modifier-breakdown';
import {
	sampleFlag,
	sampleNumber,
	samplePart,
	sampleSeed,
	sampleText,
} from './sample-values';
import { flagText, isFlagSet } from './stored-flag';
import {
	AnchoredPanel,
	focusFirstControl,
	openAnchoredPanelKey,
	reanchorAnchoredPanel,
	showAnchoredPanel,
} from '../ui/anchored-panel';
import { bindLongPress, showPopover } from '../ui/popover';
import { spellcheckWhileFocused } from '../ui/spellcheck';
import { revealWhenTruncated } from '../ui/truncation';

/** What one record is called where the layout has not said. */
const DEFAULT_RECORD_NAME = 'Record';

/**
 * The disclosure's two marks. Lucide's own chevrons, so the control reads as
 * every other disclosure in the app rather than as a glyph of this plugin's.
 */
const CLOSED_ICON = 'chevron-right';
const OPEN_ICON = 'chevron-down';

/** The delete control's mark, which is Table's and the layout editor's. */
const REMOVE_ICON = 'trash';

/** A blank line, which is what separates one paragraph from the next. */
const PARAGRAPH_BREAK = /(?:\r?\n[ \t]*)+\r?\n/;

/**
 * What clipping means on a record's name, for the shared linked-text painter.
 *
 * A summary line is one line whose neighbours have already agreed its height, so
 * a name clips exactly as a cell does — and the class name stays here rather
 * than in the painter, which is PATTERNS §1's rule: a module beside the
 * components must not name a record.
 */
const NAME_CLIPPING = {
	soleLinkClass: 'sheetsmith-record-link-only',
	reveal: revealWhenTruncated,
};

/**
 * Which list's **Add** control was pressed, and how many records it held at the
 * time, so the render that follows can put focus in the new record's name.
 *
 * **Held across the rebuild because nothing else can hold it.** A press on
 * **Add** writes the note, the sheet re-renders, and the button the reader
 * pressed is gone — so the component that wants to land focus somewhere no
 * longer exists by the time the record does. `view/cell-focus.ts` cannot answer
 * it either: it restores by a control's *index* inside the cell, and a new
 * record's controls sit before the add button, so the index the reader was on
 * now names the new record's chevron rather than its name field. The press
 * therefore blurs the button before reporting the change — which makes the
 * view's capture return null, since focus has left the sheet — and this says
 * which list gets the landing.
 *
 * **Keyed and checked before use, and cleared only by the render it belongs
 * to**, which is `ui/anchored-panel.ts`'s actual shape rather than "module-level
 * state" in general: that module keys its one panel and `reanchorAnchoredPanel`
 * hands back null for any other key, and it never clears a key that is not its
 * own. Read as a bare "the id of whoever pressed Add", cleared unconditionally
 * by every render, this was **broken on any sheet with two Record sets on it**:
 * the view draws every component in one pass, so the list that draws first
 * consumed the flag the list that draws second had set, and focus landed
 * nowhere on a control that had blurred itself. Layout-order dependent, silent,
 * and reachable in the harness fixture today.
 *
 * **The count is what makes it a one-shot rather than a standing flag.** A write
 * that never lands produces no re-render at all, so a bare id would sit armed
 * until some later unrelated render of that same list stole focus into its last
 * record. The landing fires only where the list actually grew, which is the
 * observable fact the press was waiting for.
 */
let awaitingAdd: { id: string; held: number } | null = null;

/** One typed value every record holds, stored as an entry in its fence. */
export interface RecordField {
	/** Entry key in the note, and the name a formula reads the value by. */
	key: string;
	/** What the field is called on the sheet, when it should differ from the key. */
	name?: string;
	/** Defaults to text, which this component refuses. */
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
	 * record is read against, or each record, a number the reader types on the
	 * sheet beside the value and the note keeps inside that record's own entry.
	 *
	 * Absent means `'field'`, so every layout written before this reads exactly
	 * as it did. Under `'record'` the field's own `max` is not read at all — it
	 * survives untouched in the layout, so switching back restores the previous
	 * reading exactly, which is Pool's own rule for a note carrying a `max`
	 * entry: read in both modes, used in one.
	 *
	 * A string union rather than a boolean, so the formula ceiling this
	 * deliberately does not do can be added as a third source rather than
	 * replacing a flag. Ignored on every other field type, on `secondary`'s
	 * rule: it promises nothing this component would have to deliver, and a
	 * hand-edited layout may carry it.
	 *
	 * The union is `column-types.ts`'s rather than this file's, for that file's
	 * own reason: the editor spells the same two ids and imports nothing from a
	 * component, so two copies would drift in silence.
	 */
	maxSource?: MaxSource;
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
	 * Ignored: there is no heading strip over a record's fields for one to be
	 * hidden from. Declared for `secondary`'s reason — a hand-edited layout may
	 * carry it, and the key must survive the round trip.
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

export interface RecordSetConfig extends ComponentConfig {
	type: 'record-set';
	recordName?: string;
	fields?: RecordField[];
	hideLabel?: boolean;
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

export interface RecordSetData {
	/**
	 * Records by their position among the `###` blocks, 0 first. Read fills
	 * every position; an edit reports only the positions it touched, so a commit
	 * racing a rebuild cannot write back a stale sibling.
	 *
	 * **Position, not the record's name.** Two records called "Shield" are two
	 * records, and neither is unreachable — which is the defect keying by name
	 * produced on Table and the reason that rule was settled. It is safe here for
	 * the same reason it is safe there: nothing outside this component ever sees
	 * an index, because no formula can name a record.
	 */
	records: Record<number, Partial<RecordEntry>>;
	/** Records to append, in order. */
	added?: readonly { name: string }[];
	/** Positions to remove, as read. */
	removed?: readonly number[];
}

/** What one record is called, in the author's own word. */
function recordNoun(config: RecordSetConfig): string {
	return (config.recordName ?? '').trim() || DEFAULT_RECORD_NAME;
}

/** Shared with Table through `typed-value.ts`, so the default cannot drift. */
const fieldType = typeOf;

/** Fields whose values live in the fence. Computed ones are never stored. */
function storedFields(config: RecordSetConfig): RecordField[] {
	return (config.fields ?? []).filter(
		(field) => fieldType(field) !== 'computed',
	);
}

/** What a record's field is called on the sheet. */
function fieldLabel(field: RecordField): string {
	return (field.name ?? '').trim() || field.key;
}

/** Whether this field's ceiling belongs to each record rather than to the field. */
function recordsOwnMax(field: RecordField): boolean {
	return fieldType(field) === 'number' && field.maxSource === HOLDER_MAX_SOURCE;
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
function storedValue(field: RecordField, raw: string | undefined): string {
	return fieldType(field) === 'number'
		? splitBounded(raw ?? '').value
		: (raw ?? '');
}

/**
 * What a ceiling's text is worth as a number, or null where it is worth
 * nothing at all.
 *
 * Null covers all three of "nothing there", "a blank half" and "text that is
 * not a number" — `boundedText`'s own rule keeps exactly what somebody wrote,
 * and all three behave the same way here: nothing clamps to it, and `full`
 * skips the field on that record.
 *
 * **One spelling, because drift is the whole of the risk** (§1's one-step
 * rung). The ceiling the note holds and the ceiling being typed are read at
 * opposite ends of this file, and two copies of this fail in exactly one way:
 * two channels disagreeing about whether a record has a ceiling at all. That
 * is not hypothetical — it is the defect the announcement shipped with, saying
 * "of lots" about a ceiling the clamp and the reset both read correctly as
 * none.
 */
function ceilingOf(text: string): number | null {
	const trimmed = text.trim();
	if (trimmed === '') return null;
	const value = Number(trimmed);
	return Number.isFinite(value) ? value : null;
}

/** The ceiling this record holds for this field, or null where it holds none. */
function recordCeiling(
	field: RecordField,
	raw: string | undefined,
): number | null {
	if (!recordsOwnMax(field)) return null;
	return ceilingOf(splitBounded(raw ?? '').ceiling ?? '');
}

/**
 * The bounds a number field's value is held to on this record: the field's own
 * floor, and whichever ceiling applies.
 *
 * The floor is the layout's in both modes, which is why it is not conditional.
 * `typed-value.ts` goes on being handed one number — the splitting happens on
 * this component's side of the call, which is what keeps this feature out of
 * Table by construction.
 */
function fieldBounds(field: RecordField, raw: string | undefined): TypedField {
	if (!recordsOwnMax(field)) return field;
	const ceiling = recordCeiling(field, raw);
	return ceiling === null
		? { type: 'number', min: field.min }
		: { type: 'number', min: field.min, max: ceiling };
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
function recordLabel(name: string, noun: string): string {
	const shown = displayText(name).trim();
	return shown === '' ? `Unnamed ${noun.toLowerCase()}` : shown;
}

/**
 * Configuration errors, each on this component alone and each naming its fix
 * (SPEC §10).
 *
 * Every one of them is about something the shared columns editor is willing to
 * offer and this component cannot hold, which is the cost the columns field's
 * reuse carries: the field is Table's shape, so it offers settings that mean
 * nothing here. Reported rather than ignored, which is exactly how Table already
 * handles a `total` on a text column.
 *
 * **The default type is one of them**, and it is worth naming because it is the
 * state a freshly added field is in: the columns field leaves `type` out for its
 * own default, which is `text`, so a field added and not yet typed reports here
 * until the author picks one. The message names every type this component does
 * offer, which is the fix.
 */
function configError(config: RecordSetConfig): string | null {
	const noun = recordNoun(config).toLowerCase();
	const seen = new Set<string>();
	for (const field of config.fields ?? []) {
		const key = (field.key ?? '').trim();
		if (key === '') {
			// The only one of these nine that named no fix when it was written, which
			// criterion 20 requires of every one of them. The fix is the file format:
			// a fence entry is `key: value`, so a field with nothing to the left of
			// the colon has nowhere to be stored.
			return `Every field needs a key: a ${noun}'s fields are stored one per line as "key: value", so a field with no key has nowhere to be written. Give it one, or remove it.`;
		}
		if (/[:\r\n]/.test(key)) {
			// A colon separates a key from its value inside the fence, so a key
			// holding one could not be stored at all. Card's rule, and validated
			// because the file format requires it rather than because it is tidy.
			return `The field "${key}" cannot contain a colon or a line break, because a colon separates a key from its value in the block.`;
		}
		if (seen.has(key.toLowerCase())) {
			return `Two fields are both called "${key}".`;
		}
		seen.add(key.toLowerCase());
		if (fieldType(field) === 'text') {
			return `The field "${key}" cannot hold text, because prose belongs in the ${noun}'s body, where it may also hold links. Make it a number, level, toggle, computed or modifier field, or remove it and write the words in the ${noun} instead.`;
		}
		if (field.total === true) {
			return `The field "${key}" cannot show a total, because a list of ${noun}s draws no totals row for one to sit in. Add it up from elsewhere on the sheet with sum(${config.id}, ${key}), or turn the total off.`;
		}
		if (field.publish === true) {
			return `The field "${key}" cannot be published per ${noun}, because every ${noun} is the character's and a name a formula reads has to be knowable when the formula is written. Read the list with count(${config.id}, <expression>) or sum(${config.id}, <expression>) instead, or turn publishing off.`;
		}
		if (field.levels !== undefined && field.levels.length < 2) {
			// The first name is what "none" is called, so a single name describes
			// a field with no level to reach.
			return `The field "${key}" needs at least two level names, starting with the one for none.`;
		}
		if (field.levels?.some((entry) => parseLevel(entry).name === '')) {
			// A level with only a glyph has nothing to be called: the name is what
			// a screen reader is given and what a dropdown lists.
			return `The field "${key}" has a level with a mark but no name.`;
		}
		// **Only where the ceiling is the field's.** Where it is the record's,
		// `config.max` is not read at all, so reporting a relation between two
		// numbers the component ignores would send an author to fix a number
		// nothing uses. A `max` declared beside `maxSource: 'record'` is not an
		// error either: it is simply unused, and it survives untouched, so
		// switching back restores the previous reading exactly.
		if (
			!recordsOwnMax(field) &&
			field.min !== undefined &&
			field.max !== undefined &&
			field.min > field.max
		) {
			return `The field "${key}" has a minimum of ${field.min} above its maximum of ${field.max}. Lower the minimum, or raise the maximum.`;
		}
	}
	return null;
}

/** Every record the list draws, in file order. */
function recordViews(data: RecordSetData | null): RecordEntry[] {
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
 * One record's names as a formula reads them: every stored field by its key,
 * then the computed fields over the top.
 *
 * **Every computed field resolves against the stored layer, never against
 * another computed field**, which is Table's own rule for the same reason: the
 * value on screen and the value an aggregate reads must not disagree about what
 * a record says.
 */
function recordValues(
	config: RecordSetConfig,
	record: RecordEntry,
	resolve: FieldResolver,
): RowValues {
	const stored: Record<string, FieldValue> = {};
	for (const field of config.fields ?? []) {
		if (fieldType(field) === 'computed') continue;
		// The value half, never the whole entry: a record's `Uses` name is worth
		// `2` when the entry says `2 / 3`, which is what `sum(features, Uses)`
		// added up before this feature and what it must go on adding up.
		stored[field.key] = typedValue(field, storedValue(field, record.fields[field.key]));
	}
	const values: Record<string, FieldValue> = { ...stored };
	(config.fields ?? []).forEach((field, at) => {
		if (fieldType(field) !== 'computed') return;
		const value = resolve(`fields.${at}.formula`, stored);
		// A field that would not resolve is absent rather than zero, so an
		// expression reading it fails and the aggregate says which record.
		if (value !== null) values[field.key] = value;
	});
	return { label: recordLabel(record.name, recordNoun(config)), values };
}

/** What one field holds in a sample, or null where it stores nothing. */
function sampleField(
	field: RecordField,
	record: number,
	at: number,
): string | null {
	switch (fieldType(field)) {
		case 'number': {
			/*
			 * A declared ceiling is what a uses counter has, and a sample sitting at
			 * it would draw a full counter where a partial one says more — so a
			 * bounded field takes `samplePart` and an unbounded one the sequence.
			 *
			 * **A partial of a partial per record, because one partial gave both
			 * records the same number.** A design review found `Feature 1 / Uses 2`
			 * beside `Feature 2 / Uses 2` and `Spell 1 / Level 5` beside
			 * `Spell 2 / Level 5`: `samplePart` reads the *ceiling*, which is the
			 * field's and not the record's, so a bounded number was a column
			 * constant where the flag beside it correctly alternated — and an author
			 * could not see that a number field varies per record. Applied once more
			 * per record, so record 0 is a partial of the ceiling and record 1 a
			 * partial of that. A ceiling of 1 or 2 has one partial value and both
			 * records show it, which is `samplePart`'s own rule rather than this
			 * one's, and is the honest answer for a once-per-rest counter.
			 */
			/*
			 * **Under `maxSource: 'record'` the ceiling varies per record too**,
			 * which is the direct extension of the rule above rather than a new
			 * one: the thing an author has just turned on is precisely that the
			 * ceiling is the record's, and `Uses 2 / 3` beside `Uses 1 / 2` says
			 * that where `Uses 2 / 3` beside `Uses 1 / 3` would say the opposite.
			 * The ceiling is `sampleNumber` of this list's own seed and the value
			 * a partial of it, so two record sets in one layout do not draw the
			 * same two pairs. Composed through `withCeiling`, so the canonical
			 * ` / ` is forced rather than chosen — `contract.test.ts` already
			 * drives every sample through this component's own read and write.
			 */
			if (recordsOwnMax(field)) {
				const ceiling = sampleNumber(at);
				const value = boundedText(String(samplePart(ceiling)), {
					type: 'number',
					min: field.min,
					max: ceiling,
				});
				return withCeiling(value, String(ceiling));
			}
			if (field.max === undefined) {
				return boundedText(String(sampleNumber(at)), field);
			}
			let raw = Math.floor(field.max);
			for (let step = 0; step <= record; step++) raw = samplePart(raw);
			return boundedText(String(raw), field);
		}
		case 'toggle':
			return flagText(sampleFlag(record));
		case 'level':
			// A level is a flag with a ladder in it, so it answers both rules at
			// once: alternate records carry a level at all, and the level they
			// carry is partway up rather than at the top.
			return String(sampleFlag(record) ? samplePart(levelCount(field)) : 0);
		// A modifier field is left empty, and that is the one rule here about
		// something other than looking plausible: a name in it enrols the record
		// in one of the *layout's* definitions, and a layout the author is still
		// building may declare none — so a sample that named one would put a
		// problem on screen the author did not cause. A computed field stores
		// nothing at all, and a text field is a configuration error.
		default:
			return null;
	}
}

/**
 * What a reset writes, or why it cannot.
 *
 * A shape rather than a number, because the three actions want different things
 * per field: `full` reads each number field's own ceiling, `empty` writes zero
 * everywhere, and `formula` writes one resolved value into every number field.
 * The flag is separate because a toggle has no ceiling to read.
 */
type ResetWrite =
	| { error: string }
	| {
			/** Null is "nothing to restore to on this record", which writes nothing. */
			number: (field: RecordField, record: RecordEntry) => number | null;
			flag: boolean;
	  };

function resetWrite(
	config: RecordSetConfig,
	reset: ResetBinding,
	context: ResetContext,
): ResetWrite {
	if (reset.action === 'empty') {
		// Emptying needs nothing resolved: zero is zero whatever the ceiling is,
		// and a list whose ceilings are broken can still be spent.
		return { number: () => 0, flag: false };
	}
	if (reset.action === 'formula') {
		const value = context.resolve('reset.to', {});
		// Two failures, not one, which is Track's own shape: a formula that would
		// not resolve at all, and one that resolved to something that is not a
		// number. Reported apart because the fix differs — define the name, or
		// write an expression that comes to a count — and reporting the second as
		// "its reset formula is empty" sent the author looking at a formula that
		// is right there.
		if (value === null) {
			return {
				error: context.explain('reset.to', {}) ?? 'its reset formula is empty.',
			};
		}
		const number = Number(value);
		if (!Number.isFinite(number)) {
			return {
				error: `its reset formula produced "${String(value)}", which is not a number.`,
			};
		}
		/*
		 * **The flag is derived from the number rather than set true**, which is
		 * `track.ts`'s rule for a flag card and the correction this branch needed:
		 * set unconditionally, `to: '0'` wrote zero into every counter *and turned
		 * every toggle on* — a write the reader did not ask for, in the one action
		 * whose whole job is to say what the value should be. Derived, `formula` is
		 * a generalisation of the other two rather than a third rule: `to: '0'` is
		 * `empty` and `to: '3'` is `full` on a field with that ceiling.
		 */
		return { number: () => number, flag: number >= 1 };
	}
	/*
	 * `full`, and the whole of the work is here.
	 *
	 * **A field whose ceiling is the field's fails naming the field where it
	 * declares none**, unchanged: the layout stated one ceiling for every
	 * record, so a missing one is a configuration nobody can act on from the
	 * sheet (SPEC §6).
	 *
	 * **A field whose ceiling is the record's is not checked here at all, and a
	 * record that has set none is skipped rather than failed.** The two
	 * situations are not the same failure. A field with no `max` has nothing the
	 * button was for on any record; a *record* with no ceiling is, in the
	 * ordinary case, a record that is not a counter — a passive trait on a
	 * features list whose `Uses` is blank on purpose. Failing the component
	 * would mean one passive trait refusing a Long Rest for thirty spells, which
	 * is §6's "refusing the whole rest because one component is misconfigured is
	 * a worse answer" one level in. Nothing is reported and nothing needs to be:
	 * the record whose counter did not move is the record showing `—` in the
	 * ceiling slot, in the list the reader is already looking at.
	 *
	 * **And it must not write 0.** `full` means restore to the ceiling; where
	 * there is none there is nothing to restore to, so nothing is written — a
	 * zero would be a value the reader never asked for in the one action whose
	 * job is to put a number back, which is the defect `formula` was corrected
	 * for above.
	 */
	const missing = storedFields(config).find(
		(field) =>
			fieldType(field) === 'number' &&
			!recordsOwnMax(field) &&
			field.max === undefined,
	);
	if (missing !== undefined) {
		return {
			error: `the field "${fieldLabel(missing)}" has no maximum to restore to. Give it one, or set this trigger to empty.`,
		};
	}
	return {
		number: (field, record) =>
			recordsOwnMax(field)
				? recordCeiling(field, record.fields[field.key])
				: (field.max ?? null),
		flag: true,
	};
}

/** One record's stored pieces, with the delta applied and nothing else touched. */
function applyDelta(
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

export const recordSet: ComponentDefinition<RecordSetConfig, RecordSetData> = {
	type: 'record-set',
	storage: 'markdown',
	// `*` stands for one path segment: every field's formula. `reset.*.to` is the
	// reset expression, at the index of the binding being applied.
	formulaFields: ['fields.*.formula', 'reset.*.to'],
	configFields: [
		{
			key: 'recordName',
			kind: 'text',
			label: 'Record name',
			description:
				'What one record is called, e.g. "Spell". Names the add control in the last position of the list and the accessible name of a record\'s name field, and is the filler the layout editor previews with. Defaults to "Record".',
		},
		{
			key: 'fields',
			kind: 'columns',
			label: 'Fields',
			/*
			 * **What this component can hold, so a freshly added field is not an
			 * error.** The shared columns field is Table's shape: it offers every
			 * type and leaves the *shared* default — `text` — out of the file. This
			 * component refuses a text field, so without this an author met a
			 * configuration error on the first field they created, beside two
			 * checkboxes offering things the component also refuses. `number` first,
			 * because a uses counter is what a record's field usually is.
			 */
			columnOptions: {
				types: ['number', 'toggle', 'level', 'computed', 'modifier'],
				total: false,
				publish: false,
				// A uses counter that belongs to a record the character added is
				// the one thing this component has that a Pool or a Track beside
				// the list could never provide, and a homebrew feature's number of
				// uses is the record's rather than the layout's. Table does not ask
				// for it, which is what keeps this feature out of Table.
				holderMax: true,
				// There is no heading strip over a record's fields, so a control that
				// hides one is a control that does nothing. The *key* is still read
				// and still round-trips.
				hideHeading: false,
				// The editor's own words, so the one panel where an author reads about
				// their Record set does not describe it as cells and rows — which is
				// the vocabulary the model question freed the word "record" to end.
				unit: 'field',
				holder: 'record',
				// Where the value sits, which for a record *is* the field: Table needs
				// both words, since its entry is a column and its value is in a cell.
				cell: 'field',
				// What that column actually sets here: not a heading, since none is
				// drawn, but the field's own name beside its value.
				heading: 'Name',
			},
			description:
				'The typed values every record holds, each an entry in that record\'s block in the note. Text is not offered: words a reader reads belong in the record\'s body, where they may hold links. A number field with a maximum is a uses counter: the field draws that maximum beside its value, and a reset trigger restores it to that maximum. A number field\'s maximum may belong to the field, so every record shares it, or to each record, so a reader types it on the sheet — and a reset restores each record to whichever one applies.',
		},
		{
			key: 'hideLabel',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Hide the heading',
			description:
				'Draws the list with no name over it, for a list whose surroundings already say what it is. The records keep their own names either way.',
			default: false,
		},
	],
	/*
	 * Two entries, each argued against §4.2's rule: a job an author would go
	 * looking for, one component's configuration away, that the component's own
	 * name would not lead them to. Nobody building a spellbook or a features list
	 * looks for a component called Record set.
	 *
	 * **Features moves off Table rather than being added beside it.** §13's
	 * Features prefill was a Table with a `Notes` text column, and §13 said in the
	 * same breath that "a features list holding paragraphs is not a table at all,
	 * since a cell is one line". Two entries called Features under two types is a
	 * menu line nobody can choose between.
	 *
	 * No **Feats** entry: a feats list is a features list under another name and
	 * its prefill would be identical, which is the discipline §4.2 asks for.
	 */
	palette: [
		{
			name: 'Spellbook',
			description:
				'A list of spells the character adds, each with its level, whether it is prepared, and its description under it. A Record set, so a spell is a heading in the note with its own paragraph, and a spell named as a wikilink keeps a working link.',
			config: {
				recordName: 'Spell',
				fields: [
					{ key: 'Level', type: 'number' },
					{ key: 'Prepared', type: 'toggle' },
				],
			},
		},
		{
			name: 'Features',
			description:
				'A list of features, traits or moves the character adds, each with a uses counter, the modifiers it applies while it is switched on, and its full text under it. A Record set, because a feature\'s text is a paragraph and a table cell is one line.',
			config: {
				recordName: 'Feature',
				fields: [
					{ key: 'Uses', type: 'number', max: 1 },
					{ key: 'Modifiers', type: 'modifier' },
				],
			},
		},
	],

	/*
	 * Two records, named from `recordName` so an author's own word is what
	 * appears, each with its fields filled by the shared rules.
	 *
	 * **Two rather than one**, because what an author is judging here is whether
	 * a list of records reads as one block — the names lining up, the fields
	 * lining up under them — and one record answers none of that.
	 *
	 * **The body says out loud that it is filler.** Prose is the one sample a
	 * reader could mistake for their own data, which is Rich text's own rule; the
	 * record's name carries the author's word, so what a reader recognises is
	 * still theirs.
	 *
	 * A configuration this component refuses fills nothing: `read` reports the
	 * error from the same call either way, and a record written under a field key
	 * this component refuses would be a second thing wrong on it.
	 */
	sample(config): string {
		if (configError(config) !== null) return '';
		const noun = recordNoun(config);
		const fields = storedFields(config);
		// This list's own place in the sequence, so two record sets in one layout
		// do not fill their number fields identically.
		const seed = sampleSeed(config.id);
		const parts: string[] = ['\n'];
		for (const which of [0, 1]) {
			parts.push(`### ${sampleText(noun, which)}\n`);
			const entries: string[] = [];
			fields.forEach((field, at) => {
				const value = sampleField(field, which, seed + which * fields.length + at);
				if (value !== null) entries.push(`${field.key}: ${value}`);
			});
			if (entries.length > 0) {
				parts.push(`\n\`\`\`sheet\n${entries.join('\n')}\n\`\`\`\n`);
			}
			parts.push(
				which === 0
					? `\nSample text, so an open ${noun.toLowerCase()} shows where its prose starts and where it stops.\n`
					: `\nSample text again, so a second ${noun.toLowerCase()} shows how two of them sit under one another.\n`,
			);
			if (which === 0) parts.push('\n');
		}
		return parts.join('');
	},

	read(body, config): ReadResult<RecordSetData> {
		const error = configError(config);
		if (error !== null) return { ok: false, error };
		const section = splitRecords(body);
		// No records is a list with its add control and nothing else, which is
		// what a new character looks like: SPEC §10's "a section without a data
		// block is empty, not malformed".
		if (section.records.length === 0) return { ok: true, data: null };
		const noun = recordNoun(config).toLowerCase();
		const records: Record<number, RecordEntry> = {};
		section.records.forEach((block, at) => {
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
				error: parsed.ok
					? null
					: `${parsed.error} Fix this ${noun} in the note; every other one on this list still works.`,
			};
		});
		return { ok: true, data: { records } };
	},

	/**
	 * The records an aggregate walks, so `count(features, Attuned)` and
	 * `sum(spells, Level)` are arithmetic the layout writes (SPEC §5).
	 *
	 * **The records have no names and never gain any.** What an aggregate names
	 * is the component, which is knowable when the formula is written, and it
	 * reaches the records as a set whose cardinality the layout does not know —
	 * which is the whole of what an aggregate is for, and the whole of why this
	 * component publishes no `scopeValues`.
	 *
	 * An empty list gives an empty set rather than nothing, so `count(spells)`
	 * over a character who has written none is 0 rather than a failure.
	 */
	scopeRows(data, config): RowsSource | undefined {
		// A misconfigured list publishes nothing, on Table's own argument:
		// counting records the component is refusing to show would be a number
		// derived from a configuration nobody has agreed to yet.
		if (configError(config) !== null) return undefined;
		const records = recordViews(data);
		return (resolve) =>
			records.map((record) => recordValues(config, record, resolve));
	},

	/**
	 * The enrolments this list's records declare in the layout's modifier
	 * definitions (SPEC §5).
	 *
	 * A push is one part, as raw text, exactly as a cell's is: the record hands
	 * over each part's own bytes and its own scope, and the formula layer decides
	 * whether that text names a definition or spells an effect out. So a record's
	 * modifier field inherits the cell format rather than restating it, and a
	 * ` when ` clause is evaluated in the record's own scope — which is what makes
	 * "only while this feature is switched on" today's spelling rather than a new
	 * mechanism.
	 *
	 * A record whose fence will not read pushes nothing, on the same argument the
	 * configuration guard above makes one level up: a bonus derived from bytes
	 * this component could not parse is a number nobody agreed to.
	 */
	scopeModifiers(data, config): ModifierSource | undefined {
		if (configError(config) !== null) return undefined;
		const enrolling = (config.fields ?? []).filter(
			(field) => fieldType(field) === 'modifier',
		);
		if (enrolling.length === 0) return undefined;
		const records = recordViews(data);

		return (resolve) => {
			const pushes: ModifierPush[] = [];
			for (const record of records) {
				if (record.error !== null) continue;
				/** Built once per record, however many fields on it enrol. */
				let row: RowValues | null = null;
				for (const field of enrolling) {
					for (const part of cellParts(record.fields[field.key] ?? '')) {
						row ??= recordValues(config, record, resolve);
						pushes.push({
							part,
							// The list's own name, which is the half a record's label
							// cannot carry: two record sets on one sheet can each hold a
							// "Ring". `modifierBreakdown` decides when to show it.
							source: config.label,
							row,
						});
					}
				}
			}
			return pushes;
		};
	},

	write(data, body, config): string {
		const section = splitRecords(body ?? '');
		const records = [...section.records];
		const known = new Map(
			storedFields(config).map((field) => [field.key.toLowerCase(), field.key]),
		);

		for (const [position, delta] of Object.entries(data.records ?? {})) {
			const at = Number(position);
			const block = records[at];
			if (block === undefined) continue;
			// **A record this component cannot read is one it must not write.**
			// Which lines are the fence and which are the prose comes out of the
			// read, so a block whose fence is unreadable would take a write aimed at
			// a line nobody meant. Recomputed here rather than trusted from the
			// render the edit came from, because this side is the file boundary.
			if (!readFenced(block.head + block.rest).ok) continue;
			records[at] = applyDelta(block, delta, known);
		}

		// Highest first, so an earlier removal cannot shift a later one's position.
		const removed = [...new Set(data.removed ?? [])]
			.filter((at) => records[at] !== undefined)
			.sort((left, right) => right - left);
		for (const at of removed) records.splice(at, 1);

		let next = { preamble: section.preamble, records };
		for (const record of data.added ?? []) {
			next = appendRecord(next, record.name);
		}
		return joinRecords(next);
	},

	/**
	 * Restore every record's counters (SPEC §6).
	 *
	 * **The counter is on the record and the reset reaches it through here**,
	 * which is what a separate Track or Pool beside the list could never do: a
	 * record the character added has no layout-declared component to count with.
	 *
	 * `empty` needs nothing resolved, so a list whose ceilings are misconfigured
	 * can still be cleared. `full` fails naming the field where a *field-owned*
	 * ceiling is missing, which is a Pool's unresolvable `to` reported the way
	 * `ResetResult` already carries it — the trigger applies what it can and names
	 * what it could not — and skips a *record* that has set none of its own,
	 * which `resetWrite` argues.
	 *
	 * **The skip is per (record, field), like the storage.** A ceiling bounds one
	 * number field and not the record, so a `Used` toggle beside a blank `Uses`
	 * still clears on the rest.
	 *
	 * **A `level` field is left alone by every action**, deliberately: SPEC §6
	 * names `full` and `empty` for a number and a two-state flag, and a graded
	 * level's "full" is a ladder position rather than a ceiling the layout stated.
	 * A record whose fence will not read is left alone too, for `write`'s reason.
	 */
	applyReset(data, config, reset, context): ResetResult<RecordSetData> {
		const next: RecordSetData = { records: {} };
		// A binding about the buffer alone, and this component declares none, so
		// there is nothing to do and nothing went wrong.
		if (reset.action === undefined) return { ok: true, data: next };
		const write = resetWrite(config, reset, context);
		if ('error' in write) return { ok: false, error: write.error };
		recordViews(data).forEach((record, at) => {
			if (record.error !== null) return;
			const fields: Record<string, string> = {};
			for (const field of storedFields(config)) {
				const type = fieldType(field);
				if (type === 'number') {
					const raw = record.fields[field.key] ?? '';
					const value = write.number(field, record);
					// **Written through the join, so the ceiling survives every
					// action.** An emptied counter is `Uses: 0 / 3` and never
					// `Uses: 0`: a reset that deleted the reader's own ceiling would
					// be Constraint 4 broken by the one control whose job is to
					// restore. And the number is held to whichever ceiling applies,
					// so a `formula` writing 3 into a record whose ceiling is 2
					// writes 2.
					if (value !== null) {
						fields[field.key] = withValue(
							raw,
							boundedText(String(value), fieldBounds(field, raw)),
						);
					}
				} else if (type === 'toggle') {
					fields[field.key] = flagText(write.flag);
				}
			}
			if (Object.keys(fields).length > 0) next.records[at] = { fields };
		});
		return { ok: true, data: next };
	},

	render(container, config, data, context): void {
		const doc = container.ownerDocument;
		container.replaceChildren();
		const element = <K extends keyof HTMLElementTagNameMap>(
			tag: K,
			className: string,
			parent: HTMLElement,
			text?: string,
		): HTMLElementTagNameMap[K] => {
			const el = doc.createElement(tag);
			// Split, because `classList.add` throws on a space in a real browser and
			// happy-dom accepts it — a `DOMException` here would abort the render
			// mid-list and no test would see it (docs/UI.md §12).
			for (const one of className.split(' ')) {
				if (one !== '') el.classList.add(one);
			}
			if (text !== undefined) el.textContent = text;
			parent.appendChild(el);
			return el;
		};

		const error = configError(config);
		if (error !== null) {
			// A misconfigured component reports on itself; SPEC §10 keeps the rest
			// of the sheet rendering and editable.
			element('div', 'sheetsmith-error', container, error);
			return;
		}

		const noun = recordNoun(config);
		const fields = config.fields ?? [];
		const records = recordViews(data);

		/**
		 * Whether this render is the one that follows a press on **Add** here.
		 *
		 * Cleared only where it matches, so another list's render cannot consume
		 * it, and only where this list actually gained a record, so a write that
		 * never landed cannot leave it armed.
		 */
		const landing =
			awaitingAdd?.id === config.id && records.length > awaitingAdd.held;
		if (landing) awaitingAdd = null;

		const block = element(
			'div',
			'sheetsmith-placed sheetsmith-record-set',
			container,
		);
		// The placement, handed to CSS as the box's own floor: the box is `height`
		// grid rows tall whatever is in it and the list scrolls inside it, so
		// opening a record moves nothing on the sheet (SPEC §8).
		block.style.setProperty('--sheetsmith-rows', String(config.position.height));

		if (showsOwnLabel(config, context)) {
			element(
				'div',
				'sheetsmith-component-label sheetsmith-record-set-label',
				block,
				config.label,
			);
		}

		const box = element(
			'div',
			'sheetsmith-placed-box sheetsmith-record-set-box',
			block,
		);
		// Out of flow, so nothing inside contributes intrinsic height and the box
		// cannot be grown past its placement by a long list or a long body.
		const list = element('div', 'sheetsmith-record-set-list', box);

		// Announces once per commit. Built before the records so it is in the
		// document by the time any of them speaks; a live region has to be attached
		// before its text changes or the message is never queued.
		const status = element('div', 'sheetsmith-sr-only', block);
		status.setAttribute('aria-live', 'polite');

		/**
		 * Which records the reader has open.
		 *
		 * Clamped rather than trusted, on `activeTab`'s own rule: the reader's
		 * posture outlives the note, so a set pointing past the end is a set
		 * pointing at nothing.
		 */
		const opened = new Set(
			(context.openRecords ?? []).filter(
				(at) => Number.isInteger(at) && at >= 0 && at < records.length,
			),
		);

		/**
		 * Move the open set up past a record that is going.
		 *
		 * The set is keyed by position, like everything else about a record, so a
		 * delete shifts it. Reported as the difference rather than as a new set,
		 * because the two context members are per index — a second pair rather than
		 * a generalisation of `activeTab`, since an index into alternatives and a
		 * set of open records are two shapes.
		 */
		const shiftOpen = (removedAt: number): void => {
			const target = new Set<number>();
			for (const at of opened) {
				if (at < removedAt) target.add(at);
				else if (at > removedAt) target.add(at - 1);
			}
			for (const at of opened) {
				if (!target.has(at)) context.onToggleRecord?.(at, false);
			}
			for (const at of target) {
				if (!opened.has(at)) context.onToggleRecord?.(at, true);
			}
		};

		/** Draw prose as paragraphs with its wikilinks live, for where there is no app. */
		const paintProse = (into: HTMLElement, text: string): void => {
			into.replaceChildren();
			into.classList.add('sheetsmith-record-body-plain');
			for (const paragraph of text.split(PARAGRAPH_BREAK)) {
				if (paragraph.trim() === '') continue;
				const p = element('p', '', into);
				paintLinkedText(p, paragraph, { link: context.link });
			}
		};

		/**
		 * Why a note reference cannot be stored in a record's fields, or null.
		 *
		 * **One builder for every route that reaches the fence**, because the
		 * sentence is the whole of what the reader is told and two copies of it is
		 * one design pass away from saying two things — which is the drift
		 * `components/isolation.test.ts` scans for by clause.
		 *
		 * **It used to be bound to the modifier field alone, and that was a hole
		 * rather than a scoping decision.** The claim covering the rest was that no
		 * field type this component offers can hold a wikilink, which is true of the
		 * *type* and false of the *input*: a `number` field is an
		 * `<input type="text">` and `boundedText` leaves text that is not a number
		 * exactly as typed, so a pasted `[[Ring]]` in a `Uses` field was written
		 * into the fence. A scan over the offered types could not see it.
		 *
		 * **Table has the same free text and does not have this problem**, which is
		 * why it never came up: a modifier cell there is a markdown table cell, so a
		 * `[[…]]` in one *is* indexed. A record's fields are a `sheet` fence, and
		 * Obsidian indexes no link inside one — backlinks, graph view, hover preview
		 * and rename propagation all break with no warning, which is the whole of
		 * Constraint 2.
		 *
		 * Refused rather than escaped, on Rich text's own rule: escaping puts a
		 * plugin's syntax into a file the user owns. And refused at the *commit*
		 * rather than in `read`, so a note that already holds one is rendered and
		 * carried rather than corrected (SPEC §10) — the message is for the reader
		 * who is typing one now.
		 */
		const refuseLink = (text: string): string | null =>
			hasLink(text)
				? `A ${noun.toLowerCase()}'s fields are stored in a code block and Obsidian indexes no link inside one, so "${text}" would stop being a link. Put it in the ${noun.toLowerCase()}'s name or its body instead.`
				: null;

		/** The whole sentence a refused commit says, or null where the text is fine. */
		const refusal = (text: string): string | null => {
			const said = refuseLink(text);
			return said === null ? null : `Not saved. ${said}`;
		};

		/**
		 * Why a number field's commit cannot be stored, or null.
		 *
		 * A link, as everywhere else that reaches the fence — **and a slash**,
		 * which this feature made syntax. `parse/bounded-entry.ts` splits an entry
		 * at its first slash, so a value half holding one is not a value that
		 * module can write back: committing `1/2` into a field whose entry is
		 * `Uses: 2 / 3` produces `Uses: 1/2 / 3`, which re-reads as a value of 1
		 * against a ceiling of `2 / 3` — text, so nothing clamps to it and `full`
		 * starts skipping that record. Nothing is deleted, so Constraint 4 holds;
		 * what goes is the reading the reader set, silently, on an ordinary typo.
		 *
		 * **Refused rather than repaired**, on `boundedText`'s own rule one level
		 * up: `1/2` might mean "one of two" and might be a slip, and replacing what
		 * somebody wrote with a number they did not is the thing this codebase
		 * refuses to do. It is also PATTERNS §7 exactly — validate what the file
		 * format requires, not what looks tidy — and the slash is now what a colon
		 * already was.
		 *
		 * One sentence for both fields and both modes: where the ceiling is the
		 * record's there is a field after the slash to type it in, and where it is
		 * the layout's there is nothing to type at all, so neither is told to go
		 * anywhere in particular.
		 */
		const refuseNumber = (text: string): string | null => {
			const link = refusal(text);
			if (link !== null) return link;
			if (!text.includes('/')) return null;
			return `Not saved. A slash separates a value from the maximum it is read against, so "${text}" would be stored as two numbers rather than one. Type just the number here.`;
		};

		/**
		 * Draw or clear one standing refusal under a record, and say it.
		 *
		 * **A closure per message rather than a function taking one**, because what
		 * has to be remembered is *which* element to remove — so a message about a
		 * record's value is not cleared by a commit on the ceiling beside it, and
		 * the modifier field's is not cleared by the body's.
		 *
		 * Four sites had these same four lines: the value field, the ceiling field,
		 * the modifier cell and the body. §1 allows two copies only under a test
		 * driving both and each of these is driven by its own case, so at four this
		 * is well past where the ladder stops arguing. The host is a parameter
		 * because it differs — the summary line is one row of fields and has nowhere
		 * to put a sentence, so a field's message hangs on the record while the
		 * body's hangs under the body's own row.
		 */
		const refusalNotice = (
			into: HTMLElement,
		): ((message: string | null) => void) => {
			let notice: HTMLElement | null = null;
			return (message) => {
				notice?.remove();
				notice = null;
				if (message === null) return;
				notice = element('div', 'sheetsmith-error', into, message);
				status.textContent = message;
			};
		};

		/** Which delete control is armed, one register per list. */
		const armedRecord = armRegister();

		/** The name fields drawn, so a landing after **Add** can reach the last. */
		const nameFields: HTMLInputElement[] = [];

		records.forEach((record, at) => {
			drawRecord(record, at);
		});

		// The add control sits in the last position of the list, so it reads as the
		// next record rather than as chrome beside it — `.sheetsmith-table-add`'s
		// own vocabulary, one storage over.
		const add = element('button', 'sheetsmith-record-add', list);
		add.type = 'button';
		element(
			'span',
			'sheetsmith-record-add-label',
			add,
			`Add ${noun.toLowerCase()}`,
		);
		add.addEventListener('click', () => {
			status.textContent = `${noun} added`;
			// Blurred *before* the change is reported, which is what makes the
			// landing below possible: the view captures focus by a control's index
			// inside the cell, and a new record's controls sit before this button,
			// so an index restore would land on the new record's chevron. With focus
			// off the sheet there is nothing for the view to restore, and this
			// component's own next render puts it where the reader needs it.
			add.blur();
			awaitingAdd = { id: config.id, held: records.length };
			// Named rather than blank: a `### ` with nothing after it is not a
			// heading, so a nameless record would not survive its own first read.
			context.onChange({ records: {}, added: [{ name: noun }] });
		});

		if (landing) {
			const field = nameFields[nameFields.length - 1];
			field?.focus();
			// Selected as well as focused, because the name the add control wrote is
			// a placeholder the reader is expected to type over.
			field?.select();
		}

		/** One record: its summary line, its body, and the controls on both. */
		function drawRecord(record: RecordEntry, at: number): void {
			const named = recordLabel(record.name, noun);
			const row = element('div', 'sheetsmith-record', list);
			const summary = element('div', 'sheetsmith-record-summary', row);

			/*
			 * The body, built before the chevron that reads it. A closed body is
			 * `hidden="until-found"`, which is the one place this component can do
			 * what Tab set had to give up: that spelling runs on
			 * `content-visibility: hidden`, so the content leaves layout — and a
			 * record body contributing no height changes nothing, because the box is
			 * fixed and the list scrolls inside it.
			 */
			const bodyEl = element('div', 'sheetsmith-record-body', row);
			bodyEl.id = `sheetsmith-record-${config.id}-${at}`;

			const chevron = element('button', 'sheetsmith-record-disclosure', summary);
			chevron.type = 'button';
			chevron.setAttribute('aria-controls', bodyEl.id);

			let open = opened.has(at);
			const paintDisclosure = (): void => {
				chevron.replaceChildren();
				setIcon(chevron, open ? OPEN_ICON : CLOSED_ICON);
				chevron.setAttribute('aria-expanded', String(open));
				const said = open ? `Close ${named}` : `Open ${named}`;
				chevron.setAttribute('aria-label', said);
				chevron.setAttribute('title', said);
				// The attribute's *value*, not the boolean: `until-found` is what
				// keeps find-in-page able to reach a closed body and reveal it.
				if (open) bodyEl.removeAttribute('hidden');
				else bodyEl.setAttribute('hidden', 'until-found');
			};
			const setOpen = (next: boolean): void => {
				if (next === open) return;
				open = next;
				// Painted before reporting, because nothing here reaches the note: no
				// write means no rebuild, so a control waiting for one would never
				// answer the press at all (PATTERNS §5).
				paintDisclosure();
				context.onToggleRecord?.(at, open);
			};
			chevron.addEventListener('click', () => setOpen(!open));
			// The browser found the text inside a closed body, so the component
			// agrees it is open. happy-dom implements neither the attribute nor the
			// event, so a test asserts the wiring and the harness cannot photograph
			// it — the same bargain `visibility`/`inert` took on Tab set.
			bodyEl.addEventListener('beforematch', () => setOpen(true));

			drawName(summary, record, at, named);

			const fieldRow = element('div', 'sheetsmith-record-fields', summary);
			if (record.error === null) {
				fields.forEach((field, index) => {
					drawField(fieldRow, row, field, index, record, at, named);
				});
			}

			drawRemove(summary, row, at, named);

			if (record.error !== null) {
				element('div', 'sheetsmith-error', row, record.error);
			}

			drawBody(bodyEl, row, record, at, named);
			paintDisclosure();
		}

		/**
		 * The record's name: a field over a rendered layer in one grid cell, which
		 * is `docs/UI.md` §9's stacked arrangement. Editing shows the raw
		 * `[[Sunblade|sword]]`, exactly as a cell does.
		 *
		 * A record whose fence will not read gets the display alone. Its bytes have
		 * to survive and every write into it is refused at the file boundary, so a
		 * field there would be a gesture that does nothing.
		 */
		function drawName(
			into: HTMLElement,
			record: RecordEntry,
			at: number,
			named: string,
		): void {
			const cell = element('div', 'sheetsmith-record-name', into);
			if (record.error !== null) {
				cell.classList.add('sheetsmith-record-name-plain');
				paintLinkedText(cell, record.name, {
					link: context.link,
					clipping: NAME_CLIPPING,
				});
				return;
			}
			const input = nameField(cell, record.name);
			input.type = 'text';
			input.value = record.name;
			// The noun alone, where every other control is named for its record as
			// well: this field's *value* is the record's name, so qualifying it would
			// announce the same word twice.
			input.setAttribute('aria-label', noun);
			nameFields.push(input);
			const handle = bindEditable(input, {
				initial: record.name,
				announceCommit: (next) => {
					status.textContent = `${noun} ${next}`;
				},
				announceRestore: (restored) => {
					status.textContent = `${noun} restored to ${restored}`;
				},
				onCommit: (next) => {
					if (next.trim() === '') {
						/*
						 * **A record needs a name, and this is where that is enforced.**
						 * `### ` with nothing after it is not a heading, so an empty name
						 * would drop the record on the next read and hand its body to the
						 * record above it — a silent deletion, which Constraint 4 refuses.
						 *
						 * **This is the repository's one refused commit that discards the
						 * draft, and it departs from `editable.ts`'s stated policy on
						 * purpose.** That binding's `refuse` keeps the draft, because a
						 * refusal that hid what the reader typed would be the silent loss
						 * it exists to stop — and this field is the case where keeping it
						 * is worse: the draft is *empty*, so keeping it leaves a blank
						 * field with a message beside it where the name that is actually
						 * stored would say more. It is also not a "do not write this" but
						 * a "put the stored one back and say so", which is why it is here
						 * rather than in `refuse` at all. Named here because
						 * `docs/PATTERNS.md` §11 held a row asking exactly that this
						 * departure be stated somewhere.
						 */
						handle.sync(record.name);
						status.textContent = `A ${noun.toLowerCase()} needs a name, so "${named}" was kept.`;
						return;
					}
					context.onChange({ records: { [at]: { name: next } } });
				},
			});
		}

		/**
		 * A field over a rendered layer, where the name holds a wikilink.
		 *
		 * A name with no link gets the field alone — no wrapper, no layer, the same
		 * DOM a forty-record list has always had.
		 */
		function nameField(cell: HTMLElement, raw: string): HTMLInputElement {
			if (!hasLink(raw)) {
				return element('input', 'sheetsmith-record-name-input', cell);
			}
			const stack = element('div', 'sheetsmith-record-linked', cell);
			const input = element('input', 'sheetsmith-record-name-input', stack);
			// This branch is the stacked one: unfocused, the field's text is
			// transparent under the link layer, and its spelling marks would not be.
			spellcheckWhileFocused(input);
			const layer = element('div', 'sheetsmith-record-name-layer', stack);
			paintLinkedText(layer, raw, {
				link: context.link,
				clipping: NAME_CLIPPING,
			});
			revealWhenTruncated(layer);
			return input;
		}

		/** One field control, whichever kind the layout declared. */
		function drawField(
			into: HTMLElement,
			row: HTMLElement,
			field: RecordField,
			index: number,
			record: RecordEntry,
			at: number,
			named: string,
		): void {
			const type = fieldType(field);
			const raw = record.fields[field.key] ?? '';
			const name = fieldLabel(field);
			const accessible = `${named} ${name}`;
			const cell = element(
				'div',
				`sheetsmith-record-field sheetsmith-record-field-${type}`,
				into,
			);
			const commit = (next: string): void => {
				context.onChange({
					records: { [at]: { fields: { [field.key]: next } } },
				});
			};

			if (type === 'computed') {
				drawComputed(cell, field, index, record, accessible);
				return;
			}
			if (type === 'modifier') {
				drawModifier(cell, row, field, record, at, named, commit);
				return;
			}
			if (type === 'level' || type === 'toggle') {
				drawRing(cell, field, raw, type === 'level', accessible, commit);
				return;
			}

			// A number, whose entry may carry its ceiling beside its value. Its name
			// is drawn beside it in the shared secondary clothes, because there is
			// no heading strip over a record's fields and a number with no word
			// beside it says nothing.
			element('span', 'sheetsmith-card-abbreviation', cell, name);
			const ownMax = recordsOwnMax(field);
			const entry = splitBounded(raw);
			const input = element('input', 'sheetsmith-record-input', cell);
			input.type = 'text';
			input.inputMode = 'numeric';
			input.value = entry.value;
			input.setAttribute('aria-label', accessible);
			/*
			 * **A ceiling is drawn beside the value, in Pool's own vocabulary
			 * rather than a second spelling of it.**
			 *
			 * `Uses 1` cannot tell a reader whether that is all of them or one of
			 * three, which undercuts the one thing this component has that a Track
			 * or a Pool beside the list could never do: a uses counter that belongs
			 * to a record the character added. So a bounded number reads
			 * `Uses 1 / 3`.
			 *
			 * The classes are `.sheetsmith-pool-ceiling`, `-separator` and `-max`,
			 * borrowed rather than copied under a `record` name — a lookalike beside
			 * them is the drift `docs/UI.md` §9 opens by forbidding, and §9's own
			 * rule is that the name belongs to the component that is nothing but the
			 * thing (a Pool is a value over its ceiling) and everyone else wears it,
			 * exactly as this field's name already wears the card's abbreviation.
			 * One declaration is overridden in the stylesheet, the size, because a
			 * pool's ceiling qualifies a headline number and a record's qualifies a
			 * 13px one.
			 *
			 * **Which of Pool's two branches is drawn is the layout's `maxSource`.**
			 * A field-owned `max` is a literal the layout declared, so there is
			 * nothing to type into — a read-only span, no placeholder, and no
			 * `aria-label` for Pool's own reason: a bare span is `role=generic`,
			 * which prohibits naming, and what carries it to a screen reader is the
			 * announcement below ("5 of 9", which is how the slash is read aloud).
			 * A record-owned ceiling is a number the character holds, so it is a
			 * field with the same `—` placeholder Pool uses — which is also the only
			 * invitation to type — drawn on *every* record whether or not one is
			 * set, because otherwise there is nothing to type into.
			 *
			 * **`.sheetsmith-pool-max-input` is deliberately not borrowed**, and
			 * that is not a contradiction of "reuse Pool's vocabulary". That class
			 * is the *pool card's* field chrome, sized in `ch` against the card's
			 * value size with its own hover and focus. Two fields on one summary
			 * line answering a hover two different ways is exactly the defect §9's
			 * "reuse rather than a lookalike" rule exists to prevent, and here the
			 * lookalike would be the pool's treatment sitting next to the record's.
			 * So the ceiling wears the record's field chrome and the pool's
			 * *reading*: `.sheetsmith-record-input` and `.sheetsmith-pool-max`
			 * together, with one stylesheet rule putting the muted colour back and
			 * narrowing it, since a ceiling is one or two digits where a value may
			 * be three.
			 */
			/**
			 * The entry as this field last wrote it, rather than as the render read
			 * it.
			 *
			 * **Both halves rebuild the whole entry, so a snapshot is not enough.**
			 * `docs/PATTERNS.md` §7 is about reporting a delta rather than a
			 * snapshot so a commit racing a rebuild cannot write back a stale
			 * sibling — the delta *is* right here, one field of one record, and the
			 * staleness moved one level in: a write is asynchronous, so a reader who
			 * leaves the value and then the ceiling commits both out of one render,
			 * and a second commit composed from `raw` puts the first half back to
			 * what the note said before either.
			 */
			let held = raw;

			let ceilingInput: HTMLInputElement | null = null;
			if (ownMax || field.max !== undefined) {
				const ceiling = element('span', 'sheetsmith-pool-ceiling', cell);
				element('span', 'sheetsmith-pool-separator', ceiling, '/');
				if (ownMax) {
					// `maxInput`, which is Pool's own name for the same control — and
					// deliberately not `held`, which is the mutable entry above and the
					// state every commit on this line composes from.
					const maxInput = element(
						'input',
						'sheetsmith-record-input sheetsmith-pool-max',
						ceiling,
					);
					maxInput.type = 'text';
					maxInput.inputMode = 'numeric';
					maxInput.value = entry.ceiling ?? '';
					maxInput.placeholder = '—';
					// **The one thing the field gains that the span could not have.** A
					// bare span prohibits naming, so the read-only ceiling reaches a
					// screen reader only through the field's announcement; an input is
					// nameable, and both channels are kept rather than traded.
					maxInput.setAttribute('aria-label', `${accessible} maximum`);
					maxInput.title = `Maximum ${name}, held by this ${noun.toLowerCase()}.`;
					ceilingInput = maxInput;
				} else {
					element('span', 'sheetsmith-pool-max', ceiling, String(field.max));
				}
			}

			/**
			 * The ceiling the value is read against as it stands, or null where
			 * there is none — the *draft* where one is being typed, which is Pool's
			 * own rule: what the value is announced against and held to is what the
			 * reader can see.
			 *
			 * **This says which text; `ceilingOf` says what it is worth**, and every
			 * channel on this line goes through both. The announcement used to take
			 * the raw text where the clamp parsed it, so a record storing
			 * `Uses: 2 / lots` clamped to nothing and was skipped by `full` —
			 * correctly, since text that is not a number behaves as no ceiling — and
			 * *still* announced "Uses 40 of lots". The one channel that was wrong is
			 * the only one a reader who cannot see the field has.
			 */
			const ceilingNow = (): number | null =>
				ceilingOf(
					ownMax
						? (ceilingInput?.value ?? '')
						: field.max === undefined
							? ''
							: String(field.max),
				);
			/** "of 3", or nothing at all where this record has no ceiling. */
			const said = (): string => {
				const ceiling = ceilingNow();
				return ceiling === null ? '' : ` of ${ceiling}`;
			};
			/** The bounds the value is held to, against that same standing ceiling. */
			const valueBounds = (): TypedField => {
				if (!ownMax) return field;
				const ceiling = ceilingNow();
				return ceiling === null
					? { type: 'number', min: field.min }
					: { type: 'number', min: field.min, max: ceiling };
			};

			const showValueRefusal = refusalNotice(row);
			bindEditable(input, {
				initial: entry.value,
				step: true,
				min: field.min,
				/*
				 * **Read on every step rather than captured at bind**, because the
				 * ceiling can move under this field while every other channel here
				 * already follows it. `clamp` reads these off the options object each
				 * time it runs, so a getter is all it takes.
				 *
				 * **Two states make the difference reachable, and neither is "a
				 * ceiling raised but not yet left".** That one cannot happen: the
				 * arrows need focus in *this* field, and moving focus here blurs the
				 * ceiling, which commits it. What is reachable is (1) a ceiling draft
				 * holding a note reference, which the refusal above *keeps* by design,
				 * so it is on screen while `valueBounds` correctly reads it as no
				 * ceiling; and (2) the moment after any ceiling commit, because the
				 * commit is reported synchronously and the write is not — until the
				 * rebuild lands, the ceiling on screen is the new one and a captured
				 * bound is the old one. That second window is the same one `held`
				 * above exists for.
				 */
				get max() {
					return ceilingNow() ?? undefined;
				},
				announceCommit: (next) => {
					status.textContent =
						next === ''
							? `${accessible} cleared`
							: `${accessible} ${next}${said()}`;
				},
				announceRestore: (restored) => {
					status.textContent =
						restored === ''
							? `${accessible} restored to empty`
							: `${accessible} restored to ${restored}${said()}`;
				},
				refuse: refuseNumber,
				onRefusal: showValueRefusal,
				onCommit: (next) => {
					// Bounds hold however the value arrived: a uses counter typed past
					// its ceiling is the same mistake as one stepped there, and the
					// ceiling is the record's own where the layout says so.
					const settled = boundedText(next, valueBounds());
					if (settled !== next) {
						input.value = settled;
						status.textContent = `${accessible} held to ${settled}${said()}`;
					}
					// Written back into the entry as this field last left it, so the
					// ceiling beside it survives with its own spelling of the slash —
					// and survives a ceiling edit this render already reported.
					held = withValue(held, settled);
					commit(held);
				},
			});

			if (ceilingInput === null) return;
			const ceilingName = `${accessible} maximum`;
			const showCeilingRefusal = refusalNotice(row);
			bindEditable(ceilingInput, {
				initial: entry.ceiling ?? '',
				step: true,
				// **Held to the field's `min` and to nothing else.** A ceiling under
				// the floor describes a range no value can occupy, and the value
				// beside it is already clamped to that same floor — one line must not
				// hold a floor the value obeys and the ceiling contradicts. There is
				// no upper bound on a ceiling to hold it to.
				min: field.min,
				// **No arithmetic**, and this is a departure from Pool stated rather
				// than hidden: a record's *value* field does not settle `31+7`, so
				// giving the ceiling beside it arithmetic would put two commit rules
				// on one line. If it is ever wanted it arrives on both halves at once.
				announceCommit: (next) => {
					status.textContent =
						next === ''
							? `${ceilingName} cleared`
							: `${ceilingName} ${next}`;
				},
				announceRestore: (restored) => {
					status.textContent =
						restored === ''
							? `${ceilingName} restored to empty`
							: `${ceilingName} restored to ${restored}`;
				},
				refuse: refuseNumber,
				onRefusal: showCeilingRefusal,
				onCommit: (next) => {
					const settled = boundedText(next, { type: 'number', min: field.min });
					if (settled !== next) {
						ceilingInput.value = settled;
						status.textContent = `${ceilingName} held to ${settled}`;
					}
					// **Only the ceiling.** Lowering one under the value does not
					// rewrite the value: `5 / 3` is drawn as it is stored, which is the
					// standing rule to render rather than correct — the alternative is
					// a write the reader did not ask for on the press of another field.
					// And clearing it drops the separator with it, so the entry goes
					// back to a bare number rather than to `2 /`.
					held = withCeiling(held, settled);
					commit(held);
				},
			});
		}

		/**
		 * A computed field: read-only, with its formula one hover or one tap away.
		 *
		 * **No modifier mark**, and that is a consequence rather than an omission:
		 * a mark says something has been pushed at *this* number, and a record
		 * publishes no name for anything to push at. `modifier-breakdown.ts` states
		 * the rule this follows — the mark and the text are the same fact, so a
		 * mark promising an answer that cannot exist is worse than none.
		 */
		function drawComputed(
			cell: HTMLElement,
			field: RecordField,
			index: number,
			record: RecordEntry,
			accessible: string,
		): void {
			const value = element('div', 'sheetsmith-record-value', cell);
			const scope: Record<string, FieldValue> = {};
			for (const other of fields) {
				if (fieldType(other) === 'computed') continue;
				// The value half, as `recordValues` does: `3 - Uses` reads `2` from an
				// entry that says `2 / 3`.
				scope[other.key] = typedValue(
					other,
					storedValue(other, record.fields[other.key]),
				);
			}
			const resolved =
				field.formula === undefined
					? null
					: context.resolveField(`fields.${index}.formula`, scope);
			// Nothing to compute is an empty field, not a value that failed: "?" is
			// reserved for one that is present and did not resolve, and "—" is what
			// empty reads as everywhere else on a sheet.
			value.textContent =
				field.formula === undefined
					? '—'
					: formatComputed(resolved, field.signed === true);
			value.classList.toggle(
				'sheetsmith-record-unresolved',
				field.formula !== undefined && resolved === null,
			);
			if (field.formula !== undefined) {
				// SPEC §4.2: hovering a computed value reveals the formula behind it.
				// Where it failed, which name it could not find is the useful half,
				// because that is the one the reader can go and define.
				const said =
					resolved === null
						? (context.explainField?.(`fields.${index}.formula`, scope) ??
							'The formula did not resolve.')
						: field.formula;
				value.setAttribute('title', said);
				/*
				 * **And a press, because a `title` is a pointer's route and not a
				 * finger's.** A read-only value has no other use for a tap, so the tap
				 * is free to mean "why this number?" — which is Table's own argument
				 * for the same cell, and without it a record's formula *and its
				 * failure explanation* were unreachable on a phone: §7 of
				 * `docs/UI.md` forbids a hover-only affordance, and this was one.
				 * The shared popover rather than a surface of this component's own.
				 */
				value.classList.add('sheetsmith-record-askable');
				value.addEventListener('click', () => showPopover(value, said));
			}
			// A read-only value is not a tab stop and has no name of its own, so the
			// field's name rides beside it for a reader who cannot see the summary
			// line — the idiom a hidden column heading already uses.
			element('span', 'sheetsmith-sr-only', cell, accessible);
		}

		/** A level or a toggle, through the one painter both share. */
		function drawRing(
			cell: HTMLElement,
			field: RecordField,
			raw: string,
			graded: boolean,
			accessible: string,
			commit: (next: string) => void,
		): void {
			const count = graded ? levelCount(field) : 1;
			let current = graded ? levelOf(field, raw) : isFlagSet(raw) ? 1 : 0;
			const stateOf = (level: number): string =>
				graded ? String(level) : flagText(level > 0);

			if (graded && field.input === 'select') {
				const select = element('select', 'sheetsmith-record-select', cell);
				for (let level = 0; level <= count; level++) {
					const option = element('option', '', select, levelName(field, level));
					option.value = String(level);
				}
				select.value = String(current);
				select.setAttribute('aria-label', accessible);
				select.addEventListener('change', () => {
					current = Number(select.value);
					commit(stateOf(current));
				});
				return;
			}

			const button = element('button', 'sheetsmith-level-ring', cell);
			button.type = 'button';
			// Two states is a toggle button and ARIA has a word for it; more than
			// two is not, so those carry their state in the name instead.
			const pressed = count === 1;
			const show = (): void => {
				// Everything a reader sees comes from the shared painter, so a ring on
				// a record and the same ring in a cell cannot measure differently
				// under one finger. What stays here is the naming.
				const name = levelName(field, current);
				paintLevelRing(button, field, current, graded);
				if (pressed) {
					button.setAttribute('aria-pressed', String(current > 0));
					button.setAttribute('aria-label', accessible);
				} else {
					button.setAttribute('aria-label', `${accessible}: ${name}`);
				}
				/*
				 * **Only a named level earns a tooltip**, which is Table's and
				 * Track's rule and was the one place this third copy diverged: it
				 * set `title` unconditionally to the accessible name, so a toggle in
				 * a table row had no tooltip and the identical toggle in a record set
				 * had one repeating what a reader could already hear. A tooltip that
				 * repeats what is legible is noise fired at every pass, as the card's
				 * label learned — and every named level *is* an abbreviation, an
				 * initial or a mark of the layout's own, where an unnamed one shows
				 * the number that is already the whole answer.
				 */
				/*
				 * **What the tooltip carries is not what Table's carries, and the
				 * difference is the heading strip.** Table and Track set a `title`
				 * only for a *named level*, on the argument that a tooltip repeating
				 * legible text is noise — and in a cell that is right, because the
				 * field's own name is already in a `<th>` over the column and only the
				 * level's word is missing. A record has no `<th>`. Here the missing
				 * word is the *field's own name*, and it is missing on a `toggle` as
				 * much as on a `level`: a reader sees `Fireball · Level 3 · ●` and
				 * nothing on screen says the dot is "Prepared".
				 *
				 * So the tooltip is the accessible name, always, and a *named* level
				 * adds its own word to it. Which is a change from the copy that
				 * shipped in two ways: it is set on a toggle as well, and it names the
				 * field rather than only the level.
				 */
				button.setAttribute(
					'title',
					graded && field.levels !== undefined
						? `${accessible}: ${name}`
						: accessible,
				);
			};
			const setLevel = (next: number): void => {
				if (next === current) return;
				current = next;
				show();
				commit(stateOf(current));
			};
			/*
			 * **The touch route to the word the ring is not showing**, and it is bound
			 * on every ring this component draws rather than on Table's named-level
			 * predicate. `title` is a pointer's route and UI §7 forbids a hover-only
			 * affordance: what a reader of a record sees is `Fireball · Level 3 · ●`,
			 * and the only thing that says the dot is "Prepared" is the tooltip. Table
			 * guards this on a *named level* because a cell's field is already named by
			 * its `<th>`; a record has none, so the guard that is right there would
			 * leave the shipping case — every ring on the sample sheet is a toggle —
			 * with no route at all. It is the shape the `computed` field already has:
			 * hover reveals, a tap opens the same text.
			 */
			const longPressed = bindLongPress(
				button,
				() => button.getAttribute('title'),
			);
			// Clicking cycles and wraps, so one control reaches every level and
			// returns to none; the arrows step without wrapping.
			button.addEventListener('click', () => {
				// The press that opened the bubble ends in a click, and it did not
				// mean "change the level".
				if (longPressed()) return;
				setLevel(current === count ? 0 : current + 1);
			});
			button.addEventListener('keydown', (event) => {
				const step =
					event.key === 'ArrowRight' || event.key === 'ArrowUp'
						? 1
						: event.key === 'ArrowLeft' || event.key === 'ArrowDown'
							? -1
							: 0;
				if (step === 0) return;
				event.preventDefault();
				setLevel(Math.max(0, Math.min(count, current + step)));
			});
			show();
		}

		/**
		 * The modifier field: one glyph per record, opening the shared form.
		 *
		 * `ui/anchored-panel.ts` and `components/modifier-form.ts` are reused whole
		 * — the form takes its label, parts, outcomes, definitions, targets and
		 * bonus types as arguments, so it knows nothing about a table and nothing
		 * about a record. That is the claim its own header makes about knowing the
		 * shape of a modifier and none of its meaning, tested by a second consumer.
		 */
		function drawModifier(
			cell: HTMLElement,
			/** The record's own element, where a refused commit hangs its message. */
			recordEl: HTMLElement,
			field: RecordField,
			record: RecordEntry,
			at: number,
			named: string,
			commit: (next: string) => void,
		): void {
			const raw = record.fields[field.key] ?? '';
			const button = element('button', 'sheetsmith-record-modifier', cell);
			button.type = 'button';
			const glyph = element('span', 'sheetsmith-record-modifier-glyph', button);
			glyph.setAttribute('aria-hidden', 'true');

			// The stored list is what the form addresses, so every index is an index
			// into the note; the collapsed list is what the record is *doing*, so the
			// glyph and its count agree with the arithmetic.
			const stored = storedParts(raw);
			const enrolled = cellParts(raw);
			/** Built once per record, however many parts the field holds. */
			let values: RowValues | null = null;
			const ask = (part: string) =>
				context.modifiers?.outcome(
					part,
					(values ??= recordValues(config, record, context.resolveField)),
				) ?? null;
			const applied = rowModifiers(enrolled, ask);
			const applying = applied.filter((one) => one.outcome?.applies === true)
				.length;
			if (enrolled.length === 0) {
				cell.classList.add('sheetsmith-record-modifier-empty');
			}
			// Three shapes for four states, because docs/UI.md §6 refuses a mark
			// whose only channel is fill strength: a faint `plus` on an empty field,
			// `zap` where any part applies, `zap-off` where none does.
			setIcon(
				glyph,
				enrolled.length === 0 ? 'plus' : applying > 0 ? 'zap' : 'zap-off',
			);
			button.setAttribute(
				'aria-label',
				modifierRowName(`${named} ${fieldLabel(field)}`, applied),
			);
			const said = modifierRowText(applied);
			if (said !== null) button.setAttribute('title', said);
			button.setAttribute('aria-haspopup', 'dialog');
			button.setAttribute('aria-expanded', 'false');

			/** What identifies this panel across a rebuild of the list. */
			const panelKey = `${config.id}:${at}:${field.key}`;

			/** The standing refusal, drawn under the record and cleared when it lifts. */
			const showRefusal = refusalNotice(recordEl);

			/**
			 * Commit the cell, unless a part of it holds a note reference.
			 *
			 * **A `modifier` field's part is free text on three routes**: the shared
			 * form's **Amount** and **Only when** inputs, and a promoted
			 * definition's name, whose only refusals are a semicolon and an
			 * assignment shape. So `armour_class += [[Ring]]` was an acceptable
			 * part, and this component's fence is where it landed. `refuseLink`
			 * above holds the sentence and the argument.
			 */
			const commitParts = (parts: readonly string[]): void => {
				/*
				 * **The part being *written*, which is the part that is not already
				 * stored.** The form hands back the whole list with one entry changed,
				 * so "the part being written" is the one this cell does not already
				 * hold — and a part identical to a stored one is carried, byte for
				 * byte, exactly as `spellParts`' own contract promises.
				 *
				 * Tested over the joined cell, or over every part, a record whose note
				 * already reads `Modifiers: armour_class += 1; [[Ring]]` — reachable by
				 * hand, which §10 requires be carried — refused *every* commit from the
				 * form, including edits to the other part, whose only way out was
				 * deleting the link. That is this refusal's own "rendered and carried
				 * rather than corrected" claim broken by the refusal: rendering a state
				 * is not carrying it if nothing else on the record can be edited.
				 */
				const held = new Set(stored);
				const offending = parts.find(
					(part) => !held.has(part) && refuseLink(part) !== null,
				);
				const said = offending === undefined ? null : refusal(offending);
				// Called on every attempt including the ones that succeed, so the last
				// message clears without this tracking when to.
				showRefusal(said);
				if (said !== null) return;
				commit(spellParts(parts));
			};

			const fill = (panel: AnchoredPanel<ModifierFormState>): void => {
				renderModifierForm(panel.body, panel.state, {
					label: named,
					// The stored list, never the collapsed one: the form's indices are
					// indices into the note.
					parts: stored,
					outcome: ask,
					definitions: context.modifiers?.definitions ?? [],
					targets: context.modifiers?.targets ?? [],
					published: context.modifiers?.published ?? [],
					bonusTypes: context.modifiers?.bonusTypes ?? [],
					// The one import from `obsidian` in this folder, passed on rather
					// than taken again: the allowlist stays one name long.
					icon: (into, name) => setIcon(into, name),
					onCommit: commitParts,
					/*
					 * **Refused here, before the layout is written**, which is where
					 * the ordering had it wrong: the form checks `unspellableName`,
					 * which refuses only a semicolon and an assignment shape, then
					 * awaits this — so a `[[…]]` name reached the layout file, the
					 * reader was told "Saved" and *then* the cell rewrite was declined
					 * on the same name. The layout kept a definition it should never
					 * have gained. A wrapper rather than a rule inside
					 * `unspellableName`, because that predicate is Table's too and a
					 * link in a *markdown cell* is a working link — this refusal is
					 * about the fence, which is this component's alone.
					 */
					onPromote: (name, effect) => {
						const refused = refuseLink(name);
						if (refused !== null) {
							// Returned rather than announced, so the form draws it in its
							// own problem line, beside the field the name is typed in.
							return Promise.resolve({ error: refused });
						}
						return (
							context.modifiers?.promote(name, effect) ??
							Promise.resolve({
								error: 'This sheet cannot save a modifier to its layout.',
							})
						);
					},
					announce: (text) => {
						status.textContent = text;
					},
					onResize: () => panel.place(),
				});
				panel.place();
			};

			// The panel stays open across every commit: a commit re-renders the
			// sheet, so this button is a *new* button and the panel — which lives on
			// `document.body` — is handed to it with the reader's own posture intact.
			//
			// **Held in a `let` rather than read once**, because the panel this
			// render is handed and the panel this press opens are the same object to
			// the reader and two different values here: without it, a second press on
			// a glyph opened in *this* render would find a null handle and close
			// nothing, which is a control carrying `aria-expanded` that only answers
			// the attribute after a commit has rebuilt it.
			let standing = reanchorAnchoredPanel<ModifierFormState>(panelKey, button);
			if (standing !== null) {
				button.setAttribute('aria-expanded', 'true');
				fill(standing);
			}

			button.addEventListener('click', () => {
				if (openAnchoredPanelKey() === panelKey) {
					// A second press on the same glyph closes it, which is what a
					// control carrying `aria-expanded` owes.
					standing?.close();
					return;
				}
				const panel = showAnchoredPanel<ModifierFormState>(
					button,
					`Modifiers on "${named}"`,
					panelKey,
					modifierFormState(stored),
					() => {
						button.setAttribute('aria-expanded', 'false');
					},
				);
				standing = panel;
				button.setAttribute('aria-expanded', 'true');
				fill(panel);
				// Focus moves to the first control on open, which is the platform's
				// own contract for a dialog — unless the form has already placed it,
				// which it does on a record with no parts.
				if (!panel.body.contains(doc.activeElement)) focusFirstControl(panel);
			});
		}

		/**
		 * The record's prose, on Rich text's box gesture and its three stated
		 * departures: the rendered layer is hidden rather than left transparent,
		 * the caret is not placed from the click, and the two layers scroll
		 * separately.
		 *
		 * The one thing that differs is the box: Rich text's is the placement and
		 * this one is as tall as its prose, which is not a violation of "never
		 * sized by its content" — that rule is about the *component's* box, and
		 * this sits inside the scrollport.
		 */
		function drawBody(
			into: HTMLElement,
			row: HTMLElement,
			record: RecordEntry,
			at: number,
			named: string,
		): void {
			const text = record.body;
			if (record.error !== null) {
				// A record whose fence will not read still shows what it holds, and
				// shows it read-only: every write into it is refused at the file
				// boundary, so a field would be a gesture that does nothing.
				const shown = element('div', 'sheetsmith-record-body-rendered', into);
				paintProse(shown, text);
				return;
			}

			const input = element('textarea', 'sheetsmith-record-body-input', into);
			input.value = text;
			// The start, chosen, rather than the end, inherited: assigning `value`
			// moves the cursor to the end of the control and focusing scrolls it into
			// view, which is the one position in the text nobody asked for.
			input.setSelectionRange(0, 0);
			input.placeholder = `Write anything about this ${noun.toLowerCase()}.`;
			input.setAttribute('aria-label', `${named} body`);
			// Its text is transparent unfocused and the prose is drawn over it, so
			// its squiggles would be too.
			spellcheckWhileFocused(input);

			const rendered = element('div', 'sheetsmith-record-body-rendered', into);
			// The links the app draws, given this plugin's behaviour. Bound to the
			// layer once, before anything is painted into it: the fallback painter
			// wires each anchor as it makes it, and the app's renderer makes its own.
			adoptRenderedLinks(rendered, context.link);
			if (text !== '') {
				if (context.renderMarkdown !== undefined) {
					// And the fallback again where the app's renderer rejected, which is
					// not something the reader caused or can fix.
					context.renderMarkdown(text, rendered, () => paintProse(rendered, text));
				} else {
					paintProse(rendered, text);
				}
			}

			// The layer is the pointer target rather than `pointer-events: none`,
			// because it is what scrolls: a layer that is not a hit target never
			// receives a wheel, and the gesture would go to the invisible field
			// behind it. A link owns its own press, as everywhere else on the sheet.
			rendered.addEventListener('click', (event) => {
				const target = event.target;
				if (target instanceof HTMLElement && target.closest('a[href]')) return;
				event.preventDefault();
				// A drag that selected text is not a request to edit.
				const selection = doc.getSelection();
				if (selection !== null && !selection.isCollapsed) return;
				input.focus();
			});

			/** The standing refusal, drawn under the body and cleared when it lifts. */
			const showRefusal = refusalNotice(row);

			bindMultiline(input, {
				initial: text,
				/*
				 * The two reserved line starts, and both are the note format's rather
				 * than this component's taste: `## ` splits the *note* and `### `
				 * splits the *record*. Neither is escaped and neither fails `read` —
				 * the write is declined instead, the field keeps the draft, and the
				 * message names the line and the fix.
				 */
				refuse: (next) => {
					const section = startsSection(next);
					if (section !== null) {
						return `Not saved. "${section.trim()}" would start a new section in this note — use "#### " instead.`;
					}
					const record = startsRecord(next);
					if (record !== null) {
						return `Not saved. "${record.trim()}" would start a new ${noun.toLowerCase()} in this list — use "#### " instead.`;
					}
					return null;
				},
				/*
				 * **The draft is shown, not hidden, for as long as it is refused.**
				 * Unfocused, this field's text is transparent under the rendered
				 * layer, so a refusal left alone would put the *stored* prose back on
				 * screen with an error under it and the reader's actual words
				 * invisible. The class swaps that round, as Rich text's does.
				 */
				onRefusal: (message) => {
					into.classList.toggle('sheetsmith-record-body-refused', message !== null);
					// Under the body rather than inside it: the body is a two-layer
					// stack in one grid cell, so a third child there would sit on top
					// of the prose the message is about — which is why the host is the
					// shared helper's parameter rather than its own rule.
					showRefusal(message);
				},
				// The label and the outcome, never the prose: reading a record's text
				// back at its author is not feedback.
				announceCommit: (next) => {
					status.textContent = next === '' ? `${named} cleared` : `${named} saved`;
				},
				announceRestore: () => {
					status.textContent = `${named} restored`;
				},
				onCommit: (next) => {
					context.onChange({ records: { [at]: { body: next } } });
				},
			});
		}

		/**
		 * The delete control: **it arms, then commits.**
		 *
		 * §12's rule from the Pool's typed-amount reversal — where a control's
		 * input is not its outcome, the outcome has to be on screen before it is
		 * applied — and deletion is the strongest case of it there is. The shared
		 * confirmation is not available to reach for: `ConfirmModal` takes an `App`
		 * and `RenderContext` carries no route to one.
		 *
		 * Drawn on a record whose fence will not read as well, deliberately: it is
		 * the reader's one way out of a block nothing else on the sheet can touch.
		 */
		function drawRemove(
			into: HTMLElement,
			row: HTMLElement,
			at: number,
			named: string,
		): void {
			const button = element('button', 'sheetsmith-record-remove', into);
			button.type = 'button';
			// The app's own trash icon rather than a copy of it, which is what keeps
			// this following their icon set: the plugin's three other delete controls
			// are the same mark and the verb is the same verb.
			setIcon(button, REMOVE_ICON);
			// The gesture is `interaction/arm-to-confirm.ts`'s, shared with Table's
			// row delete — every line of it is a rule with a reason and three of
			// those reasons are invisible in review, so a second copy held only by
			// two suites driving their own is the one arrangement §1 refuses. The
			// class names, the live region and the write stay here.
			bindArmToConfirm({
				button,
				row,
				armedClass: 'sheetsmith-record-remove-armed',
				rowClass: 'sheetsmith-record-arming',
				named: `Delete ${named}`,
				announce: (said) => {
					status.textContent = said;
				},
				commit: () => {
					// The reader's posture moves with the list: everything open below
					// the record that is going shifts up by one.
					shiftOpen(at);
					context.onChange({ records: {}, removed: [at] });
				},
				register: armedRecord,
				doc,
			});
		}
	},
};
