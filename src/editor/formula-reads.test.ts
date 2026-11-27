import { describe, expect, it } from 'vitest';
import { formulaReads } from './formula-reads';
import { parseLayout } from '../parse/layout';

/*
 * The dotted names a layout's formulas read, which the canvas hands every
 * sample (`formula-reads.ts`).
 */

const layout = (extra: Record<string, unknown>) =>
	parseLayout(
		JSON.stringify({
			name: 'Probe',
			components: [
				{
					id: 'ac',
					type: 'card',
					label: 'AC',
					derived: '10 + abilities.DEX + mod.self',
					position: { col: 1, row: 1, width: 2, height: 1 },
				},
			],
			...extra,
		}),
	);

describe('formulaReads', () => {
	it('keeps each read as its whole dotted path', () => {
		const reads = formulaReads(layout({}));
		expect(reads.has('abilities.DEX')).toBe(true);
		expect(reads.has('abilities')).toBe(false);
	});

	it('reads function bodies, and not the names the functions define or call', () => {
		const reads = formulaReads(
			layout({ functions: ['level = passport.level', 'prof = ceil(level / 4) + 1'] }),
		);
		expect(reads.has('passport.level')).toBe(true);
		expect(reads.has('level')).toBe(true);
		expect(reads.has('ceil')).toBe(false);
		expect(reads.has('prof')).toBe(false);
	});

	it('reads a modifier definition\'s amount, condition and change amounts', () => {
		const reads = formulaReads(
			layout({
				modifiers: [
					{ name: 'Alert', target: 'ac', amount: 'prof', when: 'awake' },
					{ name: 'Ring', changes: [{ target: 'ac', amount: 'bonus.ring' }] },
				],
			}),
		);
		expect(reads.has('prof')).toBe(true);
		expect(reads.has('awake')).toBe(true);
		expect(reads.has('bonus.ring')).toBe(true);
		// A target is the name a modifier writes to, not one it reads.
		expect(reads.has('ac')).toBe(false);
	});

	it('reads nothing from a formula that does not tokenize', () => {
		const baseline = formulaReads(layout({}));
		expect(formulaReads(layout({ functions: ['x = 1 +* "'] }))).toEqual(baseline);
	});
});
