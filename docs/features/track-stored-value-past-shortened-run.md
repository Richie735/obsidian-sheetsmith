# A Track keeps a stored value above the run it draws

Status: shipped
Board card: `docs/SPEC.md` §13 — "Whether a Track lowered below a stored value
may lose it on the next step." A Track whose stored value sits above the run it
currently draws loses that value on the reader's first step. SPEC §4.2 promises
"a stored value outside the run is rendered, not corrected", and the write path
does not keep the promise.

## Model question

**§13, "Whether a Track lowered below a stored value may lose it on the next
step."** The owner settled it as **B: never lose it, with one rule for all four
ways a run gets shorter than its note.** The owner also chose the mechanism:
**the part of the value past the run is drawn, so no step starts from a value
the reader cannot see.** What follows is the evidence, the argument, and what
the rule settles for each kind of card.

### What happens today, read from the code

Every step on a segmented run goes through the same three things in
`src/components/track.ts`:

- **The value is unclamped.** A run's `value` is `storedMarks(data, row.key)`,
  the number the note holds (5).
- **The ceiling is the drawn run.** `total = live * marks` (3).
- **The clamp is to the ceiling.** Every step calls `run.setMarks`, which holds
  the value inside `[0, run.total]`. Then `commit` writes each run whose spelled
  value differs from `run.sent`.

So with 5 stored and 3 drawn:

| Input (handler) | Asks for | Clamped to | Writes |
| --- | --- | --- | --- |
| ArrowRight (`keydown`) | `value + marks` = 6 | 3 | `value: 3` |
| ArrowLeft | `value - marks` = 4 | 3 | `value: 3` |
| Space | next segment = 6 | 3 | `value: 3` |
| End | `run.total` = 3 | 3 | `value: 3` |
| Home | 0 | 0 | `value: 0` |
| ArrowUp / ArrowDown | move between rows, never a step | — | nothing |
| Blur alone | — | — | nothing (`commit` writes only changed runs) |
| Tap on the last lit segment (`pointerdown`, `release`) | 3 | 3 | `value: 3` |
| Drag past the end | `(last + 1) * marks` = 3 | 3 | `value: 3` |

**The last two rows are a separate defect with the same cause.** A tap on the
segment the value stands on is meant to clear one mark. Clearing arms only when
`wanted === run.value`, and on this card the last lit segment is 3 while the
value is 5. So the tap that should clear a mark sets 3 instead, and the reader
sees nothing change except the note.

**Resets are explicit writes and are not part of this.** In `applyReset`,
`full` writes `countFor(...) * marks` and `formula` writes
`floor(value * marks)`, unclamped. Both write a number the trigger names, and the
reader confirms that trigger. They stay as they are.

**Flags use a different path.** A flag run (the `if (flag)` branch of `render`)
goes through `ring-control.ts` with `level: held >= 1 ? 1 : 0`, and a press
writes `yes` or `no` through `spelledMarks`. This is settled separately below.

### Four ways to reach the state, and all four lose data the same way

1. **A literal `count` is lowered.** A layout edit takes `count: 6` to
   `count: 3` over a note at `value: 5`. This is case d of
   `docs/features/new-component-adopts-retained-section.md` without the
   adoption, and that feature deferred it as its own defect.
2. **A formula `count` resolves lower.** `count: "level"` over a character whose
   level goes from 5 to 3.
3. **A modifier changes the run.** This happens in two ways:
   - The talisman comes off and its two granted segments go with it
     (`docs/features/modifier-granted-track-segments.md`, § What happens to
     marks in a granted segment).
   - A penalty blocks slots that already hold marks. `cardCount` sets
     `drawn = max(base, live)`, but the hit test and `run.total` read `live`,
     so a note at `value: 6` on `6 + mod.self` with a −2 draws 4 filled and 2
     blocked-empty, and its first step writes at most 4. The comment at the
     segment loop ("no stored value can fill it … which is the case a note
     holding six marks reaches the moment the shackles go on") describes
     exactly this.
4. **A character shortens their own row's length**
   (`docs/features/track-row-length.md`). The length commit (`wireLength` →
   `withCeiling`) correctly keeps the marks, so `5 / 6` becomes `5 / 3`. The
   first step afterwards throws them away.

### Why B, and why drawing is the mechanism

For accepting the loss, §13 argued that "the reader pressed the card, and a
stepped value is the one they saw." **That premise is false, and it is false in
the same way for all four instances.** The value a step starts from is 5, and
the screen shows 3. The reader did not choose to lose two marks. They pressed
Right, and the card decided for them from a number it never drew.

There are two ways to make the premise true: step from the drawn value, or draw
the stepped value.

- **Stepping from the drawn value** is today's behaviour, and it is the one
  that destroys the data. It also still leaves the note and the sheet
  disagreeing: `scopeValues` publishes `floor(held / marks)`, which is also
  unclamped, so every formula reading `exhaustion` already sees 5 while the run
  shows 3.
- **Drawing the stepped value** makes the run, the note, and the published name
  agree. It then needs no new clamp, because `setMarks`' existing clamp to
  `run.total` becomes a clamp to what is drawn once `run.total` is what is
  drawn.

**This is also why one rule covers all four instances.** None of the fixes is
specific to where the shortening came from: a layout edit, a formula, a
modifier, and a typed length all reach the same state, "the note holds more than
the live run". The drawing is decided from that state alone.

**The Card precedent agrees with this.** Card's sibling rule is "A stored value
that is no longer among the options is rendered, not corrected" (§4.2). The
dropdown shows the stray value as one extra line, and choosing anything else
drops it. So a stray value can go only through an explicit choice made while it
is on screen. This feature gives a Track the same property, and the rule it
states is:

> **No gesture writes away a mark the reader was not shown.**

A press on segment 2 of a run that shows 5 still writes 2. That is the reader
choosing 2 with the 5 in front of them, which is exactly what Card's "choosing
anything else drops the line" allows.

### What the contract, the store and existing notes see

- **Contract (§4.1).** No change. Everything is inside Track's `render`.
- **Publishing.** No change. `<id>`, `<id>.value`, `<id>.count` and `.left`
  already publish unclamped (see above). The drawing now agrees with them.
- **Storage.** No new key, no new spelling, no new write path. Constraint 3
  holds without a new round trip. What changes is that some presses that used
  to write now write nothing.
- **Constraint 4.** This feature is Constraint 4 being honoured on the write
  path. It deletes nothing and adds no cleanup.

## What it does

A Track whose note holds more marks than its run can take draws the extra marks
past the end of the run, slashed like a blocked slot but filled. The reader can
see them, step down through them, and clear them one at a time. Nothing steps
up past them. Right, End, Space and a drag past the end write nothing. No
keypress, tap or drag quietly writes the stored value down to the run's length.

## Smallest version

Plain runs and row-set runs draw the over part and clamp to it. `aria-valuetext`
says how much of the value is over. A named run reads its top level plus the
over count. Past `MAX_SEGMENTS` the over part is one numeric box. A flag says
the stored count in words and draws nothing new.

This version does not change:

- the Table `level` cell;
- Card's own rule;
- resets.

A flag's untick still writes `no`. That is settled, not a gap (see § Flag
cards).

## Design

### Terms

For one run, in marks unless it says segments:

- **live**: the segments a press can reach today, `count - blocked`. Unchanged.
- **stored**: `storedMarks(data, row.key)`. Unchanged.
- **over**: the segments past the live run that hold stored marks, in segments:
  `max(0, ceil(stored / marks) - live)`.
- **reach**: the value range of the control, `max(live * marks, stored)`. This
  becomes `run.total`. It is fixed for one render, like every other number the
  run is built from.
- **drawn**: the boxes on the card, in segments:
  `max(cardCount(...).drawn, live + over)`.
  - The first `live` boxes are base or granted, as today.
  - The next `over` boxes are **over**.
  - Anything left up to the unmodified length is **blocked**, as today.

A run's segments, from near to far:

```
base … granted | over (slashed, filled) | blocked (slashed, empty)
└──── live ────┘└─────────── past the live run ───────────┘
```

**An over segment is a blocked slot that holds marks.** Both are past the live
run, and both carry the same slash, because a slot past the end of what the run
can take is the same figure whatever put it there. The fill is the one thing
that differs, and it is also what differs between a lit and an unlit base
segment. `UI.md` §9's three figures (plain square, granted ring, blocked
slash) stay three, and an over segment is the slash drawn on a filled box.

**A hard condition of the owner's approval: an over segment reuses the
blocked-segment geometry and is not a new drawing.** It is the existing
`.sheetsmith-track-segment-blocked::after` slash, reached by a selector list, on
the existing segment fill. It gets no new figure, no new line style, no new
colour and no copied rule. A build that draws the over part any other way does
not meet this spec. The one exception is the numeric box past `MAX_SEGMENTS`,
where there is no segment to slash (see below).

Some cases this covers:

- **With a penalty, the over segments are the blocked slots that hold marks.**
  `6 + mod.self` with a −2 and `value: 5` has 4 live segments, then 1 over,
  then 1 blocked.
- **With a lowered count, the over segments come after the live run.**
  `count: 3`, `value: 5` has 3 live segments, then 2 over.
- **Granted and over can both be on one run.** Base 4 plus a +2 grant, with
  `value: 8`, draws 4 base, 2 granted and 2 over. Granted and blocked still
  cannot both appear on one run, which is `CardCount`'s existing invariant.
- **A partly over segment is drawn partly filled.** With `marks: 2`, `count: 3`
  and `value: 7`, there are 3 live segments and 1 over, and the over segment is
  half filled. `segmentFill` already draws partial segments.

### What each gesture does on an over run

`run.total = reach`, and the hit test is given the rectangles of the live and
over boxes. Blocked-empty boxes stay out of the hit test, as today. Up to
`MAX_SEGMENTS`, nothing else in the handlers changes. The fallback box past that
bound needs two handler changes, set out in § Past `MAX_SEGMENTS`. The table
below is what follows, for `count: 3`, `value: 5`:

| Input | Asks for | Clamped to reach 5 | Writes |
| --- | --- | --- | --- |
| ArrowRight | 6 | 5 | **nothing** |
| End | 5 | 5 | **nothing** |
| Space | 6 | 5 | **nothing** |
| ArrowLeft | 4 | 4 | `value: 4` |
| Shift+ArrowLeft (marks > 1) | stored − 1 | — | one mark down |
| Home | 0 | 0 | `value: 0` |
| Tap on segment 5 (the last lit, over) | clear arms, 4 | 4 | `value: 4` |
| Tap on segment 4 (over) | 4 | 4 | `value: 4` |
| Tap on segment 2 (live) | 2 | 2 | `value: 2`, an explicit choice made while the 5 was on screen |
| Drag past the end | 5 (`(last + 1) * marks`, over the last over box) | 5 | **nothing** |
| Blur alone | — | — | nothing |

These follow from the table:

- **Over positions can be reached downward only.** No input produces a value
  above `stored`, so a blocked slot that holds no mark is still a value the
  control cannot take. What changes is that a blocked slot that *does* hold a
  mark can now be stepped down through, one mark at a time, because the mark is
  visible.
- **The over region only shrinks.** After Left writes 4, the next render
  computes reach 4 and draws 1 over segment, and Right writes nothing again.
  Before that render, within one burst of keypresses, Right can step back up to
  what the note held when the card was drawn, and never above it. That is still
  a value on screen.
- **The tap-to-clear defect is fixed with no change to its code.** The last lit
  segment is now the one the value stands on, so `wanted === run.value` arms
  the clear it was always meant to arm.

### Accessibility

**`aria-valuemax` is `reach`, and `aria-valuenow` is the stored value.** This
looks like the opposite of the blocked precedent, and it follows the same
principle. The blocked slot kept `aria-valuemax` at the live ceiling because "a
blocked slot is not a value this control can take". An over position is a value
the control holds and can step down through. ARIA's range is the values the
slider can take, so the range grows to include them. Leaving `aria-valuemax` at
3 would force `aria-valuenow` to 3, and a screen reader would then be told the
lie this feature removes from the screen.

**`aria-valuetext` says the rest, as the blocked precedent does.** The reading is
`stepLabel` against the live run (`floor(value / marks)` of `live`), followed by
up to two clauses.

**The over clause counts marks: `stored - live * marks`.** It uses "over" alone
where `marks` is 1, because a segment and a mark are then the same unit.
Where `marks` is above 1, it names the unit:

| Case | Reading |
| --- | --- |
| `count: 3`, `value: 5` | `5 of 3, 2 over` |
| `count: 3`, `marks: 2`, `value: 7` | `3 of 3, 1 mark over` |
| `count: 3`, `marks: 2`, `value: 10` | `5 of 3, 4 marks over` |

The unit is singular at 1 and plural otherwise, so `1 mark over` and
`2 marks over`, with no unit where `marks` is 1.

**The blocked clause now counts empty blocked slots only**, that is
`blocked - over` segments, never below 0. A blocked slot that holds a mark is
counted in the over clause and not twice:

| Case | Reading |
| --- | --- |
| `6 + mod.self`, −2, `value: 5` (one blocked slot holds a mark) | `5 of 4, 1 over, 1 blocked` |
| `6 + mod.self`, −2, `value: 6` (both hold marks) | `6 of 4, 2 over` |
| `2 + mod.self`, −5, `value: 1` (whole run taken, over a note at 1) | `1 of 0, 1 over, 1 blocked` |

The last row is what the existing `0 of 0, 2 blocked` test becomes, since its
default body is `value: 1`.

**One function builds the reading, and every carrier calls it.** Today the
reading is built in two places that disagree:

- **The paint** composes `stepLabel` on the clamped `shown`, then appends the
  blocked clause itself. `stepLabel`'s own comment keeps that clause out of
  `stepLabel`, because the step line also draws it.
- **The long-press bubble** calls `stepLabel(config, Math.floor(run.value /
  marks), live)` separately, on the *unclamped* value. So on an over named run
  today it reads `5` while the step line reads `Lost`.

The build adds one function beside `stepLabel`, taking the config, the value,
`live`, `marks` and the empty-blocked count. It returns the step reading plus
the over and blocked clauses. All five carriers call it:

- the step line;
- `aria-valuetext`;
- `aria-label`, as the card or row name plus the reading;
- the run's `title`;
- the long-press bubble.

An unnamed over run binds no long press, as an unnamed run never has: its reading reaches touch through the drawn over segments and the step count, and a screen reader through `aria-valuetext`. A long press is bound only where the run is named, which is where there is a word the segments cannot draw.

`stepLabel` itself stays clause-free for its other callers. Where a named run
can never be blocked, the blocked clause is simply absent. It is not a separate
code path.

**The run's `title`.** Today only a named run sets one (`if (named) el.title =
reading`). An over run sets one too, whether or not it is named. See
`UI.md` §6 as amended under § Flag cards, and the reason recorded there.

The word is **over**: it is short, it matches the class name, and "past the run"
reads worse at the end of a list. The design wave may change the word. It may
not remove the clause.

### Named levels (`levels`)

A named run's count is a literal (`levels.length - 1`), so it cannot be granted
or blocked. It can still be over, through a layout edit that removes names or
through an adoption. Take `levels: [Clear, Touched, Marked, Lost:☠]` over
`value: 5`: 3 live and 2 over.

- **Over segments carry no glyph, which is today's behaviour kept.** The
  segment loop reads `parseLevel(config.levels?.[at + 1] ?? '')`, which finds
  nothing past the last level and so draws no letter. The criterion below is a
  regression guard, so that the over loop cannot start lettering past the
  end. It is not a change.
- **The reading names the top level and says how far past it the value is:
  `Lost, 2 over`.** The shared reading function (§ Accessibility) gives the top
  level's name where the value is past the last level, then the over clause.
  That replaces two readings that disagree today:
  - the step line and `aria-valuetext` read `Lost`, because the clamp hides
    the 5;
  - the long-press bubble reads `5`, because it passes the unclamped value to
    `levelName`, which returns the bare number where no entry exists.
- Every other behaviour is the same as a numeric run.

### Flag cards (count 1, and a checklist's rows)

A stored count above 1 on a flag card (a `count: 3` card lowered to `1`, or
`blessed: 3` in a checklist) reads as ticked, as SPEC §4.2 already says. **A
flag draws no over figure, and its untick still writes `no`.** There are three
reasons:

- **A flag has no run to draw the over part on.** The control is a level ring,
  and a slash across a ring reads as a prohibition sign, not as marks past the
  end.
- **A flag has no spelling for a count.** `spelledMarks` writes `yes` or `no`
  on a flag card, and "one fenced block never mixes `L1: 2` with `L3: yes`"
  (§4.2). So a press can do only two things: write `no`, or write nothing, and
  a ring that ignores presses is broken.
- **The untick is Card's "choosing anything else drops the line".** It is an
  explicit choice, provided the stored count is stated before the press.

So a flag holding a count above 1 **says it in words**: `Holds 3 marks from a
longer run`. One string builder in `track.ts` produces the words, and two
carriers show them.

- **The `title` is a `bindRingControl` option, and it has to be.**
  `bindRingControl`'s `paint()` rewrites `title` on every paint. It removes the
  title on an unnamed flag with `nameOnScreen`, and the long press reads
  `title`. So a `title` set by the card would be wiped on the first repaint.
  The option (named by the build, for example `note?: () => string | null`) is
  read inside `paint()` and appended to whatever `title` the ring would
  otherwise carry. It is dropped once the ring is at level 0. So after an untick
  the words go, because a flag at `no` holds no marks. Because the long press
  reads the same `title`, a finger reaches the words through the route the
  module already gives it.
- **The accessible description is the card's own.** A `.sheetsmith-sr-only`
  twin with `aria-describedby`, the Track run's existing pattern. The card
  drops the twin in the same state the option drops its words.
- **The Table cell's toggle passes no such option**, so it is untouched.

**Settled with the owner: unticking a flag writes `no`.** Once the card states
its marks, a clear is an informed write, as Home writing 0 is on a run. The
untick is Card's "choosing anything else drops the line", made with the count
on screen, on the same terms as tapping segment 2 on a run showing 5.

**`UI.md` §6 is amended.** Its rule "Only a named level earns a `title`" becomes
"a named level or an over-run value earns a `title`". It covers both a flag
holding a count and a segmented run holding over marks. **The reason, recorded
in the amendment:** the description alone would leave a sighted reader unaware
of the count, and the ruling that an untick is an informed write depends on the
reader having been told. The rule's premise, that a tooltip repeating something
already legible is noise, still holds. A flag's stored count is not legible
anywhere else on the card.

### Past `MAX_SEGMENTS`

If `live + over` would exceed `MAX_SEGMENTS` (100):

- **The live segments are drawn as usual, then one over box.** Blocked-empty
  slots cannot remain in this case, because `stored` is above the unmodified
  length, which is itself at most 100.
- **The over box holds the over count as text, such as `+147`.** It takes the
  over tone. It carries no slash, because a slash across digits hurts
  legibility. The design wave settles its width and type.
- **The handlers change here, in two places.**
  - **Hit test.** The over box is a single hit position that means "the stored
    value". In `pointerdown` and `pointermove`, anything `marksAtPoint` reports
    past `live * marks` maps to `reach`. So a tap on the box clears one mark
    (the value stands there), a drag past it writes nothing, and a tap on a live
    segment writes that segment.
  - **Paint.** `run.paint` updates the box's `+N` text from the landing value
    (`landing - live * marks`) on every paint, so the box stays right during a
    burst of keypresses before the write and its rebuild.
- **The key handlers are unchanged.** Left steps 150 → 149, and the box reads
  `+146` straight away because of the paint change.
- **The box counts marks**, the same quantity as the over clause.

`aria-valuetext` is unchanged by the fallback: `150 of 3, 147 over`.

**A recorded consequence of the approved bound.** A hand-edited `value: 99` on a
six-segment run is below the bound, so it draws 99 segments, 93 of them over,
wrapped onto several lines (`track.test.ts`'s "fills every segment for a value
above the run" has this exact case). It is honest, and on a narrow card it is
long. A tighter bound, such as "over longer than the live run falls back", would
be a one-constant change. It was not taken.

### `sense: harm`

The grade is `(at + 1) / live`, clamped to 1 for over segments. They are past
the worst end of the run, so they take its colour. Today the grade would be
above 1 and would be fed straight into the colour mix.

### Row sets and character-owned rows

Each row computes its own `over` and `reach` from its own count, including
`countFor`'s character length. `blocked` stays 0 on a row set, as today.

`d6: 5 / 3` draws 3 live and 2 over, and the length field reads 3. Typing 6
into it gives `5 / 6`, and the over segments become 2 unlit live segments.
Nothing in the length commit changes.

### What it reuses

- The blocked slash. The build extends the existing
  `.sheetsmith-track-segment-blocked::after` rule by selector list, so the two
  cannot drift. It does not copy it (`UI.md` §9: by selector list, not by a
  copy). The new class is `.sheetsmith-track-segment-over`.
- The fill, the ghost and `segmentFill`.
- The clamp in `setMarks`, the clear-arming in `pointerdown`, and the `commit`
  diff. All of them are unchanged. The fix is which rectangles and which total
  the run is built from.
- The blocked clause's slot in `aria-valuetext`.

No new gesture, no new focus treatment, and no new colour.

### Empty and error states

- **A run with no live segments and no stored marks** draws as today: all
  blocked, or `?` where nothing resolved.
- **`?` stays reserved for a count that did not resolve.** A note holding marks
  on a `?` card draws `?` and nothing else, as today, because there is no live
  run to set an over part against.
- **Stored values below zero or unreadable** are unchanged and out of scope.
- **A non-integer stored value** such as `5.5` uses `ceil` for its over
  segments. The existing rounding in `setMarks` governs the rest.

### Harness

Pixels change, so the design wave runs. Add a block of over-run cards to
`harness/samples.ts` at grid row 74 or later. There is no free row under the
modifier Track block: that block is rows 33–34, and rows 35–73 are all in use.
Comment the new block in the modifier block's style, and cross-reference it from
the modifier block's comment:

- **Overfull**: `count: 3`, `value: 5`. Two over segments after the live run.
- **Overfull (named)**: `levels: [Clear, Touched, Marked, Lost:☠]`,
  `sense: harm`, `value: 5`. No glyphs on the over segments, the harm grade
  clamped, and a step line reading `Lost, 2 over`.
- **Overfull (marks)**: `count: 3`, `marks: 2`, `value: 7`. A half-filled over
  segment.
- **Overfull (shackled)**: `6 + mod.self`, `value: 5`. Add its target to the
  existing `Shackles` row. It shows 4 live, 1 over and 1 blocked side by side,
  which is the comparison the over figure has to read against.
- **Overfull (far)**: `count: 3`, `value: 150`. The numeric fallback box.
- **Overfull (row)**: a row set with a character-owned row at `d6: 5 / 3`.

Existing pixels also change. **Cursed vigour** (`2 + mod.self`, −5, `value: 1`)
now draws its first slot over rather than blocked-empty.

Shots to look at, in both themes where the view has both:

- `sheet-light` and `sheet-dark`: the block and Cursed vigour.
- `sheet-forced-colors`: the slash and the fallback box's edge have to paint.
  The fill under the slash does not survive the mode, so there an over segment
  and an empty blocked slot draw alike (§ Deliberately not doing).
- `sheet-narrow`: a wrapped over run and the fallback box.

No existing view focuses a Track (`sheet-focus` focuses a Card select), and the
focus ring on an over run is the run's own ring, unchanged. So no focus view is
added.

### Throwaway vault

The recipe below is what the vault holds, per AGENTS.md "A vault fixture lives
outside the repository, so its recipe lives inside it". Use
`~/Developer/sheetsmith-test-vault/`.

- **`Sheetsmith layouts/Track variations.sheetsmith`** gains:
  - a Card `level`, labelled `Level`;
  - a Track `stress`, labelled `Stress`, with `count: "level"`.

  This is instance 2. The layout is otherwise unchanged.
- **`Characters/Overruns.md`** is new, with `sheet-layout: Track variations`.
  Each section has one line of prose above its fence saying what to press:
  - `Exhaustion` at `value: 8` (count 6): instance 1 as a static state. It
    draws 2 over; press Right and End, and nothing changes in markdown view.
  - `Corruption` at `value: 6` (4 levels): reads `Lost, 2 over`.
  - `Conditions` with `blessed: 3`: ticked, with the title stating the count.
  - `Hit dice` with `d10: 4 / 6`: instance 4. Type 3 into d10's length; the
    note reads `4 / 3` and 1 segment is over. Press Right; the note is
    unchanged.
  - `Kills` with `Dragons: 150 / 5`: the fallback box.
  - `Level` at `value: 5` and `Stress` at `value: 5`: instance 2. Type 3 into
    Level; Stress draws 3 live and 2 over, and Right writes nothing.
- **Instance 1, live.** In the layout editor, lower Exhaustion's count from 6
  to 4 with Overruns open, confirm it draws 4 over, then put the count back.
- **Instance 3.** Use `Characters/Ilona.md` on `Modifier variations`. Steps
  14–16 each state something this feature makes false, and are rewritten:
  - **Step 14.** Endurance filled to six with the talisman on, then unticked,
    now draws 4 live and 2 over, reading `6 of 4, 2 over`. It no longer reads
    "four filled slots … `4 of 4`". Right writes nothing; Left writes 5.
  - **Step 15.** Cursed vigour holds `value: 1`, so its first slot now draws
    over and can be stepped down to 0. Rewrite "nothing on it can be pressed at
    all". Vigour at 3 is unchanged: a press in its blocked tail still fills to
    four.
  - **Step 16.** Vigour filled to six, then the shackles ticked, now draws its
    two blocked slots filled and slashed (`6 of 4, 2 over`), not "blocked and
    *empty*".
- **Tracks.md stays as it is.** It is the plain Track fixture.

Validate the edited layout through `parseLayout`, and both edited notes through
`parseCharacter` then `serialiseCharacter` (byte-identical), as the fixture
memory describes.

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |

None. The behaviour follows from the stored value and the resolved count. There
is nothing to configure.

## Data and file model

- **Stored.** Unchanged. The key, the spelling, the composite `marks / length`,
  and the fence are all as before.
- **Round trip.** Unchanged, because the parse and serialise paths are not
  touched. Constraint 3 holds without a new proof.
- **What is written differently.**
  - Right, End, Space and a drag past the end on an over run write nothing
    where they used to write the live ceiling.
  - Left and a tap on the last lit segment write `stored - marks` (or `- 1`)
    where they used to write the live ceiling.
  - Every other press writes what it wrote before.
  - Resets are unchanged: `full` writes the live count, `empty` writes 0, and
    `formula` writes its value, all as explicit writes the reader confirmed.
- **Existing notes.** Nothing is migrated and nothing is corrected. A note
  holding more than its run starts drawing the extra marks the next time it is
  rendered, which is §4.2's "rendered" finally being true of the picture as well
  as of the note.

## Acceptance criteria

### Probes, written first

- [x] `src/view/track-over-run.test.ts` exists, in the style of
      `src/view/retained-section-adoption.test.ts`:
      - a header naming this spec;
      - driven through a real `SheetView` (parse, section lookup, render, a
        real press, `applyEdits` → `serialiseCharacter`);
      - asserting the view's text afterwards.
- [x] It has one `describe` per instance:
      1. a literal count lowered: `count: 3` over `value: 5`;
      2. a formula count resolving lower: a Card `level` at 3, and a Track
         `count: "level"` at `value: 5`;
      3. a modifier, as two cases: a grant removed (`3 + mod.self`, no push,
         `value: 5`) and a penalty over held marks (`6 + mod.self`, −2,
         `value: 6`);
      4. a character-owned row shortened: `d6: 5 / 6`, with the length field
         committed to 3, then a step.
- [x] **First version: pins today's loss, and is green on today's code.** Each
      instance has named cases for ArrowRight, ArrowLeft, Space, End, a tap on
      the last lit segment, and a drag past the end, each writing the live
      ceiling. Home writes 0 and blur alone writes nothing.
- [x] **After the change, the same cases are flipped**, and their names say
      what the new rule is:
      - ArrowRight, Space, End and a drag past the end leave the view's text
        byte-identical once `GESTURE_COMMIT` (700 ms) has passed. The probe
        waits with the adoption test's 900 ms `gestureCommit` helper.
      - ArrowLeft writes `stored - marks`.
      - A tap on the last lit segment writes `stored - 1` mark.
      - A tap on a live segment writes that segment.
      - Home writes 0.
      - Case (4)'s length commit still writes `5 / 3` and keeps the marks.

### Drawing

- [x] `track.test.ts`: `count: 3`, `value: 5` draws 5 boxes, the last 2 with
      `.sheetsmith-track-segment-over` and filled. `aria-valuemax="5"`,
      `aria-valuenow="5"`, `aria-valuetext="5 of 3, 2 over"`.
- [x] Penalty: `6 + mod.self`, −2, `value: 5` draws 4 live, 1 over and 1
      blocked, with `aria-valuetext="5 of 4, 1 over, 1 blocked"`.
- [x] The whole run taken over a held mark: `2 + mod.self`, −5, `value: 1`
      draws 1 over and 1 blocked, `aria-valuemax="1"`, and
      `1 of 0, 1 over, 1 blocked`.
- [x] Granted and over on one run: base 4, +2, `value: 8` draws 4 base, 2
      granted and 2 over.
- [x] Marks: `count: 3`, `marks: 2`, `value: 7` draws 4 boxes, the fourth over
      and half filled, and reads `3 of 3, 1 mark over`. At `value: 10` it reads
      `5 of 3, 4 marks over`. At `marks: 1` no unit appears (`2 over`).
- [x] The blocked clause counts empty blocked slots only (`blocked - over`): a
      blocked slot holding a mark is counted once, in the over clause.
- [x] **Hard condition: geometry reuse.** `.sheetsmith-track-segment-over` gets
      its slash from the existing `.sheetsmith-track-segment-blocked::after`
      rule, by a selector list in `src/styles/sheet.css`. There is no second
      slash rule, no new figure, no new line style and no new colour, and the
      fill is the existing segment fill. A reviewer checks this by reading the
      one rule and by the harness PNGs.
- [x] Named: `levels` of four names over `value: 5`:
      - a regression guard, not a change: the over segments carry no
        `.sheetsmith-track-segment-glyph`, as today;
      - the step line, `aria-valuetext`, `aria-label`, the run's `title` and
        the long-press bubble all read `Lost, 2 over`;
      - all five come from one reading function, which a test on the
        long-press bubble pins, since the bubble reads `5` today.
- [x] Harm: the over segments' `--sheetsmith-track-grade` is `1`.
- [x] Fallback: `count: 3`, `value: 150` draws 3 segments and one over box
      reading `+147`:
      - a tap on the box writes 149;
      - a drag past it writes nothing;
      - ArrowLeft repaints the box to `+146` before the write;
      - `aria-valuetext` is `150 of 3, 147 over`.
- [x] Row set: `d6: 5 / 3` draws 3 live and 2 over on that row alone.
- [x] Flag: a flag card holding `3` renders ticked:
      - its `title` states the count, and it survives a repaint, because it
        comes from the `bindRingControl` option;
      - its long press shows the same words;
      - its `aria-describedby` twin states the count;
      - an untick writes `no`, and afterwards both the `title` words and the
        twin are gone;
      - a Table toggle cell over the same `ring-control.ts` is unchanged, pinned
        by an existing or new test.
- [x] An over segmented run carries a `title` (the reading), whether or not it
      is named. A run that is not over and not named still carries none.

### Existing tests that change, each changed and not deleted

- [x] `track.test.ts` "fills every segment for a value above the run" (99 on 6)
      now asserts 99 boxes, 93 over, and still no `onChange`.
- [x] `track.test.ts` "keeps marks past a shrunken run in the note, and reports
      the run" now reads `5 of 3, 2 over` with 5 boxes. Its Constraint 3
      assertion is unchanged.
- [x] `track.test.ts` "never fills a blocked slot, whatever the note holds" is
      renamed to say that a blocked slot holding a mark is drawn over.
- [x] `track.test.ts` "draws a run a penalty took whole as blocked" is updated
      for its default `value: 1`. `0 of 0, 2 blocked` becomes
      `1 of 0, 1 over, 1 blocked`, and `aria-valuemax` becomes `1`.
- [x] `retained-section-adoption.test.ts` case d:
      - its first case's name and comment no longer say "clamped to its own
        count", and `aria-valuenow` is `5`;
      - its second case's comment no longer defers this defect, and it still
        asserts that the one `value` line is rewritten and nothing else.

### Look and gates

- [x] The harness block above renders in `sheet-light`, `sheet-dark`,
      `sheet-forced-colors` and `sheet-narrow`. In `sheet-light` and
      `sheet-dark`, an over segment reads as distinct from a lit base segment,
      from a blocked-empty slot, and from a granted segment; in forced colors
      over and blocked-empty draw alike, by the owner's ruling (§ Deliberately
      not doing). The owner looks at these PNGs at the land stop.
- [x] The vault holds the recipe above, and Ilona's steps no longer claim that
      blocked slots holding marks are empty.
- [x] The stale passages in shipped feature docs, listed under § Commit
      boundaries, are corrected in place with an amendment line. They are not
      rewritten.
- [x] `UI.md` §6 reads "a named level or an over-run value earns a `title`",
      with the reason recorded.
- [x] `npm run lint`, `npm test` and `npm run build` pass. `styles.css` is
      rebuilt from `src/styles/`, and the test comparing the two passes.

## Commit boundaries

A plan for `/land-it` at the end, not a schedule.

1. `test: Pin what a first step does to a Track holding more than its run`.
   Adds `src/view/track-over-run.test.ts` with the four instances, green on
   today's code and asserting today's loss.
2. `fix: Keep a Track's stored value past a shortened run`. Contains:
   - in `track.ts`: `reach`, `over`, the drawing, the hit-test rectangles,
     `aria-*`, the one reading function and its five carriers, the fallback box
     with its hit mapping and repaint, the harm clamp, and the flag's words and
     `aria-describedby` twin;
   - in `ring-control.ts`: the `title` option;
   - in `src/styles/sheet.css`: the over selector joining the blocked rule,
     and the fallback box;
   - the rebuilt `styles.css`;
   - the probes flipped, the existing tests amended, and case d's comments.
3. `test: Show Tracks holding more than their run in the harness`. The
   `harness/samples.ts` block and the `Shackles` target.
4. `docs: Record that a Track draws a stored value past its run`. Contains:
   - SPEC §4.2's sentences this makes false (listed below);
   - `UI.md` §9's blocked row, plus an over row;
   - `UI.md` §6's title rule, as amended, with its reason;
   - amendment lines on the stale shipped feature docs (listed below);
   - §13's `Resolved:` paragraph (written by `/land-it`);
   - this spec's status.

SPEC text the fourth commit rewrites:

- §4.2's modifier paragraph, which says a talisman coming off "draws three,
  reports `3 of 3`, keeps `value: 5`".
- §4.2's "A mark stored inside that region stays in the note and is not drawn".
- §4.2's "the hit test is handed the live segments alone … there is simply no
  position out there".
- §4.2's "`aria-valuemax` stays the live ceiling".

**Shipped feature docs the fourth commit corrects in place.** Each gets an
amendment line directly under the stale passage, in the repo's existing form
(`**Amended: …**` or `**Narrowed by …**`, as in
`modifier-granted-track-segments.md`'s own "**Narrowed by the blocked drawing
below**"). The line names this spec. The passage itself stays as written:

- `modifier-granted-track-segments.md`:
  - § What happens to marks in a granted segment: "draws three filled segments,
    keeps `value: 5` in the note, reports "3 of 3"".
  - § What a blocked slot is, exactly: the bullet "It is not pressable" (the
    hit test is handed the live rectangles only).
  - The same section's bullet "The run announces the live ceiling"
    (`aria-valuemax` stays the live run).
  - The same section's bullet "A mark stored inside the blocked region stays in
    the note and is not drawn".
  - The acceptance criterion "Blocked slots", which says "a mark stored there
    stays in the note and is not drawn".
- `new-component-adopts-retained-section.md`:
  - the probe table's case d row ("draws 3 of 3, one step writes
    `value: 3`");
  - the deferred-defect note under "Deliberately not doing" ("A Track whose
    count is lowered below its stored value …"). Its amendment line names this
    spec as the fix.
- `track-row-length.md`: the "Deliberately not doing" line "A warning treatment
  for marks stored above a row's own length". Its amendment line says that the
  marks are now drawn, though as no warning.

## Deliberately not doing

- **Card's sibling rule** ("A stored value that is no longer among the options
  is rendered, not corrected"). The same question probably applies there, and
  it gets its own session. §13 records the pointer.
- **Table `level` and `toggle` cells.** They share `ring-control.ts` and carry
  their own clamp. Not a Track run.
- **Resets.** `full` on an over run writes the live count, and so drops the
  over part. That is an explicit, confirmed write of its own value, and the
  owner kept it.
- **Publication.** Already unclamped. Unchanged.
- **Stored values below zero or unreadable.** Unchanged.
- **A tighter fallback bound than `MAX_SEGMENTS`.** Recorded above as a
  consequence of the approved bound, not taken.
- **A flag keeping a count through an untick.** It needs a spelling flag cards
  do not have.
- **`docs/BACKLOG.md`.** No row is touched.
- **A warning treatment for marks above a row's own length.** The marks are
  drawn and no warning is added. `track-row-length.md`'s line gets an amendment
  line saying so (see above).
- **Telling an over segment from an empty blocked slot in forced colors.** That
  mode drops the fill, which is the one thing that differs between them, so
  there they draw alike. It is the existing `docs/BACKLOG.md` row "In forced
  colors a Track says nothing at all about its value", and no row is touched.
- **Raising the over slash's contrast.** It measures about 1.9:1 against the
  fill (1.92 light, 1.95 dark), under the 3:1 a sole state mark wants, and is
  accepted on the granted ring's precedent, which draws the same `--text-muted`
  over the same accent at 1.95:1 (`docs/UI.md` §9). Recorded as a residual in
  `.claude/skills/design-review/reference/legibility.md` §8.
