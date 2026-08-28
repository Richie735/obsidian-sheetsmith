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
 * row of Image frames was added to the sample, at which point it measured 3442.
 *
 * **All three sheet frames are one number in three places and go stale together.**
 * `sheet-narrow` and `sheet-large-text` were left behind when this one was raised
 * for the Image row, and each then cropped the feature it was supposed to show.
 * Measure all three when the sample grows: load the harness at the view's width
 * and read `document.scrollingElement.scrollHeight`.
 */
const SHEET_FRAME = '1400,3700';

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
		// 6600 because the one-column sheet measures about 6500 — it was 6280 until
		// the second sizing pair added a seventh Image frame, which in this reflow
		// is another full-width block and about 230px of it, leaving roughly 100px
		// of slack here where there used to be 320. **Measure before adding the
		// next sample rather than after**, because this frame is now the tightest
		// of the three. It was 4200 before that — so
		// every look criterion ever settled "at 380" was settled against a
		// picture holding part of the sheet. **This is the second time this
		// number went stale, and the second time it hid a whole feature:** it
		// was 1400 while the sheet was 4100 and cropped the dropdown row, and
		// 4200 while the sheet was 6280, which cut three of the four Rich text
		// blocks and every Image frame. Same rule as SHEET_FRAME above — the
		// number is the sheet's height in this reflow and nothing else — and the
		// same instruction: raise it when the sample sheet grows.
		//
		// **Measure it rather than guessing.** Eyeballing a shot is what let it
		// go stale twice, because a cropped shot looks like a finished sheet. In
		// a browser on the harness page: `document.scrollingElement.scrollHeight`
		// at the width this view uses. A test cannot hold it — that needs a real
		// browser, and this file opens with the reason it does not drive one.
		name: 'sheet-narrow',
		query: 'surface=sheet&theme=dark&width=380',
		size: '520,6600',
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
		// sheet gets taller with it: 4500 against a measured 4201, where 3000
		// cut the whole Image row and most of the prose. It went stale in the
		// same pass as `sheet-narrow` and for the same reason — SHEET_FRAME was
		// raised for the wide views and these two were missed, which is the
		// argument for measuring all three together whenever the sample grows.
		name: 'sheet-large-text',
		query: 'surface=sheet&theme=light&text=24',
		size: '1400,4500',
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
	{
		/*
		 * The modifier breakdown, which is what a press reveals and so what no
		 * still could reach until `&press=` existed (see harness.ts).
		 *
		 * The armour class card rather than an ability score, and for two reasons.
		 * Its breakdown draws on *two* modifier tables, which is the only state in
		 * which a contributor line carries its component's label — so this is the
		 * qualified form, and the unqualified one is on the STR card a row above,
		 * unpressed, in every other sheet shot. And it sits low enough on the page
		 * that the bubble is not laid over the harness bar: the bubble is fixed to
		 * the viewport and a card near the top puts it behind chrome the app does
		 * not have, which is the instrument's own artefact rather than the
		 * plugin's.
		 *
		 * What to look at: whether the lines read as a list — one visual line per
		 * contributor, and the total separated from them by a blank one. Both are
		 * answers to what this shot caught twice. At `max-width: 20em`, a cap
		 * chosen when this bubble only ever held a formula, a two-contributor
		 * breakdown rendered as six wrapped lines with nothing saying where a
		 * contributor began; a hanging indent then made exactly one line flush,
		 * because `text-indent` addresses the first line of a block and a newline
		 * under `pre-wrap` starts no block. The cap is the fix, and `shared.css`
		 * carries the measurement it was set from. So a wrapped contributor line
		 * here is a regression, not a cosmetic quibble.
		 */
		name: 'sheet-breakdown',
		query:
			'surface=sheet&theme=light&press=.sheetsmith-card-single .sheetsmith-card-derived.sheetsmith-modified',
		size: SHEET_FRAME,
	},
	{
		// The same door on a table cell, where the payload is *joined*: the cell
		// has carried a second door onto its own formula since computed columns
		// shipped, so a modified cell shows the formula, a blank line, the
		// contributors and the total in one bubble rather than growing a second
		// control. Dark, so the one surface that stacks two payloads is
		// photographed in both themes across these two views.
		name: 'sheet-breakdown-cell',
		query:
			'surface=sheet&theme=dark&press=.sheetsmith-table-value.sheetsmith-modified',
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
		/*
		 * The layout editor with a modifier table selected, which is where three of
		 * this feature's editor surfaces live and where none of them had ever been
		 * photographed: the **Modifier** checkbox and the **Bonus type** select on
		 * a ticked column, and the accepting-targets list under the columns field.
		 *
		 * **The panel here is the table's, and only the table's.** This comment used
		 * to claim the layout's own **Bonus types** field was "further down" in the
		 * same shot; it is not, and never was — the layout's fields are behind the
		 * tree's `Layout` row, so selecting a component replaces them. `editor-layout`
		 * below is the view that has them. A comment naming a surface a shot does not
		 * hold is worse than no comment, because a reviewer checks it off unlooked at.
		 *
		 * 1500 rather than the usual editor width because the panel is what this is
		 * about, and the columns list is the widest thing in it — a modifier column
		 * puts seven controls on one detail line, which is what earned that line
		 * its `flex-wrap`.
		 */
		name: 'editor-modifiers',
		query: 'surface=editor&theme=light&open=magic_items',
		size: '1500,1500',
	},
	{
		/*
		 * The same panel at the split's tightest, which is the width the detail
		 * line's wrap has to survive: seven controls on one line at 1184 of pane is
		 * where a collapsed field shows, and a **Bonus type** select rendering as
		 * an empty 8px box is the defect this exists to catch.
		 *
		 * **Not `&bounded`, and that was measured rather than assumed.** Bounded
		 * gives the leaf the window's height, and the columns list sits well below
		 * a 900px fold — so the bounded version of this view photographs a panel
		 * whose subject is off-screen, which is worse than no shot because the name
		 * promises otherwise. A still has no scroll position, which `editor-bounded`
		 * already records as the thing it cannot show; that limitation decides this
		 * view rather than being worked around by it.
		 */
		name: 'editor-modifiers-narrow',
		query: 'surface=editor&theme=light&open=magic_items',
		size: '1210,2600',
	},
	{
		/*
		 * The layout's own settings, which no default view had ever shown: the grid
		 * column count, the reset triggers, the function library, and the **Bonus
		 * types** field this feature added beside it. Every editor shot above opens
		 * a component, and selecting one replaces the layout's form with it — so the
		 * pane's other half was reachable only by rendering with no `open` at all,
		 * which is how two verified findings here (the field's "For example:" line
		 * and the heading reading **Bonus types** rather than "Modifier types") came
		 * to have no view to be checked against.
		 *
		 * `open=::sheet::` rather than omitting `open`, deliberately: the layout is
		 * what the pane falls back to, but a shot whose subject is a *default* says
		 * nothing about what it is showing, and a later change to the fallback would
		 * silently repoint it. Naming the selection is the same argument
		 * `editor-light` makes for naming a container.
		 *
		 * The usual editor width, because these are ordinary `.setting-item` rows and
		 * three of the four are textarea fields that size to their content — none of
		 * them is the columns list, which is what earns the two shots above their
		 * 1500.
		 *
		 * **Framed to the panel, not to the pane**, which is why the height is 1200
		 * against EDITOR_FRAME's 5000: the layout's form ends about 1020px down and
		 * the rest of that 5000 is the tree, which `editor-light` and `editor-dark`
		 * already photograph whole. So the tree is cut here on purpose, the way
		 * `editor-modifiers` cuts it — the cut edge is the frame and not a clip, and
		 * the number to raise is this one if the layout ever grows a fifth field.
		 */
		name: 'editor-layout',
		query: 'surface=editor&theme=light&open=::sheet::',
		size: '1400,1200',
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
