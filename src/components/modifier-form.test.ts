// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
	fillTargetOptions,
	modifierFormState,
	renderModifierForm,
	ModifierFormOptions,
} from './modifier-form';
import { definitionView, outcomeView } from '../test/modifier-views';
import { ModifierChangeView } from '../types';

/*
 * What the form authors itself, as opposed to what it draws for somebody else
 * (`docs/features/modifier-notes.md`): the **Value** select's two groups, and the
 * refusal that stops a definition being copied onto a row. Everything else here is
 * driven end to end from `table.test.ts` and `record-set.test.ts`.
 */

const ACCEPTING = [
	{ name: 'armour_class', label: 'Armour class' },
	{ name: 'abilities.STR', label: 'Abilities · STR' },
];
const NOTABLE = [
	{ name: 'armour_class', label: 'Armour class' },
	{ name: 'passive', label: 'Passive perception' },
];

describe('fillTargetOptions', () => {
	const filled = (accepting = ACCEPTING, notable = NOTABLE) => {
		const select = document.createElement('select');
		fillTargetOptions(select, accepting, notable);
		return select;
	};

	it('groups the accepting set first, then every other note target', () => {
		expect(
			Array.from(filled().querySelectorAll('optgroup')).map((group) => [
				group.label,
				Array.from(group.querySelectorAll('option')).map((one) => one.value),
			]),
		).toEqual([
			['Takes modifiers', ['armour_class', 'abilities.STR']],
			// A note target already under Takes modifiers is not offered twice.
			['Notes only', ['passive']],
		]);
	});

	it('draws the flat accepting list where nothing is notes only', () => {
		const select = filled(ACCEPTING, [ACCEPTING[0] as (typeof ACCEPTING)[number]]);
		expect(select.querySelector('optgroup')).toBeNull();
		expect(Array.from(select.options).map((one) => one.value)).toEqual([
			'armour_class',
			'abilities.STR',
		]);
	});

	it('draws Notes only alone where nothing takes modifiers', () => {
		const select = filled([], NOTABLE);
		expect(Array.from(select.querySelectorAll('optgroup')).map((one) => one.label)).toEqual([
			'Notes only',
		]);
	});
});

describe('copying a definition onto a row', () => {
	function form(note: string): HTMLElement {
		const warded = definitionView({
			name: 'Warded',
			target: 'armour_class',
			targetLabel: 'Armour class',
			amount: '1',
			note,
		});
		const body = document.createElement('div');
		const state = modifierFormState(['Warded']);
		state.open = 0;
		state.pending = 'sheetsmith-typed';
		const options: ModifierFormOptions = {
			label: 'Ring',
			parts: ['Warded'],
			outcomes: () => [
				outcomeView({
					definition: warded,
					change: warded.changes[0] as ModifierChangeView,
					target: 'armour_class',
					targetLabel: 'Armour class',
					applies: true,
					amount: 1,
				}),
			],
			definitions: [warded],
			targets: ACCEPTING,
			published: ACCEPTING,
			bonusTypes: [],
			icon: () => undefined,
			onCommit: () => undefined,
			onPromote: () => Promise.resolve({ error: 'No layout here.' }),
			announce: () => undefined,
			onResize: () => undefined,
		};
		renderModifierForm(body, state, options);
		return body;
	}

	it('refuses, naming the definition, where a note could not be spelled in a cell', () => {
		const body = form('Warm; dry');
		expect(body.querySelector('.sheetsmith-panel-problem')?.textContent).toBe(
			'"Warded" cannot be copied onto this row. A note cannot hold a semicolon, because a row separates the modifiers it applies with one. Reword it without one.',
		);
		expect(body.querySelector('.sheetsmith-panel-confirm')).toBeNull();
	});

	it('offers the copy where every note could be spelled', () => {
		const body = form('Warm');
		expect(body.querySelector('.sheetsmith-panel-problem')).toBeNull();
		expect(body.querySelector('.sheetsmith-panel-confirm')).not.toBeNull();
	});
});

describe('a note-only effect typed on a row', () => {
	function form(part: string): HTMLElement {
		const body = document.createElement('div');
		document.body.appendChild(body);
		const state = modifierFormState([part]);
		state.open = 0;
		const effect = {
			target: 'passive',
			operator: 'add' as const,
			amount: '',
			bonusType: 'item',
			note: 'Sharp',
		};
		renderModifierForm(body, state, {
			label: 'Ring',
			parts: [part],
			outcomes: () => [
				outcomeView({ typed: effect, target: 'passive', targetLabel: 'Passive perception', applies: true }),
			],
			definitions: [],
			targets: ACCEPTING,
			published: NOTABLE,
			noteTargets: NOTABLE,
			bonusTypes: ['item'],
			icon: () => undefined,
			onCommit: () => undefined,
			onPromote: () => Promise.resolve({ error: 'No layout here.' }),
			announce: () => undefined,
			onResize: () => undefined,
		});
		return body;
	}
	const select = (body: HTMLElement, key: string) =>
		body.querySelector<HTMLSelectElement>(`[data-sheetsmith-panel-field="${key}"]`) as HTMLSelectElement;

	it('disables the arithmetic controls until an amount is typed', () => {
		const body = form('passive += as item note: Sharp');
		const controls = ['operator', 'applies', 'bonus-type'].map((key) => select(body, key));
		expect(controls.map((one) => one.disabled)).toEqual([true, true, true]);
		expect(controls[2]?.value).toBe('item');
		const amount = body.querySelector<HTMLInputElement>('[data-sheetsmith-panel-field="amount"]') as HTMLInputElement;
		amount.value = '2';
		amount.dispatchEvent(new Event('input'));
		expect(controls.map((one) => one.disabled)).toEqual([false, false, false]);
		body.remove();
	});
});

describe('the operator a typed effect offers', () => {
	function form(part: string, operator: 'add' | 'upgrade'): HTMLElement {
		const body = document.createElement('div');
		document.body.appendChild(body);
		const state = modifierFormState([part]);
		state.open = 0;
		const effect = { target: 'armour_class', operator, amount: '4' };
		renderModifierForm(body, state, {
			label: 'Bear',
			parts: [part],
			outcomes: () => [
				outcomeView({ typed: effect, target: 'armour_class', targetLabel: 'Armour class', applies: true }),
			],
			definitions: [],
			targets: ACCEPTING,
			published: NOTABLE,
			noteTargets: NOTABLE,
			bonusTypes: ['item'],
			icon: () => undefined,
			onCommit: () => undefined,
			onPromote: () => Promise.resolve({ error: 'No layout here.' }),
			announce: () => undefined,
			onResize: () => undefined,
		});
		return body;
	}
	const field = (body: HTMLElement, key: string) =>
		body.querySelector<HTMLSelectElement>(`[data-sheetsmith-panel-field="${key}"]`);

	it('offers At least beside Adds to and Sets', () => {
		const body = form('armour_class += 4', 'add');
		const operator = field(body, 'operator') as HTMLSelectElement;
		expect(Array.from(operator.options).map((one) => one.textContent)).toEqual([
			'Adds to',
			'Sets',
			'At least',
		]);
		body.remove();
	});

	it('takes the phase and the bonus type away on At least, as on Sets', () => {
		const body = form('armour_class >= 4', 'upgrade');
		expect((field(body, 'operator') as HTMLSelectElement).value).toBe('upgrade');
		expect(field(body, 'applies')).toBeNull();
		expect(field(body, 'bonus-type')).toBeNull();
		body.remove();
	});
});

describe('a change that sets a level or a flag (docs/features/non-number-modifiers.md)', () => {
	const TRAINING = {
		flag: false,
		positions: 3,
		words: ['Untrained', 'Proficient', 'Expertise'],
		label: 'Training',
	};
	const STATES = [
		{ name: 'abilities.stealth', column: 'Training', label: 'Abilities · stealth · Training', shape: TRAINING },
		{
			name: 'inspiration',
			label: 'Inspiration',
			shape: { flag: true, positions: 2, words: ['off', 'on'], label: 'Inspiration' },
		},
	];

	it('offers Levels and flags between the two groups, and a value\'s own state there alone', () => {
		const select = document.createElement('select');
		fillTargetOptions(
			select,
			[...ACCEPTING, { name: 'inspiration', label: 'Inspiration' }],
			NOTABLE,
			STATES,
		);
		expect(
			Array.from(select.querySelectorAll('optgroup')).map((group) => [
				group.label,
				Array.from(group.querySelectorAll('option')).map((one) => one.textContent),
			]),
		).toEqual([
			['Takes modifiers', ['Armour class', 'Abilities · STR']],
			['Levels and flags', ['Abilities · stealth · Training', 'Inspiration']],
			['Notes only', ['Passive perception']],
		]);
	});

	it('draws the existing groups unchanged where the layout has no states', () => {
		const plain = document.createElement('select');
		fillTargetOptions(plain, ACCEPTING, NOTABLE);
		const empty = document.createElement('select');
		fillTargetOptions(empty, ACCEPTING, NOTABLE, []);
		expect(empty.innerHTML).toBe(plain.innerHTML);
	});

	/** The form open on one typed part aimed at Stealth's Training. */
	function form(part = 'abilities.stealth >= 1 in Training', announced: string[] = [], written: string[][] = []) {
		const body = document.body.createDiv();
		const state = modifierFormState([part]);
		state.open = 0;
		const options: ModifierFormOptions = {
			label: 'Cat Form',
			parts: [part],
			outcomes: () => [
				outcomeView({
					typed: {
						target: 'abilities.stealth',
						column: 'Training',
						operator: part.includes('+=') ? 'add' : 'upgrade',
						amount: '1',
					},
					target: 'abilities.stealth',
					targetLabel: 'Abilities · stealth · Training',
					applies: true,
					amount: 1,
					state: TRAINING,
				}),
			],
			definitions: [],
			targets: ACCEPTING,
			published: ACCEPTING,
			states: STATES,
			bonusTypes: ['item'],
			icon: () => undefined,
			onCommit: (parts) => written.push([...parts]),
			onPromote: () => Promise.resolve({ error: 'No layout here.' }),
			announce: (said) => announced.push(said),
			onResize: () => undefined,
		};
		renderModifierForm(body, state, options);
		return body;
	}

	/** The control under one field label. */
	const control = (body: HTMLElement, label: string) =>
		Array.from(body.querySelectorAll('.sheetsmith-panel-field'))
			.find((field) => field.querySelector('.sheetsmith-panel-field-label')?.textContent === label)
			?.querySelector('select, input') as HTMLSelectElement | HTMLInputElement | undefined;

	it('shows the state chosen, Sets and At least only, no bonus type or phase, and the legend', () => {
		const body = form();
		const value = control(body, 'Value') as HTMLSelectElement;
		expect(value.selectedOptions[0]?.textContent).toBe('Abilities · stealth · Training');
		const operator = control(body, 'Operator') as HTMLSelectElement;
		expect(Array.from(operator.options).map((one) => one.textContent)).toEqual(['Sets', 'At least']);
		expect(control(body, 'Bonus type')).toBeUndefined();
		expect(control(body, 'Applies to')).toBeUndefined();
		expect(body.querySelector('.sheetsmith-panel-legend')?.textContent).toBe(
			'0 Untrained · 1 Proficient · 2 Expertise',
		);
	});

	it('carries a stray column as written, never as the plain value it is not', () => {
		const body = document.body.createDiv();
		const part = 'abilities.stealth >= 1 in Trainig';
		const state = modifierFormState([part]);
		state.open = 0;
		renderModifierForm(body, state, {
			label: 'Cat Form',
			parts: [part],
			outcomes: () => [
				outcomeView({
					typed: { target: 'abilities.stealth', column: 'Trainig', operator: 'upgrade', amount: '1' },
					target: 'abilities.stealth',
					targetLabel: 'Abilities · stealth · Trainig',
					suppressed: 'Abilities · stealth has no level or flag called "Trainig".',
				}),
			],
			definitions: [],
			targets: [{ name: 'abilities.stealth', label: 'Abilities · stealth' }],
			published: [{ name: 'abilities.stealth', label: 'Abilities · stealth' }],
			states: STATES,
			bonusTypes: [],
			icon: () => undefined,
			onCommit: () => undefined,
			onPromote: () => Promise.resolve({ error: 'No layout here.' }),
			announce: () => undefined,
			onResize: () => undefined,
		});
		const value = control(body, 'Value') as HTMLSelectElement;
		expect(value.selectedOptions[0]?.textContent).toBe('Abilities · stealth · Trainig');
	});

	it('says why an Adds to at a state does nothing, in the sentence every surface shows', () => {
		const body = form('abilities.stealth += 1 in Training');
		expect(
			Array.from(body.querySelectorAll('.sheetsmith-panel-problem')).map((one) => one.textContent),
		).toContain('Adds to cannot change a level or a flag. Choose Sets or At least.');
	});

	it('switches an Adds to onto a state to Sets, says so, and writes the column clause', () => {
		const announced: string[] = [];
		const written: string[][] = [];
		const body = document.body.createDiv();
		const state = modifierFormState(['armour_class += 2']);
		state.open = 0;
		renderModifierForm(body, state, {
			label: 'Ring',
			parts: ['armour_class += 2'],
			outcomes: () => [
				outcomeView({
					typed: { target: 'armour_class', operator: 'add', amount: '2' },
					target: 'armour_class',
					targetLabel: 'Armour class',
					applies: true,
					amount: 2,
				}),
			],
			definitions: [],
			targets: ACCEPTING,
			published: ACCEPTING,
			states: STATES,
			bonusTypes: [],
			icon: () => undefined,
			onCommit: (parts) => written.push([...parts]),
			onPromote: () => Promise.resolve({ error: 'No layout here.' }),
			announce: (said) => announced.push(said),
			onResize: () => undefined,
		});
		const value = control(body, 'Value') as HTMLSelectElement;
		const option = Array.from(value.options).find((one) => one.textContent === 'Abilities · stealth · Training');
		value.value = option?.value ?? '';
		value.dispatchEvent(new Event('change'));
		expect(announced).toContain('Operator Sets');
		expect(written).toEqual([['abilities.stealth = 2 in Training']]);
	});

	it('refuses a column a cell could not spell, at the pick', () => {
		const announced: string[] = [];
		const written: string[][] = [];
		const body = document.body.createDiv();
		const state = modifierFormState(['inspiration = true']);
		state.open = 0;
		renderModifierForm(body, state, {
			label: 'Ring',
			parts: ['inspiration = true'],
			outcomes: () => [
				outcomeView({
					typed: { target: 'inspiration', operator: 'override', amount: 'true' },
					target: 'inspiration',
					targetLabel: 'Inspiration',
					applies: true,
					amount: 1,
				}),
			],
			definitions: [],
			targets: [],
			published: [],
			states: [
				...STATES,
				{ name: 'skills.stealth', column: 'Skill in hand', label: 'Skills · stealth · Skill in hand', shape: TRAINING },
			],
			bonusTypes: [],
			icon: () => undefined,
			onCommit: (parts) => written.push([...parts]),
			onPromote: () => Promise.resolve({ error: 'No layout here.' }),
			announce: (said) => announced.push(said),
			onResize: () => undefined,
		});
		const value = control(body, 'Value') as HTMLSelectElement;
		const option = Array.from(value.options).find((one) => one.textContent === 'Skills · stealth · Skill in hand');
		value.value = option?.value ?? '';
		value.dispatchEvent(new Event('change'));
		const refusal =
			'"Skill in hand" cannot be set from a row\'s own modifier, because a cell spells that word as a clause. Name the change in a modifier definition instead.';
		expect(announced).toContain(refusal);
		expect(body.textContent).toContain(refusal);
		expect(written).toEqual([]);
	});
});

describe('a change that grants temporary points (docs/features/granted-temporary-points.md)', () => {
	const BUFFERS = [{ name: 'hp.temp', label: 'HP · temp', called: 'HP' }];
	const ACCEPT = [{ name: 'armour_class', label: 'Armour class' }];

	it('offers Temporary points after the levels and flags and before the notes', () => {
		const select = document.createElement('select');
		fillTargetOptions(
			select,
			ACCEPT,
			[{ name: 'passive', label: 'Passive perception' }],
			[{ name: 'inspiration', label: 'Inspiration', shape: { flag: true, positions: 2, words: ['off', 'on'], label: 'Inspiration' } }],
			BUFFERS,
		);
		expect(Array.from(select.querySelectorAll('optgroup')).map((group) => group.label)).toEqual([
			'Takes modifiers',
			'Levels and flags',
			'Temporary points',
			'Notes only',
		]);
		expect(select.querySelector('optgroup[label="Temporary points"] option')?.textContent).toBe('HP · temp');
	});

	it('draws today’s list where the layout has no buffer', () => {
		const plain = document.createElement('select');
		fillTargetOptions(plain, ACCEPT, []);
		const none = document.createElement('select');
		fillTargetOptions(none, ACCEPT, [], [], []);
		expect(none.innerHTML).toBe(plain.innerHTML);
	});

	function form(part: string, announced: string[] = [], written: string[][] = []) {
		const body = document.body.createDiv();
		const state = modifierFormState([part]);
		state.open = 0;
		renderModifierForm(body, state, {
			label: 'Ring of Vitality',
			parts: [part],
			outcomes: () => [
				outcomeView({
					typed: {
						target: part.startsWith('hp.temp') ? 'hp.temp' : 'armour_class',
						operator: part.includes('+=') ? 'add' : part.includes('>=') ? 'upgrade' : 'override',
						amount: '5',
					},
					target: part.startsWith('hp.temp') ? 'hp.temp' : 'armour_class',
					targetLabel: part.startsWith('hp.temp') ? 'HP · temp' : 'Armour class',
					applies: true,
					amount: 5,
				}),
			],
			definitions: [],
			targets: ACCEPT,
			published: [...ACCEPT, { name: 'hp.temp', label: 'HP · temp' }],
			buffers: BUFFERS,
			bonusTypes: ['item'],
			icon: () => undefined,
			onCommit: (parts) => written.push([...parts]),
			onPromote: () => Promise.resolve({ error: 'No layout here.' }),
			announce: (said) => announced.push(said),
			onResize: () => undefined,
		});
		return body;
	}

	const control = (body: HTMLElement, label: string) =>
		Array.from(body.querySelectorAll('.sheetsmith-panel-field'))
			.find((one) => one.querySelector('.sheetsmith-panel-field-label')?.textContent === label)
			?.querySelector('select, input') as HTMLSelectElement | HTMLInputElement | undefined;

	it('offers At least only, no bonus type or phase, and the legend', () => {
		const body = form('hp.temp >= 5');
		const operator = control(body, 'Operator') as HTMLSelectElement;
		expect(Array.from(operator.options).map((one) => one.textContent)).toEqual(['At least']);
		expect(control(body, 'Bonus type')).toBeUndefined();
		expect(control(body, 'Applies to')).toBeUndefined();
		expect(body.querySelector('.sheetsmith-panel-legend')?.textContent).toBe(
			'Whole points. The highest grant, or the pool\'s own, applies.',
		);
		body.remove();
	});

	it('keeps a stored Adds to in the list and says why it grants nothing', () => {
		const body = form('hp.temp += 5');
		const operator = control(body, 'Operator') as HTMLSelectElement;
		expect(Array.from(operator.options).map((one) => one.textContent)).toEqual(['At least', 'Adds to']);
		expect(Array.from(body.querySelectorAll('.sheetsmith-panel-problem')).map((one) => one.textContent)).toContain(
			'Temporary points do not add up, so only the highest grant applies. Choose At least.',
		);
		body.remove();
	});

	it('switches a change moved onto a buffer to At least, and says so', () => {
		const announced: string[] = [];
		const written: string[][] = [];
		const body = form('armour_class += 5', announced, written);
		const value = control(body, 'Value') as HTMLSelectElement;
		value.value = 'hp.temp';
		value.dispatchEvent(new Event('change'));
		expect(announced).toContain('Operator At least');
		expect(written).toEqual([['hp.temp >= 5']]);
		body.remove();
	});
});
