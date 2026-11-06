# Track's Add form settles its length

Status: shipped
Board card: A Track row set's **Add** form stores its **Length** as typed, so
`2+1` is written as `name: / 2+1` and the card reads that row as having no
length, while the row's own length field settles the same `2+1` to 3. Two
fields write one value and disagree on what it may hold.

Route: standard, brief spec. The mechanism exists twice already (`settleEntry`
behind the row's own length field, and the Add form's `say` refusal slot); this
doc picks between them and records the choice.

## Model question

None. Nothing new is stored, published or read: the entry keeps the
`key: filled / length` composite `docs/features/track-row-length.md` defined,
and the contract does not change. The one question is which of two existing
precedents the Add form follows, settled under Design.

## What it does

Typing `2+1` into the **Add** form's **Length** and pressing **Add** writes the
row with a length of 3, exactly as typing `2+1` into that row's own length field
afterwards would. A word (`lots`) is refused with one sentence in both fields,
the draft kept, rather than written as a row with no length and no explanation.

## Smallest version

`add()` passes the trimmed length through `settleEntry` (exported from
`editable.ts`, not copied) before `refuseRowLength`, and writes the settled
text. `refuseRowLength` gains a not-a-number check, so both fields refuse a
word with one sentence and a blank stays allowed in both. The Add form takes
the full keyboard. It gives up the phone keypad on that field.

## Design

### Settle, not refuse

**The Add form settles, like the row's own length field.** The alternative,
refusing anything that is not a bare whole number as Pool's temporary points do
(`docs/features/pool-temp-refuses.md`), was rejected:

- **The bug is two fields disagreeing about one value, and refusing keeps them
  disagreeing.** The row's own field accepts `2+1`; a refusing Add form would
  turn it away. The reader would learn one rule at the form and a different one
  a tab-stop later, on the very row the form just created (focus lands in that
  row's length field after **Add**).
- **`track-row-length.md` already argued this value takes arithmetic**: "a die
  count is exactly the kind of number a player arrives at by adding a level's
  worth of dice to what they already had." That reasoning is about the length,
  not about which field types it. A clock's segments or a kill target arrived
  at by sum is the same case on an open row.
- **Pool's temp field refuses because it has no arithmetic to agree with.** Its
  doc says "the field settles no arithmetic, so there is no sum to show the
  answer of." Here there is a field one row down that settles, so the Pool
  precedent's premise does not hold.

**Cost, named:** the Add form's **Length** loses the iPhone digits-only keypad.
`docs/UI.md` §7 is explicit that "arithmetic the field settles (`43-7`, `2*3`)
… needs a key the keypad lacks", so the field takes `inputMode = 'text'`, set
explicitly, as the row's own length field does. The keypad population in
`src/numeric-keypad-sites.test.ts` drops to Pool's temporary points alone.

### What `add()` does with the length, in order

The same order `bindEditable` uses for the row's field (settle, then refuse),
so one input meets one sequence of rules wherever it is typed:

1. **Trim.** Blank stays blank and writes a bare `name:` entry, unchanged.
2. **Settle** with `settleEntry(length, true)`. `2+1` becomes `3`, `4/1` becomes
   `4`, `12` stays `12`. Text the parser refuses comes back untouched.
3. **`refuseRowLength(settled)`**: a note reference, a slash that survived
   settling (`4/lots`), and now a word (below). A consequence worth naming:
   `4/1` and `4/2` are no longer refused by the Add form, since they settle to
   `4` and `2` before the slash check runs, which is what the row's field
   already does.
4. **Write** `withCeiling('', settled)`. The field is not repainted with the
   settled text first, since the panel closes on a successful **Add**.

### A word is refused in both fields, by `refuseRowLength`

**The not-a-number check lives inside `refuseRowLength`**, after the link and
slash checks, so the one function both fields already call is the one rule for
what a length may hold. This deliberately widens the fix by that one function:
the row's own length field, which today stores a word as typed, now refuses it
too. A settled length that is still not a finite number (`lots`, `d6`, `2+`) is
refused with:

> Not saved. A length is a number of segments, and "lots" is not one. Type a
> number or a sum such as 4+1, or leave it empty.

In the Add form it arrives through the existing `say(lengthField,
lengthProblem, …)` slot and the card's live region. In the row's field it
arrives through `bindEditable`'s `onRefusal`, the live region the slash refusal
already uses. In both, the draft stays in the field and nothing is written.
Settling cannot rescue a word, and storing it would be the silent no-length the
card describes.

**A blank is still allowed in both, and `refuseRowLength` is what allows it.**
In the Add form it writes a bare `name:`; in the row's field it clears the
length and keeps the entry, as `track-row-length.md` says. The row's field
hands the refusal a blank on every clear, so the check must return null for
the empty string, and the Add form asks it too rather than guarding in front
of it: a guard there would be a second statement of the same rule, which is
the one-copy tell this fix exists to close.

**Nothing stored is rewritten**, so SPEC §4.2 ("a stored value outside the run
is rendered, not corrected") and Constraint 3 still hold. The check runs only
on a commit. A note already holding `d10: 2 / lots` reads exactly as before:
filled 2, no length, round-tripping byte-identically. Its field shows `lots`,
and a focus and blur with nothing typed writes nothing and refuses nothing,
because `bindEditable` returns before `refuse` when the settled draft equals
the stored text. Only a new commit of a word is refused.

**Numbers the card will not draw are still written**: `0`, `-1`, `2.5` (and
`2-3`, `5/2` once settled). The row's own field writes them too, and
`characterLength` already reads them (floored, clamped to `MAX_SEGMENTS`, below
one segment drawn as no run). They are numbers, so the word check passes them
in both fields, and the two still agree.

### What it looks like

Nothing new is drawn. The refusal sentence uses the `.sheetsmith-panel-problem`
paragraph the form already draws for name and link refusals, and
`panel.place()` already runs after one appears. The keyboard change shows only
on an iPhone. The harness does not stage an open **Add** panel, so there is no
shot to take and the design wave is skipped for this change. Both halves are
held by tests.

### A note already holding `name: / 2+1`

Not rewritten (Constraint 3, SPEC §4.2 "a stored value outside the run is
rendered, not corrected"). It reads as `track-row-length.md` already says a
non-number ceiling reads: filled as stored, no length. The row draws its name,
its length field holding `2+1`, no run and no error. The reader repairs it from
that field: any commit there settles it to `3`. That includes a focus and blur
with nothing typed, because `bindEditable` compares the settled draft with the
stored text. That is the row field's existing behaviour, triggered by the
reader's own gesture, and is not changed here.

## Config fields

None.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |

## Data and file model

Unchanged shape: `<name>: / <length>`, or `<name>:` for a blank length. What
changes is only which text reaches `<length>`: the settled number rather than
the typed sum. Existing notes are read and round-trip byte-identically as
before. An entry already holding a sum is left as it is (above).

## Acceptance criteria

All in `src/components/track.test.ts`: the Add form's cases under
`describe('the Add form')`, and the row's own length field's (committing
`lots`, clearing, and the stored `d10: 2 / lots`) under `describe('a row whose
length the character owns')`, beside that field's other cases. Each write case
asserts what the note holds, through `track.write`, not only the `onChange`
delta (PATTERNS §10).

- [x] **Add** with `Wolves` and `2+1` leaves the note holding `Wolves:  / 3`.
- [x] **Add** with `4/1` leaves `Wolves:  / 4`, and is not refused.
- [x] The existing case "refuses a length that would be read back as two
      numbers" (`track.test.ts`, near line 2278) types `4/lots` instead of
      `4/2`, which now settles to 2. It is still refused with the slash
      sentence, and nothing is written.
- [x] **Add** with `lots` writes nothing, keeps `lots` in the field, shows the
      refusal under it, and sets `aria-invalid` and an `aria-describedby`
      pointing at it. The card's live region carries the same sentence.
- [x] On a character-owned row, committing `lots` in the row's own length
      field writes nothing (`onChange` not called; a component reaches the
      note only through it), keeps `lots`
      in the field, and puts the same sentence in the card's live region.
- [x] Clearing the row's own length field still commits and writes the bare
      entry (`d10: 2`), unrefused.
- [x] After the Add form's refusal, typing `4` and pressing **Add** writes `Wolves:  / 4`
      and the length refusal is gone.
- [x] **Add** with `0` writes `Wolves:  / 0`, unrefused, matching the row's own
      field.
- [x] A blank length still writes `Wolves: ` (the existing case, unchanged).
- [x] The **Length** field's `inputMode` is `'text'`. The existing case "keeps
      the keypad on the length" is replaced, not deleted.
- [x] A note already holding `Wolves:  / 2+1` renders the row with its length
      field holding `2+1` and no run, and round-trips byte-identically.
- [x] `src/numeric-keypad-sites.test.ts` allows no keypad in
      `components/track.ts`, and its header names only Pool's temporary points.
- [x] With the `settleEntry` call removed from `add()`, the `2+1` and `4/1`
      cases fail. With the word check removed from `refuseRowLength`, both
      `lots` cases fail, the Add form's and the row field's.
- [x] A note already holding `d10: 2 / lots` still reads as filled 2 with no
      length and round-trips byte-identically. A focus and blur on its length
      field writes nothing and shows no refusal.
- [x] `settleEntry` has one definition, in `src/interaction/editable.ts`,
      exported. `track.ts` imports it and holds no copy.
- [x] `npm run lint`, `npm test`, `npm run build` pass.

## Commit boundaries

1. `fix: Settle the length typed into Track's Add form`. Contains
   `src/interaction/editable.ts` (export `settleEntry`, doc comment naming its
   second caller), `src/components/track.ts` (`add()`, the keyboard, the
   comment at `lengthField.inputMode`, and the word check inside
   `refuseRowLength` with its doc comment, which is also the row's own length
   field now refusing a word), the `src/components/track.test.ts` cases for
   both fields, and
   `src/numeric-keypad-sites.test.ts` (allowance and header).
2. `docs: Record that Track's Add form settles its length`. Contains this doc;
   the amendment to `docs/features/character-added-track-rows.md` (§ "The Add
   panel": the **Length** field settles arithmetic as the row's own field does,
   takes the full keyboard, refuses a word; the "**Length** number field"
   wording goes); the amendment to `docs/features/track-row-length.md` (its
   gestures list gains a bullet beside the slash refusal: the row's field
   refuses a word with the shared sentence, a stored word still reads as no
   length and is never rewritten); `docs/UI.md` §7's keypad bullet (one field keeps the keypad,
   not two); and a SPEC §4.2 clause on the `openRows` paragraph ("typed into
   the same composite … and settled as the row's own length field settles it").

Both feature docs are amended. The Add form is `character-added-track-rows.md`'s
surface, and the row field's new word refusal is `track-row-length.md`'s.

## Deliberately not doing

- **Arrow-key stepping on the Add form's Length.** The row's own field steps.
  The form commits on **Add**, not on blur, and was never a `bindEditable`
  field. Not asked for.
- **Refusing `0`, negatives or fractions** at the form (above).
- **Repairing stored `name: / 2+1` entries.** SPEC: a stored value is never
  rewritten. The row's own field repairs it on the reader's commit.
- **Record set's ceiling field**, which refuses arithmetic by its own spec.
- **The Add form's Name field.**
- **Every `docs/BACKLOG.md` § UI row**: Pool and Card number overflows, temp
  pill text size, resize corner, WebKit select, Passport chip, empty card select
  rows.
- **Extracting the refusal-notice painter** (`docs/BACKLOG.md` § Patterns). The
  form's `say` is untouched.
