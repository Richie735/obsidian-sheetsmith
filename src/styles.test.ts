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
