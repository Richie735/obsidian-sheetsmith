// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { table, TableConfig, TableData } from './table';
import { closePopover, LONG_PRESS } from '../ui/popover';
import { UNRESOLVED_DELAY } from '../interaction/editable';
import { FOCUSABLE } from '../view/sheet-view';
import { makeFieldExplainer, makeFieldResolver } from '../formula/resolve';
import { evaluate, Scope } from '../formula/expression';
import { buildSheetScope } from '../formula/sheet';
import { RenderContext } from '../types';

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
		resolveField: makeFieldResolver(table, over, data, sheet),
		explainField: makeFieldExplainer(table, over, data, sheet),
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
		expect(first?.querySelector('.sheetsmith-table-cycle')).not.toBeNull();
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
		const buttons = el.querySelectorAll('tbody .sheetsmith-table-cycle');
		expect(buttons[0]?.getAttribute('aria-label')).toBe('Acrobatics Training: 2');
		expect(buttons[1]?.getAttribute('aria-label')).toBe('Perception Training: 0');

		const named = { ...levelled, columns: [
			{ key: 'Training', type: 'level' as const,
				levels: ['Untrained', 'Proficient', 'Expertise'] },
		] };
		const withNames = render(note({ Acrobatics: { training: '2' } }), named);
		const first = withNames.querySelector('tbody .sheetsmith-table-cycle');
		expect(first?.getAttribute('aria-label')).toBe(
			'Acrobatics Training: Expertise',
		);
	});

	it('cycles through the levels and back to none on click', () => {
		const { el, changes } = recording(levelled);
		const button = el.querySelector('tbody .sheetsmith-table-cycle') as HTMLElement;
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
		const button = el.querySelector('tbody .sheetsmith-table-cycle') as HTMLElement;
		button.click();
		expect(button.getAttribute('aria-label')).toBe('Acrobatics Training: 1');
		expect(button.classList.contains('sheetsmith-table-cycle-on')).toBe(true);
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
		const buttons = el.querySelectorAll('tbody .sheetsmith-table-cycle');
		// The initial of the level's name, and the full name on hover.
		expect(buttons[0]?.textContent).toBe('E');
		expect(buttons[0]?.getAttribute('title')).toBe('Expertise');
		// Untrained is an empty ring: it needs no letter to say so.
		expect(buttons[1]?.textContent).toBe('');
		expect(buttons[1]?.getAttribute('title')).toBe('Untrained');
		expect(
			buttons[1]?.classList.contains('sheetsmith-table-cycle-on'),
		).toBe(false);
	});

	it('shades a marked level by how far up the column it is', () => {
		const el = render(note({ Acrobatics: { training: '1' }, Perception: { training: '2' } }),
			levelled,
		);
		const rings = Array.from(
			el.querySelectorAll<HTMLElement>('tbody .sheetsmith-table-cycle'),
		);
		// Two of two levels is the whole way; one of two is half of it.
		expect(rings.map((ring) => ring.style.getPropertyValue('--sheetsmith-level')))
			.toEqual(['0.5', '1']);
		// Short of the top the glyph reads against the page, not the accent.
		expect(
			rings.map((ring) => ring.classList.contains('sheetsmith-table-cycle-part')),
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
			el.querySelectorAll<HTMLElement>('tbody .sheetsmith-table-cycle'),
		);
		expect(rings.map((ring) => ring.textContent)).toEqual(['', 'E']);
		// A fill with nothing on it is still a marked ring, and still says
		// which level it is on through the ramp.
		expect(rings.map((ring) => ring.classList.contains('sheetsmith-table-cycle-on')))
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
		const rings = Array.from(el.querySelectorAll('tbody .sheetsmith-table-cycle'));
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
		const ring = el.querySelector('tbody .sheetsmith-table-cycle');
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
		const ring = el.querySelector('tbody .sheetsmith-table-cycle');
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
			el.querySelectorAll<HTMLElement>('tbody .sheetsmith-table-cycle'),
		);
		// A toggle has one state to be in, so a share of the way up says
		// nothing; it takes the full fill, as it always did. Acrobatics is
		// ticked, Perception is not, and neither carries a share.
		expect(rings.map((ring) => ring.style.getPropertyValue('--sheetsmith-level')))
			.toEqual(['', '']);
		expect(
			rings.map((ring) => ring.classList.contains('sheetsmith-table-cycle-part')),
		).toEqual([false, false]);
	});

	it('reshades as it cycles, without waiting for the view to rebuild', () => {
		const el = render(note({}), levelled);
		const ring = el.querySelector('tbody .sheetsmith-table-cycle') as HTMLElement;
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
			el.querySelector('tbody .sheetsmith-table-cycle')?.textContent,
		).toBe('2');
	});

	it('steps with the arrow keys without wrapping', () => {
		const { el, changes } = recording(levelled, {
			rows: { 0: { name: 'Acrobatics', cells: { training: '2' } } },
		});
		const button = el.querySelector('tbody .sheetsmith-table-cycle') as HTMLElement;
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
		const button = el.querySelector('tbody .sheetsmith-table-cycle') as HTMLElement;
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
		const rings = el.querySelectorAll('tbody .sheetsmith-table-cycle');
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
		const ring = el.querySelector('tbody .sheetsmith-table-cycle') as HTMLElement;
		ring.click();
		ring.click();
		expect(changes).toEqual([
			{ rows: { 0: { cells: { Trained: 'yes' } } } },
			{ rows: { 0: { cells: { Trained: 'no' } } } },
		]);
	});

	it('gives an unnamed level no tooltip repeating its own glyph', () => {
		const el = render(note({ Acrobatics: { training: '2' } }), levelled);
		const ring = el.querySelector('tbody .sheetsmith-table-cycle');
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

	// jsdom has no PointerEvent, so the pointer type goes on a plain event.
	function press(el: HTMLElement, pointerType = 'touch'): void {
		const event = new Event('pointerdown');
		Object.defineProperty(event, 'pointerType', { value: pointerType });
		el.dispatchEvent(event);
	}

	it('reveals a level name on a long press, and swallows the click', () => {
		vi.useFakeTimers();
		try {
			const { el, changes } = recording(named, {
				rows: { 0: { name: 'Acrobatics', cells: { training: '2' } } },
			});
			const ring = el.querySelector('tbody .sheetsmith-table-cycle') as HTMLElement;
			press(ring);
			vi.advanceTimersByTime(LONG_PRESS + 10);

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
			const ring = el.querySelector('tbody .sheetsmith-table-cycle') as HTMLElement;
			press(ring, 'mouse');
			vi.advanceTimersByTime(LONG_PRESS + 10);

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
			const ring = el.querySelector('tbody .sheetsmith-table-cycle') as HTMLElement;
			press(ring);
			ring.dispatchEvent(new Event('pointerup'));
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
				resolver: (scope) => makeFieldResolver(table, over, data, scope),
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
			resolveField: makeFieldResolver(table, paired, data, scope),
			explainField: makeFieldExplainer(table, paired, data, scope),
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
		label: 'Load',
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
		(el.querySelector('tbody .sheetsmith-table-cycle') as HTMLElement).click();
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
		// A misconfigured card publishes nothing, so a formula reading its total
		// fails and says so rather than reading a number the card refuses to show.
		expect(table.scopeValues?.(null, broken)).toEqual({});
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
