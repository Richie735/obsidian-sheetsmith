/*
 * The measurements `docs/features/record-set-groups.md` makes a criterion, as a
 * script a reviewer can run again: not shipped, and not a test, because it needs
 * a browser. Run `npm run harness` first (it measures the built bundle), then
 *
 *   node harness/measure-groups.mjs
 *
 * It drives Chrome over the DevTools Protocol, as `inspect.mjs` does, and exits
 * non-zero if any check fails. It prints the numbers.
 *
 *  1. The sheet does not move: every cell's and placed box's rectangle is
 *     identical across collapse of the tallest group, collapse of all, and
 *     expand, wide and narrow, both themes.
 *  2. Columns: under a headed list's strip every group's fields share an x, a
 *     collapse moves no column of an open group, and the strip is where it is
 *     with the groups removed.
 *  3. A real mouse press toggles exactly once wherever it lands on a header
 *     (chevron, name, count, empty row), and Enter and Space toggle too.
 *  4. A press does not lose the header: after collapsing, the pressed header is
 *     inside the list's scrollport, for a list taller than its box (scrolled to
 *     the end) and one shorter than it.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const CHROME = [
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	'/Applications/Chromium.app/Contents/MacOS/Chromium',
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
].find((path) => existsSync(path));
if (!CHROME) {
	console.error('No Chrome-family browser found.');
	process.exit(1);
}
const root = fileURLToPath(new URL('.', import.meta.url));
const PORT = 9334;
const proc = spawn(
	CHROME,
	['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, '--window-size=1400,1900', 'about:blank'],
	{ stdio: 'ignore' },
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let tabs;
for (let tries = 0; tries < 30 && !tabs; tries++) {
	await sleep(300);
	try {
		tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
	} catch {
		/* not up yet */
	}
}
const ws = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve) => ws.on('open', resolve));
let next = 0;
const pending = new Map();
ws.on('message', (raw) => {
	const message = JSON.parse(raw);
	if (message.id && pending.has(message.id)) {
		pending.get(message.id)(message);
		pending.delete(message.id);
	}
});
const send = (method, params = {}) =>
	new Promise((resolve) => {
		const id = ++next;
		pending.set(id, resolve);
		ws.send(JSON.stringify({ id, method, params }));
	});
const evaluate = async (expression) => {
	const reply = await send('Runtime.evaluate', { expression, returnByValue: true });
	if (reply.result.exceptionDetails) throw new Error(JSON.stringify(reply.result.exceptionDetails));
	return reply.result.result.value;
};
async function load(theme, width, viewport) {
	await send('Emulation.setDeviceMetricsOverride', { width: viewport, height: 1900, deviceScaleFactor: 1, mobile: false });
	await send('Page.navigate', { url: `file://${root}index.html?surface=sheet&theme=${theme}&state=record-groups&width=${width}` });
	await sleep(2500);
}

let failed = 0;
const check = (ok, what, detail = '') => {
	if (!ok) failed++;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  ${detail}` : ''}`);
};

const rect = `const r=e=>{const b=e.getBoundingClientRect();return [b.x,b.y,b.width,b.height].map(n=>Math.round(n*100)/100).join(',')};`;
const snapshot = `(()=>{${rect}return [...document.querySelectorAll('.sheetsmith-cell, .sheetsmith-placed-box')].map(r).join('|')})()`;
const listHeights = `[...document.querySelectorAll('.sheetsmith-record-set-list')].map(l=>l.getBoundingClientRect().height)`;
const click = (selector) => `document.querySelectorAll('${selector}').forEach(b=>b.click())`;

// 1. The sheet does not move.
for (const theme of ['light', 'dark']) {
	for (const [label, width, viewport] of [['wide', 0, 1400], ['narrow', 520, 620]]) {
		await load(theme, width, viewport);
		const steps = [await evaluate(snapshot)];
		await evaluate(`(()=>{let best=null,n=-1;for(const g of document.querySelectorAll('.sheetsmith-record-group')){const c=g.querySelectorAll('.sheetsmith-record').length;if(c>n){n=c;best=g}}best.querySelector('.sheetsmith-record-group-toggle').click()})()`);
		await sleep(250);
		steps.push(await evaluate(snapshot));
		await evaluate(click('.sheetsmith-record-group-toggle[aria-expanded=true]'));
		await sleep(250);
		steps.push(await evaluate(snapshot));
		const heights = await evaluate(listHeights);
		const collapsedCount = await evaluate(`document.querySelectorAll('.sheetsmith-record-group-toggle[aria-expanded=false]').length`);
		await evaluate(click('.sheetsmith-record-group-toggle[aria-expanded=false]'));
		await sleep(250);
		steps.push(await evaluate(snapshot));
		check(
			collapsedCount > 0 && steps.every((one) => one === steps[0]),
			`sheet does not move: ${theme} ${label}`,
			`${steps[0].split('|').length} rects, ${collapsedCount} groups collapsed, list heights ${heights.join('/')}`,
		);
	}
}

// 2. Columns under the strip.
await load('light', 0, 1400);
const columns = `(()=>{const r=e=>{const b=e.getBoundingClientRect();return [Math.round(b.left*10)/10,Math.round(b.width*10)/10]};
 const L=[...document.querySelectorAll('.sheetsmith-record-set-list')].find(l=>l.querySelector('.sheetsmith-record-strip'));
 return {L,strip:[...L.querySelector('.sheetsmith-record-strip').children].map(r),groups:[...L.querySelectorAll('.sheetsmith-record-group')].map(g=>({open:g.querySelector('button').getAttribute('aria-expanded'),rows:[...g.querySelectorAll('.sheetsmith-record')].map(rec=>[...rec.querySelectorAll('.sheetsmith-record-fields > .sheetsmith-record-field')].map(r))}))}})()`.replace('return {L,', 'return {');
const before = await evaluate(columns);
const flat = before.groups.flatMap((g) => g.rows);
check(
	flat.every((row) => JSON.stringify(row) === JSON.stringify(flat[0])),
	'every record in every group has its fields at the same x',
	JSON.stringify(flat[0]),
);
await evaluate(`[...document.querySelectorAll('.sheetsmith-record-set-list')].find(l=>l.querySelector('.sheetsmith-record-strip')).querySelector('.sheetsmith-record-group-toggle').click()`);
await sleep(250);
const after = await evaluate(columns);
check(
	JSON.stringify(before.groups.slice(1)) === JSON.stringify(after.groups.slice(1)) && JSON.stringify(before.strip) === JSON.stringify(after.strip),
	'collapsing a group moves no column of the open ones, nor the strip',
	`strip ${JSON.stringify(after.strip)}`,
);
const flatStrip = await evaluate(`(()=>{const r=e=>{const b=e.getBoundingClientRect();return [Math.round(b.left*10)/10,Math.round(b.width*10)/10]};
 const L=[...document.querySelectorAll('.sheetsmith-record-set-list')].find(l=>l.querySelector('.sheetsmith-record-strip'));
 const host=L.querySelector('.sheetsmith-record-group').parentElement;const recs=[...L.querySelectorAll('.sheetsmith-record')];
 L.querySelectorAll('.sheetsmith-record-group').forEach(g=>g.remove());recs.forEach(x=>host.append(x));
 return [...L.querySelector('.sheetsmith-record-strip').children].map(r)})()`);
check(JSON.stringify(flatStrip) === JSON.stringify(before.strip), 'the strip sits where it does with the groups taken away', JSON.stringify(flatStrip));

// 3. A real press, at coordinates, toggles once wherever it lands.
await load('light', 0, 1400);
{
	const first = `[...document.querySelectorAll('.sheetsmith-record-set-list')][0]`;
	const state = `${first}.querySelector('.sheetsmith-record-group-toggle').getAttribute('aria-expanded')`;
	const points = await evaluate(`(()=>{const L=${first};const t=L.querySelector('.sheetsmith-record-group-toggle');
	 const mid=(e)=>{const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}};
	 return {chevron:mid(t.querySelector('.sheetsmith-record-group-mark')),name:mid(t.querySelector('.sheetsmith-record-group-name')),
	  count:mid(L.querySelector('.sheetsmith-record-group-count')),row:{x:t.getBoundingClientRect().right-4,y:mid(t).y}}})()`);
	for (const [where, point] of Object.entries(points)) {
		const was = await evaluate(state);
		for (const type of ['mousePressed', 'mouseReleased']) {
			await send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
		}
		await sleep(150);
		const now = await evaluate(state);
		check(was !== now, `a real press on the ${where} toggles once`, `${was} -> ${now}`);
	}
	for (const key of ['Enter', ' ']) {
		await evaluate(`${first}.querySelector('.sheetsmith-record-group-toggle').focus()`);
		const was = await evaluate(state);
		const code = key === ' ' ? 'Space' : 'Enter';
		for (const type of ['keyDown', 'keyUp']) {
			await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: key === ' ' ? 32 : 13, text: type === 'keyDown' ? (key === ' ' ? ' ' : '\r') : undefined });
		}
		await sleep(150);
		const now = await evaluate(state);
		check(was !== now, `${code} on the header button toggles once`, `${was} -> ${now}`);
	}
}

// 4. A press leaves the pressed header inside the scrollport.
await load('light', 0, 1400);
const scrollport = (end) => `(()=>{
 const lists=[...document.querySelectorAll('.sheetsmith-record-set-list')];
 const out=[];
 for(const L of lists){
  const heads=[...L.querySelectorAll('.sheetsmith-record-group-toggle')];
  if(heads.length<2)continue;
  const taller=L.scrollHeight>L.clientHeight+1;
  if(${end}!==taller)continue;
  if(taller)L.scrollTop=L.scrollHeight;
  const b=heads[heads.length-1];b.click();
  const lr=L.getBoundingClientRect(),br=b.getBoundingClientRect();
  out.push({taller,scrollTop:L.scrollTop,inside:br.top>=lr.top-0.5&&br.bottom<=lr.bottom+0.5});
 }
 return out})()`;
for (const [label, taller] of [['taller than its box (scrolled to the end)', true], ['shorter than its box', false]]) {
	const results = await evaluate(scrollport(taller));
	await load('light', 0, 1400);
	check(results.length > 0 && results.every((one) => one.inside), `pressed header stays in the scrollport: list ${label}`, JSON.stringify(results));
}

ws.close();
proc.kill();
process.exit(failed === 0 ? 0 : 1);
