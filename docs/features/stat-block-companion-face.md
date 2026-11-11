# Stat block companion face

Status: shipped (approved by the owner 2026-11-11, with three amendments folded in: the name's size, its stamped class, and `drawThumb`'s insertion point and sentence; landed in `release/0.9.1`)
Board card: A Stat block with no `exclusive` (a companion block: a Familiar, Fate NPCs) has no reading face, so empty zones show to be filled and `collapsed` does nothing.

## Model question

None. The owner settled the one question there was (2026-11-11, recorded in
`docs/SPEC.md` §13 and `docs/features/character-forms.md` "No exclusive
configured"): **a companion block reads as In play does at rest, and its editing
sits behind one press** on the picker's own face mechanism. That was option 1.
The face is the view's reader posture (`activeTab` / `onActivateTab`), so nothing
is stored, nothing is published, the contract does not grow, and Constraints 3 and
4 are untouched (Data and file model).

**This is a visible change to existing layouts.** Every layout with a Stat block
and no `exclusive` now opens on the reading face, where it used to open on the
edit form. No layout in the owner's own vault has a companion block, so the
change reaches only the test vault's variations (the Familiar and Fate NPCs
groups in `Stat block variations.sheetsmith`).

## What it does

A Familiar or a list of Fate NPCs reads like a stat block: the record's name as
its title, its tiles, its tables and features as text, an empty zone left out,
and a `collapsed` zone closed until opened. HP's steppers, a toggle's ring and the
prose's press still work at the table. One press in the foot, **Edit familiars**,
draws today's edit form (rename, delete, add, fields in table cells, features,
modifiers, Picture). **Done** returns to the reading face.

## Smallest version

The reading face is today's list with each open record drawn by
`drawForm(…, editing: false)`, names as text, no delete and no foot **Add**. The
foot holds **Edit <noun>s** / **Done** and closes both BACKLOG rows. It drops
three things. The picture on an open record's line at rest (a companion's picture
shows only behind the press). The focus handoff on the two presses (focus falls to
the document, as In play's switch lets it today). And the harness matrix beyond
light and narrow.

## Design

Everything below applies only where `exclusive` is blank. **A block with
`exclusive` is untouched**: In play, its briefs, Every form, the tint and the zone
editor draw exactly as they do today.

### Two faces, on the picker's mechanism

The companion block gets the two face indices the picker already uses.
`PLAY_FACE` (0, and undefined) is its **reading face**, and `LIBRARY_FACE` (1) is
its **edit face**. `render` reads `context.activeTab` for every block, not only
an exclusive one: `face = context.activeTab === LIBRARY_FACE ? LIBRARY_FACE :
PLAY_FACE`. `paint()` then dispatches on `exclusive` and `face`:

| | face 0 | face 1 |
| --- | --- | --- |
| `exclusive` set | `drawPlay()` (unchanged) | `drawLibrary(true)` (unchanged) |
| `exclusive` blank | **`drawLibrary(false)` reading** (new) | `drawLibrary(false)` editing, as today plus **Done** |

The build may name the reading branch as it likes: a mode argument on
`drawLibrary`, or a sibling `drawCompanion`. **One list-drawing loop serves both
companion faces**, since the line, the disclosure, the open set and the detail
region are the same, and only the mode handed to `drawForm` and the line's
controls differ. `setFace` is reused as it is: paint first, then report
(PATTERNS §5), because a face switch writes nothing and so triggers no rebuild.

### The reading face

**The component's label** and, where `uses` is set, **the uses counter beside it**.
This is where the counter sits today on a companion block, and it is live: a press
on a ring, or an arrow key, spends or restores a use.

**Every record in file order, as a disclosure list**, `.sheetsmith-record` /
`-summary` lines in `.sheetsmith-stat-block-list`, as the edit face draws them. It
stays a list rather than In play's single head because a companion block holds
several records at once and all of them apply: a Fate scene's mooks are scanned
by their closed lines and opened one at a time. **The first record is open by
default** (`defaultOpen`, unchanged). A Familiar is usually the only record, so it
reads whole on arrival.

**A record's line:**

- The chevron (`bindDisclosure`, as today).
- **The name as read text, not a field.** It is `drawRecordName`'s plain branch,
  `paintLinkedText` with a wikilink live, reached through a new read-only option
  on `drawRecordName` (`components/record-controls.ts`) rather than a second
  painter. The option leaves Record set's behaviour unchanged. **The name takes
  In play's title size, open or closed** (`--font-ui-large`, bold), as the edit
  face's name field already does (`docs/features/stat-block-in-play-polish.md`
  §3, `src/styles/sheet.css`'s "A form's name takes In play's title size, open
  or closed" rule). A name that jumped a step on every press of the chevron
  would read as a second control, so open and closed differ by the chevron, the
  open line's rule and the closed line's summary, never by type size.
- **The size comes from a stamped class, not from `:has()`.** The reading
  branch in `stat-block.ts` stamps `sheetsmith-stat-block-name-read` on the
  plain name cell (`.sheetsmith-record-name.sheetsmith-record-name-plain`) right
  after `drawRecordName` returns it, inside the record's summary line. The class
  joins the title-size rule's `:is(…)` list beside
  `.sheetsmith-record-name-input` and `.sheetsmith-record-name-layer`, so one
  rule sizes every stat block name, and its specificity beats
  `.sheetsmith-record-name-plain`'s own `--font-ui-small`. Record set's plain
  name, which never carries the class, keeps its size. The open line's rule
  under the name is the existing
  `.sheetsmith-stat-block-record > .sheetsmith-record-summary:has(> …[aria-expanded='true'])`
  rule, unchanged. That rule only rules the line off and sets no type size.
- **Closed, the record's vitals on the line** (`closedLine`: its numbers, `HP 3/3`; a text field is
  left to the open record), hidden while open, exactly as the edit face's closed line.
- **No delete glyph, no Active tag** (there is no picker), and no tint.

**An open record's stat block is `drawForm(…, editing: false)`, In play's
reading**, so it is drawn by the same function In play uses:

- the vitals as tiles. A text vital is read words, a ceilinged number is Pool's
  reading with its field and `−` / `+` steppers live, a plain number is its field,
  and a toggle is its ring, live. A number below 0 gets the error colour and its
  sentence;
- the changes under their heading with the `zap` glyph, **unlabelled, as In play
  draws it**. The labelled **Edit changes** belongs to the edit face. In play has
  always drawn the glyph, and "reads as In play does" carries it;
- a table zone as text, with the placeholder row left out;
- a features zone as its own markdown;
- a text zone in the card's clothes, **edited on a press** (`drawRecordBody`), as
  In play's is;
- **an empty zone drawn as nothing**: no heading, no box, no placeholder
  (`drawZone`'s `!host.editing` rule, unchanged). A record whose zones are all
  empty draws its line, vitals and changes and nothing else, with no *None yet*,
  since a Fate mook is a whole stat block;
- **a `collapsed` text zone as a disclosure, closed on first render**,
  `hidden="until-found"` while closed. Its state is held in the module's
  `openZones` set, keyed `<id>:<record>:<zone>` (`drawTextZone`'s `disclosed`
  branch, unchanged);
- drift after the zones in In play's box (`drawDrift(…, editing: false)`).

**The picture, where `image` is on and the record holds one,** is a thumbnail at
the inline start of the open record's name. It comes after the chevron, through
`drawThumb` / `paintThumb`, so it is In play's title-row thumbnail in the head's
place. **`drawThumb` takes its insertion point and the press its sentence
names.** Today it inserts at `row.firstChild`, which on a library summary line
is the chevron, and its sentence is hardcoded *Set it under Every form, in
Picture.* It gains two parameters: the node to insert before, and the words
naming where the field is. The companion's call inserts before the name cell, so
the thumbnail lands after the chevron, and names **Edit <noun>s**. **The name
cell and the thumbnail share one cell of the line**, `div.sheetsmith-stat-block-line-name`,
which the reading face draws in the summary's name column (`grid-column: 2`, a
flex row, the name cell inside it free to shrink and clip). The summary line is
a five-column grid, so a thumbnail inserted loose before the name would take the
name's column and push the name into the vitals' one. The existing
callers, the In play head and the two-on name rows, pass neither, so they keep
`row.firstChild` and *under Every form* exactly as today. **It is drawn only while the record is open**, toggled with the closed
line's vitals in reverse. A closed line is the scan line, as the edit face's
closed line is, and a thumbnail three times `--font-ui-large` tall would make
every closed line a head. A reference that does not draw takes no thumbnail and
says the painter's sentence at the top of the record's detail region, then the
fix: *Set it under Edit <noun>s, in Picture.* (*Edit familiars* on the
Familiar.) This is not In play's *under Every form*: a companion has no Every
form, and the sentence names the press that reaches the field.

**The foot**, pinned outside the scroll where In play's switch sits, holds one
button in the add control's clothes (`.sheetsmith-record-add`, class
`.sheetsmith-stat-block-edit`): **Edit familiars**. There is no **Add** at rest
while records exist, because adding is editing.

### The edit face

This is today's `drawLibrary(false)` exactly: every record a line of chevron,
**name field**, closed-line vitals and **arm-then-commit delete**, with the open
record's stat block under `drawForm(…, editing: true)`. That means table cells as
fields with the delete column and **Add <column>**, features with name, usage and
**Add entry**, text zones as click-to-edit boxes with *Add text*, the **Picture**
section, and the changes glyph labelled **Edit changes**. **Every zone draws,
empty or not, and a `collapsed` zone draws open**, because this is where it is
filled. The foot holds **Done** and then **Add familiar**, split by the hairline,
in the clothes and order of Every form's **Back to play** and **Add form**
(`.sheetsmith-stat-block-back`'s rule, so the hairline stays one rule).
**Add** behaves as today: it appends a record named for the noun, opens it, and
lands focus in its name field.

### The words

The noun is `recordName` lowercased, as every other string in the component has it,
**except in the strings that name the Edit press, where a noun written in
capitals throughout keeps its case**: the Fate block's press is **Edit NPCs**, its
Done is named *Done editing NPCs* and its picture failure says *Set it under Edit
NPCs, in Picture.*, while the Familiar's stay **Edit familiars**. The press and
every reference to it use one noun, so they agree. Every other string keeps the
lowercased noun (*No npcs yet.*, *Add npc*, In play's strings).

- **Edit <noun>s** (the press), and **Done** (the way back). Done's accessible
  name is **Done editing <noun>s**, which starts with its visible word (label in
  name).
- **Not In play's "Every <noun> (N)"**: on a companion the reading face already
  shows every record, so the label would promise a face that adds nothing. The
  count is on screen as the list itself.
- **Not "Back to play"**: nothing is in play. There is no picker and no In play
  face to go back to.
- **Edit / Done is the platform's pairing** for one toggle into and out of an
  edit mode over a list: Apple's list editing, and the way Obsidian's own lists
  leave an editing state. The plural names what the face edits, which is the list
  (add, delete, rename) and not one record. It matches *No familiars yet.*, which
  the component already says.
- Neither press announces through the live region. The face's own controls are
  what a screen reader reaches next (Focus, below), and In play's switch sets the
  same precedent. Add still says *Familiar added* and delete still says what it
  says today.

### Focus

**Where the pressed button held focus, focus goes to the other one**: on entry to
**Done**, and on the way back to **Edit <noun>s**. Each sits in the foot where
the other was, so the keyboard stays where the reader left it. It does not land
in a record's name field, because the press names no record, and putting a caret
in one would invite an unasked edit. **A press that focused nothing is given no
focus** (a tap in a browser that does not focus buttons on click). That is
`docs/UI.md` §6's rule for the arrowed lists, applied to a pair that swaps in
place. It is measured as `doc.activeElement === pressed` before `paint()`
replaces the foot. **Where Done leaves no record to edit**, there is no **Edit
<noun>s** to return to, so focus goes to the empty state's **Add <noun>**, the
control the reading face draws in its place.

### What carries across the two faces

- **Open records: one set for both faces.** `context.openRecords` / `onToggleRecord`
  with `defaultOpen` (first open where no `exclusive` is set) and `shiftOpenRecords`
  on a delete, all unchanged. A record opened at rest is open behind the press, and
  the reverse holds too, so **Edit** on the NPC being read lands with that NPC's
  edit form open. A second set per face would be a fourth posture pair keyed by
  something the reader did not choose. "Which record I am looking at" is one
  fact.
- **Zone disclosures: read at rest only.** The edit face draws every collapsed
  zone open and neither reads nor writes `openZones`, so a trip to the edit face
  and back restores each zone as the reader left it. A delete still shifts the set
  (`shiftOpenZones`).
- **The face survives every redraw.** It is `activeTab`, held by the view per
  component id, so an HP step at rest rebuilds at rest and a rename behind the
  press rebuilds behind it. It is dropped when the leaf moves to another file
  (`sheet-view.ts`), so **a reopened note always opens at rest**.

### Empty states

- **No records, at rest**: *No familiars yet.* and an **Add familiar** button in
  In play's empty-state clothes (`.sheetsmith-stat-block-action`), with no foot.
  This is In play's no-forms state exactly. Add appends one, **switches to the
  edit face** and lands in its name field. `addRecord`'s face switch drops its
  `exclusive` guard, so it switches for a companion too.
- **No records, behind the press** (the last one deleted): *No familiars yet.*
  with **Done** and **Add familiar** in the foot. **Done** returns to the state
  above.
- **An open record with nothing to read** (no vitals, no changes field, every
  zone empty): its line and nothing under it.

### Error states

- **A configuration this component refuses** is unchanged. It is the block's
  `configError`, drawn in its place.
- **The uses count will not read** is unchanged: its problem line beside the label,
  on both faces.
- **A record whose fence will not read**: at rest its name is read text (as today,
  since the plain branch already serves it), its error line sits under the line,
  and its prose is drawn read-only (`drawBroken`). Behind the press it is drawn as
  today. Its bytes survive every neighbour's write.
- **A table zone holding prose**: *Not a table* and the prose read-only, on both
  faces, as In play does.
- **Drift**: In play's box at rest, plain text behind the press, as today.

### Interactions, against `docs/UI.md` §6 and §7

There is no new gesture. Edit and Done are buttons in the add control's clothes,
with the 44px coarse-pointer target that clothes already carries. The chevron is
`bindDisclosure`. The steppers are `hold-repeat.ts`, the rings `bindRingControl`,
the prose `drawRecordBody`, the modifier glyph the anchored form, and delete is
arm-then-commit. More contrast and forced colors take nothing new: the faces are
drawn from existing classes, and the plain name's title size is type, not an edge.

### Config field descriptions (build items)

The `zones` description says *drawn open under Every form*, which names a face a
companion block does not have. The build changes that sentence, and the
`exclusive` one gains the consequence (Config fields, below). `tintPerRecord`'s
*under Every form* stays, because a tint needs `exclusive`.

## Config fields

No new key. Two descriptions change in `stat-block.ts`'s `configFields`:

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `exclusive` | text | One at a time by | The key of a toggle field. Choosing a record turns it on and every other off in one write, and only that record's modifiers apply and tint the sheet. Blank lists every record at once and applies all of them, as a companion block, read until **Edit** is pressed. |
| `zones` | zones | Zones | *(unchanged up to the collapsed sentence, which becomes:)* A collapsed text zone starts closed where the record is read, and is drawn open where it is edited, which is where it is filled. *(rest unchanged)* |

## Data and file model

Nothing about the note changes (Constraint 4), and nothing new is read or
written. The face is reader posture in the view (`activeTab`), never in the note
or the layout. **Pressing Edit, Done or a chevron writes nothing**, so parse then
serialise is byte-identical across any number of face switches (Constraint 3).
Every write the reading face makes is one In play already makes, through the same
commit paths: an HP step, a ring, a prose edit, a use, a modifier. Every write
behind the press is one today's companion block already makes. An existing
layout without `exclusive` needs no migration, because its config is read exactly
as before. The only change is which face it opens on.

## Acceptance criteria

**Unit tests**, in `src/components/stat-block.test.ts`, a new `describe('a companion
block')`. Each criterion is its test's name:

- [x] `opens on its reading face, each name read as text with no field, no delete and no Add while records exist`
- [x] `leaves an empty zone of each type out at rest, and draws it with its placeholder behind Edit` (a Thug whose Notes text, Skills table and Stunts features are all empty)
- [x] `keeps a collapsed text zone closed at rest, and draws it open behind Edit`
- [x] `keeps the HP field and steppers, a toggle's ring, the prose's press and the uses rings live at rest`, each writing through `onChange` on its existing path
- [x] `draws the changes at rest as In play does, the glyph unlabelled`
- [x] `draws a closed record's vitals on its line at rest, and hides them while it is open`
- [x] `opens the edit face with Edit <noun>s and leaves it with Done, writing nothing`. `onChange` is never called, and `onActivateTab` receives 1 then 0
- [x] `reopens on the face context.activeTab holds` (`activeTab: 1` draws the edit face)
- [x] `moves focus to Done on entry and back to Edit on exit, only where the press held focus`
- [x] `carries open records across both faces through one set`. With `openRecords: [0, 1]`, the first is closed and the second open on both faces
- [x] `keeps a zone disclosure's state across a trip to the edit face`
- [x] `says No <noun>s yet. with Add <noun> at rest, which adds, opens the edit face and lands in the new name`
- [x] `says No <noun>s yet. with Done and Add behind the press once the last record is deleted`
- [x] `draws the picture on an open record's line at rest, after the chevron, and none while closed`
- [x] `says a companion's picture failure as Set it under Edit <noun>s, in Picture.`
- [x] `keeps an all-capitals noun's case on Edit and every string naming it, and lowercases any other`: *Edit NPCs*, *Done editing NPCs* and *Set it under Edit NPCs, in Picture.* beside *Add npc*; *Edit familiars* and *Done editing familiars*
- [x] The existing record-picture tests (*Set it under Every form, in Picture.*, the thumbnail first in the In play head and in each two-on name row) pass unchanged
- [x] `draws a companion's name at title size open or closed, by the stamped class`: the plain cell carries `sheetsmith-stat-block-name-read` whether its record is open or closed, and the chevron's press leaves the class in place
- [x] A `src/styles.test.ts` (or sheet stylesheet) check that the title-size rule's selector list names `.sheetsmith-stat-block-name-read` and sets `--font-ui-large`, so the size cannot regress to depending on open state
- [x] `draws a record whose fence will not read with its name, its problem and its prose, read-only at rest`
- [x] The existing `describe('a delete in a companion block')` tests press **Edit** first (a `toEdit` helper beside `toLibrary`) and pass otherwise unchanged
- [x] Every existing test of a block with `exclusive` passes unchanged. That is the proof that In play, briefs and Every form are untouched
- [x] `src/components/contract.test.ts` passes unchanged. Its `stat-block bare` sweep is a companion block and is now swept on the reading face
- [x] `record-controls.ts`'s read-only name option has a test in `record-controls.test.ts`, and Record set's tests pass unchanged
- [x] `npm run lint` (at `--max-warnings 0`), `npm test` and `npm run build` pass. `styles.css` is regenerated from `src/styles/sheet.css`, and the styles test agrees

**Harness.** Five new companion states in `harness/samples.ts` and
`harness/harness.ts`'s state union. **One Stat block per state**, so a `press=`
selector is unambiguous:

- [x] `companion-familiar`: a **Familiar** block (`recordName` Familiar, no
      `exclusive`, fields `HP` number with record ceiling and `Speed` text,
      zones vitals then **Notes**, text, `collapsed` on). It holds an Owl at
      `HP 3/3`, `Speed 5 ft., fly 60 ft.`, and Notes of at least three paragraphs,
      long enough to scroll the box when open.
- [x] `companion-mook`: a **NPCs** block (`recordName` NPC, fields `Stress`
      number with record ceiling, `Mild` and `Moderate` text and `Modifiers`
      modifier, zones vitals,
      changes, **Aspects** text, **Skills** table of Skill and Rating number,
      **Stunts** features). The **Thug** comes first, so it is open by default,
      with only Skills filled (`Fight 1`, `Stress 0/1`). **Baron Corvan** follows,
      closed, with every zone filled and one change, `Modifiers: refresh += 1`,
      which reaches a **Refresh** card (`refresh`, `3 + mod.self`) placed beside
      the block, so the changes zone has a line to read.
- [x] `companion-npc`: the same block with Baron Corvan first and open, and the
      Thug second and closed.
- [x] `companion-picture`: the Familiar block with `image` on and the Owl
      holding `![[Owl.png]]`, so its open line carries the thumbnail.
- [x] `companion-empty`: the Familiar block with no records.
- [x] `harness/shot.mjs` views, generated by one loop as `sheet-forms-tint-${colour}`'s
      are, each with an explicit `frame: '.sheetsmith-stat-block'`. For each
      `<s>` in `familiar`, `mook` and `npc`, at rest and behind the press
      (`press=.sheetsmith-stat-block-edit`, suffix `-edit`), in five
      presentations: light, `-dark`, `-narrow` (380px), `-contrast-more`
      (`prefers-contrast: more`) and `-forced-colors` (`--force-high-contrast`).
      That is `sheet-companion-<s>[-edit][-dark|-narrow|-contrast-more|-forced-colors]`,
      thirty views. Plus `sheet-companion-familiar-open` (at rest,
      `press=.sheetsmith-stat-block-disclosure`, Notes open),
      `sheet-companion-picture` and `sheet-companion-picture-narrow` (380px), and
      `sheet-companion-empty`.
- [x] Looking at them: `sheet-companion-familiar` shows Notes as a closed heading
      and HP with its steppers, with no field border on the name.
      `sheet-companion-familiar-edit` shows Notes open in its box with the name
      field, delete, **Done** and **Add familiar**.
      `sheet-companion-mook` shows the Thug as its name, its vitals, its empty
      changes line (the Modifiers heading, the bare glyph and *No changes*, as In
      play draws an empty modifier field) and Skills only, with no Aspects or
      Stunts heading, and Baron Corvan's closed line reading
      `Stress 1/3`. `sheet-companion-mook-edit` shows the
      Thug's Aspects with *Add text* and its Stunts with **Add entry**.
      `sheet-companion-npc` shows every zone filled and read, the changes as
      *Refresh +1* under the bare `zap` glyph, and `sheet-companion-npc-edit`
      shows the glyph labelled **Edit changes**. `sheet-companion-picture` shows
      the Owl's thumbnail after the chevron, at its name's inline start.
- [x] Fresh `npm run harness` then `npm run harness:shot` output goes to the
      design review.

**The vault fixture** (`~/Developer/sheetsmith-test-vault/`, outside the
repository by `AGENTS.md`'s rule, so the recipe is here). Never touch
`~/Desktop/VaultBackup/`.

- [x] **What it holds today.** `Sheetsmith layouts/Stat block variations.sheetsmith`
      has group **Beastform and companion**, holding Stat block `familiar`
      (label Familiar, `recordName` Familiar, no `exclusive`, fields `HP` number
      `maxSource: record` and `Speed` text, zones `vitals` then `notes`, a text
      zone headed Notes with `collapsed` **off**). It also has group **Fate NPCs**,
      holding Stat block `fate_npcs` (label NPCs, `recordName` NPC, no `exclusive`,
      fields `Stress` number `maxSource: record` and `Mild` and `Moderate` text,
      zones `vitals`, `changes`, Aspects text, Skills table of Skill and Rating
      number, and Stunts features). `Characters/Forms.md` (`sheet-layout: Stat
      block variations`) holds `## Familiar` / `### Owl` (`HP: 3 / 3`, `Speed: 5
      ft., fly 60 ft.`, and a 0.9.0-shaped body of one paragraph, *Flyby*, read
      into Notes by the old rule). It also holds `## NPCs` with `### Thug`
      (`Stress: 0 / 1`, a `#### Skills` table holding Fight 1) and `### Baron
      Corvan` (`Stress: 1 / 3`, `Mild: Bruised pride`, and Aspects, Skills of
      three rows, and Stunts of two entries, one with `(1/Session)`).
- [x] **Build step, made in the app.** In the layout editor, select the Familiar
      Stat block's Notes zone and tick **Collapsed**. In `Characters/Forms.md`,
      add a second paragraph to the Owl's body after *Flyby*, still with no
      `#### Notes` heading, so the 0.9.0 read stays exercised: `***Keen Hearing
      and Sight.*** The owl has advantage on Wisdom (Perception) checks that rely
      on hearing or sight.`
- [ ] **What to press, in order:** *(Open at the land stop: the owner checked the at-rest steps in the app; the Edit and Done steps, 4, 5 and 7, were not pressed in the app.)*
      1. Open `Characters/Forms.md` in the sheet. Familiar: the Owl is open, its
         name read as its title, HP `3 / 3` with steppers, Speed as words,
         **Notes** a closed heading, no name field and no delete. The foot says
         **Edit familiars**.
      2. Press `−` on HP. The note reads `HP: 2 / 3`, and the block stays on its
         reading face.
      3. Open **Notes**. Both paragraphs render. Press the prose, change a word and
         commit. It is still the reading face.
      4. With the keyboard, Tab to **Edit familiars** and press it. The Owl's name
         is a field with a delete, Notes is drawn open in its box, the foot is
         **Done** and **Add familiar**, and focus is on **Done**.
      5. Press **Done**. Notes is as step 3 left it, and focus is on **Edit
         familiars**.
      6. NPCs: the Thug is open with its vitals and Skills only, and no Aspects or
         Stunts heading. Baron Corvan is closed, with `Stress 1/3` on his line. Open him, and every zone reads.
      7. Press **Edit NPCs**. The Thug's Aspects shows *Add text* and its Stunts
         **Add entry**. Press **Done**.
      8. Switch to markdown view. Nothing from steps 1, 4, 5, 6 and 7 changed the
         text. Only step 2's `HP` and step 3's word did.
      9. Open another note, then return. Both blocks are on their reading face.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through the
build and every round of findings.

1. `feat: Read a companion stat block until Edit is pressed`. This covers
   `stat-block.ts` (the face read for every block, the reading branch, Edit and
   Done, the focus handoff, `addRecord`'s face switch, the stamped
   `sheetsmith-stat-block-name-read` class, `drawThumb`'s insertion point and
   press parameters with the companion's call, and the two descriptions),
   `record-controls.ts`'s read-only name option, the stamped class joining the
   title-size rule's `:is(…)` list in `src/styles/sheet.css`, the
   `.sheetsmith-stat-block-line-name` cell's rules there, and the regenerated
   `styles.css`, the new `describe('a companion block')`, and
   the delete tests' `toEdit`.
2. `test: Show companion stat blocks in the harness`. This covers the five
   states and their samples, the state union, and the `shot.mjs` loop and its
   four extra views (`-familiar-open`, `-picture`, `-picture-narrow`, `-empty`).
3. `docs: Record the companion stat block's reading face`. This doc goes to
   `built`. The ruling entries already in the tree are `docs/SPEC.md` §13's and
   `docs/features/character-forms.md`'s "No exclusive configured". `/land-it`
   writes the §13 `Resolved:` line. It also updates the `SPEC` §4.2 Stat block
   *Sheet view* sentence (*Without `exclusive` every record is drawn in turn,
   the first open* gains *read as In play reads, its editing behind **Edit***) and
   the *Still open* clause of the zones entry's `Resolved:` line. It adds a
   superseded-by pointer to `docs/features/stat-block-zones.md` walkthrough step
   9, and gives `docs/UI.md` §9's stat block row `-edit` and `-name-read`.
   **`docs/BACKLOG.md`: remove** *A Stat block companion draws every zone open, so
   `collapsed` does nothing there* (closed: a companion reads at rest, where
   `collapsed` closes a zone) and *A Stat block without a picker has no reading
   face, so empty zones show to be filled* (closed: the reading face leaves them
   out). **Add** the rows the build confirms under Deliberately not doing.

## Deliberately not doing

- **Any change to a block with `exclusive`**: In play, its head and picker, its
  briefs, Every form, **Back to play**, the tint and the zone editor.
- **Focus on In play's own face switch.** It lets focus fall to the document
  today, as `paint()` replaces the foot. Fixing it is the same handoff one
  branch over, but it changes a block this feature leaves alone. If the build
  confirms the fall, `/land-it` records it as a BACKLOG row.
- **The layout canvas drawing a features entry's markdown.**
- **A closed Every form line's fixed summary column.**
- **Modifiers setting toggles, levels or text.**
- **The stamped-class-over-`:has()` guard** as a general rule or lint. This
  feature's own name size is a stamped class (Design, "The reading face"), but
  converting the existing `:has()` selectors elsewhere, and any check that
  enforces the preference, stays deferred.
- **The layout editor's list missing a scroll cue.**
- **A per-face open set**, a remembered face across notes, and an announcement
  on a face switch (Design, "What carries across the two faces" and "The
  words").
- **An Add at rest while records exist**, and reordering records on either face.
  The note is the order.
