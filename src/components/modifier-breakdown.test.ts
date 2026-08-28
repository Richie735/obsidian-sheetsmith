import { describe, expect, it } from 'vitest';
import { MODIFIED_CLASS, modifierBreakdown } from './modifier-breakdown';
import { ModifierLine } from '../types';

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

/** A contributor, with the fields a case is not about left alone. */
function line(over: Partial<ModifierLine> = {}): ModifierLine {
	return {
		label: 'Ring',
		source: 'Magic items',
		type: null,
		amount: 1,
		suppressed: null,
		...over,
	};
}

const said = (lines: readonly ModifierLine[], total: number) =>
	modifierBreakdown({ lines, total });

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
