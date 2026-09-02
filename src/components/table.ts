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
 * some game. Card set made the same move from "Abilities" (§12). What the name
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
import { isName, roundSum } from '../formula/expression';
import {
	cellParts,
	spellParts,
	storedParts,
} from '../parse/modifier-cell';
import { MarkdownTable, readTable, writeTable } from '../parse/table';
import { displayText, hasLink } from '../parse/wikilink';
import {
	ColumnType,
	PUBLISHABLE_TYPES,
	TOTALLED_TYPES,
} from './column-types';
import {
	boundedText,
	formatComputed,
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
	RowsSource,
	RowValues,
	ScopeEntry,
	ScopeValues,
	showsOwnLabel,
} from '../types';
import { bindEditable, UNRESOLVED_DELAY } from '../interaction/editable';
import { armRegister, bindArmToConfirm } from '../interaction/arm-to-confirm';
import {
	levelCount,
	levelName,
	levelOf,
	paintLevelRing,
	parseLevel,
} from './level-ring';
import { paintLinkedText } from './linked-text';
import {
	MODIFIED_CLASS,
	modifierBreakdown,
	modifierRowName,
	modifierRowText,
	rowModifiers,
} from './modifier-breakdown';
import {
	ModifierFormState,
	modifierFormState,
	renderModifierForm,
} from './modifier-form';
import {
	sampleFlag,
	sampleNumber,
	samplePart,
	sampleSeed,
	sampleText,
} from './sample-values';
import { flagReading, flagText } from './stored-flag';
import {
	AnchoredPanel,
	focusFirstControl,
	openAnchoredPanelKey,
	reanchorAnchoredPanel,
	showAnchoredPanel,
} from '../ui/anchored-panel';
import { bindLongPress, showPopover } from '../ui/popover';
import { revealWhenTruncated } from '../ui/truncation';
import { spellcheckWhileFocused } from '../ui/spellcheck';

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
	 * a card's name. For the column that qualifies the row — a skill's
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
	/**
	 * Give every declared row carrying a `key` a name of its own, answering
	 * with this column's cell on that row: `skills.perception` is the Total
	 * column's value on the Perception row.
	 *
	 * The column asks and the row carries the name, which is the way round
	 * `total` already has it: which value on a row is worth publishing is a
	 * property of the column, stated once, not a property repeated on eighteen
	 * rows. At most one column per card, because `<id>.<key>` is two segments
	 * and the row is already the second.
	 */
	publish?: boolean;
}

export interface TableRow {
	/**
	 * The row's name, and what it claims: the first note row spelling this,
	 * case-insensitively. See claimRows.
	 */
	label: string;
	/**
	 * The name a formula reads this row's published value by, as
	 * `<component id>.<key>`. Only meaningful with a published column, and
	 * opt-in rather than derived from the label: a skills card must not claim
	 * eighteen sheet-wide names nobody asked for, and slugifying "Sleight of
	 * Hand" is a question with no answer worth guessing at.
	 */
	key?: string;
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

/**
 * What clipping means in a cell, for the shared linked-text painter.
 *
 * A cell is one line in a row whose height its neighbours already agreed, so it
 * clips — and the class name stays here rather than in the painter, which is
 * PATTERNS §1's rule: a module beside the components must not name a table. A
 * caller whose box wraps, such as a Rich text block, passes none of this.
 */
const CELL_CLIPPING = {
	soleLinkClass: 'sheetsmith-table-link-only',
	reveal: revealWhenTruncated,
};

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

/**
 * Shared with Record set through `typed-value.ts`, so the default cannot drift.
 *
 * A private copy here is the one drift `column-types.ts`'s header calls the
 * worst of the three: "two answers to 'which is first' turn every numeric column
 * in every layout into a text column, silently."
 */
const columnType = typeOf;

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

/** This row's text for a column, wherever the caller reads it from. */
type CellReader = (column: TableColumn) => string | undefined;

/**
 * One row as a total sees it: what it is called, and what its cells hold.
 *
 * A reader rather than the cells themselves, because the callers read from
 * different places. Publication has only the note. `render` layers the row's
 * drafts over it, so a total moves while the cell that changed it is still being
 * typed — which is the same reader the row's computed columns already use.
 */
interface TotalRow {
	label: string;
	cell: CellReader;
}

/**
 * The names a row's computed columns resolve against: every stored cell by its
 * column key, then the row's own named expressions layered over them.
 *
 * One helper, because the same names are needed from two places and must not
 * disagree. `render` builds it over the drafts, so a computed cell moves while
 * the value feeding it is still being typed; `scopeValues` builds it over the
 * note, which is what a published name reads. Two copies would be the same
 * class of bug the totals were factored to avoid — a cell and a name computed
 * from different accounts of one row.
 */
function rowScope(
	config: TableConfig,
	declared: number | null,
	cell: CellReader,
	resolve: FieldResolver,
): Record<string, FieldValue> {
	const scope: Record<string, FieldValue> = {};
	for (const column of config.columns ?? []) {
		if (columnType(column) === 'computed') continue;
		scope[column.key] = typedValue(column, cell(column));
	}
	const row = declared === null ? undefined : config.rows?.[declared];
	for (const name of Object.keys(row?.values ?? {})) {
		const value = resolve(`rows.${declared}.values.${name}`, scope);
		// A row value that will not resolve publishes nothing, so the column
		// formula reading it fails and says so, rather than computing from a
		// silent zero (SPEC §5).
		if (value !== null) scope[name] = value;
	}
	return scope;
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
		const value = typedValue(column, view.cell(column));
		if (typeof value === 'boolean') {
			sum += value ? 1 : 0;
		} else if (typeof value === 'number') {
			sum += value;
		} else {
			return { unreadable: rowLabel(view.label) };
		}
	}
	return { sum: roundSum(sum) };
}

/** What the note holds for one row, whatever the card is showing for it. */
function storedCells(data: TableData | null, view: RowView): CellReader {
	return (column) =>
		view.at === null
			? undefined
			: data?.rows[view.at]?.cells?.[column.key.toLowerCase()];
}

/**
 * The name this column's cell on this row publishes, where it publishes one.
 *
 * One reader, because four callers need the same answer and it decides what
 * `mod.self` means: `scopeValues` publishes the cell under it, `scopeRows` and
 * `render` evaluate the same formula, and `scopeModifiers` evaluates a computed
 * amount. A cell and the name it came from disagreeing about which slot they
 * read would put one number under the cursor and a different one into a formula.
 *
 * Undefined where the cell publishes nothing — an unpublished column, a
 * character's own row, a declared row with no key — and `mod.self` is then 0,
 * which is the truth: a row with no name cannot be pushed at.
 */
function publishedName(
	config: TableConfig,
	view: RowView,
	at: number,
): string | undefined {
	if (config.columns?.[at]?.publish !== true) return undefined;
	const key = (view.row?.key ?? '').trim();
	if (view.declared === null || key === '') return undefined;
	return `${config.id}.${key}`;
}

/**
 * One row as an aggregate reads it: what to call it, and every name on it.
 *
 * Three layers, and the layering is the point. `rowScope` already gives the
 * first two — every stored cell by its column key, then the row's own named
 * expressions — and this adds the computed columns over the top.
 *
 * **Every computed column resolves against the same two layers, never against
 * each other.** That is what the cell on screen does, and the two must not
 * disagree about what a row says: a computed column that could read a second
 * computed column here and not in `render` would put one number under the
 * cursor and a different one into `sum()`.
 *
 * A column that would not resolve is absent rather than zero, exactly as a row
 * value is, so an expression reading it fails and the aggregate names the row.
 */
function rowValues(
	config: TableConfig,
	data: TableData | null,
	view: RowView,
	resolve: FieldResolver,
): RowValues {
	const cell = storedCells(data, view);
	const stored = rowScope(config, view.declared, cell, resolve);
	const values: Record<string, FieldValue> = { ...stored };
	(config.columns ?? []).forEach((column, at) => {
		if (columnType(column) !== 'computed') return;
		// The name this cell publishes, so `mod.self` in a computed column means
		// the same slot here as it does in the cell on screen.
		const value = resolve(
			`columns.${at}.formula`,
			stored,
			publishedName(config, view, at),
		);
		if (value !== null) values[column.key] = value;
	});
	return { label: rowLabel(view.label), values };
}

/**
 * Configuration errors that make the table unreadable rather than merely
 * empty. Reported on this component alone, per SPEC §10.
 */
function baseConfigError(config: TableConfig): string | null {
	const columns = config.columns ?? [];
	const seen = new Set<string>();
	/** The column published per row, once one has been met. */
	let published: string | null = null;
	/** Column keys already answering to `<id>.<key>` as a total. */
	const totalled = new Set<string>();
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
		/*
		 * **Nothing here refuses a second modifier column, and that is a decision
		 * rather than an omission.** One modifier column is now enough — a cell
		 * holds every modifier its row applies — so a second is redundant, and the
		 * redundancy is *reported in the layout editor* while this component draws
		 * both, pushes from both and refuses neither.
		 *
		 * Refusing would take the whole table down, and `withdrawnNotice` means it
		 * would take every modifier that table's rows apply down with it: a
		 * player's inventory disappearing because a layout has a column too many
		 * is the worst trade available here (§10, Constraint 4). A rule about how a
		 * layout is best written is advice, and advice belongs where the layout is
		 * edited.
		 */
		if (columnType(column) === 'modifier') {
			if (column.total === true) {
				return `The column "${key}" cannot show a total, because a total adds up stored numbers and a modifier cell holds the changes a row applies. Total the column the amounts are in, or turn the total off.`;
			}
			if (column.publish === true) {
				return `The column "${key}" cannot be published per row, because a modifier cell holds the changes a row applies and a formula has nothing to compare those to — the language has no text. Publish a number or computed column instead.`;
			}
		}
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
			// A total sums what the note stores, over however many rows the
			// character has. A text column has nothing to add up, and a computed
			// column stores nothing to sum — one row's derived value is a value,
			// and a sum of them across a list the character owns is a different
			// question. Stated rather than rendered as a number the sheet then
			// refuses to read: one name meaning "publishable, sometimes" is worse
			// than a refusal that says why.
			return columnType(column) === 'computed'
				? `The column "${key}" cannot show a total, because a total adds up stored cells and a computed column stores none — it works one row out at a time, over as many rows as the character has. Add it up from elsewhere on the sheet with sum(${config.id}, <expression>), total a stored column, or publish a single row's value by giving that row a key.`
				: `The column "${key}" cannot show a total, because a text column has nothing to add up. Make it a number column, or turn the total off.`;
		}
		if (column.publish === true) {
			if (published !== null) {
				// One card, one published column: `<id>.<key>` is two segments
				// and the row is already the second, so a second column would
				// have nowhere to put its own name.
				return `The columns "${published}" and "${key}" are both published per row, and only one can be: a row publishes as "${config.id}.<row key>", and one name cannot mean two cells.`;
			}
			published = key;
			if (!PUBLISHABLE_TYPES.has(columnType(column))) {
				// The one type left out is `text`, and the reason is the link:
				// there is no one value for the name to mean.
				return `The column "${key}" cannot be published per row, because the card shows "sword" where the note holds "[[Sunblade|sword]]", so there is no one value a formula could read. Publish a number, level, toggle or computed column instead.`;
			}
		}
		if (column.total === true) totalled.add(key);
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
	/** Row keys already published, against the row that carries each. */
	const keys = new Map<string, string>();
	for (const row of config.rows ?? []) {
		const label = (row.label ?? '').trim();
		if (label === '') return 'Every row needs a name.';
		if (/[|\r\n]/.test(label)) {
			return `The row "${label}" cannot contain a pipe or a line break.`;
		}
		if (labels.has(label)) return `Two rows are both called "${label}".`;
		labels.add(label);

		const key = (row.key ?? '').trim();
		if (key === '') continue;
		if (!isName(key)) {
			// Refused rather than rewritten, on the same argument a totalled
			// column's key is: the editor can tell an author what their
			// component id became, and nothing here could tell them what their
			// row became.
			return `The row "${label}" cannot publish as "${key}", because a row key is a name a formula reads — letters, digits and underscores, not starting with a digit. It is refused rather than rewritten, so rename it or clear it.`;
		}
		if (published === null) {
			return `The row "${label}" publishes as "${key}", but no column is published per row, so the key names no value. Turn on "Publish per row" for the column the name should read, or clear the key.`;
		}
		if (keys.has(key)) {
			return `The rows "${keys.get(key) ?? ''}" and "${label}" both publish as "${key}", and one name cannot mean two rows.`;
		}
		if (totalled.has(key)) {
			return `The row "${label}" publishes as "${key}", which is already the key of a totalled column, so both would answer to "${config.id}.${key}". Rename one of them.`;
		}
		keys.set(key, label);
	}
	return null;
}

/**
 * Configuration errors, with a clause where refusing this card also withdraws
 * modifiers its rows were making elsewhere.
 *
 * **A misconfigured modifier table takes its bonuses down with it, silently.**
 * `scopeModifiers` returns undefined for a card that will not configure — on the
 * same argument `scopeRows` and `scopeValues` do, that filling a slot from a
 * configuration nobody has agreed to yet is a number derived from an error — so
 * every name its rows were changing falls back to `mod.self` of 0, which is a
 * *plausible* number and carries no mark, because nothing was pushed. A reader
 * sees a strength of +2 where it said +5, four cards deriving from it move with
 * it, and no card says why.
 *
 * **This clause is the half that can be said from here, and it is not the whole
 * answer.** What it cannot do is tell those cards. The precise message — "this
 * number is missing its modifiers" — would have to name the values this table's
 * rows were changing, and a card that will not configure has never read a row:
 * `read` refuses on this error before `readTable`, so `data` is null, and an open
 * table declares no rows, so there is no cell to take a definition's name from.
 * The information the message would need is in the data the component refused to
 * read.
 *
 * So the sentence goes where the fix is rather than where the symptom is, which
 * is the honest half: the author is standing in front of this card's error, and
 * the clause tells them that fixing it also brings numbers back elsewhere.
 *
 * Only where this card had something to withdraw: a modifier column, which is
 * `scopeModifiers`' own condition. One column is now the whole condition, where
 * the shipped design needed a target column *and* an amount column.
 */
function configError(config: TableConfig): string | null {
	const error = baseConfigError(config);
	if (error === null) return null;
	const pushing = (config.columns ?? []).some(
		(column) => columnType(column) === 'modifier',
	);
	if (!pushing) return error;
	return `${error} Until this is fixed, the modifiers this table's rows apply are not applied, so the values they change read as though nothing changed them.`;
}

/**
 * What one cell holds in a sample, or null for a column that stores nothing a
 * sample may fill.
 *
 * `row` is which row this is, for everything a reader compares down a column;
 * `at` is which cell it is across the whole table, so two numbers side by side
 * are never the same number — `sampleNumber`'s own sequence does the rest.
 *
 * **A modifier cell is left empty**, which is the one rule here that is about
 * something other than looking plausible: a name in that cell enrols the row in
 * one of the *layout's* definitions, and a layout the author is still building
 * may declare none — so a sample that named one would put a definition problem
 * on screen that the author did not cause (`docs/features/preview-sample-values.md`
 * §2). An empty modifier cell is also an ordinary state: on an inventory, most
 * rows have one.
 */
function sampleCell(column: TableColumn, row: number, at: number): string | null {
	switch (columnType(column)) {
		case 'number':
			return String(sampleNumber(at));
		case 'toggle':
			return flagText(sampleFlag(row));
		case 'level':
			// A level column is a flag with a ladder in it, so it answers both
			// rules at once: alternate rows carry a level at all, and the level
			// they carry is partway up rather than at the top.
			return String(sampleFlag(row) ? samplePart(levelCount(column)) : 0);
		// A computed column stores nothing, so it is never offered one — but
		// naming it beside the modifier column says so, rather than letting the
		// default answer for it.
		case 'modifier':
		case 'computed':
			return null;
		default:
			// The heading the reader sees, so a sample says which column it is
			// filling in the author's own word rather than in the note's key.
			return sampleText(column.name ?? column.key, row);
	}
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
				'The rows every character using this layout has. Each row may define named expressions its computed columns can read, e.g. "ability" as abilities.DEX, so one column formula serves the whole list. A row may also carry a key, which is the name a formula elsewhere reads that row\'s published value by.',
		},
		/*
		 * **The description says nothing about a target column, deliberately.**
		 * `config-panel.ts` puts the same sentence in a footnote *inside* the
		 * columns list, where it sits beside the control it is about and only on a
		 * component that has a modifier row to configure — which is the right home
		 * for it. Saying it here too put 141 near-identical characters on screen
		 * twice, about 340px apart in one panel, and cost the always-visible half
		 * two of its seven rendered lines. The concept stays discoverable without
		 * it: the **Holds** select offers **Target** on every column of every
		 * table, which is where an author meets it in the first place.
		 */
		{
			key: 'columns',
			kind: 'columns',
			label: 'Columns',
			description:
				'Text, number, and toggle columns hold character data. A computed column is read-only and reads the row\'s other cells by column key, its row values by name, and anything else on the sheet by component id. One column may be published per row, which is what lets a formula read a single row\'s value rather than a column\'s total. A column\'s total sums what the note stores; a formula elsewhere can sum an expression over the rows instead, with sum(<component id>, <expression>).',
		},
		{
			key: 'openRows',
			kind: 'boolean',
			label: 'Characters may add rows',
			description:
				'Adds a row control under the table. Rows a character adds are theirs to rename and delete, and no formula can name a row a character added — total a column, or aggregate over the rows with sum(<component id>, <expression>). Rows declared above stay read-only and cannot be deleted from a character.',
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
	/*
	 * Both entries are this component with `openRows` on and its columns
	 * filled in, which is what SPEC §13 found when it checked the five blocks
	 * one at a time: an inventory and a features list wanted no capability the
	 * table lacks, only a starting point. They are the first two entries on one
	 * type, and they earn that under §4.2's rule twice over — nobody building an
	 * inventory looks for a component called Table, which is the same miss that
	 * made "Skill card" the wrong name for this block in the first place.
	 *
	 * Neither declares rows. A declared row is one every character using the
	 * layout has, and gear and features are exactly the lists where the
	 * character owns every line.
	 */
	palette: [
		{
			name: 'Inventory',
			description:
				'An open list of gear: the character adds every row, names it, and fills in a quantity and a weight. A Table with the weights totalled under it, storing as ordinary markdown, so an item named as a wikilink stays a real link the vault indexes.',
			config: {
				columns: [
					{ key: 'Qty', type: 'number' },
					{ key: 'Weight', type: 'number', total: true },
				],
				openRows: true,
				rowHeader: 'Item',
			},
		},
		{
			name: 'Features',
			description:
				'An open list of features, traits or moves: the character adds every row and names it, with its source in quieter type beside the name and a line of notes after. A Table, so it stores as ordinary markdown and a feature naming its own note keeps a working wikilink. A cell is one line, so a feature whose text runs long belongs in the note it links to.',
			config: {
				columns: [
					{ key: 'Source', secondary: true },
					{ key: 'Notes' },
				],
				openRows: true,
				rowHeader: 'Feature',
			},
		},
	],

	/*
	 * The layout's own rows filled in, and — only where the layout lets a
	 * character add rows — two rows of the character's own under them.
	 *
	 * **The added rows are the half worth arguing.** A declared row is one every
	 * character has, so filling those is not a choice; adding two beside them is,
	 * and it is what makes an open list look like the thing it becomes. An
	 * inventory declares no rows at all (both palette entries do exactly that),
	 * so without them the one component whose whole point is that the character
	 * fills it would preview as a header row and nothing else — a table that
	 * cannot show whether its columns are wide enough for anything. Two rather
	 * than one, so a flag column shows both paints and a total has something to
	 * add up; and none at all where `openRows` is off, because a row the config
	 * refuses is a row no character could type (§2).
	 *
	 * They are named for the name column's own heading, so an inventory's are
	 * `Item 1` and `Item 2` — the author's word, not this component's.
	 *
	 * A table that cannot be drawn fills nothing: `read` reports the configuration
	 * error from the same call either way, and a table written under a column key
	 * this component refuses would be a second thing wrong on it.
	 */
	sample(config): string {
		if (configError(config) !== null) return '';
		const nameHeader = headers(config)[0] as string;
		const columns = storedColumns(config);
		// This table's own place in the sequence, so two tables in one layout do
		// not fill their number columns identically.
		const seed = sampleSeed(config.id);
		const rowAt = (name: string, index: number): Map<string, string> => {
			const cells = new Map<string, string>([[nameHeader, name]]);
			columns.forEach((column, at) => {
				const value = sampleCell(column, index, seed + index * columns.length + at);
				if (value !== null) cells.set(column.key, value);
			});
			return cells;
		};
		// The guard above has already refused a row with no name, so every label
		// here is one `claimRows` can match — written the file's own way, since
		// a hand-edited layout is what both of them are defending against.
		const rows = (config.rows ?? []).map((row, index) =>
			rowAt((row.label ?? '').trim(), index),
		);
		if (config.openRows === true) {
			for (const which of [0, 1]) {
				rows.push(rowAt(sampleText(nameHeader, which), rows.length));
			}
		}
		// A layout that declares no rows and lets the character add none has
		// nothing to fill, so the section stays empty and the table draws its
		// headings exactly as it does today.
		if (rows.length === 0) return '';
		return writeTable(null, headers(config), { added: rows });
	},

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
	 * What the card publishes to the rest of the sheet, both of them under
	 * `<id>.<name>`: one total per column asking for one, and one name per
	 * declared row carrying a `key`, answering with the published column's
	 * cell on that row.
	 *
	 * **A character-added row publishes nothing**, and that is a finding about
	 * the contract rather than about this component: `<id>.<name>` is a
	 * fixed-row mechanism. A name a formula can write has to be stable and has
	 * to be knowable when the formula is written, and a row the character typed
	 * is neither. The entries below are built from `config.rows`, where a row
	 * the character typed has nowhere to appear, so `inventory.Dagger` fails as
	 * an unknown name without a guard saying so.
	 *
	 * A total is the one thing an open list can publish, because an aggregate
	 * needs no row name, and it is a number derived from stored data alone, so
	 * `ScopeEntry.value` carries it. A published row is the case that needed
	 * `compute`: its value may be a computed column, evaluated in a row scope
	 * that itself holds formulas, and only this component can build that scope.
	 *
	 * **A published name reads the note; a cell reads the draft.** While a
	 * value is being typed, a formula elsewhere on the sheet still sees the
	 * last committed number and catches up on commit, when the sheet rebuilds.
	 * That is "feedback is continuous, persistence is discrete" applied to a
	 * name rather than to a card: publishing per keystroke would mean
	 * rebuilding the sheet-wide name table on every key.
	 */
	scopeValues(data, config): ScopeValues {
		// A misconfigured card renders an error and publishes nothing, so a
		// formula reading it fails and says so rather than reading a total the
		// card is refusing to show.
		if (configError(config) !== null) return {};
		const columns = config.columns ?? [];
		const views = rowViews(config, data);
		const named: Record<string, ScopeEntry> = {};

		const rows = views.map((view) => ({
			label: view.label,
			cell: storedCells(data, view),
		}));
		for (const column of columns) {
			if (column.total !== true || !TOTALLED_TYPES.has(columnType(column))) continue;
			const total = columnTotal(column, rows);
			// A total that could not be read publishes nothing rather than the
			// sum of the rows it could read (SPEC §5). The cell says which row
			// stopped it.
			if ('unreadable' in total) continue;
			named[column.key] = { value: total.sum };
		}

		const at = columns.findIndex((column) => column.publish === true);
		const published = columns[at];
		if (published !== undefined) {
			for (const view of views) {
				const declared = view.declared;
				const key = (view.row?.key ?? '').trim();
				if (declared === null || key === '') continue;
				const cell = storedCells(data, view);
				if (columnType(published) !== 'computed') {
					// A stored cell is its own answer, and it is the same answer
					// the card shows, so the bare name and `.value` agree. A
					// declared row the note has no row for reads as blank, which
					// in a number column is zero — the number the card shows.
					named[key] = { value: typedValue(published, cell(published)) };
					continue;
				}
				// A computed column stores nothing, so there is no `.value` to
				// publish: a formula reading one fails as an unknown name (§4.2).
				named[key] = {
					compute: (resolve) =>
						resolve(
							`columns.${at}.formula`,
							rowScope(config, declared, cell, resolve),
							// The name being published, so a `mod.self` in the
							// column's formula reads this row's own slot.
							publishedName(config, view, at),
						),
				};
			}
		}

		return Object.keys(named).length === 0 ? {} : { named };
	},

	/**
	 * The rows an aggregate walks, so a formula elsewhere can write
	 * `sum(inventory, Qty * Weight)` over the rows a character added (SPEC §5).
	 *
	 * **The rows have no names and never gain any**, which is what makes this a
	 * different member from `scopeValues` rather than more of it. `<id>.<name>`
	 * is a fixed-row mechanism and stays one: `inventory.Dagger` still fails as
	 * an unknown name. What an aggregate names is the component, which is
	 * knowable when the formula is written, and it reaches the rows as a set
	 * whose cardinality the layout does not know — which is the whole of what an
	 * aggregate is for.
	 *
	 * **Every row the card draws, in the order it draws them**: declared rows
	 * first in declared order, then the character's own in note order. Same
	 * helper as `render` and as the totals row, because a number the reader can
	 * see under a column and a number a formula reads about the same table must
	 * be counting the same rows.
	 *
	 * **A computed column is readable here where `total` still refuses one**,
	 * and the refusal was never "a derived value cannot be summed": a `total` is
	 * a declarative flag with no scope to evaluate a formula in and no lazy path
	 * to a finished sheet. This has both — it is handed a resolver bound to the
	 * finished sheet, inside the row table's own guard — which is exactly what
	 * `compute` gave a declared row.
	 *
	 * Like `scopeValues`, this reads the note rather than the draft: a formula
	 * elsewhere on the sheet catches up on commit, when the sheet rebuilds.
	 */
	scopeRows(data, config): RowsSource | undefined {
		// A misconfigured card publishes nothing, on the same argument its names
		// go unpublished: summing rows the card is refusing to show would be a
		// number derived from a configuration nobody has agreed to yet.
		if (configError(config) !== null) return undefined;
		const views = rowViews(config, data);
		return (resolve) => views.map((view) => rowValues(config, data, view, resolve));
	},

	/**
	 * The enrolments this card's rows declare in the layout's modifier
	 * definitions (SPEC §5).
	 *
	 * **A modifier row publishes nothing**, and that sentence is what the whole
	 * design rests on. `<id>.<name>` is a fixed-row mechanism and stays one, so
	 * `inventory.Dagger` still fails as an unknown name — what reaches the sheet
	 * is a number under the *target's* name, which the target's own component
	 * publishes. That is why this works for rows the layout does not know about:
	 * it never needs a name for the row.
	 *
	 * **A push is one part, as raw text.** The cell hands over each part's own bytes
	 * and the row hands over its own scope; the formula layer decides whether that
	 * text is a definition's name or an effect this row spells out, then resolves it.
	 * So nothing here holds an operator, a bonus type, an amount column or a failure
	 * channel, and **`scopeModifiers` cannot know what a definition is** — which is
	 * why a cell holding two tiers needs no rule here beyond the split.
	 *
	 * That sentence is about *this member*. The form one press away knows a modifier
	 * has five slots, because it writes them; it still resolves none of them.
	 *
	 * Built from the same `rowViews` / `rowValues` helpers `render` and `scopeRows`
	 * use, so a definition's amount is evaluated against the same account of the
	 * row the cells on screen are — including its computed columns.
	 *
	 * Undefined where there is nothing to enrol — no modifier column, or a
	 * configuration this card is refusing to draw — on `scopeRows`' own argument:
	 * filling a slot from a configuration nobody has agreed to yet would be a
	 * number derived from an error.
	 */
	scopeModifiers(data, config): ModifierSource | undefined {
		if (configError(config) !== null) return undefined;
		/** Every modifier column, in column order, which is declaration order. */
		const enrolling = (config.columns ?? []).filter(
			(column) => columnType(column) === 'modifier',
		);
		if (enrolling.length === 0) return undefined;
		const views = rowViews(config, data);

		return (resolve) => {
			const pushes: ModifierPush[] = [];
			for (const view of views) {
				const cell = storedCells(data, view);
				/** Built once per row, however many cells on it enrol. */
				let row: RowValues | null = null;
				for (const column of enrolling) {
					/*
					 * **One cell, as many parts as it holds**, split by `cellParts`:
					 * `;` separates them, each part is trimmed, an empty part is
					 * dropped and a repeated *name* is one enrolment. A blank cell
					 * pushes nothing and is not an error — on an inventory with a
					 * modifier column, most rows are blank.
					 *
					 * The loop below is unchanged in shape, which is the point: three
					 * parts in one cell yield three pushes over one `RowValues`,
					 * typed and named alike, so nothing about `ModifierPush` or
					 * `ModifierSource` moved for the second tier beyond the member's
					 * name.
					 */
					for (const part of cellParts(cell(column) ?? '')) {
						row ??= rowValues(config, data, view, resolve);
						pushes.push({
							part,
							// The card's own name, which is the half a row label cannot
							// carry: two modifier tables on one sheet can each hold a
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
			/** One class, or several separated by spaces. */
			className: string,
			parent: HTMLElement,
			text?: string,
		): HTMLElementTagNameMap[K] => {
			const el = doc.createElement(tag);
			/*
			 * **Split, because `classList.add` throws on a space** — and the trap is
			 * invisible until the harness draws it. A `DOMException` here aborts the
			 * whole render mid-row, so a call site passing two classes drew one cell
			 * and then stopped; `src/test/obsidian-stub.ts` accepts the space, so the
			 * suite stayed green while the sheet lost every row below the first. That
			 * is `docs/UI.md` §11's kinder instrument, and the cheapest fix is to
			 * make the helper mean what its callers already read it as.
			 */
			for (const one of className.split(' ')) {
				if (one !== '') el.classList.add(one);
			}
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

		if (showsOwnLabel(config, context)) {
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
		 * Which delete control is armed, one register per card rather than per
		 * row: arming a second control has to stand the first one down.
		 */
		const armedRow = armRegister();

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
			// This branch is the stacked one: unfocused, the input's text is
			// transparent under the link layer, and its spelling marks would not be.
			spellcheckWhileFocused(input);
			const layer = element('div', 'sheetsmith-table-link-layer', stack);
			paintLinkedText(layer, raw, { link: context.link, clipping: CELL_CLIPPING });
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
			// The gesture is `interaction/arm-to-confirm.ts`'s, with the class
			// names, the live region and the write staying here: a module beside
			// the components must not know a table exists (PATTERNS §1).
			bindArmToConfirm({
				button,
				row: tr,
				armedClass: 'sheetsmith-table-remove-armed',
				rowClass: 'sheetsmith-table-row-arming',
				named: `Delete ${named}`,
				announce: (said) => {
					status.textContent = said;
				},
				commit: () => context.onChange({ rows: {}, removed: [at] }),
				register: armedRow,
				doc,
			});
		};

		views.forEach((rowView) => {
			const rowIndex = rowView.declared;
			const stored =
				rowView.at === null ? {} : (data?.rows[rowView.at]?.cells ?? {});
			const tr = element('tr', '', body);

			/** What is being typed in this row's cells, by column key. */
			const drafts = new Map<string, string>();
			/**
			 * This row's text for a column: what is being typed if anything is,
			 * and what the note holds otherwise. One reader, because a computed
			 * cell and a column total must not disagree about what a row says.
			 */
			const cellText = (column: TableColumn): string | undefined =>
				drafts.get(column.key) ?? stored[column.key.toLowerCase()];
			counted.push({ label: rowView.label, cell: cellText });
			/**
			 * The row's names as a computed cell sees them, rebuilt per
			 * keystroke from the drafts so a value moves while the user is
			 * still typing the bonus that changed it. The same construction a
			 * published row reads from the note.
			 */
			const scopeNow = (): Record<string, FieldValue> =>
				rowScope(config, rowIndex, cellText, context.resolveField);
			/**
			 * This row as the *note* gives it: its stored cells, its declared
			 * values, and its computed columns over the top.
			 *
			 * The same helper `scopeRows` and `scopeModifiers` use, so a definition
			 * resolved here and a number published elsewhere cannot disagree about
			 * what the row says. Built at most once per row and shared by every cell
			 * that needs it — a row with two filled modifier cells used to build it
			 * twice — and from the note rather than the drafts, which is the rule the
			 * breakdown already follows: a published name reads the note.
			 */
			let noteValues: RowValues | null = null;
			const noteRow = (): RowValues =>
				(noteValues ??= rowValues(config, data, rowView, context.resolveField));

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
				const scope = scopeNow();
				const results = computed.map(({ column, index }) => {
					if (column.formula === undefined) return null;
					// A formula reading a cell that is still blank in a text
					// column has nothing to work with; one computed entirely
					// from elsewhere resolves regardless. The name this cell
					// publishes goes with it, so `mod.self` here means the same
					// slot the published name reads — and 0 on a row with no key,
					// which is what keeps a column showing numbers down every row
					// rather than "?" on half of them.
					return context.resolveField(
						`columns.${index}.formula`,
						scope,
						publishedName(config, rowView, index),
					);
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
										publishedName(config, rowView, index),
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
					/*
					 * What has been pushed at the name this cell publishes, where
					 * it publishes one. **It joins the popover the cell already
					 * opens** rather than adding a control beside it: this cell has
					 * carried a second door onto its own formula since computed
					 * columns shipped, and a breakdown is another answer to the
					 * same question the tap already asks (UI §9).
					 */
					const name = publishedName(config, rowView, index);
					/*
					 * **A column with no formula has no number to have been
					 * modified**, and asking for the breakdown at all is what keeps
					 * that one fact rather than two coordinated guards.
					 * `modifier-breakdown.ts` states the rule: the mark and the
					 * text are the same fact, so asking for one is asking whether
					 * there is the other. Without this the cell drew "—" under a
					 * dotted underline with `cursor: help`, no title and no press —
					 * a mark promising an answer that did not exist, on a column
					 * `configError` accepts and `scopeValues` still publishes a
					 * name for.
					 *
					 * The push itself is inert either way, since the name resolves
					 * to nothing. That it is *offered* as a target at all is Risk 2
					 * in the feature spec — the accepting set is coarse at the
					 * component, so the row's stray line cannot fire for it.
					 */
					/*
					 * The number this cell publishes, from the note, so the total
					 * line under an override *is* the cell's own value rather than a
					 * second answer to what the override came to
					 * (`modifier-breakdown.ts`). Through `noteRow` and not through a
					 * fresh evaluation, so the cell, the published name and the
					 * breakdown are one account of the row.
					 */
					const shown =
						name === undefined || column.formula === undefined
							? null
							: noteRow().values[column.key];
					const pushed =
						name === undefined || column.formula === undefined
							? null
							: modifierBreakdown(
									context.modifiers?.breakdown(name),
									typeof shown === 'number' ? shown : null,
									// This breakdown is read inside a table, so every
									// line names its component however few there are:
									// an unqualified row name here reads as one of the
									// rows the reader is looking at.
									true,
								);
					if (pushed !== null) {
						cell.classList.add(MODIFIED_CLASS);
						/*
						 * The same text where there is no pointer, in a span inside
						 * the cell — which is this component's own idiom for it, the
						 * one a hidden column heading and the delete column's name
						 * already use, and it needs no ARIA wiring at all: a screen
						 * reader reading the cell reads its contents, and the table
						 * structure has already named it from its own `th` and the
						 * row's.
						 *
						 * **The card could not do it this way and this cannot do it
						 * the card's way**, which is why there are two spellings of
						 * one rule rather than a shared painter. A card has a field
						 * to hang `aria-describedby` on and no cell to be read as
						 * part of; this cell has no field of its own — pointing the
						 * row's Training input at a breakdown would describe the
						 * wrong number — and is read as part of its `td`. What is
						 * shared is the text, which is the thing that must not
						 * differ, and one builder already owns it.
						 *
						 * Built once with the cell rather than repainted: a
						 * published name reads the note, not the draft, so the
						 * breakdown is fixed for the life of a render where the
						 * value above it moves per keystroke.
						 *
						 * **Still not a tab stop**, and that half stays the computed
						 * cell's inherited gap: making a read-only value focusable
						 * would add a tab stop per modified cell — eighteen of them
						 * on a skills card — which is a change to this component's
						 * keyboard model rather than to this feature.
						 */
						element('span', 'sheetsmith-sr-only', td, pushed);
					}
					if (column.formula !== undefined) {
						// The title says this on a desktop and says nothing on a
						// phone. A read-only cell has no other use for a tap, so
						// the tap is free to mean "why this number?" — which is
						// the question, and the one the failure message answers.
						//
						/*
						 * **`mod.self` reaches a player here, and it stays.** This
						 * feature is why a computed column's formula carries the token
						 * at all, so a reader now meets it one line above a breakdown
						 * that was deliberately rewritten to avoid it — which looks
						 * like the same defect and is not.
						 *
						 * A breakdown line is a sentence *this plugin composes*, so it
						 * owes the reader's vocabulary. A formula line is a
						 * **quotation of the author's own text**, and rewriting a
						 * quotation is the worse failure: the string here would stop
						 * matching the string in the layout editor, and a reader
						 * comparing the two to work out why a number is wrong could no
						 * longer match them. It is the rule
						 * `.sheetsmith-field-problem code` already follows — the
						 * offending text in the field's own font, so the eye can match
						 * the two rather than translate between them.
						 *
						 * The residue is real and is recorded rather than chased:
						 * `docs/UI.md` §12. `ability` and `Training` at least name
						 * things visible on the sheet; `mod.self` names nothing a
						 * player can see.
						 */
						cell.classList.add('sheetsmith-table-askable');
						cell.addEventListener('click', () => {
							const said = cell.getAttribute('title');
							if (said === null) {
								if (pushed !== null) showPopover(cell, pushed);
								return;
							}
							showPopover(cell, pushed === null ? said : `${said}\n\n${pushed}`);
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

				/*
				 * A modifier cell: **one glyph and nothing else, however many parts
				 * the cell holds** (SPEC §2, §4.2).
				 *
				 * `hideHeading` is what makes the column draw as the glyph alone,
				 * and this is the second good case for it after the level ring — the
				 * glyph names itself, and a word above it several times its width
				 * sets the column's width against a control that needs none of it.
				 *
				 * **One glyph per row, because one row is one item and an item should
				 * read as one mark.** The cell holds a list, so a row applying two
				 * changes draws one bolt rather than two: two bolts say "two things"
				 * about a row whose reader is asking one question, which is
				 * `docs/UI.md` §9's two-answers-to-one-question in the smallest space
				 * available. What carries the rest is words, at three depths from one
				 * builder so they cannot disagree — the accessible name's count, the
				 * `title`'s one line each, and the form's own lines.
				 *
				 * **The control is a `<button>` and the glyph is the whole of it**,
				 * with one gesture: a press opens the form, on a pointer and under a
				 * finger alike, and Enter or Space opens it from the keyboard. The
				 * `title` is the zero-press shortcut a pointer happens to have, which
				 * is not a duplicate — hover to read, press to change.
				 * `aria-haspopup` is `"dialog"` rather than `"menu"`, because what
				 * opens is a form and a screen reader should say so.
				 *
				 * **Three shapes for four states**, because `docs/UI.md` §6 refuses a
				 * mark whose only channel is fill strength:
				 *
				 * - no part: `plus`, faint. The empty cell is the entry point for
				 *   adding one and an unmarked entry point is a dead end (§7 refuses
				 *   a hover-only affordance and a phone has no hover) — the delete
				 *   glyph one column over carries the same argument. `plus` and not a
				 *   fainter `zap`, or "none" against "applying" would be a difference
				 *   of fill strength alone.
				 * - any applying: `zap`. **Including a row where one applies and one
				 *   does not**, because the glyph is about the row: a row changing
				 *   something is changing something. Deliberately not a fourth shape
				 *   for "some" — a partial-state glyph is a mark most readers meet
				 *   once and could not name, and a count is words the moment anyone
				 *   asks for it.
				 * - filled, none applying: `zap-off`, which now has **six** reasons —
				 *   a false condition; the layout declares no modifier of that name;
				 *   an override lost or a larger bonus of its type took the slot; an
				 *   amount will not resolve; a target's own formula reads no
				 *   modifier; and a typed effect with no amount yet.
				 *
				 * **A stray part is rendered, not corrected** — carried as a line of
				 * its own in the form, with the row reading `zap-off` where nothing
				 * else on it applies. §4.2's rule for a Card's stray option, read per
				 * part rather than per cell: rewriting it would be a layout edit
				 * deleting character data, which Constraint 4 and §10 both refuse.
				 */
				if (type === 'modifier') {
					const cell = element('span', 'sheetsmith-table-modifier-cell', td);
					const button = element(
						'button',
						'sheetsmith-table-modifier-button',
						cell,
					);
					button.type = 'button';
					const glyph = element(
						'span',
						'sheetsmith-table-modifier-glyph',
						button,
					);
					glyph.setAttribute('aria-hidden', 'true');

					/*
					 * **Two lists, and the difference between them is §6's "the collapse
					 * is a read and never a write".**
					 *
					 * `stored` is every part the cell holds, so every index the form
					 * addresses is an index into the note and a commit re-joins the
					 * parts the reader did not touch *as their own stored text*.
					 * Building the write list from the collapsed read instead deleted a
					 * repeated name on any unrelated edit — silently, because a repeat
					 * was one enrolment either way and no number moved.
					 *
					 * `enrolled` is what the row is *doing*: a repeated name is one
					 * enrolment, exactly as `scopeModifiers` pushes it, so the glyph,
					 * the `title` and the accessible name's count all read this one and
					 * agree with the arithmetic.
					 *
					 * The residue is that a cell holding one name twice draws three
					 * lines in the form and says "2 applying" — two true answers to two
					 * different questions, which is the same shape §3's tie already
					 * settles. It is reachable only by a hand-edited typo, and the
					 * alternative is deleting bytes.
					 */
					const stored = storedParts(raw);
					const enrolled = cellParts(raw);
					/*
					 * What each part comes to on this row, from the note rather than
					 * from the drafts: a part is resolved against the row a formula
					 * elsewhere reads, so the glyph and the number over the card it
					 * changes cannot say different things. Built once with the cell for
					 * the same reason the breakdown is.
					 */
					const ask = (part: string) =>
						context.modifiers?.outcome(part, noteRow()) ?? null;
					const applied = rowModifiers(enrolled, ask);
					const applying = applied.filter(
						(one) => one.outcome?.applies === true,
					).length;
					if (enrolled.length === 0) {
						cell.classList.add('sheetsmith-table-modifier-empty');
					}
					setIcon(
						glyph,
						enrolled.length === 0 ? 'plus' : applying > 0 ? 'zap' : 'zap-off',
					);

					/*
					 * **The state is in the accessible name, not only in the paint**
					 * (`docs/UI.md` §6), in the level ring's own `${label}: ${state}`
					 * shape rather than a fifth way of saying a control's state. The
					 * parts are not on screen as words, so `aria-label` is the right
					 * carrier here rather than a `title` addition: the visible mark is
					 * a glyph.
					 */
					button.setAttribute('aria-label', modifierRowName(label, applied));
					const said = modifierRowText(applied);
					if (said !== null) button.setAttribute('title', said);
					button.setAttribute('aria-haspopup', 'dialog');
					button.setAttribute('aria-expanded', 'false');

					/**
					 * Which cell this panel belongs to, so a rebuild can hand it back.
					 *
					 * The component's id, the row's own position in the note and the
					 * column's key: the three things that identify a cell across a
					 * re-render where the layout has not changed, which is
					 * `view/cell-focus.ts`' own bargain read on a floating surface.
					 */
					const panelKey = `${config.id}:${rowView.at ?? rowView.label}:${column.key}`;

					/**
					 * Rewrite the cell with exactly one part replaced, added or
					 * dropped.
					 *
					 * **Every other part is re-joined as its own stored text, byte for
					 * byte** — Constraint 3's one new rule. The form hands back the
					 * list it was given with one entry changed, so nothing here
					 * re-spells a part the reader did not touch: a canonical join over
					 * the whole cell would quietly canonicalise the others as a side
					 * effect of an unrelated edit, which §10 forbids.
					 */
					const put = (next: readonly string[]) => {
						const text = spellParts(next);
						drafts.set(column.key, text);
						recompute(true);
						commit(text);
					};

					/** Fill an open panel's body with the form, and place it. */
					const fill = (panel: AnchoredPanel<ModifierFormState>) => {
						renderModifierForm(panel.body, panel.state, {
							label: rowLabel(rowView.label),
							// The stored list, never the collapsed one: the form's
							// indices are indices into the note.
							parts: stored,
							outcome: ask,
							definitions: context.modifiers?.definitions ?? [],
							targets: context.modifiers?.targets ?? [],
							published: context.modifiers?.published ?? [],
							bonusTypes: context.modifiers?.bonusTypes ?? [],
							// The one import from `obsidian` in this folder, passed on
							// rather than taken again: the allowlist stays one name long.
							icon: (into, name) => setIcon(into, name),
							onCommit: put,
							onPromote: (name, effect) =>
								context.modifiers?.promote(name, effect) ??
								Promise.resolve({
									error: 'This sheet cannot save a modifier to its layout.',
								}),
							announce: (text) => {
								status.textContent = text;
							},
							onResize: () => panel.place(),
						});
						panel.place();
					};

					/*
					 * **The panel stays open across every commit**, which is the best
					 * thing this surface buys over the menu it replaced. A commit
					 * re-renders the sheet, so this button is a *new* button and the
					 * panel — which lives on `document.body` — is handed to it with the
					 * reader's own posture intact.
					 */
					const held = reanchorAnchoredPanel<ModifierFormState>(
						panelKey,
						button,
					);
					if (held !== null) {
						button.setAttribute('aria-expanded', 'true');
						fill(held);
					}

					button.addEventListener('click', () => {
						if (openAnchoredPanelKey() === panelKey) {
							// A second press on the same glyph closes it, which is what
							// a control carrying `aria-expanded` owes.
							held?.close();
							return;
						}
						const panel = showAnchoredPanel<ModifierFormState>(
							button,
							`Modifiers on "${rowLabel(rowView.label)}"`,
							panelKey,
							modifierFormState(stored),
							() => {
								button.setAttribute('aria-expanded', 'false');
							},
						);
						button.setAttribute('aria-expanded', 'true');
						fill(panel);
						/*
						 * Focus moves to the first control on open, which is the
						 * platform's own contract for a `dialog` and is what makes
						 * `aria-haspopup="dialog"` true rather than decorative.
						 *
						 * Unless the form has already placed it, which it does on a row
						 * with no parts: that opens straight into a new effect with
						 * **Changes** focused, and the first control is the `Modifier`
						 * select one line above it. Two answers to "where does focus
						 * go" would make the common case land on the wrong field.
						 */
						if (!panel.body.contains(doc.activeElement)) {
							focusFirstControl(panel);
						}
					});
					return;
				}

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
						: typedValue(column, raw) === true
							? 1
							: 0;
					// The view rebuilds on a change, but a write that produces
					// the same file does not, and the control must never be
					// left showing a level the user has already moved off.
					let repaint = () => undefined as void;

					/** What the note stores for a level: a count, or yes/no. */
					const stateOf = (level: number) =>
						graded ? String(level) : flagText(level > 0);
					/** What the level is called, to a reader and to a listener. */
					const nameOf = (level: number) =>
						graded ? levelName(column, level) : flagReading(level > 0);

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

					const button = element('button', 'sheetsmith-level-ring', td);
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
						// fired at every pass, as the card's label learned.
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
						// The same undo the card has, and it was silent
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
						const bounded = type === 'number' ? boundedText(next, column) : next;
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
			 * `linked-text.ts`. What stays parked is the `link` column *type*
			 * (§12): a column whose value is always a note, with a picker and a
			 * resolved state as data, which is a different feature.
			 */
			const renderName = () => {
				const cell = element('th', 'sheetsmith-table-name', tr);
				cell.setAttribute('scope', 'row');
				if (!rowView.owned || rowView.at === null) {
					// A declared row's name is static text from the layout, so it
					// needs the display alone and no field to stack it over.
					paintLinkedText(cell, rowView.label, {
						link: context.link,
						clipping: CELL_CLIPPING,
					});
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
