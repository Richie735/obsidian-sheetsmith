import { expect } from 'vitest';

/*
 * Where a component's spoken-only children sit among its visible ones.
 *
 * **The one claim about a rendered component that nothing else in this
 * repository can check.** A `.sheetsmith-sr-only` element is invisible, so the
 * harness photographs the same pixels whether it is the first child or the
 * last, and no assertion about visible order sees it either: `pool.test.ts`'s
 * own order case filters `sr-only` out on the way past. Its position is reading
 * order and nothing else.
 *
 * Last is right. A live region announcing "Portrait saved" or a refusal belongs
 * after the field it is about, so a reader meets the control and then the news
 * about it. First means hearing the announcement before the thing it describes.
 *
 * **This exists because the rule was broken and shipped.** The sweep that moved
 * components onto Obsidian's element helpers turned Image's live region from the
 * last child of its box into the first: `createEl` attaches on creation, and the
 * region has to be created early because `renderPictureFrame` is handed it. The
 * scan classifying that sweep looked for siblings reaching the parent *by name*
 * and could not see through a function call, the component's own tests asserted
 * no order, and all 73 harness shots stayed byte-identical. Three instruments,
 * none of which could see it.
 *
 * Shared rather than written twice, on `PATTERNS.md` §1's one-step tier: this is
 * a policy, and two copies of it could only be tested for still agreeing. The
 * components that keep `createElement` for exactly this reason are enumerated in
 * `PATTERNS.md` §5; each one whose parts have a spoken child should call this.
 */
export function expectSpokenChildrenLast(
	parent: Element | null | undefined,
	count: number,
): void {
	const children = Array.from(parent?.children ?? []);
	const spoken = children.filter((child) =>
		child.classList.contains('sheetsmith-sr-only'),
	);
	// Asserted rather than assumed: a selector that stopped matching would make
	// the order check below pass over an empty list, which is §10's vacuous pass.
	expect(spoken.length).toBe(count);
	expect(children.slice(-count)).toEqual(spoken);
}
