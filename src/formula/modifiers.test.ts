import { describe, expect, it } from 'vitest';
import { callsFrom, makeFieldResolver, NO_ENV } from './resolve';
import { evaluate } from './expression';
import { parseFunctions } from './functions';
import {
	buildModifierTable,
	MODIFIER_NAMESPACE,
	modifierSlot,
	SELF_SLOT,
	stackModifiers,
} from './modifiers';
import { buildSheetEnv, buildSheetScope, PublishedComponent } from './sheet';
import { ComponentConfig, ModifierPush } from '../types';

/** A push at one target, with the fields a case is not about left alone. */
function push(
	target: string,
	amount: number,
	type: string | null = null,
	label = 'A row',
	source = 'Magic items',
): ModifierPush {
	return { target, amount, type, label, source };
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
				{ id, type: 'card', label: id, position: { col: 1, row: 1, width: 1, height: 1 }, derived: formula } as ComponentConfig,
				null,
				env,
			);
			return resolve(field, {}, published);
		},
	};
}

/** A component that pushes the given list, and publishes nothing of its own. */
function pushing(
	id: string,
	pushes: readonly ModifierPush[],
): PublishedComponent {
	return {
		id,
		values: {},
		modifiers: () => pushes,
	};
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

describe('stackModifiers', () => {
	/*
	 * The arithmetic, one case per line (SPEC §5).
	 *
	 * "Highest within a type" is wrong for penalties, which is the half this
	 * table exists to pin: the largest positive amount *plus* the smallest
	 * negative one, per type, summed over the types, plus every untyped amount in
	 * full.
	 */
	const cases: [string, readonly ModifierPush[], number][] = [
		['two of one type give the larger', [push('x', 2, 'item'), push('x', 1, 'item')], 2],
		['two of different types add', [push('x', 2, 'item'), push('x', 1, 'status')], 3],
		['two untyped ones add', [push('x', 2), push('x', 1)], 3],
		[
			'a bonus and a penalty of one type give both',
			[push('x', 2, 'item'), push('x', -1, 'item')],
			1,
		],
		[
			'the worst penalty of a type applies, not the weakest',
			[push('x', -1, 'item'), push('x', -3, 'item')],
			-3,
		],
		['a zero contributes nothing', [push('x', 0, 'item'), push('x', 1, 'item')], 1],
		['nothing at all is nothing', [], 0],
	];

	it.each(cases)('%s', (_name, pushes, total) => {
		const result = stackModifiers(pushes);
		expect('error' in result ? null : result.total).toBe(total);
	});

	it.each(cases)('%s, whatever order the pushes arrive in', (_name, pushes, total) => {
		/*
		 * The assertion standing in for a priority field. Max, min and `+` are all
		 * commutative and associative, so the result cannot depend on the walk
		 * order — which is what keeps the single pass and what makes "v1 needs no
		 * priority" a checkable property rather than a hand-wave.
		 *
		 * Every rotation rather than one shuffle, so the case cannot pass by luck.
		 */
		for (let at = 0; at < pushes.length; at++) {
			const rotated = [...pushes.slice(at), ...pushes.slice(0, at)];
			const result = stackModifiers(rotated);
			expect('error' in result ? null : result.total).toBe(total);
		}
	});

	it('lists a suppressed bonus and says why', () => {
		// The line the whole breakdown exists for: a reader who bought two rings
		// and saw the number not move will otherwise conclude it is broken.
		const result = stackModifiers([
			push('x', 2, 'item', 'Belt'),
			push('x', 1, 'item', 'Gauntlets'),
		]);
		expect('error' in result ? [] : result.lines).toEqual([
			{
				label: 'Belt',
				source: 'Magic items',
				type: 'item',
				amount: 2,
				suppressed: null,
			},
			{
				label: 'Gauntlets',
				source: 'Magic items',
				type: 'item',
				amount: 1,
				suppressed: 'a larger item bonus applies',
			},
		]);
	});

	it('says a tie is a tie rather than claiming something larger applies', () => {
		// Two +2 item bonuses: the first applies and the second does not, and
		// "a larger item bonus applies" would be a false sentence sending the
		// reader hunting for a number that is not there.
		const result = stackModifiers([
			push('x', 2, 'item', 'Belt'),
			push('x', 2, 'item', 'Gauntlets'),
		]);
		expect('error' in result ? null : result.total).toBe(2);
		expect(
			'error' in result ? null : result.lines[1]?.suppressed,
		).toBe('another item bonus of the same size applies');
	});

	it('lists no line for an amount of 0', () => {
		// A breakdown is about what changed the number.
		const result = stackModifiers([push('x', 0, 'item', 'Trinket')]);
		expect('error' in result ? null : result.lines).toEqual([]);
	});

	it('refuses the whole slot for one unreadable amount, naming the row', () => {
		const result = stackModifiers([
			push('x', 2, 'item', 'Belt'),
			{
				target: 'x',
				type: 'item',
				label: 'Belt of Giant Strength',
				source: 'Magic items',
				unreadable: 'ability is not defined on this sheet.',
			},
		]);
		expect('error' in result ? result.error : null).toBe(
			'Row "Belt of Giant Strength": ability is not defined on this sheet.',
		);
	});

	it('rounds the total through the shared helper', () => {
		// So the breakdown's total, the number on the card and a formula reading
		// the slot cannot disagree about 0.30000000000000004.
		const result = stackModifiers([push('x', 0.1), push('x', 0.2)]);
		expect('error' in result ? null : result.total).toBe(0.3);
	});
});

describe('buildModifierTable', () => {
	it('groups pushes by target and leaves a blank target out', () => {
		const table = buildModifierTable([
			{
				id: 'items',
				pushes: () => [
					push('abilities.STR', 2, 'item', 'Belt'),
					push('   ', 5, 'item', 'A blank row'),
					push('armour_class', 1, 'item', 'Ring'),
				],
			},
		]);
		const strength = table('abilities.STR');
		expect('error' in strength ? null : strength.total).toBe(2);
		const armour = table('armour_class');
		expect('error' in armour ? null : armour.total).toBe(1);
	});

	it('is empty for a component that declares no pushes at all', () => {
		const table = buildModifierTable([{ id: 'speed' }]);
		expect(table('speed')).toEqual({ lines: [], total: 0 });
	});
});

describe('a slot the sheet publishes', () => {
	it('adds what was pushed to the target\'s own derived', () => {
		const env = buildSheetEnv([
			computed('armour_class', '10 + mod.self'),
			pushing('items', [push('armour_class', 2, 'item', 'Ring')]),
		]);
		expect(env.sheet('armour_class')).toBe(12);
		expect(env.sheet('mod.armour_class')).toBe(2);
	});

	it('publishes nothing where one row\'s amount will not resolve', () => {
		/*
		 * The slot throws rather than answering undefined, which is the only route
		 * to the sentence: a thrown FormulaError reaches the explainer and lands
		 * under the reader's eye naming the row that stopped it.
		 */
		const env = buildSheetEnv([
			computed('armour_class', '10 + mod.self'),
			{
				id: 'items',
				values: {},
				modifiers: () => [
					{
						target: 'armour_class',
						type: null,
						label: 'Belt of Giant Strength',
						source: 'Magic items',
						unreadable: 'ability is not defined on this sheet.',
					},
				],
			},
		]);
		expect(() => env.sheet('mod.armour_class')).toThrow(
			'Row "Belt of Giant Strength": ability is not defined on this sheet.',
		);
		// And the card reading it publishes nothing rather than 10.
		expect(env.sheet('armour_class')).toBeUndefined();
	});

	it('caches only what resolved, so nothing holds a refusal', () => {
		let refuse = true;
		const env = buildSheetEnv([
			computed('armour_class', '10 + mod.self'),
			{
				id: 'items',
				values: {},
				modifiers: () =>
					refuse
						? [
								{
									target: 'armour_class',
									type: null,
									label: 'Ring',
									source: 'Magic items',
									unreadable: 'no.',
								},
							]
						: [push('armour_class', 2, null, 'Ring')],
			},
		]);
		expect(() => env.sheet('mod.armour_class')).toThrow();
		refuse = false;
		expect(env.sheet('mod.armour_class')).toBe(2);
	});

	it('closes a ring through a slot loudly, naming the row', () => {
		/*
		 * A modifier whose amount reads the target it modifies. The name table's
		 * own `active` guard closes it: the slot's walk fails, the amount is
		 * unreadable, the slot throws with the row named, and the card shows
		 * nothing rather than a silent number. This is the case that makes this
		 * shape safer than an application pass — Foundry's dnd5e#3900 is silent.
		 */
		const env = buildSheetEnv([
			computed('armour_class', '10 + mod.self'),
			{
				id: 'items',
				values: {},
				modifiers: (resolve, explain) => {
					const value = resolve('amount', {});
					if (typeof value === 'number') {
						return [push('armour_class', value, null, 'Ouroboros')];
					}
					return [
						{
							target: 'armour_class',
							type: null,
							label: 'Ouroboros',
							source: 'Magic items',
							unreadable: explain('amount', {}) ?? 'did not resolve.',
						},
					];
				},
				resolver: (inner) => (field) => {
					if (field !== 'amount') return null;
					try {
						return evaluate('armour_class', inner.sheet, callsFrom(inner));
					} catch {
						return null;
					}
				},
				explainer: (inner) => (field) => {
					if (field !== 'amount') return null;
					try {
						evaluate('armour_class', inner.sheet, callsFrom(inner));
						return null;
					} catch (error) {
						return error instanceof Error ? error.message : String(error);
					}
				},
			},
		]);
		expect(() => env.sheet('mod.armour_class')).toThrow('Row "Ouroboros"');
		expect(env.sheet('armour_class')).toBeUndefined();
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
		const env = buildSheetEnv([
			computed('armour_class', '10 + mod.self'),
			pushing('items', [push('armour_class', 3, 'item', 'Ring')]),
		]);
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
	 * A modifier amount that reads a slot. The walk cannot answer from inside
	 * itself, so it refuses — and what it refuses is wider than a cycle, which is
	 * why the message says only what it has established.
	 */
	const readingSlot = (expression: string): PublishedComponent => ({
		id: 'items',
		values: {},
		modifiers: (resolve, explain) => {
			const amount = resolve('amount', {});
			return typeof amount === 'number'
				? [push('armour_class', amount, null, 'Ring')]
				: [
						{
							target: 'armour_class',
							type: null,
							label: 'Ring',
							source: 'Magic items',
							unreadable: explain('amount', {}) ?? 'no reason given',
						},
					];
		},
		resolver: (env) => (field) => {
			if (field !== 'amount') return null;
			try {
				return evaluate(expression, env.sheet, callsFrom(env));
			} catch {
				return null;
			}
		},
		explainer: (env) => (field) => {
			if (field !== 'amount') return null;
			try {
				evaluate(expression, env.sheet, callsFrom(env));
				return null;
			} catch (error) {
				return error instanceof Error ? error.message : String(error);
			}
		},
	});

	it('refuses an amount that reads another target\'s slot, asked cold', () => {
		// No ring anywhere: `speed`'s own pushes are plain numbers. The walk still
		// cannot answer `mod.speed` from inside itself.
		const env = buildSheetEnv([
			computed('armour_class', '10 + mod.self'),
			computed('speed', '30 + mod.self'),
			pushing('boots', [push('speed', 10, null, 'Boots')]),
			readingSlot('mod.speed'),
		]);
		expect(() => env.sheet('mod.armour_class')).toThrow('Row "Ring"');
	});

	it('claims only what it has established about why', () => {
		/*
		 * The message used to assert "one of them is waiting on the total it is
		 * part of", which is false for the case above — the amount read a
		 * *different* target — and would send a reader hunting for a
		 * self-reference that is not there.
		 */
		const env = buildSheetEnv([
			computed('armour_class', '10 + mod.self'),
			computed('speed', '30 + mod.self'),
			pushing('boots', [push('speed', 10, null, 'Boots')]),
			readingSlot('mod.speed'),
		]);
		let said = '';
		try {
			env.sheet('mod.armour_class');
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
