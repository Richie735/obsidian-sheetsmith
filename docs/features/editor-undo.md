# Editor undo

Status: shipped
Board card: Add undo to the layout editor pane

## Model question

None. This is the standard route: the mechanism already exists as precedent —
`SheetView.applyTrigger` / `offerUndo` / `restoreDocument` (`src/view/sheet-view.ts`)
— and this feature extends its shape rather than inventing one. A reset trigger
is already "a batched write is one write and one undo rather than one per
component" (`SPEC` §7's build-order note); this generalises the same rule from
one trigger action to every mutation the pane makes.

It touches no `ComponentDefinition` member and no `ConfigFieldSpec` kind — the
contract does not grow. It publishes nothing to formulas: this is an editing
surface, same as the pane itself (`docs/features/layout-editor-pane.md`). It
stores nothing new in either file: the undo stack holds snapshots of the
layout file's own serialised text, exactly as `SheetView`'s `before`/`after`
strings do, and an undo or a redo only ever writes bytes the file has already
legitimately held. The stack lives in memory, in the same category as
`activeTab`, the pane's selection, and `fieldErrors` — the author's posture,
gone when the pane closes or a different layout opens — so Constraint 3 is
inherited from `persist()`'s existing round-trip guarantee rather than a new
claim. No character note is read or written by this feature; Constraint 4
does not apply.

## What it does

Every mutation in the layout editor pane — a field commit, a drag or resize,
an arrow-key nudge, an add or remove, a rename, a reset binding — becomes one
step on an undo stack the pane keeps for as long as it is open. Two commands,
**Undo layout edit** and **Redo layout edit** (default hotkeys Mod+Z /
Mod+Shift+Z), step through it. Nothing about the pane's existing confirmation
dialogs changes; undo is the safety net for the mutations that have never had
one, matching the bar `SPEC` §13's prior art sets (CSB #425: a nested-panel
move that froze the editor and then the browser, made the template
unrecoverable, and cost its reporter close to two hours with no way back but a
manually kept duplicate).

## Design

### The mechanism: one snapshot per write, not per operation

The stack holds whole-file serialised-text snapshots, not per-operation
inverses — the same choice `SheetView.offerUndo` already made, and for the
same reason: a component removal that moves its children out to the sheet's
bottom (`removalMessage`, `layout-editor.ts`) changes several things in one
write, and an inverse would have to undo all of them correctly and in order.
A whole-file snapshot restores the lot by construction and cannot be wrong
about it, which is what let `SheetView` skip computing inverse edits at all.

A small module owns the stack — `editor/undo-stack.ts`, named for the
behaviour rather than for the pane (`docs/PATTERNS.md` §2): push a string,
pop it, cap the depth, nothing about a `Layout` or a DOM in it. `persist()` in
`LayoutEditorSection` is the one place every mutation already funnels through
(fifteen-odd call sites across `layout-editor.ts` and `config-panel.ts`, all
already calling `this.host.persist()` or `this.persist()`), so it is the one
place a push needs to happen — no call site changes. `persist()` gains a
`record` flag, defaulting to `true`; the undo and redo commands are the only
two callers that pass `false`, and each pushes the state it is leaving onto
the *other* stack (undo pushes onto redo, redo pushes onto undo) before
writing the snapshot it popped, which is the ordinary two-stack shape. Any
author-triggered mutation — everything that calls `persist()` at its default —
clears the redo stack, matching every editor's standard undo/redo semantics.

Depth is capped at 100 snapshots, oldest dropped first. A layout file is
small text, so the cost is not memory; the cap exists so a very long editing
session does not grow the array without bound for no benefit anyone would
notice past the first few dozen steps.

Scoped per open layout: switching the picker to a different layout file
clears both stacks, for the same reason `SheetView.clear()` drops `activeTab`
on a file change — an author's undo history is posture about the file they
were editing, and Mod+Z reaching across a switch to silently rewrite a
*different* layout than the one on screen would be a worse surprise than an
empty stack.

### What counts as one step

**One call to `persist()` that actually changes the file's bytes.** Not a new
granularity — the one `persist()` already has:

- A field commit (blur, Enter, a select's change, a toggle) is one step,
  because each already calls `persist()` exactly once.
- A drag or a resize is one step, because `beginDrag`'s `finish()`
  (`schematic-gestures.ts`) calls `host.persist()` once, at release — no
  mid-drag frame writes anything, so nothing mid-drag is a step either.
- An arrow-key nudge is one step per flush of `persistSoon`'s 500ms debounce,
  not per keypress: a fast run of presses inside that window already
  collapses into the one write it produces today, so it comes out as one
  step for free. A hold that spans two debounce windows becomes two steps,
  each independently undoable — a defensible reading of "which press did I
  mean to take back," not a defect.
- Adding or removing a component, renaming a label, reordering a list,
  adding or removing a reset binding — each is already exactly one
  `persist()` call in the current code, so each is already exactly one step.

### The arrow-key nudge's missing Escape

`docs/features/layout-editor-pane.md` named this as a gap: the drag gesture
restores on Escape mid-gesture, and the nudge has nothing equivalent.
**Undo subsumes it; it does not need its own Escape handling.** Escape's job
during a drag is to abandon *before* anything is written — nothing has been
persisted yet, so there is nothing for undo to act on. A nudge has no
comparable mid-gesture state to abandon: it is a sequence of independent key
presses, each already committed by the time the next one lands, with no
captured origin the way a drag's `start` is. Building an Escape for it would
mean re-deriving that origin for a gesture that structurally has none. Mod+Z
after a nudge (or a run of them) reverses exactly the write or writes that
landed, at the same one-write-one-step granularity as everything else in the
pane — which is the more general fix, not a narrower one.

### Feedback

A one-line `Notice` on both undo and redo — "Undone." / "Redone." — matching
the plugin's existing habit of a `Notice` for something that happens in the
background (`warn()` in `sheet-view.ts`). It earns its place here for a
reason specific to this surface: a pane rebuild after an undo can change the
tree, a schematic, and the panel all at once, which is a lot of surface for
an author to scan to confirm the key combination did what they expected.

Selection after an undo or a redo reuses the existing fallback rather than a
new one: if the restored layout no longer has the component the pane had
selected, the selection falls back to the `Layout` row, exactly as
`selectedEntry` already does for a selection naming a component the file no
longer holds.

### Discoverability

Two Obsidian commands, `sheetsmith-layout-editor-undo` and
`sheetsmith-layout-editor-redo`, both ids stable from the moment they ship
(`AGENTS.md`), scoped active only while a Sheetsmith layout editor pane is the
open view — `checkCallback`, not a raw `keydown` listener, so the command
palette lists them and a user can rebind the hotkey the way they would any
other command. No new chrome in the pane itself: no undo button, no toolbar.
The pane has no toolbar convention today and inventing one for two commands
that already have a discoverable, rebindable, standard entry point would be
new vocabulary for a problem commands already solve.

## Confirm-vs-undo: the decision

**Every confirmation dialog already in the pane stays exactly as it is.**
Delete layout, remove a component from the tree, remove a column carrying a
formula or level names, remove a row carrying expressions, remove a named row
value, remove a modifier definition — none of these loses its `ConfirmModal`.

The reasoning is the precedent itself: `SheetView.applyTrigger` already
confirms *and* offers undo for the same action, not one instead of the other
(`ConfirmModal` before applying a reset, `offerUndo`'s Notice after). A
confirm dialog answers a question undo cannot answer pre-emptively — *what
specifically am I about to lose* — by naming it before the press; undo
answers a different question, *can I get it back*, after the press. The two
are not substitutes and the codebase has never treated them as one. Removing
a confirm the codebase already decided was worth showing, on the strength of
a feature that answers a different question, would trade away information
for nothing undo buys back — and CSB #425's own lesson was about an
application becoming *unrecoverable*, not about friction being too high, so
there is no pressure from that precedent to remove anything either.

**The destructive paths that confirm nothing today gain no new confirm
dialog.** An audit against the current code (not the count in
`docs/features/layout-editor-pane.md`, which predates the modifier-definitions
work that has since confirmed two of what it counted) found three surviving:

- Removing an entry in the entries editor (`renderEntriesEditor`,
  `list-fields.ts`) — unlike `addControls`'s remove, used by the rows and
  columns tables, it never checks what it is about to discard.
- Removing a reset binding (`reset-field.ts`) — an authored `formula`
  expression on a binding is dropped with no warning.
- Changing a column's `type` away from `computed` or `level` (`list-fields.ts`)
  — not a remove button at all, but the same hazard: the formula or the level
  names underneath are silently discarded on the next persist.

Each of these already writes through `persist()`, so each becomes one-step
recoverable the moment the stack exists — which is precisely the property a
confirm dialog exists to buy where there is no way back. Adding a modal to
these three now would be two safety nets stacked on one hazard, a decision
the paths that already confirm were never asked to make either. This closes
`docs/features/layout-editor-pane.md`'s "does not confirm at all" gap by
making the operation recoverable, not by adding a dialog — which was the
actual property the existing dialogs exist to provide, and undo provides it
more generally.

## Config fields

None. No `configFields`, no `ComponentDefinition` change — this is a pane
mechanism, not a component.

## Data and file model

**Nothing new is stored in either file.** The undo stack is in-memory pane
state, gone when the pane closes or the open layout changes, in the same
category as `activeTab`, `pendingFocus` and `fieldErrors`. An undo or redo
writes the layout file to bytes it has already held at some earlier point in
the session — never a new shape, never a new key — so it inherits `persist()`'s
existing round-trip guarantee (Constraint 3) rather than adding a new claim to
check. No character note is touched by any part of this feature (Constraint 4
does not apply).

## Acceptance criteria

- [x] Every kind of `persist()`-driven mutation in the pane — a field commit,
      a drag-to-release, a resize-to-release, an arrow-key nudge's debounced
      flush, adding a component, removing a component (including one whose
      children move to the sheet), a rename, a list add/remove/reorder, a
      reset-binding add/remove, and a column-type change — is undoable: the
      undo command after each restores the layout file's prior bytes exactly.
- [x] Redo restores the state undone, and is available only until the next
      author-triggered mutation, which clears it.
- [x] `sheetsmith-layout-editor-undo` and `sheetsmith-layout-editor-redo` are
      registered commands with default hotkeys Mod+Z and Mod+Shift+Z, active
      only while a Sheetsmith layout editor pane is the open view, and appear
      in the command palette.
- [x] The stack is cleared when the pane's open layout changes, and two panes
      open on two different layouts do not share one.
- [x] The stack is capped at 100 entries; a test drives the bound by pushing
      past it and asserting the oldest snapshot is gone.
- [x] Escape during a drag or resize keeps restoring the pick-up position
      exactly as it does today; no Escape handling is added to the nudge.
- [x] An undo or redo whose prior selection no longer exists in the restored
      layout falls back to the `Layout` row, reusing `selectedEntry`'s
      existing rule.
- [x] None of the pane's existing confirm dialogs (delete layout, remove
      component, remove column with a formula or level names, remove row
      with expressions, remove row value, remove modifier definition) is
      removed, reworded, or gains new conditions as part of this feature.
- [x] The three destructive paths named above that confirm nothing today
      (entry removal, reset-binding removal, a column-type change discarding
      a formula or level names) still confirm nothing; each is covered
      instead by an undo test proving it is one recoverable step.
- [x] A `Notice` reading "Undone." or "Redone." appears after each command
      fires.
- [x] `npm test`, `npm run lint` and `npm run build` pass, lint at
      `--max-warnings 0`.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. **`feat: Keep an undo stack of the layout's own text`.** `editor/undo-stack.ts`
   — push, pop, the depth cap — and the `record` flag on
   `LayoutEditorSection.persist()`, wired so every existing call site keeps its
   default behaviour unchanged.
2. **`feat: Undo and redo the layout editor pane`.** The two commands, scoped
   to the view, restoring a snapshot by re-parsing it and redrawing, falling
   back the selection through the existing rule, and the stack reset on a
   layout switch.
3. **`feat: Notice on undo and redo`.** The one-line feedback.
4. **`test: Undo every kind of mutation the pane makes`.** One case per
   mutation kind named in the acceptance criteria, each asserting the file's
   bytes return to the prior state; the depth-cap case; the cross-layout
   isolation case; the stale-selection fallback case.
5. **`docs: Record that the layout editor pane has undo`.** `SPEC` §7's "Two of
   those three arrived with the pane and undo did not" sentence is rewritten
   to say undo has arrived, since it was the standing statement of this gap.

## Deliberately not doing

**No grid canvas.** `SPEC` §7 gates the canvas on undo landing first; this
slice is what unblocks it, and building the canvas is a separate spec's job.

**No preview panel.** Unrelated slice, blocked on its own sample-values
decision (`SPEC` §7 item 7).

**No change to `SheetView`'s own reset-trigger undo.** `applyTrigger` /
`offerUndo` / `restoreDocument` are precedent to match, not code this feature
touches. They keep their own shape: a single time-limited `Notice` offer
rather than a stack, which is the right shape for a rare, single action and
not for an editing pane making dozens of edits a session.

**No visible undo/redo buttons or a toolbar.** Commands with rebindable
hotkeys, discoverable in the palette, are the existing entry point Obsidian
gives every plugin; the pane has no toolbar convention to extend.

**No persistence of undo history across closing the pane.** In-memory only,
gone with the pane, on the same posture rule as `activeTab`, `pendingFocus`
and the pane's own selection.

**No new confirmation dialogs**, per the confirm-vs-undo decision above — not
on the three paths that lack one today, and not a fourth kind invented for
this feature.

**No fix to `docs/PATTERNS.md` §11's row on the entries editor's remove
control differing from `addControls`'s** (naming a shared accessible name for
list-remove controls). That decision is still open and this feature does not
answer it — it only makes the data-safety half of the gap moot, since both
controls are undoable either way once this ships.
