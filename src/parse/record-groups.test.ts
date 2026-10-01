import { describe, expect, it } from 'vitest';
import {
	GroupReading,
	groupMatchKey,
	groupRecords,
	OTHER_KEY,
} from './record-groups';

/** A record is just the number its reading is made from, or null for none. */
const read = (value: number | null): GroupReading | null =>
	value === null ? null : { key: String(value), order: value };

const keys = (values: (number | null)[]): string[] =>
	groupRecords(values, (value) => read(value)).map((group) => group.key);

describe('groupRecords', () => {
	it('orders groups by ascending order, whatever order the records came in', () => {
		expect(keys([3, 1, 2, 1])).toEqual(['1', '2', '3']);
	});

	it('orders negatives and fractions numerically, not as text', () => {
		expect(keys([10, 2, -1, 0.5, -10])).toEqual(['-10', '-1', '0.5', '2', '10']);
	});

	it('keeps the file order inside a group, and the position beside each record', () => {
		const groups = groupRecords([1, 2, 1, 2, 1], (value) => read(value));
		expect(groups[0]?.members.map((one) => one.at)).toEqual([0, 2, 4]);
		expect(groups[1]?.members.map((one) => one.at)).toEqual([1, 3]);
	});

	it('puts every record in exactly one group', () => {
		const values = [4, null, 1, 4, null, 0, 1];
		const groups = groupRecords(values, (value) => read(value));
		const placed = groups.flatMap((group) => group.members.map((one) => one.at));
		expect([...placed].sort()).toEqual(values.map((_, at) => at).sort());
	});

	it('sends a record with no reading to Other, last, however large every key is', () => {
		const groups = groupRecords([null, 900, null, 1], (value) => read(value));
		expect(groups.map((group) => group.key)).toEqual(['1', '900', OTHER_KEY]);
		expect(groups[2]?.members.map((one) => one.at)).toEqual([0, 2]);
	});

	it('draws no Other where nothing needs one, and no group where nothing is in it', () => {
		expect(keys([1, 2])).not.toContain(OTHER_KEY);
		expect(keys([])).toEqual([]);
	});

	it('treats a reading with the empty key as no reading, so Other cannot be split', () => {
		const groups = groupRecords([1, 2, 3], (value) =>
			value === 2 ? { key: OTHER_KEY, order: 0 } : read(value),
		);
		expect(groups.map((group) => group.key)).toEqual(['1', '3', OTHER_KEY]);
		expect(groups[2]?.members.map((one) => one.at)).toEqual([1]);
	});
});

describe('groupMatchKey', () => {
	it('trims, normalises to NFC and lower-cases, and folds nothing else', () => {
		expect(groupMatchKey('  Blood Hunter ')).toBe('blood hunter');
		expect(groupMatchKey('Cl\u00e9ric')).toBe(groupMatchKey('Cle\u0301ric'));
		expect(groupMatchKey('Cl\u00e9ric')).not.toBe(groupMatchKey('Cleric'));
		expect(groupMatchKey('A  B')).not.toBe(groupMatchKey('A B'));
		expect(groupMatchKey('   ')).toBe('');
	});
});

describe('groupRecords over typed text', () => {
	const typed = (value: string | null): GroupReading | null =>
		value === null || groupMatchKey(value) === ''
			? null
			: { key: groupMatchKey(value), order: 0, label: value.trim() };
	const group = (values: (string | null)[]) =>
		groupRecords(values, (value) => typed(value), {
			alphabetical: true,
			locale: 'en',
		});

	it('merges on the match key and labels a group with the first member in file order', () => {
		const groups = group(['wizard', 'Fighter', ' Wizard ', 'WIZARD']);
		expect(groups.map((one) => one.key)).toEqual(['fighter', 'wizard']);
		expect(groups[1]?.label).toBe('wizard');
		expect(groups[1]?.members.map((one) => one.at)).toEqual([0, 2, 3]);
		// The label is the file's first, whatever order the records were edited in.
		expect(group([' Wizard ', 'wizard'])[0]?.label).toBe('Wizard');
	});

	it('sorts alphabetically with digits by value, and breaks ties by the key itself', () => {
		expect(
			group(['Tier 10', 'zeta', 'Tier 2', 'alpha']).map((one) => one.key),
		).toEqual(['alpha', 'tier 2', 'tier 10', 'zeta']);
		// Two keys a collator calls equal keep one order whatever the input's.
		const forward = group(['a b', 'a  b']).map((one) => one.key);
		const reverse = group(['a  b', 'a b']).map((one) => one.key);
		expect(reverse).toEqual(forward);
	});

	it('shares one Other between a blank value, "other" in any case and no reading', () => {
		const groups = group(['b', null, 'Other', '', 'OTHER', ' other ', 'a']);
		expect(groups.map((one) => one.key)).toEqual(['a', 'b', OTHER_KEY]);
		expect(groups[2]?.members.map((one) => one.at)).toEqual([1, 2, 3, 4, 5]);
		expect(groups[2]?.label).toBeUndefined();
	});

	it('puts every record in exactly one group', () => {
		const values = ['x', null, 'X', 'other', 'y', '', 'z'];
		const placed = group(values).flatMap((one) => one.members.map((m) => m.at));
		expect([...placed].sort()).toEqual(values.map((_, at) => at).sort());
	});

	it('leaves level and number grouping to their order, with no label', () => {
		const groups = groupRecords([3, 1], (value) => read(value));
		expect(groups.map((one) => one.key)).toEqual(['1', '3']);
		expect(groups[0]).not.toHaveProperty('label');
	});
});
