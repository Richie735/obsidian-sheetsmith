import { describe, expect, it } from 'vitest';
import { isAcronym, nounInSentence } from './noun-in-sentence';

describe('nounInSentence', () => {
	it('takes a noun in capitals throughout as an acronym, and nothing else', () => {
		expect([isAcronym('NPC'), isAcronym('Familiar'), isAcronym('A'), isAcronym('NPC 2')]).toEqual([
			true,
			false,
			false,
			true,
		]);
	});

	it('keeps an acronym and lowercases any other noun, and is idempotent', () => {
		expect(['NPC', 'Feature', 'Wild Shape'].map(nounInSentence)).toEqual(['NPC', 'feature', 'wild shape']);
		expect(nounInSentence(nounInSentence('Feature'))).toBe('feature');
	});
});
