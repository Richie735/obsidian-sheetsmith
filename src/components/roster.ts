/*
 * Roster — a set of stats and the rows that hang off them, drawn as one
 * grouped table (SPEC §4.2, `docs/features/stat-with-dependants.md`). Covers
 * D&D's 2024 ability blocks, a Blades playbook's attributes and actions, and
 * any list of rated things read under the values that govern them.
 *
 * **It is not a Card set beside a Table, drawn smaller.** That arrangement —
 * one component per stat, one `##` section per stat, the grouping carried by
 * the layout's own structure — is the settled "stored" reading the model
 * question rejected: it buys nothing, because a component holding one stat
 * still has to be placed once per stat and most of the authoring cost
 * survives, and it cannot satisfy Constraint 4 by construction the way this
 * does — regrouping a row here is a layout edit touching no character note.
 * This component holds **many** stats, one section, one flat ungrouped table
 * in the file, with the grouping computed from the layout every render.
 *
 * **It is not the six-up (a Group of Groups, each a Card beside a Table)
 * either**, and that arrangement is not withdrawn: it is the only one where
 * each pair carries its own configuration, and this is the only one where the
 * relation is declared once — one `columns[]`, one `stat`/`self` pair — rather
 * than written out per stat. Both stand; a sixth stat needing its own column
 * set is the six-up, and eighteen skills sharing one column set is this.
 *
 * **The band head is one line of the table, not a card floating above one.**
 * `docs/UI.md` §9: "a fourth kind of panel beside a row of cards reads as
 * loose chrome" — a card surface inside a component that already has a table's
 * own box would be exactly that. So a band head is a `<tr>` of this table,
 * spanning every column, carrying the stat's name at the region rank
 * (`.sheetsmith-group-heading`), its stored value on the card's own field
 * clothes (`.sheetsmith-card-input`) and its reading at the card's headline
 * weight (`.sheetsmith-card-derived`) — borrowed classes, not a card wrapper.
 *
 * **Both directions are carried by formulas, never by a mode switch.** Inside
 * a row's own scope this publishes `stat`, worth what that row's band head
 * shows; inside a stat's own formula fields it publishes `self`, that stat's
 * own rows for an aggregate's first argument. A roster writing both at once —
 * a row reading `stat` while that same stat's `derived` aggregates `self` over
 * a column that reads `stat` — is a ring, refused at both ends
 * (`formula/expression.ts`'s `self` guard).
 *
 * **No `openRows`, no `modifier`/`target` column, no `total`, no per-row
 * `values`, no reset.** Every stat-keyed list surveyed is layout-declared, a
 * declared skill pushes no modifier of its own, `stat` already does the job a
 * per-row expression existed for, and nothing a roster holds is restored by an
 * event. See the feature spec's "Deliberately not doing" for the full
 * argument against each.
 */

import { isName, referencesName } from '../formula/expression';
import { coerceValue } from '../formula/resolve';
import { readFenced, writeFenced } from '../parse/fenced';
import { claimRows } from '../parse/row-claims';
import { MarkdownTable, readTable, writeTable } from '../parse/table';
import { displayText } from '../parse/wikilink';
import { bindEditable, UNRESOLVED_DELAY } from '../interaction/editable';
import { bindLongPress, showPopover } from '../ui/popover';
import { revealWhenTruncated } from '../ui/truncation';
import { ColumnType, COLUMN_TYPES } from './column-types';
import { effectiveReading, sameNumber } from './effective-value';
import { fencedLinkRefusal } from './fenced-link';
import {
	levelCount,
	levelName,
	levelOf,
	paintLevelRing,
} from './level-ring';
import { paintLinkedText } from './linked-text';
import { MODIFIED_CLASS, modifierBreakdown } from './modifier-breakdown';
import { sampleFlag, sampleNumber, sampleSeed, sampleText } from './sample-values';
import { flagReading, flagText, isFlagSet } from './stored-flag';
import { boundedText, formatComputed, typedValue, typeOf } from './typed-value';
import {
	ComponentConfig,
	ComponentDefinition,
	FieldResolver,
	FieldValue,
	ReadResult,
	RowsSource,
	RowValues,
	ScopeEntry,
	ScopeValues,
	showsOwnLabel,
} from '../types';

/** Column kinds a roster's rows may take: character data, minus a name's cell. */
const ROSTER_COLUMN_TYPES: readonly ColumnType[] = COLUMN_TYPES.filter(
	(type) => type !== 'text' && type !== 'modifier',
);

export interface RosterColumn {
	key: string;
	type?: ColumnType;
	name?: string;
	hideHeading?: boolean;
	min?: number;
	max?: number;
	levels?: string[];
	input?: 'select';
	/** Read-only columns only: the row's own cells by column key, its stat as
	 * `stat`, and anything else on the sheet by component id. */
	formula?: string;
	signed?: boolean;
	/**
	 * Give every row carrying a `key` a name of its own, answering with this
	 * column's cell on that row (SPEC §5, Table's own mechanism).
	 */
	publish?: boolean;
}

export interface RosterRow {
	label: string;
	/** The stat this row hangs off: a key into this component's own `stats`. */
	stat?: string;
	/** The name a formula reads this row's published value by, as
	 * `<component id>.<key>`. Only meaningful with a published column. */
	key?: string;
}

export interface RosterStat {
	key: string;
	name?: string;
}

export interface RosterConfig extends ComponentConfig {
	type: 'roster';
	stats?: RosterStat[];
	/** One formula computed per stat, reading its stored value as `value` and
	 * its own rows as `self`. */
	derived?: string;
	/** What a stat's value field reads once modifiers are applied. */
	effective?: string;
	hideValue?: boolean;
	signed?: boolean;
	rows?: RosterRow[];
	columns?: RosterColumn[];
	rowHeader?: string;
	namePosition?: number;
	hideLabel?: boolean;
}

export interface RosterRowData {
	/** The first cell's text, with the note's `\|` read back as `|`. */
	name: string;
	cells: Record<string, string>;
}

export interface RosterData {
	/** The fence's own entries by stat key. A write touches only the keys it
	 * is given. */
	stats?: Record<string, string>;
	/** Table rows by their position in the note, 0 first. Present whenever
	 * the note holds a table; a write touches only the positions it names. */
	rows?: Record<number, Partial<RosterRowData>>;
	/** Declared rows to append, in order — a row the note has never held. */
	added?: RosterRowData[];
}

const DEFAULT_ROW_HEADER = 'Name';

/** What a row with no readable name is called, wherever something names one. */
const UNNAMED_ROW = 'Unnamed row';

/**
 * As a reader sees it, never as the file spells it. A cell may hold a
 * wikilink, and an accessible name reading "[[Sunblade|sword]]" is the file's
 * syntax read aloud (`table.ts`'s own `rowLabel`).
 */
function rowLabel(label: string): string {
	const named = displayText(label).trim();
	return named === '' ? UNNAMED_ROW : named;
}

/** What clipping means in a name cell, for the shared linked-text painter. */
const CELL_CLIPPING = {
	soleLinkClass: 'sheetsmith-roster-link-only',
	reveal: revealWhenTruncated,
};

/** Columns whose values live in the note. Computed ones are never stored. */
function storedColumns(config: RosterConfig): RosterColumn[] {
	return (config.columns ?? []).filter((column) => typeOf(column) !== 'computed');
}

/** The note's header row: the row-name column, then every stored column. */
function headers(config: RosterConfig): string[] {
	return [
		(config.rowHeader ?? '').trim() || DEFAULT_ROW_HEADER,
		...storedColumns(config).map((column) => column.key),
	];
}

/** This component's own stats, indexed by key, in declared order. */
function statList(config: RosterConfig): RosterStat[] {
	return config.stats ?? [];
}

/** One row as the card draws it: which band it is in, and where it sits. */
interface RowView {
	row: RosterRow;
	/** Its position in `config.rows`, for row-scope purposes. */
	declared: number;
	/** Its position in the note's table, or null where the note has no row. */
	at: number | null;
}

/**
 * Every row the card draws, band by band, in declared order within each band.
 *
 * `parse/row-claims.ts`'s shared rule, over this component's own stored
 * names — the same claim a Table makes over its own, so a note read through
 * either agrees about which line a declared row is (`docs/PATTERNS.md` §1).
 *
 * **Claimed in `config.rows`' own order, then reordered by band.** The claim
 * itself does not depend on which order the views come back in — it is a
 * position match against the note, made once — but `scopeValues`, `scopeRows`
 * and `render` all owe the same order to each other (`count(<id>, …)` and the
 * reader looking at the table must count the same rows the same way), and a
 * layout that writes its rows out of band order must not make that three ways
 * of disagreeing. `Array.prototype.sort` is stable since ES2019, so a band's
 * own declared order survives the regrouping.
 */
function rowViews(config: RosterConfig, noteNames: readonly string[]): RowView[] {
	const claims = claimRows(
		(config.rows ?? []).map((row) => row.label ?? ''),
		noteNames,
	);
	const views = (config.rows ?? []).map((row, index) => ({
		row,
		declared: index,
		at: claims.declared[index] ?? null,
	}));
	const bandOf = new Map(
		statList(config).map((stat, index) => [(stat.key ?? '').trim(), index]),
	);
	const bandIndex = (view: RowView): number =>
		bandOf.get((view.row.stat ?? '').trim()) ?? statList(config).length;
	return views
		.map((view, order) => ({ view, order }))
		.sort((a, b) => bandIndex(a.view) - bandIndex(b.view) || a.order - b.order)
		.map(({ view }) => view);
}

/** Row names by note position. Read fills every position. */
function rowNames(data: RosterData | null): string[] {
	const rows = data?.rows ?? {};
	const positions = Object.keys(rows).map(Number);
	const count = positions.length === 0 ? 0 : Math.max(...positions) + 1;
	const names: string[] = [];
	for (let index = 0; index < count; index++) names.push(rows[index]?.name ?? '');
	return names;
}

/** This row's text for a column, from the note. */
type CellReader = (column: RosterColumn) => string | undefined;

function storedCells(data: RosterData | null, view: RowView): CellReader {
	return (column) =>
		view.at === null ? undefined : data?.rows?.[view.at]?.cells?.[column.key.toLowerCase()];
}

/**
 * The names a row's computed columns resolve against: every stored cell by
 * column key, then `stat` — what this row's own band head shows.
 *
 * The row-view assembly duplicated from `table.ts`'s `rowScope`, on the
 * second-consumer terms `docs/features/stat-with-dependants.md` argues: the
 * two differ in the one way that matters, this row's `stat`/`stat.value`
 * rather than a row's own named expressions, so a shared module would be a
 * policy shared and its two applications duplicated regardless. A
 * registry-wide guard (`roster.test.ts`, `table.test.ts`) asserts both build
 * a row's names from stored cells layered under computed columns alike.
 */
function rowScope(
	config: RosterConfig,
	view: RowView,
	cell: CellReader,
	statReading: (key: string) => { value: FieldValue | undefined; reading: FieldValue | null },
): Record<string, FieldValue> {
	const scope: Record<string, FieldValue> = {};
	for (const column of config.columns ?? []) {
		if (typeOf(column) === 'computed') continue;
		scope[column.key] = typedValue(column, cell(column));
	}
	const statKey = (view.row.stat ?? '').trim();
	if (statKey !== '') {
		const { value, reading } = statReading(statKey);
		if (value !== undefined) scope['stat.value'] = value;
		if (reading !== null) scope.stat = reading;
	}
	return scope;
}

/** The name this column's cell on this row publishes, where it publishes one. */
function publishedName(
	config: RosterConfig,
	view: RowView,
): string | undefined {
	const key = (view.row.key ?? '').trim();
	if (key === '') return undefined;
	return `${config.id}.${key}`;
}

/**
 * One row as an aggregate reads it, layering computed columns over the stored
 * cells and `stat`.
 */
function rowValues(
	config: RosterConfig,
	view: RowView,
	cell: CellReader,
	statReading: (key: string) => { value: FieldValue | undefined; reading: FieldValue | null },
	resolve: FieldResolver,
): RowValues {
	const stored = rowScope(config, view, cell, statReading);
	const values: Record<string, FieldValue> = { ...stored };
	(config.columns ?? []).forEach((column) => {
		if (typeOf(column) !== 'computed') return;
		const value = resolve(
			`columns.${columnIndex(config, column)}.formula`,
			stored,
			publishedNameFor(config, column, view),
		);
		if (value !== null) values[column.key] = value;
	});
	return { label: rowLabel(view.row.label), values };
}

function columnIndex(config: RosterConfig, column: RosterColumn): number {
	return (config.columns ?? []).indexOf(column);
}

/** The name a computed column publishes on this row, where the column that
 * accepts `publish` is this one and the row carries a key. */
function publishedNameFor(
	config: RosterConfig,
	column: RosterColumn,
	view: RowView,
): string | undefined {
	if (column.publish !== true) return undefined;
	return publishedName(config, view);
}

/**
 * Configuration errors that make the roster unreadable rather than merely
 * empty. Reported on this component alone, per SPEC §10.
 */
function configError(config: RosterConfig): string | null {
	const stats = statList(config);
	const statKeys = new Set<string>();
	for (const stat of stats) {
		const key = (stat.key ?? '').trim();
		if (key === '') return 'Every stat needs a key.';
		if (/[:\r\n]/.test(key)) {
			return `The stat "${key}" cannot contain a colon or a line break.`;
		}
		if (statKeys.has(key.toLowerCase())) return `Two stats are both called "${key}".`;
		statKeys.add(key.toLowerCase());
	}

	const columns = config.columns ?? [];
	const seen = new Set<string>();
	let published: string | null = null;
	for (const column of columns) {
		const key = (column.key ?? '').trim();
		if (key === '') return 'Every column needs a key.';
		if (/[|\r\n]/.test(key)) {
			return `The column "${key}" cannot contain a pipe or a line break, because a pipe separates one cell from the next.`;
		}
		if (seen.has(key.toLowerCase())) return `Two columns are both called "${key}".`;
		seen.add(key.toLowerCase());
		if (column.levels !== undefined && column.levels.length < 2) {
			return `The column "${key}" needs at least two level names, starting with the one for none.`;
		}
		if (column.publish === true) {
			if (published !== null) {
				return `The columns "${published}" and "${key}" are both published per row, and only one can be: a row publishes as "${config.id}.<row key>", and one name cannot mean two cells.`;
			}
			published = key;
			if (typeOf(column) === 'text' || typeOf(column) === 'modifier') {
				return `The column "${key}" cannot be published per row.`;
			}
		}
	}
	const rowHeader = ((config.rowHeader ?? '').trim() || DEFAULT_ROW_HEADER).toLowerCase();
	if (seen.has(rowHeader)) {
		return `A column is called "${config.rowHeader ?? DEFAULT_ROW_HEADER}", which is already the name column's heading.`;
	}

	const labels = new Set<string>();
	const keys = new Map<string, string>();
	for (const row of config.rows ?? []) {
		const label = (row.label ?? '').trim();
		if (label === '') return 'Every row needs a name.';
		if (/[|\r\n]/.test(label)) return `The row "${label}" cannot contain a pipe or a line break.`;
		if (labels.has(label)) return `Two rows are both called "${label}".`;
		labels.add(label);

		const stat = (row.stat ?? '').trim();
		if (stat === '' || !statKeys.has(stat.toLowerCase())) {
			return `The row "${label}" names a stat that is not declared above. Choose one of this roster's own stats, or add the stat it should hang off.`;
		}

		const key = (row.key ?? '').trim();
		if (key === '') continue;
		if (!isName(key)) {
			return `The row "${label}" cannot publish as "${key}", because a row key is a name a formula reads — letters, digits and underscores, not starting with a digit. It is refused rather than rewritten, so rename it or clear it.`;
		}
		if (statKeys.has(key.toLowerCase())) {
			return `The row "${label}" publishes as "${key}", which is already a stat's key on this roster, and both live in "${config.id}.<name>". Rename one of them.`;
		}
		if (published === null) {
			return `The row "${label}" publishes as "${key}", but no column is published per row, so the key names no value. Turn on "Publish per row" for the column the name should read, or clear the key.`;
		}
		if (keys.has(key)) {
			return `The rows "${keys.get(key) ?? ''}" and "${label}" both publish as "${key}", and one name cannot mean two rows.`;
		}
		keys.set(key, label);
	}
	return null;
}

/** One stat's own row set, resolvable as `self` inside its `derived`. */
function bandRows(
	config: RosterConfig,
	views: readonly RowView[],
	cellOf: (view: RowView) => CellReader,
	statReading: (key: string) => { value: FieldValue | undefined; reading: FieldValue | null },
	statKey: string,
): RowsSource {
	return (resolve) =>
		views
			.filter((view) => (view.row.stat ?? '').trim() === statKey)
			.map((view) => rowValues(config, view, cellOf(view), statReading, resolve));
}

export const roster: ComponentDefinition<RosterConfig, RosterData> = {
	type: 'roster',
	storage: 'markdown',
	formulaFields: ['derived', 'effective', 'columns.*.formula'],
	configFields: [
		{
			key: 'stats',
			kind: 'entries',
			label: 'Stats',
			entryColumns: [
				{ key: 'key', heading: 'Key' },
				{ key: 'name', heading: 'Name' },
			],
			description:
				'The values the rows hang off, in the order their bands are drawn. A key names the entry in the note and the name a formula reads; renaming one does not move a stored value — the old entry stays in the note under the old key.',
		},
		{
			key: 'derived',
			kind: 'formula',
			label: 'Stat reading',
			description:
				'One formula computed per stat, reading that stat\'s stored value as "value" and its own rows as "self". mod(value) makes a score read as a modifier; count(self, Rating > 0) makes a stat the count of the rows under it.',
		},
		{
			key: 'effective',
			kind: 'formula',
			label: 'Stat value after modifiers',
			description:
				'What a stat\'s value field reads once modifiers are applied, as value + mod.self. Blank leaves the field the stored number. The field goes back to the stored number the moment it is focused, so an arrow key never commits a modified total.',
		},
		{
			key: 'hideValue',
			kind: 'boolean',
			label: 'Hide each stat\'s stored value',
			description:
				'Draws the reading alone, for a stat the character does not type — one computed from the rows under it. Its entry in the note is kept and never written.',
			default: false,
		},
		{
			key: 'signed',
			kind: 'boolean',
			label: 'Show a sign on the reading',
			description:
				'Draws "+3" rather than "3", for a reading that is a bonus rather than a quantity.',
			default: false,
		},
		{
			key: 'rows',
			kind: 'rows',
			label: 'Rows',
			statsField: 'stats',
			description:
				'The rows the layout declares, each naming the stat it hangs off. A row the note does not hold is drawn with blank cells; a note row the layout no longer declares stays in the file, unrendered and untouched.',
		},
		{
			key: 'columns',
			kind: 'columns',
			label: 'Columns',
			columnOptions: {
				types: [...ROSTER_COLUMN_TYPES],
				total: false,
			},
			description:
				'The typed columns every row carries, shared by every band — so adding one is one edit rather than one per stat. A computed column\'s formula reads the row\'s cells by key and its own stat as "stat". Text, modifier and target columns are not offered.',
		},
		{
			key: 'rowHeader',
			kind: 'text',
			label: 'Row heading',
			description: 'The heading over the column holding row names. Defaults to "Name".',
		},
		{
			key: 'namePosition',
			kind: 'number',
			label: 'Name column position',
			description:
				'Where the name column is drawn among the others. The note always holds it first whatever this says, so changing it moves nothing in any file.',
		},
		{
			key: 'hideLabel',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Hide the heading',
			description:
				'Draws the roster with no name over it, for one whose surroundings already say what it is.',
			default: false,
		},
	],

	/*
	 * Two stats with scores from the shared sequence, two rows each, every
	 * key, name and label taken from the config and only the values the
	 * component's own — so the canvas draws a roster with two bands that
	 * differ, and the contract's round trip has one more body to check.
	 */
	sample(config): string {
		if (configError(config) !== null) return '';
		const seed = sampleSeed(config.id);
		const stats = statList(config);
		const statUpdates = new Map<string, string>();
		stats.forEach((stat, index) => {
			const key = (stat.key ?? '').trim();
			if (key === '' || /[:\r\n]/.test(key)) return;
			statUpdates.set(key, String(sampleNumber(seed + index)));
		});
		const fenceBody = statUpdates.size === 0 ? '' : writeFenced(null, statUpdates);

		const nameHeader = headers(config)[0] as string;
		const columns = storedColumns(config);
		const rows = (config.rows ?? []).map((row, index) => {
			const cells = new Map<string, string>([[nameHeader, (row.label ?? '').trim()]]);
			columns.forEach((column, at) => {
				const value = sampleCell(column, index, seed + index * (columns.length || 1) + at);
				if (value !== null) cells.set(column.key, value);
			});
			return cells;
		});
		if (rows.length === 0) return fenceBody;
		return writeTable(fenceBody === '' ? null : fenceBody, headers(config), { added: rows });
	},

	read(body, config): ReadResult<RosterData> {
		const error = configError(config);
		if (error !== null) return { ok: false, error };
		const fenced = readFenced(body);
		if (!fenced.ok) return fenced;
		const parsed = readTable(body);
		if (!parsed.ok) return parsed;
		if (fenced.values === null && parsed.table === null) {
			return { ok: true, data: null };
		}
		const data: RosterData = {};
		if (fenced.values !== null) data.stats = Object.fromEntries(fenced.values);
		if (parsed.table !== null) {
			const { headers: found, rows } = parsed.table;
			const rowsData: RosterData['rows'] = Object.create(null) as RosterData['rows'];
			rows.forEach((cells, index) => {
				const values: Record<string, string> = Object.create(null) as Record<
					string,
					string
				>;
				found.forEach((header, at) => {
					if (at === 0) return;
					values[header.toLowerCase()] = cells[at] ?? '';
				});
				(rowsData as Record<number, Partial<RosterRowData>>)[index] = {
					name: cells[0] ?? '',
					cells: values,
				};
			});
			data.rows = rowsData;
		}
		return { ok: true, data };
	},

	scopeValues(data, config): ScopeValues {
		if (configError(config) !== null) return {};
		const noteNames = rowNames(data);
		const views = rowViews(config, noteNames);

		const named: Record<string, ScopeEntry> = {};

		for (const stat of statList(config)) {
			const key = (stat.key ?? '').trim();
			const raw = data?.stats?.[key];
			named[key] = {
				value: raw,
				display:
					config.derived === undefined
						? undefined
						: {
								field: 'derived',
								scope: { value: raw ?? '' },
								rows: bandRows(
									config,
									views,
									(view) => storedCells(data, view),
									() => ({ value: undefined, reading: null }),
									key,
								),
							},
			};
		}

		for (const column of config.columns ?? []) {
			if (column.publish !== true) continue;
			for (const view of views) {
				const rowKey = (view.row.key ?? '').trim();
				if (rowKey === '') continue;
				const cell = storedCells(data, view);
				if (typeOf(column) !== 'computed') {
					named[rowKey] = { value: typedValue(column, cell(column)) };
					continue;
				}
				named[rowKey] = {
					compute: (resolve) =>
						resolve(
							`columns.${columnIndex(config, column)}.formula`,
							rowScope(
								config,
								view,
								cell,
								statReadingFor(config, data, views, resolve),
							),
							publishedNameFor(config, column, view),
						),
				};
			}
		}

		return Object.keys(named).length === 0 ? {} : { named };
	},

	scopeRows(data, config): RowsSource | undefined {
		if (configError(config) !== null) return undefined;
		const noteNames = rowNames(data);
		const views = rowViews(config, noteNames);
		return (resolve) =>
			views.map((view) =>
				rowValues(
					config,
					view,
					storedCells(data, view),
					statReadingFor(config, data, views, resolve),
					resolve,
				),
			);
	},

	write(data, body, config): string {
		let next = body;
		if (data.stats !== undefined) {
			next = writeFenced(next, new Map(Object.entries(data.stats)));
		}
		if (data.rows !== undefined || data.added !== undefined) {
			const nameHeader = headers(config)[0] as string;
			const cellsFor = (row: Partial<RosterRowData>): Map<string, string> => {
				const known = new Map(
					storedColumns(config).map((column) => [column.key.toLowerCase(), column.key]),
				);
				const update = new Map<string, string>();
				if (row.name !== undefined) update.set(nameHeader, row.name);
				for (const [key, value] of Object.entries(row.cells ?? {})) {
					const header = known.get(key.toLowerCase());
					if (header !== undefined) update.set(header, value);
				}
				return update;
			};

			let table: MarkdownTable | null = null;
			if (next !== null) {
				const parsed = readTable(next);
				if (!parsed.ok) return next;
				table = parsed.table;
			}
			const claims = claimRows(
				(config.rows ?? []).map((row) => row.label ?? ''),
				(table?.rows ?? []).map((cells) => cells[0] ?? ''),
			);
			const claimedAt = new Map<string, number>();
			(config.rows ?? []).forEach((row, index) => {
				const at = claims.declared[index];
				if (at === null || at === undefined) return;
				claimedAt.set((row.label ?? '').trim().toLowerCase(), at);
			});

			const rows = new Map<number, Map<string, string>>();
			const put = (index: number, update: Map<string, string>): void => {
				const already = rows.get(index);
				if (already === undefined) rows.set(index, update);
				else for (const [header, value] of update) already.set(header, value);
			};
			for (const [key, row] of Object.entries(data.rows ?? {})) {
				const update = cellsFor(row);
				if (update.size > 0) put(Number(key), update);
			}

			const added: Map<string, string>[] = [];
			for (const row of data.added ?? []) {
				const label = (row.name ?? '').trim().toLowerCase();
				const at = label === '' ? undefined : claimedAt.get(label);
				if (at !== undefined) {
					const update = cellsFor(row);
					update.delete(nameHeader);
					put(at, update);
					continue;
				}
				added.push(cellsFor(row));
			}

			if (table === null && rows.size === 0 && added.length === 0) {
				return next ?? '';
			}
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
				next = writeTable(next, headers(config), { added: [...seeded, ...spare] });
			} else {
				next = writeTable(next, headers(config), { rows, added });
			}
		}
		return next ?? '';
	},

	render(container, config, data, context): void {
		container.replaceChildren();

		const error = configError(config);
		if (error !== null) {
			container.createDiv({ cls: 'sheetsmith-error', text: error });
			return;
		}

		if (showsOwnLabel(config, context)) {
			container.createDiv({
				cls: 'sheetsmith-component-label',
				text: config.label,
			});
		}

		renderShared(container, config, data, context);
	},
};

/** Every column plus the name column, in the order they are drawn — `null`
 * standing for the name column at its declared position. */
function columnOrder(config: RosterConfig): (number | null)[] {
	const columns = config.columns ?? [];
	const namePosition = Math.max(
		0,
		Math.min(columns.length, Math.floor(config.namePosition ?? 0)),
	);
	const order: (number | null)[] = [];
	for (let i = 0; i <= columns.length; i++) {
		if (i === namePosition) order.push(null);
		if (i < columns.length) order.push(i);
	}
	return order;
}

/** The header row for a roster's table, shared by the one shared table and
 * every per-stat card's own small table alike. */
function drawHead(
	grid: HTMLTableElement,
	config: RosterConfig,
	order: readonly (number | null)[],
): void {
	const columns = config.columns ?? [];
	const nameHeading = (config.rowHeader ?? '').trim() || DEFAULT_ROW_HEADER;
	const head = grid.createEl('thead').createEl('tr');
	for (const entry of order) {
		if (entry === null) {
			head.createEl('th', { cls: 'sheetsmith-table-name', text: nameHeading });
			continue;
		}
		const column = columns[entry] as RosterColumn;
		const heading = column.name ?? column.key;
		const cell = head.createEl('th');
		cell.classList.add(`sheetsmith-table-${typeOf(column)}`);
		if (column.hideHeading === true) {
			cell.createSpan({ cls: 'sheetsmith-sr-only', text: heading });
		} else {
			cell.textContent = heading;
		}
	}
}

/**
 * One shared `<table>`, a band head as a `<tr>` spanning every column, then
 * that band's rows (`docs/UI.md` §9, the class comment above).
 */
function renderShared(
	container: HTMLElement,
	config: RosterConfig,
	data: RosterData | null,
	context: Parameters<ComponentDefinition<RosterConfig, RosterData>['render']>[3],
): void {
	const columns = config.columns ?? [];
	const wrapper = container.createDiv('sheetsmith-table-wrapper');
	const grid = wrapper.createEl('table', { cls: 'sheetsmith-table sheetsmith-roster' });
	const order = columnOrder(config);
	const width = columns.length + 1;

	drawHead(grid, config, order);

	const stats = statList(config);
	const noteNames = rowNames(data);
	const views = rowViews(config, noteNames);

	const status = container.createDiv('sheetsmith-sr-only');
	status.setAttribute('aria-live', 'polite');

	const body = grid.createEl('tbody');

	if (stats.length === 0) {
		const empty = body
			.createEl('tr')
			.createEl('td', { cls: 'sheetsmith-table-empty', text: 'No stats yet. Add one to this component in the layout.' });
		empty.colSpan = width;
		return;
	}

	const signed = config.signed === true;
	const resolveField = context.resolveField;

	/** This roster's own reading of `stat`/`stat.value` inside a row's scope. */
	const statReading = statReadingFor(config, data, views, resolveField);

	for (const stat of stats) {
		const key = (stat.key ?? '').trim();
		const stored = data?.stats?.[key] ?? '';
		const rowsOfStat = views.filter((view) => (view.row.stat ?? '').trim() === key);

		const tr = body.createEl('tr', { cls: 'sheetsmith-roster-band' });
		// A plain table-cell: `display: flex` belongs on the div inside it,
		// never on the `<td>` itself — see `drawBandHead`'s own comment.
		const cell = tr.createEl('td', { cls: 'sheetsmith-roster-band-head' });
		cell.colSpan = width;
		drawBandHead(
			cell,
			config,
			stat,
			stored,
			signed,
			context,
			status,
			() =>
				bandRows(
					config,
					views,
					(view) => storedCells(data, view),
					() => ({ value: undefined, reading: null }),
					key,
				),
		);

		for (const view of rowsOfStat) {
			drawRow(body, config, data, view, order, context, status, statReading);
		}
	}
}

/** This roster's own `stat`/`stat.value` reader, shared by every row scope. */
function statReadingFor(
	config: RosterConfig,
	data: RosterData | null,
	views: readonly RowView[],
	resolve: FieldResolver,
): (key: string) => { value: FieldValue | undefined; reading: FieldValue | null } {
	// A `derived` reading `value` needs a stored score to read; one reading
	// only `self` or another component resolves whether or not this stat
	// holds anything — `card.ts`'s own `needsValue`, one component over.
	const needsValue =
		config.derived !== undefined && referencesName(config.derived, 'value');
	return (key) => {
		const raw = data?.stats?.[key];
		const value =
			raw === undefined || raw.trim() === '' ? undefined : coerceValue(raw);
		if (config.derived === undefined) return { value, reading: value ?? null };
		// An empty value is a blank, not a broken formula — the state that
		// matters most, since a fresh character opens one.
		if (needsValue && (raw ?? '').trim() === '') {
			return { value, reading: null };
		}
		const source = bandRows(
			config,
			views,
			(view) => storedCells(data, view),
			() => ({ value: undefined, reading: null }),
			key,
		);
		const reading = resolve(
			'derived',
			{ value: raw ?? '' },
			`${config.id}.${key}`,
			true,
			source,
		);
		return { value, reading };
	};
}

/** One stat's band head: its name, its stored value, and its reading. */
function drawBandHead(
	parent: HTMLElement,
	config: RosterConfig,
	stat: RosterStat,
	stored: string,
	signed: boolean,
	context: Parameters<ComponentDefinition<RosterConfig, RosterData>['render']>[3],
	status: HTMLElement,
	rowsOf: () => RowsSource,
): void {
	const key = (stat.key ?? '').trim();
	const name = (stat.name ?? '').trim() || key;
	const published = `${config.id}.${key}`;
	const inner = parent.createDiv('sheetsmith-roster-band-inner');

	inner.createDiv({ cls: 'sheetsmith-group-heading', text: name });

	// The score and the reading share one sub-group, centred on each other
	// rather than on the whole band head: `.sheetsmith-card-input` only
	// visibly centres when it is `width: 100%`, which is true inside an
	// ordinary Card and false here, where the score and the reading are
	// `flex: 0 0 auto` so they can sit beside the name.
	const valueGroup = inner.createDiv('sheetsmith-roster-band-value');
	if (config.hideValue !== true) {
		drawValueField(valueGroup, inner, config, key, name, stored, published, context, status);
	}
	if (config.derived !== undefined) {
		drawDerivedReading(valueGroup, config, stored, published, signed, context, rowsOf);
	}
}

/** The score's own field, wherever the band head's two layouts put it. */
function drawValueField(
	valueGroup: HTMLElement,
	inner: HTMLElement,
	config: RosterConfig,
	key: string,
	name: string,
	stored: string,
	published: string,
	context: Parameters<ComponentDefinition<RosterConfig, RosterData>['render']>[3],
	status: HTMLElement,
): void {
	const field = valueGroup.createEl('input', { cls: 'sheetsmith-card-input' });
	field.type = 'text';
	field.inputMode = 'numeric';
	const shown = effectiveReading(config.effective, stored, published, context.resolveField);
	// Folds a reading that is only a respelling ("15.0" against "15") onto
	// `stored` itself, exactly as a Card's own value field does
	// (`effective-value.ts`'s `sameNumber`) — so a stat whose modifiers
	// push nothing does not read as modified over its own spelling.
	const atRest = shown !== undefined && !sameNumber(shown, stored) ? shown : stored;
	const differs = atRest !== stored;
	field.value = atRest;

	/*
	 * Marked on `differs` alone — a Card's own value field's rule — not on
	 * whether anything is currently pushed: `effective` exists to read
	 * modifiers, so a number that moved off the stored one moved because
	 * of them.
	 */
	const bothNumbers = differs ? `${atRest} with modifiers, ${stored} stored` : null;
	if (bothNumbers !== null) {
		field.classList.add(MODIFIED_CLASS);
		field.setAttribute('title', bothNumbers);
	}
	field.setAttribute(
		'aria-label',
		bothNumbers === null ? `${name} value` : `${name} value, ${bothNumbers}`,
	);

	/*
	 * The breakdown, for a reader with no pointer. Independent of the mark
	 * above: unlike a Card, a stat may declare `effective` with no
	 * `derived` at all, so there is no headline number to share a twin
	 * with — this field owns its own.
	 */
	const atRestNumber = Number(atRest);
	const pushed = modifierBreakdown(
		context.modifiers?.breakdown(published),
		atRest.trim() !== '' && Number.isFinite(atRestNumber) ? atRestNumber : null,
	);
	if (pushed !== null) {
		const twin = inner.createDiv('sheetsmith-sr-only');
		twin.id = `sheetsmith-roster-breakdown-${config.id}-${key}`;
		twin.textContent = pushed;
		field.setAttribute('aria-describedby', twin.id);
	}

	/*
	 * Its own notice rather than the row's, on `passport.ts`'s own reasoning:
	 * one host per message, remembering which element to remove.
	 */
	let notice: HTMLElement | null = null;
	const showRefusal = (message: string | null): void => {
		notice?.remove();
		notice = null;
		if (message === null) return;
		notice = createDiv({ cls: 'sheetsmith-error', text: message });
		field.after(notice);
		status.textContent = message;
	};
	bindEditable(field, {
		initial: stored,
		step: true,
		// Constraint 2 on the write side: a stat's value lives in this
		// section's `sheet` fence, and Obsidian indexes no link inside one.
		refuse: (next) =>
			fencedLinkRefusal(next, {
				subject: "A stat's value",
				instead:
					'Type the plain number or word here, and put the link in a Rich text block or a table cell, which store markdown.',
			}),
		onRefusal: showRefusal,
		announceCommit: (next) => {
			status.textContent = next === '' ? `${name} cleared` : `${name} ${next}`;
		},
		announceRestore: (restored) => {
			status.textContent =
				restored === '' ? `${name} restored to empty` : `${name} restored to ${restored}`;
		},
		onCommit: (next) => context.onChange({ stats: { [key]: next } }),
	});
	// Bound after `bindEditable`, so its own blur (which commits) runs
	// first: this is the swap back to the effective reading for the
	// *other* blur, a reader who focused the field and changed nothing.
	if (differs) {
		field.addEventListener('focus', () => {
			field.value = stored;
		});
		field.addEventListener('blur', () => {
			if (field.value === stored) field.value = atRest;
		});
	}
}

/** The stat's computed reading, wherever the band head's two layouts put it. */
function drawDerivedReading(
	parent: HTMLElement,
	config: RosterConfig,
	stored: string,
	published: string,
	signed: boolean,
	context: Parameters<ComponentDefinition<RosterConfig, RosterData>['render']>[3],
	rowsOf: () => RowsSource,
): void {
	const derivedEl = parent.createDiv('sheetsmith-card-derived');
	// An empty value is a blank, not a broken formula (`card.ts`'s own
	// `needsValue`, one component over) — the state that matters most,
	// since a fresh character opens one. A `derived` reading only `self`
	// or another component resolves regardless of what this stat holds.
	const needsValue = config.derived !== undefined && referencesName(config.derived, 'value');
	const blank = needsValue && stored.trim() === '';
	const resolved = blank
		? null
		: context.resolveField('derived', { value: stored }, published, false, rowsOf());
	derivedEl.textContent = blank ? '—' : formatComputed(resolved, signed);
	derivedEl.classList.toggle('sheetsmith-table-unresolved', !blank && resolved === null);
	if (!blank && resolved === null) {
		derivedEl.setAttribute(
			'title',
			context.explainField?.('derived', { value: stored }, published) ??
				'The formula did not resolve.',
		);
	}
	const pushed = modifierBreakdown(
		context.modifiers?.breakdown(published),
		typeof resolved === 'number' ? resolved : null,
	);
	if (pushed !== null) {
		derivedEl.classList.add(MODIFIED_CLASS);
		derivedEl.addEventListener('click', () => showPopover(derivedEl, pushed));
		derivedEl.createDiv({ cls: 'sheetsmith-sr-only', text: pushed });
	}
}

/** One row under a band, on the same drawing rules as `table.ts`'s cells. */
function drawRow(
	body: HTMLElement,
	config: RosterConfig,
	data: RosterData | null,
	view: RowView,
	order: readonly (number | null)[],
	context: Parameters<ComponentDefinition<RosterConfig, RosterData>['render']>[3],
	status: HTMLElement,
	statReading: (key: string) => { value: FieldValue | undefined; reading: FieldValue | null },
): void {
	const columns = config.columns ?? [];
	const stored = view.at === null ? {} : (data?.rows?.[view.at]?.cells ?? {});
	const tr = body.createEl('tr');
	const drafts = new Map<string, string>();
	const cellText = (column: RosterColumn): string | undefined =>
		drafts.get(column.key) ?? stored[column.key.toLowerCase()];
	const scopeNow = (): Record<string, FieldValue> =>
		rowScope(config, view, cellText, statReading);

	const computed: { column: RosterColumn; el: HTMLElement; index: number }[] = [];
	const doc = tr.ownerDocument;
	const winView = doc.defaultView;
	let pending: number | undefined;

	const recompute = (settled: boolean) => {
		if (computed.length === 0) return;
		if (pending !== undefined) {
			winView?.clearTimeout(pending);
			pending = undefined;
		}
		const scope = scopeNow();
		const results = computed.map(({ column, index }) => {
			if (column.formula === undefined) return null;
			return context.resolveField(
				`columns.${index}.formula`,
				scope,
				publishedNameFor(config, column, view),
			);
		});
		const paint = () => {
			computed.forEach(({ column, el, index }, i) => {
				if (column.formula === undefined) {
					el.textContent = '—';
					return;
				}
				const value = results[i] ?? null;
				el.textContent = formatComputed(value, column.signed === true);
				el.classList.toggle('sheetsmith-table-unresolved', value === null);
				el.setAttribute(
					'title',
					value === null
						? (context.explainField?.(
								`columns.${index}.formula`,
								scope,
								publishedNameFor(config, column, view),
							) ?? 'The formula did not resolve.')
						: (column.formula ?? ''),
				);
			});
		};
		if (settled || results.every((value) => value !== null)) {
			paint();
			return;
		}
		pending = winView?.setTimeout(() => {
			pending = undefined;
			paint();
		}, UNRESOLVED_DELAY);
	};

	const renderCell = (index: number) => {
		const column = columns[index] as RosterColumn;
		const type = typeOf(column);
		const td = tr.createEl('td');
		td.classList.add(`sheetsmith-table-${type}`);
		const raw = stored[column.key.toLowerCase()] ?? '';
		const label = `${rowLabel(view.row.label)} ${column.name ?? column.key}`;

		if (type === 'computed') {
			const cell = td.createDiv('sheetsmith-table-value');
			const name = publishedNameFor(config, column, view);
			const shown = name === undefined || column.formula === undefined
				? null
				: rowValues(config, view, cellText, statReading, context.resolveField).values[
						column.key
					];
			const pushed =
				name === undefined || column.formula === undefined
					? null
					: modifierBreakdown(
							context.modifiers?.breakdown(name),
							typeof shown === 'number' ? shown : null,
							true,
						);
			if (pushed !== null) {
				cell.classList.add(MODIFIED_CLASS);
				cell.createSpan({ cls: 'sheetsmith-sr-only', text: pushed });
			}
			if (column.formula !== undefined) {
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
			if (view.at !== null) {
				context.onChange({
					rows: { [view.at]: { cells: { [column.key]: next } } },
				});
				return;
			}
			context.onChange({
				rows: {},
				added: [{ name: view.row.label, cells: { [column.key]: next } }],
			});
		};

		if (type === 'level' || type === 'toggle') {
			const graded = type === 'level';
			const count = graded ? levelCount(column) : 1;
			let current = graded ? levelOf(column, raw) : (isFlagSet(raw) ? 1 : 0);
			let repaint = () => undefined as void;
			const stateOf = (level: number) => (graded ? String(level) : flagText(level > 0));
			const nameOf = (level: number) => (graded ? levelName(column, level) : flagReading(level > 0));
			const setLevel = (next: number) => {
				if (next === current) return;
				current = next;
				repaint();
				drafts.set(column.key, stateOf(current));
				recompute(true);
				commit(stateOf(current));
			};

			if (graded && column.input === 'select') {
				const select = td.createEl('select', { cls: 'sheetsmith-table-select' });
				for (let i = 0; i <= count; i++) {
					const option = select.createEl('option', { text: nameOf(i) });
					option.value = String(i);
				}
				select.value = String(current);
				select.setAttribute('aria-label', label);
				select.addEventListener('change', () => setLevel(Number(select.value)));
				return;
			}

			const button = td.createEl('button', { cls: 'sheetsmith-level-ring' });
			button.type = 'button';
			const pressed = count === 1;
			const show = () => {
				const name = nameOf(current);
				paintLevelRing(button, column, current, graded);
				if (pressed) {
					button.setAttribute('aria-pressed', String(current > 0));
					button.setAttribute('aria-label', label);
				} else {
					button.setAttribute('aria-label', `${label}: ${name}`);
				}
				if (graded && column.levels !== undefined) {
					button.setAttribute('title', name);
				} else {
					button.removeAttribute('title');
				}
			};
			const longPressed = bindLongPress(button, () =>
				graded && column.levels !== undefined ? nameOf(current) : null,
			);
			button.addEventListener('click', () => {
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

		// A number column: the only type left, since text and modifier are
		// not offered here.
		const input = td.createEl('input', { cls: 'sheetsmith-table-input' });
		input.type = 'text';
		input.value = raw;
		input.setAttribute('aria-label', label);
		input.inputMode = 'numeric';
		bindEditable(input, {
			initial: raw,
			step: true,
			min: column.min,
			max: column.max,
			onDraft: () => {
				drafts.set(column.key, input.value.trim());
				recompute(false);
			},
			announceCommit: (next) => {
				status.textContent = next === '' ? `${label} cleared` : `${label} ${next}`;
			},
			announceRestore: (restored) => {
				status.textContent =
					restored === '' ? `${label} restored to empty` : `${label} restored to ${restored}`;
			},
			onCommit: (next) => {
				const bounded = boundedText(next, column);
				if (bounded !== next) {
					input.value = bounded;
					drafts.set(column.key, bounded);
					recompute(true);
					status.textContent = `${label} held to ${bounded}`;
				}
				commit(bounded);
			},
		});
	};

	const renderName = () => {
		const cell = tr.createEl('th', { cls: 'sheetsmith-table-name' });
		cell.setAttribute('scope', 'row');
		// A row's name is static text from the layout, never a character's own
		// — Roster declares no editable row name at all, unlike a Table's
		// character-owned rows — so it needs the display alone and no field
		// to stack it over (`table.ts`'s own declared-row-name branch).
		paintLinkedText(cell, view.row.label, { link: context.link, clipping: CELL_CLIPPING });
	};

	for (const entry of order) {
		if (entry === null) {
			renderName();
			continue;
		}
		renderCell(entry);
	}

	recompute(true);
}

/**
 * What one cell holds in a sample, for a column type this component offers.
 *
 * The same vocabulary Table's own `sampleCell` reads (§1's policy tier: two
 * copies of "which value looks plausible for which type" is exactly the
 * drift a shared module exists to avoid — held here as a duplicate rather than
 * shared, since the type it switches over is Table's own narrower set with
 * `modifier` refused before either ever sees it, and a third consumer moves
 * both into one).
 */
function sampleCell(column: RosterColumn, row: number, at: number): string | null {
	switch (typeOf(column)) {
		case 'number':
			return String(sampleNumber(at));
		case 'toggle':
			return flagText(sampleFlag(row));
		case 'level':
			return String(sampleFlag(row) ? Math.max(1, Math.round(levelCount(column) * 0.6)) : 0);
		case 'computed':
			return null;
		default:
			return sampleText(column.name ?? column.key, row);
	}
}
