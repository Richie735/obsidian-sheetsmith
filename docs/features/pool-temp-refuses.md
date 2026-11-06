# Pool temp refuses

Status: shipped
Route: fix, by precedent. No spec stage: the rule already exists in three places (SPEC §4.2's "The buffer is floored at nothing, and the pool is not" and "Temporary points are a buffer, and spending takes them first", `docs/UI.md` §7's keypad rule, and the comment at `tempInput` in `src/components/pool.ts`), and the code enforced only its floor.

## The defect

Every valid buffer is a non-negative whole number of points. The temp field enforced only the floor:

1. `2.5` was stored as typed. `commitDraft` clamped a finite negative to `0` and passed every other value through.
2. `abc` was stored as typed, and `tempValue()` then read it as zero for spending, so the note held one thing and the card acted on another.
3. ArrowDown on an empty or zero buffer showed `-1` until commit: the binding had `step` and no `min`.

## Decision: refuse, not settle

**A fraction and a non-number are both refused**: the draft stays in the field, a sentence appears under the pill, and the stored value is untouched. Settling was rejected for both. Rounding `2.5` picks a number the character did not type (2 or 3, and nothing says which was meant), and clearing `abc` throws away what they typed. The field settles no arithmetic, so there is no sum to show the answer of. This is record set's `refuseNumber` reasoning ("replacing what somebody wrote with a number they did not is the thing this codebase refuses to do").

**A negative is still settled to `0`**, as SPEC §4.2 says. The refusal runs before the clamp, so the rule leaves negatives alone and the clamp keeps them.

**Followed caller: Record set's value field** for the binding (`record-set.ts`, the `bindEditable` with `step`, `min`, `refuse: refuseNumber` and a notice). It is the only `refuse` caller that is a stepped number field on a card with a visible notice. Track's row length is the nearest by shape, but it only announces. The notice is hung after the control as Passport's `attachRefusalNotice` hangs its own. That makes it the third component copy of that painter, which is deferred to a `docs/BACKLOG.md` § Patterns row rather than extracted here. The field also takes `aria-invalid` and an `aria-describedby` onto the sentence, as Track's **Add** form does, because a stored mark is drawn with no announcement.

**The sentence takes Track's shape for a refusal under one field** (`.sheetsmith-track-row-problem`, grouped by selector): no box, a leading error border, left-aligned, `--font-ui-smaller`. A boxed panel on a small card reads as the card having failed. The pill's error border is colour alone, so the sentence and `aria-invalid` are the channels that stand without it. Its contrast is recorded on the `--text-error` row in `docs/BACKLOG.md` § UI.

**While marked, the field is as wide as what it holds.** At `3ch`, a stored `2.5` showed `2.` under a sentence quoting `"2.5"`. The character count is set as `--sheetsmith-pool-temp-chars` when the mark is drawn, not per keystroke, so the pill holds still while the reader corrects it. `field-sizing: content` was not used because it is Chromium-only, and Obsidian mobile would keep the clip.

**The rule is one predicate** (`refusesTemp`), and every reader asks it: the binding's `refuse`, the first-paint mark, `tempValue()` (a refused buffer absorbs nothing), the gesture (which leaves a refused buffer as it reads instead of writing `0` over it), and `commitDraft` (which leaves a refused buffer out of every other field's commit). The two sentences share their opening and closing clauses, `TEMP_RULE` and `TEMP_FIX`, so neither the rule nor the fix can be stated two ways.

## A note already holding one

This is marked on first paint, following the list fields' render-time check (`editor/list-fields.ts`, "Validated as it renders, against whatever the file already holds"). It uses the same predicate the commit refuses by, with a sentence of its own. That sentence does not open "Not saved", because the value is saved:

> Temporary points are a whole number of 0 or more, so the note's "2.5" counts as none. Type a whole number, or clear the field.

The note is never rewritten to fix it. A step or a spend comes off the pool and leaves the buffer's text alone. A blur with nothing changed keeps the mark. Typing a whole number or clearing the field commits and clears it.

## Acceptance criteria

- [x] Typing `2.5` or `abc` and committing writes nothing, keeps the draft, and shows the refusal under the pill, in the live region, and as `aria-invalid` with `aria-describedby` (`pool.test.ts`, "a buffer its rule refuses").
- [x] Escape after a refusal puts the stored buffer back and clears the mark.
- [x] A whole number committed after a refusal is written and clears the mark.
- [x] `-3` still commits as `0`, unrefused.
- [x] A refused buffer does not ride into the value field's commit.
- [x] ArrowDown on an empty or zero buffer stays at `0`.
- [x] A stored `2.5` or `abc` is marked on first paint with no announcement. A stored `4`, empty, `0` or `-2` is not marked.
- [x] A stored refused buffer spends nothing, and a step writes `current` alone.
- [x] The mark sits directly under the pill, and the fill bar stays last on the card.
- [x] While marked, the field's width follows the marked text, and typing does not move it.
- [x] With `refusesTemp` returning false and `min: 0` removed, ten of the first fourteen new cases fail. The four that pass are the ones that must hold either way: a whole number commits, a negative clamps, an acceptable stored value is not marked, and a whole number typed over a stored one commits.
- [x] Harness `sheet-error` view: **Hit points** shows `2.5` in the pill with the error border and the sentence under it, with `2.5` in full, in both themes, wrapping inside the card at 520 wide.

## Out of scope

- The Adjust control's typed sign contradicting its shown direction. That is a separate defect.
- Track's **Add** form storing a sum as typed. That is the same shape, but a separate defect. No shared helper yet, since this is one consumer.
- Steppers on the pill. SPEC §4.2 refuses them.
- The pool's value and max fields, which settle arithmetic by design.

## Commit boundaries

1. `fix: Refuse a temporary-points buffer that is not a whole number`. Contains `src/components/pool.ts`, its `src/styles/sheet.css` rules (Track's refusal rule gains Pool's selector), the regenerated `styles.css`, and the `pool.test.ts` cases.
2. `test: Stage a stored buffer the pool refuses`. Contains `harness/samples.ts`'s `hit_points` body in `brokenSamples`.
3. `docs: Record the pool buffer's refusal`. Contains this doc, the `docs/UI.md` §10 sentence, the two `docs/BACKLOG.md` row edits (the new refusal-notice row in § Patterns, the pool numbers on the `--text-error` row in § UI), a SPEC §4.2 paragraph after "The buffer is floored at nothing", and the owner's § UI row on the pre-existing three-digit clip ("A valid three-digit temporary-points buffer is clipped to two digits"), found at the land stop.
