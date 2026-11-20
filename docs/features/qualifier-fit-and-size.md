# Qualifier fit and size

Status: shipped (approved by the owner at the land stop, 2026-11-20)
Board card: six rows of `docs/BACKLOG.md` § UI — "A one-unit Pool's ceiling
passes its card on a narrow sheet", "The own-value pill under a one-unit card's
number draws empty", "The form tag holds its fixed size at a larger sheet size,
and a Stat block's content holds its own", "A card's note, its abbreviation and
a Pool's *Temp* hold `--font-ui-smaller` at a larger sheet size", "A wrapped
temporary-points pill reads as a loose two-line box", "A typed Pool ceiling sits
8px from its slash, a calculated one 3px"

Route: standard. Two of the six were questions, and the owner has ruled on both
(A and B below) from `harness/measure-qualifier-rulings.mjs`, which stays as the
record of what was put to them.

## Model question

None. Every change is how a value is drawn; nothing stored, published or
resolved moves, and no note is touched.

## What it does

A typed Pool ceiling sits as close to its slash as a calculated one. A one-unit
Card's own-value pill shows its digit instead of drawing empty. A wrapped
*Temp* pill reads as a word over its value rather than a loose box. And the two
rulings, on a qualifier in a cell narrower than itself and on a placed box's
content at a larger sheet size, are written down where the next reviewer looks.

## Smallest version

Rows 6, 1, 2 and 5 in CSS, rows 3 and 4 and both rulings as records. This is
the version the owner approved. Row 4 is held as Ruling C, not built: of the six
it is the only change with a measured cost, and at the app's own 15px sheet it
would draw nothing different.

## The rulings

**Ruling A (rows 1 and 2): in a cell narrower than itself, a qualifier's padding
gives way first, then the qualifier overflows to its card's inner edge and
clips at its end, or clips where it is a field; the slash is never the part
cut, and it is never marked and never hidden.** The ceiling overflows to the
card's edge, where the Pool clips it; the own-value pill is an input, so its
digits clip inside it. *Amended by the owner at the land stop:* the ruling as
first written said only "overflows", and a centred `/120` overflowed both ends
of a one-unit cell, so the Pool's clip cut its slash first and at `text=24` it
read as a bare `120` under the marked number, which a player reads as their
hit points (row 1 below, "Safe centring"). Measured: the mark `⋯` is 15.9px at the default size and 22.9 at
`text=24`, against one digit's 9.8 and 14.7, so a mark never shows where a
digit cannot; and hiding removes a value the player edits.

**Ruling B (row 3): kept as is.** The form tag stays px and a Stat block's
content stays px. Measured: in `em` the tag fails `measure-form-tag.mjs`'s
gap-left ≥ 3 at every size and overlaps the next box by 4.2px at `text=24`; the
Stat block would scroll 89px at 520 / `text=24`; and at the app's 15px sheet
`em` is px anyway. No code.

**Ruling C (row 4): held.** The heading and its rank stay the app's fixed size;
a larger sheet grows values, not labels. A card's note, its abbreviation and a
Pool's *Temp* stay at `--font-ui-smaller` beside the heading. The cost of moving
them is under Deliberately not doing. No code.

## Design

### Row 6, then row 1: the typed ceiling's padding (smallest version)

`.sheetsmith-view .sheetsmith-pool-ceiling .sheetsmith-pool-max-input` takes
`padding-inline: 1px`, and its non-field-sizing `width` and `min-width` take
`2px` in place of `2 * var(--size-2-2)`. **Scoped under `.sheetsmith-pool-ceiling`**: a Track
row's length field wears `.sheetsmith-pool-max-input` too and keeps its
padding. A record's ceiling (`record-controls.ts`) borrows the ceiling's
spans and deliberately not that class, so the trim cannot reach it either.
*As built*, the 1px is one custom property, `--sheetsmith-pool-max-pad`,
which the padding and both fallback widths read, so the width cannot keep
counting a padding that has moved; the fallback widths sit in an
`@supports not (field-sizing: content)` block at (0,4,0), since a plain rule
would override the field-sizing `1ch` floor and tie with the doubled width
rule it narrows.

Measured (`measure-qualifier-rulings.mjs a`, 520 sheet, Rolled HP at one unit):

| | default `/9` | default `/120` | `text=24` `/120` | slash → digits |
| --- | --- | --- | --- | --- |
| today, 4px | 23.6, field 17.2x18 | 42.0, over 13.4 | 53.4, over 19.1 | 6 |
| **1px, chosen** | 17.6, field 11.2x18 | 36.0, over 10.4 | 47.4, over 16.1 | **3** |
| 0 | 15.8, field 9.4x18 | 34.0, over 9.4 | 45.4, over 15.1 | 2, as calculated |

1px keeps a pixel of room between the digits and the hover fill and focus ring,
and leaves the typed ceiling 1px further from its slash than a calculated one
(3 against 2), against 6 today. A typed ceiling is then 2px wider than a
calculated one with the same digits, so row 1's residue has two figures.

**The narrow-fit threshold is re-derived in the same rule.** Its px term counted
the reading's 2px gap, the row's 2px inset and the ceiling's 10px of padding and
gap, 14, rounded up to 20 for the app regime. The 10 becomes 4 (2px of
padding and the 2px slash gap), so 8, rounded up by the same 6px:
**`@container (max-width: calc(6.4em + 14px))`**. The `6.4em` stands: its `/120`
term (43.4px at `text=24`) was already the ceiling less its padding. The
measurement found no harness Pool between `+ 20px` and `+ 12px`, and `+ 14px`
falls inside that band, so no Pool changes regime; the build re-runs the check
to confirm it. The comment at the rule is
rewritten with the new sum.

*As built, approved by the owner at the land stop:* no Pool changes
regime, but one changes height. At 520 and `text=24` the trimmed ceiling
brings Rolled HP's `/22` back onto its number's line in its three-unit cell,
so its card goes from 157 to 139.9px, and Reservoir, which shares those grid
rows through the cells spanning them, from 159 to 161. That is the trim doing
what it is for, not the pill, and nowhere else does any Pool move;
`measure-pool-headline.mjs` check 14 names the two as `moved` and fails any
other.

**Touch, against `docs/UI.md` §7.** A one-digit typed ceiling becomes 11.2x18 at
the default size; it was already 17.2x18, under §7's 20px on height. §7's 20px
floor is the rule for *a field inside a row* (Track, Table). A Pool's ceiling is
not in a row: the card is its target, through the Pool's nearest-field router
(`pool.ts`, the press handler that focuses the field nearest the press), which
§7's own first bullet asks for. So the field's box is not the target, and §7
gains one sentence saying so. The rule's comment is rewritten to say the gap
now nearly matches a calculated ceiling's and that 1px is the room the ring
keeps.

*As built, approved by the owner at the land stop:* **the focus ring
is drawn half inside the field**, `inset 0 0 0 1px` with `0 0 0 1px` in the
accent, still 2px of it, rather than the shared 2px wholly outside. The
build's shot of a focused typed ceiling at `text=24` showed the outside ring
meeting the slash: with 2px between the slash's box and the field's, a ring
2px outside the field ends on the slash's box, and the slash's ink leans
0.2px past its advance at the default size and 0.4 at `text=24`, so the ring
covered its tip, against the criterion that it stand clear. Half inside, it
stands 1px clear of the slash's box and lies over the 1px padding, inside the
digits' side bearings. The cost is that this one field's ring is not
`.sheetsmith-pool-max-input`'s shared shape, though it is the same width and
colour; §7 says so beside its ceiling sentence. Forced colors drops the
shadow and draws the shared transparent outline, wholly outside, which met
the slash the same way in `pool-ceiling-large-1400-owned-focused-forced-colors`,
so the outline moves in by 1px too (`outline-offset: -1px`). While the
focused number is selected it then runs into the selection's fill, with no
1px gap between, so the focus reads as one filled box there. Both rings were
approved as built.

**Row 1: safe centring** (added by the owner at the land stop). The trim is
the padding giving way; what is left overflows per Ruling A. As first built
that was all of row 1, and the design review's shot of Rolled HP at one unit
with `120` typed showed what plain centring does with it: the wrapped ceiling
overflowed both ends of its line, the Pool's `overflow: hidden` clipped both,
and at `text=24` none of the slash was left (a calculated one the same), so
the cell read `120` under the number's mark. So `.sheetsmith-pool-reading`
takes `justify-content: safe center` after a plain `justify-content: center`:
`safe` aligns an item that overflows its line to the line's start, so the
ceiling starts at the content's start and clips only at its end, and
wherever it fits `safe center` is `center`. The Pool keeps its clip, for the
bar's corners its comment names.

- **`overflow: clip`, not `hidden`** (the owner's second land-stop answer).
  The design review's shots of the one-unit cell were scrolled, not only
  clipped: `&type=` focuses the typed ceiling, and as `hidden` the card was a
  scroll container, so the focus scrolled it 13px sideways at the default
  size and 27 at `text=24` to the caret and left it there after the blur,
  cutting the slash again until the next rebuild. A player's edit does the
  same. `clip` cuts at the same edge, so the bar keeps its square ends inside
  the rounded corners and nothing spills, but makes no scroll container.
  Support (MDN, `css.properties.overflow`, `clip`): Chrome and Android
  WebView 90, Firefox 81, Safari and iOS Safari 16; `overflow: hidden` is
  declared first, so an iOS before 16 keeps the old clip and its scroll.
  Measured: all 65 `pool-ceiling-*` and `headline-narrow-*` shots match the
  `hidden` build pixel for pixel, and the `pool-ceiling-one-*` views match
  without the `&scrollx=` they had needed, which is removed; the steppers'
  hit regions are identical under both (259 points inside the card, none
  outside, by `elementFromPoint` along every step button). Check 16 in
  `measure-pool-headline.mjs` types into the one-unit ceiling and fails if
  the card is left scrolled, and proves itself by finding the 13 and 27px
  scroll with `hidden` put back; `styles.test.ts` holds `hidden` then `clip`.

- **Support.** MDN's compatibility data (`css.properties.justify-content`,
  `safe`): Chrome and Android WebView 115, Firefox 63, Safari and iOS Safari
  17.6; Chromium before 115 parses the value and ignores it. Obsidian's
  desktop and Android shells are current Chromium; on iOS the WebView is the
  system's, so an iOS before 17.6 drops the declaration and keeps the plain
  `center` before it, which is today's drawing, the slash cut. No fallback
  that holds on those was found that leaves a fitting reading untouched: auto
  margins centre a lone ceiling safely but space the number and ceiling
  apart on one line. The directory's browser-support check could not be run
  here; if it flags `safe`, the two-declaration form is what a reply cites.
- **Measured** (`measure-pool-headline.mjs` check 11, one-unit `/120` on 520):
  the ceiling draws 23.2px, from the content's start to the border's inner
  edge, its slash's ink whole, calculated and typed, default and `text=24`.
  What is read is `/1` and 0.8 of the `2` at the default size (0.7 typed), and
  `/1` and 0.2 of the `2` at `text=24` (0.1 typed): the second digit is not
  half cut but nearly gone there, so the cell reads `/1` and a sliver, which
  says "of something" rather than giving a wrong number. Every ceiling that
  fits its line draws where plain centring draws it, at 1400 and 520, both
  sizes (check 10, against `center` put back over the built stylesheet).
- **Guarded** in `styles.test.ts`: the reading declares `center` then
  `safe center`, in that order.

The BACKLOG row is rewritten to that residue (below).

### Row 2: the own-value pill gives up its padding (smallest version)

One container query on the card (`.sheetsmith-card` is already the container):
in a card too narrow for the pill's chrome beside three digits, the pill
(`.sheetsmith-card-has-derived .sheetsmith-card-value`) and its field
(`.sheetsmith-card-input`) take `padding-inline: 0`. CSS only. The threshold is
written as the Pool's is, `em` plus px, derived in its comment: the chrome is
22px (16 of pill padding, 2 of border, 4 of field padding) and three digits at
`--sheetsmith-qualifier-small` are about 1.7em (1.68 measured), so
**`@container (max-width: calc(1.7em + 22px))` of the card's content box**,
49.2px at the default size and 62.8 at `text=24`, rounded up to never
undercount. Block padding is kept, so no card changes height.

*Corrected in the build:* this said `calc(1.7em + 40px)` "of the card", 67 and
80px, which is the card's border box. A container query measures the
container's content box, so read that way it would have caught a Card set
tile (72.8px of content at 520) at `text=24` and broken the criterion that
tiles keep their width; `styles.test.ts` now derives the 22px from the base
rules' tokens.

Measured (one-unit Load and Carried, 520 sheet): the field's inner width goes
from −4 to 13px. A one-digit value fits at the default size (9.8 in 13); two
digits at the default, and any digit at `text=24` (14.7), clip. Card set tiles
(90px floor, 72.8px of content at 520) and every wider card are above the
threshold and unchanged. It also reaches a two-unit Carried at `text=24`
(56.3px of content), where `100` clips today (40.3 in 30) and fits without
the chrome (in 54).

### Row 5: a wrapped *Temp* pill closes up (smallest version)

The loose gap is the field's box, the app's fixed 30px input height, centring
digits well below the word. The field (`.sheetsmith-pool-temp-input`, at its
(0,3,0) width rule) takes `height: auto`; the pill takes
`min-height: calc(var(--input-height) + 2px)` and `align-content: center`, and
no row gap (`gap: 0 var(--size-2-1)`), so a pill on one line is exactly
today's 32px and only a wrapped one changes.

*Added in the build:* the row gap. With `height: auto` and the floor alone the
live pill was 39px tall wrapped and *Temp* sat 10px of ink from its value at
`text=24`, against 5.5 above the word, outside the 3px the criterion allows;
the 2px row gap was the difference. Without it the figures below are the
built ones, and it follows the Pool reading's own rule that its two lines are
one qualifier and take no row gap.

Measured on today's sizes (Hit points at two units, 520 sheet, ink to ink).
With row 4 held, these sizes are the ones that ship:

| | above *Temp* | *Temp* → value | pill | card |
| --- | --- | --- | --- | --- |
| default, today | 5.5 | 13 | 56.3x49 | 190.4 |
| default, this | 5.5 | **6** | 56.3x37 | 178.4 |
| `text=24`, today | 5.5 | 11 | 56.3x49 | 217.6 |
| `text=24`, this | 5.5 | **8** | 56.3x45 | 213.6 |

The field is 20px tall at the default, §7's floor, 28 at `text=24`. Unwrapped
pills and their cards are unchanged at both widths.

## Config fields

None.

## Data and file model

Nothing stored changes. No note is read or written differently.

## Records

**`docs/UI.md` §5**, the qualifier paragraph: Ruling A in the words "in a cell
narrower than itself, a qualifier's padding gives way, then the qualifier
overflows to its card's inner edge and clips at its end, or clips where it is
a field; the slash is never the part cut, and it is never marked and never
hidden", with the safe centring and why. The measurement goes with it, and
so do the residues:
- a one-unit `/120` draws 23.2px, from the content's start to the card's
  inner edge, its slash whole: `/1` and most of the `2` at the default size,
  `/1` and a sliver of it at `text=24`;

*Corrected twice:* this list, §5 and the BACKLOG row first said the ceiling
"passes the card" by its box's 9.4 and 10.4px a side (15.1 and 16.1 at
`text=24`). The design review found that is the box: the Pool's
`overflow: hidden` clipped a centred ceiling at both ends, slash first, and at
`text=24` it read `120` (`measure-pool-headline.mjs` check 11's `drawn` line,
added then). The owner then ruled the clip should cut the end and never the
slash, which the safe centring builds, and the records describe that.
- in a one-unit cell the pill clips two digits at the default size, and any
  digit at `text=24`.

Beside the px-chrome rule: Ruling B, with its three measurements. The sentence
"The words ranked with the card's heading … stay at the heading's fixed size
until it moves" becomes Ruling C: "the heading and its rank stay the app's fixed
size; a larger sheet grows values, not labels", with row 4's measured cost.

**`docs/UI.md` §7**, the field-in-a-row bullet: one sentence, a Pool's ceiling
is reached through the card's router, so §7's floor is not its box's, and
one more, added in the build: its focus ring is the one drawn half inside its
box (row 6, "As built").

**`docs/UI.md` §9**: "A headline that does not fit" gains "a qualifier beside or
under it is not marked: its padding gives way, then the qualifier overflows to
its card's inner edge and clips at its end, or clips where it is a field, its
slash never the part cut (§5)". "A value
a form in play changed" and "A box sized by its placement" each gain Ruling B in
a clause.

**`docs/features/pool-headline-narrow-fit.md`**, added in the build: Design
step 1 gains a dated *Since amended again* line naming this doc and the
`+ 14px` threshold, and its "It is written as" bullet states `+ 14px` as the
current value, `+ 20px` as the one before, with the new measurements, so a
reader of that doc alone does not take `+ 20px` for what ships.

**`tokens.css`**: `--sheetsmith-qualifier-small`'s comment has an "A value, not a
label" paragraph that names the BACKLOG row. It points at §5's Ruling C instead.
This is a comment edit and no value changes.

**`docs/BACKLOG.md` § UI**: rows 2, 5 and 6 leave, fixed. Rows 3 and 4 leave as
held rulings, recorded in §5 as Rulings B and C. Row 1 is rewritten to its
residue:

> | A one-unit Pool's ceiling is clipped at its card's edge | `styles/sheet.css` `.sheetsmith-pool-reading`, `.sheetsmith-pool` `overflow: clip` | Ruled (`docs/UI.md` §5): padding gives way, then it overflows to the card's inner edge and clips at its end, slash kept. In a one-unit cell on a 520px sheet a `/120` draws 23.2px from the content's start: `/1` and most of the `2` at the default size, `/1` and a sliver of it at `text=24`. | a real layout placing a Pool whose ceiling is two digits or more at one unit |

(As first written it said the ceiling "passes the card" by the box's figures;
corrected twice, above.)

**And a residue row for the *Temp* pill, held by the owner at the land stop.**
The design review found a one-unit Pool's points pill drawing its value
empty, from before this branch and none of its six rows, but against Ruling A
as now written. Building the fix would add a surface, so the owner held it:

> | A one-unit Pool's *Temp* pill draws its value empty | `styles/sheet.css` `.sheetsmith-pool-temp`, `.sheetsmith-pool-temp-input` | On a 520px sheet the pill's 18px of inline chrome passes a one-unit cell's 15.2px of content, so its field shrinks to its own padding and `3` draws as an empty capsule, against `docs/UI.md` §5's never-hidden ruling; *Temp* is clipped 1.8px a side. Dropping the pill's and field's inline padding and margin shows one digit at the default size (9.7 in 13px), none at `text=24`. | a real layout placing a Pool with temporary points at one unit |

**And a residue row for the pill, proposed**, since a clipped `10` can read `1`
with no mark, which is worse than the overflow the ceiling is left with:

> | A one-unit Card's own-value pill clips two digits | `styles/sheet.css` `.sheetsmith-card-has-derived .sheetsmith-card-value` | Ruled (`docs/UI.md` §5): padding gives way, then a field clips, never marked. Without it the field has 13px in a one-unit cell on a 520px sheet: one digit fits at the default size, two (16.9px) clip, and at `text=24` one (14.7) does, with no mark, so `10` can read `1`. | a real layout placing a derived Card at one unit on a sheet under about 600px |

## Acceptance criteria

Measured on the built harness. `measure-pool-headline.mjs` is the one that
fails, so the new checks go there; `measure-qualifier-rulings.mjs` stays a
printout of the rulings and is not extended. Views: `surface=sheet` at 1400 and
`width=520`, default and `text=24`, with
`&place=hit_points:5,1&place=rolled_health:10,1&place=load:11,1` for one-unit
cells and `&place=hit_points:5,2` for the wrapped pill; `state=forms` for row 3.

- [x] A typed ceiling's slash → digits gap is 3px, against a calculated one's 2,
      at default and `text=24`, 520 and 1400 (`measure-pool-headline.mjs`, new check).
- [x] At one unit on 520, a typed ceiling is 2px wider than a calculated one with
      the same digits. `/120` starts at the content's start and its box passes
      the content at its end only, by at most 18.8 calculated and 20.8 typed at
      the default size, 30.2 and 32.3 at `text=24` (the residue line,
      re-bounded); the slash's ink is whole inside the card's clip in all four
      (fails otherwise), and the `drawn` line prints what renders and how many
      digits are read.
- [x] Every ceiling that fits its line draws where plain `center` draws it,
      at 1400 and 520, both sizes (check 10), and `styles.test.ts` holds the
      reading's `center` then `safe center`.
- [x] A Track row's length field keeps its inline padding, and a record's
      ceiling, which does not wear the class, is untouched (`styles.test.ts`:
      every rule reading the trim is under `.sheetsmith-pool-ceiling`).
- [x] `styles.test.ts` reads the threshold as `calc(6.4em + 14px)`, and
      `measure-pool-headline.mjs` passes with no Pool changing regime.
- [x] A one-unit Load at 520, default, shows `0` whole in its pill; the pill is
      inside the card (over 0), and no card's height changes
      (`measure-pool-headline.mjs`, new check).
- [x] A two-unit Carried at 520, `text=24`, shows `100` whole.
- [x] Every Card, Card set tile and Roster score pill at 1400, and every Card set
      tile at 520, has today's pill width at both sizes.
- [x] A wrapped *Temp* pill's *Temp* → value gap (ink) is within 3px of the
      padding above *Temp*, at default and `text=24` (new check).
- [x] An unwrapped *Temp* pill is 32px tall and every unwrapped Pool's height is
      unchanged, at 1400 and 520, both sizes. **One exception, approved by the
      owner at the land stop** (row 6, "As built"): at 520 and `text=24` Rolled HP
      157 → 139.9px and Reservoir 159 → 161, from the trimmed ceiling
      unwrapping; check 14 prints them as `moved` and counts them in its
      summary.
- [x] The temporary-points field is at least 20px tall at the default size.
- [x] `measure-form-tag.mjs` passes unchanged (Ruling B, no code).
- [x] The land-stop PNGs show a typed ceiling focused at `text=24`, with its
      focus ring drawn whole around the digits and clear of the slash
      (`pool-ceiling-large-{1400,520}-owned-focused`, and `-forced-colors`),
      and a one-unit `/120` keeping its slash (`pool-ceiling-one-{default,large}-520-owned`).
- [x] `docs/UI.md` §5, §7 and §9 and `docs/BACKLOG.md` carry the records above;
      `src/backlog.test.ts` passes.

Look at, both themes: the 520 one-unit view and the wrapped pill at default and
`text=24`, focused and hovered (`&focus=` on a typed ceiling), and 1400 at both
sizes for anything that moved that should not have.

## Commit boundaries

1. `test: Measure the qualifier rulings in a narrow cell and at a larger size`.
   `harness/measure-qualifier-rulings.mjs` as it stands.
2. `fix: Set a typed pool ceiling as close to its slash as a calculated one`.
   The 1px trim, the threshold to `+ 14px` with its comment, the half-inside
   focus ring, `styles.test.ts`, the new `measure-pool-headline.mjs` checks
   and the residue bound.
3. `fix: Keep an overflowing pool ceiling's slash in a narrow card`. The
   reading's `safe center` and the Pool's `overflow: clip`, their
   `styles.test.ts` guards, check 11's slash, check 10's fitting-ceiling
   comparison, check 16's stuck scroll, and the one-unit shot views.
4. `fix: Let a narrow card's own-value pill give up its padding`. The container
   query, its checks.
5. `fix: Close up a wrapped temporary-points pill`. The field and pill rules,
   its checks.
6. `chore: Let a shot run pick default views by name`. `harness/shot.mjs`'s
   `only=` filter alone, its own commit by the owner's ruling; the shot views
   it was first used for go with commits 2 and 3.
7. `docs: Record how a qualifier gives way and what holds its size`. UI.md §5,
   §7, §9 (Rulings A, B and C), the `tokens.css` comment, BACKLOG rows out and
   the three residue rows, and `pool-headline-narrow-fit.md`'s amendment.

## Deliberately not doing

- **A phone floor on any qualifier field.** Withdrawn
  (`docs/features/qualifier-input-phone-floor.md`); the ceiling's 16px guard
  stays as it is.
- **Marking or hiding a qualifier.** Ruling A.
- **The one-unit *Temp* pill's empty value.** Held by the owner at the land
  stop: a BACKLOG § UI residue row (Records), not built, since it would add
  a surface.
- **Letting a ceiling draw past the Pool's card.** The owner kept the clip,
  which holds the bar's square ends inside the card's rounded corners, and
  the safe centring makes it cut the end, not the slash; the clip is now
  `overflow: clip` rather than `hidden` (row 1), the same cut with no scroll
  container.
- **The form tag or a Stat block's content in `em`.** Ruling B.
- **A heading token that grows the heading and its rank with the sheet** (row 4;
  Ruling C). The design was a new `tokens.css` token,
  `max(var(--font-ui-smaller), calc(12em / 15))`. It would size every
  `.sheetsmith-component-label`, a card's note, *Temp*, and the abbreviation at
  0.85 of it, with `--sheetsmith-card-abbr-space` derived from the token.
  It is held because of what it measured. At `text=24` the heading goes from 12
  to 19.2px. Of 101 labels, the number cut off goes from 0 to 8 at 1400 (the
  five ability modifiers, Passive perception, Electrum and Platinum) and from 21
  to 53 at 520, all six ability names among them. The sheet grows 164px at 1400
  and 258px at 520. At the app's 15px sheet nothing would change.
- **The Card set 3 + 1 wrap**, **the Roster card strip's state floor**, and
  **every editor-pane row** in BACKLOG § UI: separate rows, untouched.
- Fitting a one-unit cell on a 520 sheet fully: the residue rows are the record.
