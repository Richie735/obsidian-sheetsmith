# Open rows for Table

Status: shipped
Board card: three cards, one component, one spec:
- ✨ Open rows for Skill card — Rows the character adds. Needed by inventory, attacks and spells. Forces §13's naming question.
- Bug — `[[Sunblade|sword]]` in a Skill card cell renders as plain text. The link is wrong visually and mechanically: it does not look like a link and clicking it does nothing.
- Rename the Skill card component to Table.

*Supersedes `open-rows-for-skill-card.md`, `wikilinks-in-table-cells.md` and
`rename-skill-card-to-table.md`, which were three plans for one change. They are
one feature because they are one component and one uncommitted tree: open rows
are what force the naming question §13 parked, and a list the character fills is
what puts a wikilink in a cell a layout author never wrote.*

## Model question

Two of §13's entries, and they have to be taken in the order they depend on each
other. Everything else here is one mechanical fact — **a row is a line, and a
line has a position** — seen from several sides.

### Row identity: position, not name

`SPEC` §4.2 said "the name is always the note's first column. It is what
identifies the row." The first half is a file-format rule and survives. The
second half is an assumption the file never made, and it is what breaks.

A markdown table is an ordered list of lines. Keying it by the first cell added a
uniqueness constraint the format does not have, and it was invisible while the
layout author wrote every row name. The moment the character writes them, three
things go wrong at once: two daggers collapse into one (CSB shipped that
constraint and had to loosen it, #208), §4.2's "a second row under the same name
stays in the note unrendered" turns from a hand-edit courtesy into silent data
loss, and a formula naming a row breaks on capitalisation (CSB #313, worked
around with a regex).

**A row is identified by its position in the note's table.** That is what the
file already says, and it is the only identity that survives duplicates, case,
and renaming — because it is not derived from anything the user types.

The three alternatives, and why each loses:

- **Opaque generated ids** (Roll20's `repeating_equipment_-8908asdflkjZlkj23`).
  Stable, and unwriteable: finding one means inspecting the sheet's HTML. It also
  puts a column of noise into a file whose whole promise is that it stays
  readable and hand-editable (§3.1).
- **Name plus an occurrence number** ("Dagger#2"). Invents a syntax that the note
  does not contain, and renaming the first dagger renumbers the second.
- **Position as a formula-visible name** (Roll20's first attempt). Deleting a row
  renumbered every row after it and broke macros. That failure is about
  *publishing* position, not about *using* it internally, and the next answers are
  what keep the two apart.

Position is safe here precisely because nothing outside the component ever sees
it. An index is valid for the render it came from, and a write is always followed
by a re-render, so it cannot go stale across a gesture. Deletion and addition both
change the file, so both always re-render.

### What the layout owns and what the character owns: the claim rule

**A declared row claims the first note row spelling its name, scanning the table
top to bottom, case-insensitively. Every unclaimed note row belongs to the
character.** One rule, and it settles four separate things:

- 5e skills: every row is claimed, and the card behaves exactly as it did before.
- 5e attacks: nothing declared, every row the character's.
- Blades load: pre-printed items declared, blank lines for invented gear added by
  the player, one list holding both.
- Constraint 4's new case — the layout adds a predefined row where the character
  already typed one by that name — is not a case at all. The declared row claims
  the row that is already there. Nothing duplicates, nothing is overwritten, the
  cells stay put. What changes is that the row's name goes read-only and its
  delete control disappears, which is visible and is not a loss. CSB's answer to
  the same situation is a community migration script carrying "you might lose
  data!" (#522, #143).

Case-insensitive matching is the fix for CSB #313, and it is safe *here* for the
reason that bug was unsafe *there*: no formula names a row, so what a row's
capitalisation can change is which declared row claims it, never what any
arithmetic resolves. The note keeps its own spelling either way. The table writer
already matches *columns* this way, for this reason.

This also disposes of CSB's three per-row flags. `$predefinedIdx` is the claim,
computed rather than stored. `$deletionDisabled` is "claimed". `$deleted` does not
exist, because deleting a row deletes the line.

### §13's naming question: one component, and its name widens

The entry offered two branches:

> **What the open-row version of Skill card is called.** … Either open rows ship
> as a second component sharing this one's implementation, or the name widens
> again. Deciding it before open rows are built would be deciding it without the
> thing that will make the answer obvious.

**The first half settles by construction: openness is one boolean (`openRows`)
crossed with the `rows[]` the layout already declares, so there is no second
component.** CSB reached the same shape from the other direction — one Dynamic
table, per-row flags, plus an orthogonal "can players add rows" — and this keeps
the orthogonal setting and drops the flags, because the claim rule derives all
three of them.

With one component there is exactly one name to choose, which is the order §13
said this had to happen in. **It is Table**, on three legs, the first two evidence
from this repository rather than taste.

1. **Every sibling in the catalog is named for what it is on the page.** Stat,
   Stat group, Pool, Track, Group, Image, Rich text, Computed. "Skill card" is
   the only exception, and it is the only name that reads wrong over most of what
   its own component does — §4.2 has this block covering inventory, attacks,
   spells and features, and §2 already admitted "its name will read oddly there".
   Renaming it makes the catalog consistent rather than breaking it.
2. **This repository has already made this exact move, in this direction, for
   this reason.** §12 records that Stat group "was built as 'Abilities'" and
   became Stat group once it turned out to be the general thing. Same correction,
   one component earlier, and nobody has regretted it.
3. **§2's principle is applied, not broken.** Read in full it says a component is
   "deliberately generic in *capability* (Stat group, Pool) rather than
   system-specific (AbilityScore, SpellSlots)", and then that the name "should
   describe what they are about to build rather than the shape of its data
   model". The target of that sentence is system-specificity, and the shape it
   warns against is the *storage* shape — "repeatable typed record" is the name it
   rules out. "Table" is neither. Somebody building an inventory looks for a
   table; nobody looks for a skill card, which makes this a discoverability
   failure rather than a matter of aptness.

**The cost that was assumed and is not real.** The obvious argument for keeping
the name is that widening it means a migration across every layout's
`type: 'skill-card'` for a cosmetic gain. That premise is checkable and it is
false: nothing has been released, `gh release list` is empty, and the repository's
one tag is `ship-tooling-preRebase`. There are no layouts in the wild. What exists
is this repository's fixtures and the user's test vault, which Constraint 6
already requires to be throwaway.

**The costs that are real, stated rather than discovered later.** "Table" says
nothing about typed columns, per-row formula scope, or totals — but neither does
"Pool" mention its buffer or its reset bindings, and `configFields` descriptions
are where capability is met (§8). It also borrows Obsidian's own word, so an
author may expect it to display a table written elsewhere in the note rather than
one it owns a section of. That is the one real ambiguity and the component's
description is where it gets answered.

What the catalog may eventually want is a second *palette entry* — the same
component type offered as "Inventory" with `openRows` on and Item / Qty / Weight
columns prefilled. That is a layout-editor concern needing no new type, and it is
not built here.

### The rename is a type id, and the contract must not grow for it

The layout editor derives a component's display name from its type id:
`componentDisplayName('skill-card')` → "Skill card". There is no display-name
registry. So **changing the type id is the whole rename**, and
`componentDisplayName('table')` → "Table" needs no new code at all.

Declaring a name on the contract instead — keeping `type: 'skill-card'` and
showing "Table" — is the tempting alternative and is worse in a way a user can
see. `uniqueLabel` seeds a new component's `label` from the display name while the
file stores the id, so the editor would offer "Table", write a section headed
"Table", and store `type: 'skill-card'`, and the first person to open the layout
file would find two names for one block. It also fails §4.1's test for what may
join the contract outright: a member is optional "only where the alternative is
code outside the component knowing that component's data shape", and a display
name has nothing to do with a data shape.

**No `skill-card` alias in the registry either.** With nothing released an alias
is dead weight from the day it is written, and it would have to be hidden from
`listComponentTypes()` or the add menu offers one component under two names —
which is the confusion this change exists to remove. The migration story is the
error message instead: a layout still saying `skill-card` renders "Unknown
component type", which `UI.md` §12 already records as a gap — *"An unknown
component type names the fault, not the fix… `listComponentTypes()` is already the
registry's public list; name them in the message."* That backlog row is fixed
here, and it lands before the rename so the rename's one failure mode is already
legible when it arrives.

### What open rows publish: no row names, and one total per column

**A character-added row publishes nothing, and this is a finding about the
contract rather than about the component: `<id>.<name>` is a fixed-row
mechanism.** A name a formula can write has to be stable and has to be knowable
when the formula is written. A declared row's label is both — the layout author
typed it. A character row's name is neither. Three tools tried and none produced a
reference a human can write: Roll20 ended at ids you find by reading HTML, and CSB
never names rows at all.

Note what this does *not* settle. §13's other Table question, how a Table
publishes its *declared* rows, stays open and this feature does not touch it. It
does fix its bound: whatever mechanism eventually publishes a row, it applies to
declared rows only.

**A column total is in scope**, and it is the one thing an open list can publish,
because an aggregate needs no row name. That is the same mechanical fact seen from
the other side, and it is also why the contract does not have to grow:

`scopeValues(data, config)` is handed no resolver (§4.1). A row's published value
would be a computed column evaluated in a scope that itself holds formulas, which
is exactly why §13's publication question is open. A **sum over a stored column is
a number derived from data alone** — a `number` cell's value, a `level` cell's
level, a `toggle` cell's 1 or 0 — so `ScopeEntry.value` carries it with no change
to the contract at all.

That boundary is also the argument for scope. Two independent CSB requests ask for
a column total and both name weight (#249, #272); CSB's answer is to leave the
formula language and write JavaScript over the row array. The authoring wall is
what kills tools in this category, and an aggregate that needs code is the wall
arriving at the most common inventory question there is. Blades makes it sharper
still: load is a sum across rows compared against a chosen limit, so the number the
mechanic exists for *is* the total.

The consequence: **a total on a `computed` column is a configuration error**,
because a total is a published name and a computed column cannot produce one until
§13's question is settled. Rendering it on the sheet and refusing to publish it
would be Track's asymmetry ("readable on the sheet and not from a formula") applied
to a field the author explicitly ticked to get a name, and one name meaning
"publishable, sometimes" is worse than a refusal that says why.

### Rendering a note reference is not the `link` column card

A list the character fills is where `[[Sunblade|sword]]` first turns up in a cell,
and the reflex is to park it as the `link` column type §12 already holds. That is
answering a different question.

**A `link` column is a column *type*** whose value is always a note reference — it
would carry a picker, a resolved/unresolved state as data, and, per §12, the
one-note-per-row model that buys nesting and costs PDF export. That is a real
feature and it stays parked.

**This is a display capability for text that already round-trips.** A user typed
`[[Sunblade|sword]]` into a text cell. The note holds it as plain markdown, which
is the entire reason Constraint 2 exists, so Obsidian is already indexing it: the
backlink resolves, the graph edge exists, and renaming the note already rewrites
the cell. Every promise markdown storage was chosen for is already kept **except
the two the sheet itself owes** — that it looks like a link and that it answers a
click. That is a rendering gap, not a missing column type: no config field, no new
column, nothing new stored.

### Who renders a link: not `MarkdownRenderer`

The reflex answer is `MarkdownRenderer.render`, which would drag `obsidian` into
`src/components/`. Four reasons it is the wrong tool here, and the first is
decisive:

1. **It is asynchronous and `render` is not.** A cell filled in a tick later
   flashes its raw text first, and every synchronous test in the component's
   tests would have to learn to wait.
2. **It renders block markup.** A `<p>` inside a `<td>` inside a row whose height
   is already agreed with its neighbours.
3. **It needs a `Component` for lifecycle**, and the contract gives a component no
   unload hook to pass one.
4. It would put `obsidian` into `components/`. This last one is a cost rather than
   a bar — the card takes `setIcon` for its delete control, and what that cost
   turned out to be is that the stub installs DOM helpers on load, so three
   node-environment test files broke on import until it learned to guard them
   (`PATTERNS` §2). Reasons 1 to 3 decide it on their own.

What a wikilink actually is, is a small piece of file-format syntax, and this
repository already has a home for that: `src/parse/`, pure by constraint. So **the
syntax is parsed in `src/parse/wikilink.ts` and the anchor is built with plain
DOM.** Nothing app-shaped is needed to *draw* a link — only to resolve, navigate
and preview one.

The cost, stated: this buys wikilinks and no other markdown. A cell holding
`*italic*` still shows the asterisks, and Blades' "italic items count zero" would
need the renderer or its own syntax. The parser returns a *segment list* rather
than a string precisely so external links and emphasis can be added to it later
without changing any caller.

### The contract grows, by one optional member of `RenderContext`

This is the decision, not a side effect. Resolving a link target, opening it, and
triggering a hover preview all need `app`, and a component may not have it. The
sheet view already builds `RenderContext` and already has `app`, so the capability
is passed in beside `resolveField` and `onChange`:

```ts
/** What a component needs from the app to make a note reference work. */
export interface LinkContext {
	/** Whether the target names a note that exists. Drives `is-unresolved`. */
	resolves(target: string): boolean;
	/** Follow the link. The event carries the modifier that opens a new tab. */
	open(target: string, event: MouseEvent): void;
	/** Offer Obsidian's hover preview for this anchor. */
	preview(target: string, anchor: HTMLElement, event: MouseEvent): void;
}
```

`RenderContext.link?: LinkContext`. This passes §4.1's test for what may be added,
by the same argument `scopeValues` and `applyReset` pass it: **the alternative is
code outside the component knowing that component's data shape.** Only the
component knows which of its cells is prose a user may have typed a link into; a
view that resolved links on the component's behalf would have to walk its DOM
guessing, or be told the shape of a Table.

**Optional, and the split matters.** Painting the anchor never depends on it: the
markup and the classes come out of the parse alone, so a test under happy-dom and
the harness outside Obsidian both show a real link. What the context adds is
resolution, navigation and preview. Absent, an anchor paints as resolved and a
click does nothing — which is exactly what a harness reviewer should see, since
there is no vault behind it to navigate to.

### What it stores, and what happens to existing notes

**Nothing about the file format changes.** The same table, the same columns, the
same one line per row. What changes is how the component addresses those lines,
which is in-memory only. Link rendering stores nothing at all and writes nothing:
Constraint 3 is not preserved so much as uninvolved, and Constraint 4 has nothing
to act on. The rename cannot reach a character note either, because a note holds
no component type — sections are keyed by `label` (§13), and no formula is touched
because formulas reference a component's `id` rather than its `type` (§5).

Existing notes are affected in exactly two ways, both of them gains:

- A row whose name differs from the declared label only in case now fills that
  declared row instead of sitting in the file unrendered.
- A row with a blank name cell is no longer dropped on read. On a fixed-row card
  it still renders nothing, because render walks the declared rows.

`write` returning the body byte for byte when nothing changed (Constraint 3) is
unchanged and is where the round-trip tests already live. Two new bytes-level
obligations arrive with user-typed cells, and both are covered in the file model
section below: an escaped pipe, and a deletion splicing exactly one line.

## What it does

The component that renders rows of typed cells is called **Table**, and it can be
told that characters may add their own rows. The layout still declares whatever
rows every character has, and the character adds, renames, and removes rows below
them — which is what inventory, attacks, spells, and features need, and what a
Blades playbook needs on one list at once. Any number, level, or toggle column can
show a total under the table, and that total is a name the rest of the sheet can
read, so an encumbrance rule is arithmetic the layout writes rather than code. A
wikilink typed into any cell the table shows as prose renders as a link: it takes
the theme's link colour, goes faint where the note does not exist yet, opens on a
click, and shows Obsidian's hover preview.

## Design

Nothing about how the component *looks* changes for the rename, and the proof is
mechanical: **every CSS class it uses is already `sheetsmith-table-*`** and
`src/parse/table.ts` has been the storage vocabulary since the markdown path was
built. The code has been calling this a table all along; only the catalog entry
disagreed.

### The rename, where a user meets it

- **The add menu** lists "Table". It is built from `listComponentTypes()` in
  registry order, so the `register()` call moves to keep that list alphabetical —
  `pool, stat, stat-group, table, track`.
- **A new component's default label** is "Table", from `uniqueLabel`. A second one
  is "Table 2", unchanged behaviour.
- **The configuration form** is identical apart from the two fields below. Every
  other `configFields` entry, description and list field is the same.
- **A stale layout** shows the improved unknown-type message naming the types it
  may use.

Source-side:

| Now | After |
| --- | --- |
| `type: 'skill-card'` | `type: 'table'` |
| `src/components/skill-card.ts` | `src/components/table.ts` |
| `skillCard` | `table` |
| `SkillCardConfig`, `SkillCardData`, `SkillCardRow`, `SkillCardRowData`, `SkillCardColumn` | `TableConfig`, `TableData`, `TableRow`, `TableRowData`, `TableColumn` |

**The one collision, and its rule.** `src/components/table.ts` sits beside
`src/parse/table.ts`. They are disambiguated the way `PATTERNS` §2 already
disambiguates everything else — the folder names the responsibility: `parse/` owns
markdown table *syntax*, `components/` owns the block on the sheet. Their exports
are disjoint (`MarkdownTable`, `readTable`, `writeTable`, `RowUpdate`,
`TableUpdates` against `table`, `TableConfig`, `TableData`, `TableRow`,
`TableColumn`), so an import taken from the wrong one fails the type check rather
than compiling into a bug.

### The table, at a glance

Unchanged for a fixed table. A table with open rows gains three things, in this
order down the table: the rows, an add control, and a totals row.

**Declared rows render first, in declared order; character rows follow, in note
order.** The layout's list is a list the author designed — a playbook's printed
gear is in playbook order — and it must not be reshuffled by whatever order a
character's file happens to hold. Character rows have no declared order, so the
file's order is theirs, and a new row appends at the end. That is insertion order,
which is the one of CSB's three ordering modes nobody filed a bug against.

A reader looking at an inventory takes, in one pass: what they are carrying, in
the order they added it; the pre-printed gear above it, indistinguishable in
weight from their own rows because it is the same list; and the load at the
bottom, adjacent to the last row rather than off in another component.

### The name cell

A claimed row's name stays what it was: plain text in a `th[scope="row"]`, not
editable, because it comes from the layout. It still renders its links (below).

A character row's name is an input in that `th`, on the shared editing gesture
(`editable.ts`) like every other cell — draft while typing, commit on blur, Escape
abandons and says so. It is the row's own data and the one cell a fixed table
never had.

### Adding a row

The last row of the table is a single cell spanning its width, holding a button
reading **Add row**. A row-shaped control in the row position, so it reads as "the
next row" rather than as chrome parked beside the table, and it picks up the row
hover treatment the rows already have.

The press reports the addition and the sheet re-renders from the fresh note. This
is the one place `PATTERNS` §5's optimistic paint cannot apply, and the reason is
worth stating rather than discovering in review: a new row's identity is its
position in the file, and the component does not know it until the file has it.
Nothing else in the gesture waits on the round trip.

Focus lands in the new row's name field. That falls out of how the view restores
focus — by control index within the cell, and the new row's controls sit
immediately before the add button that was focused — which makes it an accident
rather than a design, so it gets a test of its own.

### Removing a row

A character row carries a delete glyph in a trailing column. It takes the level
ring's measurements rather than the pool stepper's, because it lives in a table
cell beside rings and the table already has a 1.6em control that answers a press
with the whole cell as its hit target. There is no shared glyph-button class in
the repository and this does not invent one: two consumers earn duplication, not a
module (`PATTERNS` §1), and `UI.md` §9 gains a row when a third appears.

It is always rendered, faint, and comes to full contrast on row hover or focus:
`UI.md` §7 rules out a hover-only affordance, and a phone has no hover to reveal
one with. The column carries a heading held to assistive tech only, in the span
`hideHeading` already uses, so the table stays rectangular and the column keeps a
name where a name is all there is.

A claimed row has **no** delete control at all, rather than a disabled one. Its
absence is what says the layout owns the row, and eighteen disabled buttons down a
skills table is noise. `write` also drops a removal that lands on a claimed row, so
a stale index cannot delete a declared row through the back door. That is
Constraint 4 enforced at the file boundary, which is where it belongs.

**Deleting takes two presses.** The first arms the control: it takes a warning
tint and renames itself, so the row about to go is named on screen before anything
is applied. The second commits. Moving focus away, pressing Escape, or arming a
different row's control disarms it.

A new gesture needs an argument (`UI.md` §6), and this one has two. The shared
confirmation is not available to reach for: `ConfirmModal` takes an `App`, and
`RenderContext` carries no route to one, so a component's only confirmation surface
is the card itself. *(The `obsidian` import is not the constraint — the card takes
`setIcon`. The `App` is.)* And §12 already records the rule this follows, from the
typed-amount reversal: *where a control's input is not its outcome, the outcome has
to be on screen before it is applied.* Deletion is the only irreversible thing a
component offers. It also makes the focus behaviour safe: after a delete, focus
restores to whatever control now holds that index, which may be another row's
delete glyph, and an armed-then-commit control cannot fire on that landing.

### The totals row

A `tfoot` row below the last row: the word **Total** in the name column, wherever
`namePosition` draws it, and each totalled column's sum in its own cell. Other
cells are blank. It reuses `.sheetsmith-table-value` and its tabular figures, so a
total does not twitch while a cell above it is being typed.

Two CSS details, because neither is visible in the code that adds the row.
`.sheetsmith-table-name` is `position: sticky`, so the totals row's first cell is a
`th` carrying that class too, or the word "Total" slides out from under its column
on a phone-width sheet while the numbers stay. And `tbody tr:last-child` dropped
its bottom border, on the argument that it would double the container's — which
stops being true the moment a `tfoot` sits under it, so the totals row is the one
dropping its border instead.

**The total is the sum of the column's own values**: a number cell's number, a
level cell's level, a toggle's 1 or 0. One rule, and it is the mapping the
component already uses to feed a cell to a formula, so "how many are equipped" and
"what does this weigh" are the same arithmetic. A blank number cell is 0, which is
§4.2's existing rule and the reason an untrained skill still totals.

Where a cell in a totalled column is not a number, the total reads `?` rather than
the sum of the rest, publishes nothing, and its title names the row whose cell it
could not read. That is the `—` and `?` rule already on the card, and §5's rule
that a name which will not resolve publishes nothing rather than a quietly wrong
number.

### A cell's two states, and why they are stacked

A cell holding a link has to be two things: a link to follow, and text to edit. An
`<input>` cannot contain an `<a>`, so the two are separate elements — and the
arrangement is a **one-cell CSS grid with both children in the same grid area**,
the input and a display layer over it.

- **Unfocused.** The layer is opaque and on top; the input's text is transparent
  underneath it. Anchors inside the layer take pointer events; everything else in
  it does not, so a click on the plain part of the cell falls straight through to
  the input and the browser places the caret where it was clicked.
- **Focused.** The layer goes to `opacity: 0` and stops taking pointer events
  entirely; the input's text comes back. The raw `[[Sunblade|sword]]` is what is
  being edited, which is what the file says — the same split a note has between
  reading mode and source mode.

Not a swap, and the reason is not aesthetic. **The input is in the DOM and in the
tab order in both states**, which is what keeps `sheet-view`'s focus restoration
working: it identifies a control by its index among the focusable controls in the
cell, so an input that came and went would renumber every control after it on
every rebuild. A stack also keeps the cell's width the same in both states — sized
by the raw text, which is the longer of the two — so focusing a cell never reflows
the table under the pointer already resting on it (`UI.md` §5).

**A cell with no wikilink in it gets none of this.** No layer, no stack, no extra
element: the parse returns a single text segment and the cell renders exactly as it
did. That is the property that keeps an eighteen-row skills table unchanged, and it
is worth a test of its own.

**A commit repaints nothing; the rebuild repaints it.** Repainting the layer
locally from the new text looks like `PATTERNS` §5's optimistic paint and is not:
§5's reason is that a write producing an identical file does not rebuild the view,
and a commit here only fires when the value actually changed, so the rebuild always
comes. What a local repaint buys is a few milliseconds of fresher text. What it
costs is the row: the anchor is the next tab stop inside the cell, so tabbing out
of the field moves focus *onto it*, and that is what blurs the field and commits —
a repaint then destroys the element the browser has just focused, `activeElement`
falls to the body, and the user is dropped out of the row mid-edit. The window of
stale display text between a commit and the rebuild is the price, and it is the
right way round.

### Which text renders links

Every place the table shows text a user or an author wrote:

- A character row's **name cell** (an input, so it stacks). The reported case.
- A **`text` column's cell** (an input, so it stacks), `secondary` ones included.
- A **claimed row's name**, which is static text from the layout, so it needs the
  layer alone and no stack at all.

Not the rest, each for its own reason: a `number`, `level` or `toggle` cell is
arithmetic rather than prose; a **computed** cell shows a formula's result, and a
formula produces values rather than markup; the component's **label** is a
heading; the **layout editor's** row and column fields are an editor, where the raw
text is the thing being edited and rendering it would hide what is being typed.

### The anchor

Built to look and behave like every other internal link in the app, because it is
one:

- `<a class="internal-link">`, plus `is-unresolved` where `link.resolves()` says
  the target names no note. An inventory of items that have no notes yet is the
  normal case, and painting all of them as live links would be a lie the theme
  already has a colour for.
- `href` and `data-href` both carry the target, which is what Obsidian's own markup
  does and what any theme or plugin styling links will look for.
- The display text is the alias where there is one, the target otherwise.
- `click` → `link.open(target, event)`, with `preventDefault()`. The event goes
  through so the modifier that means "new tab" survives; the view owns knowing
  which modifier that is.
- `mouseover` → `link.preview(...)`, which is what gives §8's promised hover
  preview.
- Nothing is invented for touch. A tap is a click on a real anchor and navigates.
  Hover preview has no touch equivalent and none is faked (`UI.md` §7 rules out a
  hover-only *affordance*; a preview is not one, since the link works without it).

**The alias tooltip is `title`, not `aria-label`.** Obsidian's own aliased links
carry the target in `aria-label`, which is also what its tooltip reads, and copying
that is wrong — not as a matter of taste. `aria-label` **replaces** the name
computed from an element's contents, so a link reading "sword" announces as
"Sunblade", a name that appears nowhere in the cell. That fails WCAG 2.5.3 (label
in name, level A) and leaves voice control with nothing to match when the user says
"click sword". `title` is supplementary: the accessible name stays "sword" and the
target is announced after it as the description. The cost is the browser's tooltip
rather than the app's styled one — which is what every other tooltip on this sheet
already is (the level ring's level name, a computed cell's formula, a clipped
value).

`sheet-view`'s focus capture selector gains `a[href]`. It counted `input, select,
textarea, button`, so a rebuild landing while a link is focused would lose focus
entirely rather than restoring it — and this change is what puts anchors in a cell
for the first time. Capture and restore share the selector, so they move together.

### A row whose name is a link

A row whose name is a link is *named* as the sheet shows it and *edited* as the
file spells it, and that split has three consumers: a cell's accessible name, the
delete control's, and the row a total could not read. Take the raw text for any of
them and a screen reader is given "delete bracket bracket Sunblade pipe sword
bracket bracket" for a row that reads "sword".

On the delete control that is not cosmetic. The arm-then-commit design rests on the
row about to go being named before anything is applied, and for a listener the
accessible name is the only naming there is — so the guard on the one irreversible
action would be naming something unrecognisable. `displayText` in
`parse/wikilink.ts` is the counterpart to `segmentSource`: source for the file,
display for anything that has to *say* the text rather than draw it. The field keeps
the raw text, because that is the thing being edited.

### A clipped link

A name column is as narrow as the table lets it be, so a link is the text here most
likely to clip — and a clipped one has no route to the rest of itself, since the
layer is what is on screen and the field under it is only reachable by focusing the
cell. `UI.md` §12 already prescribes the fix for the stat note ("carry the full
value in `title`").

Two parts, and the second is why the first needs care:

- **The reveal is `ui/truncation.ts`**, extracted from the stat card's label rather
  than copied. `PATTERNS` §1 allows two consumers to duplicate *if* a test drives
  both copies, and no such test can exist here — `scrollWidth` and `clientWidth` are
  both 0 under happy-dom, so neither copy's branch is reachable. With the guard
  unavailable the duplication is not allowed. The helper reads the element's own
  text at hover time, so a repainted cell needs no rebinding.
- **The anchor does its own clipping** where the whole cell is one link.
  `text-overflow` paints the ellipsis in the colour of the box carrying it, so on
  the layer a truncated link reads as a link followed by three stray dots in the
  cell's text colour. On the anchor the ellipsis is the link's and follows its state
  for free. That also moves *which box overflows*, so the reveal binds to the anchor
  there — bound to the layer it would measure a box that no longer clips and never
  fire.

An aliased link is left alone: its `title` already answers the question a tooltip on
that anchor can answer — where the link goes — and the reveal would overwrite it
with the text it is clipping. The remainder of a clipped alias is a cell focus away.

### Secondary columns

A link in a `secondary` text column keeps the secondary size and tracking and takes
the link colour rather than the faint one. Faintness says "this qualifies the row";
the link colour says "this can be followed", and only one of those two facts is
discoverable by looking. A link nobody can see is worse than a gloss that is a shade
brighter than its neighbours.

### Empty and error states

- **Open, nothing stored.** The add control and one quiet line, "No rows yet." The
  older message — "Rows come from the layout, not this note" — is precisely wrong
  here and stays for a table with `openRows` off.
- **Open, declared rows only, nothing added.** The declared rows render with empty
  cells as before, with the add control under them.
- **A total on a `text` column.** Configuration error on this component alone: a
  text column has nothing to total.
- **A total on a `computed` column.** Configuration error naming the reason: a total
  is a value the rest of the sheet can read, and a computed column cannot publish
  one yet.
- **A total whose column holds text where a number belongs.** Not an error. `?` in
  the totals cell, with the offending row named in its title.
- **No link in a cell.** Renders as before, with no added DOM.
- **Malformed link syntax** — `[[unclosed`, `[[]]`, `[[ | ]]` — stays plain text. It
  is not a link until it parses as one, and showing a broken anchor would invite a
  click that cannot go anywhere.
- **An unresolved target.** A real anchor carrying `is-unresolved`, and it still
  opens: that is how Obsidian creates the note, and refusing the click would be the
  one place this differs from every other link in the app.
- **No `link` context** (a unit test, the harness before its stub is wired). The
  anchor paints, styled as resolved; the click does nothing. Deliberate: the markup
  is the component's business and the vault is not.
- **An embed**, `![[Portrait.png]]`, stays plain text. A row cannot hold an embedded
  image without breaking its own height.
- **A stale `skill-card` layout.** The unknown-type error names the types the layout
  may use instead, and every other component on that sheet still renders (§10).

### What it reuses

`editable.ts` for the name cell and every cell as before, unchanged — the input is
still the editor, with the same draft, commit, Escape and announcement behaviour.
`paintLevelRing` and the popover unchanged. The glyph button treatment for the
delete control. The table's own row hover for the add control. `.sheetsmith-error`
for the two new configuration errors. `.sheetsmith-table-value` for the totals.
`.internal-link` and `is-unresolved` are Obsidian's own classes, so a link takes the
user's theme rather than a colour of the plugin's (`UI.md` §1). No new panel, no new
focus treatment, no new colour, and no new gesture for the link: `PATTERNS` §6
already carries the rule — *"Real controls own their own presses… A rendered
wikilink inside a label must stay a link."* That sentence was written before there
was one.

`UI.md` §9's vocabulary table gains rows for the delete glyph, the totals row, and
the display-over-input stack.

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `openRows` | `boolean` | Characters may add rows | Adds a row control under the table. Rows a character adds are theirs to rename and delete, and no formula can name them — total a column instead. Rows declared above stay read-only and cannot be deleted from a character. |
| `columns.*.total` | `boolean` (inside the existing `columns` field) | Show a total | Sums the column under the table and publishes it as `<component id>.<column key>`, so a formula elsewhere can read it. Number, level, and toggle columns only: a computed column cannot publish a total yet. |

`openRows` defaults to false, so every existing layout keeps the table it has.
`total` defaults to false and is offered per column in the columns editor, beside
the type.

**The rename adds, removes, renames and re-describes nothing.** The only
user-facing copy it changes is the add menu entry and the default label, neither of
which is a config field. **Link rendering adds nothing either**, deliberately: a
wikilink in a cell is not a preference, it is what the file already means, and
Obsidian renders one everywhere else without asking. A per-column "render links"
switch would exist only to turn the feature off, and the argument for the off
position — *some column wants its brackets shown literally* — describes no real
sheet.

## Data and file model

### Addressing

`TableData` stops being a map keyed by row label:

```ts
interface TableRowData {
	/** The first cell's text, with the note's `\|` read back as `|`. */
	name: string;
	/** Stored cells, by lowercased column key. */
	cells: Record<string, string>;
}

interface TableData {
	/**
	 * Rows by their position in the note's table, 0 first. Read fills every
	 * position; an edit reports only the positions it touched, so a commit
	 * racing a rebuild cannot write back a stale sibling.
	 */
	rows: Record<number, Partial<TableRowData>>;
	/** Rows to append, in order. */
	added?: TableRowData[];
	/** Positions to remove, as read. */
	removed?: readonly number[];
}
```

Still a delta rather than a snapshot (`PATTERNS` §7): a cell edit reports one
position and one cell. `read` fills every position, so `write(read(body), body)` is
the same round trip the tests already drive.

`parse/table.ts` takes the same change, and it is the load-bearing one. Its
`TableUpdates`, keyed by first-cell text, is replaced by updates keyed by body row
index, plus appends, plus removals. The comment that read "where a table holds the
same key twice only the first is written" describes a hazard that ceases to exist.

The claim rule is one private helper in `components/table.ts` with two callers,
`render` and `write`, because the two must agree about which rows the character owns
or a delete control appears over a row the writer will refuse to delete.

### The pipe

Constraint 2 puts arbitrary user text in a cell whose separator is `|`. The writer
already escapes it on the way in and the splitter already keeps `\|` inside its cell
— but `read` handed the backslash back out, so the sheet showed `A \| B` in the
input and a commit escaped it a second time. Nothing noticed while a layout author
wrote the row names. The first item called "Bread \| Cheese" would.

**Escaping is the table writer's business alone.** `read` unescapes `\|` to `|`, and
the writer's "did this cell change" comparison is made on unescaped text, so the
component and the user only ever see a pipe. `[[Note\|Alias]]` is the same mechanism
and gets the same treatment: the file keeps the backslash the aliased wikilink
needs, the sheet shows and accepts `[[Note|Alias]]`. That fix is also what lets the
wikilink parser know nothing about table escaping — without it, this feature would
have had to teach it.

Nothing is rejected and nothing is sanitised. The CSB item split into three entities
on its commas (#341) has no analogue here, because the format separates on pipes and
pipes are escaped: "A Club with Notches in It, One for Each Argument You've Won, +1
Valour" stores verbatim.

### Deletion, and blank names

A removal splices exactly one line out and leaves every other byte alone. A line
ending is not renormalised; the surrounding prose is untouched (§10).

`read` stops dropping a row with a blank name cell. Name is no longer identity, so a
nameless row is an ordinary row, and dropping it made a row that is in the file
invisible on the sheet — with the first edit then writing over it. An added row is
written to the note the moment it is added, with an empty name cell for the user to
fill, which is why the case comes up at all.

### The wikilink parser

The new pure module is `src/parse/wikilink.ts`:

```ts
/** One run of a cell's text: prose, or a note reference. */
export type TextSegment =
	| { kind: 'text'; text: string }
	| { kind: 'link'; raw: string; target: string; display: string };

export function parseLinks(text: string): TextSegment[];
```

- `target` is the link path with any `#subpath` kept, because that is what
  `openLinkText` takes and what decides whether it resolves.
- `display` is the alias where the link has one, and the target otherwise —
  including the `#subpath`, matching what Obsidian shows for an unaliased heading
  link.
- `raw` is the source text of the link, and it is what makes the module's one
  invariant checkable.

**The invariant, and it earns a test even though nothing is written:**
`parseLinks(text)` rejoined by segment source is `text`, byte for byte, for every
input. It is Constraint 3's shape applied to a display path, and it is what
guarantees a cell can never silently lose a character on its way to the screen —
which is the failure mode a hand-written scanner over bracket pairs actually has.

### Layout files, character notes, existing data

- **Character notes: untouched.** No migration, and no note is rewritten by opening
  one. The two behaviour changes are listed under the model question: a
  case-differing row now fills its declared row, and a blank-named row survives
  read. Neither deletes anything, which is Constraint 4's whole requirement.
- **Layout files:** the `type` value for these components changes, and only when the
  editor next saves that layout. Nothing rewrites layouts in bulk, and a
  hand-authored one keeps working the moment its `type` is edited to `table`.
- **`label` is never touched.** Renaming a label *would* strand a note's section
  (§10), so the rename stops at the type id and the display name derived from it.
- **`styles.css`** is regenerated for the new rules only; the rename changes no
  selector and no declaration.

## Acceptance criteria

### Rows, identity and the file

- [x] Two character rows with the same name both render, both store, and
      `write(read(body), body)` returns the body byte for byte.
- [x] Editing a cell on the second of two same-named rows changes that row's line
      and leaves the first row's line untouched.
- [x] A cell containing `|` round-trips byte-identically, and the sheet's input for
      it shows one pipe and no backslash.
- [x] A cell containing `[[Note|Alias]]` round-trips byte-identically, keeping the
      file's `\|`.
- [x] A note row whose name differs from a declared row's label only in case fills
      that declared row, and the note keeps its own spelling on write.
- [x] Adding a declared row to a layout whose characters already typed a row by that
      name neither duplicates the row nor overwrites its cells; the row goes
      read-only and loses its delete control.
- [x] A row with a blank name cell renders on an open table and is preserved on
      write.
- [x] With `openRows` off, every existing test in the component's test file passes
      unchanged in behaviour: declared order, one row per declared row, single-cell
      delta, seeding on first write.

### Adding and deleting

- [x] Pressing **Add row** appends a row to the note and leaves focus in the new
      row's name field.
- [x] A character row's name is editable and commits through `editable.ts`; Escape
      restores it and announces the restore.
- [x] A claimed row renders no delete control, and a removal reported for its
      position is ignored by `write`.
- [x] Deleting a character row takes two presses; the first press writes nothing to
      the note and names the row it would delete; the second removes exactly that
      line and leaves every other byte alone.
- [x] Moving focus off an armed delete control disarms it.

### Totals

- [x] A totalled number column shows the sum under the table, treats a blank cell as
      0, and publishes it as `<id>.<key>` so a formula on another component resolves
      it.
- [x] A totalled toggle column's total is the count of the rows that are on.
- [x] A totalled column holding text where a number belongs shows `?`, publishes
      nothing, and names the offending row in the cell's title.
- [x] A formula naming a character row (`inventory.Dagger`) fails rather than
      resolving, whatever the row's capitalisation, and the card holding the formula
      shows the error in place.
- [x] `total` on a `text` column and `total` on a `computed` column each render a
      configuration error on that component alone, naming the reason.
- [x] Scrolled sideways at phone width, the totals row's label stays pinned with the
      name column and the last body row keeps a border between it and the total.

### Note references

- [x] `parseLinks` rejoined by segment source returns the input byte for byte, over
      a table of inputs including plain text, a bare link, an aliased link, a subpath
      link, two links in one string, `[[unclosed`, `[[]]`, and an embed.
- [x] `[[Sunblade|sword]]` in a text cell renders an `a.internal-link` whose text is
      `sword` and whose `href` and `data-href` are both `Sunblade`, and whose
      accessible name stays `sword` — the target rides in `title`, not `aria-label`,
      which would replace it (WCAG 2.5.3).
- [x] `[[Sunblade]]` renders an anchor reading `Sunblade`.
- [x] `[[Note#Heading]]` renders an anchor reading `Note#Heading` with the subpath
      kept in `data-href`.
- [x] Text around a link is preserved: `carried in [[Bag of Holding]] today` renders
      three nodes and reads back as that sentence.
- [x] A cell with no wikilink renders no display layer and no anchor — the same DOM
      the cell had before.
- [x] A link whose target `link.resolves()` rejects carries `is-unresolved`, and one
      it accepts does not.
- [x] Clicking an anchor calls `link.open` with the target and the event, and does
      not focus the cell's input or commit an edit.
- [x] Hovering an anchor calls `link.preview` with the target and the anchor.
- [x] With no `link` context, the anchor still renders and a click throws nothing.
- [x] Focusing the cell hides the display layer and shows the raw
      `[[Sunblade|sword]]` in the input; blurring restores the rendered link.
- [x] Committing an edited link leaves the anchor alone, so focus survives it; the
      rebuild is what repaints the layer.
- [x] The cell's width is the same focused and unfocused, so focus causes no reflow.
      Checkable in the harness at a fixed container width.
- [x] The display text and the input text share a left edge and a baseline, so focus
      does not shift the text sideways.
- [x] A claimed row's name renders its links with no input and no stack.
- [x] A wikilink in a `secondary` column takes the link colour and the secondary
      size.
- [x] The delete control and a cell's accessible name announce a linked row by its
      display text, not its raw brackets.
- [x] `sheet-view`'s focus capture and restore both count `a[href]`, and focus on an
      anchor survives a rebuild.
- [x] Editing a cell's raw text still drafts, commits, Escapes and announces exactly
      as before: every existing editing test passes unchanged.

### The rename

- [x] `getComponent('table')` returns the definition and `getComponent('skill-card')`
      returns undefined.
- [x] `grep -ri "skill.card\|skillcard" src harness docs` finds only prose recording
      the old name — this file, `SPEC` §2, §4.2 and §13, and the component's own
      header comment — and no identifier, type id, filename or class.
- [x] `componentDisplayName('table')` returns `Table`, and `layout-editor.ts`'s own
      doc-comment example names a type that still exists.
- [x] The add menu lists `Table` between `Stat group` and `Track`.
- [x] Adding a Table from the menu seeds the label `Table`, and a second one
      `Table 2`.
- [x] The rename commit changes no selector and no declaration in `styles.css`. One
      comment in `src/styles/shared.css` names the component and is renamed with it,
      so the file is not byte-identical — the check is that nothing but that comment
      differs.
- [x] No `label` value in any fixture, harness sample, or test layout changes.
- [x] A layout naming `skill-card` renders an error naming the types it may use,
      asserted on the message text in `contract.test.ts`. That every other
      component on that sheet still renders is the loop's existing `continue` and
      is read rather than asserted: the view cannot be instantiated without a
      workspace around it (§10).
- [x] Every test in the renamed test file differs from its predecessor only by
      identifier — checkable by reading the diff for any changed assertion.

### Gates and the vault

- [x] `npm test`, `npm run lint` and `npm run build` pass, and the test count does
      not fall.
- [x] The harness sample gains an open-row table with a total, and `harness:shot`
      shows it populated, empty, and misconfigured, in both themes and in the narrow
      reflow.
- [x] The harness supplies a `link` context that resolves every target except one
      deliberately missing note, so both link states are visible in `harness:shot`.
- [~] Variations of the table — pure open, declared plus open, a Blades-style load
      list — are placed in the throwaway test vault. **Their `type` still reads
      `skill-card`**: the vault is outside this repository, so updating one word
      in each layout is yours to do, and until then they render the unknown-type
      message naming `table`, which is what that message was built for.
- [~] The link in the test vault is confirmed to navigate, hover-preview, and follow
      a rename of the target note. **Placed, not confirmed**: the card, three link
      cases and two target notes are in the vault and read through the real pipeline,
      but navigating, previewing and renaming happen inside Obsidian, which is yours
      to drive.

## Commit boundaries

**As shipped, ten commits.** The plan below records what was actually made and
why it is ten rather than the fourteen first written.

Six of the fourteen were stages inside `src/components/table.ts` and its test
file — open rows without totals, totals without links, and so on. The tree only
ever held the final version, so those stages would have had to be hand-carved:
code that never ran and was never reviewed, authored purely to make a log look
incremental, with a carving error landing as a broken commit in the middle of it.
The boundaries kept are the ones the tree actually supports, and every commit is
code that ran.

**The rename landed second rather than last**, reversing the order the three
plans named. Their argument was that the other work is written against
`skill-card.ts` and a rename interleaved with it makes each commit a diff against
a file that no longer exists under that name. Splitting a tree that is *already*
renamed inverts that exactly. Landing it early against the small fixed-row
component makes it the most reviewable diff in the series — a pure identifier
substitution from `HEAD`, 68 lines each way, no assertion changed — and lets the
rest of the log read in the vocabulary the feature ends in.

1. `fix: Name the components a layout may use when one is unknown`. The `UI.md`
   §12 backlog row, using `listComponentTypes()`, so the rename's one failure mode
   is legible before it arrives. Closes that row.
2. `refactor: Rename the Skill card component to Table`. The type id, the file, the
   exported symbols, the test file, the registry line's position, the harness
   sample's type, the editor's doc-comment example, and the one comment in
   `shared.css`. 812 tests pass unchanged either side of it.
3. `refactor: Ask one place whether a formula can name something`. `isName` out of
   the expression parser, replacing the layout parser's copy, before a third was
   written for a totalled column.
4. `refactor: Extract the truncation reveal from the stat card`. `src/ui/truncation.ts`
   and its tests over faked metrics.
5. `feat: Parse a cell's wikilinks into segments`. `src/parse/wikilink.ts` and the
   rejoin invariant. Nothing consumes it yet.
6. `feat: Give a component a way to resolve and open a note reference`.
   `LinkContext`, `RenderContext.link`, the view supplying it from `app`,
   `registerHoverLinkSource`, `hoverParent`, and `FOCUSABLE` gaining `a[href]`.
   Still nothing renders one.
7. `feat: Open a Table's rows, total its columns, and draw its links`. The
   entangled component work in one commit: the pipe fix, row addressing by
   position, open rows, the delete control, `column-types.ts`, totals, the display
   layer, the styles, and the eslint allowlist for `setIcon`. 832 → 921 tests.
8. `fix: Calibrate the harness against a stylesheet it can actually read`. Found on
   the way and unrelated to the feature: a semicolon inside a quoted `data:` URL
   made the generated calibration an unterminated string, so every rule after its
   eleventh line was dead and the shots had been reviewed against the fallback.
9. `feat: Show a Table's open rows, totals and links in the harness`. The sample,
   the faked link context, and the link variables in `theme.css`.
10. `docs: Record the Table name, open rows, totals, and note references`. `SPEC`
    §2, §4.1, §4.2, §12 and §13's naming entry moved to `Resolved:`, `UI.md` §9 and
    §12, `PATTERNS` §11, and this file.

## Found while building

Platform facts that only surfaced against the real app, recorded because the
reasoning is not visible in the code that came out of them.

- **`registerHoverLinkSource` is required.** The view emitted `hover-link` with its
  own view type as `source` and never registered that source, so Page preview had no
  entry for Sheetsmith and no reason to treat the event as one it knows. Registered
  in `onload` beside `registerView`, with `defaultMod: false` so a plain hover
  previews as this spec describes — and the settings entry is what lets a user
  require the Mod key instead, which a table dense with links may well want.
- **`hoverParent` has an interface, and the view did not implement it.** Only
  `MarkdownView` declares `hoverPopover`; a `TextFileView` handing itself to the
  event was promising a `HoverParent` it was not.
- **`.internal-link` on its own does nothing, which is the reported bug's second
  half.** Every `.internal-link` rule in `app.css` is scoped to `.markdown-rendered`
  or `.metadata-property-value`, and the editor's unresolved marker to
  `.markdown-source-view.mod-cm6` — a `.is-unresolved` *span*, not an anchor. A sheet
  is none of those containers, so a cell's anchor picks up only the bare `a` rule:
  link colour, underline, pointer, and nothing that says the note is missing.
  `styles.css` carries those declarations, from the same documented variables, with a
  fallback on the two that carry the meaning — an undefined custom property makes
  `color` invalid at computed-value time, which computes to `inherit`, and a link
  painted in the cell's own text colour reads as plain text.
- **The classes are not documented; the variables are.** `--link-unresolved-*` are in
  the CSS variables reference, so painting through them is sanctioned.
  `internal-link` and `is-unresolved` appear nowhere in the API docs — they are what
  Obsidian's own markup uses and what every plugin doing this copies, and there is no
  official API for rendering an internal link at all. If those class names ever move,
  the link loses its colour and keeps working.
- **The manual handlers are not a shortcut.** `MarkdownRenderer.render` produces the
  same markup and *still* leaves a custom view to attach its own click and hover
  handlers, so the handlers here are what the official route also requires.

## Deliberately not doing

- **Reordering rows.** No arrows, no sort criteria. The note is the order, and
  Obsidian already ships an editor for moving a line. CSB offers all three modes and
  its manual one was reported "crazy wonky" (#366); a sort criterion is a display
  preference that then argues with the file about where a row lives. Appending at the
  end is insertion order, which is the mode nobody filed against.
- **Publishing a row by name.** Argued above. `<id>.<name>` stays a declared-row
  mechanism, and §13's question about how a declared row publishes stays open.
- **A total over a computed column.** A configuration error, for the reason in the
  model question, and it lifts when §13's publication question is settled.
- **A better message for a formula naming a row that does not exist.** Today
  `inventory.Dagger` fails as `Unknown name "inventory.Dagger"`. Saying "`inventory`
  has no value called `Dagger`" needs the sheet's `Scope` to carry a reason rather
  than `undefined`, which is a formula-engine change with a type-shape decision in it
  and it improves every component at once. It is a feature of its own. What tells the
  author what to write instead is the `openRows` description and the total's
  existence.
- **A reset binding.** A Blades load list wants "clear every checked item at the next
  score", which is `applyReset` on this component. Reset is a layer across components
  (§12) and this block holds no state until it does; adding it here would be
  designing that binding against one game.
- **Nested rows, containers, items inside items.** Evidence is one unanswered CSB
  request and one hobbyist system.
- **One note per row, and the `link` column type.** Still parked, and §12 still owns
  it. A column whose value is always a note, with a picker and a resolved state as
  data, is a different feature from rendering text that already round-trips; in
  Obsidian it buys nesting and costs PDF export.
- **A second palette entry named "Inventory".** Argued above: the same type with a
  different default config, and a layout-editor concern rather than a component.
- **Any markdown but wikilinks.** No emphasis, no code spans, no external
  `[text](url)`. The segment list is shaped to take them later; adding them now means
  either a second syntax scanner per feature or `MarkdownRenderer`. Blades'
  italic-items rule is the known case waiting on this.
- **Embeds.** `![[Portrait.png]]` stays plain text.
- **A link context menu.** Right-click and long-press get the browser's default, not
  Obsidian's file menu. A second gesture on the same target, and not what was
  reported.
- **Middle-click to open in a new tab.** Obsidian's own internal links answer
  `auxclick`; these answer `click` only. A mod-click already covers "somewhere else".
- **`target="_blank" rel="noopener"` on the anchor.** Obsidian's rendered links carry
  them and the community renderers copy them, but the press here is always answered
  by `openLinkText` and the default prevented, so they would only matter if that
  handler failed — and then they would ask Electron to open a window for a link path
  that is not a URL. Left off deliberately.
- **A per-column switch to turn link rendering off.** Argued above under config
  fields.
- **Links in computed cells, in the layout editor's fields, or in other components.**
  A formula produces a value rather than markup; an editor's raw text is the thing
  being edited. Rich text is the obvious next consumer and is not built — when it
  arrives it is the second consumer of the painter, which is when the painter moves
  out of the component and into `src/ui/`, per `PATTERNS` §1 and not before.
- **A `skill-card` alias, or a display-name member on the contract.** Argued above:
  dead weight with nothing released, and two sources of truth that disagree where a
  user can see it.
- **Touching any component `label`.** A label is a note's section heading, so changing
  one strands character data (§10). The rename stops at the type.
- **Renaming `src/parse/table.ts`, its exports, or any CSS class.** They had the table
  vocabulary first, and the folder is what disambiguates. The classes already say
  `table`.
- **Renaming the other components.** Stat, Stat group, Pool and Track are already
  named for what they are on the page; this makes the catalog consistent rather than
  starting a sweep.
- **A layout-file migration tool.** Nothing to migrate. Editing one word is the
  migration.
