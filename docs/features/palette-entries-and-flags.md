# Palette entries, and the flag Track

Status: shipped
Board card: Fold Toggle into Track, and give the layout editor's add menu its first
palette entry.

Two deliverables, in this order: the mechanism by which the editor offers a component
with its configuration prefilled, and one entry built on it — a **Checkbox**, over
Track with `count: 1`. The second is what takes Toggle out of the catalog.

## Model question

None open, and that is the point of the ordering. §13 has already settled both halves.

**The palette entry** is settled by the five-blocks entry: "That leaves two homes: a
table in `src/editor/`, or an optional member on the component definition. The second,
because the first hands the editor Table's column shape, and nothing outside a
component knowing that component exists is the rule the catalog is built on." It also
settles that it is buildable now: "the interim editor's dropdown is a list of entries
as readily as a list of types, and M4's palette reads the same list."

**The fold** is a decision that predates this work. §12 lists Toggle among the
remaining variations, "simpler single-value cards", and Track shipped with `marks`
defaulting to 1 and a stored value counted in marks. A Track whose run is one segment
of one mark is a control with exactly two states, which is the whole of what Toggle
was. Its config — `label`, `reset` — is a strict subset of Track's, so nothing is
lost. What the fold has to answer is only what such a run *stores*, and that is the
first question below.

**Why this is not a config field.** The obvious alternative is a declared `storage:
'boolean'` (or `asFlag: true`) on Track. It is refused, and §13 already carries the
argument: the row-set entry records the cost of the last fold as "a config form with
two mutually exclusive pairs in it, `count` against `levels` and `rows` against
`levels`, both enforced when a layout is read rather than by the shape of the thing."
A third such pair would be the worst of them, because the other two are two *authored*
things that disagree, and this one would be an authored thing disagreeing with a
number: a flag flipped on beside `count: 6` has no reading at all, and a flag left off
beside `count: 1` writes a number for a control with two states. The author would be
holding a fact the layout already states. So the storage is a **consequence** of the
run's length, and there is nothing to keep in step.

## The five questions

### 1. What does a one-segment Track write?

**A card writes a flag when every run on it is one segment of one mark, and the layout
says so without running a formula.** Then every run stores `yes` or `no` instead of a
mark count. Precisely:

- `marks` is 1 — its default. A one-segment run of four marks has five states, not
  two, so it is not a flag.
- The run's length is **literally** 1: either `levels` names exactly two states (none
  and one, so the run is one segment), or the run's `count` is a plain integer literal
  `1` — the number `1` or the text `"1"`, since the editor writes a `formula` field as
  text and an author typing `1` must get the same component the palette entry does.
- **Every** run on the card, not each one separately.

Three consequences worth stating, because each was a branch.

**A `count` written as an expression is never a flag, even when it resolves to 1.** A
formula count is what a run's length is *today*: `level - 4` is 1 for a fifth-level
character and 3 later. If the note's spelling followed the resolved number, raising a
character's level would change how their sheet is spelled, silently, on the next
press. Being a flag is a property the layout **declares**, and a declared property is
one a reader of the layout can see. It also keeps `applyReset`'s `empty` branch honest:
emptying resolves nothing today, on purpose, so "a track whose count is broken can
still be cleared" — and a spelling that needed the resolved count would have taken
that away.

**A `count: 1` Track carrying two levels writes a flag.** `levels: ["Fine",
"Bloodied:!"]` is one segment whose one step is named, which is two states, which is a
flag; and the arity is what the spelling is about, not how the length was declared. Two
layouts describing the same one-segment run must not store differently, with nothing on
the card to say which. `rows` and `levels` are already refused together, so the
combination only ever arises on a single run.

**Per card, not per run — and the existing spell-slot fixture is why.** A row set of
five, three and one takes its third row's length from the component's `count: 1`
fallback, so a per-run rule would write `L1: 2`, `L2: 1`, `L3: yes` down one fenced
block. One spelling per card is what a hand-editable note needs; a card whose entries
disagree about what a number is invites exactly the "two numbers that can disagree"
failure the mark exists to avoid. So a checklist of named flags is a card *all* of
whose rows are one segment — which is a real configuration and the thing rows gain here
— and a slot card with a one-slot level goes on storing numbers.

**What it publishes.** A flag card publishes a **boolean**, under the run's name and
under `<name>.value` alike. That is what Toggle promised and what a `toggle` column's
cell already means to a formula (`cellValue`), so `if(inspiration, 1, 0)` is the
expression an author writes and it works. The bare-name/`.value` split says nothing
new here, exactly as the Track's own comment already notes it says nothing new where a
segment holds one mark. An **absent** value publishes `false` rather than nothing: a
flag has two states and no room for a third, the empty ring on screen reads as "no",
and the alternative is a `?` beside every unset flag on a new character's sheet — the
argument the aggregate already makes for an empty inventory weighing nothing.

**`<id>.count` survives, at 1.** A numeric run publishes its ceiling, so a layout that
lowers `count` from 6 to 1 must not silently take that name away from every formula
reading it — the same continuity the read side gives a *raised* count. A checklist
publishes no `count`, exactly as a numeric row set publishes none, because a set of runs
has no one ceiling to name. So the flag branch mirrors the numeric branch's shape in both
cases rather than inventing one.

That is asymmetric with a numeric run, which publishes nothing when its entry is
blank, and the asymmetry is deliberate rather than overlooked: a run's fill is a count
whose ceiling can itself be unresolved. Whether a blank numeric run should publish 0 is
a separate question and is not opened here.

### 2. A note written before this change, and a layout that raises `count`

There is no Toggle note anywhere, because Toggle was never built — it has only ever
been a catalog entry. So both cases are the same case: **a Track note holding the
spelling the other rule would have written.**

- A note written by a `count: 1` Track before this change holds `value: 1` or
  `value: 0`, where a boolean is now wanted.
- A note written by a flag holds `value: yes`, and its layout then raises `count` to 3.

**Read accepts both spellings, on every run, always.** A numeric text is a mark count;
`yes`, `true`, `x`, `✓`, `✔` and `1` are one mark; `no` and `false` are none. So `yes`
on a ten-segment run is one mark with its first segment filled — the state the flag was
in — and `1` on a flag card is a ticked box. Neither is corrected on read: §7's rule
that a stored value outside the run is rendered rather than fixed covers this exactly,
and the note keeps what it says until the user changes that value. The next write then
uses whichever spelling the layout now declares.

Accepting the flag spellings on *every* run rather than only on a flag card is the
load-bearing half. Track's `read` currently reports a non-numeric value as a malformed
section, so the narrow rule would turn every existing character note into an error card
the moment a layout raised `count` from 1 to 3 — which is the crash this question is
asking about.

**The component owns the coercion.** `track.ts`, and the vocabulary is in one
predicate, `readsAsMarks(text)`. `marksFrom(raw)` turns a value into marks and is what
`scopeValues` and the render's own "what does the note hold" both go through; `read`
shares the predicate rather than the value, and **cannot** share the value, because
`marksFrom` answers `null` for both "empty" and "unreadable" and those two are precisely
what `read` has to tell apart — an empty entry is an editable card and an unreadable one
is a malformed section. So what is shared is the half that could drift (which spellings a
run can read) and what is not shared is the half that genuinely differs. Not `src/parse/fenced.ts`: its header states the contract it would be
breaking, "values stay raw strings; interpreting them is the component's business",
and a fence does not know a flag from a count. Not `src/formula/`: `coerceValue` turns
`yes` into the string `"yes"`, and teaching truthiness to the expression language would
make every stored string in every vault truthy-aware, which is a language change
nobody asked for and which §5 explicitly refuses in the aggregate (`sum()` on a
boolean is an error rather than a coercion).

**The spellings are shared, not copied.** `table.ts` already holds `TOGGLE_TRUE`,
`TOGGLE_FALSE` and a `TRUTHY` set, and Track becomes the second reader of all three.
PATTERNS §1 names this case twice — the truthiness spellings are its standing example,
and its policy tier says a *set* climbs the ladder in one step because "the only thing
a test could check is that the copies still agree". So they move to
`src/components/stored-flag.ts`, beside `column-types.ts` and for its reason, and the
**application** moves with them rather than only the values: `isFlagSet(raw)`,
`flagText(on)` and `flagReading(on)` — the last because "Yes" and "No" are what a
two-state control is called in both components and a pair of strings is a policy too.

### 3. The palette entry's shape

`PaletteEntry`, in `src/types.ts` beside the rest of the component contract, declared
on `ComponentDefinition` as an optional member:

```ts
palette?: readonly PaletteEntry<TConfig>[];
```

One entry carries three things and nothing else:

| Member | What it is |
| --- | --- |
| `name` | What the palette calls it, and the label the new component starts with. "Checkbox", "Inventory". |
| `description` | What the entry is for, shown beside the menu. Required, on `configFields`' own rule: it is the only explanation the author is given. |
| `config` | The configuration written into the new component. `Partial<TConfig>`, minus the keys the editor owns. |

**`config` excludes `id`, `type`, `label`, `position`, `reset` and `children` in the
type**, so prefilling one is a compile error rather than a convention — the same rule
`configFields` has as `RESERVED_KEYS`, made structural because there is no editor field
to check here. Two of the six are worth the sentence. A `reset` prefill would name a
trigger the layout may not have declared, which §6 reports in the editor rather than
refusing, so an entry could hand an author a binding that reaches nothing. And a
`children` prefill would make an entry that produces several components, which §13
already rules out: "a palette entry is one component with its config filled in, so a
job needing two components has nothing for one entry to be."

**Nothing else.** No icon (there is nowhere to draw one before M4), no ordering key
(the palette is the registry's order, and an entry sits under its own type), no
machine id (the menu's option value is derived, below).

**Two constraints on what an entry may hold**, which are the contract's rather than the
shape's, and which go in §4.2 beside the earning rule rather than living only in a test —
a build-failing rule the spec does not state is the silently inherited invariant question
5 exists to prevent. **Every prefilled key is a config field the component also renders**,
because an entry is a starting point the author edits and a prefilled key with no field is
configuration they can neither see nor undo. And **no two entries on one type share a
name**, because those are two identical indented lines differing only in an option value
nobody sees. Not unique *across* the palette: the menu is grouped by type, so a Table
offered as "Inventory" beside a Stat group offered as "Inventory" is two distinguishable
lines, and refusing that would refuse one of the three prefills §13 defers. The optional-member rule in
§4.1 is satisfied: the alternative is a table in `src/editor/` holding Table's column
shape and Track's `count`, which is the editor knowing what a component is.

The registry gains one function, `paletteEntries(type)`, the exact analogue of
`listComponentTypes()`. The **flattening** — which options a dropdown holds, in what
order, indented how — stays in the layout editor, because there is one consumer of it
and §1 is explicit that one consumer earns no module. M4's palette is the second, and
it moves then.

### 4. Entries only, or entries and types together?

**Both, in one dropdown, each entry indented under the type it prefills.**

```
Group
Pool
Stat
Stat group
Table
Tab set
Track
  Checkbox
```

Types have to stay, and not for completeness: an author who wants a plain Track must be
able to ask for one, and an entry is a *starting point the author edits* rather than a
variant with different capabilities. A menu of entries alone would either hide the
generic block behind a job name — the exact failure §2 records twice, where "nobody
building an inventory looks for a skill card" — or force every component to declare a
bare entry of itself, which is ceremony that says nothing.

**Why this stays readable at ten entries.** The list's *length* grows with the entries;
its *structure* does not. It is always the seven-odd types in registry order, each
followed by its own prefills, so scanning it is scanning the catalog — an author
looking for a job reads down the blocks, and one who has not found it knows the block
that does it is the parent of where they stopped. Ten entries spread over seven types
is one or two lines under each. A flat alphabetical mixture of types and entries is what
would have become unreadable, because the type that answers a job would no longer be
next to the entry naming it.

The indent is not invented here: the destination dropdown four lines away already uses
a figure-space indent for the same reason, "because a dropdown has no other way to say
that one container sits inside another". Reusing the vocabulary is §9's rule.

**And the description is on screen, not only in the code.** The Add row's own
description line carries the selected entry's `description`, updated as the dropdown
changes. That is what keeps a short menu line honest — the option says "Checkbox" and
the line beside it says what a checkbox is and what it does to the note — and it is
what stops `description` being a member nothing reads. A bare type has no description
and the line is empty, which is the truth: a type's name is all the interim editor has
ever offered for one.

### 5. What earns a palette entry?

§13 states outright that there is no rule "beyond the block already covering them", and
names the cost of not having one: "the palette becomes the place system flavour
collects, with nothing enforcing a limit on it". So the rule goes into §4.2 with the
mechanism:

> **An entry earns its place where a job an author would go looking for is one
> component's configuration away, and the name of the component that does it would not
> lead them to it.**

Both halves do work. The first is §13's existing check — the generic block has to cover
the job rather than nearly cover it, and a job needing two components has nothing for
one entry to be. The second is the reason an entry exists at all, and it is §2's own
argument for renaming Skill card: an entry is a *findability* device, not a
typing-saver. Config an author would have found anyway is a worse menu line for no
gain.

Checkbox passes both. `count: 1` is one field; and nobody wanting a checkbox looks for
a component called Track, which is the whole of why Toggle looked like it needed to
exist.

## What it does

**Deliverable 1.** A component may declare palette entries. The interim editor's add
menu offers them beside the types, indented under the type each one prefills, with the
selected entry's description beside the menu. Adding one writes an ordinary component
carrying the entry's config, labelled with the entry's name, which the author then
edits like any other.

**Deliverable 2.** Toggle leaves the catalog, and Track gains one entry — **Checkbox**,
`count: 1`. A Track card every run of which is one segment of one mark is a **flag
card**: it draws each run as the level ring rather than as a run of segments, stores
`yes` or `no`, publishes a boolean, and resets to `yes` and `no` on `full` and `empty`.

## Design

### The control is the level ring, not a checkbox

§4.2 already ruled this for the table: "A `level` column and a `toggle` are one control
with a different number of states... two adjacent columns doing the same job must not
measure differently under the same finger, and a native checkbox had none of the ring's
hit target, coarse-pointer sizing, or press feedback." UI.md §9 states the same rule
one level up, as an obligation on new work: "When a card and a cell do the same job,
they share the painter. A single-level mark on a card and the same mark in a table cell
must go through `paintLevelRing` rather than a lookalike, precisely so one flag cannot
measure differently from the other under the same finger."

So a flag is `paintLevelRing` on a `<button aria-pressed>`, taking the ring's 1.6em
box, its `--sheetsmith-table-control` measurement, its press scale, its focus outline
and its expanded hit target. **There is no native checkbox anywhere in this feature.**

A named flag is `graded`, so the ring carries the level's mark: `levels: ["Fine",
"Bloodied:!"]` draws an empty ring or a filled one holding `!`, with the name a hover
away, a long press away on touch, and given to assistive tech — the level ring's own
three routes, unchanged. An unnamed flag reads as "Yes" and "No", which is the reading
the table's toggle column already uses and now shares.

### Reusing the ring means the painter stops naming a table

`level-ring.ts` is the shared painter and it hardcodes `sheetsmith-table-cycle-on` and
`sheetsmith-table-cycle-part`. That was fair while its two consumers were a table and
the editor's sample *of* a table column; with a Track card as the third it is PATTERNS
§1's worked example inverted — "a module in `interaction/` is passed
`'sheetsmith-pool-step'` rather than naming a pool itself". A track card whose control
carries a class called `table` is a name that will be believed.

So the class is renamed to **`sheetsmith-level-ring`**, with `-on` and `-part`, across
the painter, the table, the editor's sample, the stylesheet, UI.md §9's vocabulary row,
and the selectors in three test files. Nothing about the rendered result changes; it is
the same rule the rename of Skill card followed, applied to a class name. It is part of
this feature rather than a tidy-up beside it, because "reuse that control" is not done
while the control is named after the one place it used to live.

The hit target rule stays on the shared class rather than being scoped back to the
table, because a 21px circle is the smallest thing on the sheet wherever it is drawn.
That has one consequence to pay for: in a **checklist** the rings are stacked, and the
target reaches `--size-2-2` above and below, so the set's `row-gap` of `--size-2-1`
would let two rows' targets overlap and the later ring would win the press. A flag
card's set takes `row-gap: calc(2 * var(--size-2-2))` — which is the arithmetic the
editor's own level sample already does for the same reason, and the comment cites it.

### `sense` on a flag, honestly

A flag card takes `sense` like any other Track, and `harm` puts
`.sheetsmith-track-harm` on the control. **It currently changes nothing on screen, and
that follows from the existing rule rather than being an omission.** Harm grades a run
from 45% of the accent at its first segment to the full accent at its last; progress
takes the accent whole. A run of one segment *is* its own last segment, so both land on
the same colour. There is nothing to grade in a run with one step.

The alternative is a colour that says "bad", and the pool's own boundary rule refuses
exactly that: "Deliberately not red and green... Draining the colour and lending the
accent say 'different' without the component asserting 'bad' and 'good' about a game it
does not know." A harm flag is a place a later decision could hang something; the class
is applied so it has a hook, and the stylesheet says nothing yet.

### What the card looks like

- **One flag.** The label above, one ring below it, on the track card's existing
  surface. The card's own vertical rule is unchanged: the label holds the top and the
  run collects the free space.
- **A checklist.** The row set's grid, unchanged: the row name right-aligned in its own
  column, the ring beside it, read down as a column. `justify-items: start` already
  means a row is as wide as its content, which is what a checklist wants.
- **No step line.** `.sheetsmith-track-step` exists for a named run, where the number
  is an index into a rule and the segments alone leave the reader counting. A flag has
  one step, its ring already carries the mark, and the name is on the ring — a line
  under it repeating "Bloodied" is the tooltip-repeating-the-legible noise the stat
  card's label and the level ring both learned to stop doing.

### Interaction

The run's gesture machinery does not carry over, and that is deliberate rather than
lazy. A drag across a run, the give at either end, the mark-level hit test, the pending
fill and its faint ghost, and the 700ms commit window all exist because a run has
positions between its ends. A flag has two states and one gesture.

| Input | What it does |
| --- | --- |
| Press | Toggles, and writes. Immediately, as a table's toggle cell does: the outcome *is* the input, so §12's rule about previewing an outcome does not engage. |
| Space, Enter | The button's own click. Nothing added. |
| `←` / `→` | Clear and set, without wrapping — the ring's "aim rather than count", not a second toggle. |
| `↑` / `↓` | Move between the runs of a checklist, on the axis they are laid out on, exactly as a row set of runs already does. One tab stop per card. |
| Long press | The level's name, where the levels are named. The ring's own touch route to a glyph's meaning. |

`aria-pressed` carries the state, because two states is a toggle button and ARIA has a
word for it — the table's rule, and the reason the run's `role="slider"` is wrong here.
The accessible name is the row's name in a checklist and the card's label otherwise;
the checklist keeps its `role="group"` naming the card.

**Writing on the press rather than after a window.** One flag press is one write, so
the debounce buys nothing and would only delay the note. `commit` runs synchronously
from the click, which means **a checklist writes once per ring pressed, not once per
burst**: the first press has already written before the second can happen. Measured, on
a two-row checklist: two clicks, two `onChange` calls. That is the right outcome — the
outcome of a press *is* its input, so there is nothing to defer — and it is worth
stating rather than leaving to be discovered, because `commit` itself does collect every
dirty run and so reads as though it would batch here. It never can. Where that
collection earns its place is the run path, where two arrow steps on two runs inside the
commit window genuinely leave two dirty, and `applyReset`, which writes every row at
once through its own path.

### The spelling, and the write that must not happen

`commit` compares what a run would write against what the note holds. A flag card
reading `value: 1` from an older layout would then find `yes` ≠ `1` and rewrite the
note on the next blur, having changed nothing the reader asked to change. So a run's
"what the note holds" is initialised in **the run's own spelling** — the flag a `1`
means — and a press is the only thing that writes. The note keeps `value: 1` until the
box is actually pressed, and then holds `no`, then `yes`. Constraint 3 is untouched:
`write` is still only ever handed the entries that changed.

## Config fields

No new field, on any component. That is the design.

`count`'s description gains the consequence, which is what a description is for: a run
of one segment is a checkbox and stores `yes` or `no` rather than a count. It is the
only place in the editor that says so, and it is where an author typing `1` is looking.

## Data and file model

**The layout file gains one thing, and it is not a key.** A layout stores the component
an entry produced and never the entry itself, so nothing about `PaletteEntry` reaches a
file. §4.3's promise holds: the schema grows by exactly a component's config block, and
this feature adds no config block at all.

**The character note gains one spelling.** A flag card's fenced entry holds `yes` or
`no` where a run holds a count. Same fence, same key, same section, same
hand-editability — `## Inspiration` / `value: yes` is what §3.1 asks a scalar component
to look like, and it is the spelling §4.2 already chose for a `toggle` column because it
"reads well in a file for a flag".

**Constraint 3** holds by the write path being unchanged: `writeFenced` rewrites a line
only where the value differs, and the flag's own normalisation happens on read rather
than on write.

**Constraint 4** is engaged and answered by the coercion in question 2: no layout
change deletes anything. A count raised past 1 leaves `yes` in the note and reads it as
one mark; a count reduced to 1 leaves `3` in the note and reads it as a ticked box.
Both keep the entry until the user changes it.

## Acceptance criteria

- [x] A Track with `count: 1` renders one level ring, not one segment, and stores
      `value: yes` / `value: no`.
- [x] A Track with `count: 1` and `marks: 4` renders a run of segments and stores a
      mark count: five states is not a flag.
- [x] A Track with `levels: ["Fine", "Bloodied:!"]` renders one ring carrying `!`,
      stores `yes` / `no`, and gives the level's name to `title`, to the long press and
      to assistive tech.
- [x] A Track with `count: "level - 4"` renders a run of segments whatever the number
      resolves to, and stores a count. Being a flag is declared, not resolved.
- [x] A Track whose rows are all one segment renders a checklist of rings, one per row,
      each named, and stores `yes` / `no` per row key.
- [x] The three-row spell-slot card — 5, 3, and one row falling back to `count: 1` —
      renders three runs of segments and stores three counts. One spelling per card.
- [x] `read` accepts `yes`, `no`, `true`, `false`, `x`, `✓`, `✔` on a run of any
      length, and still reports `maybe` as a malformed section.
- [x] A ten-segment run reading `value: yes` fills its first segment; a one-segment run
      reading `value: 3` shows a ticked box. Neither is rewritten until pressed.
- [x] A flag publishes `true` or `false` under its bare id and under `<id>.value`, and
      `false` where the note has no entry at all.
- [x] A flag still publishes `<id>.count` as 1, and a checklist publishes no `count`.
- [x] A checklist publishes a boolean per row key, and nothing under its bare id.
- [x] `full` writes `yes` and `empty` writes `no` on a flag card, and `empty` still
      resolves nothing.
- [x] A `formula` reset resolving to 1 or more writes `yes`; 0 or less writes `no`.
- [x] Two presses on a checklist are two writes, one per ring, rather than one batched
      write. *Added after a review found the spec claiming the opposite; the assertion
      is what stops the "fix" of routing the press through the debounce.*
- [x] A press toggles and writes once; a blur that changed nothing writes nothing, on a
      note holding either spelling.
- [x] `←` clears, `→` sets, `↑`/`↓` move between a checklist's rows, and a flag card
      has one tab stop.
- [x] Track declares a `palette` of one entry; the contract test holds every entry to a
      name, a description and a config, and refuses a config key the editor owns.
- [x] The add menu lists every type, with Checkbox indented under Track, and pressing
      **Add** on it writes `type: 'track'`, `count: 1`, labelled "Checkbox".
- [x] Selecting Checkbox puts its description on the Add row; selecting a bare type
      clears it.
- [x] Adding a Checkbox into a container still works, and its label is still unique
      against the whole sheet rather than one level. *Ticked on reasoning at first, with
      the two halves tested apart; a review said so, and the composition — an entry, a
      container destination, and a name already taken elsewhere on the sheet — now has a
      test of its own.*
- [x] `styles.css` and `src/styles/` agree after the class rename, and no selector
      names `sheetsmith-table-cycle`.

### Look criteria

Read from the harness at both themes, per UI.md §11.

- [x] **A single flag card beside a Pool and a Track of six.** The ring is the same
      object as a table's level ring at the same size, and the card is the same card.
      *Measured: 21px in both, cropped side by side out of `sheet-light`.*
- [x] **A checklist of three named flags.** The rings line up into a column, names
      right-aligned immediately beside them, and the block is centred under the card's
      heading at 1400, 620 and 380 alike. *Was left-hugging; a review measured it and the
      narrow width turned out to be the worst rather than the best case.*
- [x] **A checklist beside a single flag, in one column at 380.** All three flag cards
      centre their content, so the row reads as one family rather than as two treatments.
- [x] **A checklist's row names against the card's heading, and against the Skills
      table's row names.** Labels rather than captions, and no longer quieter than the
      column headers above them.
- [x] **Death saves and the slot card, unchanged.** Both fixes are scoped to a flag card,
      so a run set keeps its ragged right and its faint names — which is the shape a card
      of five, three and one exists to draw.
- [x] **A named flag's mark.** "Bloodied" carries `!` in white on the full accent, in
      both themes, as the table's top level does.
- [x] **A harm flag beside a progress flag.** Identical, as the design says. Confirmed
      rather than discovered.
- [x] **The empty state.** Every ring empty, and "Inspired bonus" reads `+0` rather
      than `?` — which is the "an absent flag publishes false" decision on screen. This
      criterion was not in the list and is the one most worth having been looked at.
- [x] **The error state**, which a review had to find in a vault fixture because no
      harness view reached it: `brokenSamples()` breaks config and never a body, so no
      fenced component's failed `read` had ever been drawn. Now `sheet-error.png` shows
      `Inspiration: "maybe" is not yes or no.` — named for what a checkbox writes, where
      it used to say "not a number of marks" on a card that never produces one. It also
      puts the other half of the publication decision on screen beside it: "Inspired
      bonus" reads `?` here where the empty state reads `+0`, because an *unreadable*
      flag publishes nothing while an *absent* one publishes `false`. That is the
      distinction `marksFrom`'s null return exists for, and neither state was visible
      before.
- [x] **A palette entry's description, beside its menu line.** Was unreviewable: the
      menu opens on a bare type, which has no description, so the only thing any still
      could show was an empty line — and the criterion was ticked citing exactly that,
      which a review rightly called not the thing under review. The harness now takes
      `&choice=<type>:<index>`, and `?surface=settings&choice=track:0` shows the menu
      reading "Checkbox" with its description beside it.
- [x] **The row holds still when an entry is selected.** What the new view showed
      first was the opposite: with Checkbox chosen the description took two lines inside
      the info column and pushed the destination and **Add** onto a second row, about
      35px down. Not the rule the pool's typed amount established — the pointer is on
      the select, not on the button that moved — but the button an author presses next
      moved while they were choosing what to press it for. Fixed with the three prefills,
      which turned it from an edge case into the normal case: measured at 1400px, 620px
      and 380px, the name, the menu, the destination and **Add** land on identical
      pixels whether a bare type or an entry is selected, and the description grows
      downward below them. At 380px the destination and **Add** wrap to a second line in
      *both* states, so that wrap is the width and not the copy. `docs/UI.md` §9 carries
      the rule and §12's row is retired.
- [ ] **The add menu's indent, open.** A native `<select>` renders only its selection in
      a still, so this one genuinely needs a hand on the mouse — in Obsidian or in
      `harness/index.html`. Left as a look criterion for that reason, the way the tab
      set left find-in-page.
- [x] **A press on a checklist's second ring, aimed at its top edge**, changes the
      second and not the first. **Settled by arithmetic rather than by a finger**, and
      the two derivations agree: the ring is 21px and its target insets `--size-2-2`
      (4px, checked against Obsidian's own `app.css`) above and below, so a target is
      29px; the rule sets `row-gap: calc(2 * var(--size-2-2))`, so the pitch is
      21 + 8 = 29px. Targets meet edge to edge with nothing to spare and nothing
      overlapping, and a ring's own top edge sits 4px inside its target. The two numbers
      live in rules 30 lines apart with only a comment tying them, so `styles.test.ts`
      now holds the relationship.

## Commit boundaries

1. `refactor: Name the level ring for what it paints`. The class rename across the
   painter, the table, the editor sample, the stylesheet, UI.md §9 and the test
   selectors. Its own commit and first, because it touches five files and changes no
   behaviour, so it is the one thing here a reviewer should be able to read as a
   rename.
2. `refactor: Hold one spelling for a flag in a note`. `stored-flag.ts`, and Table
   reading it instead of its own three copies. Also behaviour-preserving, and the
   eslint allowlist entry that makes it importable from a component.
3. `feat: Offer a component with its configuration ready`. `PaletteEntry`,
   `paletteEntries()`, the add menu's options and its description line, the contract
   test's checks and its member order.
4. `feat: Store a one-segment track as a flag`. `marksFrom`, the flag predicate, the
   ring control, `scopeValues`, `applyReset`, the stylesheet's flag rules, and Track's
   `palette` with its Checkbox entry.
5. `docs: Record that a toggle is a track of one`. §2's new term, §4.1's new optional
   member, §4.2's Toggle entry withdrawn and Track's amended, §6's and §12's mentions,
   §13's Resolved entry, PATTERNS §3's member order and its backlog, and §12's
   `link`-columns sentence.
6. `test: Show a flag and a checklist in the harness`. The samples.

## Deliberately not doing

Each of these is separate work.

- **The Currency, Inventory and Features prefills.** §13 states all three and this
  feature builds the mechanism they need. Adding them here would put three system
  flavours in the menu before anyone has used one, and question 5's rule is what they
  should be tested against when they arrive. *(Built afterwards, on that rule. See
  "The three prefills, as shipped" below.)*
- **A Field component.** Still a variation on the list in §12.
- **A select column type, or a select config field anywhere.** Unrelated, and a `count`
  of one is not a choice from a list.
- **Extracting the pointer-press helper from the component tests.** A standing row in
  PATTERNS §11, deferred there for a reason this diff does not change.
- **Adding a component type.** The whole point of the fold is that the catalog does not
  grow.
- **A colour for a harm flag.** Argued above. The class is applied and the stylesheet
  says nothing.
- **Whether a blank numeric run should publish 0.** Raised by the flag's own answer and
  left where it was.

## Found while building

**Being a flag had to become a property of the card rather than of the run, and the
existing spell-slot fixture is what said so.** The rule started per run, which reads
better in isolation: a run of one segment has two states, whatever its neighbours are.
`track.test.ts`'s `slots` fixture then failed, and it failed for the right reason — it
is five first-level slots, three second and one third, and the third takes its length
from the component's `count: 1` fallback. Per run, that card writes `L1: 2`, `L2: 1`,
`L3: yes` down one fenced block. One spelling per card is what a hand-editable note
needs, and the per-card rule is also what makes a *checklist* a thing you ask for
rather than a thing you get by accident. **The fixture was written for a different
feature and is the only reason the case was seen at all**, which is the argument for
fixtures that describe real systems.

**A flag resolves nothing, and `applyReset`'s `full` branch had to be told.** `empty`
already resolved nothing on purpose, so that a card whose count is broken can still be
cleared. `full` went through `countFor`, which asks the resolver — so a flag reset
depended on the formula layer to be told that 1 is 1. A test with a resolver that
throws is what found it, and the branch is now beside `empty` with the same reasoning.
The render has the same property for the same reason: the flag branch sits *before*
`countFor`.

**`npm test` does not type-check the test files, and `npm run build` does.** A
`track.write(data, body)` call missing its third argument passed vitest and failed
`tsc`. Worth knowing which gate is which: running the tests green is not evidence the
tests compile.

**The default harness shots were cropping most of the sheet, and had been since the tab
set.** `sheet-light` and friends were framed at 1400×900 while the sample sheet is
about 2000 tall, so everything from the tab set down had only ever been looked at
through a one-off `size=` on the command line — including, at first, this feature's own
row, which is why the first shot appeared to show nothing at all. The sheet frames are
now one named constant at 2100, with the reason on it. Not this feature's work, and
fixed here because the alternative was shipping a visible surface no default view
reaches.

**The rename to `.sheetsmith-level-ring` was 53 sites and no behaviour**, and it is
worth saying that it went in as its own commit for exactly that reason. `docs/UI.md`
§12 carried a row saying §9 "promises a shared painter that does not exist" for Track;
that row is now gone, since Track genuinely calls `paintLevelRing` — for its flag. Its
segments still do not, and should not: a run counts marks across segments where a ring
cycles one value, which is the half of that row that was right.

**A checklist was left hugging the left of its card, and that was wrong twice over.**
The row set is `justify-items: start` deliberately, so a card of five, three and one
spell slots keeps the shape of five, three and one; I read that as covering a checklist
too and recorded the misalignment as consistent-with-Death-saves. Two things were wrong
with it. A checklist has **no shape to keep** — every row is one ring — so the rule it
was inheriting buys nothing there. And I wrote that it was "visible at 1400 and gone by
380", which the harness contradicts: **380 is the worst of the three widths**, because
the card goes full-width and the content does not, so the block sits in the left 27% of
a 345px card with its own centred heading 130px away from anything it labels — beside
two single flags centring their rings in the same column.

Fixed by centring the block, and the *how* is worth recording because the obvious
one-liner is wrong. `justify-items: center` centres each item inside its own grid
column, and the ring's column is `1fr`, so it drifts into the middle of the remaining
width and away from the name it belongs to — the proximity that says a name names the
ring beside it, which is the row set's own stated reason for the layout. What centres a
checklist is content-sized columns and `justify-content: center` on the pair. Verified
at 380 and 1400, in both themes, with Death saves and the slot card unchanged.

**And a checklist's row name was drawn as a caption when it is the content.** Every other
row set draws its name at `--text-faint`, which is right where the segments are the
reading and the name says which run they belong to. A flag has no reading: there is a dot
and a word, and the word is the only thing that says which flag it is — so it sat quieter
than the table's own column headers while carrying more. §9's rule got the painter shared
so a flag could not measure differently on a card than in a cell; the label beside it was
not shared, and the label is the half that identifies it. Now `--text-normal` under
`.sheetsmith-track-flags` alone. Colour only: the size and tracking stay, so a checklist
still reads as a list of labels rather than a stack of headings.

Both were found by a review reading the harness at three widths and reporting the
content-versus-card measurements, which is the argument for §11 in one paragraph — I had
looked at the same two views and called the second one fine.

**`sense` on a flag is inert, and the harness is where that stopped being a guess.**
Harm grades a run from 45% of the accent at its first segment to the full accent at its
last, so a run of one lands on the same colour as a progress run. "Bloodied" and
"Inspiration" are pixel-identical apart from the glyph. The class is applied so a later
answer has somewhere to hang; the stylesheet says nothing, and the design section
carries the argument against inventing a colour that means "bad".


## The three prefills, as shipped

Built in a later session, against question 5's rule rather than inherited from the
§13 entry that listed them. Each passes both halves: the generic block covers the
job, and the component's own name would not lead an author to it — nobody building
an inventory looks for a component called Table, and nobody counting coins looks for
a Stat group.

| Entry | Type | Config |
| --- | --- | --- |
| Currency | Stat group | `attributes` CP/Copper, SP/Silver, EP/Electrum, GP/Gold, PP/Platinum |
| Inventory | Table | `columns` Qty (number), Weight (number, `total`); `openRows`; `rowHeader` "Item" |
| Features | Table | `columns` Source (`secondary`), Notes; `openRows`; `rowHeader` "Feature" |

What the build decided, that §13 did not state.

**A prefill writes no key whose value is already its default.** §13 says Currency is
"horizontal" and Features has "a Source text column"; neither reaches the config,
because `direction` defaults to horizontal and a column with no `type` is a text
column. PATTERNS §8 already leaves a defaulted value out of a config, and the reason
bites harder for an entry than for a form: a layout is hand-edited and shared, so an
entry that spells out its defaults writes that noise into every layout anyone builds
from it. "No `derived`" and "no declared rows" are absences for the same reason and a
plainer one — there is nothing to write. A declared row is one *every* character
using the layout has, and gear and features are the lists where the character owns
every line. **[checked]** — `contract.test.ts` compares a prefilled boolean against
its `default` and a prefilled select against its first option, which are the two kinds
with a default to compare against and the two the editor itself omits on
(`ConfigFieldSpec` says so on the members). It went in as a check rather than staying a
convention because the rule was stated in this document and in a code comment and held
by nothing, and a defaulted key looks perfectly deliberate in review.

**Config keys are in `configFields` order**, which is the order the form the author
lands in will show them. It is the same reasoning PATTERNS §3 gives for `palette`
sitting after `configFields`: here are the settings, and here is one of them filled in.
**[checked]**, and for the reason `MEMBER_ORDER` is: an entry whose keys run in some
other order reads perfectly well on its own, so a review never catches it.

**An entry's example ids name what the entry itself produces.** Currency writes
`currency.GP` and Inventory `inventory.Weight`, because the entry's name is the new
component's label and `uniqueId` derives the id from that label. Both first drafts
invented an id — `coins.` and `gear.` — which is the convention for a *config field*
description like Pool's `8 + mod(abilities.CON) * level`, where the copy belongs to no
particular component and an invented name is honest. An entry ships its own label, so
the reader is one click from a component the example contradicts. Not checked: it would
mean parsing prose for names, and the rule is one sentence.

**Table is the first type with two entries, and nothing had assumed one.**
`paletteEntries` returns a list, `addChoices` flat-maps it, and the option value is
already `type:index` — so `table:0` and `table:1` are two options rather than a second
displacing the first. The contract test's name-uniqueness guard is per type and was
written for exactly this. What was *not* covered is the run: the existing menu test
checks only the option immediately after a type, which an interleaved menu would still
pass, so a test now pins type → every prefill of it → next type.

**Two of the same entry collide on the label, and the existing answer holds.** An
entry's name is also the label the component starts with, and `parseLayout` refuses a
duplicate label globally because labels key note sections. Adding Inventory twice goes
through `uniqueLabel` and then `uniqueId`, which derives from the label it settled on:
"Inventory" and "Inventory 2", `inventory` and `inventory_2`. Nothing was changed for
it, and the suffix is the right behaviour rather than a tolerated one — a second
inventory is a real layout, and "Inventory 2" is the author's cue to say what it is.

**A description says what decides the choice, and stops.** Each of the three runs to
two or three sentences, which is the shape the shipped Checkbox entry already had: what
it is with an example, the block it is and what that does to the note, and where useful
one thing to do next. The drafts before review were four long sentences and, at 620px —
nearer a real settings pane than the harness's full width — the Inventory row grew to
about 163px against every other row's 60px, so the one row explaining a choice was three
times the height of the rows listing what already exists.

What came out is the post-add half. Inventory's draft explained that Weight publishes as
`inventory.Weight` and that the total is one-of-each-item rather than quantity times
weight, naming `sum(inventory, Qty * Weight)` for the loaded pack. **That reversed an
earlier finding and the reversal is the point**: the earlier one was that stating the
limitation with no way past it was worse than useless, which is true, and removing both
halves answers it as completely as adding the fix did. The author lands in the new
component's form the moment they press **Add**, and `columns`'s own description there
already carries the aggregate — so the menu was duplicating, at the moment of choosing,
copy that arrives one click later anyway.

**Each description names its block**, as Checkbox's "a track of one segment" already
did. The collapsed menu shows only the entry's name where every component row below it
shows a name over its type, so "Inventory" alone is the one place on the tab that says
what is about to be created without saying what it is made of. Naming the type in the
description costs a clause and keeps the indent's grouping, where relabelling the option
would not.

**The prefilled config is unchanged** by any of this: still `total` on Weight and no
computed column. What remains is only that the prefill does not write an encumbrance
rule for the author, which is a much smaller thing than §740 says it is — see the §740
correction below.

**The add row's description moved below the row.** Selecting an entry used to widen the
info column, wrap the control column, and drop the destination dropdown and **Add**
about 35px while the menu kept the first line — the row in `docs/UI.md` §12, which
three more entries turn from an edge case into the normal case. `descEl` is appended
after the controls and given `flex-basis: 100%`, the same mechanism `.sheetsmith-field-error`
already uses, so the first line's height is fixed whatever is selected and the
description grows downward into space nothing is placed in. Moved rather than reserved:
a reserved line shows as a gap under every bare type, and it would have to be three
lines deep to fit these descriptions anyway. An empty description collapses, so a bare
type is the single-line row it was before the palette existed. §12's row is retired,
and the general question it was deferred on — how *every* settings row carries a
growing description — is answered in `docs/UI.md` §9 rather than left in this
document, so the next row with the same problem inherits the answer instead of
re-deriving it.

**Two of the three are in the harness sample, and the third deliberately is not.**
A prefill is config, so what needs looking at is the *rendering* it produces, and only
two produce one nothing else reached. Currency covers a stat card with **no** `derived`
— Abilities carries one, so until now no card in the harness was a name and a number
with no modifier line under it. Features covers `secondary`, which was implemented and
styled and drawn nowhere at all; shipping an entry that turns it on without a sample
would have been shipping an appearance no one had looked at. Inventory adds no sample,
because the existing `inventory` card is already that entry's config with three extras
on top. `shot.mjs`'s sheet frame goes 2100 → 2500 with it, which its own comment asks
for.

**And all three are in the throwaway vault**, which is the half the harness cannot
stand in for: `Sheetsmith layouts/Prefill variations.json` with `Characters/Prefills.md`
beside it, each block holding exactly what its entry writes and nothing enriched on top.
It carries the two things no sample shows. The Inventory the entry actually produces —
two columns, no declared rows — where the harness card is that config with three extras
on it. And the pair of numbers the copy is about: `inventory.Weight` reads 18, one of
each item, beside `sum(inventory, Qty * Weight)` at 25, which is the sentence §740 had
wrong standing next to the arithmetic that settles it.

Looking at it earned its keep immediately: the Features sample clips its first and last
columns while the middle one takes about 500px of slack. Rendering the same sample with
`secondary` off is pixel-identical, so it is Table's width distribution rather than this
work, and it is now a `docs/UI.md` §12 row rather than a thing the sample quietly hides.

### What `/ship` changed in docs/SPEC.md

Two sentences said the description sits **beside** the menu, and it now sits below the
row. Named here rather than left to "update that section", because they are two clauses
in an 800-line document and finding them again is the expensive part. All four edits
below were made when this shipped.

- **§539**, the paragraph describing what the interim editor does today: "each entry
  indented under the type it prefills and its description shown beside the menu"
  becomes *shown below the row*. This one is not a stale resolution but a plain false
  statement about shipped behaviour.
- **§690**, the palette entry's `Resolved:` entry: "the selected entry's description
  sits beside the menu" needs the amendment rather than the replacement — the reasoning
  it gives is still the reasoning, and what changed is where the copy had to go once
  there were three entries with three-line descriptions. Beside the name it grew the
  info column until the control column wrapped, which is the `docs/UI.md` §12 row this
  work retires.

The other "beside" in §690 — "the interim add menu offers entries **beside** types" —
is about entries next to types in the menu and stays true.

- **§740** contradicts §718, and §718 is the later resolution. §740 says an
  inventory's encumbrance "is a total over a computed column: refused on purpose,
  and already open above", and concludes the prefilled `total` on Weight is "short
  of what a loaded pack asks". §718 then settles the aggregate and says "an
  inventory's encumbrance is `sum(inventory, Qty * Weight)` … the three things this
  entry said were out of reach", and §363 has the total refusal "names
  `sum(<id>, <expression>)` as the fix". So §740's sentence should point at the
  aggregate rather than at a refusal. It is worth fixing rather than leaving as a
  known wrinkle: it is the sentence a reader is sent to by the five-blocks entry,
  it is the sentence this work copied into shipping copy before the review caught
  it, and an out-of-date limitation in §13 is the kind that gets rebuilt.

Noted and **not this work's** — for `/ship` to take or leave. §738 still says "today
the interim editor builds its add-row dropdown straight from `listComponentTypes()`
and pushes a component with no config at all", which the palette mechanism made stale
in the preceding commits rather than here. Recorded because it is one sentence away
from the two above and cheaper to fix in the same pass than to find again.

And one **new open question** for §13, raised by the Currency entry and written out
here so it is pasted rather than composed. It is an open question and not a rename:
the argument cuts both ways and no candidate name survived it.

> - **Whether "Stat group" still names what the component is.** Every other block in
>   the catalog is named for its shape — Table, Pool, Track, Group, Tab set — and Stat
>   and Stat group are named for a kind of content. The Currency entry is what made
>   that visible: a coin purse is five cards in a row, and nobody building one goes
>   looking for a Stat group. That is the exact failure §2 records twice, and the
>   catalog has already made this correction three times (Abilities became Stat group,
>   Skill card became Table, Toggle folded into Track), so a fourth would be in
>   character. **Three things cut the other way.** The palette entry is the *designed*
>   answer to a generic type not leading an author to a job, and §13's own palette
>   entry says so — "the type stays generic, the entry is a starting point the author
>   edits", and an entry may be named for a job where a component may not. "Stat" is
>   also a category where the previous three were jobs: a coin amount genuinely is a
>   tracked number on a character sheet, where a dagger row is genuinely not a skill,
>   so the name is imprecise rather than wrong over four of five jobs. And there is no
>   better name on offer — it is a pair, so renaming Stat group means renaming Stat or
>   living with "Stat" beside "Number group", and the obvious shape name is taken,
>   since `docs/UI.md` §9 has "the card" as vocabulary shared by Stat, Stat group and
>   Pool. Recorded now rather than decided because it is cheap now and dear later:
>   nothing is released, so a note holds no component type and no formula references
>   one, exactly as §758 found for Skill card. The moment a layout exists outside this
>   repository, the answer is fixed by migration cost rather than by §2.

Commit boundaries for this follow-up, continuing the list above:

7. `feat: Offer currency, inventory and features ready-made`. The three entries, and
   `contract.test.ts`'s two new rules for form order and defaulted prefills.
8. `fix: Hold the add row still while a prefill is chosen`. `descEl` moved after the
   controls, `.sheetsmith-add-row`, and the guard test on where it sits.
9. `docs: Record the three prefills`. §539 and §690 above, `docs/UI.md` §12's retired
   row, and this section.
