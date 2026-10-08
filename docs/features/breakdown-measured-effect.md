# A breakdown's total states what a transformed push did

Status: built
Board card: A granted tail and its own tooltip state one push at two magnitudes (`docs/BACKLOG.md` § UI)

## Model question

None. The ruling is `docs/UI.md` §9, "Where the formula transforms the slot, the
total states the push and then what it did". Which numbers carry a breakdown is
the settled own-formula set (SPEC §13), and this changes no set. Nothing is
published, stored or read differently. The change is one optional argument on the
shared builder, and one Track call site passing it.

## What it does

A Track whose `count` transforms its modifier slot, such as
`floor((3 + mod.self) / 2)` with a `+2` push, draws one granted segment, but its
breakdown says `Total +2`. After this change the breakdown says `Total +2, run +1`:
first the push, then what it did to the run the reader is looking at. A slot the
formula passes through unchanged reads exactly as it does today, character for
character.

## Smallest version

The builder gains an optional measured effect, supplied by the caller the way
`shown` is. Track passes the effect `cardCount` already measures. Nothing else
calls the builder with it. What this leaves out: Card, Table and Roster still
state only the push where their formula transforms the slot, until each of them
measures its own effect.

## Design

### The builder (`components/modifier-breakdown.ts`)

- `modifierBreakdown` gains one optional parameter after `inRows`: the measured
  effect, as the amount plus the noun it is measured in (`run` for Track). It is
  documented the way `shown` is: **it is supplied by the caller and never derived
  here**, because the builder never re-derives a number that another component
  drew. If it is absent or `null`, the output is exactly what it is today.
- `arithmeticLines` takes the effect and adds it to the total line, as
  `Total +2, run +1`, only when all of these hold:
  - no override applies (see decision 3),
  - the effect is not zero (decision 2),
  - the effect differs from the slot total, meaning
    `breakdown.total + (breakdown.resultTotal ?? 0)` (decision 5).
- The amount is spelled through `signed`, which is the same helper the push uses,
  so the two halves of one line cannot spell a number two ways.
- `modifierAccount` passes nothing. It shares `arithmeticLines`, so it gains the
  parameter only when Card, Table or Roster measure an effect. Its text stays
  byte-identical.

### Track (`components/track.ts`)

- `CardCount` gains a member for `live - base`, computed inside `cardCount`. It
  is not worked out at the call site as `granted - blocked`, because `cardCount`'s
  own rule is that there is one derivation of the grant. Where `published` is
  undefined the member is 0, as `granted` and `blocked` are.
- `cardPushed` passes `{ noun: 'run', amount: ownCount.<member> }` (the shape
  is the dev's to name) to `modifierBreakdown`, with `undefined` for `inRows`.
- The popover, the `.sheetsmith-sr-only` twin and the `?` card's `withBreakdown`
  text all read `cardPushed`. They stay one string ("one string and one builder,
  whatever the carrier"), so no carrier changes on its own.

### What a reader sees, by case

| Count | Push | Drawn | Breakdown total |
| --- | --- | --- | --- |
| `4 + mod.self` (Endurance) | `+2` | 6, two granted | `Total +2` (unchanged) |
| `6 + mod.self` (Vigour) | `-2` | 6, two blocked | `Total -2` (unchanged) |
| `floor((3 + mod.self) / 2)` (new sample) | `+2` | 2, one granted | `Total +2, run +1` |
| `floor((3 + mod.self) / 2)` | `-2` | 1, one blocked | `Total -2, run -1` |
| `floor((4 + mod.self) / 2)` | `+1` | 2, nothing granted | `Total +1` (decision 2) |
| `3 + mod.grit.count` (Grit) | `+2` | 5, nothing granted | `Total +2` (unchanged, decision 2) |
| `2 + mod.self` (Cursed vigour) | `-5` | 2, both blocked | `Total -5, run -2` (decision 4) |
| any, under an override | sets to N | N | `Total <shown>` (unchanged, decision 3) |

### Decisions the ruling left open, settled by the owner

The ruling did not make these choices. The owner settled all eight at spec
approval, each as recommended. Each entry keeps its reason, and notes the
alternative that was weighed.

1. **The caller supplies the noun.** The caller passes the noun (`run`) with the
   amount. The noun names what the caller drew, the same kind of fact as
   `inRows`. A builder that hard-coded `run` would hold a Track word inside a
   shared module, and nothing outside a component should need to know that
   component exists. *Weighed:* a bare number with `run` fixed in the builder.
   It was simpler now, but Card's follow-up would have had to change the
   signature.
2. **An effect of zero adds nothing, so the line reads plain `Total +N`.** A
   measured zero is ambiguous. `cardCount` measures only what `mod.self` moved,
   and a count that reads its slot by the absolute spelling resolves the same
   either way. Grit (`3 + mod.grit.count`, `+2`) really is two segments longer,
   yet it measures 0, so `run +0` or `run unchanged` would be a false statement
   about a run that moved. The cost is the absorbed push: `floor((4 + mod.self) /
   2)` with `+1` keeps reading `Total +1` over an unchanged run. That is the bug
   at its smallest magnitude, so when this pass deletes the backlog row it adds a
   narrower one for it. *Weighed:* the builder spelling zero as `run unchanged`,
   with Track passing `null` where its count does not read `mod.self`. That
   needed a text scan of `count`, which `cardCount` deliberately avoids.
3. **An override keeps `Total <shown>` with no clause.** Under an override the
   total line already states the drawn value, so a clause would be a second
   account of a number the line just gave. The "differs from the slot total" test
   also has no slot total to compare against there. *Weighed:* `Total 2, run -2`.
4. **A clamp counts as something the push did.** The run has a floor (nothing
   below one segment) and a cap (`MAX_SEGMENTS`, 100), and a push past either
   changes the run by less than the push. Cursed vigour (`2 + mod.self`, `-5`)
   reads `Total -5, run -2`, which is exactly the two blocked slots drawn. The
   ruling says "what it did", and the clause matches the picture. **Cursed
   vigour's popover and shot move in the harness, and that move is intended.** It
   is a Shackles sample, not a Talisman one. *Weighed:* a clause only where the
   formula, not the bounds, transformed the slot. Track cannot measure an
   unclamped run without re-deriving the count.
5. **"The slot total" means both phases, `total + (resultTotal ?? 0)`.** The
   measured effect includes the result phase, because the published evaluation
   adds it. Comparing against `total` alone would add a clause to an
   untransformed `4 + mod.self` that also carries a result-phase line, and that
   breaks "an untransformed slot reads as it always did". *Weighed:* comparing
   against `total` only, and accepting the clause there.
6. **A negative effect is spelled signed: `run -1`.** This is the ruling's own
   spelling read the other way, through `signed`. *Weighed:* words, such as
   `run 1 shorter`. That would have added a second spelling of an amount, which
   §9's one outcome helper exists to prevent.
7. **The separator is `, `, as the ruling writes it.** A new line would make the
   clause read as a contributor. Recorded so that a reviewer does not report `, `
   against `; ` or a new line.
8. **The new sample's push goes on the Talisman of Endurance cell.** It adds
   `<id>.count += 2` there, and no row is added to Worn items, so nothing below
   the table moves in any shot. The owner's "must not change by one character"
   applies to the popovers of the Tracks the Talisman already feeds, not to the
   Talisman's own cell. Those popovers render byte-identically. The Talisman's
   own row popup gains one line, and that is intended. *Weighed:* a new Worn
   items row. It would have left the Talisman's bytes untouched, but it grows the
   table, and every shot below it would have moved.

Empty and error states do not change. With no breakdown, nothing is drawn. A `?`
card keeps its `worksOut` lead. With modified and unmodified both unresolved, the
effect is 0, so no clause is added.

## Config fields

None.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |

## Data and file model

Nothing is stored and nothing is written. Round-trip (Constraint 3) and existing
notes (Constraint 4) are unaffected, because only render-time text changes.

## Acceptance criteria

- [x] `modifier-breakdown.test.ts`: a case named for the bug. Lines totalling
      `+2` with a measured `run +1` read `Total +2, run +1`, and the contributor
      lines are unchanged.
- [x] `modifier-breakdown.test.ts`: a negative case, `Total -2, run -1`.
- [x] `modifier-breakdown.test.ts`: a measured effect equal to the slot total, a
      zero effect, and an effect under an override each produce text identical
      to passing none. The result-phase case follows decision 5.
- [x] **The pin for the nine other importers:** the `said` helper also asserts
      that every existing case produces identical text with no effect and with an
      effect equal to its slot total. No expected string changes in
      `roster`, `table`, `modifier-form`, `pool`, `card-face`, `card`,
      `record-set`, `note-mark` or `card-set` tests, and none of those modules'
      sources is in the diff.
- [x] `track.test.ts`: `count: 'floor((3 + mod.self) / 2)'` with `+2` draws one
      granted segment, and the door's popover text and its twin both end
      `Total +2, run +1`. Both carriers are asserted equal.
- [x] `track.test.ts`: `4 + mod.self` with `+2` reads `Total +2`, with no clause.
      `3 + mod.<id>.count` with `+2` reads `Total +2`, with no clause (decision 2).
- [x] Harness: one new Track with `count: 'floor((3 + mod.self) / 2)'`, pushed
      `+2`, in the nearest free row to the granted-segment samples (rows 33–34),
      named in the review. Its popover reads `Total +2, run +1` in both themes.
- [x] Harness: Endurance, Endurance (low), Fettle and Grit popovers are unchanged
      to the character. Cursed vigour reads `Total -5, run -2`, and the review
      names its shot as an intended move (decision 4). Every other moved PNG is
      named in the review, along with why it moved.
- [x] `npm run lint` (0 warnings), `npm test`, `npm run build`, `npm run harness`
      and `npm run harness:shot` pass.
- [x] `docs/BACKLOG.md` § UI loses the row "A granted tail and its own tooltip
      state one push at two magnitudes". Its neighbours stay.
- [x] In the same pass, `docs/BACKLOG.md` § UI gains a narrower row for what is
      left (decision 2). `floor((4 + mod.self) / 2)` with `+1` still reads
      `Total +1` over an unchanged run, and a transformed absolute spelling,
      `floor((3 + mod.<id>.count) / 2)`, still states only the push. The row
      waits on one of two things: a way to measure an absorbed push without
      re-deriving the count, or a reader who is confused by it.
- [x] `docs/UI.md` §9's paragraph says Track is built, and that Card, Table and
      Roster follow when they measure. "Not yet built (`docs/BACKLOG.md` § UI)" is
      gone. Any of the eight settled decisions that the paragraph needs, such as
      zero adding no clause and an override keeping `Total <shown>`, are stated
      there.

## Commit boundaries

These are a plan for `/land-it` at the end, not a schedule. The tree stays
uncommitted through the build and every round of findings. No commit carries a
`Co-Authored-By` trailer.

1. `fix: State what a transformed push did to a Track's run`.
   `modifier-breakdown.ts` (the parameter and the total clause), `track.ts` (the
   `CardCount` member and the call site), and both test files.
2. `test: Stage a Track whose count transforms its push`. The harness sample and
   the push on the Talisman of Endurance cell.
3. `docs: Settle what a breakdown's total says of a transformed push`. This file
   at `built`, the `UI.md` §9 clause, the `BACKLOG.md` row deleted, and the
   narrower `BACKLOG.md` row for the absorbed push and the transformed absolute
   spelling added.

## Deliberately not doing

- **Card, Table and Roster measuring their own effect.** They pass nothing, so
  they read as today. `modifierAccount` does not gain the parameter.
- **The row "A push moves a number that reads it absolutely, and nothing marks
  that number"**, which is undecided.
- **The absorbed push and the transformed absolute spelling.**
  `floor((4 + mod.self) / 2)` with `+1`, and `floor((3 + mod.<id>.count) / 2)`,
  both still read only the push (decision 2). `cardCount` measures only
  `mod.self`. The narrower `BACKLOG.md` row this pass adds holds the case.
- **Other sheet-side rows waiting on their own pass:** the open-rows name column
  floor, and the record stacking threshold.
- **Notes on Track** (`drawsNotes`).
- **Rounding the zero check.** `effectClause` reads `effect.amount === 0` on the
  unrounded amount, which is exact for Track's whole-number runs; it must go
  through `roundSum` like the slot comparison once a caller passes fractional
  effects, Card first.
