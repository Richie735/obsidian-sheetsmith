import { describe, expect, it } from 'vitest';
import { sampleFlag, sampleNumber, samplePart, sampleSeed, sampleText } from './sample-values';

/*
 * The filler vocabulary, tested on its own — which is a departure from
 * `docs/PATTERNS.md` §10's second exception and from what
 * `docs/features/preview-sample-values.md` §2 claimed when this module arrived.
 *
 * The exception covers a module whose test "could assert little past a constant
 * equalling itself", and `column-types.ts` and `stored-flag.ts` are exactly
 * that: a set of strings and which of them mean yes. Two things here are not.
 *
 * `samplePart` is an *algorithm* with an invariant — never none, never all — and
 * its boundary cases (a whole of 0, 1, 2) are reachable through a level column's
 * own count and are passed by no component's fixture, so nothing else would ever
 * evaluate them. `NUMBERS` carries a *stated property* rather than a value: no
 * two adjacent entries equal, the wrap pair included, which is what every "no two
 * neighbours alike" claim in the catalog rests on. A one-character edit to that
 * array could break every one of those claims with the whole suite green, because
 * each component's own test asserts distinctness over the two or three entries
 * its fixture happens to reach.
 *
 * What stays with the consumers is the other half: that a sample reads, writes
 * back byte for byte, and looks right on a card.
 */

describe('the filler numbers', () => {
	/** Long enough to wrap the sequence twice, from a caller's own seed. */
	const RUN = 25;

	it('never puts a number next to a copy of itself, however far it wraps', () => {
		/*
		 * The property the sequence is chosen for, checked across the wrap rather
		 * than only inside one pass: entry 9 sits next to entry 0 for any caller
		 * whose seed lands late in the array, which is most of them, and that pair
		 * is the one an edit to either end would break.
		 */
		const run = Array.from({ length: RUN }, (_, at) => sampleNumber(at));
		const equal = run.filter((one, at) => at > 0 && one === run[at - 1]);
		expect(equal).toEqual([]);
	});

	it('is small, two digits at most, and never 0 or 1', () => {
		// §2's rule, over the whole sequence rather than over the two entries a
		// component fixture happens to reach: a lone 1 makes a multiplication
		// invisible and a 0 makes one look broken.
		const run = Array.from({ length: RUN }, (_, at) => sampleNumber(at));
		expect(run.every((one) => one > 1 && one < 100)).toBe(true);
	});

	it('gives one component\'s own run every number before it repeats one', () => {
		// A Card set of six entries or a Table of six rows reads its numbers as a
		// group, so the sequence has to be long enough that none of them repeats.
		const window = new Set(Array.from({ length: 6 }, (_, at) => sampleNumber(3 + at)));
		expect(window.size).toBe(6);
	});
});

describe('sampleSeed', () => {
	it('is stable for one id and different for the ids a layout actually holds', () => {
		expect(sampleSeed('armour_class')).toBe(sampleSeed('armour_class'));
		// Not a hash-quality claim — a collision would only draw two equal
		// numbers, which is what an unseeded canvas did everywhere. What is
		// asserted is that the ids on the harness's own sheet do not all land on
		// one entry, which is the failure this exists to prevent.
		const ids = ['armour_class', 'passive_perception', 'hit_points', 'origin', 'stealth'];
		const numbers = new Set(ids.map((id) => sampleNumber(sampleSeed(id))));
		expect(numbers.size).toBeGreaterThan(1);
	});

	it('is a non-negative index, which is what sampleNumber now takes', () => {
		// `sampleNumber` no longer normalises a negative index, so this is the
		// guarantee that replaced it. A long id is the case that would overflow
		// into a negative through the 32-bit shift if `Math.abs` ever went.
		for (const id of ['', 'a', 'abilities', 'a_very_long_component_id_'.repeat(8)]) {
			expect(sampleSeed(id)).toBeGreaterThanOrEqual(0);
			expect(Number.isInteger(sampleSeed(id))).toBe(true);
		}
	});
});

describe('samplePart', () => {
	it('is never none and never all of it', () => {
		// The invariant, over every whole a run or a ladder could have. A full bar
		// and an empty bar look the same at a glance; a partial one does not.
		for (let whole = 3; whole <= 40; whole++) {
			const part = samplePart(whole);
			expect(part, `part of ${whole}`).toBeGreaterThan(0);
			expect(part, `part of ${whole}`).toBeLessThan(whole);
		}
	});

	it('answers 1 for the two smallest wholes that have no inside', () => {
		// Two is the smallest whole with something between its ends, so at or
		// below it there is one answer that is neither none nor all — and 1 is
		// also what a one-level ladder's only step is.
		expect(samplePart(1)).toBe(1);
		expect(samplePart(2)).toBe(1);
	});

	it('answers nothing for a whole that is nothing', () => {
		// Reachable through a level column's own count, and passed by no
		// component fixture: a ladder with no steps has no part to fill, and the
		// caller writes the 0 the cell would hold anyway.
		expect(samplePart(0)).toBe(0);
		expect(samplePart(-1)).toBe(0);
	});
});

describe('sampleFlag and sampleText', () => {
	it('shows both states of a flag, set first', () => {
		// A sample of one shows the marked state: an empty ring is what an empty
		// canvas already drew.
		expect([0, 1, 2, 3].map(sampleFlag)).toEqual([true, false, true, false]);
	});

	it('numbers filler text from one, as a reader counts', () => {
		expect(sampleText('Notes', 0)).toBe('Notes 1');
		expect(sampleText('Notes', 1)).toBe('Notes 2');
	});
});
