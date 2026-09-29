# Track row legibility and clipped fields

Status: shipped
Board card: four rows of `docs/BACKLOG.md` § UI in one pass. The rows are "A dead declaration sits in the segment rule, spelled like a property", "A Track row name is 2.13:1, and one is now the character's own typed text", "A Track row's fields are 12px tall against a 20pt pointer minimum", and "The stat note clips mid-word, and Image's reference field is worse". Each row leaves `docs/BACKLOG.md` in the commit that fixes it.

## Owner rulings

Both are settled: the owner ruled at spec approval. The measurements below stay as the record of what each ruling was chosen against. Every number below was measured in the built harness at `1400,8500` on the calibrated palette (`harness/obsidian.generated.css`), with the variant injected as a stylesheet into a scratch page. No file in the tree was changed to take them. The card surface under every Track row name is `--background-secondary`: `#f6f6f6` light, `#282828` dark. There are 19 row names on the sample sheet, all on that one surface.

### Ruling 1: the Track row name column's colour

One colour for `.sheetsmith-track-row-name` and `.sheetsmith-track-row-name-input` together. It moves every run-set Track on every sheet. The flag set (`.sheetsmith-track-flags`) already overrides to `--text-normal` and is not affected. The text is 10.2px, which is small text, so the bar is 4.5:1 (`legibility.md` §1, §3).

| Candidate | Light | Dark | Clears 4.5:1 in both |
| --- | --- | --- | --- |
| `--text-faint` (today) | `#ababab`, **2.12:1** | `#666666`, **2.57:1** | no |
| `--text-muted` | `#5c5c5c`, **6.19:1** | `#b3b3b3`, **7.03:1** | yes |
| `--text-normal` | `#222222`, **14.72:1** | `#dadada`, **10.55:1** | yes |

These were computed from the variables and match the backlog's pixel sample of 2.13:1. `--text-accent` is left out because it means a link or an interactive state, not a rank. `--text-on-accent`, `--text-error` and the rest mean something else too. No other theme text variable is a plausible name colour.

**Ruled: `--text-muted`.** It clears the bar with room in both themes. It keeps the name a step below the segments' `--text-normal`, which is what the rule's own comment says the rank is for: it "names the run rather than being part of the reading". The card's own label is also `--text-muted`, so the rank is carried by size, tracking and case, not by a third grey. `--text-normal` also passes, but it makes the name as loud as the value.

Shots the ruling was made on, spell-slot card and a mixed card with typed names (Open hit dice), each theme:

- `/private/tmp/claude-501/-Users-ricardopereira-Developer-obsidian-sheetsmith/adcce3ca-c7e9-4982-a35f-fd4803d84853/scratchpad/colour/faint-spell-slots-light.png`, `…/colour/faint-spell-slots-dark.png`, `…/colour/faint-open-hit-dice-light.png`, `…/colour/faint-open-hit-dice-dark.png`
- `…/colour/muted-spell-slots-light.png`, `…/colour/muted-spell-slots-dark.png`, `…/colour/muted-open-hit-dice-light.png`, `…/colour/muted-open-hit-dice-dark.png`
- `…/colour/normal-spell-slots-light.png`, `…/colour/normal-spell-slots-dark.png`, `…/colour/normal-open-hit-dice-light.png`, `…/colour/normal-open-hit-dice-dark.png`

**Where it is recorded.** A bullet in `docs/UI.md` §6: text a reader reads back meets 4.5:1 on the surface it sits on, and `--text-faint` does not on a card (2.12 / 2.57), so a Track name column is `--text-muted`. The rule is scoped to the name column on purpose.

**The rest of `--text-faint` becomes a backlog row, and that is part of the plan.** `sheet.css` has 25 `color: var(--text-faint)` declarations. Two are the Track name rules this pass lifts (the span and the field), which leaves **23** that nobody has measured. Commit 2 adds this one new row to `docs/BACKLOG.md` § UI, at the end of the table. No existing row changes.

| Gap | Where | Fix | Waiting on |
| --- | --- | --- | --- |
| 23 sheet text colours are `--text-faint`, which measures 2.12:1 light and 2.57:1 dark on a card | `styles/sheet.css`, every `color: var(--text-faint)` left after the Track name column | Measure each against the surface it sits on, per `legibility.md` §3, and lift what a reader reads to `--text-muted`, as `track-row-legibility-and-clipped-fields.md` did for the name column. A placeholder, or a mark with a second channel, may stay if its reason is said. | an audit pass over `--text-faint`, taken alone |

The row is under the 575-character target, and all four cells are non-empty, so `src/backlog.test.ts` accepts it.

### Ruling 2: the Track row's pitch, for every Track at once

Measured today: every run-set row is **18.9px** on a **20.9px** pitch (with the 2px gap), whether it holds a declared or a typed name. A typed name field is **75.6x12**, and the length field (`.sheetsmith-track-row-length-input`) is **16.1x16**. That is under `legibility.md` §5's 20x20 on both axes for the length field. The backlog measured 79.6x12, and the sample has moved since.

| Option | Row / pitch | Name field | Length field | Spell slots card | Open hit dice card | Sheet height |
| --- | --- | --- | --- | --- | --- | --- |
| **A.** Keep, and record an exception | 18.9 / 20.9 | 75.6x12 | 16.1x16 | 198.2 | 145.5 | 8122 |
| **B.** 20px floor (`--size-4-5`) | 20.0 / 22.0 | 75.6x20 | 20.0x20 | 199.0 | 149.8 | 8131 |
| **C.** 24px floor (`--size-4-6`) | 24.0 / 26.0 | 75.6x24 | 20.0x24 | 202.0 | 165.8 | 8172 |

B and C are the same three declarations at a different floor. `min-height` goes on `.sheetsmith-track-set .sheetsmith-track-row` and on both fields, so every row in a set has the one pitch and a mixed card is never ragged. The length field also gets `min-width: var(--size-4-5)`, scoped to the Track class so Pool's `.sheetsmith-pool-max-input` does not move. It is `min-height`, not `height`, so a larger text size still grows the row. At `text=24` the floor still reaches some rows: of the 19 set rows, ten are already 28px under A and B alike, the three flag rows stay 20.8px, and six spell-slot-style rows go from 18.9px to 20px under B. The HIG's 28pt default has no Obsidian token (there is no `--size-4-7`), which is why C stops at the 24px token. The spell-slot card barely moves under B because its cell is taller than its rows, and the free space absorbs them. A dense card with fields moves most (Open hit dice gets 4.3px taller). The flag set's rows are 20.8px already and do not move under B.

The costs: A leaves a target the reference says is under the minimum, and the only reason to accept that is the pitch. B changes every Track set by 1.1px a row. C re-pitches visibly, and a spell-slot card starts to read as a list, not as a picture of capacity.

**Ruled: B, a 20px floor on `--size-4-5`.** It is the smallest change that meets 20x20 on both fields, it leaves no mixed-card raggedness, and on a spell-slot card the owner would have to look for it. The focus ring (2px `box-shadow`) around a 20px field then just fills the 2px gap and does not overlap the next row.

Shots the ruling was made on, spell-slot card and Open hit dice, each theme:

- A: `/private/tmp/claude-501/-Users-ricardopereira-Developer-obsidian-sheetsmith/adcce3ca-c7e9-4982-a35f-fd4803d84853/scratchpad/pitch/a-spell-slots-light.png`, `…/pitch/a-spell-slots-dark.png`, `…/pitch/a-open-hit-dice-light.png`, `…/pitch/a-open-hit-dice-dark.png`
- B: `…/pitch/b-spell-slots-light.png`, `…/pitch/b-spell-slots-dark.png`, `…/pitch/b-open-hit-dice-light.png`, `…/pitch/b-open-hit-dice-dark.png`
- C: `…/pitch/c-spell-slots-light.png`, `…/pitch/c-spell-slots-dark.png`, `…/pitch/c-open-hit-dice-light.png`, `…/pitch/c-open-hit-dice-dark.png`
- Both rulings together (`--text-muted` plus B), which is what this pass builds: `…/pitch/recommended-spell-slots-light.png`, `…/pitch/recommended-spell-slots-dark.png`, `…/pitch/recommended-open-hit-dice-light.png`, `…/pitch/recommended-open-hit-dice-dark.png`

**Where it is recorded.** A bullet in `docs/UI.md` §7: a field inside a row is at least the pointer minimum (`--size-4-5`, 20px) on both axes, and the row takes that as its floor so the rows around it keep one pitch. It names the Track row as the case (18.9 to 20px a row, fields 75.6x12 and 16.1x16 to 75.6x20 and 20x20). The same bullet is where a later touch pass would look.

## Model question

None. This pass is CSS, one `title`, and one call to an existing module. No component contract, stored value, published name or note is touched.

## What it does

Every Track row name can be read, the fields in a Track row become pointer-sized, a stat note that does not fit ends in an ellipsis and shows its whole text on hover, and an Image or Passport picture names its vault reference when the pointer rests on it. A dead CSS declaration is corrected.

## Smallest version

With both rulings settled, the smallest version is the whole plan. It is: the one-word `box-sizing` fix; `--text-muted` on the two name selectors; three `min-height` and `min-width` declarations at `--size-4-5`; `text-overflow: ellipsis` plus `revealWhenTruncated` on the stat note; a `title` on the picture frame; two UI.md bullets; and one new backlog row. It gives up an audit of the other 23 `--text-faint` texts, which the new row carries.

## Design

**1. Segment rule.** `segment-sizing: border-segment` becomes `box-sizing: border-box` in `.sheetsmith-track-segment` (`src/styles/sheet.css`). All 132 segments on the sample already compute `border-box` from the host reset, so **no harness shot may move**. A shot that does move is a finding.

**2. Name colour.** `--text-muted` replaces `--text-faint` in both `.sheetsmith-track-row-name` and `.sheetsmith-view .sheetsmith-track-row-name-input`, and the comments above them are updated to the new rank. Both selectors change together, so declared and typed names stay one treatment. The flag override is left alone.

**3. Pitch.** Ruling 2's three declarations go into the Track rules at `--size-4-5`, with a comment giving the measured before and after. `min-height` goes on `.sheetsmith-track-set .sheetsmith-track-row`, `min-height` on `.sheetsmith-view .sheetsmith-track-row-name-input` and `.sheetsmith-view .sheetsmith-track-row-length-input`, and `min-width` on the length field alone. Each field keeps `height: auto`.

**4a. Stat note** (`.sheetsmith-card-note-input`, `components/card-face.ts`). Add `text-overflow: ellipsis`, and call `revealWhenTruncated(input)` once when the note field is created, the same call shape as `card-face.ts`'s own label and `passport.ts`'s field. Measured at `width=620`: "chain mail, shield" is 101px of text in a 73px field and reads "chain mail, s", and "ore miners, now war refugees" is 171 in 123. With the ellipsis it reads "chain mail…". Card and Card set both draw through `card-face.ts`, so both get it. A focused field scrolls natively, as every field does.

**4b. Image reference** (`components/picture-frame.ts`, shared by Image and Passport). The field is not truncated. It is transparent and `pointer-events: none` at rest, so `revealWhenTruncated` on it would never fire and would test the wrong thing. **"Readable unfocused" means:** when the pointer rests anywhere on the frame, a tooltip shows the stored reference verbatim (`![[Sildar Hallwinter.png]]`). It shows whenever the source is non-empty and the frame is drawing a picture or an empty frame, whether or not the text would fit, because unfocused it is legible nowhere (`docs/UI.md` §6's "legible nowhere else" premise). It is absent when the source is empty, since the placeholder already shows through, and absent when the frame shows an error, since the error already names the file. `paint` sets and clears the frame's `title` on each pass, so a refusal and a recovery stay right. A touch reader, who has no hover, presses the frame and gets the field focused and legible, which is the route it already has (§7: never hover only). A screen reader already gets the value as the field's value, so no ARIA changes. Passport's picture gains the same tooltip. That is deliberate, since it is the same painter and the same invisible field. On the sample, 13 of 15 frames draw a picture and get the tooltip, and the 2 error frames do not.

No new gesture, no new vocabulary, no empty or error state beyond the ones 4b names.

## Config fields

None.

## Data and file model

Nothing stored changes. No read or write path is touched, so Constraint 3 holds by construction. No layout key or label moves, so Constraint 4 is not engaged.

## Acceptance criteria

- [x] `.sheetsmith-track-segment` declares `box-sizing: border-box`, and `segment-sizing` appears nowhere in `src/styles/`. Every harness shot is unchanged by this change alone.
- [x] Both name selectors use `--text-muted`, which measures 6.19:1 light and 7.03:1 dark on `--background-secondary`. Flag-set names are unchanged.
- [x] Every `.sheetsmith-track-set .sheetsmith-track-row` on the sample measures at least 20px, on a 22px pitch at default text. A typed name field and a length field each measure at least 20x20. `.sheetsmith-pool-max-input` on a Pool measures what it did before. The flag set's rows stay 20.8px.
- [x] At `width=620` the "chain mail, shield" note renders with an ellipsis, and hovering it sets `title` to the full value. A card-face test with faked metrics asserts the binding, the way `ui/truncation.test.ts` fakes `scrollWidth`.
- [x] Tests in `image.test.ts` and `passport.test.ts` assert: frame `title` equals the source when a picture or an empty frame is drawn, and there is no `title` for an empty source or an error frame.
- [x] `docs/UI.md` §6 and §7 carry the two ruling bullets as named above, the four rows are gone from `docs/BACKLOG.md` § UI, and the one new `--text-faint` row is there as given in Ruling 1. `src/backlog.test.ts` passes.
- [x] `npm run lint`, `npm test`, `npm run build` and `npm run harness:shot` pass.
- [x] The land stop carries harness PNGs, both themes, of every Track card the pass moved (at least Spell slots, Death saves, Hit dice, Open hit dice, Clocks, Overfull), the Armour class card at 620, and an Image frame. It also carries the `sheet-large-text` shot for the pitch.

## Commit boundaries

1. `fix: Give the segment rule the box-sizing it was meant to have`. The one-word CSS fix, with its backlog row removed.
2. `fix: Lift a Track row name to a colour a reader can read`. Ruling 1's CSS and the UI.md §6 bullet. Its backlog row is removed, and the new `--text-faint` audit row is added.
3. `fix: Give a Track row's fields a pointer-sized target`. Ruling 2's CSS at `--size-4-5` and the UI.md §7 bullet, with its backlog row removed.
4. `fix: Ellipsise a stat note and reveal it when it clips`. The CSS, the `card-face.ts` call and its test.
5. `fix: Name a picture's reference when the pointer rests on it`. The `picture-frame.ts` title and its tests in `image.test.ts` and `passport.test.ts`, with the stat-note/Image row removed now that both instances are done.

`styles.css` is regenerated in each commit that touches `src/styles/`.

## Deliberately not doing

Every other row of `docs/BACKLOG.md` § UI, untouched. In particular:

- Forced colors making a Track say nothing about its value. It is the same segment rule as item 1, but it needs its own forced-colors pass.
- The three same-size circles in a summary line.
- The six-field record wrapping in its grid track.
- A wide table with few columns clipping.
- A stacked cell rendering both layers in forced colors.
- The modified-number mark as a plain underline.
- The breakdown listing contributors that do not move.
- A granted tail and its tooltip stating two magnitudes.
- A Pool ceiling moving with no mark.
- `hideLabel` out of line.
- The band of columns being balanced.
- Add-panel focus in two places.
- The derived starter's "?".
- A field appearing or disappearing without an announcement.
- Rich text edit mode losing its place.
- Focus returning before render.
- Promoting a computed column's `.value`.
- `mod.self` reaching a player.
- The anchored panel on a narrow pane.
- An error card without its component name.
- The test DOM accepting markup a browser refuses.
- `--text-error` at 4.20:1.

Also out of scope:

- Auditing the other 23 `--text-faint` text declarations. The new backlog row carries it (see Ruling 1).
- A lint or test that catches unknown CSS properties. Item 1 shows the gap exists, but closing it is a separate pass.
- Drawing the Image reference visibly over the picture. The picture is what the frame is for, which is the existing CSS comment's argument.
- Any change to Pool's max field or to the flag set's pitch.
