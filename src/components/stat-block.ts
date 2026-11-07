/*
 * Stat block — records drawn as stat blocks, optionally one in play at a time
 * under a picker (SPEC §4.2, `docs/features/character-forms.md`). Covers 5e Wild
 * Shape and Polymorph, a werewolf's forms, Pathfinder 2e battle forms,
 * Daggerheart Beastform, and an always-present companion or familiar.
 *
 * **It is not a Record set presentation**, and the two reasons are the two
 * things a fold may not do. It stores set-level state above the records — a
 * uses counter, in a `sheet` fence in the section's preamble — which changes the
 * file format, and Record set's own rule is that "a fold that has to change the
 * file format is not a fold". And it publishes fixed names, `<id>.active` and
 * `<id>.uses`, where Record set publishes nothing by name. What it shares with
 * Record set is the record itself — heading, fence, prose, identity by position
 * — through `record-fields.ts` and `record-controls.ts`, which were moved out of
 * `record-set.ts` for this, never copied.
 *
 * **One form at a time is a radio over a toggle field**, not a stored choice
 * (the model question's item 6): `exclusive` names a toggle, the picker draws
 * it, and a switch writes the previous form's toggle off and the chosen one's
 * on in one edit. A stored choice would need a name-based identity where a
 * record's identity is its position, and a stored position switches forms
 * silently the moment an earlier one is deleted.
 *
 * **Only forms that are on push their modifiers**, and each push is flagged
 * `inPlay`, which is what the sheet's tint reads (`view/placement-decorations.ts`).
 * So a form needs no `when Active`, and a library of twelve beasts is not one
 * omission from applying all twelve. A note hand-edited to hold two on is
 * reported and left alone: both push, both apply, and the picker says so.
 *
 * **It never corrects a form at 0**: the number says it, in the error colour,
 * and one sentence says what the reader does next. Reverting is the reader's.
 */

import { setIcon } from 'obsidian';
import { bindEditable } from '../interaction/editable';
import { armRegister, bindArmToConfirm } from '../interaction/arm-to-confirm';
import { stepButton } from '../interaction/hold-repeat';
import { commitWindow } from '../interaction/commit-window';
import { splitBounded } from '../parse/bounded-entry';
import { fencedKeyProblem, readFenced, writeFenced } from '../parse/fenced';
import { bodyText, writeBodyText } from '../parse/markdown-body';
import { cellParts } from '../parse/modifier-cell';
import {
	joinRecords,
	RecordSection,
	splitRecords,
	withRecordBody,
} from '../parse/records';
import { readTable, splitLeadingTable, TableUpdates, writeTable } from '../parse/table';
import { HOLDER_MAX_SOURCE } from './column-types';
import { paintLinkedText } from './linked-text';
import { paintLevelRing } from './level-ring';
import { outcomeWords } from './modifier-breakdown';
import { bindRingControl } from './ring-control';
import { sampleNumber, samplePart, sampleSeed } from './sample-values';
import { flagText, isFlagSet } from './stored-flag';
import { boundedText } from './typed-value';
import {
	editRecords,
	fieldLabel,
	fieldReset,
	fieldType,
	recordEntries,
	RecordEntry,
	RecordField,
	RecordList,
	recordLabel,
	recordNoun,
	recordsOwnMax,
	recordValues,
	recordViews,
	resetColumnsOf,
	storedLayer,
} from './record-fields';
import {
	drawRecordBody,
	drawRecordModifier,
	drawRecordName,
	drawRecordNumber,
	bindDisclosure,
	REMOVE_ICON,
	RecordHost,
	recordRefusalNotice,
	recordRefusals,
	shiftOpenRecords,
} from './record-controls';
import {
	ComponentConfig,
	ComponentDefinition,
	FieldValue,
	ModifierOutcome,
	ModifierPush,
	ModifierSource,
	ReadResult,
	ResetColumn,
	ResetResult,
	RowsSource,
	RowValues,
	ScopeEntry,
	ScopeValues,
	showsOwnLabel,
} from '../types';
import { element } from '../ui/element';

/** The key a stored uses count sits under in the preamble's fence. */
const USES_KEY = 'uses';

/** What the action table's first column is headed where the layout has not said. */
const DEFAULT_ACTION_NAME = 'Action';

/** What the disclosure over a record's prose is called where the layout has not said. */
const DEFAULT_BODY_NAME = 'Details';

/**
 * The most rings the uses counter draws before it gives way to the numerals.
 * A count of two to four reads as dots; past six they stop being countable at a
 * glance and become a row to tally, which is what a number is for.
 */
const MAX_RINGS = 6;


/** The two faces, as the view's `activeTab` holds them. Undefined is play. */
const PLAY_FACE = 0;
const LIBRARY_FACE = 1;

/** The picker's value for the extra line two forms on draws. */
const SEVERAL_VALUE = 'sheetsmith-several';

/**
 * The render that follows a press on **Add form** here, so it lands focus in
 * the new record's name field. Module state for `record-set.ts`'s own reason: a
 * render cannot see the one before it, and the view rebuilds every component on
 * a write. Cleared only where it matches, so another block cannot consume it.
 */
let awaitingAdd: { id: string; held: number } | null = null;

/**
 * Which records' prose disclosures are open, by `<id>:<position>`.
 *
 * **Held here rather than in the view's posture**, and that is a cost rather
 * than a design: the posture pairs are an index into alternatives and a set of
 * open records, and both are taken — the faces hold `activeTab` and the library
 * holds `openRecords`. A third pair is the generalisation the view's own
 * comment refuses at two. So the disclosure survives a rebuild and not a reload,
 * which is the cheaper half to lose.
 */
const openBodies = new Set<string>();

/** Shift one block's open prose disclosures up past a record that is going. */
function shiftOpenBodies(id: string, removedAt: number, count: number): void {
	const held = new Set<number>();
	for (let at = 0; at < count; at++) {
		if (openBodies.delete(`${id}:${at}`)) held.add(at);
	}
	for (const at of held) {
		if (at < removedAt) openBodies.add(`${id}:${at}`);
		else if (at > removedAt) openBodies.add(`${id}:${at - 1}`);
	}
}

/** One column of a record's action table: text or a number. */
export interface ActionColumn {
	/** Its heading in the note, and the key a row's cell is written under. */
	key: string;
	/** What the column is called on the sheet, where it should differ from the key. */
	name?: string;
	type?: 'text' | 'number';
}

/** The four parts a stat block draws, in the order a layout says nothing about. */
export const SECTION_KEYS = ['vitals', 'modifiers', 'actions', 'traits'] as const;

/** One part of a form's stat block, as a layout orders and heads it. */
export interface StatBlockSection {
	/** Which part: `vitals`, `modifiers`, `actions` or `traits`. */
	key: string;
	/** The heading over it, where it should differ from the default. */
	name?: string;
}

export interface StatBlockConfig extends ComponentConfig {
	type: 'stat-block';
	recordName?: string;
	fields?: RecordField[];
	/** The key of the toggle field the picker draws; blank draws every record. */
	exclusive?: string;
	/** An expression: the uses counter's ceiling. */
	uses?: string | number;
	spendOnPick?: boolean;
	actions?: ActionColumn[];
	actionName?: string;
	bodyName?: string;
	/**
	 * The order the parts are drawn in and the heading over each. A part the
	 * list leaves out is drawn after the listed ones in the default order, so a
	 * list can reorder and rename and never hide a form's data.
	 */
	sections?: StatBlockSection[];
	hideLabel?: boolean;
}

/** One record as this component reads it: Record set's, plus its action list. */
export interface StatBlockEntry extends RecordEntry {
	/**
	 * The rows of the table the prose opens with, each cell in the order the
	 * layout declares — the name first, then each action column — or absent
	 * where no action columns are declared or the prose opens with no table.
	 */
	actions?: readonly (readonly string[])[];
	/**
	 * Whether the note holds this record switched on, for a record whose fence
	 * will not read, so the panel can say so; absent everywhere else.
	 */
	heldOn?: boolean;
}

/** One edit to one record's action list, by heading as the note spells it. */
export interface ActionEdit {
	rows?: Record<number, Record<string, string>>;
	added?: readonly Record<string, string>[];
	removed?: readonly number[];
}

export interface StatBlockData extends RecordList {
	records: Record<number, Partial<StatBlockEntry>>;
	/**
	 * The uses counter as the preamble's fence spells it. Read: what the note
	 * holds, absent where it holds none. Write: what to store.
	 */
	uses?: string;
	/** Why the preamble's fence will not read, which draws a problem line. */
	usesError?: string;
	/** Edits to each record's action list, by record position. */
	actionEdits?: Record<number, ActionEdit>;
}

/** The uses counter's own ceiling, where it is set at all. */
function hasUses(config: StatBlockConfig): boolean {
	const uses = config.uses;
	return typeof uses === 'number' || (typeof uses === 'string' && uses.trim() !== '');
}

/** The exclusive toggle's key as the layout spells it, or null where there is none. */
function exclusiveKey(config: StatBlockConfig): string | null {
	const key = (config.exclusive ?? '').trim();
	return key === '' ? null : key;
}

/** The field the exclusive key names, matched without regard to case. */
function exclusiveField(config: StatBlockConfig): RecordField | null {
	const key = exclusiveKey(config);
	if (key === null) return null;
	return (
		(config.fields ?? []).find(
			(field) => (field.key ?? '').trim().toLowerCase() === key.toLowerCase(),
		) ?? null
	);
}

function actionName(config: StatBlockConfig): string {
	return (config.actionName ?? '').trim() || DEFAULT_ACTION_NAME;
}

function bodyName(config: StatBlockConfig): string {
	return (config.bodyName ?? '').trim() || DEFAULT_BODY_NAME;
}

function actionColumns(config: StatBlockConfig): ActionColumn[] {
	return (config.actions ?? []).filter((column) => (column.key ?? '').trim() !== '');
}

/**
 * The parts in the order a layout sets them, each with its heading where the
 * layout gives one. Absent, it is today's order — vitals, modifiers, actions,
 * traits — under today's headings: none over the vitals, a modifier field's own
 * name, `actionName` and `bodyName`. An entry `configError` would refuse is
 * passed over here, since a refused configuration draws nothing at all.
 */
function sectionOrder(config: StatBlockConfig): { key: string; name?: string }[] {
	const listed: { key: string; name?: string }[] = [];
	for (const entry of config.sections ?? []) {
		const key = (entry.key ?? '').trim().toLowerCase();
		if (!(SECTION_KEYS as readonly string[]).includes(key)) continue;
		if (listed.some((one) => one.key === key)) continue;
		const name = (entry.name ?? '').trim();
		listed.push(name === '' ? { key } : { key, name });
	}
	for (const key of SECTION_KEYS) {
		if (!listed.some((one) => one.key === key)) listed.push({ key });
	}
	return listed;
}

/** The action table's headings, in the order a fresh table writes them. */
function actionHeaders(config: StatBlockConfig): string[] {
	return [actionName(config), ...actionColumns(config).map((column) => column.key)];
}

/** What an action column is called on the sheet. */
function columnLabel(column: ActionColumn): string {
	return (column.name ?? '').trim() || column.key;
}

/**
 * Why this configuration cannot draw, or null where it can (`docs/features/
 * character-forms.md`, Error states). Each names the fix, in the editor's words.
 */
function configError(config: StatBlockConfig): string | null {
	const seen = new Set<string>();
	for (const field of config.fields ?? []) {
		const key = (field.key ?? '').trim();
		if (key === '') return 'A field has no key. Give every field a key under Fields.';
		const problem = fencedKeyProblem(key);
		if (problem !== null) return `${problem} Rename it under Fields in the layout editor.`;
		const lower = key.toLowerCase();
		if (seen.has(lower)) {
			return `Two fields share the key "${key}". Give each field its own key under Fields.`;
		}
		seen.add(lower);
		if (lower === USES_KEY) {
			return `A field cannot be keyed "${key}", because that is where the uses counter is kept. Rename it under Fields.`;
		}
		const type = fieldType(field);
		if (type !== 'number' && type !== 'toggle' && type !== 'text' && type !== 'modifier') {
			return `The field "${fieldLabel(field)}" is a ${type} field, which a stat block does not draw. Make it a number, toggle, text or modifier field.`;
		}
	}
	const key = exclusiveKey(config);
	if (key !== null) {
		const field = exclusiveField(config);
		if (field === null) {
			return `One at a time by names "${key}", which no field declares. Name a toggle field's key, or clear it.`;
		}
		if (fieldType(field) !== 'toggle') {
			return `One at a time by names "${fieldLabel(field)}", a ${fieldType(field)} field. Name a toggle field's key instead.`;
		}
	}
	const seenSections = new Set<string>();
	for (const entry of config.sections ?? []) {
		const key = (entry.key ?? '').trim().toLowerCase();
		if (!(SECTION_KEYS as readonly string[]).includes(key)) {
			return `The section "${entry.key ?? ''}" is not one a stat block draws. Use vitals, modifiers, actions or traits under Sections.`;
		}
		if (seenSections.has(key)) {
			return `The section "${key}" is listed twice under Sections. List each part once.`;
		}
		seenSections.add(key);
	}
	const headings = new Set<string>([actionName(config).toLowerCase()]);
	for (const column of config.actions ?? []) {
		const heading = (column.key ?? '').trim();
		if (heading === '') {
			return 'An action column has no key. Give it one under Action columns, or remove it.';
		}
		if (heading.toLowerCase() === actionName(config).toLowerCase()) {
			return `The action column "${heading}" has the same heading as the column that names each action. Rename one of them.`;
		}
		if (headings.has(heading.toLowerCase()) && heading.toLowerCase() !== actionName(config).toLowerCase()) {
			return `Two action columns share the heading "${heading}". Give each its own.`;
		}
		headings.add(heading.toLowerCase());
	}
	return null;
}

/** Every record, as read or as an edit reported, in file order. */
function entries(data: StatBlockData | null): StatBlockEntry[] {
	const views = recordViews(data);
	return views.map((view, at) => ({
		...view,
		...(data?.records[at]?.actions === undefined
			? {}
			: { actions: data.records[at]?.actions }),
		...(data?.records[at]?.heldOn === true ? { heldOn: true } : {}),
	}));
}

/** Whether this record is on, by the exclusive toggle. */
function isOn(config: StatBlockConfig, record: RecordEntry): boolean {
	const field = exclusiveField(config);
	if (field === null) return false;
	return record.error === null && isFlagSet(record.fields[field.key] ?? '');
}

/** The stored uses count as a number, or null where the note holds none or text. */
function storedUses(data: StatBlockData | null): number | null {
	const raw = (data?.uses ?? '').trim();
	if (raw === '') return null;
	const value = Number(raw);
	return Number.isFinite(value) ? value : null;
}

/** The uses ceiling as a number, or null where it will not work out. */
function usesCeiling(resolve: (field: string) => FieldValue | null): number | null {
	const value = resolve('uses');
	const number = typeof value === 'number' ? value : Number(value);
	return value === null || !Number.isFinite(number) ? null : Math.max(0, Math.floor(number));
}

/**
 * The uses left: what the note holds, or the ceiling where it holds nothing.
 *
 * **Absent is full**, which is Pool's reading of a fresh character turned the
 * other way round only in spelling: a counter nobody has spent from has every
 * use, and a fresh druid with no `uses:` line has their two wild shapes.
 */
function usesLeft(data: StatBlockData | null, ceiling: number | null): number | null {
	return storedUses(data) ?? ceiling;
}

/** One record's action table, by declared column, or absent where it has none. */
function readActions(
	config: StatBlockConfig,
	rest: string,
): { actions?: string[][]; prose: string } {
	if (actionColumns(config).length === 0) return { prose: bodyText(rest) };
	const split = splitLeadingTable(rest);
	if (split === null) return { prose: bodyText(rest) };
	const read = readTable(split.table);
	if (!read.ok || read.table === null) return { prose: bodyText(rest) };
	const at = new Map(read.table.headers.map((heading, index) => [heading.toLowerCase(), index]));
	const columns = actionColumns(config);
	const actions = read.table.rows.map((row) => [
		row[0] ?? '',
		...columns.map((column) => {
			const index = at.get(column.key.toLowerCase());
			return index === undefined || index === 0 ? '' : (row[index] ?? '');
		}),
	]);
	return { actions, prose: bodyText(split.rest) };
}

/** Put a uses count into the preamble, keeping every other byte of it. */
function withUses(preamble: string, uses: string): string {
	const read = readFenced(preamble);
	if (read.ok && read.values !== null) {
		return writeFenced(preamble, new Map([[USES_KEY, uses]]));
	}
	// The first count a note holds goes at the preamble's head, so it sits
	// directly under the section's heading and above any prose a reader wrote.
	const fence = `\n\`\`\`sheet\n${USES_KEY}: ${uses}\n\`\`\`\n`;
	return fence + (preamble.trim() === '' ? '\n' : preamble);
}

/**
 * A record's prose with its action edits and its new text applied, every other
 * byte left as it was: the table through `writeTable`, the prose through
 * `writeBodyText`, and the two rejoined in the order they were.
 */
function withBody(
	config: StatBlockConfig,
	rest: string,
	edit: ActionEdit | undefined,
	text: string | undefined,
): string {
	const declared = actionColumns(config).length > 0;
	const split = declared ? splitLeadingTable(rest) : null;
	let table = split?.table ?? '';
	let prose = split?.rest ?? rest;
	if (edit !== undefined && declared) {
		const updates: TableUpdates = {
			rows: new Map(
				Object.entries(edit.rows ?? {}).map(([row, cells]) => [
					Number(row),
					new Map(Object.entries(cells)),
				]),
			),
			added: (edit.added ?? []).map((cells) => new Map(Object.entries(cells))),
			removed: edit.removed ?? [],
		};
		if (split !== null) {
			table = writeTable(split.table, actionHeaders(config), updates);
		} else if ((edit.added ?? []).length > 0) {
			// A body with no list yet gains one at its head, header and all, so the
			// prose a reader already wrote stays under it.
			table = writeTable(null, actionHeaders(config), { added: updates.added });
			if (prose.trim() !== '' && !/^\r?\n/.test(prose)) prose = `\n${prose}`;
		}
	}
	if (text !== undefined && text !== bodyText(prose)) {
		prose = prose.trim() === '' && table !== '' ? `\n${text}\n` : writeBodyText(prose, text);
	}
	return table + prose;
}

/** What one field holds in a sample, or null where it stores nothing. */
function sampleField(field: RecordField, record: number, at: number): string | null {
	switch (fieldType(field)) {
		case 'number': {
			if (recordsOwnMax(field)) {
				const ceiling = sampleNumber(at);
				return `${samplePart(ceiling)} / ${ceiling}`;
			}
			return boundedText(String(sampleNumber(at)), field);
		}
		case 'toggle':
			// The first record on, so a canvas shows a form in play.
			return flagText(record === 0);
		default:
			return null;
	}
}

export const statBlock: ComponentDefinition<StatBlockConfig, StatBlockData> = {
	type: 'stat-block',
	description: 'Records drawn as stat blocks, optionally one in play at a time under a picker.',
	storage: 'markdown',
	// `uses` is the counter's ceiling, worked out in sheet scope; a field's
	// ceiling is the record's own, held in the note, and so not a formula field
	// (PATTERNS §8). No `reset.*.where`: a form-scoped rest has not been asked
	// for, and declaring it obliges honouring it.
	formulaFields: ['uses', 'reset.*.to'],
	configFields: [
		{
			key: 'recordName',
			kind: 'text',
			label: 'Record name',
			description:
				'What one record is called. Names the add control, the empty states and a new record\'s heading in the note; changing it renames no record already written. Defaults to "Record".',
		},
		{
			key: 'fields',
			kind: 'columns',
			label: 'Fields',
			columnOptions: {
				types: ['number', 'toggle', 'modifier', 'text'],
				total: false,
				publish: false,
				holderMax: true,
				hideHeading: false,
				unit: 'field',
				holder: 'record',
				cell: 'field',
				heading: 'Name',
			},
			addressesEntry: { fence: 'record' },
			description:
				"The typed values every record holds, each an entry in that record's fence: number, toggle, text or modifier. Removing one leaves its entry in every note untouched; a text field refuses a wikilink, since a fence hides links from Obsidian.",
		},
		{
			key: 'exclusive',
			kind: 'text',
			label: 'One at a time by',
			description:
				'The key of a toggle field. Choosing a record turns it on and every other off in one write, and only that record\'s modifiers apply and tint the sheet. Blank draws every record at once and applies all of them, as a companion block.',
		},
		{
			key: 'uses',
			kind: 'formula',
			label: 'Uses',
			description:
				'The ceiling of a counter kept above the records, drawn as dots and stored once for the whole list. Blank stores and draws no counter; an existing count stays in the note.',
		},
		{
			key: 'spendOnPick',
			kind: 'boolean',
			label: 'Choosing spends a use',
			description:
				'With Uses set, turning a record on spends one use in the same write; turning it off spends nothing. Off by default.',
			default: false,
		},
		{
			key: 'actions',
			kind: 'columns',
			label: 'Action columns',
			columnOptions: {
				types: ['text', 'number'],
				total: false,
				publish: false,
				hideHeading: false,
				unit: 'column',
				holder: 'action',
				cell: 'cell',
				heading: 'Name',
			},
			description:
				"The columns of a table at the head of each record's body, for attacks or actions: text or number. Blank keeps any such table in the note and draws it as part of the body's prose.",
		},
		{
			key: 'actionName',
			kind: 'text',
			label: 'Action column heading',
			description:
				"The heading of the action table's first column, which names each row. Defaults to \"Action\".",
		},
		{
			key: 'bodyName',
			kind: 'text',
			label: 'Body heading',
			description:
				'What the disclosure over each record\'s prose is called. Defaults to "Details". Changes nothing in the note.',
		},
		{
			key: 'sections',
			kind: 'columns',
			label: 'Sections',
			columnOptions: {
				types: ['text'],
				total: false,
				publish: false,
				hideHeading: false,
				unit: 'section',
				holder: 'panel',
				cell: 'section',
				heading: 'Heading',
			},
			description:
				'The order a form\'s parts are drawn in, each keyed vitals, modifiers, actions or traits, with the heading over it. A part left out is drawn after the listed ones, so nothing a form holds is hidden. Blank draws vitals, modifiers, actions, then traits, under the field\'s name, the action column heading and the body heading. Changes nothing in the note.',
		},
		{
			key: 'hideLabel',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Hide label',
			description:
				'Hides the component\'s name above the panel. The section heading in the note is unchanged.',
			default: false,
		},
	],
	/*
	 * One entry, on §4.2's entrance test: nobody wanting forms looks for "Stat
	 * block", and the job is one configuration of it. No `uses`, `actions` or
	 * `bodyName`: each is one system's number or word, and the test is about
	 * being found, not about saving typing.
	 */
	palette: [
		{
			name: 'Forms',
			description:
				'Forms the character takes on one at a time, such as wild shape, polymorph or a werewolf.',
			config: {
				recordName: 'Form',
				fields: [
					{ key: 'Active', type: 'toggle' },
					{ key: 'HP', type: 'number', maxSource: HOLDER_MAX_SOURCE },
					{ key: 'Modifiers', type: 'modifier' },
				],
				exclusive: 'Active',
			},
		},
	],

	example: {
		recordName: 'Form',
		fields: [
			{ key: 'Active', type: 'toggle' },
			{ key: 'HP', type: 'number', maxSource: HOLDER_MAX_SOURCE },
		],
		exclusive: 'Active',
	},

	/*
	 * Two records, named from `recordName`, the first in play, so the canvas
	 * shows the picker with a form chosen and the library's second entry. The
	 * prose says it is filler, on Rich text's own rule.
	 */
	sample(config): string {
		if (configError(config) !== null) return '';
		const noun = recordNoun(config);
		const fields = config.fields ?? [];
		const seed = sampleSeed(config.id);
		const parts: string[] = ['\n'];
		for (const which of [0, 1]) {
			parts.push(`### ${noun} ${which + 1}\n`);
			const lines: string[] = [];
			fields.forEach((field, at) => {
				const value = sampleField(field, which, seed + which * fields.length + at);
				if (value !== null) lines.push(`${field.key}: ${value}`);
			});
			if (lines.length > 0) parts.push(`\n\`\`\`sheet\n${lines.join('\n')}\n\`\`\`\n`);
			parts.push(`\nSample text, so an open ${noun.toLowerCase()} shows where its prose starts.\n`);
			if (which === 0) parts.push('\n');
		}
		return parts.join('');
	},

	read(body, config): ReadResult<StatBlockData> {
		const error = configError(config);
		if (error !== null) return { ok: false, error };
		const section = splitRecords(body);
		const preamble = readFenced(section.preamble);
		const uses =
			preamble.ok && preamble.values !== null ? preamble.values.get(USES_KEY) : undefined;
		const usesError = preamble.ok ? undefined : preamble.error;
		if (section.records.length === 0 && uses === undefined && usesError === undefined) {
			return { ok: true, data: null };
		}
		const records: Record<number, StatBlockEntry> = recordEntries(
			section.records,
			recordNoun(config),
		);
		section.records.forEach((block, at) => {
			const entry = records[at] as StatBlockEntry;
			const { actions, prose } = readActions(config, block.rest);
			entry.body = prose;
			if (actions !== undefined) entry.actions = actions;
			const toggle = exclusiveField(config);
			if (entry.error !== null && toggle !== null && linesSayOn(block.head, toggle.key)) {
				entry.heldOn = true;
			}
		});
		return {
			ok: true,
			data: {
				records,
				...(uses === undefined ? {} : { uses }),
				...(usesError === undefined ? {} : { usesError }),
			},
		};
	},

	/**
	 * Whether a form is in play, and the uses left (SPEC §5): `<id>.active` and
	 * `<id>.uses`, each only where the layout asks for the thing it names, so a
	 * companion block publishes no `active` that could never be true.
	 */
	scopeValues(data, config): ScopeValues {
		if (configError(config) !== null) return {};
		const named: Record<string, ScopeEntry> = {};
		if (exclusiveField(config) !== null) {
			named.active = { value: entries(data).some((record) => isOn(config, record)) };
		}
		if (hasUses(config)) {
			named[USES_KEY] = {
				compute: (resolve) => usesLeft(data, usesCeiling((field) => resolve(field, {}))),
			};
		}
		return Object.keys(named).length > 0 ? { named } : {};
	},

	/** The records an aggregate walks, so `count(forms, Active)` is arithmetic. */
	scopeRows(data, config): RowsSource | undefined {
		if (configError(config) !== null) return undefined;
		const records = entries(data);
		const noun = recordNoun(config);
		return (resolve) => records.map((record) => recordValues(config.fields, noun, record, resolve));
	},

	/**
	 * What the records push (SPEC §5). **Where `exclusive` is set, only the
	 * records whose toggle is on push, each flagged `inPlay`**: that is the
	 * component choosing which rows enrol, as a Table pushes every row, and it
	 * decides nothing about what a modifier means. Two on by hand push both.
	 * Without it every record pushes, unflagged, and a part's own `when` is the
	 * only condition.
	 */
	scopeModifiers(data, config): ModifierSource | undefined {
		if (configError(config) !== null) return undefined;
		const enrolling = (config.fields ?? []).filter((field) => fieldType(field) === 'modifier');
		if (enrolling.length === 0) return undefined;
		const gated = exclusiveField(config) !== null;
		const noun = recordNoun(config);
		const records = entries(data);
		return (resolve) => {
			const pushes: ModifierPush[] = [];
			for (const record of records) {
				if (record.error !== null) continue;
				if (gated && !isOn(config, record)) continue;
				let row: RowValues | null = null;
				for (const field of enrolling) {
					for (const part of cellParts(record.fields[field.key] ?? '')) {
						row ??= recordValues(config.fields, noun, record, resolve);
						pushes.push({
							part,
							source: config.label,
							row,
							...(gated ? { inPlay: true } : {}),
						});
					}
				}
			}
			return pushes;
		};
	},

	write(data, body, config): string {
		const section = splitRecords(body ?? '');
		let preamble = section.preamble;
		if (data.uses !== undefined) preamble = withUses(preamble, data.uses);
		const records = [...section.records];
		/*
		 * **The prose and the action list first, by position as read**, because
		 * both live in the record's rest and Record set's delta writes a body as
		 * one string — which here would overwrite the table. Removals and appends
		 * then run on the shared path, after, so a position still means what the
		 * render meant by it.
		 */
		const deltas: Record<number, Partial<RecordEntry>> = {};
		for (const [position, delta] of Object.entries(data.records ?? {})) {
			const { body: text, ...rest } = delta;
			void text;
			deltas[Number(position)] = rest;
		}
		const touched = new Set([
			...Object.keys(data.records ?? {}).filter(
				(position) => data.records[Number(position)]?.body !== undefined,
			),
			...Object.keys(data.actionEdits ?? {}),
		]);
		for (const position of touched) {
			const at = Number(position);
			const block = records[at];
			if (block === undefined) continue;
			// A record whose fence will not read is one this must not write.
			if (!readFenced(block.head + block.rest).ok) continue;
			const rest = withBody(
				config,
				block.rest,
				data.actionEdits?.[at],
				data.records?.[at]?.body,
			);
			if (rest !== block.rest) records[at] = withRecordBody(block, block.head, rest);
		}
		const next: RecordSection = editRecords(
			{ preamble, records },
			{ records: deltas, added: data.added, removed: data.removed },
			config.fields,
		);
		return joinRecords(next);
	},

	resetColumns(config): readonly ResetColumn[] {
		const columns = resetColumnsOf(config);
		return hasUses(config) ? [...columns, { key: USES_KEY, label: 'Uses' }] : columns;
	},

	/**
	 * A rest, on a part the binding names (SPEC §6). A field means exactly what
	 * it means on a Record set — every record's own ceiling, skipping a record
	 * with none — through the same arithmetic, moved rather than copied. `uses`
	 * means what a Pool's current does: 0, its ceiling, or the resolved number.
	 * **A binding naming no part is refused**, on Table's terms: there is no
	 * whole for it to mean.
	 */
	applyReset(data, config, reset, context): ResetResult<StatBlockData> {
		const next: StatBlockData = { records: {} };
		const { action } = reset;
		if (action === undefined) return { ok: true, data: next };
		if (reset.column === undefined) {
			return {
				ok: false,
				error: 'this trigger does not say which field to act on. Give the binding a field, or remove it.',
			};
		}
		if (reset.column === USES_KEY && hasUses(config)) {
			if (action === 'empty') return { ok: true, data: { records: {}, uses: '0' } };
			const field = action === 'full' ? 'uses' : 'reset.to';
			const value = context.resolve(field, {});
			const number = value === null ? NaN : Number(value);
			if (!Number.isFinite(number)) {
				return {
					ok: false,
					error:
						value === null
							? (context.explain(field, {}) ?? 'its uses could not be worked out.')
							: `it came to "${String(value)}", which is not a number.`,
				};
			}
			return { ok: true, data: { records: {}, uses: String(Math.max(0, Math.floor(number))) } };
		}
		const result = fieldReset(config, recordViews(data), { ...reset, action }, context);
		return result.ok ? { ...result, data: { ...result.data } } : result;
	},

	render(container, config, data, context): void {
		container.replaceChildren();
		const doc = container.ownerDocument;
		const error = configError(config);
		if (error !== null) {
			element('div', 'sheetsmith-error', container, error);
			return;
		}

		const noun = recordNoun(config);
		const lower = noun.toLowerCase();
		const records = entries(data);
		const toggle = exclusiveField(config);
		const exclusive = toggle !== null;
		const active = records
			.map((record, at) => ({ record, at }))
			.filter(({ record }) => isOn(config, record));

		const block = element('div', 'sheetsmith-placed sheetsmith-stat-block', container);
		block.style.setProperty('--sheetsmith-rows', String(config.position.height));
		const head = element('div', 'sheetsmith-stat-block-head', block);
		if (showsOwnLabel(config, context)) {
			element('div', 'sheetsmith-component-label sheetsmith-stat-block-label', head, config.label);
		}
		const box = element('div', 'sheetsmith-placed-box sheetsmith-stat-block-box', block);
		const status = element('div', 'sheetsmith-sr-only', block);
		status.setAttribute('aria-live', 'polite');
		const controls: RecordHost = { context, id: config.id, noun, status };
		const { refusal } = recordRefusals(controls);
		const armed = armRegister();

		const landing = awaitingAdd?.id === config.id && records.length > awaitingAdd.held;
		const landedAt = landing && awaitingAdd !== null ? awaitingAdd.held : -1;
		if (landing) awaitingAdd = null;
		const opened = new Set(context.openRecords ?? []);
		let face = exclusive && context.activeTab === LIBRARY_FACE ? LIBRARY_FACE : PLAY_FACE;
		const nameFields = new Map<number, HTMLInputElement>();

		const ceiling = hasUses(config)
			? usesCeiling((field) => context.resolveField(field, {}))
			: null;
		const left = usesLeft(data, ceiling);

		/*
		 * **Where the uses counter sits follows the face.** On **In play** it is in
		 * the panel's own head, beside the form it is spent on; on **Every form**
		 * and on a companion block, which has no such head, it stays beside the
		 * component's label. One slot, redrawn with the face.
		 */
		const usesSlot = element('div', 'sheetsmith-stat-block-uses-slot', head);

		const scroll = element('div', 'sheetsmith-stat-block-scroll', box);
		const content = element('div', 'sheetsmith-stat-block-content', scroll);
		const foot = element('div', 'sheetsmith-stat-block-foot', box);

		paint();
		if (landedAt >= 0) nameFields.get(landedAt)?.focus();

		/** Redraw the face the reader is on; nothing here reaches the note. */
		function paint(): void {
			content.replaceChildren();
			foot.replaceChildren();
			usesSlot.replaceChildren();
			nameFields.clear();
			const inPlay = exclusive && face === PLAY_FACE;
			if (hasUses(config) && !inPlay) drawUses(usesSlot);
			if (!exclusive) {
				drawLibrary(false);
				return;
			}
			if (face === LIBRARY_FACE) drawLibrary(true);
			else drawPlay();
		}

		function setFace(next: number): void {
			face = next;
			// Painted before reporting, because nothing here reaches the note: no
			// write means no rebuild, so a control waiting for one would never
			// answer the press at all (PATTERNS §5).
			paint();
			context.onActivateTab?.(next);
		}

		/** The uses counter: one ring per use, filled for each left. */
		function drawUses(into: HTMLElement): void {
			if (data?.usesError !== undefined) {
				element(
					'div',
					'sheetsmith-error sheetsmith-stat-block-uses-problem',
					into,
					`The uses count will not read. ${data.usesError}`,
				);
				return;
			}
			const uses = element('div', 'sheetsmith-stat-block-uses', into);
			if (ceiling === null || left === null) {
				uses.textContent = 'Uses ?';
				uses.title = 'The ceiling for these uses could not be worked out. Fix its formula in the layout editor.';
				return;
			}
			/*
			 * **One focusable control holding every ring, which is Track's run and
			 * not a row of buttons**: a counter is one value, so it is one tab stop
			 * with `role="slider"` — Track's own spelling for a run — where a ring
			 * per use would put two to six stops on a value the arrows already step.
			 * The rings are its paint, through the shared painter, and a press on one
			 * sets the count there by Track's run rule; `bindRingControl` is for a
			 * ring that is itself a control, which these are not.
			 */
			const max = ceiling;
			let count = left;
			const run = element('div', 'sheetsmith-stat-block-uses-run', uses);
			run.tabIndex = 0;
			run.setAttribute('role', 'slider');
			run.setAttribute('aria-label', 'Uses');
			run.setAttribute('aria-valuemin', '0');
			const marks: HTMLElement[] = [];
			if (max <= MAX_RINGS) {
				for (let ring = 1; ring <= max; ring++) {
					const mark = element('span', 'sheetsmith-level-ring sheetsmith-stat-block-use', run);
					mark.setAttribute('aria-hidden', 'true');
					// The press on the ring the count stands on clears it, so the last
					// use can be spent from the ring itself: Track's run rule.
					mark.addEventListener('click', () => set(ring === count ? ring - 1 : ring));
					marks.push(mark);
				}
			}
			const reading = element('span', 'sheetsmith-pool-ceiling sheetsmith-stat-block-uses-count', run);
			const value = element('span', 'sheetsmith-stat-block-uses-value', reading);
			element('span', 'sheetsmith-pool-separator', reading, '/');
			element('span', 'sheetsmith-pool-max', reading, String(max));
			/** Repaint from `count`, so a press answers before the rebuild does. */
			const paint = (): void => {
				marks.forEach((mark, index) =>
					paintLevelRing(mark, {}, index + 1 <= count ? 1 : 0, false),
				);
				// The numerals past six rings, or where a count stands above its ceiling.
				// Detached rather than `hidden`, which the ceiling's own `display` beats.
				if (max > MAX_RINGS || count > max) run.appendChild(reading);
				else reading.remove();
				value.textContent = String(count);
				run.setAttribute('aria-valuemax', String(Math.max(max, count)));
				run.setAttribute('aria-valuenow', String(count));
				run.setAttribute('aria-valuetext', `Uses ${count} of ${max}`);
			};
			/**
			 * Set the count, held to 0 and — going up — to the ceiling, as Track's
			 * run holds a step to its total. A count stored above the ceiling is never
			 * clamped: it may step down through it, and an up step does nothing.
			 */
			function set(next: number): void {
				const held = Math.max(0, next > count ? Math.min(next, Math.max(max, count)) : next);
				if (held === count) return;
				count = held;
				// Painted before reporting (PATTERNS §5): a second arrow press before
				// the rebuild then steps from what is on screen, not from the note.
				paint();
				status.textContent = `Uses ${held} of ${max}`;
				context.onChange({ records: {}, uses: String(held) });
			}
			paint();
			run.addEventListener('keydown', (event) => {
				if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
					event.preventDefault();
					set(count + 1);
				} else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
					event.preventDefault();
					set(count - 1);
				}
			});
		}

		/**
		 * One switch, as one write: every form on goes off, the chosen one goes
		 * on, and a use is spent where the layout asks and one is left.
		 */
		function choose(at: number | null): void {
			if (toggle === null) return;
			const edit: StatBlockData = { records: {} };
			for (const { at: on } of active) {
				if (on !== at) edit.records[on] = { fields: { [toggle.key]: flagText(false) } };
			}
			const alreadyOn = at !== null && active.some((one) => one.at === at);
			if (at !== null && !alreadyOn) {
				edit.records[at] = { fields: { [toggle.key]: flagText(true) } };
			}
			// A use is spent only where the press turns a form on: choosing one that
			// is already on, even out of two on, turns nothing on.
			const turningOn = at !== null && !alreadyOn;
			let said: string;
			if (at === null) {
				said = `No ${lower} active`;
			} else {
				const named = recordLabel(records[at]?.name ?? '', noun);
				said = `${named} active`;
				if (turningOn && config.spendOnPick === true && hasUses(config) && left !== null) {
					if (left > 0) {
						edit.uses = String(left - 1);
						said = `${named} active, ${left - 1 === 0 ? 'no uses' : left - 1 === 1 ? '1 use' : `${left - 1} uses`} left`;
					} else {
						said = `${named} active, no uses left`;
					}
				}
			}
			if (Object.keys(edit.records).length === 0 && edit.uses === undefined) return;
			status.textContent = said;
			context.onChange(edit);
		}

		function drawPlay(): void {
			const readable = records
				.map((record, at) => ({ record, at }))
				.filter(({ record }) => record.error === null);
			if (records.length === 0) {
				element('p', 'sheetsmith-stat-block-empty', content, `No ${lower}s yet.`);
				const add = element('button', 'sheetsmith-stat-block-action', content, `Add ${lower}`);
				add.type = 'button';
				add.addEventListener('click', () => addRecord());
				return;
			}
			/*
			 * **The head reads first, as a title**: the form in play is the panel's
			 * name, and the uses, the picker and **Revert** share its row, so what the
			 * character is and how to change it are one line (B1 of the reading pass).
			 */
			const playHead = element('div', 'sheetsmith-stat-block-play-head', content);
			const names = active.map(({ record }) => recordLabel(record.name, noun));
			element(
				'div',
				`sheetsmith-stat-block-title${active.length === 0 ? ' sheetsmith-stat-block-title-none' : ''}`,
				playHead,
				active.length === 0 ? `No ${lower} active` : spokenList(names),
			);
			if (hasUses(config)) drawUses(playHead);
			const pick = element('div', 'sheetsmith-stat-block-pick', playHead);
			const menu = element('div', 'sheetsmith-record-menu sheetsmith-stat-block-menu', pick);
			const select = element('select', 'sheetsmith-record-select sheetsmith-stat-block-select', menu);
			select.setAttribute('aria-label', `${config.label}: ${lower} in play`);
			const none = element('option', '', select, 'None');
			none.value = '';
			for (const { record, at } of readable) {
				const option = element('option', '', select, recordLabel(record.name, noun));
				option.value = String(at);
			}
			if (active.length > 1) {
				// The stored value its list does not offer, as a Card's dropdown
				// carries one: shown, selected, and never written by being chosen.
				const several = element(
					'option',
					'',
					select,
					spokenList(active.map(({ record }) => recordLabel(record.name, noun))),
				);
				several.value = SEVERAL_VALUE;
				several.disabled = true;
				select.value = SEVERAL_VALUE;
			} else {
				select.value = active.length === 1 ? String(active[0]?.at) : '';
			}
			select.addEventListener('change', () => {
				if (select.value === SEVERAL_VALUE) return;
				choose(select.value === '' ? null : Number(select.value));
			});
			if (active.length > 0) {
				const revert = element('button', 'sheetsmith-stat-block-revert', pick);
				revert.type = 'button';
				const glyph = element('span', 'sheetsmith-stat-block-revert-glyph', revert);
				glyph.setAttribute('aria-hidden', 'true');
				setIcon(glyph, 'undo-2');
				element('span', '', revert, 'Revert');
				revert.addEventListener('click', () => choose(null));
			}

			if (active.length > 1) {
				const names = spokenList(active.map(({ record }) => recordLabel(record.name, noun)));
				element(
					'div',
					'sheetsmith-error sheetsmith-stat-block-report',
					content,
					`${names} are both active, so both apply. Choose one to keep.`,
				);
			}
			if (active.length === 0) {
				element(
					'p',
					'sheetsmith-stat-block-empty',
					content,
					config.spendOnPick === true && hasUses(config)
						? `No ${lower} is active. Choosing one spends a use.`
						: `No ${lower} is active.`,
				);
			}
			for (const { record, at } of active) {
				const named = recordLabel(record.name, noun);
				const panel = element('div', 'sheetsmith-stat-block-form', content);
				if (active.length > 1) element('div', 'sheetsmith-stat-block-form-name', panel, named);
				drawForm(panel, record, at, named, false);
			}
			// Active but unreadable is not "on" to `isOn`, so it is said here: the
			// note holds it switched on and nothing else can be drawn for it.
			for (const record of records) {
				if (record.error === null || record.heldOn !== true) continue;
				element(
					'div',
					'sheetsmith-error',
					content,
					`${recordLabel(record.name, noun)} is active in the note but its fields will not read.`,
				);
			}

			const every = element('button', 'sheetsmith-record-add sheetsmith-stat-block-switch', foot);
			every.type = 'button';
			element('span', 'sheetsmith-record-add-label', every, `Every ${lower} (${records.length})`);
			every.addEventListener('click', () => setFace(LIBRARY_FACE));
		}

		/**
		 * Every record in file order, each a line of chevron, name and delete, its
		 * stat block under it when open. **With `exclusive` it is the library
		 * face; without, it is the whole component**, a companion block, where
		 * the first record is open until the reader closes it.
		 */
		function drawLibrary(asFace: boolean): void {
			const list = element('div', 'sheetsmith-stat-block-list', content);
			if (records.length === 0) {
				element('p', 'sheetsmith-stat-block-empty', list, `No ${lower}s yet.`);
			}
			records.forEach((record, at) => {
				const named = recordLabel(record.name, noun);
				const row = element('div', 'sheetsmith-record sheetsmith-stat-block-record', list);
				const summary = element('div', 'sheetsmith-record-summary', row);
				const detail = element('div', 'sheetsmith-stat-block-detail', row);
				detail.id = `sheetsmith-stat-block-${config.id}-${at}`;
				const chevron = element('button', 'sheetsmith-record-disclosure', summary);
				/*
				 * **A companion block opens its first record by default**, and the
				 * view's set holds the records whose state differs from that: the
				 * posture pair is a set of indices with no "never touched" state, so
				 * the default is read back as an exclusive-or rather than a second pair
				 * — which is why a delete shifts it through `shiftOpenRecords`.
				 */
				const isDefault = defaultOpen(at);
				const startsOpen = isDefault !== opened.has(at);
				bindDisclosure({
					button: chevron,
					region: detail,
					open: startsOpen,
					named,
					onToggle: (open) => {
						summaryLine?.toggleAttribute('hidden', open);
						context.onToggleRecord?.(at, open !== isDefault);
					},
				});
				let summaryLine: HTMLElement | null = null;
				const input = drawRecordName(summary, controls, record, named, (next) => {
					context.onChange({ records: { [at]: { name: next } } });
				});
				if (input !== null) nameFields.set(at, input);
				if (asFace && isOn(config, record)) {
					// Right after the name, in the name's own track, rather than in the
					// line's next column.
					const nameCell = summary.querySelector<HTMLElement>('.sheetsmith-record-name');
					nameCell?.classList.add('sheetsmith-stat-block-named');
					element('span', 'sheetsmith-stat-block-tag', nameCell ?? summary, 'Active');
				}
				/*
				 * **A closed form says its vitals on its line**, so the list can be
				 * scanned without opening each form; open, the stat block under it says
				 * them, and the line goes.
				 */
				const vitals =
					record.error === null
						? vitalsSummary(
								config.fields ?? [],
								record,
								(config.fields ?? [])
									.filter((field) => fieldType(field) === 'modifier')
									.flatMap((field) => formChanges(field, record)),
							)
						: '';
				summaryLine = vitals === '' ? null : element('span', 'sheetsmith-stat-block-summary', summary, vitals);
				summaryLine?.toggleAttribute('hidden', startsOpen);
				const remove = element('button', 'sheetsmith-record-remove', summary);
				remove.type = 'button';
				setIcon(remove, REMOVE_ICON);
				bindArmToConfirm({
					button: remove,
					row,
					armedClass: 'sheetsmith-record-remove-armed',
					rowClass: 'sheetsmith-record-arming',
					named: `Delete ${named}`,
					announce: (said) => {
						status.textContent = said;
					},
					commit: () => {
						shiftOpen(at);
						context.onChange({ records: {}, removed: [at] });
					},
					register: armed,
					doc,
				});
				if (record.error !== null) {
					element('div', 'sheetsmith-error', row, record.error);
				}
				drawForm(detail, record, at, named, true);
			});

			if (asFace) {
				// In the foot beside **Add form** and in its clothes, so the face's two
				// ways out sit together where the other face's switch sits.
				const back = element('button', 'sheetsmith-record-add sheetsmith-stat-block-back', foot);
				back.type = 'button';
				element('span', 'sheetsmith-record-add-label', back, 'Back to play');
				back.addEventListener('click', () => setFace(PLAY_FACE));
			}
			const add = element('button', 'sheetsmith-record-add sheetsmith-stat-block-add', foot);
			add.type = 'button';
			element('span', 'sheetsmith-record-add-label', add, `Add ${lower}`);
			add.addEventListener('click', () => addRecord());
		}

		/** Whether a record's stat block is open where the view's set does not hold it. */
		function defaultOpen(at: number): boolean {
			return !exclusive && at === 0;
		}

		/**
		 * Move the open set and the prose disclosures past a record that is going,
		 * in the same commit as the delete, so the record that takes its place
		 * inherits neither.
		 */
		function shiftOpen(removedAt: number): void {
			shiftOpenRecords(
				opened,
				removedAt,
				records.length,
				(at, inSet) => context.onToggleRecord?.(at, inSet),
				defaultOpen,
			);
			shiftOpenBodies(config.id, removedAt, records.length);
		}

		/** Append a record named for the noun, open it, and land in its name. */
		function addRecord(): void {
			awaitingAdd = { id: config.id, held: records.length };
			if (!defaultOpen(records.length)) context.onToggleRecord?.(records.length, true);
			if (exclusive) {
				face = LIBRARY_FACE;
				context.onActivateTab?.(LIBRARY_FACE);
			}
			status.textContent = `${noun} added`;
			context.onChange({ records: {}, added: [{ name: noun }] });
		}

		/**
		 * One form's stat block, **one anatomy in two modes**: the vitals strip and
		 * the sections, in the order and under the headings the layout sets
		 * (`sections`). **In play reads it**: a text field and the actions are
		 * text. **Every form edits it**: the same strip and the same sections, with
		 * fields where In play has text, the action table's cells fields, and the
		 * edit glyph labelled. What a reader steps at the table — a ceilinged
		 * number's steppers, a toggle — is a control in both.
		 */
		function drawForm(
			into: HTMLElement,
			record: StatBlockEntry,
			at: number,
			named: string,
			editing: boolean,
		): void {
			if (record.error !== null) {
				drawBroken(into, record, named);
				return;
			}
			const scope = storedLayer(config.fields, record);
			const fields = (config.fields ?? []).filter(
				(field) => !(toggle !== null && field.key === toggle.key),
			);
			const changes = new Map<string, FormChange[]>();
			for (const field of fields) {
				if (fieldType(field) === 'modifier') changes.set(field.key, formChanges(field, record));
			}
			// A form's `=` on a component's single number is one of its stats, so it
			// is read in the strip beside HP and Speed rather than in the list.
			const set = [...changes.values()].flat().filter((change) => change.vital);
			for (const part of sectionOrder(config)) {
				if (part.key === 'vitals') {
					const vitals = fields.filter((field) => fieldType(field) !== 'modifier');
					if (vitals.length === 0 && set.length === 0) continue;
					const host = part.name === undefined ? into : section(into, part.name).body;
					const strip = element('div', 'sheetsmith-stat-block-vitals', host);
					for (const field of vitals) drawVital(strip, into, field, record, at, named, scope, editing);
					for (const change of set) drawSetVital(strip, change);
				} else if (part.key === 'modifiers') {
					for (const field of fields) {
						if (fieldType(field) === 'modifier') {
							drawPlayChanges(
								into,
								field,
								record,
								at,
								named,
								part.name ?? fieldLabel(field),
								editing,
								changes.get(field.key) ?? [],
							);
						}
					}
				} else if (part.key === 'actions') {
					if (actionColumns(config).length === 0) continue;
					const heading = part.name ?? actionName(config);
					drawActionTable(section(into, heading).body, record, at, named, heading, editing);
				} else {
					drawProse(into, record, at, named, part.name ?? bodyName(config));
				}
			}
		}

		/** A record whose fence will not read: its prose alone, which is what survives. */
		function drawBroken(into: HTMLElement, record: StatBlockEntry, named: string): void {
			if (record.body === '') return;
			const prose = element('div', 'sheetsmith-record-body', into);
			drawRecordBody(prose, into, controls, { text: record.body, error: record.error, named }, () => undefined);
		}

		/** One vital: its name over its value, the value a control where it is stepped. */
		function drawVital(
			strip: HTMLElement,
			row: HTMLElement,
			field: RecordField,
			record: StatBlockEntry,
			at: number,
			named: string,
			scope: Record<string, FieldValue>,
			editing: boolean,
		): void {
			const type = fieldType(field);
			const name = fieldLabel(field);
			const raw = record.fields[field.key] ?? '';
			const item = element('div', `sheetsmith-stat-block-vital sheetsmith-stat-block-vital-${type}`, strip);
			element('div', 'sheetsmith-component-label sheetsmith-stat-block-vital-label', item, name);
			const value = element('div', 'sheetsmith-stat-block-vital-value', item);
			const commit = (next: string): void => {
				context.onChange({ records: { [at]: { fields: { [field.key]: next } } } });
			};
			if (type === 'text') {
				// Read in play; a field under **Every form**, which is the form's editor.
				if (editing) drawText(value, row, raw, `${named} ${name}`, commit);
				else element('span', 'sheetsmith-stat-block-vital-text', value, raw.trim() === '' ? '—' : raw);
				return;
			}
			if (type === 'toggle') {
				const button = element('button', 'sheetsmith-level-ring sheetsmith-stat-block-ring', value);
				button.type = 'button';
				const ring = bindRingControl({
					button,
					column: {},
					count: 1,
					graded: false,
					level: isFlagSet(raw) ? 1 : 0,
					name: `${named} ${name}`,
					nameOnScreen: true,
					onSet: (level) => {
						ring.setLevel(level);
						commit(flagText(level > 0));
					},
				});
				return;
			}
			const accessible = `${named} ${name}`;
			const cell = element('div', 'sheetsmith-stat-block-number', value);
			const number = drawRecordNumber(cell, row, controls, { field, raw, name, accessible, body: true, scope }, commit);
			if (!(recordsOwnMax(field) || field.max !== undefined)) return;
			const stored = splitBounded(raw).value;
			if (stored.trim() !== '' && Number.isFinite(Number(stored)) && Number(stored) <= 0) {
				item.classList.add('sheetsmith-stat-block-down');
				// The stored value as the tile draws it, with a true minus sign.
				const shown = Number(stored.trim());
				const said = shown < 0 ? `\u2212${String(-shown)}` : String(shown);
				element('div', 'sheetsmith-stat-block-down-note', row, `At ${said}. Carry any leftover damage over by hand.`);
			}
			drawSteppers(cell, number.input, accessible, field, (next) => number.set(next), number.ceiling);
		}

		/**
		 * A form's `=` on a component's single number, as a vital: the component's
		 * label over the number it is set to, read on both faces since the
		 * modifier glyph is where it is edited. One that is not applying says why
		 * in words beside its muted number, as the list would.
		 */
		function drawSetVital(strip: HTMLElement, change: FormChange): void {
			const item = element('div', 'sheetsmith-stat-block-vital sheetsmith-stat-block-vital-set', strip);
			element('div', 'sheetsmith-component-label sheetsmith-stat-block-vital-label', item, change.label);
			const value = element('div', 'sheetsmith-stat-block-vital-value', item);
			element(
				'span',
				change.applies ? 'sheetsmith-stat-block-vital-text' : 'sheetsmith-stat-block-vital-text sheetsmith-stat-block-change-idle',
				value,
				change.why === null ? change.text : `${change.text} (${change.why})`,
			);
		}

		/**
		 * Each change a modifier field makes, worked out once per draw so the strip
		 * and the list share it. With no sheet to ask, as on the canvas, a part is
		 * read as the note spells it and stays in the list.
		 */
		function formChanges(field: RecordField, record: StatBlockEntry): FormChange[] {
			const raw = record.fields[field.key] ?? '';
			const values = (): RowValues => recordValues(config.fields, noun, record, context.resolveField);
			const said: FormChange[] = [];
			let held: RowValues | null = null;
			for (const part of cellParts(raw)) {
				const outcomes = context.modifiers?.outcomes(part, (held ??= values())) ?? [];
				if (outcomes.length === 0) {
					said.push({ group: part, label: part, text: part, applies: true, why: null, vital: false });
					continue;
				}
				for (const outcome of outcomes) {
					const item = compactChange(part, outcome);
					/*
					 * **Why a part is not applying, in words, beside the muted colour**,
					 * so the difference survives forced colors and a reader not seeing
					 * colour: the stacking rule's own reason, the one the breakdown and
					 * the form give (`already higher`), or the condition not holding.
					 */
					const why = outcome.applies
						? null
						: (outcome.suppressed ?? (outcome.condition === false ? 'its condition does not hold now' : null));
					const vital = setsOneNumber(outcome);
					said.push({
						group: item.group,
						label: outcome.targetLabel,
						text: vital ? String(outcome.amount) : item.text,
						applies: outcome.applies,
						why,
						vital,
					});
				}
			}
			return said;
		}

		/**
		 * A section of the form, **read as a placed component on a small sheet**:
		 * its heading at the component label's rank above it, and its body under
		 * that — framed in the card's border and radius where the body is text
		 * (`framed`), or holding a surface of its own (the vitals' tiles, the
		 * actions' Table box).
		 */
		function section(
			into: HTMLElement,
			heading: string,
			framed = false,
		): { head: HTMLElement; body: HTMLElement } {
			const wrap = element('section', 'sheetsmith-stat-block-section', into);
			const head = element('div', 'sheetsmith-stat-block-section-head', wrap);
			element('h4', 'sheetsmith-component-label sheetsmith-stat-block-section-heading', head, heading);
			const body = element(
				'div',
				framed ? 'sheetsmith-stat-block-section-body sheetsmith-stat-block-panel' : 'sheetsmith-stat-block-section-body',
				wrap,
			);
			return { head, body };
		}

		/**
		 * A modifier field as compact items grouped by the component each reaches —
		 * `STR +4 · DEX +0 · CON +3`, `Armour class 11` — under a heading that is
		 * the field's own name, with the glyph that edits them beside it. The
		 * heading is the glyph's visible label: its accessible name, `Brown Bear
		 * Modifiers: …`, contains it, so a voice command naming it reaches it.
		 */
		function drawPlayChanges(
			into: HTMLElement,
			field: RecordField,
			record: StatBlockEntry,
			at: number,
			named: string,
			heading: string,
			editing: boolean,
			changes: readonly FormChange[],
		): void {
			const raw = record.fields[field.key] ?? '';
			const values = (): RowValues => recordValues(config.fields, noun, record, context.resolveField);
			const { head, body } = section(into, heading);
			const glyphCell = element('span', 'sheetsmith-stat-block-change-glyph', head);
			drawRecordModifier(
				glyphCell,
				into,
				controls,
				{ raw, named, fieldName: fieldLabel(field), panelKey: `${config.id}:${at}:${field.key}`, values },
				(next) => context.onChange({ records: { [at]: { fields: { [field.key]: next } } } }),
			);
			if (editing) labelGlyph(glyphCell);
			const groups = new Map<string, { text: string; applies: boolean }[]>();
			for (const change of changes) {
				if (change.vital) continue;
				const list = groups.get(change.group) ?? [];
				list.push({ text: change.why === null ? change.text : `${change.text} (${change.why})`, applies: change.applies });
				groups.set(change.group, list);
			}
			if (groups.size === 0) {
				// Every change it makes is read in the strip: the heading stays, as
				// the label of the glyph that edits them.
				if (!changes.some((change) => change.vital)) element('p', 'sheetsmith-stat-block-empty', body, 'No changes');
				return;
			}
			const list = element('ul', 'sheetsmith-stat-block-changes', body);
			list.setAttribute('aria-label', `${named} ${fieldLabel(field)}`);
			for (const items of groups.values()) {
				const line = element('li', 'sheetsmith-stat-block-change', list);
				items.forEach((item, index) => {
					if (index > 0) element('span', 'sheetsmith-stat-block-change-separator', line, ' · ');
					element(
						'span',
						item.applies ? 'sheetsmith-stat-block-change-item' : 'sheetsmith-stat-block-change-item sheetsmith-stat-block-change-idle',
						line,
						item.text,
					);
				});
			}
		}

		/**
		 * `−` and `+` after the reading, on Pool's own step buttons: Shift steps
		 * ten and a held press repeats. A run of presses is one commit, written
		 * through the field's own path once the run stops.
		 */
		function drawSteppers(
			cell: HTMLElement,
			input: HTMLInputElement,
			name: string,
			field: RecordField,
			set: (next: string) => void,
			ceilingNow: () => number | null,
		): void {
			const stepDraft = (delta: number): void => {
				const raw = input.value.trim();
				const current = raw === '' || !Number.isFinite(Number(raw)) ? 0 : Number(raw);
				let next = current + delta;
				const max = ceilingNow();
				if (max !== null) next = Math.min(next, max);
				if (field.min !== undefined) next = Math.max(next, field.min);
				input.value = String(next);
			};
			// The run's write, through the field's own path (`commit-window.ts`).
			const run = commitWindow(doc.defaultView, input, () => set(input.value));
			const commitSoon = run.soon;
			const steps = element('span', 'sheetsmith-stat-block-steps', cell);
			steps.appendChild(stepButton(doc, input, name, -1, 'sheetsmith-pool-step sheetsmith-stat-block-step', stepDraft, commitSoon));
			steps.appendChild(stepButton(doc, input, name, 1, 'sheetsmith-pool-step sheetsmith-stat-block-step', stepDraft, commitSoon));
		}

		/** A one-line text field, refused where it would put a link in the fence. */
		function drawText(
			line: HTMLElement,
			row: HTMLElement,
			raw: string,
			accessible: string,
			commit: (next: string) => void,
		): void {
			/*
			 * **A one-row field that wraps**, the action cells' rule: a `<textarea>`
			 * one row tall that grows with its text, on the same one-line gesture —
			 * Enter commits, a line break is refused — so a beast's speed shows
			 * whole in a narrow tile rather than clipping.
			 */
			const input = element(
				'textarea',
				'sheetsmith-record-input sheetsmith-record-input-text sheetsmith-stat-block-cell sheetsmith-stat-block-text',
				line,
			);
			input.rows = 1;
			input.value = raw;
			input.placeholder = '—';
			input.setAttribute('aria-label', accessible);
			input.spellcheck = false;
			const showRefusal = recordRefusalNotice(controls, row);
			bindEditable(input, {
				initial: raw,
				announceCommit: (next) => {
					status.textContent = next === '' ? `${accessible} cleared` : `${accessible} ${next}`;
				},
				announceRestore: (restored) => {
					status.textContent = `${accessible} restored to ${restored === '' ? 'empty' : restored}`;
				},
				refuse: (next) =>
					refusal(next) ??
					(/[\r\n]/.test(next)
						? 'Not saved. A field is one line, because the sheet block holds one entry per line. Remove the line break.'
						: null),
				onRefusal: showRefusal,
				onCommit: commit,
			});
		}

		/**
		 * **The action list, one table in both faces**: the sheet's own Table —
		 * `.sheetsmith-table` inside `.sheetsmith-table-box`, its header row,
		 * its row rules and its framed surface — with one column structure held
		 * by one `<colgroup>`: the name about 30%, a number about five
		 * characters, a text column the rest. **In play the cells are text**, the
		 * name bold with its links live and a number signed; **under Every form
		 * they are fields**, chromeless until hovered or focused, set so their
		 * text sits where In play's does, with a delete column and **Add** as the
		 * box's foot, the Table's own add row.
		 */
		function drawActionTable(
			into: HTMLElement,
			record: StatBlockEntry,
			at: number,
			named: string,
			heading: string,
			editing: boolean,
		): void {
			const columns = actionColumns(config);
			const all = record.actions ?? [];
			/*
			 * **A placeholder row is not an action in play.** **Add** writes a row
			 * named for `actionName` with every other cell empty, which is
			 * scaffolding to fill in under Every form; read as a row it would be an
			 * attack called *Attack* with no bonus and no damage. So In play leaves
			 * out a row whose name is still that word and whose other cells are all
			 * empty. A row with a name of its own and no numbers — *Multiattack* —
			 * is a real action and is drawn.
			 */
			const shown = all
				.map((cells, index) => ({ cells, index }))
				.filter(({ cells }) => editing || !isPlaceholderAction(cells, actionName(config)));
			if (!editing && shown.length === 0) {
				element('p', 'sheetsmith-stat-block-empty', into, 'None yet. Add them under Every form.');
				return;
			}
			const wrap = element(
				'div',
				`sheetsmith-table-box sheetsmith-stat-block-actions${editing ? ' sheetsmith-stat-block-actions-editing' : ''}`,
				into,
			);
			const table = element('table', 'sheetsmith-table sheetsmith-stat-block-table', wrap);
			table.setAttribute('aria-label', `${named} ${actionName(config)}`);
			const widths = element('colgroup', '', table);
			element('col', 'sheetsmith-stat-block-col-name', widths);
			for (const column of columns) {
				element('col', `sheetsmith-stat-block-col-${column.type ?? 'text'}`, widths);
			}
			// The delete column on both faces, empty in play, so the percentages
			// resolve against one width and no column moves on a face switch.
			element('col', 'sheetsmith-stat-block-col-remove', widths);
			const headRow = element('tr', '', element('thead', '', table));
			/*
			 * **A column heading that says what its section's heading says is
			 * hidden from sight and kept for a screen reader**, which reads each
			 * cell by its column: *Attack* over *Attack* says one word twice. Any
			 * column, by what it says, rather than always the name column, so a
			 * renamed section that no longer repeats it shows it again.
			 */
			const repeats = (text: string): boolean => text.trim().toLowerCase() === heading.trim().toLowerCase();
			const headCell = (cls: string, text: string): void => {
				const th = element('th', cls, headRow);
				th.setAttribute('scope', 'col');
				if (repeats(text)) element('span', 'sheetsmith-sr-only', th, text);
				else th.textContent = text;
			};
			headCell('sheetsmith-stat-block-action-name', actionName(config));
			for (const column of columns) {
				headCell(`sheetsmith-stat-block-action-${column.type ?? 'text'}`, columnLabel(column));
			}
			const removeHead = element('th', 'sheetsmith-stat-block-remove-cell', headRow);
			if (editing) element('span', 'sheetsmith-sr-only', removeHead, 'Delete');
			else removeHead.setAttribute('aria-hidden', 'true');
			const body = element('tbody', '', table);
			if (!editing) {
				for (const { cells } of shown) {
					const tr = element('tr', 'sheetsmith-stat-block-action-row', body);
					const name = element('th', 'sheetsmith-stat-block-action-name', tr);
					name.setAttribute('scope', 'row');
					paintLinkedText(element('strong', '', name), cells[0] ?? '', { link: context.link });
					columns.forEach((column, offset) => {
						const td = element('td', `sheetsmith-stat-block-action-${column.type ?? 'text'}`, tr);
						const text = (cells[offset + 1] ?? '').trim();
						paintLinkedText(td, column.type === 'number' ? signedText(text) : text, { link: context.link });
					});
					element('td', 'sheetsmith-stat-block-remove-cell', tr).setAttribute('aria-hidden', 'true');
				}
				return;
			}
			const showRefusal = recordRefusalNotice(controls, wrap);
			all.forEach((cells, index) => {
				const tr = element('tr', '', body);
				const actionLabel = (cells[0] ?? '').trim() === '' ? `${actionName(config)} ${index + 1}` : cells[0] ?? '';
				const write = (heading: string, next: string): void => {
					context.onChange({
						records: {},
						actionEdits: { [at]: { rows: { [index]: { [heading]: next } } } },
					});
				};
				/*
				 * **One control for every cell, the name included**: a one-row field
				 * that wraps, at one height, padding and weight. The name was the
				 * record name's field and drew taller and bold beside its neighbours;
				 * its link reads live under In play, where the row is text.
				 */
				const nameCell = element('td', 'sheetsmith-stat-block-action-name', tr);
				const nameInput = element('textarea', 'sheetsmith-record-input sheetsmith-stat-block-cell', nameCell);
				nameInput.rows = 1;
				nameInput.value = cells[0] ?? '';
				nameInput.setAttribute('aria-label', `${named} ${actionName(config)} ${index + 1}`);
				bindEditable(nameInput, {
					initial: cells[0] ?? '',
					announceCommit: (next) => {
						status.textContent = `${actionName(config)} ${next}`;
					},
					refuse: pipeRefusal,
					onRefusal: showRefusal,
					onCommit: (next) => write(actionName(config), next),
				});
				columns.forEach((column, offset) => {
					const td = element('td', `sheetsmith-stat-block-action-cell sheetsmith-stat-block-action-${column.type ?? 'text'}`, tr);
					/*
					 * **A one-line field that wraps**: a `<textarea>` one row tall that
					 * grows with its text, on the same one-line gesture — Enter commits,
					 * a line break is refused — so "1d8+4 piercing" shows whole in a
					 * narrow cell rather than clipping, and the table never scrolls.
					 */
					const input = element('textarea', 'sheetsmith-record-input sheetsmith-stat-block-cell', td);
					input.rows = 1;
					const stored = cells[offset + 1] ?? '';
					/*
					 * **A number reads signed in its field as in its row**, `+6`; the
					 * sign is the drawing's, so a commit that only kept it writes nothing
					 * and one that changed the number writes it in the note's spelling.
					 */
					const signed = column.type === 'number';
					const shown = signed ? signedText(stored) : stored;
					input.value = shown;
					input.setAttribute('aria-label', `${actionLabel} ${columnLabel(column)}`);
					bindEditable(input, {
						initial: shown,
						step: column.type === 'number',
						announceCommit: (next) => {
							status.textContent = `${actionLabel} ${columnLabel(column)} ${next}`;
						},
						refuse: pipeRefusal,
						onRefusal: showRefusal,
						onCommit: (next) =>
							write(column.key, signed && !/^\+/.test(stored) ? next.replace(/^\+/, '') : next),
					});
				});
				const removeCell = element('td', 'sheetsmith-stat-block-remove-cell', tr);
				const remove = element('button', 'sheetsmith-table-remove-button sheetsmith-stat-block-remove', removeCell);
				remove.type = 'button';
				setIcon(remove, REMOVE_ICON);
				bindArmToConfirm({
					button: remove,
					row: tr,
					armedClass: 'sheetsmith-table-remove-armed',
					rowClass: 'sheetsmith-table-row-arming',
					named: `Delete ${actionLabel}`,
					announce: (said) => {
						status.textContent = said;
					},
					commit: () => {
						context.onChange({ records: {}, actionEdits: { [at]: { removed: [index] } } });
					},
					register: armed,
					doc,
				});
			});
			// The Table's own add row, the box's foot.
			const add = element(
				'button',
				'sheetsmith-table-add-button sheetsmith-stat-block-add-action',
				wrap,
				`Add ${actionName(config).toLowerCase()}`,
			);
			add.type = 'button';
			add.addEventListener('click', () => {
				status.textContent = `${actionName(config)} added`;
				context.onChange({
					records: {},
					actionEdits: { [at]: { added: [{ [actionName(config)]: actionName(config) }] } },
				});
			});
		}

		/** A record's prose behind a disclosure named `bodyName`, closed at first. */
		function drawProse(
			into: HTMLElement,
			record: StatBlockEntry,
			at: number,
			named: string,
			/** The section's heading, which is the disclosure's own word. */
			heading: string,
		): void {
			const key = `${config.id}:${at}`;
			const wrap = element('div', 'sheetsmith-stat-block-prose sheetsmith-stat-block-section', into);
			const toggleButton = element('button', 'sheetsmith-stat-block-disclosure', wrap);
			const glyph = element('span', 'sheetsmith-stat-block-disclosure-glyph', toggleButton);
			glyph.setAttribute('aria-hidden', 'true');
			element('span', 'sheetsmith-component-label sheetsmith-stat-block-section-heading', toggleButton, heading);
			const prose = element('div', 'sheetsmith-record-body sheetsmith-stat-block-body sheetsmith-stat-block-panel', wrap);
			prose.id = `sheetsmith-stat-block-body-${config.id}-${at}-${into.closest('.sheetsmith-stat-block-detail') === null ? 'play' : 'list'}`;
			// The button's visible word is its name, so the disclosure adds none.
			bindDisclosure({
				button: toggleButton,
				region: prose,
				glyph,
				open: openBodies.has(key),
				onToggle: (open) => {
					if (open) openBodies.add(key);
					else openBodies.delete(key);
				},
			});
			drawRecordBody(prose, wrap, controls, { text: record.body, error: null, named }, (next) =>
				context.onChange({ records: { [at]: { body: next } } }),
			);
		}
	},
};

/**
 * Why an action cell's text cannot be stored, or null: a line break, which a
 * table row cannot hold. A pipe is escaped by `writeTable`, and a link is
 * welcome, since the table is plain markdown Obsidian indexes.
 */
function pipeRefusal(next: string): string | null {
	return /[\r\n]/.test(next)
		? 'Not saved. A table cell is one line. Remove the line break.'
		: null;
}

/**
 * Whether an action row is the placeholder **Add** writes: its name still the
 * action column's own word, or blank, and every other cell empty.
 */
function isPlaceholderAction(cells: readonly string[], placeholder: string): boolean {
	const name = (cells[0] ?? '').trim().toLowerCase();
	if (name !== '' && name !== placeholder.trim().toLowerCase()) return false;
	return cells.slice(1).every((cell) => cell.trim() === '');
}

/**
 * A number as a modifier reads, signed: `6` reads `+6` and `0` reads `+0`, the
 * way a 5e sheet prints a modifier of nothing. Text that is not a number, or
 * already carries a sign, is left as written.
 */
function signedText(text: string): string {
	const value = Number(text);
	if (text.trim() === '' || !Number.isFinite(value) || /^[+-]/.test(text)) return text;
	return value >= 0 ? `+${text}` : text;
}

/**
 * One change as a compact item, and the component it is grouped under.
 *
 * The target's published label is `Abilities · STR` for a component's named
 * entry and `Armour class` for a bare one, which is all the sheet publishes:
 * a named entry is drawn by its key and grouped under its component, a bare
 * one by its label. **A set number is signed for a named entry and plain for a
 * bare one** — `STR +4`, `Armour class 11` — on the reading that an entry of a
 * set is a modifier and a component's own number is a total; the published
 * name carries no sign of its own to read instead.
 */
function compactChange(
	part: string,
	outcome: ModifierOutcome,
): { group: string; text: string } {
	if (outcome.definition === null && outcome.typed === null) return { group: part, text: part };
	const at = outcome.targetLabel.indexOf(' · ');
	const group = at < 0 ? outcome.targetLabel : outcome.targetLabel.slice(0, at);
	const lead = at < 0 ? outcome.targetLabel : outcome.targetLabel.slice(at + 3);
	const operator = outcome.change?.operator ?? outcome.typed?.operator ?? 'add';
	const said =
		operator === 'override' && outcome.amount !== null
			? at < 0
				? String(outcome.amount)
				: signedText(String(outcome.amount))
			: outcomeWords(outcome);
	return { group: at < 0 ? outcome.target : group, text: `${lead} ${said}` };
}

/** One change a form's modifier field makes, as the form reads it. */
interface FormChange {
	/** The component it is grouped under in the list. */
	group: string;
	/** The target's published label, which heads it in the strip. */
	label: string;
	/** What it says: `STR +4` in the list, the bare number in the strip. */
	text: string;
	applies: boolean;
	/** Why it is not applying, in words, or null. */
	why: string | null;
	/** Whether it is read in the vitals strip rather than in the list. */
	vital: boolean;
}

/**
 * Whether an outcome sets a component's single number outright: an `=` whose
 * target is a component's own value rather than one entry or row of it — the
 * published label carries no ` · ` — and whose amount works out. Such a change
 * is one of the form's stats, as HP and Speed are, so it is read in the vitals
 * strip. An addition, an at-least, and an `=` on a part of a component stay in
 * the list.
 */
function setsOneNumber(outcome: ModifierOutcome): boolean {
	const operator = outcome.change?.operator ?? outcome.typed?.operator ?? 'add';
	return (
		operator === 'override' &&
		outcome.amount !== null &&
		outcome.target !== '' &&
		!outcome.targetLabel.includes(' · ')
	);
}

/**
 * Give the edit glyph a visible label, **Edit changes**, on the face where a
 * form is edited. The words go into its accessible name too, ahead of what it
 * says about the parts, so the name contains the label a voice command reads.
 */
function labelGlyph(cell: HTMLElement): void {
	const button = cell.querySelector<HTMLButtonElement>('button');
	if (button === null) return;
	button.classList.add('sheetsmith-stat-block-edit-changes');
	element('span', 'sheetsmith-stat-block-edit-label', button, 'Edit changes');
	const said = button.getAttribute('aria-label') ?? '';
	button.setAttribute('aria-label', said === '' ? 'Edit changes' : `Edit changes. ${said}`);
}

/**
 * A closed form's vitals on one line, **mirroring its tiles in their order**:
 * each number field as the layout declares them — a ceilinged one as
 * `HP 22/34` — then each `=` the form sets on a component's single number that
 * applies, `Armour class 11`, so the library can be scanned without opening
 * each form. A text field, a toggle, and a set number that is not applying are
 * left to the open form, which can say them in full.
 */
function vitalsSummary(
	fields: readonly RecordField[],
	record: RecordEntry,
	changes: readonly FormChange[],
): string {
	const said: string[] = [];
	for (const field of fields) {
		if (fieldType(field) !== 'number') continue;
		const raw = record.fields[field.key] ?? '';
		const entry = splitBounded(raw);
		const value = entry.value.trim();
		if (value === '') continue;
		const ceiling = recordsOwnMax(field) ? (entry.ceiling ?? '').trim() : field.max !== undefined ? String(field.max) : '';
		said.push(`${fieldLabel(field)} ${ceiling === '' ? value : `${value}/${ceiling}`}`);
	}
	for (const change of changes) {
		if (change.vital && change.applies) said.push(`${change.label} ${change.text}`);
	}
	return said.join(' · ');
}

/** `Brown Bear and Wolf`, or `A, B and C`: names as a sentence lists them. */
function spokenList(names: readonly string[]): string {
	if (names.length <= 1) return names[0] ?? '';
	return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/**
 * Whether a record's own lines say a toggle is on, for a record whose fence as
 * a whole will not read: a look for `key: <flag>` line by line, so a form a
 * hand-edit broke can still be named as the one the note holds active.
 */
function linesSayOn(text: string, key: string): boolean {
	const wanted = key.toLowerCase();
	for (const line of text.split(/\r?\n/)) {
		const colon = line.indexOf(':');
		if (colon < 0) continue;
		if (line.slice(0, colon).trim().toLowerCase() !== wanted) continue;
		if (isFlagSet(line.slice(colon + 1).trim())) return true;
	}
	return false;
}
