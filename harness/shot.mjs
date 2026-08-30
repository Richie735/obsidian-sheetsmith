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
 * and read `document.scrollingElement.scrollHeight`. Last raised when the modifier
 * tables gained a `Worn` column and a row, at which point the default measured
 * 3810, the narrow one 7000 and the large-text one 3800 — which is why only two of
 * the three moved.
 *
 * **And the third one's measurement was wrong, which is worth recording because it
 * is the failure mode this comment exists to prevent.** Re-measured at the view's
 * own width *and its own text size*, `sheet-large-text` is 4716 and not 3800 — the
 * 3800 was the sheet at the default text size, so the one view whose whole subject
 * is a larger text size was measured without it. `sheet-narrow` has the same trap
 * with `&width=`. Measure each view **through its own query**, not at its own
 * width; `document.body.scrollHeight` is the steadier number, because
 * `scrollingElement.scrollHeight` returns the greater of the content and the
 * viewport and so agrees with any frame big enough.
 *
 * **And all three moved again for a reason that is not the sample growing.**
 * `harness:calibrate` never carried Obsidian's `input[type='text']` rule — the
 * entry meant to match it was spelled unquoted and matched nothing — so every text
 * field on a sheet was photographed at its padding's height instead of the app's
 * `--input-height: 30px`. There are 110 of them on the sample sheet, and putting
 * the app's own rule back added about 500px to it: 3810 to **4312** here, 7020 to
 * **7613** narrow, and 4760 to **4965** at `text=24`. Nothing in the plugin
 * changed. The instrument had been drawing a shorter sheet than Obsidian does
 * since before this feature, and every frame in this file was measured against it.
 */
const SHEET_FRAME = '1400,4340';

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
/*
 * Re-measured with the Modifiers list in the pane: 6650 at 1500 through
 * `open=weapons`, against the 5000 this was set to, so `editor-light`,
 * `editor-dark` and `editor-forced-colors` were each cutting about 1650px off the
 * bottom of the tree — the column this frame's own comment says it is tall for.
 * Stale before this feature rather than by it; found by measuring, which is the
 * instruction above.
 *
 * Re-measured again after the calibration fix SHEET_FRAME's comment describes,
 * which grows the pane for the same reason and by about the same proportion:
 * 7372 at 1500 through `open=weapons`, 7766 stacked and 8018 at 380.
 */
const EDITOR_FRAME = '1500,7400';

/**
 * The presses that open the panel on the sample's *mixed* row, and then its typed
 * part's own fields.
 *
 * One spelling, because there are now six views behind it and each was carrying its
 * own copy of the same URL-encoded selector — `docs/PATTERNS.md` §1 extracts at
 * three. The row is named by the one thing only a mixed row's `title` says, and the
 * line by `data-sheetsmith-part`, so neither can be moved by a fixture growing a row
 * or a part above it.
 */
const OPEN_MIXED_GLYPH =
	"press=.sheetsmith-table-modifier-button%5Btitle*%3D'item%20%2B1%20%28changes%20nothing%29'%5D";
const OPEN_MIXED_FORM = `${OPEN_MIXED_GLYPH}&press=.sheetsmith-panel-line%5Bdata-sheetsmith-part%3D'typed'%5D`;

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
		size: '520,7640',
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
		// 4760 against a measured 4716, which is 216 more than the 4500 this was set
		// to: see SHEET_FRAME's note above — the earlier figure was taken without
		// `text=24`, so the view existing to show a larger text size had its frame
		// measured at the smaller one and cropped the bottom 204px of the sheet.
		size: '1400,5000',
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
		 * The focus ring on a control whose whole face is a glyph.
		 *
		 * **It moved onto the thing being focused**, which is the correction the
		 * control kind bought. The cell used to stack a transparent `<select>` over
		 * the glyph, so the ring had to be drawn on the *box* around an invisible
		 * half; the cell is a `<button>` now, so the ring is on the button. Still an
		 * `outline`, because that is the one mark that survives forced-colors mode
		 * where a `box-shadow` is discarded. Worth photographing for the reason
		 * `sheet-focus` exists: a ring nobody photographs is a ring that regresses
		 * quietly, and this control resets `box-shadow` — where Obsidian's own ring
		 * lives — to strip the app's button chrome.
		 *
		 * Light rather than dark, matching `sheet-focus`, so the two rings are
		 * comparable side by side.
		 */
		name: 'sheet-modifier-focus',
		query: 'surface=sheet&theme=light&focus=.sheetsmith-table-modifier-button',
		size: SHEET_FRAME,
	},
	{
		/*
		 * **The first sheet shot in forced colors, for any component.**
		 * `editor-forced-colors` has existed since the pane found that its selected
		 * tree row had no mark at all in this mode; the sheet had none, so every
		 * `forced-colors` rule on it — the card's border, the table's, the dotted
		 * mark on a modified number — was reasoned about and never rendered.
		 *
		 * The modifier column is what makes it a default view rather than a one-off.
		 * It is the first control on a sheet whose *entire* state is a glyph, and
		 * this mode is where a colour channel goes: forced colors repaints the page
		 * in one system palette, so `zap` and `zap-off` both paint the same colour
		 * and the distinction survives on shape alone. That is the strongest
		 * evidence the glyph *pair* was the right call rather than one glyph with two
		 * strengths, and it belongs in the repository instead of in a reviewer's
		 * scratch directory.
		 *
		 * `theme=light`, which forced colors overrides anyway — the flag decides the
		 * palette, so naming a theme here only says which one the page asked for.
		 */
		name: 'sheet-forced-colors',
		query: 'surface=sheet&theme=light',
		size: SHEET_FRAME,
		flags: ['--force-high-contrast'],
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
		 * that the bubble *used to* clear the harness bar — which stopped being true
		 * the moment the breakdown grew: the bubble is fixed to the viewport, and at
		 * nine contributors it opens at y=76 under a bar whose bottom is 85, slicing
		 * the first contributor's ascenders and taking the bubble's own top border
		 * out of frame. **So this shot passes `&bar=off`**, which drops chrome the
		 * app does not have; there is no lower card with two sources to press
		 * instead, and lengthening the frame cannot help a surface positioned against
		 * the viewport.
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
			'surface=sheet&theme=light&bar=off&press=.sheetsmith-card-single .sheetsmith-card-derived.sheetsmith-modified',
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
	{
		/*
		 * **The form, which is the one surface of this feature a still cannot
		 * otherwise reach**: it is behind a press, and `docs/UI.md` §11 is the
		 * standing argument against reviewing a surface by reading its code.
		 *
		 * **Two presses, in order**, which is why `&press=` now takes several. The
		 * first opens the panel on the *mixed* row — a name and an effect typed on
		 * the row, in one cell — and the second opens the typed part's own six
		 * fields. One press would photograph the list and none of the form.
		 *
		 * **Selected by state, never by position.** The row is named by the one thing
		 * only a *mixed* row's `title` says — a suppressed line with `(changes
		 * nothing)` appended, which is the several-part summary form — and the line by
		 * `data-sheetsmith-part`, so neither selector can be moved by a fixture
		 * growing a row or a part above it. An `:nth-child` here has already gone
		 * quietly wrong once in this repository.
		 *
		 * What is in the frame: the list with a `zap-off` line and its reason under
		 * it, the `zap` line for the typed part, the six labelled fields, the promote
		 * row and **Remove**. The panel is this plugin's own surface rather than
		 * Obsidian's, so — unlike the menu it replaces — it is fully reviewable
		 * without `harness:calibrate` having been run.
		 *
		 * **The same state in both themes**, on `sheet-light` / `sheet-dark`'s own
		 * arrangement rather than the menu round's two different rows: the surface is
		 * the plugin's now, so what a reviewer checks is its own palette in each
		 * theme rather than whether borrowed chrome and the words inside it read
		 * together.
		 */
		name: 'sheet-modifier-form-light',
		query:
			`surface=sheet&theme=light&${OPEN_MIXED_FORM}`,
		size: SHEET_FRAME,
	},
	{
		/*
		 * The same row and the same disclosure in the dark palette. **Taller than
		 * `SHEET_FRAME` on purpose**: the panel is the largest surface this plugin
		 * draws on a sheet — six fields plus a list plus a promote row — and at the
		 * standard height it ran past the bottom of the page, so the shot evidenced
		 * the list and quietly did not evidence the fields. The app clamps and the
		 * harness has no such logic and should not grow one to make a screenshot
		 * work, so the page is taller instead.
		 */
		name: 'sheet-modifier-form-dark',
		query:
			`surface=sheet&theme=dark&${OPEN_MIXED_FORM}`,
		size: '1400,4200',
	},
	{
		/*
		 * **The panel as a first press leaves it**, which neither form shot above
		 * reaches: both press twice, so what a reader actually sees when they press a
		 * glyph — the list, and nothing open — was unphotographed.
		 *
		 * It is also the only view of the list at its own length: two lines, a reason
		 * under the first, the heading that says a line answers a press, and
		 * `+ Add a modifier` under them. What to look at is whether a line reads as
		 * pressable, which is the question the heading now answers in words because
		 * nothing in the line's own paint does.
		 */
		name: 'sheet-modifier-form-closed',
		query:
			`surface=sheet&theme=light&bar=off&${OPEN_MIXED_GLYPH}`,
		size: SHEET_FRAME,
	},
	{
		/*
		 * **The empty-cell path, which is first use and the case the design argues
		 * hardest for**: press the faint `plus` and the panel opens with
		 * `This row applies no modifier.` and one part *already open*, `Changes`
		 * focused — one opening where the menu round needed two. Nothing photographed
		 * it, so the claim was reviewable only by reading the code.
		 *
		 * The `Chalk` row, which is the sample's blank one, and the `plus` is the only
		 * mark in its cell.
		 */
		name: 'sheet-modifier-form-empty',
		query:
			"surface=sheet&theme=light&bar=off&press=.sheetsmith-table-modifier-button%5Baria-label%3D'Chalk%20Modifiers'%5D",
		size: SHEET_FRAME,
	},
	{
		/*
		 * **A named part open**, which is the most common configuration on a shared
		 * layout and had never been rendered: `Modifier` showing a definition, the
		 * four fields below it read-only, the line saying where they are edited, and
		 * **no promote row** — a part that already names a definition has nothing to
		 * promote.
		 *
		 * Dark, because the read-only treatment is a contrast question and dark is
		 * where a quieted control has least room; the pair measures 7.0:1 light and
		 * 5.83:1 dark, so what this shot is for is whether it *reads* as read-only
		 * rather than as broken.
		 */
		name: 'sheet-modifier-form-named',
		query:
			"surface=sheet&theme=dark&bar=off&press=.sheetsmith-table-modifier-button%5Btitle%3D'Armour%20class%20%E2%80%94%20sets%20to%2018'%5D&press=.sheetsmith-panel-line",
		size: SHEET_FRAME,
	},
	{
		/*
		 * **One cell naming the same modifier twice, with the second line open.**
		 * Two lines are drawn for one enrolment, so the second says
		 * `Already applied above; removing either takes both` and **Remove** on it
		 * reads `Remove all 2`.
		 *
		 * Here because that pair is the fix for the only real defect the owner found
		 * in this feature — a **Remove** that took one of two byte ranges and left the
		 * row still applying the modifier — and no sample spelled a name twice, so the
		 * fix for the loudest bug was the one thing in the feature nobody could look
		 * at. The `Warded bracers` row exists for this and nothing else.
		 */
		name: 'sheet-modifier-form-repeat',
		query:
			"surface=sheet&theme=light&bar=off&press=.sheetsmith-table-modifier-button%5Baria-label%5E%3D'Warded%20bracers'%5D&press=.sheetsmith-panel-entry:last-of-type .sheetsmith-panel-line",
		size: SHEET_FRAME,
	},
	{
		/*
		 * **The armed Remove**, which is the other half of the gesture and had never
		 * been photographed: the error tint mixed most of the way back to the page,
		 * and the word becoming `Remove — select again`.
		 *
		 * A third press, on the control the second press disclosed. It is also the one
		 * state where the panel's own paint has to beat the host's — Obsidian gives a
		 * `button` `--interactive-normal`, so an unscoped arming tint would leave the
		 * first press changing nothing a reader can see.
		 */
		name: 'sheet-modifier-form-armed',
		query: `surface=sheet&theme=light&bar=off&${OPEN_MIXED_FORM}&press=.sheetsmith-panel-remove`,
		size: SHEET_FRAME,
	},
	{
		/*
		 * **The panel at `Text → 24`, and the answer is that nothing in it moves.**
		 * Taken expecting the height cap to bite here — a cap in px over type that
		 * follows a vault setting is the shape of a clip — and it does not, for a
		 * reason worth having a shot of rather than a sentence: the panel hangs off
		 * `document.body` and sets `font-size: var(--font-ui-small)` on itself, so
		 * neither the stage's font size nor the reader's text setting reaches it. It
		 * is 390 x 479 here and 390 x 479 at the default, beside a sheet that grew
		 * 650px.
		 *
		 * That is Obsidian's own regime — every panel the app draws is `--font-ui-*`,
		 * and `docs/UI.md` §1 is why the plugin does not invent a type scale to
		 * follow the sheet instead — so what this view evidences is the *pairing*: a
		 * reader who has enlarged their sheet gets a panel at the app's UI size, and
		 * whether that reads as consistent or as small is a question a shot can put
		 * and prose cannot.
		 */
		name: 'sheet-modifier-form-large-text',
		query: `surface=sheet&theme=light&text=24&bar=off&${OPEN_MIXED_FORM}`,
		size: '1400,5000',
	},
	{
		/*
		 * **The panel on a narrow pane**, where it clamps to the viewport minus a
		 * gutter and sits inside a table that is itself scrolling. `docs/UI.md` §12
		 * holds the sub-500px floor; 520 is the narrowest a shot can honestly show,
		 * and it is still narrower than the panel's own 30em.
		 */
		name: 'sheet-modifier-form-narrow',
		query: `surface=sheet&theme=dark&width=380&bar=off&${OPEN_MIXED_FORM}`,
		size: '520,7640',
	},
	{
		/*
		 * **The panel in forced-colors mode.** Every fill and border on the page is
		 * repainted one system colour, so what is left has to be shape and text: the
		 * read-only fields' missing box, the list line's outline focus mark, and the
		 * armed **Remove**'s tint — which forced colors discards outright, leaving the
		 * word `— select again` as the whole of the mark.
		 */
		name: 'sheet-modifier-form-forced-colors',
		query: `surface=sheet&theme=light&bar=off&${OPEN_MIXED_FORM}`,
		size: SHEET_FRAME,
		flags: ['--force-high-contrast'],
	},
	{ name: 'sheet-empty', query: 'surface=sheet&theme=dark&state=empty', size: SHEET_FRAME },
	{
		/*
		 * **A fresh character: rows entered, no modifiers named.** The one state
		 * `sheet-empty` cannot reach — that view drops the bodies, so both modifier
		 * tables draw `No rows yet.` and the column is never photographed at all.
		 *
		 * Here for a ruling rather than for completeness. An empty cell's `plus` is
		 * the *only* mark in its column here, with no bolt anywhere to read the
		 * absence against, and that is the state where its contrast has teeth — the
		 * glyph was `--text-faint` at 2.20:1 and is now `--text-muted`. Light,
		 * because light is where faint measured worst.
		 */
		name: 'sheet-no-modifiers',
		query: 'surface=sheet&theme=light&state=unmodified',
		size: SHEET_FRAME,
	},
	{
		/*
		 * **The value pill reading a number nobody typed**, which is the one
		 * surface of the effective value that no shot has ever contained.
		 *
		 * `effective` is opt-in — the plugin cannot work out where a modifier
		 * landed (SPEC §4.2) — so the populated layout does not declare it, and
		 * until this state existed the accent on a computed pill and its swap back
		 * to the stored number under a caret had only ever been reasoned about. A
		 * colour that nobody has looked at is exactly what `docs/UI.md` §11 refuses
		 * to take on trust, and a pill is the smallest surface on the sheet.
		 *
		 * What is in the frame, top to bottom. The **Abilities** strip, where STR
		 * reads 19 against a stored 15 and carries the accent while the other five
		 * read what they store and do not — one marked number among six, which is
		 * the comparison the accent has to survive. The **Armour class** card just
		 * under it, where the pill reads 20 and the number above it 22, because
		 * only the evaluation that becomes the published name takes the override.
		 * And the **Stealth** dropdown far down the sheet, which declares
		 * `effective` and must ignore it: a menu reading `Expertise`, unaccented.
		 *
		 * Both themes, because the accent is `--text-accent` and the two palettes
		 * put it at different strengths against the pill's own fill.
		 */
		name: 'sheet-effective-light',
		query: 'surface=sheet&theme=light&state=effective',
		size: SHEET_FRAME,
	},
	{
		name: 'sheet-effective-dark',
		query: 'surface=sheet&theme=dark&state=effective',
		size: SHEET_FRAME,
	},
	{
		/*
		 * The same pill **under a caret**, which is the half that is not decoration:
		 * `current` is `bindEditable`'s baseline, so a field left reading 19 would
		 * step to 20 and commit 20 as the character's *stored* Strength — a note
		 * rewritten by a reader who never typed a digit (CLAUDE.md 4). Focused, the
		 * field is the stored 15 and reads as one, in `--text-normal` rather than
		 * the accent.
		 *
		 * `sheet-focus`'s own argument, on the one control where focus changes the
		 * text rather than only the ring: a swap nobody photographs is a swap that
		 * regresses quietly, and this one is a data rule wearing a display.
		 */
		name: 'sheet-effective-focus',
		query:
			'surface=sheet&theme=light&state=effective&focus=.sheetsmith-card-input-effective',
		size: SHEET_FRAME,
	},
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
		// 7100 against a measured 7046 at this width. Stacking is taller than the
		// split by about 400px, for the reason above, and 5700 was cutting the
		// panel this view exists to put under the tree.
		size: '1190,7800',
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
		/*
		 * Raised from 1200 when the Modifiers list arrived, from 2300 when the
		 * report went out of frame, and from 2600 when **Applies to** arrived and
		 * split each definition's detail across two rows: ten definitions, each a
		 * row plus a six-control detail line over two lines, and **the problem
		 * report under them is the whole point of the view** — it is the only thing
		 * explaining why one `Changes` select shows a bare `passive_perception`
		 * where the other nine show reader-facing labels. Measured at 2941; 3000
		 * clears it with a small margin rather than cutting `10 modifiers defined.`
		 * the way 2600 now does.
		 */
		size: '1400,3000',
	},
	{
		/*
		 * The Layout panel in forced colors, which `editor-forced-colors` cannot
		 * show: that view opens `inventory`, and selecting a component replaces the
		 * layout's own form with it — so the Modifiers list, the newest and the
		 * densest form in the pane, had no shot in this mode at all.
		 *
		 * What it is for: five controls on one detail line, of which three are
		 * pickers and two are typed, and forced colors is the mode that flattens
		 * every one of them to the same box with the same border. It is where a
		 * missing affordance is most visible and where the chevron that now says
		 * "this opens a menu" either survives or does not.
		 */
		name: 'editor-layout-forced-colors',
		query: 'surface=editor&theme=light&open=::sheet::',
		// Matches `editor-layout`'s own measurement: forced colors repaints the
		// page and reflows nothing, so the two frames move together whenever the
		// panel's content does — as they did not for a while, which is why this one
		// used to carry the finding the other view's frame was too short to show.
		size: '1400,3000',
		flags: ['--force-high-contrast'],
	},
	{
		/*
		 * The Modifiers list at the split's tightest, which is the regime the
		 * detail line's widths have to survive and which had no view: every editor
		 * shot of the Layout panel was 1400, so wide and narrow failed differently
		 * and only one was photographed. 1210 of window is 1184 of pane, eight
		 * pixels above the 1176 threshold — the same bracketing `editor-threshold`
		 * and `editor-stacked` do for the pane's other half. Move it with the
		 * threshold.
		 *
		 * **What this shows changed twice, and is worth stating rather than
		 * assumed.** It was added because at 1210 the five-control line wrapped to
		 * two rows, hiding the truncation the wide shot had: `Abilities · ST` with
		 * the T sliced through, `Armour clas`, `Skills · perc(`. A later fix gave
		 * `Changes` more than an equal share, which for a while made this the one
		 * view where the line still fit at five controls. **`Applies to`'s own
		 * arrival broke that fix**, not by narrowing further but by adding a sixth
		 * content-sized field that outgrew the dividend `Changes` had just been
		 * given — which is why this view and the wide one both regressed together
		 * rather than trading places, and why the fix this time is a forced line
		 * break rather than another width redistribution: `Changes`, `Operator` and
		 * `Amount` group on one row and `Applies to`, `Bonus type` and `Only when`
		 * on the next, at *every* width, so there is no regime left for a wrap to
		 * arrive in unannounced. What this now photographs is that grouping at the
		 * narrowest split, not a line surviving at five.
		 */
		name: 'editor-layout-threshold',
		query: 'surface=editor&theme=light&open=::sheet::',
		// Measured at 2975, close to `editor-layout`'s own 2941: the forced break
		// makes every detail line two rows regardless of width, so the panel is
		// only slightly taller narrow than wide rather than a different shape.
		// 3000 clears both with the same small margin.
		size: '1210,3000',
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
		// 7300 against a measured 7252 at 380, where every row is at its tallest.
		size: '380,8050',
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
	{
		// The grid canvas's own layout (`docs/features/grid-canvas.md`):
		// two overlapping cards and a Group holding a Table, all rendered
		// live — real card faces and a real `<table>`, not the interim
		// schematic's grey blocks. Nothing selected, so `Behind` and
		// `Front` paint in layout order, `Front` on top.
		name: 'canvas-live-light',
		query: 'surface=editor&theme=light&layout=canvas-demo',
		size: '1400,1400',
	},
	{
		name: 'canvas-live-dark',
		query: 'surface=editor&theme=dark&layout=canvas-demo',
		size: '1400,1400',
	},
	{
		/*
		 * The covered-component hazard, resolved (§2): `Behind` is drawn
		 * first and `Front` overlaps it, so selecting `Behind` is the case
		 * where its own handles would be invisible without the raise —
		 * `.sheetsmith-preview-editing`'s `z-index: 1`. What to look at:
		 * `Behind`'s resize corner and selection ring sit on top of
		 * `Front`'s card, and `Front` still paints over `Behind` everywhere
		 * neither is selected.
		 */
		name: 'canvas-overlap-selected',
		query: 'surface=editor&theme=light&layout=canvas-demo&open=behind',
		size: '1400,1400',
	},
	{
		/*
		 * Mid-resize, a real pointer gesture left in flight rather than a
		 * static end state (`editor-pane.ts`'s `resizeInPlace`): the
		 * `Inventory` table's own box has genuinely grown under a real
		 * browser's layout, so its columns have real width to reflow into.
		 * §3's own claim — a component visibly reflows as its box changes,
		 * with no re-render — is a look criterion, and this is the frame
		 * that has to show it rather than assert it.
		 */
		name: 'canvas-resize',
		query: 'surface=editor&theme=light&layout=canvas-demo&resize=gear%3A150%2C0',
		size: '1400,1400',
	},
	{
		// A valid drop, hovering: `Front` dragged onto `Gear`, a container
		// that accepts it, showing the drop highlight before release.
		name: 'canvas-tree-drag-valid',
		query: 'surface=editor&theme=light&layout=canvas-demo&treeHover=front%3Agear',
		size: '1400,1400',
	},
	{
		// A refused drop, completed: `Front` onto `Inventory`, a Table
		// rather than a container, which shows the inline message in place
		// rather than the drag being silently ignored.
		name: 'canvas-tree-drag-refused',
		query: 'surface=editor&theme=light&layout=canvas-demo&treeDrop=front%3Ainventory',
		size: '1400,1400',
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
