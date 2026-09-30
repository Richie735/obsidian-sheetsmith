# Level list reorder report

Status: shipped
Board card: the `docs/BACKLOG.md` § Patterns row "A level stores its position, so reordering or shortening a level list's names rereads every note's stored value, silently" (`editor/list-fields.ts`, `components/level-ring.ts`). It closes before 0.5.0 is cut, and the row leaves `docs/BACKLOG.md` in the commit that closes it.

## Model question

A new §13 entry, written with this spec: **whether a reordered level list migrates the character notes, or is reported.** No open §13 question blocks it, and the contract (`SPEC` §4.1) does not grow.

**Answer, decided with the owner: report, never migrate.** When a layout edit reorders a level list's names, inserts a name before another, or shortens the list, the layout editor says so in one `Notice` and leaves every stored position alone.

- **The reason.** Conditions (`visibleWhen`) and reset clauses (**Only where**, **Resets to**) name a level by position too, and nothing rewrites them. An expression is not something the editor can renumber safely. If only the notes were rewritten, the notes and their conditions would disagree, which is worse than both agreeing on the new order.
- **The second reason.** Level values live in four storage shapes: a Track's fence line (`value: 2`), a Table cell, a Roster cell, and a Record set field. A migration would either have to learn each component's storage format, which breaks "nothing outside a component knows it exists", or add a contract member that no other case needs.

The owner's three amendments decide the rest:

1. **The count is of sections, never of fields.** A reader that opens a cell or a field to check whether a note "holds that field" runs into the same storage-format objection. So the report counts the character notes on this layout that hold a **non-empty section for the component**. That is `countAdoptions` in `src/section-adoption.ts`, reused as it stands. The words claim nothing the count can't back: "any Proficiency level they store", never "N notes store a Proficiency level".
2. **Toggles carrying `levels`: the code settles which case holds, and it splits by component.**
   - **A Table, Roster or Record set `toggle` column stores a boolean, and its `levels` label nothing.** The cell writes `flagText(level > 0)` (`table.ts` `stateOf`, `roster.ts` and `record-set.ts` the same). `bindRingControl` is handed `graded: type === 'level'`, so for a toggle it is `false`, and `ring-control.ts`'s `word()` and `paintLevelRing` only read `levels` when graded. A toggle column keeps `levels` only as a leftover from the `level` column it used to be (`ring-control.ts`'s own comment on `count`). The layout editor draws **Level names** only where `effective === 'level'` (`list-fields.ts`), so no gesture can reorder a toggle column's names. **So there is no commit site and nothing is reread.** They are out of scope, and the reason is recorded here so a reviewer does not report them as a gap.
   - **A Track that is a flag stores a boolean that its two names *do* label, so it is in scope.** `isFlagCard` is true for a Track with two level names and one mark per segment. It writes `flagText(value >= 1)` (`track.ts` line ~742), and its ring is bound with `graded: named`, so the ring's glyph, its tooltip word, and `stepLabel` all read `levels[0]` or `levels[1]`. Swap the two names and every note that says `value: yes` now shows what `no` used to show. The move detector already reports that swap as two moves (`"Bound" was 1 and is now 0; …`), so the flag Track needs no case of its own. It comes in with the Track commit site below.
3. **The Notice offers the undo, and the undo holds at every commit site.** What was checked, site by site:
   - **All four sites commit through `persist(true)`.** They are the list field's **Level names** input (`list-fields.ts` ~1278), its **Levels** count, both when cleared (~1314) and when set (~1331), and Track's `text-list` field (`config-panel.ts` ~908, through `onCommit` → `this.host.persist()`). `LayoutEditorSection.persist` pushes the previous `onDisk` onto the undo stack **synchronously, before its first `await`**, whenever the serialised bytes changed. A reorder always changes bytes. So by the time any report is raised, the step it describes is on the stack, and one undo restores the previous file byte for byte, conditions and reset clauses included. It holds at all four sites.
   - **What it does not cover, said plainly.**
     - Undo takes back the *most recent* step. If the author commits something else after the reorder, a bare undo removes that first. The **Undo** link below is guarded by bytes, the same way the tree's **Remove** is, so a stale press says "Sheetsmith did not undo: this layout has changed since." and never undoes the wrong step.
     - The undo commands have had no default hotkey since 0.1.1 (`docs/features/editor-undo.md` § Discoverability). A sentence that only *says* "undo" points at a command the author may have to find in the palette. That is why the design carries the link.
     - Undo cannot take back a value a player stored **between** the reorder and the undo. Once the layout is written, open sheets re-render under the new order (`refreshSheets`). A ring pressed on one of them stores a position read under the new mapping, and the undo then rereads that one value the other way. This is a narrow window, and it is stated rather than designed around.
     - The stacks are cleared when the pane switches to another layout, which is the existing per-layout scope.

**A count-only report still flushes the open sheets first.** The rename migration flushes because a scan that misses a value typed seconds ago "finds nothing, and reports an all-clear" (§10, "A layout edit reaches a note through whatever sheet is open on it"). This report is silent when no note holds the section and nothing else reads the list, so the silence *is* the all-clear, and it can be wrong in exactly the way §10 names: a reader who has just typed the first value into a blank section. The flush costs one awaited `host.flushSheets()` on a gesture that is rare, a commit to a level list. It is not followed by `reloadSheets`, because nothing was rewritten. (The insert and paste adoption scans don't flush. That inconsistency is older than this feature and this feature does not change it. See **Deliberately not doing**.)

**Existing notes:** untouched, by construction. The feature writes to no note, and a flush writes only what a sheet already holds. **Round-trip:** it stores nothing new in either file.

## What it does

When an author commits a level list whose names moved, or whose highest level dropped, the layout editor says what moved. It says how many character notes on this layout hold a section for that component, and that any level they store is now read against the new list. It offers **Undo**. The condition and reset clauses it already writes stay, word for word.

## Smallest version

The note clause and the count, at all four sites, raised as a plain `Notice` once the scan resolves. It has no **Undo** link: the sentence ends "Undo restores the old levels." and points at the pane's undo command. It has no flush. It gives up one-press undo, since the command has no default hotkey, and it gives up the one note whose first value is still inside the two-second save debounce. It saves the guarded-undo plumbing (one host member instead of one host member plus the guard) and one awaited call.

## Design

### The Notice

These are appended to the sentence `levelReorderNotice` already builds. Nothing existing is reworded.

```
"Proficiency" levels moved: "Expertise" was 2 and is now 1; "Proficient" was 1 and is now 2.
4 notes on this layout hold a section for Skills, and any Proficiency level they store is now read against the new list. [Undo]
```

- **The first sentence is unchanged**: the moves, up to three named and then counted (`NAMED_MOVES`), and the shortening clause.
- **The condition clause and the reset clause are unchanged**, in their existing order, where they apply.
- **The notes clause comes after them**, so an author reading a list with conditions meets the fix they can make (Shown when, Only where) before the count they cannot act on beyond undo:
  - many: `N notes on this layout hold a section for <label>, and any <key> level they store is now read against the new list.`
  - one: `1 note on this layout holds a section for <label>, and any <key> level it stores is now read against the new list.`
  - `<label>` is the component's label, unquoted, the way the reset clause writes trigger names. Keep it unquoted: the owner's own wording is "hold a section for Skills", and a label is the layout's own word. `<key>` is the field key, unquoted, as the condition clause already writes it ("reads Recharges by position").
  - For a Track, key and label are the same word: `any Corruption level they store`.
- **"Is now read against the new list"**, not "now means something else" and not "has moved": it is true for a move and for a shortening, and it is true of *any* level, including one that did not move and a note whose value is 0. It claims no per-field fact.
- **Then the Undo link**, from `ui/undo-notice.ts` `offerUndo`, with its 12-second timeout. Its guard is `persistUndoable`'s: it undoes only while the pane holds the file and the bytes this commit wrote, and otherwise says "Sheetsmith did not undo: this layout has changed since." The link goes on **every** reorder Notice, including the condition-only and reset-only ones that exist today, because undo puts their conditions back too. That changes how those Notices are raised (`offerUndo` rather than `new Notice`), but not what they say.

**When it says nothing**, which is the ordinary case:
- no name moved and the highest level did not drop (a rename in place, a mark changed, a longer list);
- or something moved, no condition or reset reads the key, and the scan counted no note.

**Where it counts nothing:** the note clause is left out, and the other clauses still fire, when:
- the layout write failed;
- the file is not the layout its name resolves to (`mayAdopt` / `isResolvedLayout`, the rename's and the adoption's gate, because notes naming this basename read some other file);
- or the component's label is empty.

### Commit sites

| Site | Component | What `before` and `after` are |
| --- | --- | --- |
| `list-fields.ts` **Level names** | Table, Roster, Record set (`kind: 'columns'`, `level` type) | `{ levels, max }` of the column, as now |
| `list-fields.ts` **Levels**, cleared | same | as now |
| `list-fields.ts` **Levels**, set | same | as now |
| `config-panel.ts` `text-list` | Track `levels` | `{ levels }` before and after the commit |

- **The three list-field sites keep `reportReorder`.** It stops raising the Notice itself. It hands the pane a sentence-to-be: a function of the note count, closed over `readersOf` and `resetsReading` at commit time. The pane calls it once the write and the scan resolve. A new optional `ListContext` member carries it, and it replaces `persist()` at those three sites. It is optional for the reason `suggestNames` is: tests and the harness assemble contexts of their own. Where it is absent, the site falls back to today's `persist()` and a plain condition-only Notice.
- **The Track site is the fourth, outside `reportReorder`.** `config-panel.ts`'s `text-list` branch compares the list before and after, passing no readers and no resets (a Track has no sibling conditions, and its bindings have no `where`), and commits through the same host member.
  - **How it knows the list is levels:** `text-list` is the kind of exactly one field in the registry, Track's `levels`. The kind's own comment already says "their order is the whole meaning". So every `text-list` commit is treated as a level list, and `types.ts`'s description of the kind gains a sentence that says so. A second `text-list` that is not positional would earn a declared flag then, not now (`PATTERNS` §1, one consumer).
  - **Clearing a Track's names reports no shortening**, because Track then counts from its `count` field, which the panel cannot read (it may be a formula). `after` would read as one level and report a false shortening. The guard is "after has no names, so compare names only". The over-run rule (§13, "drawn, never lost") already draws any stored value past the new run, so nothing is lost silently.
- **The count** is `countAdoptions(app, basename, [label]).notes`. Its header gains one sentence naming this second caller. The function counts non-empty sections under a label, which is exactly the question here, and a second scan module would be a copy of it.

### Where the code goes

- **`editor/level-reorder.ts` stays pure.** `levelReorderNotice` gains one trailing parameter: the component label and the note count (`{ label, notes }`, or absent). Its early return widens from "no readers and no resets" to "no readers, no resets, and no notes". It adds the notes clause. That is its whole change. It still sits in `editor/` on `PATTERNS` §1's atomicity test.
- **`editor/layout-editor.ts`** gains the host member. It works like `persistUndoable`: capture `onDisk`, call `persist()`, return where no byte changed. Otherwise await the write; if it saved and `mayAdopt(file)` holds, flush the sheets and count; call the sentence with the count; `offerUndo` it if it is not null. It shares the byte guard with `persistUndoable` rather than spelling it twice. `config-panel.ts` threads the member through to the list context and uses it at its own `text-list` site.
- **Interaction:** none new. It uses a Notice and a link, `UI.md` §9's existing undo notice.
- **Empty state:** silence (above).
- **Error state:** a write that fails already says "Sheetsmith could not save this layout: …" from `persist`. The report then raises no note clause, and no Undo, because nothing was written.

### Pixels

**Nothing reaches the harness's three screens.** The Notice is Obsidian chrome, and the harness renders neither Notices nor the undo link. No config field, description, class, or stylesheet rule changes. **So no design review runs.** The copy is checked by test and by the fixture below.

## Config fields

None added or changed. `levels` on Track and `levels`/`max` on a `level` column are unchanged. Their descriptions gain nothing (see **Deliberately not doing**).

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| — | — | — | — |

## Data and file model

- **Stores nothing.** Neither the layout nor any note gains a byte. Round-trip (Constraint 3) is untouched.
- **No note is written** by the report. The flush writes only what an open sheet already holds, which is what the rename path already does (§10).
- **Existing notes** keep every stored position. The Notice says that the reading changed. It changes nothing.
- **§10 gains one bullet at landing.** `/land-it` writes it, with this exact wording, after the adoption bullet:

  > - **A layout edit that reorders a level list is reported, never migrated.** A level stores its position, so reordering a level list's names, inserting one name before another, or shortening the list changes what every stored level reads as, in every note on the layout. The layout editor says so at the commit, in one `Notice` counting the character notes on this layout that hold a section for the component and offering **Undo**, and it rewrites nothing: not the notes, and not the conditions and reset clauses that name a level by position, which nothing could rewrite in step with them. The count is of sections, never of fields, since reading a cell to see whether a note holds a level would teach the editor each component's storage. A level renamed in place moves nothing and says nothing.

- **§13's `Resolved:` line**, also `/land-it`'s: `Resolved: **report, never migrate** (docs/features/level-list-reorder-report.md), built as decided.` Then one sentence on what the build found, if anything, beyond this spec.

## Acceptance criteria

### Held by tests

- [x] **Pure sentence.** `level-reorder.test.ts`:
  - a move with no readers and no resets, with 4 notes, gives the moves sentence plus `4 notes on this layout hold a section for Skills, and any Proficiency level they store is now read against the new list.`;
  - with 1 note it gives the singular (`1 note … holds … it stores`);
  - with 0 notes and no readers, null;
  - a shortening with notes gets the notes clause;
  - a rename in place, or a mark changed, is null whatever the count.
- [x] **Existing clauses are unchanged.** Every existing `level-reorder.test.ts` case passes unedited. A case with a reader, a reset, and notes puts the three clauses in that order.
- [x] **Each list-field site reaches it.** In `layout-editor.test.ts`, driven through the pane with notes in the stub vault (the `a component landing on a section notes kept` precedent):
  - a Table, a Roster and a Record set `level` column's **Level names** reordered raise the notes Notice counting the notes holding that component's section;
  - its **Levels** count lowered, and then cleared from 3, each raise one.
- [x] **The Track site reaches it.**
  - Reordering a named Track's **Level names** raises it.
  - Swapping a two-name flag Track's names raises it.
  - Clearing a Track's names raises nothing.
  - Naming a Track that had no names raises nothing.
- [x] **Counts sections, not fields.** A note whose section for the component is present but holds no level cell is counted. A note whose section is whitespace only is not counted. A note on another layout is not counted.
- [x] **Silence.** A reorder no condition or reset reads, on a layout no note uses, raises no Notice.
- [x] **Gates.**
  - A failed layout write raises no notes clause and no Undo.
  - A file its name does not resolve to raises no notes clause, while a condition clause still fires.
- [x] **Flush before the count.** A sheet open on a note whose section was blank on disk, holding an unsaved first value, is counted.
- [x] **Undo.**
  - Pressing the Notice's **Undo** restores the previous layout bytes.
  - Pressing it after a second commit says "Sheetsmith did not undo: this layout has changed since." and restores nothing.
  - Both hold at the Track site too.
- [x] **Writes no note.** No character note's bytes or modified time change across a reorder (the `writes no character note` precedent).
- [x] **The existing reorder cases in `list-fields.test.ts` still pass.** Only the way they read the Notice may change, because it is now raised through `offerUndo`.
- [x] `npm test`, `npm run lint` and `npm run build` pass. `backlog.test.ts` passes with the row removed.

### Held by the throwaway vault

The vault is `~/Developer/sheetsmith-test-vault/`. One fixture addition, for the flag Track, since the vault's only one-segment Track (`conditions`) is a row set, and a row set refuses level names:

- **`Sheetsmith layouts/Track variations.sheetsmith`** gains a Track `bound` ("Bound"), `count: 1`, `levels: ["Unbound", "Bound:"]`, placed on a free row.
- **`Characters/Tracks.md`** gains `## Bound` holding a `sheet` fence with `value: yes`.

Every step below edits in the layout editor, and then undoes.

- **Roster.** Open `Sheetsmith layouts/Roster variations.sheetsmith`. On **Abilities**, change `Training`'s level names to `Untrained, Expertise:, Proficient:`. One Notice names the two moves, then `1 note on this layout holds a section for Abilities, and any Training level it stores is now read against the new list.` (`Characters/Rosters.md`), then **Undo**. Press **Undo**: the names are back, and `Rosters.md`'s modified time did not move.
- **Record set with a condition.** On `Record variations.sheetsmith`'s `recharging`, reorder `Recharges` to `None, Long rest, Short rest, Always-on`. The existing condition clause for `Uses` appears, unchanged, followed by the notes clause counting `Records.md`. Undo.
- **Track.** On `Track variations.sheetsmith`'s **Corruption**, move `Marked` before `Touched`. The Notice counts 2 notes (`Tracks.md`, `Overruns.md`). Undo.
- **Flag Track.** On **Bound**, commit the names `Bound:, Unbound`. The Notice names both moves and counts `1 note` (`Tracks.md`), and the sheet on `Tracks.md` now reads its `yes` under the swapped names. Undo.
- **Silence.** Rename `Corruption`'s `Clear` to `Pure` in place: no Notice. Undo.
- **Stale undo.** Reorder `Training` again, then move any component on the canvas, then press the reorder Notice's **Undo** within 12 seconds: "Sheetsmith did not undo: this layout has changed since."

## Commit boundaries

These are a plan for `/land-it`, not a schedule. The tree stays uncommitted through implementation and every round of findings.

1. `feat: Count the notes a level reorder rereads`.
   - `levelReorderNotice`'s notes clause and widened null rule, with its tests;
   - the pane's host member with the flush, the count and the guarded **Undo**, sharing `persistUndoable`'s byte guard;
   - the optional `ListContext` member, threaded through `config-panel.ts`;
   - the three `list-fields.ts` sites moved onto it;
   - the `countAdoptions` header sentence naming its second caller;
   - the `level-reorder.ts` header's **Only a list a condition reads** paragraph, rewritten to say every level list is reported and why none is migrated;
   - the `layout-editor.test.ts` and `list-fields.test.ts` cases.
2. `feat: Report a reorder of a track's level names`.
   - The `config-panel.ts` `text-list` site, with the names-only guard for a clear;
   - the `types.ts` sentence that a `text-list` is positional;
   - the Track and flag Track tests.
3. `docs: Record that a level reorder is reported, never migrated`.
   - SPEC §10's bullet, with the wording above;
   - SPEC §13's `Resolved:` line;
   - the `docs/BACKLOG.md` § Patterns row removed;
   - `docs/features/conditional-field-visibility.md` § Reorder: its "A reorder of a level list that no condition reads raises nothing … recorded in `docs/BACKLOG.md`" sentences replaced by a pointer to this feature, with its vault step "Reorder `Rank`'s names on `features`, which no condition reads: no Notice." amended to expect the notes clause;
   - this document's status.

## Deliberately not doing

- **Migrating any note, or rewriting any condition or reset clause.** Settled: report, never migrate (**Model question**).
- **A per-field or per-cell count.** Settled by amendment 1.
- **Table, Roster and Record set `toggle` columns carrying leftover `levels`.** Their names label nothing, and no gesture reorders them (**Model question**, amendment 2).
- **Type changes.** Changing a `level` column to `toggle`, or back, rereads stored values too (`2` is not a set flag, and `yes` is level 0). Every type change rereads, and that is a different hazard from a reorder.
- **Paste configuration, layout import, and hand edits of the layout file.** Each can replace a level list without passing through a level-list commit. Undo and redo are not reported either: they restore bytes the file already held.
- **Formulas elsewhere on the sheet that read a level by position** (a computed card reading a published level, `sum(skills, Training)`). This is the hazard every computed reader of that name already has. `conditional-field-visibility.md` § Reorder declined to widen to it, and this feature declines too.
- **A standing warning in the field descriptions** of **Level names** or Track's `levels`. The Notice is the moment of the change, and a description change would reach the harness's pixels and pull in a design review for copy.
- **Flushing the insert and paste adoption scans.** They share this scan and not this feature's flush. Aligning them is its own change.
- **The Patterns row "The reorder and remove controls of a list field are spelled twice in one file"** (`list-fields.ts` `addControls`).
- **The Patterns row "A fifth list field imports from one of the other three".**
- **The UI rows on `list-fields.ts`**: marked-row alignment, hand-rolled `<select>` chevrons, flags outliving controls, and the grip drag image.
