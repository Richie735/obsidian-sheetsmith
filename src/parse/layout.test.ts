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

describe('parseLayout: triggers', () => {
	const withTriggers = (triggers: unknown) =>
		JSON.stringify({ name: 'L', triggers, components: [] });

	it('keeps the trigger list as written, and round-trips it', () => {
		const layout = parseLayout(withTriggers(['Short rest', 'Long rest']));
		expect(layout.triggers).toEqual(['Short rest', 'Long rest']);
		expect(parseLayout(serialiseLayout(layout))).toEqual(layout);
	});

	it('leaves the key absent where the layout declares none', () => {
		// An absent key has to stay absent through a round trip, or every
		// hand-authored layout grows one it never asked for on first save.
		const layout = parseLayout(JSON.stringify({ name: 'L', components: [] }));
		expect('triggers' in layout).toBe(false);
		expect(serialiseLayout(layout)).not.toContain('triggers');
	});

	it('refuses a triggers key that is not a list of strings', () => {
		// The shape is the file format's business, as with functions and
		// columns; what the names say is reported in the editor instead.
		expect(() => parseLayout(withTriggers('Long rest'))).toThrow(LayoutParseError);
		expect(() => parseLayout(withTriggers([1, 2]))).toThrow(LayoutParseError);
		expect(() => parseLayout(withTriggers({}))).toThrow(LayoutParseError);
	});

	it('accepts names it will later report as unusable', () => {
		// A blank or repeated name is contents. It parses, and parseTriggers
		// is what says it cannot be used.
		expect(parseLayout(withTriggers(['', 'Long rest', 'Long rest'])).triggers).toEqual(
			['', 'Long rest', 'Long rest'],
		);
	});
});

describe('parseLayout: reset bindings', () => {
	const withReset = (reset: unknown) =>
		JSON.stringify({
			name: 'L',
			components: [
				{
					id: 'hp',
					type: 'stat',
					label: 'HP',
					position: { col: 1, row: 1, width: 1, height: 1 },
					reset,
				},
			],
		});

	const resetOf = (reset: unknown) =>
		parseLayout(withReset(reset)).components[0]?.reset;

	it('accepts a binding with each action', () => {
		expect(resetOf({ trigger: 'Long rest', action: 'full' })).toEqual({
			trigger: 'Long rest',
			action: 'full',
		});
		expect(resetOf({ trigger: 'Downtime', action: 'empty' })).toEqual({
			trigger: 'Downtime',
			action: 'empty',
		});
		expect(
			resetOf({ trigger: 'Long rest', action: 'formula', to: 'mod(con)' }),
		).toEqual({ trigger: 'Long rest', action: 'formula', to: 'mod(con)' });
	});

	it('leaves a component without a reset alone', () => {
		expect(parseLayout(VALID).components[0]?.reset).toBeUndefined();
	});

	it('refuses the pre-split shape rather than migrating it', () => {
		// `{ trigger, to: "max" }` from before the action was split out. No
		// file in the wild carries it, so naming it beats blessing it.
		expect(() => parseLayout(withReset({ trigger: 'Long rest', to: 'max' }))).toThrow(
			LayoutParseError,
		);
	});

	it('refuses a binding whose action it does not know', () => {
		expect(() =>
			parseLayout(withReset({ trigger: 'Long rest', action: 'max' })),
		).toThrow(LayoutParseError);
	});

	it('refuses a formula action with nothing to evaluate', () => {
		expect(() =>
			parseLayout(withReset({ trigger: 'Long rest', action: 'formula' })),
		).toThrow(LayoutParseError);
		expect(() =>
			parseLayout(withReset({ trigger: 'Long rest', action: 'formula', to: '  ' })),
		).toThrow(LayoutParseError);
	});

	it('refuses a binding with no trigger to bind to', () => {
		expect(() => parseLayout(withReset({ action: 'full' }))).toThrow(
			LayoutParseError,
		);
		expect(() => parseLayout(withReset('Long rest'))).toThrow(LayoutParseError);
	});

	it('keeps an expression left beside another action', () => {
		// Switching the action in the editor and back must not throw away what
		// was typed; it simply does not run.
		expect(
			resetOf({ trigger: 'Long rest', action: 'full', to: 'mod(con)' }),
		).toEqual({ trigger: 'Long rest', action: 'full', to: 'mod(con)' });
	});

	it('round-trips a binding through serialiseLayout', () => {
		const layout = parseLayout(
			withReset({ trigger: 'Long rest', action: 'formula', to: 'mod(con)' }),
		);
		expect(parseLayout(serialiseLayout(layout))).toEqual(layout);
	});
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
			// Deliberately a key this version will never understand.
			// `resetTriggers` used to stand here, too close to the `triggers`
			// the parser is about to read; had the two been confused this would
			// have gone on passing while testing nothing.
			theme: 'parchment',
			promoted: ['hp'],
			components: [],
		});
		const layout = parseLayout(source);
		expect(layout.theme).toEqual('parchment');
		expect(layout.promoted).toEqual(['hp']);
		expect(parseLayout(serialiseLayout(layout))).toEqual(layout);
	});

	it('keeps the function library as written, and round-trips it', () => {
		const functions = [
			'mod(score) = floor((score - 10) / 2)',
			'prof = ceil(level / 4) + 1',
		];
		const layout = parseLayout(
			JSON.stringify({ name: 'L', functions, components: [] }),
		);
		expect(layout.functions).toEqual(functions);
		expect(parseLayout(serialiseLayout(layout))).toEqual(layout);
	});

	it('accepts a definition it cannot read, leaving that to the library', () => {
		// A typo in one function must not stop the layout loading, or every
		// sheet using it goes blank over a missing bracket.
		expect(() =>
			parseLayout(
				JSON.stringify({ name: 'L', functions: ['mod(score ='], components: [] }),
			),
		).not.toThrow();
	});

	it('rejects a function library that is not an array of strings', () => {
		// Deliberate, and the opposite call from the test above: what a line
		// says is the library's business and a bad one is reported, but what
		// shape the key is refuses loudly, as "columns" and "components"
		// already do. A layout is a plain file in the vault, the message names
		// the key and the shape it wants, and the sheet shows that message
		// rather than pretending to render — so the failure is diagnosable and
		// fixable, which a silently ignored key would not be.
		//
		// A map of name to body is not a supported spelling. It reads like one
		// because an earlier comment listed "a hand-authored function library"
		// among the keys this version did not understand and passed through
		// verbatim; SPEC §5 now defines the key, so it is validated.
		expect(() =>
			parseLayout(
				JSON.stringify({
					name: 'L',
					functions: { mod: 'floor((score - 10) / 2)' },
					components: [],
				}),
			),
		).toThrow(LayoutParseError);
		expect(() =>
			parseLayout(
				JSON.stringify({ name: 'L', functions: [42], components: [] }),
			),
		).toThrow(/array of strings/);
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
