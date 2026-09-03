# A reset trigger reaches a table column

Status: shipped
Board card: ✨ A reset trigger reaches a Table — a Conditions list clears on a long
rest, and a per-row Uses column refills — by naming the column it acts on.

A Table holding a Conditions list, a name column, a `toggle` for active and a
modifier column, cannot be cleared by anything. Pressing **Long rest** leaves every
condition on, because `src/components/table.ts` implements no `applyReset` and the
sheet's trigger pass skips a component without one. The same holds for a `number`
column holding per-row uses: a rest restores nothing in it. The layout editor cannot
even offer the binding, since `src/editor/reset-field.ts` is drawn only for a
component that implements the member.

## Model question

**No open §13 bullet.** This is a model question all the same, and squarely one: it
adds a key to `ResetBinding`, which is shared config the plugin itself reads (§6),
and it grows the component contract by one optional member. Both are decisions to
take deliberately rather than side effects of making a button work.

**The model half was settled with the owner before this document existed.** What
follows is that answer written out with its arguments, including the two options
that were rejected. Nothing here is re-opened. **Nothing is resolved until it is
built**, so §13 is not edited here; `/land-it` lifts the entry out of this section.

One sentence of §6 is already out of date and this feature is not what made it so:
**"Any Pool or Track can bind"** predates Record set implementing `applyReset`, so
it under-states the layer by one component today and by two after this. The
amendment is listed under [the documentation this owes](#the-documentation-this-owes).

### The binding sits at the component level and names a column

`ResetBinding` gains one optional key:

```json
{ "trigger": "Long rest", "action": "empty", "column": "Active" }
```

It stays where the plugin already reads it, and that is the whole of the argument
for it. §6's rule that `reset` is shared config the plugin itself reads survives
intact; `parse/layout.ts`'s `parseBinding` goes on validating it; and
`src/view/sheet-view.ts` learns nothing about Table — `bound`, the inert-button
case, the confirm modal's list and the `reset.<index>.to` rewrite all keep working
off `config.reset` exactly as they do now.

**The precedent is `buffer: 'clear'`**, already a key on the shared binding that
only a component declaring `hasBuffer` means anything by, and gated in the editor on
that declaration. This is that shape once more, with the difference that a buffer is
one unnamed thing and a column is one of several that have names — which is what
decides the editor half below.

Two alternatives were considered and rejected.

**`columns.*.reset`, the binding written on the column.** It reads better on the
page and cannot be validated. `columns` is component-private config that the parser
carries through untouched, so a binding living there could not be checked at all
without `parse/layout.ts` learning Table's column shape — and §6 is explicit that a
binding the plugin cannot act on refuses the layout, which it can only do for config
it reads. The sheet would need a new contract member on top, purely to go on asking
which components a trigger reaches, since `config.reset` would no longer answer it.

**Applying to every `toggle` column, with nothing named.** No new key at all, and
wrong on the first inventory it meets: an `Equipped` column is a `toggle`, and a
long rest unequipping the character's armour is exactly the `Qty` failure one column
type over. A trigger must reach what the layout pointed it at and nothing else.

### Two bindings on one trigger is now a question about a pair

§6 says today that **two bindings on one trigger refuses the layout**. That sentence
was written when a binding was the whole component. It becomes a rule about the
**trigger-and-column pair**:

- Two bindings on one trigger naming **different** columns is legal, and necessary:
  a long rest that clears Conditions and refills Uses on the same Table is one
  trigger reaching two columns.
- Two naming the **same** column, or two on a component that names none, keeps the
  refusal, for the reason already recorded — the button would apply both in file
  order and the second would win unannounced.

**The check stays in `parseReset`**, where it is now. It needs no new knowledge: the
duplicate key becomes the trigger and the column together, and `column` is a string
that forms part of the binding's identity. The parser never asks whether that string
names a column of anything, which is the same split §6 already draws for the trigger
name — whether `reset` is a binding at all is the file format's business, and
whether what it names exists is contents, reported where it can be fixed while every
sheet goes on rendering.

`parseBinding` gains one line beside the others: `column` must be a string, and a
blank one refuses, because a blank column names nothing and would collide with the
binding that deliberately names none.

### This pass reaches `toggle` and `number` columns

| Action | `toggle` column | `number` column |
| --- | --- | --- |
| `empty` | `no` | the column's own `min`, 0 where it declares none |
| `full` | `yes` | the column's own declared `max` |
| `formula` | the resolved number, read as a flag at 1 and above | the resolved number, held to the column's `min` and `max` |

**`empty` resolves nothing**, and that property is load-bearing rather than
incidental: a table whose formulas are broken can still be cleared. It is
`src/components/track.ts`'s rule — "a card whose count is broken can still be
cleared" — and it must hold here for the same reason, since the one thing a reader
can always mean is "none of this any more".

**Empty is the bottom of the column's declared range rather than a flat 0.** A
column may declare a `min`, and a reset writing 0 into one declaring `min: 1` would
put a cell below the column's own floor — with nothing downstream to catch it, since
`min` is only an input attribute today ([table.ts:2247](../../src/components/table.ts#L2247)),
handed to the input element and read by no other path. It is also the same clamp the
`formula` action already applies, so the two cannot disagree about what the column's
range means. The property above is untouched: a `min` is a literal on the column, so
emptying still resolves nothing.

**`full` on a `number` column uses that column's own declared `max`.** A Table
column's `max` is a literal on the column, not per row: `renderColumnsEditor` offers
the per-holder `maxSource` only where `ColumnOptionsSpec.holderMax` is set, and
Table does not set it. **A per-row formula ceiling stays closed**, exactly as
`docs/features/per-record-ceiling.md` left it — that closure's stated reason is
about a *formula* ceiling resolved per row inside `applyReset`, being a second
failure path on a control that already has one, and this feature does not touch it.
It is named again under [Deliberately not doing](#deliberately-not-doing).

**`formula` is not optional.** PATTERNS §8 obliges a component declaring `applyReset`
to declare `reset.*.to` in `formulaFields` [checked, `contract.test.ts`], and a
component that took the key and then refused the action would be a fourth failure
mode to explain. It resolves once for the component, not once per row — so it is one
number written into every cell of the named column, which is Record set's own shape
and not a per-row ceiling by another name. The flag is derived from the number
rather than set true, which is `record-set.ts`'s correction taken as read: `to: '0'`
must not turn every toggle on.

**`level`, `text`, `computed`, `target` and `modifier` are refused as binding
targets.** A computed column stores nothing to write; `text` and `modifier` hold
words, and neither "full" nor "empty" has a reading over them; `target` is a type no
column has any more and reads as `text`. `level` is the one worth recording a reason
for rather than a shape: a rest restoring proficiency has no reading in any system
we can name, and applying `full` to it for uniformity would buy only a case nobody
wants. It is the same call `record-set.ts` already made for a `level` field, and it
goes into §13 with that reason.

### A `full` binding on a column with no ceiling is reported, not refused

A `number` column bound to `full` that declares no `max` has nothing to restore to.
It is **reported in the layout editor and writes no cell**.

A Table column's `max` is a static authoring fact the editor can see and name, which
is what separates this from Record set. Neither half of that component's silent-skip
reasoning reaches here: there the ceiling is per record and data-dependent, and
failing would let one passive trait refuse a long rest for thirty spells. Here there
is one ceiling for the column, the author is the only person who can supply it, and
nothing on any character's sheet varies.

So it follows §6's existing treatment of a trigger name matching nothing — reported
in the editor where it can be fixed, every sheet goes on rendering — and it is **not
a layout refusal**, because the check needs Table's column shape and
`parse/layout.ts` must not have it.

**It is reported at the sheet as well, through `ResetResult`.** "Binds to nothing"
means no cell is written; it does not mean silence. The component is still in
`bound`, so the trigger's confirmation lists it and the button reaches it, and
`ResetContext`'s own doc comment names the failure that would follow: the user has
just pressed a button and watched nothing happen. §6 already says a trigger applies
what it can and names what it could not, and this is that. The editor's report is
the earlier and better-placed half of the same message.

### The contract grows one member, deliberately

The layout editor has to offer a column picker without learning that a Table has
columns. It asks:

```ts
/** One part of this component a reset binding may name (SPEC §6). */
export interface ResetColumn {
	/** What `ResetBinding.column` names. */
	key: string;
	/** What the editor shows, where it differs from the key. */
	label?: string;
	/** Actions this column cannot take, by action, each with the reason. */
	refuses?: Partial<Record<NonNullable<ResetBinding['action']>, string>>;
}

resetColumns?(config: TConfig): readonly ResetColumn[];
```

It passes §4.1's rule for an optional member: the alternative is `src/editor/`
reading `config.columns`, filtering on `type === 'toggle' || type === 'number'`, and
knowing that a number column's ceiling is spelled `max` — Table's data shape,
verbatim, in the editor. It is `hasBuffer`'s own argument with the answer having
names instead of being a boolean, and it is the member `buffer: 'clear'` would have
needed if a component could have had two buffers.

`refuses` is a map rather than a flag because the failure is per action: a column
with no ceiling refuses `full` and takes `empty` and `formula` happily. The strings
are the component's, so the editor reports a reason it did not compose and could not
have.

**Named for the key it fills.** `column` is the settled spelling on the shared
binding, so the contract already carries the word and inventing a second noun for
the same thing is the drift, not the fix. `ResetTarget` was the alternative and
collides with a modifier's target, which is a different thing one section away. The
cost is recorded under [Deliberately not doing](#deliberately-not-doing): a second
component whose parts are not columns still persists them under `column`.

**One list, two readers.** `applyReset` looks the binding up in the same
`resetColumns(config)` the editor drew the picker from, so the two cannot disagree
about which columns are eligible or about why one refuses an action.

### What it publishes, stores, and does to existing files

**It publishes nothing to formulas.** No new name, no change to `scopeValues`,
`scopeRows` or `scopeModifiers`. A reset writes cells the sheet already reads.

**It stores nothing new.** No new section, no new fence, no column written that the
layout did not already declare. The file model is untouched, and Constraint 2 is not
reached: a cell is a cell.

**Every layout written before this parses unchanged**, because `column` is optional
and a binding without one is the same bytes it always was. Every character note is
untouched until a trigger is pressed. Constraint 4 is engaged only by the write, and
the write is answered below.

**What such a binding now does is the one behaviour change to an existing layout,
and it is louder rather than quieter.** A Table carrying `reset: [{trigger,
action: 'full'}]` from before this feature used to be inert twice over: Table
implemented no `applyReset`, so `renderTriggers`' filter left it out of `bound`, the
button drew disabled where it was the only binding, and a press reached nothing.
Table implements the member now, so the same layout puts the Table in `bound`, the
button is live, the confirmation lists it, and the press writes no cell and reports
*this trigger does not say which column to act on*. That is the design above working
rather than a regression — §6's "applies what it can and names what it could not",
and the editor draws the same report on the **Acts on** row — but it is a
different thing from silence and the author will meet it on a layout they did not
edit.

## What it does

A layout author binds a trigger to one column of a Table: **Long rest** clears the
`Active` column of a Conditions list, or restores a per-row `Uses` column to the
maximum the column declares. The trigger reaches every row the note holds, declared
and character-added alike, in one write with the rest of the trigger, undoable as one
step. Cells in every other column come out byte-identical.

## Design

**Nothing changes on the sheet.** The trigger bar already draws a button per
declared trigger; a Table bound to one is simply among the components the
confirmation lists. There is no per-column badge and no mark on the bound column: a
binding is a fact about the layout rather than a state of the data, which is the
call `total` and `publish` both already made, and a glyph down a Conditions list
would be a mark saying something the reader cannot act on.

**The confirmation is the one exception, and the design review is what found it.**
A press was announced as "It resets: Conditions" while one of three columns moved,
on a component whose other columns this feature guarantees are left byte-identical
— so the modal was promising more than the press did. It is the one surface whose
whole job is to say what a press will touch, which is exactly why the no-mark rule
above does not reach it: that rule is about the *sheet*, where a binding is layout
config and not data state, and a confirmation that already enumerates components is
the place the difference belongs. So a bound component reads
`Conditions — Active, Uses`. It teaches `sheet-view.ts` nothing about columns:
`binding.column` is shared config the view already reads, and the display word comes
back from the component's own `resetColumns`. A component that names no part of
itself is unchanged, which is Pool, Track and Record set.

Everything else visible is in the layout editor, in `reset-field.ts`, and it reuses
the shape that file already has.

### The binding gains an **Acts on** row

The binding row keeps its two dropdowns and its trash control. The column picker is
**its own settings row underneath**, exactly where **Also clear temporary points**
and **Resets to** already sit. A third dropdown in the binding row would be a third
control on a line the pane cannot afford — UI §12 already carries a row for the pane
having no narrow regime below about 470px — and the file's own precedent is that a
field the action or the component conditions gets a row of its own.

It is drawn only where `resetColumns` returns a non-empty list, so Pool, Track and
Record set draw exactly the form they draw today.

**Name:** Acts on. **Description:** "Which column this trigger acts on. Cells in
every other column are left exactly as they are."

The row is not named **Column** on purpose: the entries carry their own labels out of
the component, and the editor naming them a kind of thing is the coupling this member
exists to avoid.

**It was **Applies to**, and the design review found the name was not free.** This
section argued only against **Column** and never checked what else the plugin already
called something — and **Applies to** is taken twice, both times meaning *which number
a modifier moves*: `editor/modifier-definitions-field.ts` puts it on every modifier
definition **in this same pane**, directly under **Changes**, and
`components/modifier-form.ts` uses it on the sheet's anchored panel. An author would
meet one label asking two different questions one form apart, which is the lookalike
`docs/UI.md` §9 opens against. **Acts on** is free, and it is what this row's own
description already said.

### Its states

| State | What the picker shows | What else appears |
| --- | --- | --- |
| Ordinary | Every eligible column, by its own label | Nothing |
| The binding names none (hand-written file) | A sentinel line, **Nothing yet**, selected | An error line: choose what this trigger acts on, or it resets nothing |
| The binding names a column that is gone | That name, as `<name> (missing)`, selected | An error line naming it |
| `full` on a column that refuses it | The column, selected | The component's own reason: the column has no maximum to restore to; give it one, or set this trigger to empty |
| The component offers none yet | No row at all | **Add reset** disabled, with a tooltip saying there is nothing for a trigger to act on |

The two "selected but not offerable" lines follow the trigger dropdown's own rule
verbatim: a value the list does not hold is added to the list so that **opening the
form cannot silently rebind the component**. That is the failure the `(not declared)`
option was added for, and a column picker that quietly wrote the first column into
the layout on a redraw would be the same bug with worse consequences, since the
trigger would then start clearing a column nobody chose.

**The marker is `(missing)` and not a fuller phrase, which the design review
measured rather than argued.** A `<select>` clips with no ellipsis and nothing to
hover — `ui/truncation.ts` cannot reach an option — and about 22 characters fit at
this control's width, so `(not on this component)` rendered as `Memorised (not on
this`, a dangling bracket that reads as damaged data rather than as a missing
column. What the shorter word gives up is that this state also catches a column
that exists and is not *eligible*, and the error line under the row carries that in
full.

Error lines go through `showFieldError` on the picker itself, which marks the
control and anchors the message under it — the same treatment every other inline
validation in this pane uses, and the reason a boxed `.sheetsmith-error` after the
row was wrong here: it was anchored to nothing, sitting between two rows with an
equal gap each side and, on a second binding, reading as that binding's problem. The
boxed form is kept for the one state with no control to hang a message on, where the
component offers no column at all.

### Two things the surrounding controls have to learn

**The duplicate guard compares the pair.** The trigger dropdown's existing guard —
"This component already resets on that trigger." — is now wrong for a component with
columns, where two bindings on one trigger are ordinary. It compares trigger *and*
column, reports "This component already resets that column on that trigger.", and
the **Acts on** dropdown runs the same guard on change, since either control can
create the collision the parser refuses.

**Add reset offers a trigger that is already bound.** Its `available` list currently
drops any trigger the component answers to. With columns, a trigger is available
while any eligible column is still unbound for it; the tooltip says so where none
is. A new binding takes the first column still *unbound for that trigger*,
alongside the existing assumption of `full` — the same predicate the availability
rule above is written in, and the only reading that is consistent with it: taking
the first column the component offers would, on a trigger already bound to it,
write the very pair `parseReset` refuses.

### Empty and error states elsewhere

**A bad binding is not a `configError`.** A Table whose reset names a `text` column
goes on rendering its rows, editable, exactly as it does now. `configError` makes the
component draw an error instead of itself and publish nothing, and taking a
Conditions list off the sheet because a reset binding is wrong would be §10's rule
applied to the wrong failure. The binding is reported where it is authored and named
when it is pressed.

**A Table with no bound column is passed over by every trigger**, which is today's
behaviour and stays it: `applyReset` exists on the component, `bound` finds no
binding naming the trigger, and no button reaches it.

## Config fields

`reset` is not a config field and may not become one: `RESERVED_KEYS` forbids a
component declaring the key, and the editor renders the binding itself because every
component that can act on one binds the same way. So this feature adds no entry to
any component's `configFields`. The controls it adds are these, for the record:

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `reset.*.column` | select, drawn by `reset-field.ts` | Acts on | Which column this trigger acts on. Cells in every other column are left exactly as they are. |
| `columns.*.max` | number, existing, inside the columns list | Maximum | *(existing, unchanged)* — and the number **Restore to full** puts back, which the picker's error line says where it is missing. |

## Data and file model

**A reset writes cells, and a cell it can write is a cell the note has a row for.**

`applyReset` returns a `TableData` whose `rows` map carries one `RowUpdate` per body
row, holding the bound column and nothing else. That is the same delta `render`
already reports for an edited cell, so it goes out through `write` → `writeTable`
unchanged, and three properties come free:

- **Unbound columns are byte-identical.** They are never in the update map, so
  `rewrite` never touches their segments.
- **A cell already holding the value is byte-identical.** `replaceCell` compares the
  unescaped text and returns the segment as it was, padding included.
- **The note's own spelling survives.** The comparison is on the *reading*, not the
  text: a cell hand-written as `x` reads as set, so `full` leaves the `x` alone and
  only `empty` rewrites it. That is PATTERNS §7's rule — a hand-written `x` stays an
  `x` — applied to the one gesture that writes a whole column at once. A blank cell
  in a `number` column reads as 0 (§4.2), so `empty` does not fill a column with
  zeros nobody typed. **A column declaring a `min` is the exception, and it is this
  rule working rather than an escape from it**: a blank cell there reads as 0, 0 is
  below the floor, so the cell is written with the floor — the one case where
  emptying a column puts text where there was none.

**A declared row the note has never held is left alone**, and this is the one call in
the write path worth arguing. The card's own first edit on such a row appends it
(`table.ts`, the `added` branch), and a reset deliberately does not take that path.

- A reset is not the gesture that creates a row. Every row in a note arrives from a
  reader typing in it or pressing **Add row**, and a long rest that appended the
  layout's eighteen declared rows to a fresh character's note would be writing
  structure as a side effect of restoring a value — rows that then become sticky
  under §10 the moment the layout renames one.
- It reads correctly to a player. A row nobody has touched has a blank cell, and a
  blank `Uses` cell on an untouched feature says "nothing spent", which is what a
  rest would have left anyway. Once a reader has spent something the row exists, and
  every reset from then on reaches it.
- It keeps two bindings on one component composable. `applySectionWrites` applies
  them in order over the evolving note, and the positions `applyReset` addressed
  came from one read — which stays valid precisely because no write in between adds
  or removes a line.

**Two things outside `applyReset` had to change so that "leave it alone" reaches the
note, and both are about a delta that names nothing.** They are recorded here rather
than under the component because each is a change to a *write* contract.

- **`table.write` returns the body it was handed where the delta names no row and
  adds none.** Its `table === null` branch seeds every declared row, which is right
  for an edit — the first cell a reader types writes the whole list, rather than the
  note growing a row at a time — and is exactly the eighteen-row append argued
  against above when the caller is a reset that found nothing to do.
- **`applySectionWrites` creates no section for a write that produced nothing.**
  `setSectionBody` appends a heading for a label the note does not hold, so the
  guard above still left `## Conditions` with nothing under it on a fresh
  character's note: the view sees the text change, saves, and offers an undo for a
  rest that touched no cell, and the empty heading is sticky under §10 the moment
  the layout renames the component. Only the *missing* case is skipped — a section
  that exists and is emptied is a value the reader cleared, and that write has to
  land. It is a rule about every component's write rather than Table's, and it is
  the smaller of the two fixes weighed: widening `ComponentDefinition.write` to
  return `string | null` would have said the same thing through the component
  contract, SPEC §4.1 and every component's signature.

**A reset never removes a row and never renames one.** `removed` and the name cell
are not in the delta at all, so Constraint 4 is not reachable from this control.

**The sheet applies every binding a trigger matches, not the first.** `applyTrigger`
currently does `findIndex`, which was right while one component had at most one
binding per trigger and is wrong now. It becomes a loop, pushing one edit per
matching binding, with `reset.<index>.to` rewritten from that binding's own index as
it is today. **Nothing merges component data** — two edits with one label compose
through `applySectionWrites`, the second `write` reading the body the first produced
— so the sheet still knows nothing about any component's shape, and §6's "applies
what it can and names what it could not" now holds per column as well as per
component.

### The documentation this owes

Written by `/land-it`, listed here so nothing is missed. All six are in the tree:

- **§13**, a new `Resolved:` entry: a reset binding names a column, reaching a
  Table's `toggle` and `number` columns, with the two rejected options, and the
  `level` deferral with its reason.
- **§6**, two sentences. "Any Pool or Track can bind" becomes a statement about any
  component implementing `applyReset`, which is Pool, Track, Record set and Table.
  "Two bindings on one trigger refuses the layout" becomes the trigger-and-column
  pair rule, with the unchanged reason.
- **§4.2**, the Table entry: what a reset does to a column, which types accept one,
  and that a `full` binding on a column with no `max` is reported in the editor
  rather than refusing the layout.
- **§4.1**, the optional-member list: `resetColumns`, under the same rule the others
  are held to.
- **PATTERNS §3**, the member order, and §8, the obligation that declaring
  `resetColumns` obliges `applyReset` and that declaring `applyReset` on a component
  with columns obliges `resetColumns`.
- **`docs/UI.md` §12**, one backlog row, and it is the one edit here that is already
  written rather than owed: the harness draws no trigger bar, so the trigger button,
  the confirmation, the undo notice and the failure notice are in no PNG and
  reachable by no gesture. Pre-existing — triggers predate this feature — and what
  this feature changed is the cost of it, since the one surface that says what a
  press did is the one nobody can see.

## Acceptance criteria

- [x] A Table with a `toggle` column bound to a trigger has every toggle cleared by
      `empty` and set by `full`, over every row the card draws — declared rows, and
      the character's own where `openRows` is on — in one write with the rest of the
      trigger, undoable as one step. A row a *closed* table does not draw is not one
      of them: §10 keeps an undeclared row in the note unrendered and untouched, and
      a reset that wrote into it would be changing a cell nobody can see.
- [x] After that write, every cell in every unbound column is byte-identical,
      asserted over a note whose pipes do not line up and whose rows are ragged.
- [x] A cell already holding the value is not rewritten: a `full` over a column
      holding a hand-written `x` leaves the `x`, and an `empty` over blank `number`
      cells in a column declaring no `min` writes no bytes at all.
- [x] `empty` on a `number` column writes that column's own `min`: a column declaring
      `min: 1` comes out holding 1 in every row, including the rows whose cell was
      blank, and a column declaring none comes out holding 0 wherever it holds
      anything.
- [x] A Table with no bound column is passed over by every trigger, as today, with
      the note unchanged.
- [x] A `Qty` column with no binding is never written by a rest, on a layout whose
      Table binds a different column on the same trigger.
- [x] Two bindings on one trigger naming different columns both apply, in one write;
      two naming the same column refuse the layout in `parseReset`, as do two on a
      component naming none.
- [x] A `number` column bound to `full` with no `max` writes no cell, and is named
      by the trigger's failure report; the same column with `empty` still clears.
- [x] `empty` resolves nothing: a Table whose computed column formula is broken is
      still cleared by a trigger, and reports no failure.
- [x] A binding naming a column that does not exist, or one of a refused type, writes
      nothing and is named through `ResetResult`; the Table still renders its rows
      and is still editable.
- [x] `formula` writes the resolved number into a `number` column held to its bounds,
      and into a `toggle` column as a flag derived from the number, so `to: '0'` does
      not turn a column on.
- [x] The editor offers **Acts on** only where the component returns columns, and
      Pool, Track and Record set's reset forms are unchanged, asserted in
      `reset-field.test.ts`.
- [x] Opening the form for a binding that names no column, or a column that is gone,
      does not write to the layout; the sentinel line is selected and the reason is
      shown.
- [x] The trigger's confirmation names the columns it will reach —
      `Conditions — Active, Uses` — using the label the component's own
      `resetColumns` gives, never the stored key; it lists a bound column's
      component once however many bindings it holds, falls back to the stored key
      for a column that is gone, and is the bare label for a component that names no
      part of itself and for a binding carrying no column at all.
- [x] A binding naming a trigger the layout does not declare is reported in the
      editor and binds to nothing, per §6 — unchanged, asserted so this feature did
      not disturb it.
- [x] Choosing a column that another binding already holds for that trigger is
      refused inline and the dropdown is put back.
- [x] A layout written before this change parses unchanged, byte for byte. A Table
      binding carrying no `column` writes no cell, and is now *named* by the trigger
      rather than passed over in silence: the button is live, the confirmation lists
      the component, and the press reports what the binding does not say.
- [x] A component declaring `resetColumns` without `applyReset` fails
      `contract.test.ts`, as does a container declaring either.
- [x] The harness's sample layout binds a Table column to a declared trigger, so the
      editor pane shows the **Acts on** row in both themes, captured as
      `editor-reset-column` and `editor-reset-column-dark`. That the binding reaches
      the table from the sheet is asserted in `reset-flow.test.ts` rather than seen:
      the harness draws no trigger bar (`docs/UI.md` §12), which is pre-existing and
      out of scope here.
- [x] The throwaway vault's `DnD 5e Caster` gains a Conditions table — `openRows`,
      declared rows Blinded / Charmed / Frightened / Poisoned, an `Active` `toggle`
      column bound to **Long rest** with `empty`, a `Uses` number column with
      `max: 3` bound to **Long rest** with `full`, and a `Notes` column bound to
      nothing — placed at `col 1, row 9, 3x3`, beside its existing Inventory, whose
      `Qty` is the untouched column the rest must not write.

      `Aramil.md` is the note (**not `Sera.md`**, which is on `Group variations`),
      and it holds the rows in mixed states before the press: `Active` as `yes`, as
      `no`, and once hand-written as `x`; `Uses` blank, `0` and `2`; `Notes` filled
      on some rows and blank on others; one character-added row, `Sunburned`, that
      the layout does not declare; and one declared row, `Charmed`, left out of the
      note entirely.

      **`Charmed` is the tripwire. Two rules before you press anything:**

      1. **Press Long rest before touching any cell in the `Charmed` row.** Touching
         one first disarms the tripwire, and the fixture then reads as a bug that is
         not there.
      2. **To re-arm it, delete the `| Charmed | … |` line from the note by hand.**
         Not from the sheet: a declared row is *claimed* the moment the note holds
         it, so it has no delete control there and nothing on screen says the
         tripwire has gone. This is the fact that cost an afternoon.

      **What it detects is narrower than "this row must stay absent".** It detects a
      *reset* creating a declared row the note does not hold, which is the seeding
      bug. It does **not** detect an ordinary edit creating one, because that is
      correct: the first press on any cell of a declared row the note lacks appends
      that row, which is `write`'s `added` branch and is exactly the path the Data
      and file model section above says a reset deliberately does not take. Both
      halves are pinned in `table.test.ts`, so the distinction survives without the
      vault — and a press that appends `Charmed` with `Uses` **blank** is the edit
      path, where the reset would have written `3`.

      **What the press does, and the two halves of the reading rule.** Pressing
      **Long rest** clears every `Active` cell — the `x` included, because it reads
      as set and `empty` must change it — and fills every `Uses` cell to 3, blank
      cells included. `Charmed` is still absent, `Notes` and the Inventory's `Qty`
      are byte-identical, and a second press writes nothing. The other half is one
      dropdown away: **Undo**, then switch `Active`'s action to **Restore to full**
      and press again — the `x` is left exactly as it is, because it already reads
      as set, while `Poisoned`'s `no` becomes `yes`.

      **The error states are deliberately not in this fixture.** A `full` binding on
      a column with no `max`, and a binding naming a column that is gone, would each
      leave a playable sheet reporting on every press; they are reachable by
      hand-editing the layout and undoing, and they are driven in
      `reset-field.test.ts` and `table.test.ts`. A conditions list is ordinary
      equipment for a 5e caster, which is why it belongs on this sheet at all rather
      than in a variations layout.
- [x] `npm test`, `npm run lint` and `npm run build` clean.

## Commit boundaries

Re-derived from what was built, after two review waves moved work between them.

1. `feat: Let a reset binding name a column`. `ResetBinding.column`, `parseBinding`'s
   validation, `parseReset`'s duplicate check keyed on the trigger-and-column pair,
   and the exported `bindingKey` both it and the layout editor compare through — one
   spelling of what identifies a binding, on `mayHoldChildren`'s own reason. With the
   layout parser's tests for both refusals and for the legal pair.
2. `feat: Apply every binding a trigger matches`. `applyTrigger`'s loop in place of
   `findIndex`, with the `reset.<index>.to` rewrite per binding. Its test is
   `reset-flow.test.ts`'s, which is where the view's wiring is mirrored because
   `SheetView` cannot be constructed without a workspace: two bindings on one
   component landing in one write, one text for the undo to put back, and the
   component named once in the confirmation.
3. `feat: Ask a component which columns a reset may name`. `ResetColumn`,
   `ComponentDefinition.resetColumns`, its place in `MEMBER_ORDER`, and the
   `contract.test.ts` rules — obliged with `applyReset`, refused on a container.
4. `feat: Reset a table column`. Table's `resetColumns` and `applyReset`,
   `reset.*.to` in `formulaFields`, the reading-based comparison, and the component
   tests including the byte-identical round trip. **Two write-contract changes ride
   with it**, both so that a reset reaching nothing writes nothing: `table.write`
   returns the body it was handed where the delta names no row, and
   `applySectionWrites` creates no section for a write that produced nothing — the
   second is a rule about every component's write, with its own cases in
   `character.test.ts`.
5. `feat: Bind a trigger to a table column in the layout editor`. The **Acts on**
   row, its sentinel and its three reports drawn through `showFieldError` on the
   picker itself, the pair-aware duplicate guard, **Add reset**'s availability rule,
   and the picker's `aria-label`. With the stylesheet the design wave asked for: an
   invalid field marked by an outline rather than a border colour, so the mark
   reaches a `border: 0` select and survives forced colors; the picker's own message
   held at the pane's fixed size; and a binding's continuation rows closed up so one
   binding reads as one block.
6. `feat: Name the columns a trigger will reset in its confirmation`. `resetSummary`
   and `sheet-view.test.ts`. Its own commit because it is the sheet's half and it
   needs boundary 3 in place: the modal reads the label back from the component's
   own `resetColumns`, so it lands after the member exists.
7. `test: Show a reset-bound table in the harness`. The sample layout's binding and
   the two `shot.mjs` views — `editor-reset-column` and `editor-reset-column-dark`.
   `stub-app.ts` needed nothing: it already declares **Long rest**.
8. `docs: Record that a reset reaches a table column`. The documentation edits
   listed above. Five of the six are owed and land here; the sixth, `docs/UI.md`
   §12's row for the harness drawing no trigger bar, is already written — it is what
   makes criterion 18's second clause read rather than seen.

**The vault fixture belongs to no boundary**, and that is the rule rather than an
oversight: `AGENTS.md` puts the throwaway vault outside the repository, so the two
files this feature amends — `DnD 5e Caster.json` and `Aramil.md` — are not in any
commit. What is committed is the recipe, in criterion 19, in enough detail that a
clone can rebuild it.

## Deliberately not doing

- **A Conditions palette entry over Table.** Separate work, and it lands after this:
  an entry prefilling a name column, a `toggle` and a modifier column is worth having
  and is not what makes the trigger reach it.
- **Table pushing modifiers from toggle-gated rows.** Already works, and is the
  reason a Conditions list is worth clearing at all.
- **Any change to Pool, Track or Record set's reset behaviour.** They implement no
  `resetColumns`, so their bindings, their forms and their writes are untouched.
- **A per-row formula ceiling.** `docs/features/per-record-ceiling.md` closed it with
  a reason this feature does not disturb: resolving a ceiling per row inside
  `applyReset` is a second failure path on a control that already has one. A Table's
  `max` stays a literal on the column.
- **A per-row ceiling the reader types.** Record set has one because its fence holds
  a composite value per entry; a Table cell is one value and `2 / 3` in it would be a
  new file-model question, not a reuse of that one.
- **`level`, `text`, `computed`, `target` and `modifier` as binding targets.**
  Argued above; `level` is the one recorded in §13 rather than merely refused.
- **The `link` column type.** Not a type today.
- **Multiply operators on a reset.** `full`, `empty` and `formula` are §6's three,
  and a formula already reaches anything an operator would.
- **A noun of the component's own for the picker.** The key is `column` and the row
  is **Acts on**. A second component whose parts are not columns would persist
  them under a key that names them wrongly, and renaming it then is a layout
  migration. Recorded rather than pre-solved, because one reader is not a rule.
- **Reporting a bad binding on the sheet as a `configError`.** The Table goes on
  rendering; the report is the editor's and the trigger's.
