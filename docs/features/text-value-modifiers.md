# A modifier may choose a dropdown's option

Status: shipped
Board card: A modifier cannot change a text value (SPEC §13, the string-type
entry's third cost). Answer it without a string type: speed by layout, and a
modifier that sets a Card dropdown's chosen option.

## Model question

This spec answers a question §13 already holds open: **what a string type in the
expression language would unlock, and whether the first thing it unlocks is worth
it.** It answers the entry's third cost, recorded with
`docs/features/non-number-modifiers.md`: "a modifier cannot change a text value".
That cost names two cases. Speed `30 ft.` cannot be made to read `30 ft., 10 ft.
climbing`, and a dropdown's chosen option cannot be set by a modifier. The owner
settled the answer on 2026-11-13 as **B and C together**. This section states
that answer and argues for it. The decisions it left open are under **Decisions
this spec takes** below.

**The answer, in one line: the string type stays deferred.** Speed is solved by
how the layout is built, with no new code. A dropdown's option is solved by a
narrow mechanism that involves no strings. The change names the option with a
literal, and the modifier cell's grammar reads that literal. The expression
language never sees it.

### What the prior art says

Four findings shape the answer, and each is cited where it is used:

1. **Speed is a set of typed numbers, never an edited string.** Foundry dnd5e
   keeps one formula per movement type, plus hover and units, and grants a climb
   speed with Upgrade. pf2e's BaseSpeed names a type and a number. 5e 2024 says
   "If you have more than one speed, choose which one to use". PF2e gives each
   special type "its own Speed value".
2. **A value from a closed list changes by key or by step, never by text.**
   dnd5e's size is a closed key. An Override sets it and an Add shifts it (PR
   7035 added add, subtract, upgrade and downgrade, and PR 6456 judged multiply
   meaningless). 5e 2024's Enlarge says size "increases by one category".
3. **Where free text does change, only four operations exist: replace, append,
   template and set membership.** Foundry's ADD concatenates and OVERRIDE
   replaces. dnd5e has a `{}` template. A Set field takes ADD and `-`. No tool
   splices strings.
4. **Text the model cannot hold gets a display field that effects do not write.**
   dnd5e's `special` movement is one (PR 5804, issue 5238).

The traps this answer avoids:

- concatenation where arithmetic was meant (dnd5e 1233 "+11", 1134 "+21");
- a string ADD with no separator ("30 ft.10 ft. climbing");
- effect output that skips validation (Foundry 9468), which is why the literal
  is checked against the options at render;
- text that looks like a number and changes meaning (`parseInt("30 ft., 10 ft.
  climbing")` is 30);
- text built from a number going stale once it is stored, which is why the
  render-time fold is kept.

The pain points are dnd5e 933 (users called the move from a speed string to
integers a regression), 5602 (a language key silently stopped matching, which
D8 answers) and 6344 (an exact size hard-coded where a step was meant, which is
why Enlarge stays out of scope).

### B. Speed is typed numbers drawn as text, so a layout already answers it

A speed line is a **Card set "Speed" with one numeric entry per movement type**:
`walk`, `climb`, `fly`, `swim`. A grant is an At least on one entry:
`speed.climb >= 10 when Climb`. At least already gives "the highest of two grants
wins", which is dnd5e's Upgrade. "A climbing speed equal to your walking speed"
is `speed.climb >= speed.walk`. That is prior-art finding 1 applied as it
stands, and it needs no new code.

**Verified on this branch (2026-11-13)** with a throwaway sheet test: a Card set
`speed`, a Gear row whose Worn is on, and a hidden Computed reading
`speed.climb * 1000 + speed.walk`. The test was deleted afterwards. Its findings
are what the pattern below says:

- **The entry's formula has to be `derived: value + mod.self`.** With it, the
  pattern works. `speed.climb >= 10` draws 10 over a stored 0, and the entry's
  account reads `Ring — at least 10`, then `Total 10`. The published
  `speed.climb` is 10. Two grants of 10 and 20 give 20, and the 10's line reads
  `(not applied: a higher at least applies)`. `speed.walk += 10;
  speed.climb >= speed.walk` gives a walk of 40 and a climb of 40. A climb that
  follows a modified walk is not a cycle, because the two are different names.
- **`effective` alone does not work.** With only `effective: value + mod.self`,
  the At least shows nowhere, and the published `speed.climb` stays at the
  stored value. That is correct by §5: `effective` is the pill's display-only
  reading in the value phase, and an At least acts in the result phase on the
  published name, which is the `derived`. The pattern names `derived` for that
  reason.
- **An entry left blank does not take the grant.** When `climb` stores nothing,
  the derived draws `—` (§4.2's rule that a formula reading an empty `value` is
  blank), `speed.climb` does not resolve, and a formula reading it draws `?`.
  **The account under that `—` still says `Ring — at least 10`, then `Total
  0`**, which contradicts the face. So the pattern needs **0 stored for each
  movement type the character does not have**. The contradictory account is a
  defect in a surface that already exists, and this spec does not fix it. It goes
  to `docs/BACKLOG.md` as a row, and the owner accepted "store 0" as part of the
  pattern (2026-11-13). That row names this Card set speed pattern as the case
  that exposes the defect, so it is not read as cosmetic. The fix it records is
  a derived reading a blank `value` that gives way to a result-phase push at its
  name.

**The pattern, as §13 should record it:** a Card set with one entry per movement
type, `derived: value + mod.self`, `signed: false`, and 0 stored for each type
the character does not have. A grant is an At least on the entry. A speed equal
to another speed is an At least that reads the other entry. Drawing the set as
one line ("30 ft., 10 ft. climbing", unused types hidden) is separate work and
is deferred (see **Deliberately not doing**).

### C. A modifier may set a Card dropdown's chosen option, with no strings

**The mechanism.** A change gains an **`option`** member, a literal option value.
A change with `option` aimed at a Card dropdown sets that card's chosen option.
The fold follows `non-number-modifiers.md`:

- The fold is done at render, and the note is never rewritten (§10).
- The stored choice stays the reader's own, and the sheet says it in words.
- A press on the control still edits the stored choice.

**The case it serves is an absolute set from a form or a spell.** A beast form
sets Size to Large. Polymorph sets creature type to Beast. It does not serve
Enlarge: Enlarge is a step, so "Sets Large" is wrong for a Small character. The
acceptance case and the harness fixture use the form.

**Sets only. At least is left out (owner's amendment 1).** A dropdown's order is
just the order its author typed the options in. "Later wins" means nothing for
alignment, class or creature type. Size is the only ordered case, and the effect
it actually needs (Enlarge, one step up) is a step change. A step change stays
refused, just as Adds to on a level is already refused (non-number-modifiers D6).
Adds to on an option is refused too. So **this feature uses no option order
anywhere**, which also decides D5.

**Why a literal and not an expression.** The language has no strings, so no
expression can name `Large`: `size = Large` reads `Large` as a name and fails.
This is §4.2's own example (`race == Elf`). The owner chose option 3: the option
is named by a literal carried in the change. The modifier cell's grammar reads
it, and the expression language does not.

**Why the literal is not the level-name constant §13 refused (owner's amendment
3).** The conditional-field-visibility resolution refused "a derived identifier
per level", because it "would invent a second naming scheme that either
forecloses this entry's answer or duplicates it". A literal in a modifier change
is a different thing, on all four counts that refusal turned on:

1. **It publishes no name.** A level-name constant would have been an identifier
   in §5's namespace, which every formula could write. The literal is text in one
   member of one record. No formula, condition or `derived` can read it, and the
   name grammar does not grow. Nothing exists for a future string type to collide
   with or to duplicate.
2. **The cell grammar reads it, the way it already reads `[note: …]` and `in
   <column>`.** A note is text after ` note:` and a column is a key after ` in `.
   Neither is ever handed to the tokenizer (`parse/modifier-cell.ts`).
   `option:` joins them. The literal is closest to `column`. `column:
   "Training"` is already a literal in a change that names a key the layout
   declares, and `option: "Large"` names a value the layout declares in the same
   way. That makes it an **address**, not a value in the language.
3. **It forecloses nothing.** If the language gains strings, an `amount` that
   evaluates to a string could later choose an option too ("choose the option
   the class card names"). `amount` stays the expression and `option` stays the
   literal, so the two never compete for one spelling. A string type would make a
   computed choice possible, and the literal would still be the spelling for a
   fixed one.
4. **It does not trade a silent failure for a loud one, because the silent
   failure never existed.** A level stores a position, so reordering its list
   silently changed what a condition meant. An option stores its **value**
   (§4.2: "only the value is ever a name"), and this feature reads no order. So
   reordering options changes nothing. Renaming a value is loud, because the
   literal is checked against the list on every render (D4, D8).

**The literal lives in the change, wherever the change is declared** (owner's
amendment 3). Modifier definitions are declared in the layout, and typed effects
in a note's rows. So `option` is a member of all three tiers: `ModifierChange`,
`ModifierDefinition`'s flat spelling and `TypedEffect`. A typed cell part spells
it as a clause. `contract.test.ts` holds that field list once, and
`MODIFIER_CHANGE_KEYS` gains it, so **Add change** carries it across and the
parser's "ignored beside `changes`" report names it.

**The contract grows by one optional `ScopeEntry` member, `choice`**, beside
`state`, `states` and `buffer`. Only a Card knows it is a dropdown, and which
options it offers (§4.1's rule). The existing `state` member was not used,
because `state` is reached by the target alone. Take a Training dropdown whose
derived reads `mod.self`: if it declared `state`, every change already aimed at
it with an amount would be captured. A choice is reached **only by a change that
carries `option`** (D1). So every existing change keeps its meaning.

**What it publishes.** No new name. A dropdown Card's bare name now reads the
**chosen option** (its value), and `<name>.value` reads what the note stores,
which is §4.1's rule. The card's `derived` reads the chosen option as `value`
(D6).

**Storage.** Nothing new goes in a note's data. A layout definition gains an
optional `option` key. A typed cell part gains an optional `option:` clause in
the amount's place. A definition or cell with neither keeps its bytes and its
meaning, so every existing file still round-trips exactly (Constraint 3).

**Existing notes.** Untouched. The chosen option is computed and never written,
so taking the modifier off gives back exactly what the note says (Constraint 4).

## What it does

A form or a spell can now choose a dropdown's option. Wild Shape's Brown bear
sets Size to Large and creature type to Beast. While the form is in play, the
Size card draws Large with the modifier mark, and the card's door opens an
account that starts `Your own: Medium`. Every formula reading `size` sees Large.
The note still says Medium, and pressing the card still edits that. A speed line
with a climbing speed is a Card set of numbers whose entries take At least, and
it already works.

## Smallest version

Sets on a Card dropdown's option, named by a literal `option` on all three tiers,
folded at render, with door, account and pickers; the speed pattern written down
and pinned by a test. **It gives up:** At least and step changes on an option
(Enlarge), every other closed list, free text of any kind, and drawing a speed set
as one line.

## Design

### Decisions this spec takes

The owner's answer leaves these open. Each is decided here, with its reason.

- **D1. A chosen option is reached only by a change that carries `option`.** The
  address is (target, choice). A change with no `option` aimed at a dropdown's
  name means what it means today: an amount aimed at the card's slot, which its
  `derived` reads through `mod.self`. So a Training dropdown valued `0, 1, 2`,
  whose derived reads `value * pb + mod.self`, keeps every change already written
  against it. The address is set by the change's own words, not by the target's
  shape, which is §13's modifier-notes argument ("never overload the amount").
  Six tools give a non-numeric effect its own field.
- **D2. What declares a choice.** A **Card with options whose value is shown**
  declares `choice` on its bare entry. The choice carries the option values in
  list order, each one's label, and the card's label. Nothing else declares one:
  - a Card with no options (a free-text or number card);
  - a dropdown with `hideValue`, which draws no control and so has nowhere to
    show what was chosen or to carry the door (`configName` already calls it a
    Computed);
  - a Card set, which has no options;
  - Table, Roster, Record set, Stat block, Passport, Track and Pool.
  A dropdown whose own config is refused (two options sharing a value, an
  option with no value) publishes nothing, as today, so it declares nothing.
- **D3. Only Sets chooses an option. Adds to and At least are refused, with one
  sentence each.** Each goes through `inRowMessage` (`Row "<label>": `). The
  fault is in `src/en.ts`, and the fix is composed from `OPERATOR_LABELS`, on
  `STATE_REFUSES_ADD`'s terms:
  - `Adds to cannot choose an option. Choose Sets.`
  - `At least cannot choose an option. Choose Sets.`

  Like any refusal, a refused operator refuses the choice (D7 of the
  precedent): the card draws the stored choice, the door opens on the sentence,
  and a formula reading the bare name draws `?`.
- **D4. The literal is matched exactly, the way a stored value is.** The literal
  is trimmed. Case is included, byte for byte, which is §4.2's comparison for a
  stored value against the options. **A literal that matches no option refuses
  the choice.** The card draws the stored choice, exactly as it draws a stored
  value missing from the options. The door opens on the sentence, and a formula
  reading the bare name fails with the sentence and draws `?`. A quietly wrong
  word is worse than a missing one, and validating effect output is the trap
  Foundry 9468 names. The sentence is:

  `"Chaotic Evil" is not an option of Alignment, so <called> chooses nothing.
  Choose Lawful good, Neutral good, Chaotic good, Lawful neutral, Neutral, Chaotic
  neutral, Lawful evil, Neutral evil or Chaotic evil.`

  The fix lists the option **values**, in list order, since the literal has to
  spell a value. `<called>` is the existing `called()` wording, `the modifier
  "Brown bear"` or `this row's own modifier`. The layout editor's definitions
  report and the row's popup show the same sentence, because the literal can be
  checked before anything is evaluated. A level's amount, being an expression,
  cannot.
- **D5. Two Sets on one dropdown: a tie applies once, and a disagreement is
  refused.** For a level, the existing rule is §5's: the highest Sets wins and
  every other Sets is listed as not applied. "Highest" is an order. This feature
  uses no order (amendment 1), so the rule keeps only the half that needs none:
  - **Two Sets naming the same option tie.** One applies, and the other is
    listed `(not applied: another override of the same value applies)`, which is
    `suppressionWording`'s existing tie and unchanged.
  - **Two Sets naming different options refuse the choice**, with `Size is set to
    Large by Wild Shape · Brown bear and to Huge by Spells · Giant form, so
    neither applies. Turn one of them off.` The two sources are named in walk
    order, and the order changes only the wording, never the result. The shuffle
    test asserts that.
  - *Weighed and refused:* list order (amendment 1), walk order (the result
    would depend on the order the walk ran in, which §5's shuffle test refuses),
    the first declared (the same thing), and a priority member like Foundry's (a
    new member for a case no fixture has, deferred). A disagreement is rare in
    practice, because a Stat block's `exclusive` puts one form in play at a time.
    When one does happen, saying so beats silently picking a winner.
  - **Where SPEC records it:** `/land-it` writes this departure from the level
    rule into §5, right beside the existing Sets rule ("the highest Sets
    wins"), so a reader meets both rules together and does not take one for the
    other.
- **D6. The bare name reads the chosen option, `.value` reads the stored one, and
  the `derived` reads the chosen one.** This is §4.1's rule ("`<name>.value`
  always gets the stored value"), applied as the precedent's D4 applied it.
  §4.2's Card sentence "A chosen option publishes its value" now means the chosen
  option once modifiers have had their say. **What that means without strings:**
  the bare name carries what the option value is. A dropdown valued with numbers
  and labelled with words (§4.2's `2` labelled "Expertise") is read by
  arithmetic, so Size valued `0`–`5` and labelled Tiny–Gargantuan makes `size >=
  3` true in Brown bear form, and a carrying-capacity formula sees Large. A
  dropdown valued with words publishes a word. A formula can compare it with
  nothing and add nothing to it, today or under a modifier, so for such a card
  the change shows only on screen and in the account. That is a cost of the
  deferral, not of this feature, and the §13 entry already records it. The
  derived reads the chosen option because the card's derived is the bare name's
  value (§4.2), and the precedent's D10 already ruled that every reading reads
  the modified state.
- **D7. A target that cannot take an option: the change is refused, and the
  target keeps its value.** A change with `option` aimed at a name that declares
  no `choice` (a free-text Card, a number Card, a hidden-value dropdown, a Card
  set entry, a Pool, any row) changes nothing and is said where the change is
  written: in the row's popup and in the layout editor's report.
  - `Speed shows no options, so this change has none to choose. Give it an amount
    instead.`

  It is the precedent's D5 **stray**, not its D7 **refusal**. Refusing the
  target would let one row's mistake blank a card that the change never
  addressed. "Shows" is meant: a hidden-value dropdown has options and shows
  none. Two neighbouring cases, also strays:
  - a `column` on a change with `option`: `Size is a dropdown, so this change
    needs no column. Clear it.`
  - an `amount` beside `option`, which only a definition can spell, since a
    cell puts both in one place: `This change has both an amount and an option,
    so the amount is ignored. Clear one.` The change is read as an option change,
    on the parser's "ignored beside `changes`" precedent: the author's bytes stay
    (§10).
- **D8. Renaming an option's value does not carry the literal. The literal is
  reported (D4), not migrated.** Four reasons:
  1. **The note does not migrate either.** §4.2 rules that "renaming a value …
     leave[s] every note holding what it held". If a definition's literal moved
     while every note's stored choice stayed, the two would disagree about what
     the old value means.
  2. **The editor cannot tell a rename from a replacement.** An option's value is
     a text cell in the **Options** list, with no rename gesture behind it. Card's
     `key` has `addressesEntry` and moves stored values, and options do not. So
     "carry it on rename" would be a guess.
  3. **A literal in a note row could only be carried by rewriting notes**, which
     this feature refuses. Carrying the layout tier and not the note tier would
     make the two tiers behave differently over one edit.
  4. **The prior-art failure is a silent one** (dnd5e 5602: a language key
     stopped matching and nothing said so). D4's check makes this one loud in
     three places: the editor's report the moment the value changes, the row's
     popup, and the card's door.

  This is the precedent's D5 for a renamed column, applied to a value.
- **D9. The control draws the chosen option, and focus puts the stored one back.**
  This is the Card pill's rule (§4.2, "at rest the effective number, under a
  caret the number you typed, and every gesture acts on the second"), **not** the
  ring's.
  - The `<select>`'s value at rest is the chosen option. On focus it becomes the
    stored choice: the stored value's line, the `—` line where nothing is
    stored, or the stray line where the stored value is not among the options.
    On blur it goes back to the chosen option.
  - The menu therefore opens on the reader's own choice, and choosing a line
    writes that line as the stored choice, as today.
  - **Why the pill's rule and not the ring's:** a closed `<select>` takes arrow
    keys in some browsers and changes its value without opening. Left on the
    chosen option, one arrow press would write the option *after Large* as the
    reader's own, which is the pill's own data argument ("one press of the up
    arrow would commit 18 as the character's *stored* Strength"). The ring
    refused the focus swap because a click on a ring both focuses and presses,
    so the ring would jump before it cycled. A select's click focuses and then
    opens the menu, and that menu should open on the stored choice. Tabbing past
    a modified card does redraw it, which the pill already does.
  - **A press that changes nothing on screen is announced** (§6): choosing Small
    while Brown bear holds Large writes Small, and the select's blur draws Large
    again. The component's live region says `Your own is now Small`, the
    precedent's sentence.
  - **The painted mark is the ceiling's 2px dotted rule in `--text-muted`, under
    the select's text**, and never the underline, because the select's press
    edits. This is the Pool temp pill's ruling (`docs/UI.md` §9, "never the
    underline, since the pill's press edits"). It is drawn wherever a Sets
    line is listed, applied or not, so the mark does not jump as a tie or a
    refusal comes and goes. A refused choice draws the rule too, because its
    door is what explains it.
  - **The select's `aria-description` and `title` say `Set by a modifier; your
    own: Medium`** while the two differ. Where the stored value is a stray, the
    `title` keeps `STRAY_TITLE`'s sentence too, as its first line. Where nothing
    is stored, the words are `your own: nothing chosen`.
- **D10. The door is the read-only account's `info` glyph, at the end of the
  card's label line, in the note mark's slot.** It is named `Modifiers on Size`
  (`modifiersOnName`), and it is drawn wherever the choice lists a line or is
  refused. **A note at the card's own name goes into the door's account** after
  a blank line, and the card draws no note mark: two `info` glyphs side by side
  would be two doors onto one value's account (the precedent's ruling). Where
  the card also has a derived whose arithmetic was pushed at, the derived keeps
  its underline and its own press, and the door carries the choice's part under
  the heading `Option` and the derived's under `Total`. That follows the Roster
  row's rule, which heads a door's parts only when it carries more than one. The
  door's `aria-description` repeats the select's while the two differ.
- **D11. The account follows the state account's shape, with the option's
  label as its word:**

  ```
  Your own: Medium

  Wild Shape · Brown bear — sets to Large

  Now Large
  ```

  The labels are display, so the account uses them. The literal names the value,
  so a refusal's fix uses values (D4). A stray stored value is named raw, as
  the dropdown names it. Nothing stored reads `Your own: nothing chosen`. The
  own line is left out where the two agree. A refused choice opens on its
  sentence and has no own line. The component token follows §9 exactly as for a
  number.
- **D12. The form tint reaches a dropdown a form in play chose.** §8's rule is
  that "a value a form in play changed directly is tinted". The card is
  filled, outlined and tagged as for a number a form set.
- **D13. A Stat block reads an option change as one of the form's vitals.**
  `setsOneNumber`'s argument is that an `=` on a component's own value "is one of
  the form's stats, as HP and Speed are". Size is one of a beast's stats, so an
  option change aimed at a component's own value is a tile: `Size` over `Large`
  (the option's label). In the list and the row's words it reads `Size sets to
  Large`. A refused option change stays in the list with its reason, as a
  refused number change does.
- **D14. The cycle case uses the existing guards, and no new guard is added.**
  Take a change whose `when` reads the bare name it chooses, as in `size = option:
  Large when size >= 3`. It is caught by the walk's guard when the walk is reached
  cold, and by the name table's guard when it is reached warm. Both use the
  precedent's state sentence unchanged: `… reads "size", which a modifier sets
  … Read the value as stored (size.value) instead.` `.value` is the stored
  choice, which no change moves, so following the fix cannot loop.

### The engine (`src/formula/`)

- **The walk is still one walk, and choices are a fourth reduction of it**,
  beside the slot, the notes and the states (the buffers sit with the states).
  A contribution whose change carries `option` is keyed by (target, choice) and
  never reaches the slot, so `mod.<target>` and the number's breakdown are
  unchanged by it. **The amount is never evaluated for such a change**: the
  literal is the amount. Its `when` is evaluated as for any change.
- **`buildModifierTable` is handed the choice shapes**, collected from
  `scopeValues(null, config)` like `stateTargets` and `bufferTargets`, by a
  `choiceTargets` beside them in `modifier-targets.ts`. The operator check (D3)
  and the literal check (D4) happen in the walk, because that is where the shape
  is known. `storedStateFault`'s counterpart for a choice gives the editor's
  report the same verdicts in the same order: stray (D7), operator (D3), no match
  (D4).
- **One fold, in `src/formula/`, which imports nothing from `obsidian`.** It
  takes the shape, the reduced lines and what the note stores, and returns the
  chosen option, the own value, the lines with their verdicts (D5), or the
  refusal. It probably lives in `modifier-states.ts` beside `foldState`, or in a
  sibling, as `PATTERNS.md` §1 decides at build time.
- **The name table folds the bare name of a `choice` entry**, with no component
  code involved, as it folds `state`. Where the Card has a `derived`, the derived
  has to read the chosen option, so the Card publishes it through `compute`
  handed the reader (the route `states` already takes) rather than through
  `display`. `ScopeEntry.choice`'s doc comment says which pairings are allowed: on
  an entry that publishes its `value`, either alone (folded by the name table) or
  with `compute` (folded by the component). **A test asserts that `accepting`,
  `marked` and the derived's slot are byte-identical across the move from
  `display` to `compute`**, because D1 depends on the card's numeric slot being
  untouched. The reader's spelling (a third argument, or `StateReader` under a key
  that cannot collide) is the dev's choice.
- **`SheetModifiers` and `ModifierContext` gain the choice addresses** with
  their labels and options, for the pickers. `ModifierContext` gains a choice
  account for one name, which the door draws.

### The card (`card.ts`, `card-face.ts`)

- `renderDropdown` gains the drawn value and the own-value words. The stray line,
  the `—` line and `STRAY_TITLE` keep their rules, with one change: the stray line
  is drawn for the **stored** value while the select is focused, and is present
  at rest only while the stored value is a stray (the select can then show it on
  focus).
- `onCommit` still reports the stored choice. The derived is computed from the
  chosen option, refolded against the newly chosen stored value before the
  commit is reported, so that the face paints before the change is reported
  (`PATTERNS.md` §5) and is right.
- The door, the rule, the ARIA, the `title` and the live line are as D9 and D10
  describe.

### The pickers (`modifier-form.ts`, the layout editor's definitions field)

- **The Value select gets a fourth group, `Dropdowns`**, after `Levels and
  flags` and before `Notes only`. Each option is labelled with the card's label
  (`Size`). As with the state group, the option's value is encoded so it cannot
  collide with a target name. The group is left out when it would be empty, so a
  layout with no dropdowns draws exactly the list it draws today. A dropdown whose
  derived reads `mod.self` also stays in `Takes modifiers`, because D1 makes those
  two addresses distinct, and the group heading tells them apart.
- **With a dropdown chosen, Operator offers only Sets.** A stored Adds to or At
  least is kept in the list, so the select shows what the change says while the
  refusal says why it does nothing, as `operatorsAt` already does. Moving a change
  onto a dropdown switches its operator to Sets and clears its amount. Moving it
  off clears its `option`. The sheet's form announces `Operator Sets` through the
  card's live region. Bonus type and phase are hidden, as for any operator that
  `contestsByValue`.
- **The Amount field becomes an `Option` select** over the target's options. It
  shows each option's label and stores its value. Its first line is a blank
  `—`, which is an unfinished change, as a blank amount is. A stored literal
  that matches no option is drawn as one extra last line, raw, with the `title`
  `Not one of this dropdown's options. The change keeps it until something else
  is chosen.` That is the card's stray rule applied to the change.
- **A value a cell cannot spell is refused when it is picked in a row's own
  form**, as `unspellableColumn` refuses a column. That is a value holding `;`, a
  line break, ` when `, ` as `, ` to `, ` in ` or ` note:`. The sentence is
  `"<value>" cannot be chosen from a row's own modifier, because a cell spells
  that word as a clause. Name the change in a modifier definition instead.` A
  definition can still name it, because JSON has no clause grammar.
- **The definitions report lists** D3's two sentences, D4's, and D7's three,
  and, for a change aimed at a dropdown and given no option, `"<name>" has no
  option, so it changes nothing. Choose one under Option.` (`"<name>" has no
  option for "<target>", …` where the definition names several changes), on the
  blank amount's own wording. A definition with none of these reports nothing
  new.

### Empty and error states

- **No change chooses**: the card is exactly as today, with no door, rule or
  description.
- **A change whose `when` is false**: nothing is listed and no door is drawn, as
  for a number.
- **A change choosing what the note already holds**: the door is drawn and the
  rule too, and the account has no own line. The line applies, because a Sets
  applies whatever the stored value is, and the last line is `Now Medium`.
- **Nothing stored, and a change chooses**: the select draws Large. On focus it
  shows `—`, and the account opens `Your own: nothing chosen`.
- **A stray stored value, and a change chooses**: the select draws Large. On
  focus it shows the stray line, and the account opens `Your own: Huge-ish`.
- **Refused (an operator, no match, a disagreement)**: the card draws the stored
  choice with the rule, and the door opens on the sentence. A formula reading the
  bare name draws `?`, and `.value` resolves.
- **A stray (D7)**: nothing changes at the target. The row that wrote it says so.
- **An option not yet chosen** (`—` in **Option**) keeps a blank amount's two
  meanings: on a row it is an unfinished change, which changes nothing and
  refuses nothing; in a definition it is the author's fault, reported (above),
  and it refuses the choice with `<called> has no option.`, so the card draws
  the stored choice with the rule and a formula reading the bare name draws `?`.

### Harness views

- **`modifier-options`**, a sheet holding:
  - **Size** (values Tiny to Gargantuan, stored `Medium`), chosen Large by the
    Brown bear form in play through a typed part on the form's modifier field,
    `size = option: Large`;
  - **Creature type** (Aberration … Undead, stored `Humanoid`), chosen Beast by
    the layout definition `Beast shape`, `{ "target": "creature_type",
    "operator": "override", "option": "Beast" }`, which the same form enrols;
  - **Alignment** (the nine, valued in sentence case, stored `Neutral good`),
    aimed at by a Gear row's `alignment = option: Chaotic Evil` when worn, so D4
    refuses it on case alone;
  - **Lifestyle**, a dropdown nothing aims at, as the control;
  - **Speed**, the B pattern: a Card set `walk 30, climb 0, fly 0, swim 0`
    with `derived: value + mod.self`, and Brown bear's `speed.walk = 40;
    speed.climb >= 30`.

  It is shot in light, dark, forced colors and at phone width.
- **`modifier-options-door`**: Size's door open, `Your own: Medium`, a blank line,
  `Wild Shape · Brown bear — sets to Large`, a blank line, `Now Large`.
- **`modifier-options-refused-door`**: Alignment's door open on D4's sentence.
- **`modifier-options-focus`**: Size focused by code, drawing `Medium`, with the
  dotted rule still under it. If `shot.mjs` cannot focus, this is carried by
  `card.test.ts` and the view is dropped.
- **`modifier-options-form`**: Brown bear's row form open on its size part:
  Value `Size`, Operator `Sets`, Option `Large`.
- **`forms-tint`**, extended or joined by a sibling: Size and Creature type
  tinted as cards the form set, with one tag per placement.
- **The editor view**: the definitions list holds `Beast shape`, with Value
  `Creature type`, Operator `Sets` and Option `Beast`. A native `<select>` does
  not render open in a still, so the `Dropdowns` group and the Sets-only
  operator are asserted by `modifier-form.test.ts` and
  `modifier-definitions-field.test.ts`.

## Config fields

None on any component. Two layout-file members gain an optional key, which the
pickers edit:

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `modifiers[].option`, `modifiers[].changes[].option` | picked with **Option** | Option | Which of the dropdown's options this change chooses, by its value. Only Sets can choose one, and the reader's own choice comes back when the change stops applying. |

## Data and file model

- **Layout file.** A definition, or one of its changes, may hold `"option":
  "Large"` after `amount`'s place, usually with no `amount`. When absent, the
  definition means exactly what it means today. `MODIFIER_CHANGE_KEYS` becomes
  `target, column, operator, amount, option, bonusType, applies, note`.
  `ModifierChange.amount` stays required in the interface and is `''` for an
  option change, as for a note-only change. `isNoteOnly`'s sibling for an option
  change is one predicate, shared by every reader (`PATTERNS.md` §1).
- **Character note, a typed part.** The literal takes the **amount's place**,
  after the keyword `option:`: `size = option: Large`, or in full, `size =
  option: Large when Wild note: Beast form`. The order is `target op [amount |
  option: literal] [in column] [to result] [as type] [when cond] [note: text]`.
  - **How it parses:** after the existing scans take off the note (from the left),
    `when`, `as`, `to` and `in` (from the right), the text left over is the
    amount. If it starts with `option:`, what follows, trimmed, is the literal, and
    the amount is `''`.
  - **Why that is safe:** `:` is not a character of the expression grammar, since
    `tokenize` throws on it, so no amount that parses can start with `option:`.
    Any cell holding that text today is already an unreadable amount. Its bytes
    are kept, and only its reading changes, from "unreadable" to "an option
    change". The bare word `option` is a legal name, which is why the colon is
    part of the keyword: this is `NOTE_CLAUSE`'s argument.
  - **How `;` and the other clauses coexist:** the literal holds no `;` and no
    clause word (refused when picked in a row's own form, as above). A cell has
    no escape, on `unspellableNote`'s argument that an escape would put this
    plugin's syntax into a file the user owns.
  - **Spelling:** `spellTypedEffect` writes `option: <literal>` in the amount's
    place, and only when `option` is present. An option change has no amount to
    write.
  - **Constraint 3:** every cell written before this has no `option:` at its
    amount's head, so it parses and spells exactly as before. An edit to one part
    still re-spells only that part.
- **Existing notes.** Nothing is written. A layout edit that removes the
  modifier, the option or the card leaves the stored choice as it was, and the
  card goes back to drawing it. §10 holds by construction.
- **An older plugin.** A layout that uses `option` needs this version. An older
  plugin ignores the key, reads a blank amount, and treats the change as
  unfinished: it changes nothing. That is the safe direction. On an older plugin,
  a cell's `option: Large` is an unreadable amount and refuses the target's slot,
  and a dropdown card reading `mod.self` draws `?` there. The release notes say
  so.
- **Renames.** A component id rename rewrites `target`, as it does today. An
  option **label** rename changes nothing, because the literal names the value.
  A **reorder** changes nothing, because order is unused. A **value** rename
  leaves the literal reported (D8).

## Acceptance criteria

The speed pattern (B):

- [x] A Card set test, `speed.climb >= 10 when Worn` on a Gear row, with the
      entries `derived: value + mod.self` and `climb: 0` stored: the climb card
      draws 10, `speed.climb` resolves 10, and the account reads `Ring — at
      least +10` then `Total 10` (one source, so no component token, as for any
      number on a card). A second grant of 20 gives 20, with the 10
      listed `(not applied: a higher at least applies)`. `speed.walk += 10;
      speed.climb >= speed.walk` gives 40 and 40. This pins the pattern, so a
      change that breaks it fails here.
- [x] `docs/BACKLOG.md` has a row for the blank-entry account (`—` over `Total
      0`). The row names the Card set speed pattern as the case that exposes the
      defect, so it is not read as cosmetic.

The model, as tests:

- [x] `contract.test.ts`: the field-list case expects `target, column, operator,
      amount, option, bonusType, applies, when, note` on `TypedEffect`.
      `ModifierChange` is the same without `when`, and `MODIFIER_CHANGE_KEYS`
      matches it.
- [x] `parse/modifier-cell.test.ts`: `size = option: Large` parses to target
      `size`, operator `override`, amount `''` and option `Large`, and spells
      back to the same bytes. `size = option: Large when Wild note: Beast form`
      round-trips. `size = option: Chaotic good` keeps its space. `size = option:`
      parses to an unfinished change. Every existing case's expected parse and
      spelling is unchanged.
- [x] `parse/modifier-definitions.test.ts`: a flat definition and a `changes`
      entry carrying `option` round-trip byte for byte. A flat `option` beside a
      `changes` list is reported as ignored. A change with both `amount` and
      `option` carries D7's sentence.
- [x] The fold, with a test named for each case: one Sets chooses; two Sets on
      the same value tie, with the existing tie wording; two Sets on different
      values refuse with D5's sentence, and the result is the same under the
      shuffle test; a Sets choosing what the note holds applies with no own
      line.
- [x] Each refusal has a test named for it that asserts the exact sentence: Adds
      to and At least (D3), a no-match literal including a case-only mismatch
      (D4), and the three D7 strays. A refusal draws the stored choice, and a
      formula reading the bare name draws `?` while `.value` resolves.
- [x] D1: a dropdown with `derived: value * 2 + mod.self` and a change `training
      += 1` keeps its numeric account exactly as before this feature. With
      `training = option: 2` also active, the derived reads `2 * 2 + 1`.
      `accepting` and `marked` are unchanged by the `compute` route.
- [x] D2: an option change at a hidden-value dropdown, at a free-text card and at
      a Card set entry is D7's stray in each case.
- [x] D6: with Brown bear active, `size` resolves the chosen value and
      `size.value` the stored one.
- [x] D8: renaming an option's value in the layout leaves the definition's
      `option` as written, and the editor's report shows D4's sentence.
- [x] D14: a test named for the cycle. `size = option: Large when size >= 3` is
      refused when reached cold and when reached warm, with the state sentence
      naming `size.value`, and neither order recurses.

The face, as tests:

- [x] `card.test.ts`: a modified dropdown's select value is the chosen option at
      rest. Focus sets it to the stored choice (`—` where nothing is stored, the
      stray line where the stored value is a stray), and blur restores the chosen
      option. Choosing a line reports that line as the stored choice. A choice
      that leaves the drawn option unchanged says `Your own is now Small` to the
      live region. `aria-description` and the `title`'s line read `Set by a
      modifier; your own: Medium` only while the two differ. The rule class is on
      the select wherever a line is listed. The door, `Modifiers on Size`, opens
      the D11 account. A note at the card's name is in the door's account and
      draws no note mark. A dropdown nothing aims at draws exactly today's DOM.
- [x] `components/state-contract.test.ts`, or its sibling for choices: every
      registered component configuration that declares `choice` draws the door
      wherever a change reaches it.
- [x] `view/placement-decorations.test.ts`: a dropdown a form in play chose is
      tinted (D12).
- [x] `stat-block.test.ts`: Brown bear's `size = option: Large` is a vital tile,
      `Size` over `Large` (D13).
- [x] With no option change anywhere, no expected string moves in the `card`,
      `modifier-breakdown`, `note-mark`, `modifier-form` or `stat-block` tests.

On a device:

- [ ] **D9's focus swap on an iPhone and an iPad, not only in Chromium.** On iOS,
      focusing a `<select>` opens the native picker at once, so the swap and the
      picker happen together. With Bear Form in play on the vault fixture:
      - the picker opens on the stored choice (Medium), not on Large;
      - choosing a line writes that line as the stored choice;
      - once the picker closes, the card draws the chosen option (Large) again,
        with the dotted rule.

      WebKit already draws selects differently on this sheet, so the Chromium
      harness proves nothing about this check, and the result is recorded with
      the device and OS version.

The pickers:

- [x] The modifier form test: `Dropdowns` lists `Size`. Choosing it offers only
      Sets, hides bonus type and phase, replaces Amount with an `Option` select
      over the labels, and draws a no-match literal as a stray last line. A layout
      with no dropdowns draws the existing groups unchanged. A value holding
      ` in ` is refused when picked, with the sentence.
- [x] The definitions field test: the report lists D3's, D4's and D7's sentences,
      and is silent for a definition with none of them.

The harness and the vault:

- [x] Harness: `modifier-options` as described under **Harness views**, shot in
      light, dark, forced colors and at phone width. The door sits at the label
      line's end on each modified card, and the dotted rule is under Size's,
      Creature type's and Alignment's selects and not under Lifestyle's.
      `modifier-options-door`, `modifier-options-refused-door` and
      `modifier-options-form` draw what that section says.
- [x] Harness: the editor view shows `Beast shape` with Value `Creature type`,
      Operator `Sets` and Option `Beast`.
- [ ] **The throwaway vault**, which is the fixture recipe, so a clone can rebuild
      it:
      - `Sheetsmith layouts/5e Druid.sheetsmith` gains a Card **Size** (`id:
        size`, options `Tiny, Small, Medium, Large, Huge, Gargantuan`) and a Card
        **Creature type** (`id: creature_type`, options `Aberration, Beast,
        Celestial, Construct, Dragon, Elemental, Fey, Fiend, Giant, Humanoid,
        Monstrosity, Ooze, Plant, Undead`).
      - **The Druid's Speed Card stays exactly as it is.** It is not converted
        to a Card set, and no definition aimed at `speed` is retargeted, so its
        existing shots and acceptance stay stable. The speed pattern has a
        fixture of its own (below).
      - **Bear Form** gains `{ "target": "size", "operator": "override",
        "option": "Large" }` and `{ "target": "creature_type", "operator":
        "override", "option": "Beast" }`.
      - **Cat Form** gains `{ "target": "size", "operator": "override", "option":
        "Tiny" }` and the same creature type change.
      - `Characters/Thorne - Character Sheet.md` gains `## Size` holding a fence
        with `value: Medium`, and `## Creature type` holding a fence with
        `value: Humanoid`. Nothing else in the note changes.
      - **What to press on Thorne:**
        1. Put Bear Form in play. Size draws Large under the dotted rule, and
           Creature type draws Beast. Size's door reads `Your own: Medium`, then
           `<the Stat block's label> · Bear Form — sets to Large`, then `Now
           Large`. Both cards are tinted with the form.
        2. Press Size. The menu opens on Medium. Choose Small. The card draws
           Large again, and the live region says `Your own is now Small`.
        3. Switch to Cat Form. Size draws Tiny, and the account's own line reads
           Small.
        4. Revert the form. Size draws Small, the note's own choice, with no door.
        5. In the layout editor, rename the option value `Large` to `large`. The
           definitions report shows D4's sentence on Bear Form, and with the form
           in play Size's door opens on it. Rename it back to `Large` when done.
      - **The speed fixture, a pair of its own:**
        `Sheetsmith layouts/Speed variations.sheetsmith` and
        `Characters/Speeds.md`, the note's `sheet-layout` being `Speed
        variations`. The layout holds:
        - a Card set **Speed** (`id: speed`) with entries `walk` (name `Walk`),
          `climb` (`Climb`), `fly` (`Fly`) and `swim` (`Swim`), `derived: value
          + mod.self`, `signed: false`, at a width of 2 columns and 2 rows with
          `sizing: fixed`, so its four cards sit two to a row at every width, a
          phone's included, rather than 3 + 1;
        - a Card set **Speed, effective only** (`id: speed_effective`), with the
          same entries, `effective: value + mod.self` and no `derived`, as the
          contrast case where an At least shows nowhere, at the same 2 × 2 and
          `sizing: fixed`, beside it;
        - a Table **Gear** (`id: gear`, `rowHeader: Item`, `openRows: true`)
          with columns `Worn` (`toggle`) and `Modifiers` (`modifier`);
        - a Card set **Blank** (`id: blank`) with the one entry `climb` (`Climb`)
          and `derived: value + mod.self`, the blank-entry case;
        - layout definitions: **Spider climb**, `{ "target": "speed.climb",
          "operator": "upgrade", "amount": "speed.walk", "when": "Worn" }`, and
          **Climbing boots**, `{ "target": "speed.climb", "operator": "upgrade",
          "amount": "20", "when": "Worn" }`.

        `Speeds.md` stores `## Speed` and `## Speed, effective only`, each a
        fence of `walk: 30`, `climb: 0`, `fly: 0`, `swim: 0`. `## Blank` is an
        empty fence. Its `## Gear` table has four rows. The two definitions
        carry `"when": "Worn"` as well, so every source is gated by its row's
        Worn:

        | Item | Worn | Modifiers |
        | --- | --- | --- |
        | Ring of climbing | yes | speed.climb >= 10 when Worn; speed_effective.climb >= 10 when Worn |
        | Climbing boots | yes | Climbing boots |
        | Boots of speed | yes | speed.walk += 10 when Worn |
        | Blank climb | | blank.climb >= 30 when Worn |
      - **What to press on Speeds:**
        1. As stored: Walk draws 40, from the Boots of speed. Climb draws 20,
           with Ring of climbing's 10 listed `(not applied: a higher at least
           applies)`. Speed, effective only draws a climb of 0, and no account
           names the ring.
        2. Add `Spider climb` to the Ring of climbing row. Climb draws 40, equal
           to the modified walk. Turn off Boots of speed, and Climb follows the
           walk down to 30.
        3. Turn the Blank climb row's Worn on. Blank's climb draws `—`, and its
           account reads `at least 30`, then `Total 0`. That is the defect the
           BACKLOG row records. Store `climb: 0` and it draws 30.
- [x] `npm run lint` (0 warnings), `npm test`, `npm run build`, `npm run harness`
      and `npm run harness:shot` pass.

The docs:

- [x] `docs/SPEC.md` is amended:
      - §2's **Typed modifier** entry and §4.2's typed-part clause order, for
        `option:`;
      - §4.1's `scopeValues` paragraph, for `ScopeEntry.choice`;
      - §4.2 Card, for the chosen option: "A chosen option publishes its value"
        and the bare name versus `.value` (D6);
      - §4.2 Card's "A dropdown never takes one", so it says the rule is about
        `effective` and that a chosen option is not one. Its reason was "a
        computed reading would be a word the list does not contain and the
        control could not round-trip its own choice". A chosen option is
        checked against the list (D4), and the focus swap keeps the round trip
        on the stored choice (D9).
      - §4.2 Card set, a sentence for the speed pattern (B);
      - §5's "which names accept a modifier", for choices reached by `option`;
      - §5's Sets rule ("the highest Sets wins") gains, beside it, D5's departure
        for a dropdown: a tie applies once and a disagreement is refused, so the
        two are read together.

      The §13 entry gets its `Resolved:` line from `/land-it` (text below).
- [x] `docs/UI.md` §9 gains a row for a dropdown a modifier chose: the dotted
      rule, the door at the label line's end, the focus swap and the account.

## For `/land-it`

The §13 string-type entry has no `Resolved:` line for its third cost yet. This is
the text to apply once the build is settled, adjusted to what the build found:

> Resolved, for the third cost: **still deferred, and the third cost is answered
> without it** (`docs/features/text-value-modifiers.md`). **Speed is typed
> numbers**: a Card set with one entry per movement type, `derived: value +
> mod.self`, and a movement type the character lacks stores 0 rather than being
> left blank, since a blank entry does not take a grant (a `docs/BACKLOG.md`
> row). A grant is an At least
> on the entry (`speed.climb >= 10 when Climb`; a climb equal to the walk is
> `speed.climb >= speed.walk`). That is how every surveyed tool models it, and it
> needed no code. **A dropdown's option is chosen by a literal**: a change's
> `option` member, on all three tiers and spelled `option: Large` in a cell,
> chooses a Card dropdown's option by its value, folded at render with the note
> untouched, Sets only, a no-match or disagreeing pair refused. The literal is
> not the level-name constant this entry refused: it publishes no name, the cell
> grammar reads it as it reads a note or a column, and an `amount` evaluating to
> a string could later choose an option beside it without the two competing for
> a spelling. Still open: free text of any kind, step changes on an ordered list
> (Enlarge), and drawing a speed set as one line.

**§5, beside the existing Sets rule.** Where §5 says the highest Sets wins, add
D5's departure in the same place, so a reader of either meets both:

> On a dropdown's chosen option there is no "highest", because an option's order
> is only the order its author typed (`docs/features/text-value-modifiers.md`
> D5). Two Sets choosing the same option apply once. Two choosing different
> options refuse the choice: the card draws the reader's own, and a formula
> reading it draws `?`.

## Commit boundaries

These are a plan for `/land-it`, not a schedule. The tree stays uncommitted through
the build and every round of findings. No commit carries a `Co-Authored-By`
trailer.

1. `test: Pin a speed grant on a Card set entry`. The B acceptance test, with
   nothing else. It passes on the tree as it is.
2. `feat: Carry an option on a modifier change`. The `option` member on the three
   tiers and `MODIFIER_CHANGE_KEYS`, the contract field-list case, the
   definitions parse and its "ignored" and "both" reports, the cell's `option:`
   parse and spelling, and the round-trip tests. Nothing reads it yet.
3. `feat: Fold a chosen option onto a dropdown's stored choice`.
   `ScopeEntry.choice`, Card's declaration and its `compute` route for a derived,
   `choiceTargets`, the walk's fourth reduction, the fold (D4, D5), D3's and
   D7's sentences in `src/en.ts`, the name table's fold, the cycle case, and the
   engine tests.
4. `feat: Draw a dropdown a modifier chose`. The select's drawn value and focus
   swap, the dotted rule, the door and its account, the ARIA, the `title` and the
   live line, the choice contract check, and the form tint.
5. `feat: Offer dropdowns as modifier values`. The `Dropdowns` group, Sets only,
   the `Option` select, the cell-spelling refusal, the definitions report, and the
   Stat block's tile and words.
6. `test: Stage dropdowns a modifier chose`. The harness views and the editor
   sample.
7. `docs: Let a modifier choose a dropdown's option`. This file at `built`;
   `UI.md` §9; and the `SPEC.md` amendments the docs criteria list. Among those:
   - **both §4.2 Card amendments land as `SPEC.md` edits**: what "a chosen
     option publishes its value" now means (D6), and the dropdown's exception to
     "never takes a computed reading" (a chosen option is not one);
   - **D5's departure is written into §5 beside the "highest Sets wins" rule**,
     as **For `/land-it`** gives it.

   It also adds the `docs/BACKLOG.md` row for the blank-entry account, **naming
   the Card set speed pattern as the case that exposes the defect** (a movement
   type left blank draws `—` while its account claims `Total 0`), so it is not
   read as cosmetic.

## Deliberately not doing

- **Free-text operators of any kind**: append, template, or any edit to a Card's
  text value. Prior-art finding 3 lists the only operations that exist, and each
  waits on the string type.
- **Languages, senses, and any set-membership list.** A list type is §13's
  sibling refusal.
- **At least on an option, and step changes** (Enlarge, "one size larger"). Both
  need an order this feature deliberately does not read (amendment 1). Adds to is
  refused, not defined.
- **Drawing a Card set as one line** ("30 ft., 10 ft. climbing", unused types
  hidden). It is a display change for its own spec.
- **A blank Card set entry under an At least.** The pattern stores 0 (accepted
  by the owner). The contradictory account goes to `docs/BACKLOG.md` as a row
  that names the Card set speed pattern as the case that exposes it, so it is not
  read as cosmetic.
- **A change that lands on every row of a Table.**
- **Record set and Stat block fields as targets.** They publish no names.
- **Other closed lists**: a Table `select` column (§13, still open), a Passport
  field, a hidden-value dropdown (D2).
- **Stored numbers**: a `number` cell, or a typed Pool maximum.
- **A priority member to settle two disagreeing Sets** (D5).
- **Migrating a literal on an option-value rename.** It is reported (D8).
- **Renaming a target**, and **any rewrite of a character note**.
- **The open "Roster form-tag overlap" item** on this release branch, which is
  unrelated and untouched.
