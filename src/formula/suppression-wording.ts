/*
 * What a modifier line that is not applying says about why, in one place: a
 * number's lines and a level's or a flag's alike (SPEC §5,
 * `docs/features/non-number-modifiers.md`).
 *
 * One job: the parenthetical a breakdown prints after a suppressed contributor.
 * A module of its own because two reductions word it — the slot's in
 * `modifiers.ts` and the state's in `modifier-states.ts` — and each importing it
 * from the other made one of them the other's re-export, with two import paths
 * for one sentence.
 *
 * Pure, so Constraint 5 holds.
 */

/** Why the winning floor did not raise what it floors, a number or a position. */
export const ALREADY_HIGHER = 'already higher';

/** What a suppressed contributor's parenthetical says. */
export function suppressionWording(
	kind: string,
	tied: boolean,
	/** "value" for an override, "size" for an amount that stacks. */
	measure: 'value' | 'size',
): string {
	// Two wordings because only one of them is ever true. A tie is not a larger
	// modifier, and telling a reader one applies would send them hunting for a
	// number that is not there.
	return tied
		? `another ${kind} of the same ${measure} applies`
		: measure === 'value'
			? `a higher ${kind} applies`
			: `a larger ${kind} applies`;
}
