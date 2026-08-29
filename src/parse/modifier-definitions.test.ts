import { describe, expect, it } from 'vitest';
import { Layout } from './layout';
import { parseModifierDefinitions } from './modifier-definitions';
import { cellParts, parseModifierPart } from './modifier-cell';
import { ModifierTargetSource } from '../formula/modifier-targets';
import { ModifierDefinition } from '../types';

/**
 * A layout publishing `armour_class` and `passive_perception`, only the first of
 * which reads a modifier.
 *
 * The sources rather than the components, because that is the argument this takes
 * and the one every caller already has in hand: whether a name is published, and
 * whether its own formula reads a slot, is a question about the registry, which a
 * pure module may not reach.
 */
const SOURCES: readonly ModifierTargetSource[] = [
	{
		id: 'armour_class',
		label: 'Armour class',
		values: { self: {} },
		formulas: ['10 + abilities.DEX + mod.self'],
	},
	{
		id: 'passive_perception',
		label: 'Passive perception',
		values: { self: {} },
		formulas: ['10 + abilities.WIS'],
	},
	{
		id: 'abilities',
		label: 'Abilities',
		values: { named: { STR: {}, DEX: {} } },
		formulas: ['floor((value - 10) / 2) + mod.self'],
	},
];

const layout = (
	modifiers: unknown[],
	modifierTypes: string[] = ['item', 'status'],
): Layout =>
	({
		name: 'L',
		components: [],
		modifierTypes,
		modifiers,
	}) as unknown as Layout;

/** Every problem's message, joined, for a case that only cares that it fired. */
function said(modifiers: unknown[]): string {
	return parseModifierDefinitions(layout(modifiers), SOURCES)
		.problems.map((problem) => problem.message)
		.join('\n');
}

describe('parseModifierDefinitions: what is usable', () => {
	const good: ModifierDefinition = {
		name: 'Ring of Protection',
		target: 'armour_class',
		amount: '1',
		bonusType: 'item',
	};

	it('has nothing to say about a layout declaring none', () => {
		expect(parseModifierDefinitions(layout([]), SOURCES)).toEqual({
			definitions: [],
			problems: [],
		});
	});

	it('keeps a usable definition, in declaration order, with its target labelled', () => {
		const { definitions, problems } = parseModifierDefinitions(
			layout([good, { name: 'Belt', target: 'abilities.STR', amount: '2' }]),
			SOURCES,
		);
		expect(problems).toEqual([]);
		expect(definitions.map((d) => d.name)).toEqual(['Ring of Protection', 'Belt']);
		// The label is what a popover on the sheet says for the target, since
		// `ModifierContext` no longer carries the accepting set.
		expect(definitions[0]?.targetLabel).toBe('Armour class');
		expect(definitions[1]?.targetLabel).toBe('Abilities · STR');
	});

	it('labels a target that reads no modifier, rather than falling back to its name', () => {
		/*
		 * The case that had the identifier in it. `targetLabel` came from the
		 * *accepting* map alone, and a definition aimed at a value whose own formula
		 * reads no slot is by construction not in that map — so the label fell
		 * through to `passive_perception`, and the sheet's popover quoted a formula
		 * identifier at whoever was holding the character.
		 *
		 * A published name always has a label whether or not anything reads a
		 * modifier for it, which is why `publishedTargets` now carries one. The bare
		 * name is left for a target the layout publishes nothing under, where there
		 * is nothing else it could be called.
		 */
		const { definitions } = parseModifierDefinitions(
			layout([
				{ name: 'Cloak', target: 'passive_perception', amount: '2' },
				{ name: 'Typo', target: 'no_such_value', amount: '2' },
			]),
			SOURCES,
		);
		expect(definitions[0]?.targetLabel).toBe('Passive perception');
		expect(definitions[1]?.targetLabel).toBe('no_such_value');
	});

	it('normalises the operator, so a definition that says nothing adds', () => {
		const { definitions } = parseModifierDefinitions(layout([good]), SOURCES);
		expect(definitions[0]?.operator).toBe('add');
	});

	it('omits a blank bonus type and a blank condition rather than storing them', () => {
		// The `setOptional` discipline read on the parse side: a definition that
		// never set either reads as one that never set either.
		const { definitions } = parseModifierDefinitions(
			layout([{ name: 'Ring', target: 'armour_class', amount: '1' }]),
			SOURCES,
		);
		expect('bonusType' in (definitions[0] ?? {})).toBe(false);
		expect('when' in (definitions[0] ?? {})).toBe(false);
	});

	it('trims every member, so a stray space does not make a second name', () => {
		const { definitions } = parseModifierDefinitions(
			layout([
				{ name: '  Ring  ', target: '  armour_class  ', amount: '  1  ' },
			]),
			SOURCES,
		);
		expect(definitions[0]?.name).toBe('Ring');
		expect(definitions[0]?.target).toBe('armour_class');
	});

	it('reads anything but "override" as an addition, whatever kind it is', () => {
		/*
		 * `operatorOf` in one place rather than four ternaries, and this is the case
		 * the widening is for: a layout file is hand-edited, so `operator` may hold
		 * a number, a capital, or a word nobody declared. An addition of the wrong
		 * size is visible in the breakdown; a silent override replaces a number the
		 * reader can no longer account for, so `add` is the safe direction.
		 */
		for (const operator of ['Override', 'set', 5, true, null] as const) {
			const { definitions } = parseModifierDefinitions(
				layout([
					{ name: 'Ring', target: 'armour_class', amount: '1', operator },
				]),
				SOURCES,
			);
			expect(definitions[0]?.operator, String(operator)).toBe('add');
		}
		// And the one spelling that is not an addition.
		const { definitions } = parseModifierDefinitions(
			layout([
				{
					name: 'Plate',
					target: 'armour_class',
					amount: '18',
					operator: 'override',
				},
			]),
			SOURCES,
		);
		expect(definitions[0]?.operator).toBe('override');
	});

	it('reads a member of the wrong kind as absent rather than throwing', () => {
		// A hand-edited file may hold a number where a name goes: `parseLayout`
		// checked that each entry is an object and nothing more.
		expect(said([{ name: 42, target: 'armour_class', amount: '1' }])).toContain(
			'A modifier needs a name.',
		);
	});
});

describe('parseModifierDefinitions: what is reported', () => {
	it('reports a definition with no name, and drops it', () => {
		const { definitions, problems } = parseModifierDefinitions(
			layout([{ target: 'armour_class', amount: '1' }]),
			SOURCES,
		);
		expect(definitions).toEqual([]);
		expect(problems).toEqual([{ message: 'A modifier needs a name.' }]);
	});

	it('reports a name holding the separator, and drops it', () => {
		/*
		 * A name a cell cannot spell unambiguously is the nameless case's own class
		 * of thing: there is nothing to write in the cell. So it is **dropped as
		 * well as reported** — not merely reported-and-kept, which would work in a
		 * cell naming only it and tear in half the moment a second modifier joined
		 * it. The message names the fix rather than the fault.
		 */
		const { definitions, problems } = parseModifierDefinitions(
			layout([
				{ name: 'Boots; gloves', target: 'armour_class', amount: '1' },
				{ name: 'Ring', target: 'armour_class', amount: '1' },
			]),
			SOURCES,
		);
		expect(definitions.map((d) => d.name)).toEqual(['Ring']);
		expect(problems[0]?.message).toBe(
			'"Boots; gloves" cannot be a name, because a row separates the modifiers it applies with a semicolon. Rename it without one.',
		);
		// The second half, and it is this case's own rather than the assignment
		// case's: a cell holding the name splits on the separator, so neither half
		// names anything the layout declares and both go stray.
		expect(cellParts('Boots; gloves')).toEqual(['Boots', 'gloves']);
		for (const part of cellParts('Boots; gloves')) {
			expect(parseModifierPart(part), part).toEqual({ kind: 'named', name: part });
		}
	});

	it('reports and drops a name that reads as an assignment', () => {
		/*
		 * §6's second unspellable shape, and the one that only exists because a row
		 * can now type its own effect: a cell holding this name would read it as an
		 * effect rather than as a reference, so it is a name no row could ever enrol
		 * in. Dropped as well as reported, on the same argument the `;` case makes.
		 *
		 * **What a row naming it does instead is not the `;` case's answer**, and the
		 * comment here said it was. A `;`-bearing name goes *stray*, because the cell
		 * splits and neither half names anything. This one does not go stray at all —
		 * `readsAsAssignment` is true of it, so the row **applies it as a typed
		 * effect**, which is exactly why the name has to be refused rather than merely
		 * reported: kept, it would be a definition nothing could ever reference and a
		 * cell that quietly did arithmetic instead. `modifier-cell.test.ts` asserts
		 * that half, on the discriminator itself.
		 */
		const { definitions, problems } = parseModifierDefinitions(
			layout([
				{ name: 'armour_class = 18', target: 'armour_class', amount: '1' },
				{ name: 'Ring', target: 'armour_class', amount: '1' },
			]),
			SOURCES,
		);
		expect(definitions.map((d) => d.name)).toEqual(['Ring']);
		expect(problems[0]?.message).toBe(
			'"armour_class = 18" cannot be a name, because a row spells its own modifiers that way. Rename it, or write it as a modifier\'s Changes and Amount instead.',
		);
		// The second half, here rather than by reference: a cell holding this text
		// applies it, which is the whole reason the name cannot stand.
		expect(parseModifierPart('armour_class = 18')).toEqual({
			kind: 'typed',
			effect: { target: 'armour_class', operator: 'override', amount: '18' },
		});
	});

	it('leaves a name that merely carries arithmetic alone', () => {
		/*
		 * **Much narrower than the separator constraint.** The assignment shape is
		 * forbidden only as the whole *start* of a name, so the canonical magic-item
		 * spellings every surveyed system uses are unaffected — which is the whole
		 * reason the discriminator is one name token then an assignment rather than
		 * "anything with an operator in it".
		 */
		const { definitions, problems } = parseModifierDefinitions(
			layout([
				{ name: 'Bracers of Defence +1', target: 'armour_class', amount: '1' },
				{ name: 'Bracers of Armor, Greater', target: 'armour_class', amount: '1' },
				{ name: 'Ring of Protection +2', target: 'armour_class', amount: '1' },
			]),
			SOURCES,
		);
		expect(definitions.map((d) => d.name)).toEqual([
			'Bracers of Defence +1',
			'Bracers of Armor, Greater',
			'Ring of Protection +2',
		]);
		expect(problems).toEqual([]);
	});

	it('reports a name declared twice, keeping the first', () => {
		const { definitions, problems } = parseModifierDefinitions(
			layout([
				{ name: 'Ring', target: 'armour_class', amount: '1' },
				{ name: 'Ring', target: 'armour_class', amount: '9' },
			]),
			SOURCES,
		);
		expect(definitions).toHaveLength(1);
		expect(definitions[0]?.amount).toBe('1');
		expect(problems[0]?.definition).toBe('Ring');
		expect(problems[0]?.message).toContain('declared more than once');
	});

	it('reports a definition with no target', () => {
		expect(said([{ name: 'Ring', amount: '1' }])).toContain('names no value');
	});

	it('reports a target the layout does not publish', () => {
		// A typo, or a component renamed. The fix is in this cell.
		expect(
			said([{ name: 'Amulet', target: 'armor_class', amount: '1' }]),
		).toContain('publishes no value under');
	});

	it('reports a target whose own formula reads no modifier', () => {
		// dnd5e#3900 caught in the editor, complete rather than half of it, and
		// with the fix in the message.
		const message = said([
			{ name: 'Cloak of Displacement', target: 'passive_perception', amount: '2' },
		]);
		expect(message).toContain('reads no modifier');
		expect(message).toContain('+ mod.self');
	});

	it('keeps a definition whose target is reported, because the row is not wrong', () => {
		// A target that reads no modifier is a formula to edit somewhere else, so
		// the picker still offers the definition and the row still enrols in it.
		const { definitions } = parseModifierDefinitions(
			layout([{ name: 'Cloak', target: 'passive_perception', amount: '2' }]),
			SOURCES,
		);
		expect(definitions.map((d) => d.name)).toEqual(['Cloak']);
	});

	it('reports a missing amount and an unparseable one differently', () => {
		expect(said([{ name: 'Ring', target: 'armour_class' }])).toContain(
			'has no amount',
		);
		expect(
			said([{ name: 'Ring', target: 'armour_class', amount: '1 +' }]),
		).toContain('is not an expression');
	});

	it('reports a condition that will not parse', () => {
		expect(
			said([
				{ name: 'Cloak', target: 'armour_class', amount: '1', when: 'Worn &&' },
			]),
		).toContain('has a condition that is not an expression');
	});

	it('says nothing about a blank condition, which means always', () => {
		expect(
			said([{ name: 'Ring', target: 'armour_class', amount: '1', when: '   ' }]),
		).toBe('');
	});

	it('reports a bonus type on a definition that sets a value', () => {
		// Ignored in the arithmetic rather than refused, because overrides do not
		// contest by type — and the message says which of the two fixes to take.
		const message = said([
			{
				name: 'Plate',
				target: 'armour_class',
				operator: 'override',
				amount: '18',
				bonusType: 'item',
			},
		]);
		expect(message).toContain('bonus type "item" is ignored');
		expect(message).toContain('add to the value instead');
	});

	it('leaves the undeclared-bonus-type problem to the bonus types field', () => {
		// The shipped check with its input moved, reported where the vocabulary is
		// kept rather than in both places (`docs/UI.md` §9).
		expect(
			said([
				{
					name: 'Ring',
					target: 'armour_class',
					amount: '1',
					bonusType: 'circumstance',
				},
			]),
		).toBe('');
	});

	it('goes on reporting every definition after a bad one', () => {
		// One typo must not stop the list being read, which is the whole of the
		// shape-refuses / contents-are-reported split.
		const { definitions, problems } = parseModifierDefinitions(
			layout([
				{ name: '' },
				{ name: 'Ring', target: 'armour_class', amount: '1' },
				{ name: 'Belt', target: 'nowhere', amount: '2' },
			]),
			SOURCES,
		);
		expect(definitions.map((d) => d.name)).toEqual(['Ring', 'Belt']);
		expect(problems).toHaveLength(2);
	});

	it('reports every target where it is handed no sources', () => {
		/*
		 * Not reachable by accident any more — the argument is required — and stated
		 * as a case because it is *why* it is required. With no sources both name
		 * sets are empty, so a correct definition earns "this layout publishes no
		 * value under it": the answer is confident and wrong, which is worse than
		 * an absent check.
		 */
		expect(
			parseModifierDefinitions(
				layout([{ name: 'Ring', target: 'armour_class', amount: '1' }]),
				[],
			).problems,
		).toHaveLength(1);
	});
});
