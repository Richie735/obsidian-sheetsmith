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
	resolveEnrolment,
} from './modifier-definitions';
import { parseModifierDefinitions } from '../parse/modifier-definitions';
import { ModifierDefinition, ModifierDefinitionView, RowValues } from '../types';
import { Scope } from './expression';

/** A definition as the layout declares one, with a label for its target. */
function define(definition: ModifierDefinition): ModifierDefinitionView {
	return { ...definition, targetLabel: definition.target };
}

const DEFINITIONS = definitionTable([
	define({ name: 'Belt', target: 'abilities.STR', amount: '2', bonusType: 'item' }),
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

describe('resolveEnrolment', () => {
	it('says nothing at all where the layout declares no such definition', () => {
		// The stray reference: rendered, not corrected, and reported at the row.
		expect(resolveEnrolment(DEFINITIONS, 'Ring of Nonexistence', row('X'), {})).toEqual(
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
					{ name: 'Boots; gloves', target: 'armour_class', amount: '1' },
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
			resolveEnrolment(
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
		expect(resolveEnrolment(DEFINITIONS, '  Belt  ', row('X'), {}).kind).toBe(
			'applies',
		);
		expect(resolveEnrolment(DEFINITIONS, 'belt', row('X'), {}).kind).toBe('unknown');
	});

	it('resolves an unconditional definition into a contribution', () => {
		const found = resolveEnrolment(DEFINITIONS, 'Belt', row('Belt'), {});
		expect(found.kind === 'applies' ? found.contribution : null).toEqual({
			target: 'abilities.STR',
			operator: 'add',
			type: 'item',
			amount: 2,
		});
		expect(found.kind === 'applies' ? found.conditional : null).toBe(false);
	});

	it('drops an override\'s bonus type, because overrides do not contest by type', () => {
		const found = resolveEnrolment(DEFINITIONS, 'Plate', row('Plate armour'), {});
		expect(found.kind === 'applies' ? found.contribution.type : 'set').toBeNull();
		expect(found.kind === 'applies' ? found.contribution.operator : null).toBe(
			'override',
		);
	});

	it('reads the condition off the enrolling row\'s own cells', () => {
		const worn = resolveEnrolment(DEFINITIONS, 'Cloak', row('Cloak', { Worn: true }), {});
		expect(worn.kind).toBe('applies');
		expect(worn.kind === 'applies' ? worn.conditional : null).toBe(true);
		const stowed = resolveEnrolment(
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
				resolveEnrolment(DEFINITIONS, 'Cloak', row('Cloak', { Worn: value }), {}).kind,
			).toBe('inactive');
		}
	});

	it('takes the row\'s names in preference to the sheet\'s', () => {
		// The row wins, which is what makes `Worn` mean this row's cell rather than
		// some component that happens to publish the name — the same way a
		// component's own data shadows the sheet in `fieldReaders`.
		const base: Scope = (name) => (name === 'Worn' ? true : undefined);
		expect(
			resolveEnrolment(DEFINITIONS, 'Cloak', row('Cloak', { Worn: false }), { base })
				.kind,
		).toBe('inactive');
		// And falls through to the sheet where the row says nothing.
		expect(resolveEnrolment(DEFINITIONS, 'Cloak', row('Cloak'), { base }).kind).toBe(
			'applies',
		);
	});

	it('evaluates the amount in the row\'s scope, so two rows differ', () => {
		const wand = resolveEnrolment(DEFINITIONS, 'Charge', row('Wand', { Charges: 3 }), {});
		const staff = resolveEnrolment(
			DEFINITIONS,
			'Charge',
			row('Staff', { Charges: 5 }),
			{},
		);
		expect(wand.kind === 'applies' ? wand.contribution.amount : null).toBe(6);
		expect(staff.kind === 'applies' ? staff.contribution.amount : null).toBe(10);
	});

	it('may call the layout\'s own functions', () => {
		// The library reaches a definition's amount exactly as it reaches every
		// other formula on the sheet, through `callsFrom`.
		const { library } = parseFunctions(['prof(level) = ceil(level / 4) + 1']);
		const found = resolveEnrolment(
			DEFINITIONS,
			'Level',
			row('Weapon', { level: 5 }),
			{ library },
		);
		expect(found.kind === 'applies' ? found.contribution.amount : null).toBe(3);
	});

	it('reports an amount that will not resolve, with the reason', () => {
		const found = resolveEnrolment(DEFINITIONS, 'Charge', row('Wand'), {});
		expect(found.kind).toBe('unreadable');
		expect(found.kind === 'unreadable' ? found.reason : '').toContain(
			'Unknown name "Charges"',
		);
	});

	it('reports an amount that is not a number, naming the definition', () => {
		const table = definitionTable([
			define({ name: 'Named', target: 'x', amount: 'Worn' }),
		]);
		const found = resolveEnrolment(table, 'Named', row('A row', { Worn: true }), {});
		expect(found.kind === 'unreadable' ? found.reason : '').toBe(
			'"true" is not a number, so the modifier "Named" has no amount.',
		);
	});

	it('reports a definition with no amount at all', () => {
		const found = resolveEnrolment(DEFINITIONS, 'Nothing', row('A row'), {});
		expect(found.kind === 'unreadable' ? found.reason : '').toBe(
			'the modifier "Nothing" has no amount.',
		);
	});

	it('reports a condition that will not resolve, before reading the amount', () => {
		const table = definitionTable([
			define({ name: 'Bad', target: 'x', amount: '1', when: 'Attuned &&' }),
		]);
		const found = resolveEnrolment(table, 'Bad', row('A row'), {});
		expect(found.kind).toBe('unreadable');
	});
});

describe('resolveEnrolment over a part the row typed itself', () => {
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
		const typed = resolveEnrolment(
			DEFINITIONS,
			'abilities.STR += 2 as item',
			row('A row'),
			{},
		);
		const named = resolveEnrolment(DEFINITIONS, 'Belt', row('A row'), {});
		expect(typed.kind === 'applies' ? typed.contribution : null).toEqual(
			named.kind === 'applies' ? named.contribution : undefined,
		);
		// And only the tier differs: a typed part carries the effect and no name.
		expect(typed.kind === 'applies' ? typed.definition : 'set').toBeNull();
		expect(typed.kind === 'applies' ? typed.typed?.target : null).toBe(
			'abilities.STR',
		);
	});

	it('drops a typed override\'s bonus type, exactly as a definition\'s is dropped', () => {
		const found = resolveEnrolment(
			DEFINITIONS,
			'armour_class = 18 as item',
			row('A row'),
			{},
		);
		expect(found.kind === 'applies' ? found.contribution.type : 'set').toBeNull();
		expect(found.kind === 'applies' ? found.contribution.operator : null).toBe(
			'override',
		);
	});

	it('reads a typed condition off the row, in the same scope', () => {
		const worn = resolveEnrolment(
			DEFINITIONS,
			'armour_class += 1 when Worn',
			row('A row', { Worn: true }),
			{},
		);
		expect(worn.kind).toBe('applies');
		const stowed = resolveEnrolment(
			DEFINITIONS,
			'armour_class += 1 when Worn',
			row('A row', { Worn: false }),
			{},
		);
		expect(stowed.kind).toBe('inactive');
	});

	it('evaluates a typed amount in the row\'s scope, so two rows differ', () => {
		const two = resolveEnrolment(
			DEFINITIONS,
			'spell_bonus += Charges * 2',
			row('Two', { Charges: 2 }),
			{},
		);
		const three = resolveEnrolment(
			DEFINITIONS,
			'spell_bonus += Charges * 2',
			row('Three', { Charges: 3 }),
			{},
		);
		expect(two.kind === 'applies' ? two.contribution.amount : null).toBe(4);
		expect(three.kind === 'applies' ? three.contribution.amount : null).toBe(6);
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
		const typed = resolveEnrolment(DEFINITIONS, 'armour_class +=', row('A row'), {});
		expect(typed.kind).toBe('unfinished');
		expect(typed.kind === 'unfinished' ? typed.fields.target : null).toBe(
			'armour_class',
		);
		const named = resolveEnrolment(DEFINITIONS, 'Nothing', row('A row'), {});
		expect(named.kind).toBe('unreadable');
	});

	it('names no definition when a typed amount will not resolve', () => {
		// A typed effect has no name (§7's edge), so the reason is spelled by what it
		// is rather than by a name it does not have.
		const found = resolveEnrolment(
			DEFINITIONS,
			'armour_class += ability',
			row('A row'),
			{},
		);
		expect(found.kind === 'unreadable' ? found.reason : '').toBe(
			'Unknown name "ability".',
		);
		const notNumeric = resolveEnrolment(
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
			resolveEnrolment(DEFINITIONS, 'armour_class == 2', row('A row'), {}).kind,
		).toBe('unknown');
	});
});
