// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closePopover, showPopover } from './popover';

/*
 * The popover is the one piece of DOM this plugin puts outside its own views
 * — it attaches to document.body to escape the table's overflow clip, and
 * takes capture-phase listeners on the document and the window with it. What
 * matters is that closing releases every one of them: the callers that close
 * it are teardown paths (view close, plugin unload) with nothing after them
 * to catch what was left behind.
 */

afterEach(() => closePopover());

function anchor(): HTMLElement {
	const el = document.createElement('button');
	document.body.appendChild(el);
	return el;
}

describe('popover', () => {
	it('names its anchor while open, and stops when closed', () => {
		const el = anchor();
		showPopover(el, 'Expertise');
		const bubble = document.querySelector('.sheetsmith-popover');
		expect(bubble?.textContent).toBe('Expertise');
		expect(el.getAttribute('aria-describedby')).toBe(bubble?.id);

		closePopover();
		expect(document.querySelector('.sheetsmith-popover')).toBeNull();
		expect(el.hasAttribute('aria-describedby')).toBe(false);
	});

	it('releases every listener it registered', () => {
		const onDoc = vi.spyOn(document, 'addEventListener');
		const offDoc = vi.spyOn(document, 'removeEventListener');
		const onWin = vi.spyOn(window, 'addEventListener');
		const offWin = vi.spyOn(window, 'removeEventListener');
		try {
			showPopover(anchor(), 'Expertise');
			closePopover();
			// Whatever it hooks, it unhooks — counted rather than named, so a
			// listener added later is not quietly exempt from the teardown.
			expect(offDoc.mock.calls.length).toBe(onDoc.mock.calls.length);
			expect(offWin.mock.calls.length).toBe(onWin.mock.calls.length);
		} finally {
			onDoc.mockRestore();
			offDoc.mockRestore();
			onWin.mockRestore();
			offWin.mockRestore();
		}
	});

	it('closes on the next press anywhere', () => {
		showPopover(anchor(), 'Expertise');
		document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(document.querySelector('.sheetsmith-popover')).toBeNull();
	});

	it('leaves only one behind however many are opened', () => {
		const first = anchor();
		showPopover(first, 'One');
		showPopover(anchor(), 'Two');
		expect(document.querySelectorAll('.sheetsmith-popover')).toHaveLength(1);
		// The one it replaced gives up its description too.
		expect(first.hasAttribute('aria-describedby')).toBe(false);
	});

	it('is safe to close when nothing is open, and to close twice', () => {
		expect(() => closePopover()).not.toThrow();
		showPopover(anchor(), 'Expertise');
		closePopover();
		expect(() => closePopover()).not.toThrow();
	});
});
