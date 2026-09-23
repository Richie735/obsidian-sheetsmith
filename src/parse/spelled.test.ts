import { describe, expect, it } from 'vitest';
import { spelled } from './spelled';

describe('spelled', () => {
	it('quotes a series the way a sentence reads one', () => {
		expect(spelled([])).toBe('');
		expect(spelled(['a'])).toBe('"a"');
		expect(spelled(['a', 'b'])).toBe('"a" and "b"');
		expect(spelled(['a', 'b', 'c'])).toBe('"a", "b" and "c"');
	});
});
