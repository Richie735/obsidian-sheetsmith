// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
// For `instanceOf`, which the app installs on Element and both halves use.
import '../test/obsidian-stub';
import { capturePosture, restorePosture } from './sheet-posture';

/** One cell holding a scroller with a field in it, as a Table's wrapper does. */
function sheet(): { root: HTMLElement; scroller: HTMLElement; field: HTMLInputElement } {
	const root = document.createElement('div');
	document.body.replaceChildren(root);
	const cell = root.createDiv('sheetsmith-cell');
	const scroller = cell.createDiv('sheetsmith-test-scroller');
	const field = scroller.createEl('input');
	return { root, scroller, field };
}

describe('restorePosture', () => {
	it('restores each scroller before focus, so a focusin handler sees the restored offset', () => {
		// The order `ui/pinned-column-focus.ts` depends on: it measures on the
		// `focusin` the restore fires, and at `scrollLeft` 0 it would measure
		// a scroller the reader never left.
		const old = sheet();
		old.scroller.scrollLeft = 120;
		old.root.scrollTop = 300;
		old.field.focus();
		const saved = capturePosture(old.root);

		const rebuilt = sheet();
		let seen: number | null = null;
		rebuilt.scroller.addEventListener('focusin', () => {
			seen = rebuilt.scroller.scrollLeft;
		});
		restorePosture(rebuilt.root, saved);

		expect(rebuilt.root.ownerDocument.activeElement).toBe(rebuilt.field);
		expect(seen).toBe(120);
		expect(rebuilt.root.scrollTop).toBe(300);
	});
});
