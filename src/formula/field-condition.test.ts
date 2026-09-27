import { describe, expect, it } from 'vitest';
import { conditionReads, heldCondition } from './field-condition';

describe('conditionReads', () => {
	it('finds a bare name anywhere in the condition', () => {
		expect(conditionReads('Uses > 0', 'Uses')).toBe(true);
		expect(conditionReads('Uses == 0 || Recharges == 1', 'Uses')).toBe(true);
		expect(conditionReads('Recharges == 1 || Uses == 0', 'Uses')).toBe(true);
		expect(conditionReads('if(Active, Uses, 0) > 0', 'Uses')).toBe(true);
	});

	it('does not match a dotted name, which is somebody else on the sheet', () => {
		expect(conditionReads('abilities.Uses > 0', 'Uses')).toBe(false);
		expect(conditionReads('Uses.value > 0', 'Uses')).toBe(false);
	});

	it('does not match a name that merely starts with the key', () => {
		expect(conditionReads('Uses_max > 0', 'Uses')).toBe(false);
		expect(conditionReads('Used > 0', 'Use')).toBe(false);
	});

	it('is case-sensitive, as the record scope is', () => {
		expect(conditionReads('uses > 0', 'Uses')).toBe(false);
	});

	it('does not read a function call as the key', () => {
		expect(conditionReads('max(1, 2) > 0', 'max')).toBe(false);
	});

	it('reads a condition that does not parse, and names nothing in one that does not tokenize', () => {
		// A stray bracket still names what it names.
		expect(conditionReads('(Uses > 0', 'Uses')).toBe(true);
		expect(conditionReads('Uses @ 0', 'Uses')).toBe(false);
	});

	it('names nothing in a blank condition', () => {
		expect(conditionReads('', 'Uses')).toBe(false);
		expect(conditionReads('   ', 'Uses')).toBe(false);
	});
});

describe('heldCondition', () => {
	it('holds text and a hand-written answer, and nothing else', () => {
		expect(heldCondition('Recharges == 1')).toBe('Recharges == 1');
		expect(heldCondition(false)).toBe(false);
		expect(heldCondition(true)).toBe(true);
		for (const none of [undefined, null, '', '   ', 3, {}, ['x']]) {
			expect(heldCondition(none)).toBeNull();
		}
	});
});
