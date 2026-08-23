# Declared-row publication

Status: shipped
Board card: ✨ A declared Table row publishes its value — `10 + skills.perception`
cannot be written. Settles §13's publication question and replaces the workaround
Track put in its place.

*The branch was chosen and argued before this spec, and `docs/SPEC.md` §13 already
carries the `Resolved:` entry. That departs from `/feature-spec`'s rule that `/ship`
writes the entry once the thing is built, and it was the session's own deliverable:
the decision is the product, and the implementation below is what follows from it.
The remaining SPEC edits — §4.1, §4.2, §5, §12 — are listed under commit
boundaries and belong to `/ship`.*

## Model question

§13's **"How a Table publishes its declared rows to the rest of the sheet"**, in
full for Table and in half for Track. The argument is in §13's `Resolved:` entry
and is not repeated. What this section carries is the mechanism it names and the
three things the mechanism does not do.

### The contract grows one member, deliberately

`ScopeEntry` gains `compute`, beside `value` and `display`:

| Member | What the name answers with | Who evaluates it |
| --- | --- | --- |
| `value` | What the note stores. Always reachable as `<name>.value`, and the bare name's fallback. | Nobody; it is data. |
| `display` | One of the component's own formula fields, evaluated in a named scope. | The name table, through the component's resolver. |
| `compute` | A value only the component can produce, with the sheet-bound resolver in hand. | The component, called lazily by the name table. |

`compute` is the expensive one and `display` stays the one to reach for. A
`display` names a field, so a reader of the layout can in principle follow the
edge from one component to the next; a `compute` is code, and §5's save-time cycle
check can never see through it. **A component that could publish through `display`
must not use `compute`** [judgement], and an entry declaring both is refused
[checked, `contract.test.ts`].

This is the contract growing by decision rather than by side effect. It passes
§4.1's rule for an optional member — the alternative is the name table knowing how
a Table builds a row scope — and it is the third member of one existing interface
rather than a fourth member of the component contract, so nothing outside a
component learns that any component exists.

`PublishedComponent.resolver` is unchanged and needs no change: it is already a
factory over the sheet, built by the sheet view from the component's own
`formulaFields` ([sheet-view.ts:265](../../src/view/sheet-view.ts#L265)). §13's
framing — "a component gains a say in how its resolver is built" — understated
what was missing. The resolver was already the component's. What the component had
no say in was what its published entry is *computed from*.

### What a declared row publishes

A **column** asks to be published, and a **row** carries the name. That split is
the shape `total` already has, and it is the right way round: which value on a row
is worth publishing is a property of the column, stated once, not a property
repeated on eighteen rows.

- A column may set `publish: true`. At most one column per card may [refused].
- A declared row may carry a `key`. The row's cell in the published column answers
  to `<id>.<key>`.
- The bare name is what the cell shows, and `<id>.<key>.value` is what the note
  stores, which is §5's own rule read one level down. On a computed column there
  is no stored value, so `.value` publishes nothing and a formula reading it fails
  as an unknown name — a computed column is never written to the note (§4.2).

So `skills.perception` is the Total column's value on the Perception row, and
`10 + skills.perception` is the passive perception the original brief wrote.

### The three constraints it has to survive, and how

**Position addressing (§13, resolved) is untouched.** The name is the layout's
`key`. The value comes from whichever note row that declared row claimed, found by
the existing claim rule — the first note row spelling the label, case-insensitively,
top to bottom. The key says *which declared row*; the claim says *which line of the
file*, exactly as the render already does. No index leaves the component, so the
renumbering that broke Roll20's macros still cannot arise.

**A character-added row publishes nothing.** The entries are built from
`config.rows`, and a row the character typed appears nowhere in it. `inventory.Dagger`
still fails as an unknown name. This is not a new guard; it is what building from the
config rather than the data means.

**A declared row that claimed nothing still publishes.** The card renders it with
blank cells, and a blank cell in a `number` column is zero (§4.2), so the formula
resolves and publishes the same number the reader is looking at. A bare name gives
what the card shows: where the card shows a number computed from zeros, so does the
name.

### Cycles

Nothing new. `compute` is called from the same thunk `display` is called from, so a
published row is lazy, memoised, and guarded by the `active` set already in
[sheet.ts](../../src/formula/sheet.ts).

Row A's column formula naming `skills.row_b`, whose formula names `skills.row_a`:
the guard is keyed on the published name, and two rows of one Table are two
distinct names, so a within-component cycle is caught by the same machinery as a
cross-component one. Both names publish nothing. Both cells show `?` with the name
they could not find, from `explainField` on the failure path. Every component
outside the cycle keeps working. A row whose formula names its own published value
is the same case with one participant.

Reported in two places, both existing: on the cell, per §4.2's hover-and-tap rule,
and by §5's save-time check to whatever extent that check can see the edge — which
for a `compute` is not at all, and that is the cost the resolved entry names.

### The two things it does not do

**A total on a computed column stays a configuration error.** Publishing one
declared row's value and summing a column of derived values across however many
rows a character has are different questions. The refusal survives; its *stated
reason* does not, because the error text currently says a computed column cannot
publish a value yet and after this it can. New wording is in scope, and it argues
from the aggregate rather than from §13.

**Track's name depth stays open.** `slots.L1.count` is one segment past what
`<id>.<name>` reaches, and `isName` refuses a dot in a published key on purpose:
a third segment collides with the `.value` every entry already answers to.
`compute` changes how a value is produced, not how deep a name goes. §13 keeps
that question, rewritten around depth rather than around mechanism.

### What Track gets

`compute` is what §12 said the contract could not express, so Track's workaround
goes:

- Today: `self: { value: <filled segments> }` plus a restated `named.value` holding
  the marks, relying on the name table registering `named` after `self` to
  overwrite `<id>.value`.
- After: `self: { value: <marks>, compute: () => <filled segments> }`. The bare id
  is segments through `compute`; `<id>.value` is marks through `value`. No
  restatement, no ordering dependency.

The test that drove this through `buildSheetScope` keeps both assertions verbatim —
the bare id is segments, `.value` is marks — and loses only the comment about why
the registration order mattered. `buildSheetScope`'s registration order is left
exactly as it is; what changes is that nothing depends on it.

The row-set case gets the same correction, because it is the same rule read one
level down: today a row publishes `slots.L1` as segments *and* `slots.L1.value` as
segments, which is wrong on the second name. After, `slots.L1` is segments and
`slots.L1.value` is marks.

## What it does

A layout may name a declared Table row so the rest of the sheet can read its value:
one column says which value is worth publishing, each row that wants a name carries
a key, and `skills.perception` resolves to the number on that row. Passive
perception, a save DC read off a skills card, a carrying capacity read off a row of
an abilities table — arithmetic the layout writes rather than a number the author
copies by hand into a second place.

## Design

Almost none of this is on the sheet. A published row looks exactly like a row: no
badge, no marker, no change to any cell. That is deliberate and is the same call
`total` made — a published name is a fact about the layout, not a state of the data,
and a glyph per row down a skills card would be eighteen marks saying something the
reader cannot act on.

What changes is in the layout editor, and it reuses both list editors as they
stand.

**The columns list** gains **Publish per row** beside **Show a total**, on the same
`checkField` control, offered only on the types that may carry it. A footnote joins
the two already under that list, on the same rule they follow — shown only when a
column asks for it, saying the thing nothing else on the form would say:

> A published column gives every row below a name of its own, "\<component id\>.\<row
> key\>", so a formula elsewhere on the sheet can read that row. Give each row a key
> in the rows list above. Only one column can be published.

*Added during the build, from `/design-review`:* **the control is withdrawn from the
other columns once one holds it**, rather than offered everywhere and refused on the
card. A card publishes one column, so this reads like the total, which is not offered
on a column with nothing to add up. Refusing it inline instead would mean an error
message inside a checkbox label, where pressing the message toggles the box it
complains about — a surface this form has never had. The footnote appears at the same
moment and says only one column can be published, so nothing vanishes unexplained,
and unticking brings the control back everywhere, which is how the publication moves.
The consequence for the table below: **the two-published-columns `configError` now
guards a hand-edited layout file rather than anything the editor can produce.**

**The rows list** gains a second fixed column, **Publishes as**, beside **Row
name** and before the row-value columns. It is a text input, empty by default, and
its inline error follows the pattern the row-value name input already uses: a
refused value is put back and the reason is shown, because leaving typed text in a
field whose value was refused makes the field lie about what the file holds.

- Empty is the ordinary state. A row with no key publishes nothing.
- The error text names the fix: `A row key is a name a formula reads — letters,
  digits and underscores, not starting with a digit — so it was left as "…".`
- A duplicate is refused the same way, naming the row that already has it.

*Added during the build, from `/design-review`:* a row holding a valid key also draws
**the name it publishes as**, `skills.perception`, under the input as a copyable code
chip. A field called "Publishes as" that never shows what it publishes as leaves the
reader to assemble the name from the footnote's pattern, and this is the string that
gets retyped into the formula that reads the row — which is the argument the component
form already makes for the copyable id chip at the top of it. So the chip is that
control, extracted to `copyableName` and shared rather than reimplemented, and it is
drawn only where the key composes to a name a formula can read, so a key arriving
broken from a file is not offered for copying beside a card refusing it. **Its cost is
that a keyed row is taller than its unkeyed neighbours, so a rows list no longer has
one row height** — accepted, on the grounds that the chip sits inside the field's own
cell and reads as attached to it rather than as a row that came out wrong.

**Error state.** Every refusal below is a `configError`, so the card renders its own
error and publishes nothing, per §10 and PATTERNS §4. Error text names the fix:

| Refused | Message names |
| --- | --- |
| Two columns published | which two, and that only one may be |
| `publish` on a `text` column | that the card shows `sword` where the note holds `[[Sunblade\|sword]]`, so there is no one value to publish; publish a number, level, toggle or computed column |
| A row `key` that is not a name | the fix, letters/digits/underscores, and that it is refused rather than rewritten |
| Two rows with the same key | which key, and both rows |
| A row `key` colliding with a totalled column's key | that both would answer to the same name |
| A row `key` with no published column | that a key is a name for a value, and no column offers one yet |

Refused rather than rewritten, on §4.2's own argument for a totalled column key: a
component id's rewrite is safe because the editor shows the author what their
component is called now, and nothing here could tell them what their row became.

**Empty state.** A card with a published column and no row keys publishes nothing
and is a configuration error, so there is no silent empty state to design.

## Config fields

Neither is a component-level field; both live inside the existing `rows` and
`columns` list editors, whose `configFields` descriptions grow to say so.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `columns.*.publish` | boolean, inside the columns list | Publish per row | Gives every row with a key a name of its own, "\<component id\>.\<row key\>", so a formula elsewhere on the sheet can read that row's value in this column. Only one column can be published. |
| `rows.*.key` | text, inside the rows list | Publishes as | The name a formula reads this row by, e.g. "perception" for "skills.perception". Letters, digits and underscores. A row without one publishes nothing, and a row the character adds never publishes. |
| `rows` | rows | Rows | *(existing, extended)* … Each row may also carry a key, which is the name a formula reads that row's published value by. |
| `columns` | columns | Columns | *(existing, extended)* … One column may be published per row, which is what lets a formula read a single row's value rather than a column's total. |

## Data and file model

**Nothing about the file format changes.** No new section, no new fence, no column
written that was not written before. `publish` and `key` are layout keys; a
character note holds neither and is not rewritten by any of this. A computed column
is still never written to the note.

Round-tripping is unaffected: `read` and `write` are untouched, so Constraint 3
holds by not being in the diff, and the existing round-trip tests cover it.

Existing notes and existing layouts are unaffected. Both new keys are optional and
absent means today's behaviour, so every layout in the fixtures and the throwaway
vault keeps publishing exactly what it publishes now. Constraint 4 is not engaged:
nothing is deleted, because nothing is stored.

One factoring is load-bearing and belongs here rather than in the design. The row
scope — every non-computed cell by column key, then the row's own `values` layered
over them, an unresolved value omitted rather than zeroed — exists once today,
inside `render` ([table.ts:1249](../../src/components/table.ts#L1249)). Publication
needs the same construction from stored cells rather than from drafts. It moves to
one helper taking a cell reader, called by `render` with the draft-aware reader and
by `compute` with the stored one, on §4.2's own rule that a computed cell and a
column total must not disagree about what a row says. A second copy would be the
same class of bug the totals were factored to avoid, and PATTERNS §10 wants a test
driving both.

That leaves one honest limitation, stated rather than fixed: **a published name
reads the note, and a cell reads the draft.** While a value is being typed, a
formula elsewhere on the sheet still sees the last committed number, and it catches
up on commit when the sheet rebuilds. That is "feedback is continuous, persistence
is discrete" applied to a name rather than to a card, and per-keystroke publication
would mean rebuilding the sheet-wide name table on every key.

## Acceptance criteria

- [x] `10 + skills.perception` evaluates from a declared row, driven through
      `buildSheetScope` and the expression engine rather than through the
      declaration. The value is the published column's value on the row the claim
      rule matched.
- [x] An open row publishes nothing: on a card with `openRows` and a character row
      called "Dagger", `inventory.Dagger` is undefined, in any capitalisation, and
      the formula reading it reports an unknown name.
- [x] `skills.perception.value` is the stored cell where the published column is
      stored, and undefined where it is computed.
- [x] A declared row that claimed no note row publishes the number the card shows
      for it.
- [x] A row key that is not a §5 name is a configuration error; the card renders the
      error, publishes nothing, and the message names the fix.
- [x] Each of the other five refusals in the design table has a test asserting the
      error, not merely that publication is absent.
- [x] Two declared rows whose column formulas name each other both publish nothing,
      both cells show `?` with the name they could not find, and a third component
      on the same sheet still resolves.
- [x] Track's bare id is filled segments and `<id>.value` is stored marks, with the
      restated `named.value` gone from `track.ts` and both assertions unchanged in
      `track.test.ts`.
- [x] A Track row set publishes segments under `slots.L1` and marks under
      `slots.L1.value`.
- [x] A `ScopeEntry` declaring both `display` and `compute` fails
      `contract.test.ts`.
- [x] The row scope is built by one function, with a test that drives both the
      rendered cell and the published name and asserts they agree.
- [x] `total` on a computed column is still refused, with an error text that argues
      from the aggregate and does not mention §13.
- [x] The harness shows the columns list with **Publish per row** and its footnote,
      and the rows list with a **Publishes as** column, in both themes.
- [x] A refused key is put back and its reason shown, driven through the rows editor
      in `list-fields.test.ts` for both a key that is not a name and one another row
      already publishes under. *Split from the line above, which asked the harness for
      it: the inline error fires from a `change` handler, so no static render of the
      harness can ever show it, and a criterion nothing can settle is one the next
      reader has to re-argue.*
- [x] `npm test`, `npm run lint` and `npm run build` clean.

## Commit boundaries

1. `feat: Let a component compute a value it publishes`. `ScopeEntry.compute`,
   the branch in `buildSheetScope`, the `display`-or-`compute` rule in
   `contract.test.ts`, and tests in `sheet.test.ts` for a computed entry, its
   `.value`, and a cycle through one.
2. `refactor: Publish a Track's segments without restating its value`. Track's
   `self` and its row set move to `compute`; `named.value` goes; `track.test.ts`
   keeps its assertions and loses the ordering comment.
3. `refactor: Build a table row's scope in one place`. The `rowScope` helper out of
   `render`, taking a cell reader, with the test that drives render and publication
   through it.
4. `feat: Publish a declared table row`. `TableColumn.publish`, `TableRow.key`,
   `scopeValues`, the six refusals in `configError`, and the component's tests.
5. `feat: Name a published row in the layout editor`. The **Publish per row** check,
   the **Publishes as** column, the footnote, the inline errors, and the two
   extended `configFields` descriptions.
6. `docs: Record what a declared row publishes`. §4.1's `scopeValues` bullet and the
   `compute`/`display` rule, §4.2's Table entry and the reworded computed-column
   total refusal, §5's name-table bullets, §12's Track paragraph losing the
   workaround, and §13's Table entry retired against the `Resolved:` block already
   written.

## Deliberately not doing

- **A second published column per card.** `<id>.<key>` is two segments and a row is
  already the second, so a card publishes one column per row. Two would need the
  depth question §13 keeps.
- **`slots.L1.count`, or any third level of name.** Open in §13, and not made worse
  or better here.
- **A total on a computed column.** Refused before, refused after.
- **An across-rows aggregate for Track.** Now expressible — a component computing
  its own published value can sum its own rows — and undesigned: what a slot card
  calls "how many are left", and what "left" means on a run whose `sense` is harm,
  are Track's questions and stay in §13.
- **Per-keystroke publication.** A published name catches up on commit. Fixing it
  means rebuilding the name table per keystroke.
- **Deriving a row key from its label.** Explicit and opt-in, so a skills card does
  not silently claim eighteen sheet-wide names, and so slugification never has to
  answer what `Sleight of Hand` becomes or what happens when two rows collide after
  it. Prefilling the field from the label when the author first types in it is
  editor work and may follow.
- **Publishing from a `text` column.** The card shows `sword` where the note holds
  `[[Sunblade|sword]]`, and a name meaning either is a name meaning both.
- **Collapsing `display` into `compute`.** `display` is exactly one `compute`, and
  the sugar is what keeps the common case legible to a reader of the layout. That is
  the property `compute` gives up, so it is worth keeping where it is free.
