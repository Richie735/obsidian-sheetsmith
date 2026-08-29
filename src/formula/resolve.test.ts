import { describe, expect, it } from 'vitest';
import { parseFunctions } from './functions';
import {
	formulaTexts,
	makeFieldExplainer,
	makeFieldResolver,
	NO_ENV,
	resolveFormulaFields,
} from './resolve';
import { ComponentConfig } from '../types';
import { modifierSlot } from './modifiers';

const component = { formulaFields: ['derived'] as const };
const config = {
	id: 'wis',
	type: 'card',
	label: 'WIS',
	position: { col: 1, row: 1, width: 1, height: 1 },
};

describe('resolveFormulaFields', () => {
	it('evaluates an expression against the component data', () => {
		const resolved = resolveFormulaFields(
			component,
			{ ...config, derived: 'floor((value - 10) / 2)' } as typeof config,
			{ value: '19' },
		);
		expect(resolved.derived).toBe(4);
	});

	it('passes literal numbers through', () => {
		const resolved = resolveFormulaFields(
			component,
			{ ...config, derived: 2 } as unknown as typeof config,
			{ value: '19' },
		);
		expect(resolved.derived).toBe(2);
	});

	it('resolves to null when evaluation fails', () => {
		const resolved = resolveFormulaFields(
			component,
			{ ...config, derived: 'floor((value - 10) / 2)' } as typeof config,
			{ value: '30 sqr' },
		);
		expect(resolved.derived).toBeNull();
	});

	it('skips fields with no expression configured', () => {
		const resolved = resolveFormulaFields(component, config, { value: '19' });
		expect('derived' in resolved).toBe(false);
	});
});

describe('makeFieldResolver', () => {
	const derivedConfig = {
		...config,
		derived: 'floor((value - 10) / 2)',
	} as typeof config;

	it('layers the extra scope over the data scope', () => {
		const resolve = makeFieldResolver(component, derivedConfig, {
			value: '19',
		});
		expect(resolve('derived', {})).toBe(4);
		expect(resolve('derived', { value: '8' })).toBe(-1);
		expect(resolve('derived', { value: 16 })).toBe(3);
	});

	it('returns null for unknown fields and failed evaluations', () => {
		const resolve = makeFieldResolver(component, derivedConfig, {});
		expect(resolve('nope', {})).toBeNull();
		expect(resolve('derived', { value: 'fast' })).toBeNull();
	});

	/*
	 * The extra scope is an ordinary object, so a membership test with `in`
	 * answers yes for every name on Object.prototype. A component whose column
	 * or entry is called "constructor" would then have the name captured by an
	 * empty scope and resolve to nothing, rather than falling through to the
	 * data and the sheet where it does live.
	 */
	it('does not let an empty scope capture a name off Object.prototype', () => {
		const shadowing = { formulaFields: ['derived'] as const };
		const resolve = makeFieldResolver(
			shadowing,
			{ ...config, derived: 'constructor + 1' } as typeof config,
			{ constructor: '4' },
		);
		expect(resolve('derived', {})).toBe(5);
	});

	it('still lets the scope shadow such a name when it holds one', () => {
		const shadowing = { formulaFields: ['derived'] as const };
		const resolve = makeFieldResolver(
			shadowing,
			{ ...config, derived: 'constructor + 1' } as typeof config,
			{ constructor: '4' },
		);
		expect(resolve('derived', { constructor: 10 })).toBe(11);
	});
});

/*
 * **The fork that decides which of two evaluations of one name takes the
 * override and the result phase** (SPEC §5).
 *
 * A component may evaluate one published name twice: a Card's `derived`, which
 * *becomes* `armour_class`, and its `effective`, which is a second reading of the
 * same value for the pill. Both see the value phase; only the first may take the
 * override and the result-phase total, because those land on the published number
 * rather than on a display of what is behind it.
 *
 * **Here rather than in a component's file, and that is the whole point of the
 * case.** Both `card.test.ts` and `card-set.test.ts` drive the pill through a stub
 * `resolveField` that returns a number and never looks at its fourth argument, so
 * every assertion about what the pill reads passes with the flag deleted at the
 * call site. Measured, not assumed: removing `true` from `card.ts` and
 * `card-set.ts` left the whole suite green, and the failure that would then ship
 * is a Strength pill reading an override *of the ability modifier* as the score.
 * This is the one file where the branch is observable at all.
 */
describe('an evaluation that publishes a name, and one that only displays it', () => {
	const publishing = { formulaFields: ['derived'] as const };
	const reading = {
		...config,
		id: 'armour_class',
		derived: 'value + mod.self',
	} as typeof config;

	/**
	 * A slot carrying all three quantities at once, because the two branches
	 * differ by two of them and a case holding one could not tell which was live.
	 */
	const env = {
		...NO_ENV,
		sheet: (name: string) => (name === modifierSlot('armour_class') ? 4 : undefined),
		modifiers: () => ({ override: 21, total: 4, resultTotal: 1, lines: [] }),
	};

	const resolve = makeFieldResolver(publishing, reading, { value: '15' }, env);

	it('lands the override and the result phase on the number that publishes', () => {
		// 15 + the value-phase 4 is 19; the override replaces it at 21, the same
		// value phase goes back on top for 25, and the result-phase 1 lands after.
		expect(resolve('derived', {}, 'armour_class')).toBe(26);
	});

	it('leaves a display-only reading the value phase alone', () => {
		// The same slot, the same formula, the same 4 — and neither the override
		// nor the phase that lands after the formula ran.
		expect(resolve('derived', {}, 'armour_class', true)).toBe(19);
	});

	it('reads the same slot in both, so the difference is the fork and not the scope', () => {
		/*
		 * Without this the two cases above are also satisfied by a display-only
		 * evaluation that never reached the slot at all — which is a different bug
		 * with the same two numbers, and the one the `published === undefined`
		 * branch three lines up would produce.
		 */
		const noSlot = makeFieldResolver(
			publishing,
			{ ...reading, derived: 'value' } as typeof config,
			{ value: '15' },
			env,
		);
		expect(noSlot('derived', {}, 'armour_class', true)).toBe(15);
		expect(resolve('derived', {}, 'armour_class', true)).toBe(19);
	});
});

describe('the layout function library, from a component', () => {
	const { library } = parseFunctions([
		'mod(score) = floor((score - 10) / 2)',
		'prof = ceil(level / 4) + 1',
	]);
	const sheet = (name: string) => (name === 'level' ? 5 : undefined);
	const derived = { ...config, derived: 'mod(value) + prof' } as typeof config;

	it('lets a card call a function the layout defined', () => {
		const resolve = makeFieldResolver(
			component,
			derived,
			{ value: '19' },
			{ ...NO_ENV, sheet, library },
		);
		expect(resolve('derived', {})).toBe(7);
	});

	it('resolves the same call per entry', () => {
		const resolve = makeFieldResolver(component, derived, {}, { ...NO_ENV, sheet, library });
		expect(resolve('derived', { value: 8 })).toBe(2);
		expect(resolve('derived', { value: 20 })).toBe(8);
	});

	it('keeps the card’s own names out of the function body', () => {
		// The body's `score` is its parameter. A card holding a `score` entry
		// of its own must not change what mod() means.
		const shadowed = parseFunctions(['mod(score) = score']).library;
		const resolve = makeFieldResolver(
			component,
			{ ...config, derived: 'mod(3)' } as typeof config,
			{ score: '99' },
			{ ...NO_ENV, sheet, library: shadowed },
		);
		expect(resolve('derived', { score: 50 })).toBe(3);
	});

	it('explains a call to a function the layout does not define', () => {
		const explain = makeFieldExplainer(
			component,
			{ ...config, derived: 'halve(value)' } as typeof config,
			{ value: '19' },
			{ ...NO_ENV, sheet, library },
		);
		expect(explain('derived', {})).toMatch(/halve/);
	});

	it('resolves to null rather than throwing on a self-referencing function', () => {
		const looping = parseFunctions(['loop(x) = loop(x)']).library;
		const resolve = makeFieldResolver(
			component,
			{ ...config, derived: 'loop(1)' } as typeof config,
			{},
			{ ...NO_ENV, sheet, library: looping },
		);
		expect(resolve('derived', {})).toBeNull();
	});
});

/*
 * Every expression a component's configuration holds.
 *
 * The counterpart to `readPath`, and the half that needs a test of its own: the
 * `*` expansion is what makes the modifier accepting set see a Table's computed
 * column at all, and `acceptingTargets` is handed a list of strings, so a test
 * of that alone would pass with this returning nothing.
 */
describe('formulaTexts', () => {
	/** A Table's declarations: one per column, and one per row value. */
	const repeating = {
		formulaFields: ['columns.*.formula', 'rows.*.values.*'] as const,
	};

	const table = {
		id: 'skills',
		type: 'table',
		label: 'Skills',
		position: { col: 1, row: 1, width: 6, height: 4 },
		rows: [
			{ label: 'Acrobatics', values: { ability: 'abilities.DEX' } },
			{ label: 'Perception', values: { ability: 'abilities.WIS' } },
		],
		columns: [
			{ key: 'Training', type: 'number' },
			{ key: 'Total', type: 'computed', formula: 'ability + mod.self' },
		],
	} as unknown as ComponentConfig;

	it('expands a * over whatever the config has there', () => {
		// A static list could not name these: a Table's expressions live one per
		// column and one per row, and the count is the layout's.
		expect(formulaTexts(repeating, table)).toEqual([
			'ability + mod.self',
			'abilities.DEX',
			'abilities.WIS',
		]);
	});

	it('reads a plain field with no star in it', () => {
		expect(
			formulaTexts(component, {
				...config,
				derived: 'floor((value - 10) / 2)',
			} as ComponentConfig),
		).toEqual(['floor((value - 10) / 2)']);
	});

	it('holds each expression separately rather than joining them', () => {
		/*
		 * `referencesName` tokenises, so one unparseable definition joined to the
		 * rest would report the whole component as mentioning nothing — which is
		 * the accepting set silently losing a target.
		 */
		const broken = {
			...table,
			columns: [
				{ key: 'A', type: 'computed', formula: '(((' },
				{ key: 'B', type: 'computed', formula: 'mod.self' },
			],
		} as unknown as ComponentConfig;
		expect(formulaTexts(repeating, broken)).toEqual([
			'(((',
			'mod.self',
			'abilities.DEX',
			'abilities.WIS',
		]);
	});

	it('leaves a blank or absent expression out', () => {
		const bare = {
			...table,
			rows: [{ label: 'Acrobatics' }],
			columns: [{ key: 'A', type: 'computed' }, { key: 'B', formula: '  ' }],
		} as unknown as ComponentConfig;
		expect(formulaTexts(repeating, bare)).toEqual([]);
	});

	it('has nothing to say about a component declaring no formula fields', () => {
		expect(formulaTexts({ formulaFields: [] }, table)).toEqual([]);
	});
});
