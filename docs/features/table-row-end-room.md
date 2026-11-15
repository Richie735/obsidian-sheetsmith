# Table row end room

Status: shipped (the full design, approved by the owner on 2026-11-14; landed 2026-11-15)
Board card: `docs/BACKLOG.md` § UI, three rows with one cause: "A Table or Roster ending on a ring can put its doors 6px out of line", "A row-end door follows its value's width, so a `?` Total puts it 6px out of line", and "A form's tag covers a name in a Table's or a Roster table's row"

Standard route. The mechanism is already in the repository: `finishRowDoor` (`components/state-ring.ts`) puts one door at a row's end, `reserveNoteSlots` (`components/note-mark.ts`) keeps a column's slot, and `carrierOf` (`view/placement-decorations.ts`) lets a component name where a tag goes. Precedent: ad203d8, which moved the Table's door to the row's end, and 0f8c6ee, which moved a Roster card row's tag to the card's corner, a move a table row cannot make.

## Model question

None. This changes where three things are drawn on a row. It stores nothing, publishes nothing, leaves the §4.1 contract as it is, and no open §13 question bears on it.

## What it does

A Table row and a Roster table row set aside fixed room at their inline end. A door, a note mark and an empty slot all sit in the same place there, whatever the value before them is (a ring, a number or a `?`). While a form is in play on a table, each of its rows also sets aside a lane after that slot. The row's form tag sits in that lane instead of over the row's name. The end column's heading and its Totals cell take the same room, so they stay centred over the values.

## Smallest version

**Not chosen.** The owner approved the full design. This version is kept as the record of what was offered.

Apply both changes to the row-end column only: the end cell of each body row, plus that column's heading and foot cell. Pin the door, mark or slot at those cells' inline end with one 2px gap, and add the tag lane after it. That closes all three rows, since all three happen at the row's end. The end-column work stays whole: the name-last ruling, the head and foot room, the lane in px tokens, and the vertical placement.

What it **cannot** delete: `.sheetsmith-level-ring + .sheetsmith-note-mark` (8px) and the `td.sheetsmith-note-column::after` empty-slot box both still serve mid-row note columns. So the end column overrides them with rules scoped to the row-end class, and a mark ends up with two placement rules. What it **can** delete: nothing outright. Even the 8px `.sheetsmith-table-level::after` rule is only overridden in the end column, because a mid-row ring column with a mark still needs it. What it gives up: a mid-row noted column still shifts with a `?`, and its heading stays half a slot off its values. That case is not a backlog row today, and would become one.

## Design

**The one answer.** A table row's end cell reserves room in this order, from the inline start:

1. **The value**, centred in what the cell has left. A ring, a number, a `?` or a field.
2. **The slot**, where its column is a slotted one. This is one gap (`--size-2-1`, 2px) and one inline control box (`--sheetsmith-inline-control` at `--font-ui-small`), set aside as the cell's inline-end padding. The slot holds the row's door, or a note mark, or nothing. A door and a mark never share one cell: `finishRowDoor` puts the row's notes into the door whenever a ring on the row was set.
3. **The tag lane**, only while the table holds a row tag. It is a gap, `--sheetsmith-tag-gap` (`--size-4-5`, 20px, wider than the gap between a ring and its door so the door reads as the value's and not as the tag's), and `--sheetsmith-tag-lane` (see "The lane's width" below). The tag sits at the lane's inline start, centred on the row, and clips at the lane.

Then, on an open table, comes the delete cell, which is the row's removal and not one of its values (ad203d8's ruling).

**The end cell is the row's last value cell, never its name.** `namePosition` can put the name column last (`table.ts`'s `order`, and the same key on Roster). Today `finishRowDoor` is handed `tr.lastElementChild`, which in that case is the sticky `th[scope="row"]`. The Table and Roster callers instead hand it the last value cell in display order: the last `td` before an open table's delete cell, skipping the name `th` wherever it falls. So on a name-last row the door, slot, lane and tag all sit in the cell just before the name, and the tag ends up next to the name it belongs to. The sticky name cell is never stamped as a row end and never takes `sheetsmith-in-play-marked`, whose `position: relative` would unpin it. This moves a name-last table's door out of its name cell, which ad203d8 left there by accident of `lastElementChild` rather than by ruling. No starter layout or harness state sets the name last, and the new harness state includes one (below). A row with no value cell at all has no end. Such a row publishes nothing, so no form can tag it, and the pass's last fallback (the name cell, then the first cell) is kept only so a stray tag still has somewhere to be spoken from.

**The mark stays next to the value it marks, and the tag goes on the outside.** The mark is "a glyph beside" its number (`note-mark.ts`), and the door carries the row's accounts. Putting the tag outermost means the lane can come and go without moving any slot relative to its value, and the slot is there to keep each column lined up. A tag between the value and the slot would move every door in the table when the lane appeared.

**Why both causes go away.** Today the value and its door, mark or slot are one group centred in the cell, so the door follows the value's width (row 2). And the gap after a ring depends on what follows it: 2px for a door, 8px for a mark or an empty slot (row 1). Under this design the slot is padding, which no value width moves. A door or mark is positioned at the cell's inline end within that padding, and the empty slot is the padding with nothing in it. That leaves one gap with no case for "after a ring". This matches the door's existing 2px ruling (`sheet.css`, "A 2px gap rather than a ring's 8px reach"). The mark is now positioned and later in the cell than the ring, just as the door is, so it stacks over the ring's outward reach, and a press on its first pixel lands on the mark. Under the full design the 8px rules exist only because the mark used to sit in flow under that reach, so they are deleted: `.sheetsmith-level-ring + .sheetsmith-note-mark` and `td.sheetsmith-note-column.sheetsmith-table-level::after`. So is the `::after` box itself. (Under the smallest version they stay; see above.)

**Vertical placement: try the static position first.** Taking the door or mark out of flow loses what centres it on the digits today: the number keeps its baseline, the glyph is `vertical-align: middle`, and `top` raises it by half of `1cap` minus `1ex` (`sheet.css`, "After a number, the mark is centred on the digits"). The build tries this first: the glyph becomes `position: absolute` with only `inset-inline-end` set, and its block insets left `auto`. That way it keeps its **static block position**, which is where `vertical-align: middle` would put it in flow. The `1cap`/`1ex` raise then moves from `top` (which has to stay `auto`) to a `translate`, inside the same `@supports (top: 1cap)` guard, so iOS WebKit 16.4 to 17.1 keeps plain `middle` as it does today. The slotted cell takes `position: relative` as the glyph's containing block. That is safe, because a slotted cell is never the sticky name cell. If Chrome does not place the static position by `vertical-align`, the fallback is `inset-block-start: 50%` with a `translate` that carries the same cap-minus-ex difference, measured against the cell's line box. Either way the guard is criterion 2: the glyph's centre stays where today's tree puts it, and the glyph takes no height from the line.

**As built: neither, because both failed criterion 2, and the glyph stays in flow.** Measured on `modifier-states` (`measure-row-end.mjs`'s `digits`, glyph centre less the digits' centre; today's tree −2.2, −3.5 and −5.0px at Text 16, 20 and 24): the static position is the line's top, not its middle, so `vertical-align` is ignored and the glyph read −2.5, −6.9 and −11.4; the `inset-block-start: 50%` fallback centres it on the line box, whose centre sits about 0.11em off the digits by the font's ascent and descent, which no CSS unit gives, and read −3.9, −5.8 and −7.8. So the pin is horizontal only: **the value fills the content box** (a number `width: 100%`, its text centred; a ring centred in it by percentage margins, which count for nothing in the column's intrinsic width), and **the glyph stays in flow after it with `margin-inline: var(--size-2-1) calc(-1 * var(--sheetsmith-row-slot))`**, handing its room back, so it starts one gap past the content box whatever the value's width. It keeps today's line, `vertical-align: middle`, the `top` raise inside `@supports (top: 1cap)` and the negative block margins, so it reads −2.2, −3.5 and −5.0, today's figures to the tenth. It stays `position: relative`, so it still stacks over a ring's reach. A field holding a mark keeps its own fixed width and centring, and its glyph sits a gap past it: a column of fields reserves nothing, so there is no empty slot it has to meet.

**Every slotted cell, not only the end cell (full design).** `reserveNoteSlots` already decides which cells are slotted, by column, after the rows are drawn (PATTERNS §5, a stamped class). The pin is the rule for `.sheetsmith-note-column` and for every cell holding a mark or door, wherever in the row it is. That way a mark has one placement rule. Fields keep today's exclusion (`reservable`), so a field cell with no mark takes no padding. A field cell holding a door or mark takes the padding as it takes the group today.

**The heading and the foot take the column's room.** Body cells are centred in what is left after the padding, and a heading is centred on the whole cell (`.sheetsmith-table th, td { text-align: center }`). So any padding on body cells alone leaves the heading off by half of it. Today that is half the slot. With a lane it would be half the slot plus half the lane. The ruling: **a slotted column's foot cell takes the same inline-end padding as its body cells, and its heading takes the slot's room only where it fits** (as built, the owner's ruling at the land stop; see the paragraph after the list). In the end column the lane is padding on the heading and the foot as on the body while it is shown. Two stamps carry this:

- `reserveNoteSlots` already walks every row of the table, `thead` and `tfoot` included. It now stamps a slotted column's heading cell with a heading variant of the column class, which pads it without drawing anything. It also stamps the foot cell whether or not that cell holds a drawn value: a Totals cell is a value, and an empty foot cell under a slotted column still has to keep the line-up. This replaces today's "Body and foot cells only" rule for heading cells (the `sheet.css` comment on the noted column).
- The code that builds the head row and the foot row (Table and Roster) stamps each of those rows' last value cell with the row-end class, just as `finishRowDoor` does for a body row. The lane's padding reads the row-end class, so it reaches the head and the foot as well.

**As built: the heading never widens its column for the slot.** The first build padded the heading like its body cells, so a heading that was its column's widest content widened the column by the slot, and Skills' Training at 520 with no form pushed Stealth's door and Perception's mark past the wrapper. The owner ruled that the column must not grow, and chose this route. The heading's slot is an empty box after its words (`th.sheetsmith-note-heading::after`), whose start margin is `min(var(--sheetsmith-row-slot), 100%)`. A percentage counts for nothing when a column's width is worked out, so the box never widens the column. Where the words and the box fit in the cell, the line centres both, which puts the words exactly over the values. Where they do not fit, the line starts at the cell's start, so the words sit between their values' centre and the cell's. The heading clips what overflows it (`overflow: hidden`), which is only ever that empty box: in a last column it had made the table's scroller scroll by it. So **a heading is centred over its values within 1px where it is no wider than its values. A wider heading sits anywhere from partly shifted up to half a slot off (11.4px at Text 16), and centres on the whole cell where its words plus the slot overflow it.** The lane still pads the end column's heading, since the lane is real room every row takes.

**The row tag moves to the row's end cell.** `finishRowDoor` stamps the end cell it is now handed with a row-end class (for example `sheetsmith-row-end`) before doing anything else, including on a row where no ring was set. In `applyDecorations`, a row with no named carrier falls back to its row-end cell, then to `th[scope="row"]`, then to the row's first cell. This replaces today's first choice, the name cell. `carrierOf` stays the same, so the lookup still goes down before up, and two placements keep their carriers: a Roster card's rows (the card, `TAG_BOX_ATTRIBUTE`) and a Roster band head (its tag line). Their end cells carry the class too, but the carrier is found first.

**The lane class is stamped only when the tag's host is a row-end cell.** A band head's tag also takes `IN_PLAY_MARK_INLINE`, so "a table holding an inline tag" would give a band's table an empty lane. The pass therefore stamps the lane class (for example `sheetsmith-in-play-lane`) on `host.closest('table')` only when the host carries the row-end class. It clears that class at the start of each pass, along with the classes it already clears. The stylesheet reads the class to add the lane's padding to every row-end cell of that table, head and foot included, so every row of a tagged table has the same slot position.

**The lane's width is in px tokens, and the tag clips at the lane.** `12ch` of the tag's font cannot be cell padding: `ch` resolves in the cell's own font, and no ancestor resolves the tag's font into a length a registered property could carry. The ruling: `--sheetsmith-tag-lane` is declared once on `:where(.sheetsmith-view)` from the tag's own size token, roughly `calc(7.5 * var(--font-ui-smaller) + 2 * (var(--size-2-2) + var(--size-2-1)))`. That is about the width 12ch of a UI font takes at that size, plus the tag's inline padding, which comes to about 102px at Obsidian's 12px default. The build measures the factor against today's tag and records it here.

**Measured: `calc(7.56 * var(--font-ui-smaller))`, 90.7px at 12px.** Today's tag clips at `min(12ch, …)` with `box-sizing: border-box`, so its 12ch, 90.70px at the harness's 12px `--font-ui-smaller`, is the whole box, padding included; the rough formula above counted the padding twice. The lane is that box, and the tag's `max-width` is the lane, so a tag clips where it clipped before. The gap before it is the one `--size-2-1`. On a row, the tag's `max-width` becomes the lane's width, and a longer name clips with its ellipsis, which the reveal already answers (`reveal`, as today). The lane and the tag read one token, so a theme that changes `--font-ui-smaller` moves both, and the existing deferral stays consistent. The `docs/BACKLOG.md` row "A Stat block's tiles, its Modifiers line, a Card set's own-value pill and the form tag do not follow the sheet's text size" keeps the tag on `--font-ui-smaller` for now. When that type pass moves the tag onto relative units, it moves the lane's declaration with it, as one edit. So at Text 20 and 24 the lane is the same px width as at 16, just as the tag is.

**The lane is stamped by the pass, not from the layout.** Stamping it from the layout would follow `layoutSetsStateIn`, so that a form turned on never moves a column. But then every table any form in the layout could reach would carry an empty lane all the time: in the 5e starter that is skills and saves on every character, for a form most characters never take. With the pass stamping it, the cost is paid only while a form is in play. The reflow happens when the reader turns a form on in a Stat block, a deliberate action in another component, and the whole sheet repaints its tints at that moment anyway. Nothing moves under the hand that pressed (UI §11).

**Costs taken.**

- **On a table that scrolls sideways, the tag scrolls with the row's end** instead of staying on the pinned name. The row's tint still runs the whole row, and the spoken twin is unchanged.
- **A narrow tagged table can get its own sideways scroll** while the form is in play. The name keeps its floor (UI §4), and the sheet itself never scrolls sideways.
- **A short tag leaves part of its lane empty, and a long one clips at it.** The lane is fixed so that the slot position is the same on every row. Sizing it to the widest drawn tag would mean a layout read on every pass, or a character-count estimate, which `table-name-column-floor.md` already refused for a column floor.
- **A heading wider than its column's values sits off them**, from part of the way up to half a slot (11.4px at Text 16), and centres on its whole cell where its words and the slot overflow it. The Roster's PROF heading on `modifier-states-ring-end` sits 7.6px off its rings at Text 16, and 11.4px at 20 and 24; every other shown heading in the harness states is wider than its values plus the slot and sits 11.4px off. Exact everywhere would need either the column to grow by the slot wherever the heading is its widest content, which the owner refused, or the render to know which of a column's contents is widest, a layout read on every render that `docs/UI.md` §4 refuses (`table-name-column-floor.md`). No heading is further off than before this work (see Measurements).
- **On a name-last table the name can sit partly past the scroller until it is scrolled.** The name `th` is `position: sticky; left: 0`, which pins a cell at the start edge only, so as the last column it never pins. With the lane shown a narrow table's wrapper scrolls, and the name runs past the wrapper's end: measured on `modifier-states-ring-end` at Text 16 and 520, the `names` wrapper is 287px of content in 237px, and 49 of the name's 90px are past its edge until the table is scrolled; with the form off the name shows whole. An inline-end pin for a name-last cell was not built.

**What is not touched.** A Roster band head's own note slot (`.sheetsmith-roster-band-inner::after`, a flex line rather than a column), the Roster card corner tag, the band head's tag line, a card or placed box's tag, the door's contents and order (`finishRowDoor`'s parts), and the name column's give-back rule.

**Empty and error states.** A table with no door, no mark and no tag gains no class and draws exactly as it does today. An error card draws no table.

**Harness.** One new state, `modifier-states-ring-end`, holds three tables:

- A Table whose last column is a ring and that has a Totals row.
- A Roster table whose last column is a ring.
- A Table with `namePosition` set last.

In each, one row's ring is set by a modifier (so it has a door after the ring), one row has nothing set (an empty slot after the ring), and one row has a note at the ring's name and nothing set (a mark after the ring). Cat Form is in play on one row of each, so the tag lane shows. The state takes a form-off variant, `modifier-states-ring-end-off`: the same three tables, with the same rows and the same modifiers, and Cat Form not in play, so no tag and no lane. The pair is a before/after of the lane's reflow on one table. This is the "waiting on" from row 1, which no layout or sample covers today. The existing `modifier-states` state is the `?` Total case (Perception, Medicine). `modifier-states-roster-band` is the narrow tag case.

**Measurement.** A new `harness/measure-row-end.mjs` uses the `measure-form-tag.mjs` pattern (CDP, `loadStaged`, not shipped, not a test). For each listed state and text size, and for each table, it prints four things for each slotted column:

- the spread of door and mark inline starts;
- the spread of value centres;
- the gap from each slotted cell's content-box end to its inline end, which is where an empty slot is;
- the heading's and the foot's text centre against the column's value centre.

`harness/measure-form-tag.mjs` drops its `known` branch for `modifier-states-roster-band`, adds runs for the new state, and extends a row pill's `cover` to count the row's controls (door, mark, ring) as well as its text, since the tag now sits next to them.

**The staged-target row is not free, and stays.** Closing "The form tag measurement passes a staged target that draws no tag" needs an expected-target list for every existing run (`forms`, `forms-roster-score`, `forms-tint-pool`, `forms-tint-track`). This work has no other reason to write those lists. Only the Roster states already name their rows (`ROSTER_CARD_FORM_ROWS`).

## Measurements

Recorded from the built tree, `npm run harness` then the two scripts, light.

**`measure-row-end.mjs`** (33 columns measured, 0 failed). In every slotted column of `modifier-states-ring-end` and `modifier-states-ring-end-off` (the Table's Training, the Roster's Prof, the name-last Table's Training) and of `modifier-states` (Skills' and Ranks' Bonus, Checks' Total), at Text 16, 20 and 24, and at 520 on and off: door and mark inline starts spread 0px, value centres spread 0px, every empty slot's reserve 0px from the column's doors, and the Skills Training foot's total (`foot`) 0px from the values', with the lane shown and hidden. (A first capture printed `foot -` because it was taken before the Training column was totalled; the figure is from the run after.) Glyph after a number (`digits`): −2.2, −3.5 and −5.0px at 16, 20 and 24, the tree before this work's −2.2, −3.5 and −5.0 (0.0 apart). Every row holding a glyph after a number is the height of one without. `elementFromPoint` 1px inside each door's and mark's inline start after a ring returns the glyph, on all three tables. Before this work the same script printed, on `modifier-states` at 16, 20 and 24, door spreads of 6.3, 7.8 and 9.4px and headings 11.4px off their values.

**Headings wider than their values** (`measure-row-end.mjs`'s `(wide)`, printed and not checked), as built and at the last commit (`git archive HEAD` in the scratchpad with this work's harness files laid over it, the same runs). Every shown heading in these states is wider than its values. `modifier-states`' Roster and `modifier-states-roster-band` hide their headings, so have none.

| State | Column | Text 16 | Text 20 | Text 24 | 520 | At HEAD (all four) |
| --- | --- | --- | --- | --- | --- | --- |
| `modifier-states-ring-end` and `-off` | Skills · Training | 11.4 | 11.4 | 11.4 | 11.4 | 13.4 |
| `modifier-states-ring-end` and `-off` | Checks · Prof | 7.6 | 11.4 | 11.4 | 7.6 | 13.4 |
| `modifier-states-ring-end` and `-off` | Name last · Training | 11.4 | 11.4 | 11.4 | 11.4 | 14.4 |
| `modifier-states` | Skills · Bonus | 11.4 | 11.4 | 11.4 | 11.4 | 11.4 |
| `modifier-states` | Ranks · Bonus | 11.4 | 11.4 | 11.4 | 11.4 | 11.4 |

No heading is further off than at HEAD. At HEAD the name-last table drew its door in the name cell, which the same script read as a slotted Skill column 125.8 to 565.8px off; that column no longer holds a door.

**Skills at 520 with no form.** The wrapper's `scrollWidth` is 240 against a `clientWidth` of 237, as at HEAD (240 against 237). Stealth's door and Perception's mark end 6.4px inside the wrapper, both in view (14.3 and 17.3px inside at HEAD, where they sat beside the ring). The 3px scroll predates this work (`docs/BACKLOG.md` § UI).

**Band heads and the lane.** With Cat Form in play, a Roster band head's score and reading end where the value columns do, short of the lane (the band's line takes the lane's room as padding): on `modifier-states-roster-band` the score's end sits 45.8, 24.9 and 2.9px inside the wrapper at Text 16, 20 and 24, and on `modifier-states-ring-end` at 520 38.2px inside, against 13px with the form off. Before the fix the scores ended over the lane, past the wrapper, and at Text 20 and 24 were not on screen.

**Ring, door and tag.** On `modifier-states-ring-end`, the door's start less the ring's end and the tag's start less the door's end: 24.3 and 20px on the Table and the name-last Table, 9.6 and 20px on the Roster, at Text 16; 38.8 and 20, and 17.7 and 20, at Text 24. A ring column whose heading is wider than the ring centres the ring in that width, which is the Table's larger first figure.

**`measure-form-tag.mjs`** (87 pills, 0 failed, no `KNOWN` line). `modifier-states-roster-band`'s Stealth pill: `cover` 0 at Text 15, 16, 20 and 24, at 700 (Text 20) and at 380, counting the row's text, its ring and its door. `modifier-states-ring-end`: three inline pills, `cover` 0, at 16, 20, 24 and at 520. Every other run passes as before; the `forms` runs' Table row tags now print from the row's end.

**Unchanged pixels.** The default `sheet` view at 1400 and at 520 (`width=520` in a 620 frame), shot before and after: identical, no differing pixel.

**The sheet does not scroll sideways** at 520 with the lane shown or hidden: the view's `scrollWidth` is its `clientWidth`, 518px, in both; the tables that need more scroll inside their own wrappers.

**On the name-last Table**, at 520 with Cat Form in play, the name `th` keeps `position: sticky`, takes no `sheetsmith-row-end` or `sheetsmith-in-play-marked`, and the door, the mark and the tag sit in the Training cell before it.

## Config fields

None.

## Data and file model

Nothing is stored or written. The round trip and existing notes are untouched (Constraints 3 and 4 are not reached).

## Acceptance criteria

- [x] `measure-row-end.mjs` on `modifier-states-ring-end` and `modifier-states`, at Text 16, 20 and 24, light: in every slotted end column of each Table and Roster (and, under the full design, in every slotted column), door and mark inline starts agree within 1px, value centres agree within 1px, and each empty slot's reserve starts within 1px of where that column's doors start. This covers (a) a ring then a door, (b) a ring then an empty slot, (c) a ring then a mark, and (d) the `?` Totals on Perception and Medicine against their numeric neighbours. The script prints the figures, and they are recorded here before the land stop.
- [x] Same runs: each such column's foot cell's value centre (where it has a foot) sits within 1px of the column's body value centre, with the lane shown and with it hidden. Its heading's text centre sits within 1px of it where the heading is no wider than its values; a wider heading's offset is printed, is at most half a slot, and is no larger than before this work.
- [x] On a door or mark after a number, the glyph's centre stays on the digits' centre within 0.5px of what today's tree measures at Text 16 and 24, and the cell's height is the same as an unmarked cell's.
- [x] Hit-testing (`elementFromPoint`) 1px inside the inline start of a door or mark that follows a ring returns the door or mark, not the ring, on both tables.
- [x] `measure-form-tag.mjs` passes with no `KNOWN` line. On `modifier-states-roster-band` at Text 20 (and at 15, 16 and 24, at 700 and at 380) the Stealth row's pill reports `cover` 0, counting the name, the value, the door and the ring. The new state's three tables each print a passing inline pill. Every other run is unchanged.
- [x] On the name-last Table, the name `th` keeps `position: sticky` and takes no `sheetsmith-row-end` or `sheetsmith-in-play-marked` class, and the door, slot and tag sit in the cell before it.
- [x] `placement-decorations.test.ts`: a tagged Table row's pill is a descendant of the row's end cell and not of its `th`. The table carries the lane class while the pill is drawn, and loses it on a pass with no decoration. On a name-last row the pill is in the last value cell, and the name `th` takes no `sheetsmith-in-play-marked`. A band head's tag puts no lane class on its table. A Roster card row's pill is still carried by its card, and a band head's by its tag line.
- [x] `state-ring.test.ts`, or the callers' own tests: `finishRowDoor` stamps the row-end class on the cell it is handed whether or not a ring was set, and stamps nothing when that cell is null. The Table and Roster callers hand it the last value cell, never the name `th`, with the name in either position. The head and foot rows' last value cells carry the row-end class.
- [x] `note-mark.test.ts`: `reserveNoteSlots` stamps a slotted column's heading cell and foot cell, and leaves a column with no mark or door unstamped.
- [x] Full design: no rule in `src/styles/sheet.css` gives a door, mark or slot a different inline gap after a ring than after a value, and `.sheetsmith-level-ring + .sheetsmith-note-mark` and `td.sheetsmith-note-column.sheetsmith-table-level::after` are gone. Smallest version: both stay for mid-row cells, and no rule gives a row-end cell's door, mark or slot a different gap after a ring than after a value. Under either version, every new rule is under `.sheetsmith-view`, reads a stamped class rather than a structural `:has()`, and uses no plugin colour (`styles.test.ts`).
- [x] A table with no door, mark or tag is pixel-identical before and after, on the default `sheet` view at 1400 and 520.
- [x] Lane reflow, judged from pixels by the owner at the land stop: a before/after pair of shots of one table with no form in play and the same table with Cat Form turned on, for the Table and for the Roster. These are `modifier-states-ring-end-off` against `modifier-states-ring-end`, light, at Text 16 and at 520 wide (an explicit frame). In each pair, nothing but the tint, the tag and the lane differs, and the sheet does not scroll sideways.
- [x] Shots (`npm run harness`, then `npm run harness:shot`): `modifier-states-ring-end` light at Text 16, 20 and 24, plus dark at 16. The form-off/form-on pairs above (`modifier-states-ring-end-off` and `modifier-states-ring-end`, light, Text 16, at the default frame and at 520). `modifier-states` at 16 and 24. `modifier-states-roster-band` at 20 (new) and its existing two. `modifier-states-roster-card` unchanged. Before and after PNGs go to the land stop. A shot narrower than 500 gets its explicit frame.
- [x] `src/styles/sheet.css` and the built `styles.css` agree (`styles.test.ts`).
- [x] The three rows are gone from `docs/BACKLOG.md` § UI and `src/backlog.test.ts` passes. Under the smallest version, one row is added for the mid-row noted column. `docs/UI.md` §9's form-tag entry no longer says a Roster table row keeps its tag in its name cell, and its note-mark entry describes the slot at the cell's inline end. `harness/samples.ts`'s `rosterCardStateSamples` comment no longer calls the band a known gap.
- [x] `npm run lint`, `npm test` and `npm run build` pass.

## Commit boundaries

1. `fix: Pin a table cell's door and note mark at its inline end`. The callers handing `finishRowDoor` the last value cell, the row-end stamp in `state-ring.ts`, the head and foot stamps in `table.ts`, `roster.ts` and `note-mark.ts`, the slot rules in `src/styles/sheet.css` (pin, one gap, head and foot padding, vertical placement, and the deleted or overridden 8px and `::after` rules), the regenerated `styles.css`, and the `state-ring.test.ts`, `note-mark.test.ts`, `table.test.ts`, `roster.test.ts` and `styles.test.ts` cases. Closes rows 1 and 2.
2. `fix: Tag a table row at its end, in a lane set aside for it`. `placement-decorations.ts`'s fallback and lane class, `--sheetsmith-tag-lane` and the lane and inline-tag rules in `sheet.css`, `styles.css`, and `placement-decorations.test.ts`. Closes row 3.
3. `test: Stage a Table and a Roster ending on a ring`. The `modifier-states-ring-end` and `modifier-states-ring-end-off` states in `harness/samples.ts` and `harness/harness.ts`, its shots in `harness/shot.mjs`, `harness/measure-row-end.mjs`, and `measure-form-tag.mjs`'s dropped `known`, new runs and wider `cover`.
4. `docs: Set aside room at a table row's end`. `docs/UI.md` §9, the three `docs/BACKLOG.md` rows removed (and the mid-row row added under the smallest version), the row-tag sentences in `docs/features/character-forms.md` and `non-number-modifiers.md` that name the name cell, and this spec's status.

## Deliberately not doing

- "A form's change lines name what the sheet publishes, which is a key and not a label": deferred by the owner as a contract change (`docs/features/character-forms.md`).
- "A Roster card strip's state floor fits one card's row names".
- "The form tag measurement passes a staged target that draws no tag": not free here (see Design, Measurement). It stays.
- A tag lane sized to the widest drawn tag, and a lane stamped from the layout (see Design).
- The tag and its lane following the sheet's text size: the existing "do not follow the sheet's text size" row covers both, and they move together when it is taken.
- The end-cell-only version (Smallest version above): offered to the owner and declined in favour of the full design.
- A Roster band head's note slot, and every other row in `docs/BACKLOG.md` § UI and § Patterns.
