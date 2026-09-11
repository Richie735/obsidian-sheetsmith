# A formula field says what is wrong with the expression it holds

Status: shipped
Board card: Standard formula field error feedback. A formula config field in the
layout editor accepts anything and says nothing. `kind: 'formula'` falls through
to the plain text branch at the end of `renderComponentForm` in
`src/editor/config-panel.ts`: it calls `this.fieldError(text.inputEl, null)`,
stores the trimmed string, and persists. Nothing parses it. The author learns
their formula is broken by looking at a card on the sheet, or at the canvas, and
reading a "?".

## Model question

**None is settled, and one is cited.** No component-contract member is added, no
config field is added, nothing is stored, nothing is published, and no character
note is read or written.

- **The contract already declares what this needs.** `formulaFields` (§4.1) says
  which config keys hold an expression, and `contract.test.ts` already ties every
  flat entry to a `kind: 'formula'` config field. A component-side member — "check
  my own expression" — would be a fifth thing to implement for a rule that has no
  per-component half: an expression either parses or it does not, and
  `parseExpression` is the only thing in the plugin that knows. So the check is
  the editor's, and no component learns it exists.
- **What it publishes: nothing.** This draws into the DOM and into
  `context.errors`, a runtime map that is never serialised.
- **What it stores: nothing new**, and the answer to question 1 below is why —
  the commit is unchanged, so a formula field stores exactly the trimmed text it
  stores today. Constraint 3 is untouched by construction: no `persist()` call is
  added or removed, and nothing here can rewrite a layout on open.
- **Existing character notes: not touched.** Constraint 4 does not apply.
- **`docs/SPEC.md` §13's "whether a derived sheet owes a reader anything better
  than '?' before there is data" is cited and deliberately not opened.** It is the
  reason evaluation is out of scope (question 2), and the scoping is chosen so
  that whichever way that question goes, nothing here has to be undone: this
  feature reports what is decidable about an expression's *text*, and that
  question is about what a *value* should read as when the data behind it is
  absent.

## What it does

Every formula field in the layout editor pane marks itself and prints the
parser's own sentence when the expression it holds will not parse — on the
keystroke that commits it, and again every time the pane renders it, so a
hand-edited layout says so on first paint. It stores the text either way: a
formula is invalid for most of the time it is being written, and a field that
refuses to hold what its own checker refuses is a field an author cannot type
into.

## Smallest version

**Not taken — the owner chose the full design at the approval stop.** Kept as the
record of the choice, and as the shape of a rollback: it is commits 1 and 2 of the
list below, stopping before the list fields.

The panel's own `kind: 'formula'` fields only — a Card's and a Card set's
`derived` and `effective`, a Pool's `max`, a Track's `count` — checked at render
and on commit through the shared rule, with the list-shaped fields left exactly
as they are. One branch in `config-panel.ts`, one new module, one test file, one
harness view. What it gives up: every expression written *inside* a list, which
is where a Table's and a Record set's arithmetic actually lives — a computed
column's formula, a row value, a track row's segment count — so the pane would
mark a Pool's max and stay silent on the four column formulas beside it. It also
gives up the crowded-row question (question 5), the shot that answers it, and the
`.sheetsmith-detail-field` alignment fix that three shipped messages are waiting
on.

## Design

### The instances, from the registry rather than from the phrase "formula field"

Every expression-bearing config key, taken from each component's own
`formulaFields`:

| Path | Components | Where the author types it |
| --- | --- | --- |
| `derived`, `effective` | Card, Card set | Panel, `kind: 'formula'` |
| `max` | Pool | Panel, `kind: 'formula'` |
| `count` | Track | Panel, `kind: 'formula'` |
| `columns.*.formula` | Table | `renderColumnsEditor`, the **Formula** cell on a computed column's detail line |
| `fields.*.formula` | Record set | the same function — Record set's `fields` is a `columns` field |
| `rows.*.values.*` | Table | `renderRowsEditor`, one cell per row value |
| `rows.*.count` | Track | `renderEntriesEditor`, the segments cell on a track row |
| `reset.*.to` | Pool, Track, Table, Record set | `reset-field.ts` — **out of scope, see below** |

So it is four inputs plus one branch, not eleven: the two `columns` paths are one
control, and the six panel keys are one branch.

### The rule, and where it lives

Two functions in two homes, one policy each.

```ts
// src/formula/expression.ts — the parser's own verdict on one expression
expressionProblem(source: string): string | null

// src/editor/field-formula.ts — what a formula *field* does about blank
formulaProblem(source: string | number | undefined): string | null
```

`expressionProblem` returns `null` where the source parses and the
`FormulaError`'s own message where it does not. `formulaProblem` returns `null`
where the source is absent or blank after trimming, and otherwise defers to it.

**`PATTERNS` §1's policy tier is what requires both, and the earlier draft of
this spec cited the wrong rung.** The three-consumer ladder is written for
behaviour; §1's next paragraph is explicit that *"a policy climbs it in one
step"* and names the kinds — *"a timing, a bound, a row count, a set, or a
predicate"* — because for those *"drift* is *the entire risk"* and a
two-consumer guard test *"costs more than the module and proves less."* What
counts as an unparseable expression, and what its message says, is exactly a
predicate plus its copy. So each of these is required at its **second** call
site, not justified by reaching four.

Read that way, the duplicate the earlier draft was willing to keep is not
allowed. `parses()` in `parse/modifier-definitions.ts` is the same predicate,
written out with its own `try`/`catch`, so **it goes**: `expressionProblem` lands
in `formula/expression.ts`, beside the `parseExpression` and `FormulaError` it is
made of, and `parses(source)` becomes `expressionProblem(source) === null`. The
import boundary is what rules out `editor/` as the destination — `parse/` may not
import from `editor/`, and it already imports from `formula/` — but a boundary
that rules out one home is not a licence to keep two copies. Nothing that file
reports changes: its own sentences (`"<name>" has an amount that is not an
expression: "<amount>"`) are untouched, and it keeps discarding the reason,
because a definition's report names the definition and there are up to three
problems on one line.

**And §1's own recorded trap decides how far the extraction goes.** *"Share the
application, not the number, or the copy that can still drift is the one nothing
is watching"* — the standing example being `roundSum`, where the precision was
extracted while `Math.round(x * P) / P` stayed written at both sites. Here the
`try`/`catch` around `parseExpression` **is** the application. So no call site
keeps one, and no call site keeps its own blank test either: all nine calls —
four inputs at two moments each, plus `parses()` — go through one of the two
functions above and compose nothing themselves.

**Named `field-formula.ts`, corrected from this document's own
`formula-field.ts` during review:** the folder spells a widget `X-field.ts` and a
policy about fields `field-X.ts`, beside `field-commit.ts`, `field-error.ts` and
`field-lines.ts`, and this is a policy.

`formulaProblem` is a module of its own rather than a second export from
`field-error.ts` on §1's other test: that file's job is *where a message is drawn
and how it survives a rebuild*, and "blank means absent, and this is what the
parser said" is a rule, not a drawing. §10's rule gives it a test file, since it
has both an entry point and a reportable output. The blank half stays out of
`formula/` because blank-means-absent is the file-format rule the editor already
holds in `setOptional`, not something the expression language has an opinion
about.

**The check keys on the field the editor drew, not on `formulaFields`.** The
panel branch keys on `kind: 'formula'`, which `contract.test.ts` already proves
agrees with a flat `formulaFields` entry; the three list editors already know
which of their cells is an expression, because each drew it under its own label.
Matching `formulaFields`' `*` paths against a cell's position instead would be a
path matcher built to reach the four inputs the editors name for free. What that
costs is a coverage gap nothing would fail on: a component declaring a *fifth*
list path would get no check and `contract.test.ts` would stay green. A
registry-driven guard closes it — see the acceptance criteria — so adding one is
an edit to this feature's own list rather than a silent omission.

### The six questions, answered

#### 1. A field holds a formula it cannot parse. The commit is not refused.

The commit path is unchanged: trim, store, persist. The field then marks itself
and prints the reason. Nothing is reverted and nothing is rewritten.

The need underneath the want is to keep typing, and a formula is invalid for most
of the time it is being written — `floor((value` is on the way to something
correct. The two tools in the research that refuse the save are the two with
complaints about it: Notion discards the text on click-away, so the documented
practice is to copy the formula to the clipboard before leaving the editor, and
Excel's dialog rewrote a sheet name `Y17M12` to `YM1712` and offered that as the
fix. This plugin already took the same decision one field over and wrote it into
`SPEC` §5: *"A definition that will not parse is reported, not fatal."* The
function library keeps the line, leaves it out of the library, and lets every
sheet on the layout go on rendering.

It also decides the message's shape. `field-render-validation.md` had to split
five refusals into a reason and a revert clause precisely because those fields
*do* revert; nothing reverts here, so there is one message for both moments and
no split.

#### 2. Parsing is the whole of it. Evaluation is out.

A formula that cannot parse is wrong about itself. A formula that cannot evaluate
is making a claim about data that does not exist yet, and only the first is
decidable while authoring.

Four of the six formulas a real system asks for cannot evaluate on a character
holding no data and are correct anyway: a 5e ability modifier over a score that
publishes nothing until a value is stored; a pool fraction dividing by a max of
zero; a Lancer stat derived from a frame that has not been chosen; a sum over an
empty inventory, which succeeds and means nothing. Marking every formula that
fails against sample values marks all four, and the author's only fix is to stop
writing the correct formula. Excel ships the equivalent as a background
error-checking rule and the standard advice is to turn it off; Grist reaches the
same place from the other side and files it as a data problem, prescribing a
guard clause in the formula rather than a warning on the column. A marker that
fires on things that are not wrong is not a weaker good marker — it is one that
gets switched off and takes the true positives with it.

**So a name that resolves to nothing is not an error here**, and neither is one
that resolves to the wrong type. `SPEC` §5 already rules that a name the sheet
does not publish fails to resolve rather than defaulting to zero, and that the
component reading it says so on its own card; §13's open question about what a
cold derived sheet owes a reader is the question that would have to be reopened
to say otherwise, and it is not reopened here.

The canvas's sample scope (`docs/features/preview-sample-values.md`) is therefore
not used, and the middle option is refused too: **the expression's names are not
checked against the layout's published-name set.** That is decidable without a
character — `modifier-targets.ts` already does exactly that for a modifier's
*target* — but a formula field's name domain is not the published set. A column
formula reads row-local cells by column key and row values by name, a Card's
`derived` reads `value` and `mod.self`, `.value` and `.left` are reserved
suffixes, and the library's own functions are names too. Getting that domain
right per field is real work, and getting it wrong marks correct formulas, which
is the failure mode this whole question is about. It is also the first thing an
author-time suggester would need, and that is explicitly its own piece of work.

#### 3. At render, and on commit. Render is the load-bearing half.

The card that raised this says on commit. The precedent's whole argument is that
commit-only means a hand-edited layout looks clean — a field that looks perfectly
normal beside a card rendered entirely as an error — and a layout file is a thing
people hand-edit and share.

`renderFunctionLibrary` is the shape to copy: it calls
`showProblems(layout.functions ?? [])` unconditionally at the end of its own
render, deriving its state from the model every time rather than remembering a
verdict. Each of the four inputs gets the same treatment — one call to
`fieldError(input, formulaProblem(stored))` in the pass that already sets
`input.value`, `null` included, plus the same call from the existing `change`
listener after the value is stored. Nothing tracks "checked and passed": clean
and untouched are the same state, as they are for the eight rules the render
validation pass converted.

The commit-time call is not redundant with the render-time one, because the panel
and the columns list persist without redrawing, so a blur on a broken formula
would otherwise say nothing until some unrelated control rebuilt the pane.

`restoreFieldErrors` needs no change, for the reason `field-render-validation.md`
gives: `panel.render()` runs first and leaves `context.errors` already accurate
for these tokens, so the replay reapplies the same message to the same input and
is a no-op.

Running at render is also half of what `docs/BACKLOG.md`'s row on a complaint
outliving its text is waiting for, and that row is ruled on in its own section
below rather than here.

#### 4. The message carries the parser's own sentence: a cause or an expected token, no position.

**A position is work, not a cheap addition, and `src/formula/expression.ts` is
why.** `FormulaError` carries a message and nothing else — `class FormulaError
extends Error` with a one-argument constructor. `tokenize` slices a `rest` string
and never records an index, so a `Token` has no offset; `Parser` holds a token
index, not a source offset. A caret would mean adding an offset to every token,
threading it into the parser's four throws, and adding a field to the error class
every failure path in the engine constructs — a change to the shared engine for
one editor surface, and then a caret aligned under a single-line input in the
field's own font.

What it buys is small, because the parser's four parse-time sentences already
name a cause or an expected token, which is the register the research says reads:

- `Unexpected character "#" in formula.`
- `Expected ")" in formula.`
- `Expected a value in formula.`
- `Unexpected trailing input in formula.`

That is Meta Bind's half of the finding — *"Failed to parse. Check that your
syntax is correct."* plus what it expected — without Dataview's expected-token
dump, which its own issue 1009 has been open about since April 2022. The field is
one line long and the author's eye is already on it, unlike a multi-line query.

Printed verbatim, with no lead-in and no rewording. It is what
`function-library-field.ts` already prints for the same text through the same
parser, and a second spelling of one failure is `PATTERNS` §1's policy tier read
on copy rather than on code: two wordings of the same parse error is a policy
duplicated, where *"drift is the entire risk"* and the only guard is that they
still say the same thing.

**This overrides `PATTERNS` §4's copy standard, and that is a decision rather
than a miss.** §4 says *"Error text names the fix, not the fault"* `[judgement]`,
with `"max: 'con' is not defined on this sheet"` beating `"could not resolve"`.
The parser's sentences are fault-shaped. A formula field is where that rule
yields, for three reasons and in one narrow place:

- **The rule is scoped to a surface this is not.** §4 is *"Failure is a value,
  never an exception"* and opens with *"Components do not throw"*; its fix-naming
  sentence is about a component explaining a value it could not resolve, where
  `explain` exists precisely to name the fix. A parse error is not a resolution
  failure and has no `explain` behind it.
- **Three of the four already name the fix.** `Expected ")" in formula.` names
  it, `Unexpected character "#" in formula.` names it, and
  `Expected a value in formula.` names what is missing. The rule's own example is
  a *bare* failure, which is what the research says is the complaint, and none of
  these is one.
- **One spelling beats two that can drift**, which is the paragraph above. A
  hand-written fix-shaped sentence in the editor beside the parser's own on a
  card is the same failure reported two ways, and nothing keeps them in step.

So the named cost is one message, not the standard: `Unexpected trailing input in
formula.` is the one of the four that names neither a fix nor a cause, and it is
the one whose fault can be furthest from the report. Improving it means editing
the parser, which changes what a sheet's own cards say too, so it is recorded
here rather than done.

#### 5. A formula cell inside a list reports where its neighbours already do, on one new selector and no new class.

The crowded-row question was answered by the render-validation pass, and this
reuses all three of its answers:

- **A computed column's or a record field's `Formula` cell** sits in
  `labelled(detail, 'Formula')`, a `.sheetsmith-detail-field` column flex. Its
  message stacks under the input, exactly where **Level names**, **Levels**,
  **Minimum** and **Maximum** already put theirs on the same line — **and that cell is the
  one anchor in the pane with no left-aligning rule, so this feature writes it**;
  see below.
- **A Table row's value cell** sits in `listField(element, name)`, a
  `.sheetsmith-field`, which has its own rule making the message left-aligned and
  stacked under its input.
- **A Track row's segments cell** is a direct child of the grid row, and
  `.sheetsmith-entry-list .sheetsmith-field-error { grid-column: 1 / -1 }` already
  puts such a message on a full-width line under the row — where the entries
  editor's own primary-field message lands today.

**The detail field's alignment is settled here, and one CSS rule is written.**
`.sheetsmith-field-error` is `text-align: right`, and four constructions
override it — `.sheetsmith-field >`, `.sheetsmith-entry-list`,
`.sheetsmith-wrapping-row` and `.sheetsmith-component-form >`. There is no
override for `.sheetsmith-detail-field`, which is `display: flex;
flex-direction: column` — byte for byte the same construction as
`.sheetsmith-field` — so a message there stacks under a left-aligned control and
paints right-aligned, with `flex-basis: 100%` sizing it along the wrong axis.

The fix is to extend the existing rule's selector rather than add a fifth block,
because it is one construction and the four declarations are already right for
it:

```css
.sheetsmith-field > .sheetsmith-field-error,
.sheetsmith-detail-field > .sheetsmith-field-error {
	flex-basis: auto;
	padding-left: 0;
	text-align: left;
	white-space: normal;
}
```

In `src/styles/editor.css`, at the existing rule. `styles.css` is assembled from
`src/styles/` by `styles.build.mjs` and a build overwrites it, so the edit is to
the source part and `styles.css` is regenerated — `styles.test.ts` fails if the
two disagree. **This changes three shipped messages as well as the new one**:
**Level names**, **Levels** and a number column's **Minimum**/**Maximum** all
report into a detail field today and are all currently right-aligned there. That is the
occasion, not a side effect — one construction cannot have two answers — and it
means the harness views that hold a level column are re-read, not only the new
ones.

**Corrected while building: one shipped message rides the rule, not three.**
Measured in `list-fields.ts` and then in a shot: only **Level names** is built
with `labelled(detail, …)` and so is a child of `.sheetsmith-detail-field`.
**Levels**, **Minimum** and **Maximum** are each built as a
`.sheetsmith-position-field`
inside the detail line, which already has an override of its own — centred, with
`max-width: 8em` — so a `>` selector on the detail field never reaches them and
they are unmoved. The rule and its reasoning stand exactly as argued; the blast
radius is **Level names** plus the new **Formula** cell.

**What is photographed, exactly, because the first draft of this paragraph
claimed more.** The **Formula** cell is in `editor-row-error` and in this
feature's own two views, from a committed fixture, so a reviewer can re-take it.
The other three were looked at *once*, during the build, off a scratch fixture
that was reverted in the same session — an out-of-range **Levels** and a
one-name **Level names**, staged by hand, shot, read, and undone — which is not
a photograph anybody can re-take from this tree, and a picture that cannot be
re-taken is a claim again. So the honest statement is: **Formula** photographed;
**Level names** reasoned from its construction and seen once; **Levels**,
**Minimum** and **Maximum** unmoved under a rule this selector cannot reach, and
also seen once. The reason none of them is staged is that no sample can be:
**Level names** speaks only under two names, **Levels** only when no names are
stored, and the bounds only for a value that is not a real number — and
`field-render-validation.md` staged none of them either, which is why this
feature met them as reasoning rather than as pictures. That gap has a
`docs/BACKLOG.md` § UI row of its own rather than a third breakage here, which
this feature's own acceptance criteria cut to two.

**Staging **Level names** was tried, measured, and backed out, and the
measurement is the answer to `SPEC` §13's question about the list's cap.** A
design review asked for one fixture line so both alignments would land in one
picture. Measured on `editor-row-error` at 1500px: the cap resolves to **320px**
(the pane's em base is 16px), the columns list stands at **292px** of it with
everything drawn whole, and the **Level names** message is **45px** — three
wrapped lines in a detail column about 180px wide, not the one line a message is
assumed to cost. 292 + 45 is **339**, so the list becomes a scroller and **clips
19px off the last column's own detail line**. The picture would have been bought
by making the view it photographs clip, and the thing clipped is a column entry —
which is what the review's own cap finding had just established was *not*
happening. So the fixture stayed at two breakages, the alignment stays reasoned
from construction, and the occupancy is recorded in `SPEC` §13 where the question
lives.

Whether a narrow numeric field's message should be centred at all is nobody's
question yet: it is one construction with one answer, and it is not this one.

**One thing is still a look-at-it rather than a ruling.** A message adds a line
to a list row, so a columns list with two broken formulas grows against
`.sheetsmith-list-scroll`'s `20em` cap — `SPEC` §13's open question about what
that cap was chosen against, met from a new direction. That stays for the design
wave, and it is one of the reasons the harness views below are part of the
feature.

#### 6. An empty formula field is valid and says nothing.

`formulaProblem` returns `null` for blank before it reaches the parser, which
would otherwise report `Expected a value in formula.` on every field an author
has not filled in. Blank is a state each component reads rather than a hole: a
Card with no `derived` publishes its stored value; a Track row with no `count`
falls back to the component's; a computed column with no formula draws `—`, and
`table.ts` says why in its own comment — *"Nothing to compute is an empty cell,
not a value that failed."* Every one of these keys is optional, and the editor's
`setOptional` deletes the key when the field is cleared, so an empty field and an
absent key are one thing.

The one exception is `reset.*.to`, which is required when the action is
`formula` — and it already has a field-level rule saying so. It is out of scope
for the reason below, so this feature adds no second answer to that question.

### The fourth backlog row, ruled on: it narrows, it does not retire

`docs/BACKLOG.md`'s row *"A refused edit's complaint outlives the text it was
about"* (`editor/field-error.ts`, `editor/config-panel.ts`) waits on *"render-time
validation for the panel's own fields, or a ruling on which half of
`field-error.ts`'s policy governs them."* This feature is both of those for one
of the panel's field groups, so the row cannot be left unmentioned — it is a
fourth row beyond the three the card fenced off.

**The ruling: for a formula field the complaint belongs to the text**, and the
row's defect cannot occur there. That follows from question 1 rather than from the
render check. Nothing reverts and nothing is restored: the input keeps the typed
text, the config keeps the typed text, and the message is derived from that same
text — so there is no second value for a complaint to be about, and a rebuild
redraws the offending expression under the same message rather than a stored one
under a stale message. The render check is what closes the other direction: a
formula corrected by any path, including a hand edit to the file, clears its own
message on the next redraw.

**What that does not touch is the row's own standing example**, and it is why the
row survives. *"A red field says 'Whole number, 1 or more.' above a 7"* is the
generic `kind: 'number'` branch, which does revert — it reports and returns
without storing, leaving the typed text in the input, the old value in the
config, and the message in the map to be replayed over the restored 7 on the next
rebuild. The panel's label field, its four position numbers and the layout's
column count refuse the same way. None of them is a formula field and none of them
moves here.

So the row narrows to the panel's remaining fields and keeps its trigger. Its
"Fix" cell gains the ruling, so the next reader is not asked to re-derive which
half of the policy governs a field that reverts: the two halves are settled per
branch, not per pane.

### `reset.*.to` is deliberately left out, and this is the largest cut

Four components declare it, and it is the one expression-bearing path this
feature does not touch. `reset-field.ts`'s **Resets to** field validates only
from `change` today — one of the four call sites named in `docs/BACKLOG.md`'s row
on `modifier-definitions-field.ts` and `reset-field.ts`, whose trigger is *"a
pass over these two fields of the same shape"*.

Doing the commit half here and not the render half would put half a treatment on
a field whose other half is a named, reserved row — and it would leave that one
field in the worst of the three states: a stored blank, which stops the layout
loading at all, would say nothing at render while a stored bad expression spoke
up. So `reset.*.to` joins that pass rather than this one, with its required check
and its parse check arriving together. The residue, stated rather than left to be
found: an unparseable reset expression still says nothing in the editor and fails
at the press. *Corrected since: that residue is gone. The pass landed as
`docs/features/reset-and-modifier-render-validation.md` and `resetToProblem` in
`reset-field.ts` now answers both halves at render and on commit — the required
check and the parse check, arriving together exactly as this paragraph asks.*

### What a reader takes from it at a glance

Nothing new to learn. A broken formula field is the pane's existing invalid-field
treatment — a 2px `--background-modifier-error` outline inside the control's own
box, plus small `--text-error` text under it — which is what "Whole number, 1 or
more." and "A row name is required." already look like two rows away. The only
new thing on screen is that the text is the parser's.

## Config fields

None. No `configFields` entry, no stored key, and no component-contract member is
added or changed.

## Data and file model

Unchanged, and question 1 is why: the commit stores the same trimmed string it
stores today, so nothing about what a layout file holds moves. The feature writes
only to the DOM (`sheetsmith-input-invalid`, a `.sheetsmith-field-error` div) and
to `context.errors`, which is never serialised. No `persist()` call is added, so
Constraint 3 cannot be reached from here; no character note is read or written, so
Constraint 4 does not apply.

One consequence worth stating because it is *not* new: a layout file can hold an
expression that will not parse. It already can, from a hand edit, and `SPEC` §5
and §10 already say what happens — the component reading it shows `?` and says so
on its own card, and the rest of the sheet stays live. This feature moves that
report earlier, to the field where the fix is; it does not add a state the file
model did not already have.

## Acceptance criteria

- [x] `expressionProblem` returns `null` for an expression that parses and the
      `FormulaError`'s own message, byte for byte, for one that does not —
      `expressionProblem('floor((value - 10) / 2')` is `Expected ")" in
      formula.`, and `expressionProblem('value + #')` is its
      `Unexpected character` sentence.
- [x] `expressionProblem('sum(inventroy, Qty * Weight)')` returns `null` — it
      parses, and the name it reads is on no layout. The test names question 2.
- [x] `formulaProblem` returns `null` for `undefined`, `''`, `'   '`, and a
      number, and defers to `expressionProblem` otherwise.
- [x] `parses()` in `parse/modifier-definitions.ts` holds no `try`/`catch` of its
      own, and that file's existing problem sentences are unchanged —
      `modifier-definitions.test.ts` passes untouched.
- [x] No call site in `src/` catches around `parseExpression` for this purpose
      except the one inside `expressionProblem`, and no call site spells its own
      blank test — §1's "share the application, not the number".
- [x] A registry-driven guard asserts that every `formulaFields` entry across
      every registered component is either flat, one of the four list paths this
      feature covers, or rooted at `reset`, so a fifth shape fails a test rather
      than going unchecked.
- [x] Rendering the config panel over a Card whose stored `derived` will not
      parse shows the parser's message under **Derived** with nothing persisted —
      the assertion is on the vault-write counter, which is the instrument the
      pane harness has; over one that parses, nothing.
- [x] Committing an unparseable expression into a panel formula field shows the
      message **and** leaves the typed text both in the input and in the config —
      asserted on the record, not only on the DOM — and `persist()` was called.
- [x] Correcting that field and committing clears the message.
- [x] Rendering `renderColumnsEditor` over a computed column whose `formula` will
      not parse shows the message under that column's **Formula**; over a column
      with no formula, nothing. Two broken columns both show a message.
- [x] The same, driven through Record set's `fields`, so the shared control is
      asserted for both its components.
- [x] Rendering `renderRowsEditor` over a row value expression that will not
      parse shows the message under that row's cell for that value.
- [x] Rendering `renderEntriesEditor` over a track row whose `count` will not
      parse shows the message under that row's segments cell; over a row with a
      bare number, nothing.
- [x] None of the render-time calls calls `context.persist()` or
      `context.redraw()`, asserted against the `Recorded` counters the list-field
      tests already track.
- [x] No **Resets to** field gains a message at render, asserted, so the cut in
      the section above is visible in a test rather than only in prose.
      *Corrected since: the cut has been taken up, so the assertion this
      criterion points at no longer exists. `layout-editor.test.ts`'s case is
      inverted and renamed — the pane now marks that field with the parser's
      sentence — and `src/formula-field-coverage.test.ts`'s matching exemption
      for `reset.*.to` is retired with it.*
- [x] `harness/samples.ts`'s `brokenSamples()` gains two breakages — an
      unparseable `derived` on a keyless derived-only card, and an unparseable
      `formula` on the Skills table's computed column — and the broken sheet
      view's own accounting in that file's comments still holds: one config error
      on `armour_class`, five `?` cards.
- [x] A harness view shows a panel formula field marked with its message on first
      paint, in light and dark, with nothing typed.
- [x] `editor-row-error`'s existing view (`state=broken&open=skills`) shows a
      **Formula** cell marked inside the columns list, and the shot is re-measured
      if the added line moves the frame.
- [x] The `encumbrance` card's `derived` — `sum(inventroy, Qty * Weight)`, which
      parses and cannot resolve — reads **unmarked**, beside a canvas drawing `?`
      for it. This is question 2 as a picture, and it is the criterion a reviewer
      should look at first. **Not the same pane, which it cannot be**: a panel
      draws one component's form at a time, so the marked field and the unmarked
      one are two views — `editor-formula-error` and `editor-formula-unresolved`.
      The canvas is what they share: it draws the *same* `?` for both cards,
      which is the whole argument for marking the field.
- [x] `src/styles/editor.css`'s `.sheetsmith-field > .sheetsmith-field-error`
      rule names `.sheetsmith-detail-field > .sheetsmith-field-error` beside it,
      `styles.css` is regenerated so `styles.test.ts` passes, and no fifth
      declaration block is added.
- [x] A **Formula** cell's message reads left-aligned under its own control in
      a shot (`editor-row-error`). **Rewritten from what this criterion first
      asked**, on the correction in question 5: **Level names** rides the same
      rule and is reasoned from its construction rather than photographed,
      because no harness view stages it. **Its rule has two arms and neither is
      reachable from a sample**: fewer than two stored names, *or* any level
      written with nothing before its colon. All eleven level columns in
      `harness/samples.ts` declare two or more properly named levels, and none
      declares `max`, so `levelNamesReason` and `levelsMaxReason` cannot fire in
      any view. **Staging it was tried and backed out** — see question 5 and
      `SPEC` §13. And **Levels**, **Minimum** and
      **Maximum** are a different construction the selector deliberately does
      not reach, so "left-aligned" is the wrong outcome to ask of them. Neither
      is moved by this diff. The gap that a pane message can go unphotographed
      at all is a `docs/BACKLOG.md` § UI row.
- [x] `docs/BACKLOG.md`'s row on `modifier-definitions-field.ts` and
      `reset-field.ts` names `reset.*.to`'s parse check as part of the pass it is
      waiting for.
- [x] `docs/BACKLOG.md`'s row "A refused edit's complaint outlives the text it
      was about" is narrowed to the panel's remaining fields and carries the
      ruling, rather than being retired: it keeps its standing example, the
      number field's message above a restored 7.
- [x] One new `docs/BACKLOG.md` row records that an inline field error is neither
      announced nor linked to its input, unlike the function library's problems
      block, waiting on a ruling about whether the shared helper owns the
      attributes.
- [x] Every backlog edit in this diff stays inside the rules
      `src/backlog.test.ts` enforces: four non-empty cells, no strikethrough, and
      a whole row under 600 characters written to about 575. **Six rather than the
      three this criterion first named**: the three above, plus a § UI row for no
      view staging a detail-line message, one for an editor field clipping the
      character a message names, and an amendment to the `--text-error` row
      carrying a ratio per surface. The last three came from the design axis,
      which no criterion here anticipated.
- [x] `docs/SPEC.md` §7 records that the pane reports an expression a formula
      field cannot parse, at render as well as on commit, and stores it either
      way — the sentence §5 already carries for the function library.
- [x] `npm test`, `npm run lint` and `npm run build` all pass.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. `refactor: Ask the parser once what is wrong with an expression` —
   `expressionProblem` in `formula/expression.ts`, `parses()` in
   `parse/modifier-definitions.ts` reduced to a call to it, and the engine test.
   Behaviour-preserving: no message anywhere changes.
2. `feat: Say what is wrong with an expression a formula field holds` —
   `src/editor/field-formula.ts` and its test file, plus `config-panel.ts`'s
   formula branch calling it at render and on commit, plus the panel tests and the
   registry guard — which is `src/formula-field-coverage.test.ts`, a rule-scoped
   top-level file rather than a second `describe` beside the module, on
   `class-tokens.test.ts`'s own argument: it reads `src/components/` and would
   still be the right check if `field-formula.ts` were deleted.
3. `feat: Check a formula cell inside a list field as it renders` — the three
   `list-fields.ts` sites, at render and on commit, the
   `.sheetsmith-detail-field` selector in `src/styles/editor.css` with `styles.css`
   regenerated, plus tests.
4. `test: Photograph a formula field that will not parse` —
   `harness/samples.ts`'s two breakages and `harness/shot.mjs`'s three views,
   with the frames re-measured (8513 against a frame of 8600, so nothing moves)
   and the one shipped message this rule reaches, **Level names**, accounted for
   in question 5 rather than photographed — no view stages it.
5. `docs: Record what a formula field now says and what it still does not` —
   `docs/SPEC.md` §7, the three `docs/BACKLOG.md` edits, and this document's
   status.

Commits 1 and 2 are the smallest version, whole.

## Deliberately not doing

- **Not evaluating anything.** Question 2 is the whole argument. The canvas's
  sample scope is not read, and no formula is run.
- **Not checking an expression's names against the layout's published set.**
  Decidable, and refused: a formula field's name domain includes row cells, row
  values, `value`, `mod.self`, the reserved suffixes and the library's own
  functions, so a set-membership check marks correct formulas. It is the first
  thing a suggester needs, and a suggester is its own work.
- **Not suggesting published names or library functions as the author types.**
  Named out of scope by the card.
- **Not touching `reset-field.ts` or `modifier-definitions-field.ts`.** Its
  backlog row stays, with `reset.*.to`'s parse check added to what that pass owes.
  *Corrected since: that pass has run, and the row it was waiting on is gone —
  what replaced it is narrower and about the pane's replay rather than these two
  fields.*
- **Not adding the `isName`-when-`total` rule to a column key field.** Its own
  backlog row stays.
- **Not reopening whether a derived sheet owes better than `?`.** `SPEC` §13's
  question, cited as the reason evaluation is scoped out and left where it is.
- **Not changing `FormulaError`, `tokenize` or the parser's messages.** No offset
  is threaded through the engine for a caret (question 4), and
  `Unexpected trailing input in formula.` is left as it reads, because it is a
  sentence the sheet's cards print too.
- **Not changing `showFieldError`'s signature or `field-error.ts`'s policy
  header.** Including the tempting one-liner: the helper sets a class and a div and
  never `aria-invalid` or `aria-describedby`, where `function-library-field.ts`
  sets both plus `role="status"`. That asymmetry predates this feature and reaches
  every field in the pane, so it is a backlog row rather than a change smuggled in
  behind a formula field.
- **Not rewriting what `parse/modifier-definitions.ts` reports.** Its `parses()`
  loses its own `try`/`catch` to the shared predicate — §1's policy tier requires
  that — but its three problem sentences and its decision to discard the parser's
  reason are untouched. A definition's report names the definition and may carry
  three problems on one line; that is a different surface's judgement.
- **Not touching any CSS beyond one selector.** The
  `.sheetsmith-detail-field > .sheetsmith-field-error` addition is in scope and
  argued above; nothing else in `src/styles/` moves, and no new class is
  introduced.
