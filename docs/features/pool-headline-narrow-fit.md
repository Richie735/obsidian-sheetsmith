# Pool headline narrow fit

Status: shipped (design A)
Board card: The Pool's ceiling overflows a one-column card at the largest text size (`docs/BACKLOG.md` § UI)

Route: standard. The repository already has the mechanism: per-card container
queries on the Pool (`@container (max-width: 160px)` for its controls), and a
value field capped to its slot with `max-width: 100%` (the Roster band value,
`.sheetsmith-view .sheetsmith-roster-band-value .sheetsmith-card-input`).

## Model question

None. This changes how the reading is laid out. Nothing the Pool stores,
publishes or resolves changes.

## What was measured

Everything below was measured over the DevTools Protocol against the built
harness (`state=populated`), with the value and the ceiling text injected in the
page. All widths are in px. *Content* is the card's content box, *row* is
`.sheetsmith-pool-reading`, *field* is `.sheetsmith-pool-current` and *ceil* is
`.sheetsmith-pool-ceiling`. *Over* is how far the reading passes the content box
on either side: positive means clipped, because the card is `overflow: hidden`.

**The reported instance is a one-unit cell.** The original report came from an ad
hoc script. It forced a Pool to `grid-column: span 1` (one grid unit wide) at
`text=24`, with `100` in Temp. Reproduced here on `Hit points` (`6 / 9`, `temp:
100`), with its cell's `grid-column` overridden to `5 / span 1`. "One-column" in
the BACKLOG row means that. The reflowed one-column sheet does not overflow: at
`width=380`, at `text=24` and under `platform=phone`, every Pool has a 330px
content box and at least 87px to spare with `100 / 120`.

The overflow is in a **narrow placed cell**, from one to four units wide. A
one-unit Pool on a 1400px sheet has 90.5px of content. At a 520px sheet, a
one-unit Pool has 17.2px, a two-unit 58.3, a three-unit 99.5 and a four-unit
140.7. **The bug also exists at the default size**, and is not only a `text=24`
problem: a three-digit ceiling in a three-unit cell is clipped by 5 to 7px.

**Why it overflows.** The value field's `min-width: 4ch` is at the value size, so
it reserves 73.4px at the default size and 110.2px at `text=24`, whatever the
value holds. A `6` needs 18px at the default and 26.7px at `text=24`. That floor
alone is wider than a three-unit card at `text=24`. The ceiling is set in
`--font-ui-medium`, a UI token, so it stays the same size at any text setting
(15.6px for `/9`, 24.8 for `/54`, 34.0 for `/120`, 38.7 for a three-digit max the
character owns). Neither part can give way, because the row does not wrap and the
ceiling is `nowrap`.

Today, with the field at 73.4 (default size) or 110.2 (`text=24`):

| Condition | Cell | Content | Row | Value | Over, `6/9` | Over, `100/120` |
| --- | --- | --- | --- | --- | --- | --- |
| default, 1400 sheet | 3-unit | 319.5 | 317.5 | 73.4 | −114.3 | −105.0 |
| default, 520 sheet | 3-unit | 99.5 | 97.5 | 73.4 | −4.3 | **+5.0** (dot clipped) |
| default, 520 sheet | 3-unit, character max | 99.5 | 97.5 | 73.4 | −0.8 | **+7.3** |
| default, 520 sheet | 4-unit | 140.7 | 138.7 | 73.4 | −24.8 | −15.6 |
| `text=24`, 520 sheet | 3-unit | 99.5 | 97.5 | 110.2 | **+14.1** (dot clipped) | **+23.3** |
| `text=24`, 520 sheet | 4-unit | 140.7 | 138.7 | 110.2 | −6.5 | **+2.8** |
| `text=24`, one column (380) | full | 330.0 | 328.0 | 110.2 | −101.1 | −91.9 |
| `text=24`, phone (380) | full | 330.0 | 328.0 | 110.2 | −100.8 | −91.0 |

The one- and two-unit cells, measured today and under design A. Each Pool has
`100` in Temp. The cell is the `.sheetsmith-cell` width. The ceiling is 15.6 for
`/9` and 34.0 for `/120`.

| Condition | Cell | Content | Row | Value | Today | Under A |
| --- | --- | --- | --- | --- | --- | --- |
| **Reported**: `text=24`, 1400 sheet, 1-unit, `6/9` | 106.5 | 90.5 | 88.5 | today 110.2, A 55.1 | **+18.6** | one line, −8.9 |
| `text=24`, 1400 sheet, 1-unit, `100/9` | 106.5 | 90.5 | 88.5 | 110.2 / 80.1 | **+18.6** | wraps, −5.2 |
| `text=24`, 1400 sheet, 1-unit, `100/120` | 106.5 | 90.5 | 88.5 | 110.2 / 80.1 | **+27.8** | wraps, −5.2 |
| default, 1400 sheet, 1-unit, `6/9` | 106.5 | 90.5 | 88.5 | 73.4 / 36.7 | **+0.3** | one line, −18.1 |
| default, 1400 sheet, 1-unit, `100/120` | 106.5 | 90.5 | 88.5 | 73.4 / 53.8 | **+9.5** | wraps, −18.3 |
| `text=24`, 520 sheet, 2-unit, `100/120` | 74.3 | 58.3 | 56.3 | 110.2 / 56.3 (needs 80) | **+43.9** | wraps, fits, **clips `100` by 24px** |
| default, 520 sheet, 2-unit, `100/120` | 74.3 | 58.3 | 56.3 | 73.4 / 53.8 | **+25.5** | wraps, −2.3 |
| `text=24`, 520 sheet, 1-unit, any value | 33.2 | 17.2 | 15.2 | 110.2 / 55.1 | **+55.3 to +64.5** | wraps, **+19.0** |
| default, 520 sheet, 1-unit, any value | 33.2 | 17.2 | 15.2 | 73.4 / 36.7 | **+36.9 to +46.1** | wraps, **+9.8** |

**Under A, the reported instance fits.** Below the threshold the field drops from
110.2 to its `2ch` floor (55.1), and `6 / 9` stays on one line with 8.9px to
spare. A three-digit current wraps the ceiling under the number, and both lines
fit, at −5.2.

The temp pill is 79.4px wide in every case and fits a 1400-sheet one-unit card
(−5.6). The pill is the temp-pill row's concern, not this one.

What A does not fit is a 520px sheet's one- and two-unit cells:

- **One-unit at a 520 sheet.** With 17.2px of content, the cell is narrower than
  any single digit at the value size (36.7px at the default, 55.1 at `text=24`).
  The `2ch` floor beats `max-width: 100%`, so the field passes the card by 9.8 or
  19px. Nothing short of scaling fits it.
- **Two-unit at a 520 sheet, at `text=24`.** A three-digit number needs 80px and
  has 56.3. The field is capped at the row, so `100` is clipped by 24px inside
  its own box.

Four options were tried by injecting CSS, the design's final rules included, into the page. The figures are for a
three-unit cell at a 520px sheet (99.5 content), the hardest case that fits a
three-digit value at all:

| Option | default `6/9` | default `100/120` | `text=24` `6/9` | `text=24` `100/120` | Cost |
| --- | --- | --- | --- | --- | --- |
| **Wrap**: row `flex-wrap: wrap` | fits | wraps, fits | wraps, **+5.3** | wraps, **+5.3** | The `4ch` floor wins over `max-width`, so the field alone still overflows at `text=24`. |
| **Scale**: `font-size: clamp(1em, 38cqi − 14px, 1.75em)` | 23px, fits | 23px, fits | **24px**, fits | 24px, fits | At `text=24` the headline drops below the default size's 28px. It also falls out of step with Card's number on the same row. |
| **Narrow**: field `min-width: 0` | 18 wide, fits | 53.8, fits | 26.7, fits | **clips `100` by 18px** | The field shrinks under its own digits, so `100` reads `10`. |
| **The design** (below) | 36.7 (2ch), fits (−22.6) | 53.8, fits (−4.8) | 55.1 (2ch), fits (−13.4) | 80.1, **wraps**, fits (−9.7) | Wraps only where three digits over three digits cannot share a line. |

In the design, the four-unit cell at `text=24` takes `100/120` on one line
(−12.3). A wide card is unchanged in every condition: the field stays 73.4 or
110.2, and the row, the pill and the card heights are identical. A WebKit-shaped
fallback was simulated by turning off `field-sizing` and pinning `width: 4ch`.
There the design degrades to its smallest version: the field is capped at the
row, the ceiling wraps, and nothing is clipped (−1.0 in every case).

**Card has the same exposure, and it is out of scope here.** Card's number uses
the same `--sheetsmith-card-value-size` token. At `text=24` in a 520px sheet, a
three-digit `.sheetsmith-card-derived` (for example `Load`) passes its card's
content box by **10.8px** in a 74.3px card, and by **2.5px** in a 90.8px Card set
tile. `.sheetsmith-card-input` is `width: 100%`, so it clips instead. In a 94.9px
coin card, `100` needs 84px and has 77, so a digit is hidden with no mark. Both
fit at the default size and on the reflowed one-column sheet. This feature
records it as a BACKLOG row and does not fix it.

## What it does

A Pool's reading always fits its card. Where a narrow card has no room for the
number's usual four-character slot, the slot shrinks to the digits it holds. Where
even that cannot fit, as with three digits over three digits at a large text
size, the ceiling moves to a line under the number instead of running off the
edge. The number never shrinks. This includes the reported case, a one-unit Pool
on a wide sheet at `text=24`. The exception is a card narrower than the number
itself, a one- or two-unit cell on a 520px sheet. That is listed under
"Deliberately not doing" and stays a BACKLOG row.

## Smallest version

Let the row wrap, and cap the value field at the row: `min-width: min(4ch, 100%)`,
`max-width: 100%`, `flex-shrink: 0`. Nothing overflows anywhere. The cost is that
at `text=24`, every three-unit Pool stacks its reading, even `6 / 9`, which has
room for 70px more. At the default size, a three-unit Pool with a three-digit
ceiling (or with a two-digit max the character owns) stacks too. It needs no
container query and no threshold to keep in step. It is also exactly what the
design falls back to wherever `field-sizing` is unsupported.

## Design

**The design.** There are three rules, in this order of giving way:

1. **The slot gives way first.** Below a per-card container width, the value
   field's `4ch` floor drops to `2ch`. A single digit still gets a two-digit box,
   for two reasons. First, the hover and focus ring do not clamp onto one numeral.
   Second, `9 → 10` does not re-centre the reading. In Chromium the field is
   `field-sizing: content`, so above `2ch` it is as wide as its digits.
   - The threshold is where today's layout still fits a three-digit ceiling: `4ch`
     at the value size (4.6em on the card), plus three px parts. They are the
     reading's gap (`--size-2-1`, 2px), the widest three-digit ceiling (38.7px, a
     max the character owns with its padding), and the 2px the reading's row
     sits inside the card's content box. That is 42.7px, rounded up to 44.
   - It is written as `em` plus `px`:
     `@container (max-width: calc(4.6em + 44px))`. The value is in `em` and the
     ceiling is fixed-px chrome (`docs/UI.md` §5). A container query's `em`
     resolves on the Pool card, which is the query container. This was measured:
     the threshold is 118px at the default size and 154px at `text=24`.
   - Above the threshold nothing changes, so every Pool that fits today is
     pixel-identical.
   - **The override sits below the base rule in `sheet.css`.** `@container` adds
     no specificity, so the narrow rule and the base rule share
     `.sheetsmith-view .sheetsmith-pool-current.sheetsmith-pool-current` at
     (0,3,0), and the narrow rule wins on order alone (`docs/UI.md` §4, the
     repository's rule for every container step).
   - **The threshold is `em` plus `px` because of `docs/UI.md` §5.** A width that
     has to agree with fixed-px chrome is px. Here the sum has two parts. The
     value's `4ch` is in `em`, because the number scales with the sheet. The gap,
     the ceiling and the 2px row inset are in px, because they are UI-token
     chrome and box geometry the sheet's `em` does not reach.
2. **The ceiling gives way second.** `.sheetsmith-pool-reading` takes
   `flex-wrap: wrap` with no row gap. The row is already `justify-content: center`,
   so a wrapped ceiling sits centred under the number. It keeps its `/`, so it
   still reads as "of 120" rather than as a second number.
3. **The number never gives way.** The field takes `flex-shrink: 0`, so flex never
   squeezes it under its digits, and `max-width: 100%` for the engines with no
   `field-sizing`. There, `width: 4ch` is capped at the row and the ceiling wraps.
   The size stays `--sheetsmith-card-value-size`, so Card and Pool still match on
   a row.

The **dotted mark** (`.sheetsmith-pool-max-modified`) is a border on the numeral's
own span inside the `nowrap` ceiling. The `/` and the numeral therefore always
wrap together, and the rule stays under the numeral alone. At the 520px sheet the
mark is clipped today in both conditions, and it is inside the card under the
design in all of them.

The **temp pill** does not move wherever the reading stays on one line. Its offset
from the card top was measured identical before and after: 78.2 at the default
size, 82.2 at `text=24`, 93.0 under phone staging. Where the reading wraps, the
card grows by one line (14 to 19px) and everything below the reading moves down
with it, the pill included. That is the wrap itself, not a side effect. The grid
row grows with the card, as any taller cell's does.

**Rejected: scaling the number.** At `text=24` it puts the headline at 24px, below
the 28px of the default size, in precisely the setting a reader chose for larger
type. It also makes a Pool's number stop matching a Card's on the same row, which
is the reason the two share one token. SPEC §4.2 says "the number is the thing
being read", and the ceiling is the part "not worth the card's centre line"
(the max-input rule's comment). So the ceiling is what moves.

**What SPEC §4.2's reasoning keeps.** The comment above `.sheetsmith-pool-reading`
centres `12 / 54` as one reading. On one line, which is every case but the
narrowest, nothing changes. Wrapped, the two parts are still one centred group:
the number on the card's centre line, and the ceiling centred under it. Baseline
alignment then only applies within each line. That is an amendment, made
knowingly, and SPEC §4.2 gains a sentence for it (see the data section).

**An accepted trade-off: below the threshold, the number's box is elastic.**
`docs/UI.md` §9 refused `field-sizing: content` on a record's ceiling field,
because stepping `9 → 10` widened it and moved the line under a reader's finger.
Above the threshold A keeps today's `4ch` floor, so one to four digits hold still.
Below it, the field sizes to its content from a `2ch` floor. `9 → 10` still moves
nothing, but stepping `99 → 100` widens the number by one digit (about 27px at
`text=24`) and can wrap the ceiling onto a second line, which grows the card.

The owner accepts this:

- It happens only in a narrow card, and only at a digit-count boundary.
- SPEC already accepts the half-character shift of `99 → 100` on a centred
  reading.
- The only alternative that holds still is a fixed box. In a narrow card that is
  exactly the `4ch` floor this feature removes.

**`docs/UI.md` needs a line**, which the dev writes. It goes in §9, beside the
fixed-box ruling, so a reviewer does not report the value field against that
ruling. The line should say three things:

- The Pool's value field is fixed at `4ch` wherever it fits, and elastic from
  `2ch` only below its container threshold.
- Its movement on a stepped digit-count boundary is the accepted cost of fitting
  a narrow card.
- The ruling on fields in a summary line is unchanged.

There are no new interactions. The empty state (`—` in the field) and an absent
ceiling (no `.sheetsmith-pool-ceiling` at all) are unaffected: a field holding the
placeholder sizes to it, and with nothing to wrap, nothing wraps.

## Config fields

None.

## Data and file model

Nothing stored changes. CSS only, so Constraints 3 and 4 are untouched.

Docs:

- **SPEC §4.2 Pool**, after "The card divides into what the pool is and what
  changes it": one sentence saying that on a card too narrow for the reading, the
  number keeps its size and the ceiling wraps under it.
- **`docs/UI.md` §9**: the line described under the accepted trade-off.
- **BACKLOG § UI.** Both rows are under 575 characters with all four cells
  filled, as `src/backlog.test.ts` checks: 474 and 480 as written.
  - **Rewrite, do not retire**, "The Pool's ceiling overflows a one-column card at
    the largest text size". The reported instance fits under A. The row stays
    because the one- and two-unit cells on a 520px sheet still overflow:

    ```
    | The Pool's number overflows a one- or two-unit card on a narrow sheet | `styles/sheet.css` `.sheetsmith-pool-current` | At a 520px sheet a one-unit Pool has 17px of content, less than one digit (37px, 55 at `text=24`), and a two-unit one clips `100` at `text=24` (needs 80px, has 56). Wrapping the ceiling cannot help. The reported one-unit case on a wide sheet fits since `pool-headline-narrow-fit`. | a ruling on scaling a headline below its token in very narrow cells |
    ```

  - **Add** the Card row:

    ```
    | A Card's three-digit number passes or clips a narrow card at the largest text size | `styles/sheet.css` `.sheetsmith-card-derived`, `.sheetsmith-card-input` | At `text=24` on a 520px sheet a three-digit derived number passes a 74px card by 11px and a 91px Card set tile by 3px. A typed `100` in a 95px coin card needs 84px and has 77, so a digit hides with no mark. Found by `pool-headline-narrow-fit`. | a pass on Card's headline at narrow widths and the largest text setting |
    ```

## Acceptance criteria

- [x] In every condition below, every Pool's value field and ceiling lie inside
      the card's content box, and the value field's `scrollWidth` does not exceed
      its `clientWidth`, so no digit is clipped. The conditions are:
      - a 1400px sheet and a 520px sheet, each at the default size and at
        `text=24`
      - `width=380` at `text=24`
      - `platform=phone` at 380
      - values `6/9`, `10/54` and `100/120`, on calculated and character-owned
        ceilings
      - **the reported case**: a Pool forced to `grid-column: span 1` on the
        1400px sheet, at `text=24` and at the default size, with `100` in Temp
      - excluded and still overflowing, so printed but not failed: one-unit
        cells on a 520px sheet, and two-unit cells there at `text=24` (see
        "Deliberately not doing")
- [x] A Pool above the container threshold is unchanged. In the same
      conditions, its field width, row height, card height and temp-pill offset
      are identical before and after. Check against the "Today" table, the
      1400px rows, and the 380 and phone rows. Below the threshold the field
      narrows by design, to `2ch` or its digits, and the reading re-centres. Where
      that reading was on one line before and still is, its row height, card
      height and temp-pill offset are identical.
- [x] The ceiling wraps only where the number at its narrowed width and the
      ceiling cannot share a line. In the measured conditions that happens in
      three places outside the exclusions:
      - a three-unit cell on a 520px sheet at `text=24`, with three digits over
        three
      - a one-unit cell on the 1400px sheet, with a three-digit current
      - a two-unit cell on a 520px sheet at the default size, with a two- or
        three-digit ceiling (`10/54`: 36.7 + 2 + 24.8 is wider than 56.3)

      The excluded cells wrap too, at every reading.

      The reported `6 / 9` stays on one line (−8.9). When the ceiling wraps, it
      is centred under the number and keeps its `/`.
- [x] The dotted mark on a calculated ceiling is inside the card, and under the
      numeral alone, in every condition, wrapped or not.
- [x] The value stays at `--sheetsmith-card-value-size` everywhere. No rule scales
      it with the container.
- [x] With `field-sizing` turned off (simulated), nothing overflows and nothing
      clips.
- [x] `styles.test.ts` holds the rules a review cannot see:
      - `.sheetsmith-pool-reading` declares `flex-wrap: wrap`.
      - The value field's width rule declares `flex-shrink: 0` and `max-width: 100%`.
      - The container threshold is the `4ch` plus the gap, the ceiling and the
        row inset, written as `em` plus `px`. This follows the temp pill's
        arithmetic test (`pool-temp-refuses.md`).
      - The test asserts how many rules it matched, at least one per selector
        it checks, before it checks their declarations, so it cannot pass on
        nothing (PATTERNS §10, the `styles.test.ts` model).
      - The narrow `@container` rule comes after the base value-field rule in the
        built `styles.css`. It wins on order alone (UI §4).
- [x] `harness/measure-pool-headline.mjs`, after the model of
      `measure-groups.mjs`, runs the conditions above, prints each Pool's
      cell, content, row, field and ceiling widths, and exits non-zero on any
      overflow or clip outside the listed exclusions. It reproduces the reported
      case itself: it sets `Hit points`' cell `grid-column` to `5 / span 1` and
      its temp field to `100`, as this spec's scratch measurement did. Its output
      is pasted at the land stop.
- [x] `harness/samples.ts` gains a Pool in a three-unit cell with a three-digit
      **calculated** ceiling a modifier moves, so it carries the dotted mark, and
      a three-digit current. The sample has neither today: its calculated
      ceilings are `9`, `12` and two digits, and `Rolled HP` is `22`. The full-sheet
      frames in `shot.mjs` are re-measured if the sample grows a row, as that
      file's comment asks.
- [x] Harness PNGs, before and after, framed to the Pools. They show a two-digit
      ceiling (`Stamina reserve`), the new three-digit one, and the dotted mark
      on both. They are taken at:
      - default size, 1400 sheet
      - default size, 520 sheet
      - `text=24`, 520 sheet
      - `text=24`, `width=380` (one column)
      - `platform=phone`, 380
      - **the reported case**: a one-unit Pool on the 1400px sheet at `text=24`,
        with `100` in Temp, once with `6 / 9` and once with a three-digit
        current

      The reflowed column is the 380 pair. Before shots are taken with the
      harness changes in place and built (the sample, `&place=` and these
      views), and with `styles.css` as it was on the version branch. In this
      build that meant shooting before `src/styles/sheet.css` was first edited.
      The harness reads `styles.css` alone, so restoring that one file
      (`git show HEAD:styles.css > styles.css`) gives the same before for a
      later re-shoot or re-measure. These are new `shot.mjs` views,
      `pool-headline-*`, using `frame=`. The one-unit view needs a placement the harness cannot ask for
      today. Either add a one-unit Pool to the sample, or add a harness query that
      re-spans a named cell. The dev chooses, and the frame re-measure rule above
      applies to either.

## Commit boundaries

1. `fix: Let a narrow pool's ceiling wrap under its number`. Contains the
   `src/styles/sheet.css` rules, the regenerated `styles.css`, and the
   `src/styles.test.ts` guards.
2. `test: Stage a three-digit pool ceiling and its headline shots`. Contains
   `harness/samples.ts`, the `pool-headline-*` views and any frame re-measure in
   `harness/shot.mjs`, `harness/measure-pool-headline.mjs`, and whatever the
   one-unit view needed (a sample or a harness query).
3. `docs: Record how a pool's reading fits a narrow card`. Contains:
   - this doc
   - the SPEC §4.2 sentence
   - the `docs/UI.md` §9 line
   - the Pool BACKLOG row, rewritten to the one- and two-unit residue
   - the Card BACKLOG row, added

## Deliberately not doing

- **Card's exposure** at narrow widths and `text=24`, measured above. It gets its
  own BACKLOG row.
- **A Pool narrower than its own number**, on a 520px sheet. Only scaling could
  answer either case, and this spec rejects scaling. Both stay in the rewritten
  BACKLOG row.
  - **A one-unit cell** has 17.2px of content, less than one digit at the value
    size (36.7px at the default, 55.1 at `text=24`). Under A the field passes the
    card by 9.8 or 19px, against today's 37 to 65. A three-digit `100` also clips
    inside the field, by 17px at the default and 25px at `text=24`. There
    `max-width: 100%` caps the field at a row narrower than `2ch`, the `2ch`
    floor wins over the cap, and the field stays two digits wide.
  - **A two-unit cell** at `text=24` has 58.3px of content, and `100` needs
    80px. Under A the field is capped at the row and the digits clip by 24px,
    against today's +43.9 overflow.
- The temp pill not growing with the text setting (its own BACKLOG row).
- The 24px resize corner row.
- The WebKit select, Passport chip and empty card select rows.
- Any change to the Adjust control or the steppers.
