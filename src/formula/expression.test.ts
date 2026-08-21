import { describe, expect, it } from 'vitest';
import { evaluate, FormulaError, isName, Scope } from './expression';
import { parseFunctions } from './functions';
import { buildRowTable } from './rows';
import { RowValues } from '../types';

const empty: Scope = () => undefined;
const scope =
	(values: Record<string, number | boolean | string>): Scope =>
	(name) =>
		values[name];

describe('isName', () => {
	/*
	 * The one question every referencable name in the plugin is measured
	 * against: a component id, a value a component publishes, a totalled column
	 * key. Asked here rather than restated by each caller, because three copies
	 * of a grammar are three answers to it.
	 */
	it('accepts what the tokeniser reads as a name', () => {
		expect(['prof', 'DEX', '_hidden', 'a1', 'Load_cost'].filter(isName)).toEqual([
			'prof',
			'DEX',
			'_hidden',
			'a1',
			'Load_cost',
		]);
	});

	it('refuses what a formula would read as something else', () => {
		// A hyphen is subtraction, a space ends the name, a leading digit is a
		// number, and a dot is a path into something rather than a name.
		expect(
			['Load cost', 'Load-cost', '1st', '', 'Load.cost', 'qty%'].filter(isName),
		).toEqual([]);
	});

	it('agrees with what evaluate actually resolves', () => {
		// The pair that matters: a name this accepts has to resolve as one name,
		// and one it refuses must not quietly resolve as arithmetic over two.
		const names = scope({ Load_cost: 3, Load: 10, cost: 4 });
		expect(evaluate('Load_cost', names)).toBe(3);
		expect(evaluate('Load-cost', names)).toBe(6);
	});
});

describe('evaluate', () => {
	it('does arithmetic with normal precedence', () => {
		expect(evaluate('2 + 3 * 4', empty)).toBe(14);
		expect(evaluate('(2 + 3) * 4', empty)).toBe(20);
		expect(evaluate('10 % 3', empty)).toBe(1);
		expect(evaluate('-5 + 2', empty)).toBe(-3);
	});

	it('computes the 5e modifier formula', () => {
		expect(evaluate('floor((value - 10) / 2)', scope({ value: 19 }))).toBe(4);
		expect(evaluate('floor((value - 10) / 2)', scope({ value: 8 }))).toBe(-1);
	});

	it('supports the standard helpers', () => {
		expect(evaluate('ceil(1.2)', empty)).toBe(2);
		expect(evaluate('round(2.5)', empty)).toBe(3);
		expect(evaluate('abs(0 - 7)', empty)).toBe(7);
		expect(evaluate('min(4, 2, 9)', empty)).toBe(2);
		expect(evaluate('max(4, 2, 9)', empty)).toBe(9);
	});

	it('supports comparisons and the conditional', () => {
		expect(evaluate('if(value >= 10, 1, 0)', scope({ value: 12 }))).toBe(1);
		expect(evaluate('if(trained, 3, 0)', scope({ trained: false }))).toBe(0);
		expect(evaluate('value == 10 || value < 5', scope({ value: 3 }))).toBe(true);
	});

	it('evaluates only the taken branch of if()', () => {
		expect(evaluate('if(prof > 0, 10 / prof, 0)', scope({ prof: 0 }))).toBe(0);
		expect(evaluate('if(prof > 0, 10 / prof, 0)', scope({ prof: 2 }))).toBe(5);
		expect(evaluate('if(true, 1, nope)', empty)).toBe(1);
	});

	it('still validates the shape of if()', () => {
		expect(() => evaluate('if(true, 1)', empty)).toThrow(FormulaError);
		expect(() => evaluate('if(1, 2, 3)', empty)).toThrow(/true or false/);
	});

	it('errors on an unknown name', () => {
		expect(() => evaluate('nope + 1', empty)).toThrow(FormulaError);
		expect(() => evaluate('nope + 1', empty)).toThrow(/nope/);
	});

	it('errors on an unknown function', () => {
		expect(() => evaluate('mod(4)', empty)).toThrow(/mod/);
	});

	it('errors on malformed input rather than guessing', () => {
		expect(() => evaluate('1 +', empty)).toThrow(FormulaError);
		expect(() => evaluate('(1 + 2', empty)).toThrow(FormulaError);
		expect(() => evaluate('1 2', empty)).toThrow(FormulaError);
		expect(() => evaluate('value @ 2', empty)).toThrow(FormulaError);
	});

	it('errors on arithmetic with non-numbers', () => {
		expect(() => evaluate('value + 1', scope({ value: 'fast' }))).toThrow(
			FormulaError,
		);
	});

	it('errors on division and modulo by zero', () => {
		expect(() => evaluate('1 / 0', empty)).toThrow(/zero/i);
		expect(() => evaluate('10 % 0', empty)).toThrow(/zero/i);
	});

	it('never returns a non-finite number', () => {
		const overflowing = '1' + '0'.repeat(309);
		expect(() => evaluate(overflowing, empty)).toThrow(/finite/);
	});

	it('never evaluates input as JavaScript', () => {
		expect(() => evaluate('constructor.constructor("return 1")()', empty)).toThrow(
			FormulaError,
		);
	});
});

/*
 * The aggregate over a component's rows (SPEC §5).
 *
 * Driven here against a row table built by hand, because this is the whole of
 * what the expression core knows about rows: a lookup that answers with a set
 * of labelled name records. Where those records come from is table.ts's, and is
 * driven there.
 */
describe('sum() and count() over a component\'s rows', () => {
	/** A pack: two daggers at a pound, a coil of rope, one worn sword. */
	const inventory: RowValues[] = [
		{ label: 'Dagger', values: { Qty: 2, Weight: 1, Worn: false } },
		{ label: 'Rope', values: { Qty: 1, Weight: 10, Worn: false } },
		{ label: 'Sunblade', values: { Qty: 1, Weight: 3, Worn: true } },
	];

	const over = (rows: readonly RowValues[] = inventory) => ({
		rows: buildRowTable([
			{ id: 'inventory', rows: () => rows },
			{ id: 'armour_class' },
		]),
	});

	const sheet = scope({ 'abilities.STR': 3 });

	it('sums a column over every row', () => {
		expect(evaluate('sum(inventory, Weight)', sheet, over())).toBe(14);
	});

	it('sums an expression over every row, which is what encumbrance is', () => {
		// The number §13 said could not be written: quantity times weight
		// summed down the list, with no computed column to sum.
		expect(evaluate('sum(inventory, Qty * Weight)', sheet, over())).toBe(15);
	});

	it('sums only the rows a condition keeps', () => {
		expect(evaluate('sum(inventory, Weight, Worn)', sheet, over())).toBe(3);
	});

	it('counts rows, and counts the ones a condition keeps', () => {
		expect(evaluate('count(inventory)', sheet, over())).toBe(3);
		expect(evaluate('count(inventory, Worn)', sheet, over())).toBe(1);
	});

	it('is 0 over no rows rather than a failure', () => {
		// An empty inventory weighs nothing, and a new character's sheet must
		// not be full of "?". It is also why min and max over rows are deferred:
		// neither has an answer here.
		expect(evaluate('sum(inventory, Weight)', sheet, over([]))).toBe(0);
		expect(evaluate('count(inventory)', sheet, over([]))).toBe(0);
	});

	it('reads the sheet from inside a row expression', () => {
		expect(evaluate('sum(inventory, Weight + abilities.STR)', sheet, over())).toBe(
			23,
		);
	});

	it('lets a row name shadow the sheet', () => {
		const shadowing = scope({ Weight: 99 });
		expect(evaluate('sum(inventory, Weight)', shadowing, over())).toBe(14);
	});

	it('lets a row name shadow a function\'s own parameter', () => {
		// The row is the nearest scope there is. A row expression that could not
		// see a column because a parameter happened to share its name is the
		// harder surprise, and the table is named in the same expression as the
		// shadowing, so the meaning is still fixed at the definition.
		const { library } = parseFunctions(['load(Weight) = sum(inventory, Weight)']);
		expect(evaluate('load(99)', sheet, { ...over(), library })).toBe(14);
	});

	it('keeps the row out of a function called from a row expression', () => {
		// SPEC §5 unchanged: a function body sees its parameters and the sheet.
		// `mod(score)` must mean the same arithmetic wherever it is called, and
		// a body quietly reading the row it happened to be called from is
		// exactly what that rule refuses.
		const { library } = parseFunctions(['weight_of(n) = n * Weight']);
		expect(() =>
			evaluate('sum(inventory, weight_of(Qty))', sheet, { ...over(), library }),
		).toThrow(/unknown name "Weight"/);
	});

	it('rounds a sum where the totals row would', () => {
		const tenths: RowValues[] = [
			{ label: 'a', values: { Weight: 0.1 } },
			{ label: 'b', values: { Weight: 0.2 } },
		];
		expect(evaluate('sum(inventory, Weight)', sheet, over(tenths))).toBe(0.3);
	});

	it('names a table rather than resolving one', () => {
		// The one position in the language where an identifier is read as text.
		// A component publishing a bare name of the same spelling is not read as
		// that name here — which is the exception, stated as a rule.
		const named = scope({ inventory: 7 });
		expect(evaluate('sum(inventory, Weight)', named, over())).toBe(14);
	});

	it('evaluates nothing per row that the condition ruled out', () => {
		// The laziness, from the outside: a row expression that would fail on
		// the rows the condition drops must never run on them.
		const mixed: RowValues[] = [
			{ label: 'Rope', values: { Weight: 'coil', Worn: false } },
			{ label: 'Sunblade', values: { Weight: 3, Worn: true } },
		];
		expect(evaluate('sum(inventory, Weight, Worn)', sheet, over(mixed))).toBe(3);
	});
});

describe('what an aggregate says when it cannot be read', () => {
	const unreadable: RowValues[] = [
		{ label: 'Dagger', values: { Weight: 1, Qty: 2 } },
		{ label: 'Rope', values: { Weight: 'coil' } },
		{ label: '', values: { Weight: 'a bundle' } },
	];
	const over = {
		rows: buildRowTable([
			{ id: 'inventory', rows: () => unreadable },
			{ id: 'armour_class' },
		]),
	};

	it('says how to write one when the first argument is not a name', () => {
		expect(() => evaluate('sum(2 + 2, Weight)', empty, over)).toThrow(
			'sum() names a table first, then what to add up: sum(inventory, Weight).',
		);
		expect(() => evaluate('count(2)', empty, over)).toThrow(
			'count() names a table first: count(inventory).',
		);
	});

	it('refuses a dotted path where a table is named', () => {
		// `inventory.Weight` is a published total, which is a value: reading it
		// as the table would make one spelling mean two things.
		expect(() => evaluate('sum(inventory.Weight, Weight)', empty, over)).toThrow(
			/names a table first/,
		);
	});

	it('says what the shape is when the argument count is wrong', () => {
		expect(() => evaluate('sum(inventory)', empty, over)).toThrow(
			'sum() takes a table, what to add up, and optionally a condition.',
		);
		expect(() =>
			evaluate('sum(inventory, Weight, Worn, 1)', empty, over),
		).toThrow('sum() takes a table, what to add up, and optionally a condition.');
		expect(() => evaluate('count()', empty, over)).toThrow(
			'count() takes a table, and optionally a condition.',
		);
	});

	it('names the row whose expression would not evaluate', () => {
		expect(() => evaluate('sum(inventory, Wieght)', empty, over)).toThrow(
			'Row "Dagger": unknown name "Wieght".',
		);
	});

	it('names the row holding text where a number was wanted', () => {
		// One bad row of three fails the whole aggregate. Reporting the row
		// beats adding up the rest, because a quietly wrong number is worse
		// than a missing one — which is the failure the closest prior art
		// actually ships.
		expect(() => evaluate('sum(inventory, Weight)', empty, over)).toThrow(
			'Row "Rope": sum() needs a number, got "coil".',
		);
	});

	it('names the row whose condition is not true or false', () => {
		expect(() => evaluate('sum(inventory, Weight, Qty)', empty, over)).toThrow(
			'Row "Dagger": sum()\'s condition needs true or false, got "2".',
		);
	});

	it('says which table is already being read', () => {
		// The computed column that sums its own table. Both the inner attempt
		// and the outer one fail, so the cell shows "?" rather than a number
		// nothing else reading the table could reproduce.
		const said =
			'"inventory" is already being read, so an aggregate over it cannot resolve. A formula on its rows reaches back to it, directly or through another table — break that loop.';
		const table: ReturnType<typeof buildRowTable> = buildRowTable([
			{
				id: 'inventory',
				rows: () => {
					expect(() =>
						evaluate('sum(inventory, Weight)', empty, { rows: table }),
					).toThrow(said);
					return [{ label: 'Dagger', values: { Weight: 1 } }];
				},
			},
		]);
		expect(() =>
			evaluate('sum(inventory, Weight)', empty, { rows: table }),
		).toThrow(said);
	});

	it('says a component holds no rows rather than that it does not exist', () => {
		expect(() => evaluate('sum(armour_class, Weight)', empty, over)).toThrow(
			'"armour_class" holds no rows for sum() to read. Only a table does, and a table showing an error of its own holds none until that is fixed.',
		);
		expect(() => evaluate('sum(inventroy, Weight)', empty, over)).toThrow(
			'There is no table called "inventroy" on this sheet. An aggregate names a component by its layout id, which is not the heading shown on its card.',
		);
	});

	it('finds no table at all where there is no sheet around the formula', () => {
		expect(() => evaluate('sum(inventory, Weight)', empty)).toThrow(
			'There is no table called "inventory" on this sheet. An aggregate names a component by its layout id, which is not the heading shown on its card.',
		);
	});
});
