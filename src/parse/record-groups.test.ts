import { describe, expect, it } from 'vitest';
import { GroupReading, groupRecords, OTHER_KEY } from './record-groups';

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
