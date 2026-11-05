# Component id rename

Status: shipped
Board card: "A component's id can be renamed in the layout editor." GitHub
issue #4: an author building a Nimble layout found that new components take
their ids from their default labels (`pool`, `card_set`), saw the starter's
`hp`, found no way to change an id in the editor, and hand-edited the layout
file. The id is what every formula types.

## Model question

**A new §13 entry, written before this doc: "What renaming a component's id does
to everything that names it."** The direction below was taken with the owner
before this spec, and the entry records it as *pending the build*. Its
`Resolved:` line is `/land-it`'s to write.

### Who names an id

An id never *addresses* stored data. Sections key on the label (SPEC §3.1), and
entries on declared keys, so no rename of an id can orphan a value. What an id
rename can do is leave something *reading* a name nobody publishes. Two
populations read one, and they differ in kind.

**Inside the layout file.** This list comes from an audit of the code, not only
from the brief:

| Site | Where it lives | Scope its names resolve in |
| --- | --- | --- |
| Every component's declared formulas | `formulaFields`, walked by `visitFormulaFields`: `derived`, `effective`, `max`, `count`, `rows.*.count`, `columns.*.formula`, `rows.*.values.*`, `fields.*.formula`, `fields.*.visibleWhen`, `reset.*.to`, `reset.*.where` | that component's own names (`localNames`: `value`, its row names, column keys), then the sheet |
| A modifier definition's target | `modifiers[].target`, `modifiers[].changes[].target` | a published name, compared byte for byte (SPEC §2, **Target**) |
| A modifier definition's amount and condition | `modifiers[].amount`, `modifiers[].changes[].amount`, `modifiers[].when` | **the enrolling row's** scope, then the sheet. The brief named the target and `when`. The amount is a third site the audit found: `armour_class += prof` reads `prof` |
| A promoted field | `promotedFields[].name` | a published name, the same as a target |
| A function body | `functions[]`, the text after `=` | the function's parameters, then the sheet. `load(Weight) = sum(inventory, Weight)`, `prof = ceil(level / 4) + 1` |

The rename does not rewrite these, each for a stated reason:
- **A function's own name** (`prof = …`). A function name is not a component
  reference. Where a component and a zero-parameter function share a name, the
  component answers first (`expression.ts`, `evalNode`), and renaming the
  component leaves the function as it was.
- **`reset[].trigger` and `reset[].column`.** They name a trigger and a part, never an id.
- **`modifiers[].note`.** It is never an expression (SPEC §2, **Modifier note**).
- **Unknown keys**, preserved verbatim on a component and at the top level. The
  rename cannot know what they mean, so it leaves them as written.
- **A formula that does not tokenize.** It has no name spans to rewrite.
  `renameNames` returns it unchanged, and the field keeps reporting that it does
  not parse (`docs/features/formula-field-errors.md`). If its text spells the
  old id, it goes on spelling it, and the author fixes it along with the parse
  error.

**Inside a character note**, an id is read only by text a player typed:
- a typed modifier part's **target** (`armour_class += 2`, `abilities.STR += 3`)
- its **amount** (`armour_class += prof`)
- its **`when`** (`… when level >= 5`)
- a Record set record's **formula ceiling** (`Uses: 1 / prof`)

A **named** part (`Ring of Protection`) reads nothing in the note. Its definition
is in the layout and is rewritten there.

### The answer: rewrite every reference inside the layout; report, never rewrite, the notes

**Inside the layout, every site in the table is rewritten in one `persist`,
which is one undo step.** The rewrite goes through `renameNames` on the
tokenizer's name spans, as a paste's does (`formula/rename-names.ts`), so the
`hp` at the start of `hp_max` is never touched and neither is a row name spelled
`hp`. The id inside `mod.hp` is rewritten (`mod.health`), because that is a
component reference. A target and a promoted name are read the same way: each is
a name, so `componentReferences(name, ∅)` finds its first segment, or the id
inside a `mod.` name. A function body is rewritten with that function's
parameters as local names, so a parameter that happens to share the old id is
not rewritten (owner decision 2).

**The notes are not rewritten.** Each of three reasons is enough on its own:
- What a note holds at those sites is free text a player wrote. A rename that
  edits it is the vault-wide search-and-replace §10 declines for modifier
  definition names.
- No contract member writes a modifier cell back, and none writes a ceiling
  alone. A rewrite would need the editor to learn each component's storage, or
  the contract to grow a writer that no other case needs. The level-reorder
  report refused the same trade (SPEC §13).
- §10 already rules on it: "A name read inside a note's expression is reported by
  the sheet and never migrated."

**The rename reports the notes instead, and the count is component-agnostic.**
Candidates come from `layoutCandidates` (`layout-notes.ts`), the `metadataCache`
frontmatter read the label migration uses. Each candidate is read the way
`buildSheet`'s hosts read it: `getSection(note, config.label)` and the
component's own `read`. Each `scopeModifiers` source is then called with the
inert resolver that `noteCandidates` already uses (`formula/sheet.ts`). That
resolver reads every part's own text and evaluates nothing. For each push,
`parseModifierPart(push.part)` either names a definition, which is skipped, or
gives a typed effect. The effect reads the old id when one of these holds:
- its target's references (`componentReferences(target, ∅)`) name it, or
- its amount or `when` does, read with `push.row.values`' keys plus that
  component's `localNames` as locals.

The locals are a union because the inert resolver leaves a computed column out
of `row.values`. If they were short, the count would err towards over-reporting,
never under. **The editor never learns a component's storage**, which is the
rule the level-reorder report was decided on.

**Conditions can be detected this way. Ceilings cannot.** A typed part's `when`
is inside the part's own text, so the path above sees it. A Record set ceiling is
not a modifier and is not published. Record set hands it to the host's
`resolveExpression` at render and at reset, and no member *returns* it. The other
routes to it all fail: `read`'s data is the component's own shape, `scopeRows`
carries values and not expressions, and calling `applyReset` with a recording
resolver uses a mutation as a read.

**So the report covers modifier cells, and says so.** Counting ceilings would
need the contract to grow by a member returning the expressions a component holds
in its data, and the owner cut that at approval (Deliberately not doing). The
Notice's notes sentence therefore reads "in modifier cells", never a bare "still
read". A bare sentence over a count that leaves ceilings out would give an author
renaming `prof` an all-clear over every `1 / prof` in the vault, which is the
silent case this report exists to close. A ceiling that still spells the old id
is reported where §10 already reports it: on the sheet, as `?` with the
evaluator's sentence.

### The owner's further decisions

1. **Capture is refused, and the refusal names the site.** A new id is refused
   when it would be shadowed at a site the rename rewrites. Such a site is
   either a parameter of a function whose body reads the old id, or a local name
   (`value`, a row name, a column key) of a component whose own formula reads
   it. The rewritten reference would then read the parameter or the cell and
   silently stop reaching the component. The audit found two more cases of the
   same shape:
   - **A literal**: `true` or `false`. The parser reads these before any lookup,
     so every rewritten reference would read the literal.
   - **A zero-parameter function the layout defines**, where any expression
     reads that name bare. A component answers before a function, so the new
     component would capture every existing read of the function. That is a
     capture of sites the rename does *not* rewrite, which makes it worse, since
     nothing on screen moved.
2. **Function bodies are rewritten with their parameters as local** (above).
3. **The per-row aggregate limit is refused, narrowly.** Decided at approval
   as (A) below. The options are kept so the next reader can see what was
   weighed.
4. **The `Notice` names the notes whose modifier cells still read the old id**,
   up to five, with a count past five, in the cross-layout paste notice's shape.
   It rewrites nothing in them, and it carries **Undo**. Design, "The Notice", gives the wording and the departure
   from §10.

### Point 3: the per-row arguments of `sum(other, …)` and `count(other, …)`

An aggregate evaluates its per-row arguments in each of `other`'s rows, and a
row is nearer than any other scope (`evalAggregate`: "The row is the nearest
scope there is, nearer than a function's own parameters"). `componentReferences`
does not model that scope. Its own comment records this as the known limit
accepted by the paste spec: "a name there that equals an id is read as the id."

For a rename this matters in two directions:
- **Old id shadowed.** `bulk = sum(inventory, level)`, where Inventory has a
  column `level` and a component is also `level`. The argument reads the column.
  Renaming the component to `lvl` would rewrite it to `sum(inventory, lvl)`,
  which now reads the component. The arithmetic moves.
- **New id shadowed (capture).** `bulk = sum(inventory, Qty * prof)`, where
  Inventory has no `prof` but has a column `Qty`. Renaming `prof` to `Qty`
  rewrites the argument to `Qty * Qty`. The rewritten read no longer reaches the
  component.

A modifier definition's `amount` and `when` have the same shape one step
removed. They are evaluated in the *enrolling* row's scope, and any component
declaring `scopeModifiers` can enrol, so a definition reading `level` reads a
column wherever the enrolling table has one.

- **(A) Refuse the rename where it occurs.** For each rewritten reference inside
  a per-row argument, the rename first finds the walked component by the
  aggregate's first argument and reads its `localNames`. It refuses if either the
  old or the new id is among them. A definition's `amount` and `when` get the
  same test against the `localNames` of every component that declares
  `scopeModifiers`. To know which aggregate a reference sits in,
  `componentReferences` gains one additive member, `rows?: string`, the id
  walked by the aggregate whose per-row argument holds the reference. A paste
  ignores it. The refusal names the site and the fix, for example: `"level" is
  also a column on Inventory, and sum(inventory, …) in Load reads it from each
  row, so this rename cannot tell which one it means. Rename that column first,
  or the component to something else.` A reference in a per-row argument that
  neither id shadows is rewritten as usual. `sum(inventory, Qty * prof)` renames
  `prof` freely.
- **(B) Record it as a known limit.** Rewrite every per-row argument as
  `componentReferences` reads it today. A test pins the behaviour, `sum(inventory,
  level)` with a `level` column becoming `sum(inventory, lvl)`, and the field's
  description says nothing about it.

**Decided: (A), as recommended at approval.** First, (B) is the one path in
this feature that changes arithmetic with nothing on screen saying so. The
rewrite promises that a rename "breaks no formula", and (B) breaks one silently in exactly the case where the
author is least likely to notice: the result still parses, still resolves, and
reads a plausible number. Second, (A) costs little and touches nothing shared.
The test is one set lookup per rewritten per-row reference. It runs only in the
editor, at commit. `componentReferences` gains an additive member that the paste
does not read, so the paste's report and rewrite stay the one reader they are.
The case is rare by construction, since an id has to collide with a column key.
When it does happen, a refusal with a named fix costs the author one extra rename
instead of a wrong sheet. **The precise answer is to model the scope.** Under
that, the rewrite would skip an argument the walked rows answer, instead of
refusing. That fixes the paste's identical limit too, so it belongs to
`rename-names.ts` and both its callers, and it is recorded as the follow-up that
would lift (A)'s refusal. It is not this feature.

### The rest of step 1

- **The contract does not grow.** The ID field is shared config, as Label is,
  and is drawn by the panel, not by any component's `configFields`. Only
  `ComponentReference`, which is not part of the component contract, gains the
  additive `rows?` member (A) needs.
- **Published names**: an id rename changes every name the component publishes
  (`hp`, `hp.value`, `mod.hp`). Nothing else on the sheet publishes under the
  old spelling.
- **Storage and Constraint 3**: no character note is written. The layout file is
  rewritten through `serialiseLayout`, as every editor write is, so nothing new
  is introduced there.
- **Existing notes and Constraint 4**: no value moves, because nothing is keyed
  by the id. A typed part, an amount, a condition or a ceiling that still spells
  the old id resolves to an unknown name. The row says so on the sheet, a rest
  skips and counts it, and the note keeps its bytes (§10). The Notice names the
  note where the read is in a modifier cell; a ceiling is left to the sheet's
  own report.

## What it does

The component's form gains an **ID** field, where the panel already lists what
the component publishes. Committing a new id renames the component and rewrites
every formula, modifier definition, promoted field and function in the layout
that read the old one, as one undo step. A Notice names any character notes whose
modifier cells still read the old id, so the author can fix them by hand, and
offers **Undo**.

## Smallest version

The ID field. One shared validity check. The whole-layout rewrite. Capture
refusals, including literals and bare zero-parameter functions. The narrow
per-row refusal. Posture remapped at the commit and on undo and redo. The
Notice naming the notes whose modifier cells read the old id, with **Undo**.
This is the approved scope. It gives up a preview before committing, any list of
the sites it rewrote, rewriting notes, and counting record ceilings.

## Design

### §1. Where the field is

The block at the top of the component form already shows the id. It lists the
published names, `Formulas read this component as hp · .value · mod.`
(`published-names.ts`, drawn from `config-panel.ts`'s `renderComponentForm`).
**That block becomes the description of a `Setting` named ID, whose control is a
text field holding the id.** Nothing new is drawn beside the names. The
inventory keeps its chips, its classes and its wording, and gains one closing
sentence. The description sits under the row's name and above its field, as
Label's and Key's do, so the form reads name, description, field at every width:
the published names are what the field is about, so they are read first.
(Built at first as a described row, with the inventory moved below the field;
the owner reversed that at the land stop, for one order across the form.)

- **Name:** `ID`. Spelled as the acronym because `obsidianmd/ui/sentence-case`
  reads the word as one and fails the build on `Id`; running prose and every
  sentence the field shows keep the lowercase "id".
- **Description:** the inventory as it is today, followed by `Renaming the ID
  updates every formula in this layout that reads it.` For a component that publishes
  nothing, the inventory's own `Formulas cannot read this component.` stands
  alone. The field is still offered, because the id is still in the file and
  still keys the tree's posture. A rename there rewrites nothing and says
  nothing.
- **Control:** a text field with `spellcheck` off and focus token `id-<id>`.
  The token follows the rename, so after the redraw focus lands on the same
  field under its new token, as `label-<id>` does across a label commit.
- **Order:** first in the form, above **Label**. The id is what the inventory
  names. Card's and Passport's key descriptions already say formulas "use the
  component id above", and that sentence becomes literally true.

**This is the explicit gesture, and it is the shared one.** The field commits on
blur or Enter through `onCommit`, exactly as Label does, and Escape puts back
what it held. No pencil button, no modal and no "Rename id" menu item are added:
a field that commits a typed value is already this pane's gesture for a typed
name. **The label stays separate.** A Label commit never changes the id, never
offers to, and never mentions it. The test that keeps them separate
(`config-panel.test.ts`, "renames the label without moving the id") stays as it
is, and a new test asserts the reverse.

### §2. What a commit does

On commit with `to` ≠ `from`, in order:

1. **Validate.** The first rule that fails is shown through `fieldError` (the
   field-error map, so the pane's redraw replays it), the field is put back to
   `from`, and nothing is written. The sentences:

   | Rule | Sentence |
   | --- | --- |
   | blank | `An id is required.` |
   | not a name | `An id is letters, digits and underscores, and does not start with a digit.` |
   | reserved `mod` | `"mod" is where modifier slots live, so a component cannot use it.` |
   | reserved `self` | `"self" means a roster's own rows, so a component cannot use it.` |
   | literal | `"true" is a value, so formulas reading it would never reach this component.` |
   | taken | `"hp" is already another component's id.`, quoting what was typed |
   | captured by a parameter | `"x" is a parameter of tier(), which reads "level", so that read would stop reaching this component.` |
   | captured by a component's own name | `Inventory reads "Qty" as one of its own names, so its formula reading "level" would stop reaching this component.` |
   | captured from a function | `"prof" is a function this layout defines, so every formula reading it would read this component instead.` |
   | per-row (A) | the sentence in Model question, point 3, in the walked component's own word for the entry: `"Weight" is also a column on Inventory, …` on a Table, `"Uses" is also a field on Features, …` on a Record set |
   | unsaved layout | the existing `RENAME_REFUSED` sentence, asked through `renameRefusal` once every rule above has passed, as **Label** asks it after its own |

   The first four and "taken" are **the parser's own check**, shared rather than
   restated (below). A capture sentence names the *first* site found, in walk
   order, and the reader fixes that one and commits again. One field error has
   one sentence, so it does not list every site. The unsaved gate applies for the
   label's reason: the report this commit owes runs only once the layout is on
   disk, and a held write would drop it.

2. **Build the candidate on a clone**, as a paste does (`editor/paste.ts`,
   `cloneOf` then `checked`). Rewrite every site and set the component's `id`,
   then run `parseLayout(serialiseLayout(candidate))`. A refusal here writes
   nothing.
3. **Adopt and remap posture** (§4), redraw, and write through a
   `persistUndoable` sibling that, as `persistReorder` does, flushes open sheets
   and scans once the write lands.
4. **Report** (§3) and refresh open sheets. No note was written, so this is a
   refresh, not the migration's reload.

**The shared check.** `parse/layout.ts` exports `idProblem(components, id,
self): 'blank' | 'name' | 'reserved' | 'taken' | null`, beside `labelTaken`,
over the same `everyComponent` walk. `parseLayout`'s migrate loop and duplicate
check are rewritten to call its parts: `usableId` (isName and not reserved) and
`idTaken`. Its behaviour does not change. A hand-authored bad id is still
migrated on load, and a duplicate still refuses the file. The field and the file
then cannot disagree about what an id may be. Literal and capture are the
editor's, because they depend on the layout's expressions and not on the id
alone.

### §3. The Notice

Shown once, after the scan. It is shown only where the rename rewrote at least
one place or found at least one note. A rename nothing read says nothing,
because the inventory changing on screen is the acknowledgement. That is §10's
"a rename that matches nothing says nothing". It carries **Undo**, built
through `src/ui/undo-notice.ts`'s `offerUndo` exactly as the level-list reorder
notice is: the pane's `offerGuardedUndo`, guarded by the bytes the rename wrote,
so a press after anything else has changed the layout is refused rather than
undoing a different step. `UNDO_TIMEOUT` is the shared one.

| Case | Sentence |
| --- | --- |
| layout only | `Renamed "pool" to "hp" and updated the 3 places that read it.` (`the place` for one) |
| no layout places, notes found | `Renamed "pool" to "hp".` followed by the notes sentence |
| notes, up to five | `2 character notes still read "pool" in modifier cells: Ilona, Id renames. Change those by hand.` |
| notes, more than five | `8 character notes still read "pool" in modifier cells, among them Ilona, Id renames, Ravel, Sera and Thora. Change those by hand.` |
| unreadable notes | a final clause, the migration's own: `1 character note could not be read and was left alone.` |

- **"In modifier cells" is load-bearing, not decoration.** The scan does not
  read record ceilings (Model question), so a sentence without the phrase would
  read as covering every note-held expression. It never says a note is clear of
  the old id, only which notes' cells still read it.
- **"Places" counts fields, not occurrences.** One `derived` reading `pool`
  twice is one place. A definition's target and its amount are two.
- **A note is named by its basename**, in vault-path order, so a run is stable.
  It is plain text in a Notice: not a link, not selectable, nothing to press but
  Undo.
- **Why it names the notes, and why §10's label notice does not.** §10's rename
  bullet reports a count and "never *which* notes, a `Notice` being neither
  selectable nor clickable". Its reason is that "the count plus the old name is
  the route": the notes were already rewritten, and a vault search for `## AC`
  finds the stragglers. Neither premise holds here:
  - Nothing in the notes was rewritten, so *every* counted note needs opening by
    hand.
  - An id is a short token (`hp`, `prof`, `level`), and a vault search for it
    finds it in prose across every note, where a heading search finds the one
    heading.

  The list a reader would otherwise have to rebuild is therefore handed to them.
  The cross-layout paste notice already names up to five things in a Notice, and
  that sets the cap. **This is a recorded departure, not a revision of §10**:
  the label and key migration keeps its count-only sentence, and SPEC §13's new
  entry says so. The longest five-name sentence with realistic names is about
  170 characters, inside `UNDO_TIMEOUT`'s twelve seconds.

### §4. Posture follows the id

Three things the pane holds are keyed by id: `host.selection`, `host.collapsed`
(also the pane's saved view state), and `pressedFrom`, the way back to a press.
**At the commit**, all three are remapped from → to before the redraw. If they
were not, `render`'s fallback would move the selection to the layout row, and
the renamed container would spring open.

**On undo and redo.** The undo stack is whole-file text, so nothing in it is
keyed by id. But undoing a rename restores the old id while the selection holds
the new one. `Snapshot` therefore gains `renamed?: { from: string; to: string }`:
- The rename's step is pushed with it.
- `undo` pops it, remaps to → from, and pushes the redo entry carrying the same
  pair.
- `redo` remaps from → to.

A step with no `renamed` remaps nothing. Several renames in a row each carry
their own pair, so undoing them in turn walks the selection back through each
id.

The sheet's own posture keyed by id is **not** remapped: a Record set's open
records, its collapsed groups, and a Tab set's active tab on an open sheet. It is
per view, it is dropped when the view closes, and it falls back to the default
(closed, open and first respectively). See Deliberately not doing.

### §5. Empty and error states

- **Nothing reads the id.** The rename is written, posture follows, and no Notice
  appears.
- **No candidate notes**, or a file that is not its name's resolved layout. The
  layout is rewritten and the scan is skipped, the same as the label migration's
  `isResolvedLayout` gate.
- **A refused id.** The inline field error under the ID field, with the field
  showing the old id again.
- **A note that will not read.** It is counted in the unreadable clause, never
  as reading the id.

### §6. Module layout

Pure, tested without the app:
- `parse/layout.ts`: `idProblem`, `usableId`, `idTaken`.
- `formula/functions.ts`: `definitionParts(line)`, which returns `{ name,
  params, bodyStart } | null` from the one `DEFINITION` regex, so the body's
  offset is not found by a second pattern.
- `formula/rename-names.ts`: `ComponentReference.rows?`, under (A) only.
- `editor/id-rename.ts`: `renameComponentId(layout, from, to)`, which returns
  `{ layout, places } | { error }` over a clone. It holds every rewrite in the
  Model question's table, the capture checks, and the per-row check under (A).
  It also holds every sentence in §2's table except the parser's rules, which
  get their words here from `idProblem`'s kind.

Vault-facing, outside `parse/`, `formula/` and `components/`:
- `id-rename-report.ts`, beside `component-rename-migration.ts`. It holds
  `notesReadingId(app, layout, layoutName, id)` returning `{ names, unreadable }`,
  the pure `idRenameMessage(...)`, and nothing else.

Drawing:
- `config-panel.ts`: the ID row.
- `layout-editor.ts`: the commit path, the remap, and `Snapshot.renamed`.

Harness: the panel shot of a Card and of a Record set (an inventory with no bare
name) in both themes and at the narrow regime. The ID field and its description
are the only change to look at. A refused id's field error appears in one shot.

## Config fields

None. **ID** is shared config, drawn by the panel for every component as
**Label** is, and no component's `configFields` gains an entry.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `id` (shared, not `configFields`) | text | ID | The published-names inventory, then: "Renaming the ID updates every formula in this layout that reads it." |

## Data and file model

- **What is written:** the layout file, once per rename, through the existing
  `persist`. The new id, and every rewritten site, are each replaced by its own
  name span. Every other byte of every expression is as the author wrote it.
- **What is read:** candidate notes, through `layoutCandidates` and
  `parseCharacter`, then each component's `read`, `scopeModifiers` (with the
  inert resolver). Record ceilings are not read. Open sheets are flushed first,
  so a part typed seconds ago is counted. This is the level-reorder report's
  reason.
- **What is never written:** any character note. Constraints 3 and 4 hold by
  construction, since no note is opened for writing. A note's `process` is never
  called. The flush writes only what a sheet already held as an unsaved edit,
  exactly as for the label migration.
- **Undo:** one step, restoring the old bytes. Because the notes were never
  touched, undo leaves no note-side state to reconcile, unlike the label
  migration's undo.

## Acceptance criteria

Rewrite:
- [x] Committing a new id in the **ID** field renames the component. In the same
      write it rewrites the old id at every site in the Model question's table:
      a component formula, a `reset.*.to`, a `reset.*.where`, a definition's
      `target`, `amount` and `when`, a `changes[]` target and amount, a promoted
      field's name, and a function body. Each has a test.
- [x] The rewrite touches only component references. `hp_max`, a row name
      spelled `hp`, and `mod.self` are unchanged. `mod.hp` becomes `mod.health`.
      `sum(hp, …)`'s first argument is rewritten. A test covers each.
- [x] A function parameter spelled like the old id is not rewritten in that
      function's body (`scale(prof) = prof * 2` survives renaming `prof`), while
      another function's body reading the component is rewritten.
- [x] A function's own name, `reset[].trigger`, `reset[].column`, a definition's
      `note`, unknown keys and a formula that does not tokenize are left byte
      for byte.
- [x] One rename is one undo step, and undo restores the file's previous bytes
      exactly.

Validation:
- [x] The field and `parseLayout` share one check (`idProblem`). The parser's
      existing tests pass unchanged, and a test asserts that both refuse
      `armour-class`, `2nd`, `mod`, `self` and a duplicate at any depth.
- [x] Each rule in §2's table shows its own sentence as an inline field error,
      puts the field back to the old id, and writes nothing. A test covers each
      rule.
- [x] Capture by a function parameter is refused, naming the function. Capture
      by a component's own local name is refused, naming the component. A
      literal is refused. A zero-parameter function that some expression reads
      bare is refused. A test covers each.
- [x] Point 3, (A): renaming to or from a name the walked rows answer is
      refused at an aggregate's per-row argument and at a definition's `amount`
      or `when`, with the sentence naming the site. Both directions are tested
      (`sum(inventory, level)` over a `level` column; `prof` to `Qty` over a
      `Qty` column), and `sum(inventory, Qty * prof)` still renames `prof` to
      `proficiency` freely.

Separation:
- [x] A **Label** commit never changes the id, and the Label row says nothing
      about ids. The existing test stays, and an **ID** commit is asserted to
      leave the label and every note section heading unchanged.

Posture:
- [x] After a rename the renamed component stays selected, a collapsed renamed
      container stays collapsed, and focus is on the ID field. After **Undo
      layout edit**, run from the command palette, the same holds under the old
      id. After **Redo layout edit**, it holds under the new id again. Neither
      command has a default hotkey (`docs/features/editor-undo.md`). Each is
      tested through the pane, not only through the helper.

Notes:
- [x] The report finds a note whose typed part reads the old id as a target, in
      an amount, or in a `when`. It skips a named part and a part whose `when`
      reads a column of its own row spelled like the id. It names nothing in a
      note that has none of these. Tested against the stub with several notes.
- [x] The notes sentence always says "in modifier cells". A note whose only
      read of the old id is a record ceiling (`Uses: 1 / prof`) is not named,
      and a test pins that, so a later change that starts counting ceilings has
      to change the sentence with it.
- [x] No character note is written by a rename. The test asserts no `process`
      or `modify` call on any note. An open sheet with an unsaved typed part is
      flushed before the scan and counted.
- [x] The Notice's sentences match §3's table exactly, including the
      five-or-fewer and more-than-five forms and the unreadable clause. No
      Notice appears when nothing was rewritten and no note was found.

Checks and review:
- [x] `npm test`, `npm run lint` and `npm run build` pass. `parse/` and
      `formula/` gain no `obsidian` import.
- [x] The harness shows the ID row on a Card and on a Record set, in both themes
      and the narrow regime, and one refused id's field error.
- [x] The vault walkthrough below produces each stated outcome.

## Vault fixture

The vault is `~/Developer/sheetsmith-test-vault/`. **This step writes nothing to
it.** The build session places the following.

**`Sheetsmith layouts/Rename variations.sheetsmith` gains one Group, "Id
renames"** (id `id_renames`). The label migration's fixture already lives in
this layout, and an id rename is a rename capability rather than a component,
so it shares the file (memory: fixtures merge related capabilities). The
group's labels collide with nothing in `Renames.md`, `Collisions.md` or
`Untouched.md`. Because an id rename writes no note, `Untouched.md`'s
modified-time check is not disturbed. The group holds:

- **Level**: a Card, id `level`.
- **Proficiency**: a Card, id `prof`, derived `ceil(level / 4) + 1`.
- **HP**: a Pool, id `pool` (the issue's own default id), max `level * 8 +
  mod.pool`.
- **Inventory**: a Table, id `inventory`. Its columns are `Item`, `Weight`
  (number), `Qty` (number), `Effect` (modifier), and `Burden` (computed: `Weight
  * Qty + level`).
- **Features**: a Record set, id `features`, with a number field `Uses` whose
  ceiling is the record's own.

At the layout level:
- the function library: `tier(x) = x + level`, `scale(prof) = prof * 2`, and
  `bulk = sum(inventory, Qty * prof)`
- a modifier definition `Ring of vigour`: target `pool`, amount `prof`, `when
  level >= 3`
- a promoted field: name `pool`, property `hp`

**`Characters/Id renames.md`** is on that layout. Its Inventory table has two
rows:
- `Amulet`, with Effect `pool += 2 when level >= 5`, which is a typed target and
  a typed condition
- `Charm`, with Effect `Ring of vigour`, which is named and must not be counted

Its Features section has one record whose `Uses` reads `1 / prof`. The note's
preamble carries this walkthrough under a `###` heading, never `##`.

**What to press, in order:**

1. Select **HP** and change **ID** from `pool` to `hp`. The layout now reads
   `mod.hp`, the definition's target is `hp` and the promoted name is `hp`. The
   Notice reads `Renamed "pool" to "hp" and updated the 3 places that read it.
   1 character note still reads "pool" in modifier cells: Id renames. Change
   those by hand.` HP stays selected.
2. Press **Undo** in the Notice. Every place reads `pool` again and HP is still
   selected.
3. Run **Redo layout edit** from the command palette (it has no default
   hotkey). The rename is back and HP is still selected.
4. Select **Proficiency** and rename `prof` to `proficiency`. In `scale(prof)`
   the body still reads `prof`, because the parameter is local. In `bulk`, in
   the definition's amount and in Proficiency's dependants, `prof` becomes
   `proficiency`. The Notice names no note: Id renames' only read of `prof` is
   the `1 / prof` ceiling, which the scan does not count. Open the note as a
   sheet and the Features record draws `?` with the evaluator's sentence, which
   is §10's report for it.
5. Rename **Level** to `x`. This is refused under the field: `"x" is a parameter
   of tier(), which reads "level", …`.
6. Rename **Level** to `Qty`. This is refused, naming Inventory, whose Burden
   reads `level`.
7. Rename **Proficiency** (now `proficiency`) to `Qty`. This is
   refused, naming `sum(inventory, …)` in `bulk`.
8. Collapse the **Id renames** group in the tree, select it, and rename its id
   to `ids`. It stays collapsed and selected. Run **Undo layout edit** from the
   command palette, and it is still collapsed.
9. Change **Level**'s **Label** to `Character level`. The id stays `level` and
   no id Notice appears. This is the label migration's own path, and it reports
   only if a note holds `## Level`.
10. **On an existing fixture, the realistic case:** in `Modifier variations`,
    rename `armour_class` to `ac`. The Notice names **Ilona**, which holds
    `armour_class += 2 as item when Worn` and friends. Undo afterwards, so that
    the fixture keeps its spelling for its own walkthrough.

The vitest suite carries the more-than-five and unreadable-note cases, because
the vault would need eight throwaway notes to show them.

## Commit boundaries

1. `feat: Share the component id check between the layout parser and the
   editor`. Contains `idProblem`, `usableId` and `idTaken` in `parse/layout.ts`,
   with `parseLayout` calling them, behaviour unchanged, tested. The label
   duplicate check goes through `labelTaken` in the same loop, so the parser
   asks both of its uniqueness rules the way the fields do; it now reports the
   first of a duplicate pair rather than the second, and the message names the
   label or id either way.
2. `feat: Rewrite a component id everywhere a layout reads it`. Contains
   `definitionParts` in `formula/functions.ts`, `ComponentReference.rows` under
   for (A), and `editor/id-rename.ts` with every rewrite, capture and per-row check,
   tested over layouts built in the test.
3. `feat: Name the character notes that still read a renamed id`. Contains
   `id-rename-report.ts`, the scan, and `idRenameMessage`, tested against the
   stub.
4. `feat: Rename a component's id from the layout editor`. Contains the ID row
   in `config-panel.ts`, the commit path, the Notice with Undo through
   `ui/undo-notice.ts`, the posture remap
   at commit, undo and redo, and the pane tests. The harness shots are reviewed
   here.
5. `docs: Record the component id rename`. Contains SPEC §7's editor bullet (the
   ID field) and §10. The ceiling bullet's "the layout's own formulas, which no
   rename rewrites" is reworded, because an id rename now rewrites them. The
   rename bullet points at the departure. The doc also gets this feature note at
   `built`, and the fixture recipe.

## Deliberately not doing

- **Rewriting character notes.** Model question. The Notice names them, and
  nothing writes them.
- **Renaming table column keys, roster row keys, layouts, or modifier definition
  names.** Out of scope by the brief. Each is its own question, and SPEC §13
  already declines the last two.
- **Counting record ceilings in the report (decision D, cut at approval).** A
  Record set ceiling (`Uses: 1 / prof`) is handed to the host's
  `resolveExpression` and returned by no member, so counting it would need the
  contract to grow by an optional `heldExpressions?(data, config)` returning the
  expressions a component holds in its data. The owner cut it: one member for
  one reader is a contract cost the report does not earn, and the ceiling is
  already reported where it fails, on the sheet as `?` with the evaluator's
  sentence and by a rest that skips and counts it (§10). The Notice's "in
  modifier cells" keeps the cut honest. The alternative, `src/editor/` reading
  a Record set's fences, is refused on the rule that the editor never learns a
  component's storage.
- **Modelling the per-row scope in `componentReferences`.** Recorded as the
  follow-up that lifts (A)'s refusal, for both the rename and the paste.
- **A preview, a dry run, or a list of rewritten places.** The Notice gives a
  count, and Undo is the way back.
- **Remapping a sheet's own posture** (open records, collapsed groups, the
  active tab) on open sheets. It is per-view posture that is dropped on close,
  and a rename is rare. The cost is that one view springs back to its defaults
  once.
- **Listing every capture site in one error.** One field error has one sentence.
  The first site is named, and committing again finds the next.
- **Offering an id from a label commit.** The two stay separate by the owner's
  decision. The picker still derives a *new* component's id from its label
  (`uniqueId`), unchanged.
- **Every row in `docs/BACKLOG.md`.**
- **A release.**
