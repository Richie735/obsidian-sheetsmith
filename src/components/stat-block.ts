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
 * **It never corrects a form below 0**: the number says it, in the error
 * colour, and one sentence says what the reader does next. Reverting is the
 * reader's. At 0 the number alone says it, since 0 may be a field's normal
 * state (a Fate NPC's Stress), matching a Pool past its boundary.
 *
 * **Without `exclusive` it is a companion block** (a familiar, a scene's NPCs;
 * `docs/features/stat-block-companion-face.md`): every record is listed and
 * applies, and it has two faces on the picker's own mechanism. At rest it reads
 * as In play reads, each record a disclosure line over its stat block, a name in
 * text, empty zones left out and collapsed ones closed; behind **Edit** it is
 * Every form's edit list, left by **Done**. The face is the view's `activeTab`,
 * so a switch writes nothing, and **Add** always lands on the edit face, where
 * the new record's name field is.
 *
 * **The colour a form tints in is the block's `tint`, or the form's own `Tint`
 * entry where the layout turns that on** (`docs/features/form-tint-colour.md`),
 * carried on the push beside `inPlay` as a fact about the row. A colour outside
 * the theme's list is reported and drawn as the accent, never refused as a
 * configuration error: a colour is cosmetic, and losing a druid's picker over a
 * mistyped word would be out of proportion.
 */

import { setIcon } from 'obsidian';
import { bindEditable } from '../interaction/editable';
import { armRegister, bindArmToConfirm } from '../interaction/arm-to-confirm';
import { stepButton } from '../interaction/hold-repeat';
import { commitWindow } from '../interaction/commit-window';
import { splitBounded } from '../parse/bounded-entry';
import { fencedKeyProblem, readFenced, withoutEmptyFence, writeFenced } from '../parse/fenced';
import { bodyText } from '../parse/markdown-body';
import {
	readFeatures,
	withEntryAdded,
	withEntryName,
	withEntryRemoved,
	withEntryText,
	withLead,
} from '../parse/features';
import {
	BUILT_IN_ZONES,
	isBuiltInZone,
	isZoneType,
	pictureSource,
	placeZones,
	replaceZone,
	splitZones,
	withPicture,
	writeZoneText,
	ZoneSpec,
} from '../parse/zones';
import { cellParts } from '../parse/modifier-cell';
import {
	joinRecords,
	RecordSection,
	splitRecords,
	withRecordBody,
} from '../parse/records';
import { readTable, splitLeadingTable, TableUpdates, writeTable } from '../parse/table';
import { HOLDER_MAX_SOURCE } from './column-types';
import { paintLevelRing } from './level-ring';
import { outcomeWords } from './modifier-breakdown';
import { bindRingControl } from './ring-control';
import { sampleNumber, samplePart, sampleSeed } from './sample-values';
import { flagText, isFlagSet } from './stored-flag';
import { boundedText } from './typed-value';
import { embedRefusal } from './embed-rule';
import { renderPictureFrame } from './picture-frame';
import { columnKeyFault, sameZoneKey, zoneHeadingFault, zoneKeyFault } from './zone-rules';
import { drawBriefs, FormBrief } from './stat-block-briefs';
import {
	BodyZone,
	ZoneHost,
	drawDrift,
	drawZone,
	drawZoneBrief,
	shiftOpenZones,
	FeatureZoneEdit,
	StatBlockZone,
	TableZoneEdit,
	ZoneDriftRead,
	ZoneEdit,
	zoneHeaders,
	ZoneRead,
} from './stat-block-zones';
import {
	editRecords,
	fieldLabel,
	fieldReset,
	fieldType,
	recordEntries,
	RecordEntry,
	RecordField,
	RecordDelta,
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
	TINT_ATTRIBUTE,
	TINT_COLOURS,
	TintColour,
	tintColourOf,
} from '../types';
import { element } from '../ui/element';

/** The key a stored uses count sits under in the preamble's fence. */
const USES_KEY = 'uses';

/**
 * The fence entry a record's own tint is kept under, where **Tint per record**
 * is on. Read by the key as written, as a field's is; only the collision check
 * with a field ignores case, on `uses`' precedent.
 */
const TINT_KEY = 'Tint';

/**
 * The keys `zones` replaced, in the order the error names them. No released
 * version wrote them, so a layout still holding one is reported rather than
 * read (`docs/features/stat-block-zones.md`, Errors): drawing default zones
 * beside an error would show a stat block shaped by keys the layout no longer
 * means.
 */
const REPLACED_KEYS = ['actions', 'actionName', 'bodyName', 'sections'] as const;

/**
 * What a blank `zones` reads as: the vitals, the changes, then the body as text
 * under a closed **Details** — the drawing a layout with no zones had before.
 */
const DEFAULT_ZONES: readonly StatBlockZone[] = [
	{ key: 'vitals' },
	{ key: 'changes' },
	{ key: 'details', type: 'text', heading: 'Details', collapsed: true },
];

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
 * The render that follows a press on a brief, so it lands focus on the picker:
 * the brief pressed is gone in the rebuild, and the picker is the control that
 * now says which form is on (`docs/features/stat-block-in-play-polish.md` §4).
 * `awaitingAdd`'s module state for its reason, and cleared only where it
 * matches, so another block cannot consume it.
 */
let awaitingPick: string | null = null;

export type { StatBlockColumn, StatBlockZone } from './stat-block-zones';

export interface StatBlockConfig extends ComponentConfig {
	type: 'stat-block';
	recordName?: string;
	fields?: RecordField[];
	/** The key of the toggle field the picker draws; blank draws every record. */
	exclusive?: string;
	/** An expression: the uses counter's ceiling. */
	uses?: string | number;
	spendOnPick?: boolean;
	/**
	 * What each record's body is made of, in the order it is drawn. A built-in
	 * the list leaves out is drawn first, so a list can reorder the vitals and
	 * the changes and never hide them.
	 */
	zones?: StatBlockZone[];
	briefZone?: string;
	image?: boolean;
	/**
	 * One of `TINT_COLOURS`, absent for the accent. Typed as text because a
	 * hand-edited layout may hold any word, and one outside the list is reported
	 * and drawn as the accent rather than refused.
	 */
	tint?: string;
	tintPerRecord?: boolean;
	hideLabel?: boolean;
}

/** One record as this component reads it: Record set's, plus its body's zones. */
export interface StatBlockEntry extends RecordEntry {
	/** What each body zone holds, by key; a zone holding nothing is absent. */
	zones?: Record<string, ZoneRead>;
	/** Content no zone owns, in file order. */
	drift?: ZoneDriftRead[];
	/** The picture line as the note writes it, where **Picture** is on and there is one. */
	picture?: string;
	/**
	 * Whether the note holds this record switched on, for a record whose fence
	 * will not read, so the panel can say so; absent everywhere else.
	 */
	heldOn?: boolean;
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
	/** One gesture's change to a record's body, by record position. */
	zoneEdits?: Record<number, ZoneEdit>;
	/**
	 * One gesture's change to a record's own tint, by record position: a colour
	 * written lower case, or null, which removes the entry.
	 */
	tints?: Record<number, TintColour | null>;
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

/** Whether a zone entry is one of the two built-ins, by its key. */
function isBuiltIn(zone: StatBlockZone): boolean {
	return isBuiltInZone(zone.key);
}

/**
 * The zones in the order a form draws them (The record in play). A built-in
 * the list leaves out is drawn where the default puts it — `vitals` first,
 * then `changes`, before the listed zones — so nothing a form holds is hidden.
 * Blank is `DEFAULT_ZONES`. A configuration `configError` refuses draws
 * nothing, so this reads only an accepted one.
 */
function zoneOrder(config: StatBlockConfig): StatBlockZone[] {
	const listed = config.zones !== undefined && config.zones.length > 0 ? config.zones : DEFAULT_ZONES;
	const missing = BUILT_IN_ZONES.filter(
		(key) => !listed.some((zone) => (zone.key ?? '').trim().toLowerCase() === key),
	).map((key): StatBlockZone => ({ key }));
	return [...missing, ...listed];
}

/** The body zones, accepted, in layout order. */
function bodyZones(config: StatBlockConfig): BodyZone[] {
	return zoneOrder(config)
		.filter((zone) => !isBuiltIn(zone))
		.map((zone) => ({
			key: zone.key.trim(),
			type: isZoneType(zone.type) ? zone.type : 'text',
			heading: (zone.heading ?? '').trim(),
			columns: (zone.columns ?? []).filter((column) => (column.key ?? '').trim() !== ''),
			collapsed: zone.collapsed === true,
		}));
}

/** The zones as `parse/zones.ts` places content into them. */
function zoneSpecs(config: StatBlockConfig): ZoneSpec[] {
	return bodyZones(config).map(({ key, type, heading }) => ({ key, type, heading }));
}

/** Whether the layout turns **Picture** on. */
function hasPicture(config: StatBlockConfig): boolean {
	return config.image === true;
}

/** Whether the layout turns **Tint per record** on. */
function hasTintPerRecord(config: StatBlockConfig): boolean {
	return config.tintPerRecord === true;
}

/**
 * The layout's `tint` where it is not one of the theme's colours, or null.
 * Matched exactly, as the editor's select matches it, so the sheet and the
 * editor agree on what is a stray: a word the select would report as not one
 * of its choices is never drawn here as a colour.
 */
function strayBlockTint(config: StatBlockConfig): string | null {
	const tint = config.tint;
	if (tint === undefined) return null;
	return (TINT_COLOURS as readonly string[]).includes(tint) ? null : tint;
}

/** The colour the block tints in: its `tint`, or the accent where it is absent or a stray. */
function blockTint(config: StatBlockConfig): TintColour {
	return strayBlockTint(config) === null ? (tintColourOf(config.tint ?? '') ?? 'accent') : 'accent';
}

/**
 * A record's own `Tint` entry, read where **Tint per record** is on: the colour,
 * a stray word the list does not hold, or neither where the entry is absent or
 * blank. Trimmed and matched without case, so `Green` is green.
 */
function recordTint(
	config: StatBlockConfig,
	record: RecordEntry,
): { colour: TintColour } | { stray: string } | null {
	if (!hasTintPerRecord(config)) return null;
	const raw = (record.fields[TINT_KEY] ?? '').trim();
	if (raw === '') return null;
	const colour = tintColourOf(raw);
	return colour === null ? { stray: raw } : { colour };
}

/** The colour a record tints in: its own valid `Tint`, else the block's. */
function tintOf(config: StatBlockConfig, record: RecordEntry): TintColour {
	const own = recordTint(config, record);
	return own !== null && 'colour' in own ? own.colour : blockTint(config);
}

/** `accent` reads **Accent**: a colour's word as a choice in the dropdown. */
function tintWord(colour: TintColour): string {
	return colour.charAt(0).toUpperCase() + colour.slice(1);
}

/**
 * What one of the theme's colours is called wherever a word is not one: the
 * editor's **Tint** dropdown (through `optionNoun`), the lines under the In
 * play head, and the Every form dropdown. One phrase, so the editor and the
 * sheet name one fault one way.
 */
const TINT_NOUN = 'tint color';

/** A stray colour word, said: `"brown" is not a tint colour`. */
function notATint(stray: string): string {
	return `"${stray}" is not a ${TINT_NOUN}`;
}

/** The sentence a stray colour word is reported with, ending in where it is fixed. */
function strayTintSentence(stray: string, where: string): string {
	return `${notATint(stray)}. Choose one${where}.`;
}

/** `a`, `a and b`, `a, b and c`: keys as a sentence lists them. */
function listed(names: readonly string[]): string {
	if (names.length <= 1) return names[0] ?? '';
	return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/** Why the zone list cannot draw, or null where it can (Errors). */
function zonesError(config: StatBlockConfig): string | null {
	const zones = config.zones ?? [];
	for (const [at, zone] of zones.entries()) {
		// Against the zones before this one, so the first of two clashing is the
		// one the sentence names first. The rules are `zone-rules.ts`'s, shared
		// with the zone editor; the sentences are this check's own.
		const before = zones.slice(0, at);
		const key = (zone.key ?? '').trim();
		const keyFault = zoneKeyFault(key, before.map((other) => other.key));
		if (keyFault === 'blank') return 'A zone has no key. Give every zone a key under Zones.';
		if (keyFault === 'not-a-name') {
			return `The zone key "${key}" is not a name. Use letters, digits and underscores, starting with a letter, under Zones.`;
		}
		if (keyFault === 'taken') return `Two zones share the key "${key}". Give each zone its own key under Zones.`;
		if (isBuiltIn(zone)) {
			if (zone.type !== undefined) {
				return `The zone "${key}" is built in, so it takes no type: it is drawn from each record's fence. Clear its type, or give the zone another key.`;
			}
			continue;
		}
		const type = zone.type ?? '';
		if (!isZoneType(type)) {
			return type === ''
				? `The zone "${key}" has no type. Make it a table, features or text zone under Zones.`
				: `The zone "${key}" is a ${type} zone, which a stat block does not draw. Make it a table, features or text zone.`;
		}
		const heading = zone.heading ?? '';
		const headingFault = zoneHeadingFault(heading, before);
		if (headingFault !== null) {
			switch (headingFault.kind) {
				case 'blank':
					return `The zone "${key}" has no heading. Give it the heading each record stores it under, under Zones.`;
				case 'line-break':
					return `The zone "${key}" has a line break in its heading. A heading is one line in the note.`;
				case 'link':
					return `The zone "${key}" has a link in its heading, which would change when the note it names is renamed and leave the zone behind. Write the heading as plain text.`;
				case 'no-words':
					return `The zone "${key}" is headed "${heading.trim()}", which leaves nothing to match once its punctuation goes. Give it a heading with words in it.`;
				case 'taken':
					return `The zones "${headingFault.with}" and "${key}" have headings a note cannot tell apart. Give each zone its own heading.`;
			}
		}
		if (type === 'table') {
			const columns = zone.columns ?? [];
			if (columns.length === 0) {
				return `The table zone "${key}" has no columns. Give it at least one, the first naming each row.`;
			}
			for (const [index, column] of columns.entries()) {
				const columnKey = (column.key ?? '').trim();
				const fault = columnKeyFault(columnKey, columns.slice(0, index).map((other) => other.key));
				if (fault === 'blank') return `A column of the zone "${key}" has no key. Give it one, or remove it.`;
				if (fault === 'pipe') {
					return `The column "${columnKey}" of the zone "${key}" holds a "|", which ends a table cell. Rename it.`;
				}
				if (fault === 'taken') {
					return `Two columns of the zone "${key}" share the heading "${columnKey}". Give each its own.`;
				}
			}
		}
		if (zone.collapsed !== undefined && zone.collapsed !== false && type !== 'text') {
			return `The zone "${key}" is a ${type} zone, and only a text zone can be collapsed. Clear Collapsed on it.`;
		}
	}
	return null;
}

/** The brief zone's key as the layout spells it, or null where there is none. */
function briefZoneKey(config: StatBlockConfig): string | null {
	const key = (config.briefZone ?? '').trim();
	return key === '' ? null : key;
}

/** The body zone the brief zone's key names, by `sameZoneKey`, or null. */
function namedBriefZone(config: StatBlockConfig, key: string): BodyZone | null {
	return bodyZones(config).find((zone) => sameZoneKey(zone.key, key)) ?? null;
}

/**
 * The table zone each brief draws in place of its changes line, or null where
 * the layout names none. Reads an accepted configuration, so a name no table
 * zone answers is `configError`'s and never reaches here as a fallback.
 */
function briefZone(config: StatBlockConfig): BodyZone | null {
	const key = briefZoneKey(config);
	const zone = key === null ? null : namedBriefZone(config, key);
	return zone?.type === 'table' ? zone : null;
}

/**
 * Why the brief zone cannot draw, or null where it can or is blank
 * (`docs/features/stat-block-brief-zone.md`, question 3): on the Errors
 * pattern and `exclusive`'s precedent, the layout says one thing and silently
 * drawing another would hide the typo. After `zonesError`, since it reads the
 * accepted zones. A built-in is asked by its key, since a list may leave one
 * out and it is still drawn.
 */
function briefZoneError(config: StatBlockConfig): string | null {
	const key = briefZoneKey(config);
	if (key === null) return null;
	if (isBuiltInZone(key)) return `Brief zone names "${key}", a built-in zone. Name a table zone's key instead.`;
	const zone = namedBriefZone(config, key);
	if (zone === null) return `Brief zone names "${key}", which no zone declares. Name a table zone's key, or clear it.`;
	if (zone.type !== 'table') return `Brief zone names "${key}", a ${zone.type} zone. Name a table zone's key instead.`;
	return null;
}

/**
 * Why this configuration cannot draw, or null where it can (`docs/features/
 * character-forms.md` and `stat-block-zones.md`, Error states). Each names the
 * fix, in the editor's words. **A replaced key is asked first**, so it is the
 * one error shown while it stands.
 */
function configError(config: StatBlockConfig): string | null {
	const held = config as unknown as Record<string, unknown>;
	const replaced = REPLACED_KEYS.filter((key) => held[key] !== undefined);
	if (replaced.length > 0) {
		return `Zones replaced ${listed(replaced)}. Set this stat block's zones, then remove ${replaced.length === 1 ? 'that key' : 'those keys'} from the layout.`;
	}
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
		if (hasTintPerRecord(config) && lower === TINT_KEY.toLowerCase()) {
			return `A field cannot be keyed "${key}" while Tint per record is on, because that is where each record's tint is kept. Rename the field under Fields, or turn Tint per record off.`;
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
	return zonesError(config) ?? briefZoneError(config);
}

/**
 * One record's body read into its zones (Data and file model): the pieces
 * placed by `parse/zones.ts`, then each zone's content read by its type. A
 * zone holding nothing is left out, so an empty one and a missing one are one
 * case.
 */
function readZones(config: StatBlockConfig, rest: string): Pick<StatBlockEntry, 'zones' | 'drift' | 'picture'> {
	const picture = hasPicture(config);
	const split = splitZones(rest, { picture });
	const placement = placeZones(split, zoneSpecs(config));
	const zones: Record<string, ZoneRead> = {};
	for (const zone of bodyZones(config)) {
		const place = placement.zones.get(zone.key);
		if (place === undefined) continue;
		const fromLead = place.from !== 'block';
		if (zone.type === 'text') {
			const text = bodyText(place.content);
			if (text !== '') zones[zone.key] = { type: 'text', text, fromLead };
		} else if (zone.type === 'features') {
			const read = readFeatures(place.content);
			zones[zone.key] = {
				type: 'features',
				lead: read.lead,
				entries: read.entries.map(({ name, usage, source, text }) => ({ name, usage, source, text })),
			};
		} else {
			zones[zone.key] = readTableZone(zone, place.content);
		}
	}
	const source = picture ? pictureSource(split) : '';
	return {
		zones,
		drift: placement.drift.map(({ kind, heading, content }) => ({ kind, heading, content })),
		...(source === '' ? {} : { picture: source }),
	};
}

/**
 * A table zone's content: the table at its head, every row, each cell matched
 * to its column by header without regard to case, the first cell the row's
 * name; the text after it; or the content itself, where it opens with none.
 */
function readTableZone(zone: BodyZone, content: string): ZoneRead {
	const split = splitLeadingTable(content);
	if (split === null) {
		return content.trim() === ''
			? { type: 'table', rows: [], after: '', notTable: null }
			: { type: 'table', rows: [], after: '', notTable: bodyText(content) };
	}
	const read = readTable(split.table);
	if (!read.ok || read.table === null) {
		return { type: 'table', rows: [], after: '', notTable: bodyText(content) };
	}
	const at = new Map(read.table.headers.map((heading, index) => [heading.toLowerCase(), index]));
	const rows = read.table.rows.map((row) => [
		row[0] ?? '',
		...zone.columns.slice(1).map((column) => {
			const index = at.get(column.key.toLowerCase());
			return index === undefined || index === 0 ? '' : (row[index] ?? '');
		}),
	]);
	return { type: 'table', rows, after: bodyText(split.rest), notTable: null };
}

/** A table zone's content with one edit applied, every other byte kept. */
function writeTableZone(zone: BodyZone, content: string | null, edit: TableZoneEdit): string | null {
	const updates: TableUpdates = {
		rows: new Map(
			Object.entries(edit.rows ?? {}).map(([row, cells]) => [Number(row), new Map(Object.entries(cells))]),
		),
		added: (edit.added ?? []).map((cells) => new Map(Object.entries(cells))),
		removed: edit.removed ?? [],
	};
	const headers = zoneHeaders(zone);
	if (content === null || content.trim() === '') {
		// A zone with no table yet gains one on its first added row, and nothing
		// on an edit that has no row to land in.
		if ((edit.added ?? []).length === 0) return content;
		const fresh = writeTable(null, headers, { added: updates.added });
		if (content === null) return fresh;
		const at = content.indexOf('\n');
		return fresh + (at < 0 ? '' : content.slice(at + 1));
	}
	const split = splitLeadingTable(content);
	// Prose where a table belongs is the zone's error: edits are off, and a
	// write that reached here anyway writes nothing.
	if (split === null) return content;
	return writeTable(split.table, headers, updates) + split.rest;
}

/** A features zone's content with one edit applied, every other byte kept. */
function writeFeaturesZone(content: string | null, edit: FeatureZoneEdit): string | null {
	const raw = content ?? '';
	if (edit.added === true) return withEntryAdded(raw);
	if (edit.lead !== undefined) return content === null && edit.lead === '' ? null : withLead(raw, edit.lead);
	if (content === null || edit.entry === undefined) {
		return edit.removed === undefined || content === null ? content : withEntryRemoved(content, edit.removed);
	}
	if (edit.text !== undefined) return withEntryText(content, edit.entry, edit.text);
	if (edit.name !== undefined || edit.usage !== undefined) {
		return withEntryName(content, edit.entry, {
			...(edit.name === undefined ? {} : { name: edit.name }),
			...(edit.usage === undefined ? {} : { usage: edit.usage }),
		});
	}
	return content;
}

/**
 * A record's rest with one gesture's change applied, every other byte kept: the
 * picture line, or one zone's content through `replaceZone`, which rewrites a
 * zone in place or gives one with no content anywhere a block of its own.
 */
function withZoneEdit(config: StatBlockConfig, rest: string, edit: ZoneEdit): string {
	const picture = hasPicture(config);
	if (edit.picture !== undefined) {
		if (!picture) return rest;
		return withPicture(rest, edit.picture.trim() === '' ? null : edit.picture.trim());
	}
	const zone = bodyZones(config).find((one) => one.key === edit.zone);
	if (zone === undefined) return rest;
	const specs = zoneSpecs(config);
	let unchanged = false;
	const next = replaceZone(rest, specs, zone.key, { picture }, (content) => {
		let written: string | null = content;
		if (zone.type === 'text' && edit.text !== undefined) {
			written = content === null && edit.text === '' ? null : writeZoneText(content ?? '', edit.text);
		} else if (zone.type === 'table' && edit.table !== undefined) {
			written = writeTableZone(zone, content, edit.table);
		} else if (zone.type === 'features' && edit.features !== undefined) {
			written = writeFeaturesZone(content, edit.features);
		}
		if (written === null) {
			unchanged = true;
			return '';
		}
		return written;
	});
	return unchanged ? rest : next;
}

/** Every record, as read or as an edit reported, in file order. */
function entries(data: StatBlockData | null): StatBlockEntry[] {
	const views = recordViews(data);
	return views.map((view, at) => {
		const held = data?.records[at];
		return {
			...view,
			...(held?.zones === undefined ? {} : { zones: held.zones }),
			...(held?.drift === undefined ? {} : { drift: held.drift }),
			...(held?.picture === undefined ? {} : { picture: held.picture }),
			...(held?.heldOn === true ? { heldOn: true } : {}),
		};
	});
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
 * What one zone holds in a sample: filler that says it is filler, on Rich
 * text's rule. A features entry carries one emphasis run besides its bold name,
 * since the canvas renders it as the sheet does and an entry's own marks are
 * what an author should see there; a text zone stays plain prose, since one
 * component showing each mark is enough.
 */
function sampleZone(zone: BodyZone, noun: string, at: number): string {
	if (zone.type === 'table') {
		const headers = zone.columns.map((column) => column.key);
		const cells = zone.columns.map((column, index) =>
			index === 0 ? 'Sample' : column.type === 'number' ? String(sampleNumber(at + index)) : 'Sample text',
		);
		return `|${headers.join('|')}|\n|${headers.map(() => '---').join('|')}|\n|${cells.join('|')}|`;
	}
	if (zone.type === 'features') return `**Sample.** Sample text, so an open ${noun.toLowerCase()} shows where an *entry* starts.`;
	return `Sample text, so an open ${noun.toLowerCase()} shows where its prose starts.`;
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
				'The key of a toggle field. Choosing a record turns it on and every other off in one write, and only that record\'s modifiers apply and tint the sheet. Blank lists every record at once and applies all of them, as a companion block, read until Edit is pressed.',
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
			key: 'zones',
			kind: 'zones',
			label: 'Zones',
			addressesHeading: 'record',
			description:
				"What each record's body is made of, in the order it is drawn: tables, named features or text, each under a heading the note stores, plus the record's vitals and changes, which can be moved but not removed. Renaming a heading renames it in every note on this layout. Removing a zone keeps its text in every note, shown as not in this layout. A collapsed text zone starts closed where the record is read, and is drawn open where it is edited, which is where it is filled. Blank draws the vitals, the changes, then the body as text under a closed Details heading.",
			// A key commit carries into Brief zone, and removing the zone it names
			// clears it, so the zone editor never leaves Brief zone naming nothing.
			keyReferences: ['briefZone'],
		},
		{
			key: 'briefZone',
			kind: 'text',
			label: 'Brief zone',
			description:
				'The key of a table zone each form\'s brief draws in place of its changes line while no form is in play, so forms are compared by that table. Every row is drawn, so a long table makes a tall brief. A form whose table has no rows keeps its changes line. Only a table zone can be named, and it needs One at a time by. Blank draws the changes line.',
		},
		{
			key: 'image',
			kind: 'boolean',
			label: 'Picture',
			description:
				'Each record may open its body with one picture, drawn beside its name in play. The picture is an embed line in the note, so renaming the file updates it. Off, that line is read as ordinary text. Off by default.',
			default: false,
		},
		{
			key: 'tint',
			kind: 'select',
			label: 'Tint',
			description:
				"The color a record in play tints the values it changes, and the tag that names it: the theme's accent, or one of its named colors, which the theme sets for light and dark. Only a record in play tints, so this needs One at a time by. Changes nothing in the note.",
			options: TINT_COLOURS,
			optionNoun: TINT_NOUN,
		},
		{
			key: 'tintPerRecord',
			kind: 'boolean',
			label: 'Tint per record',
			description:
				'Each record may choose its own tint under Every form, kept as a Tint entry in its fence; a record that chooses none takes Tint above. Off, a Tint entry already in a note is kept and ignored. While on, no field can be keyed Tint. Off by default.',
			default: false,
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

	/*
	 * One zone of each type, so the contract sweeps a table, a list of features
	 * and a block of text through a read and a write, and the canvas shows all
	 * three under the vitals. **Tint per record** on, so it sweeps a `Tint`
	 * entry too.
	 */
	example: {
		recordName: 'Form',
		fields: [
			{ key: 'Active', type: 'toggle' },
			{ key: 'HP', type: 'number', maxSource: HOLDER_MAX_SOURCE },
		],
		exclusive: 'Active',
		tintPerRecord: true,
		zones: [
			{ key: 'vitals' },
			{
				key: 'attacks',
				type: 'table',
				heading: 'Attacks',
				columns: [{ key: 'Attack' }, { key: 'Bonus', type: 'number' }],
			},
			{ key: 'actions', type: 'features', heading: 'Actions' },
			{ key: 'notes', type: 'text', heading: 'Notes' },
		],
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
			// The second record chooses its own colour, so a canvas shows one.
			if (which === 1 && hasTintPerRecord(config)) lines.push(`${TINT_KEY}: green`);
			if (lines.length > 0) parts.push(`\n\`\`\`sheet\n${lines.join('\n')}\n\`\`\`\n`);
			// One block per body zone, each with something in it, so an open
			// form shows every zone the layout declares where it starts.
			bodyZones(config).forEach((zone, at) => {
				parts.push(`\n#### ${zone.heading}\n\n${sampleZone(zone, noun, seed + which * 7 + at)}\n`);
			});
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
			// A record whose fence will not read keeps its body as prose, which is
			// all that is drawn of it; a readable one reads its zones.
			if (entry.error === null) Object.assign(entry, readZones(config, block.rest));
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
					// The accent is written as absence, which is every push before this.
					const tint = tintOf(config, record);
					for (const part of cellParts(record.fields[field.key] ?? '')) {
						row ??= recordValues(config.fields, noun, record, resolve);
						pushes.push({
							part,
							source: config.label,
							row,
							...(gated ? { inPlay: true, ...(tint === 'accent' ? {} : { tint }) } : {}),
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
		 * **A record's body first, by position as read**, because Record set's
		 * delta writes a body as one string — which here would overwrite every
		 * zone. Removals and appends then run on the shared path, after, so a
		 * position still means what the render meant by it.
		 */
		const deltas: Record<number, RecordDelta> = {};
		for (const [position, delta] of Object.entries(data.records ?? {})) {
			const { body: text, ...rest } = delta;
			void text;
			deltas[Number(position)] = rest;
		}
		/*
		 * **A record's tint is one more fence entry, and only while the layout
		 * turns Tint per record on**: off, the delta never reaches it, and an
		 * entry already in the note keeps its bytes (Constraint 4). Null removes
		 * the line, so setting a tint and choosing **Default** again restores the
		 * record byte for byte.
		 */
		const tinting = hasTintPerRecord(config);
		if (tinting) {
			for (const [position, tint] of Object.entries(data.tints ?? {})) {
				const at = Number(position);
				const held = deltas[at] ?? {};
				deltas[at] = { ...held, fields: { ...held.fields, [TINT_KEY]: tint } };
			}
		}
		for (const [position, edit] of Object.entries(data.zoneEdits ?? {})) {
			const at = Number(position);
			const block = records[at];
			if (block === undefined) continue;
			// A record whose fence will not read is one this must not write.
			if (!readFenced(block.head + block.rest).ok) continue;
			const rest = withZoneEdit(config, block.rest, edit);
			if (rest !== block.rest) records[at] = withRecordBody(block, block.head, rest);
		}
		const next: RecordSection = editRecords(
			{ preamble, records },
			{ records: deltas, added: data.added, removed: data.removed },
			config.fields,
			tinting ? [TINT_KEY] : [],
		);
		/*
		 * **A tint taken back takes its fence with it, where the fence held
		 * nothing else**: a record with no fence gains one on its first tint, and
		 * **Default** would otherwise leave it empty, so the record would not read
		 * byte for byte as it did (Constraint 3). Only a record this write changed,
		 * and only while no removal has moved the positions the edit names.
		 */
		if (tinting && (data.removed ?? []).length === 0) {
			for (const [position, tint] of Object.entries(data.tints ?? {})) {
				const at = Number(position);
				const block = next.records[at];
				if (tint !== null || block === undefined || block === records[at]) continue;
				const head = withoutEmptyFence(block.head);
				if (head !== block.head) next.records[at] = withRecordBody(block, head, block.rest);
			}
		}
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
		/*
		 * **The noun a companion's Edit press names keeps an all-capitals noun's
		 * case**, so the Fate block says *Edit NPCs* rather than *Edit npcs*; any
		 * other noun is lowercased as everywhere else. Every string naming that
		 * press uses it, so the button and each reference to it agree. The other
		 * strings keep `lower` (`docs/features/stat-block-companion-face.md`).
		 */
		const pressNoun = isAcronym(noun) ? noun : lower;
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
		const controls: RecordHost = { context, id: config.id, noun, status, source: config.label };
		const { refusal } = recordRefusals(controls);
		const armed = armRegister();

		const landing = awaitingAdd?.id === config.id && records.length > awaitingAdd.held;
		const landedAt = landing && awaitingAdd !== null ? awaitingAdd.held : -1;
		if (landing) awaitingAdd = null;
		const opened = new Set(context.openRecords ?? []);
		/*
		 * **Every block has two faces.** With `exclusive` they are In play and
		 * Every form; without, a companion block's reading face and its edit face
		 * behind **Edit** (`docs/features/stat-block-companion-face.md`).
		 */
		let face = context.activeTab === LIBRARY_FACE ? LIBRARY_FACE : PLAY_FACE;
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

		const scroll = element('div', 'sheetsmith-placed-scroll sheetsmith-stat-block-scroll', box);
		const content = element('div', 'sheetsmith-placed-scroller sheetsmith-stat-block-content', scroll);
		const foot = element('div', 'sheetsmith-stat-block-foot', box);

		const picking = awaitingPick === config.id;
		if (picking) awaitingPick = null;
		paint();
		if (landedAt >= 0) nameFields.get(landedAt)?.focus();
		else if (picking) content.querySelector<HTMLSelectElement>('.sheetsmith-stat-block-select')?.focus();

		/** Redraw the face the reader is on; nothing here reaches the note. */
		function paint(): void {
			content.replaceChildren();
			foot.replaceChildren();
			usesSlot.replaceChildren();
			nameFields.clear();
			const inPlay = exclusive && face === PLAY_FACE;
			if (hasUses(config) && !inPlay) drawUses(usesSlot);
			if (!exclusive) {
				if (face === LIBRARY_FACE) drawLibrary('edit');
				else drawLibrary('read');
				return;
			}
			if (face === LIBRARY_FACE) drawLibrary('library');
			else drawPlay();
		}

		/**
		 * A companion block's **Edit** or **Done**: the face switch, and focus to
		 * the other button where the pressed one held it, since each sits in the
		 * foot where the other was. Measured before `paint()` replaces the foot; a
		 * press that focused nothing is given no focus.
		 */
		function swapFace(pressed: HTMLElement, next: number): void {
			const held = doc.activeElement === pressed;
			setFace(next);
			if (!held) return;
			const other = next === LIBRARY_FACE
				? foot.querySelector<HTMLElement>('.sheetsmith-stat-block-done')
				// With no record left there is no Edit; the empty state's Add is
				// what the reading face offers in its place.
				: (foot.querySelector<HTMLElement>('.sheetsmith-stat-block-edit') ??
					content.querySelector<HTMLElement>('.sheetsmith-stat-block-action'));
			other?.focus();
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

		/**
		 * No record yet, on the face a block is read on: In play's, and a companion
		 * block's at rest. The sentence and an Add that lands on the edit face.
		 */
		function drawEmpty(): void {
			element('p', 'sheetsmith-stat-block-empty', content, `No ${lower}s yet.`);
			const add = element('button', 'sheetsmith-stat-block-action', content, `Add ${lower}`);
			add.type = 'button';
			add.addEventListener('click', () => addRecord());
		}

		function drawPlay(): void {
			const readable = records
				.map((record, at) => ({ record, at }))
				.filter(({ record }) => record.error === null);
			if (records.length === 0) {
				drawEmpty();
				return;
			}
			/*
			 * **The head reads first, as a title**: the form in play is the panel's
			 * name, and the uses, the picker and **Revert** share its row, so what the
			 * character is and how to change it are one line (B1 of the reading pass).
			 */
			const playHead = element('div', 'sheetsmith-stat-block-play-head', content);
			const names = active.map(({ record }) => recordLabel(record.name, noun));
			// With one form on, its picture sits at the title row's inline start;
			// with two, each form's own name row carries its own.
			const failures = element('div', 'sheetsmith-stat-block-problems', content);
			/*
			 * **A layout tint outside the list is said once, under the head**, in
			 * the problem line's host and clothes, whether or not a form is
			 * chosen: the forms tint in the accent meanwhile, and the editor's
			 * select reports the same word where it is fixed.
			 */
			const stray = strayBlockTint(config);
			if (stray !== null) {
				element(
					'div',
					'sheetsmith-stat-block-problem',
					failures,
					strayTintSentence(stray, ' under Tint in the layout editor'),
				);
			}
			const only = active.length === 1 ? active[0] : undefined;
			if (only !== undefined) {
				const named = recordLabel(only.record.name, noun);
				drawThumb(playHead, only.record, named, failures, false);
				// The head's rule takes the form's colour, the accent included, so
				// the line under its name and the outline round each box it changed
				// are one colour (`docs/features/stat-block-in-play-polish.md` §2).
				playHead.setAttribute(TINT_ATTRIBUTE, tintOf(config, only.record));
				reportStrayTint(only.record, named, failures, false);
			}
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
				if (readable.length > 0) {
					const briefed = briefZone(config);
					drawBriefs(
						content,
						readable.map(({ record, at }) => brief(record, at)),
						{
							id: config.id,
							listName: `${config.label}: choose a ${lower}`,
							thumb: (into, source, named, onError) => paintThumb(into, source, named, onError, true),
							tiles: (into, at) => briefTiles(into, at),
							...(briefed === null
								? {}
								: { zone: (into: HTMLElement, at: number) => drawZoneBrief(into, briefed, records[at]?.zones?.[briefed.key]) }),
							choose: (at) => {
								awaitingPick = config.id;
								choose(at);
							},
						},
					);
				}
			}
			for (const { record, at } of active) {
				const named = recordLabel(record.name, noun);
				const panel = element('div', 'sheetsmith-stat-block-form', content);
				if (active.length > 1) {
					const row = element('div', 'sheetsmith-stat-block-form-name', panel);
					drawThumb(row, record, named, failures, true);
					// Each form's own rule takes its colour; the head names both, so
					// no one colour is its own and its rule stays plain.
					row.setAttribute(TINT_ATTRIBUTE, tintOf(config, record));
					reportStrayTint(record, named, failures, true);
					element('span', 'sheetsmith-stat-block-form-title', row, named);
				}
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
		 * stat block under it when open. **One loop for three faces**: `library` is
		 * Every form, the edit face of a block with `exclusive`; `edit` is a
		 * companion block's face behind **Edit**, the same list without **Back to
		 * play** and the Active tag; and `read` is a companion block at rest, the
		 * same list read as In play reads, its names as text and nothing to delete
		 * or add (`docs/features/stat-block-companion-face.md`). Without
		 * `exclusive` the first record is open until the reader closes it.
		 */
		function drawLibrary(mode: 'library' | 'edit' | 'read'): void {
			const reading = mode === 'read';
			if (reading && records.length === 0) {
				// In play's no-forms state exactly, with no foot: adding is editing,
				// so the press lands on the edit face in the new record's name.
				drawEmpty();
				return;
			}
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
				let summaryLine: HTMLElement | null = null;
				let thumb: HTMLElement | null = null;
				bindDisclosure({
					button: chevron,
					region: detail,
					open: startsOpen,
					named,
					onToggle: (open) => {
						summaryLine?.toggleAttribute('hidden', open);
						thumb?.toggleAttribute('hidden', !open);
						// Kept here as well as in the view, so a face switch, which
						// repaints without a rebuild, draws the record as the reader
						// left it: one open set for both of a companion's faces.
						if (open !== isDefault) opened.add(at);
						else opened.delete(at);
						context.onToggleRecord?.(at, open !== isDefault);
					},
				});
				/*
				 * **At rest the name is read, and titled.** The plain branch of the
				 * shared name, in a cell of its own on the line so the picture can
				 * sit at its inline start; the stamped class gives it In play's title
				 * size, open or closed, through the rule the name field takes it from.
				 */
				const nameHost = reading ? element('div', 'sheetsmith-stat-block-line-name', summary) : summary;
				const input = drawRecordName(
					nameHost,
					controls,
					record,
					named,
					(next) => {
						context.onChange({ records: { [at]: { name: next } } });
					},
					{ readOnly: reading },
				);
				if (input !== null) nameFields.set(at, input);
				const nameCell = nameHost.querySelector<HTMLElement>('.sheetsmith-record-name');
				if (reading) nameCell?.classList.add('sheetsmith-stat-block-name-read');
				if (mode === 'library' && isOn(config, record)) {
					// Right after the name, in the name's own track, rather than in the
					// line's next column.
					nameCell?.classList.add('sheetsmith-stat-block-named');
					element('span', 'sheetsmith-stat-block-tag', nameCell ?? summary, 'Active');
				}
				/*
				 * **A closed form says its vitals on its line**, so the list can be
				 * scanned without opening each form; open, the stat block under it says
				 * them, and the line goes.
				 */
				const vitals = record.error === null ? closedLine(record) : '';
				summaryLine = vitals === '' ? null : element('span', 'sheetsmith-stat-block-summary', summary, vitals);
				summaryLine?.toggleAttribute('hidden', startsOpen);
				if (reading) {
					/*
					 * **The picture is the open record's**, at its name's inline
					 * start: a closed line is the scan line, and a thumbnail three
					 * title lines tall would make every one a head. Its failure is said
					 * at the top of the record's stat block, naming the press that
					 * reaches the field.
					 */
					const failures = element('div', 'sheetsmith-stat-block-problems', detail);
					thumb = drawThumb(nameHost, record, named, failures, false, {
						before: nameCell,
						where: `Edit ${pressNoun}s`,
					});
					thumb?.toggleAttribute('hidden', !startsOpen);
				} else {
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
				}
				if (record.error !== null) {
					element('div', 'sheetsmith-error', row, record.error);
				}
				drawForm(detail, record, at, named, !reading);
			});

			if (reading) {
				// Where In play's switch sits, in its clothes: the one way into the
				// edit face. No Add beside it, because adding is editing.
				const edit = element('button', 'sheetsmith-record-add sheetsmith-stat-block-edit', foot);
				edit.type = 'button';
				element('span', 'sheetsmith-record-add-label', edit, `Edit ${pressNoun}s`);
				edit.addEventListener('click', () => swapFace(edit, LIBRARY_FACE));
				return;
			}
			if (mode === 'library') {
				// In the foot beside **Add form** and in its clothes, so the face's two
				// ways out sit together where the other face's switch sits.
				const back = element('button', 'sheetsmith-record-add sheetsmith-stat-block-back', foot);
				back.type = 'button';
				element('span', 'sheetsmith-record-add-label', back, 'Back to play');
				back.addEventListener('click', () => setFace(PLAY_FACE));
			} else {
				// Every form's **Back to play** in its place and clothes, named for
				// what it leaves: the face that edits the list.
				const done = element('button', 'sheetsmith-record-add sheetsmith-stat-block-done', foot);
				done.type = 'button';
				done.setAttribute('aria-label', `Done editing ${pressNoun}s`);
				element('span', 'sheetsmith-record-add-label', done, 'Done');
				done.addEventListener('click', () => swapFace(done, PLAY_FACE));
			}
			const add = element('button', 'sheetsmith-record-add sheetsmith-stat-block-add', foot);
			add.type = 'button';
			element('span', 'sheetsmith-record-add-label', add, `Add ${lower}`);
			add.addEventListener('click', () => addRecord());
		}

		/** A readable form's vitals on one line, as a closed form says them under Every form. */
		function closedLine(record: StatBlockEntry): string {
			return vitalsSummary(config.fields ?? [], record, allChanges(record));
		}

		/**
		 * A readable form as its brief on In play draws it: the same name the
		 * picker lists, the same line a closed form says under Every form, the
		 * colour the head's rule takes once it is on, and its picture where the
		 * head would draw one.
		 */
		function brief(record: StatBlockEntry, at: number): FormBrief {
			const picture = pictureOf(record);
			return {
				at,
				named: recordLabel(record.name, noun),
				// What the form changes, in In play's words and without In play's
				// reasons: a form that is off pushes nothing, so every change would
				// read as not applying, which says nothing about choosing it.
				changes: allChanges(record)
					.filter((change) => !change.vital)
					.map((change) => change.text)
					.join(' · '),
				tint: tintOf(config, record),
				...(picture === undefined ? {} : { picture }),
			};
		}

		/**
		 * A brief's pairs: the fields In play draws as tiles and every number a
		 * form's `=` sets, through In play's own painters on their brief face,
		 * read-only. Returns what they say, ` · ` between.
		 *
		 * **A field with no value is left out**, where In play keeps its tile and
		 * a dash: In play is the form's whole sheet, where a blank Speed is a slot
		 * to see, and a brief is what tells one form from another, where `Speed —`
		 * says nothing. A toggle always has a value, since unset is off.
		 */
		function briefTiles(into: HTMLElement, at: number): string {
			const record = records[at];
			if (record === undefined || record.error !== null) return '';
			const named = recordLabel(record.name, noun);
			const scope = storedLayer(config.fields, record);
			const said = formFields()
				.filter((field) => fieldType(field) !== 'modifier' && holdsValue(field, record))
				.map((field) => drawVital(into, into, field, record, at, named, scope, 'brief'));
			for (const change of allChanges(record).filter((one) => one.vital)) said.push(drawSetVital(into, change, 'brief'));
			return said.join(' · ');
		}

		/** Whether a record holds a value for a field: a toggle always, a number or text where it is not blank. */
		function holdsValue(field: RecordField, record: StatBlockEntry): boolean {
			const raw = record.fields[field.key] ?? '';
			const type = fieldType(field);
			if (type === 'toggle') return true;
			return type === 'number' ? numberReading(field, raw).value !== '' : raw.trim() !== '';
		}

		/** The fields a form draws: every one but the toggle the picker owns. */
		function formFields(): RecordField[] {
			return (config.fields ?? []).filter((field) => !(toggle !== null && field.key === toggle.key));
		}

		/** Every change a form's modifier fields make, in field order. */
		function allChanges(record: StatBlockEntry): FormChange[] {
			return formFields()
				.filter((field) => fieldType(field) === 'modifier')
				.flatMap((field) => formChanges(field, record));
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
			shiftOpenZones(config.id, removedAt);
		}

		/** Append a record named for the noun, open it, and land in its name. */
		function addRecord(): void {
			awaitingAdd = { id: config.id, held: records.length };
			if (!defaultOpen(records.length)) context.onToggleRecord?.(records.length, true);
			// Onto the face a record is edited on, with `exclusive` or without:
			// the new record's name field is there and nowhere else.
			face = LIBRARY_FACE;
			context.onActivateTab?.(LIBRARY_FACE);
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
		/**
		 * A form's picture in play: a thumbnail through the shared painter, drawn
		 * only where the note holds a picture line and **Picture** is on. A
		 * reference that does not draw takes no thumbnail and says the painter's
		 * own sentence under the head, so the failure is on screen.
		 */
		function drawThumb(
			row: HTMLElement,
			record: StatBlockEntry,
			named: string,
			failures: HTMLElement,
			/**
			 * Whether the sentence names its form: only with two on, where two
			 * lines under one head would otherwise not say whose picture failed.
			 * With one on, the painter's sentence alone, under that form's title.
			 */
			prefixed: boolean,
			/**
			 * Where it goes and which press the fix names: the row's first child
			 * and *Every form* unless said, so In play's head and its two-on name
			 * rows keep both. A companion block's line puts it before the name, after
			 * the chevron, and names **Edit**, the press that reaches Picture there.
			 */
			placing: { before?: Node | null; where?: string } = {},
		): HTMLElement | null {
			const picture = pictureOf(record);
			if (picture === undefined) return null;
			const thumb = element('div', 'sheetsmith-stat-block-thumb', row);
			row.insertBefore(thumb, placing.before === undefined ? row.firstChild : placing.before);
			paintThumb(thumb, picture, named, (message) => {
				thumb.remove();
				// The painter's sentence names the fault; the fix is this
				// component's, since in play the thumbnail has no field to press
				// (`docs/UI.md` §10). Image and Passport keep theirs, whose frame
				// is the field.
				const said = `${message} Set it under ${placing.where ?? 'Every form'}, in Picture.`;
				element('div', 'sheetsmith-stat-block-problem', failures, prefixed ? `${named}: ${said}` : said);
			});
			return thumb;
		}

		/** A form's picture line where the layout draws pictures and the form holds one. */
		function pictureOf(record: StatBlockEntry): string | undefined {
			return hasPicture(config) ? record.picture : undefined;
		}

		/**
		 * A form's picture, read-only, into a thumbnail box: the head's and a
		 * brief's alike, so the painter's classes and options are spelled once and
		 * only what a failure does differs. `alt` is empty because the form's name
		 * is beside it in either place.
		 */
		function paintThumb(
			thumb: HTMLElement,
			source: string,
			named: string,
			onError: (message: string) => void,
			/** A brief's, inside a button, so its frame is phrasing content. */
			inline = false,
		): void {
			renderPictureFrame(thumb, {
				...(inline ? { inline: true } : {}),
				classes: { frame: 'sheetsmith-image-frame', picture: 'sheetsmith-image-picture', field: 'sheetsmith-image-input' },
				source,
				name: `${named} picture`,
				alt: '',
				prefix: null,
				status,
				readOnly: true,
				onError,
				...(context.resource === undefined ? {} : { resource: context.resource }),
				onCommit: () => undefined,
			});
		}

		/**
		 * A form's own `Tint` outside the list, said under the head in the
		 * problem line's clothes, the form named only with two on, on the
		 * picture line's rule. The form tints in the block's colour meanwhile,
		 * exactly as if it held none; nothing is written until the reader chooses.
		 */
		function reportStrayTint(record: StatBlockEntry, named: string, failures: HTMLElement, prefixed: boolean): void {
			const own = recordTint(config, record);
			if (own === null || !('stray' in own)) return;
			const said = strayTintSentence(own.stray, ' under Every form, in Tint');
			element('div', 'sheetsmith-stat-block-problem', failures, prefixed ? `${named}: ${said}` : said);
		}

		/**
		 * The open form's **Tint** section under Every form (`docs/features/
		 * form-tint-colour.md`, question 4): a dropdown in Obsidian's own clothes
		 * and a swatch previewing the colour the sheet will draw. **Default**
		 * names the block's colour and removes the entry; every other choice
		 * writes it lower case, **Accent** included, so a form can stay accent in
		 * a green block. A stray word is the first option, disabled and selected,
		 * so any choice is a change, and its sentence sits under the dropdown.
		 */
		function drawTintSection(into: HTMLElement, record: StatBlockEntry, at: number, named: string): void {
			const wrap = element('section', 'sheetsmith-stat-block-section sheetsmith-stat-block-tint', into);
			const head = element('div', 'sheetsmith-stat-block-section-head', wrap);
			element('h4', 'sheetsmith-component-label sheetsmith-stat-block-section-heading', head, 'Tint');
			const line = element('div', 'sheetsmith-stat-block-tint-line', wrap);
			const select = element('select', 'dropdown sheetsmith-stat-block-tint-choice', line);
			select.setAttribute('aria-label', `${named} tint`);
			const own = recordTint(config, record);
			if (own !== null && 'stray' in own) {
				const held = element('option', '', select, `"${own.stray}" (not a ${TINT_NOUN})`);
				held.value = own.stray;
				held.disabled = true;
			}
			const block = blockTint(config);
			element('option', '', select, `Default (${block})`).value = '';
			for (const colour of TINT_COLOURS) element('option', '', select, tintWord(colour)).value = colour;
			select.value = own === null ? '' : 'colour' in own ? own.colour : own.stray;
			const swatch = tintSwatch(line, tintOf(config, record));
			if (own !== null && 'stray' in own) {
				// Tied to the dropdown, so a reader standing on it hears why its
				// value is marked rather than finding the sentence by moving on.
				const problem = element('div', 'sheetsmith-stat-block-problem', wrap, strayTintSentence(own.stray, ''));
				problem.id = `sheetsmith-stat-block-${config.id}-${at}-tint-problem`;
				select.setAttribute('aria-invalid', 'true');
				select.setAttribute('aria-describedby', problem.id);
			}
			select.addEventListener('change', () => {
				const chosen = tintColourOf(select.value);
				// Painted before reporting (PATTERNS §5): the swatch answers the
				// choice whether or not the write comes back as a rebuild.
				swatch.setAttribute(TINT_ATTRIBUTE, chosen ?? block);
				context.onChange({ records: {}, tints: { [at]: chosen } });
			});
		}

		/**
		 * The open form's **Picture** section under Every form: the whole frame and
		 * its field, `picture-frame.ts`'s gesture, suggester and refusals exactly.
		 * A draft that is not one embed is refused in the field and nothing is
		 * written; an empty field removes the line.
		 */
		function drawPictureSection(into: HTMLElement, record: StatBlockEntry, at: number, named: string): void {
			const wrap = element('section', 'sheetsmith-stat-block-section sheetsmith-stat-block-picture', into);
			const head = element('div', 'sheetsmith-stat-block-section-head', wrap);
			element('h4', 'sheetsmith-component-label sheetsmith-stat-block-section-heading', head, 'Picture');
			const box = element('div', 'sheetsmith-stat-block-picture-box', wrap);
			renderPictureFrame(box, {
				classes: { frame: 'sheetsmith-image-frame', picture: 'sheetsmith-image-picture', field: 'sheetsmith-image-input' },
				source: record.picture ?? '',
				name: `${named} picture`,
				alt: '',
				prefix: null,
				status,
				...(context.resource === undefined ? {} : { resource: context.resource }),
				...(context.suggestFile === undefined ? {} : { suggestFile: context.suggestFile }),
				refuse: (next) => embedRefusal(next),
				onCommit: (next) => context.onChange({ records: {}, zoneEdits: { [at]: { picture: next } } }),
			});
		}

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
			const fields = formFields();
			const changes = new Map<string, FormChange[]>();
			for (const field of fields) {
				if (fieldType(field) === 'modifier') changes.set(field.key, formChanges(field, record));
			}
			// A form's `=` on a component's single number is one of its stats, so it
			// is read in the strip beside HP and Speed rather than in the list.
			const set = [...changes.values()].flat().filter((change) => change.vital);
			if (editing && hasPicture(config)) drawPictureSection(into, record, at, named);
			// Under Every form alone: a companion block has no form in play, so
			// nothing it holds could tint.
			if (editing && exclusive && hasTintPerRecord(config)) drawTintSection(into, record, at, named);
			const zones = bodyZones(config);
			const zoneHost: ZoneHost = {
				host: controls,
				armed,
				doc,
				record: at,
				named,
				editing,
				zones,
				pictureGuard: hasPicture(config) && record.picture === undefined,
				commit: (edit) => context.onChange({ records: {}, zoneEdits: { [at]: edit } }),
			};
			for (const part of zoneOrder(config)) {
				const key = part.key.trim().toLowerCase();
				const heading = (part.heading ?? '').trim();
				if (key === 'vitals') {
					const vitals = fields.filter((field) => fieldType(field) !== 'modifier');
					if (vitals.length === 0 && set.length === 0) continue;
					const host = heading === '' ? into : section(into, heading).body;
					const strip = element('div', 'sheetsmith-stat-block-vitals', host);
					for (const field of vitals) drawVital(strip, into, field, record, at, named, scope, editing ? 'edit' : 'play');
					for (const change of set) drawSetVital(strip, change, 'play');
				} else if (key === 'changes') {
					for (const field of fields) {
						if (fieldType(field) === 'modifier') {
							drawPlayChanges(
								into,
								field,
								record,
								at,
								named,
								heading === '' ? fieldLabel(field) : heading,
								editing,
								changes.get(field.key) ?? [],
							);
						}
					}
				} else {
					const zone = zones.find((one) => one.key === part.key.trim());
					if (zone !== undefined) drawZone(into, zone, record.zones?.[zone.key], zoneHost);
				}
			}
			// After the layout's zones: what no zone owns, drawn on both faces.
			for (const drift of record.drift ?? []) drawDrift(into, drift, context, editing);
		}

		/** A record whose fence will not read: its prose alone, which is what survives. */
		function drawBroken(into: HTMLElement, record: StatBlockEntry, named: string): void {
			if (record.body === '') return;
			const prose = element('div', 'sheetsmith-record-body', into);
			drawRecordBody(prose, into, controls, { text: record.body, error: record.error, named }, () => undefined);
		}

		/** One vital: its name over its value, the value a control where it is stepped. */
		/**
		 * One record field as a tile, on the face it is drawn for: **Every form**
		 * edits it, **In play** reads a text field and keeps a toggle's ring and a
		 * number's field and steppers as controls, and **a brief** reads every one
		 * of them — a painted ring, the number as text — inside a button, so in
		 * spans, and nothing in it takes a press. Returns what the tile says, as
		 * words, which a brief speaks as its description.
		 */
		function drawVital(
			strip: HTMLElement,
			row: HTMLElement,
			field: RecordField,
			record: StatBlockEntry,
			at: number,
			named: string,
			scope: Record<string, FieldValue>,
			face: VitalFace,
		): string {
			const type = fieldType(field);
			const name = fieldLabel(field);
			const raw = record.fields[field.key] ?? '';
			const { item, value } = vitalTile(strip, `sheetsmith-stat-block-vital-${type}`, name, face);
			const commit = (next: string): void => {
				context.onChange({ records: { [at]: { fields: { [field.key]: next } } } });
			};
			if (type === 'text') {
				// Read in play and on a brief; a field under **Every form**, which is
				// the form's editor.
				const said = raw.trim() === '' ? '—' : raw;
				if (face === 'edit') drawText(value, row, raw, `${named} ${name}`, commit);
				else element('span', 'sheetsmith-stat-block-vital-text', value, said);
				return `${name} ${said}`;
			}
			if (face === 'brief') return `${name} ${readVital(value, type, field, raw)}`;
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
				return name;
			}
			const accessible = `${named} ${name}`;
			const cell = element('div', 'sheetsmith-stat-block-number', value);
			const number = drawRecordNumber(cell, row, controls, { field, raw, name, accessible, body: true, scope }, commit);
			if (!(recordsOwnMax(field) || field.max !== undefined)) return name;
			const stored = splitBounded(raw).value;
			if (stored.trim() !== '' && Number.isFinite(Number(stored)) && Number(stored) < 0) {
				item.classList.add('sheetsmith-stat-block-down');
				// The stored value as the tile draws it, with a true minus sign.
				const said = `\u2212${String(-Number(stored.trim()))}`;
				element('div', 'sheetsmith-stat-block-down-note', row, `At ${said}. Carry any leftover damage over by hand.`);
			}
			drawSteppers(cell, number.input, accessible, field, (next) => number.set(next), number.ceiling);
			return name;
		}

		/**
		 * A tile's frame — the box, its label at the component label's rank, and
		 * the value line under it — for a field and for a set number alike. **On a
		 * brief it is no tile**: a pair of a small muted label over its value, in
		 * spans since the button holds phrasing content only, with none of the
		 * tile's box, columns or truncating label, so a pair is as wide as what it
		 * says (`docs/features/stat-block-in-play-polish.md` §4).
		 */
		function vitalTile(
			strip: HTMLElement,
			kind: string,
			label: string,
			face: VitalFace,
		): { item: HTMLElement; value: HTMLElement } {
			if (face === 'brief') {
				const item = element('span', `sheetsmith-stat-block-brief-stat ${kind}`, strip);
				element('span', 'sheetsmith-stat-block-brief-stat-label', item, label);
				return { item, value: element('span', 'sheetsmith-stat-block-brief-stat-value', item) };
			}
			const item = element('div', `sheetsmith-stat-block-vital ${kind}`, strip);
			element('div', 'sheetsmith-component-label sheetsmith-stat-block-vital-label', item, label);
			return { item, value: element('div', 'sheetsmith-stat-block-vital-value', item) };
		}

		/**
		 * A toggle or a number read rather than controlled, for a brief: the
		 * level ring painted on a span, and the number as text, compact where it
		 * has a ceiling (`22/34`, the ceiling muted), as the closed line says it.
		 * Returns the reading in words.
		 */
		function readVital(value: HTMLElement, type: string, field: RecordField, raw: string): string {
			if (type === 'toggle') {
				const on = isFlagSet(raw);
				const mark = element('span', 'sheetsmith-level-ring sheetsmith-stat-block-ring', value);
				mark.setAttribute('aria-hidden', 'true');
				paintLevelRing(mark, {}, on ? 1 : 0, false);
				return on ? 'on' : 'off';
			}
			const { value: stored, ceiling } = numberReading(field, raw);
			const shown = stored === '' ? '—' : stored;
			element('span', 'sheetsmith-stat-block-reading', value, shown);
			if (ceiling === '') return shown;
			// The ceiling muted and run in, with no gap, as the closed line has it.
			element('span', 'sheetsmith-stat-block-brief-ceiling', value, `/${ceiling}`);
			return `${shown}/${ceiling}`;
		}

		/**
		 * A form's `=` on a component's single number, as a vital: the component's
		 * label over the number it is set to, read on both faces since the
		 * modifier glyph is where it is edited. One that is not applying says why
		 * in words beside its muted number, as the list would.
		 */
		function drawSetVital(strip: HTMLElement, change: FormChange, face: VitalFace): string {
			const { value } = vitalTile(strip, 'sheetsmith-stat-block-vital-set', change.label, face);
			// A brief is a form that is not on, so whether it applies *now* is not
			// its question: it says what the form sets, as `briefChanges` does.
			const idle = face !== 'brief' && !change.applies;
			const said = face === 'brief' ? change.text : changeText(change);
			element(
				'span',
				idle ? 'sheetsmith-stat-block-vital-text sheetsmith-stat-block-change-idle' : 'sheetsmith-stat-block-vital-text',
				value,
				said,
			);
			return `${change.label} ${said}`;
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
				const outcomes = context.modifiers?.outcomes(part, (held ??= values()), config.label) ?? [];
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
				list.push({ text: changeText(change), applies: change.applies });
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
	},
};

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
	// A grant leads with the buffer's whole label, `HP · temp grants 10`: its
	// short half names no pool, and two pools' temporary points would read alike
	// (`docs/features/granted-temporary-points.md`).
	if (outcome.grant === true) return { group, text: `${outcome.targetLabel} ${said}` };
	return { group: at < 0 ? outcome.target : group, text: `${lead} ${said}` };
}

/** One change a form's modifier field makes, as the form reads it. */
/**
 * The face a tile is drawn for: **Every form** edits it, **In play** reads it
 * with its controls live, and a brief reads it with none.
 */
type VitalFace = 'edit' | 'play' | 'brief';

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
/** Whether a noun is written in capitals throughout, `NPC`, and so keeps its case. */
export function isAcronym(noun: string): boolean {
	return noun.length > 1 && /\p{Lu}/u.test(noun) && noun === noun.toUpperCase();
}

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
		const { value, ceiling } = numberReading(field, record.fields[field.key] ?? '');
		if (value === '') continue;
		said.push(`${fieldLabel(field)} ${ceiling === '' ? value : `${value}/${ceiling}`}`);
	}
	for (const change of changes) {
		if (change.vital && change.applies) said.push(`${change.label} ${change.text}`);
	}
	return said.join(' · ');
}

/**
 * A number field's stored value and the ceiling it reads against — the
 * record's own where the layout says so, else the layout's `max`, else none —
 * as text, trimmed. One reading for the closed line and a brief's tile, so the
 * two say the same figures for one form.
 */
function numberReading(field: RecordField, raw: string): { value: string; ceiling: string } {
	const entry = splitBounded(raw);
	const ceiling = recordsOwnMax(field) ? (entry.ceiling ?? '').trim() : field.max !== undefined ? String(field.max) : '';
	return { value: entry.value.trim(), ceiling };
}

/** What a change says, with why it is not applying where it is not: `STR +4`, `CON +3 (already higher)`. */
function changeText(change: FormChange): string {
	return change.why === null ? change.text : `${change.text} (${change.why})`;
}

/**
 * A square in a colour's edge, previewing the Tint dropdown's choice under Every
 * form, taking no pointer and no focus, and hidden from assistive tech because
 * the dropdown beside it already says the colour. The stylesheet draws it from
 * the attribute, so no inline colour is set.
 */
function tintSwatch(into: HTMLElement, colour: TintColour): HTMLElement {
	const swatch = element('span', 'sheetsmith-stat-block-tint-swatch', into);
	swatch.setAttribute('aria-hidden', 'true');
	swatch.setAttribute(TINT_ATTRIBUTE, colour);
	return swatch;
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
