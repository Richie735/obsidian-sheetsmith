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
	actions: [
		{ key: 'Bonus', type: 'number' },
		{ key: 'Damage', type: 'text' },
	],
	actionName: 'Attack',
	bodyName: 'Traits',
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
		expect(data.records[0]?.actions).toEqual([
			['Bite', '6', '1d8+4 piercing'],
			['Claws', '6', '2d6+4 slashing'],
		]);
		expect(data.records[0]?.body).toBe(
			'Keen Smell. The bear has advantage on Wisdom (Perception) checks that rely on smell.',
		);
	});

	it('reads a table further down the prose as prose', () => {
		const body = BODY.replace(
			'\n| Attack | Bonus | Damage |',
			'\nA line before.\n\n| Attack | Bonus | Damage |',
		);
		const data = read(body);
		expect(data.records[0]?.actions).toBeUndefined();
		expect(data.records[0]?.body).toContain('| Bite | 6 |');
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
	it('says so in the error colour and the sentence, and stays active', () => {
		const body = BODY.replace('HP: 22 / 34', 'HP: 0 / 34');
		const { el, edits } = render(body);
		const line = el.querySelector('.sheetsmith-stat-block-down');
		expect(line).not.toBeNull();
		expect(el.textContent).toContain('At 0. Carry any leftover damage over by hand.');
		expect(edits).toHaveLength(0);
		expect(read(body).records[0]?.fields?.Active).toBe('yes');
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
			actionEdits: { 0: { rows: { 1: { Bonus: '7' } } } },
		});
		expect(written).toBe(BODY.replace('| Claws | 6 |', '| Claws | 7 |'));
	});

	it('inserts the header row and a first row at the head of a body with none', () => {
		const written = applied({
			records: {},
			actionEdits: { 1: { added: [{ Attack: 'Bite', Bonus: '4', Damage: '2d4+2 piercing' }] } },
		});
		expect(written).toContain(
			'Modifiers: abilities.DEX = 2; skills.stealth >= 4\n```\n\n| Attack | Bonus | Damage |\n|---|---|---|\n| Bite | 4 | 2d4+2 piercing |\n',
		);
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

	it('hides a column heading that repeats its section heading, for sight only', () => {
		const heads = (root: HTMLElement): HTMLElement[] =>
			Array.from(root.querySelectorAll<HTMLElement>('.sheetsmith-stat-block-table thead th'));
		const { el } = render();
		toLibrary(el);
		// *Attack* under **Attack**: kept for a screen reader, hidden from sight.
		const [name, bonus, damage] = heads(el);
		expect(name?.querySelector('.sheetsmith-sr-only')?.textContent).toBe('Attack');
		expect(bonus?.textContent).toBe('Bonus');
		expect(bonus?.querySelector('.sheetsmith-sr-only')).toBeNull();
		expect(damage?.querySelector('.sheetsmith-sr-only')).toBeNull();

		// By what it says, not by being the name column: a section a layout heads
		// differently shows it, and a column that says the section's word hides.
		document.body.replaceChildren();
		const renamed = render(BODY, { sections: [{ key: 'actions', name: 'Bonus' }] });
		toLibrary(renamed.el);
		const [again, repeated] = heads(renamed.el);
		expect(again?.querySelector('.sheetsmith-sr-only')).toBeNull();
		expect(again?.textContent).toBe('Attack');
		expect(repeated?.querySelector('.sheetsmith-sr-only')?.textContent).toBe('Bonus');
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
		// The name column's heading repeats the section's, so it is spoken only.
		expect(table?.querySelector('thead th .sheetsmith-sr-only')?.textContent).toBe('Attack');
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

	it('says None yet in play when every row is a placeholder', () => {
		const body = BODY.replace(/\| Bite[^\n]*\n\| Claws[^\n]*/, '| Attack | | |');
		const { el } = render(body);
		expect(el.querySelector('.sheetsmith-stat-block-table')).toBeNull();
		expect(el.textContent).toContain('None yet. Add them under Every form.');
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

	it('refuses an action column keyed like the action name', () => {
		expect(refused({ actions: [{ key: 'attack' }] })).toContain('same heading');
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

	it('moves a prose disclosure up with its record', () => {
		const first = render(BODY, companion);
		const disclosures = () =>
			Array.from(document.querySelectorAll<HTMLButtonElement>('.sheetsmith-stat-block-disclosure'));
		disclosures()[1]?.click();
		const remove = first.el.querySelectorAll<HTMLButtonElement>('.sheetsmith-record-remove')[0] as HTMLButtonElement;
		remove.click();
		remove.click();
		document.body.replaceChildren();
		const after = applied(first.edits[0] as StatBlockData, BODY, { ...config, ...companion });
		render(after, companion);
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

describe('the sections a layout orders', () => {
	it('draws the parts in the order the layout lists, under its headings', () => {
		const { el } = render(BODY, {
			sections: [
				{ key: 'traits', name: 'Lore' },
				{ key: 'actions', name: 'Attacks' },
			],
		});
		const form = el.querySelector('.sheetsmith-stat-block-form') as HTMLElement;
		const headings = Array.from(form.querySelectorAll('.sheetsmith-stat-block-section-heading')).map(
			(one) => one.textContent,
		);
		// The two listed first, then the unlisted ones in the default order: the
		// vitals take no heading by default, so the modifiers' name comes next.
		expect(headings).toEqual(['Lore', 'Attacks', 'Modifiers']);
	});

	it('draws today\'s order with no list', () => {
		const { el } = render();
		const form = el.querySelector('.sheetsmith-stat-block-form') as HTMLElement;
		const headings = Array.from(form.querySelectorAll('.sheetsmith-stat-block-section-heading')).map(
			(one) => one.textContent,
		);
		expect(headings).toEqual(['Modifiers', 'Attack', 'Traits']);
		expect(form.firstElementChild?.classList.contains('sheetsmith-stat-block-vitals')).toBe(true);
	});

	it('refuses a section it does not draw', () => {
		expect(statBlock.read(BODY, { ...config, sections: [{ key: 'spells' }] }).ok).toBe(false);
	});

	it('refuses a section listed twice', () => {
		expect(
			statBlock.read(BODY, { ...config, sections: [{ key: 'traits' }, { key: 'Traits' }] }).ok,
		).toBe(false);
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
