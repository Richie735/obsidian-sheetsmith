/*
 * Skill card — repeatable typed records with a fixed row list (SPEC §4.2).
 *
 * The layout owns the rows and the character fills in cells: every character
 * in a system has the same skills, and retyping them per character would be
 * absurd. What it actually implements is generic — named rows, typed columns,
 * per-row formula scope — so the same block serves saving throws or any other
 * fixed list of records. The name is the one part that is not generic, and it
 * is deliberate: see SPEC §4.2.
 *
 * This is the first component on the markdown storage path, because a cell
 * may hold a wikilink and Obsidian does not index links inside a code fence
 * (CLAUDE.md 2). Computed columns are never written to the note: they are
 * derived, and a stored copy of a derived value is a stale copy waiting to
 * happen.
 */

import { readTable, RowUpdate, writeTable } from '../parse/table';
import {
	ComponentConfig,
	ComponentDefinition,
	FieldValue,
	ReadResult,
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

/** Column kinds. `computed` is read-only; the rest are character data. */
export type SkillCardColumnType =
	| 'text'
	| 'number'
	| 'level'
	| 'toggle'
	| 'computed';

export interface SkillCardColumn {
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
	type?: SkillCardColumnType;
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
}

export interface SkillCardRow {
	/** The row's name, stored in the first column and keying its cells. */
	label: string;
	/**
	 * Named expressions available to this row's computed columns. This is
	 * what lets one formula serve every row of a skill list: the column says
	 * `ability + Training * prof`, and the row says which ability it means.
	 */
	values?: Record<string, string>;
}

export interface SkillCardConfig extends ComponentConfig {
	type: 'skill-card';
	/** Heading of the column holding row names. Defaults to "Name". */
	rowHeader?: string;
	/**
	 * Where the name column is drawn among the others, 0 being first. A skill
	 * list puts its proficiency mark before the skill, the way it sits on
	 * paper. Display only: the name stays the note's first column, because it
	 * is what identifies the row.
	 */
	namePosition?: number;
	rows?: SkillCardRow[];
	columns?: SkillCardColumn[];
	/** Hide the component's label above the table. */
	hideLabel?: boolean;
}

export interface SkillCardData {
	/**
	 * Stored cells, by row label then column key. On read this holds every
	 * row the note has; on write only the rows and cells present are touched,
	 * so an edit reported as a single-cell delta can never clobber a sibling
	 * with a stale snapshot — even if two commits race one rebuild.
	 */
	rows: Record<string, Record<string, string>>;
}

const DEFAULT_ROW_HEADER = 'Name';

/**
 * How long a corrected field stays tinted. Long enough to be caught by eyes
 * already moving on — the correction happens on blur, which is the moment the
 * user has decided they are done with the cell.
 */
const CORRECTION_FLASH = 1200;

/** Values a toggle cell is stored as, and what the note reads like. */
const TOGGLE_TRUE = 'yes';
const TOGGLE_FALSE = 'no';
const TRUTHY = new Set(['yes', 'true', 'x', '✓', '✔', '1']);

function columnType(column: SkillCardColumn): SkillCardColumnType {
	return column.type ?? 'text';
}

/** Columns whose values live in the note. Computed ones are never stored. */
function storedColumns(config: SkillCardConfig): SkillCardColumn[] {
	return (config.columns ?? []).filter(
		(column) => columnType(column) !== 'computed',
	);
}

/** The note's header row: the row-name column, then every stored column. */
function headers(config: SkillCardConfig): string[] {
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
function cellValue(column: SkillCardColumn, raw: string | undefined): FieldValue {
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
function bound(raw: string, column: SkillCardColumn): string {
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

/**
 * Configuration errors that make the table unreadable rather than merely
 * empty. Reported on this component alone, per SPEC §10.
 */
function configError(config: SkillCardConfig): string | null {
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

export const skillCard: ComponentDefinition<SkillCardConfig, SkillCardData> = {
	type: 'skill-card',
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

	read(body, config): ReadResult<SkillCardData> {
		const error = configError(config);
		if (error !== null) return { ok: false, error };
		const parsed = readTable(body);
		if (!parsed.ok) return parsed;
		// No table yet: editable empty rows, not an error.
		if (parsed.table === null) return { ok: true, data: null };

		const { headers: found, rows } = parsed.table;
		// Both maps are keyed by text out of the note, so neither may inherit
		// from Object.prototype. On a plain object a row called "toString" or a
		// column called "constructor" reads back as an inherited function: the
		// duplicate check below sees a row that was never there and drops it,
		// and the cell lookup in render answers with a method instead of the
		// value. The note keeps the data either way, so the sheet would show a
		// blank cell over a filled one and the first edit would overwrite it —
		// which is the one failure this component exists to prevent.
		const data: SkillCardData = { rows: Object.create(null) as SkillCardData['rows'] };
		for (const cells of rows) {
			const label = (cells[0] ?? '').trim();
			if (label === '') continue;
			// A note holding the same row twice is a hand edit; the first wins
			// and the second is left in the file, unrendered and untouched.
			// An own-property check rather than `in`, so this stays right on its
			// own terms if the map ever goes back to being an ordinary object.
			// The long spelling because the build targets ES2021 and
			// Object.hasOwn is ES2022.
			if (Object.prototype.hasOwnProperty.call(data.rows, label)) continue;
			const values: Record<string, string> = Object.create(null) as Record<
				string,
				string
			>;
			found.forEach((header, index) => {
				if (index === 0) return;
				values[header.toLowerCase()] = (cells[index] ?? '').trim();
			});
			data.rows[label] = values;
		}
		return { ok: true, data };
	},

	write(data, body, config): string {
		const updates: Map<string, RowUpdate> = new Map();
		const known = new Map(
			storedColumns(config).map((column) => [column.key.toLowerCase(), column.key]),
		);
		for (const [label, cells] of Object.entries(data.rows)) {
			const row = new Map<string, string>();
			for (const [key, value] of Object.entries(cells)) {
				// Cells arrive keyed the way read hands them out; map them back
				// to the layout's own spelling so the header match is exact.
				const header = known.get(key.toLowerCase());
				if (header !== undefined) row.set(header, value);
			}
			if (row.size > 0) updates.set(label, row);
		}

		// The section has no table yet, so there is nothing to clobber: seed
		// every row the layout declares, and the note reads as the whole list
		// from the first edit rather than growing a row at a time. A body that
		// will not parse is left to writeTable, which touches only what it
		// recognises rather than seeding over the top of it.
		const existing = body === null ? null : readTable(body);
		if (existing === null || (existing.ok && existing.table === null)) {
			const seeded: Map<string, RowUpdate> = new Map();
			for (const row of config.rows ?? []) {
				seeded.set(row.label, updates.get(row.label) ?? new Map());
			}
			for (const [label, cells] of updates) {
				if (!seeded.has(label)) seeded.set(label, cells);
			}
			return writeTable(body, headers(config), seeded);
		}
		return writeTable(body, headers(config), updates);
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
		const rows = config.rows ?? [];
		// The table scrolls inside its own box: a sheet must never scroll
		// sideways because one component grew a column.
		const wrapper = element('div', 'sheetsmith-table-wrapper', container);
		const grid = element('table', 'sheetsmith-table', wrapper);

		// Where the name column sits among the others. A skill list wants its
		// proficiency mark before the skill, the way it sits on paper, and
		// that is a display order only: the note keeps the name first, because
		// it is what identifies the row (§10).
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
				element(
					'th',
					'sheetsmith-table-name',
					head,
					(config.rowHeader ?? '').trim() || DEFAULT_ROW_HEADER,
				);
				continue;
			}
			const column = columns[entry] as SkillCardColumn;
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

		// Announces once per commit. Built before the rows so it is in the
		// document by the time any of them speaks; a live region has to be
		// attached before its text changes or the message is never queued.
		const status = element('div', 'sheetsmith-sr-only', container);
		status.setAttribute('aria-live', 'polite');

		const body = element('tbody', '', grid);
		if (rows.length === 0) {
			const empty = element(
				'td',
				'sheetsmith-table-empty',
				element('tr', '', body),
				'No rows yet. Rows come from the layout, not this note — add them to this component in the layout.',
			);
			empty.colSpan = columns.length + 1;
			return;
		}

		rows.forEach((row, rowIndex) => {
			const stored = data?.rows[row.label] ?? {};
			const tr = element('tr', '', body);

			/**
			 * The row's names, as a computed cell sees them: every cell by its
			 * column key, then the row's own named expressions layered over
			 * them. Rebuilt per keystroke from the drafts, so a total moves
			 * while the user is still typing the bonus that changed it.
			 */
			const drafts = new Map<string, string>();
			const rowScope = (): Record<string, FieldValue> => {
				const scope: Record<string, FieldValue> = {};
				for (const column of columns) {
					if (columnType(column) === 'computed') continue;
					scope[column.key] = cellValue(
						column,
						drafts.get(column.key) ?? stored[column.key.toLowerCase()],
					);
				}
				for (const name of Object.keys(row.values ?? {})) {
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

			const computed: { column: SkillCardColumn; el: HTMLElement; index: number }[] =
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
				const column = columns[index] as SkillCardColumn;
				const type = columnType(column);
				const td = element('td', `sheetsmith-table-${type}`, tr);
				const raw = stored[column.key.toLowerCase()] ?? '';
				const label = `${row.label} ${column.name ?? column.key}`;

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
					context.onChange({ rows: { [row.label]: { [column.key]: next } } });
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

				const input = element('input', 'sheetsmith-table-input', td);
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

			for (const entry of order) {
				if (entry === null) {
					const name = element('th', 'sheetsmith-table-name', tr, row.label);
					name.setAttribute('scope', 'row');
					continue;
				}
				renderCell(entry);
			}

			recompute(true);
		});
	},
};
