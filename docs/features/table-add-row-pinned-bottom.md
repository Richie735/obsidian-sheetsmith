# Table add row pinned to the bottom of the card

Status: shipped
Scope: On a Table with `openRows` on, the **Add row** control always sits at the bottom of the card. When the card is placed in a grid cell taller than its rows, it sits at the bottom of that cell, not under the last row. It stays there when rows are added or removed, when the table scrolls sideways, and when a column totals row is present.

Standard route (the mechanism exists: Record set's add control, `.sheetsmith-placed`). This **reverses a recorded decision**; see § Amendments.

## Model question

None. The control, the write, the focus landing and the file are unchanged: `context.onChange({ rows: {}, added: [{ name: '', cells: {} }] })` stays as it is. It touches no §13 question, grows no part of the §4.1 contract, publishes nothing, stores nothing, and cannot affect existing notes (Constraints 3 and 4 are not reached). It is a DOM and CSS change in `src/components/table.ts` and `src/styles/sheet.css`.

One fact the design rests on, checked in the code rather than assumed: **a Table has no placement floor of its own.** `.sheetsmith-placed` (the floor plus a flex column) is used by Rich text and Image; Table is not one of them, and `docs/BACKLOG.md` already records that §4's "a component fills its grid placement" is false of tables. A Table's cell can still be taller than its rows, because the grid row is sized by a taller neighbour or by a container's height floor, and a grid item stretches. Today the stretched container leaves blank space under a content-height `.sheetsmith-table-wrapper`, so the card visibly ends at the last row. Pinning the control therefore needs the card box itself to reach the cell's bottom, which is the part of this feature that is more than moving a button.

## What it does

The **Add row** control is drawn as the last thing in the card, below the rows and below any totals row, at the bottom edge of the card. When the card is stretched to a taller cell the card box fills the cell and the control sits at its foot, with the empty space between the rows and the control. Adding and removing rows, sideways scroll and totals do not move it.

## Scope

The full design, not a reduced one. Move the control out of `<tbody>` into a block under the table, inside the card box. Make the card box fill its cell as a flex column with the control `margin-top: auto`, **for an `openRows` Table only**; a closed Table is untouched. Keep the sideways scroll on a scroller around the table alone. Record set's add record follows with the same treatment, so "one treatment" survives.

## Design

**Structure.** Today: `container > .sheetsmith-table-wrapper (scroll, border, fill) > table > tbody > tr.sheetsmith-table-add`. Proposed: `container > .sheetsmith-table-box (border, radius, fill; flex column; fills the cell) > [.sheetsmith-table-wrapper (overflow-x only) > table] + button.sheetsmith-table-add-button`. The control is a sibling of the scroller, not a row, so there is no `<tr class="sheetsmith-table-add">` and no `colSpan`. The names below are indicative; the build picks them under PATTERNS §3.

**The card fills its cell.** The container becomes a flex column with the box taking the rest (`flex: 1 1 auto`, `min-height: 0` is not needed because the table grows, it does not scroll vertically: a Table's height stays a floor, not a cap). No `min-height` of the layout's declared height is added: the box stretches to whatever the grid row gives it. Only an `openRows` Table gets this, since a closed one has no control to pin. A closed Table is pixel-unchanged; there is no latitude to apply it more widely.

**The control.** Full width, `margin-top: auto`, a rule across its top, a centred label, the hover surface every control uses, an inset focus ring. This is the treatment `.sheetsmith-record-add` already wears (`border-top`, `text-align: center`, `--background-modifier-hover` on hover) and the treatment `UI.md` §9 already names, so no new vocabulary: the Table rule moves to the Record set recipe, not the reverse. The rule at its top is the one line between the rows and the control, so:

- the last body row drops its bottom border as `tbody tr:last-child` already does (it only kept it before because the add row sat beneath it);
- with a totals row, `.sheetsmith-table-has-totals` still keeps the line under the last row (above the foot), and the control's own top rule separates the foot from the control; no double line.

**Sideways scroll.** The scroller wraps the table only, so the control is outside it and never scrolls: its label is always visible without `position: sticky`. The `.sheetsmith-table-add-label` sticky rule and its `left` are therefore deleted, not carried. The acceptance shot still checks the label is in view at a narrow width with the table scrolled to both ends. The right-edge scroll shadow on the wrapper (background-image on the scroller) must still render, and the box border and radius move to the box so the scroller's right shadow does not paint over the corner.

**Totals.** The `tfoot` stays in the table, under the rows, because it belongs to the rows it counts (`open-rows-for-table.md`, "the number the mechanic exists for is the total"). The control is below it. In a tall cell the order top to bottom is rows, totals, empty space, control.

**Empty state.** An open Table with no rows keeps its `.sheetsmith-table-empty` line and the control at the bottom of the box. The control is the only thing that can fill the empty list, so it must remain reachable; in a tall cell it is at the foot with the empty line above it.

**Error state.** A misconfigured Table returns before the box exists and draws no control, unchanged.

**Interaction.** Press, **Row added** announcement, new row's name field focused: unchanged. The focus landing currently falls out of "the new row's controls sit immediately before the add button" by index within the cell; the button is still after every row control in DOM order, so the accident still holds, and its test (`table.test.ts` around line 3060) must keep passing and be re-read for the new DOM rather than assumed.

**Other users of the table machinery.** Roster declares no `openRows`. Track's row set uses its own Add and Remove pickers (`.sheetsmith-track-action-button`) and is untouched. `.sheetsmith-roster-card-table .sheetsmith-table` styling and `.sheetsmith-track > .sheetsmith-table-empty` must not move; the build checks them in the harness.

**Forced colors.** The rule is a border, which forced colors repaints as one system colour; the hover is `background-color`, which it drops. Hover must not be the only response: the label's `color` change is also dropped, so the control's focus ring (outline) is the one forced-colors signal, as for the control today. Same recipe as `.sheetsmith-record-add`'s block at line 6430; reviewer confirms in the forced-colors shot.

## Config fields

None. `openRows` already exists and its description (`Add row` is drawn when on) may name the position; the build updates the description only if it currently says "in the last row".

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| | | | |

## Data and file model

Unchanged. No new key, no new section content, no write difference. Parse then serialise stays byte-identical because nothing in `src/parse/` is touched; existing notes render identically except for the control's position.

## Amendments the build must make

Documents must not contradict the code once it ships:

1. `docs/UI.md` §9, row **A control in the row position** (`.sheetsmith-table-add`, `.sheetsmith-record-add`): rename (e.g. **The add control**), drop "in the row position" and "row-shaped", replace `.sheetsmith-table-add` with `.sheetsmith-table-add-button`, say Table's control is pinned to the foot of the card and does not scroll, and say whether Record set follows (it does: Record set follows). Keep the Track-pickers departure sentence verbatim.
2. `docs/features/open-rows-for-table.md`, "Adding a row": replace "The last row of the table is a single cell spanning its width ... in the row position, so it reads as 'the next row' ... picks up the row hover treatment the rows already have" with the pinned description, and record that it reverses that sentence, with the reason (the control marks the card's foot, and survives a taller cell). The focus-landing paragraph is amended to say the button is still after every row control. Do not rewrite shipped history elsewhere in that file; add a dated note rather than editing the argument.
3. `docs/SPEC.md` §4.2 Table, *Sheet view:* "an **Add row** control sits in the last row of the table" becomes "at the foot of the card, below any totals row". `docs/features/` text mentioning the control as a row is checked by grep (`Add row`, `table-add`) and amended or left alone as shipped history.
4. In `src/styles/sheet.css` the comment above `.sheetsmith-table-add td` / `-label` (the "row, in the row position" and sticky-label commentary) is replaced, not left stale. In `src/components/table.ts` the comment above the control ("A row-shaped control in the row position ...") is replaced. If Record set follows, `record-set.ts` line ~1925 and the "Table's own vocabulary" comment at `.sheetsmith-record-add` are amended to match.
5. `README.md` is checked for the wording (grep shows none today).

## Acceptance criteria

- [x] An open Table in a placement taller than its rows draws the control at the bottom edge of the card, and the card box (border, radius, fill) reaches the bottom of the cell. Checked in a shot.
- [x] With few rows in a tall placement the gap is between the last row (and totals) and the control, not below the control.
- [x] With many rows (card taller than the placement) the control is directly under the last row, with no extra gap.
- [ ] Adding then removing a row leaves the control at the bottom; its vertical position does not depend on row count in a tall placement (a test or a before/after pair).
- [x] With a column totals row the order is rows, totals, control; exactly one rule between each and no doubled line (`border` count in a shot or a DOM test).
- [x] Without a totals row the last row has no bottom border and the control's top rule is the only line.
- [x] At a width where the table scrolls sideways the control does not scroll and its label stays fully visible with the table scrolled to the left and right ends; the right-edge scroll shadow still appears on the table and the box's corners are not overpainted.
- [x] An empty open Table shows the empty line and a reachable control at the bottom.
- [ ] Press adds one row, says **Row added**, and focus lands in the new row's name field (existing `table.test.ts` cases pass, and one asserts the button follows the last `tr` in document order, outside `tbody`).
- [x] No `tr.sheetsmith-table-add` remains; no `position: sticky` on the label; no new colour, no hex.
- [x] Hover and focus-visible look and behave as Record set's add control; forced colors keeps a visible focus ring and a visible rule.
- [x] A closed Table, a Track row set, and a Roster are pixel-unchanged (shots compared) or any change is named in the review.
- [x] Touch: the control is at least the shared coarse-pointer target height (`UI.md` §7) and full width. A coarse-pointer render is not possible in the harness, so this is held by `styles.test.ts`: the shared add rule reads `min-height: var(--sheetsmith-inline-control, 1.6em)` and the coarse-pointer block raises that token to 2.2em; the rule is `width: 100%`.
- [x] Record set follows: `.sheetsmith-record-add` sits at the foot of the card in the same measured way, the two shots look like one treatment, and its scrolling list is not broken (the list scrolls, the control does not).
- [x] The amendments above are made and `grep` finds no remaining "row position" or "last row" claim about the control.
- [x] `npm run lint`, `npm test`, `npm run build`, then `npm run harness` and `npm run harness:shot`; the styles test passes (`styles.css` regenerated from `src/styles/`, never hand-edited).

Harness shots the design review needs: Table with `openRows` and few rows in a tall placement; the same with many rows; each with and without a totals row; a narrow width where the table scrolls sideways (the label stays in view, scrolled both ways; Chrome floors a viewport at 500px so the table must be made wide enough to scroll at 500px, per the BACKLOG note); forced colors; light and dark; Record set beside the Table if it follows. A scoped shot needs an explicit frame (`custom.png` is written at its own width) so wrap and clipping checks reproduce.

## Commit boundaries

1. `feat: Pin a table's add row to the bottom of the card`. The `table.ts` structure change, the `sheet.css` rules, tests, and the UI.md, open-rows-for-table.md and SPEC.md §4.2 amendments, with `styles.css` regenerated.
2. `feat: Pin a record set's add record the same way`. `record-set.ts`, its CSS and tests, and the §9 sentence that says the two are one treatment.

## Deliberately not doing

- The Track row set's Add and Remove pickers (`.sheetsmith-track-action-button`): a documented departure.
- Pinning the totals row, or giving a Table a placement floor, or making it scroll vertically. A Table's height stays a floor (BACKLOG row on §4's two families stays deferred).
- The editor pane, the formula engine, storage, and how a row is added.
- Backlog rows, unless this change makes one fail.

## Owner decisions

1. **Does Record set's add record follow?** Yes. Table is built first, Record set second, in the two commits above.
2. **What does "bottom of the card" mean in a taller cell?** The bottom of the grid placement: the card box stretches to the cell.
3. **Where does it sit relative to the totals row?** Below it. In a tall cell the order is rows, totals, space, control.
4. **Which Tables stretch?** Only `openRows` Tables. A closed Table is pixel-unchanged.
