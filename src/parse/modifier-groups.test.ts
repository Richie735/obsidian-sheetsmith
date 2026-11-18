import { describe, expect, it } from 'vitest';
import { Layout, LayoutParseError, parseLayout, serialiseLayout } from './layout';
import {
	parseModifierGroups,
	readGroupLine,
	spellGroupLine,
} from './modifier-groups';

/*
 * The layout's modifier groups (`docs/features/table-row-modifier-target.md`
 * D6). The list itself only: which values are in a group is declared on each
 * value and read by `formula/modifier-targets.ts`.
 */

const layout = (modifierGroups: unknown): Layout =>
	({ name: 'L', components: [], modifierGroups }) as unknown as Layout;

describe('parseModifierGroups', () => {
	it('keeps declared groups in order, a blank label falling back to the name', () => {
		expect(
			parseModifierGroups(
				layout([
					{ name: 'save', label: 'Saving throws' },
					{ name: 'check', label: '  ' },
				]),
			),
		).toEqual({
			groups: [
				{ name: 'save', label: 'Saving throws' },
				{ name: 'check', label: 'check' },
			],
			problems: [],
		});
	});

	it('has nothing to say about a layout declaring none', () => {
		expect(parseModifierGroups({ name: 'L', components: [] })).toEqual({
			groups: [],
			problems: [],
		});
	});

	it('reports and drops a blank name', () => {
		const read = parseModifierGroups(layout([{ name: ' ', label: 'Saves' }]));
		expect(read.groups).toEqual([]);
		expect(read.problems).toEqual([{ message: 'A modifier group needs a name.' }]);
	});

	it('reports and drops a repeated name, keeping the first', () => {
		const read = parseModifierGroups(
			layout([
				{ name: 'save', label: 'Saving throws' },
				{ name: 'save', label: 'Saves again' },
			]),
		);
		expect(read.groups).toEqual([{ name: 'save', label: 'Saving throws' }]);
		expect(read.problems).toEqual([
			{
				group: 'save',
				message:
					'"save" is declared more than once. The second is ignored, since two groups with one name could not be told apart.',
			},
		]);
	});

	it('reports and drops a name a cell could not spell as one token', () => {
		for (const name of ['saving throws', '1st', 'save.all', 'dc-check']) {
			const read = parseModifierGroups(layout([{ name, label: 'X' }]));
			expect(read.groups).toEqual([]);
			expect(read.problems[0]?.message).toBe(
				`"${name}" cannot be a group name, because a row spells a group as @ and one name: letters, digits and underscores, not starting with a digit. Rename it.`,
			);
		}
	});

	it('reads nothing but the name and the label off an entry', () => {
		// Derived membership is refused at the read: there is nowhere for it to live.
		const read = parseModifierGroups(
			layout([{ name: 'dex_based', label: 'DX-based', members: 'abilities.DEX' }]),
		);
		expect(read.groups).toEqual([{ name: 'dex_based', label: 'DX-based' }]);
	});
});

describe('the layout key', () => {
	it('refuses a layout whose modifierGroups is not a list of objects', () => {
		for (const modifierGroups of ['save', ['save'], { name: 'save' }, [null]]) {
			expect(() =>
				parseLayout(JSON.stringify({ name: 'L', components: [], modifierGroups })),
			).toThrow(LayoutParseError);
		}
	});

	it('round-trips a layout holding groups, and a layout holding none', () => {
		const withGroups = parseLayout(
			JSON.stringify({
				name: 'L',
				components: [],
				modifierGroups: [{ name: 'save', label: 'Saving throws' }],
			}),
		);
		expect(parseLayout(serialiseLayout(withGroups))).toEqual(withGroups);
		const without = parseLayout(JSON.stringify({ name: 'L', components: [] }));
		expect('modifierGroups' in without).toBe(false);
	});
});

describe('the editor line format', () => {
	it('reads `name: Label`, and a line with no colon as its own label', () => {
		expect(readGroupLine('save: Saving throws')).toEqual({ name: 'save', label: 'Saving throws' });
		expect(readGroupLine('  check  ')).toEqual({ name: 'check', label: 'check' });
		expect(readGroupLine('dc:')).toEqual({ name: 'dc', label: 'dc' });
	});

	it('spells an entry back as the line it reads from', () => {
		expect(spellGroupLine({ name: 'save', label: 'Saving throws' })).toBe('save: Saving throws');
		expect(spellGroupLine({ name: 'check', label: 'check' })).toBe('check');
		expect(readGroupLine(spellGroupLine({ name: 'save', label: 'Saving throws' }))).toEqual({
			name: 'save',
			label: 'Saving throws',
		});
	});
});
