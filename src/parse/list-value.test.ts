import { describe, expect, it } from 'vitest';
import { joinParts, LIST_SEPARATOR, listParts } from './list-value';

/*
 * The split and the join every value holding several parts shares with a
 * modifier cell (`docs/features/passport-field-lists.md`).
 * `modifier-cell.test.ts` still drives `MODIFIER_SEPARATOR`/`storedParts`/
 * `spellParts` under their own names, over its own cases; this is the module's
 * own test over the split, the join, and their agreement.
 */

describe('splitting a value into its parts', () => {
	it('is a semicolon, and one declaration of it', () => {
		expect(LIST_SEPARATOR).toBe(';');
	});

	it('splits on the separator, trims each part, and drops empty ones', () => {
		expect(listParts('A;B')).toEqual(['A', 'B']);
		expect(listParts('A; B')).toEqual(['A', 'B']);
		expect(listParts('A ;B')).toEqual(['A', 'B']);
		expect(listParts('A ; B')).toEqual(['A', 'B']);
		expect(listParts(' A ; B ')).toEqual(['A', 'B']);
	});

	it('drops a trailing separator rather than an empty part', () => {
		// A hand edit that leaves a trailing `;` behind must not draw a third,
		// empty chip.
		expect(listParts('A; B;')).toEqual(['A', 'B']);
	});

	it('drops a doubled separator rather than an empty part between them', () => {
		expect(listParts('A;;B')).toEqual(['A', 'B']);
	});

	it('reads a single part with no separator at all', () => {
		expect(listParts('Bard 5')).toEqual(['Bard 5']);
	});

	it('reads an empty string as no parts', () => {
		expect(listParts('')).toEqual([]);
	});

	it('does not collapse a repeated part', () => {
		// Unlike `modifier-cell.ts`'s `cellParts`: two identical parts here are
		// two chips a reader chose to write twice, not one enrolment counted
		// twice.
		expect(listParts('A;A')).toEqual(['A', 'A']);
	});
});

describe('joining parts back into one stored value', () => {
	it('joins with the separator and one space', () => {
		expect(joinParts(['A', 'B'])).toBe('A; B');
		expect(joinParts(['A', 'B', 'C'])).toBe('A; B; C');
	});

	it('joins one part as itself, with no trailing separator', () => {
		expect(joinParts(['A'])).toBe('A');
	});

	it('joins no parts as the empty string', () => {
		expect(joinParts([])).toBe('');
	});

	it('does not collapse a repeated part', () => {
		expect(joinParts(['A', 'A'])).toBe('A; A');
	});

	it('is listParts\' exact inverse wherever the spacing was already canonical', () => {
		for (const canonical of ['A; B', 'A; B; C', 'Bard 5', 'A; A']) {
			expect(joinParts(listParts(canonical))).toBe(canonical);
		}
	});

	it('canonicalises irregular separator spacing rather than preserving it', () => {
		// Not `listParts`' exact inverse in general: a commit that rejoins any
		// part rewrites every part's own spacing to the canonical form, which is
		// `modifier-cell.ts`'s existing behaviour inherited here rather than a
		// new decision.
		expect(joinParts(listParts('A;B ;C'))).toBe('A; B; C');
		expect(joinParts(listParts('A;B'))).toBe('A; B');
	});
});
