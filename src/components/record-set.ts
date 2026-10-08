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
 *   hold one — a `text` field is refused as a configuration error unless it is
 *   the field the list is grouped by (`docs/features/free-text-group-key.md`),
 *   and the refusal is not a cut, since SPEC §5's language has no strings — and
 *   that is true of the *type* and false of the *input*. A `number` field is an
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
import {
	bindEditable,
	bindMultiline,
	keptRatherThanBlank,
} from '../interaction/editable';
import { armRegister, bindArmToConfirm } from '../interaction/arm-to-confirm';
import { splitBounded, withCeiling, withValue } from '../parse/bounded-entry';
import { fencedKeyProblem, readFenced, writeFenced } from '../parse/fenced';
import { bodyText, writeBodyText } from '../parse/markdown-body';
import { cellParts, spellParts, storedParts } from '../parse/modifier-cell';
import {
	GroupReading,
	groupMatchKey,
	groupRecords,
	OTHER_KEY,
	RecordGroup,
} from '../parse/record-groups';
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
import { conditionReads, heldCondition } from '../formula/field-condition';
import { expressionProblem } from '../formula/expression';
import { displayText, hasLink } from '../parse/wikilink';
import { formatDerived } from './card-face';
import { fencedLinkRefusal } from './fenced-link';
import {
	BODY_PLACEMENT,
	ColumnType,
	HOLDER_MAX_SOURCE,
	MaxSource,
	Placement,
} from './column-types';
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
	ExpressionExplainer,
	ExpressionResolver,
	FieldResolver,
	FieldValue,
	ModifierPush,
	ModifierSource,
	ReadResult,
	RESET_CONDITION_FIELD,
	ResetBinding,
	ResetColumn,
	ResetContext,
	ResetReach,
	ResetResult,
	RowsSource,
	RowValues,
	showsOwnLabel,
} from '../types';
import { levelCount, levelIndex, levelName, levelOf, parseLevel } from './level-ring';
import { FALLBACK_FIT_TIER, fitTier, type LineField } from './record-line-fit';
import { adoptRenderedLinks, paintLinkedText } from './linked-text';
import {
	ModifierFormState,
	modifierFormState,
	renderModifierForm,
} from './modifier-form';
import {
	applying,
	modifierRowName,
	modifierRowText,
	rowModifiers,
} from './modifier-breakdown';
import { bindRingControl } from './ring-control';
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
import { element } from '../ui/element';
import { showPopover } from '../ui/popover';
import { flagWhileFocused } from '../interaction/field-focus-flag';
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

/**
 * The largest field count the stylesheet tabulates a strip threshold for.
 *
 * A list with more fields than this takes the last entry, which is a residue
 * and not a case: a record with nine fields already wraps at any width today.
 *
 * Exported so `styles.test.ts` can hold the stylesheet's table to it: raising
 * this alone stamps a class no threshold rule answers, and the strip then never
 * draws for that count with nothing red to say so.
 */
export const MAX_TABULATED_FIELDS = 8;


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

/**
 * Which control of which record, in which list, the reader has just edited so
 * that the record regrouped, and the group it is now in.
 *
 * **`awaitingAdd`'s shape and for its reason.** Regrouping moves the record, so
 * the view's restore — which finds a control by its index among the cell's
 * controls — would name another record's control. The edit releases focus before
 * reporting, which makes the view's capture return null, and this says where the
 * landing goes. Armed only where focus was on the control and the record's group
 * actually changed, so a blur that committed while focus went elsewhere never
 * takes it back; and consumed only by a render in which that record is in the
 * group the edit named, so a write that never lands cannot leave it armed to
 * steal focus from some later render.
 */
let awaitingKeyEdit: {
	id: string;
	at: number;
	index: number;
	key: string;
} | null = null;

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
	 * rule: it promises nothing this component would have to deliver, and a
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

export interface RecordSetConfig extends ComponentConfig {
	type: 'record-set';
	recordName?: string;
	fields?: RecordField[];
	hideLabel?: boolean;
	/**
	 * Off unless asked for, and drawn only where there is something to name: a
	 * strip over an empty list would label nothing, so the list is exactly the
	 * unheaded one until it holds a record that read.
	 */
	fieldHeadings?: boolean;
	/**
	 * Display only: nothing in the note or in a formula knows it. Matched to a
	 * field's key trimmed and case-insensitively, as `write` matches a delta's
	 * keys, and a key that names nothing usable draws the list ungrouped with a
	 * line saying why rather than failing `read`.
	 */
	groupBy?: string;
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

/** Whether this field draws inside the opened record rather than on its summary line. */
function inBody(field: RecordField): boolean {
	return field.placement === BODY_PLACEMENT;
}

/**
 * The condition this component will evaluate for a field: its text, a
 * hand-written answer, or null where the field is simply always shown.
 *
 * **Null for a condition naming the field's own key**, which is the refusal:
 * a `Uses` shown when `Uses > 0` hits zero, vanishes under the cursor, and is
 * reachable again only through a reset. The editor reports it under the field's
 * **Shown when**; here it is not evaluated at, and it draws no problem line,
 * because it is a layout error rather than a condition that failed. The
 * predicate is `formula/field-condition.ts`'s, which the editor calls too.
 */
function honouredCondition(field: RecordField): string | boolean | null {
	const held = heldCondition(field.visibleWhen);
	if (typeof held === 'string' && conditionReads(held, field.key)) return null;
	return held;
}

/** What a record's field is called on the sheet. */
function fieldLabel(field: RecordField): string {
	return (field.name ?? '').trim() || field.key;
}

/**
 * A summary field as `record-line-fit.ts` sizes it: its kind as drawn, and the
 * words it draws that its width depends on.
 */
function lineFieldOf(field: RecordField): LineField {
	const type = fieldType(field);
	if (type === 'computed') return { kind: 'computed' };
	if (type === 'modifier' || type === 'toggle') return { kind: 'mark' };
	if (type === 'level') {
		if (field.input !== 'select') return { kind: 'mark' };
		const options: string[] = [];
		for (let level = 0; level <= levelCount(field); level++) {
			options.push(levelName(field, level));
		}
		return { kind: 'select', options };
	}
	if (type === 'text') return { kind: 'text', name: fieldLabel(field) };
	return {
		kind: 'number',
		name: fieldLabel(field),
		ceiling: recordsOwnMax(field)
			? 'typed'
			: field.max !== undefined
				? { fixed: String(field.max) }
				: 'none',
	};
}

/** Whether this field's ceiling belongs to each record rather than to the field. */
function recordsOwnMax(field: RecordField): boolean {
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
function storedValue(field: RecordField, raw: string | undefined): string {
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
function typedCeiling(text: string): number | null {
	const trimmed = text.trim();
	if (trimmed === '') return null;
	const value = Number(trimmed);
	return Number.isFinite(value) ? value : null;
}

/**
 * What a record's ceiling comes to: a number, `null` where nothing is there,
 * or why it cannot be worked out (`docs/features/record-ceiling-formula.md`).
 */
type Ceiling = number | null | { error: string };

/** The evaluator a ceiling is worked out with, as a host hands it over. */
interface CeilingReaders {
	resolveExpression?: ExpressionResolver;
	explainExpression?: ExpressionExplainer;
}

/** A sentence as the record's line ends it, whoever wrote it. */
function asSentence(text: string): string {
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
function ceilingOf(
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
function ceilingNumber(ceiling: Ceiling): number | null {
	return typeof ceiling === 'number' ? ceiling : null;
}

/** Why a ceiling cannot be worked out, or null where it can or is absent. */
function ceilingProblem(ceiling: Ceiling): string | null {
	return ceiling !== null && typeof ceiling === 'object' ? ceiling.error : null;
}

/**
 * The ceiling this record holds for this field, or null where it holds none —
 * and always null where the ceiling is the field's, whose half of an entry is
 * carried and never evaluated.
 */
function recordCeiling(
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
 * this component's side of the call, which is what keeps this feature out of
 * Table by construction.
 */
function fieldBounds(field: RecordField, ceiling: Ceiling): TypedField {
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
function skipsUnreadCeiling(
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
function skippedSentence(count: number, noun: string): string {
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
function recordLabel(name: string, noun: string): string {
	const shown = displayText(name).trim();
	return shown === '' ? `Unnamed ${noun.toLowerCase()}` : shown;
}

/**
 * Whether Group by names this field key: trimmed, case-insensitive, and never a
 * blank. **The one rule** `groupingOf` finds its field by and `configError`
 * decides whether a text field is the group key by, so a field cannot group the
 * list and also report "holds text" (or the reverse) after one of them changes.
 */
function namesKey(groupBy: string | undefined, key: string | undefined): boolean {
	const wanted = (groupBy ?? '').trim().toLowerCase();
	return wanted !== '' && wanted === (key ?? '').trim().toLowerCase();
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
 * **The default type is one of them unless it is the group key.** The columns
 * field leaves `type` out for its own default, which is `text`, so a field a
 * hand-edited layout left untyped reads as text and reports here until it is
 * named by Group by or retyped. The editor writes a new field's type out
 * (`list-fields.ts`), so a field added there is a number, not this error. The
 * message names every type this component offers, which is the fix.
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
		// Validated because the file format requires it, not because it is tidy:
		// the rule and its reason are the fence's own (`parse/fenced.ts`).
		const problem = fencedKeyProblem(key);
		if (problem !== null) return `The field "${key}" ${problem}.`;
		if (seen.has(key.toLowerCase())) {
			return `Two fields are both called "${key}".`;
		}
		seen.add(key.toLowerCase());
		if (fieldType(field) === 'text' && !namesKey(config.groupBy, key)) {
			// A text field has one job here, naming the group a record sits under;
			// anything else it could hold is prose, and prose belongs in the body.
			return `The field "${key}" holds text, which a list can hold only as the field it is grouped by. Set Group by to "${key}", or make it a number, level, toggle, computed or modifier field, or write the words in the ${noun}'s body instead.`;
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

/**
 * What `groupBy` makes of this list: the field it names, a sentence for why it
 * names none that can group, or null where the layout asks for no grouping.
 *
 * **A sentence and not a `configError`**, because a grouping that cannot be drawn
 * leaves a working list: `read` stays whole and the records draw ungrouped under
 * the line. The types it accepts are named here and only here, so a later key
 * type is one clause.
 */
function groupingOf(
	config: RecordSetConfig,
): { field: RecordField; index: number } | { problem: string } | null {
	const wanted = (config.groupBy ?? '').trim();
	if (wanted === '') return null;
	const fields = config.fields ?? [];
	const index = fields.findIndex((field) => namesKey(wanted, field.key));
	if (index === -1) {
		return {
			problem: `Group by is "${wanted}", and this list has no field with that key. The records are shown ungrouped. Name one of its fields in the layout editor, or clear Group by.`,
		};
	}
	const field = fields[index] as RecordField;
	const type = fieldType(field);
	if (type !== 'level' && type !== 'number' && type !== 'text') {
		return {
			problem: `Group by is "${wanted}", which is a ${type} field. Records can be grouped by a level, number or text field only. The records are shown ungrouped. Name one in the layout editor, or clear Group by.`,
		};
	}
	return { field, index };
}

/**
 * Which group a record's stored entry belongs to, or null where it belongs to
 * none and goes under Other.
 *
 * **The stored value, never a modifier-adjusted one, read the way a formula
 * reads it.** A number goes through `typedValue`, so `3`, `03` and ` 3.0 ` are
 * one group and `sum(spells, Level)` agrees with the header about what a record
 * is worth; text that is not a number has no value. A level is read as `levelOf`
 * reads it — blank and non-numeric are 0, the first name — **except that it is
 * not clamped**: an index that rounds outside the list has no name to sit under,
 * and filing it under the nearest one would put a record in a class it was never
 * given. A record whose fence will not read has no value at all.
 */
export function groupReading(
	field: RecordField,
	entry: Record<string, string>,
	error: string | null,
): GroupReading | null {
	if (error !== null) return null;
	const raw = storedValue(field, entry[field.key]);
	if (fieldType(field) === 'text') {
		// The match key groups and the first spelling heads, so retyping a capital
		// moves nothing. A blank value has no group, and `other` is Other's own.
		const key = groupMatchKey(raw);
		return key === '' ? null : { key, order: 0, label: raw.trim() };
	}
	if (fieldType(field) === 'number') {
		const value = typedValue(field, raw);
		return typeof value === 'number'
			? { key: String(value), order: value }
			: null;
	}
	const level = levelIndex(raw);
	if (level < 0 || level > levelCount(field)) return null;
	return { key: String(level), order: level };
}

/** What a group's header calls it. */
function groupName(
	field: RecordField,
	group: RecordGroup<RecordEntry>,
): string {
	const key = group.key;
	if (key === OTHER_KEY) return 'Other';
	// The first-seen spelling, never the match key: a header reads as typed.
	if (fieldType(field) === 'text') return group.label ?? key;
	if (fieldType(field) === 'level' && field.levels !== undefined) {
		return levelName(field, Number(key));
	}
	return `${fieldLabel(field)} ${key}`;
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
function storedLayer(
	config: RecordSetConfig,
	record: RecordEntry,
): Record<string, FieldValue> {
	const stored: Record<string, FieldValue> = {};
	for (const field of storedFields(config)) {
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
function recordValues(
	config: RecordSetConfig,
	record: RecordEntry,
	resolve: FieldResolver,
): RowValues {
	const stored = storedLayer(config, record);
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

/** Group names a sample text field cycles through, by record. */
const SAMPLE_GROUPS = ['Fighter', 'Wizard', 'Cleric'] as const;

/** The longest group name a player may type, in code points. */
const GROUP_NAME_LIMIT = 40;

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
		case 'text':
			// Two groups from the first two sample records, so the canvas draws a
			// grouped list the moment a text field is the key.
			return SAMPLE_GROUPS[record % SAMPLE_GROUPS.length] as string;
		case 'level':
			// A level is a flag with a ladder in it, so it answers both rules at
			// once: alternate records carry a level at all, and the level they
			// carry is partway up rather than at the top.
			return String(
				sampleFlag(record) ? samplePart(levelCount(field)) : 0,
			);
		// A modifier field is left empty, and that is the one rule here about
		// something other than looking plausible: a name in it enrols the record
		// in one of the *layout's* definitions, and a layout the author is still
		// building may declare none — so a sample that named one would put a
		// problem on screen the author did not cause. A computed field stores
		// nothing at all.
		default:
			return null;
	}
}

/**
 * What a binding naming no field needs before any record is looked at, or why
 * it cannot apply: `formula`'s one amount, resolved in sheet scope, and `full`'s
 * check that every field-owned ceiling exists. What each field is then written as
 * is `fieldWrite`'s, which the binding naming a field calls too.
 */
type ResetWrite =
	| { error: string }
	| {
			/** The amount `formula` writes; absent for `full` and `empty`. */
			amount?: number;
	  };

function resetWrite(
	config: RecordSetConfig,
	reset: ResetBinding,
	context: ResetContext,
): ResetWrite {
	if (reset.action === 'empty') {
		// Emptying needs nothing resolved: zero is zero whatever the ceiling is,
		// and a list whose ceilings are broken can still be spent.
		return {};
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
				error:
					context.explain('reset.to', {}) ??
					'its reset formula is empty.',
			};
		}
		const number = Number(value);
		if (!Number.isFinite(number)) {
			return {
				error: `its reset formula produced "${String(value)}", which is not a number.`,
			};
		}
		return { amount: number };
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
	 * **A record whose ceiling is a formula that will not work out is skipped the
	 * same way, and that one is counted** (`skipsUnreadCeiling`,
	 * `docs/features/record-ceiling-formula.md`): it is a counter the reader meant,
	 * so the confirmation and the report say how many, through the result's
	 * `skipped`. One record's broken `prfo` says nothing about another's `prof`,
	 * so it never fails the list — unlike `where` or a per-record `to`, each one
	 * statement by the author applied to every record.
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
	if (missing !== undefined) return { error: noMaximum(missing) };
	return {};
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
function fieldWrite(
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
function recordWrites(
	config: RecordSetConfig,
	record: RecordEntry,
	fields: readonly RecordField[],
	action: NonNullable<ResetBinding['action']>,
	amount: number | undefined,
	context: ResetContext,
): { fields: Record<string, string>; skipped: boolean } {
	const scope = storedLayer(config, record);
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
 * How many records something happened on, in the words a list's problem lines
 * use: `every feature` where it was all of the readable ones, else `1 feature`
 * or `2 features`.
 *
 * One spelling for the `visibleWhen` problem line and a reset's refusal, which
 * both count failed records against the readable ones (`docs/PATTERNS.md` §1's
 * one-step tier: two copies of a count's wording can only drift).
 */
function recordCount(count: number, readable: number, noun: string): string {
	if (count >= readable) return `every ${noun.toLowerCase()}`;
	return countOf(count, noun);
}

/**
 * `1 feature` or `2 features`: a count of records in the author's own word, for
 * every surface that counts them — the problem lines above, a reset's skipped
 * sentence and a group header's count.
 */
function countOf(count: number, noun: string): string {
	return `${count} ${noun.toLowerCase()}${count === 1 ? '' : 's'}`;
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
function admittedRecords(
	config: RecordSetConfig,
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
		const scope = storedLayer(config, record);
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
function failedOn(
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

/** Whether a field stores a value a reset trigger can restore. */
function restorable(field: RecordField): boolean {
	const type = fieldType(field);
	return type === 'number' || type === 'toggle';
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
function resetColumnsOf(config: RecordSetConfig): ResetColumn[] {
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
 * Why `full` cannot restore a field whose ceiling is the field's and missing.
 * One sentence for the binding naming the field and the binding naming none,
 * which both reach it.
 */
function noMaximum(field: RecordField): string {
	return `the field "${fieldLabel(field)}" has no maximum to restore to. Give it one, or set this trigger to empty.`;
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
function fieldReset(
	config: RecordSetConfig,
	records: readonly RecordEntry[],
	reset: ResetBinding & { action: NonNullable<ResetBinding['action']> },
	context: ResetContext,
): ResetResult<RecordSetData> {
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
			const layer = storedLayer(config, record);
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

	const next: RecordSetData = { records: {} };
	let skipped = 0;
	for (const [at, record] of reached) {
		const written = recordWrites(
			config,
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
function resetOutcome(
	config: RecordSetConfig,
	data: RecordSetData,
	reach: ResetReach | undefined,
	skipped: number,
): ResetResult<RecordSetData> {
	return {
		ok: true,
		data,
		...(reach === undefined ? {} : { reach }),
		...(skipped === 0
			? {}
			: { skipped: skippedSentence(skipped, recordNoun(config)) }),
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
	description: 'A list of named entries, each with a few typed fields and a paragraph of prose.',
	storage: 'markdown',
	// `*` stands for one path segment: every field's formula, and every field's
	// condition — declared so a paste rewrites an id a condition reads and the
	// resolver reaches it by the field's declared index. `reset.*.to` is the
	// reset expression, at the index of the binding being applied, and
	// `reset.*.where` the condition choosing which records it reaches: declaring
	// it is what says this component can check one, so the sheet hands it a
	// binding carrying one and the editor draws **Only where**.
	formulaFields: [
		'fields.*.formula',
		'fields.*.visibleWhen',
		'reset.*.to',
		RESET_CONDITION_FIELD,
	],
	configFields: [
		{
			key: 'recordName',
			kind: 'text',
			label: 'Record name',
			description:
				'What one record is called, e.g. "Spell". Names the add control at the foot of the card and the accessible name of a record\'s name field, and is the filler the layout editor previews with. Defaults to "Record".',
		},
		{
			key: 'fields',
			kind: 'columns',
			label: 'Fields',
			/*
			 * **What this component can hold, so a freshly added field is not an
			 * error.** The shared columns field is Table's shape: it offers every
			 * type and leaves the *shared* default — `text` — out of the file. This
			 * component holds text only as the group key, so a field stored with no
			 * type reads as text and is refused unless Group by names it. `number` is
			 * first and `text` last (appended, never inserted: the order decides the
			 * default), and the editor writes the first offered type out for a new
			 * field, so an author's first field is a number rather than that error,
			 * beside two checkboxes offering things the component also refuses.
			 */
			columnOptions: {
				types: ['number', 'toggle', 'level', 'computed', 'modifier', 'text'],
				total: false,
				publish: false,
				// A uses counter that belongs to a record the character added is
				// the one thing this component has that a Pool or a Track beside
				// the list could never provide, and a homebrew feature's number of
				// uses is the record's rather than the layout's. Table does not ask
				// for it, which is what keeps this feature out of Table.
				holderMax: true,
				// A body to move a field into is the other thing this component has
				// that a Table does not, so the same opt-in holds it out of Table.
				placement: true,
				// And a condition on a field, which only this component draws: a
				// Table draws every column on every row, so the editor reports a
				// condition there instead of offering the input.
				visibleWhen: true,
				// The strip is the component's, and a per-field hide would leave a
				// ring unnamed, which is what the strip is for. The *key* is still
				// read and still round-trips.
				hideHeading: false,
				// The editor's own words, so the one panel where an author reads about
				// their Record set does not describe it as cells and rows — which is
				// the vocabulary the model question freed the word "record" to end.
				unit: 'field',
				holder: 'record',
				// Where the value sits, which for a record *is* the field: Table needs
				// both words, since its entry is a column and its value is in a cell.
				cell: 'field',
				// What that column actually sets here: the word shown beside a
				// number when there is no strip, and over the field when there is.
				heading: 'Name',
			},
			// Unlike Table's and Roster's own `columns`, this one addresses a
			// fence entry rather than a markdown-table header — and the fence is
			// each record's own, which is why the shape is declared here and not
			// assumed by the editor (`types.ts`, `EntryAddress`;
			// `docs/features/component-rename-migration.md`).
			addressesEntry: { fence: 'record' },
			description:
				"The typed values every record holds, each an entry in that record's block in the note. Renaming a key moves that entry in every record, in every note on this layout. Text is offered for one job, naming the group a record sits under, and only on the field Group by names: it publishes nothing and no formula can read it, and words a reader reads belong in the record's body, where they may hold links. A number field with a maximum is a uses counter: the field draws that maximum beside its value, and a reset trigger restores it to that maximum. A number field's maximum may belong to the field, so every record shares it, or to each record, so a reader types it on the sheet beside the value, as a number or a formula such as prof, worked out from that record's own fields and the sheet. A formula follows the sheet, so a feature with proficiency-bonus uses refills to whatever the bonus is. A reset restores each record to whichever maximum applies, and leaves alone a record that has set none or whose formula cannot be worked out. Tick \"Inside the opened record\" for a value read once and changed rarely: it draws above the record's prose and is not shown while the record is closed. A field used every turn belongs on the summary line. Write a condition in \"Shown when\", such as Recharges == 1 || Recharges == 2, to draw a field only on the records where it holds. A hidden field keeps its value and still counts in every formula, modifier and reset, so a when clause reading a hidden toggle still applies. A level is read by its position, from 0 for the first name, so reordering a level's names changes what a condition reading it means.",
		},
		{
			key: 'groupBy',
			kind: 'text',
			label: 'Group by',
			description:
				'The key of one level, number or text field. Records are drawn under a collapsible header per value: a level in the order its names are written, a number from lowest to highest, and text alphabetically, matched without regard to case or surrounding spaces and headed by the first spelling in the note. A record with no value goes under Other. It changes how the list is drawn and nothing in the note, and a reset bound to this field will move records between groups. A level suits a closed set such as a class: its names are the layout\'s, so a name a player invents needs appending to its "Level names" here; set the field to a dropdown and tick "Inside the opened record", and name its first level for a record with no choice, such as Unassigned. A number suits a spell level and heads each group "Level 3". A text field lets a player invent a group on a character without editing this layout. Show the key field, since a record hidden from it by a condition still sits in its group. Blank draws the list ungrouped.',
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
		{
			key: 'fieldHeadings',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Field names over the list',
			description:
				'Names every field on screen, so a ring or toggle is not named only by its tooltip. Left out where the list is too narrow, so a narrow placement looks the same either way. A long field name widens its column; shorten it in the list above.',
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
			description: 'Spells the character adds, each with a level, a prepared flag and its text.',
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
			description: 'Features the character adds, each with uses, modifiers and its full text.',
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
				const value = sampleField(
					field,
					which,
					seed + which * fields.length + at,
				);
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
			const fields: Record<string, string> = Object.create(
				null,
			) as Record<string, string>;
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
					for (const part of cellParts(
						record.fields[field.key] ?? '',
					)) {
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
			storedFields(config).map((field) => [
				field.key.toLowerCase(),
				field.key,
			]),
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

	resetColumns(config): readonly ResetColumn[] {
		return resetColumnsOf(config);
	},

	// A binding naming no field is every field, which is what every Record set
	// binding meant before one could name a field, so every layout written then
	// means what it meant (`docs/features/record-set-reset-field-targeting.md`,
	// Part 2).
	resetWhole: 'Every field',

	/**
	 * Restore every record's counters (SPEC §6).
	 *
	 * **Where the binding names a field, that field alone**: `fieldReset` above,
	 * with `to` worked out on each record. What follows is the binding naming
	 * none, **Every field**, unchanged — every `number` and `toggle` field of each
	 * record reached, with `to` resolved once in sheet scope.
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
	 *
	 * **A binding's `where` narrows which records are reached, and nothing else**
	 * (`docs/features/record-set-reset-scope.md`): `admittedRecords` argues how it
	 * is evaluated and how it fails, and the reach it counts rides back on the
	 * result so the confirmation shows the number this evaluation produced.
	 * Here `to` is resolved once, in sheet scope: every `number` field of a
	 * reached record is written, so a per-record `Uses + 1` would land in a DC
	 * beside it — which is why a per-record amount is a binding that names its
	 * field.
	 */
	applyReset(data, config, reset, context): ResetResult<RecordSetData> {
		const next: RecordSetData = { records: {} };
		// A binding about the buffer alone, and this component declares none, so
		// there is nothing to do and nothing went wrong.
		const { action } = reset;
		if (action === undefined) return { ok: true, data: next };
		if (reset.column !== undefined) {
			return fieldReset(config, recordViews(data), { ...reset, action }, context);
		}
		// `to` first, once and in sheet scope, before any record is looked at: it
		// fails exactly as it failed before a binding could carry a condition.
		const write = resetWrite(config, reset, context);
		if ('error' in write) return { ok: false, error: write.error };
		const records = recordViews(data);
		const scope = admittedRecords(config, records, reset, context);
		if (scope !== null && 'error' in scope) {
			return { ok: false, error: scope.error };
		}
		let skipped = 0;
		records.forEach((record, at) => {
			if (record.error !== null) return;
			// A record the condition excludes is not in the delta at all, so its
			// bytes are identical after the press. **Records, and not fields**:
			// within a reached record every `number` field is written, which is
			// what a binding naming no field means.
			if (scope !== null && !scope.admitted.has(at)) return;
			const written = recordWrites(
				config,
				record,
				storedFields(config),
				action,
				write.amount,
				context,
			);
			if (written.skipped) skipped += 1;
			if (Object.keys(written.fields).length > 0) {
				next.records[at] = { fields: written.fields };
			}
		});
		return resetOutcome(config, next, scope?.reach, skipped);
	},

	render(container, config, data, context): void {
		const doc = container.ownerDocument;
		container.replaceChildren();

		const error = configError(config);
		if (error !== null) {
			// A misconfigured component reports on itself; SPEC §10 keeps the rest
			// of the sheet rendering and editable.
			element('div', 'sheetsmith-error', container, error);
			return;
		}

		const noun = recordNoun(config);
		const fields = config.fields ?? [];
		/**
		 * The fields the summary line draws, and so the only ones the strip names
		 * and the subgrid gives a track: a body field has no column, so counting it
		 * would put a heading over nothing or a hole in every record's line.
		 */
		const summaryFields = fields.filter((field) => !inBody(field));
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
		/** The position the new record was appended at, which is where it still is. */
		const landedAt = landing && awaitingAdd !== null ? awaitingAdd.held : -1;
		if (landing) awaitingAdd = null;

		/**
		 * How the list is grouped, if it is: the key field, or why it cannot be.
		 * Read once, so the groups, the problem line and the **Add** landing agree.
		 */
		const grouping = groupingOf(config);
		const groupField =
			grouping !== null && 'field' in grouping ? grouping : null;
		/**
		 * The groups the reader has collapsed. Clamped to nothing: a key the list
		 * no longer has is pruned below rather than filtered here, so the view's
		 * copy and this one agree after the render.
		 */
		const collapsedKeys = new Set(context.collapsedGroups ?? []);

		/**
		 * Whether this list draws the strip, and so whether it is a headed list at
		 * all.
		 *
		 * **The stamps below follow the strip and not the flag**, so a list with
		 * nothing to name is the unheaded list to the byte: no wrapper, no class,
		 * no custom property. The strip appears with the first record that read
		 * and goes with the last, which is what a label over nothing would not do.
		 */
		const headed =
			config.fieldHeadings === true &&
			summaryFields.length > 0 &&
			records.some((record) => record.error === null);

		/**
		 * How many fields the summary line declares, clamped to the strip's
		 * threshold table, which a headed list wears as `-fields-N`.
		 */
		const lineCount = Math.min(summaryFields.length, MAX_TABULATED_FIELDS);
		/**
		 * The width the summary line fits on one row at, in steps of 16px:
		 * `sheet.css` stacks the record (name and delete on a row, the
		 * fields under the name) below it (`docs/features/record-set-stacking-tiers.md`).
		 * Stamped on **every** list, headed or not, from every declared summary
		 * field, a hidden one included, because a record can draw them all.
		 */
		const tier = fitTier(summaryFields.map(lineFieldOf));
		const block = element(
			'div',
			(headed
				? `sheetsmith-placed sheetsmith-record-set sheetsmith-record-set-headed sheetsmith-record-set-fields-${lineCount}`
				: 'sheetsmith-placed sheetsmith-record-set') +
				` sheetsmith-record-set-fit-${tier}` +
				// The fallback 320px rule's opt-out: a line that fits by 320px
				// must not be stacked up to it (the rule's own comment).
				(tier < FALLBACK_FIT_TIER ? ' sheetsmith-record-set-fits-narrow' : ''),
			container,
		);
		// The true count, for the shared tracks; the class above is only the
		// clamped one the threshold table is keyed on.
		if (headed) {
			block.style.setProperty(
				'--sheetsmith-record-fields',
				String(summaryFields.length),
			);
		}
		// The placement, handed to CSS as the box's own floor: the box is `height`
		// grid rows tall whatever is in it and the list scrolls inside it, so
		// opening a record moves nothing on the sheet (SPEC §8).
		block.style.setProperty(
			'--sheetsmith-rows',
			String(config.position.height),
		);

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
		// The scroll area and the add control are the box's two children, so the
		// control sits at the box's foot and never scrolls (see where it is drawn,
		// below). The list is out of flow inside its wrapper, so nothing in it
		// contributes intrinsic height and the box cannot be grown past its
		// placement by a long list or a long body.
		const scroll = element('div', 'sheetsmith-record-set-scroll', box);
		const list = element('div', 'sheetsmith-record-set-list', scroll);
		if (headed) {
			/*
			 * **Aria-hidden, and no table role anywhere.** Every control already
			 * announces its record and its field, so a strip read aloud would be a
			 * second sighting of names each control says, with no relationship to
			 * say which record it belongs to — and a `columnheader` would hand
			 * assistive tech the tabular reading this component declines.
			 */
			const strip = element('div', 'sheetsmith-record-strip', list);
			strip.setAttribute('aria-hidden', 'true');
			for (const field of summaryFields) {
				element(
					'span',
					fieldType(field) === 'text'
						? 'sheetsmith-card-abbreviation sheetsmith-record-strip-text'
						: 'sheetsmith-card-abbreviation',
					strip,
					fieldLabel(field),
				);
			}
		}
		/**
		 * Where the records and the add control go: the list itself, or on a headed
		 * list a wrapper of their own.
		 *
		 * **The wrapper is the strip's second row.** A sticky item is confined to
		 * its grid area, so the strip can only follow the scroll if its area is the
		 * whole list; that leaves the records needing an area of their own beneath
		 * the strip's reserved height. It draws nothing outside the wide regime.
		 */
		const host = headed
			? element('div', 'sheetsmith-record-set-records', list)
			: list;

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
		 * **And the builder is `components/fenced-link.ts` now rather than this
		 * closure**, because Passport is the second fenced component with a
		 * free-text field and the sentence above was about to be written twice —
		 * which is the paragraph directly above happening across two files instead
		 * of within one. The two words that differ are arguments: a record has a
		 * name and a body to move a link into and a passport has neither.
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
			fencedLinkRefusal(text, {
				subject: `A ${noun.toLowerCase()}'s fields`,
				instead: `Put it in the ${noun.toLowerCase()}'s name or its body instead.`,
			});

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
		 * The value field's alone, in both modes: where the ceiling is the
		 * record's there is a field after the slash to type it in, and where it is
		 * the layout's there is nothing to type at all, so neither is told to go
		 * anywhere in particular. The ceiling field takes `refuseCeiling` below,
		 * since a slash after the first is division there.
		 */
		const refuseNumber = (text: string): string | null => {
			const link = refusal(text);
			if (link !== null) return link;
			if (!text.includes('/')) return null;
			return `Not saved. A slash separates a value from the maximum it is read against, so "${text}" would be stored as two numbers rather than one. Type just the number here.`;
		};

		/**
		 * Why a record's own ceiling cannot be stored, or null: a link, and nothing
		 * else (`docs/features/record-ceiling-formula.md`).
		 *
		 * **The slash is lifted here and kept on the value.** The entry splits at
		 * its *first* slash, so a slash after it is the ceiling's own: `level / 2`
		 * is division, and `Uses: 1 / level / 2` reads back as the value 1 against
		 * the ceiling `level / 2`. The value half can still hold none, which is why
		 * `refuseNumber` keeps it. A parse problem is not refused either: it is
		 * stored as typed and the line under the record says what is wrong, since a
		 * refusal would keep the reader's words only until the next render.
		 */
		const refuseCeiling = (text: string): string | null => refusal(text);

		/**
		 * Why a group name cannot be stored, or null.
		 *
		 * A link, as everywhere else that reaches the fence, through the same
		 * builder so the sentence cannot drift from the number field's. Then a
		 * line break, which an `<input>` strips on typing and a programmatic or
		 * pasted value must still not carry into a fence that holds one entry per
		 * line; and a length, counted in code points so a name in another script
		 * or with emoji is not penalised per code unit. **Not the input's
		 * `maxlength`**, which silently truncates a paste: a refusal that says so
		 * is this codebase's convention.
		 *
		 * **Deliberately not refused**: a colon (the fence splits at the line's
		 * first, so a value half may hold more), a slash (split only for a number),
		 * a semicolon, and the spaces at either end, which the gesture trims.
		 */
		const refuseGroupName = (text: string): string | null => {
			const link = refusal(text);
			if (link !== null) return link;
			if (/[\r\n]/.test(text)) {
				return 'Not saved. A group name is one line, because the sheet block holds one entry per line. Remove the line break.';
			}
			const length = Array.from(text).length;
			if (length > GROUP_NAME_LIMIT) {
				return `Not saved. A group name is at most ${GROUP_NAME_LIMIT} characters, and this is ${length}. Shorten it, or put the detail in the ${noun.toLowerCase()}'s body.`;
			}
			return null;
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

		/**
		 * The name fields drawn, by the record's position in the file, so a landing
		 * after **Add** finds the record it appended and not whichever was drawn
		 * last: with groups, the last drawn is no longer the last record.
		 */
		const nameFields = new Map<number, HTMLInputElement>();
		/** Every field's cell by record position and declared index, for a key edit's landing. */
		const fieldCells = new Map<string, HTMLElement>();

		/**
		 * Every conditioned field whose condition could not be worked out, by its
		 * declared index: on how many records, and the first reason met, in file
		 * order. Filled while the records draw, reported once per field above them.
		 */
		const failedConditions = new Map<number, { count: number; why: string }>();
		/** Records a condition was evaluated on, which is every one that read. */
		const readable = records.filter((record) => record.error === null).length;

		/**
		 * The groups, computed before any record is drawn so that the names a text
		 * field's type-ahead offers are the ones this render is about to draw: the
		 * pass that produces the headers produces the list, and nothing reads the
		 * records a second time.
		 */
		const groups =
			groupField === null
				? null
				: groupRecords(
						records,
						(record) =>
							groupReading(groupField.field, record.fields, record.error),
						// A text key's order is the spelling's, not a number's.
						{ alphabetical: fieldType(groupField.field) === 'text' },
					);
		/**
		 * What a text field offers as it is typed: each group's first-seen
		 * spelling, in header order, without Other. Names in use on this
		 * character in this list and nothing wider, whether or not a group is
		 * collapsed.
		 */
		const groupSpellings: readonly string[] =
			groups === null || groupField === null || fieldType(groupField.field) !== 'text'
				? []
				: groups
						.filter((group) => group.key !== OTHER_KEY)
						.map((group) => group.label ?? group.key);

		if (groups !== null) {
			groups.forEach((group, ordinal) => {
				drawGroup(group, ordinal);
			});
			// A group that is gone is a new group if it returns, and opens: reported
			// as the difference, the way `shiftOpen` is. Only where groups were drawn,
			// so an ungrouped fallback after a bad `groupBy` leaves what the reader
			// collapsed as it was.
			const drawn = new Set(groups.map((group) => group.key));
			for (const key of collapsedKeys) {
				if (!drawn.has(key)) context.onToggleGroup?.(key, false);
			}
		} else {
			records.forEach((record, at) => {
				drawRecord(record, at, host);
			});
		}

		/*
		 * **One line per failing field, not per record, and above the records**,
		 * inside the scrolling list so it never grows the placed box. The field is
		 * drawn on every record it failed on, so what the line owes is the reason:
		 * a rename that migrated every note while every condition reading the old
		 * key stopped resolving would otherwise be every hidden field reappearing
		 * with nobody told why.
		 *
		 * The first children of whatever holds the records — the list itself, or
		 * on a headed list the records' own wrapper, which is `display: contents`
		 * until the strip draws — so the line sits under the strip rather than in
		 * a grid track meant for it.
		 */
		const lines: HTMLElement[] = [...failedConditions.entries()]
			.sort(([left], [right]) => left - right)
			.map(([index, failed]) => {
				const field = fields[index] as RecordField;
				const where = recordCount(failed.count, readable, noun);
				// Appended, then moved to the front with the rest below.
				return element(
					'div',
					'sheetsmith-error',
					host,
					`"${fieldLabel(field)}" is shown on ${where} because its condition could not be worked out: ${failed.why} Fix the condition under Shown when in the layout editor.`,
				);
			});
		if (grouping !== null && 'problem' in grouping) {
			lines.unshift(
				element('div', 'sheetsmith-error', host, grouping.problem),
			);
		}
		if (lines.length > 0) host.prepend(...lines);

		// The add control is the box's last child, outside the scrolling list, so it
		// sits at the foot of the card whatever the list holds and does not scroll
		// away with it. It wears the clothes Table's add control wears, in one
		// stylesheet rule, so the two read as one treatment. It is still after every
		// record's controls in document order, which is what the landing below and
		// the view's index-based focus restore both rest on.
		const add = element('button', 'sheetsmith-record-add', box);
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
			// The record starts with no fence, so it lands in the group the key's
			// default value names; one the reader collapsed opens with it.
			if (groupField !== null) {
				// A text or number key has no reading for a blank record, which is
				// Other's: the common case for text, so it opens Other and not nothing.
				const key =
					groupReading(groupField.field, {}, null)?.key ?? OTHER_KEY;
				if (collapsedKeys.has(key)) context.onToggleGroup?.(key, false);
			}
			// Named rather than blank: a `### ` with nothing after it is not a
			// heading, so a nameless record would not survive its own first read.
			context.onChange({ records: {}, added: [{ name: noun }] });
		});

		if (landing) {
			const field = nameFields.get(landedAt);
			field?.focus();
			// Selected as well as focused, because the name the add control wrote is
			// a placeholder the reader is expected to type over.
			field?.select();
		}

		if (awaitingKeyEdit?.id === config.id && groupField !== null) {
			const wanted = awaitingKeyEdit;
			const edited = records[wanted.at];
			if (
				edited !== undefined &&
				(
					groupReading(groupField.field, edited.fields, edited.error) ?? {
						key: OTHER_KEY,
					}
				).key === wanted.key
			) {
				awaitingKeyEdit = null;
				fieldCells
					.get(`${wanted.at}:${wanted.index}`)
					?.querySelector<HTMLElement>('select, button, input')
					?.focus();
			}
		}

		/**
		 * One group: its header over a body holding its records, in the file's order.
		 *
		 * **The body is always in the DOM and a collapse only hides it**, so a
		 * collapsed group's records are still laid out and every formula over them is
		 * still evaluated, as an inactive tab's are (SPEC §8). `hidden="until-found"`
		 * is the record body's own spelling for its own reason: it runs on
		 * `content-visibility: hidden`, so the rows leave layout and add no height,
		 * and the box does not move because it never depended on them.
		 */
		function drawGroup(
			group: RecordGroup<RecordEntry>,
			ordinal: number,
		): void {
			if (groupField === null) return;
			const name = groupName(groupField.field, group);
			const section = element('div', 'sheetsmith-record-group', host);
			const heading = element(
				'h3',
				'sheetsmith-record-group-heading',
				section,
			);
			const toggle = element(
				'button',
				'sheetsmith-record-group-toggle',
				heading,
			);
			toggle.type = 'button';
			const mark = element('span', 'sheetsmith-record-group-mark', toggle);
			mark.setAttribute('aria-hidden', 'true');
			// One line, clipped, and revealed on hover only where it is clipped
			// (`ui/truncation.ts`): a typed name can be any length, and a header
			// that wrapped would grow with it and move every record below. The
			// button's accessible name is this text whole, clipped or not.
			revealWhenTruncated(
				element('span', 'sheetsmith-record-group-name', toggle, name),
			);
			// Beside the button and out of its name, so the name is the text on
			// screen and nothing else (WCAG 2.5.3); the sentence is its twin.
			const count = group.members.length;
			element(
				'span',
				'sheetsmith-card-abbreviation sheetsmith-record-group-count',
				heading,
				String(count),
			).setAttribute('aria-hidden', 'true');
			const said = element(
				'span',
				'sheetsmith-sr-only',
				section,
				countOf(count, noun),
			);
			said.id = `sheetsmith-record-group-count-${config.id}-${ordinal}`;
			toggle.setAttribute('aria-describedby', said.id);

			const body = element('div', 'sheetsmith-record-group-body', section);
			body.id = `sheetsmith-record-group-${config.id}-${ordinal}`;
			toggle.setAttribute('aria-controls', body.id);

			let collapsed = collapsedKeys.has(group.key);
			const paintGroup = (): void => {
				mark.replaceChildren();
				setIcon(mark, collapsed ? CLOSED_ICON : OPEN_ICON);
				toggle.setAttribute('aria-expanded', String(!collapsed));
				if (collapsed) body.setAttribute('hidden', 'until-found');
				else body.removeAttribute('hidden');
			};
			const setCollapsed = (next: boolean): void => {
				if (next === collapsed) return;
				collapsed = next;
				// Kept current for the presses that follow without a rebuild: **Add**
				// and a key edit read it to know whether their group needs opening.
				if (collapsed) collapsedKeys.add(group.key);
				else collapsedKeys.delete(group.key);
				// Painted before reporting, on the record disclosure's own rule: a
				// collapse reaches no file, so no rebuild comes to paint it.
				paintGroup();
				context.onToggleGroup?.(group.key, collapsed);
			};
			// **One route in, on the row, and not one on the button and one on the
			// row.** The button's press bubbles to the row, and a press on the chevron
			// repaints the chevron (`paintGroup` replaces it) before it gets there, so
			// a row handler that asked whether the target sat inside the button found
			// it detached and answered a second time: the group toggled twice and
			// looked unmoved. Enter and Space reach the row as the button's own
			// `click`, the count and the empty row as a press on the row.
			heading.addEventListener('click', () => setCollapsed(!collapsed));
			body.addEventListener('beforematch', () => setCollapsed(false));
			for (const member of group.members) {
				drawRecord(member.record, member.at, body);
			}
			paintGroup();
		}

		/** One record: its summary line, its body, and the controls on both. */
		function drawRecord(
			record: RecordEntry,
			at: number,
			into: HTMLElement,
		): void {
			const named = recordLabel(record.name, noun);
			const row = element('div', 'sheetsmith-record', into);
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

			const chevron = element(
				'button',
				'sheetsmith-record-disclosure',
				summary,
			);
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

			const fieldRow = element(
				'div',
				'sheetsmith-record-fields',
				summary,
			);
			/*
			 * **Partitioned once, and each field keeps its declared index.** A
			 * computed field resolves `fields.<index>.formula`, which is its position
			 * in `config.fields` and in neither half — so iterating a filtered array
			 * with its own indices would resolve a computed field declared after a
			 * body field against its neighbour's formula.
			 */
			const inBlock: {
				field: RecordField;
				index: number;
				shown: boolean;
			}[] = [];
			/*
			 * **The record's stored layer, built once and read by both**: every
			 * computed field's formula and every field's condition, on the summary
			 * line and in the body. A condition therefore reaches exactly what a
			 * computed field reaches, and reads no other computed field (SPEC §5).
			 * A record whose fence did not read draws no fields, so it evaluates
			 * nothing.
			 */
			const scope = record.error === null ? storedScope(record) : {};
			if (record.error === null) {
				/** A summary field's own track under the strip, from 1. */
				let track = 0;
				fields.forEach((field, index) => {
					const shown = isShown(field, index, scope);
					if (inBody(field)) {
						inBlock.push({ field, index, shown });
						return;
					}
					track += 1;
					drawField(fieldRow, row, field, index, record, at, named, false, {
						shown,
						track: headed ? track : null,
						scope,
					});
				});
			}

			drawRemove(summary, row, at, named);

			if (record.error !== null) {
				element('div', 'sheetsmith-error', row, record.error);
			}

			/*
			 * **The body's first child, and drawn only where there is something in
			 * it**, so a layout with no body field draws the tree it always drew: no
			 * block, no class, no second grid row. The prose layers after it are
			 * unchanged and stay stacked in one cell, one row down.
			 *
			 * In the DOM whether the record is open or closed, as the prose field
			 * already is: `hidden="until-found"` on the body hides the block with it,
			 * the view's focus restoration counts the same controls either way, and
			 * find-in-page has the names to reach.
			 */
			/*
			 * **Where every body field on this record is hidden, the block is too**,
			 * and the body loses the class that gives it a second row — so the prose
			 * takes the first and no empty step is left above it. The block stays in
			 * the DOM, hidden, for the same reason a hidden field does: the view
			 * restores focus by a control's index in the cell, and removing controls
			 * would renumber every one after them.
			 */
			if (inBlock.length > 0) {
				const anyShown = inBlock.some((one) => one.shown);
				if (anyShown) {
					bodyEl.classList.add('sheetsmith-record-body-has-fields');
				}
				const block = element(
					'div',
					'sheetsmith-record-body-fields',
					bodyEl,
				);
				if (!anyShown) block.setAttribute('hidden', '');
				for (const { field, index, shown } of inBlock) {
					drawField(block, row, field, index, record, at, named, true, {
						shown,
						track: null,
						scope,
					});
				}
			}

			drawBody(bodyEl, row, record, at, named);
			paintDisclosure();
		}

		/**
		 * What an edit to the key field owes before it is reported: the group the
		 * record is about to be in opens, and focus follows the control.
		 *
		 * **Nothing here moves a record.** The commit is the only thing that does,
		 * since a draft is not a render. Focus is released before the report, as
		 * **Add** does, because the view restores it by a control's index and the
		 * index names another control once the record has moved; and it is taken only
		 * where the control holds it, so a commit made by tabbing to another field
		 * does not pull the reader back.
		 */
		function regroup(
			record: RecordEntry,
			at: number,
			index: number,
			cell: HTMLElement,
			next: string,
		): void {
			if (groupField === null) return;
			const before = groupReading(
				groupField.field,
				record.fields,
				record.error,
			);
			const after = groupReading(
				groupField.field,
				{ ...record.fields, [groupField.field.key]: next },
				record.error,
			);
			const key = (after ?? { key: OTHER_KEY }).key;
			if (key === (before ?? { key: OTHER_KEY }).key) return;
			if (collapsedKeys.has(key)) context.onToggleGroup?.(key, false);
			const held = cell.ownerDocument.activeElement;
			if (held !== null && cell.contains(held)) {
				if (held.instanceOf(HTMLElement)) held.blur();
				awaitingKeyEdit = { id: config.id, at, index, key };
			}
		}

		/**
		 * One record's names as a computed field or a condition reads them: every
		 * stored field's value half, never a computed one.
		 */
		function storedScope(record: RecordEntry): Record<string, FieldValue> {
			return storedLayer(config, record);
		}

		/**
		 * Whether this field is drawn on this record, and a failed condition noted
		 * for the list's problem line.
		 *
		 * **Fail-open**, the opposite of the editor's own `conditionMet`: a
		 * condition that does not resolve, or does not come to true or false,
		 * shows the field. A hidden value is a counter the reader cannot see still
		 * counting, which is the worse way to be wrong on a sheet.
		 *
		 * **Resolved by the field's declared index**, never by its place in a
		 * filtered half: the partition into summary and body keeps each field's
		 * index for exactly this, and a renumbered half reads a neighbour's
		 * condition.
		 *
		 * **Evaluated here and nowhere else.** `scopeRows`, `scopeModifiers` and
		 * `applyReset` never ask, which is what keeps visibility a sink: a
		 * condition reads values and no value reads visibility.
		 */
		function isShown(
			field: RecordField,
			index: number,
			scope: Record<string, FieldValue>,
		): boolean {
			const condition = honouredCondition(field);
			if (condition === null) return true;
			if (typeof condition === 'boolean') return condition;
			const path = `fields.${index}.visibleWhen`;
			const value = context.resolveField(path, scope);
			if (typeof value === 'boolean') return value;
			const why =
				value === null
					? (context.explainField?.(path, scope) ??
						'The condition did not resolve.')
					: `It came to "${String(value)}", which is not true or false.`;
			const failed = failedConditions.get(index);
			if (failed === undefined) failedConditions.set(index, { count: 1, why });
			else failed.count += 1;
			return true;
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
			nameFields.set(at, input);
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
						status.textContent = keptRatherThanBlank(
							noun.toLowerCase(),
							named,
						);
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
			const input = element(
				'input',
				'sheetsmith-record-name-input',
				stack,
			);
			// This branch is the stacked one: unfocused, the field's text is
			// transparent under the link layer, and its spelling marks would not be.
			spellcheckWhileFocused(input);
			// And the name layer goes inert while the field is focused. A class
			// rather than `:has(.sheetsmith-record-name-input:focus)`.
			flagWhileFocused(stack, input, 'sheetsmith-record-name-focused');
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
			/**
			 * Whether this control is drawn inside the opened record. The one
			 * argument that differs between the two placements, and it does two
			 * things only: the field's name is drawn beside every type, since no
			 * strip ever names a body field, and a ring is told its name is on
			 * screen. Everything else — the commit, the delta, the refusals — is the
			 * same code with the same arguments.
			 */
			body: boolean,
			drawn: {
				/**
				 * Whether its condition holds on this record. A hidden field is the
				 * same control on the same commit path with `hidden` on its cell,
				 * which is `display: none`: out of layout, the accessibility tree,
				 * the tab order and find-in-page, and still in the DOM, so every
				 * control's index in the cell — which is what the view restores
				 * focus by — is the same whatever the conditions say. Plain
				 * `hidden`, never `until-found`: find-in-page revealing a field its
				 * condition hid would be wrong.
				 */
				shown: boolean;
				/**
				 * Its track under the strip, from 1, on a headed list's summary line
				 * only. Explicit rather than auto-placed, so a field after a hidden
				 * one stays under its own heading instead of sliding one track left.
				 */
				track: number | null;
				/** The record's stored layer, which a computed field reads. */
				scope: Record<string, FieldValue>;
			},
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
			fieldCells.set(`${at}:${index}`, cell);
			if (!drawn.shown) cell.setAttribute('hidden', '');
			if (drawn.track !== null) {
				cell.style.setProperty(
					'--sheetsmith-record-track',
					String(drawn.track),
				);
			}
			// A number's name is drawn beside it in the shared secondary clothes,
			// always: the stylesheet hides it only where a strip is over it, so the
			// one query decides both and a number can never have neither. In the
			// body every type draws it, and no rule hides it there — the strip's
			// rules are scoped to the summary line.
			if (body || type === 'number' || type === 'text') {
				element('span', 'sheetsmith-card-abbreviation', cell, name);
			}
			const commit = (next: string): void => {
				if (groupField?.index === index) regroup(record, at, index, cell, next);
				context.onChange({
					records: { [at]: { fields: { [field.key]: next } } },
				});
			};

			if (type === 'computed') {
				drawComputed(cell, field, index, drawn.scope, accessible);
				return;
			}
			if (type === 'modifier') {
				drawModifier(cell, row, field, record, at, named, commit);
				return;
			}
			if (type === 'level' || type === 'toggle') {
				drawRing(
					cell,
					field,
					raw,
					type === 'level',
					accessible,
					body,
					commit,
				);
				return;
			}

			if (type === 'text') {
				drawText(cell, row, raw, accessible, commit);
				return;
			}

			// A number, whose entry may carry its ceiling beside its value.
			const ownMax = recordsOwnMax(field);
			const entry = splitBounded(raw);
			const input = element('input', 'sheetsmith-record-input', cell);
			input.type = 'text';
			input.inputMode = 'numeric';
			input.value = entry.value;
			input.setAttribute('aria-label', accessible);
			/*
			 * **An empty body number says it is empty; a summary one does not need
			 * to.** On the summary line a blank value sits in a line of values, under
			 * a heading or beside its neighbours, and the slot reads as a slot. In the
			 * body a name followed by nothing reads as missing content, or as a
			 * subheading over the prose, so the field takes Pool's own `—`, the one a
			 * record-owned ceiling already shows. Body only, so the summary line — and
			 * every layout without a body field — draws exactly what it drew.
			 */
			if (body) input.placeholder = '—';
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
			/** What a formula ceiling came to, drawn over its field; null for a typed one. */
			let ceilingLayer: HTMLElement | null = null;
			/** The field's own title, and what a formula ceiling adds to it. */
			const ceilingTitle = (text: string): string => {
				const base = `Maximum ${name}, held by this ${noun.toLowerCase()}.`;
				const trimmed = text.trim();
				return trimmed === '' || typedCeiling(trimmed) !== null
					? base
					: `${base} Worked out from ${trimmed}.`;
			};
			if (ownMax || field.max !== undefined) {
				const ceiling = element(
					'span',
					'sheetsmith-pool-ceiling',
					cell,
				);
				element('span', 'sheetsmith-pool-separator', ceiling, '/');
				if (ownMax) {
					const stored = (entry.ceiling ?? '').trim();
					/*
					 * **A ceiling that is a formula is drawn as what it came to**, over
					 * the field that holds its text: `docs/UI.md` §9's stacked
					 * arrangement, which this record's name already uses for its links.
					 * Unfocused the layer shows the number and the field's own text is
					 * transparent under it; focused the layer goes inert and the reader
					 * edits `prof`, not 3. The layer takes no press — one short line,
					 * so a press lands the caret in the field, as a table cell's does.
					 *
					 * **A typed number, or nothing, gets no stack at all**: the field
					 * alone, the DOM it has always had, which is what makes "a typed
					 * number reads exactly as before" true by construction.
					 */
					const worked =
						stored !== '' && typedCeiling(stored) === null
							? element('span', 'sheetsmith-record-worked-out', ceiling)
							: null;
					// `maxInput`, which is Pool's own name for the same control — and
					// deliberately not `held`, which is the mutable entry above and the
					// state every commit on this line composes from.
					const maxInput = element(
						'input',
						'sheetsmith-record-input sheetsmith-pool-max',
						worked ?? ceiling,
					);
					maxInput.type = 'text';
					/*
					 * **Text, always**, where this was `numeric`: a phone's numeric
					 * keypad has no letters, so `prof` could not be typed there. A
					 * keypad that switched on what the field holds would be stuck on
					 * the keypad from an empty or numeric ceiling, the one state from
					 * which a formula is typed (`docs/features/record-ceiling-formula.md`).
					 */
					maxInput.inputMode = 'text';
					maxInput.value = entry.ceiling ?? '';
					maxInput.placeholder = '—';
					// **The one thing the field gains that the span could not have.** A
					// bare span prohibits naming, so the read-only ceiling reaches a
					// screen reader only through the field's announcement; an input is
					// nameable, and both channels are kept rather than traded.
					maxInput.setAttribute(
						'aria-label',
						`${accessible} maximum`,
					);
					maxInput.title = ceilingTitle(stored);
					if (worked !== null) {
						// A formula is not prose: a squiggle under `prof` is noise, and
						// under transparent text it would show through the layer.
						maxInput.spellcheck = false;
						flagWhileFocused(
							worked,
							maxInput,
							'sheetsmith-record-worked-out-focused',
						);
						ceilingLayer = element(
							'span',
							'sheetsmith-pool-max sheetsmith-record-worked-out-layer',
							worked,
						);
					}
					ceilingInput = maxInput;
					context.suggestFormula?.(maxInput, config.id);
				} else {
					element(
						'span',
						'sheetsmith-pool-max',
						ceiling,
						String(field.max),
					);
				}
			}

			const readers: CeilingReaders = {
				resolveExpression: context.resolveExpression,
				explainExpression: context.explainExpression,
			};
			/**
			 * The ceiling the value is read against as it stands — the *draft* where
			 * one is being typed, which is Pool's own rule: what the value is
			 * announced against and held to is what the reader can see. Worked out
			 * in the record's stored layer, the scope `visibleWhen` reads.
			 *
			 * **This says which text; `ceilingOf` says what it is worth**, and every
			 * channel on this line goes through both. The announcement used to take
			 * the raw text where the clamp parsed it, so a record storing
			 * `Uses: 2 / lots` clamped to nothing and *still* announced "Uses 40 of
			 * lots". The one channel that was wrong is the only one a reader who
			 * cannot see the field has.
			 */
			const ceilingNow = (): Ceiling =>
				ownMax
					? ceilingOf(ceilingInput?.value ?? '', field, drawn.scope, readers)
					: field.max === undefined
						? null
						: typedCeiling(String(field.max));
			/** "of 3", or nothing at all where this record has no ceiling it can read. */
			const said = (): string => {
				const ceiling = ceilingNumber(ceilingNow());
				return ceiling === null ? '' : ` of ${ceiling}`;
			};
			/** The bounds the value is held to, against that same standing ceiling. */
			const valueBounds = (): TypedField =>
				ownMax ? fieldBounds(field, ceilingNow()) : field;

			/**
			 * The ceiling's reading and its problem line, from the field's text as it
			 * stands: at the draw, so a hand-edited or renamed ceiling says so on
			 * first paint, and after a commit, so the line answers before the rebuild
			 * (PATTERNS §5's optimistic paint).
			 *
			 * **Its own line, not the refusal's**, so a refused link on the value
			 * beside it does not clear it, and two failing fields draw two. Hung on
			 * the record, where a refusal hangs, because the summary line has nowhere
			 * to put a sentence.
			 *
			 * **Drawn whether or not the field's condition shows it.** A reset never
			 * reads visibility, so it skips and counts a hidden field whose ceiling
			 * will not work out exactly as a shown one, and the confirmation's "1
			 * feature skipped" has to name a record the reader can find. The line is
			 * the only place on the sheet that says which.
			 */
			let ceilingLine: HTMLElement | null = null;
			const paintCeiling = (): void => {
				if (!ownMax || ceilingInput === null) return;
				const ceiling = ceilingNow();
				const problem = ceilingProblem(ceiling);
				if (ceilingLayer !== null) {
					const blank = ceilingInput.value.trim() === '';
					// Blank shows the field's own `—` placeholder through the layer.
					ceilingLayer.textContent = blank
						? ''
						: formatDerived(ceilingNumber(ceiling), false);
					ceilingLayer.classList.toggle(
						'sheetsmith-pool-max-unresolved',
						problem !== null,
					);
				}
				ceilingInput.title = ceilingTitle(ceilingInput.value);
				ceilingLine?.remove();
				ceilingLine = null;
				if (problem === null) return;
				ceilingLine = element(
					'div',
					'sheetsmith-error',
					row,
					`${name} maximum could not be worked out: ${problem} Change it after the slash, or clear it.`,
				);
			};
			paintCeiling();

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
					return ceilingNumber(ceilingNow()) ?? undefined;
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
				// **No arithmetic settles**, and this is a departure from Pool stated
				// rather than hidden: a record's *value* field does not settle `31+7`,
				// so turning a ceiling's `prof + 1` into a number at the commit would
				// put two commit rules on one line. An expression is stored as typed
				// and worked out on every read instead, which is the value field's
				// own rule: store what was typed. Arrow keys step a typed number and
				// leave an expression alone, `editable.ts`'s rule for text.
				announceCommit: (next) => {
					// A formula that will not work out is stored as typed — the note is
					// where the reader's words belong — and the commit says what is
					// wrong with it, which the line under the record then shows.
					const unread =
						ceilingProblem(ceilingOf(next, field, drawn.scope, readers)) !== null;
					status.textContent =
						next === ''
							? `${ceilingName} cleared`
							: `${ceilingName} ${next}${unread ? ', which could not be worked out' : ''}`;
				},
				announceRestore: (restored) => {
					status.textContent =
						restored === ''
							? `${ceilingName} restored to empty`
							: `${ceilingName} restored to ${restored}`;
				},
				refuse: refuseCeiling,
				onRefusal: showCeilingRefusal,
				onCommit: (next) => {
					const settled = boundedText(next, {
						type: 'number',
						min: field.min,
					});
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
					paintCeiling();
					commit(held);
				},
			});
		}

		/**
		 * A text field: the word a player types to name the group a record sits
		 * under, which is the only job text has here
		 * (`docs/features/free-text-group-key.md`).
		 *
		 * **The number field's clothes and its gesture** (`editable.ts`: typing
		 * drafts, Enter or blur commits, Escape restores, a refusal keeps the
		 * draft), with a width of its own. It reads and writes the entry whole: a
		 * text value has no ceiling half, and a colon or a slash in it is inert
		 * because the fence splits at the first colon of the *line*.
		 *
		 * **Refused at the commit, never in `read`**, so a note that already holds
		 * a link, a long value or a line break is rendered and carried (SPEC §10).
		 * `spellcheck` is off: class names are proper nouns and homebrew words, and
		 * red underlines down a column of them are noise.
		 */
		function drawText(
			cell: HTMLElement,
			row: HTMLElement,
			raw: string,
			accessible: string,
			commit: (next: string) => void,
		): void {
			const input = element(
				'input',
				'sheetsmith-record-input sheetsmith-record-input-text',
				cell,
			);
			input.type = 'text';
			input.value = raw;
			input.spellcheck = false;
			input.setAttribute('aria-label', accessible);
			// The empty state in both placements: a chromeless blank input is
			// otherwise indistinguishable from nothing, and a text field has no
			// value to imply a slot the way a number does.
			input.placeholder = '—';
			revealWhenTruncated(input);
			const showRefusal = refusalNotice(row);
			const handle = bindEditable(input, {
				initial: raw,
				announceCommit: (next) => {
					status.textContent =
						next === '' ? `${accessible} cleared` : `${accessible} ${next}`;
				},
				announceRestore: (restored) => {
					status.textContent =
						restored === ''
							? `${accessible} restored to empty`
							: `${accessible} restored to ${restored}`;
				},
				refuse: refuseGroupName,
				onRefusal: showRefusal,
				onCommit: commit,
			});
			// The view decides how the offer is drawn; absent, this is a plain box.
			// A pick is the field's own commit, so it takes the refusals, the
			// announcement and the regroup typing the name would.
			context.suggestText?.(input, groupSpellings, (next) => handle.set(next));
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
			/** The record's stored layer, shared with its conditions. */
			scope: Record<string, FieldValue>,
			accessible: string,
		): void {
			const value = element('div', 'sheetsmith-record-value', cell);
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
						? (context.explainField?.(
								`fields.${index}.formula`,
								scope,
							) ?? 'The formula did not resolve.')
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

		/** A level or a toggle, through the one control every ring on a sheet is. */
		function drawRing(
			cell: HTMLElement,
			field: RecordField,
			raw: string,
			graded: boolean,
			accessible: string,
			/** Drawn in the body, where its name span sits beside it at every width. */
			body: boolean,
			commit: (next: string) => void,
		): void {
			const count = graded ? levelCount(field) : 1;
			const initial = graded
				? levelOf(field, raw)
				: isFlagSet(raw)
					? 1
					: 0;
			const stateOf = (level: number): string =>
				graded ? String(level) : flagText(level > 0);

			if (graded && field.input === 'select') {
				const select = element(
					'select',
					'sheetsmith-record-select',
					cell,
				);
				for (let level = 0; level <= count; level++) {
					const option = element(
						'option',
						'',
						select,
						levelName(field, level),
					);
					option.value = String(level);
				}
				select.value = String(initial);
				select.setAttribute('aria-label', accessible);
				select.addEventListener('change', () => {
					commit(stateOf(Number(select.value)));
				});
				return;
			}

			const button = element('button', 'sheetsmith-level-ring', cell);
			button.type = 'button';
			/*
			 * **What the tooltip carries is not what Table's carries, and the
			 * difference is the heading strip.** Table and Track set a `title` only
			 * for a *named level*, on the argument that a tooltip repeating legible
			 * text is noise — and in a cell that is right, because the field's own
			 * name is already in a `<th>` over the column and only the level's word
			 * is missing. **A record has no `<th>`.** Here the missing word is the
			 * *field's own name*, and it is missing on a `toggle` as much as on a
			 * `level`: a reader sees `Fireball · Level 3 · ●` and nothing on screen
			 * says the dot is "Prepared".
			 *
			 * So this is the one caller that says its name is *not* on screen, and
			 * that is the whole of the divergence: `ring-control.ts` decides what to
			 * do about it, including the touch route to the same words, which UI §7
			 * requires because `title` is a pointer's route and every ring that ships
			 * on the sample sheet is a toggle.
			 *
			 * **A strip does not change the answer, and the reason is that the fact
			 * is not knowable here.** Whether one is showing depends on the list's
			 * width, which only the stylesheet sees, and the same DOM serves both
			 * regimes; answering `true` would take the tooltip and the long press
			 * away in the narrow regime, which is exactly where no name is on screen.
			 * Table derives the fact from `hideHeading` because its heading is there
			 * at every width. What a wide headed list costs is a tooltip restating
			 * the heading — and it reads `Shield Prepared`, so it names the record as
			 * well, which no heading can.
			 *
			 * **In the body the fact is knowable, and it is true.** A body field draws
			 * its own name beside its control at every width and no strip or query
			 * touches it, so a body ring answers `true` — Table's position, where the
			 * heading is there at every width: no tooltip and no long press repeating
			 * a name the reader can see, and a named level still gets its level's
			 * word, which the glyph cannot draw.
			 */
			bindRingControl({
				button,
				column: field,
				count,
				graded,
				level: initial,
				name: accessible,
				nameOnScreen: body,
				onSet: (level) => commit(stateOf(level)),
			});
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
			const button = element(
				'button',
				'sheetsmith-record-modifier',
				cell,
			);
			button.type = 'button';
			const glyph = element(
				'span',
				'sheetsmith-record-modifier-glyph',
				button,
			);
			glyph.setAttribute('aria-hidden', 'true');

			// The stored list is what the form addresses, so every index is an index
			// into the note; the collapsed list is what the record is *doing*, so the
			// glyph and its count agree with the arithmetic.
			const stored = storedParts(raw);
			const enrolled = cellParts(raw);
			/** Built once per record, however many parts the field holds. */
			let values: RowValues | null = null;
			const ask = (part: string) =>
				context.modifiers?.outcomes(
					part,
					(values ??= recordValues(
						config,
						record,
						context.resolveField,
					)),
				) ?? [];
			const applied = rowModifiers(enrolled, ask);
			// Through the shared predicate: see `modifier-breakdown.ts` for why one
			// name rather than four copies.
			const applyingParts = applied.filter((one) =>
				applying(one.outcomes),
			).length;
			if (enrolled.length === 0) {
				cell.classList.add('sheetsmith-record-modifier-empty');
			}
			// Three shapes for four states, because docs/UI.md §6 refuses a mark
			// whose only channel is fill strength: a faint `plus` on an empty field,
			// `zap` where any part applies, `zap-off` where none does.
			setIcon(
				glyph,
				enrolled.length === 0
					? 'plus'
					: applyingParts > 0
						? 'zap'
						: 'zap-off',
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
				const said =
					offending === undefined ? null : refusal(offending);
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
					outcomes: ask,
					definitions: context.modifiers?.definitions ?? [],
					targets: context.modifiers?.targets ?? [],
					published: context.modifiers?.published ?? [],
					noteTargets: context.modifiers?.noteTargets ?? [],
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
			let standing = reanchorAnchoredPanel<ModifierFormState>(
				panelKey,
				button,
			);
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
				if (!panel.body.contains(doc.activeElement))
					focusFirstControl(panel);
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
				const shown = element(
					'div',
					'sheetsmith-record-body-rendered',
					into,
				);
				paintProse(shown, text);
				return;
			}

			const input = element(
				'textarea',
				'sheetsmith-record-body-input',
				into,
			);
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
			// And the rendered prose hides while the field is focused. A class rather
			// than `:has(.sheetsmith-record-body-input:focus)`. Flagged on `into`,
			// which is what holds the rendered layer below, so the pair cannot be
			// separated by a wrapper appearing between them.
			flagWhileFocused(
				into,
				input,
				'sheetsmith-record-body-field-focused',
			);

			const rendered = element(
				'div',
				'sheetsmith-record-body-rendered',
				into,
			);
			// The links the app draws, given this plugin's behaviour. Bound to the
			// layer once, before anything is painted into it: the fallback painter
			// wires each anchor as it makes it, and the app's renderer makes its own.
			adoptRenderedLinks(rendered, context.link);
			if (text !== '') {
				if (context.renderMarkdown !== undefined) {
					// And the fallback again where the app's renderer rejected, which is
					// not something the reader caused or can fix.
					context.renderMarkdown(text, rendered, () =>
						paintProse(rendered, text),
					);
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
				if (target instanceof HTMLElement && target.closest('a[href]'))
					return;
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
					into.classList.toggle(
						'sheetsmith-record-body-refused',
						message !== null,
					);
					// Under the body rather than inside it: the body is a two-layer
					// stack in one grid cell, so a third child there would sit on top
					// of the prose the message is about — which is why the host is the
					// shared helper's parameter rather than its own rule.
					showRefusal(message);
				},
				// The label and the outcome, never the prose: reading a record's text
				// back at its author is not feedback.
				announceCommit: (next) => {
					status.textContent =
						next === '' ? `${named} cleared` : `${named} saved`;
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
