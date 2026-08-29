/*
 * What a card's value pill reads at rest, where the layout declared an
 * `effective` formula (SPEC §4.2).
 *
 * One job: turn a stored value and an `effective` formula into the number the
 * pill shows, or into "leave the pill alone". It renders nothing, knows no
 * component, and reads no file — `card-face.ts` decides what to *do* with the
 * answer, and this decides what the answer is.
 *
 * **Shared on the second consumer, which is what `PATTERNS` §1 asks for here
 * rather than a guard test.** Card and Card set had a copy each, and what they
 * shared was not behaviour but four policies:
 *
 * - **Nothing where no formula is declared**, which is what leaves every card
 *   written before this existed exactly what it was.
 * - **Nothing where nothing is stored yet**, because a modifier layered over an
 *   empty field is not a score, and a fresh character's card must not read `+2`
 *   under a blank.
 * - **Nothing where the formula did not resolve**, rather than `?`. A pill is one
 *   number with nowhere to say why it is not one; the derived above it owns the
 *   `?` and the reason behind it.
 * - **Display only**, the fourth argument to `resolveField`, which is the one that
 *   changes an answer rather than withholding it: this is a *second* reading of a
 *   name the component also publishes, so it takes the value phase and leaves the
 *   result phase and any override to the number above it (SPEC §5). Drop that
 *   argument at one call site and a Strength pill reads an override of the
 *   ability *modifier* as the score — which is exactly what nothing noticed until
 *   a review measured it, because both components' tests stub `resolveField` with
 *   a function that never looks at its fourth argument.
 *
 * §1's one-step tier governs: drift between two copies of a policy *is* the whole
 * risk, so a guard test could only assert they still agree, which is what one
 * name says for free. The agreement had been living in a comment — `card.ts` read
 * "Card set's own rule, for its own reason" — and §1 names that exactly as the
 * trap that bred `.sheetsmith-component-label` to five consumers: a comment is not
 * something the next component can reuse.
 *
 * **What did not come along**, on `linked-text.ts`'s own precedent that a clip
 * stayed with its caller: a **dropdown never takes one**, and that is Card's rule
 * alone because Card set has no options. Card guards its own call, and this module
 * does not learn what an option is.
 */

import { RenderContext } from '../types';

/**
 * The pill's number at rest, or `undefined` to leave it reading what is stored.
 *
 * `published` is the name this evaluation is a second reading *of* — a Card's
 * bare id, a Card set entry's `<id>.<key>` — which is what lets the formula's
 * `mod.self` find the right slot.
 */
export function effectiveReading(
	formula: string | undefined,
	stored: string,
	published: string,
	resolve: RenderContext['resolveField'],
): string | undefined {
	if (formula === undefined || stored.trim() === '') return undefined;
	const resolved = resolve('effective', { value: stored }, published, true);
	return typeof resolved === 'number' ? String(resolved) : undefined;
}
