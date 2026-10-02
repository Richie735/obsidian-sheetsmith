# Forced colors on Track and Table

Status: shipped
Board card: two `docs/BACKLOG.md` § UI rows, taken in one pass because they share
one fixture and one precedent: "In forced colors a Track says nothing at all
about its value" and "A stacked cell renders both its layers at once in forced
colors".

## Model question

None. Both are paint in one media query. Nothing is stored, published or
evaluated differently, and no §13 question is involved.

## What it does

With forced colors on (a Windows contrast theme, or the emulation in DevTools),
a Track's lit segments are filled and its unlit ones are not, so a run at 5 of 6
no longer draws the same picture as a run at 2 of 6. The granted ring, the
blocked slash and the over slash stay visible on both kinds of segment. A Table
cell holding a wikilink shows its raw text, `[[Sunblade|sword]]`, instead of
two layers of text drawn over each other. In this mode that cell's link cannot
be pressed, the same trade Record set's name already makes.

## Smallest version

Two rules: the fill gets `SelectedItem`, and the Table layer is hidden. That
version leaves the granted ring, the over slash, a segment's glyph and the
`+N` count illegible on a lit segment, all of which are measured below, so it
does not close the Track row. The smallest version that closes both rows is the
whole of §Design. The only part it can drop is the pending ghost, which no shot
can reach.

## Design

Measured before writing, in Chrome's `--force-high-contrast` emulation on the
default harness sheet. That sheet already stages everything this needs:
Endurance at 5 of 6 and Endurance (low) at 2 of 6, both with two granted
segments; Vigour and Cursed vigour with blocked slots; the six Overfull runs,
including a lettered segment, a partly lit multi-mark segment and `+147`; and
five linked Table cells (Sunblade, Bag of Holding, Torch of Revealing, Second
Wind, Ring of Protection). The palette it resolves to:

| System colour | Value | Against |
| --- | --- | --- |
| `Canvas` | `rgb(18,18,18)` | |
| `CanvasText` | `rgb(255,255,255)` | 18.73:1 on `Canvas` |
| `SelectedItem` | `rgb(179,215,255)` | 12.56:1 on `Canvas` |
| `SelectedItemText` | `rgb(0,0,0)` | 14.08:1 on `SelectedItem` |
| `CanvasText` on `SelectedItem` | | **1.49:1** |
| `LinkText` | `rgb(158,158,255)` | 7.84:1 on `Canvas` |

Today the fill computes to `rgb(18,18,18)`, which is `Canvas`, so it does not
show. The lit segment's accent border becomes `CanvasText`, the same as an unlit
one. The 1.49:1 row is the backlog's warning, measured in a real palette:
**anything left in `CanvasText` over a `SelectedItem` fill disappears.**

### Track: one `@media (forced-colors: active)` block after the `prefers-contrast` one

Every rule below was prototyped by injecting it into the harness and
photographing the result.

1. **The fill takes `SelectedItem`**, along with the ghost through the same
   selector list the base rule already uses for the two. The precedent is
   `editor.css`'s ticked checkbox, `SelectedItem` with `SelectedItemText` on it,
   which is also how the app paints its own enabled toggle. A form or a sheet
   then says "on" one way. The ghost keeps its `opacity: 0.35`, since opacity
   survives the mode. The harm ramp's `color-mix` does not survive, so a harm
   run fills flat. That is the `prefers-contrast` block's rule already ("a shape
   read along the run is the wrong thing to trade contrast for").
2. **Marks drawn over a lit segment take `SelectedItemText`**: the granted ring
   (`-granted::after { border-color }`), the over and blocked slash
   (`::after { border-top-color }`) and the glyph. The slash is keyed on
   `.sheetsmith-track-segment-on`, set once the fill is above zero. The ring and
   the glyph are keyed on `.sheetsmith-track-segment-full`, which `track.ts` sets
   once the fill reaches the whole segment (`solid >= 1`). The design review
   found why: a multi-mark segment can be partly lit, and keyed on `-on` a
   `SelectedItemText` ring on a half-lit granted segment drew black dashes on
   `Canvas` over the unlit half, losing the box and its granted status there. A
   partly lit granted segment therefore keeps the mode's `CanvasText` dashes,
   faint over the lit half and whole over the unlit one. Measured, a lit granted
   segment then reads as a filled square with a dashed black edge, next to lit
   base squares with a solid white edge and unlit granted rings with a white
   dash. Lit against unlit and granted against base both stay separable, and the
   geometry carries the second distinction, as `docs/UI.md` §9 says it does.
3. **The slash on a lit segment is two-toned.** `-on` is set once the fill is
   above zero (`track.ts`, `solid > 0`), so a multi-mark segment can be partly
   lit. With a single `SelectedItemText` stroke, the slash on Overfull (marks)'s
   last segment drew only across the lit half and disappeared over `Canvas`.
   Adding `border-bottom: 1.5px solid CanvasText` under the `SelectedItemText`
   top border fixes that: one half reads on the fill and the other on the card,
   measured visible along the whole diagonal. It is the plugin's companion idiom
   (§6) applied to a stroke, and it stays in this mode only.
4. **A wholly lit glyph and the lit `+N` count take `forced-color-adjust: none`**, with
   every colour on them spelled as a system colour. The reason is the backplate:
   in this mode Chrome paints a `Canvas` plate behind text. With only
   `color: SelectedItemText`, the lettered segment on Overfull (named) and the
   `+147` on Overfull (far) drew black on that plate, which is invisible (shot).
   With the adjustment the count is `SelectedItem` / `SelectedItemText` and its
   `::after` edge `SelectedItem`. `forced-color-adjust` is inherited, so
   anything inside either element that this block does not name stays on theme
   colours. The build checks that nothing else is in there. The glyph rule keys
   on `-full`, as the ring does in point 2: keyed on `-on`, a half-lit lettered
   segment lost its backplate across the whole glyph, and the unlit half drew
   black on `Canvas`. A partly lit glyph keeps the mode's `CanvasText` on its
   plate, which is also what `docs/UI.md` §6 allows. The count box is lit as a
   whole, so it stays on `-on`.

The granted rule's long comment in `sheet.css` still says "the border under it is
`transparent` and `dashed`… so the overlay stands down in that mode". The rule's
own later paragraph and the code (`border-width: 0`, the overlay is the mark in
every mode) contradict it. The build corrects that paragraph, because this block
is the forced-colors branch it describes.

### Table: Record set's departure, a third time

```css
@media (forced-colors: active) {
.sheetsmith-view .sheetsmith-table-linked .sheetsmith-table-link-layer {
		visibility: hidden;
	}
.sheetsmith-view .sheetsmith-table-linked .sheetsmith-table-input:not(:focus) {
		color: var(--text-normal);
	}
}
```

The block goes right after the `.sheetsmith-table-linked …:not(:focus)` rule.
It follows Record set's shape and comment voice: one short comment calling it
"the record name's departure, applied here", plus what it costs. With the layer
hidden there is nothing to press, so the cell's text is readable and its link
cannot be followed; the raw `[[Target]]` still shows where it points. It uses
`visibility` rather than `display`, so the grid cell keeps its size. One
selector covers all three layer placements: name, plain cell and secondary
gloss. Measured, the prototype shows `[[Sunblade|swor…`, `in [[Bag of
Holding]]` and `[[Torch of Reve…` cleanly. **It also removes a defect the row
did not name**: the layer's `1px solid transparent` border is repainted
`CanvasText` too, so the Bag of Holding cell drew a doubled frame. A hidden layer
draws no border.

Record set's comment at the name departure ("Table has the identical defect…
and it is *not* fixed here") becomes a pointer to this block.

### The alternative, measured, and the ruling

The cell can keep its press. Give the unfocused linked input
`forced-color-adjust: none; color: transparent; background-color: Canvas;
border-color: CanvasText`, and give the layer `border-color: Canvas`. The text
under the layer is then truly transparent, the anchor paints in `LinkText`, and
the prototype rendered `sword`, `in Bag of Holding` and `Torch of Revealing` as
links with frames matching their neighbours. **It works in Chrome's emulation.**
The arguments against it, and the reasons this spec still takes the departure:

- The field's border and surface are then spelled by hand instead of by the mode.
  They match the neighbours only while the mode paints inputs `Canvas` /
  `CanvasText`. A contrast theme that gives fields their own colour
  (`Field` / `FieldText`) would leave the linked cells looking different from
  every other cell in the table. One palette was measured, not every palette.
- Its hover and focus states would need the same hand-spelling to stay
  consistent.
- Record set's name and worked-out layer both take the departure. A third
  component answering differently splits one rule in two, unless Record set
  moves as well, which is outside this pass.

**Ruled: the owner chose the departure.** This section stays as the record of
that ruling. Keeping the press would be a ruling covering all three stacks, and
would belong in a pass of its own.

### Empty and error states

An empty run has no fill and is unchanged. An unresolved count (`?`) is text
and is unchanged. A linked cell is never empty, because an empty cell has no
link and so no stack.

## Config fields

None.

## Data and file model

Nothing stored, nothing changed. CSS in `src/styles/sheet.css` (then
`styles.css` by build); one render-only class in `src/components/track.ts`,
`sheetsmith-track-segment-full` on a wholly lit segment, with its case in
`track.test.ts`, which writes nothing to the note; and docs.

## Acceptance criteria

- [x] `sheet-forced-colors.png` (default view, unchanged query): Endurance (5
      of 6) and Endurance (low) (2 of 6) draw visibly different runs. Five and
      two filled squares respectively, filled in `SelectedItem`.
- [x] Same shot: a lit granted segment (Endurance's fifth, Fettle's first) is
      distinguishable from a lit base segment and from an unlit granted ring.
      Blocked slots on Vigour and Cursed vigour still draw their slash, and
      Cursed vigour's lit-and-slashed segment differs from its unlit one.
- [x] Same shot: every over slash on the six Overfull runs is visible along its
      whole diagonal, including the partly lit last segment of Overfull (marks).
- [x] Same shot: the lettered segment on Overfull (named) and `+147` on
      Overfull (far) are legible on their fill, with no dark plate behind the
      text.
- [x] Same shot: each of the five linked Table cells shows one layer of text,
      the raw `[[…]]`, with a single frame. Bag of Holding's doubled frame is
      gone.
- [x] `sheet-light` and `sheet-dark` are pixel-identical to before, because
      every new rule sits inside `forced-colors: active`. No view renders
      `prefers-contrast: more`, which is its own open row; nothing here touches
      that block.
- [x] The Track block and the Table block each carry a comment giving the
      measured reason (the 1.49:1, the backplate, the partly lit slash; the
      repainted `transparent`). The Table comment names Record set's
      departure as its precedent. The stale "overlay stands down" paragraph is
      corrected, and Record set's "not fixed here" sentence becomes a pointer.
- [x] `docs/UI.md` §9's "A segment a modifier granted" and "A slot a modifier
      took away" rows each gain one sentence on what the mark is in forced
      colors.
- [x] `docs/UI.md` §6 gains one line governing `forced-color-adjust: none`:
      allowed only on a glyph or count sitting on a system-colour fill the
      plugin itself painted. Its colours then come from system keywords only,
      never theme tokens, and each use is evidenced by a `sheet-forced-colors`
      shot.
- [x] The two rows are gone from `docs/BACKLOG.md` § UI and no other row moved.
      `src/backlog.test.ts` passes.
- [x] `npm run lint`, `npm test`, `npm run build` and `npm run harness:shot`
      pass. The land stop carries crops of `sheet-forced-colors.png` at the
      Endurance row, the Overfull rows and the Inventory table, next to the
      same crops from before the change.
- [x] **Real app, macOS, no OS setting needed.** macOS has no forced-colors
      mode: **Increase contrast** maps to `prefers-contrast: more`, never
      `forced-colors`, so the OS setting cannot check this on the owner's
      machine. Use the emulation instead, in the throwaway vault
      (`~/Developer/sheetsmith-test-vault`). Open `Characters/Ilona.md` (layout
      `Modifier variations`). Press Cmd+Opt+I, then **⋮ → More tools →
      Rendering → Emulate CSS media feature forced-colors → active**. Endurance
      and Endurance (low) differ. Press Endurance's run to step it, and the fill
      follows. Drag along it, and the pending ghost shows faint ahead of the
      fill. Untick **Worn** on the Talisman of Endurance row and the dashed
      ring goes. Vigour's blocked slots slash. Then open `Characters/Aramil.md`
      (layout `DnD 5e Caster`), Inventory: the `[[Sunblade|sword]]` and
      `[[Zhentarim]]` cells read as raw text, and pressing one puts the caret
      in the field. `Characters/Overruns.md` (layout `Track variations`) holds
      the over runs. On Windows, a contrast theme under **Settings →
      Accessibility → Contrast themes** is the real check against a palette
      that is not Chrome's.

## Commit boundaries

1. `fix: Paint a Track's value in forced colors`. The Track block, the corrected
   granted comment, the two §9 sentences, and the Track row out of BACKLOG.
2. `fix: Show a linked Table cell's raw text in forced colors`. The Table block,
   Record set's comment pointer, and the Table row out of BACKLOG.
3. `docs: Forced colors on Track and Table`. This file, `Status: shipped`, and the
   `docs/UI.md` §6 line governing `forced-color-adjust: none`.

## Deliberately not doing

- Every other § UI row: the `--text-faint` audit, "No view renders
  `prefers-contrast: more`", the bad-drag border row, the editor pane's
  forced-colors rows (`.sheetsmith-field-error`, the dropdown chevron), and
  Record set's three-circles row.
- The alternative above that keeps a cell's press. It was measured, and the
  owner ruled for the departure.
- **Any palette but Chrome's.** Only Chrome's `--force-high-contrast` palette
  was measured. No Windows contrast theme (Aquatic, Desert, Dusk, Night sky) was
  rendered, so each contrast figure in §Design holds for that one palette.
  `SelectedItemText` on `SelectedItem` is a pair the system guarantees, but
  `SelectedItem` against `Canvas` is not.
- **Multi-mark dividers on an unlit segment.** `.sheetsmith-track-mark` is a
  `background-color`, repainted `Canvas`. It shows over the fill (dark on
  `SelectedItem`) and not over an unlit part. This is pre-existing and is a
  question about where marks fall inside a segment, not about the value. If the
  review confirms it, the build adds a row for it rather than fixing it here.
- The harm grade in this mode. It fills flat, by the `prefers-contrast` block's
  own rule.
- A new harness view. The default `sheet-forced-colors` already stages a Track
  at two values, granted, blocked, partly lit, lettered and over-count segments,
  and five linked cells. The ghost is the one state no still reaches; it is
  checked by dragging in the real-app recipe above.

## Accepted as built at the land stop

- **A lit granted segment reads by its gaps.** Its `SelectedItemText` dashes
  merge into the dark `Canvas` around the segment, so at 1x it reads as a square
  with bitten edges. It is distinguishable from a lit base segment and from an
  unlit granted ring, but it is the "nibbles" look `docs/UI.md` §9 rejected for
  the themes.
- **On a half-lit lettered segment the glyph's backplate covers part of the
  fill**, so the fill reads slightly short there. It needs `levels` and
  `marks` above 1 together, since only a multi-mark segment can be partly lit.
