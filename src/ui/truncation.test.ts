// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
// The stub installs `instanceOf` on Element, which the app installs and this
// module uses: constructors are per-window, so `instanceof` is unreliable across
// a popout. Imported for that side effect alone, exactly as
// `view/cell-focus.test.ts` imports it.
import '../test/obsidian-stub';
import { revealWhenTruncated } from './truncation';

/*
 * The metrics are faked, and that is the point of the module existing: happy-dom
 * reports 0 for both, so a copy of this logic inside a component could never be
 * driven over the branch that matters. Here it can.
 */
function sized(scroll: number, client: number, text = ''): HTMLElement {
	const el = document.createElement('div');
	el.textContent = text;
	Object.defineProperty(el, 'scrollWidth', { value: scroll, configurable: true });
	Object.defineProperty(el, 'clientWidth', { value: client, configurable: true });
	return el;
}

describe('revealWhenTruncated', () => {
	it('carries the full text while the element is clipping it', () => {
		const el = sized(200, 100, 'Torch of Revealing');
		revealWhenTruncated(el);
		el.dispatchEvent(new Event('pointerenter'));
		expect(el.getAttribute('title')).toBe('Torch of Revealing');
	});

	it('says nothing where the text already fits', () => {
		// A tooltip repeating something fully legible is noise fired at every
		// pass, which is what the card's label learned.
		const el = sized(100, 100, 'Dagger');
		revealWhenTruncated(el);
		el.dispatchEvent(new Event('pointerenter'));
		expect(el.hasAttribute('title')).toBe(false);
	});

	it('reveals the text the element holds now, not the text it held', () => {
		// A cell repainted after an edit is the same element with new text.
		const el = sized(200, 100, 'Torch of Revealing');
		revealWhenTruncated(el);
		el.textContent = 'A brighter lantern';
		el.dispatchEvent(new Event('pointerenter'));
		expect(el.getAttribute('title')).toBe('A brighter lantern');
	});

	it('reveals a field\'s value, which has no textContent to read', () => {
		/*
		 * **The fourth consumer's branch, and the reason it is not the first
		 * three's spelling.** An `<input>` has no `textContent` at all, so
		 * `textContent ?? ''` would have set the tooltip to the empty string on a
		 * clipped field — a reveal that decided there was nothing to reveal, which
		 * is worse than never binding. A Passport's name is the field in question:
		 * a headline that is also the note's rename.
		 */
		const field = document.createElement('input');
		field.value = 'Thora Ironhelm of Mirabar';
		Object.defineProperty(field, 'scrollWidth', { value: 300, configurable: true });
		Object.defineProperty(field, 'clientWidth', { value: 100, configurable: true });
		revealWhenTruncated(field);
		field.dispatchEvent(new Event('pointerenter'));
		expect(field.getAttribute('title')).toBe('Thora Ironhelm of Mirabar');
	});

	it('says nothing where a field\'s value already fits', () => {
		const field = document.createElement('input');
		field.value = 'Thora';
		Object.defineProperty(field, 'scrollWidth', { value: 100, configurable: true });
		Object.defineProperty(field, 'clientWidth', { value: 100, configurable: true });
		revealWhenTruncated(field);
		field.dispatchEvent(new Event('pointerenter'));
		expect(field.hasAttribute('title')).toBe(false);
	});

	it('reads the value the field holds now, not the one it was bound with', () => {
		// The same reason the `textContent` case above has: a rename typed into the
		// field is the same element with new text, and a caller that had handed
		// over the old string would reveal the old string.
		const field = document.createElement('input');
		field.value = 'Thora';
		Object.defineProperty(field, 'scrollWidth', { value: 300, configurable: true });
		Object.defineProperty(field, 'clientWidth', { value: 100, configurable: true });
		revealWhenTruncated(field);
		field.value = 'Thora Ironhelm of Mirabar';
		field.dispatchEvent(new Event('pointerenter'));
		expect(field.getAttribute('title')).toBe('Thora Ironhelm of Mirabar');
	});

	it('decides again on every hover, since the width follows the pane', () => {
		const el = sized(200, 100, 'Torch of Revealing');
		revealWhenTruncated(el);
		el.dispatchEvent(new Event('pointerenter'));
		expect(el.hasAttribute('title')).toBe(true);
		// The split was dragged wider and the text now fits.
		Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
		el.dispatchEvent(new Event('pointerenter'));
		expect(el.hasAttribute('title')).toBe(false);
	});
});
