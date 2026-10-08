/*
 * An element that is clipping its text, or not, and the hover that asks.
 *
 * **Why the metrics are faked at all.** happy-dom lays nothing out, so
 * `scrollWidth` and `clientWidth` are both 0 on every element and
 * `ui/truncation.ts`'s branch is unreachable without them. What a component test
 * can prove is where the reveal is bound, and that needs both numbers set.
 *
 * Shared rather than written at each site, on `PATTERNS.md` §1's ladder: four
 * test files had each spelled the same two `defineProperty` calls and the same
 * dispatch (`ui/truncation.test.ts`, `table.test.ts`, `card.test.ts`,
 * `record-set.test.ts`), which is past the third consumer.
 */

/**
 * Give `el` the widths a laid-out element would report: `scrollWidth` past
 * `clientWidth` is clipping. Both are `configurable`, so calling this again
 * re-measures it, as a split dragged wider does.
 */
export function setClip(
	el: HTMLElement,
	scrollWidth: number,
	clientWidth: number,
): void {
	Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true });
	Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true });
}

/** A pointer entering `el`, which is the event `ui/truncation.ts` decides on. */
export function hoverClip(el: HTMLElement): void {
	el.dispatchEvent(new Event('pointerenter'));
}
