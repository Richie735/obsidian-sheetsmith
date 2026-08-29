// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	closeAnchoredPanel,
	dropDetachedAnchoredPanel,
	focusFirstControl,
	openAnchoredPanelKey,
	reanchorAnchoredPanel,
	showAnchoredPanel,
} from './anchored-panel';
import { closePopover, showPopover } from './popover';

/*
 * The anchored panel: what `Menu` gave free and this owes.
 *
 * Six of the things asserted here are behaviours Obsidian's own menu supplied —
 * placement and clamping, dismissal on a press outside, Escape, the focus return,
 * a focus cycle, and repositioning rather than closing on a scroll — so each is
 * asserted rather than assumed. Nothing here knows what a modifier is; the form's
 * own composition is `components/table.test.ts`'s.
 */

afterEach(() => {
	closeAnchoredPanel();
	closePopover();
});

/** An anchor with a measurable box, since happy-dom measures nothing. */
function anchor(box: Partial<DOMRect> = {}): HTMLElement {
	const el = document.createElement('button');
	document.body.appendChild(el);
	el.getBoundingClientRect = () =>
		({
			left: 40,
			top: 200,
			bottom: 220,
			width: 20,
			height: 20,
			...box,
		}) as DOMRect;
	return el;
}

/** Two buttons and a field, which is the shape a form has. */
function fill(body: HTMLElement): HTMLElement[] {
	return ['button', 'input', 'button'].map((tag) => {
		const el = document.createElement(tag);
		body.appendChild(el);
		return el;
	});
}

describe('the panel a control opens', () => {
	it('is a dialog named for what it is about', () => {
		showAnchoredPanel(anchor(), 'Modifiers on "Belt of Giant Strength"', 'k', {});
		const panel = document.querySelector('.sheetsmith-panel');
		expect(panel?.getAttribute('role')).toBe('dialog');
		expect(panel?.getAttribute('aria-label')).toBe(
			'Modifiers on "Belt of Giant Strength"',
		);
	});

	it('holds one at a time, so a second opening replaces the first', () => {
		showAnchoredPanel(anchor(), 'One', 'a', {});
		showAnchoredPanel(anchor(), 'Two', 'b', {});
		expect(document.querySelectorAll('.sheetsmith-panel')).toHaveLength(1);
		expect(openAnchoredPanelKey()).toBe('b');
	});

	it('moves focus to its first control on open', () => {
		const panel = showAnchoredPanel(anchor(), 'One', 'a', {});
		const [first] = fill(panel.body);
		focusFirstControl(panel);
		expect(document.activeElement).toBe(first);
	});

	it('closes on a press outside, and not on one inside', () => {
		const el = anchor();
		const panel = showAnchoredPanel(el, 'One', 'a', {});
		fill(panel.body);
		// Capture, so a press something else swallows still counts as the reader
		// moving on — the same dismissal `popover.ts` makes, for the same reason.
		panel.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(document.querySelector('.sheetsmith-panel')).not.toBeNull();
		// And a press on the anchor is the control's own second press, which closes
		// it through the caller rather than through this listener.
		el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(document.querySelector('.sheetsmith-panel')).not.toBeNull();
		document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(document.querySelector('.sheetsmith-panel')).toBeNull();
	});

	it('closes on Escape and puts focus back on the control that opened it', () => {
		const el = anchor();
		const panel = showAnchoredPanel(el, 'One', 'a', {});
		fill(panel.body);
		focusFirstControl(panel);
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(document.querySelector('.sheetsmith-panel')).toBeNull();
		// The half a keyboard reader will try first, and the half `Menu` gave free.
		expect(document.activeElement).toBe(el);
	});

	it('cycles Tab within itself, in both directions', () => {
		/*
		 * **Owed rather than inherited.** The panel is appended to `document.body`,
		 * because the table it belongs to scrolls inside an overflow box that would
		 * clip it — so it is nowhere near the anchor in DOM order, and without this
		 * a Tab out of the last field lands on whatever follows the sheet's own last
		 * control.
		 */
		const panel = showAnchoredPanel(anchor(), 'One', 'a', {});
		const stops = fill(panel.body);
		const first = stops[0] as HTMLElement;
		const last = stops[2] as HTMLElement;

		last.focus();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
		expect(document.activeElement).toBe(first);

		first.focus();
		document.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }),
		);
		expect(document.activeElement).toBe(last);
	});

	it('repositions on a scroll rather than dismissing', () => {
		/*
		 * The one departure from `showPopover`'s regime, and it is argued: a bubble
		 * is a thing you read, so a scroll means you have moved on — while a form is
		 * a thing you are filling in and a table scrolls inside its own overflow box
		 * under the smallest wheel gesture.
		 */
		const el = anchor();
		showAnchoredPanel(el, 'One', 'a', {});
		const panel = document.querySelector('.sheetsmith-panel') as HTMLElement;
		// Moved out of place and then scrolled, so a *reposition* is distinguishable
		// from doing nothing. Set directly rather than through a class, which is what
		// `no-static-styles-assignment` is about: the value is the one this module
		// computes from a measurement, so a class could not carry it.
		panel.setAttribute('style', `${panel.getAttribute('style') ?? ''}top: 999px;`);
		window.dispatchEvent(new Event('scroll'));
		expect(document.querySelector('.sheetsmith-panel')).not.toBeNull();
		expect(panel.style.top).not.toBe('999px');
	});

	it('releases every listener it registered', () => {
		const onDoc = vi.spyOn(document, 'addEventListener');
		const offDoc = vi.spyOn(document, 'removeEventListener');
		const onWin = vi.spyOn(window, 'addEventListener');
		const offWin = vi.spyOn(window, 'removeEventListener');
		try {
			showAnchoredPanel(anchor(), 'One', 'a', {});
			closeAnchoredPanel();
			// Counted rather than named, so a listener added later is not quietly
			// exempt from the teardown.
			expect(offDoc.mock.calls.length).toBe(onDoc.mock.calls.length);
			expect(offWin.mock.calls.length).toBe(onWin.mock.calls.length);
		} finally {
			onDoc.mockRestore();
			offDoc.mockRestore();
			onWin.mockRestore();
			offWin.mockRestore();
		}
	});
});

describe('the panel surviving the surface that drew it', () => {
	it('hands itself and its state to a freshly drawn control with the same key', () => {
		/*
		 * **This is what "the panel stays open across every commit" is made of**, and
		 * it is the best thing this surface buys over the menu it replaced. The sheet
		 * re-renders on every committed edit, so the control the panel was anchored
		 * to is destroyed and replaced by an identical one.
		 */
		const first = anchor();
		const panel = showAnchoredPanel(first, 'One', 'cell:1', { open: 2 });
		first.remove();
		const second = anchor();
		const back = reanchorAnchoredPanel<{ open: number }>('cell:1', second);
		expect(back?.state).toEqual({ open: 2 });
		expect(back?.body).toBe(panel.body);
		// And Escape now returns focus to the *new* control.
		back?.close();
		expect(document.activeElement).toBe(second);
	});

	it('hands nothing to a control the open panel does not belong to', () => {
		showAnchoredPanel(anchor(), 'One', 'cell:1', {});
		expect(reanchorAnchoredPanel('cell:2', anchor())).toBeNull();
	});

	it('drops a panel whose control is no longer on the page', () => {
		// The other half of re-anchoring: a render that no longer draws the cell the
		// panel belonged to would leave it floating over a sheet it has nothing to
		// do with.
		const el = anchor();
		showAnchoredPanel(el, 'One', 'cell:1', {});
		dropDetachedAnchoredPanel();
		expect(document.querySelector('.sheetsmith-panel')).not.toBeNull();
		el.remove();
		dropDetachedAnchoredPanel();
		expect(document.querySelector('.sheetsmith-panel')).toBeNull();
		expect(openAnchoredPanelKey()).toBeNull();
	});
});

describe('the placement both floating surfaces share', () => {
	it('clamps a panel and a bubble to the same left edge', () => {
		/*
		 * **The cheapest guard against the two drifting.** "Clamped into the
		 * viewport" is one policy, and two copies of it coming apart is a visible bug
		 * at the one edge nobody photographs. Both go through `placeAnchored`, so
		 * both answer alike at an edge.
		 */
		const off = { left: -400, top: 200, bottom: 220, width: 20, height: 20 };
		showAnchoredPanel(anchor(off), 'One', 'a', {});
		const panelLeft = (
			document.querySelector('.sheetsmith-panel') as HTMLElement
		).style.left;
		closeAnchoredPanel();
		showPopover(anchor(off), 'Expertise');
		const bubbleLeft = (
			document.querySelector('.sheetsmith-popover') as HTMLElement
		).style.left;
		expect(panelLeft).toBe(bubbleLeft);
	});

	it('puts both below the anchor where there is no room above', () => {
		// Above where there is room, below where there is not — one arithmetic, so
		// the flip cannot happen for one surface and not the other.
		const tight = { left: 40, top: 0, bottom: 20, width: 20, height: 20 };
		showAnchoredPanel(anchor(tight), 'One', 'a', {});
		const panelTop = (
			document.querySelector('.sheetsmith-panel') as HTMLElement
		).style.top;
		closeAnchoredPanel();
		showPopover(anchor(tight), 'Expertise');
		const bubbleTop = (
			document.querySelector('.sheetsmith-popover') as HTMLElement
		).style.top;
		expect(panelTop).toBe(bubbleTop);
		expect(panelTop).toBe('28px');
	});
});
