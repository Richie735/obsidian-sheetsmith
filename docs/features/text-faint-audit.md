# Text faint audit

Status: shipped
Board card: one row of `docs/BACKLOG.md` § UI, taken alone as the row asks: "23 sheet text colours are `--text-faint`, which measures 2.12:1 light and 2.57:1 dark on a card". It covers every `color: var(--text-faint)` in `src/styles/sheet.css`. There are exactly 23 today, at the lines the card lists, verified by grep on `feat/text-faint-audit`.

## Owner rulings

All settled: the owner ruled at spec approval, taking the **full design rather than the smallest version**. The measurements below stay as the record of what each ruling was chosen against. Six groups, one ruling each. Every number below was measured in the built harness (`npm run harness`) at a `1400,8500` window on the calibrated palette (`harness/obsidian.generated.css`). Each variant was injected into a scratch page as a stylesheet, so no tree file changed. The scripts lived in a session scratchpad, and **How the measurements were taken** below records what they did, in enough detail to rebuild them. The measurement found every element whose computed `color` is `--text-faint` across all nine harness states (`populated`, `empty`, `unmodified`, `effective`, `broken`, `record-groups`, `text-groups`, `notes`, `pinned-add`), in both themes. For each one it walked up to the first opaque background, compositing any translucent layers on the way, and computed the ratio against that surface. **Nothing faint went unattributed**: the stray check found zero faint text outside the 23 rules.

**Two instances were computed from the variables rather than rendered**, and the reason for each is recorded here:

- **#3, 1774, the Table secondary column's link layer.** No sample's secondary cell holds a wikilink. A link typed with `&type=` commits but the harness does not re-render the cell into its linked stack, so the layer never appears. Changing `harness/samples.ts` would have changed a tree file. The layer sits in the same cell as #2, on the same `--background-primary-alt`, so its figures are #2's from the variables. Only the plain words around a link take this rule, since the anchor keeps the link colour.
- **#17, 3208, the disabled trigger.** The harness draws no trigger bar on any state, because `view/sheet-view.ts` renders it and the harness does not mount that view. The button paints its own opaque `--background-primary`, so the surface under its text does not depend on where it sits, and the ratio comes from the variables against that.

The tokens on this palette are `--text-faint` `#ababab` / `#666666`, `--text-muted` `#5c5c5c` / `#b3b3b3`, and `--text-normal` `#222222` / `#dadada` (light / dark). The surfaces the 23 actually sit on:

| Surface | Light | Dark | Faint | Muted | Normal |
| --- | --- | --- | --- | --- | --- |
| A card, `--background-secondary` | `#f6f6f6` | `#282828` | 2.12 / 2.57 | 6.19 / 7.03 | 14.72 / 10.55 |
| A table or a placed box, `--background-primary-alt` | `#fafafa` | `#232323` | 2.20 / 2.74 | 6.41 / 7.50 | 15.24 / 11.24 |
| Pool's pill and a trigger button, `--background-primary` | `#ffffff` | `#1c1c1c` | 2.30 / 2.97 | 6.69 / 8.13 | 15.91 / 12.19 |

Two bars apply (`legibility.md` §1, §3). Text under 24px regular, or under 18.66px bold, needs **4.5:1**. Larger text needs **3:1**. Two instances are large: Card's `?` (28px, 400) and Pool's spent value and Passport's name placeholder (28px, 700). **Faint clears neither bar on any surface, in either theme.** Muted clears both everywhere, at 6.19:1 or better.

### The instances

| # | Rule (line) | What it is | Drawn on the sample | Surface | Size, weight | Faint L / D | Proposed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `.sheetsmith-card-abbreviation` (640) | a card's gloss, `STR` | 55 on cards (Abilities, Armour class…) | card | 10.2px, 400 | 2.12 / 2.57 | **muted** (G1) |
| 2 | `.sheetsmith-table-input-secondary` (1334) | a secondary column's text, `Elf` | 12 (Features → Source) | table | 10.2px, 400 | 2.20 / 2.74 | **muted** (G1) |
| 3 | `… -secondary + .sheetsmith-table-link-layer` (1774) | the same column's text when it holds a link (the plain words around it; the anchor keeps the link colour) | **not drawn**: no sample's secondary cell holds a link, and a typed one does not re-render in the harness | table, from the variables (same cell as #2) | 10.2px, 400 | 2.20 / 2.74 | **muted** (G1) |
| 4 | `.sheetsmith-pool-temp-label` (2659) | the pill's `TEMP` | 5 (Hit points…) | pill | 12px, 400 | 2.30 / 2.97 | **muted** (G1) |
| 5 | `.sheetsmith-pool-spent` (3037) | a Pool's headline value at or below 0 | staged with `&type=.sheetsmith-pool-current\|0` (Hit points) | card | **28px, 700** (3:1 bar) | 2.12 / 2.57 | **muted** (G1) |
| 6 | `.sheetsmith-track-step` (4395) | a threshold Track's step name, `Lost, 2 over` | 5 (Overfull (named)…) | card | 10.2px, 400 | 2.12 / 2.57 | **muted** (G1) |
| 7 | `.sheetsmith-card-derived-unresolved` (931) | Card's `?` | 22 in `empty`/`broken` (Armour class, Passive perception…) | card | **28px, 400** (3:1 bar) | 2.12 / 2.57 | **muted** (G2) |
| 8 | `.sheetsmith-table-unresolved` (2167) | a computed cell's `?`, and a total's | 11 in `empty` (Skills, Abilities as a roster) | table | 16px, 400 | 2.20 / 2.74 | **muted** (G2) |
| 9 | `.sheetsmith-pool-max-unresolved` (2516) | Pool's ceiling `?` | 1 in `empty` (Hit points). Record set's 4 already wear muted by an override at 6378 | card | 15px, 400 | 2.12 / 2.57 | **muted** (G2) |
| 10 | `.sheetsmith-track-unresolved` (4407) | Track's count `?` | 7 (Unmade, Fettle…) | card | 15px, 600 | 2.12 / 2.57 | **muted** (G2) |
| 11 | `.sheetsmith-track-action-button` (3608) | Track's **Add** and **Remove** picker glyphs. The rule is a list of four, but the other three are overridden to muted at 3641 | 37 (Hit dice, Open hit dice…) | card | 13px icon | 2.12 / 2.57 | **muted** (G3) |
| 12 | `.sheetsmith-passport-part-remove, …-passport-add` (5389) | Passport's add glyph (always drawn), and the part's remove glyph (drawn only while its part has focus) | 5 add (Multiclass). Remove staged by focusing a part | card | 13px icon | 2.12 / 2.57 | **muted** (G3) |
| 13 | `.sheetsmith-table-remove-button` (1809) | a table row's delete glyph, at rest | 145 | table | 13px icon | 2.20 / 2.74 | **muted** (G3) |
| 14 | `.sheetsmith-record-remove` (5988) | a record's delete glyph, at rest | 183 | box | 13px icon | 2.20 / 2.74 | **muted** (G3) |
| 15 | `.sheetsmith-pool-temp-empty` (2622) | the pill holding 0: its container | 1 in `empty` (Hit points), which draws `TEMP —`. The `0` itself is staged with `state=empty&type=.sheetsmith-pool-temp-input\|0` | pill | 16px | 2.30 / 2.97 | **muted** (G5) |
| 16 | `.sheetsmith-pool-temp-empty .sheetsmith-pool-temp-label, … -input` (2627) | the pill holding 0: `TEMP` and its `0` | staged as #15 | pill | 12px | 2.30 / 2.97 | **muted** (G5) |
| 17 | `.sheetsmith-trigger:disabled` (3208) | a declared trigger nothing binds to | **not drawn**: the harness renders no trigger bar at all (`view/sheet-view.ts` draws it). Computed from the variables against the button's own `--background-primary` | trigger | 13px | 2.30 / 2.97 | **faint, reason stated** (G4) |
| 18 | `.sheetsmith-rich-text-input::placeholder` (4734) | `Write anything.` | 8 | box | 13px | 2.20 / 2.74 | **faint, reason stated** (G6) |
| 19 | `.sheetsmith-image-input::placeholder` (4976) | `![[Portrait.png]]` | 15 in `empty` | box | 13px | 2.20 / 2.74 | **faint, reason stated** (G6) |
| 20 | `.sheetsmith-passport-name-input::placeholder` (5147) | `Character name` | 8 in `empty` | card | **28px, 700** | 2.12 / 2.57 | **faint, reason stated** (G6) |
| 21 | `.sheetsmith-passport-input::placeholder` (5502) | the layout's field word, `Vice` | 23 | card | 13px | 2.12 / 2.57 | **faint, reason stated** (G6) |
| 22 | `… .sheetsmith-record-body-fields .sheetsmith-record-input:not(.sheetsmith-pool-max)::placeholder` (6553) | a body field's empty `—` | 44 | box | 13px | 2.20 / 2.74 | **faint, reason stated** (G6) |
| 23 | `.sheetsmith-record-body-input::placeholder` (6602) | `Write anything about this feature.` | 26 | box | 13px | 2.20 / 2.74 | **faint, reason stated** (G6) |

`.sheetsmith-card-abbreviation` also appears 219 times inside Record sets. Those already wear muted through two overrides (6216, and the strip at 7039), so measured they are not faint and they do not move.

**The Modifiers list's three disabled selects** (the backlog row's last sentence) do not resolve to `sheet.css`. They are `editor.css` 1099 and 1103 (`.sheetsmith-list-modifiers .sheetsmith-detail-field-disabled > …`), and they are out of scope. They already state their reason at the rule: disabled, with the box going away as a second channel. So removing the row loses nothing that is not already written down.

### G1. Read text: lift to muted (#1–#6)

**Ruled: lift to muted.**

A gloss, a secondary column, the pill's name, a spent value and a step name are all read back. None is a placeholder, a disabled control or a redundant mark. Muted gives 6.19 to 8.13:1 across the three surfaces. The rank below the value still holds, carried by size, tracking and case: the precedent is the Track name column (`track-row-legibility-and-clipped-fields.md`), and Record set's own field name and strip, which lifted the very same `.sheetsmith-card-abbreviation` to muted at 2.20:1. Pool's spent value goes from normal to muted, which is still a drain, and the live region still says it.

**Cost, seen in the crops.** On a card the abbreviation now matches the label's colour (`STRENGTH` / `STR`), so only size separates the two. `docs/UI.md` §5 changes from "sized down, tracked, faint" to "sized down, tracked, muted".

**Folds and dead rules.**
- #2 and #3 have byte-identical bodies (size, tracking, colour), so they become one selector list.
- Once the base rules are muted, these escalations and overrides restate the base exactly. The build deletes them, on `.sheetsmith-table-inert`'s lesson (a byte-identical override that paints nothing):
  - the `prefers-contrast: more` entries for `.sheetsmith-card-abbreviation`, `.sheetsmith-table-input-secondary` and `.sheetsmith-pool-temp-label` (in the blocks at 1109, 2195 and 3097);
  - `.sheetsmith-record-field .sheetsmith-card-abbreviation { color: muted }` (6216), with its comment reduced to the job argument;
  - the `color` line of the strip heading (7039).

Crops (Abilities, Features, Hit points at 0, Overfull (named)): `…/scratchpad/faint/crops/g1-{abilities,features,hit-points-spent,overfull-named}-{before,proposed}-{light,dark}.png`

### G2. The unresolved `?`: lift to muted (#7–#10)

**Ruled: lift to muted**, with the fold and deletions below.

**A second channel exists, checked in code, on all four.** The `?` replaces the digits, so the glyph is a shape channel. Each also drops to normal weight against a semibold or bold value. Each carries a `title` with the reason (`card-face.ts` `setDerived`, `table.ts` 2013 and 2840, `roster.ts` 1219 and 1290, `pool.ts` 1295, `track.ts` 2369). Track and Table also add a `.sheetsmith-sr-only` twin. So by the row's own rule the `?` *could* stay faint.

**The recommendation is to lift it anyway.** The second channel *is* the glyph, and a glyph at 2.12:1 is the modifier column's finding ("a channel is only a channel while the mark is visible", `sheet.css` 2114). Card's 28px `?` fails even the 3:1 large-text bar. Record set already ruled this way for the same class: its ceiling `?` is muted, "read back exactly as a number there is" (6371). Muted still reads as status, because it sits a rank under the value's normal and is set in a lighter weight.

**Fold.** #7, #8 and #9 have identical bodies (`color` plus `font-weight: var(--font-normal)`), so they become one selector list, **placed at Pool's rule (#9's old position), after `.sheetsmith-view .sheetsmith-table-value`**. A computed cell's or a total's `?` carries both classes, and `.sheetsmith-view .sheetsmith-table-value` sets `font-weight: var(--font-semibold)` at the same (0,2,0) specificity further down than Card's rule. A fold placed at Card's rule would therefore lose the normal weight to it in every table. Pool's position is the earliest one that follows it, and the `prefers-contrast` entries that the earliest-position rule protects are deleted here anyway. #10 keeps its own rule, since it is semibold and sized on purpose. **Dead rules deleted**: the `prefers-contrast` entries for `-derived-unresolved`, `-table-unresolved` and `-pool-max-unresolved`, and Record set's `…worked-out-layer.sheetsmith-pool-max-unresolved` override (6378), with its comment folded into a pointer.

The alternative was to **keep faint**, with a comment at the folded rule naming the glyph, the weight and the `title` as the channels. It was cheaper, and it left Card's `?` under even 3:1. Not taken.

Crops (empty state: Armour class, Skills, Hit points; default: Unmade): `…/crops/g2-{armour-class,skills,hit-points,unmade}-{before,proposed}-{light,dark}.png`. Fettle in `state=unmodified`: `…/crops/g2-fettle-unmodified-{before,after}-{light,dark}.png`. Fettle's `count: "mod.self"` resolves in `populated` and draws no `?` there; its `?` appears only in `state=empty` and `state=unmodified`.

### G3. Glyph controls (#11–#14)

**Ruled: all four lift to muted**: #11 and #12 as proposed, and #13 and #14 on option B.

**#11 and #12: lift to muted.** Track's **Add** is the only route to a row, and Passport's add is the only route to a second part. These are entry points, which is the modifier column's `plus` case exactly: "faint for the entry point of a column is exactly backwards". Table's and Record set's own add controls are already muted. Passport's part-remove only draws while its part has focus, so "reading past" cannot be its reason.

Lifting #11 makes Track's base list uniformly muted, so the override at 3641 (track-modifier, pool-modifier and note-mark to muted) becomes redundant and is deleted. Its comment's "a rank above the two pickers' faint glyphs" changes too; that comment already argues the two can never share a card. **#11 and #12 must move together.** `styles.test.ts`'s `SAME_ON_PURPOSE` exempts those two glyph resets as an identical pair, and "holds each exemption to a duplicate that still exists" fails if only one lifts.

**#13 and #14: the one real ruling, settled as B.** Both are a destructive control at rest. Measured states:

| State | Table remove (L / D) | Record remove (L / D) |
| --- | --- | --- |
| Rest, faint | 2.20 / 2.74 | 2.20 / 2.74 |
| Row hover, `--text-normal` on the hover tint (`#e9e9e9` / `#323232`) | 13.13 / 9.21 | 13.13 / 9.21 |
| Glyph hover, on the tint twice (`#dadada` / `#3f3f3f`) | 11.34 / 7.48 | 11.34 / 7.48 |
| Focus-visible, `--text-normal` | 15.24 / 11.24 | 15.24 / 11.24 |
| Rest, if lifted to muted | 6.41 / 7.50 | 6.41 / 7.50 |

Hover and focus already go to full contrast. These were forced through CDP `CSS.forcePseudoState` on the row (or summary) and the glyph together, which is what a real pointer matches. The armed state is `--text-error` and out of scope.

- **A. Keep faint**, with the reason at each rule: "reading past", plus arm-to-confirm making an accidental press recoverable. This keeps the ranking the modifier column's comment chose on purpose: an empty modifier cell reads louder than the delete beside it (`sheet.css` 2146). Its cost: **none of the row's three permitted reasons covers it**, so keeping it adds a fourth reason to the rule. And a phone has no hover, so 2.20:1 is the only number a touch reader ever gets.
- **B. Lift to muted. Ruled.** The glyph is then legible at rest on touch. Arm-to-confirm, not faintness, is what guards the press. Its cost: the delete column equals the modifier column's muted, so the prominence ranking that comment defends is gone, and that comment must be rewritten.

Crops (B, as ruled: Open hit dice, Multiclass, Inventory, Traits): `…/crops/g3-{open-hit-dice,multiclass,inventory,traits}-{before,proposed}-{light,dark}.png`

### G4. Disabled: keep faint, reason stated (#17)

**Ruled: keep faint, with the reason at the rule.**

`.sheetsmith-trigger:disabled` is an inactive control, which WCAG 1.4.3 exempts from contrast, and it carries its state in three other channels: `disabled` (announced), its `aria-label` and `title` "Nothing on this sheet resets on …", and no hover answer. Faint here is the app's own disabled reading. The comment at the rule gains that sentence. No crop, because the harness does not draw the trigger bar (see the computed-instances note above).

### G5. The empty pill: lift to muted (#15, #16)

**Ruled: lift to muted**, folded as below.

The pill at 0 shows a value, `0`, and not a placeholder. Draining it was the point ("the pill's presence carries information"). The recommendation keeps the drain and moves it one token up: normal to muted for the value, the same drain the spent value takes in G1, so a Pool says "at nothing" one way. The label is already muted after G1, so #16's label selector becomes redundant. #15 and #16 then fold into one rule, `.sheetsmith-pool-temp-empty, .sheetsmith-view .sheetsmith-pool-temp-empty .sheetsmith-pool-temp-input { color: muted }`. Faint on `--background-primary` is 2.30 / 2.97; muted is 6.69 / 8.13.

The alternative was to keep faint, with "an empty buffer, the shipped state of every pill" stated. That is not one of the row's three reasons. Not taken.

Crops (Hit points, staged with `state=empty&type=.sheetsmith-pool-temp-input|0`, which draws `TEMP 0`; `state=empty` alone draws `TEMP —` and never the lifted `0`): `…/crops/g5-hit-points-temp-zero-{before,after}-{light,dark}.png`

### G6. Placeholders: keep faint, fold, reason stated once (#18–#23)

**Ruled: keep faint, folded into one list with the reason stated once.**

These stay by the row's own rule. The reason to write at the rule is **the app's**: Obsidian's `--input-placeholder-color` is `var(--text-faint)` (`obsidian.generated.css` 381). So a sheet's placeholder matches every placeholder in the app, including a Card's empty em dash, which has no rule of its own and takes the app's. The six bodies are identical (`color: var(--text-faint); opacity: 1`), so they fold into one selector list at Rich text's rule (4733). Each component keeps only the part of its comment that says something else, such as why the placeholder shows through a transparent field. Passport's `prefers-contrast` escalation (5527) stays: it comes after the fold in source order and outranks nothing new. Passport's name placeholder stays under 3:1 at 28px bold (2.12 / 2.57), and that is said at the rule rather than hidden. No crop, because nothing moves.

## How the measurements were taken

Every ratio in this file came from one script, driven against the built harness. It is recorded here so a fresh clone can rebuild it. The script itself lived in a session scratchpad.

- **Page.** `npm run harness`, then `harness/index.html` opened in headless Chrome over the DevTools Protocol. This is `harness/inspect.mjs`'s technique: Node's own `fetch` and `WebSocket`, with no dependency. The viewport is `Emulation.setDeviceMetricsOverride` at **1400 × 8500**, device scale 2. That is tall enough that the whole sheet lays out flat. The palette is the calibrated one, `harness/obsidian.generated.css` from `npm run harness:calibrate`, not the `harness/theme.css` fallback.
- **States.** `?surface=sheet&theme=<light|dark>&state=<s>` for each of `populated`, `empty`, `unmodified`, `effective`, `broken`, `record-groups`, `text-groups`, `notes` and `pinned-add`: eighteen loads. Pool's spent value is staged on top with `&type=.sheetsmith-pool-current|0`. A part-remove glyph is staged by focusing its part.
- **Tokens.** `--text-faint`, `--text-muted` and `--text-normal` are each resolved by appending a probe element under `.sheetsmith-view` with `color: var(<token>)` and reading its computed `color`. That gives the values in the token line above.
- **Elements.** For each of the 23 rules, every element under `.sheetsmith-view` matching its selector that is visible and has its own text or an icon. Visible means at least 2px each way, not inside `.sheetsmith-sr-only` or `[hidden]`, and not `visibility: hidden` or `display: none`. For each placeholder rule, every matching empty field with a `placeholder`, read through `getComputedStyle(el, '::placeholder').color`.
- **Surface.** Walk up from the element through its ancestors, collecting each non-transparent computed `background-color`, and stop at the first fully opaque one. Then composite the collected layers bottom-up over that base, using `top × α + under × (1 − α)` per channel. The result is the colour the text actually sits on, translucent hover tints included.
- **Ratio.** WCAG 2 contrast. Relative luminance is `0.2126 R + 0.7152 G + 0.0722 B` over linearised channels (`c / 12.92` at or below 0.03928, otherwise `((c + 0.055) / 1.055)^2.4`). The ratio is `(L1 + 0.05) / (L2 + 0.05)`, rounded to two places. It is computed for faint, muted and normal against the same surface. The size and weight in the instance table are the element's computed `font-size` and `font-weight`.
- **Stray check.** Every visible element with its own text whose computed colour equals faint and which matches none of the 23 selectors. It found none, before and after.
- **States the harness cannot draw.** Hover and focus on the two remove glyphs were forced with `CSS.forcePseudoState` on the row (or summary) and the glyph together. The disabled trigger and the secondary link layer were computed from the variables, for the reasons in the note above the token line.

## Model question

None. Every change is a move between the app's own text tokens (`docs/UI.md` §1) inside `src/styles/sheet.css`, plus comments, one test and docs. Nothing is stored, published or evaluated differently, and no `SPEC` §13 question is involved.

## What it does

Every piece of text a reader reads back on a sheet clears 4.5:1 (or 3:1 where it is large) in both themes: glosses, secondary columns, the temp pill, a spent value, a step name, every unresolved `?`, and the add and remove glyphs. `--text-faint` remains only on placeholders and a disabled trigger, each with its reason at the rule, and a test holds it there.

## Smallest version

**Not taken: the owner ruled for the full design.** Recorded so the cut is visible. G1 alone, as six one-word colour changes with no folds and no dead-rule cleanup, plus the UI.md §5 word. It closes the read-text half of the row and gives up everything else. The `?` family, the glyph controls and the empty pill would stay at 2.12 to 2.97:1. The placeholders and the disabled trigger would carry no stated reason. The redundant `prefers-contrast` entries would linger as overrides that paint nothing. The row could not be removed, because it asks for all 23 to be ruled on. **The smallest version that removes the row** is the whole design with G2, G3 #13/#14 and G5 taken as their "keep faint, reason stated" alternatives. That is six lifts and seventeen comments.

## Design

The rulings above are the design. Mechanically:

1. Each lifted rule's `color` becomes `var(--text-muted)`, and its comment drops the word "faint" for the rank it now holds. Comments that argue from faint get rewritten to the new rank in the same commit: card abbreviation (626), table secondary and its link-layer (1326, 1768), the remove-glyph rule (1790, 1836), the modifier column's "louder than the delete" (2146, under ruling B), the bolt's "a rank above the pickers" (3638), track step (4386), and record remove (5984).
2. The folds named under G1, G2, G5 and G6. Each folded rule keeps the earliest source position among its members, so no `prefers-contrast` block ends up before its base. **The exception:** the earliest position does not apply where a member's base rule would lose a declaration there to an equal-specificity rule further down. The fold then moves to the earliest position after that rule. G2 is the one case: it sits at Pool's position, after `.sheetsmith-view .sheetsmith-table-value`.
3. The dead rules named under G1, G2 and G3 are deleted. These are overrides and escalations that, after the lift, restate their base.
4. **A guard in `src/styles.test.ts`.** Every rule in `sheet.css` declaring `color: var(--text-faint)` has a selector list whose every member ends in `::placeholder` or ends in `:disabled`. **Ruled: keep the guard.** Any exemption is listed in the test beside its reason, as `SAME_ON_PURPOSE` does. **With option B taken, the guard needs no exemption.** Once the plan is applied, the faint rules left are the disabled trigger (`.sheetsmith-trigger:disabled`, which ends in `:disabled`) and the one folded placeholder list. Every member of that list ends in `::placeholder`, including 6553's `…:not(.sheetsmith-pool-max)::placeholder`. The predicate covers all of them, so the exemption list starts empty, and any later entry has to arrive with its reason. The test drives its predicate over a planted failing rule, as the file's other scans do. This is the audit's own `[checked]`: without it, the next faint gloss lands silently.
5. `docs/UI.md`:
   - §5's secondary-text line becomes "sized down, tracked, muted".
   - §6's "Text a reader reads back…" bullet loses "Scoped to the name column on purpose…" and states the general rule: faint only for a placeholder or a disabled control, with the reason at the rule. It cites the three surfaces' numbers and this doc.
   - §9's "Secondary text" row drops "the same rank in `--text-muted`", which is now just the rank.

No interaction changes, no new vocabulary, no empty or error state beyond the ones the rules already style.

## Config fields

None.

## Data and file model

Nothing stored. CSS in `src/styles/sheet.css` (then `styles.css` by build), one test in `src/styles.test.ts`, and docs. Constraint 3 holds by construction, and Constraint 4 is not engaged.

## Acceptance criteria

- [x] `grep -c 'color: var(--text-faint)' src/styles/sheet.css` counts exactly two, the rules G4 and G6 keep: the folded placeholder list and the disabled trigger. Each has a comment at the rule naming its reason.
- [x] The `styles.test.ts` guard in Design 4 passes with an empty exemption list, and its planted case fails.
- [x] **No faint text outside a placeholder or a disabled control, checked from the repository.** The static half is the `styles.test.ts` guard (criterion 2) together with criterion 1's count. Every lifted rule declares `--text-muted`, so its rendered ratio is the muted figure in the surface table above for the surface its instance-table row names: 6.19 / 7.03 on a card, 6.41 / 7.50 on a table or box, 6.69 / 8.13 on the pill. The rendered check was run once at build time with the method under **How the measurements were taken**. It found no faint text outside placeholders in any of the nine states, in either theme, and every lifted instance at its muted figure. A reviewer who wants to repeat it rebuilds the script from that description.
- [x] Table and Record remove keep `--text-normal` on row hover, glyph hover and focus-visible (13.13 / 9.21, 11.34 / 7.48, 15.24 / 11.24), and the armed state is unchanged.
- [x] `styles.test.ts` "holds each exemption to a duplicate that still exists" and "has no two rules declaring one body" pass, so Track's and Passport's glyph resets still match each other.
- [x] None of the deleted `prefers-contrast` entries or overrides remains. Each lifted selector is muted in exactly one rule.
- [x] `docs/UI.md` §5, §6 and §9 read as in Design 5. The row is gone from `docs/BACKLOG.md` § UI, and the two bookkeeping rows below are added. `src/backlog.test.ts` passes.
- [x] `npm run lint`, `npm test`, `npm run build` and `npm run harness:shot` pass.
- [x] The land stop carries `sheet-light.png` and `sheet-dark.png`, plus a before/after crop of each lifted group in both themes, at the components the crops above use: G1 Abilities, Features, Hit points at 0, Overfull (named); G2 Armour class, Skills and Hit points in `state=empty`, Unmade, and Fettle in `state=unmodified`; G3 Open hit dice, Multiclass, Inventory, Traits; G5 Hit points in `state=empty&type=.sheetsmith-pool-temp-input|0`. A "before" crop is the same view with the release branch's `src/styles/sheet.css` injected into the page as a stylesheet, so the tree is untouched.

## Bookkeeping rows (added in the last code commit)

Under § Patterns, at the end of the table:

| Gap | Where | Fix | Waiting on |
| --- | --- | --- | --- |
| Nothing checks that a `forced-color-adjust: none` rule takes system colours only | `styles/sheet.css`, `src/styles.test.ts` | A `styles.test.ts` scan: every rule declaring `forced-color-adjust: none`, and every rule reaching inside its element, names only system colour keywords and no `var(--…)`. `docs/UI.md` §6 holds this as [judgement] today, and Track's lit glyph and `+N` count are its only uses. | a second use of the property |

Under § UI, at the end of the table:

| Gap | Where | Fix | Waiting on |
| --- | --- | --- | --- |
| A forced-colors shot with arguments is impossible, because a custom view passes no browser flags | `harness/shot.mjs` | A custom view (`node harness/shot.mjs <query>`) launches Chrome without `--force-high-contrast`, so only the default `sheet-forced-colors` view renders the mode, and a staged or scoped state in it cannot be photographed. Let a custom view ask for the flag. | the next forced-colors pass |

Both are under the 600-character ceiling, with four non-empty cells.

## Commit boundaries

1. `fix: Lift the sheet's read text off the faint grey`. G1: the six lifts, the #2/#3 fold, the dead `prefers-contrast` entries and Record set's two abbreviation overrides, and UI.md §5 and §9.
2. `fix: Lift an unresolved "?" to a colour it can be read in`. G2: the three-way fold, Track's rule, and the dead escalations plus Record set's ceiling override.
3. `fix: Lift the sheet's add and remove glyphs off the faint grey`. G3: #11 and #12 together, the redundant 3641 override deleted, and #13/#14 per the ruling, with the comments that argued the old rank.
4. `fix: Drain an empty temporary pill to muted`. G5 and its fold.
5. `refactor: Say why each remaining faint text stays faint`. G4's and G6's comments, the placeholder fold, the `styles.test.ts` guard, UI.md §6, the audit row out of BACKLOG, and the two bookkeeping rows in.
6. `docs: Text faint audit`. This file, `Status: shipped`.

`styles.css` is regenerated in each commit that touches `src/styles/`. The owner ruled that this six-commit plan stands.

## Deliberately not doing

- Every `--text-faint` in `src/styles/editor.css` and `shared.css`, including the Modifiers list's disabled selects (editor.css 1099–1103), which already state their reason.
- The settings row "The character folder's shipped state carries its only destination hint at 2.3:1" (`src/settings.ts`).
- The `--text-error` contrast row, and therefore the remove glyphs' armed state.
- Every forced-colors row, including "Unlit multi-mark dividers vanish in forced colors".
- Pointing placeholders at `--input-placeholder-color` rather than `--text-faint`. It would follow a theme that styles placeholders differently, but it is not one of `docs/UI.md` §1's listed text tokens, and this pass moves only between those.
- Folding the secondary-text clothes (`calc(--font-ui-smaller * 0.85)`, `0.06em`) shared by the card abbreviation, the table secondary, the track step and the track row name into one rule. That is the same style restated four times, but it is a size and tracking fold, not a colour one.
- `docs/UI.md` §9's modifier-column paragraph that still says the `plus` "is at `--text-faint`" (line 603). The paragraph after it already corrects it. It is pre-existing, and it is not a `sheet.css` colour.
