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
 *
 * **The baseline** is `styles.css` as the git ref `BASELINE` names (default
 * `HEAD`, the version branch before this feature lands), swapped in for the
 * built stylesheet on the same page with the same values in it. Compared only
 * where every headline fits, since the baseline has no rule for the mark. Once
 * the feature has landed `HEAD` holds it, so pass the ref before it to compare.
 *
 * **Printed and not failed**: check 8 for a one-unit Pool on the 520 sheet,
 * whose ceiling, at the sheet's qualifier size and not a headline, is wider
 * than the card (`docs/BACKLOG.md` § UI). Its lines are marked `residue`.
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
					console.log(
						`PASS     ${value.padEnd(12)} baseline: ${compared} headlines, width unchanged` +
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
				if (ceilingOut && isResidue) residue++;
				else if (ceilingOut) why.push('ceiling passes the card');
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
			else console.log(`PASS     one width, one size: ${line}`);
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
			} else console.log(`PASS     ${condition.name.padEnd(8)} Stat block uses / and ceiling at --font-ui-medium, ${uses.medium}`);
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
			console.log(`PASS     ${condition.name.padEnd(8)} ${sizes.borrowed.length} Track length fields and record ceilings at --font-ui-small`);
		}
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
