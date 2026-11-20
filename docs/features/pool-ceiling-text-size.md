# Pool ceiling text size

Status: shipped (approved by the owner at the land stop, 2026-11-19)
Board card: A Pool's temporary points stop growing at the ceiling's size (`docs/BACKLOG.md` § UI)

Route: standard. The mechanism is already in the repository:
`--sheetsmith-qualifier-small: max(var(--font-ui-small), calc(13em / 15))` in
`src/styles/tokens.css` made a UI-token size follow the sheet without dropping
under its token, and the narrow-fit threshold and the headline floor both
already name the ceiling's size as a term.

## Model question

None. This changes the size the Pool's ceiling and temporary points draw at.
Nothing the Pool stores, publishes or resolves changes. The ruling it rests on,
scaling a headline below its token, is settled (SPEC §13,
`docs/features/headline-narrow-cell.md`), and this spec keeps that ruling's
floor at the values it shipped with (see Design, step 3).

## What was measured

Over the DevTools Protocol against the built harness (`state=populated`), with
the candidate rules injected as a stylesheet and `120` typed into the one Pool
whose ceiling the character owns (`Rolled HP`). All sizes and widths are px.
*Ceiling* is the computed size of `.sheetsmith-pool-separator` and
`.sheetsmith-pool-max`. *Owned* is `.sheetsmith-pool-max-input`'s size. *Owned
`/120`* is the width of that Pool's `.sheetsmith-pool-ceiling`.

| Condition | Sheet `em` | Headline | Ceiling, today → design | Owned, today → design | Temp, today → design | Card pill | Owned `/120`, today → design |
| --- | --- | --- | --- | --- | --- | --- | --- |
| default | 16 | 28 | 15 → 15 | **13** → 15 | 13.9 → 13.9 | 13.9 | 38.7 → 42.0 |
| `text=24` | 24 | 42 | 15 → **20.8** | **13** → 20.8 | 15 → **20.8** | 20.8 | 38.7 → 53.4 |
| `text=32` | 32 | 56 | 15 → 27.7 | **13** → 27.7 | 15 → 27.7 | 27.7 | 38.7 → 69.5 |
| `platform=phone` | 16 | 28 | 16 → 16 | **15.0** → 16 | 15.0 → 15.0 | 15.0 | 42.2 → 43.9 |
| `platform=tablet` | 16 | 28 | 16 → 16 | **15.0** → 16 | 15.0 → 15.0 | 15.0 | 42.2 → 43.9 |

**A second defect, found while measuring.** The owned ceiling never drew at
`--font-ui-medium`. The field carries `.sheetsmith-pool-max` at (0,1,0), and
Obsidian's `input[type='text']` rule at (0,1,1) sets its size over it, so the
digits the character typed sit at 13px beside a 15px `/`, smaller than a
calculated ceiling on the next card. On a phone they draw at 15.0px, under the
16px at which iOS zooms the page on a tap. The narrow-fit threshold's 38.7px is
that 13px field, not a ceiling at the ceiling's size. This pass gives the field
a size of its own (Design, step 2), so the threshold is re-derived from the
widths above, not from 38.7.

## What it does

A Pool's ceiling and its temporary points grow with the sheet's text size, as
its number and a Card's pill already do. At `text=24` the temporary points draw
at 20.8px, a Card pill's size, rather than stopping at 15. A ceiling the
character owns draws at the same size as a calculated one, and at 16px or more
on a phone or tablet. Nothing moves at the default size except the owned
ceiling, which grows from 13 to 15px.

## Smallest version

Give the ceiling the qualifier's size where it is the larger, drop the temp cap,
and re-derive the narrow-fit threshold. The floor's value does not change, so no
headline moves. It gives up nothing the card asks for; the owned-field fix rides
along because the threshold cannot be derived without it.

## Design

1. **The ceiling is the larger of the app's medium size and the qualifier.** A new
   token in `tokens.css`, beside the one it builds on:
   `--sheetsmith-qualifier-medium: max(var(--font-ui-medium), var(--sheetsmith-qualifier-small))`.
   - `.sheetsmith-pool-separator, .sheetsmith-pool-max` take it in place of
     `--font-ui-medium`.
   - It is `--font-ui-medium` at the app's own size, so the app draws the
     ceiling exactly as today at 15px, and a phone keeps its 16. Above the size
     where 13/15 of the sheet passes the token (17.3px of sheet), it follows the
     sheet, and it is never smaller than the temporary points under it. That is
     the qualifier precedent's shape, with this token as the floor.
   - Read off the element that uses it, as the qualifier token is. On the
     ceiling's spans the `em` is the ceiling's parent, which declares no size, so
     it is the sheet's.
   - **Rejected: `max(var(--font-ui-medium), 1em)`**, the same derivation as the
     qualifier's with the app's 15/15. It puts the ceiling at 24px at `text=24`,
     and the floor at 1.2 times that, 28.8. A two-unit Card or Pool on a 520px
     sheet at `text=24` draws its headline at 27.3px today (`52cqi - 2px`), and
     `100` at 28.8 needs 59.3px against its 56.3. So every two-unit cell at
     `text=24` would mark the `100` that `headline-narrow-cell.md` fitted. It also
     moves the harness default from 15 to 16, where the app sees no change.
2. **A ceiling the character owns takes the same size, as its own declaration.**
   `.sheetsmith-view .sheetsmith-pool-ceiling .sheetsmith-pool-max-input`, at
   (0,3,0), declares `font-size: var(--sheetsmith-qualifier-medium)`. That beats
   Obsidian's `input[type='text']` and `.is-mobile input[type='text']`. Scoped
   under `.sheetsmith-pool-ceiling` so Track's row length field, which wears
   `.sheetsmith-pool-max-input` too, keeps its `--font-ui-small`.
   - **On a phone the guard is written into the rule, not left to the token.**
     `.is-mobile .sheetsmith-view .sheetsmith-pool-ceiling .sheetsmith-pool-max-input`,
     at (0,4,0) and after the rule above, declares
     `font-size: max(16px, var(--sheetsmith-qualifier-medium))`. Today's
     `--font-ui-medium` is 16px on a phone and a tablet, so it draws the same
     16px, but a theme that lowers the token can no longer bring the field under
     the size at which iOS zooms the page on a tap. `.is-mobile` rather than
     `.is-phone`, because an iPad zooms on the same rule.
   - **And the same colour** (added at the land stop): the rule also declares
     `color: var(--text-muted)`. The app's rule drew the typed digits
     `--text-normal` beside a muted `/`, against the max field's own comment.
     Hover and focus set only the background and the ring, so they keep it.
3. **The temporary points drop their cap.** `.sheetsmith-pool-temp-input` takes
   `font-size: var(--sheetsmith-qualifier-small)`, the Card pill's declaration.
   The comment recording why the cap existed comes out with it. Since the
   ceiling is now never smaller than the qualifier, the points can no longer
   outrank it at any size. The ratio of the points to the headline is 0.495 at
   the default and at `text=24`, where it was 0.50 and 0.37.
   - The pill's own comment ("81px at the default and 83px at `text=24`, where
     its field stops at the ceiling's size") is re-measured and rewritten.
4. **The headline floor keeps its values, and names the ceiling's token.**
   `--sheetsmith-headline-floor: max(18.67px, calc(1.2 * var(--sheetsmith-qualifier-medium)))`.
   - Today's term is `1.2 × max(--font-ui-medium, --sheetsmith-qualifier-small)`.
     That is exactly the new token, so the floor is the same number in every
     condition: **18.67** at the default, **25.0** at `text=24`, **19.2** on a
     phone, 33.3 at `text=32`. No headline in `headline-narrow-cell.md` changes
     size.
   - It is still one minor-third step above every qualifier on the card, now by
     construction: the ceiling is the token, and the temp and the pill are at or
     under it. The 18.67px minimum stays, for the reason the token's comment
     gives (bold large text, the accent's 3:1).
   - What `headline-narrow-cell.md` amends is its qualifier table: the ceiling
     column reads 15, 17.3, 20.8, 27.7 and 16 down its rows (default, `text=20`,
     `text=24`, `text=32`, phone), and the Pool temp column reads the
     qualifier column. Its sentence "The Pool's temporary points are
     `min(qualifier, ceiling)`" becomes "the ceiling is `max(--font-ui-medium,
     qualifier)`". Its "order in which a Pool gives way" paragraph gets the new
     threshold, and the `text=24` wrap point re-measured, about 116 → 130.
5. **The narrow-fit threshold moves the ceiling from px into em.**
   - Today `@container (max-width: calc(4.6em + 44px))`. It counts the widest
     three-digit ceiling, 38.7px, as fixed-px chrome. The ceiling now has two
     regimes: the app's fixed token at small sheet sizes and 13/15 of the
     sheet above. A container query cannot read `var()`, so one `em` plus `px`
     sum has to cover both, per `docs/UI.md` §5: a width following the sheet is
     `em` and a width agreeing with fixed-px chrome is px.
   - **The `em` part** is `4ch` at the value size (4.59em, as today) plus the
     owned `/120` at the qualifier's size: 53.4px at `text=24` less its 10px of
     fixed padding and gap, 43.4px, is 1.81em. That gives 6.40em.
   - **The px part** is the reading's 2px gap, the 2px row inset and the
     ceiling's 10px of padding and gap: 14px. That is the whole need where
     the ceiling follows the sheet (167.6px at `text=24`, exact). Where the
     app's token holds the ceiling above 13/15em, it needs up to 4.9px more
     (phone: 121.3 against 6.4 × 16 + 14 = 116.4). So it is rounded up to 20px.
   - **`@container (max-width: calc(6.4em + 20px))`.** That is 116px in the app
     (15px sheet, need 114.8), 122.4 at the harness default (need 119.4) and on
     a phone (need 121.3), 173.6 at `text=24` (need 167.6), and 224.8 at
     `text=32` (need 220.4). It never undercounts. It overshoots by up to 6px,
     and only at large sizes, where a Pool in that band drops its slot to `2ch`
     a little early.
   - By the content widths `pool-headline-narrow-fit.md` measured, no harness
     Pool sits between the old and new thresholds. On the 520 sheet three units
     are 99.5 and four units 140.7, and at 1400 one unit is 90.5 and two units
     more than 200. So no slot changes width. The measure script confirms it.
   - The order of giving way holds at `text=24`: the slot below 173.6, the
     ceiling around 130, the number below 84.6.
   - `pool-headline-narrow-fit.md` Design step 1 is **amended in place**. The
     threshold, its three px parts and the 118/154 measurement become the
     derivation above. A dated *Since amended* line names this doc, as that file
     already does for the reversed scaling. The comment above the rule in
     `sheet.css` is rewritten to match.

**What a reader sees.** At the default size, every calculated ceiling and every
pill is pixel-identical. An owned ceiling's digits now match its `/` and the
calculated ceilings beside it. At `text=24` the ceiling and the temporary points
grow with the number. The points and a Card's pill on the same row match. Every
Pool's card is 1px taller there, with or without temporary points: the 20.8px
ceiling, baseline-aligned under the 42px number, reaches 1px further down the
reading's line (34 to 35px), and the pill's height does not change. On the
1400 sheet Armour class and Passive perception, in Hit points' grid row, grow
the same 1px with it. The reading still centres as one, and wraps its ceiling
under the number a little sooner, because the ceiling is wider. There is no new interaction, and the empty
state (`—`) and an absent ceiling are unaffected.

**What else wears `.sheetsmith-pool-max`, and stays put.**
- A record's ceiling overrides the size at (0,3,0) (`--font-ui-small`).
- Track's length field is excluded by the scope in step 2 and overrides at
  (0,2,0) as well.
- A Stat block's uses counter takes the base rule, and measures unchanged. Its
  line (`.sheetsmith-stat-block-uses`) is `--font-ui-small`, fixed, so the
  token's `em` term is 11.3px and the size stays `--font-ui-medium`.
  - The populated sample never draws the numerals: its counter is `1` of `2`,
    and the reading is attached only past six rings or above the ceiling. So
    the probe loaded `state=forms` and attached a reading of `7 / 12` to the
    uses run, in the DOM shape `stat-block.ts` builds, under today's rules and
    the proposed ones.
  - Default size, today and design: line 13px, value 13px, `/` 15px, `12` 15px,
    reading 34.9px wide.
  - `text=24`, today and design: identical, 13, 13, 15, 15 and 34.9.
  - The counter's `/12` drawing larger than its own `7` is a pre-existing
    order on that line, and not this pass's.

## Config fields

None.

## Data and file model

Nothing stored changes. CSS only, so Constraints 3 and 4 are untouched.

## Acceptance criteria

- [x] `tokens.css` declares
      `--sheetsmith-qualifier-medium: max(var(--font-ui-medium), var(--sheetsmith-qualifier-small))`
      and `--sheetsmith-headline-floor: max(18.67px, calc(1.2 * var(--sheetsmith-qualifier-medium)))`.
      `styles.test.ts` holds both strings.
- [x] `styles.test.ts` holds the sizes:
      - `.sheetsmith-pool-separator, .sheetsmith-pool-max` and the scoped
        `.sheetsmith-pool-max-input` rule declare
        `font-size: var(--sheetsmith-qualifier-medium)`.
      - `.sheetsmith-view .sheetsmith-pool-temp-input` declares
        `font-size: var(--sheetsmith-qualifier-small)`, and no rule caps it with
        `min(`.
      - The test "stops a Pool's temporary points at the ceiling's size" is
        replaced, not left asserting the cap.
      - It asserts how many rules it matched before checking them (PATTERNS §10).
- [x] The threshold arithmetic test reads `calc(6.4em + 20px)`.
      - Its constants are the measured parts: 73.4 for `4ch` at 16, 43.4 for the
        owned `/120` less its padding at 20.8, the 2px gap, the 2px inset and 10px
        of ceiling padding and gap.
      - It checks that the `em` part is at least the `4ch` plus the ceiling's
        share, and that the px part covers a 16px token's regime.
      - 38.7 is gone from the test and from the rule's comment.
- [x] In the harness, measured at the default size, `text=24` and phone:
      - Every Pool's temp field equals a Card pill's size: 13.9, 20.8 and 15.0.
      - It is never larger than its ceiling.
      - An owned ceiling's size equals its separator's, and it is muted like
        it; `styles.test.ts` asserts the rule's `color: var(--text-muted)`.
      - An owned ceiling is at least 16px under phone and tablet staging, and
        `styles.test.ts` asserts the `.is-mobile` rule declares
        `font-size: max(16px, var(--sheetsmith-qualifier-medium))`.
      - A Track length field and a record's ceiling keep `--font-ui-small`.
      - A Stat block's uses reading, staged as above, keeps 15px for its `/` and
        ceiling at the default and at `text=24`.
- [x] `harness/measure-pool-headline.mjs` passes, with `field-sizing` on and off.
      - It runs against the version branch's `styles.css`, compares 45 numbers'
        width and card height, and its output is pasted at the land stop.
      - Every headline keeps its size and width in every condition, since the
        floor's value and every slot are unchanged.
      - Card heights that change are named, one by one. The expected ones are
        every Pool at `text=24`, 1px taller because the ceiling's line reaches
        past the number's, and the Cards sharing Hit points' grid row on the
        1400 sheet, Armour class and Passive perception, by the same 1px. The
        script allows exactly that 1px for those cards; a reading that newly
        wraps in a compared condition would be a larger move.
      - Any other change, a larger move included, is a finding.
      - Check 3 (floor above every qualifier) reads the new ceiling and temp sizes.
      - The script's comment that calls the ceiling `--font-ui-medium` chrome is
        corrected.
- [x] Re-measured and recorded in the amended docs: the threshold in the app's
      terms (116) and in the harness (122.4 default, 173.6 at `text=24`, 122.4 on
      a phone), and the `text=24` point where `100 / 120` wraps.
- [x] Shots, before and after:
      - Before is `git show HEAD:styles.css > styles.css` over a harness built
        with any new views, as `pool-headline-narrow-fit.md` describes.
      - At default and `text=24`, at 1400 and 520, framed to **Hit points**
        (temporary points, calculated `/9`) and **Rolled HP** with `120` typed
        into its max by `&type=`.
      - The existing `pool-headline-*` and `headline-narrow-*` shots are
        re-shot. The floor is unchanged, so only Pools whose ceiling or pill
        grows at `text=24` differ.
      - No sample Pool has both temporary points and an owned ceiling, so these
        are two Pools rather than one, and `harness/samples.ts` is not changed.
- [x] `docs/UI.md` §5:
      - The floor sentence names the ceiling's token.
      - "A Pool's points stop at its ceiling's `--font-ui-medium`, which holds
        still" becomes the ceiling following the sheet with the qualifier as its
        floor.
- [x] `docs/BACKLOG.md` § UI:
      - The row "A Pool's temporary points stop growing at the ceiling's size" is
        removed.
      - The one-unit ceiling row gains its `text=24` widths (see below).
      - The row on a phone's pill size (Deliberately not doing) is already in
        the working tree, added with this spec.
- [x] `npm run lint`, `npm test` and `npm run build` pass. Shots come from
      `npm run harness`, then `npm run harness:shot`.

### At the land stop

`node harness/measure-pool-headline.mjs`, against the built harness, with the
baseline at `HEAD` (the version branch before this landed):

```
3008 measured, 0 failed, 18 printed as the one-unit Pool ceiling residue, 90 as an expected card-height move
```

- Every compared headline kept its width: 45 per comparison, at `6`, `10` and
  `100`, in the four unchanged conditions, with `field-sizing` on and off.
- The 90 moves are each exactly +1px, at `text=24` only: every Pool (Hit
  points 188.6 → 189.6, Stamina reserve, Ward and Reservoir 147 → 148, Rolled
  HP and Focus points 145 → 146, Ki at 380 145 → 146) and, on the 1400 sheet,
  Armour class and Passive perception in Hit points' row (188.6 → 189.6).
- The residue grew from 16 to 18 lines: at `text=24` a one-unit Pool's `6/9`
  on the 520 sheet now passes its card by 2.6px, and the worst is 15.1px a side.
- Check 9, the qualifier sizes: temp and Card pill 13.9, 20.8, 15, 15 (default,
  `text=24`, phone, tablet); ceilings 15, 20.8, 16, 16, the typed one equal and
  muted; 49 Track length fields and record ceilings at `--font-ui-small`; the
  Stat block's uses `/` and ceiling at `--font-ui-medium`.
- Probed in the harness: the threshold is 122.4px of card content at the
  default size and 173.6 at `text=24`; the 116 in the app is the arithmetic at
  a 15px sheet, which the harness cannot stage. `100 / 120` wraps below 135.5px
  of content at `text=24` (120.5 before) and 97.5 at the default (94.5).
- Shots: the 47 `pool-headline-*`, `headline-narrow-*` and new `pool-ceiling-*`
  views, taken through `harness/shot.mjs`'s own parameters per view rather
  than a full `npm run harness:shot` run. 17 differ from the before set, all
  of them Pools at `text=24` or the typed ceiling; the 30 others are
  byte-identical.

**Decided by the owner at the land stop:** the typed ceiling takes
`--text-muted` (Design step 2); its 8px from the slash, against a calculated
ceiling's 3px, is a `docs/BACKLOG.md` § UI row.

## Commit boundaries

1. `fix: Let a pool's ceiling follow the sheet's text size`. Contains
   `src/styles/tokens.css`, `src/styles/sheet.css` (the ceiling's size, the owned
   field's size and its `.is-mobile` guard, the temp cap removed, the threshold and the comments), the
   regenerated `styles.css` and `src/styles.test.ts`.
2. `test: Shoot a pool's ceiling and temporary points at both text sizes`.
   Contains the `harness/shot.mjs` views and the `harness/measure-pool-headline.mjs`
   comment and check updates.
3. `docs: Record how a pool's ceiling follows the text size`. Contains:
   - this doc
   - the `docs/UI.md` §5 sentences
   - the in-place amendments to `pool-headline-narrow-fit.md` and
     `headline-narrow-cell.md`
   - the three `docs/BACKLOG.md` rows: the one removed, the one amended and
     the phone pill row added

## Deliberately not doing

- **The own-value pill under a one-unit card's number draws empty.** Waits on its
  own ruling on a qualifier in a cell narrower than one digit.
- **A one-unit Pool's ceiling passing its card on a narrow sheet.** Recorded, not
  fixed.
  - This pass leaves its default-size numbers alone: `/9` 15.6, `/54` 24.8 and
    a calculated `/120` 34.0. Only an owned `/120` moves, 38.7 → 42.0.
  - It makes it wider at `text=24`, where `/9`, `/54` and `/120` grow to about
    20.3, 32.9 and 45.4px against 15.2 of content. That passes the card by up
    to 15.1px a side, against 9.4.
  - The measure script keeps printing these as `residue`, and the row is
    amended with them.
- **The wrapped temporary-points pill's spacing.** The pill wraps sooner at
  `text=24` now its field is wider. The gap between *Temp* and its value is that
  row's.
- **A card's note, its abbreviation and a Pool's *Temp* label** at a larger sheet
  size. They rank with the heading and stay `--font-ui-smaller`.
- **The temporary points and a Card's pill on a phone draw at 15.0px**, under
  iOS's 16px, today and after. That is `--sheetsmith-qualifier-small`'s phone
  floor (`--font-ui-small`), shared by every pill. It is not this pass's to
  change. It is a `docs/BACKLOG.md` § UI row, "A Pool's temporary points and a
  Card's pill draw under 16px on a phone".
- The WebKit select, Passport chip and empty card select rows.
- Any change to the Adjust control or the steppers.
