import { describe, expect, it } from 'vitest';
import { evaluate, FormulaError, Scope } from './expression';

const empty: Scope = () => undefined;
const scope =
	(values: Record<string, number | boolean | string>): Scope =>
	(name) =>
		values[name];

describe('evaluate', () => {
	it('does arithmetic with normal precedence', () => {
		expect(evaluate('2 + 3 * 4', empty)).toBe(14);
		expect(evaluate('(2 + 3) * 4', empty)).toBe(20);
		expect(evaluate('10 % 3', empty)).toBe(1);
		expect(evaluate('-5 + 2', empty)).toBe(-3);
	});

	it('computes the 5e modifier formula', () => {
		expect(evaluate('floor((value - 10) / 2)', scope({ value: 19 }))).toBe(4);
		expect(evaluate('floor((value - 10) / 2)', scope({ value: 8 }))).toBe(-1);
	});

	it('supports the standard helpers', () => {
		expect(evaluate('ceil(1.2)', empty)).toBe(2);
		expect(evaluate('round(2.5)', empty)).toBe(3);
		expect(evaluate('abs(0 - 7)', empty)).toBe(7);
		expect(evaluate('min(4, 2, 9)', empty)).toBe(2);
		expect(evaluate('max(4, 2, 9)', empty)).toBe(9);
	});

	it('supports comparisons and the conditional', () => {
		expect(evaluate('if(value >= 10, 1, 0)', scope({ value: 12 }))).toBe(1);
		expect(evaluate('if(trained, 3, 0)', scope({ trained: false }))).toBe(0);
		expect(evaluate('value == 10 || value < 5', scope({ value: 3 }))).toBe(true);
	});

	it('evaluates only the taken branch of if()', () => {
		expect(evaluate('if(prof > 0, 10 / prof, 0)', scope({ prof: 0 }))).toBe(0);
		expect(evaluate('if(prof > 0, 10 / prof, 0)', scope({ prof: 2 }))).toBe(5);
		expect(evaluate('if(true, 1, nope)', empty)).toBe(1);
	});

	it('still validates the shape of if()', () => {
		expect(() => evaluate('if(true, 1)', empty)).toThrow(FormulaError);
		expect(() => evaluate('if(1, 2, 3)', empty)).toThrow(/true or false/);
	});

	it('errors on an unknown name', () => {
		expect(() => evaluate('nope + 1', empty)).toThrow(FormulaError);
		expect(() => evaluate('nope + 1', empty)).toThrow(/nope/);
	});

	it('errors on an unknown function', () => {
		expect(() => evaluate('mod(4)', empty)).toThrow(/mod/);
	});

	it('errors on malformed input rather than guessing', () => {
		expect(() => evaluate('1 +', empty)).toThrow(FormulaError);
		expect(() => evaluate('(1 + 2', empty)).toThrow(FormulaError);
		expect(() => evaluate('1 2', empty)).toThrow(FormulaError);
		expect(() => evaluate('value @ 2', empty)).toThrow(FormulaError);
	});

	it('errors on arithmetic with non-numbers', () => {
		expect(() => evaluate('value + 1', scope({ value: 'fast' }))).toThrow(
			FormulaError,
		);
	});

	it('errors on division and modulo by zero', () => {
		expect(() => evaluate('1 / 0', empty)).toThrow(/zero/i);
		expect(() => evaluate('10 % 0', empty)).toThrow(/zero/i);
	});

	it('never returns a non-finite number', () => {
		const overflowing = '1' + '0'.repeat(309);
		expect(() => evaluate(overflowing, empty)).toThrow(/finite/);
	});

	it('never evaluates input as JavaScript', () => {
		expect(() => evaluate('constructor.constructor("return 1")()', empty)).toThrow(
			FormulaError,
		);
	});
});
