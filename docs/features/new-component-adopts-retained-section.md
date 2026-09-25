# A new component adopting a retained section

Status: shipped
Board card: `docs/SPEC.md` §13 — "Whether a new component may adopt a section a
character note retained." A component inserted from the picker, pasted, or
given a new label can take a label that already heads a `##` section a
character note kept after an earlier component was removed (§10), and the sheet
then reads that old section as the new component's own, with nothing said.

## Model question

**§13, "Whether a new component may adopt a section a character note
retained."** Settled by the owner as **report plus write guard**. What follows
is the argument for it, and what each half can and cannot reach.

**What the probe found.** `src/view/retained-section-adoption.test.ts`, driven
through a real `SheetView` read, edit and serialise, answers the one fact the
§13 entry left open. 12 cases green, 3 red:

| Adopter ← old body | What happens on the first edit | Bytes lost? |
| --- | --- | --- |
| Table ← Card set fence | table appended, fence kept | no |
| Table ← Card fence | table appended, fence kept | no |
| Card ← Table body | fence appended, table kept; no link lands in a fence | no |
| Card ← Rich text prose | fence appended, prose kept | no |
| Table ← Table, other columns | old columns and rows kept, rows left ragged | no |
| Rich text ← Card fence, a line added | fence kept inside the prose | no |
| **Card ← Track `value: 5`** | Card shows 5 as its own, writes `value: 17` | **yes** |
| **Track (count 3) ← Track at 5** | draws 3 of 3, one step writes `value: 3` | **yes** |
| **Rich text ← Card fence, text replaced** | the fence is shown as prose and replaced | **yes** |

Not one adoption was reported as malformed. Two rules explain the whole table:

1. **A different storage kind never loses data.** `writeFenced` appends a fence
   to a body that has none, and `writeTable` appends a table, and both keep
   every other byte. A fenced write touches only the keys it names
   (`parse/fenced.ts`), so a foreign fence with other keys survives too.
2. **Data is lost only where the old body reads successfully as the new
   component's own.** That happens two ways, and they need different answers:
   - **The keys coincide.** A default Card and a Track both store `value`. Once
     the Card reads `value: 5` it is the Card's value, and nothing in the body
     says otherwise: the note holds values only (SPEC §3.1), with no record of
     which component wrote them. **No write guard can tell these apart.**
   - **The component owns the whole body.** Rich text and Image read any text
     as their own (`bodyText`, `rich-text.ts:205`, `image.ts:160`) and write by
     replacing it (`writeBodyText`, `parse/markdown-body.ts:72`). So a Card's
     fence becomes prose in a Rich text box and a broken embed in an Image
     frame, and the reader's next ordinary edit deletes it. **A guard can
     reach this**, because both components can say which bodies their own
     gestures could never have written.

Not probed yet, read from the code, and to be probed by this feature (Design §
Probe cases): **Image** is in the whole-body class, exactly like Rich text.
**Record set** is not: a body with no `### ` heading is its preamble, kept
byte for byte, and a new record is appended after it. The one Record set case
that can lose data is prose that happens to carry `### ` headings — which Rich
text's own refusal message recommends — because each heading reads as a record
and removing that record removes its prose. That is the whole-body problem
inside one record, and it is residue (below).

**Why report plus guard, and not either half alone.**

- **Refusing the label is wrong**, and the §13 entry already says why: it
  closes the recovery route. Re-adding a removed component under its old label
  is the way back to its data, short of undo, and a retained section nobody can
  reach again is retained in name only.
- **Accepting adoption silently is wrong** too, because the rename migration
  already treats this exact state — one heading, two components' histories —
  as a collision it refuses and counts (`docs/features/component-rename-migration.md`
  § Collision). The insert, the paste and the label commit reach the same state
  with no check and no report.
- **The report alone is not enough**, because it fires once, in the editor,
  and a note opened next week by a reader who never saw it still loses its data
  on the first edit. Where the component *can* tell, it must not write.
- **The guard alone is not enough**, because of the coinciding keys. The report
  is what covers them, and this spec says so rather than implying the guard
  closes the hole.

**Considered and refused: suffixing the label at insert.** `uniqueLabel` could
skip labels that retained sections hold, which is not refusing a label. It was
refused because the picker's default name *is* how an author re-adds a removed
component — a removed `Card` comes back as `Card` — and a suffix would silently
close that route for the most common case. It would also make `uniqueLabel`, a
pure function of the layout, read the vault.

**The contract does not grow.** The guard is the existing `read` member:
`{ ok: false, error }` on a body the component cannot recognise as its own.
The sheet already never renders, resets or writes a section whose read failed
(`sheet-view.ts:596` reads, `:861` excludes a failed read from every trigger,
and a failed cell draws no control that could report an edit). So no renderer
switch on type, no new member, and nothing outside a component learns what it
stores. What changes is two components' answer to "is this body mine."

**What it publishes:** nothing new. A section that now reads as malformed
publishes nothing, as every failed read already does.

**What it stores, and Constraint 3:** nothing new. No bytes are written by the
report (it only reads), and the guard's whole effect is that a write which used
to happen does not.

**Existing notes, and Constraint 4:** no note is rewritten. Two things a reader
may see change, both on hand-edited or adopted notes only: a Rich text section
holding a `sheet` block, and an Image section holding more than one line, now
draw an error in place of a box that would have destroyed them on edit.

**The residue, stated plainly.** After this feature, a new component can still
overwrite retained data in two cases, and the report is the only thing that
covers them:

1. **Two fenced components storing the same key**: a default Card and a Track
   (`value`), a Card whose `key` is a Card set's entry key, two Tracks, and any
   other pair whose declared keys coincide.
2. **A whole-body component reading text its own gesture could have written**:
   Rich text reading a Table's markdown table or a Record set's `### ` headings
   as prose, Image reading a one-line body that is not an embed, and Record set
   reading prose with `### ` headings as records.

## What it does

When an author inserts, pastes or renames a component onto a label that
character notes on this layout already use for a section, one `Notice` says how
many notes hold such a section and that the component now shows it, so the
author can rename it if the data belongs to something else. And a Rich text or
Image component that finds another component's data in its section shows an
error there instead of offering an edit that would delete it.

## Smallest version

The guard in Rich text and Image; the report at the three entry points, as one
count; and the probe's cases turned green against the settled behaviour, with
the Image and Record set cases added. **It gives up** a registry-wide check, so
a future component that owns its whole body can repeat Rich text's mistake and
nothing fails until somebody probes it by hand. The registry sweep that would
catch it is a later route of its own (Deliberately not doing).

## Design

### 1. The write guard

The rule: **a component whose `write` replaces its whole body refuses to read a
body its own gestures could never have written.** A fenced component needs no
guard: its write touches only its own keys, and where those keys coincide with
a foreign component's, no guard could see it.

**Rich text** refuses a body that holds a `sheet` block — a line opening one,
by the same pattern `readFenced` uses. That fence is the plugin's own data
block and nothing a text block stores. The cell reads:

> Backstory: This section holds a sheet block, which is a component's data
> rather than text. Move it out of this section in the note, or rename this
> component in the layout.

Rich text's read has so far been total, and its header argues for that: a
failed read replaces the whole cell and takes the field with it, so a reader
could lock themselves out with their own typing. That argument is kept by
**refusing the same thing at the write**, exactly as `## ` is refused today:
the existing `refuse` in `render` gains a second case, so a draft holding a
`sheet` fence line is not saved and says why:

> Not saved. "```sheet" would start a block of sheet data in this note — name
> the code block something else.

So the read failure can only come from a hand edit or an adoption, never from
the component's own gesture — which is Image's own condition for when a read
may fail (`image.ts`, header of `read`).

**Image** refuses a body whose text spans more than one line. Its field is a
single-line input and its write replaces the whole text, so a multi-line body
is one it could not have written and would destroy. This catches a Card fence,
a Table, a Roster, a Record set and multi-paragraph prose. A one-line body that
is not an embed is still read and still drawn with its reason in the frame, as
now, because that is the state the reader's own typing reaches:

> Portrait: This section holds more than one line, and a picture is one embed.
> Move the rest out of this section in the note, or rename this component in
> the layout.

**The accepted consequence:** a caption line a reader added by hand under an
embed now makes the section read as malformed, where before it drew a frame
whose next picture edit would have deleted the caption. Its bytes are
untouched; the error names the fix.

**What the guard must not break.**

- A section with no data block is still empty, not malformed (SPEC §10): an
  empty or blank Rich text or Image section reads as `data: null`, unchanged.
- Hand-written prose above a fence is untouched: the guard is not in any fenced
  component, and `writeFenced` still keeps prose above the fence it appends to
  or rewrites.
- Passport's picture line is not Image's rule: Passport owns a fence and one
  embed line, and its read is not changed.

**The one predicate in `parse/`.** "Does this body hold a `sheet` block" is
note format, so it lives beside `FENCE_OPEN` in `parse/fenced.ts` as an
exported predicate, and Rich text uses it for both the read and the draft.
Image's rule is its own (one line or not) and needs nothing shared.

### 2. The report

**What it counts.** The character notes on this layout that already hold a
section under the label, **with something in it**: a section whose body is only
whitespace holds no data and adopting it loses nothing, so it is not counted.
Found with `layoutCandidates` (`layout-notes.ts`), and each candidate read with
`cachedRead` and parsed with `parseCharacter` and `getSection`, which is the
lookup the sheet itself uses, so the scan and the reader cannot disagree about
what a label matches. An undecidable candidate is settled by its own
`layoutName`, as `countNotesNaming` settles one. A note that cannot be read or
parsed is not counted and not reported: this is a warning, not an operation,
and there is nothing to have left alone.

**Where it lives.** A new top-level module, `src/section-adoption.ts`, sibling
to `component-rename-migration.ts` and for the same reason: it reads
`app.vault` and `app.metadataCache`, so it is neither `parse/` nor
`components/`. It owns the scan and the sentence (a pure function of the
count and the labels, tested without an `App`, as `migrationMessage` is).
`docs/PATTERNS.md` §2's tree gains its line.

**Which components.** Only components that have a section: a container
(`storage: 'none'`) is skipped, and a pasted container's descendants are each
checked. A note is counted once however many of the labels it holds.

**When it runs.** After the layout write resolves, and only where the layout
file is a resolved layout — the same two gates the rename migration has, since
a layout that did not save has adopted nothing and a note names a layout by its
resolved name. Zero notes says nothing.

**The three entry points.**

1. **Insert from the picker** (`layout-editor.ts` `insert`). The picker's own
   status line ("Added Card on the sheet") is unchanged; the report is a
   `Notice` beside it:

   > 1 character note already has a section called "Card", and this component
   > now shows it. Rename the component if that section belongs to something
   > else.

   > 3 character notes already have a section called "Card", and this
   > component now shows them. Rename the component if those sections belong
   > to something else.

2. **Paste** (`pasteText`). The paste already answers with one `Notice`
   carrying **Undo**; the report is a sentence inside it, after "Pasted …" and
   before "Check what these mean here", because a note's data outranks a
   formula to check. The notice waits for the scan; the undo guard is still
   taken synchronously from the bytes the paste wrote, so nothing about undo
   changes.

   > Pasted "Portrait" from "Image variations". 1 character note already has a
   > section called "Portrait", and the pasted component now shows it. Rename
   > it if that section belongs to something else.

   Several labels are named (with `spelled`, up to `NAMED_AT_MOST`, then
   counted), and the count is of notes:

   > 2 character notes already have sections called "Portrait" and
   > "Backstory", and the pasted components now show them. Rename any whose
   > section belongs to something else.

   A configuration paste keeps the target's label, so it reaches no new
   section and is not an entry point.

3. **Label commit** (the rename path in `persist`, reached from the Label field
   and from a tree row's rename alike). The scan runs **after the flush and
   before the migration**, and has to: after the migration a renamed note
   holds the new label too and cannot be told from an adopted one. It counts
   notes that hold a non-empty section under the new label **and none under
   the old one** — a note holding both is the migration's collision, which the
   migration already counts and words, and is not counted twice. One `Notice`:
   the migration's sentence where it has one, then this one.

   > Renamed "AC" to "Armour class" in 1 character note. 1 character note
   > already has a section called "Armour class", and this component now shows
   > it. Rename the component if that section belongs to something else.

   How the migration's sentence is carried into that one `Notice` (a trailing
   sentence handed to `reportComponentRename`, or `persist` composing
   `migrationMessage` itself) is the build's choice; the migration's own
   behaviour and wording do not change.

**Why no flush on insert and paste.** The rename path flushes because a value
typed two seconds earlier may not be on disk. On insert and paste the new label
is free among the layout's components, so no open sheet's pending edit is to
that section — except where the component that used the label was removed in
the same two seconds. That case is left (Deliberately not doing): flushing on
every insert would write open notes for a gesture that otherwise writes none.

**Why a `Notice` and a count.** The owner's settled form, and the rename
migration's: a `Notice` is not selectable or clickable, so names in it are not
a route, while the count plus the label is — a vault search for `## Card`
finds the notes. It is also the only surface common to all three entry points;
the picker has a status line, the paste and the rename do not.

### 3. Probe cases

The probe becomes part of the deliverable, its header rewritten from "a probe"
to this spec. Each case asserts what the settled behaviour is:

- **b) Card ← Track `value: 5`** and **d) Track (count 3) ← Track at 5** are
  the residue. They assert what the file keeps: the first edit rewrites the
  `value` line and nothing else, every other byte of the body is where it was.
  Their names say they are the case the report covers.
- **Rich text ← Card fence** reads as malformed, with the message above; no
  field is drawn, so no edit reaches the file. The two "keeps the fence
  through an edit" cases become "draws no field to edit" and "the section is
  byte-identical after a sheet edit elsewhere".
- **New, Image:** ← Card fence, ← Table, ← two paragraphs of prose each read
  malformed; ← one line of prose reads and draws its reason in the frame (the
  residue, pinned as such); ← an empty section is an editable empty frame.
- **New, Rich text:** typing a `sheet` fence into the box is refused with the
  sentence above, and the note is unchanged.
- **New, Record set:** ← Card fence keeps the fence as preamble through adding
  a record; ← Rich text prose with no `### ` heading likewise; ← prose with
  `### ` headings reads them as records (the residue, pinned as such).

### 4. Empty and error states

- **Empty:** no note holds the label, or every holding section is blank — no
  `Notice`, the component draws empty as today.
- **Error:** the two guard messages above, in place, on that component only
  (UI.md §10); the rest of the sheet stays live. The harness stages both in the
  broken state so a reviewer sees their wrap in a real cell.

## Config fields

None. No component gains a field, and no description changes: the Label
field's description speaks only for the heading and stays true.

## Data and file model

- **Read:** `metadataCache` frontmatter to find candidates, then each
  candidate's text through `cachedRead` and `parseCharacter`.
- **Written:** nothing by the report. The guard's effect is a write that no
  longer happens.
- **Round trip:** unchanged. A malformed section is never passed to `write`,
  and every other section serialises as before (Constraint 3).
- **Existing notes:** never rewritten. A Rich text section holding a `sheet`
  block and an Image section holding more than one line render as errors from
  now on; their bytes are untouched (Constraint 4).
- **`src/parse/`** gains one exported predicate and imports nothing from
  `obsidian`.

## Acceptance criteria

The guard

- [x] A Rich text component whose section holds a `sheet` block draws the
      error "This section holds a sheet block, …" in place of the component,
      prefixed with its label, draws no text box, and its section is byte-identical after an edit to another
      component on the sheet.
- [x] Typing a line that opens a `sheet` block into a Rich text box and leaving
      it answers "Not saved. …", keeps the draft on screen, and leaves the note
      unchanged.
- [x] An Image component whose section holds more than one line draws the error
      "This section holds more than one line, …" and no field.
- [x] An Image section holding one line that is not an embed still draws the
      field with its reason in the frame, as before.
- [x] An empty or blank Rich text or Image section is still an editable empty
      component, with no error.
- [x] A reset trigger leaves a Rich text or Image section that failed to read
      byte-identical (it already excludes failed reads; a test pins it for the
      guard's case).
- [x] No fenced component's `read` or `write` changes; `git diff` shows no
      change to `card.ts`, `card-set.ts`, `track.ts`, `pool.ts`, `passport.ts`,
      `roster.ts`, `table.ts` or `record-set.ts`.
- [x] `src/view/retained-section-adoption.test.ts` is green, with every case
      listed in Design §3, and its header cites this spec instead of calling
      itself a probe.

The report

- [x] Inserting a component from the picker whose label heads a non-empty
      section in N notes on this layout shows one `Notice` in the wording of
      Design §2.1, singular and plural each pinned by a test.
- [x] Inserting one whose label heads only blank sections, or none, shows no
      `Notice`.
- [x] Inserting a container shows no adoption `Notice`, whatever the notes
      hold.
- [x] A paste whose component, or any component inside it, adopts a section
      carries the sentence inside the paste's own `Notice`, after "Pasted …"
      and before "Check what these mean here", and **Undo** on it still undoes
      the paste.
- [x] A label commit onto a label held by notes that do not hold the old label
      shows the migration's sentence (if any) and the adoption sentence in one
      `Notice`; a note holding both labels is counted only by the migration's
      collision clause.
- [x] A note on another layout holding the label is not counted; a note on a
      layout named `12` (undecidable frontmatter) is counted when its text
      names this layout.
- [x] A layout write that fails produces no adoption `Notice`.
- [x] No character note's modified time moves on an insert or a paste.
- [x] `src/section-adoption.ts` has no caller in `src/parse/` or
      `src/components/`, and the sentence function is tested without an `App`.

Look and the vault

- [x] The `sheet-error` shot (dark) and the scoped view `surface=sheet`,
      `state=broken`, `width=380` show both guard messages wrapping inside their
      cells. `sheet-narrow` has no broken state, and `sheet-error` has no light
      counterpart, so neither can show them in the other theme.
- [ ] The vault walkthrough below produces each `Notice` it quotes.
      *Unverified in the app: nobody has driven the walkthrough in Obsidian yet,
      so this stays unticked.*

## Vault fixture

The fixture lives outside the repository, so its recipe lives here (`AGENTS.md`,
Testing). One layout, `Sheetsmith layouts/Adoption variations.sheetsmith`, and
two notes in `Characters/`, both with `sheet-layout: Adoption variations`.

**The layout** holds one component: a Card labelled **AC**.

**`Adoptions.md`** holds no `## AC`, and these retained sections, each as its
removed component wrote it:

- `## Card` — a Track's fence, `value: 5`.
- `## Rich text` — a Card's fence, `value: 15` and `note: chain mail`.
- `## Track` — the heading and nothing under it.
- `## Portrait` — a Table, `| Name | Qty |` with a `[[Rope]]` row.
- `## Armour class` — a Card's fence, `value: 18`.

**`Adoptions clean.md`** holds `## AC` with a Card's fence, `value: 14`, and
nothing else.

The walkthrough, in order, with the layout editor open on **Adoption
variations** and **Adoptions** open as a sheet in a split:

1. **Insert a bare Card from the picker.** It is labelled **Card**. The notice:
   *1 character note already has a section called "Card", and this component
   now shows it. Rename the component if that section belongs to something
   else.* The sheet shows 5 in it — the residue, as documented.
2. **Insert a bare Rich text.** Same notice for "Rich text". The sheet draws
   the error *Rich text: This section holds a sheet block, …* and no box.
3. **Insert a bare Track.** No notice: its section is blank.
4. **Paste an Image.** Copy **Portrait** from **Image variations** and paste it
   here. The paste notice carries the adoption sentence for "Portrait", and the
   sheet draws *Portrait: This section holds more than one line, …*. Press
   **Undo** on the notice: the Image goes, `## Portrait` stays in the note.
5. **Rename AC to "Armour class".** One notice: *Renamed "AC" to "Armour
   class" in 1 character note. 1 character note already has a section called
   "Armour class", and this component now shows it. …* `Adoptions clean.md`
   now has `## Armour class` holding `value: 14`; `Adoptions.md` is unchanged.
6. **The modified-time check.** `Adoptions.md`'s modified time has not moved
   through steps 1 to 5. Nothing in this feature writes it.
7. **Type into the Rich text of another note.** On **Prose** (Rich text
   variations), type a line ```` ```sheet ```` into a text block and leave it:
   *Not saved. …*, and the note is unchanged.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. **`feat: Refuse a sheet block in a Rich text section`.** The predicate in
   `parse/fenced.ts` and its test, Rich text's read and draft refusal, and
   their tests in `rich-text.test.ts`.
2. **`feat: Refuse a picture section holding more than one line`.** Image's
   read and its tests in `image.test.ts`.
3. **`feat: Count the notes that already hold a section under a label`.**
   `src/section-adoption.ts`, the scan and the sentence, with tests against the
   stub covering blank sections, other layouts, an undecidable layout name and
   an unreadable note.
4. **`feat: Say when an inserted or pasted component shows a kept section`.**
   The insert and paste wiring in `layout-editor.ts`, the paste sentence's new
   clause in `paste-notice.ts`, and their tests.
5. **`feat: Say when a renamed label shows a kept section`.** The rename path
   in `persist`, the scan between the flush and the migration, and the one
   combined `Notice`, with its tests.
6. **`test: Pin what a component does with a section another one left`.** The
   probe, rewritten against this spec, with the Image, Rich text and Record set
   cases added.
7. **`test: Show a section another component left in the harness`.** The two
   guard errors staged in `brokenSamples`.
8. **`docs: Record what a new component does with a kept section`.** This doc
   flipped to built, `docs/PATTERNS.md` §2's tree line; `/land-it` writes the
   SPEC §10 bullet, the §4.2 notes on Rich text's and Image's reads, and the
   §13 `Resolved:` entry.

## Deliberately not doing

- **A registry-wide adoption sweep**, deferred to a later route of its own.
  For every sampled configuration against every other's sample, it would
  require either that the adopter's `read` fails, or that the old component
  still reads the same data from the body the adopter wrote, with pairs whose
  keys coincide on a named list. It would have caught a future component that
  owns its whole body and reads another's data as its own — Rich text's
  mistake repeated — which this version leaves to a hand probe. Image has no
  sample, so it would need the probe either way.
- **A Track whose count is lowered below its stored value** loses that value on
  its next step, with no adoption involved (case d without the second Track).
  A separate defect, deferred; case d here pins only the adoption half.
- **Refusing or suffixing the label.** Model question: it closes the recovery
  route.
- **Telling coinciding keys apart.** Nothing in a note says which component
  wrote a value, and adding a type marker to every fence would change the file
  model for this one case and fail on every existing note. The report covers
  it.
- **Guarding a Table against another Table's columns.** Nothing is lost there,
  and a Table refusing a header it does not declare would turn every renamed
  column (which does not migrate) into a malformed section.
- **Naming the notes.** A count, as the rename migration reports.
- **Flushing open sheets before the insert and paste scans.** The one case it
  would catch is a component removed and its label re-added inside the
  two-second save debounce.
- **Undo and redo.** Undoing a removal brings a component back onto its own
  retained section, which is the recovery route and needs no report.
- **The rename migration's own behaviour and wording**, the entry-key collision
  rule, and every `docs/BACKLOG.md` row, including the three about field errors
  in `editor/field-error.ts`.
- **The picker's status line.** It keeps saying what was added. The adoption
  report is the `Notice` shared by all three entry points.
