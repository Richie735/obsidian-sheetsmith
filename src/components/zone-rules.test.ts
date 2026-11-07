import { describe, expect, it } from 'vitest';
import { columnKeyFault, zoneHeadingFault, zoneKeyFault } from './zone-rules';

/*
 * The rules a Stat block zone's key, heading and columns are held to, driven
 * directly: two callers phrase them, and this is the one place every fault is
 * asked for (`docs/features/stat-block-zones.md`).
 */

describe('a zone key', () => {
	it('is refused blank, when not a name, and when another zone holds it in any case', () => {
		expect(zoneKeyFault('  ', [])).toBe('blank');
		expect(zoneKeyFault('a b', [])).toBe('not-a-name');
		expect(zoneKeyFault('Traits', ['traits'])).toBe('taken');
		expect(zoneKeyFault('traits', ['attacks', undefined])).toBeNull();
	});
});

describe('a zone heading', () => {
	it('is refused blank, over two lines, as a link, and with no words', () => {
		expect(zoneHeadingFault('', [])).toEqual({ kind: 'blank' });
		expect(zoneHeadingFault('A\nB', [])).toEqual({ kind: 'line-break' });
		expect(zoneHeadingFault('[[Traits]]', [])).toEqual({ kind: 'link' });
		expect(zoneHeadingFault('...', [])).toEqual({ kind: 'no-words' });
	});

	it('is refused where another body zone reads alike, and never against a built-in', () => {
		expect(zoneHeadingFault('traits:', [{ key: 'lore', heading: 'Traits' }])).toEqual({ kind: 'taken', with: 'lore' });
		expect(zoneHeadingFault('Changes', [{ key: 'changes', heading: 'Changes' }])).toBeNull();
		expect(zoneHeadingFault('Actions', [{ key: 'traits', heading: 'Traits' }])).toBeNull();
	});
});

describe('a table zone column key', () => {
	it('is refused blank, holding a pipe, and when another column holds it in any case', () => {
		expect(columnKeyFault('', [])).toBe('blank');
		expect(columnKeyFault('A|B', [])).toBe('pipe');
		expect(columnKeyFault('bonus', ['Bonus'])).toBe('taken');
		expect(columnKeyFault('Damage', ['Attack', 'Bonus'])).toBeNull();
	});
});
