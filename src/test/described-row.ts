import { expect } from 'vitest';

/*
 * That a row asked for the described-row treatment, in one assertion.
 *
 * The five parts of `editor/described-row.ts` are one policy, so this is
 * `spoken-order.ts`'s own case one folder over (`docs/PATTERNS.md` §2): two
 * consumer tests were each transcribing the same ten lines, and two copies of
 * an assertion about one policy can only ever be checked for still agreeing.
 *
 * **Two of the five parts are checked here and three are the module's.** What a
 * consumer owes is that it *asked* — the classes, the description's position,
 * and the association — which is `docs/UI.md` §9's own split for
 * `.sheetsmith-placed`: the shared rule is checked once, and each consumer's own
 * test checks that it wears it. What is deliberately not asserted is the id's
 * spelling, because that is the one part the two consumers may not share.
 *
 * `lastElementChild` rather than a containment check, because both facts are
 * load bearing and this holds them in one: a direct child is what the CSS needs,
 * and *after* the controls is what puts it on the second flex line rather than
 * the first.
 */
export function expectDescribedRow(
	row: Element | null | undefined,
	control: Element | null | undefined,
): void {
	expect(row?.classList.contains('sheetsmith-add-row')).toBe(true);
	expect(row?.classList.contains('sheetsmith-wrapping-row')).toBe(true);
	const description = row?.lastElementChild;
	expect(description?.classList.contains('setting-item-description')).toBe(
		true,
	);
	// Asserted rather than assumed: an empty id would make the comparison below
	// pass on two elements that are not associated at all, which is §10's
	// vacuous pass.
	expect(description?.id).toBeTruthy();
	expect(control?.getAttribute('aria-describedby')).toBe(description?.id);
}
