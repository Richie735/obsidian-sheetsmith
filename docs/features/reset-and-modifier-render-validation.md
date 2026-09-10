# A reset's expression and a modifier's name are judged before they are typed into

Status: shipped
Board card: `docs/BACKLOG.md` § UI's row, "`modifier-definitions-field.ts` and
`reset-field.ts` validate only from `change`" — the render-time treatment
`docs/features/field-render-validation.md` gave the other three list fields,
plus **Resets to**'s parse check, which `formula-field-errors.md` cut so the
required rule and the parse rule arrive together. Its Waiting on cell reads "a
pass over these two fields of the same shape". This is that pass.

## Model question

None. This changes when two existing editor-side rules run, adds one check to
one field, and touches no file the plugin's model questions are about.
`docs/SPEC.md` §13 is untouched — no §13 entry gates this, and the one adjacent
entry, the `.sheetsmith-list-scroll` cap's headroom, is a measurement the design
wave below consults rather than a question this answers.

- **No component-contract member.** `formulaFields` (§4.1) already declares
  `reset.*.to` as an expression on the three components that can hold one —
  `table.ts:914` is the instance — so the parse check the editor adds reads a key
  the contract has already named. Nothing new is asked of a component, and no
  component learns this exists.
- **Nothing is published, nothing is stored.** Every message drawn here goes
  into the DOM and into the pane's `errors` map, a runtime map that is never
  serialised.
- **Constraint 3 holds by construction.** No `persist()` call is added or
  removed at render, so nothing here can rewrite a layout on open.
- **Constraint 4 does not apply.** No character note is read or written.
- **Constraint 1 holds.** The parse check goes through `formulaProblem`
  (`editor/field-formula.ts`), which calls `expressionProblem`
  (`formula/expression.ts:778`) — the real parser, never `eval`.

## What it does

Three things a layout can already hold are marked on the field that would fix
them, at the moment the pane draws that field, rather than only on a keystroke
nobody is going to make. A modifier whose name is blank or repeated is marked on
its own **Name** field, where today the fault is reported only in the block under
the list — and the blank case there names no definition at all, so on ten
modifiers a reader cannot tell which row it is about. A formula reset whose
expression is missing says so on the **Resets to** field, which is a state the
editor itself creates and then quietly declines to save. And a reset expression
that will not parse says what the parser makes of it, which today nothing
anywhere says until somebody presses the trigger.

**The pass is smaller than its backlog row implies, and the spec's main job is
to say so honestly.** Of the four `change`-time refusals in `reset-field.ts`,
three guard states that cannot be stored *and* cannot be reached in memory, so
there is nothing to run earlier; a fourth call site in that file already has the
render-time treatment and cites the precedent in its own comment. Threading the
errors map into the three is the obvious-looking fix named by the row, and it is
argued against below rather than done — on two separate grounds, which the design
keeps apart because only one of them is a ruling that could land and change the
answer.

## Smallest version

**Considered and rejected; the full design is what is agreed.** Kept here as the
record of the option, not as a live one.

It would have kept the two **Resets to** rules — the required-expression seed and
the new parse check — plus their harness shot and the doc edits: one field in one
module, and the whole of what nothing else on screen reports. It would have
dropped the modifier **Name** seeding on the grounds that both faults are already
reported at render in the block under the same list, giving up the anchor and not
the report, and leaving the backlog row naming
`modifier-definitions-field.ts` alone.

**What defeats it is the blank case.** `parseModifierDefinitions` pushes that
problem with **no `definition` key**, because there is no name to put in one,
while every other problem in that file carries one. So the report a reader gets
today is "A modifier needs a name." floating under a list of ten, with nothing
saying which. The anchor is not a nicety over an existing report there; on that
branch it is the only thing that says where.

## Design

### Every `showFieldError` call site in the two modules

Confirmed against the source rather than taken from the precedent's list. The
storability column is the load-bearing one: a state a layout cannot hold and the
editor cannot reach is a state a render-time check can never fire on, and
writing one is dead code.

| # | Site | Rule | Errors map today | Storable / reachable | This pass |
| - | --- | --- | --- | --- | --- |
| 1 | `reset-field.ts:224`, trigger dropdown `onChange` | Duplicate trigger-and-column pair, then revert | No | **Neither.** `parseReset` throws over a repeated `bindingKey` (`parse/layout.ts:286`), so no file holds it; the handler reverts before mutating, the **Acts on** handler does the same, and **Add reset** only ever offers an unbound pair | Nothing |
| 2 | `reset-field.ts:278`, buffer toggle `onChange` | A binding left doing nothing at all, then revert | No | **Neither.** `parseBinding` throws when `action` and `buffer` are both absent (`parse/layout.ts:211`); the action dropdown writes `buffer: 'clear'` on its way past `NO_ACTION_OPTION`, and this handler reverts | Nothing |
| 3 | `reset-field.ts:402`, **Acts on** dropdown `onChange` | The same duplicate pair, then revert | No | **Neither**, as row 1 | Nothing |
| 4 | `reset-field.ts:432`, **Acts on** dropdown, render | The four column problems: none offered, none chosen, one that is gone, one the component refuses | Yes | Storable, and **already recomputed unconditionally on every render**, with a comment citing `field-render-validation.md` | Nothing |
| 5 | `reset-field.ts:479`/`485`, **Resets to** `onCommit` | A formula reset needs an expression | Yes | **Not storable in a file** (`parse/layout.ts:220`), **reachable in memory**: the action dropdown at `:244` writes `action: 'formula'` onto a binding with no `to`, persists and redraws | **Seed at render** |
| 6 | New, **Resets to** | The expression parses | — | **Fully storable.** `parseBinding` requires only a non-blank string, so a hand-edited or editor-written `to` of `mod(abilities.CON) *` loads and renders | **New rule, at render and on commit** |
| 7 | `modifier-definitions-field.ts:226`, **Name** `change` | A name is required, then revert | Yes | **Storable.** `parseLayout` validates `modifiers` only as an array of objects (`:474`); `parseModifierDefinitions` reports and drops | **Seed at render** |
| 8 | `modifier-definitions-field.ts:248`, **Name** `change` | Unique among the layout's modifiers, then revert | Yes | **Storable**, as row 7 | **Seed at render** |

Every other field in the two modules — a binding's action, a definition's
**Changes**, **Operator**, **Amount**, **Applies to**, **Bonus type** and
**When** — is unvalidated on the field today and stays that way.

### Rows 1, 2 and 3 get nothing, for two reasons that are not the same reason

The backlog row calls the missing errors map "a second defect living in the same
lines". Checked against the code, it is two findings rather than one, and
**they fail for two different reasons, only one of which is the open ruling.**
Bundling them would let the § Patterns row appear to cover all three, and the
next author would re-derive that wrongly.

**Reason one, rows 1 and 3: the replay function's type check, so the map is a
no-op by construction rather than by omission.** Both anchor on
`dropdown.selectEl`. `layout-editor.ts`'s `restoreFieldErrors` (`:504`) replays a
remembered message only where the token resolves to an `HTMLInputElement`, and
**deletes the entry for anything else**. So passing `context.errors` there stores
a key that the very next rebuild drops unreplayed: not a fix that was left out,
but one the mechanism cannot accept. **This is pane-wide, not local to this
file** — no `<select>` anywhere in the layout editor can carry an inline error
across a rebuild today, the **Acts on** picker's own render-time `problem`
(`:432`) included, which survives only because it is recomputed on every render
rather than replayed. Changing that is a change to the pane and to
`field-error.ts`'s policy, which this pass declines below.

**Reason two, row 2: the ruling, and this is the only site it bites.** The buffer
guard's token sits on `toggle.toggleEl`, the container div, while the guard
anchors its message on the `<input type="checkbox">` inside it
(`reset-field.ts:276`), which carries none — so nothing is recorded under any
key. But that inner element **is** an `HTMLInputElement`, so moving the token
would make the map work here, where it cannot be made to work for a select. The
reason to leave it is therefore not a type check but the ruling: the guard
reverts the toggle to `true` and returns without persisting or redrawing, so a
replayed message would sit over a restored, valid value. That is
`docs/BACKLOG.md` § Patterns' row "A refused edit's complaint outlives the text
it was about" exactly — the row `formula-field-errors.md` declined to answer, on
the ruling that a complaint belongs to the text only where nothing reverts. A
**Resets to** field keeps what was typed and so is on the other side of that
line; this one is not.

Rows 1 and 3 revert too, so the ruling would reach them if the replay ever did.
It does not, and that is the finding: **their exclusion does not wait on the
ruling, and the ruling landing tomorrow would not change them.**

So the backlog row's second clause names one gap that is a property of the whole
pane and one that waits on a ruling nobody has taken. Both are carried into a
narrower row rather than answered here.

### Rows 7 and 8: the reason and the revert clause, as the precedent split them

Both messages are worded as a revert — *"…, so this one was left as `"X"`."* —
which describes an edit that did not happen when the value is simply what the
file holds. Each splits into a **reason**, used at render, and the existing
sentence with its revert clause, used unchanged by the `change` listener. The
existing code already writes the reason alone in one branch (`named === ''`
gives `'A name is required.'`), which is the model for the other.

| Case | Reason, at render |
| --- | --- |
| Blank | `A modifier needs a name.` |
| Repeated | `"${named}" is declared more than once.` |

**Those are the parser's own words, not the field's, and the design review is
what corrected them.** The pair first drawn here was the `change` listener's
wording with its revert clause removed — `A name is required.` and
`"X" is already used by another modifier.` — which is right for a refusal and
wrong for a render, because at render the block under this list is *on screen
saying the same thing in different words*. Two answers to one question is
`docs/UI.md` §9, which this document already cites to refuse a parse check on
**Amount**; shipping it here would have been that refusal contradicted six rows
below the field. The repeat carries the parser's **first clause** only: its
sentence continues "The second is ignored, since two definitions with one name
could not be told apart", which has room under the list and none under a field.

So one rule decides *which* fault and each moment spells it: `nameFault`
returns `'blank' | 'repeat' | null`, `storedReason` gives the file's words and
`typedReason` the edit's. The typed pair is unchanged to the byte, and is not a
second answer to the same question — a refusal happens between renders, while
the block below is still describing the stored name and says nothing about what
was just typed. A second spelling of the parser's text is a real drift risk, so
the guard is a case rather than a comment: the field's message is asserted to be
*contained in the rendered report* for the same layout, which fails if either
surface is reworded alone.

**What the trade costs, chosen rather than missed: the field loses
*direction*.** "is already used by another modifier" told the author that
*theirs* is the one that loses; "declared more than once" states a count and
leaves which copy is dropped to the block's own continuation. A reader who
reads only the field learns there is a collision, not that this definition is
the one being ignored. It is recoverable — the mark is on the later definition,
which is the one dropped, and the block saying so is in the same container a few
rows down — and the paraphrase that would restore it is exactly what the
containment guard forbids, since it would no longer be the parser's sentence.
One wording that agrees with the report beats two that read better apart.

**The repeat marks the later definition only. That reads as a departure from
the precedent and is conformance to the parser.**
`field-render-validation.md` marks both sides of a duplicate, arguing there is no
original side to leave clean. Here there is one, and
`parse/modifier-definitions.ts` says so in its own words, in the line already on
screen in the block under the list:

> `"${name}" is declared more than once. The second is ignored, since two
> definitions with one name could not be told apart.`

It keeps the first appearance and drops the second. Marking both would tell the
author that their kept definition — the one every enrolled row resolves against
— is wrong, and would disagree with that sentence six rows below the field.

**The overlap with that report is accepted, and it is what the field mark is
for.** The list already re-derives both faults from the model on every render, so
this adds no fact; what it adds is the anchor. The blank case is the sharp
instance — the parser's line carries no `definition` locator, because there is no
name to locate it by, so with ten definitions on screen the report says a modifier
somewhere has no name. `reset-field.ts` already runs this exact pairing: the
**Acts on** picker carries its problem inline (`:432`) while the component's own
binding problems are listed under the form (`:555`).

The two rules are extracted as one module-local function returning the reason or
`null`, called by the render pass and by the `change` listener, which appends its
revert clause. One rule, one place — not a second copy (`PATTERNS.md` §1).
Comparisons stay trimmed on both sides, as they are today. **What the two
callers hand it differs**: the commit compares against every other definition,
because a name an earlier *or* a later one holds is refused either way, while
the render compares against the definitions before this one only, which is what
marks the later side of a repeat and no other.

**And finishing that reason into a sentence is a second rule, which moved to a
module of its own during the build.** A reason carries no trailing period so
that each moment can end it its own way, and turning `null` through and a
reason into `"…."` is one line — `reasonMessage`, which lived in
`list-fields.ts` while that file's four render calls were its only callers. This
field's **Name** made it two files, which is `PATTERNS.md` §1's one-step tier
for a policy, so it moved to `src/editor/field-reason.ts` and both files import
it. **Not exported from `list-fields.ts`**, on `field-error.ts`'s own precedent:
a file whose job is list-shaped config fields is not the home of a rule with
nothing list-shaped about it, and this module's imports from that file are
already a `docs/BACKLOG.md` § Patterns row. Named on `field-formula.ts`'s rule —
`field-X.ts` is a policy about fields. The `change` listeners keep composing
their pair of sentences inline, because routing one arm of a ternary through the
shared function and leaving the other beside it is worse than either
(`PATTERNS.md` §1, share the application rather than the number).

### Rows 5 and 6: one composed rule on **Resets to**

The two rules answer about the same text and are asked at the same two moments,
so they compose into one module-local function — call it `resetToProblem` — over
`reset.to`:

1. Absent, or blank after trimming: `A formula reset needs an expression.` — the
   existing sentence, unchanged.
2. Otherwise: `formulaProblem(trimmed)`, which is `null` or the parser's own
   sentence.

**The composition is why `formulaProblem` is not called alone.** That helper
answers `null` for blank, because a blank *config* field means an absent key
(`field-formula.ts`'s whole header). Blank here means a layout that will not
load. The two rules are opposite about the same input, so the field's own rule
runs first and hands the rest to the parser.

**At render and on commit, with the same function and different consequences.**
At render it seeds: `fieldError(text.inputEl, resetToProblem(reset.to))`, `null`
as readily as a message. On commit the blank branch keeps its existing behaviour
exactly — report and do not store — and the parse branch **stores the expression
and marks it**, which is `config-panel.ts:868`'s ruling taken as read: an
expression is invalid for most of the time it is being written, so a field that
refuses what its own checker refuses is a field an author cannot type into.

**Row 6 is the one new rule in this feature, and it is the carve-out the scope
names.** `formula-field-errors.md` cut it so that it would arrive beside the
required rule rather than a wave earlier. It is worth adding rather than merely
running earlier, because **nothing anywhere reports it today**: `parseTriggers`
checks names and dangling bindings only, `parseBinding` accepts any non-blank
string, and the author's first news of a broken expression is at the press, as
`Long rest could not reset: Spell list — …` from `sheet-view.ts:651`.

**And it is not extended to a modifier's Amount**, which is the same shape one
module over. That field's parse failure is already re-derived at render and
reported in the block under the list, through `parseModifierDefinitions`'
`parses()`. Adding a second sentence for it would be two answers to one question
(`UI.md` §9); adding one for `reset.to` is the only answer there is.

### What row 5 is really about, and what is not in scope

The blank **Resets to** state is not a hand-edited file — the parser refuses one.
It is a state **the editor produces**: choose **Set to a formula** on a binding
that has no expression yet, and `:244` writes the action, persists and redraws.
`layout-editor.ts`'s `persist()` (`:934`) serialises, re-parses, catches
`parseBinding`'s refusal, shows a `Notice` and returns without writing. That is
designed behaviour — its own comment reads "Invalid states stay in memory with a
notice and are written once corrected" — but between the notice and the
correction the pane draws an empty field with nothing under it, and every later
edit fails to save too.

**Seeding the field is the half of that this pass owns**: the reader is looking
at the field, and the field is where the fix is. **Whether the pane should say
anything more durable than a transient notice while it is holding an unsaveable
layout is a separate question**, reaching `persist()` and the pane's chrome
rather than a field, and it is recorded as its own backlog row rather than
answered here.

### The design wave: one message is staged and photographed, one is not

`docs/BACKLOG.md` § UI's row "No harness view stages any of the field messages on
a column's detail line" names this pass as one of its two triggers. The trigger
fires and the row survives, for a reason worth stating rather than leaving
implied.

**Staged: row 6, in `state=broken`, at `open=tab_spells`.** `brokenSamples()`
already rewrites configs by id, and the Spell list table already carries the
layout's only column-bound reset, which `editor-reset-column` photographs. One
branch gives it a second binding — `{ trigger: 'Long rest', column: 'Level',
action: 'formula', to: 'mod(abilities.CON) *' }`, a half-typed copy of the row's
own example — which `resetColumnsOf` accepts (`Level` is a `number` column, so
only `full` is refused on it), so the shot holds an ordinary **Acts on** row
above a **Resets to** field carrying the parser's sentence. New view:
`editor-reset-formula-error`, `surface=editor&theme=light&state=broken&open=tab_spells`,
`EDITOR_FRAME`. One theme, not two: the message is a `.sheetsmith-field-error`
under a `Setting`'s text input, which is the same construction
`editor-formula-error` and `editor-formula-error-dark` already photograph in both.

**It costs nothing against the cap the row measures, and that is why the row
stays.** SPEC §13's measurement — the columns list standing at 292px of a 320px
cap, and a **Level names** message costing 45px, putting it at 339px and clipping
19px — is about `.sheetsmith-list-scroll`, which is created in exactly two places,
`list-fields.ts:310` and `:809`. A reset binding's rows are `.setting-item`s in
the component form and are inside no scroller; the Modifiers list is outside that
class too, by its own header's argument. So this shot proves nothing about the
28px of headroom, the row's Gap is still unphotographed, and its Waiting on keeps
its other trigger — a fixture staging those messages under a cap that fits them —
losing only the clause naming this pass.

**Not staged: rows 7 and 8.** The harness's modifier definitions are a fixed list
on `harnessLayout` in `stub-app.ts`, shared by every modifier view on the sheet
and in the pane, and `state=broken` reaches component configs only. Staging a
blank or repeated name would mean varying that list by state through four call
sites of `harnessLayout`, which is more machinery than the picture is worth when
the same message shape — a `.sheetsmith-field-error` under a
`.sheetsmith-field` input in a list entry — is what `editor-row-error` already
photographs for the rows editor. Recorded here so a reviewer knows it was
weighed, not missed.

### Empty and error states

No new surface, so no new empty state. A field that validates clean at render is
in exactly the state a field nobody has touched is in: no
`sheetsmith-input-invalid`, no message element, no entry in the errors map —
`fieldError(input, null)` is called as readily as one with a message, which is
what makes a corrected fault clear itself on the next redraw. A layout with no
modifiers and a component with no bindings draw what they draw today.

## Config fields

None. No `configFields` entry, no stored key, and no component-contract member
is added or changed.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| — | — | — | — |

## Data and file model

Unchanged. Every check reads `reset.to`, `reset.action` and `layout.modifiers`
already in memory and writes only to the DOM and to the pane's `errors` map. No
`persist()` call is added at render, so a layout cannot be rewritten by being
opened, and Constraint 3 is untouched by construction. Existing character notes
are neither read nor written, so Constraint 4 does not apply. The one commit-path
change — an unparseable expression is stored and marked rather than stored
silently — writes the same bytes it writes today.

## Acceptance criteria

- [x] Rendering `renderResetField` over a binding with `action: 'formula'` and no
      `to` shows "A formula reset needs an expression." under **Resets to** with
      no `change` or commit fired.
- [x] Rendering it over a binding whose `to` will not parse shows the sentence
      `expressionProblem` returns for that expression under **Resets to**.
- [x] Rendering it over a binding whose `to` parses shows nothing under
      **Resets to**, and leaves the errors map without that token.
- [x] Committing an unparseable expression into **Resets to** stores it on the
      binding and marks the field; committing a blank one reports and stores
      nothing, exactly as today.
- [x] Neither render-time call invokes `context.persist()` or `context.redraw()`
      — asserted against the `Recorded` counters `reset-field.test.ts` already
      keeps.
- [x] Choosing **Set to a formula** on a binding with no expression leaves the
      pane with the message on screen, rather than an empty field.
- [x] Rendering `renderModifierDefinitions` over a definition whose `name` is
      blank shows "A modifier needs a name." on that definition's **Name**
      field — the parser's own sentence, so the field and the report under the
      list do not say one fault two ways on one paint (`docs/UI.md` §9).
- [x] Rendering it over two definitions sharing a name marks the **later** one
      only, with no revert clause, reading `"X" is declared more than once.` —
      the parser's first clause, the rest of its sentence being explanation the
      block has room for and a field does not.
- [x] A case asserts each render-time message is contained in the rendered
      report for the same layout, so rewording either surface alone fails
      rather than drifting.
- [x] A refusal typed into **Name** still reads with its revert clause, unchanged
      from today.
- [x] `reasonMessage` lives in `src/editor/field-reason.ts` and is imported by
      both `list-fields.ts` and `modifier-definitions-field.ts`, with no copy of
      its body at either render call site and no sixth import from
      `list-fields.ts`. No test file of its own: §10's consumer-tested
      exception, the condition being that both branches are driven by
      whole-message assertions in the two consumers' own files.
- [x] `harness/shots/editor-reset-formula-error.png` exists and shows the
      parser's sentence under **Resets to**, on a binding nobody typed into.
- [x] `harness/shots/editor-reset-formula-error-large-text.png` exists: the same
      query at `text=24`, in a measured `1500,1800` frame rather than
      `EDITOR_FRAME`. It is the only editor view at a raised **Text** setting,
      and it carries two claims — that a binding's two messages now measure the
      same, which no default-size shot can show at 12.8px against 13px, and
      that the pane's remaining `--font-smallest` tokens outgrow the labels
      beside them, which is the `docs/BACKLOG.md` § UI row this view exists to
      point at rather than anything this feature fixes.
- [x] `docs/BACKLOG.md` § UI's "validate only from `change`" row is gone,
      replaced by one whose own words name `restoreFieldErrors`'s
      `HTMLInputElement` check as the mechanism, and say that no `<select>` in
      the pane can carry an inline error across a rebuild — with the buffer
      guard's missing token in the row as the separate thing it is, waiting on
      § Patterns' ruling on a field that reverts.
- [x] `docs/BACKLOG.md` § UI gains a row for the pane holding an unsaveable
      layout with only a transient notice to say so.
- [x] The harness row's Waiting on cell no longer names this pass, and its other
      trigger stands.
- [x] `docs/SPEC.md` §7 no longer excepts a reset binding's **Resets to** from
      the formula fields the pane checks: the field is listed with the others,
      with the one thing that differs about it — a blank is reported there,
      because `parseBinding` refuses a formula reset carrying none — stated
      rather than left as an inconsistency. §7's **Modifier editor** bullet
      carries the field mark beside the report it overlaps.
- [x] `src/formula-field-coverage.test.ts` no longer exempts `reset.*.to`:
      it is in `COVERED`, the `!== 'reset'` filter and the `continue` are gone,
      and the floor case still holds. A cut written into a check is retired by
      the pass that closes it, or deleting the new render-time call leaves the
      guard green.
- [x] The two shipped feature docs this diff falsifies are **corrected rather
      than rewritten**, on `bf3bc66`'s house style: `formula-field-errors.md`'s
      residue paragraph, its ticked criterion whose assertion no longer exists,
      and its "deliberately not doing" row; `field-render-validation.md`'s
      out-of-scope paragraph and its matching row — including where its
      "identical gap" reading turned out to be two thirds true.
- [x] `npm test`, `npm run lint` and `npm run build` all pass.

## Commit boundaries

A plan for `/land-it`, not a schedule: the tree stays uncommitted through
implementation and every round of findings.

1. `fix: Say what a reset's expression is missing, and what it is` —
   `reset-field.ts` gains `resetToProblem`, called at render and from
   `onCommit`; the parse half goes through `formulaProblem`. Cases in
   `reset-field.test.ts`, `layout-editor.test.ts`'s case for the cut inverted,
   and `formula-field-coverage.test.ts`'s exemption for `reset.*.to` retired
   with it — the guard and the code it guards move in one commit. Plus the one
   CSS line this field earns: `src/styles/editor.css` holds this binding's two
   messages at `--font-ui-small` rather than one of them only, with `styles.css`
   regenerated.
2. `refactor: Give a field's reason one place to become a sentence` —
   `src/editor/field-reason.ts`, with `reasonMessage` moved out of
   `list-fields.ts` and that file switched to importing it;
   `modifier-definitions-field.ts` becomes its second consumer in the commit
   below. Ahead of that one rather than inside it: it is a shared-vocabulary
   extraction whose other half is a module this feature does not otherwise
   change, and it is behaviour-preserving — no message anywhere moves, which is
   what makes it separately revertable.
3. `fix: Mark a stored modifier name the list already refuses` —
   `modifier-definitions-field.ts`'s two name rules split into one `nameFault`
   and the two vocabularies that spell it, the file's words at render and the
   edit's on a refusal; the later side of a repeat marked. Cases in
   `modifier-definitions-field.test.ts`, including the one holding the field's
   sentence to the rendered report's.
4. `test: Photograph a reset whose expression will not parse` — the
   `brokenSamples()` branch on `tab_spells`, the `editor-reset-formula-error`
   view, and its `-large-text` twin in a measured frame, which is where the
   size fix below is visible at all.
5. `docs: Retire the change-only row and record what it leaves behind` —
   `docs/BACKLOG.md` § UI's six edits, `docs/SPEC.md` §7's two, and the
   corrections to `formula-field-errors.md` and `field-render-validation.md`,
   whose passages are annotated rather than rewritten so a reader can still see
   what was believed and when, and this document's status. The backlog edits are
   three rather than one on purpose: **the count does not compress.** The "validate only from `change`"
   row goes; a narrower row replaces it, naming `restoreFieldErrors`'s
   `HTMLInputElement` check as a pane-wide property and the buffer guard's
   missing token as the separate thing waiting on the § Patterns ruling; a new
   row records the pane holding an unsaveable layout behind a transient notice;
   and the harness row stands, minus the clause naming this pass. The design
   wave added three more: an inline error having no second channel in forced
   colors, the pane's six `--font-smallest` tokens outgrowing the labels beside
   them at a raised **Text** setting, and a clause on the announcement row for
   the two fields that now draw a silent fault *on open*. A pass that finds five
   adjacent gaps while closing one has done its job.

## Deliberately not doing

- **Not threading the errors map into the two duplicate-pair guards on selects**
  (`reset-field.ts:224`, `:402`). `restoreFieldErrors` deletes a token that does
  not resolve to an `HTMLInputElement`, so the map is a no-op there **by
  construction, not by omission**, and the same is true of every `<select>` in the
  pane. Not waiting on the § Patterns ruling: the ruling landing would not change
  them.
- **Not giving the buffer guard's checkbox a focus token**
  (`reset-field.ts:278`). It is the one site where the map could be made to work,
  and therefore the one the § Patterns ruling actually governs: the guard reverts
  and does not redraw, so a replayed message would mark a restored, valid value.
  Carried into the narrower row, waiting on that ruling.
- **Not writing a render-time check for a state that cannot exist.** A duplicate
  trigger-and-column pair and a binding doing nothing are both refused by
  `parse/layout.ts` and unreachable through the editor's own handlers, so a
  render-time branch for either is code nobody can trigger. This is the judgement
  `field-render-validation.md` made for its rule 1.
- **Not changing `showFieldError`'s signature or `field-error.ts`'s policy
  header**, including the `aria-invalid` / `aria-describedby` asymmetry with
  `function-library-field.ts`. Its own row, waiting on a ruling about whether the
  shared helper owns the attributes; `formula-field-errors.md` declined to smuggle
  it in and so does this.
- **Not widening `restoreFieldErrors` past `HTMLInputElement`.** It is the pane's,
  it reaches every field, and it only matters here for messages this pass argues
  should not be replayed at all.
- **Not touching `function-library-field.ts`**, which re-derives its problems from
  the model on every render already.
- **Not adding a parse check to a modifier's Amount**, nor any other rule to a
  field that has none today. `reset.to` is the single carve-out, and the reason is
  that nothing else reports it.
- **Not adding the `isName`-when-`total` rule to a column key field.** Its own row.
- **Not answering what a pane should show while it holds a layout it cannot save.**
  Recorded as a row instead.
- **Not staging a modifier-name message in the harness.** Weighed above: it would
  mean varying `harnessLayout`'s shared modifier list by state.
- **Not resolving the `.sheetsmith-list-scroll` cap question.** This feature's one
  new message is outside that class, so it neither spends the headroom nor
  measures it.
