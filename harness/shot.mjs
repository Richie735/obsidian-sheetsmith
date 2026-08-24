/*
 * Screenshot the harness, so a review can look at the UI instead of reading CSS.
 *
 * Uses whatever Chrome is installed, headless. No browser dependency is added
 * to the project for this: the harness is a static page, and a screenshot of it
 * is not worth a hundred megabytes of node_modules.
 *
 *   node harness/shot.mjs                          # every default view
 *   node harness/shot.mjs surface=settings theme=dark width=620
 *
 * Views are addressed by the harness's own query parameters, so anything
 * reachable by clicking is reachable by a shot. Output lands in harness/shots/,
 * which is gitignored.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CHROME = [
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	'/Applications/Chromium.app/Contents/MacOS/Chromium',
	'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
].find((path) => existsSync(path));

if (!CHROME) {
	console.error('No Chrome-family browser found. Install one, or open harness/index.html by hand.');
	process.exit(1);
}

const root = fileURLToPath(new URL('.', import.meta.url));
const page = `file://${root}index.html`;
const outDir = `${root}shots`;
mkdirSync(outDir, { recursive: true });

/**
 * The views worth having by default: both themes, both surfaces, and narrow.
 *
 * The sheet frames are 2500 tall because the sample sheet is about 2400, and a
 * default view that crops most of it is a default view that hides findings. They
 * were 900 while the sheet still fitted, and stayed 900 after it stopped — so the
 * tab set, and then the flag row below it, were only ever looked at through a
 * one-off `size=` on the command line. Raise this when the sample sheet grows
 * again; the number is the sheet's height and nothing else. Last raised when the
 * row of dropdown cards was added to the sample.
 */
const SHEET_FRAME = '1400,2700';

const DEFAULTS = [
	{ name: 'sheet-light', query: 'surface=sheet&theme=light', size: SHEET_FRAME },
	{ name: 'sheet-dark', query: 'surface=sheet&theme=dark', size: SHEET_FRAME },
	{
		// A second, roomier width for the alignment a container's design rests on:
		// a card inside a group lining up column for column with a card outside
		// it. Added when the default 1400 could not show it at all — every
		// four-column group stacked there, under a threshold since corrected — and
		// kept because tracks of 148px are easier to check by eye than 106px ones.
		name: 'sheet-wide',
		query: 'surface=sheet&theme=light',
		size: '1900,1100',
	},
	{
		// 4200 because the one-column sheet is about 4100 tall, and the frame
		// was 1400 — so every look criterion ever settled "at 380" was settled
		// against a picture holding the top third of the sheet. The row of
		// dropdown cards sits at y ~3600 and was cropped out entirely, which is
		// how three criteria came to be ticked against a shot that did not
		// contain them. Same rule as SHEET_FRAME above: the number is the
		// sheet's height in this reflow and nothing else.
		name: 'sheet-narrow',
		query: 'surface=sheet&theme=dark&width=380',
		size: '520,4200',
	},
	{
		// UI.md §5 puts the card's headline number in `em` rather than pixels
		// "so it follows the vault's text size setting", and until this entry
		// existed nothing had ever rendered a sheet at any size but the default:
		// the claim was argued in a comment and never once looked at. 24px is
		// half again the 16px default and well inside what Obsidian's Appearance
		// setting offers, so it is a size a reader actually sets rather than an
		// invented worst case. What it shows is truncation that grew, a
		// hierarchy that reordered, and controls that collided. See
		// `reference/legibility.md` §4. Taller frame because everything on the
		// sheet gets taller with it.
		name: 'sheet-large-text',
		query: 'surface=sheet&theme=light&text=24',
		size: '1400,3000',
	},
	{
		// The first view to photograph a focus ring at all. A still cannot press
		// Tab, so `&focus=` was added to the harness for this (see harness.ts),
		// and the sheet's rule is `:focus` rather than `:focus-visible`, so what
		// this shows is exactly what a tab press shows. The dropdown card,
		// because a native `<select>` is the one control here that arrives with
		// a focus treatment of its own: if the view scope ever lost, Obsidian's
		// ring would sit beside the card's and nothing else would report it.
		name: 'sheet-focus',
		query: 'surface=sheet&theme=light&focus=.sheetsmith-card-select',
		size: SHEET_FRAME,
	},
	{ name: 'sheet-empty', query: 'surface=sheet&theme=dark&state=empty', size: SHEET_FRAME },
	{ name: 'sheet-error', query: 'surface=sheet&theme=dark&state=broken', size: SHEET_FRAME },
	{ name: 'settings-light', query: 'surface=settings&theme=light', size: '1500,1500' },
	{ name: 'settings-dark', query: 'surface=settings&theme=dark', size: '1500,1500' },
	{
		// The stylesheet carries five `prefers-reduced-motion` blocks and the
		// gesture code two more branches, and none of it was ever rendered —
		// the unit tests cover the script paths, but nothing looked at what
		// the CSS does. A still cannot show motion; it can show a control
		// that lost a transform it needed for its resting state, which is the
		// failure a reduced-motion block actually risks.
		name: 'sheet-reduced-motion',
		query: 'surface=sheet&theme=dark',
		size: '1400,900',
		flags: ['--force-prefers-reduced-motion'],
	},
];

const args = process.argv.slice(2);
const views =
	args.length === 0
		? DEFAULTS
		: [
				{
					name: 'custom',
					query: args.filter((arg) => !arg.startsWith('size=')).join('&'),
					// `size=1500,3000` for a view that runs longer than the
					// default frame: an open component form is most of one.
					size: args.find((arg) => arg.startsWith('size='))?.slice(5) ?? '1500,1500',
				},
			];

for (const view of views) {
	const out = `${outDir}/${view.name}.png`;
	execFileSync(
		CHROME,
		[
			'--headless=new',
			'--disable-gpu',
			'--hide-scrollbars',
			// The page renders, then the settings tab renders asynchronously.
			// Without a budget the shot lands on an empty stage.
			'--virtual-time-budget=3000',
			...(view.flags ?? []),
			`--window-size=${view.size}`,
			`--screenshot=${out}`,
			`${page}?${view.query}`,
		],
		{ stdio: ['ignore', 'ignore', 'ignore'] },
	);
	console.log(`${view.name.padEnd(16)} ${out}`);
}
