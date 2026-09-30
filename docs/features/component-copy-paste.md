# Component copy and paste

Status: shipped
Board card: Copying and pasting a component in the layout editor: a component
(with its children, if it is a container) copied and pasted within one layout or
into another layout, and one component's configuration pasted onto an existing
component. Fourth of four requests about the layout editor's tree; the other
three shipped as `docs/features/layout-editor-tree.md`, whose § Deliberately not
doing names this as the next feature and whose §5 leaves room for it in the menu,
between the moves and **Remove**.

## Model question

**One, settled with the owner before this spec**: "What a pasted component
carries, and what its names mean where it lands." It is recorded as an open
entry in `SPEC` §13, as the tree feature's was, and stays open until this is
built, when `/land-it` moves it to a `Resolved:` line. The settled
answers are listed here as the decisions the design builds on, each with the
argument for it. Where checking an answer against the code turned something up,
the finding sits under the answer it qualifies.

1. **A copy carries the whole subtree: the configuration plus the children.**
   It never carries stored character values, because a layout holds none
   (`SPEC` §3.2, §10). A container copied is a container pasted, with
   everything inside it.

2. **Every component in the pasted subtree gets a unique id and label, suffixed
   only where a name is taken.** Within one layout every name is taken, so the
   copy of "HP" becomes "HP 2" with id `hp_2`. Across layouts, a free name stays
   as written. **References inside the copy are rewritten to point at the
   copies. References to anything outside the copy stay as written.** The
   rewrite covers every place a component id can sit in an expression:
   - a bare name (`hp`);
   - the first segment of a dotted one (`abilities.DEX.value`);
   - the second segment of a `mod.` name (`mod.hp`). SPEC §5's `mod.` namespace
     puts the id after the prefix, which the owner's list did not name;
   - the first argument of `sum(` and `count(`;
   - a reset binding's `to`.

   It walks each component's declared `formulaFields`, and works on the formula
   tokenizer's name tokens, never on a text replace.

   *Finding: the tokenizer cannot hand back positions today.*
   `tokenize` in `src/formula/expression.ts` is private, and its tokens carry
   `kind` and `value` only, with no offset. A rewrite that keeps every other byte
   of an expression needs to know where each name sits. The change is small and
   stays pure (Constraint 5): `tokenize` already knows the offset
   (`source.length - rest.length`) at the moment it pushes a name. So
   `expression.ts` gains one exported reader, `nameSpans(source)`, which returns
   each name token's text, start, end, and whether a `(` follows it (a call), or
   `null` where the text does not tokenize. This is **growth in `src/formula/`,
   not in the component contract.**

   *Finding: `uniqueId` cannot carry an id as written.* `uniqueId` in
   `layout-editor.ts` builds an id from a *label*. It lowercases it and turns
   every other character into an underscore. So a free `STR` would come back as
   `str`, and a component whose id is `hit_points` and whose label is "HP" would
   come back as `hp`. Neither is "free names stay as written". The id half
   therefore goes through `parse/layout.ts`'s `migrateId(raw, taken)`, which is
   exported for this. It keeps a valid id exactly as it is and suffixes `_2`,
   `_3` only on collision, which is the settled rule's own shape. Labels go
   through `uniqueLabel` unchanged. (`uniqueId`'s comment cites a
   `COMPONENT_ID` in `parse/layout.ts` that no longer exists. The function it
   means is `migrateId`, and the comment is corrected in passing.)

3. **Outside references are reported only when the paste crosses layouts.**
   Within one layout, an outside name resolves to the same component by
   definition, so reporting it would be noise. Across layouts the report lists
   two kinds of outside name. The first is **names the target resolves**, which
   is the silent case: the target publishes that name for a component of its
   own. The second, a choice this spec makes, is **names the target does not
   publish**. The owner's answer named only the first. The second is added
   because Retool issue 31785's pain, repairing every broken reference one at a
   time, starts with not knowing where the breaks are, and a sheet that shows
   "?" does not say which pasted formula caused it. The `Notice` names up to
   five things to check, and past five it gives a count. **The full list is
   written nowhere**: the panel list the first draft proposed was cut at spec
   approval to the smallest version (§ Deliberately not doing).

4. **Layout-level declarations are neither carried, merged, renamed nor
   refused.** That covers the function library (§5), reset trigger names (§6),
   bonus types (`modifierTypes`) and modifier definitions (§5, §7). Each one the
   copy depends on is **reported as present or missing in the target**, and
   **only on a cross-layout paste**, for 3's reason: within one layout every
   declaration is the one the copy was built against. **Every reset binding the
   copy carries is named in the report with its action and its `to`**, whether
   or not its trigger resolves. The counter-example is why: a Hit Dice Track
   copied from a D&D 5e 2014 layout into a 2024 one binds to "long rest", which
   resolves, but the half-recovery arithmetic is on the Track's own binding.
   Every name resolves and the paste is still wrong, and only telling the author
   can help.

   *Finding: no component's configuration names a bonus type or a modifier
   definition*, so "depends on" has to be read per declaration:
   - **Functions**: every call in the copy's expressions that is not a builtin
     or an aggregate. A zero-parameter function read as a bare name (`prof`) is
     a name, and a name the target neither publishes nor defines is reported
     once, as missing.
   - **Triggers**: every `reset[].trigger`.
   - **Modifier definitions**: those in the *source* layout whose change targets
     a component in the copy. They stay behind, and a character's cell enrols
     in one by name, so the report says whether the target has a definition of
     that name.
   - **Bonus types**: none, ever. `grep` finds `bonusType` only in modifier
     cells and definitions, never in a component's config type, and
     `parse/layout.ts`'s comment on `modifierTypes` agrees: nothing a component
     stores names one. The report has no bonus-type group, and the spec says so
     rather than drawing an empty one.

   To say "present or missing", the report needs a little of the source's
   context at paste time. The clipboard therefore carries a **report-only
   context** (Data and file model): the source's definition line for each
   function the copy calls and the modifier definitions that target the copy.
   None of it is written into the target. With it, a function defined
   identically in both layouts drops out of the report, and one defined
   differently is named as differing. That is the 2014-to-2024 trap one level
   down, in the library rather than the binding.

5. **Paste configuration is a separate gesture.** The menu has one **Copy** and
   two pastes, **Paste** and **Paste configuration**, both reading the same
   clipboard. That guards against the confusion Gutenberg issue 58650 reports,
   about which paste goes with which copy. Paste configuration applies the
   source's `configFields` keys only, never `id`, `label`, `position` or
   `children`. It **does** carry the reset binding. It works between components
   of the same type only. **Its enabled state never depends on reading the
   clipboard**, because that read is async, may prompt, and is likely to fail on
   mobile. The item is always enabled, and pressing it with a different type on
   the clipboard is refused with an inline line that names the source's type.

6. **The clipboard is the system clipboard, holding plain-text JSON with a
   versioned wrapper** (`{"sheetsmith": "component", "version": 1, …}`). It is
   written through the container's own window, as `layout-file-row.ts` writes a
   layout, with that file's failure `Notice`. On mobile, a device test settles
   whether a clipboard read works. Where a read fails, Paste falls back to a
   paste box, the shape the **New layout** modal's **Pasted JSON** source
   already uses, rather than the feature being dropped there. The pasted text is
   validated before anything is written, as a pasted layout is.

   *Finding: there is no `layout-import.ts` to reuse.* That paste box was folded
   into `NewLayoutModal` (`new-layout.ts`'s header says so), and it is a private
   method of that modal. What carries over is the row's shape: a `Setting`
   holding a six-row textarea, with its placeholder and its "checked before
   anything is written" promise. The component paste box is a small modal of its
   own built the same way (Design §7), not a reuse of that class.

7. **One paste is one `persist()`, which is one undo step, and it answers with a
   `Notice` carrying Undo** in the shape **Remove** uses: `ui/undo-notice.ts`,
   guarded by the bytes the paste wrote.

**Placement.** There is no "paste as child" item. A paste lands as a sibling of
the row whose menu it came from, in the same list. `reparent.ts`'s depth cap
(`canReparent`, two deep) is checked there with its existing sentences.
`reparent.ts`'s rules are called, not changed. One helper,
`dropIllegalEmptyChildren`, is exported so a pasted subtree carrying a
hand-written `children: []` two deep is cleaned the way a move cleans one. The
rule itself is untouched.

*Finding: "directly after the row" holds in a tab set and not on a placed
grid.* The tree lists each level in **grid reading order** (`walkComponents`
sorts by `row`, then `col`), not in file order. On a placed grid, a copy can
sort directly after its row only by overlapping the components below that row,
or by moving them. So a paste on a placed grid is **spliced into the file
directly after the row, and placed where an insert and a reparent place a
component**: column 1, on the first free grid row (`nextFreeRow`). Its tree row
is therefore the last in its level, and its cell is at the foot of that grid. In
a container that shows one child at a time (a Tab set), every child carries the
container's own position, so the sort is stable and file order is tree order: the
copy is the next tab after the row. **Consequence for the Alt+Right claim:**
Alt+Right on the copy moves it into its *previous sibling in the tree*. That is
the row the menu came from only where that row was the last in its level, or in
a Tab set. Otherwise it is whichever container sits last. The chord exists as
described (`tree-moves.ts`, `into`: previous sibling, checked by `canReparent`),
but "one Alt+Right away" is true only in those cases. A drag onto any container
row always works.

*Incidental finding, outside this feature:* the same ordering fact means **Move
up** and **Move down** reorder the file's list while the tree and the sheet read
grid position. On a placed grid a reorder can therefore change nothing visible.
`threeLeaves()` in `layout-editor.test.ts` places A, B and C on one row at
columns 1, 3 and 5, and the case "reorders from the menu" asserts only the
stored order. This has not been confirmed in the harness. It is reported, not
fixed here.

**The contract does not grow.** No `ComponentDefinition` member, no
`ConfigFieldSpec` kind, no `RenderContext` member. The rewrite reads the
existing `formulaFields`, and Paste configuration reads the existing
`configFields`. **Nothing new is published to formulas.** **Constraint 3**: a
paste is an ordinary layout edit through `serialiseLayout`. The clipboard text is
a new format, and it is only ever read, never round-tripped into a file as
written (Data and file model). **Constraint 4**: no character note is read or
written. The exposure a pasted label raises is the insert path's, and it is
recorded separately (§ Deliberately not doing).

## What it does

A component row's menu gains **Copy**, **Paste** and **Paste configuration**.
Copy puts the component, and everything inside it, on the clipboard. Paste puts
a working copy beside any row in this layout or another. The copy is renamed
only where its names are taken, and its formulas still point at their own
copies. When the paste came from another layout, the author is told which names
and declarations to check. Paste configuration turns one component into another's
twin without touching its name, place or contents. Both are also Mod+C and Mod+V
on a focused tree row, and a device that cannot read the clipboard pastes through
a box. Every paste is undone in one step.

## Smallest version

The three menu items on component rows, over the system clipboard, with the
reference rewrite, one undo step, and the cross-layout `Notice` naming up to five
things to check, or a count beyond five. **Approved scope is this plus the paste
box (§7) and the keyboard route (§2).** **It gives up** a panel report, so past
five things the list is written nowhere, and pasting into an empty layout, since
the Layout row gets no menu and takes no Mod+V.

## Design

### §1. The menu

The row menu (`tree-moves.ts`, still the only importer of `Menu`) gains a third
section, in the place `layout-editor-tree.md` §5 reserved for it:

| Item | Icon | Disabled when | Does |
| --- | --- | --- | --- |
| **Move up** / **Move down** | as shipped | | |
| *separator* | | | |
| **Move into …** / **Move out of …** | as shipped | | |
| *separator* | | | |
| **Copy** | `copy` | never | writes the clipboard (§3) |
| **Paste** | `clipboard-paste` | never | reads the clipboard, pastes after this row (§4) |
| **Paste configuration** | `paintbrush` | never | reads the clipboard, applies it to this row (§6) |
| *separator* | | | |
| **Remove** | as shipped | | |

- **No item is ever disabled here**, and that is decision 5 extended to Paste
  for the same reason: whether there is something to paste is only known by
  reading the clipboard. A press that finds nothing usable says so in place
  (§8).
- **Naming follows `UI.md` §6's rule.** The menu is reached through a button
  already named `More options for "Weapons"`, so Copy names no one. The paste
  items would name the other party, the clipboard's contents, which cannot be
  known without the read the menu must not make, so they name no one either.
  "Paste configuration" and not "Paste settings": the pane calls it the
  configuration panel, and the settled answer uses this word.
- **`paintbrush`** is the format painter, which is Office's and Gutenberg's own
  metaphor for the same gesture. It should be checked in the calibrated glyph
  set; `harness/stub-icons.test.ts` fails on a glyph the stub cannot draw.
- **The Layout row is unchanged**: no menu, as `layout-editor-tree.md` §1
  decided. So an empty layout cannot be pasted into until it holds one
  component (§ Deliberately not doing).

### §2. The keyboard

**Mod+C and Mod+V copy and paste while a tree row's name button has focus**,
beside the four Alt+arrow chords. **Paste configuration has no chord.** It is
the rarer gesture, and every plausible chord is taken: Mod+Shift+V is paste as
plain text in Chromium, and Obsidian's editor binds it too. The research's
editors (Figma, Excel, Canvas) all copy and paste from the keyboard. The deciding
argument is local, though. **The `paste` DOM event hands over the clipboard's
text synchronously, with no permission prompt**, on every platform including
iOS with a hardware keyboard. So the keyboard route is also the most reliable
read this feature has, and it is how the harness drives a paste (§10).

- **Listened for as `copy` and `paste` events, not as keydowns.** On a focused
  `<button>` with no selection, Chromium dispatches both to `<body>`, not to the
  button (the Clipboard API's target rule for a non-editable focus). So the
  listener is on the pane's own document, registered through the view's
  `registerDomEvent` (`PATTERNS.md` §5, which keeps it working in a popout). It
  acts only when that document's `activeElement` is one of *this* pane's tree
  name buttons. It then calls `preventDefault()` and reads `clipboardData`.
- **A build-time branch, decided by vault check step 1 before anything else in
  §2 is built.** The builder presses Mod+C and Mod+V on a focused name button in
  the real app, with a temporary logging listener on the document.
  - **Branch A, the events arrive:** build the event route above.
  - **Branch B, they do not** (Obsidian's Electron menu may swallow them for a
    non-editable focus): build a `keydown` listener on each name button instead,
    matching Mod+C and Mod+V (`Platform.isMacOS` ? `metaKey` : `ctrlKey`, with
    no Alt or Shift). It calls the same `copyComponent` and `pasteAfter` the
    menu calls, through the same async `writeClipboard` and `readText`,
    including the fallback to the paste box when `readText` fails. Everything
    else in §2 holds in both branches (declaration, one route in, no chord for
    Paste configuration). What branch B gives up is the permission-free read,
    so on a device where `readText` fails even a keyboard paste goes through the
    box, and the harness drives a keyboard paste with a stubbed `readText`
    rather than a `ClipboardEvent`.

  The branch taken is recorded in this doc's Design §2 during the build, and the
  acceptance criterion for the keyboard names both.

  **Built: branch A for both chords, on the vault check.** The owner ran step 1
  in the real app on macOS desktop, twice:
  - **The first run looked like Cmd+C worked and Cmd+V did not**, so paste was
    moved to a `keydown` (branch B). After that change neither chord did
    anything.
  - **A console probe on a fresh tab then showed the real mechanism.** After a
    click on a row's name, `document.activeElement` was `<body>`, not the name
    button. Both the `copy` and the `paste` event reached the document,
    unprevented. The handler returned because focus was not in this pane's tree.
  - **The cause: a click does not focus a `<button>` in Chromium on macOS or in
    WebKit.** The redraw that selecting makes therefore had no focused control
    to restore, and focus fell to the body. The first reading ("no `paste`
    event arrives") was that same focus loss.
  - **The fix is at the cause.** A press on a tree row now puts focus on its
    name before it selects (`tree.ts`, `renderRow`), so the redraw carries focus
    to the rebuilt button. The pane case "puts focus on a row's name when it is
    clicked" goes red without it.
  - **With focus fixed, both chords are events again** (branch A):
    `LayoutEditorSection.clipboardEvent`, registered for `copy` and `paste` on
    the pane's document in `LayoutEditorView.onload` through `registerDomEvent`,
    finding the row through `tree.ts`'s `clipboardRow`. One mechanism for both
    is what the evidence supports. The `paste` event's `clipboardData` is also
    synchronous with no permission prompt, which a `keydown` through `readText`
    is not. The Mod+V `keydown` and `isPasteChord` are gone.
  - **Confirmed in the real app:** on the owner's third run of step 1, with
    this build, Cmd+C and Cmd+V both copy and paste from a clicked row's name.
- **One route in** (`PATTERNS.md` §6): the chord and the menu item call the same
  `copyComponent` and `pasteAfter`. Only the source of the text differs:
  `clipboardData` from the event, `navigator.clipboard.readText()` from the
  menu.
- **Declared** in the name button's `aria-keyshortcuts`, as `Control+C
  Control+V` (`Meta+C Meta+V` on macOS), added to the four move chords. The
  `title` hint is unchanged: Mod+C and Mod+V are the one pair nobody needs
  telling.
- **The Layout row's name button takes neither chord**, matching its having no
  menu.

### §3. Copy

1. Serialise the row's config, children included, into the wrapper (Data and
   file model). The root's `width` and `height` are written as
   `innerPlacement(config, parent)`, the size it is actually drawn at. A tab's
   stored size may be stale, and the copy may land on a placed grid where that
   size governs. This is the same reason `reparent` gives for the same
   correction.
2. Compute the report-only context over the source layout.
3. Write the text with `container.win.navigator.clipboard.writeText`.
   - Success: `Copied "Hit dice" to the clipboard.` This is `layout-file-row.ts`'s
     sentence, naming the component.
   - Failure: `Could not copy to the clipboard.`

**This is the third writer of that failure sentence**, and `layout-file-row.ts`'s
comment names the third caller as the point to revisit. With three callers, what
is shared is the write plus the failure sentence, while each keeps its own
success sentence. So `ui/clipboard.ts` takes `writeClipboard(win, text):
Promise<boolean>`, which shows the failure `Notice` and returns whether the text
was written. `copyable-name.ts` and `layout-file-row.ts` move onto it. This is
`PATTERNS.md` §1's one-step tier at three consumers. `ui/` rather than `editor/`,
because `copyable-name.ts` is the one consumer that could reach a sheet.

Copy writes nothing to the layout: no `persist`, no undo step.

### §4. Paste

Pressing **Paste** on row R, or Mod+V with R's name focused:

1. **Read.** The event's `clipboardData.getData('text/plain')`, or
   `readText()`. Where `readText` is missing or rejects, open the paste box
   (§7). A read that returns text goes on to step 2, whatever the text is.
2. **Validate the text** (`parse/component-clipboard.ts`, `readComponentCopy`),
   which returns a union and never throws (`PATTERNS.md` §4). A refusal
   writes nothing and is shown in place (§8).
3. **Decide where it lands.** The destination is R's parent, which is the top
   level for a top-level row. `canReparent(layout, copy,
   parent)` is asked with the detached copy. It needs only the target to be in
   the layout, and it reads the copy's own subtree depth. On refusal, its
   sentence is shown under R and nothing is written.
4. **Name.**
   - First, every copied id and label that is free in the target is reserved as
     written.
   - Then, in walk order, each colliding one takes `migrateId(id, taken)` or
     `uniqueLabel(label, all)`. `taken` holds every id in the target, every id
     already reserved or assigned in this paste, and **every outside name the
     copy reads**. That last part is a rule the settled answer did not state. It
     guards the capture case: a copy of `hp` that reads the source's `hp_2`,
     pasted where `hp` is taken and `hp_2` is free, would otherwise take `hp_2`,
     and its own formula would silently start reading itself.
   - Labels are checked against the whole layout, not the destination list, as
     `insert` does, because a label keys a note section and containment scopes
     nothing.
5. **Rewrite** every expression in the copy (§5 below: `renameNames`) with the
   map of ids that changed. Within one layout, that is every id in the copy.
6. **Place.** On a placed grid: `col: 1`, `row: nextFreeRow(list)`, with the
   root's copied `width` capped at the destination grid's width (the layout's
   `columns`, or the container's own width) and `height` as copied. In a
   one-at-a-time container: `{ ...parent.position, col: 1, row: 1 }`, exactly as
   `insert` writes a tab. The children keep their own positions, which are
   relative to the copied root's grid. Clean empty `children` lists with
   `dropIllegalEmptyChildren(copy, landingDepth)`.
7. **Check the whole result before touching the pane.** Build the candidate on a
   clone of the layout (`parseLayout(serialiseLayout(layout))`), splice the copy
   in after R, and run `parseLayout(serialiseLayout(candidate))`. A refusal
   writes nothing, and the pane's layout is left as it was. That matters because
   `persist`'s own contract is to *keep* an invalid state in memory and save it
   once it is corrected. That is right for a field edit and wrong for a paste,
   which has no field to correct.
8. **Commit.** Adopt the candidate, select the pasted root, flash its tree row
   (the picker's insert flash), and send focus to its name button
   (`edit-<new id>`). Then `persistUndoable(sentence)`.

**The `Notice`**, with Undo, `UNDO_TIMEOUT`, and the removal's byte guard. The
member `TreeHost.persistRemoval` becomes `persistUndoable`, since its only
behaviour, a guarded undo offer, was never about removal:

| Case | Sentence |
| --- | --- |
| a leaf | `Pasted "HP 2".` |
| a container | `Pasted "Defences 2" with the 3 components inside it.` (`the component inside it` for one) |
| cross-layout, nothing to report | `Pasted "Hit dice" from "5e 2014".` |
| cross-layout, up to five things | `Pasted "Hit dice" from "5e 2014". Check what these mean here: the "long rest" reset, mod(), prof.` |
| cross-layout, more than five | `Pasted "Hit dice" from "5e 2014". 7 things it depends on may differ here, so check its formulas and resets.` |

- **The second sentence directs only to what exists.** The five-or-fewer form
  names each thing. The count form points at the pasted component's formulas and
  reset bindings, which are fields in its configuration panel today, and not at
  a list, since none is drawn.
- **Each thing is spelled by its kind**, in plain text because a `Notice` has no
  code type. An outside name is bare (`prof`). A function has parentheses
  (`mod()`). A reset binding is `the "long rest" reset`. A modifier definition
  left behind is `the "Ring of protection" modifier`. **Order**: resets, then
  modifier definitions, then functions, then names, so the Hit Dice case, where
  every name resolves and only the binding is wrong, leads the sentence.
- **"Things" counts distinct items** (§5), not occurrences: `prof` read by three
  formulas is one thing. A reset binding always counts, whether or not its
  trigger resolves (decision 4).
- **The budget**: the §13 copy-budget entry's rule, a line spent only where it
  names something real, is kept by the cap at five. The longest five-item
  sentence with realistic names is about 150 characters, under the 12-second
  `UNDO_TIMEOUT`'s reading time.

### §5. What a cross-layout copy depends on

**Computed** by `editor/paste-dependencies.ts`, which is pure and imports only
the registry, on the `reparent.ts` precedent. The input is the copy (with its
original ids), the context carried with it, and the target layout. The output is
a list of **things**, each belonging to one group. The `Notice` (§4) names them,
or counts them past five. All six groups were accepted by the owner:

| Group | Thing, as the `Notice` spells it | Listed when |
| --- | --- | --- |
| Resets | `the "long rest" reset` | **every** binding the copy carries, whether or not the target declares its trigger |
| Changed by a modifier definition left behind | `the "Ring of protection" modifier` | a source definition whose change targets a copied component |
| Calls a function defined differently here | `mod()` | a call whose definition line differs from the source's |
| Calls a function not defined here | `mod()` | a call the target's library lacks |
| Reads a name another component has here | `prof` | an outside name the target publishes (the silent case) |
| Reads a name nothing here has | `dex_mod` | an outside name the target neither publishes nor defines as a function |

- **Each thing also carries its detail**, for the tests and for a later surface
  that could show it: a binding's action and `to` and whether its trigger is
  declared here, a definition's source targets and whether one of that name is
  here, and a function's two definition lines. Nothing draws the detail in this
  scope. It is computed so that the one test fixture can assert the decision-4
  promise, that every binding is named with its action and `to`, and so the cut
  panel can be added later without re-deriving anything.
- **An outside name** is the first segment of a name token that is not a call,
  not `true` or `false`, not `self`, and not the `mod` prefix (for `mod.` the
  second segment is the one read). It is also not a copied id, and **not a name
  the component's own scope answers before the sheet does**: `value`, and the
  row names `formula/vocabulary.ts`'s `rowNamesOf` lists for that component.
  **The rewrite in §4 step 5 uses the same exclusion.** A row name equal to a
  copied id never meant the component, so rewriting it would change what the
  formula reads. A known limit, accepted: the per-row arguments of
  `sum(other, …)` are evaluated over `other`'s columns, and the rewrite does not
  model *that* scope, so a copied id equal to a column key of an aggregated table
  would be rewritten there.
- **A function defined identically in both layouts drops out.** A name the
  target resolves is listed even where it probably means the same thing, since
  the target cannot tell, and hiding "probably the same" is the Retool trap in
  reverse.
- **Paste configuration** computes the same list over the one component.
- **Within one layout nothing is computed**, and the `Notice` has no second
  sentence when the list is empty.

### §6. Paste configuration

Pressing **Paste configuration** on row T:

1. **Read and validate** as §4 steps 1 and 2.
2. **Same type**, or refuse under T: `The clipboard holds a Pool, and "Hit dice"
   is a Track. Paste configuration only goes onto a component of the same type.`
   Types are named with `componentDisplayName`, not `configName`. The check is
   on `type`, so a Dropdown's configuration may go onto a plain Card, both being
   `card`, and the result is a Dropdown.
3. **Apply**: for every key in the type's `configFields`, the source's value
   (deep-copied) where it has one, and the key **deleted** where it has none. Then
   the source's `reset`, or no `reset` where it has none. The target's
   configuration becomes the source's, and "only the keys the source sets" is
   refused, because it would leave a mixture neither component had. Keys the
   target holds that its type does not declare, and every editor-owned key other
   than `reset`, are untouched. **Children are untouched**, including when the
   source was a container that had some.
4. **Rewrite**: the source's own id becomes T's id in every expression, and
   nothing else changes. The copy *is* T now, so this is decision 2 applied to a
   copy of one. Outside names stay as written.
5. **Check and commit** as §4 steps 7 and 8, keeping T selected and focusing
   T's name button. The `Notice` reads `Pasted the configuration of "Hit points"
   onto "Temp HP".`, then the entry-key sentence below where it applies, then
   the cross-layout sentence exactly as a paste has it.
6. **Say when a key that addresses stored data changed.** Such a key is found
   from the declaration the rename migration already reads, not from knowing
   any component: every `configFields` entry carrying `addressesEntry`. For a
   `text` field (Card's `key`, Passport's `nameKey`) it is the key before and
   after, each falling back to `whenBlank`. For a list field (a Card set's,
   Track's, Roster's, Passport's or Record set's entries) it is each entry
   `key` present before the paste and absent after. A key that is only added
   addresses nothing yet and is not mentioned. Where any key left, the `Notice`
   adds:
   - up to five keys: `Character notes keep any values stored under "STR" and
     "DEX", which no longer show. Undo brings them back.`
   - more than five: `Character notes keep any values stored under the 7 keys
     that changed, which no longer show. Undo brings them back.`

   "Any", because the paste reads no note and cannot know whether one holds a
   value there. No migration runs: this is a replacement, not a rename, and
   rewriting notes to follow it would move one entry's value under another
   entry's name. **Undo** does bring them back, because the layout's old key
   makes the note's unmapped value mapped again (§10).
7. **A paste that changes nothing** (T already holds that configuration) writes
   nothing and says so under T: `"Temp HP" already has this configuration.`

### §7. The paste box

Where the menu's `readText()` is unavailable or rejects, Paste and Paste
configuration open a small `Modal` titled **Paste a component**. It holds one
`Setting` named **Copied component** with a six-row textarea (placeholder `Paste
the copied component here`), and a second row with **Cancel** and a **Paste**
button, disabled while the box is blank. That is the **New layout** modal's
**Pasted JSON** row and button row, rebuilt rather than reused (finding under
decision 6).

*Amended in the build*, three additions this section did not name, each for a
reason:

- **The name** labels the textarea: a `Setting` row's name is what a reader
  and a screen reader take the field to be, and a bare textarea has none.
- **A description**, `The clipboard could not be read on this device, so paste
  the copied component here. It is checked before anything is written.`: the
  box appears after a press of **Paste** that did not paste, so the first
  sentence says why it is there, and the second is the **Pasted JSON** row's own
  promise.
- **Cancel**, on the **New layout** modal's own button row: the reader this box
  exists for is on a phone, where Escape is not a key they have.

The modal remembers which row and which of the two pastes
opened it. **Paste** runs §4 or §6 from step 2, with the box's text. A refusal is
shown under the textarea through `field-error.ts`'s line, and the box keeps its
text. It lives in `editor/paste-box.ts` beside its one consumer, on the
`NameModal` precedent. **No platform sniffing**: the box opens because a read
failed, never because `Platform.isMobile` is true, so a device where the read
works never sees it.

### §8. Empty and error states

Every refusal is a line under the row the gesture came from, drawn by the tree's
existing `showMoveError` (`role="alert"`). From the paste box it is under the
textarea. Nothing is written in any of these cases.

| State | Sentence |
| --- | --- |
| the clipboard holds no wrapper, or is empty | `The clipboard holds no Sheetsmith component. Copy one from a row's menu first.` |
| a wrapper from a newer version | `This component was copied from a newer version of Sheetsmith. Update the plugin to paste it.` |
| a wrapper whose component will not parse | `The copied component cannot be pasted: <parser's own sentence>` |
| depth | `canReparent`'s own sentence, unchanged. It says "moving … here", which reads acceptably for a paste, and the settled answer keeps the existing messages. |
| different type (Paste configuration) | §6 step 2 |
| no change (Paste configuration) | §6 step 7 |
| a layout that will not parse, or none | no tree and no menu, as today |

A clipboard read that fails is not an error state: it opens the box (§7). A
clipboard *write* that fails is the `Notice` in §3.

### §9. What the pane's host gains

- `TreeHost`: `copy(entry)`, `paste(after: WalkEntry, row)`,
  `pasteConfiguration(entry, row)`, and `persistRemoval` renamed to
  `persistUndoable`. `row` is the `Setting` a refusal is drawn under. The
  clipboard I/O lives on `LayoutEditorSection`, which owns the container's
  window and the undo guard, and `tree-moves.ts` stays the one place a menu
  item is decided.
- The pure work is in four new modules, each with its own test file (`PATTERNS.md`
  §2, tests beside code):
  - `formula/rename-names.ts`: `renameNames(source, renames, local)`, over
    `nameSpans`.
  - `parse/component-clipboard.ts`: `encodeComponentCopy` and
    `readComponentCopy`.
  - `editor/paste.ts`: `pasteComponent` and `pasteConfiguration`, each over a
    layout clone, returning `{ layout, root, dependencies } | { error }`.
  - `editor/paste-dependencies.ts`: the things a cross-layout copy depends on.

  One module draws: `editor/paste-box.ts`.

### §10. Harness and stub

- **A clipboard fixture** in `harness/samples.ts`: a wrapper copied from a
  second layout (a Track with a `long rest` binding whose `to` is a formula; it
  reads one name the default layout publishes for something else and one it does
  not; it calls a function the default layout defines differently; and a source
  definition targets it), which gives a five-thing `Notice`. Plus a leaf-heavy
  one that produces more than five things.
- **New `PaneView` option** `paste=<id>:<fixture>[:config]`. It focuses that
  row's name button and dispatches a `paste` `ClipboardEvent` carrying the
  fixture in a `DataTransfer`. That is the keyboard route, and it needs no
  clipboard permission in headless Chrome. `self` has the pane copy that row
  first, through its own `copy` event. `:config` presses the Paste
  configuration route instead, through the menu, with a stubbed `readText`.
- **The harness draws no `Notice`** (a standing BACKLOG row), so the paste's
  sentences are asserted by tests through `Notice.messages`, not by shots.
- **The stub**: `obsidian-stub.ts` gains nothing for `Menu`. Tests replace
  `win.navigator.clipboard` with a fake whose `readText` can resolve, reject or
  be absent, and `Notice.messages` carries the sentences.
- **Shots** are listed under Acceptance criteria.

**Vault check** (the throwaway vault; `docs/features/layout-editor-tree.md`'s
fixture recipe is enough, plus the DnD 5e Standard layout the memory index
describes and one other layout with a `long rest` trigger and a different `mod`
line). Press, in order:

1. **First, before §2 is built**: with a name button focused and a temporary
   logging listener on the document, press Mod+C then Mod+V (desktop). Whether
   the `copy` and `paste` events arrive picks §2's branch A or B. Record which.
   *Run on macOS desktop: both events arrive at the document. The first run's
   apparent failure was focus falling to the body after a click on the row's
   name, now fixed (§2 records it). Re-run on the fixed build: Cmd+C and Cmd+V
   both work.*
2. Copy a Group holding a Card whose formula reads a sibling in the Group. Paste
   it in the same layout, and see "… 2" with the formula pointing at the copied
   sibling.
3. Copy a Track with a `long rest` binding from one layout, open the other,
   paste, and read the `Notice`: the "long rest" reset leads it.
4. **Undo** from the `Notice`, and see the layout's bytes restored.
5. Paste configuration from a Card set with keys STR and DEX onto one with STR,
   DEX and CON, open a character on that layout, and see CON's value gone from
   the card, the sentence naming "CON", and **Undo** bringing it back.
6. On a phone: press **Paste** from the menu. Record whether `readText` works or
   the box opens, and paste through the box if it does. This is the device test
   decision 6 defers to.

## Config fields

None. This changes the editor's own chrome and adds no component configuration.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |

## Data and file model

**The clipboard text**, a new format that is only ever read. It is not a vault
file and never written into one as written:

```json
{
	"sheetsmith": "component",
	"version": 1,
	"from": { "layout": "5e 2014", "fingerprint": "9e3c41a7" },
	"component": { "id": "hit_dice", "type": "track", "label": "Hit dice", "position": { … }, "reset": [ … ], "children": [ … ] },
	"context": {
		"functions": { "mod": "mod(score) = floor((score - 10) / 2)" },
		"definitions": [{ "name": "Ring of protection", "targets": ["Armour class"] }]
	}
}
```

- `component` is spelled the way `serialiseLayout` spells a component, with tab
  indentation, so a person reading the clipboard reads a layout fragment.
- **`from` carries no vault name and no file path**, and privacy is the reason.
  Clipboard text leaves the vault by design: it gets pasted into a chat, an
  issue or a forum post when someone shares a component. A vault's name and a
  layout's folder path say things about a person's files that sharing a
  component does not need to say. So `from` holds two things:
  - `layout`: the layout's basename, for display ("from "5e 2014"").
  - `fingerprint`: **FNV-1a, 32-bit, over the UTF-16 code units of the vault
    name, a U+0000 separator, and the file's vault path**, written as eight
    lowercase hex digits. It is computed by `layoutFingerprint(vault, path)` in
    `parse/component-clipboard.ts`, which is synchronous, pure and a dozen lines
    with no dependency, so it can live in `src/parse/` (Constraint 5).
    `crypto.subtle.digest` is refused because it is async, and the copy's write
    and the paste's same-layout check would both have to await it for no gain,
    since this is not a security boundary.
- **What the fingerprint is and is not.** It keeps the name and path out of
  sight of someone reading the pasted text. It is not a secret: someone who
  already guesses both could confirm the guess by hashing them. That is
  accepted, because the aim is not publishing a path, not resisting a targeted
  guess. It is stated here so nobody later mistakes it for encryption.
- **Same layout** means `from.fingerprint === layoutFingerprint(app.vault.getName(),
  file.path)` for the pane's file. Anything else is cross-layout, including the
  same file renamed or moved between the copy and the paste, which only makes
  the `Notice` list things it did not need to.
- **Known edge**: a false "same layout" suppresses the `Notice`'s second
  sentence. That happens with two vaults of the same name holding a layout at
  the same path, or with a 32-bit collision between two different layouts
  (about one in four billion for a given pair). It is accepted: the paste itself
  is still correct in both cases, because naming and the rewrite never depend
  on this check. Only the noise suppression is wrong.
- `context` is **report-only**. It is never merged, never written, and ignored
  within one layout. A missing or malformed `context` degrades the list (a
  function is listed only when the target lacks it, and no modifier definitions
  are listed) and never refuses the paste.
- `version` is checked first. A newer version is refused with an update
  sentence, and an unknown key at version 1 is ignored.
- **Validation**: `component` goes through `parseLayout` as the single
  component of a throwaway layout, which checks every shared key, the reset
  shape and the depth rule. Then the whole candidate is parsed as in §4 step 7.

**The layout**: a paste adds components, and Paste configuration replaces one
component's declared keys and `reset`. No new key, and no change to
`serialiseLayout`. Layout-level declarations are never touched.

**Character notes**: never read or written. Two consequences are stated rather
than mitigated:

- **A pasted label can match a section a character note retains** (§10: a
  removed component's section stays), so a pasted, or inserted, component may
  draw that old data. This is the insert path's exposure, and paste inherits it.
  It is recorded as an open question in `SPEC` §13, "Whether a new component may
  adopt a section a character note retained", and is not solved here.
- **Paste configuration can change a declared entry key** (a Card set's
  `entries[].key`, for example). Unlike a field edit, it is not a rename, so no
  migration runs. The values stored under the old key stay in the note as
  unmapped data (§10) and stop showing until the configuration is undone or the
  key is typed back. Nothing is lost, and the `Notice` says so, naming the keys,
  with the Undo that restores them (§6 step 6).

## Acceptance criteria

**Behaviour** (new modules' cases beside them; pane cases in
`src/editor/layout-editor.test.ts`, per the BACKLOG row on the extracted
modules)

- [x] `nameSpans` returns each name token's text, start, end and call flag, and
      `null` for text that does not tokenize. `expression.test.ts` covers dotted
      names, `mod.` names, calls, and whitespace.
- [x] `renameNames` rewrites a bare name, a dotted name's first segment, a
      `mod.` name's second segment, and the first argument of `sum(` and
      `count(`. It leaves calls, `self`, `true`/`false`, local names, unmatched
      names and every other byte untouched. Untokenizable text comes back
      unchanged.
- [x] A copy of a Group holding two Cards, one reading the other, pasted in the
      same layout, yields "<Group> 2" holding "<Card> 2" and "<Card> 2", with ids
      suffixed and the reading Card's formula pointing at the copied sibling. A
      formula reading a component outside the Group still reads the original.
- [x] A reset binding's `to`, a Table's `columns.*.formula` and
      `rows.*.values.*`, and a Track's `rows.*.count` are each rewritten.
      Driven over every registered component's `formulaFields`, with one
      expression per declared path.
- [x] Across layouts, a copy whose ids and labels are all free keeps every id
      and label exactly as written, including an id with capitals (`STR`).
- [x] A suffixed id never takes a name the copy reads from outside (the `hp` /
      `hp_2` capture case).
- [x] A paste on a placed grid lands in R's list, directly after R in the file,
      at column 1 on the first free row, with its width capped at the grid. In a
      Tab set it is the tab after R. A pasted tab copied from a Tab set onto a
      placed grid carries the size it was drawn at.
- [x] A paste `canReparent` refuses writes nothing (bytes unchanged, undo stack
      unchanged) and shows `canReparent`'s sentence under R.
- [x] Each refusal in §8 writes nothing, leaves the pane's layout object
      untouched, and shows its sentence under the row or in the box.
- [x] A paste is one undo step. The `Notice`'s **Undo** restores the pre-paste
      bytes, and after an intervening edit it refuses with the "has changed
      since" sentence.
- [x] The `Notice` sentences in §4's table, each asserted through
      `Notice.messages`, including the five-or-fewer form (things in §4's
      order and spelling) and the more-than-five count form. Neither sentence
      mentions a list or "its settings".
- [x] Within one layout nothing is computed and the `Notice` has one sentence.
- [x] Across layouts, `paste-dependencies` produces each group of §5's table
      from a fixture built to hit each once, counting a name read twice as one
      thing. It produces no bonus-type group. It lists every reset binding, with
      its action and `to` in the thing's detail, including one whose trigger the
      target declares. A function defined identically in both layouts is not
      listed.
- [x] Paste configuration applies the source's declared keys and `reset`,
      deletes declared keys and `reset` the source lacks, leaves `id`, `label`,
      `position`, `children` and undeclared keys untouched, and rewrites the
      source's own id to the target's.
- [x] Paste configuration onto a different type is refused naming both types.
      Onto an identical configuration it writes nothing and says so.
- [x] Paste configuration that removes entry keys (`addressesEntry`: a list
      field's entry `key`, or a `text` field's key with its `whenBlank`) adds
      the entry-key sentence naming them, up to five, or counting them past
      five. One that only adds keys, or changes no addressing key, adds none.
      Undo restores the layout's old keys, and a character note's value under
      one renders again (driven through a real Card set).
- [x] Neither paste item is ever disabled, whatever the clipboard holds, and
      opening the menu makes no clipboard read (the fake's `readText` is not
      called).
- [x] Where `readText` is absent or rejects, the paste box opens. Its **Paste**
      runs the same paste and a refusal shows under its textarea.
- [x] The Layout row still has no menu and takes neither chord.
- [x] Mod+C and Mod+V on a clicked name button copy and paste through the
      `copy` and `paste` events (§2's branch A, as recorded). A press on a row
      leaves focus on its name, so the chords find it. The same gesture with
      focus elsewhere in the pane, or in another pane, does nothing. The name
      button's `aria-keyshortcuts` carries both.
- [x] Copy writes the wrapper with `version: 1`, `from: { layout,
      fingerprint }`, `component` and `context`, and its `Notice` names the
      component. A rejected write shows `Could not copy to the clipboard.`
- [x] The clipboard text contains neither the vault name nor the layout's
      folder path (asserted by searching the written text for both).
- [x] `layoutFingerprint` returns eight lowercase hex digits, is stable for
      one vault name and path, and differs when either changes. A known FNV-1a
      32-bit vector is pinned in its test. A paste whose fingerprint matches the
      pane's file is treated as same-layout, and a renamed file as
      cross-layout.
- [x] `ui/clipboard.ts`'s `writeClipboard` is the only clipboard write in
      `src/`, and `copyable-name.ts` and `layout-file-row.ts` keep their success
      sentences.
- [x] `npm test`, `npm run lint` (`--max-warnings 0`) and `npm run build` pass.

**Look** (harness PNGs, both themes unless named)

- [x] `editor-tree-menu` (re-shot, light): the menu with the third section,
      Copy, Paste and Paste configuration, between the moves and **Remove**,
      with separators on both sides.
- [x] `editor-paste-landed` (light): a same-layout paste of `Proficiencies`,
      with "Proficiencies 2" selected at the foot of the top level with its
      children, and the panel on it.
- [x] `editor-paste-cross`: the cross-layout fixture pasted after a row in the
      default layout. The copy is selected at the foot of its level, with ids
      kept where free, and the panel shows the pasted Track's reset binding as
      it came.
- [x] `editor-paste-refused` (both themes): Paste configuration of a Pool onto
      a Track, with the refusal line under the Track's row.
- [x] The frame still fits the tree grown by a pasted container: the paste
      views take `PASTE_FRAME` (1500×18000), measured in the design wave, since
      `EDITOR_FRAME` cut the landed paste at 16800.

**Docs**

- [x] `SPEC` §7's tree paragraph gains copy, paste and paste configuration, and
      the two chords. The open §13 entry "What a pasted component carries, and
      what its names mean where it lands" is moved to a `Resolved:` line by
      `/land-it`.
- [x] `docs/features/layout-editor-tree.md` § Deliberately not doing's first
      bullet points here.
- [x] `tree.ts`'s header and `tree-moves.ts`'s header describe the third menu
      section and the two chords.
- [x] This doc's Design §2 records which branch the build took.
- [x] `uniqueId`'s stale `COMPONENT_ID` reference names `migrateId`.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. **`feat: Say where each name sits in a formula`.** `nameSpans` in
   `formula/expression.ts`, `formula/rename-names.ts`, and both test files.
2. **`feat: Read and write a copied component as clipboard text`.**
   `parse/component-clipboard.ts` (the wrapper and `layoutFingerprint`) and its
   tests, with `migrateId` exported.
3. **`refactor: Share the clipboard write and its failure sentence`.**
   `ui/clipboard.ts`, and `copyable-name.ts` and `layout-file-row.ts` moved onto
   it, with nothing behaving differently.
4. **`feat: Copy and paste a component from the tree's menu`.** `editor/paste.ts`
   (`pasteComponent`), the Copy and Paste items, `persistRemoval` →
   `persistUndoable`, the `Notice`, and `dropIllegalEmptyChildren` exported.
   Within-layout and cross-layout pastes both work. The cross-layout `Notice`
   carries only its first sentence here.
5. **`feat: Say what a pasted component depends on in another layout`.**
   `editor/paste-dependencies.ts` and the `Notice`'s second sentence.
6. **`feat: Paste one component's configuration onto another`.** Paste
   configuration, its refusals, and the entry-key sentence.
7. **`feat: Copy and paste a tree row from the keyboard`.** §2's branch as
   recorded (the `copy` and `paste` listeners, or the `keydown` fallback) and
   `aria-keyshortcuts`.
8. **`feat: Paste through a box where the clipboard cannot be read`.**
   `editor/paste-box.ts`.
9. **`test: Show copy and paste in the harness`.** The fixtures, the `paste=`
   option and the shots.
10. **`docs: Record copy and paste in the layout editor`.** `SPEC` §7,
    `layout-editor-tree.md`, and the two §13 open entries already in the working
    tree (this feature's model question, which `/land-it` resolves, and the
    retained-section question, which stays open).

## Deliberately not doing

- **Retained sections.** A pasted, or inserted, component whose label matches a
  section a character note kept after a removal will read that section. This is
  the insert path's exposure, not paste's, and it is written up as an open `SPEC`
  §13 entry ("Whether a new component may adopt a section a character note
  retained"), with the evidence from `docs/features/component-rename-migration.md`.
- **The panel report**, cut at spec approval to the smallest version. That is
  §5's drawn half: `editor/paste-report.ts`, the section's `pasteReports`
  store, its **Dismiss**, and a `UI.md` §9 row for it. Past five things the
  `Notice` gives a count and the list is written nowhere. The computation stays
  (§5), with each thing's detail, so the panel can be added without re-deriving
  anything.
- **A Paste item on the Layout row, and Mod+V there**, cut at spec approval to
  the smallest version. `layout-editor-tree.md` §1 stands: the Layout row has no
  menu. An empty layout takes a component from the picker before it can be
  pasted into.
- **Carrying, merging or renaming layout-level declarations** (decision 4).
  Promoted fields (§9) are a fifth layout-level list, and they are neither
  carried nor reported: a promotion is the source layout's decision about its own
  characters' frontmatter, and a copy works without one.
- **A "paste as child" item, and paste landing anywhere but beside its row.**
  A drag or a move into a container follows.
- **Linked instances or a shared component library.** Layouts are duplicated and
  diverged, never inherited (`SPEC` §7, §11).
- **A chord for Paste configuration** (§2).
- **Rich or custom clipboard types.** Custom MIME types are Chromium-only, and
  iOS WebKit reads standard types only, so plain text is the one format every
  platform both writes and reads.
- **Cut.** Copy then **Remove** is two presses with an undo behind each.
  Nothing asked for it.
- **Multiple selection**, so copying several rows at once. The tree has one
  selection.
- **Fixing Move up and Move down against grid order** (the incidental finding
  under Model question). Reported to the owner.
- **The pane's narrow regime**, **moving the extracted modules' tests**
  (`docs/BACKLOG.md`), **the list reorder-control naming row**, **the canvas's
  drag and resize**, **`reparent.ts`'s rules**, and **anything sheet-side**.
