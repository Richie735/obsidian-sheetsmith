// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { table, TableConfig, TableData } from './table';
import { closePopover, LONG_PRESS } from '../ui/popover';
import { UNRESOLVED_DELAY } from '../interaction/editable';
import { hold, pressDown, prevented, release } from '../test/pointer';
import { FOCUSABLE } from '../view/cell-focus';
import {
	callsFrom,
	makeFieldExplainer,
	makeFieldResolver,
	NO_ENV,
} from '../formula/resolve';
import { evaluate, Scope } from '../formula/expression';
import { buildSheetEnv, buildSheetScope } from '../formula/sheet';
import {
	ModifierContext,
	ModifierDefinitionView,
	ModifierOutcome,
	RenderContext,
} from '../types';
import { cellParts, parseModifierPart } from '../parse/modifier-cell';
import { closeAnchoredPanel } from '../ui/anchored-panel';
import { sampleOf } from '../test/sample';

/*
 * A D&D skill list, which is what fixed rows exist for: the layout owns the
 * eighteen skills, the character owns two cells per row, and one formula
 * serves every row because the row says which ability it means.
 */
const config: TableConfig = {
	id: 'skills',
	type: 'table',
	label: 'Skills',
	position: { col: 1, row: 1, width: 6, height: 4 },
	rowHeader: 'Skill',
	rows: [
		{ label: 'Acrobatics', values: { ability: 'abilities.DEX' } },
		{ label: 'Perception', values: { ability: 'abilities.WIS' } },
	],
	columns: [
		{ key: 'Training', type: 'number', min: 0, max: 2 },
		{ key: 'Bonus', type: 'number' },
		{
			key: 'Total',
			type: 'computed',
			formula: 'ability + Training * prof + Bonus',
			signed: true,
		},
	],
};

const BODY = `
| Skill | Training | Bonus |
|---|---|---|
| Acrobatics | 1 | 0 |
| Perception | 2 | 1 |
`;

/** A 5e sheet around the table: DEX +3, WIS +2, proficiency +3. */
const sheet: Scope = (name) =>
	({ 'abilities.DEX': 3, 'abilities.WIS': 2, prof: 3 })[name];

function contextFor(data: TableData | null, over = config): RenderContext {
	return {
		resolved: {},
		// The real resolver, so these exercise the dotted formula paths
		// (columns.2.formula, rows.0.values.ability) rather than a stub that
		// agrees with them.
		resolveField: makeFieldResolver(table, over, data, { ...NO_ENV, sheet }),
		explainField: makeFieldExplainer(table, over, data, { ...NO_ENV, sheet }),
		onChange: () => undefined,
	};
}

/**
 * Data as the note holds it: the declared rows, in declared order, carrying
 * whatever cells are given. `read` fills every position, so this is what render
 * is handed for a note holding the whole list — and the positions are what an
 * edit is reported against.
 */
function note(
	cells: Record<string, Record<string, string>>,
	over: TableConfig = config,
): TableData {
	const rows: TableData['rows'] = {};
	(over.rows ?? []).forEach((row, index) => {
		rows[index] = { name: row.label, cells: cells[row.label] ?? {} };
	});
	return { rows };
}

/** Read a body the way the sheet does, so render runs on what the note says. */
function stored(body: string, over = config): TableData {
	const result = table.read(body, over);
	if (!result.ok || result.data === null) throw new Error('expected data');
	return result.data;
}

function render(data: TableData | null, over = config): HTMLElement {
	const el = document.createElement('div');
	table.render(el, over, data, contextFor(data, over));
	return el;
}

/** The same skill list with training as marks rather than a number field. */
const levelled: TableConfig = {
	...config,
	columns: [
		{ key: 'Training', type: 'level', max: 2 },
		{ key: 'Bonus', type: 'number' },
		{
			key: 'Total',
			type: 'computed',
			formula: 'ability + Training * prof + Bonus',
			signed: true,
		},
	],
};

/** Render, capturing what the component reports back as edits. */
function recording(
	over: TableConfig,
	data: TableData = note({}, over),
): { el: HTMLElement; changes: unknown[] } {
	const changes: unknown[] = [];
	const el = document.createElement('div');
	table.render(el, over, data, {
		...contextFor(data, over),
		onChange: (edited) => changes.push(edited),
	});
	return { el, changes };
}

function totals(el: HTMLElement): string[] {
	return Array.from(el.querySelectorAll("tbody .sheetsmith-table-value")).map(
		(cell) => cell.textContent ?? '',
	);
}

describe('table.read', () => {
	it('reads every row by its position, with its name and its cells', () => {
		const result = table.read(BODY, config);
		expect(result).toEqual({
			ok: true,
			data: {
				rows: {
					0: { name: 'Acrobatics', cells: { training: '1', bonus: '0' } },
					1: { name: 'Perception', cells: { training: '2', bonus: '1' } },
				},
			},
		});
	});

	it('keeps a row whose name cell is blank', () => {
		// An open card writes a row the moment it is added, with an empty name
		// for the user to fill. Dropping it on read made a line the file held
		// invisible, and the next edit was written over the top of it.
		const blank = `${BODY.trimEnd()}\n|  | 3 | 1 |\n`;
		const result = table.read(blank, config);
		expect(result.ok && result.data?.rows[2]).toEqual({
			name: '',
			cells: { training: '3', bonus: '1' },
		});
	});

	it('treats a section with no table as empty, not malformed', () => {
		expect(table.read('\nProse only.\n', config)).toEqual({
			ok: true,
			data: null,
		});
	});

	it('keeps rows and columns the layout does not map', () => {
		const extra = `${BODY.trimEnd()}\n| Stealth | 3 | 2 |\n`;
		const result = table.read(extra, config);
		expect(result.ok && result.data?.rows[2]).toEqual({
			name: 'Stealth',
			cells: { training: '3', bonus: '2' },
		});
	});

	it('reports a malformed section on this component alone', () => {
		const twice = `${BODY}\n| A |\n|---|\n| b |\n`;
		expect(table.read(twice, config).ok).toBe(false);
	});

	it('reports a duplicate column key as a configuration error', () => {
		const broken = {
			...config,
			columns: [{ key: 'Bonus' }, { key: 'bonus' }],
		};
		const result = table.read(BODY, broken);
		expect(result.ok).toBe(false);
	});

	it('reports a column that collides with the name column', () => {
		const broken = { ...config, columns: [{ key: 'Skill' }] };
		expect(table.read(BODY, broken).ok).toBe(false);
	});

	it('reports a pipe in a column key, which the file cannot hold', () => {
		const broken = { ...config, columns: [{ key: 'a|b' }] };
		expect(table.read(BODY, broken).ok).toBe(false);
	});

	/*
	 * Column names are text out of the note, so they can be anything a player
	 * types — including the names on Object.prototype. Read them into an
	 * ordinary object and "constructor" looks like a cell holding a function,
	 * and the sheet quietly shows a blank over data the file still holds. §4.2
	 * has this same block covering inventory and features, where names are
	 * arbitrary. Rows are addressed by position and so are out of reach of it.
	 */
	it('keeps a row named for something on Object.prototype', () => {
		const body = `
| Skill | Training | Bonus |
|---|---|---|
| toString | 1 | 4 |
| Acrobatics | 2 | 0 |
`;
		const result = table.read(body, config);
		if (!result.ok || result.data === null) throw new Error('expected data');
		expect(result.data.rows[0]).toEqual({
			name: 'toString',
			cells: { training: '1', bonus: '4' },
		});
	});

	it('reads a column named for something on Object.prototype', () => {
		const shadowing = {
			...config,
			columns: [{ key: 'constructor', type: 'number' as const }],
		};
		const body = `
| Skill | constructor |
|---|---|
| Acrobatics | 7 |
`;
		const result = table.read(body, shadowing);
		if (!result.ok || result.data === null) throw new Error('expected data');
		expect(Object.entries(result.data.rows[0]?.cells ?? {})).toEqual([
			['constructor', '7'],
		]);
	});

	it('does not lose such a row through a write', () => {
		const body = `
| Skill | Training | Bonus |
|---|---|---|
| toString | 1 | 4 |
`;
		const read = table.read(body, config);
		if (!read.ok || read.data === null) throw new Error('expected data');
		expect(table.write(read.data, body, config)).toBe(body);
	});
});

describe('table.write', () => {
	it('round-trips unchanged data byte for byte', () => {
		const read = table.read(BODY, config);
		if (!read.ok || read.data === null) throw new Error('expected data');
		expect(table.write(read.data, BODY, config)).toBe(BODY);
	});

	it('rewrites only the cell that changed', () => {
		const out = table.write(
			{ rows: { 0: { cells: { Training: '2' } } } },
			BODY,
			config,
		);
		expect(out).toBe(BODY.replace('| Acrobatics | 1 |', '| Acrobatics | 2 |'));
	});

	it('never writes a computed column into the note', () => {
		const out = table.write(
			{ rows: { 0: { cells: { Training: '1', Total: '6' } } } },
			BODY,
			config,
		);
		expect(out).toBe(BODY);
		expect(out).not.toContain('Total');
	});

	it('seeds every declared row the first time the section is written', () => {
		// The note has no table, so a declared row has no position to address
		// and its first edit arrives as an append. Seeding means the note reads
		// as the whole list from that first edit rather than a row at a time.
		const out = table.write(
			{ rows: {}, added: [{ name: 'Acrobatics', cells: { Training: '1' } }] },
			null,
			config,
		);
		expect(out).toBe(
			'\n| Skill | Training | Bonus |\n|---|---|---|\n' +
				'| Acrobatics | 1 |  |\n| Perception |  |  |\n',
		);
	});

	it('keeps a row the layout no longer declares', () => {
		// SPEC §10: a layout change never deletes character data.
		const extra = `${BODY.trimEnd()}\n| Stealth | 3 | 2 |\n`;
		const out = table.write(
			{ rows: { 0: { cells: { Training: '2' } } } },
			extra,
			config,
		);
		expect(out).toContain('| Stealth | 3 | 2 |');
	});

	it('round-trips two rows sharing a name, byte for byte', () => {
		// Keyed by name these were one row: the second was unreachable and the
		// first's next edit was written over the top of it.
		const twins = `${BODY.trimEnd()}\n| Dagger | 1 | 0 |\n| Dagger | 1 | 0 |\n`;
		expect(table.write(stored(twins), twins, config)).toBe(twins);
	});

	it('edits the second of two rows sharing a name, leaving the first alone', () => {
		const twins = `${BODY.trimEnd()}\n| Dagger | 1 | 0 |\n| Dagger | 1 | 0 |\n`;
		const out = table.write({ rows: { 3: { cells: { Bonus: '4' } } } }, twins, config);
		expect(out).toBe(twins.replace('| Dagger | 1 | 0 |\n| Dagger | 1 | 0 |', '| Dagger | 1 | 0 |\n| Dagger | 1 | 4 |'));
	});

	it("keeps a case-differing row's own spelling", () => {
		// The declared row claims it, so the cells are the character's and the
		// name is not: what the note says it is called is what it stays called.
		const lower = '\n| Skill | Training | Bonus |\n|---|---|---|\n| acrobatics | 1 | 0 |\n';
		const out = table.write(
			{ rows: { 0: { name: 'Acrobatics', cells: { Training: '2' } } } },
			lower,
			config,
		);
		expect(out).toBe(lower.replace('| acrobatics | 1 |', '| acrobatics | 2 |'));
	});

	it('claims a row the character already typed rather than duplicating it', () => {
		// Constraint 4's new case: the layout adds a row the character has. The
		// declared row claims what is there, so nothing duplicates and no cell
		// is overwritten — the row simply stops being theirs to rename.
		const typed = '\n| Skill | Training | Bonus |\n|---|---|---|\n| Perception | 2 | 1 |\n';
		const out = table.write(
			{ rows: {}, added: [{ name: 'Perception', cells: { Bonus: '3' } }] },
			typed,
			config,
		);
		expect(out).toBe(typed.replace('| Perception | 2 | 1 |', '| Perception | 2 | 3 |'));
	});

	it('writes nothing into a section it cannot read', () => {
		/*
		 * Two tables in one section makes every write ambiguous, so `read` reports
		 * it and the card renders the error instead of any controls. Only a stale
		 * render can produce data for this body — someone adds a second table
		 * while a commit is in flight — and every guard that write relies on is
		 * computed from the read that just failed. Left to `writeTable` it would
		 * find the first table and apply indices to it by counting.
		 */
		const twice = `${BODY}\n| A |\n|---|\n| b |\n`;
		expect(table.read(twice, config).ok).toBe(false);
		const edits: TableData[] = [
			{ rows: { 0: { cells: { Training: '9' } } } },
			{ rows: { 0: { name: 'Renamed' } } },
			{ rows: {}, added: [{ name: 'Stealth', cells: {} }] },
			{ rows: {}, removed: [0] },
		];
		for (const edit of edits) {
			expect(table.write(edit, twice, config)).toBe(twice);
		}
	});

	it('leaves prose in the section alone', () => {
		const withProse = `\nWhat these are for.\n${BODY}`;
		const out = table.write(
			{ rows: { 0: { cells: { Training: '2' } } } },
			withProse,
			config,
		);
		expect(out.startsWith('\nWhat these are for.\n')).toBe(true);
	});
});

describe('table.sample', () => {
	/** A sample's rows, as `read` hands them back. */
	function rows(over: TableConfig): { name: string; cells: Record<string, string> }[] {
		const body = sampleOf(table, over);
		const read = table.read(body, over);
		if (!read.ok || read.data === null) throw new Error('expected data');
		return Object.values(read.data.rows).map((row) => ({
			name: row.name ?? '',
			cells: row.cells ?? {},
		}));
	}

	it('fills the rows the layout declares, under the layout\'s own headings', () => {
		const filled = rows(config);
		expect(filled.map((row) => row.name)).toEqual(['Acrobatics', 'Perception']);
		// A number per stored column, and no two side by side alike.
		expect(Number(filled[0]?.cells.training)).toBeGreaterThan(1);
		expect(filled[0]?.cells.training).not.toBe(filled[0]?.cells.bonus);
		// A computed column stores nothing, so nothing is written for it.
		expect(sampleOf(table, config)).not.toContain('Total');
	});

	it('adds rows of the character\'s own only where the layout allows them', () => {
		// A declared-rows table with `openRows` off fills its rows and adds none;
		// a row the config refuses is a row no character could type.
		expect(rows(config)).toHaveLength(2);
		const open = rows({ ...config, openRows: true });
		expect(open).toHaveLength(4);
		// Named for the name column's own heading, so the words are the
		// author's and the index says it is filler.
		expect(open[2]?.name).toBe('Skill 1');
		expect(open[3]?.name).toBe('Skill 2');
	});

	it('fills an open list that declares no rows at all', () => {
		// Both palette entries are exactly this: without the added rows, the one
		// component whose point is that the character fills it would preview as
		// a header row and nothing else.
		const inventory: TableConfig = {
			...config,
			rowHeader: 'Item',
			rows: undefined,
			openRows: true,
			columns: [{ key: 'Qty', type: 'number' }, { key: 'Weight', type: 'number', total: true }],
		};
		const filled = rows(inventory);
		expect(filled.map((row) => row.name)).toEqual(['Item 1', 'Item 2']);
		expect(Number(filled[0]?.cells.weight)).toBeGreaterThan(0);
	});

	it('shows both states of a flag column and part of a level column', () => {
		const marked: TableConfig = {
			...config,
			columns: [
				{ key: 'Prof', type: 'level', levels: ['Untrained', 'Trained', 'Expert'] },
				{ key: 'Worn', type: 'toggle' },
			],
		};
		const filled = rows(marked);
		expect(filled.map((row) => row.cells.worn)).toEqual(['yes', 'no']);
		// Partway up rather than at the top, on the row that carries a level.
		expect(filled[0]?.cells.prof).toBe('1');
		expect(filled[1]?.cells.prof).toBe('0');
	});

	it('enrols no row in a modifier', () => {
		/*
		 * The rule the registry-wide sweep cannot reach, because building a
		 * config with a modifier column in it is this component's data shape: a
		 * name in that cell enrols the row in one of the *layout's* definitions,
		 * and a layout the author is still building may declare none — so a
		 * sample naming one would put a definition problem on screen that the
		 * author did not cause.
		 */
		const enrolling: TableConfig = {
			...config,
			columns: [{ key: 'Qty', type: 'number' }, { key: 'Mods', type: 'modifier' }],
		};
		const filled = rows(enrolling);
		expect(filled.every((row) => (row.cells.mods ?? '') === '')).toBe(true);
		// And the same claim one layer up, where the sheet reads it: the rows
		// this table pushes to the modifier table are none.
		const read = table.read(sampleOf(table, enrolling), enrolling);
		if (!read.ok) throw new Error('expected a readable sample');
		const source = table.scopeModifiers?.(read.data, enrolling);
		expect(source?.(() => null) ?? []).toEqual([]);
	});

	it('fills nothing where there is nothing to fill', () => {
		// No declared rows and no rows the character may add: the table draws
		// its headings, exactly as it does with no sample at all.
		expect(sampleOf(table, { ...config, rows: undefined })).toBe('');
	});

	it('fills nothing for a table that cannot be drawn', () => {
		expect(
			sampleOf(table, { ...config, columns: [{ key: 'Qty' }, { key: 'Qty' }] }),
		).toBe('');
	});
});

describe('table.render', () => {
	it('renders one row per declared row, in order', () => {
		const el = render(note({ Acrobatics: { training: '1', bonus: '0' } }));
		const names = Array.from(
			el.querySelectorAll('tbody .sheetsmith-table-name'),
		).map((cell) => cell.textContent);
		expect(names).toEqual(['Acrobatics', 'Perception']);
	});

	it('fills a declared row from a note row differing only in case', () => {
		const lower = '\n| Skill | Training | Bonus |\n|---|---|---|\n| acrobatics | 1 | 0 |\n';
		const el = render(stored(lower));
		const input = el.querySelector(
			'input[aria-label="Acrobatics Training"]',
		) as HTMLInputElement;
		// Before the claim rule this row sat in the file unrendered, and the
		// declared row above it showed an empty cell over stored data.
		expect(input.value).toBe('1');
	});

	it('draws the name column where the layout puts it', () => {
		const el = render(note({}), { ...levelled, namePosition: 1 });
		const headings = Array.from(el.querySelectorAll('thead th')).map(
			(cell) => cell.textContent,
		);
		expect(headings).toEqual(['Training', 'Skill', 'Bonus', 'Total']);
		const first = el.querySelector('tbody tr')?.firstElementChild;
		expect(first?.querySelector('.sheetsmith-level-ring')).not.toBeNull();
	});

	it('keeps the name first in the note however it is drawn', () => {
		// Display order is not storage order: the name is the note's first cell.
		const out = table.write(
			{ rows: {}, added: [{ name: 'Acrobatics', cells: { Training: '1' } }] },
			null,
			{ ...config, namePosition: 1 },
		);
		expect(out.split('\n')[1]).toBe('| Skill | Training | Bonus |');
	});

	it('leaves a heading off the sheet but not off the column', () => {
		const el = render(note({}), {
			...levelled,
			columns: [
				{ key: 'Training', type: 'level', max: 2, hideHeading: true },
				{ key: 'Bonus', type: 'number' },
			],
		});
		const headings = Array.from(el.querySelectorAll('thead th'));
		// The cell stays in flow, or the column loses its structure; only its
		// text is taken off screen, and it is still there for a screen reader.
		expect(headings).toHaveLength(3);
		const training = el.querySelector('thead .sheetsmith-table-level');
		expect(training?.querySelector('.sheetsmith-sr-only')?.textContent).toBe(
			'Training',
		);
		// Its neighbours are untouched: hiding one heading hides one heading.
		expect(headings.map((cell) => cell.textContent)).toEqual([
			'Skill',
			'Training',
			'Bonus',
		]);
	});

	it('renders a text column as a gloss where the column asks for one', () => {
		const el = render(note({ Acrobatics: { ability: 'DEX' } }), {
			...config,
			columns: [
				{ key: 'Ability', type: 'text', secondary: true },
				{ key: 'Note', type: 'text' },
				// A number is the row's arithmetic, never the note beside it,
				// so the flag says nothing here even when a layout sets it.
				{ key: 'Bonus', type: 'number', secondary: true },
			],
		});
		const glossed = Array.from(
			el.querySelectorAll('tbody .sheetsmith-table-input'),
		).map((input) =>
			input.classList.contains('sheetsmith-table-input-secondary'),
		);
		// Two rows of three cells, in display order.
		expect(glossed).toEqual([true, false, false, true, false, false]);
	});

	it('computes a total from the row values, the cells, and the sheet', () => {
		// Acrobatics: DEX 3 + training 1 × prof 3 + bonus 0 = 6
		// Perception: WIS 2 + training 2 × prof 3 + bonus 1 = 9
		const data = note({
			Acrobatics: { training: '1', bonus: '0' },
			Perception: { training: '2', bonus: '1' },
		});
		expect(totals(render(data))).toEqual(['+6', '+9']);
	});

	it('treats a blank numeric cell as zero, so an untrained skill still totals', () => {
		expect(totals(render(note({})))).toEqual(['+3', '+2']);
	});

	it('marks a computed cell that will not resolve rather than showing a number', () => {
		const broken = {
			...config,
			columns: [
				{ key: 'Training', type: 'number' as const },
				{ key: 'Total', type: 'computed' as const, formula: 'nonexistent + 1' },
			],
		};
		const el = render(note({}), broken);
		expect(totals(el)).toEqual(['?', '?']);
		expect(
			el.querySelector('.sheetsmith-table-unresolved'),
		).not.toBeNull();
	});

	it('shows a computed column with no formula as empty, not as unresolved', () => {
		// "?" says a value is present and would not resolve; a column with
		// nothing to compute has no value at all, and reads as empty does
		// everywhere else on a sheet (SPEC §4.2).
		const blank = {
			...config,
			columns: [
				{ key: 'Training', type: 'number' as const },
				{ key: 'Total', type: 'computed' as const },
			],
		};
		const el = render(note({}), blank);
		expect(totals(el)).toEqual(['—', '—']);
		expect(el.querySelector('.sheetsmith-table-unresolved')).toBeNull();
	});

	it('reveals the formula behind a computed cell on hover', () => {
		const el = render(note({}));
		expect(
			el.querySelector("tbody .sheetsmith-table-value")?.getAttribute('title'),
		).toBe('ability + Training * prof + Bonus');
	});

	it('renders a level column as one control, not one per level', () => {
		const el = render(note({ Acrobatics: { training: '1' } }), levelled);
		// Two rows, one control each — not two marks apiece.
		expect(el.querySelectorAll('tbody button')).toHaveLength(2);
		expect(el.querySelectorAll('tbody input')).toHaveLength(2); // the bonus cells
	});

	it('says which level it is on, by name where the column names them', () => {
		const el = render(note({ Acrobatics: { training: '2' } }), levelled);
		const buttons = el.querySelectorAll('tbody .sheetsmith-level-ring');
		expect(buttons[0]?.getAttribute('aria-label')).toBe('Acrobatics Training: 2');
		expect(buttons[1]?.getAttribute('aria-label')).toBe('Perception Training: 0');

		const named = { ...levelled, columns: [
			{ key: 'Training', type: 'level' as const,
				levels: ['Untrained', 'Proficient', 'Expertise'] },
		] };
		const withNames = render(note({ Acrobatics: { training: '2' } }), named);
		const first = withNames.querySelector('tbody .sheetsmith-level-ring');
		expect(first?.getAttribute('aria-label')).toBe(
			'Acrobatics Training: Expertise',
		);
	});

	it('cycles through the levels and back to none on click', () => {
		const { el, changes } = recording(levelled);
		const button = el.querySelector('tbody .sheetsmith-level-ring') as HTMLElement;
		button.click();
		button.click();
		button.click();
		expect(changes).toEqual([
			{ rows: { 0: { cells: { Training: '1' } } } },
			{ rows: { 0: { cells: { Training: '2' } } } },
			{ rows: { 0: { cells: { Training: '0' } } } },
		]);
	});

	it('repaints as it cycles, without waiting for the view to rebuild', () => {
		const { el } = recording(levelled);
		const button = el.querySelector('tbody .sheetsmith-level-ring') as HTMLElement;
		button.click();
		expect(button.getAttribute('aria-label')).toBe('Acrobatics Training: 1');
		expect(button.classList.contains('sheetsmith-level-ring-on')).toBe(true);
	});

	it('shows the level as one glyph, and nothing at all for none', () => {
		const named = {
			...levelled,
			columns: [
				{
					key: 'Training',
					type: 'level' as const,
					levels: ['Untrained', 'Proficient', 'Expertise'],
				},
			],
		};
		const el = render(note({ Acrobatics: { training: '2' } }), named);
		const buttons = el.querySelectorAll('tbody .sheetsmith-level-ring');
		// The initial of the level's name, and the full name on hover.
		expect(buttons[0]?.textContent).toBe('E');
		expect(buttons[0]?.getAttribute('title')).toBe('Expertise');
		// Untrained is an empty ring: it needs no letter to say so.
		expect(buttons[1]?.textContent).toBe('');
		expect(buttons[1]?.getAttribute('title')).toBe('Untrained');
		expect(
			buttons[1]?.classList.contains('sheetsmith-level-ring-on'),
		).toBe(false);
	});

	it('shades a marked level by how far up the column it is', () => {
		const el = render(note({ Acrobatics: { training: '1' }, Perception: { training: '2' } }),
			levelled,
		);
		const rings = Array.from(
			el.querySelectorAll<HTMLElement>('tbody .sheetsmith-level-ring'),
		);
		// Two of two levels is the whole way; one of two is half of it.
		expect(rings.map((ring) => ring.style.getPropertyValue('--sheetsmith-level')))
			.toEqual(['0.5', '1']);
		// Short of the top the glyph reads against the page, not the accent.
		expect(
			rings.map((ring) => ring.classList.contains('sheetsmith-level-ring-part')),
		).toEqual([true, false]);
	});

	it('lets a level say its ring carries no letter', () => {
		// The 5e case: untrained is an empty ring, proficient a plain fill,
		// expertise the fill with its initial on it.
		const el = render(note({ Acrobatics: { training: '1' }, Perception: { training: '2' } }),
			{
				...levelled,
				columns: [
					{
						key: 'Training',
						type: 'level' as const,
						levels: ['Untrained', 'Proficient:', 'Expertise'],
					},
				],
			},
		);
		const rings = Array.from(
			el.querySelectorAll<HTMLElement>('tbody .sheetsmith-level-ring'),
		);
		expect(rings.map((ring) => ring.textContent)).toEqual(['', 'E']);
		// A fill with nothing on it is still a marked ring, and still says
		// which level it is on through the ramp.
		expect(rings.map((ring) => ring.classList.contains('sheetsmith-level-ring-on')))
			.toEqual([true, true]);
		expect(rings.map((ring) => ring.style.getPropertyValue('--sheetsmith-level')))
			.toEqual(['0.5', '1']);
		// The mark is what the ring shows, never what the level is called: the
		// name is still there for a reader, a listener, and a hover.
		expect(rings.map((ring) => ring.getAttribute('title'))).toEqual([
			'Proficient',
			'Expertise',
		]);
		expect(rings.map((ring) => ring.getAttribute('aria-label'))).toEqual([
			'Acrobatics Training: Proficient',
			'Perception Training: Expertise',
		]);
	});

	it('takes a mark of the layout\'s own where a level gives one', () => {
		const el = render(note({ Acrobatics: { training: '1' }, Perception: { training: '2' } }),
			{
				...levelled,
				columns: [
					{
						key: 'Training',
						type: 'level' as const,
						levels: ['Untrained', 'Proficient:●', 'Expertise:★'],
					},
				],
			},
		);
		const rings = Array.from(el.querySelectorAll('tbody .sheetsmith-level-ring'));
		expect(rings.map((ring) => ring.textContent)).toEqual(['●', '★']);
	});

	it('lists a marked level under its name, not its mark', () => {
		const el = render(note({}), {
			...levelled,
			columns: [
				{
					key: 'Training',
					type: 'level' as const,
					input: 'select' as const,
					levels: ['Untrained', 'Proficient:', 'Expertise:★'],
				},
			],
		});
		// One row's dropdown; the layout gives every row the same list.
		const options = Array.from(
			el.querySelectorAll('tbody tr:first-child select option'),
		);
		expect(options.map((option) => option.textContent)).toEqual([
			'Untrained',
			'Proficient',
			'Expertise',
		]);
	});

	it('leaves a colon inside a level name alone', () => {
		// A mark is one character in a circle. A layout that named a level
		// "Trained: the useful one" before this syntax existed is a name with
		// a colon in it, and still reads as one.
		const el = render(note({ Acrobatics: { training: '1' } }), {
			...levelled,
			columns: [
				{
					key: 'Training',
					type: 'level' as const,
					levels: ['Untrained', 'Trained: the useful one'],
				},
			],
		});
		const ring = el.querySelector('tbody .sheetsmith-level-ring');
		expect(ring?.textContent).toBe('T');
		expect(ring?.getAttribute('title')).toBe('Trained: the useful one');
	});

	it('holds an unnamed column to a level count it can draw', () => {
		// A hand-authored max, or one carried over from a number column whose
		// type was changed. The ring cycles what it can show, not what the
		// number says.
		const el = render(note({ Acrobatics: { training: '1000' } }), {
			...levelled,
			columns: [{ key: 'Training', type: 'level' as const, max: 1000000 }],
		});
		const ring = el.querySelector('tbody .sheetsmith-level-ring');
		expect(ring?.getAttribute('aria-label')).toBe('Acrobatics Training: 20');
	});

	it('reports a level carrying a mark and no name', () => {
		const el = render(null, {
			...levelled,
			columns: [
				{ key: 'Training', type: 'level' as const, levels: ['Untrained', ':P'] },
			],
		});
		expect(el.querySelector('.sheetsmith-error')?.textContent).toContain(
			'a level with a mark but no name',
		);
	});

	it('leaves none and a plain toggle out of the ramp', () => {
		const toggles = {
			...levelled,
			columns: [{ key: 'Trained', type: 'toggle' as const }],
		};
		const el = render(note({ Acrobatics: { trained: 'yes' } }), toggles);
		const rings = Array.from(
			el.querySelectorAll<HTMLElement>('tbody .sheetsmith-level-ring'),
		);
		// A toggle has one state to be in, so a share of the way up says
		// nothing; it takes the full fill, as it always did. Acrobatics is
		// ticked, Perception is not, and neither carries a share.
		expect(rings.map((ring) => ring.style.getPropertyValue('--sheetsmith-level')))
			.toEqual(['', '']);
		expect(
			rings.map((ring) => ring.classList.contains('sheetsmith-level-ring-part')),
		).toEqual([false, false]);
	});

	it('reshades as it cycles, without waiting for the view to rebuild', () => {
		const el = render(note({}), levelled);
		const ring = el.querySelector('tbody .sheetsmith-level-ring') as HTMLElement;
		expect(ring.style.getPropertyValue('--sheetsmith-level')).toBe('');
		ring.click();
		expect(ring.style.getPropertyValue('--sheetsmith-level')).toBe('0.5');
		ring.click();
		expect(ring.style.getPropertyValue('--sheetsmith-level')).toBe('1');
		// Back to none, and the ramp goes with it rather than being left at
		// the top for an empty ring to inherit.
		ring.click();
		expect(ring.style.getPropertyValue('--sheetsmith-level')).toBe('');
	});

	it('falls back to the level number where the levels have no names', () => {
		const el = render(note({ Acrobatics: { training: '2' } }), levelled);
		expect(
			el.querySelector('tbody .sheetsmith-level-ring')?.textContent,
		).toBe('2');
	});

	it('steps with the arrow keys without wrapping', () => {
		const { el, changes } = recording(levelled, {
			rows: { 0: { name: 'Acrobatics', cells: { training: '2' } } },
		});
		const button = el.querySelector('tbody .sheetsmith-level-ring') as HTMLElement;
		button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
		expect(changes).toEqual([]);
		button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
		expect(changes).toEqual([{ rows: { 0: { cells: { Training: '1' } } } }]);
	});

	it('offers a dropdown where the column asks for one', () => {
		const dropdown = {
			...levelled,
			columns: [
				{
					key: 'Training',
					type: 'level' as const,
					input: 'select' as const,
					levels: ['Untrained', 'Proficient', 'Expertise'],
				},
			],
		};
		const { el, changes } = recording(dropdown);
		const select = el.querySelector('tbody select') as HTMLSelectElement;
		expect(Array.from(select.options).map((o) => o.text)).toEqual([
			'Untrained',
			'Proficient',
			'Expertise',
		]);
		select.value = '2';
		select.dispatchEvent(new Event('change'));
		expect(changes).toEqual([{ rows: { 0: { cells: { Training: '2' } } } }]);
	});

	it('is an ordinary toggle when the column has one level', () => {
		const single = {
			...levelled,
			columns: [{ key: 'Training', type: 'level' as const }],
		};
		const { el, changes } = recording(single);
		const button = el.querySelector('tbody .sheetsmith-level-ring') as HTMLElement;
		button.click();
		button.click();
		expect(changes).toEqual([
			{ rows: { 0: { cells: { Training: '1' } } } },
			{ rows: { 0: { cells: { Training: '0' } } } },
		]);
	});

	it('reports too few level names as a configuration error', () => {
		const broken = {
			...levelled,
			columns: [{ key: 'Training', type: 'level' as const, levels: ['Only'] }],
		};
		expect(table.read(BODY, broken).ok).toBe(false);
	});

	it('feeds the level to the row formula as a number', () => {
		// DEX 3 + training 2 x prof 3 + bonus 0 = 9
		const el = render(note({ Acrobatics: { training: '2' } }), levelled);
		expect(totals(el)[0]).toBe('+9');
	});

	it('renders a toggle through the same control as a level', () => {
		// Two adjacent columns doing the same job must not behave or measure
		// differently under the same finger; a bare checkbox had none of the
		// ring's hit target, coarse sizing, or press feedback.
		const toggles = {
			...config,
			columns: [{ key: 'Trained', type: 'toggle' as const }],
		};
		const el = render(note({ Acrobatics: { trained: 'yes' } }), toggles);
		expect(el.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
		const rings = el.querySelectorAll('tbody .sheetsmith-level-ring');
		expect(rings).toHaveLength(2);
		// Two states is a toggle button, and ARIA has a word for that.
		expect(rings[0]?.getAttribute('aria-pressed')).toBe('true');
		expect(rings[1]?.getAttribute('aria-pressed')).toBe('false');
		expect(rings[0]?.getAttribute('aria-label')).toBe('Acrobatics Trained');
		// The fill is the whole answer: no letter, and no tooltip repeating it.
		expect(rings[0]?.textContent).toBe('');
		expect(rings[0]?.hasAttribute('title')).toBe(false);
	});

	it('keeps a toggle stored as yes and no, whatever it renders as', () => {
		const toggles = {
			...config,
			columns: [{ key: 'Trained', type: 'toggle' as const }],
		};
		const { el, changes } = recording(toggles);
		const ring = el.querySelector('tbody .sheetsmith-level-ring') as HTMLElement;
		ring.click();
		ring.click();
		expect(changes).toEqual([
			{ rows: { 0: { cells: { Trained: 'yes' } } } },
			{ rows: { 0: { cells: { Trained: 'no' } } } },
		]);
	});

	it('reads every spelling of a set flag a hand-edited note may hold', () => {
		/*
		 * `stored-flag.ts` accepts six spellings and this drives all six, through
		 * the ring that shows the answer. A toggle column is where they are
		 * reachable: Track checks `Number.isFinite` first, so a note holding `1`
		 * never reaches the flag set there at all.
		 *
		 * Spelled out rather than iterated over an exported set, which is the
		 * shape §10 warns about: a test walking `SET` still passes after a
		 * spelling is deleted from it, because the deletion leaves the iteration
		 * too. Only a literal fails, which is the drift that matters — a note
		 * hand-edited to `✓` reading as ticked in a table and clear on a card,
		 * from the same file, with nothing on screen to say why.
		 */
		const toggles = {
			...config,
			columns: [{ key: 'Trained', type: 'toggle' as const }],
		};
		for (const spelling of ['yes', 'true', 'x', '✓', '✔', '1']) {
			const el = render(note({ Acrobatics: { trained: spelling } }, toggles), toggles);
			const ring = el.querySelector('tbody .sheetsmith-level-ring');
			expect(ring?.getAttribute('aria-pressed'), spelling).toBe('true');
		}
		// And the negative, so the loop above is not passing on a ring stuck on.
		for (const spelling of ['no', 'false', '0', '', 'maybe']) {
			const el = render(note({ Acrobatics: { trained: spelling } }, toggles), toggles);
			const ring = el.querySelector('tbody .sheetsmith-level-ring');
			expect(ring?.getAttribute('aria-pressed'), spelling).toBe('false');
		}
	});

	it('gives an unnamed level no tooltip repeating its own glyph', () => {
		const el = render(note({ Acrobatics: { training: '2' } }), levelled);
		const ring = el.querySelector('tbody .sheetsmith-level-ring');
		expect(ring?.textContent).toBe('2');
		expect(ring?.hasAttribute('title')).toBe(false);
	});

	it('names the value a failed formula could not find', () => {
		const broken = {
			...config,
			columns: [
				{ key: 'Total', type: 'computed' as const, formula: 'nonexistent + 1' },
			],
		};
		const el = render(note({}), broken);
		const cell = el.querySelector('tbody .sheetsmith-table-value');
		expect(cell?.textContent).toBe('?');
		expect(cell?.getAttribute('title')).toContain('nonexistent');
	});

	it('recomputes the total live, before anything is committed', () => {
		const el = render(note({ Acrobatics: { training: '1', bonus: '0' } }));
		const input = el.querySelector(
			'input[aria-label="Acrobatics Training"]',
		) as HTMLInputElement;
		input.value = '2';
		input.dispatchEvent(new Event('input'));
		expect(totals(el)[0]).toBe('+9');
	});

	it('reports an edit as a single-cell delta', () => {
		const changes: unknown[] = [];
		const el = document.createElement('div');
		table.render(el, config, note({}), {
			...contextFor(note({})),
			onChange: (data) => changes.push(data),
		});
		const input = el.querySelector(
			'input[aria-label="Perception Bonus"]',
		) as HTMLInputElement;
		input.value = '4';
		input.dispatchEvent(new Event('blur'));
		expect(changes).toEqual([{ rows: { 1: { cells: { Bonus: '4' } } } }]);
	});

	it('holds a typed number to the column bounds', () => {
		const changes: unknown[] = [];
		const el = document.createElement('div');
		table.render(el, config, note({}), {
			...contextFor(note({})),
			onChange: (data) => changes.push(data),
		});
		const input = el.querySelector(
			'input[aria-label="Acrobatics Training"]',
		) as HTMLInputElement;
		input.value = '5';
		input.dispatchEvent(new Event('blur'));
		expect(changes).toEqual([{ rows: { 0: { cells: { Training: '2' } } } }]);
		expect(input.value).toBe('2');
	});

	it('shows a configuration error on itself rather than a broken table', () => {
		const broken = { ...config, rows: [{ label: 'A' }, { label: 'A' }] };
		const el = render(null, broken);
		expect(el.querySelector('.sheetsmith-error')).not.toBeNull();
		expect(el.querySelector('table')).toBeNull();
	});
});

describe('table touch affordances', () => {
	/*
	 * `title` is the whole story only where there is a pointer. These cover
	 * the second door: the route to a level's name and to a computed cell's
	 * formula on a device that never fires a hover.
	 */
	const named: TableConfig = {
		...config,
		columns: [
			{
				key: 'Training',
				type: 'level',
				levels: ['Untrained', 'Proficient', 'Expertise'],
			},
			{ key: 'Total', type: 'computed', formula: 'ability + Training' },
		],
	};

	it('reveals a level name on a long press, and swallows the click', () => {
		vi.useFakeTimers();
		try {
			const { el, changes } = recording(named, {
				rows: { 0: { name: 'Acrobatics', cells: { training: '2' } } },
			});
			const ring = el.querySelector('tbody .sheetsmith-level-ring') as HTMLElement;
			hold(ring, LONG_PRESS + 10, { pointerType: 'touch' });

			const bubble = document.querySelector('.sheetsmith-popover');
			expect(bubble?.textContent).toBe('Expertise');
			expect(ring.getAttribute('aria-describedby')).toBe(bubble?.id);

			// The press ends in a click, and it did not mean "cycle".
			ring.click();
			expect(changes).toEqual([]);
			closePopover();
		} finally {
			vi.useRealTimers();
		}
	});

	it('leaves a held mouse click cycling, rather than swallowing it', () => {
		// A mouse has the hover that `title` answers, so the long press buys
		// nothing there and would cost a deliberate click: holding one past
		// LONG_PRESS is ordinary for a hand with a tremor, and swallowing it
		// makes the control dead for exactly the people least able to avoid it.
		vi.useFakeTimers();
		try {
			const { el, changes } = recording(named);
			const ring = el.querySelector('tbody .sheetsmith-level-ring') as HTMLElement;
			hold(ring, LONG_PRESS + 10, { pointerType: 'mouse' });

			expect(document.querySelector('.sheetsmith-popover')).toBeNull();
			ring.click();
			expect(changes).toEqual([{ rows: { 0: { cells: { Training: '1' } } } }]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('leaves a short press to mean what it always meant', () => {
		vi.useFakeTimers();
		try {
			const { el, changes } = recording(named);
			const ring = el.querySelector('tbody .sheetsmith-level-ring') as HTMLElement;
			pressDown(ring, { pointerType: 'touch' });
			release(ring);
			vi.advanceTimersByTime(LONG_PRESS + 10);
			expect(document.querySelector('.sheetsmith-popover')).toBeNull();
			ring.click();
			expect(changes).toEqual([{ rows: { 0: { cells: { Training: '1' } } } }]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('reveals the formula behind a computed cell on a tap', () => {
		const el = render(note({}), named);
		const cell = el.querySelector('tbody .sheetsmith-table-value') as HTMLElement;
		cell.click();
		expect(document.querySelector('.sheetsmith-popover')?.textContent).toBe(
			'ability + Training',
		);
		closePopover();
	});

	it('shows the failure, not the formula, where it failed', () => {
		const broken = {
			...named,
			columns: [{ key: 'Total', type: 'computed' as const, formula: 'nope + 1' }],
		};
		const el = render(note({}), broken);
		const cell = el.querySelector('tbody .sheetsmith-table-value') as HTMLElement;
		cell.click();
		expect(document.querySelector('.sheetsmith-popover')?.textContent).toContain(
			'nope',
		);
		closePopover();
	});

	it('shows one bubble at a time', () => {
		const el = render(note({}), named);
		const cells = el.querySelectorAll('tbody .sheetsmith-table-value');
		(cells[0] as HTMLElement).click();
		(cells[1] as HTMLElement).click();
		expect(document.querySelectorAll('.sheetsmith-popover')).toHaveLength(1);
		closePopover();
	});
});

/*
 * Open rows: the rows the character adds. The claim rule is the whole of it —
 * a declared row claims the first note row spelling its name, and every
 * unclaimed row is the character's, which is what lets one list hold a
 * playbook's printed gear and a player's invented gear at once.
 */
/*
 * Publishing a declared row (SPEC §5). A column asks to be published, a row
 * carries the name, and `skills.perception` is that column's value on that
 * row. Driven through the sheet-wide name table rather than through the
 * declaration, because what a name is worth is the table's answer.
 */
describe('table publishes a declared row', () => {
	/** The skills card with its computed Total published per row. */
	const published: TableConfig = {
		...config,
		columns: config.columns?.map((column) =>
			column.key === 'Total' ? { ...column, publish: true } : column,
		),
		rows: [
			{ label: 'Acrobatics', values: { ability: 'abilities.DEX' } },
			{ label: 'Perception', key: 'perception', values: { ability: 'abilities.WIS' } },
		],
	};

	/**
	 * The sheet the card sits on, built exactly as the view builds it: the
	 * abilities and the proficiency the row formulas read, and the card
	 * itself, resolving against the finished table.
	 */
	function sheetWith(over: TableConfig, data: TableData | null): Scope {
		return buildSheetScope([
			{
				id: 'abilities',
				values: { named: { DEX: { value: 3 }, WIS: { value: 2 } } },
			},
			{ id: 'prof', values: { self: { value: 3 } } },
			{
				id: over.id,
				values: table.scopeValues?.(data, over) ?? {},
				resolver: (env) => makeFieldResolver(table, over, data, env),
			},
		]);
	}

	it('answers <id>.<key> with the published column on that row', () => {
		// The formula the original brief wrote, through the expression engine:
		// WIS +2, proficient twice over at +3, and a +1 bonus is a +9 skill.
		const scope = sheetWith(published, stored(BODY, published));
		expect(scope('skills.perception')).toBe(9);
		expect(evaluate('10 + skills.perception', scope)).toBe(19);
	});

	it('publishes each row from one source, never a display beside a compute', () => {
		// The rule contract.test.ts sweeps registry-wide, asserted here because
		// the sweep cannot see it: a Table with nothing configured publishes
		// nothing, and this card is the one that actually uses `compute`.
		const entries = Object.values(
			table.scopeValues?.(stored(BODY, published), published)?.named ?? {},
		);
		expect(entries).not.toHaveLength(0);
		for (const entry of entries) {
			expect(entry.display === undefined || entry.compute === undefined).toBe(true);
		}
	});

	it('publishes only the rows carrying a key', () => {
		const scope = sheetWith(published, stored(BODY, published));
		expect(scope('skills.Acrobatics')).toBeUndefined();
		expect(scope('skills.acrobatics')).toBeUndefined();
	});

	it('publishes no .value for a computed column', () => {
		// A computed column is never written to the note (§4.2), so there is
		// no stored cell for `.value` to mean.
		const scope = sheetWith(published, stored(BODY, published));
		expect(scope('skills.perception.value')).toBeUndefined();
	});

	it('publishes the stored cell, and its .value, for a stored column', () => {
		const bonus: TableConfig = {
			...published,
			columns: published.columns?.map((column) => ({
				...column,
				publish: column.key === 'Bonus',
			})),
		};
		const scope = sheetWith(bonus, stored(BODY, bonus));
		expect(scope('skills.perception')).toBe(1);
		expect(scope('skills.perception.value')).toBe(1);
	});

	it('publishes what the card shows for a row the note has no row for', () => {
		// A declared row that claimed nothing renders with blank cells, and a
		// blank number cell is zero (§4.2): WIS +2 and nothing else.
		const alone = `
| Skill | Training | Bonus |
|---|---|---|
| Acrobatics | 1 | 0 |
`;
		const data = stored(alone, published);
		expect(sheetWith(published, data)('skills.perception')).toBe(2);
		expect(totals(render(data, published))).toEqual(['+6', '+2']);
	});

	it('agrees with the cell the card draws, from one row scope', () => {
		// The rendered cell reads the drafts and the published name reads the
		// note, but both are the same construction: same cells, same row
		// values, same formula. A second copy is where the two drift apart.
		const data = stored(BODY, published);
		expect(totals(render(data, published))).toEqual(['+6', '+9']);
		expect(sheetWith(published, data)('skills.perception')).toBe(9);
	});

	it('publishes nothing for a row the character added', () => {
		// Not a guard: the entries are built from the layout's rows, and a row
		// the character typed appears in none of them.
		const open: TableConfig = {
			...published,
			id: 'inventory',
			openRows: true,
			rows: [{ label: 'Rope', key: 'rope' }],
			columns: [{ key: 'Qty', type: 'number', publish: true }],
		};
		const body = `
| Item | Qty |
|---|---|
| Rope | 1 |
| Dagger | 2 |
`;
		const scope = sheetWith(open, stored(body, open));
		expect(scope('inventory.rope')).toBe(1);
		expect(scope('inventory.Dagger')).toBeUndefined();
		expect(scope('inventory.dagger')).toBeUndefined();
		// And a formula reading one says so rather than computing from a blank.
		expect(() => evaluate('inventory.Dagger + 1', scope)).toThrow(
			'Unknown name "inventory.Dagger"',
		);
	});

	it('catches two rows whose formulas name each other', () => {
		// Two rows of one card are two published names, so the name table's
		// own cycle guard covers a cycle inside a component.
		const paired: TableConfig = {
			...config,
			rows: [
				{ label: 'Athletics', key: 'row_a', values: { other: 'skills.row_b' } },
				{ label: 'Perception', key: 'row_b', values: { other: 'skills.row_a' } },
			],
			columns: [
				{ key: 'Bonus', type: 'number' },
				{ key: 'Total', type: 'computed', formula: 'other + Bonus', publish: true },
			],
		};
		const body = `
| Skill | Bonus |
|---|---|
| Athletics | 1 |
| Perception | 2 |
`;
		const data = stored(body, paired);
		const scope = sheetWith(paired, data);
		expect(scope('skills.row_a')).toBeUndefined();
		expect(scope('skills.row_b')).toBeUndefined();
		// Everything outside the cycle keeps working.
		expect(scope('abilities.DEX')).toBe(3);

		const el = document.createElement('div');
		table.render(el, paired, data, {
			resolved: {},
			resolveField: makeFieldResolver(table, paired, data, {
				...NO_ENV,
				sheet: scope,
			}),
			explainField: makeFieldExplainer(table, paired, data, {
				...NO_ENV,
				sheet: scope,
			}),
			onChange: () => undefined,
		});
		const cells = Array.from(
			el.querySelectorAll('tbody .sheetsmith-table-value'),
		);
		expect(cells.map((cell) => cell.textContent)).toEqual(['?', '?']);
		expect(cells[0]?.getAttribute('title')).toContain('other');
		expect(cells[1]?.getAttribute('title')).toContain('other');
	});

	/*
	 * Every refusal is a configuration error: the card renders it, publishes
	 * nothing, and the message names the fix (SPEC §10, PATTERNS §4).
	 */
	describe('refuses a publication it cannot honour', () => {
		function refused(over: TableConfig): string {
			const result = table.read(BODY, over);
			if (result.ok) throw new Error('expected a configuration error');
			// Rendered on the card, and nothing published behind it.
			expect(render(null, over).querySelector('.sheetsmith-error')).not.toBeNull();
			expect(table.scopeValues?.(null, over)).toEqual({});
			return result.error;
		}

		it('refuses two published columns, naming both', () => {
			const error = refused({
				...published,
				columns: [
					{ key: 'Training', type: 'number', publish: true },
					{ key: 'Bonus', type: 'number', publish: true },
				],
			});
			expect(error).toContain('"Training"');
			expect(error).toContain('"Bonus"');
			expect(error).toContain('only one');
		});

		it('refuses a published text column, saying what the cell could mean', () => {
			const error = refused({
				...published,
				columns: [{ key: 'Notes', publish: true }],
			});
			expect(error).toContain('[[Sunblade|sword]]');
			expect(error).toContain('number, level, toggle or computed');
		});

		it('refuses a row key that is not a name, naming the fix', () => {
			const error = refused({
				...published,
				rows: [{ label: 'Perception', key: 'passive perception' }],
			});
			expect(error).toContain('letters, digits and underscores');
			expect(error).toContain('refused rather than rewritten');
		});

		it('refuses a row key holding a dot, which would be a third segment', () => {
			// `<id>.<key>` is two segments, and a third would collide with the
			// `.value` every published name already answers to.
			expect(
				refused({ ...published, rows: [{ label: 'Perception', key: 'a.b' }] }),
			).toContain('letters, digits and underscores');
		});

		it('refuses two rows publishing under the same key, naming both', () => {
			const error = refused({
				...published,
				rows: [
					{ label: 'Acrobatics', key: 'perception' },
					{ label: 'Perception', key: 'perception' },
				],
			});
			expect(error).toContain('"Acrobatics"');
			expect(error).toContain('"Perception"');
			expect(error).toContain('"perception"');
		});

		it('refuses a row key a totalled column already answers to', () => {
			const error = refused({
				...published,
				rows: [{ label: 'Perception', key: 'Bonus' }],
				columns: [
					{ key: 'Bonus', type: 'number', total: true },
					{ key: 'Total', type: 'computed', formula: 'Bonus', publish: true },
				],
			});
			expect(error).toContain('skills.Bonus');
			expect(error).toContain('totalled column');
		});

		it('refuses a row key with no column published, naming the control', () => {
			const error = refused({
				...config,
				rows: [{ label: 'Perception', key: 'perception' }],
			});
			expect(error).toContain('no column is published per row');
			expect(error).toContain('Publish per row');
		});
	});
});

describe('table with open rows', () => {
	const inventory: TableConfig = {
		id: 'inventory',
		type: 'table',
		label: 'Inventory',
		position: { col: 1, row: 1, width: 6, height: 4 },
		rowHeader: 'Item',
		openRows: true,
		columns: [
			{ key: 'Qty', type: 'number' },
			{ key: 'Weight', type: 'number', total: true },
			{ key: 'Worn', type: 'toggle' },
		],
	};

	const PACK = `
| Item | Qty | Weight | Worn |
|---|---|---|---|
| Dagger | 2 | 1 | no |
| Rope | 1 | 10 | yes |
`;

	/** A Blades-style list: printed gear declared, invented gear added below. */
	const load: TableConfig = {
		...inventory,
		id: 'load',
		rows: [{ label: 'Blade or two' }, { label: 'Throwing knives' }],
	};

	function openRender(
		body: string | null,
		over: TableConfig = inventory,
	): { el: HTMLElement; changes: unknown[] } {
		// Tolerant of a config error, so the error state can be rendered here too.
		const result = body === null ? null : table.read(body, over);
		const data = result !== null && result.ok ? result.data : null;
		const changes: unknown[] = [];
		const el = document.createElement('div');
		table.render(el, over, data, {
			...contextFor(data, over),
			onChange: (edited) => changes.push(edited),
		});
		return { el, changes };
	}

	function names(el: HTMLElement): string[] {
		return Array.from(
			el.querySelectorAll<HTMLElement>('tbody .sheetsmith-table-name'),
		).map((cell) => {
			const input = cell.querySelector('input');
			return input === null ? (cell.textContent ?? '') : input.value;
		});
	}

	function removeButtons(el: HTMLElement): HTMLElement[] {
		return Array.from(
			el.querySelectorAll<HTMLElement>('tbody .sheetsmith-table-remove-button'),
		);
	}

	function footTotals(el: HTMLElement): string[] {
		return Array.from(
			el.querySelectorAll('tfoot .sheetsmith-table-value'),
		).map((cell) => cell.textContent ?? '');
	}

	it('renders every row the note holds, in note order', () => {
		expect(names(openRender(PACK).el)).toEqual(['Dagger', 'Rope']);
	});

	it('renders two rows sharing a name as two rows', () => {
		const twins = `${PACK.trimEnd()}\n| Dagger | 1 | 1 | no |\n`;
		const { el, changes } = openRender(twins);
		expect(names(el)).toEqual(['Dagger', 'Rope', 'Dagger']);
		// And an edit on the second of them names that row's position, so the
		// first dagger's line is not what moves.
		const inputs = el.querySelectorAll<HTMLInputElement>(
			'tbody input[aria-label="Item"]',
		);
		const name = inputs[2] as HTMLInputElement;
		name.value = 'Silver dagger';
		name.dispatchEvent(new Event('blur'));
		expect(changes).toEqual([{ rows: { 2: { name: 'Silver dagger' } } }]);
	});

	it('shows a cell holding a pipe as one pipe, with no backslash', () => {
		const piped = '\n| Item | Qty |\n|---|---|\n| Bread \\| Cheese | 1 |\n';
		const { el } = openRender(piped, { ...inventory, columns: [{ key: 'Qty' }] });
		expect(names(el)).toEqual(['Bread | Cheese']);
	});

	it('round-trips a cell holding a pipe, and an aliased wikilink', () => {
		const piped =
			'\n| Item | Qty |\n|---|---|\n| Bread \\| Cheese | 1 |\n| [[Sunblade\\|sword]] | 1 |\n';
		const over = { ...inventory, columns: [{ key: 'Qty' }] };
		expect(table.write(stored(piped, over), piped, over)).toBe(piped);
	});

	it('renames a character row through the shared editing gesture', () => {
		const { el, changes } = openRender(PACK);
		const name = el.querySelector('input[aria-label="Item"]') as HTMLInputElement;
		name.value = 'Silver dagger';
		name.dispatchEvent(new Event('blur'));
		expect(changes).toEqual([{ rows: { 0: { name: 'Silver dagger' } } }]);
	});

	it('restores a name on Escape and says that it did', () => {
		const { el, changes } = openRender(PACK);
		const name = el.querySelector('input[aria-label="Item"]') as HTMLInputElement;
		name.value = 'Silver dagger';
		name.dispatchEvent(new Event('input'));
		name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(name.value).toBe('Dagger');
		expect(changes).toEqual([]);
		// An undo nobody can perceive is not obviously one.
		expect(el.querySelector('[aria-live]')?.textContent).toBe(
			'Item restored to Dagger',
		);
	});

	it('renders a row whose name cell is blank, and keeps it on write', () => {
		const blank = `${PACK.trimEnd()}\n|  |  |  |  |\n`;
		const { el } = openRender(blank);
		expect(names(el)).toEqual(['Dagger', 'Rope', '']);
		expect(table.write(stored(blank, inventory), blank, inventory)).toBe(blank);
	});

	it('names a row with no name, the same way everywhere', () => {
		// The state the add control writes on purpose. A cell announcing " Qty"
		// names no row at all, and a reader hearing the cell and then the delete
		// control has to be able to tell they are the same row.
		const blank = `${PACK.trimEnd()}\n|  | 1 | some | no |\n`;
		const { el } = openRender(blank);
		const cells = Array.from(
			el.querySelectorAll<HTMLElement>('tbody tr:nth-child(3) [aria-label]'),
		).map((control) => control.getAttribute('aria-label'));
		expect(cells).toEqual([
			'Item',
			'Unnamed row Qty',
			'Unnamed row Weight',
			'Unnamed row Worn',
			'Delete Unnamed row',
		]);
		// And the total names it as the row it could not read.
		expect(
			el.querySelector('tfoot .sheetsmith-table-value')?.getAttribute('title'),
		).toBe('Unnamed row is not a number, so this column has no total.');
	});

	it('says so rather than saying rows come from the layout', () => {
		// The fixed card's message is precisely wrong here: rows come from this
		// note, and the control to add one is right below the message.
		const { el } = openRender(null);
		expect(el.querySelector('.sheetsmith-table-empty')?.textContent).toBe(
			'No rows yet.',
		);
		expect(el.querySelector('.sheetsmith-table-add-button')).not.toBeNull();
	});

	it('appends a row to the note when the add control is pressed', () => {
		const { el, changes } = openRender(PACK);
		const add = el.querySelector('.sheetsmith-table-add-button') as HTMLElement;
		add.click();
		expect(changes).toEqual([{ rows: {}, added: [{ name: '', cells: {} }] }]);
		expect(table.write(changes[0] as TableData, PACK, inventory)).toBe(
			`${PACK.trimEnd()}\n|  |  |  |  |\n`,
		);
	});

	it('leaves focus in the new row\'s name field', () => {
		/*
		 * The view restores focus by control index within the cell, so the new
		 * row's name field lands under the finger only because the row's
		 * controls sit immediately before the add button that was focused. That
		 * makes it an accident rather than a design, which is why it has a test.
		 * The selector is the view's own, imported rather than copied: it counts
		 * anchors too, now that a cell can hold a rendered link.
		 */
		const before = openRender(PACK).el;
		const focused = Array.from(before.querySelectorAll(FOCUSABLE)).indexOf(
			before.querySelector('.sheetsmith-table-add-button') as Element,
		);
		const grown = table.write(
			{ rows: {}, added: [{ name: '', cells: {} }] },
			PACK,
			inventory,
		);
		const after = openRender(grown).el;
		const landed = Array.from(after.querySelectorAll(FOCUSABLE))[focused];
		expect(landed?.classList.contains('sheetsmith-table-name-input')).toBe(true);
		expect((landed as HTMLInputElement).value).toBe('');
	});

	it('deletes a row in two presses, writing nothing on the first', () => {
		const { el, changes } = openRender(PACK);
		const [dagger] = removeButtons(el);
		dagger?.click();
		// The row about to go is named before anything is applied.
		expect(changes).toEqual([]);
		expect(dagger?.getAttribute('title')).toBe('Delete Dagger?');
		expect(el.querySelector('[aria-live]')?.textContent).toBe(
			'Delete Dagger? Select again to confirm.',
		);

		dagger?.click();
		expect(changes).toEqual([{ rows: {}, removed: [0] }]);
		// Exactly that line goes, and every other byte stays.
		expect(table.write(changes[0] as TableData, PACK, inventory)).toBe(
			PACK.replace('| Dagger | 2 | 1 | no |\n', ''),
		);
	});

	it('disarms when focus moves off the control', () => {
		const { el, changes } = openRender(PACK);
		const [dagger] = removeButtons(el);
		dagger?.click();
		dagger?.dispatchEvent(new Event('blur'));
		// The next press arms it again rather than deleting.
		dagger?.click();
		expect(changes).toEqual([]);
		expect(dagger?.classList.contains('sheetsmith-table-remove-armed')).toBe(true);
	});

	/**
	 * Attached to the document, because the outside-press dismissal listens
	 * there: a press only reaches it from an element that is in the document,
	 * which on a real sheet every control is.
	 */
	function attached(body: string): ReturnType<typeof openRender> {
		const rendered = openRender(body);
		document.body.appendChild(rendered.el);
		return rendered;
	}

	it('disarms on the next press anywhere else', () => {
		// What a finger has instead of moving focus away: there is no touch
		// gesture for that, and WebKit does not focus a button on tap, so on a
		// phone `blur` alone left the control armed with no way to take it back.
		const { el, changes } = attached(PACK);
		try {
			const [dagger] = removeButtons(el);
			dagger?.click();
			const elsewhere = el.querySelector('input[aria-label="Item"]') as HTMLElement;
			elsewhere.dispatchEvent(new Event('pointerdown', { bubbles: true }));
			expect(dagger?.classList.contains('sheetsmith-table-remove-armed')).toBe(
				false,
			);
			expect(el.querySelector('[aria-live]')?.textContent).toBe('Delete cancelled');
			// And the next press on the glyph arms it again rather than deleting.
			dagger?.click();
			expect(changes).toEqual([]);
		} finally {
			el.remove();
		}
	});

	it('lets a press on the control itself through, so two taps still delete', () => {
		// The dismissal must not swallow the second press. The invisible hit
		// target is part of the button, so a press on the padding around the
		// glyph counts as inside it.
		const { el, changes } = attached(PACK);
		try {
			const [dagger] = removeButtons(el);
			dagger?.click();
			dagger?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
			dagger?.click();
			expect(changes).toEqual([{ rows: {}, removed: [0] }]);
		} finally {
			el.remove();
		}
	});

	it('disarms on Escape, and when another row is armed', () => {
		const { el, changes } = openRender(PACK);
		const [dagger, rope] = removeButtons(el);
		dagger?.click();
		dagger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(dagger?.classList.contains('sheetsmith-table-remove-armed')).toBe(false);

		dagger?.click();
		rope?.click();
		// Two rows armed at once is two rows about to go, and only one of them
		// is: arming the second stood the first down.
		expect(dagger?.classList.contains('sheetsmith-table-remove-armed')).toBe(false);
		expect(rope?.classList.contains('sheetsmith-table-remove-armed')).toBe(true);
		expect(changes).toEqual([]);
	});

	it('gives a claimed row no delete control and no editable name', () => {
		const printed = `
| Item | Qty | Weight | Worn |
|---|---|---|---|
| Blade or two | 1 | 1 | yes |
| Lockpicks | 1 | 1 | no |
`;
		const { el } = openRender(printed, load);
		// Declared rows first in declared order, then the character's own.
		expect(names(el)).toEqual(['Blade or two', 'Throwing knives', 'Lockpicks']);
		const cells = Array.from(
			el.querySelectorAll('tbody .sheetsmith-table-name'),
		);
		expect(cells.map((cell) => cell.querySelector('input') !== null)).toEqual([
			false,
			false,
			true,
		]);
		// One control, on the row the character owns. Absence is what says the
		// layout owns the others; eighteen disabled buttons would be noise.
		expect(removeButtons(el)).toHaveLength(1);
	});

	it('refuses a removal that lands on a claimed row', () => {
		const printed = `
| Item | Qty | Weight | Worn |
|---|---|---|---|
| Blade or two | 1 | 1 | yes |
`;
		// Only reachable through a stale index, and the file boundary is where
		// Constraint 4 belongs.
		expect(table.write({ rows: {}, removed: [0] }, printed, load)).toBe(printed);
	});

	it('claims a row the character typed without duplicating or overwriting it', () => {
		const typed = `
| Item | Qty | Weight | Worn |
|---|---|---|---|
| Lockpicks | 1 | 1 | no |
| blade or two | 1 | 2 | yes |
`;
		const { el } = openRender(typed, load);
		// The case-differing row fills its declared row rather than sitting
		// below it unrendered, and its cells are untouched.
		expect(names(el)).toEqual(['Blade or two', 'Throwing knives', 'Lockpicks']);
		const weights = Array.from(
			el.querySelectorAll<HTMLInputElement>('input[aria-label$="Weight"]'),
		).map((input) => input.value);
		expect(weights).toEqual(['2', '', '1']);
		// It stops being theirs to rename or delete, which is visible and is not
		// a loss. Nothing is written, and the note keeps its own spelling.
		expect(removeButtons(el)).toHaveLength(1);
		expect(table.write(stored(typed, load), typed, load)).toBe(typed);
	});

	it('leaves a character row unrendered on a card with open rows off', () => {
		const { el } = openRender(PACK, { ...inventory, openRows: false });
		expect(names(el)).toEqual([]);
		expect(el.querySelector('.sheetsmith-table-add-button')).toBeNull();
	});

	it('sums a totalled column under the table', () => {
		// Dagger 1 + Rope 10, and a blank cell is zero, so a row with no weight
		// still totals.
		const blank = `${PACK.trimEnd()}\n| Chalk | 1 |  | no |\n`;
		expect(footTotals(openRender(blank).el)).toEqual(['11']);
		expect(
			openRender(blank).el.querySelector('tfoot .sheetsmith-table-name')
				?.textContent,
		).toBe('Total');
	});

	it('moves the total while the cell that changed it is still being typed', () => {
		// Feedback is continuous, persistence is discrete (SPEC §4.2). The row's
		// own computed cell already moved per keystroke; the number under the
		// column it sums must not be the one derived value that waits for a blur.
		const { el } = openRender(PACK);
		expect(footTotals(el)).toEqual(['11']);
		const weight = el.querySelector(
			'input[aria-label="Dagger Weight"]',
		) as HTMLInputElement;
		weight.value = '4';
		weight.dispatchEvent(new Event('input'));
		expect(footTotals(el)).toEqual(['14']);
	});

	it('moves the total when a totalled toggle is pressed', () => {
		const worn = {
			...inventory,
			columns: [{ key: 'Worn', type: 'toggle' as const, total: true }],
		};
		const { el } = openRender(PACK, worn);
		expect(footTotals(el)).toEqual(['1']);
		(el.querySelector('tbody .sheetsmith-level-ring') as HTMLElement).click();
		expect(footTotals(el)).toEqual(['2']);
	});

	it('keeps the last good total while a draft is not yet a number', () => {
		// "-" before "-1" is not wrong yet, and a total that flashed "?" at it
		// would fire a warning at input the user is in the middle of — the delay
		// the computed cells beside it already wait out.
		vi.useFakeTimers();
		try {
			const { el } = openRender(PACK);
			const weight = el.querySelector(
				'input[aria-label="Dagger Weight"]',
			) as HTMLInputElement;
			weight.value = '-';
			weight.dispatchEvent(new Event('input'));
			expect(footTotals(el)).toEqual(['11']);
			vi.advanceTimersByTime(UNRESOLVED_DELAY + 10);
			expect(footTotals(el)).toEqual(['?']);
		} finally {
			vi.useRealTimers();
		}
	});

	it('counts the rows that are on for a totalled toggle column', () => {
		const worn = { ...inventory, columns: [{ key: 'Worn', type: 'toggle' as const, total: true }] };
		expect(footTotals(openRender(PACK, worn).el)).toEqual(['1']);
	});

	it('publishes a total as <id>.<key>', () => {
		const published = table.scopeValues?.(stored(PACK, inventory), inventory);
		expect(published?.named?.['Weight']).toEqual({ value: 11 });
	});

	it('shows ? and names the row where a cell is not a number', () => {
		const prose = `${PACK.trimEnd()}\n| Sack of coins | 1 | some | no |\n`;
		const el = openRender(prose).el;
		expect(footTotals(el)).toEqual(['?']);
		expect(
			el.querySelector('tfoot .sheetsmith-table-value')?.getAttribute('title'),
		).toBe('Sack of coins is not a number, so this column has no total.');
		// And it publishes nothing rather than the sum of the rows it could
		// read: a quietly wrong number is worse than an unknown name.
		expect(table.scopeValues?.(stored(prose, inventory), inventory)).toEqual({});
	});

	it('reports a total on a text column, naming what to do instead', () => {
		const broken = { ...inventory, columns: [{ key: 'Notes', total: true }] };
		const result = table.read(PACK, broken);
		expect(result.ok).toBe(false);
		expect(!result.ok && result.error).toContain('nothing to add up');
		const { el } = openRender(PACK, broken);
		expect(el.querySelector('.sheetsmith-error')).not.toBeNull();
		expect(el.querySelector('table')).toBeNull();
	});

	it('reports a total on a column whose key is not a name', () => {
		// A key is file vocabulary and may be anything the note reads well as. A
		// total makes it a name as well, and `inventory.Load cost` tokenises as
		// `inventory.Load` followed by a stray `cost` — so the card would show a
		// total under a name no formula could ever write.
		const spaced = {
			...inventory,
			columns: [{ key: 'Load cost', type: 'number' as const, total: true }],
		};
		const result = table.read(PACK, spaced);
		expect(!result.ok && result.error).toBe(
			'The column "Load cost" cannot show a total, because "inventory.Load cost" is not a name a formula can read. Rename the column using letters, digits and underscores, or turn the total off.',
		);
		// The hyphen is the same trap read as arithmetic rather than as two
		// tokens: "Load-cost" is "Load minus cost".
		const hyphen = {
			...inventory,
			columns: [{ key: 'Load-cost', type: 'number' as const, total: true }],
		};
		expect(table.read(PACK, hyphen).ok).toBe(false);
		// A dot would publish a name a segment deeper than the contract has, and
		// collide with the `.value` every published entry already answers to.
		const dotted = {
			...inventory,
			columns: [{ key: 'Load.cost', type: 'number' as const, total: true }],
		};
		expect(table.read(PACK, dotted).ok).toBe(false);
	});

	it('leaves a key that is not a name unreachable to an aggregate too', () => {
		// One limit, one rule. `sum(inventory, Load cost)` is not writable for
		// the same reason the column is untotallable: the tokeniser reads it as
		// two names, so there is nothing here to refuse a second time.
		const spaced = {
			...inventory,
			columns: [{ key: 'Load cost', type: 'number' as const }],
		};
		const data = stored(PACK, spaced);
		const env = buildSheetEnv([
			{
				id: spaced.id,
				values: table.scopeValues?.(data, spaced) ?? {},
				rows: table.scopeRows?.(data, spaced),
				resolver: (bound) => makeFieldResolver(table, spaced, data, bound),
			},
		]);
		expect(() => evaluate('sum(inventory, Load cost)', env.sheet, callsFrom(env))).toThrow(
			/Expected "\)"/,
		);
		// The same key under a name a formula can read is reachable.
		const named = {
			...inventory,
			columns: [{ key: 'Load_cost', type: 'number' as const }],
		};
		const paid = stored(PACK, named);
		const withName = buildSheetEnv([
			{
				id: named.id,
				values: table.scopeValues?.(paid, named) ?? {},
				rows: table.scopeRows?.(paid, named),
				resolver: (bound) => makeFieldResolver(table, named, paid, bound),
			},
		]);
		expect(
			evaluate('sum(inventory, Load_cost)', withName.sheet, callsFrom(withName)),
		).toBe(0);
	});

	it('leaves an unnamed key alone on a column with no total', () => {
		// The key is the note's column heading first. Nothing publishes it, so
		// nothing needs it to be a name.
		const spaced = {
			...inventory,
			columns: [{ key: 'Load cost', type: 'number' as const }],
		};
		expect(table.read(PACK, spaced).ok).toBe(true);
	});

	it('reports a total on a computed column, arguing from the aggregate', () => {
		// Refused before a declared row could publish and refused after: one
		// row's derived value is a value, and a sum of them over a list the
		// character owns is a different question. The message says so rather
		// than pointing at a limit that no longer exists.
		const broken = {
			...inventory,
			columns: [{ key: 'Bulk', type: 'computed' as const, formula: 'Qty', total: true }],
		};
		const result = table.read(PACK, broken);
		expect(!result.ok && result.error).toContain('adds up stored cells');
		expect(!result.ok && result.error).toContain('as many rows as the character has');
		// And the fix it names is the aggregate, which is the thing that can
		// actually add a derived value up over the rows a character has.
		expect(!result.ok && result.error).toContain('sum(inventory, <expression>)');
		// A misconfigured card publishes nothing, so a formula reading its total
		// fails and says so rather than reading a number the card refuses to show.
		expect(table.scopeValues?.(null, broken)).toEqual({});
		expect(table.scopeRows?.(null, broken)).toBeUndefined();
	});
});

/*
 * Wikilinks in cells. The note already round-trips one — that is what markdown
 * storage was chosen for — and these are the two promises the sheet itself owes:
 * that it looks like a link and that it answers a click.
 */
describe('table link cells', () => {
	const carried: TableConfig = {
		id: 'inventory',
		type: 'table',
		label: 'Inventory',
		position: { col: 1, row: 1, width: 6, height: 4 },
		rowHeader: 'Item',
		openRows: true,
		columns: [
			{ key: 'Qty', type: 'number' },
			{ key: 'Notes', type: 'text' },
		],
		rows: [{ label: 'Worn: [[Chain mail]]' }],
	};

	// The alias's pipe is escaped, because a bare one would end the cell — which
	// is what the writer does with it and what `readTable` reads back out.
	const PACK = `
| Item | Qty | Notes |
|---|---|---|
| Worn: [[Chain mail]] | 1 |  |
| [[Sunblade\\|sword]] | 1 | carried in [[Bag of Holding]] today |
| Chalk | 2 |  |
`;

	/** What the link context was asked, so the component's side can be checked. */
	function driven(
		body = PACK,
		over = carried,
		resolves: (target: string) => boolean = () => true,
	) {
		const asked: unknown[] = [];
		const changes: unknown[] = [];
		const result = table.read(body, over);
		const data = result.ok ? result.data : null;
		const el = document.createElement('div');
		table.render(el, over, data, {
			...contextFor(data, over),
			onChange: (edited) => changes.push(edited),
			link: {
				resolves,
				open: (target, event) => asked.push({ open: target, mod: event.type }),
				preview: (target, anchor) =>
					asked.push({ preview: target, on: anchor.textContent }),
			},
		});
		return { el, asked, changes };
	}

	function links(el: HTMLElement): HTMLAnchorElement[] {
		return Array.from(el.querySelectorAll<HTMLAnchorElement>('tbody a'));
	}

	it('renders an aliased link as its alias, pointing at its target', () => {
		const anchor = links(driven().el).find((a) => a.textContent === 'sword');
		expect(anchor?.classList.contains('internal-link')).toBe(true);
		expect(anchor?.getAttribute('href')).toBe('Sunblade');
		expect(anchor?.getAttribute('data-href')).toBe('Sunblade');
	});

	it('names the target of an aliased link without replacing its name', () => {
		/*
		 * The alias is what is shown, so the target is otherwise nowhere on the
		 * card — and a bare link gets nothing, since it would repeat the text
		 * already on screen.
		 *
		 * In `title` rather than `aria-label`: `aria-label` replaces the name
		 * computed from the contents, so a link reading "sword" would announce as
		 * "Sunblade" — a name that appears nowhere in the cell (WCAG 2.5.3) and
		 * nothing for voice control to match.
		 */
		const all = links(driven().el);
		const aliased = all.find((a) => a.textContent === 'sword');
		expect(aliased?.getAttribute('title')).toBe('Sunblade');
		expect(aliased?.hasAttribute('aria-label')).toBe(false);
		const bare = all.find((a) => a.textContent === 'Bag of Holding');
		expect(bare?.hasAttribute('title')).toBe(false);
		expect(bare?.hasAttribute('aria-label')).toBe(false);
	});

	it('names a linked row as the sheet shows it, not as the file spells it', () => {
		// Every place that has to *say* which row it means, for a row whose name is
		// a link. A control announcing "delete bracket bracket Sunblade pipe sword
		// bracket bracket" reads the file's syntax aloud, and on the delete control
		// it undoes the whole arm-then-commit argument: for a listener the
		// accessible name is the only naming there is.
		const { el } = driven();
		const row = el.querySelectorAll('tbody tr')[1] as HTMLElement;
		const remove = row.querySelector('.sheetsmith-table-remove-button');
		expect(remove?.getAttribute('aria-label')).toBe('Delete sword');
		expect(remove?.getAttribute('title')).toBe('Delete sword');
		// And the cells of that row, which name it the same way.
		expect(
			row.querySelector('.sheetsmith-table-number input')?.getAttribute('aria-label'),
		).toBe('sword Qty');
		// The field itself still holds the raw text: that is what is being edited.
		expect(
			(row.querySelector('.sheetsmith-table-name-input') as HTMLInputElement).value,
		).toBe('[[Sunblade|sword]]');
	});

	it('names a linked row in a total it could not read', () => {
		const prose = `${PACK.trimEnd()}\n| [[Chalk\\|chalk stick]] | some | |\n`;
		const totalled = {
			...carried,
			rows: [],
			columns: [{ key: 'Qty', type: 'number' as const, total: true }],
		};
		const { el } = driven(prose, totalled);
		expect(
			el.querySelector('tfoot .sheetsmith-table-value')?.getAttribute('title'),
		).toBe('chalk stick is not a number, so this column has no total.');
	});

	it('reveals a clipped link, and only while it is clipped', () => {
		/*
		 * The metrics are faked, as in `truncation.test.ts`: happy-dom reports 0 for
		 * both, so what a component test can prove is where the reveal is bound —
		 * which is the defect, since nothing was bound at all and a clipped link's
		 * full name was unreachable without focusing the cell.
		 */
		const { el } = driven();
		const anchor = links(el).find(
			(a) => a.textContent === 'Bag of Holding',
		) as HTMLElement;
		Object.defineProperty(anchor, 'scrollWidth', { value: 200, configurable: true });
		Object.defineProperty(anchor, 'clientWidth', { value: 100, configurable: true });
		anchor.dispatchEvent(new Event('pointerenter'));
		expect(anchor.getAttribute('title')).toBe('Bag of Holding');

		Object.defineProperty(anchor, 'clientWidth', { value: 400, configurable: true });
		anchor.dispatchEvent(new Event('pointerenter'));
		expect(anchor.hasAttribute('title')).toBe(false);
	});

	it('leaves an aliased link\'s tooltip naming its target', () => {
		// Its `title` already answers the question a tooltip on this anchor can
		// answer — where the link goes — so the truncation reveal stays off it and
		// cannot overwrite that with the text it is clipping. The remainder of a
		// clipped alias is a cell focus away.
		const { el } = driven();
		const aliased = links(el).find((a) => a.textContent === 'sword') as HTMLElement;
		Object.defineProperty(aliased, 'scrollWidth', { value: 200, configurable: true });
		Object.defineProperty(aliased, 'clientWidth', { value: 100, configurable: true });
		aliased.dispatchEvent(new Event('pointerenter'));
		expect(aliased.getAttribute('title')).toBe('Sunblade');
	});

	it('keeps the prose around a link', () => {
		const row = driven().el.querySelectorAll('tbody tr')[1] as HTMLElement;
		const cell = row.querySelector(
			'.sheetsmith-table-text .sheetsmith-table-link-layer',
		) as HTMLElement;
		// Text, anchor, text — and the sentence reads back as it was written.
		expect(cell.childNodes).toHaveLength(3);
		expect(cell.textContent).toBe('carried in Bag of Holding today');
	});

	it('marks only a layer whose whole content is the link', () => {
		// Which decides who clips: the anchor is a block where it is all there is,
		// and a block anchor beside prose takes a line of its own. `a:only-child`
		// cannot draw the line — it counts element children, so it matched a cell
		// of prose *and* one link too, and "in Bag of Holding" broke onto two
		// lines while the field under it stayed on one. The layer was then taller
		// than the field it is stacked on, so the row jumped shorter on focus —
		// the reflow the stack exists to prevent (UI.md §9).
		const row = driven().el.querySelectorAll('tbody tr')[1] as HTMLElement;
		const sole = row.querySelector(
			'.sheetsmith-table-name .sheetsmith-table-link-layer',
		) as HTMLElement;
		const mixed = row.querySelector(
			'.sheetsmith-table-text .sheetsmith-table-link-layer',
		) as HTMLElement;
		expect(sole.textContent).toBe('sword');
		expect(sole.classList.contains('sheetsmith-table-link-only')).toBe(true);
		expect(mixed.classList.contains('sheetsmith-table-link-only')).toBe(false);
	});

	it('marks a whole-cell link, and only a whole-cell link', () => {
		// The class decides who does the clipping, so it has to follow the text:
		// a cell that is one link clips as a link, and a cell that is a sentence
		// with a link in it clips as a sentence. Decided at paint, which is where
		// the text arrives — a commit re-renders, and the render is the repaint.
		const only = driven().el.querySelectorAll('tbody tr')[1] as HTMLElement;
		expect(
			only
				.querySelector('.sheetsmith-table-name .sheetsmith-table-link-layer')
				?.classList.contains('sheetsmith-table-link-only'),
		).toBe(true);

		const sentence = `
| Item | Qty | Notes |
|---|---|---|
| [[Sunblade\\|sword]], drawn | 1 |  |
`;
		// Index 1: the layout's own declared row is drawn first, whoever fills it.
		const row = driven(sentence).el.querySelectorAll('tbody tr')[1] as HTMLElement;
		expect(
			row
				.querySelector('.sheetsmith-table-name .sheetsmith-table-link-layer')
				?.classList.contains('sheetsmith-table-link-only'),
		).toBe(false);
	});

	it('renders a link in a declared row name with no field to edit it', () => {
		// Static text from the layout: the display alone, and no stack.
		const el = driven().el;
		const name = el.querySelector('tbody .sheetsmith-table-name') as HTMLElement;
		expect(name.querySelector('input')).toBeNull();
		expect(name.querySelector('a')?.textContent).toBe('Chain mail');
		expect(name.textContent).toBe('Worn: Chain mail');
	});

	it('marks a link whose target does not exist', () => {
		const { el } = driven(PACK, carried, (target) => target !== 'Sunblade');
		const unresolved = links(el).filter((a) =>
			a.classList.contains('is-unresolved'),
		);
		expect(unresolved.map((a) => a.getAttribute('data-href'))).toEqual(['Sunblade']);
	});

	it('opens the note on a press, without touching the cell behind it', () => {
		const { el, asked } = driven();
		const anchor = links(el).find((a) => a.textContent === 'sword') as HTMLElement;
		anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		expect(asked).toEqual([{ open: 'Sunblade', mod: 'click' }]);
		// The press belongs to the link. The field under it must not take focus
		// and must not commit anything.
		expect(document.activeElement).not.toBe(
			el.querySelector('.sheetsmith-table-name-input'),
		);
	});

	it('offers the anchor to the hover preview', () => {
		const { el, asked } = driven();
		const anchor = links(el).find((a) => a.textContent === 'sword') as HTMLElement;
		anchor.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		expect(asked).toEqual([{ preview: 'Sunblade', on: 'sword' }]);
	});

	it('renders the link and swallows the press with no link context', () => {
		// A unit test, and the harness before its own stub is wired. The markup is
		// the component's business; the vault is not.
		const data = stored(PACK, carried);
		const el = document.createElement('div');
		table.render(el, carried, data, contextFor(data, carried));
		const anchor = links(el).find((a) => a.textContent === 'sword') as HTMLElement;
		expect(anchor.classList.contains('is-unresolved')).toBe(false);
		expect(() =>
			anchor.dispatchEvent(new MouseEvent('click', { bubbles: true })),
		).not.toThrow();
	});

	it('edits the raw text the note holds', () => {
		const { el } = driven();
		const input = el.querySelector(
			'.sheetsmith-table-linked .sheetsmith-table-name-input',
		) as HTMLInputElement;
		// What a source-mode view of the same line would show.
		expect(input.value).toBe('[[Sunblade|sword]]');
	});

	it('is not spellchecked while the link layer is what is on screen', () => {
		// `[[Sunblade|sword]]` is not two words, and the field's text is
		// transparent unfocused, so the marks would land on the rendered link.
		const { el } = driven();
		const input = el.querySelector(
			'.sheetsmith-table-linked .sheetsmith-table-name-input',
		) as HTMLInputElement;
		expect(input.getAttribute('spellcheck')).toBe('false');
		input.dispatchEvent(new Event('focus'));
		expect(input.getAttribute('spellcheck')).toBe('true');
	});

	it('leaves the anchor alone when a commit lands, so focus survives', () => {
		/*
		 * The anchor is the next tab stop inside the cell, so tabbing out of the
		 * field moves focus *onto it* — and that is what blurs the field and
		 * commits. A component that repainted the layer here destroyed the element
		 * the browser had just focused: `activeElement` fell to the body, the view
		 * captured no focus, and the user was dropped out of the row mid-edit.
		 *
		 * The rebuild is what repaints, and `a[href]` is in the view's focusable
		 * list so the anchor is captured and restored across it.
		 */
		const { el, changes } = driven();
		// Attached, because "did this element survive" is a question about a
		// document: everything in a detached container reports `isConnected` false
		// whatever the code does, which is a way to write this test that passes
		// before the fix and after it.
		document.body.appendChild(el);
		try {
			const row = el.querySelectorAll('tbody tr')[1] as HTMLElement;
			const input = row.querySelector(
				'.sheetsmith-table-name-input',
			) as HTMLInputElement;
			const anchor = row.querySelector('a') as HTMLElement;
			expect(anchor.isConnected).toBe(true);
			input.value = '[[Moonblade|blade]]';
			input.dispatchEvent(new Event('blur'));
			expect(anchor.isConnected).toBe(true);
			// And the edit was reported, so the rebuild that repaints it will happen.
			expect(changes).toEqual([{ rows: { 1: { name: '[[Moonblade|blade]]' } } }]);
		} finally {
			el.remove();
		}
	});

	it('leaves a cell with no link exactly as it was', () => {
		// The property that keeps an eighteen-row skills card unchanged: no
		// wrapper, no layer, no extra element.
		const { el } = driven();
		const plain = el.querySelectorAll('tbody tr')[2] as HTMLElement;
		expect(plain.querySelector('.sheetsmith-table-linked')).toBeNull();
		expect(plain.querySelector('.sheetsmith-table-link-layer')).toBeNull();
		// Including the spellcheck toggle: it is the stacking that needs it, and an
		// unstacked cell is an ordinary text field.
		expect(
			plain
				.querySelector('.sheetsmith-table-name-input')
				?.hasAttribute('spellcheck'),
		).toBe(false);
		expect(
			(plain.querySelector('.sheetsmith-table-name-input') as HTMLInputElement)
				.value,
		).toBe('Chalk');
	});

	it('draws no link in a number cell', () => {
		// A number is the row's arithmetic, not text somebody wrote.
		const numeric = {
			...carried,
			rows: [],
			columns: [{ key: 'Qty', type: 'number' as const }],
		};
		const body = '\n| Item | Qty |\n|---|---|\n| Rope | [[two]] |\n';
		expect(links(driven(body, numeric).el)).toEqual([]);
	});
});

/*
 * The rows an aggregate walks (SPEC §5).
 *
 * Driven through the real environment rather than through `scopeRows` alone,
 * because what these are about is a formula elsewhere on the sheet reading the
 * table: `sum(inventory, Qty * Weight)` is the whole feature and the member is
 * how it is reached.
 */
describe('table publishes its rows to an aggregate', () => {
	/** An open inventory: one declared row, the rest the character's. */
	const inventory: TableConfig = {
		id: 'inventory',
		type: 'table',
		label: 'Inventory',
		position: { col: 1, row: 1, width: 6, height: 2 },
		rowHeader: 'Item',
		openRows: true,
		rows: [{ label: "Adventurer's pack" }],
		columns: [
			{ key: 'Qty', type: 'number', min: 0 },
			{ key: 'Weight', type: 'number', total: true },
			{ key: 'Worn', type: 'toggle' },
		],
	};

	const PACK = `
| Item | Qty | Weight | Worn |
|---|---|---|---|
| Adventurer's pack | 1 | 12 | no |
| Dagger | 2 | 1 | yes |
| Rope | 1 | 10 | no |
`;

	/**
	 * The sheet the card sits on, built as the view builds it: the abilities a
	 * row formula might read, and the card itself, resolving against the
	 * finished environment.
	 */
	function envWith(over: TableConfig, body: string | null) {
		const data = body === null ? null : stored(body, over);
		return buildSheetEnv([
			{
				id: 'abilities',
				values: { named: { STR: { value: 3 } } },
			},
			{ id: 'armour_class', values: { self: { value: 16 } } },
			{
				id: over.id,
				values: table.scopeValues?.(data, over) ?? {},
				rows: table.scopeRows?.(data, over),
				resolver: (env) => makeFieldResolver(table, over, data, env),
			},
		]);
	}

	const sum = (formula: string, over = inventory, body: string | null = PACK) => {
		const env = envWith(over, body);
		return evaluate(formula, env.sheet, callsFrom(env));
	};

	it('sums a stored column over every row the card draws', () => {
		expect(sum('sum(inventory, Weight)')).toBe(23);
	});

	it('sums an expression, which is what an encumbrance rule is', () => {
		expect(sum('sum(inventory, Qty * Weight)')).toBe(24);
	});

	it('filters on a toggle column, and counts what it reaches', () => {
		expect(sum('sum(inventory, Weight, Worn)')).toBe(1);
		expect(sum('count(inventory)')).toBe(3);
		expect(sum('count(inventory, Worn)')).toBe(1);
	});

	it('walks declared and character rows alike, in the order render draws them', () => {
		// The declared row first whatever the note's order, then the
		// character's in note order — the same helper `render` uses, so the
		// number a formula reads counts the rows a reader can see.
		const reordered = `
| Item | Qty | Weight | Worn |
|---|---|---|---|
| Dagger | 2 | 1 | yes |
| Adventurer's pack | 1 | 12 | no |
`;
		const data = stored(reordered, inventory);
		const env = envWith(inventory, reordered);
		const rows = table
			.scopeRows?.(data, inventory)
			?.(makeFieldResolver(table, inventory, data, env));
		expect(rows?.map((row) => row.label)).toEqual(["Adventurer's pack", 'Dagger']);
	});

	it('is 0 over a card with no rows at all', () => {
		// An open card declaring nothing, over a note holding nothing: an empty
		// inventory weighs nothing, and a new character's sheet must not be full
		// of "?".
		const open: TableConfig = { ...inventory, rows: [] };
		expect(sum('sum(inventory, Weight)', open, null)).toBe(0);
		expect(sum('count(inventory)', open, null)).toBe(0);
	});

	it('walks a declared row the note has no row for', () => {
		// The card renders it with blank cells, so the aggregate counts it and
		// its blank number cell is 0 — the number the reader is looking at.
		expect(sum('sum(inventory, Weight)', inventory, null)).toBe(0);
		expect(sum('count(inventory)', inventory, null)).toBe(1);
	});

	it('counts a blank number cell as zero, as the column already does', () => {
		const blanks = `
| Item | Qty | Weight | Worn |
|---|---|---|---|
| Rope | 1 |  | no |
`;
		// Two rows: the unclaimed declared one and the character's.
		expect(sum('sum(inventory, Weight)', inventory, blanks)).toBe(0);
		expect(sum('count(inventory)', inventory, blanks)).toBe(2);
	});

	it('reads a declared computed column, where a total on one is refused', () => {
		// The two halves §4.2 separated. `total` had no scope to evaluate a
		// formula in; this is handed a resolver bound to the finished sheet.
		const withLoad: TableConfig = {
			...inventory,
			columns: [...(inventory.columns ?? []), {
				key: 'Load',
				type: 'computed',
				formula: 'Qty * Weight',
			}],
		};
		expect(sum('sum(inventory, Load)', withLoad)).toBe(24);
	});

	it('reads a row value and a name off the sheet from inside a row expression', () => {
		const withValues: TableConfig = {
			...inventory,
			rows: [{ label: "Adventurer's pack", values: { bulk: 'abilities.STR' } }],
		};
		// Only the declared row carries `bulk`, so the character's rows fail on
		// it — which is the aggregate naming the first row that cannot be read.
		expect(() => sum('sum(inventory, bulk)', withValues)).toThrow(
			/Row "Dagger": unknown name "bulk"/,
		);
	});

	it('names the row holding text in a number column', () => {
		const bad = `
| Item | Qty | Weight | Worn |
|---|---|---|---|
| Dagger | 2 | 1 | yes |
| Rope | 1 | a coil | no |
`;
		expect(() => sum('sum(inventory, Weight)', inventory, bad)).toThrow(
			'Row "Rope": sum() needs a number, got "a coil".',
		);
	});

	it('calls a row with no name what everything else on the card calls it', () => {
		// The add control writes one deliberately, so a nameless row is
		// ordinary. A reader hearing the cell, the delete control and this has
		// to be able to tell they are the same row.
		const nameless = `
| Item | Qty | Weight | Worn |
|---|---|---|---|
|  | 1 | a coil | no |
`;
		expect(() => sum('sum(inventory, Weight)', inventory, nameless)).toThrow(
			'Row "Unnamed row": sum() needs a number, got "a coil".',
		);
	});

	it('names the row as a reader sees it, never as the note spells it', () => {
		const linked = `
| Item | Qty | Weight | Worn |
|---|---|---|---|
| [[Sunblade\\|sword]] | 1 | heavy | no |
`;
		expect(() => sum('sum(inventory, Weight)', inventory, linked)).toThrow(
			'Row "sword": sum() needs a number, got "heavy".',
		);
	});

	it('refuses a computed column that aggregates over its own table', () => {
		// Through no published name at all, so this is the row table's own
		// guard. The cell shows "?" and says why, and the rest of the card is
		// still drawn and still editable.
		const selfSumming: TableConfig = {
			...inventory,
			columns: [...(inventory.columns ?? []), {
				key: 'Load',
				type: 'computed',
				formula: 'sum(inventory, Weight)',
			}],
		};
		const data = stored(PACK, selfSumming);
		const env = envWith(selfSumming, PACK);
		const explain = makeFieldExplainer(table, selfSumming, data, env);
		expect(explain('columns.3.formula', {})).toContain('already being read');
		// And an aggregate elsewhere on the sheet over the same table is
		// refused too, rather than reading a number the cell cannot show.
		expect(() => sum('sum(inventory, Weight)', selfSumming)).toThrow(
			/already being read/,
		);

		const el = document.createElement('div');
		table.render(el, selfSumming, data, {
			resolved: {},
			resolveField: makeFieldResolver(table, selfSumming, data, env),
			explainField: explain,
			onChange: () => undefined,
		});
		const computed = Array.from(
			el.querySelectorAll('tbody .sheetsmith-table-value'),
		);
		expect(computed.map((cell) => cell.textContent)).toEqual(['?', '?', '?']);
		// The rest of the card still draws and is still editable: the failure
		// is one column's, not the component's.
		const names = Array.from(
			el.querySelectorAll<HTMLInputElement>('.sheetsmith-table-name-input'),
		);
		// The declared row's name is text rather than a field, because the
		// layout owns it; the character's two are still fields.
		expect(names.map((input) => input.value)).toEqual(['Dagger', 'Rope']);
		expect(names.some((input) => input.disabled)).toBe(false);
	});

	it('publishes no rows from a card that will not configure', () => {
		// A misconfigured card publishes no names either. Summing rows the card
		// is refusing to show would be a number derived from a configuration
		// nobody has agreed to yet.
		const broken: TableConfig = {
			...inventory,
			columns: [{ key: 'Notes', type: 'text', total: true }],
		};
		expect(table.scopeRows?.(null, broken)).toBeUndefined();
	});

	/*
	 * The readout following the rows, which is what the harness is for looking
	 * at and what this pins so a change to either side cannot break it quietly.
	 *
	 * One loop, driven the way the sheet drives it: render, take the reported
	 * edit, `write` it, `read` it back, rebuild the environment, and ask the
	 * aggregate again. A component that reported an edit it cannot read back
	 * shows up here rather than on a card.
	 */
	describe('the readout follows the rows', () => {
		/** The aggregate over a body, as a card elsewhere on the sheet reads it. */
		const readout = (body: string, over = inventory) => {
			const env = envWith(over, body);
			return evaluate('sum(inventory, Qty * Weight)', env.sheet, callsFrom(env));
		};

		/** Render, drive one gesture, and return the note it would be saved as. */
		const commit = (
			body: string,
			drive: (el: HTMLElement) => void,
			over = inventory,
		): string => {
			const data = stored(body, over);
			const changes: unknown[] = [];
			const el = document.createElement('div');
			table.render(el, over, data, {
				resolved: {},
				resolveField: makeFieldResolver(table, over, data, envWith(over, body)),
				onChange: (edited) => changes.push(edited),
			});
			drive(el);
			expect(changes).toHaveLength(1);
			return table.write(changes[0] as TableData, body, over);
		};

		it('grows when a row is added and edited', () => {
			expect(readout(PACK)).toBe(24);
			const added = commit(PACK, (el) =>
				(el.querySelector('.sheetsmith-table-add-button') as HTMLElement).click(),
			);
			// A blank row is worth nothing, so the number holds while the player
			// fills it in — and the row is really there, which the count says.
			expect(readout(added)).toBe(24);
			const env = envWith(inventory, added);
			expect(evaluate('count(inventory)', env.sheet, callsFrom(env))).toBe(4);

			const filled = added.replace('|  |  |  |  |', '| Torch | 2 | 1 | no |');
			expect(readout(filled)).toBe(26);
		});

		it('shrinks when a row is deleted', () => {
			const after = commit(PACK, (el) => {
				// Two presses: the first arms, the second commits.
				const trash = el.querySelectorAll<HTMLElement>(
					'tbody .sheetsmith-table-remove-button',
				);
				const rope = trash[trash.length - 1] as HTMLElement;
				rope.click();
				rope.click();
			});
			// The rope was 1 x 10 of the 24.
			expect(readout(after)).toBe(14);
		});

		it('moves on commit and not per keystroke', () => {
			// SPEC §4.2's "a published name reads the note; a cell reads the
			// draft", from the aggregate's side: the row set is built from the
			// data the sheet was rendered with, so a formula elsewhere holds its
			// last committed number until the sheet rebuilds. The totals row
			// under the column is the one that moves per keystroke.
			const data = stored(PACK, inventory);
			const changes: unknown[] = [];
			const el = document.createElement('div');
			table.render(el, inventory, data, {
				resolved: {},
				resolveField: makeFieldResolver(table, inventory, data, envWith(inventory, PACK)),
				onChange: (edited) => changes.push(edited),
			});
			const qty = el.querySelectorAll<HTMLInputElement>(
				'tbody .sheetsmith-table-input',
			)[0] as HTMLInputElement;
			// The first cell field on the card is the declared pack's quantity.
			qty.value = '9';
			qty.dispatchEvent(new Event('input', { bubbles: true }));
			// Nothing has reached the note, so nothing has reached the aggregate.
			expect(changes).toEqual([]);
			expect(readout(PACK)).toBe(24);

			qty.dispatchEvent(new FocusEvent('blur'));
			expect(changes).toHaveLength(1);
			const committed = table.write(changes[0] as TableData, PACK, inventory);
			// Nine packs at 12, the dagger's 2 and the rope's 10.
			expect(readout(committed)).toBe(120);
		});
	});

	it('holds no rows on a component that never had any', () => {
		expect(() => sum('sum(armour_class, Weight)')).toThrow(/holds no rows/);
	});
});

/*
 * The two-consumer guard (PATTERNS §1). A column's total and `sum()` over the
 * same column are two call sites for one piece of arithmetic, kept apart on
 * purpose — a total reads the draft and a published name reads the note — so
 * this is the test that has to fail when they disagree.
 */
describe('a column total and sum() over the same rows agree', () => {
	// Number and level columns, which is the whole of where the two paths are
	// spelled the same. A toggle column is the exception and has its own test at
	// the end of this block, with the reason.

	const config: TableConfig = {
		id: 'inventory',
		type: 'table',
		label: 'Inventory',
		position: { col: 1, row: 1, width: 6, height: 2 },
		rowHeader: 'Item',
		openRows: true,
		columns: [
			{ key: 'Weight', type: 'number', total: true },
			{ key: 'Worn', type: 'toggle', total: true },
			{ key: 'Training', type: 'level', max: 2, total: true },
		],
	};

	/** Both numbers over one note: the published total, and the aggregate. */
	function both(body: string, key: string) {
		const data = stored(body, config);
		const env = buildSheetEnv([
			{
				id: config.id,
				values: table.scopeValues?.(data, config) ?? {},
				rows: table.scopeRows?.(data, config),
				resolver: (bound) => makeFieldResolver(table, config, data, bound),
			},
		]);
		return {
			total: env.sheet(`inventory.${key}`),
			aggregate: evaluate(`sum(inventory, ${key})`, env.sheet, callsFrom(env)),
		};
	}

	it('agrees on a column of whole numbers', () => {
		const body = `
| Item | Weight | Worn | Training |
|---|---|---|---|
| Dagger | 1 | yes | 1 |
| Rope | 10 | no | 0 |
| Sunblade | 3 | yes | 2 |
`;
		const weight = both(body, 'Weight');
		expect(weight.aggregate).toBe(weight.total);
		expect(weight.total).toBe(14);
	});

	it('agrees on a column of tenths, where float summation would part them', () => {
		// 0.1 + 0.2 is 0.30000000000000004. One expression reading that where
		// the number under the column reads 0.3 is the drift `roundSum` exists
		// in one place to prevent.
		const body = `
| Item | Weight | Worn | Training |
|---|---|---|---|
| Chalk | 0.1 | no | 0 |
| Charcoal | 0.2 | no | 0 |
`;
		const weight = both(body, 'Weight');
		expect(weight.total).toBe(0.3);
		expect(weight.aggregate).toBe(weight.total);
	});

	it('agrees on a level column, whose cell is already a number', () => {
		const body = `
| Item | Weight | Worn | Training |
|---|---|---|---|
| Dagger | 1 | yes | 1 |
| Rope | 10 | x | 2 |
| Sunblade | 3 |  | 0 |
`;
		const training = both(body, 'Training');
		expect(training.aggregate).toBe(training.total);
		expect(training.total).toBe(3);
	});

	it('answers a toggle column with count(), which is what a toggle total is', () => {
		// **The scope of the two tests above is number and level**, and this is
		// why: on a toggle column the two paths are spelled differently. A toggle
		// cell is `true` to a formula, which `sum()` refuses as it refuses any
		// non-number, while the totals row maps it to 1. So the aggregate for
		// "how many are worn" is `count(inventory, Worn)` — the same number,
		// asked the way the language asks it — and `sum(inventory, Worn)` names
		// that as the fix rather than inventing a coercion the language has
		// nowhere else. `cellValue` is still one rule for what a cell is worth;
		// what differs is what the two accumulators accept.
		const body = `
| Item | Weight | Worn | Training |
|---|---|---|---|
| Dagger | 1 | yes | 1 |
| Rope | 10 | x | 2 |
| Sunblade | 3 |  | 0 |
`;
		const data = stored(body, config);
		const env = buildSheetEnv([
			{
				id: config.id,
				values: table.scopeValues?.(data, config) ?? {},
				rows: table.scopeRows?.(data, config),
				resolver: (bound) => makeFieldResolver(table, config, data, bound),
			},
		]);
		expect(env.sheet('inventory.Worn')).toBe(2);
		expect(evaluate('count(inventory, Worn)', env.sheet, callsFrom(env))).toBe(2);
		expect(() => evaluate('sum(inventory, Worn)', env.sheet, callsFrom(env))).toThrow(
			'Row "Dagger": sum() adds numbers up and this is yes or no. Count the rows it holds for instead, with count(inventory, <condition>).',
		);
	});
});

/*
 * Item modifiers (SPEC §5): a row of a table declaring a change against a value
 * published elsewhere on the sheet.
 *
 * A magic-items list, which is what a target column exists for: nothing
 * declared, every row the character's, and each one naming what it changes. The
 * value being changed is a Computed component elsewhere, so nothing here
 * publishes the number a modifier lands on — which is the whole point.
 */
/**
 * One part's outcome, with only the members a case cares about spelled out.
 *
 * A builder rather than a literal per case, because `ModifierOutcome` has eight
 * members and six of them are the same in almost every case here: what a case is
 * about is `applies`, `amount` and `suppressed`, and eight-member literals were
 * hiding that. It also means adding a member to the contract is one edit.
 */
function outcomeOf(over: Partial<ModifierOutcome> = {}): ModifierOutcome {
	return {
		definition: null,
		typed: null,
		target: '',
		targetLabel: '',
		applies: false,
		amount: null,
		condition: null,
		suppressed: null,
		...over,
	};
}

/**
 * A named part's outcome: the definition, the label of what it changes, and the
 * two members a case is usually about.
 *
 * Applying with an amount of 1 by default, because that is the state most cases
 * start from and vary one member of.
 */
function named(
	definition: ModifierDefinitionView,
	over: Partial<ModifierOutcome> = {},
): ModifierOutcome {
	return outcomeOf({
		definition,
		target: definition.target,
		targetLabel: definition.targetLabel,
		applies: true,
		amount: 1,
		...over,
	});
}

/** A modifier context whose definitions and breakdowns a case supplies. */
function modifierContext(
	over: Partial<ModifierContext> = {},
): ModifierContext {
	return {
		definitions: [],
		targets: [],
		published: [],
		bonusTypes: [],
		outcome: () => outcomeOf(),
		breakdown: () => ({ override: null, total: 0, lines: [] }),
		// The host's write, absent here: a component drawn with no view around it
		// has nothing to write a layout with, and the form says so rather than
		// hiding the gesture.
		promote: () =>
			Promise.resolve({
				error: 'This sheet cannot save a modifier to its layout.',
			}),
		...over,
	};
}

describe('table and its enrolments', () => {
	const items: TableConfig = {
		id: 'items',
		type: 'table',
		label: 'Magic items',
		position: { col: 1, row: 1, width: 6, height: 2 },
		rowHeader: 'Item',
		openRows: true,
		columns: [
			{ key: 'Effect', type: 'modifier' },
			{ key: 'Aid', type: 'modifier' },
			{ key: 'Worn', type: 'toggle' },
		],
	};

	const ITEMS_BODY = `
| Item | Effect | Aid | Worn |
|---|---|---|---|
| Belt of Giant Strength | Belt | Bull's Strength | yes |
| Gauntlets of Ogre Power | Gauntlets |  |  |
| Chalk |  |  |  |
`;

	/** The enrolments this card declares, resolved against a bare environment. */
	function pushesOf(over: TableConfig, body: string) {
		const data = stored(body, over);
		const source = table.scopeModifiers?.(data, over);
		if (source === undefined) throw new Error('expected a modifier source');
		return source(makeFieldResolver(table, over, data, NO_ENV));
	}

	it('enrols once per filled cell, and not at all from a blank one', () => {
		/*
		 * A blank cell is the ordinary case on an inventory, not a degenerate one:
		 * most rows change nothing.
		 *
		 * **Two modifier columns still push from both, and that is asserted rather
		 * than assumed.** One column is now enough — a cell holds every modifier its
		 * row applies — but a layout already declaring two keeps working: the
		 * redundancy is reported in the layout editor and refused nowhere here,
		 * because `configError` would take the table and every modifier its rows
		 * apply down with it (§10, Constraint 4).
		 *
		 * Every enrolment carries the card's own label as well as the row's: a row
		 * label alone cannot name a source when two modifier tables on one sheet
		 * each hold a "Ring".
		 */
		const pushes = pushesOf(items, ITEMS_BODY);
		expect(
			pushes.map((push) => [push.part, push.row.label, push.source]),
		).toEqual([
			['Belt', 'Belt of Giant Strength', 'Magic items'],
			["Bull's Strength", 'Belt of Giant Strength', 'Magic items'],
			['Gauntlets', 'Gauntlets of Ogre Power', 'Magic items'],
		]);
	});

	it('enrols once per name in one cell, in the cell\'s own order', () => {
		/*
		 * The second wave's whole footprint on this side: a cell holds a list, so
		 * three names in one cell reach the formula layer as three pushes over one
		 * `RowValues` — exactly as three cells did. `ModifierPush`,
		 * `ModifierSource` and this method's signature are all untouched.
		 */
		const body = `
| Item | Effect | Aid | Worn |
|---|---|---|---|
| Belt | Belt; Bull's Strength ;Plate armour |  | yes |
`;
		const pushes = pushesOf(items, body);
		expect(pushes.map((push) => push.part)).toEqual([
			'Belt',
			"Bull's Strength",
			'Plate armour',
		]);
		// One row object, still: the split changed how many names a cell yields
		// and nothing about how many accounts of the row there are.
		expect(new Set(pushes.map((push) => push.row)).size).toBe(1);
	});

	it('collapses a repeat within one cell, and drops an empty part', () => {
		// A read and never a write: the cell keeps its own text until the reader
		// changes that row's modifiers.
		const body = `
| Item | Effect | Aid | Worn |
|---|---|---|---|
| Belt | Belt;;Belt; Gauntlets |  |  |
`;
		expect(pushesOf(items, body).map((push) => push.part)).toEqual([
			'Belt',
			'Gauntlets',
		]);
	});

	it('round-trips a cell spelled the way a hand-editor spells one', () => {
		/*
		 * Constraint 3, over the property §6 rests on. `parse/table.ts` rewrites
		 * only the cells whose text actually changed, so every tolerated spelling
		 * keeps its own bytes — and the canonical `'; '` join reaches the file only
		 * where the reader has just changed that row's modifiers. There is no
		 * normalising pass for byte identity to lose to, which a canonical join
		 * running on *read* would have broken here.
		 */
		for (const cell of [
			'Belt ;Gauntlets',
			'Belt;;Gauntlets',
			'Belt ; Gauntlets',
			// **And every spelling the second tier makes reachable**, which is where
			// the property has teeth: a typed part's internal spacing is as
			// hand-editable as the separator's, and neither is normalised.
			'armour_class+=2',
			'armour_class  +=  2 as item',
			'Plate armour ;armour_class += 2 as item when Worn',
			'armour_class +=',
		]) {
			const body = `
| Item | Effect | Aid | Worn |
|---|---|---|---|
| Belt | ${cell} |  |  |
`;
			expect(table.write(stored(body, items), body, items), cell).toBe(body);
		}
	});

	it('hands over one row object however many of its cells enrol', () => {
		// Built once per row rather than per cell: the two enrolments on one row
		// are evaluated against one account of it, so a definition reading a cell
		// cannot see two different values for it.
		const pushes = pushesOf(items, ITEMS_BODY);
		expect(pushes[0]?.row).toBe(pushes[1]?.row);
	});

	it('hands over the row\'s own names, including its toggle cells', () => {
		// Which is what makes `when: "Worn"` an ordinary cell rather than a second
		// stored fact: the flag reaches the definition through the row scope.
		expect(pushesOf(items, ITEMS_BODY)[0]?.row.values.Worn).toBe(true);
	});

	it('hands over a computed column too, so an amount may read one', () => {
		const computedRow: TableConfig = {
			...items,
			columns: [
				{ key: 'Effect', type: 'modifier' },
				{ key: 'Charges', type: 'number' },
				{ key: 'Doubled', type: 'computed', formula: 'Charges * 2' },
			],
		};
		const body = `
| Item | Effect | Charges |
|---|---|---|
| Wand | Charge | 3 |
`;
		const row = pushesOf(computedRow, body)[0]?.row;
		expect(row?.values.Charges).toBe(3);
		expect(row?.values.Doubled).toBe(6);
	});

	it('names a row as a reader sees it, never as the file spells it', () => {
		// `RowValues.label`'s rule one layer out: a breakdown reading
		// "[[Sunblade|sword]]" names nothing anybody can find on the card.
		const body = `
| Item | Effect | Aid | Worn |
|---|---|---|---|
| [[Ring of Protection\\|ring]] | Ring |  |  |
`;
		expect(pushesOf(items, body)[0]?.row.label).toBe('ring');
	});

	it('declares nothing where no column is a modifier', () => {
		const noneAtAll = {
			...items,
			columns: [{ key: 'Worn', type: 'toggle' as const }],
		};
		expect(
			table.scopeModifiers?.(stored(ITEMS_BODY, noneAtAll), noneAtAll),
		).toBeUndefined();
	});

	it('declares nothing from a configuration it is refusing to draw', () => {
		// The same argument `scopeRows` makes: filling a slot from a config nobody
		// has agreed to yet would be a number derived from an error.
		const broken = {
			...items,
			columns: [...(items.columns ?? []), { key: 'Effect', type: 'modifier' as const }],
		};
		expect(table.scopeModifiers?.(null, broken)).toBeUndefined();
	});

	it('keeps the cell\'s spelling whatever the layout declares', () => {
		// The component cannot know what a definition is, so a name nothing
		// declares travels exactly as a name something does.
		const body = `
| Item | Effect | Aid | Worn |
|---|---|---|---|
| Amulet | Ring of Nonexistence |  |  |
`;
		expect(pushesOf(items, body)[0]?.part).toBe('Ring of Nonexistence');
		const data = stored(body, items);
		expect(table.write(data, body, items)).toBe(body);
	});

	it('publishes no name for a row that enrols', () => {
		/*
		 * The sentence the whole design rests on: `<id>.<name>` is a fixed-row
		 * mechanism and stays one, so a row a character typed publishes nothing
		 * however many values it changes.
		 */
		const values = table.scopeValues?.(stored(ITEMS_BODY, items), items) ?? {};
		// Nothing at all: no `self`, and not one named entry.
		expect(values).toEqual({});
		const scope = buildSheetScope([{ id: 'items', values }]);
		expect(scope('items')).toBeUndefined();
		for (const row of [
			'Belt of Giant Strength',
			'Gauntlets of Ogre Power',
			'Chalk',
		]) {
			expect(scope(`items.${row}`), row).toBeUndefined();
		}
	});

	it('reaches a row scope as its own text, with no special case', () => {
		/*
		 * A modifier cell is exactly what a `text` cell already is to a formula:
		 * `rowScope` layers every non-computed cell by column key and `cellValue`
		 * falls through to the trimmed string. So `sum(items, Effect)` fails
		 * naming the row and the value, as it already does over a text column —
		 * no special case, and none wanted.
		 */
		const data = stored(ITEMS_BODY, items);
		const source = table.scopeRows?.(data, items);
		const rows = source?.(makeFieldResolver(table, items, data, NO_ENV)) ?? [];
		expect(rows[0]?.values.Effect).toBe('Belt');
		const env = buildSheetEnv([{ id: 'items', values: {}, rows: source }]);
		expect(() =>
			evaluate('sum(items, Effect)', env.sheet, callsFrom(env)),
		).toThrow('Row "Belt of Giant Strength"');
	});

	it('round-trips a modifier column byte for byte', () => {
		// Constraint 3, over two filled cells and two blank ones.
		const data = stored(ITEMS_BODY, items);
		expect(table.write(data, ITEMS_BODY, items)).toBe(ITEMS_BODY);
	});

	it('round-trips a note written against the shipped shape', () => {
		/*
		 * The acceptance criterion's own case, and the only migration there is:
		 * none. A note written against the shipped design holds a `Modifies` cell
		 * naming a published value and a `Bonus` cell holding an amount; the
		 * layout now declares neither, and §4.2's existing rule for a column the
		 * layout no longer declares leaves both in the note, unrendered and
		 * untouched. So Constraint 3 holds by not being in the diff.
		 *
		 * Nothing could have rewritten them either: a target cell names a value
		 * and there is no definition of that name to point it at, so any automatic
		 * rewrite would be a guess.
		 */
		const shipped: TableConfig = {
			...items,
			columns: [{ key: 'Effect', type: 'modifier' }],
		};
		const old = `
| Item | Modifies | Bonus | Effect |
|---|---|---|---|
| Belt of Giant Strength | abilities.STR | 2 |  |
`;
		const data = stored(old, shipped);
		expect(table.write(data, old, shipped)).toBe(old);
		// And nothing enrols, because the cell the layout does read is blank.
		expect(pushesOf(shipped, old)).toEqual([]);
	});

	it('reads a column a layout still types "target" as the default', () => {
		/*
		 * The type is gone from the vocabulary, so `columnType` falls through to
		 * `text` and the cell draws as a text field holding the name the note has.
		 * Rendered, not corrected: the author retypes the column to Modifier once
		 * they have written the definitions those names should have been.
		 */
		const stale = {
			...items,
			columns: [{ key: 'Modifies', type: 'target' }],
		} as unknown as TableConfig;
		const old = `
| Item | Modifies |
|---|---|
| Belt of Giant Strength | abilities.STR |
`;
		const data = stored(old, stale);
		expect(table.write(data, old, stale)).toBe(old);
		expect(table.scopeModifiers?.(data, stale)).toBeUndefined();
		const el = document.createElement('div');
		table.render(el, stale, data, contextFor(data, stale));
		expect(
			el.querySelector<HTMLInputElement>('tbody td input')?.value,
		).toBe('abilities.STR');
	});
});

describe('table.configError over a modifier column', () => {
	const base: TableConfig = {
		id: 'items',
		type: 'table',
		label: 'Magic items',
		position: { col: 1, row: 1, width: 6, height: 2 },
		openRows: true,
	};

	/** The refusal, or null: read through `read`, which is where it is reported. */
	const refusal = (columns: TableConfig['columns']) => {
		const result = table.read('', { ...base, columns });
		return result.ok ? null : result.error;
	};

	it('refuses a total on a modifier column, naming the fix', () => {
		const said = refusal([{ key: 'Effect', type: 'modifier', total: true }]);
		expect(said).toContain('a modifier cell holds the changes a row applies');
		expect(said).toContain('turn the total off');
	});

	it('refuses nothing at all for a second modifier column', () => {
		/*
		 * Asserted, because refusing here is the tempting answer and the worst one:
		 * `withdrawnNotice` means a refusal takes the table *and every modifier its
		 * rows apply* down with it, so a player's inventory would disappear because
		 * a layout has a column too many (§10, Constraint 4). One column is enough
		 * and the redundancy is reported in the layout editor, where the fix is.
		 *
		 * **Why the shipped cap went at all**, since this is the case that replaced
		 * it: the refusal existed because a modifier *amount* cell had no way to say
		 * which of two target columns it belonged to. A cell holds every modifier its
		 * row applies now, so there is nothing to pair and nothing to be ambiguous
		 * about.
		 */
		expect(
			refusal([
				{ key: 'Modifiers', type: 'modifier' },
				{ key: 'Aid', type: 'modifier' },
				{ key: 'More', type: 'modifier' },
			]),
		).toBeNull();
	});

	it('refuses a published modifier column, naming the fix', () => {
		const said = refusal([{ key: 'Effect', type: 'modifier', publish: true }]);
		expect(said).toContain('the language has no text');
		expect(said).toContain('Publish a number or computed column instead');
	});

	it('says a refused modifier table withdraws the modifiers its rows applied', () => {
		/*
		 * `scopeModifiers` returns undefined for a card that will not configure, so
		 * every name its rows were changing falls back to a slot of 0 — a plausible
		 * number carrying no mark. The clause goes on this card's own error because
		 * it is the only place that can say it: a card refused here has never read
		 * a row (`read` refuses before `readTable`), so it does not know which
		 * definitions its cells named.
		 */
		const said = refusal([
			{ key: 'Effect', type: 'modifier' },
			{ key: 'Notes', total: true },
		]);
		expect(said).toContain('a text column has nothing to add up');
		expect(said).toContain('are not applied');
	});

	it('says nothing about modifiers where the card had none to withdraw', () => {
		const said = refusal([{ key: 'Notes', total: true }]);
		expect(said).toContain('a text column has nothing to add up');
		expect(said).not.toContain('are not applied');
	});
});

/*
 * The modifier cell, its glyph and its popup, on the sheet (SPEC §5).
 */
describe('table renders a modifier cell', () => {
	/*
	 * **One panel is open at a time, so a case that leaves one open is a case the
	 * next one inherits.** `showAnchoredPanel` holds a module-level singleton and
	 * `table.ts` re-anchors it during render wherever the key matches — which is the
	 * mechanism that keeps a form open across a commit, and which makes a stray
	 * panel look to the next case like a cell that opened itself. `opened()` clears
	 * one on the way in; this clears one on the way out, so a case using `drawn()`
	 * alone starts closed too.
	 */
	afterEach(() => closeAnchoredPanel());


	const items: TableConfig = {
		id: 'items',
		type: 'table',
		label: 'Magic items',
		position: { col: 1, row: 1, width: 6, height: 2 },
		rowHeader: 'Item',
		openRows: true,
		columns: [
			{ key: 'Modifiers', type: 'modifier', hideHeading: true },
			{ key: 'Bonus', type: 'number' },
		],
	};

	const RING: ModifierDefinitionView = {
		name: 'Ring of Protection',
		target: 'armour_class',
		targetLabel: 'Armour class',
		operator: 'add',
		amount: '1',
		bonusType: 'item',
	};
	const PLATE: ModifierDefinitionView = {
		name: 'Plate armour',
		target: 'armour_class',
		targetLabel: 'Armour class',
		operator: 'override',
		amount: '18',
	};
	/** A third, with a condition, so a line can say which way it went here. */
	const CLOAK: ModifierDefinitionView = {
		name: 'Cloak of Elvenkind',
		target: 'armour_class',
		targetLabel: 'Armour class',
		operator: 'add',
		amount: '1',
		bonusType: 'status',
		when: 'Worn',
	};

	/** The values a modifier may be aimed at, for the form's Changes select. */
	const TARGETS = [
		{ name: 'armour_class', label: 'Armour class' },
		{ name: 'abilities.STR', label: 'Abilities · STR' },
	];

	/** What a part comes to, resolved the way `sheetModifiers` would resolve it. */
	function resolve(part: string, over: Partial<ModifierOutcome>): ModifierOutcome {
		const declared = [RING, PLATE, CLOAK].find((one) => one.name === part);
		if (declared !== undefined) {
			return outcomeOf({
				definition: declared,
				target: declared.target,
				targetLabel: declared.targetLabel,
				applies: true,
				amount: 1,
				...over,
			});
		}
		const read = parseModifierPart(part);
		if (read.kind === 'typed') {
			return outcomeOf({
				typed: read.effect,
				target: read.effect.target,
				targetLabel:
					TARGETS.find((one) => one.name === read.effect.target)?.label ??
					read.effect.target,
				applies: read.effect.amount !== '',
				amount: read.effect.amount === '' ? null : Number(read.effect.amount),
				...(read.effect.amount === ''
					? { applies: false, suppressed: 'it needs an amount.' }
					: {}),
				...over,
			});
		}
		// A stray: carried, rendered, never corrected.
		return outcomeOf();
	}

	/** A context offering the two definitions and whatever outcome is given. */
	const withOutcome = (over: Partial<ModifierOutcome> = {}) =>
		modifierContext({
			definitions: [RING, PLATE],
			targets: TARGETS,
			published: TARGETS,
			bonusTypes: ['item', 'status'],
			outcome: (part: string) => resolve(part, over),
		});

	/** A stray: the layout declares nothing of the name the cell holds. */
	const strayContext = () =>
		modifierContext({
			definitions: [RING],
			targets: TARGETS,
			published: TARGETS,
			bonusTypes: ['item', 'status'],
			outcome: (part: string) => resolve(part, {}),
		});

	const body = (cell: string) => `
| Item | Modifiers | Bonus |
|---|---|---|
| Ring | ${cell} | 1 |
`;

	function drawn(cell: string, ctx: Partial<RenderContext> = {}) {
		const data = stored(body(cell), items);
		const el = document.createElement('div');
		const changes: unknown[] = [];
		table.render(el, items, data, {
			...contextFor(data, items),
			onChange: (edited) => changes.push(edited),
			...ctx,
		});
		return {
			el,
			changes,
			cell: el.querySelector('.sheetsmith-table-modifier-cell') as HTMLElement,
			button: el.querySelector(
				'.sheetsmith-table-modifier-button',
			) as HTMLButtonElement,
			glyph: el.querySelector(
				'.sheetsmith-table-modifier-glyph',
			) as HTMLElement,
		};
	}

	/**
	 * The popup a press opens, read off the stub's own markup.
	 *
	 * The stub builds the app's markup rather than a shape of its own, so what is
	 * asserted here is what a calibrated harness paints: `.menu`, `.menu-item`,
	 * `.menu-item-icon`, `.menu-item-title`, `.menu-separator` and `is-label`.
	 */
	/**
	 * Open the form on the row's glyph, and hand back the ways into it.
	 *
	 * The panel is attached to the document, so one left by an earlier case would
	 * be the one `querySelector` finds. Closed rather than counted from the end, so
	 * a case reads about its own panel and nothing else.
	 */
	function opened(cell: string, ctx: Partial<RenderContext> = {}) {
		closeAnchoredPanel();
		const drew = drawn(cell, ctx);
		drew.button.click();
		const panel = document.querySelector('.sheetsmith-panel') as HTMLElement;
		return { ...drew, panel, lines: () => lines(panel), field: (label: string) => field(panel, label) };
	}

	/** Every line of the list: its words, its reason, its mark and its tier. */
	function lines(panel: HTMLElement) {
		return Array.from(panel.querySelectorAll('.sheetsmith-panel-line')).map(
			(line) => ({
				text: line.querySelector('.sheetsmith-panel-said')?.textContent ?? '',
				why: line.querySelector('.sheetsmith-panel-why')?.textContent ?? null,
				icon:
					line
						.querySelector('.sheetsmith-panel-glyph')
						?.getAttribute('data-icon') ?? null,
				tier: (line as HTMLElement).dataset.sheetsmithPart ?? null,
				open: line.getAttribute('aria-expanded'),
				name: line.getAttribute('aria-label'),
				press: () => (line as HTMLElement).click(),
			}),
		);
	}

	/** One labelled control of the open part, by the label a reader sees. */
	function field(panel: HTMLElement, label: string) {
		for (const row of Array.from(
			panel.querySelectorAll('.sheetsmith-panel-field'),
		)) {
			const said = row.querySelector('.sheetsmith-panel-field-label')?.textContent;
			if (said !== label) continue;
			return row.querySelector<HTMLSelectElement | HTMLInputElement>(
				'select, input',
			);
		}
		return null;
	}

	/** Every button in the panel whose words are `text`, pressed by the first. */
	function control(panel: HTMLElement, text: string): HTMLElement | null {
		return (
			Array.from(panel.querySelectorAll('button')).find((button) =>
				(button.textContent ?? '').includes(text),
			) ?? null
		);
	}

	/** Choose `value` in a select and fire the `change` the form listens for. */
	function choose(select: HTMLSelectElement | HTMLInputElement | null, value: string) {
		if (select === null) throw new Error('no such control');
		(select as HTMLSelectElement).value = value;
		select.dispatchEvent(new Event('change'));
	}

	/** Type into a field and commit it the way `editable.ts` does. */
	function type(input: HTMLSelectElement | HTMLInputElement | null, value: string) {
		if (input === null) throw new Error('no such control');
		input.value = value;
		input.dispatchEvent(new Event('input'));
		input.dispatchEvent(new Event('blur'));
	}

	it('draws plus on a cell with no modifier, because it is the entry point', () => {
		/*
		 * The blank row used to draw nothing, which was right for a control that
		 * only *chose* and is wrong for one that manages: an empty cell is now where
		 * a modifier is added, and an unmarked entry point is a dead end. `docs/UI.md`
		 * §7 refuses a hover-only affordance and a phone has no hover to reveal one
		 * with, which is the argument the delete glyph one column over already
		 * carries.
		 */
		const { glyph, cell } = drawn('', { modifiers: withOutcome() });
		expect(glyph.dataset.icon).toBe('plus');
		// And the faint treatment is a class rather than an inline paint, so the
		// hover and focus steps are the stylesheet's.
		expect(cell.classList.contains('sheetsmith-table-modifier-empty')).toBe(true);
	});

	it('draws zap where the row is applying and zap-off where it is not', () => {
		// Three shapes, because `docs/UI.md` §6 refuses a mark whose only channel is
		// fill strength, and `zap-off` against `zap` carries itself.
		expect(
			drawn('Ring of Protection', { modifiers: withOutcome() }).glyph.dataset
				.icon,
		).toBe('zap');
		expect(
			drawn('Ring of Protection', {
				modifiers: withOutcome({
					applies: false,
					suppressed: 'a larger item bonus applies',
				}),
			}).glyph.dataset.icon,
		).toBe('zap-off');
	});

	it('draws one zap for two names where one applies, because the glyph reads the row', () => {
		/*
		 * The state the old three shapes could not describe, and the second wave's
		 * most direct consequence. One row is one item and an item reads as one
		 * mark: a row changing something is changing something, and the rest is
		 * carried in words. Deliberately not a fourth shape for "some" — a
		 * partial-state glyph is a mark most readers meet once and could not name.
		 */
		const { glyph } = drawn('Ring of Protection; Plate armour', {
			modifiers: modifierContext({
				definitions: [RING, PLATE],
				outcome: (name: string) =>
					name === RING.name
						? named(RING, { applies: true, amount: 1 })
						: named(PLATE, { applies: false, amount: 18, suppressed: 'a higher override applies' }),
			}),
		});
		expect(glyph.dataset.icon).toBe('zap');
	});

	it('draws zap-off for two names where neither applies', () => {
		const { glyph } = drawn('Ring of Protection; Plate armour', {
			modifiers: withOutcome({ applies: false, suppressed: 'nothing doing' }),
		});
		expect(glyph.dataset.icon).toBe('zap-off');
	});

	it('carries the state in the accessible name, in all five of its forms', () => {
		/*
		 * `docs/UI.md` §6: state goes in ARIA, not only in paint. The count form is
		 * where the second wave shows, and it gives a count rather than the names —
		 * which is parity, because the glyph gives a sighted reader no names either.
		 */
		const nameOf = (cell: string, ctx: Partial<RenderContext>) =>
			drawn(cell, ctx).button.getAttribute('aria-label');
		// The row's own name is in front of the column's, which is the shape every
		// cell control on this component already uses: "Ring Modifiers".
		expect(nameOf('', { modifiers: withOutcome() })).toBe('Ring Modifiers');
		expect(nameOf('Ring of Protection', { modifiers: withOutcome() })).toBe(
			'Ring Modifiers: Ring of Protection',
		);
		expect(
			nameOf('Ring of Nonexistence', { modifiers: strayContext() }),
		).toBe('Ring Modifiers: Ring of Nonexistence, changes nothing');
		expect(
			nameOf('Ring of Protection; Plate armour', { modifiers: withOutcome() }),
		).toBe('Ring Modifiers: 2 applying');
		expect(
			nameOf('Ring of Protection; Ring of Nonexistence', {
				modifiers: strayContext(),
			}),
		).toBe('Ring Modifiers: 1 applying, 1 changing nothing');
	});

	it('carries what one modifier does in a title, through the shared builder', () => {
		const { button } = drawn('Plate armour', {
			modifiers: modifierContext({
				definitions: [RING, PLATE],
				outcome: () => (named(PLATE, { applies: true, amount: 18 })),
			}),
		});
		expect(button.getAttribute('title')).toBe('Armour class — sets to 18');
	});

	it('summarises several in the title, marking the line that changes nothing', () => {
		// One line each, with the reason left to the popup and the fact of it
		// inline, so the block stays bounded however many the row applies.
		const { button } = drawn('Ring of Protection; Ring of Nonexistence', {
			modifiers: strayContext(),
		});
		expect(button.getAttribute('title')).toBe(
			[
				'Armour class — item +1',
				'"Ring of Nonexistence" is not a modifier this layout declares.',
			].join('\n'),
		);
		const suppressed = drawn('Ring of Protection; Plate armour', {
			modifiers: modifierContext({
				definitions: [RING, PLATE],
				outcome: (name: string) =>
					name === RING.name
						? named(RING, { applies: true, amount: 1 })
						: named(PLATE, { applies: false, amount: 18, suppressed: 'a higher override applies' }),
			}),
		});
		expect(suppressed.button.getAttribute('title')).toBe(
			['Armour class — item +1', 'Armour class — sets to 18 (changes nothing)'].join(
				'\n',
			),
		);
	});

	it('says the layout declares no such modifier where it does not', () => {
		const { button } = drawn('Ring of Nonexistence', {
			modifiers: strayContext(),
		});
		expect(button.getAttribute('title')).toContain(
			'is not a modifier this layout declares',
		);
	});

	it('never carries the class that never painted', () => {
		/*
		 * `.sheetsmith-table-inert` is gone. Its only declaration on this cell was
		 * `color: var(--text-muted)`, byte-identical to the base rule it was written
		 * to override, so a stray cell and a working one were always the same
		 * colour — the shape and the accessible name were doing all of the work.
		 * The test that asserted the class asserts the glyph instead, which is the
		 * channel that was actually carrying the state.
		 */
		const { el, glyph } = drawn('Ring of Nonexistence', {
			modifiers: strayContext(),
		});
		expect(el.innerHTML).not.toContain('sheetsmith-table-inert');
		expect(glyph.dataset.icon).toBe('zap-off');
	});

	it('has one gesture: a press, and no long press anywhere on the cell', () => {
		/*
		 * The cell had two gestures because it had two jobs on one control: a press
		 * opened the picker and a press-and-hold opened the explanation. The popup
		 * carries the explanation now, so there is one job and one gesture — and
		 * `bindLongPress` is back to the two-argument helper the level ring and Track
		 * use, with no `claimTouchPress` to take a press away from anything.
		 */
		vi.useFakeTimers();
		try {
			const { button } = drawn('Plate armour', { modifiers: withOutcome() });
			hold(button, LONG_PRESS + 10, { pointerType: 'touch' });
			expect(document.querySelector('.sheetsmith-popover')).toBeNull();
			// And nothing takes the press: the button's own click is the gesture.
			expect(prevented(button, 'touch')).toBe(false);
		} finally {
			closePopover();
			vi.useRealTimers();
		}
	});

	it('names the row on the panel it opens', () => {
		/*
		 * Criterion 33's other half. `ui/anchored-panel.test.ts` asserts that a label
		 * handed in comes back out; **what nothing asserted is the wiring** — that
		 * Table builds it from the row's own reader-facing label, so a screen reader
		 * arriving in the dialog is told which row it belongs to rather than which
		 * column.
		 *
		 * `rowLabel`, so a row spelled `[[Ring of Protection|ring]]` in the file is
		 * named `ring` here, exactly as it is in a breakdown.
		 */
		const { panel } = opened('Ring of Protection', { modifiers: withOutcome() });
		expect(panel.getAttribute('role')).toBe('dialog');
		expect(panel.getAttribute('aria-label')).toBe('Modifiers on "Ring"');
	});

	it('says it opens a dialog, and puts aria-expanded back when it closes', () => {
		/*
		 * `"dialog"` and not `"menu"`: what opens is a form, and a screen reader
		 * should say so. The focus cycle inside it is the platform's own contract
		 * for a dialog, which is what makes this attribute true rather than
		 * decorative — `ui/anchored-panel.test.ts` holds that half.
		 */
		const { button } = drawn('Plate armour', { modifiers: withOutcome() });
		expect(button.getAttribute('aria-haspopup')).toBe('dialog');
		expect(button.getAttribute('aria-expanded')).toBe('false');
		button.click();
		expect(button.getAttribute('aria-expanded')).toBe('true');
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(button.getAttribute('aria-expanded')).toBe('false');
	});

	it('closes on a second press of the glyph that opened it', () => {
		/*
		 * **What a control carrying `aria-expanded` owes, and what it did not
		 * pay.** The handle was read once into a `const`, so the panel a *press*
		 * opened was never the panel the close path had — the second press closed
		 * nothing and the attribute stayed `"true"`. It only ever worked after an
		 * unrelated commit had rebuilt the row and re-anchored the panel, which is
		 * why nothing noticed: every case here opens and then dismisses from
		 * outside. Found in Record set and fixed in both.
		 */
		const { button } = drawn('Plate armour', { modifiers: withOutcome() });
		button.click();
		expect(document.querySelector('.sheetsmith-panel')).not.toBeNull();
		button.click();
		expect(document.querySelector('.sheetsmith-panel')).toBeNull();
		expect(button.getAttribute('aria-expanded')).toBe('false');
	});

	/** RING applying, PLATE suppressed, CLOAK unworn — one context, three states. */
	const threeStates = () =>
		modifierContext({
			definitions: [RING, PLATE, CLOAK],
			targets: TARGETS,
			published: TARGETS,
			bonusTypes: ['item', 'status'],
			outcome: (part: string) =>
				part === RING.name
					? named(RING, { applies: true, amount: 1 })
					: part === PLATE.name
						? named(PLATE, {
								applies: false,
								amount: 18,
								suppressed: 'a higher override applies',
							})
						: part === CLOAK.name
							? named(CLOAK, { applies: false, amount: 1, condition: false })
							: resolve(part, {}),
		});

	it('lists one line per part in the cell\'s own order, with its own wording', () => {
		/*
		 * One list, labelled `On this row`, and a press on a line *opens* it. Under
		 * the menu round there were two sections and position carried membership;
		 * there is one list now, so the label carries it and the second section's
		 * job — offering what the row could apply — is the `Modifier` select inside
		 * the form.
		 */
		const { panel, lines: read } = opened('Plate armour; Ring of Protection', {
			modifiers: threeStates(),
		});
		expect(
			panel.querySelector('.sheetsmith-panel-heading')?.textContent,
		).toBe('On this row · select to edit');
		const list = read();
		expect(list[0]?.text).toBe('Plate armour · Armour class — sets to 18');
		expect(list[0]?.icon).toBe('zap-off');
		// A reason on a line of its own under the line it is about, which is
		// `.sheetsmith-field-problems`' shape in the editor.
		expect(list[0]?.why).toBe('Not applied: a higher override applies');
		expect(list[1]?.text).toBe('Ring of Protection · Armour class — item +1');
		expect(list[1]?.icon).toBe('zap');
		expect(list[1]?.why).toBeNull();
		// The modifier's own words plus its state, which is the whole of what the
		// line and its reason carry together.
		expect(list[0]?.name).toBe(
			'Plate armour · Armour class — sets to 18, Not applied: a higher override applies',
		);
	});

	it('spells a typed part by what it does, because it has no name', () => {
		// §7's edge at the surface: a typed effect has no name and never will, so
		// the line is the outcome and nothing else — and the *outcome* half is what
		// tells two typed lines on one row apart.
		const { lines: read } = opened(
			'armour_class += 2 as item; abilities.STR += 1',
			{ modifiers: withOutcome() },
		);
		const list = read();
		expect(list[0]?.text).toBe('Armour class — item +2');
		expect(list[0]?.tier).toBe('typed');
		expect(list[1]?.text).toBe('Abilities · STR — +1');
		expect(list[1]?.tier).toBe('typed');
	});

	it('draws zap-off and says what it needs for a typed effect with no amount', () => {
		// The sixth `zap-off` reason, and the one the form's own per-field commit
		// depends on: the part exists the moment a target is chosen.
		const { glyph, lines: read } = opened('armour_class +=', {
			modifiers: withOutcome(),
		});
		expect(glyph.dataset.icon).toBe('zap-off');
		expect(read()[0]?.why).toBe('Not applied: it needs an amount.');
	});

	it('opens one part on a press, and closes any other', () => {
		/*
		 * **One at a time, and no navigation.** Five controls times three is a panel
		 * nobody can scan, and a back-stack inside a transient surface would be a
		 * second dismissal regime. Disclosure in place keeps the line the reader
		 * chose visible above the fields they are filling in.
		 */
		const { lines: read } = opened('Plate armour; Ring of Protection', {
			modifiers: threeStates(),
		});
		expect(read().map((line) => line.open)).toEqual(['false', 'false']);
		read()[0]?.press();
		expect(read().map((line) => line.open)).toEqual(['true', 'false']);
		read()[1]?.press();
		expect(read().map((line) => line.open)).toEqual(['false', 'true']);
		// And a second press on the open line closes it.
		read()[1]?.press();
		expect(read().map((line) => line.open)).toEqual(['false', 'false']);
	});

	it('offers Typed on this row plus every definition, resolved against the row', () => {
		/*
		 * The whole difference between a picker and a list of words: the reader
		 * choosing a named modifier reads what it would do *here*, not a bare name.
		 * One `outcome` call per definition, and it happens on a **press** — after a
		 * render has finished — so it can never be the first entry into the modifier
		 * walk in a render.
		 */
		const { panel, lines: read } = opened('Plate armour', {
			modifiers: threeStates(),
		});
		read()[0]?.press();
		const tier = field(panel, 'Modifier') as HTMLSelectElement;
		expect(Array.from(tier.options).map((one) => one.textContent)).toEqual([
			'Typed on this row',
			'Ring of Protection · Armour class — item +1',
			'Plate armour · Armour class — sets to 18',
			'Cloak of Elvenkind · Armour class — status +1',
		]);
		expect(tier.value).toBe('Plate armour');
	});

	it('shows a named part\'s fields read-only, and says where they are edited', () => {
		// One edit in the layout editor moves every character on the layout at once,
		// and a sheet that could make that edit would be a far larger change than
		// this feature (SPEC §7).
		const { panel, lines: read } = opened('Ring of Protection', {
			modifiers: threeStates(),
		});
		read()[0]?.press();
		expect((field(panel, 'Changes') as HTMLSelectElement).disabled).toBe(true);
		expect((field(panel, 'Operator') as HTMLSelectElement).disabled).toBe(true);
		expect((field(panel, 'Amount') as HTMLInputElement).readOnly).toBe(true);
		expect((field(panel, 'Bonus type') as HTMLSelectElement).disabled).toBe(true);
		/*
		 * **And no Only when row at all**, because this definition has no condition.
		 * The four read-only fields draw as a printed summary rather than as four
		 * quieted controls — which is what gives read-only a second channel that is
		 * not a fill strength — so a row whose value is empty would be a label with
		 * nothing after it, reading as a fault in the summary rather than as "no
		 * condition". Same rule **Bonus type** already follows for **Sets**.
		 */
		expect(field(panel, 'Only when')).toBeNull();
		expect(panel.textContent).toContain('Edit it in the layout editor');
		// And nothing to promote: a part that already names a definition has none.
		expect(control(panel, 'Save to the layout')).toBeNull();
	});

	it('keeps a named part\'s condition, read-only, where it has one', () => {
		// The other half of the rule above: a blank read-only field is not drawn, and
		// a filled one is — so the omission is "nothing to say" rather than "this
		// field is gone".
		const { panel, lines: read } = opened('Cloak of Elvenkind', {
			modifiers: threeStates(),
		});
		read()[0]?.press();
		const when = field(panel, 'Only when') as HTMLInputElement;
		expect(when.readOnly).toBe(true);
		expect(when.value).toBe('Worn');
	});

	it('carries a stray as its own option, and never offers it to be chosen', () => {
		// Rendered, not corrected: the stored spelling is the thing the reader has
		// to recognise as theirs before they replace it, and the fix goes under it.
		const { panel, lines: read } = opened('Ring of Nonexistence', {
			modifiers: strayContext(),
		});
		const list = read();
		expect(list[0]?.text).toBe(
			'"Ring of Nonexistence" is not a modifier this layout declares.',
		);
		expect(list[0]?.why).toBe('Choose one it does, or add it in the layout editor.');
		expect(list[0]?.icon).toBe('zap-off');
		expect(list[0]?.tier).toBe('stray');
		list[0]?.press();
		const tier = field(panel, 'Modifier') as HTMLSelectElement;
		expect(tier.selectedOptions[0]?.textContent).toBe(
			'Ring of Nonexistence · not a modifier this layout declares',
		);
		// Offered nowhere else: the carried option is the stored value's own line.
		expect(
			Array.from(tier.options).filter((one) =>
				(one.textContent ?? '').startsWith('Ring of Nonexistence'),
			),
		).toHaveLength(1);
	});

	it('arms before it replaces a part with a named modifier, and commits on the second gesture', () => {
		/*
		 * **Both tier changes arm and commit, and neither runs on the first press.**
		 * Picking a definition replaces the row's own text and detaching replaces a
		 * name with a copy of the definition's fields: both are destructive, so
		 * neither may land on a stray change of a select.
		 */
		const { panel, changes, lines: read } = opened('armour_class += 2 as item', {
			modifiers: threeStates(),
		});
		read()[0]?.press();
		choose(field(panel, 'Modifier'), 'Ring of Protection');
		expect(changes).toEqual([]);
		control(panel, 'Use this modifier')?.click();
		expect(changes).toEqual([
			{ rows: { 0: { cells: { Modifiers: 'Ring of Protection' } } } },
		]);
	});

	it('copies a definition\'s fields onto the row when it is detached', () => {
		/*
		 * Foundry's own #4451 "detach to instance", one-way — and **not the cache §1
		 * forbids**: a cache is a copy of what something else still owns, and a
		 * detached effect is the effect itself, owned by this row from that moment
		 * and referring to nothing.
		 */
		const { panel, changes, lines: read } = opened('Cloak of Elvenkind', {
			modifiers: threeStates(),
		});
		read()[0]?.press();
		choose(field(panel, 'Modifier'), 'sheetsmith-typed');
		expect(changes).toEqual([]);
		control(panel, 'Copy onto this row')?.click();
		expect(changes).toEqual([
			{
				rows: {
					0: {
						cells: {
							Modifiers: 'armour_class += 1 as status when Worn',
						},
					},
				},
			},
		]);
	});

	it('commits each field on its own gesture, writing one part', () => {
		/*
		 * **No OK button**, on `editable.ts`'s own gesture: the selects commit on
		 * `change` and the two text fields on Enter or blur. A form with its own
		 * commit button would be a second commit regime on one sheet.
		 */
		const each = (start: string, act: (panel: HTMLElement) => void) => {
			const { panel, changes, lines: read } = opened(start, {
				modifiers: withOutcome(),
			});
			read()[0]?.press();
			act(panel);
			return changes;
		};
		expect(
			each('armour_class += 2 as item', (panel) =>
				choose(field(panel, 'Changes'), 'abilities.STR'),
			),
		).toEqual([
			{ rows: { 0: { cells: { Modifiers: 'abilities.STR += 2 as item' } } } },
		]);
		// **Sets** takes the bonus type away, because an override is not contested
		// by type — so the written part loses its `as item` with it.
		expect(
			each('armour_class += 2 as item', (panel) =>
				choose(field(panel, 'Operator'), 'override'),
			),
		).toEqual([{ rows: { 0: { cells: { Modifiers: 'armour_class = 2' } } } }]);
		expect(
			each('armour_class += 2 as item', (panel) =>
				type(field(panel, 'Amount'), '3'),
			),
		).toEqual([
			{ rows: { 0: { cells: { Modifiers: 'armour_class += 3 as item' } } } },
		]);
		expect(
			each('armour_class += 2 as item', (panel) =>
				choose(field(panel, 'Bonus type'), 'status'),
			),
		).toEqual([
			{ rows: { 0: { cells: { Modifiers: 'armour_class += 2 as status' } } } },
		]);
		expect(
			each('armour_class += 2 as item', (panel) =>
				type(field(panel, 'Only when'), 'Worn'),
			),
		).toEqual([
			{
				rows: {
					0: { cells: { Modifiers: 'armour_class += 2 as item when Worn' } },
				},
			},
		]);
	});

	it('carries a bonus type the layout does not declare, and never offers it', () => {
		// Rendered, not corrected. The effect applies and contests as its own kind;
		// this is the one thing stored in a note that names the layout's vocabulary.
		const { panel, lines: read } = opened('abilities.STR += 1 as luck', {
			modifiers: withOutcome(),
		});
		read()[0]?.press();
		const bonus = field(panel, 'Bonus type') as HTMLSelectElement;
		expect(bonus.selectedOptions[0]?.textContent).toBe('luck (not declared)');
		expect(Array.from(bonus.options).map((one) => one.textContent)).toEqual([
			'Untyped',
			'item',
			'status',
			'luck (not declared)',
		]);
	});

	it('offers no bonus type on Sets', () => {
		const { panel, lines: read } = opened('armour_class = 18', {
			modifiers: withOutcome(),
		});
		read()[0]?.press();
		expect(field(panel, 'Bonus type')).toBeNull();
	});

	it('arms Remove, then drops that part alone', () => {
		// A control rather than a press on a line, because a press now *opens* a
		// line and one gesture cannot both open and delete. It borrows the delete
		// glyph's own arm-then-commit rather than inventing one.
		const { panel, changes, lines: read } = opened(
			'Plate armour; Ring of Protection',
			{ modifiers: threeStates() },
		);
		read()[0]?.press();
		control(panel, 'Remove')?.click();
		expect(changes).toEqual([]);
		control(panel, 'Remove')?.click();
		expect(changes).toEqual([
			{ rows: { 0: { cells: { Modifiers: 'Ring of Protection' } } } },
		]);
	});

	it('takes a repeated name off the row, note and all', () => {
		/*
		 * **Reported from the app as "the remove modifier isn't working"**, and every
		 * layer test was green. A cell holding one name twice is *one* enrolment, so
		 * Remove dropping a single byte range left the row still applying it: the
		 * reader pressed the only control there is, twice, and the modifier stayed.
		 *
		 * **Carried through `table.write` to the note**, which is the assertion the
		 * suite was missing rather than the one it got wrong: the emitted delta was
		 * asserted, and a delta that still names the modifier looks exactly like a
		 * delta that does not.
		 *
		 * The state is two presses away without touching the file — **Add a
		 * modifier**, then pick a definition another part already names — which the
		 * case below drives.
		 */
		const source = `
| Item | Modifiers | Bonus |
|---|---|---|
| Ring | Ring of Protection; Plate armour; Ring of Protection | 1 |
`;
		closeAnchoredPanel();
		const data = stored(source, items);
		const el = document.createElement('div');
		const changes: Parameters<typeof table.write>[0][] = [];
		table.render(el, items, data, {
			...contextFor(data, items),
			onChange: (edited) => changes.push(edited),
			modifiers: threeStates(),
		});
		(el.querySelector('.sheetsmith-table-modifier-button') as HTMLElement).click();
		const panel = document.querySelector('.sheetsmith-panel') as HTMLElement;
		// Three parts, so three lines: what the cell *holds*. The row is doing two
		// things, which is what the glyph counts.
		expect(lines(panel)).toHaveLength(3);
		lines(panel)[0]?.press();
		control(panel, 'Remove')?.click();
		control(panel, 'Remove')?.click();
		const written = table.write(
			changes[0] as Parameters<typeof table.write>[0],
			source,
			items,
		);
		// Both copies gone, and `Plate armour` keeps its own bytes.
		expect(written).toContain('| Plate armour |');
		expect(written).not.toContain('Ring of Protection');
	});

	it('says a repeated name is a second drawing, and Remove says it takes both', () => {
		/*
		 * **Two lines is the right shape** — a typed part is named by nothing (§7's
		 * edge), so two typed effects draw identically with no duplicate name in
		 * sight, and filtering duplicate *names* would close one instance of a
		 * general property. What was missing is the sentence: the second line drew a
		 * second time for one enrolment with nothing saying so, and **Remove** on
		 * either takes both while the button said "Remove this modifier", singular,
		 * in the one state where it is plural.
		 */
		const { panel, lines: read } = opened(
			'Ring of Protection; Plate armour; Ring of Protection',
			{ modifiers: threeStates() },
		);
		const list = read();
		// The first copy reads as an ordinary line, because it is one.
		expect(list[0]?.why).toBeNull();
		expect(list[2]?.why).toBe(
			'Already applied above; removing either takes both',
		);
		expect(list[2]?.name).toContain('one of 2 lines naming it');
		list[2]?.press();
		const remove = control(panel, 'Remove') as HTMLElement;
		expect(remove.textContent).toBe('Remove all 2');
		expect(remove.getAttribute('aria-label')).toBe(
			'Remove this modifier from all 2 lines that name it',
		);
		remove.click();
		expect(
			(control(panel, 'Remove') as HTMLElement).getAttribute('aria-label'),
		).toBe(
			'Remove this modifier from all 2 lines that name it. Select again to confirm.',
		);
	});

	it('puts Remove under the fields, above the promote block', () => {
		/*
		 * Under the promote block it read as belonging to the naming block — a
		 * hairline, `Reuse this elsewhere`, the name row, then Remove at the same
		 * left edge with no rule between and the only bordered box being the promote
		 * one. "Remove" could plausibly have been read as removing the *name*.
		 *
		 * Asserted by document order rather than by pixels, which is the half a
		 * shot cannot check: it also has to land in the same place for a **named**
		 * part, which draws no promote block at all.
		 */
		const { panel, lines: read } = opened('armour_class += 2 as item', {
			modifiers: threeStates(),
		});
		read()[0]?.press();
		const order = Array.from(
			panel.querySelectorAll(
				'.sheetsmith-panel-remove, .sheetsmith-panel-promote',
			),
		).map((el) => el.className);
		expect(order).toEqual([
			'sheetsmith-panel-remove',
			'sheetsmith-panel-promote',
		]);
	});

	it('lets the reader reach a repeated name in two presses', () => {
		/*
		 * The path the report came in on, so the case above is not about a state only
		 * a hand-edit reaches. The **Modifier** select offers every definition the
		 * layout declares, including one another part of this cell already names —
		 * deliberately, because that is also how a reader points a *stray* part at a
		 * definition a sibling part already uses, and filtering it would take away
		 * the option they need.
		 */
		const { panel, changes } = opened('Ring of Protection', {
			modifiers: threeStates(),
		});
		control(panel, 'Add a modifier')?.click();
		choose(field(panel, 'Modifier'), 'Ring of Protection');
		control(panel, 'Use this modifier')?.click();
		expect(changes).toEqual([
			{
				rows: {
					0: { cells: { Modifiers: 'Ring of Protection; Ring of Protection' } },
				},
			},
		]);
	});

	it('opens a row with no parts straight into one, with Changes focused', () => {
		/*
		 * The common case in one opening: press the `plus`, choose the value, type
		 * the number, done. Under the menu round it was two presses and two
		 * openings. **Changes** is first of the four because a part with no target
		 * could not be spelled in the cell at all, and a part with no amount can.
		 */
		const { panel } = opened('', { modifiers: withOutcome() });
		expect(panel.textContent).toContain('This row applies no modifier.');
		const changesField = field(panel, 'Changes') as HTMLSelectElement;
		expect(changesField).not.toBeNull();
		expect(changesField.value).toBe('');
		expect(document.activeElement).toBe(changesField);
		expect(control(panel, 'Add a modifier')).toBeNull();
		/*
		 * **And no offer to publish an effect that does not exist yet.** On the
		 * first-use path the panel's last word was `Save to the layout` under a form
		 * with nothing in it, so the reader met a publish control before they had
		 * anything to publish. A target and an amount are the two slots a part needs
		 * to do anything at all (§6), so they are the two the offer waits for.
		 */
		expect(control(panel, 'Save to the layout')).toBeNull();
	});

	it('offers Reuse this elsewhere once the effect has a target and an amount', () => {
		// The other side of the guard, at the two states either side of it: a part
		// with a target and no amount changes nothing and is not offered, and the
		// same part with an amount is.
		const half = opened('armour_class +=', { modifiers: withOutcome() });
		half.lines()[0]?.press();
		expect(control(half.panel, 'Save to the layout')).toBeNull();

		const whole = opened('armour_class += 2', { modifiers: withOutcome() });
		whole.lines()[0]?.press();
		expect(control(whole.panel, 'Save to the layout')).not.toBeNull();
	});

	it('brings a part into existence when Changes is chosen, and not before', () => {
		// A part with no target could not be spelled in a cell at all (§6's
		// discriminator needs a name token), so nothing is written until there is
		// one — and then an unfinished effect is written, which changes nothing.
		const { panel, changes } = opened('', { modifiers: withOutcome() });
		choose(field(panel, 'Changes'), 'armour_class');
		expect(changes).toEqual([
			{ rows: { 0: { cells: { Modifiers: 'armour_class +=' } } } },
		]);
	});

	it('does not append a twin when a second field commits before the re-read', () => {
		/*
		 * **Criterion 21's last clause**, and it is named there because it is the one
		 * that would break silently. The form's `parts` list comes from the render
		 * that drew it, so a commit that does not re-render leaves the *next* commit
		 * working from a stale list — and a form that appended rather than replacing
		 * would grow a second part out of one edit.
		 *
		 * It holds by two mechanisms rather than one, which is the other half of why
		 * it earns a case: `put` writes the whole cell text, so a stale list still
		 * overwrites; and choosing **Changes** moves the open part off `'new'`, so the
		 * amount that follows replaces rather than appends.
		 *
		 * Driven without a re-render between the two commits, which is exactly the
		 * state the app is in for the instant before `onChange` comes back.
		 */
		const { panel, changes } = opened('', { modifiers: withOutcome() });
		choose(field(panel, 'Changes'), 'armour_class');
		type(field(panel, 'Amount'), '2');
		expect(changes).toEqual([
			{ rows: { 0: { cells: { Modifiers: 'armour_class +=' } } } },
			{ rows: { 0: { cells: { Modifiers: 'armour_class += 2' } } } },
		]);
		// One part in the second delta, not two: the whole of the clause.
		const last = changes[changes.length - 1] as {
			rows: Record<number, { cells: Record<string, string> }>;
		};
		expect(
			cellParts(last.rows[0]?.cells.Modifiers ?? ''),
		).toEqual(['armour_class += 2']);
	});

	it('shows one Modifier option and no error where the layout names none', () => {
		/*
		 * **The report this wave retires.** A layout with no named modifiers was an
		 * error under a reference-only model — a column with nothing to point at
		 * *was* pointless — and is an ordinary layout the moment a row can type its
		 * own effect.
		 */
		const { panel } = opened('', {
			modifiers: modifierContext({
				definitions: [],
				targets: TARGETS,
				published: TARGETS,
			}),
		});
		const tier = field(panel, 'Modifier') as HTMLSelectElement;
		expect(Array.from(tier.options).map((one) => one.textContent)).toEqual([
			'Typed on this row',
		]);
		expect(panel.querySelector('.sheetsmith-panel-problem')).toBeNull();
	});

	it('converts the part into the name once the layout write has landed', () => {
		/*
		 * **§8's order, driven through the form rather than re-implemented beside
		 * it.** The layout write lands first and the cell is rewritten *only* on
		 * `ok`, which is the whole of Constraint 4 here — and `promote-flow.test.ts`
		 * proves that rule against a helper of its own, so this is the case that
		 * proves it against `modifier-form.ts`.
		 *
		 * The promoting part becomes a reference and every other part is re-joined as
		 * its own stored text: an inline copy left beside the definition it was lifted
		 * from is a cache of what that definition says, which is the one thing §1
		 * forbids absolutely.
		 */
		const landed = vi.fn(() => Promise.resolve({ ok: true as const }));
		const { panel, changes, lines: read } = opened(
			'Ring of Protection; armour_class += 2 as item',
			{ modifiers: modifierContext({ ...withOutcome(), promote: landed }) },
		);
		read()[1]?.press();
		const name = panel.querySelector(
			'[data-sheetsmith-panel-field="promote-name"]',
		) as HTMLInputElement;
		name.value = 'Bracers of Warding';
		name.dispatchEvent(new Event('input'));
		control(panel, 'Save to the layout')?.click();
		// The effect goes over whole, which is what the host scan holds one layer up.
		expect(landed).toHaveBeenCalledWith('Bracers of Warding', {
			target: 'armour_class',
			operator: 'add',
			amount: '2',
			bonusType: 'item',
		});
		return Promise.resolve().then(() => {
			expect(changes).toEqual([
				{
					rows: {
						0: {
							cells: {
								Modifiers: 'Ring of Protection; Bracers of Warding',
							},
						},
					},
				},
			]);
		});
	});

	it('leaves the cell alone where the layout write failed', () => {
		/*
		 * **The reverse order would manufacture a stray**: a cell naming a definition
		 * that does not exist. Recoverable, since that is rendered rather than
		 * corrected, but it would be this feature creating one. So a refusal from the
		 * host reaches the reader as a message and touches no byte.
		 */
		const refused = vi.fn(() =>
			Promise.resolve({ error: 'The layout file is read-only.' }),
		);
		const { panel, changes, lines: read } = opened('armour_class += 2 as item', {
			modifiers: modifierContext({ ...withOutcome(), promote: refused }),
		});
		read()[0]?.press();
		const name = panel.querySelector(
			'[data-sheetsmith-panel-field="promote-name"]',
		) as HTMLInputElement;
		name.value = 'Bracers of Warding';
		name.dispatchEvent(new Event('input'));
		control(panel, 'Save to the layout')?.click();
		return Promise.resolve().then(() => {
			expect(changes).toEqual([]);
			expect(
				panel.querySelector('.sheetsmith-panel-problem')?.textContent,
			).toBe('The layout file is read-only.');
		});
	});

	it('refuses a promotion the form can judge itself, naming the fix', () => {
		// Two of §8's four refusals are checked where the name is being typed
		// rather than in another pane afterwards, and in the parser's own words.
		const { panel, changes, lines: read } = opened('armour_class += 2 as item', {
			modifiers: withOutcome(),
		});
		read()[0]?.press();
		control(panel, 'Save to the layout')?.click();
		expect(
			panel.querySelector('.sheetsmith-panel-problem')?.textContent,
		).toBe('Give it a name to reuse it by.');
		const name = panel.querySelector(
			'[data-sheetsmith-panel-field="promote-name"]',
		) as HTMLInputElement;
		name.value = 'armour_class = 4';
		name.dispatchEvent(new Event('input'));
		control(panel, 'Save to the layout')?.click();
		expect(
			panel.querySelector('.sheetsmith-panel-problem')?.textContent,
		).toContain('cannot be a name, because a row spells its own modifiers');
		// And in neither case is the cell touched.
		expect(changes).toEqual([]);
	});

	it('writes only the cell it changed, byte for byte outside it', () => {
		/*
		 * The commit is a delta naming one cell, so the note is compared byte for
		 * byte everywhere else and the cell itself against the canonical spelling.
		 * Driven through the real writer rather than reasoned about the delta,
		 * because the whole of Constraint 3 on this side is that no other cell moves.
		 */
		const source = `
| Item | Modifiers | Bonus |
|---|---|---|
| Ring | Plate armour ;Ring of Protection | 1 |
| Chalk |  | 0 |
`;
		closeAnchoredPanel();
		const data = stored(source, items);
		const el = document.createElement('div');
		const changes: Parameters<typeof table.write>[0][] = [];
		table.render(el, items, data, {
			...contextFor(data, items),
			onChange: (edited) => changes.push(edited),
			modifiers: threeStates(),
		});
		(el.querySelector('.sheetsmith-table-modifier-button') as HTMLElement).click();
		const panel = document.querySelector('.sheetsmith-panel') as HTMLElement;
		lines(panel)[0]?.press();
		control(panel, 'Remove')?.click();
		control(panel, 'Remove')?.click();
		expect(changes).toHaveLength(1);
		const written = table.write(
			changes[0] as Parameters<typeof table.write>[0],
			source,
			items,
		);
		// The canonical spelling in the cell that changed, and every other byte —
		// including the second row and the hand-edited spacing's own line ending —
		// exactly as it was.
		expect(written).toBe(
			source.replace(
				'| Plate armour ;Ring of Protection |',
				'| Ring of Protection |',
			),
		);
	});

	it('carries the cell\'s own spelling where there is no sheet to resolve it', () => {
		/*
		 * A component draws what it can without the context, which is `link`'s own
		 * rule. With no layout there is nothing to resolve any part against, so every
		 * part lands in the case a stray already has — the cell's own spelling,
		 * carried, with the fields read-only. **The point of pinning it is that the
		 * form derives its fields from `outcome` rather than from a parse of its own**,
		 * so a missing outcome has to have a defined answer.
		 */
		closeAnchoredPanel();
		const drew = drawn('armour_class += 2 as item');
		drew.button.click();
		const panel = document.querySelector('.sheetsmith-panel') as HTMLElement;
		expect(lines(panel)[0]?.text).toBe('armour_class += 2 as item');
		lines(panel)[0]?.press();
		const tier = field(panel, 'Modifier') as HTMLSelectElement;
		expect(tier.selectedOptions[0]?.textContent).toContain(
			'armour_class += 2 as item',
		);
		expect((field(panel, 'Amount') as HTMLInputElement).readOnly).toBe(true);
	});

	it('keeps a repeated name when another part of the cell is edited', () => {
		/*
		 * **The collapse is a read and never a write** (§6, stated three times), and
		 * this is the case that would prove otherwise: a cell holding the same name
		 * twice is *one enrolment*, so the arithmetic is unaffected — but the second
		 * copy is a part the reader did not touch, and deleting it on an unrelated
		 * edit is the byte loss §10 and Constraint 4 forbid.
		 *
		 * Driven rather than reasoned, because the write list being built from the
		 * collapsed read is invisible in review: the numbers never move.
		 */
		const source = `
| Item | Modifiers | Bonus |
|---|---|---|
| Ring | Ring of Protection; Plate armour; Ring of Protection | 1 |
`;
		closeAnchoredPanel();
		const data = stored(source, items);
		const el = document.createElement('div');
		const changes: Parameters<typeof table.write>[0][] = [];
		table.render(el, items, data, {
			...contextFor(data, items),
			onChange: (edited) => changes.push(edited),
			modifiers: threeStates(),
		});
		(el.querySelector('.sheetsmith-table-modifier-button') as HTMLElement).click();
		const panel = document.querySelector('.sheetsmith-panel') as HTMLElement;
		// The cell holds three parts, so the form lists three: what the *cell* holds
		// is a different question from what the row is *doing*, which is two.
		expect(lines(panel)).toHaveLength(3);
		// Edit the middle part, which is the one part that is not the repeat.
		lines(panel)[1]?.press();
		control(panel, 'Remove')?.click();
		control(panel, 'Remove')?.click();
		expect(changes).toHaveLength(1);
		const written = table.write(
			changes[0] as Parameters<typeof table.write>[0],
			source,
			items,
		);
		expect(written).toContain(
			'| Ring of Protection; Ring of Protection |',
		);
	});

	it('re-joins every part the reader did not touch, byte for byte', () => {
		/*
		 * **Constraint 3's one new rule** (§6), and the case a canonical join over
		 * the whole cell would quietly lose: editing one part of a three-part cell
		 * must not canonicalise the other two, which would be a correction §10
		 * forbids arriving as a side effect of an unrelated edit.
		 */
		const source = `
| Item | Modifiers | Bonus |
|---|---|---|
| Ring | Plate armour;Ring of  Protection;armour_class+=2  as item | 1 |
`;
		closeAnchoredPanel();
		const data = stored(source, items);
		const el = document.createElement('div');
		const changes: Parameters<typeof table.write>[0][] = [];
		table.render(el, items, data, {
			...contextFor(data, items),
			onChange: (edited) => changes.push(edited),
			modifiers: threeStates(),
		});
		(el.querySelector('.sheetsmith-table-modifier-button') as HTMLElement).click();
		const panel = document.querySelector('.sheetsmith-panel') as HTMLElement;
		// The third part is the typed one; edit its amount and nothing else.
		const typedLine = panel.querySelector(
			'.sheetsmith-panel-line[data-sheetsmith-part="typed"]',
		) as HTMLElement;
		typedLine.click();
		type(field(panel, 'Amount'), '3');
		const written = table.write(
			changes[0] as Parameters<typeof table.write>[0],
			source,
			items,
		);
		/*
		 * **Compared part by part**, which is what the rule is about: the edited part
		 * is written canonically and every other part comes back as its own stored
		 * text, internal spacing and all — `Ring of  Protection`'s double space
		 * survives, where a canonical join over the whole cell would have re-spelled
		 * it as a name the layout does not declare.
		 *
		 * What the join *does* re-canonicalise is the spacing around the separators
		 * of a cell the reader edited, which is what "writing is canonical" means
		 * and is not a part's own text. A cell nobody edited is never written at all,
		 * which is where byte identity lives.
		 */
		expect(written).toContain(
			'| Plate armour; Ring of  Protection; armour_class += 3 as item |',
		);
		// And the third part, the one that was edited, is the only one that moved.
		const cell = (written.split('\n')[3] ?? '').split('|')[2] ?? '';
		expect(cell.split(';').map((part) => part.trim())).toEqual([
			'Plate armour',
			'Ring of  Protection',
			'armour_class += 3 as item',
		]);
	});

	it('is not corrected by an edit to another cell in the row', () => {
		/*
		 * The stray reference survives the reader editing a *different* cell of the
		 * same row. Driven rather than reasoned, because a component that repainted
		 * the row on commit would break it silently.
		 */
		const { el, button, changes } = drawn('Ring of Nonexistence', {
			modifiers: strayContext(),
		});
		const amount = el.querySelector(
			'td.sheetsmith-table-number input',
		) as HTMLInputElement;
		amount.value = '4';
		amount.dispatchEvent(new Event('input'));
		amount.dispatchEvent(new Event('blur'));

		expect(changes).toEqual([{ rows: { 0: { cells: { Bonus: '4' } } } }]);
		expect(button.getAttribute('aria-label')).toBe(
			'Ring Modifiers: Ring of Nonexistence, changes nothing',
		);
	});

	it('draws the stored names where there is no sheet to resolve them against', () => {
		// A component draws what it can without the context, which is `link`'s own
		// rule: the truth where there is no layout to look a definition up in is
		// the value the note holds. The glyph then says nothing is applying, which
		// is the honest answer where nothing could be asked.
		const { glyph, button } = drawn('Ring of Protection');
		expect(glyph.dataset.icon).toBe('zap-off');
		expect(button.getAttribute('aria-label')).toBe(
			'Ring Modifiers: Ring of Protection, changes nothing',
		);
		// And no title, because there is nothing to say about it.
		expect(button.getAttribute('title')).toBeNull();
	});
});

describe('table and mod.self', () => {
	/*
	 * A skills card whose Total column reads its own slot. One declared row
	 * carries a key and the other does not, which is the case the zero rule
	 * exists for: a row with no key cannot be pushed at, so a column reading
	 * `mod.self` shows numbers down every row rather than "?" on half of them.
	 */
	const modifiable: TableConfig = {
		...config,
		rows: [
			{ label: 'Acrobatics', key: 'acrobatics', values: { ability: 'abilities.DEX' } },
			{ label: 'Perception', values: { ability: 'abilities.WIS' } },
		],
		columns: [
			{ key: 'Training', type: 'number', min: 0, max: 2 },
			{ key: 'Bonus', type: 'number' },
			{
				key: 'Total',
				type: 'computed',
				formula: 'ability + Training * prof + Bonus + mod.self',
				signed: true,
				publish: true,
			},
		],
	};

	/** A sheet where two are pushed at `skills.acrobatics` and nothing else. */
	function sheetWith(pushes: readonly [string, number][]) {
		return buildSheetEnv([
			{
				id: 'abilities',
				values: { named: { DEX: { value: 3 }, WIS: { value: 2 } } },
			},
			{ id: 'prof', values: { self: { value: 3 } } },
			{
				id: 'skills',
				values: table.scopeValues?.(stored(BODY, modifiable), modifiable) ?? {},
				resolver: (env) =>
					makeFieldResolver(table, modifiable, stored(BODY, modifiable), env),
			},
			{
				id: 'items',
				values: {},
				// One push per part, in a definition named for its target: the
				// component hands over one part's raw text and a row, and the formula
				// layer is what turns that into an amount at a target.
				modifiers: () =>
					pushes.map(([target]) => ({
						part: target,
						source: 'Items',
						row: { label: 'A row', values: {} },
					})),
			},
		], undefined, {
			definitions: pushes.map(([target, amount]) => ({
				name: target,
				target,
				targetLabel: target,
				operator: 'add' as const,
				amount: String(amount),
			})),
			targets: pushes.map(([target]) => ({ name: target, label: target })),
			published: pushes.map(([target]) => ({ name: target, label: target })),
			bonusTypes: [],
			accepting: new Set(pushes.map(([target]) => target)),
		});
	}

	it('modifies a declared row carrying a key, and only that row', () => {
		const env = sheetWith([['skills.acrobatics', 2]]);
		// 3 + 1*3 + 0 = 6, plus the 2 pushed at it.
		expect(env.sheet('skills.acrobatics')).toBe(8);
	});

	it('resolves to the unmodified number on a row with no key', () => {
		// Not "?": a row the layout gave no name cannot be pushed at, so its slot
		// is empty and its cell reads the number it always read.
		const data = stored(BODY, modifiable);
		const env = sheetWith([['skills.acrobatics', 2]]);
		const el = document.createElement('div');
		table.render(el, modifiable, data, {
			resolved: {},
			resolveField: makeFieldResolver(table, modifiable, data, env),
			explainField: makeFieldExplainer(table, modifiable, data, env),
			onChange: () => undefined,
		});
		expect(totals(el)).toEqual(['+8', '+9']);
	});

	it('marks the cell of the row that was modified and no other', () => {
		const data = stored(BODY, modifiable);
		const env = sheetWith([['skills.acrobatics', 2]]);
		const el = document.createElement('div');
		table.render(el, modifiable, data, {
			resolved: {},
			resolveField: makeFieldResolver(table, modifiable, data, env),
			explainField: makeFieldExplainer(table, modifiable, data, env),
			onChange: () => undefined,
			modifiers: modifierContext({
				breakdown: (name: string) =>
					name === 'skills.acrobatics'
						? {
								override: null,
								total: 2,
								lines: [
									{
										label: 'Belt',
										source: 'Magic items',
										definition: 'Belt',
										operator: 'add',
										type: null,
										amount: 2,
										suppressed: null,
									},
								],
							}
						: { override: null, total: 0, lines: [] },
			}),
		});
		const marked = Array.from(
			el.querySelectorAll('tbody .sheetsmith-table-value'),
		).map((cell) => cell.classList.contains('sheetsmith-modified'));
		expect(marked).toEqual([true, false]);
	});

	it('draws no mark on a computed column with no formula to modify', () => {
		/*
		 * A computed column with no formula and a published row key. `configError`
		 * does not refuse it — nothing there requires a computed column to carry a
		 * formula — and `scopeValues` still registers the row's name, so the slot
		 * exists and a row can be pushed at it.
		 *
		 * The cell reads "—", because nothing to compute is an empty cell rather
		 * than a value that failed. So there is no number for a modifier to have
		 * changed, and marking it would be a mark with nothing behind it: no
		 * title, no popover, and `modifier-breakdown.ts`'s own rule broken — the
		 * mark and the text are the same fact.
		 *
		 * What is left over is Risk 2 in the feature spec, recorded and accepted:
		 * the accepting set is coarse at the component, so the picker offers a
		 * target that ignores the row and the stray line cannot fire for it.
		 */
		const formulaless: TableConfig = {
			...modifiable,
			columns: [
				{ key: 'Training', type: 'number' },
				{ key: 'Bonus', type: 'number' },
				{ key: 'Total', type: 'computed', publish: true },
			],
		};
		// The column parses: this is the reachability half of the case.
		expect(table.read(BODY, formulaless).ok).toBe(true);
		const data = stored(BODY, formulaless);
		const el = document.createElement('div');
		table.render(el, formulaless, data, {
			resolved: {},
			resolveField: makeFieldResolver(table, formulaless, data, NO_ENV),
			onChange: () => undefined,
			modifiers: modifierContext({
				breakdown: () => ({
					override: null,
					total: 2,
					lines: [
						{
							label: 'Belt',
							source: 'Magic items',
							definition: 'Belt',
							operator: 'add',
							type: 'item',
							amount: 2,
							suppressed: null,
						},
					],
				}),
			}),
		});
		const cell = el.querySelector('tbody .sheetsmith-table-value') as HTMLElement;
		expect(cell.textContent).toBe('—');
		expect(cell.classList.contains('sheetsmith-modified')).toBe(false);
		// And no bubble is one press away either, which is the half a mark
		// promises.
		cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(document.querySelector('.sheetsmith-popover')).toBeNull();
	});

	it('carries the breakdown for a reader with no pointer', () => {
		/*
		 * The mark is `text-decoration` and the class carries no ARIA, so without
		 * this a screen reader on a modified cell hears the number and not even
		 * that it was modified. In a span inside the `td`, which is this
		 * component's own idiom — a hidden column heading and the delete column's
		 * name already use it — and needs no wiring: the cell is read as its
		 * contents.
		 *
		 * The same text the popover shows, from the one builder, so the two
		 * carriers cannot say different things.
		 */
		const data = stored(BODY, modifiable);
		const env = sheetWith([['skills.acrobatics', 2]]);
		const el = document.createElement('div');
		table.render(el, modifiable, data, {
			resolved: {},
			resolveField: makeFieldResolver(table, modifiable, data, env),
			explainField: makeFieldExplainer(table, modifiable, data, env),
			onChange: () => undefined,
			modifiers: modifierContext({
				breakdown: (name: string) =>
					name === 'skills.acrobatics'
						? {
								override: null,
								total: 2,
								lines: [
									{
										label: 'Belt',
										source: 'Magic items',
										definition: 'Belt',
										operator: 'add',
										type: 'item',
										amount: 2,
										suppressed: null,
									},
								],
							}
						: { override: null, total: 0, lines: [] },
			}),
		});
		const cells = Array.from(el.querySelectorAll('tbody td'));
		const twins = cells.map(
			(td) => td.querySelector('.sheetsmith-sr-only')?.textContent ?? null,
		);
		// One, on the row that was modified, and nothing on the row that was not.
		/*
		 * **Qualified even though one component is the only source**, which is the
		 * one place the drop rule stands down. A breakdown read *inside a table*
		 * names a row, and the reader is looking at a list of rows — so an
		 * unqualified `Belt` reads as one of the skills in front of them rather than
		 * as an item in an inventory two components away.
		 */
		expect(twins.filter((said) => said !== null)).toEqual([
			'Magic items · Belt — item +2\n\nTotal +2',
		]);
		// And it does not disturb what the cell reads as a value, which is what
		// keeps the totals and the computed cells asserting on one element.
		expect(totals(el)).toEqual(['+8', '+9']);
	});

	it('prints the cell\'s own number in the total line, under an override', () => {
		/*
		 * **The `shown` guard, on this drawer.** `modifierBreakdown`'s second
		 * argument exists so a total line prints the number its caller drew rather
		 * than recomputing `override + total`, and three components pass it — Card,
		 * Card set and Table. Only `card.test.ts` held the rule, so dropping the
		 * argument here passed every test in the suite: a wrong shape rather than a
		 * wrong value, milder than the original defect, and `docs/PATTERNS.md` §1's
		 * recurring lesson is that an extraction is not finished at the
		 * declarations. One case per drawer, cross-referenced from each.
		 *
		 * The cell reads +8 and the breakdown claims an override to 18, which is
		 * the divergence the correction is about: the number under the cursor is
		 * the cell's, so the total line has to be 8 and not 20.
		 */
		const data = stored(BODY, modifiable);
		const env = sheetWith([['skills.acrobatics', 2]]);
		const el = document.createElement('div');
		table.render(el, modifiable, data, {
			resolved: {},
			resolveField: makeFieldResolver(table, modifiable, data, env),
			explainField: makeFieldExplainer(table, modifiable, data, env),
			onChange: () => undefined,
			modifiers: modifierContext({
				breakdown: (name: string) =>
					name === 'skills.acrobatics'
						? {
								override: 18,
								total: 2,
								lines: [
									{
										label: 'Plate armour',
										source: 'Magic items',
										definition: 'Plate armour',
										operator: 'override',
										type: null,
										amount: 18,
										suppressed: null,
									},
								],
							}
						: { override: null, total: 0, lines: [] },
			}),
		});
		const twin = Array.from(el.querySelectorAll('tbody .sheetsmith-sr-only'))
			.map((one) => one.textContent ?? '')
			.find((said) => said.includes('Plate armour'));
		expect(totals(el)[0]).toBe('+8');
		expect((twin ?? '').split('\n').at(-1)).toBe('Total 8');
	});

	it('joins the breakdown to the popover the cell already opens', () => {
		// A modified computed cell has one door, not two: the tap that already
		// asks "why this number?" answers with the formula and the breakdown.
		const data = stored(BODY, modifiable);
		const env = sheetWith([['skills.acrobatics', 2]]);
		const el = document.createElement('div');
		table.render(el, modifiable, data, {
			resolved: {},
			resolveField: makeFieldResolver(table, modifiable, data, env),
			explainField: makeFieldExplainer(table, modifiable, data, env),
			onChange: () => undefined,
			modifiers: modifierContext({
				breakdown: () => ({
					override: null,
					total: 2,
					lines: [
						{
							label: 'Belt',
							source: 'Magic items',
							definition: 'Belt',
							operator: 'add',
							type: 'item',
							amount: 2,
							suppressed: null,
						},
					],
				}),
			}),
		});
		const cell = el.querySelector('tbody .sheetsmith-table-value') as HTMLElement;
		cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const said = document.querySelector('.sheetsmith-popover')?.textContent ?? '';
		expect(said).toContain('mod.self');
		expect(said).toContain('Belt — item +2');
		closePopover();
	});

	it('publishes the modified number under the row key', () => {
		// The cell on screen and the name the sheet reads are the same number,
		// which is what passing the published name from both paths buys.
		const env = sheetWith([['skills.acrobatics', 2]]);
		expect(env.sheet('skills.acrobatics')).toBe(8);
		const data = stored(BODY, modifiable);
		const el = document.createElement('div');
		table.render(el, modifiable, data, {
			resolved: {},
			resolveField: makeFieldResolver(table, modifiable, data, env),
			explainField: makeFieldExplainer(table, modifiable, data, env),
			onChange: () => undefined,
		});
		expect(totals(el)[0]).toBe('+8');
	});

	it('reports the row that stopped a slot, on the card reading it', () => {
		/*
		 * The acceptance criterion's own case: a modifier whose amount will not
		 * resolve makes the slot publish nothing, and the reading card's
		 * `explainField` names the row and the reason. Here the slot is refused,
		 * so the Total cell shows "?" and its title says which row.
		 */
		const data = stored(BODY, modifiable);
		const env = buildSheetEnv([
			{
				id: 'abilities',
				values: { named: { DEX: { value: 3 }, WIS: { value: 2 } } },
			},
			{ id: 'prof', values: { self: { value: 3 } } },
			{
				id: 'skills',
				values: table.scopeValues?.(data, modifiable) ?? {},
				resolver: (inner) => makeFieldResolver(table, modifiable, data, inner),
			},
			{
				id: 'items',
				values: {},
				modifiers: () => [
					{
						part: 'Belt',
						source: 'Magic items',
						row: { label: 'Belt of Giant Strength', values: {} },
					},
				],
			},
		], undefined, {
			// A definition whose amount reads a name nothing publishes, which is
			// the shape a layout arrives in after a card was renamed.
			definitions: [
				{
					name: 'Belt',
					target: 'skills.acrobatics',
					targetLabel: 'Skills · acrobatics',
					operator: 'add',
					amount: 'ability',
				},
			],
			targets: [],
			published: [],
			bonusTypes: [],
			accepting: new Set(['skills.acrobatics']),
		});
		const el = document.createElement('div');
		table.render(el, modifiable, data, {
			resolved: {},
			resolveField: makeFieldResolver(table, modifiable, data, env),
			explainField: makeFieldExplainer(table, modifiable, data, env),
			onChange: () => undefined,
		});
		const cells = el.querySelectorAll('tbody .sheetsmith-table-value');
		expect(cells[0]?.textContent).toBe('?');
		expect(cells[0]?.getAttribute('title')).toContain(
			'Row "Belt of Giant Strength"',
		);
		// The other row is not in the cycle and keeps working.
		expect(cells[1]?.textContent).toBe('+9');
	});
});
