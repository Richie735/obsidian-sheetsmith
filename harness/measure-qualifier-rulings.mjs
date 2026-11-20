/*
 * The measurements `docs/features/qualifier-fit-and-size.md` puts to the owner
 * before its two rulings, as a script a reviewer can run again: not shipped,
 * and not a test, because it needs a browser. Run `npm run harness` first, then
 *
 *   node harness/measure-qualifier-rulings.mjs [a|b]
 *
 * It prints and never fails. Each option is a candidate stylesheet injected
 * after the built `styles.css`, measured, then removed, so `src/` and the build
 * stay as they are.
 *
 * **Question A, a qualifier in a cell narrower than itself** (`docs/BACKLOG.md`
 * § UI: the one-unit Pool's ceiling, the one-unit Card's own-value pill). On a
 * 520px sheet at the default size and `text=24`: Hit points (a calculated
 * ceiling) and Rolled HP (a typed one) moved to one unit, at `6` over `/9`,
 * `/54` and `/120`; Load moved to one unit (`headline-narrow-card-popover`'s
 * placement) and Carried at its own two units and at one, each pill holding
 * `0`, `10` and `100`. Per option it prints the ceiling's or pill's width
 * against the card's content box, how far it passes the card a side, whether
 * the digits are seen, and the field's box (UI.md §7). The typed ceiling is
 * printed at today's inline padding and trimmed, for row 6.
 *
 * **Question B, whether a placed box's content follows the sheet's size.**
 * The forms sheet with Brown Bear in play at 1400 and 520, `text=16` and `24`:
 * each corner tag's size, height, hang below its box and the room left in the
 * gap below, and the Stat block's content size, tile number and how far its
 * content scrolls, per option.
 */
import { fileURLToPath } from 'node:url';
import { CHROME, launch, loadStaged } from './cdp.mjs';

if (!CHROME) {
	console.error('No Chrome-family browser found.');
	process.exit(1);
}
const root = fileURLToPath(new URL('.', import.meta.url));
const only = process.argv[2] ?? null;

const inject = (css) => `(() => {
	document.getElementById('measure-option')?.remove();
	if (${JSON.stringify(css)} !== '') {
		const style = document.createElement('style');
		style.id = 'measure-option';
		style.textContent = ${JSON.stringify(css)};
		document.head.append(style);
	}
	window.sheetsmithRefitHeadlines?.();
	return document.body.offsetHeight;
})()`;

const browser = await launch(['--window-size=1400,1900']);

/* ---------------------------------------------------------------- A ---- */

/** Each option's stylesheet. `mark` and `hide` are drawn by a fit check in
 *  code; here the state a check would set is applied to every cell measured. */
const CEILING = '.sheetsmith-view [data-sheetsmith-component] .sheetsmith-pool .sheetsmith-pool-ceiling';
const OPTIONS_A = [
	{ id: 'c accept', css: '' },
	// The ceiling capped at the card and its digits replaced by `⋯`, the slash
	// kept, as a headline is cut: the box the mark is laid over.
	{
		id: 'a mark',
		css: `${CEILING} { max-width: 100%; overflow: hidden; }
${CEILING} .sheetsmith-pool-max { -webkit-text-fill-color: transparent; }`,
		mark: true,
	},
	// The same, the slash given up with the digits: `⋯` alone.
	{
		id: 'a mark, no slash',
		css: `${CEILING} { max-width: 100%; overflow: hidden; }
${CEILING} .sheetsmith-pool-max, ${CEILING} .sheetsmith-pool-separator { -webkit-text-fill-color: transparent; }`,
		mark: 'alone',
	},
	// The ceiling's slot gives way: not drawn.
	{ id: 'b hide', css: `${CEILING} { display: none; }` },
];
const POOL_VALUES = ['9', '54', '120'];

const measurePool = (component, ceiling, mark) => `(() => {
	const round = (n) => Math.round(n * 10) / 10;
	const cell = document.querySelector('[data-sheetsmith-component="${component}"]');
	const card = cell.querySelector('.sheetsmith-pool');
	card.scrollLeft = 0;
	const current = card.querySelector('.sheetsmith-pool-current');
	current.value = '6';
	const max = card.querySelector('.sheetsmith-pool-max');
	if (max instanceof HTMLInputElement) max.value = ${JSON.stringify(ceiling)};
	else max.textContent = ${JSON.stringify(ceiling)};
	window.sheetsmithRefitHeadlines?.();
	const b = card.getBoundingClientRect();
	const s = getComputedStyle(card);
	const left = b.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft);
	const right = b.right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight);
	const ceil = card.querySelector('.sheetsmith-pool-ceiling');
	const c = ceil.getBoundingClientRect();
	const shown = c.width > 0;
	// The mark a fit check would draw: \`⋯\` at the ceiling's size, after the slash.
	let markW = null;
	if (${Boolean(mark)}) {
		const m = document.createElement('span');
		m.className = 'sheetsmith-pool-max';
		m.textContent = '⋯';
		m.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
		ceil.append(m);
		markW = m.getBoundingClientRect().width;
		m.remove();
	}
	const sep = card.querySelector('.sheetsmith-pool-separator').getBoundingClientRect();
	const mr = max.getBoundingClientRect();
	const ms = getComputedStyle(max);
	// From the slash's box to the digits' box: the gap, and a field's padding.
	const slashGap = mr.left + (max instanceof HTMLInputElement ? parseFloat(ms.paddingLeft) : 0) - sep.right;
	// The whole reading as drawn: slash, gap, then digits or the mark.
	const drawn = !shown ? 0 : ${JSON.stringify(mark)} === 'alone' ? markW : ${Boolean(mark)} ? sep.width + parseFloat(getComputedStyle(ceil).columnGap || '0') + markW : c.width;
	const over = !shown ? 0 : Math.max(0, (drawn - (right - left)) / 2);
	return {
		content: round(right - left),
		size: round(parseFloat(ms.fontSize)),
		width: round(c.width),
		drawn: round(drawn),
		over: round(over),
		seen: !shown ? 'gone' : ${JSON.stringify(mark)} === 'alone' ? 'mark' : ${Boolean(mark)} ? 'slash + mark' : 'digits',
		field: max instanceof HTMLInputElement ? round(mr.width) + 'x' + round(mr.height) : '-',
		slashGap: round(slashGap),
		number: current.classList.contains('sheetsmith-headline-cut') ? 'cut' : 'fits',
		height: round(b.height),
	};
})()`;

/** The typed ceiling's inline padding, before the trim and trimmed (row 6). The 1px is what shipped. */
const PADDING = [
	// Before the trim: the shared field's `--size-2-2` a side.
	['4px before', '.sheetsmith-view .sheetsmith-pool-ceiling .sheetsmith-pool-max-input.sheetsmith-pool-max-input { padding-inline: var(--size-2-2); }'],
	['1px', '.sheetsmith-view .sheetsmith-pool-ceiling .sheetsmith-pool-max-input.sheetsmith-pool-max-input { padding-inline: 1px; }'],
	['0', '.sheetsmith-view .sheetsmith-pool-ceiling .sheetsmith-pool-max-input.sheetsmith-pool-max-input { padding-inline: 0; }'],
];

/** The Card pill: its box, its field's box, and whether the digits are seen. */
const PILL = '.sheetsmith-view [data-sheetsmith-component] .sheetsmith-card-has-derived .sheetsmith-card-value';
const OPTIONS_PILL = [
	{ id: 'c accept', css: '' },
	// Marked as a headline is, inside today's chrome: the mark has the field's box.
	{ id: 'a mark', css: '', mark: true },
	// The pill's chrome gives way first (inline padding 2px, then 0), then marks.
	{ id: 'b chrome 2px', css: `${PILL} { padding-inline: 2px; }` },
	{ id: 'b chrome 0', css: `${PILL} { padding-inline: 0; }` },
	{ id: 'b chrome 0 + mark', css: `${PILL} { padding-inline: 0; }`, mark: true },
	// And the field's own inline padding with it: the most a pill can give.
	{ id: 'b all chrome 0', css: `${PILL} { padding-inline: 0; } ${PILL} .sheetsmith-card-input.sheetsmith-card-input { padding-inline: 0; }` },
	{ id: 'b hide', css: `${PILL} { display: none; }` },
];

const measurePill = (component, value, mark) => `(() => {
	const round = (n) => Math.round(n * 10) / 10;
	const cell = document.querySelector('[data-sheetsmith-component="${component}"]');
	const card = cell.querySelector('.sheetsmith-card');
	const pill = card.querySelector('.sheetsmith-card-value');
	const input = pill.querySelector('.sheetsmith-card-input');
	input.value = ${JSON.stringify(value)};
	const b = card.getBoundingClientRect();
	const s = getComputedStyle(card);
	const content = b.width - parseFloat(s.borderLeftWidth) - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth);
	const p = pill.getBoundingClientRect();
	const i = input.getBoundingClientRect();
	const is = getComputedStyle(input);
	const inner = input.clientWidth - parseFloat(is.paddingLeft) - parseFloat(is.paddingRight);
	const m = document.createElement('span');
	m.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:' + is.font;
	m.textContent = ${JSON.stringify(value)};
	card.append(m);
	const digits = m.getBoundingClientRect().width;
	m.textContent = '⋯';
	const markW = m.getBoundingClientRect().width;
	m.remove();
	const shown = p.width > 0;
	const fits = shown && input.scrollWidth <= input.clientWidth && inner >= digits - 0.5;
	return {
		content: round(content),
		size: round(parseFloat(is.fontSize)),
		pill: shown ? round(p.width) + 'x' + round(p.height) : 'gone',
		over: shown ? round(Math.max(0, (p.width - content) / 2)) : 0,
		field: shown ? round(i.width) + 'x' + round(i.height) : '-',
		inner: round(inner),
		digits: round(digits),
		mark: round(markW),
		seen: !shown ? 'gone' : fits ? 'digits' : ${mark} ? (inner >= markW - 0.5 ? 'mark' : 'mark passes field by ' + round(markW - inner)) : inner <= 0.5 ? 'empty pill' : 'clipped digits',
		height: round(b.height),
	};
})()`;

if (only === null || only === 'a') {
	console.log('== Question A: a qualifier in a cell narrower than itself ==');
	for (const text of [0, 24]) {
		const query = `surface=sheet&theme=light&width=520&text=${text}&place=hit_points:5,1&place=rolled_health:10,1&place=load:11,1`;
		const { unstage } = await loadStaged(browser, `file://${root}index.html?${query}`, { width: 1400, height: 1900 });
		console.log(`\n-- 520 sheet, ${text === 0 ? 'default' : 'text=24'}: Pool ceilings, value 6`);
		for (const option of OPTIONS_A) {
			await browser.evaluate(inject(option.css));
			for (const component of ['hit_points', 'rolled_health']) {
				for (const ceiling of POOL_VALUES) {
					const one = await browser.evaluate(measurePool(component, ceiling, option.mark ?? false));
					console.log(
						`${option.id.padEnd(16)} ${component.padEnd(13)} 6/${ceiling.padEnd(4)} content ${one.content}` +
							` size ${one.size} ceiling ${String(one.width).padStart(5)} drawn ${String(one.drawn).padStart(5)}` +
							` over/side ${String(one.over).padStart(5)} seen ${one.seen.padEnd(13)} field ${one.field.padEnd(10)}` +
							` slash->digits ${one.slashGap} number ${one.number} card h ${one.height}`,
					);
				}
			}
		}
		console.log(`\n-- 520 sheet, ${text === 0 ? 'default' : 'text=24'}: typed ceiling padding (row 6), one unit and at its own three units`);
		for (const [name, css] of PADDING) {
			await browser.evaluate(inject(css));
			for (const ceiling of POOL_VALUES) {
				const one = await browser.evaluate(measurePool('rolled_health', ceiling, false));
				console.log(
					`pad ${name.padEnd(10)} rolled_health 6/${ceiling.padEnd(4)} ceiling ${String(one.width).padStart(5)}` +
						` over/side ${String(one.over).padStart(5)} field ${one.field.padEnd(10)} slash->digits ${one.slashGap}`,
				);
			}
		}
		console.log(`\n-- 520 sheet, ${text === 0 ? 'default' : 'text=24'}: Card pill, Load at one unit`);
		for (const option of OPTIONS_PILL) {
			await browser.evaluate(inject(option.css));
			for (const value of ['0', '10', '100']) {
				const one = await browser.evaluate(measurePill('load', value, option.mark === true));
				console.log(
					`${option.id.padEnd(18)} load ${value.padEnd(4)} content ${one.content} size ${one.size}` +
						` pill ${String(one.pill).padEnd(10)} over/side ${String(one.over).padStart(4)} field ${String(one.field).padEnd(10)} inner ${String(one.inner).padStart(5)}` +
						` digits ${String(one.digits).padStart(5)} mark ${one.mark} seen ${one.seen} card h ${one.height}`,
				);
			}
		}
		await browser.evaluate(inject(''));
		await unstage();
	}
	// Carried at its own two units and moved to one: the popover state's other pill.
	for (const text of [0, 24]) {
		for (const span of [null, 1]) {
			const query = `surface=sheet&theme=light&width=520&text=${text}&place=load:11,1${span === null ? '' : `&place=carried:9,${span}`}`;
			const { unstage } = await loadStaged(browser, `file://${root}index.html?${query}`, { width: 1400, height: 1900 });
			console.log(`\n-- 520 sheet, ${text === 0 ? 'default' : 'text=24'}: Carried ${span === null ? 'at its own placement' : 'at one unit'}`);
			for (const option of OPTIONS_PILL.filter((o) => span === 1 || o.id === 'c accept')) {
				await browser.evaluate(inject(option.css));
				for (const value of ['0', '10', '100']) {
					const one = await browser.evaluate(measurePill('carried', value, option.mark === true));
					console.log(
						`${option.id.padEnd(18)} carried ${value.padEnd(4)} content ${one.content} size ${one.size}` +
							` pill ${String(one.pill).padEnd(10)} over/side ${String(one.over).padStart(4)} field ${String(one.field).padEnd(10)} inner ${String(one.inner).padStart(5)}` +
							` digits ${String(one.digits).padStart(5)} mark ${one.mark} seen ${one.seen}`,
					);
				}
			}
			await browser.evaluate(inject(''));
			await unstage();
		}
	}
}

/* ---------------------------------------------------------------- B ---- */

const TAG = ".sheetsmith-view .sheetsmith-in-play-mark[aria-hidden='true']";
const OPTIONS_B = [
	{ id: 'c as is', css: '' },
	// The tag in em of its box, the stat block's content in em of the sheet.
	{
		id: 'a em',
		css: `${TAG} { font-size: 0.8em; }
.sheetsmith-view .sheetsmith-stat-block-content { font-size: calc(13em / 15); }`,
	},
	// The tag follows the sheet from its token, capped so its hang stays out of
	// the gap's last 3px; the content on the qualifier token.
	{
		id: 'b clamp',
		css: `${TAG} { font-size: clamp(var(--font-ui-smaller), 0.8em, calc(var(--font-ui-smaller) + 1px)); }
.sheetsmith-view .sheetsmith-stat-block-content { font-size: var(--sheetsmith-qualifier-small); }`,
	},
	// The tag follows the sheet, and its box makes the room: the box's bottom
	// padding grows by what the tag's font grew (the box's 0.8em less the
	// token), and the tag is lifted by its own 1em less the token, so the hang
	// below stays today's and the box takes the growth.
	{
		id: 'b room',
		css: `${TAG} { font-size: max(var(--font-ui-smaller), 0.8em); transform: translateY(calc(100% - var(--size-4-2) - var(--sheetsmith-in-play-mark-room, 0px) - (1em - var(--font-ui-smaller)))); }
.sheetsmith-view .sheetsmith-card, .sheetsmith-view .sheetsmith-pool { padding-block-end: calc(var(--size-4-2) + var(--sheetsmith-in-play-mark-room) + max(0px, 0.8em - var(--font-ui-smaller))); }
.sheetsmith-view .sheetsmith-stat-block-content { font-size: var(--sheetsmith-qualifier-small); }`,
	},
];

const measureB = `(() => {
	const round = (n) => Math.round(n * 10) / 10;
	const tags = [];
	for (const pill of document.querySelectorAll(".sheetsmith-in-play-mark[aria-hidden='true']")) {
		if (pill.classList.contains('sheetsmith-in-play-mark-inline')) continue;
		const box = pill.parentElement;
		const p = pill.getBoundingClientRect();
		const b = box.getBoundingClientRect();
		const st = getComputedStyle(box);
		const contentBottom = b.bottom - parseFloat(st.borderBottomWidth) - parseFloat(st.paddingBottom);
		if (p.top + p.height / 2 < b.top + b.height / 2) continue; // a Pool's top tag
		let below = null;
		for (const other of document.querySelectorAll('.sheetsmith-cell')) {
			const r = other.getBoundingClientRect();
			if (r.top >= b.bottom - 0.5 && r.left < b.right && r.right > b.left && (below === null || r.top < below)) below = r.top;
		}
		tags.push({
			box: box.querySelector('.sheetsmith-component-label, .sheetsmith-card-label')?.textContent ?? box.className.split(' ')[0],
			size: round(parseFloat(getComputedStyle(pill).fontSize)),
			height: round(p.height),
			hang: round(p.bottom - b.bottom),
			gap: below === null ? null : round(below - p.bottom),
			content: round(p.top - contentBottom),
			pad: round(parseFloat(st.paddingBottom)),
			boxH: round(b.height),
		});
	}
	const blocks = [...document.querySelectorAll('.sheetsmith-stat-block-content')].map((el) => {
		const vital = el.querySelector('.sheetsmith-stat-block-vital');
		const num = vital?.querySelector('.sheetsmith-card-value, .sheetsmith-stat-block-vital-value, input, strong');
		// The content's own height, not scrollHeight, which is never under the box.
		const kids = [...el.children].map((k) => k.getBoundingClientRect()).filter((r) => r.height > 0);
		const st = getComputedStyle(el);
		const own = kids.length === 0 ? 0 : Math.max(...kids.map((r) => r.bottom)) - Math.min(...kids.map((r) => r.top)) + parseFloat(st.paddingTop) + parseFloat(st.paddingBottom);
		return {
			size: round(parseFloat(getComputedStyle(el).fontSize)),
			scroll: round(own),
			client: round(el.clientHeight),
			below: round(Math.max(0, own - el.clientHeight)),
			number: num ? round(parseFloat(getComputedStyle(num).fontSize)) : null,
			title: round(parseFloat(getComputedStyle(el.querySelector('.sheetsmith-stat-block-title') ?? el).fontSize)),
		};
	});
	const cards = [...document.querySelectorAll('.sheetsmith-card, .sheetsmith-pool')].map((c) => c.getBoundingClientRect().height);
	return { tags, blocks, cardSum: round(cards.reduce((a, n) => a + n, 0)), cards: cards.length };
})()`;

if (only === null || only === 'b') {
	console.log('\n== Question B: does a placed box\'s content follow the sheet\'s size ==');
	for (const width of [1400, 520]) {
		for (const text of [16, 24]) {
			const query = `surface=sheet&theme=light&state=forms&text=${text}${width === 520 ? '&width=520' : ''}`;
			const { unstage } = await loadStaged(browser, `file://${root}index.html?${query}`, { width: 1400, height: 3800 });
			console.log(`\n-- ${width}, text=${text}`);
			let base = null;
			for (const option of OPTIONS_B) {
				await browser.evaluate(inject(option.css));
				const one = await browser.evaluate(measureB);
				base ??= one;
				for (const tag of one.tags) {
					console.log(
						`${option.id.padEnd(8)} tag ${String(tag.box).padEnd(18)} size ${String(tag.size).padStart(4)} height ${String(tag.height).padStart(4)}` +
							` inside ${String(-tag.content + tag.height - tag.hang).padStart(5)} hang ${String(tag.hang).padStart(4)}` +
							` gap left ${String(tag.gap ?? '-').padStart(5)} box pad-bottom ${tag.pad} box h ${tag.boxH}`,
					);
				}
				for (const block of one.blocks) {
					console.log(
						`${option.id.padEnd(8)} stat block content ${block.size}px, title ${block.title}, tile number ${block.number}` +
							`, content ${block.scroll} in ${block.client} (scrolls ${block.below})`,
					);
				}
				console.log(`${option.id.padEnd(8)} every card's height summed: ${one.cardSum} over ${one.cards} (${round1(one.cardSum - base.cardSum)} against as-is)`);
			}
			await browser.evaluate(inject(''));
			await unstage();
		}
	}
}

function round1(n) {
	return Math.round(n * 10) / 10;
}

await browser.close();
process.exit(0);
