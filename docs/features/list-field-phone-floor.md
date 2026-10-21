# A list field keeps its width beside the touch arrows

Status: shipped
Board card: none. Scoped by the owner from the `docs/BACKLOG.md` § UI row "On a phone, two of the Skills form's list fields collapse", confirmed on an iPhone 17 (402 × 874, Obsidian 1.14.5 mobile) on the DnD 5e Standard layout's Skills table, where none of the 18 row names could be read.

## Model question

None. This changes how a stacked list row in the layout editor places its fields beside its buttons, with one class hook. It reads, writes, publishes and stores nothing, touches no `SPEC` §13 question, and does not grow the §4.1 contract.

## What it does

Under 380px of list, on a phone or tablet, the Rows list's **Row name** and the Columns list's **Key** are drawn at about 26px, so nothing typed in them can be read. After this change they draw two to a line at 159px, beside their neighbours, the same shape a desktop draws at that width. On every touch row the reorder arrows sit at the start of the line and the trash at its end, as they already did on Skills and the Columns lists, where nothing moves. On the other touch rows the arrows move left to x 36 and 66 (see Design).

## The cause, measured

The backlog row's fix column asks for a floor on the two fields. A floor does not fix the cause, and measured it moves the clipping onto the fields beside them.

**The cause is the button count, not the fields.** Under `@container (max-width: 380px)` a row is `grid-template-columns: 1fr` and its buttons go on `grid-row: 99`. Two buttons cannot share one cell, so each button past the first opens an implicit `auto` column, and the fields then auto-place across those columns as well.

- **On a desktop** there are two buttons, the handle and the trash. That makes two columns, `1fr` and `auto`, so the fields sit two to a line, 154px and 164px.
- **On a touch device** there are three buttons, up, down and trash. That makes three columns. The two `auto` columns grow to their inputs' max-content first, and the `1fr` gets what is left, 26px.

The row's own comment, "fields stacked full width", describes neither shape. Desktop's two-to-a-line is an accident of the same mechanism, but it is the accident `list-scroll-cap.md` measured: its 321.4px Skills entry and 376.4px *Recharging features, broken* entry were taken on 2026-10-16. That was before `a0d4e91` (2026-10-18) made the harness draw the touch arrows, so the harness's phone rows had a desktop's two buttons.

**It is not `phone-input-width.md`'s mechanism.** With every `.is-mobile input` width rule cleared by CSSOM, the widths are identical: Row name 26, Key 26.

At 380 under phone staging, harness built from this branch's base. Each width is a field's box, `.sheetsmith-field` or a direct input.

| List (component) | Today | A 9em floor on the first field | This design |
| --- | --- | --- | --- |
| Rows (Skills) | Row name **26** · Publishes as 146 · ability 142 | 144 · **87** · **83** | 159 · 159 · 159 |
| Columns (Skills, Traits, Recharging, every Columns list) | Key **26** · Heading 166 · Holds 122 | 144 · **87** · 83 | 159 · 159 · 159 |
| Rows (Stat roster) | Row name 71 · Stat 124 · Publishes as 120 · flag 71 | 144 · 87 · 83 · 144 | 159 × 4 |
| Track rows, `-entry-counted` (Hit dice) | **32** · 164 · 118 · **32** · 164 | not measured | 159 × 5 |
| Passport list, `-entry-flagged` (Playbook) | **32** · 161 · 121 | not measured | 159 × 3 |
| Card set entries (Abilities) | 92 · 198 | unchanged | 159 · 159 |
| Promoted fields (Checks) | Value 94 · Property 198 | unchanged | 159 · 159 |
| Modifiers (Checks) | Name 266 | unchanged | 322 |

With the floor, 4 of the 4 Skills **Publishes as** fields and 6 of the 7 on Stat roster clip their placeholder, and so do 3 of 3 Columns **Heading** fields. The floor puts the clip one field to the right.

At 402, the iPhone 17's width, today's harness measures the same 26px, which matches the device.

## Smallest version

Scope the rule to `.sheetsmith-list-scroll`, the Rows and Columns lists only, the two fields the owner named. It leaves Track rows and Passport lists at 32px for the same reason, and it would need a backlog row of its own. It costs the same CSS plus a narrower selector, so it is not recommended.

## Design

**One class hook.** `addControls` in `editor/list-fields.ts` already branches on `Platform.isMobile` to draw the arrows. In that branch it adds `sheetsmith-entry-arrows` to the row. Every list that draws arrows goes through `addControls`: Rows, Columns, Card set entries, Track rows, Passport lists, promoted fields and modifiers. So one hook reaches all of them, and nothing is spread over seven call sites. Not `:has()`, which `field-error.ts` already argues against for the pane.

**One rule set, inside the existing 380 query, after the rules it overrides** (`editor.css`'s own note that `@container` adds no specificity):

- **A touch row has two explicit field tracks**, `repeat(2, minmax(0, 1fr))`, so the fields sit two to a line whatever the button count.
- **Its buttons span the row** (`grid-column: 1 / -1`) on line 99, so they open no implicit column. Up is `justify-self: start`. Down is `start` as well, offset by one control width plus the stacked row's column gap, which is named once as `--sheetsmith-stacked-column-gap` on the stacked row and read by both. The trash is `end`, and keeps its existing optical pull.
- **The arrows move to the start of the line on every touch row**, where Skills and the Columns lists already had them. Measured at 380 under phone staging, up / down / trash before → after:

  | Touch row | Before | After |
  | --- | --- | --- |
  | Skills Rows, every Columns list | 36 / 66 / 336 | unchanged |
  | Modifiers | 276 / 306 / 336 | 36 / 66 / 336 |
  | Promoted fields | 104 / 134 / 336 | 36 / 66 / 336 |
  | Card set entries | 100 / 132 / 334, each 28 wide | 36 / 66 / 336, each 26 wide |
  | Track rows, Passport lists | 42 / 72 / 336 | 36 / 66 / 336 |
  | Stat roster Rows | 80.7 / 110.7 / 336 | 36 / 66 / 336 |

- **A row holding one field gives it both tracks.** The Modifiers list's row holds one field, its name, and a second track would halve it. The rule is keyed on what the row holds, not on the list's name or on a count of its buttons: `.sheetsmith-entry-arrows > :first-child:nth-last-child(1 of :not(button.clickable-icon))`, the first child that is also the last of the row's non-control children, so its only field, spans `1 / -1`. So no list declares its field count a second time beside `--sheetsmith-list-fields: 1`, and a new one-field list is covered. The `of S` argument needs Chromium 111 or Safari 9, inside what the manifest's `minAppVersion` of 1.9.0 ships. Measured at 380 under phone staging, in `populated` and `broken` and at `text=24`: it matches all 11 Modifiers rows and no other of the 194 touch rows. The name fills the row, 266 → 322.
- **The offset reads `--sheetsmith-list-control`, and every touch row's buttons take that width.** The token is declared once on `.sheetsmith-entry-list`, replacing the two identical copies on `.sheetsmith-list` and on `.sheetsmith-entry-counted, .sheetsmith-entry-flagged`, so Card set's plain entry list can read it. Every list but Card set's plain entries already sized its buttons to it, 26px under phone staging. Card set's were 28, and the offset alone would have overlapped down onto up by 2px, so the touch rule sets `width: var(--sheetsmith-list-control)` on every touch row button: Card set's go 28 → 26. The 18px icon and the 4px padding each side fill 26 exactly, so nothing inside the button is clipped.

**Nothing outside the 380 query moves**, and nothing on a desktop moves at any width, because the hook is only set where the arrows are drawn.

**Heights.** At 380 phone, a stacked entry grows by one field line, which matches the entry `list-scroll-cap.md` measured:

- **Skills.** Its first Rows entry goes from 122 to 172 (the third, with a longer row value, from 125 to 190). The first Columns entry goes from 256.4 to **321.4**.
- ***Recharging features, broken*.** Its entry goes from 311 to **376**, which is the stacked floor's own figure, so the 400px cap still holds one whole entry.
- **Track rows** go from 138 to 186 for the first row, and from 139 to 187 for the rest.

**Interactions:** none new. The arrows keep their positions, labels, disabled ends and focus handoff (`disabled-controls.md`). The fields are the same inputs, and the order the pane is read in is unchanged.

**Empty and error states.** An empty list draws no rows, so nothing changes. A row whose field carries a message grows that field's line only. The cap floor already counts that, at 376.

## Config fields

None.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |

## Data and file model

Nothing is stored or written. Round trip and existing notes are untouched. Constraints 3 and 4 are not reached.

## Also in this work (docs only)

- **The device pass ran.** It was taken on an iPhone 17 and an iPad Air. A Rows or Columns list's inner scroller does not trap touch: it scrolls to its end, and the next swipe moves the pane, in both directions.
- **`docs/BACKLOG.md` § UI, "A capped Rows or Columns list whose cut falls between two entries reads as complete".** Record that result in its row. Its waiting condition becomes "a fix of its own". The overflow cue is **not** built.
- **`docs/BACKLOG.md` § UI, "On a phone, two of the Skills form's list fields collapse".** Retire the row, since this work closes it.
- **The neighbouring row, "A long Rows or Columns list is a scroller nested in the pane"**, waits on the same device pass. It is left as it is, and the owner decides it separately.

## Acceptance criteria

All widths are a field's `getBoundingClientRect().width`, in the harness, after `npm run harness`.

- [x] **The two fields.** At 380 under phone staging (`platform=phone`, touch on), every Skills **Row name** is at least 150px, and so is every **Key** in every Columns list in the harness (Skills, Traits, Recharging, Stat roster, Inventory). Today each is 26.
- [x] **Their neighbours.** At the same staging, no other field of those rows is under 150px: Skills' **Publishes as** and **ability**, and Columns' **Heading** and **Holds**.
- [x] **The other touch rows.** At 380 under phone staging:
  - Hit dice's Track rows and Playbook's Passport list draw no field under 150px.
  - Abilities' Card set entries and Checks' promoted fields draw two fields at about 159.
  - Checks' Modifiers name fills the row, about 322.
- [x] **The buttons do not move.** At 380 under phone staging, the up, down and trash buttons of Skills' first Rows entry are at x = 36, 66 and 336, each 26 wide, as they are today. They sit on one line under the fields in every touch row.
- [x] **The desktop does not move.** At 380 with no staging, every field width and row height on Skills, Stat roster, Hit dice, Playbook, Abilities and Checks is identical to before. The baseline is Skills 154 · 164 · 154, Modifiers 298 and row heights 159 / 142. At 600 and 1500 with no staging, and at 820 under tablet staging, every list's `grid-template-columns` and row heights are identical to before.
- [x] **The cap still holds.** `node harness/measure-lists.mjs` passes. Its stacked tallest entry is *Recharging features, broken* at about 376.4px, back to the figure its comment and `list-scroll-cap.md` quote. The Skills first Columns entry is about 321.4.
- [x] **A regression guard.** `measure-lists.mjs` gains a check: at 380 under phone staging, no `.sheetsmith-field` in a Rows or Columns entry row is under 150px, and at 380 unstaged no *first* field, the Row name or the Key, is under 150px. It is red on the tree without the hook, at 26. The unstaged leg holds only the first field because the desktop does not move: a four-field Rows list (Stat roster's shape) has always drawn its Stat select at 95 to 116px there, and the check prints those rather than failing on them.
- [x] **The hook.** A `list-fields.test.ts` case shows that with `Platform.isMobile` a list row carries `sheetsmith-entry-arrows`, and without it the row does not.
- [x] **The shots.** `npm run harness:shot` is run, and `editor-phone-skills`, `editor-phone`, `editor-narrow`, `editor-reorder-arrows-phone`, `editor-light` and `editor-dark` are looked at:
  - In `editor-phone-skills`, each row name and key reads whole.
  - `editor-narrow` and the desktop views are unchanged.
  - No phone view's frame now crops its form. Re-measure a frame through its own query if one does.
- [x] **The arrows at a larger text size.** A harness shot of the Skills form at 380 under phone staging with `text=24` is taken and looked at: the down arrow sits beside the up arrow, one control width plus the gap along, as at the default size. The down button's offset is arithmetic over the button width, and the buttons scale with the Text setting, so this is the case that offset can miss. If the arrows drift there, the offset goes: `addControls` gives the two arrows a wrapper of their own and the wrapper is what is positioned.
- [x] **Card set entries and promoted fields, looked at.** These two lists change shape, 92 · 198 to 159 · 159. Shots at 380 under phone staging of Abilities' Card set entries and Checks' promoted fields are among the PNGs at the land stop, and in each the second field still shows its content. A long value that now clips is reported, not hidden.
- [x] **The device.** On the iPhone, with the DnD 5e Standard layout's Skills open, the 18 row names and every key read whole and can be edited.
  - **Met on an iPhone 17** (iOS 27, Obsidian 1.14.5 mobile, 402px), built from this work's final tree: all 18 Skills Rows entries and all 3 Columns keys draw at 171px with no input clipping its value, and a tap on a Row name focuses it; Passport list fields and Hit dice's Track rows draw at 171px with nothing clipped; the Modifiers one-field rows fill at 346px, so the `of S` selector holds in iOS WebKit.
- [x] **The backlog.** The two rows above are edited as described, and the Skills form row is gone.
- [x] `npm run lint`, `npm test` and `npm run build` pass, and `styles.css` is regenerated, not hand-edited.

## Commit boundaries

1. `fix: Keep a stacked list row's fields two to a line beside the touch arrows`. Contains `src/editor/list-fields.ts` (the hook), `src/styles/editor.css` (the rule set, with a comment giving the button-count cause and the measurements), the regenerated `styles.css`, the `list-fields.test.ts` case, the new check in `harness/measure-lists.mjs`, and two views in `harness/shot.mjs`. `editor-phone-skills-large-text` and `editor-phone-layout-lists` stay because they are the only views of this rule at `text=24` and on the layout's own touch lists (promoted fields, Modifiers).
2. `docs: Record the list field phone fix and the scroller device pass`. Contains this doc and the `docs/BACKLOG.md` § UI edits: the three above; the light-theme surface row widened from Abilities' entries to Skills' Rows fields; and five new rows found in this work's review, all docs with no code: entries outgrowing the 400px cap at `text=24` (30 lists, against 5), the promoted-field **Value** select truncating its options at 159px, stacked Track rows and Passport lists drawing no field labels, the touch arrows under the 28x28 coarse minimum, and a Columns entry's controls sitting between its fields and its detail line.

## Deliberately not doing

- **The overflow cue on a capped list.** Its row records the device result and waits on a fix of its own.
- **"A long Rows or Columns list is a scroller nested in the pane"**, which also waited on the device pass. It is mentioned, not decided.
- **Making the desktop stacked row match the design comment**, one field per line. Desktop's two-to-a-line stays as it is, accident and all. One field per line on a phone would put *Recharging features, broken* at about 440px, past the 400px floor.
- **The light-theme Abilities entry surface row, the tablet canvas `touch-action` row**, and every other `docs/BACKLOG.md` § UI row.
- **Anything on the sheet.**
