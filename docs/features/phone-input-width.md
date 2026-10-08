# A sheet field keeps its width on a phone

Status: shipped
Board card: none. Found by the 0.6.0 in-app check pass and routed as a bug: `docs/features/record-summary-fields-first.md` § "In the app, 2026-10-08".

## Model question

None. This changes which CSS rule decides the width of a sheet text field. It reads, writes, publishes and stores nothing. It touches no §13 question and does not grow the §4.1 contract.

## Scope

On a phone, Obsidian adds `.is-mobile input[type='text'] { width: 100% }` at specificity (0,2,1). The sheet scopes every field rule under `.sheetsmith-view` (`docs/UI.md` §2), which buys (0,2,0). That clears the desktop `input[type='text']` at (0,1,1) and loses to the phone rule. So on a phone every text field the sheet gives a width took the whole width it was offered instead. A record's number field went from 52.5px to 176.5px, and Known spells' names shrank to 11px. This fixes it for every sheet field the rule reaches.

## Inputs the rule reaches

The list below was re-derived from `src/styles/sheet.css` and then checked in the app. On Harness populated and Records, each text input was measured with the app's rule switched on and off by CSSOM. Before the fix, 282 of the 581 inputs moved (record names among them, moved by their fields). After the fix, none moved. The scan sees only fields that are open when it measures: a closed field is 0px both ways and counts as unmoved. The pool's adjust amount is closed until pressed, so the scan reported it unmoved. Its evidence is a separate measurement taken with it open, and the shot `pool-adjust-390-phone-dark.png`.

**Nine classes whose width the rule was replacing.** Widths are with the rule off → on, at 390 phone:

| Field | Class | Its width | Phone, before |
| --- | --- | --- | --- |
| A record's number field | `-record-input` | 3.5em | 52.5 → 176.5, names to 11 and 39px |
| A table's number or formula cell | `-table-input` | 4em | 60 → 27.8, narrower |
| A table row a character added | `-table-name-input` | `calc(100% + 2 × inset)` | the 8px it pulls back is lost, so names clip by up to 10px |
| A pool's reading | `-pool-current` | 4ch, or `auto` with `field-sizing` | 73.4 → 329.7, its `/9` pushed to the card's edge |
| A pool's temp | `-pool-temp-input` | 3ch | 28.3 → 174.5 |
| A pool's adjust amount | `-pool-adjust-amount` | 5ch | 50.4 → 187, measured open (the scan cannot see it closed) |
| A passport's part | `-passport-input` | `auto`, which is its `size` | 36 to 92 → 348 |
| A track's typed row name | `-track-row-name-input` | 8ch, or `auto` with `field-sizing` | 27.4 → 80.2 and 107 |
| A pool's max, and a track row's length | `-pool-max-input` | `calc(3ch + 4px)`, or `auto` | moved 0, but only because its shrink-to-fit parent makes the 100% cyclic |

**Reached, and already safe:**

- `width: 100%`, which is what the app sets too: `-card-input`, `-card-note-input`, `-image-input`, `-passport-name-input` and `-record-name-input`.
- Already above (0,2,1): a card's input beside a derived value (`.sheetsmith-card-has-derived .sheetsmith-card-input`, 4em) and a roster band's (`.sheetsmith-roster-band-value .sheetsmith-card-input`, 4ch), both (0,3,0), and a record's ceiling field, (0,4,0).
- Two `width: 100%` overrides of a doubled rule, a table's prose cell (`.sheetsmith-table-text .sheetsmith-table-input`) and a record's text field (`-record-input-text`). Each used to beat its (0,2,0) base on weight, and doubling the base would have left them winning only by coming later, so each doubles a class too and sits at (0,4,0) (below).
- The anchored panel's `-panel-input` sizes by `flex`. With the add-modifier form open, all eight of its controls measured 210.8 → 210.8.
- Selects and textareas are not `input[type='text']`: `-rich-text-input` and `-record-body-input` are textareas, both at `100%`.

## The fix

For each of the nine classes, `width` moves out of its rule into a rule of its own that declares the width and nothing else, with the class doubled:

```css
.sheetsmith-view .sheetsmith-record-input.sheetsmith-record-input {
	width: 3.5em;
}
```

That is (0,3,0) and wins outright. The three `@supports (field-sizing: content)` overrides are doubled whole, since they hold only sizing and still win by coming later. The two `100%` overrides that used to beat a (0,2,0) base on weight, a table's prose cell and a record's text field, double a class as well and sit at (0,4,0), so they still win on weight and not on order. One comment, at `.sheetsmith-table-input`, gives the reason, and the others point to it.

- **The width alone, not the whole rule doubled.** Each base rule also sets border and background, and the fields' shared `:hover` and `:focus` rules are (0,3,0) and come earlier in the file. A doubled base rule would beat them, and hover and focus would stop showing.
- **A doubled class, not `input.x` or `[type='text']`.** `input.x` is (0,2,1), a tie that wins only because the plugin's stylesheet loads after the app's. `styles/editor.css` already rejects that: "A rule that holds by source order is a rule that stops holding without anything being edited." `[type]` would silently stop matching if a field's type ever changed. Doubling the class is `editor.css`'s own precedent for replacing an `!important`.
- **No `!important`, and no rule written on Obsidian's selector.** A reset like `.is-mobile .sheetsmith-view input[type='text']` would have to beat (0,2,1) and still lose to the sheet's own widths at (0,2,0), which no single weight can do.

## Is it a 0.6.0 regression?

**The narrow names are, and the override under them is not.** The 3.5em rule and its weight are the same at the 0.5.0 tag (`ed6cfe4`), and so is the phone rule. What changed is the fields' track. At 0.5.0 it was `auto`, which shared the free space between name and fields. `record-summary-fields-first.md` made it `max-content`, where a 100%-wide input takes its intrinsic width, 177px for `size=20`.

| 390 phone, first record | 0.5.0 (`ed6cfe4`) name / field | 0.6.0 before the fix | After the fix |
| --- | --- | --- | --- |
| Known spells | 110.9 / 120.9 | 11.3 / 176.5 | 135.3 / 52.5 |
| Class features | 103 / 113 | 39.5 / 176.5 | 163.5 / 52.5 |

At 0.5.0 the field was already more than twice its 52.5px, but the name kept about 100px.

## Every name in the vault, 0.5.0 against the fix

Every Record set name and Table row name on every character note in the test vault was measured at 390 phone, under the 0.5.0 build and under this fix. Every tab of every tab set was visited. The counts below are the record. The per-name table was not kept, and **How it was checked in the app** below gives enough to rebuild it.

- **580 names.** 555 are drawn by both builds. The other 25 are drawn only after the fix: Records' Homebrew lists, which use the free-text group key that 0.5.0 cannot draw.
- **290 wider, 225 within 0.5px, 40 narrower.**
- **Clipped: 123 at 0.5.0 and 11 after the fix.** 113 names that clipped at 0.5.0 no longer do. One name is newly clipped: Cards / Inventory / `[[Torch of Revealing]]`, 194.1 → 166.1px. It is a sole link, so it ends in an ellipsis and reveals on hover (`ui/truncation.ts`).
- **All 40 narrower names are Table names beside number cells, narrower by 3.2 to 50px**, because the fix gives those number cells back their 4em. At 0.5.0, and on 0.6.0 before the fix, the phone rule had shrunk them to their column's minimum. On Cards / Inventory, forcing the number cells back to `100%` by CSSOM put the cells at 28 and 54px and the name at 210px. With the fix the cells are 60 and 60, and the name is 172.

## The fit at phone text size, which this does not fix

With the fix in place, check 7's sweep in the app at 390 phone shows the plain line's fit above the stamped tier on every list but one unlabelled list on Records, which fits at 222 and stacks to 224. On mobile Obsidian sets `body` to 16px and `--font-ui-small` to `16px × 0.937`, so a record's text is 14.99px. The estimate's per-character widths in `components/record-line-fit.ts` assume 13px, and a field's `3.5em` is 52.5px where it is 45.5 on desktop.

| List | Plain fit | Stacked to | Short by |
| --- | --- | --- | --- |
| Known spells, Grouped spells, Group by nothing, Group by a toggle | 327 | 320 | 7 |
| Bare list, Spell cards | 198 | 192 | 6 |
| Spells (Records) | 344.5 | 336 | 8.5 |
| Class features, Inside a group, Homebrew in the body | 299 | 288 | 11 |
| Rest features | 414.5 | 400 | 14.5 |
| Traits, Features | 478.5 | 464 | 14.5 |
| Spells (populated) | 447 | 432 | 15 |
| Spells by name | 304 | 288 | 16 |
| Homebrew features | 484.5 | 464 | 20.5 |
| Recharging features (populated) | 502.5 | 480 | 22.5 |
| Items | 520 | 496 | 24 |
| Homebrew strip | 408 | 384 | 24 |
| Recharging features (Records) | 634.5 | 592 | 42.5 |

In that band a line is drawn plain with its name under 96px, so check 7a fails at phone. Checks 7c and 7d are clean: nothing is stacked under its strip, and no name passes its fields. Before the fix the same sweep put fits 131 to 147px past their tiers. The owner kept the formula and tiers as they are; the gap is a `docs/BACKLOG.md` § UI row. The strip's `em` is 16px at phone, so the strip arrives where the harness puts it.

## The guard

`styles.test.ts`, "a sheet input's width outranks Obsidian's phone rule". Every rule that gives a text field a width other than `100%` must weigh more than (0,2,1).

- **A text field** is a class matching `FIELD_CLASS` that does not end in `-select`, plus the text inputs in `NAMED_FIELD_CLASSES`. That list is the scope check's own list of controls named outside the pattern. `-pool-adjust-amount` joined it here; it was scoped all along but never listed. The canvas overlay is the other entry, and it is filtered out because it is a button.
- **The guard is only as complete as that naming.** A text input sized through a class outside both, or through an element selector, gets past it.
- **A second case holds the overrides.** A rule that gives a doubled field a width under a narrower selector must outweigh the doubled rule. The same selector restated under `@supports` is exempt, since it is the base itself, answered by order on purpose. It asserts it recognised a doubled base for at least the nine fields, so a base respelled out of its exact shape cannot leave it nothing to check, and it has a "would catch" case of its own. It was red on exactly the two `100%` overrides above before they were doubled.
- A textarea under the pattern is swept in too. It would need a doubled class it does not strictly need, and nothing else; today both, `-rich-text-input` and `-record-body-input`, are at `100%`.
- The width check asserts it finds at least 12 such selectors, and a "would catch" case drives it over the shapes it rejects. Before the CSS change it was red on exactly the 12 selectors that shipped.
- To share the weight function, `specificity`, `heavier` and `same` moved from inside the "a field its condition hid is hidden" block to module level.

**Why a scan and not a harness state.** The harness runs on `obsidian-stub.ts`, which sets no `.is-mobile`. `harness/obsidian.generated.css` carries none of the app's mobile rules, and it is gitignored, so a check that needed it would pass silently on a clone without it. The scan needs only the stylesheet, and it checks the weight, which is the actual cause.

## Data and file model

Nothing stored and nothing written. Round trip and existing notes are untouched. Constraints 3 and 4 are not reached.

## Acceptance criteria

- [x] `sheet.css`: the nine classes' widths sit in doubled-class rules at (0,3,0), the three `field-sizing` overrides are doubled, and the two `100%` overrides are at (0,4,0). There is no `!important`, and no rule on Obsidian's selector.
- [x] `styles.test.ts`: both guard cases and their "would catch" cases pass, and each was red before its CSS change.
- [x] In the app at 390 phone, in both themes, switching Obsidian's phone rule on and off moves no open sheet text input.
- [x] At 390 phone, in both themes, Known spells' names are 135.3px and Class features' are 163.5, with their number fields at 52.5.
- [x] At 390 phone, in both themes, Magic items' "Gauntlets of Ogre Power" and "Girdle of Giant Strength" no longer clip.
- [x] At desktop pane 620, every measurement (record names, fields, Magic items names, every input's width) is identical before and after, in both themes.
- [x] `npm test`, `npm run lint`, `npm run build` pass, and `styles.css` is regenerated.

## How it was checked in the app

The driver is the one `record-summary-fields-first.md` § "How the in-app checks were taken" describes:

- a guarded CDP session on port 9222, targeting only the ` - sheetsmith-test-vault - ` page, with `basePath` checked before every command;
- phone as `app.emulateMobile(true)` plus a 390 × 844 mobile metrics override;
- desktop as a 664px override, which is the 620px pane plus the 44px ribbon;
- theme by `app.vault.setConfig('theme', 'obsidian' | 'moonstone')` and `app.setTheme()`, set back to `system` afterwards.

The owner's other vault was kept closed by clearing its `open` flag in Obsidian's `obsidian.json` before the launch and restoring the file byte for byte after quitting.

- **The fixture.** `Characters/Harness populated.md` (Known spells, Magic items, a pool, a passport, track rows), generated as that doc describes, and `Characters/Records.md` (Class features and every grouped list), both already in the vault.
- **Which inputs are reached.** On each note, every `input[type="text"]` in the active `.sheetsmith-view` and any open `.sheetsmith-panel` was measured. Then the `CSSStyleRule` whose `selectorText` is `.is-mobile input[type="text"]` had its `width` cleared, the inputs were measured again, and the width was put back. A class is reached where any of its inputs moves by more than 0.5px. A field closed at the time is 0px both ways and reads as unmoved, so the pool's adjust amount was measured separately: opened by a real click on `.sheetsmith-pool-adjust-trigger`, then measured with the rule on and off. The modifier form was opened by clicking a Magic items row's modifier button and then **Add a modifier**.
- **0.5.0.** `git worktree add --detach <dir> ed6cfe4` outside the repository, with the repository's `node_modules` linked in and its `data.json` copied across, then `npm run build` there. To measure it, the vault's `.obsidian/plugins/sheetsmith` symlink was repointed at that directory with `ln -sfn`, and the plugin reloaded with `app.plugins.disablePlugin('sheetsmith')`, `loadManifests()` and `enablePlugin`. That the right build was loaded was checked by the length of the plugin's injected `<style>`: 440,200 characters for 0.5.0 and 497,968 for the fix, each equal to its own built `styles.css`. Afterwards the symlink went back to the repository and the worktree was removed with `git worktree remove` and `git worktree prune`. Phone emulation survives a plugin reload, so both builds were measured in one session.
- **The name table.** Run once per build, at 390 × 844 with `app.emulateMobile(true)` and dark theme:
  - **Notes.** Every `Characters/*.md` was opened in the active leaf. A note whose view did not become `sheetsmith-sheet` was skipped.
  - **What was measured.** In the active `.sheetsmith-view`:
    - for each record in a Record set, its `.sheetsmith-record-name-input`, or `.sheetsmith-record-name` where it has none;
    - for each row of a Table, its `tbody .sheetsmith-table-name` cell's input, or its link or text.
  - **Each name's record.** Its width from `getBoundingClientRect()`, its list's label (the Record set's `.sheetsmith-record-set-label`, or the nearest ancestor's `-label` child), and its name.
  - **Every tab.** Each tab set's `[role="tab"]` buttons were clicked in turn, everything was measured again after each, and the first tab was clicked again at the end. Which tab is open is view state only (`sheet-view.ts`'s `activeTab`), so nothing was written to a note.
  - **Matching.** The two runs' rows were matched by note, kind, list label, name, and that name's occurrence count within its list. The count is used rather than the position, because a grouped list orders its records by group and the two builds group differently. A difference within 0.5px counts as the same width.
  - **Clipped.** An input is clipped where its `value`, measured in the input's own computed `font` with a canvas `measureText`, is wider than `clientWidth` minus its horizontal padding, by more than 0.5px. A link or plain text is clipped where `scrollWidth` exceeds `clientWidth` by more than 1px. An input's own `scrollWidth` was not used, because it reads a pixel over `clientWidth` from rounding on fields that clip nothing: a first pass that used it called "Magic Missile" in a 135px field clipped, and an empty field clipped too.
- **The fit.** `harness/measure-groups.mjs` check 7's `SWEEP`, verbatim, scoped to the active leaf, with its forcing `<style>` removed afterwards.
- **Shots.** Taken before and after the fix, both from the same build steps, so either set can be shot again:
  - **What.** Known spells and Magic items on Harness populated, and Class features on Records.
  - **Where in the list.** Each frame is the viewport, with the component's label scrolled to the top of the view (`scrollIntoView({ block: 'start' })` on its cell).
  - **Widths and themes.** 390 phone and pane 620 (a 664px override), each in both themes.
  - **Pool adjust.** One more at phone, dark: the pool's adjust opened by a real click on `.sheetsmith-pool-adjust-trigger`, with its cell scrolled to the centre. Before the fix it shows the amount field across most of the card and the `/9` pushed to the card's edge. After, both sit beside the number.
  - **Comparisons.** The measurements taken with each frame are what the comparisons in this doc rest on. At 620 they are identical before and after, and at 390 they are identical between light and dark.

## Commit boundaries

1. `fix: Keep a sheet field's width on a phone`. Contains `src/styles/sheet.css`, the regenerated `styles.css`, and `src/styles.test.ts`.
2. `docs: Record the phone input width fix`. Contains this doc and the three `docs/BACKLOG.md` § UI rows.

## Deliberately not doing

- **The fit formula and its tiers.** At phone text size they run 6 to 42.5px short (above). The owner kept them as they are; recorded as a § UI row.
- **The strip's 15/16 em row, the tooltip row, and the Ability checks row** in `docs/BACKLOG.md`. All are deferred and untouched.
- **The editor pane.** `.sheetsmith-position-field input { width: 5em }` is (0,1,1) and loses to the phone rule too. The pane is not the sheet; recorded as a § UI row.
- **Tablet buttons.** Obsidian's `.is-tablet button:not(.clickable-icon)` sets padding at (0,2,1), over every sheet button rule at (0,2,0). Recorded as a § UI row, not staged.
- **`docs/UI.md` §2.** It states the desktop numbers, which still hold. This fix adds a phone case, and the guard and this doc carry it.
- **Any read, write, publication or file-format change.**
