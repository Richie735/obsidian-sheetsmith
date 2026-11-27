# Starter layouts refresh

Status: shipped
Board card: Bring the three bundled starter layouts (`src/starters/5e.json`,
`pf2e.json`, `forged-in-the-dark.json`) up to the features shipped since they
were built on 2026-09-06. None of them uses modifier groups, group targets,
grouping, conditional fields, record-ceiling formulas, tint, the brief zone,
Roster or Roster's card layout. Four definitions give wrong numbers.

## Model question

None. Every change below uses a mechanism that has shipped, and no component,
config key or schema key is added. The two §13 entries this work leans on are
settled and are not reopened here: **"What a group target is"** (a group is a
name the layout lists in `modifierGroups`; a value joins by carrying it; a list of
targets holds groups only; derived membership is refused) and **"Whether a
record's own ceiling may be a formula"** (the ceiling is per record, typed in the
note, with no field-level formula).

Two facts from the precedent files decide most of what follows, and the build
must not work around either one:

- **A value takes a modifier only when its own formula reads `mod.self`** (SPEC
  §5, "Which names accept a modifier"), and a Table or Roster row is reached
  through the cell in its `publish` column (`table-row-modifier-target.md` D4).
  The PF2e sheet's saves, skills, lore, spell attack, spell DC and class DC read
  no `mod.self` today, so a group aimed at them would land nowhere. Their
  formulas gain `+ mod.self`, and Lore's Total gains `publish: true`.
- **A starter holds no character data** (`starter-layouts.md`;
  `record-ceiling-formula.md`, "Not found anywhere"). A Record set ships empty,
  so a ceiling formula, a tint or a granted temporary-point change can only be
  *enabled* by a starter, never shown by one.

**What reaches existing notes: nothing.** An installed starter is a layout the
user owns, and a plugin update rewrites nothing in a vault (SPEC §3.2). **Add a
starter layout** refuses a name the folder already holds. So every change here
reaches new installs only, and a note written against an old install keeps that
install. Where a note does meet the new starter (the reader deletes their layout
and installs again), each change below says what that note reads.

## What it does

The starters' numbers become right where the rules apply a bonus more widely
than to armor class: Ring of Protection adds to every save, and Frightened,
Fatigued and Clumsy reach the checks and DCs their rules name. The 5e and PF2e
spell lists, the PF2e feats and the 5e features draw under collapsible headers.
A 5e feature's Uses show only where the feature recharges, and the 5e forms can
each take a tint of their own.

## Smallest version

Case 1 alone: the `modifierGroups` lists, the group memberships, the `mod.self`
additions on PF2e, the four corrected definitions, the rewritten PF2e library
comment, and the tests that compute the corrected numbers. That is commit 1
below. It gives up grouping, the conditional Uses field and per-form tint, none
of which changes a number.

## Design

### Case 1: wrong numbers (do first)

**5e.** One group:

| Group | Label | Members |
| --- | --- | --- |
| `save` | Saving throws | `saves`, as the table's row default (all six rows) |

`saves` already reads `+ mod.self`. Nothing else on the 5e sheet joins a group:
no definition needs one, and a group that nothing aims at is padding.

- **Ring of Protection** becomes a two-change definition
  (`multi-change-definitions.md`), keeping `when: Attuned`:
  `armour_class += 1 as Item` and `@save += 1 as Item`.
- Shield of Faith, Studded leather, Alert and Bark Skin are correct and are not
  touched. The list stays at five names.

**PF2e.** Four groups:

| Group | Label | Members |
| --- | --- | --- |
| `check` | Checks | `saves` (row default: Perception, Fortitude, Reflex, Will), `skills` (row default: all sixteen), `lore` (row default, so rows the character adds), `spell_attack` (card) |
| `dc` | DCs | `ac`, `spell_dc`, `class_dc` (cards) |
| `save` | Saving throws | the Fortitude, Reflex and Will rows, by their own `groups` |
| `dex` | Dexterity-based | `ac` (card); the Reflex, Acrobatics, Stealth and Thievery rows, by their own `groups` |

So `ac` carries `["dc", "dex"]`, and the Reflex row carries `["save", "dex"]` on
top of its table's `check`. Perception stays out of `save` by never carrying it,
so no `inheritGroups: false` is needed anywhere.

Formulas that gain `+ mod.self`: the `Total` columns of `saves`, `skills` and
`lore`, and the `derived` of `spell_attack`, `spell_dc` and `class_dc`. `lore`'s
Total gains `publish: true`, because a group lands only in a published column
(D4). Its rows are open rows, so they publish no name (ruling 4) and are reached
by position (D5).

The definitions, each keeping its name, `bonusType: Status` and `when: Active`:

- **Frightened**: target `@check, @dc`, amount `-Value`.
- **Fatigued**: two changes, `ac += -1` and `@save += -1`. Fatigued reaches AC
  and saves only, and a list of targets holds groups only (D1), so two changes is
  the spelling.
- **Clumsy**: target `@dex`, amount `-Value`.
- Off-Guard, Raise a Shield and Armor potency rune are correct and are not
  touched. The list stays at six names.

**Three published names do not join, deliberately:**

- **`initiative`** reads `saves.perception`, which Frightened already moves.
  Joining it would apply the penalty twice. It has no `mod.self`, so it could not
  join anyway.
- **`proficiencies`** feeds `class_dc`, `spell_attack` and `spell_dc`. Joining it
  would double every DC and spell attack penalty.
- **`strikes`** stores a typed attack bonus (`starter-layouts.md`, ruling 3:
  "Strikes are stored, not computed"). A number column has no formula, so
  nothing can land in it. **So Frightened and Clumsy do not reach a strike.** That
  is the one place the rule's reach is short, and the library comment says so.
  Making strikes computed would reverse an owner ruling, which is out of scope.

**The PF2e library comment is rewritten**, because it now says something untrue
("The conditions all target armor class… a definition has one target"). The new
lines say which groups the conditions reach, that a valued condition reads its
own Value column, and that a strike's attack is typed, so no condition reaches
it. They describe the arithmetic, never rules text.

### Case 2: grouping

| Starter | List | `groupBy` | What the headers read |
| --- | --- | --- | --- |
| 5e | `spellbook` | `Level` (number) | `Level 0` … `Level 9`, lowest first |
| PF2e | `spellbook` | `Rank` (number) | `Rank 1` … `Rank 10` |
| PF2e | `feats` | `Type` (level) | the level names in declared order |
| 5e | `features` | `Class`, a new `text` field, `placement: "body"` | the class as the player first typed it, alphabetically |

- **5e cantrips head `Level 0`.** That is what a number field's header says
  (`record-set.ts`, `groupName`). Turning Level into a named `level` field
  (Cantrip, 1st…) would keep every note's bytes, since the index and the number
  are the same digit, but it changes how every spell's level is edited, from a
  number field to a select. That is a change to the record, not to how the list
  is grouped, and this work does not make it.
- **PF2e feats: the first Type level, `—`, is renamed `Unassigned`.** A blank
  Type reads as level 0, so those feats sit under that level's name, and a header
  reading `—` reads as nothing. This is `record-set-groups.md`'s own advice
  ("name its first level for a record with no choice, such as Unassigned"). A
  level is stored by position, so no note changes. The select reads `Unassigned`
  where it read `—`.
- **5e features: `Class` sits in the opened record**, since the group header
  already names it on every line. Until a player types one, every feature sits
  under one `Other` header. That is the accepted cost of a free-text key.
- **Ordered at the land stop by the owner (D5–D7, and the spellbook headings):**
  - **D5. `placement: "body"` on the 5e spellbook's `Level`, the PF2e
    spellbook's `Rank` and the PF2e feats' `Type`.** The group header already
    names the value, and changing a level is rare. `groupBy` reads a body-placed
    field, and the grouping tests assert the placement.
  - **D6. `fieldHeadings: true` on 5e `features`**, so the Recharges ring holds
    one x across lines.
  - **D7. The 5e spellbook grows from 3 to 5 rows** (`spellbook record-set
    1,5,5,5`) into the Spells tab's empty rows 9 and 10, and Spell notes moves
    from row 8 to row 10 (`spell_notes rich-text 1,10,5,1`), still 1 row tall.
    The tab's height is unchanged, and the three columns still end on one grid
    row. The owner accepted this over taking rows from Spell notes. Target: at
    least 5 spell lines visible with three groups open at 1300px (measured: 6).
  - **`fieldHeadings: true` on both spellbooks**: the 5e one labels Prepared and
    Concentration, the PF2e one labels Prepared.
- **Sorting within a group is deferred.** The mechanism does not exist, and
  nothing here builds it or imitates it.

A note meeting the new starter: no byte changes. Grouping is drawn, never stored
(`record-set-groups.md`, Data and file model).

### Case 3: record fields

- **5e features, Uses: shown when `Recharges > 0`.** This settles the brief's
  direction the other way round, for a reason. Hiding Recharges "when there are
  no Uses" can only read the *current* value, because a ceiling has no row-scope
  name (§13, per-record ceiling, "What stays closed"). So spending the last use
  would hide Recharges at exactly the moment the reader needs it. The direction
  `conditional-field-visibility.md` was built for, Uses shown only for a short or
  long rest, has no such trap. Recharges' levels are At will (0), Short rest (1)
  and Long rest (2). A record with no Recharges entry reads level 0, so it hides
  Uses without failing. A test pins that. **The owner accepted this reversed
  direction on approving the spec.**
  - **Cost to a note that meets the new starter:** a feature at At will that
    holds Uses keeps them in its fence, and they still count and still reset, but
    the field is not drawn until Recharges is set. Nothing is deleted.
- **5e features, Uses ceiling as a formula: no layout change.** It already has
  `maxSource: "record"`. A ceiling formula is typed on the record, so a starter
  that ships no records cannot show one (`record-ceiling-formula.md` left this
  list unchanged for that reason).
- **Checked and not adopted:**
  - 5e `companions`: HP is `maxSource: "record"` already, so a formula ceiling is
    the player's to type. Nothing on a companion depends on another field.
  - PF2e `feats`: no ceiling, and no field that only some feats need.
  - 5e `spellbook`, Prepared hidden on cantrips (`Level > 0`): a new spell with
    no Level would fail the condition, which draws the field with an error line
    under it (fail-open) until a level is typed. And a ticked, hidden Prepared
    would still count in the Prepared card. Not adopted.

### Case 4: the 5e forms stat block

- **`tintPerRecord: true`, `tint` left at the accent.** This is
  `form-tint-colour.md`'s own case: a druid's Wild Shape forms one colour, the
  Brown Bear its own. One colour for the whole block would mis-colour a
  Polymorph listed beside the shapes, so the block keeps the accent and a form
  may choose. No field is keyed `Tint`, so the switch's one constraint holds. A
  note stores `Tint:` only on a record whose reader chooses one.
- **`briefZone`: not adopted.** The 5e block's only table zone is Attacks. A
  form is chosen by what it changes (ability scores, AC, speed), which is the
  changes line the brief already draws. Briefing by attacks would hide that line.
- **Option modifier (a form setting Size): not adopted.** The 5e sheet has no
  Size card, and the brief rules out adding one to show the feature off.
- **Granted temporary points: nothing to change.** `hp` has `hasTemp`, and a
  form's Modifiers field already takes `hp.temp >= …`. A form's grant is the
  character's own row, since the records ship empty. Adding a definition for it
  would grow the definition list toward coverage, which `starter-layouts.md`'s
  guard forbids. The block's own HP field (forms with hit points of their own)
  already covers the other reading.

### Case 5: the 5e abilities block: stays as three components

**The owner's decision: A.** `abilities` (Card set), `saves` and `skills`
(Tables) stay as they are. The starter is worth having because a reader can hold
it against the sheet they own, and a note keeps reading exactly as it does now.
The two Roster options and what they would have cost are under **Deliberately
not doing**.

### Case 6: Forged in the Dark: no change

Checked, and nothing earns a place:

- **Modifiers, groups:** the sheet has none, and Blades' adjustments are dice
  and effect, not numbers a modifier can add.
- **Roster for attributes and actions:** this is Roster's own named case, and it
  costs what case 5's B costs (twelve action rows move out of three tables that
  nothing then reads). It also gives up the one-screen sheet the tests pin.
- **Special abilities:** a Record set with no fields. There is nothing to group
  by, and a free-text key would be invented for the demonstration.
- **Conditional fields, ceilings, tint, brief zone:** no Record set field and no
  Stat block to carry them.

### Verification and pixels

`npm test`, `npm run lint` and `npm run build` pass. **Scratchpad renders
replace the harness PNGs at the land stop**, because the harness renders its own
samples and never a starter. The 5e and PF2e sheets are rendered from the built
starters through a scratchpad page (`parseLayout`, `buildSheet` and `renderGrid`
on the test stub, the way `harness.ts` wires a sheet), in both themes, at desktop
width (1300px) and at phone width (about 400px). Each render shows:

- one character marked **Frightened 2 and Fatigued**, so the corrected numbers
  show in the picture (on PF2e, through the Conditions table; on 5e, the same
  character with Ring of Protection attuned, since 5e has no Frightened);
- the grouped spellbook, and the 5e features with two classes;
- the PF2e feats list;
- a 5e feature at At will beside one at Short rest;
- the 5e forms list in **Every form** with one tinted record.

## Config fields

No config field is added or changed. The keys each starter newly sets are
existing ones:

| Key | Where | Value |
| --- | --- | --- |
| `modifierGroups` | 5e, PF2e layouts | the lists in case 1 |
| `groups` | 5e `saves`; PF2e `saves`, `skills`, `lore`, `ac`, `spell_dc`, `class_dc`, `spell_attack`; PF2e Fortitude, Reflex, Will, Acrobatics, Stealth, Thievery rows | as case 1 |
| `changes` | 5e Ring of Protection; PF2e Fatigued | as case 1 |
| `publish` | PF2e `lore` Total | `true` |
| `groupBy` | 5e `spellbook`, `features`; PF2e `spellbook`, `feats` | as case 2 |
| `fields[]` (`Class`, `text`, `placement: "body"`) | 5e `features` | new field |
| `levels[0]` | PF2e `feats` Type | `Unassigned`, was `—` |
| `fields[].placement` | 5e `spellbook` Level; PF2e `spellbook` Rank; PF2e `feats` Type | `"body"` (D5) |
| `fieldHeadings` | 5e `features` (D6); 5e `spellbook`; PF2e `spellbook` | `true` |
| `position` | 5e `spellbook`; 5e `spell_notes` | `1,5,5,5`, was `1,5,5,3`; `1,10,5,1`, was `1,8,5,1` (D7) |
| `visibleWhen` | 5e `features` Uses | `Recharges > 0` |
| `tintPerRecord` | 5e `forms` | `true` |

## Data and file model

No character note changes, and no starter gains character data. Every new key is
layout-only, and each is read leniently by its owner, so a layout installed
before this work keeps loading as it did. Installed starters are not touched
(SPEC §3.2). The only note entry the new starter can cause is `Tint:` on a form,
written by the reader's own choice and removed by **Default**
(`form-tint-colour.md`). Each starter still installs through `createLayout`, so a
key the schema refuses fails the install test, not a user.

`5e.json` now departs from the vault's `DnD 5e Standard` reference, which
`starter-layouts.md` says differs only in name and description. That sentence
is amended. The vault file is outside the repository and is not this feature's
to change.

## Acceptance criteria

Tests in `src/starters/index.test.ts`, assertions updated deliberately, never
loosened:

- [x] **5e:** with Ring of Protection on an Attuned inventory row, armor class
      reads 13 (12 + 1) and every save reads one more than without it
      (`saves.STR` 4, `saves.DEX` 3 on the fixture). With the row not attuned,
      nothing moves.
- [x] **5e:** "declares five usable modifier definitions" still pins the same
      five names, and also asserts `modifierGroups` reads with no problem.
- [x] **PF2e:** "pins the six definitions by name" keeps the names and replaces
      the "every one targets ac" assertion with each definition's exact targets
      (Fatigued's and Frightened's included).
- [x] **PF2e, Frightened 2:** Perception 8, initiative 8 (not 6), Fortitude 10,
      Reflex 9, Will 6, Stealth 7, Athletics 9, Warfare Lore 7, spell attack 9,
      spell DC 19, class DC 21, AC 20, and `proficiencies.class_dc` still 9.
- [x] **PF2e, Fatigued:** AC 21, Fortitude 11, Reflex 10, Will 7, and Perception
      10, Stealth 9 and spell DC 21 unmoved.
- [x] **PF2e, Clumsy 1:** AC 21, Reflex 10, Stealth 8, Acrobatics 1, Thievery 1,
      and Fortitude 12, Perception 10, Athletics 11 unmoved.
- [x] **PF2e, Frightened 1 with Clumsy 2:** Reflex 9 and Stealth 7, the worst
      Status penalty and not the sum.
- [x] The existing stacking cases on AC still pass with their current numbers.
- [x] **PF2e:** no strike's attack moves under any condition, and the library
      comment names that.
- [x] Both sheets: "resolves every name it publishes" and "draws no component in
      an error state" pass. A group naming no member, or a member naming an
      unlisted group, fails a test.
- [x] Grouping: the 5e spellbook with spells at levels 0 and 3 draws headers
      `Level 0`, `Level 3`; PF2e known spells draw `Rank` headers; PF2e feats with
      no Type draw under `Unassigned`; 5e features with `Class: Fighter` and
      `Class: Wizard` and one with none draw `Fighter`, `Wizard`, `Other`.
- [x] 5e features: a record at Short rest draws Uses; a record at At will and a
      record with no Recharges entry draw Uses `hidden` with no problem line.
- [x] 5e forms: `tintPerRecord` is on, `tint` is absent, and the layout installs
      through `createLayout` unchanged on a second pass.
- [x] The 5e `PINNED` holds except for two deliberate entries,
      `spellbook record-set 1,5,5,5` and `spell_notes rich-text 1,10,5,1` (D7).
      The PF2e and Forged in the Dark placement pins are unchanged. No component
      is added or removed.
- [x] D5: the 5e spellbook's `Level`, the PF2e spellbook's `Rank` and the PF2e
      feats' `Type` have `placement: "body"`, and each list still groups by that
      field. The grouping tests assert the placement.
- [x] D6: 5e `features` has `fieldHeadings: true`, and the Recharges ring sits at
      one x on every line of the scratchpad render.
- [x] D7: the Spells tab's height is unchanged, the three columns still end on
      one grid row, and the 1300px render shows at least 5 spell lines with three
      groups open.
- [x] Both spellbooks have `fieldHeadings: true`: the 5e strip names Prepared
      and Concentration, and the PF2e strip names Prepared.
- [x] `forged-in-the-dark.json` is byte-identical to its current version.
- [x] The no-marks scan passes over every changed source.
- [x] `npm test`, `npm run lint` (`--max-warnings 0`) and `npm run build` pass.
- [x] Land stop: the scratchpad renders listed under **Verification and
      pixels**, and a line on whether any README sentence became inaccurate (it
      is reported, not fixed).
- [x] Land stop: the report lists which PF2e definitions do not reach a value a
      player rolls (Frightened and Clumsy do not reach a strike's typed attack).
- [x] Land stop: the report carries the Ring and Cloak of Protection limit
      (**Deliberately not doing**) as an open limit of the 5e starter.

## Commit boundaries

1. `fix: Aim the starters' wider modifiers at groups`. `modifierGroups` on 5e and
   PF2e, the memberships, PF2e `mod.self` and Lore `publish`, Ring of Protection,
   Frightened, Fatigued and Clumsy, the rewritten PF2e library comment, and the
   number tests.
2. `feat: Group the starters' spell, feat and feature lists`. The four
   `groupBy` keys, 5e `Class`, PF2e `Unassigned`, 5e Uses `visibleWhen`, the
   body placements (D5), `fieldHeadings` on 5e features and both spellbooks
   (D6), the 5e spellbook and Spell notes positions (D7), and their tests.
3. `feat: Let each 5e form choose its own tint`. `tintPerRecord` and its test.
4. `docs: Record the starter refresh`. `starter-layouts.md`: ruling 4 (the
   conditions target AC alone) and the 5e "only changes are its name" sentence,
   each marked as superseded by this spec, not deleted.

`README.md` is in none of them.

## Deliberately not doing

- The DM screen starter, sorting within a group, the README, any new component
  or schema key, and any rules text or description in a starter.
- Strikes reached by conditions (needs a computed strike, which reverses ruling 3).
  *Closed by `starter-layouts-follow-up.md`, case 1:* strikes are computed, one
  table per attribute.
- Named spell levels (Cantrip, 1st…) on the 5e spellbook.
- A Size card, a briefZone, or a new definition to show a feature off.
- Keys for the unkeyed PF2e rows (Fortitude, Reflex, Will, most skills). D5
  reaches them by position. Publishing new names is a separate change.
- **An open limit of the 5e starter, not of the engine: Ring and Cloak of
  Protection.** 5e has no bonus types. Two different magic items stack, and only
  same-named effects do not. The starter's `Item` type is a modelling choice, and
  it gives a wrong number the moment a player adds a second protective item: the
  two contest and only one applies. Unchanged here, and listed on the land-stop
  report. *Closed by `starter-layouts-follow-up.md`, case 2:* the 5e starter
  declares no bonus types, so both items apply.
- Any change to a layout already installed in a vault.
- **Case 5's B and C, a Roster for the 5e abilities block.** The owner chose A.
  The brief's "cardLayout `stat`" is Roster's `cardLayout: true`
  (`stat-with-dependants.md`, Later additions), since a Card set has no such
  layout. What B and C would have cost is the reason:

  | | A. Stay (chosen) | B. Roster, `cardLayout: true` | C. Roster, one table |
  | --- | --- | --- | --- |
  | Look | as now: the strip, the saves box, the skills list | six cards, each an ability with its save and skills under it (the 2024 paper sheet) | one table, a band per ability |
  | Pinned tests | unchanged | `PINNED` loses two entries (55 → 53 walked), and the three-column band re-flows and is re-measured; "gives its abilities, saves and skills a slot…", the modifier-notes B block (every save and skill published, War Caster on the Constitution save) and the senses formulas are rewritten against new names | as B |
  | Published names | unchanged | `abilities.STR` can survive if the Roster keeps the id and stat keys; `saves.*` and `skills.*` go, so `senses` changes and any character modifier naming `saves.CON` or `skills.stealth` dangles (it is drawn as dangling, not corrected) | as B |
  | A note written against the old starter | reads exactly as now | its `## Abilities` fence still reads as the scores. Its `## Saving throws` and `## Skills` tables are **retained but read by nothing**, so every save and skill draws untrained, with numbers lower by the proficiency bonus, until the player marks them again in the Roster. Nothing is deleted (Constraint 4), but the sheet reads wrong | as B |
  | Column set | two (Prof, Training) | one shared set, so a save offers Expertise | as B |
  | Replica claim | holds: the starter is the D&D Beyond-shaped vault sheet | gone: a different sheet's shape | gone |
