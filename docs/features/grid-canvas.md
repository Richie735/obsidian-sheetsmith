# Grid canvas

Status: shipped
Board card: M4's grid canvas — move component placement in the layout editor
from the abstract-block schematic to a live-component editing surface on the
sheet's own grid, and design reparenting, the canvas slice's per
`docs/features/layout-editor-pane.md` § Deliberately not doing.

## Model question

**One, and it arrived pre-settled from the PM route rather than open here.**
Reparenting — moving a component between containers — is done by **dragging a
row within the layout editor's existing outline/tree**, not by dropping
anything on the canvas. The argument, restated because the rest of this spec is
built on it: every drop target in a tree is a plain, unclipped,
non-overlapping row, so the tree sidesteps all five interaction hazards
`layout-editor-pane.md` named *structurally* — none of them exist inside a
tree, because a tree-row drag never touches the sheet's own components or
gestures. Canvas-direct drag was rejected on two documented Custom System
Builder defects at exactly this operation (#425: a nested move freezes the
editor and the browser, template unrecoverable; #486: a moved component
vanishes and undo/redo do not restore it), and an explicit non-drag picker was
rejected as a discoverability regression against the drag idiom the schematic
already taught. This spec does not reopen that; it designs everything the
settled answer leaves open — the canvas surface itself, and the five hazards
as they bear on the gestures the tree does *not* cover.

**No `SPEC.md` §13 entry is touched, and the contract does not grow.** This
slice adds no `ComponentDefinition` member, no `ConfigFieldSpec` kind, and no
`RenderContext` member. That is worth stating as a claim, the way
`layout-editor-pane.md` stated it for the same reason: everything below is
built from members the registry already has (`render`, `scopeValues`,
`isContainer`, `placesChildren`) and from parser rules that already exist
(`mayHoldChildren`, the depth-2 cap). A slice that had to grow the contract to
get a canvas working would be a slice that had gotten the canvas wrong.

**One `docs/UI.md` §12 backlog row is closed as a consequence, not a goal.**
*A nested component's placement is edited against a grid the pane never
draws* — the row recorded that selecting a component nested inside another
selected component's container left the panel offering four numbers with no
grid on screen to read them against, because only the sheet's top level and
the currently-open container drew a schematic. §4 below renders every
grid-placing container's grid at once, live, so a selection always sits on a
grid that is already on screen. Recorded here so `/land-it` deletes that row
rather than leaving a stale rewrite of the same code have to rediscover the
gap.

**What it publishes to formulas: nothing new.** This is still an editing
surface. §4's live rendering *reads* the formula engine (§4.3 explains how,
and why that is reuse rather than a new mechanism) but nothing here changes
what a layout publishes to a character's sheet.

**What it stores: nothing new.** No layout-file key is added or changes
shape. A reparent moves an existing `ComponentConfig` object between two
`children` arrays (or the top-level `components` array) exactly the way
removing a component today moves its children out to the sheet's own array —
same operation, generalised to any destination instead of only the top level.
`serialiseLayout` is untouched.

**Constraint 4 is not at risk**, for the same reason it was not at risk for
the pane: no layout *semantics* change, character notes key sections by
`label`, and reparenting changes `col`/`row`/`width`/`height`/depth, never
`id` or `label`. A component's own configuration and formulas travel with it
across a reparent; only its position in the tree and its grid placement
change.

## What it does

The layout editor's canvas renders the layout's actual, live components —
real cards, real tables, real tab strips — placed on the sheet's own grid,
instead of the interim schematic's uniform grey blocks. An author drags a
component to move it within its container, drags its corner to resize it, and
opens its configuration by pressing it, exactly as the schematic already
allowed — now looking at the real thing rather than a placeholder. Moving a
component *out of* the container it is in is done by dragging its row in the
tree beside the canvas, onto the row of the container it should join; the
tree also gains up/down and indent/outdent controls so the same move is
reachable without a pointer.

## Design

### §1. The canvas renders the real component, with its own interaction turned off

**The evidence names this as the one non-negotiable:** every sheet builder
surveyed that has a live-editing surface edits the real components in place;
none maintains a lookalike beside a preview, and Custom System Builder's
issue #503 is the cautionary tale for the alternative — a CSS class an author
applied to a container cascaded into its children only *while editing*,
because the editor and the rendered sheet shared one DOM under one
stylesheet and still drew it differently. This plugin already shares that DOM
and stylesheet (`.sheetsmith-layout-preview` is reused verbatim today), so the
fix is not new plumbing — it is calling the same rendering path the sheet
uses, rather than a second one.

**Mechanically, that path already exists and needs no change to reach the
editor.** `view/grid-cells.ts`'s `renderGrid` is the shared loop `SheetView`
and the harness both drive: given a flat walk, a list of `GridComponent`
(`config`, the registered `component`, `data`, a read `error`) and a context
builder, it places every component in a `.sheetsmith-cell` via `placeCell`,
opens a container's own subgrid via `openSubgrid`, and recurses through
`renderChildren`/`childRegions` automatically wherever a component holds
children. The canvas calls this directly. Nothing in `renderGrid`,
`placeCell`, `openSubgrid`, or a single component's `render()` needs to know
it is being called from an editor rather than a sheet.

**What has no `data` to draw is supplied the way a fresh character's sheet
already is.** There is no character note behind a layout being edited, so
every component reads `data: null` — the state PATTERNS §4 already defines as
"an editable empty card," not an error. `read` is never called; `write` is
never called. The canvas is, structurally, exactly what a brand-new character
built from this layout would render on first open: a Table with declared rows
and empty cells, a Card with a blank field, a Track with no marks. This is
not a new rendering mode invented for the editor — it is the existing
contract's own empty state, reached by supplying no data, and it is why no
component needs a change to appear correctly on the canvas.

**Formulas resolve through the same mechanism a real sheet uses, not a
second one.** `formula/sheet.ts`'s `buildSheet` is what `SheetView` already
calls to build the resolved-value table and the field resolver handed to
every component's `render`; the canvas calls it too, over its own
`data: null` reads. This is deliberate rather than a shortcut: a formula
naming a component that exists resolves to that component's empty-data
value (typically zero or blank, exactly as a fresh character would show),
and a formula naming a component that does *not* exist in the layout still
fails with the sheet's own message — `Unknown name "con".` — because that
failure comes from the structural name table (`scopeValues` declarations),
which does not depend on stored data. So a
genuine authoring mistake (a typo in a formula) is caught immediately on the
canvas, and an ordinary formula referencing a sibling that simply has no
value yet reads exactly as it would on a new character's sheet: unalarming.
**No editor-specific resolver is built.** Building one would be the kind of
duplication PATTERNS §1 refuses — a second formula pipeline nothing can
prove agrees with the first — where reusing `buildSheet` makes the two
impossible to disagree.

**A misconfigured component's own error now appears on the canvas, in
place, which the abstract schematic could never show.** `renderGrid`'s
existing failure path (`failCell`, `.sheetsmith-error`) fires exactly as it
does on the sheet: a Table with a duplicate column key, a Card with an
unusable option list, draws its real error card instead of a plain grey
rectangle. This was not reachable before this slice at all — the schematic
drew the same block whether a component's configuration was sound or
broken — and it becomes an author's first signal that something needs fixing,
before ever opening a character note.

**Every live-rendered component is `inert`.** `.toggleAttribute('inert',
true)` on the root element `render()` draws into, the exact mechanism
`components/tab-set.ts` already uses to take a hidden tab's panel out of the
tab order and the accessibility tree (`panel.toggleAttribute('inert',
hidden)`). This is reuse, not a new idea: the same native attribute that
already means "this subtree is present for layout and paint but not for
interaction" in this codebase now means it for a different reason — the
subtree is present for visual fidelity but has nothing behind it to edit. A
component's own `onChange` is wired to a no-op (defensive only: `inert`
already prevents the dispatch that would call it), and `link`/`modifiers`
are omitted the way they already are wherever there is no sheet to ask.

That one attribute is what resolves two of the five named hazards for the
gestures this spec is responsible for (§2 below covers which gestures those
are):

- **Hazard: the sheet's own scrub/hold gestures take the pointer before an
  edit gesture can.** `interaction/scrub.ts` binds `pointerdown` directly on
  a stat's `<input>`; `interaction/hold-repeat.ts` binds it on a step
  button. Neither calls `stopPropagation`, so a canvas-level listener would
  still see the event, but by then the component's own gesture may already
  be tracking the same pointer — which is exactly the ambiguity a design
  reviewer should not have to resolve by reading two files' event order side
  by side. `inert` removes the ambiguity structurally: an inert subtree does
  not receive pointer events at all, so the input and the button never see
  the `pointerdown` in the first place. There is nothing to race.
- **Hazard: the cell popover attaches to `document.body` and may not track
  the right element once components move freely.** `ui/anchored-panel.ts`'s
  panel is opened by a press on a live control inside a component (a
  Table's modifier glyph). An inert subtree cannot dispatch that press, so
  the panel can never open from the canvas at all. There is no popover to
  keep tracking through a drag, because there is no route to one.

Both are resolved by the same mechanism for the same reason: **the canvas
does not offer a component's own editing surface**, because there is no
character behind it for that surface to edit. That is a scope boundary
worth stating plainly, since it sounds like a regression against "the
editing surface must be the live component": it is not the same claim as
"a live-editing surface for character data," which is `docs/SPEC.md` §7's
deferred Preview item, blocked on where sample values live. This slice's
claim is narrower and already met — the canvas *looks and lays out* exactly
as the sheet does, which is what the evidence is about (CSS and structure
disagreeing between editor and sheet), not that every internal control must
be pressable.

### §2. Reachability: what a canvas gesture is, and what routes through the tree instead

Three canvas-surface gestures survive from the schematic, now against live
cells: **drag to move within a container's own grid**, **drag the corner to
resize**, and **press to open the configuration panel**. Everything about
moving a component *between* containers is the tree's, per the settled
model question, and is designed in §5.

**The gesture surface is a sibling overlay, never a child of the rendered
component.** Each `.sheetsmith-cell` the canvas places gains one additional
child after the live render: an absolutely-positioned `<button>` covering
the cell (`inset: 0`), which is what `SchematicGestures.bindBlock` binds
`pointerdown`, `click`, and `keydown` to — the same three handlers it binds
today, just to this button instead of to the abstract block itself. The
live-rendered component sits underneath, `inert`, and paints through the
overlay's transparent background; only a thin selection/clamp/overlap
outline and the resize handle are drawn on the overlay itself, reusing
`sheetsmith-preview-editing`, `-clamped`, `-overlap` unchanged.

That placement — a sibling of the component's own root, attached to the
cell the grid engine positions, never to an element the component draws
inside itself — is what resolves the remaining hazard for these three
gestures:

- **Hazard: cards and tables clip at `overflow: hidden`.** Nothing a
  component draws internally (a Rich text scrollport, a Table's own
  overflow) can clip an element that is not inside it. `placeCell`'s
  `.sheetsmith-cell` carries no `overflow` rule of its own — it is a grid
  item, not a scroll container — so an overlay attached there is never a
  descendant of anything that would crop it.

**Two hazards remain live for these gestures specifically, because they are
about *visibility and reach*, not about who owns the pointer, and `inert`
does not touch either:**

- **Hazard: a hidden tab panel is `inert`.** A component nested inside a
  Tab set's inactive tab is genuinely unreachable through its own overlay,
  because `tab-set.ts` already marks that whole panel `inert` for the
  reason above — the reader is not looking at it. **Resolved by having
  selection drive tab activation.** Selecting a component — from the tree,
  or from a canvas press before this rule applies — walks its ancestor
  chain and, for every Tab set on that chain whose active tab does not
  already hold the selection, switches that Tab set to the tab that does.
  This is new editor-only state (§4.4), separate from a reader's own tab
  choice on the rendered sheet, and it is what makes "select it in the
  tree, then drag it on the canvas" always work regardless of which tab it
  happens to sit in. It costs nothing extra for the common case: a
  component that is already visible activates nothing.
- **Hazard: an overlapping component draws on top and eats the handles
  beneath it.** Two components whose placements intersect still draw in
  layout order — "the one later in the layout draws on top," the legend
  already says — so the later one's overlay physically covers the earlier
  one's. **Resolved by raising the selected cell's overlay, and only the
  overlay, above every sibling's**, via a `sheetsmith-preview-editing` class
  already carrying the selected mark, now also carrying a stacking
  context above unselected cells at the same level. Selecting the covered
  component (from the tree, since its own overlay is the thing that is
  covered) brings its handles to the front without changing which
  component visually wins on the *sheet* — this is an editing affordance
  layered over the display, not a change to the render order `renderGrid`
  produces.

### §3. Row geometry is read from the grid, not assumed uniform

The interim schematic's `previewMetrics` (`schematic-gestures.ts`) computes
a row pitch from `parseFloat(styles.gridAutoRows) || 44` — a single number,
correct only because every abstract block was drawn against
`repeat(rows, var(--sheetsmith-preview-row))`, a fixed height. A live
component's row is not fixed: `SPEC` §8's own rule is that "the sheet's rows
are content-sized," so a Table spanning three rows and a Card spanning one
sit on tracks of genuinely different heights on the same grid.

**`previewMetrics` reads the grid's own resolved track sizes instead of
assuming a pitch.** `getComputedStyle(gridEl).gridTemplateRows` returns the
browser's *resolved* per-track pixel list once layout has run — not the
authored `repeat()` expression — so the metrics become a cumulative-offset
table over those values rather than a single number, and `cellAt` maps a
pointer's Y to whichever band contains it by walking that table (columns
stay a single pitch, since a component always fills its placement's full
width and tracks are `1fr`-uniform there). `preview-grid.ts`'s pure
functions are untouched by this — `clamp`, `lastColumn`, `describeCell`, and
`findOverlaps` reason about column/row *indices* on `ComponentConfig`, never
about pixels, so nothing about non-uniform row heights reaches them. This
change is confined to `schematic-gestures.ts`'s own DOM-reading half, which
already owns exactly this job for columns.

**Resizing shows real reflow, not just a bounding box.** Because the drag
writes the cell's `grid-column`/`grid-row` span directly (unchanged from
today — the dragged cell's own style, not a rebuild, so the pointer capture
survives), and because every component that needs to respond to its own
width already does so through a `container-type: inline-size` query
(`docs/UI.md` §4), a component visibly reflows — a Table's columns
narrowing, a Card's label losing its tracking — as its box changes size
during the drag, with no re-render. This is a look criterion (§7) rather
than a unit-testable one, since jsdom does not evaluate container queries.

### §4. What the canvas replaces, and where the code goes

**The "sheet's schematic, plus the selected container's own, stacked"
model is retired.** `layout-editor.ts` today draws at most two schematics:
the sheet's top level, and — only while something inside it is selected —
one open container's. That indirection existed because an abstract block
needed nothing more to represent a container; a live container does, since
its own `render()` (a Group's heading, a Tab set's strip) is part of what
this slice exists to show. **The canvas instead renders the whole tree,
live, in one pass**, via `renderGrid`'s own recursion: every container that
`placesChildren` gets its subgrid drawn and every cell in it gets an
overlay, all in the same call rather than gated behind a selection. This is
the change that closes the UI §12 row named in the model section — a
selection is always already sitting on a visible grid, because every grid
in the layout is visible.

A container with `showsOneChild` (Tab set) still draws no per-child grid —
its children have no placement, so there is nothing to drag — but its real
tab strip renders, unclickable (its own subtree is `inert` along with
everything else), showing which tab is active per §2's selection-driven
rule. Reordering tabs stays where §5 puts every reorder: the tree.

**New module: `src/editor/canvas.ts`.** It owns the live render loop —
calling `renderGrid` with an `inert`-marking wrapper around each cell,
building the `buildSheet`-derived context once per draw, and wiring
`SchematicGestures.bindBlock` to each cell's overlay — replacing
`drawSchematic`, `renderContainerSchematic`, and `renderSelectionSchematics`
in `layout-editor.ts`. `schematic-gestures.ts`'s `Schematic` and
`SchematicHost` interfaces are unchanged in shape; there are simply more
`Schematic` instances live at once (one per grid-placing container
currently in the layout, not at most two), which `LayoutEditorSection`
already holds as a plain array. `markOverlaps`'s index-into-`querySelectorAll`
contract (`docs/features/layout-editor-pane.md`'s pinned invariant) is
preserved exactly: the cells `canvas.ts` creates are still created in
`components` order, one per iteration, so the index mapping still holds.

**This is the fourth cut of `layout-editor.ts`**, following
`preview-grid.ts`, `schematic-gestures.ts`, and `config-panel.ts`. It does
**not** resolve `docs/PATTERNS.md` §11's row on the picker cluster staying
in `layout-editor.ts` — that row names `plugin.app`, `plugin.settings`,
`releaseLayout`, and `setLayoutName` as what keeps the picker landlocked,
and none of those change here, so despite naming this feature as one of the
row's two triggers, the honest accounting (matching how undo's own landing
"did not close it") is that this slice does not either. Recorded so a
reviewer does not expect that row gone.

### §5. Tree reparenting

**A reparent that actually changes which container holds a component lands
it at that container's first free row, column 1** — `col`/`row` are never
carried over from the old parent's grid. Those two numbers describe a place
in a specific grid's own coordinate space; once `dragged` leaves that grid,
they describe nothing. A destination grid may not even be as wide as the
column the component sat in, and even where it is, the coordinate is as
likely to land on top of an existing sibling as into empty space. This is
the same problem commit `84b39b9` and `24d7d77` already closed for
`width`/`height` — a value that means something in the old parent's grid and
something else, or nothing, in the new one — reached for position rather
than size. It is fixed in the same function and the same way: `reparent()`
(`src/editor/reparent.ts`) assigns `dragged.position.col = 1` and
`dragged.position.row = nextFreeRow(into)`, the exact answer `tree.ts`'s own
container-removal path already gives a child promoted out of a removed
container (`renderTreeRow`, around line 261-262). `nextFreeRow` is exported
from `tree.ts` for that reason already — the **Add component** row needs the
same answer — so `reparent.ts` imports and calls it rather than
reimplementing it. `nextFreeRow` is asked over the destination list —
`layout.components` at the top level, `target.children` inside a
container — with `dragged` not yet spliced into it, so a component is never
placed below itself.

**A reparent that does not change the component's parent leaves `col`/`row`
alone.** `resolveDrop` (`tree.ts`) treats a container row as "move into me"
unconditionally, even when that container is already the row's own current
parent — its own comment says a container row is never reinterpreted as a
reorder — so `reparent()` can run with `target` equal to `dragged`'s existing
parent. That call is a same-container reorder wearing a reparent's shape,
not a move across grids, and the position guard above is skipped exactly
there: reassigning `col`/`row` would visibly move a component on the grid
that the user only asked to reorder within the container it is already in.
The `width`/`height` correction carries no equivalent guard, and needs
none: it re-reads the component's *current* parent's own live placement via
`innerPlacement`, so when the parent has not changed it recomputes the same
answer the component should already be showing — a harmless no-op when that
value was already correct, and a quiet fix on the rare case it had drifted
stale while sitting still. Position has no such self-correcting reading: an
old `col`/`row` is not "possibly stale," it is meaningless the moment the
parent actually changes, which is exactly why it needs the guard the size
correction does not.

**A Tab set destination still ignores a held child's own `col`/`row` today**
— `innerPlacement` draws every tab at the tab set's own placement instead,
the same rule §1 and §4 describe — so assigning a fresh `col`/`row` on a
move into one is inert the moment it lands. It has to happen anyway, for the
same reason `84b39b9` fixed the stale-size trap rather than leaving it for
"whenever it becomes visible again": the value written now is the value
read back whenever this component is later moved *out* of the tab set, and
a stale `col=1, row=1` free-floating in memory since some earlier, unrelated
context is exactly the kind of number that reads as intentional right up
until it overlaps a sibling on a different grid entirely.

## Config fields

None. No component's `configFields` change and no layout-level field is
added — this slice is purely an editor-surface change, unlike the pane
spec's `columns` field.

## Data and file model

**Stores nothing new.** `serialiseLayout` is untouched; no key is added or
changes shape. A reparent is a splice out of one `ComponentConfig[]`
(`children` or the top-level `components`) and a splice into another, at
whatever index the drop names — mechanically the same move
`renderTreeRow`'s existing removal-with-children-promoted code already
performs today (children move to the sheet's own array on removal), now
generalised to move *the dragged component itself* to *any* valid
container's array rather than only ever to the top level.

**Round-trips byte-identically.** A reparent that changes nothing about
which components exist, only which array holds which object and at what
`col`/`row`, produces a file whose `serialiseLayout` output changes exactly
the touched component's position/nesting and nothing else — the existing
whole-file-bytes criterion from the pane spec is the right shape of check
here too, extended to reparenting instead of only selection.

**Existing character notes are unaffected by a reparent.** Containment is
addressing-blind (`SPEC` §13's resolved entry: "a child inside two
containers publishes exactly the name it publishes at the top level"), so a
reparent changes no `id`, no `label`, and therefore keys no note section
differently. A character opened before and after a reparent renders
identically except for the sheet's own layout of that component's box,
exactly as a plain drag-to-move already does today.

**A layout change never deletes character data (Constraint 4), and
reparenting is checked against it the same way removal already is.** Moving
a container that holds children moves the whole subtree with it — nothing
is orphaned, nothing is silently dropped to the sheet's own array the way
today's *removal* deliberately promotes children rather than deleting them.
A reparent that would push a subtree past the depth-2 cap is refused before
it is written (§5), never partially applied.

**Undo captures a reparent as one step**, through the same mechanism as
every other mutation: `LayoutEditorSection.persist()` diffs the layout's
serialised bytes against `onDisk` and pushes a snapshot when they differ,
regardless of which code path changed the in-memory tree. A tree-drag drop
calls `persist()` exactly where a schematic drag's `finish` does. This is
the check the evidence section of the task brief asked for by name — Custom
System Builder's #486 and #366 show undo/redo failing to restore a move at
depth — and the acceptance criteria below assert it directly rather than
trusting the mechanism by inspection.

## Acceptance criteria

**Live rendering (§1)**

- [x] A Table with declared rows, placed on the canvas, shows real `<table>`
      markup with those rows and empty cells — not a labelled rectangle — and
      a test asserts the rendered structure matches what `renderGrid` would
      produce on a sheet given the same component and `data: null`.
- [x] A component whose configuration is invalid (e.g. a Table with a
      duplicate column key) draws `.sheetsmith-error` with the same message
      text `SheetView` would produce for the identical broken config, in
      place on the canvas.
- [x] A card whose formula names another component that does not exist in
      the layout shows the sheet's own `Unknown name "…".` message on the
      canvas; a card whose formula names a component that does exist
      resolves without error against that component's empty-data value.
- [x] Every live-rendered cell's root carries `inert`; a test asserts
      `hasAttribute('inert')` is true for a Card's input, a Pool's step
      buttons, and a Table's modifier glyph, for every registered component
      type that has an interactive control.
- [x] Dispatching `pointerdown`/`click`/`change` directly at an element
      inside a live-rendered cell (bypassing the overlay) does not call that
      component's `onChange`, and does not open `ui/anchored-panel.ts`'s
      panel.
- [x] `contract.test.ts`'s `MEMBER_ORDER` is unchanged; no `ComponentDefinition`
      member, no `ConfigFieldSpec` kind, and no `RenderContext` member is
      added by this feature.
- [x] `src/editor/preview-grid.ts` has no diff from this feature.

**Canvas gestures (§2, §3)**

- [x] Pressing a live cell's overlay selects it; the tree row and the
      overlay both carry the selected mark for the same id, asserted by a
      test (the same both-paints-agree criterion the pane spec already
      holds, now against a live cell instead of an abstract block).
- [x] Dragging a live cell's overlay moves it within its own container's
      grid, clamped to that container's column count, exactly as today's
      schematic drag; dragging its corner resizes it; Escape restores the
      pick-up position; arrow keys and shift+arrows nudge and resize from
      the keyboard. All four are asserted against a fixture with at least
      one multi-row component sharing a schematic with a one-row component,
      so the row-geometry criterion below has something to fail against.
- [x] A drag that crosses a row boundary lands in the correct row when the
      schematic holds components of different heights — the criterion §3
      exists for: a test drags across a two-row-tall component into a
      one-row component's band and asserts the drop lands where the pointer
      actually is, not where a uniform pitch would have placed it.
- [x] Selecting a component nested inside a Tab set's currently-inactive tab
      switches that Tab set's active tab to the one containing it, and the
      component's overlay is then present and clickable; a test drives the
      selection from the tree and asserts both the tab switch and the
      overlay's presence.
- [x] Selecting a component whose overlay is fully covered by a
      later-drawn sibling's raises its overlay above the covering sibling's,
      without changing which component paints on top on the rendered sheet;
      a test asserts the selected cell's overlay is reachable (highest in
      the relevant stacking context) while the covering sibling's own
      z-order relative to the *other*, unselected sibling is unchanged.
- [x] The overlay element for every registered component type is a sibling
      of that component's own rendered root, attached to `.sheetsmith-cell`,
      never nested inside an element the component gives `overflow: hidden`
      or a scroll box — checked by a scan in the style of `styles.test.ts`,
      or by a per-component-type test asserting the overlay's parent is the
      cell.
- [x] A resize drag changes the live component's own container-query-driven
      layout during the gesture (a Table's columns, a Card's label
      tracking), reviewed as a harness look criterion (§7) rather than
      unit-tested, since jsdom does not evaluate container queries.

**Tree reparenting (§5)**

- [x] Dragging a tree row onto a container row that accepts children
      appends the dragged component as that container's last child (or at
      the index implied by where the drop lands relative to existing
      children), and the canvas redraws it there; a test asserts the
      resulting `children` array.
- [x] Dragging a tree row to a new position within its own current parent's
      list reorders it, matching `list-fields.ts`'s existing `moveItem`
      semantics for the same operation.
- [x] A drop is refused, with no write to the layout and no change to
      `this.layout` in memory, in each of: (a) dropping a container onto a
      target that would push it past the depth-2 cap; (b) dropping onto a
      non-container row; (c) dropping a row onto itself; (d) dropping a
      row onto one of its own descendants. Each is a separate test
      asserting the layout's serialised bytes are unchanged after the
      attempted drop.
- [x] Dropping a container that itself holds children is refused wherever
      the target's depth is not 0 (i.e. the container would land somewhere
      that pushes its own children past the cap), even though the same
      container, if it held no children yet, would be accepted at that same
      target — a test covers both cases against the same target to show the
      distinction is on the dragged subtree's contents, not the type.
- [x] Every row exposes a non-drag path to both operations this feature
      adds: up/down buttons reorder within the current parent (reusing
      `moveItem`), and indent/outdent buttons reparent into the previous
      sibling container or out to the grandparent, disabled exactly where
      the drag equivalent would be refused. A test drives at least one
      reparent via the keyboard-operable controls with no pointer event
      dispatched.
- [x] A reparent is undone and redone as one step: a test performs a
      tree-drag reparent at depth 2, calls `undo()`, and asserts the
      layout's bytes exactly match the pre-drag snapshot; a second test
      performs the same reparent, undoes it, and redoes it, asserting the
      bytes match the post-drag state — directly checking the failure mode
      named in the task's prior-art survey (CSB #486, #366: a move at depth
      that undo does not restore) does not reproduce here.
- [x] A refused drop is reported the way a refused config field is —
      inline, naming the fix, never a silently ignored drag — matching
      PATTERNS §4's "error text names the fix, not the fault," e.g. "This
      would sit inside three containers; a container may hold containers
      only one level deep."

**Whole feature**

- [x] `npm test`, `npm run lint`, and `npm run build` pass, lint at
      `--max-warnings 0`.
- [x] `npm run harness:shot` gains: the canvas showing live components (not
      abstract blocks) in both themes; a shot with two overlapping
      components where the covered one is selected, showing its handles on
      top; a mid-resize shot showing a component's own reflow; a tree-drag
      shot showing a valid-drop highlight over a container row; a shot of a
      refused drop's inline message.
- [x] `docs/UI.md` §12's *a nested component's placement is edited against a
      grid the pane never draws* row is deleted from the backlog table in
      the same change that closes it.
- [x] `docs/features/layout-editor-pane.md` § Deliberately not doing is
      amended: the *No canvas, and no live components* and *No reparenting*
      bullets are replaced with a pointer to this document, not left
      standing as if still true.
- [x] `docs/SPEC.md` §7's opening sentence ("Until the grid canvas below
      ships, a form-based editor...") and its "Grid canvas" bullet under
      "The full editor" are updated to describe what is now built rather
      than what is planned.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. **`refactor: Read a grid's row geometry from its own computed tracks`.**
   `schematic-gestures.ts`'s `previewMetrics`/`cellAt` generalised to a
   cumulative-offset table over `getComputedStyle(...).gridTemplateRows`
   instead of a single pitch. No visible change yet — still drives the
   interim abstract-block schematic. Independently testable and the
   foundation §3 needs before live rendering makes row heights actually
   vary.
2. **`feat: Render the layout's real components on the editor's canvas`.**
   New `src/editor/canvas.ts`: `renderGrid` called with `data: null` reads,
   a `buildSheet`-derived context, `inert` on each cell's live root, and
   the overlay sibling `SchematicGestures.bindBlock` now binds instead of
   the abstract block. Selection, drag, resize, and the corner handle
   continue to work exactly as before, now against real content.
3. **`feat: Render every open container's grid at once`.** Retires
   `renderSelectionSchematics`/`renderContainerSchematic`'s
   selection-gated drawing; every grid-placing container's subgrid renders
   live in the same pass via `renderGrid`'s own recursion. This is where
   the UI §12 row closes.
4. **`feat: Keep a covered component's handles reachable when selected`.**
   The z-order raise on `sheetsmith-preview-editing` (hazard: overlap).
5. **`feat: Switch to the tab holding whatever is selected`.** The
   ancestor-tab-activation rule (hazard: hidden tab panel is inert),
   including the editor-only per-Tab-set active-tab state.
6. **`feat: Move a component in the layout by dragging its tree row`.**
   New `src/editor/reparent.ts` (the pure `canReparent` validation over
   `isContainer`/`mayHoldChildren`/`walkComponents`) and new
   `src/editor/tree.ts` (the outline's rendering, moved out of
   `layout-editor.ts`, plus the drag-and-drop wiring, the up/down reorder
   controls reusing `moveItem`, and the new indent/outdent controls).
   `layout-editor.ts` delegates to it the way it already delegates to
   `config-panel.ts`.
7. **`test: Show the grid canvas and tree reparenting in the harness`.**
   The shots named in the acceptance criteria, both themes.
8. **`docs: Record what the grid canvas closed and what it left open`.**
   UI §12's row deleted; `layout-editor-pane.md`'s two superseded bullets
   repointed here; `SPEC.md` §7 updated; PATTERNS §11's `layout-editor.ts`
   row confirmed still open, with a note that this feature was one of its
   two named triggers and did not close it either, for the same reason
   undo's landing did not.

## Deliberately not doing

**No preview panel, no sample values — *superseded*.** This bullet said `SPEC`
§7 item 7 was blocked on where sample values live outside `harness/samples.ts`,
and `docs/features/preview-sample-values.md` is where that was answered: a
component declares its own `sample`, as a section body derived from the config
it was handed, and the canvas hands that body to the component's own `read` in
place of the empty one. The half of this bullet that still holds is the half
about the *layout file*: there is still no mechanism for an author to type a
sample into one, and there is still no second surface — Preview is this same
canvas with a different data source, not a panel beside it.

**No character-editing surface on the canvas.** Every live component is
`inert`; nothing typed into a card, dragged on a pool, or opened in a
modifier popover on the canvas reaches any file. This is the boundary that
makes hazards 4 and 5 dissolve rather than merely get handled, and it is
recorded here so a reviewer does not read the absence of working scrub bars
as a bug.

**No drag-and-drop creation from a palette onto the canvas.** `SPEC` §7's
full-editor list names dragging a new component in from a palette; this
slice keeps the existing **Add component** row and its destination dropdown
unchanged. Creating a component is not the operation this slice's evidence
was gathered against — moving and reparenting existing ones is — and adding
palette drag would be new canvas-drop surface with its own hazard analysis,
which is out of scope here.

**No multi-select or group move.** One component is selected, moved, resized,
or reparented at a time, exactly as today.

**No narrow/phone regime for the canvas**, beyond whatever the pane's
existing reflow already gives it. `docs/UI.md` §12's *the layout editor pane
has no narrow regime* row explicitly named this as adjacent to the M4 canvas
and still unresolved; this slice does not resolve it. A live canvas at phone
width is read rather than seen here, same as the row already says.

**`docs/PATTERNS.md` §11's picker-cluster row is not closed.** Recorded in
§4 above: the reasons that row gives for the picker staying in
`layout-editor.ts` — it reaches `plugin.app`, `plugin.settings`,
`releaseLayout`, `setLayoutName` — are untouched by this feature, so despite
being named as one of the row's two triggers, this slice does not close it,
matching how undo's own landing turned out only to confirm the same thing.

**No duplicate, rename, import, or export of a layout.** Unchanged from the
pane spec; none of the four is touched here.

**No promoted fields.** Unchanged; `SPEC` §12 schedules them for M5.

**No contract growth.** No size hint, no icon, no formula-field marking, no
`validateConfig`, no pre-render error member — the pane spec's list, still
true here, because this slice reuses `render`, `scopeValues`, `isContainer`,
`placesChildren`, and the depth rule exactly as they stand.
