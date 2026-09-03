// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { element } from './element';

/*
 * The cases that matter are the whitespace ones, and what makes them worth
 * writing is that neither DOM this suite runs against would fail without them:
 * `src/test/obsidian-stub.ts` and happy-dom both accept a token a browser
 * refuses, so the assertion has to be on the *tokens* the element ends up with
 * rather than on the call not throwing.
 *
 * The repository-wide scan for a hand-written `classList.add` that a browser
 * would refuse is **not** here — it is `src/class-tokens.test.ts`. It guards a
 * DOM call rather than this extraction, it reads files that never import this
 * module, and it outlives the module. Keeping the two apart is also what stops
 * this file claiming a guard it does not have: nothing here or there catches a
 * fourth hand-rolled copy of the helper, whose `classList.add(one)` carries a
 * variable and no literal to read (`PATTERNS.md` §11 holds that gap).
 */

describe('element', () => {
	const parent = (): HTMLElement => document.createElement('div');

	it('appends the tag it was asked for, to the parent it was given', () => {
		const box = parent();
		const el = element('span', 'sheetsmith-a', box);
		expect(el.tagName).toBe('SPAN');
		expect(box.children[0]).toBe(el);
	});

	it('takes several classes from one space-separated argument', () => {
		// The case the whole module exists for: a `classList.add` handed one name
		// with a space in it throws `InvalidCharacterError` in a browser.
		const el = element('div', 'dropdown sheetsmith-panel-select', parent());
		expect(Array.from(el.classList)).toEqual([
			'dropdown',
			'sheetsmith-panel-select',
		]);
	});

	it('separates on every character a browser would have refused', () => {
		// The five are the DOM spec's ASCII whitespace, which is the exact set
		// `DOMTokenList` throws on — so each one reaching `classList.add` intact
		// would be the render-aborting `DOMException` this module prevents.
		for (const gap of [' ', '\t', '\n', '\f', '\r']) {
			const el = element('div', `sheetsmith-a${gap}sheetsmith-b`, parent());
			expect(Array.from(el.classList)).toEqual(['sheetsmith-a', 'sheetsmith-b']);
		}
	});

	it('keeps a non-breaking space, which a browser keeps too', () => {
		// The reason the separator is not `\s`: U+00A0 is not ASCII whitespace, so
		// a browser accepts it as an ordinary character in a class name. Splitting
		// on it would cut a token the browser would have honoured.
		const el = element('div', 'sheetsmith-a\u00a0b', parent());
		expect(Array.from(el.classList)).toEqual(['sheetsmith-a\u00a0b']);
	});

	it('drops empty parts, so a conditional class string cannot throw', () => {
		const el = element('div', ' sheetsmith-a  sheetsmith-b ', parent());
		expect(Array.from(el.classList)).toEqual(['sheetsmith-a', 'sheetsmith-b']);
	});

	it('adds no class at all for an empty string', () => {
		expect(element('div', '', parent()).classList.length).toBe(0);
	});

	it('sets the text when given it', () => {
		expect(element('p', 'sheetsmith-a', parent(), 'Dagger').textContent).toBe(
			'Dagger',
		);
	});

	it('leaves the element empty when text is omitted', () => {
		// A caller about to append children passes no text, and must not find the
		// word "undefined" in its container.
		expect(element('div', 'sheetsmith-a', parent()).textContent).toBe('');
	});

	it('builds from the parent\'s document, not the global one', () => {
		const other = document.implementation.createHTMLDocument();
		const box = other.createElement('div');
		expect(element('span', 'sheetsmith-a', box).ownerDocument).toBe(other);
	});
});
