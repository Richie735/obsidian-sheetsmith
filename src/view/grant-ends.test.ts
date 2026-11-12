// @vitest-environment happy-dom
/*
 * A grant's spent record cleared in the write that ended it
 * (`docs/features/granted-temporary-points.md` D7, D10).
 *
 * Two halves. The pass itself, `grantEndEdits`, is driven over a note's text
 * before and after an edit, which is the whole of what it reads, so every kind
 * of edit that can end a grant — a toggle, a form switched out, a record
 * deleted, a row renamed — is one pair of texts. Then a real `SheetView`, for
 * the claim the pass exists for: the edit and the clearing are one commit.
 */
import { describe, expect, it, vi } from 'vitest';
import { getComponent } from '../components';
import { parseCharacter } from '../parse/character';
import { Layout, parseLayout } from '../parse/layout';
import { buildSheet } from '../formula/sheet';
import { NO_FUNCTIONS } from '../formula/expression';
import { ComponentConfig } from '../types';
import { grantEndEdits, recordedActiveGrants } from './grant-ends';
import { readComponents } from './read-components';
import { walkLayout } from './grid-cells';
import { applySectionWrites } from '../parse/character';
import { note, settle, sheetOn } from '../test/sheet-on-note';
import { SheetView } from './sheet-view';

const HP = {
	id: 'hp',
	type: 'pool',
	label: 'HP',
	max: '30',
	hasTemp: true,
	reset: [{ trigger: 'Long rest', action: 'full', buffer: 'clear' }],
};
const GEAR = {
	id: 'gear',
	type: 'table',
	label: 'Gear',
	rowHeader: 'Item',
	openRows: true,
	columns: [
		{ key: 'Worn', type: 'toggle' },
		{ key: 'Modifiers', type: 'modifier' },
	],
};
const WILD_SHAPE = {
	id: 'wild_shape',
	type: 'stat-block',
	label: 'Wild Shape',
	recordName: 'Form',
	fields: [
		{ key: 'Active', type: 'toggle' },
		{ key: 'Modifiers', type: 'modifier' },
	],
	exclusive: 'Active',
};
const SPELLS = {
	id: 'spells',
	type: 'record-set',
	label: 'Spells',
	recordName: 'Spell',
	fields: [
		{ key: 'Active', type: 'toggle' },
		{ key: 'Modifiers', type: 'modifier' },
	],
};
const CONDITIONS = {
	id: 'conditions',
	type: 'table',
	label: 'Conditions',
	rowHeader: 'Condition',
	openRows: true,
	columns: [
		{ key: 'Active', type: 'toggle' },
		{ key: 'Modifiers', type: 'modifier' },
	],
	reset: [{ trigger: 'Long rest', action: 'empty', column: 'Active' }],
};

const pool = (...lines: string[]) => `\`\`\`sheet\n${lines.join('\n')}\n\`\`\`\n`;
const gear = (...rows: [string, boolean, string][]) =>
	[
		'| Item | Worn | Modifiers |',
		'| --- | --- | --- |',
		...rows.map(([item, worn, cell]) => `| ${item} | ${worn ? 'yes' : ''} | ${cell} |`),
		'',
	].join('\n');
const form = (name: string, active: boolean, modifiers: string) =>
	`### ${name}\n\`\`\`sheet\nActive: ${active ? 'yes' : 'no'}\nModifiers: ${modifiers}\n\`\`\`\n`;

function layoutOf(...components: Record<string, unknown>[]): Layout {
	return parseLayout(
		JSON.stringify({
			name: 'L',
			triggers: ['Long rest'],
			components: components.map((component, index) => ({
				position: { col: 1, row: 1 + index * 3, width: 6, height: 3 },
				...component,
			})),
		}),
	);
}

/** What the pass adds to the batch, for one edit from `before` to `after`. */
function ended(layout: Layout, before: string, after: string, build = buildSheet) {
	const prepared = readComponents(parseCharacter(before), walkLayout(layout.components));
	const { modifiers } = buildSheet(layout, prepared, NO_FUNCTIONS);
	return grantEndEdits(recordedActiveGrants(prepared, modifiers), layout, NO_FUNCTIONS, after, build);
}

/** The next text with the pass's edits written into it, as the view writes it. */
function cleared(layout: Layout, before: string, after: string): string {
	const edits = ended(layout, before, after);
	return applySectionWrites(
		after,
		edits.map(({ component, config, data }) => ({
			label: config.label,
			write: (body: string | null) => component.write(data, body, config),
		})),
	).text;
}

describe('which edits end a recorded grant', () => {
	const layout = layoutOf(HP, GEAR);
	const before = note(
		['HP', pool('current: 22', 'temp: 0', 'spent · Gear · Ring: 2')],
		['Gear', gear(['Ring', true, 'hp.temp >= 5 when Worn'])],
	);

	it('clears the record of a Table row whose Worn was turned off', () => {
		const after = note(
			['HP', pool('current: 22', 'temp: 0', 'spent · Gear · Ring: 2')],
			['Gear', gear(['Ring', false, 'hp.temp >= 5 when Worn'])],
		);
		expect(cleared(layout, before, after)).toBe(
			note(['HP', pool('current: 22', 'temp: 0')], ['Gear', gear(['Ring', false, 'hp.temp >= 5 when Worn'])]),
		);
	});

	it('clears the record of a Table row that was renamed, the new name a new source', () => {
		const after = note(
			['HP', pool('current: 22', 'temp: 0', 'spent · Gear · Ring: 2')],
			['Gear', gear(['Ring of Vitality', true, 'hp.temp >= 5 when Worn'])],
		);
		expect(cleared(layout, before, after)).toContain('```sheet\ncurrent: 22\ntemp: 0\n```');
	});

	it('clears the record of a Stat block form switched out', () => {
		const forms = layoutOf(HP, WILD_SHAPE);
		const was = note(
			['HP', pool('current: 22', 'temp: 0', 'spent · Wild Shape · Brown Bear: 7')],
			['Wild Shape', form('Brown Bear', true, 'hp.temp >= 10') + '\n' + form('Wolf', false, 'hp.temp >= 4')],
		);
		const now = note(
			['HP', pool('current: 22', 'temp: 0', 'spent · Wild Shape · Brown Bear: 7')],
			['Wild Shape', form('Brown Bear', false, 'hp.temp >= 10') + '\n' + form('Wolf', true, 'hp.temp >= 4')],
		);
		expect(cleared(forms, was, now)).toContain('```sheet\ncurrent: 22\ntemp: 0\n```');
	});

	it('clears the record of a Record set record that was deleted', () => {
		const spells = layoutOf(HP, SPELLS);
		const was = note(
			['HP', pool('current: 22', 'temp: 0', 'spent · Spells · False Life: 3')],
			['Spells', form('False Life', true, 'hp.temp >= 8 when Active')],
		);
		const now = note(['HP', pool('current: 22', 'temp: 0', 'spent · Spells · False Life: 3')], ['Spells', '']);
		expect(cleared(spells, was, now)).toContain('```sheet\ncurrent: 22\ntemp: 0\n```');
	});

	it('leaves a record whose grant is still active after the edit', () => {
		const after = note(
			['HP', pool('current: 19', 'temp: 0', 'spent · Gear · Ring: 2')],
			['Gear', gear(['Ring', true, 'hp.temp >= 5 when Worn'])],
		);
		expect(ended(layout, before, after)).toEqual([]);
	});

	it('builds no second walk where no grant on the sheet has a record', () => {
		const bare = note(['HP', pool('current: 22', 'temp: 0')], ['Gear', gear(['Ring', true, 'hp.temp >= 5 when Worn'])]);
		const build = vi.fn(buildSheet);
		const after = bare.replace('| yes |', '|  |');
		expect(ended(layout, bare, after, build)).toEqual([]);
		expect(build).not.toHaveBeenCalled();
	});

	it('leaves a leftover alone: an edit cannot end a grant that was not on (D10)', () => {
		const off = note(
			['HP', pool('current: 22', 'temp: 0', 'spent · Gear · Ring: 2')],
			['Gear', gear(['Ring', false, 'hp.temp >= 5 when Worn'])],
		);
		const build = vi.fn(buildSheet);
		expect(ended(layout, off, off.replace('current: 22', 'current: 21'), build)).toEqual([]);
		expect(build).not.toHaveBeenCalled();
	});
});

/** A real sheet, and every commit it makes. */
async function viewOn(components: Record<string, unknown>[], text: string) {
	const { view } = await sheetOn(components, text, { triggers: ['Long rest'] });
	const commits = vi.spyOn(view as unknown as { commit(text: string): void }, 'commit');
	const data = () => (view as unknown as { data: string }).data;
	return { view, commits, data };
}

/** The edit a component reports, through the view's own door for it. */
function report(view: SheetView, components: Record<string, unknown>[], id: string, edited: unknown): void {
	const config = components.find((one) => one['id'] === id) as unknown as ComponentConfig;
	const component = getComponent(config.type);
	(view as unknown as { applyEdit(c: unknown, k: unknown, d: unknown): void }).applyEdit(component, config, edited);
}

describe('the view: the edit and the clearing are one write', () => {
	it('writes the toggle and removes the record in one save', async () => {
		const components = [HP, GEAR];
		const { view, commits, data } = await viewOn(
			components,
			note(
				['HP', pool('current: 22', 'temp: 0', 'spent · Gear · Ring: 2')],
				['Gear', gear(['Ring', true, 'hp.temp >= 5 when Worn'])],
			),
		);
		const read = getComponent('table')?.read(gear(['Ring', false, 'hp.temp >= 5 when Worn']), GEAR as unknown as ComponentConfig);
		if (read?.ok !== true) throw new Error('read failed');
		report(view, components, 'gear', read.data);
		expect(commits).toHaveBeenCalledTimes(1);
		expect(data()).toBe(
			note(['HP', pool('current: 22', 'temp: 0')], ['Gear', gear(['Ring', false, 'hp.temp >= 5 when Worn'])]),
		);
	});

	it('removes the records of the conditions a long rest switched off, and its undo restores both', async () => {
		const components = [HP, CONDITIONS];
		const conditions = (active: boolean) =>
			[
				'| Condition | Active | Modifiers |',
				'| --- | --- | --- |',
				`| Heroism | ${active ? 'yes' : ''} | hp.temp >= 4 when Active |`,
				'',
			].join('\n');
		const before = note(
			['HP', pool('current: 12', 'temp: 3', 'spent · Conditions · Heroism: 1')],
			['Conditions', conditions(true)],
		);
		const { view, commits, data } = await viewOn(components, before);
		const host = view as unknown as {
			applyPlan(name: string, plan: unknown): void;
			restoreDocument(previous: string, expected: { text: string }): void;
			undoExpectation: { text: string } | null;
		};
		const { planTrigger, boundTo } = await import('./reset-plan');
		const layout = layoutOf(...components);
		const prepared = readComponents(parseCharacter(before), walkLayout(layout.components));
		const { env } = buildSheet(layout, prepared, NO_FUNCTIONS);
		host.applyPlan('Long rest', planTrigger('Long rest', boundTo('Long rest', prepared), env));
		expect(commits).toHaveBeenCalledTimes(1);
		const rested = data();
		expect(rested).toContain('```sheet\ncurrent: 30\ntemp: 0\n```');
		expect(rested).not.toContain('spent · Conditions · Heroism');
		expect(rested).toContain('| Heroism | no |');
		host.restoreDocument(before, host.undoExpectation ?? { text: rested });
		await settle();
		expect(data()).toBe(before);
	});

	it('keeps a record whose source was turned off in markdown view, then grants in full after an off and on (D10)', async () => {
		const components = [HP, GEAR];
		// Turned off by hand: the sheet never saw it end, so the record stays.
		const { view, data } = await viewOn(
			components,
			note(
				['HP', pool('current: 22', 'temp: 0', 'spent · Gear · Ring: 2')],
				['Gear', gear(['Ring', false, 'hp.temp >= 5 when Worn'])],
			),
		);
		expect(view.containerEl.querySelector('.sheetsmith-sr-only')?.textContent).toBe(
			'Not granting now: Gear · Ring, 2 spent\n\nNow 0',
		);
		const toggled = (worn: boolean) => {
			const read = getComponent('table')?.read(gear(['Ring', worn, 'hp.temp >= 5 when Worn']), GEAR as unknown as ComponentConfig);
			if (read?.ok !== true) throw new Error('read failed');
			return read.data;
		};
		// On in the sheet: the record applies, so it reads partly spent.
		report(view, components, 'gear', toggled(true));
		await settle();
		expect(data()).toContain('spent · Gear · Ring: 2');
		expect(view.containerEl.querySelector<HTMLInputElement>('.sheetsmith-pool-temp-input')?.value).toBe('3');
		// Off and on again in the sheet: the off clears it, the on grants in full.
		report(view, components, 'gear', toggled(false));
		await settle();
		expect(data()).not.toContain('spent · Gear · Ring');
		report(view, components, 'gear', toggled(true));
		await settle();
		expect(view.containerEl.querySelector<HTMLInputElement>('.sheetsmith-pool-temp-input')?.value).toBe('5');
	});
});
