# Record set stacking tiers

Status: built
Board card: `docs/BACKLOG.md` § UI, "A record's fields wrap inside their own grid track above 320px, so line two starts at the fields' column"

Standard route, with the spec step skipped because the precedents carry the design: the strip's tabulated thresholds (`docs/features/record-set-heading-strip.md`) and the text field's stacking thresholds. One backlog row. The ruling is `docs/UI.md` §9, "A record's summary line". The basis changed three times in this pass on the owner's calls, recorded below.

## Model question

None. The tier is drawn from the fields a layout already declares and changes no read, write, publication or file. It touches no §13 question and does not grow the §4.1 contract.

## What it does

A record's summary line stacks (name and delete on a row, the fields under the name) below the width its own declared fields fit at, not at the single 320px that was derived for a name, a labelled number, a ring and a glyph. Before this pass, every multi-field list wrapped its fields inside their own grid track at containers of 338, 346 and 361px, so the second line started at the fields' column, and names were cut to 71–82px.

## Smallest version

One estimate, one class, one table, one switch.

- **The estimate.** `src/components/record-line-fit.ts`, pure, works out the width the declared summary fields fit on one row at, with the name at six ems.
- **The class.** Every list wears `.sheetsmith-record-set-fit-N`, the fit rounded up to a step of 16px, clamped to 12–100. A list whose tier is under 20 (`FALLBACK_FIT_TIER`) also wears `-fits-narrow`.
- **The table.** One `@container (max-width: N × 16px)` entry per tier, 89 of them, each setting `--sheetsmith-record-stack: on` on the box. The five stacking rules are written once under `@container style(--sheetsmith-record-stack: on)`.
- **The switch.** Each strip entry turns the property off where it turns the strip on.

## Design

### The basis: the line's own fit, estimated from its fields (option C)

Three bases were measured. The owner first chose A, the strip's precedent, and then rejected it at the land stop for C:

- **A. Widest field by count.** Every count's threshold is sized so that N of the widest number field fit. **Rejected on evidence:** at width=1258 the release draws Traits (710.7px) and Spells (505px) on one line, and A stacked both. Traits stacked to 711.5 and Spells to 624 against a fit of 456. The pass must not stack a line that fits.
- **B. The sample lists' own fits.** It has no evidence beyond the samples, and a two-field list wider than the sample's still wraps.
- **C. The line's own fit, from its fields' kinds and words.** Chosen. Every list is stacked no more than 2em past its own measured fit.

### The fit is not a sum

The summary grid is `auto minmax(0, 13em) auto 1fr auto`: chevron, name, fields, slack, delete. The name's track and the fields' track grow together from their minimums. The fields reach their full width F only once they have grown by `F − m` from their widest single field m, and by then the name has grown by the same amount, held between its floor and its cap. So the line fits at:

`fit = 96 + F + clamp(F − m, 96, 169)` px at 16px

Here 96 is the padding, chevron, delete glyph, its margin and the gaps. F is the fields plus a 20px gap between each. 96 and 169 are the name's floor (six ems) and its cap (13em at its 13px).

**Superseded by `docs/features/record-summary-fields-first.md`**, which gives the plain line's fields a `max-content` track so they take their width before the name grows, and makes the fit the plain sum `192 + F`. The formula and the tables in this doc stay as the record of this pass.

It matches every harness list within a pixel, measured with the strip forced off, stacking forced off and every declared field drawn:

| List | Measured fit | Formula on measured widths |
| --- | --- | --- |
| Known spells | 308.5 | 308.9 |
| Traits | 509.5 | 509.8 |
| Spells | 455.5 | 455.7 |
| Recharging features (every declared field) | 541 | 541.3 |
| Rest features | 386.5 | 386.7 |
| Homebrew features, Tabbed features | 519 | 519.0 |
| Homebrew strip | 397.5 | 397.6 |
| Homebrew in the body | 282.5 | 282.4 |
| A line with no fields | 192 | 192 |

### Each field's width, measured and estimated

Measured in the harness at a 16px container, every field at its full width:

| Kind | Measured | Estimate |
| --- | --- | --- |
| Toggle, level ring, modifier | 20.8 | 20.8 |
| Computed value | 8.1 (`2`), 14.2 (`-2`) | 14.2: a sign and a digit |
| Number, no ceiling | 76.1 with `Level` (28.6) | name + 47.5 |
| Number, declared ceiling | 92.1 `Level / 9`, 90.4 `Uses / 3` | name + 47.5 + 8 + 8.125 a digit |
| Number, typed ceiling | 100.7 with `Uses` (26.9) | name + 47.5 + 26.3 |
| Text | 146.3 with `Class` (29.7); 72.6 at its 5ch floor | name + 116.6; floor name + 42.9 |
| Level as a dropdown | 73 (`Abjuration`), 74 (`Short rest` beside `Always-on`) | 10.9 + 6.32 × longest option |
| A field's name | `Uses` 26.9, `Level` 28.6, `Class` 29.7 | 6.73 × characters |

The per-character widths are the largest any sample needed. A name is 6.73 because `Uses` is 6.73 a character. A dropdown is 6.32 because the rest dropdown's 74px has to hold. So no sample is estimated short. The width of a text field counts its 14ch. Its 5ch floor is what m sees, because a text input can shrink.

**Why an estimate is acceptable here, when the table-name pass rejected one.** That pass needed an exact floor: a column narrower than its longest name clips it, so a `size` estimate landing short was the defect itself. Here the estimate errs toward stacking. A cautious width per character costs a line that could have stayed on one row stacking a little sooner, and the 2em bound holds that cost. **The known residue:** a name of unusually wide letters (`WWWW` is 10.6px a character, against the 6.73 assumed) is estimated short, and its line can still wrap.

**Every declared summary field counts, hidden ones included.** A condition hides a field per record, but a record can draw every declared field, so the declared set is the worst case. Recharging features' records each hide one, and its tier is sized for all four.

### The tier table

Each tier N is the estimated fit rounded up to a step of 16px, and is stacked up to N × 16px. **The owner dropped the extra step at review:** the first build stacked to N + 1, and the cautious estimate is headroom enough, so the step was stacking lines that fit, 36px past their fit for the `pinned-add` lists. There is one class per step, from 12 (a line with no fields, 192px) to 100 (1600px). That is 89 one-declaration entries, and `styles.test.ts` holds each to its rule. A wider line takes tier 100, which is a residue: a list holds one text field at most, and eight counters with four-letter names come to 1211px.

### In px, because the line's widths are

The first build tabulated in `em`, on the strip's precedent, and it was wrong for the line. **Measured:** Traits fits at 509.5px at the harness's default, at `text=20` and at `text=24`, because every width on the line is a fixed-px token. `.sheetsmith-record` sets `--font-ui-small`, the name's cap is 13em of that, the gaps are `--size-*`, and a field's name is `--font-ui-smaller`. The `em` table stacked it to 660 and 792, and at width=1258 with `text=24` Traits stacked again, which is the regression the owner rejected.

What the sheet's `em` follows was checked in Obsidian 1.14.4's own `app.css`. `body` is `font-size: var(--font-ui-medium)`, 15px, and no rule sets a size on a view's content, so the sheet's `em` is 15px in the app whatever the vault's text size. The text size reaches `--font-text-size` and `--font-preferred-size`, which the markdown views read. Neither the line nor the sheet's `em` follows it. A zoom scales CSS px on both sides alike. So the table is in px. A theme that changes `--font-ui-small` moves the line and not the table, which is the residue. That the strip's `em` thresholds and the harness's `text=` stand on the same mismatch is recorded in `docs/BACKLOG.md` § UI. Check 7 now sweeps every state at `text=20` and `text=24` too, so a mismatch here fails.

### Where each list stacks

Measured by `harness/measure-groups.mjs` check 7 (half pixels, 150 to 1300px). The rows are identical at the default type size, at `text=20` and at `text=24`, except that a strip's `em` threshold moves with the type: 424 becomes 530 and 636.

| State | List | Estimated fit | Tier | Stacked to | Measured fit | Past its fit | Strip from |
| --- | --- | --- | --- | --- | --- | --- | --- |
| populated | Known spells | 313.9 | 20 | 320 | 308.5 | 11.5 | 424 |
| populated | Traits | 509.9 | 32 | 512 | 509.5 | 2.5 | 712 |
| populated | Spells | 463.1 | 29 | 464 | 455.5 | 8.5 | — |
| populated | Recharging features (all three) | 541.4 | 34 | 544 | 541 | 3 | 616 (headed two) |
| populated | Rest features | 386.8 | 25 | 400 | 386.5 | 13.5 | 424 |
| text-groups | Homebrew features, Tabbed features | 525.8 | 33 | 528 | 519 | 9 | — |
| text-groups | Homebrew strip | 401.6 | 26 | 416 | 397.5 | 18.5 | 424 |
| text-groups | Homebrew in the body | 282.5 | 18 | 288 | 282.5 | 5.5 | — |
| record-groups | Class features, Tabbed features | 282.5 | 18 | 288 | 282.5 | 5.5 | — |
| record-groups | Grouped spells | 313.9 | 20 | 320 | 308.5 | 11.5 | 424 |
| record-groups | Spells by name | 287.9 | 18 | 288 | 287.5 | 0.5 | — |
| record-groups | Group by nothing, Group by a toggle | 313.9 | 20 | 320 | 308.5 | 11.5 | — |
| pinned-add | Few records, tall; Many records, short | 289.3 | 19 | 304 | 284 | 20 | — |

**The worst real overshoot is 20px**, on the two `pinned-add` lists, against the owner's bound of 2em (32px, the line's own 16px em). Every unstacked line holds its fields on one line with its name at 96px or more, and no list is stacked under its strip.

### A headed list draws its plain line below its strip

The first build stacked a headed list right up to its strip. Now a headed list is stacked below its own fit and draws its plain line from there to its strip: Known spells plain from 320.5 to 423.5, Rest features from 400.5 to 423.5, and Traits from 512.5 to 711.5. The strip's entries set `--sheetsmith-record-stack: off`, so where a list's tier is past its strip, the strip wins: Homebrew strip's 416 is under its 424, and is plain from 416.5 to 423.5. A list is plain, stacked or under its strip, one at a time. That depends on source order, since `@container` adds no specificity, and the strip's entries come after the table, which `styles.test.ts` holds.

### The text field

The 480px and 420px text entries are deleted. Measured with the fit as the basis, both over-stacked:

- A list whose one field is text fits at 338px, and 480 stacked it to 480.
- Homebrew strip's plain line fits at 397.5px, and 420 stacked it to 420.

The fit tier sizes a text field as any other: its name and its 14ch. The `-text` and `-text-headed` classes are gone with them. The first build's text-tier table is folded in, as is its evidence that the 480.5–518.5px wrap of an unheaded text-and-counter list predated this pass. On a `git worktree` of `release/0.6.0` those lists wrapped from 480.5 to 518.5px exactly as after; now they are stacked to 528 and plain from 528.5.

### The fallback and engines without style queries

The 320px block keeps its own copy of the five rules, as the fallback for an engine with no style queries. `styles.test.ts` holds it equal to the style-query block, allows no third copy, and holds its query to `FALLBACK_FIT_TIER × 16px` (tier 20), in the table's own unit. A tier of 19 or under stacks to 304px or less, so the fallback would stack that list past its own threshold. Such a list wears `-fits-narrow`, and every fallback rule is scoped to `.sheetsmith-record-set:not(.sheetsmith-record-set-fits-narrow)`. Tier 20 stacks to exactly 320px and takes the fallback. An engine with no style queries stacks the rest below 320px and draws every line plain above it, which is what it drew before this pass.

The headed one-text-field case from the review is unchanged by any of this. Its strip comes in at 328px, under its fit of 338, and its tier (22, stacked to 352) is cut off by the strip, so it is stacked up to 327.5 and under its strip from 328.

### What still wraps

**A stacked line can wrap its fields under the name** when the list is narrower than its fields plus about 40px. Measured:

| List | Wraps when stacked, below |
| --- | --- |
| Known spells, Grouped spells, Group by nothing, Group by a toggle | 163.5 |
| Spells by name | 142.5 |
| Traits | 304 |
| Spells | 272.5 |
| Recharging features | 282 |
| Recharging features, broken | 323 |
| Rest features | 241 |
| Homebrew features, Tabbed features | 303.5 |
| Homebrew strip | 233.5 |
| Rituals, Homebrew in the body, Class features | never |

Harness widths 620, 520 and 910 put lists inside these ranges: Known spells at 91, 157 and 139px, Spells at 240 and 198, and the unheaded Recharging at 190 and 157. It is deferred to `docs/BACKLOG.md` § UI. Its alternative, a third layout such as one field per row, waits on an owner decision.

**The estimate can be outrun** by a name or option of unusually wide letters, as above.

## Config fields

None.

## Data and file model

Nothing stored and nothing written. Round trip and existing notes are untouched (Constraints 3 and 4 are not reached).

## Acceptance criteria

- [ ] `record-line-fit.test.ts`: every sample field's estimated width is at or above its measured width.
- [ ] `record-line-fit.test.ts`: every list in the `populated`, `text-groups`, `record-groups` and `pinned-add` states has an estimated fit at or above its measured fit, and its tier stacks it no more than 2em (32px) past that fit, or to its strip if that comes first.
- [ ] `record-line-fit.test.ts`: the fit formula reproduces Traits' measured 509.5px from its drawn widths within 1px, and a line with no fields is 192px.
- [ ] `record-line-fit.test.ts`: the tier is the fit rounded up to a step of 16px, clamped to `MIN_FIT_TIER` and `MAX_FIT_TIER`.
- [ ] `record-set.test.ts`: an unheaded list, a headed list and a headed list whose strip is withheld each wear the tier their fields give (`-fit-32` for Traits' line).
- [ ] `record-set.test.ts`: a body-placed field is not sized, a field a condition hides is, and a renamed field re-tiers to its own tier (`fit-41`).
- [ ] `record-set.test.ts`: a level drawn as a dropdown is sized by its longest option (Spells' line, `fit-29`, against `fit-24` as a ring), and a declared ceiling by its digits (`Level / 9` is `fit-19` with `-fits-narrow`, `Level / 100` is `fit-20` without).
- [ ] `record-set.test.ts`: a line that fits by 320px wears `-fits-narrow`, and no `-text` class is stamped.
- [ ] `styles.test.ts`: the table runs once each from `MIN_FIT_TIER` to `MAX_FIT_TIER`, tier N is stacked up to N × 16px, and the fallback's query is `FALLBACK_FIT_TIER × 16px`.
- [ ] `styles.test.ts`: the widths `record-line-fit.ts` copies are held to the rules they were measured off: `GAP_PX` to `--size-4-5`, `NAME_CAP_PX` to the name track's 13em at `--font-ui-small`, and `TEXT_PX` and `TEXT_MIN_PX` to the text input's 14ch and 5ch.
- [ ] `styles.test.ts`: the stacked block is the fallback's five rules exactly, every fallback rule carries the `-fits-narrow` opt-out, and there is no third copy.
- [ ] `styles.test.ts`: every strip entry turns the stack off and follows every tier entry, and no stacking rule is keyed on a text field.
- [ ] `node harness/measure-groups.mjs`, `… text-groups` and `… pinned-add` pass checks 7a, 7b and 7c. Each sweeps 150 to 1300px in half pixels over every list in `populated` and in its own state, at the default type size, `text=20` and `text=24`:
  - (a) no unstacked line wraps or cuts its name under 96px;
  - (b) no list is stacked more than 2em (32px) past its measured plain fit;
  - (c) no list is stacked under its strip.
- [ ] Harness at width=1258: Traits (710.7px) draws its plain line, as on release, at the default type size and at `text=24`.
- [ ] The Spells crossing (450, 462 and 485px): it is stacked at 450 and 462 (its tier stacks it to 464), and plain at 485.
- [ ] Before and after shots of every frame listed under "Shots" go to the land stop.
- [ ] `docs/UI.md` §9 describes the fit tier, the BACKLOG row for this pass is gone, the stacked-line wrap row is added, and the `sheet.css` comments describe the fit table.
- [ ] `npm test`, `npm run lint`, `npm run build` pass, and `styles.css` is regenerated.

### Shots

Dark theme, explicit frames. `before-` is release (the `text-groups` and Spells-crossing ones are shot from a `release/0.6.0` worktree), `a-` is option A's build, and `after-` is this one.

- Width 380, 395 and 620: each full, plus traits-spells, recharging and known-spells.
- Traits-spells at 910, 1258, 1262 and 1497.
- `text-groups` at 785, 845, 1550 and 1670.
- The Spells crossing at 1126, 1154 and 1210, which puts Spells at 450, 462 and 485px.
- Traits-spells at width 1258 with `text=24`.

## Commit boundaries

1. `fix: Stack a record's line below the width its fields fit at`. Contains:
   - `record-line-fit.ts` and its tests;
   - the stamp in `record-set.ts` and its tests;
   - its lines in `eslint.config.mts` and `isolation.test.ts`;
   - the fit table, the fallback's opt-out and the strip entries' off switch in `src/styles/sheet.css`;
   - the regenerated `styles.css`;
   - the `styles.test.ts` block;
   - the updated snapshots;
   - `measure-groups.mjs` check 7.
2. `docs: Settle the record set's stacking tiers`. Contains `docs/UI.md` §9, `docs/SPEC.md`'s two Record set lines, `docs/PATTERNS.md` §2 (the atomicity sentence, and the sibling list left to `eslint.config.mts`), the `docs/BACKLOG.md` § UI rows, and this spec.

## Deliberately not doing

- The stacked line's own wrap in a narrow list. Deferred, with its measured ranges, to `docs/BACKLOG.md` § UI.
- The summary grid's sharing of free space between the name and the fields. Deferred to its own row. It is also why the formula has a clamp. Since done: `docs/features/record-summary-fields-first.md`.
- The strip thresholds, which are unchanged.
- Measuring a field's real width at render time. The estimate is the owner's choice (a), and a character count is what it uses.
- Every other § UI row, and every editor-pane row.
