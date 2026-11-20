/*
 * The measurements `docs/features/pool-headline-narrow-fit.md` and
 * `docs/features/headline-narrow-cell.md` make criteria, as a script a
 * reviewer can run again: not shipped, and not a test, because it needs a
 * browser. Run `npm run harness` first (it measures the built bundle against
 * the built `styles.css`), then
 *
 *   node harness/measure-pool-headline.mjs
 *
 * It drives Chrome over the DevTools Protocol through `cdp.mjs`, prints one line
 * per headline per value per condition, and exits non-zero if any check fails.
 *
 * The conditions: the sheet at 1400 and at a 520px container, each at the
 * default size and at `text=24`; a 380px container at `text=24`; a true 380
 * viewport under phone staging. And the placements: Hit points moved to one
 * unit with `100` in its temporary points (**the reported case** of the first
 * spec), and to two units; Load, a two-unit Card, moved to one. Every
 * condition runs again with `field-sizing` turned off and the Pool's field
 * pinned at `width: 4ch`, which is what an engine without it draws. Phone
 * included: the staging is Chromium wearing Obsidian's phone classes, and the
 * real phone's WebKit is the engine without it.
 *
 * **The headlines.** Every Pool's value field, and every Card and Card set
 * headline a component stamped (`.sheetsmith-headline`): a card's derived, or
 * its own field where it has no derived. The sample holds two-unit Cards
 * (Load, Gold value, Armour class), Card set tiles (Abilities, which carry a
 * derived over a pill) and coins (Currency, whose field is the headline).
 *
 * **The values.** Each is injected into every headline at once — a field's
 * `value`, a derived's text — then the page's own fit pass is asked to measure
 * (`window.sheetsmithRefitHeadlines`, the harness's door onto
 * `view/headline-fit.ts`), since a value set from outside resizes nothing the
 * observer sees. `6`, `10`, `100`, `355000` and `+8 Legendary`; a Pool's
 * ceiling goes with them, `6/9`, `10/54`, `100/120` and `/120` for the last two,
 * into a span where the layout calculates it and a field where the character
 * owns it.
 *
 * Checks, per headline and value:
 *
 *  1. **Fits or cut** — the headline lies inside its card's content box with no
 *     clip and no cut state, or it carries `.sheetsmith-headline-cut` with its
 *     digits transparent and its mark inside the content box. No headline box
 *     passes its card anywhere.
 *  2. **Three digits fit above the floor** — at `100`, every headline two units
 *     or wider, and every tile and coin, fits.
 *  3. **The floor above every qualifier** — the headline's computed size is
 *     above its card's ceiling, own-value pill and temporary points, and a
 *     headline *field* is at least 16px, at the default size, `text=24` and phone.
 *  4. **Nothing that fit changes** — at 1400, at 380 at `text=24` and on a phone
 *     every headline draws the full size, `1.75em` of its card, and at `6`, `10`
 *     and `100` its width and its card's height are what the baseline
 *     stylesheet draws (below); on the 520 sheet at the default size only a one-
 *     or two-unit cell draws less.
 *  5. **One size per width, whatever the value** — a headline's size is the same
 *     at every value, and the two-unit Card, Pool and Gold value draw one size.
 *  6. **State, never size** — toggling the cut class on every headline and its
 *     host moves no headline's box and no card's.
 *  7. **The Pool's order** — at `100/120`, a Pool whose number is drawn below
 *     full size has already wrapped its ceiling.
 *  8. **The Pool's ceiling** — inside the content box, its dotted mark included.
 *  9. **The qualifiers' sizes** (`docs/features/pool-ceiling-text-size.md`),
 *     at the default size, `text=24`, and under phone and tablet staging: a
 *     Pool's temporary points draw a Card pill's size and never more than
 *     their ceiling; a ceiling the character owns draws its separator's size,
 *     and at least 16px on a phone or a tablet; a Track length field and a
 *     record's ceiling, which wear the ceiling's classes, keep
 *     `--font-ui-small`; and a Stat block's uses reading, attached to the
 *     `state=forms` sample's run in the shape `stat-block.ts` builds (the
 *     sample draws no numerals), keeps its `/` and ceiling at
 *     `--font-ui-medium`.
 * 10–15. **How a qualifier gives way** (`docs/features/qualifier-fit-and-size.md`):
 *     a typed ceiling's slash gap and the threshold's regimes, the one-unit
 *     residue, the own-value pill giving up its padding, and the wrapped and
 *     unwrapped *Temp* pill, and (16) that an edited one-unit ceiling leaves
 *     its card unscrolled. Listed where they run, at the end.
 *
 * **The baseline** is `styles.css` as the git ref `BASELINE` names (default
 * `HEAD`, the version branch before this feature lands), swapped in for the
 * built stylesheet on the same page with the same values in it. Compared only
 * where every headline fits, since the baseline has no rule for the mark. Once
 * the feature has landed `HEAD` holds it, so pass the ref before it to compare.
 *
 * **Printed and not failed**: check 8 for a one-unit Pool on the 520 sheet,
 * whose ceiling, at the sheet's qualifier size and not a headline, is wider
 * than the card (`docs/BACKLOG.md` § UI). Its lines are marked `residue`, and
 * fail only past the bound `RESIDUE_BOUND` names (Ruling A, `docs/UI.md` §5).
 *
 * **And check 4's card heights at `text=24`, where the ceiling grows**
 * (`docs/features/pool-ceiling-text-size.md`): a Pool's card, and a Card in a
 * grid row with one, may be exactly 1px taller than the baseline, its
 * headline's width unchanged. Each is printed as `moved`, one line each, so the
 * land stop can name them; anything else that moves still fails. Against a
 * baseline that already holds that change there is nothing to print.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CHROME, launch, loadStaged } from './cdp.mjs';

if (!CHROME) {
	console.error('No Chrome-family browser found.');
	process.exit(1);
}
const root = fileURLToPath(new URL('.', import.meta.url));
const BASELINE = process.env.BASELINE ?? 'HEAD';
const baselineCss = execFileSync('git', ['show', `${BASELINE}:styles.css`], {
	cwd: fileURLToPath(new URL('..', import.meta.url)),
	encoding: 'utf8',
	maxBuffer: 16 * 1024 * 1024,
});

/**
 * Put `css` in place of the built stylesheet, or the built one back where `css`
 * is null. The link stays in the page, disabled, so putting it back is instant.
 */
const swapStyles = (css) => `(() => {
	const link = document.querySelector('link[href$="styles.css"]');
	document.getElementById('measure-baseline')?.remove();
	if (${JSON.stringify(css)} === null) {
		link.disabled = false;
	} else {
		const style = document.createElement('style');
		style.id = 'measure-baseline';
		style.textContent = ${JSON.stringify(css)};
		link.after(style);
		link.disabled = true;
	}
	return document.body.offsetHeight;
})()`;

/** Each value, and the ceiling a Pool shows with it. */
const VALUES = [
	['6', '9'],
	['10', '54'],
	['100', '120'],
	['355000', '120'],
	['+8 Legendary', '120'],
];

/** `sheet` is the container width the stage is held to, 0 for the window's. */
const CONDITIONS = [
	{ name: 'default 1400', sheet: 0, text: 0, unchanged: true },
	{ name: 'default 520', sheet: 520, text: 0 },
	{ name: 'text=24 1400', sheet: 0, text: 24, unchanged: true },
	{ name: 'text=24 520', sheet: 520, text: 24 },
	{ name: 'text=24 380', sheet: 380, text: 24, unchanged: true },
	{ name: 'phone 380', sheet: 0, text: 0, viewport: 380, platform: 'phone', unchanged: true },
	{ name: 'reported, default 1400', sheet: 0, text: 0, span: 1 },
	{ name: 'reported, text=24 1400', sheet: 0, text: 24, span: 1 },
	{ name: 'reported, default 520', sheet: 520, text: 0, span: 1 },
	{ name: 'reported, text=24 520', sheet: 520, text: 24, span: 1 },
	{ name: 'two-unit, default 520', sheet: 520, text: 0, span: 2 },
	{ name: 'two-unit, text=24 520', sheet: 520, text: 24, span: 2 },
	{ name: 'one-unit Load, default 520', sheet: 520, text: 0, load: 1 },
	{ name: 'one-unit Load, text=24 520', sheet: 520, text: 24, load: 1 },
];

/**
 * Check 4's expected movers at `text=24`: every Pool, and the Cards sharing
 * Hit points' grid row on the 1400 sheet, whose row a Pool's taller reading
 * sets. Named rather than inferred, so a Card moving anywhere else is a finding.
 * **By exactly the measured 1px**: the 20.8px ceiling, baseline-aligned under
 * the 42px number, reaches 1px further down the reading's line than the number
 * does. A larger move, or any shrink, is not that cause and fails.
 */
const ROW_WITH_A_POOL = ['armour_class', 'passive_perception'];
const CEILING_LINE_PX = 1;
const mayMove = (condition, one, was) =>
	condition.text === 24 &&
	(one.kind === 'pool' || ROW_WITH_A_POOL.includes(one.component)) &&
	Math.abs(one.height - was.height - CEILING_LINE_PX) <= 0.05;
let moved = 0;

/**
 * Check 8's residue, bounded: how far a one-unit Pool's ceiling's box may pass
 * its card's content box on the 520 sheet, a calculated one and a typed one,
 * since its padding gave way and the rest overflows by `docs/UI.md` §5's
 * Ruling A (`docs/features/qualifier-fit-and-size.md`). The reading centres
 * `safe`, so an overflowing ceiling starts at the content's start and passes
 * it at its end only, by its width less the content's: a `/120` is 34 and 36px
 * at the default size, 45.4 and 47.4 at `text=24`, against 15.2, the typed
 * bound a rounding tenth over. Check 11 holds the two at `/120`, and the
 * slash's ink inside the card's clip.
 */
const RESIDUE_BOUND = { 0: { calculated: 18.8, typed: 20.8 }, 24: { calculated: 30.2, typed: 32.3 } };

/** Where a check holds the floor: the default size, `text=24` and phone. */
const FLOOR_CHECKED = (condition) => condition.text === 0 || condition.text === 24;

/** What an engine with no `field-sizing` draws: the fallback `width: 4ch`. */
const NO_FIELD_SIZING = `
.sheetsmith-view .sheetsmith-pool-current.sheetsmith-pool-current.sheetsmith-pool-current {
	field-sizing: fixed;
	width: 4ch;
}`;

/**
 * The reported placement and its temporary points, as harness query: the same
 * `&place=` and `&type=` the `pool-headline-reported` shots stage, so the two
 * instruments draw one state. The layout is moved and the temp committed, so
 * what is measured is what a rebuild draws, not a style or a draft set here.
 */
const TEMP = ".sheetsmith-pool-temp-input[aria-label='Hit points temporary']";
const reported = (span) =>
	`&place=hit_points:5,${span}&type=${encodeURIComponent(`${TEMP}|100`)}`;

/**
 * Fails loudly where the reported staging did not take, rather than measuring
 * the sample. And puts the card's scroll back at its start: `&type=` focuses the
 * temp field, and where the pill is wider than the card (a one-unit cell at
 * 520) focus scrolls the `overflow: hidden` card sideways to it and leaves it
 * there after the blur, which would be measured as 18px more overflow.
 */
const checkPlaced = (id, span, temp) => `(() => {
	const cell = document.querySelector('[data-sheetsmith-component="${id}"]');
	const card = cell?.querySelector('.sheetsmith-pool, .sheetsmith-card');
	if (card) card.scrollLeft = 0;
	const placed = cell?.style.gridColumn ?? '';
	if (!placed.endsWith('span ${span}')) throw new Error('Staging did not take: ${id} at ' + placed);
	${
		temp
			? `const temp = document.querySelector(${JSON.stringify(TEMP)})?.value;
	if (temp !== '100') throw new Error('Reported staging did not take: temp ' + temp);`
			: ''
	}
	return true;
})()`;

/** Every headline with the value injected, refitted, then measured. */
const measure = (value, ceiling) => `(() => {
	const round = (n) => Math.round(n * 10) / 10;
	const px = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : null);
	const headlines = [
		...new Set([
			...document.querySelectorAll('.sheetsmith-pool-current'),
			...document.querySelectorAll('.sheetsmith-card .sheetsmith-headline'),
		]),
	].filter((el) => el.getBoundingClientRect().width > 0);
	// Every value first, then every measurement: cards share grid rows, so one
	// still holding its stored value would set a row's height under another.
	for (const el of headlines) {
		if (el instanceof HTMLInputElement) el.value = ${JSON.stringify(value)};
		else el.textContent = ${JSON.stringify(value)};
		const card = el.closest('.sheetsmith-pool');
		const max = card?.querySelector('.sheetsmith-pool-max');
		if (max instanceof HTMLInputElement) max.value = ${JSON.stringify(ceiling)};
		else if (max) max.textContent = ${JSON.stringify(ceiling)};
	}
	window.sheetsmithRefitHeadlines();

	const rect = (el) => el?.getBoundingClientRect() ?? null;
	const out = [];
	for (const el of headlines) {
		const card = el.closest('.sheetsmith-pool, .sheetsmith-card');
		const box = card.getBoundingClientRect();
		const style = getComputedStyle(card);
		const left = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
		const right = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
		const outside = (r) => (r === null ? -Infinity : Math.max(left - r.left, r.right - right));
		const pool = card.classList.contains('sheetsmith-pool');
		const cut = el.classList.contains('sheetsmith-headline-cut');
		const mark = cut
			? (el.classList.contains('sheetsmith-card-derived') ? el : el.parentElement).querySelector(
					'.sheetsmith-headline-mark',
				)
			: null;
		const ceil = pool ? card.querySelector('.sheetsmith-pool-ceiling') : null;
		const c = rect(ceil);
		const f = rect(el);
		const cell = card.closest('.sheetsmith-cell');
		const span = Number(/span (\\d+)/.exec(cell?.style.gridColumn ?? '')?.[1] ?? 0);
		const kind = pool
			? 'pool'
			: card.closest('.sheetsmith-card-set')
				? el.classList.contains('sheetsmith-card-derived')
					? 'tile'
					: 'coin'
				: 'card';
		// The card's own \`1.75em\`, the full size, read off a probe in the card.
		const probe = document.createElement('span');
		probe.style.fontSize = 'var(--sheetsmith-card-value-size)';
		el.parentElement.appendChild(probe);
		const cap = px(probe);
		probe.remove();
		const ceilingSize = pool ? px(card.querySelector('.sheetsmith-pool-max')) : null;
		const pill = card.querySelector('.sheetsmith-card-has-derived .sheetsmith-card-value > .sheetsmith-card-input');
		const temp = card.querySelector('.sheetsmith-pool-temp-input');
		out.push({
			// A field by its name; a derived by its card's label, since a cut
			// derived holding its stop is named with its value as well.
			label:
				(el instanceof HTMLInputElement ? el.getAttribute('aria-label') : null) ??
				card.querySelector('.sheetsmith-card-label')?.textContent ??
				'?',
			component: cell?.getAttribute('data-sheetsmith-component') ?? '?',
			kind,
			span,
			nested: cell?.parentElement?.closest('.sheetsmith-cell') !== null,
			field: el instanceof HTMLInputElement,
			content: round(right - left),
			size: round(px(el)),
			cap: round(cap),
			qualifiers: [ceilingSize, px(pill), px(temp)].filter((n) => n !== null).map(round),
			over: round(outside(f)),
			clip: el.scrollWidth - el.clientWidth,
			cut,
			transparent: getComputedStyle(el).webkitTextFillColor === 'rgba(0, 0, 0, 0)',
			markOver: mark === null ? null : round(outside(rect(mark))),
			ceilOver: c === null ? null : round(Math.max(outside(c), outside(rect(card.querySelector('.sheetsmith-pool-max-modified'))))),
			wraps: c !== null && c.top >= f.bottom - 1,
			height: round(box.height),
			width: round(f.width),
		});
	}
	return out;
})()`;

/**
 * Check 6: every headline's box and every card's, before and after toggling
 * the cut class on each headline and its host. Restores what it toggled.
 */
const toggleMoves = `(() => {
	const headlines = [...document.querySelectorAll('.sheetsmith-headline')].filter(
		(el) => el.getBoundingClientRect().width > 0,
	);
	const boxes = () =>
		headlines.flatMap((el) => {
			const card = el.closest('.sheetsmith-pool, .sheetsmith-card');
			return [el.getBoundingClientRect(), card.getBoundingClientRect()].map((r) =>
				[r.left, r.top, r.width, r.height].map((n) => Math.round(n * 10) / 10).join(),
			);
		});
	const before = boxes();
	const hostOf = (el) => (el.classList.contains('sheetsmith-card-derived') ? el : el.parentElement);
	for (const el of headlines) {
		el.classList.toggle('sheetsmith-headline-cut');
		hostOf(el).classList.toggle('sheetsmith-headline-cut');
	}
	const after = boxes();
	for (const el of headlines) {
		el.classList.toggle('sheetsmith-headline-cut');
		hostOf(el).classList.toggle('sheetsmith-headline-cut');
	}
	return { count: headlines.length, moved: before.filter((one, at) => one !== after[at]).length };
})()`;

const browser = await launch(['--window-size=1400,1900']);
let failed = 0;
let measured = 0;
let residue = 0;
const fail = (line) => {
	failed++;
	console.log(`FAIL  ${line}`);
};
const pass = (line) => console.log(`PASS     ${line}`);

for (const fallback of [false, true]) {
	console.log(`\n== field-sizing ${fallback ? 'off (simulated)' : 'on'} ==`);
	for (const condition of CONDITIONS) {
		const viewport = condition.viewport ?? 1400;
		const query =
			`surface=sheet&theme=light&width=${condition.sheet}&text=${condition.text}` +
			(condition.span === undefined ? '' : reported(condition.span)) +
			(condition.load === undefined ? '' : `&place=load:11,${condition.load}`);
		const { took, unstage } = await loadStaged(browser, `file://${root}index.html?${query}`, {
			width: viewport,
			height: 1900,
			platform: condition.platform ?? null,
		});
		if (took === false) {
			fail(`${condition.name}: phone staging did not take`);
			continue;
		}
		if (fallback) {
			await browser.evaluate(`(() => {
				const style = document.createElement('style');
				style.textContent = ${JSON.stringify(NO_FIELD_SIZING)};
				document.head.append(style);
			})()`);
		}
		if (condition.span !== undefined) await browser.evaluate(checkPlaced('hit_points', condition.span, condition.span === 1));
		if (condition.load !== undefined) await browser.evaluate(checkPlaced('load', condition.load, false));
		console.log(`\n-- ${condition.name}`);

		/** Each headline's size at every value, for check 5. */
		const sizes = new Map();
		for (const [value, ceiling] of VALUES) {
			const all = await browser.evaluate(measure(value, ceiling));
			// 4, the baseline half: where everything fits, the same values under
			// the version branch's stylesheet draw the same widths and heights.
			if (condition.unchanged && ['6', '10', '100'].includes(value) && all.every((one) => !one.cut)) {
				await browser.evaluate(swapStyles(baselineCss));
				const before = await browser.evaluate(measure(value, ceiling));
				await browser.evaluate(swapStyles(null));
				let compared = 0;
				let movedHere = 0;
				for (const [at, one] of all.entries()) {
					const was = before[at];
					if (was === undefined || was.label !== one.label) continue;
					compared++;
					const widthMoved = Math.abs(was.width - one.width) > 0.05;
					const heightMoved = Math.abs(was.height - one.height) > 0.05;
					if (!widthMoved && heightMoved && mayMove(condition, one, was)) {
						moved++;
						movedHere++;
						console.log(
							`moved    ${value.padEnd(12)} ${one.kind.padEnd(4)} ${`${one.component} ${one.label}`.padEnd(30)}` +
								` card height ${was.height} -> ${one.height}, headline ${one.width} wide as before`,
						);
					} else if (widthMoved || heightMoved) {
						fail(
							`${condition.name} ${value}: ${one.component} ${one.label} drew ${one.width} wide in a ${one.height} card, against ${was.width} in ${was.height} before`,
						);
					}
				}
				if (compared === 0) fail(`${condition.name} ${value}: compared nothing against the baseline`);
				else {
					pass(
						`${value.padEnd(12)} baseline: ${compared} headlines, width unchanged` +
							(movedHere === 0 ? ', card height unchanged' : `, ${movedHere} card heights moved as expected (above)`),
					);
				}
			}
			const toggled = await browser.evaluate(toggleMoves);
			if (toggled.count === 0 || toggled.moved > 0) {
				fail(`${condition.name} ${value}: toggling the cut state moved ${toggled.moved} of ${toggled.count * 2} boxes`);
			}
			for (const one of all) {
				// A placement condition is about the component it moved.
				if (condition.span !== undefined && one.component !== 'hit_points') continue;
				if (condition.load !== undefined && one.component !== 'load') continue;
				measured++;
				const key = `${one.component} ${one.label}`;
				sizes.set(key, [...(sizes.get(key) ?? []), one.size]);
				const why = [];
				// 1. Fits, or cut with its digits gone and its mark in the box.
				const fits = !one.cut && one.over <= 0.5 && one.clip <= 0;
				const marked = one.cut && one.transparent && one.over <= 0.5 && (one.markOver ?? Infinity) <= 0.5;
				if (!fits && !marked) why.push('neither fits nor is marked');
				// 2. Three digits fit wherever the number is above the floor.
				const wide = !one.nested && (one.kind === 'tile' || one.kind === 'coin' || one.span >= 2);
				if (value === '100' && wide && condition.sheet === 520 && !fits) why.push('three digits do not fit');
				// 3. The floor above every qualifier, and a field never under 16px.
				if (FLOOR_CHECKED(condition) && one.qualifiers.some((q) => one.size <= q)) why.push('at or under a qualifier');
				if (one.field && one.size < 16) why.push('a field under 16px');
				// 4. Nothing that fit changes size.
				if (condition.unchanged && Math.abs(one.size - one.cap) > 0.05) why.push('not at full size');
				if (
					condition.name === 'default 520' &&
					!one.nested &&
					(one.kind === 'tile' || one.kind === 'coin' || one.span > 2) &&
					Math.abs(one.size - one.cap) > 0.05
				) {
					why.push('changed size above two units');
				}
				// 7. A Pool drawn below full size at 100/120 has wrapped its ceiling first.
				if (one.kind === 'pool' && value === '100' && one.size < one.cap - 0.05 && one.ceilOver !== null && !one.wraps) {
					why.push('scaled before its ceiling wrapped');
				}
				// 8. The ceiling stays in the card, but for the one-unit residue.
				const isResidue = one.kind === 'pool' && one.span === 1 && !one.nested && condition.sheet === 520;
				const ceilingOut = one.ceilOver !== null && one.ceilOver > 0.5;
				if (ceilingOut && isResidue) {
					residue++;
					const bound = RESIDUE_BOUND[condition.text]?.calculated ?? Infinity;
					if (one.ceilOver > bound + 0.05) why.push(`ceiling passes the card by ${one.ceilOver}, over its residue bound ${bound}`);
				} else if (ceilingOut) why.push('ceiling passes the card');
				if (why.length > 0) failed++;
				const verdict = why.length > 0 ? 'FAIL' : ceilingOut ? 'residue' : 'PASS';
				console.log(
					`${verdict.padEnd(8)} ${value.padEnd(12)} ${one.kind.padEnd(4)} ${key.padEnd(30)}` +
						` span ${String(one.span).padEnd(2)} content ${String(one.content).padStart(6)}` +
						` size ${String(one.size).padStart(5)}/${String(one.cap).padEnd(4)}` +
						` ${one.cut ? 'cut ' : 'fits'} over ${String(one.over).padStart(6)} clip ${String(one.clip).padStart(3)}` +
						` mark ${String(one.markOver ?? '-').padStart(5)}` +
						(one.kind === 'pool'
							? ` ceil ${String(one.ceilOver ?? '-').padStart(5)} ${one.wraps ? 'wraps' : 'one line'}`
							: '') +
						` height ${String(one.height).padStart(6)}` +
						(why.length > 0 ? `  <- ${why.join('; ')}` : ''),
				);
			}
		}
		// 5. One size whatever the value, and one size per width.
		for (const [key, list] of sizes) {
			if (new Set(list).size > 1) fail(`${condition.name}: ${key} changes size with its value: ${list.join(', ')}`);
		}
		if (condition.span === 2) {
			// The Pool alone was measured here; the two-unit Cards beside it are read once more.
			const all = await browser.evaluate(measure('100', '120'));
			const two = all.filter(
				(one) => ['load', 'gold_value', 'hit_points'].includes(one.component) && one.span === 2,
			);
			const drawn = new Set(two.map((one) => one.size));
			const line = two.map((one) => `${one.component} ${one.size}`).join(', ');
			if (two.length !== 3 || drawn.size !== 1) fail(`${condition.name}: one width, several sizes: ${line}`);
			else pass(`one width, one size: ${line}`);
		}
		await unstage();
	}
}

/**
 * Check 9: the qualifiers' sizes. One page per condition, no values injected:
 * the sample's own Pools, pills, Track rows and records, and a Stat block
 * uses reading attached as `stat-block.ts` builds it.
 */
const QUALIFIER_CONDITIONS = [
	{ name: 'default', text: 0, viewport: 1400, platform: null },
	{ name: 'text=24', text: 24, viewport: 1400, platform: null },
	{ name: 'phone', text: 0, viewport: 380, platform: 'phone' },
	{ name: 'tablet', text: 0, viewport: 1024, platform: 'tablet' },
];
const qualifiers = `(() => {
	const round = (n) => Math.round(n * 10) / 10;
	const px = (el) => (el ? round(parseFloat(getComputedStyle(el).fontSize)) : null);
	const small = (el) => {
		const probe = document.createElement('span');
		probe.style.fontSize = 'var(--font-ui-small)';
		el.parentElement.appendChild(probe);
		const size = px(probe);
		probe.remove();
		return size;
	};
	const pills = [...document.querySelectorAll('.sheetsmith-card-has-derived .sheetsmith-card-value > .sheetsmith-card-input')].map(px);
	return {
		pill: pills.length > 0 && new Set(pills).size === 1 ? pills[0] : pills,
		pools: [...document.querySelectorAll('.sheetsmith-pool')].map((card) => ({
			label: card.querySelector('.sheetsmith-pool-current')?.getAttribute('aria-label') ?? '?',
			temp: px(card.querySelector('.sheetsmith-pool-temp-input')),
			separator: px(card.querySelector('.sheetsmith-pool-separator')),
			owned: px(card.querySelector('.sheetsmith-pool-ceiling .sheetsmith-pool-max-input')),
		})),
		borrowed: [
			...[...document.querySelectorAll('.sheetsmith-track-row-length-input')].map((el) => ['track length', px(el), small(el)]),
			...[...document.querySelectorAll('.sheetsmith-record-field .sheetsmith-pool-max')].map((el) => ['record ceiling', px(el), small(el)]),
		],
	};
})()`;
/**
 * A copy of the uses reading `stat-block.ts` builds (beside its `reading`, which
 * points back here): `state=forms` draws a uses run of two rings, under the
 * six past which the numerals appear, so the reading is attached by hand. A
 * change to that markup has to be made here too, or this measures a stale copy.
 */
const statUses = `(() => {
	const round = (n) => Math.round(n * 10) / 10;
	const px = (el) => round(parseFloat(getComputedStyle(el).fontSize));
	const run = document.querySelector('.sheetsmith-stat-block-uses-run');
	if (run === null) return null;
	const reading = document.createElement('span');
	reading.className = 'sheetsmith-pool-ceiling sheetsmith-stat-block-uses-count';
	for (const [cls, text] of [['sheetsmith-stat-block-uses-value', '7'], ['sheetsmith-pool-separator', '/'], ['sheetsmith-pool-max', '12']]) {
		const span = document.createElement('span');
		span.className = cls;
		span.textContent = text;
		reading.append(span);
	}
	run.append(reading);
	const probe = document.createElement('span');
	probe.style.fontSize = 'var(--font-ui-medium)';
	reading.append(probe);
	const medium = px(probe);
	probe.remove();
	const out = {
		separator: px(reading.querySelector('.sheetsmith-pool-separator')),
		max: px(reading.querySelector('.sheetsmith-pool-max')),
		medium,
	};
	reading.remove();
	return out;
})()`;
console.log('\n== qualifier sizes ==');
for (const condition of QUALIFIER_CONDITIONS) {
	for (const state of ['populated', 'forms']) {
		const { took, unstage } = await loadStaged(
			browser,
			`file://${root}index.html?surface=sheet&theme=light&state=${state}&text=${condition.text}`,
			{ width: condition.viewport, height: 1900, platform: condition.platform },
		);
		if (took === false) {
			fail(`qualifiers ${condition.name}: ${condition.platform} staging did not take`);
			continue;
		}
		if (state === 'forms') {
			const uses = await browser.evaluate(statUses);
			measured++;
			if (uses === null) fail(`qualifiers ${condition.name}: no Stat block uses run in state=forms`);
			else if (uses.separator !== uses.medium || uses.max !== uses.medium) {
				fail(`qualifiers ${condition.name}: Stat block uses reads / ${uses.separator} and ${uses.max} against --font-ui-medium ${uses.medium}`);
			} else pass(`${condition.name.padEnd(8)} Stat block uses / and ceiling at --font-ui-medium, ${uses.medium}`);
			await unstage();
			continue;
		}
		const sizes = await browser.evaluate(qualifiers);
		const withTemp = sizes.pools.filter((one) => one.temp !== null);
		const owned = sizes.pools.filter((one) => one.owned !== null);
		if (withTemp.length === 0 || owned.length === 0 || sizes.borrowed.length === 0 || typeof sizes.pill !== 'number') {
			fail(`qualifiers ${condition.name}: measured nothing, or Card pills disagree: ${JSON.stringify(sizes)}`);
		}
		for (const one of sizes.pools) {
			measured++;
			const why = [];
			if (one.temp !== null && one.temp !== sizes.pill) why.push(`temp ${one.temp} is not a Card pill's ${sizes.pill}`);
			if (one.temp !== null && one.separator !== null && one.temp > one.separator) why.push(`temp ${one.temp} outranks its ceiling ${one.separator}`);
			if (one.owned !== null && one.owned !== one.separator) why.push(`owned ceiling ${one.owned} is not its separator's ${one.separator}`);
			if (one.owned !== null && condition.platform !== null && one.owned < 16) why.push(`owned ceiling ${one.owned} under 16px`);
			if (why.length > 0) failed++;
			console.log(
				`${(why.length > 0 ? 'FAIL' : 'PASS').padEnd(8)} ${condition.name.padEnd(8)} pool ${one.label.padEnd(24)}` +
					` ceiling ${one.separator} temp ${one.temp ?? '-'} owned ${one.owned ?? '-'} pill ${sizes.pill}` +
					(why.length > 0 ? `  <- ${why.join('; ')}` : ''),
			);
		}
		const off = sizes.borrowed.filter(([, size, token]) => size !== token);
		measured += sizes.borrowed.length;
		for (const [what, size, token] of off) {
			fail(`qualifiers ${condition.name}: a ${what} draws ${size} against --font-ui-small ${token}`);
		}
		if (off.length === 0) {
			pass(`${condition.name.padEnd(8)} ${sizes.borrowed.length} Track length fields and record ceilings at --font-ui-small`);
		}
		await unstage();
	}
}

/**
 * Checks 10 to 15: `docs/features/qualifier-fit-and-size.md`. Each against the
 * baseline stylesheet where it says "unchanged", on the same page with the
 * same values, as check 4 is.
 *
 * 10. **A typed ceiling's slash gap** — 3px from its slash's box to its digits'
 *     (1px of padding past the 2px gap), a calculated ceiling's 2, every Pool,
 *     at 1400 and 520, default and `text=24`. And **no Pool changes regime**:
 *     every value field's `min-width` is the baseline's.
 * 11. **The one-unit residue, re-bounded** — Hit points (calculated) and Rolled
 *     HP (typed) at one unit on 520, at `/120`: the typed ceiling 2px wider
 *     than the calculated, and passing the card by at most 9.4 and 10.4px a
 *     side at the default size, 15.1 and 16.1 at `text=24`.
 * 12. **The own-value pill gives up its padding** — a one-unit Load at 520,
 *     default, shows `0` whole, inside the card, and its card's height is the
 *     baseline's; a two-unit Carried at 520, `text=24`, shows `100` whole;
 *     every own-value pill at 1400 (a Card's, a Card set tile's, a Roster
 *     card's score) and every Card set tile's at 520 is the baseline's width.
 * 13. **A wrapped *Temp* pill closes up** — Hit points at two units with `100`
 *     in its points, on 520: the ink from *Temp* to its value is within 3px of
 *     the ink room above *Temp*, default and `text=24`.
 * 14. **An unwrapped one does not move** — every pill on one line is 32px
 *     tall, and every Pool whose pill does not wrap is the baseline's height,
 *     at 1400 and 520, default and `text=24`.
 * 15. **The points field is a pointer's height** — at least 20px at the
 *     default size.
 */
const QUALIFIER_FIT = [
	{ name: 'default 1400', sheet: 0, text: 0 },
	{ name: 'text=24 1400', sheet: 0, text: 24 },
	{ name: 'default 520', sheet: 520, text: 0 },
	{ name: 'text=24 520', sheet: 520, text: 24 },
];

/** The plain sheet: slash gaps, regimes, pill widths, temp pills, Pool heights. */
const fitPlain = `(() => {
	const round = (n) => Math.round(n * 10) / 10;
	const pools = [...document.querySelectorAll('.sheetsmith-pool')].filter((card) => card.getBoundingClientRect().width > 0);
	const ink = (el) => {
		const st = getComputedStyle(el);
		const ctx = document.createElement('canvas').getContext('2d');
		// Spelt from its parts: the \`font\` shorthand carries \`tabular-nums\`,
		// which a canvas refuses, falling back to 10px sans-serif.
		ctx.font = [st.fontStyle, st.fontWeight, st.fontSize, st.fontFamily].join(' ');
		const text = el instanceof HTMLInputElement ? el.value : el.textContent;
		const shown = st.textTransform === 'uppercase' ? text.toUpperCase() : text;
		const m = ctx.measureText(shown);
		const r = el.getBoundingClientRect();
		let baseline;
		if (el instanceof HTMLInputElement) {
			// A one-line field centres its line box in its content box.
			const top = r.top + parseFloat(st.borderTopWidth) + parseFloat(st.paddingTop);
			const height = el.clientHeight - parseFloat(st.paddingTop) - parseFloat(st.paddingBottom);
			baseline = top + (height - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
		} else {
			const probe = document.createElement('span');
			probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
			el.append(probe);
			baseline = probe.getBoundingClientRect().bottom;
			probe.remove();
		}
		return { top: baseline - m.actualBoundingBoxAscent, bottom: baseline + m.actualBoundingBoxDescent };
	};
	// A cell's grid rows, [start, end), and its grid's identity, from its area.
	const rowsOf = (cell) => {
		const m = /^(\\d+) \\/ \\d+ \\/ span (\\d+)/.exec(cell?.style.gridArea ?? '');
		const grid = cell?.parentElement;
		if (!grid.dataset.measureGrid) grid.dataset.measureGrid = String(Math.random());
		return m === null ? null : { grid: grid.dataset.measureGrid, start: Number(m[1]), end: Number(m[1]) + Number(m[2]) };
	};
	return {
		cells: [...document.querySelectorAll('.sheetsmith-cell')].map(rowsOf).filter((one) => one !== null),
		pools: pools.map((card) => {
			const sep = card.querySelector('.sheetsmith-pool-separator');
			const max = card.querySelector('.sheetsmith-pool-max');
			const temp = card.querySelector('.sheetsmith-pool-temp');
			const label = temp?.querySelector('.sheetsmith-pool-temp-label');
			const field = temp?.querySelector('.sheetsmith-pool-temp-input');
			let gap = null;
			if (sep && max) {
				const typed = max instanceof HTMLInputElement;
				gap = round(max.getBoundingClientRect().left + (typed ? parseFloat(getComputedStyle(max).paddingLeft) : 0) - sep.getBoundingClientRect().right);
			}
			let wrapped = null;
			let above = null;
			let between = null;
			if (temp && label && field && temp.getBoundingClientRect().width > 0) {
				// On a second line where the field's middle is below the word: its
				// box reaches into the line above by its negative margin.
				const fr = field.getBoundingClientRect();
				wrapped = fr.top + fr.height / 2 > label.getBoundingClientRect().bottom;
				const t = temp.getBoundingClientRect();
				const l = ink(label);
				const f = ink(field);
				above = round(l.top - (t.top + parseFloat(getComputedStyle(temp).borderTopWidth)));
				between = round(f.top - l.bottom);
			}
			const cur = card.querySelector('.sheetsmith-pool-current').getBoundingClientRect();
			const ceilBox = card.querySelector('.sheetsmith-pool-ceiling')?.getBoundingClientRect();
			return {
				component: card.closest('.sheetsmith-cell')?.getAttribute('data-sheetsmith-component') ?? '?',
				rows: rowsOf(card.closest('.sheetsmith-cell')),
				ceilWraps: ceilBox === undefined ? null : ceilBox.top >= cur.bottom - 1,
				typed: max instanceof HTMLInputElement,
				ceiling: ceilBox === undefined ? null : [ceilBox.left, ceilBox.top, ceilBox.width].map(round).join(),
				fits: ceilBox === undefined ? null : ceilBox.width <= card.querySelector('.sheetsmith-pool-reading').getBoundingClientRect().width + 0.05,
				gap,
				regime: getComputedStyle(card.querySelector('.sheetsmith-pool-current')).minWidth,
				height: round(card.getBoundingClientRect().height),
				temp: temp && temp.getBoundingClientRect().width > 0 ? round(temp.getBoundingClientRect().height) : null,
				field: field ? round(field.getBoundingClientRect().height) : null,
				wrapped,
				above,
				between,
			};
		}),
		pills: [...document.querySelectorAll('.sheetsmith-card-value')]
			.filter((pill) => pill.getBoundingClientRect().width > 0 && pill.closest('.sheetsmith-card-has-derived, .sheetsmith-roster-card, .sheetsmith-card'))
			.map((pill) => ({
				label: pill.querySelector('input, select')?.getAttribute('aria-label') ?? '?',
				tile: pill.closest('.sheetsmith-card-set') !== null,
				width: round(pill.getBoundingClientRect().width),
			})),
	};
})()`;

/** One pill's value injected, and whether its field shows it whole. */
const pillShows = (component, value) => `(() => {
	const card = document.querySelector('[data-sheetsmith-component="${component}"] .sheetsmith-card');
	const pill = card.querySelector('.sheetsmith-card-value');
	const input = pill.querySelector('.sheetsmith-card-input');
	input.value = ${JSON.stringify(value)};
	const st = getComputedStyle(input);
	const probe = document.createElement('span');
	probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:' + st.font;
	probe.textContent = ${JSON.stringify(value)};
	card.append(probe);
	const digits = probe.getBoundingClientRect().width;
	probe.remove();
	const inner = input.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight);
	const c = card.getBoundingClientRect();
	const cs = getComputedStyle(card);
	const left = c.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
	const right = c.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
	const p = pill.getBoundingClientRect();
	const round = (n) => Math.round(n * 10) / 10;
	return {
		whole: inner >= digits - 0.5 && input.scrollWidth <= input.clientWidth,
		inner: round(inner),
		digits: round(digits),
		over: round(Math.max(left - p.left, p.right - right)),
		height: round(c.height),
	};
})()`;

/** Both one-unit ceilings at `/120`: each one's width and how far it passes its card. */
const ceilingsAt120 = `(() => {
	const round = (n) => Math.round(n * 10) / 10;
	const out = {};
	for (const component of ['hit_points', 'rolled_health']) {
		const card = document.querySelector('[data-sheetsmith-component="' + component + '"] .sheetsmith-pool');
		card.scrollLeft = 0;
		const max = card.querySelector('.sheetsmith-pool-max');
		if (max instanceof HTMLInputElement) max.value = '120';
		else max.textContent = '120';
		const ceil = card.querySelector('.sheetsmith-pool-ceiling').getBoundingClientRect();
		const sepEl = card.querySelector('.sheetsmith-pool-separator');
		const sep = sepEl.getBoundingClientRect();
		// The slash's ink, from the font's metrics on its own origin, since
		// its stroke leans past its advance.
		const sepStyle = getComputedStyle(sepEl);
		const ctx = document.createElement('canvas').getContext('2d');
		ctx.font = [sepStyle.fontStyle, sepStyle.fontWeight, sepStyle.fontSize, sepStyle.fontFamily].join(' ');
		const metrics = ctx.measureText(sepEl.textContent);
		const range = document.createRange();
		range.selectNodeContents(sepEl);
		const origin = range.getBoundingClientRect().left;
		const ink = { left: origin - metrics.actualBoundingBoxLeft, right: origin + metrics.actualBoundingBoxRight };
		// How many of the ceiling's digits are drawn, in digits: what a
		// reader is left to read after the slash.
		const maxStyle = getComputedStyle(max);
		const maxBox = max.getBoundingClientRect();
		const pad = max instanceof HTMLInputElement ? parseFloat(maxStyle.paddingLeft) : 0;
		const digit = (maxBox.width - 2 * pad) / 3;
		const b = card.getBoundingClientRect();
		const st = getComputedStyle(card);
		// The card's \`overflow: hidden\` clips at its padding box, the inner
		// edge of its border: what of the ceiling is drawn, and of its slash.
		const clipLeft = b.left + parseFloat(st.borderLeftWidth);
		const clipRight = b.right - parseFloat(st.borderRightWidth);
		const left = clipLeft + parseFloat(st.paddingLeft);
		const right = clipRight - parseFloat(st.paddingRight);
		const seen = (r) => Math.max(0, Math.min(r.right, clipRight) - Math.max(r.left, clipLeft));
		out[component] = {
			typed: max instanceof HTMLInputElement,
			width: round(ceil.width),
			over: round(Math.max(left - ceil.left, ceil.right - right)),
			visible: round(seen(ceil)),
			clipped: round(ceil.width - seen(ceil)),
			slash: sep.width === 0 ? 0 : round((seen(sep) / sep.width) * 100),
			inkWhole: ink.left >= clipLeft - 0.05 && ink.right <= clipRight + 0.05,
			start: round(left - ceil.left),
			end: round(ceil.right - right),
			digits: round(Math.max(0, Math.min(3, (clipRight - (maxBox.left + pad)) / digit))),
		};
	}
	return out;
})()`;

console.log('\n== qualifier fit (docs/features/qualifier-fit-and-size.md) ==');
for (const condition of QUALIFIER_FIT) {
	const base = `surface=sheet&theme=light&width=${condition.sheet}&text=${condition.text}`;
	// The plain sheet.
	{
		const { unstage } = await loadStaged(browser, `file://${root}index.html?${base}`, { width: 1400, height: 1900 });
		const now = await browser.evaluate(fitPlain);
		await browser.evaluate(swapStyles(baselineCss));
		const was = await browser.evaluate(fitPlain);
		await browser.evaluate(swapStyles(null));
		// 10, the safe centring: with plain \`center\` put back over the built
		// stylesheet, every ceiling that fits its line draws where it did.
		await browser.evaluate(`(() => {
			const style = document.createElement('style');
			style.id = 'measure-plain-centre';
			style.textContent = '.sheetsmith-pool-reading { justify-content: center !important; }';
			document.head.append(style);
			return document.body.offsetHeight;
		})()`);
		const centred = await browser.evaluate(fitPlain);
		await browser.evaluate(`(() => { document.getElementById('measure-plain-centre').remove(); return document.body.offsetHeight; })()`);
		const fitting = now.pools.filter((one) => one.fits === true);
		const shifted = fitting.filter((one, at) => one.ceiling !== centred.pools[now.pools.indexOf(one)]?.ceiling);
		measured++;
		if (fitting.length === 0 || shifted.length > 0) fail(`${condition.name}: safe centring moved fitting ceilings: ${shifted.map((one) => one.component).join(', ') || 'none fit'}`);
		else pass(`${condition.name.padEnd(13)} ${fitting.length} fitting ceilings where plain centring draws them`);
		// 10.
		for (const one of now.pools) {
			if (one.gap === null) continue;
			measured++;
			const want = one.typed ? 3 : 2;
			if (Math.abs(one.gap - want) > 0.3) fail(`${condition.name}: ${one.component}'s ${one.typed ? 'typed' : 'calculated'} ceiling sits ${one.gap}px from its slash, not ${want}`);
		}
		const typedGaps = now.pools.filter((one) => one.typed && one.gap !== null);
		if (typedGaps.length === 0) fail(`${condition.name}: no typed ceiling measured`);
		else pass(`${condition.name.padEnd(13)} slash gaps: typed ${[...new Set(typedGaps.map((one) => one.gap))].join(', ')}, calculated ${[...new Set(now.pools.filter((one) => !one.typed && one.gap !== null).map((one) => one.gap))].join(', ')}`);
		const regimes = now.pools.filter((one, at) => one.regime !== was.pools[at]?.regime);
		measured++;
		if (regimes.length > 0) fail(`${condition.name}: ${regimes.map((one) => one.component).join(', ')} changed regime`);
		else pass(`${condition.name.padEnd(13)} no Pool changes regime (${now.pools.length} Pools: ${[...new Set(now.pools.map((one) => one.regime))].join(', ')})`);
		// 12, the widths that must not move.
		const compared = now.pills.filter((one) => condition.sheet === 0 || one.tile);
		const movedPills = compared.filter((one) => {
			const before = was.pills.find((other) => other.label === one.label);
			return before === undefined || Math.abs(before.width - one.width) > 0.05;
		});
		measured++;
		if (compared.length === 0 || movedPills.length > 0) fail(`${condition.name}: pills moved: ${movedPills.map((one) => one.label).join(', ') || 'none compared'}`);
		else pass(`${condition.name.padEnd(13)} ${compared.length} ${condition.sheet === 0 ? 'own-value pills' : 'Card set tile pills'} at the baseline's width`);
		// 14 and 15.
		for (const [at, one] of now.pools.entries()) {
			if (one.temp === null) continue;
			measured++;
			if (!one.wrapped && Math.abs(one.temp - 32) > 0.5) fail(`${condition.name}: ${one.component}'s unwrapped temp pill is ${one.temp}px tall, not 32`);
			if (condition.text === 0 && one.field < 20) fail(`${condition.name}: ${one.component}'s points field is ${one.field}px tall, under 20`);
		}
		// A typed ceiling 6px narrower can come back onto its number's line,
		// which shortens its card, and with it the grid rows it shares: those
		// are row 6's doing, named and printed, never the pill's.
		const rowsMeet = (a, b) => a !== null && b !== null && a.grid === b.grid && a.start < b.end && b.start < a.end;
		const reach = now.pools
			.filter((one, at) => one.ceilWraps !== was.pools[at]?.ceilWraps)
			.map((one) => one.rows);
		for (let grown = true; grown; ) {
			grown = false;
			for (const cell of now.cells) {
				if (reach.some((rows) => rowsMeet(rows, cell)) && !reach.some((rows) => rows.grid === cell.grid && rows.start <= cell.start && rows.end >= cell.end)) {
					reach.push(cell);
					grown = true;
				}
			}
		}
		const unwrapped = now.pools.filter((one) => one.wrapped !== true);
		const movedBy = (one) => {
			const before = was.pools.find((other) => other.component === one.component);
			return before === undefined || Math.abs(before.height - one.height) > 0.05;
		};
		const grew = unwrapped.filter((one) => movedBy(one) && !reach.some((rows) => rowsMeet(rows, one.rows)));
		for (const one of unwrapped.filter((one) => movedBy(one) && !grew.includes(one))) {
			moved++;
			const before = was.pools.find((other) => other.component === one.component);
			console.log(
				`moved    ${condition.name.padEnd(13)} ${one.component}: card ${before.height} -> ${one.height}, in grid rows a typed ceiling unwrapped in (${now.pools.filter((p, at) => p.ceilWraps !== was.pools[at]?.ceilWraps).map((p) => p.component).join(', ')})`,
			);
		}
		measured++;
		if (grew.length > 0) fail(`${condition.name}: unwrapped Pools moved: ${grew.map((one) => one.component).join(', ')}`);
		else pass(`${condition.name.padEnd(13)} ${unwrapped.length - unwrapped.filter(movedBy).length} Pools with no wrapped pill at the baseline's height${unwrapped.some(movedBy) ? `, ${unwrapped.filter(movedBy).length} moved by row 6 (above)` : ''}; pills ${[...new Set(now.pools.filter((one) => one.temp !== null).map((one) => `${one.temp} tall, field ${one.field}`))].join('; ')}`);
		// 12, Carried at its own two units.
		if (condition.sheet === 520 && condition.text === 24) {
			const carried = await browser.evaluate(pillShows('carried', '100'));
			measured++;
			if (!carried.whole) fail(`${condition.name}: Carried's 100 clips (${carried.digits} in ${carried.inner})`);
			else pass(`${condition.name.padEnd(13)} two-unit Carried shows 100 whole (${carried.digits} in ${carried.inner})`);
		}
		await unstage();
	}
	if (condition.sheet !== 520) continue;
	// The one-unit cells: 11 and 12.
	{
		const query = `${base}&place=hit_points:5,1&place=rolled_health:10,1&place=load:11,1`;
		const { unstage } = await loadStaged(browser, `file://${root}index.html?${query}`, { width: 1400, height: 1900 });
		const ceilings = await browser.evaluate(ceilingsAt120);
		const bound = RESIDUE_BOUND[condition.text];
		const calc = ceilings.hit_points;
		const typed = ceilings.rolled_health;
		measured++;
		const why = [];
		if (!typed.typed || calc.typed) why.push('the staging moved: Rolled HP should own its ceiling, Hit points not');
		if (Math.abs(typed.width - calc.width - 2) > 0.3) why.push(`typed ${typed.width} against calculated ${calc.width}, not 2px wider`);
		if (calc.end > bound.calculated + 0.05) why.push(`calculated passes by ${calc.end}, over ${bound.calculated}`);
		if (typed.end > bound.typed + 0.05) why.push(`typed passes by ${typed.end}, over ${bound.typed}`);
		// Ruling A: the overflow clips at its end, never at its slash.
		for (const [name, one] of [['calculated', calc], ['typed', typed]]) {
			if (one.start > 0.5) why.push(`${name} starts ${one.start}px before the content, so it overflows its start`);
			if (!one.inkWhole) why.push(`${name}'s slash is cut by the card's clip`);
		}
		if (why.length > 0) fail(`${condition.name} one-unit /120: ${why.join('; ')}`);
		else console.log(`residue  ${condition.name.padEnd(13)} one-unit /120 passes the content at its end by ${calc.end} calculated (${calc.width} wide), ${typed.end} typed (${typed.width}), within ${bound.calculated} and ${bound.typed}; both slashes' ink whole`);
		// What renders, as against the box: the card clips the ceiling at its
		// border's inner edge, 8px of padding past the content box a side.
		console.log(
			`residue  ${condition.name.padEnd(13)} one-unit /120 drawn: calculated ${calc.visible} of ${calc.width} (${calc.clipped} clipped, slash ${calc.slash}% seen, ${calc.digits} digits),` +
				` typed ${typed.visible} of ${typed.width} (${typed.clipped} clipped, slash ${typed.slash}% seen, ${typed.digits} digits)`,
		);
		if (condition.text === 0) {
			const load = await browser.evaluate(pillShows('load', '0'));
			await browser.evaluate(swapStyles(baselineCss));
			const loadWas = await browser.evaluate(pillShows('load', '0'));
			await browser.evaluate(swapStyles(null));
			measured++;
			const loadWhy = [];
			if (!load.whole) loadWhy.push(`0 clips (${load.digits} in ${load.inner})`);
			if (load.over > 0.5) loadWhy.push(`the pill passes the card by ${load.over}`);
			if (Math.abs(load.height - loadWas.height) > 0.05) loadWhy.push(`card ${load.height} tall against ${loadWas.height}`);
			if (loadWhy.length > 0) fail(`${condition.name} one-unit Load: ${loadWhy.join('; ')}`);
			else pass(`${condition.name.padEnd(13)} one-unit Load shows 0 whole (${load.digits} in ${load.inner}), pill inside the card, card ${load.height} tall as before`);
		}
		await unstage();
	}
	// 16, the stuck scroll: `120` typed into the one-unit typed ceiling by
	// `&type=`, which focuses it, commits and blurs, as a player's edit does.
	// The card is \`overflow: clip\`, so the focus has no scroll container to
	// move; under \`hidden\` it scrolled the card to the caret and left it there,
	// cutting the slash. Then the same with \`hidden\` put back and the focus
	// repeated, so a check that cannot see the scroll fails too.
	{
		const TYPED = ".sheetsmith-pool-max-input[aria-label='Rolled HP maximum']";
		const query = `${base}&place=rolled_health:10,1&type=${encodeURIComponent(`${TYPED}|120`)}`;
		const { unstage } = await loadStaged(browser, `file://${root}index.html?${query}`, { width: 1400, height: 1900 });
		const scroll = await browser.evaluate(`(() => {
			const card = document.querySelector('[data-sheetsmith-component="rolled_health"] .sheetsmith-pool');
			const field = card.querySelector(${JSON.stringify(TYPED)});
			const after = card.scrollLeft;
			const typed = field.value;
			const style = document.createElement('style');
			style.textContent = '.sheetsmith-view .sheetsmith-pool { overflow: hidden !important; }';
			document.head.append(style);
			field.focus();
			field.setSelectionRange(field.value.length, field.value.length);
			field.blur();
			const hidden = card.scrollLeft;
			style.remove();
			card.scrollLeft = 0;
			return { after, typed, hidden };
		})()`);
		measured++;
		if (scroll.typed !== '120') fail(`${condition.name}: the stuck-scroll staging did not take (${scroll.typed})`);
		else if (scroll.after !== 0) fail(`${condition.name}: an edited one-unit ceiling leaves its card scrolled ${scroll.after}px`);
		else if (scroll.hidden === 0) fail(`${condition.name}: the stuck-scroll check cannot see a scroll (none under overflow: hidden either)`);
		else pass(`${condition.name.padEnd(13)} an edited one-unit ceiling leaves its card at scrollLeft 0 (${scroll.hidden}px under overflow: hidden)`);
		await unstage();
	}
	// The wrapped pill: 13.
	{
		const { unstage } = await loadStaged(browser, `file://${root}index.html?${base}${reported(2)}`, { width: 1400, height: 1900 });
		await browser.evaluate(checkPlaced('hit_points', 2, true));
		const now = await browser.evaluate(fitPlain);
		await browser.evaluate(swapStyles(baselineCss));
		const was = (await browser.evaluate(fitPlain)).pools.find((one) => one.component === 'hit_points');
		await browser.evaluate(swapStyles(null));
		const hp = now.pools.find((one) => one.component === 'hit_points');
		measured++;
		if (hp?.wrapped !== true) fail(`${condition.name}: Hit points' pill did not wrap at two units`);
		else if (Math.abs(hp.between - hp.above) > 3) fail(`${condition.name}: wrapped Temp → value ${hp.between} against ${hp.above} above Temp (before ${was.between}, pill ${was.temp} → ${hp.temp})`);
		else pass(`${condition.name.padEnd(13)} wrapped pill: ${hp.above} above Temp, ${hp.between} Temp → value, pill ${hp.temp} tall, card ${hp.height}, field ${hp.field}; before ${was.above}, ${was.between}, ${was.temp}, ${was.height}, ${was.field}`);
		await unstage();
	}
}

await browser.close();
if (measured === 0) {
	console.log('FAIL  measured no headline: the sample or the selectors moved');
	process.exit(1);
}
console.log(
	`\n${measured} measured, ${failed} failed, ${residue} printed as the one-unit Pool ceiling residue, ${moved} as an expected card-height move`,
);
process.exit(failed === 0 ? 0 : 1);
