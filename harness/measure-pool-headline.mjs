/*
 * The measurements `docs/features/pool-headline-narrow-fit.md` makes a
 * criterion, as a script a reviewer can run again: not shipped, and not a test,
 * because it needs a browser. Run `npm run harness` first (it measures the
 * built bundle against the built `styles.css`), then
 *
 *   node harness/measure-pool-headline.mjs
 *
 * It drives Chrome over the DevTools Protocol through `cdp.mjs`, prints one line
 * per Pool per reading per condition, and exits non-zero if any Pool outside the
 * listed exclusions fails a check.
 *
 * The conditions: the sheet at 1400 and at a 520px container, each at the
 * default size and at `text=24`; a 380px container at `text=24`; a true 380
 * viewport under phone staging. And **the reported case**: Hit points' cell set
 * to `5 / span 1` with `100` in its temporary points, as the spec's scratch
 * measurement did, staged through the harness's own `&place=` and `&type=` as
 * the `pool-headline-reported` shots are: at 1400 and 520, default and
 * `text=24`, plus a two-unit span at 520. Every condition runs again with
 * `field-sizing` turned off and the field pinned at `width: 4ch`, which is what
 * an engine without it draws. Phone included: the staging is Chromium wearing
 * Obsidian's phone classes, and the real phone's WebKit is the engine without
 * it.
 *
 * The readings, injected into every Pool on the sheet: `6/9`, `10/54` and
 * `100/120`. The current goes into the value field and the ceiling into the
 * ceiling's numeral, a span where the layout calculates it and a field where
 * the character owns it, so both kinds are measured. A Pool with no ceiling
 * keeps none.
 *
 * Each line is the cell, the card's content box, the reading's row, the value
 * field and the ceiling widths, then whether the ceiling wrapped, how far the
 * reading passes the content box on its worse side (positive is clipped, the
 * card being `overflow: hidden`), the card's height and the temp pill's offset
 * from the card's top. Checks, per Pool and reading:
 *
 *  1. the value field and the ceiling (its dotted mark included) lie inside the
 *     card's content box, within half a pixel;
 *  2. the value field's `scrollWidth` does not exceed its `clientWidth`, so no
 *     digit is clipped inside its own box.
 *
 * **Excluded, printed and not failed** ("Deliberately not doing"): a one-unit
 * cell on a 520px sheet, narrower than one digit at the value size, and a
 * two-unit cell there at `text=24`, narrower than three. Their lines are
 * marked `excluded`.
 */
import { fileURLToPath } from 'node:url';
import { CHROME, launch, loadStaged } from './cdp.mjs';

if (!CHROME) {
	console.error('No Chrome-family browser found.');
	process.exit(1);
}
const root = fileURLToPath(new URL('.', import.meta.url));

const READINGS = [
	['6', '9'],
	['10', '54'],
	['100', '120'],
];

/** `sheet` is the container width the stage is held to, 0 for the window's. */
const CONDITIONS = [
	{ name: 'default 1400', sheet: 0, text: 0 },
	{ name: 'default 520', sheet: 520, text: 0 },
	{ name: 'text=24 1400', sheet: 0, text: 24 },
	{ name: 'text=24 520', sheet: 520, text: 24 },
	{ name: 'text=24 380', sheet: 380, text: 24 },
	{ name: 'phone 380', sheet: 0, text: 0, viewport: 380, platform: 'phone' },
	{ name: 'reported, default 1400', sheet: 0, text: 0, span: 1 },
	{ name: 'reported, text=24 1400', sheet: 0, text: 24, span: 1 },
	{ name: 'reported, default 520', sheet: 520, text: 0, span: 1 },
	{ name: 'reported, text=24 520', sheet: 520, text: 24, span: 1 },
	{ name: 'two-unit, default 520', sheet: 520, text: 0, span: 2 },
	{ name: 'two-unit, text=24 520', sheet: 520, text: 24, span: 2 },
];

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
const checkReported = (span) => `(() => {
	const field = document.querySelector(".sheetsmith-pool-current[aria-label='Hit points']");
	const card = field?.closest('.sheetsmith-pool');
	if (card) card.scrollLeft = 0;
	const placed = field?.closest('.sheetsmith-cell')?.style.gridColumn;
	const temp = document.querySelector(${JSON.stringify(TEMP)})?.value;
	if (placed !== '5 / span ${span}' || temp !== '100') {
		throw new Error('Reported staging did not take: ' + placed + ', temp ' + temp);
	}
	return true;
})()`;

/** Every visible Pool with the reading injected, measured. */
const measure = (current, ceiling) => `(() => {
	const round = (n) => Math.round(n * 10) / 10;
	const out = [];
	const cards = [...document.querySelectorAll('.sheetsmith-pool')];
	// Every Pool first, then every measurement: Pools share grid rows, so one
	// still holding its stored reading would set a row's height under another.
	for (const card of cards) {
		const field = card.querySelector('.sheetsmith-pool-current');
		if (field) field.value = ${JSON.stringify(current)};
		const max = card.querySelector('.sheetsmith-pool-max');
		if (max instanceof HTMLInputElement) max.value = ${JSON.stringify(ceiling)};
		else if (max) max.textContent = ${JSON.stringify(ceiling)};
	}
	for (const card of cards) {
		const box = card.getBoundingClientRect();
		if (box.width === 0) continue;
		const field = card.querySelector('.sheetsmith-pool-current');
		if (!field) continue;
		const style = getComputedStyle(card);
		const left = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
		const right = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
		const row = card.querySelector('.sheetsmith-pool-reading').getBoundingClientRect();
		const f = field.getBoundingClientRect();
		const ceil = card.querySelector('.sheetsmith-pool-ceiling');
		const c = ceil?.getBoundingClientRect() ?? null;
		const parts = [f, c, card.querySelector('.sheetsmith-pool-max-modified')?.getBoundingClientRect()]
			.filter(Boolean);
		const over = Math.max(...parts.map((r) => Math.max(left - r.left, r.right - right)));
		const pill = card.querySelector('.sheetsmith-pool-temp')?.getBoundingClientRect() ?? null;
		const cell = card.closest('.sheetsmith-cell');
		const span = /span (\\d+)/.exec(cell?.style.gridColumn ?? '')?.[1] ?? '?';
		const nested = cell?.parentElement?.closest('.sheetsmith-cell') !== null;
		out.push({
			label: field.getAttribute('aria-label'),
			span: Number(span),
			nested,
			cell: round(cell?.getBoundingClientRect().width ?? 0),
			content: round(right - left),
			row: round(row.width),
			field: round(f.width),
			ceil: c === null ? null : round(c.width),
			wraps: c !== null && c.top >= f.bottom - 1,
			over: round(over),
			clip: field.scrollWidth - field.clientWidth,
			height: round(box.height),
			pill: pill === null ? null : round(pill.top - box.top),
		});
	}
	return out;
})()`;

const browser = await launch(['--window-size=1400,1900']);
let failed = 0;
let measured = 0;

for (const fallback of [false, true]) {
	console.log(`\n== field-sizing ${fallback ? 'off (simulated)' : 'on'} ==`);
	for (const condition of CONDITIONS) {
		const viewport = condition.viewport ?? 1400;
		const query =
			`surface=sheet&theme=light&width=${condition.sheet}&text=${condition.text}` +
			(condition.span === undefined ? '' : reported(condition.span));
		const { took, unstage } = await loadStaged(browser, `file://${root}index.html?${query}`, {
			width: viewport,
			height: 1900,
			platform: condition.platform ?? null,
		});
		if (took === false) {
			failed++;
			console.log(`FAIL  ${condition.name}: phone staging did not take`);
			continue;
		}
		if (fallback) {
			await browser.evaluate(`(() => {
				const style = document.createElement('style');
				style.textContent = ${JSON.stringify(NO_FIELD_SIZING)};
				document.head.append(style);
			})()`);
		}
		if (condition.span !== undefined) await browser.evaluate(checkReported(condition.span));
		console.log(`\n-- ${condition.name}`);
		for (const [current, ceiling] of READINGS) {
			const pools = await browser.evaluate(measure(current, ceiling));
			for (const pool of pools) {
				// Only the moved Pool is the subject of a placement condition.
				if (condition.span !== undefined && pool.label !== 'Hit points') continue;
				measured++;
				const sheet = condition.sheet;
				const excluded =
					!pool.nested &&
					sheet === 520 &&
					(pool.span === 1 || (pool.span === 2 && condition.text === 24));
				const ok = pool.over <= 0.5 && pool.clip <= 0;
				if (!ok && !excluded) failed++;
				const verdict = excluded ? 'excluded' : ok ? 'PASS' : 'FAIL';
				console.log(
					`${verdict.padEnd(8)} ${`${current}/${ceiling}`.padEnd(7)} ${String(pool.label).padEnd(18)}` +
						` span ${String(pool.span).padEnd(2)} cell ${String(pool.cell).padStart(6)}` +
						` content ${String(pool.content).padStart(6)} row ${String(pool.row).padStart(6)}` +
						` field ${String(pool.field).padStart(6)} ceil ${String(pool.ceil ?? '-').padStart(5)}` +
						` ${pool.wraps ? 'wraps' : 'one line'.padEnd(5)} over ${String(pool.over).padStart(6)}` +
						` clip ${String(pool.clip).padStart(3)} height ${String(pool.height).padStart(6)}` +
						` pill ${String(pool.pill ?? '-').padStart(5)}`,
				);
			}
		}
		await unstage();
	}
}

await browser.close();
if (measured === 0) {
	console.log('FAIL  measured no Pool: the sample or the selectors moved');
	process.exit(1);
}
console.log(`\n${measured} measured, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
