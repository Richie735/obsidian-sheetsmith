/*
 * Keep a focused control out from under its row's pinned cell.
 *
 * A table that scrolls sideways pins its name cell at the scroller's start with
 * an opaque fill, so a row never loses what it is. The browser knows nothing of
 * that: moving focus scrolls a control only until it is inside the scrollport,
 * and the pinned cell covers the scrollport's start. So Shift-Tab back along a
 * table scrolled right lands behind the name — measured over CDP at 520, 4 of
 * Attacks' 8 controls and 18 of Inventory's 34 — and Chrome does not scroll a
 * partly covered button at all, wherever the scroll padding is.
 *
 * **Measured at the moment of focus, not declared in the stylesheet**, which is
 * the answer `docs/BACKLOG.md` first proposed, a `scroll-padding-inline-start`
 * the name's width. Three reasons it is not that. An open table can spell its
 * name's *room* but not its name's width, which is the room only where the
 * longest name reaches it; a closed table and a Roster have no box to declare a
 * room on, and the scroller cannot be a container because Roster shares it
 * (`styles/sheet.css`, the name-room rule). And a scroll padding is a hint the
 * browser applies by its own alignment rules: tried over CDP, it brought a
 * number field clear and left the ring of a toggle, a modifier glyph and a Roster rating
 * where they were, 2 to 16px under the name, since Chrome treats a partly
 * visible button as visible enough. Reading the pinned cell's edge when focus
 * arrives answers all three kinds of scroller with one rule.
 *
 * **The cell's start goes against the name, not the control's**, which is the
 * ruling `docs/UI.md` §4 already gives a text cell: its field clips prose and
 * starts it at the left, so a scroll putting the cell's start beside the name
 * shows the prose's start, and a control flush against the name with its cell's
 * padding behind it reads as clipped. A cell wider than the room left beside
 * the name shows its start and runs past the far edge, which is the same ruling.
 * **Except where that would carry a control that fits the room past the far
 * edge**: a ring centred in a cell its heading widens, Conditions' `Active` at
 * `text=24` in a 28.7px room, went from behind the name to past the far edge,
 * which is as hidden. There the control's own start goes against the name.
 *
 * **Only a focus a pointer did not cause** (`:focus-visible`). A press that
 * focuses on `pointerdown` (`docs/PATTERNS.md` §6) and then scrolls its own
 * control away from under the pointer would release over something else, and a
 * toggle's `click` would go to whatever slid there. Chrome withholds
 * `:focus-visible` from a pressed button and grants it to any text field, so a
 * press into a partly covered field still brings it clear, where nothing
 * commits on release. A key, and a script's focus following one, always match.
 *
 * **And a focus that asked not to scroll is not scrolled, by construction
 * rather than by a check.** `view/cell-focus.ts` restores focus with
 * `preventScroll: true` after a rebuild, which is a new scroller at
 * `scrollLeft` 0: every pinned cell is in its own place there and covers
 * nothing, so the overlap below is never positive. Nothing here can read the
 * option off the event.
 *
 * In `ui/` because it knows no component: the pinned cell's selector arrives
 * from the caller. Two consumers, Table and Roster, which share the name cell's
 * class and nothing else, extracted at two on `interaction/arm-to-confirm.ts`'s
 * ground: the reasons above are invisible in review, and `getBoundingClientRect`
 * is all zeros under happy-dom, so no test could drive two copies over one case
 * without faking the geometry it exists to read.
 */

/**
 * Bind `scroller` so a control focused inside it, in a row whose own cell
 * matching `pinned` covers it, is scrolled clear of that cell.
 *
 * Bound once on the scroller, by delegation, so a repaint of a row rebinds
 * nothing; the scroller is rebuilt with its component, and the listener goes
 * with it.
 */
export function keepFocusClearOfPinned(scroller: HTMLElement, pinned: string): void {
	scroller.addEventListener('focusin', (event) => {
		// `instanceOf`, not `instanceof`: the sheet may live in a pop-out window,
		// whose constructors are its own. A `focusin` target is always a node.
		const target = event.target as Node | null;
		if (!target?.instanceOf(HTMLElement)) return;
		if (!target.matches(':focus-visible')) return;
		const pin = target.closest('tr')?.querySelector(`:scope > ${pinned}`);
		if (!pin || pin.contains(target)) return;
		const pinBox = pin.getBoundingClientRect();
		const edge = pinBox.right;
		const control = target.getBoundingClientRect();
		// What the scroller shows, inside its border.
		const start = scroller.getBoundingClientRect().left + scroller.clientLeft;
		const far = start + scroller.clientWidth;
		// Under the pinned cell, or scrolled out past the start. Not merely left
		// of it: a column drawn ahead of the name sits there, in plain view,
		// whenever the scroll has not yet carried the name to the start.
		const under = control.left < edge && control.right > pinBox.left;
		if (!under && control.left >= start) return;
		const cell = (target.closest('td, th') ?? target).getBoundingClientRect();
		const byCell = edge - cell.left;
		const fits = control.width <= far - edge;
		// The cell's start beside the name, unless that would carry a control
		// that fits beside it past the far edge: then the control's own start.
		const shift = fits && control.right + byCell > far ? edge - control.left : byCell;
		scroller.scrollLeft -= shift;
	});
}
