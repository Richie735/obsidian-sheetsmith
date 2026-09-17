# A Track row's own length, held by the character

Status: shipped
Board card: A Track row whose length differs per character — a d10 hit die and
four d6 hit dice for one character, eleven d8 for another, on one layout
neither forks.

**Respec note.** This is the second pass. The first pass built and shipped
`maxSource: 'character'` with every such row always visible, drawing a quiet
`—` in its length field when the character had not given it one — Pool's own
answer to an unset max, ported over unexamined. Shown the built result, the
owner asked for something closer to Passport's list field
(`docs/features/passport-field-lists.md`): let the reader add only the rows
they want, each with its own remove control, and draw nothing at all for one
they have not added — a fighter with no d12s should not see a permanent `d12
—` line on their sheet forever. **This reopens the Design and Data and file
model sections below; the Model question's argument stands untouched**, since
nothing about where the ceiling lives or what `maxSource` means changes —
what changes is whether an unset row draws a quiet placeholder or nothing at
all, and who controls whether its entry exists.

The owner considered and declined the cheaper alternative first: modelling
hit dice as a Record set instead, which already has open, character-added
rows with a per-record ceiling built in. Declined because it trades Track's
segmented run for Record set's numeric `Uses 1 / 4` reading — a real loss of
the one thing a die-tracker is for. This pass keeps Track's own visual and
gives it the add/remove mechanism instead.

**Third pass.** The second pass drew one small named **Add `<name>`** button
per not-yet-added row and one glyph-only remove button on every added row's
own line. Shown a hit-dice card with all four die types in play, the owner
asked for the opposite trade: one **Add** and one **Remove** for the whole
row set, each behind a picker naming the specific rows it offers, rather
than a named button per candidate and a bin icon per line. Nothing here
reopens the Model question or the file model — a row's identity, what it
publishes, and what it stores are all untouched; what changes is only how
the reader reaches the add and the remove gestures, in **Design**'s "What
the reader sees", "Adding a row" and "Removing a row" below. The two-step
safety net on remove survives, moved from the row's own bin icon to the
picker: picking an added row from **Remove** arms it in place, and picking
it again is the confirm — `interaction/arm-to-confirm.ts` is no longer a
consumer here at all, since there is no longer a control that presses twice
on itself, but the two sentences it coined (`armedName`, `armedPrompt`,
`STOOD_DOWN`) are reused directly so an armed line in the picker reads in
the same words Table's and Record set's own armed rows always have.

## Model question

**Not gated on any §13 open question.** The nearest bullet is "whether a
character may override a single formula locally without forking the whole
layout" (§13, unattributed bullet after the rows-vs-component entry). That is
broader than this feature and this feature does not settle it: it describes an
*ad hoc* override of an arbitrary formula, where this is a *pre-declared,
opt-in* switch on one field, exactly as narrow as Pool's `maxSource` already
is. This is the third instance of that pattern, not a new mechanism —
`maxSource: 'calculated' | 'character'` shipped on Pool (§4.2) and was ported
one level down to Record set's per-record ceiling
(`docs/features/per-record-ceiling.md`). This ports it a second level down, to
one row of a Track's row set.

**Does the contract have to grow?** No. Nothing changes in `src/types.ts`,
`ComponentDefinition`, or `RenderContext`. What changes is inside
`track.ts`, one existing note-format primitive gets a second caller, one
editor file gains a control the same way it already does for `columns`
fields, and — new in this pass — `TrackData.values` widens from
`Record<string, string>` to `Record<string, string | null>`, a `null` meaning
"remove this entry," which `src/parse/fenced.ts`'s `writeFenced` has accepted
since it was written (`updates: ReadonlyMap<string, string | null>`) but no
component has ever actually passed. This is the first real caller of that
half of an already-built primitive, not a new one.

**Is this Table's `openRows` under another name?** No, and the distinction is
worth stating precisely because the two now look alike from a distance — a
character pressing **Add** to bring a row into existence. SPEC's own glossary
draws the line: "**Open row.** A row the character adds… It publishes
nothing, because a name a formula can write has to be knowable when the
formula is written" and "**A character-added row publishes nothing… a name
the character typed is neither [stable nor knowable when the formula is
written].**" Neither half applies here. A Track row's *name* — `d6`, `d8`,
`d10`, `d12` — is the layout's, declared in `rows[]` exactly as it always
has been; the character adds or removes only whether that already-named
row's *entry* currently exists. `hit_dice.d6.left` is knowable the moment the
layout is written, whether or not any character has added `d6` yet, precisely
as it already was before this pass — a row with no entry already published
nothing for `.left` (the first pass's own rule), and that is now also what
"not added" means. Nothing about publishing changes in this pass at all.

**Does the delete gesture need its own confirmation module?** No.
`src/interaction/arm-to-confirm.ts` is a fourth consumer here (after Table's
row delete, Record set's record delete, and a Passport list part's delete),
on the same argument each of the other three already made for itself: a
component's only confirmation surface is the card, `ConfirmModal` needs an
`App` no `RenderContext` carries, and the gesture, the wording and the timing
are already built, tested, and the one vocabulary a reader meets everywhere
else this plugin deletes something.

**What does it store, and does it widen the file model?** No. A row's fence
entry becomes `<key>: <filled> / <length>` where a character owns the length —
the exact shape `docs/features/per-record-ceiling.md` argued for and
`src/parse/bounded-entry.ts` already implements, generally, in `parse/`,
importing nothing from `obsidian`. That module has had one caller
(`record-set.ts`) since it shipped; this is the second, which is the point in
`docs/PATTERNS.md`'s extraction discipline where a primitive stops being one
component's private detail and is confirmed as a shared one. No new key, no
reserved key shape.

**What does it publish?** Nothing new. A row set already publishes
`<id>.<key>` (filled) and `<id>.<key>.left` (`count - filled`) per row (SPEC
§4.2). `.left`'s source simply becomes the row's own stored length instead of
a resolved formula, for a row in that mode. There is nowhere for the length
itself to publish under a name of its own — SPEC already says so ("a row
set's own ceiling has nowhere to publish today") — and this feature does not
change that.

**What happens to existing character notes?** Nothing is deleted by *reading*
a note. A row switched from a formula to `'character'` draws nothing at all
now — not even the quiet placeholder the first pass drew — until the
character presses **Add**, even where marks are already filled: Track has no
numeral standing in for the run the way Pool's number stands in for its bar,
so a row with marks but no length is invisible rather than merely unclamped,
and now reads as "not added" rather than as "added, empty." The marks survive
in the file throughout, and pressing **Add** on that row reveals them
immediately — nothing about the note itself changed, only whether the reader
has told the card to draw that row. See **Data and file model** for what a
reset (`empty`/`full`/`formula`) now must not do to a row nobody has added.

## What it does

A Track row can say its length is the character's own number rather than a
layout formula, and that its very existence on the card is the character's to
add and remove. A layout can declare d6, d8, d10 and d12 as candidate rows;
a fighter/wizard multiclass presses **Add d10** and **Add d6**, types 1 and
4, and never sees a d8 or d12 line at all; a straight fighter presses only
**Add d8** and types 11. A `full` reset restores every row the character has
added to its own length, touches nothing the character has not added, and
removing an added row is a deliberate, confirmed action rather than clearing
its length back to blank.

## Smallest version

`maxSource: 'character'` on one `TrackRow` — unchanged from the first pass —
with its length read from and written to that row's own fence entry, and the
row drawn only once an entry for it exists at all: no add control, no remove
control, no reset skip, just "an entry appears in the note, and a formula on
the card can put one there or the reader can edit the layout's sample by
hand." That is not a useful floor on its own — nobody hand-edits a layout's
sample to see their hit dice — so the smallest version worth landing is the
**Add**/remove controls together with the reset skip, since a Long Rest that
resurrects a removed row's entry (see **Data and file model**) is worse than
one that has no rows to restore yet.

## Design

### The layout says, per row, where the length comes from

```json
{ "key": "d10", "name": "d10", "maxSource": "character" }
```

`maxSource?: 'calculated' | 'character'` on `TrackRow`, Pool's own two words,
unlike Record set's `'field' | 'record'`. Record set needed different words
because a record's ceiling is never a formula — `'calculated'` would have sent
an author looking for an expression that cannot exist there. A Track row's
length **is already a formula field** (`rows.*.count`, in `formulaFields`
today), so `'calculated'` is exactly true here the way it is on Pool, and
`'character'` is exactly one number per character the way Pool's is — a row
is structurally a small Pool with segments instead of a bar. Absent means
`'calculated'`, so every layout written before this reads exactly as it did.

### The ceiling is per row, not per card

Scoped to `TrackRow`, not to `TrackConfig`. A plain, row-less Track wanting a
character-owned length declares one row — a row set of one still draws a
name beside its run, which is what "Hit dice (d10)" on a single-die character
would want anyway. See **Deliberately not doing**.

### What the reader sees

```
Hit dice
  d10   [ 1 ]  ▨
  d6    [ 4 ]  ▨▨▨▢
              + 🗑
```

d10 and d6 have been added: each draws its name, its own length field, and
its run. d8 and d12 have not — they draw nothing of their own at all, no
name, no field, no run, no "—". Neither state draws a control of its own any
more (**third pass**): the row underneath the drawn rows carries one plain
**Add** button and one plain **Remove** button for the whole set, each an
icon with no label of its own — `Add to Hit dice` and `Remove from Hit dice`
are the accessible name and the `title`, built from the card's own label
rather than from any one row's, since neither button is about a single row
until the reader opens it. **Add** is absent once every row is added;
**Remove** is absent while none is. A card with nothing left to add and
nothing yet to remove — a levels-only set with every level always present —
draws neither and no row underneath the rows at all.

Pressing either opens a small anchored panel — `ui/anchored-panel.ts`, the
same surface the modifier form opens, filled here with one plain line per
row the trigger offers, named plainly (`d8`, `d12` for **Add**; `d10`, `d6`
for **Remove**) rather than restating the verb on every line the way the
second pass's own buttons did. Added rows keep the layout's declared
order in both the card and the picker.

The length field is unchanged from the first two passes: Pool's ceiling
reading (`.sheetsmith-pool-max`), no separator or paired value beside it
since a run's segments are already the reading of the value, its own narrow
`.sheetsmith-track-row-length` wrapper, placed after the row's name and
before its run.

### Adding a row

**One picker behind one **Add** trigger**, rather than one named button per
candidate. The trigger is `.sheetsmith-track-action-button`, Table's own
delete glyph's circular shape reused for a `plus` icon, `aria-haspopup`
`"dialog"` and `aria-expanded` kept in step with the panel exactly as the
modifier form's own trigger does — including the same "a second press on the
open trigger closes it" toggle, read off `openAnchoredPanelKey()`. The panel
itself is `ui/anchored-panel.ts` filled with one `.sheetsmith-panel-line` per
not-yet-added row, in declared order — the same line markup and the same
hover and focus treatment the modifier form's own list already carries,
since a plain named choice is exactly what that surface was built for and a
component may not import Obsidian's own `Menu` (`docs/PATTERNS.md` §2).

Picking a line writes a blank entry — `context.onChange({ values: { d8: ''
} })` — immediately, no confirmation: adding is not destructive, and every
**Add** this plugin draws fires on the first press for the same reason. The
row then draws in its declared position, empty, ready for a length —
unchanged from the first two passes, now reached by picking the row from the
panel rather than by pressing its own named button.

**Focus lands in the new row's own length field**, mirroring Record set's
`awaitingAdd` mechanism exactly: a module-level `let awaitingAdd: { id:
string; key: string } | null` set on the press (before `onChange`, with the
panel closed first — `panel.close()` returns focus to the trigger, which is
this pass's own version of Record set's "blur first, so the view's generic
by-index focus restore has nothing stale to land on"), and consumed on the
next render for this component's id, moving focus to that row's length field
and clearing the flag. A card with no `awaitingAdd` pending renders exactly
as it does today, unaffected.

### Removing a row: pick, then pick again

**One picker behind one **Remove** trigger, and the two-step confirmation
moved into it rather than dropped.** The second pass's per-row glyph was
`interaction/arm-to-confirm.ts`'s fourth consumer, pressed twice on itself;
this pass has no control that presses twice on itself at all, since the row
lost its own remove glyph, so that module is no longer a consumer here.
What survives is the two sentences it coined for the gesture —
`armedName`, `armedPrompt`, `STOOD_DOWN`, all still exported from
`arm-to-confirm.ts` and imported here directly — so an armed line in this
picker says exactly what an armed bin icon always has: "d6. Select again to
confirm."

The gesture: opening **Remove** lists every added row as a plain line.
Picking one arms it — tints that line (`sheetsmith-track-remove-armed`,
scoped under `.sheetsmith-panel` since the panel cannot carry
`.sheetsmith-view`) and the row it names on the card underneath
(`sheetsmith-track-row-arming`, unchanged from the first two passes),
relabels the line to `armedName`'s sentence, and announces
`armedPrompt`'s. Picking the *same* line again is the confirm: it stands
itself down, closes the panel, and writes `null` for that row's key.
Picking a *different* line stands the first down and arms the second
instead — arming one row disarms another, the same property the second
pass's shared `armRegister()` gave two per-row buttons, kept here across two
lines of one picker instead. Dismissing the panel while a row is armed — a
press outside it, Escape, or the picker being closed by anything else that
opens a panel — stands the row down silently and announces `STOOD_DOWN`,
`ui/anchored-panel.ts`'s own `onClose` callback the trigger for the same
"arming, then walking away, cancels" rule the per-row control used to give
for free through `blur` and an outside `pointerdown`.

**This still sits at Table's and Record set's stakes, not Passport's
lighter one**, for the reason the second pass gave: an added row can be
several sessions' worth of marked segments, closer to a Table row or a
Record set record than to a passport tag. What changed is where the stakes
are paid — the picker's own two-pick gesture rather than a bin icon's own
two presses — not that they are lower. `commit: () => context.onChange({
values: { [row.key]: null } })`, unchanged.

**Deletion is still `writeFenced`'s own primitive doing the same work.**
`writeFenced(body, updates)` takes `updates: ReadonlyMap<string, string |
null>`, a `null` value removing that entry's whole line, unaffected by
which control produces the delta. `TrackData.values` stays `Record<string,
string | null>`; `read()` stays untouched and never produces one.

**No confirmation-adjacent focus choreography beyond what the view already
does**, as before — the generic by-index focus restore lands on whatever
control is now in the removed row's old position, or on the row set's own
**Add**/**Remove** line if removing the last added row erased that
position entirely.

### The gestures

All borrowed, none invented.

- **Typing** is `bindEditable`'s rules: live display, committed on blur or
  Enter, Escape restoring and announcing.
- **Arithmetic**, unlike Record set's ceiling field and like Pool's max: `4+1`
  settles to 5. A die count is exactly the kind of number a player arrives at
  by adding a level's worth of dice to what they already had.
- **Arrow keys** step by one, ten with Shift — Pool's own step, not marks:
  the field holds segments already, and multiplying by `marks` here would be
  double-counting a scale the field never displays in raw marks.
- **Clearing it** empties the length field alone, which drops the row's
  length but **not the row itself**: the entry survives blank (`d6: 2` from
  `d6: 2 / 4`), the run disappears, any marks already stored stay in the
  note, and `full` skips that row on the next reset — but the row stays
  drawn, its remove button included, exactly as an added row with no length
  yet always has. **This is deliberately not what the remove button does.**
  Blanking the length is "I don't know this row's length right now"; removing
  is "this character does not have this die type," which deletes the entry
  — marks and all — and collapses the row back to an **Add** button. The two
  are different intentions and this feature gives them different controls
  rather than overloading one.
- **A ceiling held to no floor and no external clamp beyond `MAX_SEGMENTS`**,
  the same defensive bound every Track length already has (segments clamp to
  100 for rendering; the stored number is untouched, per SPEC §7).
- **A note reference typed into it is declined**, `refuseLink`'s sentence,
  the same commit-time check Pool's max and Record set's ceiling both already
  make. New here rather than a pre-existing hole, because the field is new.
- **A slash that is not valid arithmetic is declined too**, its own sentence
  ("a slash separates the marks from the length they are read against…"),
  Record set's `refuseNumber` one component over: `bounded-entry.ts` splits an
  entry at its first `/`, so a length holding one is not a length that module
  can write back. Valid arithmetic containing a slash (`4/1`) is unaffected —
  `settleEntry` evaluates it to a plain number before this check ever runs, so
  nothing here refuses ordinary division.

### What draws, for a row that is not there at all

`countFor`'s `'character'` branch is unchanged from the first pass: a row's
length comes from its own stored ceiling, `null` where it is absent or
unreadable — the same answer an unresolved formula gives. What changed is
which null draws which state, now that "not added" and "added, blank" are
different facts rather than one:

- **No entry for the row at all** (`row.key in data.values` is false): draws
  nothing — no name, no field, no run, no "?" — and contributes an **Add**
  button to the row-set's own add line, below every drawn row.
- **An entry present, blank** (`d8:`): draws the row in full, name and length
  field and remove button, with the field showing `—` and no run — the first
  pass's own "graceful empty" rendering, reached now only once the row has
  been added.
- **An entry with a length**: draws the run at that length, unchanged from
  the first pass.
- **A calculated row that fails to resolve**: still earns the "?" plus its
  explanation, unaffected by any of this — that branch is untouched.

### `applyReset`, all three actions now skip a row that was never added

The first pass only taught `full` to skip a character-owned row with no
stored length, on the reasoning that a blank row is the ordinary case of a
die type the character does not have. **That reasoning now applies to
`empty` and `formula` as well, and for a sharper reason than before: writing
to a row with no entry at all would *create* one — an entry the character
never asked for, appearing because a Long Rest was pressed.** Record set's
own reset never adds or removes a record; a reset here must not add or
remove a row either, so all three actions now read `row.key in data.values`
first and leave an absent row untouched, whichever action is firing:

- **`empty`**: zeroes an added row's marks through the join
  (`d6: 0 / 4`, never `d6: 0`, per Constraint 4) and leaves a row with no
  entry exactly as it was — absent, not materialised as `d8: 0`.
- **`full`**: restores an added row with a stored length to it; **skips,
  without failing the rest of the reset,** an added row with a blank length
  (the first pass's own rule, unchanged) *and* a row that was never added at
  all (new); a calculated row that fails to resolve still fails the whole
  reset, naming it, unchanged.
- **`formula`**: resolves one segment count and applies it to every *added*
  row through the join; a row with no entry is left absent rather than
  gaining one at the resolved count.

### The sample

A character-owned row's sample composes its own length as well as its own
fill, seeded off `config.id` and the row's key the way `per-record-ceiling.md`
seeds a record's — so two added rows in one sample read different lengths
rather than the same number twice. **And the sample leaves exactly one
character-owned row un-added** — the last one `rows[]` declares — so an
author opening a fresh layout sees the **Add** control in the very first
preview rather than discovering it only once they read this document.
`sample()` still returns a non-empty body as long as at least one row is
added, which every character-owned row set with more than one candidate row
guarantees by construction.

### The third grid column, and the fourth one the third pass removed

The first pass added a third subgrid column to `.sheetsmith-track-set`,
reserved on every row once any row in the set needed one, so a mixed set's
calculated rows do not slide their run one column left into a length field
they do not draw: `.sheetsmith-track-lengths.sheetsmith-track-set` is `auto
auto minmax(0, 1fr)` (name, length, run), and every row drawn in a set that
has *any* character-owned row reserves it — a character-owned row a real
field, a calculated row in the same mixed set an empty span.

The second pass added a fourth column the identical way, for a remove
button on every added row. **The third pass removes it again**: the remove
button moved off the row entirely and into the row set's own shared
picker, so there is nothing left in a row's own line to reserve a column
for. `.sheetsmith-track-lengths.sheetsmith-track-set` is back to three
tracks, and the reservation rule above is exactly what the first pass left
it as. A row that is not drawn at all (not added) still contributes no grid
row and so still needs no reservation of its own.

### The layout editor

`list-fields.ts`'s `renderEntriesEditor`, in its `withCount` branch (already
special-cased for Track's rows, beside the generic `entries`/`columns`
editors): the existing **Segments** input gains a sibling **Length** select,
`Formula` / `Character`, absent written as `Formula`. Selecting `Character`
hides that row's own **Segments** input — there is nothing to type a formula
into once the character owns the number — mirroring Pool's `visibleWhen`
withholding **Maximum** while `maxSource` reads `character`, hand-rolled here
because this is a per-*row* condition inside a list rather than a
per-*field* one `conditionMet` already covers.

No `ColumnOptionsSpec` growth, unlike `per-record-ceiling.md`'s `holderMax`:
that was a shared list-field parameter because Record set's columns share an
editor with Table's. Track's rows editor already hardcodes **Segments** and
**Sense** as Track-specific columns nothing else uses, so the **Length**
select joins them the same way, in the same file, with no new shared
surface and no new `contract.test.ts` case.

## Config fields

`configFields` is unchanged in number; the `rows` field's description gains a
sentence.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `rows` | `track-rows` | Rows | **Amended.** Adds: "A row's length may be the layout's formula or the character's own number, typed on the sheet — the character's for a die type, a slot level, or anything else whose count differs per character rather than being computed." |

Per-row key inside `rows[]` (the layout file, not a `configFields` row):

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `maxSource` | select, per row | Length | Where this row's length comes from: **Formula**, the segment count above (or the component's own, where this row sets none), the same for every character on the layout — or **Character**, a number the character types on the sheet, for a length that is rolled, chosen, or assigned per character rather than derived. A `full` reset restores it to whatever the character typed and leaves a row nobody has typed one into alone. Defaults to Formula. |

`formulaFields`: unchanged — `count`, `rows.*.count`, `reset.*.to`. A
character-owned row never populates `rows.<index>.count`, so nothing new is
ever asked to resolve there.

## Data and file model

`storage: 'fenced'`, unchanged: one entry per row key, and it may now be a
composite.

```
## Hit dice

​```sheet
d10: 0 / 1
d6: 2 / 4
d8:
d12:
​```
```

- **A row's entry is `filled / length` where its `maxSource` is `character`**,
  and a bare number where it is not, exactly as today.
- **The split is applied to every row's entry, whatever its mode** —
  `parse/bounded-entry.ts`'s `splitBounded`, called once wherever a row's
  stored text becomes a mark count. A bare number has no `/` in it, so the
  split is a no-op there; this is the same rule `per-record-ceiling.md`
  states for its own reason: gating the split on the mode would mean
  switching a row back to `'calculated'` left a stale composite for
  `readsAsMarks` to reject as malformed, where instead it now reads its
  value half and ignores the rest.
- **The three cases `read` meets**, per row: a bare number is marks with no
  length; a composite is marks and a length; and text that is neither a
  number nor a flag spelling in its value half is a malformed section,
  reported exactly as an unreadable entry is today.
- **The join is the split's exact inverse**, via `withValue` (updating marks,
  keeping whatever length is there) and `withCeiling` (updating the length,
  keeping the marks) — `bounded-entry.ts`'s existing API, untouched.
- **A canonical ` / ` is used only where this component composes a composite
  for the first time** — a length typed for the first time, and the sample.
  Nothing rewrites a spelling already in the file.

**Existing notes.** No row entry has ever held a composite, because nothing
has ever written one, so every existing Track note reads exactly as it does
today until a layout adds `maxSource: 'character'` to one of its rows. Once
it does: a bare `d10: 1` reads as one mark, no length — the row draws its
field empty and its run absent until a length is typed, and the mark stays
in the file. A hand-typed `d10: 1 / 4` — impossible before this feature,
since nothing accepted a `/` in a Track entry — previously failed to parse
as marks (`readsAsMarks` on the whole string rejects it) and read as a
malformed section; after this it reads as filled 1, length 4. That is the
same "previously broken, now correct" note per-record-ceiling.md records for
its own composite, and it is the only behaviour change to a note this
feature did not itself write.

**Round-tripping.** `TrackData.values[key]` keeps holding the note's own
bytes, unread and unsplit, exactly as it does today — the split happens where
a caller turns that string into a mark count or a length, never inside
`read`. An untouched row is byte-identical because the identical string goes
back into `write`. Constraint 3 holds by construction for the untouched case
and by `bounded-entry.ts`'s own spelling-preservation for the touched one,
which its own test file already covers.

**Deletion, new in this pass.** `TrackData.values: Record<string, string |
null>`, `null` meaning "remove this entry entirely," produced only by a
remove button's commit and never by `read`. `write` passes it straight
through: `writeFenced` already deletes an entry's whole line for a `null` in
its updates map (`src/parse/fenced.ts`), so `write` needs no new branch, only
a wider type on the map it already builds. An entry `writeFenced` is not
asked to touch — every row the reader has not just added or removed —
survives byte for byte, unchanged, on the same "rewrite only the lines whose
value changed" rule every other write in this component already stands on.

**Existing notes, again, for what this pass changes.** A note written before
this pass, or by a hand-edit against the first pass's version of this
feature, has an entry for every row
its author typed one for — bare, composite, or blank — and every one of
those reads as **added**, exactly as if the reader had pressed **Add**
themselves: presence is the only signal, and nothing about *how* an entry
came to exist changes what it means. A note with no entry for a
character-owned row reads as **not added**, which for a note written under
the first pass's behaviour is exactly the state that row was already
drawing as — a bare `—` and no run — so the only visible change for an
already-existing character is that those un-added rows disappear from the
card rather than continuing to sit there empty. Nothing is deleted by this
change reaching a note; a row simply stops being drawn until its own
**Add** is pressed, and every mark already stored survives untouched for
when it is.

## Acceptance criteria

Carried from the first pass, unchanged in substance:

- [x] `d10: 0 / 1` reads as filled 0, length 1; `d10: 2` (no separator) reads
      as filled 2, no length; `d10: 2 / lots` reads as filled 2, its length
      behaving as none; each round-trips byte-identically with nothing
      changed.
- [x] `slots.d10` and `slots.d10.left` publish for a character-owned row
      exactly as they do for a calculated one, `.left` reading `length -
      filled`, for every *added* row.
- [x] Editing marks on a row whose entry is `d10: 0/1` (no spaces) writes
      `d10: 1/1`, keeping the reader's own separator spelling and every
      other row's bytes untouched.
- [x] The length field settles arithmetic (`4+1` commits `5`), steps by one
      and by ten with Shift, and declines a note reference with `refuseLink`'s
      sentence, leaving the draft in the field; it also declines a slash that
      is not valid arithmetic (`4/lots`), while `4/1` settles to `4` as
      division rather than being refused.
- [x] A row is never treated as a flag card (`isFlagCard`) while its
      `maxSource` is `'character'`, whatever marks or length it holds.
- [x] The layout editor's rows list offers **Length** (`Formula` /
      `Character`) on a Track's rows and hides that row's **Segments** input
      while it reads `Character`.

New to this pass:

- [x] A character-owned row with **no entry at all** draws nothing of its
      own — no name, no field, no run, no "—" — and its name joins the row
      set's shared **Add** picker (superseded in shape, not substance, by
      the third pass — see below: it no longer contributes a button of its
      own).
- [x] A character-owned row with **an entry, blank** draws in full — name,
      length field showing `—`, no run — the first pass's "graceful empty"
      state, now reached only once added.
- [x] Pressing **Add `d8`** writes `d8:` (a bare, blank entry) and nothing
      else; the row then draws in its layout-declared position relative to
      whichever other rows are already added, not appended after them; focus
      lands in its own length field.
- [x] Two rows added out of declared order (e.g. `d12` before `d8`, where
      `rows[]` declares `d8` first) still draw `d8` above `d12`, matching
      `rows[]`'s own order.
- [x] Clearing only the length field (not removing the row) on an added row
      blanks the length half of its entry, keeps the entry itself (and any
      marks) in the note, and the row stays drawn — distinct from removing,
      which only the **Remove** picker reaches.
- [x] `write` of an unmodified note is byte-identical whether or not any row
      is added or removed elsewhere on the same card — an add or a remove
      touches only its own row's line.
- [x] `empty`, `full`, and `formula` resets each skip a character-owned row
      with **no entry at all**, writing nothing for it and neither adding nor
      removing it; `full` continues to additionally skip (without failing
      the reset) an added row with a blank length; a calculated row that
      fails to resolve still fails the whole reset, naming it, for all three
      actions where applicable — unchanged.
- [x] Restoring a Long Rest's `full` action against a card holding one added
      row with a length, one added row with none, and one row never added,
      restores the first, skips the second and the third identically (no
      write to either), and returns success for the component.
- [x] The sample writes a composite for every character-owned row but the
      last one `rows[]` declares, which it leaves un-added; the sample
      round-trips through `read` and `write`, and two added rows on one card
      draw different sampled lengths.
- [x] `TrackData.values` typed `Record<string, string | null>`; `read` never
      produces a `null` entry; `write` passes a `null` straight to
      `writeFenced`, which removes that entry's line and leaves every other
      line untouched.
- [x] `npm test`, `npm run lint` and `npm run build` are green.

**New to the third pass:**

- [x] A row set with at least one not-yet-added row draws one **Add** icon
      button below the drawn rows, and no more than one whatever the number
      of candidates; a row set with nothing left to add draws none. A row
      set with at least one added row draws one **Remove** icon button
      alongside it on the same terms; one with nothing added yet draws none.
      A row set with neither — nothing left to add and nothing yet added,
      which only a set with no character-owned rows at all can be — draws
      no action row underneath at all.
- [x] Pressing **Add** opens `ui/anchored-panel.ts`'s panel listing every
      not-yet-added row by name, in declared order; picking one closes the
      panel, writes its blank entry, and lands focus in its length field on
      the next render, exactly as the second pass's own named button did.
- [x] Pressing **Remove** opens the same kind of panel listing every added
      row by name; picking one arms it — tints that line and the row it
      names on the card, relabels the line to `armedName`'s sentence,
      announces `armedPrompt`'s — without writing anything; picking the
      *same* line again writes `null` for that row's key and closes the
      panel; picking a *different* line disarms the first and arms the
      second instead, writing nothing.
- [x] Dismissing the **Remove** panel while a row is armed — a press
      outside it, Escape, or opening a different panel anywhere on the
      sheet — stands the row down, untints it, and announces `STOOD_DOWN`,
      without writing anything.
- [x] `interaction/arm-to-confirm.ts` gains no new consumer here and loses
      one: `track.ts` imports only `armedName`, `armedPrompt` and
      `STOOD_DOWN` from it, no longer `armRegister` or `bindArmToConfirm`.
      `git diff --stat` shows no change to the module itself, or to
      `src/parse/bounded-entry.ts`, `src/parse/fenced.ts`,
      `src/components/record-set.ts`, `src/components/table.ts`,
      `src/components/pool.ts`, or any other component.
- [x] `.sheetsmith-track-lengths.sheetsmith-track-set` is back to three
      subgrid tracks (name, length, run); the fourth the second pass added
      for a per-row remove button is gone, since no row draws one any more.

**Look criteria**, in the harness, both themes:

- [x] A character-owned row's length field at rest reads the same size and
      colour as Pool's ceiling.
- [x] A four-row hit-dice card with two rows added and two not reads as
      "this character has two of the four die types, and can add the rest,"
      with one **Add** and one **Remove** icon underneath rather than a row
      of named buttons and a bin icon per line.
- [x] A mixed set (one calculated row, one character-owned) keeps its
      calculated row's run aligned with the character-owned row's run, in
      the same column, whether or not the character-owned row is currently
      added.
- [x] The **Add** and **Remove** triggers read in Table's own delete
      glyph's vocabulary — the same circular icon-button shape — and an
      armed line inside the **Remove** panel tints in the same red Table's
      own armed row does, so a reader who has met one recognises the other.

**Vault fixture** (`~/Developer/sheetsmith-test-vault`, mirrored under
`src/test/fixtures/tracks/` and driven through the real parsers by
`src/view/vault-fixture.test.ts`): `Track variations.json` and `Tracks.md`
already exist and need no new component or data — the same `hit_dice` row
set demonstrates add/remove under the third pass's picker exactly as it did
under the second pass's buttons, since presence in the note is still the
only signal. `Characters/Tracks.md`'s existing entries all read as
**added**, per **Data and file model**'s argument, so the fixture needs no
rewrite — only a re-read of the press list below.

**The press list**: with `d8` and `d12` absent from the note, confirm the
card draws only `d6` and `d10` plus one **Add** icon and one **Remove**
icon underneath; press **Add**, confirm a panel opens listing `d8` and
`d12`; pick `d8`, confirm the panel closes, the note gains a bare `d8:`
line, and the card now draws a `d8` row with `—` and no run; type a length
into it and confirm the note holds `d8:  / <length>` — a blank marks half,
the same "blank value half is a blank value" reading `per-record-ceiling.md`
gives its own composite, not `0 / <length>`, since nothing has been typed
into the marks half yet; press **Remove**, confirm a panel opens listing
`d6`, `d10` and `d8`; pick `d8` once and confirm it arms (tinted, announced)
without writing and the `d8` row on the card tints too; pick `d8` again and
confirm the whole `d8` line is gone from the note, the card no longer draws
a `d8` row, and `d8` is back in the **Add** panel's own list; press Long
Rest and confirm every added row with a length restores, an added row with
none and a not-added row are both left exactly as they were, and the
layout's other components are unaffected. `DnD 5e Standard`'s `hit_dice`
(still a Pool, `max: "level"`) is not touched by this pass — a separate
decision, not scoped here.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings. The first pass's five commits
already landed in this same uncommitted tree; these continue the sequence
rather than restarting it.

1. `feat: Let TrackData delete a row's entry`. `TrackData.values` widened to
   `Record<string, string | null>`; `write` passes a `null` through to
   `writeFenced` unchanged in shape. No UI yet, so the only behaviour change
   is that the type now admits a delta no caller produces until the next
   commit.
2. `feat: Draw only the Track rows a character has added`. The `stored ===
   undefined` gate that skips a row's own line entirely and collects it for
   the add line instead; the fourth grid column and its reservation rule;
   `applyReset`'s `empty` and `formula` joining `full`'s existing skip for a
   row with no entry at all.
3. `feat: Add a Track row the character wants`. The **Add `<name>`** buttons,
   one per not-yet-added character-owned row, writing a blank entry on
   press; the `awaitingAdd` focus landing; the sample leaving one row
   un-added.
4. `feat: Remove a Track row the character no longer wants`. The remove
   button on every added row, `arm-to-confirm.ts` as a fourth consumer,
   `commit` writing `null` for that row's key.
5. `docs: Let a character add and remove which Track rows exist`. This
   document's `Status` to `built`; §4.2's Track entry and `docs/UI.md`'s
   arm-to-confirm and add-control rows amended for a fourth/third consumer;
   the vault fixture's press list re-verified against the built behaviour.

The third pass continues the same sequence:

6. `feat: Collapse a Track row set's Add and Remove into one picker each`.
   The per-row **Add `<name>`** buttons and the per-row remove glyph both
   removed; one **Add** and one **Remove** icon button drawn once per row
   set, each opening `ui/anchored-panel.ts` filled with one line per row it
   offers; the **Remove** panel's own arm-then-confirm gesture, reusing
   `armedName`/`armedPrompt`/`STOOD_DOWN` from `arm-to-confirm.ts` without
   taking `armRegister`/`bindArmToConfirm` any more; the fourth grid column
   removed along with the row's own remove button.
7. `docs: Move a Track row set's add and remove behind one picker each`.
   This document's third-pass respec note, the amended **Design** sections,
   the acceptance and look criteria, and the vault fixture's press list;
   `docs/SPEC.md` §4.2's Track paragraph and `docs/UI.md`'s arm-to-confirm
   and add-control rows amended for the picker.

## Deliberately not doing

Carried from the first pass, unchanged:

- **A non-row Track's own `count` as character-owned.** Scoped to `TrackRow`.
- **A length that is both a formula and a character override at once.**
  `maxSource` is exclusive by construction.
- **Publishing a row's own length under a name of its own.** Only `.left` is
  reachable, added row or not.
- **A warning treatment for marks stored above a row's own length.**
- **Anything about `marks` beyond letting it keep meaning what it means.**
- **A "restored what it could" channel on `ResetResult`.**

New to this pass:

- **Reordering added rows.** An added row's position is always `rows[]`'s
  own declared order; there is no drag handle and no way to make `d12` draw
  above `d6` other than declaring it there in the layout. Table's own
  character-added rows are reorderable because their identity — and
  therefore their order — is the character's; a Track row's identity is
  always the layout's, so there is nothing for a reorder to mean here.
- **A row the character names for themselves.** Every addable row is one
  `rows[]` already declares; this feature toggles which of a closed,
  layout-authored set currently exist, never invents a new one. A homebrew
  die size the layout did not anticipate needs a layout edit, the same as
  it would for a Table column today.
- **Undo for a removed row beyond Escape's own scope.** Arm-to-confirm's
  first press is the undo — a second, different control's press, or focus
  leaving, stands it down with nothing written. Once the second press on
  the same control fires, the row is gone exactly as a Table row or a
  Record set record already is, with no further undo this feature adds.
- **Hiding a calculated row's blank state the same way.** `maxSource`
  absent (or `'calculated'`) is untouched: a calculated row still always
  draws, "?" and all, since its presence is the layout's decision for every
  character alike and never the reader's to toggle.
- **A confirmation-free, single-press remove.** Considered, on the
  argument that emptying the length field already discards the length
  without confirmation — and rejected, because clearing the length keeps
  the entry (and any marks) where removing discards them. The stakes are
  different, so the gestures are different; see **Removing a row** above.
