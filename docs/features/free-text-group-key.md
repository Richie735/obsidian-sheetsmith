# Free-text group key

Status: shipped, bar the owner-checked items below (the suggestion popup in Obsidian on desktop and mobile, the group header's hover reveal, the focus ring on a text input, a screen reader, `prefers-contrast` and forced colours, and the vault walkthrough with its press list), which the owner judges and no review ticks
Board card: Let a player type their own class or group name on a Record set
record, without editing the layout (a homebrew class tried on one character), and
group the list by it under the collapsible headers a Record set already draws
(`docs/features/record-set-groups.md`, "Deferred: a player's own groups"). It
reverses the recorded "no text field" decision, so it carries its own model
question.

## Model question

**It touches one and settles it: `docs/SPEC.md` §13's "Free-text group key"
entry**, the last-but-one item in the file's final group. The entry weighs two
shapes, and the owner has settled the weighing before this document: **a text field
on each record**, whose typed names are the groups, and neither a per-character
list of group names in the note (it changes the note format and makes the player
create a group before using it) nor a per-character choice of which field a list
groups by. Table is out of scope. **Nothing is resolved until it is built**, so §13
is not edited here; `/land-it` writes the `Resolved:` line and the corrections at
the end of this section.

### What the reversal is, exactly

The decision being reversed is recorded in three places: SPEC §4.2's Record set
entry ("a `text` field is a configuration error"), `docs/features/record-set.md`
("What it stores, and Constraints 2 and 3") and `configError`'s refusal in
`record-set.ts`. Its stated reason is §5: the expression language has no strings,
so a text field could publish nothing, be compared to nothing and be handed to no
builtin, and "words a reader reads belong in the record's body".

**Both halves of that reason survive, and the reversal is narrow enough that
neither is contradicted.**

- *Publishes nothing, compared to nothing*: a text field still does. It is not in
  `scopeRows`' row values, no formula or condition can name it, and no aggregate
  reads it (**Design, What a text field does not do**). §5's missing strings stand
  untouched, and "no strings" is not reopened.
- *Words belong in the body*: they still do. A text field exists for one job,
  **naming the group a record sits under**. It is a key that happens to be a word,
  where the body is prose that may hold links. The two do not compete, and the
  field's refusal of a wikilink sends the reader to the body.

### Scope of the reversal: only as the group key

**`text` is legal for exactly one field of a Record set: the one `groupBy` names.**
Any other `text` field, typeless fields included, is still the configuration error,
with a message that now names the way out. This is the narrower of the two readings
and nothing argues for the wider: the only job text has here is keying a group,
a second text field has no consumer (nothing reads it, nothing draws it differently
from a body paragraph), and widening later is one clause in `configError` where
narrowing later would break layouts. The message:

> `The field "Notes" holds text, which a list can hold only as the field it is grouped by. Set Group by to "Notes", or make it a number, level, toggle, computed or modifier field, or write the words in the record's body instead.`

### What changes in the shared code, and what an existing layout sees

This is the part the previous decision was most careful about, so it is stated
completely. `columnOptions` exists because of the "no type reads as text"
ambiguity (`types.ts`, the comment on `columnOptions`; `column-types.ts`' third
policy): the shared default type is `text`, the editor leaves the default out of
the file, and a Record set that did not offer `text` therefore arrived with every
freshly added field stored as "no type", read as text, and refused.

**Offering `text` in a Record set's `columnOptions.types` brings that trap back by
exactly one route, and it is closed in exactly one place.** `list-fields.ts`
derives `fallback` as the shared default *where the list offers it*
(`offered.some(id === DEFAULT_COLUMN_TYPE) ? DEFAULT_COLUMN_TYPE : offered[0]`),
and its **Add field** handler writes `{ key }` with no type when `fallback` is the
shared default. With `text` offered, a new Record set field would be stored
typeless, read as text and refused on the first field an author created. So:

1. **`record-set.ts`: `columnOptions.types` gains `'text'`, appended, never
   inserted** (`column-types.ts`' own rule: the order decides the default). `number`
   stays first and stays what a new field is created as.
2. **`list-fields.ts`: the Add handler writes the first *offered* type out whenever
   it is not the shared default**, instead of testing the derived `fallback`. For
   Table (offers every type, `text` first) the first offered type *is* the shared
   default, so it writes `{ key }` exactly as today. For Roster and every list that
   does not offer `text`, `offered[0]` equals the old `fallback`, so it writes what it
   wrote. For a Record set, `offered[0]` is `number` and it writes `type: 'number'`
   as today. The select's display of a typeless column becomes `Text` for a Record
   set, which is what `read` has always meant by it and fixes the one documented
   disagreement (the editor drew **Number** over a field the component read as
   text); the `effective` comment in `list-fields.ts` ("not reachable from a
   fixture, reachable from a hand-edited layout") is amended to say so.
3. **Choosing `Text` in the select deletes the key** (the default is left out), so a
   text field is stored as no `type`, as it is on Table. A hand-written
   `"type": "text"` is carried untouched. Nothing here changes how a layout is
   written.
4. **Comments, not behaviour**: the `columnOptions` comment in `types.ts`, the third
   policy paragraph of `column-types.ts` and `ConfigFieldSpec`'s note are amended to
   say a Record set now offers `text` and holds it only as a group key.
   `contract.test.ts`' check that every entry of `types` is a known column type
   needs no change; its scan proving a Record set refuses `text` becomes "refuses
   `text` unless it is the group key".

**What an existing layout and an existing note see: nothing.** No layout that holds
no `text` or typeless field in a Record set changes by a byte, in the file or in the
DOM; a layout that held a typeless or `text` field there was already a configuration
error and still is (with a new sentence). No note changes: nothing is stored that
was not storable, and `text` was always a legal fence value (a `modifier` field's
cell is text today). **The test that holds it** is the existing "no `groupBy`
renders the same DOM and `write` returns the same bytes" case in
`record-set.test.ts`, extended over a list with one field of every previously legal
type, plus two new ones: `list-fields.test.ts` asserts the Add handler's stored
column for a Record set (`{ key, type: 'number' }`), for Table (`{ key }`) and for
Roster, and `layout.test.ts` round-trips a layout holding a typeless field, a
`"type": "text"` field and a `groupBy` byte-identically.

### The rest of the model question

- **Does the contract grow?** `ComponentDefinition` (§4.1) does not.
  `RecordSetConfig` gains no key. `RenderContext` gains one optional member,
  `suggestText`, for the suggestion list only (**Design, The suggestion list**), on
  `suggestFile`'s precedent; collapse state needs nothing new, being keyed by a string
  already. `ColumnOptionsSpec` gains nothing.
- **What does it publish?** Nothing. `storedLayer` skips a `text` field, so the row
  values `scopeRows` hands out, the scope a computed field resolves in, a
  `visibleWhen` condition and a reset's `where` do not contain it, and a formula
  naming it gets the ordinary unknown-name report. (A `modifier` field's raw text
  is in that scope today; a text field is deliberately not given the same
  accident.)
- **What does it store, and does it round-trip?** One fence entry per record,
  `Class: Wizard`, in the record's `sheet` fence beside the other values
  (**Data and file model**).
- **Existing notes (Constraint 4).** Untouched. A field retyped to `text` reads
  whatever its entry held, as text (`Class: 2` is the group "2"), and one retyped
  away from it keeps its entries (a `number` key treats non-numeric text as Other).
  Nothing is deleted in either direction.
- **Constraint 2.** A wikilink is refused at the commit by `fenced-link.ts`' shared
  sentence, exactly as every free-text route into this fence already is. This is
  the load-bearing safety of the feature: a group name is the likeliest thing in a
  record to be typed as a link.

### Corrections `/land-it` makes

- SPEC §4.2's Record set entry: replace "A `text` field is a configuration error"
  with the narrow rule, and its `fields` list note that `text` is offered.
- `docs/features/record-set.md`: the types paragraph gains a pointer saying the
  refusal is now "unless it is the group key".
- `docs/features/record-set-groups.md`: the "Deferred: a player's own groups"
  paragraph and the "Deliberately not doing" bullet point at this document.
- §13: the entry's `Resolved:` line, and its "two shapes" sentence records that the
  per-character list was rejected for the reasons above.
- `docs/UI.md` §9: the new rows (**Design**).

## What it does

A player types a group name on a record, such as `Blood Hunter` on a feature of a
homebrew class tried on one character, and the list draws that record under a
header of that name beside the layout's own groups. The names are whatever the
records hold: typing the same name on another record joins the group, with no
layout edit and no group to create first. Typing is helped by a suggestion list of
the names the character already uses, so the same class is not misspelled into a
second group.

## Smallest version

Cut from this document's own words: **`text` legal as the group key only
(**Scope of the reversal**), the grouping rules, the commit refusals, and no
suggestion list.** A typo then makes a new group, which is visible, reversible by
retyping, and the failure the rest of this feature exists to soften. It gives up
the suggestion list, its `RenderContext` member, its by-hand checks and the commit that carries it, and nothing else:
**Commit boundaries** keeps the suggestion list as its own commit so the owner can
take this cut by dropping one.

## Design

### At a glance

```
Class features                                    <- the component's own label
+--------------------------------------------------+
| [v] Blood Hunter  2                              |   <- a typed group
|  >  Hunter's Bane      Class [Blood Hunter]  (bin)|   <- the text field, on the line
|  >  Crimson Rite       Class [blood hunter]  (bin)|   <- matched, header spelling is the first seen
| [v] Fighter  3                                   |
|  >  Second Wind        Class [Fighter]       (bin)|
| [v] Wizard  1                                    |
|  >  Arcane Recovery    Class [Wizard]        (bin)|
| [v] Other  2                                     |   <- blank, "other", or an unreadable record
|  >  Lucky              Class [—]             (bin)|
|                                                  |
|  + Add feature                                   |
+--------------------------------------------------+
```

Everything about the header, the collapse, the box that never moves, the Add
control and the key-edit focus rule is `record-set-groups.md`'s and is not
restated. This feature supplies a third kind of key and one control.

### The field

- **A text input, one per record, on the summary line by default** or inside the
  opened record with `placement: 'body'`; both are the existing per-field setting
  and neither changes. It is an `<input type="text">` on `editable.ts`' rules:
  typing drafts, Enter or blur commits, Escape restores and says so, and a
  refusal keeps the draft.
- **Clothes are borrowed.** The class is `.sheetsmith-record-input` (the number
  field's, which is already in the transparent-field focus and hover rosters in
  `styles.css`, so it takes the shared treatment with no new selector) plus one
  width rule: a text field's track is wider than a number's (a name is not two
  digits), sized in `ch` and flexing on the summary line. Where the strip is drawn
  the field sits on its own column track like any other field. A name longer than
  the input is revealed by `ui/truncation.ts`' hover reveal, which already takes an
  input's `value` (a record's name and a Passport's name are its consumers), so
  no new truncation mechanism.
- **Its empty state is the `—` placeholder** in both placements, the number
  field's body rule extended: a chromeless blank input is otherwise
  indistinguishable from nothing, and a text field has no value to imply a slot.
  The field's name is drawn beside it as every field's is (the strip's heading
  where `fieldHeadings` is on, otherwise the secondary-text span).
- **Its accessible name** is the same string every field of a record gets
  (`<Field> <record>`, the existing `accessible`), so the input is not named by
  its value. `spellcheck="false"`: class names are proper nouns and homebrew
  words, and red underlines down a list of them are noise.
- **A field with a record's `visibleWhen`**, `placement: 'body'`, **or a hidden
  condition** behaves as any field does. A hidden key still groups the record
  (the existing rule), and the **Group by** description already says to show it.

### Grouping rules (pre-written in `record-set-groups.md`, made exact here)

- **The match key** is the trimmed value, Unicode-normalised to NFC and lower-cased
  (`toLowerCase`). NFC because the same accented letter can arrive composed or
  decomposed from a keyboard, a paste or a synced note, and two groups reading
  identically on screen are the worst thing this rule could produce. Nothing else is
  folded: an inner run of spaces is kept (`Blood  Hunter` is not `Blood Hunter`),
  and an accent is a letter (`Cléric` is not `Cleric`). Those are typos, they are
  visible, and the suggestion list is their answer.
- **The header spelling is the first-seen one**: the value of the first record of the
  group *in file order*. File order, not edit order, so the spelling is stable: no
  edit makes it flicker, and it changes only when the record holding it moves group
  or is edited. The cost is stated: when records disagree (`wizard` on record 1,
  `Wizard` on record 3), retyping record 3 to fix its capital does nothing visible,
  because record 1's spelling still heads the group; the fix is retyping record 1.
  The suggestion list makes that one pick instead of one guess.
- **Order is alphabetical** by a collator over the match key
  (`Intl.Collator(undefined, { numeric: true })`, so `Tier 2` sorts before
  `Tier 10`), ties broken by the match key itself so equal-under-the-collator
  groups never swap places between renders. **Other is always last.** Tests pin the
  collator's locale to `en`, since the order is a display arrangement and reads in
  the reader's locale.
- **The pure module owns it.** `src/parse/record-groups.ts` gains, importing
  nothing: an exported `groupMatchKey(text)` (trim, NFC, lower-case), an optional
  `label` on `GroupReading` (the spelling a record would head a group with) and on
  `RecordGroup` (that of its first member), and an ordering choice on
  `groupRecords` (by `order`, as today, or by `label` alphabetically). A level or
  number key calls it exactly as before; the new fields are optional.

### Blank, "Other" and the three that share it

- **A blank value, an unreadable record, and a value that matches `other` are one
  group**, headed **Other**, keyed `''`, last. The match to `other` is deliberate:
  without it, typing "Other" would make a *second* group headed "Other" beside the
  real one, two headers reading the same with different collapse states. This is
  a rule I am proposing, not one the owner pre-wrote; it costs only that a player
  cannot have a group genuinely named "other" apart from the leftovers.
- **The out-of-range level index and the non-numeric number key already go to that
  same group; so do these.** One group, one label, one position, whichever key type
  the list uses (a list has one key, so the three reasons never co-occur except the
  unreadable fence, which is common to all). Its header reads **Other**; its
  button's accessible name is `Other`; its count is the same `aria-hidden` figure
  with the same `.sheetsmith-sr-only` sentence (`2 features`) in `aria-describedby`.
  Nothing says why a record is in it, which is the existing decision and holds.
- **Add** appends a record with no fence, so a text key's default is blank and
  the new record lands in **Other**. The existing landing code opens a collapsed
  group with `groupReading(...)?.key`, which is `undefined` for a record with no
  reading; for a text key that is the common case, so the build uses
  `?? OTHER_KEY` there and a test drives **Add** with **Other** collapsed.

### Collapse state

- **Keyed by the match key**, the trimmed, case-folded, NFC value, never the
  displayed spelling. Retyping `wizard` as `Wizard` is the same key: the group
  stays collapsed or open as it was, and only its header's spelling may change (to
  whichever record is first in the file).
- **It uses the existing mechanism unchanged.** `SheetView` holds a
  `Map<component id, Set<key>>` of collapsed keys, the component reports
  `onToggleGroup`, and at each render that draws groups every held key with no group
  now is reported expanded. A text key is one more string in that set. Across a
  list there is only one key type, so a match key cannot collide with a level index
  or a number, and the empty string stays Other's alone.
- **A rename is the old group vanishing and a new one arriving.** Retyping every
  `Wizard` as `Mage` leaves `wizard` with no members at the render after the last
  one, so its state is pruned, and `mage` is a group nobody collapsed: it opens.
  A typo is the same, in both directions: `Wizrd` opens as a new group, and fixing
  it removes the group and its state.
- **A key edit in a focused record** follows the existing rule: the record moves on
  commit, the destination group opens, and focus follows the control
  (`regroup`/`awaitingKeyEdit`), taken only where the control holds focus, so tabbing
  to the next field does not pull the reader back. `regroup` compares match keys, so
  retyping only the case moves nothing. The focus landing finds `input` in the field's
  cell; it is the same control the reader was in.

### What the field refuses at the commit

All refusals follow the blank-name and reserved-line refusals' shape: `refuse` on
the binding, the draft kept, the standing notice drawn under the record through
`refusalNotice`, announced through the status region, prefixed `Not saved.`, and
naming the fix. The reader sees the text they typed until it is accepted or Escape.

| Reason | Message |
| --- | --- |
| A wikilink | `fenced-link.ts`' shared sentence, with `A record's fields are stored in a code block and Obsidian indexes no link inside one, so "[[Wizard]]" would stop being a link. Put it in the record's name or its body instead.` The same builder (`refusal`), so it cannot drift from the number field's. |
| Longer than 40 characters | `Not saved. A group name is at most 40 characters, and this is 57. Shorten it, or put the detail in the feature's body.` |
| A line break | `Not saved. A group name is one line, because the sheet block holds one entry per line. Remove the line break.` Unreachable by typing (an `<input>` strips them); present because the check is the file format's and a programmatic or pasted value must not reach `writeFenced`. |

**What it deliberately does not refuse, from reading `parse/fenced.ts`:**

- **A colon.** `ENTRY` splits at the *first* colon (`^([^:]+?)([ \t]*:[ \t]*)(.*)$`),
  so in the *value* half `Class: Blood: Hunter` reads back as `Blood: Hunter`
  and writes byte-identically. The colon rule (`fencedKeyProblem`) is about a *key*,
  which is why a field's *key* is refused for one and its value is not. A test
  pins it.
- **A slash.** The `/` ceiling form is split only for a `number` field
  (`storedValue`/`splitBounded` are gated on type), so a slash in a text value is
  inert. The `refuseNumber` slash rule is not copied.
- **A semicolon.** It is a list field's separator in Passport (flagged
  `entryFlag` entries only); a Record set text field is a scalar.
- **A leading or trailing space.** `bindEditable` trims the draft at commit and
  `readFenced` trims the value at read, so a space at either end can never be
  stored or read; refusing what the gesture already normalises would be a refusal
  that fires on every stray space. After the commit the input shows the trimmed
  value. The inner whitespace is kept as typed.
- **The reserved line starts** (`## `, `### `) are about the *start of a line*, and
  a value never starts one: it follows `Key: `. Not applicable, so not checked.
- **A closing fence.** A value ending in backticks is not a fence close, because
  `FENCE_CLOSE` anchors at the line start.
- **Empty.** A blank commit is legal and means "no group" (Other), written the way a
  cleared number field already writes (`Class: `).

**Why 40.** The value becomes a header's accessible name and is read aloud once per
group, and the header is a single line in a card as narrow as four columns. The
longest class and subclass names in common circulation sit near 30 characters
(`Path of the Wild Magic Berserker` is 32), so 40 clears them with room and a
description longer than that is prose, whose home is the record's body. Counted
in code points (`Array.from(text).length`), so a name in a script or with emoji is
not penalised per code unit. **Not the input's `maxlength`**, which silently
truncates a paste; a refusal that says so is this codebase's convention.

**Odd values already in a note are rendered and carried, never corrected or lost
(SPEC §10).** `read` never refuses a text value. A hand-edited `Class: [[Wizard]]`
or a 90-character value groups under its own match key, the input shows it exactly,
and the header shows the same text as typed (raw, not painted as a link: a link
inside a header's button would nest an interactive element in a button, and the
raw text is what tells the author what to fix). The refusal fires only when the
reader edits that field to something else invalid; opening and leaving the field
unchanged commits nothing. A 90-character header is **one line, clipped
with an ellipsis, and its full text appears on hover** (`ui/truncation.ts`), exactly
as every group header already clips: wrapping would make a header as tall as a name
the player typed and move every record under it, and the button's accessible name
is the whole text either way. *(This section said it wraps; that was wrong against
the stylesheet the groups feature shipped. `harness/measure-groups.mjs` check 6
holds one line, one height and the reveal.)*

### The suggestion list

**Conclusion: use Obsidian's `AbstractInputSuggest`, through a new optional
`RenderContext` member the view implements, on `suggestFile`'s exact precedent. It
needs no `ComponentDefinition` change and no component import of `obsidian`. The
earlier recommendation of a native `<datalist>` is withdrawn.** The owner's three
reasons hold: it is themed by the app, its arrow, Enter and Escape behaviour is
defined by the platform's own keymap scope, and there is no OS-drawn popup and no
untested iOS or Android datalist behaviour.

**The seam already exists.** A Picture's reference field (Image, Passport) gets an
`AbstractInputSuggest` the same way (`docs/features/picture-fit-and-suggest.md`):
`RenderContext.suggestFile?(input, commit)` (`types.ts`) is optional, the view builds
it in `sheet-view.ts` (`attachFileSuggest(this.app, ...)`, held in `fileSuggests` and
closed before the next render and on close), and `view/file-suggest.ts` owns the
`AbstractInputSuggest` subclass. Its header names this as the seam SPEC §13's
`editMarkdown` entry anticipated. `isolation.test.ts` and eslint are satisfied
because the component imports nothing: it calls a function it is handed.

**The addition, sized exactly (a small honest one, not a contract change):**

- `types.ts`: one optional `RenderContext` member,
  `suggestText?: (input: HTMLInputElement, names: readonly string[], commit: (next: string) => void) => void`,
  documented on `suggestFile`'s terms (absent, the field is the plain text box it
  is; nothing in `ComponentDefinition` or §4.1 changes).
- `view/`: a `text-suggest.ts` (an `AbstractInputSuggest<string>` that filters the
  handed names by substring on the match key and, on select, calls `commit`), a
  `text-suggest.test.ts`, and in `sheet-view.ts` the one wiring entry beside
  `suggestFile` with its instances held and closed where `fileSuggests` is.
  `file-suggest.ts` stays as it is; the two differ in what they list.
- `record-set.ts`: the text input calls `context.suggestText?.(input, names,
  handle.set-style commit)` once, and `record-set.test.ts` drives it with a fake.
- The Obsidian stub already supplies `AbstractInputSuggest` (the file and formula
  suggesters are tested under it), so no stub change is expected.
- **The editor canvas and the harness pass no `suggestText`**, as they pass no
  `suggestFile`: the field is a plain text box there, and the popup can only be
  looked at in Obsidian (a by-hand item).

**Behaviour.** A pick calls the field's own commit, which is the path typing and
pressing Enter takes, so it runs the same refusals, the same announcement and
the same regroup and focus rule. Unlike `FileSuggest`, it should not open on
focus alone: tabbing into a field to read it pops nothing, and it opens when the
reader types (`formula-suggest.ts`' "armed" rule applies here, not the file
suggester's open-on-focus, which was right only because that field's whole value is
replaced). The rule, and its two companions (a caret move with Left or Right, or a
press inside the field, disarms and closes the list, because it is then talking
about text the caret has left), are one module both suggesters use,
`ui/arm-on-typing.ts`. Enter and the arrows are `AbstractInputSuggest`'s keymap scope, which
is what makes them defined; Escape closes the popup first and the next restores.
The popup carries no ARIA of its own (the existing suggesters' stated gap, one
backlog row), and the input keeps `aria-autocomplete="list"` as the formula inputs do.

**Source: the names in use on this character, in this list only.** One name per group
the render already computed, with the first-seen spelling, in header order,
excluding **Other**. No other component's, no layout's, no vault-wide scan, and
collapse state is irrelevant (a collapsed group's name is offered). A record whose
fence will not read contributes nothing. It costs no extra reading: the grouping
pass that draws the headers produces it, and the array is passed at each render, which
is when the names change.

**Not prevented, only offered.** A typo still makes a group; the list is what makes
the correct name one pick away.

**Find-in-page** reaches a group header's name, which is text, and a collapsed
group's body is `hidden="until-found"` exactly as before. Nothing is claimed about
the browser's find and an `<input>`'s value.

### What a text field does not do

- **No reset.** `restorable` is `number` or `toggle`; `fieldWrite` returns `null` for
  anything else, `resetColumnsOf` does not offer it in **Acts on**, and `applyReset`
  never writes it. Pinned by a test over a binding that names it by hand.
- **No aggregate or publish.** `columnOptions.total` and `publish` are already
  `false` for a Record set; the editor does not offer them, and `storedLayer` skips
  the field.
- **No modifier.** `scopeModifiers` enrols only `modifier` fields.
- **No `holderMax`, `signed`, `min`, `max`, `levels`, `input`.** The editor draws
  those only for the types they mean something for; on a `text` field it draws
  Key, Heading, Holds, **Inside the opened record** and **Shown when**, and nothing
  more.

### Layout editor surface

Reused, nothing new: **Holds** is the existing select, and gains **Text** as its
last option for a Record set. **Group by** stays the existing text config field,
with no picker (`record-set-groups.md` already argues why a dynamic picker waits for
a second config key naming a field). `groupingOf` accepts `text` alongside `level`
and `number`; its wrong-type sentence now reads "a level, number or text field".
**`sample`** returns, for a `text` field, a name from a short fixed cycle
(`Fighter`, `Wizard`, `Cleric`) by record index, so the editor's canvas and the
harness draw two groups from the first two sample records, and the value obeys every
refusal above because `contract.test.ts` drives each sample through the
component's own read and write. A `text` field that is not the group key is the
configuration error above, shown in place on the canvas by the existing sheet
path.

### Regimes, mobile and empty states

- **Heading strip.** The text field is one more column track, wider than a number's
  and sized by the strip and the field's own width rule, not by any group's
  content. The existing measurement (collapsing a group moves no column of an open
  one, strip centred over fields) is re-run with a text column. **A text column's
  heading starts over the first letter of its words** rather than centred over the
  box: the words are left-aligned, and a centred heading sat 35 to 50px to their
  right. (A number's heading is centred on its ink; here the ink is at the left.)
- **Narrow regime.** The text input is at most 14ch and shrinks to 5ch when the
  line is short. A list with a text field on its summary line **stacks sooner than
  the 320px rule**: up to 480px (420px when headed, where the strip takes over at
  424px for two fields), the name and delete are on the first row and the fields
  under the name. Measured at a 321px container before this, the fields took 186px
  in two lines and the record's name was left 40px; the name is the record's
  identity and is not starved while the fields have room. The same starvation exists for other field types at a container just over 320px (a name squeezed while the fields wrap); it is pre-existing, and this feature stacks only a list holding a text field sooner.
- **Mobile.** The input meets the control floor (`UI.md` §7: the hit target is the
  line's own height at least), takes the platform keyboard, and the suggestion popup is Obsidian's own
  (the same one the formula inputs use). The harness draws no popup; the phone case is
  a by-hand item.
- **Empty list**: unchanged, **Add** only. **Every value blank**: one group, **Other**,
  with its header (a header does not appear and disappear with the data). **No
  `groupBy`**, or `groupBy` naming a text field: the former is a text field with no
  key and so the configuration error; the latter is a working list.

## Config fields

No config field is added to `RecordSetConfig`. Two existing ones change:

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `fields` | columns | Fields | The list's typed values. **Holds** now offers **Text**, which a list can hold only as the field **Group by** names: a word the player types on each record, such as a class, that heads a group. It publishes nothing and no formula can read it. |
| `groupBy` | text | Group by | The key of one level, number or text field. Records are drawn under a collapsible header per value: a level in the order its names are written, a number from lowest to highest, and text alphabetically, matched without regard to case or surrounding spaces and headed by the first spelling in the note. A record with no value goes under Other. A text field lets a player invent a group on a character without editing this layout; a level or number suits a set the layout owns. Show the key field, since a record hidden from it by a condition still sits in its group. Blank draws the list ungrouped. |

## Data and file model

**One fence entry per record: `Key: <typed text>`**, in the record's `sheet` fence
beside its other values, nothing else in the note. No quoting, no escaping, no
refusal beyond the commit refusals above, because the fence's own grammar needs
none for a value: `readFenced` splits at the first colon and trims, `writeFenced`
writes `key: value` and rewrites a line only where the value differs after trimming.
So a text value round-trips byte for byte for every value this component accepts,
and a hand-edited one (`Class:   Blood: Hunter  `, `Class: [[Wizard]]`) is read
without correction and **left alone on disk until that field is committed to
something different**. Constraint 3 holds by construction for the same reason it
holds for a number field; a test over a note with odd spacing, a colon and a link in
the value asserts parse-then-serialise is byte-identical and that a `write` that
changes another field leaves the odd line's bytes.

- **Constraint 2**: a typed wikilink is refused at the commit; one already present is
  carried, never moved or repaired.
- **Constraint 4**: a layout change never deletes data. Retyping a field away from
  `text`, removing it, or clearing `groupBy` keeps every entry; removing the `groupBy`
  of a text field turns the field into the configuration error and blanks the
  component until the author fixes it, and no note is touched by that.
  Renaming the field's key in the editor migrates the entries (the existing rename
  migration; a fence entry is a fence entry) and does not rewrite `groupBy`, the
  existing rule.
- **The layout** gains no key. A text field is an ordinary `fields[]` entry with
  `type` absent, or `"text"` if hand-written.
- **Collapse state** stays in neither file.

## Acceptance criteria

### Held by tests

- [x] **Nothing existing changes.** A Record set with one field of each previously
      legal type renders the same DOM and `write` returns the same bytes as before,
      with and without `groupBy`. The existing "no `groupBy`" case is extended, not
      replaced.
- [x] A Record set field typed `text` (absent type) is accepted when `groupBy` names
      it (case- and padding-insensitive), and is the new configuration error, naming
      **Group by**, otherwise; a second text field is the error; a typeless field
      that is not the key is the error. `read` fails with that message and `scopeRows`
      and `scopeModifiers` publish nothing, as for every `configError`.
- [x] The half-valid-type message (a text field that is not the `groupBy` field)
      appears on **both** the editor canvas and the sheet: the same sentence, in place,
      through the editor path and through the view's render path.
- [x] `list-fields.test.ts`: the Add handler stores `{ key, type: 'number' }` for a
      Record set, `{ key }` for Table and the same as before for Roster; the select
      lists **Text** last for a Record set and shows **Text** for a typeless field.
      `layout.test.ts` round-trips a layout with a typeless field, a `"type": "text"`
      field and a `groupBy` byte-identically.
- [x] `record-groups.test.ts`: `groupMatchKey` trims, NFC-normalises and lower-cases;
      groups merge on it; the first member in file order supplies the label whatever
      order the records were edited in; groups sort alphabetically with `Tier 2`
      before `Tier 10`; ties are stable; `Other` is last; blank and `other` share
      the Other group with an unreadable record; every record is in exactly one
      group.
- [x] Grouping through the component: `wizard` and ` Wizard ` and `WIZARD` are one
      group headed with the first in the file; `Cléric` and `Cleric` are two; two
      spaces inside a name make a different group; `Other`, `other` and blank are
      one group under **Other**, with the count sentence and the accessible name
      `Other`.
- [x] Collapse is keyed by the match key: collapse `wizard`, retype one record's
      `wizard` as `Wizard`, and the group is still collapsed; retype the last member
      to `Mage` and the old key is reported expanded and `mage` is open; a typo
      opens as a new group and fixing it removes the group and its state.
- [x] A key edit: before commit the record is where it was; after, in the new group,
      which opens; retyping only the case moves nothing; Escape restores; tabbing
      away commits and does not pull focus back; Enter commits and focus is on the
      same input of the same record. **Add** with **Other** collapsed opens it and
      lands focus in the new record's name field.
- [x] Refusals: `[[Wizard]]` is refused with the shared sentence and the draft is
      kept; a 41-character name is refused with its count, a 40-character one is
      saved, a name of 40 emoji is counted by code points; a line break is refused;
      Escape after a refusal restores. A colon (`Blood: Hunter`), a slash (`A/B`),
      a semicolon and inner spaces are accepted and stored as typed; leading and
      trailing spaces are trimmed by the commit.
- [x] Round trip: a note whose records hold `Class: Wizard`, `Class:   a: b  `,
      `Class: [[Wizard]]` and a 90-character value parses and serialises
      byte-identically; a `write` to a sibling field leaves those lines' bytes alone;
      the odd records are drawn, grouped by their own match keys, and carried.
- [x] Inert paths: `scopeRows`' row values do not contain the text key; a formula
      or `visibleWhen` naming it reports unknown name; `resetColumns` does not offer
      it; `applyReset` with a binding naming it by hand writes nothing and every
      other field resets as before; `scopeModifiers` is unaffected. A `sum` over a
      numeric field is the same with a group collapsed.
- [x] The suggestion list (omitted in the smallest version): the component calls
      `suggestText` once per text input with this list's group names only, first-seen
      spellings, in header order, excluding **Other**, including collapsed groups,
      rebuilt on a render; a pick commits through the field's own commit (so a regroup
      and its focus rule run); no name from another component; absent `suggestText`
      leaves a plain input. `text-suggest.test.ts` holds the filter and the commit,
      and does not open on focus alone.
- [x] `sample` returns names from the fixed cycle for a text field and
      `contract.test.ts` drives them through read and write; the contract and
      isolation tests pass.
- [x] `styles.test.ts` agrees with the regenerated `styles.css`.

### Held by looking (`npm run harness`, `npm run harness:shot`, then `/design-review`)

- [ ] A text field on the summary line, headed and unheaded, wide and narrow, both *(Owner-checked: the focus ring and the hover reveal, which is measured and not seen. The rest is shot and measured.)*
      themes: sized for a name, takes the shared hover and focus, shows `—` when
      blank, and a name wider than the input reveals on hover.
- [x] The same field with `placement: 'body'` in an opened record.
- [x] A grouped list with typed groups, a case-variant pair under one header, and
      **Other**: header spellings, alphabetical order, **Other** last. A 90-character
      hand-edited value is clipped to one line in its header, the same height as its
      siblings, and moves no neighbour.
- [x] A refusal under a record for a link and an over-long name, in
      `.sheetsmith-error` beside the record, the draft still visible. **The line-break
      refusal is held by a test only**: an `<input>` strips a line break on typing, so
      no harness gesture reaches it.
- [x] The measurements of `harness/measure-groups.mjs` re-run with a text column: the
      sheet does not move on collapse, columns line up across groups, the strip is
      centred over the text field's track.
- [x] The editor canvas shows two sample groups for a layout whose text field is the
      key, and the configuration error in place for one that is not.

### By hand, for the owner (the harness cannot take them, and no review ticks them)

All owner-checked and unticked, except where the result line below records a check driven in the app, with `prefers-contrast: more` and forced colours (never rendered) and the vault walkthrough's press list.

- [x] The suggestion popup in Obsidian, desktop and mobile: it opens when typing and
      not on focus, arrows and Enter pick, Escape closes it before it restores, a pick
      regroups the record and focus follows, and it is themed like the formula inputs'.
- [ ] Screen reader: the input announces as an editable combobox with its record's
      name; a group header reads name, button, expanded or collapsed, count.
- [ ] Find-in-page for a group's name finds its header; with a group collapsed the
      body stays `hidden="until-found"` as before.
- [x] Type a homebrew class on one record, then the same class on two more with the
      suggestion list and without it; retype one with a different capital; confirm
      the group is one and the header keeps the first spelling.

In the app on 2026-10-08, Obsidian 1.14.4 over the DevTools protocol, on `Characters/Records.md`'s Homebrew features (the fixture below was already in the vault). Two passed. **The popup**, at desktop and at a phone emulation of 390 × 844 (`app.emulateMobile`, not a device): a real click focused the field with no popup, typing `e` opened Blood Hunter and Fighter, ArrowDown and Enter picked Fighter, the record moved to that group and kept focus, one Escape closed the popup with `e` kept, and a second restored `Wizard` and blurred. The popup's computed container and item styles equalled the ceiling formula popup's. **Homebrew classes**: `Druid` typed in full on Second Wind and Lucky, and picked from the list on Odd one, made one group headed `Druid`, which `DRUID` retyped on Lucky did not change. The screen reader was not reached: none was available to the session. Find-in-page was not reached in Obsidian: Cmd-F, as a real key event and as the `editor:open-search` command, opens nothing in a plugin view, so there is no find-in-page there to test (`record-set-groups.md` has the measurement); the Chrome half was not taken. The summary-line text field is shot at 620, 1452 and 390 for the owner. The method is in `record-summary-fields-first.md` § In the app, 2026-10-08.

### The throwaway vault fixture

The vault is outside the repository, so its recipe lives here (`AGENTS.md`). Work
goes in `~/Developer/sheetsmith-test-vault/`, in the Record fixtures and not in
Aramil, which stays plain. **`Sheetsmith layouts/Record variations.sheetsmith`**
gains, each existing component an unchanged control:

- `homebrew_features` ("Homebrew features"), four columns wide, four rows tall, beside
  the existing `class_features` so the two key types sit in one view. Fields:
  `Class` (no `type`, so text), summary line; `Uses`, a `number` with `max: 3`.
  `groupBy: Class`. This is the class-features-style list with a player's own class.
- `homebrew_body` ("Homebrew in the body"): the same with `Class` on
  `placement: 'body'`.
- `homebrew_strip`: `fieldHeadings: true`, `Class` and `Prepared` (toggle), for the
  strip-over-text case.
- `bad_text_plain`: a text field and **no** `groupBy`, the configuration error;
  `bad_text_second`: two text fields, one of them the key.
- Inside the existing **Tabbed features** Tab set, a tab holding a text-keyed list,
  to show a typed group inside a container.

**`Characters/Records.md`** gains sections for each. `## Homebrew features` holds
eight records: three `Fighter`, two `Blood Hunter` (one spelled `blood hunter`), one
`Wizard`, one blank, one `Other`. `## Homebrew in the body` holds five with a body on
one. The odd-values records live in `homebrew_strip`: `Class:   Blood: Hunter  `,
`Class: [[Sunblade]]` and one of 90 characters. Press (owner-checked, none ticked by
a review): the by-hand list above, then collapse `Fighter`, retype a Fighter's class
`fighter` and confirm it stays collapsed; add a record and give it a new class; delete
the only record of a group and add another; close and reopen and confirm every group
is open; confirm `Records.md`'s bytes are unchanged by collapsing and by opening a
field and leaving it unchanged.

## Commit boundaries

These are a plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. `feat: Let a Record set hold a text field as its group key`. `columnOptions` and
   the Add handler's change in `list-fields.ts`, `configError` and `groupingOf`,
   `storedLayer`'s skip, `sampleField`, the refusals, the comment amendments in
   `types.ts` and `column-types.ts`, and the tests for scope, inertness, refusals and
   round trip.
2. `feat: Group a Record set by what the player types`. The `record-groups.ts` match
   key, label and alphabetical order with their tests; the text control, its
   styles and regenerated `styles.css`; match-key collapse, `Other`'s shared group,
   the `?? OTHER_KEY` landing; the component and view tests.
3. `feat: Suggest the group names a character already uses`. `RenderContext.suggestText`,
   `view/text-suggest.ts`, the view's wiring and closing, the component's call, and
   their tests. Droppable alone: dropping it is the smallest version.
4. `test: Photograph and measure a text-keyed Record set`. `harness/samples.ts`
   fixtures and the re-run measurements, numbers recorded.
5. `docs: Record the free-text group key`. SPEC §4.2 and §13 (`Resolved:`), `UI.md`
   §9 (a text field on a summary line; an open list with suggestions), the
   cross-references listed under **Model question**, and this document's status.

## Deliberately not doing

- **A per-character list of group names in the note**, and **a per-character choice of
  which field a list groups by.** Rejected by the owner; the first changes the note
  format and makes the player create a group before using it.
- **Text anywhere else in a Record set**, and **Table.** The narrow scope above; a
  second text field has no consumer.
- **Bulk rename.** A rename is retyping each record, with the suggestion list making
  each one a pick. **The trigger to build a bulk rename:** a reported complaint, or a
  shipped starter layout whose text key routinely holds **12 or more records per
  group** on one character. Twelve because renaming a whole class is the motivating
  case and a class's features across twenty levels run to about that many, which is
  past one screen of a four-row list and enough to be the cost rather than a chore.
  Its first design question is whether it renames one character's records or a
  name across a layout's characters, which is a vault-wide write and a different
  feature.
- **Merging two groups that differ by a typo, accent folding, or collapsing inner
  whitespace in the match key.** Visible typos with a suggestion list as the answer;
  folding more would hide differences the reader may mean.
- **A `<datalist>`, or a popup of this plugin's own on `anchored-panel.ts`.** The
  platform's `AbstractInputSuggest` is used instead (**The suggestion list**).
- **Suggestions from other components, other characters, or the layout**, and a
  "frequently used" order. Names in use on this character, this list.
- **Showing a hand-edited wikilink as a link in a header**, and any correction of an
  odd value on read. Rendered and carried.
- **A group name that differs from its field value**, a header-name setting, and
  group-level figures. The header is the first-seen spelling of what was typed.
- **A formula that reads a text field**, `count` by group, and anything that
  needs strings in the expression language. §5 stands.
- **A key rename carried into `groupBy`** and a dynamic field picker for it, on
  `record-set-groups.md`'s own trigger (a second config key naming a field).
- **Every item `record-set-groups.md` lists as not doing**, unchanged: expand all and
  collapse all, sticky headers, persisted collapse, hand order.
