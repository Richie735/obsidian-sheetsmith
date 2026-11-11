# Stat block brief zone

Status: shipped, bar the vault walkthrough below, which the owner makes in the app and no review ticks
Board card: A Stat block's brief can show a chosen zone in place of its changes line.

## Model question

None. The new key lives in the layout and names a zone the layout already
declares. Nothing is stored in a note, nothing is published, and the brief's
press is still the picker's own write (`choose`), so Constraint 3 and
Constraint 4 are not touched. Blank draws exactly what it draws today, so no
existing layout changes (Data and file model). The zone editor keeps the key
pointing at a real zone (Design, "The zone editor keeps it valid").

## What it does

A layout can name one **table** zone of its Stat block, and each form's brief on
In play draws that table in place of its changes line. On the druid layout,
Cat and Bear then brief as their Ability Scores rows instead of
`STR +x · DEX +y · AC at least 13 + Wis · …` clamped to two lines, which is the
thing a reader compares when choosing a form.

## Smallest version

One `text` config field, `briefZone`, naming a table zone's key. Where it is set,
each brief draws that zone's rows as In play reads them, as a small read-only
grid of spans, and drops its changes line. A form whose table has no rows keeps
the changes line. A name that is not a table zone is a configuration error. It
gives up features and text zones in a brief, more than one zone, and a row cap.

## Design

This **amends** `docs/features/stat-block-in-play-polish.md` §4 by owner
decision. It does not replace it. The brief is still "what In play draws above
the zones, in small and read-only", and it gains one exception: the zone the
layout names. Every other line of §4 holds: the picture, the name, the fields
row, the colour rule, the clothes, the grid, the press, focus after the press,
and the empty states. Its "What it is not: no zones (Every form is where they
are read)" becomes "no zones but the one the layout names for briefs, drawn in
place of the changes line".

### Where it is drawn

Inside the button, the brief draws its parts in this order: the head (thumbnail
and name), the fields row, then **the zone where the layout names one and the
form's table has rows, else the changes line as today**. The zone takes the
changes line's slot. It never appears beside the changes line: the point is to
replace a line that says less than the table.

**No visible zone heading.** Every brief would repeat it, and the changes line
it replaces has none. The column labels carry the meaning (`Str`, `Dex`,
`Con`). The heading opens the brief's spoken description (below).

### What it draws: In play's reading, once

The brief draws **the same cells In play's table draws for that form**, read by
the same code:

- the same columns, labelled as In play labels them (`columnLabel`: the column's
  display name, else its key);
- the same rows, **the placeholder row left out** (`isPlaceholder`);
- a number column **signed** (`signedText`), a text column as written;
- **the first column names each row, bold**, as In play's `th scope="row"` is.
  In the druid's table `Str` is that column, so `Wis score` under `Str` is bold
  and `Wis score` under `Dex` is not. That is what In play draws today, so the
  brief draws it too (Deliberately not doing);
- **any column heading** that repeats the zone heading under the tolerant match
  is **left blank on sight**, as In play hides it (`.sheetsmith-sr-only`,
  `stat-block-zones.ts` `repeats`/`headCell`, which test every column, not only
  the first). It is still spoken in the description.

**One reading, two drawings.** `stat-block-zones.ts` gains one function that
turns a table zone and its read into what In play shows: column labels (each with
its number flag and its repeats flag) and the surviving rows' cell texts, signed.
`drawTableZone`'s play face is rewritten to draw from it, and the brief's painter
draws from it too. **In play is unchanged on screen**: the refactor moves code,
not output, which is what "In play untouched" means here. So the two cannot
disagree about which rows survive, what a column is called or how a number is
signed. A test asserts it: for the same form, the brief's cell texts equal In
play's `th`/`td` texts, leaving out In play's empty delete-column cells
(`.sheetsmith-stat-block-remove-cell`).

**Two differences, both forced by the button:**

- **A link in a cell is drawn as its display text**, not as a live `<a>`
  (`displayText`, `parse/wikilink.ts`). An anchor is interactive content and
  cannot sit inside a `<button>`. A brief is pressed to choose, not to follow. The
  aliased `[[Claws (Brown Bear)|Claws]]` reads `Claws`, as In play's link shows it.
- **Text after the table, and a zone that is not a table, are not drawn.** Both
  are markdown, which In play renders as blocks, and a block cannot sit in a
  button. A form whose zone holds no row In play would draw, including a
  `Not a table` zone, falls back to the changes line (question 2). The zone's
  `Not a table` sentence is said where it always was, under Every form and in
  play once the form is on.

### Where the mechanism lives

The host-painter pattern the brief already uses for `tiles` and `thumb`:

- `stat-block-briefs.ts`: `BriefsHost` gains an optional
  `zone?: (into: HTMLElement, at: number) => string`. Where it is present, the
  module draws a `span.sheetsmith-stat-block-brief-zone` in the changes line's
  slot and hands it to the painter. The painter returns the zone's spoken
  sentence, or `''` where it drew nothing. On `''` the module removes the span
  and draws the changes line exactly as today. The module learns nothing about
  zones, tables or the note. Its header comment's "What it is not" gains the
  amendment.
- `stat-block-zones.ts`: the shared reading above, plus the brief's drawing of
  it (`drawZoneBrief`, read-only, spans only). It sits beside `drawTableZone`
  because it is the same table's second face. It is a zone file's job, not the
  briefs module's.
- `stat-block.ts`: the config field and its check, a `briefZone(config)` helper
  returning the accepted `BodyZone` or null, and the host's `zone` member, passed
  only where that helper returns one: `(into, at) => drawZoneBrief(into, zone,
  records[at]?.zones?.[zone.key])`.

### Its look

A small read-only grid of spans, in the brief's own type, so it reads as the
fields row's sibling rather than as a second Table:

- `span.sheetsmith-stat-block-brief-zone` is `display: grid`, its column count
  from `--sheetsmith-brief-zone-columns` set through `style.setProperty`
  (PATTERNS §5: a `--sheetsmith-*` value the stylesheet reads). Each column is
  `minmax(0, auto)`, so columns are as wide as what they say, and the span
  carries **`justify-content: start`**: the button's `align-items: stretch`
  (`src/styles/sheet.css`, the brief rule) makes the span full width, and auto
  columns would otherwise stretch across it. The gap is the fields row's,
  `var(--size-2-2) calc(var(--size-4-2) + var(--size-2-1))`, so a pair and a
  column are spaced alike.
- **The label row** (`-brief-zone-label`): the pairs' label style,
  `--font-ui-smaller`, `--text-muted`. Under a one-row table that is exactly
  label over value, like the fields row above it.
- **The cells** (`-brief-zone-cell`): `--font-ui-small`, `--text-normal`. The
  first column is bold (`-brief-zone-name`). A number column is end-aligned
  with `tabular-nums`, as In play's is.
- **Nothing truncates.** No `nowrap`, no `text-overflow`, no clamp. A cell wraps
  inside its column, and `overflow-wrap: anywhere` breaks a word that would not
  fit, so the grid never exceeds the brief's box.
- **Every row is drawn.** A clamp on a grid has no honest place for an ellipsis,
  and the author chose this table to compare by. A long table makes a tall
  brief, and the grid's row stretches its neighbours to match. That is the cost
  of the author's choice, and it is said in the field's description.
- No border, fill or row rule. Those are the Table's clothes, and the brief
  already wears the tile's.
- **Theme variables only.** **More contrast:** labels stay `--text-muted`, which
  already holds at that setting for the fields row. **Forced colours:** nothing
  to repaint, since it has no border or fill. The text takes the mode's colours.
- **No `:has()`.** No rule needs to know that a brief holds a zone. If the build
  finds one does, it reads a class stamped on the button
  (`sheetsmith-stat-block-brief-zoned`).

**Size and wrap (question 5).** The brief's track is at least 240px and fills
its row. With the 1px border and `--size-4-2` padding, about 222px is left for
content. The druid's three columns (`Wis score`, `Wis score`, `Yours` under `Str`,
`Dex`, `Con`) take about 190px at `--font-ui-small`, so they sit on one line.
**At ≤360px of the block** the brief is one column at the row's full width, and
the grid is drawn the same with more room. Every size in the zone is a fixed-px
UI token, so **`text=24` changes nothing in it**. It is checked anyway, since
the brief's neighbours are not all fixed. Six columns of two-digit scores at the
240px track (`18`…`10`, about 30px each) still fit. Where a cell does not, it
wraps inside its column, and no column is clipped.

### Names and the description (question 4)

Everything in the button is phrasing content, so the zone is spans. **No table
roles.** A button's children are presentational in ARIA, so `role="table"`,
`row` and `cell` inside one are flattened anyway, and they would promise a
navigation the button does not offer. What a screen reader hears is the
button's name and description, as today:

- The name is unchanged: the form's name (`aria-labelledby`).
- The description is the fields' hidden sentence as today, then, **in place of
  the changes line, a hidden sentence twin of the zone** (`-brief-zone-said`,
  `.sheetsmith-sr-only`): the zone heading, a colon, then each row as `label
  cell` pairs, `, ` between pairs and `; ` between rows, with blank cells left
  out. The druid's Cat reads *Ability Scores: Str Wis score, Dex Wis score,
  Con Yours*. Two attack rows read *Attacks: Attack Bite, Bonus +6, Damage 1d8+4
  piercing; Attack Claws, Bonus +6, Damage 2d6+4 slashing*. It uses the same
  "label reading" grammar as the fields' sentence, because a grid read as text
  runs its labels into its cells. A column label hidden on sight is still
  said.
- Where the brief falls back, the changes line is described as today.

### The three settled questions

1. **Key, label, kind, and what it may name.** `briefZone`, label **Brief zone**,
   kind `text`, holding a zone's key. It may name **only a table zone**. A
   features zone and a text zone are markdown rendered by the app into blocks
   (paragraphs, lists), which cannot sit inside a `<button>`. They would also
   need a size rule, a line clamp on rendered markdown, that the changes line got
   for free and a table does not need, since its rows are its length. `text`
   because a select's options are static (`ConfigField.options`), and
   `exclusive` is the precedent: a text field naming a key the same config
   declares.
2. **An empty zone for a form falls back to the changes line.** The setting
   prefers the table *over* the changes line. Where a form has no row to show,
   the default stands rather than leaving a brief with less than it had before
   the setting. "Empty" is "no row In play would draw": no rows once the
   placeholder is left out, or not a table. The Thug in the harness shows it.
3. **A name no table zone answers is a configuration error**, on the Errors
   pattern and the `exclusive` precedent. It is not a silent fallback: the
   layout says one thing, and silently drawing another hides the typo. Checked
   after `zonesError`, since it reads the accepted zones. Matched as `exclusive`
   matches its field, trimmed and without case:
   - names no zone: *Brief zone names "scores", which no zone declares. Name a
     table zone's key, or clear it.*
   - names a built-in, checked by `isBuiltInZone(key)` and not by searching
     `config.zones`, since a list may omit `vitals` or `changes` and they are
     still drawn (`zoneOrder`): *Brief zone names "changes", a built-in zone.
     Name a table zone's key instead.*
   - names a features or text zone: *Brief zone names "traits", a features zone.
     Name a table zone's key instead.*

   Like every `configError` here, the block draws the sentence and nothing else
   until it is fixed. The layout editor shows it on the component. The note is
   never read or written while it stands, so nothing is lost. **The zone editor
   never leads there** (next section): a re-key carries into `briefZone` and a
   delete clears it. The sentence is reached only by typing a bad key into
   **Brief zone** or by hand-editing the layout file.

### The zone editor keeps it valid (owner's revision)

Two zone editor commits also write `briefZone`. Each is part of the **same
edit, so it is one undo step**. That follows the 0.8.0 id-rename precedent
(`docs/features/component-id-rename.md`, "every site in the table is rewritten
in one `persist`, which is one undo step"; `src/editor/id-rename.ts`
`renameComponentId`). The undo stack is whole-file text (`editor/undo-stack.ts`),
so a single `persist` restores both at once.

- **Re-keying a zone carries the new key into `briefZone`.** In
  `editor/zones-field.ts`, the key input's commit already has the component's
  config in hand (`record`). Where `briefZone` names the zone's old key, under
  `zone-rules.ts`'s `sameZoneKey` (trimmed and without case, the one spelling
  the sheet's own `briefZone` lookup and the key-clash rule also use), it is set
  to the new key before the commit's one `context.persist()`. Any other
  `briefZone` is left alone. A key commit still migrates nothing in any note.
- **Deleting the zone `briefZone` names clears `briefZone`** (the key is removed
  from the config, not set to `''`), in the same commit as the delete. The briefs
  then fall back to the changes line. The remove's `describeRemoval` sentence is
  unchanged: the zone's text stays in every note, as drift. The delete is
  `list-fields.ts`'s `addControls`, which gains an optional `onRemoved` hook run
  after the splice and before its one persist, so the clear is in that write.
- **The zones field learns which keys to keep, rather than knowing `briefZone`**
  (as built). The Stat block declares `keyReferences: ['briefZone']` on its
  `zones` field, a new `ConfigFieldSpec` member for a `'zones'` field only, and
  `config-panel.ts` passes it to `renderZonesField` beside `addressesHeading`.
  That is `addressesHeading`'s, `statsField`'s and `rowFlag`'s pattern: the
  component declares a fact, so the editor learns nothing about briefs and
  nothing outside the component knows it exists. Typed against the config's
  declarable keys, so a typo does not compile, and `contract.test.ts` holds each
  reference to a declared text field and the member to a `'zones'` field.
- The module header's "a key commit carries none" gains that a key commit and a
  delete keep each declared reference pointing at a zone.

### Unchanged

In play once a form is on, Every form, the zone editor beyond keeping `briefZone` valid, the brief's picture,
name, fields row and colour rule, the press and its focus, *No forms yet.*, a
companion block (no `exclusive`, no briefs, the setting unread). The setting
without `exclusive` is not an error, as `tint` without it is not. The field's
description says it needs **One at a time by**.

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `briefZone` | text | Brief zone | The key of a table zone each form's brief draws in place of its changes line while no form is in play, so forms are compared by that table. Every row is drawn, so a long table makes a tall brief. A form whose table has no rows keeps its changes line. Only a table zone can be named, and it needs One at a time by. Blank draws the changes line. |

Declared after `zones`. No `default`, no `visibleWhen`. Not in `formulaFields`,
since it holds a key and not an expression. The palette entry and the starters
prefill none.

## Data and file model

Nothing new in a note. `briefZone` is one optional string in the layout. Absent
or blank, the config is read as today and **every brief draws exactly what it
draws now**, which is why the new field is not a breaking change. Blank must
keep meaning that. A brief that draws the zone writes nothing. Its press is
`choose(at)`, as today. Re-keying or removing the zone touches no note. In the
zone editor it rewrites or clears `briefZone` in the same layout write, so the
layout stays valid.

## Acceptance criteria

- [x] `briefZone` is declared on the Stat block as a `text` field labelled
      **Brief zone**, with the description above. `contract.test.ts` passes.
- [x] Blank or absent `briefZone`: the briefs' DOM is identical to today's
      for the `forms-none` sample (test). `sheet-forms-none` and its `-dark`,
      `-contrast-more` and `-forced-colors` shots are unchanged.
- [x] With `briefZone` naming a table zone, each brief whose form holds a row
      draws `.sheetsmith-stat-block-brief-zone` in the changes line's place and
      no `.sheetsmith-stat-block-brief-changes` (test).
- [x] The brief's label texts equal In play's visible column headings, and its
      cell texts equal In play's `th`/`td` texts for the same form, In play's
      `.sheetsmith-stat-block-remove-cell` cells left out: placeholder
      row left out, a number column signed, the first cell of each row bold
      (test, one assertion over both faces).
- [x] A cell holding an aliased wikilink draws its display text and no `<a>`.
      The brief holds no `a`, `input`, `textarea`, `select`, `table`, `div` or
      `p`, only spans (test).
- [x] A form whose zone holds no row (absent, placeholder only, or
      `Not a table`) draws its changes line as today (tests, one each).
- [x] `briefZone` naming no zone, a built-in, and a features or a text zone each
      give their sentence as `configError`, matched without case and trimmed
      (three tests). A valid name with different case is accepted (test).
- [x] Re-keying the zone `briefZone` names in the zone editor sets `briefZone`
      to the new key in the same persist. Re-keying another zone leaves it alone
      (`zones-field.test.ts`, two tests).
- [x] Deleting the zone `briefZone` names removes the `briefZone` key in the
      same persist. Deleting another zone leaves it (`zones-field.test.ts`, two
      tests).
- [x] One undo after a re-key restores both the zone's key and `briefZone`, and
      one undo after a delete restores both the zone and `briefZone`, byte for
      byte (`layout-editor.test.ts`, two tests).
- [x] Each brief's `aria-describedby` is the fields' twin then the zone's twin,
      and the zone's twin reads *Ability Scores: Str 19, Dex 10, Con 16* for the
      sample's bear (heading, `label cell` pairs, blank cells left out, `; `
      between rows). A falling-back brief is described by its changes line
      (tests).
- [x] The grid carries `--sheetsmith-brief-zone-columns` equal to the zone's
      column count, set by `style.setProperty`. No bare `.style.x =` (test).
- [x] `styles.test.ts`: the zone's labels and cells have no `nowrap`,
      `text-overflow` or line clamp, and the cells carry
      `overflow-wrap: anywhere`. No rule added for this feature uses `:has()`.
      Only theme variables are used.
- [x] `sheet-forms-none-zone` (wide, framed on the block): the bear's and the
      Wolf's briefs show their Ability Scores grid under their pairs, labels
      muted over cells, no clipping. The Thug's brief falls back as with the setting blank.
      Light, `-dark`, `-contrast-more` and `-forced-colors`.
- [x] `sheet-forms-none-zone-narrow` (380px, framed on the block): one brief a
      row, each grid on one line with nothing clipped. Same four variants.
- [x] `sheet-forms-none-zone-text24` (`text=24`, wide, framed): nothing
      clipped or overflowing the brief's box. Light only.
- [x] Vault fixture: `Sheetsmith layouts/5e Druid.sheetsmith`'s `forms` Stat block
      sets `"briefZone": "scores"`, its only change.
- [ ] Vault walkthrough (owner-checked, in the app): in `Characters/Thorne - Character Sheet.md`,
      choosing **None** in Beast Forms' picker shows Cat Form's brief with
      `Str Dex Con` over `Wis score Wis score Yours` and no changes line.
      Clearing **Brief zone** in the layout editor brings the changes line back.
      Re-keying `scores` in the zone editor (to `abilities`, say) updates
      **Brief zone** and keeps Cat's brief drawing the table. Typing a key no zone
      has (`score`) directly into **Brief zone** still shows the no-zone sentence
      on the block.
- [x] `npm test`, `npm run lint` (`--max-warnings 0`), `npm run build`,
      `npm run harness` and `npm run harness:shot` pass.

### Harness

- `harness/samples.ts`: a new `FormsVariant` `'none-zone'`. It is `none`, plus a
  table zone `scores` headed **Ability Scores** with untyped columns `Str`,
  `Dex`, `Con`, **declared after `attacks`**, and `briefZone: 'scores'`. The
  order matters: `placeZones` sends a 0.9.0 lead's leading table to the first
  table zone (`src/parse/zones.ts`), so `scores` first would swallow the Wolf's
  Attack table. The bear holds `| 19 | 10 | 16 |`. The Wolf's
  `| 12 | 15 | 12 |` block goes **after its Pack Tactics lead prose**. The Thug
  has no scores block, so it falls back. Every other variant is untouched, so no existing shot moves.
- `harness/harness.ts`: the state `forms-none-zone`.
- `harness/shot.mjs` `formsPolishViews`: `sheet-forms-none-zone` and
  `sheet-forms-none-zone-narrow` (both expand to the four variants), and
  `sheet-forms-none-zone-text24` added beside them as a single light view.

## Commit boundaries

1. `refactor: Read a table zone's rows in play once`. The shared reading in
   `stat-block-zones.ts`, with `drawTableZone`'s play face drawing from it. In
   play is unchanged on screen, and existing tests pass unchanged.
2. `feat: Brief each form with a chosen table zone`. `briefZone` and its check
   in `stat-block.ts`, `drawZoneBrief`, the `zone` host member in
   `stat-block-briefs.ts` and its header amendment, the CSS, and the unit and
   styles tests. Also the zone editor's carry and clear in
   `editor/zones-field.ts`, the `keyReferences` member in `types.ts` and its
   pass-through in `editor/config-panel.ts`, `addControls`'s `onRemoved` hook in
   `editor/list-fields.ts`, `sameZoneKey` in `components/zone-rules.ts`, and the
   `keyReferences` case in `contract.test.ts`, with their `zones-field.test.ts` and
   `layout-editor.test.ts` undo tests, since the field and the commits that keep
   it valid arrive together.
3. `test: Show a brief drawing its form's table in the harness`. The
   `none-zone` variant, its state and the three views and their variants.
4. `docs: Record the stat block's brief zone`. This doc to `built`. The owner
   amendment line in `docs/features/stat-block-in-play-polish.md` §4 and its
   "Deliberately not doing" ("No zones inside a brief" gains "but the table zone
   a layout names, `stat-block-brief-zone.md`"). The `docs/UI.md` §9 stat block
   row gains `-brief-zone`. By `/land-it`: the SPEC §4.2 *Sheet view* brief
   sentence gains "or, where the layout names a table zone for briefs, that
   table's rows in place of the changes".

## Deliberately not doing

- No features or text zone in a brief, and no second zone. A layout names one
  table zone or none.
- No row cap or clamp on the zone, and no zone heading drawn on the brief.
- No live links, no `after` text and no `Not a table` sentence in a brief.
- No change to how In play draws a table: the first column is the row's name and
  bold in both. A layout whose first column is a score, like the druid's, reads
  that way on both faces (`Wis score` bold under `Str` only). Owner's ruling:
  this stays. The fix is a leading name column in the owner's own layout,
  outside this repository, not this feature.
- No change to the zone editor beyond the declarative field and keeping
  `briefZone` valid on a re-key and a delete, through the declared
  `keyReferences` and `addControls`'s `onRemoved` hook. No new control in the zone card.
- Deferred, not specced here: a Stat block without a picker having a reading
  face; a placed Stat block's scroll cue; the layout canvas drawing a features
  entry's markdown; modifiers setting toggles, levels or text; a form's tag on a
  Roster band head in table layout; the stamped-class-over-`:has()` guard.
- `docs/BACKLOG.md`: closes no row. The row on change lines naming keys rather
  than labels (`compactChange`) is related but stays open, since the changes line
  still draws that way wherever the setting is blank.
