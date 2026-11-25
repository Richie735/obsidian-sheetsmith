# A select names a long value

Status: shipped
Board card: A `<select>` whose chosen option is longer than its box reads as
truncated, not damaged, in WebKit as well as Chromium, settled once for every
select family the plugin styles.

## Model question

None. This changes how a control's face is drawn. It publishes nothing, stores
nothing, and touches no component contract member.

## What it does

A select whose chosen value is longer than its box ends in an ellipsis on every
engine, iOS included. Today WebKit cuts it mid-letter: the modifier form's
**Value** reads *Abilities · S1* where the text is *Abilities · ST…*. The
select's menu, its accessible name and value, its focus ring and its chevron do
not change. Only the line of text drawn on its face does.

## Re-measure (the reported case today)

**Short labels did not clear it, and cannot.** `published-name-labels.md`'s
width table gives the target picker (**Value** on the sheet's form and the
editor's **Changes**) the **full** width, a breadcrumb with `column` last. So the
Value select never reads a short label. Whether an author writes one makes no
difference to it.

Measured in Chromium (`npm run harness`, then a CDP script over the populated
sample's typed part, mixed row). Label widths come from `canvas.measureText` in
the select's own computed font:

| Condition | Select box | Text box (minus padding) | Font |
| --- | --- | --- | --- |
| 380, phone staging | 201px | 153px | 15px / 500 |
| 380, unstaged | 208px | 166px | 13px |
| 1400 | 250px | 208px | 13px |

WebKit draws the same select about 20px narrower, so the phone text box is
about 133px there.

The longest option each bundled layout offers, from `publishedTargets`,
`stateTargets`, `bufferTargets` and `choiceTargets` over the walk:

| Layout | Longest option | Width at the phone font |
| --- | --- | --- |
| Starter 5e | *Saving throws · Constitution · Prof* (35 chars) | 238px |
| Starter PF2e | *Saves and Perception · Perception · Rank* (40) | 286px |
| Starter Forged in the Dark | *Healing · Length* (16) | 114px |
| Forms sample (`state=forms`) | *Saving throws · Constitution · Prof* (35) | 238px |
| Populated sample | *Abilities, as a roster · Persuasion · Training* | 296px |

The reported option today reads *Abilities · Strength*, which is 129px and fits
Chromium's 153px. In WebKit's roughly 133px it sits on the edge. *Abilities ·
Constitution* is 154px and clips in **both** engines. Every 5e and PF2e
column-qualified option clips by 80px or more. So the defect is live in the 5e
starter and in the forms sample at phone width, and it is a full-width ruling,
not an authoring gap. No label rule can reach it.

## Smallest version

A face on the three families the brief names: the panel select, the card
dropdown and the editor's detail-field selects. It closes BACKLOG UI row 142. It
drops the three menu-wrapper families (Record set's level menu, the Stat block's
in-play menu, the Table and Roster cell menu). Those clip with no mark **in every
engine**, because they declare no `text-overflow` at all. They would get a
BACKLOG row instead of the fix. Not taken: the owner approved all five
families.

## The ruling

**The plugin draws the select's face itself.** A select shows its chosen value in
a sibling span (the *face*) that the plugin ellipsises. The select's own text goes
transparent beneath it. This is the stacking `docs/UI.md` §9 already names for a
field under a link layer (`.sheetsmith-table-linked`,
`.sheetsmith-record-linked`), applied to a select.

The other two ways out, and why each fails as the answer:

- **A width or label rule that stops the clip.** The picker's labels are full
  width by an agreed ruling, an author's names are unbounded, and the box at 380
  is fixed by the form's grid. `field-sizing: content` is out for a field that
  holds still (`UI.md` §11, the fixed-box ruling), and it only moves the clip to
  the panel's edge anyway. No rule makes *Saves and Perception · Perception ·
  Rank* fit 133px.
- **A reveal elsewhere on the row** (`revealWhenTruncated`, or a line under the
  select). The face is still cut mid-letter, so `UI.md` §12 still fails at the
  control itself. A reveal is recovery, and recovery only helps a face that
  already reads as truncated. It also cannot see a select's clip:
  `scrollWidth === clientWidth` on a select however long its option is
  (`editor/select-title.ts`). The face fixes that as a side effect, since a span
  measures. Whether a select should then reveal is UI row 105's question. This
  spec does not take it.

What the face is not: a control appearance. The select keeps the app's
`dropdown` and every family's own box, border, fill and chevron (`UI.md` §1).
The face is text, in the colour and size the family already gives the select.

**Every engine draws the same thing.** The face's ellipsis is ordinary
`text-overflow` on a block span, which WebKit honours. Nothing branches on the
engine.

## Design

### The face

`src/ui/select-face.ts` exports one function. It knows nothing of components,
which is `PATTERNS` §2's rule for `ui/`.

- `drawSelectFace(select)` wraps the select in place in a
  `span.sheetsmith-select-stack`. The stack takes the select's position in its
  parent. It appends `span.sheetsmith-select-face` with `aria-hidden="true"` and
  adds `sheetsmith-select-faced` to the select.
- The face's text is `select.options[select.selectedIndex]?.text ?? ''`. It is
  written at the call and again a microtask after every `change`, so it reads
  the select once every listener has run, whatever order they were added in. The function returns a
  `refresh()` for a caller that sets `value` in code after the call. A caller
  that rebuilds on commit (the modifier form, the editor) simply calls
  `drawSelectFace` after it sets `value`, as `titleChosen` is called today.
- It is called once per select and never re-wraps, which is safe across the
  pane's rebuilds because each rebuild makes a new select.

### Layout: the select sizes the stack, the face sizes nothing

- The stack is `position: relative` and takes over the select's sizing role in
  its parent. The family declarations that place the select (`flex`, `width`,
  `min-width`, `max-width`) move from the select onto the family's stack, by
  selector list. The select inside takes `width: 100%`.
- For the card dropdown, the stack is content-sized as the select was. The face
  is `position: absolute; inset: 0`, so it adds no width and a long chosen
  option cannot widen the card.
- The face uses the select's own text geometry. Its `padding-inline` is the
  family's own: for an app `dropdown`, that is Obsidian's
  `--dropdown-padding-start` and `--dropdown-padding-end`. These are the same
  variables the select reads, so the phone's `16px` and `32px` follow for free.
  For the card dropdown it is `var(--size-2-1)`, centred. The face takes the
  same `font-size`, `font-weight`, `letter-spacing` and `color` through the
  **same selector list** that sets them on the select, never a copied rule
  (`PATTERNS`, the `sheet.css` practice).
- The text is vertically centred on the select's line, on one line
  (`white-space: pre`), with `overflow: hidden` and `text-overflow: ellipsis`.
  The chevron's room is kept, because the end padding is the one the select
  already reserves for it.
- `.sheetsmith-select-stack > .sheetsmith-select-faced` sets both `color:
  transparent` and `-webkit-text-fill-color: transparent`. Both are needed
  because iOS WebKit can paint a form control's text from the fill colour and
  ignore `color`; the harness already reads that property for this reason. The
  rule is written to outrank each family's colour rule, the disabled panel
  select included. Opaque text under a face would double-draw.

### Interaction (`UI.md` §6, §7)

- The face is `pointer-events: none`. A press, a tap or a long press lands on the
  select, and the native menu opens as it does today. No new gesture.
- Focus stays on the select. Each family's focus mark is an outline or a shadow
  outside the box, so the face, which sits inside the box, does not cover it.
- A screen reader hears the select's name and its chosen option, as now. The face
  is `aria-hidden`, so nothing is said twice.
- The editor's `titleChosen` stays as it is, as the desktop recovery. The card
  dropdown's recovery stays its menu.

### States

- **Empty.** No chosen text (an empty card dropdown, *Choose a value* not yet
  prepended), so the face is empty and the select draws as now. The tall empty
  pill on iOS is out of scope (below).
- **Read-only.** The disabled panel select (a part naming a layout modifier) draws
  as text with no box. The face follows the same rule, so the value still sits at
  the label's left edge.
- **Error.** A stray or held option (*… (reads no modifier)*, *… (shows no
  options)*, `heldRefusal`) is just the chosen option's text. The face shows it
  and ellipsises it like any other. `aria-invalid` stays on the select.
- **Modifier-chosen card dropdown.** The dotted rule is the select's
  `border-bottom`, so it still draws under the face.
- **Forced colors.** The face goes (`display: none`) and the select's own text
  returns. This is the departure the link layer takes, and for the same reason:
  forced colors repaints `transparent` text, which would double-draw. The
  forced-colors block restores both properties on the select, `color` and
  `-webkit-text-fill-color`, so neither one leaves it blank. The
  families keep their `text-overflow: ellipsis` for that case, and the comments
  on those three rules are rewritten to say so. They stop claiming to be the
  answer.

### Which families

| Family | Rule | Built in | Gets the face |
| --- | --- | --- | --- |
| Panel select | `shared.css` `.sheetsmith-panel .sheetsmith-panel-select` | `modifier-form.ts` `select()` | yes: the reported defect |
| Card dropdown | `sheet.css` `.sheetsmith-view .sheetsmith-card-select` | `card-face.ts` | yes |
| Editor detail-field selects | `editor.css` `.sheetsmith-detail-field > select` | `promoted-fields-field.ts`, `modifier-definitions-field.ts`, `zones-field.ts`, `list-fields.ts` | yes, closing UI row 142 |
| Record menu, Stat block in-play menu | `sheet.css` `.sheetsmith-record-select`, `-stat-block-select` | `record-set.ts`, `stat-block.ts` | yes: no `text-overflow` today, so it clips with no mark in every engine |
| Table and Roster cell menu | `sheet.css` `.sheetsmith-table-select` | `roster.ts`, `table.ts` | yes, for the same reason |
| Group chips **Add a group** | `shared.css` `.sheetsmith-group-chips-add` | `group-chips.ts` | no: its face is always the fixed *Add a group* |
| Stat block tint | `.sheetsmith-stat-block-tint-choice` | `stat-block.ts` | no: fixed colour words from `en.ts`, bounded |
| Reset rows' **Trigger**, **Action**, **Acts on** | `Setting.addDropdown`, Obsidian's `.setting-item-control select` | `reset-field.ts` | no: Settings-API chrome filling the row; a long trigger or column name can still clip, recorded in `docs/BACKLOG.md` § UI |

The brief names the first three. The owner approved all five: the record, Stat
block and cell menus meet "every select family the plugin styles", and each
already has a wrapper, so the face is added inside it.

`.sheetsmith-detail-field > select` becomes `> .sheetsmith-select-stack`, with
the select inside. Every selector and test query that walks `> select` moves
with it. The three hand-rolled `list-fields.ts` selects (UI row 102) get the face
like the rest. Its padding is `--dropdown-padding-end`, the same 2.4em they
already reserve, so the row's question stays open and nothing about it changes.

### Harness

- A harness state `long-values` holds a name whose full label is the longest
  any bundled starter produces: *Saves and Perception · Perception · Rank*, the
  level of a respelled skills Table's Perception row. A Table row carries a
  modifier typed at it, a Card's dropdown has it as the chosen option, and a
  layout definition enrolled ahead of the layout's own (`LONG_VALUE_DEFINITIONS`)
  has it as its **Changes**. The promoted field's **Value** picker offers
  published names and never a level, so it holds the longest name it does offer,
  *Saves and Perception · Perception · stored*. The state also lengthens one
  level each on the Recharging features record menu and the Languages cell menu.
  Those menus size to their content, so the longer levels still fit and the
  pictures show them whole; their ellipsis is proven by the measure script's
  squeeze (below). Every other state is unchanged.
- Shot views at 380 under phone staging and at 1400, in light and dark:
  `select-long-value-form-*` (the panel open on that row's typed part),
  `select-long-value-card-*`, and `select-long-value-editor-*` (the layout's own
  panel, `open=::sheet::`, which holds both the promoted field and the
  definition).
- `harness/measure-select-face.mjs` runs at 380 phone, at 360 phone (Chromium
  20px narrower, standing in for WebKit's narrower draw), and at 1400. For each
  family it checks five things: the face's text equals the chosen option's; the
  face's `scrollWidth > clientWidth` with computed `text-overflow: ellipsis`; the
  face's right edge is at or left of the select's content box; the select's
  computed `color` and `-webkit-text-fill-color` are both transparent; and the stack's box equals what the select's
  box was before the face (the face adds no width). It then sets `text-overflow:
  clip` on every select, which is what WebKit draws, and checks the face is
  unchanged. It exits non-zero on any failure.
- **The overflow check is on the real layout only where a family's box is
  fixed.** The record, Stat block and cell menus size to their content, so a
  long value widens the menu instead of clipping it, and the real layout never
  overflows there. For those three the script squeezes each family's longest
  face into a 72px stack and checks it overflows and still ends inside the
  select's text box. On the real layout it checks only that a face overflows
  exactly when its text is wider than its box.

## Config fields

None.

## Data and file model

Nothing stored, nothing read. Notes and layouts are untouched (Constraints 3 and
4 not engaged).

## Acceptance criteria

- [x] `src/ui/select-face.test.ts`: the face's text equals the chosen option's
      text after the call, after a `change`, and after `refresh()` following a
      code-set `value`. It is empty for an empty choice. The face carries
      `aria-hidden="true"`, and the select keeps its `aria-label` and gains no
      `title`.
- [x] Each family's own test, over a chosen option long enough to clip, finds a
      `.sheetsmith-select-face` beside the select holding that option's text.
      That covers the modifier form's Value, the card dropdown, the promoted
      field's Value, a definition's **Changes**, and the record, Stat block and
      cell menus.
- [x] `node harness/measure-select-face.mjs` exits 0. It prints, per family and
      width, the face width, the select width, and whether the text overflows.
- [x] In the `select-long-value-form-*` and `-card-*` shots at 380 and 1400,
      and the `-editor-*` shots at 380, both themes, every staged select ends
      its value in `…` short of its chevron. At 1400 the editor gives both its
      staged selects room, so they read whole there, as the measure script
      expects. No glyph is cut, and no text is doubled.
- [x] The findings ledger at the land stop lists every CSS selector and test
      query the wrapper moved: each `> select` (or other selector that reached
      the select through its old parent) beside its replacement.
- [x] Every existing harness shot is pixel-identical or differs only inside a
      select's face. This is checked against that list: every view drawing a
      moved selector is named, and its diff is shown at the land stop over
      `harness/shots/`.
- [x] A forced-colors shot of `select-long-value-form` shows the select's own
      text and no face.
- [x] `docs/BACKLOG.md` UI row 142 is deleted. Rows 102, 105 and 112 are
      unchanged. `src/backlog.test.ts` passes.
- [x] `docs/UI.md` §9 gains a vocabulary row: *A select's chosen value is drawn
      in a face the plugin ellipsises*, naming `ui/select-face.ts` and the
      forced-colors departure.
- [x] `npm run lint`, `npm test` and `npm run build` pass.

## iOS Simulator hand checks

No instrument here covers WebKit, so the owner checks these by hand in the
throwaway vault, on an iPhone simulator in portrait.

1. **`Characters/Harness populated.md`.** Open the modifier glyph on the
   *item +1 (changes nothing)* row, then the typed part. Set **Value** to
   *Abilities · Constitution*, then *Abilities, as a roster · Persuasion ·
   Training*. Each ends in `…` before the chevron, with no letter cut. Then do
   the same on a part that names a layout modifier (read-only), to check the
   value is ellipsised as plain text.
2. **`Characters/Forms.md`** (Stat block forms), same form. Set **Value** to
   *Saving throws · Constitution · Prof*. It ends in `…`.
3. **A character on `Starter PF2e`.** **Value** set to *Saves and Perception ·
   Perception · Rank*.
4. **`Characters/Cards.md`.** The `Dropdown & select` group gains a Card whose
   dropdown has an option named *Sleight of hand expertise (double proficiency)*
   (added to `Card variations.sheetsmith` by this feature; the owner approved
   this fixture edit as specified). Choose it. The card
   reads it ellipsised, and the menu still lists it whole.
5. **The layout editor on `Harness populated.sheetsmith`**, at phone width, on
   the layout's own panel. A promoted field's **Value** set to the two options row 142 names,
   the one beginning *Abilities · STR ·* and the one beginning *Inventory ·
   Weig*. Then the Modifiers list's **Changes** set to its longest option. Each
   ends in `…`.
6. On any of the above, tap the select. The native picker opens. Choose a short
   option, and the face shows it whole with no ellipsis.

## Commit boundaries

1. `feat: Draw a select's chosen value in a face of its own`. This commit holds
   `ui/select-face.ts`, its test, and the stack and face base rules in
   `src/styles/shared.css`.
2. `fix: Ellipsise the modifier form's long values on every engine`. This commit
   holds `modifier-form.ts` and the panel family's `shared.css` lists.
3. `fix: Ellipsise the sheet's dropdowns and menus on every engine`. This commit
   holds `card-face.ts`, `record-set.ts`, `stat-block.ts`, `roster.ts` and
   `table.ts`, with their `sheet.css` lists and tests.
4. `fix: Ellipsise the layout editor's selects on every engine`. This commit
   holds the four editor files, `editor.css`, the test queries that moved, and
   the deletion of BACKLOG UI row 142.
5. `test: Stage the longest value at phone width`. This commit holds the
   `long-values` harness state, the shot views and
   `harness/measure-select-face.mjs`.
6. `docs: Record the select face`. This commit holds the `docs/UI.md` §9 row,
   the rewritten `text-overflow` comments if they were not carried by commits 2
   to 4, and this spec's status.

`styles.css` is rebuilt in each commit that changes `src/styles/`.

## Deliberately not doing

- **UI row 102**: the three hand-rolled editor selects reserving 2.4em for a
  chevron nothing draws. They get the face, and their padding is unchanged.
- **UI row 105**: whether the pane's text fields reveal. This covers text inputs,
  and no reveal is added here. The face makes a select's truncation measurable,
  which that row may want to cite.
- **UI row 112**: the chevron that does not show in forced colors.
- **Passport chips sized by `input.size`** (`passport.ts` 763, 867, 1020), and
  **the empty card dropdown drawing as a tall blank pill on iOS**. These are
  WebKit gaps of their own.
- **A `title` on the sheet's selects.** Recovery stays per family as it is today.
- **Short labels in the picker.** The full-width ruling stands.
