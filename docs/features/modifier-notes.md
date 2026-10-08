# Modifier notes

Status: shipped
Board card: A modifier may carry a note shown at its target. Boots of Elvenkind
put "Advantage on Dexterity (Stealth) checks" at the Stealth skill, and War
Caster puts its concentration reminder at the Constitution save or a
Concentration row. Neither changes a number, and today neither can be said.

## Model question

This is `SPEC` §13's entry **"Whether a modifier may carry a note shown at its
target, and whether it may also change the label its target shows"**. The owner
has settled it, and then narrowed the scope at spec approval. What follows is the
settled answer, the argument the entry already holds, and the places the design
had to go past what the entry says.

### The settled answer

1. **A note is a member of a change**, beside `target`, `operator`, `amount`,
   `bonusType` and `applies`, and the amount is optional where a note is present.
   The §13 entry's argument holds: six tools give a non-numeric effect its own
   field and never overload the amount, and "+1 and Advantage" is one effect,
   which a third operator would split into two changes. The note hangs on the
   change's existing `target`, so it follows the naming every other target
   follows and opens no namespace.
2. **A note is text, and it never enters the expression language.** It lives in
   layout configuration and in stored cell text. §5 has no string type, and this
   does not give it one. No formula reads a note and no condition tests one.
   `when` stays the only condition grammar, and anything it cannot say stays a
   sentence in the note: War Caster's "to maintain concentration" is words, not a
   predicate.
3. **A note refuses `;`**, the cell's part separator, rather than the cell
   gaining an escape. An escape would put this plugin's syntax into a file the
   user owns. Rich text's rule and the definition-name rule both already refuse
   that.
4. **The rename half is dropped.** No system surveyed renames a statistic as a
   game effect. The asks that were found are substitution, which is already a
   formula's job here, or a standing per-character relabel, which is §13's open
   entry on overriding a formula locally. And a label is identity here: sections
   key on it, and §10's rename migration keys on section labels. It reopens only
   on a named case. See **Deliberately not doing**.
5. **A note gets its own mark, distinct from the arithmetic one, and its own
   group in the breakdown.** A note is not pulled through a slot, so by
   definition it moves no number. That leaves the open §13 entry *"Whether a
   modified number's mark should follow the narrow set…"* and the
   `docs/BACKLOG.md` § UI row *"A breakdown lists contributors that did not move
   the number it is about"* both about arithmetic alone. **This feature closes
   neither.**
6. **A note may target a published name on a Roster, a Table or a Card, and on
   nothing else yet.** The accepting set is the wrong bound: it requires
   `mod.self` or `mod.X` in a formula, and requiring a slot just to hang a
   reminder on a skill is wiring for its own sake. The three components are the
   owner's narrowing. Their real 5e layout keeps its saves and skills as rows of
   a Roster, and the starter keeps them as rows of a Table. **Any other published
   name is reported as "not a note target yet"**, in the same family of wording
   as an unknown target. **The check is as strict as an amount's.** Foundry
   shipped Boots and Cloak of Elvenkind with an empty key (vendorfixes 594). A
   missing number shows as a wrong total, but a missing note shows as nothing,
   so a blank or unknown target is reported in exactly the words an amount's is.

### Where the design had to go further than the entry

**A. A component declares whether it draws notes. The target check and the
contract test both read that one declaration.** "Not a note target yet" has to
come from the same source the test checks, or a fourth component could publish a
name, accept a note in the check, and draw nothing. So the contract grows by one
optional member:

- **`drawsNotes?: true`** on `ComponentDefinition`, beside `hasBuffer`. Card,
  Table and Roster declare it. Absent means the component's names are refused
  as note targets, which is the safe default: a new component cannot drop a note
  silently, because until it declares the member its names are refused.
- **`modifierTargetSource`** copies it onto `ModifierTargetSource` as
  `drawsNotes`, on the precedent of `unknownType`. That is the one place the
  registry is read for this, so the editor and the sheet see one answer.
- **`noteTargets(sources)`**, in `formula/modifier-targets.ts` beside
  `acceptingTargets` and `publishedTargets`. It returns the published names
  whose source draws notes. It is the one derivation, and it is read by:
  - the definitions report, in `parse/modifier-definitions.ts`, which already
    takes the sources;
  - the sheet's outcomes and breakdown, in `formula/sheet.ts`;
  - the **Value** picker's **Notes only** group;
  - the walk bound (E).
- **The rule**, in `PATTERNS` §8's "declaring X obliges Y" family: **a component
  publishing a name either draws its notes or refuses them as a target.**
  It is checked for every registered component, across two files (amended at
  build): `note-contract.test.ts` renders each component declaring `drawsNotes`
  and requires the text of every note pushed at each name its sample publishes in
  its DOM, and `contract.test.ts`, which runs without a DOM on purpose, requires
  a component not declaring it to have none of its names in `noteTargets`. So a component cannot pass the check by declaring
  the flag and drawing nothing, or by drawing without the check knowing.

**B. The starter has no target for two of its own cases, and the owner has
approved the fix.** `src/starters/5e.json` publishes nothing from `saves`: it has
no `publish` column and no row keys. `skills` publishes only `insight`,
`investigation`, `perception` and `persuasion`. The rule stays "a published
name", with no new namespace and no targeting of unkeyed rows by label. This
feature gives the starter `publish: true` on `saves.Total` and a `key` on every
save row and skill row:

- **Saves:** `STR`, `DEX`, `CON`, `INT`, `WIS` and `CHA`, matching the spelling
  of `abilities.CON`.
- **Skills:** the shape the four existing keys already have. That is
  `acrobatics`, `animal_handling`, `arcana`, `athletics`, `deception`, `history`,
  `intimidation`, `medicine`, `nature`, `performance`, `religion`,
  `sleight_of_hand`, `stealth` and `survival`.

**This reaches new installs only.** A starter is copied at install, and
`installLayoutSource` refuses a name that is already taken rather than rewriting
the file. So a vault that already holds `Starter 5e` keeps its bytes, and giving
that layout keys is the author's own edit in the layout editor (D). What the
change does and does not touch:

- **No character note changes.** A row key is layout vocabulary, and the claim
  rule matches note rows by label (D).
- **The sheet draws the same thing for a character with no notes.** The new names
  accept no modifier: `ability + Prof * prof` reads no slot, and no formula reads
  `mod.saves.CON`. So both tables render byte-identical DOM. That is a criterion.
- **What grows.** The editor's published-name inventory gains 24 chips. The
  **Value** picker gains 24 entries, all under **Notes only**. The starter test's
  "resolves every name it publishes" covers 24 more names, which compute from
  `abilities` as the four published skills already do.
- **What it does not add.** No `+ mod.self` goes into either formula.

**C. A Card's own note line and a modifier note both show, and neither gives
way.** The 5e Initiative card carries `notePlaceholder: "advantage?"`. That is a
character-typed note, and it is today's workaround for exactly this feature. The
two are different owners' text:

- The card's note line is **character data**. It is stored under `note` in the
  card's fence, and it is an editable field.
- A modifier note is **computed**, read-only, and owned by whichever row or
  definition pushed it.

Merging them would make one editable field show text that the note does not
store. `effective` accepts that trade for a number, and only by reverting the
field to its stored value under a caret. For free text there is no "at rest"
reading worth inventing. Showing the modifier note *instead of* the character's
line would hide character data behind a layout effect. So the note line stays
exactly as it is, the modifier note sits behind the note mark, and the starter's
`notePlaceholder` is unchanged.

**D. Adding a key to an existing unkeyed row leaves its stored value where the
sheet reads it. Checked in the code, because §10 covers renaming a key and not
adding one.** Stealth on the owner's Roster has no key, so Boots of Elvenkind has
nothing to target until the author adds one.

- **Table and Roster both find a row's stored cells by its label, never by its
  key.** Table's `claimRows` and Roster's `rowViews` and `write` both run the
  shared `claimRows` (`parse/row-claims.ts`) over `config.rows[].label` against
  the note's first cells, and they read and write cells at the claimed position.
- **The key is read only by `publishedName` and `scopeValues`**, which build
  `<id>.<key>`, and by `configError`.
- **The editor's rows field declares no `addressesEntry`**, so typing a key runs
  no migration, and none is needed. Nothing in any note moves, and no section,
  heading or cell is rewritten.
- **Constraint 4 is not reached.**

What can go wrong is a **configuration error, never lost data**. `configError`
refuses the key in five cases, and then the whole component draws its error in
place. Its section is untouched and comes back intact once the key is fixed:

1. the key is not a name (Table `configError`, Roster `configError`);
2. no column is published per row ("…so the key names no value");
3. the key repeats another row's;
4. on a Table, it repeats a totalled column's key;
5. on a Roster, it repeats a stat's key, compared case-insensitively, so `dex`
   beside the stat `DEX` is refused.

**What the author does:** open the component in the layout editor, select
**Rows**, and type the key into the Stealth row's **Publishes as** field. The
owner's Roster already publishes a column per row, or its `con_save` and
`concentration` keys would already be configuration errors, so nothing else is
needed. The definition's **Value** picker then offers the new name under **Notes
only**.

**E. A blank amount with a note is a complete change, not an unfinished one.**
Today `parseModifierPart`'s doc comment calls `armour_class +=` "an unfinished
effect", and a *definition* with a blank amount refuses its target's slot ("has
no amount"). With a note present, both become a **note-only change**: it is
complete, it applies wherever its condition holds, it never refuses a slot, and
it never reads as unfinished. A blank amount with no note keeps both of today's
meanings, byte for byte and word for word.

The zero skips are reconciled by **keeping arithmetic and notes on separate lists
from the walk onward**. Only a change with a non-blank amount becomes a
`Contributor`, so `stackModifiers` never sees a note-only change. "Zero neither
pushes nor suppresses anything", the second loop's `if (amount === 0) continue;`
and `signed`'s "Zero never reaches here" all stay true without an edit. A change
with amount `0` and a note adds nothing, as today, and its note shows.

**F. Widening the breakdown's reach must not change when the modifier walk is
first entered.** `sheetModifiers.breakdown` is bounded by the accepting set today,
and `formula/sheet.ts` argues that this bound keeps the walk's first entry inside
the set §13's guard-order entry was written against. So **a name outside the
accepting set enters the walk only where it is a note target, and some part on
the sheet could carry a note to it**. That is decided by parsing, never by
evaluating: a definition change with a note names its target statically, and a
typed part's target and note clause are visible in its text. A sheet with no
notes therefore enters the walk at exactly the names it enters today. The build
verifies that gathering pushes evaluates nothing. If it does, the bound becomes a
static scan over the definitions plus cell text, and the spec is amended rather
than the bound dropped.

**Amended at build: gathering pushes does evaluate, so the bound is the static
scan.** Table's and Record set's sources build each row's `RowValues` eagerly, and
that evaluates every computed column through the resolver they are handed. So
`noteCandidates` (`formula/sheet.ts`) reads the definitions as declared, and calls
each source with a resolver that resolves nothing, which hands back every part's
own text and evaluates no formula; a typed part's note target is read from that
text by `typedNoteTarget`, beside the codebase's one parse of a cell part. A
definition noting a target makes it a candidate whether or not a row enrols,
which is a superset: the walk is then entered and finds nothing. Values that
never opened a breakdown — a stored published cell, a column total — ask
`ModifierContext.notable` first, so they add no walk entry either.
`formula/sheet.test.ts` records the entries.

**G. A declared bonus type containing ` note:` is refused when the layout is
read.** The cell's note keyword is ` note:` (see **Data and file model**), and the
`as` clause comes before it. A bonus type spelled with that text would be cut in
two in every cell that names it. The type list is the layout's, so the layout
reader refuses the name on the path `parseModifierTypes` already uses for a blank
or a repeated type: it is reported under **Bonus types** and dropped from
`names`, so no select offers it. In the same voice:

> "Note: racial" cannot be a bonus type, because a row's modifier spells its note
> after "note:". Rename it without that text.

A definition still naming it then gets the shipped "which this layout does not
declare" sentence. A hand-typed cell that already holds such a type keeps its
bytes, and it reads with the note clause taking the tail. `when` text keeps the
recorded edge, since ` note:` cannot occur in a condition that parses.

### The smaller questions, as recommended and settled

- **Identical notes from two sources are listed twice and never combined.**
  Knowing that two "Advantage" notes are one, or that a "Disadvantage" cancels
  one, is game knowledge. A repeated *named* part in one cell is already one
  enrolment (`cellParts`), so it is listed once.
- **A note lives on both tiers.** It can sit on a definition's change, in both
  the flat spelling and the `changes` spelling, and on a typed cell part. A
  Record set's `modifier` field is a typed cell too, so it is covered.
- **A one-use note is out.** Nothing models a spent effect, and the row's
  enrolment or its condition is the off switch.
- **An effect on someone else's roll stays prose.** Agile Movement has no
  published name to target. **Fate's aspects are out of reach**: an aspect
  attaches to a scene or a whole character, and what it does is chosen at each
  use.

### Constraints

- **Constraint 1.** A note is never parsed as an expression.
- **Constraint 2.** In a Table cell, a note is markdown and a wikilink is
  indexed. In a Record set's field, the note is inside a fence, and the existing
  `fencedLinkRefusal` refuses it at commit, as it does for every field there.
  A definition's note is in a layout file, which nothing indexes.
- **Constraint 3.** Every existing cell and every existing definition
  round-trips byte for byte.
- **Constraint 4 and §10.** No section is added, moved or rewritten (D).
- **Constraint 5.** `parse/` and `formula/` stay pure. `drawsNotes` reaches the
  parser through the sources it already takes.

## What it does

A modifier, whether it is a layout's definition or an effect typed on a row, can
carry a short note, with or without an amount. Where the note's target is a Card,
a Table row or total, or a Roster stat or row, the value gains a small note mark.
One press opens its breakdown, which lists the notes in a group of their own:
"Boots of Elvenkind: Advantage on Dexterity (Stealth) checks" on the Stealth
row. A note aimed anywhere else is reported as not a note target yet, never
dropped silently.

## Smallest version

The model on both tiers, with every parse and spell path round-tripping. The
`drawsNotes` member, `noteTargets`, and the strict check with its "not a note
target yet" sentence. The walk's separate note list. The breakdown's notes group.
The shared note mark on Roster, Table and Card. The editor's and the sheet form's
**Note** fields, with the two-group **Value** picker. The starter's keys.

It gives up nothing the owner kept. Only the polish beyond the acceptance
criteria waits for the design wave.

## Design

### The note mark

**A glyph-only `<button>`, Lucide `info`, drawn only where at least one
note line exists for the name.** It is a shape and not a colour (`docs/UI.md`
§1), and it is an SVG in `currentColor`, so it survives `forced-colors: active`.
It is distinct from the arithmetic underline on every surface this feature
touches.

**`info`, and the glyph row in `UI.md` §9 stays at two** (decided at the land
stop): `zap` edits, and `info` opens a read-only account of what reaches a value
— the arithmetic, the notes, or both — so the note mark and a Track's breakdown
door share it. It was `sticky-note`, and beside a Card's own editable note line
that read as the card's note and as something to write in. It stays distinct
from the arithmetic mark, which is the underline.

**A button, so it is a tab stop**, which the arithmetic mark deliberately is not.
The cost is one stop per value that carries a note, usually one or two per sheet.
The gain is that the words reach a keyboard reader. Enter and Space arrive as a
click, so there is one route in.

- **Accessible name:** `1 note` or `N notes`.
- **`aria-describedby`:** a `.sheetsmith-sr-only` twin holding the whole
  breakdown text. That is the Track door's spelling.
- **Treatment:** it takes the Track door's treatment by selector list (size,
  coarse-pointer hit target, `--text-muted`) rather than by copy.

**A press opens the shared popover** with the same text the number's own press
opens, where the number is pressable. Where a value has both marks, the underline
and the glyph open one popover.

**How it relates to the BACKLOG row "A modified number's mark is a plain
underline, so it reads as a link".** The glyph adds nothing to that row's problem.
It uses none of the partially supported `text-decoration-*` properties, and it
does not resolve the row. The row stays open.

**One painter**, `components/note-mark.ts`, used by the three components. It takes
the parent, the text and the count, and it draws the button and its twin. The
three consumers meet `PATTERNS` §1's extraction line exactly.

### Where a note is drawn

Every component that newly has to draw a note mark and open a breakdown, in build
order:

1. **Roster.**
   - **Rows (`<id>.<key>`).** A row publishes only where it carries a `key` *and*
     one column sets `publish` (`configError` refuses a key with no published
     column). Its name is `<config.id>.<key>` (`publishedName`). Its value is
     that row's cell in the published column. For a `number`, `level` or
     `toggle` column that is the stored cell's typed value. For a `computed`
     column it is the column's formula evaluated in the row's own scope
     (`rowScope`, `stat` included), through `compute`, so the name and the cell
     on screen are one account. The mark sits in **that cell**:
     - in a computed cell, at the inline end of the number, with the notes group
       joining the popover the cell already opens;
     - in a stored cell, after the control, as the cell's door.

     The owner's `{"label": "Concentration", "stat": "CON", "key":
     "concentration"}` is War Caster's target, `abilities.concentration`, marked
     on that row's published cell.
   - **Stats (`<id>.<stat>`).** A stat publishes under its key. Its value is the
     stored score, and where `derived` exists the bare name gives the derived
     reading. The mark sits at the inline end of the band head, after the
     reading. Under `cardLayout`, it sits on the stat card's label line.
2. **Table.**
   - **Published rows (`<id>.<key>`), computed cells.** These already open a
     popover (the formula plus any arithmetic). The notes group joins it, and the
     glyph sits at the inline end of the number. A computed cell on a name that
     accepts no modifier opens nothing today. It gains the glyph, and its
     popover's breakdown half is the notes alone. That is the War Caster and
     Elvenkind case on the starter.
   - **Published rows, stored cells** (`number`, `level`, `toggle`). The glyph
     sits after the control, as the cell's door.
   - **Column totals (`<id>.<key>`).** The glyph sits after the sum in the foot
     row.
3. **Card (`<id>`).** The glyph sits at the inline end of the card's label line.
   It must not move the number off the card's centre line. The note line is
   untouched (C). **Amended at build:** the glyph is out of flow, in the card's
   top inline-end corner, which is the label line's inline end — and with
   `hideLabel` it keeps that corner rather than moving to the number's line. The
   number's own line is a field spanning the card's full width (measured on the
   `sheet-notes` shot's Speed card), so the glyph there would either overlap the
   field or narrow it, and a narrowed field would make one card's pill a
   different width from its unnoted neighbours'.

**Amended at the land stop (owner decisions J1, J2, J4, J5).**

- **A noted column reserves the mark's slot down the whole column** (J1): every
  computed, total or level-ring cell in a column holding a mark anywhere draws an
  empty box the mark's size and gap after its value, so a centred value lines up
  with the noted one; a Roster's band heads do the same where any band carries a
  note. The render marks the column after the rows are drawn
  (`reserveNoteSlots`), because a column is a position across rows that no
  selector can name per index. A field cell — a stored number's input, a
  level's select — reserves nothing, since its own fixed width already lines it
  up and reserving after it widened the Saves card past the threshold width. A
  table with no note gains no class.
- **The mark after a number is centred on the digits' cap height**, raised from
  `vertical-align: middle` by half the cell's own cap-minus-x-height, inside
  `@supports (top: 1cap)`. Without `cap` the mark is about 1.4px low; that is an
  estimate from the metrics and not a measurement, because the harness renders
  in a Chrome that has `cap` and cannot render a WebKit that lacks it.
- **On a card narrower than 200px the label drops its start-side reserve and
  wraps** (J2), so "Armour class" and "Passive perception" show whole at 520 at
  the cost of the label's centre. 200px is measured: the longest sample label
  needs 143px plus both reserves, 181.4px, which a 200px card's content holds.
  **Accepted as built at the land stop**: under the query every noted card's
  label sits off centre, Initiative's included, though its label would have fit.
- **The corner mark sits one step further in, `--size-2-3`** (J5), so its focus
  ring clears the card's border.
- **While a change is note-only, Operator, Applies to and Bonus type are
  disabled** (J4), in the layout editor and in the sheet form, and an amount
  typed gives them back. Disabling writes nothing: a stored value keeps its
  bytes and the report's "ignored" sentence still names it. In the editor the
  three read as disabled — faint label and value, no surface — which is done for
  these three alone; `docs/BACKLOG.md`'s row for the pane's other controls
  stays open.

**The design wave keeps the width question for stored cells.** A level ring
gains a neighbour on Table and Roster rows that carry a note, and both are
checked at the threshold width.

**Every other component draws nothing and is refused as a target.** Card set,
Pool, Track and Passport publish names but do not declare `drawsNotes`, so a note
aimed at one is reported as not a note target yet. Their render code is not
touched, and today's Track `info` door is unchanged. Record set, Rich text, Image,
Group and Tab set publish nothing, so a note aimed there is an unknown target.

### The breakdown text

`modifierBreakdown` keeps every arithmetic line, the total and its rules byte for
byte. The notes group comes after the total, headed `Notes` only when arithmetic
lines are present too. Here is a card with both:

```
Ring of Protection — item +1
Shield of Faith — Spell +2

Total +3

Notes
Cloak of Warding — "Resistance to cold"
```

Here is a Roster row, notes only. `inRows` means every line names its component:

```
Magic items · War Caster — "Advantage to maintain concentration"
```

- **Tokens.** A note line uses the drop rule's own tokens (component · row ·
  modifier). The component qualifier is decided once over both groups together.
- **Outcome.** A note's outcome is its text in straight double quotes, through
  the same private helper that spells `item +2`, so the breakdown, the row's
  popup line and the row's `title` spell a note one way. On the row surfaces a
  change with an amount and a note reads `item +1 and "…"`. In a breakdown it is
  two lines in two groups.
- **Inactive notes are not listed**, as inactive arithmetic is not.
- **A note whose condition will not resolve is listed**, as
  `… — "…" (not applied: <reason>)`, and it never refuses the number. A change
  with an amount and a note whose condition fails refuses the slot as today,
  and its note line says why.
- **An arithmetic refusal does not hide notes.** Where the card draws `?`, the
  notes group still shows.
- **The builder returns the marks it owes**: the text, `arithmetic: boolean` and
  `notes: number`. The underline follows `arithmetic` alone. Card, Table and
  Roster move to that answer, because a note-only breakdown must not draw the
  underline. The other callers (Card set, Track) are untouched, because no note
  ever reaches their names.

### Authoring: the layout editor

**Each change line gains a Note field.** It is a single-line text input after
**Bonus type**, on a row of its own as **Shown when** has (amended at build: in
a share of the second row it clipped "Advantage on Dexterity (Stealth) c…"). It
is offered on **Adds to** and **Sets** alike, and it commits on Enter or blur.

**A note holding `;` is refused at the commit**, inline at the field, and the
stored note is left as it was. The sentence lives beside its predicate in
`parse/modifier-cell.ts` (`unspellableNote`), on `unspellableName`'s precedent:

> A note cannot hold a semicolon, because a row separates the modifiers it
> applies with one. Reword it without one.

A line break cannot be typed into the single-line field, so it is refused only
in hand-edited text — by `unspellableNote` in the report, and at detach — with a
sentence in the same shape (amended at build):

> A note cannot hold a line break, because a row keeps each modifier on one
> line. Reword it on one line.

The editor's field keeps the refused text on screen, as a formula field does,
and does not replay the complaint over a redraw that restores the stored note.

**The Value picker offers two native `<optgroup>`s.** **Takes modifiers** comes
first, and it is today's accepting list in today's order. **Notes only** holds
every note target that accepts no modifier. A stored target outside both groups
is still carried as a bare extra last option. **Amended at build:** where
**Notes only** would be empty the select draws today's flat list with no group,
since a lone heading would tell nothing apart, and a layout with nothing to note
outside the accepting set then draws exactly the picker it always did.

**The report** keeps every shipped sentence byte-identical for a layout without
notes, and gains:

- **Not a note target yet**, for a change with a note at a name `noteTargets`
  refuses. It sits in the family of the unknown-target sentence:
  `"Boots" notes "abilities.STR", which cannot show a note yet, because the component publishing it draws none. Choose a value on a component that does, or correct the spelling.` (Amended at build: it named "a card, a table or a roster", which a fourth component declaring `drawsNotes` would make false with nothing to say so.) Where the change also
  has an amount, the amount is checked as today, and this sentence is about the
  note alone.
- **An amount at a value that reads no modifier, on a change with a note**:
  `"Boots" changes "skills.stealth", which reads no modifier, so its amount does
  nothing. Its note still shows. Add "+ mod.self" to that value's own formula for
  the amount.`
- **A note-only change carrying `operator: override`, a `bonusType` or
  `applies`**: `"Boots" has a note and no amount, so its bonus type is ignored: a
  note alone changes no number. Clear it, or give it an amount.`
- **A hand-edited note holding `;` or a line break** gets the `unspellableNote`
  sentence. It is still shown, with a line break drawn as a space.
- **A blank or unpublished target** gets the existing messages, verbatim.

The remove confirmation counts a note as content, so a note-only definition is
not removed silently.

### Authoring: the sheet

- **The form gains a Note field** after **Bonus type** and before **Only when**.
  It is read-only on a named part, and it refuses `;` with the same sentence.
- **The Value select** takes the same two groups, from `context.modifiers`, which
  gains `noteTargets` beside `targets` and `published`.
- **Outcomes.** A note-only part at a note target that accepts no modifier is
  applying, and the row shows `zap`. A note at a name that is not a note target
  gets the reader's sentence beside the existing ones: `Pool · max cannot show a
  note yet, so this note is not shown. Its layout has to aim it at a value that
  draws notes.` Its amount, where it has one, is judged as today. **Amended at
  build:** that sentence is the one for every name outside the note targets,
  published or a typo, so one misspelt part with an amount gets one line about
  its note rather than two. And where an amount at a value that reads no
  modifier is judged as today — not applying, with today's sentence — a note the
  value does show adds the line `Its note still shows.` beside it
  (`ModifierOutcome.noteLine`).
- **Promote copies the note. Detach copies every change's note**, and it is
  refused where a hand-edited note could not be spelled in a cell.

### Empty and error states

- **Empty.** No note anywhere means no glyph, and every popover, title and
  accessible name is byte-identical to today's.
- **A note-only value** has no underline, the glyph, and a popover of note lines.
- **Unknown, blank or not-yet target.** Reported in the editor and at the row.
  Rendered, not corrected, in a cell.
- **Unreadable condition.** Listed with `(not applied: …)` at the target, and
  `zap-off` at the row.
- **A refused note commit.** The inline sentence, and the stored text unchanged.

## Config fields

No component's `configFields` change. What changes is the layout's `modifiers`
list and the sheet's modifier form.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `note` / `changes[].note` | text | Note | Words shown at the value, behind a note mark, while this modifier applies. A note changes no number, so a modifier may carry a note and no amount. Notes show on cards, table rows and totals, and roster stats and rows. A note cannot hold a semicolon, which is what separates a row's modifiers. |
| `target` / `changes[].target` | select | Value | The value this change moves or notes. **Takes modifiers** lists the values whose own formula reads a modifier, which is what an amount needs. **Notes only** lists the other values a note can show on. |
| *(sheet form)* | text | Note | As above. On a row whose modifier is named from the layout it is read-only, and it is edited in the layout. |

The starter uses two existing fields: `columns[].publish` and `rows[].key`.
Adding a key to an existing row is the **Publishes as** field (D).

## Data and file model

### What a layout stores

`note` is an optional string, absent where it is blank (`PATTERNS` §8). It is
added to `ModifierChange`, to `ModifierDefinition`'s flat spelling and to
`TypedEffect`. `MODIFIER_CHANGE_KEYS` gains `'note'`, so two things already
handle it: the report on flat members beside `changes`, and **Add change**'s
flat-to-nested move. `contract.test.ts` holds the field list across all three
interfaces. `changesOf` needs no change.

```json
{ "name": "War Caster", "target": "abilities.concentration",
  "note": "Advantage to maintain concentration" }
```

`ComponentDefinition` gains `drawsNotes?: true`, and `ModifierTargetSource`
gains `drawsNotes?: true`. Neither is stored in any file.

### What a cell stores

A note is the **last clause** of a typed part, spelled ` note: <text>`:

```
abilities.stealth += note: Advantage on Dexterity (Stealth) checks
armour_class += 1 as item when Worn note: and resistance to cold
```

The full order is `target op [amount] [to result] [as type] [when cond]
[note: text]`. `spellTypedEffect` emits the clause last, and only where the note
is non-blank.

**Parsing strips the note first, at the *leftmost* ` note:`, and only then runs
today's right-to-left scans over what is left.** Two reasons:

- **Leftmost, and first.** A note is arbitrary text that may itself contain
  ` when `, ` as `, ` to result` or a second `note:`. So it has to be found from
  the left, and it has to be removed before `clauseAt` scans for anything.
- **The keyword cannot occur in anything to its left that already parses.** `:`
  is not a character of the expression grammar (`tokenize` throws on it), so
  ` note:` cannot appear in a well-formed amount or condition. The bare word
  `note` is a legal name, so a column headed `note` would have been captured.
  The colon closes that. The one remaining collision, a bonus type containing
  ` note:`, is closed at the layout (G).

**A cell with no ` note:` parses through a path identical to today's**, so every
existing cell keeps its bytes and its meaning. The keyword is lowercase and
exact. A blank note after it is absent. A blank amount with a note is a note-only
change (E), spelled `target += note: …`, and an override's `=` is kept as stored.

**A hand-typed `;` inside a note splits the part**, as any `;` does. The tail
renders as a stray name with the existing sentence. `|` needs nothing, since
`parse/table.ts` escapes it. A Record set field's fence line splits on its first
`: `, which sits before the part. The build confirms that by test.

### The walk

`resolveEnrolments` returns, per change, an optional arithmetic contribution and
an optional note. The note is set where the change's note is non-blank and its
condition holds, or it is marked suppressed where the condition will not resolve.

- **The walk** keeps `applied` and adds `noted`, a map from target to note lines.
  A line is the row label, the source, the definition name, the text and
  `suppressed`.
- **`ModifierResult` and `ModifierBreakdown` gain `notes`.** Amended at build:
  the member is optional and present only where there is at least one note, and
  `EMPTY` carries none, so every result and breakdown on a sheet with no notes is
  the object it always was. That is what keeps their popovers, titles and
  accessible names byte-identical, and the existing tests that compare whole
  results pass unedited.
- **`stackModifiers` is untouched.**
- **`sheetModifiers.breakdown(name)`** returns arithmetic for accepting names and
  notes for `noteTargets`, bounded as (F) says. A non-target name never receives
  notes, which is what lets the other components' callers stay as they are.

### Existing character notes

Untouched. There is no migration, no section moves, and no cell is rewritten.
Adding a row key strands nothing (D). The dropped rename half has nothing to
reach: nothing changes a label, and a note never enters a formula, a heading or
§10's migration.

## Acceptance criteria

**The cases.**

- [ ] **Roster, keyed row.** A Roster with a published `Total` column and the
      row `{"label": "Concentration", "stat": "CON", "key": "concentration"}`. A
      note-only `War Caster` at `checks.concentration` (the fixture's id for the
      owner's `abilities.concentration`) marks that row's
      published cell, and its popover lists the note. The number does not move.
- [ ] **Roster, unkeyed row.** A `Boots of Elvenkind` aimed at
      `checks.stealth`, on a Roster whose Stealth row has no key, is reported
      as an unknown target. Typing `stealth` into that row's **Publishes as**
      makes the report go, marks the row, and leaves the note's section
      byte-identical.
- [ ] **Roster, stat.** A note at a Roster stat marks the band head, and the stat
      card under `cardLayout`.
- [ ] **Table.** A note at a Table's published computed cell, at a stored
      published level cell, and at a column total each draw the mark.
- [ ] **Starter.** On the new 5e starter, `War Caster` at `saves.CON` marks the
      Constitution save.
- [ ] **Card.** On the Initiative card, a note at `initiative` draws the mark,
      and the card's own note line keeps the typed text, editable and unchanged.
- [ ] **Both marks.** A change with amount `1` and a note at an accepting card
      draws the underline and the glyph, and its popover holds both groups.

**Strictness.**

- [ ] A note-only change with a blank target, and one whose target is
      unpublished, produce the existing sentences verbatim
      (`parse/modifier-definitions.test.ts`, *a note's target is reported exactly
      as an amount's*).
- [ ] A note at `abilities.STR` on a Card set, at `hp.max`, at a Track and at a
      Passport field produces "cannot show a note yet". The sheet's outcome
      says so at the row.
- [ ] *A component publishing a name either draws its notes or refuses them as
      a target* passes for every registered component, in `contract.test.ts`
      and `note-contract.test.ts` (amended at build).
      Forcing `drawsNotes` onto a component whose render ignores notes fails it.
- [ ] The editor's report and the sheet's sentence both come from
      `noteTargets`. A test drives both over one layout.

**Adding a key (D).**

- [ ] On a Table and on a Roster, adding a key to a claimed unkeyed row leaves
      every note's section byte-identical. That row's stored cells read the same,
      and only a new published name appears.
- [ ] A key colliding with a stat key, compared case-insensitively, draws the
      Roster's configuration error, and its section is untouched.

**Round trips (Constraint 3).**

- [ ] Every existing `modifier-cell` fixture, and every combination of
      `to result`, `as` and `when`, parses and spells exactly as before.
- [ ] Spell then parse is the identity for effects with a note, including notes
      containing ` when `, ` as `, ` to result`, `note:` and parentheses.
- [ ] `x += note + 1` and `x += 1 when note > 0` keep today's reading.
- [ ] A layout with no `note` keys, opened in the editor and closed, is
      byte-identical. **Add change** moves `note` with the other flat members.
- [ ] A Record set modifier field holding a note round-trips byte for byte, and
      a `[[link]]` in its note is refused at commit.

**Bonus types (G).**

- [ ] A declared bonus type containing ` note:` is reported under **Bonus types**
      in the stated sentence and is not offered by any select. Every other
      bonus-type problem's wording is unchanged.

**The zero rules.**

- [ ] `stackModifiers` receives no note-only change, and its tests pass
      unedited. Amount `0` with a note adds no arithmetic line and shows its note.
- [ ] A definition with a blank amount and a note does not refuse its slot. One
      with neither still does.

**Breakdown and marks.**

- [ ] A note-only value draws no `.sheetsmith-modified`.
- [ ] On a sheet with no notes, every breakdown, `title` and accessible name is
      byte-identical to today's.
- [ ] Identical notes from two rows give two lines.
- [ ] An unreadable condition lists the note with `(not applied: …)` and leaves
      the number alone.
- [ ] Where the arithmetic is refused (`?`), the notes still show.

**The walk bound (F).**

- [ ] On a sheet with no notes, `breakdown` enters the walk at exactly today's
      names. The test records the entries.

**Authoring.**

- [ ] The editor's and the form's **Note** fields commit on Enter and blur,
      write nothing when blank, and refuse `;` inline. A line break cannot be
      typed into the single-line field; it is refused only in hand-edited text,
      by `unspellableNote` in the report and at detach.
- [ ] **Value** shows **Takes modifiers** then **Notes only** in both places,
      with today's accepting list unchanged in the first. **Notes only** holds
      no name from a component outside the three.
- [ ] Every new report message is asserted in
      `modifier-definitions-field.test.ts` to be contained in what the rendered
      report says.
- [ ] Promote carries a typed note, and detach carries every change's note or
      refuses.

**The starter (B).**

- [ ] `saves.STR` through `saves.CHA` and all 18 `skills.<key>` resolve on a
      character with values, and the pinned placements and counts are
      unchanged.
- [ ] A character with no notes renders byte-identical DOM for `saves` and
      `skills`.
- [ ] Installing over an existing `Starter 5e` is refused and leaves its bytes
      alone. Re-run the existing test for this, or add one if none pins it.

**Appearance** (checked by looking, `docs/UI.md` §11).

- [ ] The harness renders the following with a note, plus the editor with a
      note-bearing change, with scoped shots given an explicit frame:
      - a Roster published computed cell and a stored level cell;
      - a band head and a `cardLayout` stat;
      - a Table computed cell, a stored level cell and a total;
      - a Card with its note line filled.
- [ ] The glyph is distinct from the underline in both themes and under
      `forced-colors: active`, and it does not move a card's number off centre.
      At the threshold width no stored Table or Roster cell, change line or
      **Note** field clips.

**The fixture**, rebuildable from this list (`AGENTS.md` § Testing). There is
no new fixture layout. Each capability's fixture is one variations layout plus
one note, and a note is a modifier capability, so the cases go into
`src/test/fixtures/modifiers/Modifier variations.sheetsmith` and its `Ilona.md`,
which `src/view/vault-fixture.test.ts` drives. The same additions are mirrored by
hand into the throwaway vault's copies of both files. The vault's layout also
holds Track cases the repository fixture does not, and they are left alone.

- [ ] **One Roster joins the layout**, appended after `worn_items`. It is built
      from the owner's rows:
      - **Identity:** id `checks`, label `Checks`. The id `abilities` is the
        file's Card set, and §5 refuses two components with one id.
      - **Stats:** `CON` and `DEX`, with `derived: floor((value - 10) / 2)`. The
        file has no function library, and this does not add one.
      - **Columns:** a `Bonus` number column, and a `Total` computed column with
        formula `stat + Bonus` and `publish: true`. That is the published
        column a row key needs.
      - **Rows:**
        - `{"label": "Con Save", "stat": "CON", "key": "con_save", "dividerAfter": true}`
        - `{"label": "Concentration", "stat": "CON", "key": "concentration", "dividerAfter": true}`
        - `{"label": "Stealth", "stat": "DEX"}`, unkeyed, as the owner's is.
      - **`Ilona.md`** gains a `## Checks` section with both stats' values and a
        `Bonus` on each row.
- [ ] **The note cases cover all three component kinds**, appended after the
      file's existing ten definitions and after `magic_items`' fourteen rows.
      - **Roster:**
        - `War Caster`, a note-only definition at `checks.concentration`
          ("Advantage to maintain concentration");
        - **Boots of Elvenkind is not in the committed fixture**, neither as a
          definition nor as a row. Its unknown-target state while Stealth is
          unkeyed lives only in the added-key test below. So the committed
          layout reports exactly what it reports today.
      - **Table:** a typed part
        `skills.perception += note: Advantage on sight-based checks` on a new
        `magic_items` row.
      - **Card:**
        - a typed part `armour_class += 1 as item note: Resistance to cold`,
          which carries both marks;
        - a note-only part at `passive_perception`, a card whose formula reads
          no modifier.
      - **Edges:**
        - a second row typed with War Caster's exact note text at
          `checks.concentration`, so identical text from two sources is listed
          twice;
        - a note-only part whose `when` reads an undefined name;
        - a note-only part at `abilities.STR`, which a Card set holds, so it is
          reported as not a note target yet.
      - **`Ilona.md`'s new rows:** a War Caster row and the typed rows above,
        each with a `Notes` cell saying what it is for, as the existing rows
        have.
- [x] **Boots after the author adds `stealth`.** A test in
      `vault-fixture.test.ts` introduces Boots itself, working on in-memory
      copies of the committed files:
      1. It appends a note-only `Boots of Elvenkind` at `checks.stealth`, with
         `when: Worn` ("Advantage on Dexterity (Stealth) checks").
      2. It adds two `magic_items` rows naming Boots, one worn and one not.
      3. It asserts the unkeyed state: Boots is reported as an unknown target,
         and nothing is marked.
      4. It adds `"key": "stealth"` to the Stealth row, as **Publishes as**
         writes it.
      5. It asserts that the report line goes, that `checks.stealth` carries
         Boots' note once (from the worn row), and that `## Checks` is
         byte-identical before and after the key.

      Nothing of this is written back to the fixture. In the vault the author
      does the same by hand:
      1. add the definition and the two rows;
      2. see the report name the target;
      3. type `stealth` into the Stealth row's **Publishes as**;
      4. see the glyph appear and confirm that `## Checks` is unchanged in
         markdown view.
- [x] **What to press in the vault.** In `Ilona.md`:
      - Concentration shows the glyph, and pressing it lists War Caster and the
        typed twin;
      - Perception's `Bonus` cell shows the glyph;
      - armour class shows the underline and the glyph, and its popover has both
        groups;
      - passive perception shows the glyph and no underline.

      The row form names the `abilities.STR` part as not a note target yet.
- [ ] **The guard: extend, never fork.** The existing cases' assertions must
      hold unchanged. Those are every number, breakdown line, cell byte, row
      reading and reported message the current tests state.
      - **Inventory pins** grow by appending only, and are not the guard: the
        component count of 7, the id list, the ten definition names, the
        fourteen rows and the sections-present list. *"Reports exactly one
        definition, and it is the one that is there to be reported"* stays
        exactly as it is, because no committed addition is reported.
      - **If the Roster or any note case cannot join without changing any other
        existing assertion, the dev names that case and stops.** No second
        fixture layout is opened to route around it.
- [x] **Beside it, the starter case:** the vault's `Starter 5e.sheetsmith` is
      replaced with the new starter's bytes plus a `War Caster` at `saves.CON`.
      `Mireth.md` enrols in it. This is vault-only, and no repository fixture
      changes for it.

In the app on 2026-10-08, Obsidian 1.14.4 over the DevTools protocol. **The press list** passed on `Ilona.md`: Concentration's glyph lists War Caster and Spellguard, Perception's `Bonus` carries the glyph, passive perception the glyph and no underline, armour class carries both and its popover both groups, and the row form says `Abilities · STR cannot show a note yet`. **Two vault repairs came first.** The vault's layout had `magic_items` at row 1, over the cards, against the committed row 5, and was put back. Neither fixture holds the armour class case this list presses (the committed fixture puts both marks on Perception instead), so the vault's `Ilona.md` gained `| Cloak of Warding | armour_class += 1 as item note: Resistance to cold | yes | … |`, the harness's row. The vault's `Ilona.md` also differs from the committed one, its older rows' modifier cells emptied, and is left as found. **Boots by hand**: the definition and two rows report `checks.stealth` in the editor and on the row form, typing `stealth` into Stealth's **Publishes as** clears the report, the worn row's note marks Stealth once, and `## Checks` is byte-identical. The layout saved on blur, not on Enter. All of it was then taken back out, as the walkthrough leaves it to the reader. **The starter**: the vault's `Starter 5e` equals `src/starters/5e.json` plus War Caster, and Mireth's Constitution save carries its glyph. Method: `record-summary-fields-first.md` § In the app, 2026-10-08.

**The gates.**

- [ ] `npm test`, `npm run lint` (zero warnings) and `npm run build` pass.

## Commit boundaries

These are a plan for `/land-it` at the end, not a schedule. The tree stays
uncommitted through the build and every round of findings. No commit carries a
`Co-Authored-By` trailer.

1. `feat: Let a modifier carry a note`. The `note` member on the three
   interfaces and `MODIFIER_CHANGE_KEYS`. `parse/modifier-cell.ts`'s note clause
   and `unspellableNote`. `parse/modifier-types.ts`'s refusal of a type holding
   ` note:`. Their tests.
2. `feat: Let a component say whether it shows notes`. `drawsNotes` on
   `ComponentDefinition` and `ModifierTargetSource`, `noteTargets`, and
   `parse/modifier-definitions.ts`'s checks and sentences. Their tests.
3. `feat: Gather the notes pushed at each value`. `formula/modifier-definitions.ts`
   (note-only changes), `formula/modifiers.ts`'s `noted`, and `formula/sheet.ts`'s
   breakdown, outcomes and walk bound. Their tests.
4. `feat: Mark a value's notes on rosters, tables and cards`.
   `modifier-breakdown.ts`'s notes group and marks-owed return,
   `components/note-mark.ts` and its stylesheet part, the three components
   declaring `drawsNotes`, and the `contract.test.ts` obligation.
5. `feat: Write a modifier's note in the editor and on the sheet`. Both **Note**
   fields, the grouped **Value** pickers, promote and detach.
6. `feat: Publish every save and skill in the 5e starter`.
   `src/starters/5e.json` and `index.test.ts`.
7. `test: Carry modifier notes through the fixture and the harness`. The
   Roster and the note cases appended to `src/test/fixtures/modifiers/Modifier
   variations.sheetsmith` and `Ilona.md`, their `vault-fixture.test.ts` cases
   (including the added-key case), the appended inventory pins, and the harness
   samples.
8. `docs: Modifier notes`. This file at `built`, plus:
   - `SPEC` §2, a **Modifier note** entry that names its wrong twins: the
     character *note* and a Card's *note line*;
   - §4.1's new optional member;
   - §4.2's cell grammar;
   - §5's note-target paragraph;
   - `PATTERNS` §8's [checked] obligation;
   - `UI.md` §9's mark row and glyph row.

   The §13 `Resolved:` line is `/land-it`'s, and the open mark entry and both
   BACKLOG rows stay open.

## Deliberately not doing

- **Notes on Card set, Pool, Track and Passport**, which is a later round. Each
  would declare `drawsNotes` and draw the mark: a Card set per entry; one face
  door on a Pool, Track or Passport naming the target on each line. A Track's
  existing `info` door already wears the note mark's glyph, so it would only
  gain the notes group, not a new glyph (decided at the land stop, when the note
  mark moved to `info`). Until then their names are refused as not a note
  target yet.
- **A modifier changing its target's label.** This is ruling 4, and it reopens
  on a named case.
- **Combining, cancelling or deduplicating notes.** That is game knowledge.
- **A one-use note**, **effects on someone else's roll** and **Fate's aspects**.
- **A note in the expression language.**
- **Live links inside a note.** The popover is `textContent`.
- **Gating the arithmetic mark on the narrow set**, and the BACKLOG rows "A
  breakdown lists contributors that did not move the number it is about" and "A
  modified number's mark is a plain underline, so it reads as a link". All stay
  open and about arithmetic.
- **A Pool's arithmetic mark**, which is its own BACKLOG row.
- **A modifier landing on every row of a Table**, and **a picture's focal
  point**.
- **Targeting an unkeyed row by its label.** The author adds a key instead (D).
- **`+ mod.self` in the starter's formulas**, note definitions bundled into the
  starter, and a change to Initiative's `notePlaceholder`.
- **Updating layouts already installed from the starter.** That is the author's
  edit.
- **Dice, roll resolution and shared or party sheets**, which are `SPEC` §11.
