import { describe, expect, it } from 'vitest';
import {
	boundedText,
	formatComputed,
	typedValue,
	TypedField,
	typeOf,
} from './typed-value';

/*
 * What a typed value stored as text means, driven directly.
 *
 * **A file of its own, because none of `docs/PATTERNS.md` §10's three exceptions
 * reaches this module and its own header disclaimed the nearest one.** It is not
 * a gesture, so there is no control it can only be driven through; it is not a
 * vocabulary, which is precisely the argument its header makes for not living in
 * `column-types.ts`; and it is not a note-format primitive, since nothing here is
 * about bytes in a file. So §10's default rule governs — one test file per
 * module, beside it — and the header's "its consumers drive every one of them"
 * was standing in for this file rather than replacing it.
 *
 * **Measured rather than assumed.** Before this existed, two of nine one-rule
 * mutations survived the whole suite: deleting the `min` clamp, and swapping the
 * two glyphs a boolean computed value reads as. Both holes predate the
 * extraction — they were each component's business and each component's gap —
 * and that is exactly what extraction changes: three rules two components
 * happened to agree on became one shared contract, and a shared contract is a
 * thing to assert rather than a thing to hope both callers still want.
 */

describe('typeOf', () => {
	it('reads a missing type as the shared default, which is text', () => {
		// The one policy `column-types.ts` calls the worst of its three: two
		// answers to "which is first" would reread every numeric column in every
		// layout as a text column, silently.
		expect(typeOf({})).toBe('text');
		expect(typeOf({ type: 'number' })).toBe('number');
	});
});

describe('typedValue', () => {
	it('reads a blank numeric field as zero rather than as nothing', () => {
		// Untrained skills are left blank on every character sheet ever printed,
		// and this is what makes `sum(inventory, Weight)` and `sum(spells, Level)`
		// agree about one. The rule an aggregate over either component depends on.
		expect(typedValue({ type: 'number' }, '')).toBe(0);
		expect(typedValue({ type: 'number' }, undefined)).toBe(0);
		expect(typedValue({ type: 'number' }, '  ')).toBe(0);
	});

	it('reads a number as a number, and text in a number field as its text', () => {
		expect(typedValue({ type: 'number' }, ' 7 ')).toBe(7);
		expect(typedValue({ type: 'number' }, '-2')).toBe(-2);
		// Not zero: a quietly wrong number is worse than a value an expression
		// fails on and names.
		expect(typedValue({ type: 'number' }, 'heavy')).toBe('heavy');
	});

	it('reads every spelling of a flag a note may hold', () => {
		for (const set of ['yes', 'true', 'x', '✓', '✔', '1', ' YES ']) {
			expect(typedValue({ type: 'toggle' }, set), set).toBe(true);
		}
		for (const clear of ['no', 'false', '', '0', 'maybe']) {
			expect(typedValue({ type: 'toggle' }, clear), clear).toBe(false);
		}
	});

	it('holds a level inside the field\'s own range', () => {
		const graded: TypedField = {
			type: 'level',
			levels: ['None', 'Trained', 'Expert'],
		};
		expect(typedValue(graded, '1')).toBe(1);
		// A stored value past the end is a hand edit or a layout that used to have
		// more marks: the nearest level the field can represent beats nothing.
		expect(typedValue(graded, '9')).toBe(2);
		expect(typedValue(graded, '')).toBe(0);
		expect(typedValue(graded, 'lots')).toBe(0);
	});

	it('reads a text field, a computed field and a modifier field as their text', () => {
		expect(typedValue({}, ' sword ')).toBe('sword');
		expect(typedValue({ type: 'computed' }, '3')).toBe('3');
		expect(typedValue({ type: 'modifier' }, 'Ring')).toBe('Ring');
	});
});

describe('boundedText', () => {
	it('holds a value to the minimum, which nothing drove before', () => {
		// The mutation that survived the whole suite: deleting this clamp.
		expect(boundedText('1', { min: 3 })).toBe('3');
		expect(boundedText('-5', { min: 0 })).toBe('0');
		expect(boundedText('4', { min: 3 })).toBe('4');
	});

	it('holds a value to the maximum', () => {
		expect(boundedText('9', { max: 3 })).toBe('3');
		expect(boundedText('2', { max: 3 })).toBe('2');
	});

	it('holds a value to both, and returns the text where it already fits', () => {
		expect(boundedText('7', { min: 1, max: 3 })).toBe('3');
		expect(boundedText('0', { min: 1, max: 3 })).toBe('1');
		// Byte-identical where nothing changed, spacing included after the trim:
		// a value the bounds do not move is not rewritten.
		expect(boundedText(' 2 ', { min: 1, max: 3 })).toBe('2');
	});

	it('leaves text that is not a number exactly as it was typed', () => {
		// Silently replacing what somebody typed with a number they did not is
		// worse than storing it.
		expect(boundedText('heavy', { min: 1, max: 3 })).toBe('heavy');
		expect(boundedText('', { min: 1 })).toBe('');
		expect(boundedText('Infinity', { max: 3 })).toBe('Infinity');
	});
});

describe('formatComputed', () => {
	it('reads a value that did not resolve as "?"', () => {
		expect(formatComputed(null, false)).toBe('?');
		expect(formatComputed(null, true)).toBe('?');
	});

	it('signs a non-negative number only where the field asked', () => {
		expect(formatComputed(3, true)).toBe('+3');
		expect(formatComputed(0, true)).toBe('+0');
		expect(formatComputed(-1, true)).toBe('-1');
		expect(formatComputed(3, false)).toBe('3');
	});

	it('reads a boolean as a tick or a dash, and not the other way round', () => {
		// The second mutation that survived: swapping these two. A computed field
		// reading "—" for true is a sheet stating the opposite of the arithmetic.
		expect(formatComputed(true, false)).toBe('✓');
		expect(formatComputed(false, false)).toBe('—');
		// The sign never reaches a boolean.
		expect(formatComputed(true, true)).toBe('✓');
	});

	it('reads text as itself', () => {
		expect(formatComputed('sword', true)).toBe('sword');
	});
});
