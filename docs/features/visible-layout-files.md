# Visible layout files

Status: shipped
Board card: A layout file is visible in the file explorer and in Notebook
Navigator, and opens into the layout editor pane when clicked.

*Why it matters: a layout is the one file a reader authors in this plugin, and
it is the one file they cannot see. It is a `.json` file in the layout folder,
and Obsidian lists no `.json` file in its file explorer, nor Notebook Navigator
in its default mode, unless **Detect all file extensions** is on. Where the
reader has turned that on, clicking a layout opens nothing of ours.*

## Model question

**The §13 entry "How a layout file becomes a file Obsidian shows, and what
renaming, moving or deleting one there means"**, opened with this spec and
settled with the owner before design. The `Resolved:` wording is `/land-it`'s,
once this is built. What follows is the argument and the answer, not a proposal.

No component is added, the component contract does not grow, and nothing new is
published to formulas. What the feature touches is the **layout file's** format
(its extension) and the **pane's** relationship to it (bound to a file rather
than to a name), and both are model questions in their own right.

### 1. The mechanism: the plugin's own extension, `.sheetsmith`

Three options were on the table:

- **Claim `json`** through `Plugin.registerExtensions`. It needs no migration,
  and it is wrong twice over. It claims every `.json` file in the vault, not only
  layouts, so clicking an unrelated data file would open the layout editor on
  it. And `json` belongs to single-purpose viewers that already claim it: the
  popular JSON viewers do, and `registerExtensions` **throws** where another
  plugin already owns the extension. So the plugin would fail to register on
  exactly the vaults where a reader has a JSON viewer installed.
- **Claim an extension of the plugin's own.** This is what every plugin with a
  document type of its own does: Canvas has `.canvas`, Excalidraw its own, and
  tldraw `.tldr`. It costs a migration of every existing layout file.
- **Document "Detect all file extensions" and nothing else.** The files show up
  in the explorer, and a click still opens nothing of ours. That does not meet
  the card.

**Ruled: `.sheetsmith`.** Not `.sheet` or `.layout`, which are generic enough to
be owned by another plugin already, and a taken extension is exactly the failure
the first option was refused for. The contents are unchanged: a `.sheetsmith`
file is the same JSON `parseLayout` reads today, so export still copies bytes,
import still takes pasted JSON, and a reader can still open one in any text
editor.

**Migration, which is where the cost lives:**

- **Reading is dual for this cycle.** `listLayouts` and every reader of the
  layout folder accept `.sheetsmith` and `.json`. Where both `X.sheetsmith` and
  `X.json` exist, **`.sheetsmith` wins**: the `.json` is listed nowhere,
  resolved by no name lookup, and never renamed, rewritten or deleted.
- **The rename is offered, never run silently.** Where the folder holds
  any `.json` layout, one `Notice` on load counts them and carries a
  **Convert** button, and a command does the same. **Those two are the only
  paths that convert**: no save, open or other gesture renames a layout, so no
  single layout can strand an older device behind the reader's back. Converting
  renames `X.json` to `X.sheetsmith` through `app.fileManager.renameFile`, so a
  link to the layout file follows the rename (`sheet-layout` is a plain string
  and is unaffected either way). It skips a name the folder already holds
  as `.sheetsmith`, and reports the count and any skips in one `Notice`. **It is
  not silent because it is not free**: a device still on an older version of the
  plugin reads only `.json`, and once the renamed files sync to it, every layout
  shows as missing. The `Notice` says so.
- **Every new file is `.sheetsmith`**: create, a starter install and an import.
  **Saving an existing file keeps its path**: the pane saving a layout it opened
  from `X.json` writes `X.json`, with no rename, for this cycle.
- **A name is taken if either extension holds it.** `createLayout` refuses `X`
  where `X.json` exists as well as where `X.sheetsmith` does, because writing
  `X.sheetsmith` beside a reader's own `X.json` would shadow their file with a
  new one under the precedence rule above. That would be Constraint 4 broken by a
  gesture that looked like it only added something.
- **Registration sits inside a try/catch.** If the extension is taken, one
  `Notice` says so, and nothing registered after it is skipped.
- **Unchanged:** the layout folder setting, export copying the file's bytes, and
  the starter sources in the repository, which stay `.json` because they are
  build inputs inlined by esbuild's json loader and never vault files (§3.2).

### 2. What rename, move and delete mean

Once a layout is visible, the file explorer offers rename, move and delete on it.
A layout's name *is* its file's basename, and every character note names that
basename through `sheet-layout`. §7 leaves rename unshipped because it would have
to migrate that key, and §10 declines to.

**Ruled: the pane is bound to the file, and character notes are not migrated.**

- **Rename in the file explorer.** The pane follows the file. Character notes
  are not rewritten: their sheets show the existing missing-layout message and
  its **Pick another layout** offer (§8). A rename of a layout in the layout
  folder shows one `Notice` counting the character notes that name the old name.
  It gives the count only and rewrites no note, so §10's decline stands. §7's
  rename *inside the pane* stays unbuilt, since the pane has no rename control
  and this feature adds none.
- **Move out of the layout folder.** The pane still opens the file, with a line
  saying no character can use it from there.
- **Delete.** The pane lets go of the file. Sheets on that layout show the
  missing-layout message.
- **The same layout open twice.** Both panes write straight to disk, and each
  reloads on the other's writes.

**Considered and deferred, not rejected: making `sheet-layout` a wikilink**, so
Obsidian's own rename propagation carries the key and a rename needs no
migration. It is a change to the *character note's* format, touching every note
and the reader that parses the key. That makes it a feature of its own rather
than a side effect of this one. (The `[[` suggester fix it would depend on for
plugin-registered extensions shipped in Obsidian 1.8.9, under this manifest's
`minAppVersion` of 1.9.0, so nothing here blocks it.)

### 3. What it stores, and existing notes

- **Character notes: nothing changes.** No note is written by any part of this
  feature. A note naming `X` resolves to `X.sheetsmith`, or to `X.json` where
  that is all there is, and a rename or delete leaves it on the missing-layout
  path it already has.
- **Layout files: the extension changes, not the bytes.** Conversion is a
  rename, so the contents are byte-identical before and after (Constraint 3).
  The pane's saves go through `serialiseLayout` exactly as today.
- **The `name` key inside a layout is not rewritten by a rename.** It is read by
  one path only, an import naming its new file after it, and that path already
  lets the reader type a name beside the paste. See **Deliberately not doing**.

## What it does

A layout is a `.sheetsmith` file that shows in the file explorer and in Notebook
Navigator like any note. Clicking one, or reaching it any other way Obsidian
opens a file, opens the layout editor pane on that layout. Existing `.json`
layouts keep working, and the plugin offers once per load to convert them.

## Smallest version

Register `.sheetsmith`, bind the pane to its file as a `FileView`, read both
extensions while creating new files only as `.sheetsmith`, and convert through the command
only. This gives up the load `Notice` (the command is the only way in), the
pane's reload on an outside change (so the last write wins, as it does today),
the rename count `Notice`, and refreshing open sheets on file events. Each is
marked **[separable]** below.

## Design

Parts marked **[core]** are the smallest version. Parts marked **[separable]**
can be cut without breaking what the core promises.

### Registration [core]

`main.ts` registers the view and then calls
`registerExtensions(['sheetsmith'], VIEW_TYPE_LAYOUT_EDITOR)`. The call lives in
a small `src/view/layout-extension.ts` rather than inline, so `main.ts` stays
lifecycle only. It is wrapped in a try/catch:

- **Taken.** One `Notice`: *Another plugin already opens .sheetsmith files
  (view "`<type>`"), so selecting a layout file will not open the layout editor.
  Run "Open layout editor" instead.* The view type comes from
  `app.viewRegistry.getTypeByExtension('sheetsmith')`, which is internal and
  untyped. It is reached through a narrow local interface, guarded, and the
  parenthesis is dropped where it answers nothing.
- **Nothing is skipped.** The call is the last in `onload`, and the catch also
  means an earlier placement could not stop the rest.
- Obsidian's `Plugin` unregisters the extension on unload, so a hot reload
  re-registers cleanly.

Where the extension is taken, the plugin still works: the pane opens layouts by
path (below), which needs no registration.

### The pane is a `FileView` [core]

`LayoutEditorView` extends `FileView` instead of `ItemView`:

- **`onLoadFile(file)` loads that layout.** `onUnloadFile` flushes pending edits
  to the file being left, then clears the undo and redo stacks. This is
  `releaseLayout`'s existing rule, moved from a name change to a file change.
- **`canAcceptExtension`** answers true for `sheetsmith` and `json`, so the one
  route that opens a `.json` layout (by path, below) is not refused.
- **`allowNoFile = true`**, so the pane has a state with no file in it: the
  vacant state (no layouts at all), and the state after its file is deleted.
- **`navigation` is `FileView`'s own `true`.** The shipped pane sets it false.
  It has to become true for Obsidian to treat the pane's leaf as one a file
  open may replace, which is what the owner's "follows Obsidian's normal rule for
  that leaf" asks for. **The cost:** clicking a *note* in the file explorer while
  the pane is the active tab now replaces the pane, as it would replace a note.
  Pinning the tab keeps it, as it does for any file.
- **State.** `getState` is `FileView`'s own `{ file: <path> }`. `setState` still
  accepts the shipped `{ layout: <name> }`, resolves it against the layout folder
  (`.sheetsmith` first, then `.json`), and loads that file, so a workspace saved
  by an earlier version reopens on the same layout. A legacy name resolving to
  nothing leaves the pane with no file.
- **Title.** `getDisplayText` is the file's basename, which Obsidian shows in
  both the tab and the view header. The basename is the layout's name as far as
  anything in this plugin is concerned: it is what `sheet-layout` must hold.
  The header stops reading "Layout editor". The `pencil-ruler` icon still says
  what kind of pane it is. With no file, the display text is "Layout editor",
  as today.

**The editor's host contract changes from a name to a file.** `LayoutEditorHost`
exposes `layoutFile: TFile | null` in place of `layoutName`/`setLayoutName`,
plus `openLayoutFile(file: TFile)`. The editor stops resolving "which file is
open" out of `listLayouts` by basename. It is handed the file, and it asks the
host to open a different one. That is what keeps the pane and the file one
binding: nothing inside the editor can switch layouts behind the view's back.

### Opening a layout [core]

- **From anywhere Obsidian opens a file**, which means the file explorer,
  Notebook Navigator, the Quick Switcher, a clicked link, `openLinkText` and
  `getLeaf().openFile`. Each of these resolves `.sheetsmith` to the pane through
  the registration and calls `onLoadFile`. The pane opens on that layout. It
  never opens a picker, never shows an empty editor, and never falls back to the
  last layout.
- **A pane already showing that file.** The plugin adds no reuse logic of its
  own. Where Obsidian's open-file handling focuses an existing tab on a file, it
  does so for a `FileView` because the view reports the file. The binding is what
  the plugin owes, and the reuse is Obsidian's. Whether each route reuses is a
  manual check in the app (below), because the stub cannot hold Obsidian to it.
- **A different layout file into a pane that holds one** follows Obsidian's rule
  for that leaf: it replaces the file, or opens a new tab on a modifier-click.
- **The pane's own dropdown** opens the chosen file *in the same leaf*, through
  `leaf.setViewState({ type: VIEW_TYPE_LAYOUT_EDITOR, state: { file } })`, for
  both extensions. `openFile` would resolve a `.json` by extension and find no
  view. **New layout** opens what it created the same way.
- **The pane's trash button** keeps its shipped behaviour (§7: "it ends with a
  different layout open"). After deleting, it opens the first remaining layout
  in the same leaf, or shows the vacant state where none is left. A delete from
  *outside* the pane is different, below.
- **"Open layout editor"**, from the command or the settings button, reveals the
  first open pane as today. With none open, it opens a new tab on the first
  layout in the folder, or on the vacant state where there is none.

### What the pane draws, by file [core]

The **Layout file** dropdown lists the folder's layouts, `.sheetsmith` and
unshadowed `.json` together, sorted by basename and labelled by basename.

- **A file in the layout folder:** exactly today's pane.
- **A `.sheetsmith` file outside the layout folder** (any other folder,
  including a subfolder of it) opens and edits normally. The dropdown carries
  that file as an extra first option, labelled with its vault path and
  selected. A line under the row, in the pane's existing muted description
  style, says: *This file is not in "`<folder>`", so no character can use it from
  here. Move it into that folder to use it.* **Copy layout JSON** and the trash
  act on the open file, not on a folder lookup by name.
- **A file that fails `parseLayout`:** today's error, with the file named:
  *"`<basename>`" cannot be edited until its file is fixed: `<parser message>`*.
  A file the vault cannot read at all takes the same shape, in the same place:
  *"`<basename>`" cannot be read: `<vault's reason>`*.
  It sits under the picker, as today, so the picker is still how an author leaves
  it. There is no blank editor and no text view. **Nothing is written** to that
  file, because `persist` already returns without a parsed layout, and the
  outside-change reload below is what recovers the pane when the file is fixed
  elsewhere.
- **No file, with layouts in the folder** (after an outside delete, or a legacy
  state naming nothing): the **Layout file** row with no option selected,
  **New layout** beside it, and the line *No layout is open. Choose one above.*
  Choosing one opens it in this leaf. The pane never binds itself to a file the
  reader did not choose.
- **No file, and no layouts:** today's vacant state, unchanged.
- **A `.json` layout, still unconverted,** opens from the dropdown and edits as
  before. It is not registered, so clicking it in the explorer is not required to
  open the pane this cycle. Saving it **writes back to its own `.json` path**,
  with no rename: the convert command and the load `Notice`'s **Convert** button
  are the only paths that convert, so the "offered, never run silently" rule
  holds here too, and one saved layout cannot strand an older device that reads
  only `.json`.
- **A component rename in a file no note resolves to** — outside the layout
  folder, or a `.json` hidden by a same-named `.sheetsmith` — migrates no notes.
  The notes naming that basename read a different file, or none, so rewriting
  them would change characters built on a layout the edit never touched. The
  layout itself saves as usual, and there is no `Notice`.
- **A shadowed `.json`** (`X.json` beside `X.sheetsmith`) is unreachable from
  every plugin surface. The one route to it is a workspace path saved during this
  cycle, and there the pane opens it as a file outside the layout's lookup. It
  shows the line above, reading "`<folder>` uses `X.sheetsmith` under this
  name", and no conversion is attempted.

### Rename, move and delete from outside [core, except where marked]

- **Rename** is `FileView`'s own: the view keeps the `TFile`, whose path
  changes, and `onRename` updates the title. The pane's undo stack survives,
  because the contents did not change.
- **Move out of the folder** is a rename. The line above appears on the next
  render, which `onRename` triggers.
- **Delete** leaves the pane with no file (`allowNoFile`), drawing the "No layout
  is open" state. The stacks are cleared.
- **[separable] The count `Notice`.** A vault `rename` event on a file that was a
  layout in the folder, whose *lookup name* changed (a new basename, or no longer
  in the folder), counts the character notes naming the old basename. Where the
  count is non-zero, one `Notice` says: *N character notes name "`<old>`"; they
  will show the missing-layout message until renamed back or repointed.* The
  singular is *1 character note names "`<old>`"; it will show…*. **Zero says
  nothing**, which is §10's "a rename that matches nothing says nothing". An
  extension-only change, such as a conversion, is not a lookup-name change and
  never counts. **The rule is the lookup's**: this `Notice` fires only where no
  file in the folder now answers the old name.
- **[separable] The fallback `Notice`.** Where the renamed file was
  `X.sheetsmith` and an older `X.json` it was hiding now answers the name, the
  notes are not stranded but have silently moved to a different layout. One
  `Notice` says so: *N character notes name "`X`"; they now use the older
  X.json until it is converted or removed.* The singular is *1 character note
  names "`X`"; it now uses the older X.json until that file is converted or
  removed.* Zero says nothing.
- **Both `Notice`s count with one scan**, the one `component-rename-migration.ts`
  already ran (`candidates`), moved into a module every caller imports
  (`layout-notes.ts`), because "which notes name this layout" is a predicate and
  `docs/PATTERNS.md` §1 extracts a predicate on its second consumer. It keeps
  that scan's rules: the whole vault, and a YAML value that is not a string
  settled by the note's own `parseCharacter`.
- **[separable] Open sheets refresh** on a vault `create`, `rename` or `delete`
  of a layout file in the folder, so a sheet on a just-renamed layout shows the
  missing-layout message now rather than on its next open. It is
  `refreshSheets`'s existing hop, registered from a `src/view/` module with
  `registerEvent`, as `auto-open.ts` does.

### Outside changes reload the pane [separable]

`FileView` owns no `modify` handler; `TextFileView` does. This pane does not
become a `TextFileView`: that class buffers and saves on a two-second debounce,
and the pane writes immediately. So the view registers `vault.on('modify')` for
its own file:

- **Its own writes are ignored, by content rather than by a flag.** On `modify`,
  the pane reads the file and compares it with `onDisk`, the text it last wrote
  or loaded. A match is the pane's own write, including one that landed out of
  order. A difference is an outside change. The comparison is used rather than a
  "saving" flag because a flag cannot tell two quick writes apart from one
  outside write between them.
- **An outside change reloads the pane and clears both stacks.** A step recorded
  against the old contents would restore text nobody on disk ever had.
- **A pending edit is dropped, and the reader is told.** The editor can hold an
  uncommitted edit: a textarea not yet committed, or the 500ms keyboard-nudge
  debounce. Flushing it would overwrite the change the pane has just been told
  about, so it is discarded instead. Only where something was pending, one
  `Notice` says: *"`<basename>`" changed on disk, so the layout editor reloaded
  it. An edit not yet saved here was dropped.* This is a spec-level decision,
  recorded for the owner (see the report).
- **The same layout in two panes** follows from these rules with no special
  case: each writes straight to disk, and each reloads on the other's write.
  The cost is that alternating edits in two panes on one layout clear each
  other's undo history.
- **A side effect worth stating:** `layouts.ts`'s `appendModifierDefinition`
  records that a promotion from a sheet "is dropped by that pane's next save"
  because nothing in `src/` listens for `modify`. With this, the pane reloads on
  the promotion instead, and that comment is updated.

### Conversion [core: the command; separable: the load `Notice`]

- **`layouts.ts` owns it:** `legacyLayouts(app, folder)` lists the unshadowed
  `.json` layouts, and `convertLegacyLayouts(app, folder)` renames each one
  through `app.fileManager.renameFile` and returns a value: converted, skipped (name taken),
  and failed (with the vault's reason). Failure is a value (`docs/PATTERNS.md`
  §4). A shadowed `.json` is not in the list, so it is never renamed; it is
  reported as skipped. **`fileManager.renameFile` rather than
  `vault.rename`**, because it updates links to the renamed file across the
  vault: a note linking `[[X.json]]` links `[[X.sheetsmith]]` afterwards, as it
  would after a rename in the file explorer. `sheet-layout` is a plain string,
  not a link, so no character note is touched by this.
- **Command** `convert-json-layouts`, named *Convert JSON layout files*. It runs
  the conversion and reports through one `Notice`: *Converted N layouts to
  .sheetsmith.*, plus, where they apply, *Skipped M: "`<folder>`" already holds a
  .sheetsmith file under the same name, so the .json was left as it is.* and
  *Could not convert K: `<first reason>`.* Where there is nothing to convert:
  *No .json layouts in "`<folder>`".*
- **[separable] The load `Notice`**, once per load in `onLayoutReady` (the vault
  is not indexed before that), shown only where `legacyLayouts` is non-empty. It
  is persistent (duration 0), because it carries a control:

  *N layouts in "`<folder>`" are still .json files, which the file explorer does
  not show. Update Sheetsmith on your other devices before converting: an older
  version reads only .json and will show every layout as missing once these
  sync.* **[Convert]**

  The button runs the command's own function and hides the `Notice`. Built the
  way `sheet-view.ts`'s `offerUndo` builds a control into a `Notice`: a fragment,
  with a plain `<button>` taking Obsidian's own styling.

### Documentation [core]

- **README**, under **Install** or a short section of its own: layout files end
  in `.sheetsmith` and show in the file explorer. With the plugin disabled, or
  on a device without it, the registration is gone, so the files are hidden
  unless **Settings → Files and links → Detect all file extensions** is on, and
  a click opens the operating system's app, or nothing on mobile. Notebook
  Navigator's **Documents** visibility mode hides layout files whatever is
  registered; its default **Supported** mode and **All** show them.
- **Obsidian Sync: the sentence is held until it is observed.** Sync's own
  documentation says that by default it selectively syncs images, audio, video,
  PDFs, markdown, canvas and bases, and holds other types until **Sync all other
  types** is on. It is **silent** on whether a plugin-registered extension counts
  as "other", and resolves a non-markdown conflict as last modified wins. So
  `.json` layouts already do not sync by default, and whether `.sheetsmith`
  layouts do is unknown. The README sentence, and its twin in the layout folder
  setting's description, are written **from what the owner observes in the app**
  (see Manual verification) and not from the docs. The build leaves both unwritten
  and says so at the land stop, rather than shipping a guess.
- **Layout folder** setting description gains *Layout files end in
  .sheetsmith.* now, and the Sync clause once observed.

### Reuse

The missing-layout surface (`view/missing-layout.ts`), unchanged. `refreshSheets`,
for the sheet hop. The `offerUndo` shape, for a `Notice` with a control. The
component rename's note scan, extracted rather than copied. The pane's existing
error line and description style. No new CSS class is expected. If the
outside-folder line needs one, it goes in `src/styles/` under the pane's own
rules.

## Config fields

None. No component is added or changed. The one settings change is a
description (the **Layout folder** row), covered under Documentation.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |

## Data and file model

- **Layout file:** `<layout folder>/<name>.sheetsmith`, holding the same JSON as
  before. `<name>.json` is read for this cycle, and `.sheetsmith` wins a tie.
- **One set and one resolver in `layouts.ts`,** and nowhere else: the accepted
  extensions, the one written, and `layoutFileFor(app, folder, name)`, which
  applies the precedence. Every `${name}.json` spelled in `src/` today goes
  through it: `loadLayout`, `createLayout`, `startLayout`'s copy arm and
  `appendModifierDefinition`. That is a predicate, extracted on its second
  consumer (`docs/PATTERNS.md` §1), and the comments naming `<name>.json` in
  `parse/character.ts` and `layout-picker.ts` are updated.
- **Round trip:** conversion is a rename, so the bytes are unchanged. Pane saves
  are `serialiseLayout` as before, and Constraint 3 is untouched.
- **Existing character notes:** not written by any path in this feature
  (Constraint 4). A rename or delete in the explorer leaves them on the
  missing-layout path, which `docs/features/layout-picker.md` already makes
  losslessly reversible.
- **Workspace state:** `{ file: <path> }` from now on, with `{ layout: <name> }`
  still read.
- **Test fixtures** in `src/test/fixtures/` move to `.sheetsmith`, since they are
  "files a reader copies into a vault, under the filenames the vault needs"
  (`docs/PATTERNS.md` §2). **[separable]** Dual reading keeps `.json` fixtures
  working if this is cut.

## Acceptance criteria

Stub-level where `src/test/obsidian-stub.ts` can host the case. The stub grows
what that takes: a `FileView` (with `file`, `allowNoFile`, `onLoadFile`,
`onUnloadFile`, `onRename` and state `{ file }`), `Vault.rename`,
`FileManager.renameFile` (renaming and rewriting links to the file), and vault
`modify`/`rename`/`delete`/`create` events, and a record of
`registerExtensions` calls. It does **not** model Obsidian's choice of which
leaf an open-file lands in. That is a claim about the app, and
`docs/BACKLOG.md`'s row on the stub's unverified comments is the reason not to
write one down as a double. Those cases are manual.

**Registration and opening**

- [x] `onload` calls `registerExtensions(['sheetsmith'], VIEW_TYPE_LAYOUT_EDITOR)`
      after `registerView`, inside a try/catch. A throwing registration shows one
      `Notice` naming the owning view type where the registry answers, and
      everything else `onload` registers is still registered. (Test.)
- [x] Opening a `.sheetsmith` file into a leaf with the pane's view type loads
      that layout, from `state: { file }` and not from a folder lookup by name.
      The pane shows that layout's tree, and the view's `file` is that `TFile`.
      (Test.)
- [x] A `.sheetsmith` file outside the layout folder opens and edits, and the
      pane shows the "no character can use it from here" line naming the folder.
      A file in a subfolder of the layout folder counts as outside. (Test.)
- [x] A file that fails `parseLayout` opens the pane showing the parser's message
      and the file's basename, with no tree, no canvas and no panel. No write to
      that file happens on open, or on any control pressed in that state. (Test:
      the vault's write count for the file is unchanged.)
- [x] An unconverted `.json` layout in the folder opens from the pane's dropdown
      and edits as before. (Test.)
- [x] Choosing a layout in the pane's dropdown opens it in the *same* leaf: one
      leaf, whose view's `file` is now the chosen file. (Test.)
- [x] `getState()` answers `{ file: <path> }`, and `setState({ layout: 'Beta' })`,
      the shipped shape, opens `Beta.sheetsmith` where it exists and `Beta.json`
      where only that does. (Test.)
- [x] The tab and the view header show the file's basename, and the pane with no
      file shows "Layout editor". (Test for `getDisplayText`, harness shot for the
      header.)

**Migration**

- [x] `listLayouts` returns `.sheetsmith` and `.json` layouts sorted by basename,
      and where `X.sheetsmith` and `X.json` both exist it returns only the first.
      The picker, **Create a character**, the pane's dropdown and **New layout**'s
      copy list all read through it. (Test in `layouts.test.ts`, with the
      surfaces' own tests still green.)
- [x] A character note naming `X` resolves `X.sheetsmith` where it exists,
      otherwise `X.json`. (Test.)
- [x] `createLayout`, a starter install, a paste import and a copy each write
      `<name>.sheetsmith`, and each refuses a name the folder holds under
      *either* extension, leaving that file's bytes as they were. (Test.)
- [x] The convert command renames every unshadowed `X.json` to `X.sheetsmith`
      with its bytes unchanged. It skips a shadowed one without touching it
      (bytes and path unchanged), and reports converted and skipped counts in one
      `Notice`. (Test.)
- [x] **[separable]** On load, where the folder holds any `.json` layout, one
      `Notice` counts them, warns about other devices, and carries **Convert**.
      Pressing it converts and reports. Where the folder holds none, no `Notice`
      appears. (Test.)
- [x] Saving from the pane a layout opened as `X.json` writes `X.json`: the path
      is unchanged, no `X.sheetsmith` is created, and the pane stays bound to
      `X.json`. (Test.)
- [x] After conversion, a note whose body links `[[X.json]]` links
      `[[X.sheetsmith]]`, and a character note's `sheet-layout: X` line is
      byte-identical. (Test, with the stub's `FileManager.renameFile` updating
      links. The app's own half is a manual check below.)

**Rename, move, delete, outside changes**

- [x] Renaming the open file keeps the pane on it, with the undo stack intact and
      the title showing the new basename. (Test.)
- [x] **[separable]** Renaming a layout in the folder to a new basename, where
      two character notes name the old one, shows exactly one `Notice` with the
      count 2 and the old name. No note's bytes change. A rename matching no
      note, and a `.json` → `.sheetsmith` conversion, show no such `Notice`.
      (Test.)
- [x] **[separable]** Renaming `X.sheetsmith` away where `X.json` sits beside it,
      and two character notes name `X`, shows exactly one `Notice`: *2
      character notes name "X"; they now use the older X.json until it is
      converted or removed.* No note's bytes change, and where no note names
      `X` nothing is shown. (Test.)
- [x] Deleting the open file leaves the pane with no file and the "No layout is
      open" line, and nothing is written. (Test.)
- [x] Renaming a component's label in a file outside the folder, and in a
      shadowed `.json`, saves the layout and leaves a note naming that basename
      byte-identical, with no Notice. (Test.)
- [x] **[separable]** A `modify` caused by the pane's own `persist` does not
      reload the pane and does not clear its undo stack. (Test.)
- [x] **[separable]** An outside `modify` reloads the pane from disk and clears
      both stacks. Where an edit was pending, it is not written, and one `Notice`
      says it was dropped. (Test.)
- [x] **[separable]** Two panes on one file: an edit in the first reloads the
      second, and the first's undo stack still holds the step. (Test.)
- [x] **[separable]** A sheet open on a layout that is then renamed shows the
      missing-layout message and the picker offer without being reopened. (Test.)

**Gates and pixels**

- [x] `npm run lint`, `npm test` and `npm run build` pass. Every new user-facing
      string passes `obsidianmd/ui/sentence-case`, or is held by review where the
      rule cannot reach it (a `Notice` fragment).
- [x] The harness plants its layout as a `.sheetsmith` file and opens the pane
      on it. Every existing editor shot is re-shot (the header title changes),
      and one new shot, `editor-outside-folder-light`, shows the pane on a file
      outside the folder, with the header and the line visible.

**Manual verification in the throwaway vault** (below), each ticked by the owner
or the build session in the app:

- [ ] A `.sheetsmith` layout opens the pane on that layout from each of these:
      a file explorer click, a Notebook Navigator click (default mode), the Quick
      Switcher, a clicked `[[File variations.sheetsmith]]` link in a note, and
      `app.workspace.openLinkText('File variations.sheetsmith', '')` from the
      developer console. None of them opens a picker, an empty pane, or the last
      layout.
- [ ] With the pane already open on a file, opening that file again from the
      explorer and from the Quick Switcher: record whether Obsidian focuses the
      existing tab or opens a second one. Either is acceptable only if it matches
      what Obsidian does for a markdown note opened the same way. The plugin
      adds no reuse logic.
- [ ] With **Detect all file extensions** off, layout files show in the file
      explorer. Notebook Navigator's **Supported** and **All** modes show them,
      and **Documents** hides them.
- [ ] A rename in the explorer: the pane follows, the count `Notice` appears,
      and the sheets on it show the missing-layout message. Renaming it back
      restores them.
- [ ] **Convert** rewrites the fixture's `Characters/Links.md` link
      `[[DnD 5e Standard.json]]` to `[[DnD 5e Standard.sheetsmith]]`, and a
      character note's `sheet-layout` line is untouched.
- [ ] **Sync, with the owner, since the build cannot run it:** does a
      `.sheetsmith` file sync with **Sync all other types** off? The README and
      settings sentences are written from this answer and nothing else.

## Manual verification fixture

In the throwaway vault (`AGENTS.md` § Testing), never a real one. The vault
lives outside the repository, so this is the recipe for rebuilding it.

**Before the build lands:** leave every existing `.json` layout in
`Sheetsmith layouts/` as it is. The first load of the new build is the load
`Notice`'s own check. Note the count it gives against `ls`. Pressing **Convert**
is the conversion check, and it leaves the vault converted, as a reader's would
be.

**Add these,** following the vault's `<Thing> variations` naming:

- `Sheetsmith layouts/File variations.sheetsmith`: a valid layout with one Card
  set and 6 columns.
- `Sheetsmith layouts/File variations.json`: the same name, with 12 columns. This
  is the shadow check: the dropdown lists "File variations" once, the pane shows
  6 columns, and after **Convert** this file's path and modified time are
  unchanged.
- `Sheetsmith layouts/Broken variations.sheetsmith`: the text
  `{ "name": "Broken variations", "columns": ` and nothing after it. Clicking it
  shows the parse error with its name. Fixing it in another editor recovers the
  pane (with the reload part built).
- `Elsewhere/Stray variations.sheetsmith`: a copy of a valid layout outside the
  folder. Clicking it opens the pane with the "no character can use it" line.
- `Characters/Files.md` and `Characters/Files 2.md`, each with only
  `sheet-layout: File variations`. Renaming the layout gives a count of 2.
- `Characters/Links.md`, holding `[[File variations.sheetsmith]]` in its body,
  for the clicked-link check, and `[[DnD 5e Standard.json]]`, which
  **Convert** should rewrite to `[[DnD 5e Standard.sheetsmith]]`. Add that link
  before converting.
- **Notebook Navigator** installed from the community list, if it is not
  already, for its three visibility modes.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted until the owner
says the work is done.

1. `feat: Read layouts from .sheetsmith files beside .json`. `layouts.ts`'s
   extension set and `layoutFileFor`, dual `listLayouts` with precedence, the
   name-taken rule over both extensions, every file-creating writer producing `.sheetsmith`,
   and every `${name}.json` site routed through the resolver. Tests.
2. `feat: Convert JSON layouts to .sheetsmith files`. `legacyLayouts`,
   `convertLegacyLayouts`, the command, and the load `Notice` with **Convert**.
   Tests.
3. `test: Give the stub a FileView and vault file events`. The stub's `FileView`,
   `Vault.rename`, `FileManager.renameFile`, vault events, and the `registerExtensions` record, with the
   stub's own tests.
4. `feat: Open layout files in the layout editor`. `FileView`, the registration
   in `layout-extension.ts` with its try/catch, the host contract moved to a
   file, the dropdown and **New layout** opening in the same leaf, legacy
   `setState`, the outside-folder line, the parse error naming the file, the
   no-file state, and a `.json` layout saving back to its own path. Tests.
5. `feat: Reload the layout editor when its file changes on disk`. The `modify`
   listener, the content-compared self-write rule, clearing the stacks, and the
   dropped-edit `Notice`. The `appendModifierDefinition` comment is updated.
   Tests.
6. `feat: Count the characters a layout rename leaves behind`. The note scan
   extracted from `component-rename-migration.ts`, the rename `Notice`, and open
   sheets refreshing on layout file events. Tests.
7. `test: Store the vault fixtures as .sheetsmith files`. The fixture renames
   and `vault-fixture.test.ts`.
8. `test: Photograph the layout editor opened on a file`. The harness plants
   `.sheetsmith`, the editor shots are re-shot, and `editor-outside-folder-light`
   is added.
9. `docs: Say where layout files show and how they sync`. README, the layout
   folder description, and the SPEC §3.2, §7 and §13 updates `/land-it` owns.
   The Sync sentences go in only once observed.

Commits 1, 3 and 4 plus the command half of 2 are the smallest version. 5, 6 and
7 and the load `Notice` can each be dropped without the others failing.

## Deliberately not doing

- **Migrating `sheet-layout` on a rename.** §10 declines it and this does not
  reopen it. The count `Notice` is the whole of the response.
- **Making `sheet-layout` a wikilink.** Deferred to a note-format feature of its
  own (§13), not rejected.
- **A rename control in the pane** (§7). Obsidian's own rename, from the explorer
  or the view header, is the only rename, and it is treated as one.
- **Rewriting the layout's `name` key on a rename.** Only an import reads it,
  and an import already takes a typed name. A layout exported after an explorer
  rename imports under its old name unless one is typed.
- **Registering `.json`**, so an unconverted layout clicked in the explorer does
  not open the pane this cycle.
- **Claiming the file back** when a visible layout is dragged out of the folder,
  or moved by another plugin (Custom Attachment Location issue 88 is this case).
  The pane still opens it and says why no character can use it. It does not
  move it back.
- **Dropping `.json` reading.** That is a later cycle, once the conversion has
  had a release to run.
- **A `TextFileView` buffer.** The pane keeps writing immediately. Two panes on
  one file reconcile through the reload, not through a merge.
- **Plugin-side reuse of an open tab.** Whether opening a file focuses an
  existing pane is Obsidian's decision, made for a `FileView` as for a note.
- **Refreshing open sheets on an outside `modify` of a layout.** A hand edit of a
  layout reaches an open sheet on its next render, as today. Only create, rename
  and delete refresh it.
- **Moving the layout folder's contents when the setting changes.** Unchanged
  from today.
- Out of scope by the card: multi-page layouts, the settings page revamp, every
  open row in `docs/BACKLOG.md` and `docs/PATTERNS.md` §11.
