// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { bindDisclosure, drawRecordName, drawRecordNumber, shiftOpenRecords } from './record-controls';

/*
 * The record controls Record set and Stat block share. Each consumer's suite
 * drives them through its own render; these hold the shared rules directly.
 */

describe('shiftOpenRecords', () => {
	const shifted = (opened: number[], removedAt: number, count: number, first = false) => {
		const reported: [number, boolean][] = [];
		shiftOpenRecords(new Set(opened), removedAt, count, (at, inSet) => reported.push([at, inSet]), (at) =>
			first ? at === 0 : false,
		);
		return reported;
	};

	it('moves the open records after a delete up by one', () => {
		expect(shifted([0, 2], 1, 3)).toEqual([
			[2, false],
			[1, true],
		]);
	});

	it('reads a default-open first record back through its default', () => {
		// {0, 1}: record 0 closed from its default, record 1 open. Delete 0, and
		// the old record 1 is now first, open, which is that position's default.
		expect(shifted([0, 1], 0, 3, true)).toEqual([
			[0, false],
			[1, false],
		]);
	});
});

describe('bindDisclosure', () => {
	it('opens, names and hides its region, and reports the change', () => {
		const button = document.createElement('button');
		const region = document.createElement('div');
		region.id = 'body';
		const said: boolean[] = [];
		bindDisclosure({ button, region, open: false, named: 'Wolf', onToggle: (open) => said.push(open) });
		expect(button.getAttribute('aria-controls')).toBe('body');
		expect(region.getAttribute('hidden')).toBe('until-found');
		expect(button.getAttribute('aria-label')).toBe('Open Wolf');
		button.click();
		expect(region.hasAttribute('hidden')).toBe(false);
		expect(button.getAttribute('aria-expanded')).toBe('true');
		region.dispatchEvent(new Event('beforematch'));
		expect(said).toEqual([true]);
	});
});

describe('drawRecordNumber', () => {
	it('commits a set value through the field\'s own path, held to its ceiling', () => {
		const cell = document.createElement('div');
		const row = document.createElement('div');
		document.body.append(cell, row);
		const status = document.createElement('div');
		const commits: string[] = [];
		const handle = drawRecordNumber(
			cell,
			row,
			{ context: { resolved: {}, resolveField: () => null }, id: 'forms', noun: 'Form', status },
			{
				field: { key: 'HP', type: 'number', maxSource: 'record' },
				raw: '22 / 34',
				name: 'HP',
				accessible: 'Brown Bear HP',
				body: true,
				scope: {},
			},
			(next) => commits.push(next),
		);
		expect(handle.ceiling()).toBe(34);
		handle.set('40');
		expect(commits).toEqual(['34 / 34']);
		handle.set('1/2');
		expect(commits).toHaveLength(1);
		expect(row.textContent).toContain('A slash separates a value');
	});
});

describe('drawRecordName', () => {
	const host = () => ({
		context: { resolved: {}, resolveField: () => null },
		id: 'npcs',
		noun: 'NPC',
		status: document.createElement('div'),
	});

	it('draws a field by default, and the plain read name where asked to read only', () => {
		const into = document.createElement('div');
		const field = drawRecordName(into, host(), { name: 'Thug', error: null }, 'Thug', () => undefined);
		expect(field?.value).toBe('Thug');
		expect(into.querySelector('.sheetsmith-record-name-plain')).toBeNull();

		const read = document.createElement('div');
		const commits: string[] = [];
		const none = drawRecordName(read, host(), { name: 'Thug', error: null }, 'Thug', (next) => commits.push(next), {
			readOnly: true,
		});
		expect(none).toBeNull();
		expect(read.querySelector('input')).toBeNull();
		const cell = read.querySelector('.sheetsmith-record-name.sheetsmith-record-name-plain');
		expect(cell?.textContent).toBe('Thug');
		expect(commits).toEqual([]);
	});
});
