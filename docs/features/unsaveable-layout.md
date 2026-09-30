# Unsaveable layout

Status: shipped
Board card: the `docs/BACKLOG.md` § UI row "The pane can hold a layout it cannot save, with only a transient notice to say so" (`editor/layout-editor.ts` `persist`), and the `docs/SPEC.md` §13 entry "What the layout editor pane owes the author while it holds a layout it cannot save". The row leaves `docs/BACKLOG.md` in the commit that closes it.

## Model question

The §13 entry above, written this cycle, and **settled with the owner before this spec**. The argument is recorded here because `/land-it` writes the `Resolved:` line from it.

**Answer: (c), both, and leaving keeps the layout.** The contract (`SPEC` §4.1) does not grow, nothing is published to formulas, and neither file gains a key.

- **Both field refusals are fixed, and the pane also carries a standing state.** A field refusal alone is (b), and it is the better half wherever a field can know the rule: nothing is held, so nothing can be lost. It is not enough on its own, because a field's check is a second copy of the parser's rule, and one has already drifted: **Label** checks the top-level components only, while the parser checks the flattened walk, so a label a container's child holds passes the field and fails the parse. So the label check uses **the parser's own rule, exported from `parse/layout.ts`**, and the two cannot drift again. The standing state is (a), and it covers what no field can know: a vault that refuses the write, and any refusal a later field forgets to guard.
- **Leaving keeps the unsaved layout in memory, by path, until Obsidian closes.** Asking first ("Leave without saving?") is refused: a pane in this plugin never blocks leaving, and the question has no good answer for an author whose file is read-only. Saying what was dropped is refused as the *default*, because it turns a recoverable state into a loss the author then has to rebuild from a notice. Keeping it is safe only under four conditions, and each is part of the answer:
  - **Byte-based.** The kept layout records the bytes the file held when it was kept. On reopening, a file holding other bytes was written by something else in the meantime. The kept layout is then dropped, not applied, and a notice says so. This is the rule an outside write already follows while the pane is open: the disk wins.
  - **It follows a rename and goes with a delete.** A rename moves it to the new path. A delete discards it, because writing it back would recreate the file, which is `release(write = false)`'s own reasoning.
  - **A way out where it cannot survive.** Closing the pane and the plugin stopping are where memory stops being enough, so the notice there carries **Copy layout**, which puts the pane's version on the clipboard through the clipboard write the **Layout file** row's copy button already uses (`ui/clipboard.ts` `writeClipboard`).
  - **A write failure can be retried** from the standing state, with **Try again**.
- **`docs/UI.md` §10 is amended, not broken.** "There is no global error state" stays: the standing state is not global, since it sits in the pane's own outline, under the **Layout file** row, where the pane already reports a file that cannot be read or edited. §10 gains the sentence that says so.

**What the `Resolved:` line will say**, for `/land-it` to write once this is built:

> Resolved: **(c), both** (`docs/features/unsaveable-layout.md`). The two field commits that could reach the state refuse at the field: **Set to a formula** asks for its expression before it writes, and **Label** checks a label with the parser's own rule, exported so that the two cannot drift. What a field cannot know, such as a vault that refuses the write, appears as a standing state in the pane's outline, under the **Layout file** row, with **Try again** for a failed write. `docs/UI.md` §10 now says that a pane's failure appears in its outline, and "no global error state" stays. **Leaving keeps the unsaved layout in memory, by path, until Obsidian closes**: it follows a rename, goes with a delete, and is put back on reopening only where the file still holds the bytes it was kept against. Otherwise it is dropped with a notice that offers **Copy layout**, and so is every other path that cannot keep it. Nothing asks before leaving. Undo from the state steps back to the file's last saved bytes, and redo brings the unsaved edits back.

## What it does

The layout editor stops losing edits it could not write. A field that would make the layout unsaveable refuses at the field. When the pane still ends up holding a layout it cannot write, it says so in the outline for as long as that lasts, not only in a one-off notice. Leaving the file keeps those edits for when the author comes back. Every path that cannot keep them says what went and offers a copy.

## Smallest version

Fix the two field refusals, and give `reload` and `release` the "an edit not yet saved here was dropped" notice with **Copy layout** whenever the pane holds an unsaved layout. No standing state, no stash, no **Try again**, no undo change. That closes both reachable routes into the invalid state and makes every loss audible and recoverable by hand. What it gives up: a vault refusing writes still loses the work on leaving (the author is told and handed a copy, but has to paste it somewhere), the repeated notice stays, and undo still skips the unsaved edits.

## Design

### 1. The two field refusals

**Set to a formula, with no expression yet.** Today the dropdown writes `action: "formula"` straight into the binding, and the re-parse refuses it (`parse/layout.ts` `parseReset`: `action "formula" needs a "to" expression`). From now on:

- Where the binding already holds a `to` (kept from an earlier switch away from **Set to a formula**, which `parseReset` preserves), the choice commits as today. It is valid.
- Where it holds none, **the choice is a draft, not a commit.** The binding is left untouched, and the dropdown shows **Set to a formula**. The **Resets to** row is drawn under it, empty, carrying the field's existing inline error `A formula reset needs an expression.`, and focus goes to that field. Committing a non-blank expression sets `action` and `to` together, in **one** `persist`, so they are one undo step. Choosing any other action discards the draft and commits that action as today.
- The draft is panel posture, like `fieldErrors`. It is keyed by the binding's focus token (`reset-action-<id>-<index>`) so that it survives the pane's rebuilds, and it is cleared wherever `fieldErrors` is. **Leaving the file drops it without a word, and that is deliberate.** Nothing was committed: it is the field asking for its second half, and §10's new rule is about committed edits. That is the same standing as a half-typed text field the author tabs away from under Escape. An uncommitted draft is panel posture, like `fieldErrors`, not an edit.

**Label, against every component.** `config-panel.ts`'s **Label** commit checks `layout.components`, the top level only. The parser's duplicate check (`parse/layout.ts`, the loop over `flattened`) walks every level. The fix is not a second walk in the editor. `parse/layout.ts` exports the rule itself: one predicate over the same `walkComponents(…, everyLevelPlaced)` walk the parser uses, answering whether a label is held by a component other than a given one. The parser's own duplicate check calls it (or the shared primitive under it), so there is one rule with two callers. The dev picks the signature. The requirement is that no second list of "every component" exists for labels. The field's sentence stays `Another component already uses this label.`

`unique-names.ts` `uniqueLabel` already works over the flattened list (`allComponents`), so insert and paste need no change.

### 2. The standing state

**What it is.** While the pane holds a layout it could not write, `LayoutEditorSection` records why: `{ reason: 'invalid', message }` when serialise-then-parse throws, `{ reason: 'write', message }` when `vault.modify` rejects. A successful write clears it. The render draws it as a `.sheetsmith-error` block in the outline, **directly under the Layout file row and above the Sample values row**, the same spot as the existing "cannot be read" and "cannot be edited until its file is fixed" messages, and for the same reason: the row is how an author leaves, so nothing may displace it. The rest of the pane stays live and editable, which is the difference from those two states. Class: `sheetsmith-editor-unsaved`, specialising `.sheetsmith-error` (`docs/UI.md` §9's inline error, reused, not a new kind).

**The invalid variant.** Text only:

> Changes to "Test sheet" are not saved, because this layout does not save as it stands. Fix this and the next edit saves them: Component 2 ("Hit points") "reset" action "formula" needs a "to" expression.

The pattern is `Changes to "<basename>" are not saved, because this layout does not save as it stands. Fix this and the next edit saves them: <parser message>`, written in the voice of `paste.ts`'s `Nothing was pasted, because this layout does not save as it stands. Fix this first: …`.

**The write variant.** Text, then a button:

> Changes to "Test sheet" are not saved, because the file could not be written: disk full. They are kept here, and every edit tries again.
>
> [Try again]

The pattern is `Changes to "<basename>" are not saved, because the file could not be written: <vault's message>. They are kept here, and every edit tries again.` **Try again** is an ordinary Obsidian `<button>`, not `mod-cta`: it is a recovery, not the pane's primary action. It carries the focus token `unsaved-retry`. Pressing it runs `persist()` (recorded, so the held edits land as **one** undo step, the one-persist-one-step rule unchanged). If that write succeeds, the block goes, and focus goes to the layout picker (`layout-picker`), since the button it was on no longer exists. If it fails again, the block is redrawn with the new message and focus goes back to **Try again**.

**The notice, once.** `persist` raises its existing `Notice` only when the state *begins* or its message *changes*. Those are the two current sentences, unchanged: the parser's own message for the invalid case, and `Sheetsmith could not save this layout: <message>` for a write. An edit refused for the same reason again says nothing new, because the standing block is saying it. When the state *ends* through a write, one `Notice`:

> "Test sheet" is saved.

That closes a transition the author was told about and is the only feedback for **Try again** besides the block vanishing.

**`onDisk` stays true.** On a rejected `vault.modify`, `onDisk` goes back to the bytes it held before the attempt, and the undo push made for that attempt is taken back. `onDisk` then always means *what the file was last known to hold*, which the byte check in §4, the undo in §3 and `holds()` all depend on. It is set before the `await` as today, so the pane's own write coming back is still recognised.

**A rename while the file is behind is refused at the field.** This is a finding of this spec, not a clause of the ruling. A label or declared-key commit carries a rename intent, and `persist` drops it when the write fails, since the migration must not run against a layout that is not on disk (`component-rename-migration.md` criterion 9). The intent is then gone, so a later successful save (**Try again**, or the next edit) writes the new label and migrates no notes. Every character's section then sits under a heading the layout no longer names. It is retained (Constraint 4 holds), but it stops rendering with nothing said. While the standing state is up, every commit that carries a rename intent refuses at its field instead, with the inline error:

> Not renamed, because this layout is not saved yet and its character notes cannot be migrated until this layout saves.

**The refusal lifts on the save that ends the standing state**, with no pane rebuild in between: the field reads the section's live unsaved state at commit, not a copy taken at render. Queuing intents to run once the write lands is not built (see "Deliberately not doing").

### 3. Undo from the standing state

Today `undo` pushes `onDisk` onto redo and pops the undo stack. From the unsaved state, that skips every edit since the first refusal, and none of them reach redo.

**From the unsaved state, one undo goes back to `onDisk`**, the file's last saved bytes, without popping the undo stack. It pushes **the pane's own serialisation of the held layout** onto redo, and it writes nothing, because the file already holds `onDisk`. The standing state clears. A second undo pops the stack as normal. **Redo from there** puts the held layout back and writes it as a recorded step that leaves the redo stack alone: where it lands, the bytes it replaced go onto the undo stack, so one undo still takes it back, and nothing clears the redo entries behind it. A plain `persist(false)`, which records nothing, would save the held edits and leave no step to undo them with. The write either saves (a vault that has recovered) or re-enters the standing state, which raises its notice again, since the state is beginning.

**An undo or a redo pressed while a write is in flight waits for it**, since a step is pushed when its write lands, and is skipped with nothing said where a commit was made or a leave began in between: the press was about what was on screen, and the command says "Undone." or "Redone." only for an action that happened.

So everything since the last save is **one** step. The intermediate held states are not individually reachable, which is honest: none of them was ever a file. A fresh author edit clears redo as always, including one that is itself refused.

**The held entry may not parse**, so restoring it cannot go through `parseLayout`. The redo entry is marked as the unsaved step, and restoring it takes a structural copy (`JSON.parse` of `serialiseLayout`'s own output, a copy of the pane's in-memory object, not a validation). The next `persist` validates as always. Snapshots of real file bytes keep going through `parseLayout`. A fallback that tried the parse and quietly took the copy would hide exactly the defect a snapshot of real bytes failing to parse would be.

**This amends `docs/features/editor-undo.md`**, whose model says a snapshot is only ever bytes the file held ("an undo or a redo only ever writes bytes the file has already legitimately held"; "never a new shape"). It is no longer quite true. One redo entry can be the pane's own serialisation of a layout it could not write, and a redo of it *tries* to write those bytes, exactly as the edits that produced it tried. The plan updates that doc's **Model question** and **Data and file model** paragraphs to say so, with a pointer here. Every other snapshot is still file bytes.

### 4. Keeping it across leaving

**Where it lives.** A plugin-level, in-memory store keyed by vault path: `src/editor/unsaved-layouts.ts`, a class holding `Map<path, { base, text, reason, message }>`. `base` is the `onDisk` bytes at the moment it was kept. `text` is `serialiseLayout(held)`. `reason` and `message` are the standing state's. It holds no DOM and nothing from `obsidian`. The plugin owns one instance, as a field on `SheetsmithPlugin` beside `markdownOverrides`. It is never written to `data.json`.

**The store stays inside the owner's bound:** one module holding a `Map` keyed by path, plus the reopen, rename and delete hooks and the unload notice. Nothing else is added for it.

**Kept.** `release(write = true)` flushes as today, and **awaits** the flush's write, so a pending textarea that now saves is simply saved. `release` becomes async, and `onUnloadFile` awaits it. If the pane still holds an unsaved layout after that, it goes into the store under the file's path, and one `Notice` (timed like `offerUndo`'s `UNDO_TIMEOUT`, because nothing is lost yet) says:

> "Test sheet" is not saved. Its changes are kept until Obsidian closes; open it again to get them back. **Copy layout**

The same sentence covers the dropdown, **New layout**, a file opened from anywhere, and closing the pane. Closing is where the copy matters most, because a quit afterwards loses the kept layout with nothing on screen to say so.

**Put back.** `render`'s load path reads the file as today. Before parsing, it asks the store for the path:

- **The entry's `base` equals the bytes read:** the layout becomes the entry's structural copy (§3's rule, since an invalid one will not parse), `onDisk` becomes the bytes read, the standing state is the entry's, and the entry leaves the store, because the pane holds it now. **Nothing is written.** Opening a file never writes, so the author retries with **Try again** or with the next edit. There is no notice: the standing block says where the edits are.
- **It differs:** the entry is dropped, the file loads as today, and a sticky notice (duration `0`, since this is the only copy left) says:

  > "Test sheet" changed on disk while it was closed, so the changes not saved to it were dropped. **Copy layout**

**Follows a rename.** `view/layout-file-events.ts` already listens to the vault's `rename` for the plugin's life. It gains one branch, **before** its `inFolder` filter, because a layout opened from outside the folder can be kept too: an entry at `oldPath` moves to `file.path`. The notices name the basename at the moment they are raised, so a rename needs no rewording.

**Goes with a delete.** The same module's `delete` listener, also before the folder filter, discards an entry at the path and raises a sticky notice:

> "Test sheet" was deleted, so the changes not saved to it were dropped. **Copy layout**

The same sentence is raised by `release(write = false)` when a pane is holding an unsaved layout for a file deleted under it. Today that path drops it silently.

**The plugin stopping.** At `onunload`, one sticky notice per unsaved layout, whether it is still in a pane or in the store:

> Sheetsmith stopped with changes to "Test sheet" not saved. They are gone unless you copy them now. **Copy layout**

`main.ts` makes one call for it: `this.register(() => announceUnsavedLayouts(this))`, directly after `registerView`, so it runs before the view's own teardown, since cleanups run last registered first. The function lives in `view/layout-editor-view.ts`, beside the view it asks, and the sentences it says live in the store's module. It marks the store stopped before anything else, so a pane letting go afterwards keeps nothing and says nothing, whichever order the app closes things in.

**Order of view close and `onunload`, measured in the stub (`src/test/obsidian-stub.ts`, `Component.unload`), 2026-09-30:** a probe loaded the plugin through `src/test/plugin-shell.ts`, opened a layout editor pane on it, wrapped the pane's `onUnloadFile` and `onClose`, the plugin's `onunload` and the store's `stopped` setter to log each call, and unloaded the plugin. The log read `cleanup: announceUnsavedLayouts`, then `plugin onunload`, and nothing else. The pane's leaf was still open afterwards: the double's `registerView` cleanup unregisters the type and detaches no leaf, so **in the stub no view closes during unload at all**. **Measured in the app, Obsidian 1.13.7 on macOS, 2026-09-30,** by disabling the plugin through `app.plugins.disablePluginAndSave('sheetsmith')` (the call the Community plugins toggle makes) with a layout editor pane open on an unsaved layout, and recording each `.notice` as it entered the DOM: exactly one notice, `Sheetsmith stopped with changes to "Group variations moved" not saved. They are gone unless you copy them now.` with **Copy layout**, 32 ms after the call. At the moment it appeared, `getLeavesOfType('sheetsmith-layout-editor')` was empty, the pane's leaf content was gone from the DOM, and the plugin was no longer in `app.plugins.plugins`. **So the app closes the plugin's views before the announcement's notice is drawn**, unlike the stub, which closes none. **Copy layout** still worked with the plugin unloaded, and the clipboard held the unsaved layout. Whatever the order, every unsaved layout gets exactly one notice, the unload sentence and not the kept one. Once the plugin is unloaded, its stylesheet is gone, so the link draws in the notice's default link style rather than `a.sheetsmith-notice-action`'s. That is accepted.

**An outside write while the pane holds one.** `reload()` today reports only a pending textarea or nudge. It now counts the held unsaved layout too, and it returns the dropped text (the pane's serialisation after `commitPending`), not a boolean. The disk wins, as it always has. The view's existing sentence stays word for word, gains **Copy layout**, and becomes sticky, because it is now the only copy:

> "Test sheet" changed on disk, so the layout editor reloaded it. An edit not yet saved here was dropped. **Copy layout**

That also applies to the pending-textarea case it already covered: every notice that drops layout text offers the text.

### 5. The action in a notice

`ui/undo-notice.ts` builds a notice with a sentence and one `<a class="sheetsmith-undo">` link (renamed `sheetsmith-notice-action` in the build, since the link no longer only undoes). **Copy layout** is the same markup with a different action. The link and its markup move into one function, `offerAction(sentence, label, onPress, duration)`. `offerUndo` becomes a call to it with `Undo` and `UNDO_TIMEOUT`, so the markup has one writer, and the dev decides the module name. **Copy layout** calls `writeClipboard(win, text)` and on success says the **Layout file** row's own success sentence, `Copied "Test sheet" to the clipboard.` That sentence moves to one place both callers read. A refused clipboard says `CLIPBOARD_REFUSED` as it does now. The window is `notice.messageEl.win` (`docs/PATTERNS.md` §5).

### 6. `persist`'s header comment

The first paragraph, "Invalid states stay in memory with a notice and are written once corrected", is rewritten to the ruling. The new text: a layout that will not save is held and reported in the outline, not only in a notice. The notice fires once per reason. A rejected write leaves `onDisk` at what the file holds. What happens to a held layout on leaving is `release`'s, and it points here. The inline comment on the `vault.modify` catch loses "`onDisk` is left holding the text that was not written", which stops being true.

### 7. Pixels

The standing state is a pane state, so it is photographed. It is staged in **`harness/editor-pane.ts`**, not `harness/samples.ts`: `samples.ts` holds sheet values and config breakages keyed by the **State** buttons, and a config breakage still parses. The pane's own states are `PaneView` options driven by pressing controls. A new option, `unsaved`, is read by `harness.ts` from `?unsaved=`:

- **`unsaved=write`.** The stub vault's `modify` rejects for the planted layout's path with `disk full`. The harness then commits one field through the pane's own control, **Label** on the component `open=` selects, set to its label plus ` (draft)`. It is dispatched the way `suggest` dispatches, so the state is reached by the real route. The shot shows the block with **Try again**.
- **`unsaved=invalid`.** No control reaches this once §1 lands, so it is staged through §4's real route instead. Before the pane opens, the harness puts an entry in the plugin's store for the planted path. Its `base` is the planted bytes, and its `text` is the planted layout with `rest_pool`'s first reset binding switched to `action: "formula"` and its `to` removed. The pane then puts it back on first render, exactly as reopening would.

New entries in `harness/shot.mjs`, at `EDITOR_FRAME` (a scoped shot does not reproduce wrap and clipping without its frame):

- `editor-unsaved-write-light`: `surface=editor&theme=light&open=rest_pool&unsaved=write`
- `editor-unsaved-write-dark`: the same, `theme=dark`
- `editor-unsaved-invalid-light`: `surface=editor&theme=light&open=rest_pool&unsaved=invalid`
- `editor-unsaved-invalid-dark`: the same, `theme=dark`
- `editor-unsaved-write-forced-colors`: the write variant under the forced-colors emulation `editor-forced-colors` already uses, because it is the one of the four with a button inside a bordered box.

The notices are not photographed. The harness does not draw Obsidian's notices, so tests cover them.

## Config fields

None. This is pane behaviour, not a component. No `configFields`, and no `ComponentDefinition` change.

## Data and file model

**Nothing new is stored in either file.** The store is memory only, gone when Obsidian closes or the plugin stops, and each of those says so first. Nothing is written to `data.json`. The only bytes this feature writes to a layout file are the ones `persist` already writes, through the same serialise-then-parse gate, so Constraint 3 is inherited, not claimed afresh. **A kept layout is applied only where the file still holds the exact bytes it was kept against**, so it can never overwrite a change made elsewhere. No character note is read or written. The one note-facing effect is the rename refusal in §2, which exists to *prevent* a save that would leave every note's section unrendered (Constraint 4).

## Acceptance criteria

### Held by tests

The three `REPRO:` cases in `layout-editor.test.ts`'s `describe('REPRO: leaving a layout the pane could not save')` become ordinary regression tests. The `describe` loses its prefix and becomes `leaving a layout the pane could not save`, and each case is renamed as below:

- [x] `keeps a layout it could not write across leaving and coming back` is the second REPRO case (`vault.modify` refusing), renamed. It also asserts the kept notice and that nothing was written on the return.
- [x] `puts back a kept layout that does not save, standing state and all` replaces the first REPRO case, whose route (**Set to a formula**) §1 closes. It reaches the invalid state through the store, seeded as a leave would, and asserts both edits and the invalid block on return.
- [x] `takes the disk and offers a copy when an outside write drops an unsaved layout` is the third REPRO case, **with its second assertion rewritten**. The pane now shows the outside write's contents (`columns: 6`), not the held edits, and the notice is the existing sentence, word for word, carrying **Copy layout**. Pressing it puts the held layout's serialisation, with `Health`, on the stub clipboard.
- [x] Choosing **Set to a formula** on a binding with no `to` writes nothing, raises no `Notice`, draws **Resets to** with `A formula reset needs an expression.`, and focuses it. Committing an expression writes `action` and `to` in one write that one undo takes back. Choosing another action instead writes that action.
- [x] Choosing **Set to a formula** on a binding that kept a `to` writes at once.
- [x] **Label** refuses a label a container's child already holds, with `Another component already uses this label.`, and writes nothing. A test asserts that the field and `parseLayout` agree on the same fixture, by calling the exported rule both use.
- [x] A rejected write draws the write block with **Try again**. Pressing it after the vault recovers writes, removes the block, says `"Test sheet" is saved.`, and focuses the layout picker. Pressing it while the vault still refuses redraws the block with focus on **Try again**.
- [x] After a rejected write, `holds()` is true of the file's actual bytes and false of the unwritten text, and the undo stack is as it was before the attempt.
- [x] Two edits refused for the same reason raise one `Notice`. A refusal with a different message raises a second.
- [x] From the unsaved state, undo restores the last saved bytes without a write and clears the block. Redo brings back every held edit and re-enters the block. A second undo steps back past the last *saved* edit, as before.
- [x] While the block is up, a **Label** commit is refused with `Not renamed, because this layout is not saved yet and its character notes cannot be migrated until this layout saves.`, and no migration runs.
- [x] The rename refusal lifts on the save that ends the standing state: after **Try again** succeeds, the same **Label** field, with no pane rebuild in between, commits a rename and the migration runs.
- [x] A kept layout whose file was written in the meantime is dropped on reopening. The file's contents show, and the sticky notice `"Test sheet" changed on disk while it was closed, so the changes not saved to it were dropped.` carries **Copy layout**.
- [x] A kept layout follows a vault rename, including for a file outside the layout folder, and is put back when the renamed file is opened.
- [x] Deleting a file with a kept layout discards it with the sticky "was deleted" notice. Deleting the file under a pane holding one raises the same notice.
- [x] Plugin unload raises one sticky "Sheetsmith stopped …" notice per unsaved layout, whether it is held in a pane or kept in the store, and no "kept" notice as well.
- [x] Closing the pane, switching with the dropdown, and **New layout** each keep the layout and raise the "is not saved. Its changes are kept …" notice with **Copy layout**.
- [x] **The async release race, a blocking set.** `release` now awaits a write, so three orderings are tested:
    - (a) Switching file while `release`'s flush write is still in flight: the next file does not render the old pane's layout, standing state or undo stacks, and the stash lands under the path being left, never the path being opened.
    - (b) Switching file while a **Try again** write is in flight: the same two assertions.
    - (c) A leave that begins while a successful **Try again** is in flight keeps nothing, and the layout is written exactly once, including after a reopen. The leave waits for the write, so there is never a store entry for it to clear.

    If any of these cannot be made deterministic, the dev reports it at the land stop and does not land the feature with it untested.
- [x] `offerUndo`'s existing callers render the same markup through the shared function. The existing undo-notice tests pass unchanged.
- [x] `npm test`, `npm run lint` (at `--max-warnings 0`) and `npm run build` pass. `styles.css` is rebuilt from `src/styles/`.

### Held by the harness

- [x] The four `editor-unsaved-*` shots show the block directly under the **Layout file** row, above **Sample values**, with the whole message wrapped inside its border at `EDITOR_FRAME` in both themes. The write shots show **Try again** inside the block, not beside it.
- [x] In `editor-unsaved-write-forced-colors`, the block's border and the button's outline both survive.
- [ ] The existing `editor-light` and `editor-forced-colors` shots are unchanged, so a saved layout draws no block. *Not checkable at the spec review: no pre-feature baseline of the two shots exists to compare against, so the MD5 match the build session took is the building session's own evidence, not the reviewer's. Left open for a review that renders the parent commit and this one side by side.*

### Held by the throwaway vault

The vault is `~/Developer/sheetsmith-test-vault/`. No fixture is added. The steps use `Sheetsmith layouts/Group variations.sheetsmith`, which has a container with children, and a Finder-level `chmod` to make the vault refuse the write. That is the one route into the state the app offers once §1 lands.

- **Label in a child.** Open **Group variations** and give a top-level component a label one of the group's children holds. The field refuses it, and the file's modified time does not move.
- **Refused write.** In a terminal, `chmod 444 "Sheetsmith layouts/Group variations.sheetsmith"`, then change a component's **width** in its **Position** row. The block appears with the vault's message and **Try again**, with one notice. Change another component's **row**: no second notice. Change any **Label**: the field refuses it with `Not renamed, because this layout is not saved yet and its character notes cannot be migrated until this layout saves.` and puts the old label back, which is correct: `Characters/Sera.md` uses this layout, and a rename that saved later would migrate none of its sections. `chmod 644`, press **Try again**: the block goes, `"Group variations" is saved.` appears, and the file holds both position changes and the old label.
- **Leave and return.** `chmod 444` again, change a position, choose another layout in the dropdown. The kept notice appears. Choose **Group variations** again: the edit and the block are back.
- **Rename while kept.** Leave again, rename the file in the file explorer, and open the renamed file: the edit is back.
- **Changed while away.** Leave again, `chmod 644`, change the file in a text editor, and open it: the dropped notice appears, and **Copy layout** puts the pane's version on the clipboard.
- **Plugin stopped.** Hold an unsaved edit and turn Sheetsmith off in **Settings → Community plugins**: one "Sheetsmith stopped" notice, and its **Copy layout** works.

All seven passed in the app on 2026-09-30, Obsidian 1.13.7 over the DevTools protocol: the six above, plus renaming the file back and checking that `Characters/Sera.md` still renders.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through implementation and every round of findings.

1. **`fix: Ask for the expression before a formula reset is written`.** The **Set to a formula** draft in `reset-field.ts`, and its tests.
2. **`fix: Check a component's label against every component`.** The exported rule in `parse/layout.ts`, the parser's check calling it, **Label** calling it, and the agreement test.
3. **`feat: Say in the pane's outline that a layout is not saved`.** The standing state in both variants, **Try again**, the notice once per reason, the saved notice, `onDisk` restored on a rejected write, the rename refusal, the `sheetsmith-editor-unsaved` rule in `src/styles/`, the rebuilt `styles.css`, the harness `unsaved` option and the five `shot.mjs` entries, and `persist`'s header comment.
4. **`fix: Undo from an unsaved layout to its last save, keeping the edits for redo`.** The undo change, the marked redo entry and its structural restore, and `docs/features/editor-undo.md`'s amended wording.
5. **`feat: Offer a copy of layout text the editor drops`.** `offerAction` under `offerUndo`, the shared copy sentence, and `reload` returning the dropped text with the outside-write notice gaining **Copy layout**. The third REPRO test is renamed and rewritten here.
6. **`feat: Keep an unsaved layout when its pane lets go of it`.** `editor/unsaved-layouts.ts`, the plugin's instance, `release` awaiting and keeping, the byte-checked restore, rename and delete in `layout-file-events.ts`, the deleted-under-the-pane notice, the unload notices, and the other two REPRO tests renamed.
7. **`docs: Record that the layout editor never silently drops a committed edit`.** Four doc changes, listed below, then the `BACKLOG` row removed.

    - `SPEC` §10 gains the bullet:
      > **The layout editor never silently drops a committed layout edit.** Every path keeps it, puts it back, or says what went and offers the copy. A layout the pane could not write is kept, put back or reported with a copy: leaving the file keeps it in memory, by path, until Obsidian closes, following a rename. Reopening puts it back where the file still holds the bytes it was kept against. A write elsewhere, a delete, or the plugin stopping drops it with a notice offering **Copy layout**. Nothing asks before leaving.
    - `docs/UI.md` §10 gains:
      > A pane's own failure appears in its outline, under the **Layout file** row: the file cannot be read, cannot be edited, or holds changes not saved. That is the pane's place, not a global one, and it never displaces the row.
    - The `SPEC` §13 entry stays where it is. `/land-it` adds the `Resolved:` line above and moves it.
    - The `docs/BACKLOG.md` § UI row is removed.

## Deliberately not doing

- **No "Leave without saving?" prompt**, on the owner's ruling.
- **Nothing survives Obsidian closing.** The store is memory only. Persisting it to `data.json` would put layout text in plugin data and bring a staleness problem of its own. The pane-close notice's **Copy layout** is the way out.
- **No queue of rename intents.** §2 refuses a rename while the file is behind instead. The owner's reason: queuing adds a second piece of pending state that the store would have to carry across leaving and renames.
- **The level reorder report is not replayed.** A reorder committed while the file is behind raises no report, as today (`level-list-reorder-report.md`'s own amendment), and none follows when it finally saves.
- **The Layout file row's copy button still copies the file's bytes**, not the pane's held version, on `layout-import-export.md`'s reasoning. The held version is copied only through the drop and keep notices.
- **No per-edit undo inside the unsaved state.** Everything since the last save is one step (§3).
- **Adjacent `docs/BACKLOG.md` § UI rows, untouched:** "An inline field error is neither announced nor linked to the input it is about"; "An inline field error has no second channel in forced colors"; "No `<select>` in the editor carries an inline error across a rebuild"; and the pane's narrow-width regime row. The standing block is announced through its notice, not through a live region, for the first of those rows' reasons, and it inherits the last one's width limits.
