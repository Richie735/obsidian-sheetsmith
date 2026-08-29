import { describe, expect, it } from 'vitest';
import { makeFieldResolver, NO_ENV } from './resolve';
import { evaluate } from './expression';
import { parseFunctions } from './functions';
import {
	buildModifierTable,
	Contributor,
	MODIFIER_NAMESPACE,
	modifierSlot,
	SELF_SLOT,
	stackModifiers,
	suppressionOf,
} from './modifiers';
import {
	buildSheetEnv,
	buildSheetScope,
	PublishedComponent,
	sheetModifierInput,
} from './sheet';
import {
	ComponentConfig,
	ModifierDefinition,
	ModifierDefinitionView,
	ModifierLine,
	ModifierPush,
} from '../types';

/** One contribution at a target, with the fields a case is not about left alone. */
function at(
	target: string,
	amount: number,
	type: string | null = null,
	label = 'A row',
	operator: 'add' | 'override' = 'add',
	source = 'Magic items',
): Contributor {
	// The row's own name, which is what a contributor's is where a row applies one
	// modifier — the case every stacking test here is about.
	return { target, amount, type, label, operator, source, definition: label };
}

/**
 * The same contribution with no modifier name, which is what a *typed* part
 * produces.
 *
 * A push carries no tier and neither does the arithmetic, so the only trace of
 * one in this layer is a missing name — which is why the stacking cases below
 * mix the two and get the same answers.
 */
function typedAt(...args: Parameters<typeof at>): Contributor {
	const { definition, ...rest } = at(...args);
	void definition;
	return rest;
}

/** A definition as the layout declares one, with a label for its target. */
function define(
	definition: ModifierDefinition,
): ModifierDefinitionView {
	return { ...definition, targetLabel: definition.target };
}

/**
 * One part of one row's cell, with the row's own names where a case needs them.
 *
 * The part's raw text, which is what a push carries: a definition's name or an
 * assignment, and nothing in the push says which.
 */
function enrol(
	part: string,
	label = 'A row',
	values: Record<string, string | number | boolean> = {},
	source = 'Magic items',
): ModifierPush {
	return { part, source, row: { label, values } };
}

/** A card publishing one name, computed by the formula it is given. */
function computed(id: string, formula: string): PublishedComponent {
	return {
		id,
		values: { self: { display: { field: 'derived', scope: {} } } },
		resolver: (env) => (field, _scope, published) => {
			if (field !== 'derived') return null;
			const resolve = makeFieldResolver(
				{ formulaFields: ['derived'] },
				{
					id,
					type: 'card',
					label: id,
					position: { col: 1, row: 1, width: 1, height: 1 },
					derived: formula,
				} as ComponentConfig,
				null,
				env,
			);
			return resolve(field, {}, published);
		},
	};
}

/** A component whose rows enrol in the given definitions, publishing nothing. */
function enrolling(
	id: string,
	pushes: readonly ModifierPush[],
): PublishedComponent {
	return { id, values: {}, modifiers: () => pushes };
}

/**
 * A sheet over the cards and enrolments given, with the definitions the layout
 * declares.
 *
 * The accepting set travels with them because `sheetModifierInput` is one object,
 * but nothing in this file's arithmetic reads it: **the override step is bounded
 * by the slot actually having been read**, in `resolve.ts`, not by this set. What
 * the set decides is whether a breakdown is offered at all, which is
 * `sheet.test.ts`'s.
 */
function sheet(
	components: readonly PublishedComponent[],
	definitions: readonly ModifierDefinition[] = [],
) {
	return buildSheetEnv(components, undefined, {
		definitions: definitions.map(define),
		// The three lists the *sheet's* own context needs and the slot table does
		// not: an environment answers `mod.<name>`, and what a form offers is
		// `sheetModifiers`' question.
		targets: components.map((one) => ({ name: one.id, label: one.id })),
		published: components.map((one) => ({ name: one.id, label: one.id })),
		bonusTypes: [],
		accepting: new Set(components.map((one) => one.id)),
	});
}

describe('the mod. namespace', () => {
	it('reserves one name, and it is the one a component id is migrated off', () => {
		// The constant lives here beside the namespace it protects, and
		// `parse/layout.ts` imports it, so there is one spelling rather than two.
		expect(MODIFIER_NAMESPACE).toBe('mod');
		expect(modifierSlot('armour_class')).toBe('mod.armour_class');
		expect(SELF_SLOT).toBe('mod.self');
	});

	it('resolves to 0 for a published name nothing pushes at', () => {
		// The aggregate's own empty-set rule: without it every target's formula
		// would break on every character who owns no magic items, which is every
		// character on the day they are made.
		const scope = buildSheetScope([
			{ id: 'armour_class', values: { self: { value: '16' } } },
		]);
		expect(scope('mod.armour_class')).toBe(0);
	});

	it('fails as an unknown name where the sheet publishes no such name', () => {
		// What stops the rule above swallowing a typo: a sheet publishing
		// `armour_class` must not read `mod.armor_class` as zero.
		const scope = buildSheetScope([
			{ id: 'armour_class', values: { self: { value: '16' } } },
		]);
		expect(scope('mod.armor_class')).toBeUndefined();
		expect(() => evaluate('mod.armor_class', scope)).toThrow(
			'Unknown name "mod.armor_class"',
		);
	});

	it('answers to no .value, which is what keeps the depth question closed', () => {
		// A `mod.` entry is not a `ScopeEntry`: the sheet publishes the namespace,
		// not a component, so there is no stored value behind a slot to reach.
		const scope = buildSheetScope([
			{ id: 'armour_class', values: { self: { value: '16' } } },
		]);
		expect(scope('mod.armour_class.value')).toBeUndefined();
	});

	it('does not collide with a layout\'s own mod() function', () => {
		// Every 5e layout writes `mod(score) = floor((score - 10) / 2)`. Bare
		// `mod` is never registered, so the two live side by side with no rule.
		const { library } = parseFunctions([
			'mod(score) = floor((score - 10) / 2)',
		]);
		const scope = buildSheetScope([
			{ id: 'abilities', values: { named: { STR: { value: '15' } } } },
		]);
		expect(evaluate('mod(abilities.STR)', scope, { library, base: scope })).toBe(2);
		expect(evaluate('mod.abilities.STR', scope, { library, base: scope })).toBe(0);
	});
});

describe('stackModifiers: the additive phase', () => {
	/*
	 * The arithmetic, one case per line (SPEC §5).
	 *
	 * "Highest within a type" is wrong for penalties, which is the half this
	 * table exists to pin: the largest positive amount *plus* the smallest
	 * negative one, per type, summed over the types, plus every untyped amount in
	 * full.
	 */
	const cases: [string, readonly Contributor[], number][] = [
		['two of one type give the larger', [at('x', 2, 'item'), at('x', 1, 'item')], 2],
		['two of different types add', [at('x', 2, 'item'), at('x', 1, 'status')], 3],
		['two untyped ones add', [at('x', 2), at('x', 1)], 3],
		[
			'a bonus and a penalty of one type give both',
			[at('x', 2, 'item'), at('x', -1, 'item')],
			1,
		],
		[
			'the worst penalty of a type applies, not the weakest',
			[at('x', -1, 'item'), at('x', -3, 'item')],
			-3,
		],
		['a zero contributes nothing', [at('x', 0, 'item'), at('x', 1, 'item')], 1],
		['nothing at all is nothing', [], 0],
	];

	it.each(cases)('%s', (_name, contributions, total) => {
		const result = stackModifiers(contributions);
		expect('error' in result ? null : result.total).toBe(total);
	});

	it('lists a suppressed bonus and says why', () => {
		// The line the whole breakdown exists for: a reader who bought two rings
		// and saw the number not move will otherwise conclude it is broken.
		const result = stackModifiers([
			at('x', 2, 'item', 'Belt'),
			at('x', 1, 'item', 'Gauntlets'),
		]);
		expect('error' in result ? [] : result.lines).toEqual([
			{
				label: 'Belt',
				source: 'Magic items',
				definition: 'Belt',
				operator: 'add',
				type: 'item',
				amount: 2,
				applies: 'value',
				suppressed: null,
			},
			{
				label: 'Gauntlets',
				source: 'Magic items',
				definition: 'Gauntlets',
				operator: 'add',
				type: 'item',
				amount: 1,
				applies: 'value',
				suppressed: 'a larger item bonus applies',
			},
		]);
	});

	it('says a tie is a tie rather than claiming something larger applies', () => {
		// Two +2 item bonuses: the first applies and the second does not, and
		// "a larger item bonus applies" would be a false sentence sending the
		// reader hunting for a number that is not there.
		const result = stackModifiers([
			at('x', 2, 'item', 'Belt'),
			at('x', 2, 'item', 'Gauntlets'),
		]);
		expect('error' in result ? null : result.total).toBe(2);
		expect('error' in result ? null : result.lines[1]?.suppressed).toBe(
			'another item bonus of the same size applies',
		);
	});

	it('lists no line for an addition of 0', () => {
		// A breakdown is about what changed the number.
		const result = stackModifiers([at('x', 0, 'item', 'Trinket')]);
		expect('error' in result ? null : result.lines).toEqual([]);
	});

	it('rounds the total through the shared helper', () => {
		// So the breakdown's total, the number on the card and a formula reading
		// the slot cannot disagree about 0.30000000000000004.
		const result = stackModifiers([at('x', 0.1), at('x', 0.2)]);
		expect('error' in result ? null : result.total).toBe(0.3);
	});
});

describe('stackModifiers: the override phase', () => {
	const override = (amount: number, label: string): Contributor =>
		at('x', amount, null, label, 'override');

	it('takes the highest override, and says why the other did not apply', () => {
		const result = stackModifiers([override(18, 'Plate'), override(13, 'Mage')]);
		expect('error' in result ? null : result.override).toBe(18);
		expect('error' in result ? [] : result.lines).toEqual([
			{
				label: 'Plate',
				source: 'Magic items',
				definition: 'Plate',
				operator: 'override',
				type: null,
				amount: 18,
				applies: 'value',
				suppressed: null,
			},
			{
				label: 'Mage',
				source: 'Magic items',
				definition: 'Mage',
				operator: 'override',
				type: null,
				amount: 13,
				applies: 'value',
				suppressed: 'a higher override applies',
			},
		]);
	});

	it('says a tie of two overrides is a tie', () => {
		// The second wording, and the only case it is true of: telling a reader a
		// *higher* one applies would send them looking for a number that is not
		// on the sheet.
		const result = stackModifiers([override(13, 'Mage'), override(13, 'Shield')]);
		expect('error' in result ? null : result.override).toBe(13);
		expect('error' in result ? null : result.lines[1]?.suppressed).toBe(
			'another override of the same value applies',
		);
	});

	it('keeps the additive total separate, so an override does not wipe it', () => {
		// The owner's case: "set my str 18" and "+1 while worn" is 19, not 18.
		const result = stackModifiers([
			override(18, 'Plate'),
			at('x', 1, 'item', 'Ring'),
		]);
		expect('error' in result ? null : result.override).toBe(18);
		expect('error' in result ? null : result.total).toBe(1);
	});

	it('treats an override to 0 as a value, where an addition of 0 is nothing', () => {
		// "Set to zero" is a real effect, so it is listed and it contests; an
		// addition of 0 changes nothing and appears in no breakdown.
		const zeroed = stackModifiers([override(0, 'Antimagic')]);
		expect('error' in zeroed ? null : zeroed.override).toBe(0);
		expect('error' in zeroed ? [] : zeroed.lines).toHaveLength(1);
		const added = stackModifiers([at('x', 0, 'item', 'Trinket')]);
		expect('error' in added ? null : added.override).toBeNull();
		expect('error' in added ? [] : added.lines).toEqual([]);
	});

	it('never carries a bonus type on an override line', () => {
		// Overrides are not contested by type, so a type on the line would invite
		// a reader of the arithmetic to think it mattered. The type is dropped
		// where the enrolment is resolved, and this is the line that shows it.
		const result = stackModifiers([
			{ ...override(18, 'Plate'), type: null },
			at('x', 1, 'item', 'Ring'),
		]);
		expect('error' in result ? null : result.lines[0]?.type).toBeNull();
	});

	it('is nothing where nothing overrides', () => {
		const result = stackModifiers([at('x', 2, 'item')]);
		expect('error' in result ? null : result.override).toBeNull();
	});
});

describe('the shuffle assertion, over both phases', () => {
	/*
	 * The assertion standing in for a priority field, and it now covers the
	 * override too. Max, min and `+` are all commutative and associative, and each
	 * phase reduces to one number, so the result cannot depend on the walk order —
	 * which is what keeps the single pass and what makes "no priority field" a
	 * checkable property rather than a hand-wave.
	 *
	 * Every rotation rather than one shuffle, so a case cannot pass by luck.
	 */
	const cases: [string, readonly Contributor[], number | null, number][] = [
		['two of one type give the larger', [at('x', 2, 'item'), at('x', 1, 'item')], null, 2],
		['two types add', [at('x', 2, 'item'), at('x', 1, 'status')], null, 3],
		['two untyped add', [at('x', 2), at('x', 1)], null, 3],
		[
			'a bonus and a penalty of one type give both',
			[at('x', 2, 'item'), at('x', -1, 'item')],
			null,
			1,
		],
		[
			'an override and an addition',
			[at('x', 18, null, 'Plate', 'override'), at('x', 1, 'item', 'Ring')],
			18,
			1,
		],
		[
			'two overrides and two additions',
			[
				at('x', 13, null, 'Mage', 'override'),
				at('x', 1, 'item', 'Ring'),
				at('x', 18, null, 'Plate', 'override'),
				at('x', 2, 'item', 'Bracers'),
			],
			18,
			2,
		],
		[
			'an override to zero against a higher one',
			[
				at('x', 0, null, 'Antimagic', 'override'),
				at('x', 5, null, 'Plate', 'override'),
			],
			5,
			0,
		],
		/*
		 * **And the same three cases over the second tier**, because a tier that
		 * ordered differently would be a second arithmetic. A push carries no tier, so
		 * what these vary is only whether a contribution has a modifier name.
		 */
		[
			'a typed override and a typed addition',
			[
				typedAt('x', 18, null, 'Barkskin', 'override'),
				typedAt('x', 1, 'item', 'Bracers'),
			],
			18,
			1,
		],
		[
			'one of each tier, overriding',
			[
				at('x', 13, null, 'Mage', 'override'),
				typedAt('x', 18, null, 'Barkskin', 'override'),
			],
			18,
			0,
		],
		[
			'one of each tier, adding at one type',
			[at('x', 1, 'item', 'Ring'), typedAt('x', 2, 'item', 'Bracers')],
			null,
			2,
		],
	];

	it.each(cases)('%s', (_name, contributions, override, total) => {
		for (let from = 0; from < Math.max(1, contributions.length); from++) {
			const rotated = [
				...contributions.slice(from),
				...contributions.slice(0, from),
			];
			const result = stackModifiers(rotated);
			expect('error' in result ? null : result.override).toBe(override);
			expect('error' in result ? null : result.total).toBe(total);
		}
	});

	it.each([
		['named', at('str', 18, null, 'Belt', 'override'), at('str', 1, 'item', 'Ring')],
		[
			'typed',
			typedAt('str', 18, null, 'Belt', 'override'),
			typedAt('str', 1, 'item', 'Ring'),
		],
		[
			'one of each',
			at('str', 18, null, 'Belt', 'override'),
			typedAt('str', 1, 'item', 'Ring'),
		],
	])(
		'gives the owner\'s case 19 for a %s pair, either way round',
		(_tier, override, addition) => {
			// "set my str 18 and another item gives +1 while worn, my bonus should be
			// 19", and the answer is the same whichever tier either half came out of.
			for (const order of [
				[override, addition],
				[addition, override],
			]) {
				const result = stackModifiers(order);
				expect('error' in result ? null : result.override).toBe(18);
				expect('error' in result ? null : result.total).toBe(1);
			}
		},
	);

	it('gives the owner\'s case the same answer with the two reversed', () => {
		// Stated as its own case because it is the sentence the feature was asked
		// for: "set my str 18 and another item gives +1 while worn, my bonus should
		// be 19."
		const forwards = stackModifiers([
			at('str', 18, null, 'Belt of setting', 'override'),
			at('str', 1, 'item', 'Ring'),
		]);
		const backwards = stackModifiers([
			at('str', 1, 'item', 'Ring'),
			at('str', 18, null, 'Belt of setting', 'override'),
		]);
		for (const result of [forwards, backwards]) {
			expect('error' in result ? null : result.override).toBe(18);
			expect('error' in result ? null : result.total).toBe(1);
		}
	});
});

describe('suppressionOf', () => {
	it('reports a strictly higher override and nothing for the winner', () => {
		const result = stackModifiers([
			at('x', 18, null, 'Plate', 'override'),
			at('x', 13, null, 'Mage', 'override'),
		]);
		expect(
			suppressionOf(result, { operator: 'override', type: null, amount: 13 }),
		).toBe('a higher override applies');
		expect(
			suppressionOf(result, { operator: 'override', type: null, amount: 18 }),
		).toBeNull();
	});

	it('reads a tie as applying on both rows, where the breakdown names one', () => {
		/*
		 * The decision, stated as a case rather than left to be discovered. Two
		 * rows enrolling at the same amount are symmetric — deleting either changes
		 * nothing — so both say they are changing the value, while the breakdown
		 * still attributes the number to exactly one of them for the sum to work.
		 * Doing better would mean an index leaving the component (SPEC §4.2).
		 */
		const result = stackModifiers([
			at('x', 1, 'item', 'Ring'),
			at('x', 1, 'item', 'Other ring'),
		]);
		expect('error' in result ? null : result.lines[1]?.suppressed).toBe(
			'another item bonus of the same size applies',
		);
		expect(suppressionOf(result, { operator: 'add', type: 'item', amount: 1 })).toBeNull();
	});

	it('reports a larger bonus of the same type', () => {
		const result = stackModifiers([
			at('x', 2, 'item', 'Belt'),
			at('x', 1, 'item', 'Gauntlets'),
		]);
		expect(suppressionOf(result, { operator: 'add', type: 'item', amount: 1 })).toBe(
			'a larger item bonus applies',
		);
	});

	it('lets an untyped addition through, and says an addition of 0 adds nothing', () => {
		const result = stackModifiers([at('x', 2), at('x', 1)]);
		expect(suppressionOf(result, { operator: 'add', type: null, amount: 1 })).toBeNull();
		expect(suppressionOf(result, { operator: 'add', type: null, amount: 0 })).toBe(
			'it adds nothing',
		);
	});

	it('reports the slot\'s own refusal where another row stopped it', () => {
		expect(
			suppressionOf({ error: 'Row "Belt": no.' }, {
				operator: 'add',
				type: 'item',
				amount: 2,
			}),
		).toBe('Row "Belt": no.');
	});
});

describe('buildModifierTable', () => {
	const definitions: ModifierDefinition[] = [
		{ name: 'Belt', target: 'abilities.STR', amount: '2', bonusType: 'item' },
		{ name: 'Ring', target: 'armour_class', amount: '1', bonusType: 'item' },
		{ name: 'Blank', target: '   ', amount: '5' },
	];

	it('groups enrolments by the target their definition names', () => {
		const table = buildModifierTable(
			[
				{
					id: 'items',
					pushes: () => [
						enrol('Belt', 'Belt of Giant Strength'),
						enrol('   ', 'A blank cell'),
						enrol('Ring', 'Ring of Protection'),
						enrol('Blank', 'A definition with no target'),
					],
				},
			],
			definitions.map(define),
		);
		const strength = table('abilities.STR');
		expect('error' in strength ? null : strength.total).toBe(2);
		const armour = table('armour_class');
		expect('error' in armour ? null : armour.total).toBe(1);
	});

	it('contributes nothing for a definition the layout does not declare', () => {
		// §4.2's "rendered, not corrected": a stray reference is said at the row,
		// which is where the reader is looking, and it is not an error anywhere.
		const table = buildModifierTable(
			[{ id: 'items', pushes: () => [enrol('Ring of Nonexistence')] }],
			definitions.map(define),
		);
		expect(table('armour_class')).toEqual({
			override: null,
			total: 0,
			resultTotal: 0,
			lines: [],
		});
	});

	it('is empty for a component that declares no enrolments at all', () => {
		const table = buildModifierTable([{ id: 'speed' }], []);
		expect(table('speed')).toEqual({
			override: null,
			total: 0,
			resultTotal: 0,
			lines: [],
		});
	});

	it('resolves one definition against each row that enrolled in it', () => {
		// The amount is evaluated in the enrolling row's scope, so two rows in one
		// definition get two different amounts — which is what makes a definition
		// shared rather than copied.
		const table = buildModifierTable(
			[
				{
					id: 'items',
					pushes: () => [
						enrol('Charge', 'Wand', { Charges: 3 }),
						enrol('Charge', 'Staff', { Charges: 5 }),
					],
				},
			],
			[define({ name: 'Charge', target: 'spell_bonus', amount: 'Charges' })],
		);
		const result = table('spell_bonus');
		expect('error' in result ? null : result.total).toBe(8);
		expect(
			'error' in result ? [] : result.lines.map((line) => [line.label, line.amount]),
		).toEqual([
			['Wand', 3],
			['Staff', 5],
		]);
	});
});

describe('a part typed on the row', () => {
	/*
	 * The second tier through the same walk (feature doc §1, §6). **Nothing here
	 * differs by tier once the part is read**: the amount is evaluated in the same
	 * scope, the condition is the same mechanism, and a typed override contests on
	 * exactly the same terms as a named one.
	 */
	const definitions: ModifierDefinition[] = [
		{ name: 'Ring', target: 'armour_class', amount: '1', bonusType: 'item' },
		{
			name: 'Plate',
			target: 'armour_class',
			operator: 'override',
			amount: '18',
		},
	];

	const walked = (...parts: readonly string[]) =>
		buildModifierTable(
			[{ id: 'items', pushes: () => parts.map((part) => enrol(part)) }],
			definitions.map(define),
		);

	it('reaches the same number as an identical definition, by the same path', () => {
		/*
		 * The arithmetic is identical and **only the name differs**, which is exactly
		 * §7's edge showing up in the numbers: a named part carries the layout's
		 * spelling and a typed part has none, and nothing else about either line is
		 * different.
		 */
		const typed = walked('armour_class += 1 as item')('armour_class');
		const named = walked('Ring')('armour_class');
		if ('error' in typed || 'error' in named) throw new Error('refused');
		expect(typed.override).toBe(named.override);
		expect(typed.total).toBe(named.total);
		/** Every member of a line but the modifier's name, which is the one that differs. */
		const rest = (line: ModifierLine) => [
			line.label,
			line.source,
			line.operator,
			line.type,
			line.amount,
			line.suppressed,
		];
		expect(typed.lines.map(rest)).toEqual(named.lines.map(rest));
		expect(typed.lines[0]?.definition).toBeUndefined();
		expect(named.lines[0]?.definition).toBe('Ring');
	});

	it('carries no definition name, so the line falls back to the row', () => {
		const table = walked('armour_class += 1 as item');
		const result = table('armour_class');
		if ('error' in result) throw new Error(result.error);
		expect(result.lines).toHaveLength(1);
		expect(result.lines[0]?.definition).toBeUndefined();
		expect(result.lines[0]?.label).toBe('A row');
	});

	it('contests a typed override with a named one on equal terms', () => {
		// Both directions, because a tier that stacked differently would be a second
		// arithmetic — and the loser says so in the same words whichever tier it is.
		const namedWins = walked('Plate', 'armour_class = 16');
		const first = namedWins('armour_class');
		if ('error' in first) throw new Error(first.error);
		expect(first.override).toBe(18);
		expect(first.lines[1]?.suppressed).toBe('a higher override applies');

		const typedWins = walked('Plate', 'armour_class = 20');
		const second = typedWins('armour_class');
		if ('error' in second) throw new Error(second.error);
		expect(second.override).toBe(20);
		expect(second.lines[0]?.suppressed).toBe('a higher override applies');
	});

	it('gives two identical typed parts two contributions', () => {
		// Deliberately not collapsed, where two identical *names* are one enrolment:
		// they are not references to one thing, so the stacking rule gets two lines
		// and says something true about the second.
		const table = walked(
			'armour_class += 1 as item',
			'armour_class += 1 as item',
		);
		const result = table('armour_class');
		if ('error' in result) throw new Error(result.error);
		expect(result.lines).toHaveLength(2);
		expect(result.lines[1]?.suppressed).toBe(
			'another item bonus of the same size applies',
		);
		expect(result.total).toBe(1);
	});

	it('changes nothing and refuses nothing with no amount yet', () => {
		/*
		 * **The criterion that makes the form safe to commit per field.** The slot
		 * still publishes, every other contributor still lands, and the unfinished
		 * effect appears in no breakdown — a departure from the named tier, where a
		 * definition with no amount is a layout problem the author owns.
		 */
		const table = walked('Ring', 'armour_class +=');
		const result = table('armour_class');
		if ('error' in result) throw new Error(result.error);
		expect(result.total).toBe(1);
		expect(result.lines).toHaveLength(1);
	});

	it('refuses the slot where a typed amount will not resolve, naming the row', () => {
		// The one case where a typo in a cell reaches a number elsewhere, and it is
		// the same rule a definition's bad amount already earns.
		const table = walked('armour_class += ability');
		const result = table('armour_class');
		expect('error' in result ? result.error : null).toContain('Row "A row"');
	});

	it('reads a typed amount against the row that typed it', () => {
		const table = buildModifierTable(
			[
				{
					id: 'items',
					pushes: () => [
						enrol('armour_class += Qty * 2', 'Two', { Qty: 2 }),
						enrol('armour_class += Qty * 2', 'Three', { Qty: 3 }),
					],
				},
			],
			[],
		);
		const result = table('armour_class');
		if ('error' in result) throw new Error(result.error);
		expect(result.lines.map((line) => line.amount)).toEqual([4, 6]);
		expect(result.total).toBe(10);
	});

	it('reads a typed condition off the row, in the same words a definition does', () => {
		const table = buildModifierTable(
			[
				{
					id: 'items',
					pushes: () => [
						enrol('armour_class += 2 when Worn', 'Worn', { Worn: true }),
						enrol('armour_class += 2 when Worn', 'Stowed', { Worn: false }),
					],
				},
			],
			[],
		);
		const result = table('armour_class');
		if ('error' in result) throw new Error(result.error);
		// The inactive row appears in no breakdown at all: a breakdown is about what
		// changed the number, and the row is where "not right now" is said.
		expect(result.lines.map((line) => line.label)).toEqual(['Worn']);
		expect(result.total).toBe(2);
	});

	it('contests an undeclared bonus type as its own kind', () => {
		/*
		 * §10's new rule, and the amendment to SPEC §5's "nothing stored ever names a
		 * type": the arithmetic contests by the *string* a part carries, so a type
		 * the layout dropped still stacks against itself and against nothing else.
		 */
		const table = walked(
			'armour_class += 1 as luck',
			'armour_class += 2 as luck',
			'armour_class += 1 as item',
		);
		const result = table('armour_class');
		if ('error' in result) throw new Error(result.error);
		// The two `luck` effects contest with each other; the item bonus adds.
		expect(result.total).toBe(3);
		expect(result.lines.map((line) => line.suppressed)).toEqual([
			'a larger luck bonus applies',
			null,
			null,
		]);
	});
});

describe('a definition\'s condition', () => {
	const conditional = [
		define({
			name: 'Cloak',
			target: 'armour_class',
			amount: '1',
			bonusType: 'item',
			when: 'Worn',
		}),
	];

	it('applies where the row\'s flag is set, and changes nothing where it is not', () => {
		const table = buildModifierTable(
			[
				{
					id: 'items',
					pushes: () => [
						enrol('Cloak', 'Cloak of Elvenkind', { Worn: true }),
						enrol('Cloak', 'A stowed cloak', { Worn: false }),
					],
				},
			],
			conditional,
		);
		const result = table('armour_class');
		expect('error' in result ? null : result.total).toBe(1);
		// And the inactive row appears in no breakdown at all: a breakdown is about
		// what changed the number, and listing every stowed item in every popover
		// would put the inventory in there.
		expect('error' in result ? [] : result.lines.map((line) => line.label)).toEqual(
			['Cloak of Elvenkind'],
		);
	});

	it('applies unconditionally where the definition carries no condition', () => {
		const table = buildModifierTable(
			[{ id: 'items', pushes: () => [enrol('Ring')] }],
			[define({ name: 'Ring', target: 'armour_class', amount: '1' })],
		);
		const result = table('armour_class');
		expect('error' in result ? null : result.total).toBe(1);
	});

	it('never lets an inactive row\'s unreadable amount refuse the slot', () => {
		/*
		 * The ordering that makes the condition safe: a stowed item whose amount
		 * reads a column the author has since renamed must not be able to break a
		 * number it is not touching. So the condition is evaluated first, and an
		 * inactive row's amount is read tolerantly for the popover's sake only.
		 */
		const table = buildModifierTable(
			[
				{
					id: 'items',
					pushes: () => [
						enrol('Broken', 'A stowed cloak', { Worn: false }),
						enrol('Ring', 'Ring of Protection'),
					],
				},
			],
			[
				define({
					name: 'Broken',
					target: 'armour_class',
					amount: 'Charges',
					when: 'Worn',
				}),
				define({ name: 'Ring', target: 'armour_class', amount: '1' }),
			],
		);
		const result = table('armour_class');
		expect('error' in result ? result.error : null).toBeNull();
		expect('error' in result ? null : result.total).toBe(1);
	});
});

describe('a slot the sheet publishes', () => {
	it('adds what was pushed to the target\'s own derived', () => {
		const env = sheet(
			[
				computed('armour_class', '10 + mod.self'),
				enrolling('items', [enrol('Ring', 'Ring of Protection')]),
			],
			[{ name: 'Ring', target: 'armour_class', amount: '2', bonusType: 'item' }],
		);
		expect(env.sheet('armour_class')).toBe(12);
		expect(env.sheet('mod.armour_class')).toBe(2);
	});

	it('adds the same total whichever tier the cell spelled it in', () => {
		/*
		 * **The two tiers arrive at the same number by the same path**, asserted as
		 * one case with the cell spelled both ways rather than as two cases that
		 * happen to agree. A slot is a reduction of a push set and a push carries no
		 * tier, so there is nothing between these two but the text in the cell.
		 */
		const named = sheet(
			[
				computed('armour_class', 'value + mod.self'),
				enrolling('items', [enrol('Ring', 'Ring of Protection')]),
			],
			[
				{
					name: 'Ring',
					target: 'armour_class',
					amount: '2',
					bonusType: 'item',
				},
			],
		);
		const typed = sheet([
			computed('armour_class', 'value + mod.self'),
			enrolling('items', [
				enrol('armour_class += 2 as item', 'Ring of Protection'),
			]),
		]);
		expect(typed.sheet('mod.armour_class')).toBe(
			named.sheet('mod.armour_class'),
		);
		expect(typed.sheet('armour_class')).toBe(named.sheet('armour_class'));
		expect(typed.sheet('mod.armour_class')).toBe(2);
	});

	it('publishes nothing where one row\'s amount will not resolve', () => {
		/*
		 * The slot throws rather than answering undefined, which is the only route
		 * to the sentence: a thrown FormulaError reaches the explainer and lands
		 * under the reader's eye naming the row that stopped it.
		 */
		const env = sheet(
			[
				computed('armour_class', '10 + mod.self'),
				enrolling('items', [enrol('Belt', 'Belt of Giant Strength')]),
			],
			[{ name: 'Belt', target: 'armour_class', amount: 'ability' }],
		);
		expect(() => env.sheet('mod.armour_class')).toThrow(
			'Row "Belt of Giant Strength": unknown name "ability"',
		);
		// And the card reading it publishes nothing rather than 10.
		expect(env.sheet('armour_class')).toBeUndefined();
	});

	it('refuses a non-numeric amount, naming the row and the definition', () => {
		const env = sheet(
			[
				computed('armour_class', '10 + mod.self'),
				enrolling('items', [enrol('Worn?', 'A shield', { Worn: true })]),
			],
			[{ name: 'Worn?', target: 'armour_class', amount: 'Worn' }],
		);
		expect(() => env.sheet('mod.armour_class')).toThrow(
			'Row "A shield": "true" is not a number, so the modifier "Worn?" has no amount.',
		);
	});

	it('caches only what resolved, so nothing holds a refusal', () => {
		let broken = true;
		const env = sheet(
			[
				computed('armour_class', '10 + mod.self'),
				{
					id: 'items',
					values: {},
					modifiers: () => [
						enrol('Ring', 'Ring', broken ? {} : { Charges: 2 }),
					],
				},
			],
			[{ name: 'Ring', target: 'armour_class', amount: 'Charges' }],
		);
		expect(() => env.sheet('mod.armour_class')).toThrow();
		broken = false;
		expect(env.sheet('mod.armour_class')).toBe(2);
	});

	it('closes a ring through a slot loudly, naming the row', () => {
		/*
		 * A definition whose amount reads the target it changes. The name table's
		 * own `active` guard closes it: the slot's walk fails, the amount is
		 * unreadable, the slot throws with the row named, and the card shows
		 * nothing rather than a silent number. This is the case that makes this
		 * shape safer than an application pass — Foundry's dnd5e#3900 is silent.
		 */
		const env = sheet(
			[
				computed('armour_class', '10 + mod.self'),
				enrolling('items', [enrol('Ouroboros', 'Ouroboros')]),
			],
			[{ name: 'Ouroboros', target: 'armour_class', amount: 'armour_class' }],
		);
		expect(() => env.sheet('mod.armour_class')).toThrow('Row "Ouroboros"');
		expect(env.sheet('armour_class')).toBeUndefined();
	});
});

describe('the override where it lands', () => {
	it('replaces the formula\'s result and re-adds the additive total', () => {
		// The owner's arithmetic, through the whole engine rather than through
		// `stackModifiers` alone: 10 + 0 would be the formula, 18 is the override,
		// +1 lands on top.
		const env = sheet(
			[
				computed('armour_class', '10 + mod.self'),
				enrolling('items', [enrol('Plate', 'Plate armour'), enrol('Ring', 'Ring')]),
			],
			[
				{ name: 'Plate', target: 'armour_class', operator: 'override', amount: '18' },
				{ name: 'Ring', target: 'armour_class', amount: '1', bonusType: 'item' },
			],
		);
		expect(env.sheet('armour_class')).toBe(19);
		// And the slot itself still resolves to the additive total, so
		// `value + mod.self` written anywhere else is unchanged.
		expect(env.sheet('mod.armour_class')).toBe(1);
	});

	it('gives the same answer with the two enrolments reversed', () => {
		const reversed = sheet(
			[
				computed('armour_class', '10 + mod.self'),
				enrolling('items', [enrol('Ring', 'Ring'), enrol('Plate', 'Plate armour')]),
			],
			[
				{ name: 'Plate', target: 'armour_class', operator: 'override', amount: '18' },
				{ name: 'Ring', target: 'armour_class', amount: '1', bonusType: 'item' },
			],
		);
		expect(reversed.sheet('armour_class')).toBe(19);
	});

	it('applies to a Card set entry, and leaves the other entries alone', () => {
		// The case `mod.self` exists for, read through the override: one formula
		// runs per entry and no absolute name inside it could say which.
		const env = sheet(
			[
				{
					id: 'abilities',
					values: {
						named: {
							STR: { value: '15', display: { field: 'derived', scope: { value: '15' } } },
							DEX: { value: '14', display: { field: 'derived', scope: { value: '14' } } },
						},
					},
					resolver: (inner) => (field, scope, publishedName) =>
						makeFieldResolver(
							{ formulaFields: ['derived'] },
							{
								id: 'abilities',
								type: 'card-set',
								label: 'Abilities',
								position: { col: 1, row: 1, width: 1, height: 1 },
								derived: 'value + mod.self',
							} as ComponentConfig,
							null,
							inner,
						)(field, scope, publishedName),
				},
				enrolling('items', [enrol('Belt', 'Belt of Giant Strength')]),
			],
			[
				{
					name: 'Belt',
					target: 'abilities.DEX',
					operator: 'override',
					amount: '18',
				},
			],
		);
		expect(env.sheet('abilities.DEX')).toBe(18);
		expect(env.sheet('abilities.STR')).toBe(15);
	});

	it('applies only where the formula read its own slot', () => {
		/*
		 * The bound that keeps the override step from being the warming SPEC §13
		 * forbids, asserted rather than assumed. The definition targets a card
		 * whose own formula reads no modifier, so the slot is never asked for and
		 * nothing is overridden — which is SPEC §5's own rule that an override
		 * reaches a target on exactly the same condition an addition does.
		 */
		const env = sheet(
			[
				computed('passive_perception', '10'),
				enrolling('items', [enrol('Cloak', 'Cloak of Displacement')]),
			],
			[
				{
					name: 'Cloak',
					target: 'passive_perception',
					operator: 'override',
					amount: '18',
				},
			],
		);
		expect(env.sheet('passive_perception')).toBe(10);
	});

	it('takes no override on a branch that did not read the slot', () => {
		/*
		 * The half a static text scan over the formula would get wrong, and the
		 * reason the bound is the slot's own read rather than the accepting set:
		 * the language's `if` is lazy, so a stowed item's `if(worn, value +
		 * mod.self, value)` reads no slot, takes no *addition*, and must take no
		 * override either. The two arms of one formula have to agree about what
		 * "reads a modifier" means.
		 */
		const env = sheet(
			[
				computed('armour_class', 'if(worn, 10 + mod.self, 10)'),
				{ id: 'worn', values: { self: { value: false } } },
				enrolling('items', [enrol('Plate', 'Plate armour')]),
			],
			[
				{ name: 'Plate', target: 'armour_class', operator: 'override', amount: '18' },
			],
		);
		expect(env.sheet('armour_class')).toBe(10);
	});

	it('draws the card and publishes the name from one number', () => {
		/*
		 * The rule that decided where the override step lives: a Card draws through
		 * `context.resolveField('derived', …, config.id)` and the sheet publishes
		 * through the name table's own `display` path, and both go through
		 * `fieldReaders`. Applied in the name table alone, the card's face and every
		 * formula reading it would disagree — 14 against 20 on the vault fixture.
		 */
		const env = sheet(
			[
				computed('armour_class', '10 + mod.self'),
				enrolling('items', [enrol('Plate', 'Plate armour'), enrol('Ring', 'Ring')]),
			],
			[
				{ name: 'Plate', target: 'armour_class', operator: 'override', amount: '18' },
				{ name: 'Ring', target: 'armour_class', amount: '1', bonusType: 'item' },
			],
		);
		const drawn = makeFieldResolver(
			{ formulaFields: ['derived'] },
			{
				id: 'armour_class',
				type: 'card',
				label: 'AC',
				position: { col: 1, row: 1, width: 1, height: 1 },
				derived: '10 + mod.self',
			} as ComponentConfig,
			null,
			env,
		)('derived', {}, 'armour_class');
		expect(drawn).toBe(19);
		expect(env.sheet('armour_class')).toBe(19);
	});

	it('does not rescue a formula that will not resolve', () => {
		// SPEC §5's standing rule: a name whose source will not resolve publishes
		// nothing rather than a number nobody can account for. The cost is that a
		// card showing "?" cannot be forced to a value by setting it.
		const env = sheet(
			[
				computed('armour_class', 'ability + mod.self'),
				enrolling('items', [enrol('Plate', 'Plate armour')]),
			],
			[
				{ name: 'Plate', target: 'armour_class', operator: 'override', amount: '18' },
			],
		);
		expect(env.sheet('armour_class')).toBeUndefined();
	});

	it('leaves the stored value untouched, which is Constraint 4', () => {
		// A card whose derived is overridden to 18 still answers `<name>.value`
		// with the number the reader typed, and that is what makes the breakdown
		// necessary rather than decorative.
		const env = sheet(
			[
				{
					id: 'armour_class',
					values: {
						self: { value: '15', display: { field: 'derived', scope: { value: '15' } } },
					},
					resolver: (inner) => (field, scope, publishedName) =>
						makeFieldResolver(
							{ formulaFields: ['derived'] },
							{
								id: 'armour_class',
								type: 'card',
								label: 'AC',
								position: { col: 1, row: 1, width: 1, height: 1 },
								derived: 'value + mod.self',
							} as ComponentConfig,
							null,
							inner,
						)(field, scope, publishedName),
				},
				enrolling('items', [enrol('Plate', 'Plate armour')]),
			],
			[
				{ name: 'Plate', target: 'armour_class', operator: 'override', amount: '18' },
			],
		);
		expect(env.sheet('armour_class')).toBe(18);
		expect(env.sheet('armour_class.value')).toBe(15);
	});
});

describe('mod.self', () => {
	const config = (formula: string): ComponentConfig =>
		({
			id: 'armour_class',
			type: 'card',
			label: 'AC',
			position: { col: 1, row: 1, width: 1, height: 1 },
			derived: formula,
		}) as ComponentConfig;

	it('is 0 where the evaluation publishes no name', () => {
		/*
		 * A Table's computed column runs on declared rows carrying a key and on
		 * rows carrying none, from one formula; a row with no key cannot be pushed
		 * at, so its slot is empty, so it is zero — and a column reading
		 * `mod.self` shows numbers down every row rather than "?" on half of them.
		 */
		const resolve = makeFieldResolver(
			{ formulaFields: ['derived'] },
			config('10 + mod.self'),
			null,
			NO_ENV,
		);
		expect(resolve('derived', {})).toBe(10);
	});

	it('reads the slot of the name it is told it produces', () => {
		const env = sheet(
			[
				computed('armour_class', '10 + mod.self'),
				enrolling('items', [enrol('Ring', 'Ring')]),
			],
			[{ name: 'Ring', target: 'armour_class', amount: '3', bonusType: 'item' }],
		);
		const resolve = makeFieldResolver(
			{ formulaFields: ['derived'] },
			config('10 + mod.self'),
			null,
			env,
		);
		expect(resolve('derived', {}, 'armour_class')).toBe(13);
		// And 0 without it, which is the risk the contract records rather than
		// a failure it reports.
		expect(resolve('derived', {})).toBe(10);
	});
});

describe('the third guard, and what it refuses', () => {
	/*
	 * A definition's amount that reads a slot. The walk cannot answer from inside
	 * itself, so it refuses — and what it refuses is wider than a cycle, which is
	 * why the message says only what it has established.
	 */
	const reading = (expression: string) =>
		sheet(
			[
				computed('armour_class', '10 + mod.self'),
				computed('speed', '30 + mod.self'),
				enrolling('boots', [enrol('Boots', 'Boots')]),
				enrolling('items', [enrol('Ring', 'Ring')]),
			],
			[
				{ name: 'Boots', target: 'speed', amount: '10' },
				{ name: 'Ring', target: 'armour_class', amount: expression },
			],
		);

	it('refuses an amount that reads another target\'s slot, asked cold', () => {
		// No ring anywhere: `speed`'s own enrolment is a plain number. The walk
		// still cannot answer `mod.speed` from inside itself.
		expect(() => reading('mod.speed').sheet('mod.armour_class')).toThrow(
			'Row "Ring"',
		);
	});

	it('claims only what it has established about why', () => {
		/*
		 * The message used to assert "one of them is waiting on the total it is
		 * part of", which is false for the case above — the amount read a
		 * *different* target — and would send a reader hunting for a
		 * self-reference that is not there.
		 */
		let said = '';
		try {
			reading('mod.speed').sheet('mod.armour_class');
		} catch (error) {
			said = error instanceof Error ? error.message : String(error);
		}
		expect(said).toContain('still being worked out');
		expect(said).not.toContain('the total it is part of');
		// And it names the slot that was asked for, which is the one thing a
		// reader can act on.
		expect(said).toContain('"mod.speed"');
	});
});

describe('sheetModifierInput', () => {
	it('is the one assembly of the definitions and the accepting set', () => {
		// Two hosts build this — the sheet view and the harness — and deriving the
		// accepting set twice is the drift the shipped feature had to fix.
		const input = sheetModifierInput(
			[define({ name: 'Ring', target: 'armour_class', amount: '1' })],
			[
				{
					id: 'armour_class',
					values: { self: {} },
					formulas: ['10 + mod.self'],
				},
				{ id: 'passive_perception', values: { self: {} }, formulas: ['10'] },
			],
		);
		expect(input.definitions.map((d) => d.name)).toEqual(['Ring']);
		expect([...input.accepting]).toEqual(['armour_class']);
	});
});

/*
 * **The two phases**, which is the whole of what a modifier's `applies` buys.
 *
 * One published name has one slot, and its formula decides where the slot's
 * total goes — which is right for the layout and wrong for the character: on one
 * ability card a belt raises the *score* and a blessing adds to the *check*, and
 * `floor((value + mod.self - 10) / 2)` cannot be both. So the slot carries two
 * totals and each modifier says which it joins.
 */
describe('stackModifiers: the two phases', () => {
	/** `at`, with the phase the case is about. */
	const phased = (
		amount: number,
		applies: 'value' | 'result',
		type: string | null = null,
		label = 'A row',
	): Contributor => ({ ...at('x', amount, type, label), applies });

	it('keeps the two totals apart', () => {
		const result = stackModifiers([
			phased(2, 'value', 'item', 'Belt'),
			phased(1, 'result', 'item', 'Blessing'),
		]);
		if ('error' in result) throw new Error('expected a result');
		// The belt raises the number behind the formula; the blessing lands on what
		// the formula came to. Summed together they would be one number landing in
		// one place, which is the shape this feature exists to break.
		expect(result.total).toBe(2);
		expect(result.resultTotal).toBe(1);
	});

	it('reads a modifier that says nothing as the value phase', () => {
		// Every modifier written before phases existed says nothing, and all of them
		// must go on meaning what `mod.self` has always meant.
		const result = stackModifiers([at('x', 2, 'item'), at('x', 3)]);
		if ('error' in result) throw new Error('expected a result');
		expect(result.total).toBe(5);
		expect(result.resultTotal).toBe(0);
	});

	it('contests a type within its phase and not across it', () => {
		/*
		 * The case that makes the phase key load-bearing rather than tidy. An item
		 * bonus to a score and an item bonus to a check are two quantities sharing a
		 * word. Contested together the smaller would be suppressed — and the
		 * breakdown would tell a reader "a larger item bonus applies" while pointing
		 * at a number that bonus never touched.
		 */
		const result = stackModifiers([
			phased(2, 'value', 'item', 'Belt'),
			phased(1, 'result', 'item', 'Bracers'),
		]);
		if ('error' in result) throw new Error('expected a result');
		expect(result.total).toBe(2);
		expect(result.resultTotal).toBe(1);
		expect(result.lines.map((one) => one.suppressed)).toEqual([null, null]);
	});

	it('still suppresses within one phase', () => {
		// The other half of the same rule: two item bonuses landing in the same
		// place contest exactly as they always did.
		const result = stackModifiers([
			phased(2, 'result', 'item', 'Belt'),
			phased(1, 'result', 'item', 'Gauntlets'),
		]);
		if ('error' in result) throw new Error('expected a result');
		expect(result.resultTotal).toBe(2);
		expect(result.lines.map((one) => one.suppressed)).toEqual([
			null,
			'a larger item bonus applies',
		]);
	});

	it('carries the phase onto every line, so a breakdown can say so', () => {
		const result = stackModifiers([
			phased(2, 'value', null, 'Belt'),
			phased(1, 'result', null, 'Blessing'),
		]);
		if ('error' in result) throw new Error('expected a result');
		expect(result.lines.map((one) => one.applies)).toEqual(['value', 'result']);
	});

	it('reports an override in the value phase, whatever it stored', () => {
		/*
		 * An override replaces the published number, which *is* the result phase —
		 * so it needs no second spelling, and a line saying one would be a second
		 * answer to a question "sets to 18" has already settled.
		 */
		const result = stackModifiers([
			{ ...at('x', 18, null, 'Plate', 'override'), applies: 'result' },
		]);
		if ('error' in result) throw new Error('expected a result');
		expect(result.override).toBe(18);
		expect(result.resultTotal).toBe(0);
		expect(result.lines[0]?.applies).toBe('value');
	});
});
