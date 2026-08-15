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
