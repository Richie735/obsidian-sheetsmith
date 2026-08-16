/*
 * The grid arithmetic behind the schematic's two pointer gestures.
 *
 * Dragging a block, dragging its corner, and the arrow keys share one bound,
 * which is the whole reason it is a function rather than three inline
 * expressions. The three of them disagreeing about where the grid ends is
 * the failure this file exists to catch.
 */

import { describe, expect, it } from 'vitest';
import { describeCell, findOverlaps, lastColumn } from './preview-grid';
import { ComponentConfig } from './types';

const block = (
	col: number,
	row: number,
	width: number,
	height: number,
	label = 'Abilities',
): ComponentConfig => ({
	id: 'abilities',
	type: 'stat-group',
	label,
	position: { col, row, width, height },
});

describe('lastColumn', () => {
	it('lets a moved block reach the right edge and no further', () => {
		// A 3-wide block on a 12-column grid ends flush at column 12.
		expect(lastColumn(12, 3, 5)).toBe(10);
	});

	it('lets a resized block grow into the space it has left', () => {
		// Anchored at column 5, so 8 units of width reach column 12.
		expect(lastColumn(12, 5, 3)).toBe(8);
	});

	it('is the whole grid for a 1-wide block at the start', () => {
		expect(lastColumn(12, 1, 1)).toBe(12);
	});

	it('leaves a block already past the edge where it is', () => {
		// Hand-authored, or a layout whose columns were reduced under it.
		// Correcting it here would move something the user never touched.
		expect(lastColumn(12, 2, 15)).toBe(15);
	});

	it('lets an oversized block shrink without letting it grow', () => {
		const bound = lastColumn(12, 1, 20);
		expect(bound).toBe(20);
		expect(Math.min(19, bound)).toBe(19);
	});

	it('follows a narrower grid', () => {
		expect(lastColumn(6, 2, 1)).toBe(5);
	});
});

describe('describeCell', () => {
	it('reads out the position and size', () => {
		expect(describeCell(block(2, 1, 4, 2), false)).toBe(
			'Abilities: column 2, row 1, 4×2',
		);
	});

	it('says so when the block overlaps another', () => {
		// The colour alone tells a sighted user something is wrong; this is
		// the same information for a reader who cannot see it.
		expect(describeCell(block(1, 1, 2, 1), true)).toBe(
			'Abilities: column 1, row 1, 2×1. Overlaps another component',
		);
	});
});

describe('findOverlaps', () => {
	it('finds nothing in a layout laid out side by side', () => {
		expect(findOverlaps([block(1, 1, 2, 1), block(3, 1, 2, 1)]).size).toBe(0);
	});

	it('names both blocks of a collision, not just the later one', () => {
		const found = findOverlaps([block(1, 1, 3, 1), block(2, 1, 2, 1)]);
		expect([...found]).toEqual([0, 1]);
	});

	it('treats a shared edge as clear', () => {
		// Column 3 is where the first block stops, not where it still is.
		expect(findOverlaps([block(1, 1, 2, 1), block(3, 1, 1, 1)]).size).toBe(0);
	});

	it('sees a collision only when both axes overlap', () => {
		expect(findOverlaps([block(1, 1, 2, 1), block(1, 2, 2, 1)]).size).toBe(0);
		expect(findOverlaps([block(1, 1, 2, 2), block(1, 2, 2, 1)]).size).toBe(2);
	});
});
