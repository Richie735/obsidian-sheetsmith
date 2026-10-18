# Table scroll across a rebuild

Status: shipped
Board card: the `docs/BACKLOG.md` § UI row "A committed edit's rebuild puts a scrolling table back at its start, so restored focus can sit off screen". The row leaves `docs/BACKLOG.md` in the commit that fixes it.

Standard route (`docs/WORKFLOW.md` § Routes). The mechanism already exists one level up: `b99c000` keeps the sheet's `scrollTop` across the same rebuild, and `view/cell-focus.ts` keeps focus there by structural key. Stops: spec approval, the land stop.

## Model question

None. Scroll offset is reader posture read back off the outgoing DOM at the rebuild, as `scrollTop` and focus already are. Nothing is stored, nothing is published, the §4.1 contract does not grow, and no §13 question touches it.

## What it does

A reader who has scrolled a table or a Roster sideways and commits an edit in it stays where they were. The rebuilt scroller comes back at the offset it had, and the restored focus is on screen beside the sticky name instead of past the far edge of a scroller reset to 0.

## Smallest version

Capture every horizontally scrolled element's `scrollLeft` in each cell before `renderSheet` empties `root`, and reapply it to the rebuilt element **before** `restoreFocus`. That is the whole fix, and it closes the row. What it gives up: a commit that changes a column's width ahead of the focused control (a computed cell, a modifier glyph appearing) moves that control by the change. The pinned-name rule catches it at the start edge, and nothing catches it at the far edge (Design, "Order").

## Design

### Which scrollers

Verified from the code: `.sheetsmith-table-wrapper` is drawn in three places, and each binds `keepFocusClearOfPinned`:

- `components/table.ts` (~1690): every Table, open (`sheetsmith-table-wrapper sheetsmith-table-wrapper-boxed`) and closed (`sheetsmith-table-wrapper`), from one site.
- `components/roster.ts` `renderShared` (~898): a Roster's one shared table.
- `components/roster.ts` (~1581): a Roster in card layout, **one wrapper per card in a single cell** (`sheetsmith-table-wrapper sheetsmith-roster-card-table`). This is why the key needs an ordinal inside the cell, not only the cell.

No other sheet element scrolls sideways.

### Where it lives: `src/view/cell-scroll.ts`

A new pure module beside `cell-focus.ts`, with the same shape: two functions over a root element, `captureScroll(root)` and `restoreScroll(root, saved)`. It does not go in `cell-focus.ts` because that file's one job is focus. It does not go in the view's posture maps either, though the backlog row points there. Those maps hold state a component *reports* through its `RenderContext` (`onActivateTab`, `onToggleRecord`, `onToggleGroup`). A scroll offset is already readable off the outgoing DOM at the moment it matters, so a map would need a new contract member and would buy nothing. On a file change `clear()` empties `contentEl`, so there is no scroller to capture and nothing to drop.

**It names no component class.** A view selecting `.sheetsmith-table-wrapper` would be the view knowing that Table and Roster exist (CLAUDE.md, "nothing outside a component needs to know that component exists"). The key is structural instead, as `cell-focus.ts`'s is:

- **Captured:** every element under a `.sheetsmith-cell` whose `scrollLeft` is not 0. Not 0 rather than greater than 0, so a right-to-left scroller is kept too. One `querySelectorAll` over `root` while layout is still clean.
- **Key:** `{ cell, path }`. `cell` is the **innermost** cell index, using the same reasoning as `innermostCell` in `cell-focus.ts`, which is exported from there and imported, not copied (PATTERNS §1, second consumer). The cell list itself is `sheetCells(root)`, exported from `cell-focus.ts` beside it and used at capture and restore in both modules, since a saved cell index is only right against an identical list. `path` is the element's child-index path from that cell's element down to it: the index of each ancestor among its parent's element children, outermost first. Owner's ruling: a path, not a class string, so a class a component stamps after drawing cannot break the match. A value commit rebuilds the same structure above a wrapper, so the path survives it, and the card-layout Roster's wrappers stay apart because each card sits at a different index.
- **Where the path misses.** If a commit changes the structure *above* a wrapper in its cell (a row of controls inserted ahead of the table, a notice drawn above it), the path points elsewhere or nowhere. If it points nowhere the offset is dropped. If it points elsewhere, an element that does not scroll ignores the offset, because the browser clamps it to 0. The dev reports any such component at the land stop (Acceptance criteria).
- **Restored:** the element at the same cell and path, if one exists, gets `scrollLeft` set. A missing cell or element is skipped silently. The browser clamps an offset past the new `scrollWidth`.

A text input that scrolls its own overflowing value is caught as well. That is harmless: a field the reader is not in keeps its view, and the focused one is re-scrolled by `setSelectionRange` in `restoreFocus`.

### Order, and why the pinned rule runs last

The order lives in one function, `restorePosture` in `src/view/sheet-posture.ts`, beside `capturePosture`, which reads focus, every scroller's offset and the root's `scrollTop` before the sheet is emptied. Both hosts call the pair and nothing else: `renderSheet` (`view/sheet-view.ts`) and the harness's `draw()`. So check 10, which drives the harness, holds the plugin's order rather than a copy of it, and `view/sheet-posture.test.ts` holds it without a browser. `restorePosture` runs:

```ts
restoreScroll(root, saved.scroll);
restoreFocus(root, saved.focus);
root.scrollTop = saved.top;
```

**Scroll goes before focus, so `keepFocusClearOfPinned` runs last.** `restoreFocus` calls `focus({ preventScroll: true })`, which fires `focusin` synchronously on the wrapper. If scroll were restored first, the handler measures the real restored geometry. A control that the rebuild left behind the sticky name is then scrolled clear, which is `docs/UI.md` §4's rule. If focus went first, the handler would measure at `scrollLeft` 0, where no name covers anything, and the restore would move the control afterwards with nothing left to correct it. The §4 rule is an invariant about what the reader can see. The restored offset is a memory of where they were. The invariant wins.

The handler still runs only on `:focus-visible`, which a keyboard commit (Enter, Space) satisfies. A pointer commit leaves focus on the control the pointer is on, which is already on screen.

**The far edge gets no new rule, and the widening drift is accepted residue (owner's ruling).** If the offset is restored exactly, a control that was visible before the commit is visible after it. Inputs are fixed width, so a committed value does not resize its own column. The one way a control can move is a column *ahead of it* changing width in the same commit. Correcting that would mean a far-edge branch in `keepFocusClearOfPinned`, which every forward Tab also passes through, ahead of the browser's own scroll-into-view. Or it would mean `scrollIntoView`, which also scrolls `overflow: hidden` ancestors outside `root`. Both cost more than a few pixels of drift is worth. Check 10 prints the drift and does not fail on it.

### Comments and docs that go stale

- `ui/pinned-column-focus.ts`: the paragraph "a focus that asked not to scroll is not scrolled, by construction … a new scroller at `scrollLeft` 0" becomes false. Rewrite it to say that a restored focus now reaches this rule against the restored offset, and that this is deliberate (the order above).
- `docs/UI.md` §4, the sticky-name bullet: "a focus restored after a rebuild asks not to scroll and needs nothing, since its new scroller is at the start" becomes "a rebuild restores each scroller's offset before it restores focus, so a restored focus is held to this rule against the offset the reader left", with `[held by harness/measure-groups.mjs check 10]`.
- `view/sheet-view.ts`: the `scrollTop` comment gains one line for its horizontal sibling.

### The harness has to rebuild the way the view does

`harness/harness.ts` `draw()` does not call `captureFocus` or `restoreFocus` today. The focused element is gone after `stage.replaceChildren()`, so a commit in the harness drops focus to the body, which the app does not do. Without fixing that, a harness check measures the harness and not the view. `draw()` therefore calls `capturePosture` before the sheet rebuild and `restorePosture` after it, the view's own function in `src/view/sheet-posture.ts`, so the harness cannot restore in an order the view does not. Its existing re-focus of the still-connected editor pane stays. This is an instrument fix with no pixels, since every shot renders a fresh state.

### The check: `harness/measure-groups.mjs` check 10

Same family and same staging as check 9, reusing its `loadFocus` and `SCROLLERS`. It runs at a 520 container and at a true 380 under phone staging, each at the default type size and at `text=24`. For every table and Roster that scrolls:

1. Scroll the wrapper fully right. Take its rightmost control that commits by key and focus it.
2. Commit with real key events over CDP. For an input: select its value, use `Input.insertText` to type a value that differs, then press Enter. For a button: press Space.
3. After the rebuild, find the wrapper holding `document.activeElement` and assert three things. (a) The focused control is the same control: same `aria-label`, compared up to its state, since a named level carries its state in its name (`docs/UI.md` §6), and same index among its cell's controls. (b) The wrapper's `scrollLeft` is within 1px of the value before the commit. (c) The control's start is inside the scrollport and `__behind` is 0, and its far edge is inside it too, with two excuses, each printed and neither failed. **Wider than its room:** a field wider than the room beside the name has its cell's start put against the name and runs past the far edge at any scroll (`docs/UI.md` §4), so it is excused where it is no further past than it was before the commit, within 1px. Measured: 520 Attacks' Damage field, 104px in a 68px room, is 43.7px past before and after. A reset scroller carried it to 111.7px, which fails. **Widening drift:** where the commit widened a column ahead of the control (the control's offset from its row's start changed across the commit), any overshoot past the far edge is printed as `drift <n>px` and does not fail. Clear of the name is held in both.

It also checks that it is not vacuous: at 520, at least one scroller is measured with a before offset over 0. **It must be red on current code.** The dev runs it with the `draw()` change in place and `restoreScroll` not yet wired, and records the failure in the land stop. That red comes from (b) and (c), not from focus being lost. It prints the scroller count, each offset before and after, and every drift it excused, so the land stop shows the residue as numbers.

### Unit tests: `src/view/cell-scroll.test.ts`

happy-dom stores `scrollLeft` (verified), so the pure functions can be driven directly:

- A scroller scrolled in one cell is restored onto the rebuilt cell's element at the same path.
- Two wrappers with the same class in one cell, the card-layout Roster's shape, each get back their own offset, told apart by path.
- A class added to the rebuilt wrapper that the outgoing one lacked does not stop the match.
- A scroller inside a group's child cell keys to the child cell, not to the group.
- A cell or path missing after the rebuild is skipped without throwing, and an offset of 0 is not captured.

### Interactions, empty and error states

Nothing new to press, and nothing new is announced, since nothing on screen changes that the reader did not do. A table with no rows, or one that does not overflow, has `scrollLeft` 0 and is not captured. A component drawing its error state has no wrapper and is skipped.

## Config fields

None.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |

## Data and file model

None. No note, layout, parser or serialiser changes. Constraints 3 and 4 are untouched.

## Acceptance criteria

- [x] `src/view/cell-scroll.ts` exports `captureScroll` and `restoreScroll`, imports `innermostCell` from `cell-focus.ts` (no copy), and names no component class [judgement: read it; `grep -n "sheetsmith-table" src/view/` returns nothing new].
- [x] `src/view/sheet-posture.ts` `restorePosture` calls `restoreScroll`, then `restoreFocus`, then sets `root.scrollTop`, in that order, with the order's reason in its header, and `renderSheet` calls it rather than the three [checked: `view/sheet-posture.test.ts`, a `focusin` listener sees the restored offset]. One function rather than the order written in both hosts, so check 10, which drives the harness, holds the plugin's order (structural review, P1).
- [x] `src/view/cell-scroll.ts` keys a scroller by innermost cell index and child-index path from that cell's element, with no class string in the key [judgement: read it].
- [x] `src/view/cell-scroll.test.ts` holds the five cases under Unit tests, the two-wrappers case told apart by path.
- [x] At the land stop the dev reports every component whose commit changes the DOM structure above its wrapper in its cell, where the path would miss, or states that none was found and how that was checked.
- [x] `harness/harness.ts` `draw()` restores the sheet's focus and scroll through `capturePosture` and `restorePosture`, the view's own function.
- [x] `node harness/measure-groups.mjs` passes check 10 at 520 and at a true 380 under phone staging, each at the default type size and `text=24`, for every scrolling Table, open and closed, and Roster, card layout included. Check 10 was recorded red on the tree without `restoreScroll`. Widening drift, and a field wider than its room that is no further past the far edge than before the commit, are printed and excused, never failed. Checks 1–9 still pass, as do `node harness/measure-groups.mjs text-groups` and `node harness/measure-groups.mjs pinned-add`.
- [x] `ui/pinned-column-focus.ts`'s "by construction" paragraph and `docs/UI.md` §4's "needs nothing" clause are rewritten as in Design.
- [x] The `docs/BACKLOG.md` § UI row is gone, and the new row below is in its place in § UI's table. `src/backlog.test.ts` is green.
- [x] The new § UI row reads, four non-empty cells, 454 characters (written to 575, under the 600 ceiling):

  `| A component's own vertical scroller resets to its top on a committed edit's rebuild | \`view/cell-scroll.ts\`, \`.sheetsmith-record-set-list\`, \`.sheetsmith-rich-text-box\` | Capture \`scrollTop\` beside \`scrollLeft\` on the same cell-and-path key. A Record set list or Rich text box scrolled down comes back at its top, so a reader editing its lower entries loses their place on every commit. | a pass on a component's own vertical scroller across a rebuild |`
- [x] `npm run lint`, `npm test` and `npm run build` pass.
- [x] The land stop carries `npm run harness` and then `npm run harness:shot`, with a statement that no shot changed. No still captures a scroll across a commit, so the evidence is check 10's printed numbers, red and then green, not PNGs.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted until the owner says the work is done.

1. `fix: Keep a scrolled table in place across a committed edit`. Contains `src/view/cell-scroll.ts` and its test, `src/view/sheet-posture.ts` and its test, the `innermostCell` and `sheetCells` exports, the `sheet-view.ts` wiring, the rewritten `pinned-column-focus.ts` comment, the `docs/UI.md` §4 amendment, the removed `docs/BACKLOG.md` row, the new vertical-scroller § UI row, the Roster card-layout § UI row beside it, and this spec.
2. `test: Hold a table's scroll across a commit in the harness`. Contains the `draw()` change in `harness/harness.ts` and check 10 in `harness/measure-groups.mjs`, with its header entry.
3. `docs: Name the view's pure helpers in the structure tree`. Contains the `docs/PATTERNS.md` §2 clause naming `cell-focus`, `cell-scroll` and `sheet-posture` as DOM-over-a-root helpers that know no view and that the harness imports.

## Deliberately not doing

- **"Focus cannot return to content the app has not finished rendering"** (`docs/UI.md` §12). Not touched. `restoreFocus`'s near-miss fallback stands.
- **"Entering edit mode on a Rich text block loses the reader's place"**. A separate backlog row.
- **Layout editor rows**, including Shift-Tab behind a Rows or Columns list's sticky header in the editor pane. This covers the sheet only.
- **A component's own vertical scroller** (a Record set list, a Rich text box) across a rebuild. The module captures `scrollLeft` only. The gap is the new `docs/BACKLOG.md` § UI row "A component's own vertical scroller resets to its top on a committed edit's rebuild", waiting on "a pass on a component's own vertical scroller across a rebuild".
- **A far-edge correction for widening drift.** A control that a column-width change ahead of it carries past the far edge stays there. This is accepted residue by owner's ruling: check 10 prints it as `drift <n>px` and does not fail on it (Design, "Order").
