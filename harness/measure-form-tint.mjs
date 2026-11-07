/*
 * The contrast table `docs/features/form-tint-colour.md` makes a criterion, as a
 * script a reviewer can run again: not shipped, and not a test, because it needs
 * a browser. Run `npm run harness` first (with a calibrated
 * `obsidian.generated.css` for the default theme's own values), then
 *
 *   node harness/measure-form-tint.mjs
 *
 * It loads the forms sheet with Brown Bear in play once per colour per theme
 * (`&tint=<colour>`) and reads the browser's computed colours off the real pill
 * and the box under it, so every `color-mix` is the browser's and not this
 * script's. The only arithmetic here is the 12% fill laid over the card, which
 * is a layer the browser composites rather than a colour it computes, and the
 * WCAG contrast ratio. It prints the spec's table and checks:
 *
 *  - tag text on the tag fill at least 4.5:1;
 *  - the edge at least 3:1 against the card, the tinted card, the tag fill and
 *    the page (WCAG 1.4.11).
 *
 * Exits non-zero on any failure, and on measuring no tag at all. **It holds for
 * the theme the harness carries only**: a community theme redefines the named
 * colours, and is not measured.
 */
import { fileURLToPath } from 'node:url';
import { CHROME, launch, loadStaged } from './cdp.mjs';
import { TINT_COLOURS } from './tint-colours.mjs';

if (!CHROME) {
	console.error('No Chrome-family browser found.');
	process.exit(1);
}
const root = fileURLToPath(new URL('.', import.meta.url));

/*
 * In the page: the first card-borne tag and the box it rides, and each theme
 * value resolved by a probe in that box, so a variable reads as the box reads it.
 */
const measure = `(() => {
	const pill = document.querySelector(".sheetsmith-in-play-mark[aria-hidden='true']:not(.sheetsmith-in-play-mark-inline)");
	if (pill === null) return null;
	const box = pill.parentElement;
	const probe = (expression) => {
		const el = document.createElement('div');
		el.style.color = expression;
		box.appendChild(el);
		const said = getComputedStyle(el).color;
		el.remove();
		return said;
	};
	const style = getComputedStyle(pill);
	return {
		attribute: pill.getAttribute('data-sheetsmith-tint'),
		colour: probe('var(--sheetsmith-tint)'),
		onAccent: probe('var(--text-on-accent)'),
		card: probe('var(--background-secondary)'),
		page: probe('var(--background-primary)'),
		normal: probe('var(--text-normal)'),
		muted: probe('var(--text-muted)'),
		tagText: style.color,
		tagFill: style.backgroundColor,
		edge: style.outlineColor,
	};
})()`;

/** `rgb()`, `rgba()` or `color(srgb …)` as [r, g, b] in 0..1. */
function parse(css) {
	const srgb = /color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)/.exec(css);
	if (srgb) return [Number(srgb[1]), Number(srgb[2]), Number(srgb[3])];
	const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(css);
	if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
	throw new Error(`cannot read the colour ${css}`);
}

const hex = (c) => `#${c.map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`;

function luminance(c) {
	const [r, g, b] = c.map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/** The box's fill, `color-mix(in srgb, tint 12%, transparent)`, laid over the card. */
const over = (tint, card, share = 0.12) => card.map((x, i) => x * (1 - share) + tint[i] * share);

const two = (n) => n.toFixed(2);

const browser = await launch(['--window-size=1400,1500']);
let failed = 0;
let measured = 0;
console.log(
	'| Theme | Colour | Value | Today: white on colour | Tag text on tag fill | Edge vs card | Edge vs tinted card | Edge vs tag fill | Edge vs page | Value text on tinted card | Muted text on tinted card |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const theme of ['light', 'dark']) {
	for (const colour of TINT_COLOURS) {
		const { unstage } = await loadStaged(
			browser,
			`file://${root}index.html?surface=sheet&theme=${theme}&state=forms&tint=${colour}`,
			{ width: 1400, height: 1500 },
		);
		const read = await browser.evaluate(measure);
		await unstage();
		if (read === null || read.attribute !== colour) {
			failed++;
			console.log(`| ${theme} | ${colour} | FAIL: no tag drawn in this colour (${read?.attribute ?? 'none'}) |`);
			continue;
		}
		measured++;
		const tint = parse(read.colour);
		const card = parse(read.card);
		const tinted = over(tint, card);
		const edge = parse(read.edge);
		const tagFill = parse(read.tagFill);
		const tag = contrast(parse(read.tagText), tagFill);
		const edges = [contrast(edge, card), contrast(edge, tinted), contrast(edge, tagFill), contrast(edge, parse(read.page))];
		const ok = tag >= 4.5 && edges.every((ratio) => ratio >= 3);
		if (!ok) failed++;
		console.log(
			`| ${theme} | ${colour} | \`${hex(tint)}\` | ${two(contrast(parse(read.onAccent), tint))} | ${two(tag)} | ${edges.map(two).join(' | ')} | ${two(contrast(parse(read.normal), tinted))} | ${two(contrast(parse(read.muted), tinted))} |${ok ? '' : ' FAIL'}`,
		);
	}
}
await browser.close();
if (measured === 0) {
	console.log('FAIL  measured no form tag: the sample or the selectors moved');
	process.exit(1);
}
console.log(`\n${measured} measured, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
