// @vitest-environment happy-dom
/*
 * What a sheet naming a layout the folder does not hold actually draws
 * (SPEC §8's last bullet, `docs/features/layout-picker.md`).
 *
 * Drivable on its own because it is markup and takes no app: the view it is
 * drawn into cannot be constructed outside Obsidian (`docs/PATTERNS.md` §11),
 * which is the whole reason this state is a module rather than a branch.
 */

import { describe, expect, it, vi } from 'vitest';
import { noLayoutsMessage } from '../layouts';
import { renderMissingLayout } from './missing-layout';

const MESSAGE = 'Layout "Layout that went away" was not found in "Sheetsmith layouts".';

const draw = (
	hasLayouts: boolean,
	onPick: () => void = () => {},
): HTMLElement => {
	const container = document.createElement('div');
	renderMissingLayout(container, {
		message: MESSAGE,
		folder: 'Sheetsmith layouts',
		hasLayouts,
		onPick,
	});
	return container;
};

const notice = (container: HTMLElement): HTMLElement => {
	const el = container.querySelector('.sheetsmith-notice');
	expect(el, 'the notice was not drawn').not.toBeNull();
	return el as HTMLElement;
};

describe('with layouts to offer', () => {
	it('keeps the sheet’s own message and puts the offer beside it', () => {
		const el = notice(draw(true));
		// Verbatim: it names both halves of the lookup, and the offer goes
		// beside it rather than instead of it.
		expect(el.querySelector('p')?.textContent).toBe(MESSAGE);
		const buttons = el.querySelectorAll('button');
		expect(buttons).toHaveLength(1);
		expect(buttons[0]?.textContent).toBe('Pick another layout');
	});

	it('draws the message before the button', () => {
		// Reading order, which is the order a reader meets the two: what is
		// wrong, then what to do about it.
		const children = Array.from(
			notice(draw(true)).children,
			(child: Element) => child.tagName,
		);
		expect(children).toEqual(['P', 'BUTTON']);
	});

	it('leaves the button Obsidian’s own', () => {
		// No Sheetsmith class, so it takes the app's background, hover, hit
		// target and focus ring; its visible text is its accessible name, so no
		// `aria-label` (`docs/UI.md` §6).
		const button = notice(draw(true)).querySelector('button');
		expect(button?.className).toBe('');
		expect(button?.hasAttribute('aria-label')).toBe(false);
	});

	it('opens the picker when pressed', () => {
		const onPick = vi.fn();
		notice(draw(true, onPick)).querySelector('button')?.click();
		expect(onPick).toHaveBeenCalledTimes(1);
	});
});

describe('with no layouts at all', () => {
	it('says what to run instead, and offers no button', () => {
		// A button opening an empty picker is a control that cannot succeed
		// under any input, so it is not drawn at all.
		const el = notice(draw(false));
		const lines = Array.from(
			el.querySelectorAll<HTMLElement>('p'),
			(line) => line.textContent,
		);
		expect(lines).toEqual([
			MESSAGE,
			noLayoutsMessage('Sheetsmith layouts'),
		]);
		expect(el.querySelectorAll('button')).toHaveLength(0);
	});
});

describe('the notice itself', () => {
	it('is the class the view already draws for every unrenderable state', () => {
		// No new class and no new CSS: `.sheetsmith-notice` is the surface, and
		// a second one beside it is `docs/UI.md` §9's lookalike.
		for (const hasLayouts of [true, false]) {
			const container = draw(hasLayouts);
			expect(container.children).toHaveLength(1);
			expect(container.firstElementChild?.className).toBe(
				'sheetsmith-notice',
			);
		}
	});
});
