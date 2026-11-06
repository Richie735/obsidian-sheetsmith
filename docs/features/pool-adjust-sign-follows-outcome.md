# Pool adjust sign follows outcome

Status: shipped
Route: standard. The surface exists: this spec settles one rule and the place it is read. No new drawn state.
Board card: A Pool's Adjust field can show one direction and apply the other. `-2+5` shows Spend and spends 3.

## Model question

None. Nothing is stored that was not stored before, and the note's format does not change: the amount is never written, only the pool's `current` (and `temp`) it lands on.

## What it does

The Adjust control reads its amount once. That one reading gives the size and, when the amount states one, the direction, and the toggle, the preview line and the apply all take it from there. Today the toggle reads the text's first character and the apply reads its evaluated value, so `-2+5` shows `−` and spends 3 when the arithmetic comes to +3. That breaks SPEC §4.2's "keeps the control from ever showing a direction its own outcome contradicts".

## Smallest version

One module-level reader in `src/components/pool.ts`: raw text in, either nothing applicable, or `{ by, says }`. `by` is the size and `says` is `-1`, `1` or no direction. The `input` handler, `size()`/`showPreview()` and `close()` all call it, and the `startsWith` checks go. Plus the test cases below. `amountOf` keeps its contract. What it gives up: a lone `-` no longer flips the toggle on the first keystroke. The flip comes one keystroke later, at `-2`, the first point where the amount says anything.

## Design

### The rule

**Direction comes from the amount's value, never its first character, and moves only when the amount states one.** An amount states a direction when it evaluates to something other than zero and either has a sign in front of it or comes out negative. The direction is then the sign of the value. Nothing else moves the toggle except a press on it.

| Text | Toggle before | Shows | Applies | Why |
| --- | --- | --- | --- | --- |
| `17`, `2*3` | either | unchanged | 17, 6 that way | Unsigned and positive: a magnitude, so the common spend needs no sign (unchanged) |
| `-17`, `+17` | either | `−`, `+` | 17 that way | A plain signed number, as today |
| `-2+5` | Spend | `+` | restores 3 | Signed, and the value is +3. The bug's case |
| `+2-5` | Restore | `−` | spends 3 | Signed, and the value is −3 |
| `2-5` | Restore | `−` | spends 3 | Unsigned, but it comes to −3 |
| `-2+2`, `-0`, `0` | either | unchanged | nothing | Zero has no direction and changes nothing |
| `-`, `-2+`, `2*` | either | unchanged | nothing | Does not evaluate yet. Holds still |
| `-17`, press, then `-170` | Spend, pressed to Restore | `−` | spends 170 | The latest edit to the text wins over an earlier press |

**Leading sign, opposite result (`-2+5`, `+2-5`): the evaluated sign wins.** The leading character is a term in the arithmetic, not a direction prefix. Reading it as a prefix is exactly the second reading this fix removes. `+2-5` is minus three, and the control says so.

**No leading sign, negative result (`2-5` under Restore): it spends 3 and the toggle moves to `−`.** Settled by the owner at the spec stop. The rejected alternative was the magnitude reading: unsigned text is always a size, so `2-5` restores 3 under Restore and spends 3 under Spend. It never moves the toggle, which was its appeal. Against it: `2-5` and `-3` are the same number typed two ways, and the magnitude reading applies them in opposite directions under the same toggle. That is the two-readings-of-one-text defect again, moved from the leading character to the operator. It also makes `2-5` and `+2-5` go opposite ways, one character apart. The settled rule has one meaning for a minus wherever it sits. Its cost: a direction the reader set can be overridden by arithmetic they typed. The flip is visible on the toggle and on the preview line before anything applies, and an unsigned expression meaning "restore three" would more naturally be typed `5-2`.

**Zero (`-2+2`, `-0`): the toggle holds, the preview is empty, and Enter closes the panel and writes nothing.** This is the existing `by === 0` behaviour, and the reader keeps it. Zero has no sign to show, so the toggle keeps what it last showed. `-0` must not count as negative. Nothing applies, so no shown direction can be contradicted.

**Not yet evaluable (`-`, `-2+`): the toggle holds, and the preview is empty.** The direction is a setting, so it holds through the keystrokes between two readable states. Typing `-2+5` from Spend goes `−` `−` `−` `+`, changing once, where the arithmetic changes sign. The preview, by contrast, is an outcome, and it must not hold a stale one: Enter on `-2+` applies nothing (as today), so a held `−2 → 43` would promise a change that does not happen. The preview line's box stays open whether or not anything is pending (SPEC §4.2), so emptying its text moves no layout. This is the holds-still principle that SPEC §4.2 states for the row under a finger and `pool-temp-refuses.md` states for the pill. `docs/UI.md` §11 is the review checklist and states no rule about it.

**A press on the toggle is the latest word until the amount is next edited.** With `-17` in the field, a press shows `+`, the preview says `+17 → …`, and Enter restores 17. This is unchanged. The text is never rewritten to match, because this codebase does not replace what somebody typed. The preview line says which way it will go, so shown and applied still agree.

**The latest edit to the text wins over an earlier press.** The next keystroke reads the text again, and a reading that states a direction moves the toggle like any other. With `-17` typed and the toggle pressed to `+`, typing `0` makes `-170`, which states minus: the toggle goes back to `−`, the preview reads `−170 → -125`, and Enter spends 170. The press was an answer to the text as it stood, and the text the reader then typed is the newer statement. Shown and applied agree at every step.

### The test every case passes

Once the field holds something applicable, the toggle, the preview's sign and the write all come from one `direction` and one `by`. `direction` changes only through a press or a stating reading. `close()` applies `direction * by` from the same reader the preview used.

### Reuses

Everything. `showDirection` and `showPreview` draw only the two toggle states and the preview formats they draw today. There is no new state on screen, so the brief's harness shots of `-2+5` before and after applying are not required on that ground. The land stop's general rule on PNGs is the PM's to apply. The harness cannot hold this state anyway: `&type=` leaves the field, and leaving abandons an amount.

### Empty and error states

Empty: as today (no preview, Enter closes and writes nothing). Error: an amount that does not evaluate applies nothing and holds the toggle. There is no refusal sentence, because the field is a command being composed, not a value being committed.

## Config fields

None.

## Data and file model

Unchanged. The amount is never stored, so the change has no round-trip effect and no effect on existing notes.

## SPEC §4.2 Pool amendment

Replace the sentence "A typed sign still wins and moves the direction to match it, which keeps the control from ever showing a direction its own outcome contradicts." with:

> A sign the amount states still wins and moves the direction to match it, which keeps the control from ever showing a direction its own outcome contradicts. What states it is the amount's value, not its first character: `-2+5` restores three and `+2-5` spends three, and `2-5` spends three whichever way the direction was set, because it is minus three however it was typed. Only an amount that comes to more than zero with no sign in front, `17` or `2*3`, takes the direction as it stands. One that comes to zero applies nothing, and one that does not evaluate yet, `-2+` on the way to `-2+5`, applies nothing too. Both leave the direction where it was, so the direction moves only when the amount says something and holds still through the keystrokes between. The preview line empties for them, since it reports an outcome, and neither has one.

## Acceptance criteria

All in `src/components/pool.test.ts`, beside "lets an explicit sign win, and moves the direction to match it", on a pool at 45 of 62. Each asserts what the note holds after Enter (the `current` written, or that `onChange` was not called), not a delta.

- [x] `-2+5` from Spend: the toggle shows `+` with the "Restoring HP" name, the preview reads `+3 → 48`, and Enter writes `current: '48'`.
- [x] `+2-5` from Restore: the toggle shows `−`, the preview reads `−3 → 42`, and Enter writes `current: '42'`.
- [x] `2-5` from Restore: the toggle shows `−`, and Enter writes `current: '42'`.
- [x] `2+3` from Restore: the toggle stays `+`, and Enter writes `current: '50'`. Unsigned positive defers.
- [x] `-2+2` and `-0`, each from Restore: the toggle stays `+`, the preview is empty, and Enter writes nothing and closes the panel.
- [x] Mid-typing, from Restore: `-` leaves the toggle at `+` with an empty preview. `-2` shows `−`. `-2+` keeps `−` with an empty preview, and Enter on `-2+` writes nothing.
- [x] With `-17` typed, a toggle press shows `+`, the preview reads `+17 → 62`, and Enter writes `current: '62'`.
- [x] With `-17` typed, a toggle press to `+`, then `0` typed to make `-170`: the toggle shows `−` again, the preview reads `−170 → -125`, and Enter writes `current: '-125'`. The pool runs free below zero (SPEC §4.2), so the write is observable and differs from what a restore would write (`215`).
- [x] The existing sign, expression, buffer-split and preview cases pass unchanged.
- [x] Vacuity: with the `input` handler put back to its `startsWith` reading, the `-2+5`, `+2-5` and `2-5` cases fail.
- [x] `src/components/pool.ts` holds no `startsWith('-')` or `startsWith('+')` on the amount's text outside the one reader, and `amountOf` in `src/interaction/editable.ts` is unchanged.

## Commit boundaries

1. `fix: Read an amount's direction from its value, not its first character`. Contains `src/components/pool.ts` (the reader and its three callers) and the `pool.test.ts` cases.
2. `docs: Record what states an amount's direction`. Contains this doc (Status `built`) and the SPEC §4.2 amendment above.

## Deliberately not doing

- The temporary-points pill not following the sheet's text size (`docs/BACKLOG.md` § UI row).
- The Pool ceiling overflowing a one-column card at the largest text size (`docs/BACKLOG.md` § UI row).
- Any change to the main value field's own arithmetic, which sets a value rather than adjusting it.
- The steppers and the drag gesture.
- `amountOf`'s contract, which other callers share.
- A refusal sentence for an amount that does not evaluate.
- Rewriting the typed text when the toggle is pressed.
- Layout. Nothing on the card moves or gains a state.
