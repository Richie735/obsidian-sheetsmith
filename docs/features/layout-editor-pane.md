# Layout editor pane

Status: shipped
Scope: The layout editor becomes a workspace pane — a tree of what the layout holds
beside a panel configuring the selected thing, with the function library and the
trigger list moving into that panel — covering SPEC §7 items 3, 4 and 5 and no
canvas.

## Model question

**Two, and the second is the one that matters.**

### The contract does not grow, and that is the design's main claim

The M4 survey found six things the component registry lacks against a canvas: a
preferred or minimum size, an icon, a way to mark a config field as accepting an
expression, a way for a component to report that a stored config is unusable, a
member the view can ask before rendering, and a minimum legible column count.

**This slice needs none of them.** `ComponentDefinition` gains no member,
`ConfigFieldSpec` gains no kind, and `contract.test.ts`'s `MEMBER_ORDER` is
untouched. That is worth stating as a claim rather than an omission, because it is
what makes the slice safe to take first: everything it moves is already generated
from `configFields`, `showsOneChild`, `applyReset`, `hasBuffer`, `palette` and
`configName`, all of which the interim editor already reads. A slice that had to
grow the contract would be a slice that had to be right about the canvas, and this
one does not.

The three gaps a reader will reach for, and why each is out:

- **A size hint** is needed by a drop, and nothing here drops. The add row keeps
  its `Math.min(2, parent width) × 1`, wrong for a Table and wrong for a Card set,
  and it stays wrong for one more slice.
- **Marking a formula field** is tempting, because the configuration panel is
  exactly where a Pool's `max` is drawn as a plain text box with no hint that it
  takes arithmetic. It is still a contract change, and taking it here would make
  this slice about the contract. It belongs with whichever slice first adds a
  member (SPEC §13's free-string row wants `configFields` typed against `TConfig`
  at the same time, and two members arriving together is the cheaper edit).
- **`validateConfig`** would close UI §12's *loaded value never validated* row.
  That row's own named fix is inside `list-fields.ts` — "run each list field's own
  rule over its stored value as it renders and seed `context.errors`" — so it
  needs no contract member either, and it is not this slice's because this slice
  only relocates `list-fields.ts`.

### The §13 question: whether Table gains a `select` column type

§13 parks it on M4 by name, and the reason is an editor-shape reason rather than a
model one:

> the *model* half is settled by it and only the editor's shape is missing […]
> What it has no home for is the options list itself, which is a list inside one
> row of `columns[]`, which is a list inside a config field — and
> `list-fields.ts` renders records whose cells are scalars. That is an editor
> feature and belongs with M4's canvas rather than smuggled into a component.

So this slice touches the question, because this slice *is* the editor's shape. It
does not settle it, and the honest statement is which half moves:

**What §13's blocker actually names is two things wearing one sentence.** One is a
field kind — a list whose cells are themselves lists — which lives in
`list-fields.ts` and is unaffected by where the editor is rendered. The other is
that there is nowhere to *put* such a field: a nested disclosure inside a row of a
columns table, inside a settings-width control column, has no room to be legible,
and that is a fact about a 620px settings pane and not about the field kind.

This slice removes the second half and leaves the first. A configuration panel at
pane width has room for a disclosure inside a row where the settings tab did not.
So after this ships, the select column is blocked on a field kind and no longer on
a surface — which is a smaller question, and a different one.

**It is not settled here, and it should not be.** Settling it means designing the
nested list field, and §13 names two further things waiting with it that this
slice has no view on: `COLUMN_TYPES` is ordered and its header records that the
order decides the default, and a control in a cell has to carry row identity —
which is CSB #351 on exactly this control, a drop-down inside a dynamic table
where "when selecting an option for one of the rows it will often change the
selected option in other rows". Neither is reachable by reasoning about where the
editor lives. So: **the surface half is answered by building this, the field-kind
half stays open**, and the §13 entry gets amended rather than resolved when this
ships.

No other §13 entry is touched. A card's options-source question is blocked on two
decisions §13 records as not reopened for it, and nothing here reopens either.

### What it publishes to formulas

Nothing. This is an editing surface; it publishes no names and computes no values.

### What it stores, and Constraint 3

**Nothing new in the layout file.** No key is added, no key changes shape, and
serialisation is untouched. That makes Constraint 3 a *regression* criterion here
rather than a new claim: `layout-editor.test.ts` already holds two assertions on
it — that opening a layout does not write the file, and that an edit and its
reversal restore the file exactly — and both must pass unchanged with the editor
driven through the view.

One trap is already known and must not be reopened. Drawing a container's form
currently must not materialise `children: []`, because a layout two containers
deep carrying an empty `children` is one `parseLayout` refuses, so `persist` would
refuse every later save and the author would lose edits to a message about a depth
rule they never broke. The comment recording that sits at the schematic push in
`renderComponentForm`, and the guard is that the list is read and never created.
Moving the schematic out of the form must carry that guard with it. A criterion
below makes the whole-file bytes the assertion rather than the one key, which is
the stronger form of the same check.

**Where the pane's own state lives is the one genuine storage decision**, and it
is answered the way `SheetView` already answered it for a container's open tab:

> Held here rather than in the note, because it is this reader's posture and not
> the character's data — a plugin writing its own UI state into a file the user
> hand-edits would break the promise the whole plugin rests on.

The same reasoning, one level out: which layout is open and which component is
selected are the *author's* posture and not the layout's content, so neither goes
in the layout file. Obsidian's `View` gives two homes for it and they mean
different things (`obsidian.d.ts:7584`), so the split follows the meaning:

- **`getState` / `setState`** carries which layout is open. It is what a restored
  workspace should come back to, and reopening the pane on a different layout than
  the one that was closed would read as a bug.
- **`getEphemeralState` / `setEphemeralState`** carries which component is
  selected, and the scroll. A restored pane landing on the layout's own settings
  is correct; one landing deep in a form nobody is in the middle of editing is
  clutter.

### Constraint 4, and two things it is not fixing

No layout semantics change, so no character note is affected by this slice.

The survey found two live gaps in Constraint 4's neighbourhood, and **both are
named here precisely so a reviewer does not read them as this slice's regressions**:
a label rename does not keep SPEC §10's promise to offer to migrate matching
sections, and removing a container silently overwrites its children's `col` and
`row`. Both predate this work and both are out of scope. The rename is the one to
watch, because a bigger, more inviting editing surface makes renaming more
likely, not less — it should be the next data-safety slice.

Constraints 1, 2 and 5 are untouched: no expression evaluation, no character
writing, and `parse/` and `formula/` gain no import.

### One PATTERNS §2 boundary this slice can fix for free

`src/editor/layout-editor.ts` imports `SheetView` from `src/view/sheet-view.ts`,
because `persist` refreshes open sheet views after a write. That is the editor
layer reaching into the view layer. With a view in the picture the hop belongs
there, so `src/editor/` stops importing `SheetView` and the view supplies the
refresh as a callback — the same shape `ListContext` already uses for `persist`
and `redraw`.

## What it does

The layout editor moves out of the plugin's settings tab into a workspace pane,
where it has room to put a tree of everything the layout holds beside a panel
configuring whichever one is selected. The function library and the trigger list
move into that panel as the layout's own settings, reachable by selecting the
layout itself, which is also where the grid's column count becomes editable for
the first time. Settings keeps two preferences and a button that opens the pane.

## Design

### The pane

Two columns in the main area, so a sheet can sit beside it in a split — which is
SPEC §7's third stated reason for a workspace view.

```
┌──────────────────────────────────────┬─────────────────────────────┐
│ Layout file [DnD 5e Standard ▾] [🗑]  │                             │
│                                      │   Armour class              │
│ ┌──────────────────────────────────┐ │   Formulas reference this   │
│ │ ░░░░░░ the schematic ░░░░░░░░░░░ │ │   component as  `armour`    │
│ │ ░░ one block per component ░░░░░ │ │                             │
│ └──────────────────────────────────┘ │   Label      [───────────]  │
│                                      │   Position   col row w h    │
│  Layout                              │             [ 1][ 1][2][1]  │
│  Grid, functions, triggers           │                             │
│  Armour class           Card     [🗑] │   Resets on                 │
│  Hit points             Pool     [🗑] │   …                         │
│  Abilities              Card set [🗑] │                             │
│    Strength             Card     [🗑] │                             │
│                                      │                             │
│  [ Card ▾ ] [ On the sheet ▾ ] [Add] │                             │
└──────────────────────────────────────┴─────────────────────────────┘
```

Left: the layout picker, the schematic, the tree, the add row. Right: the panel.

Three things in that picture are decisions rather than drawing. **The picker is
"Layout file"**, not "Layout": the tree's first row is the layout, so two
adjacent rows under one name would be a reader's problem — this one chooses which
layout is open and the next configures the one that is. **A tree row has no
disclosure control.** A chevron in the settings tab opened a form under the row;
here the form is in the panel and a container's children are always listed, so a
triangle would disclose nothing — the row's own name is the button that selects
it, which is what makes "click a tree row" a control rather than a handler
(`docs/UI.md` §6). **And the remove control stays on the row**, where it already
was; nothing gained an edit affordance, because selecting is the edit.

### One selection, and the tree's first row is the layout

The whole design turns on this. Today the editor has a selection — `editing`, a
component id, set by clicking a tree row's chevron or a schematic block — and it
draws that component's form inline beneath its row. The pane keeps exactly that
selection and moves where the form is drawn.

**The tree's first row is `Layout`**, and it is selectable the way a component row
is. Selecting it puts the layout's own settings in the panel: the column count,
the function library, the trigger list. Selecting a component puts that
component's form there.

That is one selection model rather than two, and it is why the panel needs no
chrome of its own — no tab strip, no mode switch, no fourth kind of panel, which
is what UI §9 opens by forbidding. The tree becomes the pane's complete table of
contents: the layout, then everything in it, in the depth-first walk the sheet
reads in. The sentinel is already spelled in this module — `SHEET_DESTINATION`,
`'::sheet::'`, the add row's word for the top level — and the selection reuses it
rather than inventing a second spelling of "not a component".

**The function library's own header asked for this.** It records the cost of
sitting below the component forms:

> on a long layout the definitions are a scroll away from the formulas calling
> them, which is a side panel's job to fix, and the M4 canvas editor is where
> that panel arrives (SPEC §7).

This is that panel, and the fix costs nothing beyond moving the call. Both
textarea fields already take `(container, layout, { persist, redraw })` and know
nothing about a settings tab, so they move unchanged.

### What closes UI §12's open-container row

That row is the reason the panel is in this slice rather than a later one:

> A form goes directly under the row it belongs to […] so opening a container puts
> its whole form — around 500px for a Group with a schematic in it — between its
> row and the indented rows of what it holds.

Once the form is in the panel, nothing sits between a container's row and its
children. **This is also why the slice does not stop at moving the editor across
unchanged**: today's arrangement in a wider pane is the same defect with a wider
gap, so the move and the split belong together.

The container's schematic goes with it — but to the **left column, stacked under
the sheet's**, not into the panel. It is a grid, and grids live on the left beside
the grid they sit inside; `this.schematics` is already a list holding "the sheet's
schematic first, then an open container's, while it is open", so the change is
where the second one is appended. Stacked rather than swapped, so an author can
see where the container sits *and* what is in it at once.

**And the grid a selection sits on, not only the one it provides.** The sheet's
schematic draws the top level, so a selection inside a container had a block on
no grid the pane was drawing — while the panel beside it offered four editable
position fields addressing exactly that grid. Four numbers with nothing on
screen to read them against is worse than an absent mark, and it is the opposite
of the reason the container's schematic is in the left column at all. So the
column reads down as a chain: the sheet, then where the selection sits, then
what it holds. A tab's parent contributes nothing, and that needs no case of its
own — a container showing one child at a time has no grid, which is the same
reason the panel withholds the position fields there.

### The schematic, unchanged

No canvas. The schematic keeps its abstract blocks, its drag, its corner resize,
its arrow keys, its clamp mark, its overlap marks and its legend. Three reasons it
needs no work here:

- `previewMetrics` reads its geometry off the element — `getComputedStyle`,
  `clientWidth`, `getBoundingClientRect` — so a wider pane simply gives wider
  tracks. It was written to survive a theme changing the padding, and that is the
  same property.
- Its gesture code already routes around the settings tab's full-teardown redraw
  in three places: `beginDrag` refuses to rebuild mid-gesture because that would
  destroy the element holding the pointer capture, `nudge` writes the four
  position inputs directly rather than redrawing, and `drawSchematics` re-finds
  focus after redrawing. In a pane those workarounds become unnecessary rather
  than wrong, and unpicking them is the canvas slice's business.
- `preview-grid.ts` holds the arithmetic and is already tested. What is *not*
  tested is any of the gesture code, and that is called out as a scope cut below
  rather than quietly inherited.

One thing must be re-keyed if anything about the schematic is touched:
`markOverlaps` maps `querySelectorAll('.sheetsmith-preview-cell')` onto
`schematic.components` **by index**, and `renderGrid` keys by identity for exactly
the reason that breaks — "a list indexed against it breaks silently the moment
either side grows a filter, which is how these two diverged once already". This
slice does not add a filter, so the index mapping holds; the criterion below pins
the behaviour so the canvas slice inherits a guard rather than a hazard.

**What is pinned is the invariant, not the gesture.** `markOverlaps` has one
caller and it is inside the drag, which is the layer this slice carries into a
new host without testing — so a criterion reaching it would contradict that cut
two sections down. The two overlap tests that already exist assert the marks
`drawSchematic` paints, where the mark is set in the same loop as the cell and so
cannot land on the wrong block; neither touches the repaint. The criterion is
therefore that the cells and the list agree in order and in count, which is what
the index mapping rests on and what a filter breaks.

### Interactions

Everything here is a gesture the plugin already has. No new gesture is proposed,
so none needs the argument UI §6 would demand.

| Gesture | Behaviour |
| --- | --- |
| Click a tree row | Selects it. The panel draws its settings; the schematic block takes the selected mark |
| Click a schematic block | The same selection, from the other side. Both paints must agree |
| Click the selected row again | Nothing. Deselecting to nowhere would leave the panel empty; the `Layout` row is how you get back to the layout |
| Drag a block, drag its corner | Unchanged, including Escape restoring the pick-up position |
| Arrow keys, shift+arrows | Unchanged, and the panel's four position fields follow **without rebuilding the pane**. Holding an arrow key is the one rapid-fire gesture here, and a teardown per repeat is the latency cliff `nudge` was already written to avoid |
| Tab | Through the tree in the depth-first walk the sheet reads in, then the add row, then the panel. The tree's order is already the sheet's reading order and that rule survives |
| `Ctrl/Cmd`-click the picker's delete | Unchanged: `ConfirmModal`, naming that character notes are untouched |

Per UI §7, focus moves on `pointerdown` and commits on `click` — the schematic
already does this, because it has to tell a drag from a press. The tree rows are
plain buttons and get it for free.

Deliberately absent: arrow-key navigation *through* the tree. It is a new gesture
on a control that has tab order today, and adding it is design work this slice
does not need. Named below.

### Reflow

UI §4 is emphatic about two things and both bite here.

**A container query, never a media query.** A narrow split in a wide window has to
stack, and a media query cannot see that. The pane carries `container-type:
inline-size` and the two-column rule is a `@container` query on it.

**And the threshold is derived, not borrowed.** §4 records the failure to avoid in
so many words — the sheet's 480px was reused for containers and turned out to be
"one number applied to twelve questions", with a 7× spread. 480px means nothing in
a pane that is not a twelve-column grid. The rule here is:

> the panel's floor is the working width the settings tab already gave these same
> forms, and the pane stacks below the width at which a two-column split would put
> the panel under it.

The settings tab's forms are reviewed at 620px in the harness today, so that is
the floor to measure against rather than a number to assume. **The build derives
the threshold at the harness and states it in a comment beside the rule**, and a
criterion below requires a shot on each side of it. Stacked, the order is
schematic, tree, panel — the panel last, because it is the thing you scroll to
after choosing what to configure.

The widest thing in the panel is a list field, and those already have a narrow
behaviour: the columns header drops and each row's own label takes over, and
`list-field-height.ts` holds the row bounds for both list fields because they had
already drifted twice. Nothing new is needed for the stacked case.

### Empty and error states

Four, and three of them are worse in a pane than in a settings tab, which is why
they are designed rather than inherited.

- **No layouts at all.** Today: a settings row reading "No layouts yet." with a
  **Create layout** button, and an early return so nothing else draws. In a pane
  that is one row stranded in the top-left of an empty surface. It becomes a
  centred empty state on the pane: the sentence, the button, nothing else.
- **A layout whose file will not parse.** Today the message draws *after* the
  picker, which is load-bearing — it is what lets the author switch to another
  layout instead of being trapped. That order is preserved: picker, then the
  error where the tree would be, and no panel. The message keeps naming the parse
  failure, since a layout file is a thing people hand-edit and share.
- **A layout with no components.** The tree holds only the `Layout` row, the
  schematic is an empty lattice, and the panel shows the layout's own settings.
  This is a good empty state rather than a bare one: an author who has just
  created a layout lands on its column count and its function library, which is
  what they need before placing anything.
- **A selection pointing at nothing.** A component deleted, or the file changed
  underneath. Today a missing id simply draws no form, which in a two-column pane
  is an empty right-hand half. The selection **falls back to the `Layout` row**,
  never to the first component — landing on a component nobody chose is the
  failure the reset binding's dropdown already guards against for the same
  reason.

Failure inside a form is unchanged: `.sheetsmith-error` in place, inline field
errors surviving a rebuild through the `fieldErrors` map keyed by focus token.

### What it reuses

Per UI §9, the rule is reuse rather than a lookalike, and this slice earns no new
shared-vocabulary row — one consumer.

| Reused | For |
| --- | --- |
| Obsidian's `.setting-item` rows | The tree, the picker, every field in the panel. Already vendored by `calibrate.mjs` |
| `.sheetsmith-layout-preview` | The schematic, verbatim, both of them |
| `.sheetsmith-preview-editing` | The selected mark, now carried by the tree row as well as the block |
| `.sheetsmith-component-form` | The panel's body, verbatim |
| `.sheetsmith-entry-list`, `list-fields.ts`, `list-field-height.ts` | Every list-shaped field |
| `.sheetsmith-error` | Both failure states |
| `.sheetsmith-add-row` | The add row, whose description still grows with the selected palette entry |
| `renderFunctionLibrary`, `renderTriggerList` | The layout's settings, moved not rewritten |
| `ConfirmModal` | Deleting a layout, removing a component |

No new custom property is published. UI §3's test for one is "when a second
component has to line up with the first", and nothing here has a second.

### Where the code goes

PATTERNS §2 puts a module in the folder naming what it *does*. So:

- **`src/view/`** gains the `ItemView`. It owns the pane's regions, the selection,
  the view state, and the refresh hop into open sheet views. It builds no form.
- **`src/editor/`** stays "the layout editor and its field widgets" and gains the
  tree and the panel as regions it renders into an element it is handed. **It
  learns nothing about a leaf**, and it stops importing `SheetView`.

That seam is the one boundary this spec insists on, because it is what makes
commit 3 possible at all: a view that imports `LayoutEditorSection` and calls
`render(container)` has moved the editor without splitting it, and the split is
where the UI §12 row closes.

The view is a main-area leaf, not a sidebar, so a sheet can sit beside it —
SPEC §7's own reason. `navigation` is `false`: the API's test is whether the view
"opens a file or can be otherwise navigated", and the layout picker is a control
inside the pane rather than the workspace's own history. View type
`sheetsmith-layout-editor`; command id `open-layout-editor`, name **Open layout
editor**. Both ids are stable API from the moment they ship (`AGENTS.md`).

## Config fields

**No component's `configFields` change, and `ComponentDefinition` gains no
member.** The table below is the one *layout-level* field this slice adds — a
property of the layout file, drawn by the editor itself the way `label` and
`position` are, not declared by any component.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `columns` | `number` | Grid columns | How many columns components are placed across. Reducing it leaves a component already past the new last column where it is, rather than moving something you did not touch. |

The description states a consequence, per PATTERNS §8, and the consequence is one
the code already implements: `lastColumn` takes the block's current value as a
floor precisely so a `columns` reduced under a block cannot snap it back.

Two notes on the field. It is the first way to set the grid's column count from
the editor at all — the key round-trips today and is reachable only by hand. And
it is a plain number rather than a formula field: a layout's column count is
structure, not arithmetic, and nothing resolves it.

**Two hazards, both already spelled out in `parse/layout.ts`, and both of the kind
this codebase has been caught by twice.** An absent `columns` has to stay absent
through a round trip — the interface says so at the key itself — so a layout
omitting it and having the field merely *touched* must not gain `"columns": 12`.
That is the `options: []` and `children: []` trap a third time, and the answer is
the one `renderComponentForm` already uses for a select or a boolean: a value
matching the default deletes the key rather than writing it. And `parseLayout`
refuses anything that is not a positive integer, so the field carries the same
inline error the position fields do — *Whole number, 1 or more* — rather than
letting `persist` refuse the whole file with a `Notice` and drop the edit.

## Data and file model

**Stores nothing new.** No key is added to the layout file, none changes shape,
and `serialiseLayout` is untouched. `columns` already exists in `Layout` and
already round-trips; this slice gives it a control.

**Round-trips byte-identically, and the criterion is stronger than the one that
exists.** Today's guard asserts that opening a layout does not write the file and
that an edit and its reversal restore it exactly. This slice adds: selecting every
component in the layout in turn, including every container, leaves the file's bytes
unchanged. That covers the `children: []` trap by whole-file comparison rather
than by watching one key, which is the shape of check PATTERNS §10 asks for.

**Existing character notes are unaffected.** No layout semantics change, so no
section moves, no heading is rewritten, and nothing is read or written in a
character note by this slice at all.

**The pane's own state never enters the layout file.** Which layout is open is
workspace state via `setState`; which component is selected is ephemeral. A
layout file opened, browsed and closed is byte-identical to the one that was
opened.

## Acceptance criteria

- [x] `layout-editor.test.ts` drives the editor through the view rather than
      through the settings tab, and every assertion it holds today passes
      unchanged — in particular *does not write the file for having been opened*
      and *restores the file exactly when an edit is undone*.
- [x] A new test asserts the layout file's bytes are unchanged after selecting
      every component in a fixture in turn, containers included.
- [x] `src/test/obsidian-stub.ts` carries an `ItemView` a test can render: a
      `Component` base with `load`/`unload`/`register`/`addChild`, a
      `WorkspaceLeaf` with a `view` and a container, and `Workspace.getLeaf` and
      `revealLeaf`. A test constructs the pane and renders it.
- [x] `harness/calibrate.mjs`'s `CHROME` list carries the pane's own chrome
      (`.workspace-leaf-content`, `.view-content`, `.view-header`), and
      `harness/theme.css`'s hand-written fallback carries it too, so the harness
      draws the pane before `calibrate` has ever been run (PATTERNS §2's
      self-contained rule).
- [x] `npm run harness` offers the pane as a surface, and `harness:shot` renders
      it in both themes at a wide width and at one stacked width — one shot on
      each side of the reflow threshold.
- [x] **No shot shows a form between a container's row and the rows of what it
      holds.** UI §12's *open container's form* row is deleted from the backlog
      table in the same change.
- [x] The reflow threshold is stated in a comment beside its `@container` rule,
      with the width it was derived from, and it is not 480px unless 480px is
      what the measurement gave.
- [x] Selecting a tree row and selecting its schematic block produce the same
      selection, and a test asserts both the row and the block carry the selected
      mark for the same id.
- [x] A test asserts each schematic draws one cell per component of the list it
      was handed, in that list's own order — the invariant `markOverlaps`'s index
      mapping rests on. It goes red on a filter added to `drawSchematic`, which
      is what the canvas slice inherits it for.
- [x] The tree's first row is `Layout`, selecting it draws the column count, the
      function library and the trigger list in the panel, and a test asserts the
      column count writes to `layout.columns`.
- [x] A test asserts a layout with no `columns` key still has none after its
      column-count field has been shown and set back to the default, and that a
      value below 1 shows an inline error rather than reaching `persist`.
- [x] A selection naming an id the layout no longer holds falls back to the
      `Layout` row, asserted by a test.
- [x] Arrow-key nudging a block updates the panel's four position fields, and a
      test asserts the panel element is the same node before and after — the pane
      is not rebuilt.
- [x] Reopening the pane restores the layout that was open (`setState`) and does
      not restore the component that was selected (`setEphemeralState`).
- [x] `src/editor/` no longer imports `SheetView`; the refresh into open sheet
      views is supplied by the view layer.
- [x] The settings tab holds the two preferences and a button that opens the pane,
      and either `obsidianmd/settings-tab/prefer-setting-definitions` is
      re-enabled for `src/settings.ts` in `eslint.config.mts`, or the suppression's
      comment is rewritten to say what still blocks it. Inheriting the current
      comment unchanged is not acceptable — it says the M4 view is what unblocks
      this, and the M4 view will exist.
- [x] `npm test`, `npm run lint` and `npm run build` pass, lint at
      `--max-warnings 0`.

## Commit boundaries

A plan for `/ship`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. **`test: Let a test render a workspace view`.** The stub's `ItemView`,
   `Component` base, `WorkspaceLeaf` and `Workspace` methods; the pane chrome in
   `calibrate.mjs` and `theme.css`. No plugin behaviour changes. This is also
   most of the fixture PATTERNS §11's *`SheetView` a test can render* row waits
   on, though it does not close that row on its own — that needs `renderSheet`
   driven, which is a `contentEl`, a `file` and a vault fixture beyond this.
2. **`feat: Open the layout editor in its own pane`.** The `ItemView`, the
   command, the settings button, holding today's editor unchanged inside it.
   **Independently shippable**: if the slice has to be cut short, this is the
   stopping point that leaves something usable — it delivers width and nothing
   else, and it carries UI §12's open-container row forward at a wider gap.
3. **`refactor: Put a component's form in a panel beside the tree`.** The two
   regions, the selection moving to the view, the container's schematic to the
   left column, the reflow rule. This is where the UI §12 row closes and where
   `src/editor/` stops importing `SheetView`.
4. **`feat: Configure the layout itself from the tree`.** The `Layout` row, the
   column count field, the function library and trigger list relocated into the
   panel.
5. **`refactor: Leave settings the two preferences it has`.** The settings tab
   reduced, and the `prefer-setting-definitions` decision taken either way.
6. **`test: Show the layout editor pane in the harness`.** The surface, the
   shots, both themes, both sides of the threshold.
7. **`docs: Record what the editor pane closed and what it did not`.** UI §12's
   open-container row deleted; PATTERNS §11's `layout-editor.ts` row rewritten to
   name the three seams and which one this took; SPEC §13's Table `select` entry
   amended to say the surface half is answered and the field kind is not; SPEC §7
   updated where it describes the interim editor as living in settings.

## Deliberately not doing

**No canvas, and no live components.** The schematic keeps its abstract blocks.
The survey found five separate ways a live-component editing surface makes an
editing control unreachable — a hidden tab panel is `inert`, an overlapping
component draws on top and eats the handles beneath it, cards and tables clip at
`overflow: hidden`, the sheet's own scrub and hold gestures take the pointer
first, and the cell popover attaches to `document.body` — and each is a decision
the canvas slice owes an answer to. None of them has to be answered to move the
editor into a pane.

**No preview panel.** SPEC §7 item 7 is a separate slice and needs a decision
about where sample values live, since `harness/samples.ts` is harness scaffolding
outside `src/`.

**No undo — and this is the cut to watch.** SPEC §7 names undo scope as one of
three reasons for the workspace view, and this slice delivers the view without it.
Nothing in the editor has ever had undo: every mutation writes immediately, four
destructive operations do not confirm at all, and the arrow-key nudge has no
Escape where the drag does. That is tolerable for a form and it is the exact
failure §13's prior art records against a canvas — CSB #425, where a nested move
freezes the editor, the template is unrecoverable, and the reporter's workaround
is duplicating templates as manual backups. **The canvas slice should not ship
before undo does.**

**No promoted fields.** SPEC §12 schedules them in M5, they have no model beyond
an index signature preserving unknown keys, and their conflict rule — who wins
when a promoted field is hand-edited in frontmatter — is written in neither §9
nor §10. SPEC §7's full-editor list and §12's table disagree about this and about
import/export; commit 7 records the disagreement rather than resolving it.

**No duplicate, rename, import or export of a layout.** §7 lists all four and
this slice adds none. Rename is the interesting one and it is blocked on a real
question: a character names its layout by filename, so a rename has to migrate
every character that names it, and SPEC §10's migration promise is written about
component labels rather than layout names.

**No reparenting.** A component cannot be moved between containers today by any
route except deleting its container, and it still cannot after this. It is the
operation a canvas most invites, and it is the canvas slice's to design.

**No contract growth.** No size hint, no icon, no formula-field marking, no
`validateConfig`, no pre-render error member, no minimum column count.

**No arrow-key navigation through the tree.** A new gesture on a control that has
tab order today.

**No narrow regime, which is the one cut this slice discovered rather than
planned.** The reflow section below settles a single threshold and the stacked
order under it, and says nothing about what happens further down — where the
pane turns out not to fit at all, dragging the tree rows and the panel's own
fields sideways along with the schematic. `docs/UI.md` §12 holds the row and
`editor-narrow` holds the picture. It is out of scope here because only half of
it is contained: stacking the setting rows is a straightforward answer to CSS a
leaf never receives, and what a twelve-column schematic does at phone width is a
design question this spec never asked.

**Four UI §12 rows and one PATTERNS §11 row survive this slice on purpose**, and
a reviewer should not report them as gaps in it:

- *An unlabelled example reads as the field's value* — the trigger and library
  fields move unchanged and carry it, as does the reset field's example.
- *A value the file already holds is never marked as wrong* — the fix is inside
  `list-fields.ts`, which this slice relocates and does not change.
- *A flag outlives the control that sets it* — inside `renderColumnsEditor`,
  untouched.
- *A disabled control looks exactly like an enabled one* — the tab-order arrows
  survive, because a canvas cannot place tabs and a list is still the answer.
  Note the surface is wider than that row states: `setDisabled` is also called on
  **Add reset** and on `NameModal`'s **Create**, and the plugin styles no
  disabled state at all.
- PATTERNS §11's *declared property name is a free string* — the fix is in
  `types.ts`, so no editor slice closes it by accident.

**And five UI §12 rows leave with it**, which is the honest accounting of a slice
this size: the design review found more than it fixed, and each of these is
recorded there rather than carried in someone's head. Two are debt this slice
created — *the pane has no narrow regime below about 470px* and *at the reflow
threshold the panel is wider than the grid beside it*, both of them consequences
of a reflow rule that answers one question and is silent on two others. Two are
inherited and newly visible: *a nested component's placement is edited against a
grid the pane never draws*, which the settings tab had too and hid better, and
*no boolean in the editor has ever been looked at*, which is a stub defect the
old surface shared. The fifth is the instrument itself — *the harness cannot show
where the fold is* — and it is the one to fix first, because two of the other
four could only be checked with throwaway overrides pasted into `index.html`, and
one real defect had already shipped behind it.

**Two of the three seams in `layout-editor.ts` stay unsplit.** Commit 3 takes the
tree-from-form seam because it cannot avoid it. `renderEntriesEditor` moving to
`list-fields.ts` — where that module's own header says it belongs — and the reset
binding becoming its own module are a separate slice, along with the schematic's
gesture layer and **the pointer and keyboard tests it has never had.** That last
is the one worth restating: 350 lines of drag, resize and nudge arithmetic have no
behavioural coverage, only the pure arithmetic under them does, and this slice
carries them into a new host without adding any. It is a deliberate cut and it is
the first thing the canvas slice should fix.

**Two Constraint 4 gaps stay open**, named in the model section so they are not
read as regressions here: a label rename does not offer to migrate character
sections as SPEC §10 promises, and removing a container silently overwrites its
children's placements. The rename should be the next data-safety slice, because a
larger editing surface makes it more inviting rather than less.
