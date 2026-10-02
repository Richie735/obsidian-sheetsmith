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
