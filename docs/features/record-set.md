# Record set

Status: shipped
Board card: ✨ A component holding many records, where a record carries prose too long
for a cell, opens to show it, and may push modifiers that apply only while it is
active — a spellbook, a features and traits list, a feats list, an abilities list.

## Model question

This feature exists to answer one §13-shaped question, and the question is the
catalog's own: **is a collection of rich records a new catalog entry, or Table with
more config?** It was settled with the owner before this document existed. What is
written here is the argument, in enough detail that `/land-it` can lift a `Resolved:`
entry out of it. **Nothing is resolved until it is built, so §13 is not edited here.**

### The answer

**A new component, whose storage is one `###` record per record.** The record's
heading is its name, its scalars sit in a fenced block under the heading, and its
prose is the body — the same shape Rich text already has, one level down. Record
identity is position among the `###` blocks, which is the same position rule Table
already uses for rows.

### Why the catalog grows, when it has refused to five times

§13 has asked the "is this a new type" question five times and answered "no new type"
five times: Abilities became Stat group, Skill card became Table, Toggle folded into
Track, Field folded into Card, and the five remaining blocks resolved into three
palette entries and two layout patterns. The test each of those was put to is §12's:
**name in one sentence what this has that a Table does not.**

Most of this feature is already built, and two of the three claimed gaps are narrower
than they look.

**Table already covers more than the question assumes.** It has open rows, typed
columns (`text`, `number`, `level`, `toggle`, `computed`, `modifier`), per-row formula
scope through a row's `values`, a published declared row through `publish` plus a row
`key`, a column `total`, `scopeRows` feeding `sum()` and `count()`, and a `modifier`
column whose cell carries `;`-separated parts.

**"Modifiers that apply only while the record is active" is already shipped, and the
claim was checked rather than repeated.** A typed modifier part takes a ` when <cond>`
clause; `formula/modifier-definitions.ts` parses it for a named part and a typed part
alike and evaluates it **in the row's own scope**, before the amount, reading it for
truth rather than for a number — a `false`, a `0` and an empty string are all false.
§5 already says a `toggle` cell is `true` to a formula. So
`armour_class += 1 as item when Worn`, against a `Worn` toggle column on the same row,
is today's spelling and works today. Nothing in this feature adds it; what this
feature does is give that row a body.

**Wikilinks in a row name are already links.** §4.2: a `[[Sunblade|sword]]` in a row
name or a `text` cell renders as a link, takes the theme's link colour, goes faint
where the note does not exist, opens on a press, opens in a new tab on a mod-press,
and offers hover preview.

**One sentence survives the test: a record has a body, and a markdown table row has
nowhere to keep one.** That is the whole of the gap, and it is enough.

### Why that sentence wins where the other five lost

**Every one of the five folds held storage constant.** Toggle→Track and Field→Card
stayed inside the same fenced block; Skill card→Table stayed inside the same markdown
table; the five blocks were prefilled configuration by construction, so no file
changed shape at all. **This one cannot hold storage constant.** §4.1 fixes `storage`
by type and never by user choice, and a body per record is not something a markdown
table row can hold: `|` splits a cell and a newline ends the row. A fold that has to
change the file format is not a fold.

### The three rejected alternatives

**1. A `prose` column type with the cell escaped inline.** Dead on arrival. `|` and
newlines are CSB issue 341 one layer up — "A Club with Notches in It, One for Each
Argument You've Won, +1 Valour" parsed as three entities — and escaping puts plugin
syntax into a file the user owns, which Rich text refused in writing when it declined
to escape `## `.

**2. Table gains a per-row body stored beside the table in the same section.**
Rejected on keying. §13 settled that a row is identified by its position in the note's
table and never by the text of its first cell; a body stored in a second block needs
an identity rows do not have, and a mismatch is exactly the "prose leaks into the next
record" trap (CSB 420) in structural form. It also claims the prose that §10 currently
promises to preserve and leave alone around a table.

**3. No new anything — the record is a vault note reached by the wikilink a Table row
already holds.** Considered seriously and rejected. It is the option Obsidian's own
model favours, four of the nine surveyed tools make the record a document beside it,
and this repository already chose reference over copy for modifier definitions — so
the precedent cuts this way. It loses on three counts. A two-line homebrew feat does not deserve a note and would have
nowhere to put its prose. The prose stops travelling with the character note, so a
character stops being one file. And the disclosure surface, the narrow-width case and
the print case all become Obsidian's answers rather than this spec's.

**What blunts the objection is that the two models coexist and neither is taken
away.** A record's name is plain markdown, so a record whose text really does deserve
a note is a record whose *name* is a wikilink, with the sheet-side record holding the
uses counter and the modifier and the note holding the prose. What this feature adds
is the case where a note would be overhead, which is most of them.

### The honest cost, stated rather than hidden

**The catalog gains a second repeatable-records component**, so an author looking for
"a list of things" now meets two entries and has to know that one of them is for
things with bodies. And **an author who outgrows a Table has a migration**: a features
list built as a Table of rows becomes a Record set of records, which is a different
section shape in every character note on that layout, and §10 offers no automatic
migration for it — the old `## Features` table stays in the note, unrendered and
untouched, while the new component writes a section under a different label. That is
data safety working, and it is also two sections in the file until somebody tidies up.
The palette makes it worse before it makes it better, which is why the **Features**
entry *moves* off Table rather than being added beside it (Design).

### What the contract does not have to grow

Nothing. The component implements the five required members plus `scopeRows`,
`scopeModifiers`, `applyReset`, `sample` and `palette`, all of which exist. Registering
it is one line in `src/components/index.ts` and touches neither the renderer, the
parser, nor the layout editor — which is the claim CLAUDE.md makes about the contract,
and this is the first component built since containers that can test it.

Two additions sit *outside* the contract and are named so they are not smuggled in as
"nothing changed": one `parse/` module for splitting a section into records, and one
pair of `RenderContext` members for the view-held open set (Design).

### What it publishes

**No names at all.** Every record is the character's, and §4.2's rule is a fact about
the contract rather than about Table: `<id>.<name>` is a fixed-row mechanism, and a
name a formula can write has to be knowable when the formula is written. So there is
no `scopeValues`, and `spells.Fireball` fails as an unknown name exactly as
`inventory.Dagger` does.

What it publishes instead is the two members that need no names. **`scopeRows`**, so
`count(spells, Prepared)`, `sum(features, Uses)` and `count(feats)` are arithmetic the
layout writes — each record is a row whose label is its heading and whose names are
its fields. And **`scopeModifiers`**, so a record pushes at names it has never heard
of, which is the second half of the job.

A layout wanting a number under a name puts a Computed or a Card beside the list
reading `count(spells, Prepared)`, which is the same indirection §4.2 already records
for a column `total` and a Pool's `max`.

### What it stores, and Constraints 2 and 3

Both are satisfied by construction, and the construction is worth stating here because
it is what chose the field types.

**Constraint 2 — no wikilink inside a fence — is satisfied by the field types *and* by
one refusal, and the second half is a correction to this paragraph rather than an
addition to it.** As written it claimed the types were the whole of it, and they are
not: a `modifier` field's part is free text on three routes — the shared form's
**Amount** and **Only when** inputs, and a promoted definition's name, whose only
refusals are a semicolon and an assignment shape — so `armour_class += [[Ring]]` was an
acceptable part and this component's fence is where it landed. **Table has the same free
text and does not have this problem**, which is why the claim read as safe: a modifier
cell there is a markdown table *cell*, where a link is indexed, and this is the first
component to put a modifier part inside a fence. So a part holding a note reference is
**declined at the commit**, with the message naming the record's name or its body as
the place for one — refused rather than escaped, on Rich text's rule, and at the commit
rather than in `read`, so a note that already holds one is rendered and carried rather
than corrected (§10). Criterion 6's scan over the offered types proves `text` is
refused and does not reach this, which is why it needed its own case.

**The types themselves, which is the half that was right.** The fields are `number`, `toggle`, `level`,
`computed` and `modifier`. A `text` field is **refused** as a configuration error, and
the refusal is not a cut: §5's language has no strings, so a text field could publish
nothing, be compared to nothing and be handed to no builtin — it could only be
display, and display words are what the record's body is for, where they hold links
freely. That is §4.1's own argument for Rich text publishing nothing, applied to a
field instead of a component. The link-bearing halves of a record — its heading and
its prose — are plain markdown, so backlinks, graph view, hover preview and rename
propagation all work, which is the whole reason §3.1 splits storage the way it does.
A `modifier` field's cell holds names and assignments rather than links, which §4.2
already establishes for the column of the same type.

**Constraint 3 — parse then serialise is byte-identical — is satisfied per record,
the way it is already satisfied per part of a modifier cell.** A section is read as a
preamble (anything before the first `### ` line) plus one block per `###` heading;
each block keeps its heading line verbatim and its own leading and trailing whitespace
runs through `parse/markdown-body.ts`, and the fence inside it keeps its own spelling
through `parse/fenced.ts`, which already "touches only the lines whose value actually
changed". A write re-joins the pieces with the exact separators it read. So editing
one record's uses counter reformats nothing about its neighbours, and a hand-written
section survives being opened.

### What happens to existing character notes

Nothing, and the reason is that nothing has ever written a section of this shape.
§10's rules cover the rest: a section the layout no longer maps stays and stops
rendering; a record whose field the layout dropped keeps its entry in the fence
untouched; a record the reader added is never the layout's to remove. **A layout
change never deletes a record** — there are no declared records, so there is no rule
that could.

---

## What it does

A **Record set** holds a list of records the character adds. Each record has a name,
a few typed fields, and a body of markdown prose. The names and fields are always on
screen; a press on a record's chevron opens its body under it, inside the component's
own box, so nothing else on the sheet moves. A record may carry a `modifier` field, so
a feature that is switched on changes an armour class the record has never heard of,
and a ` when ` clause means it does so only while its own toggle is set.

It covers a spellbook, a features and traits list, a feats list and an abilities list.

---

## Design

### The unit is a **Record**, and §2 gains the word

The component is **Record set**, on Card set's own shape: several of one thing under
one heading. The unit is a **Record**: a name, its fields, and its body.

**One word has to be freed for it.** §2 currently defines **Row** as "one record in a
Table", and §4.2's Table entry opens "Repeatable typed records" — both use *record*
loosely for a Table row. Those two become "one line in a Table" and "repeatable typed
rows", which is a precision gain rather than a rename: Table's own unit has been
called a **Row** since the position rule was settled, and nothing else in the catalog
is affected. The names that were already load-bearing when the card pair was renamed —
Panel, Entry, Number, Row, Grid — are each still load-bearing and none of them is
this. **Record** was not among them.

### What the reader sees

A label, and under it a box that is the placement: `height` grid rows tall whatever is
in it, with the list scrolling inside. That is `.sheetsmith-placed` / `-placed-box`,
Rich text's and Image's box, and it is the load-bearing decision the disclosure rests
on (below).

Inside the box, one **summary line** per record:

```
▸  Second Wind          Uses 1 / 3    ⚡
▸  Action Surge         Uses 1 / 3
▾  Fireball             Level 3       ✓ Prepared
   A bright streak flashes to a point you choose, then blossoms with a low
   roar into an explosion of flame. Each creature in a 20-foot-radius sphere
   must make a Dexterity saving throw.
▸  Shield               Level 1
   + Add spell
```

A summary line is: the disclosure chevron, the record's name, then its fields in the
order the layout declared them. **There is no heading strip over the fields**, and
that is a decision rather than an omission. Two reasons. A heading row would claim a
tabular reading of a thing that is deliberately not a table, which is the one
confusion this component's model question exists to end. And a record's fields are few
by design — anything wordy is body — so a name per field is cheaper than a header that
has to stay aligned over rows whose heights differ. Each control carries its field's
name in its accessible name and its `title` on the level ring's own
`${field}: ${state}` shape, and a `number` field draws its name beside it in the
shared secondary-text clothes (`.sheetsmith-card-abbreviation`: a size down, tracked,
faint, at full contrast on hover or focus). A `toggle` and a `level` draw the ring
alone, which is exactly what `hideHeading` exists for on a column.

**A `number` field with a declared `max` draws its ceiling too, and the first
version of this section left that unsaid.** `Uses 1` cannot tell a reader whether
that is all of them or one of three, which undercuts the single capability the
reset section below claims for this component — a uses counter on a record the
character added, which a Track or a Pool beside the list could never provide. So a
bounded field reads `Uses 1 / 3` and an unbounded one keeps its bare value; a `min`
alone changes nothing, since a floor is not a ceiling to read against. **In Pool's
own vocabulary and not a second spelling of it**: `.sheetsmith-pool-ceiling`, a
`-separator` holding the `/`, and `.sheetsmith-pool-max` — the classes borrowed as
this field's name already borrows the card's abbreviation, because a
`.sheetsmith-record-ceiling` beside the pool's is the lookalike `docs/UI.md` §9
opens by forbidding. Pool's **non-`characterMax`** branch, because a record's `max`
is a literal the layout declared rather than a number the character holds: a
read-only span, no second field, nothing to type into. One declaration is
overridden, the size — a pool's ceiling qualifies a headline number and a record's
qualifies a 13px one, so the shared `--font-ui-medium` would draw the ceiling
larger than the value it bounds. And since a bare span is `role=generic`, which
prohibits naming, what carries the ceiling to a screen reader is the
announcement, on Pool's own spelling: "Uses 5 of 9".

### The disclosure: inline, pushing its siblings, inside a box that does not grow

**It pushes its siblings; it does not overlay them.** Trap 1 asks the spec to pick one
and say which, and the prior art picks it for us: the Roll20 report is that expanded
content "overlaps the +Add and Modify controls on the repeating section, and/or is
buried under the z-order of subsequent repeating items", and what the reporter
actually wanted was "the entire repeating list to 'drop-down' underneath any
particular show textarea so things are readable and the repeating list controls are
still usable". That is the push version, described by somebody who had the overlay
version.

**And the push is safe here because the component's box is the placement.** SPEC §8
forbids a component ceasing to fill its placement, and UI §9 forbids a box sized by
its content — that is why the collapse came off Group. Neither is reached: the box is
`--sheetsmith-rows × --sheetsmith-grid-row` tall whatever is open, the list scrolls
inside it, and opening a record moves the records below it *within the scrollport* and
nothing at all on the sheet. This is Tab set's no-shift guarantee bought a different
way: there, every alternative is the same box; here, the box is fixed and the content
inside it is free.

**A body inside the scrollport may be as tall as it is**, and that is not a violation
of "never sized by its content" — that rule is about the *component's* box, which is
the placement. Stated because a reviewer will otherwise raise it.

**The three surfaces this is not**, each closed for a reason rather than a preference.
A **modal** is unavailable: `ConfirmModal` and every other `Modal` takes an `App`, and
`RenderContext` carries no route to one, which §4.2 and UI §9 both record. A
**drawer** or any second floating regime is refused on UI §9's opening sentence — a
fourth kind of panel beside a row of cards reads as loose chrome — and the plugin's
one floating surface, `ui/anchored-panel.ts`, is already recorded in UI §12 as the
largest thing this plugin draws, capped near 500px and scrolling inside a table that
also scrolls. A body of prose is the worst possible content for it. And **a second
editor pane** is what §4.2 rejected on principle for Rich text.

**Several records may be open at once, and there is no expand-all.** One-at-a-time
would be cheaper state, and it loses to the finding this design has to survive:
Nielsen Norman's, that hiding content "diminishes people's awareness of it" and that
"it is easier to scroll down the page than to decide which heading to click on". With
several open the flat reading is available on demand, which is the mitigation; with
one open it is unreachable at any price. What is *not* offered is a control that opens
forty bodies at once, because its outcome is off-screen the instant it fires, which is
§12's rule about a control whose input is not its outcome.

**What answers the press is a chevron button, not the row.** A record's name is a
field — it edits on the shared rules and its wikilinks are live — so a press on the
row cannot mean both "put a caret here" and "open this". One control with two jobs is
the defect the modifier cell was corrected for. So the chevron is a glyph-only
`<button>` on UI §9's rule, with Obsidian's button chrome stripped, carrying
`aria-expanded` and `aria-controls`, opening on a press and on Enter or Space alike.
It takes the level ring's size token, so it measures the same as the marks in the same
row under the same finger.

**Nothing is open on first render.** A tab set opens its first tab because a tab set
showing nothing is a hole; a record set showing every name and no body is showing its
reading. The names and every field stay visible in both states, which is what keeps
the disclosure from hiding the thing a reader is scanning for.

### Where the open set lives

**In the view, on `activeTab`'s terms, and not in the note.** The sheet re-renders on
every committed edit, so closure state is gone by the first keystroke; and Obsidian
keeps fold out of markdown for the reason §13 already gives — a reader's posture is
not the character's data.

So `RenderContext` gains `openRecords?: readonly number[]` and
`onToggleRecord?: (index: number, open: boolean) => void`, and `SheetView` holds a
`Map` keyed by component id, cleared on a file change. **They are a second pair rather
than a generalisation of `activeTab`**, and the reason is PATTERNS §1 read exactly as
`types.ts` states it: a second consumer earns a generalisation only where it wants the
*same* thing, and an index into alternatives and a set of open records are two shapes.
What this does earn is the observation that view-held reader posture is now a
category, which belongs in the type's own comment.

The set is keyed by position, like everything else about a record, so a delete shifts
it and a set pointing past the end is clamped — which is `activeTab`'s own rule and the
same three lines PATTERNS §11 already records as untested until a `SheetView` a test
can render exists. That row grows by this component rather than being answered by it.

### Find-in-page, which Tab set could not have

**A closed body is `hidden="until-found"`, so find-in-page reaches it and opens it.**
This is the one place this component can do what §8 records as the price of Tab set's
guarantee, and the reason it can is precisely the difference between the two: that
spelling runs on `content-visibility: hidden`, which removes the content from layout,
and a panel contributing no height is a panel that changes its container's size. A
*record body* contributing no height changes nothing, because the box is fixed and the
list scrolls. So the trade Tab set had to take is not on the table here, and trap 8 —
a disclosure taking its content out of find-in-page and the accessibility tree
together — is answered rather than accepted.

The `beforematch` event sets the open state, so a body the browser revealed is a body
the component agrees is open. happy-dom implements neither, so the tests assert the
attribute and the listener and the harness cannot photograph it, which is the same
bargain `visibility`/`inert` took in `tab-set.md`.

**And the half that never needed it**: a record's name and its fields are never
hidden, so find-in-page always finds "Fireball" whatever is open.

### Narrow width

Nothing special, and that is the point of the box. At one column the component has the
whole pane, the box is still `height` grid rows, the summary lines wrap their fields
under the name on the sheet's own reflow rules, and a body opens inside the same
scrollport. There is no second regime to design, because the disclosure never leaves
the component's placement — which is exactly what a modal, a drawer or an overlay
would each have owed a phone answer for.

The one measurement that has to be looked at rather than asserted: a summary line at
380px holding a name, a number field with its label, a ring and a glyph is four things
in a column roughly 348px wide, and UI §12 records that nothing below a 500px viewport
has ever been photographed. So this is a look criterion at 520px and a read at 380px,
stated as such.

### Print

**There is no print stylesheet, in this component or anywhere in the plugin, and the
answer to "how do I print my spellbook" is the note.** Obsidian's own export renders
the markdown, and the markdown is the whole content: one `###` heading per record, its
fence, and its prose, with nothing collapsed because nothing in a file is collapsed.
So the disclosure costs the print case nothing, and this is the second argument the
`###` storage buys that a note-per-record and an escaped cell both lose. What prints
imperfectly is the fenced block, which prints as a small code block — true of every
fenced component on the sheet today, and a pre-existing question rather than this
component's.

### Editing a record

Every gesture on this component already exists somewhere, which is the strongest
evidence for the model answer.

- **The name** is a field over a rendered layer in one grid cell, the stacked
  arrangement UI §9 names, with `linked-text.ts` painting its wikilinks and
  `RenderContext.link` resolving, opening and previewing them. Editing shows the raw
  `[[Sunblade|sword]]`, as in a cell.
- **A `number` field** is a value field on `editable.ts`'s rules: live display,
  committed on blur or Enter, arrow keys stepping, Escape restoring and announcing.
  Where it declares a `max` the ceiling is drawn after it, read-only, and every
  announcement the field makes carries it — a commit, a restore, and the message a
  value held to its bounds earns.
- **A `toggle` and a `level`** draw through `paintLevelRing` — one painter, checked by
  the registry contract, so a card and a cell and a record cannot measure differently
  under one finger. **Its naming departs from Table's on one clause, and the heading
  strip is why**: Table and Track set a `title` only for a *named level*, because a
  cell's field is already named by its `<th>` and only the level's word is missing
  there. A record has no `<th>`. So the tooltip names the *field* on every ring, a
  named level adds its own word, and **a long press is bound on every ring** rather
  than on Table's named-level predicate — a `title` is a pointer's route, UI §7
  forbids a hover-only affordance, and every ring that ships on the sample sheet is a
  toggle, so the narrow guard would have left the shipping case with no route at all.
  It is the shape the `computed` field already has: hover reveals, a tap opens the
  same text.
- **A `number` field's own name is one variable darker than the shared abbreviation
  clothes it otherwise wears.** `.sheetsmith-card-abbreviation` is `--text-faint`,
  measured at 2.20:1 light and 2.74:1 dark at the 10.2px it already is — which costs
  a Card set nothing, because "STR" restates "STRENGTH" directly above it. Here,
  correctly and by the no-heading-strip decision, "Uses" is the *only* place a
  sighted reader meets the field's name, and under it they see a bare number. The
  size and the tracking stay, so it is still visibly secondary.
  **Which makes a bounded field's line three tokens rather than two, and it is two
  weights and not three**: the name is `--text-muted` at 10.2px tracked, the value
  `--text-normal` at 13px, the ceiling `--text-muted` at 13px with tabular figures.
  Both qualifiers sit at one contrast and the value is the only thing at full
  contrast between them, which is the intended emphasis — the value is what changes,
  the name and the ceiling say what it is and what it is out of.
- **A `computed` field** is read-only, hovering reveals its formula and a tap opens
  the same text through the shared popover — a `title` is a pointer's route and not a
  finger's, and UI §7 forbids a hover-only affordance, so the *failure explanation*
  has to be reachable without a hover too.
  ~~and a number something has been pushed at carries the dotted mark and the shared
  breakdown~~ — **struck.** Every field refuses `publish` and the component declares
  no `scopeValues`, so no record's computed value is a name a modifier can be pushed
  at; `modifier-breakdown.ts`'s own rule is that the mark and the text are the same
  fact, so a mark there would promise an answer that cannot exist. `docs/UI.md`'s row
  for a modified number correctly gains no consumer here.
- **A `modifier` field** is one glyph per record — `zap`, `zap-off`, or a faint `plus`
  on an empty cell — opening `ui/anchored-panel.ts` with `renderModifierForm` inside
  it. **That module is reused whole**, which is worth naming: it takes its label,
  parts, outcomes, definitions, targets, bonus types, `setIcon`, and its commit,
  promote, announce and resize callbacks as arguments, so it knows nothing about
  Table. PATTERNS §2 admitted it as a one-consumer sibling on the *atomicity*
  argument; a second consumer is the reuse argument arriving afterwards, and the
  header's claim that it knows the shape of a modifier and none of its meaning is what
  gets tested by this.
- **The body** is Rich text's box gesture, with Rich text's three stated departures:
  the rendered layer is hidden rather than left transparent, the caret is not placed
  from the click, and the two layers scroll separately. `renderMarkdown` draws it where
  there is an app and `paintParagraphs` where there is not.
- **Add** is a control in the last position of the list, reading as the next record
  rather than as chrome beside it — and wearing `.sheetsmith-table-add`'s own
  *treatment* and not merely its vocabulary: a rule across the top and a centred
  label, which is what Table renders and what UI §9's shared row now names. The two
  had drifted before the first release, with only Table's reading as pressable. The press
  writes the record and focus lands in its name field, **selected**, because the name
  it wrote is a placeholder the reader is expected to type over — and it writes
  `recordName` rather than nothing, which follows from the storage: `### ` with no
  text after it is not a heading, so a nameless record would not survive its own
  first read.
- **A blank name is the third declined write**, beside the body's two reserved line
  starts and for the same reason read one level in. Emptying a record's name would
  drop the record on the next read and hand its body to the record above it, which is
  a silent deletion rather than an edit (Constraint 4). The field puts the stored name
  back and says which one it kept. The draft is *not* held here, which is the opposite
  of the body's rule and deliberate: the only refusal a one-line field has is a blank
  one, so keeping the draft means keeping an empty field on screen
  (`docs/PATTERNS.md` §11 holds the note).
- **Delete** is a trash glyph per record that **arms, then commits** — the first press
  takes a warning tint, marks its record and names it; the second applies it; the next
  press anywhere, Escape, or focus leaving stands it down.
- **Reordering is not offered.** The note is the order, and Obsidian already ships an
  editor for moving a line. Table's rule, unchanged.

### Reserved syntax, and the write that is declined

A record's body has two reserved line starts, and both are the note format's rather
than this component's taste.

- **`## ` at the start of a line** splits the *note*, per §3.1. Already Rich text's
  rule, reached through `startsSection`.
- **`### ` at the start of a line** splits the *record*, because that is how this
  component finds its records. The split does not track fences, exactly as
  `parseCharacter` does not track fences for `## `, so one rule reads the same way at
  both levels.

**Neither is escaped and neither fails `read`.** The *write* is declined, the field
keeps the draft, and the message names the line and the fix (`use "#### " instead`),
which is the third answer Rich text arrived at after byte survival turned out not to
be the part that matters. The refused state undoes the transparent-field treatment the
same way `.sheetsmith-rich-text-refused` does, so what is on screen is the text the
message is about.

### Failure, per record rather than per section

**A record whose fence will not read is drawn as a record with a problem line under
its name, and every other record keeps working.** This is a departure from Table,
which refuses a whole section it cannot read, and the reason is that the unit of
failure here can be smaller: a section holding forty spells must not be blanked by one
hand-typed colon, and §5's "one failure must not take the sheet down" is the same rule
one level in. The unreadable record's bytes survive every write of its neighbours,
which the per-record framing already guarantees.

`read` therefore fails for one case only: a configuration this component refuses,
reported before anything is parsed, which is Table's own shape.

**Configuration errors**, each on that component alone and each naming its fix:

- a `text` field ("prose belongs in the record's body") — **which is also what a field
  with no type at all is**, since the shared columns field omits its own default from
  the file and that default is `text`. The message names every type this component
  does offer, and the field is now parameterised so the type is never absent here in
  the first place (below);
- a field with no key, naming a key as the fix: a fence entry is `key: value`, so a
  field with nothing to the left of the colon could not be stored at all;
- a field key holding a colon or a line break, which cannot be stored in a fence
  (Card's rule);
- a `level` field with fewer than two names, since the first name is what "none" is
  called and a single name describes a field with no level to reach;
- two fields sharing a key;
- a field declaring `publish`, which means nothing where no record is declared;
- a `total` on any field — refused outright, with `sum(<id>, <expression>)` named as
  the fix, since a record set draws no totals row for one to sit in;
- a `level` field with a mark and no name (the level rule, unchanged);
- a `min` above a `max`.

**The empty state is not an error.** No records is a list with its **Add** control and
nothing else, which is what a new character looks like. §10: a section without a data
block is empty, not malformed.

### Uses counters, and the reset

**A per-record uses counter is a `number` field with a `max`, the field draws that
ceiling beside its value, and the reset reaches it through the component's own
`applyReset`.** That is the answer the evidence asks for —
CSB 353 and hay-kot 7 both attach the counter to the record, and Sandbox binds `Uses`
and `Rechargeable` to its Consumable type — and it is what a separate Track or Pool
beside the list could never do, because a character-added record has no
layout-declared component to count with.

The binding is §6's, unchanged. `empty` sets every `number` field to 0 and every
`toggle` to no. `full` sets every `number` field to its declared `max` and every
`toggle` to yes, and **fails naming the field** where a `number` field declares no
`max` — which is a Pool's unresolvable `to` reported the way `ResetResult` already
carries it, and a trigger that applies what it can and names what it could not.

**A third action, `formula`, which this section did not name and the editor offers
anyway.** It writes the resolved number into every `number` field, held to that
field's own bounds, and **derives each `toggle` from that number** — `value >= 1` —
which is `track.ts`'s rule for a flag card and the correction the first build
needed: setting the flag true unconditionally made `to: '0'` write zero into every
counter *and turn every toggle on*, a write the reader did not ask for in the one
action whose whole job is to say what the value should be. Derived, `formula` is a
generalisation of the other two rather than a third rule: `to: '0'` is `empty` and
`to: '3'` is `full` on a field with that ceiling. It has two failures rather than
one, also Track's shape — a formula that would not resolve at all, reported through
`explain`, and one that resolved to something that is not a number, which names
what it produced — because the fixes differ and reporting the second as "its reset
formula is empty" sends the author looking at a formula that is right there.

**A `level` field is left alone by every action**, which §6's own vocabulary
decides: `full` and `empty` are named for a number and a two-state flag, and a
graded level's "full" is a ladder position rather than a ceiling the layout stated.
It is not in the delta at all, so the note's own entry is never rewritten.

The two shapes this covers are the two that occur: a `Used` toggle cleared on a rest,
and a `Uses` number restored to its ceiling. What it does not cover is a ceiling that
differs per record, since `max` is a literal on the field and not a formula — a record
whose uses are its own is two number fields and a reader who edits one. Named as a
cost rather than fixed, because making `max` a formula field means resolving it in the
record's scope inside `applyReset`, which is a second failure path on a control that
already has one.

### The layout editor

**One parameter changes in it, and this section's "nothing changes" was wrong for one
reason it did not consider.** The `fields` config declares `kind: 'columns'`, which
`editor/list-fields.ts` already renders as a list whose cells are scalars — a key, a
name, a type select, and the per-type flags. That is what the `select` column's options
list could not be (§13), and a record's field list is not that: every cell is a scalar.
So the *shape* was right, and what was not is the vocabulary the field offers.

**The type select was the defect, and it landed on the first gesture.** The field is
Table's shape: it offers every entry in `COLUMN_TYPES` and — following the same rule
every select in the form follows — leaves the *shared* default out of the file. That
default is `text`, which this component refuses outright. So an author who added a
field got a column stored as "no type", read back as text, and a card immediately
reporting that it cannot hold text, beside two checkboxes offering a total and a
publication the component also refuses. That is not a cost a reviewer should be told
not to report; it is the first thing an author meets.

**Giving Record set its own default is what this is not**, and the reason is
`column-types.ts`'s own: the editor omits the key when it equals the shared constant
and a component reads a missing key as that same constant, so two answers to "which
type is first" makes one of them misread stored data. Instead
`ConfigFieldSpec.columnOptions` names the types a field offers and whether a total and
a publication are on the table; the first offered type is written out where it is not
the shared default, so a Table still stores a text column as absence and a Record set's
`type` is always explicit. `contract.test.ts` holds every named type against
`COLUMN_TYPES`, which is the check a union type would have bought.

**What stays a pass of its own** is the *heading*: the field still prints the word
"Columns" over a record's fields, which is UI §12's `.dropdown` call — a pre-existing
label, fixed in a diff that does only that. And `hideHeading` and `secondary` are still
offered and still ignored, because both are meaningless here rather than refused and a
key a hand-edited layout may carry has to survive the round trip.

### What it reuses

`card-face.ts`'s secondary-text clothes, Pool's ceiling classes, `level-ring.ts`,
`linked-text.ts`,
`modifier-breakdown.ts`, `modifier-form.ts`, `stored-flag.ts`, `column-types.ts`,
`sample-values.ts`, `interaction/editable.ts`, `ui/anchored-panel.ts`,
`ui/truncation.ts`, `ui/spellcheck.ts`, `parse/markdown-body.ts`, `parse/fenced.ts`,
`parse/wikilink.ts`, `parse/modifier-cell.ts` — which already holds the `;` split, the
part discriminator and `withoutPart`, so a record's modifier field inherits the cell
format rather than restating it — and the `.sheetsmith-placed` box. **None of these is
a component**,
so the sibling-import rule is not reached and eslint stays green.

`docs/UI.md` §9 gains two rows — a disclosure control that opens a block in place, and
a record's summary line — plus one for the focus treatment a transparent field wears,
which five fields across three components had written out identically, and one more
for the value-over-ceiling reading a bounded `number` field borrows from Pool.
**Twelve existing rows gain a consumer, not four**, and three paragraphs are added: the
disclosure's own rules, what answers the press, and why the glyph button has three
consumers and still no shared class. The estimate was made before the row table was
counted.

### The sample

Two records, named from `recordName` so an author's own word is what appears
(`Spell 1`, `Spell 2`), each with its fields filled by the shared rules — an
unbounded number from the sequence, a **bounded** one a partial of its ceiling and
then a partial of that, so the two records do not read the same, a flag showing both
paints across the two, a level partway up, a `computed` field left to compute and a
`modifier` field left **blank**, since the registry contract requires that a sample
enrols in no modifier and a definition the layout may not declare would put a problem
on screen the author did not cause.

**The ceiling is what makes the partial-of-a-partial legible**, which is worth
recording because that rule was added blind: a bounded field drawn as `Level 5` beside
`Level 3` shows two numbers and says nothing about where they came from, while
`Level 5 / 9` beside `Level 3 / 9` says in the picture itself that the value is the
record's and the ceiling is the field's.

The body follows Rich text's rule and **says out loud that it is filler**, because
prose is the one sample a reader could mistake for their own data.

---

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `recordName` | `text` | Record name | What one record is called. Names the **Add** control, the accessible name of a record's name field, and the filler in the layout editor's preview. Defaults to "Record". |
| `fields` | `columns` | Fields | The typed values every record holds, each an entry in that record's fenced block. Text is not offered: words a reader reads belong in the record's body, where they may hold links. A `max` on a `number` field is a uses counter's ceiling: a reset restores to it, and the field draws it beside the value. |
| `hideLabel` | `boolean` | Hide the heading | Draws the list with no name over it, for a list whose surroundings already say what it is. |

`formulaFields`: `fields.*.formula` and `reset.to`.

`palette`, two entries, each argued against §4.2's rule — a job an author would go
looking for, one component's configuration away, that the component's own name would
not lead them to:

- **Spellbook.** `recordName` "Spell", a `Level` number field and a `Prepared` toggle.
  Nobody building a spellbook looks for a component called Record set, and §13 already
  named a spellbook as a pattern rather than a component *when the record had no body*
  — this is the half of that entry that changes.
- **Features.** `recordName` "Feature", a `Uses` number field with a `max` and a
  `Modifiers` modifier field. **This entry moves off Table**, and the move is the
  point: §13's Features prefill was a Table with a `Notes` text column, and §13 said in
  the same breath that "a features list holding paragraphs is not a table at all, since
  a cell is one line". Two entries called Features under two types is a menu line
  nobody can choose between, and the Table one is now the wrong answer to its own job.

No **Feats** entry. A feats list is a features list under another name, and its
prefill would be identical — which is the discipline §4.2 asks for, since a menu
nobody can read is worse than the type list it replaced.

---

## Data and file model

`storage: 'markdown'`. One `##` section, one `###` block per record.

````markdown
## Features

### [[Second Wind]]
```sheet
Uses: 1
Modifiers: Second Wind
```
Once per short rest, regain 1d10 + fighter level hit points as a bonus action.

### Blessed Armour
```sheet
Uses: 0
Modifiers: armour_class += 1 as item when Attuned
Attuned: yes
```
A gift from the temple at [[Neverwinter]]. It hums faintly near undead.
````

**The shape, rule by rule.**

- **The heading is the name**, exactly as written, wikilink included. Plain markdown,
  so links are indexed (Constraint 2).
- **The fence holds the fields**, one entry per declared key, in `parse/fenced.ts`'s
  own format — the same `sheet` fence every scalar component writes, so a reader
  hand-editing a note meets one vocabulary. A field the layout no longer declares
  keeps its entry, per §10.
- **The body is everything after the fence**, and it *is* the value: no key, no
  wrapper, `parse/markdown-body.ts`'s framing rule per record.
- **A record with no fence is a record with no fields**, not an error — §10's "a
  section without a data block is empty, not malformed", read one level down. A record
  with no body is a name and its fields.
- **Anything before the first `###` is a preamble** and is preserved untouched, on
  §10's rule for prose around a table. **It is also invisible on the sheet, and that
  is the decision rather than an omission**: a reader who types a paragraph above the
  first record sees it vanish when they look at the sheet. The component draws the
  records it holds, and prose that is not part of a record has no record to be drawn
  in — the alternative is a second prose surface per component, which is what a Rich
  text block beside the list already is. What §10 promises is that it *survives*, and
  it does: every write re-joins it byte for byte.
- **Identity is position** among the `###` blocks. Two records named "Shield" are two
  records, and neither is unreachable — which is the defect keying by name produced on
  Table and the reason that rule was settled.
- **Order is the file's order**, and a new record appends at the end.

**Round-tripping.** `parse/records.ts` splits and re-joins; it is a note-format
primitive, so PATTERNS §10's third exception applies and it is tested through this
component's round trip rather than in a file of its own — `bodyText` alone is `trim`,
and a splitter alone is a split.

**Existing notes.** Nothing has ever written this shape, so nothing migrates. A
features list previously built as a Table keeps its `## Features` markdown table in
the note, unrendered and untouched, when the layout replaces the component — §10
working exactly as written, and the migration cost named in the model question.

---

## Acceptance criteria

- [x] A section holding three `###` records reads as three records, in file order,
      with each record's heading as its name, its fence as its fields, and everything
      after the fence as its body.
- [x] Parse then serialise with nothing changed is byte-identical, over ten spellings
      of a section's whitespace: no preamble, a preamble, blank lines between records,
      no blank line between records, CRLF, a record with no fence, a record with no
      body, a record with neither, a trailing newline, and none.
- [x] Editing one record's field rewrites that record's fence line and leaves every
      other byte in the section — including a neighbour's odd spacing — alone.
- [x] A record whose fence will not read draws its name, its body and a problem line
      naming the fix, while every other record on the same component renders and stays
      editable.
- [x] A wikilink in a record's name renders as a link, is faint where the note does
      not exist, opens on a press, opens in a new tab on a mod-press, and edits as its
      raw `[[…]]` text.
- [x] No fence this component writes can hold a wikilink: a `text` field is a
      configuration error naming the body as the place, and the scan for it is a test
      over the offered field types rather than a comment.
- [x] **And the route that scan does not reach**: a modifier part committed from the
      form — an amount, a condition, or a promoted definition's name — holding a note
      reference is declined rather than written, with the message naming the record's
      name or its body as the place for one. Driven through the form's own controls,
      because the callback is where the refusal sits.
- [x] A body draft holding `## ` or `### ` at the start of a line is not committed;
      the field keeps it, the message names the line and `#### `, and the note is
      unchanged.
- [x] Nothing is open on first render. A press on a record's chevron opens that
      record's body; a second press closes it; two records may be open at once.
- [x] The component's rendered height is identical with nothing open, one record open
      and every record open. *Asserted on the mechanism — the box carries the placement
      floor and the list is the scrollport — with the geometry left to a look
      criterion.*
- [x] Deleting a record above an open one leaves the right record open: the set is
      keyed by position, so a delete shifts it.
- [ ] Committing an edit inside an open record leaves that record open across the
      re-render.
      *Moved to the vault-fixture press list, for the reason the criterion below is
      there.* The component's half is driven — rendered with an open set supplied,
      the record is open — and the half that survives is the view's `Map`, which
      needs a `SheetView` a test can render (`docs/PATTERNS.md` §11).
- [x] ~~Opening a note, closing it and opening a second note leaves the second
      note's records closed.~~ **Moved to the vault fixture**, below: it is the
      view's `clear()`, which needs a `SheetView` a test can render
      (`docs/PATTERNS.md` §11 holds that row), and the fixture note already asks the
      owner to press exactly this. A code criterion that can never go green is worse
      than a press step that can.
- [x] A closed body carries `hidden="until-found"` and a `beforematch` listener that
      opens it; the chevron carries `aria-expanded` and `aria-controls`.
- [x] `count(features, Attuned)` and `sum(spells, Level)` resolve over the records a
      character added, and an empty list gives 0 rather than a failure.
- [x] `spells.Fireball` fails as an unknown name, whatever its capitalisation, and the
      component declares no `scopeValues` at all.
- [x] A record carrying `armour_class += 1 as item when Attuned` moves an armour class
      card whose formula reads `mod.self`, only while that record's `Attuned` toggle is
      set, and the card's breakdown names the record and the component.
- [x] A record's modifier glyph opens the shared anchored panel with the shared form
      inside it, and `modifier-form.ts` is imported by two components with no change to
      its options.
- [x] A `full` reset restores every record's `number` fields to their `max` and sets
      every `toggle` to yes; an `empty` reset sets numbers to 0 and toggles to no; a
      `full` reset over a `number` field with no `max` leaves the component alone and
      names the field.
- [x] A `number` field with a declared `max` draws its ceiling — Pool's own ceiling,
      separator and max classes, a read-only span with nothing to type into, on every
      record — and one with no `max` draws none, a `min` alone included. The
      announcement says it as "of", on Pool's spelling, for a commit and for a value
      held to its bounds.
- [x] **Add** writes a record at the end and puts focus in its name field; the delete
      glyph arms on the first press naming the record, commits on the second, and
      stands down on Escape, on a press elsewhere and on focus leaving.
- [x] A layout dropping a field leaves its entries in every note, and reopening the
      sheet neither rewrites nor reports them.
- [x] Every configuration error listed in Design draws on that component alone, names
      its fix, and leaves the rest of the sheet rendering.
- [x] The component passes every check in `contract.test.ts` with no change to any
      of them — member order, no member outside the contract, a sample that reads
      back and writes byte-identically under every configuration it is offered, no
      wikilink in a sample, no modifier enrolled by a sample, and every palette
      prefill a config field it also renders. **What this feature did to that file
      is three roster rows and one new check**: `scopeRows` and `scopeModifiers`
      gain their named entries, `SWEPT` gains its three sampled configurations, and
      a per-component case now holds every type a `columns` field says it offers
      against `COLUMN_TYPES` — the guard `ColumnOptionsSpec.types` needs, since it
      is `readonly string[]` and a typo there does not fail to compile. Adding a
      check is not changing one. ("Unchanged" was never satisfiable by a component
      that publishes: each roster's own comment says that a new member means
      somebody edits that line.)
- [ ] Registering it is one line in `src/components/index.ts`, and `git diff --stat`
      shows no change to `src/parse/character.ts`, `src/view/sheet-view.ts` beyond the
      open-set map, or `src/editor/`.
      *Not met, and requalified rather than dropped.* `src/parse/character.ts` is
      untouched and the view grew only the open-set map, its `clear()` and the two
      context members. Registration is an import plus a `register()` call, which is
      what every component costs. **`src/editor/` did change, deliberately**: the
      shared columns field is Table's shape — every type offered, the shared default
      `text` omitted from the file — so a Record set, which refuses a text field,
      reported a configuration error on the first field an author added. Design
      named parameterising that field as "a pass of its own"; the defect landing on
      the first gesture is what moved it here. `list-fields.ts` and
      `config-panel.ts` gained a parameter for what a field offers, and one editor
      *test* changed because Table's **Features** entry moved. SPEC §12 and §13
      carry the qualification.
- [x] `npm test`, `npm run lint` and `npm run build` are green.

**Look criteria**, in the harness at 1400px and 520px, both themes:

- [ ] A list of six records with two open reads as one block: the names line up, the
      fields line up, and an open body is indented to its name rather than to the
      chevron.
- [ ] The box does not grow, and the list scrolls, with six records in a three-row
      placement.
- [ ] At 520px a summary line holding a name, a labelled number, a ring and a glyph is
      legible and nothing overflows the box horizontally.
- [ ] A bounded number reads as one value against one ceiling — `Uses 1 / 3` — with
      the ceiling quiet beside the value rather than competing with it, and the two
      qualifiers around it at one weight. On the canvas the two sample records read
      `Level 5 / 9` and `Level 3 / 9`, so an author can see that the value varies per
      record and the ceiling does not.
- [ ] A record set beside a Table on one sheet is visibly a different thing at a
      glance, which is the model question's own claim tested by looking.
- [ ] The empty state — a label, and one **Add ritual** control — reads as a list
      waiting rather than as a broken component. (The harness's empty subject is
      `rituals`, whose `recordName` is "Ritual"; both filled lists hold records, and
      `state=empty` empties every component on the sheet, which is a different
      picture from one empty list beside a filled one.)
- [ ] Forced colors: the chevron's open and closed states are distinguishable, and the
      modifier glyph and the level rings survive as they already do.

**Vault fixture** (`~/Developer/sheetsmith-test-vault`, per the naming conventions;
both files also live in `src/test/fixtures/records/` and are driven through the real
parsers by `src/view/vault-fixture.test.ts`, on the item-modifiers fixture's own
precedent — a recipe in prose is a claim, and files are something a reader can load):

**Two criteria are pressed here rather than tested**, because what survives in each
is the view's own `Map` and a `SheetView` a test can render does not exist yet
(`docs/PATTERNS.md` §11). Opening a note, closing it and opening a second leaves the
second note's records closed; and committing an edit inside an open record leaves
that record open across the re-render. The fixture note's claim 2 asks the owner for
both.

`Sheetsmith layouts/Record variations.json` and `Characters/Records.md`. The layout
places a Record set in a narrow cell and a wide one; one with no fields at all, one
with every offered field type, one inside a Group and one inside a Tab set; a `full`
and an `empty` reset binding on a Long Rest; a Card whose `derived` reads
`10 + count(features, Attuned)` and another reading `mod.self` so a record's modifier
lands somewhere visible. The note holds a record with a very long body, a record with
none, a record with a wikilink name pointing at a note that exists and one at a note
that does not, a record whose fence is hand-broken, a preamble paragraph before the
first record, and an entry under a key the layout no longer declares. Aramil and
`DnD 5e Caster` are not touched.

---

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. `feat: Split a section into records`. `parse/records.ts` — the `###` split,
   the preamble, the per-record framing, and the re-join. Its round trip is driven
   through the component in step 2, so this commit carries the module and the
   component's first read/write cases land with it.
2. `feat: Hold a set of records with typed fields`. `components/record-set.ts` up to
   `read`, `write`, `sample` and its configuration checks, plus registration and its
   `configFields`. Renders a read-only list.
3. `feat: Open a record to read its body`. The chevron, the open set, the two
   `RenderContext` members, the view's map and its `clear()`, `hidden="until-found"`
   and `beforematch`.
4. `feat: Edit a record from the sheet`. The name field with its links, the field
   controls, the body's stacked edit and its refused lines, **Add**, and the arm-then-
   commit delete.
5. `feat: Read a record set from a formula`. `scopeRows`, and the aggregate cases over
   an open list.
6. `feat: Push a record's modifiers`. `scopeModifiers`, the modifier field's glyph, and
   the anchored form reused whole.
7. `feat: Restore records on a reset trigger`. `applyReset` and its two actions, and
   the failure that names a field.
8. `feat: Offer a spellbook and a features list`. Both palette entries, and the
   **Features** entry withdrawn from Table.
9. `docs: Record what a record set settles`. §2's **Record** and the two sentences that
   free the word, §4.2's new entry, §12's component order and the count, §13's
   `Resolved:` entry and the Features-prefill correction in the five-blocks entry,
   `docs/UI.md` §9's two vocabulary rows, and `docs/PATTERNS.md` §11's view-state row
   grown by one component.

---

## Deliberately not doing

- **Declared records.** Every record is the character's. A declared record's *body*
  would be prose in the layout file, and a layout holds structure and arithmetic and
  no content — which is also §11's non-goal against bundled rules content, reached
  from the other side. Nothing publishes a per-record name as a consequence, which is
  the same rule an open row already follows.
- **Nested records.** A record holding records is out, and it is named rather than
  left unsaid because the defect record is unambiguous: CSB 534 has nested items whose
  uuid and id read `ERROR`, 518 has chain referencing that "causes wrong data and
  errors" and surfaces "data… that doesn't exist elsewhere in the system", 492 has
  items still listed in containers after removal, and 495 has adding an item to a
  container freezing Foundry. §13's own depth-2 argument is the same finding about
  containers.
- **A set-level activation constraint — exclusivity, or a cap.** 5e concentration
  permits one active card across the spellbook; Pathfinder 2e caps investiture at ten
  and keeps a removed item counting for the day. Sandbox encodes exactly this shape
  twice and both times on the container — a **Unique group**, and a checkbox's **Check
  Group** key. **Out for v1, and reporting is what is offered instead**: a Computed or
  a Card reading `count(spells, Concentrating)` says the sheet is over its cap, which
  is a sentence the reader can act on. Enforcement is refused for a stronger reason
  than cost: a press that unticks another record is a write the reader did not ask
  for, on a plugin whose standing rule is render, do not correct. When it is taken it
  is a key on the *component* and never on the record, which is the stacking finding
  one layer up and Sandbox's own shape.
- **A card grid as an alternative presentation.** Both trackers' users ask for one
  (hay-kot 7: "display these features in a grid/card like view so they are easier to
  skim") and neither builder ships one, with no reason written down anywhere. The
  reason is findable from this design: a tile has no room for a body, so a grid would
  need the disclosure to become an overlay after all — the one surface this component
  refuses. It is a presentation key over the same storage when somebody answers that,
  not a different component.
- **Two views over one collection**, which CSB 549 and 519 are asking for together — an
  inventory list and an equipped list over one set of records. It needs a record to
  appear in two components, which needs an identity a position does not have.
- **A `text` field.** Refused with a message. §5 has no strings, so it could publish
  nothing; the body is where words go.
- **Multiply and override operators on modifiers, grouped conditional modifiers, a
  record naming two targets, dice-changing modifiers.** All deferred already, each with
  its reason in §13's item-modifiers entry. Nothing here reopens any of them.
- **A `select` field, and a `link` field.** Both parked in §13, and the blockers are
  unchanged: a field kind whose cells are lists, and a case that is not the inventory.
- **Compendium or content-library features.** §11.
- **Lancer's graded talents** — one record, three bodies, one per rank. A record has
  one body; three ranks are three records or three paragraphs. Named because it is a
  real system that this shape does not fit, and because a graded state with a body per
  step is what a `level` field would have to grow to reach.
- **A per-record uses ceiling that differs per record.** `max` is a literal on the
  field. Named as a cost in Design.
- **An expand-all control.** Its outcome is off-screen the moment it fires.
- **Reordering records from the sheet.** The note is the order.
- **A print stylesheet.** The note is the printable artefact, for this component and
  for the plugin.
- ~~**Parameterising the editor's columns field over its heading and its offered
  types.**~~ **Taken, in two passes and for two reasons, so this entry is struck
  rather than narrowed.** The *offered types* half went first: the field offers every
  type and omits the shared default, which is `text`, which this component refuses —
  so an author met a configuration error on the first field they added, which is not
  a label's kind of defect. The *heading* half followed when a design review found the
  same field offering a **Heading** input and a **Hide heading** checkbox on a
  component that draws no heading, and describing a Record set's fields as cells and
  rows in the one panel where an author reads about them. `ColumnOptionsSpec` now
  carries the offered types, the two refused flags, the hide-heading flag, the word
  for an entry, for what holds one, for where a value sits, and for the display-name
  column. Nothing in the editor knows which component it is drawing.
