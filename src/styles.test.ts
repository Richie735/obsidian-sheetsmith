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

	/** Rules that paint a state onto the delete control or a table row. */
	function stateRules(): string[] {
		const withoutComments = CSS_TEXT.replace(/\/\*[\s\S]*?\*\//g, '');
		const found: string[] = [];
		for (const block of withoutComments.split('}')) {
			const brace = block.indexOf('{');
			if (brace === -1) continue;
			const selector = block.slice(0, brace).replace(/\s+/g, ' ').trim();
			const body = block.slice(brace + 1);
			if (!/:hover|:focus-visible/.test(selector)) continue;
			if (
				!selector.includes('.sheetsmith-table-remove-button') &&
				!/\.sheetsmith-table tbody tr/.test(selector)
			) {
				continue;
			}
			const paints = body
				.split(';')
				.some((d) => PAINTED.includes(d.split(':')[0]?.trim() ?? ''));
			if (paints) found.push(selector);
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
