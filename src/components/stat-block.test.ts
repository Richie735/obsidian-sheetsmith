// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { statBlock, StatBlockConfig, StatBlockData } from './stat-block';
import { ModifierPush, RenderContext } from '../types';
import { closeAnchoredPanel } from '../ui/anchored-panel';
import { parseModifierPart } from '../parse/modifier-cell';
import { outcomeView } from '../test/modifier-views';
import { GESTURE_COMMIT } from '../interaction/commit-window';

/*
 * Stat block (`docs/features/character-forms.md`): one form at a time over a
 * toggle field, a uses counter in the section's preamble, an action list at the
 * head of each record's prose, and every route into a fence refusing a link.
 */

const config: StatBlockConfig = {
	id: 'forms',
	type: 'stat-block',
	label: 'Wild Shape',
	position: { col: 1, row: 1, width: 6, height: 6 },
	recordName: 'Form',
	fields: [
		{ key: 'Active', type: 'toggle' },
		{ key: 'HP', type: 'number', maxSource: 'record' },
		{ key: 'Speed', type: 'text' },
		{ key: 'Modifiers', type: 'modifier' },
	],
	exclusive: 'Active',
	uses: '2',
	spendOnPick: true,
	zones: [
		{ key: 'vitals' },
		{ key: 'changes' },
		{
			key: 'attacks',
			type: 'table',
			heading: 'Attacks',
			columns: [{ key: 'Attack' }, { key: 'Bonus', type: 'number' }, { key: 'Damage' }],
		},
		{ key: 'traits', type: 'text', heading: 'Traits', collapsed: true },
	],
};

const BODY = [
	'',
	'```sheet',
	'uses: 1',
	'```',
	'',
	'### Brown Bear',
	'```sheet',
	'Active: yes',
	'HP: 22 / 34',
	'Speed: 40 ft., climb 30 ft.',
	'Modifiers: abilities.STR = 4; armour_class = 11; skills.perception >= 3',
	'```',
	'',
	'| Attack | Bonus | Damage |',
	'|---|---|---|',
	'| Bite | 6 | 1d8+4 piercing |',
	'| Claws | 6 | 2d6+4 slashing |',
	'',
	'Keen Smell. The bear has advantage on Wisdom (Perception) checks that rely on smell.',
	'',
	'### Wolf',
	'```sheet',
	'Active: no',
	'HP: 11 / 11',
	'Speed: 40 ft.',
	'Modifiers: abilities.DEX = 2; skills.stealth >= 4',
	'```',
	'',
].join('\n');

const context: RenderContext<StatBlockData> = {
	resolved: {},
	// The uses ceiling is the only formula field the panel reads here.
	resolveField: (field) => (field === 'uses' ? 2 : null),
	onChange: () => undefined,
};

function read(body: string, from: StatBlockConfig = config): StatBlockData {
	const result = statBlock.read(body, from);
	if (!result.ok || result.data === null) throw new Error('expected data');
	return result.data;
}

/** Render, and collect every edit the panel reports. */
function render(
	body: string = BODY,
	overrides: Partial<StatBlockConfig> = {},
	ctx: Partial<RenderContext<StatBlockData>> = {},
) {
	const merged = { ...config, ...overrides };
	const el = document.createElement('div');
	document.body.appendChild(el);
	const edits: StatBlockData[] = [];
	statBlock.render(el, merged, read(body, merged), {
		...context,
		onChange: (data) => edits.push(data),
		...ctx,
	});
	return { el, edits, merged };
}

/** Apply one reported edit to the body, as the view would. */
function applied(edit: StatBlockData, body: string = BODY, from: StatBlockConfig = config): string {
	return statBlock.write(edit, body, from);
}

const picker = (el: HTMLElement) =>
	el.querySelector<HTMLSelectElement>('.sheetsmith-stat-block-select') as HTMLSelectElement;

/** Switch to **Every form**, the face a form is edited on. */
function toLibrary(el: HTMLElement): void {
	el.querySelector<HTMLButtonElement>('.sheetsmith-stat-block-switch')?.click();
}

function choose(select: HTMLSelectElement, value: string): void {
	select.value = value;
	select.dispatchEvent(new Event('change'));
}

afterEach(() => {
	closeAnchoredPanel();
	document.body.replaceChildren();
});

describe('reading and writing', () => {
	it('round-trips the note byte for byte when nothing changed', () => {
		expect(statBlock.write({ records: {} }, BODY, config)).toBe(BODY);
		const data = read(BODY);
		expect(statBlock.write({ records: {} }, BODY, config)).toBe(BODY);
		expect(data.uses).toBe('1');
	});

	it('reads the action list off the head of the prose, and the prose after it', () => {
		const data = read(BODY);
		expect(data.records[0]?.zones?.attacks).toEqual({
			type: 'table',
			rows: [
				['Bite', '6', '1d8+4 piercing'],
				['Claws', '6', '2d6+4 slashing'],
			],
			after: '',
			notTable: null,
		});
		expect(data.records[0]?.zones?.traits).toEqual({
			type: 'text',
			text: 'Keen Smell. The bear has advantage on Wisdom (Perception) checks that rely on smell.',
			fromLead: true,
		});
	});

	it('reads a table further down the prose as prose', () => {
		const body = BODY.replace(
			'\n| Attack | Bonus | Damage |',
			'\nA line before.\n\n| Attack | Bonus | Damage |',
		);
		const data = read(body);
		expect(data.records[0]?.zones?.attacks).toBeUndefined();
		const traits = data.records[0]?.zones?.traits;
		expect(traits?.type === 'text' ? traits.text : '').toContain('| Bite | 6 |');
	});

	it('inserts the first uses count at the head of the preamble', () => {
		const body = BODY.replace('\n```sheet\nuses: 1\n```\n', '');
		const written = applied({ records: {}, uses: '2' }, body);
		expect(written.startsWith('\n```sheet\nuses: 2\n```\n\n### Brown Bear')).toBe(true);
	});
});

describe('one form at a time', () => {
	it('switches in one edit: the chosen on, the previous off, a use spent', () => {
		const { el, edits } = render();
		choose(picker(el), '1');
		expect(edits).toHaveLength(1);
		const written = applied(edits[0] as StatBlockData);
		expect(written).toBe(
			BODY.replace('uses: 1', 'uses: 0')
				.replace('Active: yes', 'Active: no')
				.replace('Active: no\nHP: 11', 'Active: yes\nHP: 11'),
		);
	});

	it('switches and spends nothing at no uses left', () => {
		const body = BODY.replace('uses: 1', 'uses: 0');
		const { el, edits } = render(body);
		choose(picker(el), '1');
		expect(edits).toHaveLength(1);
		expect(edits[0]?.uses).toBeUndefined();
		expect(el.textContent).toContain('Wolf active, no uses left');
	});

	it('turns every form off on None, and on Revert, in one edit each', () => {
		const none = render();
		choose(picker(none.el), '');
		const revert = render();
		revert.el.querySelector<HTMLButtonElement>('.sheetsmith-stat-block-revert')?.click();
		for (const { edits } of [none, revert]) {
			expect(edits).toHaveLength(1);
			expect(applied(edits[0] as StatBlockData)).toBe(BODY.replace('Active: yes', 'Active: no'));
		}
	});

	it('draws no Revert while no form is active', () => {
		const { el } = render(BODY.replace('Active: yes', 'Active: no'));
		expect(el.querySelector('.sheetsmith-stat-block-revert')).toBeNull();
		expect(el.textContent).toContain('No form is active. Choosing one spends a use.');
	});

	it('reports two forms on, draws both, and writes nothing on render', () => {
		const body = BODY.replace('Active: no', 'Active: yes');
		const { el, edits } = render(body);
		expect(edits).toHaveLength(0);
		const select = picker(el);
		expect(select.selectedOptions[0]?.textContent).toBe('Brown Bear and Wolf');
		expect(el.textContent).toContain(
			'Brown Bear and Wolf are both active, so both apply. Choose one to keep.',
		);
		expect(el.querySelectorAll('.sheetsmith-stat-block-form')).toHaveLength(2);
		// Choosing writes one on and every other off.
		choose(select, '0');
		expect(applied(edits[0] as StatBlockData, body)).toContain('### Wolf\n```sheet\nActive: no');
	});
});

describe('what the records push and publish', () => {
	const pushes = (body: string, from: StatBlockConfig = config): readonly ModifierPush[] =>
		statBlock.scopeModifiers?.(read(body, from), from)?.(() => null) ?? [];

	it('pushes only the forms that are on, each in play', () => {
		const pushed = pushes(BODY);
		expect(pushed.map((push) => push.part)).toEqual([
			'abilities.STR = 4',
			'armour_class = 11',
			'skills.perception >= 3',
		]);
		expect(pushed.every((push) => push.inPlay === true)).toBe(true);
		expect(pushed.every((push) => push.row.label === 'Brown Bear')).toBe(true);
	});

	it('pushes both forms where two are on', () => {
		const labels = new Set(pushes(BODY.replace('Active: no', 'Active: yes')).map((push) => push.row.label));
		expect([...labels]).toEqual(['Brown Bear', 'Wolf']);
	});

	it('pushes every record, none in play, with no exclusive set', () => {
		const companion = { ...config, exclusive: '' };
		const pushed = pushes(BODY, companion);
		expect(new Set(pushed.map((push) => push.row.label))).toEqual(new Set(['Brown Bear', 'Wolf']));
		expect(pushed.some((push) => push.inPlay === true)).toBe(false);
	});

	it('publishes active only with exclusive set, and uses only with uses set', () => {
		const named = statBlock.scopeValues?.(read(BODY), config).named ?? {};
		expect(named.active?.value).toBe(true);
		expect(named.uses?.compute?.(() => 2)).toBe(1);
		const bare = statBlock.scopeValues?.(read(BODY, { ...config, exclusive: '', uses: '' }), {
			...config,
			exclusive: '',
			uses: '',
		});
		expect(bare).toEqual({});
	});
});

describe('a record whose fence will not read', () => {
	const broken = BODY.replace('Active: no\nHP: 11 / 11', 'Active no\nHP: 11 / 11');

	it('is absent from the picker and listed in Every form with its problem', () => {
		const { el } = render(broken);
		const offered = Array.from(picker(el).options).map((option) => option.textContent);
		expect(offered).toEqual(['None', 'Brown Bear']);
		el.querySelector<HTMLButtonElement>('.sheetsmith-stat-block-switch')?.click();
		const rows = el.querySelectorAll('.sheetsmith-stat-block-record');
		expect(rows).toHaveLength(2);
		expect(rows[1]?.querySelector('.sheetsmith-error')?.textContent).toContain('Every other form');
	});

	it('keeps its bytes through a neighbour switching off', () => {
		const { el, edits } = render(broken);
		choose(picker(el), '');
		expect(applied(edits[0] as StatBlockData, broken)).toBe(broken.replace('Active: yes', 'Active: no'));
	});
});

describe('a form at 0', () => {
	it('draws the number alone, with no error colour or sentence, and stays active', () => {
		const body = BODY.replace('HP: 22 / 34', 'HP: 0 / 34');
		const { el, edits } = render(body);
		// The capped vital is on screen at 0, so the absences below are not vacuous.
		const number = el.querySelector('.sheetsmith-stat-block-number');
		expect(number?.querySelector<HTMLInputElement>('.sheetsmith-record-input:not(.sheetsmith-pool-max)')?.value).toBe('0');
		expect(number?.querySelector<HTMLInputElement>('input.sheetsmith-pool-max')?.value).toBe('34');
		expect(el.querySelector('.sheetsmith-stat-block-down')).toBeNull();
		expect(el.querySelector('.sheetsmith-stat-block-down-note')).toBeNull();
		expect(edits).toHaveLength(0);
		expect(read(body).records[0]?.fields?.Active).toBe('yes');
	});

	// A capped field where 0 is the normal state: a Fate NPC's Stress, unhurt.
	it('leaves a Fate NPC\'s Stress of 0 / 1 reading as unhurt', () => {
		const body = ['', '### Thug', '```sheet', 'Active: yes', 'Stress: 0 / 1', '```', ''].join('\n');
		const { el } = render(body, {
			fields: [
				{ key: 'Active', type: 'toggle' },
				{ key: 'Stress', type: 'number', maxSource: 'record' },
			],
			uses: '',
			spendOnPick: false,
			zones: [{ key: 'vitals' }],
		});
		// Stress is drawn as a capped number, 0 over a ceiling of 1, so it took the capped branch.
		const number = el.querySelector('.sheetsmith-stat-block-number');
		expect(number?.querySelector<HTMLInputElement>('.sheetsmith-record-input:not(.sheetsmith-pool-max)')?.value).toBe('0');
		expect(number?.querySelector<HTMLInputElement>('input.sheetsmith-pool-max')?.value).toBe('1');
		expect(el.querySelector('.sheetsmith-stat-block-down')).toBeNull();
		expect(el.querySelector('.sheetsmith-stat-block-down-note')).toBeNull();
	});

	it('leaves a form\'s HP byte-identical across a switch away and back', () => {
		const away = render();
		choose(picker(away.el), '1');
		const switched = applied(away.edits[0] as StatBlockData);
		const back = render(switched);
		choose(picker(back.el), '0');
		const returned = applied(back.edits[0] as StatBlockData, switched);
		expect(returned).toContain('HP: 22 / 34');
		expect(returned).toContain('HP: 11 / 11');
	});
});

describe('the action list', () => {
	it('commits a cell through the table, leaving the prose byte-identical', () => {
		const written = applied({
			records: {},
			zoneEdits: { 0: { zone: 'attacks', table: { rows: { 1: { Bonus: '7' } } } } },
		});
		expect(written).toBe(BODY.replace('| Claws | 6 |', '| Claws | 7 |'));
	});

	it('gives a body with no table a headed block on its first row', () => {
		const written = applied({
			records: {},
			zoneEdits: { 1: { zone: 'attacks', table: { added: [{ Attack: 'Bite', Bonus: '4', Damage: '2d4+2 piercing' }] } } },
		});
		expect(written).toContain(
			'Modifiers: abilities.DEX = 2; skills.stealth >= 4\n```\n\n#### Attacks\n\n| Attack | Bonus | Damage |\n|---|---|---|\n| Bite | 4 | 2d4+2 piercing |\n',
		);
	});

	it('writes a 0.9.0 lead\'s table in place and adds no heading', () => {
		const written = applied({
			records: {},
			zoneEdits: { 0: { zone: 'attacks', table: { added: [{ Attack: 'Swipe' }] } } },
		});
		expect(written).toContain('| Claws | 6 | 2d6+4 slashing |\n| Swipe |  |  |\n');
		expect(written).not.toContain('####');
	});

	it('commits a wrapping cell once on Enter, never as a line break', () => {
		const { el, edits } = render();
		toLibrary(el);
		const damage = el.querySelectorAll<HTMLTextAreaElement>('.sheetsmith-stat-block-table textarea')[2] as HTMLTextAreaElement;
		damage.focus();
		damage.value = '1d8+5 piercing';
		damage.dispatchEvent(new Event('input'));
		const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
		damage.dispatchEvent(enter);
		expect(enter.defaultPrevented).toBe(true);
		damage.blur();
		expect(edits).toHaveLength(1);
		expect(applied(edits[0] as StatBlockData)).toBe(BODY.replace('1d8+4 piercing', '1d8+5 piercing'));
	});

	it('draws a row per action under Every form, each cell a field', () => {
		const { el } = render();
		toLibrary(el);
		const rows = el.querySelectorAll('.sheetsmith-stat-block-table tbody tr');
		expect(rows).toHaveLength(2);
		// The name and one per column, all one wrapping one-line control.
		expect(rows[0]?.querySelectorAll('input')).toHaveLength(0);
		expect(rows[0]?.querySelectorAll('textarea')).toHaveLength(3);
		// A number reads signed in its field, as in its row.
		expect(rows[0]?.querySelectorAll('textarea')[1]?.value).toBe('+6');
	});

	it('hides a column heading that repeats its zone heading, for sight only', () => {
		const heads = (root: HTMLElement): HTMLElement[] =>
			Array.from(root.querySelectorAll<HTMLElement>('.sheetsmith-stat-block-table thead th'));
		const zoned = (heading: string): Partial<StatBlockConfig> => ({
			zones: [
				{
					key: 'attacks',
					type: 'table',
					heading,
					columns: [{ key: 'Attack' }, { key: 'Bonus', type: 'number' }, { key: 'Damage' }],
				},
			],
		});
		// *Attack* under **Attack:**, by the tolerant match: spoken only.
		const { el } = render(BODY, zoned('Attack:'));
		toLibrary(el);
		const [name, bonus] = heads(el);
		expect(name?.querySelector('.sheetsmith-sr-only')?.textContent).toBe('Attack');
		expect(bonus?.querySelector('.sheetsmith-sr-only')).toBeNull();
		// **Attacks** over *Attack* do not match, and the column shows.
		document.body.replaceChildren();
		const shown = render();
		toLibrary(shown.el);
		expect(heads(shown.el)[0]?.querySelector('.sheetsmith-sr-only')).toBeNull();
		expect(heads(shown.el)[0]?.textContent).toBe('Attack');
	});

	it('reads in play as the same table with text cells: the name bold, the bonus signed', () => {
		const { el } = render(BODY.replace('| Bite | 6 |', '| [[Bite (Brown Bear)]] | 6 |'));
		const table = el.querySelector('.sheetsmith-stat-block-table');
		// The sheet's own Table, in its framed box, with a header row.
		expect(table?.classList.contains('sheetsmith-table')).toBe(true);
		expect(table?.parentElement?.classList.contains('sheetsmith-table-box')).toBe(true);
		expect(Array.from(table?.querySelectorAll('thead th') ?? []).map((th) => th.textContent)).toEqual([
			'Attack',
			'Bonus',
			'Damage',
			'',
		]);
		const rows = Array.from(el.querySelectorAll('.sheetsmith-stat-block-table tbody tr'));
		expect(rows).toHaveLength(2);
		expect(rows.every((row) => row.querySelector('input, textarea') === null)).toBe(true);
		expect(Array.from(rows[1]?.children ?? []).map((cell) => cell.textContent)).toEqual([
			'Claws',
			'+6',
			'2d6+4 slashing',
			'',
		]);
		expect(rows[1]?.querySelector('th[scope="row"] strong')?.textContent).toBe('Claws');
		// A link in a cell is still a link.
		expect(rows[0]?.querySelector('strong a')?.textContent).toBe('Bite (Brown Bear)');
		// One column structure on both faces: the same columns.
		const play = Array.from(table?.querySelectorAll('col') ?? []).map((col) => col.className);
		toLibrary(el);
		const edit = Array.from(el.querySelector('.sheetsmith-stat-block-detail .sheetsmith-stat-block-table')?.querySelectorAll('col') ?? []).map(
			(col) => col.className,
		);
		// The delete column too, empty in play, so the widths resolve alike.
		expect(edit).toEqual(play);
		expect(play[play.length - 1]).toBe('sheetsmith-stat-block-col-remove');
	});

	it('leaves the placeholder row Add writes out of In play, and keeps it under Every form', () => {
		const body = BODY.replace(
			'| Claws |',
			'| Attack | | |\n| Multiattack | | |\n| Claws |',
		);
		const { el } = render(body);
		const names = (root: Element): (string | null)[] =>
			Array.from(root.querySelectorAll('.sheetsmith-stat-block-table tbody tr')).map(
				(row) => row.firstElementChild?.textContent ?? null,
			);
		// The scaffold is gone; a named action with no numbers is still an action.
		expect(names(el)).toEqual(['Bite', 'Multiattack', 'Claws']);
		toLibrary(el);
		const detail = el.querySelector('.sheetsmith-stat-block-detail') as HTMLElement;
		expect(detail.querySelectorAll('.sheetsmith-stat-block-table tbody tr')).toHaveLength(4);
	});

	it('draws nothing in play when every row is a placeholder: no heading, no box', () => {
		const body = BODY.replace(/\| Bite[^\n]*\n\| Claws[^\n]*/, '| Attack | | |');
		const { el } = render(body);
		expect(el.querySelector('.sheetsmith-stat-block-table')).toBeNull();
		expect(el.querySelector('.sheetsmith-stat-block-zone-table')).toBeNull();
		expect(el.textContent).not.toContain('None yet');
	});

});

describe('a link typed into the fence', () => {
	const typeInto = (input: HTMLInputElement, text: string) => {
		input.focus();
		input.value = text;
		input.dispatchEvent(new Event('input'));
		input.blur();
	};

	it('is refused in a text field, a number field and a modifier part', () => {
		const { el, edits } = render();
		toLibrary(el);
		const speed = el.querySelector<HTMLInputElement>('.sheetsmith-stat-block-text') as HTMLInputElement;
		typeInto(speed, '[[Fly]]');
		const hp = el.querySelector<HTMLInputElement>(
			'.sheetsmith-stat-block-number > .sheetsmith-record-input',
		) as HTMLInputElement;
		typeInto(hp, '[[Ten]]');
		expect(edits).toHaveLength(0);
		expect(el.textContent).toContain('Obsidian indexes no link inside one');
	});

	it('is written in an action cell, which is plain markdown', () => {
		const { el, edits } = render();
		toLibrary(el);
		const name = el.querySelector<HTMLTextAreaElement>(
			'.sheetsmith-stat-block-action-name textarea',
		) as unknown as HTMLInputElement;
		typeInto(name, '[[Bite (Brown Bear)]]');
		expect(edits).toHaveLength(1);
		expect(applied(edits[0] as StatBlockData)).toContain('| [[Bite (Brown Bear)]] | 6 |');
	});
});

describe('the configuration it refuses', () => {
	const refused = (overrides: Partial<StatBlockConfig>) => {
		const result = statBlock.read(BODY, { ...config, ...overrides });
		return result.ok ? null : result.error;
	};

	it('refuses exclusive naming a key no field declares', () => {
		expect(refused({ exclusive: 'Chosen' })).toContain('which no field declares');
	});

	it('refuses exclusive naming a field that is not a toggle', () => {
		expect(refused({ exclusive: 'HP' })).toContain('Name a toggle field');
	});

	it('refuses exclusive naming a text field', () => {
		expect(refused({ exclusive: 'Speed' })).toContain('a text field');
	});

	it('refuses a field keyed uses', () => {
		expect(
			refused({ fields: [...(config.fields ?? []), { key: 'Uses', type: 'number' }] }),
		).toContain('uses counter');
	});

});

describe('the library', () => {
	it('switches to Every form and lists every record with the active one marked', () => {
		const { el } = render();
		el.querySelector<HTMLButtonElement>('.sheetsmith-stat-block-switch')?.click();
		const rows = el.querySelectorAll('.sheetsmith-stat-block-record');
		expect(rows).toHaveLength(2);
		expect(rows[0]?.querySelector('.sheetsmith-stat-block-tag')?.textContent).toBe('Active');
		expect(el.querySelector('.sheetsmith-stat-block-select')).toBeNull();
	});

	it('adds a form named for the record name', () => {
		const { el, edits } = render();
		el.querySelector<HTMLButtonElement>('.sheetsmith-stat-block-switch')?.click();
		el.querySelector<HTMLButtonElement>('.sheetsmith-stat-block-add')?.click();
		expect(edits[0]?.added).toEqual([{ name: 'Form' }]);
		expect(applied(edits[0] as StatBlockData).endsWith('### Form\n')).toBe(true);
	});
});

describe('a rest', () => {
	it('empties the active toggle and fills each HP to its own ceiling', () => {
		const resolve = { resolve: () => null, explain: () => null };
		const data = read(BODY.replace('HP: 11 / 11', 'HP: 3 / 11'));
		const off = statBlock.applyReset?.(data, config, { trigger: 'Long rest', column: 'Active', action: 'empty' }, resolve);
		const full = statBlock.applyReset?.(data, config, { trigger: 'Long rest', column: 'HP', action: 'full' }, resolve);
		if (!off?.ok || !full?.ok) throw new Error('expected both to apply');
		expect(off.data.records[0]?.fields?.Active).toBe('no');
		expect(full.data.records[0]?.fields?.HP).toBe('34 / 34');
		expect(full.data.records[1]?.fields?.HP).toBe('11 / 11');
	});

	it('refuses a binding that names no part', () => {
		const result = statBlock.applyReset?.(read(BODY), config, { trigger: 'Long rest', action: 'full' }, {
			resolve: () => null,
			explain: () => null,
		});
		expect(result?.ok).toBe(false);
	});
});

/** A sheet whose published names take modifiers, which is all the form needs. */
function modifierContext(): NonNullable<RenderContext<StatBlockData>['modifiers']> {
	const target = { name: 'armour_class', label: 'Armour class' };
	return {
		definitions: [],
		targets: [target],
		published: [target],
		bonusTypes: [],
		outcomes: (part: string) => {
			const parsed = parseModifierPart(part);
			if (parsed.kind !== 'typed') return [];
			return [
				outcomeView({
					typed: parsed.effect,
					target: parsed.effect.target,
					targetLabel: parsed.effect.target,
					applies: true,
					amount: Number.isFinite(Number(parsed.effect.amount)) ? Number(parsed.effect.amount) : 1,
				}),
			];
		},
		breakdown: () => ({ lines: [], override: null, total: 0 }),
		promote: () => Promise.resolve({ ok: true as const }),
	};
}

describe('a link typed into a modifier part, and into the prose', () => {
	it('declines the part and writes the prose', () => {
		const { el, edits } = render(BODY, {}, { modifiers: modifierContext() });
		const glyph = el.querySelector<HTMLButtonElement>('.sheetsmith-record-modifier') as HTMLButtonElement;
		glyph.click();
		const panel = document.querySelector('.sheetsmith-panel') as HTMLElement;
		panel.querySelector<HTMLButtonElement>('.sheetsmith-panel-line')?.click();
		const amount = Array.from(panel.querySelectorAll('.sheetsmith-panel-field'))
			.find((row) => row.querySelector('.sheetsmith-panel-field-label')?.textContent === 'Amount')
			?.querySelector<HTMLInputElement>('input') as HTMLInputElement;
		amount.value = '[[Four]]';
		amount.dispatchEvent(new Event('input'));
		amount.dispatchEvent(new Event('blur'));
		expect(edits).toHaveLength(0);
		expect(el.textContent).toContain('Obsidian indexes no link inside one');

		const body = el.querySelector<HTMLTextAreaElement>('.sheetsmith-record-body-input') as HTMLTextAreaElement;
		body.focus();
		body.value = 'Keen Smell, as [[Brown Bear]] has.';
		body.dispatchEvent(new Event('input'));
		body.blur();
		expect(edits).toHaveLength(1);
		const written = applied(edits[0] as StatBlockData);
		expect(written).toContain('| Claws | 6 | 2d6+4 slashing |\n\nKeen Smell, as [[Brown Bear]] has.');
	});
});

describe('a use spent only where the press turns a form on', () => {
	it('spends nothing when two are on and the reader keeps one of them', () => {
		const body = BODY.replace('Active: no', 'Active: yes');
		const { el, edits } = render(body);
		choose(picker(el), '0');
		expect(edits).toHaveLength(1);
		expect(edits[0]?.uses).toBeUndefined();
	});
});

describe('the uses counter', () => {
	it('sets the count from a ring press, and clears the ring it stands on', () => {
		const { el, edits } = render();
		const rings = el.querySelectorAll<HTMLElement>('.sheetsmith-stat-block-use');
		expect(rings).toHaveLength(2);
		rings[1]?.click();
		rings[1]?.click();
		expect(edits.map((edit) => edit.uses)).toEqual(['2', '1']);
	});

	it('never clamps a count stored above its ceiling, and an up step does nothing', () => {
		const { el, edits } = render(BODY.replace('uses: 1', 'uses: 3'));
		const run = el.querySelector<HTMLElement>('.sheetsmith-stat-block-uses-run') as HTMLElement;
		run.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
		expect(edits).toHaveLength(0);
		run.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
		expect(edits.map((edit) => edit.uses)).toEqual(['2']);
	});

	it('steps on the arrows from what is on screen, held to the ceiling', () => {
		const { el, edits } = render();
		const run = el.querySelector<HTMLElement>('.sheetsmith-stat-block-uses-run') as HTMLElement;
		const key = (name: string) => run.dispatchEvent(new KeyboardEvent('keydown', { key: name }));
		key('ArrowRight');
		key('ArrowRight');
		key('ArrowLeft');
		key('ArrowLeft');
		// Two up from 1 reaches the ceiling of 2 once; the second is held there.
		expect(edits.map((edit) => edit.uses)).toEqual(['2', '1', '0']);
		expect(run.getAttribute('aria-valuenow')).toBe('0');
	});
});

describe('the HP steppers', () => {
	it('write one value at the end of a run of presses', () => {
		vi.useFakeTimers();
		try {
			const { el, edits } = render();
			const minus = el.querySelector<HTMLButtonElement>('.sheetsmith-stat-block-step') as HTMLButtonElement;
			// The keyboard's press, which is one step each (`hold-repeat.ts`).
			for (let at = 0; at < 3; at++) minus.click();
			expect(edits).toHaveLength(0);
			vi.advanceTimersByTime(GESTURE_COMMIT + 10);
			expect(edits).toHaveLength(1);
			expect(applied(edits[0] as StatBlockData)).toContain('HP: 19 / 34');
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('a delete in a companion block', () => {
	const companion: Partial<StatBlockConfig> = { exclusive: '', uses: '' };

	it('keeps the record that moves into the first place open', () => {
		// Record 1 opened by the reader; record 0, open by default, is deleted.
		const toggles: [number, boolean][] = [];
		const { el } = render(BODY, companion, {
			openRecords: [0, 1],
			onToggleRecord: (at, open) => toggles.push([at, open]),
		});
		const remove = el.querySelectorAll<HTMLButtonElement>('.sheetsmith-record-remove')[0] as HTMLButtonElement;
		remove.click();
		remove.click();
		// The set held {0: closed-from-default, 1: open}; after the delete the
		// one record left is the old record 1, open, which is position 0's default.
		expect(toggles).toEqual([
			[0, false],
			[1, false],
		]);
	});

	it('moves a zone disclosure up with its record', () => {
		const body = BODY.replace('Active: yes', 'Active: no')
			.replace('Active: no\nHP: 11', 'Active: yes\nHP: 11')
			.concat('\nPack Tactics.\n');
		const disclosures = () =>
			Array.from(document.querySelectorAll<HTMLButtonElement>('.sheetsmith-stat-block-disclosure'));
		const first = render(body);
		disclosures()[0]?.click();
		toLibrary(first.el);
		const remove = first.el.querySelectorAll<HTMLButtonElement>('.sheetsmith-record-remove')[0] as HTMLButtonElement;
		remove.click();
		remove.click();
		document.body.replaceChildren();
		const after = applied(first.edits[first.edits.length - 1] as StatBlockData, body);
		render(after);
		expect(disclosures()[0]?.getAttribute('aria-expanded')).toBe('true');
	});
});

describe('the changes list', () => {
	/** The test context, with each target's label as the sheet publishes it. */
	function labelled(): ReturnType<typeof modifierContext> {
		const modifiers = modifierContext();
		const labels: Record<string, string> = {
			'abilities.STR': 'Abilities · STR',
			'abilities.DEX': 'Abilities · DEX',
			'skills.perception': 'Skills · Perception',
			armour_class: 'Armour class',
		};
		return {
			...modifiers,
			outcomes: (part, row) =>
				modifiers.outcomes(part, row).map((outcome) => ({
					...outcome,
					targetLabel: labels[outcome.target] ?? outcome.target,
				})),
		};
	}

	const vitals = (root: HTMLElement): (string | null)[] =>
		Array.from(root.querySelectorAll('.sheetsmith-stat-block-vital')).map((one) => one.textContent);
	const lines = (root: HTMLElement): (string | null)[] =>
		Array.from(root.querySelectorAll('.sheetsmith-stat-block-section .sheetsmith-stat-block-change')).map(
			(line) => line.textContent,
		);

	it('draws the same items under Every form, with the glyph labelled', () => {
		const { el } = render(BODY, {}, { modifiers: labelled() });
		toLibrary(el);
		const detail = el.querySelector('.sheetsmith-stat-block-detail') as HTMLElement;
		expect(lines(detail)).toEqual(['STR +4', 'Perception at least +3']);
		expect(vitals(detail)).toContain('Armour class11');
		const glyph = detail.querySelector('.sheetsmith-stat-block-edit-changes');
		expect(glyph?.textContent).toBe('Edit changes');
		expect(glyph?.getAttribute('aria-label')).toMatch(/^Edit changes\. /);
	});

	it('draws compact items in play, grouped by the component each reaches', () => {
		const body = BODY.replace(
			'Modifiers: abilities.STR = 4; armour_class = 11; skills.perception >= 3',
			'Modifiers: abilities.STR = 4; abilities.DEX = 0; skills.perception >= 3',
		);
		const { el } = render(body, {}, { modifiers: labelled() });
		expect(lines(el)).toEqual(['STR +4 · DEX +0', 'Perception at least +3']);

		// A part that changes nothing says why in words, not by colour alone.
		const base = labelled();
		const idle = {
			...base,
			outcomes: (part: string, row: Parameters<typeof base.outcomes>[1]) =>
				base.outcomes(part, row).map((outcome) =>
					outcome.target === 'skills.perception'
						? { ...outcome, applies: false, suppressed: 'already higher' }
						: outcome,
				),
		};
		document.body.replaceChildren();
		const again = render(body, {}, { modifiers: idle });
		const item = again.el.querySelector('.sheetsmith-stat-block-change-idle');
		expect(item?.textContent).toBe('Perception at least +3 (already higher)');
		// The glyph that edits them sits beside the section's heading, its label.
		const head = again.el.querySelector('.sheetsmith-stat-block-section-head');
		expect(head?.textContent).toContain('Modifiers');
		expect(head?.querySelector('.sheetsmith-record-modifier')).not.toBeNull();
	});

	it('reads an `=` on a single number in the vitals strip, not the list', () => {
		const { el } = render(BODY, {}, { modifiers: labelled() });
		// Armour class is set outright, so it is a stat beside HP and Speed.
		const strip = el.querySelector('.sheetsmith-stat-block-vitals') as HTMLElement;
		const set = strip.querySelector('.sheetsmith-stat-block-vital-set');
		expect(set?.querySelector('.sheetsmith-stat-block-vital-label')?.textContent).toBe('Armour class');
		expect(set?.querySelector('.sheetsmith-stat-block-vital-value')?.textContent).toBe('11');
		expect(lines(el).join(' ')).not.toContain('Armour class');
		// An `=` on one entry of a set, and an at-least, stay in the list.
		expect(lines(el)).toEqual(['STR +4', 'Perception at least +3']);
	});

	it('says why a set number is not applying, beside it in the strip', () => {
		const base = labelled();
		const idle = {
			...base,
			outcomes: (part: string, row: Parameters<typeof base.outcomes>[1]) =>
				base.outcomes(part, row).map((outcome) =>
					outcome.target === 'armour_class'
						? { ...outcome, applies: false, condition: false }
						: outcome,
				),
		};
		const { el } = render(BODY, {}, { modifiers: idle });
		const value = el.querySelector('.sheetsmith-stat-block-vital-set .sheetsmith-stat-block-change-idle');
		expect(value?.textContent).toBe('11 (its condition does not hold now)');
	});

	it('keeps the heading and its glyph when every change is in the strip', () => {
		const body = BODY.replace(
			'Modifiers: abilities.STR = 4; armour_class = 11; skills.perception >= 3',
			'Modifiers: armour_class = 11',
		);
		const { el } = render(body, {}, { modifiers: labelled() });
		expect(lines(el)).toEqual([]);
		expect(el.querySelector('.sheetsmith-stat-block-empty')).toBeNull();
		const head = Array.from(el.querySelectorAll('.sheetsmith-stat-block-section-head')).find((one) =>
			one.textContent?.includes('Modifiers'),
		);
		expect(head?.querySelector('.sheetsmith-record-modifier')).not.toBeNull();
	});
});

describe('the zones a layout orders', () => {
	const headings = (el: HTMLElement): (string | null)[] => {
		const form = el.querySelector('.sheetsmith-stat-block-form') as HTMLElement;
		return Array.from(form.querySelectorAll('.sheetsmith-stat-block-section-heading')).map((one) => one.textContent);
	};

	it('draws the zones in the layout\'s order, an unlisted vitals and changes first', () => {
		const { el } = render(BODY, {
			zones: [
				{ key: 'lore', type: 'text', heading: 'Lore' },
				{ key: 'attacks', type: 'table', heading: 'Attacks', columns: [{ key: 'Attack' }, { key: 'Bonus' }] },
			],
		});
		expect(headings(el)).toEqual(['Modifiers', 'Lore', 'Attacks']);
		const form = el.querySelector('.sheetsmith-stat-block-form') as HTMLElement;
		expect(form.firstElementChild?.classList.contains('sheetsmith-stat-block-vitals')).toBe(true);
	});

	it('draws a built-in where the list puts it, under its own heading', () => {
		const { el } = render(BODY, {
			zones: [
				{ key: 'traits', type: 'text', heading: 'Traits' },
				{ key: 'vitals', heading: 'Stats' },
				{ key: 'changes', heading: 'Shape' },
			],
		});
		expect(headings(el)).toEqual(['Traits', 'Stats', 'Shape']);
	});

	it('draws the vitals, the changes and a closed Details with no list', () => {
		const { el } = render(BODY, { zones: [] });
		expect(headings(el)).toEqual(['Modifiers', 'Details']);
		const details = el.querySelector<HTMLButtonElement>('.sheetsmith-stat-block-disclosure');
		expect(details?.textContent).toBe('Details');
		expect(details?.getAttribute('aria-expanded')).toBe('false');
	});

	it('draws a text zone open, with no disclosure, where collapsed is off', () => {
		const { el } = render(BODY, {
			zones: [{ key: 'traits', type: 'text', heading: 'Traits' }],
		});
		expect(el.querySelector('.sheetsmith-stat-block-disclosure')).toBeNull();
		expect(el.querySelector('.sheetsmith-stat-block-zone-text .sheetsmith-record-body')?.hasAttribute('hidden')).toBe(false);
	});
});

describe('a closed form in the library', () => {
	it('says its vitals on its line, and drops them while open', () => {
		const { el } = render();
		toLibrary(el);
		const lines = Array.from(el.querySelectorAll<HTMLElement>('.sheetsmith-stat-block-summary'));
		expect(lines.map((line) => line.textContent)).toEqual(['HP 22/34', 'HP 11/11']);
		expect(lines.every((line) => line.hidden)).toBe(false);
		el.querySelector<HTMLButtonElement>('.sheetsmith-record-disclosure')?.click();
		expect(lines[0]?.hidden).toBe(true);
	});
	it('mirrors the tiles: a set number that applies follows the numbers', () => {
		const modifiers = modifierContext();
		const labelled = {
			...modifiers,
			outcomes: (part: string, row: Parameters<typeof modifiers.outcomes>[1]) =>
				modifiers.outcomes(part, row).map((outcome) => ({
					...outcome,
					targetLabel: outcome.target === 'armour_class' ? 'Armour class' : `Skills · ${outcome.target}`,
				})),
		};
		const { el } = render(BODY, {}, { modifiers: labelled });
		toLibrary(el);
		const first = el.querySelector<HTMLElement>('.sheetsmith-stat-block-summary');
		expect(first?.textContent).toBe('HP 22/34 · Armour class 11');

		// One that is not applying is left to the open form, which can say why.
		document.body.replaceChildren();
		const idle = {
			...labelled,
			outcomes: (part: string, row: Parameters<typeof modifiers.outcomes>[1]) =>
				labelled.outcomes(part, row).map((outcome) =>
					outcome.target === 'armour_class' ? { ...outcome, applies: false } : outcome,
				),
		};
		const again = render(BODY, {}, { modifiers: idle });
		toLibrary(again.el);
		expect(again.el.querySelector('.sheetsmith-stat-block-summary')?.textContent).toBe('HP 22/34');
	});
});

describe('a signed number cell', () => {
	it('writes the note\'s own spelling, and writes nothing for the sign alone', () => {
		const { el, edits } = render();
		toLibrary(el);
		const bonus = el.querySelectorAll<HTMLTextAreaElement>('.sheetsmith-stat-block-table textarea')[1] as HTMLTextAreaElement;
		bonus.focus();
		bonus.blur();
		expect(edits).toHaveLength(0);
		bonus.focus();
		bonus.value = '+7';
		bonus.dispatchEvent(new Event('input'));
		bonus.blur();
		expect(applied(edits[0] as StatBlockData)).toBe(BODY.replace('| Bite | 6 |', '| Bite | 7 |'));
	});
});

/*
 * Zones (`docs/features/stat-block-zones.md`): a body of `####` blocks the
 * layout declares, drawn in its order, with drift kept and drawn.
 */
const ZONED: StatBlockConfig = {
	...config,
	image: true,
	zones: [
		{ key: 'vitals' },
		{ key: 'changes' },
		{
			key: 'attacks',
			type: 'table',
			heading: 'Attacks',
			columns: [{ key: 'Attack' }, { key: 'Bonus', type: 'number' }, { key: 'Damage' }],
		},
		{ key: 'actions', type: 'features', heading: 'Actions' },
		{ key: 'traits', type: 'text', heading: 'Traits', collapsed: true },
	],
};

const BEAR = [
	'',
	'### Brown Bear',
	'```sheet',
	'Active: yes',
	'HP: 22 / 34',
	'```',
	'',
	'![[Brown bear.png]]',
	'',
	'#### Attacks',
	'',
	'| Attack | Bonus | Damage |',
	'|---|---|---|',
	'| Bite | 6 | 1d8+4 piercing |',
	'| [[Claws (Brown Bear)\\|Claws]] | 6 | 2d6+4 slashing |',
	'',
	'#### Actions',
	'',
	'**Multiattack.** Two attacks.',
	'',
	'**Roar (1/Day).** Each creature.',
	'',
	'- On a failure it is frightened.',
	'',
	'#### Reactions',
	'',
	'Not a zone in this layout.',
	'',
	'#### Traits',
	'',
	'***Keen Smell.*** Smell.',
	'',
	'### Mook',
	'```sheet',
	'Active: no',
	'HP: 1 / 1',
	'```',
	'',
].join('\n');

function zoned(body: string = BEAR, over: Partial<StatBlockConfig> = {}, ctx: Partial<RenderContext<StatBlockData>> = {}) {
	return render(body, { ...ZONED, ...over }, ctx);
}

function typeInto(input: HTMLInputElement | HTMLTextAreaElement, text: string): void {
	input.focus();
	input.value = text;
	input.dispatchEvent(new Event('input'));
	input.blur();
}

describe('a body of zones', () => {
	it('round-trips byte for byte when nothing changed', () => {
		expect(statBlock.write({ records: {} }, BEAR, ZONED)).toBe(BEAR);
	});

	it('reads each zone, its features with their usage, and the drift', () => {
		const data = read(BEAR, ZONED);
		const bear = data.records[0];
		const actions = bear?.zones?.actions;
		expect(actions?.type === 'features' ? actions.entries.map((one) => [one.name, one.usage]) : []).toEqual([
			['Multiattack', ''],
			['Roar', '1/Day'],
		]);
		expect(bear?.drift).toEqual([{ kind: 'unmatched', heading: 'Reactions', content: '\nNot a zone in this layout.\n\n' }]);
		expect(bear?.picture).toBe('![[Brown bear.png]]');
	});

	it('draws the zones in play in order, the features as their own markdown, then the drift', () => {
		const { el } = zoned();
		const headings = Array.from(el.querySelectorAll('.sheetsmith-stat-block-form .sheetsmith-stat-block-section-heading')).map(
			(one) => one.textContent,
		);
		expect(headings).toEqual(['Modifiers', 'Attacks', 'Actions', 'Traits', 'Reactions']);
		const entries = el.querySelectorAll('.sheetsmith-stat-block-entry');
		expect(entries).toHaveLength(2);
		expect(entries[1]?.textContent).toContain('Roar (1/Day).');
		expect(el.querySelector('.sheetsmith-stat-block-drift-tag')?.textContent).toBe('Not in this layout');
		expect(el.textContent).toContain('Edit it in markdown view, or add a zone headed "Reactions" to the layout.');
	});

	it('draws an empty zone of each type as nothing in play, and every one under Every form', () => {
		const body = BEAR.replace('Active: yes', 'Active: no').replace('Active: no\nHP: 1', 'Active: yes\nHP: 1');
		const { el } = zoned(body);
		const form = el.querySelector('.sheetsmith-stat-block-form') as HTMLElement;
		expect(form.querySelector('.sheetsmith-stat-block-zone')).toBeNull();
		expect(form.textContent).not.toContain('None yet');
		toLibrary(el);
		el.querySelectorAll<HTMLButtonElement>('.sheetsmith-record-disclosure')[1]?.click();
		const mook = el.querySelectorAll('.sheetsmith-stat-block-detail')[1] as HTMLElement;
		expect(mook.querySelectorAll('.sheetsmith-stat-block-zone')).toHaveLength(3);
		expect(mook.querySelector('.sheetsmith-stat-block-add-action')?.textContent).toBe('Add attack');
		expect(mook.querySelector('.sheetsmith-stat-block-add-entry')?.textContent).toBe('Add entry');
		expect(mook.querySelector<HTMLTextAreaElement>('.sheetsmith-stat-block-zone-text textarea')?.placeholder).toBe('Add text');
		// Nothing faint that could pass for a value: the usage field says its name.
		const { detail } = { detail: el.querySelector('.sheetsmith-stat-block-detail') as HTMLElement };
		expect(detail.querySelector<HTMLInputElement>('.sheetsmith-stat-block-entry-usage')?.placeholder).toBe('Usage');
	});

	it('draws a collapsed zone open under Every form', () => {
		const { el } = zoned();
		toLibrary(el);
		const detail = el.querySelector('.sheetsmith-stat-block-detail') as HTMLElement;
		expect(detail.querySelector('.sheetsmith-stat-block-disclosure')).toBeNull();
	});

	it('draws drift read-only on both faces, and a second heading and a lead their own sentences', () => {
		const body = BEAR.replace('#### Reactions', '#### Actions:').replace('\n![[Brown bear.png]]\n', '\nStray lead.\n\n#### Attacks\n\nprose');
		const { el } = zoned(body, { image: false });
		expect(el.textContent).toContain('A second "Actions:" heading in this record. Only the first is read.');
		expect(el.querySelector('.sheetsmith-stat-block-form .sheetsmith-stat-block-drift .sheetsmith-stat-block-panel')).not.toBeNull();
		expect(el.textContent).toContain(
			"No zone reads the text above the first heading. Edit it in markdown view, or move it under a zone's heading.",
		);
		toLibrary(el);
		const detail = el.querySelector('.sheetsmith-stat-block-detail') as HTMLElement;
		const drift = Array.from(detail.querySelectorAll('.sheetsmith-stat-block-drift'));
		expect(drift.length).toBeGreaterThan(0);
		expect(drift.every((one) => one.querySelector('textarea, input') === null)).toBe(true);
		// Plain text under Every form, with no box: only an editable zone wears
		// a field's clothes there. In play it keeps the text zones' box.
		expect(drift.every((one) => one.querySelector('.sheetsmith-stat-block-panel') === null)).toBe(true);
	});

	it('draws a table zone holding prose as its error, with no field, the other zones still editing', () => {
		const body = BEAR.replace(/\| Attack \| Bonus[\s\S]*?slashing \|\n/, 'Just some prose.\n');
		const { el, edits } = zoned(body);
		expect(el.textContent).toContain("Not a table. Edit it in markdown view, or change this zone's type.");
		toLibrary(el);
		const detail = el.querySelector('.sheetsmith-stat-block-detail') as HTMLElement;
		const table = detail.querySelector('.sheetsmith-stat-block-zone-table') as HTMLElement;
		expect(table.querySelector('textarea, .sheetsmith-stat-block-add-action')).toBeNull();
		const name = detail.querySelector<HTMLTextAreaElement>('.sheetsmith-stat-block-entry-name') as HTMLTextAreaElement;
		typeInto(name, 'Multi');
		expect(edits).toHaveLength(1);
	});

	it('gives a zone with no content one block on its first edit, placed by layout order', () => {
		const written = statBlock.write(
			{ records: {}, zoneEdits: { 1: { zone: 'actions', features: { added: true } } } },
			BEAR,
			ZONED,
		);
		expect(written).toBe(BEAR.replace('HP: 1 / 1\n```\n', 'HP: 1 / 1\n```\n\n#### Actions\n\n**Entry.** \n'));
	});

	it('writes a name and usage through the bold run, in the note\'s own spelling', () => {
		const { el, edits } = zoned();
		toLibrary(el);
		const usage = el.querySelector<HTMLInputElement>('.sheetsmith-stat-block-entry-usage') as HTMLInputElement;
		typeInto(usage, '2/Day');
		expect(applied(edits[0] as StatBlockData, BEAR, ZONED)).toBe(BEAR.replace('**Multiattack.**', '**Multiattack (2/Day).**'));
		// The usage alone: the edit names no name, so none is written back stale.
		expect(edits[0]?.zoneEdits?.[0]?.features).toEqual({ entry: 0, usage: '2/Day' });
	});

	it('keeps an entry\'s usage when only its name is committed', () => {
		const written = statBlock.write(
			{ records: {}, zoneEdits: { 0: { zone: 'actions', features: { entry: 1, name: 'Bellow' } } } },
			BEAR,
			ZONED,
		);
		expect(written).toBe(BEAR.replace('**Roar (1/Day).**', '**Bellow (1/Day).**'));
	});

	it('adds an entry, and a text edit keeps every other byte', () => {
		const added = statBlock.write({ records: {}, zoneEdits: { 0: { zone: 'actions', features: { added: true } } } }, BEAR, ZONED);
		expect(added).toContain('- On a failure it is frightened.\n\n**Entry.** \n\n#### Reactions');
		const texted = statBlock.write(
			{ records: {}, zoneEdits: { 0: { zone: 'actions', features: { entry: 0, text: 'Three attacks.' } } } },
			BEAR,
			ZONED,
		);
		expect(texted).toBe(BEAR.replace('Two attacks.', 'Three attacks.'));
	});
});

describe('the table zone\'s escaping', () => {
	it('writes a typed pipe escaped, and reads it back plain', () => {
		const written = statBlock.write(
			{ records: {}, zoneEdits: { 0: { zone: 'attacks', table: { rows: { 0: { Damage: 'A | B' } } } } } },
			BEAR,
			ZONED,
		);
		expect(written).toContain('| Bite | 6 | A \\| B |');
		const back = read(written, ZONED).records[0]?.zones?.attacks;
		expect(back?.type === 'table' ? back.rows[0]?.[2] : '').toBe('A | B');
	});

	it('round-trips an aliased wikilink through a table zone', () => {
		const attacks = read(BEAR, ZONED).records[0]?.zones?.attacks;
		expect(attacks?.type === 'table' ? attacks.rows[1]?.[0] : '').toBe('[[Claws (Brown Bear)|Claws]]');
		const { el, edits } = zoned();
		const link = el.querySelectorAll('.sheetsmith-stat-block-table tbody tr')[1]?.querySelector('a');
		expect(link?.textContent).toBe('Claws');
		toLibrary(el);
		const detail = el.querySelector('.sheetsmith-stat-block-detail') as HTMLElement;
		const cells = detail.querySelectorAll<HTMLTextAreaElement>('.sheetsmith-stat-block-table textarea');
		// The aliased name, committed unchanged, writes nothing.
		const name = cells[3] as HTMLTextAreaElement;
		name.focus();
		name.blur();
		expect(edits).toHaveLength(0);
		// A neighbouring cell's commit leaves the link's bytes alone.
		typeInto(cells[4] as HTMLTextAreaElement, '7');
		expect(applied(edits[0] as StatBlockData, BEAR, ZONED)).toBe(
			BEAR.replace('| [[Claws (Brown Bear)\\|Claws]] | 6 |', '| [[Claws (Brown Bear)\\|Claws]] | 7 |'),
		);
	});

	it('draws every row of a five-row table', () => {
		const rows = ['| A | 1 | x |', '| B | 2 | x |', '| C | 3 | x |', '| D | 4 | x |', '| E | 5 | x |'].join('\n');
		const body = BEAR.replace(/\| Bite[^\n]*\n\| \[\[Claws[^\n]*/, rows);
		const { el } = zoned(body);
		expect(el.querySelectorAll('.sheetsmith-stat-block-table tbody tr')).toHaveLength(5);
	});
});

describe('the commit guards', () => {
	const detail = (el: HTMLElement) => {
		toLibrary(el);
		return el.querySelector('.sheetsmith-stat-block-detail') as HTMLElement;
	};

	it('refuses a text zone line that would start a zone', () => {
		const { el, edits } = zoned();
		const box = detail(el).querySelector<HTMLTextAreaElement>('.sheetsmith-stat-block-zone-text textarea') as HTMLTextAreaElement;
		typeInto(box, 'Smell.\n\n#### Actions\n\nmore');
		expect(edits).toHaveLength(0);
		expect(el.textContent).toContain('Not saved. "#### Actions" would start the Actions zone. Use ##### for a heading inside text.');
	});

	it('takes a text zone heading that matches no zone, which reads back as its text', () => {
		const { el, edits } = zoned();
		const box = detail(el).querySelector<HTMLTextAreaElement>('.sheetsmith-stat-block-zone-text textarea') as HTMLTextAreaElement;
		typeInto(box, 'Smell.\n\n#### Senses\n\nmore');
		expect(edits).toHaveLength(1);
	});

	it('refuses any heading in a feature\'s text and lead', () => {
		const { el, edits } = zoned();
		const zone = detail(el).querySelector('.sheetsmith-stat-block-zone-features') as HTMLElement;
		const [lead, text] = Array.from(zone.querySelectorAll<HTMLTextAreaElement>('.sheetsmith-record-body-input'));
		typeInto(lead as HTMLTextAreaElement, '#### Senses');
		typeInto(text as HTMLTextAreaElement, 'x\n\n#### Senses');
		expect(edits).toHaveLength(0);
		expect(zone.textContent).toContain('would start a heading this layout has no zone for');
	});

	it('advises a text zone\'s record heading toward ####, which it takes', () => {
		const { el, edits } = zoned();
		const box = detail(el).querySelector<HTMLTextAreaElement>('.sheetsmith-stat-block-zone-text textarea') as HTMLTextAreaElement;
		typeInto(box, 'Smell.\n\n### Senses');
		expect(edits).toHaveLength(0);
		expect(el.textContent).toMatch(/Not saved\. "### Senses" would start a new \S+ in this list — use "#### " instead\./);
		typeInto(box, 'Smell.\n\n#### Senses');
		expect(edits).toHaveLength(1);
	});

	it('advises a feature\'s record heading toward #####, which it takes, never ####, which it refuses', () => {
		const { el, edits } = zoned();
		const zone = detail(el).querySelector('.sheetsmith-stat-block-zone-features') as HTMLElement;
		const [lead, text] = Array.from(zone.querySelectorAll<HTMLTextAreaElement>('.sheetsmith-record-body-input'));
		typeInto(lead as HTMLTextAreaElement, '## Senses');
		expect(zone.textContent).toContain('Not saved. "## Senses" would start a new section in this note — use "##### " instead.');
		typeInto(text as HTMLTextAreaElement, 'x\n\n### Senses');
		expect(zone.textContent).toMatch(/Not saved\. "### Senses" would start a new \S+ in this list — use "##### " instead\./);
		expect(zone.textContent).not.toContain('use "#### " instead');
		expect(edits).toHaveLength(0);
		typeInto(text as HTMLTextAreaElement, 'x\n\n##### Senses');
		expect(edits).toHaveLength(1);
	});

	it('refuses a table cell opening with a heading', () => {
		const { el, edits } = zoned();
		const cell = detail(el).querySelector<HTMLTextAreaElement>('.sheetsmith-stat-block-table textarea') as HTMLTextAreaElement;
		typeInto(cell, '#### Traits');
		expect(edits).toHaveLength(0);
	});

	it('refuses a ### line in any body text, as before', () => {
		const { el, edits } = zoned();
		const box = detail(el).querySelector<HTMLTextAreaElement>('.sheetsmith-stat-block-zone-text textarea') as HTMLTextAreaElement;
		typeInto(box, '### Wolf');
		expect(edits).toHaveLength(0);
	});

	it('refuses a 0.9.0 lead\'s text opening with a lone embed, with Picture on', () => {
		const { el, edits } = render(BODY, { ...ZONED });
		const box = detail(el).querySelector<HTMLTextAreaElement>('.sheetsmith-stat-block-zone-text textarea') as HTMLTextAreaElement;
		typeInto(box, '![[Bear.png]]\n\nKeen smell.');
		expect(edits).toHaveLength(0);
		expect(el.textContent).toContain('Not saved. A picture on its own first line is the form\'s picture. Set it under Picture instead.');
	});
});

describe('the record picture', () => {
	const resource = (target: string) => (target === 'Brown bear.png' ? 'app://bear.png' : null);

	it('draws a thumbnail before the name in play, and nothing with no line', () => {
		const { el } = zoned(BEAR, {}, { resource });
		const head = el.querySelector('.sheetsmith-stat-block-play-head') as HTMLElement;
		expect(head.firstElementChild?.classList.contains('sheetsmith-stat-block-thumb')).toBe(true);
		expect(head.querySelector('img')?.getAttribute('src')).toBe('app://bear.png');
		document.body.replaceChildren();
		const none = zoned(BEAR.replace('![[Brown bear.png]]\n\n', ''), {}, { resource });
		expect(none.el.querySelector('.sheetsmith-stat-block-thumb')).toBeNull();
	});

	it('says the painter\'s sentence under the head for a missing file, with no thumbnail', () => {
		const { el } = zoned(BEAR, {}, { resource: () => null });
		expect(el.querySelector('.sheetsmith-stat-block-thumb')).toBeNull();
		expect(el.querySelector('.sheetsmith-stat-block-problem')?.textContent).toBe(
			'No file in this vault is called "Brown bear.png". Set it under Every form, in Picture.',
		);
	});

	it('names each form before its sentence where two are on', () => {
		const two = BEAR.replace('Active: no\nHP: 1', 'Active: yes\nHP: 1').replace('HP: 1 / 1\n```\n', 'HP: 1 / 1\n```\n\n![[Mook.png]]\n');
		const { el } = zoned(two, {}, { resource: () => null });
		expect(Array.from(el.querySelectorAll('.sheetsmith-stat-block-problem')).map((one) => one.textContent)).toEqual([
			'Brown Bear: No file in this vault is called "Brown bear.png". Set it under Every form, in Picture.',
			'Mook: No file in this vault is called "Mook.png". Set it under Every form, in Picture.',
		]);
	});

	it('is prose with Picture off', () => {
		const { el } = zoned(BEAR, { image: false }, { resource });
		expect(el.querySelector('.sheetsmith-stat-block-thumb')).toBeNull();
	});

	it('draws the frame and its field under Every form, refusing a bare path', () => {
		const { el, edits } = zoned(BEAR, {}, { resource });
		toLibrary(el);
		const detail = el.querySelector('.sheetsmith-stat-block-detail') as HTMLElement;
		const field = detail.querySelector<HTMLInputElement>('.sheetsmith-stat-block-picture .sheetsmith-image-input') as HTMLInputElement;
		expect(field.value).toBe('![[Brown bear.png]]');
		typeInto(field, 'Wolf.png');
		expect(edits).toHaveLength(0);
		expect(detail.textContent).toContain('Write the picture as an embed');
		typeInto(field, '');
		expect(applied(edits[0] as StatBlockData, BEAR, ZONED)).toBe(BEAR.replace('![[Brown bear.png]]\n\n', ''));
	});
});

describe('the configuration zones refuse', () => {
	const refused = (zones: unknown[], extra: Record<string, unknown> = {}) => {
		const result = statBlock.read(BEAR, { ...ZONED, zones, ...extra } as StatBlockConfig);
		return result.ok ? null : result.error;
	};
	const table = (over: Record<string, unknown> = {}) => ({ key: 'a', type: 'table', heading: 'A', columns: [{ key: 'X' }], ...over });

	it('reports the keys zones replaced', () => {
		const result = statBlock.read(BEAR, { ...ZONED, actions: [], bodyName: 'Traits' } as unknown as StatBlockConfig);
		expect(result).toEqual({
			ok: false,
			error: "Zones replaced actions and bodyName. Set this stat block's zones, then remove those keys from the layout.",
		});
		for (const key of ['actions', 'actionName', 'bodyName', 'sections']) {
			expect(refused([], { [key]: 'x' })).toBe(`Zones replaced ${key}. Set this stat block's zones, then remove that key from the layout.`);
		}
		const el = document.createElement('div');
		const edits: StatBlockData[] = [];
		statBlock.render(el, { ...ZONED, sections: [] } as unknown as StatBlockConfig, null, {
			...context,
			onChange: (data) => edits.push(data),
		});
		expect(edits).toHaveLength(0);
		expect(el.children).toHaveLength(1);
		expect(el.firstElementChild?.classList.contains('sheetsmith-error')).toBe(true);
	});

	it('refuses a zone with no key', () => expect(refused([{ type: 'text', heading: 'A' }])).toContain('no key'));
	it('refuses a key that is not a name', () => expect(refused([{ key: 'a b', type: 'text', heading: 'A' }])).toContain('not a name'));
	it('refuses two zones with one key', () =>
		expect(refused([{ key: 'a', type: 'text', heading: 'A' }, { key: 'A', type: 'text', heading: 'B' }])).toContain('share the key'));
	it('refuses a built-in given a type', () => expect(refused([{ key: 'vitals', type: 'text' }])).toContain('built in'));
	it('refuses a body zone keyed changes', () =>
		expect(refused([{ key: 'changes', type: 'table', heading: 'Changes', columns: [{ key: 'X' }] }])).toContain('built in'));
	it('refuses a body zone with no heading', () => expect(refused([{ key: 'a', type: 'text' }])).toContain('no heading'));
	it('refuses a heading that normalises to nothing', () => expect(refused([{ key: 'a', type: 'text', heading: '...' }])).toContain('nothing to match'));
	it('refuses two headings that normalise alike', () =>
		expect(refused([{ key: 'a', type: 'text', heading: 'Traits' }, { key: 'b', type: 'text', heading: 'traits:' }])).toContain('cannot tell apart'));
	it('refuses a heading holding a line break', () => expect(refused([{ key: 'a', type: 'text', heading: 'A\nB' }])).toContain('line break'));
	it('refuses a heading holding a wikilink', () => expect(refused([{ key: 'a', type: 'text', heading: '[[Traits]]' }])).toContain('link'));
	it('refuses a type other than the three', () => expect(refused([{ key: 'a', type: 'image', heading: 'A' }])).toContain('image zone'));
	it('refuses a table zone with no columns', () => expect(refused([table({ columns: [] })])).toContain('no columns'));
	it('refuses two columns that normalise alike', () =>
		expect(refused([table({ columns: [{ key: 'X' }, { key: 'x' }] })])).toContain('share the heading'));
	it('refuses a column key holding a pipe', () => expect(refused([table({ columns: [{ key: 'A|B' }] })])).toContain('"|"'));
	it('refuses collapsed on a zone that is not text', () => expect(refused([table({ collapsed: true })])).toContain('only a text zone'));
});

describe('a form below 0', () => {
	it('says the stored value in the error colour, with a true minus sign', () => {
		const below = render(BODY.replace('HP: 22 / 34', 'HP: -3 / 34'));
		expect(below.el.querySelector('.sheetsmith-stat-block-down')).not.toBeNull();
		expect(below.el.querySelector('.sheetsmith-stat-block-down-note')?.textContent).toBe('At −3. Carry any leftover damage over by hand.');
	});
});

/*
 * The guards `stat-block-zones.ts` adds past the spec's first list, each driven
 * through the face that draws it: one refused spelling per case, and a near
 * miss each guard lets through. Through the component rather than in a file of
 * the painter's own, on `picture-frame.ts`'s and `card-face.ts`'s practice: a
 * painter's rules are observable only in the box a component draws them into.
 */
describe('the entry and cell guards', () => {
	const library = (body: string = BEAR) => {
		const drawn = zoned(body);
		toLibrary(drawn.el);
		return { ...drawn, detail: drawn.el.querySelector('.sheetsmith-stat-block-detail') as HTMLElement };
	};
	const features = (detail: HTMLElement) => detail.querySelector('.sheetsmith-stat-block-zone-features') as HTMLElement;

	it('refuses a lead paragraph that opens with a bold name, and takes a stop outside the bold', () => {
		const { detail, edits } = library();
		const lead = features(detail).querySelector<HTMLTextAreaElement>('.sheetsmith-record-body-input') as HTMLTextAreaElement;
		typeInto(lead, '**Pounce.** Leaps.');
		expect(edits).toHaveLength(0);
		expect(features(detail).textContent).toContain('would start a new entry. Add it with Add entry instead.');
		typeInto(lead, '**Pounce**. Leaps.');
		expect(edits).toHaveLength(1);
	});

	it('refuses an entry text paragraph that opens with a bold name, and takes one on the name\'s own line', () => {
		const { detail, edits } = library();
		const text = features(detail).querySelectorAll<HTMLTextAreaElement>('.sheetsmith-record-body-input')[1] as HTMLTextAreaElement;
		typeInto(text, 'Two attacks.\n\n**Pounce.** Leaps.');
		expect(edits).toHaveLength(0);
		typeInto(text, '**Pounce.** is how it opens.');
		expect(edits).toHaveLength(1);
	});

	const name = (detail: HTMLElement) =>
		features(detail).querySelector<HTMLTextAreaElement>('.sheetsmith-stat-block-entry-name') as HTMLTextAreaElement;
	const usage = (detail: HTMLElement) =>
		features(detail).querySelector<HTMLInputElement>('.sheetsmith-stat-block-entry-usage') as HTMLInputElement;

	for (const [said, typed, sentence] of [
		['a blank name', '', 'An entry needs a name'],
		['a name over two lines', 'Multi\nattack', 'A name is one line'],
		['a name holding **', 'Multi**attack', 'cannot hold ** or __'],
		['a name holding __', 'Multi__attack', 'cannot hold ** or __'],
		['a name ending in a parenthesis', 'Multiattack (x)', 'reads as its usage'],
	] as const) {
		it(`refuses ${said}`, () => {
			const { detail, edits } = library();
			typeInto(name(detail), typed);
			expect(edits).toHaveLength(0);
			expect(features(detail).textContent).toContain(sentence);
		});
	}

	it('takes a name with a parenthesis inside it', () => {
		const { detail, edits } = library();
		typeInto(name(detail), 'Multiattack (Bear) Form');
		expect(edits).toHaveLength(1);
	});

	for (const [said, typed, sentence] of [
		['a usage holding parentheses', '(1/Day)', 'written inside parentheses already'],
	] as const) {
		it(`refuses ${said}`, () => {
			const { detail, edits } = library();
			typeInto(usage(detail), typed);
			expect(edits).toHaveLength(0);
			expect(features(detail).textContent).toContain(sentence);
		});
	}

	it('refuses a table cell holding a line break, and takes a #### past its start', () => {
		const { detail, edits } = library();
		const cell = detail.querySelector<HTMLTextAreaElement>('.sheetsmith-stat-block-table textarea') as HTMLTextAreaElement;
		typeInto(cell, 'Bite\nagain');
		expect(edits).toHaveLength(0);
		expect(detail.textContent).toContain('A table cell is one line.');
		typeInto(cell, 'Bite #### hard');
		expect(edits).toHaveLength(1);
	});

	it('takes a legacy lead opening with an embed that runs into a sentence', () => {
		const { el, edits } = render(BODY, { ...ZONED });
		toLibrary(el);
		const detail = el.querySelector('.sheetsmith-stat-block-detail') as HTMLElement;
		const box = detail.querySelector<HTMLTextAreaElement>('.sheetsmith-stat-block-zone-text textarea') as HTMLTextAreaElement;
		typeInto(box, '![[Bear.png]]\nKeen smell.');
		expect(edits).toHaveLength(1);
	});
});

describe('a layout edit to the zones', () => {
	it('draws a removed zone\'s blocks as drift, and writes nothing on render', () => {
		const zones = (ZONED.zones ?? []).filter((zone) => zone.key !== 'actions');
		const { el, edits } = zoned(BEAR, { zones });
		expect(edits).toHaveLength(0);
		const drift = Array.from(el.querySelectorAll('.sheetsmith-stat-block-drift .sheetsmith-stat-block-section-heading')).map(
			(one) => one.textContent,
		);
		expect(drift).toContain('Actions');
		expect(statBlock.write({ records: {} }, BEAR, { ...ZONED, zones })).toBe(BEAR);
	});

	it('draws a table zone\'s columns in the layout\'s new order', () => {
		const zones = (ZONED.zones ?? []).map((zone) =>
			zone.key === 'attacks'
				? { ...zone, columns: [{ key: 'Attack' }, { key: 'Damage' }, { key: 'Bonus', type: 'number' as const }] }
				: zone,
		);
		const { el } = zoned(BEAR, { zones });
		const heads = Array.from(el.querySelectorAll('.sheetsmith-stat-block-table thead th')).map((th) => th.textContent);
		expect(heads).toEqual(['Attack', 'Damage', 'Bonus', '']);
		const first = Array.from(el.querySelectorAll('.sheetsmith-stat-block-table tbody tr')[0]?.children ?? []).map(
			(cell) => cell.textContent,
		);
		expect(first).toEqual(['Bite', '1d8+4 piercing', '+6', '']);
	});
});

describe('a features entry with no app to render it', () => {
	it('draws the parsed name bold and run in, with no marks, as the canvas shows it', () => {
		const { el } = zoned(BEAR, {}, { renderMarkdown: undefined });
		const entries = Array.from(el.querySelectorAll('.sheetsmith-stat-block-entry'));
		expect(entries[1]?.querySelector('p > strong')?.textContent).toBe('Roar (1/Day).');
		expect(entries[1]?.textContent).not.toContain('**');
		expect(entries[1]?.textContent).toContain('On a failure it is frightened.');
	});
});

describe('a row or entry named by a link, read aloud', () => {
	const NAMED = BEAR.replace('| Bite | 6 |', '| [[Bite]] | 6 |')
		.replace('**Multiattack.**', '**[[Multiattack (Bear)|Multiattack]].**')
		.replace('**Roar (1/Day).**', '**[[Roar]] (1/Day).**');

	function library(body: string = NAMED) {
		const drawn = zoned(body);
		toLibrary(drawn.el);
		return { ...drawn, detail: drawn.el.querySelector('.sheetsmith-stat-block-detail') as HTMLElement };
	}
	const labels = (root: HTMLElement, selector: string) =>
		Array.from(root.querySelectorAll(selector)).map((one) => one.getAttribute('aria-label'));

	it('names a table row\'s delete and cells by what the sheet draws: an aliased link, a plain link, plain text', () => {
		const { detail } = library();
		expect(labels(detail, '.sheetsmith-stat-block-table .sheetsmith-stat-block-remove')).toEqual(['Delete Bite', 'Delete Claws']);
		const cells = labels(detail, '.sheetsmith-stat-block-table .sheetsmith-stat-block-action-cell textarea');
		expect(cells[0]).toBe('Bite Bonus');
		expect(cells[2]).toBe('Claws Bonus');
		document.body.replaceChildren();
		const plain = library(BEAR);
		expect(labels(plain.detail, '.sheetsmith-stat-block-table .sheetsmith-stat-block-remove')[0]).toBe('Delete Bite');
	});

	it('names an entry\'s delete and usage the same way', () => {
		const { detail } = library();
		expect(labels(detail, '.sheetsmith-stat-block-entry-line .sheetsmith-stat-block-remove')).toEqual([
			'Delete Multiattack',
			'Delete Roar',
		]);
		expect(labels(detail, '.sheetsmith-stat-block-entry-usage')).toEqual(['Multiattack usage', 'Roar usage']);
	});

	it('announces a committed link by its display text', () => {
		const { detail, el } = library(BEAR);
		const name = detail.querySelector<HTMLTextAreaElement>('.sheetsmith-stat-block-table textarea') as HTMLTextAreaElement;
		typeInto(name, '[[Bite (Brown Bear)|Bite]]');
		expect(el.querySelector('[aria-live]')?.textContent).toBe('Attack Bite');
	});
});

describe('the colour a form tints in', () => {
	const TINTED: Partial<StatBlockConfig> = { tint: 'green', tintPerRecord: true };
	/** Brown Bear choosing orange; Wolf choosing nothing. */
	const ORANGE_BEAR = BODY.replace('Modifiers: abilities.STR = 4;', 'Tint: orange\nModifiers: abilities.STR = 4;');
	const pushes = (body: string, over: Partial<StatBlockConfig>): readonly ModifierPush[] => {
		const from = { ...config, ...over };
		return statBlock.scopeModifiers?.(read(body, from), from)?.(() => null) ?? [];
	};
	const tints = (pushed: readonly ModifierPush[]) => [...new Set(pushed.map((push) => push.tint))];

	it("pushes a form's own valid Tint, else the block's, and nothing for the accent", () => {
		expect(tints(pushes(ORANGE_BEAR, TINTED))).toEqual(['orange']);
		expect(tints(pushes(BODY, TINTED))).toEqual(['green']);
		// The switch off: the entry is ignored, and the block's colour taken.
		expect(tints(pushes(ORANGE_BEAR, { tint: 'green' }))).toEqual(['green']);
		// The accent is written as absence, whoever chose it.
		expect(pushes(BODY, {}).every((push) => !('tint' in push))).toBe(true);
		expect(
			pushes(ORANGE_BEAR.replace('Tint: orange', 'Tint: accent'), TINTED).every((push) => !('tint' in push)),
		).toBe(true);
	});

	it('pushes neither inPlay nor tint without exclusive', () => {
		const pushed = pushes(ORANGE_BEAR, { ...TINTED, exclusive: '' });
		expect(pushed.length).toBeGreaterThan(0);
		expect(pushed.some((push) => push.inPlay === true || push.tint !== undefined)).toBe(false);
	});

	it('reads Green as green, and a blank entry as none', () => {
		expect(tints(pushes(ORANGE_BEAR.replace('Tint: orange', 'Tint: Green'), { ...TINTED, tint: 'red' }))).toEqual([
			'green',
		]);
		expect(tints(pushes(ORANGE_BEAR.replace('Tint: orange', 'Tint:'), TINTED))).toEqual(['green']);
	});

	describe('a layout tint outside the list', () => {
		const BROWN: Partial<StatBlockConfig> = { tint: 'brown', tintPerRecord: true };
		const SENTENCE = '"brown" is not a tint colour. Choose one under Tint in the layout editor.';

		it('reads, and tints in the accent except where a form chose its own', () => {
			expect(statBlock.read(BODY, { ...config, ...BROWN }).ok).toBe(true);
			expect(pushes(BODY, BROWN).every((push) => push.inPlay === true && !('tint' in push))).toBe(true);
			expect(tints(pushes(ORANGE_BEAR, BROWN))).toEqual(['orange']);
		});

		it('draws the whole block, with one line under the head, a form chosen or not', () => {
			const { el, edits } = render(BODY, BROWN);
			expect(picker(el)).not.toBeNull();
			expect(el.querySelector('.sheetsmith-stat-block-revert')).not.toBeNull();
			expect(el.querySelector('.sheetsmith-stat-block-form')).not.toBeNull();
			const lines = Array.from(el.querySelectorAll('.sheetsmith-stat-block-problem')).map(
				(one) => one.textContent,
			);
			expect(lines).toEqual([SENTENCE]);
			expect(edits).toEqual([]);
			document.body.replaceChildren();

			const none = render(BODY.replace('Active: yes', 'Active: no'), BROWN);
			expect(
				Array.from(none.el.querySelectorAll('.sheetsmith-stat-block-problem')).map((one) => one.textContent),
			).toEqual([SENTENCE]);
			expect(none.edits).toEqual([]);
		});

		it('reports a word the list holds only in another case, as the editor does', () => {
			// One predicate with two copies: this one and the editor select's
			// (`config-panel.test.ts`, the same `Green`), held together by this pair.
			const { el } = render(BODY, { tint: 'Green' });
			expect(
				Array.from(el.querySelectorAll('.sheetsmith-stat-block-problem')).map((one) => one.textContent),
			).toEqual(['"Green" is not a tint colour. Choose one under Tint in the layout editor.']);
			expect(tints(pushes(BODY, { tint: 'Green' }))).toEqual([undefined]);
		});

		it('names Default as the accent under Every form', () => {
			const { el } = render(BODY, BROWN);
			toLibrary(el);
			const select = el.querySelector<HTMLSelectElement>('.sheetsmith-stat-block-tint-choice');
			expect(select?.options[0]?.textContent).toBe('Default (accent)');
		});
	});

	it('refuses a field keyed Tint while Tint per record is on, in any case', () => {
		const keyed = (key: string, over: Partial<StatBlockConfig>) => ({
			...config,
			...over,
			fields: [...(config.fields ?? []), { key, type: 'text' as const }],
		});
		const result = statBlock.read(BODY, keyed('tint', TINTED));
		expect(result.ok ? null : result.error).toBe(
			'A field cannot be keyed "tint" while Tint per record is on, because that is where each record\'s tint is kept. Rename the field under Fields, or turn Tint per record off.',
		);
		expect(statBlock.read(BODY, keyed('Tint', { tint: 'green' })).ok).toBe(true);
	});

	describe('the Tint section under Every form', () => {
		const section = (el: HTMLElement) => {
			toLibrary(el);
			const detail = el.querySelector('.sheetsmith-stat-block-detail') as HTMLElement;
			return {
				detail,
				select: detail.querySelector<HTMLSelectElement>('.sheetsmith-stat-block-tint-choice') as HTMLSelectElement,
				swatch: detail.querySelector<HTMLElement>('.sheetsmith-stat-block-tint .sheetsmith-stat-block-tint-swatch'),
			};
		};

		it('sits after Picture and before the zones, naming the block colour as Default', () => {
			const { el } = render(BODY, { ...TINTED, image: true });
			const { detail, select, swatch } = section(el);
			const headings = Array.from(detail.querySelectorAll('.sheetsmith-stat-block-section-heading')).map(
				(one) => one.textContent,
			);
			expect(headings.slice(0, 2)).toEqual(['Picture', 'Tint']);
			expect(select.getAttribute('aria-label')).toBe('Brown Bear tint');
			expect(select.classList.contains('dropdown')).toBe(true);
			expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
				'Default (green)',
				'Accent',
				'Red',
				'Orange',
				'Yellow',
				'Green',
				'Cyan',
				'Blue',
				'Purple',
				'Pink',
			]);
			expect(select.value).toBe('');
			expect(select.hasAttribute('aria-invalid')).toBe(false);
			expect(select.hasAttribute('aria-describedby')).toBe(false);
			expect(swatch?.getAttribute('data-sheetsmith-tint')).toBe('green');
			expect(swatch?.getAttribute('aria-hidden')).toBe('true');
		});

		it('writes Orange, turns the swatch, and Default restores the record byte for byte', () => {
			const { el, edits } = render(BODY, TINTED);
			const { select, swatch } = section(el);
			choose(select, 'orange');
			expect(swatch?.getAttribute('data-sheetsmith-tint')).toBe('orange');
			const from = { ...config, ...TINTED };
			const written = applied(edits[0] as StatBlockData, BODY, from);
			expect(written).toBe(ORANGE_BEAR.replace('Tint: orange\nModifiers: abilities.STR = 4; armour_class = 11; skills.perception >= 3', 'Modifiers: abilities.STR = 4; armour_class = 11; skills.perception >= 3\nTint: orange'));
			document.body.replaceChildren();

			const again = render(written, TINTED);
			const opened = section(again.el);
			expect(opened.select.value).toBe('orange');
			choose(opened.select, '');
			expect(applied(again.edits[0] as StatBlockData, written, from)).toBe(BODY);
		});

		it('restores a CRLF note byte for byte', () => {
			const crlf = BODY.replace(/\n/g, '\r\n');
			const from = { ...config, ...TINTED };
			const set = applied({ records: {}, tints: { 0: 'yellow' } }, crlf, from);
			expect(set).toContain('Tint: yellow');
			expect(applied({ records: {}, tints: { 0: null } }, set, from)).toBe(crlf);
		});

		it('restores a record with no fence byte for byte, the fence it gained going with the tint', () => {
			const from = { ...config, ...TINTED };
			for (const body of [
				'\n### Thug\n\nSome prose.\n',
				'\n### Thug\nSome prose.\n',
				'\n### Thug\n',
				'\n### Thug\n\n### Wolf\n```sheet\nActive: no\n```\n',
			]) {
				const set = applied({ records: {}, tints: { 0: 'yellow' } }, body, from);
				expect(set, body).toContain('```sheet\nTint: yellow\n```');
				expect(applied({ records: {}, tints: { 0: null } }, set, from), body).toBe(body);
			}
		});

		it('keeps a fence that holds anything besides the tint', () => {
			const from = { ...config, ...TINTED };
			const body = '\n### Thug\n```sheet\nActive: no\nTint: red\n```\n';
			expect(applied({ records: {}, tints: { 0: null } }, body, from)).toBe('\n### Thug\n```sheet\nActive: no\n```\n');
		});

		it('is absent with the switch off, and a tint then writes nothing', () => {
			const { el } = render(ORANGE_BEAR, { tint: 'green' });
			toLibrary(el);
			expect(el.querySelector('.sheetsmith-stat-block-tint')).toBeNull();
			expect(applied({ records: {}, tints: { 0: 'yellow' } }, ORANGE_BEAR, { ...config, tint: 'green' })).toBe(
				ORANGE_BEAR,
			);
		});

		it('keeps an entry through an edit to another field, with the switch on or off', () => {
			const hand = ORANGE_BEAR.replace('Tint: orange', 'Tint: Green');
			for (const over of [TINTED, {}]) {
				const from = { ...config, ...over };
				const edited = applied({ records: { 0: { fields: { HP: '20 / 34' } } } }, hand, from);
				expect(edited).toBe(hand.replace('HP: 22 / 34', 'HP: 20 / 34'));
			}
		});
	});

	describe('a form Tint outside the list', () => {
		const BROWN_BEAR = ORANGE_BEAR.replace('Tint: orange', 'Tint: brown');

		it('tints in the block colour and says so under the head', () => {
			expect(tints(pushes(BROWN_BEAR, TINTED))).toEqual(['green']);
			const { el, edits } = render(BROWN_BEAR, TINTED);
			expect(
				Array.from(el.querySelectorAll('.sheetsmith-stat-block-problem')).map((one) => one.textContent),
			).toEqual(['"brown" is not a tint colour. Choose one under Every form, in Tint.']);
			expect(edits).toEqual([]);
		});

		it('names the form with two on', () => {
			const two = BROWN_BEAR.replace('Active: no', 'Active: yes');
			const { el } = render(two, TINTED);
			expect(
				Array.from(el.querySelectorAll('.sheetsmith-stat-block-problem')).map((one) => one.textContent),
			).toEqual(['Brown Bear: "brown" is not a tint colour. Choose one under Every form, in Tint.']);
		});

		it('holds the word as a disabled, selected first option under Every form, writing nothing', () => {
			const { el, edits } = render(BROWN_BEAR, TINTED);
			toLibrary(el);
			const detail = el.querySelector('.sheetsmith-stat-block-detail') as HTMLElement;
			const select = detail.querySelector<HTMLSelectElement>('.sheetsmith-stat-block-tint-choice') as HTMLSelectElement;
			const first = select.options[0];
			expect(first?.textContent).toBe('"brown" (not a tint colour)');
			expect(first?.disabled).toBe(true);
			expect(first?.selected).toBe(true);
			expect(detail.querySelector('.sheetsmith-stat-block-tint')?.textContent).toContain(
				'"brown" is not a tint colour. Choose one.',
			);
			expect(select.getAttribute('aria-invalid')).toBe('true');
			const described = el.ownerDocument.getElementById(select.getAttribute('aria-describedby') ?? '');
			expect(described?.textContent).toBe('"brown" is not a tint colour. Choose one.');
			expect(edits).toEqual([]);
			choose(select, 'yellow');
			expect(applied(edits[0] as StatBlockData, BROWN_BEAR, { ...config, ...TINTED })).toBe(
				ORANGE_BEAR.replace('Tint: orange', 'Tint: yellow'),
			);
		});
	});

	describe('the colour on the In play head\'s rule', () => {
		const headSwatches = (el: HTMLElement) =>
			el.querySelectorAll(
				'.sheetsmith-stat-block-play-head .sheetsmith-stat-block-tint-swatch, .sheetsmith-stat-block-form-name .sheetsmith-stat-block-tint-swatch',
			);
		const head = (el: HTMLElement) => el.querySelector('.sheetsmith-stat-block-play-head') as HTMLElement;
		const word = (el: Element | null) => el?.getAttribute('data-sheetsmith-tint') ?? null;

		it('draws no swatch in the head or a name row, in any state', () => {
			const two = ORANGE_BEAR.replace('Active: no', 'Active: yes');
			const none = BODY.replace('Active: yes', 'Active: no');
			for (const [body, over] of [
				[ORANGE_BEAR, TINTED],
				[BODY, { tint: 'red' }],
				[BODY, {}],
				[two, TINTED],
				[none, TINTED],
			] as const) {
				expect(headSwatches(render(body, over).el)).toHaveLength(0);
				document.body.replaceChildren();
			}
		});

		it('stamps the one form\'s colour on the head, its own Tint, else the block\'s, else the accent', () => {
			expect(word(head(render(ORANGE_BEAR, TINTED).el))).toBe('orange');
			expect(word(head(render(BODY, TINTED).el))).toBe('green');
			// The accent too, where the layout chose nothing: the boxes tint in it.
			expect(word(head(render(BODY).el))).toBe('accent');
		});

		it('stamps each form row with its own colour with two on, and leaves the head plain', () => {
			const two = ORANGE_BEAR.replace('Active: no', 'Active: yes');
			const { el } = render(two, TINTED);
			expect(word(head(el))).toBeNull();
			expect(Array.from(el.querySelectorAll('.sheetsmith-stat-block-form-name')).map(word)).toEqual([
				'orange',
				'green',
			]);
		});

		it('leaves the head plain with no form on', () => {
			expect(word(head(render(BODY.replace('Active: yes', 'Active: no'), TINTED).el))).toBeNull();
		});

		it('stamps nothing on the uses rings or the picker, which stay the accent', () => {
			const { el } = render(ORANGE_BEAR, TINTED);
			for (const inside of Array.from(head(el).querySelectorAll('*'))) {
				expect(inside.hasAttribute('data-sheetsmith-tint'), inside.className).toBe(false);
			}
		});
	});
});

/*
 * The briefs (`docs/features/stat-block-in-play-polish.md` §4): with no form on,
 * In play offers each readable form as a button whose press is the picker's
 * own write.
 */
describe('the briefs with no form on', () => {
	const NONE = BODY.replace('Active: yes', 'Active: no');
	const briefs = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLButtonElement>('.sheetsmith-stat-block-brief'));
	const nameOf = (button: HTMLElement) =>
		button.ownerDocument.getElementById(button.getAttribute('aria-labelledby') ?? '')?.textContent ?? null;

	it('draws one brief per readable form in file order, each its name, its tiles read-only and its changes', () => {
		const { el } = render(NONE);
		const found = briefs(el);
		expect(found.map(nameOf)).toEqual(['Brown Bear', 'Wolf']);
		// Under the head and its sentence, which stay as they were.
		expect(el.textContent).toContain('No form is active. Choosing one spends a use.');
		expect(el.querySelector('.sheetsmith-stat-block-revert')).toBeNull();
		expect(picker(el).value).toBe('');
		const bear = found[0] as HTMLButtonElement;
		// In play's fields as pairs: every field but the picker's toggle and the
		// modifier field, a label over its value, and no tile among them.
		const pairs = Array.from(bear.querySelectorAll('.sheetsmith-stat-block-brief-stats > .sheetsmith-stat-block-brief-stat'));
		expect(pairs.map((pair) => pair.querySelector('.sheetsmith-stat-block-brief-stat-label')?.textContent)).toEqual(['HP', 'Speed']);
		expect(pairs.map((pair) => pair.querySelector('.sheetsmith-stat-block-brief-stat-value')?.textContent)).toEqual([
			'22/34',
			'40 ft., climb 30 ft.',
		]);
		expect(bear.querySelector('.sheetsmith-stat-block-vital, .sheetsmith-component-label')).toBeNull();
		// The ceiling compact and run in, as the closed line says it, not In play's spaced reading.
		const hp = pairs[0]?.querySelector('.sheetsmith-stat-block-brief-stat-value');
		expect(Array.from(hp?.children ?? []).map((one) => [one.className, one.textContent])).toEqual([
			['sheetsmith-stat-block-reading', '22'],
			['sheetsmith-stat-block-brief-ceiling', '/34'],
		]);
		expect(bear.querySelector('.sheetsmith-pool-ceiling')).toBeNull();
		// Described by what the tiles and the changes say, the tiles as words.
		const described = (bear.getAttribute('aria-describedby') ?? '').split(' ').map((id) => el.ownerDocument.getElementById(id)?.textContent);
		expect(described).toEqual([
			'HP 22/34 · Speed 40 ft., climb 30 ft.',
			'abilities.STR = 4 · armour_class = 11 · skills.perception >= 3',
		]);
	});

	it('reads, and edits nothing: no field, no stepper, no ring control, only spans inside the button', () => {
		const flying = NONE.replace('HP: 22 / 34', 'HP: 22 / 34\nFlying: yes');
		const fields = [...(config.fields ?? []), { key: 'Flying', type: 'toggle' as const }];
		const { el, edits } = render(flying, { fields });
		const bear = briefs(el)[0] as HTMLButtonElement;
		expect(bear.querySelectorAll('input, textarea, select, button')).toHaveLength(0);
		expect(bear.querySelector('.sheetsmith-stat-block-step')).toBeNull();
		expect(bear.querySelectorAll('div')).toHaveLength(0);
		// A toggle field is its ring, painted on and hidden, its reading in the words.
		const ring = bear.querySelector<HTMLElement>('.sheetsmith-stat-block-brief-stat.sheetsmith-stat-block-vital-toggle .sheetsmith-level-ring');
		expect(ring?.tagName).toBe('SPAN');
		expect(ring?.getAttribute('aria-hidden')).toBe('true');
		expect(ring?.hasAttribute('aria-pressed')).toBe(false);
		const twin = el.ownerDocument.getElementById((bear.getAttribute('aria-describedby') ?? '').split(' ')[0] ?? '');
		expect(twin?.textContent).toBe('HP 22/34 · Speed 40 ft., climb 30 ft. · Flying on');
		ring?.click();
		expect(edits).toHaveLength(1);
		// The press is the brief's: it chooses the form, and writes no field.
		expect(edits[0]?.records[0]?.fields).toEqual({ Active: 'yes' });
	});

	it('says the changes and the set numbers as In play says them for the same form', () => {
		const modifiers = modifierContext();
		const labelled = {
			...modifiers,
			outcomes: (part: string, row: Parameters<typeof modifiers.outcomes>[1]) =>
				modifiers.outcomes(part, row).map((outcome) => ({
					...outcome,
					targetLabel: outcome.target === 'armour_class' ? 'Armour class' : `Skills · ${outcome.target}`,
				})),
		};
		const { el } = render(NONE, {}, { modifiers: labelled });
		const bear = briefs(el)[0] as HTMLButtonElement;
		const brief = bear.querySelector('.sheetsmith-stat-block-brief-changes')?.textContent;
		const set = Array.from(bear.querySelectorAll('.sheetsmith-stat-block-vital-set')).map((tile) => tile.textContent);
		document.body.replaceChildren();
		const play = render(BODY, {}, { modifiers: labelled }).el;
		const items = Array.from(play.querySelectorAll('.sheetsmith-stat-block-change-item')).map((one) => one.textContent);
		expect(brief).toBe(items.join(' · '));
		expect(brief).not.toBe('');
		expect(set).toEqual(
			Array.from(play.querySelectorAll('.sheetsmith-stat-block-vital-set')).map((tile) => tile.textContent),
		);
		expect(set).toEqual(['Armour class11']);
	});

	it('says what a form changes without In play\'s reasons, since a form that is off applies nothing yet', () => {
		const modifiers = modifierContext();
		const idle = {
			...modifiers,
			outcomes: (part: string, row: Parameters<typeof modifiers.outcomes>[1]) =>
				modifiers.outcomes(part, row).map((outcome) => ({
					...outcome,
					targetLabel: outcome.target === 'armour_class' ? 'Armour class' : `Skills · ${outcome.target}`,
					applies: false,
					suppressed: 'a higher override applies',
				})),
		};
		const bear = briefs(render(NONE, {}, { modifiers: idle }).el)[0] as HTMLButtonElement;
		expect(bear.querySelector('.sheetsmith-stat-block-brief-changes')?.textContent).not.toContain('(');
		expect(bear.querySelector('.sheetsmith-stat-block-vital-set')?.textContent).toBe('Armour class11');
		expect(bear.querySelector('.sheetsmith-stat-block-change-idle')).toBeNull();
	});

	it('leaves out a field with no value, which In play keeps with its dash', () => {
		const blank = NONE.replace('Speed: 40 ft.\n', 'Speed:\n').replace('HP: 11 / 11', 'HP: / 11');
		const { el } = render(blank);
		const wolf = briefs(el)[1] as HTMLButtonElement;
		expect(
			Array.from(wolf.querySelectorAll('.sheetsmith-stat-block-brief-stat-label')).map((one) => one.textContent),
		).toEqual([]);
		expect(wolf.querySelector('.sheetsmith-stat-block-brief-stats')).toBeNull();
		// The Bear, whose fields hold values, keeps its pairs.
		const bear = briefs(el)[0] as HTMLButtonElement;
		expect(bear.querySelectorAll('.sheetsmith-stat-block-brief-stat')).toHaveLength(2);
		document.body.replaceChildren();
		// In play draws the Wolf's Speed and HP tiles, the dash in the text one.
		const play = render(blank.replace('### Wolf\n```sheet\nActive: no', '### Wolf\n```sheet\nActive: yes')).el;
		const tiles = Array.from(play.querySelectorAll('.sheetsmith-stat-block-vital')).map(
			(tile) => tile.querySelector('.sheetsmith-stat-block-vital-label')?.textContent,
		);
		expect(tiles).toEqual(['HP', 'Speed']);
		expect(play.querySelector('.sheetsmith-stat-block-vital-text .sheetsmith-stat-block-vital-value')?.textContent).toBe('—');
	});

	it('keeps a toggle that is off, which is a value', () => {
		const fields = [...(config.fields ?? []), { key: 'Flying', type: 'toggle' as const }];
		const bear = briefs(render(NONE, { fields }).el)[0] as HTMLButtonElement;
		expect(
			Array.from(bear.querySelectorAll('.sheetsmith-stat-block-brief-stat-label')).map((one) => one.textContent),
		).toEqual(['HP', 'Speed', 'Flying']);
	});

	it('draws no tile row, no changes line and no description for a form that has neither', () => {
		const fields = [
			{ key: 'Active', type: 'toggle' as const },
			{ key: 'Modifiers', type: 'modifier' as const },
		];
		const { el } = render('\n### Lone\n```sheet\nActive: no\n```\n', { fields, uses: '' });
		const [lone] = briefs(el);
		expect(nameOf(lone as HTMLElement)).toBe('Lone');
		expect(lone?.hasAttribute('aria-describedby')).toBe(false);
		expect(lone?.querySelector('.sheetsmith-stat-block-brief-stats')).toBeNull();
		expect(lone?.querySelector('.sheetsmith-stat-block-brief-changes')).toBeNull();
	});

	it('switches and spends nothing at no uses left', () => {
		const empty = NONE.replace('uses: 1', 'uses: 0');
		const { el, edits } = render(empty);
		briefs(el)[0]?.click();
		expect(edits).toHaveLength(1);
		expect(edits[0]?.uses).toBeUndefined();
		expect(el.textContent).toContain('Brown Bear active, no uses left');
		document.body.replaceChildren();
	});

	it('is a named list of buttons, named by the form and described by its summary, between the picker and Every form', () => {
		const { el } = render(NONE);
		const list = el.querySelector('.sheetsmith-stat-block-briefs') as HTMLElement;
		expect(list.tagName).toBe('UL');
		expect(list.getAttribute('aria-label')).toBe('Wild Shape: choose a form');
		for (const button of briefs(el)) {
			expect(button.tagName).toBe('BUTTON');
			expect(button.type).toBe('button');
			expect(button.parentElement?.tagName).toBe('LI');
		}
		const stops = Array.from(el.querySelectorAll<HTMLElement>('button, select, [tabindex="0"]'));
		const at = (target: Element | null) => stops.indexOf(target as HTMLElement);
		const every = el.querySelector('.sheetsmith-stat-block-switch');
		const order = [picker(el), ...briefs(el), every].map(at);
		expect(order.every((index) => index >= 0)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
		// Nothing focusable sits between them.
		expect(order[order.length - 1]! - order[0]!).toBe(order.length - 1);
	});

	it('stamps each brief with its form\'s colour: its own Tint, else the block\'s, else the accent', () => {
		const tinted = { tint: 'green', tintPerRecord: true } as const;
		const own = NONE.replace('Modifiers: abilities.STR = 4;', 'Tint: orange\nModifiers: abilities.STR = 4;');
		const word = (el: HTMLElement) => briefs(el).map((one) => one.getAttribute('data-sheetsmith-tint'));
		expect(word(render(own, tinted).el)).toEqual(['orange', 'green']);
		expect(word(render(NONE).el)).toEqual(['accent', 'accent']);
		// The switch off: the entry is ignored, as the head would ignore it.
		expect(word(render(own, { tint: 'green' }).el)).toEqual(['green', 'green']);
	});

	it('draws a thumbnail where the layout draws pictures and the form holds one, and none where it will not draw', () => {
		const resource = (target: string) => (target === 'Brown bear.png' ? 'app://bear.png' : null);
		const none = BEAR.replace('Active: yes', 'Active: no');
		const { el } = zoned(none, {}, { resource });
		const [bear, mook] = briefs(el);
		expect(bear?.querySelector('.sheetsmith-stat-block-brief-thumb img')?.getAttribute('src')).toBe('app://bear.png');
		expect(bear?.querySelector('img')?.getAttribute('alt')).toBe('');
		expect(mook?.querySelector('.sheetsmith-stat-block-brief-thumb')).toBeNull();
		document.body.replaceChildren();
		// A file the vault does not hold: no thumbnail, and no sentence here.
		const lost = zoned(none, {}, { resource: () => null });
		expect(lost.el.querySelector('.sheetsmith-stat-block-brief-thumb')).toBeNull();
		expect(lost.el.querySelector('.sheetsmith-stat-block-problem')).toBeNull();
		document.body.replaceChildren();
		expect(zoned(none, { image: false }, { resource }).el.querySelector('.sheetsmith-stat-block-brief-thumb')).toBeNull();
	});

	it('leaves out a form whose fence will not read, and draws no list where none reads', () => {
		const broken = NONE.replace('Active: no\nHP: 11 / 11', 'Active no\nHP: 11 / 11');
		const one = render(broken);
		expect(briefs(one.el).map(nameOf)).toEqual(['Brown Bear']);
		document.body.replaceChildren();
		const neither = render(broken.replace('Active: no\nHP: 22 / 34', 'Active no\nHP: 22 / 34'));
		expect(neither.el.querySelector('.sheetsmith-stat-block-briefs')).toBeNull();
	});

	it('draws none while a form is on, with two on, with no forms, or on a companion block', () => {
		expect(briefs(render(BODY).el)).toEqual([]);
		expect(briefs(render(BODY.replace('Active: no', 'Active: yes')).el)).toEqual([]);
		const empty = render('\n```sheet\nuses: 1\n```\n');
		expect(briefs(empty.el)).toEqual([]);
		expect(empty.el.textContent).toContain('No forms yet.');
		expect(empty.el.querySelector('.sheetsmith-stat-block-action')?.textContent).toBe('Add form');
		expect(briefs(render(NONE, { exclusive: '' }).el)).toEqual([]);
	});
});
