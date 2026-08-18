/*
 * Cascade guards on styles.css.
 *
 * Obsidian styles `input[type='text']` at specificity (0,1,1), setting a
 * background, a border, padding and a font size. A rule targeting a bare
 * class is (0,1,0) and loses to it, so every declaration that takes chrome
 * off an input is silently discarded — the field keeps its form-control look
 * and its small font, and nothing in a unit test or a type check notices.
 *
 * The whole plugin therefore scopes its field rules under `.sheetsmith-view`.
 * That is invisible in review precisely when it matters most: a component
 * that paints its own border and background never reveals the loss, and only
 * removing the chrome exposes it. Pool shipped that way once. This is the
 * check that stops it shipping that way twice.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

/**
 * Every selector in the file, with at-rule blocks and declarations stripped.
 * Crude by design: a real parser would be a dependency, and the shape being
 * checked here is only ever "what appears before the brace".
 */
function selectors(): string[] {
	const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
	const found: string[] = [];
	for (const match of withoutComments.matchAll(/(^|[}{;])([^{}@;]+)\{/gm)) {
		const raw = (match[2] ?? '').trim();
		if (raw === '' || raw.startsWith('@')) continue;
		for (const part of raw.split(',')) {
			const selector = part.trim();
			if (selector !== '') found.push(selector);
		}
	}
	return found;
}

/**
 * Classes naming a form control the sheet renders. A rule for one of these
 * has to outweigh Obsidian's element rule, which means carrying the view
 * scope. `.sheetsmith-input-invalid` is deliberately not here: it lives in
 * the settings tab, not the sheet, and only sets a border colour.
 */
const FIELD_CLASS = /\.sheetsmith-[a-z-]*(?:-input|-current)\b/;

describe('field rules outweigh Obsidian\'s input styling', () => {
	const fieldRules = selectors().filter((selector) =>
		FIELD_CLASS.test(selector),
	);

	it('finds the field rules it is meant to be checking', () => {
		// A regex that quietly matched nothing would pass every case below.
		expect(fieldRules.length).toBeGreaterThan(8);
	});

	it('scopes every one under .sheetsmith-view', () => {
		const unscoped = fieldRules.filter(
			(selector) => !selector.includes('.sheetsmith-view'),
		);
		expect(unscoped).toEqual([]);
	});
});

describe('the sheet paints its own surfaces', () => {
	it('gives no rule to .sheetsmith-cell, so components must look like objects', () => {
		// Load-bearing for the review that produced this file: the grid hands a
		// component nothing, which is why a component with no surface of its
		// own reads as loose chrome beside the ones that have one.
		const cellRules = selectors().filter((selector) =>
			/\.sheetsmith-cell\b/.test(selector),
		);
		expect(cellRules.every((selector) => selector.includes('-error'))).toBe(
			true,
		);
	});
});

describe('invisible hit targets never overlay a neighbour', () => {
	const CSS_TEXT = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

	it('does not expand the pill\'s step buttons', () => {
		// A 44px box centred on a 16px button in a 4px-gap pill covers the temp
		// field, and the card's router steps aside for anything inside a button
		// — so a tap meant to edit the number stepped it instead. A read gesture
		// that writes is the worst failure this card can have, so the selector
		// carrying the expansion must keep excluding the small variant.
		const expansions = CSS_TEXT.split('\n').filter((line) =>
			/\.sheetsmith-pool-step[^\n]*::after/.test(line),
		);
		expect(expansions.length).toBeGreaterThan(0);
		for (const selector of expansions) {
			expect(selector).toContain(':not(.sheetsmith-pool-step-small)');
		}
	});
});

describe('a filled mark is always visibly filled', () => {
	const CSS_TEXT = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

	/*
	 * A harm run grades its fill along the run, and a grade running from 1/n
	 * to 1 makes the first mark of a six-mark run a sixth of the accent —
	 * against the card, very nearly the empty mark beside it. Two rules keep
	 * the first step legible, and both are invisible in review because they
	 * only show up on the *first* mark of a *long* harm run.
	 */

	it('floors the ramp rather than starting it at nothing', () => {
		// The bare grade in a color-mix percentage is the bug: it is the form
		// that puts the first mark at 1/n of the accent.
		const bare = CSS_TEXT.split('\n').filter((line) =>
			/var\(--sheetsmith-track-grade[^)]*\)\s*\*\s*100%/.test(line),
		);
		expect(bare).toEqual([]);
		expect(CSS_TEXT).toContain('--sheetsmith-track-ramp');
	});

	it('never grades a segment\'s border, whatever the fill does', () => {
		// The level ring keeps its outline at full accent at every level, so
		// the faintest fill still reads as marked. Grading the border too took
		// away the second signal exactly where the first was weakest.
		//
		// Read as whole declarations, not as lines: a graded border is a
		// color-mix spread over four of them, with the share nowhere near the
		// line the property is on. A line-based check passes this file both
		// before and after the fix, which is the failure mode a guard has.
		const blocks = CSS_TEXT.split('}').filter((block) =>
			block.includes('.sheetsmith-track-segment-on'),
		);
		expect(blocks.length).toBeGreaterThan(0);
		const graded: string[] = [];
		for (const block of blocks) {
			const body = block.slice(block.indexOf('{') + 1);
			for (const declaration of body.split(';')) {
				if (!/^\s*border-color\s*:/.test(declaration)) continue;
				if (declaration.includes('--sheetsmith-track-grade')) {
					graded.push(declaration.replace(/\s+/g, ' ').trim());
				}
			}
		}
		expect(graded).toEqual([]);
	});
});

describe('the pool\'s controls are one height by construction', () => {
	const CSS_TEXT = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

	/*
	 * Steppers, the amount trigger, the direction and the field sit in one row
	 * and have to line up. They used to do that by three separate pairs of
	 * declarations carrying the same number at each of three breakpoints, which
	 * is not one height — it is agreement by coincidence in three places a later
	 * edit has to remember all of. They take a single token now, and these are
	 * the checks that keep it that way.
	 */
	const SIZED = [
		'.sheetsmith-pool-step',
		'.sheetsmith-pool-adjust-trigger',
		'.sheetsmith-pool-adjust-direction',
		'.sheetsmith-pool-adjust-amount',
		'.sheetsmith-pool-adjust-panel',
		'.sheetsmith-pool-adjust',
	];

	it('sizes every control in the row from the row\'s own token', () => {
		for (const name of SIZED) {
			// The block that declares a height for this control, if any does.
			const blocks = CSS_TEXT.split('}').filter(
				(block) => block.includes(name + ' {') || block.includes(name + ',\n'),
			);
			const heights = blocks
				.flatMap((block) => block.split('\n'))
				.filter((line) => /^\s*height:/.test(line));
			expect(heights.length, `${name} declares no height`).toBeGreaterThan(0);
			for (const line of heights) {
				expect(line, `${name} sets a height off the token`).toContain(
					'--sheetsmith-pool-control',
				);
			}
		}
	});

	it('keeps a fallback, for a step button rendered outside the row', () => {
		// The token lives on the controls row. The layout editor's sample and any
		// later use of this button elsewhere would otherwise render at zero.
		const uses = CSS_TEXT.split('\n').filter((line) =>
			line.includes('var(--sheetsmith-pool-control'),
		);
		expect(uses.length).toBeGreaterThan(0);
		for (const line of uses) {
			// Either the declaration of the token itself, or a use with a fallback.
			const declares = /^\s*--sheetsmith-pool-control:/.test(line);
			expect(
				declares || line.includes('--sheetsmith-pool-control, var('),
				`no fallback: ${line.trim()}`,
			).toBe(true);
		}
	});
});
