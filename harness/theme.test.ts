/*
 * Cascade guard on harness/theme.css.
 *
 * The harness stands in for Obsidian's own chrome, so its rules compete with
 * each other the way a theme's do — and lost the same way once already. An icon
 * button carries `.clickable-icon`, specificity (0,1,0). Every control rule in
 * this file is scoped under `.vertical-tab-content`, which makes
 * `.vertical-tab-content button` (0,1,1) — so a bare `.clickable-icon` rule
 * loses, the icon button takes a text button's padding and border, and the
 * glyph is squeezed to a sliver.
 *
 * That is invisible in code and invisible in a headless render: the DOM is
 * identical either way and only painting reveals it. It shipped once and was
 * caught by a screenshot. This is the check that stops it shipping twice.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

/** Every selector in the file, at-rules and declarations stripped. */
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

const TAB_SCOPE = '.vertical-tab-content';

describe('icon-button rules outweigh the text-button rule', () => {
	const iconRules = selectors().filter((selector) =>
		selector.includes('.clickable-icon'),
	);

	it('finds the icon rules it is meant to be checking', () => {
		// A filter that quietly matched nothing would pass the case below.
		expect(iconRules.length).toBeGreaterThan(0);
	});

	it('scopes every one under the tab', () => {
		const unscoped = iconRules.filter(
			(selector) => !selector.includes(TAB_SCOPE),
		);
		expect(unscoped).toEqual([]);
	});
});

describe('the tab styles its controls, not only a Setting row', () => {
	const all = selectors();

	it('reaches inputs outside .setting-item-control', () => {
		// The list editors build inputs into their own containers. Styling only
		// the control column is what left them as raw browser widgets.
		const reachesInputs = all.some(
			(selector) =>
				selector.startsWith(TAB_SCOPE) && selector.includes("input[type='text']"),
		);
		expect(reachesInputs).toBe(true);
	});
});
