import { describe, expect, it } from 'vitest';
import { LayoutParseError, parseLayout, serialiseLayout } from './layout';

const VALID = JSON.stringify({
	name: 'DnD 5e Caster',
	columns: 6,
	components: [
		{
			id: 'dex',
			type: 'stat',
			label: 'DEX',
			position: { col: 1, row: 1, width: 1, height: 1 },
			derived: 'mod(dex)',
		},
	],
});

describe('parseLayout: component ids', () => {
	const withId = (id: string) =>
		JSON.stringify({
			name: 'L',
			components: [
				{
					id,
					type: 'stat',
					label: 'A',
					position: { col: 1, row: 1, width: 1, height: 1 },
				},
			],
		});

	const idsOf = (source: string) =>
		parseLayout(source).components.map((component) => component.id);

	it('migrates an id no formula could reference, rather than failing', () => {
		// "armour-class" tokenizes as armour minus class. The editor emitted
		// exactly this shape, so rejecting it would blank the sheet over a
		// name nothing could have been pointing at.
		expect(idsOf(withId('armour-class'))).toEqual(['armour_class']);
		expect(idsOf(withId('has space'))).toEqual(['has_space']);
		expect(idsOf(withId('a.b'))).toEqual(['a_b']);
		// A leading digit is not a name either.
		expect(idsOf(withId('2nd-wind'))).toEqual(['_2nd_wind']);
	});

	it('leaves usable ids exactly as written', () => {
		for (const id of ['abilities', 'armour_class', '_private', 'ac2']) {
			expect(idsOf(withId(id))).toEqual([id]);
		}
	});

	it('does not migrate one id onto another', () => {
		const source = JSON.stringify({
			name: 'L',
			components: ['armour_class', 'armour-class', 'armour.class'].map(
				(id, i) => ({
					id,
					type: 'stat',
					label: `A${i}`,
					position: { col: 1, row: i + 1, width: 1, height: 1 },
				}),
			),
		});
		expect(idsOf(source)).toEqual([
			'armour_class',
			'armour_class_2',
			'armour_class_3',
		]);
	});

	it('still reports two components genuinely sharing an id', () => {
		// Renaming these apart would hide an authoring error.
		const source = JSON.stringify({
			name: 'L',
			components: [1, 2].map((i) => ({
				id: 'abilities',
				type: 'stat',
				label: `A${i}`,
				position: { col: 1, row: i, width: 1, height: 1 },
			})),
		});
		expect(() => parseLayout(source)).toThrow(LayoutParseError);
	});
});

describe('parseLayout', () => {
	it('parses a valid layout', () => {
		const layout = parseLayout(VALID);
		expect(layout.name).toBe('DnD 5e Caster');
		expect(layout.columns).toBe(6);
		expect(layout.components).toHaveLength(1);
	});

	it('carries component-specific config fields through', () => {
		const component = parseLayout(VALID).components[0] as unknown as Record<
			string,
			unknown
		>;
		expect(component.derived).toBe('mod(dex)');
	});

	it('rejects invalid JSON with a clear message', () => {
		expect(() => parseLayout('{nope')).toThrow(LayoutParseError);
	});

	it('rejects a component missing its id', () => {
		const bad = JSON.stringify({
			name: 'L',
			components: [
				{ type: 'stat', label: 'DEX', position: { col: 1, row: 1, width: 1, height: 1 } },
			],
		});
		expect(() => parseLayout(bad)).toThrow(/id/);
	});

	it('rejects a malformed position', () => {
		const bad = JSON.stringify({
			name: 'L',
			components: [
				{ id: 'a', type: 'stat', label: 'A', position: { col: 0, row: 1, width: 1, height: 1 } },
			],
		});
		expect(() => parseLayout(bad)).toThrow(/col/);
	});

	it('round-trips through serialiseLayout', () => {
		const layout = parseLayout(VALID);
		expect(parseLayout(serialiseLayout(layout))).toEqual(layout);
	});

	it('preserves top-level keys it does not understand', () => {
		const source = JSON.stringify({
			name: 'L',
			functions: { mod: 'floor((score - 10) / 2)' },
			resetTriggers: ['Long rest'],
			promoted: ['hp'],
			components: [],
		});
		const layout = parseLayout(source);
		expect(layout.functions).toEqual({ mod: 'floor((score - 10) / 2)' });
		expect(layout.resetTriggers).toEqual(['Long rest']);
		expect(layout.promoted).toEqual(['hp']);
		expect(parseLayout(serialiseLayout(layout))).toEqual(layout);
	});

	it('trims id, type, and label so they match trimmed note sections', () => {
		const layout = parseLayout(
			JSON.stringify({
				name: ' L ',
				components: [
					{
						id: ' str ',
						type: ' stat ',
						label: ' Str ',
						position: { col: 1, row: 1, width: 1, height: 1 },
					},
				],
			}),
		);
		expect(layout.name).toBe('L');
		expect(layout.components[0]).toMatchObject({
			id: 'str',
			type: 'stat',
			label: 'Str',
		});
	});

	it('rejects a label containing a line break', () => {
		const bad = JSON.stringify({
			name: 'L',
			components: [
				{
					id: 'a',
					type: 'stat',
					label: 'St\nr',
					position: { col: 1, row: 1, width: 1, height: 1 },
				},
			],
		});
		expect(() => parseLayout(bad)).toThrow(/line break/);
	});

	it('rejects duplicate ids and duplicate labels', () => {
		const position = { col: 1, row: 1, width: 1, height: 1 };
		const dupId = JSON.stringify({
			name: 'L',
			components: [
				{ id: 'a', type: 'stat', label: 'A', position },
				{ id: 'a', type: 'stat', label: 'B', position },
			],
		});
		expect(() => parseLayout(dupId)).toThrow(/id/);
		const dupLabel = JSON.stringify({
			name: 'L',
			components: [
				{ id: 'a', type: 'stat', label: 'A', position },
				{ id: 'b', type: 'stat', label: 'A', position },
			],
		});
		expect(() => parseLayout(dupLabel)).toThrow(/label/i);
	});
});
