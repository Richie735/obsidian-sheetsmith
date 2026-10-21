/*
 * The measurements `docs/features/list-scroll-cap.md` makes a criterion, as a
 * script a reviewer can run again: not shipped, and not a test, because it needs
 * a browser. Run `npm run harness` first (it measures the built bundle), then
 *
 *   node harness/measure-lists.mjs
 *
 * It drives Chrome over the DevTools Protocol through `cdp.mjs`, stages the
 * phone and the tablet through `loadStaged`, so 380 is a phone and not a
 * squeezed frame, and measures with the staging still on, touch included, so a
 * coarse pointer's rules answer. It prints its numbers and exits non-zero if any
 * check fails.
 *
 *  1. Floor. For every component holding a Rows or Columns list, in every
 *     harness state that stages one, at every width the harness stages the
 *     editor at, read off `shot.mjs`'s own view list: every entry's height, plus the sticky header's where it is
 *     drawn, is no more than the scroller's resolved `max-height`. An entry is
 *     a `.sheetsmith-entry-row` in Rows and a `.sheetsmith-list-entry` in
 *     Columns. The windows are 500px tall, so `100dvh - 300px` is under both
 *     floors and the cap measured is the floor itself; the cap only grows with
 *     the window, so passing here passes at every height. It prints the tallest
 *     entry per width, which is the number `editor.css` quotes at the rule.
 *  2. Ceiling. At 1500 x 900 and 380 phone x 800, Skills' scrollers resolve
 *     to 400px.
 *  3. Distance. Skills with Add row pressed until it holds eighteen rows, at
 *     1500 x 900 and 380 phone x 800: the Rows list stands at its cap, and the
 *     Columns group's title bottom is no more than one window height below the
 *     Rows group's top. This is the rule's purpose as a measurement.
 *  4. Not vacuous. At 380 under phone staging at least one list overflows its
 *     cap, and the tallest entry is over 300px, so check 1 is measuring stacked
 *     entries and not passing on an empty list.
 *  5. Unchanged. Skills under `state=broken` at 1500, the `editor-row-error`
 *     view, holds both lists whole with no scroller, and prints their heights.
 *  6. Field floor (`docs/features/list-field-phone-floor.md`). At 380 under
 *     phone staging, over every component, no field of a Rows or Columns entry
 *     row is under 150px. A touch row's three buttons once opened a third
 *     column that left Skills' Row name and every Key at 26px; this is what
 *     goes red if a stacked row loses its two field tracks. At 380 unstaged
 *     only each row's first field is held, the Row name or the Key: a desktop
 *     stacked row keeps its two `auto`-placed columns, accident and all, and on
 *     a four-field Rows list (Stat roster's shape) that has always drawn the
 *     Stat select at 95 to 116px. Those are printed, not failed.
 *
 * Each component is selected through the outline rather than by reloading, so
 * a run stays in minutes.
 */
import { fileURLToPath } from 'node:url';
import { CHROME, launch, loadStaged, wait as sleep } from './cdp.mjs';
import { DEFAULTS } from './shot.mjs';

if (!CHROME) {
	console.error('No Chrome-family browser found.');
	process.exit(1);
}
const root = fileURLToPath(new URL('.', import.meta.url));
// The walk paces itself on `setTimeout`, and Chrome may throttle the timers of
// a page it counts as backgrounded. Nothing here is a background page, so the
// throttling is off; a stalled run was one reason to suspect it (below).
const browser = await launch([
	'--window-size=1500,900',
	'--disable-background-timer-throttling',
	'--disable-renderer-backgrounding',
	'--disable-backgrounding-occluded-windows',
]);
const { send } = browser;
/**
 * `evaluate`, bounded and tried twice. Three long runs stalled with the page
 * loaded and the helpers never installed, at a different width each time, and
 * the cause was not isolated: the run that finished had this, the bounded
 * navigation in `loadStaged` and the throttling flags above all at once, and
 * this retry never fired in it. So it is a bound rather than a fix — a stall
 * now says so and fails, instead of waiting for ever.
 */
async function evaluate(expression, ms = 120000) {
	for (let attempt = 1; ; attempt++) {
		const timedOut = Symbol('timed out');
		const result = await Promise.race([browser.evaluate(expression), sleep(ms).then(() => timedOut)]);
		if (result !== timedOut) return result;
		if (attempt === 2) throw new Error(`No reply in ${ms}ms, twice: ${expression.slice(0, 60)}`);
		console.log(`      (no reply in ${ms}ms, sent again: ${expression.slice(0, 40).replace(/\s+/g, ' ')})`);
	}
}
await send('Emulation.setFocusEmulationEnabled', { enabled: true });

let failed = 0;
const check = (ok, what, detail = '') => {
	if (!ok) failed++;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  ${detail}` : ''}`);
};

const STATES = ['populated', 'broken', 'notes', 'three-parts', 'record-groups', 'text-groups', 'pinned-add'];
/**
 * Every width `shot.mjs` stages the editor at, read off its own view list
 * rather than copied, so a view added there at a new width is measured here:
 * the window width, the platform staged, and the stage's own `width=` where a
 * view narrows the pane inside a wider window.
 */
const WIDTHS = [
	...new Map(
		DEFAULTS.filter((view) => view.query.startsWith('surface=editor')).map((view) => {
			const width = Number(view.size.split(',')[0]);
			const platform = view.platform ?? null;
			const stage = new URLSearchParams(view.query).get('width');
			return [`${width}|${platform}|${stage}`, { width, platform, stage }];
		}),
	).values(),
].sort((a, b) => b.width - a.width || (a.stage ?? 9999) - (b.stage ?? 9999) || String(a.platform).localeCompare(String(b.platform)));
const at = ({ width, platform, stage }) => `${width}${stage ? ` width=${stage}` : ''}${platform ? ` ${platform}` : ''}`;

/**
 * Load the editor through `cdp.mjs`'s staged load, and say whether the staging
 * took. The staging stays on until the caller has measured: touch emulation is
 * what makes the coarse-pointer rules answer, and a phone measured without it
 * is a fine pointer on a phone's body classes.
 */
async function load(query, where, height) {
	const url = `file://${root}index.html?surface=editor&theme=light&${query}${where.stage ? `&width=${where.stage}` : ''}`;
	const loaded = await loadStaged(browser, url, { width: where.width, height, platform: where.platform });
	if (loaded.took !== null) check(loaded.took, `${query} ${at(where)}: ${where.platform} staging took, every class of it`);
	return loaded.unstage;
}

const HELPERS = `(()=>{
 const px=v=>parseFloat(v);
 window.__lists=()=>[...document.querySelectorAll('.sheetsmith-editor-panel .sheetsmith-list-scroll')].map(s=>{
  const columns=s.parentElement.classList.contains('sheetsmith-list-columns');
  const head=s.querySelector(':scope > .sheetsmith-entry-columns');
  const header=head===null?0:head.getBoundingClientRect().height;
  const entries=[...s.querySelectorAll(columns?':scope > .sheetsmith-list-entry':':scope > .sheetsmith-entry-row')].map(e=>e.getBoundingClientRect().height);
  const group=s.parentElement.previousElementSibling;
  const title=group?.querySelector('.sheetsmith-form-group-title')?.firstChild?.textContent??'?';
  return {list:title,columns,cap:px(getComputedStyle(s).maxHeight),client:s.clientHeight,scroll:s.scrollHeight,header,tallest:Math.max(0,...entries),count:entries.length};
 });
 window.__expand=async()=>{for(let i=0;i<50;i++){const shut=[...document.querySelectorAll('.sheetsmith-tree-disclosure[aria-expanded=false]')];if(!shut.length)return;shut.forEach(b=>b.click());await new Promise(r=>setTimeout(r,30));}};
 window.__walk=async()=>{
  await __expand();
  const out=[];
  for(let i=0;;i++){
   const names=[...document.querySelectorAll('.sheetsmith-tree-name')];
   if(i>=names.length)break;
   const name=names[i].textContent.trim();
   names[i].click();
   await new Promise(r=>setTimeout(r,40));
   for(const one of __lists())out.push({component:name,...one});
  }
  return out;
 };
})()`;

const round = (n) => Math.round(n * 10) / 10;

// 1 and 4. The floor, at every width, in every state.
let phoneTallest = 0;
let phoneOverflows = 0;
for (const where of WIDTHS) {
	const phone = where.platform === 'phone' && where.stage === null;
	let tallest = null;
	let measured = 0;
	let cut = 0;
	for (const state of STATES) {
		const unstage = await load(`state=${state}`, where, 500);
		await evaluate(HELPERS);
		const lists = await evaluate('__walk()');
		await unstage();
		measured += lists.length;
		for (const one of lists) {
			const need = one.tallest + one.header;
			if (tallest === null || need > tallest.need) tallest = { ...one, state, need };
			if (one.count > 0 && need > one.cap + 0.5) {
				cut++;
				check(false, `(1) ${at(where)} ${state} ${one.component} ${one.list}: its tallest entry is whole under the cap`, `${round(one.tallest)} + ${round(one.header)} header against ${one.cap}`);
			}
			if (phone && one.scroll > one.client + 1) phoneOverflows++;
		}
	}
	if (phone) phoneTallest = tallest?.tallest ?? 0;
	// Each cut entry already failed above; this line says the width's verdict.
	if (cut === 0) check(measured > 0, `(1) ${at(where)}: every entry, with its header, fits its list's cap`, `${measured} lists`);
	else console.log(`      ${at(where)}: ${cut} of ${measured} lists cut an entry`);
	if (tallest !== null) {
		console.log(`      ${at(where)} tallest: ${round(tallest.tallest)} + ${round(tallest.header)} header = ${round(tallest.need)} against a ${tallest.cap}px cap (${tallest.component}, ${tallest.list}, ${tallest.state})`);
	}
}
check(phoneOverflows > 0, '(4) at 380 under phone staging at least one list overflows its cap', `${phoneOverflows} lists`);
check(phoneTallest > 300, '(4) at 380 under phone staging the tallest entry is over 300px', `${round(phoneTallest)}`);

// 2 and 3. Skills' ceiling, and the distance an eighteen-row list leaves.
for (const [width, height, platform] of [
	[1500, 900, null],
	[380, 800, 'phone'],
]) {
	const where = { width, platform, stage: null };
	const unstage = await load('state=populated&open=skills', where, height);
	await evaluate(HELPERS);
	const caps = await evaluate('__lists().map(one=>one.cap)');
	// The entries the rule's comment quotes for Skills, as drawn on first open.
	const drawn = await evaluate(`JSON.stringify([...document.querySelectorAll('.sheetsmith-editor-panel .sheetsmith-list-scroll')].map(s=>[...s.querySelectorAll(':scope > .sheetsmith-entry-row, :scope > .sheetsmith-list-entry')].map(e=>Math.round(e.getBoundingClientRect().height*10)/10)))`);
	console.log(`      ${at(where)} x ${height} Skills entries, Rows then Columns: ${drawn}`);
	check(caps.length === 2 && caps.every((cap) => cap === 400), `(2) ${at(where)} x ${height}: Skills' scrollers resolve to 400px`, caps.join(', '));

	const ROWS = `[...document.querySelectorAll('.sheetsmith-editor-panel .sheetsmith-list-scroll')].find(s=>!s.parentElement.classList.contains('sheetsmith-list-columns'))`;
	for (let press = 0; press < 40; press++) {
		const rows = await evaluate(`${ROWS}.querySelectorAll(':scope > .sheetsmith-entry-row').length`);
		if (rows >= 18) break;
		// A real click, the way an author gets there.
		const point = await evaluate(`(()=>{const b=[...${ROWS}.parentElement.querySelectorAll('button')].find(x=>x.textContent.trim()==='Add row');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
		for (const type of ['mousePressed', 'mouseReleased']) {
			await send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
		}
		await sleep(150);
	}
	const distance = await evaluate(`(()=>{
	 const rows=${ROWS};const cols=document.querySelector('.sheetsmith-editor-panel .sheetsmith-list-columns > .sheetsmith-list-scroll');
	 const top=rows.parentElement.previousElementSibling.getBoundingClientRect().top;
	 const title=cols.parentElement.previousElementSibling.querySelector('.sheetsmith-form-group-title').getBoundingClientRect().bottom;
	 return {rows:rows.querySelectorAll(':scope > .sheetsmith-entry-row').length,client:rows.clientHeight,cap:parseFloat(getComputedStyle(rows).maxHeight),scroll:rows.scrollHeight,distance:title-top};
	})()`);
	check(distance.rows === 18 && distance.scroll > distance.client && Math.abs(distance.client - distance.cap) <= 0.5, `(3) ${at(where)} x ${height}: eighteen rows stand at the cap`, `${distance.rows} rows, ${distance.client} of ${distance.scroll} in a ${distance.cap}px cap`);
	check(distance.distance <= height, `(3) ${at(where)} x ${height}: the Columns title is inside the first window below the Rows group's top`, `${round(distance.distance)}px against ${height}`);
	await unstage();
}

// 5. A desktop list under the old cap is unchanged: Skills under `state=broken`
// at 1500, the `editor-row-error` view, stands whole with no scroller.
await load('state=broken&open=skills', { width: 1500, platform: null, stage: null }, 900);
await evaluate(HELPERS);
for (const one of await evaluate('__lists()')) {
	check(one.scroll <= one.client + 1, `(5) 1500 broken Skills ${one.list}: whole, no scroller`, `${one.client}px of ${one.scroll}, cap ${one.cap}`);
}

// 6. No field of a Rows or Columns entry row is narrower than 150px at 380,
// touch or not. It counts the fields it read, so an empty walk fails.
const FIELD_FLOOR = 150;
for (const where of [
	{ width: 380, platform: 'phone', stage: null },
	{ width: 380, platform: null, stage: null },
]) {
	const unstage = await load('state=populated', where, 800);
	await evaluate(HELPERS);
	const narrow = await evaluate(`(async()=>{
	 await __expand();
	 let read=0;const under=[];
	 for(let i=0;;i++){
	  const names=[...document.querySelectorAll('.sheetsmith-tree-name')];
	  if(i>=names.length)break;
	  const name=names[i].textContent.trim();
	  names[i].click();
	  await new Promise(r=>setTimeout(r,40));
	  for(const field of document.querySelectorAll('.sheetsmith-editor-panel .sheetsmith-list-scroll .sheetsmith-entry-row > .sheetsmith-field')){
	   read++;
	   const width=field.getBoundingClientRect().width;
	   const first=field.parentElement.querySelector(':scope > .sheetsmith-field')===field;
	   if(width<${FIELD_FLOOR})under.push({first,what:name+' '+(field.querySelector('.sheetsmith-field-name')?.textContent??'?')+' '+Math.round(width*10)/10});
	  }
	 }
	 return {read,under};
	})()`);
	await unstage();
	const touch = where.platform === 'phone';
	const held = narrow.under.filter((one) => touch || one.first);
	const list = (some) => [...new Set(some.map((one) => one.what))].slice(0, 8).join('; ');
	check(narrow.read > 0 && held.length === 0, `(6) ${at(where)}: no ${touch ? '' : 'first '}Rows or Columns field is under ${FIELD_FLOOR}px`, `${narrow.read} fields${held.length ? `, under: ${list(held)}` : ''}`);
	const known = narrow.under.filter((one) => !held.includes(one));
	if (known.length) console.log(`      ${at(where)} narrower, as a desktop stacked row has always drawn them: ${list(known)}`);
}

await browser.close();
process.exit(failed === 0 ? 0 : 1);
