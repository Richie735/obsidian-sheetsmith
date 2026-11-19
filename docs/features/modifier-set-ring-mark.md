# A ring a modifier set is marked as set

Status: shipped

## The one choice left: which shape

The owner settled the constraint before this spec. The cue is a shape on the
ring itself, drawn only where the drawn and stored values differ. It is not a
colour, because colour already means a form in play (`data-sheetsmith-tint`), and
colour alone fails forced colors. A ring that a modifier set and a form in play
also tints keeps both. What was left open was the shape, and it was decided by
shots of four candidates, prototyped far enough to render and then reverted:

| | Candidate | Verdict |
| --- | --- | --- |
| A | A **dashed** halo just outside the ring, 1.5px `--text-muted`, Track's granted segment's mark | Reads, in every mode. Says the wrong word for half its cases. |
| B | A **corner pip**, a 7px disc at the ring's top inline-end corner | Reads, in every mode. Reads as a badge. |
| **C** | A **dotted** halo just outside the ring, 2px `--text-muted`, the Pool ceiling's and the chosen dropdown's mark | **Chosen.** |
| D | The ring's **own border dashed** | Vanishes on a full fill. Rejected by the shot. |

**Shots** are in
`/private/tmp/claude-501/-Users-ricardopereira-Developer-obsidian-sheetsmith/1712e181-c7a8-4234-92b9-b90bc0df4aa6/scratchpad/candidates/`.
The prefix is the candidate (`none` is today), and the files are:

- `compare-states-light.png`, `compare-states-dark.png`, `compare-states-forced.png`:
  the Skills table, the Checks roster's rings and the Inspiration flag, all five
  candidates stacked, cropped and enlarged.
- `compare-form.png`: the Druid's Dexterity card with Cat Form in play, Stealth
  form-tinted, in light, dark and forced colors.
- `<c>-states-<mode>-1400.png`, `<c>-states-light-520.png`, `<c>-form-<mode>-1400.png`:
  the uncropped frames.
- `c-text-24.png` and `c-phone-380.png`: C at Text 24 and on a phone.
- `compare-c-focus.png`: C with the focus outline at its current 2px offset (left)
  and at 4px (right).

The forced-colors frames use `flag=--force-high-contrast`. A
`media=forced-colors:active` emulation matches the media query but repaints
nothing, so it is not evidence for this mode.

**Why C.**

- **Meaning decides, not the eye: the owner's ruling.** A and C cannot be told
  apart at ring size. At 21px a 1.5px dash and a 2px dot both read as a broken
  outline (`compare-states-light.png`, rows a and c). So the shape is chosen for
  what it already means elsewhere on the sheet. Dashed stays Track's word for
  *granted*. Dotted joins the Pool ceiling and the chosen dropdown as *moved by a
  modifier*. Nothing in this spec claims a reader tells the two apart on screen;
  the choice keeps the vocabulary consistent for when they sit at a size where
  they can.
- **The sibling closest to a ring already says dotted.** A dropdown a modifier
  chose (`docs/UI.md` §9, "A dropdown a modifier chose") is the same case on
  another control: a stored choice, a modifier drawing another, and a press that
  edits the reader's own. It takes the Pool ceiling's 2px dotted rule in
  `--text-muted`, and so does the Pool's granted temporary points. A ring is the
  third control of that kind, and three spellings of one fact would be a
  vocabulary with a hole in it.
- **Dotted means moved either way, and a ring moves either way.** At least only
  raises, but Sets lowers as well. The harness's Medicine is stored Expertise and
  Clumsy hands sets it to Proficient. A `Sets 0` empties a ring a player filled.
  Dashed is Track's word for *granted*, a slot that exists because a modifier
  added it. On a lowered or emptied ring the word would be wrong. A Roster draws
  no Track, so a ring and a granted segment never share a card. A sheet can
  still place a flag Track beside a counter Track, and there the two marks keep
  their two meanings, whether or not the eye separates them at that size.
- **The pip reads as a notification badge.** A disc in the corner of a round
  control is the platform's "unread" or "new" dot, and it says nothing about the
  ring's value. It is also a second object beside the ring. `docs/UI.md` §9
  withdrew a mark beside the ring once already, because it read as a second
  toggle. A halo is the ring's own outline, so it adds no second object. The
  ring has no corners, and a pip at Table's row start would crowd the pinned name
  cell.
- **D fails on the commonest case.** A ring at its top level is filled with the
  accent, and its border is the accent too, so a dashed border has nothing to
  show against. Athletics, Investigation and the Ranks rings vanish in
  `compare-states-light.png`.
- **All of A, B and C survive forced colors** (`compare-states-forced.png`). Each
  is a border, never a background, so the mode repaints its colour to
  `CanvasText` and keeps its style. B's 1.5px separating halo is a `box-shadow`,
  which the mode drops, and it is not missed. Nothing in C needs hover.
- **Measured fit.** The halo is 3px outside a 21px ring and takes no layout.
  It was drawn 4px out first, and the design review measured that against a
  30px row at the default text: 21 + 2 × 4 = 29px, so the dots sat 0 to 1px off
  the row rules, directly on a form's accent outline (Nature), and about 1px
  from the table's frame in forced colors, where they fused into the row's
  frame instead of reading as the ring's own outline. At 3px the halo spans
  27px and clears a row's edges by about 1.5px a side. At 1400, at 520, at
  Text 24 and on a phone it clears the row rules and the
  neighbouring rings. At Text 24 it comes closest to the table's inline-start
  frame on a row-start ring (`c-text-24.png`, Stealth), which is held as a
  criterion below. The focus outline at its current 2px offset runs 2 to 4px
  out and the halo 1 to 3px, so they are adjacent (the outline's inner pixel
  overlaps the dots' outer one) and the dots show inside the accent ring
  (`modifier-set-ring-mark-focus`). At 4px the outline crosses the row rule
  (`compare-c-focus.png`, right). So the focus rule does not change.
- **The owner's ruling at the land stop.** At Text 24 a filled ring's halo, 1px
  off its border, reads as a milled edge rather than a separate ring. Accepted:
  marked and unmarked rings stay distinct in every shot, and the 3px inset is
  what keeps the halo off the row's rules and a form's outline.

## Model question

None. The mark is a picture of a fact the ring already knows (drawn ≠ stored,
`bindRingControl`'s `drawn`). Nothing is stored or published, and no contract
member is added.

## What it does

A Table's, a Roster's or a flag Track's ring that a modifier set to something
other than what the note stores is drawn with a dotted halo, so a reader can see
the sheet put it there. Persuasion drawn Proficient over a stored Untrained by a
feature's `abilities.persuasion >= 1 in Training` now looks different from a
Persuasion the player ticked. A modifier that agrees with the note draws no mark.

## Smallest version

The class toggled in `bindRingControl`'s paint and one CSS rule. It covers every
ring that is handed `drawn`: Table's and Roster's cells, and Track's flag and
checklist rows. It gives up a mark on a refused state, which draws what the note
stores and so has nothing to mark. Record set and Stat block rings take no
modifier states and are untouched.

## Design

### What a reader sees

- **A marked ring** has a 2px dotted outline in `--text-muted`, 3px outside its
  box and concentric with it. It is drawn on an empty, a partly filled and a full
  ring alike. The ring's own border, fill and glyph are unchanged.
- **Drawn only while drawn ≠ stored.** That is the same condition, at the same
  paint, under which the ring carries `aria-description` and its `title`'s second
  line (`stateOwnDescription`, which returns null exactly when `drawn ===
  stored`). So the picture and the words can never disagree:
  - Stealth is stored Untrained, with At least Proficient: marked.
  - Arcana is stored Expertise, with At least Proficient: no mark (the floor is
    met, so drawn equals stored).
  - A row stored Proficient with Sets Proficient: no mark.
  - Medicine is stored Expertise, with Sets Proficient: marked (lowered).
  - A refused state draws the stored level: no mark. The door still opens on the
    refusal.
  - A change whose `when` is false: no account, so no mark.
- **Under a form in play** the row keeps its tint, outline and tag (D11 of
  `docs/features/non-number-modifiers.md`), and the ring keeps its halo.
  `compare-form.png` shows the two together. The tint says which form; the halo
  says set, not chosen.
- **Not the dropdown's condition, deliberately.** The chosen dropdown's dotted
  rule is drawn wherever a Sets line is listed, applied or refused. The ring's
  halo is drawn only where drawn ≠ stored. So the two marks share a shape and
  differ in when they appear. That difference is the owner's settled constraint
  for this feature ("drawn only where the drawn and stored values differ"). It is
  not an inconsistency to fix in review. Aligning the two conditions, in either
  direction, is a separate decision.
- **Not "nothing on screen stands for the stored level" undone.** That ruling
  (UI.md §9, "A ring a modifier set") withdrew a mark standing for the *reader's
  own* level, because it read as a second toggle. This mark stands for nothing
  but "a modifier set what you see", is part of the ring's own outline, and is no
  second object. The stored level is still in the words alone.

### Pressing a marked ring

Pressing works as it does today: **a press edits the stored level, cycling and
stepping from it** (`ring-control.ts`, `report`). The painter, `aria-pressed` and
the level's name follow the drawn level, and `onSet` writes the stored one. Read
against the mark:

- **At least Proficient, stored Untrained.** The first press writes Proficient.
  The ring still draws Proficient, so the halo goes and `Your own is now
  Proficient` is announced. The next press writes Expertise, then Untrained, and
  the halo returns. A player expecting the first press to move to Expertise
  finds it took two. The first press made the sheet's Proficient their own.
  **This is the stored value they should expect**: the note says what the player
  chose, and the modifier's floor is not theirs to write. The mark now makes that
  first press visible. Today it changes nothing on screen, and the halo leaving
  is the eye's half of the announcement that already exists.
- **Sets Proficient, stored Untrained.** Presses cycle the stored level
  Untrained → Proficient → Expertise → Untrained, and the ring draws Proficient
  throughout. The halo is off at Proficient and on at the other two, and each
  press is announced. The player can change the note, which is correct, since
  the modifier may end, but cannot change what is drawn while it holds. The
  halo, the door and the announcement are how they find that out. A press that
  writes the drawn level, or one that cycles from it, is not taken up here.
- No popover opens and no gesture is added.

### Accessibility

- **No new words.** A screen reader already hears the drawn level in
  `aria-label` (or `aria-pressed` for a flag), and `Set by a modifier; your own:
  Untrained` in `aria-description`. The row door's description is the same
  `stateOwnDescription` sentence, and its account is the breakdown text. The
  sentence is composed once and read by the ring and the door. The halo is drawn
  under that sentence's condition, so a sighted reader and a listener are told
  the same thing at the same time.
- The halo is a `::before` (the `::after` is the hit target), `pointer-events:
  none`, `content: ''`, so it is not in the accessibility tree.
- **Forced colors**: a border's style survives, so the mode paints it
  `CanvasText` and needs no branch. **`prefers-contrast: more`** keeps it, since
  the ring's border goes to `--text-muted` there already and the halo is that
  colour.
- **No motion**: the halo appears and goes with the paint, outside the ring's
  `transform` transition. It is a child, so it scales with the ring on `:active`,
  which is correct.

### Mechanism

- **`ring-control.ts`'s `paint()`** toggles one class, exported as
  `RING_SET_CLASS = 'sheetsmith-level-ring-set'`, on `own !== null`, the
  `ownLevel` answer that sets the `aria-description` two lines up, so the halo is
  the description's presence rather than a second reading of `drawn`. It goes in the control,
  not in `paintLevelRing`: the painter's other consumer, the layout editor's
  level sample, has no stored level and must not learn of one (that module's
  header). It is the `-on` and `-part` precedent, a state class on the ring,
  read by CSS.
- **Not `stampStateHost`** or the placement-decoration pass. Those find what a
  *form in play* set, against the note's stored value, for the tint. The mark is
  about any modifier, it is known where the ring paints, and it must follow a
  press without a rebuild. `paint()` runs on every press, so the halo goes the
  instant a press makes the two agree, which a stamp read at render would miss
  (PATTERNS §5, "paint before reporting").
- **`src/styles/sheet.css`**, beside the level ring's own rules:
  `.sheetsmith-view .sheetsmith-level-ring-set::before { content: ''; position:
  absolute; inset: -3px; border: 2px dotted var(--text-muted); border-radius:
  50%; pointer-events: none; }`. Its comment names the dropdown and Pool siblings
  and why not dashed. The ring is already `position: relative`.
- **Empty and error states**: an empty ring is marked when a modifier emptied
  it. A refused state is unmarked (above). A ring nothing reaches is today's.

## Config fields

None.

## Data and file model

Nothing is stored. The class is paint. Notes and layouts round-trip unchanged
(Constraint 3), and no layout change touches character data (Constraint 4).

## Harness fixture

**A new state, `modifier-set-ring-mark`, to be added** in `harness/samples.ts`
and `harness/harness.ts`. `modifier-states` lacks a Sets-equal-to-stored row,
an emptied row and a form in play, and `modifier-states-roster-card` has only
one set ring. Adding
rows to either would move their baselines. The new state holds a Skills Table
and a Checks Roster in its table layout (the band), each with the same rows:

| Row | Stored | Change | Expected |
| --- | --- | --- | --- |
| Persuasion | Untrained | `>= 1` (At least), from a Gear row | marked |
| Arcana | Expertise | `>= 1` (At least) | no mark |
| History | Proficient | `= 1` (Sets) | no mark |
| Medicine | Expertise | `= 1` (Sets, lowered) | marked |
| Nature | Untrained | `>= 1` from a Stat block form in play | marked, row tinted |
| Survival | Untrained | none | today's ring |
| Religion | Proficient | `= 0` (Sets, emptied) | marked, on an empty ring |

It also holds a flag Track turned on by a push, so the Track's flag is in frame.
Shot views go in `harness/shot.mjs`: `modifier-set-ring-mark-{light,dark}` at
`1400,1100` and `520,…` (height measured through the view's own query), and
`-forced-colors` at both widths with `flags: ['--force-high-contrast']`.

## Acceptance criteria

- [x] `ring-control.test.ts`: "marks a ring whose drawn level differs from the
      stored one, and only then". The class is present at stored 0 under At
      least 1, absent at stored 2 under At least 1, absent where `drawn` returns
      the stored level, and absent with no `drawn`.
- [x] `ring-control.test.ts`: "drops the mark on the press that makes the two
      agree". Stored 0 under At least 1, one click: the class is gone, `onSet(1)`
      is called, `onUnshown` runs. The next click to 2 leaves it absent, and the
      wrap to 0 returns it.
- [x] `ring-control.test.ts`: "marks a ring exactly when it carries its own
      description". Over every stored level under At least 1 and Sets 1, the class
      and `aria-description` are present together or absent together.
- [x] `ring-control.test.ts`: a Sets lowering a ring (stored 2, drawn 1) is
      marked, and a flag set off over a stored on is marked.
- [x] A refused state draws no mark, on a Table row and a Roster row
      (`state-ring.test.ts`, "a refused level, on each component that reads one
      in a row": Stealth under `= 3 in Training`, the refusal the
      `modifier-states` sample's Perception row draws).
- [x] The halo is a border in a `::before` with `pointer-events: none`. It is
      held in `src/styles.test.ts` beside the ring's existing checks, and no
      background or `box-shadow` carries the mark.
- [x] **Shots, before and after**, of `modifier-set-ring-mark` in light, dark and
      forced colors at 1400 and 520. Persuasion, Medicine, Nature and Religion are
      marked in both the Table and the Roster. Arcana, History and Survival are
      not. Nature
      keeps its tint and tag beside its halo. In forced colors each halo reads as a
      dotted `CanvasText` ring on an empty, a partial and a full ring.
- [x] The same state at Text 20 and 24 and on `platform=phone`: no halo touches a
      row rule, the table's frame, the pinned name cell, the door or a
      neighbouring ring.
- [x] A focused marked ring (`hover=` is not focus; a driven `press=` or a test
      focusing it) shows the accent focus outline and the dots together.
- [x] A press on a marked ring writes the stored level as before. The round-trip
      tests on the existing `modifier-states-cycle` sample pass unchanged, and the
      cycle shots there show the halo going on the first press.
- [x] `docs/UI.md` §9, "A ring a modifier set", names the mark, its condition and
      why dotted. The "nothing on screen stands for the stored level" sentence
      gains a clause saying the halo marks *set*, not the reader's own.
- [x] **The land stop presents three shots to the owner**, not just links to
      them:
      - the forced-colors shot of `modifier-set-ring-mark`;
      - the Nature ring under the Wild Shape form's tint with its halo, its tag
        and its door in frame;
      - a focused marked ring, showing where the focus outline meets the halo.
- [x] `npm test`, `npm run lint`, `npm run build` pass. `git diff styles.css`
      matches `src/styles/`.

## Commit boundaries

1. `test: Stage rings a modifier set above, at and under a form in play`. The
   `modifier-set-ring-mark` harness state and its shot views, with today's
   rendering as the "before".
2. `feat: Mark a ring a modifier set with a dotted halo`. The `RING_SET_CLASS`
   toggle in `ring-control.ts`, the `sheet.css` rule, rebuilt `styles.css`, and
   the `ring-control.test.ts` and `styles.test.ts` cases.
3. `docs: Record the mark on a ring a modifier set`. The `docs/UI.md` §9 row, and
   this spec's status.

## Deliberately not doing

- **The form tint's behaviour.** D11 stands as it is: which rows a form tints,
  the tag and the lane.
- **The row-end door's glyph.** It stays the `info` glyph, whatever the row
  carries.
- **Any number's mark.** The underline, the Pool ceiling's rule and Track's
  granted segments are untouched.
- **The WebKit select, the Passport chip and the empty card select rows.**
- **The resize corner row.**
- **What a press writes.** A press still cycles the stored level. Cycling from
  the drawn level, or refusing a press under Sets, is a separate question.
- **Record set and Stat block rings.** They take no modifier states.
- **A typed change's strip width** (`layoutSetsStateIn`). The halo takes no room,
  so it changes nothing there.
