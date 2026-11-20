# A modifier aimed at a group of values

Status: shipped
Board card: One modifier reaches every row of a kind: "+1 to all saving throws"
is one entry, not six, and it shows in every save's number and breakdown.

## Amendments

- **2026-11-18, accepted by the owner: the per-row descriptions are drawn once
  under each list, not on every row.** The descriptions of `rows[].groups`,
  `rows[].inheritGroups` and `entries[].groups` in **Config fields** are one
  footnote under the `rows` or `entries` list, below its buttons and beside the
  row-value note, the toggle's sentence after the groups' one, and worded about
  rows in general and naming the toggle, since a note under the last row read
  as that row's. Reason: two sentences repeated on 18 rows is noise. D12 and the
  Config fields table below are worded to match.

## Model question

This settles the §13 entry **What a group target is**, recorded in
`docs/SPEC.md` with this spec and settled with the owner on 2026-11-18 in four
rulings. The rulings are the answer and are not argued again here. They are
restated only as far as the design below leans on them:

1. A group can cross components. Groups are a list the layout owns, each entry a
   `name` and a `label`, and a group name not on that list is refused the way a
   target that publishes nothing is refused today.
2. Membership is declared on the value. A declared row or a card names its
   groups, a Table or Roster may set a default for all its rows, and a modifier
   names one or more groups.
3. A member leaves a group by not carrying it. A modifier cannot exclude a member
   in v1, derived membership is refused, and a condition on the member's own data
   is deferred, with its clause reserved in the cell grammar.
4. A row the character adds joins through its table's default group, still
   publishes no name, and its slot follows the ruling that a row is identified by
   its position.

What the rulings left open, and this spec decides, is under **Decisions** in
**Design**. The §4.1 questions, answered:

- **Does the contract grow?** Yes, by three fields on what `scopeValues` already
  returns, and by no member. `ScopeEntry.groups` says which groups a published
  name is in. `ScopeValues.unnamed` lists the values in a group that publish no
  name, each with a slot key, a label and its groups. `ScopeValues.openGroups`
  says which groups a row the character adds will join, read statically. Each
  passes §4.1's rule: the alternative is the formula layer knowing that a Table's
  rows inherit the table's default, which column a row publishes, and that a
  character's rows exist. All three flow through `publishedEntries` and
  `modifierTargetSource` in `formula/modifier-targets.ts`, so membership is read
  by the one walk over `ScopeValues` and not by a third reading (BACKLOG
  § Patterns rows 64 and 67 are why).
- **What does it publish?** No new name a formula can write. A group is a word a
  modifier aims at, never a value: `@save` is not in the name table, and
  `mod.@save` is not a slot. An unnamed member gets a slot under a key no formula
  can spell, read only through that row's own `mod.self`.
- **What does it store?** In a character note, nothing new except the modifier
  cell's group spelling, which a reader or a promote writes on purpose. In a
  layout, `modifierGroups` and a `groups` list on a Card, a Card set entry, a
  Table, a Table row, a Roster and a Roster row. Every key is optional and
  absent by default, so every existing note and layout round-trips byte for byte
  (Constraint 3).
- **Existing notes?** Untouched. Removing a group from the layout leaves every
  cell naming it in the note, rendered and reported, never rewritten
  (Constraint 4, §10).

## What it does

A layout author declares a group, say **Saving throws** under the name `save`,
and puts the six save rows in it once, by giving the Saves table `save` as its
row default. A character's Cloak of Protection then carries one part,
`@save += 1 as item when Worn`, and every save's number goes up by one, with a
mark, and a breakdown line saying `Gear · Cloak of Protection · via Saving
throws`. Frightened is `@save, @skill, @attack, @check, @dc += -1 as status`:
one part naming several groups, reaching saves, skills, attacks, Perception and
armour class at once.

## Smallest version

One group per modifier, members on published names only (keyed rows, Cards, Card
set entries), `@name`, the reserved ` where:`, the groups list, the picker's
optgroup and the `via` line. **Gives up:** several groups in one part (Frightened
takes five parts, and an untyped bonus reaching a value through two of them
applies twice; a typed one contests itself and applies once), rows with no
name (ruling 4 unmet, so an Attacks list is unreachable), and the reach line.

## Design

### Decisions this spec takes

- **D1. A group is spelled `@<name>` in a target, and several are listed with
  commas: `@save, @skill += -1 as status when Frightened`.** This is the one
  sanctioned change to the modifier cell's format. The argument for `@`:
  - It cannot begin a published name, so today's `ASSIGNMENT` in
    `parse/modifier-cell.ts` never matched it, and the discriminator gains a
    second alternative rather than a new meaning for an old one. A group named
    `save` and a component with id `save` cannot be confused.
  - It is not a character of the expression grammar (`tokenize` throws on it),
    so it can never be the start of an amount or a condition.
  - It has no meaning in markdown or in Obsidian. **`#save` was the obvious
    spelling and is refused because Obsidian indexes `#save` in a table cell as a
    tag**, which would put a modifier into the tag pane of every vault using it.
    `save.*` is the path pattern ruling 1 and the prior art refuse. `[save]`
    sits a bracket away from a wikilink in a table cell. `group:save` reads as a
    namespace and is longer at every use.

  The comma list holds groups only. A published name in the list, such as
  `@attack, armour_class += -1`, is refused for that part with
  `A list of groups can hold only groups. Write armour_class as its own part, or
  give it a group.` Earthquake is then `@attack, @skill, @ac += -2`, with armour
  class given the group `ac` (or any group the author prefers). A blank list
  entry, a repeated group and `@` alone are read leniently: blanks and repeats
  are dropped at the read, the bytes are kept, and `@` alone is a group with no
  name, so the part changes nothing. **Both tiers say so in one sentence**: the
  row's popup reads `This modifier names no group yet, so it changes nothing.
  Choose one under Value.`, and the definitions list says the same of a change,
  `"Cloak" names no group yet, …`. That is the form's state after the last chip
  is removed, so the reader is told what to do next rather than left with a
  silent glyph.

  **The discriminator widens, and that is stated rather than hidden.** A
  definition may today be named `@save += 1`, which a cell would read as a name.
  After this a cell reads it as a typed part, so `readsAsAssignment` refuses that
  name shape too, through the existing `unspellableName` sentence. A layout
  holding such a definition name is reported in the definitions list, and a row
  enrolled in it renders as a stray typed part. No surveyed or shipped layout
  names a definition that way.

- **D2. The definition tier spells a group the same way.** A definition's (or a
  change's) `target` is the string a cell would hold: `"target": "@save"`, or
  `"@save, @skill"`. One spelling for both tiers is what lets a typed part be
  promoted into a definition and detached back with no translation. The target
  is read by one helper, `groupsOf(target)`, in `parse/modifier-cell.ts`, which
  returns the group names or null for a published name. Every reader of a target
  asks it, so no reader learns the `@`.

- **D3. A group change is the same change aimed at each member, and each member
  answers exactly as its name would.** The walk in `buildModifierTables`
  expands a group target into one contribution per member before any reduction
  runs. Every rule after that point is unchanged and per member: bonus-type
  stacking, the override and at-least contests, the two phases, notes, levels
  and flags set `in <column>`, and every refusal. So:
  - **An item bonus from a group and an item bonus aimed at the member by name
    meet the ordinary bonus-type rule** in that member's slot: the larger
    applies and the other is listed suppressed, on that member only. A Cloak of
    Protection (`@save += 1 as item`) beside a Ring of Strength Saves
    (`saves.str += 2 as item`) gives Strength +2 and every other save +1.
  - **The amount is the source row's, evaluated once**, in the source row's
    scope, as today. The member contributes nothing to it. That is what the
    reserved ` where:` clause (D8) would change, for the condition only.
  - **An amount that will not resolve refuses every member's slot, naming the
    row**, on §5's rule: one unreadable amount makes the slot publish nothing.
    Refusing only some members would be a number the reader cannot account for.
  - **A member that does not accept the change is skipped, never thrown.** A
    Card member reached by `@save = 1 in Training` has no Training column, so
    that member is listed as not reached, with today's sentence for the same
    change aimed at it by name; the others are set.
  - **Several groups under one condition, deduplicated by member.** A part
    naming `@save, @check` where Dexterity save is in both reaches Dexterity save
    once. That is Pathfinder 2e's selector array without its duplicate-collapse
    trap: pf2e collapses two *different* modifiers on one selector unless each
    has a slug, and here two different rows or parts are always two
    contributors, contested by the stacking rule and nothing else.

- **D4. Membership lives on the value, read by one shared module.** A new
  `src/components/member-groups.ts`, not a component, holds the rule all four
  components follow (PATTERNS §1: share the application, not the fact):
  - `rowGroups(row, defaults)`: the component's default groups, then the row's
    own `groups` added to them, repeats dropped. **A row's own list adds to the
    default, it does not replace it.** Overlap is the norm, since Acrobatics is
    both a skill and DX-based, so Acrobatics writes only `["dex_based"]`. A
    replacing list would also make a later change to the default silently miss
    every row that had a list of its own, which is the silent-miss trap the
    research warns against: the author adds `check` to the Skills default and
    Acrobatics is quietly left out.
  - **A row leaves the default only by saying so, with `"inheritGroups":
    false`**, and then carries its own list alone. Absent is `true`. That keeps
    ruling 3 whole: the row does not carry the default's groups, so it is not in
    them, and no modifier excludes anything. Initiative on a 5e Checks table is
    the case, written `{ "label": "Initiative", "key": "init", "inheritGroups":
    false, "groups": ["init"] }`. **An empty own list means nothing special**:
    `"groups": []` adds no group, exactly as an absent list does, so a row in no
    group at all is `"inheritGroups": false` with no list. There is one way to
    leave and one way to join, and neither key changes what the other means.
    `inheritGroups` on a row of a component with no default is harmless and
    reported by the editor as having nothing to leave.
  - the `groups` config-field entry each component declares, with one label and
    one description per position (component default, row, card);
  - the attaching of `groups` to a `ScopeEntry`, and the building of an
    `unnamed` entry.

  Card puts its `groups` on its `self` entry. A Card set entry carries its own
  `groups` on its `named` entry; a Card set has no default (ruling 2 names only
  Table and Roster). A Table or Roster puts each published row's groups on that
  row's `named` entry, and lists its unnamed members (D5). A Roster's stat is
  not a member in v1 (**Deliberately not doing**).

  **A member's value is its cell in the component's published column.** A
  Table or Roster row publishes one value, the cell in the column marked
  `publish`, and that is the number a group reaches, keyed or not. A Table whose
  rows carry groups and that publishes no column has nothing for a group to land
  in: the layout editor's groups field reports `Choose a column to publish, so a
  group has a value on each row to reach.`, and the groups are ignored. It is a
  report and not a configuration error, because blanking a skills table over a
  missing group would be a layout edit hiding character data.

- **D5. A row with no name has a slot keyed by its position, never by its
  label.** This covers a row the character adds and a declared row with no
  `key`, so ruling 4's case and its declared twin take one path. The component
  lists each such row that carries a group in `ScopeValues.unnamed`, with a slot
  key built from the component id and the row's position in the order the card
  draws its rows (declared first, then the character's in note order). The key is
  a string no formula can spell, `attacks[3]` for example, since `[` is not a
  character of the grammar. The sheet registers `mod.<key>` for each, exactly as
  it registers `mod.<name>` for each published name, and the row's published
  cell reads it through `mod.self`, the evaluation's name being the key.

  **Why position and not the label.** Two rows the character added may share a
  name (two `Longsword` rows), and §2 Row and `docs/features/open-rows-for-table.md`
  settled that a row is identified by its position for exactly that reason. A
  grant could key its spent record by label because that record is stored, and a
  fence's only address is its key. **A slot is never stored**: it is recomputed
  on every build from the rows as they now are, so deleting row 2 re-keys every
  row after it consistently and nothing can go stale. The cost of position, a
  re-key on every reorder, falls on nothing because nothing remembers a key.

  An unnamed member still publishes no name (ruling 4): `attacks.Longsword`
  fails as an unknown name exactly as before, `mod.self` on a row in no group
  still reads 0, and a formula elsewhere cannot read the slot. Only the row's own
  cell sees it.

- **D6. The groups list.** `modifierGroups` in the layout file, a list of
  `{ "name": "save", "label": "Saving throws" }`. A name must be a name §5
  accepts (letters, digits and underscores, one segment, not starting with a
  digit), so `@<name>` is one token in a cell. The label is what every surface
  shows; a blank label falls back to the name. Read by a new
  `parse/modifier-groups.ts` on `parse/modifier-types.ts`'s precedent: whether
  `modifierGroups` is a list of objects is the file format's business and
  refuses the layout, and whether an entry is usable (blank name, repeated name,
  unspellable name) is contents, reported in the editor while every sheet goes
  on rendering. **Derived membership is refused at the read**: an entry carries
  `name` and `label` and nothing else, and a component's `groups` is a list of
  literal names, never an expression. A `groups` value that is not a list of
  strings refuses that component's configuration with `Groups are a list of
  group names. Write the group on each row that belongs to it.`

- **D7. A dangling group is rendered, not corrected, wherever it is named.**
  - A row or card naming a group the layout does not declare: the membership is
    ignored and the editor's groups field reports it on that component, with the
    fix (`"saves" is not a modifier group this layout declares. Choose one it
    does, or add it under Modifier groups.`). This check reads components'
    declared groups through `publishedEntries` and `openGroups`, in
    `formula/modifier-targets.ts`, so it sits in the one walk; the parse module
    cannot see components.
  - A cell or a definition naming an undeclared group: that group reaches
    nothing, any declared group beside it in the same list still applies, and
    the row says `"@saves" is not a modifier group this layout
    declares.` with the same fix, the target-that-publishes-nothing rule read for
    a group (ruling 1). Pathfinder 2e's wrong selector silently does nothing; here
    the row says so.
  - **A declared group with no member is reported, never thrown.** The editor's
    group list says `No value is in this group yet.` against it, and a row aimed
    at it says `Saving throws holds no value on this sheet, so this changes
    nothing.` A group whose only members are rows the character adds is not
    empty: the editor reads `openGroups` and says `Only rows a character adds to
    Attacks are in this group.` instead.
  - **A member that no longer exists cannot be aimed at.** Membership is
    declared on the value, so a removed row or card is simply not enumerated, and
    dnd5e issue 6785's failure, a modifier aimed at a deleted member throwing on
    sheet open, has no path here: the walk expands a group into the members that
    exist now.

- **D8. The member condition is reserved as ` where: <condition>`, and v1
  refuses it.** The clause order becomes `target op [amount | option: literal]
  [to result] [in column] [as type] [when cond] [where: cond] [note: text]`. The
  parse takes the note off first, as today, then ` where:` at its leftmost
  occurrence, then runs today's scans. The colon is what makes it safe, on
  ` note:`'s argument: `:` is not a character of the grammar, so ` where:`
  cannot occur in an amount or condition that parses, and a cell without it runs
  exactly today's path. The bare word `where` stays a legal name. In v1 a part
  carrying the clause keeps its bytes and changes nothing, and the row says
  `A condition on each value is not supported yet, so this modifier changes
  nothing. Remove "where:" to apply it to every value it reaches.` Jack of All
  Trades is then `@skill += floor(prof / 2) where: Training == 0` the day the
  clause is built, and no stored cell changes. A definition change carrying a
  `where` member is reported in the definitions list on the same terms, so both
  tiers reserve it. The modifier form offers no field for it. **The keyword is
  also refused where it would be cut**, on ` note:`'s precedent: a bonus type
  spelled with ` where:` is reported under **Bonus types**, and a column key or
  an option literal holding it cannot be spelled from a row's own modifier, in
  the existing `unspellableColumn` and `unspellableOption` sentences.

- **D9. The breakdown names the group on each member's line.** A member's
  breakdown is the ordinary breakdown, and the line identity gains one last
  token, `via <group label>`: `Gear · Cloak of Protection · via Saving throws
  +1 item`. That answers **how a breakdown reads when one modifier lands on many
  values**: each value's breakdown is about that value, so it carries one line
  for the modifier, as it would for a name; the many-values half is said once,
  at the source row (D10). A part naming several groups names the group the
  member was reached through, and where it is in two of them, both, joined by
  `and` (`via Saving throws and Checks`). Suppression and the `already higher`
  wording are today's, per member. The token follows the identity rule's own
  drop rule: it is never dropped, because nothing else on the line says the
  modifier was not aimed at this value by name, which is the first thing a
  reader asks of a number that moved.

- **D10. The source row says how far the change reached.** The row's outcome
  text, its `title`, the popup and a Stat block's change line, all built by
  `outcomeWords` and `modifierOutcomeText`, name the group by its label where
  they name a target by its label today, and add a reach line under it:
  ```
  Saving throws — item +1
  Reaches 6 values, only while Worn, which holds now
  ```
  Where some members refused or suppressed it, the reach line counts and names
  the first by its published label, as every target is named today: `Changes 5
  of 6 values. Not Saves · str: a larger item bonus applies.`, and `and 2 more`
  past one (`Not Saves · str and 2 more: …`). A group outcome carries its labels and
  counts in new members of `ModifierOutcome` rather than in `targetLabel`, which
  held a key and was BACKLOG row 146, left as it was here. *Closed by
  `published-name-labels.md`: the reach line now names the member by the row a
  reader sees, `Not Saving throws · Strength`.*

- **D11. Pickers offer groups beside names.** `fillTargetOptions` gains a
  **Modifier groups** optgroup, first, listing each declared group by label, its
  option value the `@name` spelling. The sheet's modifier form and the layout
  editor's definitions **Changes** target select both draw through it, so
  neither adds a `changesOf` site (BACKLOG row 51 stays as it is). The heading
  says **Modifier groups** and never **Groups**, because Group is a container
  and a Record set already groups its records under headers. Choosing a group
  shows, under the select, a chip list of the chosen groups and an **Add a
  group** select listing the rest, which is how a part names several. Removing
  the last chip returns the Value select to its blank. A cell naming a group
  the layout no longer declares carries it as one extra last chip, `saves (not
  declared)`, on the stray-option rule the Value select already follows.

- **D12. Where a card and a row declare their groups in the layout editor.**
  One new config-field kind, `groups`, drawn by the editor as the same chip list
  and **Add a group** select the form uses (one control, in
  `src/components/group-chips.ts`, so the editor and the form cannot disagree,
  and a component imports no component). It appears:
  - on a Card, as a top-level field;
  - on a Table and a Roster, as a top-level field for the row default, and on
    each declared row's detail line in the `rows` editor;
  - on each Card set entry's detail line in the `entries` editor.

  On a row, the inherited groups are drawn as chips beside the row's own, in
  the faint text colour, with no remove control and an accessible name ending
  `from the table`, so a reader sees every group the row is in, and which half
  is the row's to edit. Choosing a group adds a chip of the row's own, written
  to `groups`; removing the last of them removes the key. A toggle beside the
  chips, **Same groups as the table** (or **as the roster**), on by default,
  writes `"inheritGroups": false` when turned off and removes the key when
  turned back on; while it is off the inherited chips are not drawn. A group
  the row already inherits is not offered again in **Add a group**. What a
  row's own groups do, and what the toggle does, are said **once, as a footnote
  under the list's buttons**, beside the row-value note, about rows in general,
  not on every row (see **Amendments**). The layout's
  list itself is a line list beside **Bonus types**, on
  `editor/line-list-field.ts`, headed **Modifier groups**, one group per line as
  `save: Saving throws`, a line with no colon taking its name as its label. Each
  line draws a member count after it, `6 values`, whose `title` lists their
  labels, which is how an author sees where a group named for a kind of thing
  ends (dnd5e's initiative outside `ability.check`, Pathfinder 2e's `all` that
  is not all): membership is explicit and shown, never implied by a name.

- **D13. Pasting a component names the groups it leans on.** A copied component
  whose config names groups the target layout lacks is listed by the paste
  `Notice` under a new dependency kind, `group`, on
  `editor/paste-dependencies.ts`' rule: a layout-level declaration is never
  carried, only named.

### On the sheet

Nothing new is drawn on a member. A save reached by a group carries the same
underline mark, opens the same breakdown and draws the same note mark as a save
reached by name: the reader asks "why is this 7" and the line answers, so the
one surface that is new is a word on a line. A row the character added and
reached through its table's default draws a mark and opens a breakdown, which it
could not before, because it had no slot. Its breakdown is the computed cell's
ordinary popover, the formula and then the contributors, with no heading of its
own: no breakdown is headed by a label today, and the row's name is the cell's
own row heading beside it.

The source row's modifier glyph, popup and Value select change as D10 and D11
say. The modifier form's other fields (operator, amount, phase, bonus type,
condition, note) are unchanged.

**Empty state.** A layout with no `modifierGroups` draws every picker, form and
editor panel exactly as today, with no **Modifier groups** optgroup and no
groups fields on components (the field is drawn only once the layout declares a
group, with the line list's own empty hint, `Add a group to aim one modifier at
many values.`).

**Error states.** Every one is a sentence at the place it can be fixed, and none
refuses a sheet: D1's list refusal, D4's missing published column, D6's
non-list `groups`, D7's undeclared and empty groups, and D8's reserved clause.

### Harness views

- `group-target-saves`: a Saves table with six keyed rows in `save`, a Cloak of
  Protection row in a Gear table pushing `@save += 1 as item`, one save's
  breakdown open, showing the `via Saving throws` line.
- `group-target-stacking`: the same with a Ring pushing `saves.str += 2 as
  item`, the Strength save's breakdown open, the cloak's line suppressed.
- `group-target-reach`: the Gear row's popup open, the reach line reading
  `Changes 5 of 6 values. Not Saves · str: a larger item bonus applies.`
- `group-target-open-rows`: an Attacks table with open rows and default group
  `attack`, two character rows both named `Longsword`, a Bless condition pushing
  `@attack += 1`, both rows marked, one breakdown open.
- `group-target-picker`: the modifier form open on the cloak's group part,
  the Value select showing Saving throws and its one chip under **Modifier
  groups**; and `group-target-picker-chips`, Frightened's form with five chips.
  The select held open on its **Modifier groups** optgroup is not a shot, since
  a headless browser draws a native list closed; the optgroup, first, is held by
  `modifier-form.test.ts`.
- `group-target-editor`: the layout editor's Layout panel, with the
  **Modifier groups** line list and each group's member count. The panel shows
  one form at a time, so a Table's row default field is in
  `group-target-editor-rows` (the Skills table, three rows) and
  `group-target-editor-rows-long` (all eighteen 5e skills), each with its rows'
  own groups and the footnote under the list.
- `group-target-errors`: rows saying the undeclared-group, empty-group and
  reserved-clause sentences.
- `group-target-inherit-off`: Frightened on, with Stealth out of the Skills
  table's row groups (`"inheritGroups": false`, its own list `dex_based`, which
  Frightened does not aim at); Stealth's popover open, reading +2 with no
  contributor and so no `via` line. And `group-target-inherit-off-reach`,
  Frightened's popup on the same sheet reading `Reaches 12 values`, one fewer
  than the 13 with Stealth in. Its own state, so the Frightened views keep
  their numbers.

## Config fields

The three per-row and per-entry descriptions (`rows[].groups`,
`rows[].inheritGroups`, `entries[].groups`) are drawn once, as a footnote under
their list, and not on each row (see **Amendments**).

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `modifierGroups` (layout) | line list | Modifier groups | The groups a modifier may aim at instead of one value, one per line as `name: Label`. A modifier aimed at a group changes every value in it. Removing one changes no character note. |
| `groups` (Card) | `groups` | Modifier groups | The groups this card's number is in. A modifier aimed at any of them changes this number, and its breakdown names the group. |
| `entries[].groups` (Card set) | `groups` | Modifier groups | An entry's own groups are the ones its number is in. A modifier aimed at any of them changes that entry, and its breakdown names the group. |
| `groups` (Table) | `groups` | Row groups | The groups every row is in, rows a character adds included. A modifier aimed at one changes each row's published value. |
| `rows[].groups` (Table) | `groups` | Modifier groups | A row's own groups add to the table's row groups. |
| `rows[].inheritGroups` (Table) | `boolean`, default on | Same groups as the table | Turn off "Same groups as the table" to keep a row in its own groups only, so a modifier aimed at the table's groups skips it. |
| `groups` (Roster) | `groups` | Row groups | The groups every row is in. A modifier aimed at one changes each row's published value. |
| `rows[].groups` (Roster) | `groups` | Modifier groups | A row's own groups add to the roster's row groups. |
| `rows[].inheritGroups` (Roster) | `boolean`, default on | Same groups as the roster | Turn off "Same groups as the roster" to keep a row in its own groups only, so a modifier aimed at the roster's groups skips it. |

## Data and file model

**A character note.** A modifier cell may now hold a group target:
`| Cloak of Protection | yes | @save += 1 as item when Worn |`. It is text in a
markdown table cell like any other, holding no link, so Constraint 2 is not
reached; `@` has no markdown meaning, and the `#` spelling was refused because it
would be indexed as a tag (D1). The writer spells a group list canonically as
`@a, @b`, and a part's own bytes survive an edit to another part, as today. A
hand-written `@save,@skill` keeps its bytes until that part itself is edited.

**A layout file.**

```json
"modifierGroups": [
  { "name": "save", "label": "Saving throws" },
  { "name": "check", "label": "Checks" }
],
"components": [
  { "id": "saves", "type": "table", "groups": ["save", "check"],
    "rows": [{ "label": "Strength", "key": "str" }, ...] },
  { "id": "armour_class", "type": "card", "groups": ["dc"] }
]
```

Every key is optional and absent by default, so an existing layout parses to the
same structure and serialises to the same bytes. A layout using groups needs the
plugin version that ships this: an older plugin reads `@save += 1` as a stray
definition name, which changes nothing and says so at the row, so the failure is
visible, not silent.

**Slots.** An unnamed member's slot (D5) is registered in the sheet's name table
and never written anywhere.

**Existing notes.** Untouched until a reader writes a group target. Removing a
group from the layout, a row from a group, or a row from the layout leaves every
cell in the note exactly as it was, rendered and reported (D7). Renaming a
group's `name` strands the cells naming the old one, reported at each row; its
`label` is free to change, since nothing stores it. A rename migration for group
names is not built (**Deliberately not doing**).

## Acceptance criteria

The parse:

- [x] `parse/modifier-cell.test.ts`: `@save += 1 as item when Worn` reads as a
      typed part whose target `groupsOf` returns `["save"]`; `@save, @skill
      += -1` returns both; `@save,  @save` returns one and round-trips its bytes;
      `@ += 1` is unfinished; `armour_class += 1` still returns null from
      `groupsOf`; every existing cell fixture parses and spells byte for byte.
- [x] `@attack, armour_class += -1` is refused for that part with D1's sentence.
- [x] A part ending `where: Training == 0` keeps its bytes, contributes nothing,
      and the row shows D8's sentence; a note after it (`where: x note: y`) and a
      `when` before it both survive.
- [x] `readsAsAssignment('@save += 1')` is true, and a definition so named is
      reported in the definitions list.
- [x] `parse/modifier-groups.test.ts`: blank, repeated and unspellable names are
      reported; a non-list `modifierGroups` refuses the layout; and, in
      `components/member-groups.test.ts`, a non-list `groups` on a component
      refuses that component with D6's sentence.
- [x] A layout and a note with no groups anywhere round-trip byte for byte, and
      every existing sheet test's DOM and text are unchanged.

The walk:

- [x] `formula/modifiers.test.ts`: `@save += 1` reaches each of six keyed save
      rows' slots; each breakdown carries one line with `via: [save]`.
- [x] A group `item +1` and a named `item +2` on one member: the member totals
      +2 and lists the group line suppressed; the other members total +1.
- [x] `@save, @check` reaching a member in both groups contributes once, its
      line naming both groups; two different rows each pushing `@save += 1`
      untyped both apply.
- [x] An unreadable amount on a group part refuses every member's slot, naming
      the row; a member that does not accept `in Training` is listed not reached
      while the rest are set.
- [x] An undeclared group and a declared empty group each contribute nothing,
      throw nothing, and produce D7's sentences on the row's outcome.
- [x] Shuffling the push order leaves every member's total unchanged.

Membership:

- [x] `components/member-groups.test.ts`: a row's own list adds to the
      default, repeats dropped; an absent or empty own list leaves the row in
      the default alone; `inheritGroups: false` leaves the row in its own list
      alone, and with no list in no group; adding a group to the default
      reaches a row that has its own list.
- [x] `contract.test.ts`: every component declaring a `groups` config field
      publishes `groups` on its entries (or `unnamed`) for its sample config,
      and no other component does.
- [x] Table: two character rows both labelled `Longsword` in default group
      `attack` get two distinct slots; deleting the first leaves the second's
      total unchanged; `attacks.Longsword` still fails as an unknown name; a row
      in no group still reads `mod.self` as 0.
- [x] A Table with row groups and no published column draws D4's report in the
      editor and contributes no members.
- [x] Card, Card set entry and Roster row each join a group, and a group change
      reaches them with mark and breakdown.

The surfaces:

- [x] The modifier form and the definitions Changes select list a **Modifier
      groups** optgroup first; with no groups declared both draw today's
      options exactly.
- [x] Choosing a group draws the chip list; adding a second writes `@a, @b`;
      removing the last returns the select to blank; an undeclared group in a
      cell draws as a `(not declared)` chip.
- [x] The source row's popup and `title` draw D10's reach line, with the count
      and first exception.
- [x] The editor's **Modifier groups** list draws each line's member count with
      the member labels in its `title`, the empty and open-rows-only sentences,
      and each component's dangling report.
- [x] The `rows` and `entries` editors draw a groups control per row. On a
      Table or Roster row the inherited groups draw as faint chips with no
      remove control beside the row's own; turning **Same groups as the table**
      off writes `"inheritGroups": false` and hides them, and turning it on
      removes the key; removing a row's last own group removes `groups`.
- [x] A paste of a component naming groups the target lacks lists them in the
      `Notice`.
- [x] Every new string reads in sentence case and American English, and the
      chip list and **Add a group** select meet `docs/UI.md` §6 (accessible
      names, keyboard removal of a chip) and §7 (touch target size).

The harness and the vault:

- [x] The seven harness shots under **Harness views** show what that section
      says each holds, in both themes.
- [x] **The vault fixture**, so a clone can rebuild it: a new
      `Sheetsmith layouts/Group target variations.sheetsmith` holding
      - `modifierGroups`: `save: Saving throws`, `skill: Skills`, `attack:
        Attacks`, `check: Checks`, `dc: Defences`, `dex_based: DX-based`;
      - `saves`, a Table labelled `Saves`, row groups `save`, six declared rows
        `Strength`…`Charisma` keyed `str`…`cha`, a `Bonus` computed column
        `prof + mod.self` with `publish` on;
      - `skills`, a Table labelled `Skills`, row groups `skill`, rows
        `Acrobatics` (own group `dex_based`, so it is in `skill` and
        `dex_based`), `Athletics`, and `Stealth` with `"inheritGroups": false`
        and no list of its own, so it is in no group, published as above;
      - `perception`, a Card labelled `Perception`, `derived: prof + mod.self`,
        groups `check`;
      - `attacks`, a Table labelled `Attacks`, open rows, row groups `attack`,
        a `To hit` computed column `prof + mod.self` with `publish` on;
      - `armour_class`, a Card labelled `Armour class`, `derived: 10 +
        mod.self`, groups `dc`;
      - `gear`, a Table labelled `Gear`, open rows, `Worn` toggle, `Modifiers`
        modifier column;
      - `conditions`, the Conditions palette entry.

      And `Characters/Groups.md` on that layout, holding: Gear's Cloak of
      Protection, Worn, `@save += 1 as item when Worn`; Gear's Ring of
      Strength Saves, Worn, `saves.str += 2 as item when Worn`; Attacks rows
      `Longsword` and `Longsword`; Conditions' Frightened, Active off,
      `@save, @skill, @attack, @check, @dc += -1 as status when Active`;
      Conditions'
      Bless, Active off, `@attack, @save += 1 when Active`; and a Gear row
      `Old charm` with `@saves += 1`.

      What to press, and what each shows, with Stealth out of every group
      from the start: on open every save but Strength reads one higher with a
      mark, Strength two higher, and Strength's breakdown lists the cloak
      suppressed `via Saving throws`. Old charm's popup says `"@saves" is not a
      modifier group this layout declares.` Turn Frightened on: the six saves,
      Acrobatics and Athletics, both Longsword rows, Perception and armour
      class drop by one, each breakdown naming its group, Stealth does not
      move, and Frightened's popup reads `Reaches 12 values`. Turn Bless on:
      the six saves and both Longswords rise by one, Bless's popup reads
      `Reaches 8 values`. Delete the first Longsword: the second keeps its
      numbers, and the two popups read `Reaches 11 values` and `Reaches 7
      values`. In the layout editor, add `check` to the Skills table's row
      groups: Acrobatics, which has a list of its own, gains it with Athletics,
      Stealth does not, and Frightened still reads `Reaches 11 values`, each
      skill reached once. Remove `skill` from the groups list: Frightened
      still reads `Reaches 11 values`, because the skills are reached through
      `check` now, and names `"@skill"` as not declared; the Skills table
      reports its dangling group, and the note is byte-identical. Undo
      restores the group. Turn **Same groups as the table** on for Stealth:
      Frightened reads `Reaches 12 values` and Stealth's number drops with the
      other skills; turn it off again to leave the fixture as found.
- [x] `npm run lint` (0 warnings), `npm test`, `npm run build`, `npm run harness`
      and `npm run harness:shot` pass.

The docs:

- [x] `docs/SPEC.md` gains §2 terms **Modifier group** (with its *Avoid*: not a
      Group, not a Record set's group, not the picker's optgroup) and **Group
      target**; §2 **Target** and **Modifier slot** name the group spelling and
      the unnamed slot; §4.1 `scopeValues` names `groups`, `unnamed` and
      `openGroups`; §4.2 Table, Roster, Card and Card set list `groups`; §4.2's
      clause order gains ` where:`; §5 states D3's expansion and D5's slot. The
      §13 entry gains its `Resolved:` paragraph at `/land-it`.

## Commit boundaries

1. `feat: Read modifier groups and the group target spelling`. `parse/modifier-groups.ts`,
   `groupsOf` and the widened `ASSIGNMENT` in `parse/modifier-cell.ts`, the
   reserved ` where:` clause read and spelled, the layout key, their tests.
   Nothing on the sheet moves yet.
2. `feat: Let a card or a row join a modifier group`. `components/member-groups.ts`,
   `ScopeEntry.groups`, `ScopeValues.unnamed` and `openGroups`, the `groups`
   config field on Card, Card set, Table and Roster, `publishedEntries` carrying
   them, the contract test.
3. `feat: Aim a modifier at a group`. The walk's expansion, the unnamed slots and
   their registration, the breakdown's `via` token, the row outcome's reach
   line, the refusals of D1, D7 and D8, their tests.
4. `feat: Offer groups in the target picker and the layout editor`. The
   **Modifier groups** optgroup, `group-chips.ts`, the line list, the per-row and
   per-entry controls, the editor's reports, the paste dependency, styles,
   harness views.
5. `docs: Document group targets`. `docs/SPEC.md` as listed under **The docs**,
   this spec's status.

## Deliberately not doing

- **Excluding a member from a modifier.** A modifier cannot say "every save but
  Strength" in v1 (ruling 3). A row leaves a group by not carrying it: by
  dropping it from its own list, or by `"inheritGroups": false` for its
  component's default.
- **Derived membership.** No group is defined by a formula, a stat or a column
  value, and "DX-based" is a fixed group on each row (ruling 3, D6).
- **Membership on the member's own data.** Jack of All Trades waits for the
  ` where:` clause, which v1 reads, keeps and refuses (D8).
- **Wildcards and path patterns.** No `saves.*`, no prefix match; a group is a
  name (ruling 1).
- **A built-in `all` group.** Every group is declared; Pathfinder 2e's `all`
  that does not reach every roll is the trap this avoids.
- **Members other than Card, Card set entries, Table rows and Roster rows.** A
  Roster's stat, a Pool, a Track, a Record set's record and a Passport field are
  not members in v1. Savage Worlds' Pace is a Card and is covered.
- **Levels, flags, buffers and dropdowns on unnamed members.** A group change
  `in <column>`, a grant or an option choice reaches named members only; an
  unnamed member is listed not reached with today's sentence for an unnamed
  row.
- **Roll-time application.** There is no roll; a group lands in the number.
- **A rename migration for group names.** Renaming a `name` strands cells,
  reported at each row; the label is free to change.
- **Any change to bonus-type stacking or to any `docs/BACKLOG.md` row**, rows
  51, 64, 67, 105 and 146 included. The work routes through the shapes those
  rows describe without widening them.
