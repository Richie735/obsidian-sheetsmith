/*
 * Guards on styles.css, and on the class names that reach it.
 *
 * Most of this file is cascade guards.
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

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PARTS, renderStyles } from '../styles.build.mjs';

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

describe('a container query sits below what it overrides', () => {
	/*
	 * `@container` and `@media` add no specificity, so an equal selector
	 * further down the file simply wins and the narrow layout never applies.
	 * The file says so in a comment on the sheet's own reflow — and the
	 * attribute tables broke the rule anyway, so their header never hid and
	 * their rows never stacked on a narrow settings pane. Nothing in a type
	 * check or a unit test noticed, and nothing would have until someone
	 * dragged the pane narrow enough to look.
	 *
	 * Compared property by property, not selector by selector: the same
	 * selector appearing later is only a problem where the two declare the
	 * same thing, and most do not.
	 */
	const CSS_TEXT = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
		.replace(/\/\*[\s\S]*?\*\//g, '');

	interface Frame {
		selector: string;
		bodyFrom: number;
		/** The at-rule this sits in, if any. Its `to` is filled in on close. */
		guard: { to: number } | null;
		isAt: boolean;
	}

	interface Rule {
		selectors: string[];
		properties: Set<string>;
		/** Where the enclosing at-rule block ends, or null at top level. */
		guard: { to: number } | null;
		at: number;
	}

	/**
	 * Every rule in the file, flat, with its enclosing at-rule noted.
	 *
	 * Scanned rather than matched. A regex over `selector { body }` has to
	 * anchor on the delimiter before the selector, and consuming that
	 * delimiter means the next rule has none left to anchor on — so it
	 * silently reads every other rule and a guard built on it passes whatever
	 * it happens to skip.
	 */
	function rules(): Rule[] {
		const found: Rule[] = [];
		const stack: Frame[] = [];
		let buf = '';
		for (let i = 0; i < CSS_TEXT.length; i++) {
			const ch = CSS_TEXT[i] as string;
			if (ch === '{') {
				const selector = buf.trim();
				buf = '';
				const isAt = selector.startsWith('@');
				stack.push({
					selector,
					bodyFrom: i + 1,
					guard: stack.find((f) => f.isAt)?.guard ?? null,
					isAt,
				});
				if (isAt) {
					// Its own guard object, closed when this block closes.
					stack[stack.length - 1]!.guard = { to: 0 };
				}
				continue;
			}
			if (ch === '}') {
				const frame = stack.pop();
				buf = '';
				if (!frame) continue;
				if (frame.isAt) {
					if (frame.guard) frame.guard.to = i;
					continue;
				}
				const body = CSS_TEXT.slice(frame.bodyFrom, i);
				const properties = new Set(
					[...body.matchAll(/(^|;)\s*([a-z-]+)\s*:/g)].map((d) => d[2] as string),
				);
				found.push({
					selectors: frame.selector
						.split(',')
						.map((part) => part.trim())
						.filter(Boolean),
					properties,
					guard: frame.guard,
					at: frame.bodyFrom,
				});
				continue;
			}
			buf += ch;
		}
		return found;
	}

	const all = rules();

	it('finds the rules it is meant to be checking', () => {
		expect(all.length).toBeGreaterThan(200);
		expect(all.filter((rule) => rule.guard !== null).length).toBeGreaterThan(20);
	});

	it('is never overridden by an equal selector further down the file', () => {
		const losing: string[] = [];
		for (const rule of all) {
			if (rule.guard === null) continue;
			for (const selector of rule.selectors) {
				for (const other of all) {
					if (other.at <= rule.guard.to) continue;
					if (other.guard !== null) continue;
					if (!other.selectors.includes(selector)) continue;
					for (const property of rule.properties) {
						if (other.properties.has(property)) {
							losing.push(`${selector} { ${property} }`);
						}
					}
				}
			}
		}
		expect([...new Set(losing)]).toEqual([]);
	});
});

describe('a table header lines up with its rows', () => {
	/*
	 * The header and the rows are separate grids, so they agree only while
	 * they resolve to the same track list. With two content columns the
	 * agreement is free — the second label starts at the `1fr` track's left
	 * edge, and a track's start does not move with its width. A third column
	 * sits after that track, so it does: the row spends width on its buttons,
	 * its `1fr` comes out narrower, and every column past it slides left.
	 *
	 * The fix was to share one declaration. This is the check that keeps it
	 * shared, because the symptom is a few pixels of drift in a settings pane
	 * and nothing else reports it.
	 */
	const CSS_TEXT = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

	const HEADER = '.sheetsmith-attribute-counted .sheetsmith-attribute-columns';
	const ROW = '.sheetsmith-attribute-counted .sheetsmith-attribute-row';

	/** Every rule declaring a track list, as (selectors, declaration). */
	function trackLists(): { selectors: string[]; value: string }[] {
		const withoutComments = CSS_TEXT.replace(/\/\*[\s\S]*?\*\//g, '');
		const found: { selectors: string[]; value: string }[] = [];
		for (const block of withoutComments.split('}')) {
			const brace = block.indexOf('{');
			if (brace === -1) continue;
			const declared = /grid-template-columns\s*:([^;]+)/.exec(block.slice(brace));
			if (!declared) continue;
			found.push({
				selectors: block
					.slice(0, brace)
					.split(',')
					.map((part) => part.trim().replace(/\s+/g, ' '))
					.filter(Boolean),
				value: (declared[1] ?? '').trim().replace(/\s+/g, ' '),
			});
		}
		return found;
	}

	it('finds the rules it is meant to be checking', () => {
		const lists = trackLists();
		expect(lists.length).toBeGreaterThan(5);
		expect(lists.some((rule) => rule.selectors.includes(ROW))).toBe(true);
	});

	it('gives the counted header and its rows one track list', () => {
		for (const rule of trackLists()) {
			const header = rule.selectors.includes(HEADER);
			const row = rule.selectors.includes(ROW);
			if (!header && !row) continue;
			// Either both, in one declaration, or neither — a rule naming one
			// alone is the drift this exists to catch. The narrow block is the
			// exception it has to allow: there both collapse to a single
			// column, and the header is hidden outright.
			if (rule.value === '1fr') continue;
			expect(
				header && row,
				`only one of the pair takes "${rule.value}"`,
			).toBe(true);
		}
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

describe('every colour on the sheet comes from the theme', () => {
	/*
	 * A literal colour is a colour that does not change with the theme. It
	 * looks right in whichever one it was written in and wrong in the other,
	 * and the wrongness only shows up for the users who did not pick that
	 * theme — which is to say, never in review.
	 *
	 * Obsidian publishes a full palette as CSS variables. Everything the
	 * plugin paints takes one, or a `color-mix` of one.
	 */

	/** Declarations as (property, value), comments stripped. */
	function declarations(): { property: string; value: string }[] {
		const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
		return [
			...withoutComments.matchAll(
				/(?:^|[;{])\s*(--?[-a-zA-Z][-a-zA-Z0-9]*|[a-zA-Z][-a-zA-Z0-9]*)\s*:\s*([^;{}]+)/gm,
			),
		].map((match) => ({
			property: (match[1] ?? '').trim(),
			value: (match[2] ?? '').trim(),
		}));
	}

	const LITERAL =
		/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|\b(?:white|black|red|green|blue|gr[ae]y|orange|yellow|purple|pink)\b/;

	/**
	 * A fully transparent stop. It names the absence of a colour rather than a
	 * colour, so it cannot be theme-dependent and there is no variable for it.
	 */
	const TRANSPARENT_STOP = /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/g;

	const all = declarations();

	it('finds the declarations it is meant to be checking', () => {
		expect(all.length).toBeGreaterThan(500);
	});

	it('names no literal colour', () => {
		const literals: string[] = [];
		for (const { property, value } of all) {
			// An embedded SVG used as a mask carries its own alpha channel,
			// and `stroke='black'` there is that channel at full — the paint
			// comes from whatever theme variable is behind the mask. The
			// colour word is part of the image, not part of the palette.
			if (value.includes('url("data:')) continue;
			if (LITERAL.test(value.replace(TRANSPARENT_STOP, ''))) {
				literals.push(`${property}: ${value.replace(/\s+/g, ' ')}`);
			}
		}
		expect(literals).toEqual([]);
	});
});

describe('every custom property the plugin declares is its own', () => {
	/*
	 * Obsidian's variables live in the same cascade. Declaring an unprefixed
	 * `--track-width` on a component would either collide with a theme's
	 * variable of that name or quietly become one for everything nested
	 * inside — a bug with no stack trace and no failing assertion, found only
	 * by a user on a theme nobody tested.
	 */
	const declared = [
		...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(
			/(?:^|[;{])\s*(--[-a-zA-Z0-9]+)\s*:/gm,
		),
	].map((match) => match[1] as string);

	it('finds the properties it is meant to be checking', () => {
		expect(new Set(declared).size).toBeGreaterThan(12);
	});

	it('prefixes every one with --sheetsmith-', () => {
		const foreign = [...new Set(declared)].filter(
			(name) => !name.startsWith('--sheetsmith-'),
		);
		expect(foreign).toEqual([]);
	});
});

describe('every class the plugin adds is its own', () => {
	/*
	 * The counterpart to the rule above, on the DOM side. An unprefixed class
	 * lands in the same global namespace as Obsidian's and every other
	 * plugin's, so it is styled by whatever else claims the name.
	 *
	 * `src/test/obsidian-stub.ts` is exempt, and is not an exception to the
	 * rule so much as the reason for it: the stub reimplements Obsidian's own
	 * DOM for vitest, so it has to spell Obsidian's class names — `mod-cta`,
	 * `setting-item`, `modal`. A prefixed stub would be asserting against a
	 * DOM that does not exist in the app.
	 */
	const EXEMPT = 'src/test/obsidian-stub.ts';

	/** Every `.ts` file under src/, as a repo-relative path. */
	function sources(dir = 'src'): string[] {
		const found: string[] = [];
		for (const entry of readdirSync(new URL(`../${dir}`, import.meta.url), {
			withFileTypes: true,
		})) {
			const path = `${dir}/${entry.name}`;
			if (entry.isDirectory()) found.push(...sources(path));
			else if (entry.name.endsWith('.ts')) found.push(path);
		}
		return found;
	}

	/**
	 * Class names passed to `classList.add`, from quoted strings and from the
	 * fixed head of a template literal — `sheetsmith-stat-group-align-${x}`
	 * is checked on its prefix, which is the part that has to be owned.
	 */
	function classesAdded(source: string): string[] {
		const found: string[] = [];
		for (const call of source.matchAll(/classList\.add\(([^)]*)\)/g)) {
			for (const literal of (call[1] ?? '').matchAll(
				/'([^']*)'|"([^"]*)"|`([^`$]*)/g,
			)) {
				const name = literal[1] ?? literal[2] ?? literal[3] ?? '';
				if (name !== '') found.push(name);
			}
		}
		return found;
	}

	const files = sources().filter((path) => path !== EXEMPT);
	const added = files.flatMap((path) =>
		classesAdded(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')),
	);

	it('finds the classes it is meant to be checking', () => {
		expect(added.length).toBeGreaterThan(50);
	});

	it('prefixes every one with sheetsmith-', () => {
		const foreign = [...new Set(added)].filter(
			(name) => !name.startsWith('sheetsmith-'),
		);
		expect(foreign).toEqual([]);
	});
});

describe('styles.css is assembled, not authored', () => {
	/*
	 * The stylesheet is generated from src/styles/, because Obsidian loads one
	 * file from the plugin folder and the sheet and the editor are two
	 * surfaces. Generated files invite exactly one failure: someone edits the
	 * output, it works, and the next build silently reverts it.
	 *
	 * Nothing else would notice. The edit is valid CSS, every other check in
	 * this file passes against it, and the loss only shows up whenever the
	 * next person happens to run a build.
	 */
	it('matches what the parts assemble to', () => {
		expect(CSS).toBe(renderStyles());
	});

	it('is assembled from every part, in the declared order', () => {
		// A part dropped from PARTS would take its rules out of the stylesheet
		// while leaving the file on disk, which reads as a deletion nobody made.
		expect(PARTS).toEqual(['tokens', 'shared', 'sheet', 'editor']);
		for (const part of PARTS) {
			const source = readFileSync(
				new URL(`../src/styles/${part}.css`, import.meta.url),
				'utf8',
			).trim();
			expect(CSS).toContain(source);
		}
	});
});
