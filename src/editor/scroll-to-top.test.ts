// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../test/obsidian-stub';
import { scrollToTop, visibleBox } from './scroll-to-top';

/*
 * `scroll-to-top.ts` on its own, every branch the pane's reveal does not reach
 * (`docs/features/layout-editor-narrow-regime.md` §4). The pane's tests drive it
 * through a press; these drive the window fallback, a probe nothing reaches
 * and a probe with no box, which a stacked pane never produces.
 *
 * Geometry is staged, since happy-dom lays nothing out. The scroller is 100 to
 * 700 from the window's top with 12px of top padding; the target starts 3000px
 * into its content, less however far the scroller has scrolled, and is 44px
 * tall; the probe is a button inside it at x 200 to 360. `covered` is how far
 * down the window something else answers a press.
 */

const box = (top: number, bottom: number, left: number, right: number) =>
	({ top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top }) as DOMRect;

let scroller: HTMLElement;
let target: HTMLElement;
let probe: HTMLElement;
let covered = 0;
let probeShown = true;
let reached: HTMLElement | null = null;
const xs: number[] = [];
const restore: (() => void)[] = [];

const targetTop = (): number => 100 + 3000 - scroller.scrollTop;

beforeEach(() => {
	covered = 0;
	probeShown = true;
	xs.length = 0;
	scroller = document.body.createDiv();
	scroller.setCssStyles({ overflowY: 'auto', paddingTop: '12px' });
	target = scroller.createDiv();
	probe = target.createEl('button');
	reached = probe;
	const rect = vi
		.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
		.mockImplementation(function (this: HTMLElement) {
			if (this === scroller) return box(100, 700, 0, 380);
			if (this === target) return box(targetTop(), targetTop() + 44, 0, 380);
			if (this === probe) {
				return probeShown ? box(targetTop(), targetTop() + 44, 200, 360) : box(0, 0, 0, 0);
			}
			return box(0, 0, 0, 0);
		});
	const hit = vi.spyOn(document, 'elementFromPoint').mockImplementation((x, y) => {
		xs.push(x);
		if (y < covered) return document.body;
		return x >= 200 && x < 360 && y >= targetTop() && y < targetTop() + 44 ? reached : null;
	});
	restore.push(() => rect.mockRestore(), () => hit.mockRestore(), () => scroller.remove());
});

afterEach(() => {
	for (const undo of restore.splice(0)) undo();
});

describe('bringing an element to the top of its scroller', () => {
	it('lands it at the scroller\'s content edge, under its top padding', () => {
		scrollToTop(target, probe);
		expect(targetTop()).toBe(112);
	});

	it('lands it below whatever answers a press there, probed down the probe\'s centre line', () => {
		covered = 146;
		scrollToTop(target, probe);
		expect(targetTop()).toBe(146);
		expect(new Set(xs)).toEqual(new Set([280]));
	});

	it('leaves it at the content edge where nothing on that line reaches the probe', () => {
		// Covered whole, or a hit test that answers nothing: no information, so
		// no second scroll.
		reached = null;
		scrollToTop(target, probe);
		expect(targetTop()).toBe(112);
	});

	it('hit-tests nothing for a probe that is not displayed', () => {
		probeShown = false;
		covered = 146;
		scrollToTop(target, probe);
		expect(targetTop()).toBe(112);
		expect(xs).toEqual([]);
	});

	it('scrolls the window where nothing between scrolls', () => {
		scroller.setCssStyles({ overflowY: 'visible' });
		const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
		restore.push(() => scrollBy.mockRestore());
		scrollToTop(target, probe);
		// The window's top is 0 and it has no padding to land under.
		expect(scrollBy).toHaveBeenCalledTimes(1);
		expect(scrollBy).toHaveBeenCalledWith(0, 3100);
	});
});

describe('the box a reader sees an element through', () => {
	it('is its scroller\'s, or the window\'s where nothing between scrolls', () => {
		expect(visibleBox(target)).toEqual({ top: 100, bottom: 700 });
		scroller.setCssStyles({ overflowY: 'visible' });
		expect(visibleBox(target)).toEqual({ top: 0, bottom: window.innerHeight });
	});
});
