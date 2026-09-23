// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { ListContext } from './list-fields';
import { nestedList } from './nested-list-field';

/*
 * A list inside one row of another list, driven directly.
 *
 * **Its own file under `PATTERNS.md` §10's `editor/` rule**: a module here with
 * its own entry point *and* its own reportable output earns one, and this has
 * both — `nestedList(parent, options)` takes a plain element and an options bag,
 * and it owns the group's name, the remove's accessible name, two focus tokens,
 * the reserved-and-hidden rule at one line, and the `describeRemoval` route with
 * its "null means drop silently" branch. `copyable-name.ts` is the module that
 * bullet cites as having grown the second half and stayed exempt for want of the
 * first; this one has the first.
 *
 * What it buys over the coverage `modifier-definitions-field.test.ts` already
 * gives is the surface that field cannot reach: a count of zero, a second token
 * namespace, and a `listLabel` that is not the word **Changes**. The floor at one
 * line is the interesting one — the module's header states it as a rule and the
 * *caller* is what holds it, which is a thing worth being able to read here
 * rather than inferring from the one consumer.
 */

interface Recorded {
	confirms: string[];
	adds: number;
	removes: number[];
}

let recorded: Recorded;
let list: ListContext;

beforeEach(() => {
	recorded = { confirms: [], adds: 0, removes: [] };
	list = {
		persist: () => undefined,
		redraw: () => undefined,
		focusAfterRedraw: () => undefined,
		confirm: (message, _cta, onConfirm) => {
			recorded.confirms.push(message);
			onConfirm();
		},
		errors: new Map(),
		drag: { index: null },
	};
});

/** Draw one list, with everything domain-shaped defaulted to something plain. */
function draw(over: Partial<Parameters<typeof nestedList>[1]> = {}): HTMLElement {
	const container = document.createElement('div');
	document.body.replaceChildren(container);
	nestedList(container, {
		count: 2,
		listLabel: 'Changes',
		addLabel: 'Add change',
		token: 'thing',
		context: list,
		renderLine: (line, index) => line.createSpan({ text: `line ${index}` }),
		nameOf: (index) => `line ${index}`,
		onAdd: () => {
			recorded.adds++;
		},
		onRemove: (index) => {
			recorded.removes.push(index);
		},
		...over,
	});
	return container;
}

const lines = (el: HTMLElement) =>
	Array.from(el.querySelectorAll('.sheetsmith-nested-line'));
const tracks = (el: HTMLElement) =>
	Array.from(el.querySelectorAll('.sheetsmith-nested-controls'));

describe('what the frame draws', () => {
	it('names the group, on screen and to a reader arrowing into it', () => {
		// The two strings are one literal, so the accessible name contains the
		// visible text rather than replacing it with a word nowhere on screen
		// (`docs/UI.md` §6).
		const el = draw();
		const listEl = el.querySelector('.sheetsmith-nested-list');
		expect(listEl?.getAttribute('role')).toBe('group');
		expect(listEl?.getAttribute('aria-label')).toBe('Changes');
		expect(
			listEl?.querySelector('.sheetsmith-nested-label')?.textContent,
		).toBe('Changes');
	});

	it('draws one line per count and hands each one to the caller', () => {
		// Everything domain-shaped is the caller's: this module never names a
		// field, a label or a class of theirs, which is what keeps it from
		// learning that a modifier exists.
		const el = draw({ count: 3 });
		expect(lines(el).map((one) => one.textContent)).toEqual([
			'line 0',
			'line 1',
			'line 2',
		]);
	});

	it('draws the footer under the lines, inside the list', () => {
		const el = draw();
		const footer = el.querySelector('.sheetsmith-entry-footer');
		expect(footer?.parentElement?.className).toContain('sheetsmith-nested-list');
		expect(footer?.querySelector('button')?.textContent).toBe('Add change');
	});

	it('draws the frame and nothing else at a count of zero', () => {
		/*
		 * **The floor is the caller's, not this module's**, which is the one claim
		 * its header makes that only this file can check: asked for no lines it
		 * draws no lines, a named group and an **Add** — not a blank line invented
		 * to satisfy a rule it states. The modifier field normalises to one before
		 * it ever calls here, which is why the case is unreachable through it.
		 */
		const el = draw({ count: 0 });
		expect(lines(el)).toHaveLength(0);
		expect(tracks(el)).toHaveLength(0);
		expect(el.querySelector('.sheetsmith-entry-footer')).not.toBeNull();
		expect(
			el.querySelector('.sheetsmith-nested-label')?.textContent,
		).toBe('Changes');
	});
});

describe('the remove control', () => {
	it('reserves and hides the track where there is one line', () => {
		/*
		 * Built and hidden rather than skipped: a control that is not created gives
		 * its width back to the line's grow, so a list holding one-line and
		 * two-line entries would read as two different forms down the pane. Out of
		 * the tab order and out of the accessibility tree with it.
		 */
		const el = draw({ count: 1 });
		const track = tracks(el)[0];
		expect(track?.classList.contains('sheetsmith-nested-controls-reserved')).toBe(
			true,
		);
		expect(track?.getAttribute('aria-hidden')).toBe('true');
		// And no focus token, so a redraw cannot land the hand on an inert control.
		expect(el.querySelector('[data-sheetsmith-focus="thing-0-remove"]')).toBeNull();
	});

	it('names what it would remove, and keys its token by the list and the line', () => {
		const el = draw();
		const remove = el.querySelector<HTMLButtonElement>(
			'[data-sheetsmith-focus="thing-1-remove"]',
		);
		expect(remove?.getAttribute('aria-label')).toBe('Remove line 1');
		// A second list on the pane keys its own controls apart, which is the whole
		// of what `token` is for.
		const other = draw({ token: 'other' });
		expect(
			other.querySelector('[data-sheetsmith-focus="other-1-remove"]'),
		).not.toBeNull();
	});

	it('asks before removing where the caller says there is something to lose', () => {
		const el = draw({ describeRemoval: (index) => `Lose line ${index}?` });
		el.querySelector<HTMLButtonElement>(
			'[data-sheetsmith-focus="thing-1-remove"]',
		)?.click();
		expect(recorded.confirms).toEqual(['Lose line 1?']);
		expect(recorded.removes).toEqual([1]);
	});

	it('drops without asking where the caller says nothing is lost', () => {
		// `addControls`' own contract, so a nested remove and an outer one ask on
		// the same terms: null is "this would destroy nothing", not "skip the
		// question I was going to ask".
		const el = draw({ describeRemoval: () => null });
		el.querySelector<HTMLButtonElement>(
			'[data-sheetsmith-focus="thing-0-remove"]',
		)?.click();
		expect(recorded.confirms).toEqual([]);
		expect(recorded.removes).toEqual([0]);
	});

	it('drops without asking where the caller offers no description at all', () => {
		const el = draw();
		el.querySelector<HTMLButtonElement>(
			'[data-sheetsmith-focus="thing-0-remove"]',
		)?.click();
		expect(recorded.confirms).toEqual([]);
		expect(recorded.removes).toEqual([0]);
	});
});

describe('the add control', () => {
	it('reports the press and writes nothing itself', () => {
		// Persisting and redrawing are the caller's: this module owns the frame and
		// knows nothing about what the list holds.
		const el = draw();
		el.querySelector<HTMLButtonElement>(
			'[data-sheetsmith-focus="thing-add"]',
		)?.click();
		expect(recorded.adds).toBe(1);
		expect(recorded.removes).toEqual([]);
	});
});
