/*
 * Table — repeatable typed records, whoever owns the rows (SPEC §4.2).
 *
 * The layout declares the rows every character has and the character fills in
 * cells: every character in a system has the same skills, and retyping them per
 * character would be absurd. With `openRows` the character adds rows of their
 * own below them, which is what inventory, attacks, spells and features need,
 * and what a Blades playbook needs on one list at once. Which is which is one
 * rule, `claimRows`, and everything else here follows from it.
 *
 * **It is not two components**, which is what §13's naming question needed
 * settling before the name could be. Openness is a boolean crossed with the rows
 * the layout already declares, so there was only ever one name to choose.
 *
 * **It was called "Skill card" until open rows shipped**, and the rename is worth
 * recording because the old name will be what people search for. The block covers
 * inventory, attacks, spells and features as readily as skills, so a name taken
 * from one of five jobs made the other four unfindable — nobody building an
 * inventory looks for a skill card. "Table" is what every sibling is named for:
 * what the thing is on the page, the way Pool and Track are, rather than a job in
 * some game. Stat group made the same move from "Abilities" (§12). What the name
 * does not carry — typed columns, per-row scope, totals — is what `configFields`
 * descriptions are for, exactly as Pool's name says nothing of its buffer.
 *
 * **A row is its position in the note's table, never the text of its first
 * cell.** A markdown table is an ordered list of lines and never promised that
 * cell was unique, so two items called "Dagger" are two rows. Position is safe
 * to use because nothing outside this component ever sees it: no formula can
 * name a row, and a total is what an open list publishes instead.
 *
 * This is the first component on the markdown storage path, because a cell
 * may hold a wikilink and Obsidian does not index links inside a code fence
 * (CLAUDE.md 2). Computed columns are never written to the note: they are
 * derived, and a stored copy of a derived value is a stale copy waiting to
 * happen.
 */

import { setIcon } from 'obsidian';
import { isName } from '../formula/expression';
import { MarkdownTable, readTable, writeTable } from '../parse/table';
import { displayText, hasLink, parseLinks } from '../parse/wikilink';
import {
	ColumnType,
	DEFAULT_COLUMN_TYPE,
	TOTALLED_TYPES,
} from './column-types';
import {
	ComponentConfig,
	ComponentDefinition,
	FieldValue,
	LinkContext,
	ReadResult,
	ScopeEntry,
	ScopeValues,
} from '../types';
import { bindEditable, UNRESOLVED_DELAY } from '../interaction/editable';
import {
	levelCount,
	levelName,
	levelOf,
	paintLevelRing,
	parseLevel,
} from './level-ring';
import { bindLongPress, showPopover } from '../ui/popover';
import { revealWhenTruncated } from '../ui/truncation';

export interface TableColumn {
	/** Header text in the note, and the name a formula reads the cell by. */
	key: string;
	/** Column heading on the sheet, when it should differ from the key. */
	name?: string;
	/**
	 * Leave the heading off the sheet. For the column whose control names
	 * itself — a proficiency ring, an equipped box — where the word is wider
	 * than the thing it labels. The heading is still there for assistive
	 * tech, so hiding it costs a screen reader nothing.
	 */
	hideHeading?: boolean;
	/** Defaults to text. */
	type?: ColumnType;
	/** For a computed column: the expression, evaluated in the row's scope. */
	formula?: string;
	/**
	 * Bounds for a number column, applied to typing and arrow steps alike.
	 * For a level column, `max` is its highest level; `min` is always 0,
	 * because "none" is a state every level column needs.
	 */
	min?: number;
	max?: number;
	/**
	 * Names for a level column's states, from none upwards: ["Untrained",
	 * "Proficient", "Expertise"]. Naming them sets how many there are, so
	 * `max` is only needed for a column whose levels have no names worth
	 * writing. A named level reads as itself on the sheet and to a screen
	 * reader, rather than as the number it happens to be stored as.
	 *
	 * A name may also say what its ring shows, after a colon: "Proficient:"
	 * for a fill carrying no letter, "Proficient:★" for a mark of the
	 * author's own. See level-ring.ts, which owns the rule.
	 */
	levels?: string[];
	/** How a level column is edited. Defaults to cycling on click. */
	input?: 'cycle' | 'select';
	/**
	 * Render a text column as a gloss on the row rather than as data beside
	 * it: a size down, tracked, and faint, the way an abbreviation sits under
	 * a stat card's name. For the column that qualifies the row — a skill's
	 * ability, an item's source — where equal weight has the eye reading two
	 * things per row when only one of them is what the row is. Opt-in, because
	 * muted user data otherwise reads as disabled.
	 */
	secondary?: boolean;
	/** Prefix a non-negative computed number with "+". Defaults to false. */
	signed?: boolean;
	/**
	 * Sum this column under the table and publish the sum as
	 * `<component id>.<column key>`, so a formula elsewhere can read it. The one
	 * thing an open list can publish, because an aggregate needs no row name —
	 * and it is what an encumbrance rule is made of.
	 */
	total?: boolean;
}

export interface TableRow {
	/**
	 * The row's name, and what it claims: the first note row spelling this,
	 * case-insensitively. See claimRows.
	 */
	label: string;
	/**
	 * Named expressions available to this row's computed columns. This is
	 * what lets one formula serve every row of a skill list: the column says
	 * `ability + Training * prof`, and the row says which ability it means.
	 */
	values?: Record<string, string>;
}

export interface TableConfig extends ComponentConfig {
	type: 'table';
	/** Heading of the column holding row names. Defaults to "Name". */
	rowHeader?: string;
	/**
	 * Where the name column is drawn among the others, 0 being first. A skill
	 * list puts its proficiency mark before the skill, the way it sits on
	 * paper. Display only: the name stays the note's first column, because the
	 * file has to say which row it is before it says anything else about it.
	 */
	namePosition?: number;
	rows?: TableRow[];
	columns?: TableColumn[];
	/**
	 * Let the character add rows of their own under the declared ones, and
	 * rename and delete the rows they added. What inventory, attacks, spells and
	 * features need, and what a Blades playbook needs on one list at once: the
	 * printed gear is declared, the invented gear is theirs, and both are the
	 * same list.
	 */
	openRows?: boolean;
	hideLabel?: boolean;
}

export interface TableRowData {
	/** The first cell's text, with the note's `\|` read back as `|`. */
	name: string;
	/** Stored cells, keyed by column key; read lowercases them as the note's
	 * headers arrive, and write matches the layout's spelling either way. */
	cells: Record<string, string>;
}

export interface TableData {
	/**
	 * Rows by their position in the note's table, 0 first. Read fills every
	 * position; an edit reports only the positions it touched, so a commit
	 * racing a rebuild cannot write back a stale sibling.
	 *
	 * **Position, not the row's name.** A markdown table is an ordered list of
	 * lines and never promised the first cell was unique: two items called
	 * "Dagger" are two rows, and keyed by name the second was unreachable and
	 * then overwritten by the first's next edit. Position is safe here because
	 * nothing outside this component ever sees it — no formula can name a row
	 * (SPEC §13) — so the renumbering that broke Roll20's macros cannot arise.
	 * An index is valid for the render it came from, and every write changes the
	 * file and is followed by a fresh read.
	 */
	rows: Record<number, Partial<TableRowData>>;
	/** Rows to append to the note, in order. */
	added?: TableRowData[];
	/** Positions to remove, as read. */
	removed?: readonly number[];
}

const DEFAULT_ROW_HEADER = 'Name';

/**
 * How long a corrected field stays tinted. Long enough to be caught by eyes
 * already moving on — the correction happens on blur, which is the moment the
 * user has decided they are done with the cell.
 */
const CORRECTION_FLASH = 1200;

/**
 * The delete control's mark, and the same mark armed or not.
 *
 * **A trash icon rather than a glyph**, which is the one place this card reaches
 * for Obsidian's icon set. The plugin's other three delete controls are trash
 * icons — in the layout editor, for removing a component, a column, a reset — and
 * the verb here is the same verb. An `×` was the first answer and reads as
 * dismiss, clear, or close: the wrong word for the only irreversible control a
 * component offers, and it asked the arming to carry a meaning the mark should
 * have carried at rest.
 *
 * Pool's row of `− ± +` argues the other way for itself and that argument does not
 * reach here: those three are one set read at a glance, where a Lucide icon among
 * them would be a different kind of mark. This control's neighbours are a level
 * ring and its cells, no set at all.
 *
 * **The mark does not change when armed**, and that part of the original argument
 * still holds: the column is as narrow as its content, so a control that
 * relabelled or redrew itself in place would widen the column and move the table
 * under the finger already resting on it — the mistake Pool's amount panel was
 * reversed over. Arming shows as a tint on the control and on its row, and names
 * the row in the accessible name, the tooltip and the announcement.
 */
const REMOVE_ICON = 'trash';

/**
 * Where a total stops being exact. Sums are floating point, so a column of
 * tenths would otherwise read 0.30000000000000004; past six decimals is not a
 * weight anyone typed.
 */
const TOTAL_PRECISION = 1e6;

/**
 * What a row with no name is called, wherever something has to name one.
 *
 * Open rows make a nameless row ordinary rather than exceptional: the add
 * control writes one deliberately, for the user to fill in. It needs one name in
 * every place, and had three — a cell announced " Qty", with a leading space and
 * no row in it at all, while the delete control said "this row" and a total said
 * "A row with no name". A reader hearing the cell and the control has to be able
 * to tell they are the same row.
 */
const UNNAMED_ROW = 'Unnamed row';

/** Values a toggle cell is stored as, and what the note reads like. */
const TOGGLE_TRUE = 'yes';
const TOGGLE_FALSE = 'no';
const TRUTHY = new Set(['yes', 'true', 'x', '✓', '✔', '1']);

/**
 * What a row is called, for anything that has to say which row it means.
 *
 * As a reader sees it, never as the file spells it. A cell may hold a wikilink,
 * and the three things that name a row — a cell's accessible name, the delete
 * control's, and the row a total could not read — were saying
 * "[[Sunblade|sword]]" for a row the sheet displays as "sword". For a screen
 * reader that is the file's syntax read aloud, and on the delete control it is
 * the whole of the arm-then-commit argument undone: the accessible name is the
 * only naming there is, and it named nothing a listener could recognise.
 */
function rowLabel(label: string): string {
	const named = displayText(label).trim();
	return named === '' ? UNNAMED_ROW : named;
}

function columnType(column: TableColumn): ColumnType {
	return column.type ?? DEFAULT_COLUMN_TYPE;
}

/** Columns whose values live in the note. Computed ones are never stored. */
function storedColumns(config: TableConfig): TableColumn[] {
	return (config.columns ?? []).filter(
		(column) => columnType(column) !== 'computed',
	);
}

/** The note's header row: the row-name column, then every stored column. */
function headers(config: TableConfig): string[] {
	return [
		(config.rowHeader ?? '').trim() || DEFAULT_ROW_HEADER,
		...storedColumns(config).map((column) => column.key),
	];
}

/**
 * What a stored cell means to a formula.
 *
 * A blank in a column the layout declared numeric is zero, not a missing
 * name. Untrained skills are left blank on every character sheet ever
 * printed, and a sheet that made you type 0 into eighteen rows before it
 * would compute anything would be answering a question nobody asked.
 */
function cellValue(column: TableColumn, raw: string | undefined): FieldValue {
	const text = (raw ?? '').trim();
	switch (columnType(column)) {
		case 'toggle':
			return TRUTHY.has(text.toLowerCase());
		case 'level':
			return levelOf(column, text);
		case 'number': {
			if (text === '') return 0;
			const numeric = Number(text);
			return Number.isNaN(numeric) ? text : numeric;
		}
		default:
			return text;
	}
}

/**
 * Hold a typed number to the column's bounds. Text that is not a number is
 * left alone: the arrows already treat it as prose, and silently replacing
 * what someone typed with a number they did not is worse than storing it.
 */
function bound(raw: string, column: TableColumn): string {
	const text = raw.trim();
	if (text === '') return text;
	const value = Number(text);
	if (!Number.isFinite(value)) return text;
	let next = value;
	if (column.min !== undefined) next = Math.max(column.min, next);
	if (column.max !== undefined) next = Math.min(column.max, next);
	return next === value ? text : String(next);
}

/** Format a computed cell: "?" when unresolved, signed when asked for. */
function formatComputed(value: FieldValue | null, signed: boolean): string {
	if (value === null) return '?';
	if (typeof value === 'number' && signed && value >= 0) return `+${value}`;
	if (typeof value === 'boolean') return value ? '✓' : '—';
	return String(value);
}

/** Where each declared row sits in the note, and which rows are the character's. */
interface RowClaims {
	/**
	 * Note row index per declared row, in declared order; null where the note
	 * holds no row by that name yet.
	 */
	declared: (number | null)[];
	/** Note rows no declared row claimed, in note order: the character's own. */
	own: number[];
}

/**
 * **A declared row claims the first note row spelling its name, scanning top to
 * bottom, case-insensitively. Every unclaimed note row belongs to the
 * character.**
 *
 * One rule, and it settles the whole card: a 5e skill list claims every row and
 * behaves exactly as it did; an attack table declares nothing and every row is
 * the character's; a Blades load list has its printed gear declared above the
 * blank lines a player fills. It also disposes of the per-row flags a tool
 * carrying this feature needs — the claim *is* "who owns this row", so
 * "may not be deleted" is "claimed" and nothing has to be stored.
 *
 * Case-insensitive matching is safe here for the reason it was not safe in the
 * tool that shipped it: no formula names a row, so what a row's capitalisation
 * can change is which declared row claims it, never what any arithmetic
 * resolves. The note keeps its own spelling either way.
 *
 * One helper because `render` and `write` must agree. A delete control drawn
 * over a row the writer would refuse to delete is worse than no control at all.
 */
function claimRows(config: TableConfig, names: readonly string[]): RowClaims {
	const claimed = new Set<number>();
	const declared = (config.rows ?? []).map((row) => {
		const label = (row.label ?? '').trim().toLowerCase();
		const at = names.findIndex(
			(name, index) =>
				!claimed.has(index) && name.trim().toLowerCase() === label,
		);
		if (at === -1) return null;
		claimed.add(at);
		return at;
	});
	const own: number[] = [];
	names.forEach((_, index) => {
		if (!claimed.has(index)) own.push(index);
	});
	return { declared, own };
}

/** One row as the card draws it, whoever owns it. */
interface RowView {
	/** What the name cell reads. */
	label: string;
	/** The declared row this came from, where the layout declared one. */
	row?: TableRow;
	/** Its position in the config's `rows`, for the row's own expressions. */
	declared: number | null;
	/** Its position in the note's table, or null where the note has no row. */
	at: number | null;
	/** Whether the character owns the row: theirs to rename and to delete. */
	owned: boolean;
}

/**
 * Row names by note position. Read fills every position, so the gaps this pads
 * out only arise from a delta on its way back in.
 */
function rowNames(data: TableData | null): string[] {
	const rows = data?.rows ?? {};
	const positions = Object.keys(rows).map(Number);
	const count = positions.length === 0 ? 0 : Math.max(...positions) + 1;
	const names: string[] = [];
	for (let index = 0; index < count; index++) {
		names.push(rows[index]?.name ?? '');
	}
	return names;
}

/**
 * Every row the card draws: the declared ones first, in declared order, then
 * the character's own in note order.
 *
 * Declared order is the author's design — a playbook's printed gear is in
 * playbook order — and must not be reshuffled by whatever order a character's
 * file happens to hold. Character rows have no declared order, so the file's
 * order is theirs, and a new row appends at the end: insertion order, which is
 * the one ordering mode nobody has ever filed a bug against.
 *
 * Shared by `render` and by the totals, so the number under a column always
 * counts the rows above it.
 */
function rowViews(config: TableConfig, data: TableData | null): RowView[] {
	const names = rowNames(data);
	const claims = claimRows(config, names);
	const views: RowView[] = (config.rows ?? []).map((row, index) => ({
		label: row.label,
		row,
		declared: index,
		at: claims.declared[index] ?? null,
		owned: false,
	}));
	// A fixed card draws none of the character's own: a row the layout does not
	// declare stays in the note, unrendered and untouched (SPEC §10).
	if (config.openRows === true) {
		for (const at of claims.own) {
			views.push({ label: names[at] ?? '', declared: null, at, owned: true });
		}
	}
	return views;
}

/** A column's total, or the row that stopped it being one. */
type ColumnTotal = { sum: number } | { unreadable: string };

/**
 * One row as a total sees it: what it is called, and what its cells hold.
 *
 * A reader rather than the cells themselves, because the two callers read from
 * different places. `scopeValues` has only the note. `render` layers the row's
 * drafts over it, so a total moves while the cell that changed it is still being
 * typed — which is the same reader the row's computed columns already use.
 */
interface TotalRow {
	label: string;
	cell(column: TableColumn): string | undefined;
}

/**
 * The sum of a column's own values: a number cell's number, a level cell's
 * level, a toggle's 1 or 0.
 *
 * One rule, and it is the mapping that already feeds a cell to a formula, so
 * "how many are equipped" and "what does this weigh" are the same arithmetic. A
 * blank number cell is 0, which is §4.2's existing rule and the reason an
 * untrained skill still totals.
 *
 * Where a cell holds text in a column that wanted a number there is no sum:
 * reporting the row beats adding up the rest, because a quietly wrong number is
 * worse than a missing one (SPEC §5).
 */
function columnTotal(
	column: TableColumn,
	rows: readonly TotalRow[],
): ColumnTotal {
	let sum = 0;
	for (const view of rows) {
		const value = cellValue(column, view.cell(column));
		if (typeof value === 'boolean') {
			sum += value ? 1 : 0;
		} else if (typeof value === 'number') {
			sum += value;
		} else {
			return { unreadable: rowLabel(view.label) };
		}
	}
	return { sum: Math.round(sum * TOTAL_PRECISION) / TOTAL_PRECISION };
}

/** The rows a total counts, reading what the note holds and nothing else. */
function storedRows(
	config: TableConfig,
	data: TableData | null,
): TotalRow[] {
	return rowViews(config, data).map((view) => ({
		label: view.label,
		cell: (column) =>
			view.at === null
				? undefined
				: data?.rows[view.at]?.cells?.[column.key.toLowerCase()],
	}));
}

/**
 * Draw a cell's text, with any wikilink in it as a link.
 *
 * The anchor is Obsidian's own markup — `internal-link`, `is-unresolved`, and
 * both `href` and `data-href` — so it takes the user's theme and whatever a
 * theme or another plugin does to links, rather than a colour of this plugin's
 * (UI.md §1). Nothing app-shaped is needed to draw it; `context` is what makes it
 * resolve, open and preview, and without one the link paints and a press does
 * nothing, which is the truth when there is no vault behind it.
 *
 * Private to this component. Rich text is the obvious second consumer and is not
 * built, and PATTERNS §1 says a painter moves out on the second consumer rather
 * than in anticipation of one.
 */
function paintText(
	into: HTMLElement,
	text: string,
	context: LinkContext | undefined,
): void {
	const doc = into.ownerDocument;
	into.replaceChildren();
	const segments = parseLinks(text);
	// Whether the whole cell is one link, which decides who does the clipping —
	// see the styles. Marked rather than left to `a:only-child`, which counts
	// element children only: a cell of prose *and* one link matched it, the anchor
	// became a block, and "in Bag of Holding" broke onto two lines.
	into.classList.toggle(
		'sheetsmith-table-link-only',
		segments.length === 1 && segments[0]?.kind === 'link',
	);
	for (const segment of segments) {
		if (segment.kind === 'text') {
			into.appendChild(doc.createTextNode(segment.text));
			continue;
		}
		const { target, display } = segment;
		const anchor = doc.createElement('a');
		anchor.classList.add('internal-link');
		// An inventory of things that have no notes yet is the ordinary case, and
		// painting them as live links would be a lie the theme already has a
		// colour for. Absent a context every link paints as resolved: a missing
		// vault is not evidence that a note is missing.
		if (context !== undefined && !context.resolves(target)) {
			anchor.classList.add('is-unresolved');
		}
		// Both, because that is what Obsidian's own markup carries and what
		// anything styling or intercepting links looks for.
		anchor.setAttribute('href', target);
		anchor.setAttribute('data-href', target);
		anchor.textContent = display;
		// An aliased link shows the alias, so the target is otherwise nowhere on
		// the card. Only where the two differ: a tooltip repeating text that is
		// already legible is noise fired at every pass, which is the lesson the
		// stat card's label learned.
		//
		// **`title`, not `aria-label`**, and that is a correction rather than a
		// preference. `aria-label` is what Obsidian's own aliased links carry, and
		// what its tooltip reads, but it *replaces* the name computed from the
		// element's contents: a link reading "sword" announced as "Sunblade" is a
		// name that appears nowhere in the cell, which fails WCAG 2.5.3 (label in
		// name, level A) and leaves voice control with nothing to match when the
		// user says "click sword". `title` is supplementary instead — the name
		// stays "sword" and the target is announced after it as the description, so
		// a listener gets both. The cost is the browser's tooltip rather than the
		// app's styled one, which is also what every other tooltip on this sheet
		// uses: the level ring's name, a computed cell's formula, a clipped value.
		if (display !== target) anchor.setAttribute('title', target);
		anchor.addEventListener('click', (event) => {
			// The press belongs to the link, not to the cell behind it: PATTERNS §6
			// has this rule, that a real control owns its own presses.
			event.preventDefault();
			event.stopPropagation();
			context?.open(target, event);
		});
		// The Page preview plugin owns the popover and owns whether the user
		// asked for one at all, so this only offers the anchor to it.
		anchor.addEventListener('mouseover', (event) => {
			context?.preview(target, anchor, event);
		});
		// Where the whole cell is one link the anchor is what clips, so it is the
		// box whose overflow can be measured — the layer around it no longer
		// reports any. Skipped for an aliased link, which already carries the app's
		// own tooltip naming its target: two tooltips on one anchor is worse than
		// either, and the alias's remainder is a cell focus away.
		if (display === target) revealWhenTruncated(anchor);
		into.appendChild(anchor);
	}
}

/**
 * Configuration errors that make the table unreadable rather than merely
 * empty. Reported on this component alone, per SPEC §10.
 */
function configError(config: TableConfig): string | null {
	const columns = config.columns ?? [];
	const seen = new Set<string>();
	for (const column of columns) {
		const key = (column.key ?? '').trim();
		if (key === '') return 'Every column needs a key.';
		if (/[|\r\n]/.test(key)) {
			return `The column "${key}" cannot contain a pipe or a line break, because a pipe separates one cell from the next.`;
		}
		if (seen.has(key.toLowerCase())) {
			return `Two columns are both called "${key}".`;
		}
		seen.add(key.toLowerCase());
		if (column.levels !== undefined && column.levels.length < 2) {
			// The first name is what "none" is called, so a single name
			// describes a column with no level to reach.
			return `The column "${key}" needs at least two level names, starting with the one for none.`;
		}
		if (column.total === true && !isName(key)) {
			// A total is published as `<id>.<key>` (SPEC §5), so a totalled key has
			// to be a name a formula can read. A key is otherwise free to be
			// whatever the note reads well as — "Load cost" is a good column
			// heading and a bad name, and `inventory.Load cost` tokenises as
			// `inventory.Load` followed by a stray `cost`, so the total renders on
			// the card under a name nothing can write.
			//
			// Refused rather than rewritten, where §5 rewrites a hyphenated
			// component id: the id's rewrite is safe because the editor shows the
			// author what their component is called now, and there is nowhere here
			// that could tell them what their column became.
			return `The column "${key}" cannot show a total, because "${config.id}.${key}" is not a name a formula can read. Rename the column using letters, digits and underscores, or turn the total off.`;
		}
		if (column.total === true && !TOTALLED_TYPES.has(columnType(column))) {
			// A total is a published name (SPEC §5), so it has to come from
			// stored data alone. A text column has nothing to add up, and a
			// computed column cannot publish a value yet — §13's question. Both
			// are stated rather than rendered as a number the sheet then refuses
			// to read: one name meaning "publishable, sometimes" is worse than a
			// refusal that says why.
			return columnType(column) === 'computed'
				? `The column "${key}" cannot show a total yet, because a total is a value the rest of the sheet can read and a computed column cannot publish one. Total a stored column instead, or turn the total off.`
				: `The column "${key}" cannot show a total, because a text column has nothing to add up. Make it a number column, or turn the total off.`;
		}
		if (column.levels?.some((entry) => parseLevel(entry).name === '')) {
			// A level with only a glyph has nothing to be called: the name is
			// what a screen reader is given and what a dropdown lists, and a
			// mark on the ring stands for it rather than replacing it.
			return `The column "${key}" has a level with a mark but no name.`;
		}
	}
	const rowHeader = ((config.rowHeader ?? '').trim() || DEFAULT_ROW_HEADER)
		.toLowerCase();
	if (seen.has(rowHeader)) {
		return `A column is called "${config.rowHeader ?? DEFAULT_ROW_HEADER}", which is already the name column's heading.`;
	}
	const labels = new Set<string>();
	for (const row of config.rows ?? []) {
		const label = (row.label ?? '').trim();
		if (label === '') return 'Every row needs a name.';
		if (/[|\r\n]/.test(label)) {
			return `The row "${label}" cannot contain a pipe or a line break.`;
		}
		if (labels.has(label)) return `Two rows are both called "${label}".`;
		labels.add(label);
	}
	return null;
}

export const table: ComponentDefinition<TableConfig, TableData> = {
	type: 'table',
	storage: 'markdown',
	// `*` stands for one path segment: every column's formula, and every
	// named expression on every row. See isDeclared in formula/resolve.ts.
	formulaFields: ['columns.*.formula', 'rows.*.values.*'],
	configFields: [
		{
			key: 'rows',
			kind: 'rows',
			label: 'Rows',
			description:
				'The rows every character using this layout has. Each row may define named expressions its computed columns can read, e.g. "ability" as abilities.DEX, so one column formula serves the whole list.',
		},
		{
			key: 'columns',
			kind: 'columns',
			label: 'Columns',
			description:
				'Text, number, and toggle columns hold character data. A computed column is read-only and reads the row\'s other cells by column key, its row values by name, and anything else on the sheet by component id.',
		},
		{
			key: 'openRows',
			kind: 'boolean',
			label: 'Characters may add rows',
			description:
				'Adds a row control under the table. Rows a character adds are theirs to rename and delete, and no formula can name them — total a column instead. Rows declared above stay read-only and cannot be deleted from a character.',
			default: false,
		},
		{
			key: 'rowHeader',
			kind: 'text',
			label: 'Name column heading',
			description:
				'Heading of the column holding the row names, e.g. "Skill". Defaults to "Name".',
		},
		{
			key: 'namePosition',
			kind: 'number',
			label: 'Name column position',
			description:
				'Where the name column is drawn among the others, 0 being first. Set it to 1 to put a proficiency mark before the skill, the way it sits on paper. The note always keeps the name as its first column.',
		},
		{
			key: 'hideLabel',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Hide label',
			description: 'Hide the component name above the table.',
			default: false,
		},
	],

	read(body, config): ReadResult<TableData> {
		const error = configError(config);
		if (error !== null) return { ok: false, error };
		const parsed = readTable(body);
		if (!parsed.ok) return parsed;
		// No table yet: editable empty rows, not an error.
		if (parsed.table === null) return { ok: true, data: null };

		const { headers: found, rows } = parsed.table;
		const data: TableData = { rows: Object.create(null) as TableData['rows'] };
		rows.forEach((cells, index) => {
			// Keyed by text out of the note, so it may not inherit from
			// Object.prototype: on a plain object a column called "constructor"
			// reads back as an inherited function, and the cell lookup in render
			// answers with a method instead of the value. The note keeps the data
			// either way, so the sheet would show a blank over a filled cell and
			// the first edit would overwrite it — the one failure this component
			// exists to prevent.
			const values: Record<string, string> = Object.create(null) as Record<
				string,
				string
			>;
			found.forEach((header, at) => {
				if (at === 0) return;
				values[header.toLowerCase()] = cells[at] ?? '';
			});
			// A row with a blank name cell is an ordinary row: the name is no
			// longer identity, and dropping it made a line the file still held
			// invisible on the sheet, with the next edit written over the top.
			data.rows[index] = { name: cells[0] ?? '', cells: values };
		});
		return { ok: true, data };
	},

	/**
	 * What the card publishes to the rest of the sheet: one total per column
	 * asking for one, as `<id>.<key>`.
	 *
	 * **A character-added row publishes nothing**, and that is a finding about
	 * the contract rather than about this component: `<id>.<name>` is a
	 * fixed-row mechanism. A name a formula can write has to be stable and has
	 * to be knowable when the formula is written, and a row the character typed
	 * is neither. §13's question about how a *declared* row publishes stays
	 * open; this fixes its bound.
	 *
	 * A total is the one thing an open list can publish, because an aggregate
	 * needs no row name — and it needs no change to the contract either.
	 * `scopeValues` is handed no resolver, so a row's published value (a
	 * computed column evaluated in a scope that itself holds formulas) is
	 * exactly what §13 is about. A sum over a *stored* column is a number
	 * derived from data alone, so `ScopeEntry.value` carries it as it stands.
	 */
	scopeValues(data, config): ScopeValues {
		// A misconfigured card renders an error and publishes nothing, so a
		// formula reading it fails and says so rather than reading a total the
		// card is refusing to show.
		if (configError(config) !== null) return {};
		const rows = storedRows(config, data);
		const named: Record<string, ScopeEntry> = {};
		for (const column of config.columns ?? []) {
			if (column.total !== true || !TOTALLED_TYPES.has(columnType(column))) continue;
			const total = columnTotal(column, rows);
			// A total that could not be read publishes nothing rather than the
			// sum of the rows it could read (SPEC §5). The cell says which row
			// stopped it.
			if ('unreadable' in total) continue;
			named[column.key] = { value: total.sum };
		}
		return Object.keys(named).length === 0 ? {} : { named };
	},

	write(data, body, config): string {
		const nameHeader = headers(config)[0] as string;
		const known = new Map(
			storedColumns(config).map((column) => [column.key.toLowerCase(), column.key]),
		);
		/** One row's cells as the table writer takes them, under the layout's
		 * own header spelling so the match is exact. */
		const cellsFor = (row: Partial<TableRowData>): Map<string, string> => {
			const update = new Map<string, string>();
			if (row.name !== undefined) update.set(nameHeader, row.name);
			for (const [key, value] of Object.entries(row.cells ?? {})) {
				// Cells arrive keyed the way read hands them out; map them back
				// to the layout's own spelling so the header match is exact.
				const header = known.get(key.toLowerCase());
				if (header !== undefined) update.set(header, value);
			}
			return update;
		};

		/**
		 * **A section this component cannot read is one it must not write.**
		 *
		 * Both halves of the addressing come out of the read: an index means the
		 * row at that position in *this* body, and the claim decides which rows
		 * the character may rename or delete at all. Without a table every guard
		 * below is disarmed and the write lands on whichever table comes first, by
		 * counting — a deletion included, which is the one thing here that cannot
		 * be taken back (CLAUDE.md 4).
		 *
		 * Under the old name addressing this path was defensible, and the comment
		 * that used to sit further down said so: a write touched only a row of the
		 * name it was handed, so an unreadable section cost a missed edit rather
		 * than a wrong one. Position addressing took that away, and the comment
		 * outlived the reasoning it recorded.
		 *
		 * The refusal reports itself rather than passing silently: `read` fails on
		 * this same body, so the card is showing "Section has more than one table."
		 * instead of the controls this data could have come from.
		 */
		let table: MarkdownTable | null = null;
		if (body !== null) {
			const parsed = readTable(body);
			if (!parsed.ok) return body;
			table = parsed.table;
		}
		// The claim is recomputed from the body being written rather than trusted
		// from the render the edit came from: this side is the file boundary, and
		// a rename or a deletion has to be judged against what the note says now.
		const claims = claimRows(
			config,
			(table?.rows ?? []).map((cells) => cells[0] ?? ''),
		);
		const claimedAt = new Map<string, number>();
		const claimedRows = new Set<number>();
		(config.rows ?? []).forEach((row, index) => {
			const at = claims.declared[index];
			if (at === null || at === undefined) return;
			claimedAt.set((row.label ?? '').trim().toLowerCase(), at);
			claimedRows.add(at);
		});

		const rows = new Map<number, Map<string, string>>();
		const put = (index: number, update: Map<string, string>): void => {
			const already = rows.get(index);
			if (already === undefined) rows.set(index, update);
			else for (const [header, value] of update) already.set(header, value);
		};
		for (const [key, row] of Object.entries(data.rows ?? {})) {
			const index = Number(key);
			const update = cellsFor(row);
			// A claimed row's name comes from the layout, so a rename reported
			// for one is dropped rather than written. That is also what keeps a
			// case-differing row's own spelling: the note said "acrobatics" and
			// goes on saying it (CLAUDE.md 4).
			if (claimedRows.has(index)) update.delete(nameHeader);
			if (update.size > 0) put(index, update);
		}

		const added: Map<string, string>[] = [];
		for (const row of data.added ?? []) {
			const label = (row.name ?? '').trim().toLowerCase();
			const at = label === '' ? undefined : claimedAt.get(label);
			// A declared row the note has never held has no position, so its
			// first edit arrives as an append. Where the note has since gained
			// it — a second commit landing before the sheet re-read the file —
			// the cells fill the row that is there rather than appending a twin.
			if (at !== undefined) {
				const update = cellsFor(row);
				update.delete(nameHeader);
				put(at, update);
				continue;
			}
			added.push(cellsFor(row));
		}

		// A removal landing on a claimed row is dropped, so a stale index cannot
		// delete a row the layout declares through the back door. Enforced here
		// because this is the file boundary; the control is absent on the card
		// for the same reason (CLAUDE.md 4).
		const removed = (data.removed ?? []).filter(
			(index) => !claimedRows.has(index),
		);

		// The section has no table yet, so there is nothing to clobber: seed
		// every row the layout declares, and the note reads as the whole list
		// from the first edit rather than growing a row at a time.
		if (table === null) {
			const spare = [...added];
			const seeded = (config.rows ?? []).map((row) => {
				const label = (row.label ?? '').trim();
				const found = spare.findIndex(
					(update) =>
						(update.get(nameHeader) ?? '').trim().toLowerCase() ===
						label.toLowerCase(),
				);
				const update =
					found === -1
						? new Map<string, string>()
						: (spare.splice(found, 1)[0] as Map<string, string>);
				update.set(nameHeader, label);
				return update;
			});
			return writeTable(body, headers(config), { added: [...seeded, ...spare] });
		}
		return writeTable(body, headers(config), { rows, added, removed });
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
			if (className !== '') el.classList.add(className);
			if (text !== undefined) el.textContent = text;
			parent.appendChild(el);
			return el;
		};

		const error = configError(config);
		if (error !== null) {
			// A misconfigured component reports on itself; SPEC §10 keeps the
			// rest of the sheet rendering and editable.
			element('div', 'sheetsmith-error', container, error);
			return;
		}

		if (config.hideLabel !== true) {
			element('div', 'sheetsmith-table-label', container, config.label);
		}

		const columns = config.columns ?? [];
		const open = config.openRows === true;
		const nameHeading = (config.rowHeader ?? '').trim() || DEFAULT_ROW_HEADER;
		// The table scrolls inside its own box: a sheet must never scroll
		// sideways because one component grew a column.
		const wrapper = element('div', 'sheetsmith-table-wrapper', container);
		const grid = element('table', 'sheetsmith-table', wrapper);

		// Where the name column sits among the others. A skill list wants its
		// proficiency mark before the skill, the way it sits on paper, and that
		// is a display order only: the note keeps the name in its first cell,
		// because a line has to say which row it is before anything else (§10).
		const namePosition = Math.max(
			0,
			Math.min(columns.length, Math.floor(config.namePosition ?? 0)),
		);
		/** Column indices in display order, with null standing for the name. */
		const order: (number | null)[] = [];
		for (let i = 0; i <= columns.length; i++) {
			if (i === namePosition) order.push(null);
			if (i < columns.length) order.push(i);
		}

		const head = element('tr', '', element('thead', '', grid));
		for (const entry of order) {
			if (entry === null) {
				element('th', 'sheetsmith-table-name', head, nameHeading);
				continue;
			}
			const column = columns[entry] as TableColumn;
			const heading = column.name ?? column.key;
			const cell = element('th', '', head);
			cell.classList.add(`sheetsmith-table-${columnType(column)}`);
			// The cell itself always stays in flow — the hidden text goes in a
			// span, because sr-only positions absolutely and a th taken out of
			// flow would take its column's structure with it.
			if (column.hideHeading === true) {
				element('span', 'sheetsmith-sr-only', cell, heading);
			} else {
				cell.textContent = heading;
			}
		}
		if (open) {
			// The delete column's heading is for assistive tech only: the table
			// stays rectangular, and the column keeps a name where a name is all
			// there is. Same span `hideHeading` uses, and for the same reason —
			// sr-only positions absolutely, and a th out of flow would take its
			// column's structure with it.
			const cell = element('th', 'sheetsmith-table-remove', head);
			element('span', 'sheetsmith-sr-only', cell, 'Remove');
		}

		/** Every column the table draws, the name and the delete glyph included. */
		const width = columns.length + 1 + (open ? 1 : 0);

		// Declared rows, then the character's own. The same list the totals
		// count, so the number under a column always counts the rows above it.
		const views = rowViews(config, data);

		// Announces once per commit. Built before the rows so it is in the
		// document by the time any of them speaks; a live region has to be
		// attached before its text changes or the message is never queued.
		const status = element('div', 'sheetsmith-sr-only', container);
		status.setAttribute('aria-live', 'polite');

		const body = element('tbody', '', grid);
		if (views.length === 0) {
			const empty = element(
				'td',
				'sheetsmith-table-empty',
				element('tr', '', body),
				// On an open card the old message is precisely wrong: rows come
				// from this note, and the control to add one is right below.
				open
					? 'No rows yet.'
					: 'No rows yet. Rows come from the layout, not this note — add them to this component in the layout.',
			);
			empty.colSpan = width;
			if (!open) return;
		}

		/**
		 * Which delete control is armed, as the function that disarms it. One
		 * per card rather than per row, because arming a second control has to
		 * stand the first one down.
		 */
		let armedRow: (() => void) | null = null;

		/**
		 * The rows the totals count, each reading its own drafts over the note.
		 * Filled as the rows render, in the order they render, so the number
		 * under a column always counts the rows above it.
		 */
		const counted: TotalRow[] = [];

		/**
		 * Repaint the totals row from the drafts.
		 *
		 * A card-level closure, and assigned rather than declared, because a
		 * total crosses rows: one cell changing moves a number that belongs to
		 * every row, and the row that changed cannot own it. The same shape as a
		 * level ring's `repaint` — the tfoot is built after the rows, so the
		 * rows close over this and the real one lands later.
		 */
		let paintTotals = (_settled: boolean) => undefined as void;

		/**
		 * A cell's field, over a display layer where its text holds a wikilink.
		 *
		 * **Two elements in one grid area, not a swap.** The field stays in the DOM
		 * and in the tab order in both states, which is what keeps the view's focus
		 * restoration counting the same controls before and after a rebuild — a
		 * field that came and went would renumber every control after it. Neither
		 * child changes size on focus either, so focusing a cell reflows nothing
		 * under a pointer already resting on it.
		 *
		 * Unfocused, the layer is opaque over a field whose own text is
		 * transparent; focused, the layer fades out and the raw
		 * `[[Sunblade|sword]]` is what is being edited. That is a note reading one
		 * way in reading mode and another in source mode, in one cell.
		 *
		 * **A cell with no link gets none of this** — no wrapper, no layer, the
		 * same DOM an eighteen-row skills card has always had. `prose` is what says
		 * a cell may hold one at all: a number, a level or a toggle is the row's
		 * arithmetic rather than text somebody wrote.
		 *
		 * **The layer is painted once and never repainted from a commit**, and that
		 * is a reversal worth recording. Repainting looked like PATTERNS §5's
		 * optimistic paint and is not: §5's reason is that a write producing an
		 * identical file does not rebuild the view, and a commit here only fires
		 * when the value changed, so the rebuild always comes. What repainting did
		 * buy was a few milliseconds of fresher text; what it cost was the row.
		 * Tab out of a link cell and the browser moves focus to the anchor — the
		 * next stop inside the same cell — which blurs the field, which commits,
		 * which replaced the layer's children and destroyed the anchor the browser
		 * had just focused. `activeElement` fell to the body, so the view captured
		 * no focus and restored none, and the user was dropped out of the row
		 * mid-edit. The rebuild repaints it, and `a[href]` is in the view's
		 * focusable list so the anchor is captured and restored.
		 */
		const textField = (
			cell: HTMLElement,
			raw: string,
			prose: boolean,
		): HTMLInputElement => {
			if (!prose || !hasLink(raw)) {
				return element('input', 'sheetsmith-table-input', cell);
			}
			const stack = element('div', 'sheetsmith-table-linked', cell);
			const input = element('input', 'sheetsmith-table-input', stack);
			const layer = element('div', 'sheetsmith-table-link-layer', stack);
			paintText(layer, raw, context.link);
			// A name column is as narrow as the table lets it be, so a link is the
			// text on this card most likely to clip — and a clipped one had no route
			// to the rest of itself, since the layer is what is on screen and the
			// field under it is only reachable by focusing the cell. Bound once: the
			// helper reads the layer's own text, so a repaint needs no rebinding.
			revealWhenTruncated(layer);
			return input;
		};

		/**
		 * The trailing cell holding a character row's delete control.
		 *
		 * **Deleting takes two presses.** The first arms the control and names
		 * the row it would take; the second commits.
		 *
		 * The rule it follows is §12's, from the Pool's typed-amount reversal:
		 * where a control's input is not its outcome, the outcome has to be on
		 * screen before it is applied. Deletion is the only irreversible thing a
		 * component offers, so it is the strongest case of that rule there is.
		 *
		 * And the shared confirmation is not available to reach for. `ConfirmModal`
		 * takes an `App` and `RenderContext` carries no route to one — a component
		 * is handed its data, a resolver, a change callback and, now, the vault
		 * side of a link, and nothing that can open a modal. This comment used to
		 * say a component "may not import `obsidian`", which stopped being true the
		 * moment this file took `setIcon`: the conclusion held and the reason had
		 * rotted, which is the worse way for a recorded decision to age — a reader
		 * who spots it concludes the two-step was never justified.
		 *
		 * It also makes the focus behaviour safe. After a delete, focus restores
		 * by control index, which may land on another row's delete glyph, and an
		 * armed-then-commit control cannot fire on that landing.
		 */
		const renderRemove = (tr: HTMLElement, rowView: RowView): void => {
			const cell = element('td', 'sheetsmith-table-remove', tr);
			// A claimed row carries no control at all rather than a disabled one.
			// Its absence is what says the layout owns the row, and eighteen
			// disabled buttons down a skills card is noise. `write` refuses a
			// removal that lands on a claimed row for the same reason, so a stale
			// index cannot reach one through the back door (CLAUDE.md 4).
			if (!rowView.owned || rowView.at === null) return;
			const at = rowView.at;
			const named = rowLabel(rowView.label);
			const button = element('button', 'sheetsmith-table-remove-button', cell);
			button.type = 'button';
			// The one import from `obsidian` in this folder. The convention it
			// brushes against is about vault access (PATTERNS §5) and about staying
			// testable under happy-dom, and this is neither: it draws an SVG, and
			// the stub every test and the harness run on draws the real icon paths.
			// Taking the app's icon rather than a copy of it is also what keeps this
			// following their icon set instead of drifting from it.
			setIcon(button, REMOVE_ICON);
			let ready = false;
			const paint = () => {
				button.classList.toggle('sheetsmith-table-remove-armed', ready);
				tr.classList.toggle('sheetsmith-table-row-arming', ready);
				button.setAttribute(
					'aria-label',
					ready ? `Delete ${named}. Select again to confirm.` : `Delete ${named}`,
				);
				button.setAttribute('title', ready ? `Delete ${named}?` : `Delete ${named}`);
			};
			/** Removes the outside-press listener, while there is one. */
			let standDown: (() => void) | null = null;
			const disarm = () => {
				if (!ready) return;
				ready = false;
				if (armedRow === disarm) armedRow = null;
				standDown?.();
				standDown = null;
				paint();
			};
			button.addEventListener('click', () => {
				if (ready) {
					// The gesture is over, so it stands itself down before the write
					// rather than leaving a listener alive on a row that is going.
					// The first press wrote nothing, so this is the first byte the
					// gesture changes.
					disarm();
					context.onChange({ rows: {}, removed: [at] });
					return;
				}
				// Arming one control stands another down: two rows armed at once
				// is two rows about to go, and only one of them is.
				armedRow?.();
				ready = true;
				armedRow = disarm;
				/**
				 * The next press anywhere else is a change of mind.
				 *
				 * This is what a finger has instead of moving focus away: there is
				 * no touch gesture for that at all, and WebKit does not focus a
				 * button on tap in any case, so `blur` alone would leave a phone
				 * armed with no way to take it back — the two-step reduced to one
				 * on exactly the input that has no hover to warn it. Capture, so a
				 * press something else swallows still counts as the user moving
				 * on: the same dismissal `popover.ts` makes, for the same reason.
				 *
				 * A press *inside* the control is the second press and must reach
				 * the click. The invisible hit target is part of the button, so a
				 * press on the padding around the glyph counts as inside it.
				 */
				const outside = (event: Event) => {
					if (button.contains(event.target as Node | null)) return;
					disarm();
					status.textContent = 'Delete cancelled';
				};
				doc.addEventListener('pointerdown', outside, true);
				// A rebuild of the card while a control is armed has no way to
				// disarm it — a component gets no unload — so the listener is
				// written to survive being orphaned: the next press anywhere lands
				// outside a detached button, disarms it, and takes the listener
				// with it.
				standDown = () =>
					doc.removeEventListener('pointerdown', outside, true);
				paint();
				status.textContent = `Delete ${named}? Select again to confirm.`;
			});
			// A keyboard has both of the gestures a finger does not: focus moves
			// off the control, and Escape. Both leave the note exactly as it was.
			button.addEventListener('blur', disarm);
			button.addEventListener('keydown', (event) => {
				if (event.key !== 'Escape' || !ready) return;
				disarm();
				status.textContent = 'Delete cancelled';
			});
			paint();
		};

		views.forEach((rowView) => {
			const rowIndex = rowView.declared;
			const stored =
				rowView.at === null ? {} : (data?.rows[rowView.at]?.cells ?? {});
			const tr = element('tr', '', body);

			/**
			 * The row's names, as a computed cell sees them: every cell by its
			 * column key, then the row's own named expressions layered over
			 * them. Rebuilt per keystroke from the drafts, so a total moves
			 * while the user is still typing the bonus that changed it.
			 */
			const drafts = new Map<string, string>();
			/**
			 * This row's text for a column: what is being typed if anything is,
			 * and what the note holds otherwise. One reader, because a computed
			 * cell and a column total must not disagree about what a row says.
			 */
			const cellText = (column: TableColumn): string | undefined =>
				drafts.get(column.key) ?? stored[column.key.toLowerCase()];
			counted.push({ label: rowView.label, cell: cellText });
			const rowScope = (): Record<string, FieldValue> => {
				const scope: Record<string, FieldValue> = {};
				for (const column of columns) {
					if (columnType(column) === 'computed') continue;
					scope[column.key] = cellValue(column, cellText(column));
				}
				for (const name of Object.keys(rowView.row?.values ?? {})) {
					const value = context.resolveField(
						`rows.${rowIndex}.values.${name}`,
						scope,
					);
					// A row value that will not resolve publishes nothing, so
					// the column formula reading it fails and says so, rather
					// than computing from a silent zero (SPEC §5).
					if (value !== null) scope[name] = value;
				}
				return scope;
			};

			const computed: { column: TableColumn; el: HTMLElement; index: number }[] =
				[];
			const view = doc.defaultView;
			let pending: number | undefined;
			/**
			 * Repaint this row's computed cells from the current drafts. An
			 * unresolved result waits out UNRESOLVED_DELAY before it is
			 * allowed to show, so a half-typed value keeps the last good
			 * display instead of flashing a warning; a commit shows the truth
			 * at once.
			 */
			const recompute = (settled: boolean) => {
				// The totals first, and outside the computed-cell guard: a card
				// may total a column and compute nothing at all.
				paintTotals(settled);
				if (computed.length === 0) return;
				if (pending !== undefined) {
					view?.clearTimeout(pending);
					pending = undefined;
				}
				const scope = rowScope();
				const results = computed.map(({ column, index }) => {
					if (column.formula === undefined) return null;
					// A formula reading a cell that is still blank in a text
					// column has nothing to work with; one computed entirely
					// from elsewhere resolves regardless.
					return context.resolveField(`columns.${index}.formula`, scope);
				});
				const paint = () => {
					computed.forEach(({ column, el, index }, i) => {
						if (column.formula === undefined) {
							// Nothing to compute is an empty cell, not a value that
							// failed: "?" is reserved for one that is present and
							// did not resolve, and "—" is what empty reads as
							// everywhere else on a sheet (SPEC §4.2).
							el.textContent = '—';
							return;
						}
						const value = results[i] ?? null;
						el.textContent = formatComputed(value, column.signed === true);
						el.classList.toggle('sheetsmith-table-unresolved', value === null);
						el.setAttribute(
							'title',
							// SPEC §4.2: hovering a computed value reveals the
							// formula behind it. Where it failed, the formula is
							// not the useful half — which name it could not find
							// is, because that is the one the user can go and
							// define. "Did not resolve" makes no next action
							// obvious at all.
							value === null
								? (context.explainField?.(
										`columns.${index}.formula`,
										scope,
									) ?? 'The formula did not resolve.')
								: column.formula,
						);
					});
				};
				if (settled || results.every((value) => value !== null)) {
					paint();
					return;
				}
				pending = view?.setTimeout(() => {
					pending = undefined;
					paint();
				}, UNRESOLVED_DELAY);
			};

			const renderCell = (index: number) => {
				const column = columns[index] as TableColumn;
				const type = columnType(column);
				const td = element('td', `sheetsmith-table-${type}`, tr);
				const raw = stored[column.key.toLowerCase()] ?? '';
				const label = `${rowLabel(rowView.label)} ${column.name ?? column.key}`;

				if (type === 'computed') {
					// The cell's own class, distinct from the column class on
					// the td and the th: those align a column, this one is the
					// value, and one selector must not mean both.
					// No aria-label: ARIA does not expose a name on a generic
					// element, so it would be an attribute doing nothing. The
					// cell already sits under its own th and beside the row's
					// th[scope="row"], which is where a table gets "Athletics,
					// Total, +7" from without being told.
					const cell = element('div', 'sheetsmith-table-value', td);
					if (column.formula !== undefined) {
						// The title says this on a desktop and says nothing on a
						// phone. A read-only cell has no other use for a tap, so
						// the tap is free to mean "why this number?" — which is
						// the question, and the one the failure message answers.
						cell.classList.add('sheetsmith-table-askable');
						cell.addEventListener('click', () => {
							const said = cell.getAttribute('title');
							if (said !== null) showPopover(cell, said);
						});
					}
					computed.push({ column, el: cell, index });
					return;
				}

				const commit = (next: string) => {
					// Delta, not snapshot: writing one cell cannot revert a
					// sibling's fresher edit, even if two commits race one
					// rebuild of the sheet.
					if (rowView.at !== null) {
						context.onChange({
							rows: { [rowView.at]: { cells: { [column.key]: next } } },
						});
						return;
					}
					// A declared row the note has never held has no position to
					// address, so its first edit appends the row. `write` claims
					// it back by name, which is what keeps a second commit
					// arriving before the re-read from appending a twin.
					context.onChange({
						rows: {},
						added: [{ name: rowView.label, cells: { [column.key]: next } }],
					});
				};

				// A level column and a toggle are the same control with a
				// different number of states, so they render as one. SPEC §4.2
				// already calls a one-level column "an ordinary toggle"; two
				// adjacent columns doing the same job must not measure
				// differently under the same finger, and a bare checkbox got
				// none of the ring's hit target, coarse sizing, or press.
				if (type === 'level' || type === 'toggle') {
					const graded = type === 'level';
					const count = graded ? levelCount(column) : 1;
					let current = graded
						? levelOf(column, raw)
						: cellValue(column, raw) === true
							? 1
							: 0;
					// The view rebuilds on a change, but a write that produces
					// the same file does not, and the control must never be
					// left showing a level the user has already moved off.
					let repaint = () => undefined as void;

					/** What the note stores for a level: a count, or yes/no. */
					const stateOf = (level: number) =>
						graded ? String(level) : level > 0 ? TOGGLE_TRUE : TOGGLE_FALSE;
					/** What the level is called, to a reader and to a listener. */
					const nameOf = (level: number) =>
						graded ? levelName(column, level) : level > 0 ? 'Yes' : 'No';

					const setLevel = (next: number) => {
						if (next === current) return;
						current = next;
						repaint();
						drafts.set(column.key, stateOf(current));
						recompute(true);
						commit(stateOf(current));
					};

					if (graded && column.input === 'select') {
						const select = element('select', 'sheetsmith-table-select', td);
						for (let i = 0; i <= count; i++) {
							const option = element('option', '', select, nameOf(i));
							option.value = String(i);
						}
						select.value = String(current);
						select.setAttribute('aria-label', label);
						select.addEventListener('change', () => setLevel(Number(select.value)));
						return;
					}

					const button = element('button', 'sheetsmith-table-cycle', td);
					button.type = 'button';
					// Two states is a toggle button, and ARIA has a word for
					// that; more than two is not, so those carry their state in
					// the name instead.
					const pressed = count === 1;
					const show = () => {
						const name = nameOf(current);
						// Everything a reader sees comes from the shared painter,
						// so the layout editor's sample of this control cannot
						// drift from the control. What stays here is what the
						// sample has no business carrying: the naming, and the
						// routes to a name the ring is not showing.
						paintLevelRing(button, column, current, graded);
						if (pressed) {
							button.setAttribute('aria-pressed', String(current > 0));
							button.setAttribute('aria-label', label);
						} else {
							button.setAttribute('aria-label', `${label}: ${name}`);
						}
						// A tooltip that repeats what is already legible is noise
						// fired at every pass, as the stat card's label learned.
						// Only an abbreviation earns one, and every named level is
						// one: an initial, a mark of the layout's own, or a bare
						// fill saying nothing at all. An unnamed level shows the
						// number that is already the whole answer.
						if (graded && column.levels !== undefined) {
							button.setAttribute('title', name);
						} else {
							button.removeAttribute('title');
						}
					};

					// A glyph is an abbreviation, and on a touch device `title`
					// is not a route to the word behind it — there is no hover
					// to find it with. A long press is that route, and only
					// where there is something the glyph is not already saying.
					const longPressed = bindLongPress(button, () =>
						graded && column.levels !== undefined ? nameOf(current) : null,
					);

					// Clicking cycles and wraps, so one control reaches every
					// level and returns to none without a second gesture. The
					// arrows step without wrapping, for the hand that wants to
					// aim rather than count.
					button.addEventListener('click', () => {
						// The press that opened the bubble ends in a click, and
						// it did not mean "change the level".
						if (longPressed()) return;
						setLevel(current === count ? 0 : current + 1);
					});
					repaint = show;
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
					return;
				}

				const input = textField(td, raw, type === 'text');
				input.type = 'text';
				// A gloss is a text column's business: a number column is the
				// row's arithmetic and never the note beside it.
				if (type === 'text' && column.secondary === true) {
					input.classList.add('sheetsmith-table-input-secondary');
				}
				input.value = raw;
				input.setAttribute('aria-label', label);
				if (type === 'number') input.inputMode = 'numeric';
				bindEditable(input, {
					initial: raw,
					step: type === 'number',
					min: column.min,
					max: column.max,
					onDraft: () => {
						drafts.set(column.key, input.value.trim());
						recompute(false);
					},
					announceCommit: (next) => {
						status.textContent =
							next === '' ? `${label} cleared` : `${label} ${next}`;
					},
					announceRestore: (restored) => {
						// The same undo the stat card has, and it was silent
						// here: an undo nobody can perceive is not obviously one.
						status.textContent =
							restored === ''
								? `${label} restored to empty`
								: `${label} restored to ${restored}`;
					},
					onCommit: (next) => {
						// Bounds hold however the value arrived: a training
						// level typed as 5 in a two-level system is the same
						// mistake as one stepped there.
						const bounded = type === 'number' ? bound(next, column) : next;
						if (bounded !== next) {
							// A correction lands on blur, at the moment the cell
							// gives up its hover chrome and goes transparent, so
							// left to itself it is a silent rewrite of what the
							// user typed. Say it, and tint the field long enough
							// that eyes already leaving still catch it.
							input.value = bounded;
							drafts.set(column.key, bounded);
							recompute(true);
							status.textContent = `${label} held to ${bounded}`;
							input.classList.add('sheetsmith-table-input-corrected');
							view?.setTimeout(
								() => input.classList.remove('sheetsmith-table-input-corrected'),
								CORRECTION_FLASH,
							);
						}
						commit(bounded);
					},
				});
			};

			/**
			 * The row's name. A declared row's is plain text, because it comes
			 * from the layout; a character's is a field on the shared editing
			 * gesture like every other cell, because it is the row's own data
			 * and the one cell a fixed card never had.
			 *
			 * A wikilink typed here stays plain markdown in the note, so
			 * backlinks, graph view, hover preview and rename all work
			 * (CLAUDE.md 2) — and the sheet draws it as a link, which is
			 * `paintText` above. What stays parked is the `link` column *type*
			 * (§12): a column whose value is always a note, with a picker and a
			 * resolved state as data, which is a different feature.
			 */
			const renderName = () => {
				const cell = element('th', 'sheetsmith-table-name', tr);
				cell.setAttribute('scope', 'row');
				if (!rowView.owned || rowView.at === null) {
					// A declared row's name is static text from the layout, so it
					// needs the display alone and no field to stack it over.
					paintText(cell, rowView.label, context.link);
					return;
				}
				const at = rowView.at;
				const input = textField(cell, rowView.label, true);
				input.classList.add('sheetsmith-table-name-input');
				input.type = 'text';
				input.value = rowView.label;
				// The column's heading alone, where every other cell is named for its
				// row as well: this field's *value* is the row's name, and a reader
				// is given the value with the name, so qualifying it would announce
				// the same word twice.
				input.setAttribute('aria-label', nameHeading);
				bindEditable(input, {
					initial: rowView.label,
					announceCommit: (next) => {
						status.textContent =
							next === '' ? `${nameHeading} cleared` : `${nameHeading} ${next}`;
					},
					announceRestore: (restored) => {
						status.textContent =
							restored === ''
								? `${nameHeading} restored to empty`
								: `${nameHeading} restored to ${restored}`;
					},
					onCommit: (next) => {
						context.onChange({ rows: { [at]: { name: next } } });
					},
				});
			};

			for (const entry of order) {
				if (entry === null) {
					renderName();
					continue;
				}
				renderCell(entry);
			}
			if (open) renderRemove(tr, rowView);

			recompute(true);
		});

		if (open) {
			// A row-shaped control in the row position, so it reads as "the next
			// row" rather than as chrome parked beside the table, and it picks up
			// the row hover the rows already have.
			const tr = element('tr', 'sheetsmith-table-add', body);
			const cell = element('td', '', tr);
			cell.colSpan = width;
			const add = element('button', 'sheetsmith-table-add-button', cell);
			add.type = 'button';
			// The label is in a span so it can hold the left edge while the table
			// scrolls sideways, exactly as the name column does: the button spans
			// the table's full width, and its text would otherwise scroll out and
			// leave a wide empty band with nothing saying what it is.
			element('span', 'sheetsmith-table-add-label', add, 'Add row');
			add.addEventListener('click', () => {
				// The one place PATTERNS §5's optimistic paint cannot apply: a new
				// row's identity is its position in the file, and the component
				// does not know it until the file has it. Nothing else in the
				// gesture waits on the round trip.
				//
				// Focus lands in the new row's name field, which falls out of how
				// the view restores focus — by control index within the cell, and
				// the new row's controls sit immediately before the add button
				// that was focused. That makes it an accident rather than a
				// design, so it has a test of its own.
				status.textContent = 'Row added';
				context.onChange({ rows: {}, added: [{ name: '', cells: {} }] });
			});
		}

		// The totals row, under the last row rather than off in a component of
		// its own: for a load list the number the mechanic exists for *is* the
		// total, and it belongs next to the rows it counts.
		if (columns.some((column) => column.total === true)) {
			const foot = element('tr', '', element('tfoot', '', grid));
			const totals: { column: TableColumn; el: HTMLElement }[] = [];
			for (const entry of order) {
				if (entry === null) {
					// The name column is sticky, so this cell carries that class
					// too — otherwise "Total" slides out from under its own column
					// on a phone-width sheet while the numbers stay put.
					const cell = element('th', 'sheetsmith-table-name', foot, 'Total');
					cell.setAttribute('scope', 'row');
					continue;
				}
				const column = columns[entry] as TableColumn;
				const cell = element('td', `sheetsmith-table-${columnType(column)}`, foot);
				if (column.total !== true) continue;
				// The same class the computed cells use, for its tabular figures:
				// a total must not twitch while a cell above it is being typed.
				totals.push({ column, el: element('div', 'sheetsmith-table-value', cell) });
			}
			if (open) element('td', 'sheetsmith-table-remove', foot);

			const view = doc.defaultView;
			let pending: number | undefined;
			paintTotals = (settled) => {
				if (pending !== undefined) {
					view?.clearTimeout(pending);
					pending = undefined;
				}
				const sums = totals.map(({ column }) => columnTotal(column, counted));
				const paint = () => {
					totals.forEach(({ el }, i) => {
						const total = sums[i] as ColumnTotal;
						const missing = 'unreadable' in total;
						el.textContent = missing ? '?' : String(total.sum);
						el.classList.toggle('sheetsmith-table-unresolved', missing);
						if (missing) {
							el.setAttribute(
								'title',
								`${total.unreadable} is not a number, so this column has no total.`,
							);
						} else {
							el.removeAttribute('title');
						}
					});
				};
				// A draft on its way to a number passes through states that are
				// not wrong yet — "-" before "-1" — so an unreadable total waits
				// out UNRESOLVED_DELAY and keeps the last good number until then.
				// A commit, a bounds correction, or a level change is settled and
				// shows the truth at once. The same rule the computed cells above
				// follow, because they are the same kind of number.
				if (settled || sums.every((total) => !('unreadable' in total))) {
					paint();
					return;
				}
				pending = view?.setTimeout(() => {
					pending = undefined;
					paint();
				}, UNRESOLVED_DELAY);
			};
			paintTotals(true);
		}
	},
};
