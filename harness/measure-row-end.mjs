/*
 * The measurement `docs/features/table-row-end-room.md` makes its criteria, as
 * a script a reviewer can run again: not shipped, and not a test, because it
 * needs a browser. Run `npm run harness` first, then
 *
 *   node harness/measure-row-end.mjs
 *
 * It loads `modifier-states-ring-end` (three tables ending on a ring, Cat Form
 * in play on one row of each, so the tag lane shows), its form-off twin
 * `modifier-states-ring-end-off` (the same tables with no lane), and
 * `modifier-states` (the `?` Totals on Perception and Medicine beside numeric
 * neighbours), each at `text=16`, `20` and `24`, light. For every table, and
 * every **slotted column** in it — a column whose cells hold a note mark or a
 * row's state door anywhere, which `reserveNoteSlots` stamps — it prints:
 *
 *  - `glyph`: the spread, in px, of the door and mark inline starts down the
 *    column, which must be at most 1;
 *  - `value`: the spread of the body values' centres (a ring, a number, a `?`,
 *    a field), which must be at most 1;
 *  - `slot`: the most any empty slot's reserve start — the cell's content-box
 *    end plus the slot's 2px gap — sits from where the column's glyphs start,
 *    which must be at most 1 where the column holds a glyph;
 *  - `head` and `foot`: the heading's text centre and the foot cell's value
 *    centre less the body values' mean centre, each at most 1 in size where the
 *    column has one (a hidden heading has no text on screen and is skipped). A
 *    heading wider than its widest value is marked `(wide)` and its offset is
 *    printed and not checked: it may sit up to half a slot off its values,
 *    the spec's exception (`docs/features/table-row-end-room.md`);
 *  - `digits`: on a glyph after a number, its centre less the digits' centre
 *    (the baseline less half the cap height, from the cell's own font), which
 *    the criterion holds within 0.5px of what the tree before this work
 *    measured — printed, not checked, since the comparison is with another
 *    tree;
 *  - `height`: whether every body row holding a glyph after a number is the
 *    height of a row without one;
 *  - `hit`: on a glyph after a ring, whether `elementFromPoint` 1px inside its
 *    inline start returns the glyph rather than the ring's outward reach.
 *
 * Exits non-zero on any failed check, and on measuring no slotted column.
 */
import { fileURLToPath } from 'node:url';
import { CHROME, launch, loadStaged } from './cdp.mjs';

if (!CHROME) {
	console.error('No Chrome-family browser found.');
	process.exit(1);
}
const root = fileURLToPath(new URL('.', import.meta.url));

const measure = `(() => {
	const round = (n) => Math.round(n * 10) / 10;
	const GLYPH = '.sheetsmith-note-mark, .sheetsmith-state-door';
	const VALUE = '.sheetsmith-table-value, .sheetsmith-level-ring, .sheetsmith-table-input, .sheetsmith-table-menu';
	const glyphOf = (cell) => Array.from(cell.children).find((child) => child.matches(GLYPH)) ?? null;
	const valueOf = (cell) => Array.from(cell.children).find((child) => child.matches(VALUE)) ?? null;
	const centre = (el) => {
		const r = el.getBoundingClientRect();
		return r.left + r.width / 2;
	};
	/** The digits' vertical centre: the value's baseline less half its cap height. */
	const digitsCentre = (value) => {
		const probe = document.createElement('span');
		probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
		value.appendChild(probe);
		const baseline = probe.getBoundingClientRect().bottom;
		probe.remove();
		const ctx = document.createElement('canvas').getContext('2d');
		ctx.font = getComputedStyle(value).font;
		return baseline - ctx.measureText('0').actualBoundingBoxAscent / 2;
	};
	/** How wide a value is drawn: a number's text, which fills its box, or the control. */
	const drawnWidth = (value) => {
		if (!value.classList.contains('sheetsmith-table-value')) return value.getBoundingClientRect().width;
		const range = document.createRange();
		range.selectNodeContents(value);
		return range.getBoundingClientRect().width;
	};
	/** The width of the text drawn in a heading, its screen-reader-only words aside. */
	const headingWidth = (cell) => {
		let width = 0;
		const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
			if (node.textContent.trim() === '' || node.parentElement.closest('.sheetsmith-sr-only')) continue;
			const range = document.createRange();
			range.selectNodeContents(node);
			width += range.getBoundingClientRect().width;
		}
		return width;
	};
	/** The text drawn in a heading, its screen-reader-only words aside. */
	const headingCentre = (cell) => {
		let left = Infinity;
		let right = -Infinity;
		const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
			if (node.textContent.trim() === '' || node.parentElement.closest('.sheetsmith-sr-only')) continue;
			const range = document.createRange();
			range.selectNodeContents(node);
			const r = range.getBoundingClientRect();
			if (r.width === 0) continue;
			left = Math.min(left, r.left);
			right = Math.max(right, r.right);
		}
		return left === Infinity ? null : (left + right) / 2;
	};
	const spread = (list) => (list.length < 2 ? 0 : Math.max(...list) - Math.min(...list));
	const out = [];
	for (const table of document.querySelectorAll('.sheetsmith-table')) {
		const component = table.closest('[data-sheetsmith-component]')?.getAttribute('data-sheetsmith-component') ?? 'table';
		/** Cells by column position, per section. */
		const columns = new Map();
		for (const row of table.rows) {
			const section = row.parentElement.tagName.toLowerCase();
			let at = 0;
			for (const cell of row.cells) {
				if (cell.colSpan === 1) {
					const column = columns.get(at) ?? { thead: [], tbody: [], tfoot: [] };
					column[section]?.push(cell);
					columns.set(at, column);
				}
				at += cell.colSpan;
			}
		}
		for (const [at, column] of columns) {
			const body = column.tbody;
			const slotted = body.some((cell) => glyphOf(cell) !== null);
			if (!slotted) continue;
			const glyphs = body.map(glyphOf).filter((glyph) => glyph !== null);
			const starts = glyphs.map((glyph) => glyph.getBoundingClientRect().left);
			const values = body.map(valueOf).filter((value) => value !== null).map(centre);
			const mean = values.reduce((sum, x) => sum + x, 0) / Math.max(1, values.length);
			const doorStart = starts.length === 0 ? null : starts.reduce((sum, x) => sum + x, 0) / starts.length;
			let slot = 0;
			for (const cell of body) {
				if (glyphOf(cell) !== null || valueOf(cell) === null) continue;
				const r = cell.getBoundingClientRect();
				const style = getComputedStyle(cell);
				const contentEnd = r.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
				if (doorStart !== null) slot = Math.max(slot, Math.abs(contentEnd + 2 - doorStart));
			}
			const headCell = column.thead[0];
			const head = headCell === undefined ? null : headingCentre(headCell);
			// A heading wider than its values may sit off them (the spec's
			// exception): its offset is printed, never checked.
			const widest = Math.max(0, ...body.map(valueOf).filter((value) => value !== null).map(drawnWidth));
			const wide = head !== null && headingWidth(headCell) > widest + 0.5;
			const footCell = column.tfoot[0];
			const footValue = footCell === undefined ? null : valueOf(footCell);
			const foot = footValue === null ? null : centre(footValue);
			let digits = null;
			let height = true;
			let hit = true;
			// A table's last row draws no bottom rule, which a collapsed border
			// shares between two rows, so it is left out of the comparison.
			const last = (cell) => cell.parentElement.nextElementSibling === null;
			const tall = (cell) => cell.getBoundingClientRect().height;
			const plain = body.filter((cell) => glyphOf(cell) === null && !last(cell)).map(tall);
			for (const cell of body) {
				const glyph = glyphOf(cell);
				const value = valueOf(cell);
				if (glyph === null || value === null) continue;
				const g = glyph.getBoundingClientRect();
				if (value.classList.contains('sheetsmith-table-value')) {
					const off = g.top + g.height / 2 - digitsCentre(value);
					digits = digits === null || Math.abs(off) > Math.abs(digits) ? off : digits;
					const own = tall(cell);
					if (!last(cell) && plain.length > 0 && !plain.some((h) => Math.abs(h - own) < 0.5)) height = false;
				}
				if (value.classList.contains('sheetsmith-level-ring')) {
					const found = document.elementFromPoint(g.left + 1, g.top + g.height / 2);
					if (found?.closest(GLYPH) !== glyph) hit = false;
				}
			}
			const heading = headCell === undefined ? String(at) : (headingCentre(headCell) === null ? headCell.textContent.trim() || String(at) : headCell.textContent.trim());
			out.push({
				where: component + ' · ' + heading,
				glyph: round(spread(starts)),
				glyphs: glyphs.length,
				value: round(spread(values)),
				slot: doorStart === null ? null : round(slot),
				head: head === null ? null : round(head - mean),
				wide,
				foot: foot === null ? null : round(foot - mean),
				digits: digits === null ? null : round(digits),
				height,
				hit,
			});
		}
	}
	return out;
})()`;

const browser = await launch(['--window-size=1400,3800']);
let failed = 0;
let measured = 0;
// States named on the command line replace the default runs, at the three
// text sizes: `node harness/measure-row-end.mjs modifier-states-roster-card`.
const named = process.argv.slice(2);
const states = named.length > 0 ? named : ['modifier-states-ring-end', 'modifier-states-ring-end-off', 'modifier-states'];
const runs = [
	...states.flatMap((state) => [16, 20, 24].map((text) => ({ state, text }))),
	// The lane's reflow in a narrow sheet, on and off.
	...(named.length > 0
		? []
		: [
				{ state: 'modifier-states-ring-end', text: 16, width: 520 },
				{ state: 'modifier-states-ring-end-off', text: 16, width: 520 },
			]),
];
for (const { state, text, width } of runs) {
	const { unstage } = await loadStaged(
		browser,
		`file://${root}index.html?surface=sheet&theme=light&state=${state}&text=${text}${width ? `&width=${width}` : ''}`,
		{ width: 1400, height: 3800 },
	);
	console.log(`\n-- state=${state} text=${text}${width ? ` width=${width}` : ''}`);
	for (const one of await browser.evaluate(measure)) {
		measured++;
		const ok =
			one.glyph <= 1 &&
			one.value <= 1 &&
			(one.slot === null || one.slot <= 1) &&
			(one.head === null || one.wide || Math.abs(one.head) <= 1) &&
			(one.foot === null || Math.abs(one.foot) <= 1) &&
			one.height &&
			one.hit;
		if (!ok) failed++;
		console.log(
			`${ok ? 'PASS' : 'FAIL'}  ${one.where.padEnd(28)} glyph ${String(one.glyph).padStart(4)} (${one.glyphs})` +
				`  value ${String(one.value).padStart(4)}  slot ${String(one.slot ?? '-').padStart(4)}` +
				`  head ${String(one.head ?? '-').padStart(5)}${one.wide ? ' (wide)' : '       '}  foot ${String(one.foot ?? '-').padStart(5)}` +
				`  digits ${String(one.digits ?? '-').padStart(5)}  height ${String(one.height).padEnd(5)}  hit ${one.hit}`,
		);
	}
	await unstage();
}
await browser.close();
if (measured === 0) {
	console.log('FAIL  measured no slotted column: the samples or the selectors moved');
	process.exit(1);
}
console.log(`\n${measured} measured, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
