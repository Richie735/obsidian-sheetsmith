# UI conventions

How a Sheetsmith sheet looks and behaves. Read this when designing a component
and when reviewing one; `docs/PATTERNS.md` covers the code side, `SPEC.md`
covers what the plugin does.

Markers match `PATTERNS.md`: **[checked]** fails the build, **[warned]** is a
lint warning that does not, **[judgement]** is a default with a reason.

The design reviewer should look at the **harness** (`npm run harness`) rather
than at CSS. Reviewing appearance by reading a stylesheet describes what the
code should look like, not what it does.

The harness renders all three screens: the sheet, the layout editor pane, and
the settings tab. The editor is where most of a sheet is actually configured, so
it gets the same scrutiny as the cards. The sheet and the editor are joined
(`Surface → Both`), so saving in the editor re-renders the sheet and a config
field can be judged by what it does to the card rather than by its label alone.
The settings tab is three preferences and a button, and is reviewed for whether
its rows still sit in Obsidian's own rhythm.

---

## 1. The plugin has no colours of its own

**Never write a literal colour** [judgement, should be checked]. Not a hex, not
an `rgb()`, not a named colour. There are zero in 322 selectors today and that
number should stay zero.

Every colour comes from an Obsidian theme variable, so a sheet inherits whatever
theme the user runs:

- text: `--text-normal`, `--text-muted`, `--text-faint`, `--text-accent`,
  `--text-error`, `--text-on-accent`
- background: `--background-primary`, `--background-primary-alt`,
  `--background-secondary`
- state: `--background-modifier-hover`, `--background-modifier-active-hover`,
  `--background-modifier-border`, `--background-modifier-error`
- accent: `--interactive-accent`, `--interactive-accent-hover`
- named colours, **for the form tint alone**: `--color-red`, `--color-orange`,
  `--color-yellow`, `--color-green`, `--color-cyan`, `--color-blue`,
  `--color-purple`, `--color-pink` (`docs/features/form-tint-colour.md`). Every
  theme redefines them for light and dark, so a layout choosing a form's colour
  chooses a word and the theme the shade. Nothing else on a sheet takes them:
  colour is a layout's choice only where it names *which form* did something

Sizing, spacing, radii and fonts come from the same place: `--size-4-*`,
`--size-2-*`, `--radius-s|m|l`, `--font-ui-*`, `--font-smallest`,
`--font-monospace`, `--icon-s`, `--layer-popover`.

### Deriving a colour safely

Blend with `color-mix(in srgb, ...)` against `--background-primary`, never with
opacity on the element. The graded level fill is the model:

```css
background-color: color-mix(
	in srgb,
	var(--interactive-accent) calc(var(--sheetsmith-level, 1) * 100%),
	var(--background-primary)
);
```

Text placed on such a blend uses `--text-normal`, which is defined against
`--background-primary`, the same colour the blend is mixed with, so it holds in
a light theme and a dark one alike. That reasoning is the rule: **pick the text
variable defined against whatever you mixed into**.

**An edge is mixed the other way, toward `--text-normal`** [judgement; held by
`harness/measure-form-tint.mjs`]. Scoped to the form tint's edge
(`--sheetsmith-tint-edge`, `docs/features/form-tint-colour.md`), the second
derivation beside the one above. A raw named colour as a 1px outline is too
light against a light card — yellow 1.93:1, cyan 2.12, green 2.41 — and a pick
per colour would hold in the default theme only. Mixed 70% toward the theme's
text, the colour moves away from the surface in either theme, because the theme
defines `--text-normal` against that surface: a light colour darkens in a light
theme and lightens in a dark one, and the hue survives. 70% is the lightest mix
that clears 3:1 in every colour and theme; the lowest is 3.04:1, light yellow
against its own tinted card. Text never sits on the edge colour, and never on a
raw named colour, with one exception, which is also the one literal colour
the stylesheet names: the form's tag is the colour at 85%, written in `black`
or `white`, whichever measures better against that fill composited over what
the tag sits on, picked at runtime (`docs/features/form-tint-colour.md`). One
of the two reaches 4.58:1 on any opaque colour, which no theme's own pair can
promise, and the pick measures what the theme drew rather than assuming it.

---

## 2. The `.sheetsmith-view` scope rule

Every rule styling a form control on a sheet must be scoped under
`.sheetsmith-view` [checked: `styles.test.ts`].

Obsidian styles `input[type='text']` at specificity (0,1,1). A bare class is
(0,1,0) and loses, so every declaration taking chrome off an input is dropped
with no warning and the field keeps its form-control look and its small font.
This is invisible in review precisely when it matters most: a component that paints its
own border never reveals the loss. Pool shipped that way once.

`styles.test.ts` is the guard. If you add a field class, it is covered
automatically by the `-input` / `-current` / `-select` naming; a control named
outside that pattern needs the test widened. A `<select>` is the same case as an
input and was the third spelling: Obsidian's bare `select` rule sets a height, a
background, a shadow and a font size, so a card's value drawn as a menu reverts
to a form control the moment one of ours loses to it.

**A surface that cannot be under `.sheetsmith-view` brings its own scope.** The
anchored panel hangs off `document.body`, because the table that opened it
scrolls inside an overflow box that would clip it, so this section's selector
would never match — and a single class was taken to be enough there. It is not,
and the number above is why: `(0,1,0)` loses to `input[type='text']` at (0,1,1)
and to `button:not(.clickable-icon)` at (0,1,1), whose `:not()` argument counts.
Only `select` is the (0,0,1) that a bare class beats. So the panel's controls
went unscoped and half of them silently kept the app's chrome: list lines drew as
raised buttons clamped to `--input-height`, and the arming tint on a destructive
button was discarded. Every rule whose subject is a control in there now reads
`.sheetsmith-panel .sheetsmith-panel-…`, at (0,2,0), and `styles.test.ts` checks
the weight rather than the spelling.

**And (0,2,0) is not the ceiling, because the app has platform rules above it.**
On a phone `.is-mobile input[type='text']` sets a width at (0,2,1)
(`docs/features/phone-input-width.md`), and on a tablet
`.is-tablet button:not(.clickable-icon)` sets `padding: var(--size-4-1)
var(--size-4-5)` at (0,2,1) — so every sheet button's own padding was dropped
there, a 1.6em glyph button took 40px of padding, and a level ring drew as a
42 × 33 oval [checked: `styles.test.ts`; seen in `sheet-tablet`]. Both answers
are one shape: the declaration the platform rule replaces moves into a rule of
its own on a doubled class, at (0,3,0), and nothing else moves with it, since a
doubled whole rule would lift a control's border and fill over its own `:hover`
and `:focus-visible`. A button that takes the app's chrome whole — the
anchored panel's **Save**, **Cancel**, **Confirm** and **Remove** — takes the
app's tablet padding too, which is the app's own control doing what it does
everywhere. The harness stages a tablet by putting `is-mobile is-tablet` on
`body` over CDP (`platform=tablet` in `shot.mjs`), against the platform rules
and variables `harness:calibrate` now carries; it is the app's tablet CSS, not
a device.

---

## 3. Sheetsmith's own knobs

The plugin's tunables are custom properties declared on `body`, prefixed
`--sheetsmith-`, each carrying the reason it holds that value. They exist to be
overridden from a user CSS snippet.

Publish one **when a second component has to line up with the first**. The
comment on `--sheetsmith-card-abbr-space` states the test: re-deriving
`1.2 × 0.85 × --font-ui-smaller` somewhere else would drift the moment either
constant moved.

A knob is public API once shipped. Renaming it breaks someone's snippet.

**Where a knob is spelt as a factor and a length derived from it, the factor
is the override point**, on `body`: `--sheetsmith-inline-control-factor`, from
which `--sheetsmith-inline-control` is derived, because a length that has to
be the control's at another font size reads the factor, never the length.

---

## 4. Space, and how the sheet reflows

- **A component fills its grid placement** (`SPEC` §8). A card placed two
  columns wide occupies two columns. Card set's opt-in `fixed` sizing is the
  single exception. **That is two rules, one per family, and they differ on the
  height.** A box sized by its placement — Card, Pool, and §9's roster of that
  name (Rich text, Image, Record set, Passport) — fills both axes. A component
  that grows — Table, Roster, and the containers — fills the width and takes
  the declared height as a floor, which `SPEC` §8 already says of a container's
  rows. **So a band of columns balanced to end together holds only where every
  column ends in a box**, and a tab set is a sound foot only with a box at the
  foot of every tab — nor even then, since every panel is as tall as its
  tallest sibling tab: a measured 404px void under three
  (`docs/features/starter-layouts.md`, "What all three share").
- **A slot is reserved only by a component that owns the row it would align**
  [judgement]. Card set keeps an empty abbreviation slot so its cards share a
  baseline, and a lone Card does not (`card-face.ts`'s `reserveAbbreviation`).
  `hideLabel` on a Group, an Image or a Rich text is the lone case: none of them
  owns a row or can see a labelled sibling, so the label's space goes with the
  label. In a row of labelled frames an unlabelled one starts 19px higher; an
  author who wants the line-up keeps the label.
- **A table's slack goes to its prose column, and never at the name's
  expense** [judgement]. With no text column the name takes the slack; with
  one, prose takes it, since prose is the one cell that can use unbounded room.
  But the name column never falls below its longest name while any column holds
  slack: the reason it yields, "row names are a fixed vocabulary", is false on
  an `openRows` table, where the character types them.
- **At the default sheet size, beside its sticky name an open table leaves one
  number cell of room, or one glyph cell where every cell beside the name is a
  glyph, short only where the name's heading is wider, and every cell's
  content but prose is seen whole there** [judgement; held at 520 by
  `harness/measure-groups.mjs` check 8, which prints these figures, and prints
  the `text=24` ones below without holding them]. The name's two floors,
  its longest name and its field's `6em`, are held under one room declared on
  the table's box: the scroller less one band
  (`docs/features/table-name-column-floor.md`). **The band is set per table
  from its own trailing cells, in two values, chosen from the config and never
  measured.** Where every column is a modifier glyph with its heading hidden,
  beside the remove glyph, the band is one glyph cell (the inline control at
  `--font-ui-small` plus its padding, 36.8px, 44.6 under a coarse pointer);
  everywhere else it is one number cell. One constant cost Worn items 31px of
  names for nothing — at 520 it held them to 86.7px beside two 36.8px glyphs
  and still scrolled 5px of the remove cell's padding; with the glyph band they
  are 117.9, `Shackles` is whole, and the scroll brings the remove glyph whole
  into a 37.1px room. Measuring each table's widest cell in code was refused:
  a column is as wide as its heading when that is wider, and a heading is
  laid-out text, so it needs a layout read on every render that happy-dom
  cannot see. That is also why a toggle or a level is left out, even with its
  heading hidden: its heading may show, and a note mark may sit beside its
  ring. The field's floor used to
  outweigh it, so at 520 Attacks' 155px scroller held a 102px name beside a 68px
  number cell and left 53; it now leaves 68.3, and the name gives with an
  ellipsis: `Longsword`, whole at 102px, reads `Longsw…` at 86.7, which is the
  cost taken. **A text cell is the one seen in part**: its field clips prose at
  every width and starts it at the left, so a scroll that puts the cell's start
  against the name shows the prose's start, and focus reads the rest. Widening
  the room to a text field's `8em` floor would leave that card's name 35px.
  **A name heading is never clipped**, so one wider than the bound narrows the
  room by the difference: Conditions' `Condition` heading is 92.3px and leaves
  62.8px for a 64.6px `Active` cell, whose ring and heading are centred and show
  whole with under a pixel of padding a side behind the name: the cell's box is
  not whole there, its content is. **At `text=24` the claim does not hold, and
  that is the residue** (520, `surface=sheet theme=light width=520 text=24`):
  the heading is `--font-smallest`, which is `em`, so it grows with the sheet
  where the cells' `--font-ui-small` does not. Conditions' heading is 126.3px
  and leaves 28.7px of a 155px scroller for an 86.2px `Active` cell, whose ring
  is wholly behind the name at rest, so the card shows no toggle until it is
  scrolled, and then only the ring and none of its cell; Attacks' heading sets
  a 90px name and leaves 65px for its 68px `Hit` cell, and `Dagger` reads
  `Dagg…`. Magic items, in a 319px scroller, leaves 67.7px beside its name for
  a 77.3px `Worn` toggle cell, which its heading widens: the ring is centred
  and shows whole, so the content holds and the box does not. Not a
  regression: the field's old `6em` floor was 144px there. It reopens with the
  clause above, since only clipping or wrapping the heading reaches it, and
  the seventh rulings pass did not reopen it: the per-table band changes no
  name heading, so a heading wider than its bound stays the case it was.
  **A declared row's name is plain text and is not held under the room, so on
  a table with no prose column it wraps instead** [judgement; seen at
  `surface=sheet theme=light width=520 text=24`]. A closed table has no box to
  declare a room on, and the scroller cannot be a container, since Roster
  shares it. Before the wrap, Tool training at `text=24` in a 520 container
  drew `Thieves' tools` at 158.2px in a 155px scroller (195px of content): no
  scroll moved its toggle out from under the name, a pointer at the ring hit
  the name, and Tab still landed on the ring behind it, its focus ring hidden.
  Wrapped, the name takes 118px on two lines and the toggle shows whole beside
  it. Where the table has no prose column the name takes the slack, so it
  wraps only where the slack is shorter than the name: on the default sheet at
  1400, 520 and 380, and at `text=24` at 1400, every table measures exactly as
  it did, and at `text=24` in 520 only Tool training and a Roster's `Sleight of
  hand` move. A table with prose keeps the one line, since its name column is
  `auto` and would fall to its longest word, and a declared name on an open
  table with prose still widens its column as before.
- **A control focused behind a sticky name is scrolled clear of it, in every
  table and Roster that scrolls** [checked: `ui/pinned-column-focus.test.ts`;
  held by `harness/measure-groups.mjs` check 9, real Shift-Tab at 520 and at a
  true 380 under phone staging, each at `text=24` too]. The browser scrolls a
  focused control only into the scrollport, whose start the name covers, so
  Shift-Tab back along a table scrolled right landed behind it. Counted one
  press per control, the table scrolled fully right before each (check 9's
  measure): at 520, 4 of Attacks' 8 controls and 18 of Inventory's 34 (its
  three links aside, none covered), and at a true 380, 2 and 18. Counted as one
  walk back from the last control, the scroll carried from press to press: the
  same at 520, and 2 and 13 at 380. Now none by either count, at either size
  or width.
  The cell's start goes against the name, as a text cell's already does above,
  unless that carries a control that fits the room past the far edge, when the
  control's own start does: Conditions' `Active` ring at `text=24`, in a
  28.7px room. **Measured on focus, not declared**: a `scroll-padding` the
  name's width cannot be written for a closed table or a Roster, which have no
  box to hold a room, an open table can spell the name's room but not its
  width, and Chrome leaves a partly covered button where it is whatever the
  padding says. **Only a focus no pointer caused** (`:focus-visible`), so a
  press never scrolls its control out from under the pointer before release;
  a rebuild restores each scroller's offset before it restores focus, so a
  restored focus is held to this rule against the offset the reader left
  [checked: `view/sheet-posture.test.ts`, the order both hosts call; held by
  `harness/measure-groups.mjs` check 10].
- **The sheet fills the pane.** A sheet is a dashboard, not prose, so nothing
  holds it at reading width. `--sheetsmith-sheet-max-width` gives reading width back
  to anyone who wants it.
- **Reflow uses a container query, never a media query** [judgement]. A narrow
  split in a wide window must reflow too, and a media query cannot see that.
  `.sheetsmith-view` sets `container-type: inline-size`; the grid collapses to a
  column under 480px of *container* width.
- **So a phone's 380px viewport draws the sheet a 380px container draws, and the
  narrow views stay container widths** [judgement; seen in `sheet-viewport-380`
  against `sheet-narrow`]. Diffed with the harness bar's height taken off, the
  two differ by antialiasing alone, under 40 levels a channel anywhere on the
  sheet: nothing on it reads the viewport, which is the rule above doing its job.
  What a true viewport changes is what hangs off `document.body`, the anchored
  panel and the shared popover, whose caps read `100vw` (§9), so a view earns a
  true viewport when it holds one of them. **That reading is the ruling, not a
  gap**: both are bounded by the window, never by the sheet's container, so in a
  narrow pane in a wide window the panel overhangs the sheet as the app's own
  `Menu` would (§9 gives the reasons). Neither picture carries Obsidian's
  `.is-mobile` rules, which the stub never sets
  (`docs/features/phone-input-width.md`), and neither is a device.
- **A container is its own reflow context** (`SPEC` §8). A Group four columns
  wide inside a wide pane is narrow even though the sheet is not, so
  `.sheetsmith-subgrid` carries `container-type` and the grid inside it collapses
  on its own width. **One rule, not one number: 40px a column**, which is the
  sheet's own 480px across twelve columns. Twelve columns still collapse at
  480px; four collapse at 160px.
- **A threshold calibrated for one column count is not one rule.** This bullet
  used to say the container answered the sheet's 480px, and defended it as one
  threshold rather than two. It was one number applied to twelve questions, and
  the spread was 7x: a container collapsed while its columns were still 236px
  wide at two columns, and was allowed down to 32.7px at twelve. A two-column
  container could not place two children side by side at any pane width up to
  2400px, and a four-column one flipped between stacked and side-by-side across
  1489px, which reads as broken rather than as responsive. Recorded because the
  reasoning was the failure, not the number: whenever a threshold is reused at a
  different scale, check what it means there before reusing it.
- **A container also follows the sheet down.** Two conditions, because they
  answer two questions: "are my own columns too narrow" and "has the sheet given
  up being a grid". The second cannot be derived from the first — once the sheet
  is one column each component has the whole pane, so a two-column container is
  221px on a 1400px pane where it must keep its grid and 348px on a 380px pane
  where it must not. **The narrow case is the wider one**, so no threshold on a
  container's own width can separate them. `.sheetsmith-view` carries
  `container-name: sheetsmith-sheet` and the inner grids query it by name.
- **A rule a container query cannot compute is tabulated, not approximated.** A
  query can neither multiply nor read a custom property, and
  `repeat(auto-fit, minmax(…))` renumbers the columns and breaks explicit
  placement — so the view stamps the column count as a class and `sheet.css`
  writes the formula out once per count. `styles.test.ts` holds every entry to
  the rule, so a table cannot drift off the thing it tabulates.
- **The layout editor pane has two narrow rules, because it asks two
  questions** [judgement; seen in `editor-narrow`, `editor-phone` and the four
  threshold views] (`docs/features/layout-editor-narrow-regime.md`). Whether
  the canvas is a grid takes no number of its own: the canvas wears the sheet's
  `.sheetsmith-view`, so the sheet's own 480px collapse reaches it, and its
  gestures leave under the same named query, `sheetsmith-sheet`, on the pixel
  the grid stops — a grid drawn as one column takes no drag, resize or arrow
  key, and a touch there scrolls. Whether a setting row fits beside its name is
  the pane's, `sheetsmith-editor-pane` below 584px, the narrowest width the
  panel's forms have been looked at side by side; the rows then stack as the
  app stacks them on a phone, toggles, headings and tree rows excepted.
- **A Rows or Columns list in the pane is capped by a distance in px and
  floored by its tallest staged entry plus its header** [judgement; held by
  `harness/measure-lists.mjs`, seen in `editor-phone-skills`]
  (`docs/features/list-scroll-cap.md`). The cap is what keeps an eighteen-row
  list from burying the fields under it, so it is a distance down the pane,
  400px at most and bounded by the window, never an em of a desktop row. The
  floor is one whole entry, an entry showing its message included: 244px where
  the rows sit side by side, 400px under the list's own 380px query where they
  stack. So one entry is always whole, and on a phone, where the floor is the
  cap, the nested scroller is the accepted cost.
- **Media queries are for user preference and device capability only**:
  `prefers-reduced-motion`, `forced-colors`, pointer coarseness. Never for space.
- **Cascade order is load-bearing.** `@container` adds no specificity, so an
  override must sit *below* the rule it overrides. An equal selector placed
  above it simply loses.
- **A gap is always the `gap` shorthand, never `column-gap`** [judgement]. On a
  flex or grid box the long-hand is perfectly supported, but caniuse files
  `column-gap` under multi-column layout, so a browser-support linter reads any
  such box as using multicol — and Obsidian's plugin directory runs one over
  every release. Three rules have reached for the long-hand and been rewritten;
  the shorthand spells the same pair, row then column, at no cost but the
  obvious word. `row-gap` alone is unaffected and needs no shorthand.

---

## 5. Type

- **Relative units for anything that should scale with the sheet's own type**
  [judgement]. The card's headline number is `1.75em`, not a pixel size, so the
  card scales with whatever sets the sheet's size.
- **What sets the sheet's size is not the vault's text-size setting**, which
  this section used to claim [judgement]. Obsidian 1.14.4 sets `body` to `--font-ui-medium`, 15px, and
  nothing on a view, and the vault's text size reaches only `--font-text-size`,
  which the markdown views read — so the sheet's `em` moves for a theme or a
  snippet that sets it, and for nothing in Settings. The harness's `text=`
  stands for that, not for the setting, and its default is 16px against the
  app's 15. **So a width that has to agree with fixed-px chrome is px, never
  `em`**: a record line's stacking tiers and its strip's thresholds are, since
  every width on the line is a fixed-px token
  (`docs/features/record-set-stacking-tiers.md`). The strip's were `em`, and the
  app drew each at 15/16 of the width it was measured at.
- `--font-ui-small` / `--font-ui-smaller` for secondary and tertiary text;
  `--font-smallest` below that.
- **A surface hung off `document.body` is app chrome, and takes the app's UI
  sizes rather than the sheet's** [judgement]. The anchored panel and the shared
  popover are `--font-ui-small` and `--font-ui-smaller`, so whatever sets the
  sheet's size does not reach them: at `text=24` the panel's body measures
  390 x 547, as at the default (re-measured in the fifth rulings pass), beside a sheet that grew 650px. That is right: they do
  the job of Obsidian's own `Menu` and `Modal`, which keep the same sizes, and
  §1 is why the plugin invents no type scale of its own.
- **`font-variant-numeric: tabular-nums` on every number that changes.** A value
  that reflows while stepping reads as movement the user did not ask for.
- Secondary text, an abbreviation under a stat name or a gloss beside a row, is
  one style: sized down, tracked, muted. Reuse it rather than inventing a
  second quiet style.

---

## 6. Accessibility is part of the control

Not a pass afterwards. Each of these is already load-bearing somewhere in the
sheet.

- **Forced-colors mode discards `box-shadow`.** A focus ring drawn as a
  box-shadow carries a transparent `outline` companion, invisible in an ordinary
  theme and repainted as a real ring wherever the browser drops shadows:
  ```css
  box-shadow: 0 0 0 2px var(--interactive-accent);
  outline: 2px solid transparent;
  ```
  Prefer an outline outright where the offset allows it.
- **`forced-color-adjust: none` only on a glyph or a count sitting on a
  system-colour fill the plugin itself painted** [judgement]. Its colours then
  come from system keywords only, never theme tokens, since the mode no longer
  repaints them, and each use is evidenced by a `sheet-forced-colors` shot. A
  Track's wholly lit glyph and its lit `+N` count are the cases: the mode paints
  a `Canvas` backplate behind text, which put `SelectedItemText` black on black.
  A glyph on a partly lit segment is not a case, since part of it sits on
  `Canvas`, so it keeps the mode's own colour and plate
  (`docs/features/forced-colors-track-and-table.md`).
- **`prefers-contrast: more` raises every line that is a surface's or a control's
  only edge to `--text-muted`, and leaves the rest** [judgement; seen block by
  block in `sheet-contrast-more`, `-dark` and `sheet-record-groups-contrast-more`].
  That is a card's border and pill, a table's box and cells, a pool's box and
  steppers, a track's box, segments and dividers, a placed box, a record group's
  outline and header rule, the record strip's rule, and a record's menu, which
  was the one edge left faint until this was looked at. A placed scroller's
  foot cue is raised too, since it is the only sign that content is hidden,
  but as a 2px `--text-muted` rule on a 10px floor of the box's own fill
  rather than a darker shade: a shade over the last legible line lowers that
  line's text, and a rule laid straight over content reads as an edge of
  whatever it crosses. **The form tint keeps
  its colour as the edge alone**: the box's fill and the tag's go, the box's
  outline is 2px in the edge colour, and the tag sits on the plain page with its
  1px edge, since the edge already clears 3:1 against a card in every colour
  (`docs/features/form-tint-colour.md`). Two marks go further: a
  menu's chevron, a card's and a record's alike (§9), to `--text-normal`, and every marked level ring and harm
  segment to the full fill, since a ramp trades contrast for shape. **The
  abbreviation and the unresolved `?` have no block**: both are muted at every
  contrast (the faint rule below). **Left alone, as the ruling and not an
  omission**: a container's heading rule and a tab strip's baseline, whose
  heading text carries the structure; a Passport's chips, whose fill is the
  field; a Pool's bar track, which repeats the number above it; the Rich text,
  Image and record body placeholders, the asymmetry `sheet.css` records at
  Passport's block; and an unresolved link, which takes the app's own
  `--link-unresolved-*` tokens, so a theme that answers the query answers it here.
- **One focus treatment per component.** The same gesture in the same component
  must not produce two different rings. **A round control takes a round ring**,
  so a Record set's summary line can show three same-size circles — a focused
  glyph button, a lit ring, an unlit one — and that is accepted: fill against
  outline separates state from focus (`legibility.md` §2), and a destructive
  control's safety comes from arming before it fires (§9), never from a focus
  shape of its own, which would be a second treatment in one component.
- **`prefers-reduced-motion: reduce` removes transitions**, and every animated
  rule needs the companion block.
- **`.sheetsmith-sr-only`** carries text for assistive tech only.
- **`aria-label` replaces a name; `title` adds to one.** A control whose text is
  on screen keeps that text as its accessible name, and anything supplementary —
  where a link goes, what a glyph is called — rides in `title`. An `aria-label`
  there announces a word that appears nowhere in the control, which fails WCAG
  2.5.3 and leaves voice control nothing to match. An aliased wikilink in a cell
  was the case that taught this: it copied Obsidian's own markup, which puts the
  link target in `aria-label`. `aria-label` is for a control whose visible mark is
  *not* words — a ring, a glyph button — which is the next rule.
- **Obsidian draws a tooltip of its own from every `aria-label`, and the sheet
  turns it off** [checked: `styles.test.ts`]. In 1.14.4 the app listens for a
  pointer over any `[aria-label]` and shows the label about a second later,
  unless the element's computed `--no-tooltip` is `true`, a switch its own
  `app.css` sets on five surfaces. Left on, it overrode every `title` decision
  below: over Traits' clipped record name it said "Feature" while the name sat
  in `title`, a Notes cell said "Barkskin Notes", and a Track run said its
  composed name at every pass. So `.sheetsmith-view` and `.sheetsmith-panel` set
  it, and two exceptions set it back. Markdown the app rendered is the first,
  since an aliased link there carries its only drawn target in `aria-label`. A
  control named only by `aria-label` is the second — the note mark, Pool's door
  and Track's door — since nothing else gives it a hover name. **Read from Obsidian 1.14.4's
  `app.js` and `app.css`, not yet seen working in the app**: the check holds the
  declarations, not their effect, which the owner confirms in the vault.
  **Rejected:** naming controls by
  `aria-labelledby`, which keeps the name and misses the app's selector, but
  costs a node and a unique id at each of 51 `aria-label` sites in sixteen
  modules, and about 270 test lines that read one; and letting the reveal set the app's tooltip,
  which means writing the value into `aria-label` (`setTooltip` does) and so
  replacing the name the rule above gives, at one site of many. **The cost
  taken:** the switch is in `app.css`, not `obsidian.d.ts`, so a rename brings
  the app's tooltip back, which is today's behaviour rather than a break, and the
  harness cannot show either state, since the stub draws no tooltip.
- **A control names every party its context does not already announce**
  [judgement]. A move names where it goes, a remove names what it removes —
  unless the reader reached the control through something already named for
  it. The layout editor's tree is the first place this is written down: its row
  menu is opened by a button named `More options for "Weapons"`, so an item
  names only the *other* party — `Move into "Tools"`, `Move out of
  "Proficiencies"` — and **Move up** and **Move down** name nobody, since the
  neighbour is on screen directly beside the row
  (`docs/features/layout-editor-tree.md` §5). A list field's controls are the
  opposite case, reached by Tab with nothing announcing their entry, so every
  list field's reorder and remove controls name it — `Move STR up`,
  `Remove STR` — whether drawn by `addControls` in `editor/list-fields.ts` or
  by the nested list's own remove (`editor/nested-list-field.ts`).
- **A reorder control with ends disables at them** [judgement]: the first
  item's up and the last item's down, as the layout editor's tab-order arrows
  already do. A control that does nothing when pressed says so, and disabled is
  announced. A drag handle has no ends to disable — it is one control, and an
  arrow key at an end does nothing. The cost falls on focus, which follows an
  item through a move by its token: a move that lands it at an end would leave
  focus on the arrow just disabled, so focus goes to the opposite one, and only
  where the pressed arrow held focus, since a tap that focused nothing must not
  be given focus. Both arrowed lists do this: a list field's touch arrows
  (`addControls` in `editor/list-fields.ts`) and a tab set's tab order
  (`renderChildOrder` in `editor/config-panel.ts`), each spelling the handoff
  at its own site (`docs/features/disabled-controls.md`).
- **A glyph-only control shows a disabled state as muted paint plus
  `aria-disabled`, and as GrayText in forced colors** [judgement]. It has no
  surface to drop and no label to fade, which is what the Modifiers list's
  disabled select and its label do (`docs/features/modifier-notes.md`), so the
  visible channel is the app's own `.clickable-icon[aria-disabled='true']` fade,
  and the pane adds `cursor: not-allowed` and the system's disabled colour under
  `forced-colors: active`, since the system cannot know a `div` is disabled. A
  `div` carrying `aria-disabled` also carries `role="button"`, without which the
  state is not reliably exposed. A glyph has no shape to change, so "neither
  colour alone" holds only through the channels a reader does not see: out of
  the tab order, announced, and no pointer answer
  (`docs/features/disabled-controls.md`).
- **State goes in ARIA, not only in paint.** `aria-pressed` on a two-state mark;
  `aria-label` composed from the label and the state name the layout author
  chose, since "Stowed" says more than "not pressed".
- **Announce what is not visible.** A commit or an Escape-restore that changes
  nothing on screen is announced.
- **Only a named level or an over-run value earns a `title`, and a tooltip
  repeating what is already legible is noise** fired at every pass [judgement].
  A two-state mark carries its state in `aria-pressed` and its name in
  `aria-label`, so a tooltip has nothing left to say, while a *named* level has a
  word the glyph cannot draw. Written down because the third component to draw a
  ring set `title` unconditionally.

  **The over-run half was added with
  `docs/features/track-stored-value-past-shortened-run.md`, and the premise
  above is why it fits rather than an exception to it.** A Track whose note holds
  more marks than its run draws the extra past the end, and a flag card holding a
  count above one reads as ticked; in both, how much the value holds is legible
  nowhere else — a slash to count on a run, nothing at all on a ring. The
  accessible description alone would leave a sighted reader unaware of it, and the
  ruling that a step down or an untick is an *informed* write depends on the reader
  having been told. So an over run titles its reading (`5 of 3, 2 over`), named or
  not, and a flag holding a count titles `Holds 3 marks from a longer run` through
  `bindRingControl`'s `note` option, since its paint owns the ring's `title`.

  **What "already legible" rests on is the control's name being on screen beside
  it, and that is the condition rather than an exception to the rule.** A card's
  name is above it and a cell's is in a `<th>` over its column, so there the
  level's word is the only thing a tooltip could add. A record has neither: a
  reader sees `Fireball · Level 3 · ●` and nothing on screen says the dot is
  "Prepared", so the name is the first thing missing and a named level adds its
  word to it. Without the condition this bullet reads as saying a record is
  wrong, and it is not. **A record's name is on screen only in a headed list's
  wide regime** (`fieldHeadings`, and a list wide enough for the strip), and
  that is a width only the stylesheet sees, so a record's ring still answers
  `nameOnScreen: false` at every width: answering `true` would take the tooltip
  and the long press away in the narrow regime, where no name is on screen.
  **A ring inside the opened record answers `true`, and that is the same rule
  rather than an exception to it** (`docs/features/record-set-body-fields.md`):
  a body field draws its own name beside its control at every width and no strip
  or query touches it, so there the fact is knowable at draw time and it is true
  — Table's position. A body toggle has no tooltip; a body named level keeps its
  level's word.

  **It is a question every caller answers, never an answer a surface is assumed
  to have** — which is the whole reason `components/ring-control.ts` takes it as
  `nameOnScreen`, a fact about the surface, rather than as a request for a
  tooltip. The cell is where that matters rather than being a formality: a column
  may take its heading off the sheet with `hideHeading`, which `SPEC` §4.2 built
  for the ring column specifically, and it leaves the heading rendered for
  assistive tech — so the name goes from the *eye* alone, and the tooltip becomes
  the only route a pointer has to it. Table and Roster therefore derive the fact
  rather than asserting it, and on the sheets that ship it is false more often
  than not: nine of the level columns across the three starter layouts hide their
  heading. **The rule needs no exception, which is the point** — it is true of
  every caller, and the two branches cannot drift into three.
- **A mark whose state is only a fill strength has one channel.** Filled against
  empty is a shape difference and carries itself; two marked levels differing
  only by how far the mix went do not. `paintLevelRing` is the model, and its
  comment says so: the ramp "costs nothing, because the glyph and the name were
  already carrying the exact answer." A new mark either has that second channel
  or the review says what a reader sees without it.
- **Text a reader reads back meets 4.5:1 on the surface it sits on, or 3:1
  where it is large, and `--text-faint` meets neither on any surface a sheet
  has** [checked: `styles.test.ts`, faint confined to placeholders and
  `:disabled`; the ratio itself is judgement]. Faint is **2.12:1** light and **2.57:1**
  dark on a card (`--background-secondary`), 2.20 and 2.74 on a table or a
  placed box (`--background-primary-alt`), and 2.30 and 2.97 on
  `--background-primary`; `--text-muted` is 6.19 / 7.03, 6.41 / 7.50 and
  6.69 / 8.13 on the same three. So a gloss, a secondary column, a step name, an
  unresolved `?`, a drained value and a glyph control at rest are all muted, and
  a rank below the value is carried by size, tracking, case and weight rather
  than by a third grey. **Faint is kept for a placeholder or a disabled control
  only**, each with its reason at the rule: a placeholder is a hint standing in
  for a value and takes the app's own `--input-placeholder-color`, and a disabled
  control is exempt from contrast and carries its state in `disabled` besides.
  `styles.test.ts` holds `sheet.css` to that, and any exemption sits in the test
  beside its reason (`docs/features/text-faint-audit.md`, which measured every
  instance; `docs/features/track-row-legibility-and-clipped-fields.md` was the
  first, for a Track row's name column).
  **So a placeholder never carries anything the row does not also say at full
  contrast** [judgement], in its description or its value; one that repeats the
  description is accepted as redundant. The settings tab's **Character folder**
  is the instance: the app's `setPlaceholder` draws `Same as new notes` at
  2.30:1 light and 2.36:1 dark, nothing inside it can raise that, and the
  description names the same destination. It stays rather than going because,
  with an `aria-label` as the name, a placeholder is exposed as the input's
  accessible description (per HTML-AAM, not tested with a screen reader).

The numbers these rules are judged against, and the way to measure them, are in
`.claude/skills/design-review/reference/legibility.md`: contrast ratios by text
size, the 10px type floor, hit target sizes with the gap rule beside them, and
reading order against visual order. §1's "pick the text variable defined against
whatever you mixed into" is the rule; that file is what shows whether a given
case obeys it.

---

## 7. Touch

- **A finger has no hover and no pixel to aim at.** Hit targets are the card,
  not the mark: a ring is 1.6em, and a card answering only on the ring reads as
  dead everywhere else.
- **Focus on `pointerdown`, commit on `click`.** A tap cannot preview what it is
  about to hit, so focus moves while the finger is down; committing on release
  is what lets a mis-aimed press slide off and be taken back.
- Never a hover-only affordance. Anything reachable by hover is reachable
  another way.
- **Where focus is not an outcome, the press has to produce one** [judgement]. A
  card routes a press to the control nearest it, which on a field is the whole
  edit gesture — a caret, and a keyboard on a phone — and on a `<select>` is a
  ring on a desktop and nothing at all under a finger. So a card's menu opens on
  that press (`showPicker()`, falling back to focus), or the card's own hit target
  answers with silence. The measurement is the argument: a menu's box is as wide
  as the chosen option, so the same card gives a field 432x29 and a menu 28x29
  with nothing stored, and neither grows under a coarse pointer.
  **And where the outcome is far from the press, the press brings it**: in a
  stacked layout editor a selection made on the tree or the canvas puts its
  form up to 30,000px below, so the press scrolls the panel's title to the top
  and moves focus there, and **Back to the selection** returns
  (`docs/features/layout-editor-narrow-regime.md` §4). That is focus moved by
  the reader's own press, not focus moved without one, and it fires only where
  the panel is out of sight, never beside the tree.
- **A field inside a row is at least the pointer minimum on both axes, and the
  row takes that as its floor** [judgement]. `--size-4-5`, 20px, which is
  `legibility.md` §5's 20x20. The floor goes on the row as well as the field so
  every row in a set keeps one pitch, and a card mixing rows that hold a field
  with rows that do not is never ragged. `min-height` rather than `height`, so a
  larger text size still grows the row. A Track row is the case: 18.9px rows on a
  20.9px pitch became 20px on 22px, a typed name field went from 75.6x12 to
  75.6x20 and a length field from 16.1x16 to 20x20, with the length field's
  `min-width` scoped to Track so Pool's max field does not move
  (`docs/features/track-row-legibility-and-clipped-fields.md`). A later touch pass
  starts here.
- **A field asks for the numeric keypad only where every valid value is a
  non-negative whole number, and otherwise for `text`** [checked:
  `src/numeric-keypad-sites.test.ts`]. On an iPhone `inputMode = 'numeric'` is
  the digits 0 to 9 and nothing else: no minus, no plus, no operator, no decimal
  point, no letter, and no Done key; `decimal` adds the point and nothing more.
  iPadOS draws a full number-and-symbol keyboard for the same modes, so only the
  phone shows it, and the harness and desktop show nothing either way. So the
  question at each field is what its *valid* values are, never what it usually
  holds: a valid negative (a `-1` Bonus, a pool run below zero), a fraction (a
  `0.5` Weight), arithmetic the field settles (`43-7`, `2*3`), or a word or a
  formula (a stat's word, a ceiling's `prof`) each needs a key the keypad lacks,
  and one of them is enough for `text`. Text a field merely accepts without
  meaning anything by it — stored as typed, or clamped — does not count, since
  the keypad refusing it costs nothing. **On a field this rule decides**, one
  whose value is or may be a number, `text` is set explicitly rather than left
  as the default, so the decision is visible at the site and its test has
  something to assert; a field that only ever holds words needs no say. **A
  keypad that switches on what the field holds is not offered**: from an empty
  or numeric field it could never be left, which is
  `docs/features/record-ceiling-formula.md`'s argument. One field keeps the
  keypad today, Pool's temporary points (floored at zero, no arithmetic). The
  length in Track's **Add** form had it until it began settling sums as the
  row's own length field does (`docs/features/track-add-length-settles.md`).
  The scan holds that population, so a second is a decision made here.
- **A focused number is selected, because a finger cannot aim a caret**
  [checked: the focus-kind cases in `card.test.ts`, `table.test.ts` and
  `pool.test.ts`]. A field bound with `step` or `arithmetic` that holds a
  finite number when focus arrives — after a pill's swap to the stored number —
  selects the whole of it, so a tap and a typed number replace the value rather
  than appending to it. Touch, the keyboard, a press routed from a card's
  padding and a focus from code all select. **The one exemption is a mouse or
  pen press on the field itself**, which aimed its caret; a pen tip being aimed
  is an assumption until a Pencil has been tried by hand. **A second press into
  a field that already has focus places the caret** and selects nothing, so one
  digit can still be fixed. One rule in `editable.ts`, no option and no
  component code; the field list is
  `docs/features/number-field-focus-select.md`.
- **A surface that drags under a finger takes a select step, so it does not
  trap the scroll** [checked: `styles.test.ts`, `schematic-gestures.test.ts`].
  `touch-action` is decided at touch start from the element pressed, so a
  surface of blocks all `none` lets a scroll start only in its gutters: on an
  iPad the editor canvas left two 12px strips in portrait and none in landscape.
  So on the canvas an unselected block is `pan-y pinch-zoom` and a touch press on it
  only selects, and the selected block alone is `none` and carries
  `data-ignore-swipe`, so its drag opens no sidebar. Decided per press by
  `pointerType`, never by platform: a mouse drags any block in one gesture, and
  a pen takes the step, since `touch-action` governs it as it does a finger.
  Vertical only, because the canvas is a sideways scroller of its own, and a
  finger drawn across a block must not slide it.
  **The cost is named, not hidden**: no touch scroll can start on the selected
  block, and selecting another block or the **Layout** row frees it. No hold
  delay, which would need a non-passive `touchmove`
  (`docs/features/canvas-touch-select-step.md`).

---

## 8. Motion

Movement is judged by frequency first. A character sheet is a control panel: the
same rings, pools and tracks are pressed dozens of times in a session, so
anything that animates on every press puts a wait in front of every press, and
the sheet gets slower to use the longer the session runs. **Restraint here is the correct answer, not a lack of ambition.**

The sheet also lives inside someone's notes and should not behave more
energetically than the app around it.

- **Motion earns its place by doing a job** [judgement]: showing state changed,
  keeping the reader oriented, softening a jump, confirming a press landed.
  Anything touched every few seconds gets feedback, not animation.
- **Transitions, never a keyframe on time** [judgement]. A transition can be
  interrupted and retargeted mid-flight; a keyframe animation on the clock
  restarts from zero. Everything here is repeatable and reversible, so
  everything is a transition. **One `@keyframes` is the exception, and it is
  not on time**: the placed scroll cue's, run on a scroll timeline, so it never
  plays and never restarts, its progress being the scroll offset (`sheet.css`,
  "A placed box that scrolls says more is below"). **That it stays the only
  one is checked, and so is that it never runs on the clock** [checked:
  `styles.test.ts` allows that one `@keyframes` and refuses any other, on time
  or not, and holds every rule naming it to the `@supports` gate and an
  `animation-timeline`]. A second keyframe argues its case here first.
- **Never `ease-in`.** It delays the instant the user is watching.
- **Motion stays under 300ms.** A colour or opacity fade is not motion and may
  run longer when it is deliberately slow.
- **Prefer `transform` and `opacity`.** Animating `width` or `height` costs
  layout and paint, so it needs a reason stated in a comment. The pool fill and
  the track response both animate `width` and both carry that reason.
- **Gesture values are grabbable at any instant** and continue from where they
  are, rather than snapping to a start.

The tuned constants in `src/interaction/`, covering projection deceleration,
throw decay, scrub resistance, the hold ramp and the velocity window, are
decisions taken against the real control, with the argument in the code beside
them. Treat them
as settled unless a specific failure is observed.

The full standards, and the vocabulary for describing motion precisely, are in
`.claude/skills/design-review/reference/motion.md`.

---

## 9. The shared vocabulary

New components reuse these rather than inventing a lookalike. A fourth kind of
panel beside a row of cards reads as loose chrome floating on the page.

The card is shared vocabulary *and* a component name, which SPEC §2 settles:
a Card is the component that is nothing but one card, a Card set is a strip of
them, and Pool borrows the look. Reusing the card is still the rule — the name
belongs to the component that is only that, not to whoever renders one.

| Thing | Where | Used by |
| --- | --- | --- |
| The card | `.sheetsmith-card`, `.sheetsmith-card-single` | Card, Card set, Pool, Passport's face |
| A heading over a region | `.sheetsmith-group-heading` | Group, Tab set |
| A stat's name, value and reading as one line of a table | `.sheetsmith-roster-band-inner`, `.sheetsmith-roster-band-value` | Roster's band head. **Reuses rather than restyles**: the name takes `.sheetsmith-group-heading`, the score `.sheetsmith-card-input`, the reading `.sheetsmith-card-derived`. What is new: the band-inner wrapper, a `<div>` inside the table's own `<td>` rather than `display: flex` on the `<td>` itself, which the engine boxes in an anonymous table-cell and loses the `colSpan`-driven width; and the value/reading centring sub-group `.sheetsmith-roster-band-value`, needed only because a band head's own width is not a card's |
| A component's own name | `.sheetsmith-component-label` | the card face, Pool, Track, Rich text, Image, Record set, Passport — **six consumers**, which is what took it from a comment in each file to a name in this table |
| A strip of alternatives over a region | `.sheetsmith-tabset-strip` | Tab set's tabs |
| The level ring | `paintLevelRing`, `.sheetsmith-level-ring` | Table's `level` and `toggle` columns, Record set's `level` and `toggle` fields, Track's flag, a Roster cell, the editor's level sample |
| The control that ring is | `components/ring-control.ts`'s `bindRingControl` | the same four components, and **deliberately not the editor's sample**. The painter and the control are two rows because they have different rosters, and the sample is the reason rather than an omission: it is a `<button>` with an `aria-label`, an `aria-pressed`, a `title` and a click of its own, but **its two states are a fact about the layout** — "this level shows a mark" against "shows nothing" — where every state here is a fact about a character's level, and its press sets a glyph rather than cycling. So folding the ARIA into `paintLevelRing` would overwrite a true statement with a false one. What the module owns is everything the four had a copy of — `aria-pressed` against a state carried in the name, which level earns a `title`, the long press that is a finger's only route to that word, and the press that cycles against the arrows that step. It knows no caller: the button and its classes are the caller's, as `linked-text.ts`'s are, and here not even the class name is passed in. The one thing that differs per surface arrives as `nameOnScreen` (§6) |
| The editing gesture | `editable.ts` | every stored value on a sheet |
| Brackets that close and lists that continue as prose is typed | `interaction/markdown-typing.ts`, on `beforeinput` | Rich text's field and a record's body, through `bindMultiline`. **Fixed, not read from Obsidian's editor settings**, which are not public API: `(` `[` `{` pair and step over, `*` `_` `` ` `` only wrap a selection, Enter continues `-` `*` `+` `N.` and task items, and an empty item steps out one level. No appearance of its own. |
| The focus a transparent field takes | one selector list in `sheet.css` | Table's cells, Rich text's prose, Image's reference, a record's name, its number fields and its body, a Passport's name. **A third list sits beside these two and is not a fourth kind of treatment**: a chromeless field drawn *inline on a card row* takes `.sheetsmith-pool-max-input`'s own hover and its box-shadow ring instead — a Pool's character-owned max, a Track row's own length through that very class, and a Track row's own name, which is one selector on each rule rather than a copy of either. The split is the control's shape and not its component: these three paint no border at rest, so an accent *border-color* has nothing to colour, and §6's one-focus-treatment-per-component is what puts a Track card's two fields on the same one of them |
| The hover a transparent field takes | a second selector list beside it | Table's cells, a record's name and its number fields, a Passport's name — **a deliberately different roster from the focus list above**, and each absence is the roster's own definition rather than an exception: Image's field is `pointer-events: none` until its frame hands the press over, Rich text's display layer owns the press so its field never sees a hover, a record's body is a textarea with chrome of its own, and a Passport's *values* left the list when they became tags, because a control with a surface at rest has nothing to reveal. Order is not load-bearing in either list: `:hover` and `:focus` are pseudo-classes, so every selector is (0,3,0) against its base rule's (0,2,0) |
| Secondary text | `.sheetsmith-card-abbreviation` | Card set, a Record set field's name — **on every field type inside the opened record**, where no strip names a body field so the span is its only name and no rule hides it — **and a Record set's strip of field names** (`fieldHeadings`): the same rank, sticky over the list, deliberately *not* Table's header clothes, which are larger, medium weight and uppercase. **Not a Passport's placeholders**, and the near miss is worth the row: they borrowed this rank once and a design review measured a half-filled line carrying two type sizes on one baseline, with the smallest and faintest string on the face holding the *headline* slot. A placeholder takes the field's own size and `--text-faint`, the app's own placeholder colour, which is what a Card's empty em dash already does |
| Inline error | `.sheetsmith-error` | every component's own failure |
| Arm, then commit | `interaction/arm-to-confirm.ts`; `.sheetsmith-table-remove-button`, `.sheetsmith-record-remove`, `.sheetsmith-panel-remove`, `.sheetsmith-passport-part-remove` | Table's row delete, Record set's record delete, the modifier form's **Remove** (the sentences only), a Passport list field's own part delete — reused at a deliberately lower stake than the other three, since a part is a short phrase cheaply retyped, on the argument that one mental model for "this plugin's delete controls arm, then confirm" beats a lighter gesture invented for the cheaper case (`docs/features/passport-field-lists.md`). **A Track row's own remove no longer binds this module**: a row lost its own remove control to the row set's shared **Remove** picker (below), so nothing here presses twice on itself any more — what it keeps is the two sentences (`armedName`, `armedPrompt`, `STOOD_DOWN`), imported directly so an armed line in that picker still reads in this vocabulary (`docs/features/track-row-length.md`). **That picker now lists a second kind of row**, the ones the character named rather than the layout, after the declared ones and in the note's own order — and it is the one delete in this plugin **whose target does not come back**: removing a declared row puts it back on the **Add** panel's list, while removing a character-added row deletes the only record that it ever existed. The gesture is not made heavier for it, on this table's own one-mental-model argument; what carries the difference is the armed line saying the name, which the reader reads before the second pick (`docs/features/character-added-track-rows.md`) |
| A total under a table | `tfoot` + `.sheetsmith-table-value` | Table's column totals |
| The add control | `.sheetsmith-table-add-button`, `.sheetsmith-record-add` | Table's add row, Record set's add record — **one treatment, in one stylesheet rule**: a rule across the top, a centred label, and the hover surface every control on the sheet uses, **pinned to the foot of the card**. It is the last child of the card's box, `margin-top: auto`, outside whatever scrolls — a table's scroller wraps the table alone and a record set's list scrolls in its own wrapper — so in a cell taller than the rows it sits at the bottom of the cell with the space above it, it never scrolls sideways or away, and its label needs no `position: sticky`. Only an `openRows` Table draws the box that stretches, so a closed Table in a tall cell is unchanged (`docs/features/table-add-row-pinned-bottom.md`). **Not** a Track row set's own **Add** and **Remove**, `.sheetsmith-track-action-button`, which depart on purpose: one icon-only trigger per row set for each, Table's own delete glyph's circular shape, opening `ui/anchored-panel.ts`'s panel to name the specific row it offers rather than drawing a button per candidate or a bin icon per line — several *specific* things to add or remove, picked from a list rather than read off a row of controls (`docs/features/track-row-length.md`). **And the Add picker is a list *and a form*** where a Track lets the character add rows of their own: a **Name** field, a **Length** field and one **Add** button, in the panel's own `.sheetsmith-panel-field` clothes, appended under whatever declared rows are still on offer and separated from them by a rule rather than boxed — a form inside a panel is part of it, not a second surface floating in one. The name is typed *before* the entry exists, which is the whole reason it is a form rather than a press: the name is the fence key, so a default pressed twice would be a duplicate key, and that is a whole-section failure rather than a second row. Where nothing is left to offer the form is the whole panel, and the trigger is drawn whenever the toggle is on (`docs/features/character-added-track-rows.md`) |
| Rendered text over its own field | `.sheetsmith-table-linked`, `.sheetsmith-rich-text-box`, `.sheetsmith-image-box`, `.sheetsmith-record-linked`, `.sheetsmith-record-body`; `ui/spellcheck.ts` | Table's wikilinks, Rich text's prose, Image's reference, a record's name and its body |
| Text with its wikilinks as links | `components/linked-text.ts` | Table's cells; Rich text's and Record set's fallback, **and the anchors the app's own renderer drew** — the module both paints anchors and adopts them, because the press and the hover are the same policy either way |
| Markdown drawn by the app's renderer | `view/markdown-pass.ts`; whether a link resolves, `view/link-resolution.ts` | the sheet view, the layout editor's canvas and the component picker's preview, each with its own pass, begun per draw. **The canvas renders a sample's prose as the sheet does, because an author judges the layout against it** (`docs/features/canvas-renders-markdown.md`). There it resolves against the open layout file and hands over no `link`: a link is drawn, faint where the note does not exist, and never followed on any modifier, since it sits in the inert subtree under the overlay. The harness draws through the same pass over a stand-in renderer that is not Obsidian's (`harness/stand-in-markdown.ts`); `renderer=none` photographs the fallback |
| A box sized by its placement | `.sheetsmith-placed`, `.sheetsmith-placed-box` | Rich text, Image, Record set, Passport, Stat block — the component's own block, and its picture, which takes the *box* alone inside a card rather than the pair |
| A boundary on that box | `.sheetsmith-placed-box`'s own border | all four, always rather than only under a coarse pointer: the fill alone measures 1.04:1 against the page. Inside a Passport's card the same fill measures 1.035:1 the other way — Obsidian's subtle surfaces are calibrated against the page and a card is already tinted — and it reads as belonging to the card, which the even 8px inset is what does |
| A placed box's scroll cue | `.sheetsmith-placed-scroll` on the wrapper that never scrolls, `.sheetsmith-placed-scroller` on its child that does; `sheet.css`, "A placed box that scrolls says more is below" | Stat block (`-stat-block-scroll`, `-stat-block-content`), Record set (`-record-set-scroll`, `-record-set-list`). A shadow along the foot while the content runs past it, gone at the end, driven by the scroller's scroll timeline; under more contrast and in forced colors a solid 2px rule instead, `--text-muted` and `CanvasText`, on a 10px floor of the box's fill (`::before` on `::after`), so it stands on fill on every side and completes no edge in the content. **Not** Rich text, whose two layers sit in the box with no wrapper between, and not the Table's sideways shadow, which paints under transparent cells |
| Reveal on hover, only when clipped | `ui/truncation.ts` | The card's label, Table's links, a record's name, a Passport's name, a Record set's group header name and a text field's value. **"Its own text" is `value` on an `<input>` and `textContent` everywhere else**, which the fourth consumer forced: a field has no `textContent`, so the first three's spelling would have set the tooltip to the empty string on a clipped field — a reveal that decided there was nothing to reveal. A copy in the caller is forbidden and unguardable, since `scrollWidth` and `clientWidth` are both 0 under happy-dom |
| A list inside one row of another list | `editor/nested-list-field.ts`; `.sheetsmith-nested-list`, `-line`, `-controls`, `-controls-reserved` | a modifier definition's **Changes**, a Stat block table zone's **Columns**. **The frame only**: the caller draws each line's own controls and names them, so the module knows that no modifier exists — `linked-text.ts`'s arrangement, in the editor. What it owns is the indent, the trailing control track, the remove, and the **Add** footer in `.sheetsmith-entry-footer`'s own clothes. **Indented by geometry rather than a background**, `--size-4-2`, so the nesting survives `forced-colors: active` where an author background is repainted one system colour — and little enough that a definition with one change is still the form that shipped. **A hairline between one line and the next, and spacing alone could not do it**: the forced break puts each line's six controls on two rows, measured 63px apart, against 56px between one line and the next — so the gap said the opposite of the grouping, and raising it far enough would make a two-line entry twice the object a one-line one is. A rule is a difference in kind, it survives forced colors as a border, and it costs a pixel. **The remove is reserved and hidden on the only line there is**, `.sheetsmith-detail-field-reserved`'s argument one element over: a control that is not created gives its width back to the line's grow, so a list holding one-line and two-line entries would read as two forms down the pane. **Up and down arrows where the caller hands its list over, and no drag**: order inside a modifier definition's changes is not observable, since a breakdown lists contributors in *definition* order and two changes at one target contest by size (`docs/features/multi-change-definitions.md`), so that caller draws none; a Stat block table zone's **Columns** is the second consumer, where order is the order the columns are drawn and written in, and its arrows disable at their ends and are named for the column (`docs/features/stat-block-zones.md`) |
| A problem list under a textarea field | `.sheetsmith-field-problems`, `-problem`, `-problem-line` | the function library, the reset triggers, the bonus types |
| A choice from a closed list | a native `<select>`; `.sheetsmith-card-select`, `.sheetsmith-table-select`, `.sheetsmith-record-select`; the chevron on its wrapper, `.sheetsmith-card-dropdown::after` and `.sheetsmith-record-menu::after`, one mark by selector list | Card's options, Table's, Roster's and Record set's `level` set to a select. **One chevron, placed by each control** (the paragraph below): beside a card's value, inside a record's hairline and inside a cell select's field (`.sheetsmith-table-menu::after`) |
| The one sentence a fenced value says about a wikilink | `components/fenced-link.ts` | Record set's fields, a Passport's name and values. **A row for a *sentence*, on `arm-to-confirm.ts`'s precedent** — that row already carries "(the sentences only)" for the same reason: Obsidian indexes no link inside a code fence, so a component whose values live in one refuses a link at the commit, and the sentence is the whole of what the reader is told. Two copies of it is one design pass away from saying two things, which is what `components/isolation.test.ts` scans for by clause. The two words that differ arrive as arguments, so the module knows that neither a record nor a passport exists: a record has a name and a body to move a link into, and a passport has neither |
| A value a form in play changed | `view/placement-decorations.ts`; `.sheetsmith-in-play`, `-placement`, `-marked`, `-mark`, `-mark-inline`; `components/modifier-breakdown.ts`'s `stampModifiedHost` | any published name a Stat block's in-play form pushed at (`docs/features/character-forms.md`). **In the form's colour** (`data-sheetsmith-tint`, `TINT_ATTRIBUTE`, one rule per `TINT_COLOURS` word setting `--sheetsmith-tint`, the accent its default, written once on `:where(.sheetsmith-view)`; `docs/features/form-tint-colour.md`), and **where the forms reaching one box or one tag disagree, the accent**, the tag's words saying who. **The box the form changed takes it, not the number**: a Card's card, each Card set card whose value the form set, a Roster card's score pill (never the card; a stat card holds rows that each move on their own), a Table's or Roster's row, and the placement where a component stamps none (Pool, Track). **A box too small for the tag has its component name what carries it** (`TAG_BOX_ATTRIBUTE`, `data-sheetsmith-tag-box`): a Roster card carries its pill's tag at the card's corner and takes `-marked` alone, no fill or outline, and where only a row moved, that row's tag too, at the card's bottom corner and never the corner beside the score, since a card's name cell is as narrow as the card and a tag laid over it covered the label (Roster stamps the card for a boxed row, `stampRowTagBox`); a row of a Roster's table layout keeps the tag in its name cell; a Roster's band head, a `tr` with no name cell, carries it on `.sheetsmith-roster-band-tag-line`, an empty first item of the band's line, zero wide and stretched to the line's height, so the tag sits at the inline start of the reading's line, centred on it, and at the name's line where the score and the reading wrap under the name (`max()` over the carrier's height and the reading's line box, `--sheetsmith-band-reading-line`, a registered length); a tag is never a direct child of a `tr`. A fill laid over the box's own surface as an image (on each cell of a row), a 1px outline at `-1px`, so the box model is untouched and forced colors keeps it; the number keeps its modified underline. A row is filled and outlined through each of its cells, the name cell included, never through the row; a row of one cell, a band head, takes all four edges (`:only-child`), and a tinted band's inner hairline, which paints over the cell's bottom shadow, takes the edge colour; in forced colors a band head's cell draws its own full-width bottom rule and its inner hairline none, so the repaints reach it. **The pill is once per placement, on the first tinted box, laid over it and taking no room** (no line reserved; the box is the same size with the form on as off): on a card or a placed box it sits on the bottom edge at the inline-end corner, moved down by its own height less the box's bottom padding (`translateY(calc(100% - var(--size-4-2) - var(--sheetsmith-in-play-mark-room, 0px)))`), so exactly the bottom padding is inside the box and the rest, 6px, is in the gap below, leaving 3px of it; every card's, Pool's and Track's bottom padding is `--size-4-2` plus 2px of room (`--sheetsmith-in-play-mark-room`), tagged or not, so a value never moves when a form turns on and a Card set stays an even grid (a Pool's bar bleeds by the same sum, so it stays on the border): its clearance from every content box is geometry, zero by construction in any font, where on the top edge it had been slack against the label's ink, 2.1px in the harness and touching in the app (`harness/measure-form-tag.mjs`, `docs/features/stat-block-zones.md`); which clears the label, the value, a card's score pill and the note mark or door in the top corner at any width; on a table row, which has no free corner, it is laid over the name cell's inline end, centred on the row. **The tag is the form's colour at 85%, with no edge**, written in `black` or `white`, whichever `placement-decorations.ts`'s `pickTagText` measures reading better on the fill composited over the tinted box and over the surface around it, taking the worse of the two (`data-sheetsmith-tag-text`), again on every `css-change`, so nothing assumes what a colour is (`docs/features/form-tint-colour.md`, "The tag's text, picked at runtime"); 4.78:1 at its lowest in the default themes; on a Pool it sits in the top inline-start corner, inside the box, since a Pool clips its overflow and runs its bar along the bottom; 16px tall on a card, a Pool, a Track or a row, with 2px of block padding at `line-height: 1` (1px and half the room) and `--size-2-2` plus 2px inline, so the ink clears the edge by 1.5px above and below and 4.3px at the sides (`measure-form-tag.mjs`); the box's outline and a row's shadows are the edge colour too. **A tag naming several forms on a card widens to the card less its inset** (`.sheetsmith-in-play-mark-several`), since drawn in the accent its words are the only thing saying which forms it means; a single name keeps 12ch, and so does a row's tag, which sits over the name cell, where a wider tag would cover the name the row is read by. Forced colors draws a row's outline as `Highlight` rules, top, bottom and at each end, and drops the colour, as the mode intends. An ordinary modifier keeps the underline alone; an at least the number was past draws nothing. Under `prefers-contrast: more` the fills go, the box's outline is 2px and the tag sits on the page in `--text-normal` with a 2px edge in the edge colour (mixed 60%), the colour kept in the edges; forced colors draws the tag in `Canvas` and `CanvasText` with a 2px `CanvasText` edge |
| A list of records drawn as stat blocks | `components/stat-block.ts`; `.sheetsmith-stat-block`, `-head`, `-play-head`, `-title`, `-uses`, `-pick`, `-form-name`, `-vitals`, `-vital`, `-section`, `-section-heading`, `-panel`, `-changes`, `-actions`, `-table`, `-list`, `-detail`, `-foot` | Stat block. **Record set's box and Record set's controls** (`record-controls.ts`). **It reads as a small character sheet, in the sheet's own vocabulary**: the head is the block's title (`--font-ui-large` bold) ruled off with the section rhythm (`--size-4-3`) on both sides of the rule; the vitals are **stat tiles in the Card's look** (the card's border, `--radius-m`, `--background-secondary`, `--size-4-2` padding; label at the component label's rank, a number at `--sheetsmith-card-value-size` bold and tabular, a text vital at `--font-ui-medium`; a ceilinged number in Pool's reading with its steppers hanging under the value line) that **fill the row** (`flex: 1 1` from a floor, a wrapped tile taking its whole line), wrap at `--size-4-2`, stretch to one height and **sit their values on one baseline** (every tile stacks from its top, one value line at the card value's size); each `=` a form sets on a component's single number is a tile too (*Armour class* over *11*); every section is the sheet's label-over-content pair — the heading at the component label's rank, `--size-2-2`, then its content — with **no divider**: the changes sit under their heading with no box, the traits in a box in the card's clothes (`-panel`), and **the actions are the sheet's own Table** (`.sheetsmith-table` in `.sheetsmith-table-box`: header row, row rules, hover, framed surface), **on the tiles' surface, its header a gentle step off it** — the body `--background-secondary`, the tiles' fill exactly; the header half of `--background-modifier-hover` over it (`color-mix`, 50%), under the row hover's whole step so a hovered row never reads as the header (measured: body text 14.7:1 light, 10.6:1 dark; muted header text 5.8:1 light, 6.4:1 dark) — scoped to the stat block so a placed Table keeps its surface with **one `<colgroup>` on both faces, the trailing delete column included and empty in play** (name ~30%, number ~5ch end-aligned and tabular, text the rest, cells wrapping). In play the cells are text — the name the row's `th`, bold, links live; a number signed — and a placeholder row (the name still the first column's heading, the rest empty) is left out. Two forms on are set apart by a rule above each one's name (`-form-name`, `--font-ui-medium` semibold). **Every form is the edit form, through the same anatomy** (`drawForm`): the same tiles with a text vital as the cells' one-row wrapping field, the changes under an **Edit changes** glyph, the same table with a field in each cell — **a hairline at rest drawn inside the cell's padding**, so the text sits where In play's sits, Speed's field the same treatment — plus a delete column and the Table's add row as its foot, a column heading that repeats its section's heading named for a screen reader only (`.sheetsmith-sr-only`), an open form's line ruled off, its name at the title's size as a closed form's is, and a closed form's line mirroring its tiles (`HP 22/34 · Armour class 11`). Traits render as markdown in both faces and edit on a press (`drawRecordBody`); closed, their box takes no room. Under `prefers-contrast: more` the tiles, the traits box, the attack table's frame and every rule take `--text-muted`, in a block after the base rules. A disclosure focused by a pointer draws no ring (`sheetsmith-pointer-focus`). **The body is the layout's zones** (`components/stat-block-zones.ts`, `docs/features/stat-block-zones.md`; `-zone`, `-zone-table`, `-zone-features`, `-zone-text`, `-entry`, `-entries`, `-entry-line`, `-entry-name`, `-entry-usage`, `-add-entry`, `-drift`, `-drift-tag`, `-drift-note`, `-zone-markdown`): a table zone is the attack table above, its first column naming each row and its heading spoken only where it reads like the zone's own under the zone's tolerant match; a features zone draws each entry as its own markdown, `--size-2-2` apart, and under Every form a line of name, usage and the arm-then-commit delete over the entry's text box, **Add entry** in the Table's add-row clothes, the name and usage stacking under the 360px query; a text zone is the traits box, behind its heading as a disclosure where `collapsed` is on and open under Every form. **An empty zone draws nothing in play**: no heading, no box, no *None yet*. **Drift** — content no zone owns — is a section headed by the note's own heading with *Not in this layout* beside it as a muted sentence-case pill of its own (`-drift-tag`: a hairline, `--radius-s`, `--background-primary`, `--text-muted` at `--font-ui-smaller`, no capitals or tracking), so it never reads as more of the heading, its markdown read-only in the card's clothes and one muted sentence naming where to fix it, on both faces. **The picture** (`image`) is a square thumbnail three times `--font-ui-large` at the title row's inline start (`-thumb`), through `picture-frame.ts` read-only; a reference that does not draw takes no thumbnail and says the painter's sentence muted under the head, on the block's problem line (`-problem`, which also holds a stray tint word's sentence); Every form opens with a **Picture** section holding the frame and its field (`-picture-box`). **The tint** (`tintPerRecord`): Every form's **Tint** section after Picture, the app's own `dropdown` and a swatch beside it on one wrapping line (`-tint`, `-tint-line`, `-tint-choice`); the swatch (`-tint-swatch`) is a `--font-ui-small` square at `--radius-s` filled in the edge colour, `aria-hidden`, taking no pointer, and hidden in forced colors; a stray colour word says its sentence on that problem line. **The form's colour in play is the head's rule** (`docs/features/stat-block-in-play-polish.md`): with one form on the In play head carries its word and its bottom rule is 2px in the edge colour, the accent's included, so the line under its name and the outline round each box it changed are one colour; with two on, each `-form-name` row's rule takes its own form's colour and the head's stays the plain hairline, and the first row takes `--size-4-1` more above it where it follows the report's box, so its rule does not read as doubling the box's edge; under more contrast the 2px edge stays, and forced colors draws the plain 1px rule. **The head's picker and Revert are one pair in the tiles' clothes** (border, `--radius-m`, `--background-secondary`, the card's hover) at one height, `--input-height`, 44px under a coarse pointer, the picker still a native select with the record menu's chevron. **With no form on, In play offers a brief of each readable form** (`components/stat-block-briefs.ts`; `-briefs`, `-brief`, `-brief-head`, `-brief-thumb`, `-brief-name`, `-brief-stats`, `-brief-stat`, `-brief-stat-label`, `-brief-stat-value`, `-brief-ceiling`, `-brief-changes`, `-brief-zone`, `-brief-zone-label`, `-brief-zone-cell`, `-brief-zone-name`, `-brief-zone-number`, `-brief-zone-said`): a named `<ul>` of buttons in the tiles' clothes, a wrapping grid of tracks at least 240px that fill the row (one column under the 360px query), each what In play draws above the zones in small and read-only — a 64px thumbnail beside the name at the title's size, the fields through In play's own tile painter but as pairs, not tiles: a muted `--font-ui-smaller` label over a bold `--font-ui-small` value, no box, fill or column, each as wide as it says and wrapping rather than truncating, in a wrapping row at the closed line's ` · ` gap (a ceilinged number compact as `22/34`, the ceiling muted; a toggle's painted ring; a text field's phrase; each number a form's `=` sets; a field with no value left out, where In play keeps its dash; no stepper, field or control; In play's tiles keep their spacing), and the changes in In play's wording on one muted line clamped to two in the prefixed `-webkit-box` form, the one Chromium draws its ellipsis for, or, where the layout names a table zone for briefs (`briefZone`, `docs/features/stat-block-brief-zone.md`) and the form's table holds a row, that table in the changes line's place: a grid of spans, one track per column as wide as it says (`--sheetsmith-brief-zone-columns`, `justify-content: start`), at the pairs' gap, muted `--font-ui-smaller` labels over `--font-ui-small` cells, the first column bold and a number end-aligned and tabular, every row drawn, nothing truncating, a link as its text, no heading, border or fill, described by a hidden sentence twin — all in spans, since a button holds phrasing content; named by the name and described by the tiles' hidden sentence and the changes line; its bottom edge is a 2px rule in its form's edge colour, never a fill or an outline, and a press is the picker's own write, focus landing on the picker after the rebuild. Under Every form a form's name is the title's size open or closed. The zone order and each built-in's heading are the layout's (`zones`). A record body's edit box grows with its text from a two-line floor (`field-sizing: content`), and under the 360px query an open form's detail drops the record indent. **A companion block, with no `exclusive`, reads at rest and edits behind Edit** (`docs/features/stat-block-companion-face.md`; `-edit`, `-done`, `-line-name`, `-name-read`): every record a line of the list with its stat block read as In play reads it, an empty zone drawn as nothing and a collapsed one closed; the name read text, not a field, at the title's size open or closed, by the `-name-read` class the reading face stamps on the plain cell, in the name field's own rule; an open record's thumbnail at its name's inline start, after the chevron, in a `-line-name` cell of the name's track, and none while closed; no delete, no Active tag and no Add while records exist; and in the foot, where In play's switch sits, one button in the add control's clothes, **Edit <noun>s** (`-edit`). Behind it is Every form's list exactly, every zone drawn and a collapsed one open, with **Done** (`-done`, named *Done editing <noun>s*) and **Add <noun>** in the foot at **Back to play** and **Add form**'s places, and focus passes between Edit and Done where the pressed one held it. Its own named reflow context at 360px, Passport's precedent |
| A form anchored to the control that opened it | `ui/anchored-panel.ts`; `.sheetsmith-panel`, `-body`, `-line`, `-fields`, `-field`, `-why`, `-problem` | Table's `modifier` column, Record set's `modifier` field, a Stat block's modifier field |
| A value read against its ceiling | `.sheetsmith-pool-ceiling`, `-separator`, `-max` | Pool's max, a Record set `number` field whose ceiling the layout declares or the record holds — **one vocabulary**: the value at full contrast, a `/`, and the ceiling muted with tabular figures. A record overrides the size only, since the pool's ceiling qualifies a headline number and a record's a 13px one; where the ceiling is the record's it is a *field* rather than a span, wearing the record's own chrome and this reading. **Where that field holds a formula** (`Uses: 1 / prof`) it is stacked under a layer drawing what the formula came to (`.sheetsmith-record-worked-out`, `-layer`, `-focused`), §9's stacked arrangement: the number at rest in this same reading and box, so it cannot be told from a typed one, the text on focus, the layer taking no press, and `?` in `.sheetsmith-pool-max-unresolved` with a `.sheetsmith-error` line under the record where it cannot be worked out; a typed number draws no stack at all (`docs/features/record-ceiling-formula.md`). **A Track row whose length the character types takes only the ceiling half** (`.sheetsmith-pool-max`, `.sheetsmith-pool-max-input`), narrowed again to its own row-name scale (`.sheetsmith-track-row-length-input`) — there is no value beside it to separate from, since a run's segments are already the reading of the value the way Pool's own numeral is the reading of its own (`docs/features/track-row-length.md`) |
| A number something has been pushed at | `.sheetsmith-modified`; `components/modifier-breakdown.ts`; `.sheetsmith-pool-max-modified` | Card's and Card set's `derived`, Table's computed cell, **and a Track's run** — which takes the *builder* and deliberately not the underline: `text-decoration` draws nothing on a flex row of spans and would fight the slider's own cursor, so a run's mark is the granted segments themselves and the builder's text is what explains them. The two carriers are the card's spelling rather than the cell's — a run is one focusable control, so a `title` and a `.sheetsmith-sr-only` twin it points at with `aria-describedby` hold one string, composed once (`docs/features/modifier-granted-track-segments.md`). **And a Pool's calculated ceiling**, which takes the builder and a mark of its own: a 2px dotted `border-bottom` in `--text-muted` on the numeral after the slash. **Not `.sheetsmith-modified`**, for two reasons: its `cursor: help` promises a press on the number and this numeral has none — the card's router hands it to the nearest field, and the corner door is the one route in — and its plain underline reads as a link, a trade accepted for numbers that have a press and not one to widen to a numeral that has none. **A border works here where it was reverted on Card** because the box is the numeral: the span is a flex item of the `nowrap` ceiling, sized to its digits, so the rule cannot run across a cell — measured equal to the text's own width at the default size and at `text=24`. Dotted rather than a Track's dashed "granted", since a ceiling's mark says moved in either direction. A border's style and width survive forced colors. `?` takes no mark, and a typed ceiling never does (`docs/features/pool-ceiling-modifier-door.md`) |
| A door onto a breakdown, where the number's own press is taken | `.sheetsmith-track-modifier-button`, `.sheetsmith-pool-modifier-button`, `.sheetsmith-pool-has-door`; `ui/popover.ts`'s `showPopover` | Track and Pool. **The third door onto one builder and the first that is not the number itself**: a Card opens its breakdown from the `derived` and a computed cell from the cell, and a Track cannot, because a press on the run sets the value. So the affordance is a glyph-only `<button>` beside the card's name — beside the *label* and not in the run's row, which is the constraint rather than a preference, since everything on that row is a target or something a drag passes over. `<button>` is also what makes Enter and Space arrive as a click, so there is one route in and no second code path. It takes the treatment of the row set's own pickers by selector list rather than by a copy, so three glyph buttons on one card cannot measure differently under one finger, and it takes `--text-muted` on the modifier cell's own measured argument — a faint bolt at this size reads as a smudge. **A fourth figure on a component that already draws three**, and a glyph rather than a fourth box treatment is why it does not collide: a plain square, a granted ring and a blocked slash are three ways of drawing one box. **Pool's calculated ceiling is the fourth door**, and the first in a corner: a Card opens its breakdown from the `derived`, a computed cell from the cell, a Track from a glyph beside its name, and a Pool from a glyph in its top corner, since its numeral has no press of its own either (`docs/features/pool-ceiling-modifier-door.md`). **The corner is the note mark's, and not Track's heading row**: a Track's label is start-aligned, so a label-and-door row costs it nothing, while a Pool is centred like a Card and a heading row would push its label off centre by half the door's width. So the door is out of flow at `--size-2-3` by selector list with `.sheetsmith-card-has-note > .sheetsmith-note-mark`, the card takes `.sheetsmith-pool-has-door` for its `position: relative`, and the label joins the note mark's symmetric reserve and its 200px wrap rule; with the label hidden the door keeps the corner. Its own class rather than Track's, named for what it is about, on every selector list Track's sits on, and a `.sheetsmith-sr-only` twin by `aria-describedby` — the note mark's spelling — because the ceiling span is not focusable and the door is the one control that can carry the account. |
| A ring a modifier set | `components/state-ring.ts`; `.sheetsmith-state-door`, `.sheetsmith-state-slot`, `.sheetsmith-state-cell`, `.sheetsmith-roster-cards-stateful`; `bindRingControl`'s `drawn`, `ownLevel` and `onUnshown`; `stateAccountText` | Table's and Roster's `level` and `toggle` cells on a row with a published name, and a Track's flag (`docs/features/non-number-modifiers.md`). **The ring draws the modified state and a press edits the stored one**, the Card pill's rule on a control with no caret: the paint, `aria-pressed` and the level's name follow the drawn level, and where the note holds another an `aria-description` and the `title`'s second line say `Set by a modifier; your own: Untrained`. **Nothing on screen stands for the stored level**: a second mark was tried beside the ring and then as the door's face, and was withdrawn because it reads as a second toggle that does nothing. The words carry it instead — the ring's and the door's `aria-description`, the ring's `title`, and the account's first line. **A press opens nothing**: one the ring does not plainly show — the drawn level unmoved, or another level than the one set — says `Your own is now Proficient` to the component's live region, and the account's first line is the eye's half. **Its door is the read-only account's `info` glyph, always**: on a Table, after the ring in its cell 2px on, positioned so it stacks over the ring's outward reach and a press on its first pixels is the door's; **on a Roster row, at the row's end**, after the last value, in the note mark's slot — **one door per row**, named for the row (`Modifiers on Stealth`), whose account is every ring the row's modifiers set in column order, then each computed cell's account (its arithmetic and its notes) and any note at a ring's own name, **each part under its column's name as a heading line where the door carries more than one** (`Training`, then `Total`; none on a door of one part), and whose description is the first set ring's `Set by a modifier; your own: Untrained`; the Total keeps its underline and its own press, which opens its formula and its account, so a Total's lines are reached both ways on such a row; a row with no ring a modifier set draws its Total's note mark where it was; the column keeps the slot in every other row's last cell (`reserveNoteSlots`), so the rings, the Totals and the doors each line up down a card; and a Track's own `.sheetsmith-track-modifier-button` beside its label (on each row of a checklist), drawn wherever the address lists a line, applied or not, or is refused; a column holding one keeps an empty slot of the door's box after every other ring in it, so the rings stay in line. **The account opens on the reader's own where it differs from the drawn state** — `Your own: Untrained`, the level's name, its position on an unnamed list, `on` or `off` for a flag — then a blank line and §9's line shape with a position word for the number — `Cat Form — at least Proficient`, `(not applied: already Expertise)` where the level is already there — then a blank line and, where a number has its total, the drawn state alone: `Now Proficient`; a refused state opens on its sentence, which ends with its fix, and has no own line, since a refusal draws what the note stores. **Its lines name their source exactly as a number's account does**: the component wherever the lines come from more than one or the ring is read inside a component with rows, so a Table or Roster ring's lines read `Gear · Cat Form — at least Proficient` and a Track flag's `Cat Form — sets to on`, and one door carrying a ring and a Total spells each modifier one way. A form in play that set the ring tints its row, as for a number (`stampStateHost`). **A note at the cell's own name goes into the door's account**, after a blank line, and the cell draws no note mark of its own: two `info` glyphs side by side would be two doors onto one value's account. **A Roster card strip the layout can set a level or flag in keeps a floor of `max(12rem, calc(120px + 5.75em))`** rather than 12rem, stamped from the layout's definitions (`layoutSetsStateIn`) and never from a drawn door, so the cards keep one width as a form comes and goes: with the door at the row's end, the narrowest such card fits at Text default and, where no note had already reserved the slot, scrolled sideways by 9 and 32px at 20 and 24 (`modifier-states-roster-card`); the floor is under the card's default width and over its need at 20 and 24. A change typed in a note does not stamp it |
| A dropdown a modifier chose | `card-face.ts`'s `CardFaceChoice` and `renderCardDoor`; `.sheetsmith-card-select-chosen`; the door takes `.sheetsmith-state-door` in the note mark's corner (`.sheetsmith-card-has-note`); `components/modifier-breakdown.ts`'s `choiceAccountText`, `choiceOwnDescription`, `choiceOwnNowLine`, `stampChoiceHost` | Card's dropdown (`docs/features/text-value-modifiers.md`). **The menu draws the chosen option at rest and the stored one under a hand**, the Card pill's rule on a menu and not the ring's: a press, a key and focus put the stored choice in the select before the browser opens its menu or moves the value, so the menu (a phone's picker included) opens on the reader's own and a choice writes the reader's own; blur and a choice put the chosen option back. **The mark is the ceiling's 2px dotted rule in `--text-muted` under the select's text, never the underline**, since the menu's press edits — the Pool temp pill's ruling — drawn wherever a Sets line is listed, applied or refused, its 2px handed back by a negative margin so the card holds its height. **Its door is the read-only account's `info` glyph at the label line's end, in the note mark's slot**, named `Modifiers on Size`, opening `Your own: Medium`, a blank line, `Wild Shape · Brown bear — sets to Large`, a blank line and `Now Large` (every line naming its component, as a grant's does); a refusal opens on its sentence with no own line. Where the card's derived was pushed at too, the door's parts are headed `Option` and `Total`, and a note at the card's name joins the account rather than drawing a mark beside the door. The select and the door carry `Set by a modifier; your own: Medium` as an `aria-description` while the two differ, the select's `title` too (after the stray's sentence where the stored value is one), and a choice the menu does not plainly show says `Your own is now Small` to the card's live region. A form in play that chose it tints the card (`choiceLinesIn`). A dropdown nothing chooses for draws exactly what it drew before |
| Temporary points a grant raises | `.sheetsmith-pool-temp-granted`, `.sheetsmith-pool-temp-notice`; `components/modifier-breakdown.ts`'s `bufferAccountText`, `bufferOwnDescription`, `bufferOwnNowSentence` | Pool's temporary points (`docs/features/granted-temporary-points.md`). **The pill draws the effective buffer and takes the ceiling's own mark**, the 2px dotted rule in `--text-muted`, wherever a grant is listed, beaten or not, and never the underline, since the pill's press edits; the rule is drawn inside the field's fixed box out of its bottom padding, and the granted field gives up its reach into the pill's padding — margin, inline padding and width together, so its margin box and the pill keep their width — so the rule runs under the field's own three digits and not into the pill's corner; the pill is the same size and the digit in the same place with a grant on as off, measured. Never `clip-path`, which the directory's browser-support check flags [checked: `styles.test.ts`]. **A deliberate departure from the ceiling's mark**, which is justified by its span being measured equal to the numeral's own width: this one spans the field's three-digit text box, about 24px under a one-digit buffer, and sits at the pill's inner bottom edge. The mark that would size to the digits is a text decoration, which a fixed-width field does draw under its text alone, and it is not available in the spelling this mark needs: dotted, `--text-muted` and 2px are `text-decoration-style`, `-color` and `-thickness`, the longhands, and a shorthand carrying them is flagged the same way, by the browser-support lint Obsidian's directory runs (`sheet.css` at `.sheetsmith-modified` and at the unresolved link). The bare `underline` that passes is the number's underline, which the spec rules out for a pill whose press edits. Sizing the field to its digits instead would make the pill change width as the buffer moves, which the fixed `--sheetsmith-pool-temp-width` exists to refuse; lifting the rule off the edge would cost the pill 2px of height. Dotted against the pill's solid outline is what keeps it from reading as the pill's own border. While a grant is in effect over the reader's own points, the field's `aria-description` and `title` say `Granted by Wild Shape · Brown Bear; your own: 5.` — a description, never a line, for the box-holds-its-size rule. **One door per card**: the corner `info` door Pool already draws for a calculated ceiling opens the buffer's account too, both parts headed `Max` and `Temporary` where it carries both and no heading on a door of one part, with its `.sheetsmith-sr-only` twin; a leftover record alone draws the door and no mark. **The account opens on `Your own: 5` where a grant is in effect and closes on `Now 7`**, a grant per line in walk order (`grants 10, 7 left`, its verdict in parentheses), every line naming its component because the component is half of the record's key, then `Not granting now: Gear · Old ring, 4 spent` per leftover; a refused buffer opens on its sentence. **A value typed below a grant still in effect** is written as the reader's own and the pill goes on drawing the grant, so `HP temporary 10, granted by Wild Shape · Brown Bear; your own is now 3.` is shown in the refused draft's slot and shape (`markTemp`), muted with the leading rule in the border colour and no `aria-invalid`, and spoken; it stands across the rebuild its write starts, held by the view per note (`RenderContext.heldNotice`), and goes on the pill's next edit. A form in play whose grant is the buffer drawn tints the card (`bufferLinesIn`) |
| A segment a modifier granted | `.sheetsmith-track-segment-granted` and its `::after` | Track's run, at the far end of it. **Two geometric channels and no colour**, which is §1 and the forced-colors rule rather than a preference: a dash and a wider gap at the join both survive `forced-colors: active`, where that mode strips author border and background *colours* and forces `box-shadow` to none. The convergent prior art separates a raised ceiling by fill colour alone over one flat outline, which is WCAG 1.4.1 failure technique F13. **The dash is an overlay and not a border, and the box model is why**: a segment's fill is an absolutely positioned child occupying the padding box, so a dashed *border*'s gaps show the card rather than the fill and a filled segment drew with nibbles bitten out of its edges — 2.12:1 against the card and 1.49:1 against the fill, measured at 15px. A positioned `::after` paints after its element's other positioned children, so the ring lands on the fill and its gaps show accent. An `outline` outside the box is the other obvious answer and overlaps between two consecutive granted segments. **The segment's border width becomes padding**, which is the whole of how the ring paints at the base segment's own footprint: a positioned child is laid out against the *padding* box and `overflow: hidden` clips to it, so moving 1.5px from border to padding grows that box to the whole square without moving the square. Holding the border `transparent` instead was the first answer and drew 13px inside a 15px box — layout identical, picture not, with the join reading 9 against 8. It also leaves nothing for forced colors to repaint into a second ring, so the overlay is the mark in every mode. `--text-muted` because a ring on a different element inherits no base rule and a border that alone marks a state clears 3:1. **Filled and empty are two different-looking marks**, not one seen twice: the ring measures 1.95:1 over the accent, so a filled granted segment reads as ringed and an empty one as dashed. **In forced colors** the fill is `SelectedItem` and the ring over a wholly lit segment `SelectedItemText`, since the mode's `CanvasText` on that fill measures 1.49:1: a dark dashed edge on a lit square, a light one on an unlit square, and a light one on a partly lit multi-mark segment, where a dark ring would vanish over the unlit half (`docs/features/forced-colors-track-and-table.md`) |
| A slot a modifier took away | `.sheetsmith-track-segment-blocked`'s `::after` | Track's run, at the far end, drawn where it has always been. **Present and unusable, which is not a ghost**: a ghost faintly shows what is *not* there and puts a second ceiling on screen, where this is a first-class state a reader can count — the convergent prior art asks for it outright (foundryvtt-lancer 548 wants "a slash through the icon" on a spent pip). **A third state on one row, so the figure changes rather than the line style**: solid against dashed against dotted at 15px is one mark a reader can name and two they cannot, and a slash reads against both a base square and a granted ring. A rotated `border-top`, because forced colors strips a background and recolours a border; the bar is longer than the box and the segment's own `overflow: hidden` clips it to a clean corner-to-corner diagonal. **It is not a target and nothing refuses a press**: the hit test is handed the live segments' rectangles only, so an empty blocked slot is not a position the control has. A blocked slot that still holds a mark is the row below. **In forced colors** the slash over a lit segment is two-toned, a `SelectedItemText` stroke above a `CanvasText` one, so a partly lit segment shows it across the fill and the card alike; unlit it is `CanvasText` (`docs/features/forced-colors-track-and-table.md`) |
| A segment past the live run that holds marks | `.sheetsmith-track-segment-over`, sharing `.sheetsmith-track-segment-blocked::after` by selector list; `.sheetsmith-track-over-count` past `MAX_SEGMENTS` | Track's run, after the live segments — a count lowered, a formula resolving lower, a grant removed, a penalty over held marks, a character's row shortened, all one state. **The blocked slash on the existing fill, and not a fourth figure**: a slot past what the run can take is one figure whatever put it there, and the fill is the one difference, as it is between a lit and an unlit base segment — the owner's condition for drawing it at all. It is in the hit test, so a reader steps down through it and nothing steps up past the stored value; `aria-valuemax` is the stored value and `aria-valuetext` says the rest, `5 of 3, 2 over`. Past `MAX_SEGMENTS` it is one box holding its count in marks, `+147`, with no slash across the digits (`docs/features/track-stored-value-past-shortened-run.md`) |
| A control that is nothing but a glyph | `.sheetsmith-table-modifier-cell`, `-glyph`, `-button`; `.sheetsmith-record-modifier`, `-glyph` | Table's `modifier` column, Record set's `modifier` field |
| A value a modifier has noted | `components/note-mark.ts`; `.sheetsmith-note-mark`, `.sheetsmith-card-has-note`, `.sheetsmith-table-has-note` | Card (through `card-face.ts`), Table's published cells and column totals, Roster's published cells, band heads and stat cards (`docs/features/modifier-notes.md`). **A glyph-only `<button>` beside the value, drawn only where a note is listed, and deliberately distinct from the arithmetic mark**: the underline says a number moved, and this says words were left at it — a note moves no number, so a note-only value has the glyph and no underline. A tab stop, unlike the underline, at one stop per noted value, so the words reach a keyboard reader; its name is the count (`1 note`) and its `aria-describedby` a `.sheetsmith-sr-only` twin holding the whole account, the Track door's spelling. A press opens the shared popover with the same text the number's own press opens, so where a value has both marks they open one account. It takes the Track door's treatment by selector list. On a card it is out of flow at the label line's inline end, so it cannot move the number off centre, and **with `hideLabel` it keeps that corner** — the number's line is a full-width field, which the glyph could only overlap or narrow. In a cell it follows the number or the control, and **after a level ring the gap is the ring's reach**, `--size-4-2`, because the ring's expanded target reaches 8px sideways and the mark cannot grow over it — and no wider, since a margin on top overflowed a Saves card at the threshold width. **A noted column reserves the mark's slot in every value or ring cell** (and noted bands in every band head), so a centred value lines up with the noted one; the render marks the column (`reserveNoteSlots`), a field cell reserves nothing, and a table with no note is untouched. After a number the glyph is centred on the digits' cap height (`@supports (top: 1cap)`; without `cap` about 1.4px low, an unmeasured estimate, since the harness cannot render a WebKit lacking it). **The corner mark sits one step in (`--size-2-3`)** so its focus ring clears the card's border, and **below a 200px card the label drops its start-side reserve and wraps** rather than truncating, giving up its centre: "Passive perception" needs 181.4px with both reserves, which a 200px card holds. Accepted as built at the land stop: under the query every noted card's label is off centre, Initiative's included. **So a field column's total sits off its inputs by the slot**, the Saves foot `3` about 11px left of the Bonus inputs' centre, and that is accepted: reserving after the fields pushed Saves to 257px in a 237px box at 520, an overflow against an offset in a foot row, while the inputs already line up with each other by their own fixed width |
| Which glyph a modifier surface takes | `zap` / `zap-off` against `info` | **`zap` is the modifier-*authoring* glyph and `info` is the read-only account of what reaches a value — its arithmetic, its notes, or both.** Every bolt on a sheet opens something a reader can change — a modifier cell's picker, the form behind it — while a Track's breakdown button, a Pool's ceiling door and the note mark open something they can only read, so all three take `info`. **The note mark was `sticky-note` until the modifier-notes land stop, and that was reversed on sight**: beside a Card's own editable note line it read as *that card's* note, and a sticky note suggests something you write in. The note mark stays distinct from the arithmetic mark on Card, Table and Roster, because the arithmetic mark is the underline and not a glyph. Written down because the choice was made twice without being: the bolt is the better *association*, since a reader learns "what is affecting this" from the modifier column three cards up the same screen, and it is the worse *affordance*, since it teaches a press that edits. A third consumer picks a side from this row rather than from whichever surface it happened to read first |
| A disclosure that opens a block in place | `.sheetsmith-record-disclosure`, `.sheetsmith-record-body` | Record set's records, **and the layout editor's tree** (`.sheetsmith-tree-disclosure`): the same `chevron-down` / `chevron-right` pair, `aria-expanded` and `aria-controls` (left off an open empty container, which draws no region to name), a label that changes with the state (**Collapse "Weapons"** / **Expand "Weapons"**) and `--text-muted` for the same measured reason. What differs is the body: a shut container's children are not rendered at all rather than `hidden="until-found"`, since the tree is not find-in-page content and the tree opens the ancestors of whatever is selected (`docs/features/layout-editor-tree.md` §3). **A Record set's group header borrows it**: the same chevron pair, muted, on an `h3` holding one `<button>` whose name is the group's name alone, with the count outside the name and attached by `aria-describedby`; one press route on the heading row, a band that is a 60% mix of `--background-modifier-hover` and a semibold name, and a group drawn as one outlined block (`docs/features/record-set-groups.md`) |
| A tree's nesting | `editor/tree.ts`; `.sheetsmith-tree-children`, `.sheetsmith-tree-slot` | the layout editor's tree. **The card steps in, not its text**: a container's rows render into a `role="group"` wrapper named `Inside <container>`, indented as a whole, and the wrapper's own `border-inline-start` is the guide, so it runs the full height of what the container holds, gaps included, and two containers deep draws two. Placed under the centre of the container's chevron. A border rather than a background, so forced colors repaints it. The slot before every component row's name holds the chevron or an empty spacer of its width, so names at one depth share a column (`docs/features/layout-editor-tree.md` §2) |
| A record's summary line | `.sheetsmith-record`, `-summary`, `-name`, `-fields`, `-field` | Record set. **On a headed list wide enough for the strip the fields sit on column tracks shared across every record** — the list is one grid and each record, summary and fields wrapper a subgrid of it, so a heading centres over its field whatever the records hold — and below the threshold the line is the one it always was (`docs/features/record-set-heading-strip.md`). **A field placed in the body is not on this line at all**: it draws in `.sheetsmith-record-body-fields`, a wrapping flex block that is the opened body's first child, with no track and no heading, and the body gains `-has-fields` and a second grid row only when it holds one (`docs/features/record-set-body-fields.md`). **Under a group header the line is unchanged**: the group body is a subgrid of the same tracks, so the fields line up across groups and under the one strip. **The line stacks — name and delete on a row, the fields under the name — below the width its own declared fields fit at, not at one number** [judgement]: 320px was derived for a name, a labelled number, a ring and a glyph, and at containers of 338, 346 and 361px every multi-field list wrapped its fields inside their own track. So the component estimates the fit from its declared summary fields (`components/record-line-fit.ts`: each field's kind, and its name or longest option by character count at a cautious width per character), stamps it rounded up to a step of 16px as `.sheetsmith-record-set-fit-N`, and `sheet.css` tabulates one threshold per step (§4), N × 16px, in px because every width on the line is a fixed-px token and the sheet's `em` is not (it is `--font-ui-medium` in Obsidian). A line is stacked at most 2em (32px) past its measured fit, 20px at worst in the harness, and is never drawn unstacked short of it; a field name or option of unusually wide letters can still outrun the estimate. **On mobile the estimate does not follow the app's text size** [judgement]: Obsidian sets `body` to 16px there, so the line's `--font-ui-small` is 15px against the 13px every constant was measured at, and a line is drawn plain up to 42.5px short of its fit (Recharging features, stamped 592 against a fit of 634.5 at a 390 phone, `docs/features/phone-input-width.md`). The name gives, as below, to no less than 53.5px, and the fields stay in their box. Following it costs either a tier table in an `em` the line's token sets, which scales the fixed-px chrome as well and stacks the measured lists up to about 48px early, or a mobile factor in `record-line-fit.ts` that no instrument here can measure, since the stub sets no `.is-mobile`. It reopens if a mobile shortfall reaches the 96px name floor, where the fields would leave the box. **The plain line's fields take their width before the name grows** [judgement]: the fields' track is `max-content`, so the name gets only what is left, up to its cap, and a line fits where its name reaches six ems beside its fields, `192 + F`, a plain sum and up to 73px narrower than when the two tracks grew together. The rule is gated on a style query, so an engine without one keeps the old `auto` track and its line wraps exactly as before; the strip keeps its own `repeat(N, auto)` tracks, unchanged. **The strip's thresholds are px for the tiers' reason, and under it a name caps where the plain line's does** [judgement]: `232px + 96px × N`, the widths it was measured at, where the `em` it was written in drew it at 15/16 of them in the app; and the list declares `--font-ui-small` and every record inherits it, since the name's `13em` resolves where it is used and on the list it came to 208px against the plain line's 169 (`harness/measure-groups.mjs` checks 7e and 7f). **The tiers' mobile ruling above governs the strip too**: its widths were measured at a 13px `--font-ui-small` and a phone draws 15px, so scaling the measured fits by 15/13 puts the strip in before its widest fields fit from two fields up, by 5px at two and up to 64px at eight (922 × 15/13 against 1000). That is arithmetic, not a measurement, and it reopens on the tiers' condition. Where an estimate runs short the name is what gives: it clips with an ellipsis and reveals itself on hover (`ui/truncation.ts`), and never overlaps its fields (`docs/features/record-summary-fields-first.md`). **Outside the strip and the group headers, records in one list may start their fields at different offsets** [judgement]: each record's line is its own grid, so a record with fewer fields gives its name more room, and nothing lines one record's fields up with the next. **A headed list draws its plain line below its strip** wherever it fits there: plain, stacked or under its strip, one at a time. **Stacked is the narrowest layout, and below it the fields wrap** [judgement]: under about the fields' own width plus 47px (measured 46.3 to 46.8 on every harness list) a stacked line's fields flow onto a second row under the name, as the wrapping flex row they are, and there is no third layout of one field per row. On a two-field line the wrap already is one field per row, and on a longer one it takes fewer rows than one per row would (Traits' five), which would have cost a second tabulated threshold (`docs/features/record-set-stacking-tiers.md`) |
| A word a player types to name a group | `.sheetsmith-record-input.sheetsmith-record-input-text`; `RenderContext.suggestText`; `ui/arm-on-typing.ts` | Record set's `text` field, legal only as the field Group by names (`docs/features/free-text-group-key.md`). **The number field's clothes, so it takes the shared hover and focus lists with no new selector**, plus one width rule: at most 14ch and compressible to 5ch (`width: 100%` is what lets an input shrink in a flex cell), left-aligned because a name reads from its first letter, `—` as its empty state in both placements, spellcheck off. **A list with a text field on its summary line stacks sooner**: the line's fit tier sizes the text field at its 14ch and its name by character count, so a text field and a counter fit from 448.5px and are stacked up to 464px (`docs/features/record-set-stacking-tiers.md`, and `docs/features/record-summary-fields-first.md`, which brought it down from 519 and 528; the 480px and 420px rules that first did this are gone); measured at 321px before this, the fields took 186px and the name was left 40px. **A text column's strip heading starts over its first letter** (`.sheetsmith-record-strip-text`), where a number's is centred on its ink. **The type-ahead is Obsidian's own popup**, opened on typing and never on focus alone, which `ui/arm-on-typing.ts` holds for this field and the formula inputs both; the canvas and the harness pass no `suggestText`, so the popup is looked at in Obsidian only. A group header's name is one clipped line revealed whole on hover, `ui/truncation.ts`'s own rule, so a 90-character name moves nothing |
| A field its condition hid | the `hidden` attribute on `.sheetsmith-record-field` and `.sheetsmith-record-body-fields`, answered by one `[hidden]` rule; `--sheetsmith-record-track` | Record set (`docs/features/conditional-field-visibility.md`). **Hidden in place, not removed**: the element stays so every control's index in the cell — what the view restores focus by — is the same whatever the conditions say, and `hidden` takes it out of layout, the accessibility tree, the tab order and find-in-page together, so no `aria-hidden` and no `visibility`, which would reserve its space. Plain `hidden`, never `until-found`. The rule exists because an author `display` beats the user-agent one, and `styles.test.ts` holds every such `display` to an answer. **Space is reserved exactly where alignment exists**: an unheaded line closes up, while on a headed list's wide regime every summary field is placed in its own track by number from `--sheetsmith-record-track`, so a field after a hidden one stays under its heading and a heading may sit over a column empty on every record. A body block whose every field is hidden is hidden too, and the prose takes its row |
| A picture in a box, and every reason there is none | `components/picture-frame.ts`; `.sheetsmith-image-frame`, `.sheetsmith-image-picture`, `.sheetsmith-image-input` | Image, Passport. **The classes are spelled `sheetsmith-image-*` and are passed *into* the painter**, `linked-text.ts`'s own arrangement, because a module beside the components must not know that an image exists — so this row is the only record that the two agree on them, and without it the agreement lives in a comment, which is how `.sheetsmith-component-label` bred to six copies. The painter draws the frame, the field stacked over it, the press that hands the field over with its text selected, and all four failure states; what a caller keeps is the box and the chrome around it, which is the one thing the two do not share |
| A tag | Obsidian's `--tag-background`, `--tag-border-color`, `--tag-padding-x`/`-y`, `--tag-weight`, `--tag-decoration` and the `-hover` variants | a Passport's identity values, `.sheetsmith-passport-input` — one control reused once per part rather than once per field, so a list field's own several parts and a scalar field's one value are the same surface rather than a second one grown for the list (`docs/features/passport-field-lists.md`). **Three members of the host's set are deliberately not taken**, each for a measured reason: `--tag-size` is `em`-relative and resolves against a card rather than the sheet's field rank, so it would draw 14px where a cell draws 13px; `--tag-color` measures 3.56:1 on the tag surface over a card against §3's 4.5:1, *and* accent text on a sheet already means **link**, since every anchor `linked-text.ts` paints takes the bare `a` colour; and `--tag-radius` is a full pill, which appeared once in this stylesheet against twenty uses of `--radius-s` — a shape existing nowhere else is the second quiet style §5 forbids. So the corner is `--radius-s`, which is what every *field* takes where `--radius-m` is what every *container* takes. What is borrowed is the tag's surface; the type, the colour and the corner are the plugin's |
| A headline that is also a field | `.sheetsmith-passport-name-input` | a Passport's name. Chromeless at rest so it reads as the headline, revealed by the shared hover and focus lists above, with the empty state as a `::placeholder` at the same size and `--text-faint`. **It carries `-input` in its name deliberately**: that puts it inside `styles.test.ts`'s own `FIELD_CLASS` pattern, so the view scope and the accent focus are both checked without anyone remembering a list — and the scope is not decoration. While the rank sat on a bare class at (0,1,0) it lost its `font-size` to Obsidian's `input[type='text']` at (0,1,1) and a 28px headline drew at **13px**, on the one control whose entire job is to be the largest thing on the card. No gate reported it; a shot did |
| A leaf that is its own reflow context | `container-type` and `container-name` on the component's own block | a Passport. **New vocabulary, and one condition where §4 gives an inner grid two.** §4's two exist because neither derives from the other — once the sheet is one column a two-column container is *wider* than it was — and a leaf's own width separates them, because what decides whether a picture fits beside a name is exactly how much room the face has, and the face has less of it in both cases. Keyed on the sheet alone, a one-column passport on a 1400px sheet never reflowed and drew its picture across the whole card with the name squeezed to nothing. The `container-type` goes on the **block** rather than the face, since a query cannot restyle the element that is itself the container, and it is **named** for `.sheetsmith-view`'s reason one level down: the card inside already establishes an unnamed container, so an unnamed query here would resolve against whichever container happened to be nearest each selector's subject |
| An inline disclosure with a pinned action bar | `editor/component-picker.ts`; `.sheetsmith-picker`, `-search`, `-list`, `-group`, `-option`, `-entry`, `-name`, `-description`, `-preview`, `-example`, `-empty`, `-bar`, `-controls`, `-status` | the layout editor's component picker. **A block in the pane's own flow, not a floating surface**: clothed like the list fields (`.sheetsmith-entry-list`'s border, radius and secondary surface), directly under the row that opens it, so it is not a fifth kind of panel and uses none of `ui/anchored-panel.ts`. What is new is the bar: `position: sticky; bottom: 0` against whichever box scrolls the pane, so **Add** stays in reach while the list runs past the viewport and sits at the picker's foot once its end is on screen. The active line draws one inert preview of itself through the canvas's own render path, and an **Example** tag in the flair's quiet type where the drawing is not what **Add** writes (`docs/features/component-picker.md`) |

**A field with no chrome of its own takes one focus treatment, declared once**
[checked: `styles.test.ts`]. An accent border, the page background, and a
transparent `outline` as the forced-colors escape hatch — four declarations, and
five fields across three components had them written out identically before the
list above existed. §11's own measured threshold for a duplicated rule body is
four declarations and §1 stops arguing at five consumers, so this was past both.
**A selector list rather than a class**, because nothing in any component has to
change for it and the classes already name themselves: the list *is* the roster,
so a sixth field is one line rather than a fifth copy. The card's and the pool's
focus is deliberately not on it — those paint a `box-shadow` ring around a pill
that has its own surface, which is a different treatment for a
differently-shaped control.

**A ceiling is Pool's reading wherever it appears, and a component that grows one
borrows the classes rather than spelling them again** [judgement]. A Record set's
`number` field is the second consumer: `Uses 1` cannot say whether that is all of
them or one of three, so a bounded field reads `Uses 1 / 3`. It overrides exactly one
declaration, the size, because the shared `--font-ui-medium` would draw a 13px
value's ceiling larger than the value. **A `.sheetsmith-record-ceiling` beside the
pool's is what this section opens by forbidding**, and the borrowing is this
section's own rule rather than an exception to it: the name belongs to the component
that is nothing but the thing, and a Pool is a value over its ceiling, exactly as a
card owns the abbreviation a record's field name wears.

**And it takes whichever of Pool's two branches the layout asked for, which is the
clause added rather than a second row.** Where the ceiling is the *field's* — a
literal the layout declared, `maxSource` absent — it is Pool's read-only branch: a
span, no second field, no placeholder. A bare span is `role=generic`, which prohibits
naming, so what carries it to a screen reader is the field's own announcement, "5 of
9", which is how the slash is read aloud. Where the ceiling is the *record's*
(`maxSource: 'record'`) it is Pool's editable branch, drawn on every record whether
or not one is set, with Pool's own `—` placeholder — which is also the only
invitation to type — and, being an input rather than a span, a name of its own beside
the announcement rather than instead of it.

**`.sheetsmith-pool-max-input` is the one class deliberately *not* borrowed, and
that is this section's rule rather than an exception to it.** It is the pool
*card's* field chrome: chromeless, sized in `ch` against the card's value size, with
a hover background and a focus ring of its own. A record's number field already has
chrome, and two fields on one summary line answering a hover two different ways is
exactly the lookalike this section forbids — only here the lookalike would be the
pool's treatment sitting beside the record's. So the editable ceiling wears
`.sheetsmith-record-input` **and** `.sheetsmith-pool-max`: the record's chrome, the
pool's reading. What that costs is one rule putting back the muted colour, a box two
digits wide rather than three, and **no horizontal padding** — which is the
declaration the ruling turns on. A design review measured `Uses 1 / 3` putting 7px
between the slash and its digit where `Level 3 /9` beside it puts 2px, and that 7px
is exactly 2px of the ceiling's own flex gap, which the span pays too, plus 1px of
border and 4px of padding, which only a field pays. Dropping the padding leaves 3px
against the span's 2px. **A field padded like a field cannot read as a span, and
that is the general form**: where a control borrows a reading, the padding is what
gives it away first.

**The box is fixed rather than content-sized**, and the reversal is worth recording
because `field-sizing: content` is the obvious reach and is wrong here. It closes
some of the gap, but the field then grows when a ceiling reaches two digits — so
stepping one from 9 to 10 moves that record's toggles, its computed value and its
modifier glyph 8px right while the reader's finger is on the arrow key. §11 asks
that numbers hold still while they are stepped, and one summary line must not carry
one fixed number field and one elastic one. Left-aligning a two-digit box answers
the gap without buying the movement.

**A Pool's value field is fixed at `4ch` wherever it fits, and elastic from `2ch`
only below its container threshold** [judgement]. That is not a departure from
the ruling above, which is about fields on a summary line and stands as it is.
Below `calc(4.6em + 44px)` of card, a narrow cell has no room for the four-character
slot beside a ceiling, so the slot drops to two and grows with its digits
(`docs/features/pool-headline-narrow-fit.md`). `9 → 10` still moves nothing,
but `99 → 100` widens the number by a digit and can wrap the ceiling onto a
second line, which grows the card. That movement at a stepped digit-count
boundary is the accepted cost of fitting a narrow card: the only box that
holds still there is the `4ch` floor the narrow rule exists to lift. Also
accepted: below the threshold the gap between the number and its ceiling
varies with the number's digit count, about 14px for one digit and about 4px
for three, because the field sizes to its content, and the ceiling's muted
colour is what carries the grouping.

**A disclosure opens a block in place, pushing its siblings inside a box that
does not grow** [judgement]. Record set is the first of these and the rules are
the box's rather than the control's. The prior art picks the direction: the
closest analogue's report is that expanded content "overlaps the +Add and Modify
controls… and/or is buried under the z-order of subsequent repeating items",
written by somebody who wanted the list to drop down instead. **The push is only
safe because the component's box is the placement**: SPEC §8 forbids a component
ceasing to fill its placement and this section's own rule forbids a box sized by
its content, and neither is reached — the box is `--sheetsmith-rows` ×
`--sheetsmith-grid-row` tall whatever is open, the list scrolls inside it, and
opening a record moves the records below it *within the scrollport*. A body
inside that scrollport may be as tall as it is, which is not a violation of the
same rule: that rule is about the *component's* box. **The three surfaces this is
not** are each closed rather than merely unchosen — a modal is unavailable, since
`ConfirmModal` takes an `App` and `RenderContext` carries no route to one; a
drawer is refused on this section's opening sentence, and §12 already records
`ui/anchored-panel.ts` as the largest thing this plugin draws, for which a body
of prose is the worst possible content; and a second editor pane is what SPEC
§4.2 rejected on principle for Rich text.

**What answers the press is the chevron, not the row** [judgement]. A record's
name is a field — it edits on the shared rules and its wikilinks are live — so a
press on the row cannot mean both "put a caret here" and "open this", which is
the two-jobs-on-one-control defect the modifier cell was corrected for. So the
chevron is a glyph-only `<button>` on this section's own rule, with Obsidian's
button chrome stripped, carrying `aria-expanded` and `aria-controls`, opening on
a press and on Enter or Space alike, and taking the level ring's size token so it
measures the same as the marks in the same line under the same finger. **A closed
body is `hidden="until-found"`**, so find-in-page reaches it and a `beforematch`
listener agrees it is open — the one thing Tab set had to give up, available here
because a body contributing no height changes nothing. **Nothing is open on first
render**: a tab set opens its first tab because a tab set showing nothing is a
hole, and a record set showing every name and no body is showing its reading.

**The glyph button now has three consumers and no shared class**, which is the
same position the delete glyph's row records: what they agree on is
`--sheetsmith-inline-control`, the ring's own measurement, so a chevron, a bolt
and a trash in one line cannot measure differently under one finger. The rest —
the resting colour, the hover surface, which state stands down for which — is
each control's own. This table gains a class when the *treatment* is shared
rather than only the number.

**A field holding a list of lines reports its problems under itself, and the
class is named for the field** [judgement]. Three fields in the layout editor
hold a list one-per-line, and all three draw the same inline report: a row per
problem, a quiet locator span where there is one to give, and a count line that
is the only confirmation a working list gets. The classes were
`.sheetsmith-function-problem*` while the function library was the only consumer,
and the third arrival put a class called `function` on a bonus-types field —
which is the name-a-reader-would-believe correction this section already records
for the level ring. **What is deliberately not shared is the field itself**: the
three modules are near copies, and the parts that vary — the layout key, the
parse call's input and result shapes, the problem row's children, the count
sentence, whether a commit redraws — outnumber the skeleton, so one module over
them would be a form-description language. What *is* shared is the two policies
underneath: the class above, and `editor/field-lines.ts`, which names what a line
is (trimmed at both ends for an identifier the file matches on, at the end only
for a line of code).

**A control whose only face is a glyph is a `<button>`, and Obsidian's own button
chrome comes off it** [judgement]. A modifier cell is the first of these: it draws
as one glyph, because a word above it several times its width sets the column's
width against a control that needs none of it, and it manages a *set* — several
modifiers, each with something to say about what it is doing.

**It was a transparent `<select>` stacked over the glyph, and the control kind is
the correction.** A native `<select>` is the right control for choosing one thing
from a closed list and has no shape for "several of these, and here is what each
is doing"; with the popup below carrying that, the select goes and so does the
`opacity: 0` stacking, the `showPicker()` call and the focus ring drawn on a *box*
around an invisible half. What the button costs is one line of CSS discipline and
no new vocabulary: Obsidian styles bare `button` with a background, a radius, a
padding and a shadow, so the rule strips them scoped under `.sheetsmith-view`,
which is §2's own argument read on a new control kind and
`.sheetsmith-table-remove-button`'s own reset copied one column across. The button
takes the level ring's own size token, so a glyph and a ring in the next column
measure the same under the same finger and grow together under a coarse pointer;
the focus ring is on the button, as an `outline`, because that is the one mark
that survives forced-colors mode where a `box-shadow` is discarded — and because
the reset removes `box-shadow`, which is where Obsidian's own ring lives.

**One glyph per row, and the glyph is about the row** [judgement]. A cell holds
every modifier its row applies, so a row may have one applying and another not:
`zap` where any applies, `zap-off` where none does, and a faint `plus` where the
cell is empty. Deliberately **not** a fourth shape for "some" — a partial-state
glyph is a mark most readers meet once and could not name — and deliberately not
one glyph per modifier, which is two answers to one question (below) in the
smallest space available. The count is words: the accessible name says
`2 applying, 1 changing nothing` and the `title` marks the line that is not
applying. The `plus` is at `--text-faint` and steps to `--text-muted` on row hover
and on focus, which is the delete control's own treatment, on the argument that an
empty cell's *state* is the absence of a bolt while the `plus` is an affordance
for the press.

**Its state has exactly one visual channel — the shape — plus the accessible name
for a reader who cannot see it, and the colour is a legibility floor rather than a
channel.** This paragraph said "three channels" and the honest count is one: `zap`
and `zap-off` are now the *same* colour, because a class that was written to dim
the non-applying one declared a value byte-identical to the base rule it was
overriding and therefore never painted anything. So the visual distinction rests
on shape alone. That is legitimate — §1 forbids *colour* alone rather than shape
alone, and the forced-colors shot is the evidence, since that mode repaints the
page in one system palette and the pair survives it — but a rule that counts its
channels wrongly is a rule that will be trusted about the wrong one, so: one
visual channel, and the accessible name carrying it in words on the level ring's
own `${column}: ${state}` shape.

**What the colour still owes is legibility, and that measurement stands.** The
value is `--text-muted`. It was `--text-faint`, on the argument that a different
glyph already carries the fact — and that argument does not survive being looked
at. Measured off the shots, faint is **2.20:1** light and **2.74:1** dark, under
the 3:1 a state mark has to clear and well under the 4.5:1 `legibility.md` §3 asks
of a meaningful glyph; **at 16px the `zap-off` slash is three short strokes, so at
that ratio the whole mark reads as a grey smudge.** The one channel there is is
only a channel while it can be seen, so dimming the shape was subtraction rather
than reinforcement. Muted measures 6.41 and 7.50, and the step is unconditional
rather than behind `prefers-contrast: more`, which no shot could render when this
was decided (the `sheet-contrast-more` views emulate it now). Deliberately not `--text-error`: the value resolved perfectly
well and is exactly what the note says, so §4.2's "rendered, not corrected"
governs.

**And this control has one gesture, which is the simplification the panel made
available** [judgement]. It had two, because it had two jobs on one control: a
press opened the picker and a press-and-hold opened the explanation in the shared
popover, through a `claimTouchPress` option added to `bindLongPress` for the one
thing a native `<select>` needs that a level ring does not — the browser opens a
picker on the press itself, so the bubble would open underneath it. The form now
carries the explanation, so there is one job and one gesture: a press opens it, on
a pointer and under a finger alike, and Enter or Space opens it from the keyboard.
`bindLongPress` is back to the two-argument helper the level ring and Track use,
and no modifier cell binds a long press at all.

**A `title` still carries what the row is doing for a pointer, and that is not a
duplicate.** The split is: hover to read, press to change. A reader scanning an
inventory wants to know what row 7 does without pressing anything, and §7's "never
a hover-only affordance" is satisfied because the press works for everyone — the
`title` is the zero-press shortcut a pointer happens to have.

**A form on a cell is this plugin's own anchored panel, and it is the shared
popover's *kind* grown a body** [judgement]. Not a fourth kind of panel: the first
line of this section is about a panel in the page's own flow, sitting beside a row
of cards and reading as chrome, and a transient surface anchored to the control
that opened it, one at a time, dismissed by the next thing the reader does, is
`.sheetsmith-popover`'s kind. So `ui/anchored-panel.ts` extends that regime rather
than inventing a second floating one, and **the placement arithmetic is shared with
`showPopover` rather than copied** — "clamped into the viewport" is one policy, and
two copies of it drifting apart is a visible bug at the one edge nobody
photographs.

**The three cheaper options are closed, and saying which is what stops the next
reader reaching for one.** Obsidian's `Menu` closes on selection and `MenuItem`
takes a title, an icon and a click, so it hosts no controls at all — a target
select, an operator, an amount, a bonus type and a condition cannot live in one. A
`Modal` needs an `App` and `SPEC` §4.2 records that `RenderContext` carries no route
to one. And `showPopover` sets `textContent`, so a bubble admits no per-line styling
and no controls.

**What the panel owes is the four things `Menu` gave free**, and each is a place a
plugin gets a floating surface subtly wrong: placement and clamping, bought back by
sharing the popover's; dismissal on a press outside and on Escape, the popover's
regime with **one departure — a scroll repositions rather than dismissing**, because
a bubble is a thing you read while a form is a thing you are filling in and a table
scrolls inside its own overflow box under the smallest wheel gesture; keyboard
navigation and focus management, **owed** — it carries `role="dialog"` with an
`aria-label` naming the row, focus moves to its first control on open — whatever
the body draws first, and an offered list is drawn before a form, so a Track's
**Add** lands on its first declared row while one is left and in **Name** once
none is: the list is the panel's primary offer, one press for the layout's own
suggestion, and the form the fallback — Tab cycles
within it, and Escape closes it and returns focus to the control, which is the
platform's own contract for a dialog and what makes `aria-haspopup="dialog"` true
rather than decorative; and a phone regime, **seen at a true 380**
(`sheet-modifier-form-viewport-380`, `sheet-modifier-form-three-parts-viewport-380`).
There the `100vw` cap bites at 348px, and **the clamp's gutter is the cap's**,
16px a side (`popover.ts`'s `EDGE_GUTTER`), so a capped panel is centred and sits
on the sheet's own column. It was the 8px anchor gap, which pushed the panel to
24px from one edge and 8 from the other; the bubble shared the arithmetic and the
fault. The ordinary form wraps nothing at 348, and **it fits its cap at every
width only since the fifth rulings pass raised the cap to 570px**: `shared.css` measured the
mixed row's form at 479 before **Note** and **Only when** joined it, and it had
reached 547 against a 498px body, so the promote row was cut and **Add a
modifier** was off the end of the panel at 1400 as at 380. The box's own
`scrollHeight` read 498 throughout, since the scroll is on the body; measure the
body.

**A row with three parts and one open scrolls inside the panel, and that is
accepted** [judgement]. Two closed lines with their reasons over the typed part's
fields measure 625px against the body's 568, so 57px scroll: the cut falls across
the promote row, under **Remove**, and the box's edge stays drawn because the
scroll is on the body one element in. It is not a scroll inside the table's: the
panel is a fixed surface on `document.body`, so the table scrolling sideways under
it is a second scroller beside it, and the table's scroll repositions the panel on
its anchor rather than nesting one scroller in the other. No cap fits every row,
since each part adds a line: 570 is the tallest ordinary state with headroom, a
row past it scrolls, and the `100vh` term holds a short phone to its own height.

**The panel is bounded by the window, not by the pane that opened it, so in a
narrow pane it overhangs the sheet, and that is the ruling** [judgement; seen in
`sheet-modifier-form-narrow`, and pinned by `anchored-panel.test.ts`]. A 380 pane
in a 520 window draws it at its full 390, from 105 to 495 against a sheet ending
at 449. Three reasons, in order of weight. It is app chrome hung off
`document.body` (§4), and the app's own floating surfaces — `Menu`, a hover
preview, the suggester — are bounded by the window and open over whatever is
beside the pane they came from; a plugin surface that alone stayed inside its
pane would be the inconsistency. It is on the body in the first place to escape
a box that would clip it, the table's overflow, and capping it at the sheet's
column reinstates that box by arithmetic. And the cost of the other answer lands
on the narrowest panes: in a 300px sidebar a container cap would squeeze the form
to 268 and wrap rows that fit at 348, to avoid covering a neighbour for the few
seconds a transient surface is open. What a narrow pane still owes is that the
panel stays in the window and on its anchor, which the shared clamp does. At a
true phone width the two answers coincide, since the window is the pane — which
is why §4 says a view earns a true viewport when it holds this panel, and why
`sheet-modifier-form-narrow` is a picture of the overhang and not of a phone.

**What it holds is a list and one disclosure**, and the state each line carries is
its own words plus its own mark: `zap` / `zap-off` per line, the same mark the
row's glyph draws, so the row's mark and each line's mark are the same mark. A
reason gets a *line of its own* under the line it is about, which is
`.sheetsmith-field-problems`' shape at this surface. **One line opens at a time and
there is no navigation** — a back-stack inside a transient surface would be a second
dismissal regime — and **the panel stays open across every commit**, which is what a
plugin-owned surface buys over the app's menu: the menu closed on select, so
managing several modifiers was one opening each and a swap was two.

**A modified number is marked by a shape, and the mark is one press from what
it is made of** [judgement]. An underline and `cursor: help`, opening the
shared popover — no new gesture (§6, §9), and on touch an ordinary tap, on
`table.ts`'s own argument that a read-only number has no other use for one. The
channel is deliberate: §1 gives the plugin no colours of its own, so the closest
prior art's answer — Sandbox System Builder colours a modified attribute green —
is exactly what may not be drawn here, and `text-decoration` is also the one mark
that survives forced-colors mode.

**It was a 2px dotted underline in `--text-muted`, and it is now a plain one in
the number's own colour.** Not a design decision: `text-decoration-style`,
`-color` and `-thickness` are what Obsidian's plugin review reports as partially
supported, and the bare line value is the only spelling of the property it
accepts. Three things went with them — the dotted shape that distinguished the
mark from a link's underline, the muted colour that a contrast measurement had
chosen over `--text-faint` at 6.19:1, and the thickness that kept three 2px dots
in a cell from being mostly antialiasing. `border-bottom` keeps all three and
was tried; it draws on the element box rather than on the text, so a
right-aligned number in a wide cell got a rule across the whole cell. The
stylesheet carries the measurement at the rule.

**The plain mark is accepted, and the clean review report is worth it**
[judgement]. It still differs from a link on a second channel: a link on a
sheet is accent-coloured, the mark is the number's own colour with
`cursor: help`, and its press explains rather than navigates. A border on a
span sized to the digits, Pool's answer, was weighed and refused: it cannot
reach a card's editable pill, whose box is the whole field, so one mark would be
spelled two ways on one card. **This reopens if Obsidian's directory review
turns out to report `text-decoration-style`, `-color` and `-thickness` as
warnings rather than errors**: the dotted, muted 2px mark then returns.

**The breakdown is one popover with several lines, and it needs no markup.**
`showPopover` sets `textContent` and `.sheetsmith-popover` already carries
`white-space: pre-wrap`, so a newline is already a line — and a second kind of
panel beside a row of cards is what this section opens against. What that costs
is per-line styling: a suppressed contributor cannot be drawn faint, so the
parenthetical saying it was not applied carries that instead.

**What it did cost was the bubble's width**, and this is the one rule the
breakdown changed rather than reused. The cap was `20em` — about 34 characters —
chosen when the only payload was a formula, and a breakdown's lines are
sentences: two contributors and a total came out as six wrapped visual lines
with nothing saying where a contributor began. `text-indent` cannot answer it,
because it addresses the first line of a *block* and a newline under `pre-wrap`
starts no block, so a hanging indent leaves exactly one line flush and implies a
hierarchy that is not there. The cap is the answer, set from the longest line
the harness draws and recorded in `shared.css` beside it; a cap is not a width,
so the other two payloads are content-sized as they were and a long formula
merely wraps later. **Below the `100vw` clamp — a phone — the sentences wrap
again and nothing recovers the structure**, which is the honest floor of a
single `textContent` bubble.

**The same text also reaches a reader with no pointer, and the two carriers spell
it differently because the surfaces differ** [judgement]. The number itself is
not a tab stop, so neither carrier can be the number. A card has a field to hang
`aria-describedby` on, so its twin is a `.sheetsmith-sr-only` div the field points
at; a table cell has no field of its own — pointing the row's neighbouring input
at a breakdown would describe the wrong number — and is read as the contents of
its `td`, so its twin is a span *inside* the cell with no ARIA wiring, which is
the idiom a hidden column heading and the delete column's name already use. What
is shared is the text, which is the thing that must not differ, and one builder
owns it. **What neither fixes is the tab stop**: a read-only value display is not
focusable, and making one so would add a stop per modified card and eighteen per
skills card, which is a change to a component's keyboard model rather than to a
mark.

**A contributor line names its contributor with as many of three tokens as carry
information — the component, the row, and the modifier — and the rule is one rule:
a token that carries no information is dropped** [judgement]. Widest scope first,
separated by `·`, then the outcome after an em dash.

- **The component** appears only where the breakdown draws on more than one, and
  then on *every* line of it. The common sheet has one modifier table and reads
  `Bag of Holding — item +2`; two of them, each with a row called "Ring", read
  `Worn items · Ring — item +1`.
- **The row** always appears. It is how a reader finds the thing to untick.
- **The modifier** appears only where the row is not already called by its name.
  An item's row is normally named after the modifier it applies, so the two are
  the same word and printing both would print one word twice — but a cell holds
  *every* modifier its row applies, so a row can apply one it is not named after:
  `Belt of Giant Strength · Bracers of Defence — circumstance +1`, where the row
  alone said a Strength item was giving the reader armour class.

**The component is decided once per breakdown and the modifier per line, and that
is the same rule rather than two.** Dropping the component on some lines would
leave a fact *unrecoverable* — nothing else on an unqualified line says which
component — and would make one line's text depend on another line's spelling.
Dropping the modifier where it equals the row removes a duplicate of a word
already on the line: nothing is missing, and no line depends on any other. So the
granularity follows from what each token would cost, not from a preference.

**One exception, and it is where the rule's premise fails: a breakdown read inside
a component that has rows names its component on every line, however few there
are.** "Carries no information" is true of the breakdown and says nothing about the
reader's *surroundings*. A computed cell in a Skills table drew
`Eyes of the Eagle — item +2` for a contributor living in Magic items, so a reader
read a row name while looking at a list of rows and went hunting for a skill called
that. A card has no rows and so no competing referent, which is why this is the
table's flag rather than a rule for everyone.

**Why the same contributor is spelled differently on a breakdown line and on a
menu line, which is a rule and not an inconsistency** [judgement]. Each surface
drops the token the *reader's own position* already supplies, which is the drop
rule read on the surface instead of on the set of lines:

| Surface | The reader is standing on | So the line reads |
| --- | --- | --- |
| A number's breakdown | the target | component · row · modifier — outcome |
| A row's popup, and its `title` | the row | modifier · target — outcome |

A breakdown line carries no target, because every line of it changes the number
the reader is already looking at; a menu line carries no row, because the reader
pressed that row's own glyph to open it. **What is genuinely one spelling across
all three is the outcome** — `item +2`, `sets to 18` — through one private helper,
which is what stops a row reading "+1" beside a breakdown reading "item +1".
Forcing the identifying half to one shape would put four tokens on every line
where the reader needs two, and the token it added would be the one they are
already looking at.

**Where the formula transforms the slot, the total states the push and then what
it did** [judgement]. `count: 'floor((3 + mod.self) / 2)'` with a `+2` draws one
granted segment, so `Total +2` alone states one push at two magnitudes on one
control. The contributor lines stay what was pushed, since that is what a reader
unticks, and the total adds the measured effect only where it differs from both
phases' slot total — `Total +2, run +1`, signed either way, after `, ` so it
does not read as a contributor — so an untransformed slot reads as it always
did. The effect and its noun come from the caller that measured it, as `shown`
does: the builder never re-derives a number somebody else drew, and holds no
component's word. **A zero effect adds nothing**, because a count reading its
slot by the absolute spelling measures zero over a run that genuinely moved;
**an override keeps `Total <shown>`**, which already states the value; and a
clamp at the run's floor or cap is something the push did, so it is said
(`docs/features/breakdown-measured-effect.md`). Track is built, from
`cardCount`'s own measurement; Card, Table and Roster follow when they measure.
What a zero still hides — an absorbed push — is in `docs/BACKLOG.md` § UI.

**An irreversible control arms before it fires** [judgement]. The first press
takes a warning tint, marks what it would take, and names it; the second
applies it. §12's rule from the pool's typed amount is the reason: where a
control's input is not its outcome, the outcome has to be on screen before it is
applied, and an irreversible outcome is the strongest case of it. The shared
confirmation is also not available to reach for — `ConfirmModal` takes an `App`
and `RenderContext` carries no route to one, so a component's only confirmation
surface is the card itself. **The
next press anywhere else stands it down**, along with Escape, focus leaving the
control, and arming another one; all of them leave the file exactly as it was.
The outside press is the load-bearing one, and it is §7 again: a finger has no
gesture for moving focus away, and a tap does not focus a button, so a control
disarmed only by `blur` is a two-step gesture that becomes one step on touch.
`popover.ts` makes the same dismissal for the same reason.

**Rendered text and the field that edits it are stacked, never swapped**
[judgement]. Both sit in one grid cell: the field stays in the DOM and in the tab
order in both states, which is what keeps the view's focus restoration counting
the same controls across a rebuild, and neither child changes size on focus, so
nothing reflows under a pointer already resting on the cell. Unfocused, the
display layer is opaque over a field whose own text is transparent, and only the
links inside it take a press. A cell with nothing to render gets none of it,
which is what keeps an eighteen-row card the DOM it always had.

**A prose block refuses one line, and shows the draft while it does.** `## ` at
the start of a line is the note's own section delimiter, so Rich text declines to
commit a draft holding one and draws `.sheetsmith-error` under its box naming the
line and the fix. The state needs a rule of its own because of the row above: the
field's text is transparent unfocused, so a refusal left alone would put the
*stored* prose back on screen with an error under it and the reader's actual words
invisible. `.sheetsmith-rich-text-refused` undoes both halves together — the layer
stays hidden as it is on focus, and the field keeps its colour — so what is on
screen is the text the message is about. Focus is not taken back, deliberately:
refocusing on blur is the other way to keep the draft visible and it steals the
pointer from wherever the reader just clicked.

**Which layer answers the press is per component, and only the cell falls
through.** A table cell's layer is `pointer-events: none`, so a click reaches the
field and the browser puts the caret where it landed — one line, nothing to
scroll, and the landing position is meaningful because both layers hold that line
in the same shape. Neither other consumer can copy it. **Rich text's layer is a
scrollport**, and a scrollport that is not a hit target never receives a wheel:
the spelling shipped, and the gesture went to the invisible field behind it, which
scrolled 150px in a real browser while the visible prose stayed at 0. That layer
now routes the press itself, and `styles.test.ts` forbids the declaration by name.
**Image's field is the inert one instead** — it is a single line stretched across
the middle of a portrait, so the frame under it owns the press and a click near the
top of the picture reaches the frame rather than dying on the field. So the rule
this row shares is the stacking and the tab order, not the hit testing.

**Transparent is not invisible, so the field's spellcheck follows its focus.**
`color: transparent` suppresses the glyph fill and nothing else: the engine
paints the spelling marker as decoration, independently of the colour the text is
drawn in, so an unfocused field's squiggles come through the layer above it —
under words the reader can see, positioned by the source line the word sits on
rather than by where the rendered word ended up, and left behind when the two
layers scroll separately. `ui/spellcheck.ts` is what all three call. It is the
one part of hiding the field that CSS cannot do, and the two ways of hiding it
harder are both ruled out by rules above: `visibility: hidden` takes the field
out of the tab order, and `opacity: 0` takes the placeholder, which is
deliberately the one part of an unfocused field that shows through.

**The same arrangement at block scale is Rich text's, with three stated
departures** [judgement]. A cell and a prose box share the rule above and differ
in three mechanical ways, each with its reason, because a shared gesture is only
shared if the differences are written down. **The rendered layer is hidden rather
than left transparent**: a cell's two layers hold one line in one shape and can
overlap, while a block's hold one text in two — a rendered heading is not the
height of its source line — and two differently-shaped copies of one text
overlaid are unreadable. **The caret is not moved**, for the same reason: a point
in the rendered view is not the same character in the source, so there is no
landing position to preserve and pretending otherwise puts the caret confidently
in the wrong place. **The box never changes size, but its scroll extent does** —
the rule above holds where it was written, since the placement is fixed and
nothing on the sheet moves. The two layers are separately scrolled because one
offset shared between two shapes puts them out of step, and **the reader's place
is not carried across**: this once said a focused field "scrolls to its caret,
which is what the reader asked for by clicking", and the departure above is
precisely that there is no such caret. §12 holds the row.

**A component's box is never sized by its content** [checked: `styles.test.ts`].
Rich text is where this first bit, and it is `SPEC` §8's "a component fills its
placement" read for a component whose content has no natural height. The prior
art is four issues over four years on the closest analogue — a prose block with
no vertical size, at zero height, squished, or absent — and the oldest states the
defect exactly: it "grows according to its content which does not allow to
control its position in the sheet in a stable way". Three CSS facts hold it and
each answers a different one of those four: a `min-height` from the placement, so
the row is sized by the layout and cannot collapse; `overflow-y: auto` **on the
layers rather than on the box**, so the text scrolls rather than escaping and each
layer scrolls on its own; and both layers out of flow, so nothing inside
contributes intrinsic height and the floor cannot be pushed past. None is visible
in a unit test, which is why all three are scanned rather than trusted.

**The row height in that `min-height` is a measured number, not a derivation, and
it is a floor rather than a height.** `--sheetsmith-grid-row` is `4.75em`
(`tokens.css`), and the block's floor is `--sheetsmith-rows` × that. The grid
genuinely has no row height to derive from — the sheet's rows are content-sized —
so what a placed box actually gets is `max(the row's own height, 4.75em × rows)`,
and `SPEC` §8's "`height` grid rows tall whatever is in it" is that, approximated.
`em` rather than pixels so it follows the sheet's size the way a card's
headline does (§5 says what sets that).

**Why the approximation is safe is the direction it can be wrong in.** Where a
card in the same grid row is taller, the row grows and a placed box fills it —
both measured at 178px — so the two cannot drift apart upward; the number decides
only the minimum height of a row nothing else makes taller. There is also no
second copy to drift *from*: a card's height is emergent from its padding, its
label and its value size and is written down nowhere, so deriving this in `calc()`
would invent a coupling rather than remove one, and changing a card's padding
would then resize every backstory on the sheet. **And it survives nesting**,
which is the case the floor could plausibly have got wrong: a Group and a Tab set
each holding a Rich text and an Image render them at matching heights in
Obsidian's own shots. Named for the grid rather than for either component, which
is the correction Image forced — it was `--sheetsmith-rich-text-row` while prose
was the only consumer, and raising it to give backstories more room would silently
have resized every portrait on the sheet.

**The box is one thing and not two, and naming only the number is how it nearly
was not.** This table's row for it used to name `--sheetsmith-rows` ×
`--sheetsmith-grid-row`, which is the arithmetic and not the object — and while
that was all it named, both components wrote the *rule* out in full: fourteen
identical declarations in two copies, including the coarse-pointer and
high-contrast blocks. That is `PATTERNS.md` §1's `roundSum` mistake exactly, "a
policy shared and its application duplicated", and the drift it allowed was
silent: change the surface's radius for a portrait and prose keeps the old one,
with no type, lint or test reporting it. One class each for the component and its
surface, and what a component keeps is only what it does *inside* the box — which
is the one thing the two do not share. The guard moved with the risk: the
stylesheet is checked for what the shared rule says and for nobody writing it out
again, and each component's own test checks that it asks for the class.

**Image is the same rule on the harder case, and it is where the token got its
name.** A picture *has* an intrinsic size, so the failure is not a box that
collapses but a box sized by the *file* — a character's note deciding a box the
layout author placed. The answer is identical: the picture is out of flow and the
block takes its floor from `--sheetsmith-rows` × `--sheetsmith-grid-row`. The
token was `--sheetsmith-rich-text-row` while prose was the only consumer, and a
reader raising it to give backstories more room would silently have resized every
portrait; it is named for the grid because that is whose fact it is. Duplicating
the number instead is what `PATTERNS.md` §1's one-step tier refuses outright.

**A picture fits its box and is never stretched to fill it** [checked:
`styles.test.ts`]. `object-fit: contain`, bounded in both directions, with the
slack left as the frame's own surface. The convergent prior art is width-and-height
where two dimensions may distort, so a stretched picture is exactly what a reviewer
would mistake for correct — and a still cannot show it unless the sample happens to
have the wrong aspect ratio for its box, which is why the harness draws the *same
file* in a wide box and a tall one and puts a circle in it.

**Content the app or the vault renders into a sheet inherits the reader's theme
and snippets** [judgement], and that is correct rather than a defect — the same
bargain this section records for a borrowed class name. The plugin styles the box,
not what is drawn in it. What it does own is the element: a picture carries
`.sheetsmith-image-picture` rather than being a bare `<img>`, so this plugin's own
`object-fit` is stated rather than hoped for. The caution is a real report, open and
unanswered elsewhere: an image whose *filename* ended in `-portrait` rendered
cropped while the same file renamed displayed whole, which is a filename-keyed rule
in the reporter's own theme reaching an element that had nothing of its own to say.

**Borrowing one of Obsidian's class names buys the name, not the styling**
[checked: `styles.test.ts`]. Every `.internal-link` rule in `app.css` is scoped to
`.markdown-rendered` or `.metadata-property-value`, and the editor's unresolved
marker to `.markdown-source-view.mod-cm6`. A sheet is none of those, so an anchor
in a cell gets the bare `a` rule — colour, underline, pointer — and no state
styling at all: a link to a note that does not exist looked exactly like one to a
note that does. So a state class on a borrowed element is styled here, under the
view scope, from the app's own documented variables. And give the ones that carry
the meaning a fallback: an undefined custom property makes `color` invalid at
computed-value time, which computes to `inherit`, so a missing variable paints a
link in the cell's own text colour and it stops reading as a link at all.

**One control, two classes, where the same element is not the same object on the
page** [judgement]. The row above names the `<select>` twice on purpose. A cell's
select is `--font-ui-small` in a row of cells; a card's value is the card's
headline size, bold and centred, and drops into a small pill when a `derived`
takes the headline — so a shared class would have to mean two sizes, and a native
select needs no gesture module, so there is nothing else to share. This is what
`.sheetsmith-card-input` and a table cell's field already are: one gesture
(`editable.ts`), two classes, two sets of clothes. It is not the lookalike this
section opens against — that is a *fourth kind of panel* beside a row of cards,
and two selects at two sizes are the card and the cell agreeing about what a menu
is. What they do share is the reason both have to carry the view scope (§2):
Obsidian's bare `select` rule sets a height, a background, a shadow and a font
size, and `styles.test.ts` covers the `-select` naming for it.

**A menu on a sheet wears one chevron, drawn by one rule, and each control places
it** [judgement; seen in `sheet-record-groups` and its contrast and dark twins,
and a cell's in the Languages table on `sheet-light`, `sheet-dark`,
`sheet-forced-colors` and `sheet-contrast-more`].
A select that has had the app's chrome taken off is a word in a box, and nothing
else says it opens a list: a record's Spells read `None` and its recharging lists
`Short rest` as typed text until the sixth rulings pass gave them the
card's mark. So the mark is one selector list, `.sheetsmith-card-dropdown::after`,
`.sheetsmith-record-menu::after` and `.sheetsmith-table-menu::after`, carrying the shape, the size and the lift each placement centres on (`--sheetsmith-chevron-size`, `--sheetsmith-chevron-lift`, declared on the mark, not knobs) in the menu's
own `em`, the muted stroke and its raise to `--text-normal` under
`prefers-contrast: more`; **where it sits is the control's**, because the two
are not the same object (the paragraph above). A card's chevron is a flex sibling
beside a borderless value, so the pair centres together. A record's sits
*inside* the select's hairline, at its end, over padding the select keeps for it,
since there the hairline is the control's whole shape and a mark outside it would
read as a second thing; it takes no pointer, so pressing it presses the select.
Both ride on a wrapper because a `<select>` carries no pseudo-element, and both
are borders rather than an image, so forced colors repaints them (§1). **One
mark rather than two similar ones**, so a reader learns one sign; a third menu
joins the list rather than drawing its own, which is what a Table's and a
Roster's cell select did in the seventh rulings pass. That select keeps the
app's field box as the platform draws it, so the mark sits inside it at its
end on the record's placement rule, by selector list: `.sheetsmith-table-menu`,
the wrapper both components draw. Before it a level column set to a select read
as a text box. **The box is not the sign everywhere, so the chevron is**: on
desktop the box is white with an inset shadow and outlines the control, but on
a tablet `.is-mobile` takes the shadow off and draws a grey pill, `#f6f6f6` on
a `#fafafa` row, about 1.03:1, which outlines nothing (`sheet-tablet`), and
there the chevron is the one thing saying the word opens a list.

The delete glyph is deliberately **not** a shared class. It borrows the level
ring's measurements through `--sheetsmith-inline-control`, because two glyph
buttons in one table row must not measure differently under the same finger, and
that number is the whole of the agreement: two consumers earn duplication, not a
module (`PATTERNS.md` §1). This table gains a class when a third appears.

**A component's own name is one rank, and the table above had no row for it until
it had five copies** [checked: `styles.test.ts`]. Uppercase, tracked, muted,
`--font-ui-smaller`: quiet enough that the value under it is what the eye lands
on, and distinct from the row above it, which is a name over a *region of other
components*. The card face, Pool, Track, Rich text and Image each wrote the nine
declarations out in full, because the agreement was recorded in each file's
comment — "on the pool's and the track's rank" — rather than in a name, and a
comment is not something the next component can reuse. Four were byte-identical
and the fifth declared the same properties in a different order, which is why a
review counting copies found four: the fifth was found by checking for the *rank*
rather than for the text of a rule.

**What did not move is each component's own narrow-card override**, and that is
the interesting half. Three of the five tighten the tracking on a narrow card and
they do not agree on the threshold — 130px for a card's label against 160px for a
pool's — because the two are not the same width. The other two *cannot*: the card
face, Pool and Track set `container-type` on their own card, so a container query
asks about the card, while a Rich text block establishes none and the same query
inside one resolves against the sheet and fires essentially never. So a shared
rank does not mean a shared reflow, the overrides stay with the components that
have a container to ask, and each has to sit after the shared rule in the cascade
to win. **Two things at two different tiers, in one place, is what the single copy
was hiding.**

Note which half is *tested* and why, because it is not symmetry. The stylesheet is
checked for declaring the rank exactly once; whether each component asks for it is
not, while the placed box's equivalent is. The difference is what failure looks
like: a box that forgot its class has no height and may be subtly wrong, and a name
that forgot its class renders in the body font and is obviously wrong the first
time anyone looks at it. `§11` is the check for the second kind.

**One hairline under a container's chrome, whichever container drew it**
[judgement]. A Group's heading carries the rule; a Tab set's strip carries the
same rule in the same place, and `.sheetsmith-tabset > .sheetsmith-group-heading`
zeroes the heading's own so the two never stack. A tab set drew both at first —
a rule under its name and a second under its strip, ~37px apart — and beside a
group of the same declared size it read as a heavier, more built-up object, which
is this section's opening sentence one level up. The heading class is shared for
the same reason the painter below is: two headings of the same rank must not
measure differently.

**When a card and a cell do the same job, they share the painter** [judgement].
A single-level mark on a card and the same mark in a table cell must go through
`paintLevelRing` rather than a lookalike, precisely so one flag cannot measure
differently from the other under the same finger. Track's flag is the card half:
a run of one segment is two states, so it draws the ring and not a segment, and
`docs/features/palette-entries-and-flags.md` carries the argument. **The class is
named for the painter and not for a caller**, which is why it is
`.sheetsmith-level-ring` rather than the table it used to be spelled after — a
Track card carrying a class called `table` is a name a reader would believe
(`PATTERNS.md` §1). The ring's expanded hit target rides on that class rather
than on a table cell, and the price is on whoever stacks rings: a checklist has
to keep its rows further apart than the target reaches, or the later ring wins
the press. Track's `.sheetsmith-track-flags` row-gap and the editor's
`.sheetsmith-level-sample` gap are the same arithmetic for the same reason.

**A settings row whose description grows puts it below the controls, never beside
the name** [judgement]. Obsidian draws a setting row as one centred flex line, so
copy in the info column widens it until the control column wraps — and what wraps
is the control the author is about to reach for. The layout editor's **Add
component** row is where this first bit: its description is empty for a bare type
and three lines for a palette entry, so choosing an entry dropped the destination
dropdown and **Add** about 35px while the menu they were chosen from kept the
first line. `.sheetsmith-add-row` is the answer — `descEl` appended after the
controls and given `flex-basis: 100%` — so the first line's height is fixed
whatever is selected and the copy grows downward into space nothing is placed in.
**That row is history now**: the component picker replaced its dropdown
(`docs/features/component-picker.md`), and describes every line in its own list,
so it has no row to move a description under. The class keeps its name and its
two later consumers, below.

**Moved rather than reserved**, which was the open half of this question. Reserving
a line of description height shows as a gap under every row whose copy happens to
be empty, and it has to be as deep as the longest copy to be worth anything;
clamping to one line with the rest in a `title` hides text that is often the only
explanation a field gets (`PATTERNS.md` §8). It was one consumer and a class
rather than a row in the table above, on the rule that the second settings row
with growing copy reuses it rather than inventing a second answer — which is
this section's opening sentence applied to the editor rather than to a card.

**The second consumer has arrived and did exactly that**, which is what keeps
this a class: **New layout**'s **Start from** row, whose description says what
each source does and is empty for none of them
(`docs/features/starting-a-new-layout.md`). It is the same defect one surface
over — a settings row is one centred flex line wherever it is drawn, and copy in
the info column widens it until the control column wraps.

**What the treatment buys in a modal is narrower than what it buys on the pane,
and the difference is what follows the row.** On the pane the copy grows into
space nothing is placed in, so nothing at all moves. In the modal three rows
follow — the chosen source's input, **Name**, and the buttons — so a **Start
from** switch still moves them: a line of copy pushes them down, and revealing a
source row pushes them further. What is fixed is the *first line*, which is where
the reader's pointer actually is: the dropdown being operated does not move under
it while the sources are cycled, where in the info column the dropdown itself
would have shifted. Worth having, and not the same claim — a rule that reads as
"nothing moves" would be trusted about a surface where things do. Two things the
second consumer settles that one could not: both classes are
bare and unscoped, so they paint **in a modal**, which is the scoping test
`.sheetsmith-input-invalid` failed; and the id the description is associated by is
generated per instance there rather than being a module literal, because a modal
can be opened, closed and opened again where a pane's row is replaced whole by a
redraw.

**An app path quoted in arrow notation keeps each multi-word label whole and
breaks at its arrows; a line may end on an arrow but never begins with one**
[judgement]. A trailing `→` says a step follows, where a leading one reads as a
continuation of nothing. So a no-break space goes inside a label and before its
arrow, never after one, which leaves the space after an arrow as the only break;
binding the whole path is out too, since it overflows a narrow column. The
**Character folder** description is the instance: at 620 it wraps
`Settings → Files and links →` over `Default location for new notes.`

---

## 10. Failure appears in place

A misconfigured component renders `.sheetsmith-error` into its own container and
nothing else. The rest of the sheet stays live and editable (`SPEC` §10). There
is no global error state, and a broken component never blanks the page.

A pane's own failure appears in its outline, under the **Layout file** row: the
file cannot be read, cannot be edited, or holds changes not saved. That is the
pane's place, not a global one, and it never displaces the row.

Error text names the fix: `"max: 'con' is not defined on this sheet"`, not
`"could not resolve"`.

**Every fenced component's read failure is drawn in `sheet-error`, one breakage
each, so no message appears twice** [judgement]: a Track flag holding `maybe`, a
Card set line with its colon gone, a Pool key written twice and a Card fence never
closed. The last three are three of the four shapes `readFenced` refuses; the
fourth, a section holding a second sheet block, is not drawn. A value
of the wrong kind is not one for Card, Card set or Pool, which read every value as
text. Which component carries which is argued in `harness/samples.ts`'s
`brokenSamples()`.

**Each of `readFenced`'s four refusals is the fault and then the fix, and the fix
names the note** [checked: `fenced.test.ts`]: `Line "GP 7" is not a "key: value"
entry. Put a colon between its key and its value in the note, or delete the
line.`, `Duplicate key "max" in sheet block. Keep one "max" line in the note and
delete the rest.`, `Sheet block is never closed. Add a line holding only ``` after
its last entry in the note.`, and `Section has more than one sheet block. Merge
them into one in the note, or delete the extra one.` In the parser rather than in
each component, because Card, Card set, Pool, Track, Passport and Roster all hand
the message on verbatim and six copies of one piece of advice drift. **The fix
says "in the note"** because nothing on the sheet can repair a block it cannot
read, and the reader may never have opened the note in source mode. A record
adds only what its list alone knows: `Every other spell on this list still
works.`, where it used to add a fix of its own, which with the parser's would
have said the fix twice. **Track's refusal of a value its run cannot read takes
the same shape** [checked: `track.test.ts`]: `"maybe" is not yes or no. Write yes
or no after its key in the note.` on a flag, `… is not a number of marks. Write a
whole number after its key in the note.` on a run. Those six are every refusal a
component makes of its sheet block: Card, Card set and Pool read every value as
text, Passport's other refusals are of its layout, and Roster's of its markdown
table, which is not this rule's subject. **Pool's temporary points are marked,
not refused, by the same token** [checked: `pool.test.ts`]: the block reads, so
the card draws the field with the stored text in it, an error border on the pill
and `Temporary points are a whole number of 0 or more, so the note's "2.5"
counts as none. Type a whole number, or clear the field.` under it — the fix
names the field rather than the note, because here the sheet *can* repair it
(`docs/features/pool-temp-refuses.md`).

**A fence key's refusal is the parser's reason and the caller's fix, and on the
sheet the fix names the layout editor** [checked: `card.test.ts`,
`roster.test.ts`, `record-set.test.ts`, `track.test.ts`]. A key holding a colon
is the layout's fault, not the note's, so `fencedKeyProblem` states the rule
and its reason and stops: `The key cannot contain a colon or a line break,
because the sheet block separates key from value with a colon. Rename it under
Key in the layout editor.` on a Card (`sheet-error`: Armour class, Carried,
Load), and the same clause ending `Rename it under Stats …`, `… under Fields …`
and `… under Rows in the layout editor.` on a Roster's stat, a Record set's
field and a Track's row key. **The fix is each caller's because the clause has
three readers who repair it in three places**: Track's **Add** form refuses a
row name the character just typed with `Take the colon out of the name.`,
since the draft is kept in the field beside the message; and the layout
editor's own key fields end the clause with what the field was left holding,
the grammar of every field mark in the pane, since the mark sits under the
field it refuses. Passport's `nameKey` and field keys fall back silently and
draw no message.

---

## 11. Reviewing appearance

Run `npm run harness`. Check each of these, because none is visible in code.

**The sheet:**

- both themes, light and dark
- narrow container: does the grid actually collapse, and does anything overflow
- a component at 1, 2 and 3 grid columns wide: does it fill its placement
- numbers mid-step: do they jitter, or hold on tabular figures
- focus: visible on every interactive element, one treatment per component.
  `&focus=<css selector>` focuses one, so this is photographable rather than
  taken on trust — the sheet styles `:focus` and not `:focus-visible`, so a
  programmatic focus paints what a tab press paints
- **hover, which needs a browser being driven rather than pointed at a file.**
  `:hover` matches on the real pointer position and nothing in the page can move
  it, so a `hover:` view in `harness/shot.mjs` drives headless Chrome over the
  DevTools Protocol (`harness/cdp.mjs`) and dispatches a real `mouseMoved`.
  It adds no dependency — `fetch` and Node's own `WebSocket`, the technique
  `harness/inspect.mjs` already uses against the installed app — and a real move
  rather than `CSS.forcePseudoState`, because half of what a hover does here is a
  `pointerenter` handler. Until it existed no hover treatment on a sheet had ever
  been photographed. The same path takes `hold:` (a press held mid-gesture),
  `media:` (an emulated feature such as `prefers-contrast: more`) and any frame
  under 500px wide, which `--screenshot` renders at 500 and crops
- **a refusal at the commit**, which is a class of surface no fixture can hold:
  `editable.ts` reports one on *blur*, so the sentence exists only after somebody
  types and looks away. `&type=<selector>|<text>` sets a field and leaves it, and
  it is `&focus=`'s and `&press=`'s third sibling for their reason exactly — a
  wikilink typed into a fence, a `## ` in a prose block, a record left nameless
  and a picture reference that is not an embed are all argued in code and were
  drawn nowhere. A stored body cannot stand in for any of them, because a note
  that already holds the offending value is rendered and carried under SPEC §10
- an error state and an empty state, not only the populated one
- a larger sheet size (the harness's `Text → 24`, or `sheet-large-text.png`):
  does truncation grow, does the hierarchy reorder, does anything collide. §5
  rests the card on relative units so it follows the sheet's `em`, which a
  theme or snippet moves and the vault's text-size setting does not, and that
  is where the claim
  is either true or not

**A harness that rebuilds on hover cannot review anything a pointer does.** The
fake link context redrew the sheet on a preview, so the element under the pointer
was replaced mid-gesture: a press landed on one anchor and released on its
replacement, the click never dispatched, and a tooltip revealed on hover vanished
with the element that had it. The app rebuilds on an edit and never on a preview,
so every one of those failures was the instrument's. Anything the harness does in
response to a gesture updates in place.

**An approximation in the harness for something the plugin should own is worse
than no approximation.** The unresolved-link colour was written into
`harness/theme.css` first, so the harness showed the two link states as different
shades while the app showed them identical — the instrument was kinder than the
thing, and the review passed. When a stand-in makes a shot look right, check
which stylesheet is doing the work.

Run `npm run harness:calibrate` first. It reads the installed Obsidian's own
`app.css` out of its asar and generates the real theme palette and settings
chrome, so the harness borrows Obsidian's frame instead of approximating it.
Re-run it after an Obsidian update. Without it the harness falls back to the
hand-written approximation in `harness/theme.css` and is close but not exact.

`npm run harness:shot` renders every view to `harness/shots/`, covering both
themes, all three screens, the narrow reflow on each, the larger text size, a
focused control, forced colors, a pane with a fold in it, and the empty and error
states of both the sheet and the editor — a vault with no layouts, and a layout
file that will not parse — so a review can look at PNGs rather than clicking
through.

**Every shot but two lets the surface grow past the window**, so what it captures
is the whole surface laid out flat rather than one screen. That is the right
default — a review that has to scroll for its findings misses them — and its cost
is that nothing about scrolling, clipping, or what falls below the fold is in any
of them. `&bounded` on any view gives the leaf the window's own height instead —
a query rather than a button, because the bar had no room for a seventh group
without wrapping and costing every 1400 shot 38px. `editor-bounded` and
`editor-threshold` are the two that take it. What it still cannot show is a
*scrolled* pane: a still has no scroll position, so a panel that scrolls out of
the leaf when a row low in the tree is selected is visible by pressing, never by
looking.

**The layout editor pane** (`Surface → Editor`, or `Both` for it beside a sheet):

- does a new config field read as a setting, or as a form field dumped in a list
- is its description a consequence, or a restatement of its label (§8 of
  `PATTERNS.md`)
- do the list-shaped fields for rows, columns, entries and triggers stay
  legible once they hold ten entries rather than two
- does the grid preview agree with what the sheet actually renders
- does the tree read as the layout's table of contents, with nothing between a
  container's row and the rows of what it holds
- do the two columns still hold at the threshold, and does the stacked order
  read as schematic, tree, panel — `editor-light` and `editor-stacked` bracket
  the number on purpose, and `editor-threshold` is the split at its narrowest,
  where the panel is under the width its fields are known at
- how much of the pane arrives in one screen, and what falls below the fold —
  `editor-bounded`, the one editor view given a real leaf height. The leaf's
  bottom edge has to be *in* the picture, with both columns clipping on it: two
  scrollers rather than one is the whole of what the split promises, and a chain
  with an auto height anywhere in it draws a crop of a grown pane that looks
  much the same
- what happens to the sheet when the field changes: `Both` shows it live

---

## 12. Backlog

Where the code does not yet match this file. The rows moved to
`docs/BACKLOG.md` § UI; that file holds this backlog and `docs/PATTERNS.md`
§11's, a section each. This heading stays because dozens of source comments cite
it as an address. Read and write the rows there. They are findings, not licences:
new work follows the sections above.
