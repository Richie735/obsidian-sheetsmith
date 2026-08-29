import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluate, Scope } from './expression';
import { parseFunctions } from './functions';
import {
	callsFrom,
	makeFieldResolver,
	NO_ENV,
	resolveFormulaFields,
} from './resolve';
import {
	buildSheetEnv,
	buildSheetScope,
	PublishedComponent,
	sheetModifierInput,
	sheetModifiers,
} from './sheet';
import { ModifierTargetSource } from './modifier-targets';
import {
	ComponentConfig,
	FieldValue,
	ModifierDefinitionView,
} from '../types';

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
								Object.hasOwn(row, name)
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

/*
 * The sheet-wide half of item modifiers (SPEC §5).
 */
/** A static source, with what a case is not about left alone. */
function source(over: Partial<ModifierTargetSource>): ModifierTargetSource {
	return { id: 'x', label: 'X', values: {}, formulas: [], ...over };
}

describe('sheetModifiers', () => {
	/** The two definitions every case here shares. */
	const DEFINITIONS: readonly ModifierDefinitionView[] = [
		{
			name: 'Ring',
			target: 'armour_class',
			targetLabel: 'Armour class',
			operator: 'add',
			amount: '2',
			bonusType: 'item',
		},
		{
			name: 'Boots',
			target: 'speed',
			targetLabel: 'Speed',
			operator: 'add',
			amount: '10',
		},
	];

	/** A card reading its own slot, and a component whose rows enrol. */
	function sheet(formula: string) {
		const components: PublishedComponent[] = [
			{
				id: 'armour_class',
				values: { self: { display: { field: 'derived', scope: {} } } },
				resolver: (env) => (field, _scope, published) =>
					field === 'derived'
						? evaluate(formula, (name) =>
								name === 'mod.self' && published !== undefined
									? env.sheet(`mod.${published}`)
									: env.sheet(name),
							)
						: null,
			},
			{
				id: 'speed',
				values: { self: { value: 30 } },
			},
			{
				id: 'items',
				values: {},
				modifiers: () => [
					{
						part: 'Ring',
						source: 'Magic items',
						row: { label: 'Ring', values: {} },
					},
					{
						part: 'Boots',
						source: 'Magic items',
						row: { label: 'Boots', values: {} },
					},
				],
			},
		];
		// The static sources, which is what the accepting set is derived from: it
		// is a property of the layout rather than of a note.
		const input = sheetModifierInput(DEFINITIONS, [
			source({
				id: 'armour_class',
				label: 'Armour class',
				values: { self: { value: 1 } },
				formulas: [formula],
			}),
			source({ id: 'speed', label: 'Speed', values: { self: { value: 1 } } }),
		]);
		const env = buildSheetEnv(components, undefined, input);
		return sheetModifiers(input, env);
	}

	it('offers the layout\'s definitions to a modifier cell\'s picker', () => {
		// Every definition, whatever a table it is drawn on holds: a definition is
		// the layout's, so which ones a row may enrol in has nothing to do with
		// which table the row is on.
		expect(sheet('10 + mod.self').definitions.map((one) => one.name)).toEqual([
			'Ring',
			'Boots',
		]);
	});

	it('breaks down a name that accepts a modifier', () => {
		expect(sheet('10 + mod.self').breakdown('armour_class')).toEqual({
			override: null,
			total: 2,
			resultTotal: 0,
			lines: [
				{
					label: 'Ring',
					source: 'Magic items',
					definition: 'Ring',
					operator: 'add',
					type: 'item',
					amount: 2,
					applies: 'value',
					suppressed: null,
				},
			],
		});
	});

	it('gives no breakdown for a name that accepts none, though it is changed', () => {
		/*
		 * The rule that keeps a card from drawing a mark over a modifier that is
		 * not being applied: `speed` reads no slot, so however many rows enrol in a
		 * definition aimed at it, nothing changes and no mark says otherwise. The
		 * place that says so is the editor's report beside the target picker.
		 */
		expect(sheet('10 + mod.self').breakdown('speed')).toEqual({
			override: null,
			total: 0,
			resultTotal: 0,
			lines: [],
		});
	});

	it('answers what one row\'s enrolment comes to, on that row', () => {
		// The modifier cell's own question, and the reason the context carries a
		// second member: the glyph and the mark on the number must agree.
		const outcome = sheet('10 + mod.self').outcome('Ring', {
			label: 'Ring of Protection',
			values: {},
		});
		expect(outcome.definition?.name).toBe('Ring');
		expect(outcome.applies).toBe(true);
		expect(outcome.amount).toBe(2);
		expect(outcome.suppressed).toBeNull();
	});

	it('says nothing at all for a name the layout does not declare', () => {
		const outcome = sheet('10 + mod.self').outcome('Ring of Nonexistence', {
			label: 'Amulet',
			values: {},
		});
		expect(outcome.definition).toBeNull();
		expect(outcome.applies).toBe(false);
	});

	it('gives no breakdown where the slot itself was refused', () => {
		// The refusal is already on the card as "?" with the row named under it,
		// through the formula that read the slot. There is no number to take apart.
		const components: PublishedComponent[] = [
			{
				id: 'armour_class',
				values: { self: { value: 10 } },
			},
			{
				id: 'items',
				values: {},
				modifiers: () => [
					{
						part: 'Broken',
						source: 'Magic items',
						row: { label: 'Ring', values: {} },
					},
				],
			},
		];
		const input = sheetModifierInput(
			[
				{
					name: 'Broken',
					target: 'armour_class',
					targetLabel: 'Armour class',
					operator: 'add',
					amount: 'nothing_publishes_this',
				},
			],
			[
				source({
					id: 'armour_class',
					values: { self: { value: 1 } },
					formulas: ['10 + mod.self'],
				}),
			],
		);
		const env = buildSheetEnv(components, undefined, input);
		expect(sheetModifiers(input, env).breakdown('armour_class')).toEqual({
			override: null,
			total: 0,
			resultTotal: 0,
			lines: [],
		});
	});
});

/*
 * That every host wires this feature through `buildSheet` and spells none of it.
 *
 * The same guard `view/grid-cells.test.ts` puts on the renderer, and for the same
 * reason read one layer up: the sheet view and the harness have diverged three
 * times, and the harness is how appearance is reviewed — one that wired modifiers
 * differently would sign off on marks the plugin never draws.
 *
 * **This scan exists because three separate mutations of the old wiring were
 * measured to leave the whole suite green**: dropping the third argument to
 * `buildSheetEnv` in the view, the same in the harness, and handing `[]` where the
 * parsed definitions go. None of them crashes — nothing applies, every card reads
 * unmodified, and every enrolled cell still draws `zap` because `outcome` resolves
 * against `modifiers.definitions` regardless. That is a failure no assertion in
 * this suite was positioned to see, and a scan over the call sites is the check
 * that class of bug earns (§10).
 *
 * Written against the spellings rather than against behaviour, because that is
 * what a copy of the sequence *is*: naming any step of it here is the finding.
 */
describe('the sheet has one modifier assembly', () => {
	/**
	 * Every host that builds a sheet's formula environment.
	 *
	 * **Six, and two were missing while the roster's own sentence claimed to name
	 * them all.** Both declare themselves mirrors of `renderSheet` in their
	 * own comments — which is exactly the class this scan was written for — and both
	 * were calling `buildSheetEnv(prepared.map(publishedComponent), library)` with
	 * **no modifier input at all**. So a worked example reading `mod.self`, which
	 * `SPEC` §5's own examples do, would have resolved through `NO_SHEET_MODIFIERS`,
	 * taken the unmodified number, and asserted the view's arithmetic while staying
	 * green.
	 *
	 * A test file counts as a host wherever it builds a sheet at all: the fixture
	 * check was the third for that reason, and three more followed it.
	 */
	const HOSTS = [
		'../view/sheet-view.ts',
		'../../harness/harness.ts',
		// The fixture check counts: it was the third copy, and a fixture that wired
		// modifiers its own way would assert the arithmetic of a lookalike.
		'../view/vault-fixture.test.ts',
		'../view/worked-examples.test.ts',
		'../view/reset-flow.test.ts',
		// The sixth, added with the numeric half of §8's own criterion: a promotion
		// check has to read a card either side of the write, which means building a
		// sheet, which makes it a host.
		'../view/promote-flow.test.ts',
	] as const;

	/** The steps `buildSheet` owns, which a host naming any of them has copied. */
	const STEPS = [
		'buildSheetEnv(',
		'sheetModifierInput(',
		'publishedComponent(',
		'parseModifierDefinitions(layout',
	] as const;

	/** The two hosts that implement §8's layout write. The fixture check does not. */
	const PROMOTING = ['../view/sheet-view.ts', '../../harness/harness.ts'] as const;

	it.each(PROMOTING)('%s hands a promoted effect over whole', (host) => {
		/*
		 * **A promotion carries the effect, never a copy of its five fields.** A
		 * `TypedEffect` *is* a `ModifierDefinition` minus its name, so it satisfies
		 * the writer as it stands — and both hosts once rebuilt it member by member
		 * with a conditional spread each for `bonusType` and `when`.
		 *
		 * The failure that earns a scan rather than a test: `contract.test.ts` forces
		 * any member added to one of those two interfaces onto the other, and a host
		 * spelling the fields would then silently drop it, because an optional member
		 * missing from an object literal type-checks. `promote-flow.test.ts` passes
		 * the effect whole, so it would keep passing — the mirror cannot detect the
		 * drift its own header promises to catch, which is exactly why the check goes
		 * at the call sites.
		 */
		const source = readFileSync(new URL(host, import.meta.url), 'utf8');
		expect(source.length).toBeGreaterThan(2000);
		// Not vacuous: both hosts do implement the write.
		expect(source).toContain('effect');
		for (const member of ['effect.bonusType', 'effect.when', 'effect.target']) {
			expect(source, member).not.toContain(member);
		}
	});

	it.each(HOSTS)('%s goes through buildSheet and spells no step of it', (host) => {
		const source = readFileSync(new URL(host, import.meta.url), 'utf8');
		// A path that stopped resolving would read an empty string and pass
		// everything below by having nothing in it.
		expect(source.length).toBeGreaterThan(2000);
		/*
		 * **A call and never a declaration**, which is the half that would have gone
		 * quietly wrong the moment the roster grew: `worked-examples.test.ts` used to
		 * declare `function buildSheet(layoutSource, noteSource)` of its own, so a
		 * bare `toContain('buildSheet(')` would have matched that and turned the
		 * strongest assertion here into a tautology on the very file it was added to
		 * catch. Its helper is `sheetFrom` now, and this is what keeps a future one
		 * from re-creating the hole.
		 */
		expect(source).toMatch(/(?<!function )\bbuildSheet\(/);
		expect(source).not.toMatch(/function\s+buildSheet\(/);
		for (const step of STEPS) {
			expect(source, step).not.toContain(step);
		}
		// And builds no context of its own: these two are the members a
		// hand-rolled one cannot avoid spelling.
		expect(source).not.toContain('breakdown:');
		expect(source).not.toContain('outcome:');
		/*
		 * Nor a source of its own, which is the half the accepting-set scan below
		 * used to hold for these three files and cannot any more — they no longer
		 * name `modifierTargetSource` at all. `scopeValues` is the member whose
		 * `data` argument *is* the question: passing a note's data is what made the
		 * sheet and the editor disagree once already.
		 */
		expect(source).not.toContain('scopeValues?.(');
		expect(source).not.toContain('formulaTexts(');
	});
});

/*
 * That every reader of the accepting set assembles its sources one way.
 *
 * The sibling of the scan above, and the half it was missing. Three doc comments
 * asserted that the sheet and the layout editor compute the accepting set "from
 * the same input" while two independent assemblies produced it from different
 * ones — the sheet from a note's data, the editor from `null` — and the
 * divergence was reachable in two ways (`modifier-targets.test.ts` drives both).
 *
 * A scan for the same reason that one is: the tests either side prove the
 * *answer* is right, and this proves it is the only one, which is the half that
 * decays. Nothing stops a later edit spelling `scopeValues?.(` here again, and
 * nothing would fail if it did — both divergences over-reported in the editor, so
 * neither would put anything wrong on a screen.
 */
describe('the accepting set has one assembly', () => {
	/**
	 * The editor's two readers.
	 *
	 * The sheet's three hosts left this list when they moved to `buildSheet`,
	 * which is the one place the sequence is now spelled — and the scan above
	 * carries their half of this claim, forbidding them the two spellings a
	 * hand-built source cannot avoid.
	 */
	const READERS = [
		'../editor/config-panel.ts',
		'../editor/modifier-definitions-field.ts',
	] as const;

	it.each(READERS)('%s goes through modifierTargetSource', (reader) => {
		const source = readFileSync(new URL(reader, import.meta.url), 'utf8');
		expect(source.length).toBeGreaterThan(2000);
		expect(source).toContain('modifierTargetSource');
		/*
		 * And assembles no source of its own. `scopeValues` is the member whose
		 * `data` argument *is* the question — passing a note's data is what made
		 * the two disagree — so a call to it outside the shared assembly is the
		 * shape of the bug rather than a lookalike. `formulaTexts` is the other
		 * half of a source and has no other reader.
		 */
		expect(source).not.toContain('scopeValues?.(');
		expect(source).not.toContain('formulaTexts(');
	});

	it('would catch the assembly it forbids', () => {
		// The predicate is narrow, so it has to be shown to match the thing it is
		// written against rather than trusted to.
		const rebuilt = `values: definition?.scopeValues?.(null, entry.config) ?? {}`;
		expect(rebuilt).toContain('scopeValues?.(');
	});
});
