# Layout picker

Status: shipped
Board card: ✨ A layout picker that creates a character note. One picker modal
over the vault's layouts, wired into two entry points: a new command that
creates a character (pick a layout, write the note, open it as a sheet), and the
missing-layout state in sheet view, where SPEC §8's last bullet promises the
sheet will "show a clear message and offer to pick another" and only the message
exists.

*Why this is next rather than bigger: the plugin is listed in the community
store. A stranger installs it, runs **Add a starter layout**, and is then told to
hand-write a `sheet-layout` property on a note before anything renders.
`docs/features/starter-layouts.md`'s own "deliberately not doing" list defers
exactly this feature by name — "the new-character-from-a-layout command and the
missing-layout picker (SPEC §8) — a separate feature; the manual criterion above
types `sheet-layout` by hand and that is fine." It is no longer fine, because the
manual criterion is now a stranger's first five minutes.*

## Model question

**None of §13's.** No component is added, the component contract does not grow,
the catalog does not grow, and nothing new is published to formulas: this feature
writes one frontmatter key and opens a view. §13's live questions are about scope
resolution, catalog shape and nesting, and none of them can be answered
differently by anything below.

The step is not free, though, because the skill's own step-1 questions —
what it stores, whether that round-trips, and what happens to existing notes —
land squarely on this feature. It is the first path in the plugin that **writes
the `sheet-layout` key**, and the second (after `appendModifierDefinition`) where
a surface writes a file the user already owns. So three things are settled here
rather than in Design.

### 1. Where the note is written, and what it is named

**Amended:** the setting this section argues against now exists, by owner
decision — `docs/features/character-folder.md`. Nothing below is rewritten,
because the argument is not wrong and is where the new setting's *default* comes
from: **Character folder** ships **empty**, and empty means exactly the
`getNewFileParent` behaviour this section specifies, "Same folder as current
file" included. So an untouched install still does what is described here, and
what changed is that a vault which wants characters landing in one place can now
say so. The first half of the argument — Obsidian asks this question once,
globally, so a second answer has to be kept in sync — is what the empty default
keeps. The second half, the asymmetry with the layout folder, is intact and
untouched, and is what makes the two fields' empty values fall back to different
kinds of thing: a folder name for the layout folder, an app setting for this one.
Read the paragraph below **naming a third preference** as the record of a
position that was held and then amended, not as a description of the shipped tab;
the same goes for the count in *Deliberately not doing*'s **A settings-tab entry
point**, whose subject — no entry point for this gesture on the settings tab — is
unchanged, while SPEC §7 now says three preferences rather than two.

**Where: `app.fileManager.getNewFileParent(activeFilePath ?? '')`. No new
setting.**

The obvious move is a third preference — "Character folder" beside "Layout
folder" — and SPEC §7 says settings holds two preferences and a button, so
proposing a third needs an argument. It does not have one, because Obsidian
already asks this exact question once, globally: **Settings → Files and links →
Default location for new notes**, with "Vault root", "In the folder specified
below" and "Same folder as current file". `getNewFileParent` is the API that
answers it (`obsidian.d.ts`, since 1.1.13; `minAppVersion` is 1.9.0). Every
note-creating gesture in the app obeys it, and a Sheetsmith preference beside it
would be a second answer the user has to keep in sync with the first or be
surprised by.

**The asymmetry with the layout folder is principled, not an inconsistency.**
The layout folder setting exists because a layout is **looked up by name inside
it** — `loadLayout(app, folder, name)` builds a path, so the folder is part of
the lookup mechanism and the plugin cannot work without knowing it. A character
note is looked up by nothing. Its path is stored nowhere: the note names the
layout, the layout never names the note, and the plugin finds a character
because the user opened it. So a character note can be moved anywhere in the
vault at any time and nothing breaks — which is precisely why the plugin has no
business holding an opinion about where it starts.

The source path is passed rather than `''` so that "Same folder as current file"
means what it says when the command is run from a note.

**Named: `Untitled character`, deduped Obsidian-style (`Untitled character 1`,
`Untitled character 2`, …). No name prompt.**

Two candidates were weighed. Prompting for the name has a real case: a character
note's filename *is* the character's name in this plugin — it is what a wikilink
to the character resolves to, and the vault fixtures name character notes after
characters — and the name is the one fact only the user has.

It is refused anyway, on three grounds. **Obsidian's own precedent**: **Create new
note** asks for no name, writes `Untitled`, and hands the user the app's rename
gesture, which is one keystroke, validates the vault's own illegal-character
rules better than any modal this plugin could write, and updates every link to
the note. **A required field in front of the payload**: the command's one job is
to put a sheet on screen, and a prompt puts a text input and a Create button
between the reader and it. **Two modals for one gesture**: the picker is already
a modal, and the second entry point needs no name at all, so a name prompt makes
the create path structurally different from the pick-another path for a fact
neither of them uses.

`Untitled character` rather than Obsidian's bare `Untitled` because the folder
may hold several and the word says which kind of thing they are; and because it
reads as a placeholder, so nobody mistakes it for a name they chose. Deduping is
a loop over `vault.getFileByPath`, not `getAvailablePathForAttachment` — that one
resolves into the *attachment* folder and would answer a different question.

### 2. What the body contains on creation

**Frontmatter and nothing else:**

```markdown
---
sheet-layout: Starter 5e
---
```

Three bytes of decision: the key, the value, and no body. SPEC §10 already
argues for this and the confirmation is unanimous.

- **The renderer needs nothing.** SPEC §10: "A section without a data block is
  empty, not malformed. It renders editable exactly like a missing section, and
  the first edit writes the data block into the section." A component whose
  section is absent reads an empty body and draws a fully editable card. So a
  pre-written body buys nothing at render time — it is inert markup waiting to
  be overwritten by the same code path that would have created it.
- **Pre-writing sections would manufacture the debris §10 declines to clean
  up.** A section keys on the component's `label`, and a label is edited in the
  layout editor. A note created with 54 headings and then opened on a layout
  whose author renamed three of them holds three stale sections — retained, per
  Constraint 4, and rendering nothing. This feature would be the plugin
  *creating* the exact orphans SPEC §10 promises never to delete.
- **Constraint 3 is satisfied by having nothing to normalise.** `---\nsheet-layout:
  X\n---\n` parses to zero sections, an empty preamble and a raw frontmatter
  block, and `serialiseCharacter` returns the identical bytes. A criterion pins
  it.
- **The creation path never reads the layout.** It writes a name, not a shape.
  So creating a character against a layout whose JSON is broken still produces a
  valid note, and the broken layout is reported where it is broken — on the
  sheet, in place (`docs/UI.md` §10) — rather than turning a create gesture into
  a parse error.
- **It keeps the note honest.** What is in the file is what the user filled in. A
  brand-new note in Markdown view is two lines, not a wall of empty headings.

No trailing blank line either: the smallest file that is a valid character note.

### 3. How the layout name is spelled into the property

The plugin has never *written* this key, so the quoting rule is new. It matters
because **two readers must agree**: `parse/character.ts`'s `extractLayoutName`
(which takes the rest of the line, trims, and strips one surrounding pair of
single or double quotes) and Obsidian's own YAML, which `auto-open.ts` and the
**Open as sheet** command read through `metadataCache`. A value the two read
differently is a note that opens as a sheet and cannot find its layout, or the
reverse.

**Plain and unquoted where plain is unambiguous; double-quoted otherwise.**
Plain when the name starts with a letter or a digit, contains neither `:` nor
`#`, **and does not end in a space or a tab** — which covers every layout name
anyone actually types, all three bundled starters included, so the common case is
byte-identical to what a hand-writer would have typed and SPEC §3.1's own example
stays the truth.

**The trailing-whitespace clause is required rather than tidy**, and it is this
section's own "two readers must agree" applied to the one character that is
invisible: `extractLayoutName` trims the value, and Obsidian's YAML trims a plain
scalar too, so a layout called `Ferro ` written plain reads back as `Ferro` — a
different name, and one the folder does not hold. Quoted, both readers keep the
space. The name comes from a filename and macOS will hand one over, so this is
reachable rather than theoretical.

**"A letter or a digit" is read as Unicode**, `/^[\p{L}\p{N}]/u`, which is
*looser* than ASCII rather than stricter: `Élise` stays plain where `[A-Za-z0-9]`
would have quoted it. Safe in both directions — a first character that is a
letter is not a YAML indicator, whatever its script — and it keeps a
non-English vault's common case as byte-identical as an English one's.

The double-quoted fallback needs no escaping, and that is not luck: `"` and `\`
are both in Obsidian's forbidden set for file names, and a layout's name *is* its
filename's basename (`createLayout` writes `<name>.json`). So no name that can
exist in the layout folder can contain either character, and the naive
`"` + name + `"` is correct for both readers. Recorded explicitly, because a
future reader will otherwise add escaping — and escaping would *break* the
round-trip, since `extractLayoutName` strips quotes and does not unescape.

The predicate and the writer live in `src/parse/character.ts`, beside
`LAYOUT_KEY_LINE`, which is the module that already knows how this line is
spelled. One module knows what starts a section (`startsSection`); one module
knows what names the layout.

### What happens to existing character notes

**Nothing, on the create path** — it only creates.

**On the pick-another path, one line changes.** The note already carries the key
(the branch is reached only after `parseCharacter` succeeded), so this is a value
replacement on an existing line, and every other byte of the frontmatter, the
preamble and every section is untouched. `withLayoutName(note, name)` returns a
note with the one line rewritten and `serialiseCharacter` puts it back.

That spelling was chosen over `app.fileManager.processFrontMatter`, and the
reason is Constraint 3's own reason one key over: `processFrontMatter` re-emits
the **whole** frontmatter block through Obsidian's YAML serialiser, so picking a
layout would reformat the user's unrelated properties and drop their YAML
comments. Repointing one key is not licence to rewrite the block around it.

The write itself goes through `TextFileView.requestSave()`, exactly as every
value edit on the sheet already does — the same writer and the same spelling, so
there is no second path into the file and no lock question. (The 0.1.1 review
round's "under Obsidian's own lock" ruling was about a *background* write to a
file the plugin does not own, which `appendModifierDefinition` does with
`vault.process`. Here the view owns the file and is its editor.) Creation uses
`vault.create`, which has no existing file to race and throws on a taken path —
the backstop behind the dedupe loop.

**`withLayoutName` has one failure arm, and it is not reachable from either
surface.** It throws where the note it is handed carries no `sheet-layout` line
at all — the same sentence `parseCharacter` refuses such a note with, named once
in that module rather than written twice. `parseCharacter` refuses first, so
neither caller here can reach it; a `CharacterNote` is a plain object, though, and
a future caller building one by hand can. Rewriting nothing while reporting a new
`layoutName` would hand that caller a note whose two halves disagree, which is
worse than a throw: it is a note that says it names a layout the file does not
name.

**No section is added, removed or migrated by a layout change.** SPEC §10 does
the rest: sections the new layout does not map do not render and are not
reported, and the sheet stays quiet about them. So repointing a note at a
different layout is losslessly reversible by repointing it back, which is the
whole of Constraint 4 here.

## What it does

**Create a character** in the command palette lists the layouts in the
configured folder, and choosing one writes a new note carrying only
`sheet-layout` and opens it as a sheet — so the first five minutes of a fresh
install are two commands and no hand-edited property. The same picker is the
offer SPEC §8's last bullet has always promised: a sheet whose named layout is
not in the folder now draws **Pick another layout** beside its message, and
choosing one repoints that note's `sheet-layout` and re-renders, leaving every
value in the note exactly where it was.

## Design

Almost no surface of the plugin's own: the picker is Obsidian's `SuggestModal`,
the refusals are `Notice`s, and the one thing this feature draws is a button
inside the sheet's existing `.sheetsmith-notice`. `docs/UI.md`'s shared
vocabulary is reused and nothing is added to it.

### The picker — one modal, two callers

`src/layout-picker.ts` exports `pickLayout(plugin, onChoose: (name: string) =>
void)` and a `SuggestModal<TFile>` behind it. The modal is not exported as a
constructor to its callers: they name a gesture, which is `starters/picker.ts`'s
own precedent (`chooseStarterLayout`).

**`pickLayout` hands back the modal it opened, and the create gesture hands it
back in turn** (`LayoutModal | null`, null being "no picker, because there was
nothing to pick"). Nothing in the plugin reads either; a test does, and there is
no other route: the app calls `onChooseSuggestion` itself, so a caller's *wiring*
— what actually happens when a row is chosen — is reachable only through the
instance. `starters/picker.ts` splits `chooseStarter` off the handler for exactly
this reason and says so. Left unreturned, emptying the callback the gesture
passes in changed nothing any case could see: the command opened a picker that
did nothing at all, with the suite green.

Candidates are `listLayouts(app, folder)` — every `.json` at the top level of
the configured folder, sorted by name. Not recursive, deliberately: `loadLayout`
resolves a name inside that folder and no deeper, so **the picker lists exactly
what the loader can find**. A picker offering a row the loader cannot resolve
would manufacture the missing-layout state this feature exists to close.

**A row is the layout's name and nothing else.** The starter picker carries a
second line because its three bundled names are deliberately alike and the
description is the only thing that separates them; a vault's layouts are named
by the user, so the name is the fact they chose in order to tell them apart.
There is also nothing else available: the only other fact about a layout —
its component count, its columns — costs a read and a parse of every file in the
folder, on open. Searching is over the name, since that is all a row holds.

Placeholder: **Choose a layout**. One string for both callers, not two: the
reader knows which gesture they pressed, and a placeholder differing only by
"for this character" / "for this note" is copy carrying no information.

**A layout whose JSON will not parse is still listed.** Filtering it out would
hide a file the user has, and the honest place to report it is where the failure
is: pick it and the sheet reports the parser's own message in place (`UI.md`
§10), which names the fix. A row silently absent names nothing.

Escape closes it and nothing is written. A query matching no name returns
nothing and the app draws its own empty list — `SuggestModal.getSuggestions` is
abstract, so that state belongs to the platform, which is the position
`starters/picker.ts` already argued and this feature does not reopen.

### The empty layout folder — the picker never opens over one

Cold start is a reader who has not run **Add a starter layout** yet, so their
folder is empty or absent. Both callers ask `hasLayouts` first and, where there
are none, **do not open the picker**. They show one shared sentence instead:

> No layouts in "Sheetsmith layouts" yet. Run "Add a starter layout" from the
> command palette to get one.

The folder is named because it is configurable, and the fix is named because it
is one command away.

**Why not `emptyStateText`.** `SuggestModal` has the property, and it would work.
But it is one string for two different facts, and they are different in kind: "no
layout of yours matches *pineapple*" is a result of the query and belongs to the
modal; "you have no layouts" is a state of the vault, true whatever is typed. A
search field over zero rows is a control that cannot succeed under any input —
`UI.md` §6's "where focus is not an outcome, the press has to produce one", read
one level up from a card — and the pane's own `NameModal` already holds this
policy at the button (`create?.setDisabled(value.trim() === '')`, because "a live
button that silently does nothing on click is indistinguishable from one that is
broken"). So the picker opens only when choosing can succeed.

**The predicate and the sentence live together, in `layouts.ts`.**
`hasLayouts(app, folder)` and `noLayoutsMessage(folder)` sit beside
`listLayouts`, on `PATTERNS.md` §1's policy tier twice over and
`nameAlreadyDeclared`'s precedent for a user-facing refusal about the layout
folder living in the module that owns the folder. Naming only the sentence was
the shape §1 warns about — "share the application, not just the fact": the
condition deciding whether to *say* it stayed written out at both call sites, and
complementarily (`=== 0` at one, `> 0` at the other), so the copy free to drift
was the one nothing watched. It also kept `view/missing-layout.ts` importing the
picker module purely to get a string. Each surface renders the sentence as text:
a `Notice` for the command, a line inside the sheet's notice for the view.

### Entry point 1 — the command

Id `create-character`, name **Create a character**, in `src/commands.ts` beside
the existing six. **No plugin-name prefix and no default hotkey**, which the
0.1.1 review round imposed and `commands.ts` already records: the app namespaces
an id by plugin, and a shipped default collides with whatever the user bound.

A plain `callback`, not a `checkCallback`, on **Add a starter layout**'s own
grounds (SPEC §7): cold start is the moment no pane, file or state exists to
condition on. Sharper here — a `checkCallback` that hid the command when the
folder is empty would hide it from exactly the reader who most needs to find it,
and they would have no way to discover that the plugin can do this at all.

The flow, in order:

1. No layouts → the shared sentence in a `Notice`. Nothing else happens.
2. `pickLayout`. Escape ends it, having written nothing.
3. `createCharacter(app, layoutName, sourcePath)` in `src/characters.ts`:
   `getNewFileParent`, the deduped name, `vault.create` with the frontmatter.
   **Failure is a value** (`PATTERNS.md` §4) — a read-only vault or a refused
   path returns `{ error }`, which the command shows in a `Notice`, mirroring
   `installStarter`'s two-armed `InstallResult`.
4. On success, open it as a sheet:
   `leaf.setViewState({ type: VIEW_TYPE_SHEET, state: { file: path } })`, the
   same spelling **Open as sheet** already uses, into `workspace.getLeaf(false)`
   — the active pane, matching Obsidian's own **Create new note**, so the app's
   back arrow returns.

**Sheet view, always, whatever `openInSheetView` says.** That preference governs
what happens when a note the user already has is *opened*; this gesture's whole
promise is a sheet on screen, and it is one press from **Open as Markdown** for
anyone who wants the other thing. The second reason is mechanical and decides it
on its own: `auto-open.ts` reads `metadataCache.getFileCache(file)?.frontmatter`,
and the metadata cache indexes a freshly created file asynchronously, so relying
on auto-open here is a race. `setViewState` needs no cache.

**No success notice.** The sheet appearing is the feedback, and `UI.md` §6's
"announce what is not visible" is about a change with nothing on screen to show
it. The note's placeholder name is visible in the tab and the note header, which
is where the app's own rename gesture lives.

### Entry point 2 — the sheet's missing-layout state

`sheet-view.ts` today reports `Layout "X" was not found in "Sheetsmith
layouts".` through `renderMessage` and returns. That message is kept **verbatim**
— it is clear, it names both halves of the lookup, and the offer goes beside it,
not instead of it.

`src/view/missing-layout.ts` draws that state instead: `.sheetsmith-notice`
holding a `<p>` with the message, then either

- a `<button>` reading **Pick another layout**, where the folder holds layouts, or
- a second `<p>` with the shared cold-start sentence, where it holds none — and
  no button, because a button that opens an empty picker is the dead end the
  section above refused.

The button is a **bare `<button>` with no Sheetsmith class**, so it takes
Obsidian's own button treatment: its background, its focus ring, its hover, its
hit target. Not `.sheetsmith-trigger`, which is the sheet's reset-bar vocabulary
and would put a semantic class on a control that triggers nothing; and not a new
class, which is `UI.md` §9's lookalike. Its visible text is its accessible name,
so no `aria-label` (`UI.md` §6). It is always visible, never hover-revealed
(`UI.md` §7). **Target: no new CSS** — a `<p>` and a `<button>` carry the app's
own spacing. If the look inside Obsidian says otherwise, the one rule goes in
`sheet.css`'s existing `.sheetsmith-notice` block and nowhere else.

Pressing it opens the same `pickLayout`. Choosing rewrites the one line and
re-renders, through the view's own save path:

```
this.data = serialiseCharacter(withLayoutName(parseCharacter(this.data), name));
this.requestSave();
void this.renderSheet();
```

which is the identical three lines `saveSectionWrites` already ends with — a
`SheetView.commit(text)` now, since a third caller of that tail made it
`PATTERNS.md` §1's extraction rung. The chosen layout is in the folder by
construction and the named one is not, so picking the layout the note already
names is unreachable on this path.

**Two failure sentences this feature puts on screen, both of them a `Notice`
and neither of them new vocabulary.**

- *Repointing:* `Sheetsmith could not change this note's layout: <reason>`. The
  parse cannot fail on the layout just picked — this state is reached only after
  one succeeded — but the picker is a modal, so the file can be edited into
  something unparseable while it is open. That is `applyEdits`' own case and
  takes its answer: nothing is written, and the reason is said. Without it the
  throw escapes a `void`ed handler and the press does nothing, silently.
- *Creating:* `Sheetsmith created "<path>" but could not open it as a sheet:
  <reason>`. The write half already answers every failure with a `CreateResult`;
  the open half is a promise the app cannot await, because
  `onChooseSuggestion` is synchronous. Unanswered, a rejected `setViewState`
  leaves a note on disk, no sheet on screen, and nothing said about either. The
  sentence names the note rather than the fault, because the note existing is
  the part the reader cannot see and the part they can act on.

**The offer does not appear on the load-error branch**, where the layout is
present but its JSON will not parse. That layout is one the user *has*, and its
fix is to repair it; offering "pick another" invites them to abandon it and
silently repoint the character at a sheet its author did not build. The missing
case has no in-place fix, which is what earns it the offer. Pinned by a
criterion, so the cut does not get reported as a gap.

### What cannot be photographed, and what is looked at instead

**This feature's whole surface is a modal, a `Notice` and one button inside a
view the harness does not build.** `harness/harness.ts`'s `renderSheet` builds
`.sheetsmith-view` and `.sheetsmith-grid` and stops — it renders from
`samples.ts` and never through `SheetView`, so `.sheetsmith-notice` is in no
PNG; `SuggestModal` and `ConfirmModal` both need an `App` the sheet surface does
not reach; and a `Notice` is a timed surface a still cannot capture at all. This
is `docs/UI.md` §12's standing row ("The harness draws no trigger bar"), which
already names all three obstacles and says why fixing them is three jobs rather
than one.

**No harness fix is specced here, and `harness:shot` is expected to be
byte-identical.** The design wave looks at this feature **inside Obsidian**,
against the vault fixture below; the design criteria are written to be checkable
there. `UI.md` §12's row gains this feature's surface as a second subject, so the
cost of that gap is recorded where it is already being counted rather than
rediscovered.

### The vault fixture

The throwaway vault is outside the repository, so the recipe is inside it
(`AGENTS.md` § Testing). Four states, all reachable in one vault:

1. **A character whose layout went away.** `Ghost of a layout.md` at the vault
   root, frontmatter `sheet-layout: Layout that went away`, and two `##` sections
   holding real values — one whose label matches a section in **Starter 5e**
   (`## Abilities`) and one that matches nothing (`## Backstory`, some prose with
   a wikilink in it). *Press:* open it → the notice with **Pick another layout**
   → press it → choose **Starter 5e** → the sheet renders, the abilities carry
   the values that were in the note, and **Open as Markdown** shows the backstory
   prose still there, byte for byte, with only the `sheet-layout` line changed.
2. **Cold start.** *Press:* in **Settings → Sheetsmith**, point **Layout folder**
   at an empty folder (`Empty layouts`) — reversible, and nothing is moved or
   deleted → run **Create a character** → the notice naming **Add a starter
   layout**, and no modal → open `Ghost of a layout.md` → the same sentence
   inside the sheet's notice, and no button → point the setting back.
3. **Create.** *Press:* **Create a character** → the picker lists every layout in
   `Sheetsmith layouts` by name, including the D&D 5e Standard layout and the
   three starters → type a few letters and watch it narrow → choose one →
   `Untitled character.md` appears in whatever **Default location for new notes**
   says, opens as a sheet, and every card is editable and empty. Press once more
   → `Untitled character 1.md`, and the first is untouched. Rename either with F2
   and confirm the sheet keeps rendering.
4. **A layout that will not parse.** `Sheetsmith layouts/Broken.json` holding
   `{`. *Press:* **Create a character** → **Broken** is listed → choose it → the
   note is written and the sheet reports the parser's message in place, with no
   **Pick another layout** button beside it.

## Config fields

None. No component is added or changed: the feature registers a command, a
modal, and one button in an existing view.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |

## Data and file model

- **Written on create:** one file at
  `normalizePath('<getNewFileParent(source).path>/Untitled character[ N].md')`,
  whole content `---\nsheet-layout: <name>\n---\n`.
  **This bullet said the opposite and was wrong twice over, which is what
  shipped the bug the owner found in the app.** It claimed the vault root's path
  is `''` and that the join therefore had to be explicit. The root's path is
  `/`: Obsidian's own `normalizePath` answers `/` for an empty path, and
  `getNewFileParent` returns `vault.getRoot()` for the *default* **Default
  location for new notes**, so the root is the common case. It also blamed the
  stub for not stripping a leading slash — the stub was indeed wrong, and
  correcting the double is what made the defect visible, but the conclusion
  drawn from it was backwards: the fix is to use the app's function, not to
  hand-roll around a double that disagreed with it. Every path this feature
  builds now goes through `normalizePath`, exactly as `layouts.ts` has always
  built its five, so the check and the write cannot spell one path two ways.
- **Written on pick-another:** the `sheet-layout` line of the existing
  frontmatter, and nothing else in the file.
- **Round-trip (Constraint 3):** the created note satisfies
  `serialiseCharacter(parseCharacter(text)) === text`, and so does a note whose
  layout line was replaced. Both pinned, and each where its shape lives: the
  created note in `parse/character.test.ts` and on the bytes the vault actually
  holds in `characters.test.ts`, the repointed one in
  `view/pick-layout-flow.test.ts`, whose fixture carries several frontmatter
  keys, a preamble and two sections.
- **Read:** `listLayouts` for the candidate list. No layout file is parsed by
  this feature at all — not to draw a row, not to write a note.
- **Layouts:** never written, never moved, never validated here.
- **Existing character notes:** untouched on the create path; one line on the
  pick-another path, with every section retained whether the new layout maps it
  or not (SPEC §10, Constraint 4).
- **New modules:** `src/layout-picker.ts` and `src/characters.ts` at the root
  beside `layouts.ts` — the two file kinds this plugin owns, one module each —
  and `src/view/missing-layout.ts`. The picker is at the root rather than beside
  a consumer because its two consumers are in two different folders, so there is
  no "beside" that is not arbitrary; splitting the write out of it follows the
  seam that the modal is shared and the write is one caller's, where
  `starters/picker.ts` holds both because it has one caller.
- **Stub additions:** `FileManager.getNewFileParent` (returning a settable
  folder and recording the source paths it was asked for),
  `WorkspaceLeaf.setViewState` (recording the state requested), and
  `Workspace.getActiveFile` with a settable `activeFile` behind it — three
  members, because the source path the first one is asked about is the active
  file's and the app answers that from whichever leaf is active. All three are
  recorders or settable answers, so a consumer's test asserts them; none is a
  declared-and-not-honoured option, which is what `obsidian-stub.test.ts` exists
  for.
- **One stub *behaviour* changes:** `Vault.create` now refuses a path that is
  taken, as the app's does, and `obsidian-stub.test.ts` drives it. The dedupe
  loop above and `createLayout`'s duplicate refusal both name `vault.create` as
  the backstop behind them, and neither could show it while the double wrote
  unconditionally — a regression dropping either guard would have overwritten a
  reader's character note in the double and gone green, which is Constraint 4.
  Measured before taking it: no other suite depends on the permissive
  behaviour.

## Acceptance criteria

Twenty-one. The first sixteen are test names; the last five are a look inside
Obsidian, against the fixture above, because this feature's surface is in no PNG.

- [x] A test asserts the created note's whole content is
      `---\nsheet-layout: <name>\n---\n` — no sections, no preamble, no trailing
      blank line.
- [x] A test asserts `serialiseCharacter(parseCharacter(created)) === created`,
      and that `parseCharacter` gives back the chosen layout's name and zero
      sections.
- [x] A test asserts a layout name that needs no quoting is written plain, a name
      containing `:` or `#` or starting with a YAML indicator is written
      double-quoted, and both read back through `parseCharacter` as the name that
      was chosen.
- [x] A test asserts the note lands inside the folder `getNewFileParent` returns,
      and that the vault root (path `/`) produces `Untitled character.md` with no
      leading slash. *(The parenthetical read `''` when this was approved, which
      was the false premise behind the bug the owner found in the app; the
      substance of the criterion is unchanged and the test asserts the real root
      path.)*
- [x] A test asserts `getNewFileParent` is asked with the active file's path, so
      "Same folder as current file" can mean what it says.
- [x] A test asserts a second create writes `Untitled character 1.md` and leaves
      the first file's bytes untouched, and a third writes `Untitled character 2.md`.
- [x] A test asserts a refused `vault.create` returns `{ error }` and writes
      nothing, and that the caller shows that error in a `Notice`.
- [x] A test asserts the created file is opened in sheet view: the leaf's
      requested view state is `{ type: VIEW_TYPE_SHEET, state: { file: <path> } }`,
      and it is requested with `openInSheetView` both on and off.
- [x] A test asserts the picker lists every `.json` in the configured folder by
      basename, sorted, and lists a file whose JSON will not parse alongside the
      rest.
- [x] A test asserts a query narrows the list on the name and that a query
      matching nothing returns an empty list.
- [x] A test asserts an empty or absent layout folder opens **no modal** and
      produces the shared sentence, naming the configured folder rather than the
      default.
- [x] A test asserts the sentence has one owner: the command's `Notice` text and
      the text the sheet's notice renders are the identical exported string.
- [x] A test asserts the missing-layout notice draws the existing message
      verbatim plus one `<button>` reading **Pick another layout**, and that with
      an empty folder it draws the message plus the shared sentence and **no
      button**.
- [x] A test asserts the load-error state (a layout present whose JSON will not
      parse) draws the parser's message and no button.
- [x] A mirror test in the `promote-flow.test.ts` shape drives the pick-another
      wiring — `parseCharacter` → `withLayoutName` → `serialiseCharacter` — and
      asserts that only the `sheet-layout` line changed: every other frontmatter
      line, the preamble and every section body come back byte-identical, and a
      section the new layout does not map is still there with its values
      (Constraint 4).
- [x] `src/create-element-sites.test.ts` passes unchanged: no new hand-built
      element, every element through `createEl` or `ui/element.ts`. `npm test`,
      `npm run lint` at `--max-warnings 0`, and `npm run build` are green.
- [ ] **In Obsidian:** the picker reads as one of the app's own suggesters — the
      list is legible in both themes, the rows are the app's height, and the
      keyboard drives it (type, arrow, Enter, Escape) with nothing written on
      Escape.
- [ ] **In Obsidian:** the missing-layout notice reads as one thought — the
      message, then the button — with no cramped or floating gap, in both themes,
      and the button's focus ring is the app's own and is visible.
- [ ] **In Obsidian:** the cold-start sentence names the folder the setting
      actually holds, and reads as an instruction rather than an error, in the
      `Notice` and in the notice.
- [ ] **In Obsidian:** fixture state 1 end to end — the values in the note are on
      the cards after picking, and the unmapped section survives in Markdown
      view.
- [ ] **In Obsidian:** fixture state 3 end to end — two creates, two notes, both
      editable, and renaming one with F2 leaves its sheet rendering.

**The sixteen test criteria are ticked from the review reports; the five
in-Obsidian boxes are deliberately left open, and that is a record rather than an
omission.** The owner ran them, and the last one is what found the bug: **Create
a character** wrote `Untitled character` and did not open it, then failed on the
second run with `File already exists.` The cause was one fact — the vault root's
path is `/`, not `''` — and it is fixed, with the double corrected so a test can
see it and both weak criteria given teeth (§*Data and file model*, and
`PATTERNS.md` §11's row on stub fidelity). What has not happened is a *re-run* of
these five against the fixture on the fixed build. Ticking them from here would
be the session that wrote the code grading behaviour only the app can show, which
is the one thing a criterion marked **In Obsidian** exists to prevent, so they
stay open for whoever runs them.

## Commit boundaries

A plan for `/land-it`, not a schedule: the tree stays uncommitted through
implementation and every round of findings.

**Six, and the first was not in the plan.** The bug the owner found in the app
was one fact about paths held wrongly in two places at once — this feature's own
join, and the test double that agreed with it — so the two halves land
separately: the join is this feature's code and rides the commit that owns it,
while the double's correction is a fix to shared test infrastructure that every
suite in the repository leans on and stands on its own. **It goes first**, and
the order is forced rather than chosen: at that commit the feature does not
exist, so the suite passes with the corrected double, and every path assertion in
the commit after it is only meaningful once the double stops lying about what a
path is.

1. `test: Answer a path in the double the way the app answers one`. The obsidian
   stub's `normalizePath` transcribed from Obsidian 1.13.7's own implementation
   (both separators collapsed, leading *and* trailing slashes stripped, and `/`
   for what is left of nothing), `Vault.getRoot` at that `/`, `Vault.create`
   normalising before it checks and refusing a taken path in the app's own words,
   and the cases in `obsidian-stub.test.ts` that quote the deminified source for
   each. No plugin code, and it would still be the right commit if this feature
   were abandoned.
2. `feat: Write a character note from a chosen layout`. `src/parse/character.ts`'s
   layout-key writer, its quoting predicate and the `NO_LAYOUT_KEY` sentence both
   of its throwers now take (with `LAYOUT_KEY_LINE` built from `LAYOUT_KEY`, so
   the reader and the writer cannot drift); `src/characters.ts` with
   `createCharacter`, the deduped name and the parent lookup — its two gesture
   halves need the picker and the view type, so they land at 3; the stub's
   `getNewFileParent` and `Workspace.getActiveFile`, whose settable `activeFile`
   is what the source path comes from; the stub's `Vault.create` refusing a taken
   path, with its two cases in `obsidian-stub.test.ts`, because the dedupe loop
   here names that refusal as the backstop behind it; and their tests. **The
   join goes through `normalizePath` here**, which is the plugin half of the bug
   above: it is this commit's own code, and the check and the write have to spell
   one path or the dedupe loop calls a taken name free. No UI, and this spec
   rides here.
3. `feat: Offer the vault's layouts in a picker`. `src/layout-picker.ts` — the
   `SuggestModal` over `listLayouts`, which hands the modal back to its
   caller — and its test. **`layouts.ts`'s `hasLayouts` and `noLayoutsMessage`
   ride here too, with `src/layouts.test.ts`**: the sentence moved out of the
   picker module, but "when there is nothing to offer, say so" is part of the
   offer, and this is already the commit that lands a module nothing calls yet.
   The padded, mixed-case query case added to `starters/picker.test.ts` also
   belongs here — it is PATTERNS §1's guard over the normalisation this picker
   duplicates, so it has to arrive with the second copy. Still no caller.
4. `feat: Add a command that creates a character`. The command in
   `src/commands.ts`, `characters.ts`'s `openNewCharacter` and
   `chooseLayoutForNewCharacter`, the open through `sheetViewState` — extracted
   in `sheet-view.ts` because this commit is what makes its third consumer, so
   `view/auto-open.ts` and the **Open as sheet** command move onto it here — the
   stub's `WorkspaceLeaf.setViewState`, and the flow test. First point at which
   the feature works.
5. `feat: Offer another layout where a sheet names one that is missing`.
   `src/view/missing-layout.ts` and its test, `sheet-view.ts`'s branch with
   `repointLayout` and the `commit` tail it shares with the undo and the edit
   batch, `view/pick-layout-flow.test.ts` — the mirror, the two source scans and
   `loadLayout`'s two answers, which are the cut's own premise — and the one
   `sheet.css` rule if the look needed one.
6. `docs: Record the layout picker`. SPEC §8's last bullet now saying the offer
   exists and naming the cut it does not make, §7's pointer to the second
   cold-start command beside **Add a starter layout**, `docs/UI.md` §12's harness
   row gaining this feature's whole surface as a second recorded subject,
   `docs/PATTERNS.md` §11's row on the double's fidelity and the instrument it
   still wants, and this spec's status, its ticks and the one authorised
   correction to criterion 4's parenthetical. Written by `/land-it` as usual.

## Deliberately not doing

- **A "Character folder" setting.** Settled in the Model question: Obsidian
  already asks it once, globally.
- **Prompting for the character's name.** Settled there too. The app's rename
  gesture is better than any modal here, and the note's name is not a fact the
  plugin uses.
- **Pre-writing the note's sections.** Settled there. The first edit writes the
  section it needs.
- **The offer on the load-error branch.** Argued above: a layout that is present
  but broken is repaired, not abandoned.
- **A harness fix so a modal can be photographed.** `UI.md` §12's standing row;
  three jobs, and out of scope by the handoff. The design wave looks inside
  Obsidian instead.
- **`emptyStateText` on the picker.** The query-matched-nothing state stays the
  platform's, which is `starters/picker.ts`'s position unchanged.
- **Reading or validating layouts to draw a row.** A row is a name. A broken
  layout is reported where it breaks.
- **Tightening `NameModal` to refuse a layout name that is awkward as a YAML
  scalar.** The double-quoted fallback makes every such name work, so there is
  nothing to refuse; a stricter layout-name rule would be a diff of its own in a
  pane this feature does not touch.
- **A settings-tab entry point.** SPEC §7 keeps settings at two preferences and a
  button, deliberately — the same cut `starter-layouts.md` made.
- **Chaining any further surface after creation.** No "open the layout editor
  too", no template picker, no follow-up notice. The sheet is on screen and the
  user decides what happens next.
- **Duplicating a character, or creating one from an existing note.** Neither is
  this card; a note that already exists gets its property typed or picked.
- **Promoted fields, layout import and export.** Out by the handoff, and this
  feature piggybacks on nothing from either.
- **The README's status line and Install section**, still describing a
  pre-release BRAT install. Being corrected separately.
- **Anything mobile.** No device pass. What this feature draws follows `UI.md`
  §7's standing rules and that is the whole of it.
