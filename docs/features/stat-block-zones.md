# Stat block zones

Status: shipped
Brief: A Stat block's record body is a list of zones the layout defines, each
with a type, a heading and options, replacing today's fixed shape (an optional
action table at the head of the body, then prose behind a disclosure). Settles
the body format before release 0.9.0 ships it. Four small fixes from the
character-forms vault check travel with it.

## Model question

**Settled with the owner before this spec, and recorded here rather than
reopened.** The §13 entry is "What a Stat block's record body is made of",
added open by this spec; its `Resolved:` line is `/land-it`'s. It depends on no
other open §13 question. The settled answers, each with the argument that
carries it:

1. **Three zone types: `table`, `features`, `text`.** No `fields` type: a
   label and value pair is already what a record's `sheet` fence holds, and the
   vitals draw it. No image zone type: a picture is one reference per record,
   not a list, and it has its own field (8). **Vitals and changes are
   built-in entries the layout can place in the zone order but never remove**,
   as `sections` allows today. They keep living in the record's fence, not the
   body, so nothing a form holds is hidden.
2. **Storage and identity: one `#### Heading` per zone inside each `###`
   record.** This is the component model one level down. A zone has a stable
   `key` in the layout, which the editor and references use, and a `heading`,
   which the note stores and a reader sees. A label is identity for a section
   and a heading is identity for a zone, by the same argument (`SPEC` §2,
   §10). **Matching is tolerant** of case, surrounding whitespace, an ATX
   closing run of `#`, and trailing punctuation (Data and file model gives the
   exact normalisation). **A heading renamed in the layout is migrated in every
   note on the layout**, on §10's rename rule: a collision is refused and never
   merged, and one `Notice` gives a count. **A heading renamed by hand in a note
   matches no zone and becomes drift**, which is shown and never lost (4).
3. **Compatibility with what the current 0.9.0 build writes.** A body with no
   zone headings (a leading table, then prose) reads by today's rule. The
   leading table goes to the first `table` zone and the rest to the first
   `text` zone. There is no migration and no rewrite on load, and nothing
   moves until it is edited. **The `####` trap:** `parse/records.ts` tells a
   reader to use `####` inside prose, so an unrecognised `####` after a text
   zone stays part of that text zone. Anywhere else it is drift. **Config:**
   `zones` replaces `actions`, `actionName`, `bodyName` and `sections`
   outright. No released version wrote them, so both readings are not carried.
   `src/starters/5e.json` moves to `zones`.
4. **Drift keeps every byte (Constraint 4).** A heading no zone matches is
   drawn after the layout's zones, as markdown under its own heading, marked
   *Not in this layout*. Content that does not parse as its zone's type draws
   an error on that zone only, and the rest of the record keeps working: §10's
   malformed-section rule, one level down.
5. **Zones are per layout, never per record (Fate).** Fate's NPC tiers are
   covered by **a zone with no content drawing nothing in play**, so there is
   no empty chrome, which the research names as a pain point. Every form still
   shows every zone to fill. Zones a record carries that the layout does not
   list are drift, not a feature. The prior art agrees: the layout defines the
   sections and the record holds only data (Fantasy Statblocks, Improved
   Initiative, Roll20), and no tool lets a record declare its own sections.
6. **No state in a zone.** A zone holds text the reader writes, never a value
   the sheet writes mid-play. Fate maps as: stress is a number field with a
   ceiling, consequences are text fields, and skills on the ladder are a table
   zone.
7. **Features parsing.** An entry starts at a paragraph that opens with a bold
   name ending in a full stop, and runs until the next such paragraph.
   Continuation paragraphs and lists stay inside the entry and render as
   markdown. Text before the first named entry is the zone's lead text. **The
   name parses in three spellings**: `**Name.**`, `***Name.***` (bold italic,
   which the harness's Brown Bear traits already use) and `__Name.__`. The
   writer keeps whichever spelling the note used. **A qualifier is parsed** as
   a trailing parenthesis inside the bold name, `**Bite (3/Day).**`, into a
   field of its own. The prior art converges on a short qualifier beside a
   name: the 5e SRD's "3/day", Improved Initiative's Usage, and Daggerheart's
   Passive, Action and Reaction.
8. **Options.** There is one option, `collapsed`, on text zones only. It is
   needed because today's traits sit behind a closed disclosure and the default
   layout has to reproduce that. There is no library-only option and no
   collapse on any other type, because no demand was found for either (Deliberately
   not doing). Every zone option gets a harness shot proving that its label and
   its rendering agree. The zone editor works at phone width.

**Owner addition: the record picture.** An optional picture on the record,
drawn in the In play head beside the form's name. It is a reference to a vault
file, never bytes. The owner asked for an image per transformation, and an embed
inside a text zone cannot be drawn as the form's picture.

**Correction applied before this spec, and kept:** the owner's message said "a
wikilink in the fence". Constraint 2 forbids any wikilink inside a code fence,
because Obsidian does not index it, so rename propagation, backlinks and hover
all break silently. `SPEC` §4.2's Image entry already amended its own fenced
storage for exactly this reason. **So the picture is one embed line in the
record's body, outside the fence**: the first non-blank line after the fence
and before any table or `####`. It is read as the picture only when the layout
turns the picture on, and otherwise it is prose as it is today. The exact rule
is under Data and file model. Deferred, and out of this run: a form's picture
standing in for the sheet's Portrait.

**Owner addition: escaping in a table zone.** The table zone's writer escapes
`|` inside every cell it writes, and `[[Note|Alias]]` round-trips through a
table zone unchanged. An acceptance criterion pins both.

**Contract, publication, storage, existing notes.**

- **The component contract (`SPEC` §4.1) does not grow a member.** Three
  things grow outside it, named here so none of them slips in unnoticed:
  - `ConfigFieldSpec.kind` gains `'zones'`, an editor field kind whose shape
    belongs to one component, on `track-rows`' precedent. A `columns` list
    cannot hold a zone, for two reasons. A zone's type is not a column type,
    and `contract.test.ts` holds every `columnOptions.types` entry against
    `COLUMN_TYPES`. A table zone also holds a list inside one entry, which
    only `editor/nested-list-field.ts` draws. That module names a second
    caller as already expected, and this is that caller.
  - `ConfigFieldSpec` gains `addressesHeading?: 'record'`. It says that each
    entry's `heading` addresses a `####` heading inside every `###` record of
    the section. This is `addressesEntry`'s pattern: the component declares
    where its name lives, so the editor never learns what a Stat block is.
    `RenameIntent` gains a third kind, `heading`, and
    `component-rename-migration.ts` carries it across the notes.
  - **Owner-accepted:** `editor/nested-list-field.ts` gains up and down arrows, through
    `list-fields.ts`'s `moveItem`, with no drag. Its own header comment says a
    second caller for which order is observable earns one. A table zone's
    column order is observable: it is the order the table's columns are drawn
    in, and the order a fresh table is written in.
- **It publishes nothing new.** Zones are body content, not fence entries, so
  `scopeValues`, `scopeRows`, `scopeModifiers`, `resetColumns` and `applyReset`
  are unchanged. A number column in a table zone publishes nothing, as today's
  action columns do not.
- **It stores** the record's body as an optional picture line, then an optional
  untitled lead, then `####` blocks. It round-trips byte-identically by
  concatenation, as `records.ts` does one level up (Data and file model).
- **Existing notes.** A 0.9.0 body reads unchanged and is not rewritten
  (answer 3). `main` (0.8.0) has no Stat block, so no released note holds one.
  Layouts the 0.9.0 build wrote with `actions`, `actionName`, `bodyName` or
  `sections` keep those keys, because `parseLayout` preserves unknown component
  keys. **They are reported, not read** (owner's decision): such a Stat block
  carries one configuration error naming the keys and saying zones replaced
  them, until the author removes them (Design, Errors). No note is read or
  written meanwhile, so no bytes are at risk. The starter, the harness sample
  and the vault fixture move to `zones` in this build.

## What it does

A layout author decides what a form's stat block is made of: a table of
attacks, a list of named features such as *Multiattack* or *Bite (Recharge
5–6)*, a free-text zone for notes, in any order, each under its own heading,
with the vitals and changes placed where they belong. The reader fills each
zone under **Every form** and reads it under **In play**. In play, a zone with
nothing in it takes no room, so a Fate mook and a main NPC share one layout.
A form can carry its own picture beside its name.

## Smallest version

Zones of two types, `table` and `text`, with the built-ins placeable, tolerant
heading matching, the 0.9.0 legacy read, drift drawn, the `collapsed` option, the
zone editor and the four small fixes. **It gives up** the `features` type, so 5e
actions stay a table or prose. It also gives up the record picture, and the
heading-rename migration: a heading renamed in the layout leaves every note's
old blocks as drift, shown, to be fixed by hand. The storage is the same, so the
full version adds all three without a migration.

## Design

### The record in play

Everything that is not a zone stays as `docs/features/character-forms.md`
built it: the head, the picker, **Revert**, the uses rings, the vital tiles,
the change items, the two-forms-on report and the foot. Under the head, a
form's stat block is **the layout's zone list drawn in order**. The built-in
`vitals` and `changes` are drawn where the list puts them. A built-in the list
leaves out is drawn where the default puts it: `vitals` first, then `changes`,
then the listed zones.

**Every body zone is the sheet's label-over-content pair**: a heading at the
component label's rank, `--size-2-2`, then the content, with `--size-4-3`
between zones and no divider. That is the rhythm the character-forms build
settled.

- **Table zone.** This is today's action table, unchanged in look: the sheet's
  own Table (`.sheetsmith-table` in `.sheetsmith-table-box`) on the tiles'
  surface, with one `<colgroup>` on both faces. Its first column names each
  row, as a bold `th scope="row"` with its links live. A number column is
  signed (`+6`) and a text column wraps. The placeholder row (a name equal to
  the first column's heading, or blank, with every other cell empty) is left out
  in play. A first-column heading that says what the zone heading says, under
  the tolerant match, is kept for screen readers only (`.sheetsmith-sr-only`),
  as today.
- **Features zone.** The lead text, if any, rendered as markdown. Then one
  block per entry (`.sheetsmith-stat-block-entry`), `--size-2-2` apart. Each
  entry is **its source markdown as the note has it, rendered by the app's
  renderer**, so the name reads in the note's own emphasis and run in, as a
  printed stat block reads. The qualifier is not restyled in play: it is part of
  the name the note wrote (`**Bite (3/Day).**`). What the parsed fields buy is
  editing, the empty rule and a stable entry boundary, not a second drawing of
  the name. Continuation paragraphs and lists render as markdown inside the
  entry. The harness's `standInMarkdown` already draws paragraphs and emphasis,
  and it gains lists for this.
- **Text zone.** The prose rendered as markdown in a box in the card's clothes
  (`-panel`), edited on a press (`drawRecordBody`), as the traits are today. With
  `collapsed` on, the zone heading is the disclosure's button: it is closed on
  first render, `hidden="until-found"` while closed, and its open state is held
  in the module's `openBodies` set, keyed `<id>:<record>:<zone key>` now that a
  record has more than one disclosure. With `collapsed` off, the heading is a
  plain heading and the box is always shown.
- **An empty zone draws nothing in play**: no heading, no box, no placeholder.
  "Empty" means: a table with no rows once the placeholder is left out; a
  features zone with no lead and no entries; a text zone whose text is blank. A
  record whose body zones are all empty draws its head, vitals and changes and
  nothing else. It does not draw *None yet*, because Fate's mook is a whole
  stat block, not an unfinished one. Today's *None yet. Add them under Every
  form.* sentence goes.

### The record picture

With **Picture** on, a form whose body opens with a picture line draws it **at
the inline start of its title row**, before the form's name. The thumbnail is a
square whose side is three times `--font-ui-large`, with `--radius-m`, on
`--background-secondary`, and the picture uses `object-fit: contain`. That is
the Image component's default, so the invariant "never cropped, never
distorted" carries over. It is drawn by `components/picture-frame.ts`, the
shared painter, never a second `<img>` path. The name and the rest of the head
keep their order after it and wrap as they do today. With two forms on, each
form's name row carries its own picture.

- **No picture line: nothing is drawn.** There is no empty frame in play,
  since an empty frame is chrome.
- **A reference that does not draw** (no such file, or not a picture): no
  thumbnail, and one line in muted text under the head carrying
  `picture-frame.ts`'s own sentence and then the fix, *Set it under Every
  form, in Picture.*, since the thumbnail has no field to press, so the failure
  is on screen (`SPEC` §4.2's Image rule: every failure under the component's
  own label; `docs/UI.md` §10: error text names the fix). With two
  forms on, each line opens with its form's name — *Brown Bear: No file in
  this vault is called "…"* — since two lines under one head would not say
  whose picture failed. *(Recorded in the build.)*
- **Under Every form** the open form's stat block starts with a section headed
  **Picture**. It holds the full picture frame with its one-line field,
  `picture-frame.ts`'s field, gesture, suggester and refusals exactly. That
  means a bare path, `![](…)` and anything that is not one embed are refused
  in the field with the Image component's sentences, and nothing is written.
  Committing an empty field removes the line.

### Every form

The same anatomy in edit mode, as today, with every zone drawn whether or not
it has content, since this is where a zone is filled:

- **Table zone**: today's editing table, a field in every cell, the
  arm-then-commit delete column, and the Table's add row as its foot, named
  **Add** plus the first column's heading in lower case (*Add attack*).
- **Features zone**: the lead text as a click-to-edit box (`drawRecordBody`,
  placeholder *Text before the first entry*). Then each entry as one line of
  three controls: the **name** (the action cells' one-row wrapping field), the
  **usage** (a short one-row field, placeholder *Usage*, holding the
  qualifier; *3/Day* as a placeholder read as a value the entry did not have,
  corrected in the design review), and the arm-then-commit delete. Under that line is the entry's
  text as a click-to-edit markdown box. The foot is **Add entry**, the Table's
  add-row clothes. Entries are not reordered here: the note is the order, as
  for forms. Under the stat block's 360px container query the name and usage
  stack, and the delete stays on the name's line.
- **Text zone**: the click-to-edit box, placeholder *Add text*. A `collapsed`
  zone is drawn open here, because this is where it is filled; the option only
  shapes In play. That is stated in the field's description.
- **Drift and errors**: as in play (below), and never editable from the sheet.
  **Drift draws as plain read-only text here, with no field border and no
  panel box**, so only a zone that can be edited looks editable *(changed at
  the land stop)*. In play it keeps the text zones' box.

### Drift

**Content no zone owns is drawn, never dropped.** After the layout's zones,
each drift block is a section headed by **the heading exactly as the note
writes it**, with a muted *Not in this layout* beside the heading as a pill
of its own: sentence case, a hairline edge, theme variables only, and none of
the heading's capitals or tracking, so it never reads as more of the heading
*(changed at the land stop: in the secondary-text style it read as part of
the heading)*. Its content is rendered as markdown,
read-only on both faces, and under it is one muted sentence: *Edit it in
markdown view, or add a zone headed "Reactions" to the layout.* Three things
count as drift:

- a `####` block whose heading matches no zone, except where it follows a text
  zone (answer 3);
- a second `####` block matching a zone the record already holds, headed by its
  own spelling, with the sentence *A second "Traits" heading in this record.
  Only the first is read.* Two blocks are never merged;
- an untitled lead whose part a zone with its own `####` block also claims,
  headed *Before the first heading*. Its sentence: *No zone reads the text above the
  first heading. Edit it in markdown view, or move it under a zone's heading.*

Drift draws in both faces, because content that appears only in the editor is
content a player at the table cannot find.

### Errors

- **A layout still carrying a replaced key** (owner's decision: reported, not
  silently ignored). A Stat block holding any of `actions`, `actionName`,
  `bodyName` or `sections` is a `configError` naming exactly the keys present:
  *Zones replaced actions and bodyName. Set this stat block's zones, then
  remove those keys from the layout.* The keys named are only the ones the
  config holds, in that fixed order. It is checked before every other
  configuration rule, so it is the one error shown while it stands. **The sheet
  does not draw the default zones while it stands.** It behaves as every other
  `configError` on this component does today: `read` returns the error and
  `render` draws `.sheetsmith-error` in the component's cell and nothing else.
  The note is neither read into zones nor written, so the author fixing the
  layout loses nothing. Drawing default zones beside an error would show the
  reader a stat block shaped by keys the layout no longer means. The layout
  editor shows the same sentence on the component, as for any `configError`.

- **A table zone whose content opens with no table**, such as prose under
  `#### Attacks`, draws `Not a table. Edit it in markdown view, or change this
  zone's type.` in place of the table, then the content as markdown, read-only.
  Its edits are off, because writing a fresh table above someone's prose is a
  layout guessing at a note. The rest of the record keeps working.
- **Text after a table zone's table** is kept, and drawn under the table as
  markdown, read-only, with no error.
- **A configuration this component refuses** is `configError`, on that
  component alone:
  - a zone with no key, or a key that is not a name (`isName`);
  - two zones with one key;
  - a body zone keyed `vitals` or `changes`, or a built-in given a `type`;
  - a body zone with no heading, or a heading that normalises to nothing (such
    as `...`);
  - two headings that normalise alike (**owner-accepted**);
  - a heading holding a line break or a wikilink (the wikilink half
    **owner-accepted**). A heading that is a link
    would change when the file it names is renamed, and silently orphan the
    zone;
  - a type other than the three;
  - a table zone with no columns;
  - a table zone with two columns that normalise alike, or a column key
    holding `|`;
  - `collapsed` on a zone that is not a text zone.

  One test each.

### The commit guards

**Owner-accepted.** The plugin's own gestures must never write a body it would read differently,
so a commit is refused in place, with the field keeping the draft, where:

- a text zone's text holds a `####` line whose heading matches one of this
  layout's zones: *Not saved. "#### Actions" would start the Actions zone. Use
  ##### for a heading inside text.*
- a features entry, a features lead or a table cell holds a `####` line at
  all. This uses the same sentence shape, because there it would be drift.
- any body text holds a `###` or `##` line, which is the existing record
  refusal. A text zone keeps its advice, *use "#### " instead*; a features
  entry or lead advises *use "##### " instead*, since it refuses every `####`
  line and the first advice would earn a second refusal.
- with **Picture** on, a legacy lead's new text opens with a lone embed
  paragraph, which would read as the picture next time: *Not saved. A picture
  on its own first line is the form's picture. Set it under Picture instead.*
- a table cell holds a line break, as today. A `|` is never refused, because
  the writer escapes it.

**Added in the build**, each for the same reason — a body the plugin would read
differently next time — and each refused in place with the draft kept:

- a features lead, or an entry's text past its first line, holding a paragraph
  that opens with a bold name, which would start a new entry: *Not saved.
  "**Pounce.** Leaps." at the start of a paragraph would start a new entry. Add
  it with Add entry instead.*
- an entry name that is blank (*Not saved. An entry needs a name, or its text
  joins the entry before it.*), holds a line break (*Not saved. A name is one
  line. Remove the line break.*), holds `**` or `__` (*Not saved. A name cannot
  hold ** or __, which mark where the name ends.*), or ends in a parenthesis,
  which would read back as its usage (*Not saved. A name ending in a parenthesis
  reads as its usage. Put that part under Usage.*);
- a usage holding a parenthesis: *Not saved. A usage is written inside
  parentheses already. Remove the ones typed here.* A usage cannot hold a line
  break, being one `<input>`.

### The four small fixes

1. **The form tag touches the card label** in the app, where the harness
   measured about 2.4px of clearance. The app's body is 15px against the
   harness's 16px default (`docs/UI.md` §5), and the label is em-sized while
   the pill's overhang is fixed-pixel. **Built as a move, not a nudge**
   *(changed at the land stop)*: a first fix moved the pill 2px further out of
   the top edge and measured 4.1px of clearance in the harness, and the app
   still touched, 0.8px above *Armour class*, because the clearance was slack
   against where a font draws its capitals. So the pill now sits on the box's
   **bottom inline-end corner**, moved down by its own height less
   `--size-4-2`, which puts exactly the bottom padding inside the box and the
   rest, about 5px, into the 8px gap below. Its clearance from every content
   box is then geometry, zero by construction at any font and text size, and
   the corner is clear of the label, the centred value, a card's score pill and
   the note mark or a Pool's door in the top corner. The box is the same size
   with the form on as off, and at least 3px of the gap below stays.
   `harness/measure-form-tag.mjs` checks it at `text=15`, `16` and `24`: the
   pill reaches into no content box, overlaps no element drawn in the box, and
   leaves the gap.
2. **The record body's edit box does not grow to fit its text.** The textarea
   `drawRecordBody` opens grows with its content (`field-sizing: content`,
   from a two-line floor), up to the box, and scrolls past that. The box is
   shared, so Record set's body and every zone's text box get this too.
3. **Every form's record indent squeezes the stat block at phone width.** Under
   the stat block's 360px container query, an open form's detail drops
   `--sheetsmith-record-indent` and starts at the box's own padding. The
   chevron stays on the summary line. Above 360px, nothing changes.
4. **At HP below 0 the sentence reads "At 0."** The sentence names the stored
   value as the tile draws it: *At 0. Carry any leftover damage over by hand.*
   at 0, and *At −3. Carry any leftover damage over by hand.* at −3. The value
   keeps `--text-error` and the form stays on, as before. *Superseded in
   0.9.0: at 0 the number alone, with no error colour and no sentence, since 0
   may be a capped field's normal state; the sentence and colour start below 0
   (`docs/SPEC.md` §13).*

### Interactions, against `docs/UI.md` §6 and §7

No new sheet gesture. Cells and fields are `editable.ts`. A text box is
`drawRecordBody`'s press-to-edit. A collapsed zone is `bindDisclosure`. A
delete is arm-then-commit. The picture field is `picture-frame.ts`'s. Every
button keeps the 44px coarse-pointer target. Each edit is one `onEdit`, so one
save and one step back in the note's history.

### The zone editor

**One field, Zones**, kind `'zones'`, in `editor/zones-field.ts`, drawn on the
shared list frame (`addControls`: the remove, the footer's add, the up and down
arrows and the drag the outer lists already have). Each zone is **a stacked
card, never a wide row**, so phone width costs nothing:

- line 1: **Key** (a one-row field) and **Type** (a native select offering
  *Table*, *Features* and *Text*). On `vitals` and `changes` the type select is
  replaced by the muted words *Built in*, their **Key** is drawn as text rather
  than a field, since that key is what makes it built in *(changed at the land
  stop)*, and their remove control is not drawn, because a built-in can be
  placed but not removed.
- line 2: **Heading**. On a built-in it is optional and changes the sheet
  only. On a body zone it is required, and it is what the note stores.
- line 3, by type: a table zone's **Columns**, a nested list
  (`nested-list-field.ts`) of key, type (*Text* or *Number*) and optional
  display name, with at least one line, the first naming each row; a text zone's
  **Collapsed** checkbox (`checkField`); nothing for a features zone.

**Add zone** appends a text zone with a fresh key (`zone`, `zone_2`, and so on)
and a fresh heading (*Notes*, *Notes 2*, and so on), since two headings that
read alike are refused. **On a blank list it first writes the blank list's own
reading** — `vitals`, `changes` and the closed **Details** text zone — and
then the new zone, so adding a zone changes nothing a note already draws: a
0.9.0 body's prose stays under the closed Details instead of moving under the
open new zone, and the built-ins arrive on the list where they can be moved.
Switching a zone to **Table** gives it one column, `Name`, if it has none,
since a table zone with no columns is refused; switching away from **Text**
drops `collapsed`, which only a text zone may carry. *(Recorded in the build.)* A heading commit carries the rename intent
(`addressesHeading`) into the vault-wide migration. A key commit migrates
nothing, because the key is layout identity and appears in no note. Below
400px of panel width every control on a card takes the full width, a nested
column line wraps its type select under its key, and nothing scrolls
sideways. The `layout-editor-narrow-regime.md` rules hold. A removed zone
leaves every note's blocks where they are, as drift (§10), and the remove
control's `describeRemoval` says so: *Its text stays in every note and shows
as not in this layout.*

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `recordName` | text | Record name | Unchanged. |
| `fields` | columns | Fields | Unchanged. |
| `exclusive` | text | One at a time by | Unchanged. |
| `uses` | formula | Uses | Unchanged. |
| `spendOnPick` | boolean | Choosing spends a use | Unchanged. |
| `zones` | zones | Zones | What each record's body is made of, in the order it is drawn: tables, named features or text, each under a heading the note stores, plus the record's vitals and changes, which can be moved but not removed. Renaming a heading renames it in every note on this layout. Removing a zone keeps its text in every note, shown as not in this layout. A collapsed text zone is closed in play and drawn open under Every form, where it is filled. Blank draws the vitals, the changes, then the body as text under a closed Details heading. |
| `image` | boolean | Picture | Each record may open its body with one picture, drawn beside its name in play. The picture is an embed line in the note, so renaming the file updates it. Off, that line is read as ordinary text. Off by default. |
| `hideLabel` | boolean | Hide label | Unchanged. |

**Removed outright**: `actions`, `actionName`, `bodyName`, `sections`. No config field
declares them and nothing reads them. A layout still holding one is reported as a
configuration error naming the keys present (Design, Errors). `formulaFields` is
unchanged (`uses`, `reset.*.to`), because no zone holds an expression.

**One zone's shape** (`StatBlockZone`): `key`, and for a body zone `type`
(`table` | `features` | `text`) and `heading`. A table zone adds `columns`
(`{ key, name?, type?: 'text' | 'number' }[]`, the first naming each row). A
text zone adds `collapsed` (boolean, default false). On a built-in, `heading`
is a display heading only: `vitals` draws none by default, and `changes` heads
each modifier field's section, as `sections` did.

**Blank `zones`** reads as `[vitals, changes, { key: 'details', type: 'text',
heading: 'Details', collapsed: true }]`. That is today's blank exactly: a closed
**Details** over the prose.

**The Forms palette entry** prefills no `zones`. That keeps the rule
character-forms set: each zone list is one system's.

**The 5e starter's `forms`**: `zones` is `vitals`, `changes`, then a table zone
`attacks` headed **Attacks** with columns `Attack`, `Bonus` (number) and
`Damage`, then a text zone `traits` headed **Traits** with `collapsed` on. That
reproduces today's drawing with one difference, which is **the owner's
decision**: the zone is headed **Attacks**, and its first column's heading,
**Attack**, is shown. The two no longer match, so the screen-reader-only rule
for a column heading that repeats its zone heading does not apply, and that is
the intended result. `actions`, `actionName` and `bodyName` are deleted from the
starter.

## Data and file model

````markdown
### Brown Bear
```sheet
Active: yes
HP: 22 / 34
Speed: 40 ft., climb 30 ft.
Modifiers: abilities.STR = 4; abilities.DEX = 0; abilities.CON = 3; armour_class = 11
```

![[Brown bear.png]]

#### Attacks

| Attack | Bonus | Damage |
|---|---|---|
| Bite | 6 | 1d8+4 piercing |
| [[Claws (Brown Bear)\|Claws]] | 6 | 2d6+4 slashing |

#### Actions

**Multiattack.** The bear makes two attacks: one with its bite and one with its claws.

**Roar (1/Day).** Each creature within 30 feet must succeed on a DC 12 Wisdom saving throw.

- On a failure it is frightened until the end of its next turn.

#### Reactions

Not a zone in this layout: drift, shown and kept.

#### Traits

***Keen Smell.*** The bear has advantage on Wisdom (Perception) checks that rely on smell.
````

**Reactions is drift because it follows a features zone.** After a text zone it
would be that zone's own text, by the `####` trap below, so it sits before
Traits here. *(Corrected in the build: the example first put it after Traits,
against its own rule.)*

**What a record's `rest` is made of.** `records.ts`'s `rest` is everything
after the record's fence. A new pure module, `src/parse/zones.ts`, splits it into
pieces that concatenate back to it exactly, so Constraint 3 holds by
construction, as `splitRecords` holds it one level up:

```
rest = picture? + lead + block*
```

- **The picture line** is only looked for where the layout turns **Picture**
  on. It is the rest's first non-blank line where all of the following hold:
  - the line is one embed and nothing else, on `parse/wikilink.ts`'s
    `parseEmbed`, the Image component's own strict reading;
  - it starts at column 0;
  - the line after it is blank, a zone-heading line, or the end of the rest.
    Its own paragraph, in other words: an embed running into a sentence on the
    next line belongs to that paragraph, and is prose.

  The picture piece is the leading blank run, that line and the blank run
  after it. **A 0.9.0 body whose prose opens with a lone embed paragraph**
  reads as having a picture, but only in a layout that turns **Picture** on.
  Nothing is written, and turning it off reads the line as prose again. A body
  opening with a table never has a picture.
- **The lead** is everything up to the first zone-heading line. In a body
  written by this build, it is blank.
- **A block** is a zone-heading line and everything up to the next one.

**A zone-heading line** is a line matching `^####[ \t]+\S` at column 0,
**outside a fenced code block**. Everything else is content. That includes:

- `> #### X`, and a callout's heading, which is inside a blockquote;
- ` #### X`, which is indented;
- `#####` and deeper;
- a setext heading;
- any `####` between an opening and closing fence of three or more backticks
  or tildes at column 0. A fence that never closes runs to the end of the
  record, which is what Obsidian draws.

`### ` still ends the record and `## ` the section, by `records.ts` and
`parse/character.ts`, which do not track fences. **The asymmetry is
deliberate.** The record and section levels hold structure the plugin writes.
A zone holds the reader's own markdown, where a code block holding `####` is
ordinary, and Obsidian's outline does not count a heading inside a fence or a
quote. So at this level the plugin sees the headings the reader sees.

**The tolerant match.** A heading's key for matching is computed in this
order:

1. take the line's text after `####` and its whitespace;
2. drop an ATX closing run (whitespace then `#`s at the end);
3. trim;
4. drop a trailing run of `.:;,!?`;
5. trim again;
6. lower-case it with `toLowerCase` (not locale-sensitive).

Internal spacing is not collapsed, and emphasis is not stripped: `#### **Traits**`
is drift. The same function normalises the layout's headings, and
`configError` refuses two that come out alike.

**Which block is which zone.** In file order:

1. A block whose key matches a zone the record has not yet claimed is that
   zone.
2. A block matching an already claimed zone is drift (the second-heading
   case).
3. A block matching no zone joins the block before it where that block is a
   text zone, or the lead where the lead's prose went to a text zone. It
   becomes part of that zone's text (the `####` trap). Anywhere else it is
   drift.

**The lead, by today's rule.** Where the lead is not blank:

- its leading table, by `splitLeadingTable`, goes to the first table zone, its
  columns matched by header, case-insensitively, as today;
- the rest goes to the first text zone, through `bodyText`;
- with no table zone, the table is part of the prose, as today with no
  `actions`;
- a part whose zone also has its own `####` block is drift, *Before the first
  heading*: the heading wins, and nothing is merged;
- a part with no zone of its type to go to is drift too.

**A table zone's content** is read by `readTable` after `splitLeadingTable`,
skipping the blank line under the heading. Text after the table is kept and
drawn read-only. No table at the head is the zone's error.

**A features zone's content**, by a new pure module, `src/parse/features.ts`:

- **Paragraphs** are runs of non-blank lines separated by blank lines, with
  fenced code blocks kept whole.
- **An entry paragraph's first line opens, at column 0,** with one of
  `***Name.***`, `**Name.**` or `__Name.__`. The name runs up to the first
  `.` that sits immediately before the closing delimiter, so
  `**Str. Save.**` is not split early.
- **The qualifier** is a trailing `(...)` with no nested parentheses at the
  end of the name, before the full stop. It is split off with the whitespace
  before it: `Bite (3/Day)` gives name `Bite` and usage `3/Day`.
- **An entry** runs from its paragraph to the next entry paragraph or the end
  of the zone. Everything before the first entry is the lead text.
- **Not an entry**, and so continuation text: `**Name**.` with the full stop
  outside the bold, `*Name.*` in italics alone, and a list item opening with
  `**Name.**`.

**What is lost, by design.** 5e's Multiattack and Spellcasting have structured
children (the attacks Multiattack names, the spell list by level), and 13th
Age writes nested trigger lines (`*Natural 16+:* …`). Under this parse they are
continuation text inside their entry. They render as the note writes them and
edit as text. None of it is a field, a row or a reference the sheet can count.
A reader who wants a spell list as rows puts it in a table zone.

**Writes, each touching only its piece.**

- **A table zone** writes through `writeTable`, so cells compare unescaped,
  `|` is escaped to `\|` on the way in, and an unchanged row keeps its bytes.
  **`[[Note|Alias]]`** is stored as `[[Note\|Alias]]`, Obsidian's own spelling
  for an alias inside a table. It reads back as `[[Note|Alias]]`, is drawn as a
  live link, and an unchanged commit writes nothing. A hand-written unescaped
  `[[Note|Alias]]` in a row is split there by this reader, exactly as
  Obsidian's renderer splits it (its help page tells readers to escape it), so
  the sheet draws the cells Obsidian draws, and an edit lands in the cell the
  reader sees. A table zone's whole table is read, every row, and a test pins
  it, against the research's SWADE report of a weapons table that drew only its
  last row.
- **A features entry**: a name or usage edit rewrites only the bold run, in
  the note's own delimiters (`***`, `**` or `__`), as `<d>Name (Usage).<d>`.
  An empty usage drops the parenthesis and the space before it. A text edit
  replaces the entry's text after the bold run, through the entry's end,
  keeping its trailing blank run. **Add entry** appends
  `**Entry.** ` with a blank line before it, in `**` because nothing earlier is
  being preserved. A delete removes the entry's lines and the blank run that
  separated it from the entry before it.
- **A text zone** writes through `writeBodyText` inside its block, keeping the
  heading line and the block's own framing.
- **The legacy lead** is edited in place, by today's `withBody`. Its table goes
  through `writeTable` and its prose through `writeBodyText`, and the lead
  gains no heading. **"The first edit to a zone with no heading yet"** means
  the first edit to a zone **with no content anywhere in the record**: that edit
  writes a new block, `#### <heading>`, a blank line, then the content.
- **Where a new block goes.** Before the first existing block of a zone the
  layout orders after it. Otherwise after the last block, but before the
  record's trailing blank run, so the gap above the next `###` is unchanged. A
  blank line is added above it where the piece before does not end in one.
- **An edit that empties a zone** leaves its heading line in place with
  nothing under it. Removing structure the reader may have typed is not this
  gesture's job.
- **The picture**:
  - **set where there is none**: it goes after the rest's leading blank run,
    as `![[target]]` then a line ending, plus a blank line where the next line
    is not blank. An empty rest gets `\n![[target]]\n`;
  - **replace**: only the line's text changes, keeping its line ending;
  - **clear**: the line and the one blank line inserted after it are removed.

  So setting a picture and clearing it restores the body byte for byte, which
  a test pins over an empty rest, a rest of prose, a rest opening with a table
  and a rest opening with `####`.
- **A record with no fence** (no fields) has a `rest` that is the whole body.
  Everything above holds unchanged.

**The heading rename migration.** `parse/zones.ts` exports
`renameZoneHeading(rest, from, to)`. It rewrites each zone-heading line whose
key matches `from`'s, through `renameHeadingLine(line, 4, to)`, which keeps the
`#### ` prefix and the line ending. It returns `collision` where the rest
already holds a heading matching `to`. `component-rename-migration.ts` applies
it per record through `splitRecords` / `joinRecords`, as a per-record key
rename does. A record that collides keeps its old heading and counts as
`partlyKept`, and a note with every record colliding counts as `collided`.
`migrationMessage` gains the heading kind's sentence. A legacy lead has no
heading, so nothing in it moves. A drift block headed like `to` is a
collision, refused, never merged.

**Constraint 2.** Every link lives in plain markdown: table cells, entries,
text, drift and the picture line. The fence still refuses a link at commit, by
`fenced-link.ts`, unchanged.

**Constraint 3.** The record's pieces come from `records.ts`, the rest's pieces
from `zones.ts`, the cells from `table.ts`, the entries from `features.ts` and
the text from `markdown-body.ts`. A write rebuilds only the piece it was asked
to change.

**Constraint 4.** A removed zone, a renamed heading, a changed type and a hand
edit all leave bytes where they are. The worst case is drift, which is drawn.

## Acceptance criteria

**Parsing (`src/parse/zones.test.ts`, `features.test.ts`)**

- [x] `splitZones` then `joinZones` is the identity over a corpus holding: a
      0.9.0 body (a table, then prose); a body of `####` blocks; a lead plus
      blocks; CRLF line endings; no trailing newline; a picture line; an
      unclosed code fence; and `> #### X`.
- [x] A `####` line inside a backtick fence, a tilde fence, a blockquote, a
      callout and an indented line is content, one test each.
- [x] The tolerant match treats `#### Traits`, `####   traits  `,
      `#### Traits:`, `#### TRAITS.` and `#### Traits ##` alike, and
      `#### **Traits**` differently.
- [x] An unrecognised `####` after a text zone is part of that zone's text.
      After a table zone, a features zone or another drift block, it is drift.
- [x] A second block matching a claimed zone is drift, and the first is the
      zone.
- [x] A 0.9.0 body reads its leading table into the first table zone and its
      prose into the first text zone, with no write. With no table zone, the
      table is part of the prose.
- [x] Features: all three name spellings parse; `**Bite (3/Day).**` gives name
      `Bite` and usage `3/Day`; `**Str. Save.**` is one name; `**Name**.`, an
      italic-only name and a list item opening in bold are continuation text;
      text before the first entry is lead text; a list and a fenced block stay
      inside their entry.
- [x] A name, usage or text edit to an entry in each of the three spellings
      writes that spelling back, and every other byte of the zone is unchanged.
- [x] Picture: read only where **Picture** is on; not read when the embed runs
      into a sentence on the next line, when it is a bare path, `![](…)` or a
      link; setting then clearing it is byte-identical over the four rests
      named in Data and file model.

**The table zone's escaping (owner addition)**

- [x] A cell committed as `A | B` is written as `A \| B` and reads back as
      `A | B`.
- [x] A row holding `[[Claws (Brown Bear)\|Claws]]` reads as
      `[[Claws (Brown Bear)|Claws]]`, draws a live link in play, and survives a
      commit to a neighbouring cell with its bytes unchanged. Committing that
      cell unchanged writes nothing. All named in one test,
      `round-trips an aliased wikilink through a table zone`.
- [x] A table zone with five rows draws five rows.

**The component**

- [x] `contract.test.ts` passes with `stat-block bare`, `stat-block Forms` and
      `stat-block example` in `SWEPT`. The example declares a table zone, a
      features zone and a text zone. No rule is relaxed.
- [x] Zones draw in the layout's order. An unlisted `vitals` is drawn first,
      and an unlisted `changes` comes after it, before the listed zones. Blank
      `zones` draws the vitals, the changes and a closed **Details** over the
      prose.
- [x] In play, an empty zone of each type is absent from the DOM: no heading,
      no box. Under Every form all three are present with their add controls
      or placeholders.
- [x] A drift block draws under its own heading with *Not in this layout* and
      its sentence, read-only on both faces. A second-heading block and a
      lead-drift block draw their own sentences.
- [x] A table zone holding prose draws the *Not a table* error with the prose
      under it, offers no add or cell fields, and the other zones still edit.
- [x] The first edit to a zone with no content writes one `#### <heading>`
      block, placed by layout order, with every other byte unchanged. An edit
      to a 0.9.0 lead's table or prose writes in place and adds no heading.
- [x] Each commit guard is refused with its sentence, one test each, and
      nothing is written.
- [x] Each guard added in the build is refused with its sentence, one test per
      refused spelling, and one near miss per guard is written: a stop outside
      the bold, a bold name on the entry's own first line, a parenthesis inside
      a name, a `####` past a cell's start, and an embed running into a
      sentence.
- [x] `configError` covers every case under Error states, one test each.
- [x] A Stat block holding `actions` and `bodyName` reports *Zones replaced
      actions and bodyName. …*, naming only those two, and the same with each of
      the four keys alone. While it stands, `read` returns the error, `render`
      draws only `.sheetsmith-error`, and no `onEdit` fires. Named in one test,
      `reports the keys zones replaced`.
- [x] **Picture**: with it on, a picture line draws a thumbnail before the name
      in play. With no line nothing is drawn. A missing file draws
      `picture-frame.ts`'s sentence under the head. Under Every form the frame
      and its field are drawn, and a bare path is refused there with Image's
      sentence and writes nothing.

**The migration**

- [x] `component-rename-migration.test.ts`: renaming **Traits** to
      **Features** rewrites `#### Traits` and `#### traits:` in every record
      of every note on the layout, byte-identical otherwise. A record already
      holding `#### Features` keeps `#### Traits` and is counted as kept. A
      legacy lead is untouched. One `Notice` reports the counts. A rename that
      matches nothing says nothing.
- [x] A zone key rename writes no note.
- [x] Removing a zone writes no note, and its blocks draw as drift.

**The editor**

- [x] `zones-field` draws each zone as a stacked card: key and type; heading;
      then columns for a table zone, **Collapsed** for a text zone, and nothing
      for a features zone. A built-in shows *Built in*, with no type select and
      no remove control.
- [x] A table zone's columns reorder with the nested list's arrows, and the
      sheet's columns follow the new order.
- [x] At a 380px panel no control overflows and nothing scrolls sideways,
      asserted in a test where measurable and shown in a shot.

**The four fixes**

- [x] The form tag sits on the box's bottom inline-end corner, reaching into
      no content box and overlapping no element drawn in it, with at least 3px
      of the gap below, at `text=15`, `text=16` and `text=24`, measured in the
      harness and checked in the vault, with the box the same size on and off.
- [x] `drawRecordBody`'s textarea grows with a typed line and floors at two
      lines, on a Stat block and on a Record set.
- [x] At 380px an open form's vitals start at the box's padding, not the
      record indent.
- [x] At `HP: -3 / 34` the sentence reads *At −3. Carry any leftover damage
      over by hand.*, and at 0 it read *At 0. …* (superseded in 0.9.0: at 0
      the number alone, no sentence).

**The starter**

- [x] `src/starters/5e.json`'s `forms` holds the zones listed under Config
      fields and none of `actions`, `actionName` or `bodyName`. It installs
      unchanged, and the starter tests pass.

**Harness and review**

- [x] `harness/samples.ts`'s Wild Shape sample holds Brown Bear as in the Data
      section: a picture, an Attacks table with an aliased link, Actions
      features with a usage and a list, a Reactions drift block after
      Actions, and collapsed Traits. Wolf is a 0.9.0-shaped body. A third form, a Fate mook, has empty
      zones.
- [x] New shot views, each with an explicit frame:
      - `sheet-forms-zones`
      - `sheet-forms-zones-dark`
      - `sheet-forms-zones-narrow` (380px)
      - `sheet-forms-zones-empty` (the mook, in play)
      - `sheet-forms-zones-library` (Every form, Brown Bear open)
      - `sheet-forms-zones-drift`
      - `sheet-forms-zones-error`
      - `sheet-forms-picture`
      - `sheet-forms-picture-missing`
      - **one per zone option**: `sheet-forms-zone-collapsed` (closed in play)
        and `sheet-forms-zone-expanded` (`collapsed` off), each showing the
        option's editor label beside the sheet it produces
      - `editor-stat-block-zones` and `editor-stat-block-zones-narrow` (380px)
      - `sheet-forms-tag-text-15`, for the tag fix
      - `sheet-forms-library-narrow`, re-shot for the indent fix

      Fresh `npm run harness` then `npm run harness:shot` output goes to the
      design review.
- [x] The docs commit's `SPEC` §10 states the asymmetry: an unmapped `##`
      section stays quiet, while an unmapped `####` zone inside a record is
      drawn as drift. No test reads the docs, so this is checked by reading
      §10 at the land stop.
- [x] `npm run lint` (at `--max-warnings 0`), `npm test` and `npm run build`
      pass. New code follows `docs/PATTERNS.md`: `parse/zones.ts` and
      `parse/features.ts` import nothing from `obsidian`. The zone drawing
      sits in a painter beside `stat-block.ts`, with its sibling allowlist
      entry and its `isolation.test.ts` line, if `stat-block.ts`'s job
      sentence needs an "and" without it.

**The vault fixture** (`~/Developer/sheetsmith-test-vault/`, outside the
repository by `AGENTS.md`'s rule, so the recipe is here):

- [x] **Build step: move the fixture layout to `zones`.** Until it moves, every
      Stat block in `Sheetsmith layouts/Stat block variations.sheetsmith` shows
      the replaced-keys error, because each one carries `actions`, `actionName`,
      `bodyName` or `sections`. So the build first opens the layout and sees
      that error on each Stat block, as a check on the report. It then deletes
      those keys in every group and gives each Stat block its `zones`:
      - the Werewolf's Forms and the Beastform: vitals, changes, and a text
        zone, Details, collapsed. That is the old blank default, so their notes
        draw as before;
      - the Familiar: vitals and a text zone, Notes, not collapsed;
      - the Moon druid's Wild Shape, as below.

      After the move the layout holds no replaced key anywhere, and every
      group's notes draw with no error. The Moon druid's Wild Shape gets:
      - zones: vitals, changes, Attacks (table), Actions (features), Traits
        (text, collapsed);
      - **Picture** on.

      `Characters/Forms.md` gets:
      - Brown Bear as in the Data section;
      - `Brown bear.png`, any small picture placed at the vault root;
      - Wolf left in its 0.9.0 shape;
      - a Reactions drift block on Brown Bear, between Actions and Traits;
      - a hand-renamed `#### Traitz` on Wolf, after a lead holding only its
        table: after lead prose, which goes to the Traits text zone, it would
        be that zone's text rather than drift.

      A new group, **Fate NPCs**: a Stat block with no `exclusive`, fields
      `Stress` (number, record ceiling) and `Mild` and `Moderate` (text), and
      zones Aspects (text), Skills (table: Skill, Rating number) and Stunts
      (features). It holds a mook with only Skills filled and a main NPC with
      everything.
- [x] What to press, in order:
      1. See Brown Bear's picture, table, features and closed Traits in play.
      2. Open Traits.
      3. Under Every form, add an entry to Actions, give it the usage `2/Day`,
         and see `**Name (2/Day).**` in markdown view.
      4. Edit Wolf's attack cell and see no `####` added.
      5. Add a feature to Wolf and see `#### Actions` appended.
      6. Rename the Traits zone's heading in the layout editor, then see the
         `Notice` and `#### Traitz` left as drift.
      7. Type `#### Actions` into a text zone and see the refusal.
      8. Rename `Brown bear.png` in the file explorer and see the picture
         follow.
      9. Open the mook and the main NPC in **Fate NPCs**. The block has no
         `exclusive`, so it has no In play face: every record is drawn as
         Every form draws it, the mook with its Skills table filled and empty
         Aspects and Stunts showing their placeholders to be filled, the main
         NPC with every zone filled. *(Corrected at the land stop: the step
         said the mook drew only its Skills, which In play would do and a
         block without a picker has no In play to do it in. The empty-zone rule
         is checked on Wild Shape's mook-shaped form in the harness,
         `sheet-forms-zones-empty`.)*
      10. Repeat the four fixes' checks in the app.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through the
build and every round of findings.

1. `fix: Keep the form tag clear of the card label`. The pill's move to the
   bottom inline-end corner, its test, the measure script and the `text=15`
   shot.
2. `fix: Grow a record body's edit box to fit its text`. `drawRecordBody`'s
   textarea and its test.
3. `fix: Give an open form the whole width on a phone`. The container-query
   rule and the re-shot.
4. `fix: Say the number when a form drops below 0`. The sentence and its test.
5. `feat: Read a record body as headed zones`. `parse/zones.ts`,
   `parse/features.ts` and their tests. Nothing calls them yet.
6. `feat: Let nested lists in the layout editor reorder`. The arrows on
   `nested-list-field.ts` and its tests.
7. `feat: Add a zones field to the layout editor`. `ConfigFieldSpec`'s `zones`
   kind and `addressesHeading`, `editor/zones-field.ts`, its dispatch and
   tests.
8. `feat: Shape a stat block's body with zones the layout declares`. The
   component's config, read, write, render, drift, errors, guards, `example`
   and `sample`, the starter's `forms`, and tests.
9. `feat: Give a form a picture beside its name`. The `image` field, the
   picture line, the head and the Every form frame, and tests.
10. `feat: Carry a zone heading rename into every note on the layout`.
    `RenameIntent`'s heading kind, `renameZoneHeading`, the per-record scan,
    the sentence, and tests.
11. `test: Show zones in the harness`. The samples and the shot views.
12. `docs: Record stat block zones`. `SPEC` §4.2's Stat block entry (config,
    data, sheet view), §3.1's line on a record's body, §10's rename bullet
    gaining zone headings. §10 also gains **the stated asymmetry**: an
    unmapped `##` section stays quiet, because a note carrying sections beyond
    its layout is ordinary. An unmapped `####` zone inside a record is drawn as
    drift, because it sits inside a component's own section and the component
    is the only thing that could show it. It also covers the §13 entry, whose `Resolved:` line is
    `/land-it`'s. Also `docs/UI.md` §9's stat block row (zones, drift, the
    picture) and the BACKLOG rows this closes or opens.

## Deliberately not doing

- **A `fields` zone type and an image zone type** (answer 1).
- **Zones per record**, and any way for a note to add one (answer 5).
- **State in a zone**: a counter, a checkbox or a used-today mark inside a
  table row or entry (answer 6). Uses belong in a fence field.
- **Any option besides `collapsed`, and `collapsed` on table or features
  zones.** No demand was found, and Fantasy Statblocks' `collapse` is the only
  prior art. **No library-only zone**, no per-zone condition, no per-zone
  columns setting, and no markdown opt-in per type: every zone renders
  markdown already.
- **Structure inside a feature**: Multiattack's attack list, Spellcasting's
  spell levels and 13th Age trigger lines stay text (Data and file model,
  what is lost).
- **Reordering entries or table rows on the sheet.** The note is the order.
- **Editing drift from the sheet.** It is read-only, with markdown view as the
  route.
- **Migrating a 0.9.0 body into headings**, on load or on any edit to its
  lead.
- **Reading the old `actions`, `actionName`, `bodyName` and `sections` keys.**
  They are reported as a configuration error and never interpreted, and nothing
  rewrites a layout to remove them.
- **A chosen tint colour per form; value labels instead of keys in change
  lines; a form's picture standing in for Portrait.** These are out of scope
  for this run. The tint colour has since been built
  (`docs/features/form-tint-colour.md`).
- **Tracking code fences for `###` and `##`.** That rule is the record's and
  the section's, unchanged.
