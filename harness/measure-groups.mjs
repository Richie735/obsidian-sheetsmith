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
 * It drives Chrome over the DevTools Protocol through `cdp.mjs`, which
 * `shot.mjs`'s driven path shares, and exits non-zero if any check fails. It prints the numbers.
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
 *  7. Where every list's summary line stacks, swept from 150 to 1300px in
 *     half pixels over every list in this state and in `populated`, the sheet's
 *     own, each at the default type size and at `text=20` and `text=24`
 *     (`docs/features/record-set-stacking-tiers.md`). Checks 1 to 6 need groups,
 *     so `node harness/measure-groups.mjs pinned-add` runs this one alone:
 *     a. no unstacked field line wraps inside its own track, cuts its name
 *        under 96px, or pushes a field past the delete glyph's left edge (under
 *        the plain line's `max-content` fields track a line too narrow for its
 *        fields overflows rather than wraps:
 *        `docs/features/record-summary-fields-first.md`);
 *     b. no list is stacked more than 2em (32px, the line's own em) past the
 *        width its plain line fits at, every declared field drawn, with the name
 *        at six ems;
 *     c. no list is stacked and under its strip at once;
 *     d. in the forced-plain sweep, at every width from 150 to 1300px and not
 *        only past the fit, no record's name box passes the left edge of its
 *        fields: a name narrowed under its floor clips, and never overlaps;
 *     e. under its strip, at every width it is drawn, no record's name is
 *        under 96px and no field passes the delete glyph — the constraint the
 *        strip's px thresholds were measured to;
 *     f. at 1300px a name under the strip is exactly as wide as the plain
 *        line's at the same width, so the cap does not move as the strip comes
 *        in (`docs/features/record-set-heading-strip.md`).
 *     It prints, per list, where it is stacked to, where its plain line fits
 *     from and where its strip comes in.
 *  8. At a 520px container in `populated`, beside every open table's sticky
 *     name that its table scrolls under (`docs/UI.md` §4): a. the room is at
 *     least its band — one number cell, or one glyph cell on a table stamped
 *     `sheetsmith-table-glyph-band` — unless the name column is as wide as its heading,
 *     which is never clipped; b. every cell's content but prose, its width less
 *     its padding, fits in that room. It prints each table's scroller, name and
 *     room, which are the figures the §4 ruling quotes, and the same at
 *     `text=24` without holding them: the residue that ruling records.
 *  9. Beside every sticky name, in every table and Roster that scrolls, at a
 *     520px container and at a true 380 under phone staging, each at the
 *     default type size and at `text=24`: scrolled fully right, a real Shift-Tab
 *     onto each control leaves it clear of its row's name (`docs/UI.md` §4,
 *     `ui/pinned-column-focus.ts`). Real key events, not `focus()`: the
 *     browser's own scroll is half of what is measured.
 * 10. In the same tables and Rosters, at the same two widths and two type sizes
 *     under the same staging: scrolled fully right, the rightmost control that
 *     commits by key is committed with real keys (a new value and Enter in a
 *     field, Space on a ring), and after the rebuild a. the same control has
 *     focus, b. the scroller is back within a pixel of its offset, and c. the
 *     control starts inside the scrollport, clear of its row's name
 *     (`docs/features/table-scroll-across-rebuild.md`). Past the far edge is
 *     printed, not failed, where it is a field wider than the room beside the
 *     name and was already as far past before the commit, within a pixel
 *     (`docs/UI.md` §4), or where
 *     the commit widened a column ahead of it: the accepted drift. It prints
 *     every offset before and after.
 */
import { fileURLToPath } from 'node:url';
import { CHROME, launch, loadStaged, wait as sleep } from './cdp.mjs';

/**
 * What counts as a control: `src/view/cell-focus.ts`'s `FOCUSABLE`, which check
 * 10's same-control test has to count by. Spelled here once because this script
 * runs in Node and cannot import the TypeScript.
 */
const FOCUSABLE = 'input, select, textarea, button, a[href]';

if (!CHROME) {
	console.error('No Chrome-family browser found.');
	process.exit(1);
}
const root = fileURLToPath(new URL('.', import.meta.url));
const STATE = process.argv[2] ?? 'record-groups';
const browser = await launch(['--window-size=1400,1900']);
const { send, evaluate } = browser;
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

// Checks 1 to 6 are about groups, so they run only in a state that has them;
// check 7 runs in any (`pinned-add` included, which has no groups).
const GROUPED = STATE === 'record-groups' || STATE === 'text-groups';
if (GROUPED) {
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

}

// 7. Where every list's line stacks: checks a to f.
async function loadState(state, text) {
	await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1900, deviceScaleFactor: 1, mobile: false });
	await send('Page.navigate', { url: `file://${root}index.html?surface=sheet&theme=light&state=${state}&text=${text}` });
	await sleep(2500);
}
const SWEEP = `(()=>{
 const pastDelete=(s)=>{const d=s.querySelector('.sheetsmith-record-remove');if(!d)return false;const left=d.getBoundingClientRect().left;return [...s.querySelectorAll('.sheetsmith-record-fields > .sheetsmith-record-field')].filter(x=>!x.hidden).some(x=>x.getBoundingClientRect().right>left+0.5);};
 const overlaps=(s)=>{const f=s.querySelector('.sheetsmith-record-fields');if(!f||![...f.children].some(x=>!x.hidden))return false;return s.querySelector('.sheetsmith-record-name').getBoundingClientRect().right>f.getBoundingClientRect().left+0.5;};
 const lines=(fs)=>{const bs=fs.map(f=>f.getBoundingClientRect()).sort((a,b)=>a.top-b.top);let n=0,bottom=-1e9;for(const b of bs){if(b.top>=bottom-1){n++;bottom=b.bottom;}else bottom=Math.max(bottom,b.bottom);}return n;};
 const blocks=[...document.querySelectorAll('.sheetsmith-view .sheetsmith-record-set')].filter(b=>b.querySelector('.sheetsmith-record-summary'));
 const out=blocks.map(b=>({name:b.querySelector('.sheetsmith-record-set-label')?.textContent??'?',em:parseFloat(getComputedStyle(b).fontSize),wrap:[],both:[],overlap:[],stripBad:[],stripName:null,plainName:null,stackedTo:null,stripFrom:null,fit:null}));
 const sweep=(b,each)=>{b.style.flex='none';b.style.justifySelf='start';b.style.maxWidth='none';for(let w=150;w<=1300;w+=0.5){b.style.width=w+'px';void b.offsetWidth;if(each(w))break;}};
 blocks.forEach((b,i)=>{const o=out[i];sweep(b,(w)=>{
  const strip=getComputedStyle(b.querySelector('.sheetsmith-record-set-box')).getPropertyValue('--sheetsmith-record-strip').trim()==='on';
  if(strip&&o.stripFrom===null)o.stripFrom=w;
  let stacked=false,bad=false;
  for(const s of b.querySelectorAll('.sheetsmith-record-summary')){const f=s.querySelector('.sheetsmith-record-fields');
   if(getComputedStyle(f).gridRowStart==='2'){stacked=true;continue;}
   if(strip){if(s.querySelector('.sheetsmith-record-name').getBoundingClientRect().width<96||pastDelete(s))o.stripBad.push(w);if(w===1300)o.stripName=Math.max(o.stripName??0,s.querySelector('.sheetsmith-record-name').getBoundingClientRect().width);continue;}
   if(lines([...f.children].filter(x=>!x.hidden))>1||s.querySelector('.sheetsmith-record-name').getBoundingClientRect().width<96||pastDelete(s))bad=true;}
  if(stacked)o.stackedTo=w; if(bad)o.wrap.push(w); if(stacked&&strip)o.both.push(w); return false;});});
 const force=document.createElement('style');force.textContent='.sheetsmith-record-set-box{--sheetsmith-record-stack: off !important}';document.head.appendChild(force);
 blocks.forEach((b,i)=>{const o=out[i];b.classList.remove('sheetsmith-record-set-headed');b.classList.add('sheetsmith-record-set-fits-narrow');
  for(const f of b.querySelectorAll('.sheetsmith-record-summary .sheetsmith-record-field'))f.removeAttribute('hidden');
  sweep(b,(w)=>{const summaries=[...b.querySelectorAll('.sheetsmith-record-summary')];
   if(summaries.some(overlaps))o.overlap.push(w);
   if(w===1300)o.plainName=Math.max(...summaries.map(s=>s.querySelector('.sheetsmith-record-name').getBoundingClientRect().width));
   const ok=summaries.every(s=>{const f=s.querySelector('.sheetsmith-record-fields');return lines([...f.children])<=1&&s.querySelector('.sheetsmith-record-name').getBoundingClientRect().width>=96&&!pastDelete(s);});if(ok&&o.fit===null)o.fit=w;return false;});});
 return out;})()`;
/**
 * The bound on (b): two ems at the line's own 16px. Not the container's `em`,
 * which is the stage's type size and grows with `text=`, where the line's widths
 * do not (they are fixed-px tokens): at `text=24` a container `em` would let a
 * list stack 48px past its fit and call it two ems.
 */
const PAST_PX = 32;
for (const state of [...new Set(['populated', STATE])]) {
	// The default type size, and two larger ones: the line's widths are px, so
	// its thresholds must not move with the stage's type size.
	for (const text of [0, 20, 24]) {
		await loadState(state, text);
		const lists = await evaluate(SWEEP);
		const at = `${state}${text ? ` text=${text}` : ''}`;
		for (const one of lists) {
			const past = one.stackedTo === null || one.fit === null ? 0 : one.stackedTo - one.fit;
			console.log(`      ${at} ${one.name}: stacked to ${one.stackedTo ?? 'never'}, plain from ${one.fit ?? 'never'}, strip from ${one.stripFrom ?? 'never'}, ${past}px past`);
			check(one.wrap.length === 0, `${at} ${one.name}: (a) no unstacked line wraps`, one.wrap.slice(0, 4).join(','));
			check(one.fit !== null && past <= PAST_PX, `${at} ${one.name}: (b) stacked no more than 2em past its fit`, `${past}px past`);
			check(one.both.length === 0, `${at} ${one.name}: (c) never stacked under its strip`, one.both.slice(0, 4).join(','));
			check(one.overlap.length === 0, `${at} ${one.name}: (d) no name passes its fields`, one.overlap.slice(0, 4).join(','));
			if (one.stripFrom !== null) {
				check(one.stripBad.length === 0, `${at} ${one.name}: (e) under its strip no name is under 96px and no field passes the delete glyph`, one.stripBad.slice(0, 4).join(','));
				check(one.stripName !== null && Math.abs(one.stripName - one.plainName) <= 0.5, `${at} ${one.name}: (f) under its strip a name caps where the plain line's does`, `${one.stripName} against ${one.plainName}`);
			}
		}
	}
}

// 8. The room beside an open table's sticky name, at a 520px container.
const ROOM = `(()=>{
 const px=(e,p)=>parseFloat(getComputedStyle(e)[p]);
 return [...document.querySelectorAll('.sheetsmith-view .sheetsmith-table-box')].map(box=>{
  const sc=box.querySelector('.sheetsmith-table-wrapper');const t=sc.querySelector('.sheetsmith-table');
  const glyph=box.classList.contains('sheetsmith-table-glyph-band');
  const probe=document.createElement('div');probe.style.width=glyph?'calc(var(--sheetsmith-inline-control) + 2 * var(--size-4-2))':'calc(4 * var(--font-ui-small) + 2 * var(--size-4-2))';if(glyph)probe.style.fontSize='var(--font-ui-small)';box.appendChild(probe);const band=probe.getBoundingClientRect().width;probe.remove();
  const name=t.querySelector('.sheetsmith-table-name').getBoundingClientRect().width;
  const room=sc.clientWidth-name;
  const head=t.querySelector('thead .sheetsmith-table-name');let heading=0;if(head){const g=document.createRange();g.selectNodeContents(head);heading=g.getBoundingClientRect().width+px(head,'paddingLeft')+px(head,'paddingRight');}
  const cut=[...t.querySelectorAll('tr')].flatMap(tr=>[...tr.children].filter(c=>!c.classList.contains('sheetsmith-table-name')&&!c.classList.contains('sheetsmith-table-text')).map(c=>({h:c.textContent.trim().slice(0,12),w:c.getBoundingClientRect().width-px(c,'paddingLeft')-px(c,'paddingRight')}))).filter(c=>c.w>room+0.5);
  return {label:box.closest('.sheetsmith-cell')?.querySelector('[class*=label]')?.textContent??'?',scroller:sc.clientWidth,overflows:t.getBoundingClientRect().width>sc.clientWidth+0.5,name:Math.round(name*10)/10,room:Math.round(room*10)/10,band,glyph,cut,byHeading:heading>=name-0.5};
 });})()`;
async function loadRoom(text) {
	await send('Emulation.setDeviceMetricsOverride', { width: 620, height: 1900, deviceScaleFactor: 1, mobile: false });
	await send('Page.navigate', { url: `file://${root}index.html?surface=sheet&theme=light&state=populated&width=520&text=${text}` });
	await sleep(2500);
}
// At `text=24` printed and not held: the name's heading is `em` and grows past
// the room there, which `docs/UI.md` §4 records as the residue.
await loadRoom(24);
for (const one of (await evaluate(ROOM)).filter((each) => each.overflows)) {
	console.log(`      520 text=24 ${one.label}: scroller ${one.scroller}, name ${one.name}, room ${one.room}, cut ${JSON.stringify(one.cut.slice(0, 3))}`);
}
await loadRoom(0);
const tables = await evaluate(ROOM);
check(tables.some((one) => one.overflows), '(8) at 520 at least one open table scrolls beside its sticky name, or this check holds nothing');
for (const one of tables.filter((each) => each.overflows)) {
	console.log(`      520 ${one.label}: scroller ${one.scroller}, name ${one.name}, room ${one.room}${one.glyph ? ', a glyph band' : ''}${one.byHeading ? ', the name column set by its heading' : ''}`);
	// A name heading is never clipped (§4), so a column its heading sets is the
	// one case the room may be under a number cell; (b) still holds there.
	if (!one.byHeading) check(one.room >= one.band - 0.5, `520 ${one.label}: (8a) the room beside the sticky name is at least its band: one number cell, or one glyph where every trailing cell is one`, `${one.room} against ${one.band}`);
	check(one.cut.length === 0, `520 ${one.label}: (8b) every cell's content but prose shows whole beside it`, JSON.stringify(one.cut.slice(0, 3)));
}

// 9. Focus moved back along a scrolled table never lands behind its sticky name.
const SHIFT_TAB = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, modifiers: 8 };
const SCROLLERS = `(()=>{
 const tabbable=e=>e.tabIndex>=0&&!e.disabled&&e.getClientRects().length>0;
 window.__controls=w=>[...w.querySelectorAll('${FOCUSABLE}')].filter(tabbable);
 window.__behind=(a)=>{const pin=a.closest('tr')?.querySelector(':scope > .sheetsmith-table-name');if(!pin||pin.contains(a))return 0;
  const p=pin.getBoundingClientRect(),r=a.getBoundingClientRect();const over=Math.min(p.right,r.right)-Math.max(p.left,r.left);return over>0.5?Math.round(over*10)/10:0;};
 const all=[...document.querySelectorAll('.sheetsmith-view .sheetsmith-table-wrapper')].filter(w=>w.scrollWidth>w.clientWidth+1&&__controls(w).length>1);
 all.forEach((w,i)=>{w.dataset.measure=String(i);});
 return all.map(w=>({label:w.closest('.sheetsmith-cell')?.querySelector('[class*=label]')?.textContent??'?',controls:__controls(w).length}));
})()`;
async function loadFocus(text, phone) {
	const [viewport, width] = phone ? [380, 0] : [620, 520];
	// `shot.mjs`'s `platform=phone`, through the one staging both share, so 380
	// is a phone and not a squeezed frame.
	const { took, unstage } = await loadStaged(
		browser,
		`file://${root}index.html?surface=sheet&theme=light&state=populated&width=${width}&text=${text}`,
		{ width: viewport, height: 1900, platform: phone ? 'phone' : null },
	);
	if (took !== null) check(took, `(9) 380 phone${text ? ` text=${text}` : ''}: phone staging took, every class of it`);
	// Off before the walk, as it always was here: check 9 drives real keys,
	// and what it measures is where focus lands, not how tall a control is.
	await unstage();
}
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
for (const [phone, text] of [[false, 0], [false, 24], [true, 0], [true, 24]]) {
	await loadFocus(text, phone);
	const at = `${phone ? '380 phone' : '520'}${text ? ` text=${text}` : ''}`;
	const scrollers = await evaluate(SCROLLERS);
	if (!phone && text === 0) check(scrollers.length > 0, '(9) at 520 at least one table scrolls, or this check holds nothing');
	for (const [index, one] of scrollers.entries()) {
		const W = `document.querySelector('[data-measure="${index}"]')`;
		const behind = [];
		// Each control but the first: the one after it focused, the table
		// scrolled fully right, and a real Shift-Tab, not a script's focus().
		for (let i = 1; i < one.controls; i++) {
			await evaluate(`(()=>{const w=${W};__controls(w)[${i}].focus({preventScroll:true});w.scrollLeft=w.scrollWidth;})()`);
			await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...SHIFT_TAB });
			await send('Input.dispatchKeyEvent', { type: 'keyUp', ...SHIFT_TAB });
			const landed = await evaluate(`(()=>{const a=document.activeElement;return {over:__behind(a),name:a.getAttribute('aria-label')??a.tagName};})()`);
			if (landed.over > 0) behind.push(`${landed.name} ${landed.over}px`);
		}
		check(behind.length === 0, `${at} ${one.label}: (9) Shift-Tab back from scrolled right lands clear of the sticky name, ${one.controls} controls`, behind.slice(0, 3).join(', '));
	}
}

// 10. A commit in a table scrolled right leaves it scrolled where it was.
/**
 * Every scroller that scrolls, by its index among all of them: stable across a
 * commit, where an index among only the overflowing ones moved whenever a commit
 * changed which tables overflow, and measured one table twice.
 */
const ALL = `[...document.querySelectorAll('.sheetsmith-view .sheetsmith-table-wrapper')]`;
const OVERFLOWING = `${ALL}.map((w,i)=>w.scrollWidth>w.clientWidth+1&&__controls(w).length>1?i:-1).filter(i=>i>=0)`;
/** The scroller, its committing control and where both stand, read off the live page. */
const STANDING = `(()=>{
 const a=document.activeElement;const w=a?.closest('.sheetsmith-table-wrapper');if(!w)return null;
 const cell=a.closest('.sheetsmith-cell');const index=[...cell.querySelectorAll('${FOCUSABLE}')].indexOf(a);
 const s=w.getBoundingClientRect();const start=s.left+w.clientLeft,far=start+w.clientWidth;const r=a.getBoundingClientRect();const row=a.closest('tr').getBoundingClientRect();
 return {name:a.getAttribute('aria-label')??a.tagName,index,left:w.scrollLeft,startInside:r.left>=start-0.5,past:Math.round(Math.max(0,r.right-far)*10)/10,behind:__behind(a),offset:Math.round((r.left-row.left)*10)/10};
})()`;
for (const [phone, text] of [[false, 0], [false, 24], [true, 0], [true, 24]]) {
	await loadFocus(text, phone);
	const at = `${phone ? '380 phone' : '520'}${text ? ` text=${text}` : ''}`;
	await evaluate(SCROLLERS);
	const indices = await evaluate(OVERFLOWING);
	let measured = 0;
	for (const index of indices) {
		const W = `${ALL}[${index}]`;
		const target = await evaluate(`(()=>{const w=${W};w.scrollLeft=w.scrollWidth;
		 const s=w.getBoundingClientRect(),far=s.left+w.clientLeft+w.clientWidth;
		 const commits=__controls(w).filter(c=>(c.matches('input')&&!c.readOnly&&c.type!=='checkbox')||c.matches('button.sheetsmith-level-ring')).filter(c=>c.getBoundingClientRect().right<=far+0.5);
		 const c=commits.sort((x,y)=>x.getBoundingClientRect().right-y.getBoundingClientRect().right).pop();if(!c)return null;
		 c.focus({preventScroll:true});if(document.activeElement!==c)return null;
		 const label=w.closest('.sheetsmith-cell')?.querySelector('[class*=label]')?.textContent??'?';
		 return {label,input:c.matches('input'),value:c.matches('input')?c.value:null};})()`);
		if (target === null) continue;
		const before = await evaluate(STANDING);
		if (target.input) {
			const typed = /^-?\d+$/.test(target.value.trim()) ? String(Number(target.value) + 1) : `${target.value}x`;
			await evaluate('document.activeElement.select()');
			await send('Input.insertText', { text: typed });
			await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
			await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
		} else {
			await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' });
			await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
		}
		await sleep(300);
		const after = await evaluate(STANDING);
		measured += before.left > 0 ? 1 : 0;
		// A named level carries its state in its name (`docs/UI.md` §6), so the
		// name is compared up to its state: `Rating: 0` and `Rating: 1` are one ring.
		const bare = (name) => name.replace(/: [^:]*$/, '');
		const kept = after !== null && bare(after.name) === bare(before.name) && after.index === before.index;
		check(kept, `${at} ${target.label}: (10a) the committed control keeps focus across the rebuild`, `${before.name}#${before.index} -> ${after === null ? 'body' : `${after.name}#${after.index}`}`);
		if (!kept) continue;
		check(Math.abs(after.left - before.left) <= 1, `${at} ${target.label}: (10b) the scroller comes back at its offset`, `${before.left} -> ${after.left}`);
		/*
		 * Held: the control starts inside the scrollport and clear of the name.
		 * Printed, not held: how far it runs past the far edge. Either it already
		 * did before the commit — a field wider than the room beside the name,
		 * whose cell's start goes against the name (`docs/UI.md` §4) — or a column
		 * ahead of it widened in the commit, the accepted drift. Anything else past
		 * the far edge fails.
		 */
		const widened = after.offset !== before.offset;
		// Wider than its room excuses only what was already past before the
		// commit, within a pixel: a scroller reset to 0 carried this same field
		// from 43.7 to 111.7px past, and that is the failure, not the room.
		const overhang = after.past > 0 && (widened || after.past <= before.past + 1);
		if (overhang) console.log(`      ${at} ${target.label}: ${widened ? `drift ${after.past}px, a column ahead widened ${before.offset} -> ${after.offset}` : `wider than its room: past the far edge ${before.past} -> ${after.past}px, as before the commit`}`);
		check(after.startInside && after.behind === 0 && (after.past === 0 || overhang), `${at} ${target.label}: (10c) the control starts on screen, clear of the sticky name`, `past ${after.past}px, behind ${after.behind}px`);
	}
	console.log(`      ${at}: ${indices.length} scrollers, ${measured} measured scrolled`);
	if (!phone && text === 0) check(measured > 0, '(10) at 520 at least one scroller is measured scrolled, or this check holds nothing');
}

await browser.close();
process.exit(failed === 0 ? 0 : 1);
