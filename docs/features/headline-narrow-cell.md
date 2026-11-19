# Headline narrow cell

Status: shipped (approved by the owner at the land stop, 2026-11-19)
Board card: two `docs/BACKLOG.md` § UI rows, "The Pool's number overflows a one- or two-unit card on a narrow sheet" and "A Card's three-digit number passes or clips a narrow card at the largest text size"

Route: standard. The mechanism is already in the repository: every card is its
own query container (`.sheetsmith-card` and `.sheetsmith-pool` carry
`container-type: inline-size`), the Pool's slot already gives way under a
container threshold (`docs/features/pool-headline-narrow-fit.md`), and a
derived number already opens the shared popover on a press (`card-face.ts`).

## Model question

**SPEC §13, "What a card's headline number does in a cell narrower than the
number", settled by the owner before this spec**, and its `Resolved:` paragraph is
already in the working tree's `docs/SPEC.md`. This spec does not reopen it:
**(a) shrink to a floor, then (b) mark and reveal below it; (c), a warning in the
layout editor, rejected.** What follows is the design that ruling asks for, and the
measurements that set its numbers.

Nothing the plugin stores, publishes or resolves changes. A component's contract
does not grow: the headline's size is CSS, and the fit check is a view pass over
elements a component stamps, the way the form tint already is
(`view/placement-decorations.ts`).

**This reverses `docs/features/pool-headline-narrow-fit.md`'s "the number never
shrinks".** That spec rejected scaling because at `text=24` a scaled headline
fell below the default size's 28px in the setting chosen for larger type, and
because a Pool's number would stop matching a Card's on the same row. Both
objections are answered rather than overruled. The size here is a function of the
card's width alone, through one token Card and Pool share, so two cards of one
width still draw one size. And the size only drops where the full-size number
already does not fit, where the choice is between a smaller number and a number
that cannot be read at all. What stays of that feature, unchanged and still the
first to give way, is below under "What stays of the Pool's narrow fit".

## What was measured

Everything below was measured over the DevTools Protocol against the built
harness (`state=populated`), with values injected into the page and candidate
rules injected as a stylesheet, as the prior spec did. The scratch script drove
the same conditions as `harness/measure-pool-headline.mjs` and added Card cells.
All widths are px. *Content* is the card's content box, which is also what `cqi`
resolves against: a probe at `100cqi` inside each card measured exactly its
content width in every condition. *Over* is how far the number passes that box
(positive passes the card). *Clip* is `scrollWidth − clientWidth` on the
number's own box (positive hides digits).

The one-unit cell on a 520px sheet measures **15.2px** of content on this branch,
not the 17.2 the BACKLOG row records: the shipped script prints 15.2 for it too.

### The qualifiers the floor has to clear

The ruling puts the floor above every qualifier on the same card. Measured on a
Card (`.sheetsmith-card`) in each condition:

| Condition | Sheet `em` | Ceiling (`--font-ui-medium`) | Own-value pill (`--sheetsmith-qualifier-small`) | Pool temp (pill, capped at the ceiling) | Headline cap (`1.75em`) | **Floor** |
| --- | --- | --- | --- | --- | --- | --- |
| default | 16 | 15 | 13.9 | 13.9 | 28 | **18.67** (18.0 by the step) |
| `text=20` | 20 | 15 | 17.3 | 15 | 35 | **20.8** |
| `text=24` | 24 | 15 | 20.8 | 15 | 42 | **25.0** |
| `text=32` (200%) | 32 | 15 | 27.7 | 15 | 56 | **33.3** |
| `platform=phone` | 16 | 16 | 15 | 15 | 28 | **19.2** |

**The floor is `1.2 × max(--font-ui-medium, --sheetsmith-qualifier-small)`.** The
Pool's temporary points are `min(qualifier, ceiling)`, so the larger of those two
tokens is the largest qualifier any card carries, and 1.2 is one step of a
minor-third scale above it: the smallest ratio that reads as a rank rather than as
two near sizes. **It is never under 18.67px** (14pt), the size at which bold
text is large text and needs 3:1 rather than 4.5:1: a Pool's number in its over
state is `--interactive-accent`, about 3.2 to 3.9:1 on the card, and at the 18px
the step gives at the default size it fell into the 4.5:1 band (amended in the
design review, 2026-11-18). That moves the default floor alone; every other row
is above it. Above 16px too, so a field at the floor never zooms iOS on tap.

**Rejected: the app's own one step, 15/13.** It is the ratio from
`--font-ui-small` to `--font-ui-medium`, which made it the obvious derivation.
But the qualifier token is `13em / 15` of the sheet, so 15/13 of it is exactly
`1em`: above 17.3px the floor became the sheet's own `1em` (24.0 at `text=24`),
which is the floor the ruling refuses, and on a phone it sat 2.5px over a 16px
ceiling.

### The size line

The capacity is **three digits**. A Card's or Pool's headline is a hit total,
an armour class, a score or a bonus far more often than not, and the prior spec
fitted the Pool's reading around `100 / 120`. A three-digit number at the bold
tabular headline measured **1.921em** (53.8px at 28, 80.1 at 42), and a Card's
field adds 2px of padding a side. So a headline holding three digits fits a
content box `C` while `1.921 s + 4 ≤ C`, and the largest such size is
`(C − 4) / 1.921 = 52.05cqi − 2.08px`.

**The headline size is `clamp(floor, calc(52cqi - 2px), 1.75em)`.** Above the
width where three full-size digits fit (57.7px of content at the default size,
84.6 at `text=24`) it is the token's `1.75em`, unchanged. Below it, it follows the
line to the floor.

**Why the middle term has no `em`.** The ruling asks for a size anchored in `em`
with a container term, and this one is: both of its bounds are `em`, the cap
directly and the floor through the qualifier token, so a larger sheet size moves
the cap, the floor and the width at which shrinking starts. But the line between
them is the size at which three digits fit, and that does not depend on the text
size: written as `1.75em` less a slope times the distance below the starting
width, the `em` terms cancel exactly. Any `em` added to it is, by construction, a
size at which the three digits it was drawn for no longer fit, so those would be
marked instead. **Settled with the owner on 2026-11-18**: the `em` floor at 1.2×
the qualifiers and the `em` cap carry the ruling's intent, and the measured clips
below settle the wording. Measured for `calc(0.5em + 39cqi)` at `text=24` on the 520
sheet: the coin card (76.9) draws 42px and still hides `100` by 7px, a Card set
tile (72.8) draws 40.4px and clips it by 4, and a two-unit Card or Pool (56.3)
draws 34px and clips it by 9, every one a case this feature exists to fix.
Recorded so a later reader sees why.

### Today against the design

The two Card cells the BACKLOG names, a Card set tile, a coin card, and the
Pool's two cells, at 520. The two- and one-unit cells are `Load`, `Gold value`
and `Hit points` moved with `&place=`. **Marked** means the number is replaced by
the mark (below); it is no longer clipped or passing the card.

| Cell (content) | Condition | Today: size, `100` | Design: size, `100` | `355000` today → design |
| --- | --- | --- | --- | --- |
| two-unit Card (56.3) | default | 28, fits (−1.2) | **27.3**, fits (−2.0) | passes by 25.7 → marked |
| two-unit Card (56.3) | `text=24` | 42, **passes by 11.9** | **27.3**, fits (−2.0) | passes by 51.9 → marked |
| Card set tile (72.8) | default | 28, fits | 28, unchanged | passes by 17.4 → marked |
| Card set tile (72.8) | `text=24` | 42, **passes by 3.7** | **35.9**, fits (−2.1) | passes by 43.7 → marked |
| coin card, typed (76.9) | default | 28, fits | 28, unchanged | clips 35 → marked |
| coin card, typed (76.9) | `text=24` | 42, **clips 7** | **38.0**, fits | clips 87 → marked |
| two-unit Pool (56.3) | default | 28, fits | **27.3**, fits | clips 52 → marked |
| two-unit Pool (56.3) | `text=24` | 42, **clips 24** | **27.3**, fits | clips 104 → marked |
| one-unit Card (15.2) | default | 28, `6` passes by 1.4 | **18.67**, `6` fits, `10` marked | marked |
| one-unit Card (15.2) | `text=24` | 42, `6` passes by 5.8 | **25**, `6` marked (by 1px) | marked |
| one-unit Pool (15.2) | default | 28, field passes by 10.8 | **18.67**, `6` fits, `10` marked | marked |
| one-unit Pool (15.2) | `text=24` | 42, field passes by 20 | **25**, `6` marked (by 1px) | marked |

**Nothing at 1400, at a 380 container at `text=24`, or under phone staging changes
size**: every headline there measured 28 or 42 before and after, and the only
values marked there are six digits in a Card set tile (92px of content at 380) or
a coin card (88.5 at 1400). At the default size on a 520 sheet the one change
above one unit is the two-unit cell's **0.7px** (28 → 27.3), the cost of the 2px
a Card's field pads either side; fitting the line to an unpadded number instead
would leave a typed `100` there clipped by 1.5px.

A one-unit cell on a 520 sheet is narrower than one digit at the `text=24`
floor (15.8px against 15.2), so there even `6` is marked. That is the floor doing
what the ruling asks: it holds the number above its qualifiers and hands the
rest to the reveal.

**The order in which a Pool gives way, measured for its capacity reading
`100 / 120`.** The slot drops to `2ch` below 118px of card (154 at `text=24`),
the ceiling wraps below about 90px of content (116 at `text=24`), and the number
starts to scale only below 57.7 (84.6). So for three digits over three, the
prior feature's two rules still give way first. For a short reading the order is
not guaranteed: the size cannot know the value, so a `6 / 9` that would just
share a line at 54.3px of content is drawn 26.6px there rather than 28. Accepted,
because the alternative is a size that depends on the value.

### Compact notation for a read-only number

Weighed, as the ruling asks, and **not adopted**. `355K` measured 71.9px at 28 and
63.6 at 25, so of the cells above it rescues one: a Card set tile at the default
size on a 520 sheet (72.8). At `text=24` it fits no narrow cell at all, and the
two-unit Card misses at either size. Against that small gain:

- **A change can stop showing.** A purse of 12,345 gp reads `12K` before and after
  spending 400, so the write looks as if it did not happen. A sheet is read for
  exact amounts, XP against the next level's threshold and gold against a price,
  which is where Power BI's dashboards, read for magnitude, are the wrong
  precedent.
- **It is locale-shaped.** `K` and `M` are English abbreviations, and
  `Intl.NumberFormat`'s compact form differs by locale where the rest of the
  sheet prints a number as the formula returned it.
- **It needs a second fit.** The compact text has its own width, so the check
  becomes full, then compact, then mark, three states where two do.

So a read-only number takes the mark like everything else, and its whole value is
one press away. This reopens if a measured layout shows many tiles in the one
band where four characters fit and six do not.

## What it does

A card's headline number keeps its full size wherever three digits fit at that
size, as it does today. In a card narrower than that, the number gets smaller with
the card, down to a floor that keeps it clearly larger than everything under it.
A number that still does not fit is never shown as part of its digits: it shows a
mark instead, and a press on a computed number, or focus on a typed one, shows the
whole value.

## Smallest version

The size token, the derived number capped at its card (`max-width: 100%`,
clipped), the Pool's `2ch` floor capped at its row, and the fit check with its
mark on all three headlines, with a cut derived number revealing its value in the
popover it already opens. What it gives up: the cut derived number as a tab stop
(Design, "Keyboard"), so a sighted keyboard reader cannot reveal it, and the vault
fixture.

## Design

### Which numbers

Three elements, which are the headline wherever they appear:

- `.sheetsmith-card-derived`, a computed number on a Card or a Card set tile,
  read-only;
- `.sheetsmith-card-input` where it is the card's headline (a card with no
  `derived`; the pill under a derived keeps `--sheetsmith-qualifier-small`), typed;
- `.sheetsmith-pool-current`, typed.

`.sheetsmith-card-select`, a card's menu, takes the same size so a row of cards of
one width draws one size, and no mark: it already ellipsises its own label, and
its menu shows the rest (approved by the owner on 2026-11-18; the WebKit select
row stays deferred).

**Not changed:** a Roster band's score (it borrows `.sheetsmith-card-input`, so
the new rule is scoped to the card's own value slot and leaves it at the token),
a Passport's name, a Stat block's vitals, and the Pool's ceiling. All four keep
`--sheetsmith-card-value-size`, which keeps its meaning: the headline's full size.

### The size

Two tokens in `tokens.css`, beside `--sheetsmith-card-value-size`:

- `--sheetsmith-headline-floor: max(18.67px, calc(1.2 * max(var(--font-ui-medium), var(--sheetsmith-qualifier-small))))`
- `--sheetsmith-headline-size: clamp(var(--sheetsmith-headline-floor), calc(52cqi - 2px), var(--sheetsmith-card-value-size))`

Both are read off the element that uses them, as the qualifier token already is:
the `em` resolves on the headline's parent, which is the card's, and `cqi` on the
nearest query container, which is the card. Each comment states the arithmetic
above (the 1.2 step and why not 15/13; 1.921em per three digits and the 2px
padding) and links here. The four rules above take
`font-size: var(--sheetsmith-headline-size)` in place of the value-size token.

**A value change never changes the size**: nothing in either token reads the
value, and the fit check below never writes a size.

### What stays of the Pool's narrow fit

Unchanged from `docs/features/pool-headline-narrow-fit.md`: the `4ch` slot above
`calc(4.6em + 44px)`, the `2ch` slot below it, the wrapping reading, the field's
`flex-shrink: 0` and `max-width: 100%`, and the dotted mark on a calculated
ceiling. One amendment: below the threshold the floor becomes
`min-width: min(2ch, 100%)`, because in a 15.2px cell the `2ch` floor beat the
cap and pushed the field 10.8px past the card. The `4ch` floor above the
threshold needs no `min()`: there the headline is at full size and `4ch` fits.

**The derived number is capped at its card**: `max-width: 100%`,
`overflow: hidden`, `white-space: nowrap`. Today it is a flex item with no cap,
so a long value passes the card instead of clipping, which is the "passes by
11px" of the BACKLOG row. A Card's field and the Pool's field are already capped.

### The fit check

**One shared module, `ui/headline-fit.ts`**, three consumers from the start
(PATTERNS §1), and one view pass.

- `stampHeadline(el, host, { stop })`: a component calls it on its headline. It
  adds `.sheetsmith-headline` to `el` and `.sheetsmith-headline-host` to `host`,
  which is what takes `position: relative`, and builds one
  `span.sheetsmith-headline-mark` holding `⋯`, with `aria-hidden="true"`,
  **attached to `host` only while the number is cut** (as built: a derived is its
  own host, so a mark always present would be part of its `textContent`, which
  its announcement and every reader of its text read). The host is the box the
  mark is laid over: the derived itself, a Card's `.sheetsmith-card-value` slot,
  or the Pool's `.sheetsmith-pool-reading`. `stop` is for a read-only number,
  which takes the tab stop below while cut; its `onHold` tells the caller when
  the stop is gained and given up, so the caller can name the button it is.
- `refitHeadline(el)`: compares `el.scrollWidth` with `el.clientWidth` and toggles
  `.sheetsmith-headline-cut` on `el` and its host. **It reads and sets a state and
  never a size**, so it cannot loop: the class changes no box (criteria), and the
  next measurement sees the same widths. A component calls it after setting a
  value in code, a derived repainted from a draft (`setDerived`) or a Pool's
  optimistic paint, because a value change inside a capped box resizes nothing an
  observer would see.
- `view/headline-fit.ts`, after `renderGrid` in the view and the harness alike
  (`placement-decorations.ts`'s arrangement, and like it importing nothing from
  `obsidian`): one `ResizeObserver` per view, which observes every
  `.sheetsmith-headline` the render drew and calls `refitHeadline` on each entry.
  It is disconnected before every rebuild and when the view closes, so no observer
  outlives what it watched. The first `ResizeObserver` in the repository, so its
  lifecycle is the part the tests hold, and it is recorded in `docs/PATTERNS.md`
  as the precedent: one observer per view, owned and disconnected by the view
  (written by the dev in the build's docs commit).

**Nothing switches back and forth while typing.** A focused field is never drawn
cut (below), and the state it had is re-measured when the value is next set or
the card resized. `99 → 100` either fits, or crosses into the cut state once, on
the commit.

### The mark

`⋯`, the midline ellipsis, one character, in the number's own colour and weight,
centred over the number's box. Not `####`: it is three digits wide, so it fails
in exactly the cells where three digits do. Not `…`, which was built first and
sits on the baseline, about a third of the box below its middle, so on a coin at
the card's foot it read as part of the edge (amended in the design review). The mark is sized at the number's size and capped so
it fits the content box, since in the original measurement, `…` at the then
18px floor, it was 16px wide against the one-unit cell's 15.2. Not re-measured
for `⋯` at 18.67px: the cap holds whatever the glyph's width.

While cut, the number's own glyphs are made transparent and stay laid out, by
their fill (`-webkit-text-fill-color`) and not by `color`, which a derived and a
Pool's field fade on a transition: a transparent `color` faded the digits out
under a mark that appears at once (amended in the design review). In forced
colors, which repaints the fill too, the cut number alone takes
`forced-color-adjust: none`; it paints nothing but its transparent glyphs, so
the mode loses nothing by it. The
value stays in the DOM where it is, as the derived's text or the field's `value`,
and **that is what a screen reader reads**: the mark is `aria-hidden`, and a
field's place in the accessibility tree does not change. A cut derived does
change in one way, while it holds its tab stop: it becomes a button named by the
card's title and its whole value and described by the breakdown twin where there
is one (Design, "Keyboard"), and gives all three up with the stop. A number marked as modified keeps its
underline on the mark, so a cut number still says it was pushed at.

### The reveal

- **A typed number (Card's field, Pool's field): editing is the reveal.** The mark
  has `pointer-events: none`, so a press lands on the field exactly as now.
  `.sheetsmith-headline-cut:not(input:focus)` is what hides the digits and shows
  the mark, so on focus the field shows its value and scrolls it natively. A
  focused derived stays marked: its reveal is the popover, and its digits would
  only show clipped. Unfocused
  it is never drawn as a cut number. Focus still selects the whole number
  (`docs/UI.md` §7), so what shows first is the selection's end; that is the
  native scroll the ruling accepts.
- **A computed number: the breakdown popover it already opens.** A press on a cut
  `.sheetsmith-card-derived` calls `showPopover` with the whole value as its first
  line. Where the number has a breakdown, the breakdown follows after a blank
  line, as the total already does: the breakdown's `Total +3` is the sum of the
  contributions, not the value, so the value has to be said. One popover, one
  builder, no second hover surface. `cursor: help` while cut, as on a modified
  number.

**The tap collides with nothing already on Card or Pool.** On a Card, a press on
the derived does one of three things today: with a breakdown it opens the popover
and the card's router stands aside (`card-face.ts`); without one, on a card with a
field, the router sends it to the nearest control, the pill, which is a press the
derived lends rather than one it owns; on a computed card with no controls it does
nothing. A cut derived owns its press in all three, by the rule the first case
already follows: the router stands aside wherever a press on the derived opens
something, which is "has a breakdown **or is cut**", decided once in
`card-face.ts` for the click, the keys and the router alike.
The pill stays its own target, and every other point on the card routes as
before. On a Pool nothing is added: the mark takes no pointer, so the field's
focus, hold-to-repeat, drag-to-scrub, the steppers, the corner door and the
card's router see exactly the presses they see now.

**Keyboard.** A derived number is not a tab stop (`docs/UI.md` §9: making every
modified card focusable was refused for adding a stop per card). A cut one is the
only number on a sheet whose value a sighted reader without a pointer cannot see,
so **while cut, the derived takes `tabindex="0"`, and Enter or Space opens the
same popover.** Focus alone does not open it. This adds a stop only where a number
is cut, rarely more than one or two on a sheet, and it is set and cleared by the
same state the mark is. Approved by the owner on 2026-11-18 as a narrow change
to the card's keyboard model. **A cut number that has focus keeps its stop until
it is blurred**, even if a resize makes it fit in the meantime: the fit check
clears the cut state as usual, but leaves `tabindex` in place while the number
holds focus and removes it on `blur`, so focus never vanishes from under the
reader. **Enter or Space on a number that has come to fit while focused does what
a press would**: it opens the breakdown where there is one, and nothing where
there is none, since the whole value is drawn and there is nothing more to show.

**While it holds the stop the derived is a button** (`role="button"`), named by
the card's title and its whole value (`Armour class, 355000`), since what is
drawn is a mark, and described by the breakdown's screen-reader twin where it has
one, the same twin the card's field points at. All three are given up with the
stop, so an uncut number's name and description are what they always were.
Amended in the patterns review: a focusable element with no role was a stop a
screen reader could not name.

### Empty and error states

- **Empty** (`—` placeholder in a field, nothing in a derived): nothing to cut,
  never marked.
- **Unresolved** (`?` with its reason in `title`): one character, never cut at
  the floor; its `title` is untouched.
- **A long non-numeric value** (`+8 Legendary`, `100kcr`, a Traveller hex string):
  the same rules as a number. It shrinks with the card, and where it does not fit
  it is marked and revealed, with no compact form.

### The 200% test

Against what sets the sheet's size, a theme or a snippet, which the harness's
`text=` stands for (`docs/UI.md` §5). At `text=32` the cap is 56px and the floor
33.3: everything above the starting width doubles, and a cell below it draws at
least the floor, about 1.8 times the default's 18.67, with any value that still does
not fit marked and revealed, never lost. App zoom narrows the cell along with the
text, which is the reflow's concern (`docs/UI.md` §4), not this one.

## Config fields

None.

## Data and file model

Nothing stored changes. CSS, a stamp on three elements and a view pass, so
Constraints 3 and 4 are untouched and no note is touched.

**Docs, written by the dev:**

- **SPEC §4.2 Pool**: the sentence "the number keeps its size and the ceiling
  wraps onto a line centred under it" gains its third step: on a card too narrow
  for three digits, the number shrinks with the card to a floor above the ceiling,
  and below the floor it is marked and editing reveals it. **SPEC §4.2 Card**: one
  sentence saying the same of a Card's number and that a cut computed number shows
  its value in its popover. The §13 `Resolved:` paragraph is already in the
  working tree and `/land-it` owns it.
- **`docs/UI.md` §5**: the first bullet's "`1.75em`, not a pixel size" gains the
  clamp, the floor and the reason for each, pointing here.
- **`docs/UI.md` §6**: one bullet: a mark standing in for text is `aria-hidden`,
  and the text it stands in for stays where it was.
- **`docs/UI.md` §9**: a vocabulary row, "A headline that does not fit"
  (`ui/headline-fit.ts`, `.sheetsmith-headline`, `-cut`, `-mark`; Card, Card set,
  Pool). The Pool value-field paragraph under the fixed-box ruling gains
  `min(2ch, 100%)` and that a Pool's number now scales below its capacity. The
  breakdown paragraph gains that a cut number's popover opens with its value.
- **`docs/PATTERNS.md`**: the view-owned `ResizeObserver` as the precedent for
  any later one: one per view, observing what a render stamped, disconnected
  before each rebuild and on close.
- **`docs/features/pool-headline-narrow-fit.md`**: a dated *Since reversed* note
  under its rejected-scaling paragraph, pointing here, as its temp pill note does.
- **BACKLOG § UI.** Retire the Card row. **Rewrite the Pool row** to its residue:
  the number is answered, but in a one-unit cell on a 520 sheet the ceiling, which
  is `--font-ui-medium` and not a headline, is wider than the card (`/9` 15.6,
  `/54` 24.8 and `/120` 34.0 against 15.2 of content), so it still passes it by up
  to 9.4px a side. Under 575 characters, all four cells filled
  (`src/backlog.test.ts`).

**In the vault.** The harness cannot show VoiceOver or an iPhone's zoom on tap,
so the owner's check needs a fixture. `Card variations.sheetsmith` gains a group
**Narrow headlines** holding, in a 12-column grid: a Card one unit wide with a
derived `355000`, a Card two units wide with the same, a two-unit Card whose
derived returns the text `+8 Legendary` (or a typed value, if the formula engine
has no string literal), a two-unit plain Card, and a Pool one unit and one two
units wide. `Cards.md` gains their sections: the plain Card `100`, the Pools
`6` over `9` and `100` over `120`. To press: narrow the pane until the cards are
marked, tap each mark, and focus each typed one on a phone.

## Acceptance criteria

- [x] **The floor and the size are the tokens above**, and `styles.test.ts` holds
      them: `--sheetsmith-headline-floor` is
      `max(18.67px, calc(1.2 * max(var(--font-ui-medium), var(--sheetsmith-qualifier-small))))`;
      `--sheetsmith-headline-size` is
      `clamp(var(--sheetsmith-headline-floor), calc(52cqi - 2px), var(--sheetsmith-card-value-size))`;
      exactly the four headline rules and the mark that stands in for them take
      `--sheetsmith-headline-size`; a Roster
      band's score, a Passport's name and a Stat block's vitals still take
      `--sheetsmith-card-value-size`. The test asserts how many rules it matched
      before checking them, so it cannot pass on nothing (PATTERNS §10).
- [x] **The floor sits above every qualifier.** In the measure script, on every
      measured card, the headline's computed size is greater than the card's
      ceiling, own-value pill and temporary points, at the default size, at
      `text=24` and under phone staging, and a headline field's computed size is
      at least 16px.
- [x] **Nothing that fits today changes.** At 1400 (default and `text=24`), at a
      380 container at `text=24` and under phone staging, every Card, Card set
      tile and Pool headline has the size, width and card height it has before
      this change. On the 520 sheet at the default size, only the two- and
      one-unit cells change size.
- [x] **Same width, same size.** The two-unit Card, the two-unit Pool and the
      `Gold value` card, placed at one width, draw one computed size in every
      condition, and a headline's computed size is identical across the values
      `6`, `100` and `355000` in every condition.
- [x] **Three digits fit wherever a number is above the floor.** With `100`
      injected, every Card, Card set tile, coin card and Pool headline at two
      units or wider lies inside its card's content box with no clip, at the
      default size and at `text=24` on the 520 sheet: in particular the
      two-unit Card (27.3px), the Card set tile at `text=24` (35.9px), the coin
      card at `text=24` (38.0px) and the two-unit Pool at `text=24` (27.3px).
- [x] **Never part of its digits.** In every condition the measure script runs,
      for the values `6`, `10`, `100`, `355000` and `+8 Legendary`, every
      headline either fits (inside the content box, no clip, no cut state) or
      carries `.sheetsmith-headline-cut` with its glyphs' fill transparent and its mark
      inside the content box. No headline box passes its card anywhere, the
      one-unit cells on the 520 sheet included.
- [x] **The fit check sets state, never size.** Toggling
      `.sheetsmith-headline-cut` on every headline leaves every headline's and
      every card's rect identical (measure script), and `refitHeadline` writes no
      inline style (`ui/headline-fit.test.ts`, with faked `scrollWidth` and
      `clientWidth` as `truncation.test.ts` fakes them). Calling it twice on
      unchanged metrics leaves the state where the first call put it.
- [x] **The observer's lifecycle.** A view test with a stub `ResizeObserver`
      shows one observer per view, every stamped headline observed after a
      render, `disconnect` called before each rebuild and on close, and no
      observer left connected after the view closes.
- [x] **The full value is what assistive tech reads.** In `card.test.ts` and
      `pool.test.ts`, a cut headline's text or `value` is the whole value, its
      mark carries `aria-hidden="true"`, a field's accessible name and
      `aria-describedby` are what they are uncut, and a derived's are what they
      are uncut once it gives up its stop. While it holds the stop it is a
      button named by the card's title and the whole value and described by the
      breakdown twin where there is one (Design, "Keyboard").
- [x] **The reveal.** In `card.test.ts`: a press on a cut derived with no
      breakdown opens the popover whose first line is the value, and focuses no
      field; with a breakdown, the popover is the value, a blank line, then the
      breakdown; a press on an uncut derived without a breakdown still routes to
      the nearest control; the pill under a cut derived still takes its own
      press. While cut, the derived has `tabindex="0"`, and Enter and Space open
      the popover; uncut, it has no `tabindex`.
- [x] **Focus is never lost to a refit.** In `card.test.ts` (faked metrics): a
      cut derived that has focus, refitted to fit, loses its cut state but keeps
      `tabindex="0"` and focus; on `blur` the `tabindex` goes.
- [x] **A focused field shows its value.** In the harness, a cut Card field and a
      cut Pool field, focused, show their digits and no mark, and blurred, the
      mark again (`styles.test.ts` holds that the transparent-digits rule is
      `:not(input:focus)` and that the mark has `pointer-events: none`).
- [x] **The Pool's prior order holds.** For `100 / 120`, the slot narrows and the
      ceiling wraps at the widths `pool-headline-narrow-fit` measured, before the
      number scales; the narrow `@container` rule still follows the base rule in
      the built `styles.css`; below its threshold the field's floor is
      `min(2ch, 100%)`.
- [x] **`field-sizing` off.** With the field pinned at `width: 4ch` (simulated, as
      the script already does), no Pool field passes its card, and any field that
      clips carries the cut state.
- [x] **`harness/measure-pool-headline.mjs` keeps passing and grows**: its
      exclusions for the one- and two-unit cells on the 520 sheet go, replaced by
      the fits-or-cut check above, except for the one-unit Pool's ceiling, which
      stays printed and not failed as the BACKLOG residue. It adds the
      Card cells measured here (a two- and a one-unit `Load` by `&place=`, a Card
      set tile, the coin card), the values `355000` and `+8 Legendary`, and prints
      each headline's computed size and cut state. Its output is pasted at the
      land stop.
- [x] **Shots, before and after**, framed to the cells, as new `shot.mjs` views
      `headline-narrow-*` using `frame=`: the two-unit Card, a Card set tile, the
      coin card and the one- and two-unit Pool, each at default 520 and
      `text=24` 520, holding `100` (the signed Card set tile holds `+99`, its
      three-character reading); the same cells holding `355000` (marked);
      a cut derived with its popover open; a cut Card field and a cut Pool field
      focused; the dark theme and forced colors once each for the mark, forced
      colors by Chrome's `--force-high-contrast`, which repaints, as the other
      forced-colors views take it. Before shots are taken
      with the harness changes built and `styles.css` as on the version branch,
      as the prior spec's were.
- [x] Gates: `npm run lint`, `npm test`, `npm run build`.

### At the land stop

`node harness/measure-pool-headline.mjs`, against the built harness, with the
baseline at `HEAD` (the version branch before this landed):

```
2780 measured, 0 failed, 16 printed as the one-unit Pool ceiling residue
```

Per check, from the same run: every headline in all fourteen conditions, with
`field-sizing` on and simulated off, either fits or is marked (1); `100` fits in
every two-unit-or-wider cell, tile and coin on the 520 sheet (2); the floor sits
above every qualifier (3); at 1400, 380 at `text=24` and on a phone every headline
is at full size, and at `6`, `10` and `100` its width and its card's height match
the baseline stylesheet, 45 headlines per run (4); a headline's size never moves
with its value, and `one width, one size: hit_points 27.3, gold_value 27.3, load
27.3` in both two-unit conditions, both fallbacks (5); toggling the cut state
moves no box (6); no Pool scales before its ceiling wraps (7). The sixteen residue
lines are the one-unit Pool's ceiling alone, `ceil` 4.8 to 9.4px past the card, the
rewritten `docs/BACKLOG.md` § UI row: for example
`residue 100 pool hit_points span 1 content 15.2 size 18.7/28 cut over 0 clip 20 mark 0 ceil 9.4 wraps`.

**Decided by the owner at the land stop:** the `⋯` at the floor is accepted from
the harness, to be checked on a phone in the test vault after landing; the
popover covering a one-unit card's heading is accepted. The own-value pill under a
one-unit card's number drawing empty is a qualifier outside this feature and is a
`docs/BACKLOG.md` § UI row.

## Commit boundaries

1. `fix: Let a card's headline number shrink with a narrow card`. The two tokens
   in `src/styles/tokens.css`; the four headline rules, the derived's cap and the
   Pool's `min(2ch, 100%)` in `src/styles/sheet.css`; the regenerated
   `styles.css`; the `styles.test.ts` guards for the tokens and their scope.
2. `feat: Mark a headline number that does not fit, and reveal it`.
   `src/ui/headline-fit.ts` and its test, `src/view/headline-fit.ts` and its call
   in the view and the harness, the stamps and the router condition in
   `card-face.ts` and `pool.ts`, the popover's value line, the cut and mark rules
   in `sheet.css`, `styles.css`, and the card, pool and view tests.
3. `test: Measure and shoot every headline in a narrow cell`.
   `harness/measure-pool-headline.mjs`, any `harness/samples.ts` addition the
   shots need, and the `headline-narrow-*` views in `harness/shot.mjs`, with the
   frame re-measure that file asks for if a sample grows a row.
4. `docs: Record how a headline number fits a narrow cell`. This doc; SPEC §4.2
   Pool and Card and the §13 `Resolved:` paragraph; `docs/UI.md` §5, §6 and §9;
   the `ResizeObserver` precedent in `docs/PATTERNS.md`;
   the note in `pool-headline-narrow-fit.md`; the Card BACKLOG row retired and the
   Pool row rewritten.

## Deliberately not doing

- **Compact notation** (`355K`): weighed above, not adopted.
- **A warning in the layout editor** about a narrow placement: rejected by the
  ruling.
- **The one-unit Pool's ceiling** on a 520 sheet, which is `--font-ui-medium`
  chrome and not a headline. It stays the rewritten BACKLOG row.
- **The qualifier rows the text-size pass left**: a card's note, abbreviation and
  *Temp* at `--font-ui-smaller`; temporary points stopping at the ceiling's size;
  the wrapped temp pill's loose spacing.
- **A Roster band's score, a Passport's name and a Stat block's vitals**, which
  share the full-size token and none of whose rows this ruling answers.
- The WebKit select, Passport chip and empty card select rows.
- The 24px resize corner row.
- Any change to the Adjust control or the steppers.
