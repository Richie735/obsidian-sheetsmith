// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { IdRenamed, renameComponentId } from './id-rename';
import { Layout, parseLayout, serialiseLayout } from '../parse/layout';
import { ComponentConfig } from '../types';
import { walkLayout } from '../view/grid-cells';

/*
 * The edit an **Id** commit makes, decided on a clone over layouts built here
 * (`docs/features/component-id-rename.md` §2). The pane's side — the field, the
 * posture, the undo step and the notice — is driven through the real pane in
 * `layout-editor.test.ts`, and the notes report in `id-rename-report.test.ts`.
 */

function at(col: number, row: number, width = 2, height = 1) {
	return { col, row, width, height };
}

function card(id: string, label: string, extra: Record<string, unknown> = {}): ComponentConfig {
	return { id, type: 'card', label, position: at(1, 1), ...extra };
}

/** The issue's own shape: a Pool still carrying its default id, and what reads it. */
function sheet(extra: Partial<Layout> = {}): Layout {
	return {
		name: 'Id renames',
		columns: 12,
		components: [
			card('level', 'Level'),
			card('prof', 'Proficiency', { derived: 'ceil(level / 4) + 1' }),
			{
				id: 'pool',
				type: 'pool',
				label: 'HP',
				position: at(1, 2),
				max: 'level * 8 + mod.pool',
			} as ComponentConfig,
			{
				id: 'inventory',
				type: 'table',
				label: 'Inventory',
				position: at(1, 3, 6, 2),
				rowHeader: 'Item',
				openRows: true,
				columns: [
					{ key: 'Weight', type: 'number' },
					{ key: 'Qty', type: 'number' },
					{ key: 'Effect', type: 'modifier' },
					{ key: 'Burden', type: 'computed', formula: 'Weight * Qty + level' },
				],
			} as ComponentConfig,
		],
		functions: ['tier(x) = x + level', 'scale(prof) = prof * 2', 'bulk = sum(inventory, Qty * prof)'],
		modifiers: [
			{ name: 'Ring of vigour', target: 'pool', amount: 'prof', when: 'level >= 3' },
		],
		promotedFields: [{ name: 'pool', property: 'hp' }],
		...extra,
	};
}

function renamed(layout: Layout, from: string, to: string): IdRenamed {
	const result = renameComponentId(layout, from, to);
	if ('error' in result) throw new Error(result.error);
	return result;
}

function refusal(layout: Layout, from: string, to: string): string {
	const result = renameComponentId(layout, from, to);
	if (!('error' in result)) throw new Error(`renamed "${from}" to "${to}"`);
	return result.error;
}

function component(layout: Layout, id: string): Record<string, unknown> {
	const found = walkLayout(layout.components).find((entry) => entry.config.id === id);
	if (found === undefined) throw new Error(`no component "${id}"`);
	return found.config as unknown as Record<string, unknown>;
}

describe('renameComponentId: the rewrite', () => {
	it('renames the component and rewrites every site that reads it, counting fields', () => {
		const { layout, places } = renamed(sheet(), 'pool', 'hp');
		expect(component(layout, 'hp').label).toBe('HP');
		expect(component(layout, 'hp').max).toBe('level * 8 + mod.hp');
		expect(layout.modifiers?.[0]?.target).toBe('hp');
		expect(layout.promotedFields?.[0]?.name).toBe('hp');
		// The walkthrough's count: the max, the target and the promoted name.
		expect(places).toBe(3);
	});

	it('rewrites a component formula, a reset to and a reset where', () => {
		const layout = sheet({
			components: [
				card('level', 'Level'),
				{
					id: 'features',
					type: 'record-set',
					label: 'Features',
					position: at(1, 2, 6, 3),
					recordName: 'Feature',
					fields: [{ key: 'Uses', type: 'number', max: 3 }],
					reset: [{ trigger: 'Long rest', action: 'formula', to: 'level', where: 'level > 2' }],
				} as ComponentConfig,
				card('total', 'Total', { derived: 'level + 1' }),
			],
			triggers: ['Long rest'],
			functions: [],
			modifiers: [],
			promotedFields: [],
		});
		const { layout: after, places } = renamed(layout, 'level', 'lvl');
		expect(component(after, 'total').derived).toBe('lvl + 1');
		expect(component(after, 'features').reset).toEqual([
			{ trigger: 'Long rest', action: 'formula', to: 'lvl', where: 'lvl > 2' },
		]);
		expect(places).toBe(3);
	});

	it('rewrites a definition’s target, amount and condition, and a changes list’s target and amount', () => {
		const layout = sheet({
			modifiers: [
				{ name: 'Ring of vigour', target: 'pool', amount: 'prof', when: 'level >= 3' },
				{
					name: 'Blessing',
					changes: [
						{ target: 'prof', amount: '1' },
						{ target: 'pool', amount: 'prof * 2' },
					],
				},
			],
		});
		const { layout: after } = renamed(layout, 'prof', 'proficiency');
		expect(after.modifiers?.[0]).toEqual({
			name: 'Ring of vigour',
			target: 'pool',
			amount: 'proficiency',
			when: 'level >= 3',
		});
		expect(after.modifiers?.[1]?.changes).toEqual([
			{ target: 'proficiency', amount: '1' },
			{ target: 'pool', amount: 'proficiency * 2' },
		]);
		expect(renamed(layout, 'level', 'lvl').layout.modifiers?.[0]?.when).toBe('lvl >= 3');
	});

	it('rewrites a function body, keeping a parameter spelled like the old id', () => {
		const { layout } = renamed(sheet(), 'prof', 'proficiency');
		expect(layout.functions).toEqual([
			'tier(x) = x + level',
			// The parameter is nearer than the sheet, so this body never read the card.
			'scale(prof) = prof * 2',
			'bulk = sum(inventory, Qty * proficiency)',
		]);
	});

	it('touches only component references', () => {
		const layout = sheet({
			components: [
				card('hp', 'HP'),
				card('hp_max', 'HP max'),
				{
					id: 'rolls',
					type: 'table',
					label: 'Rolls',
					position: at(1, 2, 6, 2),
					rowHeader: 'Roll',
					openRows: true,
					columns: [
						{ key: 'hp', type: 'number' },
						{ key: 'Out', type: 'computed', formula: 'hp + mod.self' },
					],
				} as ComponentConfig,
				card('sum_card', 'Sum', { derived: 'hp_max + hp + mod.hp + sum(hp, 1) + count(rolls)' }),
			],
			functions: [],
			modifiers: [],
			promotedFields: [],
		});
		const { layout: after } = renamed(layout, 'hp', 'health');
		expect(component(after, 'sum_card').derived).toBe(
			'hp_max + health + mod.health + sum(health, 1) + count(rolls)',
		);
		// A column spelled like the id is the row's own name inside its table.
		const columns = component(after, 'rolls').columns as { formula?: string }[];
		expect(columns[1]?.formula).toBe('hp + mod.self');
	});

	it('leaves a function’s name, a reset’s trigger and column, a note, unknown keys and an unparseable formula byte for byte', () => {
		const layout = sheet({
			components: [
				card('level', 'Level', { derived: 'level $ 2', custom: 'level' }),
				{
					id: 'spells',
					type: 'table',
					label: 'Spells',
					position: at(1, 2, 6, 2),
					rowHeader: 'Spell',
					columns: [{ key: 'level', type: 'number' }],
					reset: [{ trigger: 'level', column: 'level', action: 'empty' }],
				} as ComponentConfig,
			],
			functions: ['level2 = 2', 'level = 3'],
			triggers: ['level'],
			modifiers: [{ name: 'Boost', target: 'spells.level', amount: '1', note: 'level up' }],
			promotedFields: [],
			mystery: 'level',
		});
		const { layout: after } = renamed(layout, 'level', 'lvl');
		expect(component(after, 'lvl').derived).toBe('level $ 2');
		expect(component(after, 'lvl').custom).toBe('level');
		expect(component(after, 'spells').reset).toEqual([
			{ trigger: 'level', column: 'level', action: 'empty' },
		]);
		expect(after.functions).toEqual(['level2 = 2', 'level = 3']);
		expect(after.modifiers?.[0]?.note).toBe('level up');
		expect(after.mystery).toBe('level');
	});

	it('works on a clone, leaving the layout it was handed as it was', () => {
		const layout = sheet();
		const before = serialiseLayout(layout);
		renamed(layout, 'pool', 'hp');
		expect(serialiseLayout(layout)).toBe(before);
	});

	it('renames a component that nothing reads, rewriting nothing', () => {
		// `bulk` walks it, so the one place is the function.
		expect(renamed(sheet(), 'inventory', 'bag').places).toBe(1);
		const lone = renamed(
			sheet({ components: [card('lone', 'Lone')], functions: [], modifiers: [], promotedFields: [] }),
			'lone',
			'single',
		);
		expect(lone.places).toBe(0);
		expect(component(lone.layout, 'single').label).toBe('Lone');
	});

	it('renames an id inside a container', () => {
		const layout = sheet({
			components: [
				{
					id: 'group',
					type: 'group',
					label: 'Group',
					position: at(1, 1, 6, 2),
					children: [card('level', 'Level')],
				},
				card('total', 'Total', { derived: 'level * 2' }),
			],
			functions: [],
			modifiers: [],
			promotedFields: [],
		});
		const { layout: after } = renamed(layout, 'level', 'lvl');
		expect(component(after, 'lvl').label).toBe('Level');
		expect(component(after, 'total').derived).toBe('lvl * 2');
		expect(() => parseLayout(serialiseLayout(after))).not.toThrow();
	});
});

describe('renameComponentId: the parser’s rules', () => {
	for (const [to, sentence] of [
		['', 'An id is required.'],
		['   ', 'An id is required.'],
		['armour-class', 'An id is letters, digits and underscores, and does not start with a digit.'],
		['2nd', 'An id is letters, digits and underscores, and does not start with a digit.'],
		['mod', '"mod" is where modifier slots live, so a component cannot use it.'],
		['self', '"self" means a roster\'s own rows, so a component cannot use it.'],
		['true', '"true" is a value, so formulas reading it would never reach this component.'],
		['false', '"false" is a value, so formulas reading it would never reach this component.'],
		['prof', '"prof" is already another component\'s id.'],
	] as const) {
		it(`refuses "${to}"`, () => {
			expect(refusal(sheet(), 'level', to)).toBe(sentence);
		});
	}

	it('refuses an id a container’s child already holds', () => {
		const layout = sheet({
			components: [
				{
					id: 'group',
					type: 'group',
					label: 'Group',
					position: at(1, 1, 6, 2),
					children: [card('inner', 'Inner')],
				},
				card('outer', 'Outer'),
			],
			functions: [],
			modifiers: [],
			promotedFields: [],
		});
		expect(refusal(layout, 'outer', 'inner')).toBe('"inner" is already another component\'s id.');
	});
});

describe('renameComponentId: capture', () => {
	it('refuses a new id a function parameter would shadow, naming the function', () => {
		expect(refusal(sheet(), 'level', 'x')).toBe(
			'"x" is a parameter of tier(), which reads "level", so that read would stop reaching this component.',
		);
	});

	it('refuses a new id a component’s own name would shadow, naming the component', () => {
		expect(refusal(sheet(), 'level', 'Qty')).toBe(
			'Inventory reads "Qty" as one of its own names, so its formula reading "level" would stop reaching this component.',
		);
	});

	it('refuses a zero-parameter function that some expression reads bare', () => {
		const layout = sheet({ functions: ['bonus = 2'] });
		layout.components.push(card('total', 'Total', { derived: 'bonus + 1' }));
		expect(refusal(layout, 'level', 'bonus')).toBe(
			'"bonus" is a function this layout defines, so every formula reading it would read this component instead.',
		);
		// Read by nothing, it captures nothing, so the rename stands.
		expect(renamed(sheet({ functions: ['bonus = 2'] }), 'level', 'bonus').layout.functions).toEqual([
			'bonus = 2',
		]);
		// A function with parameters is a call, which no component answers.
		const called = sheet({ functions: ['bonus(a) = a'] });
		called.components.push(card('total', 'Total', { derived: 'bonus(1)' }));
		expect('error' in renameComponentId(called, 'level', 'bonus')).toBe(false);
	});
});

describe('renameComponentId: per-row arguments (point 3, A)', () => {
	/** A sheet whose Load card adds up a column spelled like a component. */
	function levelled(): Layout {
		return {
			name: 'Levelled',
			components: [
				card('level', 'Level'),
				{
					id: 'inventory',
					type: 'table',
					label: 'Inventory',
					position: at(1, 2, 6, 2),
					rowHeader: 'Item',
					openRows: true,
					columns: [{ key: 'level', type: 'number' }],
				} as ComponentConfig,
				card('load', 'Load', { derived: 'sum(inventory, level)' }),
			],
		};
	}

	it('refuses renaming a component whose id the walked rows answer', () => {
		expect(refusal(levelled(), 'level', 'lvl')).toBe(
			'"level" is also a column on Inventory, and sum(inventory, …) in Load reads it from each row, so this rename cannot tell which one it means. Rename that column first, or the component to something else.',
		);
	});

	it('refuses a new id the walked rows answer', () => {
		expect(refusal(sheet(), 'prof', 'Qty')).toBe(
			'"Qty" is also a column on Inventory, and sum(inventory, …) in bulk reads it from each row, so this rename cannot tell which one it means. Rename that column first, or the component to something else.',
		);
	});

	it('names the call that walks the rows, beside another call over the same table', () => {
		const layout = levelled();
		layout.components.push(
			card('mixed', 'Mixed', { derived: 'count(inventory, level > 1) + sum(inventory, level)' }),
		);
		layout.components = layout.components.filter((config) => config.id !== 'load');
		expect(refusal(layout, 'level', 'lvl')).toContain('and count(inventory, …) in Mixed');
		const summed = levelled();
		summed.components = summed.components.map((config) =>
			config.id === 'load'
				? card('load', 'Load', { derived: 'count(inventory) + sum(inventory, level)' })
				: config,
		);
		expect(refusal(summed, 'level', 'lvl')).toContain('and sum(inventory, …) in Load');
	});

	it('renames freely where neither id is a name the rows answer', () => {
		expect(renamed(sheet(), 'prof', 'proficiency').layout.functions?.[2]).toBe(
			'bulk = sum(inventory, Qty * proficiency)',
		);
	});

	it('refuses at a definition’s amount or condition, for every component that can enrol', () => {
		const amount = sheet({
			functions: [],
			modifiers: [{ name: 'Weighed', target: 'pool', amount: 'prof' }],
		});
		expect(refusal(amount, 'prof', 'Weight')).toBe(
			'"Weight" is also a column on Inventory, and the modifier "Weighed" reads it from each row that enrols in it, so this rename cannot tell which one it means. Rename that column first, or the component to something else.',
		);
		// A Record set's entries are fields, and the sentence uses its word.
		const records = sheet({
			functions: [],
			modifiers: [{ name: 'Weighed', target: 'pool', amount: 'prof' }],
		});
		records.components.push({
			id: 'features',
			type: 'record-set',
			label: 'Features',
			position: at(1, 5, 6, 3),
			recordName: 'Feature',
			fields: [{ key: 'Uses', type: 'number' }],
		} as ComponentConfig);
		expect(refusal(records, 'prof', 'Uses')).toBe(
			'"Uses" is also a field on Features, and the modifier "Weighed" reads it from each row that enrols in it, so this rename cannot tell which one it means. Rename that field first, or the component to something else.',
		);
		const when = sheet({
			functions: [],
			modifiers: [{ name: 'Heavy', target: 'pool', amount: '1', when: 'Qty > 2' }],
			components: [
				...sheet().components.filter((config) => config.id !== 'level'),
				card('Qty', 'Quantity'),
			],
		});
		// Burden reads `level`, which this layout no longer has, so it renames
		// nothing there; the condition is what the rows might answer.
		expect(refusal(when, 'Qty', 'quantity')).toContain(
			'"Qty" is also a column on Inventory, and the modifier "Heavy" reads it from each row that enrols in it',
		);
	});
});
