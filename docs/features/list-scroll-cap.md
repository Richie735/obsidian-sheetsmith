# List scroll cap

Status: shipped
Board card: the `docs/BACKLOG.md` § UI row "At 380 under phone staging a stacked Columns entry is taller than its list's scroll cap" (`styles/editor.css` `.sheetsmith-list-scroll`), and the `docs/SPEC.md` §13 entry "What `.sheetsmith-list-scroll`'s height cap is for", which gates it. The row leaves `docs/BACKLOG.md` in the commit that fixes it, and `/land-it` writes the §13 entry's `Resolved:` once this is built.

Full route (`docs/WORKFLOW.md` § Routes): gated on an open §13 question. Its stops are the model question, which the owner has settled (below), spec approval, and the land stop.

## Model question

**§13, "What `.sheetsmith-list-scroll`'s height cap is for". Settled by the owner, and recorded in that entry as an amendment. It is not marked resolved.**

The answer, and the argument behind it:

- **The cap bounds distance down the pane.** The comment above the rule already says what it is for: an eighteen-row skill card must not push the columns section, its add control, and the fields below it off the screen. So the number is a distance, measured in px against that card, and it is also bounded by the window. `dvh` reads the window and not a split pane, so in a split pane the window term is an upper bound and not the pane's height. An em of a desktop row was never the right unit. The em base differs between regimes, a phone's stacked entry is about eight desktop rows tall, and nothing ever recorded what `20em` was measured against.
- **It has a floor: the tallest ordinary staged entry plus the sticky `.sheetsmith-entry-columns` header.** A list that cannot show one entry whole fails in a way no reader sees. The bottom of the entry is cut off and the list looks complete. That is the half-line cut `editor/list-field-height.ts` calls a fault, here a whole entry deep. The floor is a measurement, so a harness check fails when a staged entry outgrows the cap.
- **The number is stated as a measurement in its comment**, the way `styles/shared.css` states the anchored panel's cap: what was measured, the headroom, "re-measure rather than adjusting by eye", and how to re-measure.
- **Case 1's rule is a separate constraint: a column's detail line holds one message line.** It is not the answer to the cap. It is recorded and kept, and nothing here relaxes it, even though the new cap would happen to fit a second message (see Data and file model).
- **Two consumers, not four.** Only `renderRowsEditor` and `renderColumnsEditor` in `editor/list-fields.ts` (lines 412 and 961) create `.sheetsmith-list-scroll`. `modifier-definitions-field.ts` and `promoted-fields-field.ts` stay out of it on purpose and say so in their headers. The §13 entry's "four list fields share" is corrected to two.
- **The nested scroll region on a phone is the accepted cost.** The alternative, disclosure (lists sized to their content, the first N entries drawn, and a **Show all** control), is now a `docs/BACKLOG.md` § UI row. It waits on a device pass that finds the inner scroller trapping touch scrolling.

The other model questions, briefly. The §4.1 contract does not grow, because this is a stylesheet rule and a harness check. Nothing is published to formulas. Nothing is stored, so no note or layout file changes and Constraints 3 and 4 are not touched.

## What it does

A long Rows or Columns list in the layout editor scrolls within a cap that is now a measured px distance. The cap always holds the tallest entry the harness stages whole, at every width including a 380 phone, and it still keeps an eighteen-row skill list from burying the fields below it. A harness script fails when an entry outgrows the cap, so the next column field that makes an entry taller turns a run red instead of leaving a photograph that clips.

## Smallest version

`max-height: 400px` on `.sheetsmith-list-scroll`, with its comment rewritten as the measurement below and the floor check in `harness/measure-lists.mjs`, plus the phone Skills view. It closes the backlog row: the 376.4px floor entry fits at every width. It gives up the window bound, so a short desktop window gets a 400px list where 300px of window budget would do, and it has one floor for both regimes, so a desktop list at 400 is about twice its own 204px floor.

## Design

### The rule

```css
.sheetsmith-list-scroll {
	--sheetsmith-list-floor: 244px;
	max-height: clamp(var(--sheetsmith-list-floor), calc(100dvh - 300px), 400px);
	overflow-y: auto;
}

@container (max-width: 380px) {
	.sheetsmith-list-scroll {
		--sheetsmith-list-floor: 400px;
	}
}
```

The custom property is declared on the scroller, so the stacked override goes inside the existing `@container (max-width: 380px)` block at the foot of `editor.css`, the block `d98244a` changed. The scroller is a descendant of `.sheetsmith-entry-list`, which is the query container. That block already sits below the rules it overrides, which `@container` requires because it adds no specificity.

The three numbers are measurements, and the comment has to state each one as such. All of them were re-measured for this spec in the harness built from `feat/list-scroll-cap` at `883eb0c`. The script is `measure-lists.mjs` as specified below, run ad hoc.

| Term | Value | What it is |
| --- | --- | --- |
| Ceiling | **400px** | The stacked floor with headroom. Under it an eighteen-row Skills list puts the Columns heading **592.8px** below the Rows heading at 1500 (83.8 + 400 + 93 + 16) and **691.8px** below it at 380 under phone staging (137.8 + 400 + 137 + 17). Both fit an 800px window, so the columns section and **Add column**'s heading stay on the first screen of the form. That is the distance the comment's purpose asks for. |
| Window term | **100dvh − 300px** | 300 is the fixed distance a capped Rows list carries above and below itself to the Columns heading: 291.8px at phone (137.8 above the scroller, 137 to the Columns group, 17 for its title) and 192.8px at 1500, rounded up from the larger. It keeps the Columns heading inside a short window until the floor stops it. |
| Wide floor | **244px** | The tallest ordinary entry plus the sticky header at every width the rows sit side by side: **230px**, *Recharging features* at 820 under tablet staging (a 207px Columns entry under the 23px header, the app's tablet controls being taller), with the same 6% headroom (243.8, rounded up). **Amended from 216**: the spec's first measurement took 1500 and 620 only and missed the tablet width, which `harness/measure-lists.mjs` check 1 reached. At 1500 and 620 the tallest is **204px** (*Recharging features, broken*, a 181px entry under the header), which is not the binding figure. **Owner's ruling: the floor counts an entry showing its message**, and it stands: *Recharging features, broken*, with its **Shown when** message drawn (one message, wrapping to three lines, 45px, at 1500 and 620), sets the 1500/620 figure and the stacked 376.4px floor, while the binding wide entry is *Recharging features* at 820 under tablet staging. |
| Stacked floor | **400px** | Under 380px of list, where the header is `display: none`: **376.4px** (*Recharging features, broken*, at 380 under phone staging, its **Shown when** message drawn, one message wrapping to five lines, 75px, there). 6% headroom gives 399, rounded to 400, so the stacked cap is **400px at every window height**. Per the same ruling it is the entry with its message, not the 368.4px one without. |

**At 380 the floor is the cap, and the window cannot win.** One whole entry beats a heading on screen. On a phone window shorter than about 692px, an eighteen-row Rows list's Columns heading starts below the first screen. That is the nested-scroller cost §13 accepts, stated in the comment as such and not discovered later.

**On desktop the window term does work.** In a 600px window the cap is 300 (1500 × 600: Columns heading at 492.8, inside the window). Down at the floor it is 244. In the harness's default frames it is inert: `EDITOR_FRAME` is 16800 tall and `editor-phone` 34250, so `100dvh` there is the whole page and only the measure script's real window heights reach the term. The comment says so, because otherwise every shot would look like it covers the term.

**`dvh`, not `vh`.** `dvh` is the visible window on a phone with the browser chrome shown, which is the same reason the panel uses `100vh` on desktop. `docs/UI.md` §4 already rules that a cap reading the window is a ruling, not a gap.

### What changes on screen, measured

| Where | Before (cap 320) | After |
| --- | --- | --- |
| Skills, 380 phone, Columns | 795px of content in 320; the first entry is **321.4**, so none shows whole | 400; the first entry whole, the second begins |
| Skills, 380 phone, Rows | 708 in 320; rows 172/173/190/173, under two whole | 400; two whole, the third begins |
| *Recharging features, broken*, 380 phone | 376.4px entry in 320, cut by 56px | whole by 23.6px |
| Every stacked list holding a 321.4px entry (the five `*_checks` tables, *Attributes roster*, *Roster card layout*) | one entry, scrolled by 1.4px | whole, no scroller |
| Skills, 1500, `editor-row-error` | Rows 252, Columns 292, no scroller | unchanged |
| *Stat roster* Rows, 1500 (`editor-inventory-roster`) | 363 in 320 | whole, no scroller |
| *Inventory* Columns, 1500 | 341 in 320, last 21px scrolled | whole |
| *Traits*, *Recharging* ×3 Columns, 1500 | 697–749 in 320 | 400, still scrolls |

A desktop list under 320 is pixel-identical. The default frames are tall enough that the window term never binds, so the only desktop shots that change are the six lists in the last three rows above.

### The harness view

No committed view stages a list field at phone width: `editor-phone` opens Weapons. Add one to `harness/shot.mjs`'s default list, beside `editor-phone`:

- **`editor-phone-skills`**: `surface=editor&theme=light&open=skills`, `platform: 'phone'`, `size: '380,<measured>'`, and `frame: '.sheetsmith-editor-panel'`, so the PNG is the form and not 34,000px of canvas. The height is measured off `document.body` through this view's own query with the harness built, as `editor-phone`'s comment does, and the number goes in its comment.

**The "before" is captured on this tree before the CSS changes.** Add the view first and run `npm run harness`. Then shoot the three before views with their canonical frames: `npm run harness:shot` writes them by name, or use the scoped form with each view's own `size=`, `platform=` and `frame=` passed explicitly and the output copied to the view's name (a scoped shot otherwise writes `custom.png` at its own width). **Owner's ruling: the land stop carries before and after PNGs of exactly two views**, `editor-phone-skills` (Skills at 380 under phone staging) and `editor-inventory-roster` (a capped list at 1500, Stat roster's Rows). Shoot those two before the change and copy them to `harness/shots/before/`, which is gitignored like the rest of `shots/`, so the land stop can set each beside its after. `editor-row-error` is not one of them: Skills at 1500 stays under the cap by design, and the measure script's numbers hold that (Acceptance criteria).

### The check: `harness/measure-lists.mjs`

A browser-driven script in `measure-groups.mjs`'s shape: not shipped, not in `npm test`, run after `npm run harness`, printing its numbers and exiting non-zero on any failure. It drives Chrome through `cdp.mjs` and stages the phone through `stagePlatform` and `checkPlatform`, so 380 is a phone and not a squeezed frame. **It measures with the staging still on**, touch included: with touch off the coarse-pointer rules do not answer, and Skills' first Columns entry reads 312.4px instead of the phone's 321.4.

1. **Floor.** For every component holding a Rows or Columns list, in every harness state that stages one (`populated`, `broken`, `notes`, `three-parts`, `record-groups`, `text-groups`, `pinned-add`), at every width the harness stages the editor at (1500, 1210, 820 tablet, 620, 600, 546, 530, 380, and 380 under phone staging): every entry's height plus the sticky header's height where it is drawn must be ≤ the scroller's resolved `max-height`. The windows are **500px tall**, short enough that the window term is under both floors, so the cap measured is the floor itself. The cap only grows with the window, so passing at the floor passes at every height. The script prints the tallest entry per width, which is the number the comment quotes. It selects each component through the outline, not by reloading, so the run stays in minutes.
2. **Ceiling.** At 1500 × 900 and 380 phone × 800, Skills' scroller resolves to 400px.
3. **Distance.** Skills, with **Add row** pressed until it holds eighteen rows (a real click, the way an author gets there), at 1500 × 900 and at 380 phone × 800: the Rows list stands at its cap, and the Columns group's title bottom is no more than one window height below the Rows group's top. This is the comment's purpose as a measurement.
4. **Not vacuous.** At 380 under phone staging at least one list overflows its cap, and the tallest entry measured is over 300px, so check 1 is measuring stacked entries and not passing on an empty list. On the current tree check 1 is red: 321.4 and 376.4 against 320.

`src/styles.test.ts` gains one scan, read from the stylesheet as the stacked-row-gap scan is. `.sheetsmith-list-scroll`'s `max-height` names no `em` or `rem`, and the `@container (max-width: 380px)` block sets `--sheetsmith-list-floor`. It finds the rule before it asserts anything, so a renamed class fails the scan instead of passing it vacuously. Pixels are left to the script, because happy-dom lays nothing out.

### Comments that go stale with this

Each one says `20em`, or says the question is open. Update them in the same commit as the rule:

- `styles/editor.css`: the comment above `.sheetsmith-list-scroll`, rewritten as the measurement, with its re-measure line pointing at `node harness/measure-lists.mjs`; the forced-colors Modifiers comment ("a 20em scrollport", around line 2478).
- `styles/shared.css`: the anchored panel's "whose `20em` cap … whose purpose SPEC §13 still asks about".
- `editor/modifier-definitions-field.ts` and `editor/promoted-fields-field.ts`: their headers' reasons for staying out stand, but the "SPEC §13 asks what that `20em` cap is for" clause becomes the settled answer. Both still size to content, because a detail line of five controls is the case the cap clipped.
- `editor/list-fields.ts` (the comment above line 412, and the one near line 1629) and `editor/list-fields.test.ts` (lines 309 and 2077): the "half of SPEC §13's answer" phrasing becomes the one-message-line rule, named as its own constraint.

### Interactions and accessibility

Nothing new to press. The scroller is the same element, so `docs/UI.md` §6's keyboard and screen-reader behaviour is unchanged. Every control inside it is in the tab order, the browser scrolls a focused control into the scrollport, and the region carries no role, so a screen reader reads the entries in order and is not told it scrolls. That is the case for any plain overflow box, and it is better than a `region` landmark per list in a pane of them. A longer cap means fewer lists scroll at all: at 380 the 321.4px lists stop being scrollers.

**A found defect, not fixed here: Shift-Tab can land a control behind the sticky header.** Measured at 1500, walking back with real Shift-Tab from the last control of a list scrolled to its end: in *Traits*, 2 controls wholly and 12 partly behind the header; in *Recharging*, 1 and 3; in *Stat roster*, 3 and 0; in *Inventory*, 0 and 5. It is the table's sticky-name defect (`3edfe8f`) in this scroller, and it predates this work. The cap change moves the numbers without fixing the cause. See Deliberately not doing.

### Empty and error states

Empty: unchanged. "No rows yet." and "No columns yet." draw in a scroller that does not scroll. Error: the one-message-line constraint stands. A field message on a detail line is part of an entry's height, and the floor measures it: the 376.4px entry is one with a message drawn.

## Config fields

None. No component config changes.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |

## Data and file model

None. A stylesheet rule, a harness view, a harness script and one stylesheet scan. No note, layout file, parser or serialiser changes.

**Case 1, re-measured, and why it does not move the constraint.** On `editor-row-error` at 1500 the Columns list stands at **292px** (89/106/58 entries under a 23px header), and the Rows list at 252. Drawing **Level names**' message too adds 45px, so 337px: that clips under 320 and would fit under 400. The constraint holds anyway. A column's detail line holds one message line because a second wrapping one is a line the author has to scroll an entry to read, whatever the cap. It is not there because 320 happened to be the number.

## Acceptance criteria

- [x] `.sheetsmith-list-scroll`'s `max-height` is `clamp(var(--sheetsmith-list-floor), calc(100dvh - 300px), 400px)`, the wide floor is 244px, and the `@container (max-width: 380px)` block sets it to 400px [checked: `src/styles.test.ts`, no `em` in the declaration, and the floor set in the query].
- [x] The comment above the rule states each number as a measurement: what was measured and where, the headroom, that the window term is inert in the default frames, that at 380 the floor is the cap and the window cannot win, "re-measure rather than adjusting by eye", and the command that re-measures (judgement: read the comment).
- [x] `node harness/measure-lists.mjs` exits 0 on the built harness, and its check 1 fails on `883eb0c`'s CSS (judgement: the dev runs it before the CSS change and records the red, the way `d98244a` was found).
- [x] At 380 under phone staging, Skills' first Columns entry (321.4px) and *Recharging features, broken*'s tallest entry (376.4px) are whole in their lists (`harness/measure-lists.mjs` check 1, with Skills' entries printed by check 2, and seen in `editor-phone-skills`, where Skills' Columns list still scrolls to its second entry).
- [x] With eighteen rows at 1500 × 900 and at 380 phone × 800, the Columns group's title is inside the first window below the Rows group's top (check 3).
- [x] Every 1500 list under 320px is unchanged. On `editor-row-error` at 1500, Skills' Rows list still stands at 252px and its Columns list at 292px, with no scroller (the numbers `harness/measure-lists.mjs` prints; not a land-stop PNG).
- [x] The floor counts an entry showing its message. The stacked floor is taken from *Recharging features, broken* with its **Shown when** message drawn, 376.4px. The wide floor is taken from *Recharging features* at 820 under tablet staging, 207 + 23 = 230px; the 204px *Recharging features, broken* entry with its message is the 1500/620 figure and does not bind. The comment names those entries and those states.
- [x] `harness/shot.mjs` has `editor-phone-skills`, with its frame height measured and stated in its comment, and the land stop carries before and after PNGs of exactly `editor-phone-skills` and `editor-inventory-roster`.
- [x] `docs/UI.md` §4 gains one bullet beside the layout editor pane's two narrow rules: a Rows or Columns list is capped by a distance in px and floored by its tallest staged entry plus its header, so one entry is always whole and the phone's nested scroller is the accepted cost [held by `harness/measure-lists.mjs`].
- [x] No comment in `src/` still says `20em` or calls the cap's purpose an open question (`grep -rn "20em" src/` returns nothing about this rule).
- [x] The `docs/BACKLOG.md` § UI row "At 380 under phone staging a stacked Columns entry is taller than its list's scroll cap" is gone, and the option C row added with this spec is still there. `src/backlog.test.ts` is green.
- [x] `npm test`, `npm run lint` and `npm run build` pass, and `styles.css` matches `src/styles/` (its test).

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted until the owner says the work is done.

1. `test: Stage the Skills form under phone staging`. The `editor-phone-skills` view in `harness/shot.mjs`. The before PNGs are shot on this state.
2. `fix: Size a long list's scroll cap to its tallest entry`. The rule and its comment in `src/styles/editor.css` (both blocks), the regenerated `styles.css`, the `src/styles.test.ts` scan, `harness/measure-lists.mjs`, the stale comments listed above, and the removal of the gated `docs/BACKLOG.md` row.
3. `docs: Record what a list's scroll cap is measured against`. The `docs/UI.md` §4 bullet, and the §13 entry's `Resolved:` (`/land-it`'s own step). If `/land-it` folds this into commit 2's docs, it is one commit fewer and nothing else changes.

The §13 amendment and the option C backlog row were written with this spec and land with it, in whichever docs commit `/land-it` puts the spec in.

## Deliberately not doing

- **Option C, disclosure instead of a scroller.** A `docs/BACKLOG.md` § UI row, waiting on a device pass that finds the inner scroller traps touch scrolling.
- **Shift-Tab behind the sticky header**, measured above. A `scroll-padding-top` the header's height would be the shape of a fix, but the header is 23px on most lists, 38 on Skills' Rows and absent when stacked, so it is a measurement of its own. Now the `docs/BACKLOG.md` § UI row "Shift-Tab back through a scrolled Rows or Columns list lands focus behind its sticky header", with its gate.
- **"A marked list row drops its other controls, and the one fixed list shifts its trash 3px".** Not touched.
- **"A list entry labels its first line once in a header and its second line on every entry".** It waits on a labelling-model decision.
- **"No harness view stages any of the field messages on a column's detail line".** Only the Skills phone view is staged. The 376.4px floor entry is measured by the script and not photographed.
- **The two chevron rows on the editor's `<select>`s, and "On a tablet the canvas is a touch scroll trap".** Not touched.
- **Relaxing the one-message-line rule** because 400 would now fit a second message. It is a separate constraint (Data and file model).
- **The modifier definitions and promoted fields lists.** They stay out of the scroller and keep sizing to content.
