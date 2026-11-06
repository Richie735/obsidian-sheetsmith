# Canvas touch select step

Status: shipped
Board card: none. Scoped from the owner's planning handoff, standard route, to
retire the `docs/BACKLOG.md` § UI row *On a tablet the canvas is a touch scroll
trap: every overlay is `touch-action: none`*. Its trigger, a pass on a real
device, was met on 2026-10-21.

## Model question

None: nothing is read, written, published or stored, and no `SPEC` §13 question
is open on it, so the model step is skipped.

## What it does

On a canvas still drawn as a grid, a touch on a block no longer traps the pane.
A swipe that starts on an unselected block scrolls, a tap selects, and only the
selected block drags under a finger, without opening Obsidian's sidebar. A mouse
drags any block in one gesture, as today.

## Smallest version

Unselected overlays `touch-action: pan-y pinch-zoom` (§2 says why not
`manipulation`). The selected one carries
`data-ignore-swipe`, and CSS reads that attribute for `touch-action: none`. One
refusal in `beginDrag`: a press that is not a mouse, on an overlay without the
attribute, returns before `preventDefault`, so it goes on to `click` and selects.
What it gives up: no touch scroll can start on the selected block, and dragging
an unselected block takes a tap first, which on a stacked pane also jumps to the
panel (Design §5).

## Evidence that started it

Measured on a real iPad on 2026-10-21. In portrait a scroll could start only in
two 12px gutters. In landscape the canvas column had no gutters, and 7,373px of
scroll could be reached only from the rows above the canvas. The research it
rests on is in `layout-editor-narrow-regime.md`, under the sidebar question:
the swipe handler's exits, why `touch-action` alone does not stop the swipe, and
why there is no hold delay.

## Design

### §1. Which presses take the step: everything but a mouse

The decision is made **per press, by `event.pointerType`**, never by `is-tablet`
or a media query. A touch laptop's mouse still drags any block in one gesture,
and its finger takes the step.

**A pen takes the step too, which goes against the brief's "mouse or pen drags
as today", and this is why.** `touch-action` applies to every direct-manipulation
pointer and not only to touch (Pointer Events Level 3: "which are not limited to
touch, despite the property's name"). iPadOS pans the page under an Apple Pencil
the way it does under a finger. CSS cannot vary `touch-action` by pointer type.
So once an unselected overlay can pan, a pen press on it pans, the
drag gets a `pointercancel`, and "pen drags as today" is not on offer. The only
pointer whose drag is untouched by `touch-action` is a mouse, so the guard tests
`pointerType !== 'mouse'`. Whether a Pencil pans there is a device claim, not a
harness one (device check 6).

### §2. Where the selected state lives: one attribute, read by CSS and by the guard

`canvas.ts` already marks the selected overlay `.sheetsmith-preview-editing` in
its placed-level paint (the branch that calls `bindBlock`). **Beside that class,
the same branch sets `data-ignore-swipe="true"`** on the overlay. It does this
only in that branch. `wireUnplacedChildren`, a Tab set's tabs, never sets it,
since nothing there can be dragged.

- **CSS reads the attribute, not the class.** The base rule's `touch-action:
  none` becomes `pan-y pinch-zoom`, and a new rule
  `.sheetsmith-view .sheetsmith-canvas-overlay[data-ignore-swipe]` takes `none`.
  Keying it to the attribute means one mark answers both the browser's question
  (may this touch pan?) and the app's (may this touch open the sidebar?), and
  only a draggable overlay can carry it. The class is also on tree rows and on
  unplaced children, so keying to it would trap scroll on overlays that have
  nothing to drag.
- **Vertical only, not `manipulation`.** This read `manipulation` as approved,
  and the design wave changed it: the canvas's own view is an `overflow-x: auto`
  scroller, and at 820 under tablet staging it holds 75px it cannot show (a
  `docs/BACKLOG.md` § UI row). Under `manipulation` a finger drawn leftward
  across an unselected block scrolled the canvas sideways by all 75px. `pan-y
  pinch-zoom` keeps the vertical scroll and drops only the sideways one, which
  no block offered before either, when every overlay was `none`. The narrow
  rule below 480 keeps `manipulation`, since nothing there changes.
- **The guard reads the same attribute off the overlay containing the press**:
  `beginDrag`, right after the `drawnAsGrid` refusal and before `button` and
  `preventDefault`, returns where `event.pointerType !== 'mouse'` and the
  overlay lacks `data-ignore-swipe`. It reads the closest overlay (the `cell`
  `bindBlock` was handed), never `event.target`. A press on the selected block's
  resize corner has the corner span as its target, and the span carries no
  attribute, so reading the target would refuse that resize. That is the browser's own input. It decided
  `touch-action` from that element at touch start, so the guard and the pan
  cannot disagree. The gesture host does not grow a `selection` read.
- **It is in the DOM before the next touch.** `click` calls `host.select`, which
  sets the selection and redraws synchronously (`layout-editor.ts` `select`), so
  the new overlay is created with the attribute inside the tap's own `click`
  handler. A test holds this (Acceptance).

A swipe that pans fires `pointercancel` and no `click`, so a scroll selects
nothing.

**Under the narrow query**, the existing `@container sheetsmith-sheet
(max-width: 480px)` rule adds the attribute selector to its own, so the selected
overlay is `manipulation` there too. Without it the attribute rule's (0,3,0)
would beat the narrow rule's (0,2,0) and put a trap back in the regime that
already scrolls. The attribute stays on the narrow selected overlay, so a sidebar
swipe cannot start on that one block at phone width. That is a minor cost and is
accepted: the attribute is set at paint time, and a width read then would go
stale on a resize.

### §3. The accepted cost, and the way out

**No touch scroll can start on the selected block.** That is the price of a
drag that needs no hold delay (the WebKit 185656 argument in the narrow-regime
doc). There are two ways out, both single taps that exist today: tap another
block, which moves the selection and with it the attribute, or select the
**Layout** row in the tree, which takes the selection off the canvas. A press on
the selected block still never deselects ("Selects, never deselects" in
`bindBlock`'s `click`), and that does not change here.

### §4. The three `touch-action: none` sites

| Site | Under the select step |
| --- | --- |
| `.sheetsmith-view .sheetsmith-canvas-overlay` (~1979) | Becomes `pan-y pinch-zoom`. The `none` moves to the `[data-ignore-swipe]` rule (§2). The comment says why |
| `.sheetsmith-preview-cell` (~2137) | **Untouched.** No element carries the class. It belongs to the interim schematic that `grid-canvas.md` retired. Removing it is not this feature's job |
| `.sheetsmith-preview-resize` (~2282) | **The declaration is removed.** An element's effective `touch-action` is its own intersected with its ancestors' up to the scroller. So the selected overlay's `none` already covers its corner, and an unselected corner falls back to its overlay's `pan-y pinch-zoom` instead of leaving an 18 to 24px trap in every block |

### §5. The resize corner on a coarse pointer above 480px: the selected block only

Today `@media (pointer: coarse)` draws every cell's corner at 24 × 24, opacity
1. Under the step, a finger on an unselected corner can only select, so drawing
a handle there promises a resize that does not come. Inside the coarse query,
the corner is `display: none` unless its overlay carries `data-ignore-swipe`.
Fine pointers are unchanged: the corner appears on hover, on focus and on the
selected block, as today. A touch laptop's mouse still finds it.

**The panel jump on a stacked pane.** At an iPad's 820 the pane is stacked
(below 1176), so the tap that selects also brings the panel to the reader, under
`layout-editor-narrow-regime.md` §4. Dragging an unselected block on a tablet
therefore takes four steps: tap, the pane jumps, **Back to the selection**, then
drag. **Kept, and named as a cost.** The tap cannot know whether the reader
wants the form or the drag, the jump is one rule that does not depend on the
pointer, and the way back already lands on the selected block. Rejected: holding
the jump back for a touch select on a grid canvas. That would give a tap two
outcomes depending on what is under it. The owner may prefer it, and it is a
one-line guard in `select` if so.

### §6. What tells a touch reader the step exists: nothing new

No new copy, so nothing is added to `src/en.ts`. A cursor says nothing under a
finger. The column note is displayed only at 480 and below, and it describes a
different regime, so neither carries the step. Two cues already drawn do: the
selected ring (`.sheetsmith-preview-editing`), and under a coarse pointer the
resize corner on the selected block alone (§5). A handle on exactly one block
says which one can be handled. Under a mouse the cursor stays `grab` on every
block, since a mouse drags any of them. If the device pass finds the step
undiscoverable, a coarse-only line beside the column note is the next move,
through `en.ts`.

### §7. The nested grid that collapsed on its own width

**Still cut, and the step makes its cost smaller.** Today every overlay on such
a grid is `none`, so the whole of it traps. Under the step its unselected
overlays scroll, because the base rule changed. Only its
selected block carries the attribute and traps, and the `drawnAsGrid` guard
refuses that block's drag anyway. So the cost goes from the whole nested grid to
one selected block, the same cost as §3. Closing that last block would still
need the `.sheetsmith-cols-N` tabulation the narrow-regime doc cut.

### Empty and error states

None of their own. An empty canvas has no overlays. With nothing selected on the
canvas (the **Layout** row selected), no overlay carries the attribute, and the
whole canvas scrolls under touch. A broken layout draws no canvas.

### What it reuses

`drawnAsGrid`'s refusal shape (return before `preventDefault`, so the press
becomes a `click`), the existing selected paint branch, the narrow-regime
research on `data-ignore-swipe`, `shot.mjs`'s `platform=tablet` staging and
`hold=`.

## Config fields

None.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |

## Data and file model

Nothing is stored. A drag writes the same placement it writes today. Round trip
and existing notes are not reached.

## Acceptance criteria

Harness widths are viewports, as in the narrow-regime doc (pane = viewport less
26).

**Tests**

- [x] `schematic-gestures.test.ts`: "a touch press on an unselected block
      selects and moves nothing", "a touch press on the selected block drags
      it", "a pen press on an unselected block selects and moves nothing", and
      "a mouse press on an unselected block drags it". The first and third are
      red before the guard. The existing drag, resize and nudge tests pass with
      no assertion changed. Their presses are mouse, or they gain
      `pointerType: 'mouse'` where the double omits it.
- [x] "a corner press by touch on an unselected block resizes nothing".
- [x] "a touch press on the selected block's resize corner resizes it". This is
      red if the guard reads `event.target` instead of the overlay.
- [x] `canvas.test.ts`: the selected placed overlay carries
      `data-ignore-swipe` and no other overlay does. An unplaced Tab set child,
      selected, does not carry it.
- [x] `schematic-gestures.test.ts`: "after a click on an unselected overlay,
      with no await, the overlay now in its cell carries the attribute". In this
      file, not `canvas.test.ts`, because the claim rests on the real pane's
      `select` redrawing synchronously, and `canvas.test.ts` drives the canvas
      over a fake host that does not redraw.
- [x] `styles.test.ts` (or the editor-CSS test that already reads the rules): the
      base overlay is `pan-y pinch-zoom`, `[data-ignore-swipe]` is `none`, the
      corner declares no `touch-action`, and the narrow query's rule matches the
      attribute selector at equal weight.

**Harness**, `surface=editor&theme=light`, 820, `platform=tablet`

- [x] Shots: `editor-tablet` with no canvas selection (`open=::sheet::`),
      `editor-tablet` with `open=weapons`, and a new `editor-tablet-drag`:
      `open=weapons` and `hold=` on its overlay, moved one column or more. The
      drawing changes in two places: unselected blocks lose their 24px corners,
      and the drag shot shows guides and the moved block. Before and after are
      taken for the first two.
- [x] `hold=` presses with `Input.dispatchTouchEvent` (`touchStart`, stepped
      `touchMove`, no `touchEnd`) when the view stages a touch platform, and
      with the mouse otherwise. No existing `hold` view stages a platform, so no
      existing shot changes. With touch, the drag shot shows the move. A
      control run with `hold=` on an unselected block shows no move.
- [x] Measured through the narrow-regime doc's driver at 820, `platform=tablet`:
      `Input.synthesizeScrollGesture` (touch, `yDistance: -300`) starting on an
      unselected overlay scrolls the pane. Before the change it scrolled 0. The
      same gesture starting on the selected overlay scrolls 0, which is the
      accepted cost. Computed `touch-action` is `pan-y pinch-zoom` and `none`.
- [x] At 380, `platform=phone`, the selected overlay computes `manipulation`
      and a touch scroll from it scrolls (the narrow regime is unchanged).
- [x] A mouse drag at 1400 desktop on an unselected block moves it in one
      gesture (the CDP drag in the narrow-regime doc, on a block that is not
      `open=`).
- [x] `npm run lint`, `npm test`, `npm run build` pass, and `styles.css` is
      regenerated.

**Device checks**, the owner's, on a real iPad in portrait and landscape, in the
throwaway vault with `Sheetsmith layouts/Harness populated.sheetsmith` open in
the layout editor pane. Items marked **device only** cannot be settled by the
harness.

1. A swipe starting on an unselected block scrolls the pane.
2. A tap on a block selects it, and the ring and its corner appear. In portrait
   the pane jumps to the panel, and **Back to the selection** returns to the
   block.
3. A drag on the selected block moves it, and resizing from its corner works.
   **Device only:** the drag does not open Obsidian's sidebar, in either
   direction, starting near the canvas's left edge as well as its middle.
4. A swipe starting on the selected block does not scroll (the accepted cost).
   A tap on another block, or on the **Layout** row, frees it.
5. **Device only:** a swipe from the left edge outside the selected block still
   opens the sidebar, so the attribute holds only on the block that carries it.
6. **Device only, if a Pencil is to hand:** a Pencil on an unselected block
   behaves as a finger does (scrolls, tap selects), as §1 argues. Recorded
   either way.
7. On desktop, a mouse drags an unselected block in one gesture.
8. On the iPad at 820, drag a block that is not selected. Record the steps it
   takes and whether the panel jump (§5) gets in the way.

## Measured once built

The harness built from this branch. The before column is the same build with
`canvas.ts`, `schematic-gestures.ts`, `editor.css` and `styles.css` checked out
from the version branch, so commit 1's touch `hold=` was already in place. The
driver is the narrow-regime doc's: `Input.synthesizeScrollGesture`, touch,
`yDistance: -300`, from the first point down the overlay's left edge (x + 30)
where `elementFromPoint` returns the overlay itself, and the sum of `scrollY`
and every element's `scrollTop` before and after. Scroll runs use an 820x1180
frame, since at the shots' full height nothing scrolls.

| What | Before | After |
| --- | --- | --- |
| 820 tablet, `open=weapons`, scroll from unselected **Abilities** | `touch-action: none`, **0px** | `manipulation`, **594px**; after the design wave `pan-y pinch-zoom`, **602px** |
| 820 tablet, a touch hold on unselected **Abilities** moved 140px left | nothing pans, every overlay `none` | `manipulation`: the canvas's view scrolled **75px** sideways (`scrollLeft` 0 to 75). `pan-y pinch-zoom`: **0** |
| 820 tablet, scroll from selected **Weapons** | `none`, no `data-ignore-swipe`, 0px | `none`, under `data-ignore-swipe`, **0px**, the accepted cost |
| 380 phone, scroll from selected **Weapons** | `manipulation`, 604px | `manipulation`, under `data-ignore-swipe`, **602px**: the narrow regime is unchanged |
| 1400 desktop, `open=abilities`, mouse drag on unselected **Weapons**, ten moves of 12px | `grid-column` `1 / span 4` to `3 / span 4` | the same: one gesture, no tap first |

**Shots**, before and after, each clipped to `.sheetsmith-editor-canvas` at
820x23950 under `platform=tablet`: `open=::sheet::`, `open=weapons`, and the
drag (`open=weapons`, a touch `hold=` on `preview-weapons` moved 140px). After
the change every unselected block's 24px corner is gone, Weapons' own and its
cards' included, and only the selected Weapons keeps one. With no canvas
selection, no block draws a corner. The drag shot shows the guides and Weapons
carried two of Proficiencies' columns. Before the change the same touch hold
did that too, because every overlay was `none`.

**The control run**: a touch `hold=` on unselected **Abilities**, moved 140px,
`open=weapons`. No block moved and no guides were drawn: the press panned and
selected nothing. Not kept as a view. The canvas sat about 7px further right
in that shot than in the drag shot, and the design wave found why: the
document has no horizontal overflow at 820, but the canvas's own
`.sheetsmith-view` is an `overflow-x: auto` scroller with a `scrollWidth` of
869 in a `clientWidth` of 794 under tablet staging (839 on desktop staging), a
75px sideways range. A rightward hold from `scrollLeft` 0 has nowhere to go, so
it barely moves. A leftward one, measured above, slid the canvas the whole
75px. That is why the base rule is `pan-y pinch-zoom` (§2). The only element
measured past the canvas's right edge is **Attacks**' `<table>`, 99px past,
inside its own `overflow: auto` wrapper; why that reaches the canvas's
scrollable overflow was not chased, and a `docs/BACKLOG.md` § UI row holds it.

**The selected ring** (§6, device check 2) did not draw on a canvas overlay
before the design wave, here or on desktop. The overlay's own rule, (0,2,0),
declared a transparent border and no shadow and outweighed
`.sheetsmith-preview-editing` at (0,1,0). A
`.sheetsmith-view .sheetsmith-canvas-overlay.sheetsmith-preview-editing` rule
draws it again, approved by the owner, and **outside the block**: a 2px
`--interactive-accent` outline offset 1px, where the first answer put the border
colour and the inset shadow back and the ring then lay on the component's own
content, touching the "W" of the Weapons heading. Outside, its 3px sit in the
grid's 8px gutter, and the canvas view's 16px padding holds it at the edges:
Abilities, a full-width top-row block, shows all four sides at 820. Measured on
Weapons at 820, the ring's two columns are `#9873f7` on white, **3.43:1** over
the 3:1 a state mark owes, and 4px clear of the "W". It is the shape the
forced-colors answer already drew, so that answer now sets only
`outline-color: SelectedItem` on the canvas's selector. With the ring back, the selected block's resize arc is no
longer the only mark of the selection, so its 2.30:1 stays as it was.

`editor-tablet-drag`'s height, 23901, is `document.body.scrollHeight` through
its own query, recorded beside the view.

## Commit boundaries

1. `test: Press with touch in a staged harness drag`. `harness/shot.mjs`:
   `hold=` dispatches touch under a touch platform, and the new
   `editor-tablet-drag` view with its measured height. It lands first so
   before-shots can be taken.
2. `fix: Let a touch scroll start on an unselected canvas block`.
   `src/editor/canvas.ts` (the attribute), `src/editor/schematic-gestures.ts`
   (the guard), `src/styles/editor.css` (§2, §4, §5 and the narrow rule),
   `styles.css`, and their tests.
3. `docs: Record the canvas's touch select step`. This doc. In
   `layout-editor-narrow-regime.md`, §2's body is replaced by a pointer here
   rather than un-withdrawn, because that doc is shipped and records what it
   built. Its "select-step touch drag" bullet, the nested-grid cost in §1 and
   Deliberately not doing, the sidebar question's "That drag is out of this
   feature", and device check 5 each gain a line pointing here. `docs/BACKLOG.md`
   § UI: the scroll-trap row is removed. `docs/SPEC.md` §7: one sentence, that
   on a grid a touch drags only the selected block. `docs/UI.md` §7: one bullet,
   the select step and its cost. The `editor.css` comment beside the narrow
   rule is updated where it describes the nested grid's cost.

## Deliberately not doing

- **Every other `docs/BACKLOG.md` § UI row**, including WebKit select clipping,
  the Passport chip width and the empty card select. Not to be fixed in passing.
- **The narrow regime below 480px.** It already scrolls. Only the one selector
  that keeps it scrolling changes (§2).
- **Any hold-to-drag or long-press variant.** It needs a non-passive
  `touchmove` (WebKit 185656), which this source does not have.
- **The tree's HTML5 drag.** Untouched. The row menu remains its touch route.
- **Closing the nested collapsed grid's last trap** (§7). It still needs the
  `.sheetsmith-cols-N` tabulation.
- **Removing the dead `.sheetsmith-preview-cell` rules** (§4).
- **Holding back the panel jump for a touch select on a grid canvas** (§5). If
  device check 8 finds the jump in the way, that is a follow-up feature, not
  part of this run.
- **New copy explaining the step** (§6). Only if the device pass asks for it.
