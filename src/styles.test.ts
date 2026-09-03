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
 * `sheetsmith-canvas-overlay` is a real `<button>` on the sheet's own grid
 * (`docs/features/grid-canvas.md` §2). Unscoped it was (0,1,0) and lost
 * `background-color` and `box-shadow` to Obsidian's own
 * `button:not(.clickable-icon)` at (0,1,1) — rendering as an opaque button
 * pinned over the very component it exists to sit over transparently,
 * exactly the invisible-in-review failure this file exists for. The
 * anchored panel's own `CONTROLS` list below is the same idea for a surface
 * that cannot carry `.sheetsmith-view` at all; this is for a control that
 * can and should, but was named outside `FIELD_CLASS`'s own pattern.
 */
const NAMED_FIELD_CLASSES = ['sheetsmith-canvas-overlay'];

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
	 */
	const FOCUS_ELSEWHERE = [
		'sheetsmith-pool-temp-input',
		'sheetsmith-table-name-input',
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
		expect(withoutComments).toContain(':has(.sheetsmith-table-input:focus)');
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
	const EXEMPT = ['src/test/obsidian-stub.ts', 'src/class-tokens.test.ts'];

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
	const BORROWED = ['internal-link', 'is-unresolved'];

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
	 * fixed head of a template literal — `sheetsmith-card-set-align-${x}`
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
