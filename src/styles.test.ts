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

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { all as KNOWN_CSS_PROPERTIES } from 'known-css-properties';
import { describe, expect, it } from 'vitest';
import { PARTS, renderStyles } from '../styles.build.mjs';
import { MAX_TABULATED_FIELDS } from './components/record-set';
import {
	FALLBACK_FIT_TIER,
	GAP_PX,
	MAX_FIT_TIER,
	MIN_FIT_TIER,
	STEP_PX,
} from './components/record-line-fit';
import { EDGE_GUTTER } from './ui/popover';
import { TINT_COLOURS } from './types';

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
 * scope. `.sheetsmith-input-invalid` is deliberately not here: it lives in the
 * layout editor pane, not the sheet, so the scope it carries is that pane's
 * rather than `.sheetsmith-view`'s. It is under exactly the same pressure this
 * list exists for, and `styles/editor.css` records what it measured — it now
 * carries the pane scope *and* a doubled class, because a tie with
 * `.dropdown:focus-visible` was all that stood between a marked dropdown and no
 * mark at all. (This note used to say the settings tab and a border colour.
 * Both had been wrong since the editor moved into a pane and the mark became an
 * outline.)
 *
 * `-select` is the third spelling, and it is here for the reason the first two
 * are: Obsidian's bare `select` rule sets a height, a background, a shadow and
 * a font size, so a card's value drawn as a menu silently reverts to a form
 * control the moment a rule of ours loses to it.
 */
const FIELD_CLASS = /\.sheetsmith-[a-z-]*(?:-input|-current|-select)\b/;

/**
 * Controls that need exactly the same `.sheetsmith-view` scope FIELD_CLASS's
 * naming would catch, but whose class does not end in `-input`/`-current`/
 * `-select` — the gap this file's own header already names as something to
 * widen for on purpose rather than a licence to let slide.
 *
 * **A Passport's headline was briefly the second entry and is not one now**, and
 * the round trip is worth a sentence because it is what the list is *for*. That
 * class carried a rank and landed on a `<div>` in one branch and an `<input>` in
 * another; unscoped at (0,1,0) it lost its `font-size` to Obsidian's
 * `input[type='text']` at (0,1,1), so a 28px headline drew at 13px in the field
 * — found by looking at a shot, listed here so the scope was checked, and then
 * *renamed* to `-name-input` when the read-only branch went, which puts it inside
 * `FIELD_CLASS`'s own pattern. An entry that stops being needed because the thing
 * it guarded got a name the pattern already covers is the better outcome, so it
 * left rather than lingering.
 *
 * `sheetsmith-canvas-overlay` is a real `<button>` on the sheet's own grid
 * (`docs/features/grid-canvas.md` §2). Unscoped it was (0,1,0) and lost
 * `background-color` and `box-shadow` to Obsidian's own
 * `button:not(.clickable-icon)` at (0,1,1) — rendering as an opaque button
 * pinned over the very component it exists to sit over transparently,
 * exactly the invisible-in-review failure this file exists for. The
 * anchored panel's own `CONTROLS` list below is the same idea for a surface
 * that cannot carry `.sheetsmith-view` at all; this is for a control that
 * can and should, but was named outside `FIELD_CLASS`'s own pattern.
 *
 * `sheetsmith-pool-adjust-amount` is the pool's adjust field, a real text
 * `<input>` named for what it holds. It was scoped all along and simply never
 * listed; the phone-width guard below found it (`docs/features/phone-input-width.md`).
 */
const NAMED_FIELD_CLASSES = ['sheetsmith-canvas-overlay', 'sheetsmith-pool-adjust-amount'];

/**
 * The one family of rules that may not carry the scope, and the reason it cannot
 * rather than a licence to omit it.
 *
 * `ui/anchored-panel.ts` appends its panel to `document.body`, because the table
 * whose cell opened it scrolls inside an overflow box that would clip anything
 * inside it — which is exactly why `.sheetsmith-popover` is unscoped too. So
 * nothing in the panel is under `.sheetsmith-view` *at any time*, and a rule
 * carrying the scope would simply never match.
 *
 * **Anything mentioning the panel, not just anything starting with it**, and the
 * difference is what made the first version of this exemption a licence. Anchored
 * at the front, `.sheetsmith-panel input.sheetsmith-panel-input` fell out of the
 * exemption and into the *scope* case, which it can never satisfy — a false
 * failure — while `.sheetsmith-panel-body input` matched neither this nor
 * `FIELD_CLASS` and escaped both cases silently. A rule losing to Obsidian's bare
 * `select` is exactly the invisible-in-review failure this file exists for.
 */
function inThePanel(selector: string): boolean {
	return selector.includes('.sheetsmith-panel');
}

/**
 * What a selector actually selects: its last compound, after the combinators.
 *
 * The specificity claim the panel's exemption rests on is about the *subject* and
 * nothing else — `.sheetsmith-panel-glyph .svg-icon` is (0,2,0) and perfectly
 * safe, and so is `input.sheetsmith-panel-input` at (0,1,1), while
 * `.sheetsmith-panel-body input` selects a bare `input` that Obsidian's own
 * (0,0,1) rule also matches at the same weight, and source order then decides
 * which of two rules a plugin does not both own sets the height of a `select`.
 */
function subjectOf(selector: string): string {
	const compounds = selector
		.trim()
		.split(/[\s>+~]+/)
		.filter((one) => one !== '');
	return compounds[compounds.length - 1] ?? '';
}

describe('field rules outweigh Obsidian\'s input styling', () => {
	const allFieldRules = selectors().filter(
		(selector) =>
			FIELD_CLASS.test(selector) ||
			NAMED_FIELD_CLASSES.some((cls) => selector.includes(`.${cls}`)),
	);
	const fieldRules = allFieldRules.filter(
		(selector) => !inThePanel(selector),
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

	it('selects every control in the anchored panel by a class, never an element', () => {
		/*
		 * The panel cannot carry the view scope — it lives on `document.body` — so
		 * the weakest thing that has to hold everywhere in it is that **the subject
		 * of every rule is class-led**, which is at least (0,1,0) against the (0,0,1)
		 * of a bare element rule.
		 *
		 * **Over every panel selector rather than only the field ones**, because
		 * `FIELD_CLASS` names three class spellings and the way to lose this is to
		 * use none of them: `.sheetsmith-panel-body input` is the rule that would
		 * revert a `select` to Obsidian's own height, and it matches no field class
		 * at all.
		 *
		 * **And it asserts the subject rather than the string's prefix**, which is
		 * the correction. The first version tested `startsWith('.sheetsmith-panel')`
		 * over a list already filtered on a regex anchored to that same prefix, so it
		 * held by construction — and its own comment's claim that every panel rule is
		 * a single class was already false, since
		 * `.sheetsmith-panel-promote-row .sheetsmith-panel-input` is (0,2,0). That is
		 * perfectly safe, and nothing noticed either way, which is the shape of an
		 * assertion entailed by its own filter.
		 *
		 * **"Carries a class" and not "begins with one"**, because the claim is about
		 * specificity and nothing else: `input.sheetsmith-panel-input` is (0,1,1) and
		 * beats the (0,0,1) it has to, so demanding the subject *start* with a class
		 * would refuse a safe rule. What is refused is a bare element or `*` as the
		 * subject, which is the only shape that ties with Obsidian's own.
		 */
		const panelRules = selectors().filter(inThePanel);
		// A filter that stopped matching would pass this by having nothing in it.
		expect(panelRules.length).toBeGreaterThan(20);
		const elementLed = panelRules.filter(
			(selector) => !subjectOf(selector).includes('.'),
		);
		expect(elementLed).toEqual([]);
	});

	it('scopes every control in it under .sheetsmith-panel, for (0,2,0)', () => {
		/*
		 * **And one class is not enough, which is what the test above quietly
		 * assumed.** Its comment reasons against "the (0,0,1) of a bare element
		 * rule", and that is the wrong number for two of the three control kinds in
		 * here: this file's own opening paragraph says Obsidian styles
		 * `input[type='text']` at **(0,1,1)**, and `button:not(.clickable-icon)` is
		 * (0,1,1) too, because a `:not()` argument counts. Only `select` is (0,0,1).
		 *
		 * So the panel's single-class rules beat the app on its selects and lost to
		 * it on its inputs and its buttons — every declaration taking chrome off a
		 * list line, and the arming tint on **Remove**, silently discarded. It
		 * photographed as one column of controls at two heights, list lines drawn as
		 * raised buttons clamped to `--input-height` with their reason lines
		 * overflowing, and a **Remove** whose first press changed nothing visible.
		 * Nothing failed. It took calibrating the harness against the app's real
		 * `input` and `button` rules for any of it to appear.
		 *
		 * The fix is the panel's own scope, which is `.sheetsmith-view`'s move made
		 * on the one surface that cannot use `.sheetsmith-view`. **The list is
		 * explicit rather than derived**, because what needs the scope is exactly the
		 * classes that land on a `<button>` or an `<input>` — a fact about
		 * `components/modifier-form.ts`, not about a name — and a regex over the
		 * spelling would either miss `-line` and `-add` or drag in `-body` and
		 * `-heading`, which are divs with nothing to beat. Add to it when the panel
		 * grows a control.
		 */
		const CONTROLS = [
			'sheetsmith-panel-line',
			'sheetsmith-panel-add',
			'sheetsmith-panel-select',
			'sheetsmith-panel-input',
			'sheetsmith-panel-save',
			'sheetsmith-panel-confirm',
			'sheetsmith-panel-cancel',
			'sheetsmith-panel-remove',
			'sheetsmith-panel-remove-armed',
			// Track's own **Remove** picker, one line per added row inside
			// the same anchored panel — `sheetsmith-panel-line` already
			// covers the resting line, and this is its armed tint.
			'sheetsmith-track-remove-armed',
		];
		/**
		 * The classes on the subject compound, exactly — not a substring of it.
		 *
		 * `.sheetsmith-panel-line-words` is a span inside the line and has nothing to
		 * beat, and it contains `.sheetsmith-panel-line` as a prefix. A substring test
		 * dragged it in, which is the shape of a guard that grows a false failure and
		 * gets loosened until it stops guarding.
		 */
		const classesOf = (compound: string): string[] =>
			compound
				.split(/(?=[.:[])/)
				.filter((one) => one.startsWith('.'))
				.map((one) => one.slice(1));
		const controlRules = selectors().filter((selector) =>
			classesOf(subjectOf(selector)).some((cls) => CONTROLS.includes(cls)),
		);
		expect(controlRules.length).toBeGreaterThan(8);
		/*
		 * **At least two classes in the whole selector, which is the (0,2,0) claim.**
		 * Not "starts with `.sheetsmith-panel `": the scope is the ordinary way to buy
		 * the second class, and it is not the only one —
		 * `.sheetsmith-panel-pending .sheetsmith-panel-confirm + .sheetsmith-panel-cancel`
		 * is already (0,3,0) and safe. What the check is about is the weight, so the
		 * weight is what it counts.
		 */
		const underweight = controlRules.filter(
			(selector) => (selector.match(/\.[a-zA-Z_-][\w-]*/g) ?? []).length < 2,
		);
		expect(underweight).toEqual([]);
	});
});

describe('every field the sheet styles has a focus indicator', () => {
	/*
	 * **The guard for a failure that was green under every gate, and it is the
	 * shape §10 asks for.** The focus treatment a transparent field wears — an
	 * accent border, the page surface, and a transparent `outline` as the
	 * forced-colors escape hatch — was six identical copies and was merged into
	 * one selector list. The merge ended its last selector with a comma, so the
	 * list swallowed the comment and the rule that followed it and the four
	 * declarations left the file entirely. Four fields then had **no focus
	 * indicator of any kind** (WCAG 2.4.7, on the most-pressed controls on a
	 * sheet) and each collapsed to a 1.6em circle on the caret entering it,
	 * because they had inherited the level ring's box.
	 *
	 * Nothing caught it. A type check and a unit test do no cascade; the harness
	 * shots do not press Tab, and `&focus=` photographs one control; and the
	 * duplicate-body measurement that motivated the merge is satisfied by
	 * *deleting* a rule as readily as by merging one — so re-measuring reported
	 * success. That is §10's case for a guard exactly: a failure invisible in
	 * review, and one a scan can prove.
	 *
	 * What it asserts is the *presence* of a treatment rather than its content:
	 * every field class the stylesheet styles has a `:focus` rule somewhere
	 * reaching for `--interactive-accent`. A card and a pool reach it through a
	 * `box-shadow` and a transparent field through a border, and this is
	 * deliberately indifferent to which — what it refuses is a field with none.
	 */
	const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

	/**
	 * Every field class the stylesheet styles, from `FIELD_CLASS`'s own naming
	 * minus one spelling — so a field added under that pattern is covered here
	 * without anyone remembering to come back.
	 *
	 * **`-select` is deliberately out.** `FIELD_CLASS` polices three spellings
	 * because all three lose to Obsidian's element rules, and that is about
	 * *specificity*. This is about a replacement ring, which only a control that
	 * took its chrome off owes: a native `<select>` keeps the browser's own focus
	 * ring, and demanding an accent rule on one would fail a control that is
	 * correct. The two spellings left are the ones that paint a transparent
	 * border and therefore have nothing else to show focus with.
	 */
	function fieldClasses(): string[] {
		const found = new Set<string>();
		for (const match of withoutComments.matchAll(
			/\.(sheetsmith-[a-z-]*(?:-input|-current))\b/g,
		)) {
			found.add(match[1] as string);
		}
		return [...found].sort();
	}

	/**
	 * Fields whose focus treatment is deliberately not their own, each with the
	 * reason it is not — enumerated rather than waved through, the way
	 * `NAMED_FIELD_CLASSES` and `BORROWED` above are, because an exemption
	 * nobody states is a rule that quietly stops applying.
	 *
	 * - `sheetsmith-pool-temp-input` — **the pill wears the ring and the field
	 *   inside it wears nothing.** `.sheetsmith-pool-temp:focus-within` carries
	 *   the accent, and the field suppresses its own box-shadow so there are not
	 *   two rings a few pixels apart. Its own rule says so.
	 * - `sheetsmith-table-name-input` — a row-name field carries
	 *   `sheetsmith-table-input` **as well**, so it takes the shared rule through
	 *   that class. The exemption is about this check counting classes where the
	 *   browser resolves elements.
	 * - `sheetsmith-track-row-length-input` — the same shape one component over:
	 *   a Track row's own length field carries `sheetsmith-pool-max-input` as
	 *   well, and takes its focus ring, its hover and its chrome removal through
	 *   that class. This one's own rule only narrows the size.
	 */
	const FOCUS_ELSEWHERE = [
		'sheetsmith-pool-temp-input',
		'sheetsmith-table-name-input',
		'sheetsmith-track-row-length-input',
	];

	/** Whether any rule anywhere focuses this class and reaches for the accent. */
	function hasAccentFocus(cls: string): boolean {
		for (const block of withoutComments.split('}')) {
			const brace = block.indexOf('{');
			if (brace === -1) continue;
			const selector = block.slice(0, brace);
			if (!selector.includes(`.${cls}:focus`)) continue;
			if (block.slice(brace + 1).includes('--interactive-accent')) return true;
		}
		return false;
	}

	it('finds the fields it is meant to be checking', () => {
		// The floor, because the assertion below is an absence over a derived
		// list: a pattern that stopped matching would report green over a
		// stylesheet with no field rules in it at all.
		const classes = fieldClasses();
		expect(classes.length).toBeGreaterThan(8);
		// And the ones the regression actually took, named — so a rename cannot
		// quietly drop a field out of the sweep.
		for (const named of [
			'sheetsmith-table-input',
			'sheetsmith-rich-text-input',
			'sheetsmith-image-input',
			'sheetsmith-record-name-input',
			'sheetsmith-record-input',
			'sheetsmith-record-body-input',
			'sheetsmith-card-input',
		]) {
			expect(classes, `${named} is no longer styled`).toContain(named);
		}
	});

	it('gives every one of them a focus rule reaching for the accent', () => {
		const dark = fieldClasses()
			.filter((cls) => !FOCUS_ELSEWHERE.includes(cls))
			.filter((cls) => !hasAccentFocus(cls));
		expect(dark).toEqual([]);
	});

	it('holds each exemption to the reason it was given', () => {
		// An exemption nothing exercises widens the rule for whatever is added
		// next, which is what this file's own `BORROWED` row says about itself.
		expect(FOCUS_ELSEWHERE.every((cls) => fieldClasses().includes(cls))).toBe(
			true,
		);
		// The pool's pill carries the accent its field gives up, and the field
		// says outright that it is giving it up.
		const pill = withoutComments
			.split('}')
			.find(
				(block) =>
					block.includes('.sheetsmith-pool-temp:focus-within') &&
					block.indexOf('{') !== -1,
			);
		expect(pill).toContain('--interactive-accent');
		const field = withoutComments
			.split('}')
			.find((block) =>
				block.includes('.sheetsmith-pool-temp-input:focus'),
			);
		expect(field).toContain('box-shadow: none');
		// And a row's name field really does carry the shared class as well, which
		// is the whole of why it needs no rule of its own.
		const source = readFileSync(
			new URL('./components/table.ts', import.meta.url),
			'utf8',
		);
		expect(source).toContain("'sheetsmith-table-name-input'");
		expect(source).toContain("'sheetsmith-table-input'");
	});

	it('would catch a field whose focus rule went', () => {
		// The check above asserts an empty list, so it reads the same on a
		// stylesheet with no focus rules at all. This drives the predicate over
		// the shape the regression had: a field styled, and focused nowhere.
		expect(hasAccentFocus('sheetsmith-not-a-field-input')).toBe(false);
	});
});

describe('a container query sits below what it overrides', () => {
	/*
	 * `@container` and `@media` add no specificity, so an equal selector
	 * further down the file simply wins and the narrow layout never applies.
	 * The file says so in a comment on the sheet's own reflow — and the
	 * entry tables broke the rule anyway, so their header never hid and
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

	const HEADER = '.sheetsmith-entry-counted .sheetsmith-entry-columns';
	const ROW = '.sheetsmith-entry-counted .sheetsmith-entry-row';

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

describe('a container collapses on its own column count', () => {
	/*
	 * One rule, written out twelve times because a container query can neither
	 * multiply nor read a custom property. That makes it a table, and a table is
	 * a thing that drifts off the rule it tabulates — one hand-edited number and
	 * a container of that width collapses at a threshold nothing chose.
	 *
	 * The rule: 40px a column, which is the sheet's own 480px across 12 columns.
	 * Answering that 480 for every container instead was one number applied to
	 * twelve questions, and it left a two-column container unable to place two
	 * children side by side at any pane width.
	 */
	const CSS_TEXT = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
	const PER_COLUMN = 40;

	/** Each tabulated threshold, as (column count, px). */
	function thresholds(): { columns: number; px: number }[] {
		const withoutComments = CSS_TEXT.replace(/\/\*[\s\S]*?\*\//g, '');
		const found: { columns: number; px: number }[] = [];
		for (const match of withoutComments.matchAll(
			/@container \(max-width: (\d+)px\)\s*\{\s*\.sheetsmith-cols-(\d+) >/g,
		)) {
			found.push({
				columns: Number(match[2]),
				px: Number(match[1]),
			});
		}
		return found;
	}

	it('tabulates every count a layout can reach by default', () => {
		// A regex that matched nothing, or stopped at the first few, would pass
		// the rule below by having nothing to check.
		const counts = thresholds().map(({ columns }) => columns);
		expect(counts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
	});

	it('keeps every threshold at the rule it tabulates', () => {
		const off = thresholds()
			.filter(({ columns, px }) => px !== columns * PER_COLUMN)
			.map(({ columns, px }) => `${columns} columns at ${px}px`);
		expect(off).toEqual([]);
	});

	it('derives the sheet\'s own threshold rather than sitting beside it', () => {
		// The whole claim that this is one rule: 12 columns has to come out at
		// the number the sheet grid still uses, or there are two rules again.
		const twelve = thresholds().find(({ columns }) => columns === 12);
		expect(twelve?.px).toBe(480);
		expect(CSS_TEXT).toContain(
			'@container (max-width: 480px) {\n.sheetsmith-view > .sheetsmith-grid',
		);
	});

	it('leaves the sheet grid out of the per-container rules', () => {
		// The sheet's grid is a direct child of the view, never of a subgrid, so
		// the two selectors are disjoint by construction. Asserted because an
		// unscoped `.sheetsmith-grid` in the 480px block would collapse every
		// inner grid at the sheet's number and quietly restore the bug.
		const withoutComments = CSS_TEXT.replace(/\/\*[\s\S]*?\*\//g, '');
		expect(withoutComments).not.toMatch(
			/@container \(max-width: 480px\)\s*\{\s*\.sheetsmith-grid\s*\{/,
		);
	});
});

describe('a container adds no box between the cell and its grid', () => {
	/*
	 * The design's central claim is that a group needs no border, because a card
	 * inside it lines up column for column with the identical card outside it and
	 * alignment does the work a box would. That holds exactly rather than
	 * approximately, and the arithmetic says it must: a component W sheet columns
	 * wide occupies `W·T + (W-1)·G`, and an inner grid dividing that into W
	 * columns at the same gap resolves to `T` again. Measured at 106.5000px on
	 * both sides.
	 *
	 * One padding declaration anywhere on the chain from the cell down to the
	 * inner grid breaks it, and breaks it by a few pixels — which is invisible in
	 * a screenshot, invisible in a type check, and invisible in every unit test,
	 * while quietly taking away the reason the component has no border. The spec
	 * predicted this cost as already paid and it was not; the check is what stops
	 * it being paid by accident later.
	 *
	 * The heading is deliberately not on the list: it sits above the region
	 * rather than around it, and its padding is what makes the row pressable.
	 */
	const CHAIN = [
		'.sheetsmith-group',
		'.sheetsmith-group-body',
		'.sheetsmith-subgrid',
		// The tab set's chain to the same inner grid. A tab fills the panel and
		// the panel is the tab set's own placement, so the identical claim has to
		// hold down this side: one padding declaration between the cell and the
		// subgrid and a card inside a tab stops lining up with the same card
		// outside the tab set.
		'.sheetsmith-tabset',
		'.sheetsmith-tabset-stage',
		'.sheetsmith-tabset-panel',
	];
	const BOXES = ['padding', 'padding-inline', 'padding-left', 'padding-right', 'border', 'border-left', 'border-right', 'border-inline', 'width', 'max-width', 'margin-inline', 'margin-left', 'margin-right'];

	/** Declarations on a rule whose subject is one of the chain elements. */
	function chainDeclarations(): { selector: string; property: string }[] {
		const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
		const found: { selector: string; property: string }[] = [];
		for (const block of withoutComments.split('}')) {
			const brace = block.indexOf('{');
			if (brace === -1) continue;
			const selectors = block
				.slice(0, brace)
				.split(',')
				.map((part) => part.trim().replace(/\s+/g, ' '))
				.filter(Boolean);
			// The rule's subject is its last compound selector, so a descendant
			// rule like `.sheetsmith-group .something` is not about the group.
			const subjects = selectors.map(
				(selector) => selector.split(/[\s>]+/).pop() ?? '',
			);
			if (!subjects.some((subject) => CHAIN.includes(subject))) continue;
			for (const declaration of block.slice(brace + 1).split(';')) {
				const property = declaration.split(':')[0]?.trim() ?? '';
				if (property !== '') {
					found.push({ selector: selectors.join(', '), property });
				}
			}
		}
		return found;
	}

	it('finds the rules it is meant to be checking', () => {
		// Named rather than counted, which is the only spelling that holds the
		// claim: `.sheetsmith-group-body` carries no rule of its own today, so a
		// count would have to be loose enough to pass on an extractor that had
		// stopped matching. These two do carry one, and a rename should be a
		// decision taken here rather than a check that quietly stops looking.
		const found = chainDeclarations();
		expect(found.length).toBeGreaterThan(2);
		const subjects = new Set(found.map(({ selector }) => selector));
		expect(subjects).toContain('.sheetsmith-group');
		expect(subjects).toContain('.sheetsmith-subgrid');
	});

	it('gives none of them a horizontal box', () => {
		const boxed = chainDeclarations()
			.filter(({ property }) => BOXES.includes(property))
			.map(({ selector, property }) => `${selector} { ${property} }`);
		expect([...new Set(boxed)]).toEqual([]);
	});
});

describe('a container draws one rule under its chrome', () => {
	/*
	 * Group closes its heading with a hairline; a tab set closes its *strip* with
	 * the same one, because the strip is part of the chrome. Drawn both ways it
	 * put two rules 37px apart, and next to the groups beside it the tab set read
	 * as a heavier, more built-up object — which is the one thing its chrome
	 * exists not to do (`docs/UI.md` §9).
	 *
	 * A review found that by looking, in both themes and at both widths, and
	 * nothing else could: two borders are not a type error and not a behaviour.
	 * The fix is a single declaration, so it is a single declaration away from
	 * coming back.
	 */
	it('drops the heading\'s own rule where a strip carries it', () => {
		const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
		const rule =
			/\.sheetsmith-tabset\s*>\s*\.sheetsmith-group-heading\s*\{([^}]*)\}/.exec(
				withoutComments,
			);
		expect(rule).not.toBeNull();
		expect(rule?.[1]).toMatch(/border-bottom:\s*0/);
	});

	it('keeps the rule the strip carries, so one survives', () => {
		// The other half: dropping both would leave the chrome with no closing
		// edge at all, which is the same object read the other way.
		const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
		const strip = /\.sheetsmith-tabset-strip\s*\{([^}]*)\}/.exec(withoutComments);
		expect(strip?.[1]).toMatch(/border-bottom:\s*1px/);
	});
});

describe('a stage that shows one child is not a reflow context', () => {
	/*
	 * The narrow failure the three-layer DOM exists to prevent, held at the one
	 * layer a stylesheet can be asked about.
	 *
	 * A tab set's panels all occupy one grid cell, so exactly one is visible and
	 * the set is as tall as its tallest tab. Give that grid a `container-type` and
	 * it answers the reflow query like any other container's grid, drops to a flex
	 * column, and the panels stop overlapping — they **stack**, so the set becomes
	 * as tall as every tab put together with one of them showing. It looks correct
	 * at 1400px and fails only in the narrow shot, which is exactly the kind of
	 * regression a screenshot review catches late and a type check never.
	 *
	 * Asserted in both directions on purpose. `.sheetsmith-subgrid` *must* carry
	 * it — that is what makes a container its own reflow context — so requiring
	 * its presence there is the vacuity guard: a scan that stopped matching
	 * anything would fail on the subgrid rather than pass on the stage.
	 */
	function declares(subject: string, property: string): boolean {
		const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
		for (const block of withoutComments.split('}')) {
			const brace = block.indexOf('{');
			if (brace === -1) continue;
			const subjects = block
				.slice(0, brace)
				.split(',')
				.map((part) => part.trim().replace(/\s+/g, ' '))
				.map((selector) => selector.split(/[\s>]+/).pop() ?? '');
			if (!subjects.includes(subject)) continue;
			for (const declaration of block.slice(brace + 1).split(';')) {
				if ((declaration.split(':')[0] ?? '').trim() === property) return true;
			}
		}
		return false;
	}

	it('gives a container that places its children one', () => {
		// The guard on the check below: this is the rule that has to have it.
		expect(declares('.sheetsmith-subgrid', 'container-type')).toBe(true);
	});

	it('gives the tab set\'s stage none, so its panels keep overlapping', () => {
		expect(declares('.sheetsmith-tabset-stage', 'container-type')).toBe(false);
	});
});

describe('the sheet paints its own surfaces', () => {
	it('gives no rule to .sheetsmith-cell, so components must look like objects', () => {
		// Load-bearing for the review that produced this file: the grid hands a
		// component nothing, which is why a component with no surface of its
		// own reads as loose chrome beside the ones that have one.
		//
		// **One exception, scoped to the editor and carrying no surface at
		// all.** The canvas's overlay is an absolutely-positioned sibling of a
		// component's own rendered root, attached to the cell
		// (`docs/features/grid-canvas.md` §2), and `inset: 0` on it only covers
		// the cell's own box if the cell is a positioning context — so
		// `.sheetsmith-layout-editor-pane .sheetsmith-cell` gets `position:
		// relative` and nothing else. `position` paints nothing on its own; the
		// sheet itself never carries that class, so a rendered character sheet
		// is untouched.
		const cellRules = selectors().filter((selector) =>
			/\.sheetsmith-cell\b/.test(selector),
		);
		expect(
			cellRules.every(
				(selector) =>
					selector.includes('-error') ||
					selector.includes('sheetsmith-layout-editor-pane'),
			),
		).toBe(true);
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

describe('the armed delete keeps its warning under the pointer', () => {
	const CSS_TEXT = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

	/*
	 * Arming is the guard on the only irreversible thing a component offers, and
	 * the instant after the first press the pointer is still on the control — so
	 * `:hover` is the state the armed treatment competes with every time, and it
	 * lost: the glyph's hover rule is (0,3,0) and the row-hover pair (0,4,2)
	 * against an armed rule at (0,2,0), which no source order can rescue. A
	 * control one press from deleting a row painted the ordinary hover grey, and so
	 * did its row.
	 *
	 * Invisible in review twice over: a headless shot cannot hover, and arming from
	 * a script leaves the pointer wherever it was, so every screenshot of this
	 * showed the one condition where it looked right. It took driving a real
	 * pointer over the harness with CDP to see it.
	 *
	 * The arrangement that fixed it is what this checks: a state rule *stands down*
	 * for the armed state rather than trying to outrank it. Excluded, nothing
	 * competes, and the next rule added here cannot win by accident.
	 */
	const ARMED = ['sheetsmith-table-remove-armed', 'sheetsmith-table-row-arming'];
	const PAINTED = ['color', 'background-color', 'background-image'];

	/**
	 * Rules that paint a state onto the delete control or a table row.
	 *
	 * **Per comma part, and on the *subject* of the selector**, which is what this
	 * comment always said and what the check did not do. It tested the whole
	 * selector for the two names anywhere in it, so any rule painting *anything*
	 * that happens to sit inside a hovered row was caught — a modifier cell's own
	 * faint-to-muted step, for instance, which competes with nothing here because
	 * neither armed rule paints that element. Read on the subject, the check means
	 * what it was written for: the rules that can actually outrank the armed
	 * treatment are the ones drawing the delete control or the row itself.
	 *
	 * Per part rather than over the joined string for the same reason: a pair where
	 * only one half stands down would have passed on the other half's `:not`.
	 */
	function stateRules(): string[] {
		const withoutComments = CSS_TEXT.replace(/\/\*[\s\S]*?\*\//g, '');
		const found: string[] = [];
		for (const block of withoutComments.split('}')) {
			const brace = block.indexOf('{');
			if (brace === -1) continue;
			const body = block.slice(brace + 1);
			const paints = body
				.split(';')
				.some((d) => PAINTED.includes(d.split(':')[0]?.trim() ?? ''));
			if (!paints) continue;
			for (const part of block.slice(0, brace).split(',')) {
				const selector = part.replace(/\s+/g, ' ').trim();
				if (selector === '' || !/:hover|:focus-visible/.test(selector)) continue;
				/** The compound the rule is actually about, which is the last one. */
				const subject = selector.split(/[\s>]+/).pop() ?? '';
				if (
					!subject.includes('.sheetsmith-table-remove-button') &&
					!/^tr\b/.test(subject)
				) {
					continue;
				}
				found.push(selector);
			}
		}
		return found;
	}

	it('finds the state rules it is meant to be checking', () => {
		expect(stateRules().length).toBeGreaterThan(2);
	});

	it('stands every one of them down for the armed state', () => {
		const outranking = stateRules().filter(
			(selector) => !ARMED.some((armed) => selector.includes(`:not(.${armed})`)),
		);
		expect(outranking).toEqual([]);
	});
});

describe('a hidden-at-rest control outranks its own shared reset by order, not by specificity', () => {
	const CSS_TEXT = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

	/*
	 * The same failure shape as "the armed delete keeps its warning under the
	 * pointer" above, on a different pair of rules: `.sheetsmith-passport-part-
	 * remove`'s own `display: none` (hidden at rest, `docs/features/passport-
	 * field-lists.md`, "Third reversal") and the shared glyph-button reset it
	 * shares with `.sheetsmith-passport-add` both resolve to one class's worth
	 * of specificity, so whichever is declared *later* is the one that wins.
	 * Nothing here can rescue a reorder the way `:not()` rescues the armed
	 * state above — the two rules paint the same property on the same element
	 * with the same specificity on purpose, so the only thing holding "hidden
	 * wins at rest" true is that it is textually the later of the two.
	 *
	 * Invisible in review by construction: no unit test in this project reads
	 * a computed `display`, and every harness shot of this control is either
	 * the resting state (where a reorder would look identical to a passing
	 * screenshot, since a headless shot cannot show the *absence* of a control
	 * reserving space it should not) or the focused/armed state, which the
	 * higher-specificity `:focus-within` reveal rule wins regardless of order
	 * — so a reorder that silently stopped the control from ever hiding would
	 * pass every existing shot and every existing test. This is the guard for
	 * that: a static order check, on the compiled stylesheet, that needs no
	 * browser to run.
	 */
	function ruleIndex(selector: string): number {
		const needle = `${selector} {`;
		const at = CSS_TEXT.indexOf(needle);
		expect(at, `expected to find the rule ${JSON.stringify(selector)}`).toBeGreaterThan(-1);
		return at;
	}

	it('declares the hidden-at-rest rule after the shared reset it ties with', () => {
		const sharedReset = ruleIndex(
			'.sheetsmith-view .sheetsmith-passport-part-remove,\n.sheetsmith-view .sheetsmith-passport-add',
		);
		const hiddenAtRest = ruleIndex('.sheetsmith-view .sheetsmith-passport-part-remove');
		expect(hiddenAtRest).toBeGreaterThan(sharedReset);
	});
});

describe('a borrowed class is styled by us, not hoped for', () => {
	const CSS_TEXT = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

	/*
	 * Spelling one of Obsidian's class names buys the name and nothing else.
	 * Every `.internal-link` rule in `app.css` is scoped to `.markdown-rendered`
	 * or `.metadata-property-value`, so a sheet gets the bare `a` rule — colour,
	 * underline, pointer — and none of the state styling. A rendered wikilink to a
	 * note that does not exist looked exactly like one to a note that does, in the
	 * app, while the harness showed them as different shades because a stand-in
	 * rule there filled the gap. That is the worst shape a review can have: the
	 * instrument kinder than the thing.
	 *
	 * So any state class we put on a borrowed element has to be styled here, from
	 * the app's own variables.
	 */
	it('styles is-unresolved under the view scope', () => {
		const scoped = selectors().filter(
			(selector) =>
				selector.includes('.is-unresolved') &&
				selector.includes('.sheetsmith-view'),
		);
		expect(scoped.length).toBeGreaterThan(0);
		// From the documented variables, never a colour of the plugin's own.
		expect(CSS_TEXT).toContain('--link-unresolved-color');
	});
});

describe('a link over a field survives its own press', () => {
	const CSS_TEXT = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

	/*
	 * The display layer over a cell's field goes inert while the field is being
	 * edited, so a click cannot land on a link that is not visible. Keyed on the
	 * container's focus instead — `:focus-within` — it would also fire when the
	 * *anchor* takes focus, which is what a press on a link does: the layer would
	 * go inert between mousedown and mouseup, the mouseup would hit the field
	 * underneath, and the browser would dispatch the click to their common
	 * ancestor rather than to the link. The link would quietly stop working.
	 *
	 * Invisible in every other check: happy-dom has no hit testing and a
	 * dispatched click skips it, so the unit tests pass either way.
	 *
	 * **The mechanism moved and the rule did not.** This was
	 * `:has(.sheetsmith-table-input:focus)` in the stylesheet, and Obsidian's
	 * review reports `:has()` as a performance risk, so it is now a class that
	 * `interaction/field-focus-flag.ts` stamps from the field's own focus. The
	 * container's focus is still the thing that must not drive it — and there is
	 * now a *second* way to write that mistake, which is why this check grew a
	 * half: `focusin`/`focusout` bubble, so keying the flag on those would flag
	 * the container when the anchor takes focus, which is `:focus-within` again
	 * with extra steps.
	 */
	it('hides the layer on the field\'s focus, never the container\'s', () => {
		// Comments stripped first: the rule's own comment names the selector it
		// rules out, and a check that reads it finds the thing it forbids.
		const withoutComments = CSS_TEXT.replace(/\/\*[\s\S]*?\*\//g, '');
		const rules = withoutComments.split('}').filter((block) =>
			block.includes('.sheetsmith-table-link-layer'),
		);
		expect(rules.length).toBeGreaterThan(2);
		const byContainer = rules.filter(
			(block) =>
				block.includes(':focus-within') &&
				block.slice(0, block.indexOf('{')).includes('.sheetsmith-table-linked'),
		);
		expect(byContainer).toEqual([]);
		// The class the flag module stamps, which is what the layer rules key on
		// now.
		expect(withoutComments).toContain('.sheetsmith-table-field-focused');
	});

	/*
	 * The other half of the same rule, one layer down: the flag is only keyed on
	 * the *field* if the listeners do not bubble.
	 */
	it('stamps the flag from listeners that do not bubble', () => {
		// Both comment kinds stripped, block and line: the module argues about
		// `focusin`/`focusout` in prose at the site, so a check that read its
		// comments would find the very names it forbids.
		const module = readFileSync(
			new URL('./interaction/field-focus-flag.ts', import.meta.url),
			'utf8',
		)
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/^\s*\/\/.*$/gm, '');
		expect(module).toContain("addEventListener('focus'");
		expect(module).toContain("addEventListener('blur'");
		// The bubbling pair is the `:focus-within` mistake wearing another name.
		expect(module).not.toContain('focusin');
		expect(module).not.toContain('focusout');
	});

	it('would catch the selector it forbids', () => {
		// The check above passes on a file that simply has no layer rules at all,
		// so this drives it over the shape it exists to reject.
		const broken =
			'.sheetsmith-view .sheetsmith-table-linked:focus-within ' +
			'.sheetsmith-table-link-layer { opacity: 0; }';
		const caught = broken
			.split('}')
			.filter(
				(block) =>
					block.includes('.sheetsmith-table-link-layer') &&
					block.includes(':focus-within') &&
					block
						.slice(0, block.indexOf('{'))
						.includes('.sheetsmith-table-linked'),
			);
		expect(caught).toHaveLength(1);
	});
});

describe('an inline error wraps whatever it names', () => {
	/*
	 * The shared inline error (§9 of docs/UI.md) names the thing that is wrong, and
	 * the things this plugin's messages name are file paths, formulas, column keys
	 * and web addresses — tokens with no space in them to break at. Without an
	 * explicit wrap, one longer than its box paints straight through the border.
	 *
	 * Measured rather than supposed: Image's remote-URL refusal is 200 characters
	 * with a real URL in it, five times the next longest message either markdown
	 * component has, and it was the only one of twelve errors on the harness's
	 * error view to overflow — 211px of text in a 205px box. It was also the only
	 * failure state with no sample, so nothing had ever drawn it. Both halves of
	 * that are why this is a scan: the message is generated, the box is the grid's,
	 * and whether the two fit is invisible until someone renders the pair.
	 */
	const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

	it('declares a wrap that can break a token with no spaces in it', () => {
		const rules = withoutComments
			.split('}')
			.filter((block) => {
				const brace = block.indexOf('{');
				return brace !== -1 && block.slice(0, brace).trim() === '.sheetsmith-error';
			});
		expect(rules).toHaveLength(1);
		const [body = ''] = rules;
		// `anywhere` rather than `break-word`: these boxes sit inside flex and grid
		// items that may size to min-content, where `break-word` still lets the
		// token set the width.
		expect(/overflow-wrap\s*:\s*anywhere/.test(body)).toBe(true);
	});
});

describe('a screen-reader twin adds nothing to any scroller\'s width', () => {
	/*
	 * An absolutely positioned box escapes every scroller between it and its
	 * containing block, and its own box still counts in the scrollable overflow of
	 * the scroller that contains that block. Left at its static position, a
	 * table's **Remove** twin in the last header cell of a table wider than its
	 * wrapper reached the layout editor canvas: 869 in a 794 view at 820 under
	 * tablet staging, 839 on desktop staging, and 526 in 354 on a phone. Pinned
	 * to the start corner, all three measure their client width. Nothing in a
	 * still shows it at `scrollLeft` 0, which is why it is a guard here.
	 */
	/*
	 * Read inside each case, not here: `CSS_WITHOUT_COMMENTS` and the rule walk
	 * are declared further down the file, and a describe body runs at collection.
	 * The walk sees rules inside at-rules and every member of a selector list, so
	 * a forced-colors or print override putting the twin back where it was is
	 * read, not skipped. A rule whose subject is the twin is matched on the class
	 * before any parenthesis, so Card's `:not(.sheetsmith-sr-only, …)` is not one.
	 */
	const POSITIONING = /^(?:position|inset(?:-[a-z]+)*|top|right|bottom|left)\s*:/;
	const isTwin = (selector: string): boolean => /^[^(]*\.sheetsmith-sr-only\b/.test(subjectOf(selector));
	const twinRules = (text: string): Rule[] =>
		rules(text).filter((rule) => selectorList(rule.selector).some(isTwin));
	const isBase = (rule: Rule): boolean =>
		rule.context.length === 0 && rule.selector.trim() === '.sheetsmith-sr-only';
	/** Every rule but the base that moves the twin, which should be none. */
	const movers = (text: string): string[] =>
		twinRules(text)
			.filter((rule) => !isBase(rule))
			.filter((rule) => declarations(rule.body).some((one) => POSITIONING.test(one)))
			.map((rule) => [...rule.context, rule.selector].join(' '));

	it('finds the rule it is meant to be checking', () => {
		const base = twinRules(CSS_WITHOUT_COMMENTS).filter(isBase);
		expect(base).toHaveLength(1);
		expect(declarations(base[0]?.body ?? '')).toContain('position: absolute');
	});

	it('pins it to the start corner rather than its static position', () => {
		const [base] = twinRules(CSS_WITHOUT_COMMENTS).filter(isBase);
		const declared = declarations(base?.body ?? '');
		expect(declared).toContain('inset-block-start: 0');
		expect(declared).toContain('inset-inline-start: 0');
	});

	it('lets no other rule move it, inside an at-rule or a selector list', () => {
		expect(movers(CSS_WITHOUT_COMMENTS)).toEqual([]);
	});

	it('would catch an override that put it back', () => {
		const broken =
			'.sheetsmith-sr-only { position: absolute; inset-block-start: 0; inset-inline-start: 0; }\n' +
			'@media print { .sheetsmith-x, .sheetsmith-view .sheetsmith-sr-only { inset: auto; } }\n' +
			'.sheetsmith-card > :nth-last-child(1 of :not(.sheetsmith-sr-only)) { top: 0; }';
		expect(movers(broken)).toEqual(['@media print .sheetsmith-x, .sheetsmith-view .sheetsmith-sr-only']);
	});
});

describe('a component\'s own name is one rank, not five', () => {
	/*
	 * The rank that means "this is what this component is called", as against a
	 * heading over a region of other components (§9 of docs/UI.md).
	 *
	 * **It was written out four times, byte for byte** — Pool, Track, Rich text,
	 * Image — because the agreement lived in each file's comment ("on the pool's
	 * and the track's rank") rather than in a name. PATTERNS §1 extracts at three.
	 *
	 * Two guards, for the two ways one rank becomes several: the rank is declared
	 * once, and no component re-declares it. Whether each component *asks* for it
	 * is a claim about a component and lives in its own test file.
	 */
	const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

	/**
	 * Selector → declarations, for every rule in the file, **at-rules included**.
	 *
	 * The at-rule preludes are deleted before splitting rather than skipped after
	 * it, and that is not tidiness — it is the difference between seeing a rule and
	 * not. Splitting on `}` makes a chunk's first `{` the selector's, so a rule
	 * that is the *first* thing inside `@container (…) {` has the at-rule's brace
	 * found instead of its own and reports as `@container (max-width: 130px)`. Both
	 * spellings were live here: Pool's override is preceded by a sibling rule and
	 * read correctly, while the card's is first in its block and did not. Skipping
	 * anything starting with `@` therefore *hid* the card's rule rather than the
	 * at-rule, and the check below silently stopped seeing one of the three.
	 */
	function rules(): { selector: string; body: string }[] {
		const found: { selector: string; body: string }[] = [];
		const flat = withoutComments.replace(/@[a-z-]+[^{}]*\{/g, '');
		for (const block of flat.split('}')) {
			const brace = block.indexOf('{');
			if (brace === -1) continue;
			found.push({
				selector: block.slice(0, brace).trim(),
				body: block.slice(brace + 1),
			});
		}
		return found;
	}

	/**
	 * What makes a rule *the rank* rather than a rule that happens to set a font.
	 *
	 * Three of the nine declarations together, and the combination is what earns
	 * it: `--font-ui-smaller` alone appears on a card's abbreviation and a table's
	 * secondary column, and uppercase alone on a table heading. Uppercase *and*
	 * this tracking *and* this size is the rank and nothing else on the sheet.
	 */
	const RANK = (body: string) =>
		/text-transform\s*:\s*uppercase/.test(body) &&
		/letter-spacing\s*:\s*0\.05em/.test(body) &&
		body.includes('--font-ui-smaller');

	it('declares it exactly once', () => {
		const declaring = rules().filter(({ body }) => RANK(body));
		expect(declaring.map(({ selector }) => selector)).toEqual([
			'.sheetsmith-component-label',
		]);
	});

	it('would catch a component declaring it again', () => {
		// The check above pins one selector, so it would also pass if the rank were
		// renamed out from under it. This drives the predicate over the shape that
		// was actually here, four times.
		const copy =
			'.sheetsmith-image-label { color: var(--text-muted); ' +
			'font-size: var(--font-ui-smaller); letter-spacing: 0.05em; ' +
			'text-transform: uppercase; }';
		expect(RANK(copy.slice(copy.indexOf('{') + 1))).toBe(true);
		// And the rules it must not fire on: a size without the rest of the rank.
		expect(RANK('font-size: var(--font-ui-smaller); color: var(--text-faint);')).toBe(
			false,
		);
		expect(RANK('text-transform: uppercase; font-size: var(--font-ui-small);')).toBe(
			false,
		);
	});

	it('leaves the narrow-card tracking with the cards that can ask', () => {
		/*
		 * Three of the five tighten the tracking on a narrow card and two cannot:
		 * the card face, Pool and Track set `container-type` on their own card, so a
		 * container query asks about the card — and they do not agree on the
		 * threshold either, 130px against 160px, because a card's label and a pool's
		 * are not the same width. A Rich text block establishes no container, so the
		 * same query inside one resolves against the *sheet* and fires essentially
		 * never.
		 *
		 * So this is a deliberate asymmetry rather than a leftover, and the check is
		 * that it stayed asymmetric: moving an override onto the shared class would
		 * look like it applied to all five and would silently apply to three.
		 */
		const overriding = rules()
			.filter(({ body }) => /letter-spacing\s*:\s*0\.02em/.test(body))
			.map(({ selector }) => selector)
			.sort();
		expect(overriding).toEqual([
			'.sheetsmith-card-label',
			'.sheetsmith-pool-label',
			'.sheetsmith-track-label',
		]);
	});
});

describe('a placed box is one thing, not two', () => {
	/*
	 * A component whose size is its placement and not its content, shared by Rich
	 * text and Image (§9 of docs/UI.md).
	 *
	 * **It was written out twice, identically**, and that is the mistake PATTERNS
	 * §1 records against `roundSum` word for word: the number went into
	 * `--sheetsmith-grid-row` and its *application* stayed at both sites, which is
	 * "a policy shared and its application duplicated". Fourteen declarations in
	 * two copies, agreeing with each other and with nothing watching.
	 *
	 * So the guards here are in two halves, because the risk moved rather than
	 * went away. It is no longer "the two copies drift" — there is one copy — it is
	 * **"a component forgets to add the class"**, which is a claim about a
	 * component and lives in `rich-text.test.ts` and `image.test.ts`. What is left
	 * for the stylesheet is that the one rule says what both components need, and
	 * that nobody has quietly written it out a third time.
	 */
	const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

	function declaring(match: RegExp): string[] {
		const found: string[] = [];
		for (const block of withoutComments.split('}')) {
			const brace = block.indexOf('{');
			if (brace === -1) continue;
			if (!match.test(block.slice(0, brace))) continue;
			found.push(block.slice(brace + 1));
		}
		return found;
	}

	it('finds the rules it is meant to be checking', () => {
		expect(declaring(/\.sheetsmith-placed\s*$/)).toHaveLength(1);
		expect(declaring(/\.sheetsmith-placed-box\b/)).not.toHaveLength(0);
	});

	it('floors the component at its placement, so it cannot collapse', () => {
		// The arithmetic that turns a placement into a height. Both consumers put
		// their content out of flow, so without this there is nothing for the box to
		// take a height *from* at all — which is the prior art's second failure, a
		// box rendering at zero height.
		const [body = ''] = declaring(/\.sheetsmith-placed\s*$/);
		expect(/min-height\s*:/.test(body)).toBe(true);
		expect(body).toContain('--sheetsmith-rows');
		expect(body).toContain('--sheetsmith-grid-row');
		// And it still fills the cell it was placed in, which is the other half and
		// the rule every component on the sheet follows.
		expect(/height\s*:\s*100%/.test(body)).toBe(true);
	});

	it('makes the surface the containing block, and lets it shrink', () => {
		// `relative`, or a child's `inset: 0` resolves against the pane and the
		// component draws over the sheet. `min-height: 0`, or the flex item's
		// automatic minimum is its content — the one route left by which the content
		// could still decide the height.
		const rules = declaring(/\.sheetsmith-placed-box\s*$/);
		expect(rules).toHaveLength(1);
		const [body = ''] = rules;
		expect(/position\s*:\s*relative/.test(body)).toBe(true);
		expect(/min-height\s*:\s*0/.test(body)).toBe(true);
	});

	it('is not written out again on any component\'s own class', () => {
		/*
		 * The regression guard, and the one this describe exists for: the shape it
		 * forbids is exactly the shape that was here. A component class carrying the
		 * floor arithmetic is a second copy of the box, whether it was left behind
		 * or added by the next component to want one.
		 *
		 * Keyed on the floor rather than on all five declarations, because the floor
		 * is the load-bearing one and the only one nothing else on the sheet has a
		 * reason to write.
		 */
		const rewritten = withoutComments
			.split('}')
			.filter((block) => {
				const brace = block.indexOf('{');
				if (brace === -1) return false;
				const selector = block.slice(0, brace);
				if (!/\.sheetsmith-/.test(selector)) return false;
				if (/\.sheetsmith-placed\b/.test(selector)) return false;
				return block.slice(brace + 1).includes('--sheetsmith-grid-row');
			})
			.map((block) => block.slice(0, block.indexOf('{')).trim());
		expect(rewritten).toEqual([]);
	});

	it('would catch the copy it forbids', () => {
		// The check above asserts an empty list, so it reads the same on a
		// stylesheet with no placed box at all. This drives it over the duplication
		// that was actually here.
		const broken =
			'.sheetsmith-image { min-height: calc(var(--sheetsmith-rows, 1) * ' +
			'var(--sheetsmith-grid-row)); }';
		const caught = broken.split('}').filter((block) => {
			const brace = block.indexOf('{');
			if (brace === -1) return false;
			const selector = block.slice(0, brace);
			return (
				/\.sheetsmith-/.test(selector) &&
				!/\.sheetsmith-placed\b/.test(selector) &&
				block.slice(brace + 1).includes('--sheetsmith-grid-row')
			);
		});
		expect(caught).toHaveLength(1);
	});
});

describe('the effective pill is marked on every card that has one', () => {
	/*
	 * **A rule losing to another rule, which is precisely what nothing else here
	 * can see.** `card-face.ts` adds `.sheetsmith-card-input-effective` whenever
	 * the pill reads a number the reader did not type, and adds
	 * `.sheetsmith-card-has-derived` on a *different* condition —
	 * `options.derived !== undefined`. Nothing couples them: neither `CardConfig`
	 * nor `CardSetConfig` requires a `derived` beside an `effective`, and `SPEC`
	 * §4.2 does not either. The mark was written under `has-derived` anyway, so a
	 * card declaring only `effective` showed a modified number with no mark at
	 * all.
	 *
	 * **And the obvious fix is the trap this holds shut.** Simply dropping
	 * `has-derived` would take these rules to (0,2,0), where the `cursor: text`
	 * override loses to nothing but the `:focus` decoration-off would still lose
	 * to the pill's own `color`/`box-shadow` rules at (0,3,0) the moment either
	 * grows a `text-decoration` of its own — the fragility is in the *weight*,
	 * not in one property that happens to be safe today. Both halves are
	 * asserted: the condition is gone, and the weight is still three.
	 *
	 * **What moved since this was written**: the mark itself is no longer a
	 * colour. `.sheetsmith-modified` — the same dotted underline a card's own
	 * `derived` wears when a modifier touches it — is added to the pill's
	 * classList beside `-input-effective` now, replacing the accent this guard
	 * used to hold shut; what these two rules alone still own is the field's
	 * cursor and turning the mark off while focused. A component test cannot
	 * reach any of it. happy-dom applies no cascade, so `card-set.test.ts` can
	 * prove the classes are *on* the input and never what either one paints,
	 * which is §10's case for a guard exactly.
	 */
	const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

	/** Every selector in the file that mentions the effective mark. */
	function marking(): string[] {
		const found: string[] = [];
		for (const block of withoutComments.split('}')) {
			const brace = block.indexOf('{');
			if (brace === -1) continue;
			const selector = block.slice(0, brace).replace(/\s+/g, ' ').trim();
			if (selector.includes('.sheetsmith-card-input-effective')) found.push(selector);
		}
		return found;
	}

	it('finds the rules it is meant to be checking', () => {
		// Both assertions below are satisfied by a stylesheet with no accent rule
		// in it at all, which is how this would come back if the mark were dropped.
		expect(marking()).toHaveLength(2);
	});

	it('marks it whether or not the card also shows a derived number', () => {
		expect(marking().filter((one) => one.includes('has-derived'))).toEqual([]);
	});

	it('still outweighs the pill\'s own colour, which is written at three classes', () => {
		// The rule it has to beat is
		// `.sheetsmith-view .sheetsmith-card-has-derived .sheetsmith-card-input`,
		// so anything less than three classes paints nothing on a card with a
		// derived — every card the mark has ever been looked at on.
		for (const selector of marking()) {
			expect((selector.match(/\./g) ?? []).length).toBeGreaterThanOrEqual(3);
		}
	});
});

describe('a prose block is sized by its placement, never by its text', () => {
	/*
	 * The longest-running defect in the prior art, and the one this component was
	 * written against: a rich text area with "no vertical size", which "grows
	 * according to its content which does not allow to control its position in
	 * the sheet in a stable way" — open 47 months at the time of writing, beside
	 * three siblings for the same box rendering with zero height, squished, or
	 * absent.
	 *
	 * A guard rather than a unit test because none of it is visible in one: happy-dom
	 * lays nothing out, so a component test can prove what the box is *told* and
	 * never what it becomes. `rich-text.test.ts` holds the told half — the block
	 * carries its placement's row count and carries the same one whatever the text
	 * is — and this holds the three CSS facts that turn that number into a height.
	 *
	 * All three, because each alone is a different one of the prior art's four
	 * failures: no floor is the collapse to zero, no `overflow` is the growth, and
	 * a layer left in flow is the growth again by a route the floor cannot stop.
	 */
	const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

	/** The declarations of every rule whose selector matches. */
	function declaring(match: RegExp): string[] {
		const found: string[] = [];
		for (const block of withoutComments.split('}')) {
			const brace = block.indexOf('{');
			if (brace === -1) continue;
			if (!match.test(block.slice(0, brace))) continue;
			found.push(block.slice(brace + 1));
		}
		return found;
	}

	it('finds the rules it is meant to be checking', () => {
		// The assertions below all read as satisfied on a stylesheet that has no
		// rich text rules at all, which is exactly how this component would come
		// back if somebody deleted the section. The block's floor and the box's own
		// surface are the shared placed box's now — see the describe below this one.
		expect(declaring(/\.sheetsmith-rich-text\b/)).not.toHaveLength(0);
	});

	/*
	 * Asked **per layer**, never over the union of the two.
	 *
	 * The two layers are written as one shared rule today, so a regex matching
	 * either of them returns one block and a check for "some block declares this"
	 * is satisfied by that one block. Split the rule in two and drop the
	 * declaration from the rendered layer alone and the union check stays green
	 * while that layer is back in flow, growing the block past its placement —
	 * which is the original defect with a `min-height` on it, and precisely what
	 * these cases exist to catch. Measured rather than reasoned: that mutation
	 * passed every case here before this was split.
	 *
	 * `some` over a per-layer list also fails on an empty list, so a selector
	 * that stopped matching cannot make either check below vacuous.
	 */
	const LAYERS = ['input', 'rendered'] as const;

	const layerRules = (layer: string) =>
		declaring(new RegExp(`\\.sheetsmith-rich-text-${layer}\\b`));

	it.each(LAYERS)('scrolls the %s layer rather than letting it out of the box', (layer) => {
		expect(
			layerRules(layer).some((body) => /overflow-y\s*:\s*auto/.test(body)),
		).toBe(true);
	});

	it.each(LAYERS)('takes the %s layer out of flow, so it cannot grow the box', (layer) => {
		/*
		 * The half a floor cannot cover. A layer left in flow contributes its
		 * intrinsic height to the flex column, and `min-height` is a floor rather
		 * than a ceiling — so a long backstory would push the block past its
		 * placement even with the floor in place.
		 */
		expect(
			layerRules(layer).some((body) => /position\s*:\s*absolute/.test(body)),
		).toBe(true);
	});

	it('leaves the scrolling layer able to receive a pointer', () => {
		/*
		 * **The regression this exists for shipped.** The rendered layer was
		 * `pointer-events: none`, copied from the table cell where a click falls
		 * through to the field behind it and the browser places the caret. A cell is
		 * one line with nothing to scroll; this layer is a scrollport, and a
		 * scrollport that is not a hit target never receives a wheel. Measured in a
		 * real browser: the gesture went to the *invisible* field behind it, which
		 * scrolled 150px while the visible prose stayed at 0.
		 *
		 * A scan rather than a look, because this is the class PATTERNS §10 names —
		 * a still cannot show a scroll and happy-dom has no hit testing, so the
		 * harness and every unit test signed it off. The press routing that replaced
		 * the cascade's is held by `rich-text.test.ts`.
		 */
		const inert = layerRules('rendered').filter((body) =>
			/pointer-events\s*:\s*none/.test(body),
		);
		expect(inert).toEqual([]);
	});

	it('would catch the declaration it forbids', () => {
		// The check above asserts an empty list, so it reads exactly the same on a
		// stylesheet with no rich text rules at all. This drives it over the shape
		// it exists to reject.
		const broken = '.sheetsmith-rich-text-rendered { pointer-events: none; }';
		expect(
			broken
				.split('}')
				.filter(
					(block) =>
						block.includes('.sheetsmith-rich-text-rendered') &&
						/pointer-events\s*:\s*none/.test(block),
				),
		).toHaveLength(1);
	});

});

describe('a picture fits its placement rather than deciding it', () => {
	/*
	 * The same two facts a prose box needs, on a component whose content has an
	 * intrinsic size — which makes it the *worse* case: left in flow an `<img>`
	 * would give the box a height, so the failure is not a collapse but a box
	 * sized by the file. That is a character's note deciding a box the layout
	 * author placed, which is the first thing SPEC §8 forbids.
	 *
	 * Plus the one that is Image's alone: `object-fit: contain`. Invisible in a
	 * still unless the sample happens to have the wrong aspect ratio for its box —
	 * and the convergent prior art is width-and-height where two dimensions may
	 * distort, so a picture stretched to fill is precisely what a reviewer would
	 * mistake for correct.
	 *
	 * Per selector rather than over a union, which is the lesson the prose box's
	 * equivalent had to learn: a check for "some rule declares this" is satisfied
	 * by one rule when two elements share it.
	 */
	const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

	function declaring(match: RegExp): string[] {
		const found: string[] = [];
		for (const block of withoutComments.split('}')) {
			const brace = block.indexOf('{');
			if (brace === -1) continue;
			if (!match.test(block.slice(0, brace))) continue;
			found.push(block.slice(brace + 1));
		}
		return found;
	}

	it('finds the rules it is meant to be checking', () => {
		expect(declaring(/\.sheetsmith-image\b/)).not.toHaveLength(0);
		expect(declaring(/\.sheetsmith-image-picture\b/)).not.toHaveLength(0);
	});

	it('takes the frame out of flow, so its content cannot grow the box', () => {
		// The picture and any error live in the frame, and both would otherwise
		// contribute intrinsic height past the floor — a `min-height` is a floor and
		// not a ceiling.
		expect(
			declaring(/\.sheetsmith-image-frame\s*$/).some((body) =>
				/position\s*:\s*absolute/.test(body),
			),
		).toBe(true);
	});

	it('gives the picture the whole box, so the fit has work to do', () => {
		/*
		 * **`width`/`height`, not `max-width`/`max-height`, and this case exists
		 * because the first spelling made the next one vacuous.** With only the
		 * `max-*` pair and no size, a replaced element's box *is* its intrinsic ratio
		 * shrunk to fit — the box never disagrees with the image, so `object-fit`
		 * never applies and asserting it proved nothing. Measured against real files:
		 * a 48×48 sigil drew at 48×48 in a 205×194 frame while the harness's sizeless
		 * SVGs stretched to fill and hid it.
		 *
		 * `100%` in both directions and nothing else: a length here would be a second
		 * sizing control disagreeing with the grid (SPEC §8), and `100%` is the
		 * placement rather than a size of this stylesheet's own.
		 */
		const rules = declaring(/\.sheetsmith-image-picture\s*$/);
		expect(rules).toHaveLength(1);
		const [body = ''] = rules;
		for (const property of ['width', 'height']) {
			const declared = new RegExp(
				`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`,
			).exec(body);
			expect(declared, `${property} must be declared`).not.toBeNull();
			expect(declared?.[1]?.trim()).toBe('100%');
		}
		// And no `max-*` pair left behind: harmless, but it is what the box used to
		// be sized by, and leaving it reads as though it still is.
		expect(/max-width\s*:/.test(body)).toBe(false);
		expect(/max-height\s*:/.test(body)).toBe(false);
	});

	it('fits the picture inside that box rather than stretching it', () => {
		// The declaration that does the work now the box is the frame: scaled to fit
		// in both directions, up as well as down, ratio preserved, never cropped.
		const [body = ''] = declaring(/\.sheetsmith-image-picture\s*$/);
		expect(/object-fit\s*:\s*contain/.test(body)).toBe(true);
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

	/**
	 * A theme's named colour, read by its variable: the form tint's palette
	 * (`docs/features/form-tint-colour.md`). The word is the variable's name,
	 * which every theme redefines for light and dark, not a colour written here.
	 */
	const THEME_NAMED_COLOUR = /var\(--color-[a-z]+\)/g;

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
			// The form tag's text, black or white as the sheet measured them on the
			// fill the theme drew (`docs/features/form-tint-colour.md`, UI.md §1's
			// one exception); held to its two rules below.
			if (property === 'color' && (value === 'black' || value === 'white')) continue;
			if (LITERAL.test(value.replace(TRANSPARENT_STOP, '').replace(THEME_NAMED_COLOUR, ''))) {
				literals.push(`${property}: ${value.replace(/\s+/g, ' ')}`);
			}
		}
		expect(literals).toEqual([]);
	});

	it('names black and white only for the form tag text the sheet picks', () => {
		const words = all.filter(
			({ property, value }) => property === 'color' && (value === 'black' || value === 'white'),
		);
		expect(words.map(({ value }) => value).sort()).toEqual(['black', 'white']);
		const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
		for (const word of ['black', 'white']) {
			expect(withoutComments).toMatch(
				new RegExp(`\\[data-sheetsmith-tag-text='${word}'\\]\\s*\\{\\s*color:\\s*${word};\\s*\\}`),
			);
		}
	});
});

describe('the form tint has one rule per colour, and no colour outside the list', () => {
	/*
	 * `TINT_COLOURS` is one list with several readers, and the stylesheet is the
	 * one that cannot import it (`docs/features/form-tint-colour.md`). A colour
	 * added to the list with no rule here tints in the accent with nothing to
	 * say so; a rule for a word the list lacks is a colour no layout can choose.
	 */
	const rules = [
		...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(
			/\[data-sheetsmith-tint='([^']*)'\]\s*\{([^}]*)\}/g,
		),
	].map((match) => ({ colour: match[1] ?? '', body: match[2] ?? '' }));
	const named = (colour: string) => (colour === 'accent' ? '--interactive-accent' : `--color-${colour}`);

	it('finds the rules it is meant to be checking', () => {
		expect(rules.length).toBeGreaterThan(8);
	});

	it('gives every colour in the list its rule, naming its theme variable', () => {
		for (const colour of TINT_COLOURS) {
			const rule = rules.find((one) => one.colour === colour);
			expect(rule, colour).toBeDefined();
			expect(rule?.body.replace(/\s+/g, ' ').trim(), colour).toBe(
				`--sheetsmith-tint: var(${named(colour)});`,
			);
		}
	});

	it('names no colour outside the list', () => {
		const outside = rules
			.map((rule) => rule.colour)
			.filter((colour) => !(TINT_COLOURS as readonly string[]).includes(colour));
		expect(outside).toEqual([]);
	});

	it('mentions the attribute only with a colour in the list, or bare', () => {
		const words = [...CSS.matchAll(/\[data-sheetsmith-tint(?:='([^']*)')?\]/g)].map((match) => match[1]);
		expect(words.filter((word) => word !== undefined && !(TINT_COLOURS as readonly string[]).includes(word))).toEqual(
			[],
		);
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

	/**
	 * **The app's switches, which are set rather than declared.** The rule above
	 * is about a name the plugin invents. `--no-tooltip` is one Obsidian reads, and
	 * inheriting into everything nested is the point: it turns the app's
	 * `aria-label` tooltip off on the sheet (`docs/UI.md` §6).
	 */
	const APP_SWITCHES = ['--no-tooltip'];

	it('prefixes every one with --sheetsmith-', () => {
		const foreign = [...new Set(declared)].filter(
			(name) => !name.startsWith('--sheetsmith-') && !APP_SWITCHES.includes(name),
		);
		expect(foreign).toEqual([]);
	});

	it("turns the app's aria-label tooltip off on the sheet and the panel", () => {
		const bodies = new Map(
			[...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/^(\.[^{}]+)\{([^}]*)\}/gm)].map(
				(match) => [(match[1] as string).trim(), match[2] as string],
			),
		);
		for (const root of ['.sheetsmith-view', '.sheetsmith-panel']) {
			expect(bodies.get(root)).toMatch(/--no-tooltip:\s*true;/);
		}
	});

	it("gives markdown the app rendered its tooltip back", () => {
		// An aliased or external link there carries its only drawn target in
		// `aria-label`, so dropping this override loses it with nothing to see in
		// a shot. Found by the selectors it names, whatever else the list holds.
		const restoring = [
			...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g),
		].filter(
			([, selector, body]) =>
				/--no-tooltip:\s*false;/.test(body as string) &&
				(selector as string).includes('.sheetsmith-rich-text-rendered') &&
				(selector as string).includes('.sheetsmith-record-body-rendered'),
		);
		expect(restoring).toHaveLength(1);
	});

	it.each([
		'.sheetsmith-note-mark',
		'.sheetsmith-pool-modifier-button',
		'.sheetsmith-track-modifier-button',
	])("gives the glyph door %s the app's tooltip back", (door) => {
		// Named only by `aria-label`, so the app's tooltip is its one hover name
		// (`docs/UI.md` §6). Per selector, so losing any one door fails alone.
		const restoring = [
			...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g),
		].filter(
			([, selector, body]) =>
				/--no-tooltip:\s*false;/.test(body as string) &&
				(selector as string)
					.split(',')
					.some((one) => one.trim() === `.sheetsmith-view ${door}`),
		);
		expect(restoring).toHaveLength(1);
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
	 *
	 * `src/class-tokens.test.ts` is exempt for a different reason, and the
	 * reason is a defect in the reader below rather than anything about that
	 * file: it adds no class to any DOM at all. Its `classList.add(…)` texts
	 * are *strings that model source*, which it hands to its own reader — and
	 * `classesAdded` cannot tell them from calls, because it searches instead
	 * of walking and reads a `classList.add` written inside a string or a
	 * comment exactly as it reads one written in code. It also stops at the
	 * first `)` rather than the matching one, so `add(name.replace(' ', '-'))`
	 * yields `-` here. **Both are the defect that file's own header is about**,
	 * and the fix is one reader shared by the two scans rather than a second
	 * exemption next time; `PATTERNS.md` §11 holds it, with this as the
	 * instance that turned it from a possibility into a demonstration. Not
	 * taken in the pass that found it, because narrowing this scan's reader
	 * changes what an unrelated guard checks.
	 */
	const EXEMPT = [
		'src/test/obsidian-stub.ts',
		'src/class-tokens.test.ts',
		// The double's own test, exempt for the first of those reasons rather than
		// the second: it builds elements to prove the helpers honour their
		// options, so its class names are fixtures — `alpha`, `first`, `x` — and
		// no plugin DOM ever carries one.
		'src/test/obsidian-stub.test.ts',
	];

	/**
	 * Class names the plugin deliberately does not own.
	 *
	 * A rendered wikilink in a cell *is* an Obsidian link, and spelling its
	 * classes is the whole point: it takes the user's theme, and anything else
	 * that treats links as links finds it (UI.md §1). That is the opposite of the
	 * accident this check exists for — so the exceptions are enumerated here
	 * rather than waved through, the way `isolation.test.ts` enumerates the import
	 * spellings it allows.
	 */
	const BORROWED = [
		'internal-link',
		'is-unresolved',
		/*
		 * **These six were not added by the sweep; they were made visible by it.**
		 * Every one predates it, in `editor/` and `starters/`, which were never
		 * under the `prefer-create-el` exemption and so were already spelling a
		 * class as `cls:` in an options object. The reader below only read
		 * `classList.add`, so it had never seen any of them — the ownership rule
		 * has been silently unenforced across two folders for as long as they have
		 * been written that way, which is the argument for widening it rather than
		 * a cost of having done so.
		 *
		 * All six are the same deliberate borrowing as a wikilink's: Obsidian's own
		 * chrome, taken so a control looks like the app's and follows the user's
		 * theme. `setting-item-description` is the description under a setting;
		 * `clickable-icon` and `mod-cta` are its icon button and its primary
		 * button; `dropdown` is its select; the two `suggestion-*` are the rows of
		 * a suggester modal.
		 */
		'setting-item-description',
		'clickable-icon',
		'mod-cta',
		'dropdown',
		'suggestion-title',
		'suggestion-note',
		/*
		 * Two more the widening turned up, by the routes added after it: a
		 * confirm dialog's destructive button takes Obsidian's `mod-warning`
		 * through `addClass` (`ui/confirm-modal.ts`), and a tab strip marks the
		 * open tab with Obsidian's `is-active` through `classList.toggle`
		 * (`components/tab-set.ts`). Both are the same deliberate borrowing as
		 * the rest: the app's own state classes, so the control looks like the
		 * app's and follows the reader's theme.
		 */
		'mod-warning',
		'is-active',
		/*
		 * The two the formula suggester adds to a popup item, and they are the
		 * clearest case this list holds of a borrowed name that is *behaviour*
		 * rather than paint. `app.css` styles `.suggestion-note` in exactly one
		 * place — `.suggestion-item.mod-complex .suggestion-note` — so the
		 * secondary rank that makes a name-and-its-owner readable at all exists
		 * only under `mod-complex`, and the column the two children sit in is
		 * `.suggestion-content` under the same class. Without them the item draws
		 * two identical lines, which is what shipped for one wave.
		 */
		'mod-complex',
		'suggestion-content',
	];

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
	 * Class names the plugin puts on an element, from quoted strings and from the
	 * fixed head of a template literal — `sheetsmith-card-set-align-${x}`
	 * is checked on its prefix, which is the part that has to be owned.
	 *
	 * **Every route this repository has for putting a class on an element**, and
	 * the list is the enumeration rather than a sample:
	 *
	 * - `classList.add(...)`
	 * - `createDiv('x')` and `createSpan('x')`, where a bare string is the class
	 * - the second argument of `createEl('tag', 'x')`
	 * - `cls:` in an options object, as a string or an array
	 * - the second argument of `element('div', 'x', parent)`, this repository's
	 *   own helper
	 * - `addClass(...)` and `removeClass(...)`
	 * - `classList.toggle('x', …)` and `toggleClass('x', …)`
	 *
	 * This guard is about *ownership* — every class is either
	 * `sheetsmith-`-prefixed or a name deliberately borrowed — so a route it
	 * cannot see is a hole in the rule rather than a spelling it tolerates.
	 *
	 * **It read only the first of those until recently, and the last four were
	 * missed twice.** The helper sweep would have taken eighty-odd sites out of
	 * its reach in one commit, which is what prompted the widening; the widening
	 * then stopped at the four routes the sweep had touched and claimed to be
	 * complete, while `element()` alone carried 110 call sites — our own helper,
	 * and invisible to this scan and to `class-tokens.test.ts` alike. Six
	 * borrowed names had been unchecked for as long as they had been written.
	 *
	 * What it still cannot see is stated rather than implied: a class held in a
	 * variable, computed, or built by concatenation. Those are not decidable
	 * from the source, which is the same line `class-tokens.test.ts` draws.
	 *
	 * Unlike that file, both the string and the array form of `cls` count here:
	 * a space-separated string is two owned names rather than one refused token.
	 */
	function classesAdded(text: string): string[] {
		const found: string[] = [];
		// Comments stripped first, and only comments. The reader below searches
		// rather than walks, so before this it read a `cls:` written in prose
		// exactly as it read one written in code — and at this repository's
		// comment density the widened patterns matched this very file's header,
		// failing the build on a paragraph. Stripping is the narrow half of the
		// fix `PATTERNS.md` §11 holds in full: that row wants one reader shared
		// with `class-tokens.test.ts`, which also settles the strings-that-model-
		// source case this cannot, and it names its own prerequisites. This
		// changes nothing about which *code* the guard reads.
		const source = text
			.replace(/\/\*[\s\S]*?\*\//g, ' ')
			.replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
		const literals = (text: string): void => {
			for (const literal of text.matchAll(/'([^']*)'|"([^"]*)"|`([^`$]*)/g)) {
				for (const name of (
					literal[1] ??
					literal[2] ??
					literal[3] ??
					''
				).split(/\s+/)) {
					if (name !== '') found.push(name);
				}
			}
		};
		for (const call of source.matchAll(/classList\.add\(([^)]*)\)/g)) {
			literals(call[1] ?? '');
		}
		// `createDiv('x')` and `createSpan('x')`, where a bare string is the class.
		for (const call of source.matchAll(
			/create(?:Div|Span)\(\s*('[^']*'|"[^"]*"|`[^`$]*`)/g,
		)) {
			literals(call[1] ?? '');
		}
		// `createEl('tag', 'x')`, where it is the second argument.
		for (const call of source.matchAll(
			/createEl\(\s*(?:'[^']*'|"[^"]*")\s*,\s*('[^']*'|"[^"]*"|`[^`$]*`)/g,
		)) {
			literals(call[1] ?? '');
		}
		// `cls: 'x'`, `cls: ['x', 'y']`.
		for (const call of source.matchAll(
			/\bcls:\s*(\[[^\]]*\]|'[^']*'|"[^"]*"|`[^`$]*`)/g,
		)) {
			literals(call[1] ?? '');
		}
		// `element('div', 'x', parent)`, this repository's own helper, where the
		// class is the second argument exactly as it is for `createEl`.
		for (const call of source.matchAll(
			/\belement\(\s*(?:'[^']*'|"[^"]*")\s*,\s*('[^']*'|"[^"]*"|`[^`$]*`)/g,
		)) {
			literals(call[1] ?? '');
		}
		// `addClass('x', 'y')` and `removeClass`, Obsidian's own prototype pair.
		for (const call of source.matchAll(/\b(?:add|remove)Class\(([^)]*)\)/g)) {
			literals(call[1] ?? '');
		}
		// `classList.toggle('x', cond)` and `toggleClass('x', cond)` — the class
		// is the first argument, and for `toggleClass` it may be an array.
		for (const call of source.matchAll(
			/\bclassList\.toggle\(\s*('[^']*'|"[^"]*"|`[^`$]*`)/g,
		)) {
			literals(call[1] ?? '');
		}
		for (const call of source.matchAll(
			/\btoggleClass\(\s*(\[[^\]]*\]|'[^']*'|"[^"]*"|`[^`$]*`)/g,
		)) {
			literals(call[1] ?? '');
		}
		return found;
	}

	const files = sources().filter((path) => !EXEMPT.includes(path));
	const added = files.flatMap((path) =>
		classesAdded(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')),
	);

	it('finds the classes it is meant to be checking', () => {
		expect(added.length).toBeGreaterThan(50);
	});

	it('prefixes every one with sheetsmith-', () => {
		const foreign = [...new Set(added)].filter(
			(name) => !name.startsWith('sheetsmith-') && !BORROWED.includes(name),
		);
		expect(foreign).toEqual([]);
	});

	it('still uses every name it claims to be borrowing', () => {
		// An exemption nothing exercises is an exemption that quietly widens the
		// rule for whatever is added next.
		for (const name of BORROWED) {
			expect(added, `${name} is exempt but unused`).toContain(name);
		}
	});
});

describe('a stacked ring keeps its neighbour\'s hit target off its own', () => {
	/*
	 * Two numbers in rules thirty lines apart, tied together by nothing but a
	 * comment, whose disagreement is silent and lands on the finger: the level
	 * ring's target reaches past its own box, and a checklist stacks rings, so a
	 * gap smaller than twice that reach makes the lower ring's target cover the
	 * upper ring's bottom edge and win a press aimed at it. Nothing in a type
	 * check, a unit test or a screenshot shows it — a hit target has no
	 * appearance — which is what §10 says a guard test is for.
	 *
	 * Held as the *relationship* rather than as a pixel count, so the tokens stay
	 * free to move: whatever the ring insets by, the gap is twice it.
	 */
	function value(subject: string, property: string): string | null {
		const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
		for (const block of withoutComments.split('}')) {
			const brace = block.indexOf('{');
			if (brace === -1) continue;
			const subjects = block
				.slice(0, brace)
				.split(',')
				.map((part) => part.trim().replace(/\s+/g, ' '))
				.map((selector) => selector.split(/[\s>]+/).pop() ?? '');
			if (!subjects.includes(subject)) continue;
			for (const declaration of block.slice(brace + 1).split(';')) {
				const [key, ...rest] = declaration.split(':');
				if ((key ?? '').trim() === property) return rest.join(':').trim();
			}
		}
		return null;
	}

	/** The token a `calc(-1 * var(--x))` or `calc(2 * var(--x))` is built on. */
	const token = (expression: string | null): string | null =>
		expression?.match(/var\((--[a-z0-9-]+)\)/)?.[1] ?? null;

	it('finds both rules it is meant to be comparing', () => {
		// Either selector renamed and this passes by comparing two nulls.
		expect(value('.sheetsmith-level-ring::after', 'inset')).not.toBeNull();
		expect(
			value('.sheetsmith-track-flags.sheetsmith-track-set', 'row-gap'),
		).not.toBeNull();
	});

	it('spaces a checklist by twice what the ring reaches', () => {
		const reach = value('.sheetsmith-level-ring::after', 'inset');
		const gap = value('.sheetsmith-track-flags.sheetsmith-track-set', 'row-gap');
		// `token` takes the first `var()` it finds, which is the vertical half:
		// two-value `inset` is block-then-inline, and stacking is the block axis.
		expect(token(reach)).toBe(token(gap));
		expect(gap).toMatch(/^calc\(\s*2\s*\*/);
	});
});

describe('the modifier column paints one colour, and shape is the channel', () => {
	it('gives no glyph in it a colour rule of its own', () => {
		/*
		 * **The whole column is `--text-muted` and the shape says the rest** —
		 * `zap`, `zap-off`, `plus`. Pinned because the value has already drifted
		 * twice: `.sheetsmith-table-inert` carried a `--text-muted` byte-identical
		 * to the rule it was written to override and painted nothing for months,
		 * and an empty cell carried `--text-faint`, which measured **2.20:1 light
		 * and 2.74:1 dark** — under `legibility.md` §3's 4.5:1 and under even the
		 * 3:1 a state mark owes.
		 *
		 * The empty cell's is the one worth a test rather than a comment, because
		 * the argument that lost was a *plausible* one: that a `plus` is an
		 * affordance for the press rather than a state mark, so it owes no bar. It
		 * is an affordance, and that convicts the value rather than saving it —
		 * `docs/UI.md` §7 renders the glyph always precisely because an unmarked
		 * entry point is a dead end on a phone with no hover, and at 2.20:1 it was
		 * functionally unmarked.
		 */
		const faint = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
			.split('}')
			.filter(
				(block) =>
					block.includes('sheetsmith-table-modifier') &&
					/color:\s*var\(--text-faint\)/.test(block),
			);
		expect(faint).toEqual([]);
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

describe('the flag rule\'s scope names every bare checkbox there is', () => {
	/*
	 * `editor.css` gives a ticked column flag its forced-colors mark through
	 * `.sheetsmith-entry-check`, because in that mode a checkbox's state is a
	 * fill and nothing else and the fill is discarded. That scope is only as
	 * good as the claim that every bare checkbox in the plugin wears the class.
	 *
	 * The claim holds because `checkField` in `editor/list-fields.ts` is the sole
	 * factory — its own header records that a fourth copy of the pattern is what
	 * earned it a function (PATTERNS §1) — and it stamps the label before it
	 * makes the input. So the scope tracks the factory rather than happening to
	 * name the one class that exists today.
	 *
	 * **A wider selector was the other option and is worse.** Scoping to the pane
	 * covers a checkbox drawn anywhere inside it, but it is a different arbitrary
	 * boundary rather than the rule the reason implies — a checkbox's state is one
	 * channel wherever it is — and it sweeps in Obsidian's own toggle, whose
	 * `input` is a grandchild of `.checkbox-container` at `opacity: 0`. Painting a
	 * background on a control the plugin does not draw is invisible here and
	 * still not the plugin's to paint.
	 *
	 * So the scope stays narrow and this makes its precondition loud. Without it,
	 * a checkbox built anywhere else keeps its state in the DOM, loses it in the
	 * paint, and says nothing — visible only to someone shooting forced colors on
	 * a view that happens to hold the new control.
	 */
	const CHECKBOX = /createEl\(\s*'input'\s*,\s*\{\s*type:\s*'checkbox'/g;
	const LABEL = /cls:\s*'sheetsmith-entry-check'/g;

	/** Every non-test `*.ts` under `src/`, by path relative to it. */
	function sourceFiles(dir: URL, prefix = ''): string[] {
		const found: string[] = [];
		for (const entry of readdirSync(dir)) {
			const url = new URL(entry, dir);
			if (statSync(url).isDirectory()) {
				found.push(
					...sourceFiles(new URL(`${entry}/`, dir), `${prefix}${entry}/`),
				);
			} else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
				found.push(`${prefix}${entry}`);
			}
		}
		return found;
	}

	const SRC = new URL('./', import.meta.url);
	const counted = sourceFiles(SRC).map((file) => {
		const source = readFileSync(new URL(file, SRC), 'utf8');
		return {
			file,
			checkboxes: [...source.matchAll(CHECKBOX)].length,
			labels: [...source.matchAll(LABEL)].length,
		};
	});

	it('finds the checkbox it is meant to be checking', () => {
		// A regex that quietly matched nothing would pass both cases below.
		expect(counted.reduce((sum, one) => sum + one.checkboxes, 0)).toBeGreaterThan(0);
	});

	it('scopes the rule it is guarding to that class', () => {
		// And that the stylesheet still says what this is about. Scoped to the
		// forced-colors block, since an ordinary-theme rule for the same class is
		// a different claim.
		const forced = CSS.replace(/\/\*[\s\S]*?\*\//g, '').match(
			/@media \(forced-colors: active\) \{[\s\S]*?\n\}/g,
		);
		expect(forced?.join('\n')).toContain(
			".sheetsmith-entry-check input[type='checkbox']:checked",
		);
	});

	it('draws none outside a file that makes the label', () => {
		const stray = counted
			.filter((one) => one.checkboxes > 0 && one.labels === 0)
			.map((one) => one.file);
		expect(stray).toEqual([]);
	});

	it('makes exactly one label per checkbox', () => {
		// `checkField` writes the pair together, so a file holding them writes as
		// many of one as of the other. A second checkbox added beside the factory
		// rather than through it breaks the count.
		const mismatched = counted
			.filter((one) => one.checkboxes !== one.labels)
			.map((one) => `${one.file}: ${one.checkboxes} boxes, ${one.labels} labels`);
		expect(mismatched).toEqual([]);
	});
});

describe('a textarea field over a list of lines looks like its siblings', () => {
	/*
	 * Three fields in the layout editor hold a list one-per-line, and all three
	 * need the same three rules to draw their textarea below the description at
	 * full width rather than beside it in the narrow control column.
	 *
	 * **The rule's own comment predicted this failure and did not prevent it,
	 * twice.** It records the trigger list being given a class of its own that
	 * styled nothing, falling back to the narrow column, and the two fields
	 * disagreeing on screen about what the same kind of field looks like — and
	 * then the bonus-types field arrived and did exactly that again. A comment is
	 * not a check, which is §10's case for a guard: the failure is invisible in a
	 * unit test and in a type check, and visible in the harness only to someone
	 * who happens to compare three fields.
	 *
	 * The classes are found by scanning the modules rather than listed here, so a
	 * fourth field of this kind is covered without anyone remembering to come
	 * back. Two spellings, because two of the three now declare their class as
	 * data for the shared form (`line-list-field.ts`) while the function library
	 * still calls `setClass` itself.
	 */
	const FIELDS = readdirSync(new URL('./editor', import.meta.url)).filter(
		(name) => name.endsWith('-field.ts'),
	);

	/** The class a field module gives its own Setting, if it is one of these. */
	function fieldClass(source: string): string | null {
		// The tell that a module is one of these fields rather than an ordinary
		// helper: it either draws the textarea or hands a spec to the module that
		// does.
		if (!source.includes('addTextArea') && !source.includes('renderLineList')) {
			return null;
		}
		return (
			/(?:\.setClass\(|className: )'(sheetsmith-[a-z-]+)'/.exec(source)?.[1] ??
			null
		);
	}

	const classes = FIELDS.map((name) =>
		fieldClass(
			readFileSync(new URL(`./editor/${name}`, import.meta.url), 'utf8'),
		),
	).filter((name): name is string => name !== null);

	/**
	 * Every selector in the file that ends in this suffix, so a class can be
	 * asked whether it is named in the rule that suffix belongs to.
	 *
	 * **Per selector rather than per rule body**, which is the correction: this
	 * used to split the stylesheet on `}` and look for the block containing both
	 * a marker word and a known class, so the marker `textarea` could select some
	 * other chunk and the case that reported red was not reliably the case whose
	 * rule was broken. The failure was real and the attribution was approximate.
	 * Asking about selectors names exactly one thing.
	 */
	function selectorsEndingIn(suffix: string): string[] {
		return selectors().filter((selector) => selector.endsWith(suffix));
	}

	it('finds the fields it is meant to be checking', () => {
		// A scan that matched nothing would pass the cases below by having nothing
		// in it, and the count is the whole premise: this rule is about fields
		// agreeing with each other, so fewer than two cannot disagree.
		expect(classes.length).toBeGreaterThanOrEqual(3);
	});

	it.each([
		['the block rule', ''],
		['the control rule', ' .setting-item-control'],
		['the textarea rule', ' textarea'],
	])('names every one of them in %s', (_name, suffix) => {
		const found = selectorsEndingIn(suffix);
		// The suffix has to select something, or the case passes by asking about a
		// rule that is not there.
		expect(found.length).toBeGreaterThan(0);
		const missing = classes.filter(
			(name) => !found.includes(`.${name}${suffix}`),
		);
		expect(missing).toEqual([]);
	});
});

describe('the stylesheet wins on specificity, never on !important', () => {
	/*
	 * Obsidian's review asks for no `!important`, and the stylesheet had exactly
	 * one: `.sheetsmith-input-invalid`'s outline, which was carrying a real
	 * cascade fight. Removing it needed the selector scoped *and* doubled, and
	 * `styles/editor.css` records the four specificity numbers that decided it.
	 *
	 * Three lines rather than a comment, because the count is now zero and zero
	 * is the only number a check like this can hold without arguing: the next one
	 * has to be a decision, and this is what makes it one. A rule that genuinely
	 * needs it can change this test and say why, which is what the [checked] tier
	 * means in `PATTERNS.md`.
	 *
	 * Declarations only. The prose in `editor.css` explains what it replaced and
	 * would otherwise report itself, which is the same skip every source scan in
	 * this repository needs.
	 */
	const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');

	it('has no !important declaration', () => {
		const offenders = [...withoutComments.matchAll(/[^;{}]*!\s*important/g)].map(
			(one) => one[0].trim(),
		);
		expect(offenders).toEqual([]);
	});

	it('would notice one', () => {
		// §10: the assertion above passes on a stylesheet this failed to read.
		expect(CSS.length).toBeGreaterThan(10000);
		expect(withoutComments).toContain('.sheetsmith-input-invalid');
	});
});

/** The stylesheet with its comments blanked, which every rule walk reads. */
const CSS_WITHOUT_COMMENTS = CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');

interface Rule {
	/** Every at-rule prelude the rule sits inside, outermost first. */
	context: string[];
	selector: string;
	body: string;
}

/** Every style rule in the file, with the at-rules around it. */
function rules(text: string): Rule[] {
	const found: Rule[] = [];
	const walk = (from: number, to: number, context: string[]): void => {
		let at = from;
		while (at < to) {
			const open = text.indexOf('{', at);
			if (open === -1 || open >= to) return;
			const prelude = text.slice(at, open).replace(/^[\s;}]+/, '').trim();
			// The matching brace, counting nesting.
			let depth = 1;
			let close = open + 1;
			while (depth > 0 && close < to) {
				const char = text[close];
				if (char === '{') depth += 1;
				else if (char === '}') depth -= 1;
				close += 1;
			}
			const inner = text.slice(open + 1, close - 1);
			if (prelude.startsWith('@')) {
				walk(open + 1, close - 1, [...context, prelude]);
			} else {
				found.push({ context, selector: prelude, body: inner.trim() });
			}
			at = close;
		}
	};
	walk(0, text.length, []);
	return found;
}

/**
 * A rule body's declarations, one `property: value` string each, with its
 * whitespace collapsed so a value wrapped over lines reads as one that is not.
 *
 * A plain split on `;`, which is right for this stylesheet because no value in
 * it holds one: its one `url()` is percent-encoded. A value that ever does would
 * split into a fragment with no property of its own, and the property scan below
 * reports that as unreadable rather than reading past it.
 */
function declarations(body: string): string[] {
	return body
		.split(';')
		.map((one) => one.trim().replace(/\s+/g, ' '))
		.filter((one) => one !== '');
}

/**
 * A rule's selector list, one selector each, whitespace collapsed.
 *
 * Split on the commas outside parentheses only, because
 * `:not(.sheetsmith-sr-only, .sheetsmith-card-note)` is one selector with a
 * comma inside it, and the `selectors()` split at the top of this file would
 * read it as two halves of nothing.
 */
function selectorList(selector: string): string[] {
	const found: string[] = [];
	let depth = 0;
	let from = 0;
	for (let at = 0; at <= selector.length; at++) {
		const char = selector[at];
		if (char === '(') depth += 1;
		else if (char === ')') depth -= 1;
		else if ((char === ',' && depth === 0) || at === selector.length) {
			const one = selector.slice(from, at).trim().replace(/\s+/g, ' ');
			if (one !== '') found.push(one);
			from = at + 1;
		}
	}
	return found;
}

/** (ids, classes and attributes and pseudo-classes, types) of one selector. */
function specificity(selector: string): [number, number, number] {
	const bare = selector.replace(/::[\w-]+/g, ' ');
	const ids = (bare.match(/#[\w-]+/g) ?? []).length;
	const classes =
		(bare.match(/\.[\w-]+/g) ?? []).length +
		(bare.match(/\[[^\]]*\]/g) ?? []).length +
		(bare.match(/:(?!:)[\w-]+/g) ?? []).length;
	const types = bare
		.replace(/\[[^\]]*\]/g, ' ')
		.split(/[\s>+~]+/)
		.filter((one) => /^[a-z]/i.test(one)).length;
	return [ids, classes, types];
}

/** Whether `a` beats `b` on weight alone. */
const heavier = (a: [number, number, number], b: [number, number, number]) =>
	a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];
const same = (a: [number, number, number], b: [number, number, number]) =>
	a.join() === b.join();

describe('no two rules declare the same body', () => {
	/*
	 * `docs/UI.md` §9's focus row is the argument, and it is the argument twice
	 * over. Five fields had the same four declarations written out before that
	 * list existed, which is a policy shared and its application duplicated
	 * (`docs/PATTERNS.md` §1): two copies of one treatment drift the first time
	 * one of them is edited, and nothing in review shows two rules agreeing.
	 * And the merge that collapsed them then lost them, because a scan that only
	 * counts copies is satisfied by *deleting* a rule as readily as by merging
	 * one. So this is two checks, and the second is what the first cannot be
	 * without.
	 *
	 * **Four declarations or more.** Measured by this scan on the stylesheet it
	 * was written against: 61, 25, 10, 4, 3 and 1 groups of identical bodies at
	 * one to six declarations or more. Below four the matches are coincidence (`min-width: 0` beside `max-width: 100%`
	 * is two properties, not a treatment); at four each one was a real copy of a
	 * real treatment, and the owner ruled on all four — three merged or removed,
	 * one kept below with its reason.
	 *
	 * **Keyed on the at-rules around a rule as well as its body**, deliberately.
	 * The same declarations at the top level and inside `@media (pointer:
	 * coarse)` are an override restating what it overrides, not a copy, and
	 * merging them is impossible: they do not apply under the same conditions.
	 * Two rules inside *separate* blocks with the same prelude do compare equal,
	 * because they apply under the same condition and can be merged. The body is
	 * split, trimmed, whitespace-collapsed and sorted, so declaration order and
	 * line wrapping cannot hide a copy.
	 */
	const MIN_DECLARATIONS = 4;

	/** Every group of rules sharing one body in one context, each rule by its selector list. */
	function duplicateBodies(text: string): string[][] {
		const byBody = new Map<string, string[]>();
		for (const rule of rules(text)) {
			const body = declarations(rule.body);
			if (body.length < MIN_DECLARATIONS) continue;
			const key = [...rule.context, body.sort().join('; ')].join('\n');
			const selector = selectorList(rule.selector).join(', ');
			byBody.set(key, [...(byBody.get(key) ?? []), selector]);
		}
		return [...byBody.values()]
			.filter((group) => group.length > 1)
			.map((group) => group.sort());
	}

	/**
	 * Bodies merged into one selector list on a ruling, each held to that list.
	 *
	 * **This is what makes the scan unsatisfiable by deletion.** Dropping a
	 * selector from one of these lists ends the duplicate as surely as merging
	 * did, and takes a treatment off every element it named. Held here, the drop
	 * fails exactly as a new copy would. A third consumer joining a list passes:
	 * what is asserted is that every name below is still on one rule, not that
	 * nothing else is.
	 *
	 * The record body's focus is not an entry, because it has a guard already.
	 * Its standalone copy was deleted rather than merged, the list it joined is
	 * `docs/UI.md` §9's focus roster, and "every field the sheet styles has a
	 * focus indicator" above fails if `sheetsmith-record-body-input` loses it.
	 */
	const SHARED_BODIES: { name: string; selectors: string[] }[] = [
		{
			name: "a component's authored name over a block of micro-labels",
			selectors: ['.sheetsmith-card-set-label', '.sheetsmith-table-label'],
		},
		{
			name: "a table's quiet header, and the Total in its foot",
			selectors: [
				'.sheetsmith-view .sheetsmith-table thead th',
				'.sheetsmith-view .sheetsmith-table tfoot .sheetsmith-table-name',
			],
		},
	];

	/** Each shared body whose selectors no longer all sit on one rule of that size. */
	function unshared(
		text: string,
		shared: { name: string; selectors: string[] }[],
	): string[] {
		const all = rules(text).filter(
			(rule) => declarations(rule.body).length >= MIN_DECLARATIONS,
		);
		return shared
			.filter(
				({ selectors }) =>
					!all.some((rule) => {
						const list = selectorList(rule.selector);
						return selectors.every((one) => list.includes(one));
					}),
			)
			.map(({ name }) => name);
	}

	/**
	 * Duplicates kept on a ruling, each with the reason it stays, enumerated the
	 * way `FOCUS_ELSEWHERE` is, because an exemption nobody states is a rule
	 * that quietly stops applying.
	 *
	 * - **Track's glyph buttons and Passport's.** Both reset a bare `<button>`
	 *   to a round glyph-only control, and the size policy is not in the copy:
	 *   it is `--sheetsmith-inline-control`, one token every such control reads.
	 *   What is duplicated is the reset, and the reset is a *family*. Table's
	 *   delete glyph and Record set's three controls are members whose bodies
	 *   differ (a `vertical-align`, a `flex`, a font size), so merging these two
	 *   would stand one arbitrary pair in for the family, and ruling on the
	 *   family is a pass of its own.
	 */
	const SAME_ON_PURPOSE: { rules: string[]; reason: string }[] = [
		{
			rules: [
				'.sheetsmith-view .sheetsmith-passport-part-remove, .sheetsmith-view .sheetsmith-passport-add',
				'.sheetsmith-view .sheetsmith-track-action-button, .sheetsmith-view .sheetsmith-track-modifier-button, .sheetsmith-view .sheetsmith-pool-modifier-button, .sheetsmith-view .sheetsmith-note-mark',
			],
			reason: 'a glyph-only reset whose family is unruled',
		},
	];

	const exempted = (group: string[]) =>
		SAME_ON_PURPOSE.some(
			(entry) => JSON.stringify([...entry.rules].sort()) === JSON.stringify(group),
		);

	/** Each exemption that no longer names a duplicate this stylesheet holds. */
	function staleExemptions(groups: string[][]): string[] {
		return SAME_ON_PURPOSE.filter(
			(entry) =>
				!groups.some(
					(group) => JSON.stringify([...entry.rules].sort()) === JSON.stringify(group),
				),
		).map(({ reason }) => reason);
	}

	it('finds the rules it is meant to be checking', () => {
		// The floor, because both assertions below are absences: a parse that
		// stopped reading bodies would report no duplicates and no drops.
		const all = rules(CSS_WITHOUT_COMMENTS);
		expect(all.length).toBeGreaterThan(600);
		const sized = all.filter(
			(rule) => declarations(rule.body).length >= MIN_DECLARATIONS,
		);
		expect(sized.length).toBeGreaterThan(150);
		// Inside at-rules too, which is where a flat parse goes blind.
		expect(sized.filter((rule) => rule.context.length > 0).length).toBeGreaterThan(
			5,
		);
	});

	it('has no two rules declaring one body, past the ones kept on purpose', () => {
		expect(duplicateBodies(CSS_WITHOUT_COMMENTS).filter((g) => !exempted(g))).toEqual(
			[],
		);
	});

	it('keeps every merged body on one rule', () => {
		expect(unshared(CSS_WITHOUT_COMMENTS, SHARED_BODIES)).toEqual([]);
	});

	it('holds each exemption to a duplicate that still exists', () => {
		// An exemption whose pair stopped matching would sit here licensing
		// whatever took its place, so a stale one fails rather than lingers.
		expect(staleExemptions(duplicateBodies(CSS_WITHOUT_COMMENTS))).toEqual([]);
	});

	it('would catch a copy, and a merge undone by deletion', () => {
		const body = 'color: red; margin: 0; padding: 0; border: none;';
		// Reordered and rewrapped, the copy is still a copy.
		expect(
			duplicateBodies(
				`.a { ${body} }\n.b {\n\tborder:   none;\n\tpadding: 0;\n\tmargin: 0;\n\tcolor: red;\n}`,
			),
		).toEqual([['.a', '.b']]);
		// Under one condition twice it is a copy; against the top level it is
		// an override.
		expect(
			duplicateBodies(
				`@media (pointer: coarse) { .a { ${body} } }\n@media (pointer: coarse) { .b { ${body} } }`,
			),
		).toEqual([['.a', '.b']]);
		expect(
			duplicateBodies(`.a { ${body} }\n@media (pointer: coarse) { .b { ${body} } }`),
		).toEqual([]);
		// Three declarations is under the line.
		expect(
			duplicateBodies('.a { color: red; margin: 0; padding: 0; }\n.b { color: red; margin: 0; padding: 0; }'),
		).toEqual([]);
		// A merged list losing a selector, or losing the rule, is reported.
		const shared = [{ name: 'planted', selectors: ['.a', '.b'] }];
		expect(unshared(`.a, .b { ${body} }`, shared)).toEqual([]);
		expect(unshared(`.a { ${body} }`, shared)).toEqual(['planted']);
		expect(unshared('', shared)).toEqual(['planted']);
		// And an exemption whose pair went is reported rather than kept.
		expect(staleExemptions([])).toHaveLength(SAME_ON_PURPOSE.length);
	});
});

describe('faint text on a sheet is a placeholder or a disabled control', () => {
	/*
	 * `--text-faint` measures **2.12:1 light and 2.57:1 dark on a card**, 2.20 and
	 * 2.74 on a table or a placed box, and 2.30 and 2.97 on `--background-primary`
	 * — under `legibility.md` §3's 4.5:1 for small text and its 3:1 for large text,
	 * on every surface a sheet has, in both themes. So text a reader reads back is
	 * never faint (`docs/UI.md` §6, `docs/features/text-faint-audit.md`).
	 *
	 * It stays in two kinds of place, and the selector says which: a
	 * placeholder, which is a hint standing in for a value and is the app's own
	 * `--input-placeholder-color`; and a disabled control, which WCAG 1.4.3
	 * exempts and which carries its state in `disabled` besides. Twenty-three
	 * faint text colours sat in `sheet.css` before the audit, each landing
	 * silently, because nothing here distinguishes a quiet gloss from an
	 * illegible one. This is that distinction.
	 *
	 * **`sheet.css` alone**, read from its source rather than from the assembled
	 * file: the editor's and the shared part's faint text were outside the audit,
	 * and the editor's disabled selects state their own reason at the rule.
	 *
	 * **The `color` property only.** A faint border or fill is a different bar —
	 * 3:1 for a mark that alone carries a state — and a track segment's resting
	 * outline is one, measured where it is drawn.
	 */
	const SHEET = readFileSync(
		new URL('./styles/sheet.css', import.meta.url),
		'utf8',
	).replace(/\/\*[\s\S]*?\*\//g, ' ');

	/**
	 * A faint text colour on a selector the rule above does not cover, each with
	 * the reason it stays. Empty: the audit lifted everything else. An entry is the
	 * whole selector list of one rule, as `selectorList` joins it.
	 */
	const FAINT_ON_PURPOSE: { selector: string; reason: string }[] = [];

	/** Every rule declaring a faint text colour, by its joined selector list. */
	function faintRules(text: string): string[] {
		return rules(text)
			.filter((rule) =>
				declarations(rule.body).some((one) =>
					/^color: .*--text-faint\b/.test(one),
				),
			)
			.map((rule) => selectorList(rule.selector).join(', '));
	}

	/**
	 * True where every selector in the list is a placeholder or a disabled
	 * control. Both anchored at the end, so the subject is the placeholder or the
	 * disabled control itself: a bare `includes` would pass `:not(:disabled)`,
	 * which is the enabled control, and `.x:disabled + .label`, which is text
	 * beside it.
	 */
	function keepsFaint(list: string): boolean {
		return selectorList(list).every(
			(one) => /::placeholder$/.test(one) || /:disabled$/.test(one),
		);
	}

	function unexplained(
		text: string,
		exemptions: { selector: string }[] = FAINT_ON_PURPOSE,
	): string[] {
		return faintRules(text).filter(
			(list) =>
				!keepsFaint(list) &&
				!exemptions.some((entry) => entry.selector === list),
		);
	}

	/** Each exemption that no longer names a faint rule this stylesheet holds. */
	function stale(
		text: string,
		exemptions: { selector: string; reason: string }[] = FAINT_ON_PURPOSE,
	): string[] {
		const found = faintRules(text);
		return exemptions
			.filter((entry) => !found.includes(entry.selector))
			.map(({ reason }) => reason);
	}

	it('finds the faint rules it is meant to be checking', () => {
		// Both kinds, so a parse that stopped reading bodies, or a stylesheet
		// that lost the file, cannot pass by finding nothing to object to.
		const found = faintRules(SHEET);
		expect(found.some((list) => list.includes('::placeholder'))).toBe(true);
		expect(found.some((list) => list.includes(':disabled'))).toBe(true);
	});

	it('keeps faint to placeholders and disabled controls, past the ones kept on purpose', () => {
		expect(unexplained(SHEET)).toEqual([]);
	});

	it('holds each exemption to a faint rule that still exists', () => {
		expect(stale(SHEET)).toEqual([]);
	});

	it('would catch a faint gloss, in a list or alone', () => {
		const faint = 'color: var(--text-faint);';
		expect(unexplained(`.sheetsmith-view .sheetsmith-x { ${faint} }`)).toEqual([
			'.sheetsmith-view .sheetsmith-x',
		]);
		// One read-back selector in a list of placeholders is still reported.
		expect(unexplained(`.a::placeholder, .b { ${faint} }`)).toEqual([
			'.a::placeholder, .b',
		]);
		// Inside a query too, which is where a flat parse goes blind.
		expect(
			unexplained(`@media (prefers-contrast: more) { .b { ${faint} } }`),
		).toEqual(['.b']);
		// `:disabled` counts only as the subject: not negated, not a neighbour's.
		expect(unexplained(`.a:not(:disabled) { ${faint} }`)).toEqual([
			'.a:not(:disabled)',
		]);
		expect(unexplained(`.x:disabled + .label { ${faint} }`)).toEqual([
			'.x:disabled + .label',
		]);
		// The two kinds pass, a `:not()` inside a placeholder included.
		expect(
			unexplained(
				`.a:not(.b, .c)::placeholder, .d:disabled { ${faint} }`,
			),
		).toEqual([]);
		// A faint border is not a text colour.
		expect(unexplained(`.e { border-color: var(--text-faint); }`)).toEqual([]);
		// An exemption covers its own list, and is stale once its rule goes.
		const planted = [{ selector: '.b', reason: 'planted' }];
		expect(unexplained(`.b { ${faint} }`, planted)).toEqual([]);
		expect(stale('', planted)).toEqual(['planted']);
	});
});

describe('every declaration names a real CSS property', () => {
	/*
	 * `segment-sizing: border-segment` shipped in `.sheetsmith-track-segment`
	 * and was found by hand. A browser drops a declaration it cannot parse
	 * without a word, and the host's own reset hid the loss, so the rule looked
	 * finished while one of its lines did nothing. A type check does not read
	 * CSS, and a shot shows what the page draws, not what it was told.
	 *
	 * The list is `known-css-properties`, pinned to an exact version so a
	 * release cannot move this check under an unchanged stylesheet. A property
	 * the list is missing fails here, and the answer is a newer pin, not an
	 * exemption. A custom property (`--*`) is exempt because any name is a real
	 * one; `every custom property the plugin declares is its own` above holds
	 * what those names may be.
	 *
	 * Declarations only, on the shared parse, so a rule inside an at-rule is
	 * checked like any other. An at-rule's own prelude, such as the
	 * `grid-template-columns: subgrid` a `@supports` tests, is not a declaration
	 * and is not read.
	 */
	const KNOWN = new Set(KNOWN_CSS_PROPERTIES);

	/** What was read: standard declarations checked, and custom ones passed over. */
	function scan(text: string): {
		unknown: string[];
		checked: number;
		custom: number;
		nested: number;
	} {
		const unknown: string[] = [];
		let checked = 0;
		let custom = 0;
		let nested = 0;
		for (const rule of rules(text)) {
			for (const one of declarations(rule.body)) {
				const colon = one.indexOf(':');
				const property = colon === -1 ? '' : one.slice(0, colon).trim().toLowerCase();
				if (property.startsWith('--')) {
					custom += 1;
					continue;
				}
				checked += 1;
				if (rule.context.length > 0) nested += 1;
				if (!KNOWN.has(property)) {
					unknown.push(`${selectorList(rule.selector).join(', ')} { ${one} }`);
				}
			}
		}
		return { unknown, checked, custom, nested };
	}

	it('finds the rules it is meant to be checking', () => {
		// The list loaded, and is the list: an empty import would report every
		// property, and a wrong one might report none.
		expect(KNOWN.size).toBeGreaterThan(500);
		expect(KNOWN.has('grid-template-columns')).toBe(true);
		// The parse reached the stylesheet, inside at-rules as well as outside,
		// and the exemption is exercised rather than merely written.
		const { checked, custom, nested } = scan(CSS_WITHOUT_COMMENTS);
		expect(checked).toBeGreaterThan(1500);
		expect(nested).toBeGreaterThan(100);
		expect(custom).toBeGreaterThan(20);
	});

	it('names only properties a browser knows', () => {
		expect(scan(CSS_WITHOUT_COMMENTS).unknown).toEqual([]);
	});

	it('would catch the property that shipped', () => {
		expect(
			scan('.sheetsmith-track-segment { segment-sizing: border-segment; }').unknown,
		).toEqual(['.sheetsmith-track-segment { segment-sizing: border-segment }']);
		// And inside an at-rule, and a fragment that is no declaration at all.
		expect(
			scan('@media (pointer: coarse) { .a { colr: red; } }\n.b { color }').unknown,
		).toEqual(['.a { colr: red }', '.b { color }']);
		// While a real property, a prefixed one and a custom one pass.
		expect(
			scan('.a { color: red; -webkit-mask-image: none; --sheetsmith-x: 1; }').unknown,
		).toEqual([]);
	});
});

describe("a Record set's strip of field names", () => {
	/*
	 * `docs/features/record-set-heading-strip.md`. Two things are held here and
	 * neither is visible in a unit test: that the strip's *thresholds* are the
	 * formula they were measured to be, and that the feature is a single gated
	 * block, so that leaving it leaves the feature and a list with the strip off
	 * (or under its threshold) is drawn by the rules that were always there.
	 *
	 * The scan reads rules with the at-rules they sit inside, which the flat
	 * `selectors()` above cannot: the claim is about *where* a rule lives.
	 */
	const all = rules(CSS_WITHOUT_COMMENTS);
	const GATE = '@supports (grid-template-columns: subgrid)';
	const STYLE_QUERY = '@container style(--sheetsmith-record-strip: on)';
	const inGate = (rule: Rule) => rule.context[0] === GATE;

	/** The per-count entries: `[N, px]`. */
	function thresholds(): [number, number][] {
		const out: [number, number][] = [];
		for (const rule of all) {
			const query = rule.context[1]?.match(
				/^@container sheetsmith-record-set \(min-width: ([\d.]+)px\)$/,
			);
			const count = rule.selector.match(
				/^\.sheetsmith-record-set-fields-(\d+) \.sheetsmith-record-set-box$/,
			);
			if (!inGate(rule) || !query || !count) continue;
			out.push([Number(count[1]), Number(query[1])]);
		}
		return out;
	}

	/**
	 * The measured formula, in px, because every width on the line is
	 * (`docs/features/record-set-stacking-tiers.md`): the container's `em` is
	 * `--font-ui-medium` in Obsidian and follows no text-size setting, so a
	 * threshold in it drew every strip at 15/16 of the width it was measured at.
	 *
	 * Swept in the harness with the strip forced on and every field the widest
	 * kind there is — a number whose ceiling the reader types — the narrowest list
	 * that leaves the name 96px and everything inside the delete glyph is 264,
	 * 372, 464, 556, 646, 738, 830 and 922px for one to eight fields
	 * (`188px + 92px × N` from two). `232px + 96px × N` clears each by 52 to 76px,
	 * and its base is what lifts one field over the stacking rule below.
	 */
	const BASE = 232;
	const STEP = 96;
	const FIT_PX = [264, 372, 464, 556, 646, 738, 830, 922];

	it('tabulates every count from one to eight, once each', () => {
		// A scan that found nothing, or a table missing an end, would pass the
		// cases below by having nothing to hold.
		// Against the component's own ceiling, not a literal: the class it stamps is
		// clamped to this number, so a table that stops short of it is a strip that
		// never draws for that count.
		expect(thresholds().map(([count]) => count)).toEqual(
			Array.from({ length: MAX_TABULATED_FIELDS }, (_, at) => at + 1),
		);
		expect(MAX_TABULATED_FIELDS).toBe(FIT_PX.length);
	});

	it('holds every threshold to the formula it was measured to', () => {
		const off = thresholds()
			.filter(([count, px]) => px !== BASE + STEP * count)
			.map(([count, px]) => `${count} fields at ${px}px`);
		expect(off).toEqual([]);
	});

	it('never puts a threshold under the narrowest width that holds its fields', () => {
		// A number below the measurement is a list the strip is drawn over at a
		// width its fields do not fit.
		const short = thresholds()
			.filter(([count, px]) => px < (FIT_PX[count - 1] ?? Infinity))
			.map(([count, px]) => `${count} fields at ${px}px`);
		expect(short).toEqual([]);
	});

	it('keeps every threshold above the 320px stacking rule, so the two never apply together', () => {
		const stacking = 320;
		expect(
			all.some(
				(rule) =>
					rule.context[0] === '@container (max-width: 320px)' &&
					rule.selector ===
						'.sheetsmith-record-set:not(.sheetsmith-record-set-fits-narrow) .sheetsmith-record-summary',
			),
		).toBe(true);
		const under = thresholds()
			.filter(([, px]) => px <= stacking)
			.map(([count, px]) => `${count} fields at ${px}px`);
		expect(under).toEqual([]);
	});

	it('gates the strip and everything it lays out behind the one query', () => {
		const inside = all.filter(
			(rule) =>
				rule.context[0] === GATE && rule.context[1] === STYLE_QUERY,
		);
		// It found the block, and the block is not most of nothing.
		expect(inside.length).toBeGreaterThan(8);
		const selectorsInside = inside.map((rule) => rule.selector);
		for (const wanted of [
			'.sheetsmith-record-set-list',
			'.sheetsmith-record-strip',
			'.sheetsmith-record-set-records',
			'.sheetsmith-record-fields',
		]) {
			expect(selectorsInside, wanted).toContain(wanted);
		}
	});

	it('draws nothing of the layout outside the gate', () => {
		// The claim is that leaving the query leaves the feature, so no rule outside
		// it may read the properties the feature stamps, and no rule for a Record
		// set's own classes may speak subgrid or stick. (Track's rows use subgrid
		// for their own reasons, which is why this asks about the record classes.)
		const outside = all.filter((rule) => !inGate(rule));
		const stamped = outside.filter((rule) =>
			/--sheetsmith-record-(fields|strip)/.test(rule.body),
		);
		expect(stamped).toEqual([]);
		const laidOut = outside.filter(
			(rule) =>
				/sheetsmith-record/.test(rule.selector) &&
				/subgrid|position:\s*sticky/.test(rule.body),
		);
		expect(laidOut).toEqual([]);
	});

	it('leaves three rules outside the gate, and they only take the strip away', () => {
		const featureClass =
			/sheetsmith-record-strip|sheetsmith-record-set-records|sheetsmith-record-set-headed/;
		const outside = all
			.filter((rule) => !inGate(rule) && featureClass.test(rule.selector))
			.map((rule) => [rule.selector, rule.body.replace(/\s+/g, ' ')]);
		expect(outside).toEqual([
			['.sheetsmith-record-set-headed', 'container-name: sheetsmith-record-set;'],
			['.sheetsmith-record-strip', 'display: none;'],
			['.sheetsmith-record-set-records', 'display: contents;'],
		]);
	});

	it('names the container on a headed list only, and adds none of its own', () => {
		// The block was already the list's container (`container-type` on
		// `.sheetsmith-record-set`, measured at the narrow rule); adding a second
		// would change what that unnamed rule answers to.
		const types = all.filter((rule) => /container-type/.test(rule.body));
		const onRecordSet = types
			.filter((rule) => /sheetsmith-record-set\b/.test(rule.selector))
			.map((rule) => rule.selector);
		expect(onRecordSet).toEqual(['.sheetsmith-record-set']);
		const names = all.filter(
			(rule) =>
				/container-name:\s*sheetsmith-record-set;/.test(rule.body),
		);
		expect(names.map((rule) => rule.selector)).toEqual([
			'.sheetsmith-record-set-headed',
		]);
	});

	it('keeps the strip opaque and sticky, and scrolls a focused control clear of it', () => {
		const inside = all.filter(
			(rule) => rule.context[1] === STYLE_QUERY,
		);
		const strip = inside.find(
			(rule) => rule.selector === '.sheetsmith-record-strip',
		);
		expect(strip?.body).toMatch(/position:\s*sticky/);
		expect(strip?.body).toMatch(/top:\s*0/);
		// Opaque: a record scrolls under it and is not read through it.
		expect(strip?.body).toMatch(
			/background-color:\s*var\(--background-primary-alt\)/,
		);
		const list = inside.find(
			(rule) => rule.selector === '.sheetsmith-record-set-list',
		);
		expect(list?.body).toMatch(
			/scroll-padding-top:\s*var\(--sheetsmith-record-strip-height\)/,
		);
		// The list's own padding moved off the top, or a band above the strip shows
		// records passing through.
		expect(list?.body).toMatch(/padding-block:\s*0/);
	});

	it("declares a record's type basis once, on the list, so the strip's cap is the plain line's", () => {
		// The cap is `13em` and a custom property's `em` resolves where it is used:
		// the plain line uses it on a record's summary, the strip on the list. With
		// the basis on the record alone the strip's cap came to 208px against 169.
		// One declaration on the list both inherit, and no second copy anywhere a
		// record or the list could pick up instead.
		const list = all.find(
			(rule) => rule.selector === '.sheetsmith-record-set-list' && rule.context.length === 0,
		);
		expect(list?.body).toMatch(/font-size:\s*var\(--font-ui-small\)/);
		const elsewhere = all.filter(
			(rule) =>
				rule !== list &&
				/^\.sheetsmith-record(-set-list|-set-records|-summary)?$/.test(rule.selector.trim()) &&
				/font-size:/.test(rule.body),
		);
		expect(elsewhere.map((rule) => rule.selector)).toEqual([]);
		const strip = all.find(
			(rule) =>
				rule.context[1] === STYLE_QUERY &&
				rule.selector === '.sheetsmith-record-set-list',
		);
		expect(strip?.body).toMatch(/minmax\(0, var\(--sheetsmith-record-name, 13em\)\)/);
	});

	it("moves a number field's ink under its heading inside the gate, and by paint alone", () => {
		// The shift is a `transform` so it changes no layout: the tracks, and with
		// them every threshold measured on the box, are what they were. And it is
		// inside the gate, so an unheaded list and a narrow headed one draw the
		// number field exactly where it always drew.
		const shifts = all.filter((rule) =>
			/transform:\s*translateX\(/.test(rule.body) &&
			/sheetsmith-record-field/.test(rule.selector),
		);
		expect(shifts.map((rule) => rule.selector)).toEqual([
			'.sheetsmith-record-summary .sheetsmith-record-field-number',
		]);
		expect(shifts[0]?.context).toEqual([GATE, STYLE_QUERY]);
		expect(shifts[0]?.body).toMatch(/translateX\(-0\.4em\)/);
		// Nothing in the gate changes a number field's width, which would move the
		// tracks the measured formula rests on.
		expect(shifts[0]?.body).not.toMatch(/width|padding|margin/);
	});

	it("scopes every rule naming a field to the summary line, so none reaches a body field", () => {
		/*
		 * A body field is drawn by the same code as a summary field and wears the
		 * same class, so a strip rule written against the bare class would reach
		 * it: centred in a track it does not have, shifted off its own name, and —
		 * the one that matters — its name hidden on a wide headed list, where
		 * nothing else names it (`docs/features/record-set-body-fields.md`). The
		 * 320px stacking rule is held the same way.
		 */
		const naming = (rule: Rule) =>
			/\.sheetsmith-record-field(?![s\w-])|\.sheetsmith-record-field-/.test(
				rule.selector,
			);
		const strip = all.filter(
			(rule) => rule.context[1] === STYLE_QUERY && naming(rule),
		);
		const narrow = all.filter(
			(rule) =>
				rule.context[0] === '@container (max-width: 320px)' && naming(rule),
		);
		// It found the rules it is about: the centring, the offset and the hide.
		expect(strip.length).toBeGreaterThanOrEqual(3);
		const unscoped = [...strip, ...narrow]
			.filter((rule) =>
				rule.selector
					.split(',')
					.some(
						(one) =>
							naming({ ...rule, selector: one }) &&
							!one.includes('.sheetsmith-record-summary'),
					),
			)
			.map((rule) => rule.selector);
		expect(unscoped).toEqual([]);
	});

	it('gives a body its second row only under the class that says it has a block', () => {
		const second = all.filter(
			(rule) =>
				/sheetsmith-record-body/.test(rule.selector) &&
				/grid-area:\s*2|row-gap/.test(rule.body),
		);
		// The row gap and the prose layers' row, at least.
		expect(second.length).toBeGreaterThanOrEqual(2);
		const outside = second
			.filter(
				(rule) =>
					!rule.selector.startsWith('.sheetsmith-record-body-has-fields'),
			)
			.map((rule) => rule.selector);
		expect(outside).toEqual([]);
		// And the block itself takes the first row under that same class.
		expect(
			all.some(
				(rule) =>
					rule.selector ===
						'.sheetsmith-record-body-has-fields > .sheetsmith-record-body-fields' &&
					/grid-area:\s*1\s*\/\s*1/.test(rule.body),
			),
		).toBe(true);
	});

	it('paints no colour of its own', () => {
		const inside = all.filter((rule) => rule.context[1] === STYLE_QUERY);
		const literal = inside.filter((rule) =>
			/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(rule.body),
		);
		expect(literal).toEqual([]);
	});
});

describe("a Record set's stacking tiers", () => {
	/*
	 * `docs/features/record-set-stacking-tiers.md`. A summary line stacks (name
	 * and delete on a row, the fields under the name) below the width its declared
	 * fields fit at, which the component stamps as a whole number of ems,
	 * `-fit-N`, and `sheet.css` tabulates because a container query can neither
	 * add widths nor take a threshold from a selector. Held here: that each entry
	 * is its rule, that the stacked layout is the 320px fallback's own, and that a
	 * list under its strip is never also stacked.
	 */
	const all = rules(CSS_WITHOUT_COMMENTS);
	const STACK_QUERY = '@container style(--sheetsmith-record-stack: on)';
	const GATE = '@supports (grid-template-columns: subgrid)';
	const FALLBACK = '@container (max-width: 320px)';
	const OPT_OUT = '.sheetsmith-record-set:not(.sheetsmith-record-set-fits-narrow) ';
	const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

	/** The per-tier entries, `[N, px, index in the file]`. */
	function tiers(): [number, number, number][] {
		const out: [number, number, number][] = [];
		all.forEach((rule, at) => {
			const query = rule.context.length === 1
				? rule.context[0]?.match(/^@container \(max-width: ([\d.]+)px\)$/)
				: null;
			const tier = rule.selector.match(
				/^\.sheetsmith-record-set-fit-(\d+) \.sheetsmith-record-set-box$/,
			);
			if (!query || !tier) return;
			expect(collapse(rule.body)).toBe('--sheetsmith-record-stack: on;');
			out.push([Number(tier[1]), Number(query[1]), at]);
		});
		return out;
	}

	/** The strip's per-count entries, `[N, em, index in the file, body]`. */
	function strips(): [number, number, number, string][] {
		const out: [number, number, number, string][] = [];
		all.forEach((rule, at) => {
			const query = rule.context[1]?.match(
				/^@container sheetsmith-record-set \(min-width: ([\d.]+)px\)$/,
			);
			const count = rule.selector.match(
				/^\.sheetsmith-record-set-fields-(\d+) \.sheetsmith-record-set-box$/,
			);
			if (rule.context[0] !== GATE || !query || !count) return;
			out.push([Number(count[1]), Number(query[1]), at, collapse(rule.body)]);
		});
		return out;
	}

	it('tabulates every tier the component can stamp, once each', () => {
		expect(tiers().map(([tier]) => tier)).toEqual(
			Array.from(
				{ length: MAX_FIT_TIER - MIN_FIT_TIER + 1 },
				(_, at) => at + MIN_FIT_TIER,
			),
		);
	});

	it('stacks tier N up to N steps of 16px, the estimated fit rounded up', () => {
		// In px, because every width on the line is a fixed-px token: an `em` table
		// stacked Traits to 792px at the harness's `text=24`, where it fits at 509.5.
		const off = tiers()
			.filter(([tier, px]) => px !== tier * STEP_PX)
			.map(([tier, px]) => `tier ${tier} at ${px}px`);
		expect(off).toEqual([]);
	});

	it('puts the fallback at its tier’s own threshold, in the same unit', () => {
		expect(FALLBACK).toBe(`@container (max-width: ${FALLBACK_FIT_TIER * STEP_PX}px)`);
	});

	it('holds the copied widths to the rules they were measured off', () => {
		const find = (selector: string) =>
			all
				.filter((rule) => rule.context.length === 0 && rule.selector === selector)
				.map((rule) => collapse(rule.body))
				.join(' ');
		expect(find('.sheetsmith-record-fields'), 'GAP_PX is --size-4-5').toMatch(
			/gap: var\(--size-4-5\)/,
		);
		expect(GAP_PX, 'GAP_PX is Obsidian’s --size-4-5, 20px').toBe(20);
		const text = find(
			'.sheetsmith-view .sheetsmith-record-input.sheetsmith-record-input.sheetsmith-record-input-text',
		);
		expect(text, 'TEXT_PX was measured at the input’s 14ch').toMatch(/max-width: 14ch/);
	});

	it('gives the plain line’s fields their width before the name grows', () => {
		/*
		 * `docs/features/record-summary-fields-first.md`. `lineFitPx` is a plain
		 * sum only while the plain line's fields' track is `max-content`; under the
		 * base `auto` it would grow with the name and every fit would come out up
		 * to 73px short. The rule is gated on a style query, so an engine without
		 * one keeps the base `auto` line, and it must sit after the base rule (to
		 * win over it) and before the stack block (so a stacked line's template,
		 * which it cannot reach anyway, and the strip's subgrid follow it).
		 */
		const GATED = '@container not style(--sheetsmith-record-stack: on)';
		const gated = all
			.map((rule, at) => ({ rule, at }))
			.filter(
				({ rule }) =>
					rule.context.length === 1 &&
					rule.context[0] === GATED &&
					rule.selector === '.sheetsmith-record-summary',
			);
		expect(gated.length).toBe(1);
		const [{ rule, at }] = gated as [{ rule: (typeof all)[number]; at: number }];
		expect(collapse(rule.body)).toBe(
			'grid-template-columns: auto minmax(0, var(--sheetsmith-record-name, 13em)) max-content 1fr auto;',
		);
		const base = all.findIndex(
			(one) =>
				one.context.length === 0 &&
				one.selector === '.sheetsmith-record-summary' &&
				/grid-template-columns/.test(one.body),
		);
		expect(base).toBeGreaterThanOrEqual(0);
		expect(
			collapse((all[base] as (typeof all)[number]).body),
			'the base keeps `auto`, for an engine with no style queries',
		).toContain(
			'grid-template-columns: auto minmax(0, var(--sheetsmith-record-name, 13em)) auto 1fr auto;',
		);
		const firstStacked = all.findIndex(
			(one) => one.context.length === 1 && one.context[0] === STACK_QUERY,
		);
		expect(base).toBeLessThan(at);
		expect(at).toBeLessThan(firstStacked);
		// The strip keeps its own tracks: each field `auto`, as measured.
		expect(
			all.some((one) =>
				/repeat\(var\(--sheetsmith-record-fields\), auto\)/.test(collapse(one.body)),
			),
		).toBe(true);
	});

	it('draws the fallback’s stacked line, and nothing else', () => {
		// The fallback's selectors carry the opt-out a line that fits by 320px
		// wears; past that prefix the two blocks are the same five rules.
		const narrow = all
			.filter(
				(rule) =>
					rule.context[0] === FALLBACK &&
					/sheetsmith-record/.test(rule.selector) &&
					!/sheetsmith-record-set-fit-/.test(rule.selector),
			)
			.map((rule) => [rule.selector.replace(OPT_OUT, ''), collapse(rule.body)]);
		const stacked = all
			.filter((rule) => rule.context.length === 1 && rule.context[0] === STACK_QUERY)
			.map((rule) => [rule.selector, collapse(rule.body)]);
		expect(narrow.length).toBe(5);
		expect(stacked).toEqual(narrow);
	});

	it('passes by a line that fits by 320px in every fallback rule', () => {
		const unscoped = all
			.filter(
				(rule) =>
					rule.context[0] === FALLBACK &&
					/sheetsmith-record/.test(rule.selector) &&
					!/sheetsmith-record-set-fit-/.test(rule.selector),
			)
			.filter((rule) => !rule.selector.includes(OPT_OUT))
			.map((rule) => rule.selector);
		expect(unscoped).toEqual([]);
	});

	it('writes the stacked line twice and only twice', () => {
		// The fallback, for an engine with no style queries, and the block under
		// the style query. Any third copy is one the equality test above misses.
		const placing = all.filter(
			(rule) =>
				/sheetsmith-record-fields$/.test(rule.selector) &&
				/grid-row:\s*2/.test(rule.body),
		);
		expect(placing.map((rule) => rule.context[0])).toEqual([FALLBACK, STACK_QUERY]);
	});

	it('turns the stacked line off with every strip entry', () => {
		const missing = strips()
			.filter(([, , , body]) => !body.includes('--sheetsmith-record-stack: off;'))
			.map(([count]) => count);
		expect(strips().length).toBe(MAX_TABULATED_FIELDS);
		expect(missing).toEqual([]);
	});

	it('puts every strip entry after every tier entry, which is what lets it win', () => {
		// `@container` adds no specificity and the selectors weigh the same, so
		// source order alone decides between `on` and `off`.
		const lastTier = Math.max(...tiers().map(([, , at]) => at));
		const firstStrip = Math.min(...strips().map(([, , at]) => at));
		expect(lastTier).toBeLessThan(firstStrip);
	});

	it('keeps no stacking entry keyed on a text field, which the tiers now size', () => {
		expect(
			all.filter((rule) => /sheetsmith-record-set-(text|stack-)/.test(rule.selector)),
		).toEqual([]);
	});
});

describe('a field its condition hid is hidden', () => {
	/*
	 * `docs/features/conditional-field-visibility.md`. The component sets
	 * `hidden` on a Record set field's cell, and on a body block whose every
	 * field is hidden, and the user-agent `[hidden] { display: none }` loses to
	 * any author rule giving the element a `display`. That is `docs/PATTERNS.md`
	 * §10's vacuous pass exactly: the attribute is set, the component's tests go
	 * green, and every field still draws. happy-dom computes no style, so this
	 * scan is the only instrument that can see it.
	 */
	const HIDEABLE = [
		/\.sheetsmith-record-field(?![\w-])/,
		/\.sheetsmith-record-body-fields(?![\w-])/,
	];

	/**
	 * Every selector giving one of the hideable classes a `display` other than
	 * none, with no answer after it or above it in weight — and how many it found,
	 * so a class renamed out from under the scan cannot pass it over nothing.
	 */
	function unanswered(text: string): { found: number; open: string[] } {
		const walked = rules(text);
		const parts = walked.flatMap((rule, at) =>
			rule.selector.split(',').map((one) => ({ rule, at, selector: one.trim() })),
		);
		const answers = parts.filter(
			({ rule, selector }) =>
				/\[hidden\]/.test(subjectOf(selector)) &&
				/display:\s*none/.test(rule.body),
		);
		const displays = parts.filter(
			({ rule, selector }) =>
				HIDEABLE.some((cls) => cls.test(subjectOf(selector))) &&
				!/\[hidden\]/.test(selector) &&
				/(^|[;\s])display:\s*(?!none)/.test(rule.body),
		);
		const open = displays
			.filter(({ at, selector }) => {
				const cls = HIDEABLE.find((one) => one.test(subjectOf(selector)));
				return !answers.some((answer) => {
					if (cls === undefined || !cls.test(subjectOf(answer.selector))) return false;
					const mine = specificity(answer.selector);
					const theirs = specificity(selector);
					// Heavier wins anywhere; equal wins only by coming later.
					return heavier(mine, theirs) || (same(mine, theirs) && answer.at > at);
				});
			})
			.map(({ selector }) => selector);
		return { found: displays.length, open };
	}

	it('answers every display either class is given with a [hidden] rule that wins', () => {
		const { found, open } = unanswered(CSS_WITHOUT_COMMENTS);
		// The field's `inline-flex` and the block's `flex`, at least.
		expect(found).toBeGreaterThanOrEqual(2);
		expect(open).toEqual([]);
	});

	it('would catch a display the [hidden] rule does not outweigh', () => {
		// The case above asserts an empty list, so it reads the same on a sheet
		// with no answer at all. Driven over the shape it exists to reject: no
		// answer, an answer too light, and an answer of equal weight placed above.
		expect(
			unanswered('.sheetsmith-record-field { display: inline-flex; }').open,
		).toEqual(['.sheetsmith-record-field']);
		expect(
			unanswered(
				'.sheetsmith-view .sheetsmith-record-summary .sheetsmith-record-field { display: grid; }\n' +
					'.sheetsmith-record-field[hidden] { display: none; }',
			).open,
		).toHaveLength(1);
		expect(
			unanswered(
				'.sheetsmith-view .sheetsmith-record-field[hidden] { display: none; }\n' +
					'.sheetsmith-view .sheetsmith-record-field.x { display: flex; }',
			).open,
		).toHaveLength(1);
		// And passes the answer this stylesheet actually gives.
		expect(
			unanswered(
				'.sheetsmith-record-body-fields { display: flex; }\n' +
					'.sheetsmith-view .sheetsmith-record-body-fields[hidden] { display: none; }',
			),
		).toEqual({ found: 1, open: [] });
	});

	it('places a headed summary field by its own track number, not by auto-placement', () => {
		// Hidden is `display: none`, which takes a field out of placement, so an
		// auto-placed field after it would slide one track left out from under its
		// heading.
		const placed = rules(CSS_WITHOUT_COMMENTS).filter(
			(rule) =>
				rule.selector === '.sheetsmith-record-summary .sheetsmith-record-field' &&
				rule.context[1] === '@container style(--sheetsmith-record-strip: on)',
		);
		expect(placed).toHaveLength(1);
		expect(placed[0]?.body).toMatch(
			/grid-column:\s*var\(--sheetsmith-record-track\)/,
		);
	});
});

describe("a sheet input's width outranks Obsidian's phone rule", () => {
	/*
	 * `docs/features/phone-input-width.md`. On a phone Obsidian adds
	 * `.is-mobile input[type='text'] { width: 100% }`, at (0,2,1). The scope rule
	 * above buys (0,2,0), which clears the desktop `input[type='text']` at (0,1,1)
	 * and loses to this one, so on a phone every text field the sheet sizes took
	 * the whole width it was offered: a record's number field went from 52px to
	 * 177px and its name to 11, a pool's reading to the width of its card. Nothing
	 * in vitest or the harness could see it, since neither carries `.is-mobile` or
	 * the app's mobile rules, so this scan is the guard.
	 *
	 * **Every rule giving a sheet text field a width must weigh more than (0,2,1)**,
	 * and the stylesheet buys (0,3,0) by doubling the field's class on a rule that
	 * declares the width and nothing else: doubling a whole rule would also lift its
	 * padding and background over the field's own `:hover` and `:focus`.
	 * `width: 100%` is exempt, because losing to the app's `100%` changes nothing.
	 *
	 * Which classes are text fields is `FIELD_CLASS`'s naming, less `-select`, plus
	 * the text inputs in `NAMED_FIELD_CLASSES`. So the guard is only as complete as
	 * that naming: a text input sized through a class outside both, or through an
	 * element selector, gets past it. A `<textarea>` under the pattern is
	 * swept in too, which costs a doubled class it does not need and nothing else;
	 * today both, `-rich-text-input` and `-record-body-input`, are `100%` and exempt.
	 */
	const PHONE_RULE: [number, number, number] = [0, 2, 1];
	// The named controls that are text inputs: the canvas overlay is a button,
	// which Obsidian's phone rule does not select.
	const TEXT_FIELDS_OUTSIDE_THE_PATTERN = NAMED_FIELD_CLASSES.filter(
		(cls) => cls !== 'sheetsmith-canvas-overlay',
	);

	const isTextField = (selector: string): boolean => {
		const subject = subjectOf(selector);
		const classes = (subject.match(/\.[\w-]+/g) ?? []).map((one) => one.slice(1));
		return classes.some(
			(cls) =>
				(FIELD_CLASS.test(`.${cls}`) && !cls.endsWith('-select')) ||
				TEXT_FIELDS_OUTSIDE_THE_PATTERN.includes(cls),
		);
	};

	/** Every selector giving a text field a width the phone rule would replace, and those too light. */
	function sized(text: string): { found: string[]; light: string[] } {
		const found: string[] = [];
		const light: string[] = [];
		for (const rule of rules(text)) {
			const width = declarations(rule.body)
				.filter((one) => /^width\s*:/.test(one))
				.map((one) => one.slice(one.indexOf(':') + 1).trim());
			if (width.length === 0 || width.every((value) => value === '100%')) continue;
			for (const selector of selectorList(rule.selector)) {
				if (!isTextField(selector)) continue;
				found.push(selector);
				if (!heavier(specificity(selector), PHONE_RULE)) light.push(selector);
			}
		}
		return { found, light };
	}

	it('gives every text field its width at more than (0,2,1)', () => {
		const { found, light } = sized(CSS_WITHOUT_COMMENTS);
		// A record's number field, a table's, a pool's three, a track's name and
		// a passport's, with their field-sizing answers: a scan that matched
		// nothing would pass on an empty list.
		expect(found.length).toBeGreaterThanOrEqual(12);
		expect(light).toEqual([]);
	});

	/**
	 * Every rule that narrows a doubled width rule to a case and ties with it.
	 *
	 * Doubling a field's width to (0,3,0) lifts it to the weight its own
	 * overrides already had: `.sheetsmith-table-text .sheetsmith-table-input` and
	 * `.sheetsmith-record-input.sheetsmith-record-input-text` used to beat their
	 * (0,2,0) base on weight and would win only by coming later. So a rule giving
	 * the same field a width under a narrower selector must outweigh the doubled
	 * one. The same selector restated, as a `@supports` override is, is exempt: it
	 * is the base itself, answered by order on purpose.
	 */
	function tied(text: string): { bases: string[]; tied: string[] } {
		const widths = rules(text)
			.filter((rule) => declarations(rule.body).some((one) => /^width\s*:/.test(one)))
			.flatMap((rule) => selectorList(rule.selector));
		const classesOf = (selector: string) =>
			(subjectOf(selector).match(/\.[\w-]+/g) ?? []).map((one) => one.slice(1));
		// The doubled rule's own shape, and only it: an override may double the
		// class too, and is then a narrower rule, not a second base.
		const DOUBLED = /^\.sheetsmith-view \.([\w-]+)\.\1$/;
		const doubled = widths.filter((selector) => DOUBLED.test(selector));
		const out: string[] = [];
		for (const base of doubled) {
			const field = DOUBLED.exec(base)?.[1] ?? '';
			for (const other of widths) {
				if (other === base || !classesOf(other).includes(field)) continue;
				if (!heavier(specificity(other), specificity(base))) out.push(other);
			}
		}
		// The fields it found a doubled base for, so a base respelled out of
		// `DOUBLED`'s exact shape cannot pass the check by leaving it nothing to do.
		const bases = [...new Set(doubled.map((base) => DOUBLED.exec(base)?.[1] ?? ''))];
		return { bases, tied: [...new Set(out)] };
	}

	it('gives every narrower width on a doubled field more weight than the doubled rule', () => {
		const { bases, tied: open } = tied(CSS_WITHOUT_COMMENTS);
		// The nine fields the phone fix doubled, each recognised as a base.
		expect(bases.length).toBeGreaterThanOrEqual(9);
		expect(open).toEqual([]);
	});

	it('would catch an override that ties with its doubled base', () => {
		const base = '.sheetsmith-view .sheetsmith-table-input.sheetsmith-table-input { width: 4em; }\n';
		expect(
			tied(base + '.sheetsmith-view .sheetsmith-table-text .sheetsmith-table-input { width: 100%; }').tied,
		).toEqual(['.sheetsmith-view .sheetsmith-table-text .sheetsmith-table-input']);
		expect(
			tied(
				base +
					'@supports (field-sizing: content) { .sheetsmith-view .sheetsmith-table-input.sheetsmith-table-input { width: auto; } }\n' +
					'.sheetsmith-view .sheetsmith-table-text .sheetsmith-table-input.sheetsmith-table-input { width: 100%; }',
			),
		).toEqual({ bases: ['sheetsmith-table-input'], tied: [] });
	});

	it('would catch a width the phone rule outranks', () => {
		// Driven over the shapes it exists to reject: the scoped rule that shipped,
		// one at exactly (0,2,1) that wins only on load order, and the text field
		// named outside the pattern. And it passes the doubled answer and a `100%`.
		expect(
			sized('.sheetsmith-view .sheetsmith-record-input { width: 3.5em; }').light,
		).toEqual(['.sheetsmith-view .sheetsmith-record-input']);
		expect(
			sized('.sheetsmith-view input.sheetsmith-table-input { width: 4em; }').light,
		).toHaveLength(1);
		expect(
			sized('.sheetsmith-view .sheetsmith-pool-adjust-amount { width: 5ch; }').light,
		).toHaveLength(1);
		expect(
			sized(
				'.sheetsmith-view .sheetsmith-record-input.sheetsmith-record-input { width: 3.5em; }\n' +
					'.sheetsmith-view .sheetsmith-card-input { width: 100%; }\n' +
					'.sheetsmith-view .sheetsmith-card-select { width: auto; }',
			),
		).toEqual({
			found: ['.sheetsmith-view .sheetsmith-record-input.sheetsmith-record-input'],
			light: [],
		});
	});
});

describe("a sheet button's padding outranks Obsidian's tablet rule", () => {
	/*
	 * On a tablet Obsidian adds `.is-tablet button:not(.clickable-icon)` with
	 * `padding: var(--size-4-1) var(--size-4-5)`, at (0,2,1) because a `:not()`
	 * argument counts. Every sheet button rule setting padding was (0,2,0) or
	 * lighter — four were a bare class at (0,1,0) — so on a
	 * tablet each lost its own padding: a border-box glyph button 1.6em wide took
	 * 40px of it and a level ring drew as a 42 × 33 oval. Read from 1.14.4's
	 * `app.css` and seen in `sheet-tablet`, which only a driven shot stages, so
	 * this scan is what a build can hold.
	 *
	 * **Every rule giving a sheet button padding must weigh more than (0,2,1)**,
	 * which the stylesheet buys by doubling the class on a rule declaring the
	 * padding alone: the phone width fix's shape and its reason, since a doubled
	 * whole rule would lift the button's border and fill over its own `:hover`.
	 *
	 * **The list is explicit**, for the panel scope check's reason: which classes
	 * land on a `<button>` is a fact about `components/`, not about a name, and a
	 * pattern would miss `-ring` and `-tab` or drag in `-glyph`. It was taken from
	 * the harness over CDP, every button on `populated`, `records` and an open
	 * modifier form, measured with `is-tablet` on `body` and off. The panel's
	 * **Save**, **Cancel**, **Confirm** and **Remove** are not in it: they take the
	 * app's button chrome whole (`docs/UI.md` §2), so its tablet padding is theirs
	 * too. Add a class here when a component grows a button that sets padding.
	 *
	 * **And the list is held to the source from below**: every class a
	 * component writes literally onto a `<button>` it creates must be in it or
	 * in `APP_CHROME`, so a new button cannot slip past by not being listed.
	 * The read is narrow — a `createEl('button', { cls })`, an
	 * `element('button', cls)`, or a `createEl('button')` whose variable is given
	 * a literal class within the next few lines — so a class passed through a
	 * variable (`NOTE_MARK_CLASS`, hold-repeat's `className`) is held by the list
	 * alone, which is why the list stays the floor.
	 */
	const TABLET_RULE: [number, number, number] = [0, 2, 1];
	const BUTTONS = [
		'sheetsmith-level-ring',
		'sheetsmith-table-remove-button',
		'sheetsmith-table-modifier-button',
		'sheetsmith-table-add-button',
		'sheetsmith-pool-step',
		'sheetsmith-pool-adjust-trigger',
		'sheetsmith-pool-adjust-direction',
		'sheetsmith-pool-modifier-button',
		'sheetsmith-track-action-button',
		'sheetsmith-track-modifier-button',
		'sheetsmith-note-mark',
		'sheetsmith-passport-part-remove',
		'sheetsmith-passport-add',
		'sheetsmith-record-group-toggle',
		'sheetsmith-record-disclosure',
		'sheetsmith-record-modifier',
		'sheetsmith-record-remove',
		'sheetsmith-record-add',
		'sheetsmith-tabset-tab',
		'sheetsmith-trigger',
		'sheetsmith-panel-line',
		'sheetsmith-panel-add',
		'sheetsmith-stat-block-revert',
		'sheetsmith-stat-block-action',
		'sheetsmith-stat-block-brief',
		'sheetsmith-stat-block-disclosure',
	];
	/**
	 * Classes on a sheet `<button>` that set no padding of their own: the four
	 * panel actions take the app's chrome whole, and `-track-harm` is a state on
	 * a level ring, which the list already holds.
	 */
	const APP_CHROME = [
		'sheetsmith-panel-save',
		'sheetsmith-panel-cancel',
		'sheetsmith-panel-confirm',
		'sheetsmith-panel-remove',
		'sheetsmith-track-harm',
	];
	/**
	 * The layout editor pane's own buttons that set padding
	 * (`docs/features/layout-editor-narrow-regime.md` §5), a list of the pane's
	 * rather than more lines in the sheet's, since the two are held to one rule
	 * from two stylesheets that must not know each other. Taken the same way, over
	 * CDP at 820 with each tree row selected in turn: the name and the chevron
	 * moved, and the overlay's computed padding moved under a box that did not.
	 */
	const EDITOR_BUTTONS = [
		'sheetsmith-tree-name',
		'sheetsmith-tree-disclosure',
		'sheetsmith-canvas-overlay',
	];
	/**
	 * Classes on a pane `<button>` that set no padding of the plugin's own. Every
	 * **Add …** footer button, **Add row** among them, takes the app's chrome
	 * whole, and so its tablet padding; `clickable-icon` is the class the app's
	 * tablet rule excludes by name; and **Back to the selection** is a text button
	 * in the app's own chrome.
	 */
	const EDITOR_APP_CHROME = ['mod-cta', 'clickable-icon', 'sheetsmith-panel-back'];

	/** Every literal class the source in `dirs` writes onto a `<button>` it creates. */
	function buttonClassesInSource(dirs: readonly string[]): string[] {
		const found = new Set<string>();
		for (const dir of dirs) {
			const at = new URL(`./${dir}/`, import.meta.url);
			for (const file of readdirSync(at)) {
				if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
				const text = readFileSync(new URL(file, at), 'utf8');
				for (const match of text.matchAll(
					/(?:element|createEl)\(\s*'button',\s*(?:\{[^}]*?cls:\s*)?'([\w-]+)'/g,
				)) {
					found.add(match[1] as string);
				}
				for (const match of text.matchAll(/(\w+) = [\w.]*createEl\(\s*'button'\s*\)/g)) {
					const after = text.slice(match.index, match.index + 700);
					const added = new RegExp(
						`\\b${match[1] as string}\\.(?:classList\\.add|addClass)\\(\\s*'([\\w-]+)'`,
						'g',
					);
					for (const one of after.matchAll(added)) found.add(one[1] as string);
				}
			}
		}
		return [...found].sort();
	}

	it('lists every class the source writes onto a sheet button, or exempts it', () => {
		const inSource = buttonClassesInSource(['components', 'view', 'interaction']);
		// The read finds the bulk of them, or it holds nothing.
		expect(inSource.length).toBeGreaterThanOrEqual(20);
		expect(inSource.filter((cls) => !BUTTONS.includes(cls) && !APP_CHROME.includes(cls))).toEqual([]);
	});

	it('lists every class the source writes onto a pane button, or exempts it', () => {
		const inSource = buttonClassesInSource(['editor']);
		// The three, and the app-chrome classes beside them: a read that found
		// none of the pane's own would pass on an empty list. The editor's level
		// sample wears `.sheetsmith-view` and the sheet's ring, so the sheet's list
		// holds it.
		expect(inSource.filter((cls) => EDITOR_BUTTONS.includes(cls)).sort()).toEqual(
			[...EDITOR_BUTTONS].sort(),
		);
		expect(
			inSource.filter(
				(cls) =>
					!EDITOR_BUTTONS.includes(cls) &&
					!EDITOR_APP_CHROME.includes(cls) &&
					!BUTTONS.includes(cls),
			),
		).toEqual([]);
	});

	/** Every selector giving a sheet button padding, and those too light to keep it. */
	function padded(text: string): { found: string[]; light: string[] } {
		const found: string[] = [];
		const light: string[] = [];
		for (const rule of rules(text)) {
			if (!declarations(rule.body).some((one) => /^padding(-[\w-]+)?\s*:/.test(one))) continue;
			for (const selector of selectorList(rule.selector)) {
				const classes = (subjectOf(selector).match(/\.[\w-]+/g) ?? []).map((one) => one.slice(1));
				if (!classes.some((cls) => BUTTONS.includes(cls) || EDITOR_BUTTONS.includes(cls))) continue;
				found.push(selector);
				if (!heavier(specificity(selector), TABLET_RULE)) light.push(selector);
			}
		}
		return { found, light };
	}

	it('gives every sheet button its padding at more than (0,2,1)', () => {
		const { found, light } = padded(CSS_WITHOUT_COMMENTS);
		// Every listed class matched by at least one rule, so a class whose
		// padding rule went missing cannot hide behind another's count.
		const classesIn = (selector: string) =>
			(subjectOf(selector).match(/\.[\w-]+/g) ?? []).map((one) => one.slice(1));
		const unmatched = [...BUTTONS, ...EDITOR_BUTTONS].filter(
			(cls) => !found.some((selector) => classesIn(selector).includes(cls)),
		);
		expect(unmatched).toEqual([]);
		expect(light).toEqual([]);
	});

	it('would catch a padding the tablet rule outranks', () => {
		// The scoped rule that shipped, a long-hand, and an unscoped class; and it
		// passes the doubled answer and a button it does not list.
		expect(padded('.sheetsmith-view .sheetsmith-level-ring { padding: 0; }').light).toEqual([
			'.sheetsmith-view .sheetsmith-level-ring',
		]);
		expect(
			padded('.sheetsmith-view .sheetsmith-tabset-tab { padding-inline: 0; }').light,
		).toHaveLength(1);
		expect(padded('.sheetsmith-pool-step { padding: 0; }').light).toHaveLength(1);
		// The pane's own, at the (0,2,0) every one of them shipped at.
		expect(padded('.sheetsmith-tree-row .sheetsmith-tree-name { padding: 0; }').light).toEqual([
			'.sheetsmith-tree-row .sheetsmith-tree-name',
		]);
		expect(
			padded(
				'.sheetsmith-view .sheetsmith-level-ring.sheetsmith-level-ring { padding: 0; }\n' +
					'.sheetsmith-panel .sheetsmith-panel-save { padding: 0; }',
			),
		).toEqual({
			found: ['.sheetsmith-view .sheetsmith-level-ring.sheetsmith-level-ring'],
			light: [],
		});
	});
});

describe('the add control pinned to the foot of the card', () => {
	const stripped = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
	const all = rules(stripped);
	const control = all.find(
		(rule) =>
			rule.context.length === 0 &&
			rule.selector.includes('.sheetsmith-table-add-button') &&
			rule.selector.includes('.sheetsmith-record-add') &&
			/margin-top:\s*auto/.test(rule.body),
	);

	it('is one rule for both components, pinned and a finger tall', () => {
		expect(control).toBeDefined();
		// Pinned to the foot of a box taller than its rows.
		expect(control?.body).toMatch(/margin-top:\s*auto/);
		// Its height is the level ring's own token, which the coarse-pointer
		// block raises on `body`, so it grows to a finger with the marks beside it.
		expect(control?.body).toMatch(
			/min-height:\s*var\(--sheetsmith-inline-control,\s*1\.6em\)/,
		);
		const coarse = all.filter(
			(rule) =>
				rule.context.includes('@media (pointer: coarse)') &&
				/--sheetsmith-inline-control-factor:\s*2\.2;/.test(rule.body),
		);
		expect(coarse.length).toBeGreaterThan(0);
	});

	it('is not sticky, and a table row no longer carries it', () => {
		expect(stripped).not.toMatch(/\.sheetsmith-table-add-label[^{]*\{[^}]*sticky/);
		expect(stripped).not.toMatch(/\.sheetsmith-table-add\s*[ ,{]/);
	});

	it('keeps exactly one line between the last row, the foot and the control', () => {
		// Without a foot the last row drops its rule and the control's top rule is
		// the line; with one, the last row keeps its rule and the foot's is dropped.
		const body = (selector: string) =>
			all.find((rule) => rule.selector === selector)?.body ?? '';
		expect(
			body('.sheetsmith-view .sheetsmith-table tbody tr:last-child th,\n.sheetsmith-view .sheetsmith-table tbody tr:last-child td'),
		).toMatch(/border-bottom:\s*none/);
		expect(
			body('.sheetsmith-view .sheetsmith-table-has-totals tbody tr:last-child th,\n.sheetsmith-view .sheetsmith-table-has-totals tbody tr:last-child td'),
		).toMatch(/border-bottom:\s*1px solid/);
		expect(
			body('.sheetsmith-view .sheetsmith-table tfoot th,\n.sheetsmith-view .sheetsmith-table tfoot td'),
		).toMatch(/border-bottom:\s*none/);
		expect(control?.body).toMatch(/border-top:\s*1px solid/);
	});

	it('escalates its rule under more contrast with the rest of the card', () => {
		const more = all.filter((rule) =>
			rule.context.includes('@media (prefers-contrast: more)'),
		);
		const listed = more.find(
			(rule) =>
				rule.selector.includes('.sheetsmith-table-add-button') &&
				/border-color:\s*var\(--text-muted\)/.test(rule.body),
		);
		expect(listed?.selector).toContain('.sheetsmith-record-add');
		expect(listed?.selector).toContain('.sheetsmith-table-box');
	});
});

describe('the note mark (docs/features/modifier-notes.md)', () => {
	const ruleFor = (selector: string) =>
		rules(CSS_WITHOUT_COMMENTS).find((rule) =>
			selectorList(rule.selector).includes(selector),
		);

	it('sits out of flow on a card, labelled or not, so the number keeps its centre', () => {
		const body = ruleFor('.sheetsmith-view .sheetsmith-card-has-note > .sheetsmith-note-mark')?.body ?? '';
		expect(declarations(body)).toContain('position: absolute');
		// The face's own last-flex-item rule skips it, so the value keeps the
		// auto margin that centres the run.
		expect(CSS_WITHOUT_COMMENTS).toContain('.sheetsmith-note-mark)');
	});

	it('centres the mark after a number on the digits’ cap height, not the number’s box', () => {
		// Layout is not measurable here; the harness measured the result (mark
		// centre = baseline − cap / 2). What is pinned is the construction: the
		// number keeps its baseline, and the mark is raised from x-height middle
		// to cap middle with the cell's own metrics.
		const marks = rules(CSS_WITHOUT_COMMENTS)
			.filter((rule) =>
				selectorList(rule.selector).includes(
					'.sheetsmith-view .sheetsmith-table-value ~ .sheetsmith-note-mark',
				),
			)
			.flatMap((rule) => declarations(rule.body));
		expect(marks).toContain(
			'top: calc((var(--sheetsmith-note-ex) - var(--sheetsmith-note-cap)) / 2)',
		);
		// And it takes no height from the line, or the number it follows is lifted
		// off its row by the taller line the cell then centres.
		expect(marks).toContain(
			'margin-block: calc(-0.5 * var(--sheetsmith-inline-control, 1.6em))',
		);
		const cell = ruleFor('.sheetsmith-view .sheetsmith-table-has-note')?.body ?? '';
		expect(declarations(cell)).toEqual(
			expect.arrayContaining(['--sheetsmith-note-cap: 1cap', '--sheetsmith-note-ex: 1ex']),
		);
		const value = ruleFor('.sheetsmith-view .sheetsmith-table-has-note > .sheetsmith-table-value')?.body ?? '';
		expect(declarations(value)).toContain('vertical-align: baseline');
		expect(CSS_WITHOUT_COMMENTS).toContain('@property --sheetsmith-note-cap');
		// Guarded on `cap` support: without it `1cap` falls back to the registered
		// 0px and the raise would lower the mark instead.
		const guarded = CSS_WITHOUT_COMMENTS.slice(CSS_WITHOUT_COMMENTS.indexOf('@supports (top: 1cap)'));
		expect(CSS_WITHOUT_COMMENTS).toContain('@supports (top: 1cap)');
		expect(guarded.slice(0, guarded.indexOf('}\n}'))).toContain('--sheetsmith-note-cap: 1cap');
		expect(guarded.slice(0, guarded.indexOf('}\n}'))).toContain('top: calc(');
	});

	it('reserves in an unmarked cell of a noted column exactly what the mark takes', () => {
		// A slot the mark's own size and gap, so every cell's content is the same
		// shape and a centred value or ring lines up with the noted one.
		const slot = ruleFor('.sheetsmith-view td.sheetsmith-note-column:not(.sheetsmith-table-has-note)::after')?.body ?? '';
		expect(declarations(slot)).toEqual(
			expect.arrayContaining([
				'width: var(--sheetsmith-inline-control, 1.6em)',
				'font-size: var(--font-ui-small)',
				'margin-inline-start: var(--size-2-1)',
			]),
		);
		const mark =
			rules(CSS_WITHOUT_COMMENTS).find(
				(rule) => rule.selector.trim() === '.sheetsmith-view .sheetsmith-note-mark',
			)?.body ?? '';
		expect(declarations(mark)).toContain('font-size: var(--font-ui-small)');
		const after = ruleFor('.sheetsmith-view td > .sheetsmith-note-mark')?.body ?? '';
		expect(declarations(after)).toContain('margin-inline-start: var(--size-2-1)');
		// After a ring, the slot takes the ring's gap, as the mark does.
		const ringSlot = ruleFor('.sheetsmith-view td.sheetsmith-note-column.sheetsmith-table-level:not(.sheetsmith-table-has-note)::after')?.body ?? '';
		expect(declarations(ringSlot)).toContain('margin-inline-start: var(--size-4-2)');
	});

	it('keeps clear of a level ring’s expanded target beside it', () => {
		// The ring's `::after` reaches `--size-4-2` sideways; the gap after it
		// must be at least that, or a press on the mark changes the level.
		const reach = ruleFor('.sheetsmith-view .sheetsmith-level-ring::after')?.body ?? '';
		expect(declarations(reach)).toContain(
			'inset: calc(-1 * var(--size-2-2)) calc(-1 * var(--size-4-2))',
		);
		const gap = ruleFor('.sheetsmith-view .sheetsmith-level-ring + .sheetsmith-note-mark')?.body ?? '';
		expect(declarations(gap)).toContain('margin-inline-start: var(--size-4-2)');
	});
});

describe('the room beside an open table\'s sticky name', () => {
	/*
	 * `docs/features/table-name-column-floor.md` capped the sizer so the sticky
	 * name always leaves one number cell beside it, and the field's own `6em`
	 * floor outweighed the cap in a narrow card: at 520 a 155px scroller held a
	 * 102px name and left 53px for a 68px number cell. Both floors are held under
	 * one room, declared once on the box, so they cannot disagree. Invisible in a
	 * unit test: happy-dom lays nothing out.
	 */
	const all = rules(CSS_WITHOUT_COMMENTS);
	const body = (selector: string) =>
		all.find((rule) => rule.selector.trim() === selector && rule.context.length === 0)
			?.body ?? '';

	const GLYPH_BAND = '.sheetsmith-view .sheetsmith-table-box.sheetsmith-table-glyph-band';

	it('declares the room once, on the box that is the scroller\'s container', () => {
		const box = body('.sheetsmith-view .sheetsmith-table-box');
		expect(box).toMatch(/container-type:\s*inline-size/);
		expect(box).toMatch(/--sheetsmith-table-name-room:\s*calc\(\s*100cqi/);
		expect(box).toMatch(/--sheetsmith-table-name-room:[^;]*var\(--sheetsmith-table-band\)/);
		expect(
			all.filter((rule) => /--sheetsmith-table-name-room:/.test(rule.body)),
		).toHaveLength(1);
	});

	it('varies only the band, on the box and on a glyph band', () => {
		const declaring = all.filter((rule) => /--sheetsmith-table-band:/.test(rule.body));
		expect(declaring.map((rule) => rule.selector.trim()).sort()).toEqual(
			['.sheetsmith-view .sheetsmith-table-box', GLYPH_BAND].sort(),
		);
		// One glyph cell: the inline control's own factor over the cells' size, so
		// the coarse-pointer block's factor reaches it with no copy of the number.
		expect(body(GLYPH_BAND).replace(/\s+/g, ' ')).toContain(
			'--sheetsmith-table-band: calc( var(--sheetsmith-inline-control-factor) * var(--font-ui-small) + 2 * var(--size-4-2) )',
		);
	});

	it('lets a declared name wrap only on a table with no prose column', () => {
		// `docs/UI.md` §4: a sticky declared name wider than its card covered the
		// toggle beside it and hid its focus. With prose the name column is
		// `auto`, where a wrap would fall to the longest word, so it stays out.
		const wrap = rules(CSS_WITHOUT_COMMENTS).filter((rule) =>
			/white-space:\s*normal/.test(rule.body) &&
			selectorList(rule.selector).some((one) => / tbody \.sheetsmith-table-name$/.test(one)),
		);
		expect(wrap.map((rule) => rule.selector.replace(/\s+/g, ' ').trim())).toEqual([
			'.sheetsmith-view .sheetsmith-table:not(.sheetsmith-table-has-text) tbody .sheetsmith-table-name',
		]);
	});

	it("sizes the room's one number cell as the number field is sized", () => {
		// The band is `4 * var(--font-ui-small)` because the number field is
		// `width: 4em` at its own `--font-ui-small`. Widen the field without the
		// room and a number cell no longer shows whole beside the name, which no
		// unit test can see: so the two are read from the stylesheet and compared.
		const room = /--sheetsmith-table-band:\s*calc\(([^;]*)\);/.exec(
			body('.sheetsmith-view .sheetsmith-table-box'),
		)?.[1];
		const roomCells = /([\d.]+)\s*\*\s*var\(--font-ui-small\)/.exec(room ?? '')?.[1];
		const width = /width:\s*([\d.]+)em/.exec(
			body('.sheetsmith-view .sheetsmith-table-input.sheetsmith-table-input'),
		)?.[1];
		const basis = /font-size:\s*(var\(--font-ui-[a-z]+\))/.exec(
			body('.sheetsmith-view .sheetsmith-table-input'),
		)?.[1];
		// Each read found something, so the comparison cannot pass on nothing.
		expect(roomCells).toBeDefined();
		expect(width).toBeDefined();
		expect(basis).toBe('var(--font-ui-small)');
		expect(Number(roomCells)).toBe(Number(width));
	});

	it('holds the sizer and the field under it', () => {
		expect(body('.sheetsmith-view .sheetsmith-table-name-sizer')).toMatch(
			/max-width:\s*var\(--sheetsmith-table-name-room\)/,
		);
		// The field is pulled into the cell's padding by its inset each side, so
		// its floor is the room plus both insets, and six ems on a wide card.
		expect(
			body('.sheetsmith-view .sheetsmith-table-name-input').replace(/\s+/g, ' '),
		).toContain(
			'min-width: min( 6em, calc( var(--sheetsmith-table-name-room) + 2 * var(--sheetsmith-field-inset) ) )',
		);
	});
});

describe("a multi-mark segment's dividers in forced colors", () => {
	/*
	 * `docs/features/forced-colors-track-and-table.md`. That mode repaints an
	 * author `background-color` as `Canvas`, so a divider drawn as one vanished on
	 * an unlit segment and took its count of targets with it. Only a forced-colors
	 * shot shows it, and only on a run that has an unlit multi-mark segment.
	 */
	const mark = rules(CSS_WITHOUT_COMMENTS).filter((rule) =>
		/\.sheetsmith-track-mark\b/.test(rule.selector),
	);

	it('draws every divider as a border, never a fill', () => {
		expect(mark.length).toBeGreaterThanOrEqual(3);
		expect(mark.filter((rule) => /background(-color)?:/.test(rule.body))).toEqual([]);
		expect(mark.some((rule) => /border-left:\s*1px solid/.test(rule.body))).toBe(true);
	});

	it('two-tones a divider on a lit segment, as the slash is', () => {
		const lit = mark.find(
			(rule) =>
				rule.context[0] === '@media (forced-colors: active)' &&
				rule.selector.trim() === '.sheetsmith-track-segment-on .sheetsmith-track-mark',
		);
		expect(lit?.body).toMatch(/border-left-color:\s*SelectedItemText/);
		expect(lit?.body).toMatch(/border-right:\s*1px solid CanvasText/);
	});
});

describe('the floating surfaces\' viewport gutter', () => {
	/*
	 * `placeAnchored` clamps with `EDGE_GUTTER` and both caps take
	 * `2 * var(--size-4-4)` off the viewport. If the two drift, a capped surface
	 * stops being centred at phone width, which is the defect the constant fixed
	 * (`docs/UI.md` §9). So both caps must still spell the token, and the token's
	 * value — Obsidian's 16px, which the harness's fallback theme carries — must
	 * still be the constant.
	 */
	it('caps the panel and the bubble by the gutter the clamp uses', () => {
		const rule = (selector: string) =>
			new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')} \\{([^}]*)\\}`).exec(CSS)?.[1] ?? '';
		expect(rule('.sheetsmith-panel')).toMatch(/width: min\([^;]*calc\(100vw - 2 \* var\(--size-4-4\)\)\)/);
		expect(rule('.sheetsmith-popover')).toMatch(
			/max-width: min\([^;]*calc\(100vw - 2 \* var\(--size-4-4\)\)\)/,
		);
		const theme = readFileSync(new URL('../harness/theme.css', import.meta.url), 'utf8');
		expect(/--size-4-4:\s*(\d+)px/.exec(theme)?.[1]).toBe(String(EDGE_GUTTER));
	});
});

describe("the layout editor's rows stack below the width its forms are known at", () => {
	/*
	 * `docs/features/layout-editor-narrow-regime.md` §3. The rule copies
	 * Obsidian's phone-modal shape, and its exclusions are the whole of what
	 * keeps a toggle beside its switch and a tree row on one line: a selector in
	 * the block that lost one would stack every row of that kind at a phone's
	 * width, which no unit test lays out and only a narrow shot would show.
	 */
	const EXCLUDED = [
		'mod-toggle',
		'mod-navigable',
		'mod-action',
		'setting-item-heading',
		'sheetsmith-tree-row',
	];
	const QUERY = /^@container sheetsmith-editor-pane \(max-width: 583px\)$/;

	function stacking(text: string): string[] {
		return rules(text)
			.filter((rule) => rule.context.some((one) => QUERY.test(one.replace(/\s+/g, ' '))))
			.flatMap((rule) => selectorList(rule.selector));
	}

	/** Every selector under the query that reaches a row without excluding all five. */
	function unexcluded(text: string): string[] {
		return stacking(text).filter(
			(selector) =>
				/\.setting-item(?![\w-])/.test(selector) &&
				!EXCLUDED.every((cls) => selector.includes(`:not(.${cls})`)),
		);
	}

	it('finds the rules it is meant to be checking', () => {
		// The row and its control: a block that went would pass on nothing.
		expect(stacking(CSS_WITHOUT_COMMENTS).length).toBeGreaterThanOrEqual(2);
	});

	it('excludes toggles, the other two app kinds, headings and tree rows on every selector', () => {
		expect(unexcluded(CSS_WITHOUT_COMMENTS)).toEqual([]);
	});

	it('would catch a selector that dropped one', () => {
		const block = (selector: string) =>
			`@container sheetsmith-editor-pane (max-width: 583px) { ${selector} { flex-direction: column; } }`;
		expect(
			unexcluded(
				block(
					'.sheetsmith-layout-editor-pane .setting-item:not(.mod-toggle):not(.mod-navigable):not(.mod-action):not(.setting-item-heading)',
				),
			),
		).toHaveLength(1);
		expect(
			unexcluded(
				block(
					'.sheetsmith-layout-editor-pane .setting-item:not(.mod-toggle):not(.mod-navigable):not(.mod-action):not(.setting-item-heading):not(.sheetsmith-tree-row)',
				),
			),
		).toEqual([]);
	});
});

describe('a stacked list row draws no gap across the lines its controls skip', () => {
	/*
	 * Under 380px of list a row's controls go to line 99, so they follow however
	 * many fields the row holds. Every line between the last field and 99 is then
	 * an empty track, and a row gap is drawn between empty tracks as between full
	 * ones: 97 gaps of 4px, 388px of empty box in every stacked row of all four
	 * list fields, measured at 380 under phone staging. So the row's own gap has to
	 * be zero on the block axis, and the spacing it gave comes from a margin on
	 * the fields, which an empty track does not carry.
	 */
	const QUERY = /^@container \(max-width: 380px\)$/;
	const ROW = '.sheetsmith-entry-row';

	function stacked(text: string): Rule[] {
		return rules(text).filter((rule) =>
			rule.context.some((one) => QUERY.test(one.replace(/\s+/g, ' '))),
		);
	}

	/** The far line a child of the row is sent to, when anything sends one past 2. */
	function farLine(text: string): number | undefined {
		const lines = stacked(text)
			.filter((rule) => selectorList(rule.selector).some((one) => one.startsWith(`${ROW} >`)))
			.flatMap((rule) => declarations(rule.body))
			.map((one) => /^grid-row: (\d+)$/.exec(one)?.[1])
			.filter((one): one is string => one !== undefined)
			.map(Number);
		const far = Math.max(0, ...lines);
		return far > 2 ? far : undefined;
	}

	/** The row's block-axis gap as the query declares it, `row-gap` winning a later `gap`'s first value. */
	function rowGap(text: string): string | undefined {
		let found: string | undefined;
		for (const rule of stacked(text)) {
			if (!selectorList(rule.selector).includes(ROW)) continue;
			for (const one of declarations(rule.body)) {
				const gap = /^gap: (\S+)/.exec(one)?.[1];
				const row = /^row-gap: (\S+)$/.exec(one)?.[1];
				if (gap !== undefined) found = gap;
				if (row !== undefined) found = row;
			}
		}
		return found;
	}

	/** Whether the query puts the spacing back as a margin on what is not a control. */
	function fieldMargin(text: string): boolean {
		return stacked(text).some(
			(rule) =>
				selectorList(rule.selector).includes(`${ROW} > :not(button.clickable-icon)`) &&
				declarations(rule.body).includes('margin-bottom: var(--size-2-2)'),
		);
	}

	it('finds the controls it is meant to be checking, on a far line', () => {
		// A placement that went would pass every case below on nothing.
		expect(farLine(CSS_WITHOUT_COMMENTS)).toBe(99);
	});

	it('gives the stacked row no gap on the block axis, and its fields the margin instead', () => {
		expect(rowGap(CSS_WITHOUT_COMMENTS)).toBe('0');
		expect(fieldMargin(CSS_WITHOUT_COMMENTS)).toBe(true);
	});

	it('would catch the row gap coming back', () => {
		const block = (gap: string) =>
			`@container (max-width: 380px) { ${ROW} { gap: ${gap}; } ${ROW} > button.clickable-icon { grid-row: 99; } }`;
		expect(farLine(block('var(--size-2-2)'))).toBe(99);
		expect(rowGap(block('var(--size-2-2)'))).toBe('var(--size-2-2)');
		expect(rowGap(block('0 var(--size-2-2)'))).toBe('0');
	});
});

describe('a list field\'s scroll cap is a distance in px with a floor per regime', () => {
	/*
	 * The cap was an em of a desktop row, and a phone's stacked entry is about
	 * eight of them, so at 380 under phone staging an entry was taller than its
	 * own list could show (`docs/features/list-scroll-cap.md`). The numbers are
	 * measurements, held by `harness/measure-lists.mjs` because happy-dom lays
	 * nothing out; what this holds is the shape: no `em` or `rem` in the cap, and
	 * the stacked query setting the floor, so the floor and the stacking cannot
	 * answer to two different widths.
	 */
	const SCROLL = '.sheetsmith-list-scroll';
	const QUERY = /^@container \(max-width: 380px\)$/;

	/** Every `max-height` the scroller is given, in any context, with whether it is top-level. */
	function capsOf(text: string): { value: string; topLevel: boolean }[] {
		return rules(text)
			.filter((rule) => selectorList(rule.selector).includes(SCROLL))
			.flatMap((rule) =>
				declarations(rule.body).map((one) => ({ one, topLevel: rule.context.length === 0 })),
			)
			.map(({ one, topLevel }) => ({ value: /^max-height: (.+)$/.exec(one)?.[1], topLevel }))
			.filter((one): one is { value: string; topLevel: boolean } => one.value !== undefined);
	}

	function stackedFloor(text: string): boolean {
		return rules(text).some(
			(rule) =>
				rule.context.some((one) => QUERY.test(one.replace(/\s+/g, ' '))) &&
				selectorList(rule.selector).includes(SCROLL) &&
				declarations(rule.body).some((one) => one.startsWith('--sheetsmith-list-floor:')),
		);
	}

	it('finds the cap it is meant to be checking', () => {
		// A renamed class would pass every case below on nothing.
		expect(capsOf(CSS_WITHOUT_COMMENTS).filter((one) => one.topLevel)).toHaveLength(1);
	});

	it('names no em or rem in the cap, in any query or media block either', () => {
		for (const cap of capsOf(CSS_WITHOUT_COMMENTS)) {
			expect(cap.value).not.toMatch(/\d(r?em)\b/);
		}
	});

	it('sets the stacked floor inside the stacking query', () => {
		expect(stackedFloor(CSS_WITHOUT_COMMENTS)).toBe(true);
	});

	it('would catch the em coming back, and a floor set outside the query', () => {
		const overridden = capsOf(
			`${SCROLL} { max-height: 400px; } @container (max-width: 380px) { ${SCROLL} { max-height: 20em; } }`,
		);
		expect(overridden.map((one) => one.value)).toEqual(['400px', '20em']);
		expect(overridden[1]?.value).toMatch(/\d(r?em)\b/);
		expect(stackedFloor(`${SCROLL} { --sheetsmith-list-floor: 400px; }`)).toBe(false);
		expect(
			stackedFloor(`@container (max-width: 380px) { ${SCROLL} { --sheetsmith-list-floor: 400px; } }`),
		).toBe(true);
	});
});

describe("every rule asking about the sheet's width asks it at one number", () => {
	/*
	 * The sheet's grid collapses under 480px of its view (`sheet.css`), and the
	 * layout editor's canvas, which wears that view, withdraws its gestures under
	 * the same named query (`editor.css`,
	 * `docs/features/layout-editor-narrow-regime.md` §1). A query cannot read a
	 * custom property, so the number is written at each, and two that drifted
	 * would leave a canvas offering a drag on a column, or refusing one on a grid,
	 * with nothing in a unit test laying either out.
	 */
	const QUERY = /@container\s+sheetsmith-sheet\s*\(\s*max-width:\s*([\d.]+px)\s*\)/g;

	function widths(text: string): string[] {
		return [...text.matchAll(QUERY)].map((match) => match[1] as string);
	}

	it('finds the queries it is meant to be checking, in both stylesheets', () => {
		const sheet = readFileSync(new URL('./styles/sheet.css', import.meta.url), 'utf8');
		const editor = readFileSync(new URL('./styles/editor.css', import.meta.url), 'utf8');
		expect(widths(sheet.replace(/\/\*[\s\S]*?\*\//g, ' ')).length).toBeGreaterThanOrEqual(1);
		expect(widths(editor.replace(/\/\*[\s\S]*?\*\//g, ' ')).length).toBeGreaterThanOrEqual(1);
	});

	/**
	 * The width of the query that collapses the sheet's own grid. It is unnamed
	 * (`sheet.css`, "SPEC §8"), so `QUERY` cannot see it, yet it is the rule
	 * whose `display: flex` `drawnAsGrid` reads: drifted alone, it would move the
	 * collapse and leave the canvas's touch rules, corner and note where they were.
	 */
	function collapseWidths(text: string): string[] {
		return rules(text)
			.filter(
				(rule) =>
					selectorList(rule.selector).includes('.sheetsmith-view > .sheetsmith-grid') &&
					/display:\s*flex/.test(rule.body),
			)
			.flatMap((rule) =>
				rule.context.flatMap((one) => {
					const found = /^@container\s*\(\s*max-width:\s*([\d.]+px)\s*\)$/.exec(one.trim());
					return found ? [found[1] as string] : [];
				}),
			);
	}

	it('gives every one of them the same width', () => {
		expect(new Set(widths(CSS_WITHOUT_COMMENTS)).size).toBe(1);
	});

	it("holds the sheet grid's own unnamed collapse to that width too", () => {
		const collapse = collapseWidths(CSS_WITHOUT_COMMENTS);
		expect(collapse).toHaveLength(1);
		expect(new Set([...widths(CSS_WITHOUT_COMMENTS), ...collapse]).size).toBe(1);
	});

	it('would catch one that drifted', () => {
		const one = '@container sheetsmith-sheet (max-width: 480px) { .a { display: flex; } }';
		const other = '@container sheetsmith-sheet (max-width: 512px) { .b { display: none; } }';
		expect(new Set(widths(one + other)).size).toBe(2);
		const collapse =
			'@container (max-width: 500px) { .sheetsmith-view > .sheetsmith-grid { display: flex; } }';
		expect(new Set([...widths(one), ...collapseWidths(collapse)]).size).toBe(2);
	});
});

describe('the pool\'s buffer field holds three digits', () => {
	/*
	 * The field is border-box and carries inline padding, so a bare `3ch` held
	 * two tabular digits and a buffer of `100` read `10`. Nothing but a pixel
	 * shows that, and happy-dom lays nothing out, so this holds the arithmetic
	 * instead: the width is three `ch` plus twice the inline padding the field's
	 * own rule declares. It assumes what tabular figures promise, that a digit
	 * is `1ch`; the harness shots are where that is looked at.
	 */
	const BASE = '.sheetsmith-view .sheetsmith-pool-temp-input';
	const WIDTH = `${BASE}.sheetsmith-pool-temp-input`;

	const valueOf = (selector: string, property: string): string | undefined => {
		const rule = rules(CSS_WITHOUT_COMMENTS).find(
			(one) => one.context.length === 0 && selectorList(one.selector).includes(selector),
		);
		const found = declarations(rule?.body ?? '').find((one) =>
			one.startsWith(`${property}:`),
		);
		return found?.slice(property.length + 1).trim();
	};

	/** The field's inline padding, the second value of its `padding`. */
	const inline = (): string => {
		const padding = valueOf(BASE, 'padding') ?? '';
		const parts = padding.match(/var\([^)]*\)/g) ?? [];
		expect(parts.length, `unreadable padding: ${padding}`).toBe(2);
		return parts[1] ?? '';
	};

	it('gives the field three digits beside its own padding', () => {
		expect(valueOf(WIDTH, '--sheetsmith-pool-temp-width')).toBe(
			`calc(3ch + 2 * ${inline()})`,
		);
		expect(valueOf(WIDTH, 'width')).toBe('var(--sheetsmith-pool-temp-width)');
	});

	it('floors the refused field on that width, not on a copy of it', () => {
		// Without the floor a one-letter refusal is narrower than the unmarked
		// field, and the pill shrinks as the mark goes on.
		const refused =
			valueOf(
				'.sheetsmith-view .sheetsmith-pool-temp-refused .sheetsmith-pool-temp-input.sheetsmith-pool-temp-input',
				'width',
			) ?? '';
		expect(refused.startsWith('max('), `not a max(): ${refused}`).toBe(true);
		expect(refused.slice('max('.length).split(',')[0]?.trim()).toBe(
			'var(--sheetsmith-pool-temp-width)',
		);
	});
});

describe("a pool's reading fits a narrow card", () => {
	/*
	 * `docs/features/pool-headline-narrow-fit.md`. Three rules give way in order,
	 * the slot, then the ceiling, and never the number, and none of them is
	 * visible to happy-dom, which lays nothing out. `harness/measure-pool-headline.mjs`
	 * measures the result in a browser. This file holds what a review of the
	 * shots cannot see: that each rule is declared, that the narrow rule wins on
	 * order, and the threshold's arithmetic.
	 */
	const READING = '.sheetsmith-pool-reading';
	const FIELD = '.sheetsmith-view .sheetsmith-pool-current.sheetsmith-pool-current';
	const all = rules(CSS_WITHOUT_COMMENTS);

	/** Every rule whose selector list names `selector`, in file order. */
	const naming = (selector: string) =>
		all
			.map((rule, at) => ({ ...rule, at }))
			.filter((rule) => selectorList(rule.selector).includes(selector));
	const valueIn = (body: string, property: string): string | undefined =>
		declarations(body)
			.find((one) => one.startsWith(`${property}:`))
			?.slice(property.length + 1)
			.trim();

	const reading = naming(READING).filter((rule) => rule.context.length === 0);
	const base = naming(FIELD).filter((rule) => rule.context.length === 0);
	const narrow = naming(FIELD).filter((rule) =>
		rule.context.some((at) => at.startsWith('@container')),
	);

	it('finds the rules it is meant to be checking', () => {
		expect(reading).toHaveLength(1);
		expect(base).toHaveLength(1);
		expect(narrow).toHaveLength(1);
	});

	it('lets the ceiling wrap under the number, with no row gap', () => {
		expect(valueIn(reading[0]?.body ?? '', 'flex-wrap')).toBe('wrap');
		expect(valueIn(reading[0]?.body ?? '', 'gap')).toBe('0 var(--size-2-1)');
	});

	it('never lets the number shrink, and caps it at the row', () => {
		const body = base[0]?.body ?? '';
		expect(valueIn(body, 'flex-shrink')).toBe('0');
		expect(valueIn(body, 'max-width')).toBe('100%');
		expect(valueIn(body, 'min-width')).toBe('4ch');
	});

	it('lowers the slot to two characters below the threshold, after the base rule', () => {
		const rule = narrow[0];
		expect(valueIn(rule?.body ?? '', 'min-width')).toBe('2ch');
		// `@container` adds no specificity, so equal selectors are settled by
		// order (docs/UI.md §4): the narrow rule has to come later.
		expect(rule?.at ?? -1).toBeGreaterThan(base[0]?.at ?? Infinity);
	});

	it('puts the threshold at four characters, the gap and the widest ceiling', () => {
		/*
		 * Measured in the harness at a 16px sheet, where the card's value size
		 * draws `4ch` at 73.4px (`docs/features/pool-headline-narrow-fit.md`):
		 * 4.59em. The rest is fixed-px chrome the sheet's `em` does not reach, so
		 * it is px (`docs/UI.md` §5): the reading's `--size-2-1` gap, the widest
		 * three-digit ceiling at 38.7px (a max the character owns, with its
		 * padding), and the 2px the reading's row sits inside the card's
		 * content box. Each part is rounded up, never down, and by less than the
		 * next step, so the threshold neither clips a reading that fits nor
		 * narrows a slot that has room.
		 */
		const FOUR_CH_EM = 73.4 / 16;
		// Obsidian's value for `--size-2-1`, which the app's own CSS defines and
		// no test here can read: that the reading declares that token is held by
		// the wrap test above, and that the token is 2px only by this constant.
		const GAP_PX = 2;
		const CEILING_PX = 38.7;
		const ROW_INSET_PX = 2;
		const prelude = narrow[0]?.context.find((at) => at.startsWith('@container')) ?? '';
		const match = /^@container \(max-width: calc\(([\d.]+)em \+ ([\d.]+)px\)\)$/.exec(prelude);
		expect(match, `unreadable threshold: ${prelude}`).not.toBeNull();
		const em = Number(match?.[1]);
		const px = Number(match?.[2]);
		expect(em).toBeGreaterThanOrEqual(FOUR_CH_EM);
		expect(em - FOUR_CH_EM).toBeLessThan(0.1);
		const chrome = GAP_PX + CEILING_PX + ROW_INSET_PX;
		expect(px).toBeGreaterThanOrEqual(chrome);
		expect(px - chrome).toBeLessThan(2);
	});
});

describe('a touch scrolls the canvas from any block but the selected one', () => {
	/*
	 * `docs/features/canvas-touch-select-step.md` §2 and §4. `touch-action` is
	 * decided by the browser at touch start from the pressed element and every
	 * ancestor up to the scroller, so a single stray `none` traps the pane — and
	 * nothing in a unit test presses a real touch to notice. The guard in
	 * `beginDrag` reads the same attribute this does, so the two have to agree.
	 */
	const OVERLAY = '.sheetsmith-view .sheetsmith-canvas-overlay';
	const SELECTED = `${OVERLAY}[data-ignore-swipe]`;
	const NARROW = '@container sheetsmith-sheet (max-width: 480px)';
	const all = rules(CSS_WITHOUT_COMMENTS);
	const touchAction = (rule: Rule) =>
		declarations(rule.body).find((one) => one.startsWith('touch-action:'));
	const at = (selector: string, context: string[] = []) =>
		all.filter(
			(rule) =>
				selectorList(rule.selector).includes(selector) &&
				rule.context.join() === context.join() &&
				touchAction(rule) !== undefined,
		);

	it('lets an unselected block pan, and only the selected one take the touch', () => {
		const base = at(OVERLAY);
		const selected = at(SELECTED);
		// Vertical only: the canvas is a sideways scroller of its own, and a
		// finger across a block must not slide it.
		expect(base.map(touchAction)).toEqual(['touch-action: pan-y pinch-zoom']);
		expect(selected.map(touchAction)).toEqual(['touch-action: none']);
	});

	it('leaves the resize corner to the block it sits in', () => {
		// An element's own `touch-action` intersects its ancestors', so a `none`
		// here would trap every unselected block's corner.
		const corner = all.filter(
			(rule) =>
				selectorList(rule.selector).some((one) => one.endsWith('.sheetsmith-preview-resize')) &&
				touchAction(rule) !== undefined,
		);
		expect(all.some((rule) => rule.selector.includes('.sheetsmith-preview-resize'))).toBe(true);
		expect(corner.map((rule) => rule.selector)).toEqual([]);
	});

	it('keeps the selected block scrolling where the grid is drawn as one column', () => {
		// The narrow rule must match the attribute at its own weight: with the
		// base selector alone it is (0,2,0) to the attribute rule's (0,3,0), and
		// the trap the narrow regime removed would come back on one block.
		const narrow = at(SELECTED, [NARROW]);
		expect(narrow.map(touchAction)).toEqual(['touch-action: manipulation']);
		expect(at(OVERLAY, [NARROW]).map(touchAction)).toEqual(['touch-action: manipulation']);
		// Equal weight, so order decides it: the narrow rule comes later. Both
		// found first, since a missing one indexes as -1 and passes the order.
		const outer = at(SELECTED);
		expect(outer).toHaveLength(1);
		expect(narrow).toHaveLength(1);
		expect(all.indexOf(narrow[0] as Rule)).toBeGreaterThan(all.indexOf(outer[0] as Rule));
	});

	it('draws a coarse pointer\'s corner on the selected block alone', () => {
		const hidden = all.filter(
			(rule) =>
				rule.context.join() === '@media (pointer: coarse)' &&
				selectorList(rule.selector).includes(
					`${OVERLAY}:not([data-ignore-swipe]) .sheetsmith-preview-resize`,
				),
		);
		expect(hidden.map((rule) => declarations(rule.body))).toEqual([['display: none']]);
	});
});

describe('the selected canvas block is ringed outside its box', () => {
	/*
	 * `docs/features/canvas-touch-select-step.md` §6. The overlay is the live
	 * component's own size, so a ring drawn on its border or as an inset shadow
	 * lies on that component's content. It is an outline with a positive offset,
	 * which the grid's gutter holds, and forced colors recolours that same
	 * outline rather than drawing a second one.
	 */
	const RING = '.sheetsmith-view .sheetsmith-canvas-overlay.sheetsmith-preview-editing';
	const ringRules = rules(CSS_WITHOUT_COMMENTS).filter((rule) =>
		selectorList(rule.selector).includes(RING),
	);

	it('draws an outline offset outward, and no border or shadow of its own', () => {
		const plain = ringRules.filter((rule) => rule.context.length === 0);
		expect(plain.map((rule) => declarations(rule.body))).toEqual([
			['outline: 2px solid var(--interactive-accent)', 'outline-offset: 1px'],
		]);
	});

	it('takes only the mode\'s colour in forced colors', () => {
		const forced = ringRules.filter(
			(rule) => rule.context.join() === '@media (forced-colors: active)',
		);
		expect(forced.map((rule) => declarations(rule.body))).toEqual([
			['outline-color: SelectedItem'],
		]);
	});
});

describe('the stat block under Every form (docs/features/character-forms.md)', () => {
	const all = rules(CSS_WITHOUT_COMMENTS);
	/** The tiles' clothes, written once and worn by every selector in its list. */
	const clothes = all.find(
		(rule) =>
			rule.context.length === 0 &&
			rule.selector.split(',').map((one) => one.trim()).includes('.sheetsmith-stat-block-vital') &&
			/border-radius/.test(rule.body),
	);

	it('titles a form\'s name at In play\'s title size open or closed, field and link layer alike', () => {
		// One rule, with no condition on the chevron's state, so pressing it never
		// resizes the name (`docs/features/stat-block-in-play-polish.md` §3).
		const named = all.filter(
			(rule) =>
				rule.context.length === 0 &&
				rule.selector.includes('stat-block-record') &&
				rule.selector.includes('.sheetsmith-record-name-input') &&
				/font-size:/.test(rule.body),
		);
		expect(named).toHaveLength(1);
		const open = named[0];
		expect(open?.selector).not.toContain('aria-expanded');
		expect(open?.selector).toContain('.sheetsmith-record-name-input');
		expect(open?.selector).toContain('.sheetsmith-record-name-layer');
		expect(open?.body).toMatch(/font-size:\s*var\(--font-ui-large\)/);
		expect(open?.body).toMatch(/font-weight:\s*var\(--font-bold\)/);
		// The same pair as In play's title, so the two faces title a form alike.
		const title = all.find((rule) => rule.context.length === 0 && rule.selector === '.sheetsmith-stat-block-title');
		expect(title?.body).toMatch(/font-size:\s*var\(--font-ui-large\)/);
		expect(title?.body).toMatch(/font-weight:\s*var\(--font-bold\)/);
	});

	it('draws each vital as a tile in the Card\'s clothes, its number at the card value size', () => {
		const tile = clothes;
		expect(tile?.body).toMatch(/border:\s*1px solid var\(--background-modifier-border\)/);
		expect(tile?.body).toMatch(/border-radius:\s*var\(--radius-m\)/);
		expect(tile?.body).toMatch(/background-color:\s*var\(--background-secondary\)/);
		const value = all.find((rule) => rule.context.length === 0 && rule.selector === '.sheetsmith-stat-block-vital-value');
		expect(value?.body).toMatch(/font-size:\s*var\(--sheetsmith-card-value-size\)/);
	});

	it('raises the tiles, the boxes and the head rule under more contrast, after their base rules', () => {
		// Equal weight, so only order decides: a block above the base rules lost.
		const css = CSS_WITHOUT_COMMENTS;
		const more = [...css.matchAll(/@media \(prefers-contrast: more\) \{/g)]
			.map((match) => match.index ?? -1)
			.find((at) => {
				const block = css.slice(at, css.indexOf('\n}', at));
				return block.includes('.sheetsmith-stat-block-panel') && /border-color:\s*var\(--text-muted\)/.test(block);
			});
		expect(more).toBeDefined();
		const block = css.slice(more ?? 0, css.indexOf('\n}', more ?? 0));
		for (const selector of [
			'.sheetsmith-stat-block-vital',
			'.sheetsmith-stat-block-panel',
			'.sheetsmith-stat-block-play-head',
			'.sheetsmith-stat-block-record > .sheetsmith-record-summary',
			'.sheetsmith-table-box.sheetsmith-stat-block-actions',
		]) {
			expect(block, selector).toContain(selector);
		}
		const base = (pattern: RegExp): number => css.search(pattern);
		for (const at of [
			base(/\n\.sheetsmith-stat-block-vital \{/),
			base(/\n\.sheetsmith-stat-block-panel \{/),
			base(/\n\.sheetsmith-stat-block-play-head,\s*\n\.sheetsmith-stat-block-record > /),
			base(/\n\.sheetsmith-view \.sheetsmith-table-box\.sheetsmith-stat-block-actions \{/),
			base(/\n\.sheetsmith-table-box \{/),
		]) {
			expect(at).toBeGreaterThan(0);
			expect(more ?? 0).toBeGreaterThan(at);
		}
	});

	it('sets the attack table on the tiles\' surface and its header a gentle step off it, theme variables only', () => {
		const box = all.find(
			(rule) => rule.context.length === 0 && rule.selector === '.sheetsmith-view .sheetsmith-table-box.sheetsmith-stat-block-actions',
		);
		const tile = clothes;
		// The body is exactly the tiles' fill, and lays nothing over it.
		const fill = /background-color:\s*(var\(--[a-z-]+\))/;
		expect(box?.body.match(fill)?.[1]).toBe('var(--background-secondary)');
		expect(box?.body.match(fill)?.[1]).toBe(tile?.body.match(fill)?.[1]);
		expect(box?.body).not.toMatch(/background-image/);
		// The header: half a hover step, under the row hover's whole one.
		const head = all.find(
			(rule) => rule.context.length === 0 && rule.selector === '.sheetsmith-view .sheetsmith-stat-block-table thead th',
		);
		expect(head?.body).toMatch(/color-mix\(in srgb, var\(--background-modifier-hover\) 50%, transparent\)/);
		for (const rule of [box, head]) expect(rule?.body).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
		// Scoped to the stat block: no rule mixing the hover step is a bare Table's.
		for (const rule of all) {
			if (!/color-mix\(in srgb, var\(--background-modifier-hover\)/.test(rule.body)) continue;
			expect(rule.selector, rule.selector).toContain('stat-block');
		}
	});

	it('frames a text section in the same clothes and draws no divider between sections', () => {
		const panel = all.find((rule) => rule.context.length === 0 && rule.selector === '.sheetsmith-stat-block-panel');
		expect(panel?.body).toMatch(/border-radius:\s*var\(--radius-m\)/);
		const sectionRule = all.find((rule) => rule.context.length === 0 && rule.selector === '.sheetsmith-stat-block-section');
		expect(sectionRule?.body).not.toMatch(/border-top/);
	});

	it('floors a text vital at about 8em of the field\'s size, so Speed keeps its row', () => {
		const vital = all.find(
			(rule) => rule.context.length === 0 && rule.selector === '.sheetsmith-stat-block-vital:has(.sheetsmith-stat-block-text)',
		);
		expect(vital?.body).toMatch(/min-width:\s*calc\(8 \* var\(--font-ui-small\)\)/);
	});
});

describe('the form tint (docs/features/character-forms.md)', () => {
	const tint = rules(CSS_WITHOUT_COMMENTS).filter((rule) =>
		rule.selector.includes('.sheetsmith-in-play'),
	);

	it('fills and outlines at rest, and takes no literal colour', () => {
		const base = tint.find(
			(rule) => rule.context.length === 0 && /background-image:/.test(rule.body),
		);
		// The colour the form chose, the accent behind it, and the edge mixed
		// from it toward the text (`docs/features/form-tint-colour.md`).
		expect(base?.body).toMatch(/outline:\s*1px solid var\(--sheetsmith-tint-edge\)/);
		expect(base?.body).toMatch(
			/color-mix\(in srgb, var\(--sheetsmith-tint\) 12%/,
		);
		// The accent behind every one of those, written once and at no weight, so
		// a word on the element or an ancestor always wins.
		expect(
			rules(CSS_WITHOUT_COMMENTS).find(
				(rule) => rule.selector === ':where(.sheetsmith-view)' && /--sheetsmith-tint:/.test(rule.body),
			)?.body,
		).toMatch(/--sheetsmith-tint:\s*var\(--interactive-accent\)/);
		expect(CSS_WITHOUT_COMMENTS).not.toMatch(/var\(--sheetsmith-tint,/);
		const edge = tint.find((rule) => /--sheetsmith-tint-edge:/.test(rule.body));
		expect(edge?.body.replace(/\s+/g, ' ')).toMatch(
			/color-mix\( in srgb, var\(--sheetsmith-tint\) 70%, var\(--text-normal\) \)/,
		);
		for (const rule of tint) expect(rule.body, rule.selector).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
	});

	it('drops the fill and doubles the outline under more contrast', () => {
		const more = tint.filter((rule) => rule.context.includes('@media (prefers-contrast: more)'));
		const fill = more.find((rule) => /background-image:\s*none/.test(rule.body));
		const outline = more.find((rule) => /outline-width:\s*2px/.test(rule.body));
		// The box and a row's cells both lose the fill; the box doubles its outline.
		expect(fill?.selector).toContain('tr.sheetsmith-in-play > td');
		expect(outline?.selector).toBe('.sheetsmith-view .sheetsmith-in-play:not(tr)');
		// A row's cells thicken their share of the outline the same way.
		const edge = more.find((rule) => /--sheetsmith-in-play-edge:\s*2px/.test(rule.body));
		expect(edge?.selector).toContain('tr.sheetsmith-in-play > th');
		// The tag sits on the plain page in the theme's text, drawing the 2px
		// coloured edge it has nowhere else, whatever text the sheet picked.
		const tag = more.find((rule) => rule.selector.includes('.sheetsmith-in-play-mark'));
		expect(tag?.body).toMatch(/background-color:\s*var\(--background-primary\)/);
		expect(tag?.body).toMatch(/color:\s*var\(--text-normal\)/);
		expect(tag?.body).toMatch(/outline:\s*2px solid var\(--sheetsmith-tint-edge\)/);
		expect(tag?.selector).toMatch(/\[data-sheetsmith-tag-text\]/);
	});

	it('hides the swatch in forced colors, where a repainted square says nothing', () => {
		const forced = rules(CSS_WITHOUT_COMMENTS).find(
			(rule) =>
				rule.context.includes('@media (forced-colors: active)') &&
				rule.selector.includes('.sheetsmith-stat-block-tint-swatch'),
		);
		expect(forced?.body).toMatch(/display:\s*none/);
	});

	it('fills and outlines a row through every cell, the name cell included, and not the row', () => {
		const rowCells = tint.find(
			(rule) => rule.context.length === 0 && rule.selector.includes('tr.sheetsmith-in-play > td'),
		);
		// One rule for both cell kinds, so the pinned name cell takes exactly the
		// fill and the outline the value cells take, one layer each.
		expect(rowCells?.selector).toContain('tr.sheetsmith-in-play > th');
		expect(rowCells?.body).toMatch(/background-image:/);
		expect(rowCells?.body).toMatch(/box-shadow:[^;]*inset/);
		// The row itself draws neither, which is what made a second layer.
		const box = tint.find((rule) => rule.context.length === 0 && /outline:/.test(rule.body));
		expect(box?.selector).toBe('.sheetsmith-view .sheetsmith-in-play:not(tr)');
		// And forced colors, which drops the shadow, rules the row top and bottom.
		const forced = tint.find((rule) => rule.context.includes('@media (forced-colors: active)'));
		expect(forced?.selector).toContain('tr:has(+ tr.sheetsmith-in-play) > th');
		expect(forced?.body).toMatch(/border-bottom-color:\s*Highlight/);
		// And at each end, which the shadows drew, so the row is closed all round.
		const forcedRules = tint.filter((rule) => rule.context.includes('@media (forced-colors: active)'));
		const start = forcedRules.find((rule) => /border-inline-start:\s*1px solid Highlight/.test(rule.body));
		const end = forcedRules.find((rule) => /border-inline-end:\s*1px solid Highlight/.test(rule.body));
		expect(start?.selector).toBe('.sheetsmith-view tr.sheetsmith-in-play > :first-child');
		expect(end?.selector).toBe('.sheetsmith-view tr.sheetsmith-in-play > :last-child');
	});

	it("rounds a row at its scroller's corner to the scroller's inner radius", () => {
		// The scroller clips to `--radius-m`; square corner cells had their fill
		// cut along that curve and their inset outline cut off where it met it.
		const scroller = rules(CSS_WITHOUT_COMMENTS).find(
			(rule) => rule.context.length === 0 && rule.selector === '.sheetsmith-table-wrapper',
		);
		expect(scroller?.body).toMatch(/border-radius:\s*var\(--radius-m\)/);
		expect(scroller?.body).toMatch(/border:\s*1px solid/);
		const corner = (property: string) =>
			tint
				.filter((rule) => rule.context.length === 0 && rule.body.includes(property))
				.map((rule) => ({ ...rule, selector: rule.selector.replace(/\s+/g, ' ') }));
		const cases: [string, RegExp][] = [
			['border-end-start-radius', /\.sheetsmith-table:not\(\.sheetsmith-table-has-totals\) > tbody > tr\.sheetsmith-in-play:last-child > :first-child$/],
			['border-end-end-radius', /\.sheetsmith-table:not\(\.sheetsmith-table-has-totals\) > tbody > tr\.sheetsmith-in-play:last-child > :last-child$/],
			['border-start-start-radius', /\.sheetsmith-table\.sheetsmith-table-headless > tbody > tr\.sheetsmith-in-play:first-child > :first-child$/],
			['border-start-end-radius', /\.sheetsmith-table\.sheetsmith-table-headless > tbody > tr\.sheetsmith-in-play:first-child > :last-child$/],
		];
		for (const [property, selector] of cases) {
			const found = corner(property);
			expect(found, property).toHaveLength(1);
			expect(found[0]?.selector).toMatch(/^\.sheetsmith-view \.sheetsmith-table-wrapper/);
			expect(found[0]?.selector).toMatch(selector);
			expect(found[0]?.body).toMatch(
				new RegExp(`${property}:\\s*calc\\(var\\(--radius-m\\) - 1px\\)`),
			);
		}
		// An open table's scroller has the add control under it, so its last row
		// is not at a corner.
		for (const property of ['border-end-start-radius', 'border-end-end-radius']) {
			expect(corner(property)[0]?.selector).toContain(':not(.sheetsmith-table-wrapper-boxed)');
		}
		// The corners are read from the classes that say why, never from `:has()`.
		for (const rule of tint) expect(rule.selector, rule.selector).not.toMatch(/:has\(\s*>?\s*t(?:head|foot)\s*\)/);
	});

	it('bends the forced-colors rules at the corner on a layer that takes the radius', () => {
		// A collapsed border takes no radius, so at a corner row the outer rules
		// move to each cell's ::before (not ::after, a noted column's mark slot), which inherits the cell's radius.
		const forced = tint
			.filter((rule) => rule.context.includes('@media (forced-colors: active)'))
			.map((rule) => ({ ...rule, selector: rule.selector.replace(/\s+/g, ' ') }));
		const bottom = 'tbody > tr.sheetsmith-in-play:last-child > ';
		const top = 'tbody > tr.sheetsmith-in-play:first-child > ';
		const find = (body: RegExp, ...parts: string[]) =>
			forced.find((rule) => body.test(rule.body) && parts.every((part) => rule.selector.includes(part)));
		const layer = find(/border-radius:\s*inherit/, `${bottom}*::before`, `${top}*::before`);
		expect(layer?.body).toMatch(/position:\s*absolute/);
		expect(layer?.body).toMatch(/inset:\s*0/);
		expect(layer?.body).toMatch(/pointer-events:\s*none/);
		// The anchor never unpins the name cell.
		expect(find(/position:\s*relative/, `${bottom}:not(.sheetsmith-table-name)`)).toBeDefined();
		// Each side moves: the cell drops its own rule and the layer draws it.
		expect(find(/border-bottom:\s*none/, `${bottom}*`)).toBeDefined();
		expect(find(/border-bottom:\s*1px solid Highlight/, `${bottom}*::before`)).toBeDefined();
		expect(find(/border-inline-start:\s*none/, `${bottom}:first-child`, `${top}:first-child`)).toBeDefined();
		expect(
			find(/border-inline-start:\s*1px solid Highlight/, `${bottom}:first-child::before`, `${top}:first-child::before`),
		).toBeDefined();
		expect(find(/border-inline-end:\s*none/, `${bottom}:last-child`, `${top}:last-child`)).toBeDefined();
		expect(
			find(/border-inline-end:\s*1px solid Highlight/, `${bottom}:last-child::before`, `${top}:last-child::before`),
		).toBeDefined();
		// A first row under no heading row has no rule above it, so draws its top.
		expect(find(/border-top:\s*1px solid Highlight/, `.sheetsmith-table-headless > ${top}*::before`)).toBeDefined();
		// And never on `::after`, the in-flow mark slot a noted column's cell
		// keeps (`docs/features/modifier-notes.md`): an absolute layer there took
		// the slot out of flow and shifted the cell's value off its column.
		const slot = rules(CSS_WITHOUT_COMMENTS).find((rule) =>
			rule.selector.includes('td.sheetsmith-note-column:not(.sheetsmith-table-has-note)::after'),
		);
		expect(slot).toBeDefined();
		for (const rule of forced) {
			if (/tr\.sheetsmith-in-play/.test(rule.selector)) expect(rule.selector).not.toMatch(/::after/);
		}
	});

	it("leaves a lone card's centring to the value, never to the tag laid over it", () => {
		// The tag is appended last and taken out of flow, so a lone card's
		// "last item" rule has to skip it, or the auto margin centring the number
		// goes to the tag and a tinted card's number drops onto it.
		const centring = rules(CSS_WITHOUT_COMMENTS).find(
			(rule) => rule.selector.includes('.sheetsmith-card-single') && /margin-bottom:\s*auto/.test(rule.body),
		);
		expect(centring?.selector.replace(/\s+/g, ' ')).toMatch(/:not\([^)]*\.sheetsmith-in-play-mark/);
	});

	it('lays the pill over its box, taking no room', () => {
		const pill = tint.find(
			(rule) => rule.context.length === 0 && rule.selector === ".sheetsmith-view .sheetsmith-in-play-mark[aria-hidden='true']",
		);
		expect(pill?.body).toMatch(/position:\s*absolute/);
		// A neutral chip in the theme's own text with a coloured edge, never
		// text on the colour (`docs/features/form-tint-colour.md`).
		expect(pill?.body).toMatch(/color:\s*var\(--text-normal\)/);
		// The form's colour at full strength, with no edge outside more
		// contrast and forced colors; the text is picked at runtime.
		expect(pill?.body).not.toMatch(/outline:/);
		expect(pill?.body.replace(/\s+/g, ' ')).toMatch(
			/background-color: color-mix\(in srgb, var\(--sheetsmith-tint\) 85%, transparent\);/,
		);
		// Black or white, as the runtime measured them, mapped from the word.
		const word = (w: string) =>
			tint.find((rule) => rule.context.length === 0 && rule.selector.includes(`[data-sheetsmith-tag-text='${w}']`));
		expect(word('black')?.body).toMatch(/color:\s*black/);
		expect(word('white')?.body).toMatch(/color:\s*white/);
		expect(pill?.body).not.toMatch(/--text-on-accent/);
		// On the bottom edge at the inline-end corner, clear of the label, the
		// centred value and the note mark (the form tag fix).
		expect(pill?.body).toMatch(/inset-block-end:\s*0/);
		expect(pill?.body).toMatch(/inset-inline-end:/);
		expect(pill?.body).not.toMatch(/inset-block-start|inset-inline-start/);
		// Inside by exactly the bottom padding, by geometry and not by a font's
		// ink: down by its own height less `--size-4-2`.
		expect(pill?.body.replace(/\s+/g, ' ')).toMatch(
			/transform: translateY\( calc\(100% - var\(--size-4-2\) - var\(--sheetsmith-in-play-mark-room, 0px\)\) \)/,
		);
		// A card makes room for the tag's 2px edge, every card alike, so the
		// value does not move when a form turns on.
		const card = rules(CSS_WITHOUT_COMMENTS).find((rule) => rule.context.length === 0 && rule.selector === '.sheetsmith-card');
		expect(card?.body).toMatch(/--sheetsmith-in-play-mark-room:\s*var\(--size-2-1\)/);
		expect(card?.body.replace(/\s+/g, ' ')).toMatch(
			/padding-block-end: calc\(var\(--size-4-2\) \+ var\(--sheetsmith-in-play-mark-room\)\)/,
		);
		expect(pill?.body).not.toMatch(/display:\s*block/);
		// In a fixed-pixel size, so its overhang fits the fixed padding at any
		// text size, and hit-testable, so a clipped name's reveal answers it.
		expect(pill?.body).toMatch(/font-size:\s*var\(--font-ui-smaller\)/);
		expect(pill?.body).not.toMatch(/pointer-events/);
		const host = tint.find((rule) => rule.selector === '.sheetsmith-view .sheetsmith-in-play-marked:not(tr)');
		expect(host?.body).toMatch(/position:\s*relative/);
	});
});

describe('stat block zones\' small fixes (docs/features/stat-block-zones.md)', () => {
	const all = rules(CSS_WITHOUT_COMMENTS);

	it('grows a record body\'s edit box with its text, from a two-line floor', () => {
		// One rule for both components: a Record set's body and a Stat block's
		// zone text are both `drawRecordBody`'s field.
		const field = all.find((rule) => rule.context.length === 0 && rule.selector === '.sheetsmith-view .sheetsmith-record-body-input');
		expect(field?.body).toMatch(/field-sizing:\s*content/);
		expect(field?.body).toMatch(/min-height:\s*calc\(2lh/);
	});

	it('starts an open form at the box\'s padding under the 360px query, and nowhere else', () => {
		const narrow = all.filter((rule) => rule.context.join() === '@container sheetsmith-stat-block (max-width: 360px)');
		const detail = narrow.find((rule) => rule.selector === '.sheetsmith-stat-block-detail');
		expect(detail?.body).toMatch(/padding-inline-start:\s*0/);
		const base = all.find((rule) => rule.context.length === 0 && rule.selector === '.sheetsmith-stat-block-detail');
		expect(base?.body).toMatch(/--sheetsmith-record-indent/);
	});
});

describe('the drift tag (docs/features/stat-block-zones.md, Drift)', () => {
	it('is a muted sentence-case pill of its own, in theme variables', () => {
		const tag = rules(CSS_WITHOUT_COMMENTS).find(
			(rule) => rule.context.length === 0 && rule.selector === '.sheetsmith-stat-block-drift-tag',
		);
		expect(tag?.body).toMatch(/text-transform:\s*none/);
		expect(tag?.body).toMatch(/color:\s*var\(--text-muted\)/);
		expect(tag?.body).toMatch(/border:\s*1px solid var\(--background-modifier-border\)/);
		expect(tag?.body).toMatch(/border-radius:\s*var\(--radius-s\)/);
		expect(tag?.body).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
	});
});

describe('a stat block table cell\'s wrap (docs/features/stat-block-zones.md)', () => {
	it('breaks a long link at its spaces, never mid-word where a space will do', () => {
		const cells = rules(CSS_WITHOUT_COMMENTS).filter((rule) => /sheetsmith-stat-block-(table|cell)/.test(rule.selector) && /overflow-wrap/.test(rule.body));
		expect(cells.length).toBeGreaterThanOrEqual(3);
		for (const rule of cells) expect(rule.body, rule.selector).toMatch(/overflow-wrap:\s*break-word/);
	});
});

describe('the stat block In play polish (docs/features/stat-block-in-play-polish.md)', () => {
	const all = rules(CSS_WITHOUT_COMMENTS);
	const base = all.filter((rule) => rule.context.length === 0);
	const selectorsOf = (rule: Rule | undefined) => (rule?.selector ?? '').split(',').map((one) => one.trim().replace(/\s+/g, ' '));

	it('clothes the picker and Revert as one pair of tiles at one height, both raised to 44px under a coarse pointer', () => {
		// The tiles' clothes are one rule naming the tiles, the pair and a brief,
		// and nothing else on the block restates them, so none can drift.
		const clothes = base.filter((rule) => selectorsOf(rule).includes('.sheetsmith-stat-block-vital') && /border-radius/.test(rule.body));
		expect(clothes).toHaveLength(1);
		for (const selector of [
			'.sheetsmith-view .sheetsmith-stat-block-select',
			'.sheetsmith-view .sheetsmith-stat-block-revert',
			'.sheetsmith-view .sheetsmith-stat-block-brief',
		]) {
			expect(selectorsOf(clothes[0]), selector).toContain(selector);
		}
		expect(declarations(clothes[0]?.body ?? '')).toEqual([
			'border: 1px solid var(--background-modifier-border)',
			'border-radius: var(--radius-m)',
			'background-color: var(--background-secondary)',
		]);
		// The shared text-button rule keeps its hairline for **Back to play** and
		// **Add action**, which are not tiles, so it is not a restatement.
		for (const rule of base.filter(
			(one) =>
				one !== clothes[0] &&
				!one.selector.includes('stat-block-action') &&
				/stat-block-(?:vital|select|revert|brief)\b/.test(one.selector),
		)) {
			for (const said of declarations(rule.body)) {
				expect(said, rule.selector).not.toMatch(/^(?:border|border-radius|background-color): (?:1px solid var\(--background-modifier-border\)|var\(--radius-m\)|var\(--background-secondary\))$/);
			}
		}
		// After every rule whose fill or border it replaces for the pair.
		const at = CSS_WITHOUT_COMMENTS.indexOf(clothes[0]?.selector ?? '');
		for (const earlier of [
			/\.sheetsmith-view \.sheetsmith-stat-block-revert,\s*\.sheetsmith-view \.sheetsmith-stat-block-action \{/,
			/\.sheetsmith-view \.sheetsmith-record-select \{/,
		]) {
			const where = CSS_WITHOUT_COMMENTS.search(earlier);
			expect(where).toBeGreaterThan(0);
			expect(at).toBeGreaterThan(where);
		}
		const pair = base.find(
			(rule) =>
				selectorsOf(rule).includes('.sheetsmith-view .sheetsmith-stat-block-select') &&
				selectorsOf(rule).includes('.sheetsmith-view .sheetsmith-stat-block-revert') &&
				/min-height/.test(rule.body),
		);
		expect(pair?.body).toMatch(/min-height:\s*var\(--input-height\)/);
		expect(pair?.body).toMatch(/align-self:\s*stretch/);
		// After the shared text-button rule whose 24px floor and transparent fill it replaces.
		const shared = CSS_WITHOUT_COMMENTS.search(/\.sheetsmith-view \.sheetsmith-stat-block-revert,\s*\.sheetsmith-view \.sheetsmith-stat-block-action \{/);
		const height = CSS_WITHOUT_COMMENTS.search(/\.sheetsmith-view \.sheetsmith-stat-block-select,\s*\.sheetsmith-view \.sheetsmith-stat-block-revert \{/);
		expect(height).toBeGreaterThan(shared);
		const coarse = all.find(
			(rule) => rule.context.includes('@media (pointer: coarse)') && rule.selector.includes('.sheetsmith-stat-block-revert'),
		);
		expect(selectorsOf(coarse)).toContain('.sheetsmith-view .sheetsmith-stat-block-select');
		expect(coarse?.body).toMatch(/min-height:\s*44px/);
		// The pick stretches both to one line's height.
		const pick = base.find((rule) => rule.selector === '.sheetsmith-stat-block-play-head .sheetsmith-stat-block-pick');
		expect(pick?.body).toMatch(/align-items:\s*stretch/);
	});

	it('focuses the picker with the accent outline, and lets nothing on the head or the rings read the tint', () => {
		const focus = base.find((rule) => selectorsOf(rule).includes('.sheetsmith-view .sheetsmith-stat-block-select:focus-visible'));
		expect(focus?.body).toMatch(/outline:\s*2px solid var\(--interactive-accent\)/);
		const readers = all.filter((rule) => /var\(--sheetsmith-tint/.test(rule.body));
		expect(readers.length).toBeGreaterThan(3);
		for (const rule of readers) {
			expect(rule.selector, rule.selector).not.toMatch(/level-ring|stat-block-use|stat-block-select|stat-block-revert|stat-block-menu/);
		}
	});

	it('gives the first of two forms 4px more above its rule where it follows the report\'s box', () => {
		const first = base.find(
			(rule) => rule.selector === '.sheetsmith-stat-block-report + .sheetsmith-stat-block-form:has(> .sheetsmith-stat-block-form-name)',
		);
		expect(declarations(first?.body ?? '')).toEqual(['margin-top: var(--size-4-1)']);
	});

	it('draws the head\'s and a two-on name row\'s rule 2px in the edge, plain again in forced colors', () => {
		const head = base.find((rule) => rule.selector === '.sheetsmith-stat-block-play-head[data-sheetsmith-tint]');
		const row = base.find((rule) => rule.selector === '.sheetsmith-stat-block-form-name[data-sheetsmith-tint]');
		expect(head?.body).toMatch(/border-bottom:\s*2px solid var\(--sheetsmith-tint-edge\)/);
		expect(row?.body).toMatch(/border-top:\s*2px solid var\(--sheetsmith-tint-edge\)/);
		const forced = all.filter((rule) => rule.context.includes('@media (forced-colors: active)'));
		expect(forced.find((rule) => rule.selector === head?.selector)?.body).toMatch(/border-bottom-width:\s*1px/);
		expect(forced.find((rule) => rule.selector === row?.selector)?.body).toMatch(/border-top-width:\s*1px/);
	});

	it('draws a brief in the tile\'s clothes with a 2px bottom rule in its edge, never a fill or an outline in the tint', () => {
		const brief = base.find((rule) => rule.selector === '.sheetsmith-view .sheetsmith-stat-block-brief');
		// Its other clothes are the tiles' one rule (above); the rule overrides one side, after it.
		expect(brief?.body).toMatch(/border-bottom:\s*2px solid var\(--sheetsmith-tint-edge\)/);
		const clothes = base.find((rule) => selectorsOf(rule).includes(brief?.selector ?? '') && /border-radius/.test(rule.body));
		expect(CSS_WITHOUT_COMMENTS.indexOf('.sheetsmith-view .sheetsmith-stat-block-brief {')).toBeGreaterThan(
			CSS_WITHOUT_COMMENTS.indexOf(clothes?.selector ?? '\u0000'),
		);
		for (const rule of all.filter((one) => one.selector.includes('stat-block-brief'))) {
			expect(rule.body, rule.selector).not.toMatch(/background-image|outline:\s*\S+ solid var\(--sheetsmith-tint/);
			expect(rule.body, rule.selector).not.toMatch(/var\(--sheetsmith-tint\)/);
		}
		// More contrast raises the three plain sides and leaves the rule its colour.
		const more = all.find(
			(rule) => rule.context.includes('@media (prefers-contrast: more)') && rule.selector === brief?.selector,
		);
		expect(more?.body).toMatch(/border-inline-color:\s*var\(--text-muted\)/);
		expect(more?.body).toMatch(/border-top-color:\s*var\(--text-muted\)/);
		expect(more?.body).not.toMatch(/border-(?:bottom-)?color:/);
		const forced = all.find(
			(rule) => rule.context.includes('@media (forced-colors: active)') && rule.selector === brief?.selector,
		);
		expect(forced?.body).toMatch(/border-bottom-width:\s*1px/);
		// Its parts stacked from the top, past the app button's centring.
		expect(brief?.body).toMatch(/flex-direction:\s*column/);
		expect(brief?.body).toMatch(/justify-content:\s*flex-start/);
		// The name at the head's title size; the picture about 64px.
		const name = base.find((rule) => rule.selector === '.sheetsmith-stat-block-brief-name');
		const title = base.find((rule) => rule.selector === '.sheetsmith-stat-block-title');
		for (const property of ['font-size', 'font-weight']) {
			const read = (body: string | undefined) => declarations(body ?? '').find((one) => one.startsWith(`${property}:`));
			expect(read(name?.body), property).toBe(read(title?.body));
		}
		expect(base.find((rule) => rule.selector === '.sheetsmith-stat-block-thumb.sheetsmith-stat-block-brief-thumb')?.body).toMatch(
			/width:\s*64px/,
		);
		// The fields as pairs, not tiles: no box or fill, nothing truncating, a
		// row that wraps, the value bold at the body size and the ceiling muted.
		const pairRules = all.filter((rule) => /stat-block-brief-(?:stats?|stat-label|stat-value|ceiling)\b/.test(rule.selector));
		expect(pairRules.length).toBeGreaterThanOrEqual(5);
		for (const rule of pairRules) {
			expect(rule.body, rule.selector).not.toMatch(/(?:^|;|\s)(?:border|background(?:-color)?|outline|box-shadow)\s*:/);
			expect(rule.body, rule.selector).not.toMatch(/text-overflow|ellipsis|white-space:\s*nowrap|-webkit-line-clamp/);
		}
		// Nothing borrowed that truncates or clothes: no pair is a tile or a component label.
		for (const rule of all.filter((one) => /stat-block-vital\b|sheetsmith-component-label/.test(one.selector))) {
			// The brief itself wears the tile's clothes; its pairs never do.
			expect(rule.selector).not.toMatch(/brief-stat|brief-ceiling/);
		}
		const row = base.find((rule) => rule.selector === '.sheetsmith-stat-block-brief-stats');
		expect(row?.body).toMatch(/flex-wrap:\s*wrap/);
		expect(row?.body).toMatch(/gap:\s*var\(--size-2-2\) calc\(var\(--size-4-2\) \+ var\(--size-2-1\)\)/);
		const value = base.find((rule) => rule.selector === '.sheetsmith-stat-block-brief-stat-value');
		expect(value?.body).toMatch(/font-size:\s*var\(--font-ui-small\)/);
		expect(value?.body).toMatch(/font-weight:\s*var\(--font-bold\)/);
		expect(value?.body).toMatch(/overflow-wrap:\s*anywhere/);
		expect(base.find((rule) => rule.selector === '.sheetsmith-stat-block-brief-stat-label')?.body).toMatch(
			/color:\s*var\(--text-muted\)/,
		);
		expect(base.find((rule) => rule.selector === '.sheetsmith-stat-block-brief-ceiling')?.body).toMatch(
			/color:\s*var\(--text-muted\)/,
		);
		// The changes line clamped to two lines in the prefixed form Chromium draws
		// an ellipsis for, and not the unprefixed `line-clamp`, whose handling has
		// moved between releases.
		const changes = base.find((rule) => rule.selector === '.sheetsmith-stat-block-brief-changes');
		const said = declarations(changes?.body ?? '');
		for (const wanted of [
			'display: -webkit-box',
			'-webkit-box-orient: vertical',
			'-webkit-line-clamp: 2',
			'overflow: hidden',
			'text-overflow: ellipsis',
		]) {
			expect(said, wanted).toContain(wanted);
		}
		expect(said.some((one) => one.startsWith('line-clamp:'))).toBe(false);
		expect(CSS_WITHOUT_COMMENTS).not.toMatch(/(?:^|[;{\s])line-clamp\s*:/);
		// A one-line brief still holds a finger's 44px.
		const coarse = all.find(
			(rule) => rule.context.includes('@media (pointer: coarse)') && rule.selector === brief?.selector,
		);
		expect(coarse?.body).toMatch(/min-height:\s*44px/);
		// Forced colors repaints an author fill on a button as ButtonFace, so
		// Revert and a brief drop theirs and sit on the page as the picker does.
		const unfilled = all.find(
			(rule) =>
				rule.context.includes('@media (forced-colors: active)') &&
				selectorsOf(rule).includes('.sheetsmith-view .sheetsmith-stat-block-revert') &&
				selectorsOf(rule).includes('.sheetsmith-view .sheetsmith-stat-block-brief'),
		);
		expect(unfilled?.body).toMatch(/background-color:\s*transparent/);
		const clothesAt = CSS_WITHOUT_COMMENTS.indexOf(clothes?.selector ?? '\u0000');
		expect(CSS_WITHOUT_COMMENTS.indexOf(unfilled?.selector ?? '\u0000', clothesAt)).toBeGreaterThan(clothesAt);
		// A wrapping grid that does not stretch one brief across the box, one column narrow.
		const grid = base.find((rule) => rule.selector === '.sheetsmith-stat-block-briefs');
		expect(grid?.body).toMatch(/grid-template-columns:\s*repeat\(auto-fill, minmax\(min\(100%, 240px\), 1fr\)\)/);
		const narrow = all.find(
			(rule) =>
				rule.context.some((one) => one.includes('sheetsmith-stat-block (max-width: 360px)')) &&
				rule.selector === '.sheetsmith-stat-block-briefs',
		);
		expect(narrow?.body).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
	});
});

describe('the stat block brief zone (docs/features/stat-block-brief-zone.md)', () => {
	const all = rules(CSS_WITHOUT_COMMENTS);
	const zoneRules = all.filter((rule) => /stat-block-brief-zone/.test(rule.selector));

	it('is a grid of spans that starts at the inline start, sized by its custom property', () => {
		const grid = zoneRules.find((rule) => rule.selector === '.sheetsmith-stat-block-brief-zone');
		expect(grid?.body).toMatch(/display:\s*grid/);
		expect(grid?.body).toMatch(/grid-template-columns:\s*repeat\(var\(--sheetsmith-brief-zone-columns, 1\), minmax\(0, auto\)\)/);
		expect(grid?.body).toMatch(/justify-content:\s*start/);
		// No row gap, so a label sits on its cell as a pair's does; a later row
		// takes the fields row's wrapped-line gap instead.
		expect(grid?.body).toMatch(/gap:\s*0 calc\(var\(--size-4-2\) \+ var\(--size-2-1\)\)/);
		expect(zoneRules.find((rule) => rule.selector === '.sheetsmith-stat-block-brief-zone-next')?.body).toMatch(
			/margin-block-start:\s*var\(--size-2-2\)/,
		);
	});

	it('truncates nothing, wraps a cell inside its column, and uses only theme variables', () => {
		expect(zoneRules.length).toBeGreaterThanOrEqual(5);
		for (const rule of zoneRules) {
			expect(rule.body, rule.selector).not.toMatch(/text-overflow|ellipsis|white-space:\s*nowrap|line-clamp|overflow:\s*hidden/);
			expect(rule.body, rule.selector).not.toMatch(/(?:^|;|\s)(?:border|background(?:-color)?|outline|box-shadow)\s*:/);
			expect(rule.body, rule.selector).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
			expect(rule.selector).not.toMatch(/:has\(/);
		}
		const label = zoneRules.find((rule) => rule.selector === '.sheetsmith-stat-block-brief-zone-label');
		expect(label?.body).toMatch(/color:\s*var\(--text-muted\)/);
		expect(label?.body).toMatch(/font-size:\s*var\(--font-ui-smaller\)/);
		const cell = zoneRules.find((rule) => rule.selector === '.sheetsmith-stat-block-brief-zone-cell');
		expect(cell?.body).toMatch(/overflow-wrap:\s*anywhere/);
		expect(cell?.body).toMatch(/font-size:\s*var\(--font-ui-small\)/);
		expect(zoneRules.find((rule) => rule.selector === '.sheetsmith-stat-block-brief-zone-name')?.body).toMatch(
			/font-weight:\s*var\(--font-bold\)/,
		);
		expect(zoneRules.find((rule) => rule.selector === '.sheetsmith-stat-block-brief-zone-number')?.body).toMatch(
			/font-variant-numeric:\s*tabular-nums/,
		);
	});
});

describe('a placed box that scrolls says more is below', () => {
	/*
	 * The table's right-edge shadow turned to the block axis, and drawn over the
	 * content rather than under it, since a brief, the In play panel and a Record
	 * set's group heading each paint an opaque surface at the foot that a shadow
	 * on the scroller's own background would lie beneath (`sheet.css`, "A placed
	 * box that scrolls says more is below"). Nothing here does layout, so these
	 * hold the declarations; the `sheet-scroll-cue-*` shots hold the picture.
	 *
	 * **Styled once, on a class pair each wearer stamps** (`docs/UI.md` §9). The
	 * way that breaks is a wearer's own class written back into one of the cue's
	 * rules and not the others, which reads fine in review and draws the cue in
	 * some modes only; the guard below refuses any selector but the pair's. That
	 * each wearer stamps the pair is a claim about the component, and lives in
	 * `stat-block.test.ts` and `record-set.test.ts`.
	 */
	const GATE = '@supports (animation-timeline: scroll())';
	const WRAPPER = '.sheetsmith-placed-scroll';
	const SCROLLER = '.sheetsmith-placed-scroller';
	const CUE = `${WRAPPER}::after`;
	const RULE = `${WRAPPER}::before`;
	const MODES = '@media (prefers-contrast: more), (forced-colors: active)';
	const KEYFRAMES = 'sheetsmith-placed-scroll-cue';
	const all = rules(CSS_WITHOUT_COMMENTS);
	const listing = (rule: Rule) => selectorList(rule.selector);
	/** The one rule in that context whose selector list is exactly these. */
	const one = (context: string, ...selectors: string[]) => {
		const found = all.filter(
			(rule) =>
				rule.context.at(-1) === context &&
				listing(rule).join() === selectors.join(),
		);
		expect(found, `${context} ${selectors.join(', ')}`).toHaveLength(1);
		return found[0]?.body ?? '';
	};

	it('names no selector but the pair\'s in any rule of the cue', () => {
		// A wearer's own class beside the pair's, in one rule and not the others,
		// is the duplication the pair replaced.
		const cue = all.filter((rule) => listing(rule).some((one) => one.startsWith(WRAPPER)));
		expect(cue.length).toBeGreaterThan(0);
		const strays = cue.flatMap(listing).filter((one) => ![WRAPPER, SCROLLER, CUE, RULE].includes(one));
		expect(strays).toEqual([]);
	});

	it('names the timeline on the scroller and lifts it to the wrapper round it', () => {
		expect(one(GATE, SCROLLER)).toMatch(/scroll-timeline:\s*--sheetsmith-placed-scroll block/);
		const wrapper = one(GATE, WRAPPER);
		expect(wrapper).toMatch(/timeline-scope:\s*--sheetsmith-placed-scroll/);
		expect(wrapper).toMatch(/position:\s*relative/);
	});

	it('lays both layers along the foot, over the content, off unless the scroll turns them on', () => {
		const body = one(GATE, RULE, CUE);
		expect(body).toMatch(/position:\s*absolute/);
		expect(body).toMatch(/bottom:\s*0/);
		expect(body).toMatch(/pointer-events:\s*none/);
		// Off where the timeline is inactive, which is a scroller with nothing past it.
		expect(body).toMatch(/opacity:\s*0/);
		// The last 24px, or the whole scroll where there is less, so a short
		// overflow opens the cue whole rather than part faded.
		expect(body).toMatch(/animation-range:\s*max\(0px, calc\(100% - 24px\)\) 100%/);
		// The rule layer draws nothing until a mode gives it content.
		expect(body).not.toMatch(/content:/);
	});

	it('draws the shade as the table does, the table\'s colour and its transparent stop', () => {
		const body = one(GATE, CUE);
		expect(body).toMatch(/content:\s*''/);
		expect(body).toMatch(
			/background-image:\s*linear-gradient\(\s*to top,\s*var\(--background-modifier-border\),\s*rgba\(0, 0, 0, 0\)\s*\)/,
		);
	});

	it('draws a rule on a floor, not a shade, under more contrast and in forced colors', () => {
		// A shade over the last legible line lowered its text to about 1.4:1, and
		// forced colors drops a gradient anyway. The floor ends the content early
		// rather than fading it, and the rule stands on fill on every side.
		const modes = all.filter((rule) => rule.context.at(-1) === MODES || rule.context.at(-1) === '@media (forced-colors: active)');
		for (const rule of modes.filter((rule) => listing(rule).some((one) => one.startsWith(WRAPPER)))) {
			// Gated too: these give `::before` content, so ungated they would draw for good.
			expect(rule.context, rule.selector).toContain(GATE);
		}
		// One length for the floor, read by the floor and by the scroller.
		expect(one(MODES, WRAPPER)).toMatch(/--sheetsmith-placed-scroll-floor:\s*10px/);
		const floor = one(MODES, CUE);
		expect(floor).toMatch(/height:\s*var\(--sheetsmith-placed-scroll-floor\)/);
		// A control Tab brings to the foot stops above the floor, ring and all.
		expect(one(MODES, SCROLLER)).toMatch(
			/scroll-padding-block-end:\s*calc\(var\(--sheetsmith-placed-scroll-floor\) \+ var\(--size-2-2\)\)/,
		);
		// Only where the floor is: in every other mode the cue is a translucent shade.
		const padded = all.filter((rule) => /scroll-padding-block-end\s*:/.test(rule.body) && listing(rule).includes(SCROLLER));
		expect(padded.map((rule) => rule.context.at(-1))).toEqual([MODES]);
		expect(floor).toMatch(/background-color:\s*var\(--background-primary-alt\)/);
		expect(floor).toMatch(/background-image:\s*none/);
		const line = one(MODES, RULE);
		expect(line).toMatch(/content:\s*''/);
		expect(line).toMatch(/border-bottom:\s*2px solid var\(--text-muted\)/);
		expect(line).toMatch(/bottom:\s*var\(--size-2-2\)/);
		expect(line).toMatch(/inset-inline:\s*var\(--size-4-2\)/);
		expect(line).toMatch(/z-index:\s*3/);
		// Dashed is a Track's granted segment and dotted a modified value.
		expect(line).not.toMatch(/dashed|dotted/);
		expect(one('@media (forced-colors: active)', RULE)).toMatch(/border-bottom-color:\s*CanvasText/);
	});

	it('writes the timeline on the pair alone, never on a wearer of it', () => {
		const timed = all.filter((rule) =>
			/(?:^|;)\s*(?:scroll-timeline|timeline-scope|animation-timeline|animation-range)\s*:/.test(rule.body),
		);
		expect(timed.length).toBeGreaterThan(0);
		const strays = timed
			.flatMap(listing)
			.filter((selector) => ![WRAPPER, SCROLLER, CUE, RULE].includes(selector));
		expect(strays).toEqual([]);
	});

	it('runs the keyframes only behind the gate and only on a scroll timeline', () => {
		/*
		 * The `@keyframes` block is outside the gate, which is legal CSS and the
		 * whole exposure: a rule naming it in `animation` without a timeline, or
		 * outside the gate, plays it once on the clock, which is exactly the
		 * keyframe on time `docs/UI.md` §8 refuses, and a still shot cannot tell.
		 */
		const running = all.filter((rule) =>
			declarations(rule.body).some((one) => new RegExp(`^animation(?:-name)?:.*\\b${KEYFRAMES}\\b`).test(one)),
		);
		expect(running).toHaveLength(1);
		for (const rule of running) {
			expect(rule.context, rule.selector).toContain(GATE);
			const names = declarations(rule.body).map((one) => one.slice(0, one.indexOf(':')).trim());
			const shorthand = names.findIndex((name) => name === 'animation' || name === 'animation-name');
			const timeline = names.lastIndexOf('animation-timeline');
			// The shorthand resets `animation-timeline`, so the timeline comes after it.
			expect(timeline, rule.selector).toBeGreaterThan(shorthand);
			expect(rule.body).toMatch(/animation-timeline:\s*--sheetsmith-placed-scroll\b/);
		}
	});

	it('allows this one @keyframes and no other, from whole to gone', () => {
		// docs/UI.md §8's exception: scroll progress, not time. Any second
		// `@keyframes`, on time or not, fails here and is argued for in §8 first.
		const keyframes = [...CSS_WITHOUT_COMMENTS.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]);
		expect(keyframes).toEqual([KEYFRAMES]);
		const frames = all.filter((rule) => rule.context.at(-1) === `@keyframes ${KEYFRAMES}`);
		expect(frames.map((rule) => [rule.selector, rule.body])).toEqual([
			['from', 'opacity: 1;'],
			['to', 'opacity: 0;'],
		]);
	});
});
