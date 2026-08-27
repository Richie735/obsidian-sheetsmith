// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { spellcheckWhileFocused } from './spellcheck';

/*
 * The attribute is what is asserted throughout, and deliberately: it is what
 * Blink parses to remove markers it has already placed, and happy-dom's
 * `spellcheck` IDL property does not reflect to it, so a test written against
 * the property would pass while the browser saw nothing.
 */
function bound(): HTMLTextAreaElement {
	const field = document.createElement('textarea');
	spellcheckWhileFocused(field);
	return field;
}

describe('spellcheckWhileFocused', () => {
	it('starts off, since a field renders unfocused under its layer', () => {
		expect(bound().getAttribute('spellcheck')).toBe('false');
	});

	it('marks the text once the field is the visible one', () => {
		const field = bound();
		field.dispatchEvent(new Event('focus'));
		expect(field.getAttribute('spellcheck')).toBe('true');
	});

	it('goes back off on blur, which is what clears the existing marks', () => {
		const field = bound();
		field.dispatchEvent(new Event('focus'));
		field.dispatchEvent(new Event('blur'));
		expect(field.getAttribute('spellcheck')).toBe('false');
	});

	it('leaves the field in the tab order, which is the point of the pattern', () => {
		// `visibility: hidden` and a `tabindex` of -1 are the fixes this one exists
		// instead of: the view's focus restoration counts the same controls across
		// a rebuild, so the field has to stay reachable in both states.
		const field = bound();
		expect(field.hasAttribute('tabindex')).toBe(false);
		expect(field.hidden).toBe(false);
	});
});
