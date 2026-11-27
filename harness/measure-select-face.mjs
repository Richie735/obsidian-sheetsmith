/*
 * The measurement `docs/features/select-long-value.md` makes a criterion: **a
 * select's chosen value is drawn in a face the plugin ellipsises**, on every
 * family that takes one. Not shipped, and not a test, because it needs a
 * browser's layout. Run `npm run harness` first, then
 *
 *   node harness/measure-select-face.mjs
 *
 * It loads the `long-values` sheet with the modifier form open on the
 * `Circlet of the sage` row's typed part (the panel select, the card dropdown,
 * the record and cell menus), the forms sheet (the Stat block's in-play menu),
 * and the layout editor's own panel on `long-values` (a definition's
 * **Changes** and the other detail-field selects, and the promoted field's
 * **Value**). Each at a phone's 380, at 360 under the same staging (Chromium
 * drawn 20px narrower, standing in for WebKit's narrower select), and at 1400.
 *
 * For every face on the page it checks five things:
 *
 *  - `text`: the face's text is the chosen option's;
 *  - `overflow`: the face overflows (`scrollWidth > clientWidth`) exactly when
 *    the text is wider than the face's content box, by canvas `measureText` in
 *    the face's own font, and its computed `text-overflow` is `ellipsis`;
 *  - `edge`: the face's content box ends at or left of the select's, so the
 *    ellipsis stops short of the chevron the select's end padding reserves;
 *  - `hidden`: the select's computed `color` and `-webkit-text-fill-color`
 *    are both transparent, so nothing is drawn twice;
 *  - `box`: the stack's box is the select's box before the face, so the face
 *    adds no width. "Before" is the select unwrapped under the stylesheet of
 *    `BEFORE`, the release this feature was built on, which has no face.
 *
 * Then it sets `text-overflow: clip` on every select, which is what WebKit draws
 * whatever the stylesheet says, and checks every face is unchanged: its text,
 * its box and its overflow. And it squeezes each family's longest value into a
 * 72px stack and checks the face overflows and still ends inside the select's
 * text box, since the menus grow with their content and would otherwise never
 * be seen to ellipsise.
 *
 * A face that is not painted is left out: a closed record's, a hidden tab's,
 * and a Modifiers list field reserved with `visibility: hidden` in a box of no
 * height, whose select is squeezed there and never drawn.
 *
 * And it requires the staged long values to overflow where they are staged to:
 * the panel's **Value** and the card's dropdown at every width, and the
 * editor's **Changes** and promoted **Value** at the two phone widths (at
 * 1400 the editor gives both room). A family the page draws no face for is a
 * failure too.
 *
 * Prints, per family and width, the staged face's width (else the longest
 * face's), its select's width and whether it overflows, and exits non-zero on any failure.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CHROME, launch, loadStaged } from './cdp.mjs';

if (!CHROME) {
	console.error('No Chrome-family browser found.');
	process.exit(1);
}
const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * The last release with no face: `Release 0.11.0`, which this feature was built
 * on. Pinned to the hash rather than `HEAD` or `main`, which gain the face the
 * moment it lands and would then compare the stylesheet with itself.
 */
const BEFORE = '1b35d0ba54a1f2774205522b71eec43997f1dc74';
const beforeCss = execFileSync('git', ['show', `${BEFORE}:styles.css`], { cwd: fileURLToPath(new URL('..', import.meta.url)) }).toString();

/** The presses that open the form on the long-values row's one typed part. */
const OPEN_FORM =
	"press=.sheetsmith-table-modifier-button%5Baria-label%5E%3D'Circlet%20of%20the%20sage'%5D&press=.sheetsmith-panel-line%5Bdata-sheetsmith-part%3D'typed'%5D";

const pages = [
	{
		name: 'sheet',
		query: `surface=sheet&theme=light&state=long-values&bar=off&${OPEN_FORM}`,
		families: ['panel', 'card', 'record', 'cell'],
		staged: { panel: 'all', card: 'all' },
	},
	{ name: 'forms', query: 'surface=sheet&theme=light&state=forms', families: ['stat-block'], staged: {} },
	{
		name: 'editor',
		query: 'surface=editor&theme=light&state=long-values&open=::sheet::',
		families: ['detail-field', 'list-field'],
		staged: { 'detail-field': 'phone', 'list-field': 'phone' },
	},
];

const runs = [
	{ name: '380 phone', width: 380, platform: 'phone' },
	{ name: '360 phone', width: 360, platform: 'phone' },
	{ name: '1400', width: 1400, platform: null },
];

/** The text of the long-values staging, which the staged families must hold. */
const LONG = 'Saves and Perception · Perception';

const measure = (css) => `(() => {
	const round = (n) => Math.round(n * 10) / 10;
	const family = (face) => {
		const at = (selector) => face.closest(selector) !== null;
		if (at('.sheetsmith-panel')) return 'panel';
		if (at('.sheetsmith-card-dropdown')) return 'card';
		if (at('.sheetsmith-stat-block-menu')) return 'stat-block';
		if (at('.sheetsmith-record-menu')) return 'record';
		if (at('.sheetsmith-table-menu')) return 'cell';
		if (at('.sheetsmith-detail-field')) return 'detail-field';
		if (at('.sheetsmith-entry-row')) return 'list-field';
		return 'other';
	};
	const px = (style, prop) => parseFloat(style.getPropertyValue(prop)) || 0;
	const transparent = (value) => /^(transparent|rgba\\(0, 0, 0, 0\\))$/.test(value);
	const ctx = document.createElement('canvas').getContext('2d');
	const faces = Array.from(document.querySelectorAll('.sheetsmith-select-stack > .sheetsmith-select-face'))
		// A face whose select is not drawn has no box to check: a closed record, a
		// hidden tab, or a Modifiers list field reserved with \`visibility: hidden\`
		// in a zero-height box, whose select is squeezed and never painted.
		.filter((face) => face.parentElement.getBoundingClientRect().width > 0 && face.checkVisibility({ visibilityProperty: true }));
	const read = (face) => {
		const select = face.parentElement.querySelector(':scope > select');
		const f = face.getBoundingClientRect();
		const s = select.getBoundingClientRect();
		const fs = getComputedStyle(face);
		const ss = getComputedStyle(select);
		ctx.font = fs.font;
		// The card's -0.02em, which the canvas otherwise leaves out.
		ctx.letterSpacing = fs.letterSpacing === 'normal' ? '0px' : fs.letterSpacing;
		const content = face.clientWidth - px(fs, 'padding-left') - px(fs, 'padding-right');
		const natural = ctx.measureText(face.textContent).width;
		return {
			family: family(face),
			text: face.textContent,
			chosen: select.options[select.selectedIndex]?.text ?? '',
			faceWidth: round(f.width),
			selectWidth: round(s.width),
			overflow: face.scrollWidth > face.clientWidth,
			natural: round(natural),
			content: round(content),
			ellipsis: fs.textOverflow === 'ellipsis',
			faceEnd: f.right - px(fs, 'border-right-width') - px(fs, 'padding-right'),
			selectEnd: s.right - px(ss, 'border-right-width') - px(ss, 'padding-right'),
			color: ss.color,
			fill: ss.getPropertyValue('-webkit-text-fill-color'),
			hidden: transparent(ss.color) && transparent(ss.getPropertyValue('-webkit-text-fill-color')),
			stack: (() => {
				const r = face.parentElement.getBoundingClientRect();
				return [r.left, r.top, r.width, r.height].map(round);
			})(),
			faceBox: [f.left, f.top, f.width, f.height].map(round),
			scroll: face.scrollWidth,
		};
	};
	const now = faces.map(read);

	// The box before the face: every select unwrapped, under the old stylesheet.
	// The sheet's own 'disabled' rather than the link's, which reloads the
	// file asynchronously when it is put back.
	const link = document.querySelector('link[href="../styles.css"]').sheet;
	const old = document.createElement('style');
	old.textContent = ${JSON.stringify(css)};
	link.disabled = true;
	document.head.appendChild(old);
	const stacks = faces.map((face) => face.parentElement);
	const selects = stacks.map((stack) => stack.querySelector(':scope > select'));
	stacks.forEach((stack, at) => {
		stack.parentElement.insertBefore(selects[at], stack);
		stack.style.display = 'none';
	});
	const before = selects.map((select) => {
		const r = select.getBoundingClientRect();
		return [r.left, r.top, r.width, r.height].map(round);
	});
	stacks.forEach((stack, at) => {
		stack.insertBefore(selects[at], stack.firstChild);
		stack.style.display = '';
	});
	old.remove();
	link.disabled = false;

	// What WebKit draws: the select's own text clipped with no mark.
	for (const select of selects) select.style.textOverflow = 'clip';
	const clipped = faces.map(read);
	for (const select of selects) select.style.textOverflow = '';

	// Each family's longest value squeezed into 72px, so a family whose staging
	// gives every value room (the menus grow with their content) still shows
	// its face ellipsising inside the select's text box.
	const squeezed = new Map();
	for (const [at, one] of now.entries()) {
		const held = squeezed.get(one.family);
		if (held === undefined || one.natural > now[held].natural) squeezed.set(one.family, at);
	}
	const squeeze = new Map();
	for (const at of squeezed.values()) {
		const stack = stacks[at];
		stack.style.width = '72px';
		stack.style.flex = 'none';
		squeeze.set(at, read(faces[at]));
		stack.style.width = '';
		stack.style.flex = '';
	}

	return now.map((one, at) => ({ ...one, before: before[at], clipped: clipped[at], squeezed: squeeze.get(at) ?? null }));
})()`;

let failed = 0;
let lines = 0;
for (const run of runs) {
	for (const page of pages) {
		const browser = await launch();
		try {
			const { took } = await loadStaged(browser, `file://${root}index.html?${page.query}`, {
				width: run.width,
				height: 20000,
				platform: run.platform,
			});
			const label = `${run.name.padEnd(9)} ${page.name.padEnd(6)}`;
			if (took === false) {
				console.log(`${label} FAIL: platform not staged`);
				failed++;
				continue;
			}
			const faces = await browser.evaluate(measure(beforeCss));
			for (const name of page.families) {
				const ours = faces.filter((one) => one.family === name);
				const problems = [];
				if (ours.length === 0) problems.push('no face drawn');
				for (const one of ours) {
					const who = `"${one.text.slice(0, 24)}"`;
					if (one.text !== one.chosen) problems.push(`${who} text is not the chosen option's`);
					// Within a pixel the canvas and the layout may round apart, so
					// only a clear miss either way counts.
					const wider = one.natural - one.content;
					if (Math.abs(wider) > 1 && one.overflow !== wider > 0) {
						problems.push(`${who} overflow ${one.overflow} with text ${one.natural} in ${one.content}`);
					}
					if (!one.ellipsis) problems.push(`${who} no ellipsis`);
					if (one.faceEnd > one.selectEnd + 0.5) {
						problems.push(`${who} face ends ${(one.faceEnd - one.selectEnd).toFixed(1)}px past the select's text box`);
					}
					if (!one.hidden) problems.push(`${who} select text drawn (${one.color}, ${one.fill})`);
					if (one.stack.some((value, at) => Math.abs(value - one.before[at]) > 0.5)) {
						problems.push(`${who} stack ${one.stack.join(',')} against ${one.before.join(',')} before`);
					}
					const c = one.clipped;
					if (c.text !== one.text || c.scroll !== one.scroll || c.overflow !== one.overflow || c.faceBox.join() !== one.faceBox.join()) {
						problems.push(`${who} face changed under text-overflow: clip`);
					}
				}
				for (const one of ours) {
					const q = one.squeezed;
					if (q === null) continue;
					if (!q.overflow) problems.push(`"${q.text}" does not overflow squeezed into 72px`);
					if (q.faceEnd > q.selectEnd + 0.5) problems.push(`"${q.text}" squeezed face ends past the select's text box`);
				}
				const want = page.staged[name];
				const staged = ours.filter((one) => one.text.startsWith(LONG));
				if (want === 'all' || (want === 'phone' && run.platform === 'phone')) {
					if (staged.length === 0) problems.push('the long value is not staged');
					for (const one of staged) if (!one.overflow) problems.push(`"${one.text}" does not overflow`);
				}
				// The staged long value where the family holds one, else its longest.
				const shown = staged[0] ?? [...ours].sort((a, b) => b.natural - a.natural)[0];
				const said =
					shown === undefined
						? '—'
						: `face ${shown.faceWidth}px, select ${shown.selectWidth}px, ${shown.overflow ? 'overflows' : 'fits'} ("${shown.text.length > 40 ? `${shown.text.slice(0, 39)}…` : shown.text}")`;
				console.log(
					`${label} ${name.padEnd(12)} ${String(ours.length).padStart(3)} faces  ${said}${problems.length === 0 ? '' : `\n    FAIL: ${problems.join('\n    FAIL: ')}`}`,
				);
				lines++;
				if (problems.length > 0) failed++;
			}
		} finally {
			await browser.close();
		}
	}
}

console.log(`\n${lines - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
