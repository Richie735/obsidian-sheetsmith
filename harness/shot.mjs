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

/**
 * The editor pane's frame, tall because the tree is the whole layout.
 *
 * The pane lists every component the layout holds, one settings row each, under
 * a schematic of the grid — so it is about as tall as the sheet is and for the
 * same reason. Same rule as SHEET_FRAME above: the number is the pane's height
 * and nothing else. Raise it when the harness layout grows — **or when the pane
 * grows a region**, which is how it last went stale: drawing the grid a nested
 * selection sits on added a second schematic to the left column and pushed the
 * add row out of the frame, silently, in the shot that is supposed to show it.
 */
const EDITOR_FRAME = '1500,5000';

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
	{
		// The pane above its reflow threshold: the tree beside the panel, with a
		// container selected so the second schematic is on screen and the rows of
		// what it holds sit directly under its own row — which is the docs/UI.md
		// §12 row this pane closed, and the only way to see that it stayed
		// closed is to look.
		name: 'editor-light',
		query: 'surface=editor&theme=light&open=weapons',
		size: EDITOR_FRAME,
	},
	{
		name: 'editor-dark',
		query: 'surface=editor&theme=dark&open=weapons',
		size: EDITOR_FRAME,
	},
	{
		// The pane below it, stacked: schematic, tree, then panel. 1190 rather
		// than a comfortably narrow width on purpose — the threshold is 1176px of
		// pane and 1190 of window is 1164 of pane, so this and the two above
		// bracket the number itself rather than illustrating two arbitrary widths.
		// Move it with the threshold. (The window loses 2px to Chrome before
		// `.view-content` spends its 24 on padding; this comment used to name the
		// padding alone and so put the pane 2px high.)
		//
		// Taller than EDITOR_FRAME because stacking puts the panel *under* the
		// tree rather than beside it, and a frame that cropped the panel would
		// crop the half this view exists to show.
		name: 'editor-stacked',
		query: 'surface=editor&theme=light&open=weapons',
		size: '1190,5700',
	},
	{
		// Forced colors, which the system palette repaints the whole page in and
		// which discards every `box-shadow` on it. **Chrome does take a switch for
		// this** — `--force-high-contrast` — which `docs/UI.md` §12's contrast row
		// had recorded as impossible, having only tried the two flags for
		// `prefers-contrast`. That is worth a default view rather than a one-off,
		// because what it shows cannot be reasoned about from the stylesheet: the
		// pane's selected tree row has no border to recolour (Obsidian gives
		// `.setting-item` none), so its accent ring is a shadow and nothing else,
		// and without the transparent-outline companion the row this pane's whole
		// right-hand column belongs to is unmarked among forty.
		//
		// A Table rather than the container the three shots above open, because
		// this is the mode the pane's booleans fail in and a Table's form is the
		// only one holding both kinds: Obsidian's toggle, which the app repaints
		// here, and the bare per-column checkbox, which it does not. Ticked ones
		// were pixel-identical to clear ones until `editor.css` answered it, and a
		// defect with no default view is a defect that comes back.
		name: 'editor-forced-colors',
		query: 'surface=editor&theme=light&open=inventory',
		size: EDITOR_FRAME,
		flags: ['--force-high-contrast'],
	},
	{
		// The one view with a fold in it. Every other shot here lets the pane
		// grow past the window, so what a reader sees at once has never been
		// photographed at all — only the whole surface, laid out flat. `&bounded`
		// gives the leaf the window's own height. 900 because that is about what a
		// leaf gets on a laptop, and not because anything here was measured at it
		// — and note the frame is not the fold: headless Chrome spends window
		// chrome out of it and the harness bar takes 47px more, so the leaf here
		// is 766px. `theme.css` carries both subtractions. `editor-threshold`
		// below gets 728, because at 1210 the bar wraps to two rows.
		//
		// `alignment` is a component low in the tree, so the panel is the far
		// end of a long list rather than the top of a short one.
		//
		// **What it shows, and what it does not.** It shows how much of the pane
		// arrives in one screen, and what falls below the fold. It also shows the
		// two-column promise holding: the tree and the panel clip on one line,
		// the leaf's own bottom edge, because each column is its own scroller —
		// where one shared scroller would put the panel's top wherever the tree
		// had been scrolled to. The leaf's edge being *drawn at all* is the whole
		// of the difference from a grown shot, and it is worth knowing that a
		// missing `height` anywhere in the chain takes it away while leaving a
		// picture that still looks cropped. See `theme.css`.
		//
		// It does not show a *scrolled* pane — a still has no scroll position, and
		// the single-scroller defect that made this row would need one. No
		// scrollbar is in the picture either, whatever `--hide-scrollbars` is
		// doing: macOS paints overlay scrollbars, which appear while scrolling and
		// nowhere else.
		name: 'editor-bounded',
		query: 'surface=editor&theme=light&open=alignment&bounded',
		size: '1400,900',
	},
	{
		// The narrowest split there is, bounded. 1210 of window is 1184 of pane —
		// eight pixels above the 1176 threshold, so this is the two-column regime
		// at its tightest, and `editor-stacked` at 1190 is the same pane twelve
		// pixels the other side of it. Two subtractions, as with the height:
		// headless Chrome spends 2px of the width it is given, and `.view-content`
		// spends 24 more on padding.
		//
		// Above the threshold rather than on it, deliberately. `size=1202` lands
		// the pane on 1176 exactly and the panel on the 580px the CSS comment
		// names — and sits one pixel from photographing the stacked regime
		// instead, silently, in the shot that exists to show the split.
		//
		// It exists because `editor.css` stopped pinning the panel at 620 there:
		// the two columns now share what the pane cannot give both, so the form is
		// 584px here rather than 620 — half of 1184 less the gap. That is 36px
		// under the width these forms are known at, and the only way to judge a
		// form is to see it — bounded,
		// because a form that reads fine laid out flat can still put its last
		// field below the fold.
		name: 'editor-threshold',
		query: 'surface=editor&theme=light&open=inventory&bounded',
		size: '1210,900',
	},
	{
		// The narrow regime, which had no view at all: `editor-stacked` at 1190 was
		// the narrowest editor shot, and everything below it was unlooked at. This
		// one shows a pane that does not fit — the picker's delete clipped, the
		// schematic running off the right, the panel's `height` field off-screen
		// entirely. It is here *because* it is wrong: `docs/UI.md` §12 has the row
		// and this is the picture it points at, and a regime with no shot is how
		// this shipped. 380 to match the sheet's own narrow view.
		name: 'editor-narrow',
		query: 'surface=editor&theme=light&open=weapons',
		size: '380,5700',
	},
	{
		// No layouts at all: the first thing a new vault shows, and one of the
		// three states `docs/features/layout-editor-pane.md` says are "worse in a
		// pane than in a settings tab, which is why they are designed rather than
		// inherited". Designed, and until now never once drawn — the **State**
		// buttons break a component's config, which leaves the layout file
		// perfectly parseable, so neither this nor the one below had any view.
		name: 'editor-vacant',
		query: 'surface=editor&theme=light&layout=none',
		size: '1000,700',
	},
	{
		// A layout file that will not parse. The order is the load-bearing part:
		// the picker first, because it is how an author leaves a layout they
		// cannot edit, then the message where the tree would be — and no panel, so
		// the two-column rule reserves no empty track beside one line of error.
		name: 'editor-broken',
		query: 'surface=editor&theme=dark&layout=broken',
		size: '1400,420',
	},
	{ name: 'settings-light', query: 'surface=settings&theme=light', size: '1000,520' },
	{ name: 'settings-dark', query: 'surface=settings&theme=dark', size: '1000,520' },
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
