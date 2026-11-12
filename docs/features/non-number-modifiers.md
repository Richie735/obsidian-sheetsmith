# A modifier may set a level or a flag

Status: shipped
Board card: A modifier change may change a two-state flag or a `level` index, not only a number.

## Model question

This touches no question §13 already holds open. It opens one, recorded in §13 with
this spec: **whether a modifier may change a stored choice rather than a number,
and how a change names one.** The owner settled it before this spec was written.
What follows states the answer and the argument for it. The decisions the answer
left open are under **Decisions this spec takes** below.

**Today a modifier only does arithmetic.** `ModifierOperator` is `'add' | 'override'
| 'upgrade'` (`src/types.ts`), and every change ends as a number in a slot that the
target's own formula reads through `mod.self`. An override reaches a name only when
its formula mentions `mod.self` (`SELF_SLOT`, `src/formula/modifiers.ts`). A stored
ring or toggle has no formula, so nothing can reach it. The 5e Druid layout in the
throwaway vault shows the cost. Cat Form makes the druid proficient in Stealth, and
the layout fakes that as `operator: "upgrade"`, `amount: "mod(abilities.WIS.value) +
pb"`, `note: "Cat Form: proficient in Stealth"` on the Stealth number. The number
comes out right, the Training ring stays unmarked, and the amount repeats the
arithmetic the row's own formula already does.

**The answer, in five parts.**

1. **A change names a stored choice with a new `column` member.** `target` stays the
   row's existing published name (`abilities.stealth`), and `column` names a field on
   that row (`Training`). This is an address only a modifier uses. §5's names do not
   grow, so the depth rule stays as it is: §4.2 at "At most one column may publish",
   and §13's `.left` entry, both refused a third segment, and neither is reopened.
   `column` is a member of all three tiers (`ModifierChange`, `ModifierDefinition`'s
   flat spelling, `TypedEffect`). `contract.test.ts` holds that field list once, so
   the three cannot drift. A typed cell part spells it as a new clause.
2. **The note keeps the stored choice untouched.** The sheet works out the modified
   state at render time and draws it. No note is ever rewritten for it (§10).
3. **Only two operators apply: Sets (`override`) and At least (`upgrade`).** For a
   flag, At least means on beats off. Adds to is refused. The amount is still an
   expression. It must come to a level position or to `true`/`false`.
4. **The ring draws the modified state**, with the same kind of mark and door a
   modified number gets. A stored value is marked wherever a change points at it,
   because the `mod.self` test for marking (§13's resolved narrow-set entry) means
   nothing for a value that no formula produces.
5. **Formulas read the modified state.** On a row, `Training` means the modified
   level, so Cat Form needs one change and the row's own `stat + Training * pb +
   mod.self` does the rest.

**The contract grows, and the growth passes §4.1's rule.** Only a Table knows that
its column `Training` is a three-step level and its column `Qty` is a number. So a
component says which of its stored choices a change may set, beside the names it
already publishes. It does this through two optional members on `ScopeEntry`, the
way `left` was added. It does not add a member to `ComponentDefinition`. Without
them, code outside the component would have to know that component's columns.

**What it publishes.** No new names. Each name it already published is still there.
Two names now carry the modified state:

- The bare name of a published flag or level. Examples: a flag Track's
  `inspiration`, a checklist's `armour.heavy`, and a Table row whose published
  column is itself a `level` or `toggle`.
- A row's own scope, for each `level` or `toggle` column a change may set on a row
  that has a published name.

`<name>.value` keeps reading what the note stores, as §4.1 says it always does.

**Storage.** Nothing new is stored in a note. A layout definition gains an optional
`column` key. A typed cell part gains an optional ` in <column>` clause. A
definition or cell with neither keeps its bytes and its meaning, so every existing
file still round-trips exactly (Constraint 3).

**Existing notes.** Untouched. The modified state is computed and never written, so
no layout edit can lose it, and removing the modifier gives back exactly what the
note says (Constraint 4).

## What it does

A modifier can now set a proficiency ring or a flag. Cat Form marks Stealth
Proficient, and Bless turns on a "blessed" flag. While the form is in play, the ring
draws the state the modifier set. The ring carries a mark and a door that open the
account, and every formula that reads the ring sees that state. The player's own
choice stays in the note, and the ring still edits that choice when pressed.

## Smallest version

Flags and levels only, addressed through `column` (or through the target alone for
a value that is itself a flag or level), and Sets and At least only. That covers a
one-segment Track, a checklist row, and a Table or Roster `level` or `toggle` cell
on a row that has a published name. **What it gives up:** text values (a Card's text
value or dropdown, Speed "30 ft."), Record set and Stat block fields (they publish
no names), a change that lands on every row of a Table, and stored numbers (a
`number` cell, a typed Pool ceiling).

## Design

### Decisions this spec takes

The owner's answer leaves these open. Each one is decided here, with the reason.

- **D1. A flag is a level with two positions.** Off is 0 and on is 1, so one fold
  covers both. Sets uses the highest of the Sets amounts, and At least raises the
  result to the highest of the At least amounts. This is §5's override-then-floor
  order applied to positions. Two Sets of opposite values give on, because on beats
  off.
- **D2. A flag's amount is `true`/`false` or `1`/`0`, and a level's must be a whole
  number on its list.** A flag takes both spellings because §13's Toggle-fold
  entry and §4.2 already read both spellings of a stored flag ("Both spellings are
  read on a run of any length"), so the amount reads what the note reads. Any
  other value is refused with D6's flag message. A level amount of `true` is
  refused, because a level is a position and the language gives yes and no no
  numeric meaning (§5, "A yes/no column is counted, not summed").
- **D3. Which values a change may set.**
  - A **flag Track**, whether one run or a checklist row, declares its own entry as
    a state. The change names it with `target` alone and no `column`.
  - A **Table or Roster row that has a published name** declares each of its
    `level` and `toggle` columns as an addressable state. The change names one with
    `column`.
  - **Where the published column is itself `level` or `toggle`**, the entry's own
    value is that state. It is named with `target` alone. A `column` that names it
    gets the stray sentence in D5, because one meaning gets one spelling.
  - **A `toggle` column with leftover `levels` is still a flag.** It stores a
    boolean and its names label nothing (`docs/features/level-list-reorder-report.md`
    §2).
  - A row with no `key`, or on a table with no published column, has no name. So
    nothing on it can be addressed, which is the every-row cut.
- **D4. The bare name is the modified state, and `.value` is the stored one.** Today
  a flag Track and a published stored column give the same answer under both
  spellings (§4.2 Track, §4.2 Table "the bare name and `.value` agree"). Under a
  push the two now differ. This is §4.1's own rule ("`<name>.value` always gets the
  stored value"), so it is a rule being applied and not a new one, but both §4.2
  sentences need amending.
- **D5. A column the target does not hold is shown as it is written, not
  corrected.** That is §5's rule for a push at a name the sheet does not publish.
  It is not a refusal. The row's popup and the layout editor's report say
  `Abilities · stealth has no level or flag called "Trainig".` A column that names
  the published state itself (D3) reads `Skills · stealth already is "Training", so
  this change needs no column. Clear it.`
- **D6. The refusals, each refusing the state the way one unreadable amount refuses
  a slot (§5).** Each sentence goes through `inRowMessage`, so it starts
  `Row "<label>": `. `<called>` is the existing `called()` wording: `the modifier
  "Cat Form"`, or `this row's own modifier`.
  - Adds to: `STATE_REFUSES_ADD` in `src/formula/modifier-states.ts`, which reads
    `Adds to cannot change a level or a flag. Choose Sets or At least.` and is the
    one spelling all three surfaces show: the sheet's row popup, the modifier form,
    and the layout editor's definitions report. Its fault, `Adds to cannot change a
    level or a flag.`, is `TEXT.stateRefusesAdd` in `src/en.ts`; the fix is
    composed from `OPERATOR_LABELS`, because the sentence-case lint reads the two
    operator labels mid-sentence as words out of case, and composing them from the
    labels also renames the advice with a renamed operator.
  - A level amount off the list: `"3" is not a level of Training, so <called> has
    no amount. Give it a level from 0 (Untrained) to 2 (Expertise).` One sentence
    states the range and the fix together. Where the target is its own state, the
    target's label replaces `Training`. Where the levels have no names, the last
    sentence reads `Give it a level from 0 to 4.` The numbers and names come from
    the list. A fraction is off the list (`"1.5"`). So is a boolean
    (`"true"`).
  - A flag amount that is none of `true`, `false`, `1` or `0`: `"2" is not true or
    false, so <called> has no amount. Give it true or false.` The shape of the
    existing `is not a number` sentence, closed with its fix as the level's is;
    `true or false` rather than all four spellings, since those are the two an
    author writes for a flag and `1`/`0` are read for the note's sake.
  - **The existing sentence stays byte for byte.** A boolean amount at an
    arithmetic target still reads `"true" is not a number, so <called> has no
    amount.` To keep that true, `settle` lets a boolean through only for an
    operator that `contestsByValue`, and the walk refuses it once it knows the
    target's shape. That keeps the target check in one place.
- **D7. A refused state publishes nothing that reads it.** The ring draws the stored
  state, and its door starts with the refusal sentence. A formula that reads the
  modified state fails with that sentence and draws `?`, for the reason §5 gives:
  a quietly wrong number is worse than a missing one. `.value` still resolves.
- **D8. At least on a level compares positions, so it assumes the list runs from
  low to high.** §4.2 already says `levels` "names the states from none upwards",
  and this is the first behaviour that depends on it. A list written high to low
  makes At least pick the lower grade. Reordering a level list is reported and
  never migrated (`docs/features/level-list-reorder-report.md`). That report now
  covers one more consequence: after a reorder, an At least amount names a
  different grade. The report's wording does not change (see **Deliberately not
  doing**).
- **D9. A note on a change that has a column is shown at its target, wherever the
  column points.** Notes are keyed by name and need no slot (§5), and one rule is
  simpler than two. Cat Form needs no note once its ring is marked, so the
  Druid fixture drops it.
- **D10. Every reading of a row reads the modified state, a column `total`
  included.** Part 5 of the answer settled that formulas read the modified state,
  and a total is a formula reading: it is published as a name the rest of the sheet
  reads. So a `total` on `Training` sums the modified levels, exactly as
  `count(skills, Training > 0)` counts them, and the two cannot disagree. §4.2's
  "the sum of the column's own values" now means the values as the rest of the
  sheet reads them. A row with no name cannot be pushed at, so for that row the
  stored and modified states agree. If a total over stored values is ever wanted,
  it is a `.value` reading, not the default.
- **D11. The form tint reaches a ring that a form in play set.** §8's rule is that
  "a value a form in play changed directly is tinted". A ring that Cat Form set
  has been changed directly, so leaving it untinted would break that rule. The
  tint fills and outlines the ring's row, as it does for a row whose number a form
  set.

### The engine (`src/formula/`)

- **The walk is still one walk, and states are a third reduction of it.** Today the
  walk produces contributions keyed by target, and two reductions read them: the
  slot, and the notes. A contribution with a `column`, or one aimed at a target
  whose entry declares its own `state`, is keyed by the pair (target, column)
  instead. It never reaches the slot, so `mod.<target>` and the number's breakdown
  are unchanged by a state push. There is no second walk, and nothing is evaluated
  twice. That is the property `modifiers.ts`'s header is built on.
- **The walk is handed the state shapes.** `buildModifierTable` gains the declared
  addresses: for each one, whether it is a flag, how many positions it has, and
  the word for each position. They are collected from `scopeValues(null, config)`,
  the same static source `publishedEntries` reads. The range check and the Adds to
  refusal happen in the walk, since that is where the shape is known.
  `resolveEnrolments` still knows nothing about targets.
- **One fold, in `src/formula/`, that imports nothing from `obsidian`.** It takes the
  stored state, the address's shape, and the reduced pushes, and returns the
  modified position, or the refusal. It reads the stored state exactly as the row
  scope reads it today (`typedValue`, or the flag's boolean), so a blank cell is 0
  and a missing flag is off.
- **Components reach the fold through a state reader.** It takes (name, column,
  stored) and returns the modified state, or throws the refusal as a
  `FormulaError`, the way a slot's thunk does. It reaches a component three ways,
  each optional so that a component which declares no states compiles unchanged:
  1. As a second argument to `ScopeEntry.compute`.
  2. As a second argument to a `RowsSource` factory.
  3. On `RenderContext`, beside `resolveField`.

  The dev picks the names.
- **The bare name of an entry with its own `state` is folded by the name table.** No
  component code is involved. `<name>.value` is the stored value (D4).
- **`SheetModifiers` and `ModifierContext` gain the state addresses**, with their
  labels, for the pickers. `ModifierContext` also gains a breakdown for one
  address, which is what the door draws. `accepting` and `marked` do not change,
  because a state address is in neither set. Its mark rule is part 4 of the answer: marked
  wherever a change addresses it.

### The cycle case

Take a change whose `when` or amount reads the value it sets. Two examples are
`inspiration = true when !inspiration`, and a Stealth change whose amount reads
`abilities.stealth`. The row's formula reads the modified Training, and that is
what the change is setting. **Existing guards catch both, and no new guard is
added.** Which guard fires depends on the order things are drawn, the same as for
§5's arithmetic case:

- **Reached cold**, the walk evaluates the amount. That reads the name, the name's
  fold asks for the state, and the walk is already running. **The modifier walk's
  own guard** (`walking`, `buildModifierTable`) refuses it. Its sentence gains a
  spelling for a state, because `mod.<name>` names nothing here: `A modifier's own
  condition or amount reads "inspiration", which a modifier sets, and the
  modifiers on this sheet are still being worked out. Read the value as stored
  (inspiration.value) instead.`
  A change naming a `column` reads a row whose own name has no `.value` to fall
  back to, so its spelling is `A modifier's own condition or amount reads Training
  on "skills.stealth", which a modifier sets, and the modifiers on this sheet are
  still being worked out. Read a value no modifier sets instead.`
- **Reached warm**, after the name's thunk has started, **the sheet-wide name
  table's guard** fires. The enrolment is unreadable, and the state is refused
  with the row named.
- **The aggregate version**, an amount that reads `count(skills, Training > 0)` while
  setting one row's Training, is closed by **the row table's guard**
  (`formula/rows.ts`).

The fix the sentence offers, `.value`, is the stored state, which no push changes.
So it cannot loop.

### The ring (`ring-control.ts`, `level-ring.ts`)

- **The ring draws the modified state, and a press edits the stored one.**
  `bindRingControl` gains an optional way to turn a stored level into the drawn
  one. When it is given one, `level` stays the stored level: a click cycles from
  it, the arrow keys step from it, and `onSet` reports it. The painter, the
  `aria-pressed` state, and the level name in `aria-label` all use the drawn
  level. This is the Card pill's rule (§4.2: "every gesture acts on the second")
  applied to a control with no caret.
- **The mark is the account door.** It is the `info` glyph button already used for
  reading one value's account: a Track's breakdown door, a Pool's ceiling door,
  the note mark (`docs/UI.md` §9). It is drawn beside the ring and opens the
  shared popover with the account. A ring has no text to underline, and its press
  is already taken by editing, so the door here is the mark itself. This is the
  same argument the Pool ceiling made ("a door rather than a press on the number,
  because the numeral has no press of its own"). The door is drawn wherever the
  address has at least one line, applied or not. A change whose `when` is false
  lists nothing, as for a number.
  - **On a Track flag**, the door is the Track's own
    `.sheetsmith-track-modifier-button`, named `Modifiers on Inspiration`
    (`modifiersOnName`).
  - **In a Table cell**, the door is the glyph button inside the cell,
    after the ring. The column reserves its slot, the way `reserveNoteSlots` keeps
    a note column's values in line. That way a column of rings stays aligned
    whether or not a row is marked. It is named `Modifiers on Stealth · Training`.
  - **In a Roster row, the door sits at the row's end**, after the last value,
    in the note mark's slot, and there is **one door per row**. It is named for
    the row, `Modifiers on Stealth`. Its account is every ring on the row a
    modifier set, in column order — `Your own: Untrained`, its lines, `Now
    Proficient` — then each computed cell's account (its arithmetic lines and
    its notes) and any note at a ring's own name, each after a blank line.
    **Where the door carries more than one part, each opens with its column's
    name as a heading line** — `Training` above `Your own: Untrained`, its lines
    and `Now Proficient`; `Total` above the computed cell's lines — as a number's
    account heads its notes with `Notes`. A ring's notes belong to its part. A
    door with only one part has no heading. Where a column has no name, its key
    is the heading (`Prof` on the harness's Checks). Its
    description is the first set ring's `Set by a modifier; your own:
    Untrained`. A row whose Total a modifier changed but no ring keeps today's
    shape: the underlined number's press, and its note mark after it where it
    has notes. On a row with both, the Total keeps its underline and its own
    press, which opens its formula and its account, so the Total's lines are
    reached both ways there: the press is the number's (it says the formula,
    which the door does not), the door is the row's. The column keeps the slot
    in every other row's last cell (`reserveNoteSlots`, the door counted as a
    note mark), so the rings, the Totals and the doors each line up down a card
    whether or not a row has a door. Table keeps its door beside the ring for
    now; the 5e `skills` table draws it there.
- **The screen reader hears the drawn state, and is told the stored one when they
  differ.** `aria-pressed` (for a flag) or the level name in `aria-label` gives the
  drawn state. When the stored state differs, the button carries an
  `aria-description` of `Set by a modifier; your own: Untrained`. An unnamed flag
  uses `on` and `off` for its own state (`your own: off`). That is a word for a
  state that is *not* drawn, so §13's ruling that `aria-pressed` alone speaks for
  the drawn state still holds. When the two agree, the description is left off.
- **The ring's `title` gets the same sentence as a second line.** The long press on
  touch reads `title` (`docs/UI.md` §7), so a touch reader reaches it too. This
  overrides the one-tooltip rule in the one case where the ring is showing
  something other than the note's value, which is the case that rule leaves room
  for ("a word the glyph cannot draw").
- **Your own level is in the door's account.** Wherever the stored level differs
  from the drawn one, the account opens on `Your own: Untrained` — the level's
  name, its position on an unnamed list, `on` or `off` for a flag — and a blank
  line, before the change lines (The account, below). Stealth is stored
  Untrained, and Cat Form says At least Proficient: the ring draws Proficient,
  and the door opens on `Your own: Untrained`. A press steps the stored level to
  Proficient, the two agree, and the line goes. Nothing on screen stands for the
  stored level: a second mark was tried beside the ring and then as the door's
  face, and was withdrawn because it reads as a second toggle that does nothing.
  The door is the `info` glyph, always, and keeps its accessible name, `Modifiers
  on Stealth · Training`; while the two differ its `aria-description` reads `Set
  by a modifier; your own: Untrained`, the ring's own sentence, and is left off
  where they agree. The ring keeps its own description and `title` line. The door
  sits 2px after the ring and is positioned over the ring's outward hit reach,
  so a press on its first pixels is the door's. Table's, Roster's and Track's
  doors all carry it.
  - **A note at the cell's own name goes into the door's account**, after a blank
    line, and the cell draws no note mark: two `info` glyphs side by side in one
    cell would be two doors onto one value's account.
  - **A Roster card strip the layout can set a level or flag in keeps a floor of
    `max(12rem, calc(120px + 5.75em))`** rather than 12rem (`STATE_STRIP_CLASS`).
    With the door at the row's end, in the note mark's slot, it costs nothing in
    a card whose Total column already reserves that slot. Measured on
    `modifier-states-roster-card` with its Acrobatics note taken out, the
    narrowest door card at 12rem fits at Text default and scrolls sideways by
    9px at 20 and 32px at 24; with the note in, by 5px and 28px, which is what
    `release/0.10.0`'s card does with no door at all. The floor is 212px at 16,
    235px at 20 and 258px at 24: under the card's 221px at default, so two cards
    still share a line, and over its need at the two larger sizes, where each
    takes a line of its own. At phone width the card is a line of its own
    already and nothing scrolls. **Stamped from the layout's definitions**
    (`layoutSetsStateIn`): any change a definition aims at a level or flag in the
    strip, whatever its `when` and whether any row enrols it, so the cards keep
    one width as a form comes and goes (measured: 221px at default and 450px at
    20 and 24, with the form in play and reverted). What is left is the cut this
    draws: a change typed in a note does not stamp the strip, since a
    component's room is the layout's and a typed change comes and goes with an
    edit, so a card reached only by a typed change keeps 12rem and can scroll at
    20 and 24 by the slot's width.
- **A press opens nothing.** A press the ring
  does not plainly show — one that leaves the drawn level where it was, or draws
  another level than the one it set — says `Your own is now Proficient` to the
  live region, because §6 says "a commit that changes nothing on screen is
  announced".
  - *Weighed:* drawing the stored state while the ring has focus, which is the Card
    pill's focus rule. It was refused. A pointer press focuses the button, so the
    first click would jump the ring to the stored state and blur would jump it
    back. And tabbing through a row of rings would redraw each one without any
    press.

### The account (`modifier-breakdown.ts`)

- **A state line uses §9's line shape, with a position word in place of a number:**
  `Gear · Cat Form — at least Proficient`, `Bless — sets to on`. Here the row
  label is `Cat Form`, and the component token follows §9's rule exactly as a
  number's account does: named wherever the lines come from more than one
  component or the value is read inside a component with rows (`inRows`). So a
  Table or Roster ring's lines always carry it, `Gear · Cat Form`, and a Track
  flag's carry it only where its sources are several, `Cat Form — sets to on`.
  This is what keeps one spelling per source within a door that carries a ring
  and a Total: Insight's reads `Gear · Bulls strength — sets to Proficient` and
  then `Gear · Bulls strength — +1`. It reverses an earlier cut, which named the
  component only for several sources on the grounds that the door already names
  the row; with one door carrying both kinds of line, the two spellings read as
  two modifiers. The owner's example
  "Cat Form: at least Proficient" is the same line in §9's spelling. A flag's words
  are `on` and `off`, or its level names where a flag Track names them. The words
  come from the shape the caller hands over. The builder learns no component's
  vocabulary, as `MeasuredEffect.noun` already established.
- **The first line gives the stored state, where it differs from the drawn one:**
  `Your own: Untrained`, then a blank line. When they agree there is none, the
  measured-effect rule's "an effect of zero adds nothing".
- **The last line gives the drawn state alone:** `Now Proficient`. It said `Now
  Proficient; your own is Untrained` while the own level had no line of its own;
  with the first line naming it, the clause would say it twice. This takes the
  place of a number's `Total` line, because a state has no sum.
- **A refused state opens on its refusal and has no own line**, because a refusal
  draws what the note stores (`foldState`), so there is no second position to
  name. Were one ever to apply, the refusal would still come first: it ends with
  the fix, which is what the reader opening that door needs.
- **A push that changes nothing follows `docs/features/breakdown-measured-effect.md`,
  and no new rule is added.** Take an own level of Expertise with At least
  Proficient pushed. The line is listed `(not applied: already Expertise)`: a
  level names the grade it already is, where §5's `already higher` stays the
  wording on a number, which has no word for where it is; a flag reads `already
  on`. **The row's popup cannot say this**, because the row is not the state's
  and so does not know what the note stores: there a level or flag change is
  judged only against a higher change of its own operator — a lower Sets reads
  `a higher override applies`, and an At least the note already meets still
  reads as applying, leaving `already` to the ring's door. Held by
  `formula/modifier-states.test.ts`, "the row popup judges a state change
  against its own kind only". The last line is `Now Expertise`, with no own
  clause, which is decision 2's "an effect of zero adds nothing". The door is
  still drawn, because the value is addressed (part 4 of the answer).
- **A refused state starts the account with its sentence**, the way a `?` card's
  door starts with its own.

### Where it lands, by component

- **Track**: a flag card's entry, or each checklist row, declares `state`. The ring
  is bound with the drawn mapping, and the existing door carries the account.
  Nothing changes for a numeric run.
- **Table**: each row that has a published name declares `states` for its `level`
  and `toggle` columns, or `state` where the published column is one of those. The
  component's single row-scope builder (`rowScope`) applies the state reader for
  each declared column. Every reader of the row then sees one state: its computed
  cells on screen and in the draft, its published name, its row values, an
  aggregate over it, and a column `total` (D10). The total reads its rows through
  the same reader, so `total` and `sum()` cannot disagree. The ring cell draws the
  door.
- **Roster**: the same, through its own `rowScope`. This covers band rows and the
  `cardLayout` face.
- **Record set, Stat block, Card, Card set, Pool**: unchanged. They declare no
  states.

### The pickers (`modifier-form.ts`, the layout editor's definitions field)

- **The Value select gets a third group, `Levels and flags`**, after `Takes
  modifiers` and before `Notes only` (`fillTargetOptions`). Each option is labelled
  with the target's label and then the column: `Abilities · stealth · Training`.
  A flag that is its own state shows the target's label alone. The option's value
  holds both halves. How it is encoded is the dev's choice, as long as no target
  name or column key can collide with it. As now, the group is left out when it
  would be empty, so a layout with no states draws exactly the list it draws
  today.
- **When a state is chosen, the Operator select offers only Sets and At least.**
  Adds to is left out rather than disabled, because nothing can make it valid for
  a state. Moving an existing `add` change onto a state switches it to Sets; the
  sheet's form announces `Operator Sets` through the card's live region, and the
  layout editor, whose list fields announce nothing, switches it and redraws the
  Operator select showing Sets. The bonus type and phase controls are hidden, as they
  already are for an operator that `contestsByValue`.
- **Amount stays an expression field, with a position legend under it** that says
  what each number means: `0 Untrained · 1 Proficient · 2 Expertise`, or `true on ·
  false off`. This uses the **Shown when** legend's spelling
  (`docs/features/conditional-field-visibility.md`) rather than a new one.
  Level-name constants are still refused (§13).
- **The editor's hidden Bonus type and Applies to pair keeps its width and gives
  up its height** in the Modifiers list (`styles/editor.css`,
  `.sheetsmith-detail-field-reserved`). Where the pair wrapped below Value,
  Operator and Amount, a Sets change reserved a whole empty row, the blank band
  under the position legend. The collapse applies to **every Sets change,
  numeric ones included**, since a Sets on a number hid the same pair and left
  the same band. An adjacent fix the owner asked for, not a state rule.
- **The definitions report lists**: an `add` aimed at a state (D6's sentence), a
  column the target does not hold, and a column that names a published state (both
  D5). A definition with none of these reports nothing new.

### Empty and error states

- **No push**: the ring is exactly as it is today, with no door and no description.
- **A push whose `when` is false**: nothing is listed and no door is drawn, as for
  a number.
- **A push that changes nothing**: the door is drawn, and the account names the
  level it already is, `already Expertise`.
- **A refused state**: the ring draws the stored state, the door starts with the
  sentence, and formulas reading it show `?` (D7).
- **A stray column**: nothing at the ring. The row that wrote it says so (D5).

### Harness views

- **`modifier-states`** also holds a PF2e five-level `Ranks` table (Untrained,
  Trained, Expert, Master, Legendary) whose three rows a push sets to Legendary,
  with the reader's own at Trained, Expert and Master, so each door's account is
  seen naming three middle levels apart.
- **`modifier-states`**: a skills Table and a Roster band where one ring is raised
  by At least, one is already higher, one is set by Sets and one is refused, plus a
  flag Track turned on by a push. Shot as `modifier-states-light.png`,
  `modifier-states-dark.png`, `modifier-states-forced-colors.png` and
  `modifier-states-phone.png`.
- **`modifier-states-cycle`**: one Stealth ring, stored Untrained, under Cat Form's
  At least Proficient, pressed three times in a row with each press shot. The
  states are: `press-1`, where the stored level goes to Proficient and the ring
  draws Proficient and the door's account has no own line; `press-2`, where the stored level goes to
  Expertise and the ring draws Expertise; and `press-3`, where the stored level
  wraps to Untrained and the ring draws Proficient, the account opening on `Your
  own: Untrained` again. No popover opens on any press. Shots `modifier-states-cycle-1.png`,
  `modifier-states-cycle-2.png` and `modifier-states-cycle-3.png`, light theme.
- **`forms-roster-band`**: gains a column change on Brown Bear,
  `checks.endurance >= 1 in Prof` (D11). That sample's Roster has no Stealth row,
  so the form in play makes the druid proficient in Endurance through its level,
  and the Endurance row is tinted like the band's other form-set rows while the
  tag stays on the band.
- The editor view: a definitions list holding a change aimed at a state.
- **`modifier-states-roster-card`**: the Druid's Dexterity and Wisdom cards in
  card layout, Cat Form a layout definition put in play from a Stat block, so
  Stealth's row is form-tinted beside its door, with a note at Acrobatics
  so a note mark sits after a number in the same card. Shot at Text default, 20
  and 24 and at phone width, each in light and dark, and in forced colors at
  default: the door, the Total and the ring sit inside the card and the card
  does not scroll sideways.
- **`modifier-states-own-door`**: Stealth's door opened on
  `modifier-states-roster-card`, stored Untrained under Cat Form (Thorne's
  state), the account opening on `Your own: Untrained`.
- **`modifier-states-row-door`**: Insight's Roster row on `modifier-states`,
  whose ring Bulls strength sets and whose Total it raises by 1, its one door at
  the row's end opened on the ring's lines and then the Total's.
- **`modifier-states-refused-door`**: Perception's door opened on `modifier-states`,
  the account starting with the refusal's sentence over the stored level.
- **`modifier-states-already-door`**: Arcana's door opened on `modifier-states`,
  stored Expertise under the Scholar's At least Proficient, the line reading
  `(not applied: already Expertise)`.
- **`modifier-states-form`**: the Lore row's modifier form open on
  `skills.investigation = 2 in Training`: Value `Skills · investigation ·
  Training`, Operator `Sets`, and the position legend under Amount.
- **`modifier-states-text-20`** and **`modifier-states-text-24`**: `modifier-states`
  at Text 20 and 24, where the doors keep their fixed-px box and the rings grow.
- **`editor-modifier-states-list`**: the layout editor's Modifiers list, Cat
  Form's two At least changes aimed at levels with the legend under Amount, and
  the numeric Sets changes (Plate armour, Mage armour) with their hidden pair
  collapsed.

## Config fields

None on any component. Two layout-file members gain an optional key, and the
pickers edit them:

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `modifiers[].column`, `modifiers[].changes[].column` | picked with **Value** | (part of **Value**) | Which level or flag on the row this change sets. Leave it out to change the value itself. |

## Data and file model

- **Layout file.** A definition, or one of its changes, may hold `"column":
  "Training"` after `target`. When it is absent, the definition means exactly what
  it means today. `MODIFIER_CHANGE_KEYS` gains `column`, so **Add change** carries
  it across when it converts a flat definition, and the parser's "ignored beside
  `changes`" report names it.
- **Character note.** A typed part gains one clause, ` in <column>`. Its place in
  the order is `target op [amount] [in column] [to result] [as type] [when cond]
  [note: text]`. Example: `abilities.stealth >= 1 in Training`. The parse finds it
  last, scanning from the right with `clauseAt`, so it is found after `to result`,
  `as` and `when` are taken off, and ignored inside parentheses. ` in ` is not a
  token in the expression grammar, so a well-formed amount cannot contain it. The
  one clash is an amount that reads a column whose heading is the word `in`, and
  `(in)` gets round it, the same hazard ` as ` and ` when ` already carry.
  `spellTypedEffect` writes the clause only when `column` is present. So every
  cell written before this keeps its bytes (Constraint 3), and an edit to one part
  still re-spells only that part.
- **A column key that cannot be spelled in a cell is refused when it is picked.**
  That is a key holding `;`, ` when `, ` as `, ` to `, ` in ` or ` note:` — ` in `
  because the clause is found from the right, so a key holding it would lose its
  head to the amount — with the
  sentence `"<key>" cannot be set from a row's own modifier, because a cell spells
  that word as a clause. Name the change in a modifier definition instead.` A
  definition can still name it, because JSON has no clause grammar.
- **Existing notes.** Nothing is written. A layout edit that removes the modifier,
  the column or the row leaves the note's stored choice as it was. The ring goes
  back to drawing it, and §10 holds by construction.
- **An older plugin.** A layout that uses `column` needs this version. An older
  plugin ignores the key and applies the amount to the row's number, so Cat
  Form's `1` would floor Stealth at 1. This is §5's precedent for `upgrade` ("A
  layout using it needs 0.9.0"). A cell with ` in Training` fails to parse as an
  amount on an older plugin and refuses its slot with a parse error. The release
  notes say so.
- **Renames.** A component id rename rewrites `target` as it does today. `column` is
  not a name, so it is left alone. Renaming a column key moves the note's cells but
  not a definition's `column`, which then becomes a stray (D5) that the editor
  reports.

## Acceptance criteria

The model, as tests:

- [x] `contract.test.ts`: the field-list case expects `target, column, operator,
      amount, bonusType, applies, when, note` on `TypedEffect`. `ModifierChange` is
      the same list without `when`. `MODIFIER_CHANGE_KEYS` matches the interface.
- [x] `parse/modifier-cell.test.ts`: `abilities.stealth >= 1 in Training` parses
      to target, operator `upgrade`, amount `1` and column `Training`, and spells
      back to the same bytes. A clause order with every clause present round-trips.
      Every existing case's expected parse and spelling is unchanged.
- [x] `parse/modifier-definitions.test.ts`: a flat definition and a `changes` entry
      that carry `column` round-trip byte for byte. A flat `column` beside a
      `changes` list is reported as ignored.
- [x] `formula/modifiers.test.ts` (or a new sibling for the fold): Sets and At
      least on a three-level column, covering:
      - stored below the push, stored above the push, and stored equal to the push;
      - two Sets on a flag, `true` and `false`, give on;
      - Sets then At least uses §5's order;
      - the result does not depend on walk order. This is the shuffle test §5
        asserts for numbers, run here too.
- [x] Each D6 refusal has a test named for it, and each asserts the exact sentence:
      `add` on a column, a level amount of `3`, a level amount of `1.5`, a level
      amount of `true`, and a flag amount of `2`. A flag amount of `1` sets the flag
      on and `0` sets it off, the same as `true` and `false`. The existing `"true" is not a
      number` sentence at an arithmetic target is asserted unchanged.
- [x] A test named for the cycle: `inspiration = true when !inspiration` is refused
      reached cold, through the walk's guard, with the state sentence. It is
      refused reached warm, through the name table's guard, with the row named.
      Neither order recurses. A second case covers the aggregate version through
      the row table's guard.
- [x] A test that a state push leaves `mod.<target>` and the number's breakdown at
      the row's published name byte-identical to having no push.
- [x] D4: with Cat Form applied, `abilities.stealth`'s row reads Training as 1.
      `inspiration` with `= true` resolves `true`, and `inspiration.value` resolves
      the stored `false`.
- [x] D10: a Table with `total` on its `Training` column, where one named row is
      stored `0` and set to at least `1`, publishes a total that counts that row as
      `1`. `count(skills, Training > 0)` counts it too, so the two agree.

The acceptance case, and the starter:

- [x] **The Druid case**, as a Roster test built from the Druid's `abilities`
      config: Stealth is stored `0`, and Cat Form is the single change `{ target:
      "abilities.stealth", column: "Training", operator: "upgrade", amount: "1" }`.
      With it applied, the Training ring draws Proficient, `abilities.stealth`
      equals `stat + 1 * pb` for the row, the row carries its door at its end,
      named `Modifiers on Stealth`, and the
      door's text is `Your own: Untrained`, a blank line, `Gear · Cat Form — at
      least Proficient`, a blank line, then `Now Proficient`.
- [x] **The starter rule**, as a Table test over `src/starters/5e.json`'s `skills`
      config, which is the `Training` level column and `Total` computed as
      `ability + Training * prof + mod.self`. The case is `skills.stealth >= 1 in
      Training` on a modifier row. The Total cell on screen, `skills.stealth`, and
      the ring all agree on Proficient. With an own level of Expertise, the ring
      draws Expertise, the line reads `(not applied: already Expertise)`, and the door
      is still drawn.
- [x] A Track test: `inspiration = true` draws the ring pressed, and the stored note
      line still reads `no`. The FitD checklist row `armour.heavy = true` does the
      same. Neither has a `column`.
- [x] A test for D3's published-state case: a Table whose published column is a
      `level` column is set with no column. A column naming it gets D5's second
      sentence.

The face, as tests:

- [x] `ring-control.test.ts`: with a drawn mapping, a click cycles the stored level,
      `onSet` reports the stored level, and `aria-pressed` or `aria-label` follow
      the drawn level. `aria-description` reads `Set by a modifier; your own:
      Untrained` only when the stored and drawn levels differ. `title` carries the
      same sentence as its second line.
- [x] `ring-control.test.ts` and `components/state-ring.test.ts`: the ring draws
      only the drawn level's letter, and the door is the `info` glyph; the
      account opens on `Your own: …` exactly while the stored level differs from
      the drawn one — a name, a position on an unnamed list, `on`/`off` for a
      flag — and its last line is the drawn state alone. A refused account has
      no own line. The door's `aria-description` says the stored level while it
      differs. A note at a door cell's own name is in the door's account and
      draws no note mark. A Roster row draws one door, in its last cell after
      the Total, named `Modifiers on Stealth`, whose account is the ring's lines
      under `Training` then the Total's arithmetic and notes under `Total`, and
      a door of one part carries no heading; one gear row giving both a ring's
      line and the Total's is spelled `Gear · Cat Form` on both, with the first set ring's
      description; every other row's last cell reserves its slot and the ring
      column reserves none; a row with no ring set keeps its Total's note mark. A Roster card strip is stamped from the layout's
      definitions alike with the form in play or not, and not by a typed change.
      The keyboard cycle through the view's rebuild asserts, press by press, the
      drawn level, the account's own line, the
      live-region line (`Your own is now Proficient` where the press is not
      plainly shown, nothing where it is) and that no popover opens.
- [x] `components/state-contract.test.ts`, the DOM half of the contract: for every
      registered component, each of its example and palette configurations that
      declares a `state` or `states` — and, since no Table or Roster example
      declares one, a named-row fixture for each of those two — draws the account
      door at every address a push reaches. A component that declares a state it
      does not draw fails here rather than in a view.
- [x] With no state push anywhere, every existing component test's DOM and text are
      unchanged. No expected string moves in `table`, `roster`, `track`,
      `modifier-breakdown` or `note-mark` tests.

The pickers:

- [x] The modifier form test: `Levels and flags` lists `Abilities · stealth ·
      Training`. Choosing it offers only Sets and At least, hides bonus type and
      phase, and shows the position legend. A layout with no states draws the
      Value select's existing groups unchanged.
- [x] The definitions field test: the report lists D6's `add` sentence and both D5
      sentences, and is silent for a definition with none of them.

The harness and the vault:

- [x] Harness: a new sheet view, `modifier-states`. It holds a skills Table and a
      Roster band where one ring is at least raised, one is already higher, one is
      set by Sets, and one is refused, plus a flag Track turned on by a push. It
      is shot in light, dark and `forced-colors`, and at phone width. In every shot,
      the door is in line down each column and the rings are in line whether or not
      a row is marked.
- [x] Harness: `modifier-states-cycle` draws its three presses as described under
      **Harness views**: `-1.png` the ring at Proficient, `-2.png` at Expertise,
      `-3.png` at Proficient again, the door the `info` glyph in each, and no
      popover in any of them. The keyboard cycle is
      `components/state-ring.test.ts`'s, since the shot script presses no key.
- [x] Harness: `forms-roster-band` gains Brown Bear's `checks.endurance >= 1 in
      Prof`. With the form in play, the Endurance row is tinted like the band's
      other form-set rows, and the tag stays on the band, which is one tag per
      placement (D11). `view/placement-decorations.test.ts` also asserts the
      ring's row is tinted, through `stateLinesIn`.
- [x] Harness: the editor view's definitions list shows a change aimed at a state,
      its Value reading `Skills · stealth · Training` and its Operator `At least`,
      with the position legend under Amount. A native `<select>` does not render
      open in a still, so the `Levels and flags` group and the Operator's missing
      Adds to are carried by `editor/modifier-definitions-field.test.ts` and
      `components/modifier-form.test.ts`, which assert both lists.
- [x] The throwaway vault: `5e Druid.sheetsmith`'s Cat Form loses its faked Stealth
      change. It gains `{ "target": "abilities.stealth", "column": "Training",
      "operator": "upgrade", "amount": "1" }` and has no note. `Thorne - Character
      Sheet.md` stores Stealth as Untrained (`| Stealth | 0 |`), which is the state
      that shows the push; the plugin never writes it. With Cat Form in play, the
      Dexterity card's Stealth ring draws Proficient, raised by the form, and the
      row's one door, after its Total, has an account that reads `Your own: Untrained`, a blank line, `<the Stat
      block's label> · Cat Form — at least Proficient` (`Wild Shape · Cat Form` in
      the harness), a blank line, then `Now Proficient`. Pressing the ring
      three times goes Proficient (the note now agrees, the own line goes),
      Expertise (the ring follows), then Untrained (the ring stays Proficient and
      the own line is back); no popover opens. This is the fixture recipe,
      so a clone can rebuild it.
- [x] `npm run lint` (0 warnings), `npm test`, `npm run build`, `npm run harness`
      and `npm run harness:shot` pass.

The docs:

- [x] `docs/SPEC.md` is amended:
      - §2's **At least** and **Typed modifier** entries;
      - §4.2's Track flag sentence and Table publish sentence (D4);
      - §4.2's typed-part clause order;
      - §5's "which names accept a modifier", with states accepted without a slot;
      - §4.1's `scopeValues` paragraph, for the two `ScopeEntry` members.

      The §13 entry gets its `Resolved:` line from `/land-it`.
- [x] `docs/UI.md` §9 names the state account's own first line and its last
      line, the note in the door's account, and the strip floor; the glyph ruling
      is unchanged.

## Commit boundaries

These are a plan for `/land-it`, not a schedule. The tree stays uncommitted through
the build and every round of findings. No commit carries a `Co-Authored-By`
trailer.

1. `feat: Carry a column on a modifier change`. The `column` member on the three
   tiers and `MODIFIER_CHANGE_KEYS`, the contract field-list case, the definitions
   parse, the cell's ` in ` clause and its spelling, and the round-trip tests. The
   engine does not read it yet.
2. `feat: Fold a pushed level or flag onto the stored choice`. The `ScopeEntry`
   state members, the walk's third reduction and shapes, the fold, the state
   reader, the bare-name fold in the name table, D6's refusals and `en.ts`
   message, the walk guard's state sentence, the Track, Table and Roster
   declarations and row-scope overlay, and the engine, cycle and starter tests.
3. `feat: Draw a ring a modifier set`. The drawn mapping in `ring-control.ts`, the
   door in Track, Table and Roster cells, the ARIA and `title`, the own line
   for the stored level, a Roster row's one door at its end, the Roster strip's floor, the state lines in `modifier-breakdown.ts`, and the contract's door
   check.
4. `feat: Offer levels and flags as modifier values`. The `Levels and flags` group,
   the operator restriction, the position legend, the column-spelling refusal, and
   the definitions report.
5. `feat: Tint a ring a form in play set`. The tint pass reads state lines
   (`view/placement-decorations.ts`) through the stamped name and column.
6. `test: Stage rings a modifier set`. The harness views `modifier-states` and
   `modifier-states-cycle` (with its three press shots), the `forms-roster-band`
   change, and the editor sample.
7. `docs: Let a modifier set a level or a flag`. This file at `built`, the
   `SPEC.md` amendments, and `UI.md` §9.

## Deliberately not doing

- **Text values**: a Card's text, a dropdown's chosen option, Speed "30 ft." read as
  "30 ft., 10 ft. climbing". This waits on §13's string-type entry, which records
  it as a third cost.
- **Record set and Stat block fields**: they publish no names, so there is nothing
  for `target` to name.
- **A change that lands on every row of a Table** (for example "proficient in every
  skill"): rows are addressed one name at a time.
- **Stored numbers**: a `number` cell, a typed Pool ceiling (§13's open Pool
  entry), and a value-phase override (deferred by `character-forms.md`). This
  feature builds the mechanism a stored number would use, but does not use it for
  one.
- **Adds to on a level** ("one grade higher"). It is refused, not defined.
- **A level-list reorder report that counts the definitions it affects.** D8 states
  the consequence, and the report's wording does not change.
- **Migrating a definition's `column` on a column-key rename.** It is reported as a
  stray (D5).
- **A visible own-state caption under a ring**, or any mark for the stored
  level. The door's account and the `title` cover it. This is the same cut `character-forms.md` made for "own,
  higher".
- **Overriding a single formula locally** (§13), and **renaming a target**
  (dropped by `modifier-notes.md`). Neither is touched.
