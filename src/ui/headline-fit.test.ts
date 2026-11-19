// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
// The stub installs `instanceOf` and the global `createSpan`, which the app
// installs and this module uses.
import '../test/obsidian-stub';
import { setClip } from '../test/clipped';
import { headlineValue, holdsHeadlineStop, refitHeadline, stampHeadline } from './headline-fit';

/*
 * The metrics are faked, as `truncation.test.ts` fakes them: happy-dom reports
 * 0 for both, so the branch that matters is reachable only here.
 */
afterEach(() => document.body.replaceChildren());

function headline(text: string, scroll: number, client: number, focusableWhenCut = false) {
	const host = document.body.createDiv();
	const el = host.createDiv({ text });
	stampHeadline(el, host, focusableWhenCut ? { stop: {} } : {});
	setClip(el, scroll, client);
	return { host, el };
}

const mark = (host: HTMLElement) => host.querySelector('.sheetsmith-headline-mark');

describe('refitHeadline', () => {
	it('cuts a number that does not fit, on it and its host, and lays the mark over the host', () => {
		const { host, el } = headline('355000', 200, 50);
		expect(el.classList.contains('sheetsmith-headline')).toBe(true);
		expect(host.classList.contains('sheetsmith-headline-host')).toBe(true);
		refitHeadline(el);
		expect(el.classList.contains('sheetsmith-headline-cut')).toBe(true);
		expect(host.classList.contains('sheetsmith-headline-cut')).toBe(true);
		expect(mark(host)?.textContent).toBe('⋯');
		expect(mark(host)?.getAttribute('aria-hidden')).toBe('true');
	});

	it('leaves a number that fits uncut, with no mark attached', () => {
		const { host, el } = headline('6', 50, 50);
		refitHeadline(el);
		expect(el.classList.contains('sheetsmith-headline-cut')).toBe(false);
		expect(mark(host)).toBeNull();
	});

	it('takes the mark away when the number comes to fit', () => {
		const { host, el } = headline('355000', 200, 50);
		refitHeadline(el);
		setClip(el, 50, 50);
		refitHeadline(el);
		expect(el.classList.contains('sheetsmith-headline-cut')).toBe(false);
		expect(host.classList.contains('sheetsmith-headline-cut')).toBe(false);
		expect(mark(host)).toBeNull();
	});

	it('never cuts an empty number', () => {
		const { el } = headline('', 200, 50);
		refitHeadline(el);
		expect(el.classList.contains('sheetsmith-headline-cut')).toBe(false);
	});

	it('sets a state and never a size: no inline style, and a second call changes nothing', () => {
		const { host, el } = headline('355000', 200, 50);
		refitHeadline(el);
		const after = [el.className, host.className, host.innerHTML];
		refitHeadline(el);
		expect([el.className, host.className, host.innerHTML]).toEqual(after);
		expect(el.getAttribute('style')).toBeNull();
		expect(host.getAttribute('style')).toBeNull();
		expect(mark(host)?.getAttribute('style') ?? null).toBeNull();
	});

	it('reads a field by its value', () => {
		const host = document.body.createDiv();
		const input = host.createEl('input');
		input.value = '355000';
		stampHeadline(input, host);
		setClip(input, 200, 50);
		refitHeadline(input);
		expect(input.classList.contains('sheetsmith-headline-cut')).toBe(true);
		expect(headlineValue(input)).toBe('355000');
		// A field is a tab stop already and is given no `tabindex`.
		expect(input.hasAttribute('tabindex')).toBe(false);
	});

	it('does nothing to an element it never stamped', () => {
		const el = document.body.createDiv({ text: '355000' });
		setClip(el, 200, 50);
		refitHeadline(el);
		expect(el.className).toBe('');
	});
});

describe('a read-only headline takes a tab stop while cut', () => {
	it('gains the stop when cut, and loses it when it fits again', () => {
		const { el } = headline('355000', 200, 50, true);
		refitHeadline(el);
		expect(el.getAttribute('tabindex')).toBe('0');
		setClip(el, 50, 50);
		refitHeadline(el);
		expect(el.hasAttribute('tabindex')).toBe(false);
	});

	it('keeps the stop while it holds focus, and lets it go on blur', () => {
		const { el } = headline('355000', 200, 50, true);
		refitHeadline(el);
		el.focus();
		setClip(el, 50, 50);
		refitHeadline(el);
		expect(el.getAttribute('tabindex')).toBe('0');
		expect(document.activeElement).toBe(el);
		el.blur();
		expect(el.hasAttribute('tabindex')).toBe(false);
	});

	it('is a button while it holds the stop, renamed on every refit while cut, released once', () => {
		const host = document.body.createDiv();
		const el = host.createDiv({ text: '355000' });
		const holds: boolean[] = [];
		stampHeadline(el, el, { stop: { onHold: (held) => holds.push(held) } });
		setClip(el, 200, 50);
		refitHeadline(el);
		refitHeadline(el);
		expect(el.getAttribute('role')).toBe('button');
		expect(holdsHeadlineStop(el)).toBe(true);
		setClip(el, 50, 50);
		refitHeadline(el);
		expect(el.hasAttribute('role')).toBe(false);
		expect(holdsHeadlineStop(el)).toBe(false);
		// Named again on the second refit, which may follow a repaint; given up once.
		expect(holds).toEqual([true, true, false]);
	});

	it('waits on one blur however many refits find a focused number fitting', () => {
		const { el } = headline('355000', 200, 50, true);
		refitHeadline(el);
		el.focus();
		const added: string[] = [];
		const add = el.addEventListener.bind(el);
		el.addEventListener = ((type: string, ...rest: unknown[]) => {
			added.push(type);
			(add as (...args: unknown[]) => void)(type, ...rest);
		}) as typeof el.addEventListener;
		setClip(el, 50, 50);
		for (let i = 0; i < 5; i++) refitHeadline(el);
		expect(added.filter((type) => type === 'blur')).toHaveLength(1);
		el.blur();
		expect(el.hasAttribute('tabindex')).toBe(false);
	});

	it('keeps the stop through a blur where it is cut again by then', () => {
		const { el } = headline('355000', 200, 50, true);
		refitHeadline(el);
		el.focus();
		setClip(el, 50, 50);
		refitHeadline(el);
		setClip(el, 200, 50);
		refitHeadline(el);
		el.blur();
		expect(el.getAttribute('tabindex')).toBe('0');
	});
});

describe('headlineValue', () => {
	it('reads a cut derived without its mark', () => {
		// A derived is its own host, so its mark is its own child.
		const el = document.body.createDiv({ text: '+25' });
		stampHeadline(el, el);
		setClip(el, 200, 50);
		refitHeadline(el);
		expect(el.textContent).toBe('+25⋯');
		expect(headlineValue(el)).toBe('+25');
	});
});
