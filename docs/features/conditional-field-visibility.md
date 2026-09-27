# A Record set field shown only for some values of another

Status: shipped
Board card: A field on a rendered sheet that is shown only for some values of
another field. A Record set feature record holds `Recharges`, a level field
(none / short rest / long rest / always-on); `Uses` should show only when that is
a short or long rest, and an `Active` toggle only when it is always-on.

## Model question

**Two §13 entries, and the owner has settled both.** This document records the
answer and does not reopen it.

- **"Whether a field's placement may follow another field's value."** It ends by
  saying its neighbour, a field that exists only for some values of another, "is a
  separate question, and whichever is answered first decides the grammar a
  condition on a field is written in." This feature is that neighbour, answered
  first. **So this session picks the grammar for both**: the condition written
  here is the one a state-driven placement would be written in if it is ever
  built. Placement itself stays static and unbuilt. Only its grammar is decided.
- **"What a string type in the expression language would unlock, and whether the
  first thing it unlocks is worth it."** This feature is plausibly that first
  thing, since a string type is what turns `Recharges == 1` into the level's actual
  name. **The deferral is attached to that entry rather than answered**, as Part 1
  argues below.

### Part 1: where the condition lives, and what it may read (grammar B)

**A `visibleWhen` on the field being hidden, never on the field that controls it.
Its value is a boolean formula evaluated in that field's own record scope**, so it
reaches exactly what a computed field on that record reaches: the record's stored
fields, then the sheet. Like a computed field, it cannot read another computed
field (§5: "every computed field resolves against the stored layer").

**Why a formula and not a structured `{ key, equals }` or `{ field, in }` shape.**
Single-field exact match is the documented low end of the category: Notion, Google
Forms and Typeform all stop there. The trackers record what shipping the
restricted grammar first costs later. rjsf #850 asks for if/then/else because
`dependencies`' "limitations are very quickly hit". rjsf #2055 builds a large
`oneOf` over every combination. JSONForms #1807 wraps controls in dummy containers
to get a second rule. The placement entry's own cases ("a recharge matters while
the feature is spent") are numeric comparisons that a structured shape cannot
express. A formula in row scope is also a thing this plugin already has: the
` when ` clause on a modifier part is exactly that, evaluated in the row's own
scope (§4.2).

**It diverges from the editor's `visibleWhen` on purpose.** `ConfigFieldSpec.visibleWhen`
(`src/types.ts`, `editor/config-fields.ts`'s `conditionMet`, used by Pool's
`maxSource` and Card set's `sizing`) is the plugin's own declaration over a closed
set of config keys it can check at compile time. This one is written by the author
over character data, the way a computed field is. The two share a word and nothing
else: different grammar, different evaluator, and opposite failure directions
(below). The field's doc comment says so, so nobody tries to unify them.

**The magic number is a correctness hazard, not a readability cost.** The language
has no strings, and a level stores its position, so the case is written
`Recharges == 1 || Recharges == 2`. Grammar B reads the level by position. **So
reordering a level list silently changes what every condition reading it means**,
and nothing can detect that from the condition alone. This is the same failure
`components/column-types.ts` documents for the editor's own type list ("Appended,
never inserted"), one level up. **Named trigger: reordering, inserting before, or
shortening the level names of a field a condition reads.** The layout editor
reports it when it happens (see **Reorder**, below). Nothing rewrites the
condition.

**What the deferral to strings costs, attached to its entry.** A condition names a
level by number, not by name, and a reorder is reported, not prevented. Spelling a
level by name needs either a quoted literal, which is the string type, or a
derived identifier per level (say `Recharges_ShortRest`). **Level-name constants
are ruled out.** They would invent a second naming scheme in the expression
language, which is exactly what §13 holds open as the string type. Inventing them
now either forecloses that answer or ships two ways to say one thing. The deferral
therefore points at §13's "What a string type in the expression language would
unlock…" entry, and until that is answered the position legend and the reorder
Notice (see **Layout editor** and **Reorder**) keep the hazard visible.

**Out of scope, named here so it is not half-served:**

- **Relevance that stored data cannot compute** (a Call of Cthulhu phobia, a
  Mothership Panic Check). Such a field simply carries no condition.
- **5e Concentration**, which is a lock across records released by an unrolled
  save. That is a constraint, not visibility.
- **A Lancer frame deciding which mount fields exist.** That is structure, and a
  different feature.
- **Disabled.** Hidden and disabled are separate properties (Retool, Salesforce,
  rjsf and JSONForms all keep them apart). Only hidden is built.

### Part 2: a hidden field's stored value is untouched

**It is never cleared. It stays in the note, and the sheet keeps reading it.**
Hiding is a render decision, and there is no submission boundary here to justify
clearing on. Foundry, Roll20, Retool and JSONForms keep the value. React Hook Form
v7 reversed its default so that an unmounted field keeps its value. SurveyJS's
`clearInvisibleValues` defaults to `none`, and its clearing modes have open bugs.

The system evidence is the strongest argument against treating hidden as inert.
In 5e Wild Shape, the druid's own hit points are not cleared while hidden. They are
frozen and restored intact, with one rule for overflow damage crossing back. **A
hidden value can carry interaction rules of its own**, so a value that disappears
while hidden is data loss, and Constraint 4 names data loss as the worst failure
this plugin can have.

### Part 3: a hidden field still counts everywhere

**A hidden field contributes to every formula, aggregate, published name, modifier
push and reset exactly as a shown one does.** `scopeRows`, `scopeModifiers` and
`applyReset` never evaluate a condition.

**The reason is the cycle argument: a condition reads values, and no value reads
visibility, so the dependency graph cannot close through visibility.** Visibility is
a sink. That is also why no configuration-time cycle check is needed for
conditions. A cycle among the formulas a condition *reads* stays with the existing
runtime guards (§5), which §13 already records can never be complete: a condition
reading a name inside a cycle gets no value, and its field is shown and reported
(see **Failure**). Tab set's rule, "hiding is never a way to make a formula not
run", is the same statement one component over. A spreadsheet's `SUM` counting
hidden rows corroborates this. It is not the reason.

**An author who wants "Uses only for rest features" writes it in the aggregate's own
condition argument**: `sum(features, Uses, Recharges == 1 || Recharges == 2)`. The
same goes for a modifier. A ` when Active` clause reads `Active` while `Active` is
hidden, so a feature switched from always-on to short rest keeps pushing whatever
`Active` last held. That is the Wild Shape rule applied as the design intends, and
an author who means "only while always-on" writes
`when Active && Recharges == 3`. This is written into the `fields` description (see
**Config fields**), because it is the consequence a reader will otherwise report
as a bug.

### Which components honour it

**Record set only.** Table and Roster share `column-types.ts` and the columns
editor. Neither honours the key, and a `visibleWhen` on one of their columns is
**reported in the layout editor as a fixable error naming the column, while the
layout still loads and the component still draws**. It is not a layout-wide
refusal. §6's "refuses the layout" is for wrong shapes in shared config the plugin
itself reads (`reset`, `columns`), and this is a component's own field config,
where the established pattern is to report it where it can be fixed. It is not a
component `configError` either. `table.ts`'s own `configError` comment states the
reason: refusing blanks the table and withdraws every modifier its rows push,
"the worst trade available here". The precedent this follows is the second
modifier column, which is reported in the editor and never refused
(`editor/list-fields.ts`). The closest comparable tool has four open issues where a
visibility setting exists and a component silently ignores it, one of them because
hiding every field in a row left the row and its delete control behind
(`visibility: hidden` rather than removal). The report is the direct cure for that
silence. The registry contract enforces which components honour the key (see
**Acceptance criteria**).

### A condition that names its own field is refused

**A `visibleWhen` whose text names its own field's key is refused the way a
`visibleWhen` on a Table column is.** It is not honoured, so the field is drawn as
always shown. The layout editor draws a fixable error under that field's **Shown
when**, naming the field. The layout still loads, the list is not blanked, and
there is no `configError`. The owner's words were "refuse a condition that names
its own field, at layout read, with the same error a visibleWhen on a Table column
gets". Because the Table error is non-fatal, "refuse" is read here as "not honoured
and reported", never "the layout does not load".

**Detection is a static name scan**, using `nameSpans` from
`formula/expression.ts`, for the field's own key among the condition's bare names.
It runs in two places, from one predicate. The component checks it before
evaluating and skips the condition, so the field shows. The editor checks it to
draw the error. The predicate is exported from `formula/` as a function over an
expression's text and a key, since both `components/` and `editor/` may import
from there and neither may import from the other. One spelling, on PATTERNS §1's
one-step rung for a predicate: two copies could only be tested for still agreeing.
It reads bare names only, so a dotted name such as `abilities.Uses` does not name the field.

**Why refuse rather than report.** A self-reading field (`Uses` shown when
`Uses > 0`) hits zero, vanishes under the cursor, and leaves its value reachable
only through a reset. Refusing removes that class of failure instead of warning
about it. It also costs less than either mechanism it replaces: a lock report
still ships the trap, and a focus fallback only softens it.

**Residual, stated and not built:** a two-field ring (`Uses` shown when `Active`,
`Active` shown when `Uses > 0`), and a condition that reaches its own field
indirectly through a sheet name, are not refused. Either can still hide a field
under the cursor (see **Deliberately not doing**).

### The contract

**No new contract member.** Record set's `formulaFields` gains the pattern
`fields.*.visibleWhen`. That pattern is what makes the paste rewrite
(`resolve.ts`'s `visitFormulaFields`), `formulaTexts`, and `resolveField` /
`explainField` reach a condition with nothing else changed. `resolveFormulaFields`
already skips a `*` pattern, so no empty-scope pre-resolve runs on one.
`ColumnOptionsSpec` gains `visibleWhen?: boolean`, the editor half, opt-in on the
precedent of `placement` and `holderMax`. The layout parser learns nothing.

**One accepted over-report.** `formulaTexts` feeds the modifier accepting set, so a
condition mentioning `mod.X` marks `X` as accepting. That is coarse in §5's stated
direction and harmless.

**Publishes:** nothing new. **Stores:** one optional layout key per field. **The
character note is not touched.** **Existing notes and layouts (Constraint 4):** a
layout without the key draws exactly what it draws today. Adding, editing or
removing a condition writes only the layout, and it cannot remove a value.

## What it does

An author writes a condition on a Record set field, such as
`Recharges == 1 || Recharges == 2` under **Shown when**, and the sheet draws that
field only on records where the condition holds. On the others the field is
absent from the line or the body. Its value stays in the note and goes on counting
in every total, modifier and reset. A condition that cannot be worked out shows
the field and says why.

## Smallest version

This spec is already the owner's cut: Record set honours the key (hidden in
place, fail-open, with its problem line); a self-naming condition is refused;
**Shown when** with its parse error and position legend; the Table/Roster report
and its contract check; the reorder Notice. What it gives up: a field appearing is
not announced, and a two-field ring can still hide a field under the cursor.

## Design

### At a glance

```
Features                               (unheaded, 380px: the line closes up)
▸ Second Wind     Recharges [Short rest ▾]   Uses 1 / 1          🗑
▸ Aura of Prot.   Recharges [Always-on ▾]    ●                    🗑
▸ Darkvision      Recharges [None ▾]                              🗑

Features  (headed, wide: every field keeps its track under the strip)
                  Recharges      Uses      Active
▸ Second Wind     [Short rest]   1 / 1
▸ Aura of Prot.   [Always-on]              ●
▸ Darkvision      [None]
```

A reader sees only the fields that mean something on this record. On a headed
list, every value stays under its own heading, and a blank under a heading reads
as "not applicable here", the way a blank cell reads in a printed table.

### Evaluation

- **Where:** in `render`, per record, inside `drawRecord`, before the partition.
  One `context.resolveField(\`fields.${index}.visibleWhen\`, stored)` per
  conditioned field, with `index` being the field's **declared index** in
  `config.fields` (the body-fields spec's rule: the obvious implementation, a
  filtered array with its own indices, reads a neighbour's condition). `stored` is
  the scope `drawComputed` already builds: every non-computed field's value half,
  through `typedValue` and `storedValue`. Built once per record and shared by both
  calls.
- **Never elsewhere.** `scopeRows`, `scopeModifiers`, `applyReset`, `read`, `write`
  and `sample` do not evaluate a condition. That is Part 3, and a test holds it.
- **When:** on every render. The sheet re-renders on every committed edit, so a
  sibling edit re-evaluates every condition on the next rebuild. **A condition
  reads the note, not the draft.** That departs from Table, where a cell and its
  total follow the draft. Here, a field appearing and vanishing on each keystroke
  would move controls under the caret. A ring or a select commits on press, so for
  the case in the board card the change lands on the next rebuild. There is no
  optimistic repaint of siblings: a value change always alters the file, so the
  rebuild always comes (PATTERNS §5's own test).
- **Cost:** one expression per conditioned field per readable record per render.
  Forty records with three conditions is 120 evaluations beside the computed fields
  the same records already resolve. Sheet names a condition reads come from the
  memoised name table. A record whose fence did not read draws no fields, so it
  evaluates nothing.
- **The result must be true or false**, which is the language's own rule for
  `if()`, `&&` and an aggregate's condition (`asBoolean`). A blank or absent key
  means "always shown". A boolean literal written by hand (`"visibleWhen": false`)
  is its own answer, as `readPath` already treats one. Anything else (a number,
  text, or a formula that did not resolve) is a failure (below).

### Hidden in place: the element stays, the render does not

**A hidden field's cell stays in the DOM and carries the `hidden` attribute**, which
is `display: none`. It is removed from layout, from the accessibility tree, from
the tab order and from find-in-page. It is not `visibility: hidden`, which would
reserve its space and is the comparable tool's defect. Plain `hidden`, never
`until-found`: find-in-page revealing a field its condition hid would be wrong.

**Why the element stays rather than going, which is the argument this section owes.**
`view/cell-focus.ts` restores focus after a rebuild by a control's **index** among
the cell's `input, select, textarea, button, a[href]`. It counts through
`querySelectorAll`, which ignores visibility. Removing a field's one or two
controls would renumber every later control in the whole list. So pressing
`Recharges` on the first record (hiding `Uses` before it, showing `Active` after
it) would send focus to a different control, often on another record. Keeping the
element keeps every index fixed whatever the conditions say. This is the reason
the body-fields spec gave for keeping a closed body's fields in the DOM, applied
one step further. It also keeps `hidden` a one-attribute toggle rather than a
second drawing path, so a shown field is **the same control drawn by the same
`drawField` on the same commit path**. The body-fields spec asked the same of
itself.

**No `aria-hidden` anywhere.** Chrome repairs an `aria-hidden` subtree at runtime
when focus lands inside it, and warns. `hidden` takes the subtree out of the tree
and out of focus together, so the two cannot disagree.

**A stylesheet trap to guard.** `.sheetsmith-record-field { display: inline-flex }`
is an author rule, and it beats the user-agent `[hidden] { display: none }`. So
`.sheetsmith-view .sheetsmith-record-field[hidden] { display: none }` is written
explicitly, and a `styles.test.ts` guard holds that every rule giving
`.sheetsmith-record-field` a `display` has a `[hidden]` answer beside it. Without
the guard, the attribute is set, the tests pass, and every field still draws.

### Space: reserved exactly where alignment exists

- **Unheaded list, and a headed list below its threshold (the flex regimes):** the
  field takes no space and the line closes up. There is no alignment across
  records here to preserve (each record's line is its own flex row), so reserving
  space would leave holes for no reader benefit and defeat the point of hiding.
- **Headed list in its wide regime (the strip):** the field's **track** stays and
  its cell is empty. The tracks belong to the list, shared by every record under
  the strip. Today summary fields auto-place into those tracks, so a
  `display: none` cell would slide every later field one track left, out from under
  its heading. So in that regime each summary field gets an explicit
  `grid-column` from a `--sheetsmith-record-track` custom property, set with
  `style.setProperty` to its summary index (PATTERNS §5's sanctioned route).
  Hidden or not, a field lands in its own track. The strip still counts every
  summary field. N in `14.5em + 6em × N` is static, because the strip is the
  list's and not the record's.
- **Body block:** a hidden body field takes no space, and the pairs rewrap. **Where
  every body field on a record is hidden, the block itself carries `hidden` and the
  body drops `sheetsmith-record-body-has-fields`**, so the prose takes row 1 and no
  empty row or `--size-2-2` step is left above it. The block stays in the DOM for
  the index reason.
- **Every summary field hidden on a record:** the fields wrapper has no in-flow
  children, so the line is what `fields: []` draws, including that case's measured
  and deferred 2px at 320px or narrower. No new fix is made here.

**What that accepts:** in the wide headed regime, a heading can sit over a column
that is empty on every record this character holds. That is data-dependent, and it
is a blank table column rather than Custom System Builder #335's "a heading over
nothing": the heading names a field the list holds, and on another character that
column is filled.

### Composition with `placement`

The two keys are independent, and each field has both.

- **A summary field with a condition** is hidden on the summary line, under the
  regime rules above.
- **A body field with a condition** is hidden in the body block, and the block
  collapses when every body field on the record is hidden.
- **A condition never moves a field between placements.** That is the deferred
  placement question, and this feature settles only its grammar. If it is built,
  state-driven placement is a boolean row-scope formula on the field being placed,
  written in the same language as this one.
- A closed record already shows nothing for a body field, so a body field's
  condition only matters once the record is open. The block's contents are
  evaluated whatever the disclosure says, since the evaluation is per render, not
  per open.

### Focus

- **Focus stays on the control the reader used.** Their hand is on the
  controlling field, such as the `Recharges` select or ring. That control is not
  the one hidden, and because every index is stable (above), the rebuild puts focus
  back on it.
- **A field that would hide itself cannot.** The one route to hiding the focused
  control is a condition reading that control's own value, committed with Enter
  while focus stays in the field. That condition is refused (see **A condition
  that names its own field is refused**), so the field is always shown and focus
  has somewhere to land. `view/cell-focus.ts` is not changed.
- **The residual:** a two-field ring, or a condition reaching its own field
  through a sheet name, can still hide the focused control. The rebuild's index
  restore then lands on a `display: none` control, `focus()` does nothing, and
  focus falls to the page. This is stated, not built (**Deliberately not doing**).
- **No element is hidden while it holds focus.** The old DOM is discarded by the
  rebuild and the new one is born hidden, so the `aria-hidden` repair case cannot
  arise.
- **A field appearing is not announced.** A node born into the tree is not a change
  a live region reports, and this feature adds no sentence for it. The existing
  live region still announces the commit itself, as it does today. A spoken "now
  showing" line would need a live region that survives the rebuild, which is
  deferred as its own item. The owner's reason: an unmeasured accessibility promise
  is worse than an absent one, because it reads as handled.

### Failure: the field is shown, and the author is told

**Fail-open, the opposite of the editor's own `conditionMet`, on purpose.**
`conditionMet` hides a field whose condition names a key that does not exist,
because a typo in the plugin's own declaration showing a control is harmless and
hiding it is "the safer way to be wrong". On a sheet the direction reverses: a
hidden value is the worse way to be wrong. It is a counter the reader cannot see
still counting and a toggle they cannot reach still applying.

**Showing it alone is the silent half of the category's rename trap.** Rename
`Recharges` to `Recharge` in the editor, and every note is migrated (§10) while
every condition reading `Recharges` stops resolving. Every hidden field reappears,
and nobody is told why. So:

- **The field is drawn as if shown.**
- **One problem line per failing field, not per record**, as a `.sheetsmith-error`
  that is the first child of the list's records (under the strip on a headed
  list), before the first record, inside the scrolling list, so it never grows
  the placed box. Text through `explainField`, naming the
  fix: `"Uses" is shown on every feature because its condition could not be worked
  out: Recharges is not defined on this sheet. Fix the condition under Shown when
  in the layout editor.` Where only some records fail (a condition comparing a
  `number` field that holds text on one record), the line counts them:
  `"Uses" is shown on 2 features because …`, naming the first explanation met, in
  file order.
- **The editor's own check is parsing only**, on §7's rule for every formula field.
  An unknown name is a claim about data, and the sheet line is where it is
  reported. A condition that will not parse is reported under its input too.
- **Conditions are not migrated by rename.** They are formulas, and row formulas
  are not rewritten on a field-key rename. A computed field's `formula` is not
  either. No rename-time report is made. The sheet line reports the unresolvable
  condition when the layout is read, and that is the whole of the report.
- **Never a `configError`.** A condition that does not work must not blank the
  list, since that would take down the component the author is trying to fix.

### Reorder

**A commit to a field's level names (or to its unnamed level count) is compared with
the list it replaces.** Where any condition on this list names that field's key,
and a name present in both lists changed position or the count dropped (`levelOf`
clamps a stored value past the end, so a shortened list rereads some notes too),
the editor shows one Obsidian `Notice`:

`"Recharges" levels moved: "Always-on" was 3 and is now 2. The condition on
"Active" reads Recharges by position, so it now means something else. Check it
under Shown when.`

Where more than one name moved, it lists up to three and counts the rest, and it
names every field whose condition reads the key. **A level renamed in place moves
nothing and says nothing.** The report fires only for the list the condition lives
on. A Record set condition reading a *published* level elsewhere on the sheet (a
Table row published by key) is the same hazard every computed field reading that
name already has, and it is not widened here. **A reorder of a level list that no
condition reads raises nothing.** That list's stored positions are reread in every
note too, but that hazard is older than this feature and is recorded in
`docs/BACKLOG.md` instead (see **Commit boundaries**). The standing half is the
position legend under **Shown when** (below), which shows the new mapping once the
Notice is gone.


### Layout editor

- **A text input, Shown when, on every field's detail line** in a list whose
  `columnOptions.visibleWhen` is `true` (Record set's), on every type the list
  offers. It is placed **last on the line, after Inside the opened record**, since
  both are about the field as a whole and this one carries an error and a legend
  under it. Placeholder `Always`. `aria-label` is `${key} shown when`. It is
  written through `setOptional`, so a blank field deletes the key.
- It takes the formula name suggester with this component as the owner
  (`context.suggestNames(input, ownerId)`), so the record's own field keys come
  before anything on the sheet, as they do for a computed field's formula.
- It is checked with `fieldError(input, formulaProblem(field.visibleWhen))` on
  render and on commit, as every formula field is (`docs/features/formula-field-errors.md`).
- **A position legend under it**, as a `.sheetsmith-entry-footnote`, one line per
  `level` field the condition names: `Recharges: 0 None · 1 Short rest · 2 Long
  rest · 3 Always-on`. This is the mitigation of the magic number at the one place
  it is written, and the standing record after a reorder. It is drawn from the
  sibling's `levels`, or `0 … max` where the levels are unnamed.
- **A self-naming refusal**, as a `sheetsmith-field-error` under the input, drawn
  on render and on commit where the shared predicate finds the field's own key
  among the condition's bare names: `"Uses" is shown when its own value says so,
  and a field that can hide itself vanishes under the cursor and can only be
  brought back by a reset. This condition is not used, so "Uses" is always shown.
  Base it on another field.` The text is stored anyway, as every formula field's
  is. It is the same kind of error as the Table/Roster column error below: it
  names the key, and the layout still loads.
- **The `fields` description gains two sentences** (see **Config fields**).
- **The canvas preview obeys conditions.** `sample()` alternates flags and puts
  levels partway up, so of the two sample records one usually hides what the other
  shows, and the author sees the rule working before any character exists.
- **Table and Roster** (a list whose `columnOptions.visibleWhen` is not `true`)
  offer no input. **For each column carrying a hand-written `visibleWhen`**, the
  list draws a `sheetsmith-field-error` under it, on the second-modifier-column
  precedent: `"Weight" has a condition, and every column here is drawn on every
  row, so the condition does nothing. Remove it, or move this column to a Record
  set to show it only on some rows.` It is composed from `unit` and
  `holder`, so Roster says its own words. The key is carried and round-tripped
  untouched, and the component draws the column.

### Empty and error states

- **No records:** nothing to evaluate. The list is its add control.
- **An unreadable record:** no fields are drawn, so no conditions are evaluated.
  The record's own problem line is unchanged.
- **Every field hidden on a record:** a summary line of chevron, name and delete,
  with the body unchanged (above).
- **A condition that does not resolve, or does not come to true or false:** the
  field is shown, with one problem line for the list (above).
- **A condition that will not parse:** the same on the sheet, plus the parse
  error under **Shown when**.
- **A condition that names its own field:** the field is shown and no problem line
  is drawn on the sheet, because the refusal is a layout error, not a failed
  evaluation. The error is under **Shown when** in the editor.
- **A refused commit in a field that is then hidden:** it cannot happen. A refused
  commit writes nothing, so nothing re-renders and the field stays where the reader
  is.

### Breakdown

**A hidden field that moves a derived number is still named in that number's
breakdown, through the name the breakdown already gives it: the list and the
record.** `modifier-breakdown.ts` names a line by source component, row label and
definition. It has no field in it. A condition hides a field and never a record or
its name, so the line `Features · Aura of Protection — +1` always points at
something on screen. The reader opens that record and finds either the modifier
glyph or, where the push reads a hidden toggle through ` when `, the fact that the
toggle is hidden.

**Naming the field as well is not built, and the reason is Part 3's.** A push would
have to know its field's visibility, which means evaluating a condition inside
`scopeModifiers`, and so inside the modifier walk. A value's breakdown would then
depend on visibility, which is the cycle Part 3 exists to prevent: a condition
reading the target its own push is aimed at would enter the walk's guard.
**The residual is pre-existing, not caused here.** An aggregate has no breakdown at
all. A hidden `Uses` adding to `sum(features, Uses)` is named nowhere, exactly as a
closed body field's is today, and as any field's was before this feature.

### Reuse

| Need | Reused | Not written |
| --- | --- | --- |
| Evaluating the condition | `context.resolveField` / `explainField` over `fields.*.visibleWhen`, in the scope `drawComputed` builds | an evaluator of its own |
| Drawing a shown field | `drawField`, unchanged | a second drawing path |
| Hiding | the `hidden` attribute, and one `[hidden]` rule | a class of its own, `aria-hidden`, `visibility` |
| Problem line | `.sheetsmith-error` | a new error surface |
| Editor input | `setOptional`, `fieldError`, `formulaProblem`, `suggestNames`, `.sheetsmith-entry-footnote`, `sheetsmith-field-error` | a new editor widget |
| Opt-in | `ColumnOptionsSpec`, on `placement`'s and `holderMax`'s precedent | a component-name check in the editor |
| Name scan | `nameSpans`, behind one predicate in `formula/` | a regular expression over formula text, or a copy per caller |
| Reorder report | Obsidian `Notice`, as the editor's other after-the-fact reports | a modal |

### Settled with the owner

- **Table and Roster get an editor-only report, not a component `configError`.** The
  component's own configuration panel is where it is fixable, and `table.ts`'s own
  argument rules out blanking the table on the sheet.
- **A strip heading can sit over a column empty on every record** this character
  holds. That is the accepted cost of keeping tracks aligned in the headed regime
  (**Space**, above).

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `fields.*.visibleWhen` | text input on the field's detail line, a formula; absent means always shown | Shown when | (none of its own; the `fields` description carries it) |
| `fields` (amended) | columns | Fields | Existing text, plus: "Write a condition in **Shown when**, such as `Recharges == 1 \|\| Recharges == 2`, to draw a field only on the records where it holds. A hidden field keeps its value and still counts in every formula, modifier and reset, so a `when` clause reading a hidden toggle still applies. A level is read by its position, from 0 for the first name, so reordering a level's names changes what a condition reading it means." |
| `ColumnOptionsSpec.visibleWhen` | editor opt-in, `true` on Record set only | (none) | (not user facing) |

## Data and file model

**No change to the character note.** No key, section, fence entry or body byte
changes. A hidden field's value is the same `key: value` line in the same fence,
read, written, counted and reset as before. `read`, `write`, `sample`,
`scopeRows`, `scopeModifiers` and `applyReset` are not touched, and no note
round-trip test changes (Constraint 3 is not in play).

**The layout gains one optional key per Record set field, `visibleWhen`**, a string
(or a hand-written boolean), written by the editor as absence when blank. It
round-trips byte-identically through `parseLayout` and `serialiseLayout`, and the
parser does not inspect it. On a Table or Roster column the key is carried
untouched, reported in the editor, and ignored by the component. Constraint 2 is
not in play: a condition is layout text and writes no markdown. Constraint 1 is
not in play: the condition goes through the one parser.

**Hiding never deletes (Constraint 4).** Nothing writes to a hidden field except a
reset, which writes it exactly as it would a shown one. A body field already has
that behaviour, and §13 accepts it ("a reset changing a value nobody is looking
at").

## Acceptance criteria

### Held by tests

- [x] With no field carrying `visibleWhen`, the harness's `traits`, `spells` and `known_spells` draw a tree with no `hidden` attribute on any `.sheetsmith-record-field`. A blank `visibleWhen` draws the same `innerHTML` as the key's absence. (`record-set.test.ts`)
- [x] **A headed list with no conditions lays out exactly as before.** The explicit column numbers apply to every headed Record set, so this is the guard on that change. On `traits` (headed, wide, five summary fields, two body fields), each summary field sits in its own track in declared order: its `--sheetsmith-record-track` is its summary index, 1 to 5. The strip holds the same five headings over the same tracks. The `sheetsmith-record-set-fields-5` class and `--sheetsmith-record-fields: 5` are unchanged. Body fields carry no track number. The same holds for an unheaded list, which carries no track number at all. (`record-set.test.ts`, with `traits` also checked in the shots below)
- [x] A field whose condition is false on a record keeps its `.sheetsmith-record-field` element in the DOM with `hidden` set, on the summary line and in the body. Where it is true, the attribute is absent. The same record with the condition flipped has the same count of `FOCUSABLE` controls. (`record-set.test.ts`)
- [x] **The board card's case.** `Recharges` has levels `None / Short rest / Long rest / Always-on`, `Uses` has `Recharges == 1 || Recharges == 2`, and `Active` has `Recharges == 3`. For stored levels 0, 1, 2 and 3, exactly the right one of `Uses` and `Active` is shown. (`record-set.test.ts`)
- [x] The condition resolves by the field's **declared index**: a conditioned field declared after a body field, and after a computed one, reads its own condition. It reads stored siblings, and a computed sibling's name fails as unknown. (`record-set.test.ts`)
- [x] **A self-naming condition is refused.** `Uses` with `Uses > 0`, and with `Uses == 0 || Recharges == 1`, is shown on every record, including one storing 0. Its condition is never evaluated (a spy on the resolver), no problem line is drawn, and no `configError` is raised. `Uses` with `abilities.Uses > 0` is not refused. The editor draws the self-naming error under that field's **Shown when**, naming it, and stores the text. Component and editor call the one `formula/` predicate. (`record-set.test.ts`, `list-fields.test.ts`, the predicate's own module test)
- [x] **Part 3.** With `Uses` hidden on a record, `sum(<id>, Uses)` counts it. A `modifier` field hidden on a closed record pushes. A ` when Active` clause reading a hidden `true` applies. `empty`, `full` and `formula` resets write hidden `number` and `toggle` fields exactly as they write shown ones. No `fields.*.visibleWhen` path is resolved by `scopeRows`, `scopeModifiers` or `applyReset` (a spy on the resolver). (`record-set.test.ts`)
- [x] **Part 2.** Hiding a field by committing its controlling sibling writes one line, the sibling's, and leaves the hidden field's stored bytes unchanged. (`record-set.test.ts`)
- [x] **Fail-open.** A condition naming an unknown key, one resolving to a number, and one that will not parse each show the field and draw one `.sheetsmith-error` as the first child of the list's records (under the strip on a headed list). That line names the field and carries `explainField`'s text. A failure on two of five records says "on 2". The component raises no `configError`. (`record-set.test.ts`)
- [x] A `visibleWhen` of `false` written by hand hides the field, and `true` shows it. (`record-set.test.ts`)
- [x] **Headed regime with conditions.** Each summary field keeps its own track number whether hidden or not, so a field after a hidden one stays in its own track. `sheetsmith-record-set-fields-N` and `--sheetsmith-record-fields` are unchanged by any condition. (`record-set.test.ts`)
- [x] **Body collapse.** A record whose every body field is hidden keeps its `.sheetsmith-record-body-fields` block with `hidden` set, and its body does not carry `sheetsmith-record-body-has-fields`. One shown body field restores both. (`record-set.test.ts`)
- [x] **No new announcement.** A commit that flips a sibling's visibility sets the live region exactly as the same commit does with no conditions declared. (`record-set.test.ts`)
- [x] **The `[hidden]` guard.** This is the vacuous-pass shape `docs/PATTERNS.md` §10 names: the attribute is set, the tests go green, and nothing hides, because the author `display` rule beats the user-agent one. So the test is behavioural as well as textual. Every rule in `src/styles/` that gives `.sheetsmith-record-field` or `.sheetsmith-record-body-fields` a `display` must be answered by a `[hidden]` rule of `display: none` with equal or higher specificity. The check asserts it matched at least one such `display` rule, so a renamed class cannot turn it into a pass over nothing. The wide-regime summary field rule must read `grid-column` from `--sheetsmith-record-track`. (`styles.test.ts`)
- [x] **Registry contract.** This covers every registered component whose `configFields` holds a `kind: 'columns'` field.
  - Where `columnOptions.visibleWhen` is `true`, the component declares `fields.*.visibleWhen` (or `columns.*.visibleWhen`) in `formulaFields`. Rendering its `example` with `visibleWhen: 'false'` on the first entry leaves that entry's element with `hidden` set.
  - Where it is not `true`, the columns field draws the "does nothing here" error for a column carrying the key.
  - Record set is the only component on the first branch today. The test asserts at least one component on each branch.

  (`contract.test.ts`, and `list-fields.test.ts` driven over the registry)
- [x] **Editor input.** **Shown when** is offered on every Record set field type and on no Table or Roster column. Typing writes `visibleWhen`, and blanking deletes it. A condition that will not parse shows `formulaProblem`'s sentence on render and on commit, and is stored anyway. The suggester is bound with this component as owner. (`list-fields.test.ts`)
- [x] **Legend.** A condition naming a named `level` sibling draws `Key: 0 Name · 1 Name …`. One naming an unnamed level draws `0 … max`. One naming no level draws none. After a reorder, the legend reads the new positions. (`list-fields.test.ts`)
- [x] **Table and Roster report.** A Table column and a Roster column carrying `visibleWhen` each draw the error naming the column, in their own words. The component renders the column unchanged, and no `configError` is raised. (`list-fields.test.ts`, `table.test.ts`, `roster.test.ts`)
- [x] **Reorder.** On a field a sibling's condition names, committing `None, Long rest, Short rest, Always-on` over `None, Short rest, Long rest, Always-on` raises one Notice naming both moved levels and the reading field. Renaming `Always-on` to `Permanent` in place raises none. Shortening the list raises one. A list no condition reads raises none. A key rename raises no condition Notice, and the condition text is not rewritten. (`list-fields.test.ts`)
- [x] A layout with `visibleWhen` on Record set fields and on a Table column round-trips byte-identically through `parseLayout` and `serialiseLayout`. (layout parse/serialise test)
- [x] A paste of a Record set whose condition reads another component's id rewrites that id on the copy, through `visitFormulaFields`. (`paste.test.ts`)
- [x] `docs/BACKLOG.md` carries the row for a reorder of a level list no condition reads, and `src/backlog.test.ts` passes.

### Held by looking (`npm run harness:shot`, then `/design-review`)

The harness gains a `recharging` sample in the first free rows after `rituals`,
with `SHEET_FRAME` re-measured if it grows. It is headed, seven columns wide, with
`recordName` `Feature` and these fields:

- `Recharges`: a `level` select, levels `None, Short rest, Long rest, Always-on`
- `Uses`: a `number`, `maxSource: 'record'`, shown when `Recharges == 1 || Recharges == 2`
- `Active`: a `toggle`, shown when `Recharges == 3`
- `DC`, named `Save DC`: a body `number`, shown when `Recharges != 0`
- `Modifiers`: a `modifier`, with no condition

Its records:

- **Second Wind**: Recharges 1, `Uses 1 / 1`, open.
- **Aura of Protection**: Recharges 3, `Active: yes`, and a stale `Uses: 2 / 2`,
  open.
- **Darkvision**: Recharges 0, closed.
- **Rage**: Recharges 2, `Uses 0 / 3`, `Active: yes` stored while hidden.

Two more copies hold the same body:

- **`recharging_plain`**, unheaded and four columns wide, for the flex regime.
- **`recharging_broken`**, where `Uses` reads `Recharge == 1` (the rename trap) and
  `Active` reads `Active || Recharges == 3` (self-naming).

- [x] **No conditions, no change:** `traits` is pixel-identical to the previous shot at every width it is photographed at. This is the look half of the headed-layout guard above.
- [x] **Headed:** every shown value sits under its own heading on every record. Darkvision's line is blank under `Uses` and `Active`, and nothing has slid left.
- [x] **Unheaded, and at `sheet-list-narrow` (520px) and `sheet-narrow` (380px):** a hidden field leaves no gap. The line closes up, and pairs wrap whole.
- [x] **Body:** Second Wind, open, shows `Save DC` above its prose. Darkvision, opened in the shot's query state, shows no block and no empty step above the prose.
- [x] **The broken copy:** `Uses` is shown on every record, with one error line at the top of the list that is legible in both themes. `Active` is shown on every record, with no sheet-side line for it.
- [x] **Both themes and large text** (`text=24`).
- [x] **The editor:** `editor-record-fields` shows **Shown when** last on each detail line, the legend under `Uses`' and `Active`'s inputs, and the amended `fields` description. A broken-copy editor shot shows the self-naming error under `Active`. A Table's editor shot with a hand-written condition shows the column error.
- [x] `npm run lint`, `npm test` and `npm run build` pass, and `styles.css` matches `src/styles/`.

### The throwaway vault fixture

The vault is `~/Developer/sheetsmith-test-vault/`. It lives outside the repository,
so its recipe lives here (`AGENTS.md`).

**`Sheetsmith layouts/Record variations.sheetsmith`** (six columns) gains:

- A new Record set, `recharging` ("Recharging features"), at column 1, row 18. It
  is six columns wide and four rows tall, with `fieldHeadings: true`,
  `recordName` "Feature", and a **Long rest** binding of `full`. Its fields:
  - `Recharges`: a `level` select, levels `None, Short rest, Long rest, Always-on`
  - `Uses`: a `number`, `maxSource: 'record'`, `visibleWhen`
    `Recharges == 1 || Recharges == 2`
  - `Active`: a `toggle`, `visibleWhen` `Recharges == 3`
  - `DC`: a `number` named `Save DC`, `max` 20, `placement: 'body'`,
    `visibleWhen` `Recharges != 0`
  - `Temp`: a `number`, `max` 10, `visibleWhen` `Temp > 0` (self-naming, so
    refused)
  - `Modifiers`: a `modifier`, with no condition
- A Card, `rest_uses` ("Rest uses"), at column 1, row 22, three wide, `derived`
  `sum(recharging, Uses, Recharges == 1 || Recharges == 2)`.
- A Card, `all_uses` ("All uses"), at column 4, row 22, three wide, `derived`
  `sum(recharging, Uses)`.
- `features`, `spells`, `items`, `spell_cards` and the rest are unchanged
  controls. `armour_class` (row 4) is the modifier target.

**`Characters/Records.md`** gains `## Recharging features` holding four records:

- **Second Wind**: `Recharges: 1`, `Uses: 1 / 1`, and prose.
- **Aura of Protection**: `Recharges: 3`, `Active: yes`, `Uses: 2 / 2` (stale),
  `Modifiers: armour_class += 1 when Active`, and prose.
- **Darkvision**: `Recharges: 0`, and no prose.
- **Rage**: `Recharges: 2`, `Uses: 0 / 3`, `Temp: 0`.

Two other layouts gain one hand-written condition each:

- **`Sheetsmith layouts/Card variations.sheetsmith`**: `inventory`'s `Weight`
  column gains `"visibleWhen": "Qty > 0"`.
- **`Roster variations.sheetsmith`**: `approaches`' `Bonus` column gains
  `"visibleWhen": "Bonus > 0"`.

Press:

- **The board card's case.** On `recharging`, Second Wind and Rage show `Uses`,
  Aura shows `Active`, and Darkvision shows neither. Resize across the strip's
  threshold. Headed, nothing slides out from under a heading. Unheaded, the lines
  close up. Compare `features` (headed, no conditions) with its previous look: it
  must not have moved.
- **A hidden value stays live.** Change Aura to **Short rest**. `Active`
  disappears, and `Uses 2 / 2` appears with its stale value intact. **Armour class
  stays +1**, and its breakdown names `Recharging features · Aura of Protection`.
  Change it back.
- **Aggregates.** Read **All uses** (3: Second Wind's 1 and Aura's hidden 2)
  against **Rest uses** (1: Aura excluded by the aggregate's own condition).
- **The self-naming refusal.** On Rage, `Temp` is shown although it holds 0. Type 1
  and press Enter, then 0 and Enter: it stays shown and focus stays in it. The
  layout editor shows the self-naming error under `Temp`'s **Shown when**.
- **Resets reach hidden fields.** Press **Long rest**, then switch Aura to Short
  rest and confirm its hidden `Uses` was restored too.
- **Focus.** Tab to Second Wind's **Recharges** select, change it to Always-on with
  the arrow keys, and confirm focus is still on the select after the rebuild.
- **A key rename.** In the layout editor, rename `Recharges` to `Recharge`. Every
  note migrates, and no Notice mentions a condition. `Uses`, `Active` and `DC`
  appear on every record, and the problem line names each. Undo.
- **A reorder.** Reorder `Recharges`' level names to
  `None, Long rest, Short rest, Always-on`. The Notice names the moved levels and
  `Uses`, and the legend under `Uses`' **Shown when** now reads the new positions.
  Undo. Reorder `Rank`'s names on `features`, which no condition reads: no Notice.
  Undo.
- **Table and Roster.** Open Card variations' and Roster variations' layouts in the
  editor. The column error is under `Weight` and `Bonus`, both sheets draw those
  columns, and neither note's modified time moves.
- **Byte safety.** Confirm with a diff that `Records.md` changed only on the lines
  each press edited.

## Commit boundaries

These are a plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. `feat: Show a Record set field only where its condition holds`.
   `RecordField.visibleWhen` and its doc comment (including the divergence from
   `ConfigFieldSpec.visibleWhen`), `fields.*.visibleWhen` in `formulaFields`, the
   self-naming predicate in `formula/` and the component's skip, evaluation per
   record by declared index, `hidden` in place, the body block's collapse,
   `--sheetsmith-record-track` in the headed regime, the per-field problem line,
   the `[hidden]` and `grid-column` rules in `src/styles/sheet.css`, the
   regenerated `styles.css`, and the `record-set`, predicate, `styles`,
   round-trip and paste tests. A hand-edited layout can use it from here.
2. `feat: Write a Record set field's condition in the layout editor`.
   `ColumnOptionsSpec.visibleWhen`, `visibleWhen: true` in Record set's
   `columnOptions`, the **Shown when** input with its suggester, parse error,
   position legend and self-naming error, the amended `fields` description, and
   the `list-fields` tests.
3. `feat: Report a condition on a column that cannot honour one`. The Table and
   Roster column error in `list-fields.ts`, and the registry contract check.
4. `feat: Report a level reorder a condition reads through`. The reorder Notice on
   commit, only for level lists a condition on the same list reads, and its tests.
5. `test: Photograph Record set fields shown by a condition`. The three
   `recharging` samples in `harness/samples.ts`, the shots' frame figures, and the
   editor shots.
6. `docs: Record the condition on a Record set field`. The items:
   - SPEC §4.2's Record set config and sheet-view text (the key, hidden in place,
     fail-open, the self-naming refusal, Part 3).
   - SPEC §5 (a condition is a row-scope formula, and no value reads visibility).
   - SPEC §7's list of formula fields the editor checks.
   - SPEC §13's two `Resolved:` entries, written by `/land-it`: the neighbour
     answered, with the grammar for both; and the string deferral attached, with
     this cost, level-name constants ruled out.
   - `docs/UI.md` §9 (hidden in place, and the headed track rule).
   - A new `docs/BACKLOG.md` § Patterns row, since none exists today. Its four
     cells:
     - **Gap:** A level stores its position, so reordering or shortening a level
       list's names rereads every note's stored value, silently.
     - **Where:** `editor/list-fields.ts`, `components/level-ring.ts`.
     - **Fix:** Extend the reorder Notice from `conditional-field-visibility.md`
       to every level list, naming how many notes on the layout hold that field.
     - **Waiting on:** A decision that this data-safety report belongs in the
       editor rather than a migration.
   - This document's status.

## Deliberately not doing

- **A structured condition shape** (`{ key, equals }`, `{ field, in }`). Settled:
  grammar B.
- **A string type, or level names in a condition, and level-name constants.**
  Deferred to §13's string-type entry. Constants would invent a second naming
  scheme that forecloses that answer or duplicates it (**Part 1**).
- **Clearing a hidden value**, or any "clear when hidden" option. Settled: it is
  untouched.
- **Excluding a hidden field from formulas, aggregates, modifiers or resets.**
  Settled: it counts everywhere, and the aggregate's condition argument is the tool.
- **Disabled or read-only-when.** A separate property. Only hidden is built.
- **State-driven placement.** Its grammar is decided here, and it is not built.
- **Honouring a condition on Table or Roster columns, Card set entries, Track rows,
  or any `entries` list.** Table and Roster report the key. An `entries` list
  carrying one treats it as an unknown key: carried, and ignored.
- **A configuration-time cycle check for conditions.** Not needed (Part 3).
- **A two-field ring of conditions, or a condition reaching its own field through
  a sheet name.** Neither is refused or reported. Either can still hide a field
  under the cursor and drop focus to the page. This is stated, not built. The
  lock report and a focus fallback in `view/cell-focus.ts` were both considered,
  and they were replaced by refusing the direct case, which is the common one.
- **Announcing a field that appeared or disappeared.** Deferred as its own item: a
  view-level live region that survives the rebuild, measured by hand with a screen
  reader before anything promises it. An unmeasured accessibility promise reads as
  handled, which is worse than an absent one.
- **A rename-time Notice for a condition reading a renamed key.** The sheet's
  problem line reports the unresolvable condition when the layout is read.
- **Rewriting a condition on a field-key rename or a level reorder.** Reported, not
  migrated.
- **Following the draft.** A condition reads the note, not the keystroke.
- **Naming the hidden field in a modifier breakdown.** It would put a condition
  evaluation inside the modifier walk (**Breakdown**). **Giving an aggregate a
  breakdown.** A pre-existing gap, not caused here.
- **A mark on a record for the fields its conditions hid.** It would be a count
  without a name, Airtable's hidden-field count, which §13 recorded as moving
  Tidy 5e #1704's complaint rather than closing it.
- **A reorder Notice for a level list no condition reads.** The older data-safety
  hazard gets a `docs/BACKLOG.md` row in commit 6, not a fix here.
- **The `.sheetsmith-record-fields:empty` 2px fix.** Still deferred by the
  body-fields spec. A record whose every summary field is hidden inherits it.
- **Every other `docs/BACKLOG.md` row.**
