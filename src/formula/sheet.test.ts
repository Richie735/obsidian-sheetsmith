import { describe, expect, it } from 'vitest';
import { evaluate, Scope } from './expression';
import { parseFunctions } from './functions';
import { makeFieldResolver, resolveFormulaFields } from './resolve';
import { buildSheetScope, PublishedComponent } from './sheet';
import { ComponentConfig } from '../types';

/** A stat group with the 5e modifier formula on every attribute. */
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
				resolver: (sheet) => (field, row) =>
					field === 'columns.0.formula'
						? evaluate('abilities.DEX + Training', (name) =>
								Object.prototype.hasOwnProperty.call(row, name)
									? row[name]
									: sheet(name),
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
			resolver: (sheet) => (field) => {
				try {
					return evaluate(field === 'a' ? 'skills.row_b' : 'skills.row_a', sheet);
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
		resolver: (sheet) => (field) => {
			if (field !== 'derived') return null;
			try {
				return evaluate(formula, sheet);
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
		type: 'stat',
		label: 'Armour class',
		position: { col: 1, row: 1, width: 2, height: 1 },
		derived: '10 + abilities.DEX',
	} as unknown as ComponentConfig;
	const component = { formulaFields: ['derived'] };
	const sheet = buildSheetScope([abilities]);

	it('reads another component by name, with nothing stored of its own', () => {
		expect(makeFieldResolver(component, config, null, sheet)('derived', {})).toBe(
			16,
		);
		expect(resolveFormulaFields(component, config, null, sheet)).toEqual({
			derived: 16,
		});
	});

	it('can still ask for the raw score', () => {
		const raw = { ...config, derived: 'abilities.DEX.value' } as ComponentConfig;
		expect(makeFieldResolver(component, raw, null, sheet)('derived', {})).toBe(22);
	});

	it('lets local names shadow the sheet, never the other way round', () => {
		const local = { ...config, derived: 'value * 2' } as ComponentConfig;
		const shadowing: Scope = buildSheetScope([
			{ id: 'value', values: { self: { value: '99' } } },
		]);
		const resolve = makeFieldResolver(component, local, { value: '5' }, shadowing);
		expect(resolve('derived', {})).toBe(10);
		// And the innermost scope shadows the component's own data in turn.
		expect(resolve('derived', { value: 7 })).toBe(14);
	});

	it('fails to resolve when the name is not on the sheet', () => {
		expect(
			makeFieldResolver(component, config, null, buildSheetScope([]))('derived', {}),
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
			makeFieldResolver(component, dexSave, null, sheet, library)('derived', {}),
		).toBe(9);
	});

	it('keeps the calling card out of the body even against the sheet', () => {
		// `value` is the card's own, and the sheet has no such name: a body
		// reading it must fail rather than pick the caller's up.
		const { library } = parseFunctions(['twice(x) = x + value']);
		const calling = { ...config, derived: 'twice(2)' } as ComponentConfig;
		expect(
			makeFieldResolver(component, calling, { value: '5' }, sheet, library)(
				'derived',
				{},
			),
		).toBeNull();
	});
});
