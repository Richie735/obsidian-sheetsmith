// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
// For `instanceOf`, which the app installs on Node and this module uses.
import '../test/obsidian-stub';
import { keepFocusClearOfPinned } from './pinned-column-focus';

/*
 * The geometry is faked, and that is why the behaviour is a module of its own:
 * happy-dom lays nothing out, so `getBoundingClientRect` is all zeros and a copy
 * of this inside Table or Roster could never be driven past its first branch.
 *
 * Every case is one row of a scroller whose start is at x = 0 and whose far edge
 * is at x = 155 — Attacks' scroller at 520 — with the name pinned over the first
 * 87px. `scrollLeft` starts at 200, so a shift reads as how far it moved back,
 * or further where the shift is larger, so nothing relies on a clamp at zero.
 */

interface Box {
	left: number;
	width: number;
}

function place(el: Element, box: Box): void {
	el.getBoundingClientRect = () => ({
		left: box.left,
		right: box.left + box.width,
		width: box.width,
		top: 0,
		bottom: 20,
		height: 20,
		x: box.left,
		y: 0,
		toJSON: () => ({}),
	});
}

/** Whether `:focus-visible` matches, which happy-dom cannot be asked. */
function visibleFocus(el: HTMLElement, visible: boolean): void {
	const own = el.matches.bind(el);
	el.matches = (selector: string) =>
		selector === ':focus-visible' ? visible : own(selector);
}

function row(options: {
	pin?: boolean;
	cell: Box;
	control: Box;
	focusVisible?: boolean;
	start?: number;
	pinLeft?: number;
}) {
	const scroller = document.createElement('div');
	const table = scroller.createEl('table');
	const tr = table.createEl('tbody').createEl('tr');
	const pin = options.pin === false ? null : tr.createEl('th', { cls: 'sheetsmith-pinned' });
	const pinInput = pin?.createEl('input');
	const td = tr.createEl('td');
	const control = td.createEl('input');
	document.body.append(scroller);
	place(scroller, { left: 0, width: 155 });
	Object.defineProperty(scroller, 'clientLeft', { value: 0 });
	Object.defineProperty(scroller, 'clientWidth', { value: 155 });
	scroller.scrollLeft = options.start ?? 200;
	if (pin) place(pin, { left: options.pinLeft ?? 0, width: 87 });
	// Inside the pinned cell's box, so the geometry alone would call it covered
	// and only the guard on the pinned cell's own controls leaves it alone.
	if (pinInput) place(pinInput, { left: (options.pinLeft ?? 0) + 8, width: 70 });
	place(td, options.cell);
	place(control, options.control);
	visibleFocus(control, options.focusVisible ?? true);
	if (pinInput) visibleFocus(pinInput, true);
	keepFocusClearOfPinned(scroller, '.sheetsmith-pinned');
	const focus = (el: HTMLElement) =>
		el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
	return { scroller, control, pinInput, focus };
}

describe('keepFocusClearOfPinned', () => {
	it("puts a covered control's cell start against the pinned cell's edge", () => {
		// A number cell at 30..98 with its field at 38..90: 57px of it behind
		// the name, so the cell moves 57px right and its padding shows too.
		const { scroller, control, focus } = row({
			cell: { left: 30, width: 68 },
			control: { left: 38, width: 52 },
		});
		focus(control);
		expect(scroller.scrollLeft).toBe(200 - 57);
	});

	it('brings a control wholly left of the scroller back to the edge', () => {
		// Focus moved back past the scroller's start: the browser would align it
		// with that start, which is under the name.
		const { scroller, control, focus } = row({
			start: 600,
			cell: { left: -120, width: 68 },
			control: { left: -112, width: 52 },
		});
		focus(control);
		expect(scroller.scrollLeft).toBe(200 - 207 + 400);
	});

	it('leaves a control clear of the pinned cell where it is', () => {
		const { scroller, control, focus } = row({
			cell: { left: 87, width: 68 },
			control: { left: 95, width: 52 },
		});
		focus(control);
		expect(scroller.scrollLeft).toBe(200);
	});

	it('leaves a control inside the pinned cell where it is', () => {
		const { scroller, pinInput, focus } = row({
			cell: { left: 30, width: 68 },
			control: { left: 38, width: 52 },
		});
		focus(pinInput as HTMLInputElement);
		expect(scroller.scrollLeft).toBe(200);
	});

	it('does not scroll a control a pointer focused', () => {
		// Pressed on `pointerdown`: scrolling it away from under the pointer would
		// release the press over something else.
		const { scroller, control, focus } = row({
			cell: { left: 30, width: 68 },
			control: { left: 38, width: 52 },
			focusVisible: false,
		});
		focus(control);
		expect(scroller.scrollLeft).toBe(200);
	});

	it('leaves a column drawn ahead of the name where it is while it shows', () => {
		// A ring column before the name, scrolled 30px: the name is not yet at the
		// start, so it sits at 40 and the ring at 8..29 is in plain view beside it.
		const { scroller, control, focus } = row({
			pinLeft: 40,
			cell: { left: 0, width: 37 },
			control: { left: 8, width: 21 },
		});
		focus(control);
		expect(scroller.scrollLeft).toBe(200);
	});

	it('does nothing in a row with no pinned cell', () => {
		const { scroller, control, focus } = row({
			pin: false,
			cell: { left: 30, width: 68 },
			control: { left: 38, width: 52 },
		});
		focus(control);
		expect(scroller.scrollLeft).toBe(200);
	});

	it("puts the control's own start at the edge where its cell's would carry it past the far edge", () => {
		/*
		 * A ring centred in a cell wider than the room beside the name, as
		 * Conditions' `Active` at `text=24`: an 86px cell at 10..96 with its 21px
		 * ring at 83..104, 4px of it under the name. Moving the cell's start to
		 * 87 is 77px and would carry the ring to 160..181, past the far edge at
		 * 155, though it fits in the 68px room. So the ring's own start goes
		 * against the edge instead: 4px.
		 */
		const { scroller, control, focus } = row({
			cell: { left: 10, width: 86 },
			control: { left: 83, width: 21 },
		});
		focus(control);
		expect(scroller.scrollLeft).toBe(200 - 4);
	});

	it("keeps the cell's start against the edge for a control wider than the room", () => {
		// A text field: it cannot be seen whole beside the name at any scroll, so
		// its start is what shows, as `docs/UI.md` §4 rules for a text cell.
		const { scroller, control, focus } = row({
			cell: { left: 0, width: 120 },
			control: { left: 8, width: 104 },
		});
		focus(control);
		expect(scroller.scrollLeft).toBe(200 - 87);
	});
});
