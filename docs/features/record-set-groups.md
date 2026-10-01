# Collapsible groups in a Record set

Status: shipped, bar the owner-checked items below (the by-hand list, real-scrollbar clipping, `prefers-contrast: more`, the vault walkthrough and the header's look), which the owner judges and no review ticks
Board card: A Record set may group its records by the value of one of its fields,
each group under a header that collapses. Class features grouped by class on a
multiclass character; spells grouped by spell level.

## Model question

**It touches one and settles it.** `docs/SPEC.md` §13's last entry, "Whether a
Record set may group its records under headers that collapse, and what a group
is", is the question, and it already holds nine recommendations. Eight of them
the owner has settled as written below. The ninth, **the group key**, was held,
and this spec answers it first because everything else is built on it. Two older
§13 entries bear on the answer and are not reopened: the **nesting** entry, which
records why a collapsible Group heading was withdrawn, and the **layout editor
tree** entry, which keeps that tree's collapse as view state keyed by id. **Nothing
is resolved until it is built**, so §13 is not edited here; `/land-it` writes the
`Resolved:` line and the corrections listed at the end of this section.

### The group key

**Recommendation: `groupBy: <field key>`, naming a `level` or a `number` field.
Nothing new is added to the catalog, the contract or the field types.** The class
case works, with one cost stated plainly below. The owner's two objections are
both right about the §13 entry's wording and answered differently: one is already
solved by code that exists, and one is not solvable without a decision that is not
this feature's.

**Objection (b), "a `level` field draws a ring on every record whose meaning is
which class": already answered, by two shipped things.**

- A Record set `level` field takes `input: 'select'` (`record-set.ts`, the
  `graded && field.input === 'select'` branch, around line 2702). It draws a
  native `<select>` listing the level names, named by the field's own label for
  assistive tech, and no ring. It is the control Card's options and Table's
  `level` column already draw (`docs/UI.md` §9, "A choice from a closed list").
  The stored value is still the integer, so nothing about the file changes.
- `placement: 'body'` (`docs/features/record-set-body-fields.md`) takes that
  dropdown off the summary line and into the opened record. A record's class is
  exactly what that feature was written for: "a value read once and changed
  rarely". With both set, a feature's summary line shows the chevron, the name and
  its uses counter, and the class is the header it sits under.

So (b) needs no work and no new type. The recipe is a description in the editor,
not a mechanism.

**Objection (a), "a `level`'s names are fixed in the layout, so a homebrew class
cannot be keyed by a player": true, and it stays true under this recommendation.**
The §13 entry's own sentence, "a hand-added feature is grouped like any other
because the key is editable data", conflates two things: the *value on a record*
is editable by the player (they pick a class from the dropdown), but the *set of
values* is the layout's. Say it plainly in the doc that will be read later:

- **What works.** A layout that declares its classes groups every feature by class,
  a player assigns a hand-added feature to any of them, and a feature added later
  lands in a group the same way.
- **What a homebrew class costs.** The layout's author, who is usually the same
  person in a single vault, appends one name to that field's **Level names** in
  the layout editor. **Appending keeps every stored index**; inserting or reordering
  is what rereads notes, and the editor already reports that
  (`docs/features/level-list-reorder-report.md`). The layout is shared, so the
  other characters on it gain a name in their dropdown and nothing else changes.
  A player who cannot edit the layout file cannot make a class; that is the cost,
  and it is a real one for a layout shared with people who will not touch it.
- **What a stray value does.** A note holding an index outside the list (past
  the last name, or negative) is grouped under **Other**, not clamped to the last
  name, so a shortened list or a hand-edited note never files a record under a
  class it was not given. The group is visible, last, and says what it is. The
  cost, stated: the record's dropdown and every formula still read the clamped
  level (`levelOf`), so the record sits under **Other** while its select shows the
  top name until the reader picks one. The grouping reads the stored integer
  against the list and does not change what the field means. The editor's
  existing reorder and shortening report is the only warning; this feature adds
  none.

**Why not a new `select` field type.** It does not fix (a) and it is the largest
option:

- Its options are a literal list the layout declares. `docs/features/card-options.md`
  question 4 decided "a literal list, only" and deferred a rows or formula source
  as a separate feature, so a `select` has the same closed-set property as a
  `level` and the same homebrew cost. The only thing it would add is unordered
  values, and the group order this feature needs is *declared* order, which a
  `level` already is.
- Its surface is not small. It adds a column type to `column-types.ts`, which
  Table shares, and §13 already holds an open entry for a Table `select` column
  with the reason it has not been built: the options list is a list inside one row
  of `columns[]`, and `editor/list-fields.ts` draws records whose cells are scalars.
  It would need that editor work, the type's read, write, reset, `scopeRows` and
  contract handling in Record set, Table's refusals, and tests for each. That is a
  feature of its own with its own §13 entry, and the owner would be buying it to
  get a dropdown the `level` already draws.
- What it would store is the option's declared `value` (question 2 of that
  document), which a formula cannot compare because the language has no strings.
  That is harmless here and still not a reason to build it.

**The only thing that fixes (a) is a free-text key**, and the evidence says the
reason Record set has no `text` field is not the one §13's entry gives.
Constraint 2 does not force the refusal: `components/fenced-link.ts` refuses a
wikilink at the commit for every free-text route into a fence, Passport already
stores a free-text name and values in a fence that way, and Record set already
uses the same sentence for its `number` input and a modifier's parts. The
refusal is recorded in `docs/features/record-set.md` as §5's: the expression
language has no strings, so a text field could publish nothing and be compared
to nothing, and "words a reader reads belong in the record's body". A text key
would be display plus grouping, which neither argument bars, but it reverses a
decision that document calls "not a cut", so it needs a model question of its
own.

**What a text key would cost, sized honestly, so the owner can decide at approval:**

- Offering `text` in `columnOptions.types` brings back the problem
  `columnOptions` was added to end (`types.ts`, the comment on `columnOptions`):
  the shared default type is `text` and a field with no `type` is written as
  absence, so a Record set field of no type reads as text again, and the
  configuration error that refuses text would have to become a rule about
  *which* text fields are allowed. That is a change to the shared columns field,
  not to this component alone.
- A control for it (an input on the `editable.ts` rules with the commit-time
  refusal), a read of it, and its exclusion from `scopeRows`, since Table already
  excludes a `text` column from every aggregate and publish.
- Grouping rules the key does not have today: text is trimmed and matched
  case-insensitively, the first-seen spelling is the header, and the order is
  alphabetical rather than declared. A typo makes a new group. None of those is
  hard; each is a rule the owner would want to have read before it ships.
- SPEC §4.2 and `record-set.md` amended where they say text is refused.

**It does not belong in this feature.** It reverses a recorded decision, widens
the shared columns field, and wants its own spec. The smallest version of this
feature (below) does not depend on it, and nothing here is built so that it
cannot arrive: `groupBy` validation names the types it accepts in one place, and
a text key would add one clause there and one rule to the pure grouping function.
**The owner decides at approval** whether the class case is acceptable with the
dropdown's cost, or whether the text-key feature is to be specified first and this
one scoped to wait for it. This spec recommends the first, because a layout that
names its classes is the common case, nothing is lost by shipping it, and the
alternative holds a working feature for a larger one.

### Deferred: a player's own groups

**Built since: `docs/features/free-text-group-key.md`.** What follows is the argument as it stood when the route was deferred; the reversal it names has been made, for the group key only.

**Decided by the owner after the build was in front of them: this feature lands as
it stands, and a player inventing their own class or group name is its own route.**
What is wanted there is per-character group *values*, and the only thing that
delivers it is the free-text key sized above. What is **not** wanted is a
per-character choice of *which field* a list groups by.

**Class grouping does not cover a player's own classes, and a reader of this
document must not take it to.** A `level` key's names belong to the layout. A
homebrew class costs the layout author one appended name under **Level names**,
and a character on a layout whose author has not appended it cannot have it. A
`number` key's groups are only numbers.

The deferred route, in one line: **Free-text group key: let a player type their
own class or group name on a Record set record, which reverses the "no text field"
decision.** That decision is recorded in SPEC §4.2, `docs/features/record-set.md`
and §5's missing strings, so it needs its own spec and model question before it
can be built. **The gate is that reversal**, not the grouping: nothing here is
built so that it cannot arrive (`groupBy` validation names its types in one place).

### Corrections `/land-it` makes to the §13 entry

- Item 2: replace "a hand-added feature is grouped like any other because the key
  is editable data" with the distinction above, and say that a `level` key is
  closed by the layout and that `input: 'select'` plus `placement: 'body'` is how
  its control is made not to read as a ring.
- Item 5: "a `number` field has no unset state so a record always has a group" is
  wrong. A blank number reads as 0, and text that is not a number is kept as typed
  and has no value. "A `level` field's records always carry a state" is also
  wrong in one case: a stored index outside the key's level names has no group
  among them and goes to **Other**, where an earlier reading would have clamped it
  to the last name. The clamp does not apply to grouping, and §13 item 5 must not
  say it does. All are answered under **Where a record with no key value goes**.
- The framing sentence (b), that a provenance label "cannot be a free string stored
  in a record" because of Constraint 2: say it is a decision about §5's missing
  strings, since Passport stores one.

### The rest of the model question

- **Does the contract grow?** `ComponentDefinition` (§4.1) does not. `RecordSetConfig`
  gains one optional key, and `RenderContext` gains one more view-held pair, below.
- **What does it publish?** Nothing. `scopeRows`, `scopeModifiers`, `scopeValues`
  and every aggregate see the file's records in the file's order and do not know a
  group exists.
- **What does it store, and does it round-trip?** Nothing in the note. The layout
  gains one key (**Data and file model**).
- **Existing notes (Constraint 4).** None is touched, in either direction.

## What it does

An author names one `level` or `number` field as a Record set's **Group by** key,
and the list draws its records under a header per value, each header collapsing
its records. A multiclass character's features sit under Fighter and Wizard; a
spellbook sits under its spell levels. A collapse is the reader's own posture, held
by the sheet and never written to the note or the layout.

## Smallest version

`groupBy` on a `level` or `number` field; groups in declared (or numeric) order;
a header per non-empty group with a collapse button and a count; collapse state
held by the view; the focus and landing rules for an edit and for **Add**; and the
text field in the layout editor, with the sheet's own problem line as its report.
What it gives up: a class a player can invent without touching the layout, a bulk
collapse, a header figure, sticky headers, and any change to the editor tree.

## Design

### At a glance

```
Class features                                  <- the component's own label
+------------------------------------------------+
| [v] Fighter  3                                 |   <- heading: button + count
|  >  Second Wind               [2 / 2]   (bin)  |
|  >  Action Surge              [1 / 1]   (bin)  |
|  >  Fighting Style            [   ]    (bin)   |
| [>] Wizard  2                                  |   <- collapsed: rows leave the
| [v] Unassigned  1                              |      scrollport, nothing else
|  >  Lucky                     [3 / 3]   (bin)  |
| [v] Other  1                                   |   <- a stored class outside the list
|  >  Old homebrew              [0 / 2]   (bin)  |
|                                                |
|  + Add feature                                 |   <- one control, outside the scroll
+------------------------------------------------+
```

The box is the same `height` rows tall whichever groups are open. The list scrolls
inside it.

### A group collapse is not a component ceasing to fill its placement

This is the first thing the design has to be, because §8 forbids the thing the
Group heading did. **The proof, from the code rather than from a hope:**

- The box is `--sheetsmith-rows × --sheetsmith-grid-row` tall as a floor
  (`record-set.ts` sets `--sheetsmith-rows` from `config.position.height`), and
  the list inside it is `position: absolute; inset: 0; overflow-y: auto`
  (`src/styles/sheet.css`, `.sheetsmith-record-set-list`). An absolutely
  positioned list contributes no intrinsic height to the box, which is why a long
  body already cannot grow the card.
- A collapse removes rows from the list, which changes the list's scroll extent
  and nothing the grid sizes from. The Group heading's collapse moved the sheet
  because its cell was sized by whatever spanned its grid rows
  (SPEC §4.2, "what it does not do"). A Record set's cell is sized by its
  placement and by neighbours, and the list is out of flow, so there is no path
  from a group's height to a track.
- The same argument already carries the record disclosure, which moves records
  *within the scrollport* and nothing on the sheet.

**The harness measures it, and the measurement is a criterion, not a belief.**
In the built harness, with a grouped Record set beside neighbours above, below and
beside it in its columns, record `getBoundingClientRect()` for the set's
`.sheetsmith-placed-box` and for each neighbour's cell, collapse the tallest group,
collapse every group, and expand them again. Every rectangle is identical to the
pixel at each step, at a wide and at a narrow pane. With every group collapsed the
box is still `height` rows tall, with the headers at the top and empty space below.
That is allowed: the box is the placement.

### The header

**A heading containing a button, W3C accordion shape. Not `details`/`summary`.**

- An `h3` holding one `<button type="button">`. The sheet has no other headings
  (a component's label is a `div`), so the level carries only its position in the
  note's own outline, where a component's section is `##` and a record `###`; a
  group sits between and is given the lower of the two so that a reader navigating
  by headings finds the groups and not forty record names. [judgement]. A test
  holds the element and its level.
- The button holds the chevron (the record disclosure's own `chevron-down` /
  `chevron-right` pair, `aria-hidden`) and the group's name as visible text.
  **Its accessible name is that text and nothing else**, so Label in Name
  (WCAG 2.5.3) holds and voice control has the word to say. It carries
  `aria-expanded` and `aria-controls`. No `aria-label`, because the text is on
  screen (`docs/UI.md` §6). No `title`.
- **The count is not in the name.** It is a visible figure beside the button, in the
  secondary-text rank in tabular figures, `aria-hidden`; and a
  `.sheetsmith-sr-only` sibling holds its sentence, `3 features` (the record noun,
  pluralised as `recordCount` already does), and the button's
  `aria-describedby` names that sibling. A reader hears "Fighter, button,
  expanded, 3 features". The count is the number of records the group draws,
  including one whose fence will not read.
- **What `aria-controls` does.** It names the group's body, which holds every record
  of the group and is always in the DOM, because a collapse never removes rows
  (below). So the id always resolves, and an empty group is never drawn, so there
  is never an empty region to name. Support for `aria-controls` is thin and the
  record disclosure already relies on it the same way; the state a reader depends
  on is `aria-expanded`. If a later change removes a collapsed group's rows from the
  DOM the attribute must be dropped on a collapsed group, as the layout editor
  tree drops it on an open empty container (`docs/UI.md` §9).
- **What answers a press is the heading row.** The button fills the row and the
  count sits at its trailing end, so the hit target is the row and not the glyph
  (`docs/PATTERNS.md` §6, `docs/UI.md` §7). **One route in, and it is the heading
  row's `click`, not the button's.** The button's own press, the chevron, the name,
  the count and the empty row all bubble to it, and Enter and Space reach it as the
  button's native `click`. A button listener beside a row listener that ignored
  presses inside the button double-toggled a press on the chevron, because the
  chevron is repainted by the press itself and so is detached from the button by
  the time the event reaches the row; the group opened and shut and looked
  unmoved. A test presses every part and a harness script presses at coordinates.
  The row is at least the inline control floor tall.
- **Clothes are borrowed.** The chevron and its muted colour are the record
  disclosure's, the count is the secondary-text rank, the rule under the header is
  the Group heading's hairline. No new token, no new focus treatment: one ring per
  component (`docs/UI.md` §6). Group headers are **not sticky**, which would put a
  second sticky layer under the heading strip.
- **A group is one contained block.** Its header and its records sit inside one
  quiet border: `outline: 1px solid var(--background-modifier-border)` at
  `outline-offset: -1px`, with `--radius-s`. **An outline and not a `border`**, because a
  group is a subgrid in the wide regime and a border on a subgrid is added to its
  edge tracks and would pull the headed list's fields off its strip; an outline
  takes no track, no padding and no height, so the box, the rows and the columns
  are what they were (measured by `harness/measure-groups.mjs`). Groups are
  separated by `--size-4-2`. The earlier 2px leading rule down the body is gone: a
  box says it twice.
- **The header row is a band and its name is semibold.** Resting surface
  `color-mix(in srgb, var(--background-modifier-hover) 60%, transparent)`, hover
  `--background-modifier-active-hover`, name in `--font-semibold`. Not
  `--background-secondary`, which is the card's own colour and vanished into it in
  dark; a translucent step reads on any card in either theme. The mix is the plain
  hover step at 60%, quieter because the outline now carries the grouping and the
  band only says which line is the header.
- **The header is the control floor plus `--size-2-2` of block padding top and
  bottom**, about 29.8px against the floor's 21.8px at the default text size, so it reads as a
  header rather than a record's own line. The button inside keeps the floor as its
  own minimum and the hit target is the whole row. The band stays inside the box because a box alone does not say which line
  is the header.
- **A collapsed group is the header alone in its box.** The rule under the header
  goes transparent and the header takes the full radius, so there is neither a
  doubled edge nor a square corner poking out of the outline.
- **At higher contrast** the group's outline and the header's rule go to
  `--text-muted`, the siblings' pattern, so the box does not fade. The harness
  cannot render `prefers-contrast: more`, so this is one more unrendered case
  under the `docs/BACKLOG.md` row that holds the rest.
- **Headers are one per non-empty group and span the list's full width.** A list
  with one group still draws its header, so a header does not appear and disappear
  with the data under the reader's cursor.

### The group's name

- **A `level` key:** the level's name (`levelName`). A level with no named levels
  and only a `max` has no names, so it reads as the number's rule below.
- **A `number` key:** the field's name and the number, `Level 3`, so a spellbook
  reads without the author naming anything. The number is `String` of the value
  `typedValue` reads, so `3`, `03`, `3.0` and ` 3 ` are one group headed `Level 3`.
  The cost is that a spell-level header cannot say "Cantrip". An author who wants
  that makes the key a `level` field with names `Cantrip`, `1st` … `9th` and
  `input: 'select'`, and the spec records it as the answer rather than adding a
  header-name setting.
- **A record with no key value, or a level outside the list:** headed **Other**, below.

### Order

**Groups follow the key's declared order**: a `level` key by level index, which is
the declared order of its names; a `number` key by ascending numeric value
(negative and fractional values included). **Records inside a group keep the
file's order**, and position among the `###` blocks stays identity: nothing is
reordered, nothing is renumbered, and `Other` is always last. There is no hand
order, because hand order is the note's order, and no drag between groups. The
reading order and the tab order of the list are the *drawn* order, group by group,
which differs from the file's; a record's identity does not.

**Text that holds numbers, and case variants.** A `number` field is a text input
whose entry is kept exactly as typed where it is not a number (`boundedText`), so
the key reads through `typedValue`, the same reading `sum(spells, Level)` uses.
Therefore a group and a sum never disagree about what a record is worth: `01`,
`1.0` and `1e0` are all 1 and one group, and anything `Number()` accepts, `0x10`
included, is what the formulas already read it as. Case variants cannot arise for
a `level` or a `number`, because neither holds a word. They arise only for a
text key, whose rule (trim, case-insensitive, first-seen spelling, alphabetical)
belongs to that later feature and is recorded under **Deliberately not doing**.

### Where a record with no key value goes

- **A `level` key** has a value in every case but one. A blank, a missing entry, a
  missing fence and text that is not a number all read as 0, the field's first
  name, which is what "none" is called (§4.2). So such a record is in the first
  group. An author keying by class names that first level something that means it,
  for example `Unassigned`; the editor's description for **Group by** says so.
  **The exception is a number outside the list**: a stored value that rounds (as
  `levelOf` rounds) to an index below 0 or above the last name's. It has no name to
  sit under and is **not clamped**: it goes to **Other**, with the records below.
  On a level with no names, only a `max`, the list's end is that `max`.
- **A `number` key** reads a blank as 0, which is a real group, and a record whose
  entry is text that is not a number has no value.
- **A record whose fence will not read** has no value, since its fields cannot be
  read at all.
- **All three of those last cases go in one group headed `Other`**: a number key's
  non-number text, an unreadable record on either key, and a level key's
  out-of-range index. It is the same group whichever key is in use, always drawn
  last after every number or level group, with its own header, count and collapse
  state like any other. It is keyed by the empty string, which no number or level
  index can be, so its collapse state cannot collide with a real group's. **It is
  announced as its text, "Other"**, with the count sentence in `aria-describedby`
  like every header; it is not the field's name and not a number, so nothing
  can be mistaken for a value a reader could set. A level or number group never
  sorts after it, whatever the number's size. Records in it keep the file's order
  and stay fully editable where their fence reads.

### Collapse

- **Default: every group open.** Collapsing is the reader's gesture.
- **A collapsed group's records are still rendered, laid out, and have every
  formula evaluated**, as an inactive tab's are (SPEC §8). Hiding changes what the
  reader sees and never what the sheet computes, so `sum(features, Uses)`, a
  modifier a record pushes, and a reset reaching a record are the same whether its
  group is open or not.
- **How a group's rows are hidden:** the group's body, the element holding its
  records, is `hidden="until-found"` while collapsed, exactly the record body's
  spelling and for its reason: that attribute runs on `content-visibility: hidden`,
  so the rows leave layout and contribute no height, and the box does not move
  because it never depended on them. The body is the one element a collapse
  toggles; the records inside are not touched.
- **Collapse is painted in place and reported afterwards**, on the record
  disclosure's rule (`setOpen`: paint, then `onToggleRecord`), because nothing
  reaches the note, so no write means no rebuild, so a control waiting for one
  would never answer the press (`docs/PATTERNS.md` §5). Focus stays on the header
  button, which is not removed.
- **A press does not scroll.** Collapsing rows below the header leaves the header
  where it was unless the list is now shorter than its scroll position, in which
  case the browser clamps `scrollTop` and the header may move to stay in the box.
  The criterion is that the pressed header stays inside the scrollport and does not
  jump away, and the harness measures both cases. Expanding scrolls nothing.
  Nothing in this feature calls `scrollIntoView` except what landing focus does
  (below).
- **List scroll position across a rebuild is not preserved today.** `sheet-view.ts`
  keeps the sheet's own `scrollTop` across a rebuild and not a Record set list's,
  so an edit deep in a long list may return it to the top, and the focus restore
  is what brings the edited control back into view. This feature does not change
  that and grouping does not make it a different problem, but a grouped list is
  where a reader will meet it. The vault walkthrough checks it on an ungrouped list
  as well; if it reproduces there, it is a `docs/BACKLOG.md` row and not part of
  this change.

### Where the collapse is held

**View state, never the note or the layout file, and held outside anything
rebuilt**, because every edit recomputes and rebuilds the sheet and a collapse
that lived in the component's closure would reopen on the first edit.

- `RenderContext` gains `collapsedGroups?: readonly string[]` and
  `onToggleGroup?: (key: string, collapsed: boolean) => void`, a third pair beside
  `activeTab` and `openRecords`, with their comments extended where the type
  already says view-held reader posture is a category. They are a third pair and
  not a generalisation, on §1's rule: an index into alternatives, a set of open
  record positions and a set of collapsed keys are three shapes.
- `SheetView` holds a `Map<string, Set<string>>` keyed by **component id**, the set
  holding the **collapsed** keys of that component's groups, so absence is the
  default of open. It is cleared on a file change beside the other two and dropped
  when the view closes.
- **The key is the group's stored key value**: the level's index as a string, the
  number's `String`, or `''` for `Other`. So relabelling a level's name in the
  layout editor keeps the group's state, since the index is unchanged, and
  reordering or inserting level names rereads the notes already
  (`level-list-reorder-report.md`) and does the same here, by the same rule.
- **A group that vanishes and returns is a new group and opens.** At each render
  that draws groups, the component reports every held key that has no group *now*
  as expanded (`onToggleGroup(key, false)`), the way `shiftOpen` reports the
  difference rather than handing back a new set. A record edited from 1 to 2
  leaves group 1 empty and gone; if it returns, it opens. A renamed key value is
  the same thing: the old key vanished and the new one is a group nobody collapsed.
- **A render that does not draw groups prunes nothing**: an ungrouped fallback
  after a bad `groupBy`, or a read failure, leaves the held set as it was, so
  fixing the layout does not reopen what the reader had collapsed.
- **Id of a group's body:** `sheetsmith-record-group-<component id>-<ordinal>`, by
  the group's place in the drawn order. An id is not persisted and need only be
  unique and stable within one render.

### Add record

**One control at the foot of the card, outside the scroll, as today.** Not one per
group: that would be a second kind of control on a list that has one, and a group
is a display arrangement and not a place a record lives.

- The record appends at the end of the section **by the file's rule**
  (`appendRecord`), named for `recordName` with no fence. Its key value is
  therefore the default one: a `level` key's first name, a `number` key's 0.
- **It lands in the group that value names.** If that group does not exist it is
  created, since a group is drawn when it has a record. If it is collapsed it
  opens (`onToggleGroup(key, false)`) in the same render.
- **Focus lands in the new record's name field and selects it**, as today, but the
  landing finds the record **by its position in the file** (the appended index)
  and not as the last name field drawn, because the last drawn is no longer the
  last record. `nameFields` is indexed by position for that reason. Focus moves the
  list to the field, which is the one place this feature scrolls.

### An edit to the key in a focused record

- **The record does not move until the edit commits.** A `number` key is an input
  on `editable.ts`'s draft rules: typing changes the draft, Enter or blur commits,
  Escape restores. A `level` key's `<select>` commits on `change`. Nothing regroups
  while a draft is open, because a render is a consequence of a commit.
- **After the commit, focus follows the edited control into the new group**, which
  opens if it was collapsed. The record's open state is keyed by position, so an
  open record stays open and, where the key lives in the body, the reader is
  still looking at it.
- **How, given the view restores focus by control index.** The view's restore
  identifies a control by its index among a cell's controls, and regrouping moves
  the record, so that index now names another control. The component does what
  **Add** already does: it releases focus before reporting the commit, so the
  view has nothing to restore, remembers the record's position and the field's
  declared index, and lands focus on that control after the render
  (`awaitingAdd` is the precedent, and the same module-level shape). A test drives
  it.
- **What a typo does.** A `level` has none: the reader picks a listed name. A
  `number` typed as `12` where `2` was meant moves the record to a new group
  `Level 12`, ordered after 9, opened, with focus there; nothing is lost, and typing
  `2` moves it back and the empty group is gone. Text that is not a number
  moves it to `Other`. In every case the typo is visible as a group the reader can
  see the cause of.
- A keyboard user stepping a native `<select>` with the arrow keys commits on each
  step, and the record moves and keeps focus on each one. That is the control's own
  behaviour and is accepted: focus follows, so the next arrow press still reaches
  the same select.

### Interaction with what a Record set already has

- **Heading strip.** One strip over the whole list, sticky, as today. Group headers
  scroll under it. Every group's body is a subgrid of the same column tracks in the
  wide regime and a plain block below the threshold, so **the columns line up
  across groups** and the threshold, the strip and `fieldHeadings` are unchanged.
  Two things are measured rather than assumed, because a hidden element's
  `content-visibility: hidden` applies size containment and a subgrid's rows
  feed its parent's tracks: **collapsing a group moves no column of the groups
  still open**, and the strip stays centred over its fields in every regime. If the
  measurement fails, the tracks must come from the strip and the fields' own
  widths and not from any group's content, and that is a build finding to fix
  before landing, not a cost to accept.
- **Body fields.** Unchanged. A key placed in the body is changed by opening the
  record. A closed record's body stays `hidden="until-found"` inside a group's body
  that may itself be so.
- **`visibleWhen`.** Evaluated per record in `render` as today, and a field it hides
  keeps its value. **A key field hidden on a record still groups that record**,
  because grouping reads the note's value and not what is drawn; an author who hides
  the key with a condition has records in a group with no visible cause, and the
  **Group by** description says the key should be shown. A condition naming the key
  field's own key is already refused.
- **Find-in-page.** A collapsed group's body carries `hidden="until-found"` and a
  `beforematch` listener that opens the group (paint, then `onToggleGroup`). A
  record inside a collapsed group whose own body is also closed has two
  `until-found` ancestors, and the browser's reveal fires `beforematch` through
  them; both listeners exist, and **which fire and in what order is measured, not
  assumed**, in Chrome and in Obsidian. `docs/features/record-set-body-fields.md`
  could not take that measurement for the body fields (headless Chrome cannot drive
  the find bar) and it is still owed, so this feature does not claim more than the
  structure: the wiring exists and a test asserts it, and the three searches below
  are the by-hand check.
- **Resets.** A reset reaches records by position and writes values, so it reaches
  a collapsed group's records exactly as an open one's. **A reset that writes the
  key field regroups the records on the next render**, which is the data changing;
  nothing guards it, and the **Group by** description says an author who binds a
  reset to the key field will see records move.
- **Aggregates and modifiers.** `scopeRows`, `scopeModifiers` and every `sum`,
  `count` and `mod` read the file's records and ignore groups. **Grouping reads the
  stored value, never a modifier-adjusted one.**
- **Deleting.** The delete glyph arms then commits, as now. Deleting a group's last
  record removes the group, and its held state is pruned at the render that
  follows.
- **The labels and names.** A record's accessible name is unchanged.

### Empty and error states

- **No records:** the list with its **Add** control and nothing else, as today. No
  header, since an empty group is not drawn.
- **No `groupBy`, or a blank one:** the list as it is today, with no extra element
  in the DOM. A test holds the markup identical.
- **A `groupBy` naming no field, or a field of the wrong type:** the list renders
  **ungrouped**, never failing, and shows one line above the records, in the
  scrolling list so it never grows the box, in `.sheetsmith-error` and the same
  place and clothes as the `visibleWhen` line:
  - names nothing: `Group by is "Class", and this list has no field with that key.
    The records are shown ungrouped. Name one of its fields in the layout editor, or
    clear Group by.`
  - wrong type: `Group by is "Prepared", which is a toggle field. Records can be
    grouped by a level or a number field only. The records are shown ungrouped.
    Name one in the layout editor, or clear Group by.`
  The key matches a field's key case-insensitively and trimmed, as `write` already
  matches a delta's keys. A `computed` field is refused because its value is a
  formula's, and a modifier, because it holds a list; both fall under the wrong-type
  line. **This is not a `configError`**, which fails `read` and blanks the
  component: a grouping that cannot be drawn leaves a working list.
- **A key field that exists but whose levels are invalid** (fewer than two names)
  is already a `configError` and fails as it does today.

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `groupBy` | text | Group by | The key of one level or number field. Records are drawn under a collapsible header per value, a level in the order its names are written and a number from lowest to highest, and a record with no value goes under Other. It changes how the list is drawn and nothing in the note, and a reset bound to this field will move records between groups. A level suits a closed set such as a class: its names are the layout's, so a name a player invents needs appending to its **Level names** here; set the field to a dropdown and tick **Inside the opened record**, and name its first level for a record with no choice, such as Unassigned. A number suits a spell level and heads each group "Level 3". Show the key field, since a record hidden from it by a condition still sits in its group. Blank draws the list ungrouped. |

The kind is `text`, because a `select` takes a static list and the options here are
the component's own field keys, which no existing kind can offer. **The search for a
precedent that would let it be a picker found none that can be reused without a
contract change**: the only picker over a component's field keys is the reset
binding's **Acts on**, drawn by `editor/reset-field.ts` from the component's
`resetColumns` (`ResetColumn`, `types.ts`) and writing `reset[].column`, a
binding and not a config key; `resetColumns` obliges `applyReset` and offers every
field, which a grouping key is not; and `config-panel.ts`'s `select` branch reads
`ConfigFieldSpec.options`, a static `readonly string[]`. Offering a picker for a
config key would need a new `ConfigFieldSpec` kind or an options provider, which is
a contract and editor change this spec does not make. A dynamic picker is
an editor feature of its own, and a second config key naming a field would be its
trigger. **The editor's report is the canvas.** The canvas draws the layout's own
components live through the same render path (SPEC §7), so a key naming nothing
shows the sheet's own problem line on the canvas the moment it is committed, in
place (`docs/UI.md` §10), and no editor-side validation hook is added to
`ConfigFieldSpec`, which would be a change to the contract. The `fields`
description is not amended.

## Data and file model

**No change to the character note.** No key, section, fence entry or body byte
changes, and grouping is display only: `read`, `write`, `sample`, `scopeRows`,
`scopeModifiers`, `applyReset` and every reset, aggregate and modifier path do not
know it exists. Collapse state is in neither file. A note round-trips as it did,
and no note test changes.

**The layout gains one optional key**, `groupBy: string`, written only when
non-blank. A layout without it parses, draws and serialises byte-identically to
today. A hand-written `groupBy` the editor would not write (case, padding) is
carried untouched. **Constraint 2** is not in play, since nothing is stored.
**Constraint 4:** a layout edit that clears or changes `groupBy` deletes nothing,
and a field key renamed in the editor **does not rewrite `groupBy`**: it is a
config key and not a formula, and teaching the list field about a sibling key is
code outside the component knowing it exists. A renamed key therefore leaves
`groupBy` naming a field that is gone, and the list shows the first line above
until the author fixes it, which is loud and loses no data.

## Acceptance criteria

### Held by tests

- [x] A Record set with no `groupBy` renders the same DOM it did before this feature,
      and `write` returns the same bytes. A layout carrying `groupBy` round-trips
      through `parseLayout` and `serialiseLayout` byte-identically, and one without
      it does too.
- [x] A pure grouping function (`src/parse/record-groups.ts`, with its own test
      file, importing nothing from `obsidian`) takes the records and a reading
      callback and returns ordered groups: it owns order, merge and the Other group,
      and treats a reading with the empty key as no reading. **What a record is
      worth to the key is the component's:** a `number` is read through
      `typedValue`, and a `level` through the exported `levelIndex` in
      `level-ring.ts` (the one reading `levelOf` clamps), compared against the
      level count in `groupReading` so an out-of-range index is not clamped. A
      `src/parse/` module cannot import either. Tests: a level key orders by index; a number key
      orders ascending including negatives and fractions; `3`, `03` and ` 3.0 ` are
      one group; a blank number is the 0 group; text that is not a number and an
      unreadable record are in `Other`, last; records inside a group keep file order;
      every record is in exactly one group; a level index past the last name, a
      negative one and one that rounds out of range are in `Other`, not clamped, and
      an index equal to the last name is not; a blank or non-numeric level is the
      first group; a record count per group.
- [x] `groupBy` naming no field, a toggle, a computed or a modifier field renders
      ungrouped with the stated line, and does not fail `read`. A blank `groupBy`
      renders ungrouped with no line. A key's case and padding match.
- [x] A level outside the key's names is drawn under **Other**, last, headed and
      announced as "Other" with its count, and **Other** is the same group, in the
      same last position, for a number key's non-number text.
- [x] A header is an `h3` containing one button; the button's accessible name is
      the group's name alone; its `aria-describedby` resolves to a sibling holding
      the count's sentence; `aria-expanded` follows state; `aria-controls` resolves
      to an element in the document, in both states.
- [x] A collapsed group's body is `hidden="until-found"` and holds every record of
      the group; a `beforematch` on it opens the group and reports it; every record
      is still in the DOM, and its formula fields still hold their values.
- [x] Collapse state survives a re-render triggered by an edit in another group, in
      this one, and in another component, because the context hands it back; it is
      empty on a new `SheetView` file, and cleared when the leaf changes file
      (a case in `sheet-view.test.ts` for this member only; the backlog row for the
      other two stays deferred).
- [x] A group that is gone at a render is reported expanded, so it opens if it
      returns; a render that draws no groups reports nothing.
- [x] **Add** with a `level` key appends a record named for `recordName` with no
      fence, which draws in the first group; the group opens if it was collapsed;
      focus lands in that record's name field by position, though it is not the
      last record drawn; and the list has one **Add** control, outside the scroll.
- [x] A key edit: before commit the record is where it was; after, it is in the new
      group, that group is open, the record's open state is unchanged, and
      `document.activeElement` is the same control of the same record. The same for
      a number typed into `Other`. Escape restores and the record never moved.
- [x] A reset reaches a record in a collapsed group, and `sum(<id>, Level)` is the
      same with a group collapsed.
- [x] `contract.test.ts` and `isolation.test.ts` pass unchanged; the layout schema
      gains the key from the component's config.
- [x] `styles.test.ts` agrees with the regenerated `styles.css`.
- [x] A press on any part of a header toggles it exactly once: the button, the chevron's span, svg and path, the name, the count and the row. (`record-set.test.ts`, "toggles exactly once whichever part of the header is pressed", added after a press on the chevron was found to toggle twice in the app)

### Held by looking (`npm run harness`, then `npm run harness:shot`, then `/design-review`)

- [x] **The sheet does not move.** The measurement above, with numbers recorded:
      every neighbour's and the set's own rectangle identical across collapse
      of the tallest group, collapse of all, and expand, in the wide and the narrow
      regime, in both themes.
- [x] A headed list's columns line up across groups, and collapsing a group moves
      no column of the open ones, in the wide regime; the strip is centred over its
      fields in both.
- [ ] *Owner-checked, judged by eye in the vault and ticked by no review.* A header reads as a header and not as a record: the chevron and count are the
      shared vocabulary's, the count is quiet, one focus ring, the row is at least
      the inline control floor, no new token.
- [x] The pressed header stays inside the scrollport after a collapse, with the
      list taller and shorter than its box.
- [x] The problem line for a bad key is in place under the label, inside the
      scrolling list, in `.sheetsmith-error`.
- [x] The editor's canvas shows the same grouped list, with groups open, and the
      problem line for a key naming nothing.
- [ ] *Not rendered by anything.* The `prefers-contrast: more` rules for the group's outline and header rule: the harness cannot render that mode (`docs/BACKLOG.md`'s row on it).
- *The measurements are `harness/measure-groups.mjs`* (sheet does not move, columns and strip, real mouse and keyboard presses, pressed header in the scrollport). It is run by hand after `npm run harness` and is **not wired into a gate or a `package.json` script**, as the other harness scripts are not either.

### By hand, for the owner (the harness cannot take them, and no review ticks them)

- [ ] With every group collapsed, press Cmd/Ctrl-F in Chrome and in Obsidian and
      search for a record's name, a word in its prose, and a body field's name.
      Record whether the group opens, the record opens, and in what order; the
      result goes into SPEC §4.2's disclosure bullet.
- [ ] Tab from a header: it reaches the next header or the next open group's first
      control and never a collapsed group's, and Shift-Tab goes back the same way.
- [ ] With a screen reader, a header reads name, button, expanded or collapsed, and
      its count.
- [ ] Edit a field in the lowest group of a long list and see where the list's
      scroll goes; repeat on an ungrouped list.

### The throwaway vault fixture

The vault is outside the repository, so its recipe lives here (`AGENTS.md`). It is
`~/Developer/sheetsmith-test-vault/`, and the work goes in the Record set fixture
and not in Aramil, which stays plain.

**`Sheetsmith layouts/Record variations.sheetsmith`** gains, and every existing
component is an unchanged control:

- `class_features` ("Class features"), four columns wide and four rows tall, with a
  Card directly above it and a Pool directly below in the same columns, so a shift
  of the sheet shows against two neighbours. Fields: `Class`, a `level` with levels
  `Unassigned`, `Fighter`, `Wizard`, `Cleric`, `input: 'select'` and
  `placement: 'body'`; `Uses`, a `number` with `max: 3`. `groupBy: Class`.
- `grouped_spells` ("Grouped spells"), six columns wide and four tall,
  `fieldHeadings: true`: `Level` (number, summary), `Prepared` (toggle).
  `groupBy: Level`. This is the strip-over-groups case.
- `spells_by_name` ("Spells by name"): the same fields, with `Level` a `level`
  named `Cantrip`, `1st`, `2nd`, `3rd`, `input: 'select'`. `groupBy: Level`. This
  is the named-header case.
- `bad_group_missing` and `bad_group_toggle`: two small Record sets whose
  `groupBy` is `Nope` and `Prepared`.
- A Tab set holding a grouped list, to show a collapse inside a container.

**`Characters/Records.md`** gains sections for each: `## Class features` with seven
records (three Fighter, two Wizard, one with no `Class` entry so it lands in
`Unassigned`, one with `Class: 9`, which is outside the list and lands in
**Other**), `## Grouped spells` with eight (levels 0, 0, 1, 1, 3, `03`,
`two` and blank), `## Spells by name` with five, and two records under each bad
key. One record in `Class features` has a body, one has no fence.

Press (owner-checked, none ticked by a review):

- Collapse and expand each group, and confirm no neighbour moves; collapse all.
- Edit a field in another group and confirm the collapsed one stays collapsed.
- Change a record's `Class` and confirm it moves, its new group opens, and focus
  is on the same dropdown. Type `12` into a `Level`, then `2`, then `two`.
- Press **Add** with the `Wizard` group collapsed and with `Unassigned` empty.
- Delete the only record in a group and add another with that value.
- Close the note and reopen it: every group is open. Confirm `Records.md`'s bytes
  do not change from collapsing, using its modified time or a diff.
- Resize the pane across the strip's threshold on `grouped_spells`.
- The by-hand list above.

## Commit boundaries

These are a plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. `feat: Group a Record set's records by a field`. The pure grouping module and
   its tests, `RecordSetConfig.groupBy`, its `configFields` entry, the validation
   and the problem line, the contract and round-trip tests.
2. `feat: Collapse a Record set's groups`. `collapsedGroups` and `onToggleGroup`
   on `RenderContext`, the view's map and its clear, the header, the body's
   `until-found`, the prune, **Add** landing by position, the key edit's focus
   rule, the `sheet.css` rules, the regenerated `styles.css`, the component and
   view tests.
3. `test: Photograph and measure a grouped Record set`. `harness/samples.ts`
   fixtures, and the measurements the criteria name, with the numbers recorded.
4. `docs: Record how a Record set groups`. SPEC §4.2's Record set entry, §8's
   disclosure sentence, §13's `Resolved:` line and the three corrections above,
   `docs/UI.md` §9's disclosure and summary-line rows, `docs/BACKLOG.md` row on
   reader posture (three now, and which one a test now holds), the find-in-page
   result if taken, and this document's status.

## Deliberately not doing

- **Expand all and collapse all.** Deferred, not dropped. The record disclosure
  found against one, on the finding that a control which opens forty bodies has its
  outcome off-screen the instant it fires, and a group is a lighter thing to open.
  **The trigger to build it:** the first reported complaint that opening or
  closing groups one at a time is the cost, or a shipped starter layout that groups
  a list whose key can take more than 10 values (a spell list by level is 10 at its
  most, so it does not trigger it alone). It would be one control beside the label,
  not a header gesture, and its first design question is what it does to a header
  the reader has deliberately collapsed.
- **Free-text group key: let a player type their own class or group name on a
  Record set record, which reverses the "no text field" decision.** *(Built: `docs/features/free-text-group-key.md`.)* Deferred as its
  own route by the owner, gated on that reversal (SPEC §4.2,
  `docs/features/record-set.md`, §5's missing strings), which needs its own spec
  and model question (SPEC §13 holds it). **Class grouping does not cover a
  player's own classes**: a `level` key's names belong to the layout, and a
  homebrew class costs the layout author one appended name. A per-character
  choice of which field a list groups by is not wanted. Sized under **Model
  question**, with its grouping rule written already: trim, match
  case-insensitively, head the group with the first-seen spelling, order
  alphabetically, and treat a typo as a new group. A `select` field type is
  refused alongside it: it has the closed-set property and a larger editor
  surface.
- **A header figure**, such as slots or a sum of the group's `Uses`. A multiclass
  character's slots are not a function of the group's own records.
- **A collapsible Group heading, nested records, two groups per record** and any
  change to the layout editor tree's collapse. A component never ceases to fill its
  placement.
- **Table.** Its rows are a uniform grid with aggregates, and a column sum across
  groups would change what a sum means.
- **Hand order, dragging a record to another group, one Add per group.**
- **A header-name setting.** A number key's header is `<field name> <n>`, and a
  named header is a `level` key.
- **Sticky group headers.**
- **Arrow-key movement between headers**, the optional accordion pattern. Every
  header is a tab stop, on Tab set's argument that a control whose job is hiding
  things must not hide the fourth one behind a key nobody was told about.
- **Persisting collapse state**, in the note, the layout or plugin data.
- **Carrying a key rename into `groupBy`**, and a dynamic field picker or an inline
  validation hook for it. Both are triggered by a second config key naming a field.
- **Preserving a Record set list's scroll position across a rebuild.** Checked, and
  filed if it reproduces on an ungrouped list.
- **Prefilling `groupBy` in the Spellbook or Features palette entry.** Which key
  groups a list is a system's call.
- **Every `docs/BACKLOG.md` row**, which stays deferred, apart from the reader
  posture row's count and the view test for this one member.
