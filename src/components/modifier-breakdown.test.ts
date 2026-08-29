import { describe, expect, it } from 'vitest';
import {
	MODIFIED_CLASS,
	modifierBreakdown,
	modifierOutcomeText,
} from './modifier-breakdown';
import {
	ModifierDefinitionView,
	ModifierLine,
	ModifierOutcome,
} from '../types';

/*
 * The text a modified number's popover and its sr-only twin both show.
 *
 * A file of its own rather than coverage through Card and Table, because what
 * this module owns is a *rule about the whole breakdown* — when the component's
 * label is worth showing — and a consumer can only ever drive one breakdown at a
 * time. `docs/PATTERNS.md` §10's three exceptions all rest on the consumer being
 * the only place the claim becomes observable, and here it is the opposite: the
 * claim is about a set of lines, and the consumers each hand over one.
 */

/**
 * A contributor, with the fields a case is not about left alone.
 *
 * **`definition` defaults to the row's own label**, which is not laziness: an
 * item's row is normally named after the modifier it applies, so the two are the
 * same word, and that is the case the drop rule below is written against. A case
 * about the two *differing* names both.
 */
function line(over: Partial<ModifierLine> = {}): ModifierLine {
	const label = over.label ?? 'Ring';
	return {
		label,
		source: 'Magic items',
		definition: label,
		operator: 'add',
		type: null,
		amount: 1,
		suppressed: null,
		...over,
	};
}

const said = (
	lines: readonly ModifierLine[],
	total: number,
	override: number | null = null,
	/** What the caller drew. Defaults to what an applied override comes to. */
	shown: number | null = override === null ? null : override + total,
	/** That the reader is inside a component with rows, which a table is. */
	inRows = false,
) => modifierBreakdown({ lines, total, override }, shown, inRows);

describe('modifierBreakdown', () => {
	it('is null where nothing modifies the number', () => {
		// The mark and the text are the same fact, so a caller asking for one is
		// asking whether there is the other.
		expect(said([], 0)).toBeNull();
		expect(modifierBreakdown(undefined)).toBeNull();
	});

	it('names the row, the type and the amount signed, then the total', () => {
		expect(
			said([line({ label: 'Belt', type: 'item', amount: 2 })], 2),
		).toBe('Belt — item +2\n\nTotal +2');
	});

	it('says nothing where a modifier is untyped', () => {
		// Every modifier is untyped on a layout that has never heard of bonus
		// types, and a word repeated down every line carries no information.
		expect(said([line({ amount: 2 })], 2)).toBe('Ring — +2\n\nTotal +2');
	});

	it('signs a penalty and a total that came out negative', () => {
		expect(said([line({ amount: -2 })], -2)).toBe('Ring — -2\n\nTotal -2');
	});

	it('reads an override as "sets to" rather than as a signed amount', () => {
		// An override is not an addend, and a "+18" over a row setting armour class
		// to 18 would be a line that says the wrong thing.
		expect(
			said([line({ label: 'Plate armour', operator: 'override', amount: 18 })], 0, 18),
		).toBe('Plate armour — sets to 18\n\nTotal 18');
	});

	it('reads the total as a value once something overrides, not as an addend', () => {
		// Base-plus-total is no longer the arithmetic, so a signed number there
		// would invite the reader to add it to something.
		expect(
			said(
				[
					line({ label: 'Plate armour', operator: 'override', amount: 18 }),
					line({ label: 'Ring', type: 'item', amount: 1 }),
				],
				1,
				18,
			),
		).toBe(
			'Plate armour — sets to 18\nRing — item +1\n\nTotal 19',
		);
	});

	it('lists a suppressed override and says which wording is true', () => {
		// The same discipline the additive phase has: a tie is not a higher
		// override, and saying one applies would send a reader hunting for a
		// number that is not there.
		expect(
			said(
				[
					line({ label: 'Plate', operator: 'override', amount: 18 }),
					line({
						label: 'Mage armour',
						operator: 'override',
						amount: 13,
						suppressed: 'a higher override applies',
					}),
				],
				0,
				18,
			),
		).toBe(
			'Plate — sets to 18\nMage armour — sets to 13 (not applied: a higher override applies)\n\nTotal 18',
		);
	});

	it('keeps the signed total where nothing overrides', () => {
		// The shipped shape, unchanged: the line only changes when the fact does.
		expect(said([line({ type: 'item', amount: 1 })], 1)).toBe(
			'Ring — item +1\n\nTotal +1',
		);
	});

	it('prints the caller\'s number, never its own arithmetic, under an override', () => {
		/*
		 * The finding this parameter exists for. A breakdown is offered on the
		 * lazy-proof text scan while an override is *applied* only where the slot
		 * was actually read, so the two disagree on
		 * `if(false, 10 + mod.self, 10)` — and on any name that reaches the
		 * accepting set through some other formula's `mod.<name>`. Recomputing
		 * `override + total` here printed `Total 19` over the number 10, which is a
		 * false statement about the number under the cursor rather than a confusing
		 * delta.
		 */
		expect(
			said(
				[
					line({ label: 'Plate armour', operator: 'override', amount: 18 }),
					line({ label: 'Ring', type: 'item', amount: 1 }),
				],
				1,
				18,
				10,
			),
		).toBe('Plate armour — sets to 18\nRing — item +1\n\nTotal 10');
	});

	it('keeps the delta form where the caller has no number to show', () => {
		// An unresolved formula, or a cell with nothing to compute: the delta
		// asserts nothing about a value, where a value would be a guess.
		expect(
			said([line({ label: 'Plate', operator: 'override', amount: 18 })], 1, 18, null),
		).toBe('Plate — sets to 18\n\nTotal +1');
	});

	it('lists an override to 0, because setting to zero is a real effect', () => {
		expect(said([line({ label: 'Antimagic', operator: 'override', amount: 0 })], 0, 0)).toBe(
			'Antimagic — sets to 0\n\nTotal 0',
		);
	});

	it('lists a suppressed contributor and why it did not apply', () => {
		// The line the whole breakdown exists for: a reader who bought two rings
		// and watched the number not move will otherwise conclude it is broken.
		expect(
			said(
				[
					line({ label: 'Belt', type: 'item', amount: 2 }),
					line({
						label: 'Gauntlets',
						type: 'item',
						amount: 1,
						suppressed: 'a larger item bonus applies',
					}),
				],
				2,
			),
		).toBe(
			'Belt — item +2\nGauntlets — item +1 (not applied: a larger item bonus applies)\n\nTotal +2',
		);
	});
});

/*
 * When the component's label is shown, which is the rule F4 settled.
 *
 * **A token that is the same on every line of a breakdown carries no
 * information and is dropped.** That is already why an untyped modifier says
 * nothing rather than "untyped", and it is why the source appears only where a
 * breakdown draws on more than one component — and then on every line of it,
 * so no line is left unqualified beside a qualified one.
 */
describe('a breakdown read inside a table', () => {
	it('names the component on every line, however few there are', () => {
		/*
		 * **The one place the drop rule stands down, and the premise is what fails.**
		 * The rule is that a token the same on every line carries no information —
		 * true of the breakdown, and false about the reader's *surroundings*. A
		 * computed cell in a Skills table drew `Eyes of the Eagle — item +2` for a
		 * contributor living in Magic items, so a reader read a row name while
		 * looking at a list of rows and went hunting for a skill called that.
		 */
		expect(
			said([line({ label: 'Eyes of the Eagle', amount: 2 })], 2, null, null, true),
		).toContain('Magic items · Eyes of the Eagle — +2');
	});

	it('leaves a card\'s breakdown alone, because a card has no rows', () => {
		// Which is why this is the table's flag rather than a rule for everyone:
		// there is no competing referent on a card, so the token would be noise.
		expect(said([line({ label: 'Eyes of the Eagle', amount: 2 })], 2)).toContain(
			'Eyes of the Eagle — +2',
		);
		expect(said([line({ label: 'Eyes of the Eagle', amount: 2 })], 2)).not.toContain(
			'Magic items',
		);
	});
});

describe('the modifier\'s own name, and when it earns its place', () => {
	it('is left off where the row is already called by it', () => {
		/*
		 * The ordinary case, and the reason this clause is invisible almost
		 * everywhere: an item's row is named after the modifier it applies, so the
		 * two are the same word and printing both would print one word twice.
		 */
		expect(said([line({ label: 'Ring of Protection', amount: 1 })], 1)).toContain(
			'Ring of Protection — +1',
		);
	});

	it('is shown where the row applies a modifier it is not named after', () => {
		/*
		 * **The defect a cell holding a list created, and the severest one in the
		 * feature.** The Bracers of Defence reach armour class from a row called
		 * *Belt of Giant Strength*; with only the row on the line, a player was told
		 * a Strength item was giving them armour class. Invisible while one row was
		 * one modifier, because the two names coincided.
		 */
		expect(
			said(
				[
					line({
						label: 'Belt of Giant Strength',
						definition: 'Bracers of Defence',
						type: 'circumstance',
						amount: 1,
					}),
				],
				1,
			),
		).toContain('Belt of Giant Strength · Bracers of Defence — circumstance +1');
	});

	it('keeps the row as well, so the reader can find the thing to untick', () => {
		// Never the modifier alone: a breakdown naming only `Bracers of Defence`
		// sends the reader scanning an inventory for a row that does not exist.
		const drawn = said(
			[line({ label: 'Belt of Giant Strength', definition: 'Bracers of Defence' })],
			1,
		);
		expect(drawn).toContain('Belt of Giant Strength');
		expect(drawn).toContain('Bracers of Defence');
	});

	it('decides it per line, where the source is decided per breakdown', () => {
		/*
		 * The granularities differ and both follow from one rule: a token carrying
		 * no information is dropped. Dropping the *source* on some lines would leave
		 * a fact unrecoverable and make one line's text depend on another's, which
		 * is why it is uniform; dropping the modifier where it equals the row
		 * removes a duplicate of a word already on the line, so nothing is missing
		 * and nothing depends on any other line.
		 */
		expect(
			said(
				[
					line({ label: 'Belt', definition: 'Bracers', amount: 1 }),
					line({ label: 'Ring', amount: 1 }),
				],
				2,
			)?.split('\n'),
		).toEqual([
			'Belt · Bracers — +1',
			'Ring — +1',
			'',
			'Total +2',
		]);
	});
});

describe('the source, and when it earns its place', () => {
	it('is left off where every line comes from one component', () => {
		// The common sheet: one modifier table. Prefixing every line there would
		// put the same word in front of every contributor and push the amount —
		// which is what the reader came for — further right on each one.
		expect(
			said(
				[
					line({ label: 'Belt', amount: 2 }),
					line({ label: 'Gauntlets', amount: 1 }),
				],
				3,
			),
		).toBe('Belt — +2\nGauntlets — +1\n\nTotal +3');
	});

	it('qualifies every line where the breakdown draws on two components', () => {
		// The failure the row label cannot carry: worn items and weapons on one
		// sheet, each with a row called "Ring", giving two lines a reader cannot
		// tell apart.
		expect(
			said(
				[
					line({ label: 'Ring', source: 'Worn items', type: 'item', amount: 1 }),
					line({ label: 'Ring', source: 'Weapons', type: 'status', amount: 2 }),
				],
				3,
			),
		).toBe(
			'Worn items · Ring — item +1\nWeapons · Ring — status +2\n\nTotal +3',
		);
	});

	it('qualifies the lines that do not collide as well', () => {
		/*
		 * Uniform across the breakdown rather than per line, and this is the case
		 * that says so: qualifying only the colliding pair would leave the reader
		 * unable to tell where "Belt" came from, and would make one line's text
		 * depend on another line's spelling.
		 */
		expect(
			said(
				[
					line({ label: 'Ring', source: 'Worn items', amount: 1 }),
					line({ label: 'Ring', source: 'Weapons', amount: 1 }),
					line({ label: 'Belt', source: 'Worn items', amount: 1 }),
				],
				3,
			),
		).toBe(
			'Worn items · Ring — +1\nWeapons · Ring — +1\nWorn items · Belt — +1\n\nTotal +3',
		);
	});

	it('leaves a blank source off even where the breakdown qualifies', () => {
		// A push whose component has no label to give says nothing rather than
		// drawing a bare separator in front of the row.
		expect(
			said(
				[
					line({ label: 'Ring', source: '', amount: 1 }),
					line({ label: 'Belt', source: 'Weapons', amount: 1 }),
				],
				2,
			),
		).toBe('Ring — +1\nWeapons · Belt — +1\n\nTotal +2');
	});
});

describe('the mark', () => {
	it('is named for the mark rather than for a caller', () => {
		// A table cell carrying a class called `card` is a name a reader would
		// believe (PATTERNS §1); both consumers add this one class and the rule
		// is written once.
		expect(MODIFIED_CLASS).toBe('sheetsmith-modified');
	});
});

/*
 * The row's own text, which is the module's second consumer.
 *
 * Here rather than in `table.ts`'s cases because the sentence is this module's:
 * the `title`, the popover a press-and-hold opens and the accessible name all
 * take it, and one builder is what stops the three saying different things.
 */
describe('modifierOutcomeText', () => {
	const definition = (
		over: Partial<ModifierDefinitionView> = {},
	): ModifierDefinitionView => ({
		name: 'Plate armour',
		target: 'armour_class',
		targetLabel: 'Armour class',
		operator: 'override',
		amount: '18',
		...over,
	});

	const outcome = (over: Partial<ModifierOutcome> = {}): ModifierOutcome => ({
		definition: definition(),
		typed: null,
		target: 'armour_class',
		targetLabel: 'Armour class',
		applies: true,
		amount: 18,
		condition: null,
		suppressed: null,
		...over,
	});

	it('names the target and what the modifier sets it to', () => {
		expect(modifierOutcomeText('Plate armour', outcome())).toBe(
			'Armour class — sets to 18',
		);
	});

	it('spells an addition the way a breakdown line does', () => {
		// The shared helper is the point: a row reading "+1" beside a breakdown
		// reading "item +1" is the instrument disagreeing with itself.
		expect(
			modifierOutcomeText(
				'Ring',
				outcome({
					definition: definition({
						name: 'Ring',
						operator: 'add',
						amount: '1',
						bonusType: 'item',
					}),
					amount: 1,
				}),
			),
		).toBe('Armour class — item +1');
	});

	it('says a condition holds, and says when it does not', () => {
		const conditional = definition({
			name: 'Cloak',
			operator: 'add',
			amount: '1',
			when: 'Equipped',
		});
		expect(
			modifierOutcomeText(
				'Cloak',
				outcome({ definition: conditional, amount: 1, condition: true }),
			),
		).toBe('Armour class — +1\nOnly while Equipped, which holds now');
		expect(
			modifierOutcomeText(
				'Cloak',
				outcome({
					definition: conditional,
					applies: false,
					amount: 1,
					condition: false,
				}),
			),
		).toBe('Armour class — +1\nOnly while Equipped, which does not hold now');
	});

	it('says why it is not applied, in preference to the condition', () => {
		// A row whose condition holds and whose bonus lost is not applying, and
		// "which holds now" over a row that changed nothing would be the more
		// misleading half of a true pair.
		expect(
			modifierOutcomeText(
				'Cloak',
				outcome({
					definition: definition({
						name: 'Cloak',
						operator: 'add',
						amount: '1',
						bonusType: 'item',
						when: 'Equipped',
					}),
					applies: false,
					amount: 1,
					condition: true,
					suppressed: 'a larger item bonus applies',
				}),
			),
		).toBe('Armour class — item +1\nNot applied: a larger item bonus applies');
	});

	it('names the cell\'s own spelling where the layout declares no such modifier', () => {
		// The one shape that names the cell rather than a target: there is no
		// definition to take a target from, and the spelling is the thing a reader
		// has to recognise as theirs before they replace it.
		expect(
			modifierOutcomeText(
				'Belt of Giant Strength',
				outcome({
					definition: null,
					typed: null,
					target: '',
					targetLabel: '',
					applies: false,
					amount: null,
				}),
			),
		).toBe(
			'"Belt of Giant Strength" is not a modifier this layout declares.\nChoose one it does, or add it in the layout editor.',
		);
	});

	it('says what kind of change it is where the amount will not resolve', () => {
		// The reason is in `suppressed`, so the first line says what kind of change
		// it is without claiming a number nobody could work out.
		expect(
			modifierOutcomeText(
				'Ring',
				outcome({
					definition: definition({
						name: 'Ring',
						operator: 'add',
						amount: 'Charges',
						bonusType: 'item',
					}),
					applies: false,
					amount: null,
					suppressed: 'unknown name "Charges".',
				}),
			),
		).toBe('Armour class — item bonus\nNot applied: unknown name "Charges".');
		expect(
			modifierOutcomeText(
				'Plate armour',
				outcome({ applies: false, amount: null, suppressed: 'no.' }),
			),
		).toBe('Armour class — sets a value\nNot applied: no.');
	});
});
