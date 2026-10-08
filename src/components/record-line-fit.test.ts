import { describe, expect, it } from 'vitest';
import {
	fieldWidthPx,
	fitTier,
	lineFitPx,
	MAX_FIT_TIER,
	MIN_FIT_TIER,
	STEP_PX,
	type LineField,
} from './record-line-fit';

/*
 * `docs/features/record-set-stacking-tiers.md`. The estimate is held against
 * what the harness measured, at a 16px container, so a change to a constant
 * that would size a sample short is red here rather than a wrap in a review.
 */

/** Each sample field, and the width the harness drew it at. */
const MEASURED: [string, LineField, number][] = [
	['a toggle', { kind: 'mark' }, 20.8],
	['a computed `-2`', { kind: 'computed' }, 14.2],
	['`Level` with no ceiling', { kind: 'number', name: 'Level', ceiling: 'none' }, 76.1],
	['`Level / 9`', { kind: 'number', name: 'Level', ceiling: { fixed: '9' } }, 92.1],
	['`Uses / 3`', { kind: 'number', name: 'Uses', ceiling: { fixed: '3' } }, 90.4],
	['`Uses` with a typed ceiling', { kind: 'number', name: 'Uses', ceiling: 'typed' }, 100.7],
	['`Class` as text', { kind: 'text', name: 'Class' }, 146.3],
	[
		'Spells’ school dropdown',
		{ kind: 'select', options: ['None', 'Evocation', 'Abjuration'] },
		73,
	],
	[
		'a rest dropdown',
		{ kind: 'select', options: ['None', 'Short rest', 'Long rest', 'Always-on'] },
		74,
	],
];

const TYPED: LineField = { kind: 'number', name: 'Uses', ceiling: 'typed' };
const MARK: LineField = { kind: 'mark' };
const REST: LineField = {
	kind: 'select',
	options: ['None', 'Short rest', 'Long rest', 'Always-on', 'One back'],
};

/**
 * Every sample list's declared summary line, the narrowest container the
 * harness drew it on one row at (swept in half pixels, every declared field
 * shown, with the name at six ems: `harness/measure-groups.mjs` check 7 prints
 * it), and for a headed list the width its strip comes in at, where the stacked
 * line stops whatever its tier says. Every list in the `populated`,
 * `text-groups`, `record-groups` and `pinned-add` states.
 */
const LISTS: [string, LineField[], number, number?][] = [
	['Known spells', [{ kind: 'number', name: 'Level', ceiling: 'none' }, MARK], 308.5, 424],
	['Traits', [TYPED, MARK, MARK, { kind: 'computed' }, MARK], 509.5, 712],
	[
		'Spells',
		[
			{ kind: 'number', name: 'Level', ceiling: { fixed: '9' } },
			MARK,
			{ kind: 'select', options: ['None', 'Evocation', 'Abjuration'] },
		],
		455.5,
	],
	['Recharging features', [REST, TYPED, MARK, MARK], 541, 616],
	['Rest features', [REST, TYPED], 386.5, 424],
	[
		'Homebrew features',
		[
			{ kind: 'text', name: 'Class' },
			{ kind: 'number', name: 'Uses', ceiling: { fixed: '3' } },
		],
		519,
	],
	['Homebrew strip', [{ kind: 'text', name: 'Class' }, MARK], 397.5, 424],
	['Homebrew in the body', [{ kind: 'number', name: 'Uses', ceiling: { fixed: '3' } }], 282.5],
	['Rituals', [], 192],
	// The `pinned-add` state: one `Level / 9` each.
	['Few records, tall', [{ kind: 'number', name: 'Level', ceiling: { fixed: '9' } }], 284],
	['Many records, short', [{ kind: 'number', name: 'Level', ceiling: { fixed: '9' } }], 284],
	// The `record-groups` state.
	['Class features', [{ kind: 'number', name: 'Uses', ceiling: { fixed: '3' } }], 282.5],
	['Grouped spells', [{ kind: 'number', name: 'Level', ceiling: 'none' }, MARK], 308.5, 424],
	[
		'Spells by name',
		[{ kind: 'select', options: ['Cantrip', '1st', '2nd', '3rd'] }, MARK],
		287.5,
	],
	['Group by nothing', [{ kind: 'number', name: 'Level', ceiling: 'none' }, MARK], 308.5],
	['Group by a toggle', [{ kind: 'number', name: 'Level', ceiling: 'none' }, MARK], 308.5],
	['Tabbed features (record-groups)', [{ kind: 'number', name: 'Uses', ceiling: { fixed: '3' } }], 282.5],
];

describe('a summary field’s estimated width', () => {
	it.each(MEASURED)('never sizes %s short of the harness', (_, field, drawn) => {
		expect(fieldWidthPx(field).width).toBeGreaterThanOrEqual(drawn - 0.05);
	});

	it('sizes a longer name wider, by its characters', () => {
		const short = fieldWidthPx({ kind: 'number', name: 'Uses', ceiling: 'none' });
		const long = fieldWidthPx({ kind: 'number', name: 'Uses left', ceiling: 'none' });
		expect(long.width - short.width).toBeCloseTo(5 * 6.73, 5);
	});

	it('sizes a dropdown by its longest option, not its first', () => {
		expect(fieldWidthPx({ kind: 'select', options: ['A', 'Abjuration'] }).width).toBe(
			fieldWidthPx({ kind: 'select', options: ['Abjuration', 'A'] }).width,
		);
	});

	it('lets a text field narrow to its floor, which is what the grid starts from', () => {
		const text = fieldWidthPx({ kind: 'text', name: 'Class' });
		expect(text.min).toBeLessThan(text.width);
		// Measured: 72.6px at its 5ch floor.
		expect(text.min).toBeGreaterThanOrEqual(72.6 - 0.05);
	});
});

describe('the line’s fit', () => {
	it('is the grid’s own sharing, measured to within a pixel on widths as drawn', () => {
		// Traits as drawn, its widest record: 100.7, 20.8, 20.8, 14.2, 20.8. The
		// harness sweep measured its fit at 509.5px.
		const drawn = [100.7, 20.8, 20.8, 14.2, 20.8].map((width) => ({ width, min: width }));
		expect(Math.abs(lineFitPx(drawn) - 509.5)).toBeLessThanOrEqual(1);
		// A line with no fields keeps its name at its floor and nothing else.
		expect(lineFitPx([])).toBe(192);
	});

	it.each(LISTS)('estimates %s at or above its measured fit', (_, fields, fit) => {
		expect(lineFitPx(fields.map(fieldWidthPx))).toBeGreaterThanOrEqual(fit - 0.05);
	});

	it.each(LISTS)(
		'stacks %s no more than two ems past its measured fit',
		(_, fields, fit, strip = Infinity) => {
			// Tier N stacks up to N × 16px (`sheet.css`), and a headed list's strip
			// turns the stacked line off where it comes in. Two ems at 16px.
			const stackedTo = Math.min(fitTier(fields) * STEP_PX, strip);
			expect(stackedTo).toBeGreaterThanOrEqual(fit);
			expect(stackedTo - fit).toBeLessThanOrEqual(32);
		},
	);
});

describe('the tier', () => {
	it('is the fit rounded up to a step of 16px', () => {
		// Traits: 509.9px is 31.87 steps.
		expect(fitTier([TYPED, MARK, MARK, { kind: 'computed' }, MARK])).toBe(32);
	});

	it('stays inside the table the stylesheet holds', () => {
		expect(fitTier([])).toBe(MIN_FIT_TIER);
		const many = Array.from({ length: 40 }, () => TYPED);
		expect(fitTier(many)).toBe(MAX_FIT_TIER);
	});
});
