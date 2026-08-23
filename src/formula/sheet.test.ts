import { describe, expect, it } from 'vitest';
import { evaluate, Scope } from './expression';
import { parseFunctions } from './functions';
import {
	callsFrom,
	makeFieldResolver,
	NO_ENV,
	resolveFormulaFields,
} from './resolve';
import { buildSheetEnv, buildSheetScope, PublishedComponent } from './sheet';
import { ComponentConfig, FieldValue } from '../types';

/** A card set with the 5e modifier formula on every entry. */
const abilities: PublishedComponent = {
	id: 'abilities',
	values: {
		named: {
			STR: { value: '8', display: { field: 'derived', scope: { value: '8' } } },
			DEX: { value: '22', display: { field: 'derived', scope: { value: '22' } } },
			WIS: { value: '', display: { field: 'derived', scope: { value: '' } } },
		},
	},
	resolver: () => (field, scope) => {
		if (field !== 'derived' || typeof scope.value !== 'string') return null;
		const parsed = Number(scope.value);
		return scope.value.trim() === '' || !Number.isFinite(parsed)
			? null
			: Math.floor((parsed - 10) / 2);
	},
};

/** A plain stored value with no formula of its own. */
const speed: PublishedComponent = {
	id: 'speed',
	values: { self: { value: '30' } },
};

describe('buildSheetScope', () => {
	it('gives a bare name what the card shows, not what the note stores', () => {
		// The point of the whole table: abilities.DEX is the +6 in large
		// type, not the 22 behind it.
		expect(buildSheetScope([abilities])('abilities.DEX')).toBe(6);
		expect(buildSheetScope([abilities])('abilities.STR')).toBe(-1);
	});

	it('keeps the stored value reachable under .value', () => {
		const scope = buildSheetScope([abilities]);
		expect(scope('abilities.DEX.value')).toBe(22);
		expect(scope('abilities.STR.value')).toBe(8);
	});

	it('falls back to the stored value when the card computes nothing', () => {
		const scope = buildSheetScope([speed]);
		expect(scope('speed')).toBe(30);
		expect(scope('speed.value')).toBe(30);
	});

	it('publishes nothing for a display that will not resolve', () => {
		// Handing back the raw 22 where the +6 was meant is a worse answer
		// than none: the reader gets an unknown name and reports it.
		const scope = buildSheetScope([abilities]);
		expect(scope('abilities.WIS')).toBeUndefined();
		expect(scope('abilities.CHA')).toBeUndefined();
	});

	it('leaves an absent or empty value out entirely', () => {
		const scope = buildSheetScope([
			{ id: 'speed', values: { self: { value: '' } } },
		]);
		expect(scope('speed')).toBeUndefined();
		expect(scope('speed.value')).toBeUndefined();
	});

	it('passes non-numeric values through as text', () => {
		const scope = buildSheetScope([
			{ id: 'race', values: { self: { value: 'elf' } } },
		]);
		expect(scope('race')).toBe('elf');
	});

	it('feeds the expression engine directly', () => {
		expect(evaluate('10 + abilities.DEX', buildSheetScope([abilities]))).toBe(16);
	});
});

describe('buildSheetScope: a value only the component can produce', () => {
	/**
	 * A track storing marks and publishing the segments they fill: the case
	 * `display` cannot state, because `floor(value / marks)` is arithmetic
	 * over a config field no formula on the sheet can see.
	 */
	const exhaustion: PublishedComponent = {
		id: 'exhaustion',
		values: {
			self: { value: '22', compute: () => Math.floor(22 / 4) },
		},
	};

	it('gives the bare name the computed value and .value the stored one', () => {
		const scope = buildSheetScope([exhaustion]);
		expect(scope('exhaustion')).toBe(5);
		expect(scope('exhaustion.value')).toBe(22);
	});

	it('publishes nothing where the component could not produce a value', () => {
		const scope = buildSheetScope([
			{ id: 'row', values: { self: { value: '3', compute: () => null } } },
		]);
		expect(scope('row')).toBeUndefined();
		// The stored value stays reachable: only the bare name went missing.
		expect(scope('row.value')).toBe(3);
	});

	it('hands the component a resolver bound to the finished sheet', () => {
		// The whole point of the member: the component computes with the sheet
		// in hand, so a published row may read a card registered after it.
		const scope = buildSheetScope([
			{
				id: 'skills',
				values: {
					named: {
						perception: {
							compute: (resolve) => resolve('columns.0.formula', { Training: 2 }),
						},
					},
				},
				resolver: (env) => (field, row) =>
					field === 'columns.0.formula'
						? evaluate('abilities.DEX + Training', (name) =>
								Object.prototype.hasOwnProperty.call(row, name)
									? row[name]
									: env.sheet(name),
							)
						: null,
			},
			abilities,
		]);
		expect(scope('skills.perception')).toBe(8);
		expect(evaluate('10 + skills.perception', scope)).toBe(18);
	});

	it('catches a cycle running through a computed value', () => {
		// Two rows of one card naming each other: two distinct published
		// names, so the guard that catches a cross-component cycle catches
		// this one without knowing they are siblings.
		const rows: PublishedComponent = {
			id: 'skills',
			values: {
				named: {
					row_a: { compute: (resolve) => resolve('a', {}) },
					row_b: { compute: (resolve) => resolve('b', {}) },
				},
			},
			resolver: (env) => (field) => {
				try {
					return evaluate(
						field === 'a' ? 'skills.row_b' : 'skills.row_a',
						env.sheet,
					);
				} catch {
					return null;
				}
			},
		};
		const scope = buildSheetScope([rows, abilities]);
		expect(scope('skills.row_a')).toBeUndefined();
		expect(scope('skills.row_b')).toBeUndefined();
		expect(scope('abilities.DEX')).toBe(6);
	});
});

describe('buildSheetScope: names that depend on names', () => {
	/** A component whose display is whatever formula it is given. */
	const computed = (id: string, formula: string): PublishedComponent => ({
		id,
		values: { self: { display: { field: 'derived', scope: {} } } },
		resolver: (env) => (field) => {
			if (field !== 'derived') return null;
			try {
				return evaluate(formula, env.sheet);
			} catch {
				return null;
			}
		},
	});

	it('resolves a chain, whatever order the components arrive in', () => {
		// touch-ac reads ac, which reads abilities.DEX, which is itself
		// computed — and ac is registered after the thing reading it.
		const scope = buildSheetScope([
			computed('touch-ac', 'ac - 2'),
			computed('ac', '10 + abilities.DEX'),
			abilities,
		]);
		expect(scope('ac')).toBe(16);
		expect(scope('touch-ac')).toBe(14);
	});

	it('reports a cycle as unresolvable instead of overflowing the stack', () => {
		const scope = buildSheetScope([
			computed('ac', 'initiative + 1'),
			computed('initiative', 'ac - 1'),
			abilities,
		]);
		expect(scope('ac')).toBeUndefined();
		expect(scope('initiative')).toBeUndefined();
		// Everything outside the cycle keeps working.
		expect(scope('abilities.DEX')).toBe(6);
	});

	it('survives a formula that references itself', () => {
		const scope = buildSheetScope([computed('ac', 'ac + 1')]);
		expect(scope('ac')).toBeUndefined();
	});
});

describe('a component resolving against the sheet', () => {
	const config = {
		id: 'armour-class',
		type: 'card',
		label: 'Armour class',
		position: { col: 1, row: 1, width: 2, height: 1 },
		derived: '10 + abilities.DEX',
	} as unknown as ComponentConfig;
	const component = { formulaFields: ['derived'] };
	const sheet = buildSheetScope([abilities]);

	it('reads another component by name, with nothing stored of its own', () => {
		expect(makeFieldResolver(component, config, null, { ...NO_ENV, sheet })('derived', {})).toBe(
			16,
		);
		expect(resolveFormulaFields(component, config, null, { ...NO_ENV, sheet })).toEqual({
			derived: 16,
		});
	});

	it('can still ask for the raw score', () => {
		const raw = { ...config, derived: 'abilities.DEX.value' } as ComponentConfig;
		expect(makeFieldResolver(component, raw, null, { ...NO_ENV, sheet })('derived', {})).toBe(22);
	});

	it('lets local names shadow the sheet, never the other way round', () => {
		const local = { ...config, derived: 'value * 2' } as ComponentConfig;
		const shadowing: Scope = buildSheetScope([
			{ id: 'value', values: { self: { value: '99' } } },
		]);
		const resolve = makeFieldResolver(component, local, { value: '5' }, {
			...NO_ENV,
			sheet: shadowing,
		});
		expect(resolve('derived', {})).toBe(10);
		// And the innermost scope shadows the component's own data in turn.
		expect(resolve('derived', { value: 7 })).toBe(14);
	});

	it('fails to resolve when the name is not on the sheet', () => {
		expect(
			makeFieldResolver(component, config, null, {
				...NO_ENV,
				sheet: buildSheetScope([]),
			})('derived', {}),
		).toBeNull();
	});

	/*
	 * The loop the function library has to close: a card calls a layout
	 * function, whose body reads the sheet, one of whose names is computed by
	 * another card. The body's scope is the sheet itself, so it reaches the
	 * lazy table and the cycle guard covers it.
	 */
	it('calls a layout function whose body reads a computed name', () => {
		const { library } = parseFunctions([
			'save(score) = mod(score) + prof',
			'mod(score) = floor((score - 10) / 2)',
			'prof = 3',
		]);
		const dexSave = {
			...config,
			derived: 'save(abilities.DEX.value)',
		} as ComponentConfig;
		expect(
			makeFieldResolver(component, dexSave, null, { ...NO_ENV, sheet, library })('derived', {}),
		).toBe(9);
	});

	it('keeps the calling card out of the body even against the sheet', () => {
		// `value` is the card's own, and the sheet has no such name: a body
		// reading it must fail rather than pick the caller's up.
		const { library } = parseFunctions(['twice(x) = x + value']);
		const calling = { ...config, derived: 'twice(2)' } as ComponentConfig;
		expect(
			makeFieldResolver(component, calling, { value: '5' }, {
				...NO_ENV,
				sheet,
				library,
			})(
				'derived',
				{},
			),
		).toBeNull();
	});
});

/*
 * The two tables, tied (SPEC §5).
 *
 * A published name may hold an aggregate and a row's computed column may read a
 * published name, so neither table can be finished before the other starts.
 * These drive that loop from both ends.
 */
describe('buildSheetEnv', () => {
	/** An inventory whose rows carry a weight and a worn flag. */
	const inventory: PublishedComponent = {
		id: 'inventory',
		values: {},
		rows: () => [
			{ label: 'Dagger', values: { Weight: 1, Worn: false } },
			{ label: 'Sunblade', values: { Weight: 3, Worn: true } },
		],
	};

	/** A card whose one published name is whatever formula it is given. */
	const computed = (id: string, formula: string): PublishedComponent => ({
		id,
		values: { self: { display: { field: 'derived', scope: {} } } },
		resolver: (env) => (field) => {
			if (field !== 'derived') return null;
			try {
				return evaluate(formula, env.sheet, callsFrom(env));
			} catch {
				return null;
			}
		},
	});

	it('publishes a name computed by an aggregate', () => {
		const env = buildSheetEnv([
			inventory,
			computed('encumbrance', 'sum(inventory, Weight)'),
		]);
		expect(env.sheet('encumbrance')).toBe(4);
		expect(evaluate('encumbrance / 2', env.sheet, callsFrom(env))).toBe(2);
	});

	it('lets a row expression read a name another component publishes', () => {
		// The other direction of the same loop: the row table is handed a
		// resolver bound to the finished name table.
		const env = buildSheetEnv([
			{
				...inventory,
				rows: (resolve) => [
					{ label: 'Dagger', values: { Load: resolve('derived', {}) ?? 0 } },
				],
				resolver: (bound) => () => bound.sheet('prof') ?? null,
			},
			{ id: 'prof', values: { self: { value: 3 } } },
		]);
		expect(evaluate('sum(inventory, Load)', env.sheet, callsFrom(env))).toBe(3);
	});

	it('takes the layout\'s own functions, so an aggregate can call one', () => {
		const { library } = parseFunctions(['half(x) = x / 2']);
		const env = buildSheetEnv([inventory], library);
		expect(evaluate('sum(inventory, half(Weight))', env.sheet, callsFrom(env))).toBe(
			2,
		);
	});

	it('gives a function body called from a row the sheet, and not the row', () => {
		// Two things at once, and the second is why the body reads a *sheet*
		// name rather than only its parameter. `callsFrom` renames the sheet to
		// `base`, which is the whole of what a function body sees besides its
		// parameters — and the two environments are otherwise close enough that
		// skipping the conversion compiles. Written with `half(x) = x / 2` the
		// body never reaches the sheet, so this passed either way and the
		// omission was invisible; `density` is what makes it bite.
		const { library } = parseFunctions(['bulk(x) = x * density']);
		const env = buildSheetEnv(
			[inventory, { id: 'density', values: { self: { value: 2 } } }],
			library,
		);
		expect(evaluate('sum(inventory, bulk(Weight))', env.sheet, callsFrom(env))).toBe(
			8,
		);
		// And the row is still not visible inside the body: SPEC §5's rule that
		// a function is not a text substitution, unchanged by the aggregate.
		const reading = parseFunctions(['weight_of(n) = n * Weight']).library;
		expect(() =>
			evaluate(
				'sum(inventory, weight_of(1))',
				env.sheet,
				callsFrom(buildSheetEnv([inventory], reading)),
			),
		).toThrow(/unknown name "Weight"/);
	});

	it('leaves both ends of a cycle through a published name unresolved', () => {
		// `encumbrance` sums the table, and the table's own row reads
		// `encumbrance`. The existing name-table guard is the whole of what
		// catches this: the row's value goes unresolved, so it is absent from
		// the row, and the aggregate reading it fails. No new guard involved.
		const env = buildSheetEnv([
			{
				id: 'inventory',
				values: {},
				// A column that will not resolve is absent from the row, never
				// zero, which is what makes the aggregate reading it fail rather
				// than quietly add nothing.
				rows: (resolve) => {
					const load = resolve('derived', {});
					const values: Record<string, FieldValue> = {};
					if (load !== null) values.Load = load;
					return [{ label: 'Dagger', values }];
				},
				resolver: (bound) => () => bound.sheet('encumbrance') ?? null,
			},
			computed('encumbrance', 'sum(inventory, Load)'),
			computed('speed', '30'),
		]);
		expect(env.sheet('encumbrance')).toBeUndefined();
		// Everything outside the cycle keeps working.
		expect(env.sheet('speed')).toBe(30);
	});

	it('refuses a row set that is being walked rather than recursing', () => {
		// A computed column aggregating over its own table runs through no
		// published name at all, so this is the row table's own guard rather
		// than the name table's.
		let said: string | null = null;
		const env: ReturnType<typeof buildSheetEnv> = buildSheetEnv([
			{
				id: 'inventory',
				values: {},
				rows: () => {
					try {
						evaluate('sum(inventory, Weight)', env.sheet, callsFrom(env));
					} catch (error) {
						said = error instanceof Error ? error.message : String(error);
					}
					return [{ label: 'Dagger', values: { Weight: 1 } }];
				},
			},
			computed('speed', '30'),
		]);
		expect(() => evaluate('sum(inventory, Weight)', env.sheet, callsFrom(env))).toThrow(
			/already being read/,
		);
		expect(said).toContain('already being read');
		// The rest of the sheet is untouched by it.
		expect(env.sheet('speed')).toBe(30);
	});

	/*
	 * SPEC §5's coarse edge, driven from both ends.
	 *
	 * `encumbrance = sum(inventory, Weight)` with `inventory`'s computed
	 * `Load = encumbrance / 2` is "a cycle to a coarse check and not one in
	 * fact": the walk's failure to produce `Load` never reaches an aggregate
	 * that asked for `Weight`. The name table's own guard is what unwinds it,
	 * and the row table's guard must not turn it into a real one — which it did
	 * while the refusal was held against the component rather than the walk, and
	 * only in the order no test drove.
	 */
	describe('a coarse cycle is not made a real one', () => {
		const coarse = () =>
			buildSheetEnv([
				{
					id: 'inventory',
					values: {},
					rows: (resolve) => {
						const load = resolve('derived', {});
						const values: Record<string, FieldValue> = { Weight: 4 };
						if (load !== null) values.Load = load;
						return [{ label: 'Dagger', values }];
					},
					resolver: (bound) => () => {
						try {
							return evaluate('encumbrance / 2', bound.sheet, callsFrom(bound));
						} catch {
							return null;
						}
					},
				},
				computed('encumbrance', 'sum(inventory, Weight)'),
				computed('speed', '30'),
			]);

		it('resolves the published name and every aggregate, asked that way round', () => {
			const env = coarse();
			expect(env.sheet('encumbrance')).toBe(4);
			expect(evaluate('sum(inventory, Weight)', env.sheet, callsFrom(env))).toBe(4);
			expect(env.sheet('speed')).toBe(30);
		});

		it('is caught by whichever guard the ring is entered at, and says so', () => {
			// F4's clause "with no new guard involved" was written before the row
			// table existed and is false in this order. A card holding an
			// aggregate over the table, drawing before `encumbrance` resolves,
			// enters the ring at the rows: `encumbrance`'s thunk runs inside the
			// row walk and is not yet its own dependency, so the name table's
			// guard never fires and the row table's does.
			//
			// Pinned rather than fixed. It is one evaluation and it corrects
			// itself — the cost is a "?" whose appearance depends on grid order,
			// recorded against the guard in SPEC §5. Closing it means the two
			// guards knowing about each other.
			const env = coarse();
			expect(() =>
				evaluate('sum(inventory, Weight)', env.sheet, callsFrom(env)),
			).toThrow(/already being read/);
			// It corrects itself: the name resolves, the row set is built, and
			// the same formula is the number from then on.
			expect(env.sheet('encumbrance')).toBe(4);
			expect(evaluate('sum(inventory, Weight)', env.sheet, callsFrom(env))).toBe(4);
		});

		it('resolves them just the same after the column in the cycle is asked for first', () => {
			// The order that used to condemn the table for the environment's
			// life: `sum(inventory, Load)` reaches the row table's guard before
			// `encumbrance` reaches the name table's, so the refusal fires here
			// first. It has to be this walk's and no more than that.
			const env = coarse();
			expect(() =>
				evaluate('sum(inventory, Load)', env.sheet, callsFrom(env)),
			).toThrow(/already being read/);
			// Everything §5 says is not in the cycle still works, which is the
			// whole of what the coarse edge costs.
			expect(env.sheet('encumbrance')).toBe(4);
			expect(evaluate('sum(inventory, Weight)', env.sheet, callsFrom(env))).toBe(4);
			expect(env.sheet('speed')).toBe(30);
		});
	});

	it('names a component that holds no rows rather than denying it exists', () => {
		const env = buildSheetEnv([
			inventory,
			{ id: 'armour_class', values: { self: { value: 16 } } },
		]);
		expect(() => evaluate('count(armour_class)', env.sheet, callsFrom(env))).toThrow(
			/holds no rows/,
		);
		expect(env.sheet('armour_class')).toBe(16);
	});
});
