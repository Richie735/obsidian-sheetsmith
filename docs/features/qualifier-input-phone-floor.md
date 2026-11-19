# Qualifier input phone floor

Status: withdrawn, not shipped (2026-11-19): on an iPhone 17 under Obsidian 1.15.1 a tap into the fields does not zoom the page, so there is nothing to fix
Board card: A Pool's temporary points and a Card's pill draw under 16px on a phone (`docs/BACKLOG.md` § UI)

Route: standard. No `SPEC` §13 question is open on this. The ruling the row
waits on, whether a qualifier on a phone input may grow to 16px, is settled
below with numbers.

## Withdrawn

**Closed by the owner without a build, 2026-11-19.** Device check 1 was run on an
iPhone 17 under Obsidian 1.15.1: a tap into a Pool's temporary points, a Card's
own-value pill and Obsidian's own search field does not zoom the page. Obsidian's
bundle sets `maximum-scale=1.0, user-scalable=no` in its viewport, which
suppresses iOS's focus zoom. So the premise the BACKLOG row rested on does not
hold in the app, and no CSS changes: the typed ceiling's `.is-mobile`
`max(16px, …)` guard stays as shipped, as a guard.

The BACKLOG § UI row "A Pool's temporary points and a Card's pill draw under
16px on a phone" is retired; the backlog deletes a closed row, so its closing
note is here. **A zoom seen on a future iOS or Obsidian version reopens it**, and
this doc's Design is then the build. **The Inventory below is kept as the record
and is not a BACKLOG row**, since nothing on it zooms either: Track row names and
Table secondary cells 10.88px, a card's note 12.80, and Table, Record set,
Passport, Picture, Rich text, Track length and the narrow Pool Adjust fields
14.99, all at 380 under phone staging. The ruling and the measurements below
stand as written.

## Model question

None in `SPEC` §13. Nothing stored, published or resolved changes; this is a
font size under `.is-mobile`. The row's own ruling is settled here.

### The ruling: a qualifier on a phone input may grow to 16px

**Yes, because on a phone 16px is already the size of the largest qualifier.**
The floor was built to sit one step above it, so the change leaves every rank
where it is.

Measured over the DevTools Protocol against the built harness
(`state=populated`, a 380 viewport under `platform=phone` unless named).
Obsidian's phone CSS sets `--font-preferred-size` to the 16px `--font-text-size`
times `env(preferred-text-scale, 1)`, `--font-ui-medium` to that size and
`--font-ui-small` to 0.937 of it (`harness/obsidian.generated.css`, the
`.is-mobile` block). The sheet's `em` there is 16px, the app's phone body.

| Size, phone, default | Derivation | Computed |
| --- | --- | --- |
| `--font-ui-small` | 16 × 0.937 | **14.99** |
| `--font-ui-medium` | 16 | **16** |
| `--sheetsmith-qualifier-small` (the pill, the temp field) | `max(14.99, 13 × 16 / 15 = 13.87)` | **14.99** |
| `--sheetsmith-qualifier-medium` (the ceiling) | `max(16, 14.99)` | **16** |
| `--sheetsmith-headline-floor` | `max(18.67, 1.2 × 16)` | **19.2** |
| A typed ceiling (`.is-mobile` guard) | `max(16px, 16)` | **16** |

The ruling's three questions:

1. **Does a 16px pill still read as a qualifier under a floor headline?** The
   floor is defined as one minor-third step above the largest qualifier,
   `1.2 × --sheetsmith-qualifier-medium`, and on a phone that qualifier is the
   16px ceiling. A 16px pill is that qualifier's size, so 16 / 19.2 = **0.833 =
   1 / 1.2 exactly**: the step the floor was built on, not a new ratio. Measured
   at the floor in a one-unit cell (820 under `platform=tablet`,
   `&place=load:11,1&place=hit_points:5,1`, 58.2px cards): Load's headline is
   19.2 and its pill 14.99 → 16, and Hit points' headline is 19.2, its temp
   field 14.99 → 16 and its ceiling 16. Against an unshrunk 28px headline the
   ratio is 0.535 → 0.571; on the desktop at its own size it is 13.87 / 28 =
   0.495, unchanged. At the phone's floor the pill is exactly as far below the
   number as the ceiling beside it, which the floor already accepts.
2. **Does the temp field outrank the ceiling beside it?** No: it ties at 16.
   **A tie holds the rule.** The rule
   (`docs/features/pool-ceiling-text-size.md`) is that the points are *never
   larger* than the ceiling, and they already tie it at every sheet size above
   17.3px: 17.33 at `text=20` and 20.8 at `text=24`, measured, today. So a tie
   on a phone at the default is the state the rule already allows everywhere
   the qualifier follows the sheet.
3. **Is the rule general?** **The rank argument is specific; the zoom is not.**
   The argument above covers only a qualifier under a headline: the pill and the
   temporary points. Every other sheet field under 16px on a phone (Inventory,
   below) is not a qualifier, so neither this argument nor its numbers reach it.
   Growing those has its own costs: a record line's stacking tiers and the Track
   row pitch were measured at their current sizes. But if iOS zooms, it zooms on
   all of them. So the remaining fields become **one new BACKLOG row** (proposed
   below, added by the dev), not part of this build.

**Corrections to the figures in the brief.**

- "On a phone the ceiling is at least 16px by its own guard": only a **typed**
  ceiling has the guard. A calculated ceiling, `/9` on Hit points, is 16px
  because `--font-ui-medium` happens to be 16px there. That matters: under a
  smaller iOS text size the host token drops, and so does that ceiling. With
  `--preferred-text-scale: 0.875` injected under tablet staging, the calculated
  ceiling measured **14.00**, the pill and temp field 13.87, and the floor 18.67.
  This is the case the Design below is chosen for.
- Every other figure checks out: `--font-ui-small` 14.99 on a phone (rounded to
  15.0 in the brief), the floor 19.2, `--sheetsmith-qualifier-medium` 16, and the
  0.83 ratio.

**What the zoom premise rests on, and what it does not.** The 16px rule
(`docs/UI.md` §5) is iOS WebKit zooming the page when a field under 16px takes
focus. That zoom does not fire where the page's viewport sets
`maximum-scale=1`. **Obsidian 1.15.1's desktop `index.html` carries
`width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no,
viewport-fit=cover`**, read out of the installed asar for this spec, and
`app.js` never rewrites it. Obsidian's own `input[type=text]` and `select` draw
at `--font-ui-small`, 14.99px on a phone, with no `.is-mobile` rule raising
them. The mobile bundle's `index.html` remains unread, as
`layout-editor-narrow-regime.md` device check 3 already records. So the zoom may
never fire in the app. That is unverified either way, and **device check 1
(Acceptance criteria) settles it before the land stop.**

- If the tap does zoom, this is the fix and the new row is urgent.
- If it does not, the build still stands. It matches the typed ceiling's guard,
  which shipped on the same premise; it costs 4px of pill width; and it holds
  when the host's viewport changes. The new row is then recorded as
  insurance, not a defect. The owner may instead close the row on that
  evidence, with no build.

### Rejected, so they stay rejected

- **`maximum-scale=1` on the viewport.** It fails WCAG 1.4.4 (Resize text),
  since it also blocks the reader's own pinch zoom. It is the host's document
  anyway: a plugin that rewrote Obsidian's `<meta name="viewport">` would change
  every view in the app, not the sheet. That the host already sets it (above) is
  a fact about the host, not a licence to set it.
- **Draw the field at 16px and scale it down with `transform`.** A visual trick:
  the layout box, the hit target, the caret and the selection highlight stay at
  the 16px geometry while the glyphs draw smaller. The field's box no longer
  matches its text, and a tap near the drawn edge lands outside the real one.
- **A rule per field, `max(16px, var(--sheetsmith-qualifier-small))`, the
  typed ceiling's shape.** Not rejected outright: it is the Smallest version
  below. It is not the Design, because it holds the 16px but not the rank.
  Under the 0.875 text scale above, it draws the temp field at **16 beside a
  14.00 calculated ceiling**, which breaks the rule question 2 settles.

## What it does

On a phone or a tablet, a Card's own-value pill and a Pool's temporary points
never draw under 16px. At the app's own phone sizes they move from 14.99 to 16px
and every rank on the card holds: the pill ties the ceiling, and the floor stays
one step above both. Nothing changes on the desktop, or anywhere the sheet's
size already draws them at 16px or more.

## Smallest version

Three `.is-mobile` rules beside the existing guard, in `sheet.css`: the temp
field, the pill's input and the pill's select each take
`font-size: max(16px, var(--sheetsmith-qualifier-small))`. The typed ceiling's
precedent, test included. At the host's own token sizes it draws pixel-identical
to the Design in every harness condition measured. **It gives up the rank under
a smaller host token:** at a 0.875 iOS text scale the temp field draws 16 beside
a 14.00 calculated ceiling. In exchange, a user snippet that overrides
`--sheetsmith-qualifier-small` cannot bring the fields back under 16px.

## Design

1. **The guard goes in the token, under `.is-mobile`.** `src/styles/tokens.css`,
   in its own rule after the `body` block:

   ```css
   .is-mobile {
   	--sheetsmith-qualifier-small: max(16px, var(--font-ui-small), calc(13em / 15));
   }
   ```

   - `.is-mobile` sits on `body`, so this outranks the `body` declaration at
     (0,1,0) against (0,0,1), whatever the order. `--sheetsmith-qualifier-medium`
     and `--sheetsmith-headline-floor` are declared on `body` too and substitute
     `var(--sheetsmith-qualifier-small)` there, so they read this value with no
     edit of their own. Measured: redeclaring only this token gives the same
     numbers as redeclaring all three.
   - The `em` term still resolves where the token is used, as the existing
     comment says, because a custom property keeps `13em / 15` as tokens.
   - `.is-mobile`, not `.is-phone`, for the typed ceiling's reason: an iPad
     zooms on the same rule.
   - **Why the token and not the fields.** Lifting the qualifier lifts
     everything built on it. The ceiling becomes `max(--font-ui-medium, ≥16)`,
     so it is never under the points. The floor becomes `1.2 ×` that, so it is
     never under 19.2. Every rank holds by construction under any host token. At
     the 0.875 scale: pill, temp and ceiling 16, floor 19.2 (headline 18.89 →
     19.2 in the one-unit cell). The per-field rules hold only the 16px.
   - **Who reads the token**, all of them fields:
     - `.sheetsmith-view .sheetsmith-card-has-derived .sheetsmith-card-input`:
       the pill on a Card, on a Card set tile, and a Roster card's score.
     - `.sheetsmith-view .sheetsmith-card-has-derived .sheetsmith-card-select`:
       the pill on a Card with options. It is the same pill on the same three
       rules (`sheet.css`, "The menu in the pill"), and a `<select>` under 16px
       zooms as an input does, so it is in scope with the input. A reviewer
       should not report it as scope creep.
     - `.sheetsmith-view .sheetsmith-pool-temp-input`.
     - Through `--sheetsmith-qualifier-medium`, the ceiling spans, the typed
       ceiling and a Stat block's uses counter. All three are 16px on a phone
       today and stay 16 at the host's own sizes. Only under a smaller host
       token do they rise to 16.
   - **The typed ceiling's `.is-mobile` rule stays** as written, test and all.
     At the host's sizes it is now redundant. What it still guards is a user
     snippet that lowers the plugin's own `--sheetsmith-qualifier-medium` at a
     specificity past `.is-mobile`. Removing it is not this pass's change.
2. **The comments say why.** The token's comment in `tokens.css` gains a
   paragraph: on a phone, the 16px term; the ruling (0.833 = 1 / 1.2 at the
   floor, a tie with the ceiling); why the token and not the fields (the 0.875
   measurement); and a pointer here. Its sentence "the `em` term alone came out
   at 13.9px against the 15px the pill drew" stays true and gains the 16. The
   `.sheetsmith-pool-temp-input` and pill comments in `sheet.css` need no change
   unless they state a phone size; the dev checks.

**What a reader sees.** On a phone at the default size, the pill's digits grow
from 14.99 to 16px. Measured at 380 under phone staging:

- **Card pill**: 60 → 64px wide (`4em` of its own size), height unchanged at the
  44px touch floor. No card moves.
- **Temp field** on Hit points: 36.3 → 38.2px wide, height 44. The card does not
  move.
- **The select pill** on Stealth (a Card with options): 71.5 × 15.7 →
  75.5 × 16.8, and **its card grows 1.1px** (146.5 → 147.6). That is the one
  card-height change at the default phone size, and it is expected.
- **One-unit cell at the floor** (tablet 820): Load's pill stays 22.2px wide and
  holds `0`. Hit points' temp field stays 30.2.
- **At `text=20` and `text=24` on a phone, nothing moves**: the qualifier is
  already 17.33 and 20.8.
- **On the desktop, nothing moves** (1400 at the default and at `text=24`,
  measured with the candidate injected): `.is-mobile` is absent.
- **The one-unit pill on a 520 phone** draws 4px wide and clips its value, before
  and after. That is the deferred empty-pill row, not this one.

There is no new interaction. The empty state (`—`, no pill) and the error state
are unchanged.

### Inventory: every other sheet field under 16px on a phone

Computed `font-size` of every visible `input`, `select` and `textarea` under
`.sheetsmith-view`, at 380 under phone staging. States: `populated`, `forms`,
`record-groups`, `notes`, `effective`, `forms-roster-score` and
`forms-roster-band`. Sizes are px. **Not in scope; for the new row.**

| Field | Selector | Default | `text=24` |
| --- | --- | --- | --- |
| Track row name | `.sheetsmith-track-row-name-input` | **10.88** | 10.88 |
| Table secondary cell | `.sheetsmith-table-input-secondary` | **10.88** | 10.88 |
| Card note | `.sheetsmith-card-note-input` | **12.80** | 12.80 |
| Track row length | `.sheetsmith-track-row-length-input` | 14.99 | 14.99 |
| Table cell, number and text, linked | `.sheetsmith-table-input` | 14.99 | 14.99 |
| Table menu, and a Roster level menu | `.sheetsmith-table-select` | 14.99 | 14.99 |
| Record name, linked or not | `.sheetsmith-record-name-input` | 14.99 | 14.99 |
| Record number field | `.sheetsmith-record-field-number .sheetsmith-record-input` | 14.99 | 14.99 |
| Record ceiling, line and worked-out | `.sheetsmith-record-input.sheetsmith-pool-max` | 14.99 (some 16) | 14.99 (some 16) |
| Record menu, and a Stat block menu | `.sheetsmith-record-select` | 14.99 | 14.99 |
| Record body | `.sheetsmith-record-body-input` | 14.99 | 14.99 |
| Passport field, and a Passport chip (part) | `.sheetsmith-passport-input` | 14.99 | 14.99 |
| Picture source field | `.sheetsmith-image-input` | 14.99 | 14.99 |
| Rich text body | `.sheetsmith-rich-text-input` | 14.99 | 14.99 |
| Pool Adjust amount, container under 160px | `.sheetsmith-pool-adjust-amount` | 14.99, read from `sheet.css`, not measured | same |

At or over 16 already: Table name cell (16), typed Pool ceiling (16), every
headline (28 or the 19.2 floor), Passport name (28), a Stat block number (26.24),
a Roster band value (28), and the Adjust amount above 160px (16).

Off the sheet and not listed: the anchored panel and popover hang off `body` at
the app's `--font-ui-small`, and the layout editor's fields are the app's own.

**Proposed BACKLOG row, not added** (the tap check found no zoom; § Withdrawn):

| Sheet fields other than a qualifier draw under 16px on a phone | `styles/sheet.css`; `docs/features/qualifier-input-phone-floor.md` § Inventory | Track row names and Table secondary cells draw 10.88px, a card's note 12.80, and Table, Record set, Passport, Picture, Rich text and Track length fields 14.99. iOS zooms on a tap into each, unless Obsidian's mobile viewport stops it. The qualifier ruling does not reach them: none ranks under a headline. | device check 1 there finding the zoom fires |

## Config fields

None.

## Data and file model

Nothing stored changes. CSS only, so Constraints 3 and 4 are untouched.

## Acceptance criteria

*Withdrawn: only device check 1 was run, and it closed the row. The rest
records the build that was planned, not open work.*

- [x] **Device check 1, before the land stop, the owner's.** Done 2026-11-19
      (§ Withdrawn): no zoom. Run it on an
      iPhone, then an iPad if one is to hand, in the throwaway vault
      (`~/Developer/sheetsmith-test-vault/`), on `Characters/Harness
      populated.md` (layout `Harness populated`).
      - On the version branch **before** this change, tap Hit points' temporary
        points field and Strength's pill. Record whether the page zooms. Then
        tap a Record set name and a Table cell, the new row's fields.
      - Record what the mobile `index.html`'s viewport says, if it can be read.
      - On this branch, tap the same two. The page does not zoom, and the digits
        are visibly the ceiling's size.
      - The result goes in this doc under **At the land stop**, and decides the
        proposed row's wording (urgent or insurance, Model question).
- *Not built:* `src/styles/tokens.css` declares, in a rule whose selector is exactly
      `.is-mobile`:
      `--sheetsmith-qualifier-small: max(16px, var(--font-ui-small), calc(13em / 15))`.
      - `src/styles.test.ts` holds the string and asserts it matched exactly one
        rule (PATTERNS §10).
      - It asserts the `body` declaration is unchanged.
      - The typed ceiling's test passes untouched.
- *Not built:* `harness/measure-pool-headline.mjs` passes, with `field-sizing` on and off,
      against the version branch's `styles.css` as baseline. Output is pasted at
      the land stop.
      - **Check 9** gains a phone and tablet assertion: the temp field and the
        Card pill are at least 16px, and equal. Its expected phone and tablet
        sizes read 16, not 15.
      - The temp field is still never above its ceiling, which the check already
        asserts.
      - **Desktop**: every width and card height is identical in every
        condition.
      - **Phone**: every headline keeps its size and width. Any card-height
        change is named. None is expected among the measured Pools and Cards: the
        pill and the temp field are 44px tall under a coarse pointer either way.
- *Not built:* Measured in the harness under phone (380) and tablet (820) staging at the
      default size, recorded at the land stop:
      - Pill and temp field 16; ceiling 16; floor 19.2.
      - With `--preferred-text-scale: 0.875` injected on `body.is-mobile`: pill,
        temp and calculated ceiling all 16, floor 19.2. The temp field is never
        above its ceiling.
      - At `text=24`, pill and temp 20.8, unchanged.
      - Every field in the Inventory table keeps its listed size: the token
        reaches no other field.
- *Not built:* **Shots, before and after.**
      - Before is `git show HEAD:styles.css > styles.css` over a harness built
        with any new views, as `pool-ceiling-text-size.md` describes.
      - Restore `styles.css` before the gates.
      - Views, added to `harness/shot.mjs` if none frames them:
        - `qualifier-phone-380-pool` and `qualifier-phone-380-cards`: a Pool
          with temporary points (Hit points, `frame: poolCell('Hit points')`), and
          the Card set of abilities with its pills, under `platform: 'phone'` at
          `size: '380,1900'`.
        - The same two at `text=24`.
        - `qualifier-tablet-820-floor`: the one-unit Load and Hit points cells
          (`&place=load:11,1&place=hit_points:5,1`) under `platform: 'tablet'`
          at 820, headline at the 19.2 floor.
        - The Stealth select pill under phone staging at 380.
      - Take scoped views with their canonical `size`, since a scoped run
        otherwise writes `custom.png` at its own width.
      - The existing `pool-headline-phone-380` and `pool-ceiling-*` shots are
        re-shot. Only phone and tablet shots differ, and only at the pill and
        the temp field.
- *Not built:* `docs/UI.md` §5: the qualifier sentence ("a phone keeps its larger token")
      says a phone or tablet draws it at no less than 16px, through the token,
      and points here.
- *Not built:* `docs/features/headline-narrow-cell.md`'s qualifier table, phone row: the
      pill and temp columns read 16, with a dated *Amended by* line naming this
      doc, as the table already carries one. The floor column is unchanged.
- [x] `docs/BACKLOG.md` § UI: the row "A Pool's temporary points and a Card's
      pill draw under 16px on a phone" is removed, with its closing note in
      § Withdrawn. The proposed row is not added (§ Withdrawn).
      `src/backlog.test.ts` passes.
- [x] `npm run lint`, `npm test` and `npm run build` pass. No shots: nothing
      drawn changes.

## Commit boundaries

Applied by `/land-it` at the end, never during the build. Withdrawn, so one
commit and no source, style, test or harness change.

1. `docs: Withdraw the qualifier phone floor after a tap check found no zoom`.
   - This doc, marked withdrawn with its closing note.
   - The `docs/UI.md` §5 sentence on Obsidian's viewport.
   - The `docs/BACKLOG.md` § UI row removed.

## Deliberately not doing

- **Every other sheet field under 16px on a phone** (Inventory). That is the
  proposed BACKLOG row, gated on device check 1.
- **The empty own-value pill on a one-unit card.** It still draws 4px wide and
  clips its value at a 520 phone, before and after.
- **The typed ceiling's 8px gap from its slash.**
- **The one-unit Pool ceiling wider than its card.**
- **The wrapped temporary-points pill's spacing.**
- **A card's note, its abbreviation and a Pool's *Temp* label.** They rank with
  the heading at `--font-ui-smaller`; the note is in the Inventory for the zoom
  only.
- **The WebKit select, Passport chip and empty card select rows.** The pill's
  own select is in scope (Design step 1). The Passport chip's field is in the
  Inventory.
- **The Adjust control and the steppers.** The narrow Adjust amount is in the
  Inventory.
- **Removing the typed ceiling's `.is-mobile` rule**, now redundant at the
  host's sizes. It stays as written (Design step 1).
- **Any change to the viewport**, the host's or a plugin-set one (Rejected).
