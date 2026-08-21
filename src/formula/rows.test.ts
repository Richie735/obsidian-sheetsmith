import { describe, expect, it } from 'vitest';
import { buildRowTable, NO_ROWS, RowSetResult } from './rows';
import { FieldValue, RowValues } from '../types';

/** The refusal's wording, once, since six assertions pin the same sentence. */
const BEING_READ =
	' is already being read, so an aggregate over it cannot resolve. A formula on its rows reaches back to it, directly or through another table — break that loop.';

const dagger: RowValues = { label: 'Dagger', values: { Weight: 1 } };
const rope: RowValues = { label: 'Rope', values: { Weight: 10 } };

describe('buildRowTable', () => {
	it('hands back the rows a component published', () => {
		const table = buildRowTable([
			{ id: 'inventory', rows: () => [dagger, rope] },
		]);
		const found = table('inventory', 'sum');
		expect('rows' in found && found.rows).toEqual([dagger, rope]);
	});

	it('tells a name nothing holds from a name holding no rows', () => {
		// Two different mistakes, and only something with the whole sheet in
		// view can separate them: a typo in the table's name, against an
		// aggregate pointed at a card that was never a list.
		const table = buildRowTable([
			{ id: 'inventory', rows: () => [dagger] },
			{ id: 'armour_class' },
		]);
		expect(table('inventroy', 'sum')).toEqual({
			error: 'There is no table called "inventroy" on this sheet. An aggregate names a component by its layout id, which is not the heading shown on its card.',
		});
		expect(table('armour_class', 'sum')).toEqual({
			error:
				'"armour_class" holds no rows for sum() to read. Only a table does, and a table showing an error of its own holds none until that is fixed.',
		});
	});

	it('names the aggregate that asked, since only one of the answers can', () => {
		const table = buildRowTable([{ id: 'armour_class' }]);
		expect(table('armour_class', 'count')).toEqual({
			error:
				'"armour_class" holds no rows for count() to read. Only a table does, and a table showing an error of its own holds none until that is fixed.',
		});
	});

	it('builds a set once, however many aggregates read it', () => {
		// A row's computed columns are evaluated as the set is built, so two
		// aggregates over one table must not build it twice.
		let built = 0;
		const table = buildRowTable([
			{
				id: 'inventory',
				rows: () => {
					built++;
					return [dagger];
				},
			},
		]);
		table('inventory', 'sum');
		table('inventory', 'count');
		expect(built).toBe(1);
	});

	it('refuses a set that is already being walked, inside the walk and out', () => {
		// A computed column aggregating over its own table recurses through no
		// published name, so sheet.ts's guard never sees it. Without this one it
		// does not terminate at all.
		//
		// The outer attempt fails too, and that is the part worth driving:
		// refusing the inner one alone would leave the column absent from the
		// row, the other columns summing fine, and a cell showing a number that
		// no other formula reading the same table could reproduce.
		const beingRead = { error: `"inventory"${BEING_READ}` };
		let reentered: unknown = null;
		const table: ReturnType<typeof buildRowTable> = buildRowTable([
			{
				id: 'inventory',
				rows: () => {
					reentered = table('inventory', 'sum');
					return [dagger];
				},
			},
		]);
		expect(table('inventory', 'sum')).toEqual(beingRead);
		expect(reentered).toEqual(beingRead);
		// And it keeps failing, so one formula cannot read the table while
		// another reading it from the inside cannot.
		expect(table('inventory', 'count')).toEqual(beingRead);
	});

	it('refuses both ends of a cycle spanning two tables', () => {
		// The case the self-sum above does not cover, and the one that decides
		// whether marking the re-entered id alone is enough. It is not: the other
		// end's walk completes, so it would be memoised as a whole row set with
		// the column that read across silently absent — one formula reading it
		// getting an answer where another does not — and which of the two broke
		// would depend only on which an aggregate asked for first, which is grid
		// order.
		const reached = (result: RowSetResult): number =>
			'rows' in result ? result.rows.length : -1;
		const build = () => {
			const table: ReturnType<typeof buildRowTable> = buildRowTable([
				{
					id: 'weapons',
					rows: () => [
						{ label: 'Dagger', values: { across: reached(table('armour', 'sum')) } },
					],
				},
				{
					id: 'armour',
					rows: () => [
						{ label: 'Shield', values: { across: reached(table('weapons', 'sum')) } },
					],
				},
			]);
			return table;
		};

		for (const first of ['weapons', 'armour']) {
			const table = build();
			const second = first === 'weapons' ? 'armour' : 'weapons';
			// Whichever is asked for first, both ends are refused and neither is
			// memoised, so the order an aggregate happens to ask in changes
			// nothing.
			expect(table(first, 'sum')).toEqual({ error: `"${first}"${BEING_READ}` });
			expect(table(second, 'sum')).toEqual({ error: `"${second}"${BEING_READ}` });
			// Asked again as a fresh walk, it is refused again — not because
			// anything was held against it, but because the cycle is structural
			// and the walk re-derives it. Nothing is held: the refusal lasts one
			// walk, which is what keeps a table that is in no cycle working.
			expect(table(first, 'count')).toEqual({ error: `"${first}"${BEING_READ}` });
		}
	});

	it('refuses a ring of three, whichever of them is entered first', () => {
		// **The case that pins the marking rule.** At two, "the suffix from the
		// re-entered id" and "the re-entered id plus the innermost walk" are the
		// same set, so the whole of the rest of this file passes against either.
		// At three they part: the plausible wrong one leaves the middle walk
		// completing and holding a row set with its cross-reference silently
		// absent, which is exactly the disagreement the refusal exists to
		// prevent — and which of the three got it would depend on where the
		// sheet started, so grid order would pick the victim.
		const ring = () => {
			const table: ReturnType<typeof buildRowTable> = buildRowTable(
				(
					[
						['weapons', 'armour'],
						['armour', 'spells'],
						['spells', 'weapons'],
					] as const
				).map(([id, next]) => ({
					id,
					rows: () => {
						const across = table(next, 'sum');
						const values: Record<string, FieldValue> = { own: 1 };
						// Absent where the ring refused it, which is what makes a
						// half-built set detectable from the outside at all.
						if ('rows' in across) values.across = across.rows.length;
						return [{ label: id, values }];
					},
				})),
			);
			return table;
		};

		for (const first of ['weapons', 'armour', 'spells'] as const) {
			const table = ring();
			// Entered anywhere, all three are refused and none is handed a set.
			expect(table(first, 'sum')).toEqual({ error: `"${first}"${BEING_READ}` });
			for (const id of ['weapons', 'armour', 'spells'] as const) {
				expect(table(id, 'sum'), `${first} then ${id}`).toEqual({
					error: `"${id}"${BEING_READ}`,
				});
			}
		}
	});

	it('refuses only the ring when the chain is longer than it', () => {
		// A reaches B, and the ring is B to C and back. A is not in it, so it
		// keeps its own rows — the suffix rule and the "nothing outside the
		// cycle" rule are the same rule, and this is the shape that needs both.
		const table: ReturnType<typeof buildRowTable> = buildRowTable([
			{ id: 'weapons', rows: () => (table('armour', 'sum'), [dagger]) },
			{ id: 'armour', rows: () => (table('spells', 'sum'), [rope]) },
			{ id: 'spells', rows: () => (table('armour', 'sum'), [rope]) },
		]);
		const weapons = table('weapons', 'sum');
		expect('rows' in weapons && weapons.rows).toEqual([dagger]);
		expect(table('armour', 'sum')).toEqual({ error: `"armour"${BEING_READ}` });
		expect(table('spells', 'sum')).toEqual({ error: `"spells"${BEING_READ}` });
	});

	it('refuses the ring and not the walk that merely reached it', () => {
		// A's formula sums B; B's sums B. The ring is B alone, so A must not be
		// told a formula on its rows reaches back to it — it has no such
		// formula, and the reader would go hunting for one. A fails on its own
		// terms instead: the value waiting on B is absent from its rows, and
		// every aggregate over what A does hold keeps working.
		const table: ReturnType<typeof buildRowTable> = buildRowTable([
			{
				id: 'weapons',
				rows: () => {
					const armour = table('armour', 'sum');
					const values: Record<string, FieldValue> = { Weight: 1 };
					if ('rows' in armour) values.Borrowed = armour.rows.length;
					return [{ label: 'Dagger', values }];
				},
			},
			{
				id: 'armour',
				rows: () => {
					table('armour', 'sum');
					return [rope];
				},
			},
		]);
		expect(table('armour', 'sum')).toEqual({ error: `"armour"${BEING_READ}` });
		const weapons = table('weapons', 'sum');
		expect('rows' in weapons && weapons.rows).toEqual([
			{ label: 'Dagger', values: { Weight: 1 } },
		]);
	});

	it('leaves a table outside the cycle alone', () => {
		// The refusal is the cycle's, not the sheet's. `active` holds the whole
		// chain of walks in flight, so the check is that marking all of them does
		// not also condemn a table that merely happened to be read while one was
		// running — from inside the doomed walk, and again after it.
		let inside: RowSetResult | null = null;
		const table: ReturnType<typeof buildRowTable> = buildRowTable([
			{
				id: 'weapons',
				rows: () => {
					inside = table('spells', 'sum');
					table('armour', 'sum');
					return [dagger];
				},
			},
			{
				id: 'armour',
				rows: () => {
					table('weapons', 'sum');
					return [rope];
				},
			},
			{ id: 'spells', rows: () => [dagger, rope] },
		]);
		expect('error' in table('weapons', 'sum')).toBe(true);
		expect(inside).toEqual({ rows: [dagger, rope] });
		expect(table('spells', 'sum')).toEqual({ rows: [dagger, rope] });
	});

	it('releases the guard once the walk is done', () => {
		// The guard is about one walk, not about the sheet: a table read, then
		// read again from an unrelated formula, must not be refused the second
		// time. Memoisation would hide that, so this drives a source that fails
		// to memoise by throwing the first time.
		let attempts = 0;
		const table = buildRowTable([
			{
				id: 'inventory',
				rows: () => {
					attempts++;
					if (attempts === 1) throw new Error('note unreadable');
					return [dagger];
				},
			},
		]);
		expect(() => table('inventory', 'sum')).toThrow();
		expect('rows' in table('inventory', 'sum')).toBe(true);
	});

	it('finds nothing at all where there is no sheet', () => {
		expect(NO_ROWS('inventory', 'sum')).toEqual({
			error: 'There is no table called "inventory" on this sheet. An aggregate names a component by its layout id, which is not the heading shown on its card.',
		});
	});
});
