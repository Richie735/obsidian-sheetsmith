/*
 * The filler a component fills its own vocabulary with, for the layout
 * editor's preview (`docs/features/preview-sample-values.md` §2).
 *
 * **A sample never invents vocabulary.** Every key, column, entry and row label
 * in a sample comes from the config the component was handed; only the *values*
 * are the component's, and this file is where those values are agreed. That is
 * what keeps the plugin system-agnostic (SPEC §2) with no effort: a Card keyed
 * `AC` samples `AC`, a Card keyed `Fatigue` samples `Fatigue`, and nothing in
 * `src/` ever ships the word "Strength".
 *
 * **It is a shared-vocabulary module in `column-types.ts`'s and
 * `stored-flag.ts`'s sense**, and §1's "share on the third consumer" is met on
 * arrival — there are six, and each export below has at least two.
 *
 * **It does not take `docs/PATTERNS.md` §10's second exception, though, and the
 * feature document claiming it would was wrong.** That exception is for a module
 * whose test "could assert little past a constant equalling itself", and two
 * things here are not that. `samplePart` is an algorithm with a real invariant —
 * never none and never all of it — reachable at values no component's fixture
 * happens to pass, `0` and `1` included. And `NUMBERS` below carries a *stated
 * property* rather than a value: no two adjacent entries equal, the pair at the
 * ends included, which is what every "no two neighbours alike" claim in the
 * catalog stands on and what a one-character edit could break with the whole
 * suite green. Both are in `sample-values.test.ts`. What the consumers hold is
 * the other half — `contract.test.ts` drives every sample through a real `read`
 * and a real `write`, and the six components drive their own filler.
 *
 * The rules the values follow, which are also what a design review checks a
 * sample against:
 *
 * - **Numbers are small, two digits at most, and different from one another** —
 *   never 0 and never 1. A formula reading a sample has to visibly be doing
 *   arithmetic: six abilities all reading 10 make `floor((value - 10) / 2)` look
 *   broken, and a lone 1 makes a multiplication invisible.
 * - **Text reads as filler at a glance**: the field's or column's own name with
 *   an index, so nobody mistakes a preview for their own data and a screenshot
 *   is unambiguous about which state it is in.
 * - **A two-state value shows both states**, so both paints appear.
 * - **A partial state is preferred to a full one.** A full bar and an empty bar
 *   look the same at a glance, and a partial one does not.
 */

/**
 * The filler numbers, cycled by index.
 *
 * Chosen inside 8–18 rather than as a spread over the whole two-digit range,
 * because the band has to survive being read *through* a layout's own formula.
 * A sample of 3 beside a sample of 17 is two visibly different numbers and
 * `floor((value - 10) / 2)` over them is −4 and +3, which is a spread nobody
 * would mistake for a broken formula — but a pool whose max is `8 + con` then
 * draws a ceiling of 11, and half of what a preview is for is judging that the
 * number fits its card.
 *
 * No two adjacent entries are equal, and neither are the two at the ends, so a
 * run of consecutive indices never puts one number next to a copy of itself
 * however far it wraps — which is `docs/UI.md`'s own reading of the rule above
 * and the one a design review checks on a shot.
 */
const NUMBERS = [14, 9, 17, 12, 8, 15, 11, 18, 10, 13] as const;

/**
 * Where one component's own run of filler starts, from its stable id.
 *
 * **A component sees only its own config, which is what makes this necessary.**
 * Without it every plain Card in a layout returns the same number — the first of
 * the sequence — and six cards all reading 14 is precisely the failure the
 * sequence above exists to prevent, one level up: a formula reading them has to
 * visibly be doing arithmetic, and it cannot if every card it reads holds the
 * same value. `id` rather than `label` because `id` is the stable identity a
 * formula references (SPEC §5), so renaming a component does not repaint the
 * canvas under an author mid-edit.
 *
 * Shared rather than hashed at each site, on §1's policy tier: what is shared is
 * the rule that a component's filler is keyed to its identity, and four
 * components hashing an id four ways is four places for that to drift.
 *
 * Any small non-negative integer will do — it is an index into a ten-long
 * sequence, so what matters is only that different ids usually land on different
 * entries. Two components colliding is a preview drawing two equal numbers,
 * which is what an unseeded canvas did everywhere; nothing is correct or
 * incorrect about it.
 */
export function sampleSeed(id: string): number {
	let hash = 0;
	for (let at = 0; at < id.length; at++) {
		// The shift-and-add every small string hash uses, kept inside a 32-bit
		// integer by `|0` so a long id cannot drift into float arithmetic and
		// start disagreeing with itself between engines.
		hash = (hash * 31 + id.charCodeAt(at)) | 0;
	}
	return Math.abs(hash);
}

/**
 * One filler number, by index, wrapping at the end of the sequence.
 *
 * A non-negative index, because every caller starts at its component's own
 * `sampleSeed` — which is a magnitude — and counts up from there. It used to
 * normalise a negative one "so a caller may pass a running counter without
 * bounding it first"; no caller ever did, and §1 says not to generalise ahead of
 * the evidence.
 */
export function sampleNumber(index: number): number {
	return NUMBERS[index % NUMBERS.length] as number;
}

/**
 * Filler text for a field or column: its own name, and which one this is.
 *
 * One-based, because the index is what a reader counts rather than what the
 * caller's loop happens to be on: the first item is `Name 1`.
 */
export function sampleText(name: string, index: number): string {
	return `${name} ${index + 1}`;
}

/**
 * Whether the *n*th two-state value is set.
 *
 * A single function rather than each component's own `index % 2`, for
 * `docs/PATTERNS.md` §1's policy tier: what is shared is the rule that a run of
 * flags shows both paints, and a guard test over two copies of it could only
 * assert they still alternate the same way. Set first, so a sample of one
 * shows the marked state — an empty ring is what an empty canvas already drew.
 */
export function sampleFlag(index: number): boolean {
	return index % 2 === 0;
}

/**
 * A visibly partial amount of `whole`: never none, and never all of it.
 *
 * The "partial is preferred to a full one" rule, applied rather than restated at
 * each site — §1's *share the application, not the number*. Three components
 * take it and each means something different by `whole`: a Pool's own ceiling, a
 * Track run's marks end to end, a level column's highest level.
 *
 * Two is the smallest whole with an inside, so anything at or below it is one.
 */
export function samplePart(whole: number): number {
	if (whole <= 0) return 0;
	if (whole <= 2) return 1;
	// Just past half, so the fill reads as deliberate rather than as a control
	// resting at its midpoint, and capped one short of the top so it can never
	// round up into a full bar.
	return Math.min(whole - 1, Math.round(whole * 0.6));
}
