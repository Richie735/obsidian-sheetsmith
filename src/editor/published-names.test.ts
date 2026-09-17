// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderPublishedNames } from './published-names';
import { getComponent } from '../components';
import { vocabularySource } from '../formula/vocabulary';
import { ComponentConfig } from '../types';

/*
 * The inventory at the top of a component's form.
 *
 * Driven over real registered components, for `vocabulary.test.ts`'s reason: the
 * claim is about what the contract declares, and a hand-written scope value
 * would assert the drawing and nothing about the declaration behind it.
 */

function component(over: Record<string, unknown>): ComponentConfig {
	return {
		position: { col: 1, row: 1, width: 1, height: 1 },
		...over,
	} as unknown as ComponentConfig;
}

/** Draw one component's inventory and hand back the block. */
function render(config: ComponentConfig): HTMLElement {
	const into = document.createElement('div');
	renderPublishedNames(into, vocabularySource(config, getComponent(config.type)));
	return into;
}

/** Every chip in the block, as shown text and what it copies. */
function chips(into: HTMLElement): { shown: string; label: string; title: string | null }[] {
	return Array.from(into.querySelectorAll('code.sheetsmith-copyable')).map((code) => ({
		shown: code.textContent ?? '',
		label: code.getAttribute('aria-label') ?? '',
		title: code.getAttribute('title'),
	}));
}

function groups(into: HTMLElement): HTMLElement[] {
	return Array.from(
		into.querySelectorAll<HTMLElement>('.sheetsmith-published-name'),
	);
}

describe('a component that publishes names', () => {
	const cardSet = component({
		id: 'abilities',
		type: 'card-set',
		label: 'Abilities',
		entries: [
			{ key: 'STR', name: 'Strength' },
			{ key: 'DEX', name: 'Dexterity' },
			{ key: 'CON', name: 'Constitution' },
			{ key: 'INT', name: 'Intelligence' },
			{ key: 'WIS', name: 'Wisdom' },
			{ key: 'CHA', name: 'Charisma' },
		],
	});

	it('draws one group per name', () => {
		expect(groups(render(cardSet))).toHaveLength(6);
	});

	it('leads in with how a formula reads it', () => {
		expect(render(cardSet).textContent).toContain('Formulas read this component as');
	});

	it('gives each group the name, its stored value and its modifier form', () => {
		const group = groups(render(cardSet))[0] as HTMLElement;
		expect(chips(group)).toEqual([
			{
				shown: 'abilities.STR',
				label: 'Copy "abilities.STR" to the clipboard',
				title: null,
			},
			// The announcement is what the press *copies*, because the composed
			// name contains the visible text and WCAG 2.5.3 asks only for that.
			{
				shown: '.value',
				label: 'Copy "abilities.STR.value" to the clipboard',
				title: 'abilities.STR.value',
			},
			{
				shown: 'mod.',
				label: 'Copy "mod.abilities.STR" to the clipboard',
				title: 'mod.abilities.STR',
			},
		]);
	});

	it('sizes the forms down and never the name', () => {
		const group = groups(render(cardSet))[0] as HTMLElement;
		const forms = Array.from(group.querySelectorAll('.sheetsmith-published-form'));
		expect(forms.map((el) => el.textContent)).toEqual(['.value', 'mod.']);
	});

	it('offers a ceiling only where the entry has one', () => {
		const track = component({
			id: 'slots',
			type: 'track',
			label: 'Spell slots',
			rows: [{ key: 'L1', name: '1st', count: 4 }],
		});
		const group = groups(render(track))[0] as HTMLElement;
		expect(chips(group).map((chip) => chip.shown)).toEqual([
			'slots.L1',
			'.value',
			'.left',
			'mod.',
		]);
	});
});

describe('a component that publishes rows', () => {
	const recordSet = component({
		id: 'traits',
		type: 'record-set',
		label: 'Traits',
		fields: [{ key: 'uses', type: 'number' }],
	});

	it('offers the two aggregates and nothing else', () => {
		const into = render(recordSet);
		expect(chips(into).map((chip) => chip.shown)).toEqual([
			'sum(traits, …)',
			'count(traits, …)',
		]);
	});

	it('copies the call up to its second argument', () => {
		// So the paste lands the caret where the expression goes. This one
		// announces what it *shows*, because what it copies does not contain the
		// visible text — the ellipsis is exactly the part that is not copied.
		const into = render(recordSet);
		expect(chips(into)[0]?.label).toBe('Copy "sum(traits, …)" to the clipboard');
	});

	it('leads in with what a formula reads it with, not as', () => {
		expect(render(recordSet).textContent).toContain(
			'Formulas read this component with',
		);
	});

	it('offers both halves where a component publishes names and rows', () => {
		const table = component({
			id: 'inventory',
			type: 'table',
			label: 'Inventory',
			columns: [{ key: 'Weight', type: 'number', total: true }],
		});
		const into = render(table);
		const shown = chips(into).map((chip) => chip.shown);
		expect(shown).toContain('inventory.Weight');
		expect(shown).toContain('sum(inventory, …)');
		// Two runs and two clauses, never one run: a call template drawn at the
		// end of the names reads as one more name, which is what forced colors
		// caught when `count(inventory, …)` wrapped alone onto a line.
		expect(into.querySelectorAll('.sheetsmith-published-names')).toHaveLength(2);
		expect(into.textContent).toContain('and read its rows with');
	});

	it('keeps the calls in the run the names are not in', () => {
		const table = component({
			id: 'inventory',
			type: 'table',
			label: 'Inventory',
			columns: [{ key: 'Weight', type: 'number', total: true }],
		});
		const runs = Array.from(
			render(table).querySelectorAll<HTMLElement>('.sheetsmith-published-names'),
		);
		expect(runs[0]?.textContent).toBe('inventory.Weight.valuemod.');
		expect(runs[1]?.textContent).toBe('sum(inventory, …)count(inventory, …)');
	});
});

describe('a component that publishes nothing', () => {
	it('says so, and offers no chip at all', () => {
		const group = component({ id: 'sidebar', type: 'group', label: 'Sidebar' });
		const into = render(group);
		expect(into.textContent).toBe('Formulas cannot read this component.');
		expect(chips(into)).toEqual([]);
	});
});
