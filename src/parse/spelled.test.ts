import { describe, expect, it } from 'vitest';
import { spelled, tooManyToName } from './spelled';

describe('tooManyToName', () => {
	it('names five and counts six', () => {
		expect(tooManyToName(['a', 'b', 'c', 'd', 'e'])).toBe(false);
		expect(tooManyToName(['a', 'b', 'c', 'd', 'e', 'f'])).toBe(true);
	});
});

describe('spelled', () => {
	it('quotes a series the way a sentence reads one', () => {
		expect(spelled([])).toBe('');
		expect(spelled(['a'])).toBe('"a"');
		expect(spelled(['a', 'b'])).toBe('"a" and "b"');
		expect(spelled(['a', 'b', 'c'])).toBe('"a", "b" and "c"');
	});
});
