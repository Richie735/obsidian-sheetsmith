/*
 * What a field's rule says when nobody typed anything.
 *
 * One rule, and it is the difference between the two moments a field is
 * judged: a `change` listener that refuses a keystroke composes its own
 * ending — "…, so this one was left as `"X"`." — because something was
 * reverted, while a render has nothing to revert and so states the reason
 * alone, ending it (`docs/features/field-render-validation.md`). A rule
 * therefore returns its reason with no trailing period and each moment
 * finishes the sentence its own way; this is the render-time half.
 *
 * **A module because a second file wanted it**, which is `docs/PATTERNS.md`
 * §1's one-step tier: this is a policy rather than a behaviour, so the ladder
 * does not run to three, and the only thing a guard test over two copies could
 * assert is that they still end a sentence the same way. It lived in
 * `list-fields.ts` while that file's four render calls were the only callers,
 * and `modifier-definitions-field.ts`'s **Name** field made it two files.
 *
 * **Here rather than exported from `list-fields.ts`**, on the destination
 * `field-error.ts`'s own header argues for one module over: a file whose job is
 * "list-shaped config fields" cannot be the home of a rule with nothing
 * list-shaped about it, and the alternative was a sixth import from that file
 * into a module `docs/BACKLOG.md` § Patterns already carries a coupling row
 * about. Named `field-reason.ts` on `field-formula.ts`'s rule: the folder spells
 * a widget `X-field.ts` and a policy about fields `field-X.ts`.
 *
 * **No test file of its own, which is `PATTERNS.md` §10's stated exception
 * rather than a gap.** A case here could only restate the implementation; what
 * is worth asserting is that a *refused stored value* reads as a finished
 * sentence, which is a caller's claim. Six render cases drive it —
 * `list-fields.test.ts` over a row's name, a row's key, a column's key and an
 * entry's primary field, and `modifier-definitions-field.test.ts` over a blank
 * and a repeated modifier name — each asserting the whole message rather than
 * the ending.
 */

/**
 * A rule's bare reason as the message a render draws: `null` passes straight
 * through, since a field that validates clean is indistinguishable from one
 * never touched.
 *
 * Deliberately not used by the `change` listeners that refuse a keystroke.
 * Each of those composes a *pair* of sentences in one ternary — the bare reason
 * where there is nothing to have been left as, the revert clause otherwise —
 * so the reason is known non-null there and routing it through a function that
 * answers `string | null` would buy a non-null assertion and no clarity.
 */
export function reasonMessage(reason: string | null): string | null {
	return reason === null ? null : `${reason}.`;
}
