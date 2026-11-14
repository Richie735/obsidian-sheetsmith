// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { roster, RosterConfig } from './roster';
import { table, TableConfig } from './table';
import { track, TrackConfig } from './track';
import { card, CardConfig } from './card';
import { formulaContext } from '../formula/resolve';
import { parseFunctions } from '../formula/functions';
import { buildSheet, ReadComponent } from '../formula/sheet';
import { Layout } from '../parse/layout';
import { ComponentConfig, ComponentDefinition, StateAccount, StateShape } from '../types';
import { closePopover } from '../ui/popover';
import { STATE_DOOR_CLASS, STATE_STRIP_CLASS } from './state-ring';
import { stateAccountText } from './modifier-breakdown';

/*
 * A ring a modifier set, through the real sheet: the acceptance cases of
 * `docs/features/non-number-modifiers.md` on the three components that draw
 * one, and the door, the description and the dead-press popover they share.
 */

afterEach(() => {
	closePopover();
	document.body.replaceChildren();
});

/** One component on the sheet, its body, and its definition. */
interface Placed {
	config: ComponentConfig;
	component: ComponentDefinition;
	body: string;
}

/** Build a sheet from placed components, with the layout's modifiers and functions. */
function sheetOf(
	placed: readonly Placed[],
	modifiers: unknown[] = [],
	functions: string[] = [],
) {
	const layout = {
		name: 'Test',
		components: placed.map((one) => one.config),
		modifiers,
		functions,
	} as unknown as Layout;
	const prepared: ReadComponent[] = placed.map(({ config, component, body }) => {
		const read = component.read(body, config);
		if (!read.ok) throw new Error(read.error);
		return { config, component, data: read.data, error: null };
	});
	const { env, modifiers: context } = buildSheet(layout, prepared, parseFunctions(functions).library);
	/** Draw one placed component through the sheet, the way a host would. */
	const draw = (at: number, changes: unknown[] = []) => {
		const entry = prepared[at] as ReadComponent;
		const component = entry.component as ComponentDefinition;
		const el = document.body.createDiv();
		component.render(el, entry.config, entry.data, {
			...formulaContext(component, entry.config, entry.data, env),
			onChange: (data) => changes.push(data),
			modifiers: context,
		});
		return el;
	};
	return { env, modifiers: context, draw };
}

/** The gear table a modifier is enrolled from, one row per part. */
function gear(parts: readonly string[]): Placed {
	const config: TableConfig = {
		id: 'gear',
		type: 'table',
		label: 'Gear',
		position: { col: 1, row: 9, width: 4, height: 2 },
		rowHeader: 'Item',
		rows: parts.map((_, at) => ({ label: at === 0 ? 'Cat Form' : `Item ${at + 1}` })),
		columns: [{ key: 'Modifiers', type: 'modifier', hideHeading: true }],
	};
	const lines = parts.map((part, at) => `| ${at === 0 ? 'Cat Form' : `Item ${at + 1}`} | ${part} |`);
	return {
		config,
		component: table,
		body: ['| Item | Modifiers |', '| --- | --- |', ...lines].join('\n'),
	};
}

/** The door a ring cell or card carries, and the account behind it. */
function doorOf(el: HTMLElement, cls = STATE_DOOR_CLASS) {
	const door = el.querySelector<HTMLButtonElement>(`.${cls}`);
	const twin = door?.getAttribute('aria-describedby');
	const text = twin === null || twin === undefined ? null : el.querySelector(`#${twin}`)?.textContent;
	return { door, text };
}

/** The Druid's abilities, trimmed to the two stats and one row the case reads. */
const DRUID: RosterConfig = {
	id: 'abilities',
	type: 'roster',
	label: 'Abilities',
	position: { col: 1, row: 1, width: 4, height: 6 },
	stats: [
		{ key: 'WIS', name: 'Wisdom' },
		{ key: 'DEX', name: 'Dexterity' },
	],
	rows: [{ label: 'Stealth', stat: 'DEX', key: 'stealth' }],
	columns: [
		{ key: 'Training', type: 'level', levels: ['Untrained', 'Proficient:', 'Expertise:E'] },
		{
			key: 'Total',
			type: 'computed',
			formula: 'stat + Training * pb + mod.self',
			signed: true,
			publish: true,
		},
	],
	derived: 'mod(value + mod.self)',
	effective: 'value + mod.self',
};

const DRUID_BODY = [
	'```sheet',
	'WIS: 22',
	'DEX: 14',
	'```',
	'',
	'| Name | Training |',
	'|---|---|',
	'| Stealth | 0 |',
].join('\n');

const CAT_FORM = {
	name: 'Cat Form',
	target: 'abilities.stealth',
	column: 'Training',
	operator: 'upgrade',
	amount: '1',
};

const FUNCTIONS = ['mod(score) = floor((score - 10) / 2)', 'pb = 2'];

describe('the Druid case: Cat Form makes the druid proficient in Stealth', () => {
	const sheet = () =>
		sheetOf(
			[
				{ config: DRUID, component: roster, body: DRUID_BODY },
				gear(['Cat Form']),
			],
			[CAT_FORM],
			FUNCTIONS,
		);

	it('draws the Training ring Proficient, with the door onto why', () => {
		const el = sheet().draw(0);
		const ring = el.querySelector<HTMLButtonElement>('.sheetsmith-level-ring');
		expect(ring?.getAttribute('aria-label')).toBe('Stealth Training: Proficient');
		expect(ring?.getAttribute('aria-description')).toBe('Set by a modifier; your own: Untrained');
		const { door, text } = doorOf(el);
		expect(door?.getAttribute('aria-label')).toBe('Modifiers on Stealth');
		expect(text).toBe('Your own: Untrained\n\nGear · Cat Form — at least Proficient\n\nNow Proficient');
	});

	it('reads the row as Proficient everywhere: the published name is stat + 1 * pb', () => {
		const { env } = sheet();
		// DEX 14 -> mod 2, Training at least 1: 2 + 1 * 2.
		expect(env.sheet('abilities.stealth')).toBe(4);
	});

	it('opens the account on the door\'s press', () => {
		const el = sheet().draw(0);
		doorOf(el).door?.click();
		expect(document.querySelector('.sheetsmith-popover')?.textContent).toBe(
			'Your own: Untrained\n\nGear · Cat Form — at least Proficient\n\nNow Proficient',
		);
	});

	it('names the stored level first in the door\'s account while it differs, draws no mark for it, and opens nothing on a press', () => {
		const changes: unknown[] = [];
		const el = sheet().draw(0, changes);
		const ring = el.querySelector<HTMLButtonElement>('.sheetsmith-level-ring');
		const read = () => doorOf(el);
		// Stored Untrained, drawn Proficient: the door is the `info` glyph and
		// nothing on screen stands for the stored level, which the account says.
		expect(read().door?.querySelector('svg')).not.toBeNull();
		expect(read().door?.children).toHaveLength(1);
		expect(read().text?.split('\n')[0]).toBe('Your own: Untrained');
		ring?.click();
		// The note moved to Proficient, which is what the ring draws: no own line,
		// and the floor now changes nothing.
		expect(changes).toHaveLength(1);
		expect(ring?.getAttribute('aria-label')).toBe('Stealth Training: Proficient');
		read().door?.click();
		expect(document.querySelector('.sheetsmith-popover')?.textContent).toBe(
			'Gear · Cat Form — at least Proficient (not applied: already Proficient)\n\nNow Proficient',
		);
		expect(read().door?.querySelector('svg')).not.toBeNull();
		expect(el.querySelector('[aria-live]')?.textContent).toBe('Your own is now Proficient');
	});

	it('keeps the door\'s name and says the reader\'s own level in its description while the two differ', () => {
		const changes: unknown[] = [];
		const el = sheet().draw(0, changes);
		const { door } = doorOf(el);
		expect(door?.getAttribute('aria-label')).toBe('Modifiers on Stealth');
		expect(door?.getAttribute('aria-description')).toBe('Set by a modifier; your own: Untrained');
		el.querySelector<HTMLButtonElement>('.sheetsmith-level-ring')?.click();
		// The two agree, and the description goes.
		expect(door?.getAttribute('aria-label')).toBe('Modifiers on Stealth');
		expect(door?.hasAttribute('aria-description')).toBe(false);
	});

	it('carries a note at the row\'s name in the door\'s account, and draws no second info glyph in the cell', () => {
		// The Training column publishes the row's name here, so a note at it is
		// the ring cell's own and not the Total's.
		const published: RosterConfig = {
			...DRUID,
			columns: (DRUID.columns ?? []).map((column) => ({ ...column, publish: column.key === 'Training' })),
		};
		const el = sheetOf(
			[
				{ config: published, component: roster, body: DRUID_BODY },
				// The level is the row's own value here, so it is named alone.
				gear(['abilities.stealth >= 1', 'abilities.stealth += note: Quiet paws']),
			],
			[],
			FUNCTIONS,
		).draw(0);
		const row = Array.from(el.querySelectorAll('tr')).find((tr) => tr.textContent?.includes('Stealth'));
		const { door, text } = doorOf(row as HTMLElement);
		// One door onto one value's account: two `info` glyphs in one cell would
		// be two.
		expect(door).not.toBeNull();
		expect(text).toContain('at least Proficient');
		expect(text).toContain('Quiet paws');
		expect(row?.querySelector('.sheetsmith-note-mark')).toBeNull();
	});

	it('tints nothing and draws no door with the form off', () => {
		const el = sheetOf(
			[
				{ config: DRUID, component: roster, body: DRUID_BODY },
				gear(['']),
			],
			[CAT_FORM],
			FUNCTIONS,
		).draw(0);
		expect(el.querySelector(`.${STATE_DOOR_CLASS}`)).toBeNull();
		expect(el.querySelector('.sheetsmith-level-ring')?.hasAttribute('aria-description')).toBe(false);
		expect(el.querySelector('[data-sheetsmith-state-column]')).toBeNull();
	});
});

/** The 5e starter's own skills table, from the file it ships in. */
function starterSkills(): TableConfig {
	const starter = JSON.parse(readFileSync('src/starters/5e.json', 'utf8')) as {
		components: (ComponentConfig & { children?: ComponentConfig[] })[];
	};
	const find = (components: readonly (ComponentConfig & { children?: ComponentConfig[] })[]): TableConfig | null => {
		for (const one of components) {
			if (one.id === 'skills') return one as unknown as TableConfig;
			const inner = find((one.children ?? []));
			if (inner !== null) return inner;
		}
		return null;
	};
	const found = find(starter.components);
	if (found === null) throw new Error('the 5e starter has no skills table');
	return found;
}

/** A Roster publishing `abilities.DEX`, which the starter's Stealth row reads. */
const ABILITIES: RosterConfig = {
	id: 'abilities',
	type: 'roster',
	label: 'Abilities',
	position: { col: 1, row: 1, width: 4, height: 2 },
	stats: [{ key: 'DEX' }],
	derived: 'mod(value)',
};

describe('the starter rule: skills.stealth >= 1 in Training on a modifier row', () => {
	const sheet = (stored: string) => {
		const skills = starterSkills();
		const body = ['| Skill | Training | Ability |', '|---|---|---|', `| Stealth | ${stored} | DEX |`].join('\n');
		return sheetOf(
			[
				{ config: skills, component: table, body },
				{ config: ABILITIES, component: roster, body: '```sheet\nDEX: 14\n```' },
				gear(['skills.stealth >= 1 in Training']),
			],
			[],
			['mod(score) = floor((score - 10) / 2)', 'prof = 2'],
		);
	};

	it('agrees on Proficient in the Total cell, the published name and the ring', () => {
		const { env, draw } = sheet('');
		expect(env.sheet('skills.stealth')).toBe(4);
		const el = draw(0);
		const row = Array.from(el.querySelectorAll('tr')).find((tr) => tr.textContent?.includes('Stealth'));
		expect(row?.querySelector('.sheetsmith-table-computed .sheetsmith-table-value')?.textContent).toBe('+4');
		expect(row?.querySelector('.sheetsmith-level-ring')?.getAttribute('aria-label')).toBe(
			'Stealth Training: Proficient',
		);
	});

	it('draws an own Expertise as Expertise, lists the line as already Expertise, and keeps the door', () => {
		const el = sheet('2').draw(0);
		const row = Array.from(el.querySelectorAll('tr')).find((tr) => tr.textContent?.includes('Stealth'));
		expect(row?.querySelector('.sheetsmith-level-ring')?.getAttribute('aria-label')).toBe(
			'Stealth Training: Expertise',
		);
		const { door, text } = doorOf(row as HTMLElement);
		expect(door).not.toBeNull();
		expect(text).toBe('Gear · Cat Form — at least Proficient (not applied: already Expertise)\n\nNow Expertise');
	});

	it('draws the door at the row\'s end, named for the row, and keeps its slot in every other row\'s last cell', () => {
		const el = sheet('').draw(0);
		const rows = Array.from(el.querySelectorAll('tbody tr'));
		const stealth = rows.find((tr) => tr.textContent?.includes('Stealth')) as HTMLElement;
		const doors = el.querySelectorAll<HTMLButtonElement>(`td .${STATE_DOOR_CLASS}`);
		expect(doors).toHaveLength(1);
		// After the Total, and nowhere beside the ring.
		const end = stealth.lastElementChild as HTMLElement;
		expect(end.classList.contains('sheetsmith-table-computed')).toBe(true);
		expect(doors[0]?.parentElement).toBe(end);
		expect(doors[0]?.getAttribute('aria-label')).toBe('Modifiers on Stealth');
		expect(stealth.querySelector(`.sheetsmith-table-level .${STATE_DOOR_CLASS}`)).toBeNull();
		// Seventeen other skills, each reserving the door's slot after its Total
		// as a cell beside a note mark does, and no ring cell reserving any.
		const reserving = rows.filter(
			(tr) =>
				tr !== stealth && tr.lastElementChild?.classList.contains('sheetsmith-note-column') === true,
		);
		expect(reserving).toHaveLength(17);
		for (const ring of Array.from(el.querySelectorAll('.sheetsmith-table-level'))) {
			expect(ring.classList.contains('sheetsmith-note-column')).toBe(false);
		}
	});

	it('draws one door for a row with two rings set, its parts headed by column', () => {
		const skills = starterSkills();
		// A second ring before the Total, a flag the same row's modifiers set.
		const columns = [...(skills.columns ?? [])];
		columns.splice(1, 0, { key: 'Advantage', type: 'toggle' });
		const both: TableConfig = { ...skills, columns };
		const body = ['| Skill | Training | Advantage | Ability |', '|---|---|---|---|', '| Stealth |  |  | DEX |'].join('\n');
		const el = sheetOf(
			[
				{ config: both, component: table, body },
				{ config: ABILITIES, component: roster, body: '```sheet\nDEX: 14\n```' },
				gear(['skills.stealth >= 1 in Training; skills.stealth = on in Advantage']),
			],
			[],
			['mod(score) = floor((score - 10) / 2)', 'prof = 2'],
		).draw(0);
		const stealth = Array.from(el.querySelectorAll('tbody tr')).find((tr) =>
			tr.textContent?.includes('Stealth'),
		) as HTMLElement;
		const doors = stealth.querySelectorAll(`.${STATE_DOOR_CLASS}`);
		expect(doors).toHaveLength(1);
		expect(doors[0]?.parentElement).toBe(stealth.lastElementChild);
		const { door, text } = doorOf(stealth);
		expect(door?.getAttribute('aria-label')).toBe('Modifiers on Stealth');
		// The first set ring's own level is the description.
		expect(door?.getAttribute('aria-description')).toBe('Set by a modifier; your own: Untrained');
		const said = text ?? '';
		// Two parts, each opening on its column's name, in column order.
		expect(said.startsWith('Training\nYour own: Untrained\n')).toBe(true);
		expect(said).toContain('\n\nAdvantage\n');
		expect(said.indexOf('Training\n')).toBeLessThan(said.indexOf('\n\nAdvantage\n'));
	});

	it('draws the door in the last value\'s cell on a table with character rows, never in the delete control\'s', () => {
		// Character rows draw a trailing delete cell on every row, the layout's
		// own rows included (empty there), so the row's end is not its last cell.
		const open: TableConfig = { ...starterSkills(), openRows: true };
		const body = ['| Skill | Training | Ability |', '|---|---|---|', '| Stealth |  | DEX |'].join('\n');
		const el = sheetOf(
			[
				{ config: open, component: table, body },
				{ config: ABILITIES, component: roster, body: '```sheet\nDEX: 14\n```' },
				gear(['skills.stealth >= 1 in Training']),
			],
			[],
			['mod(score) = floor((score - 10) / 2)', 'prof = 2'],
		).draw(0);
		const stealth = Array.from(el.querySelectorAll('tbody tr')).find((tr) =>
			tr.textContent?.includes('Stealth'),
		) as HTMLElement;
		const remove = stealth.lastElementChild as HTMLElement;
		expect(remove.classList.contains('sheetsmith-table-remove')).toBe(true);
		expect(remove.querySelector(`.${STATE_DOOR_CLASS}`)).toBeNull();
		const doors = stealth.querySelectorAll(`.${STATE_DOOR_CLASS}`);
		expect(doors).toHaveLength(1);
		const end = remove.previousElementSibling as HTMLElement;
		expect(end.classList.contains('sheetsmith-table-computed')).toBe(true);
		expect(doors[0]?.parentElement).toBe(end);
	});
});

describe('a Track flag a modifier set', () => {
	const flag: TrackConfig = {
		id: 'inspiration',
		type: 'track',
		label: 'Inspiration',
		position: { col: 1, row: 1, width: 1, height: 1 },
		count: 1,
	};

	it('draws the ring pressed while the note still says no, with the card\'s own door', () => {
		const changes: unknown[] = [];
		const { env, draw } = sheetOf(
			[{ config: flag, component: track, body: '```sheet\nvalue: no\n```' }, gear(['inspiration = true'])],
		);
		const el = draw(0, changes);
		const ring = el.querySelector<HTMLButtonElement>('.sheetsmith-track-flag');
		expect(ring?.getAttribute('aria-pressed')).toBe('true');
		expect(ring?.getAttribute('aria-description')).toBe('Set by a modifier; your own: off');
		expect(env.sheet('inspiration')).toBe(true);
		expect(env.sheet('inspiration.value')).toBe(false);
		expect(changes).toEqual([]);
		const { door, text } = doorOf(el, 'sheetsmith-track-modifier-button');
		expect(door?.getAttribute('aria-label')).toBe('Modifiers on Inspiration');
		expect(text).toBe('Your own: off\n\nCat Form — sets to on\n\nNow on');
	});

	it('draws a FitD checklist row a modifier set, with a door on that row', () => {
		const armour: TrackConfig = {
			id: 'armour',
			type: 'track',
			label: 'Armour',
			position: { col: 1, row: 1, width: 1, height: 1 },
			count: 1,
			rows: [
				{ key: 'normal', name: 'Normal' },
				{ key: 'heavy', name: 'Heavy' },
			],
		};
		const { env, draw } = sheetOf([
			{ config: armour, component: track, body: '```sheet\nnormal: no\nheavy: no\n```' },
			gear(['armour.heavy = true']),
		]);
		const el = draw(0);
		const rings = Array.from(el.querySelectorAll<HTMLButtonElement>('.sheetsmith-track-flag'));
		expect(rings.map((one) => one.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
		expect(env.sheet('armour.heavy')).toBe(true);
		expect(env.sheet('armour.heavy.value')).toBe(false);
		const doors = el.querySelectorAll('.sheetsmith-track-modifier-button');
		expect(doors).toHaveLength(1);
		expect(doors[0]?.getAttribute('aria-label')).toBe('Modifiers on Heavy');
	});
});

describe('a Table whose published column is itself a level (D3)', () => {
	const ranks: TableConfig = {
		id: 'skills',
		type: 'table',
		label: 'Skills',
		position: { col: 1, row: 1, width: 4, height: 4 },
		rows: [
			{ label: 'Stealth', key: 'stealth' },
			{ label: 'Arcana', key: 'arcana' },
		],
		columns: [
			{ key: 'Training', type: 'level', levels: ['Untrained', 'Proficient', 'Expertise'], publish: true, total: true },
		],
	};
	const body = ['| Name | Training |', '|---|---|', '| Stealth | 0 |', '| Arcana | 1 |'].join('\n');

	it('is set by its target alone', () => {
		const { env, draw } = sheetOf([
			{ config: ranks, component: table, body },
			gear(['skills.stealth = 2']),
		]);
		expect(env.sheet('skills.stealth')).toBe(2);
		expect(env.sheet('skills.stealth.value')).toBe(0);
		const el = draw(0);
		expect(el.querySelector('.sheetsmith-level-ring')?.getAttribute('aria-label')).toBe(
			'Stealth Training: Expertise',
		);
	});

	it('tells a column naming it that it needs none', () => {
		const { modifiers } = sheetOf([
			{ config: ranks, component: table, body },
			gear(['skills.stealth = 2 in Training']),
		]);
		const outcome = modifiers.outcomes('skills.stealth = 2 in Training', { label: 'Cat Form', values: {} }, '')[0];
		expect(outcome?.applies).toBe(false);
		expect(outcome?.suppressed).toBe(
			'Skills · stealth already is "Training", so this change needs no column. Clear it.',
		);
	});

	it('sums the modified levels in a total, and count() agrees (D10)', () => {
		const counted: TableConfig = {
			...ranks,
			columns: [
				{ key: 'Training', type: 'level', levels: ['Untrained', 'Proficient', 'Expertise'], total: true },
				{ key: 'Bonus', type: 'number', publish: true },
			],
		};
		const trained: CardConfig = {
			id: 'trained',
			type: 'card',
			label: 'Trained',
			position: { col: 1, row: 5, width: 1, height: 1 },
			derived: 'count(skills, Training > 0)',
		};
		const { env } = sheetOf([
			{
				config: counted,
				component: table,
				body: ['| Name | Training | Bonus |', '|---|---|---|', '| Stealth | 0 | |', '| Arcana | 1 | |'].join('\n'),
			},
			gear(['skills.stealth >= 1 in Training']),
			{ config: trained, component: card, body: '' },
		]);
		// Stealth is set to at least 1 and Arcana stores 1: two, where the note's
		// own sum is one.
		expect(env.sheet('skills.Training')).toBe(2);
		expect(env.sheet('skills.Training.value')).toBe(1);
		expect(env.sheet('trained')).toBe(2);
	});
});

describe('the keyboard cycle through the view\'s own rebuild', () => {
	/*
	 * The view's loop in small: every commit writes the note, closes every
	 * popover and draws the sheet again from what the note now holds, as
	 * `SheetView` does. The press is an arrow key, a keyboard reader's step.
	 * What each press leaves is read off the ring the rebuild drew, and the line
	 * the live region said off the ring that was pressed.
	 */
	it('names your own level in the door\'s account where the note and the ring differ, says so, and opens no popover', () => {
		let body = DRUID_BODY;
		let el: HTMLElement | null = null;
		const draw = () => {
			const built = sheetOf(
				[
					{ config: DRUID, component: roster, body },
					gear(['Cat Form']),
				],
				[CAT_FORM],
				FUNCTIONS,
			);
			const changes: unknown[] = [];
			el?.remove();
			el = built.draw(0, changes);
			return changes;
		};
		const press = (key: string) => {
			const changes = draw();
			const ring = el?.querySelector<HTMLButtonElement>('.sheetsmith-level-ring');
			ring?.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
			const said = el?.querySelector('[aria-live]')?.textContent ?? '';
			for (const change of changes) body = roster.write(change as never, body, DRUID);
			closePopover();
			draw();
			const drawn = el?.querySelector<HTMLButtonElement>('.sheetsmith-level-ring');
			return {
				label: drawn?.getAttribute('aria-label'),
				// The door's account's first line where it names the reader's own.
				own: ((first) => (first?.startsWith('Your own:') === true ? first : null))(
					doorOf(el as unknown as HTMLElement).text?.split('\n')[0],
				),
				said,
				popover: document.querySelector('.sheetsmith-popover'),
			};
		};
		// Untrained to Proficient: the ring drew Proficient already; the note now
		// agrees, so no mark, and the live region says what moved.
		expect(press('ArrowRight')).toEqual({ label: 'Stealth Training: Proficient', own: null, said: 'Your own is now Proficient', popover: null });
		// To Expertise: the ring moves, and there is nothing to say.
		expect(press('ArrowRight')).toEqual({ label: 'Stealth Training: Expertise', own: null, said: '', popover: null });
		// Down to Proficient, which the ring draws as it is told.
		expect(press('ArrowLeft')).toEqual({ label: 'Stealth Training: Proficient', own: null, said: '', popover: null });
		// On to Untrained, which the ring still draws as Proficient: the account
		// names the reader's own again, and the live region says so.
		expect(press('ArrowLeft')).toEqual({ label: 'Stealth Training: Proficient', own: 'Your own: Untrained', said: 'Your own is now Untrained', popover: null });
	});
});

describe('a refused level, on each component that reads one in a row', () => {
	const refusal =
		'Row "Cat Form": "3" is not a level of Training, so this row\'s own modifier has no amount. Give it a level from 0 (Untrained) to 2 (Expertise).';

	it('leaves a Table row\'s level out, so its Total is ? with the refusal, and the total names the row', () => {
		const skills = starterSkills();
		const totalled: TableConfig = {
			...skills,
			columns: (skills.columns ?? []).map((column) =>
				column.key === 'Training' ? { ...column, total: true } : column,
			),
		};
		const body = ['| Skill | Training | Ability |', '|---|---|---|', '| Stealth | 0 | DEX |'].join('\n');
		const { draw } = sheetOf(
			[
				{ config: totalled, component: table, body },
				{ config: ABILITIES, component: roster, body: '```sheet\nDEX: 14\n```' },
				gear(['skills.stealth = 3 in Training']),
			],
			[],
			['mod(score) = floor((score - 10) / 2)', 'prof = 2'],
		);
		const el = draw(0);
		const row = Array.from(el.querySelectorAll('tr')).find((tr) => tr.textContent?.includes('Stealth'));
		const total = row?.querySelector('.sheetsmith-table-computed .sheetsmith-table-value');
		expect(total?.textContent).toBe('?');
		expect(total?.getAttribute('title')).toBe(refusal);
		// The ring draws what the note stores, and its door opens on the sentence.
		expect(row?.querySelector('.sheetsmith-level-ring')?.getAttribute('aria-label')).toBe(
			'Stealth Training: Untrained',
		);
		expect(doorOf(row as HTMLElement).text).toBe(`${refusal}\n\nNow Untrained`);
		const foot = el.querySelector('tfoot .sheetsmith-table-value');
		expect(foot?.textContent).toBe('?');
		expect(foot?.getAttribute('title')).toContain('Stealth');
	});

	it('blames a cell on the refusal only where its formula reads the refused column, in either order', () => {
		const rows: TableConfig = {
			id: 'skills',
			type: 'table',
			label: 'Skills',
			position: { col: 1, row: 1, width: 6, height: 2 },
			rows: [{ label: 'Stealth', key: 'stealth' }],
			columns: [
				{ key: 'Training', type: 'level', levels: ['Untrained', 'Proficient', 'Expertise'] },
				// Fails for a reason of its own, beside a refusal it never reads.
				{ key: 'Other', type: 'computed', formula: 'missing_name + 1' },
				// Fails because of the refusal.
				{ key: 'Total', type: 'computed', formula: 'Training * 2', publish: true },
			],
		};
		const body = ['| Name | Training |', '|---|---|', '| Stealth | 0 |'].join('\n');
		const el = sheetOf([
			{ config: rows, component: table, body },
			gear(['skills.stealth = 3 in Training']),
		]).draw(0);
		const [other, total] = Array.from(
			el.querySelectorAll('.sheetsmith-table-computed .sheetsmith-table-value'),
		);
		expect(other?.textContent).toBe('?');
		expect(other?.getAttribute('title')).toContain('missing_name');
		expect(other?.getAttribute('title')).not.toContain('is not a level');
		expect(total?.textContent).toBe('?');
		expect(total?.getAttribute('title')).toBe(refusal);
	});

	it('leaves a Roster row\'s level out, so its Total is ? with the refusal', () => {
		const el = sheetOf(
			[
				{ config: DRUID, component: roster, body: DRUID_BODY },
				gear(['abilities.stealth = 3 in Training']),
			],
			[],
			FUNCTIONS,
		).draw(0);
		const total = Array.from(el.querySelectorAll('tr'))
			.find((tr) => tr.textContent?.includes('Stealth'))
			?.querySelector('.sheetsmith-table-computed .sheetsmith-table-value');
		expect(total?.textContent).toBe('?');
		expect(total?.getAttribute('title')).toBe(refusal);
	});
});


describe('the reader\'s own line in a state account', () => {
	const shape = (words: string[], positions: number, flag = false) =>
		({ flag, positions, words, label: 'Rank' }) as StateShape;
	const account = (over: Partial<StateAccount>): StateAccount => ({
		shape: shape(['Untrained', 'Trained', 'Expert', 'Master', 'Legendary'], 5),
		stored: 0,
		drawn: 0,
		lines: [],
		error: null,
		...over,
	});

	it('names a named level by its name, an unnamed one by its position, and leaves the last line the drawn state', () => {
		expect(stateAccountText(account({ stored: 2, drawn: 4 }))).toBe('Your own: Expert\n\n\nNow Legendary');
		expect(stateAccountText(account({ shape: shape([], 5), stored: 1, drawn: 4 }))).toBe(
			'Your own: 1\n\n\nNow 4',
		);
	});

	it('says nothing of the reader\'s own where it agrees with the drawn state', () => {
		expect(stateAccountText(account({ stored: 3, drawn: 3 }))).toBe('\nNow Master');
	});

	it('opens a refused state on its sentence, with no own line: a refusal draws what the note stores', () => {
		expect(stateAccountText(account({ stored: 1, drawn: 1, error: 'Refused.' }))).toBe('Refused.\n\nNow Trained');
	});
});

describe('one door per Roster row, at the row\'s end', () => {
	const row = (el: HTMLElement, name: string) =>
		Array.from(el.querySelectorAll('tr')).find((tr) => tr.textContent?.includes(name)) as HTMLElement;
	const PERCEPTION_DRUID: RosterConfig = {
		...DRUID,
		rows: [...(DRUID.rows ?? []), { label: 'Perception', stat: 'WIS', key: 'perception' }],
	};
	const body = DRUID_BODY + '\n| Perception | 1 |';

	it('draws one door after the Total, naming the row, whose account is the ring\'s lines and then the Total\'s', () => {
		const el = sheetOf(
			[
				{ config: DRUID, component: roster, body: DRUID_BODY },
				gear(['Cat Form', 'abilities.stealth += 2', 'abilities.stealth += note: Quiet paws']),
			],
			[CAT_FORM],
			FUNCTIONS,
		).draw(0);
		const stealth = row(el, 'Stealth');
		const doors = stealth.querySelectorAll(`.${STATE_DOOR_CLASS}`);
		expect(doors).toHaveLength(1);
		// At the row's end, after the Total's number, and nowhere beside the ring.
		const end = stealth.lastElementChild as HTMLElement;
		expect(end.classList.contains('sheetsmith-table-computed')).toBe(true);
		expect(doors[0]?.parentElement).toBe(end);
		expect(stealth.querySelector('.sheetsmith-table-level .sheetsmith-state-door')).toBeNull();
		// The Total's note is in the one door, not a mark of its own.
		expect(stealth.querySelector('.sheetsmith-note-mark')).toBeNull();
		const { door, text } = doorOf(stealth);
		expect(door?.getAttribute('aria-label')).toBe('Modifiers on Stealth');
		expect(door?.getAttribute('aria-description')).toBe('Set by a modifier; your own: Untrained');
		const said = text ?? '';
		// Two parts, so each opens on its column's name: Training's, then Total's.
		expect(said.startsWith('Training\nYour own: Untrained\n\nGear · Cat Form — at least Proficient\n\nNow Proficient\n\nTotal\n')).toBe(true);
		// Then the Total's own account: its arithmetic line and its note.
		const total = said.slice(said.indexOf('\n\nTotal\n'));
		expect(total).toContain('+2');
		expect(total).toContain('Quiet paws');
		// The number keeps its underline and its own press.
		expect(end.querySelector('.sheetsmith-table-value')?.classList.contains('sheetsmith-table-askable')).toBe(true);
	});

	it('heads no part on a door with only one, and spells one source one way on every line of the account', () => {
		const el = sheetOf(
			[
				{ config: DRUID, component: roster, body: DRUID_BODY },
				gear(['Cat Form; abilities.stealth += 2']),
			],
			[CAT_FORM],
			FUNCTIONS,
		).draw(0);
		const said = doorOf(row(el, 'Stealth')).text ?? '';
		// One gear row named Cat Form gives both the ring's line and the Total's.
		const lines = said.split('\n').filter((line) => line.includes(' — '));
		expect(lines).toHaveLength(2);
		for (const line of lines) expect(line.startsWith('Gear · Cat Form — ')).toBe(true);
		// And with no Total push, the one part carries no heading.
		const alone = sheetOf(
			[
				{ config: DRUID, component: roster, body: DRUID_BODY },
				gear(['Cat Form']),
			],
			[CAT_FORM],
			FUNCTIONS,
		).draw(0);
		expect(doorOf(row(alone, 'Stealth')).text).toBe(
			'Your own: Untrained\n\nGear · Cat Form — at least Proficient\n\nNow Proficient',
		);
	});

	it('keeps the door\'s slot in every other row\'s last cell, so the Totals line up with and without a door', () => {
		const el = sheetOf(
			[
				{ config: PERCEPTION_DRUID, component: roster, body },
				gear(['Cat Form']),
			],
			[CAT_FORM],
			FUNCTIONS,
		).draw(0);
		const stealth = row(el, 'Stealth');
		const perception = row(el, 'Perception');
		expect(stealth.lastElementChild?.classList.contains('sheetsmith-table-has-note')).toBe(true);
		// Perception's Total holds no door and reserves the door's slot instead,
		// as a cell beside a note mark does.
		expect(perception.querySelector(`.${STATE_DOOR_CLASS}`)).toBeNull();
		expect(perception.lastElementChild?.classList.contains('sheetsmith-note-column')).toBe(true);
		// The ring column holds no door anywhere, so it reserves nothing.
		for (const ring of Array.from(el.querySelectorAll('.sheetsmith-table-level'))) {
			expect(ring.classList.contains('sheetsmith-note-column')).toBe(false);
		}
	});

	it('draws a computed cell\'s note mark where it was on a row with no ring a modifier set', () => {
		const el = sheetOf(
			[
				{ config: DRUID, component: roster, body: DRUID_BODY },
				gear(['abilities.stealth += note: Quiet paws']),
			],
			[],
			FUNCTIONS,
		).draw(0);
		const stealth = row(el, 'Stealth');
		expect(stealth.querySelector(`.${STATE_DOOR_CLASS}`)).toBeNull();
		expect(stealth.lastElementChild?.querySelector('.sheetsmith-note-mark')).not.toBeNull();
	});
});

describe('a Roster card strip the layout can set a level in', () => {
	/*
	 * The strip's card floor is the one width input this feature adds, so the
	 * card keeps its width as a form comes and goes exactly when the stamp the
	 * floor keys on does (`styles.test.ts` holds the rule to it).
	 */
	const cards: RosterConfig = { ...DRUID, cardLayout: true };
	const strip = (parts: string[], modifiers: unknown[]) =>
		sheetOf(
			[
				{ config: cards, component: roster, body: DRUID_BODY },
				gear(parts),
			],
			modifiers,
			FUNCTIONS,
		)
			.draw(0)
			.querySelector('.sheetsmith-roster-cards');

	it('is stamped from the layout\'s definitions, the same with the form in play or not', () => {
		const on = strip(['Cat Form'], [CAT_FORM]);
		const off = strip([''], [CAT_FORM]);
		// The door comes and goes with the form; the stamp does not.
		expect(on?.querySelector(`.${STATE_DOOR_CLASS}`)).not.toBeNull();
		expect(off?.querySelector(`.${STATE_DOOR_CLASS}`)).toBeNull();
		expect(on?.classList.contains(STATE_STRIP_CLASS)).toBe(true);
		expect(off?.classList.contains(STATE_STRIP_CLASS)).toBe(true);
		expect(on?.className).toBe(off?.className);
	});

	it('is not stamped where no layout change reaches a level in it, typed changes included', () => {
		expect(strip([''], [])?.classList.contains(STATE_STRIP_CLASS)).toBe(false);
		// A change typed in a note is the reader's, and comes and goes with an edit.
		expect(strip(['abilities.stealth >= 1 in Training'], [])?.classList.contains(STATE_STRIP_CLASS)).toBe(false);
	});
});
