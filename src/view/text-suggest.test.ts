// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { attachTextSuggest } from './text-suggest';
// From 'obsidian', as `file-suggest.test.ts` does: the type checked is the real
// declaration and the class that runs is the double.
import { App } from 'obsidian';

const NAMES = ['Blood Hunter', 'Fighter', 'Wizard', 'Wizard of the Coast'];

/** A bound input, focused, and the commits it reports. */
function bound(names: readonly string[] = NAMES) {
	const input = document.createElement('input');
	input.type = 'text';
	document.body.appendChild(input);
	const commits: string[] = [];
	const suggest = attachTextSuggest(new App(), input, names, (next) =>
		commits.push(next),
	);
	input.focus();
	return { input, suggest, commits };
}

function type(input: HTMLInputElement, text: string): void {
	input.value = text;
	input.dispatchEvent(new Event('input'));
}

const offered = (): string[] =>
	Array.from(
		document.body.querySelectorAll('.suggestion-container .suggestion-item'),
	).map((item) => item.textContent ?? '');

const key = (input: HTMLInputElement, name: string): void => {
	input.dispatchEvent(new KeyboardEvent('keydown', { key: name, cancelable: true }));
};

beforeEach(() => {
	document.body.replaceChildren();
});

describe('when the list opens', () => {
	it('offers nothing on focus alone, even over a field holding a value', () => {
		const { input } = bound();
		input.value = 'Fighter';
		input.blur();
		input.focus();
		expect(offered()).toEqual([]);
	});

	it('opens when the reader types', () => {
		const { input } = bound();
		type(input, 'w');
		expect(offered()).toEqual(['Wizard', 'Wizard of the Coast']);
	});

	it('closes and stays shut when focus leaves and returns', () => {
		const { input } = bound();
		type(input, 'w');
		input.blur();
		expect(offered()).toEqual([]);
		input.focus();
		expect(offered()).toEqual([]);
	});

	it('closes on a caret move that is not typing, and on a press in the field', () => {
		const { input } = bound();
		type(input, 'w');
		key(input, 'ArrowLeft');
		expect(offered()).toEqual([]);
		type(input, 'w');
		input.dispatchEvent(new Event('pointerdown'));
		expect(offered()).toEqual([]);
	});

	it('says a list may appear, and nothing more about the popup', () => {
		const { input } = bound();
		expect(input.getAttribute('aria-autocomplete')).toBe('list');
		expect(input.hasAttribute('aria-expanded')).toBe(false);
		expect(input.hasAttribute('aria-controls')).toBe(false);
	});
});

describe('what it offers', () => {
	it('matches a substring of the name without regard to case or padding', () => {
		const { input } = bound();
		type(input, '  HUNT ');
		expect(offered()).toEqual(['Blood Hunter']);
	});

	it('offers every name once the field is cleared by typing', () => {
		const { input } = bound();
		type(input, 'f');
		type(input, '');
		expect(offered()).toEqual(NAMES);
	});

	it('offers a name whose case differs from what is typed, since the pick chooses the spelling', () => {
		const { input } = bound();
		type(input, 'fighter');
		expect(offered()).toEqual(['Fighter']);
	});

	it('leaves out a name identical to what is in the field', () => {
		const { input } = bound();
		type(input, 'Fighter');
		expect(offered()).toEqual([]);
	});

	it('offers nothing for a name it was not handed', () => {
		const { input } = bound();
		type(input, 'rogue');
		expect(offered()).toEqual([]);
		const none = bound([]);
		type(none.input, 'a');
		expect(offered()).toEqual([]);
	});
});

describe('accepting a name', () => {
	it('fills the field and commits it through the field’s own gesture', () => {
		const { input, commits } = bound();
		type(input, 'wiz');
		key(input, 'Enter');
		expect(input.value).toBe('Wizard');
		expect(commits).toEqual(['Wizard']);
		expect(offered()).toEqual([]);
	});

	it('commits the highlighted name after the arrows move it', () => {
		const { input, commits } = bound();
		type(input, 'wiz');
		key(input, 'ArrowDown');
		key(input, 'Enter');
		expect(commits).toEqual(['Wizard of the Coast']);
	});

	it('does not reopen over the name just chosen', () => {
		const { input } = bound();
		type(input, 'wiz');
		document.body
			.querySelector<HTMLElement>('.suggestion-item')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(offered()).toEqual([]);
		input.dispatchEvent(new Event('focus'));
		expect(offered()).toEqual([]);
	});

	it('commits nothing on Escape, which closes the popup first', () => {
		const { input, commits } = bound();
		type(input, 'wiz');
		key(input, 'Escape');
		expect(offered()).toEqual([]);
		expect(commits).toEqual([]);
		expect(input.value).toBe('wiz');
	});
});
