import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { LayoutParseError, mayHoldChildren, parseLayout, serialiseLayout } from './layout';
import { componentsInside, walkComponents } from './layout-walk';
import { ComponentConfig } from '../types';

const VALID = JSON.stringify({
	name: 'DnD 5e Caster',
	columns: 6,
	components: [
		{
			id: 'dex',
			type: 'card',
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

describe('parseLayout: modifier types', () => {
	const withTypes = (modifierTypes: unknown) =>
		JSON.stringify({ name: 'L', modifierTypes, components: [] });

	it('keeps the list as written, and round-trips it', () => {
		const layout = parseLayout(withTypes(['item', 'status']));
		expect(layout.modifierTypes).toEqual(['item', 'status']);
		expect(parseLayout(serialiseLayout(layout))).toEqual(layout);
	});

	it('leaves the key absent where the layout declares none', () => {
		const layout = parseLayout(JSON.stringify({ name: 'L', components: [] }));
		expect('modifierTypes' in layout).toBe(false);
		expect(serialiseLayout(layout)).not.toContain('modifierTypes');
	});

	it('refuses a key that is not a list of strings', () => {
		// The same split the triggers and the function library follow: the shape
		// refuses the file, and what the names say is reported in the editor.
		expect(() => parseLayout(withTypes('item'))).toThrow(LayoutParseError);
		expect(() => parseLayout(withTypes([1]))).toThrow(LayoutParseError);
		expect(() => parseLayout(withTypes({}))).toThrow(LayoutParseError);
	});

	it('accepts names it will later report as unusable', () => {
		expect(parseLayout(withTypes(['', 'item', 'item'])).modifierTypes).toEqual([
			'',
			'item',
			'item',
		]);
	});
});

describe('parseLayout: modifier definitions', () => {
	const withModifiers = (modifiers: unknown) =>
		JSON.stringify({ name: 'L', modifiers, components: [] });

	it('keeps every key a definition carries, in order, through a round trip', () => {
		/*
		 * **Not byte identity, which this was named for and never asserted.**
		 * Constraint 3 reaches a character note and not a layout file, and
		 * `serialiseLayout` pretty-prints — measured: `serialiseLayout(parseLayout(
		 * src)) === src` is false for the compact source below, so the old name was
		 * describing a claim the assertion could not make. Byte identity over a
		 * layout carrying `modifiers` is the fixture's, in
		 * `view/vault-fixture.test.ts`, where the file is already in the
		 * serialiser's own formatting.
		 *
		 * What is worth proving here is what a round trip can prove: every key a
		 * definition carries survives, in the order the file wrote them, and a key
		 * this version does not understand survives with them (below). A definition
		 * that lost its `when` on the first save would take a condition off every
		 * character on the layout.
		 */
		const source = withModifiers([
			{
				name: 'Belt of Giant Strength',
				target: 'abilities.STR',
				amount: '2',
				bonusType: 'item',
			},
			{
				name: 'Plate armour',
				target: 'armour_class',
				operator: 'override',
				amount: '18',
			},
			{
				name: 'Cloak of Elvenkind',
				target: 'armour_class',
				amount: '1',
				when: 'Worn',
			},
		]);
		const layout = parseLayout(source);
		expect(layout.modifiers).toHaveLength(3);
		expect(layout.modifiers?.[1]?.operator).toBe('override');
		expect(layout.modifiers?.[2]?.when).toBe('Worn');
		expect(parseLayout(serialiseLayout(layout))).toEqual(layout);
		// Key order too, which `toEqual` says nothing about and which decides what
		// a reader of the file sees after their first save.
		expect(Object.keys(layout.modifiers?.[0] ?? {})).toEqual([
			'name',
			'target',
			'amount',
			'bonusType',
		]);
		// And the word the old name claimed, measured rather than assumed.
		expect(serialiseLayout(layout)).not.toBe(source);
	});

	it('leaves the key absent where the layout declares none', () => {
		// `parse/layout.ts`'s recorded trap, a fourth time: a layout that never
		// wanted definitions must not grow the key on first save.
		const layout = parseLayout(JSON.stringify({ name: 'L', components: [] }));
		expect('modifiers' in layout).toBe(false);
		expect(serialiseLayout(layout)).not.toContain('modifiers');
	});

	it('refuses a key that is not an array of objects', () => {
		// The same split the triggers, the function library and the bonus types
		// follow: the shape refuses the file, and what each definition says is
		// reported in the editor.
		expect(() => parseLayout(withModifiers('Belt'))).toThrow(LayoutParseError);
		expect(() => parseLayout(withModifiers(['Belt']))).toThrow(LayoutParseError);
		expect(() => parseLayout(withModifiers([1]))).toThrow(LayoutParseError);
		expect(() => parseLayout(withModifiers([null]))).toThrow(LayoutParseError);
		expect(() => parseLayout(withModifiers([[]]))).toThrow(LayoutParseError);
		expect(() => parseLayout(withModifiers({}))).toThrow(LayoutParseError);
	});

	it('accepts definitions it will later report as unusable', () => {
		// Contents are the editor's business, so a blank name and a name declared
		// twice both survive the parse and the round trip.
		const layout = parseLayout(
			withModifiers([{ name: '' }, { name: 'Ring' }, { name: 'Ring' }]),
		);
		expect(layout.modifiers).toHaveLength(3);
	});

	it('preserves a key this version does not understand', () => {
		// The same promise `parseComponent` makes: a promoted field survives a
		// round trip rather than being stripped from somebody's file.
		const layout = parseLayout(
			withModifiers([{ name: 'Ring', target: 'ac', amount: '1', priority: 5 }]),
		);
		expect(serialiseLayout(layout)).toContain('"priority": 5');
	});
});

describe('parseLayout: reset bindings', () => {
	const withReset = (reset: unknown) =>
		JSON.stringify({
			name: 'L',
			components: [
				{
					id: 'hp',
					type: 'card',
					label: 'HP',
					position: { col: 1, row: 1, width: 1, height: 1 },
					reset,
				},
			],
		});

	const resetOf = (reset: unknown) =>
		parseLayout(withReset(reset)).components[0]?.reset;

	it('accepts a binding with each action, as a one-element list', () => {
		// A single binding may be written on its own; it normalises to a list so
		// nothing downstream has to ask which form the author used.
		expect(resetOf({ trigger: 'Long rest', action: 'full' })).toEqual([
			{ trigger: 'Long rest', action: 'full' },
		]);
		expect(resetOf({ trigger: 'Downtime', action: 'empty' })).toEqual([
			{ trigger: 'Downtime', action: 'empty' },
		]);
		expect(
			resetOf({ trigger: 'Long rest', action: 'formula', to: 'mod(con)' }),
		).toEqual([{ trigger: 'Long rest', action: 'formula', to: 'mod(con)' }]);
	});

	it('accepts several bindings, each with its own action', () => {
		// The case the single binding could not express: in 5e everything a
		// short rest restores is restored by a long rest too, and the two need
		// not restore it to the same thing.
		expect(
			resetOf([
				{ trigger: 'Short rest', action: 'formula', to: '1' },
				{ trigger: 'Long rest', action: 'full' },
			]),
		).toEqual([
			{ trigger: 'Short rest', action: 'formula', to: '1' },
			{ trigger: 'Long rest', action: 'full' },
		]);
	});

	it('refuses two bindings on one trigger', () => {
		// The button would apply both in file order and the second would win,
		// which is not a reading anyone intended.
		expect(() =>
			parseLayout(
				withReset([
					{ trigger: 'Long rest', action: 'full' },
					{ trigger: 'Long rest', action: 'empty' },
				]),
			),
		).toThrow(LayoutParseError);
	});

	it('refuses a bad binding anywhere in the list', () => {
		expect(() =>
			parseLayout(
				withReset([
					{ trigger: 'Short rest', action: 'full' },
					{ trigger: 'Long rest' },
				]),
			),
		).toThrow(LayoutParseError);
	});

	it('round-trips a list of bindings', () => {
		const layout = parseLayout(
			withReset([
				{ trigger: 'Short rest', action: 'empty' },
				{ trigger: 'Long rest', action: 'full' },
			]),
		);
		expect(parseLayout(serialiseLayout(layout))).toEqual(layout);
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
		).toEqual([{ trigger: 'Long rest', action: 'full', to: 'mod(con)' }]);
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
					type: 'card',
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
					type: 'card',
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

	it('migrates the reserved modifier namespace off a component', () => {
		/*
		 * `mod` is the modifier namespace (SPEC §5). `buildSheetScope` registers
		 * `${id}` and `${id}.${name}` into the same flat table the slots go into,
		 * so a component called `mod` would register `mod.DEX` beside
		 * `mod.armour_class` and one name would mean two things.
		 *
		 * Rewritten rather than refused, on the hyphen's own argument, and safe
		 * three times over: a note is keyed by label and not by id, so no
		 * character data moves; a formula that said `mod` was already ambiguous
		 * between a component and a library function; and nothing is released.
		 */
		expect(idsOf(withId('mod'))).toEqual(['mod_2']);
		// And the label is untouched, which is the whole of why the rewrite is
		// safe: a note's sections are keyed by label, so no stored value moves.
		expect(
			parseLayout(withId('mod')).components.map((one) => one.label),
		).toEqual(['A']);
	});

	it('leaves a name merely starting with the namespace alone', () => {
		// Only the exact spelling collides: `mod` plus a dot is the namespace, and
		// `modifier` is an ordinary name.
		expect(idsOf(withId('modifier'))).toEqual(['modifier']);
		expect(idsOf(withId('mod_bonus'))).toEqual(['mod_bonus']);
	});

	it('still reports two components genuinely sharing an id', () => {
		// Renaming these apart would hide an authoring error.
		const source = JSON.stringify({
			name: 'L',
			components: [1, 2].map((i) => ({
				id: 'abilities',
				type: 'card',
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
				{ type: 'card', label: 'DEX', position: { col: 1, row: 1, width: 1, height: 1 } },
			],
		});
		expect(() => parseLayout(bad)).toThrow(/id/);
	});

	it('rejects a malformed position', () => {
		const bad = JSON.stringify({
			name: 'L',
			components: [
				{ id: 'a', type: 'card', label: 'A', position: { col: 0, row: 1, width: 1, height: 1 } },
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
						type: ' card ',
						label: ' Str ',
						position: { col: 1, row: 1, width: 1, height: 1 },
					},
				],
			}),
		);
		expect(layout.name).toBe('L');
		expect(layout.components[0]).toMatchObject({
			id: 'str',
			type: 'card',
			label: 'Str',
		});
	});

	it('rejects a label containing a line break', () => {
		const bad = JSON.stringify({
			name: 'L',
			components: [
				{
					id: 'a',
					type: 'card',
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
				{ id: 'a', type: 'card', label: 'A', position },
				{ id: 'a', type: 'card', label: 'B', position },
			],
		});
		expect(() => parseLayout(dupId)).toThrow(/id/);
		const dupLabel = JSON.stringify({
			name: 'L',
			components: [
				{ id: 'a', type: 'card', label: 'A', position },
				{ id: 'b', type: 'card', label: 'A', position },
			],
		});
		expect(() => parseLayout(dupLabel)).toThrow(/label/i);
	});
});

describe('parseLayout: buffer clears', () => {
	const withReset = (reset: unknown) =>
		JSON.stringify({
			name: 'L',
			components: [
				{
					id: 'hp',
					type: 'pool',
					label: 'HP',
					position: { col: 1, row: 1, width: 1, height: 1 },
					reset,
				},
			],
		});
	const resetOf = (reset: unknown) =>
		parseLayout(withReset(reset)).components[0]?.reset;

	it('accepts an action and a buffer clear together', () => {
		// 5e: a long rest restores hit points and clears temporary ones.
		expect(
			resetOf({ trigger: 'Long rest', action: 'full', buffer: 'clear' }),
		).toEqual([{ trigger: 'Long rest', action: 'full', buffer: 'clear' }]);
	});

	it('accepts a buffer clear on its own, with no action', () => {
		// 4e: the end of an encounter clears temporary hit points and touches
		// nothing else. The layout had no way to say this before.
		expect(resetOf({ trigger: 'End of encounter', buffer: 'clear' })).toEqual([
			{ trigger: 'End of encounter', buffer: 'clear' },
		]);
	});

	it('refuses a binding that would do nothing at all', () => {
		expect(() => parseLayout(withReset({ trigger: 'Long rest' }))).toThrow(
			LayoutParseError,
		);
	});

	it('refuses a buffer value it does not know', () => {
		expect(() =>
			parseLayout(withReset({ trigger: 'Long rest', buffer: 'reset' })),
		).toThrow(LayoutParseError);
	});

	it('round-trips a buffer-only binding', () => {
		const layout = parseLayout(withReset({ trigger: 'Downtime', buffer: 'clear' }));
		expect(parseLayout(serialiseLayout(layout))).toEqual(layout);
	});
});

/*
 * Components inside components (SPEC §4.2, §13).
 *
 * `children` is shared config the parser acts on, so the depth bound, the
 * flattened uniqueness checks and the ordered walk are all this file's
 * business — a refusal raised anywhere later would arrive after the parser had
 * already accepted and walked the depth it was refusing.
 */
describe('parseLayout: components inside components', () => {
	const at = (row: number, col = 1, width = 2) => ({
		col,
		row,
		width,
		height: 1,
	});

	/** A layout of one Group holding whatever it is given. */
	const withChildren = (children: unknown) =>
		JSON.stringify({
			name: 'L',
			components: [
				{
					id: 'outer',
					type: 'group',
					label: 'Outer',
					position: at(1),
					children,
				},
			],
		});

	const leaf = (id: string, row = 1) => ({
		id,
		type: 'card',
		label: id.toUpperCase(),
		position: at(row),
	});

	it('parses a child exactly as it parses a top-level component', () => {
		const layout = parseLayout(withChildren([leaf('str')]));
		expect(layout.components[0]?.children).toEqual([
			{ id: 'str', type: 'card', label: 'STR', position: at(1) },
		]);
	});

	it('holds a child to the same checks a top-level component gets', () => {
		// Position, the line-break rule on a label, and the reset shape: all of
		// them run over a child because the same function parses it.
		expect(() =>
			parseLayout(withChildren([{ ...leaf('str'), position: { col: 0, row: 1, width: 1, height: 1 } }])),
		).toThrow(/col/);
		expect(() =>
			parseLayout(withChildren([{ ...leaf('str'), label: 'S\ntr' }])),
		).toThrow(/line break/);
		expect(() =>
			parseLayout(withChildren([{ ...leaf('str'), reset: { trigger: 'Long rest' } }])),
		).toThrow(LayoutParseError);
	});

	it('names the container in a message about one of its children', () => {
		// "Component 1" of a list the author cannot see is not an address. The
		// message has to read as a path, or a broken child inside a group of six
		// is a hunt.
		expect(() =>
			parseLayout(withChildren([{ ...leaf('str'), position: undefined }])),
		).toThrow(/Outer.*component 1/s);
	});

	it('accepts a container inside a container', () => {
		// §13's motivating arrangement: an outer Group of Groups, each holding a
		// card and a table. The deepest legal component is three levels down.
		const layout = parseLayout(
			withChildren([
				{
					id: 'inner',
					type: 'group',
					label: 'Inner',
					position: at(1),
					children: [leaf('str')],
				},
			]),
		);
		expect(layout.components[0]?.children?.[0]?.children?.[0]?.id).toBe('str');
	});

	it('refuses a third container, naming the component and the rule', () => {
		const source = withChildren([
			{
				id: 'inner',
				type: 'group',
				label: 'Inner',
				position: at(1),
				children: [{ ...leaf('deep'), children: [leaf('str')] }],
			},
		]);
		expect(() => parseLayout(source)).toThrow(LayoutParseError);
		expect(() => parseLayout(source)).toThrow(/"DEEP"/);
		expect(() => parseLayout(source)).toThrow(/one level deep/);
	});

	it('refuses it whatever type the component is', () => {
		// Structural rather than type-aware, which is what keeps src/parse/ free
		// of any import from src/components/ and makes the rule hold for a
		// container type nobody has written yet.
		const source = withChildren([
			{
				id: 'inner',
				type: 'tab-set-nobody-has-written',
				label: 'Inner',
				position: at(1),
				children: [{ ...leaf('deep'), type: 'pool', children: [leaf('str')] }],
			},
		]);
		expect(() => parseLayout(source)).toThrow(/one level deep/);
	});

	it('counts containers, not tab sets, so a nested one turns on its tabs', () => {
		/*
		 * The pair the depth rule actually draws, and it is easy to state wrongly:
		 * this feature's own acceptance criteria said "a Tab set inside a Tab set is
		 * refused", which contradicted the scope bullet governing it and the code
		 * both. The rule counts *containers* — so the question is never whether the
		 * outer thing is a tab set, it is whether the tabs are containers too.
		 *
		 * Typed as tab sets deliberately, even though this file may not import the
		 * registry: the depth check is structural, so these are only strings to it,
		 * and naming them is what makes the case legible to a reader who arrives
		 * from the criterion.
		 */
		const nested = (tab: unknown) =>
			withChildren([
				{
					id: 'inner',
					type: 'tab-set',
					label: 'Inner',
					position: at(1),
					children: [tab],
				},
			]);

		// Tabs that are cards: the inner tab set is an ordinary second-level
		// container and there is no third.
		const cards = parseLayout(nested(leaf('str')));
		expect(
			cards.components[0]?.children?.[0]?.children?.[0]?.id,
		).toBe('str');

		// Tabs that are containers: those tabs are the third container.
		expect(() =>
			parseLayout(nested({ ...leaf('grp'), type: 'group', children: [leaf('str')] })),
		).toThrow(/one level deep/);
	});

	it('refuses a children key that is not a list', () => {
		expect(() => parseLayout(withChildren({}))).toThrow(/"children"/);
		expect(() => parseLayout(withChildren('str'))).toThrow(/"children"/);
	});

	it('leaves the key absent where a component has none', () => {
		// Every layout in the fixtures and the vault renders exactly as it did,
		// which is what an absent key has to mean.
		const layout = parseLayout(VALID);
		expect('children' in (layout.components[0] ?? {})).toBe(false);
		expect(serialiseLayout(layout)).not.toContain('children');
	});

	it('round-trips a nested layout', () => {
		const layout = parseLayout(
			withChildren([
				{
					id: 'inner',
					type: 'group',
					label: 'Inner',
					position: at(1),
					children: [leaf('str')],
				},
			]),
		);
		expect(parseLayout(serialiseLayout(layout))).toEqual(layout);
	});

	it('preserves unknown keys on a child, as it does on a top-level component', () => {
		const layout = parseLayout(
			withChildren([{ ...leaf('str'), derived: 'mod(str)' }]),
		);
		const child = layout.components[0]?.children?.[0] as unknown as Record<
			string,
			unknown
		>;
		expect(child.derived).toBe('mod(str)');
	});

	it('refuses a child colliding with a component in another container', () => {
		// Labels key note sections in a flat note, so containment scopes
		// neither a label nor an id: this is the same collision it always was.
		const collide = (key: 'id' | 'label') =>
			JSON.stringify({
				name: 'L',
				components: [
					{
						id: 'left',
						type: 'group',
						label: 'Left',
						position: at(1),
						children: [{ ...leaf('str'), [key]: key === 'id' ? 'shared' : 'Shared' }],
					},
					{
						id: 'right',
						type: 'group',
						label: 'Right',
						position: at(2),
						children: [{ ...leaf('dex', 2), [key]: key === 'id' ? 'shared' : 'Shared' }],
					},
				],
			});
		expect(() => parseLayout(collide('id'))).toThrow(/Duplicate component id/);
		expect(() => parseLayout(collide('label'))).toThrow(
			/Labels key note sections/,
		);
	});

	it('migrates a nested id against the whole flattened set', () => {
		// Not against its siblings: the id is what a formula writes, and a
		// formula does not know what a name is nested inside.
		const layout = parseLayout(
			JSON.stringify({
				name: 'L',
				components: [
					{ id: 'armour_class', type: 'card', label: 'A', position: at(1) },
					{
						id: 'outer',
						type: 'group',
						label: 'Outer',
						position: at(2),
						children: [
							{ id: 'armour-class', type: 'card', label: 'B', position: at(1) },
						],
					},
				],
			}),
		);
		expect(layout.components[1]?.children?.[0]?.id).toBe('armour_class_2');
	});
});

describe('walkComponents', () => {
	const block = (
		id: string,
		row: number,
		col: number,
		children?: ComponentConfig[],
	): ComponentConfig => ({
		id,
		type: children ? 'group' : 'card',
		label: id,
		position: { col, row, width: 1, height: 1 },
		...(children ? { children } : {}),
	});

	/*
	 * File order and grid order deliberately disagree at both levels, because
	 * that is the only shape where "grid reading order" and "the order somebody
	 * happened to type them" are distinguishable.
	 */
	const LAYOUT = [
		block('last', 3, 1),
		block('group', 2, 1, [block('inner_second', 1, 2), block('inner_first', 1, 1)]),
		block('first', 1, 1),
	];

	it('reads each level in grid order, children where their container sits', () => {
		expect(walkComponents(LAYOUT).map((entry) => entry.config.id)).toEqual([
			'first',
			'group',
			'inner_first',
			'inner_second',
			'last',
		]);
	});

	it('reports depth, parent, and the list a component lives in', () => {
		const inner = walkComponents(LAYOUT)[2];
		expect(inner?.depth).toBe(1);
		expect(inner?.parent?.id).toBe('group');
		expect(inner?.siblings).toBe(LAYOUT[1]?.children);
	});

	it('does not reorder the layout it was given', () => {
		// A render must not rewrite its own input, and the editor removes
		// through `siblings` by identity.
		walkComponents(LAYOUT);
		expect(LAYOUT.map((config) => config.id)).toEqual([
			'last',
			'group',
			'first',
		]);
	});

	it('reads the same order descending as it does flattened', () => {
		// The claim the sheet rests on, and it is not a restatement: the trigger
		// loop and the read-every-section pass iterate the flat walk, while the
		// grid draws by descending one level at a time through
		// `componentsInside`. If those two orders ever differ, the sheet renders
		// its cards in an order the name table and the tab order do not have —
		// and the flat walk is the one nothing draws, so nothing would show it.
		const walk = walkComponents(LAYOUT);
		const descend = (parent: ComponentConfig | null): string[] =>
			componentsInside(walk, parent).flatMap((config) => [
				config.id,
				...descend(config),
			]);
		expect(descend(null)).toEqual(walk.map((entry) => entry.config.id));
	});

	it('groups each level by its own container', () => {
		// Vacuity guard on the test above: a `componentsInside` that returned
		// everything at every level would still flatten to the same sequence for
		// a one-container layout read depth first.
		expect(componentsInside(walkComponents(LAYOUT), null).map((c) => c.id)).toEqual(
			['first', 'group', 'last'],
		);
		const group = LAYOUT[1] as ComponentConfig;
		expect(
			componentsInside(walkComponents(LAYOUT), group).map((c) => c.id),
		).toEqual(['inner_first', 'inner_second']);
	});

	it('imports nothing from src/components to decide any of it', () => {
		// The depth check is structural rather than type-aware, which is what
		// keeps this file pure: five callers share this order, and one of them is
		// the layout editor, which does know the registry. The rule holds for a
		// container type nobody has written yet.
		const source = readFileSync(new URL('./layout.ts', import.meta.url), 'utf8');
		const imports = [...source.matchAll(/^import .*?from '([^']+)';$/gm)].map(
			(match) => match[1],
		);
		expect(imports.length).toBeGreaterThan(0);
		expect(imports.filter((path) => path?.includes('components'))).toEqual([]);
	});

	it('gives the same order for a layout that has been through the parser', () => {
		// The five callers all walk a parsed layout, so the order has to survive
		// parsing — which normalises shared config and could reorder `children`
		// without anything else noticing.
		const parsed = parseLayout(JSON.stringify({ name: 'L', components: LAYOUT }));
		expect(walkComponents(parsed.components).map((entry) => entry.config.id)).toEqual(
			walkComponents(LAYOUT).map((entry) => entry.config.id),
		);
	});
});

describe('mayHoldChildren', () => {
	it('permits two containers and no more', () => {
		// Exported so the layout editor offers a destination exactly where the
		// parser would accept one. The comparison lives once.
		expect(mayHoldChildren(0)).toBe(true);
		expect(mayHoldChildren(1)).toBe(true);
		expect(mayHoldChildren(2)).toBe(false);
	});
});
