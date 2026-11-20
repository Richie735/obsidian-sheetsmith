# Sheet contrast pass

Status: shipped (approved by the owner: the full design, with option 1, the dotted rule, for the unresolved link)
Board card: three `docs/BACKLOG.md` § UI rows, taken in one pass because each
row's "Waiting on" cell names this pass: "A prose box's rendered text and its
hidden field draw over each other in forced colors", "An unresolved link
measures 4.4:1 in forced colors, under the 4.5:1 text floor", and "The rule
under an open record's name stays a hairline under more contrast".

## Model question

None. All three are paint inside one media query each. Nothing is stored,
published or evaluated differently, and no §13 question is involved.

## What it does

In forced colors, a Rich text box and a record's body show their rendered prose
alone, not the markdown source drawn underneath it. An empty box still shows its
placeholder, and a refused draft still shows the reader's words. An unresolved
link is drawn at full strength with a second mark that a system colour cannot
take away, so it clears the text floor and still reads as different from a
resolved link. Under `prefers-contrast: more`, the rule under an open record's
name on a Stat block takes `--text-muted` like every other stat block rule. That
covers Every form and both companion faces.

## Smallest version

Rows 1 and 3 have no smaller version: each is one rule and its test. Row 2's
smallest version is option 3 below (`opacity: 1` and no underline on the
unresolved link). It is one declaration shorter and needs no border, but it
depends on the theme drawing an underline under a *resolved* link. The smallest
version also skips the new dark more-contrast views and relies on the light
shots alone. That leaves the land stop's "in both themes" unmet for row 3.

## Design

All of it was measured in the harness before writing, with each fix applied to
`src/styles/sheet.css` temporarily, shot, and reverted. Every number below comes
from the PNG's pixels, not from the CSS. Chrome's `--force-high-contrast`
emulation draws `Canvas` as `#121212`, `CanvasText` as white and `LinkText` as
`#9e9eff`.

### 1. A prose box in forced colors: hide the unfocused field by opacity

**What happens.** `.sheetsmith-rich-text-input:not(:focus)` and
`.sheetsmith-record-body-input:not(:focus)` hide their text with
`color: transparent`, and the mode repaints that as `CanvasText`. The source
then draws under the rendered prose: `[[Torch of Revealing]]` under *Torch of
Revealing*, `- Owes…` under the bullet, in `sheet-markdown-forced`. In
`sheet-companion-npc-forced-colors`, the Aspects body's *Trouble* line is drawn
twice.

**The fix**, one `@media (forced-colors: active)` block in each component's
section, after its refused-draft rule:

```css
.sheetsmith-view .sheetsmith-rich-text-input:not(:focus):not(:placeholder-shown) {
	opacity: 0;
}
.sheetsmith-view .sheetsmith-rich-text-refused .sheetsmith-rich-text-input:not(:focus) {
	opacity: 1;
}
```

The record body gets the same pair, with `-record-body-input` and
`-record-body-refused`. `:not(:placeholder-shown)` keeps an empty field drawn,
so its placeholder shows. The refused rule keeps a refused draft visible, since
in that state the rendered layer is already hidden by the existing rule.

Measured with the fix applied:
- At rest, the prose draws once and the source is gone, in both boxes.
- Focused, the source draws alone. The layer's existing `visibility: hidden` on
  focus is unchanged.
- Empty, *Write anything.* draws at `#808080` on `#121212`: **4.74:1**. On the
  companion edit face, *Text before the first entry* draws the same way.
- Refused, `## Heading` / `A draft` draws white, **18.73:1**, with the error
  under the box.

**Why not the cut headline's answer.** The cut headline settled the same
mechanism with `forced-color-adjust: none` on the cut number (`docs/UI.md` §6,
`docs/features/headline-narrow-cell.md`). That answer was forced on it in two
ways. The mark sits *inside* a cut derived, so opacity or visibility on the
number would hide the mark as well. And hiding the number from layout would
change the box that the fit check measures. Neither applies here:
- The field has no child that has to stay visible.
- Opacity changes neither the box nor the tab order, which is what the view's
  focus restoration counts.

Taking the headline's answer would add a third exception to §6's
`forced-color-adjust` rule. It would also make the field restate in keywords
everything the mode stops repainting: `GrayText` for the placeholder,
`CanvasText` for a refused draft, and the focus border. Opacity is the one
property the mode leaves alone, so nothing has to be restated.

**Why not the Table cell's answer.** In the cell's version of this stack
(`docs/features/forced-colors-track-and-table.md`), forced colors hides the
*layer* and shows the raw text. That suits a one-line cell, where `[[Sunblade]]`
reads fine raw. In a prose box it would replace the headings, lists and emphasis
of a backstory with source, which is what the backlog row rules out by asking
for the field to be hidden.

**Why not `visibility: hidden`.** A hidden field leaves the tab order, so focus
restoration would count different controls in this mode than out of it.

### 2. An unresolved link in forced colors: full strength and a second channel

**What happens.** `opacity: var(--link-unresolved-opacity, 0.7)` still applies
over `LinkText`, so the link's glyphs draw at `#7474b8` on `#121212`, which is
**4.40:1**. A resolved link draws at **7.84:1**. `opacity: 1` on its own was
already rejected, because both kinds of link would then paint the same. The
mark that separates them has to be one the mode cannot repaint away, so a shape
rather than a colour.

**A constraint on every option.** `text-decoration-style` (dotted or dashed
underline) is the spelling the browser-support lint refuses (`sheet.css` at
`.sheetsmith-modified` and at this very rule). So a broken line has to be a
`border-bottom`. On an inline anchor that border draws under each line fragment
and takes no layout space. The mode repaints its colour and keeps its style.

**The options, each shot** in the `sheet-markdown-forced` view with the row-1
fix also applied, so the comparison is not muddied by the overlap. Resolved
*Neverwinter* sits on the first line and unresolved *Torch of Revealing* on the
last. The option shots were shot during design; the table records what they
measured.

| # | Option (in `@media (forced-colors: active)`) | Unresolved text | Its mark | Resolved text / underline | Told apart by |
| --- | --- | --- | --- | --- | --- |
| 0 | Today (`0-current.png`) | **4.40:1** | solid underline, 4.40:1 | 7.84:1 / 7.84:1 | brightness alone, which is the failing channel |
| 1 | `opacity: 1; text-decoration: none; border-bottom: 1px dotted` (`1-dotted-rule.png`) | 7.84:1 | dotted rule, 7.84:1, about half its pixels lit | 7.84:1 / 7.84:1 | a dotted rule against a solid underline, sitting 2px lower |
| 2 | `opacity: 1; text-decoration: none; border-bottom: 1px dashed` (`2-dashed-rule.png`) | 7.84:1 | dashed rule, 7.84:1, about three quarters lit | 7.84:1 / 7.84:1 | a dashed rule against a solid underline. It reads closer to solid at a glance than dotted does |
| 3 | `opacity: 1; text-decoration: none` (`3-no-underline.png`) | 7.84:1 | none | 7.84:1 / 7.84:1 | the presence or absence of the resolved link's underline |

**Chosen: option 1, the dotted rule** (approved by the owner). Rejected:

- Option 0, today: 4.40:1, under the floor, and brightness is the channel the mode flattens.
- Option 2, the dashed rule: as legible, but closer to solid at a glance, and dashed already means a Track's "granted".
- Option 3, no underline: it tells the links apart only while the theme underlines resolved links.

It was recommended for three reasons:
- **It is the furthest from solid.** Half its pixels are lit against the
  underline's whole run, which is the difference that has to read at a glance.
- **It does not lean on the theme.** Option 3 tells the two links apart only
  while the theme underlines resolved links (`--link-decoration`). A theme that
  turns link underlines off would make them identical again in exactly the mode
  this fixes.
- **Its meaning fits.** The sheet already uses dotted under text for "there is
  more to this" (`abbr`, a modified Pool ceiling). Dashed is a Track's "granted"
  edge, the less fitting of the two meanings, although neither collides in
  prose.

Hover is unchanged. The
existing hover rule already sets `opacity: 1`, and the mode repaints its colour.

Obsidian 1.15's own default is not dotted: `--link-unresolved-decoration-style`
is `solid`, with a 30% accent decoration colour (`harness/obsidian.generated.css`).
So none of the options claims to restore the app's shape. Each one only adds the
shape channel the mode needs.

### 3. The open record's rule under more contrast: a token, not a weight

**What happens.** `.sheetsmith-stat-block-record > .sheetsmith-record-summary:has(> .sheetsmith-record-disclosure[aria-expanded='true'])`
is (0,4,0). The more-contrast block's `.sheetsmith-stat-block-record > .sheetsmith-record-summary`
is (0,2,0). The base rule wins wherever it sits, so the line draws `#e4e4e4` on
`#fafafa`, which is **1.22:1**, in `sheet-companion-npc-contrast-more` and its
`-edit` twin, and under Every form. The existing test checks only *source
order*. That is why it went green while the weight lost.

**Not a stamped class.** `docs/PATTERNS.md` §5 permits this `:has()` by name.
Its argument reads `[aria-expanded]`, which is the one record of the state. It
is reached through `>` from a plugin class, and that state does not change at
pointer rate. A class would be a second copy of a fact the attribute already
holds, and the copy is the one that can drift. A class would not win by
construction either: `.sheetsmith-stat-block-record > .sheetsmith-record-summary.sheetsmith-…`
is (0,3,0), so the more-contrast selector would still need a matched count. The
`:has()` stays.

**The fix: the rule reads a token, and more contrast changes the token.**

```css
.sheetsmith-stat-block {
	--sheetsmith-stat-block-rule: var(--background-modifier-border);
	…
}
.sheetsmith-stat-block-play-head,
.sheetsmith-stat-block-record > .sheetsmith-record-summary:has(…) {
	padding-bottom: var(--size-4-3);
	border-bottom: 1px solid var(--sheetsmith-stat-block-rule);
}
@media (prefers-contrast: more) {
	.sheetsmith-stat-block {
		--sheetsmith-stat-block-rule: var(--text-muted);
	}
	/* the existing list, less the two selectors that now read the token */
}
```

The two rules set different properties on different elements, so neither
selector's weight nor their order decides anything. The more-contrast rule wins
by construction. `.sheetsmith-stat-block-play-head` and
`.sheetsmith-stat-block-record > .sheetsmith-record-summary` leave the
more-contrast `border-color` list, where they would be dead. The tinted head's
`border-bottom: 2px solid var(--sheetsmith-tint-edge)` is a shorthand at (0,2,0)
and is untouched. The `--sheetsmith-in-play-edge` token, which more contrast
already raises, is the precedent.

Measured with the fix applied: the line under Baron Corvan draws `#5c5c5c` on
`#fafafa`, **6.41:1** light, and `#b3b3b3` on `#232323`, **7.50:1** dark, on
both the reading face and the edit face. Under Every form (light), the rule
under Brown Bear's open line is muted and matches the tiles' edges.

### Harness views

The land stop needs these. Views that exist today:
- `sheet-markdown-forced`: a prose box at rest, and an unresolved link beside a
  resolved one.
- `sheet-companion-npc-forced-colors` and `-edit-forced-colors`: a record body
  at rest, and an empty one.
- `sheet-forms-library-contrast-more`, `sheet-companion-npc-contrast-more` and
  `sheet-companion-npc-edit-contrast-more`: light only.

Added as part of the build:
- `sheet-markdown-forced-focused`: `focus=.sheetsmith-rich-text-input`.
- `sheet-markdown-forced-empty`: `type=.sheetsmith-rich-text-input|`.
- `sheet-markdown-forced-refused`:
  `type=.sheetsmith-rich-text-input|%23%23 Heading%0AA draft`. The `#` has to be
  escaped, or the query ends at it.

  All three come from `markdownViews()`, framed on `.sheetsmith-rich-text`.
  Forced colors draws its own palette, so a theme twin would be the same PNG.
- `sheet-markdown-forced-wrapped`: an unresolved link that wraps across two
  lines in the forced-colors prose view. It reuses the `markdown` state's
  sample unchanged and narrows the sheet to `&width=620`, where *Torch of* ends
  one line and *Revealing* starts the next; at 700 the link still fits on one
  line. The wrap depends on the font's metrics, so a font change can unwrap it.
- `sheet-forms-library-contrast-more-dark`.
- A `-contrast-more-dark` presentation in `companionViews()`. That is one line,
  and six views, `sheet-companion-npc-contrast-more-dark` and its `-edit` twin
  among them.

## Config fields

None.

## Data and file model

Nothing stored or read changes. Constraints 3 and 4 are untouched.

## Acceptance criteria

- [x] In `sheet-markdown-forced`, the Rich text box draws its prose once, with
      no markdown source under it.
- [x] In `sheet-companion-npc-forced-colors`, the Aspects body's *Trouble* line
      draws once.
- [x] `sheet-markdown-forced-focused` shows the source alone in a focused box.
- [x] `sheet-markdown-forced-empty` shows *Write anything.* at ≥ 4.5:1,
      measured.
- [x] `sheet-markdown-forced-refused` shows the refused draft and the error
      under the box.
- [x] `sheet-companion-npc-edit-forced-colors` still shows its empty body's
      placeholder.
- [x] `styles.test.ts`: under `forced-colors: active`, both prose fields take
      `opacity: 0` unfocused only when `:not(:placeholder-shown)`, a refused
      draft takes `opacity: 1` after that rule, and neither field takes
      `forced-color-adjust`.
- [x] In `sheet-markdown-forced`, *Torch of Revealing* measures ≥ 4.5:1 from
      pixels (7.84:1 expected), and draws the dotted rule, which
      *Neverwinter* does not.
- [x] In `sheet-markdown-forced-wrapped`, an unresolved link wrapping across
      two lines draws the dotted rule under both lines. No line's height and no
      wrap point moves against the same view shot with the rule absent, which
      is compared by pixels from a shot taken with the rule reverted.
      Measured at the build, with the rule's `padding-bottom: 1px`: the two
      shots are 321×336 and differ in exactly two pixel rows, y188 under
      *Torch of* (26 of 50 pixels lit) and y205 under *Revealing* (30 of 58
      lit); in the reverted shot those pixels are background. Every text band
      is the same in both (174–183 and 191–203), so no line height or wrap
      point moved, and the reverted shot is byte-identical to one taken before
      the padding existed, so the padding moves nothing either. The rule
      clears the ink by 4px on the first line and by 1px under the *g* of
      *Revealing* on the second, where without the padding it met it.
      To reproduce: delete only `border-bottom: 1px dotted;`, keeping the
      padding, from the forced-colors rule at `.sheetsmith-view .internal-link.is-unresolved` in
      `src/styles/sheet.css`, run `npm run harness`, then
      `node harness/shot.mjs only=sheet-markdown-forced-wrapped`, keep the PNG,
      restore the declaration, shoot again, and diff the two row by row.
- [x] The land stop's shots are:
      - in forced colors: `sheet-markdown-forced`, `-focused`, `-empty`,
        `-refused` and `-wrapped`, plus `sheet-companion-npc-forced-colors` and
        `-edit-forced-colors`;
      - under more contrast, light and dark: `sheet-forms-library-contrast-more`,
        `sheet-companion-npc-contrast-more` and
        `sheet-companion-npc-edit-contrast-more`.
- [x] `styles.test.ts`: under `forced-colors: active`, `.internal-link.is-unresolved`
      sets `opacity: 1`, `text-decoration: none`,
      `border-bottom: 1px dotted` and `padding-bottom: 1px`. No `text-decoration-style`,
      `-color` or `-thickness` is used anywhere, so the lint holds.
- [x] In `sheet-forms-library-contrast-more` and its new `-dark` twin, and in
      `sheet-companion-npc-contrast-more`, `-edit-contrast-more` and their new
      `-dark` twins, the rule under the open record's name measures ≥ 3:1
      against the block's fill (6.41:1 light and 7.50:1 dark expected).
- [x] `styles.test.ts`: the open-record and play-head rule reads
      `--sheetsmith-stat-block-rule`, and the more-contrast block sets that
      token on `.sheetsmith-stat-block`. The test that held order alone
      ("raises the tiles, the boxes and the head rule…") is rewritten so it
      would go red on today's tree.
- [x] The three rows have left `docs/BACKLOG.md` § UI, and `src/backlog.test.ts`
      passes.
- [x] `docs/UI.md` §6 states the prose-box answer beside the headline's in the
      `forced-color-adjust` bullet, and states the unresolved link's
      forced-colors mark in the more-contrast bullet, beside the Stat block's
      `--sheetsmith-stat-block-rule` token and why the head rule reads a token.
      §9's "Rendered text over its own field" row names the forced-colors
      treatment.
- [x] `npm test`, `npm run lint` and `npm run build` pass.

## Commit boundaries

0. `test: Weigh a functional pseudo-class by its argument`. The shared
   `specificity` rewrite in `styles.test.ts` and its describe,
   `propertyDeclarations` with the migrated `clip-path` scans, and the extended
   § Patterns row about a scan tested in one direction.
1. `fix: Show a prose box's rendered text alone in forced colors`. The two
   forced-colors blocks, their `styles.test.ts` cases, the three
   `sheet-markdown-forced-*` views except `-wrapped`, and the row out of
   BACKLOG.
2. `fix: Mark an unresolved link by shape in forced colors`. The forced-colors
   rule at the unresolved link, its test, the `sheet-markdown-forced-wrapped`
   view, and the row out of BACKLOG.
3. `fix: Raise an open record's rule under more contrast`. The token, the
   more-contrast block's edit, the rewritten test, the dark more-contrast views,
   and the row out of BACKLOG.
4. `docs: Sheet contrast pass`. This file at `Status: shipped`, the
   `docs/UI.md` §6 and §9 sentences, and the two new § UI rows: the Picture
   box's edge under more contrast and the square inner box in forced colors.

## Deliberately not doing

- **Every other § UI row**, including the ones that look related:
  - "`--text-error` is 4.20:1 in the light theme".
  - "The form tag measurement passes a staged target that draws no tag".
  - Every Roster row and every group-chip row.
  - Every editor-pane row (field error, dropdown chevron, bad drag).
  - § Patterns' "The row above a tinted row is found by `:has()` in forced
    colors".
- **Changing the unresolved link outside forced colors.** The app's own tokens
  keep governing it there (`docs/UI.md` §6).
- **Replacing `color: transparent` with opacity in every mode.** That would be
  one mechanism instead of two, but it changes the ordinary sheet, which no row
  asks for.
- **A light forced-colors palette.** The emulation draws one palette, and the
  real Windows themes are looked at in Obsidian, not in the harness.
- **Every form's Picture box keeps its faint edge under more contrast.**
  `.sheetsmith-stat-block-picture-box` keeps `--background-modifier-border`
  there. It was seen while measuring and is out of scope for this pass. It is
  recorded as a `docs/BACKLOG.md` § UI row.
