/*
 * The measurement `docs/features/stat-block-zones.md`'s first small fix makes a
 * criterion, as a script a reviewer can run again: not shipped, and not a test,
 * because it needs a browser. Run `npm run harness` first, then
 *
 *   node harness/measure-form-tag.mjs
 *
 * It loads the forms sheet with Brown Bear in play at `text=15` (the app's own
 * body size), `text=16` (the harness's default) and `text=24`, and the
 * `forms-tint-pool` sheet, where the bear raises a Pool's ceiling so a tag lands
 * on a placed box rather than a card, and the `forms-tint-track` sheet, where
 * the bear lengthens a Track's run so a tag lands on a Track, and the
 * `forms-roster-score` sheet, where the Wolf adds to a Roster card's score and
 * to none of its rows, so the card carries its pill's tag at its corner; and
 * the forms sheet at a phone's 380, where a Roster's cards stack full width;
 * and the Druid's narrowest Roster card with Cat Form setting a ring, at
 * `text=15`, `16`, `20` and `24`, at 700 at `text=20` and at 380, where a
 * row's name cell has no slack for a tag laid over it, so the card carries the
 * tag at its bottom corner: on Stealth, the last row
 * (`modifier-states-roster-card`), on Acrobatics, a middle one (`-middle`), and
 * on both (`-two`). The same Roster as one narrow table
 * (`modifier-states-roster-band`) is a **known failure**: its row's tag stays
 * in the name cell and covers the label, which is `docs/BACKLOG.md`'s row on a
 * tag over a name cell with no room set aside. It prints `KNOWN` and does not
 * fail the run.
 * **A corner pill sits on its box's bottom
 * inline-end corner, its inside part exactly the box's bottom padding**, so
 * most of what is checked is geometry rather than a font's ink. For every
 * corner pill it prints:
 *
 *  - `content`: the box's content-box bottom less the pill's top, in px — how
 *    far the pill reaches into content, which must be 0 or less;
 *  - `overlap`: the most any element drawn in the box overlaps the pill, in px
 *    of height — a label, a value, a score pill, a note mark, a Pool's bar —
 *    which must be 0;
 *  - `gap`: the next box below's top less the pill's bottom, out of the
 *    sheet's 8px;
 *  - `same`: whether the tinted box is the height it is with the tint off;
 *  - `score`: on a Roster card holding rows, the pill's top less the score
 *    pill's bottom, which must be more than 0 — a row's tag rides the card's
 *    bottom corner, opposite the score, never the corner beside it;
 *  - `clipped`: how much of the pill, in px of height, an ancestor that
 *    clips its overflow cuts off, which must be 0;
 *  - `height`: the pill's height, 16px on a card or a placed box: 12px of line,
 *    2px of block padding either side, the box's bottom padding plus the 6px
 *    that hangs into the gap (`docs/features/form-tint-colour.md`).
 *
 * A Pool's tag sits in the box's top inline-start corner instead, inside it,
 * where `content` and `gap` do not apply and `overlap` is what keeps it off the
 * label (`docs/features/form-tint-colour.md`).
 *
 * On a row's pill, which rides one line of its row:
 *
 *  - `cover`: how far, in px of width, it covers any text drawn on that row
 *    (a label, a band's name, a reading), which must be 0.
 *
 * And for every pill, a row's included:
 *
 *  - `ink`: the least room, in px, between the letters' ink and the inner side
 *    of the pill's 2px edge, above or below, from the font's own metrics
 *    (canvas `measureText`) set on the pill's real baseline;
 *  - `side`: the same at the inline start and end, the text's origin from a
 *    range over it, and a clipped name's end taken at the content edge, where
 *    its ellipsis stops.
 *
 * Checks: `content` at most 0.5 and `gap` at least 3 on a bottom-corner pill;
 * `overlap` 0, `same` true, `clipped` 0, `height` 16 on any corner pill, and
 * `score` above 0 on a Roster card holding rows; `cover` 0 on a row's pill;
 * `ink` at least 1 and `side` at least 3 on every pill.
 * Exits non-zero on any failure outside a known one, and on measuring no pill
 * at all.
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
	for (const pill of document.querySelectorAll(".sheetsmith-in-play-mark[aria-hidden='true']")) {
		const inline = pill.classList.contains('sheetsmith-in-play-mark-inline');
		// The drawn pill only: its screen-reader twin shares the class.
		const box = pill.parentElement;
		const p = pill.getBoundingClientRect();
		const b = box.getBoundingClientRect();
		const style = getComputedStyle(box);
		const contentBottom = b.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom);
		// Every leaf drawn in the box, the pill aside: what the pill must not cover.
		let overlap = 0;
		for (const el of box.querySelectorAll('*')) {
			// A leaf, or a container that paints a surface of its own — a Pool's
			// bar is one, its fill a child of it.
			const painted = !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(getComputedStyle(el).backgroundColor);
			if (el === pill || pill.contains(el) || (el.children.length > 0 && !painted)) continue;
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
		// The ink's room inside the edge: the baseline from a zero-height
		// inline-block, the ink's extent from the font's own metrics.
		const pillStyle = getComputedStyle(pill);
		// How much of the outline is drawn inside the pill: all of it at an
		// offset of minus its width.
		const edge = Math.min(parseFloat(pillStyle.outlineWidth), Math.max(0, -parseFloat(pillStyle.outlineOffset)));
		const probe = document.createElement('span');
		probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
		pill.appendChild(probe);
		const baseline = probe.getBoundingClientRect().bottom;
		probe.remove();
		const ctx = document.createElement('canvas').getContext('2d');
		ctx.font = pillStyle.font;
		const metrics = ctx.measureText(pill.textContent);
		const ink = Math.min(
			baseline - metrics.actualBoundingBoxAscent - (p.top + edge),
			p.bottom - edge - (baseline + metrics.actualBoundingBoxDescent),
		);
		const range = document.createRange();
		range.selectNodeContents(pill);
		const origin = range.getBoundingClientRect().left;
		const contentRight = p.right - parseFloat(pillStyle.paddingRight);
		const side = Math.min(
			origin - metrics.actualBoundingBoxLeft - (p.left + edge),
			p.right - edge - Math.min(origin + metrics.actualBoundingBoxRight, contentRight),
		);
		if (inline) {
			// How far, in px of width, the pill covers any text drawn on its row —
			// a label, a band's name, a reading — its own words and a
			// screen-reader twin aside: what laying it over a name cell with no
			// slack did to a narrow Roster card's label.
			let cover = 0;
			const row = pill.closest('tr');
			const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
			for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
				if (pill.contains(node) || node.textContent.trim() === '' || node.parentElement.closest('.sheetsmith-sr-only')) continue;
				const range = document.createRange();
				range.selectNodeContents(node);
				for (const r of range.getClientRects()) {
					const x = Math.min(r.right, p.right) - Math.max(r.left, p.left);
					const y = Math.min(r.bottom, p.bottom) - Math.max(r.top, p.top);
					if (x > 0 && y > 0) cover = Math.max(cover, x);
				}
			}
			out.push({
				inline: true,
				box: row?.querySelector('th, .sheetsmith-group-heading')?.textContent?.replace(pill.textContent, '').trim() || 'row',
				at: round(p.left) + ',' + round(p.top) + ' ' + round(p.width) + 'x' + round(p.height) + ' ROW',
				cover: round(cover),
				ink: round(ink),
				side: round(side),
			});
			continue;
		}
		// How much of the pill an ancestor's overflow cuts off, in px of height:
		// a box that clips its children clips the half that hangs below it.
		let clipped = 0;
		for (let el = pill.parentElement; el !== null && el !== document.body; el = el.parentElement) {
			if (getComputedStyle(el).overflowY === 'visible') continue;
			const r = el.getBoundingClientRect();
			clipped = Math.max(clipped, Math.max(0, p.bottom - r.bottom), Math.max(0, r.top - p.top));
		}
		// A Roster card holding rows: where a row's tag rides, which must be
		// the end away from the score. A Card's own value pill sits at its foot
		// by design and is not what this asks.
		const scorePill = box.querySelector('tr') === null ? null : box.querySelector('.sheetsmith-card-value');
		const score = scorePill === null ? null : p.top - scorePill.getBoundingClientRect().bottom;
		const height = b.height;
		// Only the classes the box carries: a Roster card carries the tag for
		// its score's pill and takes no tint, so it has the second alone.
		const held = ['sheetsmith-in-play', 'sheetsmith-in-play-marked'].filter((cls) => box.classList.contains(cls));
		box.classList.remove(...held);
		pill.hidden = true;
		const plain = box.getBoundingClientRect().height;
		box.classList.add(...held);
		pill.hidden = false;
		out.push({
			label: pill.textContent,
			at: round(p.left) + ',' + round(p.top) + ' ' + round(p.width) + 'x' + round(p.height) + ' ' + box.tagName,
			box: box.querySelector('.sheetsmith-component-label, .sheetsmith-card-label')?.textContent ?? box.className,
			// A Pool's tag sits in its top corner, inside the box, where content
			// and gap mean nothing: what keeps it off the label is overlap.
			top: p.top + p.height / 2 < b.top + b.height / 2,
			content: round(p.top - contentBottom),
			overlap: round(overlap),
			gap: below === null ? null : round(below - p.bottom),
			same: Math.abs(height - plain) < 0.5,
			height: round(p.height),
			ink: round(ink),
			side: round(side),
			clipped: round(clipped),
			score: score === null ? null : round(score),
		});
	}
	return out;
})()`;

const browser = await launch(['--window-size=1400,1500']);
let failed = 0;
let measured = 0;
const runs = [
	...[15, 16, 24].map((text) => ({ state: 'forms', text })),
	// A score-only push on a Roster card, and the cards stacked at a phone's.
	...[15, 16, 24].map((text) => ({ state: 'forms-roster-score', text })),
	...[15, 16, 24].map((text) => ({ state: 'forms', text, width: 380 })),
	// Cat Form on a ring in the Druid's narrowest Roster card, and the same
	// Roster as one table two columns wide: name cells with no slack. At 700
	// too, where a Text 20 card is its 235px floor wide, against about 450px
	// in the 1400 frame, whose wider card gives the name cell slack.
	...[
		'modifier-states-roster-card',
		'modifier-states-roster-card-middle',
		'modifier-states-roster-card-two',
		'modifier-states-roster-band',
	].flatMap((state) => {
		const known =
			state === 'modifier-states-roster-band'
				? "docs/BACKLOG.md, \"A form's tag covers a name in a Table's or a Roster table's row\""
				: undefined;
		return [
			...[15, 16, 20, 24].map((text) => ({ state, text, known })),
			{ state, text: 20, width: 700, known },
			{ state, text: 16, width: 380, known },
		];
	}),
	{ state: 'forms-tint-pool', text: 16, tint: 'orange' },
	{ state: 'forms-tint-track', text: 16, tint: 'orange' },
];
let knownFailed = 0;
for (const { state, text, tint, width, known } of runs) {
	const { unstage } = await loadStaged(
		browser,
		`file://${root}index.html?surface=sheet&theme=light&state=${state}&text=${text}${tint ? `&tint=${tint}` : ''}${width ? `&width=${width}` : ''}`,
		{ width: width ?? 1400, height: width ? 3800 : 1500 },
	);
	console.log(`\n-- state=${state} text=${text}${width ? ` width=${width}` : ''}${known ? `  (known failure: ${known})` : ''}`);
	for (const one of await browser.evaluate(measure)) {
		measured++;
		const inked = one.ink >= 1 && one.side >= 3;
		// `content` is the pill's top less the content box's bottom: 0 or more is clear.
		const ok = one.inline
			? inked && one.cover === 0
			: inked &&
				(one.top || one.content >= -0.5) &&
				one.overlap === 0 &&
				(one.top || one.gap === null || one.gap >= 3) &&
				one.same &&
				one.clipped === 0 &&
				(one.score === null || one.score > 0) &&
				Math.abs(one.height - 16) < 0.5;
		if (!ok && known) knownFailed++;
		else if (!ok) failed++;
		const where = one.inline
			? `row cover ${String(one.cover).padStart(4)}${' '.repeat(58)}`
			: `content ${(one.top ? 'top' : String(one.content)).padStart(5)}  overlap ${String(one.overlap).padStart(4)}` +
				`  gap ${(one.top ? '-' : String(one.gap ?? '-')).padStart(5)}  same ${String(one.same).padEnd(5)}  height ${String(one.height).padStart(4)}` +
				`  clipped ${String(one.clipped).padStart(4)}  score ${String(one.score ?? '-').padStart(5)}`;
		console.log(
			`${ok ? 'PASS' : known ? 'KNOWN' : 'FAIL'}  ${String(one.box).padEnd(16)} ${where}` +
				`  ink ${String(one.ink).padStart(4)}  side ${String(one.side).padStart(4)}  ${one.at}`,
		);
	}
	await unstage();
}
await browser.close();
if (measured === 0) {
	console.log('FAIL  measured no form tag: the sample or the selectors moved');
	process.exit(1);
}
console.log(`\n${measured} measured, ${failed} failed, ${knownFailed} known failures`);
process.exit(failed === 0 ? 0 : 1);
