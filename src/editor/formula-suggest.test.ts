// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { attachFormulaSuggest } from './formula-suggest';
import { App } from 'obsidian';
import { parseFunctions } from '../formula/functions';
import { Vocabulary, vocabularySource } from '../formula/vocabulary';
import { getComponent } from '../components';
import { ComponentConfig } from '../types';

/*
 * The type-ahead on one formula input.
 *
 * Driven through the DOM the stub's `AbstractInputSuggest` renders rather than
 * through the class, which is the design's own rule: `isOpen` and `suggestEl`
 * are undeclared, so a case reading either would be a case written against
 * members the next Obsidian release can remove silently.
 *
 * **The accept path here is the shipping one and not a fallback**, which is the
 * correction the build made to the design. The design chose
 * `document.execCommand('insertText')` on the claim that a programmatic write
 * resets Chromium's change-tracking baseline, leaving the field never to commit;
 * measured in Obsidian's own renderer, that only happens where the *whole* value
 * came from the write and nothing was typed, which no accept can be — a popup
 * opens on a non-empty fragment only. So `setRangeText` ships, and these cases
 * drive the same code a user does.
 */

function component(over: Record<string, unknown>): ComponentConfig {
	return {
		position: { col: 1, row: 1, width: 1, height: 1 },
		...over,
	} as unknown as ComponentConfig;
}

const COMPONENTS = [
	component({
		id: 'armour_class',
		type: 'card',
		label: 'Armour class',
		derived: '10 + mod.self',
	}),
	component({
		id: 'abilities',
		type: 'card-set',
		label: 'Abilities',
		entries: [
			{ key: 'STR', name: 'Strength' },
			{ key: 'DEX', name: 'Dexterity' },
		],
	}),
	component({ id: 'd6_bonus', type: 'card', label: 'Dice bonus' }),
];

const VOCABULARY: Vocabulary = {
	components: COMPONENTS.map((config) =>
		vocabularySource(config, getComponent(config.type)),
	),
	functions: parseFunctions([]).library,
};

/** A bound input, and a counter for the commits it reports. */
function bound(owner?: string) {
	const input = document.createElement('input');
	input.type = 'text';
	document.body.appendChild(input);
	// Focused before the binding, because the app gates every query on
	// `isActiveElement()` and an unfocused field is a path Obsidian refuses.
	input.focus();
	const commits: string[] = [];
	input.addEventListener('change', () => commits.push(input.value));
	const suggest = attachFormulaSuggest(
		new App(),
		input,
		() => VOCABULARY,
		owner,
	);
	return { input, suggest, commits };
}

/**
 * Type into the field the way a keyboard does.
 *
 * Synchronous, because the app is: `onInputChange` branches on `Array.isArray`
 * and draws a plain array straight through, and this suggester returns one. An
 * `await` here would be scaffolding for a step neither the app nor the double
 * takes.
 */
function type(input: HTMLInputElement, text: string): void {
	input.value = text;
	input.setSelectionRange(text.length, text.length);
	input.dispatchEvent(new Event('input'));
}

/** What the popup is showing: the code and the note of each item. */
function offered(): { name: string; note: string }[] {
	return Array.from(
		document.body.querySelectorAll('.suggestion-container .suggestion-item'),
	).map((item) => ({
		name: item.querySelector('code')?.textContent ?? '',
		note: item.querySelector('.suggestion-note')?.textContent ?? '',
	}));
}

function key(input: HTMLInputElement, name: string): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { key: name, cancelable: true });
	input.dispatchEvent(event);
	return event;
}

beforeEach(() => {
	document.body.replaceChildren();
});

describe('what the popup offers', () => {
	it('draws the name in code type with its owner beside it', async () => {
		const { input } = bound();
		type(input, 'abil');
		expect(offered()).toEqual([{ name: 'abilities', note: 'Abilities' }]);
	});

	it('carries the class the app scopes the note rank to', () => {
		/*
		 * `.suggestion-note` is styled in exactly one place in `app.css`, and it
		 * is `.suggestion-item.mod-complex .suggestion-note`. Without the class
		 * the note draws at the item's own size and colour and the popup shows
		 * two names rather than a name and its owner — invisible in review,
		 * because the popup is the app's chrome and nothing of this plugin's is
		 * missing (`docs/PATTERNS.md` §10).
		 */
		const { input } = bound();
		type(input, 'abil');
		const item = document.body.querySelector('.suggestion-item');
		expect(item?.classList.contains('mod-complex')).toBe(true);
		const content = item?.querySelector('.suggestion-content');
		expect(content?.querySelector('code')?.textContent).toBe('abilities');
		expect(content?.querySelector('.suggestion-note')?.textContent).toBe('Abilities');
	});

	it('offers a name on its own prefix and never a form of it', async () => {
		const { input } = bound();
		type(input, 'armour');
		expect(offered().map((one) => one.name)).toEqual(['armour_class']);
	});

	it('offers nothing for a substring of a name', async () => {
		const { input } = bound();
		type(input, 'class');
		expect(offered()).toEqual([]);
	});

	it('offers nothing over a number literal', async () => {
		const { input } = bound();
		type(input, '10');
		expect(offered()).toEqual([]);
		type(input, '2d');
		expect(offered()).toEqual([]);
	});

	it('offers a name that merely looks like half a dice expression', async () => {
		// The refusal is on the fragment's first character, so `d6` is a name.
		const { input } = bound();
		type(input, 'd6');
		expect(offered().map((one) => one.name)).toEqual(['d6_bonus']);
	});

	it('offers a table its own keys first where the field is one of its cells', async () => {
		const table = component({
			id: 'inventory',
			type: 'table',
			label: 'Inventory',
			columns: [{ key: 'Weight', type: 'number', total: true }],
		});
		const vocabulary: Vocabulary = {
			components: [
				...VOCABULARY.components,
				vocabularySource(table, getComponent('table')),
			],
			functions: VOCABULARY.functions,
		};
		const input = document.createElement('input');
		input.type = 'text';
		document.body.appendChild(input);
		input.focus();
		attachFormulaSuggest(new App(), input, () => vocabulary, 'inventory');
		type(input, 'W');
		expect(offered()[0]?.name).toBe('Weight');
	});
});

describe('nothing is offered unsolicited', () => {
	it('draws no popup on focus', async () => {
		const { input } = bound();
		input.blur();
		input.value = '10 + abilities.DEX';
		input.setSelectionRange(18, 18);
		input.focus();
		expect(offered()).toEqual([]);
	});

	it('draws one as soon as a character is typed', async () => {
		const { input } = bound();
		input.blur();
		input.value = '10 + abilities.DEX';
		input.focus();
		type(input, '10 + abilities.DE');
		expect(offered().map((one) => one.name)).toEqual(['DEX']);
	});
});

describe('accepting a suggestion', () => {
	it('splices over the fragment and leaves its neighbours alone', async () => {
		const { input, suggest } = bound();
		input.value = 'floor(abil) + 1';
		input.setSelectionRange(10, 10);
		input.dispatchEvent(new Event('input'));
		expect(offered().map((one) => one.name)).toEqual(['abilities']);
		key(input, 'Enter');
		expect(input.value).toBe('floor(abilities) + 1');
		expect(suggest).toBeDefined();
	});

	it('leaves the caret after what it inserted', async () => {
		const { input } = bound();
		input.value = 'floor(abil) + 1';
		input.setSelectionRange(10, 10);
		input.dispatchEvent(new Event('input'));
		key(input, 'Enter');
		expect(input.selectionStart).toBe('floor(abilities'.length);
	});

	it('corrects the casing of a member', async () => {
		const { input } = bound();
		type(input, 'abilities.st');
		expect(offered().map((one) => one.name)).toEqual(['STR']);
		key(input, 'Enter');
		expect(input.value).toBe('abilities.STR');
	});

	it('closes, and does not reopen over the name it just wrote', async () => {
		const { input } = bound();
		type(input, 'abil');
		key(input, 'Enter');
		expect(offered()).toEqual([]);
	});

	it('commits on the next change and not on the accept', async () => {
		const { input, commits } = bound();
		type(input, 'abilities');
		// The exact match sorts first, so Enter re-inserts the same text.
		expect(offered()[0]?.name).toBe('abilities');
		key(input, 'Enter');
		expect(input.value).toBe('abilities');
		expect(commits).toEqual([]);
		input.dispatchEvent(new Event('change'));
		expect(commits).toEqual(['abilities']);
	});

	it('reopens on the next character typed', async () => {
		const { input } = bound();
		type(input, 'abil');
		key(input, 'Enter');
		type(input, 'abilities.');
		expect(offered().map((one) => one.name)).toEqual(['STR', 'DEX']);
	});
});

describe('the keys the popup owns', () => {
	it('moves the selection on ArrowDown without moving the caret', async () => {
		const { input } = bound();
		type(input, 'a');
		const caret = input.selectionStart;
		const event = key(input, 'ArrowDown');
		expect(event.defaultPrevented).toBe(true);
		expect(input.selectionStart).toBe(caret);
		expect(
			document.body.querySelector('.suggestion-item.is-selected')?.textContent,
		).toContain('abilities');
	});

	it('closes on a caret move sideways', async () => {
		const { input } = bound();
		type(input, 'abil');
		key(input, 'ArrowLeft');
		expect(offered()).toEqual([]);
	});

	it('closes on a press inside the field', async () => {
		const { input } = bound();
		type(input, 'abil');
		input.dispatchEvent(new Event('pointerdown'));
		expect(offered()).toEqual([]);
	});

	it('closes on Escape and leaves the text as typed', async () => {
		const { input } = bound();
		type(input, 'abil');
		key(input, 'Escape');
		expect(offered()).toEqual([]);
		expect(input.value).toBe('abil');
	});
});

describe('what the input says about itself', () => {
	it('carries aria-autocomplete', () => {
		const { input } = bound();
		expect(input.getAttribute('aria-autocomplete')).toBe('list');
	});
});

describe('closing what a render bound', () => {
	it('takes the popup down without a blur', async () => {
		// An input removed while its popup is open fires no `blur`, so the render
		// loop closes what it bound rather than waiting for one.
		const { input, suggest } = bound();
		type(input, 'abil');
		input.remove();
		suggest.close();
		expect(offered()).toEqual([]);
	});
});
