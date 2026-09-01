// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cardSet, CardSetConfig } from './card-set';
import { FieldValue, ModifierOutcome, RenderContext } from '../types';
import { sampleOf } from '../test/sample';

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

describe('cardSet.sample', () => {
	it('fills one number per declared entry, and no two neighbours alike', () => {
		const body = sampleOf(cardSet, config);
		const read = cardSet.read(body, config);
		if (!read.ok || read.data === null) throw new Error('expected data');
		// The keys are the layout's own, in its own order.
		expect(Object.keys(read.data.values)).toEqual(['STR', 'DEX', 'WIS']);
		const numbers = Object.values(read.data.values).map(Number);
		// Never 0 and never 1: a strip of cards under `floor((value - 10) / 2)`
		// has to be visibly doing arithmetic, which a run of 10s is not.
		expect(numbers.every((one) => one > 1 && one < 100)).toBe(true);
		expect(new Set(numbers).size).toBe(numbers.length);
	});

	it('fills nothing where the layout names no entry', () => {
		// The honest answer rather than an invented key: the strip draws
		// exactly as it does with no sample at all.
		expect(sampleOf(cardSet, { ...config, entries: [] })).toBe('');
	});

	it('leaves out a key the fenced block could not hold', () => {
		const body = sampleOf(cardSet, {
			...config,
			entries: [{ key: 'STR' }, { key: 'A: B' }, { key: '' }],
		});
		expect(body).toContain('STR: ');
		expect(body).not.toContain('A: B');
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
		expect(cardSet.formulaFields).toEqual(['derived', 'effective']);
		expect(cardSet.configFields.map((field) => field.key)).toEqual([
			'entries',
			'derived',
			'effective',
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
/**
 * What a modifier cell's outcome is where a case is not about one.
 *
 * A Card set never asks for one — `outcome` is the modifier *cell's* question —
 * so a stub context needs a member it can hand back and nothing more.
 */
const NO_OUTCOME: ModifierOutcome = {
	definition: null,
	typed: null,
	target: '',
	targetLabel: '',
	applies: false,
	amount: null,
	condition: null,
	suppressed: null,
};

/**
 * The three members a Card never reaches, so a stub context can declare them
 * once.
 *
 * `targets`, `published` and `bonusTypes` are the form's option lists and
 * `promote` is §8's layout write: all four are the modifier *cell's* business,
 * and a Card is the thing being modified rather than the thing modifying.
 */
const NO_AUTHORING = {
	targets: [],
	published: [],
	bonusTypes: [],
	promote: () =>
		Promise.resolve({
			error: 'This sheet cannot save a modifier to its layout.',
		}),
};

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
				definitions: [],
				...NO_AUTHORING,
				outcome: () => NO_OUTCOME,
				breakdown: (name) =>
					name === 'card-set.STR'
						? {
								override: null,
								total: 2,
								resultTotal: 0,
								lines: [
									{
										label: 'Belt of Giant Strength',
										source: 'Magic items',
										definition: 'Belt of Giant Strength',
										operator: 'add',
										type: 'item',
										amount: 2,
										suppressed: null,
									},
								],
							}
						: { override: null, total: 0, lines: [] },
			},
		});
		expect(
			Array.from(el.querySelectorAll('.sheetsmith-card-derived')).map((one) =>
				one.classList.contains('sheetsmith-modified'),
			),
		).toEqual([true, false, false]);
	});

	/*
	 * **The `shown` guard, on this drawer.** `modifierBreakdown`'s second argument
	 * exists so a total line prints the number its caller drew rather than
	 * recomputing `override + total`, and there are three drawers passing it —
	 * Card, Card set and Table. The equivalent case in `card.test.ts` was the only
	 * one, so dropping the argument here passed every test in the suite: a wrong
	 * shape rather than a wrong value, milder than the original defect, and
	 * `docs/PATTERNS.md` §1's recurring lesson is that an extraction is not
	 * finished at the declarations. One case per drawer, cross-referenced, rather
	 * than one parameterised test importing three components.
	 */
	it('prints the entry\'s own number in the total line, under an override', () => {
		// Per entry, like the formula above it: the number that reaches the
		// breakdown is this card's face and not the set's first one.
		const el = render({
			resolveField: (field, scope, published) =>
				published === 'card-set.STR' ? 19 : 3,
			modifiers: {
				definitions: [],
				...NO_AUTHORING,
				outcome: () => NO_OUTCOME,
				breakdown: (name) =>
					name === 'card-set.STR'
						? {
								override: 18,
								total: 1,
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
			},
		});
		const twin = el.querySelector('.sheetsmith-sr-only[id]');
		expect(derivedText(el)[0]).toBe('+19');
		expect((twin?.textContent ?? '').split('\n').at(-1)).toBe('Total 19');
	});
});

/*
 * **The value pill reading a number nobody typed** — a Strength of 8 with +4
 * layered over it is a 12, and 12 is the number a player looks for.
 *
 * What these are really about is the half that is not visual. `current` is
 * `bindEditable`'s `initial`: the baseline Escape restores to, the number an
 * arrow steps, and what a blur compares against to decide whether anything
 * changed. A field left reading the effective number would step to 13 and commit
 * 13 as the *stored* score — character data drifting under a reader who pressed
 * an arrow key (CLAUDE.md 4). So the swap on focus is the feature, and the four
 * gesture tests below are why it exists rather than extra coverage of it.
 */
describe('cardSet.render: an effective value over a stored one', () => {
	const boosted: CardSetConfig = {
		...config,
		derived: 'floor((value + mod.self - 10) / 2)',
		effective: 'value + mod.self',
	};

	/** A resolver with +4 pushed at STR's slot and nothing at anyone else's. */
	const withModifier: RenderContext['resolveField'] = (
		field,
		scope,
		published,
	) => {
		const raw = typeof scope.value === 'string' ? Number(scope.value) : NaN;
		if (Number.isNaN(raw)) return null;
		const pushed = published === 'card-set.STR' ? 4 : 0;
		if (field === 'effective') return raw + pushed;
		if (field === 'derived') return Math.floor((raw + pushed - 10) / 2);
		return null;
	};

	/*
	 * **Rendered into the document, and focus is real.** Every gesture case below
	 * turns on the field's *focus state* rather than on a listener firing, and a
	 * detached element has none: happy-dom dispatches `focus` and `blur` from
	 * `.focus()` / `.blur()` only for an element that is actually in the document,
	 * so a detached one never becomes `activeElement` and `editable.ts`'s own
	 * `input.blur()` at the end of Escape reaches nothing.
	 *
	 * That is not a nicety about test hygiene. Driven synthetically, the Escape
	 * case asserted the *absence* of the restore listener and recorded happy-dom's
	 * behaviour as though it were the plugin's — it read `8` where a browser reads
	 * `12`. Measured rather than assumed: an attached input fires both events, a
	 * detached one fires neither.
	 */
	afterEach(() => document.body.replaceChildren());

	const draw = (
		values: Record<string, string> = { STR: '8', DEX: '16', WIS: '12' },
		on: Partial<RenderContext> = {},
	) => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		const edits: unknown[] = [];
		cardSet.render(el, boosted, { values }, {
			...context,
			resolveField: withModifier,
			onChange: (data) => edits.push(data),
			...on,
		});
		const inputs = Array.from(
			el.querySelectorAll<HTMLInputElement>('.sheetsmith-card-input'),
		);
		return { el, edits, inputs };
	};

	it('reads the effective number at rest and marks it as one', () => {
		const { inputs } = draw();
		expect(inputs[0]?.value).toBe('12');
		expect(
			inputs[0]?.classList.contains('sheetsmith-card-input-effective'),
		).toBe(true);
		/*
		 * **The painted mark is `sheetsmith-modified`, not a colour** — the same
		 * dotted underline a card's own `derived` wears where a modifier has
		 * touched it, added here rather than a colour invented for the pill alone
		 * (docs/UI.md §9). A design pass replaced the accent this test used to
		 * check: it was the only channel painted, so forced-colors mode — which
		 * repaints every foreground to one system colour — made an accented pill
		 * pixel-identical to an unmarked one, where a shape survives it.
		 */
		expect(inputs[0]?.classList.contains('sheetsmith-modified')).toBe(true);
		/*
		 * **The state is in the accessible name and not only in the paint**
		 * (docs/UI.md §6): a pill has no room to explain itself, so both numbers
		 * are said as well as shown.
		 *
		 * **Asserted on `aria-label` and not only on `title`, because this comment
		 * used to be false.** The two carriers were a colour and a tooltip, and the
		 * bare `aria-label` beside them *won* the accessible-name computation — so a
		 * reader without a pointer was told nothing at all while the comment claimed
		 * they were. Both are checked now, and they are built from one string so
		 * they cannot drift apart.
		 */
		expect(inputs[0]?.getAttribute('title')).toBe('12 with modifiers, 8 stored');
		expect(inputs[0]?.getAttribute('aria-label')).toBe(
			'Strength, 12 with modifiers, 8 stored',
		);
	});

	it('leaves the name alone on an entry nothing was pushed at', () => {
		// The other half: a pill reading what the note stores is an ordinary field
		// and says so, rather than announcing a state it is not in.
		const { inputs } = draw();
		expect(inputs[1]?.getAttribute('aria-label')).toBe('Dexterity');
	});

	it('leaves an entry nothing was pushed at exactly as it was', () => {
		// The same rule `mod.self` exists for, read on the pill: DEX resolves its
		// own effective, gets its own number back, and so carries no marker.
		const { inputs } = draw();
		expect(inputs[1]?.value).toBe('16');
		expect(
			inputs[1]?.classList.contains('sheetsmith-card-input-effective'),
		).toBe(false);
		expect(inputs[1]?.hasAttribute('title')).toBe(false);
	});

	it('puts the stored number back the moment the field is focused', () => {
		const { inputs } = draw();
		inputs[0]?.focus();
		expect(inputs[0]?.value).toBe('8');
	});

	it('steps from the stored number, never from the effective one', () => {
		/*
		 * The trap this whole shape exists to close. Stepping the pill as it reads
		 * would take 12 to 13 and write 13 into the note as Strength — a score the
		 * player never typed, four higher than the one they did, arrived at by
		 * pressing an arrow key once.
		 */
		const { edits, inputs } = draw();
		inputs[0]?.focus();
		inputs[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
		inputs[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
		expect(inputs[0]?.value).toBe('10');
		expect(edits).toEqual([]);
		inputs[0]?.blur();
		expect(edits).toEqual([{ values: { STR: '10' } }]);
	});

	it('abandons the draft to the stored number on Escape, and writes nothing', () => {
		/*
		 * **What Escape restores is the baseline, and the baseline is the stored
		 * number.** `bindEditable`'s `committed` starts at `current`, so an
		 * abandoned draft goes back to 8 and not to 12 — and the next arrow press
		 * therefore steps from 8. That is the whole of what the swap protects
		 * (CLAUDE.md 4); what the field then *displays* is the case below.
		 */
		const { edits, inputs } = draw();
		inputs[0]?.focus();
		inputs[0]!.value = '99';
		inputs[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(edits).toEqual([]);
		// And the baseline really is 8 rather than merely displayed as it: step
		// once from the restored state and the commit says which number it stepped.
		inputs[0]?.focus();
		inputs[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
		inputs[0]?.blur();
		expect(edits).toEqual([{ values: { STR: '9' } }]);
	});

	it('leaves the pill at rest after Escape, which is the effective number', () => {
		/*
		 * **Escape ends by blurring** (`editable.ts`), so the field it leaves behind
		 * is not under a caret — and SPEC §4.2's rule for a pill that is not under a
		 * caret is the effective number. This case exists because it used to assert
		 * `8`, which was neither the rule nor the app: the element was focused with
		 * a synthetic event, so it never became `activeElement`, so Escape's own
		 * `input.blur()` dispatched nothing and the restore never ran. The
		 * assertion was a record of happy-dom's behaviour.
		 *
		 * **And 8 would be the wrong answer even if it were reachable**, because it
		 * puts the card's three channels into disagreement: the accent still says
		 * this number is computed and the accessible name still says
		 * `12 with modifiers, 8 stored`, over a field reading 8. The mark exists to
		 * stop a number nobody typed reading like one they did, and an unfocused
		 * pill showing the stored value under it is that failure with the colour
		 * left on.
		 */
		const { inputs } = draw();
		inputs[0]?.focus();
		inputs[0]!.value = '99';
		inputs[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(inputs[0]?.value).toBe('12');
		expect(inputs[0]?.getAttribute('aria-label')).toBe(
			'Strength, 12 with modifiers, 8 stored',
		);
	});

	it('reads the effective number again after a blur that changed nothing', () => {
		// The one path no re-render follows: focused, nothing typed, moved on. A
		// commit rebuilds the face with a fresh effective and owns the display.
		const { edits, inputs } = draw();
		inputs[0]?.focus();
		expect(inputs[0]?.value).toBe('8');
		inputs[0]?.blur();
		expect(inputs[0]?.value).toBe('12');
		expect(edits).toEqual([]);
	});

	it('leaves a number spelled differently alone, rather than calling it modified', () => {
		/*
		 * **The same number in two spellings is not a modifier.** `shown` arrives as
		 * `String(n)`, so a note holding `15.0` on an entry nothing is pushed at
		 * produced `'15' !== '15.0'` — and the card then carried the accent, the
		 * title, the accessible name and the focus swap, all announcing modifiers on
		 * a value no modifier reaches. That is the mark's own failure mode arrived at
		 * from the other side, and it is why the comparison is numeric.
		 *
		 * **The reader's spelling survives**, which is the second half: the pill
		 * still shows `15.0`, because nothing changed it and §10's "rendered, not
		 * corrected" is what a note the reader owns is owed.
		 */
		const { inputs } = draw({ STR: '8', DEX: '15.0', WIS: '12' });
		expect(inputs[1]?.value).toBe('15.0');
		expect(
			inputs[1]?.classList.contains('sheetsmith-card-input-effective'),
		).toBe(false);
		expect(inputs[1]?.hasAttribute('title')).toBe(false);
		expect(inputs[1]?.getAttribute('aria-label')).toBe('Dexterity');
		// And the entry that really is modified still is, so the fold is about
		// spelling rather than about switching the mark off.
		expect(inputs[0]?.value).toBe('12');
		expect(
			inputs[0]?.classList.contains('sheetsmith-card-input-effective'),
		).toBe(true);
	});

	it('shows the stored number where the formula does not resolve', () => {
		/*
		 * A pill is one number with nowhere to say why it is not one — the derived
		 * above it owns the `?` and the reason behind it — so the fallback is the
		 * number that was typed rather than a mark saying the layout is broken in
		 * a slot that cannot say how.
		 */
		const { inputs } = draw(
			{ STR: '8', DEX: '16', WIS: '12' },
			{ resolveField: (field, scope) => (field === 'effective' ? null : 0) },
		);
		expect(inputs[0]?.value).toBe('8');
		expect(
			inputs[0]?.classList.contains('sheetsmith-card-input-effective'),
		).toBe(false);
	});

	it('shows nothing where nothing is stored yet', () => {
		// An empty value is a blank the reader types into, and a modifier over
		// nothing is not a score.
		const { inputs } = draw({ DEX: '16' });
		expect(inputs[0]?.value).toBe('');
		expect(
			inputs[0]?.classList.contains('sheetsmith-card-input-effective'),
		).toBe(false);
	});

	it('asks for the pill display-only, and for the derived number not', () => {
		/*
		 * **The call site's own case, and it exists because every other case here
		 * is blind to it.** `withModifier` above returns a number and never looks
		 * at its fourth argument, so deleting `true` from `card-set.ts` leaves all
		 * of them green — measured, not assumed. What ships then is SPEC §5's
		 * "only the evaluation that becomes the published name takes the result
		 * phase, and the override with it" quietly reversed: an override *of the
		 * ability modifier* would read as the score, and a `+1 to checks` would be
		 * counted into it. `resolve.test.ts` holds what the two answers are; this
		 * holds that this component asks the right question.
		 */
		const asked: { field: string; displayOnly: boolean }[] = [];
		const recording: RenderContext['resolveField'] = (
			field,
			scope,
			published,
			displayOnly,
		) => {
			asked.push({ field, displayOnly: displayOnly === true });
			return withModifier(field, scope, published);
		};
		draw(undefined, { resolveField: recording });
		expect(asked.filter((one) => one.field === 'effective')).not.toHaveLength(0);
		expect(
			asked
				.filter((one) => one.field === 'effective')
				.every((one) => one.displayOnly),
		).toBe(true);
		// The other half of the same claim: the number above the pill is the one
		// that becomes `card-set.STR`, so it must ask as the publisher.
		expect(
			asked
				.filter((one) => one.field === 'derived')
				.every((one) => !one.displayOnly),
		).toBe(true);
	});

	it('leaves a set that declares no effective formula alone', () => {
		const el = document.createElement('div');
		cardSet.render(el, config, { values: { STR: '8' } }, context);
		const input = el.querySelector('.sheetsmith-card-input') as HTMLInputElement;
		expect(input.value).toBe('8');
		expect(input.classList.contains('sheetsmith-card-input-effective')).toBe(
			false,
		);
	});
});
