# One modifier definition, several changes

Status: shipped
Board card: One named modifier definition moves several values — a Ring of
Protection that adds 1 to armour class and 1 to every saving throw is declared
once and enrolled once, rather than twice on both counts.

## Model question

### The asymmetry this closes

A modifier definition declared in a layout carries one `target`, one `operator`,
one `amount`, one `bonusType` and one `applies`. A boon that moves two values is
therefore two definitions with two names, and a character's row has to name both
of them in its modifier cell.

A modifier **row** has had no such limit since the two-tier cell shipped
(`SPEC` §4.2): a cell of `;`-separated parts changes as many values as it names,
and the resolved §4.2 entry says so in as many words — "a row could modify one
target … a cell of parts has no such problem, so one row now changes as many
values as it names". The tier that lives in a *note* can do the thing; the tier
that lives in the *layout*, which is the tier meant for the changes that repeat,
cannot. That is the asymmetry, and it is the whole of the feature.

`docs/features/modifier-definitions.md` already records it as deliberately not
done, and records what was left of it after wave 3: "What is left is economy in
the layout editor for a definition used by many rows, which is a real design and
an open item, not a gap." This is that open item, taken.

### The question, and the answer

**How does one definition spell several changes?**

**The rejected answer: a `;`-separated parts string.** The definition grows one
text field spelled exactly as a cell is — `armour_class += 1 as deflection;
saving_throws += 1 as deflection` — read through `parse/modifier-cell.ts`'s
existing grammar. Its merits are real and should be stated before they are
refused: it costs no new editor field kind at all, it reuses a parser, a speller
and a round trip that already ship and are already tested, and it converges the
two tiers on one spelling, which is the direction the cell format was tightened
for. `unspellableName` already exists precisely to keep the two grammars from
colliding, so the machinery is in hand.

**Why it lost.** A definition is an authored artifact — written once in the
layout editor, moved on every sheet at once, read by an author who is not
necessarily the player. `modifier-definitions-field.ts` gives that author a
**Changes** picker over the accepting set, an **Operator** select, an **Applies
to** select and a **Bonus type** select, and the header of that file argues at
length that the target picker "is the one control this feature moves rather than
builds, and moving it is what makes it complete", against a vendor that
documents pressing F12 and running a console script as the discovery mechanism
for attribute keys. Replacing those four controls with a text box in which the
author must now spell published names from memory is not a neutral change of
storage; it withdraws the control the last feature existed to deliver. The cell's
grammar is right for a *cell*, where the reader is typing inside a table row and
a picker has nowhere to live; it is wrong for a pane with room for a form.

**Ruled: a nested list.** `ModifierDefinition` grows a `changes` list. Each entry
carries the `target`, `operator`, `amount`, `bonusType` and `applies` that the
definition carries flat today. `when` and `name` stay on the definition. This is
Foundry's Active Effect shape — one document holding a `changes` array, each
entry a key, a mode and a value — and the counter-precedent is Custom System
Builder, whose Item Modifier carries a single Key, so several values means
several modifiers: exactly the shape being left behind here.

**A definition with no `changes` key keeps reading its flat members**, so no
layout written before this change is migrated on read and an existing
single-target definition keeps its current spelling.

### What the ruling costs

**An editor field kind that does not exist.** `list-fields.ts` renders records
whose cells are scalars; a list inside one row of another list has no renderer.
`SPEC` §13's open Table `select` entry names this gap exactly, and records that
its two halves were separated: the *surface* half is answered — the layout
editor's configuration panel has the room a 620px settings tab did not — and the
*field-kind* half is not. Building it here settles that half for the select entry
too. It does **not** resolve the select entry: Table's `select` column is out of
scope here, and neither `COLUMN_TYPES`' order nor a control in a cell carrying
row identity is touched by this work.

### The three sub-questions, answered with it

**1. `when` applies to the whole definition, not per change.** It stays exactly
where it is. The definition is on or off and every change moves together. A
conditional boon granting one change always and another only sometimes is two
definitions, and the row's cell names both.

The cost, stated rather than hidden: that case re-creates in miniature the
asymmetry this feature closes. The ruling accepts it, because a definition's
condition is a fact about the *thing* — the ring is worn, the spell is up — and
not a fact about each arithmetic clause. A per-change condition would also make
"is this row applying?" a question with several answers, and the row's glyph,
its `title` and its accessible name are all built on there being one.

**2. Two changes in one definition may carry different `bonusType` and `applies`
values.** Each change is a full, independent contributor. Same-type stacking
gathers by target (`formula/modifiers.ts`'s `walk` keys `applied` by target
name), so two changes landing on different targets never contest; where two do
land on the same target they contest exactly as two separate definitions would,
with no special case for sharing a parent.

**3. A definition naming the same target twice is reported and still applied.**
`parseModifierDefinitions` adds a problem the author reads in the editor; both
changes contribute and contest through the ordinary stacking rule. This follows
that reader's own shipped precedent — "**A definition with a reported target is
still usable**, deliberately" — and the standing rule that the plugin renders
rather than corrects.

It is deliberately **not** the collapse-to-first-appearance treatment the reader
gives a repeated definition *name*. There, the second is dropped because "two
definitions with one name could not be told apart" — a cell stores a name, so a
duplicate name is unaddressable. Two changes at one target are perfectly
addressable and perfectly arithmetic: either both are wanted (a deflection bonus
and an untyped one at the same value) or neither is, and the stacking rule says
something true either way.

### The contract, and what publishes

Nothing in `SPEC` §4.1's component contract changes and no component gains a
`configField`. `changes` is layout vocabulary, beside the function library, the
reset triggers and the bonus types — the same category `modifier-definitions-
field.ts` places itself in. No component publishes anything new; what changes is
how many slots one enrolment pushes at.

### Constraints

- **Constraint 1** (no `eval`): nothing here evaluates anything new. A change's
  `amount` and the definition's `when` go through `formula/expression.ts`
  exactly as they do now.
- **Constraint 3** (byte-identical round trip): held, and it is the reason the
  flat spelling survives. See **Data and file model**.
- **Constraint 4** (a layout change never deletes character data): held
  absolutely. **Not one byte of any character note is touched by this feature.**
  A cell names a definition once before and once after.
- **Constraint 5** (`src/parse/` and `src/formula/` import nothing from
  `obsidian`): unchanged. The normalisation lives in `parse/`, the expansion in
  `formula/`, and the new field kind in `src/editor/`.
- **`TypedEffect`'s docblock** is honoured. See **Data and file model** → *Three
  interfaces, not two*.

## What it does

A layout's modifier definition can now name several changes: one definition,
one name, several values moved. A character's row enrols in it by naming it once
in a modifier cell, exactly as today, and each moved value's own breakdown
attributes the change to that definition by name. In the layout editor a
definition's **Changes** stops being one picker and becomes a small list, each
row naming one **Value** with its own operator, amount, phase and bonus type,
and the definition's **Only when** kept once beneath.

## Smallest version

The model and the arithmetic, plus the least editor that can author it: a
`changes` list read and normalised in `parse/`, expanded one enrolment per change
in `formula/`, and a nested list in the definitions field with an **Add change**
button and a per-change remove. It gives up the extraction of the field kind into
its own module (it lives inside `modifier-definitions-field.ts`, so `SPEC` §13's
select entry gains an argued precedent rather than a callable renderer), the
per-change remove confirmation, the flash-after-add, and any palette or
breakdown polish. The acceptance case works end to end either way.

## Design

### The layout editor: a definition's entry

Today a definition is one `.sheetsmith-list-entry`: a name row with the
reorder/remove controls, then one `.sheetsmith-entry-detail` flex line holding
**Changes**, **Operator**, **Amount**, a forced break, **Applies to**, **Bonus
type**, **Only when**.

After this change the entry is three regions, top to bottom:

1. **The name row**, unchanged.
2. **The changes list** — one line per change, plus an **Add change** footer.
3. **The definition's own line**, holding **Only when** alone.

A definition with exactly one change therefore draws almost exactly what ships
today, with **Only when** moved down one line. That is deliberate: the
one-change case is the overwhelming majority of every layout in existence, and
it must not be made to look like a new kind of thing to accommodate the rare
one.

### One change line

The controls are today's, in today's order and today's widths, so the geometry
that three rounds of measurement produced is kept rather than re-derived. One
label changes, and only one:

- **Value** — `.sheetsmith-detail-field-wide`, the accepting targets by label,
  with a stored target the picker does not offer carried as a bare extra last
  option. The control is unchanged, including the reason it shows labels rather
  than names; what changes is its word. **It is labelled "Changes" today, and it
  cannot stay that**: the list it now sits inside is **Changes**, so a reader
  would meet "Changes → Changes" and have to work out which of the two the word
  means. The list is named for what it holds and the control for what it picks,
  which is the ordinary split — a modifier's **Changes** are the values it moves,
  and each one names a **Value**.
- **Operator** — `.sheetsmith-detail-field-tight`, **Adds to** / **Sets**.
- **Amount** — the flexible field.
- `.sheetsmith-detail-break`, the zero-height full-width flex item.
- **Applies to** — tight, reserved-and-hidden on an override.
- **Bonus type** — tight, reserved-and-hidden on an override.
- **A trailing control track**, new, holding the change's own remove.

The remove is the trash glyph in the clothes `addControls` already gives one, and
it is **reserved and hidden where the definition has only one change** — the
class pair `.sheetsmith-detail-field-reserved` plus `aria-hidden` that **Applies
to** and **Bonus type** already use on an override, for the reason that file
argues twice: a control that is simply not created gives its width back to the
line's grow, so a list holding one-change and two-change definitions would read
as two different forms down the pane. There is nothing to remove *to* — a
definition with no change at all is the "names no value" problem, which the
report already carries — so the control is inert rather than destructive.

**The reservation holds nothing on this caller's line, which was measured rather
than assumed.** Removing the track outright renders byte-identical to hiding it,
at 1400, 1210, 960 and 620 of pane, because the change line carries
`.sheetsmith-detail-break` and the track is therefore the last child of the
*second* row — whose children are all `-tight` — while the line's grow lives on
the first. So the argument above is true of the two fields it was written for and
not of this track. It is kept as insurance against a caller whose line does not
force a break, where the reservation would do exactly what it claims, and the
module's own comment states the measurement so the next reader does not
re-discover it. Removing it is a clean subtraction if the reservation is judged
not worth a hidden control per one-change definition.

**No reorder controls and no drag inside the changes list**, and this is a
refusal rather than an omission (`docs/UI.md` §6 asks for the argument). Change
order is not observable: a breakdown lists contributors in *definition*
declaration order, two changes at different targets appear in two different
breakdowns, and two changes at one target contest by size rather than by
position. So there is no reading a reorder could change. The outer list keeps its
drag, and `ListContext.drag` stays the single shared `{ index }` it is, with
nothing nested inside it competing for the same slot.

### Add change

A footer button inside the changes list, in the `.sheetsmith-entry-footer`
clothes the outer **Add modifier** wears, labelled **Add change**. It appends a
change with a blank target and nothing else, and focus lands on that change's
**Value** select — the rule every add in this pane follows.

Pressing it on a definition still spelled flat is what converts it. See **Data
and file model**.

### Empty and error states

**Empty.** There is no "No changes yet." line, because a definition always draws
at least one change line. Where the layout holds no `changes` and no `target`
either, the field draws one line with its selects at their defaults and writes
nothing to the file until the author picks something — the same restraint
`renderModifierDefinitions` already shows in not materialising `"modifiers": []`
into a layout that was merely opened. The *sentence* about a definition that
changes nothing stays where it already is, in the report under the list, so the
pane keeps one answer to one question (`docs/UI.md` §9).

**Error.** No new error surface. Per-change problems join the existing
`.sheetsmith-field-problems` block under the whole list, with the definition's
name as the quieter locator and the target named inside the message — which is
what tells two lines about one definition apart. The **Name** field keeps its
inline error and it is still the only inline error in this list.

The new messages, in the parser's existing voice (name the fix, not the fault):

- A change with no target: `"Ring of Protection" has a change that names no
  value. Choose one under Value, or remove the change.`
- A change with no amount: `"Ring of Protection" has no amount for "armour_class",
  so that change does nothing. Give it an expression under Amount.`
- The same target twice: `"Ring of Protection" changes "armour_class" twice. Both
  apply and contest as two separate modifiers would. Remove one, or point it at a
  different value.`

The messages that already name a target — the unpublished target, the target
reading no modifier, the phase and bonus-type refusals — gain the target in the
sentence where a definition has several changes, and keep their current wording
where it has one, so a single-change layout's report is byte-identical to what it
reads today.

**The shipped messages that name the old label follow the rename, and there are
two of them.** `parseModifierDefinitions` ends its no-target sentence with
"Choose one under Changes."; with the control relabelled it reads "Choose one
under Value." A message naming a word that is no longer on screen sends the
reader looking for a control that is not there, which is the same failure the
operator handler's own block cites for telling an author to clear a field the
pane does not offer.

**The second is `parse/modifier-cell.ts`'s**, which refuses a name that reads as
an assignment with "write it as a modifier's Changes and Amount instead" — one
sentence deliberately single-sourced beside the predicate that produces it, and
shown on *three* surfaces: the editor's report, the sheet form's promote row and
the promote refusal. It is what makes the sheet form's own select part of this
rename rather than a separate decision; see **The sheet**. Every other message
names a fix rather than a field. (This paragraph said the parser's was the only
such sentence, which was wrong, and the second is what forced the sheet's select
to move with the editor's.)

**The accessible names follow the label too.** A change's selects are read
`${name} value`, `${name} operator`, `${name} applies to`, `${name} bonus type` —
and where a definition holds several changes each one is qualified by the value
it names, since four identical accessible names down one entry is the one thing a
screen reader cannot tell apart while a sighted reader can.

### The definition's remove confirmation

`addControls`' `describeRemoval` currently reads "Its target, amount and
condition are lost." With several changes that becomes "Its 2 changes and its
condition are lost.", and the guard that suppresses the confirmation entirely —
today `(definition.amount ?? '').trim() === ''` — becomes "no change carries an
amount". The sentence about the cost the editor cannot see, that every enrolled
row goes inert with no count of them reachable from here, is unchanged and is the
load-bearing half.

### The sheet

**Almost nothing new is drawn**, and the three exceptions are named at the foot of
this section rather than left for a reviewer to find. What is unchanged is worth
stating plainly, because it is what makes the feature small on the side where a
mistake is expensive:

- **The breakdown** under a modified number already lists contributors carrying
  `definition?: string`, and already gathers per target. Two changes of one
  definition land in two different breakdowns, each naming the definition. The
  acceptance case's "each one's breakdown attributes the change to that
  definition by name" needs no new code in `modifier-breakdown.ts` beyond what
  the outcome shape below forces.
- **The row's glyph** is `zap` where any modifier the row applies is applying and
  `zap-off` where none is, and stays exactly that. A definition with two changes
  of which one is suppressed is a row that is applying, which is what the glyph
  already says.
- **The form** (`components/modifier-form.ts`) draws one line per *part* of the
  cell. A part naming a two-change definition now has two outcomes to state. The
  line keeps its identifying half — the definition's name — and its outcome half
  becomes one line per change, indented under the name:

  ```
  Ring of Protection · Armour class — deflection +1
                       Saving throws — deflection +1
  ```

  and a change that is not applying keeps its `Not applied: …` line directly
  under its own outcome line, where it already is. `modifierOutcomeText`'s three
  shapes are unchanged; what changes is that the builder is called once per
  change and the caller joins them.
- **The row `title` and accessible name** already have a several-form
  (`modifierRowText`, `Modifiers: 2 applying, 1 changing nothing`), and it counts
  *enrolments*. It counts **changes** after this, because that is what the number
  is about — how many values this row is moving — and because a reader looking at
  a row cannot see how they were grouped into definitions. The count line's
  wording does not change; only what it counts.

**Three things on the sheet are new**, and each is written so that removing it
later is a subtraction rather than an unpicking. None of them is required by the
arithmetic; each answers a question a definition naming several values asks and a
definition naming one does not.

- **The form's part line gains a line per change**, indented under the name.
  `modifierOutcomeText`'s three shapes are unchanged; the builder is called once
  per change and the caller joins them, with the identifying half — the
  definition's name — on the first line only, because a definition has one name
  however many values it moves. The glyph stays one per part, on the row glyph's
  own rule. Remove it by joining only the first outcome, and the line reads as it
  did.
- **The **Modifier** picker's option qualifies the name with ` (N values)`**
  where the definition it names moves more than one. An `<option>` is one line
  with no room for a second, and the picker's job is to tell one definition from
  another rather than to state what each does in full — but an option reading
  `Ring of Protection · Armour class — item +1` and nothing else is a *complete
  account* of a modifier that moves two, and a reader choosing on it would be
  choosing on half. **Beside the name rather than after the outcome**, which the
  shot decided: as a trailing ` (+1 more)` it was the first token clipped, because
  a `<select>` is as wide as its box and the outcome is the long half. Remove it
  by dropping the qualifier; nothing else reads it.
- **The open part's five read-only fields gain a sentence saying which change
  they show.** See the entry below.

**The form's five read-only fields show the first change**, and this is a ruling
rather than an oversight. They describe *one* change, and a named part's are
read-only in any case: the list line above now states every change in full, which
is the surface a reader asking "what does this do" is looking at. Drawing a set of
five per change would make a read-only account of the layout the tallest thing in
the panel, and `docs/UI.md` §12 already records the panel as the largest surface
on a sheet. So the fields say which one they are —
`"X" changes N values. These fields show the first; the line above lists them
all.` — in the panel's own `.sheetsmith-panel-why` clothes, and the reader who
wants the rest reads the line they just opened. Removing it means removing the
sentence and leaving the fields showing the first change silently, which is the
state this ruling rejected.

**Detaching copies every change, one cell part each.** A cell part is one change
by construction, so the honest copy of a two-change modifier onto a row is two
parts. Copying only the first would take half the modifier off the row on a press
whose whole promise is that nothing is lost — the one-way "detach to instance"
gesture is allowed to be irreversible, not to be lossy.

**The sheet form's target select is renamed **Changes** → **Value**, with the
editor's.** Not a second decision, and the reason is the second shipped message
named under **Design** above: `parse/modifier-cell.ts`'s refusal is one sentence
serving the editor's report and the sheet's promote row alike. Leaving it named a
field the editor no longer has; changing it alone would have made it wrong on the
sheet. So both move together and the sentence reads "Value and Amount".

## Config fields

This feature adds no component `configFields`. What it changes is the shape of
the layout's own `modifiers` list, which the layout editor's Layout panel draws
directly. For completeness, the fields as the editor presents them after the
change:

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `name` | text | Name | What a character's cell writes to enrol in this. Renaming it leaves the old word in every cell that named it, and those rows stop applying it. Unchanged. |
| `changes[]` | list of records | Changes | Every value this modifier moves. A modifier with two changes is one name on a character's row and two numbers that move; each change contests on its own terms, including with the other one if they name the same value. |
| `changes[].target` | select | Value | The value this change moves, offered from the names whose own formula reads a modifier. A value not on the list is one whose formula does not add `mod.self`. |
| `changes[].operator` | select | Operator | **Adds to** stacks with everything else pushed at the value; **Sets** replaces it and the highest setter wins, so it carries no bonus type. |
| `changes[].amount` | text | Amount | An expression, evaluated in the enrolling row's own scope, so a column of that table can be read by heading. |
| `changes[].applies` | select | Applies to | **The value** moves the number behind the formula; **the derived number** moves what the formula came to. Absent on a **Sets**, which is in the result phase by construction. |
| `changes[].bonusType` | select | Bonus type | Which of the layout's bonus types this change contests as. Two changes of one modifier may carry different types, and two carrying the same type at the same value contest exactly as two modifiers would. |
| `when` | text | Only when | An expression on the enrolling row. It governs the **whole** modifier: every change is on or off together. A boon where one change is conditional and another is not is two modifiers. |

## Data and file model

### What a layout stores

```json
{
  "name": "Ring of Protection",
  "when": "Worn",
  "changes": [
    { "target": "armour_class", "amount": "1", "bonusType": "deflection" },
    { "target": "saving_throws", "amount": "1", "bonusType": "deflection" }
  ]
}
```

A definition with **no `changes` key** reads `target`, `operator`, `amount`,
`bonusType` and `applies` off itself, exactly as now.

A definition with **both** — a `changes` list and flat members beside it — takes
the list, and the flat members are reported as ignored rather than deleted. That
is `SPEC` §10's "rendered, not corrected" applied to a hand-edited layout: the
author's bytes stay, and they are told which half the sheet is reading.

`changes: []` is read as a definition that names no value, which is what a
definition with a blank `target` already is, and earns that definition's existing
problem.

### Three interfaces, not two

`types.ts` gains `ModifierChange` — `target`, `operator?`, `amount`,
`bonusType?`, `applies?` — and `ModifierDefinition` gains
`changes?: readonly ModifierChange[]`.

**`TypedEffect` is not redefined in terms of it**, and the reasoning in its
docblock is why. That block refuses `Omit<ModifierDefinition, 'name'>` on the
grounds that "a definition is a thing with a name in a shared file and an effect
is an anonymous fact in a note, and §7's edge is precisely that being nameable is
what separates them", and warns that naming one in terms of the other "invites
the next feature to give a typed effect a name in place". `ModifierChange` is a
*nearer* miss than `ModifierDefinition` was, since it differs from `TypedEffect`
only by `when` and by `operator` being optional — which is exactly why spelling
`TypedEffect = ModifierChange & { when?: string }` would be the invitation that
block was written to refuse: it would make a typed effect "one change of a
definition with no name yet", which is the promotion-in-place §7 forbids. So
three interfaces, each with a docblock pointing at the other two, and
`contract.test.ts` holds the field list once, exactly as it does today for two.

### Where flat becomes nested

**In `parse/modifier-definitions.ts`, and nowhere else.** `ModifierDefinitionView`
gains `changes: readonly ModifierChangeView[]` — **always present, always
normalised**, a one-entry list for a flat definition — and `targetLabel` **moves
off the view onto `ModifierChangeView`**, since a definition with two changes has
two labels and a top-level one could only mean the first. Moving it rather than
keeping both is what makes the compiler find every reader; leaving it would leave
a member that silently means "the first change" on surfaces that show all of
them.

The consequence is the property worth keeping: **nothing downstream of the parser
ever reads a definition's flat members again.** The two spellings exist inside
`parse/`, and the formula layer, the sheet and the editor's report all see one
shape.

### Where one part becomes several enrolments

**In `formula/modifier-definitions.ts`.** `resolveEnrolment` becomes
`resolveEnrolments`, returning `readonly Enrolment[]`. `Enrolment`, `PartFields`
and `Contribution` are **unchanged**, which is what keeps the blast radius small:
one change resolves to exactly what one definition resolves to today.

**`PartSource` gains one member, `change`**, and it is forced by the two rulings
above rather than chosen. `targetLabel` moves onto `ModifierChangeView` and
nothing downstream reads a definition's flat members, so a source carrying only
`definition` can no longer reach a label, an operator or a bonus type — and
`modifier-breakdown.ts` reads exactly those to compose a line. It does **not**
make a third tier: `definition` and `change` are set together or neither is, and
the invariant the interface already states, that exactly one tier is ever set,
is unchanged. `ModifierOutcome` gains the same member for the same reason, which
is what lets `modifierOutcomeText` read one change rather than re-deriving off a
definition that has as many operators and types as it has changes.

Lengths: a stray name gives one `{ kind: 'unknown' }`; a typed part gives one,
since a cell part is one change by construction and the row tier already spells
several by writing several parts; a named part gives one per change, never zero —
a definition with no usable change still gives one enrolment with a blank target,
because the form's line for it has to say what it *would* do.

**The condition is read once per part, not once per change**, and this is the one
place the implementation must not simply map over the list. It is sub-question 1
made mechanical: one `when`, one evaluation, one `inactive`/`unreadable` verdict
covering every change the definition names.

**An amount that will not resolve refuses only its own change's target.** The
walk in `formula/modifiers.ts` already keys `refused` by target, so this falls
out; what needs saying is that it is deliberate. Refusing every target a
definition names because one of its amounts is broken would blank an unrelated
card, which is the same failure the condition-before-amount ordering already
exists to prevent. The cost is that a definition can be half-applying, and what
names it is the editor's report, which is per change.

**`formula/modifiers.ts`'s walk** loops over the returned list instead of taking
one. `stackModifiers` is untouched: two contributors from one definition are two
contributors, which is sub-question 2 needing no code.

### Constraint 3

The definitions round trip is byte-identical when nothing changed, in both
spellings:

- A flat definition is read into a one-entry `changes` view and its stored object
  is never rewritten. A layout full of flat definitions, opened in the editor and
  closed, is byte-identical.
- A nested definition round-trips key for key, with absent keys staying absent —
  `setOptional` on each change, so the default is the missing key exactly as it is
  on a definition today (`PATTERNS` §8).

**Flat becomes nested once, on the author's own press, and is never undone.**
Pressing **Add change** on a flat definition moves its five flat members into
`changes[0]` and deletes them. That is a write the author asked for, in the
author's own layout, through the editor that is taking the control away — the
same distinction `modifier-definitions-field.ts` already draws when its operator
handler deletes `applies`: "**Not the 'rendered, not corrected' case, and the
difference is whose file it is.** That rule protects *character* data a layout no
longer declares."

Removing the second change does **not** convert back. One spelling per meaning
would argue for it; rewriting a file the author did not ask to have rewritten
argues against it harder, and the flat spelling exists for compatibility rather
than as a preferred form. The cost is a round trip: **Add change** then remove
leaves the definition nested with one entry. That is the price the operator
select already pays for `applies`, named rather than hidden.

### Existing character notes

Untouched. A cell names a definition once before and once after; no cell is
rewritten, no section is added or removed, and there is no migration. Constraint
4 is not merely honoured here, it is unreachable.

## Acceptance criteria

**The acceptance case.**

- [ ] A layout declares one definition named `Ring of Protection` with two
      changes: 1 to armour class and 1 to every saving throw. A character's
      modifier cell names it once. Both values move.
- [ ] Each moved value's breakdown attributes its change to `Ring of Protection`
      by name.
- [ ] The vault's `Modifier variations` layout carries that definition with both
      changes, alongside a saving-throws component whose formula reads
      `mod.self`; `Ilona.md`'s row names it once and both numbers move. The
      existing ten definitions are otherwise untouched, so the fixture
      demonstrates the flat spelling and the nested one side by side.

**Backward compatibility.**

- [ ] A layout whose definitions are all flat produces the same numbers and
      round-trips byte-identically — `modifier-definitions.test.ts` drives the
      existing fixture unchanged. **Not "the same views"**, which this feature's
      own ruling makes impossible: `targetLabel` moved onto the change and
      `ModifierDefinitionView` stopped extending `ModifierDefinition`, so every
      view's *shape* changed by construction. What must not change is what a
      reader sees and what the file holds.
- [ ] A flat definition read and re-serialised gains no `changes` key
      (Constraint 3).
- [ ] A definition holding both `changes` and flat members takes the list and
      reports the flat members as ignored, without deleting them.

**The three sub-questions.**

- [ ] `when` is evaluated once for a two-change definition, and a false condition
      switches off both changes — named in `modifier-definitions.test.ts`
      (formula) as *a definition's condition governs every change it names, and
      is read once*. **Counted rather than inferred**: a per-change evaluation
      produces identical verdicts, so the case drives a `base` scope that counts
      reads of the name the condition holds.
- [ ] Two changes of one definition carrying different bonus types land in two
      slots and each stacks with the definitions around it — `modifiers.test.ts`,
      *a definition's two changes stack independently at their own targets*. And
      a definition actually carrying two *different* bonus types and two
      different phases is driven through the walk, since a fixture whose every
      change reads the same type cannot tell a per-change field from a
      per-definition one.
- [ ] A definition's typed change and its untyped one at one target **add**,
      which is the case this ruling's own justification names — "either both are
      wanted (a deflection bonus and an untyped one at the same value) or neither
      is".
- [ ] Two changes of one definition at one target contest exactly as two
      definitions do, with the loser suppressed and its reason stated —
      `modifiers.test.ts`, *two changes of one definition contest at a shared
      target exactly as two definitions do*. This is the test sub-question 2
      names.
- [ ] A definition naming one target twice is reported by
      `parseModifierDefinitions` **and** both changes still appear in
      `definitions`, so the editor shows a problem and the sheet still applies
      both — `parse/modifier-definitions.test.ts`.

**The arithmetic's edges.**

- [ ] A definition whose second change has an unresolvable amount still applies
      its first, and only the second change's target reports the refusal.
- [ ] A definition whose changes are an override and an addition at two
      different targets applies both, and the override's change carries no bonus
      type whatever the file says.

**The editor.**

- [ ] A flat definition draws exactly one change line, with **Only when** on its
      own line beneath, and its per-change remove reserved and hidden.
- [ ] **Add change** on a flat definition converts it to `changes` with the flat
      members moved into the first entry and deleted from the definition, and
      focus lands on the new change's **Value** select. **The focus half is
      asserted rather than read**: the field test records the tokens the field
      asks for, so a token naming the wrong index fails there instead of leaving
      the hand on another change's control, which no assertion over the layout
      could see.
- [ ] A two-change definition's remove confirmation names the count, and a
      one-change definition's is the shipped sentence word for word.
- [ ] Every new problem message the report can emit is asserted in
      `modifier-definitions-field.test.ts` to be contained in what the rendered
      report says, so the field and the parser cannot be reworded apart — the
      rule that file already holds for the two name faults. **Every** one: one
      layout earns all of them, and a message the field test does not name is a
      message the two surfaces can drift apart on.
- [ ] Opening a layout whose definition holds `changes: []` and committing an
      unrelated field leaves that key `[]` in the file. The editor draws a line
      for it, and the line writes only when a control commits.

**Appearance** (checked by looking, `docs/UI.md` §11).

- [ ] `npm run harness && npm run harness:shot` renders `editor-layout`,
      `editor-layout-threshold` and `editor-layout-forced-colors` with a
      two-change definition present in the sample layout. A scoped shot is given
      an explicit frame, since a scoped shot writes `custom.png` at its own width
      and wrap and clipping checks otherwise do not reproduce.
- [ ] At the threshold width no change line clips a `<select>`: **Value**,
      **Operator**, **Applies to** and **Bonus type** keep the widths three
      rounds of measurement gave them, and the new control track does not take
      the dividend **Value** needs.
- [ ] No surface reads **Changes** twice. The list is **Changes**, its rows'
      first control is **Value**, and no problem message, accessible name,
      placeholder or heading still says the old word for the inner control.
- [ ] A one-change definition and a two-change definition read as one form, not
      two: their field left edges line up and the reserved remove holds the
      track.
- [ ] Under `forced-colors: active` the nested list still reads as a bounded
      region, because it is **bracketed** — the **Changes** label above it and the
      closing hairline below — and both are geometry rather than a background, so
      the mode that repaints every author surface keeps them. **Not the
      indentation**, which is what this criterion used to credit and which carries
      almost none of it: 8px against 13px type, and at Text 24 the labels grow to
      ~19px while the inset does not move. A reviewer checking the indent alone
      would fail a list that reads correctly.
- [ ] The open part's five read-only fields say which change they show where the
      definition names several, in the panel's own quiet clothes — so a named
      part's fields never under-report without saying so.
- [ ] A part naming a two-change definition draws one line, one glyph and two
      sentences, the second indented under the first, with the definition's name
      on the first line only.

**The gates.**

- [ ] `npm test`, `npm run lint` and `npm run build` pass. (`lint` runs with
      `--max-warnings 0`, so a sentence-case warning fails it.)

## Commit boundaries

A plan for `/land-it` at the end, not a schedule to work to. The tree stays
uncommitted through implementation and every round of findings.

1. `feat: Let a modifier definition name several changes` — `types.ts`'s
   `ModifierChange`, `ModifierDefinition.changes`, the normalised
   `ModifierChangeView`, `targetLabel`'s move, and
   `parse/modifier-definitions.ts` reading both spellings with its new problems.
   Its tests.
2. `feat: Push one enrolment per change a definition names` —
   `resolveEnrolments`, the once-per-part condition, and `formula/modifiers.ts`'s
   walk over the list. Its tests, including the two stacking cases.
3. `feat: Give the definitions field a list of changes` — the nested field kind,
   the change line, **Add change**, the per-change remove, the flat-to-nested
   conversion, and the remove confirmation's new count.
4. `feat: Say what a multi-change modifier is doing on the sheet` — the form's
   per-change lines and the row text's count. Its tests.
5. `test: Carry a two-change modifier through the harness` — the harness sample
   and any stub work the shots need.
6. `docs: One modifier definition, several changes` — this file at `agreed` or
   `built`, `SPEC` §13's entry and its amendment to the Table `select` entry,
   `docs/features/modifier-definitions.md`'s "deliberately not doing" row
   closed, and `docs/BACKLOG.md`'s list-geometry row noting its fifth consumer.

## Deliberately not doing

- **A modifier landing on every row of a Table.** Gated on a separate `SPEC` §13
  question about what a Table publishes as a target. A change still names one
  published value.
- **Table's `select` column type.** This feature settles its field-kind blocker;
  it does not build the column, and neither `COLUMN_TYPES`' order nor a control
  in a cell carrying row identity is touched.
- **Per-change `when` conditions.** Sub-question 1. A conditional boon with an
  unconditional half is two definitions.
- **Reordering changes within a definition.** Argued above: the order is not
  observable, so there is no reading a reorder could change.
- **Converting a nested definition back to the flat spelling** when its last
  extra change is removed. Argued above.
- **Multiply, divide and subtract operators, and a priority field.** Already
  deliberately not done in `docs/features/modifier-definitions.md`, and nothing
  here changes the argument.
- **The `docs/BACKLOG.md` rows** on `formula/modifier-targets.ts` holding four
  exports with no modifier in them, on the panel form field being built twice, on
  the fourth list field importing five helpers from a sibling, and on a flag
  outliving the control that sets it. Touched only where this change makes one
  strictly worse — it makes the list-geometry row worse by one consumer, which is
  recorded in that row rather than fixed here.
- **The breakdown listing contributors that did not move the number it is
  about.** Its own open §13 question about the narrow and wide predicates.
- **A count of how many characters enrol in a definition**, which the remove
  confirmation still cannot reach and still says so.
