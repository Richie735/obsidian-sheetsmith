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

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

/**
 * A selector list split into its selectors.
 *
 * Not `split(',')`: a comma inside `:is(…)` is part of one selector, and
 * splitting on it produced the fragment `.harness-editor) .clickable-icon` —
 * which carries no scope, so the check below reported a rule that was in fact
 * correctly scoped. A guard that misreads the file it is guarding is worse than
 * no guard, because the fix it invites is to the wrong thing.
 */
function split(list: string): string[] {
	const found: string[] = [];
	let depth = 0;
	let buf = '';
	for (const ch of list) {
		if (ch === '(') depth++;
		else if (ch === ')') depth--;
		if (ch === ',' && depth === 0) {
			found.push(buf);
			buf = '';
			continue;
		}
		buf += ch;
	}
	found.push(buf);
	return found.map((part) => part.trim()).filter((part) => part !== '');
}

/** Every selector in the file, at-rules and declarations stripped. */
function selectors(): string[] {
	const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
	const found: string[] = [];
	for (const match of withoutComments.matchAll(/(^|[}{;])([^{}@;]+)\{/gm)) {
		const raw = (match[2] ?? '').trim();
		if (raw === '' || raw.startsWith('@')) continue;
		found.push(...split(raw));
	}
	return found;
}

/*
 * The scope every control rule carries. Written as a substring rather than a
 * prefix, because the rules are scoped to both of the plugin's surfaces now —
 * `:is(.vertical-tab-content, .harness-editor)` — and `:is()` takes the highest
 * specificity of its arguments, so a two-scope selector weighs exactly what the
 * one-scope selector weighed. The check below is about weight, and that is what
 * has not changed.
 */
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
				selector.includes(TAB_SCOPE) && selector.includes("input[type='text']"),
		);
		expect(reachesInputs).toBe(true);
	});
});

describe('the harness measures boxes the way Obsidian does', () => {
	/*
	 * `app.css` declares `* { box-sizing: border-box }` at the top level, so
	 * every width and height in Obsidian is a border-box measurement. The
	 * harness had it nowhere: theme.css set it on form controls only, and
	 * calibrate.mjs dropped it because a universal selector matched neither the
	 * palette pattern nor the settings-chrome list.
	 *
	 * The cost was not subtle once measured. A card taking `height: 100%` of
	 * its grid cell overflowed it by padding plus border — 18px — so the shot
	 * showed the Skills heading painted through the card above it. That
	 * collision does not happen in Obsidian.
	 *
	 * Which makes it the worst kind of bug for this harness to carry. Reviewing
	 * appearance here means reading the shots, so a false positive invites a
	 * fix — margins — for a collision that only exists in the instrument, and
	 * the fix would then be wrong in the app. It masks the real thing equally
	 * well: 18px of phantom slack hides genuine overflow at the same sites.
	 * It was found by measuring, not by looking, because looking is what it
	 * fools.
	 */
	function universalBoxSizing(css: string): boolean {
		const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
		return /(^|[}{;])\s*\*\s*\{[^}]*box-sizing:\s*border-box/m.test(
			withoutComments,
		);
	}

	it('sets border-box on everything in the fallback theme', () => {
		expect(universalBoxSizing(CSS)).toBe(true);
	});

	it('takes the same reset from the real Obsidian when calibrated', () => {
		// Generated and gitignored, so absent on a fresh clone and in CI. When
		// it is there it has to carry the reset, because it is the sheet that
		// wins — an unlayered rule beats the fallback layer above whatever its
		// specificity.
		const generated = new URL('./obsidian.generated.css', import.meta.url);
		if (!existsSync(generated)) return;
		expect(universalBoxSizing(readFileSync(generated, 'utf8'))).toBe(true);
	});
});

describe('&bounded has an opinion about every link in the chain', () => {
	/*
	 * The mode inverts a height down a chain of six elements, and it shipped
	 * skipping one of them.
	 *
	 * `.workspace-leaf` had no rule under `.harness-bounded`, so
	 * `.workspace-leaf-content`'s own `height: 100%` resolved against an auto
	 * height, was ignored, and every element below it grew — 728px of
	 * `.harness-editor` above 4382px of leaf. **The shot still landed**, because
	 * `body` is `overflow: hidden` at `100vh`: it landed as a crop of a grown
	 * pane, which is what a fold looks like. That passed a review, and a
	 * `docs/UI.md` §12 row was retired on it.
	 *
	 * So this is §10's case exactly — a failure looking is no use against,
	 * because looking is what it fools — and the guard is the cheap text one
	 * rather than a browser: `harness/shot.mjs` opens with why there is no
	 * browser dependency here, and happy-dom does no layout, so nothing in this
	 * suite can measure a box.
	 *
	 * **The rule is coverage, not equality.** The obvious formulation — the
	 * selectors the grown rule releases and the ones the bounded rules re-height
	 * must name the same chain — is wrong, and wrong in the direction that
	 * matters: the two lists are disjoint *by design* and stay disjoint after
	 * the fix. `.workspace-leaf-content` and `.view-content` carry heights of
	 * their own, so the grown mode has to release them and the bounded mode has
	 * nothing to add; `.harness-pane`, `.harness-editor` and `.workspace-leaf`
	 * carry none, so the bounded mode supplies one and the grown mode has
	 * nothing to release. What is true of every link is only that *some* rule
	 * names it. The one that no rule named is the one that broke.
	 */
	const CHAIN = [
		'.harness-stage',
		'.harness-pane',
		'.harness-editor',
		'.workspace-leaf',
		'.workspace-leaf-content',
		'.view-content',
	];

	/** The files that actually build the chain, so a rename cannot leave it stale. */
	const BUILDERS = ['./index.html', './harness.ts', '../src/test/obsidian-stub.ts'];

	/**
	 * One class name, matched whole.
	 *
	 * `includes` is what this was, and it made the check vacuous in the one case
	 * it exists for: `.workspace-leaf` is a substring of
	 * `.workspace-leaf-content`, so deleting the leaf's own rule left the link
	 * "claimed" by the release rule naming its child, and the guard stayed green
	 * against the exact bug it was written from. Caught by reintroducing the bug
	 * and watching the test not go red, which is the step that has to be run.
	 */
	function names(selector: string, link: string): boolean {
		return new RegExp(`\\${link}(?![\\w-])`).test(selector);
	}

	const bounded = selectors().filter((selector) =>
		selector.includes('.harness-bounded'),
	);
	const released = selectors().filter((selector) =>
		selector.includes(':not(.harness-bounded)'),
	);

	it('finds the rules it is meant to be checking', () => {
		// Either list matching nothing would pass every case below.
		expect(bounded.length).toBeGreaterThan(0);
		expect(released.length).toBeGreaterThan(0);
	});

	it('names a chain the harness and the stub actually build', () => {
		// The list above is hand-written, which is the thing that rots. A class
		// nothing creates any more is a link this check has stopped guarding,
		// and it would go on passing in silence.
		const sources = BUILDERS.map((path) =>
			readFileSync(new URL(path, import.meta.url), 'utf8'),
		).join('\n');
		// The bare name, because a builder writes `classList.add('workspace-leaf')`
		// rather than a selector — and matched whole for the same reason `names`
		// is, or `workspace-leaf` finds `workspace-leaf-content` and a renamed
		// link goes on passing.
		const missing = CHAIN.filter(
			(link) =>
				!new RegExp(`\\b${link.slice(1)}(?![\\w-])`).test(sources),
		);
		expect(missing).toEqual([]);
	});

	it('gives every link a height or releases it, and never neither', () => {
		const unclaimed = CHAIN.filter(
			(link) =>
				!bounded.some((selector) => names(selector, link)) &&
				!released.some((selector) => names(selector, link)),
		);
		expect(unclaimed).toEqual([]);
	});
});
