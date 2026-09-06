// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import './obsidian-stub';

/*
 * The element helpers the double installs, driven option by option.
 *
 * **Why this file exists at all.** A stub option that is declared and not
 * honoured fails in exactly one direction, and it is the silent one: the app
 * honours the key, the double ignores it, and the test and the harness both go
 * green on markup Obsidian would have built differently. Nothing in a type
 * check or a component test would notice, which is `PATTERNS.md` §10's own
 * standard for when a guard earns its place. `placeholder` is the case that
 * prompted it — seventeen `.placeholder =` assignments across `src/`, any of
 * which a later edit could move into an options object — but the argument is
 * about every member of `DomElementInfo`, so every member is driven here rather
 * than the one that was noticed.
 *
 * **Why it sits in `src/test/`, which §2 says holds no test cases.** That rule
 * keeps this folder from becoming a home for *other* modules' tests, so the
 * shared infrastructure stays infrastructure. A test of the stub itself is the
 * one thing it cannot be pulling in, and §10 wants a module's test beside it.
 * Nothing else belongs here.
 */

function root(): HTMLElement {
	const el = document.createElement('div');
	document.body.replaceChildren(el);
	return el;
}

describe('the element helpers', () => {
	it('appends to the receiver and hands the element back', () => {
		const parent = root();
		const el = parent.createEl('p');
		expect(el.tagName).toBe('P');
		expect(el.parentElement).toBe(parent);
	});

	it('takes a bare string as the class, on all three helpers', () => {
		// `DomElementInfo | string` is the real signature. `createEl` took only
		// the object here until the widening, so this spelling compiled in the
		// app and not under test, which is the wrong way round for a double.
		const parent = root();
		expect(parent.createEl('p', 'alpha').className).toBe('alpha');
		expect(parent.createDiv('beta').className).toBe('beta');
		expect(parent.createSpan('gamma').className).toBe('gamma');
	});

	it('accepts a class as a string, a space-separated string, or an array', () => {
		const parent = root();
		const classes = (o: { cls: string | string[] }) =>
			Array.from(parent.createDiv(o).classList);
		expect(classes({ cls: 'one' })).toEqual(['one']);
		expect(classes({ cls: 'one two' })).toEqual(['one', 'two']);
		expect(classes({ cls: ['one', 'two'] })).toEqual(['one', 'two']);
	});

	it('splits a class on ASCII whitespace, and not on a non-breaking space', () => {
		// `ui/element.ts` argues this at length and the double has to agree with
		// it: a non-breaking space is a legal class character, so `\s` would cut a
		// name the browser keeps. `DOMTokenList` refuses this set and only it.
		const parent = root();
		expect(
			Array.from(parent.createDiv({ cls: 'a\tb\nc\fd\re' }).classList),
		).toEqual(['a', 'b', 'c', 'd', 'e']);
		expect(Array.from(parent.createDiv({ cls: 'a\u00a0b' }).classList)).toEqual([
			'a\u00a0b',
		]);
	});

	it('assigns text, and takes a fragment as well as a string', () => {
		const parent = root();
		expect(parent.createDiv({ text: 'plain' }).textContent).toBe('plain');

		// How a description built by `createFragment` reaches an element.
		const fragment = document.createDocumentFragment();
		fragment.createSpan({ text: 'inside' });
		const el = parent.createDiv({ text: fragment });
		expect(el.querySelector('span')?.textContent).toBe('inside');
	});

	it('sets placeholder as the property, so a field reads it back', () => {
		// The option this whole widening was for.
		const parent = root();
		const input = parent.createEl('input', { placeholder: '—' });
		expect(input.placeholder).toBe('—');
		expect(input.getAttribute('placeholder')).toBe('—');
	});

	it('sets value as the property rather than the attribute', () => {
		// On an input the `value` attribute is the *default* value. Code under
		// test reads the live one, so an attribute here would read as empty.
		const parent = root();
		const input = parent.createEl('input', { value: '7' });
		expect(input.value).toBe('7');
	});

	it('sets type, href and title', () => {
		const parent = root();
		const button = parent.createEl('button', { type: 'button' });
		expect(button.getAttribute('type')).toBe('button');
		const link = parent.createEl('a', { href: '#one', title: 'A link' });
		expect(link.getAttribute('href')).toBe('#one');
		expect(link.getAttribute('title')).toBe('A link');
	});

	it('stringifies a number or a boolean attribute, and skips a null one', () => {
		// `DomElementInfo` allows all four. A null spelled as the string "null"
		// would be an attribute that is present and wrong, which is worse than
		// absent.
		const parent = root();
		const el = parent.createDiv({
			attr: {
				'data-count': 3,
				'aria-hidden': true,
				'data-none': null,
				'data-name': 'x',
			},
		});
		expect(el.getAttribute('data-count')).toBe('3');
		expect(el.getAttribute('aria-hidden')).toBe('true');
		expect(el.hasAttribute('data-none')).toBe(false);
		expect(el.getAttribute('data-name')).toBe('x');
	});

	it('sends the element to `parent` instead of the receiver when given one', () => {
		const receiver = root();
		const elsewhere = document.createElement('section');
		document.body.appendChild(elsewhere);
		const el = receiver.createDiv({ parent: elsewhere });
		expect(el.parentElement).toBe(elsewhere);
		expect(receiver.children.length).toBe(0);
	});

	it('puts the element first with `prepend`, and last without it', () => {
		// The option that lets a caller create in one order and attach in
		// another, which is the whole difficulty a hand-written createElement
		// site has when it is converted.
		const parent = root();
		parent.createDiv('first');
		parent.createDiv('last');
		parent.createDiv({ cls: 'actually-first', prepend: true });
		expect(Array.from(parent.children, (el) => el.className)).toEqual([
			'actually-first',
			'first',
			'last',
		]);
	});

	it('runs the callback after the element is attached', () => {
		// Obsidian's order, and load bearing: a live region has to be in the
		// document before anything writes to it.
		const parent = root();
		let attachedDuringCallback: boolean | null = null;
		parent.createDiv('x', (el) => {
			attachedDuringCallback = el.isConnected;
		});
		expect(attachedDuringCallback).toBe(true);
	});

	it('builds in the parent\'s own document, never the global one', () => {
		// `PATTERNS.md` §5: the view may render into a popout window, and an
		// element built by the wrong document belongs to the wrong window.
		const other = document.implementation.createHTMLDocument('other');
		const parent = other.createElement('div');
		const el = parent.createDiv('x');
		expect(el.ownerDocument).toBe(other);
		expect(el.ownerDocument).not.toBe(document);
	});

	it('honours the same options on a fragment as on an element', () => {
		// The two installers are separate because a DocumentFragment is not an
		// HTMLElement. They share `make`, and this is what says so.
		const fragment = document.createDocumentFragment();
		const el = fragment.createEl('input', {
			cls: 'field',
			placeholder: 'type here',
			attr: { 'data-n': 2 },
		});
		expect(el.parentNode).toBe(fragment);
		expect(el.className).toBe('field');
		expect(el.placeholder).toBe('type here');
		expect(el.getAttribute('data-n')).toBe('2');
		expect(fragment.createDiv('d').className).toBe('d');
		expect(fragment.createSpan('s').className).toBe('s');
	});
});
