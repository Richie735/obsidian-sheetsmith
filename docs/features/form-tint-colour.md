# Form tint colour

Status: shipped
Board card: Let a layout choose the colour a form's tint uses instead of the
accent: one setting on the Stat block for all its forms, and an optional
per-form override, so all of a druid's Wild Shape forms can be green and the
Brown Bear brown.

## Model question

**None in `SPEC` §13.** The form tint is settled and built
(`docs/features/character-forms.md`, "The tint"). This feature changes which
colour it draws in, not what it marks or when.

**One contract addition, made deliberately.** `ModifierPush` (§4.1,
`scopeModifiers`) gains an optional `tint`, beside `inPlay`, on the same
argument: **it is a fact about the row, never about the modifier.** The push
still carries no target, no bonus type, no amount and no reason. The colour has
to reach `view/placement-decorations.ts` without that module knowing a Stat block
exists, and the push is the only route that keeps "nothing outside a component
needs to know that component exists" true. `tint` without `inPlay` means
nothing and is ignored. Absent means the accent, which is every push written
before this.

- **What it publishes:** nothing. The per-form value is not a field, so
  `scopeRows`, `recordValues` and aggregates do not see it.
- **What it stores:** one optional fence entry per record, `Tint: <colour>`,
  only where the layout turns **Tint per record** on. It goes through
  `writeFenced`, so an unchanged record keeps its bytes (Constraint 3). Setting
  a tint and then clearing it restores the record byte for byte, for a record
  with a fence holding other entries and for one with no fence at all. **Not
  for a record that already held an empty fence**: the tint is written into
  it, and **Default** then removes the fence it leaves empty. A later write
  cannot tell a fence an earlier write created from one the reader left empty,
  so the record loses those two lines.
- **Existing notes (Constraint 4):** nothing is read differently and nothing is
  written. A `Tint` entry in a layout with the switch off is kept and ignored,
  like any fence entry no field declares. Turning the switch off deletes nothing.

## What it does

A Stat block chooses the colour its forms tint the sheet in: the theme's accent,
which stays the default, or one of Obsidian's eight named colours. With **Tint
per record** on, each form can choose its own colour under Every form. So a
druid's Wild Shape can tint green and its Brown Bear orange. The fill, the
outline and the tag naming the form all take the chosen colour. The tag is
redrawn so its text clears 4.5:1 on every colour in both themes, which today's
white-on-accent tag does not (3.43:1 in light).

## Smallest version

- **`tint`** (select) and **`tintPerRecord`** (boolean) on the Stat block. The
  `Tint` fence entry, read and written. Under Every form, a **Tint** section
  holding a plain dropdown.
- The tag and edge redesign below, because without it four colours are illegible.
- The colour travels from push to box through `tint` on the push, the line and
  the decoration.
- **It gives up** the swatch beside the dropdown and the swatch beside the form's
  name in the In play head. So the colour a form has chosen is visible only
  where it tints something, and the dropdown is a list of words.

## Design

### The colours

Nine choices: **accent**, then Obsidian's named colours **red, orange, yellow,
green, cyan, blue, purple, pink**. Each one is a theme variable, never a literal:

- accent is `--interactive-accent`;
- each named colour is `--color-<name>`, which every theme redefines for light
  and dark.

`docs/UI.md` §1 holds. Its variable list gains the named colours, scoped to this
one use (Commit boundaries, docs).

**There is no brown.** Obsidian's palette has none, so the card's own example
cannot be met exactly. The Brown Bear gets **orange**, which is the nearest the
theme offers. Any colour outside the list, `brown` included, is an error and
never mapped to its nearest neighbour (Errors).

The list is one policy with several readers: the config field's options, the
fence value's validation, the push's type, the decoration's attribute and the
stylesheet's rules. So it is declared once, by `docs/PATTERNS.md` §1's
policy rule. `TINT_COLOURS`, an `as const` tuple with accent first, and
`TintColour`, derived from it, sit in `src/types.ts` beside `ModifierPush`,
since the push is the contract that carries them. The stylesheet cannot import
them, so `styles.test.ts` holds that **every entry has its rule in
`sheet.css`, and no rule names a colour outside the list**.

### How a colour reaches the box

1. **The push.** `scopeModifiers` sets `tint` on each `inPlay` push. The value
   is the form's own `Tint` entry where **Tint per record** is on and the entry
   is valid. Otherwise it is the block's `tint`. Accent is written as absence.
2. **The line.** `formula/modifiers.ts` copies `tint` onto the breakdown line
   exactly as it copies `inPlay`, so the tint and the popover still read one
   fact.
3. **The decoration.** `PlacementDecoration` gains `tint: TintColour`.
   `inPlayDecorations` groups lines by label *and* tint, so two forms with the
   same name and different colours stay two decorations.
4. **The paint.** `applyDecorations` sets `data-sheetsmith-tint="<colour>"` on
   each box it tints and on each pill, and removes the attribute when it clears.
   The attribute name, `TINT_ATTRIBUTE`, is declared once in `src/types.ts`
   beside `TINT_COLOURS`, the list it carries. The view and the Stat block's
   swatch both read it from there.
5. **The stylesheet.** One rule per colour sets a custom property:
   `[data-sheetsmith-tint='green'] { --sheetsmith-tint: var(--color-green); }`,
   and `accent` maps to `--interactive-accent`. The accent as the default is
   written once, `:where(.sheetsmith-view) { --sheetsmith-tint:
   var(--interactive-accent); }`, at no specificity and inherited, so every
   in-play rule that names `--interactive-accent` today names plain
   `var(--sheetsmith-tint)` instead. No inline style is set.

### What it looks like, and the tag (question 1)

The measured problem has three parts.

- **The tag.** It is drawn today in `--text-on-accent` (white) on
  `--interactive-accent`. On the named colours, no single text colour clears
  4.5:1 on a solid fill in both themes. White fails on yellow, cyan, green and
  orange everywhere. Black fails on light blue and purple (4.24:1). A pick per
  colour would hold only in the default theme, since a community theme redefines
  `--color-*` and the pick would go stale without a word.
- **The outline.** In light, four colours fall under 3:1 against the card
  (yellow 1.93, cyan 2.12, green 2.41, orange 2.73). So a yellow tint would
  outline almost nothing.
- **The fill** is not a problem. A 12% mix keeps value text above 7.7:1 on
  every colour.

**The answer is a neutral tag with a coloured edge, plus an edge colour mixed
toward the text colour.** Both lean on a pair the theme itself guarantees,
instead of a pick per colour:

- **The box fill is unchanged in form**: `color-mix(in srgb,
  var(--sheetsmith-tint) 12%, transparent)`, laid over the box's own surface.
- **The edge** is `--sheetsmith-tint-edge: color-mix(in srgb,
  var(--sheetsmith-tint) 70%, var(--text-normal))`. That is the box's outline,
  a row's inset shadows, the tag's outline and the swatch. **Mixing toward
  `--text-normal` moves the colour away from the surface in either theme**,
  because the theme defines `--text-normal` against that surface. So light
  colours darken in light and lighten in dark, and the hue survives at 70%. This
  is a second derivation beside UI.md §1's blend toward `--background-primary`,
  and the docs commit adds it there with this argument.
- **The tag** is filled with `color-mix(in srgb, var(--sheetsmith-tint) 20%,
  var(--background-primary))`, written in `--text-normal`, and outlined 1px in
  the edge colour. That is a tinted chip in the theme's own text, the reading
  UI.md §1 asks for: pick the text variable defined against what you mixed
  into. Its place, size, reveal and spoken twin are unchanged, and so is its
  clipping, with one exception: **a tag naming several forms on a card takes
  the card's width less its inset** at each end, because drawn in the accent
  its words are the only thing saying which forms it means. A single name keeps
  its 12ch cap, and so does any tag on a table row, which is laid over the name
  cell, where a wider tag would cover the name the row is read by; a clipped one
  there still reveals in full.

**This changes the default too.** An accent tag becomes the neutral chip with an
accent edge, and the accent outline darkens by the same 30% mix. That is
intended, because today's accent tag fails at 3.43:1. It is listed for the owner
below.

**Measured** against the default theme's values from `npm run
harness:calibrate` (Obsidian 1.15.0's `app.css`, `harness/obsidian.generated.css`).

- Light accent is `--color-accent-1`, which is `hsl(257, 88.88%, 70.95%)`, and
  dark accent is `--color-accent`, which is `hsl(258, 88%, 66%)`.
- The card is `--background-secondary` (`#f6f6f6` / `#282828`), and the page is
  `--background-primary` (`#ffffff` / `#1c1c1c`).
- Mixes are in sRGB, as `color-mix(in srgb, …)` computes them.
- Text needs 4.5:1. An edge needs 3:1 (WCAG 1.4.11).

| Theme | Colour | Value | Today: white on colour | Tag text on tag fill | Edge vs card | Edge vs tinted card | Edge vs tag fill | Edge vs page | Value text on tinted card | Muted text on tinted card |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| light | accent | `#9873f7` | 3.43 | 12.81 | 4.94 | 4.36 | 4.29 | 5.33 | 13.02 | 5.47 |
| light | red | `#e93147` | 4.20 | 11.92 | 6.04 | 5.09 | 4.89 | 6.53 | 12.41 | 5.22 |
| light | orange | `#ec7500` | 2.95 | 12.85 | 4.46 | 3.97 | 3.89 | 4.82 | 13.11 | 5.51 |
| light | yellow | `#e0ac00` | 2.09 | 13.74 | 3.30 | 3.04 | 3.08 | 3.56 | 13.57 | 5.70 |
| light | green | `#08b94e` | 2.61 | 13.06 | 4.01 | 3.59 | 3.55 | 4.33 | 13.18 | 5.54 |
| light | cyan | `#00bfbc` | 2.29 | 13.30 | 3.60 | 3.25 | 3.25 | 3.89 | 13.27 | 5.58 |
| light | blue | `#086ddd` | 4.95 | 12.01 | 6.64 | 5.66 | 5.41 | 7.17 | 12.55 | 5.27 |
| light | purple | `#7852ee` | 4.95 | 12.08 | 6.61 | 5.65 | 5.43 | 7.15 | 12.57 | 5.28 |
| light | pink | `#d53984` | 4.42 | 11.98 | 6.22 | 5.28 | 5.06 | 6.72 | 12.50 | 5.25 |
| dark | accent | `#8a5cf5` | 4.26 | 9.73 | 4.88 | 4.31 | 4.50 | 5.64 | 9.31 | 6.21 |
| dark | red | `#fb464c` | 3.45 | 9.61 | 5.20 | 4.57 | 4.74 | 6.02 | 9.26 | 6.18 |
| dark | orange | `#e9973f` | 2.34 | 8.41 | 7.29 | 5.91 | 5.81 | 8.43 | 8.56 | 5.71 |
| dark | yellow | `#e0de71` | 1.41 | 7.22 | 10.43 | 7.67 | 7.14 | 12.06 | 7.75 | 5.17 |
| dark | green | `#44cf6e` | 2.02 | 8.14 | 7.94 | 6.31 | 6.13 | 9.18 | 8.38 | 5.59 |
| dark | cyan | `#53dfdd` | 1.62 | 7.62 | 9.36 | 7.13 | 6.77 | 10.82 | 8.03 | 5.36 |
| dark | blue | `#027aff` | 4.01 | 9.76 | 4.89 | 4.34 | 4.53 | 5.66 | 9.35 | 6.23 |
| dark | purple | `#a882ff` | 2.88 | 8.90 | 6.37 | 5.29 | 5.38 | 7.36 | 8.76 | 5.84 |
| dark | pink | `#fa99cd` | 2.00 | 8.09 | 8.15 | 6.38 | 6.25 | 9.42 | 8.26 | 5.51 |

**Every cell to the right of "Today" passes.** The lowest results are:

- tag text 7.22:1, on dark yellow;
- an edge 3.04:1, light yellow against its own tinted card.

For comparison, the raw colour as an outline against the card measures, in
light, accent 3.17, red 3.89, orange 2.73, yellow 1.93, green 2.41, cyan 2.12,
blue 4.58, purple 4.58 and pink 4.09. That is why the edge is mixed at all. 70%
is the lightest mix that clears 3:1 everywhere. At 80%, light yellow
(2.53) and cyan (2.68) fail against the tinted card, and green sits on the line
at 3.00.

**The table is a script's output, so it can be checked again.**
`harness/measure-form-tint.mjs` follows `measure-form-tag.mjs`. It loads the
forms sheet once per colour per theme and reads the browser's computed colours
off the real pill, box and card, so `color-mix` is the browser's and not this
spec's. It prints this table and exits non-zero if any tag text is under 4.5 or
any edge is under 3. **It holds for the default theme only.** A community theme
keeps the tag legible by construction, through its own `--text-normal` on its
own `--background-primary`. Its edges are theme-relative, but no theme is
measured besides the default.

### The tag's text, picked at runtime (amended after landing)

**The neutral chip above is superseded on the owner's direction.** The tag is
now the form's colour at 85% (`color-mix(in srgb, var(--sheetsmith-tint) 85%,
transparent)`; the accent at 85% where it falls back, including a tag naming
two forms that disagree), with no edge outside more contrast and forced colors,
16px tall on a box that makes 2px of room for it, and `--size-2-2` plus 2px of
inline padding.

**Its text is black or white, picked at runtime, not written per colour.**
`view/placement-decorations.ts`'s `pickTagText` reads off computed styles what
the theme actually drew: the tag's translucent fill, the surface of the box it
rides and the box's own tint layer, and the first opaque surface outside the
box. The tag straddles the box's edge, so it composites the fill over both the
tinted box and that outer surface (`ui/contrast.ts`'s `over`), measures black
and white against each, and keeps the one whose worse contrast of the two is
higher. The choice is an attribute word (`data-sheetsmith-tag-text="black"` or
`"white"`) the stylesheet maps, so nothing is set inline. It runs after every
decoration pass and again on the workspace's `css-change`, which fires when
the theme, the light or dark mode, or a snippet changes.

**Why black and white, and not the theme's own pair.** The first runtime pick
chose between `--text-normal` and `--background-primary`, and in the default
theme four pairs could not reach 4.5:1 that way (light red 4.20, light pink
4.42, dark accent 4.00, dark blue 4.24): on a mid-luminance fill neither of a
theme's near-black and near-white reaches it. Pure black or pure white always
does: one of the two reaches at least 4.58:1 on any opaque colour, since the
luminance at which black's contrast falls and white's rises cross at 4.58. The
composited fill is opaque, so the guarantee holds whatever the theme draws.
This is the one place the stylesheet names a literal colour (UI.md §1), held
to its two rules by `styles.test.ts`.

**Why it is still theme-safe where the per-colour pick above was not.** That
pick was rejected because it encoded the default theme's colours: a table
saying "yellow takes dark text" goes stale without a word once a community
theme redefines `--color-yellow`. Nothing here encodes a colour. The inputs are
what the theme computes for the fill and the surfaces under it, measured on the
reader's screen, so a theme that redefines any of them is measured as it stands.

**Measured** in both default themes (`harness/measure-form-tint.mjs`, which
asserts 4.5:1 on the fill over the tinted card and over the page): all 18 pass.
The lowest is 4.78:1, twice: black on dark red over the page, and white on
dark blue over the card.

**More contrast and forced colors are unchanged in effect**: under more
contrast the tag sits on `--background-primary` in `--text-normal` with its
2px edge in the edge colour; under forced colors it is `Canvas` and
`CanvasText` with a 2px `CanvasText` edge. Both rules override whatever text
the runtime picked.

**On a Pool the tag sits in the top inline-start corner, inside the box.** A
Pool clips its overflow so the bar follows its corners, and its bottom padding
is where the bar runs: at the bottom corner the tag was cut in half and covered
the bar's end. The top inline-end corner holds the ceiling's door; the
inline-start one holds nothing. `harness/measure-form-tag.mjs` measures it
through the `forms-tint-pool` state, with `overlap` (not `content` and `gap`,
which describe a tag hanging below its box) keeping it off the label.

### Two forms on by hand (question 2)

Two forms on is already the reported error state ("two forms on", the picker's
extra line). Both push, and both apply. The colour follows one rule: **a box,
or a tag, takes a form's colour where every form reaching it agrees, and the
accent where they disagree.** The words then say who did it.

- **One value both forms change, both lines applied** (say, two additions to
  Strength): the card is drawn in the accent. Its tag reads *Brown Bear, Wolf*,
  in the accent, as today's joined tag reads.
- **One value both forms set, where the stacking rule suppresses one** (two `=`,
  or an at least the other already passed): only the applied line reaches it,
  so the box takes that form's colour and the tag names that form alone. This
  falls out of `inPlayDecorations` already skipping suppressed lines.
- **Two values in one placement** (Brown Bear sets Strength, Wolf sets
  Dexterity, both in the abilities Card set): each card takes its own form's
  colour. The placement still has one tag, on its first tinted card. It names
  both forms, so it is drawn in the accent.
- **Two placements**: each tag and each box carries its own form's colour.
- **Both forms the same colour**: that colour. Agreement is not a conflict.

The accent is the "several forms" colour because no named colour can claim two
forms. It misattributes only where one of the two forms is itself accent, and
there the tag's words are the truth.

### More contrast and forced colors (question 3)

**`prefers-contrast: more`.** The existing rules drop the box fill and widen the
outline to 2px. **The colour survives as the edge alone.**

- **The box:** no fill, and a 2px outline in the edge colour (a row's inset
  shadows at 2px). The edge measures at least 3.30:1 against the card in every
  colour and theme above, so it needs no fallback to `--text-muted`.
- **The tag:** its fill drops to plain `--background-primary`. The text is
  `--text-normal` at 15.91:1 in light and 12.19:1 in dark, and the outline stays
  1px in the edge colour (at least 3.56:1 against the page).
- **The swatch:** unchanged. It is a solid square in the edge colour, which
  already clears 3:1.

**`forced-colors: active`.** **The colour is dropped entirely, as the mode
intends**:

- A card's outline is repainted in the mode's colour, as today.
- A row is ruled in `Highlight` on all four sides, as today.
- The tag is `Canvas` and `CanvasText`, with its outline repainted.
- **The swatch is hidden** (`display: none` under the media query), because a
  square repainted in a system colour says nothing.

In this mode two forms with different colours look the same, and only the tag's
words tell them apart. That is the mode's contract, and the words were always
the channel colour is not allowed to be alone (WCAG 1.4.1). No
`forced-color-adjust: none` is used.

### Where the per-form colour is edited, and the head (question 4)

**Under Every form, a Tint section.** With **Tint per record** on, the open
form's stat block opens with a section headed **Tint**, after **Picture** where
that is on and before the zones. Its anatomy is the Picture section's: a
`-section` with an `h4` at the component label's rank. It holds:

- **A dropdown.** It is a native `select` in Obsidian's `dropdown` clothes,
  named `<form name> tint` (the picture field's naming, `${named} picture`). Its
  options are:
  - **Default (green)** first, naming the colour the block resolves to. This is
    the state with no `Tint` entry.
  - Then **Accent**, **Red**, **Orange**, **Yellow**, **Green**, **Cyan**,
    **Blue**, **Purple** and **Pink**.

  Choosing an option commits at once, as every select on the sheet does.
  **Default** removes the entry. Any other option writes `Tint: <colour>` in
  lower case. **Accent** is a real choice, so a form can stay accent in a green
  block.
- **A swatch beside the dropdown** shows the colour now chosen. With
  **Default** it shows the block's colour, so the choice is previewed in the
  colour the sheet will draw. It is a square of `--font-ui-small`'s size with
  `--radius-s` corners, filled solid in the edge colour, and `aria-hidden`
  because the dropdown's text already says the colour. The class is
  `.sheetsmith-stat-block-tint-swatch`, and it carries `data-sheetsmith-tint`.

**In the In play head: one swatch, immediately before the form's name** (after
the picture thumbnail where there is one). It is the same element as the
dropdown's swatch, and it keys the head to the boxes the form is tinting. It
also says which colour is which form when two are on, each name row carrying its
own. It is drawn **only where the layout has chosen a tint**, meaning `tint` is
not accent or **Tint per record** is on. A layout that chooses nothing draws
nothing new in the head, so existing sheets change only in the tag and the edge.
It is not drawn on a closed form's line in Every form, in the picker or on the
uses rings. **This swatch is the owner's call**: it is the first thing the
smallest version drops.

**Interactions** (`docs/UI.md` §6, §7): no new gesture. The dropdown is
Obsidian's own control. Keyboard and touch are the platform's picker, and its
target is `--input-height`. Focus takes the dropdown's own ring. The swatches
take no pointer and no focus. Nothing is armed, since a tint is undone by
choosing again.

### The uses rings and the picker (question 5)

**Both stay the accent.**

- **The rings** count the block's shared uses, Wild Shape's two per rest. They
  belong to the block and to no form, so a form's colour on them would claim
  the counter for whichever form is on, and with none on there is no form colour
  to take.
- **The picker** is a dropdown with no colour of its own. Its focus ring, like
  every focus ring on the sheet, is the accent, which means "interactive" across
  the app. Recolouring a control's state by the data it holds would give one
  component two focus treatments (§6, one focus treatment per component).

### Empty and error states

- **No `tint`, switch off:** today's sheet in accent, with the new tag and edge.
- **`tint` set, no `exclusive`:** nothing tints, because nothing is in play. The
  field's description says so. No error is raised, since a companion block
  holding a tint is harmless.
- **A form with no `Tint` entry, or a blank one (`Tint:`):** it takes the
  block's colour.
- **A form whose `Tint` is not in the list** (`Tint: brown`): **an error on that
  form, never a guess.**
  - The form tints in the block's colour, exactly as if the entry were absent.
    The colour is never mapped to its nearest neighbour.
  - In play shows one muted line under the head, in the same failures host and
    the same clothes as a picture that does not draw: *"brown" is not a tint
    colour. Choose one under Every form, in Tint.* With two forms on, the line
    opens with the form's name (*Brown Bear: "brown" is not a tint colour. …*),
    on the picture line's rule.
  - **One phrase for an unknown colour everywhere**, *"brown" is not a tint
    colour*, followed by each surface's own pointer to where it is fixed: the
    two lines under the head, the Every form dropdown's sentence and its
    disabled option, and the layout editor's **Tint** dropdown.
  - Under Every form, the dropdown gains a first option, *"brown" (not a tint
    colour)*,
    disabled and selected, so any choice is a change. The same sentence is shown
    under the dropdown, without "under Every form, in Tint".
  - The entry is never rewritten until the reader chooses.
  - Matching trims the value and ignores case, so `Green` is green. That is the
    same word, not a guess.
- **The layout's `tint` outside the list** (a hand-edited layout file):
  **reported, and the Stat block still draws** *(owner's decision)*. This is
  the same severity as a bad per-form value.
  - **The rule this departs from.** Every other fault in a Stat block's layout
    is a `configError`: the component's `read` returns `ok: false` and its
    `render` draws the sentence in place of the whole block, on the sheet and
    on the editor's canvas alike (`editor/sample-read.ts` reads the canvas
    through the same `read`). `SPEC` §10's "a malformed section shows an error
    on that component only", applied in §4.2 as "a configuration error on that
    card alone", scopes the damage to one component, but within it the
    component is replaced by the sentence. **This is a deliberate exception,
    and the reason is proportion.** A colour is cosmetic, and losing a
    druid's whole Wild Shape block, its picker, Revert and HP, over a mistyped
    colour word is out of proportion. The precedent for reporting without
    blanking already exists: §4.2's Record set refuses a condition naming its
    own field and reports it under **Shown when** in the editor, and "neither
    is a `configError`, and neither blanks the list".
  - **On the sheet:** the forms tint in the accent. A form's own valid `Tint`
    still wins, and a form with none, or an invalid one, takes the accent. On
    the In play face, one muted line under the head, in the picture problem's
    host and clothes, says: *"brown" is not a tint colour. Choose one under
    Tint in the layout editor.* It is drawn whether or not a
    form is chosen, and once only, not per form.
  - **In the layout editor:** the **Tint** dropdown reports it under the field.
    **The dev has to add this, because nothing reports it today.** The generic
    `select` branch in `editor/config-panel.ts` silently shows its first option
    when the stored value is not among its options. That is the whole of the
    gap, and the smallest fix is in that branch and nowhere else:
    - add the stored value as one extra option, **disabled and selected**, so
      choosing anything is a change, including the default. Today, picking
      **accent** while accent is already shown fires nothing;
    - call `showFieldError` (`editor/field-error.ts`) on the select with
      *"brown" is not one of the choices. Choose one to replace it.*, through
      the panel's existing `errors` map, so the message survives a rebuild.
      **A select whose field names its options says so in that noun**: a
      config field may declare `optionNoun`, and the Stat block's `tint`
      declares `tint colour`, so its report reads *"brown" is not a tint
      colour. Choose one to replace it.*, the sheet's own phrase;
    - clear the message on the next change.

    No component contract member is added and the editor learns nothing about
    Stat blocks: `optionNoun` is a config field's own optional word, read by
    the select branch alone. The fix is generic, so every select a hand-edited layout breaks
    gains the same report: Card set's `direction`, Image's and Pool's selects.
    That is the editor's own "never silently swallowed" rule applied where it
    was missing, and it writes nothing until the author chooses. This mirrors
    §4.2's Card rule for a stored value no longer among its options: render
    it, never snap it.
  - **The component has no `configError` for it.** `configError` keeps only the
    reserved-key collision below.
- **A field keyed `Tint` while Tint per record is on:** a `configError` on the
  `uses` precedent, matched without case: *A field cannot be keyed "Tint" while
  Tint per record is on, because that is where each record's tint is kept.
  Rename the field under Fields, or turn Tint per record off.* With the switch
  off, a field keyed `Tint` is ordinary, so no existing layout breaks.

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `tint` | select | Tint | The colour a record in play tints the values it changes, and the tag that names it: the theme's accent, or one of its named colours, which the theme sets for light and dark. Only a record in play tints, so this needs One at a time by. Changes nothing in the note. |
| `tintPerRecord` | boolean | Tint per record | Each record may choose its own tint under Every form, kept as a Tint entry in its fence; a record that chooses none takes Tint above. Off, a Tint entry already in a note is kept and ignored. While on, no field can be keyed Tint. Off by default. |

- `tint` takes its options from `TINT_COLOURS`, `accent` first, so `accent` is
  the default and is omitted from the layout. The options read as the stored
  words (`accent`, `green`), as every select in the editor does. No swatch is
  drawn in the layout editor (Deliberately not doing).
- **Placement:** after `image`, before `hideLabel`. Neither field is grouped
  under **Appearance**, because `tintPerRecord` changes what a note holds.
- `formulaFields` is unchanged.
- **The Forms palette entry prefills neither**, because a colour is one
  layout's choice, as `zones` is.
- **The 5e starter is unchanged.**
- **`example` gains `tintPerRecord: true`, and `sample` gives the second record
  `Tint: green`**, so `contract.test.ts` sweeps a `Tint` entry through a read and
  a write.

## Data and file model

````markdown
### Brown Bear
```sheet
Active: yes
HP: 22 / 34
Speed: 40 ft., climb 30 ft.
Modifiers: abilities.STR = 4; abilities.DEX = 0; abilities.CON = 3; armour_class = 11
Tint: orange
```
````

- **Key:** exactly `Tint`. It is read as the layout's own field keys are, by the
  key as written, and written by `writeFenced` as the fence's last entry where
  it is new, as any new entry is. The collision check is case-insensitive, on
  `uses`' precedent.
- **Value:** trimmed and matched without case against `TINT_COLOURS`. A blank
  value reads as none. Written lower case.
- **Writes:** the record delta carries `Tint` through `editRecords`, which today
  maps only declared field keys. So the Stat block adds `Tint` to the keys a
  record write may touch **only while `tintPerRecord` is on**. Off, a delta can
  never reach the entry. **Default** writes `null`, which removes the line,
  and **a fence that removal leaves holding nothing is removed too**, with the
  one blank line before it, which is how a fresh fence arrived. So a
  hand-written fence holding only `Tint:` loses its fence lines on **Default**:
  formatting, never data.
- **Constraint 2:** the value is one of nine words, so a wikilink cannot be one.
  `fenced-link.ts` refuses one anyway, unchanged.
- **Constraint 3:** an unchanged record keeps its bytes. Setting a tint on a
  record without one and then choosing **Default** restores the record byte for
  byte, tested over a fence with entries and over a CRLF note. A hand-written
  `Tint: Green` that is never touched stays `Green`.
- **Constraint 4:** turning the switch off, removing `tint`, or a value outside
  the list each leave every byte where it is.
- **Nothing is published.** `recordValues` builds a record's scope from
  `config.fields`, so `Tint` never enters a formula, an aggregate or a reset.

## Acceptance criteria

**The colour list and the push**

- [x] `TINT_COLOURS` is declared once in `src/types.ts`, accent first.
      `styles.test.ts` fails if a colour has no
      `[data-sheetsmith-tint='<colour>']` rule in `sheet.css`, or a rule names a
      colour outside the list.
- [x] `stat-block.test.ts`: with `exclusive` set, each `inPlay` push carries the
      form's valid `Tint` where `tintPerRecord` is on, the block's `tint`
      otherwise, and no `tint` where that is accent. A push without `exclusive`
      carries neither.
- [x] `formula/modifiers.test.ts`: a push's `tint` reaches its breakdown line,
      as `inPlay` does.

**The paint (`view/placement-decorations.test.ts`)**

- [x] A decoration's `tint` lands as `data-sheetsmith-tint` on every box it
      tints and on its pill. A second pass with the form off removes the
      attribute along with the classes.
- [x] Two decorations of different tints reaching one box set `accent` on that
      box. Reaching one placement through two different boxes, each box keeps
      its own tint, and the placement's one pill is `accent` and names both.
      The same tint from two forms stays that tint.
- [x] Two forms with one label and different tints are two decorations.

**The look (harness, in the design review)**

- [x] **The CSS uses no literal colour**: every tint rule names
      `--interactive-accent`, a `--color-<name>`, `--text-normal` or
      `--background-primary`. `docs/UI.md` §1's list names the named colours,
      scoped to the form tint.
- [x] `node harness/measure-form-tint.mjs` (after `npm run harness`, with a
      calibrated `obsidian.generated.css`) prints the table above. It exits 0,
      meaning every tag text is at least 4.5:1 and every edge at least 3:1 in
      both themes. Its numbers match this spec's to within 0.05.
- [x] The tag is the neutral chip: the `--background-primary` mix,
      `--text-normal`, and a 1px edge-colour outline. Its corner, size and
      reveal are unchanged, and `measure-form-tag.mjs` still passes. Its clip
      is unchanged except on a card naming several forms, where it takes the
      card's width less its inset; a single name and any row tag keep 12ch.
- [x] More contrast: no fill on the box or the tag, a 2px edge-colour outline on
      the box, and the tag's edge kept in colour.
- [x] Forced colors: the box, row and tag are drawn as today and no swatch
      shows.
- [x] The uses rings and the picker are drawn exactly as before in every shot.

**The Stat block**

- [x] `tint` and `tintPerRecord` render in the layout editor with the
      descriptions above. Choosing **accent** removes the key.
- [x] A field keyed `Tint` (any case) while `tintPerRecord` is on is a
      `configError` with its sentence. A field keyed `Tint` with the switch off
      is no error.
- [x] **A layout `tint` of `brown` does not blank the block.**
      `stat-block.test.ts`:
      - `read` succeeds;
      - every `inPlay` push carries no `tint` (accent), except a form's own
        valid `Tint`;
      - In play draws the picker, Revert and the form, plus the one *"brown" is
        not a tint colour* line under the head, with or without a form chosen;
      - nothing is written.
- [x] `config-panel.test.ts`: a `select` whose stored value is not among its
      options shows that value as a disabled, selected extra option, with
      *"brown" is not a tint colour. Choose one to replace it.* under the
      field, the tint field naming its options. The message survives a pane
      rebuild.
- [x] Choosing the first option, here **accent**, removes the key and clears the
      message. A select holding a valid value shows neither.
- [x] The same report appears on another component's hand-broken select (Card
      set's `direction: diagonal`), in the generic words, *"diagonal" is not
      one of the choices. Choose one to replace it.* Nothing is written until a
      choice is made.
- [x] Every form with the switch on: the **Tint** section after **Picture**.
      **Default (green)** names the block's colour. Choosing **Orange** writes
      `Tint: orange` and the swatch turns orange. Choosing **Default** removes
      the line, and the record is byte-identical to before. The section is
      absent with the switch off.
- [x] `Tint: brown`: In play tints in the block's colour and shows the sentence
      under the head, prefixed by the form's name with two on. Every form shows
      the disabled *"brown" (not a tint colour)* option selected, with the
      sentence.
      Nothing is written until a choice is made.
- [x] `Tint: Green` reads as green and is not rewritten by an unrelated edit.
- [x] The head swatch is drawn before the form's name only where `tint` is not
      accent or the switch is on, one per form row with two on. It is
      `aria-hidden`.
- [x] Round trip: a `Tint` entry survives a read and a write of every other
      field untouched. Turning the switch off and editing HP leaves the entry's
      bytes.

**Harness**

- [x] `harness.ts` takes `tint=<colour>` on the forms states to set Wild
      Shape's `tint`. The Wild Shape sample gains `tintPerRecord: true` on its
      tint states alone, so the accent pair shows a layout choosing no tint,
      and a `forms-tint` state where Brown Bear holds `Tint: orange` and a third form
      holds `Tint: brown`. **`harness/theme.css` gains the eight `--color-*`
      values for light and dark**, copied from the default theme, so a clone
      without a calibrated file still draws every colour.
- [x] New shot views, each with an explicit frame: `1400,1500` for the sheet
      views, `380,3000` for the two narrow ones, and `1400,4200` for the two
      editor ones:
      - **one per colour per theme**, `sheet-forms-tint-<colour>` and
        `sheet-forms-tint-<colour>-dark` for red, orange, yellow, green, cyan,
        blue, purple and pink. `sheet-forms-light` and `sheet-forms-dark` are
        the accent pair, re-shot.
      - `sheet-forms-tint-contrast-more` and `-contrast-more-dark`, at yellow,
        the tightest colour.
      - `sheet-forms-tint-forced-colors`, at green.
      - `sheet-forms-tint-two-on`: Brown Bear orange and Wolf green on by hand,
        showing one shared card in accent, the two own-coloured cards, and
        the accent tag naming both.
      - `sheet-forms-tint-library`: Every form, Brown Bear open on its Tint
        section.
      - `sheet-forms-tint-error`: the `brown` form in play, and
        `sheet-forms-tint-error-library`: the same form under Every form, the
        other forms closed.
      - `sheet-forms-tint-layout-error` (`tint=brown`): the whole block
        drawn, Brown Bear in play tinting orange (its own `Tint`), Wolf's
        values in accent when chosen, and the *"brown" is not a tint colour*
        line under the head.
      - `sheet-forms-tint-narrow` (380px), with the head swatch, and
        `sheet-forms-tint-library-narrow` (380px), with the Tint section
        stacking.
      - `editor-stat-block-tint`: the two fields in the layout editor.
      - `editor-stat-block-tint-error`: the Tint dropdown holding the
        disabled `brown`, with the message under it, beside a canvas that
        still draws the block.

      Fresh `npm run harness` then `npm run harness:shot` output goes to the
      design review.
- [x] `npm run lint` (at `--max-warnings 0`), `npm test`, `npm run build`,
      `npm run harness` and `npm run harness:shot` pass. New code follows
      `docs/PATTERNS.md`. `placement-decorations.ts` still imports nothing from
      `obsidian`. No component imports another. `stat-block.ts`'s job sentence
      gains no "and". The Tint section and swatch are small enough to sit beside
      the Picture section; if they are not, they become a painter with its
      sibling allowlist entry and `isolation.test.ts` line.

**The vault fixture** (`~/Developer/sheetsmith-test-vault/`, outside the
repository by `AGENTS.md`'s rule, so the recipe is here)

- [x] `Sheetsmith layouts/Stat block variations.sheetsmith`:
      - the Moon druid's **Wild Shape** gets **Tint** `green` and **Tint per
        record** on;
      - the Werewolf's **Forms** gets **Tint** `purple`, with the switch off;
      - the Familiar (no `exclusive`) gets **Tint** `red`, to show that nothing
        tints without a form in play.
- [x] `Characters/Forms.md`:
      - Brown Bear gains `Tint: orange`;
      - Wolf has no `Tint` entry;
      - a third Wild Shape form, **Giant Badger**, holds `Active: no`, an HP
        entry, one modifier (`armour_class = 10`) and `Tint: brown`.
- [x] What to press, in order:
      1. Choose Brown Bear and see orange boxes and the orange-edged tag. Choose
         Wolf and see green.
      2. Choose Giant Badger and see green boxes plus the "brown" sentence
         under the head.
      3. Under Every form, set Giant Badger to **Yellow**. See `Tint: yellow`
         in markdown view, then choose **Default** and see the line gone.
      4. Switch Obsidian to dark and repeat step 1.
      5. Turn on macOS **Accessibility → Display → Increase contrast** and see
         the fills go and the coloured edges stay.
      6. Set Wolf's `Active: yes` by hand beside Brown Bear's, and see the
         two-on rule from Design.
      7. Open a Werewolf note and see purple, with no Tint section under Every
         form.
      8. Add a field keyed `tint` to Wild Shape in the layout editor and see the
         configuration error.
      9. Turn **Tint per record** off and see Brown Bear green, with its entry
         still in the note.
      10. Close the layout, change Wild Shape's `"tint": "green"` to
          `"tint": "brown"` in the `.sheetsmith` file by hand, and reopen it:
          - the sheet still draws the block, in the accent, with the *"brown" is
            not a tint colour* line under the head;
          - the layout editor's **Tint** shows `brown`, disabled, with the
            message under it;
          - choose **green** and see both go.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through the
build and every round of findings, and no commit carries a `Co-Authored-By`
trailer.

1. `fix: Keep the form tag legible on its own colour`. The neutral chip, the
   edge mix through `--sheetsmith-tint` defaulting to the accent, the
   more-contrast rules, `measure-form-tint.mjs`, and the re-shot accent views.
2. `feat: Carry a form's tint from its push to the box`. `TINT_COLOURS`,
   `ModifierPush.tint`, the line's `tint`, the decoration's tint and its
   several-forms rule, `TINT_ATTRIBUTE`, the per-colour rules and their
   `styles.test.ts` guard, and tests. Nothing sets a tint yet.
3. `fix: Report a layout select holding a value outside its choices`.
   `config-panel.ts`'s select branch (the disabled extra option and
   `showFieldError`), and `config-panel.test.ts`. Nothing is Stat block's.
4. `feat: Let a stat block choose the colour its forms tint`. `tint`, the
   accent fallback for a value outside the list and its line under the head,
   the push's tint, the head swatch, and tests.
5. `feat: Let each form choose its own tint`. `tintPerRecord`, the `Tint`
   entry's read and write, the reserved-key error, the invalid-value line, the
   Every form Tint section, `example` and `sample`, and tests.
6. `test: Show form tints in the harness`. `theme.css`'s named colours, the
   `tint=` query, the samples and the shot views.
7. `docs: Record the form tint colour`. Covers:
   - `SPEC` §4.2's Stat block entry (config, data, sheet view);
   - §4.1's `scopeModifiers` sentence on `tint` beside `inPlay`;
   - in §4.2's Stat block entry, **the stated exception**: a `tint` outside the
     list is reported in the editor and under the head and draws the accent,
     rather than being a configuration error that replaces the block, because a
     colour is cosmetic. §7 notes that a layout select reports a stored value
     outside its choices;
   - §8's tint bullet (the colour, the chip, the several-forms rule), and §2's
     **In play** line where it says "tinted";
   - `docs/UI.md` §1 (the named colours and the mix toward `--text-normal`,
     with their scope and argument), §6's more-contrast list, and §9's tint and
     stat block rows;
   - `docs/features/stat-block-zones.md`'s "Deliberately not doing" line on a
     per-form tint colour, which this closes, noted where `/land-it` keeps such
     notes;
   - the BACKLOG rows this opens.

## Release notes

These are items for `/release` to carry, recorded here so they are not
re-derived:

- **Contrast fix: the form tag is redrawn on every sheet**, including layouts
  that choose no colour.
  - It was white on the accent, which measured 3.43:1 in the default light
    theme, under the 4.5:1 text needs.
  - It is now the form's colour at 85%, written in black or white, whichever
    the sheet measures reading better on it, at 4.78:1 or more in the default
    themes.
  - The box outline darkens slightly, so it clears 3:1 on every colour.
- **New:** a Stat block can tint its forms in one of the theme's named colours,
  and each form can choose its own (`tint`, `tintPerRecord`).
- **The layout editor now reports a dropdown whose stored value is not one of
  its choices**, for every component, instead of silently showing the first
  choice.

## Deliberately not doing

- **Hex, `rgb()` or any custom colour, and brown.** Only the theme's named
  colours, on `docs/UI.md` §1. A value outside the list is an error, never a
  nearest match.
- **A swatch in the layout editor's dropdown.** The editor's select is shared by
  every component and draws words. A swatch there is a config-panel feature for
  every select, not this one.
- **A tint for anything but a form in play**: items, conditions, typed one-offs
  and a companion block without `exclusive` keep the shape-only mark.
- **`dimWhen`**, still deferred, and still the second decoration kind the pass
  is built for.
- **Colour on the uses rings, the picker, a closed form's line in Every form, or
  the Stat block itself** (question 5).
- **A per-placement or per-component colour** (a layout choosing what colour a
  given Card is tinted in). The colour belongs to the form, not to what it
  changes.
- **The colour reaching formulas.** `Tint` publishes nothing.
- **Reading a lower-case `tint:` key.** Fence keys are read as written, as every
  field's are. Only the collision check ignores case.
- **A measured contrast guarantee for community themes.** The tag holds through
  the theme's own text and page pair, and the edges are theme-relative, but
  only the default theme is measured.
- **A distinct look for "several forms"** besides the accent. That state is
  already a reported error, and the tag names both forms.
