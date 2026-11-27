# Starter layouts follow-up

Status: shipped
Board card: Close the open items the starter-layouts refresh recorded against the
5e and PF2e starters (`src/starters/5e.json`, `pf2e.json`): conditions reach no
PF2e strike, 5e's protective items contest a bonus type 5e does not have, the
PF2e Conditions table scrolls sideways on a phone, the 5e spellbook's last group
sits under the scroll fade, and the slots and passport readings reported at the
land stop.

## Model question

**One §13 question is touched, and it is answered by an arrangement rather than
by the engine:** "What a group target is", ruling 3, refuses derived membership
and defers a condition on a member's own data. The PF2e case that ruling leaves
open is a strike: whether Clumsy reaches it depends on the weapon, which is the
row's own data. Three ways to answer it were weighed, and the owner chose B.

- **A. One table with a per-row Attribute column.** Rejected. An open row joins
  only its table's default groups (ruling 4), so no row could be in `dex` without
  every row being in it, and Clumsy would miss every strike or hit every strike.
- **B. Two tables, one per attribute (chosen).** **Strikes** reads Strength and
  joins `["check", "str"]`, and **Dexterity strikes** reads Dexterity and joins
  `["check", "dex"]`. Membership is fixed per table, which is exactly what ruling
  3 allows: "DX-based" written as a fixed group on the member. The player puts a
  strike in the table its attribute names. No engine change.
- **C. A row choosing its own groups from its own data.** Refused, and stays
  refused: it is the derived membership ruling 3 refuses, and it needs a member
  condition whose clause is reserved but not built.

**B needs nothing the engine lacks, verified in code rather than assumed.** An
open row's slot and groups are already there:

- `src/components/table.ts:679-681`, `viewGroups`: a row the character owns takes
  `ownGroups(config.groups)`, the table's default.
- `src/components/table.ts:651-671`, `publishedName`: a row with no key, in some
  group, on a `publish` column, reads `mod.self` from `memberSlot(config.id,
  view.position)`, the position-keyed slot (`table-row-modifier-target.md` D5).
- `src/components/table.ts:1367-1378`: `scopeValues` lists that row as an
  `unnamed` member with its groups, so `groupIndex`
  (`src/formula/modifier-targets.ts:508`) puts it in each group.
- The working precedent is PF2e's own **Lore** table: open rows, `groups:
  ["check"]`, a published computed Total reading `mod.self`. The test
  "moves every check and DC by Frightened 2" already moves a Lore row from +9 to
  +7 through that path.

A scratchpad prototype of the layout below confirms it: with Frightened 2,
Fatigued and Clumsy 1 active, a trained Shortbow in Dexterity strikes draws +7
(2 + 7, the worse of the two Status penalties) and an untrained Greatsword in
Strikes draws +2 (4 − 2).

**What the split publishes:** nothing by name. Both tables are open and declare
no rows, so each row is an unnamed member reached by position (ruling 4). No
formula elsewhere reads a strike.

**The new `str` group needs a declared member,** because `groupIndex` counts
`unnamed` and `named` members and never `openGroups`. A cold sheet's Strikes
table has no rows, so without one, "gives every modifier group a member, and
joins no group it does not declare" fails for `str`. The **Athletics** row joins
`str` by its own `groups`, which is also the system's arithmetic: Athletics is the
Strength skill, and Enfeebled reaches it. That makes `str` and `dex` symmetric
on both tables and skills.

**This reverses `starter-layouts.md` ruling 3, "Strikes are stored, not
computed"**, on the owner's instruction for this run. The 5e attacks table is
not touched: 5e has no conditions that move an attack by a number.

### The §13 entry, for `/land-it` to write

Appended to the resolved list in `docs/SPEC.md` §13, beside "What a group target
is":

> - **How a condition reaches a value whose attribute is the row's own data.**
>   A PF2e strike is Strength-based or Dexterity-based by the weapon, so Clumsy
>   reaches some strikes and not others. "What a group target is" ruling 3
>   refuses derived membership and defers a condition on the member's own data,
>   and ruling 4 gives a row the character adds only its table's default groups.
>   So one open table with an Attribute column can put every strike in `dex` or
>   none.
>
> Resolved: **one table per attribute, so membership stays fixed on the member**
> (`docs/features/starter-layouts-follow-up.md`). The PF2e starter's Strikes
> table reads Strength and joins `check` and `str`, and a second open table,
> Dexterity strikes, reads Dexterity and joins `check` and `dex`. The player
> files a strike under its attribute. A row choosing its own groups from its own
> data stays refused under ruling 3, and nothing here builds the reserved member
> condition. One table with a per-row Attribute column was rejected, because
> Clumsy would then miss every strike. The cost is one more table on the Combat
> tab, and that moving a strike between attributes is deleting a row in one table
> and adding it in the other.

## What it does

PF2e strikes compute their attack from attribute, proficiency rank and item
bonus, and Frightened, Clumsy and a player's own Strength penalty reach the
strikes their rules name. Two different protective items on the 5e sheet both
apply, as 5e says. The PF2e Conditions table fits a phone, and the 5e spellbook
shows all three of its groups at desktop width.

## Smallest version

Case 1 alone: the strikes split, Attack computed, `str`, Athletics in `str`, the
library comment, and the tests that compute the strikes, including the
hard-constraint-4 test. That is commit 1. It leaves the 5e bonus types, the
Conditions fit and the spellbook height as they are, and none of those changes a
PF2e number.

## Design

### Case 1: PF2e strikes take conditions (do first)

**Two tables in the Combat tab, identical apart from their attribute and their
groups.**

| | Strikes | Dexterity strikes |
| --- | --- | --- |
| `id` | `strikes` (kept) | `dex_strikes` (new) |
| `label` | `Strikes` (kept, so a note's `## Strikes` still draws) | `Dexterity strikes` |
| `rowHeader` | `Strike` | `Strike` |
| `openRows` | `true` | `true` |
| `namePosition` | `1` (new) | `1` |
| `groups` | `["check", "str"]` | `["check", "dex"]` |
| Attack formula | `attributes.STR + prof(Rank) + Item + mod.self` | `attributes.DEX + prof(Rank) + Item + mod.self` |

**Columns, in draw order:**

1. **Rank**: `level`, levels `Untrained`, `Trained:T`, `Expert:E`,
   `Master:M`, `Legendary:L`, `hideHeading: true`. The same column Saves, Skills,
   Lore and Proficiencies carry, so the ring reads the same everywhere. With
   `namePosition: 1` it draws before the name, as theirs does.
2. **Strike**: the name column.
3. **Attack**: `computed`, the formula above, `signed: true`, `publish: true`.
   `publish` is what gives an open row a slot (D4, D5). This is the number a
   player rolls, so it comes straight after the name.
4. **Item**: `number`, `min: 0`, `max: 3`, the weapon's potency. Blank reads as 0,
   which is what an unruned weapon adds.
5. **Damage**: text, as today.
6. **Traits**: text, **`secondary: true`** (new). Traits qualify the row, which is
   the gloss `secondary` is for (SPEC §4.2). It also draws 22px narrower,
   measured.
7. **Notes**: text, `secondary: true`, as today.

**Fit, measured on a prototype, and why it is not solved by `secondary`.**
`secondary` is confined to `text` columns and is a type style, a size down and
muted (`table.ts:2958`, SPEC §4.2). It is not a narrow-width rule and hides
nothing. **Owner's ruling: Damage stays primary, because it is rolled on every
strike; Traits and Notes are secondary; nothing is dropped.** Measured with
exactly that arrangement, at 1300px and 400px, on both tables: Rank 37, Strike
102, Attack 68, Item 68, Damage 120, Traits 98, Notes 98 and the remove column
37, which is **627px of content in a 508px box at 1300px and in a 334px box at
400px.** So both tables scroll sideways inside their own box at both widths,
and the owner accepts that. The shipped Strikes table already scrolls (545px in
508px), as the PF2e Inventory does (604px). That is the Table's designed answer
for a wide table (`.sheetsmith-table-wrapper`, `sheet.css`, "A wide table
scrolls inside its own box"). The arrangement makes sure the scroll hides
nothing a player rolls: ring, name and Attack are the first three columns and
take the first 207px, inside the 334px a phone shows.

**Grid: the Combat tab keeps its 12 rows.** Combat notes gives up two rows:

| Component | Was | Becomes |
| --- | --- | --- |
| `initiative` | `1,1,2,1` | unchanged |
| `ac` | `3,1,3,1` | unchanged |
| `conditions` | `1,2,5,3` | unchanged |
| `strikes` | `1,5,5,4` | `1,5,5,3` |
| `dex_strikes` | none | `1,8,5,3` |
| `combat_notes` | `1,9,5,4` | `1,11,5,2` |

A Table's height is a floor, so a third or fourth strike grows its box rather
than scrolling. Combat notes stays the tab's foot, so "ends every band in a
stretcher" holds. The tab set's own placement (`8,4,5,12`) does not move.

**`str` joins `modifierGroups`**, after `dex`: `{ "name": "str", "label":
"Strength-based" }`. **Athletics** gains `groups: ["str"]` beside the table's
`check`. **No Enfeebled definition is added**: the six definition names stay
pinned. `str` is there so that an Enfeebled a player types or defines lands on
Athletics and Strikes and not on a Dexterity strike.

**What each condition now reaches on a strike:**

| | Strikes | Dexterity strikes |
| --- | --- | --- |
| Frightened (`@check, @dc`) | yes | yes |
| Fatigued (`ac`, `@save`) | no | no |
| Clumsy (`@dex`) | no | yes |
| A player's `@str` penalty | yes | no |

Frightened and Clumsy on one Dexterity strike are both Status penalties, so the
worse one applies, as on Reflex today.

**The library comment is rewritten**, last sentence only, because it now says
something untrue. The lines become:

```
# The conditions aim at modifier groups: Frightened at Checks and DCs, Fatigued
# at armor class and Saving throws, Clumsy at Dexterity-based. A value joins a
# group by listing it. A valued condition reads its own Value column, so
# Frightened 2 is -2. Strikes read Strength and join Strength-based; Dexterity
# strikes read Dexterity and join Dexterity-based. Both are checks, and Item is
# the weapon's potency.
```

They describe arithmetic and membership, never rules text. The function count
is not pinned on PF2e.

**What a note keeps.** An installed starter is not touched, so this reaches new
installs only (SPEC §3.2). A note that meets the new starter, because its reader
reinstalled:

- **Its typed `Attack` cells stay in the note and are no longer drawn.** `Attack`
  is now `computed`, so `storedColumns` drops it (`table.ts:380-384`), `headers`
  does not name it, `rowScope` does not read it (`table.ts:540-543`), and
  `write`'s `cellsFor` maps only stored keys (`table.ts:1557-1574`). So no
  delta can write into it. `writeTable` rewrites only the cells it is handed
  (`src/parse/table.ts:329`). **The hard-constraint-4 test passes as is, with no
  component change.** That was checked on the prototype config: after a Rank edit
  and an added row, the Longsword line's `| 11 |` is still there.
- **Its first edit appends `Rank` and `Item` to the note's table header**, and to
  any row it touches. That is `writeTable`'s documented append ("appends a column
  the note is missing, header and rows alike", `src/parse/table.test.ts:183`), the
  same as for any column a layout adds.
- **Every old strike draws its attribute alone** (Rank blank is untrained, Item
  blank is 0) until the player sets Rank and Item. A finesse or ranged strike
  stays in Strikes, Strength-based, until the player adds it to Dexterity
  strikes and deletes the old row. Nothing moves a row for them, because which
  attribute a weapon uses is the character's fact.
- `## Dexterity strikes` is a new section, written on its first edit.

### Case 2: 5e protective items stack

**5e has no bonus types.** Different effects stack, and only effects with the
same name do not. So the 5e starter declares none:

- `modifierTypes` is removed from `5e.json`.
- `bonusType` is removed from Shield of Faith (`Spell`), Studded leather
  (`Armour`), both Ring of Protection changes (`Item`) and Alert
  (`Class feature`).
- **Bark Skin keeps `operator: "upgrade"`**. It needs no type: an at least
  floors the number after the value phase whatever the additions' types are
  (SPEC §5).

Every amount is now untyped, and an untyped amount stacks in full (SPEC §5,
"Untyped modifiers all stack"). So Ring of Protection and a Cloak of Protection
the player types onto an item row both apply.

**What the engine cannot express, recorded for SPEC rather than worked around:**
the same-name rule. Two rows enrolling Shield of Faith both apply, giving +4
where 5e gives +2, and so do two Rings of Protection. A type per definition name
was considered: each definition would carry its own name as its type, so two of
the same name contest and two different ones stack. It was not adopted, for
three reasons. The type list would be a copy of the definition list, kept in
step by hand. A player's own definition with no type of its own would stack
silently. And the types are the vocabulary the modifier form offers a player,
where five effect names read as nonsense. The cost of leaving it out falls only
on a player who enrols the same named effect twice, which the sheet then shows
in the breakdown as two lines.

The sentence for SPEC §4.3 or §5, under the 5e starter, for `/land-it`: "The 5e
starter declares no bonus types, because 5e has none: different effects stack.
Its one stacking rule, that two effects of the same name do not, is not
expressible, so a definition enrolled twice applies twice."

**This closes `docs/BACKLOG.md` row "The 5e starter's `Armour` bonus type keeps
its British spelling"**, because the type is gone. `/land-it` removes the row.

**What a note keeps.** The definitions store nothing in a note. A player's typed
cell with an `as Item` clause, on a note meeting the new starter, names a type
the layout no longer declares: it is drawn, not corrected, applies, contests as
its own kind, and the editor reports it (SPEC §5, "A note may name a type").
Nothing is rewritten.

### Case 3: PF2e Conditions fits a phone

**`secondary` cannot do this, and is not allowed here.** It is confined to
`text`, and Modifiers is a `modifier` column (SPEC §4.2; `table.ts:2958`). The
lever is **`hideHeading: true` on Modifiers**, which is the Conditions palette
entry's own configuration (`table.ts:1161-1171`, whose comment measured the
same thing: a 90px word over a 37px glyph). The glyph names itself.

Measured on the prototype at 400px: 361px of content in a 334px box before, and
334px in 334px after. At 1300px it was already 508 in 508. `Value` and `Active`
keep their headings: Active is the word a definition's `when` names.

**What a note keeps:** everything. A heading is display only.

### Case 4: 5e spellbook shows its last group at desktop width

**Reclaim the Prepared card's row.** Prepared moves up beside Spell save DC and
Spell attack, a one-column card, and everything under it rises one row. The
spellbook takes that row.

| Component | Was | Becomes |
| --- | --- | --- |
| `spell_dc` | `1,1,2,1` | unchanged |
| `spell_attack` | `3,1,3,1` | `3,1,2,1` |
| `prepared` | `1,2,5,1` | `5,1,1,1` |
| `slots` | `1,3,5,2` | `1,2,5,2` |
| `spellbook` | `1,5,5,5` | `1,4,5,6` |
| `spell_notes` | `1,10,5,1` | unchanged |

The tab keeps its 10 rows and the three columns still end on one grid row.
Measured on the prototype at 1300px with the render fixture's eight spells in
three groups: the list's box grows from 329px to 405px, whole spell lines go
from 6 to 7, and whole group headers from 2 to 3, so `Level 3` is clear of the
fade. Prepared hides its note (`hideNote: true`, replacing its `of your limit`
placeholder; the owner's ruling D2), so at one column wide it draws its label
and its value, and the three cards read as one row on one baseline. A note a
player already typed stays in the note, undrawn.

**Why not leave the scroll.** The scroll is still the answer for a long
spellbook, and it stays. What it was not the answer for is a list whose last
header sat under the fade with eight spells in it, while a full-width row above
held one number.

**What a note keeps:** everything. Positions are layout-only.

### Open limits, deferred to runs of their own (owner's ruling)

None is fixed here, and none is fixable from a starter.

- **Spell slots draw `?` from 4th level up at level 5 on both starters. Deferred
  as its own run, not left as designed.** A calculated count of 0 means "no
  slots at this level", and `?` reads as "unresolved", so a level 5 caster shows
  six broken rows. The starters' counts are right and resolve to 0.
  `segmentCount` refuses anything below one (`src/components/track.ts:451`, `if
  (segments < 1) return null;`), and `render` draws a declared row with a null
  count as `?` (`src/components/track.ts:2487-2523`). The `?` rule in
  `modifier-granted-track-segments.md` ("Count resolved below one: `?`") was
  written for a granted count. Whether it governs a layout's own calculated
  count is that run's question. No starter-side spelling avoids it: `max(1, …)`
  would draw a slot that does not exist.
- **The PF2e passport draws "Human" as "Humar". Deferred as a Passport component
  bug.** The starter's field list and placement play no part: it clips at 1300px
  with room to spare. `src/components/passport.ts:763` sizes a scalar field by
  `input.size = Math.max(MIN_FIELD_WIDTH, (stored === '' ? name : stored).length)`,
  and a list part is sized the same way at `passport.ts:867`. `size` counts
  average character widths, so a value with a wide letter (`m`) overflows its own
  box. **This is the same cause as the WebKit chip-width gap recorded in
  `docs/features/select-long-value.md`'s not-doing list** ("Passport chips sized
  by `input.size`", at `passport.ts` 763, 867 and 1020). One fix in the Passport
  closes both.
- **A strike's Rank can disagree with the weapon proficiencies. Recorded as a
  limit, not fixed.** A strike's Rank is its own cell, separate from the
  Proficiencies table's Simple weapons, Martial weapons and Advanced weapons rows,
  so the two can say different things: the Amiri render has a Longsword at
  Trained while Martial weapons reads untrained. A row cannot read which category
  it belongs to, for the same reason ruling 3 refuses a row choosing its own
  groups: it would be membership derived from the row's own data.

## Config fields

No config field is added or changed. The keys each starter newly sets, or stops
setting, are existing ones:

| Key | Where | Value |
| --- | --- | --- |
| `modifierGroups` | PF2e | gains `{ name: "str", label: "Strength-based" }` |
| `groups` | PF2e `strikes`; `dex_strikes`; Athletics row | `["check", "str"]`; `["check", "dex"]`; `["str"]` |
| `columns` | PF2e `strikes`, `dex_strikes` | Rank, Attack (computed, published), Item, Damage, Traits (secondary), Notes (secondary) |
| `namePosition` | PF2e `strikes`, `dex_strikes` | `1` |
| `position` | PF2e `strikes`, `dex_strikes`, `combat_notes` | as case 1 |
| `functions` | PF2e | the comment's last sentence, as case 1 |
| `hideHeading` | PF2e `conditions` Modifiers | `true` |
| `modifierTypes` | 5e | removed |
| `bonusType` | 5e Shield of Faith, Studded leather, Ring of Protection (both changes), Alert | removed |
| `position` | 5e `spell_attack`, `prepared`, `slots`, `spellbook` | as case 4 |

## Data and file model

No starter gains character data, and no note is rewritten. Every change is
layout-only, and installed starters are not touched (SPEC §3.2). Both starters
still install through `createLayout`, so a key the schema refuses fails the
install test, not a user. Per change, a note that meets the new starter keeps:

- **PF2e strikes:** every row and every typed `Attack` cell, undrawn. Its first
  edit appends `Rank` and `Item` to the header. Its strikes read lower until Rank
  and Item are set. Hard constraint 4 is pinned by a test.
- **PF2e `str` and Athletics:** nothing stored.
- **PF2e Conditions heading:** nothing stored.
- **5e bonus types:** nothing stored by a definition. A typed `as Item` in a
  player's cell is drawn and applies as its own kind.
- **5e Spells positions:** nothing stored.

`forged-in-the-dark.json` is not touched.

## Acceptance criteria

Tests in `src/starters/index.test.ts`, assertions changed deliberately and never
loosened. The old strike test is removed only in the same change that adds its
replacement.

**PF2e**

- [x] **Replaces "reaches no strike, and its library says so":** "moves each
      strike table by the conditions its attribute takes". The fixture is Amiri
      (STR 4, DEX 2, level 5) with a Strikes row `Longsword`, Rank 1, Item 1, and
      a Dexterity strikes row `Shortbow`, Rank 1, Item 0, each read off its drawn
      Attack cell:
      - unconditioned: Longsword `+12`, Shortbow `+9`;
      - Frightened 2: `+10`, `+7`;
      - Fatigued: `+12`, `+9`;
      - Clumsy 1: `+12`, `+8`;
      - Frightened 2, Fatigued and Clumsy 1 together: `+10`, `+7`, the worse
        Status penalty and not the sum.
- [x] Membership: the layout's open-group reading (`openGroupHolders`, the
      one the editor's counts take) puts Strikes' added rows in `check` and `str`
      and not `dex`, and Dexterity strikes' in `check` and `dex` and not `str`.
      The case above is the live index answering, in the arithmetic: Clumsy
      reaches only the Shortbow. The live index is not asserted directly,
      because it is `buildSheet`'s own and rebuilding it in the test spells a
      step `sheet.test.ts`'s host scan forbids. The library matches `Strikes read Strength` and `Dexterity
      strikes read Dexterity`, and no longer says a strike is typed.
- [x] **New, hard constraint 4:** "keeps a typed Attack a note wrote before Attack
      was computed". Under the starter's own `strikes` config, an old body `|
      Strike | Attack | Damage | Traits | Notes |` with `| Longsword | 11 |
      1d8+4 | Versatile P |  |` is written with a Rank edit on that row, an
      `attack` cell in the delta, and an added row. The Longsword line still holds
      `11` in its Attack cell, the delta's attack value appears nowhere, and the
      Attack cell draws the computed number, not 11. It is written as an edit
      and asserts no whole-body identity, because the edit appends `Rank` and
      `Item` to the header by design.
- [x] **New:** "reaches Athletics and the Strength strikes from a Strength-based
      penalty, and no Dexterity strike". A conditions row with the typed cell
      `@str += -1 as Status`, active, moves Athletics `+11`→`+10` and Longsword
      `+12`→`+11`, and leaves Shortbow `+9` and Acrobatics `+2` unmoved.
- [x] "carries the system's own rosters" adds `dex_strikes` to the panel id list.
      The modifier, type and trigger assertions are unchanged.
- [x] "pins the six definitions by name" is unchanged: no Enfeebled.
- [x] "gives every modifier group a member…" passes for `str`, through Athletics,
      with the test unchanged.
- [x] Every other PF2e number case (Frightened 2, Fatigued, Clumsy 1, Frightened
      1 with Clumsy 2, the AC stacking cases) passes with its current numbers.
- [x] **New:** "hides the Conditions modifier heading so the table fits a phone"
      asserts `hideHeading: true` on `conditions` Modifiers, and that
      `secondary` is absent from it.
- [x] Both strikes tables declare `openRows`, no `rows`, `namePosition: 1`, the
      Attack formula above with `publish: true`, and Rank, Item, Damage, Traits
      (secondary), Notes (secondary).
- [x] "resolves every name it publishes", "draws no component in an error state"
      and "ends every band in a stretcher…" pass.

**5e**

- [x] **New:** "stacks Ring and Cloak of Protection, two different items". With
      Ring of Protection attuned and an attuned `Cloak of protection` row whose
      Modifiers cell is `armour_class += 1; @save += 1`, armor class reads 14
      (12 + 2), and every save reads its ability's modifier + 2.
- [x] "adds Ring of Protection to armor class and every save, while attuned"
      passes with its current numbers (13, + 1, and nothing when not attuned).
- [x] "declares five usable modifier definitions" keeps the five names. It
      replaces the four-type assertion with `modifierTypes` undefined and no
      definition or change carrying `bonusType`, and keeps Bark Skin's
      `operator: "upgrade"`. Its comment drops "four bonus types contesting one
      target".
- [x] "keeps the whole of what makes it checkable" replaces
      `modifierTypes` `toHaveLength(4)` with `toBeUndefined()`.
- [x] The 5e `PINNED` changes in exactly four entries: `spell_attack card
      3,1,2,1`, `prepared card 5,1,1,1`, `slots track 1,2,5,2`, `spellbook
      record-set 1,4,5,6`. Still 55 walked, 15 top level. "ends all three
      columns on the same grid row" passes.
- [x] Forms' tint test still installs byte-identically twice through
      `createLayout`.

**Both, and the gates**

- [x] `forged-in-the-dark.json` is byte-identical to its current version.
- [x] The no-marks scan passes over every changed source. No label carries
      guidance text. `Dexterity strikes` and `Strength-based` are names.
- [x] `npm test`, `npm run lint` (`--max-warnings 0`) and `npm run build` pass.

**Land stop: scratchpad renders** (the harness renders only its own samples). The
5e and PF2e sheets are built from the starters through a scratchpad page
(`parseLayout`, `parseCharacter`, `buildSheet`, `renderGrid` on the test stub,
`obsidian` aliased to `src/test/obsidian-stub.ts`, linking `styles.css`,
`harness/theme.css` and `harness/obsidian.generated.css`, shot with headless
Chrome through `harness/cdp.mjs`). Each is shown light and dark, at 1300px and
400px:

- [x] **PF2e, Combat tab:** one character Frightened 2, Fatigued and Clumsy 1,
      with a strike in each table, one carrying an old typed Attack. Both tables
      draw the computed Attack with the condition mark, and the old 11 is
      nowhere. The tab ends with Combat notes at the foot.
- [x] **PF2e, 400px:** the Conditions table has no sideways scroll, and its
      remove glyph is visible on every row. Both strikes tables scroll, with
      ring, name and Attack visible before any scroll.
- [x] **5e, Combat tab:** one character wearing Ring and Cloak of Protection,
      armor class and the saves breakdown showing both, neither suppressed.
- [x] **5e, Spells tab at 1300px:** the eight-spell fixture shows all three group
      headers whole and at least 7 whole spell lines. Prepared's label and value
      are not clipped.
- [x] The report states that the `?` slot rows and the "Humar" chip still show,
      and lists both as open limits deferred to runs of their own.
- [x] A line on whether any README sentence became inaccurate. It is reported,
      not fixed: `README.md` has the owner's own uncommitted rewrite.

## Commit boundaries

1. `fix: Let conditions reach the PF2e strikes`. The strikes split (`strikes`
   reshaped, `dex_strikes` added, Combat tab placements), `str` in
   `modifierGroups`, Athletics in `str`, the library comment, and the tests: the
   replacement strike case, the hard-constraint-4 case, the `@str` case, the id
   list. The old "reaches no strike" case goes in this same commit.
2. `fix: Stack the 5e protective items as 5e does`. `modifierTypes` and every
   `bonusType` removed from `5e.json`, the Ring and Cloak case, and the two
   amended 5e assertions.
3. `fix: Fit the PF2e conditions table on a phone`. `hideHeading` on Modifiers
   and its case.
4. `fix: Make room for the 5e spellbook's last group`. The four Spells-tab
   positions and the four `PINNED` entries.
5. `docs: Record the starter follow-up`. **Written by `/land-it` at the land
   stop, not during the build**: the build session edits no doc but this spec's
   own checkboxes. In `docs/SPEC.md`, the §13 entry above,
   the 5e bonus-type sentence, and the §3.2 starter paragraph's "though no
   condition reaches a strike's typed attack" rewritten to say strikes take
   conditions by attribute. In `starter-layouts.md`, ruling 3 is marked
   superseded by this spec, not deleted. In `starter-layouts-refresh.md`, its two
   "Deliberately not doing" items (strikes, Ring and Cloak) are marked closed by
   this spec. The `docs/BACKLOG.md` `Armour` spelling row is removed.

`README.md` is in none of them. No `Co-Authored-By` trailer.

## Deliberately not doing

- **Any component change.** The Track's `?` for a count of 0 and the Passport's
  chip width, sized from the character count, are open limits deferred to runs
  of their own (above).
- **Making the strikes tables fit without a sideways scroll.** Damage stays
  primary and Notes stays, on the owner's ruling, and that arrangement measures
  627px in 508px at 1300px. The scroll is accepted at both widths.
- **Any doc edit during the build.** SPEC, `starter-layouts.md`,
  `starter-layouts-refresh.md` and `docs/BACKLOG.md` are `/land-it`'s, in
  commit 5.
- **The PF2e Inventory's sideways scroll** (604px in 508px at 1300px). It was
  never recorded as an open item. It is noted here so a reviewer does not
  report it as a regression.
- An Enfeebled definition, or any new definition. The six PF2e and five 5e names
  stay pinned.
- Moving an old strike into Dexterity strikes for the player, or deriving its
  attribute from Traits.
- 5e's same-name rule (a type per definition name), argued in case 2.
- The 5e attacks table: it stays stored.
- Keys for the unkeyed PF2e rows, multiple attack penalty, and damage arithmetic.
- The switched-off form's "(a higher override applies)" from `suppressionOf` in
  `src/formula/modifiers.ts`, and that reason drawn in the AC tile's value type.
- Forged in the Dark, the README, and any layout already installed in a vault.
