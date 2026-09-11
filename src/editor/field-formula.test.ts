import { describe, expect, it } from 'vitest';
import { formulaProblem } from './field-formula';

describe('formulaProblem', () => {
	it('says nothing about a field nobody has filled in', () => {
		expect(formulaProblem(undefined)).toBeNull();
		expect(formulaProblem('')).toBeNull();
		expect(formulaProblem('   ')).toBeNull();
	});

	it('says nothing about a stored number', () => {
		expect(formulaProblem(3)).toBeNull();
		expect(formulaProblem(0)).toBeNull();
	});

	it('defers to the parser for anything else', () => {
		expect(formulaProblem('floor((value - 10) / 2)')).toBeNull();
		expect(formulaProblem('  floor((value - 10) / 2  ')).toBe(
			'Expected ")" in formula.',
		);
		expect(formulaProblem('value + #')).toBe(
			'Unexpected character "#" in formula.',
		);
	});
});
