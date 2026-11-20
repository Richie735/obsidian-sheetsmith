import { describe, expect, it } from 'vitest';
import { authoredShort, BREADCRUMB, entryLabel, labelPart, nameText, partText, usesShort, withColumn } from './name-label';
import { NameLabel } from '../types';

/*
 * The one place a published name's parts become text
 * (`docs/features/published-name-labels.md`).
 */

const SAVES: NameLabel['component'] = { id: 'saves', full: 'Saving throws', short: 'Saves' };
const CON: NameLabel = { component: SAVES, entry: { full: 'Constitution', short: 'CON' } };
const AC: NameLabel = { component: { id: 'armour_class', full: 'Armor class', short: 'AC' } };

describe('partText', () => {
	it('gives the short at short width and the full at full width', () => {
		expect(partText({ full: 'Constitution', short: 'CON' }, 'short')).toBe('CON');
		expect(partText({ full: 'Constitution', short: 'CON' }, 'full')).toBe('Constitution');
	});

	it('draws a part with no short at exactly its full label when short is asked', () => {
		// No truncation, no initials: the author typed no short, so there is none.
		expect(partText({ full: 'Constitution' }, 'short')).toBe('Constitution');
		// And with no label either, the key the walk already fell back to.
		expect(partText({ full: 'con' }, 'short')).toBe('con');
	});
});

describe('nameText', () => {
	it('draws an entry alone, or the breadcrumb from its component down', () => {
		expect(nameText(CON, 'short')).toBe('CON');
		expect(nameText(CON, 'full')).toBe('Constitution');
		expect(nameText(CON, 'full', { component: true })).toBe(`Saving throws${BREADCRUMB}Constitution`);
		expect(nameText(CON, 'short', { component: true })).toBe('Saves · CON');
	});

	it('draws a bare name as its component part, whatever is asked', () => {
		expect(nameText(AC, 'short')).toBe('AC');
		expect(nameText(AC, 'full', { component: true })).toBe('Armor class');
	});

	it('appends a column last, as it is', () => {
		const ring: NameLabel = { ...CON, column: 'Training' };
		expect(nameText(ring, 'full', { component: true })).toBe('Saving throws · Constitution · Training');
		expect(nameText(ring, 'short')).toBe('CON · Training');
	});

	it('draws a name with no short at exactly its full text, byte for byte, at either composition', () => {
		const plain: NameLabel = { component: { id: 'saves', full: 'Saving throws' }, entry: { full: 'Constitution' } };
		expect(nameText(plain, 'short')).toBe(nameText(plain, 'full'));
		expect(nameText(plain, 'short', { component: true })).toBe('Saving throws · Constitution');
		const keyed: NameLabel = { component: { id: 'saves', full: 'saves' }, entry: { full: 'con' } };
		expect(nameText(keyed, 'short', { component: true })).toBe('saves · con');
	});
});

describe('usesShort', () => {
	it('says a short was drawn only where a drawn part carries one', () => {
		expect(usesShort(CON)).toBe(true);
		expect(usesShort(AC)).toBe(true);
		// The component's short is not drawn on an entry alone.
		expect(usesShort({ component: SAVES, entry: { full: 'Perception' } })).toBe(false);
		expect(usesShort({ component: SAVES, entry: { full: 'Perception' } }, { component: true })).toBe(true);
		expect(usesShort({ component: { id: 'x', full: 'X' } })).toBe(false);
	});
});

describe('what a part reads from configuration', () => {
	it('trims a short, and reads a blank or a non-string one as absent', () => {
		expect(authoredShort(' STR ')).toBe('STR');
		expect(authoredShort('   ')).toBeUndefined();
		expect(authoredShort(3)).toBeUndefined();
		expect(authoredShort(undefined)).toBeUndefined();
	});

	it('carries a label where there is text and neither key where there is none', () => {
		expect(entryLabel('Strength', 'STR')).toEqual({ label: 'Strength', short: 'STR' });
		expect(entryLabel(' Strength ', '')).toEqual({ label: 'Strength' });
		expect(entryLabel(undefined, undefined)).toEqual({});
		expect(entryLabel('  ', 'STR')).toEqual({ short: 'STR' });
	});
});

describe('the rest of the composer', () => {
	it('appends a column to a name with no parts', () => {
		expect(withColumn('typo_name', 'Training')).toBe('typo_name · Training');
	});

	it('builds a part with only what was said beside it', () => {
		expect(labelPart('Strength')).toEqual({ full: 'Strength' });
		expect(labelPart('Strength', { short: 'STR' })).toEqual({ full: 'Strength', short: 'STR' });
		expect(labelPart('Maximum', { ownWord: true })).toEqual({ full: 'Maximum', ownWord: true });
	});
});
