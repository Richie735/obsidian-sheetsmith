// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { adoptRenderedLinks, markRenderedResolution } from './linked-text';
import { LinkContext } from '../types';

/*
 * The two halves that exist for anchors this module did not draw.
 *
 * `paintLinkedText` is covered through the components that call it. These two are
 * about the *other* path — the one where Obsidian's renderer drew the anchor —
 * and both exist because that path turned out to carry neither the behaviour nor
 * the resolution state the fallback writes by hand.
 */

/** An anchor shaped as Obsidian's renderer draws one. */
function anchor(
	into: HTMLElement,
	target: string,
	kind: 'internal' | 'external' = 'internal',
): HTMLElement {
	const el = into.ownerDocument.createElement('a');
	el.setAttribute('href', target);
	el.className = kind === 'internal' ? 'internal-link' : 'external-link';
	if (kind === 'internal') el.setAttribute('data-href', target);
	el.textContent = target;
	into.appendChild(el);
	return el;
}

function container(): HTMLElement {
	const el = document.createElement('div');
	document.body.appendChild(el);
	return el;
}

describe('markRenderedResolution', () => {
	it('dims a link to a note the vault does not hold', () => {
		// The renderer marks none of them, so every link in a backstory painted as
		// live — and an inventory of things with no notes yet is the ordinary case.
		const into = container();
		const known = anchor(into, 'Neverwinter');
		const unknown = anchor(into, 'Nowhere');
		markRenderedResolution(into, (t) => t === 'Neverwinter');
		expect(known.classList.contains('is-unresolved')).toBe(false);
		expect(unknown.classList.contains('is-unresolved')).toBe(true);
		into.remove();
	});

	it('clears the mark when the note has since been created', () => {
		// Re-run after every render, so it has to unset as well as set.
		const into = container();
		const el = anchor(into, 'Nowhere');
		markRenderedResolution(into, () => false);
		expect(el.classList.contains('is-unresolved')).toBe(true);
		markRenderedResolution(into, () => true);
		expect(el.classList.contains('is-unresolved')).toBe(false);
		into.remove();
	});

	it('leaves an external link alone', () => {
		const into = container();
		const el = anchor(into, 'https://example.com', 'external');
		markRenderedResolution(into, () => false);
		expect(el.classList.contains('is-unresolved')).toBe(false);
		into.remove();
	});
});

describe('adoptRenderedLinks', () => {
	const spy = () => {
		const opened: string[] = [];
		const previewed: string[] = [];
		const link: LinkContext = {
			resolves: () => true,
			open: (target) => opened.push(target),
			preview: (target) => previewed.push(target),
		};
		return { opened, previewed, link };
	};

	it('answers a press on an anchor that did not exist when it was bound', () => {
		// Delegated for exactly this: the renderer is asynchronous, so there is no
		// moment at which the anchors are all present to walk.
		const into = container();
		const { opened, link } = spy();
		adoptRenderedLinks(into, link);
		const el = anchor(into, 'Neverwinter');
		const event = new MouseEvent('click', { bubbles: true, cancelable: true });
		el.dispatchEvent(event);
		expect(opened).toEqual(['Neverwinter']);
		expect(event.defaultPrevented).toBe(true);
		into.remove();
	});

	it('offers the anchor to the hover preview', () => {
		const into = container();
		const { previewed, link } = spy();
		adoptRenderedLinks(into, link);
		const el = anchor(into, 'Neverwinter');
		el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		expect(previewed).toEqual(['Neverwinter']);
		into.remove();
	});

	it('never touches an external link', () => {
		// Intercepting `https://` would route a working link at a vault holding no
		// such note.
		const into = container();
		const { opened, link } = spy();
		adoptRenderedLinks(into, link);
		const el = anchor(into, 'https://example.com', 'external');
		const event = new MouseEvent('click', { bubbles: true, cancelable: true });
		el.dispatchEvent(event);
		expect(opened).toEqual([]);
		expect(event.defaultPrevented).toBe(false);
		into.remove();
	});

	it('survives the renderer replacing what it drew', () => {
		const into = container();
		const { opened, link } = spy();
		adoptRenderedLinks(into, link);
		anchor(into, 'Neverwinter');
		into.replaceChildren();
		const replaced = anchor(into, 'Waterdeep');
		replaced.dispatchEvent(
			new MouseEvent('click', { bubbles: true, cancelable: true }),
		);
		expect(opened).toEqual(['Waterdeep']);
		into.remove();
	});
});
