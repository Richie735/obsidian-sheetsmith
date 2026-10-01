/*
 * The measurements `docs/features/record-set-groups.md` makes a criterion, as a
 * script a reviewer can run again: not shipped, and not a test, because it needs
 * a browser. Run `npm run harness` first (it measures the built bundle), then
 *
 *   node harness/measure-groups.mjs [state]
 *
 * `state` is the harness state to measure, `record-groups` unless given. Run it
 * again with `text-groups` for a list keyed by what the player types
 * (`docs/features/free-text-group-key.md`), where check 5 also holds the strip
 * to being centred over the text column's field.
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
 *  5. The strip is centred over its fields: each heading's centre is within a
 *     pixel and a half of the centre of the field box under it, text column
 *     included. A number's heading is centred on its ink instead (the 0.4em
 *     in `sheet.css`), so numbers are left out; a text column's heading starts
 *     where its words start, so its left edge is held to the input's ink.
 *  6. A header name wider than its header is clipped to one line, every header
 *     is the same height, and a real pointer resting on a clipped name reveals
 *     all of it (`title`). The `text-groups` state must hold at least one
 *     clipped name at 520px, or this check would pass on nothing.
 *  7. A list with a text field on its summary line is stacked (name and delete
 *     on one row, the fields under the name) at a container of 480px and not at
 *     481px, and a headed one at 420px and not at 421px
 *     (`docs/features/free-text-group-key.md`, narrow regime). Only the
 *     `text-groups` state has those lists.
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
const STATE = process.argv[2] ?? 'record-groups';
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
	await send('Page.navigate', { url: `file://${root}index.html?surface=sheet&theme=${theme}&state=${STATE}&width=${width}` });
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

// 5. The strip is centred over its fields, whatever the column holds.
await load('light', 0, 1400);
{
	const offsets = await evaluate(`(()=>{
	 const L=[...document.querySelectorAll('.sheetsmith-record-set-list')].find(l=>l.querySelector('.sheetsmith-record-strip'));
	 const heads=[...L.querySelector('.sheetsmith-record-strip').children];
	 const rec=L.querySelector('.sheetsmith-record');
	 const fields=[...rec.querySelectorAll('.sheetsmith-record-fields > .sheetsmith-record-field')];
	 const mid=e=>{const b=e.getBoundingClientRect();return b.left+b.width/2};
	 return heads.map((h,i)=>({name:h.textContent,offset:Math.round((mid(h)-mid(fields[i]))*10)/10,text:!!fields[i].querySelector('.sheetsmith-record-input-text'),number:fields[i].classList.contains('sheetsmith-record-field-number'),inkOffset:(()=>{const t=fields[i].querySelector('.sheetsmith-record-input-text');if(!t)return null;const cs=getComputedStyle(t);const ink=t.getBoundingClientRect().left+parseFloat(cs.borderLeftWidth)+parseFloat(cs.paddingLeft);const hs=getComputedStyle(h);const hink=h.getBoundingClientRect().left+parseFloat(hs.paddingLeft);return Math.round((hink-ink)*10)/10})()}))})()`);
	// A number is left out on purpose: its field is moved 0.4em so the heading
	// is centred on its ink and not its box (measured 5.2px in `sheet.css`).
	const boxed = offsets.filter((one) => !one.number && !one.text);
	check(
		boxed.length > 0 && boxed.every((one) => Math.abs(one.offset) <= 1.5),
		'each heading is centred over the field under it',
		JSON.stringify(offsets),
	);
	const words = offsets.filter((one) => one.text);
	check(
		STATE !== 'text-groups' || (words.length > 0 && words.every((one) => Math.abs(one.inkOffset) <= 1.5)),
		'a text column’s heading starts over its first letter',
		JSON.stringify(words.map((one) => one.inkOffset)),
	);
}

// 6. A clipped header name: one line, no taller than its siblings, revealed on hover.
await load('light', 520, 620);
{
	const names = await evaluate(`(()=>{const out=[];for(const n of document.querySelectorAll('.sheetsmith-record-group-name')){const b=n.getBoundingClientRect(),h=n.closest('.sheetsmith-record-group-heading').getBoundingClientRect();out.push({text:n.textContent,clipped:n.scrollWidth>n.clientWidth+1,x:b.x+b.width/2,y:b.y+b.height/2,height:Math.round(h.height*10)/10,lines:Math.round(b.height/parseFloat(getComputedStyle(n).lineHeight))})}return out})()`);
	const clipped = names.filter((one) => one.clipped);
	check(
		STATE !== 'text-groups' || clipped.length > 0,
		'the fixture holds a clipped header name at 520px',
		`${clipped.length} of ${names.length}`,
	);
	check(
		names.every((one) => one.height === names[0].height && one.lines <= 1),
		'every header is one line and the same height, clipped or not',
		JSON.stringify([...new Set(names.map((one) => one.height))]),
	);
	for (const one of clipped) {
		await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: one.x, y: one.y });
		await sleep(150);
		const title = await evaluate(`[...document.querySelectorAll('.sheetsmith-record-group-name')].find(n=>n.scrollWidth>n.clientWidth+1)?.title`);
		check(title === one.text, 'a pointer on a clipped header name reveals all of it', `${one.text.length} characters`);
		break;
	}
}

// 7. The stacking thresholds, at the container widths the spec names.
if (STATE === 'text-groups') {
	await load('light', 0, 1400);
	const stackedAt = (id, width) => evaluate(`(()=>{
	 const label=[...document.querySelectorAll('.sheetsmith-component-label')].find(l=>l.textContent==='${id}');
	 const block=label.closest('.sheetsmith-record-set');
	 const cs=getComputedStyle(block);
	 const pad=parseFloat(cs.paddingLeft)+parseFloat(cs.paddingRight)+parseFloat(cs.borderLeftWidth)+parseFloat(cs.borderRightWidth);
	 block.style.width=(${width}+pad)+'px';block.style.maxWidth='none';block.style.justifySelf='start';
	 const content=block.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
	 const fields=block.querySelector('.sheetsmith-record-fields');
	 return {content,stacked:getComputedStyle(fields).gridRowStart==='2',strip:getComputedStyle(block.querySelector('.sheetsmith-record-strip')??block).display}})()`);
	for (const [id, edge] of [['Homebrew features', 480], ['Homebrew strip', 420]]) {
		await load('light', 0, 1400);
		const at = await stackedAt(id, edge);
		await sleep(200);
		const atNow = await evaluate(`(()=>{const l=[...document.querySelectorAll('.sheetsmith-component-label')].find(l=>l.textContent==='${id}');const f=l.closest('.sheetsmith-record-set').querySelector('.sheetsmith-record-fields');return getComputedStyle(f).gridRowStart==='2'})()`);
		await evaluate(`(()=>{const l=[...document.querySelectorAll('.sheetsmith-component-label')].find(l=>l.textContent==='${id}');const b=l.closest('.sheetsmith-record-set');const cs=getComputedStyle(b);const pad=parseFloat(cs.paddingLeft)+parseFloat(cs.paddingRight)+parseFloat(cs.borderLeftWidth)+parseFloat(cs.borderRightWidth);b.style.width=(${edge + 1}+pad)+'px'})()`);
		await sleep(200);
		const above = await evaluate(`(()=>{const l=[...document.querySelectorAll('.sheetsmith-component-label')].find(l=>l.textContent==='${id}');const b=l.closest('.sheetsmith-record-set');const f=b.querySelector('.sheetsmith-record-fields');return {stacked:getComputedStyle(f).gridRowStart==='2',content:b.clientWidth}})()`);
		check(
			atNow === true && above.stacked === false,
			`${id}: stacked at a container of ${edge}px and not at ${edge + 1}px`,
			`content ${at.content}px stacked=${atNow}; above stacked=${above.stacked}`,
		);
	}
}

ws.close();
proc.kill();
process.exit(failed === 0 ? 0 : 1);
