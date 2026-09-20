# A modifier grants segments to a Track

Status: shipped
Board card: A modifier that lengthens a Track's run, and drawing the granted
segments apart from the base ones.

## Model question

Yes, and it is not the one the card looks like it is asking. The card reads as a
drawing problem. **It is a formula problem first, and the formula half is already
broken in the tree today.**

### The split, measured

A Track with `count: "3 + mod.self"` and a `+2` pushed at `exhaustion.count`
renders a run of **three** segments — `aria-valuemax="3"`, `aria-valuetext="1 of
3"` — while `env.sheet('exhaustion.count')` publishes **5**. One layout, one
modifier, two ceilings: the one a reader presses and the one every other formula
on the sheet reads.

Pool has the identical shape and the identical split. `max: "10 + mod.self"` with
a `+4` publishes `hp.max` as **14** while `context.resolved['max']` is **10**, so
the bar, the numeral beside it and the clamp on the adjust controls are all drawn
against a ceiling nothing else on the sheet agrees with.

The cause is one optional argument. `src/formula/resolve.ts`'s `mod.self` branch
returns `0` when the evaluation is handed no published name; `resolveFormulaFields`
passes none, and Track's and Pool's own `resolveField` call sites pass none
either. `src/formula/sheet.ts`'s name table *does* pass it, which is why
`<id>.count` is right and the drawing is wrong. `FieldResolver`'s own doc comment
in `src/types.ts` predicted exactly this: "a component that publishes a name and
forgets to say so here reads `mod.self` as 0, and nothing reports it."

This is the **need** the research names, arrived at from the inside: CSB 505 had a
meter display a formula-resolved max of 16 while enforcing 14; Foundry dnd5e 2401
had an effect silently do nothing against an auto-calculated maximum, and 2774 is
the same failure mirrored. Where a ceiling is a formula — the only case this
feature is about — one evaluation has to feed both the paint and any press held to
it.

### The mechanism, verified rather than assumed

The owner's decision is the generic fix: make the pre-resolve pass tell each
formula field which published name it becomes. The claim that carries it is that
the field-to-name mapping is **already declared and merely never read in that
direction**. That claim was checked by running it, not by reading it:

```
publishedEntries(modifierTargetSource(exhaustion, track))
  → [["exhaustion", null], ["exhaustion.count", {"field":"count","scope":{}}]]
publishedEntries(modifierTargetSource(hp, pool))
  → [["hp", null], ["hp.max", {"field":"max","scope":{}}]]
```

Inverted, that is `count → exhaustion.count` and `max → hp.max`, with **no new
contract member**. Three further facts make it safe:

- **It needs no character.** `modifierTargetSource` already calls
  `scopeValues(null, config)`, so the inversion is a fact about a layout. That
  keeps it in `src/formula/` (Constraint 5) and means the inversion and the
  accepting set are computed from one input, which is the property
  `modifier-targets.ts`'s own header exists to protect.
- **It is a one-line change at the call sites.** `src/view/sheet-view.ts:653` and
  `src/editor/canvas.ts:158` already have `component`, `config` and `data` in
  hand; only `resolveFormulaFields`'s first parameter widens, from
  `Pick<…, 'formulaFields'>` to `Pick<…, 'formulaFields' | 'scopeValues'>`.
- **The blast radius is exactly two components.** `context.resolved` is read in
  two places in the whole repository: `pool.ts:816` (`max`) and `track.ts:1925`
  and `:2437` (`count`). Card, Card set, Roster and Table pass their published
  name at their own call sites and never read `resolved`, so they cannot move.

  **Amended during the build: there is a third reader, and this paragraph missed
  it by searching for the wrong thing.** `context.resolved` is not the only route
  to a field a component draws from — `applyReset` is handed its own resolver, so
  a `full` rest on a Pool resolves `max` and a Track resolves `count` through
  `ResetContext.resolve`, which `view/sheet-view.ts` builds from
  `makeFieldResolver` and which **dropped the published-name argument entirely**.
  Scanning for consumers of `makeFieldResolver` rather than of `context.resolved`
  is what would have found it.

  It is in scope rather than out of it, and the reason is this document's own
  sentence one section up: *one evaluation has to feed both the paint and any
  press held to it*, and a reset button is exactly such a press. Left alone, the
  fix would have **created** the split it exists to remove — a Track drawing five
  segments and a long rest filling three, where before the fix the drawing and
  the rest agreed at three and only the published name disagreed. So the view
  forwards the name on that path too, and no component spells its own: the
  inversion is the one derivation (below).

**The guard is the call the name table makes, not a name count.** A published name
belongs to *this* evaluation only where this pass reproduces what
`formula/sheet.ts` does when it registers the entry —
`resolve(display.field, display.scope, name, false, display.rows)` — and what this
pass supplies is an empty scope and no rows. So the three conditions are that one
call read as conditions: **exactly one entry names the field**, **its
`display.scope` is empty**, and **it declares no `rows` of its own**. Card's entry
is `{ field: 'derived', scope: { value: … } }` and Card set's and Roster's are one
such entry per name, so all three are excluded by the scope clause and today's
behaviour is kept. Stated this way rather than as a count of names, because the
count-of-names guard the card proposed would admit a one-entry Card set and
evaluate its `derived` without the `value` it needs.

**Amended during the build: three conditions rather than two, and the argument is
the call shape rather than a list.** Saying *why* the terms exist is what makes
the guard checkable — and it is checked: `resolve.test.ts` scans `sheet.ts` for
that call, so adding or changing an argument there fails the build beside the
guard rather than reopening the split silently. **Two of the three clauses have
no consumer yet.** Nothing in the registry declares `rows` with an empty scope,
and nothing declares two entries naming one field, so neither reports anything
today. They are written because the argument is completeness of the mirror — this
pass either reproduces that call or it does not — and not because either clause
has a case behind it. A reader deleting one of them is not removing dead code;
they are narrowing what the guard claims to mirror.

Where the helper lives: `resolve.ts`. It needs only `ScopeValues` from `types.ts`,
and `modifier-targets.ts` already imports `formulaTexts` *from* `resolve.ts`, so
putting it there would be a cycle.

**Amended during the build: it is exported, and it has three production
consumers.** This said "a local function" and declined a module of its own "for
one consumer", and the count was wrong before the first commit was written. The
consumers are `resolveFormulaFields` in the same file, `view/sheet-view.ts`'s
reset path (above), and `components/track.ts`, which asks it which name its own
`count` publishes rather than spelling `<id>.count` — because spelling it would be
a second copy of the conditions `scopeValues` already decides, and a Track's
`count` carries a `display` only when it is neither a row set, nor named levels,
nor a flag. **The placement argument is untouched**: the cycle is still there and
the module still belongs here. What changed is that "one consumer" no longer says
anything, and one of the three is a component — which this section never
contemplated and which `roster.ts` already has a precedent for
(`import { coerceValue } from '../formula/resolve'`).

### What the fix does not reach, and why

**A row set cannot have its run lengths modified by this feature.** Two
independent reasons, and they agree:

- `rows.*.count` is a pattern field, and `resolveFormulaFields` skips pattern
  fields by construction — there is no single value to hand back for a family.
  `countFor` resolves `rows.<index>.count` through `resolveField` with no
  published name.
- A row set's own ceiling **has no published name to be the slot of**.
  `track.ts:1136` records it: a row's entries already reach `<id>.<key>`, which is
  one segment short of a third for the ceiling to sit at, and that is `SPEC` §13's
  open name-depth question. `scopeValues` publishes no `named.count` at all for a
  row set.

So `mod.self` on a row's length is legitimately 0, and **spell slots, hit dice,
death saves and every other row set are out**. That entry is not resolved here.
What a row set *can* still do, unchanged, is read any absolute name the layout
does publish: `rows[0].count = "2 + slot_bonus"` works today and is untouched.

Two more shapes are excluded by the same guard and need no special case: a
`levels` track publishes `count` as a literal (the levels list *is* the ceiling),
and a flag card publishes `count: 1` as a literal for continuity. Neither carries
a `display`, so neither is handed a name.

### What it publishes

**Nothing new.** `<id>.count` already reports the modified ceiling — that is not a
change, it is the half that was already right. `SPEC` §4.2 refuses a second name
for a plain run's ceiling ("a second spelling of an equation a formula can already
write"), and that refusal stands. No `.left` for a plain run. No new
`ScopeEntry` member, no `configFields`.

### Storage and existing notes

Nothing stored changes. No new key and no new section shape, so Constraint 3
holds without a new round-trip to prove: the parse and serialise paths are
untouched. Constraint 4 likewise — nothing is deleted, and the "stored value
outside the run is rendered, not corrected" rule (§4.2) is what carries the
removal case below rather than a cleanup.

**Amended during the build: "no new write path" was wrong, and what changed is
what an existing one writes.** No path is added — a reset trigger already wrote a
note, and this touches no `write`, no key and no fence. What moves is the number:
a `full` rest on a Pool declaring `max: '10 + mod.self'` with a `+4` pushed at
`hp.max` now writes `current: 14` where it wrote `current: 10`, and a Track's
`full` fills the modified run. That is the correction rather than a side effect —
a rest that refilled to a ceiling the card is not drawing is the split wearing a
button — but a sentence saying nothing is written differently would have been
false, and a reader checking Constraint 4 deserves the true one. A note is still
only ever written by a press the reader made.

### A finding against §13's open mark entry

§13 asks whether a modified number's mark should follow the narrow predicate
("this component's own formula mentions `mod.self`") while the picker keeps the
wide one, on the premise that "only the first can make a value move". **A Track is
a counter-example to that premise.** `count: "3 + mod.exhaustion.count"` — the
absolute spelling, in the component's own formula field — genuinely draws 5 and
publishes 5 today, and reaches the accepting set through the *second* rule, not
the first. Gating on the narrow predicate would draw no mark on a run whose length
really did move.

Recorded, not resolved. This feature takes the wide set (below) and the argument
for it is this case rather than inheritance.

## What it does

A modifier pushed at a Track's `count` moves the run, and what it moved is drawn
apart from what the layout gave. The run a reader presses and the number
`<id>.count` hands to the rest of the sheet become one computation, which they
are not today.

**Both directions are drawn, and the slots never disappear.** A grant adds
segments at the far end: empty, usable, spent last, and marks already sitting in
them survive the grant going away, because nothing writes to the note. **A
penalty leaves its slots exactly where they were and shuts them** — the run keeps
its unmodified length, and the slots at the far end are drawn blocked: present,
counted, and not values the control can take.

## Smallest version

**The engine half alone.** `resolveFormulaFields` passes each field its published
name, so a Track draws 5 segments where it publishes 5 and a Pool draws 14 where
it publishes 14. Three files, two tests, no CSS.

What it gives up: every segment looks the same, so a reader cannot tell which two
of the five came from the talisman; there is no breakdown and no way to ask why
the run got longer; and the `?` a penalty can now produce still says the count did
not resolve when it resolved to −3.

## Design

### The picture

A run of six where the layout gave four: four segments, a wider gap, two segments
with a **dashed** border. Filled or empty, the dash is on the border, so a granted
segment reads as granted whatever the value is standing at.

**The far end, and the argument is the file model rather than the prior art.** The
fill is `filled / count` counted from the near end, so raising `count` adds
indices at the end by arithmetic. Putting the grant at the near end would
renumber: the same stored `value: 2` would fill a different pair of segments
before and after the talisman, which is a grant changing what the note means
without the note changing. The three tools that draw this at all — Foundry dnd5e's
`token.mjs` appending `tempmax` past the un-boosted max, Arbron's Improved HP Bar
adding "to the bar on the right side", DnD UI Toolkit's purple `temp_max_health`
section — all append, and their agreement is corroboration rather than the reason.

**Spent last** follows from the same place. A Track is "a run of segments filled in
order" (§4.2); the granted ones are the last, so they are reached last. The
alternative needs a discontinuous fill, which is a different component.

### Granted segments arrive empty, and that is not a choice either

Nothing about a modifier writes a note. The fill is stored data and the ceiling is
a formula, so a grant moves one and cannot move the other. DnD UI Toolkit states
the rule outright — "The bonus only raises the maximum — it does not fill itself
in" — and Foundry dnd5e 3369 is the counter-case, where a maximum raised from 33
to 45 left current pinned at 33 and drew the bar at 100% of the old ceiling, so
the new room read as already consumed. Drawing the granted segments empty is both
what the file model forces and what the category agrees on.

### What happens to marks in a granted segment when the grant goes away

**They stay in the note, and nothing is corrected.** §4.2 already settles this and
the removal path inherits it: "A stored value outside the run is rendered, not
corrected... a track that rewrote itself to the new ceiling would destroy a
player's data on a level-up (§10)." A five-mark exhaustion whose talisman comes off
draws three filled segments, keeps `value: 5` in the note, reports "3 of 3", and
comes back to five the moment the talisman goes on again.

No prior art was found for this half, so it is worth being explicit about why the
tempting alternative is wrong: clamping the stored value to the new ceiling would
make taking an item off a *destructive* act, and it is the same act a level-down,
a config edit or a hand-edited note already performs. One rule covers all four.

Foundry dnd5e 3955 — reverting a raised maximum computed a hit point loss and
fired a concentration check — **cannot reach this plugin**, and the reason is
structural rather than careful: nothing here computes a rules consequence from a
bookkeeping change. The note is not written, so there is no event for anything to
fire on.

### A penalty, and the floor

`count: "2 + mod.self"` with a `-5` resolves to **−3**. `segmentCount` already
refuses anything below one and returns null, which `render` draws as `?` — so the
floor exists and no broken control is drawn. **What does not hold is the
sentence.** `explainField` returns null, because the formula resolved fine, so the
`?` falls back to its literal `"The number of segments did not resolve."`, which
is false. Measured, not inferred.

Until now that state was reachable only by a layout author editing a formula. A
modifier makes it reachable by a player putting on a cursed item, which is what
brings it into this feature's scope. The fix is the honest sentence: where the
count resolved to a finite number below one, say so and name the number — *"This
run works out to -2 segments."* — and carry the breakdown with it, so the reader
can see the push that did it. Where the formula genuinely failed, `explainField`'s
message is unchanged.

**Narrowed by the blocked drawing below**, and the example above is now the wrong
one: `2 + mod.self` with a −5 has two slots of its own and draws them blocked, so
the sentence is left for a run with none to draw either — `count: "mod.self"` with
a penalty, where the unmodified length is nothing too.

**Reversed by the owner after the feature was built, and the reversal is the
better design.** This section read *"Nothing draws the segments a penalty
removed… ghosting the lost length would put a second ceiling back on screen"*,
and it shipped that way. The owner's ruling: *"When some feature takes slots from
a tracker, they should still be there but look blocked… I want those slots removed
by the item to be there, instead of just disappearing."*

**What defeats the old argument is a distinction it did not make.** Ghosting means
faintly showing what is *not* there — a second ceiling, and rightly refused. A
blocked slot is **present and unusable**, which is a first-class state rather than
a picture of an absence. The convergent prior art asks for exactly it:
foundryvtt-lancer 548 wants "a slash through the icon" on a spent pip rather than
a recolour.

**The mechanism was already there and was being thrown away.** `cardCount`
computes the run's length twice — with the published name and without it — and
clamped the difference at zero. The negative half *is* the blocked count. So a run
draws `max(unmodified, live)` segments, the last `unmodified − live` of them
blocked, and nothing new is resolved, stored or published.

**This closes the finding that a shortened run carried no mark**, which a design
review called the worst thing shipping: two cards apart, both moved by rows in one
table, and only one showed it, so a reader who had learnt that dashes mean an item
did this read the other as untouched. Both directions are now drawn.

### What a blocked slot is, exactly

- **It is not pressable, and not because anything refuses a press.** The hit test
  is handed the *live* segments' rectangles only, so the blocked tail is not a
  position the control has. A press out there lands past the end and fills the
  live run, which is what a press past the end of any run already does. There is
  no new gesture, no guard, and no value in the blocked region that any input can
  reach.
- **The run announces the live ceiling and says the rest in words.** ARIA models a
  slider as one value between `aria-valuemin` and `aria-valuemax`, and a blocked
  slot is not a value this control can take — so `aria-valuemax` stays the live
  run and the drawn boxes deliberately outnumber it. `aria-valuetext` carries the
  difference: `3 of 4, 2 blocked`. That is what a flat string is for, and it is the
  only sanctioned place to put it.
- **A grant is still drawn as granted, and the two are not one job done twice.**
  Granted slots are *usable* and blocked ones are not, so they are different
  states and want different marks. They can also never appear on one run: a
  modifier slot holds one number, so a run is either longer than the layout wrote
  it or shorter.
- **Give and take on one run nets out, and that is all the engine has.** An item
  granting +2 beside one taking −1 draws one granted slot, not three granted and
  two blocked. `mod.self` is a single total (SPEC §5), so contributor-level detail
  does not exist at the slot; showing five marks for a net of one would be
  inventing arithmetic the sheet cannot support. The breakdown behind the run is
  where the two contributors are named.
- **A mark stored inside the blocked region stays in the note and is not drawn.**
  Fill Vigour to six, then wear the shackles: the note still holds `value: 6`, the
  run reports `4 of 4, 2 blocked`, and the two blocked slots are empty. SPEC
  §4.2's "rendered, not corrected" governs the *note*; the drawing has always
  clamped to the run, exactly as a stored 9 on a six-segment run fills six and
  stays 9, and the run is now the live part of it. Take the shackles off and the
  sixth mark is back.
- **A penalty that takes the whole run draws it blocked rather than `?`.**
  `2 + mod.self` with a −5 draws two slashed slots, `aria-valuemax="0"`, and
  `0 of 0, 2 blocked`. That returns `?` to meaning what SPEC §5 reserves it for — a
  count that did not resolve — and this one resolved perfectly well, to nothing.
  `?` is left for the case with no slots to draw either: `count: "mod.self"` with a
  penalty, where the unmodified run is nothing too. The honest sentence below is
  that case's, and only that case's.


### The second channel

`docs/UI.md` §1 gives the plugin no colours of its own, and §6 refuses a mark whose
only channel is a fill strength, so the question is not *which* colour but which
two geometric channels.

- **A dashed ring on the granted segments.** Drawn as a positioned `::after`
  over the segment's fill, in `--text-muted`, with the segment's own border held
  `dashed` and `transparent` underneath it.

  **This was a dashed *border* and it did not survive being looked at, twice.**
  The design said one declaration, `border-style: dashed`, inheriting its colour
  from the base segment rule so that nothing was said twice. What that missed is
  the box: a segment's fill is an absolutely positioned child, so it occupies the
  padding box and stops at the inside edge of the border, and **a dashed border's
  gaps therefore show the card rather than the fill**. A filled granted segment
  drew as a purple square with grey nibbles bitten out of its edges — measured at
  15px, the dash reads 2.12:1 against the card and 1.49:1 against the fill in
  light, 2.57:1 and 1.35:1 in dark.

  **What survives of the original claim is weaker than it was written, and the
  weaker version is the true one.** This said the mark is on the border "so a
  granted segment reads as granted whatever the value is standing at", and at
  reading size that overstates it: the ring over a fill measures 1.95:1 against
  the accent, so a filled granted segment reads as *ringed* and an empty one as
  *dashed*. Both carry a mark and both differ from the base segment beside them,
  which is what the channel has to do; they are not one mark seen twice. The first correction recoloured the dash and
  changed only the colour of the chipping. The acceptance criterion was met on
  its letter and failed on its reason, which is exactly the case this document's
  own "the second channel changes rather than the criterion" was written for.

  **What it is now.** A `::after` paints after its element's other positioned
  children, so the ring lands *on* the fill and its gaps show purple: a line on a
  filled segment rather than a bite out of one. An `outline` outside the box was
  tried and rejected on the shot — two consecutive granted segments sit one
  ordinary gap apart and their outlines overlap in the middle of the tail. The
  colour is now named rather than inherited, because a ring on a different
  element cannot inherit the base rule, and `--text-muted` is what clears
  `legibility.md` §3's 3:1 for a border that is the only thing marking a state.

  **The segment's own border width becomes padding, and that one line is what
  makes the ring the whole mark in every mode.** An absolutely positioned child
  is laid out against the *padding* box, and `overflow: hidden` clips to it, so
  moving the 1.5px from border to padding grows that box to the whole square
  without moving the square: the fill then reaches the outer edge and the ring is
  drawn on top of it there.

  **That is the fix for a regression the first overlay caused**, and it is worth
  recording because the first version looked right and measured wrong. Holding
  the border at `transparent` left the outermost 1.5px painting nothing, so a
  granted segment *drew* 13px inside a 15px box: the layout never moved —
  measured identical, 14.9px with 4.1px gaps — but the visible join read 9
  against 8, and two consecutive granted segments read 6 apart against 4. The
  sentence below about a tail of three having one join was true of the boxes and
  false of the picture, which is the same seam as the dash one property over.

  It also **removes a forced-colors branch rather than needing one**. The earlier
  version leant on the transparent border being repainted in that mode, which
  meant hiding the overlay there to avoid a double ring; with no border of its
  own there is nothing to repaint, the overlay is the mark everywhere, and the
  base segment's border is still the thing it differs from.
- **A wider gap at the join**, as a `margin-inline-start` on the granted run's
  first segment, reset between consecutive granted ones.

Both survive `forced-colors: active`, which is the whole reason for choosing them.
That mode strips author background and border *colours* and forces `box-shadow` to
none; it leaves `border-style` and layout alone. This is `.sheetsmith-modified`'s
own argument one component over — that class is `text-decoration: underline`
precisely because "`text-decoration` also survives forced-colors mode, where a
border or a shadow would not."

**This is the trap the reference implementation fell into.** Foundry's `token.mjs`
separates base, raised ceiling, lowered ceiling and buffer by `beginFill` and gives
every region the same flat black `lineStyle` — WCAG 1.4.1 failure technique F13.
Copying its three-colour scheme copies the defect. And the pain point is reported
from a table rather than an audit: a GM discovered mid-session that a player could
not separate the green and yellow of a health gradient, and both answers offered
were a second channel.

**Hatching is refused, and on evidence.** Carbon Charts 2054 records colour-only
category indicators against Carbon's own guidance to use texture, with no
configuration to turn it on; Highcharts ships a pattern-fill module and still
warns that "pattern fills and dash styles could make your charts visually
confusing and less accessible to some users". Whether a texture reads at an
18px segment is unproven, and this repository has no pattern vocabulary to reuse.

**The harness answers whether the pair reads, and prose does not.** Both themes at
the default segment size, and `sheet-forced-colors`, which is the harder of the
two modes and the one the channels were chosen against; there is already a
Track-specific forced-colors view to follow. `prefers-contrast: more` is **not**
among them, and the omission is the harness's rather than a judgement:
`docs/BACKLOG.md` records that no view renders that mode for any component,
because Chrome's `--force-prefers-contrast` produces a byte-identical PNG and the
mode needs `Emulation.setEmulatedMedia` over the DevTools protocol. What is
claimed about it here — that a granted segment inherits the existing raise to
`--text-muted` — is one CSS declaration inheriting another, which is read rather
than looked at, and it is the only part of this section that is.

### Interactions: none are new

The run stays one control at one value. A press, a drag, the arrows and the wrap
all work exactly as they do, because `marksAtPoint` is given segment rectangles
and a margin moves a rectangle rather than changing what a point inside it means.
The gap behaves as the run's existing inter-segment gap does. `docs/UI.md` §6's
one-focus-treatment-per-component holds untouched: the run keeps its own ring and
the granted segments are not separately focusable.

One consequence worth naming rather than discovering: on a `sense: harm` run, the
grade `(at + 1) / count` is computed against the modified count, so a grant makes
every existing segment slightly lighter. That is correct — the escalation is read
against the run the reader is looking at — and it is what already happens when a
level-up lengthens a track.

### What a granted segment announces

**Nothing of its own, and that is the design rather than a gap.** ARIA has no
vocabulary for a region inside a meter: `meter` and `progressbar` model one scalar
between `aria-valuemin` and `aria-valuemax`, the APG offers no construct for "this
part of the value is a bonus", and the only sanctioned nuance is `aria-valuetext`,
a flat string. Track is already on the right side of this — the run carries
`role="slider"` and the segments are decoration inside it — so the question is what
the *run* says, and the answer is that it already says the right thing once the
ceiling is one number: `aria-valuemax="5"`, `aria-valuetext="1 of 5"`,
`aria-label="Exhaustion, 1 of 5"`.

What is added is the explanation, through one builder and whatever carries it:

- an `.sheetsmith-sr-only` twin holds `modifierBreakdown(…)` and the run points at
  it with `aria-describedby`;
- a glyph button beside the card's name opens the same string in the shared
  popover.

**The premise here was right and the conclusion was one step short, and the owner
overturned it.** This section read *"No popover, because a press on this control
already means something"*, and concluded that `title` was what was left. The
premise holds — a press on the run sets the value, so the second door
`card-face.ts` and a computed cell open *on the number itself* is not available.
What does not follow is that a tooltip is the only alternative: the door does not
have to be the number. The owner asked for *"anything that, on hover, displays
what is affecting the respective tracker, similar to what happens in the card
layout"*, and what was missing was never the content — it was Card's
**affordance**.

A `title` fails three ways, and the third is the one that decided it: it is slow
and unstyled where the popover is designed for the job; it has no press route, so
it is the one carrier a reader cannot *ask* for; and **a finger gets nothing at
all**.

**So the affordance is a glyph-only `<button>` beside the card's name**, `info`,
opening `showPopover` with the same string the twin holds.

**`info` rather than `zap`, decided after the fact and worth the sentence.** It
shipped as a bolt on the argument that a modifier cell three cards up the same
screen is already teaching that glyph, and a design review confirmed the
association works. What it also does is teach the wrong press: every `zap` on a
sheet opens a control that *edits* — the picker that changes which modifiers a
row declares, and the form behind it — and this one opens a panel a reader can
only read. The association against the edit/explain distinction, and the owner
chose the distinction. `docs/UI.md` §9 carries the rule now, so the third surface
of this kind is not a third guess. Beside the label rather
than anywhere in the run's own row, and that placement is the constraint rather
than a preference: everything on that row is either a target or something a drag
passes over, so a control there would be pressed on the way to setting a mark. The
label is the one part of this card that answers no gesture. A `<button>` is also
what makes the keyboard free — Enter and Space arrive as a click, so there is one
route in (`PATTERNS.md` §6) and no second code path.

**It takes the breakdown's set, which is the wide one**, because it is a door to
the breakdown. A run whose `count` reads `mod.exhaustion.count` gets the button and
no dashed tail, which is right on both counts: something is pushing at the name,
and none of the length is attributable to `mod.self`. An unmodified Track grows
nothing at all — no button, no heading row, and the label stays a direct child of
the card, so the DOM and the pixels are the ones that shipped. A row set gets none
by the same absence every other boundary here turns on: no published name, so
nothing to break down.

**And the run's `title` gave the breakdown up when the button took it.** Carrying
both would be two doors to one room and the tooltip is the worse of the two. What
the run keeps is the route that never needed a pointer — `aria-valuetext` for the
reading and the twin for the account — so the screen-reader path is the one thing
here that did not change.

**The granted segments are the mark, and `.sheetsmith-modified` is not used.** That
class is `text-decoration: underline`, which draws nothing on a flex row of spans
and would fight the slider's own cursor. A Track joins `docs/UI.md` §9's "a number
something has been pushed at" row as a third consumer of `modifier-breakdown.ts`,
not as a third consumer of the underline.

**A fourth figure on a component that already draws three**, and it is the reason a
glyph was the safe choice. A plain square, a granted ring and a blocked slash are
three treatments of one box; a bolt is not a box at all, so it cannot be confused
with any of them, and `forced-colors: active` — where every fill goes and only
shape is left — is where that was checked rather than assumed.

### Which set the mark follows, and which set the drawing follows

They are deliberately different, and the split is the useful part of this section.

- **The breakdown follows the wide set** — `acceptingTargets` as it stands. It
  answers "has anything been pushed at this name", which is a question about the
  name and is answerable statically. The §13 finding above is why: the absolute
  spelling reaches the ceiling through the second rule and really moves it.
- **The granted drawing is offered only where the run's own `count` reads
  `mod.self`.** It answers "how much of this length came from a push", which is a
  question about the *formula*, and `mod.self` is the only spelling the component
  can evaluate to zero. `count: "3 + mod.exhaustion.count"` is arithmetic over a
  name and is indistinguishable from `count: "3 + bonus_length"`; both get the
  right ceiling and a uniform run.

The arithmetic follows directly and needs no new plumbing: **granted = the count
with the published name − the count without it.** Resolving without the name is
what zeroes `mod.self`, so the mechanism that caused the bug becomes the mechanism
that measures the grant. Measured: `resolve('count', {})` is 3 and
`resolve('count', {}, 'exhaustion.count')` is 5.

Reading the slot total instead would be wrong wherever the formula transforms it:
`count: "floor((3 + mod.self) / 2)"` has a slot total of +2 and grants one segment.

Where the base does not resolve to a drawable count but the modified one does —
`count: "mod.self"` — the base is taken as zero and every segment is granted.

### Empty and error states

- **No modifier:** a plain run, byte for byte the card that ships today. Every
  rule above is inert.
- **Grant of zero**, because contributors cancelled: base equals modified, no
  segment is granted, and the breakdown still lists both lines and says why —
  which is the case the breakdown exists for.
- **Count unresolved:** `?` and `explainField`'s message, unchanged.
- **Count resolved below one:** `?`, the honest sentence, and the breakdown.
- **Row set, `levels`, flag:** unreachable, by the guard, with no special case.
- **A reset's own `to` expression reads no slot**, and that asymmetry is this
  feature's rather than inherited. `full` now restores to the *modified* ceiling,
  because the view hands each field its published name on the reset path; a
  `formula` binding does not, because no entry's `display` names `reset.*.to`, so
  it publishes nothing and `mod.self` there is legitimately 0. The visible edge:
  `to: 'max'` restores 14 while `to: 'max + mod.self'` restores 10. **Cut rather
  than solved**, and named here so it is a decision: giving `reset.*.to` a
  published name is a §6 question about what a binding *is*, and answering it
  inside a Track feature would settle it for Pool, Table and Record set by side
  effect. `SPEC` §13 holds it, rather than `docs/BACKLOG.md`, whose two sections
  are conformance gaps against `PATTERNS.md` and `UI.md` and which this is
  neither.

### What Pool gets for free, and what it does not

The generic fix corrects Pool's identical split in the same commit: `hp.max` and
`context.resolved['max']` become one number, so the numeral, the bar's
proportion, the throw's bound and the clamp are all held to the ceiling the rest
of the sheet reads. That is the CSB 505 need, satisfied for the component it was
reported against.

**Two consequences are stated and not designed.** A Pool's max then draws a moved
number with no mark, which is the shape §13 worries about — and `SPEC` §4.2's own
line that a Pool's `max` is "not a published name" is stale, since `hp.max` is
published and was measured being pushed at. Both belong to Pool, and a Pool
buffer/ceiling surface is its own card.

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |

**None, deliberately.** The grant arrives through the `count` field that already
exists and the modifier mechanism that already exists. A switch for whether the
granted segments are drawn distinctly would be a setting whose only honest
description is "draw this correctly, or don't"; the drawing is the feature.
`count`'s existing description gains one clause naming `mod.self` as the spelling
that grants segments, which is the whole of the editor's change.

## Data and file model

Nothing. No key, no section shape, no write path, and therefore no new
round-trip surface (Constraint 3 holds by there being nothing to drift). A
character note written before this feature renders identically unless a modifier
is actually pushing at the Track's `count`, in which case the run is longer and
the note is still untouched (Constraint 4).

The one file-model *statement* this feature makes is the removal rule, and it is
inherited rather than new: marks stored past a shrunken run stay in the note and
are rendered, not corrected (§4.2, §10).

## Acceptance criteria

**What has been through the spec axis, and what has not.** `/spec-review` ran on
the structural wave and reported eight findings; all were addressed and the
criteria it examined are ticked below. The feature then grew three times on the
owner's decisions — blocked slots, the breakdown affordance, and the glyph — and
**those criteria have had no spec-axis review**, so they are left unticked rather
than ticked by the session that wrote them. They are met as far as the tests and
the shots go; what is missing is the second pair of eyes, and a tick here is
supposed to mean that rather than "the author thinks so".

- [x] A Track with `count: "3 + mod.self"` and a `+2` pushed at `<id>.count`
      draws **five** segments, and `aria-valuemax` is `5` — the test asserts the
      drawn count and `env.sheet('<id>.count')` in one case so they cannot drift.
- [x] A Pool with `max: "10 + mod.self"` and a `+4` draws `14` as its ceiling
      numeral and clamps against 14.
- [x] Card, Card set, Roster and Table are unmoved: a test drives
      `resolveFormulaFields` over a Card whose `derived` reads `mod.self` and
      asserts the resolved value is the unmodified one, so the scope guard is
      pinned rather than assumed.
- [x] The two segments past the base run carry
      `.sheetsmith-track-segment-granted` and the base four do not.
- [x] A Track whose `count` reads `mod.exhaustion.count` rather than `mod.self`
      draws five segments and marks **none** of them granted.
- [x] A Track row set whose `rows[0].count` reads `mod.self` draws that row's
      declared length, with no error — the boundary is asserted, not assumed.
- [x] A `levels` Track and a flag card are unchanged with a modifier on the
      sheet.
- [x] Marks survive the grant going away: a note holding `value: 5` against a
      count that falls back to 3 draws three filled segments, reports `3 of 3`,
      and `write` produces a byte-identical body.
- [ ] **Rewritten after the blocked-slot reversal, which made it false.** It
      read: a `-5` against `count: "2 + mod.self"` draws `?` whose title names
      the number. That run now draws its two slots blocked, and `?` is left for
      a run with none to draw either. So: `count: "mod.self"` with a penalty
      draws `?`, and the sentence naming what the count worked out to reaches
      both the glyph's `title` and the popover behind the button.
- [ ] **Blocked slots.** A run a penalty shortened draws its *unmodified*
      length, the slots past the live run carrying
      `.sheetsmith-track-segment-blocked`; `aria-valuemax` stays the live
      ceiling and `aria-valuetext` reads `3 of 4, 2 blocked`; a press in the
      blocked tail reaches no value inside it; a mark stored there stays in the
      note and is not drawn; and a penalty taking the whole run draws it blocked
      rather than `?`.
- [ ] The popover the button opens and the `aria-describedby` target hold the
      **same** text, from `modifierBreakdown`.
- [ ] A modified Track grows a glyph button beside its name; an unmodified one
      grows nothing — no button, no heading row, and the label is still a direct
      child of the card.
- [ ] The button opens the breakdown on a press and from the keyboard, through
      one handler, and it is not inside the run.
- [ ] A Track whose `count` reads `mod.exhaustion.count` gets the button and no
      dashed tail: the door follows the wide set, the drawing follows `mod.self`.
- [ ] A row set grows no button, by the absent published name rather than a
      special case.
- [ ] The run's own `title` is the reading again, and only on a named run.
- [x] A press, a drag and the arrow keys reach the same mark on a run with a
      granted tail as on a run of the same total length with none.
- [x] `npm test`, `npm run lint` and `npm run build` are clean.
- [ ] **Looked at, not read**: `npm run harness:shot` fresh, and a granted
      segment is distinguishable from a base one in `sheet`, `sheet-dark` and
      `sheet-forced-colors`. If it is not, the second channel changes rather than
      the criterion.
- [x] The throwaway vault's `Modifier variations.json` / `Ilona.md` gain a Track
      whose `count` reads `mod.self` and a modifier row pushing at it, plus a
      second Track pushing a penalty at its own count. The presses: toggle the
      row's `Worn` flag and watch the run lengthen and shorten; fill past the base
      run, unequip, and confirm the note still holds the higher number.

## Commit boundaries

A plan for `/land-it`, applied once at the end. The work stays in one uncommitted
tree through implementation and every round of findings.

1. **`fix: Hold a drawn ceiling and a published one to one number`.** The
   inversion in `resolve.ts`, the widened `resolveFormulaFields` signature, both
   call sites, and the guard. Tests for Track, for Pool, the Card and Card set
   guard tests, and the scan holding the guard to `sheet.ts`'s own call. After
   this the split is gone and nothing looks different except the numbers, which
   is the smallest version.

   **Widened during the build to carry the third reader**: `view/sheet-view.ts`
   forwarding the published name through `ResetContext`, and
   `view/reset-flow.test.ts` — which declares itself a mirror of that wiring —
   following it, with the two reset cases. It belongs here rather than in a
   commit of its own because it is the same defect and the same sentence: a
   ceiling drawn and a ceiling acted on are one number. Splitting it would land
   a commit whose whole content is a regression the next commit removes.
2. **`feat: Draw the segments a modifier granted a Track`.** `countFor`'s second
   resolve, the granted index, `.sheetsmith-track-segment-granted`, the dashed
   border and the join gap, and the geometry test that a press still lands where
   it did.
3. **`feat: Say what a modified run is made of`.** The run's `title`, the sr-only
   twin, `aria-describedby`, and Track's first import from
   `modifier-breakdown.ts`.
4. **`fix: Say what a run whose length works out to nothing is`.** The `?`'s
   honest sentence and the breakdown beside it.
5. **`feat: Name the spelling that grants segments`.** The `count` config field's
   amended description, and the harness sample.
6. **`docs: A modifier grants segments to a Track`.** This document to `built`;
   §4.2's Track paragraph and its `count` sentence; §5's note that a field's
   published name reaches the pre-resolve pass; `docs/UI.md` §9's "a number
   something has been pushed at" row gaining Track as a consumer and the
   forced-colors note for the dashed border; the §13 finding against the
   mark-set entry; `docs/BACKLOG.md` rows for Pool's unmarked max and for §4.2's
   stale "a Pool's `max` is not a published name". The vault fixture's press
   list.

## Deliberately not doing

- **A buffer pool on a Track.** A second, non-stacking, absorb-first pool
  alongside the run — D&D 5e temporary hit points, Pathfinder 2e temporary Hit
  Points, Lancer's Overshield. Against this feature's five assumptions — granted
  segments, appended at the end, drawn distinct, existing marks preserved, grants
  stack — a buffer satisfies two and breaks the three that matter: the base
  ceiling is untouched, the buffer is consumed *before* the run rather than after
  it, and the combination rule is a maximum rather than a sum, which §5's
  one-number-per-target slot cannot express. **No tool that draws both uses one
  drawing for both**, and Foundry dnd5e is the strongest evidence because it put
  the buffer at the start as an inset and the raised ceiling at the end as an
  extension *inside one codebase*, where a single generic "bonus region" was the
  cheaper design and its maintainers did not take it. Pool already has `hasTemp`;
  if a Track wants one it is that feature ported, not this one generalised.
- **`SPEC` §13's entry on whether a modified number's mark should follow the
  narrow set.** This feature adds a counter-example to its premise and takes the
  wide set with an argument; it does not close the entry. The picker's own
  over-report is part of the same entry and is left alone: `acceptingTargets`
  will offer both `Exhaustion` and `Exhaustion · count`, and only the second does
  anything, because `relative` is computed per component.
- **`SPEC` §13's unpublished row-set ceiling.** Named above as the reason spell
  slots are out. Not resolved here.
- **Pool's UI.** The generic fix corrects Pool's numbers; it draws no mark on
  them and grows no surface. A backlog row, not a second half of this card.
- **`docs/BACKLOG.md`'s row that `.sheetsmith-modified` reads as a link**, and the
  row about a breakdown listing contributors that did not move the number. Both
  pre-existing, both untouched, and the first is not even reached here since a
  Track's mark is its segments.
- **Verifying the second channel under `prefers-contrast: more`.** The dashed
  border and the join gap are justified by surviving `forced-colors: active`,
  which is the harder test and is renderable, so the criteria photograph that
  instead. The contrast mode's rendering goes unlooked-at: `docs/BACKLOG.md`
  already owns that gap for every component — Chrome's `--force-prefers-contrast`
  produces a byte-identical PNG and the mode needs the DevTools protocol's
  `Emulation.setEmulatedMedia`, which `harness/shot.mjs` does not drive. This
  feature inherits that row rather than adding one, and the claim it leaves
  unphotographed is a one-declaration inheritance that is read rather than seen.
- **A clock whose size changes.** Blades in the Dark fixes a clock's segment count
  at creation and the SRD carries no operation for changing it; the designed
  escalation is a second linked clock. One sentence so the next reader does not
  go looking.
- **Expressing *Aid*.** "Each target's hit point maximum and current hit points
  increase by 5" needs the ceiling and the fill to move together, and **a layout
  cannot express it — the answer is structural and it is no.** A modifier changes
  what a formula computes; the fill is stored data, and nothing but a reset
  trigger or a press ever writes a note. A push that wrote a player's note is the
  thing §10 forbids most directly. What a layout *can* do is declare a trigger
  whose `to` is `<id> + 5`, which the player presses when the spell lands and
  again when it ends: honest, because the player is recording an event, and
  expressible today. This feature will be demonstrated with a talisman rather
  than with *Aid*.
