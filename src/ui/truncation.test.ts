// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
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
