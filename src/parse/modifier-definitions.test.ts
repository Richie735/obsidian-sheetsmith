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
			layout([
				good,
				{ name: 'Belt', target: 'abilities.STR', amount: '2' },
			]),
			SOURCES,
		);
		expect(problems).toEqual([]);
		expect(definitions.map((d) => d.name)).toEqual([
			'Ring of Protection',
			'Belt',
		]);
		// The label is what a popover on the sheet says for the target, since
		// `ModifierContext` no longer carries the accepting set.
		expect(definitions[0]?.changes[0]?.targetLabel).toBe('Armour class');
		expect(definitions[1]?.changes[0]?.targetLabel).toBe('Abilities · STR');
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
		expect(definitions[0]?.changes[0]?.targetLabel).toBe(
			'Passive perception',
		);
		expect(definitions[1]?.changes[0]?.targetLabel).toBe('no_such_value');
	});

	it('normalises the operator, so a definition that says nothing adds', () => {
		const { definitions } = parseModifierDefinitions(
			layout([good]),
			SOURCES,
		);
		expect(definitions[0]?.changes[0]?.operator).toBe('add');
	});

	it('omits a blank bonus type and a blank condition rather than storing them', () => {
		// The `setOptional` discipline read on the parse side: a definition that
		// never set either reads as one that never set either.
		const { definitions } = parseModifierDefinitions(
			layout([{ name: 'Ring', target: 'armour_class', amount: '1' }]),
			SOURCES,
		);
		expect('bonusType' in (definitions[0]?.changes[0] ?? {})).toBe(false);
		expect('when' in (definitions[0] ?? {})).toBe(false);
	});

	it('trims every member, so a stray space does not make a second name', () => {
		const { definitions } = parseModifierDefinitions(
			layout([
				{
					name: '  Ring  ',
					target: '  armour_class  ',
					amount: '  1  ',
				},
			]),
			SOURCES,
		);
		expect(definitions[0]?.name).toBe('Ring');
		expect(definitions[0]?.changes[0]?.target).toBe('armour_class');
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
					{
						name: 'Ring',
						target: 'armour_class',
						amount: '1',
						operator,
					},
				]),
				SOURCES,
			);
			expect(definitions[0]?.changes[0]?.operator, String(operator)).toBe(
				'add',
			);
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
		expect(definitions[0]?.changes[0]?.operator).toBe('override');
	});

	it('reads anything but "result" as the value phase, whatever kind it is', () => {
		/*
		 * **`operatorOf`'s case one field over, and this predicate carries more.**
		 * It *is* the backward-compatibility guarantee: every modifier in every
		 * layout written before the phase existed says nothing about one, and all of
		 * them must go on meaning what `mod.self` has always meant. So the default
		 * points the safe way — a hand-edited typo leaves the modifier doing what it
		 * did rather than silently moving it onto a number the author never aimed at
		 * — and it is reported rather than swallowed.
		 *
		 * Written out here because `phaseOf` is `types.ts`' and has no file of its
		 * own, on §10's shared-vocabulary exception: it is driven through the
		 * consumers that speak it, and this is the one that meets free text.
		 */
		for (const applies of [
			'Result',
			'sideways',
			'values',
			7,
			true,
			null,
		] as const) {
			const { definitions } = parseModifierDefinitions(
				layout([
					{
						name: 'Ring',
						target: 'armour_class',
						amount: '1',
						applies,
					},
				]),
				SOURCES,
			);
			// Absent, not `"value"`: the default is the missing key, which is what
			// keeps a layout written before phases existed byte-identical.
			expect(
				definitions[0]?.changes[0],
				String(applies),
			).not.toHaveProperty('applies');
		}
		// The one spelling that is not the value phase, and it survives a trim,
		// because the parser reads the key trimmed and `phaseOf` must agree with it.
		for (const applies of ['result', '  result  ']) {
			const { definitions } = parseModifierDefinitions(
				layout([
					{
						name: 'Ring',
						target: 'armour_class',
						amount: '1',
						applies,
					},
				]),
				SOURCES,
			);
			expect(definitions[0]?.changes[0]?.applies, applies).toBe('result');
		}
	});

	it('reports a phase it could not read, rather than silently defaulting it', () => {
		// Rendered, not corrected: the layout file keeps whatever was typed and the
		// author is told what it did instead.
		expect(
			said([
				{
					name: 'Ring',
					target: 'armour_class',
					amount: '1',
					applies: 'sideways',
				},
			]),
		).toContain('applies to "sideways", which is not a phase');
	});

	it('drops a phase stored beside an override, and says why', () => {
		/*
		 * An override replaces the published number, which *is* the result phase, so
		 * a phase beside one would be a second spelling for one behaviour. Dropped
		 * from what the sheet reads and reported to the author — who can now act on
		 * it, since the operator's own change handler clears the key.
		 */
		const { definitions } = parseModifierDefinitions(
			layout([
				{
					name: 'Plate',
					target: 'armour_class',
					amount: '18',
					operator: 'override',
					applies: 'result',
				},
			]),
			SOURCES,
		);
		expect(definitions[0]?.changes[0]).not.toHaveProperty('applies');
		expect(
			said([
				{
					name: 'Plate',
					target: 'armour_class',
					amount: '18',
					operator: 'override',
					applies: 'result',
				},
			]),
		).toContain('so it always applies to the result');
	});

	it('reads a member of the wrong kind as absent rather than throwing', () => {
		// A hand-edited file may hold a number where a name goes: `parseLayout`
		// checked that each entry is an object and nothing more.
		expect(
			said([{ name: 42, target: 'armour_class', amount: '1' }]),
		).toContain('A modifier needs a name.');
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
			expect(parseModifierPart(part), part).toEqual({
				kind: 'named',
				name: part,
			});
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
				{
					name: 'armour_class = 18',
					target: 'armour_class',
					amount: '1',
				},
				{ name: 'Ring', target: 'armour_class', amount: '1' },
			]),
			SOURCES,
		);
		expect(definitions.map((d) => d.name)).toEqual(['Ring']);
		expect(problems[0]?.message).toBe(
			'"armour_class = 18" cannot be a name, because a row spells its own modifiers that way. Rename it, or write it as a modifier\'s Value and Amount instead.',
		);
		// The second half, here rather than by reference: a cell holding this text
		// applies it, which is the whole reason the name cannot stand.
		expect(parseModifierPart('armour_class = 18')).toEqual({
			kind: 'typed',
			effect: {
				target: 'armour_class',
				operator: 'override',
				amount: '18',
			},
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
				{
					name: 'Bracers of Defence +1',
					target: 'armour_class',
					amount: '1',
				},
				{
					name: 'Bracers of Armor, Greater',
					target: 'armour_class',
					amount: '1',
				},
				{
					name: 'Ring of Protection +2',
					target: 'armour_class',
					amount: '1',
				},
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
		expect(definitions[0]?.changes[0]?.amount).toBe('1');
		expect(problems[0]?.definition).toBe('Ring');
		expect(problems[0]?.message).toContain('declared more than once');
	});

	it('reports a definition with no target', () => {
		expect(said([{ name: 'Ring', amount: '1' }])).toContain(
			'names no value',
		);
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
			{
				name: 'Cloak of Displacement',
				target: 'passive_perception',
				amount: '2',
			},
		]);
		expect(message).toContain('reads no modifier');
		expect(message).toContain('+ mod.self');
	});

	it('keeps a definition whose target is reported, because the row is not wrong', () => {
		// A target that reads no modifier is a formula to edit somewhere else, so
		// the picker still offers the definition and the row still enrols in it.
		const { definitions } = parseModifierDefinitions(
			layout([
				{ name: 'Cloak', target: 'passive_perception', amount: '2' },
			]),
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
				{
					name: 'Cloak',
					target: 'armour_class',
					amount: '1',
					when: 'Worn &&',
				},
			]),
		).toContain('has a condition that is not an expression');
	});

	it('says nothing about a blank condition, which means always', () => {
		expect(
			said([
				{
					name: 'Ring',
					target: 'armour_class',
					amount: '1',
					when: '   ',
				},
			]),
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

/*
 * A definition naming several values (`docs/features/multi-change-definitions.md`).
 *
 * The normalisation is this module's alone: the two spellings exist inside
 * `parse/`, and everything downstream sees one list. So these cases are about the
 * shape that comes out, and the problems that can only be said here.
 */
describe('parseModifierDefinitions: a definition naming several changes', () => {
	const RING = {
		name: 'Ring of Protection',
		when: 'Worn',
		changes: [
			{ target: 'armour_class', amount: '1', bonusType: 'item' },
			{ target: 'abilities.STR', amount: '1', bonusType: 'item' },
		],
	};

	it('reads every change, with each one labelled and the condition kept once', () => {
		const { definitions, problems } = parseModifierDefinitions(
			layout([RING]),
			SOURCES,
		);
		expect(problems).toEqual([]);
		const ring = definitions[0];
		expect(ring?.when).toBe('Worn');
		expect(
			ring?.changes.map((one) => [one.target, one.targetLabel]),
		).toEqual([
			['armour_class', 'Armour class'],
			['abilities.STR', 'Abilities · STR'],
		]);
		// Each change is a full contributor: its own amount and its own type.
		expect(ring?.changes.map((one) => one.amount)).toEqual(['1', '1']);
		expect(ring?.changes.map((one) => one.bonusType)).toEqual([
			'item',
			'item',
		]);
	});

	it('normalises a flat definition to one change, so nothing downstream sees two shapes', () => {
		const { definitions } = parseModifierDefinitions(
			layout([{ name: 'Ring', target: 'armour_class', amount: '1' }]),
			SOURCES,
		);
		expect(definitions[0]?.changes).toHaveLength(1);
		expect(definitions[0]?.changes[0]?.target).toBe('armour_class');
	});

	it('takes the list where a definition holds both, and reports the flat members as ignored', () => {
		// SPEC §10's "rendered, not corrected" on a hand-edited layout: the
		// author's bytes stay and they are told which half the sheet is reading.
		const { definitions, problems } = parseModifierDefinitions(
			layout([
				{
					name: 'Ring',
					target: 'passive_perception',
					amount: '99',
					changes: [{ target: 'armour_class', amount: '1' }],
				},
			]),
			SOURCES,
		);
		expect(definitions[0]?.changes.map((one) => one.target)).toEqual([
			'armour_class',
		]);
		expect(problems[0]?.message).toBe(
			'"Ring" lists its changes, so "target" and "amount" beside the list are ignored. Delete them, or delete the list.',
		);
	});

	it('reads an empty list as a definition that names no value', () => {
		// Which is what a blank target already is, so it earns that definition's
		// existing two problems rather than a third sentence of its own — and it
		// keeps the list non-empty for everything downstream.
		const { definitions, problems } = parseModifierDefinitions(
			layout([{ name: 'Ring', changes: [] }]),
			SOURCES,
		);
		expect(definitions[0]?.changes).toHaveLength(1);
		expect(problems.map((one) => one.message)).toEqual([
			'"Ring" changes nothing, because it names no value. Choose one under Value.',
			'"Ring" has no amount, so it changes nothing. Give it an expression under Amount.',
		]);
	});

	it('reports one target named twice, and keeps both changes', () => {
		/*
		 * **Reported and still applied**, which is the ruling rather than a
		 * softening: two changes at one target are addressable and arithmetic, and
		 * the stacking rule says something true either way. Deliberately not the
		 * collapse a repeated definition *name* gets, where a cell storing a name
		 * could not tell the two apart.
		 */
		const { definitions, problems } = parseModifierDefinitions(
			layout([
				{
					name: 'Ring',
					changes: [
						{
							target: 'armour_class',
							amount: '1',
							bonusType: 'item',
						},
						{ target: 'armour_class', amount: '2' },
					],
				},
			]),
			SOURCES,
		);
		expect(definitions[0]?.changes).toHaveLength(2);
		expect(problems.map((one) => one.message)).toEqual([
			'"Ring" changes "armour_class" twice. Both apply and contest as two separate modifiers would. Remove one, or point it at a different value.',
		]);
	});

	it('names the change a problem is about, where there is more than one to tell apart', () => {
		expect(
			said([
				{
					name: 'Ring',
					changes: [
						{ target: 'armour_class', amount: '1' },
						{ target: '', amount: '' },
					],
				},
			]),
		).toBe(
			// And nothing about its amount: the line above already says that change
			// does nothing, and a second sentence quoting an empty target would be
			// two answers to one question.
			'"Ring" has a change that names no value. Choose one under Value, or remove the change.',
		);
	});

	it("keeps a one-change definition's report word for word, so no layout's report moves", () => {
		// The backward-compatibility half stated as a case: every message below is
		// the shipped sentence, and the only one that changed is the field it names.
		expect(said([{ name: 'Ring' }])).toBe(
			[
				'"Ring" changes nothing, because it names no value. Choose one under Value.',
				'"Ring" has no amount, so it changes nothing. Give it an expression under Amount.',
			].join('\n'),
		);
		expect(
			said([{ name: 'Ring', target: 'passive_perception', amount: '1' }]),
		).toBe(
			'"passive_perception" reads no modifier, so "Ring" changes nothing. Add "+ mod.self" to that value\'s own formula.',
		);
	});

	it('reports a change of its own where a list holds one that reads no modifier', () => {
		// The same fault, said so that it does not claim the whole definition
		// changes nothing when another of its changes does.
		expect(
			said([
				{
					name: 'Ring',
					changes: [
						{ target: 'armour_class', amount: '1' },
						{ target: 'passive_perception', amount: '1' },
					],
				},
			]),
		).toBe(
			'"Ring" changes "passive_perception", which reads no modifier, so that change does nothing. Add "+ mod.self" to that value\'s own formula.',
		);
	});

	it("reports an override's phase and type against the change that holds them", () => {
		expect(
			said([
				{
					name: 'Plate',
					changes: [
						{ target: 'armour_class', amount: '1' },
						{
							target: 'abilities.STR',
							amount: '18',
							operator: 'override',
							applies: 'result',
							bonusType: 'item',
						},
					],
				},
			]),
		).toBe(
			[
				'"Plate" sets "abilities.STR", so it always applies to the result and "applies" is ignored. Clear it, or make that change add to the value instead.',
				'"Plate" sets "abilities.STR", so its bonus type "item" is ignored: overrides are not contested by type. Clear it, or make that change add to the value instead.',
			].join('\n'),
		);
	});

	it('reads a non-object entry as a blank change rather than dropping it', () => {
		// A hand edit can put anything in the list, and a change that vanished from
		// a count the author is reading is worse than one that says what is wrong.
		const { definitions, problems } = parseModifierDefinitions(
			layout([
				{
					name: 'Ring',
					changes: [
						'armour_class += 1',
						{ target: 'armour_class', amount: '1' },
					],
				},
			]),
			SOURCES,
		);
		expect(definitions[0]?.changes).toHaveLength(2);
		expect(problems[0]?.message).toContain(
			'has a change that names no value',
		);
	});
});
