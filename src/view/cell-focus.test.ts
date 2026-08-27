// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
// The stub installs `instanceOf` on Element, which the app installs and this
// module uses: constructors are per-window, so `instanceof` is unreliable
// across a popout. Imported for that side effect alone.
import '../test/obsidian-stub';
import { captureFocus, FOCUSABLE, restoreFocus } from './cell-focus';

/*
 * Putting focus back across a rebuild, with the one case that has a trap in it:
 * a control inside a container.
 *
 * A child of a container has a `.sheetsmith-cell` of its own on the container's
 * inner grid, so the control sits in two cells at once. Numbering it against the
 * outer one would make a control's index depend on how many controls the rest of
 * the group happens to have — so adding a card to a group would renumber every
 * control after it, and a commit racing a rebuild would land focus on a
 * different component.
 */

/** A grid where one cell is a container holding two cells of its own. */
function sheet(): {
	root: HTMLElement;
	outer: HTMLInputElement;
	first: HTMLInputElement;
	second: HTMLInputElement;
	trailing: HTMLInputElement;
} {
	const root = document.createElement('div');
	document.body.replaceChildren(root);

	const before = root.createDiv('sheetsmith-cell');
	const outer = before.createEl('input');

	const container = root.createDiv('sheetsmith-cell');
	// The group's own control, which is the collapse heading in the real thing.
	container.createEl('button');
	const inner = container.createDiv('sheetsmith-grid');
	const firstCell = inner.createDiv('sheetsmith-cell');
	firstCell.createEl('input');
	const first = firstCell.createEl('input');
	const secondCell = inner.createDiv('sheetsmith-cell');
	const second = secondCell.createEl('input');

	const after = root.createDiv('sheetsmith-cell');
	const trailing = after.createEl('input');

	return { root, outer, first, second, trailing };
}

describe('captureFocus', () => {
	it('numbers a control inside a container against its own cell', () => {
		const { root, first } = sheet();
		first.focus();
		const saved = captureFocus(root);
		// The second input of the *inner* cell, not the fourth control of the
		// group. Cell 2 is the container itself in document order, so the inner
		// cells are 3 and 4.
		expect(saved).toMatchObject({ cell: 2, control: 1 });
	});

	it('does not renumber a child because a sibling gained a control', () => {
		// The failure the innermost rule exists to prevent, driven rather than
		// described: numbering against the container makes an index depend on
		// what the rest of the group holds.
		const { root, second } = sheet();
		second.focus();
		const before = captureFocus(root);

		const grown = sheet();
		grown.first.parentElement?.createEl('input');
		grown.second.focus();
		expect(captureFocus(grown.root)?.control).toBe(before?.control);
	});

	it('takes the container itself for a control the container owns', () => {
		const { root } = sheet();
		const heading = root.querySelectorAll('button')[0] as HTMLButtonElement;
		heading.focus();
		expect(captureFocus(root)).toMatchObject({ cell: 1, control: 0 });
	});

	it('carries the caret, so a rebuild mid-edit does not move it', () => {
		const { root, outer } = sheet();
		outer.value = 'chain mail';
		outer.focus();
		outer.setSelectionRange(2, 5);
		expect(captureFocus(root)).toMatchObject({ start: 2, end: 5 });
	});

	it('reports nothing where focus is outside the sheet', () => {
		const { root } = sheet();
		const elsewhere = document.body.createEl('input');
		elsewhere.focus();
		expect(captureFocus(root)).toBeNull();
	});
});

describe('restoreFocus', () => {
	it('puts focus back on the same control after a rebuild', () => {
		const { root, second } = sheet();
		second.focus();
		const saved = captureFocus(root);

		// The same layout built again, which is what a committed edit produces.
		const rebuilt = sheet();
		restoreFocus(rebuilt.root, saved);
		expect(rebuilt.root.ownerDocument.activeElement).toBe(rebuilt.second);
	});

	it('counts the same controls capture counted', () => {
		// One selector, because the two identify a control by its index among
		// these: a selector listing one more kind on one side than the other
		// would restore focus to the wrong control rather than fail visibly.
		const { root, trailing } = sheet();
		trailing.focus();
		const saved = captureFocus(root);
		const cells = Array.from(root.querySelectorAll('.sheetsmith-cell'));
		const cell = cells[saved?.cell ?? -1] as HTMLElement;
		expect(Array.from(cell.querySelectorAll(FOCUSABLE))[saved?.control ?? -1]).toBe(
			trailing,
		);
	});

	it('does nothing where the control is gone', () => {
		const { root, trailing } = sheet();
		trailing.focus();
		const saved = captureFocus(root);
		const shrunk = document.createElement('div');
		document.body.replaceChildren(shrunk);
		expect(() => restoreFocus(shrunk, saved)).not.toThrow();
	});

	it('lands on the cell\'s last control where the cell lost controls', () => {
		/*
		 * A cell can hold *fewer* controls after a rebuild than before one, and the
		 * saved index then resolved to `undefined` and returned silently — dropping
		 * focus to the body, which is the exact outcome PATTERNS §5 records as the
		 * reason not to repaint a cell optimistically.
		 *
		 * A near-miss beats a loss: focus stays inside the component the reader was
		 * in, so one more Tab resumes where they were going rather than starting
		 * again from the top of the sheet.
		 */
		const root = document.createElement('div');
		document.body.replaceChildren(root);
		const cell = root.createDiv('sheetsmith-cell');
		const field = cell.createEl('input');
		cell.createEl('a', { href: '#' });
		const last = cell.createEl('a', { href: '#' });
		last.focus();
		const saved = captureFocus(root);
		expect(saved?.control).toBe(2);

		// The same cell rebuilt holding fewer controls, which is a prose block whose
		// asynchronous render has landed only partly. Two, not one, so "the last
		// control" is distinguishable from "the first".
		const shrunk = document.createElement('div');
		document.body.replaceChildren(shrunk);
		const rebuilt = shrunk.createDiv('sheetsmith-cell');
		rebuilt.createEl('input');
		const rebuiltLast = rebuilt.createEl('a', { href: '#' });
		restoreFocus(shrunk, saved);
		expect(shrunk.ownerDocument.activeElement).toBe(rebuiltLast);
		// And not the body, which is what it used to be.
		expect(shrunk.ownerDocument.activeElement).not.toBe(document.body);
		expect(field).toBeTruthy();
	});

	it('leaves an index that is still in range alone', () => {
		// The clamp fires only past the end. Reaching for the last control whenever
		// the cell has one would move focus off the control the reader was actually
		// on, which is a louder bug than the one it was added for — so the middle
		// control has to come back as the middle control.
		const root = document.createElement('div');
		document.body.replaceChildren(root);
		const cell = root.createDiv('sheetsmith-cell');
		cell.createEl('input');
		const middle = cell.createEl('a', { href: '#' });
		cell.createEl('a', { href: '#' });
		middle.focus();
		const saved = captureFocus(root);
		expect(saved?.control).toBe(1);

		const rebuilt = document.createElement('div');
		document.body.replaceChildren(rebuilt);
		const rebuiltCell = rebuilt.createDiv('sheetsmith-cell');
		rebuiltCell.createEl('input');
		const rebuiltMiddle = rebuiltCell.createEl('a', { href: '#' });
		const rebuiltLast = rebuiltCell.createEl('a', { href: '#' });
		restoreFocus(rebuilt, saved);
		expect(rebuilt.ownerDocument.activeElement).toBe(rebuiltMiddle);
		expect(rebuilt.ownerDocument.activeElement).not.toBe(rebuiltLast);
	});

	it('still does nothing where the cell has no controls at all', () => {
		// The clamp reaches for the last control, so a cell that has none has to
		// stay a silent return rather than becoming an error.
		const root = document.createElement('div');
		document.body.replaceChildren(root);
		const cell = root.createDiv('sheetsmith-cell');
		const field = cell.createEl('input');
		field.focus();
		const saved = captureFocus(root);

		const empty = document.createElement('div');
		document.body.replaceChildren(empty);
		empty.createDiv('sheetsmith-cell');
		expect(() => restoreFocus(empty, saved)).not.toThrow();
		expect(empty.ownerDocument.activeElement).toBe(document.body);
	});
});
