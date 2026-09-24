// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { getComponent, listComponentTypes } from '../components';
import { canReparent } from './reparent';
import { copiedComponent, pasteComponent, pasteConfiguration, Pasted } from './paste';
import { ComponentCopy } from '../parse/component-clipboard';
import { Layout, parseLayout, serialiseLayout } from '../parse/layout';
import { walkComponents } from '../parse/layout-walk';
import { ComponentConfig } from '../types';

/*
 * The edit a paste makes, decided on a clone and checked before anything is
 * adopted. The pane's side — the undo step, the notice, the refusal line, the
 * three routes in — is driven through the real pane in `layout-editor.test.ts`.
 */

function at(col: number, row: number, width = 2, height = 1) {
	return { col, row, width, height };
}

function card(id: string, label: string, extra: Record<string, unknown> = {}): ComponentConfig {
	return { id, type: 'card', label, position: at(1, 1), ...extra };
}

/** A copy of `component` as the clipboard would hold it. */
function copyOf(component: ComponentConfig, context: Partial<ComponentCopy['context']> = {}): ComponentCopy {
	return {
		from: { layout: 'Source', fingerprint: 'abcd1234' },
		component: JSON.parse(JSON.stringify(component)) as ComponentConfig,
		context: { functions: {}, definitions: [], ...context },
	};
}

/** A key a component's own config declares, which `ComponentConfig` does not. */
function own(config: ComponentConfig | undefined, key: string): unknown {
	return (config as unknown as Record<string, unknown> | undefined)?.[key];
}

function landed(result: Pasted | { error: string }): Pasted {
	if ('error' in result) throw new Error(result.error);
	return result;
}

/** Find a component anywhere in a layout by id. */
function find(layout: Layout, id: string): ComponentConfig {
	const found = walkComponents(layout.components).find((entry) => entry.config.id === id);
	if (!found) throw new Error(`no ${id}`);
	return found.config;
}

function defences(): ComponentConfig {
	return {
		id: 'defences',
		type: 'group',
		label: 'Defences',
		position: at(1, 2, 6, 2),
		children: [
			card('armour', 'Armour', { position: at(1, 1), derived: '10 + dex' }),
			card('ward', 'Ward', { position: at(3, 1), derived: 'armour + level' }),
		],
	};
}

function sheet(): Layout {
	return {
		name: 'Sheet',
		columns: 12,
		components: [card('level', 'Level', { position: at(1, 1) }), defences(), card('dex', 'Dex', { position: at(3, 1) })],
	};
}

describe('pasting a copy into the layout it came from', () => {
	it('suffixes every name, and points the copy at its own copies', () => {
		const layout = sheet();
		const pasted = landed(pasteComponent(layout, 'defences', copyOf(defences()), true));
		expect(pasted.root.label).toBe('Defences 2');
		expect(pasted.root.id).toBe('defences_2');
		const children = pasted.root.children ?? [];
		expect(children.map((child) => [child.id, child.label])).toEqual([
			['armour_2', 'Armour 2'],
			['ward_2', 'Ward 2'],
		]);
		// The sibling read goes to the copy; what sits outside the copy is read as
		// before.
		expect(own(children[1], 'derived')).toBe('armour_2 + level');
		expect(own(children[0], 'derived')).toBe('10 + dex');
		expect(pasted.dependencies).toEqual([]);
	});

	it('leaves the layout it was handed untouched', () => {
		const layout = sheet();
		const before = serialiseLayout(layout);
		landed(pasteComponent(layout, 'defences', copyOf(defences()), true));
		expect(serialiseLayout(layout)).toBe(before);
	});

	it('rewrites one expression at every declared path of every registered component', () => {
		let checked = 0;
		for (const type of listComponentTypes()) {
			const fields = getComponent(type)?.formulaFields ?? [];
			if (fields.length === 0) continue;
			const config: Record<string, unknown> = {
				id: 'src',
				type,
				label: 'Source',
				position: at(1, 1),
			};
			for (const pattern of fields) plant(config, pattern.split('.'));
			const layout: Layout = { name: 'L', components: [config as unknown as ComponentConfig] };
			const pasted = landed(
				pasteComponent(layout, 'src', copyOf(config as unknown as ComponentConfig), true),
			);
			const texts: string[] = [];
			for (const pattern of fields) collect(pasted.root, pattern.split('.'), texts);
			expect(texts.length, `${type}: ${fields.join(', ')}`).toBe(fields.length);
			for (const text of texts) expect(text, type).toBe('src_2 + mod.src_2');
			checked += fields.length;
		}
		// Table's two and its reset, Track's rows, a Card's two — well past a few.
		expect(checked).toBeGreaterThan(12);
	});
});

/** Build one expression at a declared path: `*` is a list, or a map where it is last. */
function plant(record: Record<string, unknown>, segments: string[]): void {
	const [head, ...rest] = segments;
	if (head === undefined) return;
	if (head === 'reset') {
		record.reset = [{ trigger: 'Rest', action: 'formula', to: 'src + mod.src' }];
		return;
	}
	if (rest.length === 0) {
		record[head] = 'src + mod.src';
		return;
	}
	if (rest[0] === '*') {
		const tail = rest.slice(1);
		if (tail.length === 0) {
			record[head] = { k: 'src + mod.src' };
			return;
		}
		const item: Record<string, unknown> = {};
		plant(item, tail);
		record[head] = [item];
		return;
	}
	const inner = (record[head] as Record<string, unknown> | undefined) ?? {};
	plant(inner, rest);
	record[head] = inner;
}

function collect(current: unknown, segments: string[], into: string[]): void {
	const [head, ...rest] = segments;
	if (head === undefined) {
		if (typeof current === 'string') into.push(current);
		return;
	}
	if (typeof current !== 'object' || current === null) return;
	const holder = current as Record<string, unknown>;
	const keys = head === '*' ? Object.keys(holder) : [head];
	for (const key of keys) collect(holder[key], rest, into);
}

describe('pasting a copy into another layout', () => {
	it('keeps every free id and label exactly as written, capitals included', () => {
		const copy = copyOf(card('STR', 'Strength', { derived: 'floor((value - 10) / 2)' }));
		const pasted = landed(pasteComponent(sheet(), 'level', copy, false));
		expect([pasted.root.id, pasted.root.label]).toEqual(['STR', 'Strength']);
		expect(own(pasted.root, 'derived')).toBe('floor((value - 10) / 2)');
	});

	it('never suffixes an id onto a name the copy reads from outside', () => {
		// The copy of `hp` reads its source's `hp_2`. Where `hp` is taken and
		// `hp_2` is free, the obvious suffix would make the formula read itself.
		const copy = copyOf(card('hp', 'HP', { derived: 'hp_2 + 1' }));
		const target: Layout = { name: 'T', components: [card('hp', 'Health')] };
		const pasted = landed(pasteComponent(target, 'hp', copy, false));
		expect(pasted.root.id).toBe('hp_3');
		expect(own(pasted.root, 'derived')).toBe('hp_2 + 1');
	});
});

describe('where a paste lands', () => {
	it('on a placed grid: after its row in the file, at column 1 on the first free row, never wider than the grid', () => {
		const wide = copyOf(card('banner', 'Banner', { position: at(1, 1, 20, 2) }));
		const pasted = landed(pasteComponent(sheet(), 'level', wide, false));
		expect(pasted.layout.components.map((one) => one.id)).toEqual([
			'level',
			'banner',
			'defences',
			'dex',
		]);
		// Defences ends at row 3, so row 4 is the first nothing occupies.
		expect(pasted.root.position).toEqual(at(1, 4, 12, 2));
	});

	it('inside a container, capped at the container', () => {
		const wide = copyOf(card('banner', 'Banner', { position: at(1, 1, 9, 1) }));
		const pasted = landed(pasteComponent(sheet(), 'armour', wide, false));
		const inside = find(pasted.layout, 'defences').children ?? [];
		expect(inside.map((one) => one.id)).toEqual(['armour', 'banner', 'ward']);
		expect(pasted.root.position).toEqual(at(1, 2, 6, 1));
	});

	function tabs(): Layout {
		const box = at(1, 1, 8, 3);
		return {
			name: 'Tabs',
			components: [
				{
					id: 'book',
					type: 'tab-set',
					label: 'Book',
					position: box,
					children: [card('one', 'One', { position: box }), card('two', 'Two', { position: box })],
				},
			],
		};
	}

	it('in a tab set: the tab after its row, at the tab set’s own place', () => {
		const pasted = landed(pasteComponent(tabs(), 'one', copyOf(card('extra', 'Extra')), false));
		expect((find(pasted.layout, 'book').children ?? []).map((one) => one.id)).toEqual([
			'one',
			'extra',
			'two',
		]);
		expect(pasted.root.position).toEqual(at(1, 1, 8, 3));
	});

	it('a tab copied onto a placed grid carries the size it was drawn at', () => {
		const layout = tabs();
		const book = layout.components[0] as ComponentConfig;
		const tab = book.children?.[0] as ComponentConfig;
		// The stored size went stale when the tab set was resized.
		tab.position = at(1, 1, 2, 1);
		const entry = walkComponents(layout.components).find((one) => one.config === tab);
		const copied = copiedComponent(entry!);
		expect(copied.position).toEqual(at(1, 1, 8, 3));
		expect(tab.position).toEqual(at(1, 1, 2, 1));
	});

	it('refuses where canReparent refuses, in its words, and writes nothing', () => {
		// A group holding a group with children, pasted beside a component that
		// already sits inside a container.
		const nest: ComponentConfig = {
			id: 'outer',
			type: 'group',
			label: 'Outer',
			position: at(1, 1, 6, 2),
			children: [
				{
					id: 'inner',
					type: 'group',
					label: 'Inner',
					position: at(1, 1, 6, 1),
					children: [card('leaf', 'Leaf')],
				},
			],
		};
		const layout = sheet();
		const before = serialiseLayout(layout);
		const result = pasteComponent(layout, 'armour', copyOf(nest), false);
		const expected = canReparent(layout, copyOf(nest).component, find(layout, 'defences'));
		expect('error' in expected).toBe(true);
		expect(result).toEqual(expected);
		expect(serialiseLayout(layout)).toBe(before);
	});

	it('drops a hand-written empty children list that would land too deep', () => {
		const empty: ComponentConfig = {
			id: 'box',
			type: 'group',
			label: 'Box',
			position: at(1, 1, 4, 1),
			children: [{ id: 'shelf', type: 'group', label: 'Shelf', position: at(1, 1), children: [] }],
		};
		const pasted = landed(pasteComponent(sheet(), 'armour', copyOf(empty), false));
		expect(pasted.root.children?.[0]?.children).toBeUndefined();
		expect(() => parseLayout(serialiseLayout(pasted.layout))).not.toThrow();
	});
});

describe('pasting a configuration', () => {
	function cardSet(id: string, label: string, keys: string[], extra: Record<string, unknown> = {}): ComponentConfig {
		return {
			id,
			type: 'card-set',
			label,
			position: at(1, 1, 6, 1),
			entries: keys.map((key) => ({ key })),
			...extra,
		} as unknown as ComponentConfig;
	}

	function target(): Layout {
		return {
			name: 'T',
			components: [
				cardSet('saves', 'Saves', ['STR', 'DEX', 'CON'], {
					derived: 'value + saves.STR',
					note: 'kept',
					reset: [{ trigger: 'Rest', action: 'empty' }],
				}),
			],
		};
	}

	function applied(result: ReturnType<typeof pasteConfiguration>) {
		if ('error' in result) throw new Error(result.error);
		return result;
	}

	it('makes the declared keys the source’s, deletes the ones it lacks, and keeps the rest', () => {
		const source = cardSet('abilities', 'Abilities', ['STR', 'DEX'], {
			derived: 'floor((value - 10) / 2) + abilities.STR',
		});
		const result = applied(pasteConfiguration(target(), 'saves', copyOf(source), true));
		const onto = result.target as unknown as Record<string, unknown>;
		expect(onto.entries).toEqual([{ key: 'STR' }, { key: 'DEX' }]);
		// The source's own id becomes the target's: the copy *is* the target now.
		expect(onto.derived).toBe('floor((value - 10) / 2) + saves.STR');
		// The source has no reset, so the target keeps none.
		expect(onto.reset).toBeUndefined();
		expect([onto.id, onto.label, onto.note]).toEqual(['saves', 'Saves', 'kept']);
		expect(onto.position).toEqual(at(1, 1, 6, 1));
		expect(result.keysLeft).toEqual(['CON']);
	});

	it('carries the reset binding', () => {
		const source = cardSet('abilities', 'Abilities', ['STR', 'DEX', 'CON'], {
			reset: [{ trigger: 'Dawn', action: 'full' }],
		});
		const result = applied(pasteConfiguration(target(), 'saves', copyOf(source), true));
		expect(result.target.reset).toEqual([{ trigger: 'Dawn', action: 'full' }]);
		expect(result.keysLeft).toEqual([]);
	});

	it('leaves the children of a container alone', () => {
		const layout = sheet();
		const source: ComponentConfig = {
			id: 'other',
			type: 'group',
			label: 'Other',
			position: at(1, 1, 3, 1),
			hideLabel: true,
			children: [card('stray', 'Stray')],
		} as unknown as ComponentConfig;
		const result = applied(pasteConfiguration(layout, 'defences', copyOf(source), true));
		expect((result.target.children ?? []).map((one) => one.id)).toEqual(['armour', 'ward']);
		expect((result.target as unknown as Record<string, unknown>).hideLabel).toBe(true);
	});

	it('reports only the modifier definitions that change the component itself', () => {
		const source: ComponentConfig = {
			id: 'other',
			type: 'group',
			label: 'Other',
			position: at(1, 1, 3, 1),
			hideLabel: true,
			children: [card('stray', 'Stray')],
		} as unknown as ComponentConfig;
		const copy = copyOf(source, {
			definitions: [
				{ name: 'Aimed at a child', targets: ['Stray'] },
				{ name: 'Aimed at both', targets: ['Other', 'Stray'] },
			],
		});
		const result = applied(pasteConfiguration(sheet(), 'defences', copy, false));
		expect(result.dependencies.map((one) => [one.spelled, one.detail])).toEqual([
			[
				'the "Aimed at both" modifier',
				{ kind: 'definition', name: 'Aimed at both', targets: ['Other'], here: false },
			],
		]);
	});

	it('refuses a different type, naming both', () => {
		const result = pasteConfiguration(
			sheet(),
			'level',
			copyOf({ id: 'hp', type: 'pool', label: 'HP', position: at(1, 1) }),
			true,
		);
		expect(result).toEqual({
			error: 'The clipboard holds a Pool, and "Level" is a Card. Paste configuration only goes onto a component of the same type.',
		});
	});

	it('refuses a configuration the target already has', () => {
		const layout = target();
		const same = JSON.parse(JSON.stringify(layout.components[0])) as ComponentConfig;
		expect(pasteConfiguration(layout, 'saves', copyOf(same), true)).toEqual({
			error: '"Saves" already has this configuration.',
		});
	});

	it('names a text key that stops addressing, through its fallback, and not one only added', () => {
		const layout: Layout = { name: 'T', components: [card('ac', 'AC')] };
		// No key is the fallback "value", and the source names one.
		const keyed = applied(pasteConfiguration(layout, 'ac', copyOf(card('x', 'X', { key: 'armour' })), true));
		expect(keyed.keysLeft).toEqual(['value']);
		// A list that only grows leaves nothing behind.
		const grown = applied(
			pasteConfiguration(
				{ name: 'T', components: [cardSet('s', 'S', ['STR'])] },
				's',
				copyOf(cardSet('a', 'A', ['STR', 'DEX'])),
				true,
			),
		);
		expect(grown.keysLeft).toEqual([]);
	});
});
