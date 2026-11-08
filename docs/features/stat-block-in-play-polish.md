# Stat block in play polish

Status: shipped

## Model question

None. Nothing is stored, nothing new is published, and the one new press makes
the picker's existing write (`choose` in `components/stat-block.ts`), so the
file format, Constraint 3 and Constraint 4 are untouched.

## What it does

Four fixes to the Stat block before 0.9.0 ships. The head's picker and
**Revert** become one matched pair in the stat tiles' clothes. A form's tint
colour is carried by the In play head's own rule instead of a swatch. A form's
title stays one size whether its line is open or closed. Choosing **None** shows
a brief of each form to press, where the face used to sit empty.

## Smallest version

The four items, each at its least:

1. The picker and **Revert** at one height (`--input-height`), clothes unchanged.
2. The swatch moves from the head onto the rule, drawn only where the layout chose a tint. Accent sheets draw nothing new.
3. A closed line's name takes the open head's size.
4. With none on, a plain list of form names as buttons: no thumbnail, no summary line, no focus handling after the press.

It gives up the tile clothes, the accent link, and briefs that let a reader choose without opening Every form.

## Design

### 1. The head's controls

The picker (`.sheetsmith-stat-block-select` inside `.sheetsmith-stat-block-menu`)
and **Revert** (`.sheetsmith-stat-block-revert`) take **the stat tile's clothes**:
the tile's 1px `--background-modifier-border` border, `--radius-m`,
`--background-secondary` fill, and `--background-modifier-hover` on hover.
That is the same box as the HP, Speed and Armour class tiles under them.

- **One height, set once.** Both controls share a `min-block-size` of
  `--input-height` and centre their content. Under a coarse pointer both hold
  44px, where today only **Revert** does. Text stays `--font-ui-small`, so the
  title keeps the head's rank. Inline padding is `--size-4-2`, the tile's
  padding. The select keeps its chevron room at the end.
- **Still the app's controls.** The picker stays a native `<select>` with
  `.sheetsmith-record-menu::after` as its chevron. **Revert** stays a
  `<button>`. Focus keeps the 2px accent outline, and keyboard and touch are the
  platform's. This changes how they look, not what they are.
- **More contrast:** both borders `--text-muted`, in the block after the base
  rules where the tiles take theirs. **Forced colours:** the fill drops and the
  border is repainted by the mode, as on the tiles. No `forced-color-adjust`.
- **Narrow (≤360px of the block):** the picker takes its own line under the
  title, as today, and **Revert** follows it on that line. The two stay the
  same height whether or not they wrap.
- The uses rings stay where they are and stay unclothed. They are a run, not a
  button (`docs/features/character-forms.md`).

### 2. The form's colour in the In play head

The swatch is removed from the In play head (`drawHeadSwatch` goes). **The
colour moves to the head's rule**, the bottom border that already rules the head
off as the block's title. With a form on, the rule is **2px in
`--sheetsmith-tint-edge`**, the same 70% mix that outlines the boxes the form
tints. That makes the line under the form's name and the outline round each
changed box one colour. The word is stamped as `data-sheetsmith-tint` on the
play head, so the existing per-colour rules supply the colour. Nothing inside
the head reads `--sheetsmith-tint`: the uses rings use `--interactive-accent`
directly and the picker has no colour, so both stay the accent (checked by test).

- **Why a rule, not the box's edge.** An outline round a box is the vocabulary
  for *this box was changed by a form*. Outlining the stat block itself would
  say the form changed the stat block. A rule under a title has no such meaning
  on the sheet, and it is already there.
- **Two forms on by hand.** Each form is already set apart by a rule above its
  name (`.sheetsmith-stat-block-form-name`). **That rule takes its own form's
  colour**, 2px in its edge, with the word stamped on the name row. The first
  form's row follows the two-forms report's box, whose edge 8px above the rule
  read as a double rule where the second's rule follows text with air below its
  letters, so the first takes `--size-4-1` more above it and the two read as one
  gap (owner's order). The head's
  own rule stays the plain hairline because the head names both forms, so no
  single colour belongs to it. This applies form-tint-colour.md's rule (a
  colour where every form reaching it agrees) to the place where two forms
  never meet.
- **Accent, no tint chosen.** **The rule is drawn in the accent's edge.** The
  swatch was limited to layouts that chose a tint because it added an element
  to every sheet. A rule's colour adds none, and an accent sheet tints its boxes
  in the accent, so the link holds there too. Forms are new in 0.9.0, so no
  released layout changes look because of this. Settled with the owner.
- **No form on:** the plain hairline.
- **More contrast:** the fill drops and the 2px edge stays
  (form-tint-colour.md, question 3). The tinted rule therefore wins over the
  head's `--text-muted` contrast rule. The edge clears 3:1 against the page in
  every colour and theme (at least 3.56:1, that doc's table), so it needs no
  fallback.
- **Forced colours:** the colour drops, as the mode intends. The rule is the
  head's plain rule repainted by the mode, and the title's words say which form
  is on.
- **Unchanged:** the problem line (`.sheetsmith-stat-block-problems`) stays
  under the head and so under the rule. A stray tint word still reports there.
  Every form's **Tint** section keeps its swatch beside the dropdown, because
  that one previews a choice rather than keying the head. The uses rings and
  the picker stay the accent.

**SPEC deliverable** (written by `/land-it`): in §4.2 Stat block's *Sheet view*,
the sentence starting "**Where the layout has chosen a tint** — … a swatch keys
each form's name in the In play head…" becomes: the In play head's rule is
drawn 2px in the form's edge colour whenever a form is on, the accent included;
with two on, each form's own rule takes its colour and the head's stays plain; a
form's stray word is said under the head. `docs/UI.md` §9's stat block row
loses "drawn also before each form's name in the In play head" from the swatch
clause and gains the rule.

### 3. One title size, closed or open

Under Every form a closed form's name takes the open head's type,
`--font-ui-large` bold, which is also In play's title. The rule that sets it
for an open form drops its `[aria-expanded='true']` condition and applies to the
name field and its link layer in both states. So the name does not change size
when the chevron is pressed. The size was settled with the owner. The closed line's summary (`HP 22/34 · Armour
class 11`) stays `--font-ui-smaller` muted and ellipsised, aligned on the
name's baseline. The open line keeps its rule. Open and closed now differ by
the chevron, the rule and the summary, not by type size.

### 4. In play with no form on: the briefs

With `exclusive` set, at least one readable form, and none on, In play draws the
head as today (*No form active*, the rings, the picker on **None**, no
**Revert**), then the existing sentence (*No form is active.*, plus *Choosing
one spends a use.* where it applies), then **one brief per readable form**, in
file order. Pressing a brief calls `choose(at)`. That is the picker's write: one
edit, the chosen form on, and a use spent where `spendOnPick` asks. At 0 uses
the switch still happens, spends nothing, and the announcement says *no uses
left* (character-forms.md, kept as it is).

- **What a brief holds (owner's second amendment): what In play draws above
  the zones, in small and read-only.** Stacked from the top:
  - the picture thumbnail, about 64px, where `image` is on and the form has
    one, through `picture-frame.ts` read-only with `alt=''`, beside the form's
    name at the head's title size (`--font-ui-large` bold);
  - **the record's fields as a row of pairs, not tiles (owner's third
    amendment)**: each field a small muted label (`--font-ui-smaller`) over its
    value, bold at the brief's body size (`--font-ui-small`), drawn by In play's
    tile painter on a read-only face. No tile box: no border, no fill, no
    fixed-width columns. The pairs sit in a row that wraps, each as wide as what
    it says, with the gap the closed line's ` · ` takes between its pairs (10.3px
    measured, `--size-4-2` plus `--size-2-1`); no label or value truncates, and a
    long value wraps inside its pair. A number reads as text and **a ceilinged
    one compact, `22/34`, the ceiling muted**, as the closed line says it; a
    toggle as its painted ring; a text field as its phrase; and every number a
    form's `=` sets as a pair. No stepper, no field, no ring control. **A field
    with no value is left out of the brief** (a blank text or number; a toggle
    always has a value, since unset is off), where In play keeps its tile and its
    dash: a brief tells one form from another, and `Speed —` says nothing.
    **In play's own tiles keep their spacing**: only the brief's face changes;
  - **the changes as one line in In play's wording**, every change that is not
    a tile, ` · ` between (`STR +4 · DEX +0 · CON +3 · stealth at least +3`),
    `--font-ui-smaller` muted and clamped to two lines with an ellipsis, in the
    prefixed form Chromium draws the ellipsis for (`display: -webkit-box`,
    `-webkit-box-orient: vertical`, `-webkit-line-clamp: 2`, `overflow: hidden`)
    and not the unprefixed `line-clamp`. A guarantee rather than a repair: no
    clipped line was reproduced (the vault's Brown Bear has four changes, never
    clipped), and the prefixed form is the one Chromium is known to draw the
    mark for, verified in Obsidian's Chromium 150 by the owner.
    **Without In play's reasons** (*already higher*), here and on a set tile: a
    form that is off pushes nothing, so every change would read as not
    applying, which says nothing about choosing it.

  Everything inside the button is phrasing content, so the pairs and the
  thumbnail's frame are spans. The field drawing, the thumbnail and the changes'
  wording are In play's, reached through host painters (`tiles`, `thumb`), never
  a second copy.
- **What it leaves for Every form:** the zones, every edit, delete, Tint, the
  changes past two lines, and a picture's failure sentence. A picture that does
  not draw just has no thumbnail on its brief. The sentence is said where the
  picture is set, and under the head once the form is on.
- **Its clothes:** a `<button type="button">` in the stat tile's clothes (border,
  `--radius-m`, `--background-secondary`, `--size-4-2` padding, hover
  `--background-modifier-hover`), its parts stacked from the inline start.
- **Its colour rule (owner's amendment):** each brief's bottom edge is a 2px rule
  in its form's `--sheetsmith-tint-edge`. The form's word (`tintOf`: its own
  valid `Tint`, else the block's, the accent included) is stamped as
  `data-sheetsmith-tint` on the brief. It is the rule the head draws once that
  form is on, so the choice previews the colour. It is a rule only: no fill and
  no outline, which stay the vocabulary for a box a form *changed*. **More
  contrast:** the 2px edge stays, beating the brief's `--text-muted` border on
  that side. **Forced colours:** the colour drops and the edge is the mode's
  plain border, as the head's rule is.
- **Layout:** a wrapping grid, `repeat(auto-fill, minmax(min(100%, 240px),
  1fr))` at `--size-4-2` gaps, scrolling inside the block's box like the rest
  of the face. **One form:** one brief at the grid's track width, not stretched
  across the box. **Many:** they fill the row, wrap, and the content scrolls.
  **Narrow (≤360px of the block):** one column, each brief full width, its parts
  stacked as on a wide one.
- **Keyboard and names:** the briefs follow the picker in tab order, in file
  order, and the foot's **Every form** follows them. They are a `<ul>` of
  `<li><button>`, labelled *`<Label>`: choose a form* (the list). Each button's
  accessible name is the form's name, its visible text (`aria-labelledby`).
  Its description (`aria-describedby`) is what the pairs say, as one hidden
  sentence of label and reading (`HP 22/34 · Speed 40 ft. · Flying on`, since a
  row of pairs read as text runs labels into numbers), then the changes line as
  drawn; a brief with neither has none. The colour rule is not announced; it
  repeats nothing the name does not. Enter and Space are the button's own. **After
  the press, focus lands on the picker**, since the pressed brief is gone in the
  rebuild. A module-level marker does this, as `awaitingAdd` does for **Add**.
  The live region says *Brown Bear active* as the picker does today.
- **None written yet:** unchanged. *No forms yet.* and **Add form**, which opens
  Every form with the new name focused. That is how this face sends the reader
  to Every form.
- **Forms exist but none reads:** no briefs. The existing per-record error
  lines are the state. **Two forms on:** not this state, so nothing changes.
- **Unchanged:** a companion block (no `exclusive`) has no In play face, so it
  draws no briefs.
- **Where it lives:** `components/stat-block-briefs.ts`, beside
  `stat-block-zones.ts`, imported by `stat-block.ts` alone. `stat-block.ts` is
  2,286 lines, and the brief list is one job (PATTERNS §1).
- **More contrast:** brief borders `--text-muted`, in the tiles' block.
  **Forced colours:** the border is repainted, the fill drops, and the focus
  outline stays. **Coarse pointer:** a brief holds 44px, since one with no
  picture, no tiles and no changes is a single line, about 43px.

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| — | — | — | None added or changed. |

## Data and file model

Nothing new is stored or read. A brief's press writes exactly what choosing the
same form in the picker writes, through the same function. Existing notes and
layouts render with the new clothes and nothing else changes.

## Acceptance criteria

- [x] In `sheet-forms-light` and its dark, contrast-more and forced-colours shots,
      and at `sheet-forms-head-narrow`'s 380px, the picker and **Revert**
      measure the same height and top, neither clipped:
      `node harness/measure-head-pair.mjs` (after `npm run harness`) fails where
      they do not, and fails a mode that did not stage. Both wear the tiles'
      border, radius and fill (`styles.test.ts`, one shared rule).
- [x] At narrow width (`sheet-forms-head-narrow`, 380px, framed on the block)
      the picker is on its own line under the title with **Revert** beside it,
      both the same height, nothing clipped.
- [x] The picker is still a native `<select>`. A test drives a `change` on it
      and sees the same write as before.
- [x] No `.sheetsmith-stat-block-tint-swatch` is drawn in the In play head or in
      a form name row, in any state (test). The Tint section's swatch under
      Every form is still drawn (existing test kept).
- [x] With one form on, the play head carries that form's `data-sheetsmith-tint`
      (`accent` included), and its bottom border is 2px in the edge colour
      (`sheet-forms-tint-green`, `sheet-forms-light`: the rule matches the tinted
      boxes' outline).
- [x] With two forms on (`sheet-forms-tint-two-on`), each
      `.sheetsmith-stat-block-form-name` carries its own form's word and a 2px
      top rule in its colour. The head's rule is the plain hairline.
- [x] With no form on, the head's rule is the plain hairline.
- [x] Contrast-more shots: the rule stays 2px in the edge colour. Forced-colours
      shot: the rule is the mode's plain rule, with no hue.
- [x] The uses rings and the picker's focus ring are the accent in a green
      block (test or `sheet-forms-tint-green`).
- [x] A stray tint word still reads on the problem line under the head
      (`sheet-forms-tint-error`).
- [x] Under Every form (`sheet-forms-library-mixed`: one form closed, one open)
      both names have the same computed font size and weight. The closed line's
      summary is still smaller and muted.
- [x] With none on and several forms (`sheet-forms-none`), In play shows one
      brief per readable form in file order, each with a thumbnail of about 64px
      (where on), the name at the title's size, the fields as label-over-value
      pairs read-only (a ceilinged number compact as `22/34`, the ceiling muted;
      a toggle's ring; a text field's phrase; each number a form's `=` sets), and
      the changes line in In play's wording clamped to two lines (tests: pair
      contents and the compact ceiling's markup; no field, stepper or control
      inside, only spans; no tile among the pairs; the changes and set numbers
      equal In play's for the same form; the clamp CSS in its working prefixed
      form, with no unprefixed `line-clamp`).
- [x] A form whose changes run past two lines ends its line in an ellipsis
      (`sheet-forms-none-long` and its `-dark`, `-contrast-more` and
      `-forced-colors`: the Wolf's line).
- [x] A brief leaves out a field with no value and keeps a toggle that is off;
      In play keeps the blank field's tile and its dash (tests;
      `sheet-forms-none-long`, the Wolf's blank Speed).
- [x] A brief's pairs wear no tile clothes (no border or fill) and nothing in
      them truncates (no `text-overflow`, ellipsis or `nowrap` on a label or a
      value); their row wraps at the closed line's gap; In play's tiles are
      unchanged (`styles.test.ts`).
- [x] With two forms on, the first form's row takes `--size-4-1` above it where
      it follows the report (`styles.test.ts`, `sheet-forms-two-on`,
      `sheet-forms-tint-two-on`).
- [x] `sheet-forms-none-one` shows one brief at track width.
      `sheet-forms-empty` shows *No forms yet.* and **Add form**, unchanged.
- [x] Pressing a brief writes the same edit as choosing that form in the picker,
      spending a use where `spendOnPick` is on and none at 0 uses (tests, both
      cases). Focus is then on the picker.
- [x] Each brief is a `<button>` whose accessible name is the form's name, with
      its tiles' sentence and its changes line as its description, and none
      where it has neither. The list is named. Tab order is picker, briefs,
      **Every form** (test).
- [x] Each brief carries its form's `data-sheetsmith-tint` (`accent` where
      none is chosen, a form's own valid `Tint` where `tintPerRecord` is on)
      and a 2px bottom rule in that edge colour. The rule matches the head's
      rule once that form is on (test, plus `sheet-forms-none` and a
      `sheet-forms-none-tint` shot with a green block and one form's own Tint).
      Briefs have no tint fill and no tint outline.
- [x] Contrast-more none-state shots: each brief's 2px rule stays in the edge
      colour. Forced-colours none-state shot: the rule is the mode's plain
      border with no hue.
- [x] Briefs are at least 240px (or the row, where narrower) and fill the row
      (`sheet-forms-none`); at the narrow width (`sheet-forms-none-narrow`) they
      are one column (test on the grid's `minmax` and the 360px rule).
- [x] Every new or changed shot has light, dark, contrast-more and
      forced-colours variants: `sheet-forms-none`, `-none-one`, `-none-tint`, `-none-long`, `-empty`,
      `-head-narrow`, `-library-mixed`, `-none-narrow`, and the two-on rules in
      `sheet-forms-tint-two-on` and its `-dark`, `-contrast-more` and
      `-forced-colors`. The one-form head rule is covered in all four by the
      existing tint shots: each colour light and dark,
      `sheet-forms-tint-contrast-more` (and `-dark`) and
      `sheet-forms-tint-forced-colors`.
- [x] `npm run lint`, `npm test`, `npm run build`, `npm run harness` and
      `npm run harness:shot` pass.

## Commit boundaries

1. `style: Dress the stat block's picker and Revert as one pair of tiles`. CSS
   for the two controls in every mode, the head-narrow shots, the height
   test, and `harness/measure-head-pair.mjs`.
2. `feat: Carry a form's colour on the In play head's rule`. Remove the head
   swatch, stamp the word on the head and on each two-on name row, add the rule
   CSS in every mode, update the tests that counted head swatches, and update
   the tint shots.
3. `fix: Title a form at one size open or closed`. Drop the expanded-only
   condition, add the library-mixed shots, and the size test.
4. `feat: Brief each form when none is in play`. Add
   `components/stat-block-briefs.ts`, its call site and focus marker, CSS
   including the brief's colour rule in every mode, tests, the harness states
   `forms-none-one`, `forms-none-tint`, `forms-none-long` and `forms-empty`, and the none-state
   shots. After commit 2, because the brief's rule is the head's.
5. `docs: Record the stat block's in-play polish`. This doc to `built`, the
   `docs/UI.md` §9 row, and (by `/land-it`) the SPEC *Sheet view* sentence.

## Deliberately not doing

- No custom dropdown, no new focus treatment, no colour on the picker or the
  rings.
- No tint on the stat block's box edge, on a closed or open line under Every
  form, or on the foot. A brief carries the rule only, never a tint fill or
  outline.
- No zones inside a brief, and no editing from one: no stepper, field or ring
  control, and the press is always the brief's choice.
- No tiles inside a brief: no tile box, fill or column, and no truncation.
  In play's tiles are not restyled to match.
- No second copy of the tile, the thumbnail or the changes' wording for the
  brief: each is In play's, through a host painter.
- No picture failure sentence on a brief.
- No change to the two-forms report, the picker's extra line, the empty
  *No forms yet.* state, or a companion block.
- No new config key, so a layout cannot turn the briefs off or the accent rule
  off.
- The smallest version above is recorded for reference. The owner approved the
  full design.
