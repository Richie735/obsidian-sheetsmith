# Table name column floor

Status: built
Board card: `docs/BACKLOG.md` § UI, "A wide table with few columns clips its first column while a middle one takes the slack"

Standard route. One backlog row, alone, as its own trigger asks: "a pass doing only that".

## Model question

None. The floor is drawn from the names a table already stores and changes no read, write, publication or file; it touches no §13 question and does not grow the §4.1 contract.

## What it does

On an `openRows` Table the name column is never narrower than its longest stored name, so `Gauntlets of Ogre Power` reads whole while the prose column beside it still takes the rest of the width. This makes `docs/UI.md` §4's "A table's slack goes to its prose column, and never at the name's expense" true of an open row's name field, which today it is not: `.sheetsmith-table-name-input` has `min-width: 6em` and nothing tying it to its content, so `magic_items` at 1400px cuts `Item` to 102px of 130.

## Smallest version

The sizer below, with no phone-width cap, bounded only by its own scroller. This is the version the owner approved, corrected once in review. The name column stays as wide as its longest name until that would leave less than one number cell of room beside it in the scroller, and there it stops. **The correction:** this paragraph first said a long name would leave "the other cells to be reached by scrolling", and the uncapped floor broke that. The name cell is sticky and opaque, so a name as wide as the scroller covers every cell scrolling under it: at width=520 the Worn items card's scroller is 155px, its name cell was 179.9px, and no scroll position reached a row's modifier or remove cell. What it gives up: in a narrow card a long name ellipsizes again, and the field's `6em` minimum is what holds.

## Design

**Why the column loses today.** An owned row's name is an `<input>` with a percentage width (`calc(100% + 2 * var(--sheetsmith-field-inset))`). A form control with a percentage width is compressible: its min-content contribution to the table's auto layout is its `min-width` and nothing else. Where the table has a text column, `.sheetsmith-table-has-text .sheetsmith-table-name` is `width: auto` and the text column is `width: 100%`, so the auto layout gives the name column its min-content, `6em` plus padding, and the name ellipsizes. A link-bearing name is worse: its `.sheetsmith-table-linked` stack is `minmax(0, 1fr)` with `min-width: 0` children, by design, so that a link never widens its cell.

**The floor is a sizer.** Each owned row's name cell gains one more child after the field (or after the linked stack): `span.sheetsmith-table-name-sizer`, holding **the text the cell shows at rest**. That is `displayText(name)` from `parse/wikilink.ts`, the one spelling of what a link shows: the stored name unchanged for a plain name, the display for a linked one, so `[[Sunblade|sword]]` floors at `sword`, not at its raw source. The span is `display: block`, `height: 0`, `overflow: hidden`, `visibility: hidden`, `white-space: pre`, at the name's own font size (`inherit`), and **unpadded**. The field is pulled into the cell's padding by exactly its own inline padding and border (`margin-inline: -var(--sheetsmith-field-inset)`, `width: calc(100% + 2 × inset)`, where the inset is `--size-2-2` plus the 1px border), so its text area is the cell's content box. The sizer sits in that same box, so its unpadded width is exactly the width the field needs to show that text; padding it as well would widen the column by twice the inset for nothing. A table cell's min-content is its widest in-flow child, so each cell floors at its own name and the column, being the widest of its cells, floors at the longest. That is the column-level property the backlog row asks for, with no "longest name" computed in code.

**The sizer is `aria-hidden="true"`.** It repeats the name the field already gives to assistive tech, so a screen reader must not read it twice. `visibility: hidden` happens to hide it as well, but the attribute states the intent in the markup, and it is tested on its own.

**It is read at render, and every render.** It is painted in `renderName` (`src/components/table.ts`, ~2691), which runs on every render of the table, not only the first. A committed edit reaches it by this path: the name field's `onCommit` calls `context.onChange`, which is `SheetView.applyEdit` (`src/view/sheet-view.ts:665` → `:1024`). That hands a batch of one to `applyEdits` (`:1043`), which writes the section into the freshly parsed note and calls `commit(text)` (`:1067`; `commit` is `:997`), and `commit` calls `void this.renderSheet()` (`:1020`; `renderSheet` is `:477`). The rebuild renders the table again from the written note, so the sizer then holds the new name and the column re-floors. That call does not wait for a vault `modify`, which an identical save never fires. The sizer is text and not a field, so typing a longer name changes nothing in it, and no other cell in the row moves until the edit commits and the sheet rebuilds. That is `docs/UI.md` §11's "rearranging under the reader's hand" check, and the reason `field-sizing: content` was ruled out (below).

**The sizer is plain text, never anchors.** `FOCUSABLE` in `src/view/cell-focus.ts` counts `a[href]`, and the view restores focus by control index within a cell. An anchor in the sizer would shift that count, and the "Add row" focus landing would break. `visibility: hidden` would keep it out of the tab order, but the count still sees it. So the sizer is a single text node.

**Why not a `size`-derived floor on every name input.** It was the Passport precedent (`passport.ts` sets `input.size`, `width: auto`), and it fails here on two counts:

- `size` measures characters at the font's average advance, not the name's glyphs. A proportional name like `Immovable rod` against `WWWW` lands short in one case and long in the other. A floor that lands short is exactly the clip this pass removes. Passport accepts the approximation because its value sits in a sentence; a column's floor cannot.
- It does not reach the column without giving up the percentage width. A `size` only sets intrinsic width, and the percentage width makes that width compressible. The input would have to go `width: auto`, which loses the full-cell field and the inset alignment with declared rows, or carry its floor as an inline custom property.

The sizer is laid-out text in the name's own font, so it is exact on every engine. It needs no `@supports` branch, unlike `.sheetsmith-pool-current`.

**Why not `field-sizing: content`.** It is Chromium-only, so there would be a fallback geometry nobody photographs (`.sheetsmith-pool-current`'s cost). It also grows as the reader types, which is the 7–8px shift `.sheetsmith-record-input.sheetsmith-pool-max` measured and reversed.

**Narrow widths.** No phone-width cap, but a bound relative to the scroller. The box is `container-type: inline-size` (`.sheetsmith-table-box`, which exists only on an `openRows` table; not `.sheetsmith-table-wrapper`, which Roster shares), and the sizer is `max-width: calc(100cqi - 2 * var(--size-4-2) - <one number cell>)`. That is the scroller's width, minus the name cell's own inline padding, minus a band one number cell wide (`4 * var(--font-ui-small) + 2 * var(--size-4-2)`, which is `.sheetsmith-table-input`'s `4em` at its own font size plus its cell's padding). One band is enough because scrolling brings each other cell into it in turn, so no table's trailing cells are summed. A percentage `max-width` does not work here: inside a table cell it resolves against the column being sized, so it is ignored for min-content. An `em` cap does not work either: it would cut long names on wide cards too. Wide cards never reach the bound. In a narrow one the field's `6em` minimum takes over, and the existing scroller scrolls sideways with the name sticky at the left edge.

**Unchanged.** Declared-row names (plain text already, already sized by content), the input's `min-width: 6em` (still the floor for an empty or short new row), its ellipsis, the link layer, and tables with no text column, where the name already takes the slack.

**Empty and error states.** A new row's empty name has an empty sizer, and the `6em` minimum holds. An error card draws no table, so no sizer.

**The comment at `sheet.css` ~1302** ("Row names are a fixed vocabulary — 'Sleight of hand' is as long as a skill gets") is corrected to say which tables it holds for. It is true of declared rows. On an `openRows` table the character types the names, and the sizer is what floors that column. The rule beneath it stays `width: auto`.

## Config fields

None. No field is added or changed.

## Data and file model

Nothing stored and nothing written. Round trip and existing notes are untouched (Constraints 3 and 4 are not reached).

## Acceptance criteria

- [ ] `table.test.ts`: an owned row's name cell holds one `.sheetsmith-table-name-sizer` whose text is the row's stored name. This fails on today's code.
- [ ] `table.test.ts`: that sizer has `aria-hidden="true"`, asserted on its own.
- [ ] `table.test.ts`: a committed rename (`table.write` with `{ rows: { [at]: { name } } }`, then render the written note again, as the "Add row" focus test does) produces a sizer holding the new name, not the old one.
- [ ] `table.test.ts`: a linked name's sizer holds the rendered text (`sword` for `[[Sunblade|sword]]`) and contains no element, so the cell's `FOCUSABLE` count is what it was.
- [ ] `table.test.ts`: typing into a name field (an `input` event, no commit) leaves its sizer's text unchanged.
- [ ] `table.test.ts`: a declared row's name cell has no sizer.
- [ ] The existing "Add row" focus-landing test passes unchanged.
- [ ] `harness` `magic_items` at 1400px, light and dark: every name reads whole, `Gauntlets of Ogre Power` and `[[Ring of Protection]]` included, and `Notes` holds the remaining width.
- [ ] `magic_items` at 520 wide, passed as an explicit `size=` (a scoped shot otherwise renders at its own default frame): the name column holds its longest name, stays sticky when the table scrolls, and only the table's own scroller scrolls sideways. The sheet itself never does.
- [ ] `magic_items` at width=520: every Worn items row's modifier and remove cells can be reached by scrolling, and the name cell stays at its sticky edge at every scroll position.
- [ ] A declared-row table (the skills sample) is pixel-unchanged at 1400px and at 520px.
- [ ] Focusing a name field and typing past its width moves no other cell in the row before blur (harness `&type=`, before and after shots compared).
- [ ] `docs/UI.md` §4's slack bullet no longer ends "Not yet true of an open row's name field"; the backlog row is gone; the `sheet.css` ~1302 comment names declared rows as the case it describes.
- [ ] Every new rule is under `.sheetsmith-view` and uses no plugin colour. `npm run lint`, `npm test`, `npm run build` pass, and `styles.css` is regenerated.
- [ ] Before and after PNGs of `magic_items` at 1400 and 520 go to the land stop.

## Commit boundaries

1. `fix: Floor an open table's name column at its longest name`. Contains the sizer in `table.ts`, its rules in `src/styles/sheet.css`, the corrected ~1302 comment, the regenerated `styles.css`, and the `table.test.ts` cases.
2. `docs: Settle the open-row name floor`. Contains the last sentence of the `docs/UI.md` §4 bullet removed, the `docs/BACKLOG.md` § UI row deleted, and this spec's status.

## Deliberately not doing

- "A record's fields wrap inside their own grid track above 320px" (BACKLOG § UI). That is the next pass.
- "The sample `Checks` Roster overflows at 520". It waits on its own `notes` sample pass.
- Every other § UI row.
- Declared-row tables. Their name column behaves as today.
- A limit at phone width, such as a `max-width: 10em` sizer under `@container (max-width: 480px)`. The owner's reason: the harness can't render below 500px, so a 10em limit would ship without a screenshot. Phone-width behaviour belongs to a later on-device pass. The scroller bound under "Narrow widths" is not that cap: it is relative to the card rather than to the pane, so it binds in a narrow card on a wide sheet and is photographed at 520.
- A field that grows as the name is typed. The floor moves only on commit, by design.
