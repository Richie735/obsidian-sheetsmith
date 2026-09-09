# Layout import and export

Status: built
Board card: 📦 Layout import and export — SPEC §3.2 promises a layout can be
shared or published as a single file and §7's **Manage layouts** bullet lists
import and export among the six operations the pane offers. Neither exists. A
validated drop into the layout folder plus a copy out, not a format.

## Model question

**None of §13's, and §13 gains no entry.** §13 was read for *import*, *export*,
*share*, *publish*, *clipboard* and *file manager*: it records no disagreement
about any of them, and the only hits are the words "shared sheets" and
"published name" inside two unrelated entries. That absence is the answer rather
than an omission to repair — no `Resolved:` entry is owed and none may be
invented — so this feature goes straight to the design.

Every other question the step asks answers itself the same way. No component is
added and the contract (§4.1) does not grow; nothing new is published to
formulas; nothing is stored in a character note, so Constraint 3 has no new
round trip to keep and Constraint 4 has nothing to lose. The layout file format
is untouched: `parseLayout` gains no rule, `serialiseLayout` gains no key, and
the schema is exactly what it was. What this feature adds is two gestures over
bytes the plugin already knows how to read and write.

**One SPEC sentence is amended, and it is worth naming here rather than
discovering it in review.** §3.2 says "Layouts export and import as single
files." Import is a single file's worth of JSON and export hands over a single
file's worth of JSON, but **export does not write a file**, because it cannot:
`Vault` reaches nothing outside the vault, there is no file-save dialog in the
public API, and `isDesktopOnly` is `false`, so the Electron routes that would
give one are closed by the manifest. The unit that travels is still one
self-contained layout. The sentence is amended to say so (see *Commit
boundaries*).

## What it does

The layout editor's **Layout file** row gains two things. A copy button beside
the existing delete button puts the open layout's JSON on the clipboard, so a
layout can be pasted into a message, a forum post or a gist — the one route out
of the vault that exists on desktop and on mobile. An `Import a layout…` option
in the same row's dropdown, beside `New layout…`, opens a modal with a paste box
and an optional name; **Import** validates the JSON through the same gate every
layout in the vault passes, writes it into the configured layout folder under
the name inside it, and opens it in the pane.

Nothing is overwritten in either direction. A name the layout folder already
holds is refused in `createLayout`'s own words, and export writes nothing at
all.

## Smallest version

The copy button, and the `Import a layout…` option opening a modal with one
paste box and an **Import** button. It gives up the optional **Name** field (so
a taken name is a dead end until the user deletes the existing layout), the
modal staying open on a refusal (so a rejected 23KB paste is pasted again), and
the harness shot. `installLayoutSource` is **not** cut: parse-before-write is
the guarantee that a refusal leaves the vault untouched, and two copies of that
ordering is precisely what PATTERNS §1 forbids at two consumers without a
guard.

## Design

### What export is

**Export is one small gesture, not a feature, and it is a copy out rather than
a format.** A layout is already a plain `.json` file inside the vault, so
nothing here needs to serialise anything; the only thing missing is a way to get
those bytes somewhere a person can send them. Three candidates were on the
table and two are closed:

- **A copy to a chosen vault location.** The file explorer already does this,
  and it gets the layout no closer to leaving the vault. There is also no
  folder-picker API to choose the destination with — only free text or a
  suggester over folders — and a second copy of a layout inside the vault
  invents a name collision (PM question 4's second direction) for no gain.
  Refused.
- **Revealing the file in the system file manager.** Desktop only, and
  `isDesktopOnly` is `false`. It is also a different gesture — "show me where
  this lives" — rather than an export. Refused.
- **The JSON on the clipboard.** Works on both platforms, through an API this
  repository already uses (`src/editor/copyable-name.ts`), and it is the only
  one of the three that actually crosses the vault boundary. Chosen.

**The file's own bytes go on the clipboard, unchanged.** No `parseLayout`, no
`serialiseLayout`, no gate: the card says *a copy out, not a format*. Three
reasons hold it there. A layout carrying a key this version's parser does not
know would have that key silently dropped by a parse-then-serialise round trip,
which is the one thing a share must not do. §3.2's "validates rather than copies
bytes" rule is about the *install* path — one writer, one spelling, for bytes
landing **in** a vault — and export writes nothing, so it has no writer to be
the one. And the canonical spelling is applied at the receiving end anyway,
where the file is actually created, which is the right place for it. A layout
that will not parse is exportable on purpose: the pane already draws *"This
layout cannot be edited until its file is fixed"* directly below this row, and
handing the broken file to someone who can read it is a reasonable thing to want
to do.

The consequence is worth stating: a layout exported and then imported comes back
byte-identical when it was written by the plugin, because `serialiseLayout` is
what wrote it in the first place. That is a property, not a promise — Constraint
3 is about character notes, and §3.2 already says layout files carry no
byte-identical guarantee.

### What import accepts

**Pasted JSON text.** Not a `.json` file chosen from the vault, on three
grounds, the first of which is the one that would decide it alone:

1. **Import has to accept what export produces.** Export puts text on the
   clipboard. A file-only import would not accept the plugin's own output
   without the user first turning the clipboard into a file, which is the step
   the vault boundary makes hard in the first place.
2. **A `.json` file already in the vault barely needs importing.** Whoever can
   drop a file into the vault can drop it into the layout folder, where it *is*
   a layout. What such a file needs is not a copy but validation and a name, and
   both of those are what pasting gets it too.
3. It costs a `Vault.getFiles()` double the stub does not have (see *Deliberately
   not doing*) and a policy for which of the vault's `.json` files are
   candidates, including the layout folder's own — a self-import.

The gate is `parseLayout`, the same one every vault layout passes, and the name
written is the name inside the JSON, exactly as `installStarter` does it. The
file that lands is what `serialiseLayout` says, through `createLayout`, so there
is one writer and one spelling.

### Where each half is offered

**Both live on the pane's Layout file row, and neither is a palette
command.** The rule the row already follows is worth writing down because it
decides both placements: the dropdown's entries all answer *which layout is
open* — including `New layout…`, which ends with a different one open — and the
extra buttons all *act on the layout that is open*. So `Import a layout…` is a
second dropdown option, and export is a second extra button beside the trash.

**Add a starter layout**'s argument does not transfer, and it is not inherited
here. That command is a command because cold start is the one moment no pane,
file or state exists to condition on (SPEC §7), and neither of these gestures is
cold start: the reader is holding a layout somebody sent them, or looking at one
they already have open. Import belongs on the row because the pane is what owns
the layout folder, and the gesture sits beside the other operations on that
folder rather than in a second place. Export is clearer still: it acts on the
open layout, which is state only the pane has, and a palette command would have
to ask *which layout* with a second suggester to answer a question the pane has
already answered. A palette entry for either half is recorded in *Deliberately
not doing* so a reviewer does not report its absence as a gap.

**Corrected after the build: cold-start import is *not* reachable from the
pane.** An earlier draft of this section argued that it was — that the **Layout
file** row "renders with zero layouts in the folder", so the dropdown would offer
`Import a layout…` to an empty vault — and that is false. `render` returns early
to `renderVacant` when the folder holds no layouts, which draws *"No layouts
yet."* and a **Create layout** button and nothing else: no row, no dropdown, no
option. So a first layout arrives by the **Add a starter layout** command, by
**Create layout**, or by hand, and only then is import reachable. That is an
open gap rather than a solved case, recorded in `docs/BACKLOG.md` and left where
it is: the honest fix is a **Manage layouts** surface designed against all six
of SPEC §7's operations at once (*Deliberately not doing*), not an extra control
bolted into the vacant state. **The placement cut above does not rest on it** —
the two legs that carry it are the pane owning the folder and export acting on
pane-only state, and neither mentions an empty vault.

### The import modal

Obsidian's `Modal` with `Setting` rows, titled **Import a layout**, beside its
one consumer in its own module — `ConfirmModal`'s, `NameModal`'s and
`StarterModal`'s shared precedent, and PATTERNS §1's "one consumer earns no
generalisation".

- **Layout JSON** — a textarea, placeholder *Paste the layout's JSON here*. A
  few rows, deliberately: a real layout is 7-24KB (the bundled starters measure
  7,420, 21,786 and 23,538 bytes) and nobody reads that in a textarea. It is a
  paste target, not an editor.
- **Name** — a text field, empty by default, described as *Leave empty to use
  the name inside the JSON. Change it here if the layout folder already holds
  that name.* Empty-means-the-default is `docs/features/character-folder.md`'s
  own shape. When it is filled, the parsed layout's `name` is replaced with it
  before the write, so the filename and the `name` key still agree — the
  invariant every other path in the plugin relies on (`loadLayout` looks a
  layout up by filename; `listLayouts` lists basenames).
- **Cancel** and **Import**, in `ConfirmModal`'s button order. **Import** is
  disabled while the paste box is blank or whitespace, for `NameModal`'s stated
  reason: a live button that silently does nothing is indistinguishable from a
  broken one. **This one may disable**, and the paint gap priced below does not
  reach it: `NameModal`'s **Create** is the same control in the same shape of
  modal and has shipped that way, and `docs/BACKLOG.md`'s *"A disabled control
  looks exactly like an enabled one"* row is about `.clickable-icon`, which a
  text button in a modal is not.

**On a refusal the modal stays open with the paste and the name exactly as
typed, and the reason arrives as a `Notice`.** This is the one place the design
departs from `StarterModal`, which closes and announces. It departs because the
input here is expensive to reproduce — a 23KB paste and a typed name — and
because the fix for the commonest refusal is *in the modal*: a taken name is
answered by typing a different one in the box that is already on screen.

**The reason is a `Notice` rather than a message drawn in the modal, and the
vocabulary that had to be weighed is the problem list rather than
`showFieldError`.** `docs/UI.md` §9 carries *a problem list under a textarea
field* — `.sheetsmith-field-problems`, `-problem`, `-problem-line`, used by the
function library, the reset triggers and the bonus types — and the import paste
box is a textarea, so that is the shape-matched vocabulary and it is the one to
answer.

Scoping is the question that would have closed it, and it does not: every rule
in that set is a bare class, or a class with `:not(:empty)`, competing with
nothing Obsidian sets on a `div`, so all four **would** paint inside a `Modal`.
So the reason to decline is design fit, and there are two.

First, **the vocabulary is shaped for a list of lines and this is one
document.** Its own rules say what they are for: a line-number locator quieter
than the message, and the offending text echoed in the field's own font so the
eye can match the two. A pasted layout is one JSON document with one problem at
a time and no line to number — and the refusal that matters most here, a taken
name, is not about the paste box at all but about the field below it. Second,
`editor.css` excludes this case in words: the problem list is *"not the bordered
box that means a layout file is unreadable: a line being typed is work in
progress"*. A paste that will not parse is precisely a layout file that is
unreadable, which is the treatment that comment distinguishes itself **from**.

Borrowing it would also buy nothing this design is short of. It keeps the
no-new-CSS claim either way, and a `Notice` over an open modal is Obsidian's own
chrome with the text preserved behind it. (`showFieldError`, the other
candidate, is closed on the scoping question the problem list survives:
`.sheetsmith-field-error` would colour the text, but
`.sheetsmith-input-invalid`'s outline is scoped to
`.sheetsmith-layout-editor-pane` and would not paint on a modal's textarea, so
the marked-field half of it would silently go missing.)

On success the modal closes, the pane releases the open layout, selects the
imported one and redraws — `createLayoutNamed`'s existing tail, reused rather
than respelled.

### The export button

An `addExtraButton` with the `copy` icon and the tooltip **Copy layout JSON**,
beside the delete button on the same row. It reads the selected `TFile` and
hands the text to the clipboard.

**It does not disable**, and this is a priced decision rather than an omission.
It guards and returns where no layout is selected, which is `deleteLayout`'s
existing spelling one control to the right.

*Corrected after the build: this paragraph named the wrong state.* It said "a
vault with no layouts at all, where the dropdown holds nothing but `New
layout…`" — a state that does not exist, since a folder with no layouts draws
`renderVacant` and no row at all (see *Where each half is offered*). The state
the guard actually answers is a **stale control**: the row's controls close over
the file list they were drawn with, so deleting the open layout leaves the copy
icon in a replaced DOM with `layoutName` already null. That race is real, is
what the case drives, and is the same one the trash beside it has always
guarded.

Disabling it is what an earlier draft of this spec said, and it is wrong here
for a reason `docs/BACKLOG.md` already records. *"A disabled control looks
exactly like an enabled one"*: `setDisabled` reaches no paint, Obsidian carries
no `is-disabled` rule for `.clickable-icon`, and that row is explicitly waiting
on **a decision covering all four reorder controls**. `docs/UI.md` §6 is the
rule it is measured against — state that never reaches the paint is half a
control. So a disabled copy icon would look identical to a live one and still do
nothing when pressed, which is the wart disabling was meant to remove rather
than a fix for it, and it would make this feature the **fifth** invisible-disabled
control on a row waiting for one decision about four. That decision changes
shipped controls and this feature is not authorised to take it.

The honest cost, stated rather than hidden: a copy icon left behind by a redraw
is pressable and does nothing, exactly as the delete icon beside it already
does. The fix for both is the paint decision the backlog row is waiting on, and
this feature leaves that row where it is rather than growing its population.

### Failure, in both halves

Failure is a value at the write (PATTERNS §4) and a `Notice` at the surface,
which is `installStarter`'s shape and the reason its `InstallResult` is one type
with two arms: the surface that announces either is one notice.

| Arm | What the user sees | State of the vault |
| --- | --- | --- |
| Paste is not JSON | The parser's own sentence, e.g. *Layout file is not valid JSON: …* | Untouched |
| JSON has no `name` | *The layout needs a non-empty "name" string.* | Untouched |
| Name the folder already holds | *A layout named "X" already exists.* | Untouched, **including the existing file's bytes** |
| The write itself fails | The vault's own reason — a name carrying `/` whose folder does not exist, a read-only vault, a file sitting where the folder must go | Whatever the vault did; no layout was replaced |
| Export: clipboard refused | *Could not copy to the clipboard.* | Untouched |
| Export: file cannot be read | The vault's own reason | Untouched |

**Name collisions, in both directions.** Import refuses, always, and does not
overwrite and does not suffix: the existing file may be the user's own edited
copy, and both silent answers destroy it (Constraint 4). The refusal is
`createLayout`'s own sentence, and the **Name** field is what makes it
actionable — the user's explicit call, made in the modal, rather than a rename
the plugin performs on their behalf. Note what this is *not*: renaming an
existing layout would have to migrate every character note's `sheet-layout`,
which is the deferred rename work. Naming a layout that does not exist yet
references nothing and migrates nothing. In the export direction the collision
question dissolves, because nothing is written; if export ever grows a
destination, `createLayout`'s refusal is the call to make there too.

### Why this is worth building

The closest prior art has an open defect on exactly this gesture. Custom System
Builder issue 516, open since December 2025, reports that importing JSON into an
existing item template *"gets automatically deleted afterwards without
warning"* — import destroying the thing it imported into; in the same tracker,
import is the second way a template disappears. Every criterion below about a
refused import leaving the vault untouched exists because of that report, and
the design's answer to it is structural rather than careful: **import has no
gesture that targets an existing layout at all.** There is no overwrite, no
merge, no "import into". A taken name is a refusal before anything is written.

The other half of the evidence is why this belongs in the plugin rather than in
the file explorer. Custom System Builder's community sheet library is its
content strategy — per-system templates published independently — and that is
how a builder shipping no rules content of its own answers cold start.
Single-file import and export is the mechanism that makes such sharing possible
at all. It does **not** license building the library: a browsable gallery was
refused when the starters shipped, and §11 bans bundled rules content. This
feature ships the mechanism and no index.

### What it reuses, and the one refactor it makes

The refactor is one, and it is `installLayoutSource`. Export's clipboard write
is explicitly **not** a second one; the reason is in *Deliberately not doing*.

- `createLayout` — folder creation and the taken-name refusal, unchanged.
- `parseLayout` / `serialiseLayout` — the one gate and the one spelling.
- `Notice`, `Modal`, `Setting`, `addTextArea`, `addText`, `addButton`,
  `addExtraButton`, `addOption` — Obsidian's own chrome throughout.
- `createLayoutNamed`'s tail for "now open the layout that just landed".

**`installStarter`'s body moves to `layouts.ts` as `installLayoutSource(app,
folder, source: string, rename?: string)`, and `installStarter` delegates to
it.** *The fourth parameter is an amendment made during the build: this line read
three arguments, and three cannot serve criterion 7, which wants the typed name
inside the written file as well as in the filename. The two three-argument routes
are both worse — a `parseLayout` in the modal duplicates the gate, and a rename
after the write is a second write, which is the overwrite this feature forbids
outright. So the override goes where the ordering already is, and blank-means-
absent is the callee's rule so a caller offering an optional name does not also
own what an untouched box means.* **The `ok` arm also carries `name`**, the name
the write settled on, for the same reason read one step on: a caller that
re-derived it would hold a second copy of the blank-means-absent rule, and the
two could silently disagree about which file a notice names and which one the
pane then opens. The extraction stands on **one** thing, and it is the
*ordering*: parse the source, and only
then call `createLayout`, so a refusal writes nothing. That order is the whole
of this feature's data-safety claim and the whole of the answer to the defect
under *Why this is worth building* — it is not a convenience, it is the reason a
refused import cannot cost anyone a layout. Two copies of a guarantee like that
is precisely what PATTERNS §1 forbids at two consumers without a guard, and the
guard is not available: a test over the two copies could assert nothing except
that they still call things in the same order, which is what one name says for
free. `InstallResult` moves beside the function it belongs to; `layouts.ts`
already owns `createLayout`, `nameAlreadyDeclared` and `noLayoutsMessage`, so a
fourth thing that knows how the layout folder is written is at home there. The
proof the extraction changed no behaviour is `src/starters/picker.test.ts`,
which passes with **two additive assertions and no other change** — see
criterion 16, amended after the build for the `name` key documented above.

One sentence comes along with it — `Added "X" to <folder>.` — and it is a
*consequence* of the extraction rather than a reason for it. Worth saying which
way round that is: it is not obvious that an import should say "Added", and a
later session that wants different words for it must be free to add a parameter
or split the sentence out rather than treat the shared copy as a constraint the
ordering imposed on it. The ordering is what may not be duplicated; the wording
is negotiable.

### Pixels

**None of its own.** One `addExtraButton`, one `addOption` on an existing
dropdown, one `Modal` of `Setting` rows, and `Notice`s. No new class name, no
rule under `src/styles/`, nothing inside `.sheetsmith-view`, and no change to
the sheet. This is `docs/features/starter-layouts.md`'s position held: every
surface is Obsidian's own chrome. The only appearance change in the repository
is that the pane's **Layout file** row now carries two buttons and the dropdown
one more option, which the existing editor harness shots capture for free.

**One instrument cost, named so it is not discovered as a red suite.** `copy` is
a Lucide icon the plugin has never asked for, and `harness/stub-icons.test.ts`
goes red for any icon `src/test/obsidian-stub.ts` has no path for — the stub
paints the icon's *name* as text instead, which passes unit assertions and
silently ruins the review. So the `copy` path is added to the stub in the same
commit as the button.

## Config fields

None. No component is added, no `configFields` are declared, and no key is added
to the layout schema or to `data.json`. The configured layout folder
(`settings.layoutFolder`) is read, not changed.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| — | — | — | This feature declares no config fields. |

## Data and file model

**Import writes exactly one file and reads nothing else.** The path is
`<layoutFolder>/<name>.json`, the folder is created when missing (by
`createLayout`, which already owns that), and the bytes are `serialiseLayout`'s.
No existing file in the vault is read, modified, moved or trashed. No character
note is opened, so every `sheet-layout` in the vault still names whatever it
named before, and Constraint 4 has nothing to say here beyond the refusals
above.

**Export reads one file and writes nothing.** The clipboard is not the vault.

**Nothing about the layout format changes.** `parseLayout` gains no rule and
`serialiseLayout` gains no key, so a layout file written before this feature
imports and exports identically to one written after it. An imported layout is
an ordinary layout the user owns from the moment it lands — `installStarter`'s
own words — and a later plugin version rewrites nothing.

**Round trip.** Export then import returns a byte-identical file for any layout
the plugin wrote, because `serialiseLayout` wrote it both times. For a
hand-edited file the bytes may differ after the round trip (whitespace, key
order, a key the parser does not know), and that is correct: §3.2 says layout
files carry no byte-identical promise, and Constraint 3 is about character notes.
The export half is what preserves the original exactly, which is why it copies
bytes rather than reformatting them.

## Acceptance criteria

Twenty-one: fourteen are test names, two are existing suites that must stay
green — one with its file unmodified and one with the two additive assertions
criterion 16 names — three are things to read in the diff, one is a harness
shot, and one is the toolchain.

- [x] A test asserts pasted JSON writes `<folder>/<name inside it>.json`, that
      the folder is created when it was missing, and that the file's bytes are
      `serialiseLayout`'s.
- [x] A test asserts the success notice is `Added "X" to <folder>.` — the one
      sentence, from the one writer, in the same words `installStarter` gives.
- [x] A test asserts text that is not JSON writes **no file at all** and reports
      the parser's own sentence. **The layout folder** holds exactly the files it
      held before, asserted as a count and not only as an absent path.
      *Amended after the build from "the vault": the count runs through
      `listLayouts` over the configured folder, because
      `src/test/obsidian-stub.ts` has no double for `Vault.getFiles()` and this
      feature reserves adding one for the deferred file-chosen import (below).
      That folder is everywhere this feature can write, so the criterion is met
      where it is claimed; two limits — direct children only, and `[]` where the
      folder's own path is held by a file — are `docs/BACKLOG.md` rows and are
      documented at the helper.*
- [x] A test asserts JSON with no `name` writes nothing and reports
      `The layout needs a non-empty "name" string.` — **whether or not a name
      was typed**, which a second case pins. *Amended after the build from "and
      no name typed", which two of this document's three passages on the field
      already contradicted: `parseLayout` is the one gate and it runs before
      `rename` by design, so a source with no name is refused before an override
      can reach it. That is the intended answer rather than a limitation — a
      layout with no `name` is malformed, and inventing one on the author's
      behalf is the plugin editing content it does not own. The **Name** field's
      own copy says "change it here", not "supply it".*
- [x] A test asserts a name the folder already holds writes nothing, reports
      `A layout named "X" already exists.`, **and leaves the existing file's
      bytes unchanged** — the criterion Custom System Builder issue 516 is the
      evidence for.
- [x] A test asserts a destination write that fails — **a file sitting where the
      layout folder must go** — reports the vault's own reason, creates no
      layout, and leaves that file's bytes unchanged. *Amended after the build
      from "a `name` carrying `/` whose folder does not exist": Obsidian's
      adapter writes through `fs` and gives `ENOENT` there, while
      `src/test/obsidian-stub.ts`'s vault is a flat map of paths and writes it
      happily, so a green case over that arm would be an instrument kinder than
      the thing (`docs/UI.md` §11). Changing the double's `create` semantics
      touches 3289 tests and is a `docs/BACKLOG.md` row instead. The named arm
      is one of the three this feature's own failure table already lists.*
- [x] A test asserts a typed **Name** overrides the name inside the JSON, that
      the file lands under the typed name, and that the `name` key inside the
      written file is the typed name too — filename and `name` still agree.
- [x] A test asserts the modal stays open on a refusal with the pasted text and
      the typed name still in their boxes, and closes on success.
- [x] A test asserts **Import** is disabled while the paste box is blank or
      whitespace.
- [x] A test asserts a successful import leaves the pane open on the imported
      layout.
- [x] A test asserts export puts the file's **own bytes** on the clipboard,
      driven by a file whose formatting `serialiseLayout` would spell
      differently — the case that can go red if export ever starts reformatting.
- [x] A test asserts the export notice names the layout, and that a rejected
      clipboard write reports `Could not copy to the clipboard.` and nothing
      else happens.
- [x] A test asserts export reports the vault's own reason when the file cannot
      be read.
- [x] A test asserts that pressing export with no layout selected puts nothing
      on the clipboard and shows no notice — the guard, not a disabled state.
      **The state is a control a redraw left behind**: delete the open layout
      through its own trash, then press the copy icon the replaced DOM left
      detached. *Amended after the build: this criterion's reason was "a vault
      with no layouts at all", which does not exist — such a folder draws
      `renderVacant` and no row. The guard and the case are unchanged; only the
      state they were said to answer was wrong, and the stale-control race is
      the one that is real.*
- [x] **By reading the diff:** no `.clickable-icon` added by this feature calls
      `setDisabled`, so `docs/BACKLOG.md`'s invisible-disabled row keeps the
      population of four it is waiting on a decision about. The one control that
      does disable is **Import**, a text button in a modal, on `NameModal`'s
      shipped precedent.
- [x] `src/starters/picker.test.ts` passes with **two additive assertions and
      nothing else changed** — a `name: 'Starter Forged in the Dark'` key added
      to the two `toEqual` calls at its lines 57 and 141, and no other edit to
      the file. *Amended after the build from "passes **unmodified**": the
      patterns axis required `InstallResult`'s `ok` arm to carry the name the
      write settled on, because a caller re-deriving it holds a second copy of
      the blank-means-absent rule and the two can disagree about which file a
      notice names (`docs/PATTERNS.md` §1's one-step tier). A widened arm makes
      every existing `toEqual` on it fail by shape, so the two keys are the
      mechanical consequence rather than a licence.* **What still holds is the
      whole of what the criterion was for**: the sentence is the same, the file
      written is the same, every refusal arm is unchanged, and not one assertion
      was weakened, removed or retargeted.
- [x] **By reading the diff:** `src/editor/copyable-name.ts` is unmodified and
      no `src/ui/clipboard.ts` exists — the proof the second refactor was cut
      rather than quietly kept.
- [x] `harness/stub-icons.test.ts` is green, meaning `copy` has a real Lucide
      path in `src/test/obsidian-stub.ts` rather than falling back to painting
      the word.
- [x] **By reading the diff:** nothing changes under `src/styles/` and
      `styles.css` is untouched. Every new string is sentence case.
- [x] **In the harness** (`npm run harness`, then `npm run harness:shot`):
      `editor-light.png` and `editor-dark.png` show the **Layout file** row
      carrying the copy button beside the trash, both drawn as Obsidian
      clickable icons at the same size, in both themes, and the row not
      wrapping at full width. *Amended after the build: the shots are named
      `editor-light.png` and `editor-dark.png`; there is no `editor.png`.*
      **The dropdown half of this criterion is not checkable in a still** and
      is asserted in the cases instead: a native `<select>` renders only its
      selected option, so `Import a layout…` under `New layout…` cannot appear
      in a PNG, and `layout-editor.test.ts` holds the option list as
      `['Test sheet', 'New layout…', 'Import a layout…']`. Ticked on the icon
      half looked at, plus that case.
- [x] `npm test`, `npm run lint` at `--max-warnings 0`, and `npm run build` are
      green.

## Commit boundaries

A plan for `/land-it`, applied once at the end. The tree stays uncommitted
through implementation and every round of findings.

1. `refactor: Move the validated layout write beside the folder it writes to`.
   `installLayoutSource` and `InstallResult` in `src/layouts.ts`;
   `installStarter` delegates; `src/starters/picker.test.ts` green, with only
   the two additive assertions criterion 16 names.
2. `feat: Copy the open layout's JSON to the clipboard`. The extra button on the
   **Layout file** row, the `copy` Lucide path in the stub, and the export
   cases. `copyable-name.ts` is not touched.
3. `feat: Import a layout from pasted JSON`. `src/editor/layout-import.ts` with
   the modal, the `Import a layout…` dropdown option, and the import cases.
4. `docs: Record how a layout leaves and enters a vault`. §3.2's "export and
   import as single files" amended to say that import takes a single layout's
   JSON and export hands one over, and why the vault boundary rules out writing
   a file; §7's **Manage layouts** bullet marked for these two of its six
   operations, with the row rule (dropdown chooses which layout is open, buttons
   act on the open one) and the argument that neither half is a palette command;
   §12's M5 row updated; this feature doc's status.

## Deliberately not doing

- **An explicit Manage layouts surface**, deferred as one future route rather
  than as part of this feature. `SPEC` §7 promises six operations on that row —
  create, duplicate, rename, delete, import, export — and three of the six still
  do not exist, so the row's presentation is to be redesigned against all six at
  once rather than bolted onto two more. **It is also the answer to the
  cold-start gap** recorded under *Where each half is offered*: a surface built
  for all six has to decide what it offers a folder holding nothing, which is
  exactly the question `renderVacant` currently answers with **Create layout**
  alone. So the two are one piece of work, and neither is this one.
- **Duplicate and rename**, the other two operations §7's **Manage layouts**
  bullet promises and which also do not exist. Their own work. Note that
  renaming an existing layout is genuinely harder than it looks — every
  character note's `sheet-layout` names the file — which is why the **Name**
  field on import is not a down payment on it: it names a layout that does not
  exist yet and so migrates nothing.
- **Component rename migration**, §10's rename promise. Its own backlog item.
- **A layout library, gallery or index.** Refused when the starters shipped, and
  §11 bans bundled rules content. This ships the mechanism sharing needs and no
  catalogue.
- **Any change to the layout format, the schema, or `parseLayout`'s rules.**
- **The starter layouts and their command.** `src/starters/picker.ts` keeps its
  gesture, its modal and its tests; the only change to it is the delegation in
  boundary 1, and its cases must pass to prove it — with no assertion weakened
  or removed, and the two additive keys criterion 16 names as the only edit to
  the file.
- **Importing a `.json` file chosen from the vault.** Two facts for whoever
  picks this up rather than a re-derivation: `Vault.getFiles(): TFile[]` is real
  (`node_modules/obsidian/obsidian.d.ts:7549`) and `src/test/obsidian-stub.ts`
  has no double for it, so a suggester over the vault's own files costs a stub
  addition plus a policy for which `.json` files are candidates — including the
  layout folder's own, which would be a self-import.
- **A palette command for either half.** The argument is in *Where each half is
  offered*; the short form is that the pane already holds the state both
  gestures need and is itself one command away.
- **Sharing the sentence a failed copy gives.** Export spells *Could not copy to
  the clipboard.* at its own site, and `src/editor/copyable-name.ts` keeps its
  copy. *Corrected after the build: this bullet said that file's header "already
  ruled on this exact extraction". It does not — the header argues only why the
  module exists rather than living in `list-fields.ts`, and says nothing about
  the clipboard write or about this sentence. `src/ui/clipboard.ts` is still
  withdrawn, on the two arguments below, which are the file's own rather than a
  citation of it.* **`copyableName` exports a builder for a `<code>` control
  with the copy bound inside it**, so a settings-row button cannot reach the
  write without splitting a shipped function for the benefit of one caller. And
  **only half of what such a module would hold is common**: the failure sentence
  is shared, while the success sentences are not — a chip says `Copied "x"` about
  a name and export says `Copied "x" to the clipboard.` about a file — so what is
  duplicated is one short sentence rather than the gesture. Two copies of it is
  the accepted cost, and the third caller is where it gets revisited. The
  argument is written at the code, not cited from another file.
- **Taking the disabled-control paint decision.** The export icon does not
  disable, for the reason under *The export button*: `docs/BACKLOG.md`'s
  invisible-disabled row is waiting on one decision covering four shipped
  reorder controls, and this feature is not authorised to take it. What it
  guarantees instead is that it does not make that decision harder — no
  `.clickable-icon` it adds calls `setDisabled`, so the population stays four.
- **Cutting the pane's Layout file row down.** `docs/BACKLOG.md`'s *"The pane
  still holds which layout is open alongside what is in it"* row wants the
  layout picker — `deleteLayout`, `promptCreateLayout`, `createLayoutNamed`,
  `NameModal`, 87 lines and a modal — extracted out of the render loop, and
  notes that it has failed as a trigger three times because the seam is wider
  than the code. **This feature is not that trigger**, by decision rather than
  by oversight: it adds two controls and a second modal to exactly that row, so
  the row it wants cut grows by roughly four items. Extracting the picker is a
  refactor nobody specced, it reaches `plugin.app`, `plugin.settings`,
  `releaseLayout` and `setLayoutName`, and it is out of this run. Recorded here
  so the next reader sees a decision rather than drift.
- **Drawing a refusal inside the import modal.** The problem-list vocabulary
  (`.sheetsmith-field-problems` and friends) would paint there — every rule is a
  bare class — and is declined on design fit instead: it is shaped for a list of
  lines with per-line locators, where a pasted layout is one document with one
  problem, and its own comment excludes *"the bordered box that means a layout
  file is unreadable"*, which is what an unparseable paste is. The argument in
  full is under *The import modal*.
- **Reading the clipboard on the plugin's behalf.** The user pastes. Nothing
  here asks for clipboard read permission.
- **Exporting to a file, or to a chosen vault folder.** Both are argued out
  under *What export is*. If a destination ever arrives, `createLayout`'s
  taken-name refusal is the call to make there.
