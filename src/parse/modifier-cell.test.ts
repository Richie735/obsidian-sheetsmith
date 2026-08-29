import { describe, expect, it } from 'vitest';
import {
	cellParts,
	holdsSeparator,
	MODIFIER_SEPARATOR,
	parseModifierPart,
	readsAsAssignment,
	spellParts,
	spellTypedEffect,
	storedParts,
	unspellableName,
	withoutPart,
} from './modifier-cell';
import { TypedEffect } from '../types';

/*
 * The modifier cell's own format (feature doc §6).
 *
 * One file, because the character that separates two parts, the shape that marks a
 * part as typed, and the two things a definition's name may therefore not be are
 * the *same three facts* — and two declarations of them could drift apart, which is
 * the one way this feature could silently produce a cell nobody can spell.
 */

/** A typed part, as `parseModifierPart` gives one back. */
function typed(part: string): TypedEffect {
	const read = parseModifierPart(part);
	if (read.kind !== 'typed') {
		throw new Error(`"${part}" read as a name, not as a typed effect.`);
	}
	return read.effect;
}

/** A named part's name, as `parseModifierPart` gives it back. */
function name(part: string): string {
	const read = parseModifierPart(part);
	if (read.kind !== 'named') {
		throw new Error(`"${part}" read as a typed effect, not as a name.`);
	}
	return read.name;
}

describe('splitting a cell into its parts', () => {
	it('is a semicolon, and one declaration of it', () => {
		expect(MODIFIER_SEPARATOR).toBe(';');
	});

	it('reads a cell tolerantly, however a hand-editor spelled it', () => {
		// Every one of these is the same pair of parts, and every one of them keeps
		// its own bytes in the note: `parse/table.ts` rewrites only the cells whose
		// text actually changed, so a tolerant read costs nothing.
		expect(cellParts('A;B')).toEqual(['A', 'B']);
		expect(cellParts('A;;B')).toEqual(['A', 'B']);
		expect(cellParts(' A ; B ')).toEqual(['A', 'B']);
		expect(cellParts('A; B')).toEqual(['A', 'B']);
		expect(cellParts('A ;B')).toEqual(['A', 'B']);
	});

	it('reads a repeated name as one enrolment', () => {
		// Two pushes of one definition would reach the stacking rule as two lines
		// with the second suppressed as "another item bonus of the same size
		// applies" — a true sentence about a typo, and noise.
		expect(cellParts('A; A')).toEqual(['A']);
		expect(cellParts('A; B; A')).toEqual(['A', 'B']);
	});

	it('reads two identical typed parts as two effects', () => {
		/*
		 * **Deliberately not collapsed**, and the asymmetry is the whole model: two
		 * named parts are two references to one thing, so they are one enrolment;
		 * two typed parts are two effects, because nothing else holds either of them
		 * and a reader who typed the same effect twice has two. The stacking rule
		 * will then say something true about it.
		 */
		expect(cellParts('armour_class += 1; armour_class += 1')).toEqual([
			'armour_class += 1',
			'armour_class += 1',
		]);
	});

	it('reads a blank cell as no parts, which is the ordinary case', () => {
		expect(cellParts('')).toEqual([]);
		expect(cellParts('  ')).toEqual([]);
		expect(cellParts(';')).toEqual([]);
	});

	it('writes canonically, in the order it was given', () => {
		// Appended rather than sorted into place: the order a reader put them in is
		// theirs, and reordering stored text is a correction §10 forbids.
		expect(spellParts(['A', 'B'])).toBe('A; B');
		expect(spellParts(['B', 'A'])).toBe('B; A');
		expect(spellParts(['A'])).toBe('A');
		expect(spellParts([])).toBe('');
	});

	it('round-trips whatever it wrote', () => {
		for (const parts of [
			['A'],
			['A', 'B'],
			["Bull's Strength", 'Plate armour'],
			['Ring of Protection', 'armour_class += 2 as item when Worn'],
		]) {
			expect(cellParts(spellParts(parts))).toEqual(parts);
		}
	});
});

describe('telling a name from an effect typed on the row', () => {
	it('reads an item name as a name, arithmetic in it and all', () => {
		/*
		 * The evidence the discriminator had to survive, and the reason "anything
		 * with an operator is a formula" lost: item names carry `+1` and `+2` as a
		 * matter of course in every system surveyed, and a comma is ordinary too.
		 */
		expect(name('Belt of Giant Strength')).toBe('Belt of Giant Strength');
		expect(name('Bracers of Defence +1')).toBe('Bracers of Defence +1');
		expect(name('Bracers of Armor, Greater')).toBe('Bracers of Armor, Greater');
		expect(name('Ring of Protection +2')).toBe('Ring of Protection +2');
	});

	it('reads an assignment as a typed effect, however it is spaced', () => {
		expect(typed('armour_class += 2')).toEqual({
			target: 'armour_class',
			operator: 'add',
			amount: '2',
		});
		expect(typed('armour_class+=2')).toEqual({
			target: 'armour_class',
			operator: 'add',
			amount: '2',
		});
		expect(typed('armour_class  +=  2')).toEqual({
			target: 'armour_class',
			operator: 'add',
			amount: '2',
		});
	});

	it('reads `=` as Sets and `+=` as Adds to', () => {
		expect(typed('armour_class = 18').operator).toBe('override');
		expect(typed('armour_class += 18').operator).toBe('add');
	});

	it('reads a dotted target, and an amount that reads the row', () => {
		expect(typed('abilities.STR += Qty * 2')).toEqual({
			target: 'abilities.STR',
			operator: 'add',
			amount: 'Qty * 2',
		});
	});

	it('reads a comparison as a stray name and not as a typed effect', () => {
		/*
		 * **The negative lookahead, and it is the one character between a mistake a
		 * reader can see and an effect nothing can resolve.** Without it
		 * `armour_class == 2` reads as a target, an operator `=` and an amount
		 * `= 2` — so a comparison written by mistake becomes an unresolvable effect
		 * rather than a stray name with a line under it saying so.
		 */
		expect(name('armour_class == 2')).toBe('armour_class == 2');
	});

	it('reads an amount holding `==` as a typed effect', () => {
		expect(typed('armour_class += if(Training == 2, 2, 0)').amount).toBe(
			'if(Training == 2, 2, 0)',
		);
	});

	it('reads a name with no assignment in it as a name', () => {
		// `armour_class + 2` has no `=`, so it is a name: the discriminator is the
		// assignment and nothing else.
		expect(name('armour_class + 2')).toBe('armour_class + 2');
	});

	it('reads an assignment with no amount as an unfinished typed effect', () => {
		// **Changes nothing and is not an error** (§6), which is what makes the form
		// safe to commit one field at a time.
		expect(typed('armour_class +=')).toEqual({
			target: 'armour_class',
			operator: 'add',
			amount: '',
		});
	});

	it('reads a target that starts with a digit as a name', () => {
		expect(name('2nd wind = 3')).toBe('2nd wind = 3');
	});
});

describe('the clause keywords', () => {
	it('reads both, from the right', () => {
		expect(typed('armour_class += 2 as item when Worn')).toEqual({
			target: 'armour_class',
			operator: 'add',
			amount: '2',
			bonusType: 'item',
			when: 'Worn',
		});
	});

	it('reads a condition with no bonus type', () => {
		const effect = typed('armour_class += 2 when Worn');
		expect(effect.when).toBe('Worn');
		expect(effect.bonusType).toBeUndefined();
	});

	it('reads a bonus type with no condition', () => {
		const effect = typed('armour_class += 2 as item');
		expect(effect.bonusType).toBe('item');
		expect(effect.when).toBeUndefined();
	});

	it('leaves a keyword inside parentheses in the amount', () => {
		/*
		 * The one collision the rule has: a column heading literally spelled `as` or
		 * `when` used as a bare amount, which SPEC §5 makes reachable because a row
		 * expression may read a column by heading. One paren wide, and stated rather
		 * than glossed.
		 */
		const effect = typed('armour_class += (when)');
		expect(effect.amount).toBe('(when)');
		expect(effect.when).toBeUndefined();
	});
});

describe('spelling a typed effect', () => {
	it('writes single spaces and omits the blank clauses', () => {
		expect(
			spellTypedEffect({ target: 'armour_class', operator: 'add', amount: '2' }),
		).toBe('armour_class += 2');
		expect(
			spellTypedEffect({
				target: 'armour_class',
				operator: 'override',
				amount: '18',
			}),
		).toBe('armour_class = 18');
		expect(
			spellTypedEffect({
				target: 'armour_class',
				operator: 'add',
				amount: '2',
				bonusType: 'item',
				when: 'Worn',
			}),
		).toBe('armour_class += 2 as item when Worn');
	});

	it('writes an unfinished effect with no trailing space', () => {
		expect(
			spellTypedEffect({ target: 'armour_class', operator: 'add', amount: '' }),
		).toBe('armour_class +=');
	});

	it('spells then parses back to the same effect, over every clause pair', () => {
		/*
		 * **The cheapest guard this design has.** There is one spelling and one
		 * parse, on either side of the seam — the component spells a part and never
		 * reads one, `formula/` reads one and never spells one — so this property is
		 * what stops the form and the number disagreeing about what
		 * `armour_class += 2 as item when Worn` means.
		 */
		for (const bonusType of [undefined, 'item']) {
			for (const when of [undefined, 'Worn']) {
				for (const amount of ['2', '', 'Qty * 2']) {
					const effect: TypedEffect = {
						target: 'abilities.STR',
						operator: 'add',
						amount,
						...(bonusType === undefined ? {} : { bonusType }),
						...(when === undefined ? {} : { when }),
					};
					expect(typed(spellTypedEffect(effect))).toEqual(effect);
				}
			}
		}
	});
});

describe('taking one enrolment off a cell', () => {
	/*
	 * **Remove acts on an enrolment, not on a byte range**, and the case that forced
	 * it was reported from the app: "the remove modifier isn't working". A cell
	 * holding one name twice is *one* enrolment — the row applies it once, the glyph
	 * counts it once, the arithmetic sees it once — so dropping a single byte range
	 * left the row still applying the modifier, and the reader pressed the only
	 * control there is and nothing came off.
	 *
	 * Reachable in two presses without touching the file: **Add a modifier**, then
	 * pick a definition another part of the same cell already names.
	 */
	it('drops every part naming the same definition', () => {
		expect(withoutPart(['A', 'B', 'A'], 0)).toEqual(['B']);
		expect(withoutPart(['A', 'B', 'A'], 2)).toEqual(['B']);
		expect(withoutPart(['A', 'A'], 0)).toEqual([]);
	});

	it('drops one part where the name appears once, which is every ordinary cell', () => {
		expect(withoutPart(['A', 'B'], 0)).toEqual(['B']);
		expect(withoutPart(['A', 'B'], 1)).toEqual(['A']);
		expect(withoutPart(['A'], 0)).toEqual([]);
	});

	it('drops one of two identical typed parts, because they are two effects', () => {
		// The same asymmetry `cellParts` draws: they are not references to one thing,
		// so there is no single enrolment to take off.
		expect(
			withoutPart(['armour_class += 1', 'armour_class += 1'], 0),
		).toEqual(['armour_class += 1']);
	});

	it('leaves a typed part alone when a name is removed beside it', () => {
		expect(
			withoutPart(['Ring', 'armour_class += 2 as item', 'Ring'], 0),
		).toEqual(['armour_class += 2 as item']);
	});

	it('changes nothing for an index the cell does not have', () => {
		// A stale index is a stale read rather than a part to invent, which is
		// `parse/table.ts`'s own rule for a row index past the table.
		expect(withoutPart(['A', 'B'], 5)).toEqual(['A', 'B']);
	});
});

describe('why a name a cell cannot spell is refused', () => {
	/*
	 * **One sentence per rule, in the one place that owns it.** The predicates were
	 * extracted and the sentences they produce were left written out in three files
	 * — the parser's report, the writer's refusal and the panel's — which is §1's
	 * named trap exactly: share the application, not just the fact.
	 */
	it('names the fix for each of the three shapes', () => {
		expect(unspellableName('  ')).toBe('Give it a name to reuse it by.');
		expect(unspellableName('Boots; gloves')).toBe(
			'"Boots; gloves" cannot be a name, because a row separates the modifiers it applies with a semicolon. Rename it without one.',
		);
		expect(unspellableName('armour_class = 18')).toBe(
			'"armour_class = 18" cannot be a name, because a row spells its own modifiers that way. Rename it, or write it as a modifier\'s Changes and Amount instead.',
		);
	});

	it('refuses nothing a cell can spell, arithmetic in the name and all', () => {
		for (const name of [
			'Ring of Protection +2',
			'Bracers of Armor, Greater',
			'armour_class == 2',
			"Bull's Strength",
		]) {
			expect(unspellableName(name), name).toBeNull();
		}
	});

	it('trims before judging, because the parser dedupes on the trimmed name', () => {
		// A refusal that accepted what the parser then dropped would be the
		// instrument disagreeing with itself.
		expect(unspellableName(' Boots; gloves ')).toContain('semicolon');
	});
});

describe('the two tests a name check needs', () => {
	it('says whether a name holds the separator', () => {
		expect(holdsSeparator('Boots; gloves')).toBe(true);
		expect(holdsSeparator('Boots and gloves')).toBe(false);
	});

	it('says whether a name reads as an assignment', () => {
		expect(readsAsAssignment('armour_class = 18')).toBe(true);
		expect(readsAsAssignment('armour_class += 2')).toBe(true);
		expect(readsAsAssignment('Ring of Protection +2')).toBe(false);
		expect(readsAsAssignment('armour_class == 2')).toBe(false);
	});
});

describe('the read list and the write list', () => {
	/*
	 * **The one split §6 depends on**, and the reason it is two functions rather
	 * than one with a flag: the collapse is a read and never a write, so the list a
	 * commit re-joins has to be every part the cell holds while the list the
	 * arithmetic and the glyph read is every enrolment the row makes.
	 */
	it('keeps a repeated name in the stored list and drops it from the enrolments', () => {
		expect(storedParts('A; B; A')).toEqual(['A', 'B', 'A']);
		expect(cellParts('A; B; A')).toEqual(['A', 'B']);
	});

	it('agrees exactly wherever there is no repeated name', () => {
		// Which is every cell but a hand-edited typo, so the two lists are the same
		// list in the ordinary case and the split costs the reader nothing.
		for (const cell of [
			'',
			'A',
			'A; B',
			'A ;B',
			'A;;B',
			'armour_class += 2 as item',
			'Ring of Protection; armour_class += 2 as item when Worn',
		]) {
			expect(cellParts(cell), cell).toEqual(storedParts(cell));
		}
	});

	it('keeps both of two identical typed parts in either list', () => {
		// They are not references to one thing, so neither list has anything to
		// collapse: a reader who typed the same effect twice has two effects.
		const cell = 'armour_class += 1; armour_class += 1';
		expect(storedParts(cell)).toHaveLength(2);
		expect(cellParts(cell)).toHaveLength(2);
	});
});

/*
 * **The phase clause.** Only the result phase is ever spelled: the value phase is
 * the absent clause, so every cell written before phases existed round-trips byte
 * for byte (Constraint 3) and there is one spelling per meaning.
 */
describe('the phase a typed effect applies to', () => {
	it('reads and spells the result phase', () => {
		const part = 'abilities.STR += 1 to result';
		const read = parseModifierPart(part);
		expect(read.kind === 'typed' ? read.effect.applies : null).toBe('result');
		expect(read.kind === 'typed' ? read.effect.amount : null).toBe('1');
		expect(
			read.kind === 'typed' ? spellTypedEffect(read.effect) : null,
		).toBe(part);
	});

	it('leaves an effect that says nothing in the value phase', () => {
		const read = parseModifierPart('abilities.STR += 1');
		// Absent rather than 'value': the storage carries no key, which is what
		// keeps the round trip byte-identical for every cell written before this.
		expect(read.kind === 'typed' ? read.effect.applies : 'x').toBeUndefined();
		expect(
			read.kind === 'typed' ? spellTypedEffect(read.effect) : null,
		).toBe('abilities.STR += 1');
	});

	it('reads the phase beside the other two clauses, in one spelling', () => {
		const part = 'armour_class += 2 to result as item when Worn';
		const read = parseModifierPart(part);
		if (read.kind !== 'typed') throw new Error('expected a typed effect');
		expect(read.effect).toEqual({
			target: 'armour_class',
			operator: 'add',
			amount: '2',
			applies: 'result',
			bonusType: 'item',
			when: 'Worn',
		});
		expect(spellTypedEffect(read.effect)).toBe(part);
	});

	it('never spells a phase on an override, which is in one by construction', () => {
		expect(
			spellTypedEffect({
				target: 'armour_class',
				operator: 'override',
				amount: '18',
				applies: 'result',
			}),
		).toBe('armour_class = 18');
	});

	/*
	 * **The clause checks its own value, where ` as ` and ` when ` do not.** Those
	 * take arbitrary text, so finding the keyword is enough. ` to ` cannot borrow
	 * that: it is a common word, and an amount reading a column headed `to` — which
	 * SPEC §5 makes reachable — would otherwise lose everything after it.
	 */
	it('leaves a "to" that is not a phase inside the amount', () => {
		const part = 'armour_class += Bonus to Hit';
		const read = parseModifierPart(part);
		if (read.kind !== 'typed') throw new Error('expected a typed effect');
		expect(read.effect.applies).toBeUndefined();
		expect(read.effect.amount).toBe('Bonus to Hit');
		expect(spellTypedEffect(read.effect)).toBe(part);
	});
});
