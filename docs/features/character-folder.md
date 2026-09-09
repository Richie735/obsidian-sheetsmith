# Character folder

Status: shipped
Board card: 🛠 A setting for where a new character is written. A third
preference on the settings tab: the folder a new character note is written to.
Empty is the default and means exactly what happens today —
`app.fileManager.getNewFileParent(sourcePath)`, which is Obsidian's own
**Settings → Files and links → Default location for new notes**, "Same folder as
current file" included. A folder set means that folder, for every character the
plugin creates.

## Model question

**None of §13's, and §13 gains no entry.** No component is added, the component
contract does not grow, the catalog does not grow, and nothing is published to
formulas: this feature adds one key to `data.json` and changes which folder one
`vault.create` call writes into. §13 does **not** currently record a
disagreement about a character folder, so there is nothing there to resolve —
that is a fact worth stating rather than an omission to repair, and no `Resolved:`
entry is owed. The two §7 sentences that *do* describe today's behaviour are
amended instead (see *Commit boundaries*).

### The argument this amends, and why it survives as the default

`docs/features/layout-picker.md` §1 argued that this setting must not exist, and
`src/characters.ts`'s file header repeats it. **That position is amended by owner
decision and is not reopened here.** What follows is not a rebuttal, because the
argument is not wrong — it is where the default comes from.

The argument had two halves. The first is that Obsidian already asks this
question once, globally, so a Sheetsmith preference beside it is a second answer
to keep in sync. **An empty value is that half, kept and made the default**: out
of the box the plugin holds no opinion, `getNewFileParent` answers, and every
note-creating gesture in the app still agrees with every other. A vault that
wants characters landing in one place types a folder and the plugin obeys it;
a vault that does not, does nothing and gets the app's answer. So the field is an
override rather than a replacement, and the shipped behaviour of an untouched
install is byte-for-byte what it is today.

The second half is the asymmetry with the layout folder, and it stands **intact
and untouched**: a layout is looked up *by name inside* its folder, so the folder
is part of the lookup and the plugin cannot work without knowing it, which is why
that field's empty value falls back to the default folder name `Sheetsmith
layouts`. A character note is looked up by nothing — the note names the layout,
the layout never names the note, and the plugin finds a character because the
reader opened it. That is exactly why *this* field's empty value falls back to an
app setting instead of to a folder name of the plugin's own choosing. **The two
fallbacks differ deliberately, and the asymmetry paragraph is what justifies the
empty default rather than something the default contradicts.**

### Where the amended argument lives

**In place, in `docs/features/layout-picker.md` §1, kept whole under an
amendment note that points here.** Not moved, and not rewritten to say the
opposite of what it said.

Two reasons decide it. A feature doc with `Status: shipped` is a **record of a
decision that was taken and approved**, and rewriting its argument would erase
the reason the default is empty — which is the one thing this feature most needs
a future session to be able to read. And the repository already has an idiom for
exactly this: `docs/SPEC.md` §13 amends entries by prefixing "**Amended:** …"
and leaving the original prose standing, and layout-picker's own criteria carry a
parenthetical correction rather than a rewrite.

`src/characters.ts`'s header gets the opposite treatment, and the contrast is the
point: **that one is rewritten, because it is a comment on code that will no
longer do what it says.** A header asserting "no character folder setting, and
that asymmetry is principled" above a function that branches on a character
folder setting is a comment that lies, and `docs/PATTERNS.md` §9 has no tier for
that. It keeps the asymmetry sentence — the argument for the *empty default* — and
loses the sentence claiming the setting does not exist.

## What it does

The settings tab gains a third preference, **Character folder**, above the
sheet-view toggle and directly under **Layout folder**. Left empty, which is how
it ships, every character the plugin creates goes where Obsidian's **Default
location for new notes** says, including "Same folder as current file". Set to a
folder, every character the plugin creates goes there instead, whatever note the
gesture was run from, and the folder is created if it is missing.

It changes creation only. No existing note moves, nothing is rewritten, and a
character note can still be dragged anywhere in the vault afterwards without
breaking anything.

## Design

**The control is a free-text field, the same control as the layout folder row.**
Not a folder suggester, and the layout folder field is **left alone in this
pass** — neither its control nor its semantics change.

Three things decide it, and the first is the one that would survive even if the
other two were free. **The value that matters most is the one a suggester cannot
suggest.** Empty is this field's default and its most important setting, and a
type-ahead list of the vault's folders has no row for "no folder"; a
not-yet-existing folder, which is legal here by the decision below, has no row
either. So the control's two distinguishing values are both reached by ignoring
the suggester and typing. Second, **a suggester on one folder field beside free
text on the other is two spellings of one control**, so the honest version of
that choice is one pass over both fields, which is scope this feature does not
have and a change to a shipped control it was told to leave alone. Third, it
carries a test-double addition: neither `AbstractInputSuggest<T>`
(`node_modules/obsidian/obsidian.d.ts:294`) nor `Vault.getAllFolders(includeRoot?)`
(`:7531`) exists in `src/test/obsidian-stub.ts` — `getAllFolders` appears there
only inside a comment. Both API members are real and checked; the suggester is
recorded in *Deliberately not doing* with those two facts so a later session
starts from them rather than re-deriving them.

**No blur re-display.** `src/settings.ts`'s layout folder row installs a `blur`
listener that writes the effective value back into the input, and that listener
is **not** copied here. It is right where it is, because there an emptied field
means the default folder is in effect and a field left reading empty would be a
control lying about its value. Here empty *is* the value the reader chose, and
writing anything into the box on blur would take that choice away in the one
gesture — clear the field, click away — that expresses it. **An emptied character
folder field stays visibly empty.** A criterion pins it, as the mirror of the
layout folder case that asserts the opposite.

**Row copy** (sentence case, per `AGENTS.md`; `obsidianmd/ui/sentence-case`
warns and `npm run lint` runs at `--max-warnings 0`):

- Name: `Character folder`
- Placeholder: `Same as new notes` — so an empty field reads as deferring to the
  app rather than as unset. **Corrected under design review**, and the first
  spelling is worth keeping visible: it was `Default location for new notes`,
  which is 181px of text in a 146px box, so it rendered as a hard cut at
  "Default location for new" with nothing marking that more existed — and an
  empty field cannot reveal it, since `scrollWidth` equals `clientWidth` there.
  The input's width is not available to change (Obsidian sets none on a
  settings-row input, its own **Attachment folder path** included), so the string
  is what gives: a short *value* in the app's own terms, which is what every
  `setPlaceholder` in Obsidian is. Nothing is lost, because the full label path
  is in the description below, verbatim.
- Description, a plain string like the layout row's rather than a
  `createFragment`, and stating the consequence in both directions per
  `docs/PATTERNS.md` §8: `New characters are written here, and the folder is
  created if it is missing. Leave it empty to follow Settings → Files and links →
  Default location for new notes.` The spaces **inside** each multi-word app
  label are `\u00a0`, added under design review and written as source escapes:
  arrow notation is a quoted path, and a wrap mid-label opened a line with
  "links →", which reads as a step named "links". The spaces around the arrows
  stay breakable so the path still wraps at its own joints.
- Accessible name: `Character folder`, set as an `aria-label` on the input.
  Obsidian draws a row's name in a sibling element rather than a `<label for>`,
  so the field is otherwise programmatically nameless and a screen reader reads
  the placeholder — announcing this one as "Same as new notes", which never says
  *character*. The row's own visible words to the letter, per `docs/UI.md` §12
  and WCAG 2.5.3. The layout folder row has the identical gap and is **out of
  scope** by the decision below; its half is on the owner's ledger.

**Nothing is validated as you type.** A folder that does not exist yet is a legal
value, so there is no value to reject at type time and the field has no error
state of its own. What the field does to what is typed is trim it — the layout
row's own treatment — which is also what makes a field of spaces mean the empty
value rather than a folder named `   `.

**A configured folder that does not exist is created on write.**
`src/layouts.ts`'s `createLayout` (line 82) is the precedent and it is exact: a
configured folder that may not exist yet, guarded with `getFolderByPath` and
created with `createFolder`, **normalised once so the existence check and the
write use one spelling.** That last clause is not decoration — the bug documented
in `availablePath`'s header is what happens when two halves of one function
disagree about what a path is, and this branch adds a third half (the folder
check) to the same function. So `createCharacter` normalises the configured
folder once and hands that one string to the check, to `availablePath`'s dedupe
loop, and to `vault.create`.

Refusing instead — returning `{ error }` and making the reader create the folder
by hand — is defensible and was weighed. It loses on intent and on where the
work lands: a reader who typed a folder name into a field labelled "New
characters are written here" has expressed the intent, the plugin already creates
its own layout folder on the same evidence, and the alternative is a gesture that
dies with a message whose fix is a trip to the file explorer. The typo case is
what refusing buys, and what it costs there is an empty folder, which is the
cheapest wrong outcome in this plugin.

**Failure stays a value** (`docs/PATTERNS.md` §4). The folder creation happens
inside `createCharacter`'s existing `try`, so a `createFolder` that throws — a
file sitting at that path, a read-only vault — returns the same
`{ error }` arm with the vault's own message, no note is written, and
`openNewCharacter` shows it in a `Notice` exactly as it shows a refused write
today. There is no new error surface: the settings tab reports nothing, and the
failure appears where the gesture is (`docs/UI.md` §10).

**Corrected under review: "nothing is written" was too strong, and the branch is
the reason.** There are two writes in that `try` and they are ordered, so a
`createFolder` that *succeeded* followed by a `create` that failed leaves an
empty folder behind while the gesture reports an error. That is the same empty
folder this section already prices as the cost of a typo, so it is pinned by a
test rather than rolled back: deleting a folder the reader named, on the one code
path where the vault has just proved it refuses writes, is a second destructive
call bought with nothing. What the error arm promises is that **no note** is
written, never that nothing happened.

**Empty state of the surface.** The tab's own empty state is the shipped one: a
blank field showing its placeholder, under a **Layout folder** field showing a
real value. That contrast is the thing worth looking at in the harness, because
it is what tells a reader at a glance that one of these two fields has a default
and the other defers.

## Config fields

**No component's `configFields` change.** This is a plugin preference, so the
table below describes the settings key in the same terms `docs/PATTERNS.md` §8
asks of a config field.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `characterFolder` | text (settings-tab row) | Character folder | New characters are written here, and the folder is created if it is missing. Leave it empty to follow Settings → Files and links → Default location for new notes. |

## Data and file model

**Nothing about the character note changes.** The bytes a create writes are the
same bytes — `---\nsheet-layout: <name>\n---\n` — so Constraint 3 is untouched:
no parser, serialiser or round-trip is in this diff at all.

**Constraint 4 is untouched for the same reason.** The setting is read at create
time and nowhere else. Changing it moves no note, rewrites no note, and has no
effect on a character that already exists; a character note carries no record of
where it was created, so there is nothing about an existing note that can
disagree with a new value.

The key itself lives where the other two do, in the plugin's `data.json` through
`loadData`/`saveData`:

- `SheetsmithSettings` gains `characterFolder: string`.
- `DEFAULT_SETTINGS.characterFolder` is `''`, which is the argument above kept as
  the default.
- `main.ts`'s `loadSettings` guards it beside the layout folder guard, and **for
  this key the guard is a trim and not a fallback**: an empty persisted value is
  legal and stays empty. The guard exists at all because whatever the tab does to
  a typed value the loader must do to a persisted one, or the effective folder
  depends on whether the settings tab happened to be opened.

`createCharacter` grows a `folder` parameter, second, mirroring
`createLayout(app, folder, name)`. `openNewCharacter` is where
`plugin.settings.characterFolder` is read and passed, beside
`chooseLayoutForNewCharacter`'s existing read of `plugin.settings.layoutFolder`,
so the setting is read at the plugin boundary and `createCharacter` stays a
function of an app and a folder that a test can drive without a plugin.

## Acceptance criteria

Seventeen: fourteen are test names, one is a named line to read, one is a harness
shot, and one is in Obsidian against the fixture below. Three of the test names
were added under review — two with the copy they pin, one with the failure
ordering the prose had wrong.

- [x] A test asserts the settings tab's rows are exactly `['Layout folder',
      'Character folder', 'Open sheets in sheet view', 'Layout editor']`, in that
      order — the existing "exactly three rows" case grown to four rather than
      relaxed.
- [x] A test asserts the character folder stores what is typed, trimmed, and asks
      for the settings to be persisted.
- [x] A test asserts an emptied character folder stays `''` in the settings
      object **and that nothing is written into the box on `blur`** — the mirror
      of the layout folder's fallback case, which stays in the same file
      asserting the opposite. *Corrected under review:* the discriminating state
      is a field of **spaces**, not an empty one. A box reading `''` over a
      setting holding `''` agrees with itself whether the listener is there or
      not — a copied `setValue(settings.characterFolder)` writes `''` over `''` —
      so the `blur` has to be asserted where the two differ, which is the only
      thing trimming can produce: the box reads `'   '` and the setting reads
      `''`. The emptied-field gesture is still asserted; it is just not the half
      that can go red.
- [x] A test asserts `DEFAULT_SETTINGS.characterFolder` is `''`.
- [x] A test asserts an empty setting reproduces today's behaviour: the note
      lands in the folder `getNewFileParent` returns, and `getNewFileParent` is
      asked with the active file's path so "Same folder as current file" means
      what it says.
- [x] A test asserts a configured folder receives the note **and that
      `getNewFileParent` is never asked** — the stub's `newFileParentSources` is
      empty.
- [x] A test asserts a configured folder that does not exist is created, once,
      and that the note lands inside it.
- [x] A test asserts one spelling for the check, the dedupe and the write:
      `'Sheets//Characters/'` and `'Sheets/Characters'` produce the same path,
      and a second create in a configured folder writes
      `Untitled character 1.md` rather than colliding.
- [x] A test asserts a folder that cannot be created — a file sitting at that
      path — returns `{ error }` carrying the vault's own message and writes no
      note.
- [x] A test asserts the other order: a folder created, then a note refused,
      leaves the folder behind and still returns `{ error }`. The seventeenth,
      added under review — the code was always this way and the prose said
      "nothing is written", which only the folder-refused case makes true.
- [x] A test asserts `openNewCharacter` passes `plugin.settings.characterFolder`
      through: set it, and the created note is the one opened, at a path inside
      that folder.
- [x] `npm test`, `npm run lint` at `--max-warnings 0` and `npm run build` are
      green, and `src/create-element-sites.test.ts` passes unchanged.
- [x] **By reading `main.ts`'s `loadSettings`:** the new guard is a `trim()` with
      no fallback, sits beside the layout folder's fallback, and a comment says
      why the two differ.
- [x] A test asserts the field carries the row's own name as its accessible
      name, so a screen reader says *character* rather than reading the
      placeholder.
- [x] A test asserts the description holds each multi-word app label together,
      on the rendered text, so no line can open with `links →`.
- [x] **In the harness** (`npm run harness`, then `npm run harness:shot`):
      `settings-light.png` and `settings-dark.png` show four rows with **Character
      folder** second; its field is empty and shows the placeholder in the app's
      own muted placeholder colour, distinguishable at a glance from the
      **Layout folder** field above it holding a real value; the two fields align
      on the same right edge; and nothing is clipped — if the fourth row
      overflows the `1000,520` frame in `harness/shot.mjs`, the frame grows rather
      than the shot cropping. **And the description's two app labels each sit
      whole on one line**, so no line opens mid-label with `links →`: the test
      above pins the non-breaking spaces, but happy-dom performs no layout, so
      the wrap itself is only observable here. A *trailing* arrow at a line's end
      stays possible at some widths by design — the spaces around the arrows are
      deliberately breakable (`docs/UI.md` §12).
- [x] **In Obsidian**, against the throwaway vault
      (`~/Developer/sheetsmith-test-vault/`, whose layouts are in
      `Sheetsmith layouts/` and characters in `Characters/`): with a folder typed
      into the field, **Create a character** creates that folder where it does
      not exist and puts the note inside it, and the setting survives in
      `data.json`. No fixture layout or character is added for this — the vault's
      existing `Sheetsmith layouts/` and `Characters/` are the fixture, and what
      is being exercised is a settings field plus one command.

      **Narrowed at the land stop to what the hand pass actually exercised**, and
      it used to claim more: the empty field checked against both "Vault root"
      and "Same folder as current file", a folder typed from any note, and the
      cleared field staying visibly empty with the next create back at the app's
      location. What was run is the configured-folder half — `Characters/new`
      created on write with `Untitled character.md` inside it and
      `"characterFolder": "Characters/new"` persisted — which is deliberately the
      half no test can reach, because it is the only one that meets the
      adapter's real recursive `mkdir` rather than the double's.

      **Not exercised by hand**, and why that is acceptable rather than owed.
      Neither **Default location for new notes** variation was tried: the vault's
      `.obsidian/app.json` is still `{}`, so the app never moved off its default.
      And the cleared-field gesture left no evidence, since `data.json` still
      holds a configured folder. Each is covered by a test that exists — the
      empty default asking `getNewFileParent` with the source path, the app never
      being asked once a folder is set, and the emptied field staying empty on
      `blur`, which is the one the patterns axis proved falsifiable by mutation
      rather than vacuous. The residue is whether Obsidian's own
      `getNewFileParent` honours its own preference, which is that API's
      documented job and a code path this feature did not change.

## Commit boundaries

A plan for `/land-it`, not a schedule: the tree stays uncommitted through
implementation and every round of findings.

1. `feat: Offer a character folder on the settings tab`. `SheetsmithSettings`'s
   `characterFolder`, its empty default, `loadSettings`'s trim beside the layout
   folder's fallback, the **Character folder** row with its placeholder and
   description and **no blur listener**, and the `src/settings.test.ts` cases —
   the four-row list, the trimmed store, the stays-empty mirror, and the default.
   Also the **`eslint.config.mts` per-file `sentence-case` option** and
   `harness/settings-panel.ts`'s row count. Nothing reads the key yet; the tab
   and both harness shots are complete at this commit.

   The eslint block was **not** foreseen and should have been. This section's
   *Row copy* bullet names the rule, names `--max-warnings 0`, and then specifies
   a description containing arrow notation, which the rule reads as one sentence
   and asks to be lower-cased into a path Obsidian does not have. The collision
   was in the spec's own text; recorded here so the next reader sees it was
   foreseeable rather than discovering it a second time. What resolves it is an
   `ignoreRegex: ['→']` option scoped to `src/settings.ts` — an option rather
   than an `off`, so every non-arrow string in the file is still checked, and
   per file because it is the only file where an arrow reaches a string the rule
   can read.
2. `feat: Write a new character into the configured folder`. `createCharacter`'s
   `folder` parameter, the normalise-once branch, the folder created when
   missing, `openNewCharacter` passing the setting, the **rewritten
   `src/characters.ts` header**, and the `src/characters.test.ts` cases. This
   spec rides here.

   It also carries the **test-double work this spec priced at nothing**, which
   was an omission: the design section counted a stub addition against the
   folder suggester it declined and then assumed the folder *write* needed none.
   Criterion 9 is reachable only through it. `src/test/obsidian-stub.ts`'s
   `Vault.createFolder` gains the app's own normalise-then-refuse pair (it wrote
   unconditionally, so a file sitting at the configured folder's path could not
   be modelled at all), ancestor creation because the adapter's `mkdir` is
   recursive, and the root in the folder map because the app's `getFolderByPath`
   reads a `fileMap` whose `/` entry *is* the root — a value a reader reaches by
   typing `/` into this very field. Each is quoted from the deminified 1.13.7
   bundle and asserted in `src/test/obsidian-stub.test.ts`.

   And `src/folder-creation.test.ts`, which holds `createLayout` and
   `createCharacter` to each other over one set of folder-spelling cases.
   `docs/PATTERNS.md` §1 allows two copies of one behaviour only under a test
   that fails when they disagree, and this branch is the second copy; the
   `docs/PATTERNS.md` §11 row about `loadSettings`'s untested guards rides here
   too, because `characters.ts`'s header cites it. That file opens with an
   assertion on its **roster** rather than only its behaviour, because it is the
   permission slip for the duplication: an array of two iterated with nothing
   checking its contents halves silently, and the roster is also the trigger — a
   third writer of this policy turns the ladder from "guard" to "extract" and
   fails that line on arrival.
3. `docs: Amend where a character note is written`. The amendment note at the
   head of `docs/features/layout-picker.md` §1, keeping its argument whole and
   pointing here; and two `docs/SPEC.md` §7 edits — "Settings keeps two
   preferences and a button that opens the pane" becomes three preferences, and
   the **Create a character** bullet's sentence about the note's location gains
   the override, keeping the reason the default is the app's own setting. Docs
   only, and last, because it describes behaviour the two commits above have
   already made true. `/spec-review` checks that this commit exists.

   It carries three more doc edits, all found under review rather than planned.
   **`CLAUDE.md`**'s architecture bullet naming the settings tab, which is loaded
   into every session unconditionally and so is the copy of that count most
   likely to be read next. **`docs/UI.md`**'s own count, which the first pass
   missed: its harness section said the tab "is two preferences and a button",
   and that sentence is the standard a design review reads *while looking at this
   feature's own shots*. And **`docs/UI.md`** §12's new row for the quoted-path
   wrap — the rule (bind the labels, not the arrows), the three measurements that
   ruled out every alternative, and the technique's two costs.

   The counts in `docs/features/*.md` are records of positions held at the time
   and stay as they are; layout-picker's amendment note already disposes of its
   own.

## Deliberately not doing

- **The layout folder field does not change**, in either pass. Not its control
  (free text), not its `blur` re-display, not its empty-value fallback to
  `Sheetsmith layouts`, and **not its missing accessible name**. The asymmetry
  between the two fallbacks is deliberate and is what justifies this field's
  empty default; a finding that the two folder rows behave differently is that
  decision, not a gap. The accessible name is the one item on that list that is a
  **defect rather than a decision**: that row's input is programmatically
  nameless exactly as the new one was, a screen reader reads its placeholder
  instead, and the honest fix is one pass over both rows. It is named here so the
  cut is a recorded scope decision rather than something this document was silent
  about, and it is on the owner's ledger.
- **No folder suggester**, for either field. Recorded with what it would take, so
  it is not re-derived: `AbstractInputSuggest<T>`
  (`node_modules/obsidian/obsidian.d.ts:294`) and
  `Vault.getAllFolders(includeRoot?: boolean)` (`:7531`) both exist and are
  checked against the installed typings; neither is in
  `src/test/obsidian-stub.ts`, so it carries a stub addition; and it is honestly
  one pass over both folder fields rather than one, since a suggester beside free
  text is two spellings of one control.
- **No validation of the typed folder.** No "that folder does not exist" notice
  on the tab, no illegal-character check, no inline error state. A missing folder
  is created, and anything the vault genuinely refuses is reported as a `Notice`
  at the gesture through the existing `CreateResult` error arm.
- **No per-character or per-layout override.** One folder for every character the
  plugin creates.
- **No migration and no move.** Existing character notes stay exactly where they
  are; the setting is read at create time only.
- **The settings page revamp and the `getSettingDefinitions()` adoption.** The
  two blockers recorded in `src/settings.ts`'s header comment are unchanged by
  this row, and this row does not remove either of them: a trim is not a plain
  bind, and nothing here can render a definition-built tab.
- **`openInSheetView`** and anything else about how a sheet opens.
- **Nothing else from `docs/features/layout-picker.md`**: no name prompt, no
  change to `Untitled character` or its dedupe, no change to the picker, the
  missing-layout notice, or the bytes a new note holds.
- **No `docs/SPEC.md` §13 entry.** §13 records no disagreement about this
  setting, so there is none to resolve; the §7 sentences that describe the old
  behaviour are amended instead.
- **Rewording `Folder already exists.` — deferred by owner decision at the land
  stop, not overlooked.** Where a *file* sits at the configured folder's path the
  vault refuses with that sentence, and the reader meets it in a `Notice` at the
  moment no folder exists: it names the fault rather than the fix
  (`docs/PATTERNS.md` §4, judgement), and names neither the preference that was
  typed nor the file in the way. It was raised by the patterns axis, judged real,
  and held because a reword is the plugin improving on the vault's own words —
  which this document twice promises not to do, in *Failure stays a value* and in
  criterion 9 — so taking it means respelling that criterion first. The scope was
  closed rather than reopened.

  **Where to start, so it is not re-derived.** The spec axis proposed the better
  spelling of the criterion: assert that the plugin returns *whatever the vault
  threw, unmodified*, rather than asserting one literal sentence — drivable with
  a sentinel message from a stubbed `createFolder`, which pins pass-through
  without freezing the app's current wording into a fixture. With the criterion
  spelled that way, a wrapper naming the setting and the fix stops contradicting
  it, and the decision becomes purely one about the copy. The candidate weighed
  and not taken was `Could not create the character folder "<name>" — something
  is already at that path.`
