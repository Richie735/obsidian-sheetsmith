# Layout editor narrow regime

Status: shipped, bar the device checks below, which the owner makes on a phone
Board card: none. Scoped from the owner's planning handoff, to close four
`docs/BACKLOG.md` § UI rows: *the layout editor pane has no narrow regime, and
does not fit below about 470px*; *the pane at a true 380px viewport has not been
reviewed*; *the editor pane's buttons were not swept against Obsidian's tablet
padding*; *the editor pane's position fields lose their width to Obsidian's
phone rule*.

**Agreed as the smallest version plus §4**: §1, §3 at 584, §4, §5 and the
position-field pin are in. The select-step touch drag that was §2 is out, and
waits on a pass on a real device (Deliberately not doing, and a
`docs/BACKLOG.md` § UI row).

## The decision: what the twelve-column canvas does at phone width

**At phone width the canvas is a read-only picture of placement, and it already
is one by construction, not by a rule this feature adds.** The canvas is drawn
inside its own `.sheetsmith-view` (`editor/canvas.ts`), so the sheet's own
`@container (max-width: 480px)` collapse reaches it: at any canvas narrower than
480px of content the grid is `display: flex; flex-direction: column`, in the
sheet's reading order, exactly as the phone sheet draws it. What this feature
adds is the honest half that is missing: where a grid is drawn as one column,
the canvas stops offering the gestures that move things on it, and every move
and resize goes through the panel's four position fields, with the tree's row
menu for every structural move.

That answer creates no second source of truth. Nothing about the phone picture
is stored. It is derived from the one placement, the way the phone sheet is, so
a desktop edit is on the phone canvas the moment it is made. Squarespace's drift
is impossible here because there is nothing to drift.

### What the measurements say today

Taken at the harness over CDP, `surface=editor&theme=light&open=weapons`, a true
viewport (`setDeviceMetricsOverride`, no 500px floor), the harness built from
this branch. The scratch scripts are not kept. **How it was measured** below has
enough to rebuild them.

| What | Measured | So |
| --- | --- | --- |
| Horizontal fit, at viewport 320, 380, 470, 500, 520 and 640 | `documentElement.scrollWidth` equals the viewport at every width. The pane's `scrollWidth` equals its `clientWidth` | **The pane fits.** The BACKLOG row's "does not fit below about 470px" described the abstract schematic. `grid-canvas.md` retired the schematic, and the sheet's collapse came with the live canvas. The only boxes past the right edge are Tables inside their own scrollers, which is the sheet's ruled behaviour |
| Where the canvas collapses | Pane is the viewport less 26 (2px of headless Chrome, 24 of `.view-content` padding). The canvas's `.sheetsmith-view` pads 16 on each side. Its grid is `flex` at pane 494 and `grid` at pane 514 | The canvas collapses at **512px of pane**: 480 plus 2 × 16. That is viewport 538 in the harness |
| A drag on the collapsed canvas, viewport 380 | Pressing `weapons`'s overlay and moving it 120px right turned its position fields from `1 1 4 3` into `4 1 4 3`. The cell stayed at left 29, width 322, and its `grid-column` changed to `4 / span 4`, which a flex item ignores | **A live defect today, on desktop as well as touch.** The gesture writes a placement that nothing on screen shows. Undo can take it back, but nothing tells the author there is anything to undo |
| A touch scroll starting on the canvas, viewport 380, touch emulated | `Input.synthesizeScrollGesture` with `gestureSourceType: 'touch'`. From an overlay: **0px**. From a tree row's name, and from the 16px gutter beside the canvas: both scrolled | **A scroll trap.** Every overlay is `touch-action: none` (`editor.css`, "A touch drag must move the block, not scroll the sheet"), and the overlays cover 322 of the canvas's 354px for **17,228px** of height (18,924 under phone staging). A phone can scroll past the canvas only through the gutters |
| Resize corners on a coarse pointer | `@media (pointer: coarse)` draws every cell's corner at 24 × 24, opacity 1. The phone slices show one on every card | On a collapsed canvas it is a handle for a gesture that does nothing visible |
| Distance from a selection to its settings, viewport 380 | Canvas from 481. Tree from 17,795. Panel at **29,294**. Under phone staging: 592, 19,616 and **33,192** | The panel is 12 to 30 thousand pixels from whatever selected it. Nothing scrolls it into view |
| Setting rows, viewport 380 | Every row stays `flex-direction: row`. **Position** clips to `Posi…` at pane 334. The **Label** description runs 12 lines in a 74px column at pane 334, and **Grid columns** runs 14 lines at pane 354 | The first of the BACKLOG row's two causes is still real. The rows squeeze, not overflow |
| Position fields under phone staging (`is-mobile is-phone` on `body`) | Each **75px** wide, which is 5em at 14.99px. On desktop each is 65 | **The phone-rule row is not reproduced.** The four fields are `createEl('input', { type: 'number' })` (`config-panel.ts`), and Obsidian 1.14.4's `app.css` scopes its phone rule to `.is-mobile input[type='text']` alone (line 21208). It has no `input[type='number']` counterpart. **Levels**, **Minimum** and **Maximum** in `list-fields.ts` are `number` too |
| Every pane button on `is-mobile is-tablet` at 820, each tree row selected in turn, `is-tablet` toggled on and off | Plugin-styled buttons that moved: `.sheetsmith-tree-name`, from 0 to `4px 20px` (49 × 44 to 89 × 44), and `.sheetsmith-tree-disclosure`, from 0 to `4px 20px` (24 to 40 wide). `.sheetsmith-canvas-overlay` changes its computed padding, but its box does not move: it is border-box, `inset: 0`, and empty, 762 × 167.3 both ways. Everything else that moved takes the app's chrome whole: **New layout**, **Choose**, every **Add …** footer button, **Add row** (`mod-cta`). The glyph buttons are `clickable-icon` and exempt | Two visible losses and one invisible one. The rest are the app's own control doing what it does everywhere (`docs/UI.md` §2) |

### The open questions, answered

**At phone width, is the canvas still a 12-column editing surface?** No. Where a
grid is drawn as one column, the canvas is a read-only picture of the order the
sheet reads in. A press on a block still selects it, so the canvas stays a way
into the panel. Drag, the resize corner and the arrow-key nudge are withdrawn
there. **Every move and every resize has a non-drag route**, and each one is a
single pointer press:

| Move | Route at any width | Verified |
| --- | --- | --- |
| Move or resize a component on its grid | The panel's **col**, **row**, **width** and **height** fields. They clamp to the grid as the drag does (`config-panel.ts`) | From code. On the phone staging each field is 75 × 44, so they keep their width (row above) |
| Reparent: into the container above, out a level | The row menu's moves: the `More options` button on every component row (`tree.ts`). A plain click, nothing shown on hover | From code. 127 menu buttons on 128 tree rows; the `Layout` row has none |
| Reorder on a level that is not placed (a Tab set's tabs) | The row menu's **Move up** and **Move down** | From code |

So WCAG 2.5.7 holds wherever drag is offered, and in the regime where drag is
withdrawn the fields are the only route, not an alternative to one.

**Where do the panel and the tree go when stacked at 380, and in what order?**
In the order `SPEC` §7 already settles: canvas, then tree, then panel. Two
reasons it is not reordered for phones. A reorder done in CSS would split the
visual order from the DOM order, and so from the Tab order
(`legibility.md` §6). A reorder done in the DOM would need a redraw keyed to the
pane's width, which nothing in the pane does today. **The distance is answered
instead of the order:** a selection whose panel heading is off screen brings the
panel to the reader, and the panel offers the way back (Design §4). That holds
at every stacked width, not only at 380. At 1000 the panel is still a long
scroll under a full canvas and tree.

**Does the tree's HTML5 drag work on iOS touch, and if not, is the row menu the
touch route?** The row menu is the touch route either way, and nothing here
depends on the drag (table above). On iOS the drag probably works, but that is a
claim for a device. **Verified from Obsidian 1.14.4's `app.js`:** the iOS app
synthesises a `contextmenu` on a long press, and it waits 800ms or, over any
`[draggable="true"]` ancestor, 1200ms. It cancels that `contextmenu` when a
`dragstart` fires on the pressed element. So the app is built to expect WebKit
to start a native drag from a long press on a draggable element, and the tree's
grip is a `<button draggable="true">`. **Not verified:** whether that drag
reaches the tree's `dragover` and `drop` on an iPhone, and whether Android's
WebView starts an HTML5 drag from touch at all. Device check 2 below.

**Can the pane keep a horizontal canvas drag from opening Obsidian's sidebar,
and what does `touch-action` do inside a workspace leaf?** Yes, by an opt-out the
app itself reads. **Verified from 1.14.4's `app.js`:** the mobile swipe handler
walks up from the touched node and gives up on any ancestor carrying
`data-ignore-swipe`. It also gives up when the hit element is a `<canvas>`, when
an ancestor can scroll in the swipe's direction, and when the first `touchmove`
comes more than 200ms after `touchstart`. It reads neither `touch-action` nor
`defaultPrevented`. So `touch-action: none` stops the browser panning but does
not stop the app's swipe, which is a JS listener of its own. A select-step drag
would therefore put `data-ignore-swipe` on the one overlay that can start a
touch drag. **That drag is out of this feature** (Deliberately not doing), so
nothing here carries the attribute, and the finding is kept for the pass that
takes it up. **So is the reason that drag would take no hold delay**: a
hold-to-drag needs the page's scroll cancelled once the delay is up, which only
a non-passive `touchmove` listener can do, and that is the WebKit 185656 trap
in a source that has no touch listeners today. Pointer events decide at touch
start from the hit element's computed `touch-action`, so a select step set by
an earlier tap is the shape they allow. **Also verified from 1.14.4's `app.css`:**
`.workspace-leaf`, `.view-content` and `.workspace` set no `touch-action`. It
appears only on the app's own canvas wrapper, its resize handles, the lightbox,
table column handles and the drawer's tab select. So inside a leaf an element's
own `touch-action` is the only one that applies, as in any page. **Not
verified:** that the swipe fires over the pane today and stops with the
attribute. That is the device pass the deferred drag waits on, not a check for
this feature.

**Is the threshold derived the way `layout-editor-pane.md` derived the stacking
one, and stated beside the rule?** There are two thresholds, because two
questions are asked, and `docs/UI.md` §4 records what happens when one number
answers two of them. Each is stated beside its rule.

- **The canvas's regime takes no new number.** It is the sheet's own 480px,
  read on the canvas's own `.sheetsmith-view`, which the canvas already wears.
  The editor's rules for it sit under `@container sheetsmith-sheet (max-width:
  480px)`, the named query `sheet.css` already uses so that every inner grid
  follows the sheet down. So the gestures cannot leave on a different pixel from
  the one where the grid stops. Below the sheet's level, a nested grid collapses
  on its own width by the sheet's 40px-a-column table. The JS guard covers that
  case without a number, because it asks the grid how it is laid out (Design §1).
- **The setting rows stack below 584px of pane.** That is the narrowest width
  the panel's forms have been seen at side by side: `editor-threshold`'s bounded
  shot, whose panel is 584, the shot `editor.css` already names as the measured
  floor of the two-column regime. It is the pane spec's own derivation ("the
  floor is the width they are known to work at rather than one assumed for
  them") put to the question the pane spec did not ask. Below it no side-by-side
  form has been looked at, and stacking is Obsidian's own answer on a phone. In
  the stacked regime the panel is the pane's full width, so 584 of pane is 584
  of panel. In the split regime the pane is at least 1176, so the rule never
  fires there.

What the row threshold costs, measured with `open=weapons`, `skills` and
`::sheet::`. Pane widths, with rows side by side as today:

| Pane | Narrowest info column | Longest description |
| --- | --- | --- |
| 674 | 185 (Position) | 3 lines (Skills' "Characters may add rows") |
| 594 | 145 (Position), 146 (Layout file) | 4 lines; 6 for **Grid columns** |
| 574 | 135 | 4; 6 |
| 514 | 105 | 5; 7 |
| 454 | 75 | 7; 8 |
| 374 | 50 | 11; 10 |
| 334 | 44, **Position** clipped | 12; 14 |

The rows get worse at a steady rate. The table has no knee, so no width can be
read off it as the place where they start to fail. That is the argument for
taking the floor somebody has already reviewed instead of inventing one. It also
means 584 is conservative: at 574 a row side by side is still legible. The owner
may prefer a lower number, and the table is there to choose one from.

## Model question

None. The feature reads, writes, publishes and stores nothing new. No `SPEC`
§13 question is touched, no `ComponentDefinition` member, `ConfigFieldSpec` kind
or `RenderContext` member is added, and no layout key is added. **The one
model-shaped claim is a refusal, stated so it is not reopened:** there is no
per-width arrangement. A phone layout, a mobile order or a breakpoint override
would be a second placement, and everything this repository says about the phone
(`SPEC` §8's reading order, `docs/UI.md` §4's "a phone's 380 draws what a 380
container draws") assumes there is one. Constraints 3 and 4 are not reached.

## What it does

The layout editor pane works at a phone's true 380px viewport and in a narrow
split. Where the canvas draws the sheet as one column it stops pretending to be a
grid: it shows the order the phone sheet reads in, a press selects, a touch
scrolls, and the position fields do the moving. The setting rows stack as
Obsidian stacks them on a phone. A selection made far from the panel brings the
panel to the reader, with a way back. The pane's own buttons keep their padding
on a tablet. On a canvas still drawn as a grid, nothing about touch changes.

## Smallest version

Design §1, §3 and §5, and the position-field pin: the collapsed canvas takes no
gesture, takes no touch, and says why; the rows stack below 584; the tree's two
button classes are doubled past the tablet rule; a test holds the position fields
as `number`. That closes all four rows. **What is built is this plus §4**, so at
380 the panel no longer stays 30,000px from a selection. What it still gives up
is that on a tablet the canvas stays a scroll trap: §2 is withdrawn, and its row
is in `docs/BACKLOG.md` § UI.

## Design

### §1. A grid drawn as one column takes no gesture

**One predicate, read at the moment of the gesture.** `grid-guides.ts` gains a
function beside `previewMetrics` that answers whether a schematic's element is
laid out as a grid. It returns false where the computed `display` is `flex`,
which is what both of the sheet's collapses write. It is spelled as "is `flex`",
not "is not `grid`", for a stated reason: happy-dom computes a plain `block` for
an unstyled grid, and every existing gesture test would otherwise read as
collapsed. Two callers use it, and the check is the first thing each does:

- `beginDrag`, for both `move` and `resize`. A collapsed grid returns before
  `preventDefault` and before the pointer capture, so the press goes on to its
  `click` and selects. Nothing is frozen, no guides are drawn, nothing is
  written.
- `nudge`. A collapsed grid returns without `preventDefault`, so an arrow key
  does what an arrow key does on any button, which is scroll the pane. Nothing
  changes, so nothing is announced (`docs/UI.md` §6).

It is read per schematic, so a nested grid that has collapsed on its own width
inside a sheet that has not is refused too, and the grids around it are not.

**The CSS that follows from it**, in `editor.css`, under
`@container sheetsmith-sheet (max-width: 480px)`, below the rules it overrides:

- `.sheetsmith-view .sheetsmith-canvas-overlay` takes `touch-action:
  manipulation`, so a touch on the canvas scrolls the pane.
- `.sheetsmith-preview-resize` takes `display: none`. That is a corner for a
  gesture that is not offered, and it is drawn on every cell under a coarse
  pointer today.
- `cursor: pointer` in place of `grab`, since a press only selects.

**A nested grid that collapsed on its own width is the case these rules miss.**
It sits inside a sheet-level grid, so the named query does not fire. The JS
guard covers its gestures, so nothing on it moves. Its overlays keep the grid
regime's `touch-action: none`, and with §2 withdrawn that is every overlay on
it, selected or not: **the whole of a nested collapsed grid traps touch scroll**,
and a touch scroll there has to start in a gutter or outside the container. A
query cannot see a nested grid's column count, so closing that would mean
tabulating `.sheetsmith-cols-N` twelve times again, the way `sheet.css` does.
**Cut**, and named in Deliberately not doing.

**One line says why**, because a mouse in a narrow split presses and drags and
gets nothing back. It is a `setting-item-description` drawn as the first child
of the canvas's own `.sheetsmith-view`, so it sits directly under the **Sample
values** row. **Inside the view and not under the row itself**, because a
container query can only ask an ancestor: drawn beside the canvas it would have
to restate the collapse as a pane width (480 plus the view's padding), a second
number for one fact. It is always in the DOM and displayed only under the same
named query, so assistive tech meets it exactly when it is true:

> Select a component, then set where it sits with its position fields.

The owner's copy, from the land stop. It sits with the canvas rather than with
the first component: no less space under it than above it inside the canvas's
own view.

### §2. Withdrawn: a touch drag that starts only on the selected component

Not built. It was a select step for touch on a canvas still drawn as a grid,
and it is recorded under Deliberately not doing with the reason it waits.

### §3. The setting rows stack below 584px of pane

Obsidian's own phone-modal declarations, copied verbatim, so the stacked row is
the app's shape and not a lookalike: `flex-direction: column; align-items:
flex-start` on the row and `width: 100%` on its control. They go under
`@container (max-width: 583px)` on `.sheetsmith-layout-editor-pane`, with the
app's own exclusions, `:not(.mod-toggle, .mod-navigable, .mod-action,
.setting-item-heading)`, and one of ours, `.sheetsmith-tree-row`. A tree row is a
name with two glyph buttons. It fits at 320, and stacked it would double the
tree's height for nothing.

**The pane's container is named for it, `sheetsmith-editor-pane`, and the rule
queries it by name.** An unnamed query resolves against the nearest container,
and two sit between the pane and some of its rows: the canvas's own
`.sheetsmith-view` and every `.sheetsmith-entry-list`. The 1176 rule keeps its
unnamed query, since its subject's nearest container is the pane.

**The stub's `addToggle` gains `mod-toggle`**, which Obsidian 1.14.4's
`Setting.addToggle` adds to the row (read from `app.js`). Without it the harness
would stack every toggle the app leaves side by side.

- **Reached:** every panel row (Label, Position, every config field), and the
  outline's **Layout file** and **Add component** rows.
- **Left side by side:** **Sample values** and every other toggle (the app's
  `mod-toggle` exclusion), headings, and tree rows.
- **List fields need nothing.** `.sheetsmith-entry-list` is its own container
  and already becomes a card under 380px.
- **Position** stacked puts its four fields under the name and description. At
  14.99px each field is 75px, so the four fit on one line wherever the control
  is at least 324px wide. Narrower than that they wrap two by two, col and row
  first: the panel draws them as two pairs, place and size, and the control
  wraps between the pairs, never inside one. No field gets narrower than its
  5em.
- **A tree row keeps its controls on its own line.** It stays side by side
  under the exclusion, and it wraps (so a refused move's reason can take a line
  of its own), so the info column's base size is zero: the name and description
  take what the grip and the menu leave and wrap inside it, rather than pushing
  the controls to a line of their own.
- **A stacked row's own field fills it**, text input and select alike, which
  the copied `width: 100%` on the control promises and did not deliver alone:
  the form's shared 14em held **Label** at 182px, and the app's
  `.setting-item-control select { max-width: 400px }` stopped **Layout file** at
  400 of a 472px row at 530 while it filled the row at 380. Measured at 380, 530
  and 600, desktop and phone: both fill their row (308, 458, 528 for **Label**;
  322, 472, 542 for **Layout file**). A control's buttons beside its field wrap
  under it, as they already did at 380.
- **The panel's title row wraps** under the same query, so **Back to the
  selection** drops under a title too long to sit beside it.
- The comment beside the rule gives the 584 derivation and the cost table
  above, the way the 1176 rule carries its own.

### §4. A selection far from its panel brings the panel to it

Below 1176 the panel is under the tree, and at 380 it is under 17,000px of canvas
and 11,500px of tree. So:

- **After a selection made by a press**, on a tree row's name or a canvas block,
  that changes what is selected: if the panel's own box starts outside the
  visible box of the leaf's scroller once the pane has redrawn, scroll the leaf
  so the title is at its top. Focus goes to the title, made focusable with
  `tabindex="-1"`, so Tab continues into the form and a screen reader announces
  what was selected. The check is geometric and not tied to a width, so in the
  split regime, where the panel column is always beside the tree, it never
  fires. **The panel's box and not the title's**, because in the split regime the
  panel column is a scroller of its own and a title scrolled up inside it is
  outside the leaf's box while the panel is not. It runs after the press's own
  handlers have finished, since a canvas press puts focus on its block as its
  last act (`focusBlock`), and a reveal before that would be undone by it. A drag never selects (its
  click is swallowed), so a gesture cannot trigger the jump. The arrow-key nudge
  never selects either.
- **The way back is a button in the panel's title row, Back to the selection.**
  It scrolls back to the control the selection came from and focuses it, by
  focus token: the tree row's name or the canvas block, falling back to the tree
  row when the source is gone. It is displayed only below 1176
  (`@container (min-width: 1176px)` hides it), because beside the tree it has
  nowhere to go back to. It is named by its destination, and it names no
  component, because the title beside it already does (`docs/UI.md` §6, "names
  every party its context does not already announce"). **The destination is
  the selection**: the row or block it goes to is the one the pane marks as
  selected, whichever region it is in. It was **Back to the outline** until a
  design review found that wrong for a canvas press, whose destination is the
  canvas, and "outline" is a word the pane draws nowhere — the region's name in
  the code, not on screen. One label rather than one per source, so a reader
  learns one control.
- **Why focus moves here, against "focus should not move without the user
  moving it".** The press moved it. UI §7 says that where focus is not the
  outcome of a press, the press has to produce one. Selecting is that outcome,
  and on a stacked pane it is 30,000px away. Leaving focus on a block the reader
  can no longer see would make the next Tab land in the canvas.

**Rejected: the panel under the selected row**, which is the accordion a phone
settings screen often is. That is the arrangement `layout-editor-pane.md` left
the settings tab to escape: a container's whole form sits between its row and
its children. **Rejected: one region at a time with a back button**, as a split
view collapses on iOS. That is a mode switch, and the pane spec rules out a mode
switch and a fourth kind of panel. §4 is two scrolls and one button inside the
regions that already exist.

### §5. The pane's own buttons on a tablet

`.sheetsmith-tree-row .sheetsmith-tree-name` and the tree disclosure each move
their `padding` into a rule of its own on a doubled class, at (0,3,0), and
nothing else moves with it. That is `docs/UI.md` §2's shape and its reason: a
doubled whole rule would lift the button's fill over its own `:hover` and
`:focus-visible`. `.sheetsmith-view .sheetsmith-canvas-overlay` is doubled the
same way. It draws nothing different, but the guard should not need an exception
for a rule that loses. Every other button that moved takes the app's chrome
whole, which `docs/UI.md` §2 already rules on. `styles.test.ts`'s tablet guard
reaches `src/editor/` with its own explicit list of these three classes, and
lists the app-chrome text buttons as exempt.

### Empty and error states

- **No layouts** (`editor-vacant`): one sentence and **New layout**, centred.
  Unchanged at 380. Its `min-height: 60vh` is the only `vh` in the pane, and it
  is harmless under an on-screen keyboard, since nothing in it is pinned to the
  bottom.
- **A file that will not read or parse**: picker, then the error, no panel. The
  **Layout file** row stacks under §3 like any other row. The canvas note (§1)
  is not drawn, because no canvas is.
- **A layout with no components**: an empty canvas, which is an empty grid or an
  empty column, and the note shows under the same query. The panel shows the
  layout's own settings, and its rows stack under §3.
- **A selection naming nothing**: falls back to the `Layout` row, as today. The
  fallback is not a press, so §4 does not scroll.

### What it reuses

`.sheetsmith-view`'s collapse and its `sheetsmith-sheet` container name, used and
not restated. `previewMetrics`'s module for the predicate. `focusToken` for the
way back. `panelTitle` for the title row. Obsidian's own `.setting-item` phone
shape. The doubled-class answer from `docs/UI.md` §2. No new custom property: no
second component has to line up with anything here (`docs/UI.md` §3).

## Config fields

None. Nothing here is configured by a layout.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |

## Data and file model

Nothing is stored and nothing new is written. The collapsed canvas writes
nothing at all, where today it writes a placement nobody can see. The position
fields write exactly what they write today. No layout key, no frontmatter key,
no preference, no view state. Round trip and existing notes are untouched.

## Acceptance criteria

Harness widths are viewports. The pane is the viewport less 26.

**The canvas**

- [x] `schematic-gestures.test.ts`: "a press on a grid drawn as one column
      selects and moves nothing", "a corner press there resizes nothing", and "an
      arrow key there moves nothing and leaves its default". Each stages the
      collapse with `display: flex` on the schematic's element, and each is red
      before the guard.
- [x] The same file still passes every existing drag, resize and nudge test with
      no assertion changed, which is what the "is `flex`" spelling exists for.
      One case reads the panel's title through the shared `panelHeading` helper
      rather than its own query, since §4 puts a button in the title row.
- [x] At 380, the CDP drag above (press `weapons`'s overlay, move 120px right)
      leaves its position fields at `1 1 4 3`. At 546 (pane 520, a grid) the same
      drag moves it.
- [x] At 380 with touch emulated, a touch scroll gesture starting on an overlay
      scrolls the pane. It scrolled 0px before.
- [x] At 380 under a coarse pointer, no resize corner is displayed. The
      overlays' computed `touch-action` is `manipulation`.
- [x] The note line is displayed at 530 (pane 504) and not at 546 (pane 520),
      and it is absent from the accessibility tree where it is not displayed.

**The rows**

- [x] At 600 (pane 574), every `.setting-item` in the panel and the outline
      except toggles, headings and tree rows computes `flex-direction: column`.
      At 620 (pane 594) every one computes `row`.
- [x] At 380, in desktop and phone staging, no setting name clips
      (`scrollWidth` ≤ `clientWidth` + 1), and every stacked description that
      wraps in the `weapons`, `skills` and `::sheet::` panels takes the row's
      width less the app's own 16px trailing margin on the info column. The doc
      records each one's width and line count beside today's 12 and 14.
- [x] No tree row stacks at any width from 320 up.
- [x] `obsidian-stub.test.ts`: the double's `addToggle` marks its row
      `mod-toggle`, as the app's does.

**The way back (§4)**

- [x] `layout-editor.test.ts`: "a press that selects brings an off-screen panel
      title to the top and focuses it", "Back to the selection returns focus to the
      press's source", and "a selection that is not a press does not scroll".
      Geometry is stubbed the way the file already stubs rects.
- [x] At 380, pressing the last tree row puts the panel title within the
      viewport. At 1400 (split) the same press scrolls nothing, and **Back to the
      outline** is not displayed.

**Platform rules**

- [x] With `is-tablet` toggled on and off at 820, every tree row selected in
      turn: `.sheetsmith-tree-name`, `.sheetsmith-tree-disclosure` and
      `.sheetsmith-canvas-overlay` compute the same padding both ways.
- [x] `styles.test.ts`'s tablet guard covers `src/editor/`. It was red on exactly
      those three selectors before the CSS change, and its "would catch" case
      includes an editor class.
- [x] `config-panel.test.ts`: "the position fields are number inputs, which
      Obsidian's phone rule does not select". With the phone rule switched off by
      CSSOM under phone staging at 380, each field is 75px both ways.
- [x] At 320, 380, 470, 530, 546, 600 and 620, in desktop and phone staging,
      `documentElement.scrollWidth` equals the viewport.

**Instrument and gates**

- [x] `shot.mjs`: `PLATFORMS` gains `phone: ['is-mobile', 'is-phone']`, with the
      comment's own reason (the app's phone variables and `.is-mobile`'s
      controls, which `calibrate.mjs` already carries).
- [x] Shots at the land stop, each taken through its own query, with its height
      measured off `document.body.scrollHeight` and written in its comment:
      `editor-narrow` (380), framed whole; `editor-phone` (380,
      `platform=phone`), framed whole; `editor-tablet` (820, `platform=tablet`);
      canvas threshold at 530 and 546; row threshold at 600 and 620.
- [x] `npm run lint`, `npm test` and `npm run build` pass, and `styles.css` is
      regenerated.

**Device checks**, the owner's, in the throwaway vault on a phone. Each is a claim
the harness cannot settle. The fixture is `Sheetsmith layouts/Harness
populated.sheetsmith` open in the layout editor pane, plus `Group
variations.sheetsmith` for check 4.

1. **Scroll.** Swipe up and down starting on canvas blocks. The pane scrolls.
2. **Tree drag.** Long-press a row's grip and drag onto a container row. Record
   whether it drops on iOS and on Android. Either way, the row menu's
   **Move into** works with a tap.
3. **Keyboard and zoom.** Focus **Label** and then **col**. The page does not
   zoom: 1.14.4's desktop `index.html` sets `maximum-scale=1.0,
   user-scalable=no`, and the mobile bundle's is unread. The field stays above
   the keyboard.
4. **Nested.** On `Group variations`, select a child inside a Group narrow
   enough to collapse on its own width. Pressing and dragging it moves nothing.
   A touch scroll starting on it does not scroll, which is the cost recorded in
   §1 and not a failure.
5. **Tablet** (an iPad, or a phone in landscape). On a canvas still drawn as a
   grid, tap to select, then drag and resize: both work as before, since nothing
   about touch changed above the threshold. **Back to the selection** returns to
   the block or row the selection came from.

## Commit boundaries

1. `test: Stage a phone in the harness`. `harness/shot.mjs`: `PLATFORMS.phone`;
   `editor-narrow` framed whole at its measured height; the new `editor-phone`,
   `editor-tablet` and four threshold views. It lands first so before-shots can
   be taken.
2. `fix: Keep the layout editor's own buttons' padding on a tablet`.
   `src/styles/editor.css` (§5), `styles.css`, and `src/styles.test.ts` (the
   guard reaching `editor/`).
3. `test: Hold the position fields clear of Obsidian's phone rule`.
   `src/editor/config-panel.test.ts`.
4. `fix: Stop moving a component the canvas draws as one column`.
   `src/editor/grid-guides.ts`, `src/editor/schematic-gestures.ts`, the note
   line in `src/editor/canvas.ts`, `src/styles/editor.css` (§1), `styles.css`,
   and their tests.
5. `fix: Stack the layout editor's rows below the width its forms are known at`.
   `editor.css` (§3), `styles.css`, `src/test/obsidian-stub.ts` and its test
   (`mod-toggle`), and a `styles.test.ts` case that the rule excludes tree rows
   and toggles.
6. `fix: Bring the panel to a selection made far from it`.
   `layout-editor.ts`, `config-panel.ts`, `form-group.ts`, `tree.ts` and
   `canvas.ts` (the press's source), `editor.css`, `styles.css`, and their
   tests.
7. `docs: Record the layout editor's narrow regime`. This doc; `docs/SPEC.md` §7
   (a one-column canvas takes no gesture, the rows stack, the way back);
   `docs/UI.md` §4 (the editor's two narrow rules and their derivations) and §7
   (where a press's outcome is far away, the press brings it, which is the
   reading §4 rests on); the four `docs/BACKLOG.md` § UI rows removed, with the
   position-field row's non-reproduction recorded here and not carried, and one
   row added for the withdrawn select-step drag; `layout-editor-pane.md`'s "the
   panel needs no chrome of its own" annotated for **Back to the selection**; a
   pointer line under `layout-editor-pane.md`'s and `grid-canvas.md`'s
   narrow-regime cuts.

## Deliberately not doing

- **The sheet's reflow.** It is ruled. Nothing in `sheet.css` changes. The canvas
  reuses the sheet's collapse and does not restate it.
- **A phone arrangement, a mobile order, or any per-width placement.** Model
  question.
- **Section navigation for a phone reader**, the D&D Beyond shape. That is
  authored structure, a Tab set, and not an editor concern. Recorded so "editing
  order" is not read as the whole phone story.
- **Authoring on a phone.** The phone regime is for reading a layout and making
  small fixes: a label, a number, a formula, a placement as numbers. No drag
  creation, no phone-specific add flow.
- **A nested grid that collapsed on its own width keeps the grid regime's touch
  rules** (§1). Its gestures are refused, and every overlay on it is still
  `touch-action: none`, so the whole of it traps touch scroll: a scroll has to
  start in a gutter or outside the container. Tabulating `.sheetsmith-cols-N`
  again in `editor.css` would close it. Cut by the owner.
- **The select-step touch drag that was §2.** On a canvas still drawn as a grid,
  an unselected overlay would scroll under touch and only the selected one would
  drag, carrying `data-ignore-swipe` so the drag does not open the sidebar. Out,
  waiting on a pass on a real device, because it changes tablet behaviour outside
  the narrow widths, and its cost, that no touch scroll can start on the selected
  cell, shows only on touch. A `docs/BACKLOG.md` § UI row holds it, and the
  research it needs is kept under the sidebar question above: the swipe
  handler's exits, and why no hold delay.
- **Moving the canvas below the panel at phone width.** See the order question.
- **Every other pane row in `docs/BACKLOG.md` § UI and § Patterns**, untouched
  on purpose and not to be fixed in passing: the drag image on grip handles, the
  select chevrons, the forced-colors marks on a bad drag, disabled-control
  styling, list labelling, and the Layout file dropdown.
- **The target size of the tree's glyph buttons** (`clickable-icon`, 24px plus
  the app's padding). That belongs to the list-labelling and controls pass. The
  resize corner meets WCAG 2.5.8 under a coarse pointer at 24 × 24. On a fine
  pointer it is 18 × 18, and it meets the criterion by its "equivalent"
  exception: width and height do the same through fields that are 65 × 30. Those
  four fields are 65 × 30 desktop and 75 × 44 phone, with 8px between them, so
  they pass outright and need no spacing exception.

## Measured once built

The same driver, harness built from this branch. Shot heights are in
`harness/shot.mjs` beside each view.

| What | Measured |
| --- | --- |
| Fit | `documentElement.scrollWidth` equals the viewport at 320, 380, 470, 530, 546, 600 and 620, desktop and phone staging |
| The drag at 380 | `weapons`' fields `1 1 4 3` before and after. At 546 (pane 520, a grid) the same drag gives `4 1 4 3` |
| Touch scroll at 380 | From an overlay (`elementFromPoint` confirms it), 602px, against 0 before. Computed `touch-action` `manipulation`, cursor `pointer`, resize corner `display: none` |
| The note | `block` at 530 (pane 504) and 380, `none` at 546 (pane 520) |
| Rows | At 600 (pane 574) every reached row is `column`; at 620 (pane 594) every one is `row`. Toggles, the heading and all 128 tree rows stay `row` at 320, 380, 600 and 620, desktop and phone staging. No name clips at 320 or 380 in either staging |
| Descriptions at 380 | Every stacked row's info column is **292px of the row's 308** in both stagings, the 16 being the app's own trailing margin on `.setting-item-info`, wherever the description wraps: **Label** 3 lines (12 before), **Grid columns** 4 (14 before), **Name column position** 4 desktop and 5 phone, **Name column heading** 2, the three list fields' descriptions 4, 7 and 10 (5, 7 and 11 phone). **Position**'s `Grid units.` is one line and its column is as wide as the text, 58 desktop and 62 phone, since a stacked row does not stretch its info. The toggles keep their side-by-side description, as the app's do: **Characters may add rows** 7 desktop, 8 phone; **Hide the heading** 5 |
| The way back at 380 | Pressing **Abilities** in the tree, desktop and phone: title at the top, focused, **Back to the selection** displayed. Pressed, focus is on **Abilities**' name and it is in view. A real press on its canvas block lands focus on the title too, after the block's own focus. At 1400 under `&bounded` neither the first nor the last row's press scrolls, and the button is `display: none` |
| Tablet at 820 | `.sheetsmith-tree-name` `0px` and 49 wide, `.sheetsmith-tree-disclosure` `0px` and 24 wide, `.sheetsmith-canvas-overlay` `0px`, with `is-tablet` on and off |
| After the design wave, at 320 and 380, desktop and phone | No tree row puts its controls under its name, and no tree name clips. **Position** wraps `col row` over `width height` at 320 and in phone staging at 380, and is one line at 380 desktop. **Recharging features, unheaded**' title is one 238px line with the button under it at 320 and 380 phone, where it was 77px, three lines and clipped. A keyboard Enter on a tree name leaves the title `:focus-visible` with a 2px solid outline |
| Position fields under phone staging at 380 | 75px each with the app's `.is-mobile input[type='text']` rule present, and 75px with it deleted through CSSOM: the rule does not select them |

**One harness artefact, not a defect**: unbounded, the harness page scrolls
the window, so a press in the split regime that scrolls the window past the
panel's top does reveal it there, and a revealed title sits under the harness's
own bar. In the app the leaf is the scroller and the split panel is always at
its top, which `&bounded` reproduces.

## How it was measured

- **Driver.** `harness/cdp.mjs`'s `launch`, `setDeviceMetricsOverride` at
  `{ width, height, deviceScaleFactor: 1, mobile: false }`, and `index.html?
  surface=editor&theme=light&open=<id>`. Platform staging is `shot.mjs`'s own:
  `Page.addScriptToEvaluateOnNewDocument` adding `is-mobile` plus `is-phone` or
  `is-tablet` to `body`, with `setTouchEmulationEnabled`. Waited 2.5s after
  load.
- **Fit.** `documentElement.scrollWidth` against `clientWidth`. Every element
  in the pane whose right edge passed the viewport, outermost only.
- **The drag.** `Input.dispatchMouseEvent`: press at the overlay's centre, ten
  moves of 12px, release. The four position inputs read before and after, and
  the cell's `getBoundingClientRect` and `style.gridColumn`.
- **The scroll.** `Input.synthesizeScrollGesture`, `yDistance: -300`,
  `gestureSourceType: 'touch'`, from an overlay's centre, a tree name's centre,
  and x = 8 beside an overlay. The sum of `scrollY` and every element's
  `scrollTop`, before and after. `elementFromPoint` confirms what was hit and
  its computed `touch-action`.
- **Rows.** Before the build, viewports 360 to 1180; once built, 320, 380,
  600 and 620, every `.setting-item` in the panel and the
  outline with a visible control: the name's clipping, the info column's width,
  and the description's height over its line height.
- **Tablet.** Every pane button outside the canvas, after clicking each tree
  row's name in turn: computed padding and box, `is-tablet` on, then removed and
  read again. The overlay separately, its box against its cell's.
- **Obsidian's own code.** Read from `obsidian-1.14.4.asar` in Obsidian's
  application support directory: `app.css` (the phone rule, `touch-action`
  owners), `app.js` (the mobile swipe handler's exits, the iOS long-press
  `contextmenu` and its `draggable` delay), and `index.html` (the viewport
  meta). The asar is the desktop build. The mobile bundle was not read, which is
  why checks 2 and 3 are device checks.
