/*
 * One enrolment resolved on its row, driven directly.
 *
 * Its own file rather than cases inside `modifiers.test.ts`, on §10's rule that a
 * module with two consumers is held to what *it* answers rather than to what one
 * caller makes of the answer: the slot table asks in order to build a number and
 * the modifier cell asks in order to draw a glyph, and the four outcomes below are
 * the whole of what they share.
 */

import { describe, expect, it } from 'vitest';
import { parseFunctions } from './functions';
import {
	definitionTable,
	Enrolment,
	resolveEnrolments,
} from './modifier-definitions';
import { definitionView } from '../test/modifier-views';
import { parseModifierDefinitions } from '../parse/modifier-definitions';
import { RowValues } from '../types';
import { Scope } from './expression';

/** A definition as the layout declares one, with a label for its target. */
const define = definitionView;

/**
 * The one enrolment a part naming a one-change definition resolves to.
 *
 * Every case below but the ones about a definition naming several is about a
 * part that moves exactly one value, and spelling `[0]` at forty call sites would
 * bury the cases that are about the list itself. It asserts the length rather
 * than indexing blind, so a part that quietly started resolving to two fails
 * here.
 */
function only(...args: Parameters<typeof resolveEnrolments>): Enrolment {
	const found = resolveEnrolments(...args);
	expect(found).toHaveLength(1);
	return found[0] as Enrolment;
}

const DEFINITIONS = definitionTable([
	define({
		name: 'Belt',
		target: 'abilities.STR',
		amount: '2',
		bonusType: 'item',
	}),
	define({
		name: 'Cloak',
		target: 'armour_class',
		amount: '1',
		bonusType: 'item',
		when: 'Worn',
	}),
	define({
		name: 'Plate',
		target: 'armour_class',
		operator: 'override',
		amount: '18',
		bonusType: 'item',
	}),
	define({ name: 'Charge', target: 'spell_bonus', amount: 'Charges * 2' }),
	define({ name: 'Level', target: 'attack', amount: 'prof(level)' }),
	define({ name: 'Nothing', target: 'armour_class', amount: '' }),
]);

function row(
	label: string,
	values: Record<string, string | number | boolean> = {},
): RowValues {
	return { label, values };
}

describe('resolveEnrolments', () => {
	it('says nothing at all where the layout declares no such definition', () => {
		// The stray reference: rendered, not corrected, and reported at the row.
		expect(only(DEFINITIONS, 'Ring of Nonexistence', row('X'), {})).toEqual(
			{ kind: 'unknown' },
		);
	});

	it('reads a row naming a dropped definition as a stray', () => {
		/*
		 * The other half of the `;`-in-a-name rule, and the half that is on a sheet
		 * rather than in the editor: a definition whose name holds the separator is
		 * dropped by `parseModifierDefinitions`, so it is not in this table, so a
		 * row already naming it reads exactly as any other stray — carried,
		 * rendered, and not corrected. Driven through the real parser rather than
		 * asserted about it, because "dropped" and "reads as a stray" are two
		 * modules' worth of behaviour and only the pair is the rule.
		 */
		const parsed = parseModifierDefinitions(
			{
				name: 'L',
				components: [],
				modifiers: [
					{
						name: 'Boots; gloves',
						target: 'armour_class',
						amount: '1',
					},
				],
			},
			[
				{
					id: 'armour_class',
					label: 'Armour class',
					values: { self: {} },
					formulas: ['10 + mod.self'],
				},
			],
		);
		expect(parsed.definitions).toEqual([]);
		expect(
			only(
				definitionTable(parsed.definitions),
				'Boots; gloves',
				row('Boots'),
				{},
			),
		).toEqual({ kind: 'unknown' });
	});

	it('matches the stored name byte for byte on the trimmed value', () => {
		// §4.2's rule for a Card's stored option, read on a fourth control: the
		// trim is on the cell's side, and a near miss is a stray rather than a
		// spelling the sheet corrects.
		expect(only(DEFINITIONS, '  Belt  ', row('X'), {}).kind).toBe(
			'applies',
		);
		expect(only(DEFINITIONS, 'belt', row('X'), {}).kind).toBe('unknown');
	});

	it('resolves an unconditional definition into a contribution', () => {
		const found = only(DEFINITIONS, 'Belt', row('Belt'), {});
		expect(found.kind === 'applies' ? found.contribution : null).toEqual({
			target: 'abilities.STR',
			operator: 'add',
			type: 'item',
			// A definition saying nothing about a phase lands in the value phase,
			// which is what every modifier written before phases existed is.
			applies: 'value',
			amount: 2,
		});
		expect(found.kind === 'applies' ? found.conditional : null).toBe(false);
	});

	it("drops an override's bonus type, because overrides do not contest by type", () => {
		const found = only(DEFINITIONS, 'Plate', row('Plate armour'), {});
		expect(
			found.kind === 'applies' ? found.contribution.type : 'set',
		).toBeNull();
		expect(
			found.kind === 'applies' ? found.contribution.operator : null,
		).toBe('override');
	});

	it("reads the condition off the enrolling row's own cells", () => {
		const worn = only(
			DEFINITIONS,
			'Cloak',
			row('Cloak', { Worn: true }),
			{},
		);
		expect(worn.kind).toBe('applies');
		expect(worn.kind === 'applies' ? worn.conditional : null).toBe(true);
		const stowed = only(
			DEFINITIONS,
			'Cloak',
			row('Cloak', { Worn: false }),
			{},
		);
		expect(stowed.kind).toBe('inactive');
		// And the amount comes back anyway, so the popover can say what the row
		// *would* do rather than going quiet about a stowed item.
		expect(stowed.kind === 'inactive' ? stowed.amount : null).toBe(1);
	});

	it('reads a blank cell and a zero as false, which is what an unfilled flag is', () => {
		for (const value of ['', 0]) {
			expect(
				only(DEFINITIONS, 'Cloak', row('Cloak', { Worn: value }), {})
					.kind,
			).toBe('inactive');
		}
	});

	it("takes the row's names in preference to the sheet's", () => {
		// The row wins, which is what makes `Worn` mean this row's cell rather than
		// some component that happens to publish the name — the same way a
		// component's own data shadows the sheet in `fieldReaders`.
		const base: Scope = (name) => (name === 'Worn' ? true : undefined);
		expect(
			only(DEFINITIONS, 'Cloak', row('Cloak', { Worn: false }), { base })
				.kind,
		).toBe('inactive');
		// And falls through to the sheet where the row says nothing.
		expect(only(DEFINITIONS, 'Cloak', row('Cloak'), { base }).kind).toBe(
			'applies',
		);
	});

	it("evaluates the amount in the row's scope, so two rows differ", () => {
		const wand = only(
			DEFINITIONS,
			'Charge',
			row('Wand', { Charges: 3 }),
			{},
		);
		const staff = only(
			DEFINITIONS,
			'Charge',
			row('Staff', { Charges: 5 }),
			{},
		);
		expect(wand.kind === 'applies' ? wand.contribution.amount : null).toBe(
			6,
		);
		expect(
			staff.kind === 'applies' ? staff.contribution.amount : null,
		).toBe(10);
	});

	it("may call the layout's own functions", () => {
		// The library reaches a definition's amount exactly as it reaches every
		// other formula on the sheet, through `callsFrom`.
		const { library } = parseFunctions([
			'prof(level) = ceil(level / 4) + 1',
		]);
		const found = only(DEFINITIONS, 'Level', row('Weapon', { level: 5 }), {
			library,
		});
		expect(
			found.kind === 'applies' ? found.contribution.amount : null,
		).toBe(3);
	});

	it('reports an amount that will not resolve, with the reason', () => {
		const found = only(DEFINITIONS, 'Charge', row('Wand'), {});
		expect(found.kind).toBe('unreadable');
		expect(found.kind === 'unreadable' ? found.reason : '').toContain(
			'Unknown name "Charges"',
		);
	});

	it('reports an amount that is not a number, naming the definition', () => {
		const table = definitionTable([
			define({ name: 'Named', target: 'x', amount: 'Worn' }),
		]);
		const found = only(table, 'Named', row('A row', { Worn: true }), {});
		expect(found.kind === 'unreadable' ? found.reason : '').toBe(
			'"true" is not a number, so the modifier "Named" has no amount.',
		);
	});

	it('reports a definition with no amount at all', () => {
		const found = only(DEFINITIONS, 'Nothing', row('A row'), {});
		expect(found.kind === 'unreadable' ? found.reason : '').toBe(
			'the modifier "Nothing" has no amount.',
		);
	});

	it('reports a condition that will not resolve, before reading the amount', () => {
		const table = definitionTable([
			define({
				name: 'Bad',
				target: 'x',
				amount: '1',
				when: 'Attuned &&',
			}),
		]);
		const found = only(table, 'Bad', row('A row'), {});
		expect(found.kind).toBe('unreadable');
	});
});

describe('resolveEnrolments over a part the row typed itself', () => {
	/*
	 * The second tier through the same function, which is the property to keep:
	 * once the part is read, **nothing here differs by tier.** The condition is the
	 * same mechanism in the same scope, the amount is evaluated the same way, and a
	 * typed override carries no bonus type for the same reason a named one does not.
	 *
	 * What *does* differ is exactly two things: which of `definition` and `typed` is
	 * set, and what a blank amount means.
	 */
	it('resolves an assignment into the same contribution a definition gives', () => {
		const typed = only(
			DEFINITIONS,
			'abilities.STR += 2 as item',
			row('A row'),
			{},
		);
		const named = only(DEFINITIONS, 'Belt', row('A row'), {});
		expect(typed.kind === 'applies' ? typed.contribution : null).toEqual(
			named.kind === 'applies' ? named.contribution : undefined,
		);
		// And only the tier differs: a typed part carries the effect and no name.
		expect(typed.kind === 'applies' ? typed.definition : 'set').toBeNull();
		expect(typed.kind === 'applies' ? typed.typed?.target : null).toBe(
			'abilities.STR',
		);
	});

	it("drops a typed override's bonus type, exactly as a definition's is dropped", () => {
		const found = only(
			DEFINITIONS,
			'armour_class = 18 as item',
			row('A row'),
			{},
		);
		expect(
			found.kind === 'applies' ? found.contribution.type : 'set',
		).toBeNull();
		expect(
			found.kind === 'applies' ? found.contribution.operator : null,
		).toBe('override');
	});

	it('reads a typed condition off the row, in the same scope', () => {
		const worn = only(
			DEFINITIONS,
			'armour_class += 1 when Worn',
			row('A row', { Worn: true }),
			{},
		);
		expect(worn.kind).toBe('applies');
		const stowed = only(
			DEFINITIONS,
			'armour_class += 1 when Worn',
			row('A row', { Worn: false }),
			{},
		);
		expect(stowed.kind).toBe('inactive');
	});

	it("evaluates a typed amount in the row's scope, so two rows differ", () => {
		const two = only(
			DEFINITIONS,
			'spell_bonus += Charges * 2',
			row('Two', { Charges: 2 }),
			{},
		);
		const three = only(
			DEFINITIONS,
			'spell_bonus += Charges * 2',
			row('Three', { Charges: 3 }),
			{},
		);
		expect(two.kind === 'applies' ? two.contribution.amount : null).toBe(4);
		expect(
			three.kind === 'applies' ? three.contribution.amount : null,
		).toBe(6);
	});

	it('is unfinished with no amount, where a definition with none is unreadable', () => {
		/*
		 * **The one place the two tiers deliberately differ, and it is the honest way
		 * round.** A definition with no amount is a layout problem the author owns, so
		 * it refuses the slot and is reported in the editor; an unfinished cell is the
		 * reader's own half-written text, so it changes nothing and refuses nothing.
		 * The tier whose text lives in the note is the tier whose text can be
		 * half-written — and this is what makes the form safe to commit per field.
		 */
		const typed = only(DEFINITIONS, 'armour_class +=', row('A row'), {});
		expect(typed.kind).toBe('unfinished');
		expect(typed.kind === 'unfinished' ? typed.fields.target : null).toBe(
			'armour_class',
		);
		const named = only(DEFINITIONS, 'Nothing', row('A row'), {});
		expect(named.kind).toBe('unreadable');
	});

	it('names no definition when a typed amount will not resolve', () => {
		// A typed effect has no name (§7's edge), so the reason is spelled by what it
		// is rather than by a name it does not have.
		const found = only(
			DEFINITIONS,
			'armour_class += ability',
			row('A row'),
			{},
		);
		expect(found.kind === 'unreadable' ? found.reason : '').toBe(
			'Unknown name "ability".',
		);
		const notNumeric = only(
			DEFINITIONS,
			'armour_class += Worn',
			row('A row', { Worn: true }),
			{},
		);
		expect(notNumeric.kind === 'unreadable' ? notNumeric.reason : '').toBe(
			'"true" is not a number, so this row\'s own modifier has no amount.',
		);
	});

	it('reads a comparison as a stray name rather than as an effect', () => {
		// The negative lookahead, at the seam where it matters: a mistake the reader
		// can see, rather than an effect nothing can resolve.
		expect(
			only(DEFINITIONS, 'armour_class == 2', row('A row'), {}).kind,
		).toBe('unknown');
	});
});

/*
 * A part naming a definition that moves several values
 * (`docs/features/multi-change-definitions.md`).
 *
 * One part in, one enrolment per change out — which is the whole of what this
 * module gained, and is why the count is asserted at every case rather than left
 * to the first index.
 */
describe('resolveEnrolments over a definition naming several changes', () => {
	const table = definitionTable([
		define({
			name: 'Ring of Protection',
			when: 'Worn',
			changes: [
				{
					target: 'armour_class',
					amount: '1',
					bonusType: 'deflection',
				},
				{
					target: 'saving_throws',
					amount: '1',
					bonusType: 'deflection',
				},
			],
		}),
		define({
			name: 'Half',
			changes: [
				{ target: 'armour_class', amount: '1' },
				{ target: 'saving_throws', amount: 'no_such_name' },
			],
		}),
	]);

	it("pushes one enrolment per change, at each change's own target", () => {
		const found = resolveEnrolments(
			table,
			'Ring of Protection',
			row('Ring', { Worn: true }),
			{},
		);
		expect(found.map((one) => one.kind)).toEqual(['applies', 'applies']);
		expect(
			found.map((one) =>
				one.kind === 'applies'
					? [
							one.contribution.target,
							one.contribution.amount,
							one.contribution.type,
						]
					: null,
			),
		).toEqual([
			['armour_class', 1, 'deflection'],
			['saving_throws', 1, 'deflection'],
		]);
	});

	it("a definition's condition governs every change it names, and is read once", () => {
		/*
		 * **Counted rather than inferred**, which is the half a verdict shared
		 * between changes needs and the case below cannot give: two `inactive`
		 * enrolments are what a per-change evaluation produces too, so only the
		 * number of evaluations tells the two implementations apart. `Blessed` is
		 * not one of the row's own cells, so it resolves through `base` and the
		 * counter sees every read of it.
		 */
		let reads = 0;
		const base = (name: string) => {
			if (name !== 'Blessed') return undefined;
			reads++;
			return true;
		};
		const counted = definitionTable([
			define({
				name: 'Blessing',
				when: 'Blessed',
				changes: [
					{ target: 'armour_class', amount: '1' },
					{ target: 'saving_throws', amount: '1' },
					{ target: 'abilities.STR', amount: '1' },
				],
			}),
		]);
		const found = resolveEnrolments(counted, 'Blessing', row('A row'), { base });
		expect(found.map((one) => one.kind)).toEqual([
			'applies',
			'applies',
			'applies',
		]);
		// One `when`, one evaluation, one verdict — whatever the change count.
		expect(reads).toBe(1);
	});

	it('switches off every change where that one condition is false', () => {
		/*
		 * Sub-question 1 made mechanical. The definition is on or off and every
		 * change moves together — so a stowed ring gives two `inactive` enrolments
		 * with one verdict behind them, rather than two evaluations that could in
		 * principle disagree.
		 */
		const stowed = resolveEnrolments(
			table,
			'Ring of Protection',
			row('Ring', { Worn: false }),
			{},
		);
		expect(stowed.map((one) => one.kind)).toEqual(['inactive', 'inactive']);
		// The amount is still read, tolerantly, so the form can say what it would do.
		expect(
			stowed.map((one) => (one.kind === 'inactive' ? one.amount : null)),
		).toEqual([1, 1]);
	});

	it('carries the definition and the change it is, on every enrolment', () => {
		const found = resolveEnrolments(
			table,
			'Ring of Protection',
			row('Ring', { Worn: true }),
			{},
		);
		// The tier is the definition's and the arithmetic is the change's, which is
		// what lets a surface read an operator off a part without asking which of a
		// definition's values it meant.
		expect(
			found.map((one) =>
				'definition' in one ? one.definition?.name : null,
			),
		).toEqual(['Ring of Protection', 'Ring of Protection']);
		expect(
			found.map((one) => ('change' in one ? one.change?.target : null)),
		).toEqual(['armour_class', 'saving_throws']);
	});

	it('refuses only its own change where one amount will not resolve', () => {
		/*
		 * Refusing every target a definition names because one of its amounts is
		 * broken would blank an unrelated card, which is the same failure the
		 * condition-before-amount ordering already exists to prevent. The cost is
		 * that a definition can be half-applying, and what names it is the editor's
		 * report, which is per change.
		 */
		const found = resolveEnrolments(table, 'Half', row('A row'), {});
		expect(found.map((one) => one.kind)).toEqual(['applies', 'unreadable']);
		expect(found[1]?.kind === 'unreadable' ? found[1].reason : '').toBe(
			'Unknown name "no_such_name".',
		);
	});

	it('gives one enrolment for a definition that names no value, never none', () => {
		// The form's line for it has to say what it *would* do, so the part still
		// resolves to something with a blank target rather than to nothing.
		const empty = definitionTable([define({ name: 'Blank', changes: [] })]);
		const found = resolveEnrolments(empty, 'Blank', row('A row'), {});
		expect(found).toHaveLength(1);
		expect(
			found[0]?.kind === 'unreadable' ? found[0].fields.target : null,
		).toBe('');
	});
});
