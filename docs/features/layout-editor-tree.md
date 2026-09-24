# Layout editor tree

Status: shipped
Board card: The layout editor's component tree (`src/editor/tree.ts`,
`renderTree`). Three changes to one row, taken as one feature: a container row
can be collapsed so its children are not listed; nesting is legible at a glance
rather than only through a left indent; and Move up, Move down, indent and
outdent come off the resting row.

## Model question

**One, settled with the owner before this spec and recorded as an open entry
in `SPEC` §13**: "Whether the layout editor's tree may collapse a container,
and move its reorder controls off the row". It is open until this is built,
and `/land-it` writes its `Resolved:` line. The argument is in that entry and
is not repeated here. What it settles, as a list the design below builds on:

1. **A row menu, plus keyboard shortcuts.** One menu button per component row
   opens an Obsidian `Menu` holding Move up, Move down, a move into, a move
   out of, and Remove. Items name what they act on. A move `canReparent`
   refuses is a disabled item, and every route still asks `canReparent` before
   writing. Alt+Up/Down reorder and Alt+Right/Left move in and out, while the
   row's name button has focus. Remove is the last item, a warning, with no
   confirmation. The resting row is a drag handle, a name and a menu.
2. **Collapse state lives in the pane's view state**, keyed by container `id`,
   with everything expanded by default. Ids the layout no longer holds are
   dropped on restore.
3. **The tree never hides the selection.** Selecting inside a collapsed
   container expands its ancestors. Collapsing the container that holds the
   selection moves the selection to it. A drop onto a collapsed container
   moves the row in and leaves the container collapsed, with a count showing.
   A menu or keyboard move into or out of a collapsed container expands it. A
   collapsed container drags with its children.

**The contract does not grow.** No `ComponentDefinition` member, no
`ConfigFieldSpec` kind, no `RenderContext` member. "Is this row a container" is
`isContainer(getComponent(type))`, which the tree already asks.
**Nothing is published to formulas, nothing is stored in a layout or a note**,
so Constraints 3 and 4 are untouched: the only new persisted bytes are in
Obsidian's workspace file, as view state.

**Two findings from checking the settled answer, both recorded here rather
than assumed:**

- **The shortcuts do not collide** (details in the §13 entry, checked against
  Obsidian 1.13.7's `app.js` and `main.js`). Obsidian's root-scope command
  defaults using Alt are Alt+Enter and Mod+Alt+Left/Right. The one bare
  Alt+Up/Down is on a properties suggester's own scope. CodeMirror's
  Alt+Up/Down applies only inside an editor. The Electron menu has no Alt+arrow
  accelerator, and a focused `<button>` has no browser or OS default for these
  chords on macOS or Windows. A hotkey the author binds to one of these chords
  wins, because Obsidian's keymap listens on the window in the capture phase.
  That is their choice, and the feature does not fight it.
- **Undo does cover a remove, byte for byte, children included.** It is one
  `persist()`, and `docs/features/editor-undo.md`'s own acceptance criteria test
  "removing a component (including one whose children move to the sheet)". Two
  things qualify dropping the confirm, though, and the owner should see both.
  **(a)** Since 0.1.1 undo has **no default hotkey**. It is reached through the
  palette, or a hotkey the author bound in **Settings → Hotkeys**. **(b)**
  `editor-undo.md` § "Confirm-vs-undo" decided that remove *keeps* its
  `ConfirmModal`: a confirm says what is about to be lost, which undo cannot.
  So this spec drops the confirm and keeps what it said. **A removal answers
  with a `Notice` carrying an Undo link** (`SheetView.offerUndo`'s shape), so
  undo is one press away with no hotkey bound. The notice also carries the
  confirm's own sentence about promoted children and character notes (Design
  §5), the second only where the removed component had a section to keep. `editor-undo.md` gains an amendment recording the reversal.

## What it does

The tree beside the canvas reads as an outline. Each nested row's card steps
in by its depth, and a guide line runs from each container down through
everything it holds, so "directly in the layout", "in one container" and "in
two" look different. A container can be folded shut, and a closed one says how
many components it hides. Each row rests at three things: a drag handle, its
name, and a menu for moving and removing. The same moves are one chord away
from the keyboard.

## Smallest version

The menu with its five items, with no keyboard shortcuts: the menu button is
still a tab stop, and Obsidian's `Menu` is keyboard-operable. Collapse through a
chevron in view state, with the three selection rules. Depth shown by indenting
the card itself, with no guide lines and no `role="group"` wrapper. **It gives
up**: a single chord for a move (it becomes Tab, Enter, arrows, Enter); a line
tying a container to its last child, which is what makes depth read on a long
list; and assistive tech hearing "Inside Proficiencies, group" on entering a
container's children.

## Design

### §1. The resting row

```
[▸] Proficiencies                 ⠿  ⋮
    Group · 4 inside
│ [▾] Weapons                     ⠿  ⋮
│     Group
│ │    Attack bonus               ⠿  ⋮
│ │    Card
```

Left to right: the disclosure slot, the name with the description under it,
then the controls: the drag handle, then the menu button.

- **The disclosure slot.** On a container row it holds a glyph `<button>`
  (§3). On every other row it holds an empty spacer of the same width, so names
  at one depth start in one column whether or not the row is a container. The
  `Layout` row has neither, since it is not a component and cannot be collapsed.
  Its name starts where a top-level container's chevron does, because it
  is the root rather than a sibling.
- **The handle stays where it is**, first among the controls on the trailing
  side, as `list-fields.ts`'s `sheetsmith-entry-handle` does. The card's order
  "drag handle, name, menu" is a list of what remains, not an order to rebuild.
  Moving the handle to the leading edge would put it beside the chevron, where
  two glyphs sit a few pixels apart and do unrelated things.
- **The menu button** is `clickable-icon` with Lucide `ellipsis-vertical`.
  `aria-label` is `More options for "Weapons"`, following the handle's own
  `Reorder "Weapons": drag` spelling. That is a glyph control's name, per
  `docs/UI.md` §6. Focus token `tree-menu-<id>`.
- **Up, down, indent, outdent and trash leave the row.** Their focus tokens
  (`tree-up-`, `tree-down-`, `tree-indent-`, `tree-outdent-`, `remove-`) go
  with them.
- **Selected and focused states keep their roles.** `.sheetsmith-preview-editing`
  is the selected mark and the name button's focus ring is the focused one. The
  row had no hover-only affordance and gains none (`UI.md` §7): the menu button
  is always drawn. *Amended in the build:* the name's focus ring had to be
  rebuilt rather than kept, because it drew nothing — the reset that strips the
  app's button chrome from the name also strips `box-shadow`, which is where
  the app draws a button's ring. It is now a 2px accent outline around the name
  alone, with room for it inside the name's own clipped box, so it reads apart
  from the selected card's 1px edge and survives forced colors.

### §2. Depth

**Diagnosis first, because it decides the fix.** `.sheetsmith-row-child` pads
the *text* inside the row by `16px × depth` and draws a 1px left border on the
row's *own* edge. Every row is a card of its own in Obsidian 1.13, so every
nested card's left edge sits at the same x whatever its depth, and so does
the rule. Depth 1 and depth 2 differ by 16px of text offset inside
identical boxes. That is the "unclear" the owner reported, and no amount of
indent inside the card fixes it.

**The fix nests the DOM the way the layout nests.** `renderTree` stops drawing
a flat depth-first list. Each container's children render into a wrapper
directly after the container's row:

```
div.sheetsmith-tree-children  role="group"  aria-label="Inside Proficiencies"
                              id="sheetsmith-tree-children-<container id>"
```

- **The wrapper is indented, not the text**, so the *card* steps in, and each
  step is whatever puts the guide below under the centre of the container's
  chevron: the row card's own padding plus half the slot, then a small gap
  between the guide and the nested cards. That rule decides the number, not the
  other way round (it measures about 35px a step in 1.13.7). Two containers deep
  is two steps of visibly narrower card, which reads at a glance down a long
  list.
- **The guide line is the wrapper's own `border-inline-start`**, 1px in
  `--background-modifier-border-hover` (stronger than the row card's own
  border, so it reads as structure, not as another card edge). It sits under
  the centre of the container's chevron and runs the full height of
  everything the container holds, including the gaps between cards. That is
  the job the old per-row rule could not do, because it was cut into
  row-height pieces.
- **Two containers deep draws two guides**, one per ancestor wrapper, which is
  the depth count drawn rather than inferred.
- **Assistive tech hears the nesting.** Entering the wrapper is announced as a
  group named for its container. That is the whole of the ARIA this adds: no
  `role="tree"` (rejected in §13), and no `aria-level` on a button that is not
  a tree item.
- **DOM order is unchanged**: the sheet's reading order, the layout row
  first. Every test reading rows in order (`labels(harness)`) still reads the
  same sequence, which is a criterion below.
- **`.sheetsmith-row-child` stays**, because `config-panel.ts`'s tab rows use
  it. The tree stops setting it and `--sheetsmith-row-depth` on its rows.
- **The build has to check one risk against the calibrated CSS rather than
  assume it.** Obsidian styles `.setting-item` siblings by adjacency (the
  `margin-bottom` between cards, and `::before` hairlines inside a
  `.setting-group`). The tree is not a `.setting-group`, but a wrapper between
  two rows is a new sibling shape. If the gap between the last child and the
  next top-level row changes, the fix is the wrapper's own margin, and the
  shots in the criteria are where that is seen.

### §3. Collapse

**The control.** A glyph `<button class="sheetsmith-tree-disclosure">` in a
container row's disclosure slot. It is `chevron-down` when open and
`chevron-right` when closed: Record set's icon pair and its
glyph-button-with-`aria-expanded` pattern (`record-set.ts`, `UI.md` §9's
disclosure row). The precedent carries three things:

- `aria-expanded` for the state and `aria-controls` naming the wrapper's `id`.
- `aria-label` and `title`: **Collapse "Weapons"** when open, **Expand
  "Weapons"** when closed. Record set's changing label, in the tree's own
  words.
- `--text-muted` rather than `--text-faint`, for Record set's measured
  reason: faint is under 3:1 on both themes.

Focus token `tree-disclosure-<id>`. A press toggles; Enter and Space arrive
through the button's own `click` (`PATTERNS.md` §6, one route in).

**Where a press is handled.** The row's own whole-row click selects (the
`closest('button, …')` guard). The chevron is a button, so pressing it never
selects. Collapsing is not selecting, and the one case where collapsing
changes the selection is the rule below, not a side effect of the row
click.

**What a collapsed container draws.** Its row and nothing under it: the
wrapper is not rendered at all. Collapsed children do not need
`hidden="until-found"` the way a record body does, because the tree is not
find-in-page content, and the selection rule already reveals anything a search
elsewhere selects. **The description gains a count**: `Group · 4 inside`,
counting every component the collapsed container hides at any depth, since
all of them are hidden. It is shown only while collapsed, because an open
container's contents are on screen. It uses the description line and its type,
so it adds no chrome.

**No motion.** The children appear and disappear on the rebuild, and the
chevron swaps glyphs. Nothing animates, so there is no reduced-motion
companion to write. This is `UI.md` §8's restraint, and Record set's precedent:
its disclosure swaps icons and animates nothing. Animating the wrapper's height
would be a `height` transition across a rebuild that replaces the element,
which is exactly what a transition cannot interrupt.

**Collapse is not an edit.** A toggle calls no `persist()`, so it makes no undo
step and no sheet refresh. It redraws the pane, because the tree's DOM changes.
The panel keeps its fields: collapsing redraws the same selection, and the
pane already restores scroll and focus across a redraw. Focus returns to the
chevron through its focus token.

### §4. Where collapse state lives

On the view, beside the selection, and read by the editor at render time
(`LayoutEditorHost`'s own rule: the host owns posture, the editor never keeps
a copy).

- **`LayoutEditorHost` gains** `readonly collapsed: ReadonlySet<string>` and
  `setCollapsed(ids: Iterable<string>): void`. Like `setSelection`, the setter
  does not redraw.
- **`LayoutEditorView.getState()`** returns `FileView`'s own state plus
  `collapsed: string[]` (sorted, so the workspace file does not churn), and
  omits the key when the set is empty. `setCollapsed` calls
  `app.workspace.requestSaveLayout()` so a toggle reaches the workspace file
  without waiting for another layout change.
- **`setState(state)`** reads `collapsed` when it is an array of strings and
  ignores anything else. **The state is per file**, and this is a decision the
  settled answer did not state. A `setState` that names a different file from
  the one open (the **Layout file** dropdown, a file opened from the explorer)
  replaces the set with whatever that state carries, which is empty when it
  carries none. It is the same moment the undo stack clears, for the same
  reason: an id like `abilities` means a different container in a different
  layout. The legacy `{ layout: <basename> }` translation passes `collapsed`
  through unchanged.
- **Ids the layout no longer holds are dropped at render**, not at `setState`.
  The view cannot know the layout's containers before the file is parsed, and
  the render is where the selection fallback already corrects stale posture.
  An id naming a component that is not a container is dropped the same way.
- **Two panes on one layout collapse independently**, because each is its own
  view with its own state.

### §5. The row menu

Built on press of the menu button with `new Menu()` and shown at the button
(`showAtMouseEvent` for a pointer press; `showAtPosition` under the button's
rect for a keyboard press, where `event.detail === 0`). Items, in order:

| Item | Icon | Disabled when | Does |
| --- | --- | --- | --- |
| **Move up** | `arrow-up` | drawn first in its level; *left out* on a placed grid | moves it to the file slot of the row drawn above |
| **Move down** | `arrow-down` | drawn last in its level; *left out* on a placed grid | moves it to the file slot of the row drawn below |
| *separator* | | | *left out with the two above* |
| **Move into "<row drawn above>"** | `chevron-right` | `canReparent` refuses | `reparent(layout, config, rowDrawnAbove)` |
| **Move out of "<parent>"** | `chevron-left` | `canReparent` refuses | `reparent(layout, config, grandparent)` |
| *separator* | | | |
| **Remove** | `trash-2` | never | removes, `setWarning(true)` |

- **Every move reads its level as the tree draws it**, which is the grid
  reading order `walkComponents` sorts into, not the file's array. The two
  differ on a placed grid, where a move decided by file index once acted on
  rows the tree did not draw beside it (`SPEC` §13, "What Move up and Move down
  mean on a placed grid"). **In a Tab set they agree only while the tabs'
  stored positions tie**, since the strip reads the file and the tree sorts by
  row. An insert and a paste give a tab column 1, row 1, which ties; a tab
  moved in through the tree is given the set's next free row (`reparent.ts`),
  which breaks the tie, and from then on a Move up changes the strip and not
  the tree. **That case is a known gap, deferred as its own bug**, since its fix
  is in the walk's sort or in `reparent.ts`; `layout-editor.test.ts` carries it
  as an `it.fails` case.
- **On a placed grid there are no Move up and Move down**, since the sheet reads
  that level by position and a reorder of the file would change nothing on
  screen. They are left out, with the separator after them, rather than drawn
  disabled: nearly every level is placed, so disabled items would sit on almost
  every row for good. Where a component sits there is the canvas's, by drag or
  its arrow keys. They stay on a level whose children are not placed
  (`childIsPlaced`), a Tab set's tabs, whose strip reads the file's order.
- **"Into" means the row drawn directly above**, which is where an outliner's
  indent goes. Where there is no row above, or it is not a container, the item
  reads **Move into a container** and is disabled. At the top level, the out item
  reads **Move out of a container** and is disabled. **The into and out items
  keep their shape** rather than dropping out, so the out move always follows
  the into move. Quotation marks around a label follow `removalMessage`'s and the
  handle's own spelling.
- **Naming follows one rule**, stated in the §13 entry: a control names every
  party its context does not already announce. The menu is reached through a
  button named for its row, so an item names only the other party. Move up
  and Move down have no other party, since the neighbour is directly on screen.
- **A disabled item cannot say why** (`MenuItem` has no description). The
  reason is reachable two ways: dragging to the same place shows it inline,
  and the shortcut does too (§6).
- **Remove asks nothing**, per the settled answer. Its consequence is said
  after the fact, in a `Notice` with an Undo link that lasts
  `UNDO_TIMEOUT` (the sheet's reset notice already uses it):
  - no children: **Removed "Armour class". Character notes keep its section.
    Undo**
  - children: **Removed "Defences". The 2 components inside it moved to the
    bottom of the sheet. Undo**
  - an empty container: **Removed "Spellbook". Undo** — no section sentence,
    because a container stores nothing in a note (`storage: 'none'`), so there
    is no section for character notes to keep.

  **Undo** runs the pane's own `undo()`, **only if the file still holds what
  the removal wrote**: the pane's `onDisk` is compared with the bytes the
  removal persisted. Otherwise it says **Sheetsmith did not undo: this layout
  has changed since.** That is `SheetView.restoreDocument`'s guard read for the
  layout, because an author who removed, edited, then pressed a stale Undo
  would otherwise lose the edit. The selection falls to `Layout` as it does
  today.
- **After any menu move, focus goes to the moved row's name button**
  (`edit-<id>`) through the pane's `pendingFocus`, because the menu closes
  and the row has moved. `TreeHost` gains `focusAfterRedraw(token)`, the
  member `ListContext` already has. `listContext(host)` in `tree.ts` stops
  discarding it.
- **Leave room for copy and paste, build none of it.** The next feature will
  likely add items here. Nothing in this design fixes the menu's length, and a
  third section can go between the moves and Remove.

### §6. Keyboard shortcuts

A `keydown` listener on each component row's name button, and nowhere else:

| Chord | Does | Same as |
| --- | --- | --- |
| Alt+ArrowUp | move up | **Move up** |
| Alt+ArrowDown | move down | **Move down** |
| Alt+ArrowRight | move into the row drawn above | **Move into …** |
| Alt+ArrowLeft | move out to the grandparent | **Move out of …** |

- Matched on `event.altKey` with no Ctrl, Meta or Shift, and `event.key`. A
  handled chord calls `preventDefault()`.
- **One route in** (`PATTERNS.md` §6): the menu item and the chord call the same
  four functions. A function asks `canReparent` or checks the sibling bounds,
  and writes only when allowed.
- **A refused chord writes nothing and says why in place**: `showDropError`'s
  line under the row, with `canReparent`'s own sentence, or **Already first.** /
  **Already last.** / **Placed on the grid. Move it on the canvas, by dragging
  it or with the arrow keys.** / **Already at the top level.** / **No container above to
  move into.** A key press with no visible effect has to produce one (`UI.md`
  §6, "announce what is not visible"). The line is inside the row, so the
  reason is also on screen for a sighted author.
- **Declared twice**: `aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown
  Alt+ArrowRight Alt+ArrowLeft"` on the name button, and its `title`, whose
  text is the name followed by a hint. The hint is `Option+↑ ↓ reorder, Option+→
  ← move in or out` on macOS (`Platform.isMacOS`) and `Alt+↑ ↓ reorder, Alt+→ ←
  move in or out` elsewhere. `title` adds to the visible name and never replaces
  it (`UI.md` §6).
- **Not on the `Layout` row**, which cannot move. Not on the handle, the
  chevron or the menu button, whose arrow keys belong to them or to the menu.
- **This is not arrow-key navigation through the tree**, which
  `layout-editor-pane.md` § Deliberately not doing still declines. Plain arrows
  do nothing new, and Tab order is unchanged apart from the fewer stops.

### §7. Collapse and selection

The settled rules, and where each is enforced. **All of them are corrections
applied at render time**, before the tree draws, like the selection fallback.
So they hold whichever path set the selection: a tree press, a canvas press,
the picker's insert, an undo, or a restored ephemeral state.

1. **The selection's collapsed ancestors are expanded.** At render, walk the
   selected entry's ancestor chain. Remove each ancestor from the collapsed set
   and write the result back through `setCollapsed`. It does not redraw,
   because this *is* the render. This mirrors grid-canvas §2's "selection drives
   tab activation", and it is what keeps the picker's "the new tree row takes
   the pane's flash" true when it inserts into a collapsed container.
2. **Collapsing a container that holds the selection selects the container.**
   Applied in the chevron's handler, before the redraw: the set gains the id
   and the selection becomes the container, in one redraw. Rule 1 would
   otherwise reopen it straight away.
3. **A drop onto a collapsed container moves the row in and leaves it
   collapsed**, and the count in its description changes, which is the drop
   made visible. **Except when the dropped row is the selection**, because
   rule 1 applies. The settled answer did not name this case, and "never hides
   the selection" is the stronger rule.
4. **A menu or chord move into or out of a collapsed container expands the
   container being entered or left.** It happens before the write, so focus can
   follow the moved row by its token. "Out of" names the container left
   because the row lands beside it, and a collapsed parent being left is
   already open (the row was visible), so in practice only "into" expands.
   The rule is written for both so the code has no special case.
5. **No spring-loaded expand while dragging over a collapsed row.**
6. **A collapsed container drags with its children**, which is what `reparent`
   already does, because the children are its `config.children`.

### §8. Empty and error states

- **A layout with no containers** draws no chevrons. The disclosure slot is
  spacers only, so names align as they do now, one slot in.
- **A container with no children** is still collapsible and draws a chevron.
  Its collapsed description reads `Group · empty`. Hiding the chevron would
  make an empty container look like a leaf, which is the one fact the author
  most needs (it accepts drops). It draws no wrapper, since a guide beside
  nothing says nothing, so **open, its chevron carries no `aria-controls`**:
  an expanded control naming an id no element has is an invalid reference.
  Shut, it names the wrapper's id as every shut chevron does.
- **A layout that will not parse, or no layout**: no tree, as today. View
  state is kept untouched, so fixing the file restores the posture.
- **A refused move**: §6's inline line, identical to a refused drop.

### §9. Harness and stub

**Fixture.** The default harness layout already holds everything the shots
need: a long list; `Proficiencies` holding the Group `Weapons` (two
containers deep); the Tab set `Pages` holding the Groups `Combat` and `Rest`;
and `Ability checks` holding six Groups, one per ability. **No
new layout fixture.**

**New `PaneView` options** (`harness/editor-pane.ts`), each pressing the
control a user would press, which is that interface's stated rule:

- `collapse=<id>[,<id>…]` presses each container's chevron in order.
- `menu=<id>` presses a row's menu button and leaves the menu open.
- `treeKey=<id>:<chord>` focuses a row's name button and dispatches the chord.
  It shows a completed keyboard move, and a refused one's line.

The existing `&focus=` photographs the keyboard-focused name button.

**Can the harness express collapse state?** Yes, by pressing, which also
exercises the view-state write. A restore from saved state is not a
press, and it is covered by a test instead (`setState` with `collapsed`, then
render).

**The stub needs `Menu` and `MenuItem`**, which it lacks because nothing in
`src/` imports `Menu` today (`ui/anchored-panel.ts` removed the last one). The
members this feature calls: `new Menu()`, `addItem(cb)`, `addSeparator()`,
`showAtMouseEvent(e)`, `showAtPosition({ x, y })`, `hide()`, `onHide(cb)`; and
`MenuItem.setTitle`, `setIcon`, `setDisabled`, `setWarning`, `onClick`. The
stub **draws Obsidian's own markup**: `div.menu` on `document.body` holding
`div.menu-item` (with `is-disabled` or `is-warning`) >
`.menu-item-icon` + `.menu-item-title`, and `div.menu-separator`, placed at
the given point. That way a harness shot of an open menu is painted by the
real calibrated stylesheet, and a test clicks an item by its title. The
stub's options are driven in `obsidian-stub.test.ts` (`PATTERNS.md` §2's one
permitted test there): a disabled item's `onClick` does not fire, and a
click on an item hides the menu. `harness/calibrate.mjs` gains `/^\.menu/` in
`CHROME`, so `.menu`, `.menu-item` and `.menu-separator` come from the app
rather than from `harness/theme.css`'s fallback. The stub's `Platform` gains
`isMacOS` (false by default), which the shortcut hint reads.

**Vault check**, for what only the app can show. Use the throwaway vault, and
any layout there holding a Group inside a Group and a Tab set with a Group in
it (the harness layout exported via **New layout → Start from → pasted JSON**
is enough). Press, in order:

1. Collapse two containers, quit Obsidian, reopen, and see them still
   collapsed.
2. Rename one collapsed container's label, and see it stay collapsed.
3. Open another layout in the same pane and back, and see both expanded (the
   state is per file).
4. With a name button focused, press each of the four chords on macOS, and on
   Windows if one is to hand.
5. Remove a container with children, and press **Undo** in the notice.

## Config fields

None. This changes the editor's own chrome and adds no component configuration.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |

## Data and file model

Nothing in a layout file or a character note changes. Serialise and parse are
untouched, so Constraint 3 holds by not being reached, and no character
section is touched, so Constraint 4 holds the same way. Remove's behaviour
(children promoted to the top level with their configuration) is unchanged.
Only the question before it moves to a notice after it.

The one new persisted value is `collapsed: string[]` in the layout editor
leaf's view state, inside Obsidian's `workspace.json`. It is written by
`getState` and read by `setState`, with an unknown or malformed value ignored.
A workspace saved before this feature has no key and opens fully expanded. A
workspace saved after it and opened by an older plugin version ignores the
key, because `FileView.setState` reads only `file`.

## Acceptance criteria

**Behaviour** (tests beside the existing tree cases in
`src/editor/layout-editor.test.ts`, per `docs/BACKLOG.md`'s row on the four
extracted modules, which this does not resolve. View-state cases go in
`src/view/layout-editor-view.test.ts`.)

- [x] A component row's controls are exactly the drag handle and the menu
      button. No row carries a `tree-up-`, `tree-down-`, `tree-indent-`,
      `tree-outdent-` or `remove-` token.
- [x] The menu lists **Move up**, **Move down**, a move into, a move out of and
      **Remove**, in that order with two separators. **Remove** is a warning
      item. *Since narrowed: that is the menu on a level whose children are not
      placed, a Tab set's tabs, with copy and paste's third section before
      **Remove**. On a placed grid, since `fix/tree-moves-grid-order`, **Move
      up**, **Move down** and the separator after them are left out, so the
      menu opens on the move into (§5).*
- [x] The move-into item names the row drawn above it (`Move into "Weapons"`)
      and the move-out item names the parent (`Move out of "Proficiencies"`).
      Where no such container exists, the generic item is present and
      disabled.
- [x] Each of the four moves, from the menu and from its chord, is disabled or
      refused exactly where `canReparent` or the sibling bounds refuse. A test
      covers each refusal, asserting the layout's bytes are unchanged, and the
      existing depth-cap cases (`disables indent exactly where it would push a
      subtree past the depth cap`) are ported to the menu items and the chords.
- [x] A reparent driven by a chord, with no pointer event dispatched, lands
      where `reparent` puts it, and undoes and redoes as one step.
- [x] A refused chord shows the refusal line under its row and writes nothing.
- [x] After a menu or chord move, the focused element is the moved row's name
      button.
- [x] The chords fire only on the name button: the same keydown on the drag
      handle, the chevron or the menu button moves nothing.
- [x] The name button carries `aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown
      Alt+ArrowRight Alt+ArrowLeft"`, and a `title` beginning with the row's
      name.
- [x] **Remove** removes with no modal. The removed container's children are
      at the top level exactly as the existing "removing a container" cases
      assert, and those cases pass with `confirmAction()` taken out.
- [x] Removal shows a notice naming the component (and the count moved, where
      it held any). Its **Undo** restores the pre-removal bytes. After an
      intervening edit it refuses with the "has changed since" sentence and
      writes nothing.
- [x] A container row has a disclosure button with `aria-expanded` and
      `aria-controls` naming its children wrapper (an open empty container
      carries none, per §8). A non-container row and the
      `Layout` row have none.
- [x] Collapsing removes the container's descendants' rows from the tree and
      writes nothing to the layout: bytes unchanged, undo stack unchanged.
- [x] A collapsed container's description reads `Group · N inside`, where N
      counts descendants at every depth, and `Group · empty` when there are
      none. Expanded, it reads as today.
- [x] Selecting a component inside a collapsed container, through the canvas
      overlay and through the picker's insert, expands every collapsed
      ancestor.
- [x] Collapsing the container that holds the selection selects the container.
- [x] A drag dropped onto a collapsed container moves the row in and the
      container stays collapsed with its count incremented. The same drop of
      the *selected* row expands it.
- [x] A menu move into a collapsed container expands it.
- [x] Dragging a collapsed container moves its whole subtree.
- [x] The rows read in the same order as before this feature (`labels(harness)`
      over the `furnished()` fixture is unchanged, expanded).
- [x] View state: `getState()` carries `collapsed` sorted, and omits it when
      empty. `setState` with `collapsed` renders those containers collapsed.
      An id the layout does not hold, or one naming a non-container, is dropped
      at render. A `setState` naming a different file clears the set. The
      legacy `{ layout }` state passes `collapsed` through.
- [x] Toggling collapse calls `workspace.requestSaveLayout()`.
- [x] The stub's `Menu` is driven in `obsidian-stub.test.ts`: a disabled
      item's `onClick` does not fire, and a click on an item hides the menu.
- [x] `npm test`, `npm run lint` and `npm run build` pass, lint at
      `--max-warnings 0`.

**Look** (harness PNGs, both themes unless named)

- [x] `editor-tree` (1500 wide, full height, the default layout, everything
      expanded): the tree whole, with `Proficiencies › Weapons › Attack bonus`
      at three visibly different card left edges and two guide lines beside
      the innermost, `Pages` holding `Combat` and `Rest`, and `Ability checks`
      holding its six Groups. A reviewer can say each row's depth without
      counting pixels.
- [x] `editor-tree-collapsed`: `collapse=proficiencies,pages`. Both rows show
      the closed chevron and `· N inside`, nothing of theirs is listed, and
      the gap to the next row matches the gap between two top-level rows.
- [x] `editor-tree-selected`: `open=weapons`, the ring on a depth-1 container
      row, with its guide running down through its children.
- [x] `editor-tree-focus`: `&focus=` on a depth-2 row's name button. One focus
      ring, distinguishable from the selected ring in the same shot.
- [x] `editor-tree-menu`: `menu=weapon_bonus` (the **Attack bonus** card). The open menu, painted by the
      calibrated `.menu` rules, with a disabled item visibly disabled and
      **Remove** in the warning colour. Light only is enough, since the menu is
      the app's own.
- [x] `editor-tree-key-refused`: `treeKey=` a chord a row cannot take. The
      refusal line under the row.
- [x] `editor-forced-colors` still shows the selected row's ring, the chevrons
      and the guide lines.
- [x] `editor-stacked` shows the tree unchanged in structure stacked at 1190,
      and `editor-tree-threshold` shows it at the split's narrowest, 1210 wide
      and grown to the whole tree: a two-deep card there is still wide enough
      for its name and two controls. `editor-threshold` itself is held to the
      window and shows the panel and no tree rows, so it cannot carry this.
- [x] `EDITOR_FRAME` re-measured against the shorter rows (seven controls to two
      does not change row height, but the wrapper margins might), with the
      measurement written in its comment as that constant's history asks.

**Docs**

- [x] The `renderTree` comment's "No disclosure control" sentence, and
      `tree.ts`'s header paragraph on "every row carries … up/down … and
      indent/outdent", describe the menu, the chords and collapse.
- [x] `docs/features/grid-canvas.md` § "What it does"'s "the tree also gains
      up/down and indent/outdent controls" and its acceptance criterion naming
      them carry a line pointing here. They are left standing as history, and
      marked as superseded.
- [x] `docs/features/layout-editor-pane.md`'s "A tree row has no disclosure
      control" and "the remove control stays on the row" sentences, and its §
      Deliberately not doing's "or its indent/outdent controls", point here.
- [x] `SPEC` §7's "every row carries indent and outdent controls reaching the
      same two operations from the keyboard" becomes the menu, the chords and
      collapse.
- [x] `SPEC` §7's "(Mod+Z / Mod+Shift+Z)" for **Undo layout edit** and **Redo
      layout edit** is corrected: both default hotkeys were dropped in 0.1.1
      (`docs/features/editor-undo.md` § "Amended after 0.1.0"), so the commands
      have no default hotkey and are reached through the command palette or a
      hotkey the author binds.
- [x] `docs/features/editor-undo.md` gains an amendment: remove component
      lost its confirm, for the reason and with the notice this spec gives.
- [x] `docs/UI.md` §6 gains the naming rule ("a control names every party its
      context does not already announce"), and `docs/BACKLOG.md`'s list-field
      naming row is updated to cite the rule. Nothing in `list-fields.ts`
      changes here; that row's fix is its own work.
- [x] `docs/UI.md` §9's disclosure row lists the tree as a second consumer of
      the chevron pair, and a row for the tree's nesting wrapper and guide is
      added.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. **`test: Give the Obsidian stub a Menu`.** `Menu`/`MenuItem` in
   `src/test/obsidian-stub.ts` drawing the app's markup, their cases in
   `obsidian-stub.test.ts`, and `/^\.menu/` in `harness/calibrate.mjs`.
2. **`feat: Move a tree row from its menu and the keyboard`.** The menu button
   and its five items, the four chords, the refusal line for a chord, focus
   following the moved row, and the up/down/indent/outdent/trash controls
   removed. Remove still confirms in this commit, so it lands with nothing
   behaving differently except where the controls are.
3. **`feat: Remove a component without asking, and offer undo`.** The modal
   goes; the notice with its guarded Undo arrives, through a new
   `ui/undo-notice.ts` that the sheet's reset undo in `view/sheet-view.ts` is
   rewired onto in the same commit, since the two share its timing and its
   markup. The `editor-undo.md` amendment goes here, since this commit is the
   reversal it records.
4. **`feat: Show nesting in the layout editor's tree`.** The nested render, the
   `role="group"` wrapper, the card indent and the guide lines.
5. **`feat: Collapse a container in the layout editor's tree`.** The chevron,
   the count, the view-state members on `LayoutEditorHost` and
   `LayoutEditorView`, and the selection rules in §7.
6. **`test: Show the tree's nesting, collapse and menu in the harness`.** The
   `collapse=`, `menu=` and `treeKey=` options and the shots named above, with
   `EDITOR_FRAME` re-measured.
7. **`docs: Record that the tree collapses and moves from a menu`.** `SPEC` §7,
   including its undo/redo hotkey sentence corrected to "no default hotkey,
   reached through the command palette or a hotkey the author binds",
   grid-canvas.md, layout-editor-pane.md, `UI.md` §6 and §9, and the BACKLOG
   naming row updated to cite the rule. The `tree.ts` comments travel with
   commits 2 and 5, which make them true.

## Deliberately not doing

- **Copying and pasting a component or its config.** The next feature, built as
  `docs/features/component-copy-paste.md`: a third menu section between the
  moves and **Remove**, and Mod+C and Mod+V on a row's name.
- **The canvas's drag and resize gestures**, and anything about the canvas
  overlay.
- **`reparent.ts`'s rules.** `canReparent` and `reparent` are called, not
  changed. "Into" still means the previous sibling.
- **The pane's narrow regime** (`docs/BACKLOG.md`, "The layout editor pane has
  no narrow regime"). Nothing here is tuned below the widths the pane already
  photographs.
- **The four extracted modules' test cases** (`docs/BACKLOG.md`, "Four
  extracted modules' cases live beside the editor"). New tree cases go where
  the existing ones are.
- **`role="tree"`, a roving tabindex, or plain-arrow navigation between
  rows.** Rejected in the §13 entry.
- **Spring-loaded expand on drag hover.** Rejected in §7.
- **Collapse all / expand all**, and a command for either. Nothing asked for
  them, and they would be the first palette commands about pane posture.
- **Collapse on the sheet.** The tree's posture never reaches the rendered
  sheet (§13's withdrawn Group collapse).
- **Styling disabled menu items**, which Obsidian's `Menu` owns. The BACKLOG
  row "A disabled control looks exactly like an enabled one" is re-read at
  land time. If the reorder controls it counts include the tree's, they are
  gone, and the row is narrowed to say so rather than closed.
