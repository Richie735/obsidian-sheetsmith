// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { cardSet, CardSetConfig } from './card-set';
import { FieldValue, RenderContext } from '../types';

const config: CardSetConfig = {
	id: 'card-set',
	type: 'card-set',
	label: 'Abilities',
	position: { col: 1, row: 1, width: 6, height: 1 },
	derived: 'floor((value - 10) / 2)',
	entries: [
		{ key: 'STR', name: 'Strength' },
		{ key: 'DEX', name: 'Dexterity' },
		{ key: 'WIS' },
	],
};

const BODY = '\n```sheet\nSTR: 8\nDEX: 16\nWIS: 12\n```\n';

const abilitiesWrite = (data: { values: Record<string, string> }) =>
	cardSet.write(data, BODY, config);

/** Stub resolver behaving like the 5e modifier formula. */
const modifier = (field: string, scope: Readonly<Record<string, FieldValue>>) =>
	field === 'derived' && typeof scope.value === 'string'
		? Math.floor((Number(scope.value) - 10) / 2)
		: null;

const context: RenderContext = {
	resolved: {},
	resolveField: modifier,
	onChange: () => undefined,
};

describe('cardSet.read', () => {
	it('reads every entry of the fenced block', () => {
		const result = cardSet.read(BODY, config);
		expect(result).toEqual({
			ok: true,
			data: { values: { STR: '8', DEX: '16', WIS: '12' } },
		});
	});

	it('treats a section with no sheet block as empty, not malformed', () => {
		expect(cardSet.read('\nProse only.\n', config)).toEqual({
			ok: true,
			data: null,
		});
	});

	it('keeps entries the layout does not declare', () => {
		const result = cardSet.read(
			'\n```sheet\nSTR: 8\nLUCK: 3\n```\n',
			config,
		);
		expect(result.ok && result.data?.values.LUCK).toBe('3');
	});
});

describe('cardSet.write', () => {
	it('round-trips unchanged data byte for byte', () => {
		const read = cardSet.read(BODY, config);
		if (!read.ok || read.data === null) throw new Error('expected data');
		expect(cardSet.write(read.data, BODY, config)).toBe(BODY);
	});

	it('rewrites only the changed entry', () => {
		expect(
			cardSet.write(
				{ values: { STR: '8', DEX: '18', WIS: '12' } },
				BODY,
				config,
			),
		).toBe(BODY.replace('DEX: 16', 'DEX: 18'));
	});

	it('creates a fresh section body when none exists', () => {
		expect(cardSet.write({ values: { STR: '8' } }, null, config)).toBe(
			'\n```sheet\nSTR: 8\n```\n',
		);
	});
});

describe('cardSet.render', () => {
	it('renders one card per entry, in order', () => {
		const el = document.createElement('div');
		cardSet.render(el, config, { values: { STR: '8', DEX: '16', WIS: '12' } }, context);
		const labels = Array.from(
			el.querySelectorAll('.sheetsmith-card-label'),
			(node) => node.textContent,
		);
		expect(labels).toEqual(['Strength', 'Dexterity', 'WIS']);
		const inputs = Array.from(
			el.querySelectorAll('.sheetsmith-card-input'),
			(node) => (node as HTMLInputElement).value,
		);
		expect(inputs).toEqual(['8', '16', '12']);
	});

	it('computes the derived value per entry', () => {
		const el = document.createElement('div');
		cardSet.render(el, config, { values: { STR: '8', DEX: '16', WIS: '12' } }, context);
		const derived = Array.from(
			el.querySelectorAll('.sheetsmith-card-derived'),
			(node) => node.textContent,
		);
		expect(derived).toEqual(['-1', '+3', '+1']);
	});

	const strip = (el: HTMLElement) =>
		el.querySelector('.sheetsmith-card-set') as HTMLElement;

	it('applies fixed sizing with its alignment', () => {
		const el = document.createElement('div');
		cardSet.render(
			el,
			{ ...config, sizing: 'fixed', align: 'center' },
			{ values: {} },
			context,
		);
		expect(strip(el).classList.contains('sheetsmith-card-set-align-center')).toBe(
			true,
		);

		const start = document.createElement('div');
		cardSet.render(start, { ...config, sizing: 'fixed' }, { values: {} }, context);
		expect(strip(start).classList.contains('sheetsmith-card-set-align-start')).toBe(
			true,
		);

		const filled = document.createElement('div');
		cardSet.render(filled, config, { values: {} }, context);
		expect(
			Array.from(strip(filled).classList).some((name) => name.includes('align')),
		).toBe(false);
	});

	it('reads legacy align values that carried the sizing choice', () => {
		const el = document.createElement('div');
		cardSet.render(el, { ...config, align: 'center' }, { values: {} }, context);
		expect(strip(el).classList.contains('sheetsmith-card-set-align-center')).toBe(
			true,
		);

		const stretched = document.createElement('div');
		cardSet.render(
			stretched,
			{ ...config, align: 'stretch' },
			{ values: {} },
			context,
		);
		expect(
			Array.from(strip(stretched).classList).some((name) =>
				name.includes('align'),
			),
		).toBe(false);
	});

	it('renders the group label, and hides it with hideLabel', () => {
		const el = document.createElement('div');
		cardSet.render(el, config, { values: {} }, context);
		expect(el.querySelector('.sheetsmith-card-set-label')?.textContent).toBe(
			'Abilities',
		);

		const hidden = document.createElement('div');
		cardSet.render(hidden, { ...config, hideLabel: true }, { values: {} }, context);
		expect(hidden.querySelector('.sheetsmith-card-set-label')).toBeNull();
	});

	it('positions the group label, leaving the default unclassed', () => {
		const label = (el: HTMLElement) =>
			el.querySelector('.sheetsmith-card-set-label') as HTMLElement;

		const start = document.createElement('div');
		cardSet.render(start, config, { values: {} }, context);
		expect(
			Array.from(label(start).classList).some((name) => name.includes('label-')),
		).toBe(false);

		for (const position of ['center', 'end'] as const) {
			const el = document.createElement('div');
			cardSet.render(el, { ...config, labelAlign: position }, { values: {} }, context);
			expect(
				label(el).classList.contains(`sheetsmith-card-set-label-${position}`),
			).toBe(true);
		}
	});

	it('sits the label over the cards it heads unless told otherwise', () => {
		const label = (el: HTMLElement) =>
			el.querySelector('.sheetsmith-card-set-label') as HTMLElement;
		const centred = { ...config, sizing: 'fixed', align: 'center' } as const;

		const followed = document.createElement('div');
		cardSet.render(followed, centred, { values: {} }, context);
		expect(
			label(followed).classList.contains('sheetsmith-card-set-label-center'),
		).toBe(true);

		// An explicit position still wins over the cards' alignment.
		const overridden = document.createElement('div');
		cardSet.render(
			overridden,
			{ ...centred, labelAlign: 'start' },
			{ values: {} },
			context,
		);
		expect(
			Array.from(label(overridden).classList).some((name) =>
				name.includes('label-'),
			),
		).toBe(false);
	});

	it('reads an explicit "auto" the same as an absent position', () => {
		const centred = { ...config, sizing: 'fixed', align: 'center' } as const;
		for (const labelAlign of [undefined, 'auto'] as const) {
			const el = document.createElement('div');
			cardSet.render(el, { ...centred, labelAlign }, { values: {} }, context);
			expect(
				el
					.querySelector('.sheetsmith-card-set-label')
					?.classList.contains('sheetsmith-card-set-label-center'),
			).toBe(true);
		}
	});

	it('shows an empty value as a blank, not a broken formula', () => {
		const el = document.createElement('div');
		cardSet.render(el, config, { values: { STR: '8' } }, context);
		const derived = el.querySelectorAll('.sheetsmith-card-derived');
		// DEX has no value: a dash with no error styling, not "?".
		expect(derived[1]?.textContent).toBe('—');
		expect(
			derived[1]?.classList.contains('sheetsmith-card-derived-unresolved'),
		).toBe(false);
	});

	it('ignores hideValue when there is no derived to show instead', () => {
		const el = document.createElement('div');
		cardSet.render(
			el,
			{ ...config, derived: undefined, hideValue: true },
			{ values: { STR: '8' } },
			context,
		);
		expect(el.querySelector('.sheetsmith-card-input')).not.toBeNull();
	});

	it('flows vertically when configured', () => {
		const el = document.createElement('div');
		cardSet.render(
			el,
			{ ...config, direction: 'vertical' },
			{ values: {} },
			context,
		);
		expect(strip(el).classList.contains('sheetsmith-card-set-vertical')).toBe(
			true,
		);
	});

	it('reports an edit as a single-key delta, never a snapshot', () => {
		// A snapshot would let a commit racing a rebuild revert a sibling's
		// fresher edit; a delta can only ever touch its own entry.
		const el = document.createElement('div');
		const edits: unknown[] = [];
		cardSet.render(el, config, { values: { STR: '8', DEX: '16', WIS: '12' } }, {
			...context,
			onChange: (data) => edits.push(data),
		});
		const dex = el.querySelectorAll('.sheetsmith-card-input')[1] as HTMLInputElement;
		dex.value = '18';
		dex.dispatchEvent(new Event('blur'));
		expect(edits).toEqual([{ values: { DEX: '18' } }]);
	});

	it('does not commit when the value is unchanged on blur', () => {
		const el = document.createElement('div');
		const edits: unknown[] = [];
		cardSet.render(el, config, { values: { STR: '8', DEX: '16', WIS: '12' } }, {
			...context,
			onChange: (data) => edits.push(data),
		});
		const dex = el.querySelectorAll('.sheetsmith-card-input')[1] as HTMLInputElement;
		dex.dispatchEvent(new Event('blur'));
		expect(edits).toEqual([]);
	});

	it('writes a single-key delta without touching sibling entries', () => {
		expect(abilitiesWrite({ values: { DEX: '18' } })).toBe(
			BODY.replace('DEX: 16', 'DEX: 18'),
		);
	});

	it('updates the derived display live while typing', () => {
		const el = document.createElement('div');
		cardSet.render(el, config, { values: { STR: '8', DEX: '16', WIS: '12' } }, context);
		const dex = el.querySelectorAll('.sheetsmith-card-input')[1] as HTMLInputElement;
		dex.value = '20';
		dex.dispatchEvent(new Event('input'));
		const derived = el.querySelectorAll('.sheetsmith-card-derived')[1];
		expect(derived?.textContent).toBe('+5');
	});

	it('restores the committed value on Escape without reporting an edit', () => {
		const el = document.createElement('div');
		const edits: unknown[] = [];
		cardSet.render(el, config, { values: { STR: '8', DEX: '16', WIS: '12' } }, {
			...context,
			onChange: (data) => edits.push(data),
		});
		const dex = el.querySelectorAll('.sheetsmith-card-input')[1] as HTMLInputElement;
		dex.value = '99';
		dex.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(dex.value).toBe('16');
		expect(edits).toEqual([]);
	});

	it('steps the value with arrow keys like typing: live, committed on blur', () => {
		const el = document.createElement('div');
		const edits: unknown[] = [];
		cardSet.render(el, config, { values: { STR: '8', DEX: '16', WIS: '12' } }, {
			...context,
			onChange: (data) => edits.push(data),
		});
		const dex = el.querySelectorAll('.sheetsmith-card-input')[1] as HTMLInputElement;
		dex.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
		dex.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
		expect(dex.value).toBe('18');
		// Steps update the draft and the derived display, not the file.
		expect(el.querySelectorAll('.sheetsmith-card-derived')[1]?.textContent).toBe(
			'+4',
		);
		expect(edits).toEqual([]);
		dex.dispatchEvent(new Event('blur'));
		expect(edits).toEqual([{ values: { DEX: '18' } }]);
	});

	it('marks an unresolved derived as status, distinct from an empty value', () => {
		const el = document.createElement('div');
		cardSet.render(el, config, { values: { STR: '8' } }, {
			...context,
			resolveField: () => null,
		});
		const derived = el.querySelector('.sheetsmith-card-derived');
		expect(derived?.textContent).toBe('?');
		expect(
			derived?.classList.contains('sheetsmith-card-derived-unresolved'),
		).toBe(true);
	});

	it('hides inputs but keeps modifiers with hideValue', () => {
		const el = document.createElement('div');
		cardSet.render(
			el,
			{ ...config, hideValue: true },
			{ values: { STR: '8' } },
			context,
		);
		expect(el.querySelector('.sheetsmith-card-input')).toBeNull();
		expect(el.querySelector('.sheetsmith-card-derived')?.textContent).toBe(
			'-1',
		);
	});
});

describe('cardSet.scopeValues', () => {
	it('publishes one name per entry, for `abilities.DEX`', () => {
		const published = cardSet.scopeValues?.(
			{ values: { STR: '8', DEX: '16', WIS: '12' } },
			config,
		);
		expect(Object.keys(published?.named ?? {})).toEqual(['STR', 'DEX', 'WIS']);
		// The stored score, plus the derived the reference actually gets.
		expect(published?.named?.DEX).toEqual({
			value: '16',
			display: { field: 'derived', scope: { value: '16' } },
		});
	});

	it('publishes the score alone when the group derives nothing', () => {
		const published = cardSet.scopeValues?.({ values: { STR: '8' } }, {
			...config,
			derived: undefined,
		});
		expect(published?.named?.STR).toEqual({ value: '8', display: undefined });
	});

	it('publishes only what the layout declares', () => {
		// An entry the layout does not declare does not render, so a formula must
		// not be able to reach it either.
		const published = cardSet.scopeValues?.(
			{ values: { STR: '8', LUCK: '3' } },
			config,
		);
		expect(Object.keys(published?.named ?? {})).not.toContain('LUCK');
	});

	it('publishes nothing when the section is missing', () => {
		const published = cardSet.scopeValues?.(null, config);
		expect(published?.named?.STR?.value).toBeUndefined();
	});
});

describe('cardSet contract', () => {
	it('declares fenced storage, formula fields, and config fields', () => {
		expect(cardSet.storage).toBe('fenced');
		expect(cardSet.formulaFields).toEqual(['derived']);
		expect(cardSet.configFields.map((field) => field.key)).toEqual([
			'entries',
			'derived',
			'direction',
			'sizing',
			'align',
			'hideLabel',
			'labelAlign',
			'hideValue',
			'signed',
		]);
		const align = cardSet.configFields.find((field) => field.key === 'align');
		expect(align?.visibleWhen).toEqual({ key: 'sizing', equals: 'fixed' });
	});

	it('names the default of every select, so each choice is storable', () => {
		// The editor stores a select only when it differs from the first
		// option (layout-editor.ts), so the first option has to *be* the
		// behaviour an absent key produces. Where the default is "whatever
		// the cards do", that needs its own name: without one, picking
		// "start" deletes the key and renders as auto, and the dropdown goes
		// on reading "start" while the sheet disagrees.
		const labelAlign = cardSet.configFields.find(
			(field) => field.key === 'labelAlign',
		);
		expect(labelAlign?.options?.[0]).toBe('auto');

		// Every other select's first option is already its absent-key
		// behaviour, so each remaining choice stores a value of its own.
		expect(
			cardSet.configFields.find((field) => field.key === 'direction')
				?.options?.[0],
		).toBe('horizontal');
		expect(
			cardSet.configFields.find((field) => field.key === 'sizing')?.options?.[0],
		).toBe('fill');
		expect(
			cardSet.configFields.find((field) => field.key === 'align')?.options?.[0],
		).toBe('start');
	});
});

/*
 * Modifiers (SPEC §5). The headline case of the whole feature: "+2 STR from a
 * Belt of Giant Strength", which is unbuildable without the relative spelling —
 * one `derived` runs per entry, and no absolute name inside it could say which
 * entry it is running for.
 *
 * The first case is Risk 1 in the feature spec, accepted deliberately: the
 * resolver's third argument is optional, so a component that forgot to pass its
 * per-entry name would read `mod.self` as 0 with nothing reporting it.
 */
describe('cardSet and its modifier slots', () => {
	/** A resolver that adds 2 only to the entry it is told it is producing. */
	const beltOfStrength = (
		field: string,
		scope: Readonly<Record<string, FieldValue>>,
		published?: string,
	) => {
		if (field !== 'derived' || typeof scope.value !== 'string') return null;
		const base = Math.floor((Number(scope.value) - 10) / 2);
		return published === 'card-set.STR' ? base + 2 : base;
	};

	const derivedText = (el: HTMLElement) =>
		Array.from(el.querySelectorAll('.sheetsmith-card-derived')).map(
			(one) => one.textContent,
		);

	const render = (ctx: Partial<RenderContext> = {}) => {
		const el = document.createElement('div');
		cardSet.render(
			el,
			config,
			{ values: { STR: '8', DEX: '16', WIS: '12' } },
			{ ...context, ...ctx },
		);
		return el;
	};

	it('modifies only the entry a row targeted', () => {
		// STR moves and DEX and WIS do not, which is what the per-entry name buys.
		expect(derivedText(render({ resolveField: beltOfStrength }))).toEqual([
			'+1',
			'+3',
			'+1',
		]);
		// Unmodified, for the comparison: STR is -1 on its own.
		expect(derivedText(render())).toEqual(['-1', '+3', '+1']);
	});

	it('passes the entry name on every re-derive', () => {
		const el = render({ resolveField: beltOfStrength });
		const input = el.querySelectorAll<HTMLInputElement>(
			'.sheetsmith-card-input',
		)[0] as HTMLInputElement;
		input.value = '10';
		input.dispatchEvent(new Event('input'));
		// 0 plus the belt's 2, not 0: the draft path passes the name too.
		expect(derivedText(el)[0]).toBe('+2');
	});

	it('marks the entry that was modified and no other', () => {
		const el = render({
			resolveField: beltOfStrength,
			modifiers: {
				publishes: () => true,
				targets: [{ name: 'card-set.STR', label: 'Abilities · STR' }],
				breakdown: (name) =>
					name === 'card-set.STR'
						? {
								total: 2,
								lines: [
									{
										label: 'Belt of Giant Strength',
										source: 'Magic items',
										type: 'item',
										amount: 2,
										suppressed: null,
									},
								],
							}
						: { total: 0, lines: [] },
			},
		});
		expect(
			Array.from(el.querySelectorAll('.sheetsmith-card-derived')).map((one) =>
				one.classList.contains('sheetsmith-modified'),
			),
		).toEqual([true, false, false]);
	});
});
