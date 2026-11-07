/*
 * The measurement `docs/features/stat-block-zones.md`'s first small fix makes a
 * criterion, as a script a reviewer can run again: not shipped, and not a test,
 * because it needs a browser. Run `npm run harness` first, then
 *
 *   node harness/measure-form-tag.mjs
 *
 * It loads the forms sheet with Brown Bear in play at `text=15` (the app's own
 * body size), `text=16` (the harness's default) and `text=24`. **The pill sits
 * on the box's bottom inline-end corner, its inside part exactly the box's
 * bottom padding**, so what is checked is geometry rather than a font's ink —
 * the ink measurement this script used to make passed in the harness at 2.1px
 * while the app's font touched. For every form tag on the sheet it prints:
 *
 *  - `content`: the box's content-box bottom less the pill's top, in px — how
 *    far the pill reaches into content, which must be 0 or less;
 *  - `overlap`: the most any element drawn in the box overlaps the pill, in px
 *    of height — a label, a value, a score pill, a note mark — which must be 0;
 *  - `gap`: the next box below's top less the pill's bottom, out of the
 *    sheet's 8px;
 *  - `same`: whether the tinted box is the height it is with the tint off.
 *
 * Checks: `content` at most 0.5, `overlap` 0, `gap` at least 3, `same` true.
 * Exits non-zero on any failure, and on measuring no pill at all.
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
	const out = [];
	for (const pill of document.querySelectorAll(".sheetsmith-in-play-mark[aria-hidden='true']:not(.sheetsmith-in-play-mark-inline)")) {
		// The drawn pill only: its screen-reader twin shares the class.
		const box = pill.parentElement;
		const p = pill.getBoundingClientRect();
		const b = box.getBoundingClientRect();
		const style = getComputedStyle(box);
		const contentBottom = b.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom);
		// Every leaf drawn in the box, the pill aside: what the pill must not cover.
		let overlap = 0;
		for (const el of box.querySelectorAll('*')) {
			if (el === pill || pill.contains(el) || el.children.length > 0) continue;
			const r = el.getBoundingClientRect();
			if (r.width === 0 || r.height === 0) continue;
			const x = Math.min(r.right, p.right) - Math.max(r.left, p.left);
			const y = Math.min(r.bottom, p.bottom) - Math.max(r.top, p.top);
			if (x > 0 && y > 0) overlap = Math.max(overlap, y);
		}
		let below = null;
		for (const other of document.querySelectorAll('.sheetsmith-cell')) {
			const r = other.getBoundingClientRect();
			if (r.top >= b.bottom - 0.5 && r.left < b.right && r.right > b.left) {
				if (below === null || r.top < below) below = r.top;
			}
		}
		const height = b.height;
		box.classList.remove('sheetsmith-in-play', 'sheetsmith-in-play-marked');
		pill.hidden = true;
		const plain = box.getBoundingClientRect().height;
		box.classList.add('sheetsmith-in-play', 'sheetsmith-in-play-marked');
		pill.hidden = false;
		out.push({
			label: pill.textContent,
			at: round(p.left) + ',' + round(p.top) + ' ' + round(p.width) + 'x' + round(p.height) + ' ' + box.tagName,
			box: box.querySelector('.sheetsmith-component-label, .sheetsmith-card-label')?.textContent ?? box.className,
			content: round(p.top - contentBottom),
			overlap: round(overlap),
			gap: below === null ? null : round(below - p.bottom),
			same: Math.abs(height - plain) < 0.5,
		});
	}
	return out;
})()`;

const browser = await launch(['--window-size=1400,1500']);
let failed = 0;
let measured = 0;
for (const text of [15, 16, 24]) {
	const { unstage } = await loadStaged(
		browser,
		`file://${root}index.html?surface=sheet&theme=light&state=forms&text=${text}`,
		{ width: 1400, height: 1500 },
	);
	console.log(`\n-- text=${text}`);
	for (const one of await browser.evaluate(measure)) {
		measured++;
		// `content` is the pill's top less the content box's bottom: 0 or more is clear.
		const ok = one.content >= -0.5 && one.overlap === 0 && (one.gap === null || one.gap >= 3) && one.same;
		if (!ok) failed++;
		console.log(
			`${ok ? 'PASS' : 'FAIL'}  ${String(one.box).padEnd(16)} content ${String(one.content).padStart(5)}` +
				`  overlap ${String(one.overlap).padStart(4)}  gap ${String(one.gap ?? '-').padStart(5)}  same ${one.same}  ${one.at}`,
		);
	}
	await unstage();
}
await browser.close();
if (measured === 0) {
	console.log('FAIL  measured no form tag: the sample or the selectors moved');
	process.exit(1);
}
console.log(`\n${measured} measured, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
