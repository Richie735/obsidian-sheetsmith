/*
 * A stat block form's body zones, drawn (`docs/features/stat-block-zones.md`,
 * Design): a table, a list of named features or a block of text, each under
 * the heading the note stores, and the drift no zone owns.
 *
 * **Beside `stat-block.ts` for atomicity at one consumer**, on
 * `modifier-form.ts`'s and `record-line-fit.ts`'s terms (PATTERNS §2): drawing
 * three kinds of zone on two faces, and the drift, is a second job in a file
 * whose job is a list of records under a picker. In no registry, declaring no
 * `ComponentDefinition`, touching no file, and taking only `setIcon` from
 * `obsidian`.
 *
 * **It owns the zone's shape and its drawing, and nothing about the note.**
 * What a zone *reads* arrives already read (`ZoneRead`), and what a gesture
 * changes leaves as one `ZoneEdit` through the host's `commit`: the component
 * turns both to and from bytes through `parse/zones.ts`, `parse/table.ts` and
 * `parse/features.ts`. So nothing here can write a body, and a painter that
 * cannot write cannot write the wrong one.
 *
 * **An empty zone draws nothing in play**: no heading, no box, no placeholder,
 * so a Fate mook and a main NPC share one layout. Under **Every form** every
 * zone draws, because that is where a zone is filled.
 */

import { setIcon } from 'obsidian';
import { bindEditable } from '../interaction/editable';
import { ArmRegister, bindArmToConfirm } from '../interaction/arm-to-confirm';
import { readFeatures } from '../parse/features';
import { displayText } from '../parse/wikilink';
import { ZoneColumnType, ZoneType, zoneHeadingKey, zoneHeadingLines } from '../parse/zones';
import { RenderContext } from '../types';
import { element } from '../ui/element';
import { paintLinkedText } from './linked-text';
import {
	bindDisclosure,
	drawRecordBody,
	paintRecordProse,
	RecordHost,
	recordRefusalNotice,
	REMOVE_ICON,
} from './record-controls';

/** One column of a table zone: text or a number. The first names each row. */
export interface StatBlockColumn {
	/** Its heading in the note, and the key a row's cell is written under. */
	key: string;
	/** What the column is called on the sheet, where it should differ from the key. */
	name?: string;
	type?: ZoneColumnType;
}

/**
 * One zone as a layout declares it. A body zone has a type and a heading the
 * note stores; a built-in has neither type nor stored heading, and its
 * `heading` only changes what the sheet calls it.
 */
export interface StatBlockZone {
	key: string;
	type?: string;
	heading?: string;
	columns?: StatBlockColumn[];
	/** A text zone's: closed behind its heading in play, open under Every form. */
	collapsed?: boolean;
}

/** A body zone the configuration has already accepted. */
export interface BodyZone {
	key: string;
	type: ZoneType;
	heading: string;
	columns: StatBlockColumn[];
	collapsed: boolean;
}

/** What one zone holds in one record, as read. */
export type ZoneRead =
	| {
			type: 'table';
			/** Each row's cells in column order, the name first. */
			rows: string[][];
			/** Text after the table, kept and drawn read-only. */
			after: string;
			/** The content where it does not open with a table, read-only, or null. */
			notTable: string | null;
	  }
	| {
			type: 'features';
			lead: string;
			entries: { name: string; usage: string; source: string; text: string }[];
	  }
	| {
			type: 'text';
			text: string;
			/** Whether it was read off a 0.9.0 lead, which a lone embed could turn into a picture. */
			fromLead: boolean;
	  };

/** Content no zone owns, as the component read it. */
export interface ZoneDriftRead {
	kind: 'unmatched' | 'second' | 'lead';
	heading: string | null;
	content: string;
}

/** One table zone edit, by column key. */
export interface TableZoneEdit {
	rows?: Record<number, Record<string, string>>;
	added?: readonly Record<string, string>[];
	removed?: readonly number[];
}

/** One features zone edit: the lead, one entry's parts, an add or a remove. */
export interface FeatureZoneEdit {
	lead?: string;
	entry?: number;
	name?: string;
	usage?: string;
	text?: string;
	added?: boolean;
	removed?: number;
}

/** One gesture's change to one record's body. */
export interface ZoneEdit {
	/** Which zone; absent for a picture edit, which belongs to none. */
	zone?: string;
	table?: TableZoneEdit;
	features?: FeatureZoneEdit;
	text?: string;
	/** The picture line: an embed, or '' to clear it. */
	picture?: string;
}

/** What a zone needs from the form drawing it. */
export interface ZoneHost {
	host: RecordHost;
	armed: ArmRegister;
	doc: Document;
	/** The record's position, and what it is called. */
	record: number;
	named: string;
	editing: boolean;
	/** Every body zone this layout declares, for the commit guards' sentences. */
	zones: readonly BodyZone[];
	/**
	 * Whether a 0.9.0 lead's text opening with a lone embed would be read as
	 * the picture next time: **Picture** on, and no picture already.
	 */
	pictureGuard: boolean;
	commit: (edit: ZoneEdit) => void;
}

/**
 * Which collapsed text zones are open: by the block's id, then the record's
 * position, then the zone's key. Held in structure rather than as a joined
 * string, so the one place that writes it and the one that shifts it past a
 * deleted record cannot spell it two ways.
 *
 * **Held in module state rather than in the view's posture**, and that is a
 * cost rather than a design: the posture pairs are an index into alternatives
 * and a set of open records, and both are taken — the faces hold `activeTab`
 * and the library holds `openRecords`. A third pair is the generalisation the
 * view's own comment refuses at two. So a disclosure survives a rebuild and not
 * a reload, which is the cheaper half to lose.
 */
const openZones = new Map<string, Map<number, Set<string>>>();

function setZoneOpen(id: string, record: number, zone: string, open: boolean): void {
	const records = openZones.get(id) ?? new Map<number, Set<string>>();
	openZones.set(id, records);
	const zones = records.get(record) ?? new Set<string>();
	records.set(record, zones);
	if (open) zones.add(zone);
	else zones.delete(zone);
}

/**
 * Move one block's open disclosures up past a record that is going, in the
 * same commit as its delete, so the record that takes its place inherits none.
 */
export function shiftOpenZones(id: string, removedAt: number): void {
	const records = openZones.get(id);
	if (records === undefined) return;
	const moved = new Map<number, Set<string>>();
	for (const [at, zones] of records) {
		if (at < removedAt) moved.set(at, zones);
		else if (at > removedAt) moved.set(at - 1, zones);
	}
	openZones.set(id, moved);
}

/** A table zone's heading names, in the order a fresh table writes them. */
export function zoneHeaders(zone: BodyZone): string[] {
	return zone.columns.map((column) => column.key);
}

/**
 * Whether a table row is the placeholder **Add** writes: its name still the
 * first column's own word, or blank, and every other cell empty.
 */
function isPlaceholder(cells: readonly string[], first: string): boolean {
	const name = (cells[0] ?? '').trim().toLowerCase();
	if (name !== '' && name !== first.trim().toLowerCase()) return false;
	return cells.slice(1).every((cell) => cell.trim() === '');
}

/** Whether a zone has nothing to draw in play. */
export function zoneIsEmpty(zone: BodyZone, read: ZoneRead | undefined): boolean {
	if (read === undefined) return true;
	if (read.type === 'table') {
		if (read.notTable !== null || read.after !== '') return false;
		return read.rows.every((row) => isPlaceholder(row, zone.columns[0]?.key ?? ''));
	}
	if (read.type === 'features') return read.lead === '' && read.entries.length === 0;
	return read.text === '';
}

/**
 * A number as a modifier reads, signed: `6` reads `+6` and `0` reads `+0`.
 * Text that is not a number, or already carries a sign, is left as written.
 */
function signedText(text: string): string {
	const value = Number(text);
	if (text.trim() === '' || !Number.isFinite(value) || /^[+-]/.test(text)) return text;
	return value >= 0 ? `+${text}` : text;
}

/** What a column is called on the sheet. */
function columnLabel(column: StatBlockColumn): string {
	return (column.name ?? '').trim() || column.key;
}

/** One column of a table zone as In play shows it. */
interface ShownColumn {
	label: string;
	number: boolean;
	/**
	 * Whether its label says what the zone's heading says, under the zone's own
	 * tolerant match, so it is hidden from sight and kept for a screen reader:
	 * *Attack* over *Attack* says one word twice. The 5e starter heads its zone
	 * **Attacks** over a column **Attack**, which do not match, and that is the
	 * owner's call: the column is shown.
	 */
	repeats: boolean;
}

/** A table zone as In play shows it: its columns, and the rows that survive. */
interface ShownTable {
	columns: ShownColumn[];
	/**
	 * Each surviving row's cells in column order, as their source text: the
	 * placeholder row left out, every cell but the name trimmed, and a number
	 * column signed. The links are still in it, for each face to draw its way.
	 */
	rows: string[][];
}

/**
 * **One reading of a table zone in play, for its two drawings**: In play's
 * table and a form's brief (`docs/features/stat-block-brief-zone.md`). So the
 * two cannot disagree about which rows survive, what a column is called or how
 * a number is signed.
 */
function shownTable(zone: BodyZone, read: Extract<ZoneRead, { type: 'table' }>): ShownTable {
	const repeats = (text: string): boolean => zoneHeadingKey(text) === zoneHeadingKey(zone.heading);
	const columns = zone.columns.map((column) => {
		const label = columnLabel(column);
		return { label, number: column.type === 'number', repeats: repeats(label) };
	});
	const firstKey = zone.columns[0]?.key ?? '';
	const rows = read.rows
		.filter((cells) => !isPlaceholder(cells, firstKey))
		.map((cells) =>
			zone.columns.map((column, at) => {
				if (at === 0) return cells[0] ?? '';
				const text = (cells[at] ?? '').trim();
				return column.type === 'number' ? signedText(text) : text;
			}),
		);
	return { columns, rows };
}

/**
 * Draw a table zone into a form's brief, read-only and in spans, and return
 * what it says as one sentence, or '' where it drew nothing
 * (`docs/features/stat-block-brief-zone.md`). The brief's painter for the zone
 * its layout names, `stat-block-briefs.ts`'s `zone`.
 *
 * **In play's reading, drawn for a button.** A button holds phrasing content,
 * so the grid is spans and no table roles, which a button's children would
 * flatten anyway; a link is drawn as its display text, since an anchor cannot
 * sit inside a button; and the text after the table, or a zone that is not a
 * table, is markdown In play renders as blocks, so a form holding no row In
 * play would draw draws nothing here and its brief keeps its changes line.
 *
 * **The sentence is the grid read as text**, `Ability Scores: Str 19, Dex 10`,
 * `; ` between rows and a blank cell left out: the fields' "label reading"
 * grammar, since a grid read in order runs its labels into its cells. A label
 * hidden on sight is still said.
 */
export function drawZoneBrief(into: HTMLElement, zone: BodyZone, read: ZoneRead | undefined): string {
	// `read.type` narrows the union: the component reads a table zone as a
	// table, so a brief never meets the other two. An accepted table zone has a
	// column (`zonesError`), so no empty-columns case is asked here.
	if (read === undefined || read.type !== 'table' || read.notTable !== null) return '';
	const { columns, rows } = shownTable(zone, read);
	if (rows.length === 0) return '';
	into.style.setProperty('--sheetsmith-brief-zone-columns', String(columns.length));
	// The first column names each row, so it is never a number's, as In play's
	// row heading is neither end-aligned nor signed (`shownTable`).
	const number = (at: number): string =>
		at > 0 && columns[at]?.number === true ? ' sheetsmith-stat-block-brief-zone-number' : '';
	columns.forEach((column, at) => {
		into.createSpan({
			cls: `sheetsmith-stat-block-brief-zone-label${number(at)}`,
			text: column.repeats ? '' : column.label,
		});
	});
	const said: string[] = [];
	rows.forEach((cells, row) => {
		const pairs: string[] = [];
		// A row after the first is spaced from the one above it; the first sits
		// under its labels as a value under its label (the stylesheet's reason).
		const next = row > 0 ? ' sheetsmith-stat-block-brief-zone-next' : '';
		cells.forEach((cell, at) => {
			const shown = displayText(cell).trim();
			into.createSpan({
				cls: `sheetsmith-stat-block-brief-zone-cell${at === 0 ? ' sheetsmith-stat-block-brief-zone-name' : ''}${number(at)}${next}`,
				text: shown,
			});
			if (shown !== '') pairs.push(`${columns[at]?.label ?? ''} ${shown}`);
		});
		said.push(pairs.join(', '));
	});
	return `${zone.heading}: ${said.join('; ')}`;
}

/** Markdown drawn read-only: the app's renderer where there is one. */
type MarkdownContext = Pick<RenderContext, 'renderMarkdown' | 'link'>;

function drawMarkdown(into: HTMLElement, text: string, context: MarkdownContext): void {
	if (context.renderMarkdown !== undefined) {
		context.renderMarkdown(text, into, () => paintRecordProse(into, text, context));
	} else {
		paintRecordProse(into, text, context);
	}
}

/**
 * The heading a features entry or lead advises for a refused `## ` or `### `
 * line. `headingRefusal` refuses every `####` line there, so the record body's
 * default advice would be refused in turn; `#####` reads as no zone. One
 * spelling for both sentences that name it: the guard below says it too.
 */
const MINOR_HEADING = '##### ';

/**
 * The commit guard for a heading line (`docs/features/stat-block-zones.md`,
 * The commit guards): the plugin's own gestures never write a body it would
 * read differently. In text a `####` line is refused only where it matches a
 * zone, since one that matches none is that zone's own text again on the next
 * read; anywhere else it is refused at all, since there it would be drift.
 */
function headingRefusal(text: string, zones: readonly BodyZone[], anyHeading: boolean): string | null {
	for (const line of zoneHeadingLines(text)) {
		const key = zoneHeadingKey(line);
		const zone = zones.find((one) => zoneHeadingKey(one.heading) === key);
		if (zone !== undefined) {
			return `Not saved. "${line.trim()}" would start the ${zone.heading} zone. Use ${MINOR_HEADING.trim()} for a heading inside text.`;
		}
		if (anyHeading) {
			return `Not saved. "${line.trim()}" would start a heading this layout has no zone for. Use ${MINOR_HEADING.trim()} for a heading inside text.`;
		}
	}
	return null;
}

/** A lone embed opening a 0.9.0 lead's text, which would read as the picture. */
function pictureRefusal(text: string): string | null {
	const first = text.trimStart().split(/\r?\n/);
	const line = first[0] ?? '';
	const next = first[1] ?? '';
	if (!/^!\[\[[^\]]+\]\]\s*$/.test(line) || next.trim() !== '') return null;
	return 'Not saved. A picture on its own first line is the form\'s picture. Set it under Picture instead.';
}

/** A paragraph opening with a bold name, which would start a new entry. */
function entryRefusal(text: string, lead: boolean): string | null {
	const read = readFeatures(lead ? text : `x ${text}`);
	const entry = read.entries[0];
	if (entry === undefined) return null;
	return `Not saved. "${entry.source.split(/\r?\n/)[0] ?? ''}" at the start of a paragraph would start a new entry. Add it with Add entry instead.`;
}

/** Why a table cell's text cannot be stored, or null. */
function cellRefusal(next: string, zones: readonly BodyZone[]): string | null {
	if (/[\r\n]/.test(next)) return 'Not saved. A table cell is one line. Remove the line break.';
	return headingRefusal(next.trimStart(), zones, true);
}

/** Why an entry's name cannot be stored, or null. */
function nameRefusal(next: string): string | null {
	if (next.trim() === '') return 'Not saved. An entry needs a name, or its text joins the entry before it.';
	if (/[\r\n]/.test(next)) return 'Not saved. A name is one line. Remove the line break.';
	if (/\*\*|__/.test(next)) return 'Not saved. A name cannot hold ** or __, which mark where the name ends.';
	if (/\)\s*$/.test(next)) return 'Not saved. A name ending in a parenthesis reads as its usage. Put that part under Usage.';
	return null;
}

/**
 * Why an entry's usage cannot be stored, or null. No line-break branch: the
 * field is an `<input>`, which cannot hold one.
 */
function usageRefusal(next: string): string | null {
	if (/[()]/.test(next)) return 'Not saved. A usage is written inside parentheses already. Remove the ones typed here.';
	return null;
}

/**
 * Draw one body zone into a form: its heading and its content, a field
 * wherever Every form edits it. Nothing at all in play where it is empty.
 */
export function drawZone(into: HTMLElement, zone: BodyZone, read: ZoneRead | undefined, host: ZoneHost): void {
	if (!host.editing && zoneIsEmpty(zone, read)) return;
	if (zone.type === 'text') {
		drawTextZone(into, zone, read?.type === 'text' ? read : { type: 'text', text: '', fromLead: false }, host);
		return;
	}
	const wrap = element('section', `sheetsmith-stat-block-section sheetsmith-stat-block-zone sheetsmith-stat-block-zone-${zone.type}`, into);
	const head = element('div', 'sheetsmith-stat-block-section-head', wrap);
	element('h4', 'sheetsmith-component-label sheetsmith-stat-block-section-heading', head, zone.heading);
	const body = element('div', 'sheetsmith-stat-block-section-body', wrap);
	if (zone.type === 'table') {
		drawTableZone(body, zone, read?.type === 'table' ? read : { type: 'table', rows: [], after: '', notTable: null }, host);
	} else {
		drawFeaturesZone(body, zone, read?.type === 'features' ? read : { type: 'features', lead: '', entries: [] }, host);
	}
}

/**
 * A text zone: the prose in the card's clothes, edited on a press. Collapsed,
 * its heading is a disclosure in play, closed on first render; under Every
 * form it is drawn open, because that is where it is filled.
 */
function drawTextZone(into: HTMLElement, zone: BodyZone, read: Extract<ZoneRead, { type: 'text' }>, host: ZoneHost): void {
	const { host: controls } = host;
	const disclosed = zone.collapsed && !host.editing;
	const wrap = element(
		'section',
		`sheetsmith-stat-block-section sheetsmith-stat-block-zone sheetsmith-stat-block-zone-text${disclosed ? ' sheetsmith-stat-block-prose' : ''}`,
		into,
	);
	const box = element('div', 'sheetsmith-record-body sheetsmith-stat-block-body sheetsmith-stat-block-panel', wrap);
	box.id = `sheetsmith-stat-block-zone-${controls.id}-${host.record}-${zone.key}-${host.editing ? 'list' : 'play'}`;
	if (disclosed) {
		const button = element('button', 'sheetsmith-stat-block-disclosure', wrap);
		wrap.insertBefore(button, box);
		const glyph = element('span', 'sheetsmith-stat-block-disclosure-glyph', button);
		glyph.setAttribute('aria-hidden', 'true');
		element('span', 'sheetsmith-component-label sheetsmith-stat-block-section-heading', button, zone.heading);
		bindDisclosure({
			button,
			region: box,
			glyph,
			open: openZones.get(controls.id)?.get(host.record)?.has(zone.key) === true,
			onToggle: (open) => setZoneOpen(controls.id, host.record, zone.key, open),
		});
	} else {
		const head = element('div', 'sheetsmith-stat-block-section-head', wrap);
		wrap.insertBefore(head, box);
		element('h4', 'sheetsmith-component-label sheetsmith-stat-block-section-heading', head, zone.heading);
	}
	drawRecordBody(
		box,
		wrap,
		controls,
		{
			text: read.text,
			error: null,
			named: host.named,
			label: `${host.named} ${zone.heading}`,
			placeholder: 'Add text',
			refuse: (next) =>
				headingRefusal(next, host.zones, false) ??
				(host.pictureGuard && read.fromLead ? pictureRefusal(next) : null),
		},
		(next) => host.commit({ zone: zone.key, text: next }),
	);
}

/**
 * A table zone: the sheet's own Table, one `<colgroup>` on both faces. **In
 * play the cells are text**, the name a bold row heading with its links live
 * and a number signed; **under Every form they are fields**, with a delete
 * column and the Table's own add row as the box's foot. Content that does not
 * open with a table is drawn read-only under its error, and offers no field.
 */
function drawTableZone(into: HTMLElement, zone: BodyZone, read: Extract<ZoneRead, { type: 'table' }>, host: ZoneHost): void {
	const { host: controls, editing, named } = host;
	const { context, status } = controls;
	if (read.notTable !== null) {
		element('div', 'sheetsmith-error', into, "Not a table. Edit it in markdown view, or change this zone's type.");
		drawMarkdown(element('div', 'sheetsmith-stat-block-zone-markdown', into), read.notTable, context);
		return;
	}
	const [first, ...columns] = zone.columns;
	const firstKey = first?.key ?? '';
	const all = read.rows;
	const shown = shownTable(zone, read);
	const wrap = element(
		'div',
		`sheetsmith-table-box sheetsmith-stat-block-actions${editing ? ' sheetsmith-stat-block-actions-editing' : ''}`,
		into,
	);
	const table = element('table', 'sheetsmith-table sheetsmith-stat-block-table', wrap);
	table.setAttribute('aria-label', `${named} ${zone.heading}`);
	const widths = element('colgroup', '', table);
	element('col', 'sheetsmith-stat-block-col-name', widths);
	for (const column of columns) element('col', `sheetsmith-stat-block-col-${column.type ?? 'text'}`, widths);
	// The delete column on both faces, empty in play, so the percentages
	// resolve against one width and no column moves on a face switch.
	element('col', 'sheetsmith-stat-block-col-remove', widths);
	const headRow = element('tr', '', element('thead', '', table));
	// A heading that repeats the zone's is hidden from sight and kept for a
	// screen reader (`ShownColumn.repeats`).
	shown.columns.forEach((column, at) => {
		const type = zone.columns[at]?.type ?? 'text';
		const th = element('th', at === 0 ? 'sheetsmith-stat-block-action-name' : `sheetsmith-stat-block-action-${type}`, headRow);
		th.setAttribute('scope', 'col');
		if (column.repeats) element('span', 'sheetsmith-sr-only', th, column.label);
		else th.textContent = column.label;
	});
	const removeHead = element('th', 'sheetsmith-stat-block-remove-cell', headRow);
	if (editing) element('span', 'sheetsmith-sr-only', removeHead, 'Delete');
	else removeHead.setAttribute('aria-hidden', 'true');
	const body = element('tbody', '', table);
	if (!editing) {
		for (const cells of shown.rows) {
			const tr = element('tr', 'sheetsmith-stat-block-action-row', body);
			const name = element('th', 'sheetsmith-stat-block-action-name', tr);
			name.setAttribute('scope', 'row');
			paintLinkedText(element('strong', '', name), cells[0] ?? '', { link: context.link });
			columns.forEach((column, offset) => {
				const td = element('td', `sheetsmith-stat-block-action-${column.type ?? 'text'}`, tr);
				paintLinkedText(td, cells[offset + 1] ?? '', { link: context.link });
			});
			element('td', 'sheetsmith-stat-block-remove-cell', tr).setAttribute('aria-hidden', 'true');
		}
		drawAfter(into, read.after, context);
		return;
	}
	const showRefusal = recordRefusalNotice(controls, wrap);
	const refuse = (next: string): string | null => cellRefusal(next, host.zones);
	const rowWord = first === undefined ? 'Row' : columnLabel(first);
	all.forEach((cells, index) => {
		const tr = element('tr', '', body);
		// What the row is called aloud: its name as the sheet draws it, so an
		// aliased link is "Claws" and never its source (`parse/wikilink.ts`).
		const rowName = displayText(cells[0] ?? '').trim();
		const rowLabel = rowName === '' ? `${rowWord} ${index + 1}` : rowName;
		const write = (key: string, next: string): void => {
			host.commit({ zone: zone.key, table: { rows: { [index]: { [key]: next } } } });
		};
		/*
		 * **One control for every cell, the name included**: a one-row field that
		 * wraps, at one height, padding and weight. Its link reads live in play,
		 * where the row is text.
		 */
		const nameCell = element('td', 'sheetsmith-stat-block-action-name', tr);
		const nameInput = element('textarea', 'sheetsmith-record-input sheetsmith-stat-block-cell', nameCell);
		nameInput.rows = 1;
		nameInput.value = cells[0] ?? '';
		nameInput.setAttribute('aria-label', `${named} ${rowWord} ${index + 1}`);
		bindEditable(nameInput, {
			initial: cells[0] ?? '',
			announceCommit: (next) => {
				status.textContent = `${rowWord} ${displayText(next)}`;
			},
			refuse,
			onRefusal: showRefusal,
			onCommit: (next) => write(firstKey, next),
		});
		columns.forEach((column, offset) => {
			const td = element('td', `sheetsmith-stat-block-action-cell sheetsmith-stat-block-action-${column.type ?? 'text'}`, tr);
			const input = element('textarea', 'sheetsmith-record-input sheetsmith-stat-block-cell', td);
			input.rows = 1;
			const stored = cells[offset + 1] ?? '';
			/*
			 * **A number reads signed in its field as in its row**, `+6`; the sign
			 * is the drawing's, so a commit that only kept it writes nothing and one
			 * that changed the number writes it in the note's spelling.
			 */
			const signed = column.type === 'number';
			const shownValue = signed ? signedText(stored) : stored;
			input.value = shownValue;
			input.setAttribute('aria-label', `${rowLabel} ${columnLabel(column)}`);
			bindEditable(input, {
				initial: shownValue,
				step: signed,
				announceCommit: (next) => {
					status.textContent = `${rowLabel} ${columnLabel(column)} ${displayText(next)}`;
				},
				refuse,
				onRefusal: showRefusal,
				onCommit: (next) => write(column.key, signed && !/^\+/.test(stored) ? next.replace(/^\+/, '') : next),
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
			named: `Delete ${rowLabel}`,
			announce: (said) => {
				status.textContent = said;
			},
			commit: () => host.commit({ zone: zone.key, table: { removed: [index] } }),
			register: host.armed,
			doc: host.doc,
		});
	});
	// The Table's own add row, the box's foot.
	const add = element('button', 'sheetsmith-table-add-button sheetsmith-stat-block-add-action', wrap, `Add ${rowWord.toLowerCase()}`);
	add.type = 'button';
	add.addEventListener('click', () => {
		status.textContent = `${rowWord} added`;
		host.commit({ zone: zone.key, table: { added: [{ [firstKey]: firstKey }] } });
	});
	drawAfter(into, read.after, context);
}

/** Text after a table zone's table: kept, and drawn under it read-only. */
function drawAfter(into: HTMLElement, after: string, context: MarkdownContext): void {
	if (after === '') return;
	drawMarkdown(element('div', 'sheetsmith-stat-block-zone-markdown', into), after, context);
}

/**
 * A features zone. **In play each entry is its own markdown as the note has
 * it**, so the name reads in the note's emphasis and runs in, as a printed stat
 * block reads; the parsed name and usage are for editing. **Under Every form**
 * each entry is a line of name, usage and delete, its text under it.
 */
function drawFeaturesZone(into: HTMLElement, zone: BodyZone, read: Extract<ZoneRead, { type: 'features' }>, host: ZoneHost): void {
	const { host: controls, editing, named } = host;
	const { context, status } = controls;
	if (!editing) {
		if (read.lead !== '') drawMarkdown(element('div', 'sheetsmith-stat-block-entry sheetsmith-stat-block-entry-lead', into), read.lead, context);
		for (const entry of read.entries) {
			const block = element('div', 'sheetsmith-stat-block-entry', into);
			if (context.renderMarkdown !== undefined) drawMarkdown(block, entry.source, context);
			else drawEntryPlain(block, entry, context);
		}
		return;
	}
	const commit = (edit: Parameters<ZoneHost['commit']>[0]['features']): void =>
		host.commit({ zone: zone.key, features: edit ?? {} });
	const lead = element('div', 'sheetsmith-record-body sheetsmith-stat-block-body sheetsmith-stat-block-panel sheetsmith-stat-block-entry-lead', into);
	lead.id = `sheetsmith-stat-block-zone-${controls.id}-${host.record}-${zone.key}-lead`;
	drawRecordBody(
		lead,
		into,
		controls,
		{
			text: read.lead,
			error: null,
			named,
			label: `${named} ${zone.heading} text before the first entry`,
			placeholder: 'Text before the first entry',
			refuse: (next) => headingRefusal(next, host.zones, true) ?? entryRefusal(next, true),
			subheading: MINOR_HEADING,
		},
		(next) => commit({ lead: next }),
	);
	const list = element('div', 'sheetsmith-stat-block-entries', into);
	read.entries.forEach((entry, index) => {
		const item = element('div', 'sheetsmith-stat-block-entry sheetsmith-stat-block-entry-editing', list);
		const line = element('div', 'sheetsmith-stat-block-entry-line', item);
		const showRefusal = recordRefusalNotice(controls, item);
		const shownName = displayText(entry.name).trim();
		const entryName = shownName === '' ? `Entry ${index + 1}` : shownName;
		const name = element('textarea', 'sheetsmith-record-input sheetsmith-stat-block-cell sheetsmith-stat-block-entry-name', line);
		name.rows = 1;
		name.value = entry.name;
		name.setAttribute('aria-label', `${named} ${zone.heading} ${index + 1} name`);
		bindEditable(name, {
			initial: entry.name,
			announceCommit: (next) => {
				status.textContent = `${zone.heading} ${displayText(next)}`;
			},
			refuse: nameRefusal,
			onRefusal: showRefusal,
			onCommit: (next) => commit({ entry: index, name: next.trim() }),
		});
		const usage = element('input', 'sheetsmith-record-input sheetsmith-stat-block-cell sheetsmith-stat-block-entry-usage', line);
		usage.type = 'text';
		usage.value = entry.usage;
		// The field's name, not an example of a value: a faint *3/Day* beside an
		// entry with no usage read as that entry's usage (`docs/UI.md` §6).
		usage.placeholder = 'Usage';
		usage.spellcheck = false;
		usage.setAttribute('aria-label', `${entryName} usage`);
		bindEditable(usage, {
			initial: entry.usage,
			announceCommit: (next) => {
				status.textContent = next === '' ? `${entryName} usage cleared` : `${entryName} usage ${next}`;
			},
			refuse: usageRefusal,
			onRefusal: showRefusal,
			onCommit: (next) => commit({ entry: index, usage: next.trim() }),
		});
		const remove = element('button', 'sheetsmith-table-remove-button sheetsmith-stat-block-remove', line);
		remove.type = 'button';
		setIcon(remove, REMOVE_ICON);
		bindArmToConfirm({
			button: remove,
			row: item,
			armedClass: 'sheetsmith-table-remove-armed',
			rowClass: 'sheetsmith-table-row-arming',
			named: `Delete ${entryName}`,
			announce: (said) => {
				status.textContent = said;
			},
			commit: () => commit({ removed: index }),
			register: host.armed,
			doc: host.doc,
		});
		const text = element('div', 'sheetsmith-record-body sheetsmith-stat-block-body sheetsmith-stat-block-panel', item);
		text.id = `sheetsmith-stat-block-zone-${controls.id}-${host.record}-${zone.key}-${index}`;
		drawRecordBody(
			text,
			item,
			controls,
			{
				text: entry.text,
				error: null,
				named,
				label: `${entryName} text`,
				placeholder: 'Add text',
				refuse: (next) => headingRefusal(next, host.zones, true) ?? entryRefusal(next, false),
				subheading: MINOR_HEADING,
			},
			(next) => commit({ entry: index, text: next }),
		);
	});
	const add = element('button', 'sheetsmith-table-add-button sheetsmith-stat-block-add-entry', into, 'Add entry');
	add.type = 'button';
	add.addEventListener('click', () => {
		status.textContent = `${zone.heading} entry added`;
		commit({ added: true });
	});
}

/**
 * An entry where there is no app to render its markdown — a host that hands
 * over no renderer, which the harness's `renderer=none` stages: the parsed name
 * and usage bold and run in, then the text, so the fallback draws the entry a
 * reader sees rather than its `**` marks. The entry's own emphasis is lost
 * here, which the app's renderer keeps. The layout editor's canvas is no longer
 * this case: it renders (`docs/features/canvas-renders-markdown.md`).
 */
function drawEntryPlain(
	into: HTMLElement,
	entry: Extract<ZoneRead, { type: 'features' }>['entries'][number],
	context: MarkdownContext,
): void {
	const [first = '', ...more] = entry.text.split(/\r?\n[ \t]*\r?\n/);
	const lead = element('p', '', into);
	element('strong', '', lead, `${entry.usage === '' ? entry.name : `${entry.name} (${entry.usage})`}.`);
	if (first.trim() !== '') {
		lead.appendText(' ');
		paintLinkedText(element('span', '', lead), first, { link: context.link });
	}
	if (more.length > 0) paintRecordProse(element('div', '', into), more.join('\n\n'), context);
}

/**
 * Content no zone owns, under the heading exactly as the note writes it, with
 * *Not in this layout* beside it and one sentence saying where to fix it.
 * Read-only on both faces: content a player at the table cannot find is the
 * failure this draws against.
 */
export function drawDrift(
	into: HTMLElement,
	drift: ZoneDriftRead,
	context: MarkdownContext,
	/**
	 * Under Every form, where every zone around it is a field, drift is plain
	 * text with no box: a panel there is the clothes of something to type in,
	 * and nothing here is. In play, where nothing is a field, it keeps the
	 * text zones' box, so it reads as the content it is.
	 */
	editing = false,
): void {
	const wrap = element('section', 'sheetsmith-stat-block-section sheetsmith-stat-block-drift', into);
	const head = element('div', 'sheetsmith-stat-block-section-head', wrap);
	const heading = drift.heading ?? 'Before the first heading';
	element('h4', 'sheetsmith-component-label sheetsmith-stat-block-section-heading', head, heading);
	element('span', 'sheetsmith-stat-block-drift-tag', head, 'Not in this layout');
	if (drift.content.trim() !== '') {
		drawMarkdown(
			element('div', editing ? 'sheetsmith-stat-block-zone-markdown' : 'sheetsmith-stat-block-panel sheetsmith-stat-block-zone-markdown', wrap),
			drift.content.trim(),
			context,
		);
	}
	element('p', 'sheetsmith-stat-block-drift-note', wrap, driftSentence(drift));
}

/** The one sentence under a drift block, naming the route to fix it. */
function driftSentence(drift: ZoneDriftRead): string {
	if (drift.kind === 'second') {
		return `A second "${drift.heading ?? ''}" heading in this record. Only the first is read.`;
	}
	if (drift.kind === 'lead') {
		return 'No zone reads the text above the first heading. Edit it in markdown view, or move it under a zone\'s heading.';
	}
	return `Edit it in markdown view, or add a zone headed "${drift.heading ?? ''}" to the layout.`;
}
