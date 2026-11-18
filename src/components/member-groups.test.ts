// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
	GROUPS_NOT_A_LIST,
	groupsFault,
	memberSlot,
	ownGroups,
	rowGroups,
} from './member-groups';
import { card, CardConfig } from './card';
import { cardSet, CardSetConfig } from './card-set';
import { roster, RosterConfig } from './roster';
import { table, TableConfig } from './table';
import { modifierOutcomeText } from './modifier-breakdown';
import { buildSheet, ReadComponent } from '../formula/sheet';
import { makeFieldResolver } from '../formula/resolve';
import { Layout } from '../parse/layout';
import { ComponentConfig, ComponentDefinition, ModifierGroup } from '../types';

/*
 * Which modifier groups a value is in (`docs/features/table-row-modifier-target.md`
 * D4, D5), and a group change reaching each kind of member through the real
 * sheet: Card, Card set entry, Table row and Roster row, keyed or not, and a
 * row the character added.
 */

describe('rowGroups', () => {
	it("adds a row's own list to the default, repeats dropped", () => {
		expect(rowGroups({ groups: ['dex_based', 'skill'] }, ['skill'])).toEqual(['skill', 'dex_based']);
	});

	it('leaves a row with an absent or empty own list in the default alone', () => {
		expect(rowGroups({}, ['skill'])).toEqual(['skill']);
		expect(rowGroups({ groups: [] }, ['skill'])).toEqual(['skill']);
		expect(rowGroups(undefined, ['skill'])).toEqual(['skill']);
	});

	it('leaves a row that does not inherit in its own list alone, and with none in no group', () => {
		expect(rowGroups({ inheritGroups: false, groups: ['init'] }, ['check'])).toEqual(['init']);
		expect(rowGroups({ inheritGroups: false }, ['check'])).toEqual([]);
	});

	it('reaches a row with a list of its own when a group is added to the default', () => {
		const row = { groups: ['dex_based'] };
		expect(rowGroups(row, ['skill', 'check'])).toEqual(['skill', 'check', 'dex_based']);
	});

	it('trims names and drops blanks', () => {
		expect(ownGroups([' save ', '', 'save', 'check'])).toEqual(['save', 'check']);
	});
});

describe('a groups value that is not a list of names', () => {
	it('refuses the configuration with the one sentence', () => {
		expect(groupsFault('save')).toBe(GROUPS_NOT_A_LIST);
		expect(groupsFault([1])).toBe(GROUPS_NOT_A_LIST);
		expect(groupsFault(['save'])).toBeNull();
		expect(groupsFault(undefined)).toBeNull();
		expect(GROUPS_NOT_A_LIST).toBe(
			'Groups are a list of group names. Write the group on each row that belongs to it.',
		);
	});

	it('refuses a Card, a Card set, a Table and a Roster that hold one', () => {
		const bad = 'abilities.DEX' as unknown as string[];
		expect(card.read('', { ...perception, groups: bad })).toEqual({ ok: false, error: GROUPS_NOT_A_LIST });
		expect(
			cardSet.read('', { ...abilities, entries: [{ key: 'STR', groups: bad }] }),
		).toEqual({ ok: false, error: GROUPS_NOT_A_LIST });
		expect(table.read('', { ...saves, groups: bad })).toEqual({ ok: false, error: GROUPS_NOT_A_LIST });
		expect(
			roster.read('', { ...skills, rows: [{ label: 'Athletics', stat: 'STR', groups: bad }] }),
		).toEqual({ ok: false, error: GROUPS_NOT_A_LIST });
	});
});

const at = (col: number) => ({ col, row: 1, width: 2, height: 2 });

const GROUPS: ModifierGroup[] = [
	{ name: 'save', label: 'Saving throws' },
	{ name: 'skill', label: 'Skills' },
	{ name: 'attack', label: 'Attacks' },
	{ name: 'check', label: 'Checks' },
	{ name: 'dc', label: 'Defences' },
	{ name: 'empty', label: 'Empty' },
];

const saves: TableConfig = {
	id: 'saves',
	type: 'table',
	label: 'Saves',
	position: at(1),
	groups: ['save'],
	rows: ['str', 'dex', 'con', 'int', 'wis', 'cha'].map((key) => ({ label: key.toUpperCase(), key })),
	columns: [{ key: 'Bonus', type: 'computed', formula: '2 + mod.self', publish: true }],
};

const attacks: TableConfig = {
	id: 'attacks',
	type: 'table',
	label: 'Attacks',
	position: at(3),
	openRows: true,
	groups: ['attack'],
	rowHeader: 'Attack',
	columns: [{ key: 'Hit', type: 'computed', formula: '3 + mod.self', publish: true }],
};

const perception: CardConfig = {
	id: 'perception',
	type: 'card',
	label: 'Perception',
	position: at(5),
	derived: '10 + mod.self',
	groups: ['check'],
};

const abilities: CardSetConfig = {
	id: 'abilities',
	type: 'card-set',
	label: 'Abilities',
	position: at(7),
	entries: [{ key: 'STR', groups: ['check'] }, { key: 'DEX' }],
	derived: 'floor((value - 10) / 2) + mod.self',
};

const skills: RosterConfig = {
	id: 'skills',
	type: 'roster',
	label: 'Skills',
	position: at(9),
	groups: ['skill'],
	stats: [{ key: 'STR', name: 'Strength' }],
	rows: [
		{ label: 'Athletics', stat: 'STR', key: 'athletics' },
		{ label: 'Climbing', stat: 'STR' },
		{ label: 'Initiative', stat: 'STR', key: 'init', inheritGroups: false },
	],
	columns: [
		{ key: 'Training', type: 'level', levels: ['Untrained', 'Proficient', 'Expertise'] },
		{ key: 'Total', type: 'computed', formula: 'stat + mod.self', publish: true },
	],
};

const gear: TableConfig = {
	id: 'gear',
	type: 'table',
	label: 'Gear',
	position: at(11),
	openRows: true,
	rowHeader: 'Item',
	columns: [
		{ key: 'Worn', type: 'toggle' },
		{ key: 'Modifiers', type: 'modifier', hideHeading: true },
	],
};

/** A markdown table body under the given header. */
const tableBody = (header: string[], rows: string[][]): string =>
	[
		`| ${header.join(' | ')} |`,
		`| ${header.map(() => '---').join(' | ')} |`,
		...rows.map((cells) => `| ${cells.join(' | ')} |`),
	].join('\n');

/** The sheet over every member above, with Gear's rows pushing what is given. */
function sheetOf(gearRows: string[][], attackRows: string[] = ['Longsword', 'Longsword']) {
	const parts: [ComponentConfig, ComponentDefinition<never, never>, string][] = [
		[saves, table as never, ''],
		[attacks, table as never, tableBody(['Attack'], attackRows.map((name) => [name]))],
		[perception, card as never, ''],
		[abilities, cardSet as never, '```sheet\nSTR: 10\nDEX: 10\n```'],
		[
			skills,
			roster as never,
			['```sheet', 'STR: 1', '```', '', tableBody(['Skill', 'Training'], [['Athletics', '0'], ['Climbing', '0'], ['Initiative', '0']])].join('\n'),
		],
		[gear, table as never, tableBody(['Item', 'Worn', 'Modifiers'], gearRows)],
	];
	const prepared: ReadComponent[] = parts.map(([config, component, body]) => {
		const definition = component as unknown as ComponentDefinition;
		const read = definition.read(body, config);
		if (!read.ok) throw new Error(read.error);
		return { config, component: definition, data: read.data, error: null };
	});
	const layout: Layout = {
		name: 'Groups',
		modifierGroups: GROUPS,
		components: parts.map(([config]) => config),
	};
	return { ...buildSheet(layout, prepared), prepared };
}

/** What the given slot holds, or its refusal. */
function totalAt(sheet: ReturnType<typeof sheetOf>, name: string): number | string {
	const result = sheet.env.modifiers(name);
	return 'error' in result ? result.error : result.total;
}

describe('a group change through the real sheet', () => {
	it('reaches every kind of member, keyed and unkeyed, and the rows a character added', () => {
		const sheet = sheetOf([['Bless', 'yes', '@save, @attack, @check, @skill += 1 when Worn']]);
		for (const name of ['saves.str', 'saves.cha', 'perception', 'abilities.STR', 'skills.athletics']) {
			expect(totalAt(sheet, name)).toBe(1);
		}
		// Two character rows named alike get two slots, by position.
		expect(totalAt(sheet, memberSlot('attacks', 0))).toBe(1);
		expect(totalAt(sheet, memberSlot('attacks', 1))).toBe(1);
		// A declared roster row with no key, through the roster's default.
		expect(totalAt(sheet, memberSlot('skills', 1))).toBe(1);
		// Not in a group: DEX names none, and Initiative left the default.
		expect(totalAt(sheet, 'abilities.DEX')).toBe(0);
		expect(totalAt(sheet, 'skills.init')).toBe(0);
		// The numbers themselves move, through `mod.self`.
		expect(sheet.env.sheet('saves.str')).toBe(3);
		expect(sheet.env.sheet('perception')).toBe(11);
		expect(sheet.env.sheet('abilities.STR')).toBe(1);
	});

	it("moves an unnamed row's own cell, and publishes no name for it", () => {
		const sheet = sheetOf([['Bless', 'yes', '@attack += 1']]);
		const rows = sheet.env.rows?.('attacks', 'test');
		if (rows === undefined || 'error' in rows) throw new Error('no rows');
		expect(rows.rows.map((row) => row.values.Hit)).toEqual([4, 4]);
		expect(sheet.env.sheet('attacks.Longsword')).toBeUndefined();
	});

	it('keeps the second row\'s total when the first is deleted', () => {
		const before = sheetOf([['Bless', 'yes', '@attack += 1']], ['Longsword', 'Longsword']);
		const after = sheetOf([['Bless', 'yes', '@attack += 1']], ['Longsword']);
		expect(totalAt(after, memberSlot('attacks', 0))).toBe(totalAt(before, memberSlot('attacks', 1)));
	});

	it('reads mod.self as 0 on a row in no group', () => {
		const sheet = sheetOf([['Bless', 'yes', '@save += 1']]);
		const rows = sheet.env.rows?.('attacks', 'test');
		if (rows === undefined || 'error' in rows) throw new Error('no rows');
		expect(rows.rows.map((row) => row.values.Hit)).toEqual([3, 3]);
	});

	it('names the group on each member\'s breakdown line', () => {
		const sheet = sheetOf([['Cloak of Protection', 'yes', '@save += 1 as item']]);
		expect(sheet.modifiers.breakdown?.('saves.dex').lines[0]?.via).toEqual([GROUPS[0]]);
		expect(sheet.modifiers.breakdown?.(memberSlot('attacks', 0)).lines).toEqual([]);
	});

	it('marks a computed cell a group reached on a row with no name', () => {
		const sheet = sheetOf([['Bless', 'yes', '@attack += 1']]);
		const entry = sheet.prepared[1] as ReadComponent;
		const el = document.createElement('div');
		table.render(el, attacks, entry.data as never, {
			resolved: {},
			resolveField: makeFieldResolver(table, attacks, entry.data, sheet.env),
			onChange: () => undefined,
			modifiers: sheet.modifiers,
		});
		expect(el.querySelectorAll('.sheetsmith-modified')).toHaveLength(2);
	});
});

describe("the source row's reach line", () => {
	/** Gear's first row's first outcome, and its text. */
	function reach(cell: string, worn = 'yes', extra: string[][] = []) {
		const sheet = sheetOf([['Charm', worn, cell], ...extra]);
		const outcome = sheet.modifiers.outcomes?.(cell, { label: 'Charm', values: { Worn: worn === 'yes' } }, 'Gear')[0];
		if (outcome === undefined) throw new Error('no outcome');
		return { outcome, text: modifierOutcomeText(cell, outcome) };
	}

	it('counts the values a group reaches, under its label', () => {
		expect(reach('@save += 1 as item when Worn').text).toBe(
			'Saving throws — item +1\nReaches 6 values, only while Worn, which holds now',
		);
		expect(reach('@save += 1 as item when Worn', 'no').text).toBe(
			'Saving throws — item +1\nReaches 6 values, only while Worn, which does not hold now',
		);
	});

	it('counts and names the first value it reaches and does not change', () => {
		const { outcome, text } = reach('@save += 1 as item', 'yes', [
			['Ring', 'yes', 'saves.str += 2 as item'],
		]);
		expect(outcome.applies).toBe(true);
		expect(text.split('\n')[1]).toMatch(/^Changes 5 of 6 values\. Not Saves · str: /);
	});

	it('says why an undeclared group, an empty group and a member condition change nothing', () => {
		expect(reach('@saves += 1').text).toBe(
			'@saves — +1\n"@saves" is not a modifier group this layout declares. Choose one it does, or add it under Modifier groups.',
		);
		expect(reach('@empty += 1').text.split('\n')[1]).toBe(
			'Empty holds no value on this sheet, so this changes nothing.',
		);
		expect(reach('@save += 1 where: Training == 0').text.split('\n')).toEqual([
			// No amount is claimed for a change the member condition withholds.
			'Saving throws — bonus',
			'A condition on each value is not supported yet, so this modifier changes nothing. Remove "where:" to apply it to every value it reaches.',
		]);
		expect(reach('@save, saves.str += 1').outcome.suppressed).toBe(
			'A list of groups can hold only groups. Write saves.str as its own part, or give it a group.',
		);
	});

	it('lists the members that do not take the change as not reached, naming the first', () => {
		// Both members of Checks — Perception and the Strength entry — are cards
		// with no Training column, so each refuses the column, today's sentence
		// for the change aimed at it by name, and the reach line names the first.
		const { outcome, text } = reach('@check = 1 in Training');
		expect(outcome.applies).toBe(false);
		expect(outcome.reach?.values).toBe(2);
		expect(outcome.reach?.missed?.label).toBe('Perception');
		expect(text.split('\n')[1]).toMatch(/^Changes 0 of 2 values\. Not Perception and 1 more: /);
	});

	it('says an empty group beside one that reaches something', () => {
		const { outcome, text } = reach('@save, @empty += 1');
		expect(outcome.applies).toBe(true);
		expect(text.split('\n')).toEqual([
			'Saving throws and Empty — +1',
			'Reaches 6 values',
			'Empty holds no value on this sheet, so this changes nothing.',
		]);
	});

	it('says `@` alone names no group yet, in the definitions list\'s words', () => {
		expect(reach('@ += 1').outcome.suppressed).toBe(
			'This modifier names no group yet, so it changes nothing. Choose one under Value.',
		);
	});

	it('sets the members that hold the column and lists the ones that do not', () => {
		// Athletics holds Training and is set; Climbing has no name, so its
		// levels are unaddressable, and the two Checks cards hold no Training.
		const sheet = sheetOf([['Charm', 'yes', '@skill, @check = 1 in Training']]);
		const outcome = sheet.modifiers.outcomes?.('@skill, @check = 1 in Training', { label: 'Charm', values: { Worn: true } }, 'Gear')[0];
		expect(outcome?.applies).toBe(true);
		expect(outcome?.reach).toMatchObject({ values: 4, changed: 1, more: 2 });
		const state = sheet.env.states?.('skills.athletics', 'Training');
		expect(state !== null && state !== undefined && !('error' in state) && state.lines.length).toBe(1);
	});
});

describe('a member drawn on the sheet', () => {
	function drawn<C extends ComponentConfig>(config: C, component: ComponentDefinition<never, never>, at: number, gearRows: string[][]) {
		const sheet = sheetOf(gearRows);
		const entry = sheet.prepared[at] as ReadComponent;
		const definition = component as unknown as ComponentDefinition;
		const el = document.createElement('div');
		definition.render(el, config, entry.data, {
			resolved: {},
			resolveField: makeFieldResolver(definition, config, entry.data, sheet.env),
			onChange: () => undefined,
			modifiers: sheet.modifiers,
		});
		return { el, sheet };
	}

	it('marks a Card, a Card set entry and a Roster row a group reached, each line naming the group', () => {
		const rows = [['Guidance', 'yes', '@check, @skill += 1']];
		for (const [config, component, at, name] of [
			[perception, card, 2, 'perception'],
			[abilities, cardSet, 3, 'abilities.STR'],
			[skills, roster, 4, 'skills.athletics'],
		] as const) {
			const { el, sheet } = drawn(config, component as never, at, rows);
			expect(el.querySelector('.sheetsmith-modified')).not.toBeNull();
			const via = sheet.modifiers.breakdown?.(name).lines[0]?.via?.map((group) => group.label);
			expect(via).toEqual([name === 'skills.athletics' ? 'Skills' : 'Checks']);
		}
	});

	it('draws a note pushed through a group on a member that draws notes, as one aimed by name', () => {
		const { el } = drawn(perception, card as never, 2, [['Guidance', 'yes', '@check += note: Roll twice']]);
		expect(el.querySelector('.sheetsmith-note-mark')).not.toBeNull();
	});
});
