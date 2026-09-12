# Roster

Status: shipped
Board card: ✨ A component that fuses a stat's card with the rows that hang off
it — D&D's 2024 sheet, where an ability carries its score, its saving throw and
its skills in one block, repeated per ability down the page.

> **Four things are settled and this spec does not reopen them.** The owner
> ruled at a hard stop, against the PM's recommendation, having read the full
> case against. (1) The fused type enters the catalog as a **new component
> type**, not a palette entry — §4.2's entrance test rules an entry out, since a
> job needing two components has nothing for one entry to be. (2) It sits
> **beside** the existing Card-beside-Table arrangement as a third way to draw
> the same block; nothing is replaced and no layout migrates. (3) The
> stat-to-rows relation runs **both directions, carried by formulas rather than
> by a mode switch**. (4) Whether the grouping is **stored or presented** was
> left open for this spec to argue, and it is argued below.
>
> The `Resolved:` entry in `docs/SPEC.md` §13 is `/land-it`'s to write when this
> is built. Nothing here is resolved yet.

---

## Model question

### Which §13 question this touches

**None of the open bullets, and one resolved one.** The nesting bullet is
resolved and stays resolved: a container may hold containers one level deep, and
the six-up "card beside its skills" block is an outer Group of six Groups each
holding a Card and a Table. That arrangement is not withdrawn, not deprecated
and not migrated. The five-blocks entry, likewise resolved, said "a card with its
skills is a Card beside a Table of declared rows" and is left standing as a
description of *that* arrangement.

What this feature does is add a third arrangement beside those two, and it gains
a `Resolved:` entry of its own when it lands. The three questions it genuinely
has to answer are the four settled premises made concrete, plus the one left
open.

### Settled answer 4: the grouping is **presented**, and that decides the component's shape

This is the question the brief left open, and it is the one that decides
everything else, so it goes first.

**Stored** would mean one component per stat: six components in the layout, six
`##` sections in the note, and the grouping carried by the layout's structure and
by the file. **Presented** means one component holding every stat and every row,
one section in the note holding a flat, ungrouped list, and the grouping drawn
from a key that says which stat a row hangs off.

**Presented, and the evidence is not close.** Obsidian Bases groups one flat
table by one property chosen at view time from the Sort menu, and warns that a
property with many distinct values makes too many sections — the grouping is a
view's business there and the rows are one table. Every version of the D&D
Beyond request that names a mechanism names a toggle — "an option to toggle
sorting for Skills", and in the replies "as long as it were a character by
character toggle, I'd be all for this" — and a toggle is a statement about
presentation. **Nobody anywhere asks for the rows to be stored differently.**
Across nine surveyed tools there is no instance of skills stored per ability.

Two local arguments finish it, and they are stronger than the borrowed ones.

**Constraint 4 is satisfied by construction rather than by care.** With the
grouping presented, regrouping is a layout edit that touches no byte of any
character note: moving Athletics from Strength to Dexterity changes one key in
the layout file and nothing in the file the player owns. Stored, the same edit
moves a row between two `##` sections, which is a migration §10 declines to
perform — so the stored shape would have to either lose the row's cells or grow
the one migration this plugin has always refused.

**And presented is the only reading under which the fusion pays for itself.**
The brief's own trap says it: fusing the pair does not remove the repeat, because
one component drawing one stat and its rows still has to be placed once per stat,
and most of the authoring cost survives. A component holding *all* the stats is
the version where the repeat actually goes — one placement, one column list, one
relation declared once. That is also the answer to the per-stat-column trap: with
one component there is one `columns[]`, so adding a column to a skills roster is
one edit rather than six identical ones with six chances to diverge.

So the component this spec designs holds **many stats**, not one. That is the one
place the design departs from the literal words of the ask — "a component that
fuses a stat's card with the rows that hang off it" — and it does not reopen a
settled answer, it follows from one: settled answer 4 only has a reading at all
if the component can hold more than one stat, because a one-stat component
carries the grouping in its own multiplicity and there is nothing left to decide.

**What names the grouping key.** A declared row carries `stat`, a key into the
component's own `stats[]` list. It is the layout's, never the note's: with rows
declared (below), the key appears in no character file at all, which is what
makes the paragraph above true. The component owns both ends of the reference, so
the editor can offer the stats as a choice rather than asking for a typed name,
and a `stat` naming nothing declared is a configuration error on that component
alone, naming the fix.

**Is the order a layout choice or a reader-side toggle? Neither, and that is a
decision rather than a dodge.** The order is the layout's declared order — bands
in `stats[]` order, rows in `rows[]` order within their band — and there is no
grouping toggle, no `order` key and no second arrangement inside this component.
Three reasons, in the order they carry weight:

- **The borrowed evidence does not transfer, and the reason is local.** In D&D
  Beyond the layout is WotC's and the reader cannot change it, so a toggle is the
  only lever anyone can be given, and 76.6% of a poll asking for one is a
  measurement of that fact as much as of the preference. Here the layout is the
  reader's own file, edited in a pane the plugin ships. The lever they are asking
  for already exists and is larger than a toggle: choose the arrangement.
- **The findability trap has a better answer than a toggle.** "A lot of
  potentially frustrating hunting and pecking" for a named skill is the
  documented complaint against grouping-as-the-only-order, and it is a complaint
  about paper and about a web app with no text search over the sheet. A sheet
  here is a rendered note in Obsidian: **a roster draws every row all the time
  and hides nothing**, so find-in-page reaches any skill by name and lands it
  with its band around it. That is an answer the printed 2024 sheet structurally
  cannot have, and it is why this component needs none of Record set's
  `hidden="until-found"` machinery — there is nothing hidden to find.
- **A toggle would move the sheet.** A Table grows rather than scrolling, so its
  height is a floor; switching a roster between grouped and flat changes its
  height by one band head per stat, and everything below it moves. That is not
  the collapse defect — the component never ceases to fill its placement — but it
  is a reader-posture control that reflows a sheet, which is close enough to the
  control §13 withdrew that it needs an argument it does not have.

The cost of that decision is stated rather than hidden: a reader who wants the
alphabetical list has to open the layout editor, and a layout can only offer one
order at a time. The mitigation is the third answer below.

### Settled answer 1: a new type, and what it is called

**Roster** (`roster`). §2's rule is that a component is named for what it is on
the page, never for a job in a game: a roster is a list of named entries with
their ratings, gathered under the headings they belong to, and that is exactly
what this draws. It covers skills under abilities, actions under attributes,
saves under abilities, approaches under aspects — and none of those words is in
the name.

The alternatives were checked rather than assumed. **Stat group** and **Stat
set** are dead on arrival: §13 spent a whole entry taking "stat" and "group" out
of the catalog, the first for being a category rather than a shape and the second
for being the catalog's word for a container. **Panel**, **Entry**, **Number**,
**Row**, **Grid** and **Record** are each already load-bearing (§13, §2).
**Outline** collides with Obsidian's own core plugin. **Ledger** is the runner-up
and would be defensible — a ledger page is headed sections each with its entries
and its figure — and it loses because it says money to most readers.

**The residual risk, named so a review does not have to find it:** "Roster" says
the list and does not say that each heading is itself an editable value. The
component's description and its `configFields` are where that is carried, which
is the same division §2 already draws — "what a shape name does not carry is what
a component's config descriptions are for, exactly as 'Pool' says nothing about
its buffer."

Two words enter §2 with it. A **band** is one stat and the rows that name it, as
drawn: a head line and the rows under it. The head line's own word is **stat**,
and it is a config key rather than a catalog name, which is the distinction §13's
rename entry drew and not one it closed — a roster's heads are stats,
attributes, characteristics or abilities depending on the system, and "stat" is
the system-neutral umbrella for exactly that set. (`subjects` was the runner-up
and is clearer about the role and worse at the doorstep.)

### Settled answer 2: why all three ways stand

Three arrangements now draw a stat with the rows that hang off it, and **each one
does something the other two cannot**. That is the whole statement, and it is why
nothing is withdrawn.

1. **Card set plus Table, placed apart** — what `src/starters/5e.json` ships
   today: one `card-set` for the abilities, one `table` for the saving throws,
   one `table` for the skills. It is the only one of the three where the stats
   and the rows can sit in **different places on the grid**, which is what every
   traditional sheet does — the ability strip across the top, the skills in a
   sidebar. It is also the arrangement whose rows are one flat list you scan
   alphabetically, which is the findability answer the 2024 sheet gave up. **The
   starter does not change.**
2. **The six-up: a Group of Groups, each a Card beside a Table** —
   `harness/samples.ts`'s `ability_checks`, and what §13's nesting bullet
   resolved. It is the only one where each pair carries **its own
   configuration**: its own columns, its own heading, its own placement, its own
   width. Six pairs that merely rhyme rather than sharing a column set are this,
   and so is any pair that needs a third component in it.
3. **The roster** — one block, one column set, one relation. It is the only one
   where the **relation is declared once** rather than written out per row, and
   the only one where adding a column is one edit.

The measurement that makes this more than a slogan: 5e's skills table declares
eighteen rows each carrying `values: { ability: "abilities.DEX" }`, and the saves
table six more. That is **twenty-four hand-written copies of a reference**, every
one of them a place two layouts can diverge, and it is what a roster removes.
Nothing else about the flat arrangement is worse, which is why it stays.

§13's nesting ruling stands, the six-up stays valid, the 5e starter's flat shape
stays valid, **no layout migrates, and §10 gains no new obligation.**

### Settled answer 3: both directions, carried by formulas

The relation is carried by two scopes the component supplies, pointed inward, and
by nothing else. There is no mode, no `direction` key and nothing on screen that
says which way a roster runs.

**Parent to child.** Inside a row's own scope the component publishes `stat`,
which is worth what that row's stat head shows — its `derived` where there is
one, its stored value where there is not — with `stat.value` the stored score.
So 5e writes **one** column formula for eighteen skills:

```
stat + Training * prof
```

**Child to parent.** Inside a stat's own formula fields the component publishes
`self`, which names that stat's own rows as an aggregate's first argument. So
Blades in the Dark writes **one** stat formula for three attributes:

```
count(self, Rating > 0)
```

— "the rating for each attribute is equal to the number of dots in the first
column under that attribute", which is the arithmetic §5's `count()` exists for,
with the roster supplying the subset.

**`self` is `mod.self`'s own argument, one member over.** §5 already records why
a relative spelling was unavoidable there: "a Card set cannot spell its own
target, because its `derived` is one formula computed per entry and no absolute
name inside it can say which entry it is running for." A roster's `derived` is
one formula computed per stat and has exactly that problem — an absolute
`count(attributes.insight, …)` would be the same three words on all three
attributes. Three near-identical formulas is the thing §4.2's row `values`
mechanism exists to prevent, so the same answer applies: one reserved relative
word, in the one argument position that never resolves through the name table.

**What the engine grows, stated as a decision.** Two things, both small, both
argued:

- **§5 gains one sentence.** An aggregate's first argument may be the reserved
  word `self` beside a component id. It is read as identifier text like every
  other first argument, so nothing about the "component reference, not a value"
  rule changes, and the language still gains no collection. `self` outside a
  scope that carries rows fails with a sentence naming itself, rather than as an
  unknown component — one message, not a mystery.
- **`ScopeEntry.display`'s scope grows an optional row set beside its values.**
  That is a contract change and it passes §4.1's rule, with an argument sharper
  than the usual one: the *alternative* is the component publishing its stats
  through `compute`, which §4.1 forbids wherever a `display` could do the job,
  and which the save-time cycle check "can never see through". So the contract
  grows **in order to keep the opaque member unreached**. The edge from the
  stat's `derived` to the component's own rows stays a named field a reader of
  the layout can follow.

**The cycle consequence, inside one component, which this spec owns.** The row
table's guard is keyed on a component id (`src/formula/rows.ts`), and a `self`
walk is a walk of the component it belongs to: it takes the guard under the
component's own id and its restricted set is **not memoised**, since a subset
must never be cached as the whole. Three consequences follow and all three are
stated rather than discovered:

- **A roster that writes both directions at once is a ring.** A row's computed
  column reading `stat`, while that stat's formula aggregates `self` over a
  column whose value depends on that computed cell, is a loop with no published
  name outside the component in it. It is refused by the existing guard, every
  walk in the ring is refused together, both ends show `?`, and the message is
  §5's own: a formula on its rows reaches back to it.
- **So direction is per roster, not per type.** 5e writes the first direction,
  Blades the second, and neither writes both. That is exactly what settled answer
  3 asks for — "direction becomes a property of which formula the author writes"
  — with the honest boundary added: one roster, one direction.
- **The coarseness is §5's own, not a new one.** Because the guard is per
  component rather than per band, a band walk and a whole-roster walk of the same
  component cannot be in flight at once. Reachable only from inside the ring
  above, so it costs nothing outside it, and the alternative — a guard keyed per
  band — buys a case nobody has and makes two overlapping row sets that the guard
  would have to know overlap. Not taken.

**One note to the check that does not exist yet.** §5's save-time cycle check is
coarse at the component. When it is built it must distinguish a `self` edge from
a cross-component one, or every Blades roster is reported as a cycle on save.
Recorded here because the check is not this feature's to build and the trap is
invisible from its own side.

### What it publishes

- **No bare `<id>`.** A roster is not one value, which is what `ScopeValues.self`
  being optional is for — Passport's precedent exactly.
- **One name per declared stat**, `<id>.<statKey>`, carrying what the head shows:
  a `display` naming `derived`, run in a scope holding `value` and `self`. Where
  there is no `derived` the name is the stored score. `.value` is the stored
  score always, and is absent — so a formula reading it fails and says so — where
  a stat stores nothing.
- **One name per declared row that carries a `key`**, where a column declares
  `publish`: `<id>.<rowKey>`, Table's own mechanism, produced through `compute`
  from the same row scope the cell on screen is computed from. This is what keeps
  `10 + skills.perception` working when a layout moves its skills onto a roster,
  and without it the 5e starter loses four names on the day it converts.
- **A row key may not collide with a stat key**, since both live in `<id>.<name>`.
  A configuration error on that component alone, naming the fix — §4.2's existing
  rule for a row key against a totalled column's key, read one component over.
- **`mod.` slots follow for free**, one per published name (§5). A stat is
  therefore a modifier target the moment its own formula reads `mod.self`, which
  is the canonical target in every system surveyed and is the reason `effective`
  is kept below.
- **`scopeRows`**: every row the card draws, in the order it draws them — band
  order, then declared order within a band — from the same helper `render` uses,
  so a number a reader sees and a number a formula reads count the same rows. So
  `count(skills, Training)` walks the whole roster.
- **`scopeModifiers`: not declared at all.** No `modifier` column (below), so
  nothing is pushed and nothing outside the component learns the member exists.

### What it stores, and Constraints 2 and 3

`storage: 'markdown'`. One `##` section holding **two things in a fixed
relationship** — Passport's rule, which is Record set's rule one case simpler:

````markdown
## Abilities

```sheet
STR: 15
DEX: 16
CON: 14
```

| Skill | Training | Total |
|---|---|---|
| Acrobatics | 1 | +5 |
| Athletics | 0 | +2 |
````

The **fence** holds one entry per declared stat, `parse/fenced.ts`'s format, the
same spelling every scalar component writes. The **table** holds one line per row
and one column per stored column, `parse/table.ts`'s format, exactly as a Table
does. The two are **found, not positioned** — the first `sheet` fence and the
first markdown table, in whichever order the hand that wrote the note put them —
and a write puts each back where it found it. Prose before, between or after is
preserved untouched and never drawn (§10).

**Constraint 2 holds by the split itself.** Every link-bearing value is in the
table, which is plain markdown, so a wikilink in a row name keeps its backlink,
its hover preview and its rename propagation. The fence holds numbers, and a
wikilink typed into a stat's field is declined at the commit through
`components/fenced-link.ts`, the module Record set and Passport already share —
no new machinery and no second sentence for the reader to meet.

**Constraint 3 holds per half, and each half already holds it.** `parse/fenced.ts`
keeps the fence's own spelling; `parse/table.ts` writes only the cells whose value
changed and leaves every byte around them alone, misaligned pipes included; and
`parse/markdown-body.ts`'s framing rule keeps the section's own leading and
trailing whitespace. A write re-joins the pieces with the separators it read.
Editing one stat's score reformats nothing about the table beneath it.

**The grouping appears nowhere in the file**, which is settled answer 4 in one
line: the table is flat and ungrouped, in whatever order the note holds, and the
band a row is drawn in is computed from the layout every time.

### What happens to existing character notes

**Nothing, in every direction.**

- No existing layout names this type, so no note changes when the plugin updates.
- A layout that adds a roster gains one section; every other section is
  untouched.
- A layout that **moves** its skills from a Card set and a Table onto a roster
  leaves the old `## Abilities` fence and the old `## Skills` table in every note
  on that layout, unrendered and untouched, while the roster writes under its own
  label. That is Record set's honest cost restated and it is §10 working: two
  sections in the file until somebody tidies up, and no automation offered,
  because the migration §10 declines is the one that would be needed.
- A row the layout no longer declares stays in the note, unrendered and untouched
  (Table's rule). A stat entry under a key the layout no longer declares stays in
  the fence (Card set's rule). Renaming either key does not move a stored value.
- A declared row claims the first note row spelling its name, scanning the table
  top to bottom, case-insensitively — Table's claim rule, unchanged, and the
  reason reordering the bands moves nothing: which line of the file a row reads is
  decided by its name, not by where it is drawn.

---

## What it does

A **Roster** draws a set of stats and the rows that hang off them as one block: a
column header row at the top, then one band per stat — the stat's name, its
score and its reading — with that stat's rows beneath it, all of them sharing one
set of columns. A row reads its own stat as `stat`, so one column formula serves
the whole list; a stat may read its own rows as `self`, so an attribute computed
from the dots under it is one formula too.

It covers D&D's 2024 ability blocks, a Blades playbook's attributes and actions,
and any sheet where a list of rated things is read under the values that govern
them.

---

## Smallest version

`stats`, `rows` (a label plus a typed stat key), `columns`, `rowHeader`,
`hideValue`, `hideLabel`; `stat` in the row scope and `self` in a stat's; the
fence-plus-table storage and every constraint above. It gives up four things:
`publish` and row keys, so a layout moving off the 5e starter's skills table
loses `skills.perception` and its three siblings; `effective`, so a stat's field
cannot read its modified number; `signed` and `namePosition`, so a roster cannot
match the sheet it is copying; and the editor's stat picker, so a row's stat is a
typed key with a configuration error behind it rather than a choice.

---

## Design

### What the reader sees

The component's label, and under it **one table** — a header row naming the
columns once, then, per declared stat in declared order, a **band head** spanning
every column, then that stat's rows.

The band head carries the stat's name at the region rank (`.sheetsmith-group-heading`'s
rank, not a second one), its stored value as a field on the card's own field
clothes, and its reading at the card's headline weight, signed where the layout
says so. It is one line of the table rather than a card floating above one,
because a card would be a second surface inside a component that already has a
box — `docs/UI.md` §9's "a fourth kind of panel beside a row of cards reads as
loose chrome".

**One header row for the whole roster, not one per band**, and this is the
decision the rest of the look follows from. Six repetitions of the same three
words is noise, and sharing one set of column tracks is what makes the single
`columns[]` visible on the page: a column of proficiency rings reads down the
*whole* roster as one shape, "how trained is this character", which six separate
tables cannot offer at any alignment.

**And that is what makes it a third way rather than the second way with less
typing.** Drawing six cards each with a mini-table would be the six-up
arrangement redrawn, which is settled answer 2's own test failed: the arrangement
already exists and is already valid. A grouped table is a different picture, and
it is Obsidian Bases' own — one flat table with group headers — reached from the
local argument rather than borrowed.

At a glance a reader takes: which stats there are, what each is worth, and what
hangs off each — in that order, because the head line is heavier than the rows
under it and the bands are separated by the one hairline `docs/UI.md` §9 already
reserves for a container's chrome.

### Interactions, all of them already built

- **Every stored value edits on `interaction/editable.ts`'s rules** — live
  display, committed on blur or Enter, Escape restoring and announcing, arrows
  stepping a number and moving a caret in text. A stat's field and a row's cells
  are the same gesture, which is the point of there being one.
- **A `level` or `toggle` cell draws through `paintLevelRing`**, with its
  cycling, its arrow stepping, its hover name and its long-press on touch. No
  checkbox anywhere, on §4.2's rule that a card and a cell doing the same job
  share the painter.
- **A computed cell is read-only and reveals its formula** on hover, on a tap on
  touch, and where it failed, the name it could not find.
- **A wikilink in a row name renders as a link** and behaves like one, through
  `linked-text.ts` and the stacked field-over-display layer Table already uses.
- **A modified number carries the mark and the breakdown** through
  `modifier-breakdown.ts`, which is what a stat accepting a modifier owes a
  reader.
- **No new gesture is introduced.** There is nothing to open, nothing to
  reorder, nothing to add and nothing to delete, because every row and every stat
  is the layout's. That is the smallest interaction surface of any component in
  the catalog after Computed, and it is a consequence of `openRows` being out
  rather than a separate decision.

### What it reuses

`parse/fenced.ts`, `parse/table.ts`, `parse/markdown-body.ts`,
`parse/wikilink.ts`, `components/fenced-link.ts`, `card-face.ts`'s field and
headline clothes and its secondary text, `level-ring.ts`, `linked-text.ts`,
`column-types.ts`, `typed-value.ts`, `effective-value.ts`,
`modifier-breakdown.ts`, `sample-values.ts`, `interaction/editable.ts`,
`ui/truncation.ts`, `ui/spellcheck.ts`, and `docs/UI.md` §9's focus and hover
selector lists, its ceiling reading, its hairline and its component-label rank.
**None of these is a component**, so the sibling-import rule is not reached and
eslint stays green.

`docs/UI.md` §9 gains one row — a band head over a shared column set — and every
one of the rosters above gains a consumer.

### What it duplicates, and why that is acceptable

It may not import `table.ts` or `card-set.ts`, so the question the brief asks has
to be answered concretely. Three tiers, per `docs/PATTERNS.md` §1:

- **Already shared, so nothing is duplicated**: the markdown-table read and write
  is `parse/table.ts`, extracted before this feature existed; the fence is
  `parse/fenced.ts`; the cell-type mapping is `column-types.ts` and
  `typed-value.ts`. This is most of the file-format surface, and it is why
  Constraint 3 is inherited rather than re-argued.
- **Extracted here, on `markdown-body.ts`'s own argument**: the **claim rule** —
  which line of the note a declared row reads — moves to `src/parse/` and Table
  imports it from there. Two copies of *which line a row is* is precisely the
  drift Constraints 3 and 4 exist to prevent, and `markdown-body.ts` was
  extracted on exactly that sentence when Image became Rich text's second
  consumer. A guard test asserts the two paths agree.
- **Duplicated with a guard**: the row-view assembly and the row scope
  (`rowViews`, `storedCells`, `rowScope` in `table.ts`) are component-shaped
  rather than file-shaped, and the roster's differ in the one way that matters —
  its row scope carries `stat` and its stat scope carries `self`. A second
  consumer earns a guard and not a module (§1). The guard is a registry-wide case
  asserting that every component publishing rows builds a row's names from its
  stored cells under its computed columns, which is the check
  `docs/BACKLOG.md`'s existing row about `rowNamesOf`/`rowScope`/`recordValues`
  already asks for. **If a third consumer arrives, it becomes a module**, and
  that is a backlog row rather than work here.

### Config, decided key by key

The brief's trap is that a fused type inherits both halves' config forms and that
a key with no reading in the fused context is CSB #536's defect. So every key on
both parents was ruled on, and **the drops are argued as hard as the keeps**.

**Kept from the Card half**, five of eleven:

- `stats` (Card set's `entries`, renamed for its role) — the spine.
- `derived` — one formula per stat. It is what carries both directions: `mod(value)`
  is 5e's, `count(self, Rating > 0)` is Blades'.
- `hideValue` — for a stat that is **only** its reading. A Blades attribute stores
  nothing at all, and without this key its head would draw an empty field with an
  em dash in it that nobody can meaningfully fill. Card set's semantics exactly:
  hidden, never written, and whatever the note already held is preserved.
- `effective` — kept, and it is the borderline one. A stat is the canonical
  modifier target in every system surveyed, `mod.self` exists because six ability
  scores could not otherwise be modified at all, and a roster is where those
  scores now live. Dropping it would make a belt of giant strength readable on a
  Card set and unreadable here, on the one case the key was invented for.
- `signed` — a 5e reading is `+3` and not `3`. One key, and it is the difference
  between a sheet that looks like the game and one that does not.

**Dropped from the Card half**, six:

- `direction`, `sizing`, `align`, `labelAlign` — Card set's strip geometry. There
  is no strip here: a stat is a line of a table, not a tile on a grid, so "one
  card per grid unit" has nothing to size and `align` has nothing to align. Four
  keys with no reading is four instances of #536.
- `key`, `options`, `notePlaceholder`, `hideNote` — a stat's storage key **is**
  its published name here (there is no card hiding it), a closed list of choices
  grouped over dependants is a thing no surveyed system has, and a per-stat
  free-text note line has nowhere to go in a band whose body is already a list.
  Card's note line exists because a standalone number wants a qualifier; a stat
  here is qualified by the rows under it.

**Kept from the Table half**, four:

- `columns` — one list for the whole roster, which is the feature.
- `rows` — a label, its `stat`, and an optional `key`.
- `rowHeader` and `namePosition` — 5e draws the proficiency ring before the skill
  name (`namePosition: 2` in the shipped starter), and a roster that could not
  match the sheet it copies would not be used for the job it exists for.
- Per-column `hideHeading`, `secondary`, `min`/`max`, `levels`, `input`,
  `formula`, `signed` — the column apparatus itself, unchanged, minus the types
  below.

**Dropped from the Table half**, five, and each drop is load-bearing:

- **`openRows`.** Every stat-keyed list in every surveyed system is
  layout-declared. A character-added row would need its stat stored in a cell —
  reachable, on the `target` column's own shape — and would need an ungrouped band
  for a row naming no stat, which is a whole second state. And the system that
  actually wants a character-added skill is Call of Cthulhu, whose skills hang off
  no characteristic at all, so the case that wants open rows is the case that
  wants a Table. Out, and the shape it would take is recorded below.
- **`total`.** A total on a roster column has two readings — per band and per
  roster — and one key with two readings has no right answer. §5's aggregate
  carries both without ambiguity: `sum(skills, Bonus)` for the roster and
  `sum(self, Bonus)` inside a stat for the band. This is §4.2's own refusal of
  `total` on a computed column, arriving for a second reason.
- **The `modifier` column type**, and **`target`** with it. Every modifier case in
  the catalog is an *open* list — an inventory, a conditions list, a features list
  — because a modifier row is a thing the character acquired. A declared skill
  pushes nothing at anything, in 5e, PF2e or Blades. Dropping both is what lets
  this component declare no `scopeModifiers` at all, which is one fewer optional
  member to justify. The other direction costs nothing and is kept: a **stat** is
  a modifier target the moment its formula reads `mod.self`.
- **`rows.*.values`.** Table's per-row named expressions exist because "without
  them a skill list needs eighteen nearly identical formulas". `stat` now does
  that job declaratively, and the only use left — a per-row constant — is a cell
  in a `number` column. A row that genuinely needs its own expression is a Table.
- **`reset`, `applyReset` and `resetColumns`.** Nothing a roster holds is
  restored by an event: a score is not spent and a proficiency is not recovered.
  So the component declares neither member, the editor offers no binding, and a
  trigger passes over it. If a system ever wants it, it arrives later with no file
  change.

**A smaller config form is the better answer**, and this one is ten fields
against Card set's eleven and Table's seven — for a component that does both
jobs.

### Empty and error states

- **An empty roster is not an error**: a layout with stats and no rows draws its
  bands with nothing under them, and a layout with neither draws its label and a
  quiet empty region. A layout part-way through being built, on Group's own
  reading.
- **A missing or empty section is not an error either**: every band head shows
  `—` for its score, every cell is blank, and a blank cell in a `number` column is
  0, so the computed totals read as a fresh character's. This is the state that
  matters most, because a new character opens one.
- **A fence that will not read fails the component's `read`**, so the cell carries
  `.sheetsmith-error` naming the line — Card's rule, since the stats are Card's
  kind of data. A section holding two tables is refused for writing on Table's own
  rule, since an index means the row at that position in *that* body.
- **Configuration errors draw on that component alone and name the fix**: a row
  whose `stat` names nothing declared; two stats sharing a key; a row key
  colliding with a stat key; a row key with no publishing column; a `publish` on
  a `text` column; a column key that is not a name §5 accepts where a row
  publishes through it.
- **A failed formula is `?` after the shared delay**, with the name it could not
  find in the cell's own popover, and **one failure does not take the roster
  down**: a band whose `derived` will not resolve shows `?` in its head and its
  rows keep computing, since a row reading `stat` fails on its own row rather than
  blanking the section.
- **A ring between the two directions** shows `?` at both ends with §5's own
  sentence, per the model question.

---

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `stats` | `entries` | Stats | The values the rows hang off, in the order their bands are drawn. A key names the entry in the note and the name a formula reads; renaming one does not move a stored value — the old entry stays in the note under the old key. |
| `derived` | `text` (formula) | Stat reading | One formula computed per stat, reading that stat's stored value as `value` and its own rows as `self`. `mod(value)` makes a score read as a modifier; `count(self, Rating > 0)` makes a stat the count of the rows under it. |
| `effective` | `text` (formula) | Stat value after modifiers | What a stat's value field reads once modifiers are applied, as `value + mod.self`. Blank leaves the field the stored number. The field goes back to the stored number the moment it is focused, so an arrow key never commits a modified total. |
| `hideValue` | `boolean` | Hide each stat's stored value | Draws the reading alone, for a stat the character does not type — one computed from the rows under it. Its entry in the note is kept and never written. |
| `signed` | `boolean` | Show a sign on the reading | Draws `+3` rather than `3`, for a reading that is a bonus rather than a quantity. |
| `rows` | `rows` | Rows | The rows the layout declares, each naming the stat it hangs off. A row the note does not hold is drawn with blank cells; a note row the layout no longer declares stays in the file, unrendered and untouched. |
| `columns` | `columns` | Columns | The typed columns every row carries, shared by every band — so adding one is one edit rather than one per stat. A computed column's formula reads the row's cells by key and its own stat as `stat`. Text, modifier and target columns are not offered. |
| `rowHeader` | `text` | Row heading | The heading over the column holding row names. Defaults to "Name". |
| `namePosition` | `number` | Name column position | Where the name column is drawn among the others. The note always holds it first whatever this says, so changing it moves nothing in any file. |
| `hideLabel` | `boolean` | Hide the heading | Draws the roster with no name over it, for one whose surroundings already say what it is. |

`formulaFields`: `derived`, `effective`, `columns.*.formula`.

`palette`: **none**, and that is a decision. §4.2's test is that a job an author
would go looking for is one component's configuration away *and* the component's
own name would not lead them to it. A **Skills** entry fails the second half —
"Roster" is what a skills list is called — and it fails the first in practice,
because the only configuration it could prefill is the author's own stats and
their own rows, which is everything they have to type anyway. Prefilling the
arithmetic instead is worse: `stat + Training * prof` names a function the layout
may not define, which is the defect the Conditions entry refused a prefilled reset
binding over. The Feats non-entry is the discipline being applied.

`configName`: none. No configuration of this is called something else.

`sample`: two stats with scores from the shared sequence, two rows each, every
key, name and label taken from the config and only the values the component's —
so the canvas draws a roster with two bands that differ, and the contract's round
trip has one more body to check.

---

## Data and file model

`storage: 'markdown'`. One `##` section holding a `sheet` fence and a markdown
table, found rather than positioned, each half keeping its own spelling. The full
argument, the two constraints and what happens to existing notes are in the model
question above.

---

## Acceptance criteria

- [x] A section holding a fence and a table reads as stats and rows, in either
      order, with prose before, between and after preserved.
- [x] Parse then serialise with nothing changed is byte-identical, over ten
      spellings: fence first, table first, no fence, no table, neither, a
      preamble, prose between the two halves, misaligned pipes, CRLF, and no
      trailing newline.
- [x] Editing one stat's score rewrites that fence line and leaves every other
      byte in the section alone, the table's own spacing included; editing one
      cell rewrites that cell and leaves the fence alone.
- [x] A declared row claims the first note row spelling its name,
      case-insensitively, whatever band it is drawn in; reordering the bands in
      the layout changes no byte of any note.
- [x] Moving a row from one stat to another in the layout changes no byte of any
      note, and the row keeps its cells.
- [x] A wikilink in a row name renders as a link, is faint where the note does
      not exist, and opens on a press and on a mod-press. It does not edit as a
      field: a row's name is layout-declared, never character-owned, since
      Roster declares no `openRows` — the clause this bullet's own first draft
      carried over from Table's identically-worded criterion assumed an open
      row Roster never has, and is struck rather than proved.
- [x] A wikilink committed into a stat's field is declined with
      `fenced-link.ts`'s own sentence, and the note is unchanged.
- [x] A computed column reading `stat` resolves to what its own band's head
      shows, and `stat.value` to the stored score; a row in a band whose stat
      stores nothing gets `?` from `stat.value` and a number from `stat`.
- [x] `stat + Training * prof` on one column produces the right total on every
      row of every band, with `ability:` declared nowhere.
- [x] `count(self, Rating > 0)` in `derived` resolves per stat to that stat's own
      rows and not to the roster's, proved on a roster whose three bands hold
      different counts.
- [x] `self` in an aggregate's first argument outside a stat's formula fails with
      a sentence naming `self`, not with "there is no table called self".
- [x] `count(<id>, …)` and `sum(<id>, …)` walk every row of the roster, in band
      order, and an empty roster gives 0.
- [x] A roster whose column formula reads `stat` while that stat's formula
      aggregates `self` over that column is refused at both ends, both cells show
      `?` with §5's sentence, and every other band and every other component on
      the sheet keeps working.
- [x] A card elsewhere on the sheet aggregating the roster still resolves while a
      band aggregates itself, on a roster using one direction — driven from both
      ends and compared, per §12's rule for a cycle guard.
- [x] `<id>.<statKey>` publishes the reading and `<id>.<statKey>.value` the score;
      the component publishes no bare `<id>`.
- [x] A declared row with a `key`, under a column with `publish`, answers to
      `<id>.<key>`, and `10 + skills.perception` works on a roster exactly as it
      does on a Table.
- [x] A row key equal to a stat key is a configuration error naming the fix, and
      the rest of the sheet renders.
- [x] A stat whose formula reads `mod.self` takes a modifier pushed from a Table
      elsewhere on the sheet, marks the number, and names the row and its
      component in the breakdown.
- [x] The component declares no `scopeModifiers`, no `applyReset`, no
      `resetColumns` and no `hasBuffer`, and the registry's own rosters record
      that.
- [x] Every configuration error listed in Design draws on that component alone,
      names its fix, and leaves the rest of the sheet rendering.
- [x] The component passes every check in `contract.test.ts` — member order, no
      member outside the contract, a sample that reads back and writes
      byte-identically under every configuration it is offered, no wikilink in a
      sample, every config field carrying a label and a description, and every
      formula field exposed as a config field the editor renders.
- [x] Registering it is an import and a `register()` call, and `git diff --stat`
      shows no change to `src/parse/character.ts` and none to `src/view/`.
      **`src/editor/` does change**, in one named way: a list field whose cell is
      a choice over another field's entries, for a row's `stat`. Declared here
      rather than discovered, on Record set's precedent — the claim's scope is
      "a component whose configuration the editor's existing fields already fit",
      and this one does not.
- [x] `src/formula/` and `src/parse/` still import nothing from `obsidian`
      (Constraint 5), and `components/isolation.test.ts` is unchanged.
- [x] `npm test`, `npm run lint` and `npm run build` are green.

**Look criteria**, in the harness at 1400px, 520px and 380px, both themes:

- [x] A six-band roster reads as one table: the column headings sit once at the
      top, every band's rows share the same column tracks, and a column of
      proficiency rings reads as one shape down the whole roster.
- [x] A band head reads as a heading carrying a value, not as a row and not as a
      card: its name is at the region rank, its reading at the card's headline
      weight, and the hairline between bands is the one §9 already uses.
- [x] At 520px, where the sheet has not collapsed, a roster placed four columns
      wide keeps its name column pinned and nothing overflows horizontally.
- [x] At `text=24` the band head's three parts stay on one line or wrap
      predictably, and nothing collides.
- [x] A roster beside the six-up `ability_checks` group on one sheet is visibly a
      different picture at a glance — which is settled answer 2's claim tested by
      looking.
- [x] The empty state — every band head at `—`, every cell blank, the computed
      column reading a fresh character's numbers — reads as a sheet waiting
      rather than as a broken component.
- [x] Forced colors: the band head is distinguishable from a row, and the level
      rings survive as they already do.

**Harness fixture** (`harness/samples.ts`): two rosters. A wide six-ability 5e
roster — `Training` level column with its heading hidden, a `Total` computed
column reading `stat + Training * prof`, four rows carrying keys so the published
names are worth looking at, `signed` on. And a narrow three-attribute roster in
the other direction — `hideValue`, `derived` of `count(self, Rating > 0)`, a
`Rating` level column — placed beside the existing `ability_checks` group so the
two pictures are in one shot. `harness/shot.mjs`'s four frames are **measured
through each view's own query** and raised, per that file's own standing
instruction; the narrow one will move most, for the reason it always does.

**This closes one `docs/BACKLOG.md` row**, and only if the harness fixture is
built as above: *"No harness view stages more than six published names, where the
inventory's sizing was accepted at eighteen."* A roster with six stats and four
published rows puts **ten** chips in the configuration panel's published-name
inventory, each with its `.value` and `mod.` forms, plus the two aggregate calls
— which is the surface that row asks for. The criterion is that the editor view's
shot selects the roster.

**Vault fixture** (`~/Developer/sheetsmith-test-vault`, per the naming
conventions): `Sheetsmith layouts/Roster variations.json` and
`Characters/Rosters.md`. A new registered component gets its own fixture pair
rather than sharing one, since a regression has to trace to the fixture for the
component that broke. **Aramil and `DnD 5e Caster` are not touched.**

The layout places a roster in a narrow cell and a wide one; one with no `derived`
at all; one with `hideValue` and a `self` aggregate; one inside a Group and one
inside a Tab set; one with a publishing column and row keys, read by a Card
elsewhere whose `derived` is `10 + <id>.<key>`; a Card reading `mod.self` and a
Table pushing at a stat, so a modified stat is on screen; and one deliberately
misconfigured roster whose row names a stat the layout does not declare.

The note holds: a stat entry under a key the layout no longer declares; a table
row the layout no longer declares; a row name holding a wikilink to a note that
exists and one to a note that does not; a hand-written table with misaligned
pipes; a hand-broken fence line; prose between the fence and the table; and one
section where the table comes before the fence.

**What to press**, so a clone can rebuild the check: type a score into a band head
and watch every row in that band recompute and nothing else move; cycle a
proficiency ring and watch that row's total change and the published name a Card
elsewhere reads change with it; open the note in markdown view and confirm the
fence and the table are where they were, with the misaligned pipes still
misaligned; rename a linked note and confirm the row name follows; move a row
between two stats in the layout editor and confirm markdown view shows a
byte-identical note.

---

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. `refactor: Share the row claim rule between both storage paths`. The claim
   rule moves to `src/parse/`, Table imports it from there, and a guard test
   asserts the two paths agree. No behaviour change.
2. `feat: Hold a set of stats and the rows that hang off them`.
   `components/roster.ts` through `read`, `write`, `sample`, `configFields` and
   its configuration checks, plus registration. Renders read-only.
3. `feat: Read a row's own stat from its formula`. The row scope's `stat` and
   `stat.value`, the computed column, and `scopeValues` for the stats.
4. `feat: Aggregate a stat over the rows beneath it`. `self` in an aggregate's
   first argument, the display scope's row binding, the guard's reading of a
   `self` walk, and the ring's message.
5. `feat: Edit a roster from the sheet`. The stat field, the cells, the level
   rings, the links, the effective reading, focus restoration and the
   announcements.
6. `feat: Publish a roster's rows by name`. The publishing column, row keys, and
   the collision check against a stat key.
7. `feat: Offer a roster's own stats to its rows`. The editor's list field whose
   cell is a choice over a sibling field's entries.
8. `docs: Record what a roster settles`. §2's **Roster** and **band**, §4.2's new
   entry, §4.3's third arrangement, §5's `self` and the row scope's `stat`, §8 if
   the band head needs a sentence, §12's component order and count, §13's
   `Resolved:` entry, `docs/UI.md` §9's new row, and the `docs/BACKLOG.md` row
   this closes struck.

---

## Deliberately not doing

- **A reader-side grouping toggle**, and **an `order` config key with it.**
  Argued at length in the model question: the lever the borrowed evidence asks
  for is one the author already has and larger, find-in-page answers the
  findability trap in a way paper cannot, and a toggle would reflow the sheet.
  The evidence is recorded rather than dismissed, because it is the entry to
  revisit if a reader ever reports the hunting-and-pecking complaint here.
- **Open rows.** Every stat-keyed list in every surveyed system is
  layout-declared, and the system that wants a character-added skill — Call of
  Cthulhu — attaches its skills to no characteristic at all and therefore wants a
  Table. If it is ever taken, the shape is known: a `stat` **column type** on the
  `target` column's own shape, a select over the component's own declared stats
  (so none of §13's parked `select`-column blockers is reached, since the options
  are not a list inside a config row), and an ungrouped band for a row naming no
  stat.
- **A `modifier` or `target` column.** Every modifier case in the catalog is an
  open list, because a modifier row is a thing the character acquired, and a
  declared skill pushes nothing. The other direction is kept and costs nothing.
- **A column `total`.** Two readings, one key. `sum(self, …)` and `sum(<id>, …)`
  say which one is meant.
- **Per-row expressions (`rows.*.values`).** `stat` does the job they existed
  for; a per-row constant is a cell; a row that genuinely needs its own
  expression is a Table.
- **Reset bindings.** Nothing a roster holds is restored by an event.
- **A palette entry.** Argued above against §4.2's own two-part test.
- **A row hanging off two stats**, which is 2014 PHB p.175's "Variant: Skills
  with Different Abilities" — a Strength (Intimidation) check. That is a choice
  made at roll time, and this plugin does not roll (§11). The sheet's answer is
  that a row names the ability it usually uses.
- **Anything for a system with no such relation.** Call of Cthulhu 7e attaches
  its skills to no characteristic — Dodge at half DEX and Language (Own) at EDU
  are two of about ninety — and carries the half and fifth values on the
  characteristics themselves; Vampire V5 pairs any attribute with any skill, and
  also attribute with discipline and attribute with attribute. **A roster does
  nothing for either, and the honest answer is to use Card set and Table**, which
  is what the first of the three arrangements is and why it stays.
- **A per-band column set.** One `columns[]` for the whole roster is the feature;
  six pairs needing six column sets are the six-up arrangement, which is valid.
- **A second reserved suffix or a per-band published row source** —
  `<id>.<statKey>` as an aggregate's first argument. It would widen §5's stated
  one-position exception from one segment to two, and everything it buys is
  already reachable: a stat's published name *is* what its own aggregate came to.
- **The name suggester offering `self`.** The suggester's first-argument list is
  "components an aggregate may walk", and a context-sensitive reserved word needs
  it to know which formula field the caret is in, which it does not. A
  `docs/BACKLOG.md` row rather than work here.
- **The save-time cycle check.** It does not exist (§5), and this feature does not
  build it. What it owes that check is recorded in the model question so it is not
  rediscovered from the guard's code.
- **A print stylesheet.** The note is the printable artefact, here as everywhere.

---

## Later additions

**Not part of what shipped.** `cardLayout` and `dividerAfter` were built,
tested, and verified against the owner's own screenshots through several
rounds of refinement — everything below this note describes real, reasoned
work. It was then lost during `/land-it`: a rate-limited dev session,
reconstructing the original commit boundaries below, reverted the working tree
past this addition and died before reapplying it, and the loss was judged
better to accept than to reconstruct render-critical editing logic from a
coordinating session's memory of it. The reasoning stands as the record for
whoever rebuilds it, as its own follow-on feature; nothing below is in
`src/components/roster.ts` today.

**`cardLayout` and `dividerAfter` were added after this spec was approved and
built against, on the owner's own instruction** — an explicit override of the
normal stop-and-defer process for a surface change, not a routine amendment
worked out under the settled answers above. Recorded here plainly rather than
folded silently into the config table, so a reader of this document knows the
line between what the model question settled and what arrived afterward by
direct order.

**`cardLayout` is additive: unset (the default, `false`) is byte-for-byte the
original design this spec argues for** — one shared `<table>`, a band head as
a `<tr>` spanning every column. Nothing about `columns[]`, `derived`,
`effective`, `scopeValues` or `scopeRows` changed to add it; it is a rendering
switch alone, read only inside `render()`. Set `true`, each declared stat draws
as its own bordered card instead — the same band head content, the same
`columns[]`, in a small table of that stat's own rows beneath it. The chrome is
borrowed rather than invented: `.sheetsmith-card` and `.sheetsmith-card-set`,
the same classes a Card set wears.

**`dividerAfter` is a per-row boolean, declared through the same `configFields`
convention as any other row property** (a generic `rowFlag` capability on a
`'rows'`-kind field, so the editor still learns nothing about what a Roster
is). Set on a row, it draws a rule immediately beneath that row when
`cardLayout` is active — separating, say, a stat's saving throw from the
skills listed after it inside its own card. It has no effect in the
shared-table layout, which has nothing this small to divide. **A row's own
divider is suppressed where it is also the last row in its card**, on the same
rule that already suppresses the ordinary hairline there: a rule beneath
nothing is a rule against the card's own bottom edge rather than a division
between two things, which is the same argument the table's last-row rule
already made.

**Four refinements followed, from the owner looking at `cardLayout` rendered in
real Obsidian rather than the harness** — the same override as `cardLayout`
itself, not a fresh model question, and folded into this section rather than
opening a second one.

- **The card-mode band head draws in Card's own real order.** `card-face.ts`'s
  actual creation order is name, then `derived` (headline weight), then
  `value` (secondary, Card's own pill). "What the reader sees" above describes
  value-then-reading, which is right for the shared-table band head this spec
  was approved with and stays right for it — table mode is unchanged — but the
  first `cardLayout` implementation carried that same order into the card,
  reasoning from a comment about Card that turned out to be wrong about what
  Card actually builds. `drawBandHead` now branches on `cardLayout`: card mode
  draws name, then the reading, then the value, toggling the same
  `sheetsmith-card-has-derived` class `card-face.ts` toggles on itself so the
  value's pill treatment is Card's own CSS rather than a second copy of it.
- **`hideColumnHeadings`**, an eleventh config field: draws no column-heading
  row above each card's own rows, for several cards repeating the same
  headings. A boolean, `configFields`-declared exactly like any other; it does
  nothing in the shared-table layout, which draws its one header once
  regardless — the same card-mode-only shape `dividerAfter` already has.
- **The mini-table inside a card is painted `--background-primary-alt`
  explicitly**, the same background a table wears everywhere else in this
  plugin. Without it the table showed the card's own `--background-secondary`
  through, one shade off — checked against Obsidian's real `app.css` rather
  than guessed, and confirmed to be this plugin's own gap rather than a stock
  Obsidian table rule reaching a view that sits outside `.markdown-rendered`.
- **The divider's rule reads stronger**, `--background-modifier-border-focus`
  in place of the ordinary hairline's `--background-modifier-border` — the
  same stronger neutral line `.sheetsmith-group` already reaches for to tell
  an outer region's rule from a nested one apart, borrowed rather than a new
  color invented for the purpose.
