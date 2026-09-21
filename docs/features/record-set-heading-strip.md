# A strip of field names over a Record set

Status: shipped
Board card: A Record set draws each record as one summary line with no names over
its fields, so a reader cannot tell which control is which: a `level` or `toggle`
field is a bare ring whose name reaches a reader only through a tooltip and a long
press. Let a layout ask for a visible heading strip over the fields.

## Model question

**No open bullet in `docs/SPEC.md` §13 blocks this, and the one it touches is a
decision recorded in §4.2 rather than a question.** §4.2's Record set entry says
"**There is no heading strip over the fields**, and that is a decision", and
`docs/features/record-set.md` says the same. Nothing in §13 asks whether that
decision should stand, so this feature adds the question and settles it. **The
entry is written by `/land-it` with its `Resolved:` line when this lands, not
here**: it is not resolved until it is built. Its text, so the landing has it:

> **Whether a Record set may name its fields over the list.** §4.2 decided there
> is no heading strip, on three reasons, and a reader met the consequence twice:
> a `level` or `toggle` field draws a bare ring whose name is a tooltip and a long
> press, which names nothing on screen.

### The answer

**Amend the decision, do not reverse it.** The strip is **opt-in per component and
off by default**, so every existing layout draws exactly what it drew, and the
stance that a Record set is deliberately not a table is untouched. The owner has
raised this twice. The first time they accepted the tooltip and the long press as
the answer; the second time they asked for a real header. That is a judgement
weighed against the need, and this document records how each of the three reasons
in §4.2 fares against it.

**"A header row would claim a tabular reading of a thing that is deliberately not
a table."** Not overturned; weighed. A record still has a chevron, a name and a
body, and none of them gets a heading. A strip of field names labels controls
without turning a record into a row, and the strip is opted into, so a layout that
wants the pure reading keeps it. The claim is also kept honest for assistive tech:
the strip is not exposed as a table, a row or a column header (see **Assistive
technology** below), so the tabular reading is a sighted one only.

**"A name per field is cheaper than an aligned header."** The first half is
overturned for `level` and `toggle`, and only for them. §4.2's own answer for
those was "the ring alone", with the name on hover. The layouts on the sheets that
ship show what that names on screen, which is nothing:

| Layout | Record set | Fields | What a reader sees |
| --- | --- | --- | --- |
| Spellbook | Spells | `Prepared` (level, three named levels), `Level` (number), `Active` (toggle), `Modifiers` | `Shield`, ring, `1`, ring, glyph |
| Items | Items | `Qty`, `Weight` (numbers), `Worn`, `Attuned` (toggles), `Modifiers` | two identical rings beside each other |
| Class features, Species traits, Feats | five Record sets on one sheet | `Recharges` (level), `Uses` (number, per-record ceiling), `Active` (level), `Modifiers` | ring, `Uses 1 / 3`, ring, glyph, five times |

A `number` field already names itself beside its value; the two-ring rows are the
case where the reader cannot tell which is worn and which is attuned.

**"Rows whose heights differ."** Mostly a misdiagnosis. A strip aligns *columns*,
not rows, so an open body does not move it. The two real obstacles are named here
because the design is built to remove them:

1. **Each summary line is its own grid.** The name track is capped
   (`--sheetsmith-record-name`, 13em) and the fields sit in an `auto` track, so a
   field's x-position follows the content of its own line: `Uses 1 / 3` against
   `Uses 1`, `+12` against `+1` in a computed field. No strip can sit over
   positions that move per record. The fields therefore go on **column tracks
   shared across every record** (see **Design**).
2. **Below a threshold the fields wrap to a second line**, where no strip can
   align. At that width **the strip drops and the per-field names remain.**

### What the contract has to grow: nothing

The strip is a config key on one component. `read`, `write`, `formulaFields`,
`scopeRows`, `scopeModifiers` and `applyReset` are untouched, and nothing outside
`record-set.ts` and its stylesheet learns it exists (`CLAUDE.md`: adding or
extending a component touches neither the renderer, the parser nor the layout
editor). The layout editor draws the new key from `configFields` like any other.

### What it publishes, stores, and does to existing notes

- **Publishes:** nothing. A heading is display.
- **Stores:** one layout key, `fieldHeadings`. **The character note is not
  touched**: no new key, no new section, no change to the fence (Constraint 3 is
  not in play, since no parser changes; the layout side is round-tripped, see
  **Data and file model**).
- **Existing notes and layouts (Constraint 4):** a layout without the key reads as
  off and draws what it drew. A note is never touched by turning the strip on or
  off, so no character data can be lost.

### Decisions the settled answer leaves open, and how they are taken

**A new key, not `hideHeading`.** Table's `hideHeading` has the polarity "shown
unless hidden". A Record set's strip is "hidden unless asked for", so reusing the
name would invert its meaning on a hand-edited layout that carries one across from
a Table. `RecordField.hideHeading` stays declared, **ignored**, and round-trips, on
`secondary`'s rule. It is deliberately not honoured now that a strip exists: a
strip with a hole over a ring would leave exactly the unnamed ring this feature
exists to name, and a hand-edited layout carrying a Table's `hideHeading` would
silently defeat it.

**The strip does not make the ring's tooltip redundant, so `nameOnScreen` stays
`false`.** `docs/UI.md` §6 says a tooltip repeating legible text is noise, and the
condition it rests on is that the control's name is *on screen beside it*.
`bindRingControl`'s `nameOnScreen` is a fact about the surface, answered once when
the ring is drawn (`docs/features/two-state-control-module.md`). **Here the fact
is not knowable at draw time**: whether the strip is showing depends on the list's
width, which only the stylesheet sees, and the same DOM serves both regimes.
Answering `true` would remove the tooltip *and the long-press route to it* in the
narrow regime, which is exactly where no name is on screen. Answering `false`
costs a tooltip that, on a wide headed list, restates the heading, and that cost
is smaller than it looks: the tooltip reads `Shield Prepared`, so it names the
*record* whose control this is as well, which no heading can. The rule needs no
exception for this, since the question was always "is the name on screen", and the
honest answer for a width-dependent strip is "not always".

**Table derives `nameOnScreen` from `hideHeading` and this component does not
derive it from the flag**, for the same reason: Table's heading is present at every
width, so its fact is decidable at draw time. A Record set's is not.

**The `number` field's inline name stays in the DOM and is hidden by the
stylesheet in the wide headed regime.** The strip names the column, so the same
word beside every number would be a second sighting of one label. In the narrow
regime the strip is gone and the inline name is the only name, so it must return;
a name that is present in the DOM and toggled by the same query as the strip
cannot drift out of step with it, where a name the component decided to draw or
omit at render time could only be right at one width. The input keeps its own
`aria-label`, so hiding the span removes nothing from assistive tech.

## What it does

A Record set can show a strip of field names over its records, aligned with the
fields underneath, so a ring or a toggle is named on screen. It is off unless the
layout asks for it, and it appears only where the list is wide enough to hold it;
narrower, each field keeps its own name and the list draws exactly as it did.

## Smallest version

The `fieldHeadings` key, the strip, the shared tracks and the width-gated drop.
**It gives up nothing the owner asked for**, and the two things that could be cut if
they proved unworkable are named so a reviewer knows what is a cut and what is a
gap: the strip staying at the top edge while the list scrolls (it would scroll away
with the first record, which is the same problem again for a long list), and a
drop threshold per field count (one threshold, sized for the widest case, would
drop the strip earlier than a two-field list needs). Neither is expected to be
needed: sticky and per-count thresholds are both verified below.

## Design

### At a glance

One strip at the top of the list, in the same quiet type as the abbreviation a
Card set wears, one word over each field, each word centred over its control.
Nothing over the chevron, the name or the delete glyph: the name is what the record
is, and a heading over it would be Table's `Name` column, which is the tabular
reading the component declines. A reader takes "which ring is which" without
hovering anything, and the records read as before: chevron, name, fields, delete.

### The three regimes

| | Strip | A `number` field's name | A ring | Fields |
| --- | --- | --- | --- | --- |
| **Off** (the default) | none | beside the value, as today | tooltip and long press, as today | today's layout, byte for byte |
| **On, wide** | one strip over the list | hidden, the strip names it | tooltip and long press, unchanged | on shared column tracks |
| **On, narrow** | none | beside the value, as today | tooltip and long press, unchanged | today's layout, byte for byte |

**On, narrow is the Off row.** The strip's rules live entirely inside the wide
query, so leaving the query leaves the feature, and there is no third geometry to
photograph.

### Geometry

**The list is one grid; records and their summary lines are subgrids of it.** Verified
on a throwaway page in Chrome before this was written, because the whole design
rests on it: with `grid-template-columns: subgrid` on the record, the summary and
the fields wrapper, every record's fields and the strip's headings land on
identical x-centres regardless of content (`1` against `1 / 3`, `+1` against `+12`).

- Tracks, in order: the chevron (`auto`), the name (`minmax(0, var(--sheetsmith-record-name, 13em))`), one `auto` track per declared field, the slack (`1fr`), the delete (`auto`). **The first two and the last are today's**, so the name and the delete glyph sit where they sit unheaded.
- The field count reaches the stylesheet as a custom property the component sets on the block (`--sheetsmith-record-fields`, the way `--sheetsmith-rows` already is), read by `repeat(var(--sheetsmith-record-fields), auto)`.
- The fields wrapper spans those tracks as its own subgrid and keeps today's `gap: var(--size-4-5)` as its own column gap, so two fields' controls keep the clearance `docs/UI.md`'s target-size rule set.
- **Cells are centred in their track**, and the heading is centred over the same track. A heading wider than its control (`Modifiers` over a glyph) sets the track's width, as it did in Table before `hideHeading`; the author's answer is a shorter `name` on the field, and the field's description says so.
- A record whose fence will not read draws no fields, so its field tracks are empty in that record and every other record still aligns. Its name and delete stay where they are.
- An open body and the problem line span every track (`grid-column: 1 / -1`), so opening a record moves the records below it and never a column. The add control spans all tracks.

**As built, the measurement overturned the premise below.** The build's first step measured which container the 320px rule answers to: it is `.sheetsmith-record-set` itself, which already declares `container-type: inline-size`, so the rule already measures the list's own width at every width (346px at `width=380`; 157 / 280 / 198px at `width=520`). No container is added to the box; the block is only *named*, and only on a headed list. The paragraph below is kept as the design as approved, and the corrections are recorded in the rule's comment in `src/styles/sheet.css`.

**The strip's container.** The wide rules are gated on a container query, and a
container needs something to measure. `.sheetsmith-record-set-box` gets
`container-type: inline-size` and a name **only on a headed list** (the block
carries a `sheetsmith-record-set-headed` class). This is deliberate:

- The existing 320px rule in `src/styles/sheet.css` is an *unnamed* `@container`
  query, so it matches the nearest ancestor container of any name. On an unheaded
  list nothing changes, since no container is added, and every existing layout is
  unaffected. **On a headed list the same rule would measure the list**, which is
  what its own comment says it does ("on the list's own width rather than the
  sheet's"); reading the stylesheet, no container between the list and the sheet
  gives it that today, so it measures the sheet or an enclosing group. The build's
  first step is to measure which (the harness at `width=380` and `width=520`
  answers it) and record the result in the rule's comment. **This feature does not
  fix that for unheaded lists**, and the adjacent backlog row about field wrapping
  stays open for them; it does mean a headed list is the first to get the intended
  reading.
- The strip's threshold is always above the 320px rule's, by construction (below),
  so a headed list never has the strip and the narrow stacking at once.

**The threshold, keyed on the field count.** A strip over five fields needs more
room than one over two, and a single fixed number is wrong at one end or the other.
The component stamps `sheetsmith-record-set-fields-N` (N clamped to 1..8) beside
`--sheetsmith-record-fields`, and the stylesheet carries one `@container` block per
N, the sheet's own pattern for this (`.sheetsmith-cols-N`, `styles.test.ts` holding
each threshold to its formula). The formula is `base + N x step` **in `em`**, so the
strip drops sooner as the vault's text size grows, where a `px` threshold would let
a larger type overflow a list that used to fit. **As built, and measured: `14.5em + 6em x N`** (the starting values, `18em + 4.5em x N`, failed from six fields; the derivation is in `src/styles/sheet.css` and `styles.test.ts`). That
puts one field at 22.5em, above the 320px rule at any text size the harness
photographs. The constraint is the behaviour, not the numbers: **no width at which
the strip is drawn and a record's fields wrap, clip, or leave the name track under
six ems; and no width at which a `number` field has neither its own name nor a
strip over it.** A list with more than eight fields uses the eight-field threshold,
which is a residue: such a list already wraps at any width today.

**Where the rules live.** Base rules are today's, unchanged. A single block,

`@supports (grid-template-columns: subgrid) { @container <name> (min-width: <threshold>) { ... } }`

holds everything the feature adds: the grid and subgrids, the strip's display, the
hidden abbreviations. An engine without subgrid gets the narrow regime at every
width, which is today's list, so it degrades to the current behaviour and not to a
broken one. `minAppVersion` is 1.9.0 and the Chrome that ships inside it has
subgrid; the fallback exists for the platform WebViews, not for desktop.

### The strip

- **DOM.** One element, the first child of the list, drawn only when the flag is on, the list has at least one record whose fence read, and the list has at least one field. One child per declared field, in declared order, text `fieldLabel(field)` (the field's `name`, else its `key`), the same word the record's own accessible name uses.
- **Clothes.** The shared secondary type, `.sheetsmith-card-abbreviation`, with the same muted-colour override a record's field name already wears (`--text-muted`, measured 6.41:1 light and 7.50:1 dark against the box fill, where `--text-faint` measured 2.20:1). **Borrowed, not copied**: `docs/UI.md` §9's row for secondary text gains "a Record set's strip", and no `.sheetsmith-record-heading-*` lookalike is written. **Not Table's `thead` clothes.** A Table's header is `--font-smallest`, medium weight, uppercase, tracked and muted; the strip is the Card abbreviation's rank — about 10.2px, regular weight, mixed case, tracked and muted (`docs/UI.md` §9). They share the colour and the tracking idea and differ in size, weight and case, so a Table and a headed Record set on one sheet read as *related* rather than as one vocabulary. Whether the strip should take Table's header clothes instead is the owner's call at the land stop, and nothing here decides it.
- **Separation.** A hairline under it in `--background-modifier-border`, the box's own border colour, and under `prefers-contrast: more` in `--text-muted` as the box's is.
- **Scrolling: sticky, deliberately.** The list scrolls inside a box that never grows (`docs/UI.md` §9), so a long list scrolls its labels away with the first records and leaves every ring unnamed again, which is the defect. The strip therefore stays at the top edge and records scroll under it. Verified, and two traps found doing it, both of which the build must not walk into:
  - **A sticky grid item is confined to its grid area**, so a strip in row 1 cannot follow the scroll. The arrangement that works is a list with two explicit rows: row 1 the strip's own height, row 2 a wrapper holding the records and the add control; the strip placed `grid-row: 1 / -1` with `align-self: start`, so its area is the whole list, and it sticks. Its height is a declared token so row 1 reserves exactly its own space.
  - **`top: 0` sticks at the list's padding edge, not its border edge**, so with the list's own padding a band above the strip shows records scrolling past. The strip's top is offset by the padding (or the padding moves to the wrapper), and the strip is opaque, in the box's fill.
- **Keyboard.** `scroll-padding-top` on the list equals the strip's height, so a control focused by keyboard is scrolled clear of the strip and never obscured by it (WCAG 2.4.11).
- **Inert.** The strip is not focusable, not pressable, does not sort, and has no hover state. It is a label. No new gesture.

### Assistive technology

**The strip is `aria-hidden="true"` and carries no table roles.** Every control
already announces its record and its field (`aria-label` is `${record} ${field}`
for a ring, the input and the modifier button; a computed value carries the same
in a visually hidden span), so a strip read aloud would be a second sighting of
names each control says, with no relationship to say which record it belongs to.
A `role="row"` or `columnheader` would hand assistive tech the tabular reading
this component declines. **Label in Name (WCAG 2.5.3) holds**: each visible
heading's text is contained in the accessible name of the control beneath it, so
voice control by the word on screen works. This is a test, below.

### Empty and error states

- **No records:** no strip. It would label nothing, and an empty list is a box with its add control. The strip appears with the first record and goes with the last.
- **Every record's fence is unreadable:** no strip, for the same reason.
- **A configuration this component refuses:** the error draws instead of the list, as it does now, and no strip.
- **`fields` empty:** no strip, and no field tracks.
- **A field the note holds under a key the layout no longer declares:** not a track and not a heading, as it is not drawn today.
- **Off, or narrow:** today.

### Reuse

| Need | Reused | Not written |
| --- | --- | --- |
| Heading type | `.sheetsmith-card-abbreviation` (`docs/UI.md` §9, secondary text) | a strip-specific type rule |
| Boundary | `--background-modifier-border`, and the box's `prefers-contrast` rule | a border of the strip's own |
| Field controls | every existing one, unchanged | any change to a ring, a number field or the modifier glyph |
| Count-keyed thresholds | the `.sheetsmith-cols-N` precedent and its `styles.test.ts` guard | a JS width observer, which nothing in the plugin uses |
| Ring name and long press | `bindRingControl`, unchanged | a second naming route |

### Layout editor

`configFields` gains one boolean in the **Appearance** group, beside `hideLabel`
(see **Config fields**). Three consequences in the editor:

- The Record set's `fields` list keeps withholding the per-field **Hide heading**
  control (`columnOptions.hideHeading: false`). Its comment changes: it used to say
  no strip exists for one to be hidden from, and now says the strip is the
  component's, a per-field hide is not offered because it would leave a ring unnamed,
  and the key is still read and still round-trips.
- The list's `heading: 'Name'` comment changes from "not a heading, since none is
  drawn, but the field's own name beside its value" to what it is now: the word
  shown beside a number when there is no strip and over the field when there is.
- The canvas preview draws the strip live from `render`, like every other setting,
  over the sample's two records. **An author turning it on in a placement too narrow
  for the threshold sees nothing change**, which is correct and can look like a
  fault, so the description says so.

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `fieldHeadings` | boolean, group `Appearance`, default `false` | Field names over the list | Names every field on screen, so a ring or toggle is not named only by its tooltip. Left out where the list is too narrow, so a narrow placement looks the same either way. A long field name widens its column; shorten it in the list above. |

`RecordField.hideHeading` and `RecordField.secondary` remain declared and ignored.

## Data and file model

**No change to the character note.** No key, no section, no fence entry, no body
change; `read`, `write`, `sample`, `scopeRows`, `scopeModifiers` and `applyReset`
are not touched. Constraints 2 and 3 are not in play, and no test that round-trips
a note changes.

**The layout gains one optional key** on a `record-set` component. It is a config
key like `hideLabel`: a value matching the default (`false`) is omitted from the
written config, `true` is written, and a hand-edited `false` reads as off. A layout
with the key round-trips byte-identically through `parseLayout` and
`serialiseLayout`. Existing layouts read as off and draw as before. Turning the
setting on or off writes to the layout file only, and **no character note is
written or reformatted**, so a layout change deletes no character data
(Constraint 4).

## Acceptance criteria

### Held by tests

- [x] With the key absent or `false`, a Record set draws no strip element, no `sheetsmith-record-set-headed` class and no field-count stamp: the rendered tree of the harness's `traits` config is identical to today's. (`record-set.test.ts`)
- [x] With the key on and at least one readable record, exactly one strip is the list's first child, holding one heading per declared field in declared order, each reading the field's `name`, else its `key`. (`record-set.test.ts`)
- [x] The strip is `aria-hidden="true"`, holds no focusable element, and no element in the list carries `role` of `table`, `row`, `columnheader` or `cell`, nor is a `th` drawn. (`record-set.test.ts`)
- [x] For each of the five field types, the visible heading's text is contained in the accessible name of the control beneath it (Label in Name). (`record-set.test.ts`)
- [x] No strip is drawn for: no records; only unreadable records; `fields` empty; a refused configuration. It appears after the first record is added and is gone after the last is deleted. (`record-set.test.ts`)
- [x] `hideHeading: true` and `secondary: true` on a field change nothing: the strip still holds that field's heading and the layout round-trips both keys. (`record-set.test.ts`)
- [x] With the strip on, a ring's `title` is still `${record} ${field}` (plus the level's word where one exists), the long press still opens it, and a `number` field's `.sheetsmith-card-abbreviation` is still in the DOM. (`record-set.test.ts`)
- [x] `fieldHeadings` is declared as a `boolean` in group `Appearance` with a default of `false` and a description; the registry contract passes unchanged. (`contract.test.ts`)
- [x] A layout with `fieldHeadings: true` round-trips byte-identically; `false` is omitted from the written config. (layout parse/serialise test)
- [x] The count stamp is clamped to 1..8, and the custom property carries the true count. (`record-set.test.ts`)
- [x] Each per-count threshold equals `base + N x step` in `em`, the table covers 1..8, and every threshold is above the 320px rule at 16px. (`styles.test.ts`)
- [x] Every declaration the feature adds sits inside the `@supports` and `@container` blocks, bar three rules that only take the strip away and name the container, and no second container is added: the block was already the list's container, so it is named only under `.sheetsmith-record-set-headed`. (`styles.test.ts`)
- [x] The strip is opaque (declares a background) and sticky, and the list declares a `scroll-padding-top`. (`styles.test.ts`)

### Held by looking (`npm run harness:shot`, then `/design-review`)

The harness sample gains the flag on `traits` (7 columns wide, five fields of every kind: a per-record-ceiling number, a toggle, a named level, a computed field, a modifier) and on `known_spells` (2 columns wide, inside the Spellbook group). **`spells`, beside `traits` in the same row band, stays off as the control.** If the measured threshold puts `traits` just under the strip at the default width, widen the fixture's placement rather than lowering the threshold below what fits.

- [x] **Alignment.** In the default sheet, on `traits`, every heading is centred over what a reader sees within 2px (ink, not the control's box), for every record, including `Uses 1 / 3`, `Uses 3` (no ceiling), `Uses 1/2`, and a computed value of one digit against two. Measured in a browser, not judged by eye; the figures are below. The owner settled at the land stop that ink within 2px is the criterion, with the `translateX(-0.4em)` shift kept.

  **Measured** in the built harness (default sheet, light, `traits`, 794px wide, 16px type; each figure is a heading's centre against a field's centre in px, from `getBoundingClientRect` in the page, for all six records). **Two subjects, and the criterion means the second.** The *box* of every one of the 30 cells was within 0.01px of its heading, and every record's field landed on identical centres (`306.7 / 384.1 / 438.9 / 483.1 / 539.6`), open records included. A design review then measured what a reader *sees*: in the `number` column the ink sat 4 to 6.5px right of the heading, because the value's box (3.5em) and the ceiling's (two digits) are fixed so that stepping a number moves nothing, which leaves about 20px empty on the left of `1 / 3` and 10px on the right. The ring, level, computed and modifier columns have one control each and measured 0.00 to 0.01px. **So the number field is shifted, in the wide regime only**: `translateX(-0.4em)`, a `transform` so no layout changes and no threshold moves. Ink centre against heading centre, before and after (one to three digits in either half): `1 / 3` +5.2 to +0.04, `0 / 1` +3.6 to -1.56, `3 / -` +6.3 to +1.12, `9 / 9` +4.75 to -0.45, `12 / 18` +6.35 to +1.15, `150 / 99` +5.4 to +0.2. **That is within 1.6px, so within the 2px the owner settled on**, and no static offset can be tighter than the 2.7px spread the digits themselves make; the value input's own box now sits 18.3px left of the heading, which is the price of aligning the ink. The alternative, centring on the box, would leave 3.6 to 6.4px of ink offset, and was not taken. It cannot be held by the harness: the PNG shows it and only a browser reading geometry measures it, which `npm run harness:shot` does not do.
- [x] **Nothing else moves.** The chevron, the name and the delete glyph sit where they sit on the unheaded `spells` list beside it. There is no heading over any of the three.
- [x] **No repeated name.** In the wide regime no `number` field draws its inline name; its ceiling is still drawn.
- [x] **Opening a record moves no column.** `traits` with a body open: the strip and every column are where they were.
- [x] **The strip stays.** `sheet-record-ceilings` (the list scrolled to its last record): the strip is at the top edge, opaque, with a hairline under it, no record text visible above or through it, and no gap above it.
- [x] **Focus is never hidden.** Focus after a scroll, programmatic, in `sheet-record-strip-focus`: the list is scrolled to its last record and the first record's ring is focused, and it sits directly under the strip, never behind it. A programmatic focus scrolls into view by the algorithm a Tab press uses, honouring `scroll-padding-top`, but the harness cannot press Tab, so the real keystroke is the owner's check in the vault (see the fixture section).
- [x] **Narrow drops cleanly.** `known_spells` (2 columns), `sheet-list-narrow` (520px) and `sheet-narrow` (380px): no strip, each `number` has its name back, and the summary line is arranged exactly as the unheaded `spells` is at that width.
- [x] **No half state.** Sweeping the width of `traits` through its threshold (at least one width just under and one just over): never a strip over wrapped or clipped fields, never a `number` with neither a name nor a strip.
- [x] **Both themes.** Headings are legible in light and dark; the strip's fill is the box's, and the hairline is visible in both.
- [x] **Large text.** `sheet-large-text` (`text=24`): the strip either fits or has dropped, and never clips a heading. The threshold followed the type size.
- [x] **A headed and an unheaded list read as one component** side by side.
- [x] **The editor.** `editor-record-fields`: the checkbox sits in **Appearance** beside **Hide the heading**, its description reads as a consequence, and the canvas preview shows the strip where the placement is wide enough.
- [x] `npm run lint`, `npm test` and `npm run build` pass, and `styles.css` matches `src/styles/` (the build regenerates it).

**Not photographed, and recorded rather than claimed:** `prefers-contrast: more` and forced colors, which the headless harness cannot render (`docs/BACKLOG.md` § UI has the row). The strip's borders use the same tokens the box's do, so they inherit its handling.

### The throwaway vault fixture

Outside the repository, so its recipe lives here (`AGENTS.md`). The vault is
`~/Developer/sheetsmith-test-vault/`. **`Sheetsmith layouts/Record variations.json`**
gains: `fieldHeadings: true` on `features` (4 columns wide, five fields, the wide
case) and on `spells` (2 columns wide, the narrow drop); `group_records` stays off
as the unheaded control; and one new Record set, `items` (`Qty` and `Weight`
numbers, `Worn` and `Attuned` toggles, `Modifiers`), 6 columns wide and 3 rows
tall, headed. **`Characters/Records.md`** gains an `## Items` section of about
twelve records, so the list scrolls and the strip's stickiness can be pressed, and
two records whose `Qty` and `Weight` differ in digits. Press: resize the pane
across the threshold, scroll `Items`, open a record, tab through the list, toggle
the setting in the layout editor. **By hand, for the owner: Tab through a scrolled headed `Items` list.** Scroll `Items` to its last record, then press Shift-Tab and Tab through the controls from the top, and confirm each focused control scrolls clear of the strip and is never behind it. This is the one place the real keystroke, rather than a programmatic focus, is pressed.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. `feat: Let a Record set name its fields over the list`. `fieldHeadings` on `RecordSetConfig` and in `configFields`, the strip's DOM, its `aria-hidden`, the headed class and the field-count stamp, the comment changes in `record-set.ts` and `columnOptions`, and the component, contract and layout round-trip tests. The strip is hidden by a base rule until the next commit lays it out, so the commit builds and draws today's list.
2. `feat: Lay a Record set's fields on shared columns`. The `@supports` and `@container` block in `src/styles/sheet.css`: subgrids, the sticky strip and its two-row arrangement, the abbreviation hiding, `scroll-padding-top`, the per-count thresholds, the corrected comments at the two places that say there is no strip, the regenerated `styles.css`, and the guards in `styles.test.ts`.
3. `test: Photograph a Record set with its fields named`. `harness/samples.ts` (the flag on `traits` and `known_spells`), any raised `SHEET_FRAME` figures measured through `text=24` as `shot.mjs` asks, and no new view unless the existing ones cannot show a criterion above.
4. `docs: Record why a Record set may name its fields`. `docs/SPEC.md` §4.2's Record set entry (the config line and the Sheet view bullet, amending "there is no heading strip" to "off by default, opt-in"), §13's new entry with its `Resolved:` line, `docs/UI.md` §6 (the tooltip condition now says a record's name is on screen only in a headed list's wide regime) and §9 (the secondary-text row and the summary-line row), a pointer line at `docs/features/record-set.md`'s copy of the decision, and this document's status.

## Deliberately not doing

- **A set-level activation constraint on a Record set**, and **a field that appears only for some values of another field.** Separate backlog rows; not touched and not designed here.
- **Any change to Record set storage or the note format.** Nothing in a note changes.
- **Honouring a field's `hideHeading` or `secondary`.** Still declared, ignored and round-tripped; see the model question.
- **A heading over the name, the chevron or the delete glyph.** That is the tabular reading.
- **Sorting, filtering or resizing from a heading.** The strip is a label, not a control, and adds no gesture.
- **A JS width observer, or measuring a heading's width in the component.** The thresholds are stylesheet rules keyed on the field count.
- **Fixing the 320px rule's subject for unheaded lists**, and the backlog row about a six-field record's fields wrapping. Both stay open; a headed list is the only one that gets the list-measured reading.
- **Showing the strip below the threshold in a compressed form** (abbreviated headings, a two-line strip). Narrow means the per-field names, as agreed.
- **Any other open backlog row.**
