// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { skillCard, SkillCardConfig, SkillCardData } from './skill-card';
import { closePopover, LONG_PRESS } from '../ui/popover';
import { makeFieldExplainer, makeFieldResolver } from '../formula/resolve';
import { Scope } from '../formula/expression';
import { RenderContext } from '../types';

/*
 * A D&D skill list, which is what fixed rows exist for: the layout owns the
 * eighteen skills, the character owns two cells per row, and one formula
 * serves every row because the row says which ability it means.
 */
const config: SkillCardConfig = {
	id: 'skills',
	type: 'skill-card',
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

function contextFor(data: SkillCardData | null, over = config): RenderContext {
	return {
		resolved: {},
		// The real resolver, so these exercise the dotted formula paths
		// (columns.2.formula, rows.0.values.ability) rather than a stub that
		// agrees with them.
		resolveField: makeFieldResolver(skillCard, over, data, sheet),
		explainField: makeFieldExplainer(skillCard, over, data, sheet),
		onChange: () => undefined,
	};
}

function render(data: SkillCardData | null, over = config): HTMLElement {
	const el = document.createElement('div');
	skillCard.render(el, over, data, contextFor(data, over));
	return el;
}

/** The same skill list with training as marks rather than a number field. */
const levelled: SkillCardConfig = {
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
	over: SkillCardConfig,
	data: SkillCardData = { rows: {} },
): { el: HTMLElement; changes: unknown[] } {
	const changes: unknown[] = [];
	const el = document.createElement('div');
	skillCard.render(el, over, data, {
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

describe('skillCard.read', () => {
	it('reads cells by row name and column', () => {
		const result = skillCard.read(BODY, config);
		expect(result).toEqual({
			ok: true,
			data: {
				rows: {
					Acrobatics: { training: '1', bonus: '0' },
					Perception: { training: '2', bonus: '1' },
				},
			},
		});
	});

	it('treats a section with no table as empty, not malformed', () => {
		expect(skillCard.read('\nProse only.\n', config)).toEqual({
			ok: true,
			data: null,
		});
	});

	it('keeps rows and columns the layout does not map', () => {
		const extra = `${BODY.trimEnd()}\n| Stealth | 3 | 2 |\n`;
		const result = skillCard.read(extra, config);
		expect(result.ok && result.data?.rows.Stealth).toEqual({
			training: '3',
			bonus: '2',
		});
	});

	it('reports a malformed section on this component alone', () => {
		const twice = `${BODY}\n| A |\n|---|\n| b |\n`;
		expect(skillCard.read(twice, config).ok).toBe(false);
	});

	it('reports a duplicate column key as a configuration error', () => {
		const broken = {
			...config,
			columns: [{ key: 'Bonus' }, { key: 'bonus' }],
		};
		const result = skillCard.read(BODY, broken);
		expect(result.ok).toBe(false);
	});

	it('reports a column that collides with the name column', () => {
		const broken = { ...config, columns: [{ key: 'Skill' }] };
		expect(skillCard.read(BODY, broken).ok).toBe(false);
	});

	it('reports a pipe in a column key, which the file cannot hold', () => {
		const broken = { ...config, columns: [{ key: 'a|b' }] };
		expect(skillCard.read(BODY, broken).ok).toBe(false);
	});

	/*
	 * Row and column names are text out of the note, so they can be anything a
	 * player types — including the names on Object.prototype. Read them into an
	 * ordinary object and "toString" looks like a row that is already there,
	 * "constructor" looks like a cell holding a function, and the sheet quietly
	 * shows a blank over data the file still holds. §4.2 has this same block
	 * covering inventory and features, where names are arbitrary.
	 */
	it('keeps a row named for something on Object.prototype', () => {
		const body = `
| Skill | Training | Bonus |
|---|---|---|
| toString | 1 | 4 |
| Acrobatics | 2 | 0 |
`;
		const result = skillCard.read(body, config);
		if (!result.ok || result.data === null) throw new Error('expected data');
		// Read through entries rather than rows['toString']: TypeScript resolves
		// that access to Object.prototype.toString, which is the same trap the
		// runtime falls into and would assert against the method here.
		expect(Object.entries(result.data.rows)).toEqual([
			['toString', { training: '1', bonus: '4' }],
			['Acrobatics', { training: '2', bonus: '0' }],
		]);
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
		const result = skillCard.read(body, shadowing);
		if (!result.ok || result.data === null) throw new Error('expected data');
		expect(Object.entries(result.data.rows['Acrobatics'] ?? {})).toEqual([
			['constructor', '7'],
		]);
	});

	it('does not lose such a row through a write', () => {
		const body = `
| Skill | Training | Bonus |
|---|---|---|
| toString | 1 | 4 |
`;
		const read = skillCard.read(body, config);
		if (!read.ok || read.data === null) throw new Error('expected data');
		expect(skillCard.write(read.data, body, config)).toBe(body);
	});
});

describe('skillCard.write', () => {
	it('round-trips unchanged data byte for byte', () => {
		const read = skillCard.read(BODY, config);
		if (!read.ok || read.data === null) throw new Error('expected data');
		expect(skillCard.write(read.data, BODY, config)).toBe(BODY);
	});

	it('rewrites only the cell that changed', () => {
		const out = skillCard.write(
			{ rows: { Acrobatics: { Training: '2' } } },
			BODY,
			config,
		);
		expect(out).toBe(BODY.replace('| Acrobatics | 1 |', '| Acrobatics | 2 |'));
	});

	it('never writes a computed column into the note', () => {
		const out = skillCard.write(
			{ rows: { Acrobatics: { Training: '1', Total: '6' } } },
			BODY,
			config,
		);
		expect(out).toBe(BODY);
		expect(out).not.toContain('Total');
	});

	it('seeds every declared row the first time the section is written', () => {
		const out = skillCard.write({ rows: { Acrobatics: { Training: '1' } } }, null, config);
		expect(out).toBe(
			'\n| Skill | Training | Bonus |\n|---|---|---|\n' +
				'| Acrobatics | 1 |  |\n| Perception |  |  |\n',
		);
	});

	it('keeps a row the layout no longer declares', () => {
		// SPEC §10: a layout change never deletes character data.
		const extra = `${BODY.trimEnd()}\n| Stealth | 3 | 2 |\n`;
		const out = skillCard.write(
			{ rows: { Acrobatics: { Training: '2' } } },
			extra,
			config,
		);
		expect(out).toContain('| Stealth | 3 | 2 |');
	});

	it('leaves prose in the section alone', () => {
		const withProse = `\nWhat these are for.\n${BODY}`;
		const out = skillCard.write(
			{ rows: { Acrobatics: { Training: '2' } } },
			withProse,
			config,
		);
		expect(out.startsWith('\nWhat these are for.\n')).toBe(true);
	});
});

describe('skillCard.render', () => {
	it('renders one row per declared row, in order', () => {
		const el = render({ rows: { Acrobatics: { training: '1', bonus: '0' } } });
		const names = Array.from(
			el.querySelectorAll('tbody .sheetsmith-table-name'),
		).map((cell) => cell.textContent);
		expect(names).toEqual(['Acrobatics', 'Perception']);
	});

	it('draws the name column where the layout puts it', () => {
		const el = render({ rows: {} }, { ...levelled, namePosition: 1 });
		const headings = Array.from(el.querySelectorAll('thead th')).map(
			(cell) => cell.textContent,
		);
		expect(headings).toEqual(['Training', 'Skill', 'Bonus', 'Total']);
		const first = el.querySelector('tbody tr')?.firstElementChild;
		expect(first?.querySelector('.sheetsmith-table-cycle')).not.toBeNull();
	});

	it('keeps the name first in the note however it is drawn', () => {
		// Display order is not storage order: the name identifies the row.
		const out = skillCard.write(
			{ rows: { Acrobatics: { Training: '1' } } },
			null,
			{ ...config, namePosition: 1 },
		);
		expect(out.split('\n')[1]).toBe('| Skill | Training | Bonus |');
	});

	it('leaves a heading off the sheet but not off the column', () => {
		const el = render({ rows: {} }, {
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
		const el = render({ rows: { Acrobatics: { ability: 'DEX' } } }, {
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
		const data = {
			rows: {
				Acrobatics: { training: '1', bonus: '0' },
				Perception: { training: '2', bonus: '1' },
			},
		};
		expect(totals(render(data))).toEqual(['+6', '+9']);
	});

	it('treats a blank numeric cell as zero, so an untrained skill still totals', () => {
		expect(totals(render({ rows: {} }))).toEqual(['+3', '+2']);
	});

	it('marks a computed cell that will not resolve rather than showing a number', () => {
		const broken = {
			...config,
			columns: [
				{ key: 'Training', type: 'number' as const },
				{ key: 'Total', type: 'computed' as const, formula: 'nonexistent + 1' },
			],
		};
		const el = render({ rows: {} }, broken);
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
		const el = render({ rows: {} }, blank);
		expect(totals(el)).toEqual(['—', '—']);
		expect(el.querySelector('.sheetsmith-table-unresolved')).toBeNull();
	});

	it('reveals the formula behind a computed cell on hover', () => {
		const el = render({ rows: {} });
		expect(
			el.querySelector("tbody .sheetsmith-table-value")?.getAttribute('title'),
		).toBe('ability + Training * prof + Bonus');
	});

	it('renders a level column as one control, not one per level', () => {
		const el = render({ rows: { Acrobatics: { training: '1' } } }, levelled);
		// Two rows, one control each — not two marks apiece.
		expect(el.querySelectorAll('tbody button')).toHaveLength(2);
		expect(el.querySelectorAll('tbody input')).toHaveLength(2); // the bonus cells
	});

	it('says which level it is on, by name where the column names them', () => {
		const el = render({ rows: { Acrobatics: { training: '2' } } }, levelled);
		const buttons = el.querySelectorAll('tbody .sheetsmith-table-cycle');
		expect(buttons[0]?.getAttribute('aria-label')).toBe('Acrobatics Training: 2');
		expect(buttons[1]?.getAttribute('aria-label')).toBe('Perception Training: 0');

		const named = { ...levelled, columns: [
			{ key: 'Training', type: 'level' as const,
				levels: ['Untrained', 'Proficient', 'Expertise'] },
		] };
		const withNames = render({ rows: { Acrobatics: { training: '2' } } }, named);
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
			{ rows: { Acrobatics: { Training: '1' } } },
			{ rows: { Acrobatics: { Training: '2' } } },
			{ rows: { Acrobatics: { Training: '0' } } },
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
		const el = render({ rows: { Acrobatics: { training: '2' } } }, named);
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
		const el = render(
			{ rows: { Acrobatics: { training: '1' }, Perception: { training: '2' } } },
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
		const el = render(
			{ rows: { Acrobatics: { training: '1' }, Perception: { training: '2' } } },
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
		const el = render(
			{ rows: { Acrobatics: { training: '1' }, Perception: { training: '2' } } },
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
		const el = render({ rows: {} }, {
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
		const el = render({ rows: { Acrobatics: { training: '1' } } }, {
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
		const el = render({ rows: { Acrobatics: { training: '1000' } } }, {
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
		const el = render({ rows: { Acrobatics: { trained: 'yes' } } }, toggles);
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
		const el = render({ rows: {} }, levelled);
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
		const el = render({ rows: { Acrobatics: { training: '2' } } }, levelled);
		expect(
			el.querySelector('tbody .sheetsmith-table-cycle')?.textContent,
		).toBe('2');
	});

	it('steps with the arrow keys without wrapping', () => {
		const { el, changes } = recording(levelled, {
			rows: { Acrobatics: { training: '2' } },
		});
		const button = el.querySelector('tbody .sheetsmith-table-cycle') as HTMLElement;
		button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
		expect(changes).toEqual([]);
		button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
		expect(changes).toEqual([{ rows: { Acrobatics: { Training: '1' } } }]);
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
		expect(changes).toEqual([{ rows: { Acrobatics: { Training: '2' } } }]);
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
			{ rows: { Acrobatics: { Training: '1' } } },
			{ rows: { Acrobatics: { Training: '0' } } },
		]);
	});

	it('reports too few level names as a configuration error', () => {
		const broken = {
			...levelled,
			columns: [{ key: 'Training', type: 'level' as const, levels: ['Only'] }],
		};
		expect(skillCard.read(BODY, broken).ok).toBe(false);
	});

	it('feeds the level to the row formula as a number', () => {
		// DEX 3 + training 2 x prof 3 + bonus 0 = 9
		const el = render({ rows: { Acrobatics: { training: '2' } } }, levelled);
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
		const el = render({ rows: { Acrobatics: { trained: 'yes' } } }, toggles);
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
			{ rows: { Acrobatics: { Trained: 'yes' } } },
			{ rows: { Acrobatics: { Trained: 'no' } } },
		]);
	});

	it('gives an unnamed level no tooltip repeating its own glyph', () => {
		const el = render({ rows: { Acrobatics: { training: '2' } } }, levelled);
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
		const el = render({ rows: {} }, broken);
		const cell = el.querySelector('tbody .sheetsmith-table-value');
		expect(cell?.textContent).toBe('?');
		expect(cell?.getAttribute('title')).toContain('nonexistent');
	});

	it('recomputes the total live, before anything is committed', () => {
		const el = render({ rows: { Acrobatics: { training: '1', bonus: '0' } } });
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
		skillCard.render(el, config, { rows: {} }, {
			...contextFor({ rows: {} }),
			onChange: (data) => changes.push(data),
		});
		const input = el.querySelector(
			'input[aria-label="Perception Bonus"]',
		) as HTMLInputElement;
		input.value = '4';
		input.dispatchEvent(new Event('blur'));
		expect(changes).toEqual([{ rows: { Perception: { Bonus: '4' } } }]);
	});

	it('holds a typed number to the column bounds', () => {
		const changes: unknown[] = [];
		const el = document.createElement('div');
		skillCard.render(el, config, { rows: {} }, {
			...contextFor({ rows: {} }),
			onChange: (data) => changes.push(data),
		});
		const input = el.querySelector(
			'input[aria-label="Acrobatics Training"]',
		) as HTMLInputElement;
		input.value = '5';
		input.dispatchEvent(new Event('blur'));
		expect(changes).toEqual([{ rows: { Acrobatics: { Training: '2' } } }]);
		expect(input.value).toBe('2');
	});

	it('shows a configuration error on itself rather than a broken table', () => {
		const broken = { ...config, rows: [{ label: 'A' }, { label: 'A' }] };
		const el = render(null, broken);
		expect(el.querySelector('.sheetsmith-error')).not.toBeNull();
		expect(el.querySelector('table')).toBeNull();
	});
});

describe('skillCard touch affordances', () => {
	/*
	 * `title` is the whole story only where there is a pointer. These cover
	 * the second door: the route to a level's name and to a computed cell's
	 * formula on a device that never fires a hover.
	 */
	const named: SkillCardConfig = {
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
				rows: { Acrobatics: { training: '2' } },
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
			expect(changes).toEqual([{ rows: { Acrobatics: { Training: '1' } } }]);
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
			expect(changes).toEqual([{ rows: { Acrobatics: { Training: '1' } } }]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('reveals the formula behind a computed cell on a tap', () => {
		const el = render({ rows: {} }, named);
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
		const el = render({ rows: {} }, broken);
		const cell = el.querySelector('tbody .sheetsmith-table-value') as HTMLElement;
		cell.click();
		expect(document.querySelector('.sheetsmith-popover')?.textContent).toContain(
			'nope',
		);
		closePopover();
	});

	it('shows one bubble at a time', () => {
		const el = render({ rows: {} }, named);
		const cells = el.querySelectorAll('tbody .sheetsmith-table-value');
		(cells[0] as HTMLElement).click();
		(cells[1] as HTMLElement).click();
		expect(document.querySelectorAll('.sheetsmith-popover')).toHaveLength(1);
		closePopover();
	});
});
