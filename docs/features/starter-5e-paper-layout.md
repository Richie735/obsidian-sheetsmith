# Starter 5e: the paper sheet's arrangement

Status: shipped

The 5e starter moves from the D&D Beyond-shaped arrangement it replicated
(`starter-layouts.md`, "The arrangement it carries") to the arrangement of the
2014 paper character sheet. Owner ruling, 2026-11-27: the starter should read
like the sheet most 5e players already know. The PF2e starter keeps its shape.

Prototyped in the test vault as `Paper 5e.sheetsmith` against a copy of a
filled-in character, then copied over `src/starters/5e.json`.

## What moves

Positions only, plus one nesting change. Every component keeps its `id`, `type`
and `label`, so a note written against the old starter reads the same values
under the same headings, and every formula and modifier reference resolves as
before.

- **Header, two rows.** The Passport (cols 1–6) beside Armor class, Initiative
  and Speed (row 1), with Hit points (cols 7–10) and Hit dice (cols 11–12) under
  them (row 2).
- **Abilities down the left edge.** The Card set takes `direction: "vertical"`
  (cols 1–2), with Senses, the passive scores, under it.
- **Saves and skills beside them** (cols 3–5), topped by Proficiency, as the
  paper sheet puts it above the saving throws.
- **The play tabs in the middle** (cols 6–10), unchanged apart from Combat.
- **A narrow right column** (cols 11–12): Inspiration, Death saves,
  Exhaustion, and Proficiencies and languages. Inspiration sat beside
  Proficiency over the saves at first, one column wide, and its label cut to
  "INSPI…" on the layout editor's narrower canvas.
- **Features, Description, Notes and Extras** stay a full-width tab set below.

**Nesting.** Armor class and Initiative leave the Combat tab for the header,
where the paper sheet keeps them. Combat closes up around what is left:
Defenses `1,1,5,2`, Conditions `1,3,5,3`, Attacks `1,6,5,5`.

## Spell slots set per character

The nine slot rows drop their `count` formulas for `maxSource: "character"`,
the shape the owner's own druid layout uses. Two reasons:

- A formula row that works out to 0 draws `?` by design (`track.ts`, the
  unresolved branch), so a level 4 character showed `?` on 3rd through 9th
  level. A character-owned row with no stored maximum draws nothing, and the
  card's add button brings the next level in when the character gains it.
- The formulas encoded the full-caster table only, so a half caster, a warlock
  or a multiclass character got wrong counts. A typed maximum is right for all
  of them.

The cost: slots no longer follow `level` by themselves. The player types each
level's maximum once and changes it on level-up. Each row shows that maximum
as a number beside its boxes. Notes store `L1:  2/ 4` (used, then maximum).

An installed layout is never rewritten (`starter-layouts-refresh.md`, out of
scope), so a vault that already holds `Starter 5e` keeps the old shape and its
characters keep reading it.

## Tests

- `PINNED` in `src/starters/index.test.ts` is regenerated from the built
  layout: 55 walked components, 17 at the top level (was 15).
- The three-unequal-columns case becomes "stacks its middle as the paper sheet
  does, in four columns": widths `[2, 3, 5, 2]` left to right.
- `HEADER_ROWS` becomes per sheet (5e 2, PF2e 3). With one shared 3, every 5e
  body component starting on row 3 was skipped as header, and the band checks
  passed without reading the abilities or the tab set.

## Sample values read by a formula

Found while taking the README's editor screenshot. A Passport field samples its
own name ("Level"), and the 5e starter's `level = passport.level` cannot compute
with a word, so with **Sample values** on, Proficiency, every save total, the
spell numbers and the Hit dice ceiling drew "?" or "/ Level".

`sample` now takes the set of dotted names the layout's formulas read
(`src/editor/formula-reads.ts`, walking the same sites `id-rename.ts` rewrites),
and a Passport field a formula reads samples a shared filler number instead of
its name. The argument is optional: the component picker's preview has no
layout to ask, and samples as before.
