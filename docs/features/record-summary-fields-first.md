# A record's fields take their width before its name grows

Status: shipped
Board card: `docs/BACKLOG.md` § UI, "A record's name track takes free space before its fields reach their width, adding up to 73px to every multi-field fit"

Standard route, one backlog row. The precedent is `docs/features/record-set-stacking-tiers.md`, whose fit derivation this changes and whose measuring method it reuses unchanged.

## Model question

None. This changes one grid track on the summary line and the width model that copies it. It reads, writes, publishes and stores nothing. It touches no §13 question and does not grow the §4.1 contract.

## What it does

On a Record set's plain summary line, the fields' track reaches its full width F before the name's track takes any free space. A multi-field line therefore fits at `192 + F` (the name at its six-em floor) instead of `96 + F + clamp(F − m, 96, 169)`. Every multi-field list draws its plain line up to 73px narrower than it does now, and its fit tier drops with it. A one-field line is unchanged, because its spare `F − m` is zero and the clamp already held it at the floor.

## Smallest version

One word of CSS and one line of the formula. The fields' track in `.sheetsmith-record-summary` goes from `auto` to `max-content`, and `lineFitPx` becomes `96 + F + 96`. **What it gives up:** the fallback for an engine with no style queries. In that engine only the 320px block stacks, so the plain line is drawn above 320px whatever its fit. Today a too-narrow line wraps its fields inside their track. With `max-content` the name collapses to 0 and the delete glyph is pushed past the box's clipped edge. Measured on Traits with the stack forced off, the name is 13px at 360 and 0 at 340, and at 320 the delete's right edge is at 338 in a 320px box. The full design costs one wrapper rule and one test assertion more, and keeps that engine's line as it is today. **The owner chose the full design.**

## Design

### It is a grid-template change, and the strip is untouched

**Why one track sizing function is enough.** The grid's "maximize tracks" step shares free space equally among every track that is under its growth limit. The name's `minmax(0, 13em)` and the fields' `auto` (from the widest field m up to F) are both under their limits, so they grow together. Nothing in that step can rank one track before another. What changes the order is the fields' base size. With `max-content`, the fields' track starts at F, and the name gets only what is left, up to its 169px cap. The `1fr` slack takes the rest, as it does today.

**The full design gates the change so the fallback keeps today's line.** The `max-content` template is written once, as its own rule:

```css
@container not style(--sheetsmith-record-stack: on) {
	.sheetsmith-record-summary {
		grid-template-columns: auto minmax(0, var(--sheetsmith-record-name, 13em)) max-content 1fr auto;
	}
}
```

It sits right after the base `.sheetsmith-record-summary` rule, and therefore before the stack block and the strip block. An engine with no style queries drops the rule and keeps the base `auto` template. Its plain line wraps its fields exactly as it does today. In an engine with style queries, a stacked line fails the `not` and takes the stack block's template, as now. A headed list over its strip takes the strip's `subgrid`, which comes later in the source and wins.

**The strip and the group headers need nothing.** Under the strip, each field is its own `auto` track in the list's grid, and the summary is a subgrid of it. Only a text field can compress there, and the strip comes in after its 14ch. This was measured by prototyping both the ungated template and the strip's `repeat(N, auto)` changed to `repeat(N, max-content)`. Every headed list (Known spells, Traits, Recharging ×2, Rest features, Homebrew strip, Grouped spells) drew the same name width and field widths at 18 widths from 328 to 1000px under either strip template. Homebrew strip's text field is 114.6px, its full 14ch, from 424 up. So the strip keeps `repeat(N, auto)`: changing it moves nothing measured, and it would stop a one-text-field strip at 328px from compressing its text. An unheaded list under group headers uses the base summary grid, and the sweep below covers every grouped list.

### The stacked line's wrap margin does not move

The stacked template (`auto minmax(0, 1fr) auto`, fields spanning `2 / -1`) replaces the plain one outright, and the fields' wrapper is untouched. Measured with the stack forced on, from the stacked fields' wrap point back to F, the margin is the same before and after on every list: 46.8 to 47.3px on a multi-field list. A one-field list never wraps when stacked. The method differs from the one behind `UI.md`'s "46.3 to 46.8", which reads half a pixel lower. The ruling "Stacked is the narrowest layout, and below it the fields wrap" and the "about 47px" in `docs/UI.md` §9 both stand.

### The new fit, and why the guarantee is now simpler

`lineFitPx` becomes `LINE_CHROME_PX + F + NAME_FLOOR_PX`, with F the fields plus a 20px gap between each. That is a plain sum.

- **Never unstacked short of the fit.** The plain line now fits exactly where its name reaches 96px with F beside it. Every estimate term is monotone in the field widths, so if every field's estimate is at or above its drawn width (`record-line-fit.test.ts` already holds every sample), the line's estimate is at or above its measured fit. The old clamp had a `− m` term. Over-estimating the widest field lowered it, so a cautious field width did not by itself guarantee a cautious fit. That term is gone.
- **Stacked at most 2em past the fit.** The overshoot is the estimate's own error plus under one 16px step. It still comes to 20px at worst (the `pinned-add` lists, unchanged), as the table below shows.

Removed with the clamp:

- `fieldWidthPx`'s `min`, which existed only to give m.
- `TEXT_MIN_PX`, with its `styles.test.ts` hold. The input's `min-width: 5ch` stays in CSS for the strip.
- `NAME_CAP_PX`, with its hold. The name's cap no longer enters any fit.
- The "lets a text field narrow to its floor" test.

**A new copied width does not arise, but a new premise does.** The formula is only true while the plain line's fields' track is `max-content`. `styles.test.ts` holds that: the gated rule exists, it sits after the base summary rule and before the stack block, and its third track is `max-content`.

**The residue changes shape.** In an engine with style queries, a plain line is drawn only at or above its estimated tier. A line can still be narrower than its real fit if the estimate runs short, as with a name of wide letters like `WWWW`. Today, such a line wraps its fields inside their track. After this change, its name narrows below 96px first, and only when the shortfall exceeds 96px are its fields and delete pushed past the clipped edge. Reaching 96px at the 3.9px a character that `W` exceeds the estimate by takes about 25 such characters across one line's field names and options. That trade (a narrowed name for a wrapped line, then overflow far past any sample) is the one the owner approves with this spec.

### Where each list stacks, before and after

"Before" was measured now, on this branch's built harness. "After" was measured with the gated rule inserted by CSSOM in the same cascade position. Every number is in px at the default type size.

- **Plain fit** is swept in half pixels with the strip and the stack forced off and every declared field shown. It is the narrowest width with fields on one row, name ≥ 96px and the fields left of the delete.
- **Stacked to** in the "after" columns is from the new formula. The stamped tier is the component's, which a CSSOM prototype does not move.

| State | List | F | m | Plain fit, before | Plain fit, after | Est. fit, after | Tier, before → after | Stacked to, after | Past fit | Strip from |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| populated | Known spells | 116.9 | 76.1 | 308.5 | 308.5 | 313.9 | 20 → 20 | 320 | 11.5 | 424 |
| populated | Traits | 257.2 | 100.7 | 509.5 | 449 | 449.3 | 32 → 29 | 464 | 15 | 712 |
| populated | Spells | 225.9 | 92.1 | 455.5 | 418 | 424.2 | 29 → 27 | 432 | 14 | — |
| populated | Recharging features (headed, unheaded, broken) | 276.3 | 100.7 | 541 | 468 | 468.4 | 34 → 30 | 480 | 12 | 616 (headed two) |
| populated | Rest features | 194.7 | 100.7 | 386.5 | 386.5 | 386.8 | 25 → 25 | 400 | 13.5 | 424 |
| text-groups | Homebrew features, Tabbed features | 256.7 | 146.3 | 519 | 448.5 | 452.8 | 33 → 29 | 464 | 15.5 | — |
| text-groups | Homebrew strip | 187.1 | 146.3 | 397.5 | 379 | 383.1 | 26 → 24 | 384 | 5 | 424 |
| text-groups | Homebrew in the body | 90.4 | 90.4 | 282.5 | 282.5 | 282.5 | 18 → 18 | 288 | 5.5 | — |
| record-groups | Class features, Tabbed features | 90.4 | 90.4 | 282.5 | 282.5 | 282.5 | 18 → 18 | 288 | 5.5 | — |
| record-groups | Grouped spells, Group by nothing, Group by a toggle | 116.9 | 76.1 | 308.5 | 308.5 | 313.9 | 20 → 20 | 320 | 11.5 | 424 (Grouped) |
| record-groups | Spells by name | 95.8 | 55 | 287.5 | 287.5 | 287.9 | 18 → 18 | 288 | 0.5 | — |
| pinned-add | Few records, tall; Many records, short | 92.1 | 92.1 | 284 | 284 | 289.3 | 19 → 19 | 304 | 20 | — |
| — | Rituals (no fields) | 0 | 0 | 192 | 192 | 192 | 12 → 12 | 192 | 0 | — |

The drop is `clamp(F − m, 96, 169) − 96`, measured within half a pixel on every list: 73 on Recharging (whose spare, 175.6, is past the cap), 70.5 on Homebrew features, 60.5 on Traits, 37.5 on Spells, 18.5 on Homebrew strip, and 0 where `F − m ≤ 96`. No list stacks under its strip, and no list stacks more than 20px past its fit. Every headed list whose tier falls draws its plain line over a wider band below its strip:

- Traits, from 464.5 to 711.5;
- Recharging, from 480.5 to 615.5;
- Homebrew strip, from 384.5 to 423.5.

### How the measurements were taken, and the re-measure plan

The sweep is `harness/measure-groups.mjs` check 7's own, run per state (`node harness/measure-groups.mjs`, `… text-groups`, `… pinned-add`, each of which also sweeps `populated`), at the default type size, `text=20` and `text=24`. The build session:

1. Records "before" from a `git worktree` of `release/0.6.0`. The numbers above are the expected "before" and were taken from that tree's equivalent on this branch.
2. Extends check 7a so a plain line also fails when a visible field's right edge passes the delete glyph's left edge. Under `max-content`, the failure is an overflow and no longer only a wrap, and 7a would not otherwise see it.
3. Runs check 7 after the change and replaces `record-line-fit.test.ts`'s `LISTS` fits with the "after" column. The text sizes must agree, since every width on the line is px.

### A name narrower than its floor clips, reveals on hover, and never overlaps

Under fields-first the name is the track that gives, so when it narrows it has to read as truncated and not as damaged. The rule is `src/ui/truncation.ts`: clip with an ellipsis, and reveal the whole text as a `title` on hover, only while it is clipped. **The record name follows that rule today in two of its three forms, not all three.** This was checked in the code and with a real pointer in the harness, with a 24-`W` name on Traits:

| Name form | Ellipsis | Reveal on hover | Overlap |
| --- | --- | --- | --- |
| Plain text (`.sheetsmith-record-name-input`, the common case) | yes: `text-overflow: ellipsis` on the field, drawn as `WWWW…` | **no**: the field is never passed to `revealWhenTruncated`, and a real pointer over it left `title` empty | none: the field's right edge stays 4px left of the fields' at 700, 449, 430, 400 and 360px, down to a 13px name |
| A sole link (`[[Ring of Protection]]`) | yes, on the anchor (`-record-link-only > a`) | yes, through `paintLinkedText`'s `clipping.reveal(anchor)`: `title` "Ring of Protection" at 73px of 111 | none |
| Read-only, for a record with an unreadable block (`-name-plain`) | yes, in CSS | **no**: only a sole-link anchor inside it is bound | none |

**What this pass changes.** In `drawName`, `record-set.ts` calls `revealWhenTruncated` on:

- the plain field, in `nameField`'s no-link branch only. The input is the module's own stated case: it reads the input's `value`.
- the `-name-plain` cell, which clips its own rendered text.

A name that mixes text and a link (`[[Sunblade]] of dawn`) is not bound on its field. The field holds the raw `[[…]]`, so its `title` would reveal the source and not what is drawn. Its layer is already bound, but only a pointer over its link reaches the layer, since the layer is `pointer-events: none`. That gap was found by reading the CSS, not staged. It is recorded in `docs/BACKLOG.md` (below) and not fixed here. Nothing changes in CSS, since the ellipsis and the no-overlap already hold.

**The harness stages it.** Traits in the `populated` state gains one record named `WWWWWWWWWWWWWWWWWWWWWWWW`: 24 W's, about 312px, which is past the 169px cap at every width. Traits is already deliberately over-full, so one more record fits its sample's purpose. At Traits' narrowest plain width (464.5px, tier 29) the name has about 111px and draws `WWWW…`. Anything that counts Traits' records (`record-set.test.ts` imports `SAMPLES`) is updated with it.

Check 7 measures the case under the floor too. Its forced-plain sweep already runs below each list's fit, where the name goes under 96px. It gains a condition (7d): at every width, no name's box passes the left edge of its fields.

### Empty and error states

A line with no fields is 192px either way. A record with an unreadable block draws `-name-plain` in the same track and is sized the same. Nothing else changes.

## Config fields

None.

## Data and file model

Nothing stored and nothing written. Round trip and existing notes are untouched. Constraints 3 and 4 are not reached.

## Acceptance criteria

- [x] `sheet.css` has one `@container not style(--sheetsmith-record-stack: on)` rule giving `.sheetsmith-record-summary` the template `auto minmax(0, var(--sheetsmith-record-name, 13em)) max-content 1fr auto`, after the base summary rule and before the stack block. The base rule keeps `auto`, and the strip's `repeat(var(--sheetsmith-record-fields), auto)` is unchanged.
- [x] `styles.test.ts` holds that rule's existence, its `max-content` third track, and its position, and no longer imports `NAME_CAP_PX` or `TEXT_MIN_PX`.
- [x] `record-line-fit.ts`: `lineFitPx` is `96 + F + 96`, `fieldWidthPx` returns a width alone, and `TEXT_MIN_PX` and `NAME_CAP_PX` are gone. The comment describes fields-first sharing.
- [x] `record-line-fit.test.ts`: the formula reproduces Traits' measured 449px from its drawn widths within 1px, and a line with no fields is 192px.
- [x] `record-line-fit.test.ts`: every list in `LISTS` carries its "after" fit from the table above. It is estimated at or above that fit and stacked no more than 32px past it, or to its strip.
- [x] `record-set.test.ts`: the tiers are recomputed by the new formula. Traits' line is `-fit-29`, Spells' with its dropdown is `-fit-27`, Homebrew's text-and-counter line is `-fit-29`, and the one-field cases (`Level / 9` `-fit-19` with `-fits-narrow`, `Level / 100` `-fit-20`) are unchanged. Snapshots are updated.
- [x] `node harness/measure-groups.mjs`, `… text-groups` and `… pinned-add` pass checks 7a (now including the overflow condition), 7b and 7c at the default type size, `text=20` and `text=24`. Every list's "plain from" matches the table's "after" column within 1px.
- [x] Harness at width=1258 draws Traits' plain line, as before.
- [x] `record-set.test.ts`, with `scrollWidth` faked past `clientWidth` (the `table.test.ts` precedent): a pointer entering a plain record name sets its `title` to the name, and one entering an unclipped name sets none. The same holds for a `-name-plain` name. A name mixing text and a link gets no binding on its field.
- [x] `harness/samples.ts`: Traits holds a record named with 24 W's, and its body says why.
- [x] `node harness/measure-groups.mjs` check 7d: in the forced-plain sweep from 150 to 1300px, no record name's box passes its fields' left edge, at the default type size, `text=20` and `text=24`.
- [x] Harness, with Traits at 464.5px of list: the W name draws one line ending in an ellipsis, the fields keep their full width beside it, and a real pointer resting on the name shows the whole name as its `title`.
- [x] Traits is plain at 470px of list and stacked at 460, where it used to be stacked to 512.
- [x] With style queries switched off (the rule removed by CSSOM in the harness), Traits at 340px wraps its fields and keeps its delete glyph inside the box, as today.
- [x] Before and after shots of every frame under "Shots" go to the land stop.
- [x] `docs/UI.md` §9 and the stacking-tiers doc are amended as under "Docs". The BACKLOG row is gone and `src/backlog.test.ts` passes.
- [x] `npm test`, `npm run lint`, `npm run build` pass, and `styles.css` is regenerated.

### Shots

Dark theme, explicit frames (a scoped shot writes `custom.png` at its own width, so give every one a width).

- Traits-spells at widths that put Traits at 450, 470 and 510px of list.
- Traits at its narrowest plain width (464.5px of list), with the W-named record in view: the clipped name beside its full-width fields. Light and dark.
- Recharging (unheaded) at 470 and 540px of list.
- `text-groups` at the widths that put Homebrew features at 450 and 520px.
- Width 620 full, both themes, as the regression frame.

### Docs

- `docs/UI.md` §9, "A record's summary line": add that the fields' track takes its width before the name grows, gated on style queries, and that the strip is unchanged. The "about 47px" sentence stands.
- `docs/UI.md` §9, "A word a player types to name a group": a text field and a counter now fit from 448.5px and are stacked up to 464px, not 519 and 528.
- `docs/UI.md` §4 holds no record threshold by number, so it is unchanged.
- `docs/features/record-set-stacking-tiers.md`: "The fit is not a sum" gains a line that this pass replaced it with `192 + F` (pointing here), and "Deliberately not doing"'s grid-sharing item points here. Its tables stay as the record of that pass.
- `docs/BACKLOG.md` § UI: the row leaves, and two rows arrive. The section ends at 47 rows (48 with the Ability checks row added at review), above `backlog.test.ts`'s floor of 25, and each new row stays under its 600-character ceiling with all four cells filled:
  - `| Under the strip a record's name caps at 208px, not the plain line's 169 | `styles/sheet.css` `.sheetsmith-record-set-list` | The list's `minmax(0, var(--sheetsmith-record-name, 13em))` resolves `13em` at the list's 16px, where the plain summary resolves it at the record's 13px, so a name gains 39px as the strip comes in. That contradicts `record-set-heading-strip.md`'s "the name and the delete glyph sit where they sit unheaded". Measured on every headed harness list. | a pass on the strip's tracks, or a name seen to jump at a strip threshold |`
  - `| A record name mixing text and a link reveals nothing over its text | `components/record-set.ts` `nameField`, `ui/truncation.ts` | The layer is bound but `pointer-events: none`, so only a pointer over the link reaches it, and the field under it holds the raw `[[…]]`, so binding the field would reveal source, not what is drawn. A plain name reveals through its field and a sole link through its anchor. Read from the CSS, not staged. | such a name clipped in a real vault, or a reveal that can read a layer from its field |`

### In the app, 2026-10-08

The 0.6.0 cycle's in-app pass ran here, for this doc, `record-set-stacking-tiers.md` and `table-name-column-floor.md`, and the method below serves every feature doc that cites this date. **At desktop widths every list stacked and went plain where the "after" column says, within 0.5px, and the W-named record clipped with an ellipsis and carried its whole name in `title` under a real pointer. At phone width the fields wrapped under the name as ruled, but the plain line failed: Obsidian's mobile `width: 100%` on text inputs outranks the line's field widths, so names collapse to 11 to 39px.** That is routed as a bug, not fixed here. Obsidian 1.14.4 over the DevTools protocol, with the plugin built from `release/0.6.0` at `467c017`.

**What each width is.** The harness's `width=` is the stage's `max-width`, and the stage holds `.sheetsmith-view`, so 620 is the pane: in the app, the sheet view's `.view-content`, which is the `.sheetsmith-view` element. 620 was taken as that element's own width. Its padding is 12px against the harness's 16, so the sheet's content box is 8px wider in the app at the same width. 470 is Traits' own list width, as this doc uses it ("Traits is plain at 470px of list"). 390 is the window, a phone approximation and not a device (below).

| List (vault note) | Plain fit, doc / app | Stacked to, doc / app | Strip from, doc / app |
| --- | --- | --- | --- |
| Known spells (Harness populated) | 308.5 / 308.5 | 320 / 320 | 424 / 397.5 |
| Traits | 449 / 449 | 464 / 464 | 712 / 667.5 |
| Spells | 418 / 417.5 | 432 / 432 | — / — |
| Recharging features, headed, unheaded and broken | 468 / 467.5 | 480 / 480 | 616 / 577.5 |
| Rest features | 386.5 / 386 | 400 / 397, where its strip arrives first | 424 / 397.5 |
| Homebrew features, Tabbed homebrew (Records) | 448.5 / 448.5 | 464 / 464 | — / — |
| Homebrew strip | 379 / 379 | 384 / 384 | 424 / 397.5 |
| Homebrew in the body, Class features, Tabbed features | 282.5 / 282.5 | 288 / 288 | — / — |
| Grouped spells, Group by nothing, Group by a toggle | 308.5 / 308.5 | 320 / 320 | 424 / 397.5 (Grouped) |
| Spells by name | 287.5 / 287 | 288 / 288 | — / 397.5, since the vault's copy is headed and the harness's is not |

Every fit and tier agrees within 0.5px. Every strip arrives at 15/16 of the harness width, because the strip's thresholds are `em` and the sheet's `em` is 15px in the app. That is the `docs/BACKLOG.md` § UI row on the harness's `text=`, now measured in the app. No sweep found a wrap, a line stacked under its strip, or a name passing its fields (checks 7a to 7d).

**At the three widths.**

- **620** (`.sheetsmith-view` 620px): every list on Harness populated is stacked. Known spells is at 92.7px, Spells at 243.7 and Recharging unheaded at 193.3, against the 91, 240 and 190 the stacking-tiers doc lists at harness 620.
- **Traits at 449.9, 460.4, 470.3 and 510.6px of list** (panes 801, 819, 836 and 905): stacked, stacked, plain, plain. At 470.3 the W name is 123.6px, ends in `…`, and its right edge sits 4px left of its fields, which keep their 251.2px. A pointer moved onto it with `Input.dispatchMouseEvent` set `title` to all 24 W's. **The app draws its own tooltip too**: about 1.3s later Obsidian shows "Feature", the field's `aria-label`. Whether the native `title` tooltip also shows cannot be seen in a screenshot, since the OS draws it. Recorded in `docs/BACKLOG.md` § UI.
- **390, phone** (window 390 × 844): every list is 366px wide. Known spells (tier 20) is plain, and every other list on both notes is stacked with its fields wrapped onto two or three rows under the name, as ruled. **Known spells' names are 11px wide, and so are Grouped spells' and both bad-group lists'. Class features', Homebrew in the body's and Inside a group's are 39px.** The cause: `.is-mobile input[type="text"] { width: 100% }` in Obsidian's `app.css` (0,2,1) outranks `.sheetsmith-view .sheetsmith-record-input { width: 3.5em }` (0,2,0), so a number field's input takes its intrinsic width, 177px for `size=20`, in a `max-content` track. The check-7 sweep under phone emulation puts plain fits 131 to 147px past their tiers (Known spells 451, Traits 602.5), and it fails 7a across that band. The same rule decides the width of 13 classes of sheet input on that page, Table names included: at 390, Magic items' "Gauntlets of Ogre Power" and "Girdle of Giant Strength" clip by about 10px, because the sizer measures the text and the input adds its padding inside the column. At pane 620 on desktop every Magic items name reads whole. In both cases the sheet never scrolls sideways, the table's own scroller does, the name stays at its sticky edge when scrolled to the end, and the last cell is reachable.

#### How the in-app checks were taken

A rebuildable record. The scripts lived in a session scratchpad, and no tree file was used to run them.

- **The connection.** Obsidian ran with `--remote-debugging-port=9222`, with the owner's real vault open in other windows. So the driver is `harness/inspect.mjs`'s CDP code (Node's `fetch` and `WebSocket`, no dependency) with two changes. It picks the one `page` target from `http://127.0.0.1:9222/json` whose title contains ` - sheetsmith-test-vault - `. And before every command it evaluates `app.vault.adapter.basePath`, exiting unless it is `/Users/ricardopereira/Developer/sheetsmith-test-vault`. It is held open as a small local HTTP server (`127.0.0.1:9333`, one JSON command per request: an `eval`, a `shot` to `Page.captureScreenshot`, or a raw CDP method), because device-metrics emulation ends with its session.
- **Version and build.** `require('obsidian')` does not resolve outside a plugin, so the version came from `require('electron').ipcRenderer.sendSync('version')`: 1.14.4. The user agent's `obsidian/1.12.7` is the installer. The plugin was reloaded with `app.plugins.disablePlugin('sheetsmith')` and `enablePlugin`, and the loaded stylesheet was the same 495,550 characters as the built `styles.css`.
- **Widths.** Sidebars were already collapsed and the ribbon is 44px, so `Emulation.setDeviceMetricsOverride` at a width of the wanted pane + 44 (mobile false, scale 2) gave `.sheetsmith-view` exactly that width. Phone was `app.emulateMobile(true)` (it reloads the window) plus the override at 390 × 844, mobile true, scale 3. It is an approximation of a phone: the app's mobile CSS and `is-phone` layout on a desktop Chromium, not a device. Both were turned off afterwards (`app.emulateMobile(false)`, `Emulation.clearDeviceMetricsOverride`).
- **Input.** A click is `Input.dispatchMouseEvent` moved, pressed and released at an element's centre. It is sent only after `elementFromPoint` at that point returns the element, because an unchecked click once opened an image. Typing is `Input.insertText`, after `setSelectionRange` chose what it replaces. Keys are `Input.dispatchKeyEvent` `rawKeyDown`/`keyUp`, with Meta as modifier 4 for Cmd-F and Shift as 8. `Emulation.setFocusEmulationEnabled` was on for the keyboard checks, because a click in another window blurred the field and committed it once.
- **Sweeps.** `harness/measure-groups.mjs` check 7's `SWEEP` expression, verbatim, run in the app's renderer. It was scoped to the active leaf's `.sheetsmith-view`, and its forcing `<style>` is removed afterwards. It sets each Record set's own width from 150 to 1300px in half pixels, so the fits are list widths. The note is reopened afterwards to undo its inline styles.
- **The populated sheet in the vault.** A script bundled with esbuild (`obsidian` aliased to `src/test/obsidian-stub.ts`) imports `harnessLayout` from `harness/stub-app.ts` and `SAMPLES`. It writes `serialiseLayout({ ...harnessLayout(), name: 'Harness populated' })` to `Sheetsmith layouts/Harness populated.sheetsmith`. It writes `Characters/Harness populated.md` as `sheet-layout: Harness populated` plus one `## <label>` per component in `walkLayout` order holding its sample body, children's bodies included.
- **Overlap.** For every pair of top-level grid cells, the intersection of their boxes, and how many of one cell's tables, cards and inputs land inside the other's box. Each cell's painted extent was also taken, clipped by every ancestor whose overflow is not visible.
- **Shots** went to the land stop from the scratchpad, dark theme as the app was set.

## Commit boundaries

1. `fix: Give a record's fields their width before its name grows`. Contains:
   - the gated rule in `src/styles/sheet.css` and the regenerated `styles.css`;
   - `record-line-fit.ts` and its test;
   - the recomputed tiers and snapshots in `record-set.test.ts`;
   - the two `revealWhenTruncated` bindings in `record-set.ts` and their tests;
   - `src/test/clipped.ts`, the faked-clip helper, with `ui/truncation.test.ts`, `table.test.ts` and `card.test.ts` moved onto it beside the new record-set tests;
   - the W-named Traits record in `harness/samples.ts`;
   - the `styles.test.ts` changes;
   - check 7a's overflow condition and check 7d in `harness/measure-groups.mjs`.
2. `docs: Settle fields-first sizing on a record's line`. Contains `docs/UI.md` §9's two rows, the stacking-tiers doc's pointers, the `docs/BACKLOG.md` row's removal and its three new § UI rows (the two above, and the Ability checks group drawing over the cards below it at width 620, which predates this pass), `docs/SPEC.md`'s Record set groups line, and this spec.

## Deliberately not doing

- **The other BACKLOG § UI rows**, notably "A narrow card's table has cells that never show whole beside its sticky name" and "The harness's `text=` scales the sheet's `em`, which in Obsidian follows no text-size setting". Both are untouched.
- **The strip's template.** It keeps `repeat(N, auto)`, for the measured reason above, and the strip thresholds are unchanged.
- **The strip's 208px name cap.** Under the strip, the name's `13em` resolves at the list's font size and measures 208px, against 169 on the plain line. That predates this pass and is recorded as a `docs/BACKLOG.md` § UI row with its own trigger (above). It is not fixed here.
- **A name that mixes text and a link** reveals only over its link. It is recorded as a § UI row, and not fixed here.
- **The stacked layout itself**, its template, its wrap below about 47px past its fields, and the ruling that there is no third layout of one field per row.
- **Any change to the estimate's per-character widths**, the tier step, the table's range or the fallback's 320px block.
- **Any read, write, publication or file-format change.**
- **Every editor-pane row.**
