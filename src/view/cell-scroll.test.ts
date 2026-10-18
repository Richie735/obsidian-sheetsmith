// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
// For `instanceOf`, which the app installs on Element and this module uses.
import '../test/obsidian-stub';
import { captureScroll, restoreScroll } from './cell-scroll';

/*
 * happy-dom lays nothing out but stores `scrollLeft` as written, so the key and
 * the restore can be driven directly; the browser's clamp is the harness's to
 * show (`harness/measure-groups.mjs` check 10).
 */

/**
 * A sheet of two cells: a plain one holding a field, and one holding a card
 * with a scroller in it, the scroller's class given. Built twice per case, once
 * as the sheet before the commit and once as the rebuild.
 */
function sheet(wrapperClass = 'sheetsmith-test-scroller'): { root: HTMLElement; scroller: HTMLElement } {
	const root = document.createElement('div');
	document.body.replaceChildren(root);
	root.createDiv('sheetsmith-cell').createEl('input');
	const cell = root.createDiv('sheetsmith-cell');
	const box = cell.createDiv('sheetsmith-test-box');
	box.createDiv('sheetsmith-test-heading');
	const scroller = box.createDiv(wrapperClass);
	scroller.createEl('table');
	return { root, scroller };
}

describe('captureScroll and restoreScroll', () => {
	it('puts a scrolled element back on the rebuilt element at the same path', () => {
		const old = sheet();
		old.scroller.scrollLeft = 162;
		const saved = captureScroll(old.root);
		const rebuilt = sheet();
		restoreScroll(rebuilt.root, saved);
		expect(saved).toEqual([{ cell: 1, path: [0, 1], left: 162 }]);
		expect(rebuilt.scroller.scrollLeft).toBe(162);
	});

	it('tells two scrollers of one class in one cell apart by path', () => {
		// A Roster in card layout: one scroller per card, all in one cell.
		const build = () => {
			const root = document.createElement('div');
			document.body.replaceChildren(root);
			const cell = root.createDiv('sheetsmith-cell');
			const scrollers = [0, 1, 2].map(() =>
				cell.createDiv('sheetsmith-test-card').createDiv('sheetsmith-test-scroller'),
			);
			return { root, scrollers };
		};
		const old = build();
		old.scrollers[0]!.scrollLeft = 40;
		old.scrollers[2]!.scrollLeft = 90;
		const saved = captureScroll(old.root);
		const rebuilt = build();
		restoreScroll(rebuilt.root, saved);
		expect(rebuilt.scrollers.map((one) => one.scrollLeft)).toEqual([40, 0, 90]);
	});

	it("keeps a right-to-left scroller's negative offset", () => {
		// Not 0 rather than greater than 0: an RTL scroller scrolled from its
		// start reads a negative `scrollLeft`.
		const old = sheet();
		old.scroller.scrollLeft = -40;
		const saved = captureScroll(old.root);
		const rebuilt = sheet();
		restoreScroll(rebuilt.root, saved);
		expect(saved).toEqual([{ cell: 1, path: [0, 1], left: -40 }]);
		expect(rebuilt.scroller.scrollLeft).toBe(-40);
	});

	it('matches a rebuilt scroller carrying a class the outgoing one lacked', () => {
		const old = sheet('sheetsmith-test-scroller');
		old.scroller.scrollLeft = 75;
		const saved = captureScroll(old.root);
		const rebuilt = sheet('sheetsmith-test-scroller sheetsmith-test-stamped');
		restoreScroll(rebuilt.root, saved);
		expect(rebuilt.scroller.scrollLeft).toBe(75);
	});

	it("keys a scroller inside a group's child to the child's cell, not the group's", () => {
		const build = () => {
			const root = document.createElement('div');
			document.body.replaceChildren(root);
			const group = root.createDiv('sheetsmith-cell');
			group.createEl('button');
			const inner = group.createDiv('sheetsmith-grid');
			inner.createDiv('sheetsmith-cell').createEl('input');
			const scroller = inner.createDiv('sheetsmith-cell').createDiv('sheetsmith-test-scroller');
			return { root, scroller };
		};
		const old = build();
		old.scroller.scrollLeft = 36;
		const saved = captureScroll(old.root);
		const rebuilt = build();
		restoreScroll(rebuilt.root, saved);
		// The group is cell 0 and its children 1 and 2: keyed against the group,
		// the path would run through its inner grid and depend on its siblings.
		expect(saved).toEqual([{ cell: 2, path: [0], left: 36 }]);
		expect(rebuilt.scroller.scrollLeft).toBe(36);
	});

	it('skips a missing cell or path, and captures nothing at 0', () => {
		const old = sheet();
		expect(captureScroll(old.root)).toEqual([]);
		old.scroller.scrollLeft = 50;
		const saved = captureScroll(old.root);
		const empty = document.createElement('div');
		document.body.replaceChildren(empty);
		expect(() => restoreScroll(empty, saved)).not.toThrow();
		// The cell is there and the path is not: the card lost its heading.
		const root = document.createElement('div');
		document.body.replaceChildren(root);
		root.createDiv('sheetsmith-cell');
		const cell = root.createDiv('sheetsmith-cell');
		const lone = cell.createDiv('sheetsmith-test-box').createDiv('sheetsmith-test-scroller');
		expect(() => restoreScroll(root, saved)).not.toThrow();
		expect(lone.scrollLeft).toBe(0);
	});
});
