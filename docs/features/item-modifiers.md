# Item modifiers

Status: shipped
Board card: ✨ Item modifiers — one row declares a change against a value
published elsewhere on the sheet, rather than the target enumerating every
source that could change it

## Model question

Two §13 entries are in play and one of them is wrong.

**The thread this picks up.** §13's resolved aggregate entry ends by saying the
aggregate "does **not** deliver item modifiers, despite the board saying that
card waits on this one", and that "that card's dependency deserves re-examining
rather than acting on". There is no §13 entry for item modifiers yet. This
document is the argument for one, in enough detail that `/land-it` can lift a
`Resolved:` entry out of it. Nothing is resolved until it is built, so §13 is
not edited here.

**The correction that entry needs.** It says Custom System Builder "is
deprecating its own pull-side system in favour of" push. It is not. CSB
deprecated **Item Modifiers, its own *push* system**, at 4.5.0 ("to be removed
in CSB 6.0.0 — Foundry 14") and removed it at 6.0.0 ("Removed Item Modifiers and
Status Effect Modifiers — You should now use Active Effects"). It moved from a
builder-owned push system to the *platform's* push system. The direction is
still push; the lesson is different, and it is one this project cannot take:
**Obsidian has no effects layer underneath.** Whatever is built here is
maintained here forever, and there is no platform mechanism to hand it off to in
two versions' time. `/land-it` should correct that sentence rather than
propagate it.

**The depth entry is not reopened.** `expression.ts`'s tokenizer reads
`SEGMENT(.SEGMENT)*`, so arbitrarily deep dotted names already parse; what §13
refuses is *publication* depth, and it refuses it in `isName`, which is
`^SEGMENT$` and so rejects a dot in a published key, because a third segment
would collide with the `.value` every `ScopeEntry` answers to. `mod.abilities.DEX`
is not a component publishing a two-dot key. It is the sheet publishing a
reserved namespace, and **a `mod.` entry is not a `ScopeEntry` and answers to no
`.value`.** That rule is what keeps the depth question closed, and it is stated
below as a rule the implementation holds to rather than as an aside.

### 1. Push, not pull. Settled before this document.

Four independent builders declare a modifier the same way — a target key, an
operator, a value:

- **Foundry core Active Effects**: key as a dot-notation data path, mode of
  Add / Multiply / Override / Downgrade / Upgrade / Custom, value, priority.
- **Custom System Builder's Item Modifiers**: ConditionalGroup, Priority, Key,
  Operator of `+ - * / =`, Formula, Description.
- **Sandbox System Builder's MODs**: types ADD, SET, ITEM, ROLL, CREATE, LIST,
  with execution modes Passive, Consumable and Activation.
- **Roll20's D&D 2024 Modifier Builder.**

Nothing in the category answers this by pull. Roll20's older custom sheets have
no push at all, and their documented workaround is a sheet worker summing a
repeating section into a named attribute — which is the pull aggregate this
repository already shipped as `sum()` and `count()`. A pull aggregate requires
the target to enumerate every source that could change it, which is the thing
push exists to avoid: an armour class whose formula names the six items that
might touch it has to be edited every time the character buys a seventh.

### 2. What a modifier targets: a published `mod.<target>` slot the target's own formula reads by name

The obstacle first, because otherwise this reads as "push, obviously".

**Two tools independently forbid a modifier landing on a value the reader types
into.** Custom System Builder states it as a limitation: modifiers work only on
"a number containing Label", and "Modifiers don't work on input-field-components
like `number field` or `text field`". Foundry practice reaches the same rule
from the other side, targeting `system.attributes.ac.otherMod` rather than
`ac.value`, because a derived-only field is one the sheet never submits, so an
effect can add to it without overwriting what was typed. That second one is
snippet-level evidence rather than fetched primary source, so **the CSB
statement is the load-bearing half** and the Foundry convention is corroboration.

SPEC §3 puts every component's value in the character note. So the naive target
— "a Card's value" — is exactly the case both tools refuse.

**The answer.** The sheet publishes one number per target, under a reserved
top-level `mod.` namespace: `mod.armour_class`, `mod.abilities.DEX`. The
target's own formula reads it:

```
derived = value + mod.self
```

So the **authoring** experience is push — a modifier row names its target, and
the target names no source however many rows push at it — while the **engine**
stays pull, which is where this codebase's guarantees already live. Three things
make this the answer.

**2.1 It needs no new evaluation pass.** Verified against both files. The
`mod.<target>` thunk sits in `buildSheetScope`'s existing lazy, memoised `thunks`
table behind its existing `active` re-entry guard (`formula/sheet.ts`), and the
walk that produces the pushes runs each modifier component's own resolver — the
same `component.resolver?.(bound)` the name table already builds for a `display`
or a `compute` — so a computed amount column resolves through exactly the path a
published row's cell already resolves through (`formula/rows.ts`'s memoised row
table, and its own re-entry guard, where the amount reads an aggregate). One
pass, three guards. Two were already there; the third is the modifier walk's
own, refusing a slot read from inside the pass that is building the pushes,
without which `walk()` re-enters itself. Corrected after review: this said
"two guards, both already there", which was the count before the walk existed.

**2.2 It therefore does not have the best-documented failure in the category.**
Foundry issue dnd5e#3900: "When activating an effect and try to add for example
@abilities.con.mod, it does not add even though i see that the constitution mod
is at a +2." The stored `@abilities.con.value` works; the derived `.mod`
silently adds nothing. The cause is that core active effects are applied before
the system's `prepareDerivedData()` runs, when "ONLY base data values are
available". The **Dynamic Active Effects** module exists to add "an additional
effect application pass that occurs after the system specific
prepareDerivedData() completes" — an entire widely-installed module whose reason
to exist is one ordering bug.

Here, `derived` on a Card, `compute` on a `ScopeEntry` and a Table column's
`total` are *all* derived, so this project is **more** exposed to that bug than
Foundry is. With one pass there is no ordering to get wrong. And a modifier
whose amount reads a derived name that itself reads its own slot is a ring the
two existing guards close **loudly** — `?` on the card and a sentence naming the
row and the reason — where dnd5e#3900 is silent. That loudness is the argument
for the shape, not a side benefit of it.

**2.3 It does not reopen the published-name depth question.** See above: a `mod.`
entry is not a `ScopeEntry`, answers to no `.value`, and is registered by the
sheet rather than by a component.

**What it costs, and the spec does not soften this.** A target that never writes
`mod.self` into a formula silently ignores every modifier pushed at it. That is
the mirror image of the bug this shape avoids, moved to a different place. The
difference is that here it is *knowable*, because the sheet holds both halves —
the set of pushed-at targets and the set of names whose formulas read a slot —
and §"Where an unread target is surfaced" below spends both of them. A spec that
left that out would have reproduced dnd5e#3900 in the layout editor.

### 3. A target is a name the sheet publishes, and the slot's domain is that set

Three rules, each of which closes a silent failure:

- **`mod.X` resolves to `0` where `X` is a published name nothing pushes at.**
  On the aggregate's own empty-set rule: "an empty inventory weighs nothing, and
  a new character's sheet must not be full of `?`". Without this, every target's
  formula would break on every character who owns no magic items, which is every
  character on the day they are made.
- **`mod.X` fails as an unknown name where `X` is not a name the sheet
  publishes**, naming the fix. This is what stops the `0` rule from swallowing a
  typo: `value + mod.armor_class` on a sheet publishing `armour_class` must not
  quietly read zero. It is §5's "a name the sheet does not publish fails to
  resolve rather than defaulting to zero", with the namespace's own domain
  spelled out.
- **A push at a name the sheet does not publish is not an error.** It is a cell
  holding a value the layout no longer offers, and §4.2's ruling on exactly that
  is that it is *rendered, not corrected*. Where it is surfaced is below.

### 4. `mod.self`, and why the absolute name is not enough

A Card can spell its own target: its `derived` is published under its bare id,
so `value + mod.armour_class` works. **A Card set cannot.** Its `derived` is one
formula computed per entry, and no name in that formula can say which entry it is
running for — so without a relative spelling, the six ability scores, which are
the canonical modifier target in every system surveyed, could not be modified at
all. "+2 STR from a Belt of Giant Strength" is the feature's headline case and it
would have been unbuildable.

So: **inside the evaluation of a formula whose result is published as a name,
`mod.self` is that name's slot.** It is the exact shape `value` already has —
§5's "a card's `value` therefore always means its own" — read one layer out:
`value` is the number this evaluation is *about*, and `mod.self` is what has been
pushed at the name this evaluation *becomes*. `self` is already the contract's
word for the name a component publishes under its bare id (`ScopeValues.self`),
so the vocabulary is reused rather than invented.

Both spellings exist and `mod.self` is the one to reach for, exactly as `value`
and `<name>.value` both exist and §5 states both. `mod.armour_class` written on
some other component is the way a sheet reads a target's modifier total from
elsewhere, and it costs nothing to allow *outside a modifier amount* because the
slot is in the flat table either way.

**Inside one it is refused, and whether it is refused depends on evaluation
order.** A computed amount reading `mod.<other target>` asks the walk for a total
from inside the pass that is building the pushes, so §2.1's third guard answers
with a refusal naming the row. Measured rather than reasoned: asked cold it is
refused; asked after anything else has walked, the name table's guard fires
instead, memoises the other slot, and the same expression resolves. So the
outcome turns on which card drew first — which is the cost §5 already records for
the two existing guards, "a `?` whose appearance depends on grid order", and it is
left alone for the same reason: closing it means warming the table in a fixed
order, which is exactly what this feature may not do (§13). Corrected after
review: the unqualified "costs nothing to allow" was false once the walk existed.

**`mod.self` is 0 where the evaluation publishes no name.** A Table's computed
column runs on declared rows carrying a `key` and on rows carrying none, from one
formula; a row with no key cannot be pushed at, so its slot is empty, so it is
zero — and a column reading `mod.self` shows numbers down every row rather than
`?` on half of them. The cost is stated in §"Risks" below.

**It does not collide with a layout's own `mod()`.** Every 5e layout writes
`mod(score) = floor((score - 10) / 2)`. Checked against the parser: `mod.self`
and `mod.armour_class` tokenise as *one* name token each, while `mod(score)` is
a bare `mod` token followed by `(`, which `parsePrimary` turns into a `call`
node. A no-argument `mod = 3` in a library is also untouched, because bare `mod`
is never registered in the name table — only `mod.<something>` is. The two live
side by side with no rule needed.

### 5. `mod` becomes a reserved component id, and it is rewritten rather than refused

`buildSheetScope` registers `${component.id}` and `${component.id}.${name}` into
the same flat table the slots go into, so a component with id `mod` would
register `mod.DEX` beside `mod.armour_class` and one name would mean two things.

There is precedent for reserving a name — `RESERVED_NAMES` in
`formula/expression.ts`, and §5's "`sum` and `count` are reserved on the same
terms" — but `RESERVED_NAMES` answers a different question: what a layout may not
*define as a function*. A component id is checked in `parse/layout.ts`, which
already imports `isName` from the formula layer, and the precedent there is not
refusal. §5 rewrites a hyphenated id (`armour-class` → `armour_class`) because
"an unreferencable id is one nothing can be pointing at, which is what makes
renaming it safe, and blanking a whole sheet over it would not be", and the
editor tells the author what their id became.

**So `mod` is migrated by the same path `migrateId` already owns**, to `mod_2`
where nothing else claims it. Three consequences, and all three are why this is
the safe half of the choice: a note is keyed by `label` and not by `id`, so no
character data moves (Constraint 4, §10); a formula that said `mod` was already
ambiguous between a component and a library function, so nothing well-formed
breaks; and nothing is released, so no layout outside this repository's fixtures
holds the id. The constant lives in the new `formula/modifiers.ts` beside the
namespace it protects, and `parse/layout.ts` imports it — one spelling, not two
(PATTERNS §1's policy tier).

### 6. How a target is named: a new `target` column type

A sixth column type beside `text`, `number`, `level`, `toggle` and `computed`
(§2 "Column type", §4.2 Table). Its cell holds a published name.

**A `target` cell is a name reference, not an expression**, and that is the whole
answer to what reads it. It never reaches `parseExpression`, and `isName` is not
the gate either — `isName` is one segment and `abilities.DEX` is two. The gate is
**the sheet's own name table**: the trimmed cell text is compared byte for byte
against the names the sheet publishes and used as a key into the slot table. That
comparison is §4.2's rule for a Card's stored option, cited deliberately —
"exact — case included, byte for byte — between two trimmed strings", with the
trim on the layout's side only. What reads the cell is the component's
`scopeModifiers` (which puts the target in the push) and `formula/modifiers.ts`
(which groups pushes by it). No parser is involved anywhere.

**It is edited as a picker over what the sheet actually publishes.** This is the
answer to a need the prior art fails outright: Foundry's own Active Effects
article tells users to press F12 and run a console script to enumerate attribute
keys. That is the vendor documenting devtools as the discovery mechanism, and any
design where an author types a target by hand inherits it. Here the sheet already
knows every name it publishes, so the picker is available rather than clever.

**The picker lists the targets that accept a modifier, not every name the sheet
publishes**, which is what makes it short enough to read and makes the
mirror-image bug nearly unreachable through the UI: to push at something that
ignores you, the note has to have been hand-edited or the layout has to have
changed under it. How that set is computed is §7.

- **A stored target the picker does not offer is rendered, not corrected**, and
  carried as one extra line at the end of the list showing it raw, with a `title`
  saying either that the sheet does not publish it or that it publishes it and
  reads no modifier. Choosing anything else drops the line. That is §4.2's rule
  for a Card's stray option and for a `level` column's out-of-range value, read
  on a third control rather than answered a third way. Snapping to blank or to
  the first target would be a layout edit deleting character data, which
  Constraint 4 and §10 both refuse.
- **A blank target cell pushes nothing and is not an error.** On an inventory
  with a target column, most rows are blank, and that is the ordinary case rather
  than a degenerate one.
- **A `target` column is refused a `total`** (a total adds up stored numbers and
  a name is not one) **and refused `publish`** (§4.2 refuses a published `text`
  column because "there is no one value a formula could read"; a name is worse —
  the language has no strings, so a published target could be compared to
  nothing). Both are configuration errors on that card alone, naming the fix, in
  `configError`. `secondary` stays confined to `text`, as §4.2 has it.
- **`target` is appended to `COLUMN_TYPES`, never inserted.** That file's own
  header records that the order decides the default, and putting a new type first
  would silently reread every untyped column in every layout.

**One `target` column per table.** `publish` is capped at one per card too, but
**the reason is not the same one** and the spec says so rather than borrowing it:
`publish`'s cap is that "`<id>.<key>` is two segments and the row is already the
second", which is about names and does not apply here, since a modifier row
publishes no name at all. The reason here is that a modifier amount cell has no
way to say which of two target columns it belongs to, and pairing them by
position would be a rule nothing on screen states. The cost: **a row modifies one
target**, so an item that changes two values is two rows — which an open table
allows, two rows spelling the same item being an ordinary second row (§4.2).

**A modifier row may be an open row, and that is most of the feature.** An
inventory of things the character bought is the case. §2 says an open row
publishes nothing, and that stays exactly true: **a modifier row publishes
nothing.** What reaches the sheet is a number under the *target's* name, which
the target's own component publishes. This is the sentence the whole design rests
on — `<id>.<name>` is a fixed-row mechanism and stays one, `inventory.Dagger`
still fails as an unknown name, and push works for rows the layout does not know
about precisely because it never needs a name for the row.

### 7. Which targets accept a modifier, and where an unread target is surfaced

**The accepting set is computed from the layout, statically, and is coarse at the
component:** a published name `X` accepts a modifier when some formula field on
the component that publishes `X` mentions `mod.self`, or when any formula field
anywhere on the layout mentions `mod.X`. `referencesName` in
`formula/expression.ts` already answers "does this expression mention this name?"
by exact token match, and `mod.self` is one token, so this is the existing helper
over the existing `formulaFields` declarations.

Three properties, each of which is why it is this and not something cleverer:

- **It is lazy-proof.** The language's `if` is lazy by design, so an *observed*
  set — which slots were asked for during a render — would report
  `if(equipped, value + mod.self, value)` as accepting nothing on a character
  whose item is stowed. A text scan cannot be fooled by a branch not taken.
- **It needs no render**, so the layout editor and the sheet compute the same
  answer from the same input, and neither has to have a character in hand.
- **It is coarse in the same way and for the same reason as §5's aggregate
  edge** — "reaching the whole component" — so a Table where only the computed
  column reads `mod.self` reports every name that Table publishes as accepting,
  including a column total. The direction of the coarseness is over-reporting,
  and the sheet-side surface below is what stops that being silent.

**The layout editor's half.** In the configuration panel for a component holding
**either half of a modifier row** — a target column naming what changes, or a
modifier column saying by how much — under the columns field: the list of targets
this layout accepts modifiers for, and — where that set is **empty** — an error saying no
formula on this layout reads a modifier, naming the fix (`+ mod.self` in the
target's own formula). That is the strongest false-positive-free statement the
static set supports, and it is exactly dnd5e#3900 caught in the editor: a layout
with a modifier table and nothing reading a slot is a layout whose modifiers do
nothing, and the author is told before a character exists.

Broadened after review: gated on the target column alone, this missed the case it
exists for. A modifier column added *before* the target column — the ordinary
mid-edit state — got the columns list's "no target column" footnote and not the
error saying the modifiers would do nothing even with one, so dnd5e#3900 arrived
one edit late. Either half earns the surface, because a table carrying one without
the other is a modifier table mid-build, and the other direction wants the list
too: the list *is* the target cell's picker.

**The sheet's half, and it is not optional.** The editor cannot see an open row's
target, because a `target` cell is character data. So the sheet says it too, at
the cell: a stored target that is not in the accepting set is the stray line
above, with a `title` distinguishing the two reasons ("the sheet publishes no
`x`" against "`x` reads no modifier, so this row changes nothing"). Both halves
are needed and each catches what the other cannot. That is the answer to "whether
the sheet also says anything": it must, and the reason is that half the pushes
live in a file the layout has never seen.

### 8. Stacking: typed, highest within a type, worst penalty of a type, summed across types

This is the finding the design most had to survive.

- **Pathfinder 2e** types every bonus as circumstance, item or status. Different
  types add; for the same type "you can use only the highest bonus on a given
  roll". Penalties follow the same rule.
- **D&D 5e** does it for the same spell cast twice: "the most potent effect…
  applies".
- **Lancer** does it for Accuracy at magnitude two or more: "you roll that number
  of d6s and select the maximum".

Three of four systems surveyed combine by maximum somewhere. **A per-modifier
operator cannot express this**, because whether a given +2 applies depends on
what else is present. So the stacking rule belongs to the *set*, not to any one
modifier, and no amount of operator vocabulary would have got there.

**The arithmetic, stated precisely, because "highest within a type" is wrong for
penalties.** For each type: the largest positive amount, plus the smallest
negative amount. Summed over the types. Plus every untyped amount, each in full.
That is PF2e's actual rule — the best bonus and the worst penalty of a type both
apply — and applying "highest" naively to negatives would have kept the
*weakest* penalty, which is the opposite of what every system says. Zero
contributes nothing either way.

**Untyped modifiers all stack.** Each is its own kind rather than all being one
kind, which is both what PF2e says and what the default has to be: with no types
declared anywhere, the feature is plain addition, which is what an author who has
never heard of bonus types expects.

**Where the type lives is already decided by a decision this project has taken.**
§5 has no string type, refused in §13 because quote handling is a permanent tax
on the grammar. So a type lives in **configuration, never in the expression
language** — exactly the way a Card option's key-and-label split works in §4.2,
where "an option stores its `value` and shows its `label`, and only the value is
ever a name". The formula never sees the word.

**Declared at the layout, picked by the column.** Two decisions:

- **The layout declares the list**, in a new `modifierTypes` key beside the
  function library and the reset triggers. That is the category §2 already names
  as the layout's own — a system's vocabulary, shared by every component using
  it. A per-table list would make one table's "item" and another table's "item"
  two types that stack, which is the arithmetic being wrong for a reason nothing
  on screen shows.
- **A modifier column names one of them**, rather than a row naming one. Three
  arguments, the third decisive. It matches how the systems work: an item's bonus
  *is* an item bonus, a spell's is a status bonus, cover is circumstance, so the
  source category is a property of the list rather than of the line. It needs no
  new cell control and no seventh column type. And it means **nothing stored ever
  names a type**, so the question of what a type the layout no longer declares
  does to a stored row does not arise at all — the type is layout data, a layout
  edit that drops one cannot orphan character data, and §10 is satisfied by
  construction rather than by a rule. A column whose `modifierType` is not in the
  layout's list is a configuration error on that card, naming the fix.
- What it costs: a table whose rows carry *different* types needs one modifier
  column per type, most cells blank. Listed under "Deliberately not doing".

**It stays one number per target**, which is the property that keeps the single
pass: max and min and `+` are all commutative and associative, so the result does
not depend on the order the pushes are walked in. **v1 therefore has no priority
field and needs none**, and that is a checkable property rather than a
hand-wave — the acceptance criteria assert it by shuffling.

The sum runs through `roundSum` from `formula/expression.ts`, the same helper the
totals row and `sum()` share, so the breakdown's total, the number on the card
and a formula reading the slot cannot disagree about `0.30000000000000004`
(PATTERNS §1: share the application, not the number).

### 9. Provenance: the breakdown at the number, not merely a mark

Nothing in the surveyed category answers "why is this 17" at the number.
**Sandbox** colours a modified attribute green ("attributes increased by a MOD
show up in a green colour"). **CSB** ships an Active Effect Displayer whose
Origin Column "displays the item from which the Active Effect originates, if the
Active Effect is derived from an Item". Both are separate surfaces from the
number. Two independent tools decided a sheet must at minimum *show* that a value
was modified, so **a mark is the floor and the breakdown is the target** — and
here the modifier rows are on the sheet and each names its target, so a modified
card can list its own contributors. This is the feature's differentiator.

**The floor is nearly free, and that is worth noticing.** A modifiable value has
a `derived` by construction, and §4.2's card already shows the derived number in
large type over the stored value. So "this number is not the number you typed" is
already on screen the moment a target reads its slot.

Design, against `docs/UI.md`:

- **The mark is a dotted underline under the derived number**, with `cursor:
  help`. A shape channel rather than a colour one, per UI §6's rule that a mark
  distinguished only by fill strength has one channel, and per UI §1's rule that
  the plugin has no colours of its own — Sandbox's green is exactly what this
  repository may not draw. `text-decoration` survives forced-colors mode, and the
  decoration colour steps from `--text-faint` to `--text-muted` under
  `prefers-contrast: more`.
- **It opens as a popover anchored to the number**, through `ui/popover.ts` —
  the shared "second door onto what a hover shows", already what a computed cell
  and a level ring use. No new gesture (UI §6, §9). A press on the derived opens
  it; a press anywhere else on the card still routes to the field, which is the
  card's existing region routing ("the padding under the note belongs to the
  note"). On touch it is an ordinary tap, on `table.ts`'s own argument: a
  read-only number has no other use for one, so the tap is free to mean "why this
  number?".
- **The breakdown is one popover with several lines, and it needs no CSS at
  all.** Checked: `showPopover` sets `textContent`, and `.sheetsmith-popover`
  already carries `white-space: pre-wrap` — put there for a formula, which is
  code and reads as code — so a newline in the text is already a line. A second
  kind of panel is what UI §9 forbids ("a fourth kind of panel beside a row of
  cards reads as loose chrome"), and here not building one costs nothing.
  **What it does cost is per-line styling**, which is what took "faint" off the
  suppressed line below: `textContent` admits no styling of one line among
  several, so the two sentences could not both hold and this is the one that
  governs. The parenthetical carries it instead. Corrected after review.
- **A contributor line** names the source, the type, and the amount signed:
  `Bag of Holding — item +2`. The source is the modifier component's `label` and
  the row's label, and the row's label follows `RowValues.label`'s existing rule
  — the reader's spelling, never the file's, because a name cell may hold a
  wikilink and "[[Sunblade|sword]]" names nothing anybody can find on the card.
  **The component's label is shown only where the breakdown draws on more than
  one component, and then on every line of it**: a token that is the same on
  every line carries no information and is dropped, which is already why an
  untyped modifier says nothing rather than "untyped". The common sheet has one
  modifier table and reads as the example above; two of them, each with a row
  called "Ring", read `Worn items · Ring — item +1`. Decided once per breakdown
  rather than per line, so no line is left unqualified beside a qualified one and
  the shape changes only when the fact does. Narrowed during review, not a
  correction of a false claim — `docs/UI.md` §9 is where the rule lives, and
  `components/modifier-breakdown.test.ts` holds it.
  **A suppressed bonus is listed and says why**: `Ring of Protection — item +1
  (not applied: a larger item bonus applies)`. That line is the whole
  reason the breakdown beats a mark — a reader who bought two rings and saw the
  number not move will otherwise conclude the plugin is broken. The last line is
  the total.
- **An amount of 0 is not listed**, and neither pushes nor suppresses anything.
  A breakdown is about what changed the number.
- **A card too small is not a case**, because the popover is attached to the
  document at `--layer-popover` rather than inside the card, which is the same
  reason a bubble on a cell survives a table's own overflow box.
- **For a screen reader**, the popover carries `role="tooltip"` and
  `aria-describedby` on the anchor while open, which `showPopover` already does.
  Beside it the card holds the same text in a `.sheetsmith-sr-only` line, and the
  value's field points at it with `aria-describedby`, so the breakdown is
  reachable without a pointer. One builder, two carriers, so the two cannot say
  different things. **A Table's computed cell carries the same text and spells it
  differently**, because the surfaces differ: a card has a field to hang
  `aria-describedby` on, and a cell has none — pointing the row's neighbouring
  input at a breakdown would describe the wrong number — but a cell *is* read as
  the contents of its `td`, so its twin is a `.sheetsmith-sr-only` span inside the
  cell with no ARIA wiring, which is the idiom a hidden column heading and the
  delete column's name already use. Added during review: this section had recorded
  the cell as carrying nothing, on the reasoning that the anchor is not a tab stop.
  **The two are separate facts**, and separating them is what makes the twin
  right: the card solved *no accessible text* without solving *not focusable*, and
  the cell had the same route available. `docs/UI.md` §9 carries the pair.
  **What is still not fixed** is the tab stop itself, which is the existing
  computed cell's gap carried across rather than one this feature introduces;
  making a value display focusable would add a stop per modified card and eighteen
  per skills card, which is a change to a component's keyboard model, not to this.
- **Which values get one.** A Card's `derived`, a Card set entry's `derived`, and
  a Table's computed cell — where a modified computed cell's breakdown joins the
  popover that cell already opens for its formula, rather than adding a control
  beside it. **A `total` does not**, because a total has no formula of its own to
  read a slot with; the fix an author wants is a Computed component reading
  `inventory.Weight + mod.self`, and the target is then that component's name.
  **A Pool's `max` does not**, for the same reason read differently: a modifier
  targets a published name, and a Pool's max is not one — its published name is
  the current value. "+2 to maximum HP" is a Computed or Card publishing
  `hp_max = base + mod.self`, with the Pool's `max` naming it. That indirection
  is a real cost and is stated in "Risks".

## What it does

A row of a table can declare a change against a value published elsewhere on the
sheet: it names a target, and a column of that table carries the amount. The
value's own formula reads `mod.self`, so however many rows push at it, the target
names no source and never has to be edited when the character buys something
new. Bonuses of the same declared type do not stack — the best bonus and the
worst penalty of a type apply, and types add — and the number on the card carries
a mark that opens a breakdown naming every contributor, including the ones the
stacking rule suppressed.

## Design

### The row, on the sheet

An inventory with `openRows` on gains two columns: **Modifies**, a `target`
column, and **Bonus**, a `number` or `computed` column with `modifier` on. The
Modifies cell is a `<select>` in the cell, on the `level` column's existing
`input: 'select'` clothes (`.sheetsmith-table-select`, UI §9's row for "a choice
from a closed list"), listing the targets that accept a modifier and showing the
stored value as an extra last line where it is not one of them. Most rows leave
it blank, which is a `<select>` on its own `—`, the same first line a Card's
dropdown shows and the same rule that no option is a default.

The Bonus cell is an ordinary number cell or an ordinary computed cell. Nothing
about either is new; what is new is that the column says its cell is an amount.

**Empty state.** A table with a target column and no row naming a target draws
exactly as it draws today, and every slot it could have filled is 0. Nothing
anywhere says "no modifiers", because that is the state of every new character
and a sheet full of notices about things that are absent is worse than a quiet
one.

**Error states.** Three, and each is already a shape this component has:

- A configuration error on the card alone (§10): two target columns, a `total` or
  `publish` on a target column, a `modifier` on a `text` or `toggle` column, a
  `modifierType` the layout does not declare. Each names the fix.
- A stray target in a cell: rendered, carried as the select's last line, with a
  `title` naming which of the two reasons applies.
- An amount that will not resolve: **the slot publishes nothing**, so every
  formula reading it fails and says which row stopped it. `Row "Belt of Giant
  Strength": ability is not defined on this sheet.` That is the aggregate's rule
  exactly — "one unreadable row fails the whole aggregate, and the error names
  that row… because a quietly wrong number is worse than a missing one" — and it
  is why the mechanism is a `FormulaError` thrown out of the slot's thunk rather
  than an `undefined` returned from it: a thrown `FormulaError` reaches
  `fieldReaders`' `explain`, which is what puts the sentence under the reader's
  eye. `buildSheetScope` memoises only what resolved, so nothing caches the
  refusal.

### The number, on the sheet

Covered in §9 above: the mark, the popover, the lines, the sr-only twin.

### The layout editor

- The `columns` list field gains two cells, **Modifier** (a checkbox) and **Bonus
  type** (a select over the layout's `modifierTypes`, blank meaning untyped). The
  options come from the layout rather than from a list inside the column, which
  is why this does **not** reopen §13's `select` column question: that one is
  blocked on a field kind, "a list whose cells are themselves lists", and there is
  no per-column list here to be one.
- A **Modifier types** field beside the function library in the layout editor
  pane, one name per line, on the function library's own shape.
- Under the columns field of a component holding a target column or a modifier
  column: the accepting targets, or the error described in §7 where there are
  none.

### What it reuses

| Thing | From |
| --- | --- |
| The name table's laziness, memoisation and cycle guard | `formula/sheet.ts`, unchanged |
| The row table's memoisation and re-entry guard | `formula/rows.ts`, unchanged, reached through a computed amount |
| Exact trimmed byte comparison for a stored choice | §4.2's Card option rule |
| Stray stored value rendered, not corrected | §4.2's Card option and `level` column rules |
| A choice from a closed list in a cell | `.sheetsmith-table-select` |
| The second door onto a hover | `ui/popover.ts`'s `showPopover`, opened by a press, as the computed cell already opens it — not `bindLongPress`, since a read-only number has no other use for a tap |
| Text for assistive tech only | `.sheetsmith-sr-only` |
| Float-safe summation | `roundSum` |
| "Does this expression mention this name?" | `referencesName` |
| Id rewriting rather than refusal | `migrateId` in `parse/layout.ts` |
| A row's reader-facing label | `RowValues.label` |

### Plumbing

Re-derived from `src/types.ts`, `formula/modifiers.ts` and
`formula/modifier-targets.ts` after review. The blocks below are the shapes as
built; where one departs from what this section first proposed, the departure is
named and its cause is another sentence of this same document rather than a design
change. Corrected after review, and the reason the correction is large is worth
recording: the section had drifted twice — once while building, once while
answering findings — so patching it would have described a shape that never
existed at any point.

**One new contract member, and it is a decision rather than a side effect.**
`scopeModifiers?(data, config): ModifierSource | undefined`. It sits beside
`scopeRows` in PATTERNS §3's member order, for the reason that file gives for
putting `scopeRows` beside `scopeValues`: it is the same job read a third way —
one publishes this component's names, one the rows that have none, and this the
changes it declares against names that are not its own.

It passes §4.1's rule squarely, which is the only thing that entitles it to
exist. The alternative is the formula engine knowing that a Table has a target
column, which column holds the amount, that a blank target is not a push, that a
blank number cell is zero, and that a computed amount is a formula evaluated in a
row scope. That is one component's data shape, and `scopeRows` cannot be reused
for it: `RowValues` carries cells by column key with no way to say which key is
the target. A factory for exactly `RowsSource`'s reason — an amount may be a
computed column reading the rest of the sheet, and the sheet is the thing being
built.

```ts
type ModifierSource = (
    resolve: FieldResolver,
    explain: FieldExplainer,
) => readonly ModifierPush[];
```

**It takes an explainer as well as a resolver**, which this section first left
out. Forced by the acceptance criterion seven lines further down: a slot refused
because one row's amount will not resolve has to name the row *and the reason*,
and a resolver returns null both for a field that was never declared and for one
whose expression threw. `ResetContext` already carries the pair for that exact
argument.

```ts
type ModifierPush = {
    /** The published name this pushes at, as the cell spells it. */
    target: string;
    /** The declared stacking type, or null for an untyped modifier. */
    type: string | null;
    /** The row as a reader sees it, never as the file spells it. */
    label: string;
    /** The component the row lives on, as its label reads. */
    source: string;
} & (
    | { amount: number; unreadable?: never }
    | { amount?: never; unreadable: string }
);
```

**Two departures, both forced.** The union of `amount` and `unreadable` is the
failure channel the criterion above needs, spelled the way `ColumnTotal` already
spells the same idea (`{ sum } | { unreadable }`) and made exclusive the way
`ScopeEntrySource` already makes `display` and `compute` exclusive. And `source`
is §9's own sentence made buildable: it asks a contributor line to name "the
modifier component's `label` and the row's label", which the row's label alone
cannot carry when two modifier tables each hold a row called "Ring". Set by the
component, since that is the only thing holding its own label at this point.

Table builds these from the same `rowViews` / `rowScope` helpers `scopeRows` and
`render` use, so the amount in a breakdown is the number in the cell — the
existing "a cell and a name computed from different accounts of one row" rule,
which is why those helpers are shared in the first place.

**`FormulaEnv` gains `modifiers: ModifierLookup`**, on `rows: RowLookup`'s exact
terms, with `NO_MODIFIERS` beside `NO_ROWS` for the paths with no sheet around
them. `buildSheetEnv` builds it in the same mutually-lazy construction the other
two are built in. `PublishedComponent` gains `modifiers?: ModifierSource` and
`explainer?`, the companion to its existing `resolver` that the source above
needs, and `publishedComponent()` fills both — which is what keeps the sheet view
and the harness from drifting, the reason that function exists.

**Two new modules, not one.** This section first proposed a single
`formula/modifiers.ts` holding "the namespace constant, the slot spelling, the
stacking rule, and the accepting-set check" — a list of four joined by "and",
which is PATTERNS §1's own test for a file doing more than one job, failed in the
proposal. As built:

- **`formula/modifiers.ts`** turns pushes into one number and one breakdown per
  target: the namespace constant, the slot spelling, the lookup and its three
  memos and guards, and the stacking rule. Against a live sheet, lazily.
- **`formula/modifier-targets.ts`** answers which published names accept a
  modifier at all: `ModifierTargetSource`, `modifierTargetSource`,
  `acceptingTargets`, `publishedNames`. A text scan over configuration that
  touches no push and no resolver, which is what lets the editor and the sheet
  reach one answer without a character in hand.

Both pure, so Constraint 5 holds; `parse/layout.ts` imports the reserved-id
constant from the first, which is the direction that dependency already runs.

**`modifierTargetSource(config, definition)` is the one assembly**, and it passes
`null` for data. Also a correction: the sheet built its own sources from a note's
data while the editor built them from the configuration, so a prose cell in a
totalled column or a section that would not read made the two disagree about
which values take a modifier. §7's "the layout editor and the sheet compute the
same answer from the same input" is what decides it, and `null` is that input.

**`buildSheetScope` gains one pass**: after registering every component's names,
register `mod.<name>` for each registered name, whose thunk asks the modifier
table. So a slot is a name in the same table behind the same guard, and the
domain of the namespace is the published-name set, which is §3's second rule made
structural.

**`FieldResolver` gains an optional third argument**, the published name this
evaluation produces; `FieldExplainer` gains the same one, or an explanation would
be produced under different scope rules from the failure it explains.
`fieldReaders` layers `mod.self` into the scope from `env.sheet('mod.' + name)` —
through the sheet, not around it, so the slot keeps the memo and the guard, and
with no fallback, since a `?? 0` there would turn §2.2's loud ring into a silently
wrong number. Card passes `config.id`; Card set passes `${config.id}.${entry.key}`;
Table passes `${config.id}.${row.key}` for the published column's cell and nothing
for a row with no key. The name table's own `display` path passes the name it is
registering, so publication and render resolve the same expression against the
same scope — which is the existing rule that a name and the cell it came from must
not disagree.

**`RenderContext.modifiers?: ModifierContext`**, on `link`'s terms — sheet-wide
knowledge a component cannot reach for itself, absent where there is no sheet,
and a component draws what it can without it (a target cell with no context
offers only its stored value, which is the truth where there is nothing
published).

```ts
interface ModifierBreakdown {
    lines: readonly ModifierLine[];
    total: number;
}

interface ModifierLine {
    /** The row as a reader sees it. */
    label: string;
    /** The component the row lives on, for wherever the row alone is ambiguous. */
    source: string;
    type: string | null;
    amount: number;
    /** Why this line contributes nothing, or null where it does. */
    suppressed: string | null;
}

interface ModifierContext {
    /** Targets that accept a modifier: the name, and the label to show for it. */
    targets: readonly ModifierTarget[];
    /** What applies at this name, in declaration order, and what it comes to. */
    breakdown(name: string): ModifierBreakdown;
    /** Whether the sheet publishes this name at all, accepting or not. */
    publishes(name: string): boolean;
}
```

**Three departures here, all forced by other sentences of this document.**
`breakdown` returns the total with the lines, because §8 puts the sum through
`roundSum` so "the breakdown's total, the number on the card and a formula reading
the slot cannot disagree" — and a caller re-adding the applied lines is a second
sum that could. `publishes` exists because §7 asks the stray target's `title` to
distinguish "the sheet publishes no `x`" from "`x` reads no modifier, so this row
changes nothing", and `targets` alone cannot tell those apart; a message saying
"either … or …" would send half its readers to the wrong place. And a
`ModifierLine` carries `source` for the reason `ModifierPush` does.

`breakdown` returns no lines for a name that does not accept a modifier, so a card
can never draw a mark for a modifier that is not being applied — the stray is
reported at the row that wrote it, which is where the fix is. The component never
holds the accepting-set rule itself.

**One shared painter and one shared text builder.**
`components/modifier-breakdown.ts` holds `MODIFIED_CLASS` and the one function
turning a breakdown into text, because the same text reaches two carriers — the
popover and a screen reader — and one builder is what stops them saying different
things. Both consumers (`card-face.ts` and `table.ts`) needed it, so it is on the
eslint allowlist that lets a component import a shared module, and
`isolation.test.ts` enumerates both spellings.

**One more module the layout editor needed**, and it is a correction rather than a
plan: `editor/field-lines.ts` names what a line is in a textarea field holding a
list of them. The bonus-types field was the third near-copy of one field module,
and the three held *two* definitions of a line — `trim` for a stored identifier
the UI matches on, `trimEnd` for a line of code — with nothing saying which
applied where. Both rules are right for their content; the defect was that neither
had a name.

### Interaction with the two cycle guards

Described honestly and not closed, per §13.

- **A ring entirely inside the name table** — a modifier whose amount reads the
  target it modifies — is closed by `buildSheetScope`'s `active`, loudly: the
  slot's walk fails, the slot throws with the row named, and the card shows `?`
  with the sentence. This is the case §2.2 is about.
- **A ring through a row set** — a modifier amount that aggregates over the table
  the modifier row lives in — is closed by the row table's guard, which refuses
  every walk in the ring, and the slot then publishes nothing for the same reason
  an unreadable row does.
- **A ring that both could catch** is §13's open question, untouched. This feature
  adds one new way to enter such a ring (through a slot), and the honest answer to
  whether it makes the grid-order-dependent `?` more or less likely is: **more
  entry points, no change to the rule**, because a slot is a name and so is
  entered exactly as any other published name is. What this feature must *not* do
  is warm the name table in a fixed order before drawing, which would make the
  race deterministic by biasing it toward the name table's guard — that is a
  change to which guard wins, which is §13's question, and it is not this
  feature's to take. So the slots stay lazy like every other name.

## Config fields

Component-level fields (`Table.configFields`) do not change: columns are already
one field of kind `columns`. What changes is the cells inside that field and the
column type list, plus one layout-level field. Each description states a
consequence, per PATTERNS §8.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `columns.*.type` = `target` | column type | Target | A cell holding the name of a value published elsewhere on the sheet, chosen from the ones that accept a modifier. The row then changes that value by whatever its modifier column holds. A target column cannot be totalled or published per row. |
| `columns.*.modifier` | boolean cell in `columns` | Modifier | This column's cell is an amount pushed at the row's target. The target's own formula has to read it as `mod.self`, or the row changes nothing. Number, level and computed columns only. |
| `columns.*.modifierType` | select cell in `columns` | Bonus type | Which of the layout's bonus types this column's modifiers are. Only the largest bonus and the smallest penalty of one type apply; different types add. Left blank, every modifier in this column stacks. |
| `modifierTypes` | layout field, one name per line | Modifier types | The bonus types this layout's modifiers may declare, e.g. item, status, circumstance. Two modifiers of one type do not add: the best bonus and the worst penalty apply. A type nothing declares is nothing stored, so removing one changes no character note. |

## Data and file model

**Nothing about the file format changes**, and Constraint 3 holds by not being in
the diff, which is the same sentence §13 used for containers. A `target` cell is
a cell in the markdown table like any other; a modifier column is a `number`,
`level` or `computed` column like any other, and a computed one is still never
written to the note. `read` and `write` are untouched beyond the new
configuration errors, which are `read`'s existing `configError` path.

- **Constraint 2** is not reached: the modifier table is `markdown` storage, and
  a target cell holds a name rather than a link. A wikilink in the *row name* of a
  modifier row keeps working exactly as it does today, which is what makes an
  inventory row a real link and a real modifier at once.
- **Constraint 4 and §10.** A layout that removes the target column or the
  modifier column leaves both cells in the note, unrendered and untouched, on
  §4.2's existing rule for a column the layout no longer declares. A layout that
  drops a `modifierType` touches nothing stored, because no cell ever named one.
  A layout whose target's formula stops reading `mod.self` loses the effect and
  keeps every cell, and the sheet says so at the row.
- **A target cell reaches a row scope as its own text**, because `rowScope`
  layers every non-computed cell by column key and `cellValue` falls through to
  the trimmed string. That is exactly what a `text` cell already does, so
  `sum(inventory, Modifies)` fails naming the row and the value, as it already
  does over a text column. No special case, and none wanted.
- **Existing character notes** are unaffected. No section is rewritten by opening
  one, and a note written before this feature has no target column to read.
- **`mod` as a component id** is rewritten on load, which moves no note: sections
  are keyed by `label`.

## Acceptance criteria

- [x] `mod.armour_class` resolves to 0 on a sheet publishing `armour_class` with
      nothing pushing at it, and fails as an unknown name on a sheet that
      publishes no such name. Two test names in `formula/modifiers.test.ts`.
- [x] A Card whose `derived` is `value + mod.self` shows the stored value plus
      the pushed total, and its published name is the same number.
- [x] A Card set whose `derived` reads `mod.self` modifies **only** the entry a
      row targeted: pushing at `abilities.DEX` moves DEX and leaves STR alone.
- [x] A Table's computed column reading `mod.self` modifies a declared row
      carrying a `key` and resolves to the unmodified number — not `?` — on a row
      with no key.
- [x] Two modifiers of one declared type give the larger; two of different types
      add; two untyped ones add; a bonus and a penalty of one type give both.
      Table-driven, one case per line.
- [x] Shuffling the push list produces the identical total for every case above.
      This is the assertion standing in for a priority field.
- [x] A modifier whose amount will not resolve makes its slot publish nothing,
      and the reading card's `explainField` names the row and the reason.
- [x] A modifier row whose amount is 0 changes no number and appears in no
      breakdown.
- [x] A modifier row on a table with `openRows` on works, and
      `<table id>.<that row's name>` still fails as an unknown name.
- [x] Parse then serialise is byte-identical for a note holding a target column,
      a filled target cell, and a blank one.
- [x] A layout whose component id is `mod` loads with that id rewritten, and the
      note's sections still read.
- [ ] `configError` refuses, each with the fix in the message: two target
      columns; `total` on a target column; `publish` on a target column;
      `modifier` on a text column; `modifier` on a toggle column, naming a
      computed column as the fix; a `modifierType` the layout does not declare.
- [x] A stored target the sheet does not publish renders as the select's last
      line and is not corrected by any edit to another cell in the row, and the
      note keeps its spelling on write.
- [x] The target cell's picker offers exactly the accepting targets, and the
      accepting set is unaffected by whether a `mod.self` sits inside an `if`.
- [x] `contract.test.ts` accepts `scopeModifiers` in its declared position and
      still refuses a member outside the contract.
- [x] `isolation.test.ts` still passes: `formula/` imports nothing from
      `obsidian`, and no component imports a sibling.
- [x] In the harness, both themes: a modified card shows the dotted mark, and
      pressing the number opens a breakdown naming two contributors, one of them
      suppressed with its reason.
- [x] In the harness, the layout editor shows the accepting-targets list for a
      table with a modifier column, and the "no formula reads a modifier" error
      for one where nothing does.
      **Met by another route:** the accepting-targets list is in the harness
      (select **Magic items** in the editor pane), and the empty-set error is not
      — the harness has one layout and both `abilities` and `armour_class` read
      `mod.self`, so making the error reachable there would break the sheet half
      of the criterion above. It is held by `layout-editor.test.ts` 'reports a
      layout whose modifiers change nothing'. Corrected after review: the harness
      has no mechanism for a second layout and building one is not this feature's
      work.
- [x] The harness and the sheet view publish modifiers through the same
      `publishedComponent`, asserted the way the row table's version already is.
      **Met by another route:** modifiers no longer go through
      `publishedComponent` at all. The push side does, and the two sheet-wide
      members go through `sheetModifiers` and `modifierTargetSource`, because the
      accepting set turned out to be a property of the layout rather than of a
      note. Held the way this criterion intended — by scans over both hosts *and*
      the editor, in `sheet.test.ts` 'the sheet has one modifier context' and 'the
      accepting set has one assembly'.
- [x] `npm test`, `npm run lint` and `npm run build` pass. `styles.css` agrees
      with `src/styles/` (the existing guard test).
- [x] **The fixture exists as two files in this repository and is verified here.**
      `src/test/fixtures/modifiers/Modifier variations.json` and
      `src/test/fixtures/modifiers/Ilona.md` carry, literally: an inventory with a
      target column and three modifier rows, two of them the same type at
      different amounts; a Card set with a `mod.self` derived; a row targeting a
      name that reads no modifier; a target cell holding a name the sheet does not
      publish; and a *second* modifier table, so the qualified breakdown form is on
      the sheet rather than something the reader builds first.
      `view/vault-fixture.test.ts` runs both through the real layout parser, the
      real character parser and Table's real `read`, and asserts the numbers the
      press steps below promise — including the exact text of two breakdowns, which
      is what a reader will read in the popover. This is the half that is checkable
      from the repository, and it is what the criterion below is *for* — a recipe
      nobody can check is how the criterion under it came to be a claim.
- [ ] **The owner has copied those two files into the throwaway vault**, as
      `Sheetsmith layouts/Modifier variations.json` and `Characters/Ilona.md` —
      not Aramil, who is deliberately a plain sheet — and pressed the ten steps in
      `## The throwaway vault fixture` below. Not checkable from the repository by
      construction (`AGENTS.md` puts the vault outside it), and every step needs
      the app: a hover preview, a rename propagating, a real markdown render, an
      actual `<select>`. Deliberately separate from the criterion above, because
      "the files are right" and "somebody looked at them in Obsidian" are two
      facts and only one of them has a test.

## The throwaway vault fixture

A vault fixture lives outside the repository (`AGENTS.md`) and its recipe lives
inside it. **The recipe used to be this section's prose, and that is why nobody
built it**: a description of a JSON shape and a table of rows is something to
transcribe, and transcribing is work with a wrong answer available at every step.
The fixture is now two literal files, checked in:

| Copy this | To here in the vault |
| --- | --- |
| `src/test/fixtures/modifiers/Modifier variations.json` | the layout folder, `Sheetsmith layouts/` by default |
| `src/test/fixtures/modifiers/Ilona.md` | `Characters/`, beside the other fixture notes |

Copy them; do not retype them. **Keep both filenames exactly**, because
`sheet-layout: Modifier variations` in the note's frontmatter resolves to
`<layout folder>/Modifier variations.json` (`src/layouts.ts`) — the layout is
found by filename, not by its `name` key, and `view/vault-fixture.test.ts`
asserts the two agree.

**The names follow the vault's own convention rather than this document's
preference**, which is what the first attempt got wrong: the layout folder holds
seven `<X> variations.json` fixtures beside one real layout, so a file called
`Modifiers test.json` sorts and reads as neither. Singular **Modifier**, matching
`Flag variations` and `Dropdown variations`. `Ilona.md` stays a person's name,
which `Characters/` already establishes with `Aramil.md` and `Sera.md`.

**Not Aramil**, who is deliberately a plain sheet: this is a second character on
a second layout, so the plain sheet stays plain.

**Files rather than fenced blocks in this document**, and the trade is worth
stating since a fence would have matched `docs/SPEC.md` §3.1's precedent. A fence
cannot carry a filename, and the filename is load-bearing here. It also cannot be
the source of truth without something extracting it back out — a second parser to
maintain, and one more thing to drift. Files mean this document holds no copy at
all, so there is nothing to fall out of step, and `docs/PATTERNS.md` §2 already
names `src/test/` as the home of "the fixtures". What is lost is that you cannot
read the fixture without opening two more files; that is the cost, and it is
smaller than the one this section already paid.

**Constraint 2, before anyone flags it.** `Ilona.md` holds
`[[Ring of Protection]]` in a markdown table with no fence around it, which is
what the constraint asks for rather than an exception to it — a link-bearing
component stores as plain markdown, and a target cell is a name and not a link.
And had this gone in a fence in *this document* instead, that would also have been
fine: `docs/SPEC.md` §3.1 already shows a character note with
`[[Bag of Holding]]` inside a ````markdown` fence. The constraint is about what
the plugin writes into a note, where Obsidian's indexing is the stake, not about
what a document quotes.

**What the files hold**, as a reading aid rather than as a spec — the files
themselves are the spec, and `src/view/vault-fixture.test.ts` is what holds them
to it:

- `columns: 6`, matching every other layout in that vault. The plugin's own
  default is twelve; six is what the eight files there already use, and a fixture
  laying out on a different grid from its siblings looks different for a reason
  that has nothing to do with what it tests.
- `modifierTypes`: `item`, `status`, `circumstance`. The third is declared and
  unused on purpose, which is what a layout carrying a system's whole list looks
  like.
- A **Card set** `abilities`, six entries,
  `derived = floor((value - 10) / 2) + mod.self`. The headline case: one formula
  per entry, so only the entry a row targeted moves. Scores 15/14/13/12/10/8.
- A **Card** `armour_class`, `derived = 10 + abilities.DEX + mod.self`.
- A **Card** `passive_perception`, `derived = 10 + abilities.WIS` — no
  `mod.self`, so it is published and accepts nothing. This is the row the sheet
  has to say something about.
- A **Table** `magic_items`, `openRows` on, `rowHeader` **Item**, four columns:
  **Modifies** (`target`), **Bonus** (`number`, modifier, type `item`), **Aid**
  (`number`, modifier, type `status`), **Notes** (`text`).
- A second **Table** `worn_items`, `rowHeader` **Worn**, with a target column and
  one `item` modifier column. **In the layout rather than something the reader
  builds**, which is a reversal of what the prose recipe asked for; the reason is
  the next paragraph.
- Six rows in `## Magic items` and one in `## Worn items`. The last two Magic
  items rows are the point of that table — a `passive_perception` target that
  reads no modifier, and an `armor_class` target the sheet does not publish — and
  **both are in the file already**, which is the one thing the prose version got
  right to insist on and the one thing it made hardest: the picker offers neither,
  so by hand they would each have to be typed in.
- A preamble in the note, above the first `##`, listing the four things worth
  looking at. That is the vault's own convention rather than an invention — five
  of the six fixture notes in `Characters/` carry one, in the same voice — and it
  is what puts the orientation where the reader is standing. It is short on
  purpose: the ten steps below stay here, so there is no second copy of them.

**The second modifier table is now shipped rather than built, and that is a
decision against the prose recipe.** Step 6 used to say "copy Magic items to a
second table called Worn items"; it now says to look at what is there and then
delete one row. Three reasons, the first decisive. **An unbuilt step is a step
nobody performs** — that is the whole lesson of this fixture having sat unmet, and
asking for a table to be constructed before the qualified breakdown form can be
seen at all makes the feature's own differentiator the hardest thing on the sheet
to reach. The delete direction also shows the *harder* half of the rule: the
prefix is decided once per breakdown, so the line that never collided loses its
prefix too, and only removing the second source shows that. And the second table's
row is the same `item` type at the same amount as the first's ring, so the fixture
now carries **both** suppression wordings — "a larger item bonus applies" on the
Gauntlets and "another item bonus of the same size applies" on a ring — which
`formula/modifiers.ts` has two of and which nothing else on one sheet showed
together. The argument the other way is real and was weighed: constructing the
table proves the *appearing* direction, and a reader who never builds one does not
learn that the prefix arrives on its own. The delete step buys the same fact in
the direction that costs one row instead of a whole component.

Two decisions the prose recipe left open, taken in the files and recorded here so
they are not read as drift: both cards carry `hideValue` and `hideNote`, since
neither formula reads a stored `value` and an empty field under a working number
reads as missing data; and the note holds only the sections its components store
into, because the two cards store nothing. The prose named neither, and the scores
its own arithmetic needs were never in it at all.

**What to press.** None of this is automatable and that is the point of the
vault: a hover preview, a rename propagating, a real markdown render and a real
`<select>` all need the app. Where a step's *arithmetic* is checkable it is
already checked in `vault-fixture.test.ts`, so a step failing here is about the
surface rather than the sums.

1. **Change one amount and watch the card and the breakdown move together.**
   Change the Belt's Bonus from 2 to 4. The STR card goes from +5 to +7, and
   pressing the number lists the Belt at +4 with the Gauntlets still suppressed.
2. **Delete the larger of the two same-type rows and watch the suppressed one
   take over.** Delete the Belt. STR drops to +4 — the Gauntlets' +1 plus the
   status +1 over a base of +2 — and the Gauntlets' line loses its "(not
   applied)" clause.
3. **Check that only the entry targeted moved.** DEX, CON, INT, WIS and CHA are
   whatever their scores say and carry no mark.
4. **Open the two stray target cells.** Cloak of Displacement says
   `passive_perception` reads no modifier; Amulet of Misspelling says the sheet
   publishes no `armor_class`. Two different sentences, because the fixes differ.
5. **Choose something else in a stray cell and check the line goes.** Point the
   Amulet at `armour_class`; the raw last line of the select disappears and the AC
   breakdown gains a third contributor — **and the number does not move**, because
   a third item bonus of +1 is a third tie and only one of them applies. That is
   the stacking rule and the provenance surface answering the same press
   together.
6. **Look at the two-table breakdown, then delete one row and watch every prefix
   go.** Armour class draws on both tables, so its breakdown reads
   `Magic items · Ring of Protection — item +1` and
   `Worn items · Ring of Protection — item +1 (not applied: another item bonus of
   the same size applies)`. Delete the Worn items row: **both** prefixes go, not
   just the one that collided, because they genuinely all come from one place now.
   Then compare with the STR card, whose three lines carry no prefix at all while
   its table is the only source. The two rows are also spelled differently in the
   file — one is `[[Ring of Protection]]` and one is plain text — and read
   identically on screen, which is what makes the table's name the only thing
   telling them apart.
7. **Check the wikilink still works.** The Ring of Protection row is a live link
   with a hover preview and a working rename — Constraint 2, which a target cell
   never reaches because the table is markdown storage.
8. **Rename a component and check nothing was lost.** Rename the `armour_class`
   component's *label* in the layout editor. Every modifier still applies,
   because a target cell holds the id.
9. **In the layout editor, select Magic items.** Under the columns list it names
   the values this layout takes a modifier for. Remove `+ mod.self` from every
   formula and it becomes the error saying nothing on the layout reads one.
10. **Delete `item` from Bonus types**, in the panel behind the tree's `Layout`
   row. The Bonus column's select carries `item (not declared)`, the bonus-type
   field reports it, and the arithmetic on the sheet does not change — no cell
   ever named a type. (This step said "Modifier types" until the field was
   renamed during review; the heading is **Bonus types** and the layout key is
   still `modifierTypes`.)

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. **feat: Add the `mod.` namespace to the sheet's name table.**
   `formula/modifiers.ts` with the namespace constant, the slot spelling, the
   lookup and `NO_MODIFIERS`; `FormulaEnv` and `buildSheetEnv` wiring;
   `buildSheetScope`'s slot pass; the 0-where-empty and fail-where-unpublished
   rules. Tests over the formula layer alone.
2. **feat: Stack modifiers by type rather than by priority.** The stacking rule
   and the breakdown lines, table-driven, including the shuffle assertion.
3. **feat: Let a component declare the modifiers it pushes.** `ModifierPush`,
   `ModifierSource`, `scopeModifiers` on the contract, `PublishedComponent` and
   `publishedComponent`, PATTERNS §3's member order, `contract.test.ts`.
4. **feat: Give Table a target column and modifier columns.** The column type,
   the two column keys, `configError`'s new refusals, `scopeModifiers`, the
   round-trip tests. No picker yet: the cell is a text cell at this commit, which
   builds and passes.
5. **feat: Read a modifier slot as `mod.self`.** `FieldResolver`'s third
   argument, `fieldReaders`' layering, and Card, Card set and Table passing the
   name they publish under.
6. **feat: Pick a modifier's target from what the sheet publishes.** The
   accepting-set check, `RenderContext.modifiers`, the cell's select, the stray
   line and its two titles.
7. **feat: Show what a modified number is made of.** The mark, the popover
   breakdown, the sr-only twin, the computed cell's joined popover, and the one
   stylesheet rule the mark needs.
8. **feat: Configure modifiers in the layout editor.** `modifierTypes` on the
   layout and its field, the two new cells in the columns field, and the
   accepting-targets surface with its empty-set error.
9. **docs: Record item modifiers against the spec axis.** SPEC §2's vocabulary,
   §4.1's new member, §4.2's Table entry and column types, §5's namespace rules,
   this document's status, PATTERNS and UI where the new vocabulary lands, and the
   vault fixture — `src/test/fixtures/modifiers/`, `view/vault-fixture.test.ts`
   and PATTERNS §2's line for the folder go here too, since the fixture is
   documentation of what to put in a vault rather than a feature of the plugin.
   `/land-it` writes the §13 `Resolved:` entry here, and corrects the aggregate
   entry's sentence about Custom System Builder.

## Deliberately not doing

- **Grouped conditional modifiers.** CSB issue 155 wants modifiers whose
  application a person chooses at use time, and its two examples are the whole
  shape: "Fast Runner", +1 to Running always, against "Happy Smith", "You gain a
  bonus on Smithing in the amount of the level when you're in a good mood". CSB
  answered with a ConditionalGroup field on the modifier **and** a Conditional
  Modifier List component to display the group, because a modifier the sheet
  cannot decide has to be shown to someone who can. Two surfaces, not a flag.
  **The ungrouped case is already expressible, and this was checked rather than
  assumed**: a modifier's amount may be a computed column, `rowScope` puts every
  non-computed cell of the row in scope by column key, a `toggle` cell arrives as
  a boolean, and `if` is a builtin — so "Happy Smith" is a toggle cell the player
  ticks plus `if(Mood, level, 0)` in the amount column, today. What v1 lacks is
  one switch governing many modifiers, and the display surface for it.
- **Multiply and override operators.** CSB's `* / =`, Foundry's Multiply and
  Override. These are precisely the operators that cannot fold into one number
  per target, so taking them forces the real application pass, plus CSB's
  operation-order rule (set, then multiplication, division, addition,
  subtraction, and "if multiple modifiers share the same priority and operation,
  their order is irrelevant") on top of a priority integer. Foundry carries the
  same pair — a priority integer and a mode order of Custom, Multiply, Add,
  Upgrade/Downgrade, Override — and both carry both because they do different
  work: priority sequences unrelated modifiers, the operation order stops set and
  add racing. Deferring them is what keeps the single pass.
- **A priority field.** Not deferred so much as unnecessary, and asserted: with
  addition and typed max only, the result is order-independent.
- **A modifier row that names two targets**, and **a row whose type varies from
  its neighbours'**. One target column per table, and the type on the column. A
  row that changes two values is two rows; a table whose rows carry two types is
  two modifier columns.
- **A modifiable Pool max, or a modifiable column total, reached directly.** Both
  go through a published name that has a formula of its own. The indirection is
  real and stated in §9.
- **A `select` column type.** §13 stays open and untouched; the two cell controls
  this feature adds carry no per-column options list, which is the half that
  question is blocked on.
- **Which tables this does not serve**, kept as documentation hygiene rather than
  as work. Lancer's Accuracy and Call of Cthulhu 7e's bonus dice both change the
  *dice* rather than the number, and both resolve by cancellation — "one bonus die
  and one penalty die cancel each other out". SPEC §11 rules dice out of scope,
  so neither is a case to build. What they establish is that **"a modifier is a
  number applied by an operator" is a 5e-shaped assumption**, and this feature's
  own documentation should say which tables it does not serve rather than leaving
  that to be discovered by someone who assumed it was general.
- **Closing the two cycle guards' mutual ignorance.** §13's question, interacted
  with above and not touched.
- **Strings, and a collection value, in the expression language.** Both §13
  decisions this design leans on rather than reopens.

## Risks

Three, all of them stated above and collected so a reviewer does not have to
reassemble them.

1. **A component that forgets to pass its published name to the resolver
   silently reads `mod.self` as 0.** That is the mirror-image bug inside our own
   code rather than in a layout, and the static accepting set will still claim the
   name accepts a modifier. It is caught only by a test per publishing component,
   which is why one is an acceptance criterion for each of Card, Card set and
   Table. `contract.test.ts` cannot see it.
2. **The accepting set is coarse at the component and over-reports.** A Table
   where only the computed column reads a slot reports every name that Table
   publishes as accepting, including a column total, so the picker may offer a
   target that ignores the row. §5's aggregate edge has exactly this shape and
   this direction; the sheet's stray line is the backstop, and it cannot fire for
   an over-reported target. Making it exact needs the name-to-field pairing, which
   `compute` is opaque to by design.
3. **A target has to be given a `derived` to become modifiable**, which changes
   what its card looks like. Mostly a gain — the modified number over the base is
   the provenance floor for free — but it is an appearance change forced by an
   arithmetic decision, and a Card that wanted no derived display has to reach for
   `hideValue` to get one back.

## Corrections after review

What review found this document had got wrong about its own code, and what was
changed here as a result. Listed rather than folded in silently, because a spec
edited to match the code stops being a check on it: the point of the section is
that a later reader can see which sentences were *corrected* and which were the
plan all along.

Two kinds of entry, kept apart because collapsing them is how the section would
start lying. **A correction** is a sentence of this document that was false about
its own code. **A decision taken during review** is a sentence that was true and
was deliberately changed or narrowed with the owner's agreement — there are three,
each marked, and an earlier draft of this section claimed there were none.

Where the build merely departed from a sentence without changing its intent, the
cause was another sentence of the same document, and the Plumbing section names
each departure beside the shape it produced.

| What was wrong | Corrected to | Why, and which finding |
| --- | --- | --- |
| §2.1 said "One pass, two guards, both already there" | Three guards; the third is the modifier walk's own | The walk re-enters itself without it, so it was never optional — the count predates the walk existing (F3) |
| §4 said reading `mod.<target>` elsewhere "costs nothing to allow", unqualified | The same, *outside a modifier amount*, plus what happens inside one | Inside an amount it is refused, and **whether** it is refused depends on evaluation order — measured, not reasoned: cold it is refused, and after any earlier walk the name table's guard fires instead and it resolves. Same grid-order cost SPEC §5 already records for the two existing guards, left alone for the same reason (F3) |
| §9 asked a suppressed contributor line to be drawn "faint" | "faint" struck; the `(not applied: …)` clause carries it | The same bullet requires one `textContent` popover, which admits no per-line styling, so the two sentences could not both hold. `docs/UI.md` §9 records the trade (F5) |
| Criterion 18 asked the harness for the empty-set error | Met by another route, naming the test | One harness layout, and both `abilities` and `armour_class` read `mod.self`, so making the error reachable would break criterion 17's sheet half. A second harness layout has no mechanism and is not this feature's work (F6) |
| Criterion 19 named `publishedComponent` as the shared path for modifiers | Met by another route, naming `sheetModifiers` and `modifierTargetSource` | The accepting set turned out to be a property of the layout rather than of a note, so it moved off the data-derived path entirely. Held by scans over both hosts *and* the editor (P2) |
| The whole `Plumbing` section | Re-derived from `types.ts` and the two formula modules | It had drifted twice — once while building, once while answering findings — so it described a shape that never existed at any point. Every departure is now named with the sentence that forced it |
| §9 said unconditionally "The source is the modifier component's `label` and the row's label" | The same, plus the rule that the component's label shows only where a breakdown draws on more than one component | **Decision taken during review, not a correction.** The owner ruled "implement the sentence" and accepted the narrowing once the rule was stated: a token identical on every line carries no information, which is already why an untyped modifier says nothing. The rule's home is `docs/UI.md` §9; `modifier-breakdown.test.ts` holds it, reddening 5 cases if it always qualifies and 3 if it never does (F4) |
| §7 and the Design bullet gated the accepting-targets surface on "a component holding a modifier column" | Either half of a modifier row — a target column or a modifier column | The gate as built is target-or-modifier, and the broadening is what makes §7's own case work: a modifier column added before the target column used to get the "no target column" footnote and not the empty-set error (F2) |
| §9 recorded the Table cell as carrying no breakdown text, since its anchor is not a tab stop | The cell carries a `.sheetsmith-sr-only` span inside its `td`; the tab stop is still the open half | **Decision taken during review.** Not focusable and no accessible text are two facts, and the card had solved the second without the first — the cell had the same route available. Raised as a new finding on a verification pass and folded in as one clause and no code (P5) |
| Three of the twins' near-identical lines were argued as unextractable | The two twins now share `editor/line-list-field.ts` | **Decision taken during review, and a reversal of my own position.** The first estimate compared all three textarea fields and concluded about the two: measured against each other the twins share 72 stripped lines and differ only in a layout key, a parse callback and eight copy strings, and the two variations that carried weight belong to the function library alone. The function library stays a cousin (P1) |
| Criterion 21 asked for a vault fixture and this section called it "not checkable from the repository", so nothing checked any of it | Two literal files in `src/test/fixtures/modifiers/` and `view/vault-fixture.test.ts` over them; the criterion split into a repo half (met) and an owner half (open) | The owner reported no example in the vault, and the cause was the recipe's *form*: prose describing a JSON shape is something to transcribe, so it never got built. "Not checkable" was true of the *pressing* and was quietly applied to the whole thing — the files' correctness and their arithmetic were always checkable, and `AGENTS.md`'s own argument for keeping the recipe in-repo is that a reviewer can check it. Nothing about the recipe's content turned out to be wrong; two things it never said (the ability scores, and what the two cards do with a stored value) had to be decided, and one control it named had been renamed during review |
| The fixture layout was called `Modifiers test.json`, and step 6 asked the reader to build the second modifier table by hand | `Modifier variations.json` on the vault's own `<X> variations` pattern; `columns: 6` to match all eight siblings; the second table shipped in the layout, and step 6 rewritten as look-then-delete | **Both found by placing the files in the vault, which the repository could not have told us.** The layout folder holds seven `<X> variations.json` fixtures and one real layout, so the old name sorted and read as neither, and every layout there is `columns: 6` where the plugin's default is twelve. The step-6 reversal is a decision rather than a correction: an unbuilt step is a step nobody performs, which is this whole fixture's history, and shipping the table also puts *both* suppression wordings on one sheet. The delete direction shows the harder half of the prefix rule for the price of one row. The note also gained a preamble, which five of the six fixture notes in `Characters/` already carry |

Two things in the code changed as part of this rather than in the document:

- The third guard's refusal message asserted "one of them is waiting on the total
  it is part of", which is false whenever the amount read a *different* target's
  slot — the common shape of that refusal, and the one that sends a reader hunting
  for a self-reference that is not there. It now says only what it has
  established, and `modifiers.test.ts` holds it to that (F3).
- Criterion 9's test probed `items.Belt`, which is nobody's row; and criterion
  13's clause "not corrected by any edit to another cell in the row" had no
  assertion at all. Both now name what they mean, in `table.test.ts`.

Left alone deliberately:

- **Criterion 12**, the undeclared-`modifierType` refusal. `configError` is handed
  a config and never the layout, so no component can make that check; it is
  reported by `parse/modifier-types.ts` and surfaced in the editor instead. That
  is an open decision with the owner, and whichever way it goes changes what this
  criterion should say, so the criterion is untouched.
- **The owner's half of the vault fixture**, now criterion 22. Not checkable from
  the repository, and confirming it is the owner's. What *was* left alone here and
  should not have been is the other half: see the last row of the table above.
