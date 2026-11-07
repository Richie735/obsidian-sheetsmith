import { describe, expect, it } from 'vitest';
import { editRecords, fieldWrite, recordEntries, RecordField } from './record-fields';
import { joinRecords, splitRecords } from '../parse/records';

/*
 * The record data path both Record set and Stat block read and write through.
 * Each consumer's suite drives it end to end; these hold the shared rules
 * directly, so a change here is red in the module that owns it.
 */

const BODY = [
	'',
	'### Brown Bear',
	'```sheet',
	'HP: 22 / 34',
	'```',
	'Keen Smell.',
	'',
	'### Broken',
	'```sheet',
	'HP 3',
	'```',
	'',
].join('\n');

const fields: RecordField[] = [{ key: 'HP', type: 'number', maxSource: 'record' }];

describe('recordEntries', () => {
	it('reads each record, and fails one record rather than the list', () => {
		const records = recordEntries(splitRecords(BODY).records, 'Form');
		expect(records[0]?.fields.HP).toBe('22 / 34');
		expect(records[0]?.body).toBe('Keen Smell.');
		expect(records[0]?.error).toBeNull();
		expect(records[1]?.error).toContain('Every other form on this list still works.');
	});
});

describe('editRecords', () => {
	it('writes the delta, keeps every other byte, and leaves an unreadable record alone', () => {
		const section = splitRecords(BODY);
		const next = joinRecords(
			editRecords(section, { records: { 0: { fields: { HP: '20 / 34' } }, 1: { name: 'Fixed' } } }, fields),
		);
		expect(next).toBe(BODY.replace('HP: 22 / 34', 'HP: 20 / 34'));
	});

	it('removes and appends after the deltas, by position as read', () => {
		const next = joinRecords(
			editRecords(splitRecords(BODY), { records: {}, removed: [0], added: [{ name: 'Wolf' }] }, fields),
		);
		expect(next.startsWith('\n### Broken')).toBe(true);
		expect(next.endsWith('### Wolf\n')).toBe(true);
	});
});

describe('fieldWrite', () => {
	const [hp] = fields as [RecordField];

	it('restores a record-owned ceiling on full, through the join', () => {
		expect(fieldWrite(hp, 'full', undefined, '22 / 34', 34)).toBe('34 / 34');
		expect(fieldWrite(hp, 'empty', undefined, '22 / 34', 34)).toBe('0 / 34');
	});

	it('skips a record with no ceiling on full rather than writing zero', () => {
		expect(fieldWrite(hp, 'full', undefined, '5', null)).toBeNull();
	});
});
