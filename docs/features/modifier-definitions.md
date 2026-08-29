# Modifier definitions

Status: shipped
Board card: ✨ Modifier definitions — the layout names the changes that repeat,
a character's row types its own or names one of those, and an override lands
before the additions rather than wiping them

## Model question

This feature exists to answer one §13 entry, and that entry is its charter:
**"Whether the modifier row's authoring surface stays a target column and a
modifier column."** It does not. That entry names three things it left open, and
all three were settled with the owner at a hard stop before this document
existed. What is written here is the argument, in enough detail that `/land-it`
can lift a `Resolved:` entry out of it. **Nothing is resolved until it is built,
so §13 is not edited here.**

**One convention, because this section now has eight numbered parts and `SPEC` has
thirteen.** A bare `§1`–`§8` is a numbered part of *this* section. A reference to the
specification carries the prefix — `SPEC §5`, `SPEC §7`, `SPEC §10` — **wherever the
number could be read as one of these eight**, which is `SPEC` §§1–8 and no others:
`§4.1`, `§4.2`, `§10`, `§11`, `§12` and `§13` are unambiguous bare and are left bare
rather than swept, because a churn of sixty references is a diff nobody can review for
a hazard that does not exist. The two collisions that matter are `SPEC` §2's "values
only, never structure" and `SPEC` §7's layout pane, both quoted constantly here, so
those two are always prefixed.

The order they have to be taken in, because each one decides the next: where a
modifier lives, what the authoring surface therefore is, how an override joins
the arithmetic without dragging Foundry's priority integer in behind it, what a
cell's bytes mean once a row can hold its own effect, and what `SPEC` §2's "values only,
never structure" is read to mean now that it can.

**What survives, and is not rebuilt.** The `mod.` namespace and the slot table
(`formula/modifiers.ts`), the accepting-target machinery
(`formula/modifier-targets.ts`), `scopeModifiers` on the contract, the typed
stacking arithmetic, the two override phases, the provenance breakdown
(`components/modifier-breakdown.ts`), the honest mark on a row that changes
nothing — which survives as the glyph's shape rather than as the class that carried
its name (Corrections), the harness's `&press=` parameter, and the vault fixture.
The engine that applies a modifier is the shipped engine.

**What it replaces.** The `target` column type, the `modifier` and `modifierType`
column keys, `MODIFIER_AMOUNT_TYPES`, `amountOfCell`, and the layout editor's
columns-line controls for the pair.

**Three waves, and this document is the third.** The owner has reopened the
authoring surface twice after it was built, and a reader working through this
section must never be sent to build something already rejected — so every affected
passage is **rewritten in place** and the Corrections table is the index of what
moved. The waves, so a reader can tell which sentence belongs to which decision:

1. **One icon column per modifier, a `target` cell beside an amount cell.** Built,
   reviewed on all three axes, remediated. Retired because a table carrying two
   modifier columns drew two glyphs on a row applying two modifiers.
2. **One glyph per row, and a popup on it managing which of the layout's named
   definitions the row enrols in.** Built, reviewed, remediated. It produced a
   picker, twice, and the popup was Obsidian's own `Menu`.
3. **This one. One glyph per row, and a *form* on it, in which a row's own effect
   is typed.** The owner, verbatim: *"It continues to be a dropdown. I want to be
   able to set the row formula, not select an already existing one."*

**The third wave reverses the second's model decision, and the reversal is the
honest word for it.** At the wave-2 hard stop the owner was offered exactly two
shapes — a form in which a row's effect is typed, or a picker over named
definitions with editing confined to the layout editor — and chose the picker. They
have now chosen the other. The earlier answer is not still binding and is not
re-argued anywhere below; §1 and §2 are rewritten to the new one, and the
Corrections table records it as a decision taken during review rather than as a
correction, because nothing about wave 2 was false.

**What the third wave changes.** §1 gains a second tier. §2 is a form rather than a
menu. §6 is rewritten: a cell part may be a definition name *or* an effect typed on
the row. §7 is new, and is the one that pays for all of it — the reading of `SPEC` §2 that
licenses a row-typed effect, with the edge that stops the next feature widening it.
§8 is new: promotion, which is the first thing in this plugin that would edit a
layout from a character's sheet.

**§3 and §4 stand, and "stand" is not "untouched" — two paragraphs in each were
rewritten and the Corrections table has both.** The override's arithmetic, its two
phases and the argument against a priority integer are exactly as they were; what
moved is one paragraph of §3 whose stated reason this wave spends (a confirmation at
selection time was refused partly because there was no panel to draw it in, and now
there is), one paragraph added saying a typed override contests on identical terms,
and two of §4 — the condition now arriving from either tier, and the third bullet's
reason for keeping a flag in a column of its own, which has now had its stated reason
spent twice. Saying "untouched" of a section with four edits in it is the exact failure
the Corrections table exists to catch, so it is said the other way round here.

### 1. Where a modifier lives. Settled three times: two tiers.

> **The layout names the changes that repeat, and a row may type its own. A cell
> part is either the name of a layout definition or an effect the row spells out.**

**Both tiers, and the vendor's advice is to prefer the first.** That is what every
tool surveyed converged on, and the previous wave went against the one finding the
survey was unanimous about.

- **Custom System Builder shipped both and recommends the shared one.** Its wiki,
  on template modifiers on `_equippableItemTemplate`: they are "applied to every
  Item created from this template… **This leads to less modifier-redundancy and
  should be used wherever possible**." Its `getModifiers()` in `TemplateSystem.ts`
  reads template modifiers through a live `getGameCollection('item').get(...)`
  lookup on every evaluation, then concatenates the copied per-instance ones. Two
  tiers, one live and one copied, and the advice is to use the live one.
- **Foundry's own open epic proposes the same pair.** Issue #4451 "Referenced Owned
  Items" is labelled `epic`, open since January 2021, accepted by the lead
  developer and deferred twice; what it proposes is a per-item choice at drop time
  **plus a one-way "detach to instance" button**. So the tool whose data model is
  copy-only wants the reference tier, and the tools that have the reference tier
  keep the instance tier beside it.
- **No tool surveyed shipped reference-only**, and the previous wave chose it
  knowing that. That is the finding this wave follows rather than overrides, and
  the owner's sentence is the same finding arriving from the other direction: the
  common case is a one-off, and a one-off through a shared library is a layout edit
  for a thing that will be named once.
- **Sandbox System Builder is still the shape of the named tier**, and its
  vocabulary is still the right one. A cItem owned by an actor is a plain object in
  `actor.system.citems[]` of the shape
  `{ index, citem, once, exec, attribute, expr, value }` — and **the field deciding
  ADD against SET is never written to the actor at all**. `getMods()` resolves the
  shared document and reads `type`, `attribute`, `value` and the condition fields
  fresh from it on every evaluation. The actor's entry is an **enrolment**, not a
  definition. A named part of a cell is exactly that.

**What the second tier is not, stated first because it is the whole hazard.** It is
**not a copy of a definition**, and nothing in a note is ever a copy of one. Sandbox
caches on the actor what a shared definition *did* — `_mod.value`, `_mod.attribute`
— and its un-apply path subtracts from that cache, so editing a definition's target
while owners hold `exec: true` corrupts each owner's reversal. Its
`checkcItemConsistency` only ever *adds* missing records; the branch that would
refresh a changed one is commented out in the source, and its `disabledmods` field
is written and never read. So the shipped rule stands, word for word:

> **The character note holds no derived record of what a modifier did.** A named
> part holds which definition the row enrols in and nothing else. A typed part
> holds the effect itself, which nothing else holds. Everything recomputes from
> what is written on every render.

That is **verified rather than asserted**: `CardData` is `{ value?, note? }`,
Table's `write` serialises `storedColumns` only and a computed column "is never
written to the note", and the slot is a lazy thunk in the name table. Nothing
anywhere writes a resolved number back. It is also the answer to **Sandbox issue
#15** — "If the cItem is removed, it leaves the attribute with the number it was
set" — which cannot arise here: deleting a definition, or a row, or a part, or
switching an item off, changes what the next render computes and touches no byte
the plugin did not just write.

**And a typed effect is not a cache because nothing else holds it.** The distinction
is exactly the one Sandbox got wrong: a cache is a second copy of a fact whose first
copy can move underneath it, and a typed effect has no first copy. That is also why
**promotion converts the row that promoted it** (§8) rather than leaving the formula
behind: an inline copy left standing beside a definition it was lifted from is a
cache, and one edit to the definition later would have the row and the library
disagreeing with nothing to say which was meant.

**What the second tier costs, and it is not nothing.**

- **A one-off is not reusable and does not want to be.** Two rows typing the same
  `+1` are two effects, and correcting both is two edits. That is what §8 is for
  and it is why the form has a name field at all.
- **A typed effect names a bonus type in the note**, which is the one place this
  wave breaks a rule that used to hold by construction. `SPEC` §5 says a type "lives
  in configuration and never in the expression language… A column rather than a
  row, decisively because **nothing stored ever names a type** — so a layout edit
  that drops one cannot orphan character data, and §10 is satisfied by construction
  rather than by a rule." A cell can now name one, so §10 needs a rule where it
  needed none: **a stored type the layout no longer declares is rendered, not
  corrected** — the effect still applies, it contests as its own kind, and the form
  shows it as `<type> (not declared)`, which is the spelling the editor's own
  **Bonus type** select already uses. Recorded as an amendment to `SPEC` §5 rather than
  buried, and the alternative was measured: **an untyped-only second tier** would
  have kept `SPEC` §5 intact and cost the tier the plugin's headline arithmetic — two
  rings of protection typed by hand would stack, which is the exact wrongness bonus
  types exist to prevent. Keeping the type and gaining one §10 rule is the cheaper
  side. It is the one sub-decision here an owner might take the other way, so it is
  an open item rather than a closed one.
- **A row's effect is out of the layout author's sight.** A GM who corrects a
  definition moves every character at once; a player who typed `+3` where the item
  gives `+2` is wrong on their own sheet and nothing in the editor can see it. That
  is the mirror of Risk 4 and it is listed beside it.

**This is still not bundled rules content** (§11's non-goal). A layout is one
campaign's or one system's own file, authored by whoever owns it; nothing ships an
item database and nothing is imported. The second tier moves the balance the other
way if anything: the common item never reaches the layout at all.

### 2. The authoring surface. Settled three times: one glyph per row, with a form on it.

**One glyph per modifier row, standing for every modifier that row applies**, and a
press on it opens **a form** — in which the row's own effect is typed, and in which
a named definition may be picked instead. Settled by the owner, verbatim:

> *"It continues to be a dropdown. I want to be able to set the row formula, not
> select an already existing one."*

**What the second answer got wrong, since it is the reason the third exists.** A
picker is the right control for enrolling in something that already exists and has
no shape at all for bringing something into existence. Wave 2's popup was a good
picker — two sections, a line per member, each resolved against the row — and every
line in it was a name somebody had already typed in the layout editor. So the
common case, an item this one character just bought, was a trip to another pane
before the row could say anything, and the model that made that necessary was the
one the survey found nobody shipping (§1). The surface was not the mistake; the tier
it was a surface *for* was the whole of what a row could hold.

**The form is not a menu, and that is a mechanism decision rather than a
preference.** Obsidian's `Menu` closes on selection and hosts no controls at all —
`MenuItem` takes a title, an icon and a click — so a target select, an operator
select, an amount field, a bonus-type select and a condition field cannot live in
one. `ui/check-menu.ts` therefore **goes**, and it does not survive as the
"reuse a named one" path inside the form either: that path is one labelled
`<select>` among other labelled controls, and a `Menu` nested inside a panel would
be two dismissal regimes stacked on one gesture. Design has the surface; Plumbing
has what is deleted with it.

**A named definition is still edited in the layout editor, and that line is
load-bearing rather than inherited.** The form edits **the row's own effect**. Where
the row has picked a named definition instead, the form shows that definition's
fields and they are **read-only**, with one line saying where they are edited —
because one edit there moves every character on the layout at once, and a sheet that
could make that edit would be a far larger change than this feature (SPEC §7 gives
the layout its own pane). **The one exception is §8**, promotion, and it is bounded
to exactly one operation: appending a definition that did not exist. Nothing on a
sheet edits or deletes one.

Three things the two-tier model buys at the surface:

- **A row may apply as many effects as it needs, named and typed mixed freely**,
  because they are parts of one cell (§6). The wave-1 cap of one `target` column per
  table is retired and not replaced: one modifier column is what a table wants, and
  a second is reported as redundant rather than refused.
- **A table's rows may carry different bonus types**, whichever tier they come from.
- **The layout editor still sees every push it can see.** A named definition's target
  is layout data, so dnd5e#3900's check — a modifier aimed at a value whose formula
  reads no slot — is complete in the editor for that tier. **For a typed effect it
  is not, and this is the half wave 2 could claim and wave 3 cannot**: a target
  typed on a row lives in a file the layout has never seen, so the check for it is
  the sheet's, where the form's **Changes** select offers only the accepting set and
  a stored target outside it draws `zap-off` with the reader's own sentence. So the
  check is complete on both tiers, in two places, rather than in one. Stated rather
  than glossed, because "the editor now sees every push" was one of wave 1's stated
  wins and half of it is being handed back.

### 3. The override operator, and what orders the passes. Settled.

**An override applies first; additions land on top.** The owner's case, verbatim:
"If I have an item that defines set my str 18 and another item that gives +1 stg
while worn, my bonus should be 19. The values that overwrites should came first."

**Two fixed named phases, and no priority integer.** Phase one resolves
overrides; phase two resolves the typed additive stacking that already ships.
This is Foundry's own hard-won conclusion and it is the strongest citation in the
research:

- Foundry carried a user-facing integer priority for thirteen major versions,
  then in v14 added **phases**. Release note for 14.352: "Active Effect changes
  now support application **phase**s, which can be used to leverage precise data
  preparation timing and **avoid priority competition**." Its `phase` field: "Each
  phase is its own priority group… application of a change in an earlier phase
  will occur before a change in a later phase, **regardless of priority**." Two
  phases ship: `initial` and `final`.
- The issue that introduced them (foundryvtt#13426) says why: "This can be
  difficult to manage when other ActiveEffects can come from anywhere and have
  their own configured priorities."
- Foundry's `CONST.ACTIVE_EFFECT_CHANGE_TYPES` defaults are
  `{custom: 0, multiply: 10, add: 20, subtract: 20, downgrade: 30, upgrade: 40,
  override: 50}`, and ordering within a phase is purely by priority — so its
  "override last" behaviour is an *emergent consequence of defaults*, not a
  stated rule, and a hand-set priority silently beats it.
- **Foundry core #14519** is what that fragility costs: `prepareBaseData` read
  `.priority` where it should have read `.defaultPriority`, collapsing every
  default to 0, so an ADD change was ignored in favour of a DOWNGRADE with no
  error. Filed and closed against 14.364.
- **dnd5e#3900 remains open two years on, retitled "Expose phase in active effect
  config"**, with a Foundry contributor saying "this should be achievable with the
  `final` active effect phase". The fix for the bug the shipped design was chosen
  to avoid *is* a second pass. So taking a bounded one deliberately, with named
  phases and no priority field, is the informed move rather than a regression.
- **CSB agrees with the owner and Foundry does not.** CSB: "set are applied
  first, then multiplications, then divisions, then addition and finally
  subtraction", implemented as
  `operatorOrder = ['set','multiply','divide','add','subtract']`. Foundry gives
  override priority 50 so it applies last and wipes additions — and
  **dnd5e#6622 is an open bug from a user hitting exactly that**, arguing a Bless
  `+1d4` "should stack on top of the overridden attack bonus". The owner's choice
  is the one a user filed the alternative as a defect over.

**Why that answer is load-bearing.** Overrides reduce to one number (the highest)
and additions reduce to one number (typed stacking), so there are exactly two
phases and **nothing to sequence within either**. That is what keeps this design
free of a priority integer, and it is the property to check any future operator
against. Had conflicting overrides needed ordering, this design would have
inherited Foundry's problem wholesale.

**And the two phases are two reductions, not two evaluation passes.** This is the
sentence that keeps the feature inside the shipped engine. There is still one
walk over the enrolments, producing one push set per target; the phases are two
reductions of that one set, combined by one expression. Nothing is evaluated
twice, and there is no boundary for an ordering bug to live at.

**A typed override contests on exactly the same terms as a named one**, and that
is a rule rather than an omission: the phases reduce a push set, and a push carries
no tier. Two overrides at one name are two numbers whichever file they came out of,
so the highest wins, the loser says so, and there is no arithmetic anywhere in this
design that asks where a modifier was written. That is what keeps the second tier
from being a second engine.

**Where the override lands.** The target's own formula produces a base — `value`,
or `10 + abilities.DEX`, whatever it says. Then:

```
name = override applies ? highest override + additive total
                        : the formula's own result
```

So the override replaces **the result of the formula that reads the slot**, and
the additive total is re-added on top. The owner's arithmetic falls out: override
18, addition +1, result 19.

Three consequences, and the third is a cost rather than a benefit:

- **An override reaches a target on exactly the same condition an addition does**
  — the target's own formula reads `mod.self`. No new accepting rule, no second
  set to compute, and `formula/modifier-targets.ts` is untouched. A value that
  ignores additions ignores overrides, which is one rule for the reader to hold
  rather than two.
- **The stored value is never touched.** A card whose derived is overridden to 18
  still shows the reader's own 15 in its field and still answers `<name>.value`
  with 15. That is Constraint 4 and §10, and it is also what makes the breakdown
  necessary rather than decorative: the number over the field is not arithmetic
  the reader can do in their head, so the popover has to say "Plate armour — sets
  to 18".
- **A formula that uses `mod.self` as something other than a plain addend gets
  different arithmetic under an override.** `value + mod.self * 2` doubles the
  additive total when nothing overrides and adds it once when something does,
  because the engine can only re-add what it holds, which is the total. Recorded
  under Risks. It is small because the canonical spelling — the one `SPEC` §5's worked
  example and every fixture use — is `+ mod.self`, and it is the honest price of
  "override applies first": any rule that replaced the *base* instead would need
  a base, and `10 + abilities.DEX + mod.self` has no `value` in it at all, which
  is precisely the §13 entry's own override example.
- **An override does not rescue a formula that will not resolve.** The name still
  publishes nothing where its own formula fails, override or not, on `SPEC` §5's
  standing rule that a name whose source will not resolve publishes nothing
  rather than a number nobody can account for. The cost: a card showing `?`
  cannot be forced to a value by setting it.

**Conflicting overrides: the highest wins, and the sheet says so twice.** The
owner: "If I have two items overwritting my str it should be default to the
highest value, but warning the player that it can have problems with this. Or
maybe when selecting a new overwritte having a meesage that the other item will
be disabled." Both surfaces were floated and the design takes **both facts and
neither transiently**:

- **At the number**, as a suppressed contributor in the breakdown:
  `Mage armour — sets to 13 (not applied: a higher override applies)`. That is the
  shipped shape, unchanged: `stackModifiers` already lists a suppressed line with
  its reason, and a suppressed override is the same shape with a different
  wording. This is where the reader is standing when they ask why the number is
  18.
- **At the row**, as the mark the stray target already has: a row whose
  contribution the stacking rule refused draws the `zap-off` form, and its own
  popover says why in the breakdown's own words — `Strength — item +1` over
  `Not applied: a larger item bonus applies`. So the reader who is looking at the
  item, rather than at the number, is told too.
- **A tie applies on both rows, and only the sum attributes it.** Two rows
  enrolling in one definition at the same amount are symmetric — deleting either
  changes nothing — so both draw `zap`, while the breakdown still names one of
  them "not applied" because a sum has to attribute the number to exactly one
  line. Naming the *row* that won would need a row index to leave the component,
  which §4.2 refuses. The residue is that the sheet says two things about one
  fact, and the two are true of different questions: "is this row changing the
  value" and "which line is the number credited to".

**Not at selection time**, and that is a decision against the owner's second
option in its literal form. **One of the two reasons this paragraph used to give is
gone, and the surviving one was always the real one.** It said a modal needs an
`App` that `RenderContext` does not carry, and that `docs/UI.md` §9 refuses a fourth
kind of panel — and the sheet now has a panel of its own (Design), so a message at
the moment of choosing is buildable where it was not. It is still not built, on the
reason that was never about mechanism: **a message shown once at selection is gone
the next time the sheet opens**, so the reader who did not read it has no route back
to the fact, while a mark on the row and a line in the breakdown are there every
time. The owner's fact is kept; its transience is not. Rewritten rather than left,
because an argument whose stated reason has been spent is worse than a wrong
conclusion.

### 4. The condition. Settled: the modifier holds the condition, the note holds the flag it reads.

"Only apply when the item is active" — equipped, attuned, worn. The shipped
feature already gets the ungrouped case free, and this was verified rather than
assumed: a `toggle` cell arrives in the row scope as a boolean, `if` is a
builtin, and a computed amount column reads the row. So the question is not
whether it can be expressed but **where the two halves live**: the *rule* about what
counts as active, and the *flag* it reads. That question has one answer whichever tier
the modifier came from, which is the point of this section.

The answer, and it is one mechanism rather than two:

> **A definition carries a `when` expression, evaluated in the enrolling row's
> own scope. The flag it reads is an ordinary cell in the note.**

So `"when": "Equipped"` on the definition, and `Equipped` is a `toggle` column
the layout already knows how to declare, store, round-trip and draw. The row
"says whether it is active" exactly as the brief settles — in a value, in the
note — and the *rule* about which value means active is in the layout, where a
rule belongs. A definition with no `when` is unconditional.

**And a typed effect carries its own `when`, in the same words and the same
scope.** `armour_class += 2 as item when Worn` is the same mechanism with the rule
written on the row instead of in the layout, which is exactly what the second tier is:
the condition is still an expression evaluated in the enrolling row's scope, and the
flag it reads is still an ordinary cell. Nothing about the condition's semantics
differs by tier, which is the property to keep — a condition that meant something
different on a typed effect would be a second engine.

Three things this gets right that a dedicated flag would not:

- **The flag is a cell of its own, not a second fact packed into the modifier
  cell.** This bullet has now had its stated reason spent twice, so the third version
  says why the conclusion survives both. It first argued from "a separator is a syntax
  in a file the user hand-edits", and §6 took a separator; it then argued that a
  modifier cell holds *names of modifiers* while a flag is a different kind of thing,
  and §6 has since put expressions in the cell too, so "a cell holds one kind of
  value" is no longer available either. **The reason that does survive is
  addressability**, which is §7's own edge read on a cell: a flag is a value the
  reader ticks and the sheet publishes to the row scope, so *many* modifiers on that
  row can read it and a `when` in the layout can read it too. Packing it into the
  modifier cell would make it reachable only from the part it was packed into — one
  flag per modifier, unreadable by the definition that wants it, and undrawable as the
  ring a `toggle` column already gives it. A dedicated second *column* is not the
  thing being refused: it is an ordinary column of the kind the layout already
  declares, and it is the answer.
- **The condition can be anything the row can say.** `Equipped`,
  `Attuned && Equipped`, `if(Mood, 1, 0)` folded into the amount instead — CSB
  issue 155's "Happy Smith" is still expressible, now without a computed column
  standing in for it.
- **The row scope is the row scope.** `rowValues` already layers a row's stored
  cells, its declared `values`, and its computed columns, and that is what a
  definition is evaluated against — so the amount in a breakdown is computed from
  the same account of the row the cells on screen are.

**What it costs, plainly, and the third wave halves it.** A table with no toggle
column offers no way to switch a *named* modifier off: the reader's only off-switch is
removing it, which does not remember which one was there. **A typed effect has one** —
clearing its **Amount** leaves the effect in the cell, changing nothing and refusing
nothing (§6), so the target, the operator, the type and the condition all survive the
switch-off and one keystroke brings it back. That is a real asymmetry between the
tiers and it is the honest way round: the tier whose text lives in the note is the tier
whose text can be half-written. The fix for the named tier is still a toggle column and
a `when`, which is the ordinary shape for equipped, attuned and worn. Stated rather
than papered over.

**Grouped conditionals stay out of scope**, per §13's recorded deferral: one
switch governing many modifiers, and the display surface CSB needed a whole
second component for.

### 5. The contract, and what a push becomes

`scopeModifiers` stays, and its argument is unchanged — the alternative is still the
formula engine knowing that a Table has columns and rows and cells. What changes is
what a push carries:

> **A push is one part of one cell, as raw text.** The row says what its cell says and
> hands over its own scope; the formula layer decides whether that text is a name or
> an assignment, and resolves it.

`ModifierPush` loses `target`, `type`, `amount` and the `unreadable` union, and gains
`part` and the row. **The raw text rather than a parsed part, deliberately**: that is
what keeps `scopeModifiers` unable to know what a modifier *is*. Table splits a cell
on `;` and pushes each part's own bytes; nothing in the push says which tier it is.
The `explain` half of `ModifierSource` goes with the union, because the reason a
failed amount gives now comes from where the expression is evaluated, which is the
formula layer, which has the reason in hand. The message quality is preserved —
`inRowMessage` is already exported from `formula/expression.ts` and already produces
`Row "Belt of Giant Strength": ability is not defined on this sheet.`

**And one sentence of this section is narrowed rather than kept.** Wave 2 wrote that
the component "cannot know what a definition is", and that is still true of the push
and no longer true of the component: the form shows and writes a target, an operator,
an amount, a bonus type and a condition, so Table knows a modifier has five slots.
**It knows the shape and none of the meaning** — the parse and the spelling are
`parse/modifier-cell.ts`'s, the resolution is `formula/`'s, the labels and the option
lists are the context's, and nothing in the component decides what an operator does or
what a bonus type means arithmetically. Recorded in the Corrections table, because a
sentence of this document quietly ceasing to be true is what that table is for.

**What it publishes** is unchanged: nothing. A modifier row publishes no name; a slot
is published by the sheet under `mod.<name>`; `<id>.<row name>` still fails as an
unknown name. **And a typed effect publishes nothing either, which is §7's edge read
at the contract**: it has no name, so there is no spelling by which anything could
reach it.

**What it stores** is one cell holding the modifiers the row applies, in a markdown
table. Constraint 3 is in the diff on the note side — a cell's format is this
feature's — and §6 has the argument: reading is tolerant, writing is canonical, a
commit touches only the part the reader edited, and neither runs over a cell nobody
edited.

**What happens to existing notes.** A note written against wave 1's shape holds a
`target` cell (`abilities.STR`) and an amount cell (`2`). Neither is deleted and
neither is migrated, because **no migration exists to be written**: a target cell names
a published value with no operator and no amount beside it, so any automatic rewrite
would be a guess. So:

- the amount column is a column the layout no longer declares, which §4.2 already rules
  is left in the note, unrendered and untouched;
- the target cell, where the column is retyped to `modifier`, reads as a **name** and
  not as an assignment — a bare `abilities.STR` has no `=` in it — so it is a stray
  part: rendered, not corrected, carried as a line of its own in the form, with the row
  drawing `zap-off` where nothing else on it applies. §4.2's rule for a Card's stray
  option, read on the control that replaced the one it was first read on.

Nothing is released, so the only layouts holding the old shape are this repository's
fixtures and the owner's vault, and both are replaced by hand as part of this work.

### 6. What a cell holds. Settled: `;`-separated parts, each either a name or an assignment.

**This is the load-bearing decision of the third wave and the only one that reaches
the note's bytes.** Everything else in §2 is a surface; what a cell may hold is the
character note's shape, so it belongs here beside where a modifier lives.

> **A modifier cell holds parts separated by `;`. A part that reads as
> `<target> += <expression>` or `<target> = <expression>` is an effect typed on
> this row. Every other part is the name of a layout definition. A definition's name
> may not contain a `;`, and may not itself read as an assignment.**

The full spelling of a typed part, and each clause is optional from the right:

```
<target> += <amount> [as <bonus type>] [when <condition>]
<target>  = <amount> [as <bonus type>] [when <condition>]
```

```
armour_class += 2
armour_class += 2 as item when Worn
armour_class = 18
abilities.STR += Qty * 2 as status
```

`+=` is **Adds to** and `=` is **Sets**, which are §3's two operators and the two the
form offers. A cell mixing tiers is ordinary:

```
Ring of Protection; armour_class += 2 as item when Worn
```

#### How a reader and the parser tell the two apart

**The discriminator is the assignment, and it is structural rather than a sigil.** A
part is a typed effect if and only if it matches, on the trimmed text: one
*published-name token* — the spelling `SPEC` §5 already fixes for a name a formula
can write, letters, digits and underscores never starting with a digit, with dots
between segments — then optional spaces, then `+=` or `=`, then anything. Nothing
else is. So the test is
`^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*\s*(\+=|=(?!=))` — **with the
negative lookahead, which is load-bearing rather than defensive**: without it
`armour_class == 2` reads as a target, an operator `=` and an amount `= 2`, and a
comparison a reader wrote by mistake becomes an effect nobody can resolve rather than a
stray name they can see. And it is total: **every part is one of the two and there is no such thing as a
malformed cell**, which is the line wave 2 established and this keeps.

**Why the assignment beats a sigil**, which was the first candidate. A leading `=`
or `>` would be one character at a fixed position, cheap to check and cheap to
state — and it would then sit in front of an assignment that already says the same
thing, so `= armour_class += 2` carries two operators for one fact and a reader has
to be told which one means what. Worse, a sigil is *this plugin's* syntax in a file
the user owns, where an assignment is the arithmetic the sheet is already made of:
`armour_class += 2` is readable by someone who has never read this document, and
`> armour_class += 2` is not. And the sigil buys nothing the assignment does not,
because the assignment is already at a fixed position — the front of the part.

**Why the assignment beats "a name is a definition, anything with an operator is a
formula"**, which is the tempting cheap version and loses on the same evidence a
comma lost on as a separator. Item names carry `+1` and `+2` as a matter of course
in every system surveyed — *+1 Longsword*, *Bracers of Armor, Greater*, *Ring of
Protection +2* — and half of the canonical 5e magic item spellings would be read as
arithmetic. Once that discriminator is tightened enough to survive those names it
*is* this one: a single name token, then an assignment. The lesson is the same one
`;` learned, applied one layer up.

**Why not a second column.** A column pair — a target cell beside an amount cell —
is wave 1, and it comes back with wave 1's two costs: the target is a bare stored
name with no operator, no type and no condition, so a row's effect is half a
definition split across two cells with nothing joining them; and a row with two
effects needs four columns and draws two glyphs, which is the thing wave 2 existed
to remove. The variant where the *column* carries the target, the operator and the
type while the cell carries only the amount is better and still loses: it makes a
column one unnamed definition, so a row changing two different values needs two
columns again, and the owner's sentence is about a row rather than about a column.

**Why not a structurally different cell format.** JSON or `key: value` pairs in a
cell would hold the five facts unambiguously and would put `{`, `"` and `,` into one
line of a markdown table that people hand-edit — one of which is the separator this
design already refused for exactly that reason. It would also make the cell a
*declaration* in the plainest sense, which is the far side of §7's edge; an
assignment is an expression with a destination, which is the near side.

#### What a typed part's own text may contain

**Everything the expression language accepts, and the two exclusions are free.**

- **`;` is not in the grammar at all**, so reserving it costs an amount nothing. The
  tokenizer has no statement separator and no string literal to hide one in (§13
  records the absence of quote handling as a settled fact), so there is no legal
  expression a `;` can appear inside.
- **`=` appears in the grammar only as `==`**, so the discriminator scans for the
  first `=` that is not half of `==`, and `armour_class += if(Training == 2, 2, 0)`
  is read correctly by a rule with no lookahead beyond one character.
- **`|` is escaped by the table layer and handed back whole** (`parse/table.ts`
  escapes to `\|` on the way in), so an amount may contain one; it will simply be
  spelled `\|` in the file, as an aliased wikilink already is.
- **The clause keywords are ` as ` and ` when `, matched from the right, with a
  space on both sides and outside parentheses.** Neither is a token in the
  expression grammar, so neither can appear in a well-formed amount — the one
  collision is a *column heading* literally spelled `as` or `when` used as a bare
  amount, which is reachable because `SPEC` §5 lets a row expression read a column by
  heading. `armour_class += (when)` escapes it, and that is the whole of the
  hazard: statable, one paren wide, and it has not occurred in any surveyed
  system's column vocabulary.

**No delimiters of its own, and that is the point.** A typed part is self-delimiting
because the assignment is at the front and the clauses are keyworded from the back.
Adding brackets around it would be a second syntax whose only job is to announce
the first.

#### Reading, writing, and Constraint 3

**Read tolerantly, written canonically, never rewritten unbidden.** Reading splits
on `;`, trims each part, drops the empty ones, and keeps the first of a repeated
*named* part. Writing joins with `'; '` in the cell's own order and spells a typed
part as `<target> += <amount> as <type> when <condition>` with single spaces,
omitting the clauses that are blank. A new part is appended rather than sorted into
place, because the order a reader put them in is theirs.

**Constraint 3 holds, and the argument is the shipped one plus one new rule.**
`parse/table.ts`'s `replaceCell` returns a segment untouched when the unescaped
trimmed text equals the stored value, and rewrites only the cells whose text
actually changed — **verified against the code at the last build, and conditional on
the stored value staying the raw cell text**, which it does: Table's `read` hands out
each cell as its own bytes and `cellValue` on a modifier column falls through to
`text.trim()`. So `A ;B`, `A;;B`, `armour_class+=2`, `armour_class  +=  2 as item`
and `armour_class += 2 as item` all read as the same effects and all keep exactly
the bytes a hand-editor typed, because parse-then-serialise never touches a cell
nobody edited. There is no normalising pass, so there is nothing for byte identity
to lose to. The new rule, which wave 2 did not need:

> **A commit rewrites only the part the reader edited, and re-joins every other
> part as its own stored text. A gesture aimed at one part changes no other part's
> text — and a gesture aimed at an *enrolment* takes the whole enrolment.**

Without the first half, editing one part of a three-part cell would canonicalise the
other two — a correction §10 forbids, arriving as a side effect of an unrelated edit.
It has a criterion of its own, and it is the property a canonical join over the whole
cell would quietly lose.

**Two things this rule is not, and both were read out of it wrongly during the
build.**

- **It is not "byte for byte" over the whole cell.** A part's own text survives; the
  *spacing around the separators* does not, because writing joins with `'; '` and
  that is what canonical writing means. `A ;B` edited at `B` comes back `A; B`, and
  the criterion that governs compares **part by part** for exactly this reason. Byte
  identity over the whole cell is unconditional only for a cell nobody edited, which
  is where it is claimed and where `replaceCell` delivers it.
- **It is not a rule about every write.** It is a rule about an *unrelated* edit:
  committing one field must not disturb its neighbours. **Remove is not an unrelated
  edit**, and reading the sentence as covering it produced a real defect — a repeated
  name is one enrolment (below), so dropping one of its two byte ranges left the row
  still applying the modifier, and the reader pressed the only control there is and
  nothing came off. The collapse is a read and never a write *of a part the reader
  did not touch*; **Remove takes the enrolment**, which is what the reader pointed at.
  `parse/modifier-cell.ts`'s `withoutPart` is where that line is drawn, and the two
  halves are one decision rather than two: the collapse belongs out of an unrelated
  write and inside the gesture whose whole job is to remove.

#### The name constraint, and where it lives

Whatever separates two parts, a name containing it breaks; and whatever discriminates
a typed part, a name matching it is read as one.
`parse/modifier-definitions.ts` permits any trimmed non-empty string as a name today,
so nothing stops either. Of the two available answers — constrain the name, or find a
character a name cannot hold — **the name is constrained**, because there is no
character a name cannot hold: a name is free text out of a JSON file. So one rule,
generalised from the one the parser already makes:

> **A definition whose name a cell could not spell unambiguously is reported and
> dropped**: one containing `;`, and one that reads as an assignment.

On the parser's own argument for a definition with no name — "a cell stores the name
it was given, so a definition with none is one no row could ever enrol in; there is
nothing to write in the cell." A name a cell cannot spell is that same class of
thing. **Not merely reported-and-kept**, which is the tempting middle: such a
definition would work in a cell naming only it and tear in half the moment a second
part joined it, and a rule a reader meets once by surprise in the middle of an edit
is worse than a rule that refuses up front. The messages name the fix:

```
"Boots; gloves" cannot be a name, because a row separates the modifiers it
applies with a semicolon. Rename it without one.

"armour_class = 18" cannot be a name, because a row spells its own modifiers
that way. Rename it, or write it as a modifier's Changes and Amount instead.
```

The second constraint is **much narrower than the first**, and that is worth
stating: `;` is forbidden anywhere in a name, while the assignment shape is
forbidden only as the *whole start* of one. `Ring of Protection +2` is unaffected,
`Bracers of Armor, Greater` is unaffected, and the shape that is refused —
one bare identifier then `=` — is not a name any surveyed system uses.

**And it all lives in one file.** `parse/modifier-cell.ts` owns the separator, the
split, the join, one part's parse and one part's spelling; `parse/modifier-definitions.ts`
imports the two tests it needs for the name check. The reason is the trap:
**the character that separates two parts, the shape that marks a typed part, and the
two things a name may not be are the same three facts**, and two declarations of them
could drift apart — which is the one way this feature could silently produce a cell
nobody can spell. It is also the file model's own business under PATTERNS §2, what a
cell's bytes mean.

#### An ambiguous or unfinished hand-edited cell

**Nothing is corrected, ever** (§10, Constraint 4), and the discriminator being total
is what makes that cheap. The cases, each with an answer and none with a rewrite:

- **A part that reads as a name the layout does not declare** is a stray: carried,
  rendered, listed in the form on its own line saying so, with the row reading
  `zap-off` where nothing else on it applies. §4.2's rule for a Card's stray option,
  read per part. `abilities.STR` left over from wave 1's `target` cell is exactly
  this case and needs no rule of its own.
- **A part that reads as an assignment whose amount will not resolve** —
  `armour_class += 2 +` — is a typed effect with an unreadable amount, which is the
  shipped rule: the slot publishes nothing and the error names the row (`SPEC` §5).
  It is the one case where a typo in a cell reaches a number elsewhere, and it is
  the same rule a definition's bad amount already earns.
- **A part that reads as an assignment with no amount at all** —
  `armour_class +=` — **changes nothing and is not an error.** This is a departure
  from the named tier and it is deliberate: a definition with no amount is a layout
  problem the author owns, and an unfinished cell is `SPEC` §10's "a section without
  a data block is empty, not malformed" read one level down. It is also what makes
  the form safe to commit per field (Design): the moment a target is chosen the part
  exists, and it must not blank a card while the reader is still typing. The row
  draws `zap-off` and the form says the effect needs an amount.
- **A part naming a bonus type the layout does not declare** applies, contests as its
  own kind, and is shown in the form as `<type> (not declared)`. Rendered, not
  corrected; §1 has the argument and the §5 amendment.
- **A repeated *named* part is one enrolment**, collapsed on read and never written
  back, because two pushes of one definition reach the stacking rule as two lines
  with the second suppressed as "another item bonus of the same size applies" — a
  true sentence about a typo, and noise. **Two identical typed parts are two
  effects**, deliberately not collapsed: they are not references to one thing, and a
  reader who typed the same effect twice has two effects, which the stacking rule
  will then say something true about.

**Constraint 2 is not reached, stated rather than left to be inferred.** The table is
`markdown` storage, so a wikilink in a modifier row's *name* cell is a real link with
a working backlink, hover preview and rename — which is what lets an inventory row be
a live link and a live modifier at once. A modifier cell holds names and expressions,
never links, and grows no `[[` for any reason, so nothing here goes near a code
fence. Written down at the one moment this cell's format changed.

**Why `;` and not the character a reader would guess**, unchanged from wave 2 and
still the argument. A comma is what a list looks like and is the one separator this
domain cannot have, because item names carry commas as a matter of course. ` + `
fails worse, since `+1` and `+2` are suffixed to half the items in every system
surveyed. `|` would put a backslash in every multi-part cell of a file people
hand-edit. A newline cannot be one at all: a table row is one line. A semicolon
reads as a list, is rare in an item name, survives a cell literally, and leaves the
constraint something an author trips over roughly never.

### 7. What `SPEC` §2's "values only, never structure" is read to mean. Settled, with an edge.

`SPEC` §2 says a character note "holds values only, never structure", and `SPEC` §3 is the
file model that rests on it. §13's own objection to this feature named the
consequence: a per-row "target, an operator, an expression and a condition, in a
character note" is **structure in character data**, against the constraint the whole
file model rests on. On the plainest reading that objection is correct, and wave 2
answered it by moving the definition out of the note.

**The owner has accepted a specific reading that licenses a typed effect, and this
section is that reading written precisely rather than softened.** The reading has
three parts: what structure is, why an effect is not it, and where the exception
stops.

#### Structure is what the sheet reads in order to lay itself out

Not "anything with more than one field in it". The test is what the fact is *for*:

> **Structure is what decides what the sheet is. A value is what the sheet is
> about.**

Which components exist, where they sit and how big they are; which columns a table
has, what each is called and what type it is; what a published name is worth; what
the layout's vocabulary is — its functions, its bonus types, its reset triggers, its
named modifiers. All of that stays wholly in the layout, and a note holding any of it
would be a layout in disguise.

**A modifier typed into a cell is not any of that.** It is one fact about this
character's own stuff, spelled in the author's own expression language plus one
operator saying which already-declared number it lands on. The sheet does not read
it to decide what to draw: the grid, the table, the columns, the cards and the
formula that reads the slot are all already decided by the layout, and this cell
changes a number the layout already declared through a slot the layout's own formula
already asked for. **Delete every typed part in a note and the sheet draws exactly
the same sheet**, with different numbers in it — which is the definition of a value.
That counterfactual is the test, and it is checkable rather than rhetorical.

The research's phrase for it was **"a meaningfully weaker form of structure in user
data"**, and the precedent it named is Roll20, whose repeating sections routinely
store a player-typed expression per row — `@{selected|strength_mod}+2` in an attack's
own field, in the character's own data, in the most widely used sheet system in the
category. A typed amount is not novel; what is novel here is saying out loud which
half of the rule it is on.

#### The edge: nothing in a note is addressable

This is the part that stops the exception widening, and it is a sharp line rather
than a matter of degree:

> **Structure has a name something else can spell. A value does not.**

A component id, a column key, a definition name, a row key, a bonus type, a function
name — every piece of structure in this plugin is a name some other part of the sheet
refers to. A typed effect has no name and nothing can point at it: it is in no scope,
no formula can read it, no other row can reuse it, no breakdown addresses it by
anything but the row it sits on, and it survives no rename because there is nothing
to rename. **The moment a note would hold something another part of the sheet refers
to by name, this exception has been left behind** and the thing belongs in the
layout.

That is also exactly what §8 is: **giving an effect a name is the act of moving it out
of the note.** Promotion is not a convenience bolted onto the side — it is the edge of
this rule, expressed as a gesture. A row's effect becomes addressable at precisely
the moment it stops living in the note.

#### What the note still may not hold

Written as a list so the next feature cannot widen the exception by pointing here:

- **A component**, or a placement, a size, a grid position, or an order.
- **A column** — its key, its type, its heading, its options, or its total.
- **A definition of what a published name is worth.** A note may change a number the
  layout declared; it may never declare one. There is no cell anywhere that creates
  a name, and `mod.X` still fails as an unknown name where `X` is not published.
- **Anything in the layout's vocabulary**: a function, a bonus type *declaration*, a
  reset trigger, a palette entry. Naming one the layout declares is a reference, and
  a reference to something the layout no longer declares is a stray — rendered, not
  corrected, like every other.
- **Anything nameable.** No note holds a thing a formula could spell, and that is the
  test to apply rather than the list to check against, because a list can be
  exhausted and this cannot.
- **A cache of what anything computed.** §1's rule, unchanged and independent of this
  one.

#### What this costs, and it is not free

- **`SPEC` §5's "nothing stored ever names a type" is amended**, and §10 needs a rule where
  it had a construction guarantee. §1 has the trade and the alternative.
- **A row's arithmetic is now in two possible places**, so "why is this 17" has two
  answers to walk rather than one. The breakdown is what makes that survivable and it
  is why it was built first.
- **The reading is a reading**, and the sentence in `SPEC` §2 does not change. What
  `/land-it` carries into `SPEC` is this section's rule and its edge, as an amendment
  to how `SPEC` §2 is read, in `SPEC` §2 beside the sentence and in `SPEC` §3's own rules
  list. Writing
  the argument is this document's job; writing it into `SPEC` is not.

### 8. What promotion is. Settled: one appended definition, and the row becomes a reference.

A row's typed effect becomes a named layout definition. **This is the first thing in
this plugin that edits a layout from a character's sheet**, so it is bounded to the
one operation that cannot lose anything and every failure is named.

> **Promotion appends one definition to the layout, then points the part that
> promoted it at the new name. It never edits a definition, never deletes one, and
> never touches any other row, cell or note.**

**What it is called and by whom.** The form carries a name field and a button
labelled **Save to the layout**, under a small heading reading **Reuse this
elsewhere**. Sentence case, imperative, and it says what happens rather than naming
a mechanism — "promote" is this document's word for the operation and not a word any
reader of the sheet ever sees. Only the reader of a *typed* part is offered it; a
part that already names a definition has nothing to promote — **and only once that
part has a target and an amount**, because a part with neither changes nothing (§6)
and offering to publish it made a publish control the last word on the first-use
path, above a form nobody had started filling in.

**A component still never touches the file** (PATTERNS §5: "Edits are reported
through `context.onChange`. The sheet view owns writing."). So promotion is
**reported, not performed**: `ModifierContext` gains one member the sheet view
implements, and the view does both writes in one order or neither.

```ts
/**
 * Add one definition to the layout under `name`, then answer whether it landed.
 * Additive only: it appends, and refuses a name the layout already declares.
 */
promote(name: string, effect: TypedEffect): Promise<PromoteResult>;
```

`PromoteResult` is `{ ok: true } | { error: string }` — a value, never an exception
(PATTERNS §4), because every failure here is one a user can cause. It is the one
asynchronous member on the context, and it is asynchronous because a vault write is:
the form awaits it and shows the message in the shared `.sheetsmith-field-problems`
clothes on a failure.

**The order, and it is the whole of Constraint 4 here.** The layout write lands
first; the cell is rewritten only on `ok`. A failed layout write leaves the cell
exactly as it was, so the worst outcome is that nothing happened. The reverse order
would leave a cell naming a definition that does not exist — recoverable, since that
is a stray and strays are rendered rather than corrected, but it would be this
feature manufacturing one.

**What happens to the row that promoted it: the cell becomes a reference.** The
typed part is replaced by the name, in place, in the cell's own order, and every
other part is re-joined byte for byte (§6). The argument is §1's spine rather than
convenience: an inline copy left standing beside the definition it was lifted from is
**a cache of what that definition says**, and one edit to the definition later would
have the row and the library disagreeing with nothing on the sheet to say which was
meant. That is Sandbox issue #15's shape, and this design's one absolute rule is that
the note holds no such copy. So promotion converts, and the row it converted reads
the library from that moment on — which is also the thing the reader asked for by
naming it.

**What happens to other rows holding an identical formula: nothing.** Nothing is
searched for and nothing is rewritten. Three reasons, and the first is decisive:

- **A layout edit rewriting cells in notes nobody opened is the migration §10
  declines to perform**, and which this document already carries as an open item for
  a renamed definition. Doing it here would be the same job with the same failure
  mode, taken on for a smaller reason.
- **The plugin cannot see them.** A sheet render holds one character's note. Finding
  the others is a vault scan on a button press, which `AGENTS.md` opens against on
  performance grounds and which no other gesture in this plugin performs.
- **Two identical texts are not evidence of one intent.** Two rows both reading
  `armour_class += 1` may be one item bought twice or two unrelated trinkets, and the
  arithmetic is identical either way, so converting them buys the reader nothing and
  costs them a cell they did not edit.

The residue is honest and small: after promotion, one row references the definition
and the others go on computing the same numbers from their own text. Nothing is
wrong, nothing is lost, and the reader can convert the rest by opening each form and
picking the name — which is one press per row and is the same gesture they just
learned.

**Can it fail? Yes, four ways, and each names the fix.**

- **The name is blank.** Refused with `Give it a name to reuse it by.` Nothing is
  written.
- **The name contains a `;`, or reads as an assignment.** §6's two constraints,
  checked here as well as in the layout parser so the refusal arrives where the name
  is being typed rather than in another pane afterwards. The parser's own messages,
  reused verbatim, so a reader who meets the rule twice meets one sentence.
- **The layout already declares that name.** **Refused, always**, with
  `This layout already has a modifier called "Ring of Protection". Choose another
  name, or pick that one from the list above.` Not "reuse the existing one": the
  existing definition may say something different, and silently pointing the row at
  it would change the row's arithmetic under a gesture whose whole promise is that
  nothing changes. And not "compare the five fields and reuse it if they match"
  either, which is a same-ness test on two expressions that would have to decide
  whether `2` and `1 + 1` are the same definition. One rule, no equality test, no
  silent repointing.
- **The write itself fails** — the layout file is gone, or read-only, or the vault
  refuses it. The view's own error, passed through as the message, and the cell is
  untouched.

**What promotion cannot orphan, stated because Constraint 4 is what makes it safe
enough to do at all.** It appends, so nothing that resolved before stops resolving:
no cell anywhere pointed at that name a moment ago, since the parser would have
refused a duplicate. No character on the layout renders differently, except the one
row that just converted, which computes the identical number by another route. The
only asymmetry is the row itself, and that is the reader's own edit.

**There is no undo, here or anywhere in the editor** (`SPEC` §7 records that as the
standing gap). The recovery is that promotion is additive: delete the definition in
the layout editor and retype the effect in the form, and both halves are one gesture
each. Recorded in Risks rather than designed around, because the answer is undo in
the editor and that is not this feature's to build.

## What it does

A character's row says what its item changes, in one cell, drawn as a single glyph
however many changes that is: pressing the glyph opens a form where the row's own
effect is typed — which value it changes, whether it adds or sets, by how much, its
bonus type, and when it applies — and where a change the layout has already named
can be picked instead of typed. The layout still names the changes that repeat, in a
pane of its own, and an effect typed on a row can be **saved to the layout** to reuse
it. An **override** sets the value and the additive bonuses land on top of it rather
than being wiped by it; where two overrides contest, the highest wins and both the
number and the losing row say so.

## Design

### The cell, on the sheet

A **modifier column**: a new column type whose cell holds the modifiers the row
applies (§6). It draws as **one glyph and nothing else, however many parts the cell
holds**, which is what `hideHeading` is for and which this column is the second good
case of after the level ring — the glyph names itself, and a word above it several
times its width sets the column's width against a control that needs none of it.

**The glyph, its three shapes and its one colour are settled and not revisited by
this wave.** They were designed and measured under wave 2 and the third wave changes
nothing about them: `plus`, `zap` and `zap-off`, all `--text-muted`, shape as the
whole visual channel, measured at **6.41:1** light and **7.50:1** dark. What follows
restates them because a reader of this section needs them, not because they are open.

| The cell | The glyph | What it means |
| --- | --- | --- |
| no part | `plus`, faint | This row applies no modifier. Press to add one |
| at least one applying | `zap` | This row is changing at least one value elsewhere on the sheet |
| filled, none applying | `zap-off` | Every modifier this row holds is doing nothing |

**`zap-off` now has six reasons and the sixth is the third wave's**: a condition is
false; the layout declares no modifier of that name; an override lost or a larger
bonus of its type took the slot; an amount will not resolve; a target's own formula
reads no modifier; and — new — **a typed effect has no amount yet**, which is the
unfinished cell §6 settles as changing nothing rather than as an error. The count is
stated where a reader can check it, because a count one short of its own code is what
the Corrections table exists to catch and has caught here twice.

**The empty cell draws a glyph**, unchanged from wave 2 and for the same reason: an
empty cell is the entry point for adding a modifier, and an unmarked entry point is a
dead end. `docs/UI.md` §7 refuses a hover-only affordance and a phone has no hover to
reveal one with, which is the argument the delete glyph one column over already
carries — "It is always rendered, and faint."

**The mixed row draws `zap`**, unchanged: the glyph is about **the row**, a row
changing something is changing something, and the rest is carried in words at three
depths from one builder so they cannot disagree. Deliberately not a fourth shape for
"some".

**The control is a `<button>`, and the glyph is the whole of it.** Unchanged from
wave 2, including the CSS reset that strips Obsidian's own button chrome scoped under
`.sheetsmith-view`, the level ring's size token, and the focus ring as an `outline`.
**One attribute changes: `aria-haspopup` is `"dialog"` rather than `"menu"`**, because
what opens is a form and a screen reader should say so.

**One gesture**, unchanged: a press opens the form, on a pointer and under a finger
alike, Enter or Space opens it from the keyboard, and no modifier cell binds a long
press. `claimTouchPress` stays gone from `ui/popover.ts`.

**A `title` still carries what the row is doing for a pointer**, unchanged: hover to
read, press to change.

**The accessible name's five forms are unchanged**, on the level ring's own
`${label}: ${state}` shape:

```
Modifiers                                  (no modifier on this row)
Modifiers: Plate armour                    (one, applying)
Modifiers: Plate armour, changes nothing   (one, not applying)
Modifiers: 2 applying                      (several, all applying)
Modifiers: 2 applying, 1 changing nothing  (several, one not)
```

**What a typed part is called in words**, which is the one thing the third wave adds
to this text. A named part is spelled by its name; a typed part has none, so it is
spelled by **what it does**, in the words the sheet already uses for the value:

```
Modifiers: Armour class — item +2          (one typed part, applying)
Modifiers: 2 applying                      (a name and a typed part)
```

The `title` and the form's lines use the same spelling, from the same builder, so a
row reading `item +2` and a breakdown reading `item +2` cannot come apart. And the
several-form still gives a count and not the names, which is **parity**: a sighted
reader gets no names from the glyph either.

**Empty state.** A table with a modifier column and no filled cell draws its rows as
it always did, every slot it could have filled is 0, and nothing anywhere says "no
modifiers" — that is the state of every new character. Each row draws the faint
`plus`, and the form a press opens is where the absence is said in words.

**Error states.** Six, and the count holding at wave 2's six is a coincidence worth
naming rather than a sign nothing moved: **one is retired and one is new.** Each is a
shape this component already has.

- A configuration error on the card alone: a `total` or a `publish` on a modifier
  column. Each names the fix. `configError` still refuses **nothing** about how many
  modifier columns a table has, deliberately, under §10: refusing would take the
  whole table down and `withdrawnNotice` means it would take every modifier that
  table's rows apply down with it.
- **A second modifier column**: reported in the editor's columns list, while the
  sheet draws both, pushes from both and refuses nothing.
- A stray part: rendered, listed in the form on its own line, with the row reading
  `zap-off` where nothing else on it applies.
- An amount that will not resolve, from either tier: **the slot publishes nothing**,
  every formula reading it fails, and the message names the row and the reason.
- A definition or a typed effect aimed at a value whose own formula reads no
  modifier: the row draws `zap-off` where nothing else on it applies, and the form's
  line for it says so in the reader's own words for that value. For a typed effect
  this is the sheet's own check rather than half of the editor's, because the target
  is in the note (§2).
- **A typed effect with no amount**, which is the sixth and is new: changes nothing,
  refuses nothing, draws `zap-off`, and the form says what it needs. §6 has the
  argument.

**And one of wave 2's six is retired**, which is why the list above has six entries and
not seven. A layout that declares no definitions at all, with a table carrying a
modifier column, was an error naming the Layout panel: under reference-only a column
with nothing to point at *was* pointless. A row can now type its own effect, so a
layout declaring none is an ordinary layout — the editor's report goes, the
columns-list note stays, and the form's **Modifier** select simply offers the one
option that types a new effect. **This is the third wave's most direct correction on
this surface, and it runs the opposite way to the rest of them:** a report removed
rather than added.

### The form, on the glyph

**A plugin-owned anchored panel, and the argument has to be made rather than
inherited.** `docs/UI.md` §9's first line is that "a fourth kind of panel beside a
row of cards reads as loose chrome floating on the page", and wave 2 leaned on it to
borrow Obsidian's `Menu` whole. That option is gone: `Menu` closes on selection and
`MenuItem` takes a title, an icon and a click, so it hosts no controls at all. The
other two are gone too — a `Modal` needs an `App` and §4.2 records that
`RenderContext` carries no route to one, and `showPopover` sets `textContent`, so a
bubble admits no per-line styling and no controls. So the form is this plugin's own
floating surface, and the honest framing is:

> **It is the shared popover's *kind* grown a body, not a fourth kind of panel.**

§9's sentence is about a panel in the page's own flow, sitting beside a row of cards
and reading as chrome. A transient surface anchored to the control that opened it,
one at a time, dismissed by the next thing the reader does, is `.sheetsmith-popover`'s
kind — which §9 already blesses — and the right move is to extend that regime rather
than to invent a second floating one. So the placement arithmetic (above where there
is room, below where there is not, clamped into the viewport) is **extracted from
`ui/popover.ts` and shared**, because "clamped into the viewport" is one policy and
two copies of it drifting apart is a visible bug.

**What that costs, and it is the largest single cost of this wave.** `Menu` gave four
things free that a plugin-owned panel owes: placement and clamping (bought back by
sharing the popover's), dismissal on a press outside and on Escape (the popover's,
with one change below), keyboard navigation and focus management (**owed**, below),
and a phone regime (**owed**, and partly deferred). Listed here rather than
discovered during the build.

**Dismissal.** A press outside closes it; Escape closes it and returns focus to the
glyph. **Scroll does not close it**, which is the one departure from `showPopover`'s
regime and it is argued: a bubble is a thing you read, so a scroll means you have
moved on, while a form is a thing you are filling in and a table scrolls inside its
own overflow box under the smallest wheel gesture. So the panel repositions on scroll
and resize rather than dismissing, through the same shared placement call.

**Focus.** The panel is appended to `document.body`, because the table scrolls inside
an overflow box and a panel inside it would be clipped — which breaks DOM order, so
tab order has to be managed rather than inherited. It carries `role="dialog"` and an
`aria-label` naming the row (`Modifiers on "Belt of Giant Strength"`), focus moves to
its first control on open, **Tab cycles within it**, and Escape returns focus to the
glyph. A focus cycle is the platform's own contract for a `dialog` and is what makes
`aria-haspopup="dialog"` on the button true.

#### What it holds

Two things, in this order: **the row's modifiers, one line each**, and — under
whichever line is open — **that modifier's fields**.

```
Modifiers on "Bracers of Warding +2"
──────────────────────────────────────────────
[zap-off]  Ring of Protection · Armour class — item +1
           Not applied: a larger item bonus applies
[zap]      Armour class — item +2                        (open)

           Modifier
           [ Typed on this row                       v ]
           Changes    [ Armour class                v ]
           Operator   [ Adds to                     v ]
           Amount     [ 2                             ]
           Bonus type [ item                        v ]
           Only when  [ Worn                          ]

           [ Remove ]

           Reuse this elsewhere
           [ name it                     ] [ Save to the layout ]
──────────────────────────────────────────────
+ Add a modifier
```

**The fields**, and each is a control this sheet already has:

| Field | Control | What it does |
| --- | --- | --- |
| Modifier | `<select>` | `Typed on this row`, then every definition the layout declares, each resolved against this row so it reads `Bull's Strength · Strength — status +1` rather than a bare name. Choosing a definition makes this part a named one and the four fields below become a read-only summary — label and value, no box, no chevron, and a blank one is not drawn at all; choosing `Typed on this row` makes it typed and hands them back as controls. **It takes the panel's whole width**, label above: its options are resolved sentences and beside a label column there was room for about two-thirds of one |
| Changes | `<select>` | The accepting targets, by their reader-facing labels. A stored target outside the set is carried as `<name> (reads no modifier)` and never offered |
| Operator | `<select>` | **Adds to** / **Sets** |
| Amount | text field, `editable.ts` | An expression, evaluated on this row |
| Bonus type | `<select>` | The layout's `modifierTypes`, plus a blank for untyped. A stored type the layout does not declare is carried as `<type> (not declared)`. Not offered on **Sets** |
| Only when | text field, `editable.ts` | An expression, evaluated on this row. Blank means always |

**It commits per field, on the gesture the rest of the sheet uses, and there is no OK
button.** The selects commit on `change`; the two text fields are `editable.ts`'s own
draft-and-commit — type, Enter or blur commits, Escape abandons and says so. Three
reasons, and the third is what makes it safe:

- **A form with its own commit button would be a second commit regime on one sheet.**
  Every other stored value on a sheet commits this way (`docs/UI.md` §9: "The editing
  gesture — `editable.ts` — every stored value on a sheet").
- **There is no whole-form cancel to design**, and no half-built effect held in memory
  across a re-render. A dismissal at any moment loses nothing, because everything
  committed is already in the note.
- **A half-built effect changes nothing and is not an error** (§6), which is what
  stops per-field commit blanking a card while the reader is still typing. The part
  comes into existence when **Changes** is chosen, with the operator defaulting to
  **Adds to** and a blank amount, and it contributes nothing until an amount is
  there. That is why **Changes** is the first of the four fields rather than
  **Amount**: a part with no target could not be spelled in the cell at all (§6's
  discriminator needs a name token), and a part with no amount can.

**Switching a named part to `Typed on this row` copies the definition's fields onto
the row**, and that is Foundry's own proposal rather than an invention: #4451's
"detach to instance" button, one-way. It is the natural way to make a one-off variant
of a shared modifier — an item that is *almost* the Ring of Protection — and it is the
exact inverse of §8. **It is not the cache §1 forbids**, and the distinction is worth
stating because §1 is emphatic: a cache is a copy of what something *else* still owns,
kept in step by nothing; a detached effect is the effect itself, owned by the row from
that moment, referring to nothing. Nothing anywhere holds a second copy of it. The
switch is one-way in the same sense promotion is: choosing a definition again replaces
the typed fields with that definition's, and the row's own text is gone — which is a
destructive edit, so **it arms and commits** exactly as **Remove** does.

**Removal is a control, not a press on a line.** Wave 2's heading read
`On this row · select to remove`; a press on a line now *opens* it, and one gesture
cannot both open and delete. So the open form carries **Remove**, which borrows
`.sheetsmith-table-remove-button`'s arm-then-commit — the sheet's own destructive
gesture — rather than inventing one. The heading becomes plain `On this row`.

**One at a time, and no navigation.** A row with three modifiers shows three lines
and opens one of them in place; pressing another line closes the first and opens the
second. Deliberately **not** a list of three open forms — five controls times three is
a panel nobody can scan, and the reader is editing one thing. And deliberately **not**
a list that navigates to a form and back: a back-stack inside a transient surface is
a second dismissal regime and loses the reader's place. Disclosure in place keeps the
line the reader chose visible above the fields they are filling in.

**A row with no modifiers yet.** The panel opens with the list replaced by one line
reading `This row applies no modifier.` and one new part **already open** — `Modifier`
set to `Typed on this row`, `Changes` empty and focused. So the common case is: press
the `plus`, choose the value, type the number, done, with no intermediate "add"
gesture. Under wave 2 this was two presses and two openings; it is now one opening.

**A layout that declares no definitions.** The `Modifier` select holds one option,
`Typed on this row`, and nothing else. No error and no notice: a layout with no named
modifiers is now an ordinary layout (Error states).

**What survives from the menu round, and what is replaced.** Named explicitly,
because all of it was designed and reviewed:

| Wave 2 | Now |
| --- | --- |
| Two sections, position carrying membership | **Replaced.** One list, labelled `On this row`, and the second section's job — offering what the row could apply — is the `Modifier` select inside the form. Position carried state because there were two lists; there is one, so the label carries it |
| A reason line under a non-applying line | **Survives**, unchanged: a quiet line under the line it is about, in `.sheetsmith-field-problems`' own shape |
| `zap` / `zap-off` per line, the same mark as the row's | **Survives**, and it is still what leaves the icon slot meaning *state* |
| `On this row · select to remove` | **Replaced** by `On this row`, with **Remove** inside the open form |
| Each line resolved against the row before it is drawn | **Survives**, on both the list and the `Modifier` select's options |
| `modifierOutcomeText`'s wording, shared with the `title` and the breakdown | **Survives**, one builder, unchanged |
| Obsidian's `Menu`; `ui/check-menu.ts`; the stub's `Menu` and `MenuItem`; `calibrate.mjs`' `.menu` entry; `theme.css`'s menu fallback | **All go** (Plumbing) |
| "The popup closes on every change, so a swap is two openings" | **Gone**, and it is the best thing this wave buys: the panel stays open across every commit |

**How it reads to a screen reader.** The panel is a `dialog` with an `aria-label`
naming the row. Every field is a labelled control, so the state a glyph carries for a
sighted reader is carried by the label and the value for everyone — which is a
stronger position than wave 2's, where a checkmark's job had to be done by position
under a heading because the app's `aria-checked` behaviour is unverifiable outside
Obsidian. A line in the list is a `<button>` whose accessible name is the modifier's
own words plus its state (`Ring of Protection, armour class item +1, not applied: a
larger item bonus applies`), the `zap` glyph is `aria-hidden`, and the open line
carries `aria-expanded`. Escape and the focus return are the two things a keyboard
reader will try first and both are owed rather than borrowed, so both have criteria.

**Where there is no room.** The panel clamps into the viewport horizontally as the
bubble does, caps its height at a **measured number of pixels** and scrolls its own
body — deliberately **not** through `.sheetsmith-list-scroll`, whose `20em` cap is a
layout-editor list's and whose purpose §13 still asks about. In `em` the cap lied
about itself: the rule sets its own `font-size`, so `34em` there was 442px and not
the ~500 the comment beside it reasoned from, and nobody could see the difference
until the harness drew the panel with the app's own control heights on it. Below a narrow width it takes the viewport's
width minus a gutter. **The honest floor is that nothing below a 500px viewport can
be photographed** — `docs/UI.md` §12 measures Chrome's headless floor and that row
stays open — so the phone regime here is read rather than seen, exactly as the
breakdown bubble's is, and it is one thing wave 2 got free and this wave owes.

### The number, and its breakdown

Unchanged except for the override, which the breakdown has to be able to say.
The mark is still the dotted underline with `cursor: help` opening the shared
popover; the sr-only twins are still one per surface with one builder behind
them; `MODIFIED_CLASS` is untouched.

What the breakdown gains:

- **An override line reads "sets to", not a signed amount**, because an override
  is not an addend: `Plate armour — sets to 18`. A bonus type is never on one, per
  the operator rules below, so the line carries no type either.
- **A suppressed override says which wording is true**, on `stackModifiers`' own
  existing discipline of having two wordings because only one of them is ever
  true: `a higher override applies` against
  `another override of the same value applies`.
- **The total line changes shape only when an override applies.** With nothing
  overriding it is `Total +3`, unchanged. With an override it is the value rather
  than the addend — `Total 19` — because base-plus-total is no longer the
  arithmetic and a signed number there would invite the reader to add it to
  something.
- **Zero means two different things and the breakdown honours both.** An addition
  of 0 changes nothing and appears in no breakdown, which is the shipped rule. An
  **override to 0 is a value** — "set to zero" is a real effect — so it is listed
  and it contests.
- **An inactive row appears in no breakdown at all.** Its condition is false, so
  it pushes nothing, and a breakdown is about what changed the number: listing
  every stowed item in every popover would put the inventory in there. The row is
  where a reader learns an item is inactive, and the row says so with its glyph.
  The split is: the breakdown is the number's story, the row is the item's.
  **An unfinished typed effect is the same case for the same reason** — it changes
  nothing, so it is nowhere in the number's story, and the row's `zap-off` is where
  the reader learns it needs an amount.
- **A line for a modifier with no name is named by its row.** `ModifierLine.definition`
  becomes optional, and a typed effect has none by §7's edge, so the line falls back to
  `RowValues.label` and carries its outcome as it always did:
  `Bracers of Warding +2 — item +2`. **The outcome half is what tells two lines on one
  row apart**, which is why `definition` was added in the first place and why losing it
  on one tier costs nothing: a row applying a typed `item +2` and a typed
  `circumstance +1` reads as two lines with the same label and two different changes,
  which is exactly the question the reader is asking. Nothing else about the breakdown
  differs by tier, and a test asserts a mixed row's four lines read identically whether
  the same arithmetic was typed or named.

### The layout editor

**The Modifiers list survives, and it survives nearly unchanged.** It was built and
reviewed under wave 2 and this wave neither replaces nor extends it: a Modifiers
section in the Layout panel, reached by selecting the tree's `Layout` row, beside the
function library, the triggers and the bonus types; one row per definition, its name,
with its fields on the detail line under it; problems under the list, never fatal;
the target picker over `acceptingTargets`, which is still the one control this feature
*moves* rather than builds, and still the answer to Foundry's own Active Effects
article telling users to press F12 and enumerate attribute keys from a console.

| Field | Control | Notes |
| --- | --- | --- |
| Name | text | What a cell stores and what the form shows. May contain neither `;` nor the assignment shape a typed part uses (§6) |
| Changes | select | The accepting targets, through `acceptingTargets` |
| Operator | select | **Adds to** / **Sets** |
| Amount | formula | An expression, evaluated in the enrolling row's scope |
| Bonus type | select | The layout's `modifierTypes`; not offered on **Sets** |
| Only when | formula | An expression, evaluated in the same scope; blank means always |

**Four changes, all small:**

- **The Name field's description and its reported problem gain the second forbidden
  shape** — a name that reads as `<target> = …` — with §6's message.
- **A definition may now arrive from a sheet**, through §8. It appends at the end of
  the list, in declaration order, exactly as one added here does, and no control
  changes. Worth one sentence in the section's own copy so an author is not surprised
  by a row they did not type: **the list is no longer only author-written.**
- **The columns list's note is reworded.** It said a modifier cell names every
  modifier the row applies, separated by `;`; it now says a cell holds every modifier
  its row applies — each either one this layout names or one typed on the row —
  separated by `;`.
- **The columns list's empty-layout error goes.** It said a table with a modifier
  column on a layout declaring no definitions was an error naming the Layout panel.
  A row can now type its own effect, so that layout is ordinary and the error would
  be false. This is the third wave retiring a report rather than adding one, and it
  is recorded in the Corrections table for that reason.

**The second-modifier-column report keeps its shape and loses one word**, and it is
still the only place the retired cap is enforced, still as advice: `A modifier cell
holds every modifier its row applies, so one modifier column is enough. Move this
column's modifiers into the first and remove it.` Reported, never refused, because
`configError` would take the table and every modifier its rows apply down with it.

**"Modifiers" rather than "names", which this section called unchanged and which the
second tier makes wrong.** A cell holds names *and* effects typed on the row, so an
author told to move the column's *names* is told to move half of what is in it. One
word, and it is the same correction the columns-list note above takes.

**And the copy budget §13 asks about gets slightly better rather than worse.** §13's
entry expected the new surface to be where an explanation of a modifier lives instead
of under a columns list, and it is: the form's six labelled fields carry it, on the
sheet, beside the row it is about. The columns list keeps one note and loses one
error.

**One backlog interaction, unchanged from wave 2 and still a partial answer.** §13
asks what `.sheetsmith-list-scroll`'s `20em` cap is for and expected this surface
change to answer it by deletion. It is answered in that direction — the two controls
that overran a column's detail line are gone, so the line is one line again — but the
definitions list has six controls on a detail line, so **it must not go inside that
capped scroller**, and neither may the sheet's form. The cap question stays open for
the lists still inside it.

### What it reuses

| Thing | From |
| --- | --- |
| The `mod.` namespace, the slot spelling, the reserved id | `formula/modifiers.ts`, unchanged |
| The name table's laziness, memoisation and cycle guard | `formula/sheet.ts` |
| The row table's memoisation and re-entry guard | `formula/rows.ts`, reached through a computed cell in a row scope |
| Which names accept a modifier, and every published name's label | `formula/modifier-targets.ts`, unchanged, now consumed in the editor *and* on the sheet |
| The typed stacking arithmetic and its two suppression wordings | `stackModifiers` |
| The two override phases | `stackModifiers`, unchanged |
| A row's reader-facing label | `RowValues.label`, carried whole |
| One row's names, including its computed cells | `rowValues`, shared with `scopeRows` |
| Float-safe summation | `roundSum` |
| A control that is nothing but a glyph, sized and reset | `.sheetsmith-table-remove-button`, `.sheetsmith-table-modifier-button` |
| An anchored transient surface: placement, clamping, dismissal | `ui/popover.ts`'s own regime, with its placement extracted and shared |
| The editing gesture — type, Enter or blur commits, Escape abandons | `editable.ts`, on the form's two text fields |
| A choice from a closed list | a native `<select>`; `.sheetsmith-card-select`, `.sheetsmith-table-select` |
| Arm, then commit, for a destructive press | `.sheetsmith-table-remove-button`, on the form's **Remove** |
| A quiet line under the entry it belongs to | `.sheetsmith-field-problems`' shape, in the form and in the editor |
| A contributor qualified with `·` | `modifierBreakdown`'s own separator |
| The mark on a modified number, and one builder for every carrier | `components/modifier-breakdown.ts` |
| Text for assistive tech only | `.sheetsmith-sr-only` |
| A list of lines reporting its problems under itself | `.sheetsmith-field-problems`, `editor/field-lines.ts` |
| An entry row with a detail line, add, remove and reorder | `editor/list-fields.ts` |
| Stray stored value rendered, not corrected | §4.2's Card option rule |
| Shape refuses the file, contents are reported | `parse/modifier-types.ts`, `parse/triggers.ts` |
| Failure is a value the caller acts on | PATTERNS §4, on `PromoteResult` |
| The sheet view owns writing; a component reports | PATTERNS §5, on `promote` as much as on `onChange` |

### Plumbing

**The layout gains one key**, unchanged from wave 2.

```ts
interface ModifierDefinition {
	/** What a cell stores and what the form shows. Contains no `;` and reads as no assignment (§6). */
	name: string;
	/** The published name this changes. */
	target: string;
	/** Omitted for 'add', which is what a definition that says nothing is. */
	operator?: 'add' | 'override';
	/** An expression, evaluated in the enrolling row's scope. */
	amount: string;
	/** One of the layout's `modifierTypes`. Absent is untyped. */
	bonusType?: string;
	/** An expression; absent means always. */
	when?: string;
}
```

`bonusType` rather than `type`, because a `type` key on an object in a layout file
already means "which component this is" and `SPEC` §2's vocabulary records that "modifier
type" reads as a second word for the same thing — the heading is **Bonus type**.
`operator` rather than `phase`, because the operator is what an author picks and the
phase is what it implies; naming the phase would be the priority integer arriving
under a new name.

**And the same five facts, minus the name, are what a typed part holds.**

```ts
/** One effect typed on a row: a definition with no name and no home in the layout. */
export interface TypedEffect {
	target: string;
	operator: ModifierOperator;
	/** May be blank, which is an unfinished effect: it changes nothing (§6). */
	amount: string;
	bonusType?: string;
	when?: string;
}
```

**Deliberately the same shape rather than a shared type**, and that is a decision. A
`ModifierDefinition` without its `name` is what a typed effect is, so
`Omit<ModifierDefinition, 'name'>` would express it exactly — and the two are the same
shape for a reason that will not hold forever: a definition is a thing with a name in
a shared file and an effect is an anonymous fact in a note, and §7's edge is precisely
that being nameable is what separates them. Naming one in terms of the other invites
the next feature to give a typed effect a name in place, which is the thing §7 forbids.
Two interfaces, one comment each pointing at the other, and `contract.test.ts` holds
the field list once.

**A push becomes a part, not a definition name.** This is wave 3's one change to the
contract, and it is a narrowing of what the component knows rather than a widening:

```ts
export interface ModifierPush {
	/**
	 * One part of one modifier cell, as the cell spells it: a definition's name,
	 * or an assignment. Raw text, deliberately — the component splits the cell and
	 * hands the parts over without parsing one.
	 */
	part: string;
	/** The component the row lives on, as its label reads. */
	source: string;
	/** The row: its reader-facing label and the names its expressions may read. */
	row: RowValues;
}

export type ModifierSource = (resolve: FieldResolver) => readonly ModifierPush[];
```

**`part` rather than `definition`, and the raw text rather than a parsed part**, so
that the sentence wave 2 wrote — "**it cannot know what a definition is**" — stays
true of `scopeModifiers`. Table splits a cell on `;` and pushes each part's own text;
the formula layer decides whether that text is a name or an assignment and resolves
it. `source` stays for the reason it was added: two modifier tables on one sheet can
each hold a row called "Ring".

**But that sentence is no longer true of the *component*, and this wave has to say
so.** The form shows and writes a target, an operator, an amount, a bonus type and a
condition, so Table now knows a modifier cell's parts have five slots in them. It
still does not resolve one, does not know what a bonus type means arithmetically, and
does not know what an operator does — the parse and the spelling are `parse/`'s, the
resolution is `formula/`'s, and the labels are the context's. **The honest statement
is: the component knows the *shape* of a modifier and none of its meaning.** Recorded
in the Corrections table, because "it cannot know what a definition is" is a sentence
of §5 that this wave narrows.

**`ModifierContext` changes shape, and two members come back.**

```ts
interface ModifierContext {
	/** Every definition this layout declares, in declaration order. */
	definitions: readonly ModifierDefinitionView[];
	/** The values a modifier may be aimed at, for the form's Changes select. */
	targets: readonly ModifierTarget[];
	/** Every published name and its label, so a stored target outside the accepting set has a word. */
	published: readonly ModifierTarget[];
	/** The layout's bonus types, for the form's Bonus type select. */
	bonusTypes: readonly string[];
	/** What one part of one cell comes to on this row. */
	outcome(part: string, row: RowValues): ModifierOutcome;
	/** What applies at this name, in declaration order, and what it comes to. */
	breakdown(name: string): ModifierBreakdown;
	/** Append one definition to the layout, then say whether it landed (§8). */
	promote(name: string, effect: TypedEffect): Promise<PromoteResult>;
}

export type PromoteResult = { ok: true } | { error: string };
```

**`targets`, `published` and `bonusTypes` are the wave-2 deletion undone, and the
reversal is worth naming rather than performing quietly.** Wave 2 removed `targets`
and `publishes` and called it "the model change paying for itself in deleted
surface", on the argument that a target had become layout data so the sheet needed
neither. A target can be typed on a row again, so the sheet needs the list to offer
and the labels to render — and the bonus types come with them, for the same reason.
That is this wave's cost in added surface, and it is the mirror image of wave 2's
stated win.

**One consequence for §13, recorded rather than claimed.** §13 asks "whether a
`modifierType` the layout does not declare should be refused on the card as well as
reported in the editor", and notes that the check is impossible for a component
because "that check is handed a config and never the layout". With `bonusTypes` on the
context the sheet *can* see the declared list, and it uses it — a typed part's stored
type shows as `<type> (not declared)` in the form. That **does not close** the entry,
which is about a *column's* declared type and about refusing rather than reporting;
what it does is remove the entry's own reason for thinking the sheet could not know.
`/land-it` should amend the entry rather than resolve it.

**`outcome` takes a part rather than a name**, and takes the row rather than an index,
so nothing about a row's position leaves the component (§4.2). `ModifierOutcome` gains
one member and loosens one:

```ts
interface ModifierOutcome {
	/** The definition this part names, or null where it names none or is typed. */
	definition: ModifierDefinitionView | null;
	/** The effect this part spells out, or null where it names a definition. */
	typed: TypedEffect | null;
	/** What the reader is shown this modifier changes, and its label. */
	target: string;
	targetLabel: string;
	/** Whether this row is changing its target's value. The glyph reads this. */
	applies: boolean;
	/** What the amount comes to on this row, or null. Present on a row that is not applying. */
	amount: number | null;
	/** Whether the condition holds, or null where there is none. */
	condition: boolean | null;
	/** Why it is not applying, or null where it is or where the condition says so. */
	suppressed: string | null;
}
```

`definition` and `typed` are **both nullable and never both set**: a stray part has
neither, a named part has the first, a typed part has the second. A discriminated
union would be tighter and is deliberately not taken — every consumer reads `applies`,
`amount`, `targetLabel` and `suppressed` regardless of tier, so a union would make
four common reads a narrow each. One comment says the invariant and
`contract.test.ts` holds it.

**`ModifierLine.definition` becomes optional.** A breakdown line names the definition
where there is one and falls back to the row's own label where there is not, since a
typed effect has no name and §7's edge says it never will. The line's *outcome* half —
`item +2`, `sets to 18` — is unchanged and is what identifies it on a row applying
two.

**Modules.** Four changed, two new, one deleted.

- **`src/parse/modifier-cell.ts`** — **new**, and it owns everything about a modifier
  cell's bytes: `MODIFIER_SEPARATOR`, `namedParts` (split, trim, drop empties),
  `spellParts` (join), `parseModifierPart` (name or typed effect, total, never
  failing), `spellTypedEffect`, and the two tests the name check needs —
  `readsAsAssignment` and "contains the separator". §6 has the argument for one file:
  the separator, the discriminator and the two things a name may not be are the same
  three facts.
- **`src/parse/modifier-definitions.ts`** — unchanged in shape; imports the two name
  tests from `modifier-cell.ts` and gains one reported problem, the assignment-shaped
  name. It still takes the accepting-set sources as a **required** argument, for the
  reason its own header argues: with none, both name sets are empty and every
  definition with a target earns "this layout publishes no value under it", including
  every correct one.
- **`src/formula/modifier-definitions.ts`** — resolves **one part** rather than one
  name: if the part reads as an assignment, evaluate it directly against the row's
  scope; otherwise look it up. The condition is still evaluated before the amount,
  and that ordering is still load-bearing for the same reason — an inactive row's
  amount must not be able to refuse a slot it is not touching. `Enrolment` gains one
  case, `unfinished`, for a typed part with no amount: it contributes nothing and
  refuses nothing.
**There is exactly one parse of a cell part in the codebase, and it is on the formula
side of the seam.** Table imports the split, the join and `spellTypedEffect` from
`parse/modifier-cell.ts` — it has to, because it writes a cell — and it reads a part's
*fields* from `outcome`, never by parsing the part itself. So the component spells a
part and never reads one, `formula/modifier-definitions.ts` reads one and never spells
one, and the two cannot come apart about what `armour_class += 2 as item when Worn`
means. A round-trip test over `spellTypedEffect` then `parseModifierPart` is what holds
it, and it is the cheapest guard this design has.

- **`src/components/modifier-form.ts`** — **new**. The form's markup: the list of the
  row's parts, the six fields, the promote row, Remove. It knows what a modifier is,
  imports nothing from `obsidian`, touches no file, and takes its labels, its options
  and its four callbacks as arguments. Beside `modifier-breakdown.ts`, `card-face.ts`
  and `linked-text.ts`, which is where a shared component-layer surface lives.
- **`src/ui/anchored-panel.ts`** — **new**. An anchored, clamped, dismissible,
  focus-cycling panel taking a body element. Knows nothing about modifiers, which is
  `ui/popover.ts`'s own rule and why both live here; it shares the placement
  arithmetic with `showPopover` rather than copying it.
- **`src/ui/check-menu.ts`** — **deleted**, with `.sheetsmith-check-menu-*`, the
  stub's `Menu` and `MenuItem`, `harness/calibrate.mjs`' `/^\.menu/` entry and
  `harness/theme.css`'s menu fallback. **Nothing is committed, so none of it appears
  in the history**, which is the working-order rule in `CLAUDE.md` paying for itself
  twice in one feature: a correction is an edit rather than a revert.
- **`components/modifier-breakdown.ts`** keeps `modifierOutcomeText`, `modifierRowText`
  and `modifierRowName`, all three unchanged in shape, and each gains the typed case:
  a part with no name is spelled by what it does. One `change()` helper behind all of
  it, which is why "a row reading +1 beside a breakdown reading item +1" cannot
  happen.

**The eslint boundary is untouched and the allowlist stays one name long.** A
component may import exactly one name from `obsidian`, `setIcon`, and the config says
adding to that allowlist "is the decision; inheriting the precedent is not". The
panel is plain DOM — `ui/popover.ts` imports nothing from `obsidian` either — so
nothing new is imported anywhere, and the deletion of `check-menu.ts` takes the one
`Menu` import out of `src/` entirely.

**`resolve.ts`'s bounded override step is unchanged**, and so is its bound: after a
component's field resolves, and **only where that evaluation actually read the name's
own slot**, it asks for an override and returns `override + total` in place of the
formula's result where one applies. In `fieldReaders` and not in `buildSheetScope`,
because the name table is one of two callers of that evaluation and one site is the
only correct number of sites.

**`formula/modifiers.ts` keeps its job**: the namespace, the slot spelling, the lookup
with its memo and its three guards, and the reduction of one push set into an
override, a total and a breakdown. Its walk now resolves parts rather than names,
which changes one call and nothing else.

**`ModifierResult`, `ModifierBreakdown`, `stackModifiers`, the two phases,
`formula/modifier-targets.ts` and `configError`** are all unchanged.

**`harness/shot.mjs` keeps one view and renames it.** `sheet-modifier-menu` becomes
**`sheet-modifier-form`**, pressing the glyph on a row whose cell holds a name and a
typed effect and then opening the typed one — so the list, a reason line, the six
fields and the promote row are in one shot in both themes. **The count stays at 32
PNGs**, which is checkable. Without it the form would be the one surface of this
feature reviewed by reading code, which `docs/UI.md` §11 is the standing argument
against.

### Interaction with the two cycle guards, and one finding

Described honestly and not closed, per §13. **The finding first, because the
brief asked for it loudly rather than buried:**

> **`ModifierContext.outcome` is the closest this design comes to the warming §13
> forbade, and it must be read as a change to which guard wins some rings rather
> than as none.**
>
> **This names `outcome`, and the first version of this finding named the override
> step** — the table at the end records the correction, because a finding pointed
> at the wrong entry point is worse than no finding. The override step widens
> nothing: `resolve.ts` asks only where a formula already read the slot, which is
> the condition the walk was already entered under.
>
> Today the modifier walk is entered only from inside a formula that actually
> reaches a `mod.self` on the path taken. After this, `outcome` enters it too —
> **a modifier cell asks it once per modifier its cells name**, and running at
> render in grid order it can be the *first* entry into the walk in a render. So
> the set of things that can trigger the walk grows from "names whose evaluation
> read a slot" to that plus "every enrolment a modifier column draws", and the walk
> is therefore reachable from more places and, in a render, sometimes earlier. It is
> bounded by the accepting set, which is the bound this document named for the
> override step and which turned out to belong here.
>
> **Waves 2 and 3 change the wording and not the substance, and each adds one
> clause that narrows rather than widens.** The count is per *part* however the cell
> is spelled — three modifiers in one cell ask three times, exactly as three cells
> did, and a typed part asks exactly as a named one does — so "for every filled cell
> it draws" became "once per part its cells hold" and nothing about the disclosure
> moved. What wave 2 added is that **the surface asks `outcome` for definitions the
> row does not hold**, to say what each would do, and it asks **on a press**; wave 3
> keeps that in the form's `Modifier` select. A press happens after a render has
> finished, so those calls can never be the first entry into the walk *in a render* —
> which is the half of this disclosure that was about ordering. What they add is
> reachability, bounded by the layout's own definitions list, at one opening's cost.
> Recorded, not designed around, and not closed.
>
> What that does to §13's open question — which of the two guards closes a ring
> both could catch — is: **the modifier walk's guard takes a larger share of those
> races, deterministically in direction though not in outcome.** It is not a
> warming: nothing is walked before drawing, nothing is walked in a fixed order,
> and a name nobody draws or asks for still triggers nothing. But it moves in the
> warming's direction, and calling it "more entry points, no change to the rule" —
> which is what the shipped feature could honestly say — would be false here. It is
> not designed around and it is not closed.

The rest, unchanged in substance:

- **A ring entirely inside the name table** — a definition whose amount reads the
  target it changes — is closed by `buildSheetScope`'s `active`, loudly: the
  slot's walk fails, the slot throws with the row named, and the card shows `?`
  with the sentence.
- **A ring through a row set** — an amount that aggregates over the table the
  enrolling row lives in — is closed by the row table's guard, which refuses every
  walk in the ring, and the slot then publishes nothing for the same reason an
  unreadable amount does.
- **An amount that reads another target's slot** is refused by the walk's own
  guard, and whether it is refused still depends on evaluation order for the
  reason `formula/modifiers.ts` records: cold it is refused, and after any earlier
  walk the name table's guard fires first, memoises the other slot, and the same
  expression resolves. Unchanged, and unchanged deliberately.
- **The two phases add no third guard.** They are two reductions of one push set,
  so nothing about them can re-enter anything.

## Config fields

Table's component-level fields do not change: columns are already one field of kind
`columns`. What changes is the column type list, the cells inside that field, and one
layout-level field. Each description states a consequence, per PATTERNS §8.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `columns.*.type` = `modifier` | column type | Modifier | A cell holding the modifiers this row applies, separated by `;`, drawn as a single glyph however many there are. Each is either one this layout names or one typed on the row. Pressing the glyph opens a form that types one, picks a named one, or says why one is not applying. A modifier column cannot be totalled or published per row, and **one is enough**: a second is reported as redundant rather than refused. |
| `columns.*.type` = `target` | column type | *(removed)* | Replaced by **Modifier**. A stored `target` cell keeps its text and is carried as a stray part, since no rewrite could know which modifier it meant. |
| `columns.*.modifier` | boolean cell | *(removed)* | The amount lives in the definition, or in the cell beside the target it is aimed at. A stored key is ignored and the column reads as its own type. |
| `columns.*.modifierType` | select cell | *(removed)* | The bonus type lives on the definition or on the typed effect, which is what lets one table's rows carry different types. |
| `modifiers` | layout field, a list of definitions | Modifiers | The changes this layout names, for the ones that repeat: what each one is called, what it changes, whether it adds or sets, by how much, its bonus type, and when it applies. A character's row names one; nothing about the change is stored in the note, so editing a definition changes every character using it. A row may also type an effect of its own instead, which nothing else on the layout sees. |
| `modifiers.*.name` | text | Name | What a row's modifier cell stores and what the form shows. Cannot contain a semicolon, which separates two modifiers in one cell, and cannot read as `armour_class = 18`, which is how a row spells one of its own. Renaming one leaves every row that named it pointing at nothing, so the rows say they change nothing until they are pointed at the new name. |
| `modifiers.*.target` | select | Changes | Which value on this sheet the modifier changes, from the ones whose own formula reads a modifier. A value whose formula does not read one is listed as a problem rather than offered. |
| `modifiers.*.operator` | select | Operator | **Adds to** stacks with the other bonuses of its type; **Sets** replaces the value, and the bonuses then land on top of it. Where two modifiers set one value, the higher wins and the other says so. |
| `modifiers.*.amount` | formula | Amount | How much it adds, or what it sets the value to. Evaluated on the row that named it, so it may read that row's own cells by column heading. |
| `modifiers.*.bonusType` | select | Bonus type | Which of the layout's bonus types this modifier's amount is. Only the largest bonus and the smallest penalty of one type apply; different types add. Left blank, it stacks with everything. Not offered on **Sets**, which is not contested by type. |
| `modifiers.*.when` | formula | Only when | A condition evaluated on the row that named it, so `Equipped` reads that row's Equipped cell. Left blank, the modifier always applies. A row whose condition is false changes nothing and says so on the row. |

**And the form's six fields are configuration a character writes rather than a layout
author**, so they are not `configFields` and appear in no config form. They are listed
under Design, with the same discipline — a label, a control and a consequence — because
that is what a field owes whoever fills it in, whichever file it lands in.

## Data and file model

**The note.** One cell holding the modifiers the row applies, separated by `;`, each
either a definition's name or an assignment (§6), in a markdown table.

- **Constraint 3 holds because writes are cell-scoped, and it holds for a stated
  reason.** `parse/table.ts`'s `replaceCell` returns a segment untouched when the
  unescaped trimmed text equals the stored value, and Table hands each cell out as its
  own bytes — **verified against the code, and conditional on the stored value staying
  the raw cell text**, which it does. So `A ;B`, `A;;B`, `armour_class+=2` and
  `armour_class  +=  2 as item` all survive byte for byte while reading as the same
  modifiers. The canonical spelling reaches the file only where the reader has just
  changed *that part*, and **only that part**: every other part of the same cell is
  re-joined as its own stored text (§6's new rule, whose two halves are the unrelated
  edit and the enrolment). There is no normalising pass,
  so there is nothing for byte identity to lose to.
- **Constraint 2 is not reached.** The table is `markdown` storage; a modifier cell
  holds names and expressions rather than links, and a wikilink in a modifier row's
  *name* keeps working exactly as it does today — backlink, hover preview, rename —
  which is what makes an inventory row a real link and a real modifier at once.
  Nothing about a modifier cell is ever fenced.
- **A modifier cell reaches a row scope as its own text**, exactly as a `text` cell
  does — the whole cell, separators, assignments and all — so `sum(inventory, Modifiers)`
  fails naming the row and the value as it already does over a text column. No special
  case, and none wanted: a formula has nothing to compare a list of parts to, because
  the language has no text. **And a typed part's own amount is not a name the sheet
  publishes**, so §7's edge holds at the file model as well as in prose: nothing can
  read a cell's effect.
- **A blank cell holds nothing and is not an error.** On an inventory with a modifier
  column most rows are blank; that is the ordinary case.
- **A part naming nothing the layout declares is carried and not corrected**; a
  repeated *named* part is one enrolment, collapsed on read and never written back;
  two identical *typed* parts are two effects. All three are §6.
- **A typed part names a bonus type the layout may drop**, which is the one thing
  stored in a note that now references the layout's vocabulary. Rendered, not
  corrected: the effect applies, contests as its own kind, and the form says
  `<type> (not declared)`. §1 has the trade, §7 the amendment to §5.

**The layout.** One key, `modifiers`, and its round trip is where the care goes,
because both the editor and — through §8 — a sheet write this file:

- **An absent key stays absent**, so a layout that never wanted definitions does not
  grow one on first save. `parse/layout.ts`'s recorded trap, and it applies per
  definition too: `operator: 'add'`, a blank `bonusType` and a blank `when` are
  omitted rather than written, which is the `setOptional` discipline the columns field
  already follows.
- **A promotion appends and writes the whole file through the same serialiser**, so a
  layout promoted into is formatted exactly as one edited in the pane is. It is not a
  patch and there is no second writer: §8's member is implemented on top of the write
  the layout editor already performs, which is what stops two spellings of one file
  existing.
- **Shape refuses the file, contents are reported.** A `modifiers` that is not an
  array of objects refuses the layout, as a bad `columns` does; a definition with a
  blank name or an unparseable amount is reported in the editor while every sheet on
  the layout goes on rendering.

**Constraint 4 and §10, which bite hardest here and are designed rather than left.**

- **Renaming a definition leaves every row that named it pointing at nothing**, and
  that is what those rows say — `zap-off` where nothing else on the row applies, the
  stored name carried as a stray part, and the line under it naming the fix. **The
  cell is not rewritten**, because a rename in the editor cannot know that two
  layouts' worth of characters meant this definition rather than a typo, and §10's own
  answer to a component rename is to *offer* migration rather than to perform one.
  Offering it for a definition is an open item, below.
- **Deleting a definition** is the same case and the same answer.
- **Dropping a bonus type** now touches something stored, where it previously could
  not: a typed part may name one. Rendered, not corrected, above. This is the one
  place this wave takes a construction guarantee and replaces it with a rule.
- **Promotion never orphans anything**, because it only appends: nothing that resolved
  a moment ago stops resolving, and the parser would have refused a duplicate name
  (§8).
- **Nothing is deleted, ever**, and nothing cached: §1's rule that the note holds no
  derived record of what a modifier did is what makes every one of these answers "the
  cell keeps its text" rather than "the number is stuck at what it was set to".

**Existing character notes.** Unaffected in the sense that matters: no section is
rewritten by opening one, and no byte is lost. What changes is what renders — the old
amount column is a column the layout no longer declares, and the old `target` cell is
a stray part, since a bare `abilities.STR` reads as a name rather than as an
assignment. Both are covered above, and **no migration exists to be written**: a
target cell names a published value with no operator and no amount beside it, so any
automatic rewrite would be a guess.

## Acceptance criteria

**Where the ticks come from, because it is not this session's reading.** A
`/spec-review` pass graded **40** criteria: **31 met**, **5 met by another route**,
**3 met with a weaker assertion than the criterion asked for**, **1 half not met**
(since fixed and re-verified), and **1 not checkable from the repository**. Every
finding it raised was fixed and verified. The boxes below are ticked from that
report and from nothing else.

**Four are deliberately left unticked, and the reason differs for each:**

- The **shot-count** criterion and **"Every state of the form has a default view"**
  both name a number of PNGs that a later design pass moved. The wording is updated
  to what was built; the *verification* of the new number is the shipping session's
  own and no reviewer has seen it.
- **"The panel's controls are painted in the harness"** postdates the review, and a
  second design pass then found the fix had never taken — the calibration entry was
  spelled for an unquoted attribute selector and matched nothing. It is now fixed
  and looked at, by the session that wrote it.
- **The owner's-vault criterion** is not checkable here by construction and is
  reworded below so that it can be settled.

**And the counts do not quite line up, which is recorded rather than smoothed
over.** The report graded 40 criteria; this section now holds **43**. Two of the
three additions are named above. **The third is not identifiable from the report,
which carries totals and not a per-criterion mapping** — so one ticked box below
may postdate the review. A later reviewer re-running the axis is what closes that,
and a tidy list that hid it would be worth less than this sentence.

Wave 3 **invalidates** the two popup criteria and the stub-`Menu` criterion outright,
**rewords** the cell-format, gesture, harness and fixture criteria, and **adds** eight.
Everything about the engine — the override, the two phases, the stacking, the
condition, the slot's failure — is unchanged and its criteria are unchanged with it.

- [x] A layout declaring `modifiers` round-trips, and one declaring none does not
      grow the key on save. Two test names in `parse/layout.test.ts`. **Byte identity
      is the fixture's**, not this pair's: a layout file carries no byte-identical
      promise (only a character note does, Constraint 3) and `serialiseLayout`
      pretty-prints, so it cannot hold over a compact source. What the round trip
      proves is that key order inside a definition survives and that a key this
      version does not understand survives with it.
- [x] `parseLayout` refuses a `modifiers` that is not an array of objects, and
      *reports* rather than refuses: a blank name, a name containing `;`, **a name
      that reads as an assignment**, a name declared twice, a missing target, a target
      the layout does not publish, a target that reads no modifier, an unparseable
      amount, an unparseable condition, and a bonus type on an override. One case per
      line in `parse/modifier-definitions.test.ts`. The two unspellable-name cases are
      **dropped** as well as reported, like a nameless one, and each test asserts both
      halves — that it is not offered, and **what a row already naming it does
      instead, which is not the same fact for the two.** A `;`-bearing name reads as a
      **stray**: a cell splits on the separator, so neither half names anything the
      layout declares. A name that reads as an assignment does not — `readsAsAssignment`
      is true of it, so a row naming it **applies it as a typed effect**, which is
      precisely why the name is refused rather than merely reported. The first half is
      `parse/modifier-cell.test.ts`'s discriminator cases; each parser test carries its
      own second half. **A bonus type the layout does not declare is the eleventh and
      stays in `parse/modifier-types.test.ts`**, where the vocabulary is kept and where
      the fix is.
- [x] **A cell's parts split, and each is read as exactly one of the two.** In
      `parse/modifier-cell.test.ts`: `A;;B`, ` A ; B ` and `A; B` all give two parts;
      a repeated *named* part collapses and two identical *typed* parts do not;
      `Belt of Giant Strength` is a name; `Bracers of Defence +1` is a name and
      **not** arithmetic; `Bracers of Armor, Greater` is a name; `armour_class += 2`,
      `armour_class = 18`, `abilities.STR += Qty * 2` and `armour_class+=2` are typed
      effects; `armour_class += if(Training == 2, 2, 0)` is a typed effect whose
      amount holds an `==`; `armour_class + 2` is a **name** because it has no
      assignment; and `armour_class +=` is a typed effect with a blank amount.
- [x] **`armour_class == 2` is a stray name and not a typed effect**, which is the
      negative lookahead in §6's discriminator, asserted on its own line because it is
      the one character between a mistake a reader can see and an effect nothing can
      resolve.
- [x] **The clause keywords parse from the right and only outside parentheses.**
      `armour_class += 2 as item when Worn` gives all four; `armour_class += 2 when Worn`
      gives no type; `armour_class += (when)` is an amount and not a condition. One
      test per case.
- [x] `spellParts` joins with `'; '` and `spellTypedEffect` writes
      `<target> += <amount> as <type> when <condition>` with the blank clauses
      omitted.
- [x] **Spelling a part then parsing it gives the part back, and there is only one
      parser.** A round trip over `spellTypedEffect` then `parseModifierPart` holds for
      every combination of the two optional clauses, and `parseModifierPart` is called
      from `formula/` and from no component — asserted by an import check, because two
      readings of one part's text is the one way this design could have the form and the
      number disagree.
- [x] **Switching a part between the tiers.** Choosing `Typed on this row` on a part
      that named a definition copies that definition's five fields into the cell and
      the number does not move; choosing a definition on a typed part replaces its text
      and the number becomes that definition's; both arm and commit, and neither runs
      on the first press.
- [x] A Card whose `derived` is `value + mod.self` shows the stored value plus the
      pushed total, **from a definition in the layout and from an effect typed on a
      row**, and the two arrive at the same number by the same path — asserted as one
      test with the cell spelled both ways.
- [x] **The owner's case, as one test:** a modifier setting a value to 18 and a
      second adding +1 give 19, and reversing the two pushes gives 19 again. Held for
      a named pair, a typed pair, and one of each.
- [x] Two overrides at one target give the higher, and the loser appears in the
      breakdown reading "a higher override applies"; two of equal value give that
      value and the loser reads "another override of the same value applies". **A
      typed override contests with a named one on equal terms**, asserted, because a
      tier that stacked differently would be a second arithmetic.
- [x] An override to 0 is a value: it contests, it wins against nothing, and it is
      listed. An addition of 0 changes no number and appears in no breakdown.
- [x] The shipped stacking cases still pass unchanged, and shuffling the push list
      produces the identical result for every case including the override ones. The
      shuffle assertion is what stands in for a priority field and it covers both
      phases and both tiers.
- [x] A definition with `when: Equipped` and **a typed effect with `when Worn`** each
      apply on a row whose cell is yes, change nothing where it is no, and the
      inactive row appears in no breakdown.
- [x] A typed effect whose amount reads the row's own cell resolves against that row:
      two rows with the same text and different cells get different amounts.
- [x] An amount that will not resolve makes its slot publish nothing and the reading
      card's `explainField` names the row and the reason — **from either tier**.
- [x] **A typed effect with a blank amount changes nothing and refuses nothing.**
      The slot still publishes, every other contributor still lands, the row draws
      `zap-off`, and the effect appears in no breakdown. This is the criterion that
      makes the form safe to commit per field, so it is named rather than implied.
- [x] **A typed effect naming a bonus type the layout does not declare applies and
      contests as its own kind**, and two such effects naming one undeclared type
      contest with each other. The form shows `<type> (not declared)`.
- [x] A row holding a part the layout does not declare renders, keeps its spelling on
      write, and is not corrected by any edit to another cell in the row — **including
      an edit to another part of the same cell**, which is §6's new rule and the
      case a canonical join over the whole cell would quietly lose.
- [x] Parse then serialise is byte-identical for a note holding a modifier column, a
      cell of names, a cell of typed effects, a mixed cell, and a blank one — and for
      a note holding wave 1's `target` and amount cells against a layout that declares
      neither. **And for every spelling a hand-editor uses**:
      `Plate armour ;Ring of Protection`, `A;;B`, `armour_class+=2` and
      `armour_class  +=  2 as item` all round-trip byte for byte with nothing edited.
- [x] **Committing one field of the form writes only what changed.** The note is
      compared byte for byte outside the cell; the cell is compared part by part, with
      every part the reader did not touch identical to its stored text; and a second
      commit before the re-read does not append a twin.
- [x] **Promotion appends and converts, in that order.** In `table.test.ts` and a new
      `view/promote-flow.test.ts`, on `view/reset-flow.test.ts`' shape, which is this
      repository's precedent for a view-owned write flow: a successful promote adds one
      definition at the end
      of the layout's list and rewrites exactly that one part into the name, leaving
      the other parts byte for byte; a **blank name**, a name with a `;`, an
      assignment-shaped name, **a name the layout already declares**, and a failing
      write are each refused with a message naming the fix, and in every one of the
      five the cell is untouched — asserted, because a cell rewritten after a failed
      layout write is the one way this gesture could manufacture a stray.
- [x] **Promotion never orphans.** A promoted definition changes no other row's
      number, and the row that promoted it computes the identical number before and
      after. Other rows holding the identical text are untouched — asserted, so the
      decision not to search for them is a checked one.
- [x] `configError` refuses, each with the fix in the message: `total` on a modifier
      column; `publish` on a modifier column. And it refuses *nothing* for a second
      modifier column — asserted, because refusing would take the table and every
      modifier its rows apply down with it.
- [x] An override applies only to a name whose own formula read its slot: a Card whose
      formula reads no modifier is not overridden, asserted rather than assumed,
      because that is the bound that keeps the override step from being a warming.
- [x] A Card set whose `derived` reads `mod.self` is overridden per entry, and a typed
      effect aimed at `abilities.DEX` moves DEX and leaves STR alone.
- [x] A modifier row on a table with `openRows` on works, and
      `<table id>.<that row's name>` still fails as an unknown name. **And a typed
      effect on an open row works**, which is the case wave 2's model could not reach
      without a layout edit and is most of what this wave is for.
- [x] `contract.test.ts` accepts `scopeModifiers` in its declared position with its
      narrowed signature, holds `ModifierPush` carrying `part` rather than a
      definition name, and still refuses a member outside the contract.
- [x] `isolation.test.ts` still passes: `parse/` and `formula/` import nothing from
      `obsidian`, no component imports a sibling, and **`obsidian`'s `Menu` is
      imported nowhere in `src/`** — the one import `check-menu.ts` held is gone with
      it.
- [x] `harness/stub-icons.test.ts` passes with `plus`, `zap` and `zap-off` in the
      stub's icon table, so the harness draws real Lucide paths rather than the icons'
      names.
- [x] **The glyph reads the row, over all four states.** In `table.test.ts`: no part
      draws `plus`; one applying draws `zap`; one not applying draws `zap-off`; two
      parts with one applying draws `zap`; two with neither applying draws `zap-off`;
      **a cell holding only an unfinished typed effect draws `zap-off`**. The
      accessible name carries the matching one of its five forms, a typed part is
      spelled by what it does rather than by a name, and the `title` marks a
      non-applying line `(changes nothing)`. `.sheetsmith-table-inert` appears
      nowhere, because the class is gone.
- [x] **The form says what the row does and changes it.** In `table.test.ts`: the list
      holds one line per part in the cell's order with `zap` or `zap-off` and the
      part's own wording; a non-applying line carries its reason on a line under it; a
      press on a line opens that part's fields and closes any other; the `Modifier`
      select holds `Typed on this row` plus every definition the layout declares, each
      resolved against this row; choosing a definition makes the four fields read-only
      and writes the name into the cell; choosing `Typed on this row` hands them back;
      each of the six fields commits on its own gesture and writes one part; a row with
      no parts opens with one blank typed effect already open and `Changes` focused;
      and a layout with no definitions shows a `Modifier` select with one option and
      **no error**.
- [x] **Remove arms, then takes the whole enrolment.** Every copy of a repeated name
      goes, because a repeated name is *one* enrolment — the row applies it once, the
      glyph counts it once, the arithmetic sees it once — while one of two identical
      *typed* parts goes alone, because those are two effects. Every other part comes
      back as its own stored text. **Stated as its own criterion because the reading it
      replaces is the one defect the owner hit**: this line said "drops that part
      alone", the code did exactly that, and pressing Remove on one of two identical
      names left the row still applying the modifier with every layer test green.
      `parse/modifier-cell.test.ts` holds `withoutPart`; `table.test.ts` drives the
      gesture and **carries the delta through `table.write` to the note**, which is the
      assertion the suite was missing — a delta that still names the modifier is
      shape-identical to one that does not.
- [x] **The panel is a dialog and its keyboard contract holds.** `role="dialog"` with
      an `aria-label` naming the row; the button carries `aria-haspopup="dialog"` and
      an `aria-expanded` that goes back to `false` on hide; focus moves to the first
      control on open; Tab cycles within the panel; Escape closes it and **focus is
      back on the glyph**; a press outside closes it; **a scroll does not** and the
      panel repositions instead. Six of these are things Obsidian's `Menu` gave free,
      so each is asserted rather than assumed.
- [x] **The cell has one gesture.** `bindLongPress` takes two arguments, no modifier
      cell binds a long press, and `popover.test.ts` has no `claimTouchPress` case.
- [x] `ui/anchored-panel.ts` and `ui/popover.ts` share one placement call, asserted by
      a test that clamps both at the same viewport edge and gets the same answer — the
      cheapest guard against the two drifting.
- [ ] In the harness, both themes: a modifier cell draws `plus` on an empty row, `zap`
      on one that applies and `zap-off` on one that does not; a row holding two parts
      draws one glyph; **`&press=` opens the form on a row whose cell holds a name and
      a typed effect, with the typed one open**, so the list, a reason line, the six
      fields and the promote row are in one shot; a modified card shows the dotted
      mark; and pressing the number opens a breakdown with an override line, a
      suppressed override, and a total that reads as a value rather than an addend.
      **`harness/shots/` holds 40 PNGs**, `sheet-modifier-menu-*` renamed to
      `sheet-modifier-form-*`. **32 at the spec review, 35 after the first design
      pass, 40 after the second**, which added the repeated-name case, the armed
      **Remove**, and the panel at a larger text size, on a narrow pane and in
      forced colors.
- [ ] **Every state of the form has a default view**, which is what the design axis
      found missing after the first two shots: `sheet-modifier-form-light` and
      `-dark` both press twice, so they show a part *open* and nothing showed the
      panel as a first press leaves it. Three views close it —
      `sheet-modifier-form-closed` (the list, nothing open),
      `sheet-modifier-form-empty` (the `plus` path: `This row applies no modifier.`
      with one part already open and **Changes** focused, which is the one-opening
      claim the design rests on), and `sheet-modifier-form-named` (a named part: four
      fields read-only, the line saying where they are edited, and **no promote
      row**). **The count moves from 32 to 35 for them**, and to 40 with the second
      design pass's four (`-repeat`, `-armed`, `-large-text`, `-narrow`,
      `-forced-colors`), which is the number to check.
- [ ] **The panel's controls are painted in the harness, and the calibration
      actually runs.** `harness/calibrate.mjs` pulls the app's bare `input`, `button`
      and `select` rules, and `harness/theme.css` carries a fallback for a clone that
      has never calibrated. Without them the panel's two text fields and three buttons
      rendered with no host paint at all — white boxes with black text on a dark
      panel — so **this feature's largest surface was photographed unpainted and
      reviewed that way**. It is the first sheet-side surface whose controls the plugin
      deliberately leaves to the host, which is why the rule saying "these can never
      reach a sheet" stopped being right.
      **Two failures sit behind this criterion and both are checkable rather than
      taken on trust.** The entry was first written as a literal `input[type=text]`
      and matched **nothing**, because Obsidian spells that selector quoted while it
      spells the checkbox unquoted; the shot was retaken and the surface was *still*
      unpainted while the diff said it was fixed. And `npm run harness` does not
      calibrate — `harness:calibrate` is a separate script — so a re-shoot proves
      nothing on its own. **To settle it: run `npm run harness:calibrate` and check
      the reported chrome-rule count moves, then confirm every control in
      `sheet-modifier-form-light` measures the app's `--input-height` of 30px** rather
      than reading the CSS.
- [x] In the harness, the layout editor's Layout panel shows the Modifiers list with
      its target picker offering exactly the accepting targets, and reports a
      definition whose target reads no modifier. **And it shows no error for a layout
      declaring no definitions**, which is the report this wave retires.
- [x] `npm test`, `npm run lint` and `npm run build` pass. `styles.css` agrees with
      `src/styles/`.
- [x] **The fixture is the two files in this repository and is verified here.**
      `src/test/fixtures/modifiers/Modifier variations.json` and
      `src/test/fixtures/modifiers/Ilona.md`, rewritten rather than replaced by new
      filenames, carry literally what `## The throwaway vault fixture` lists.
      `view/vault-fixture.test.ts` runs both through the real layout parser, the real
      character parser and Table's real `read`, and asserts the numbers, the exact
      text of two breakdowns, and that serialising the note back gives the file's own
      bytes **including both hand-spelled cells**.
- [ ] **The owner has pressed the steps in `## The throwaway vault fixture`.**
      **Reworded at the land stop, because as written it could not be settled by
      anyone.** It bundled two claims with different evidence, and a single unticked
      box said nothing about either:
      - **The files are placed and current.** Settleable, and by anyone: the vault's
        `Modifier variations.json` and `Ilona.md` are byte-identical to
        `src/test/fixtures/modifiers/`, which `diff` answers. At the land stop they
        were placed and current.
      - **The steps have been pressed, and what they showed was right.** Settleable
        **only by the owner**, and that is a fact about the criterion rather than a
        gap in it: `AGENTS.md` puts the vault outside the repository, and every step
        needs the running app — a panel opened by a press, a panel under a finger, a
        layout file written from a sheet, a hover preview, a rename propagating, and
        a text editor open beside the vault for the last step. **So the tick is the
        owner's to give**, and what they report is which numbered step they reached
        and what it showed — not "yes".

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

**Eleven commits, and none of them is "the third wave".** Nothing is committed, so
`/land-it` splits the *result* and not the route: no commit says "and then the owner
changed their mind", and `check-menu.ts` never appears in the history at all.

1. **feat: Let a layout name the changes its items make.** `parse/modifier-cell.ts`
   and `parse/modifier-definitions.ts`, the `modifiers` key, `ModifierDefinition` and
   `TypedEffect` in `types.ts`, the round trip, the reported problems including both
   unspellable-name shapes, and the cell's own format — the separator, the split, the
   join, one part's parse and one part's spelling.
2. **feat: Resolve one modifier against the row that holds it.**
   `formula/modifier-definitions.ts`: the part's two readings, the lookup, the
   condition, the amount, the row scope, the unfinished case, and the failure naming
   the row.
3. **feat: Turn a row's modifier cell into pushes.** `ModifierPush` and
   `ModifierSource` narrowed to a part, `scopeModifiers`' new signature,
   `contract.test.ts` and PATTERNS §3's member order, and `formula/modifiers.ts`
   walking parts. Wave 1's types go here.
4. **feat: Apply an override before the additions.** The phase split in
   `stackModifiers`, `ModifierResult.override`, `ModifierLine`'s operator and its now
   optional definition, the bounded override step in `resolve.ts`'s `fieldReaders`,
   and the shuffle assertion over both phases and both tiers.
5. **feat: Give Table a modifier column.** The column type appended, `configError`'s
   two refusals and the cap that goes without being replaced, `scopeModifiers` turning
   one cell's parts into several pushes over one `RowValues`, the round-trip tests
   including every hand-edited spelling, and `amountOfCell` and
   `MODIFIER_AMOUNT_TYPES` deleted. The cell draws its parts as plain text at this
   commit, which builds and passes, and is the last commit at which the sheet cannot
   edit one.
6. **feat: Draw a modifier row as one glyph.** `plus`, `zap` and `zap-off`, the three
   stub icon entries, the `<button>` with Obsidian's own button chrome stripped under
   `.sheetsmith-view`, the glyph rule read over a row rather than a cell, the
   accessible name's five forms including the typed spelling, the `title` at its two
   depths through `modifierRowText` and `modifierRowName`, and
   `.sheetsmith-table-inert` deleted along with the rule that never painted.
7. **feat: Anchor a panel to the control that opened it.** `ui/anchored-panel.ts`, the
   placement extracted from `ui/popover.ts` and shared, the dismissal regime with
   scroll repositioning rather than closing, the focus cycle and the Escape return.
   No modifier code in this commit: it is the surface, and it is separable because it
   knows nothing about what it holds.
8. **feat: Type a row's own modifier in a form on its glyph.**
   `components/modifier-form.ts`, `ModifierContext`'s `targets`, `published`,
   `bonusTypes` and its part-taking `outcome`, the six fields committing one at a
   time, the list with one part open, **Remove** on the delete control's own
   arm-then-commit, `aria-haspopup="dialog"`, and `harness/shot.mjs`'s
   `sheet-modifier-form` view.
9. **feat: Save a row's modifier to the layout to reuse it.** `ModifierContext.promote`
   and `PromoteResult`, the sheet view's implementation over the write the layout
   editor already performs, `view/promote-flow.test.ts` on `reset-flow.test.ts`' shape,
   the four refusals, and the append-then-convert order. The detach gesture — a named
   part switched to typed — goes in commit 8 with the rest of the form, since it writes
   only a cell.
10. **feat: Say what a modified number is made of when something set it.**
    `ModifierBreakdown.override`, the "sets to" line, the two override suppression
    wordings, the total line's two shapes, a line for a modifier with no name, and the
    cell's own text through the same builder.
11. **docs: Record modifier definitions against the spec axis.** `SPEC` §2's
    vocabulary (**Modifier definition**, **Typed modifier**, and what "modifier
    column" now means), **§2's reading and its edge from §7 of this document, beside
    the "values only, never structure" sentence and in §3's rules**, §4.1's narrowed
    `scopeModifiers`, §4.2's Table entry and column types, §5's phases, the override's
    rules and **the amendment to "nothing stored ever names a type"**, §7's Layout
    panel and the fact that a definition may arrive from a sheet, §10 on a renamed
    definition and on a dropped bonus type, §11 where "not bundled rules content"
    needs re-reading against a second tier, PATTERNS and UI where the new vocabulary
    lands, this document's status, and the fixture.
    `/land-it` writes the §13 `Resolved:` entry for the authoring-surface question
    here; records the guard finding below as an amendment to the entry that says "more
    entry points, no change to the rule"; **amends rather than resolves the
    undeclared-`modifierType` entry**, whose stated reason — that a component cannot
    see the layout's declared list — is no longer true; and notes that
    `.sheetsmith-list-scroll`'s cap was partly answered by deletion and partly still
    open. **`docs/UI.md` §9 needs four edits here**: the glyph-control row's members;
    the "three channels" sentence, which is one visual channel plus the accessible
    name; the paragraph saying the press and the press-and-hold are separated by hand,
    which is stale against the built code *and* against this design; and **the "a
    popup that manages a set is the app's own `Menu`" paragraph, which is replaced by
    an anchored panel of this plugin's, with the four things `Menu` gave free listed as
    what the panel owes.** §9 also gains the panel as new shared vocabulary, and its
    column-width row keeps the modifier tables as its loudest instance.

    **Two lists this commit must work through, found by the structural review and
    recorded here because nothing else survives to the land stop.**

    *`SPEC` §5 contradicts the built code in four places*, and three of them are not
    the amendment this document already tracks:

    - `:163` describes `scopeModifiers` as "a factory over a resolver **and an
      explainer**" whose pushes carry "the target as the cell spells it… either an
      amount or the reason". A push carries `part` and a row, and the explainer left
      with wave 1.
    - **`:387-397`** describe a `target` column type and "one `target` column per
      table". Both are gone: the column type is `modifier`, and one is enough rather
      than capped. **The block starts at 387 and not 389** — that line introduces the
      whole model ("A row may declare a modifier against a value published elsewhere
      on the sheet, and that is the third thing a column can be asked to do. A
      `target` column's cell holds…"), so a range starting one paragraph in would
      leave the introducing sentence standing over five rewritten ones.
    - `:510` is the "nothing stored ever names a type" sentence, which §1's amendment
      replaces with a rule. This one is already tracked above; the other two are not.

    *Every `feature doc` citation in shipping code has to be retargeted*, where
    `PATTERNS` §3 asks a header for its `SPEC` section and only a test did that at
    `HEAD`. **Find them rather than working from a list**, which is the robust
    instruction and the one this record earns by having been wrong once:

    ```
    grep -rn 'feature doc' src | grep -v '\.test\.ts'
    ```

    At the time of writing that is **13 citations across 8 files** — `types.ts`,
    `parse/modifier-cell.ts`, `components/modifier-form.ts`, `layouts.ts`,
    `parse/modifier-types.ts`, `components/table.ts`, `view/sheet-view.ts`,
    `formula/modifier-definitions.ts` — and the number will move if anything is edited
    before landing, which is why the command is the record and the count is only a
    check on it. **An earlier version of this paragraph said "ten" and omitted
    `components/modifier-form.ts` entirely**, which is the file a later fix rewrote:
    an enumeration written once goes stale against the diff it belongs to.

    Each has to point at the `SPEC` section this commit writes, because a feature doc
    is a plan and `SPEC` is the source of truth — and a comment citing the plan goes
    stale the moment the plan is spent.

## Deliberately not doing

- **Per-item stacking overriding a layout default.** The owner clarified that the
  original request was the override operator, not a stacking-rule exception. **Typed
  stacking ships unchanged.** The survey found no tool offering a per-effect override
  of a global stacking rule, and PF2e-on-Foundry's `force` field means "win the
  same-type contest even if smaller" rather than "bypass the contest" — it throws if
  combined with untyped. The shape does not exist to be copied. **A typed effect does
  not reopen this**: it may name a bonus type, and the rule about what a type *means*
  is still the set's and still the layout's.
- **Multiply and divide operators.** Only override joins add. CSB carries `* /` and
  Foundry carries Multiply, and both carry an operation order beside a priority
  integer because the two do different work. Two phases hold because each reduces to
  one number; a multiply does not, and taking one is where the priority integer comes
  back. **And the cell's syntax deliberately spells only `+=` and `=`**, so a reader
  who tries `*=` gets a stray part rather than arithmetic nobody designed.
- **A subtract operator.** A penalty is a negative amount, which is what the shipped
  stacking arithmetic already assumes. A second spelling for a minus sign would be a
  second way to say one thing.
- **A priority field, or a phase field.** Not deferred so much as unnecessary, and
  asserted rather than claimed: with two phases each reducing to one number the result
  is order-independent, and the shuffle test covers both.
- **A modifier holding more than one change.** One target, one operator, one amount,
  from either tier. An item that changes two values is two parts of one cell. **Wave 3
  takes the last of the pressure off this**: wave 2 left it open with the note that a
  cell holding a list had removed the *surface* reason for wanting it, and typing an
  effect removes the authoring reason too — two typed parts in one cell is two lines
  in one form, which is where an author would have wanted the pair anyway. What is left
  is economy in the layout editor for a definition used by many rows, which is a real
  design and an open item, not a gap.
- **Refusing a second modifier column.** One is enough and the editor says so; the
  sheet refuses nothing, because `configError` would take the table and every modifier
  its rows apply down with it.
- **A fourth glyph for a row that is partly applying**, or one glyph per part. The
  first is a mark most readers meet once and could not name; the second is the
  two-glyph row wave 2 existed to remove, moved inside a cell.
- **A per-character override of a layout definition.** A row either enrols in a
  definition whole or types its own effect whole; it cannot enrol in one and change
  its amount. That is the third shape the survey shows — CSB's per-instance modifiers
  *replace* rather than patch a template's — and patching would put a delta in a note,
  which is a cache of the definition it patches and the one thing §1 forbids
  absolutely. Typing the whole effect is the supported answer, and §8 is how it stops
  being a one-off.
- **Reading a typed effect from anywhere.** It has no name and nothing can point at
  it: §7's edge, and it is a non-goal rather than an omission.
- **A search for other rows holding the same text on promotion.** §8 has the three
  reasons; the first is that it is the migration §10 declines to perform.
- **Migrating a renamed definition into character notes.** §10 offers migration for a
  renamed *component*, whose sections are keyed by label; a definition name lives in
  one part of one cell inside a markdown table, and rewriting one across every note on
  a layout is a different job with a different failure mode. Open item, and wave 3
  makes it no easier.
- **Undo, anywhere.** `SPEC` §7 records that nothing in the editor has ever had it,
  and §8's promotion inherits the gap. The recovery is that promotion is additive.
- **Grouped conditional modifiers.** §13's recorded deferral, unchanged: the ungrouped
  case is expressible and the missing half is one switch governing many modifiers plus
  a surface to show it on, which CSB needed a second component for.
- **Dice, a string type, a collection value, and the published-name depth question.**
  All four are §13 decisions this design leans on rather than reopens. A `mod.` entry
  still answers to no `.value`. **The cell's syntax is deliberately not a place a
  string arrives either**: `as item` names a bonus type, which is configuration
  vocabulary and never a value the language sees, exactly as `SPEC` §5 already says of
  a type.
- **Closing the two cycle guards' mutual ignorance.** §13's question, interacted with
  below, flagged, and not touched.
- **A `select` column type.** §13 stays open, and wave 3 moves it further than wave 2
  did without answering it. The modifier column's cell still carries no per-column
  options list, and the definitions list is still a layout field rather than "a list
  whose cells are themselves lists" — so the open half is untouched. What now exists is
  a precedent for a *control*: a cell edited in an anchored form with six labelled
  fields in it. Recorded so the next reader of §13 knows the shape exists, not as a
  claim that the question is closed.
- **Raising `.sheetsmith-list-scroll`'s cap.** Partly answered by deletion, as §13
  hoped; neither the definitions list nor the sheet's form goes inside the scroller,
  and the cap question stays open for the lists still in it.

## Risks

1. **A formula using `mod.self` as anything but a plain addend gets different
   arithmetic under an override.** `value + mod.self * 2` doubles the additive total
   normally and adds it once when overridden; the engine can only re-add what it
   holds. Small, because `+ mod.self` is the canonical spelling everywhere in the spec
   and both fixtures, and unavoidable without a base to replace — which
   `10 + abilities.DEX + mod.self` does not have.
2. **`ModifierContext.outcome` widens which names enter the modifier walk**, and so
   shifts which of the two cycle guards closes a ring both could catch. Flagged in full
   below. It is bounded by the accepting set and it is not a warming, but it moves
   toward one. **Wave 3 changes the count and not the substance**: a cell's parts ask
   once each, typed and named alike, and the form asks once per definition on a
   **press** — which happens after a render has finished, so those calls can never be
   the first entry into the walk in a render.
3. **Editing one definition changes every character on the layout, silently.** That is
   the point of the named tier and it is also the exposure: a `+2` corrected to `+1`
   moves every sheet at once with nothing announcing it. Nothing is cached, so the
   change is visible the moment a sheet is opened rather than fossilised in notes;
   there is no undo in the editor at all.
4. **A renamed definition orphans rows in files the editor never opened.** Nothing is
   lost and every affected row says it changes nothing, but the author is not told how
   many rows they just switched off, because the editor cannot see a character note.
5. **And the mirror of 4, which is wave 3's own: a typed effect is invisible to the
   layout author.** A player who typed `+3` where the item gives `+2` is wrong on their
   own sheet and nothing in the editor can see it, because the effect is in a file the
   layout has never read. Wave 2's model made every push auditable from the pane and
   this hands half of that back. It is the honest price of the tier, and the mitigation
   is §8: an effect worth auditing is an effect worth naming.
6. **The accepting set is still coarse at the component and still over-reports**, and
   **wave 3 makes it worse in one place.** A Table where only the computed column reads
   `mod.self` reports every name that Table publishes as accepting, including a column
   total. Under wave 2 that over-report reached one surface, the editor's target
   picker; it now reaches two, because the form's **Changes** select is over the same
   set and a player choosing from it can aim an effect at a name that ignores it. The
   row then draws `zap` and changes nothing, the editor reports no problem because the
   target *is* accepting, and neither surface can tell. Unchanged in kind, wider in
   reach, and `docs/UI.md` §12 holds it as the row about a breakdown listing
   contributors that did not move the number.
7. **A component that forgets to pass its published name to the resolver reads
   `mod.self` as 0**, and takes no override. `contract.test.ts` cannot see it; it costs
   a test per publishing component, which Card, Card set and Table each keep.
8. **The cell is a syntax in a file people hand-edit, and wave 3 doubles it.** Wave 2
   put one character in the cell, `;`. This adds an assignment, two clause keywords and
   a rule about which is which. A reader who reaches for a comma still gets a stray, a
   reader who reaches for `*=` gets a stray, and a reader who names a column `when`
   has one paren to type. Bounded three ways — the form is where a modifier is normally
   written, so hand-editing this cell is a choice; a name a cell could not spell is
   reported where the name is typed; and a stray costs nothing but a line of text until
   someone fixes it — and it is still the largest thing this design puts into a user's
   own file.
9. **A typed effect names a bonus type, so a layout edit can now orphan something
   stored.** `SPEC` §5's "nothing stored ever names a type" was a construction
   guarantee and is now a rule with a rendering behind it. Benign — the effect applies
   and contests as its own kind — and it is the one sub-decision here an owner may take
   the other way, so §1 states the alternative rather than assuming this.
10. **The panel owes what `Menu` gave free.** Placement is bought back by sharing the
    popover's; dismissal is the popover's regime with one departure; **keyboard
    navigation, focus management and the phone regime are owed**, and each is a place a
    plugin gets a floating surface subtly wrong. Six criteria exist for exactly this
    reason. And **nothing below a 500px viewport has ever been photographed**, so the
    phone regime is read rather than seen — first real look is a press step.
11. **The form is the largest surface this plugin draws on a sheet**, six fields plus a
    list plus a promote row, inside a panel with a capped height. On a narrow pane it
    will scroll, and a scrolling form inside a table that also scrolls is two scroll
    contexts under one finger. Recorded because it is the thing a reviewer will ask
    about first and the thing `docs/UI.md` §12's width row is nearest to.
12. **A promotion writes a layout file from a sheet**, which is a capability this
    plugin did not have. Bounded to appending one definition and refusing every other
    case, ordered so a failure changes nothing, and with no undo behind it. The residue
    is that a player can now add to a shared layout, which on a shared vault is a
    social question rather than a technical one and is not one this design can answer.
13. **A mostly-blank inventory grows a column of faint plus glyphs.** The price of
    making the cell discoverable, and the delete glyph one column over already charges
    it. At rest the plus does not clear the 3:1 a *state* mark must clear, argued under
    Design as an affordance rather than a state; if the design axis reads it the other
    way, the fix is one token.

## The throwaway vault fixture

A vault fixture lives outside the repository (`AGENTS.md`) and its recipe lives inside
it, as two literal files. **The files are rewritten in place, keeping both
filenames**, because `sheet-layout: Modifier variations` resolves to
`<layout folder>/Modifier variations.json` by filename and
`view/vault-fixture.test.ts` asserts the two agree — and because the owner's vault
already holds a copy, so replacing the contents is one overwrite where new names would
leave the old pair sitting beside the new one.

| Copy this | Over this in the vault |
| --- | --- |
| `src/test/fixtures/modifiers/Modifier variations.json` | `Sheetsmith layouts/Modifier variations.json` |
| `src/test/fixtures/modifiers/Ilona.md` | `Characters/Ilona.md` |

Not Aramil, who is deliberately a plain sheet.

**What the files hold**, as a reading aid; the files are the spec and
`view/vault-fixture.test.ts` is what holds them to it.

- `columns: 6` and `modifierTypes: [item, status, circumstance, morale]`. `morale` is
  declared and unused on purpose. **A fifth type, `luck`, is *used and not declared*** —
  by a typed effect in the note — so both halves of the vocabulary's edge are in the
  file: one type the layout names that nothing uses, and one a cell names that the
  layout does not.
- The **Card set** `abilities`, the two **Cards** `armour_class`
  (`10 + abilities.DEX + mod.self`, and Ilona's DEX is +2, so its base is 12) and
  `passive_perception` (reading no modifier on purpose), and the **Table** `skills`
  with a published `perception` row.
- **`modifiers`**, declaring: `Belt of Giant Strength` (adds `2` item to
  `abilities.STR`); `Gauntlets of Ogre Power` (adds `1` item to the same, so it is
  suppressed); `Bull's Strength` (adds `1` status, so it adds); `Ring of Protection`
  (adds `1` item to `armour_class`); **`Bracers of Defence +1`** (adds `1`
  circumstance to `armour_class`) — **the `+1` in the name is deliberate**, so a name
  carrying arithmetic sitting in a cell and *not* being read as arithmetic is in the
  file rather than only in a test; `Plate armour` (**sets** `armour_class` to `18`);
  `Mage armour` (**sets** it to `13`, so it loses); `Cloak of Elvenkind` (adds `1`
  status to `armour_class` **only when `Worn`**); `Cloak of Displacement` (aimed at
  `passive_perception`, which reads no modifier — the one definition there to be
  reported rather than to work); and `Eyes of the Eagle` (adds `2` item to
  `skills.perception`).
- A **Table** `magic_items`, `openRows` on, with **one** modifier column keyed
  `Modifiers`, a `Worn` toggle column for the condition, and a `Notes` text column.
- A second **Table** `worn_items` with one modifier column and a `Ring of Protection`
  row, so the qualified breakdown form (`Worn items · Ring of Protection`) is on the
  sheet rather than something the reader builds first.
- **Fourteen rows on `magic_items`, and each is there for one fact:**

| Row | Modifiers cell | Worn | The fact |
| --- | --- | --- | --- |
| `Belt of Giant Strength` | `Belt of Giant Strength ;Bracers of Defence +1` | yes | Two names, two different values moved from one row under one glyph — **and hand-spelled**, so the tolerant read and the byte-identical round trip are in the file. Also a name carrying a `+1` |
| `Gauntlets of Ogre Power` | `Gauntlets of Ogre Power` | yes | Same type, smaller: suppressed, and says so |
| `Bull's Strength` | `Bull's Strength` | yes | A different type at the same target: adds |
| `Bracers of Warding +2` | `Ring of Protection; armour_class += 2 as item when Worn` | yes | **The mixed cell**, and the row this wave is about: a name and a typed effect in one cell, both item at armour class, the typed `+2` winning and the named `+1` on the same row suppressed. The row's own name carries a `+2` |
| `Plate armour` | `Plate armour` | yes | A named override, winning |
| `Barkskin` | `armour_class = 16` | yes | **A typed override**, contesting with a named one and losing |
| `Mage armour` | `Mage armour` | yes | A second named override, losing to both |
| `Cloak +1` | `Cloak of Elvenkind; Cloak of Displacement` | yes | Two names, one applying; the second aimed at a value that reads no modifier. The row draws `zap`, and the canonical `'; '` spelling sits on the same sheet as the hand-spelled one above |
| `Spare cloak` | `Cloak of Elvenkind` | **no** | Both sides of one definition's condition in the file rather than manufactured by a press |
| `Lucky charm` | `abilities.STR += 1 as luck` | yes | **A typed effect naming a bonus type the layout does not declare**: it applies, contests as its own kind, and the form says `luck (not declared)` |
| `Unfinished ward` | `armour_class +=` | yes | **A typed effect with no amount**: changes nothing, refuses nothing, draws `zap-off` |
| `Eyes of the Eagle` | `Eyes of the Eagle` | yes | A modifier aimed at a published Table row |
| `Torch of Nothing` | `Belt of Giant Strengh` | yes | A stray part, misspelled by hand, rendered and never corrected |
| `Chalk` | *(blank)* | | The ordinary blank row: `plus`, and one press to a filled form |

**The arithmetic, stated so a press step cannot contradict it.** At armour class:
overrides are Plate armour 18 (applies), Barkskin 16 and Mage armour 13 (both "a
higher override applies"); additions are item **+2** (the typed one on
`Bracers of Warding +2`, with both `Ring of Protection` rows reading "a larger item
bonus applies"), status **+1** (`Cloak of Elvenkind` on `Cloak +1`; `Spare cloak` is
inactive and in no breakdown) and circumstance **+1** (`Bracers of Defence +1`), so the
additive total is **+4** and **armour class is 22**. At `abilities.STR`: item **+2**
(the Belt, with the Gauntlets suppressed), status **+1** (Bull's Strength) and luck
**+1** (`Lucky charm`), so `mod.abilities.STR` is **+4**.

**What to press.** Where a step's arithmetic is checkable it is already checked in
`vault-fixture.test.ts`, so a step failing here is about the surface rather than the
sums.

1. **Read armour class and open its breakdown.** It is **22**. The lines are Plate
   armour setting it to 18; Barkskin's 16 and Mage armour's 13 each not applied because
   a higher override applies; the typed item +2; two `Ring of Protection` item +1 lines
   not applied because a larger item bonus applies, one of them qualified
   `Worn items · Ring of Protection`; the Cloak's status +1; and the Bracers'
   circumstance +1. The last line reads `Total 22` and not a signed number.
2. **Type a number on a row and watch the sheet move.** Open the glyph on
   `Bracers of Warding +2`, select its typed line, change **Amount** from `2` to `3`
   and press Enter. Armour class becomes **23** with no layout edit anywhere. **This is
   the step the whole wave exists for.** Set it back to `2`.
3. **Watch the two tiers contest.** Untick `Worn` on that row. The typed effect's
   condition fails, the item contest falls to the Rings' +1, and armour class is
   **21** — while the row still draws `zap`, because the `Ring of Protection` in the
   *same cell* now applies. That is the mixed-glyph rule on screen. Tick it back.
4. **Save it to the layout.** In the same form, type `Bracers of Warding` under
   **Reuse this elsewhere** and select **Save to the layout**. The definition appears at
   the end of the Modifiers list in the layout editor; the cell becomes
   `Ring of Protection; Bracers of Warding`; armour class is unchanged at **22**. Then
   try to save a second effect under the same name and read the refusal.
5. **Watch a rename orphan it, and nothing be lost.** Rename `Bracers of Warding` in
   the layout editor. The row's part goes stray, its line says the layout declares no
   modifier of that name, and armour class falls to **21**. Rename it back and the row
   returns. Constraint 4 with the reader watching.
6. **Watch the loser take over.** Remove `Plate armour` through its own row's form.
   Barkskin's 16 wins: armour class **20**.
7. **And the next loser.** Remove `Barkskin` too. Mage armour's 13 wins: **17**, and
   the last line reads `Total 17`.
8. **Switch the overrides off and watch the formula come back.** Remove `Mage armour`.
   Armour class is `12 + 4` = **16**, and the last line goes back to `Total +4`.
   Restore all three.
9. **Toggle a condition and watch one row go inert.** Untick `Worn` on `Cloak +1`.
   Armour class drops by one to **21**, the cloak leaves the breakdown entirely, and
   **the row's glyph goes from `zap` to `zap-off`** because that cell's other part was
   never applying either.
10. **Finish an unfinished effect.** `Unfinished ward` draws `zap-off`; open it, and
    **Changes** reads `Armour class` with **Amount** blank and a line saying it needs
    one. Type `1`: untyped, so it stacks with everything, and armour class is **23**.
    Clear it again.
11. **Read an undeclared bonus type.** `Lucky charm`'s form shows
    `luck (not declared)`, and Strength's breakdown lists it as `luck +1`, applying.
12. **Read a stray and leave it alone.** `Torch of Nothing` draws `zap-off` and its
    form's line names the fix. Edit its `Notes` cell, and the misspelling is still
    there afterwards, byte for byte.
13. **Start from empty in one opening.** Press `Chalk`'s `plus`: the panel opens with
    one blank typed effect already open and **Changes** focused. Choose
    `Armour class`, type `1`, Enter. One opening, where wave 2 needed two.
14. **The keyboard, which is the half the panel owes rather than borrows.** Tab to a
    glyph, press Enter, Tab through the six fields, press Escape — focus is back on the
    glyph. Then repeat under a finger on a phone, which is the one surface here nothing
    in the harness can photograph.
15. **Hand-edit the note in a text editor beside the vault.** Change row 1's
    `Belt of Giant Strength ;Bracers of Defence +1` spacing and row 4's typed part to
    `armour_class+=2 as item when Worn`. Reopen the sheet: every number is identical.
    Close it without editing anything: the file is unchanged, byte for byte.

## Corrections after review

What review found this document had got wrong about its own code — or about itself —
and what was changed here as a result. Listed rather than folded in silently, because
a spec edited to match the code stops being a check on it: the point of the section is
that a later reader can see which sentences were *corrected* and which were the plan
all along.

Two kinds of entry, kept apart because collapsing them is how the section would start
lying. **A correction** is a sentence of this document that was false. **A decision
taken during review** is a sentence that was true and was deliberately changed or
narrowed. Where the build merely departed from a sentence without changing its intent,
the cause was another sentence of this same document.

**The largest entries in this table are the third wave's, and they are the second
kind. The third wave reverses the second's model decision.** At the wave-2 hard stop
the owner was offered a form in which a row's effect is typed, or a picker over named
definitions with editing confined to the layout editor, and chose the picker; the
picker was built, reviewed on all three axes and remediated, twice. They have now
chosen the other. Nothing about wave 2 was false. What changed is which of two
offered shapes the feature is, and the earlier answer is not treated as binding
anywhere below.

**Every affected passage is rewritten in place** rather than annotated — §1, §2, §5's
"it cannot know what a definition is", §6 entirely, the Design section's popup, the
error states, the layout editor's empty-layout report, the Data and file model
section, most of the criteria, Risks 2, 5, 6, 8 and 9, and the whole fixture recipe —
because the one failure this table has already recorded three times is a reader working
through the body and being sent to build something the owner had rejected. **The table
is the index; the body is where a reader is standing.**

**The table reads newest first**, which matters now that three waves are in it: a row
below another may describe a state a row above has already superseded. Wave 2's row
saying a cell holds "several names, separated by `;`" is the clearest case — it was
true when written, and the row above it is what replaced it. Nothing is deleted from
this table, because a superseded entry is still a record of what a reader was once
told.

Two sections are **new** rather than rewritten, and they are where the reversal is
actually paid for: **§7**, the reading of `SPEC` §2 that licenses a modifier typed
into a cell, with the edge that stops the next feature widening it; and **§8**,
promotion, which is the first thing in this plugin that edits a layout from a
character's sheet.

| What was wrong | Corrected to | Why, and which finding |
| --- | --- | --- |
| **Eleven commit boundaries**, each named for a slice of the build | **Four**, and the reason is a fact about the code rather than a shortcut taken while shipping | **The boundaries were a plan and the plan did not survive the type contract.** `ModifierPush`, `ModifierSource`, `ModifierContext` and `SheetModifiers` all change shape together, and `npm run build` type-checks the whole repository — so `parse/`, `formula/`, Table, the layout editor, the sheet view and the harness stub stop compiling at the same instant. Every boundary in the list was tried at the land stop and each left the tree red: the parse commit pulled in the formula layer, the formula commit pulled in Table and the view, and Table pulled in the editor, because `config-panel.ts` imports the Modifiers field and `list-fields.ts` imports a column-type constant this feature deletes. Splitting further would have needed hunk surgery on a 1657-line test diff, and a commit that does not build is worse than a coarse boundary. What *did* separate cleanly is everything the type checker never sees: the harness's calibration, its views, and the documentation. **The wave-4 work landed in commits of its own for a different reason** — it has not been through the review axes, and the log is the only durable record of which work has. |
| The panel "caps its height in `em`", and the rule said 34em was "about 500px at the app's default UI font" | **A measured 500px**, and the measurement is now named and repeatable | **The `em` did not mean what the sentence beside it meant.** `.sheetsmith-panel` sets its own `font-size: var(--font-ui-small)`, and `em` outside `font-size` resolves against the element's own computed size — so `34em` was 13 x 34 = **442px**. The panel measured 441 and read as a fit by a hair. It was not: every text field in it was 8px short of Obsidian's `--input-height`, because the harness had never carried the app's `input` rule. With the app's own control heights on all six the state the cap was measured against comes to **479px**, so at 442 the promote row and `Add a modifier` scrolled off the end of the surface they belong to. The cap is px now, the number is a measurement of `sheet-modifier-form-light`, and the comment says how to retake it |
| Nothing said what weight a rule in the anchored panel has to carry, and `styles.test.ts` reasoned from "(0,0,1) of a bare element rule" | Every rule whose subject is a control in the panel carries `.sheetsmith-panel` in front of it, at **(0,2,0)**, and there is a check for it | **The wrong number, two documents from the right one.** `docs/UI.md` §2 opens by saying Obsidian styles `input[type='text']` at **(0,1,1)**; `button:not(.clickable-icon)` is (0,1,1) too, because a `:not()` argument counts. Only `select` is (0,0,1). So the panel's single-class rules beat the app on its selects and lost to it on its inputs and its buttons: the list lines kept Obsidian's button fill and shadow, were clamped to `height: var(--input-height)` with their reason lines struck through the line below, could not wrap, and the arming tint on **Remove** was discarded — a destructive gesture whose first press changed nothing a reader could see. Nothing failed and nothing could: the panel is outside `.sheetsmith-view`, so §2's own check exempted it, and the exemption's replacement claim was about a class being present rather than about weight |
| The read-only fields were `opacity: 0.75` and nothing else | A printed summary: no border, no fill, no chevron, value at the label's left edge, and a blank field not drawn | `legibility.md` §2 names a fill at a different strength as the thing that **cannot** carry a state, and measured against the panel behind them the enabled and quieted fills were three values apart. Four controls that looked like the fifth, with the only real signal a sentence *underneath* — which a reader reaches after trying to change one. The box coming off is a shape difference, so it holds with no colour at all and survives forced colors |
| The `Modifier` select sat in the six-field label column | Its own full-width row, label above | Resolving each definition into a sentence is the whole reason that control is a picker rather than a list of names, and at 30em minus a 6.5em label column it held about two-thirds of one: `Plate armour · Armour class — sets to 18` photographed cut mid-word under the chevron |
| **Reuse this elsewhere** was offered to the reader of any typed part | Offered once that part has a target and an amount | On the empty-cell path — first use, and the case the design argues hardest for — the panel's last word was `Save to the layout` under a form containing nothing. A part with no amount contributes nothing (§6), so publishing it would append a definition that changes nothing |
| The Modifiers list put an empty `div` where a **Sets** definition's **Bonus type** would be, "so the tracks do not move" | The field is built and hidden, so it reserves the width it stands in for | Half a fix, and the measurement says which half: a bare `.sheetsmith-detail-field` is `flex: 1` where the real field is `-tight`, `flex: 0 0 auto`, sized to the widest type *this layout* declares. The slot took a flexible share instead of the fixed one, and the 31px went back to the line's `2:1:1:1` grow — eight `Adds to` rows byte-identical, and the two `Sets` rows sitting `Changes` 19px wider with `Operator` and `Amount` 19 and 20px right of every other row. The width cannot be written down, so the field is laid out and `visibility: hidden`: same box, out of the tab order and out of the accessibility tree, and the control still *vanishes*, which is what ruled out a disabled one |
| — | The fixture spells one modifier name twice, and four more views photograph the panel | **Not a correction: three things in this feature had never been rendered anywhere but a test.** No sample cell named one modifier twice, so `Already applied above; removing either takes both` and `Remove all 2` — the fix for the only real defect the owner found here — were unlooked-at; the armed **Remove** was unphotographed; and the panel appeared in no narrow, large-text or forced-colors view. `harness/samples.ts` gains the `Warded bracers` row and `harness/shot.mjs` gains five views |
| §6's new rule read as **"byte for byte"** over a whole cell, and as a rule about every write | A part's own text survives an unrelated edit; the *separator spacing* is canonical, and the criterion compares **part by part**. And the rule governs an *unrelated* edit — **Remove takes the whole enrolment** | **One word was wrong and the sentence behind it was wider than the word.** The build reported the first half itself: separator whitespace is no part's text, so `A ;B` edited at `B` comes back `A; B`, and criterion 21 already said "part by part" while the prose said byte for byte. The second half is the one that cost something. "The collapse is a read and never a write" was stated three times, and **Remove sat on neither side of it**: a repeated name is one enrolment, so dropping one of its two byte ranges left the row still applying the modifier — the reader pressed the only control there is, twice, and nothing came off. Reported from the app as "the remove modifier isn't working", with every layer test green. **The two fixes are one decision**: the collapse belongs *out* of an unrelated write and *inside* the gesture whose whole job is to remove, which is `parse/modifier-cell.ts`'s `withoutPart`. |
| Criterion 2 said both unspellable-name cases assert "a row already naming it reads as a stray" | The `;` case does; **the assignment case applies it as a typed effect**, which is why the name is refused rather than merely reported | **False for one of its two cases, and the test's own comment repeated the claim while asserting neither half.** `readsAsAssignment` is true of `armour_class = 18`, so a cell holding it does arithmetic rather than going stray — which is the argument for refusing the name at all: kept, it would be a definition nothing could ever reference sitting beside a cell that quietly applied it. Each parser test now carries its own second half. |
| §1 settled **reference-only**: "there is no per-character tier and none is designed", and "the owner chose reference-only anyway" knowing that "**no tool surveyed shipped reference-only**" | **Two tiers.** The layout names the changes that repeat; a row may type its own effect in its own cell. A cell part is either a name or an assignment | **The largest decision in this table, and it reverses one taken at a hard stop.** The owner, verbatim: *"It continues to be a dropdown. I want to be able to set the row formula, not select an already existing one."* The finding wave 1 recorded and wave 2 overrode is the finding wave 3 follows: CSB shipped template *and* per-instance modifiers and recommends the shared one; Foundry's open epic #4451 proposes a per-item choice **plus a one-way detach-to-instance**; nobody ships reference-only. Wave 2's surface was a good picker and every line in it was a name somebody had already typed in another pane, so the common case — an item this one character just bought — was a layout edit before the row could say anything |
| §2's surface was a **popup managing which named definitions the row enrols in**, built over Obsidian's own `Menu` | **A form**, in which the row's effect is typed and a named one may be picked instead | **A mechanism decision rather than a preference.** `Menu` closes on selection and `MenuItem` takes a title, an icon and a click, so a target select, an operator, an amount, a bonus type and a condition cannot live in one. A `Modal` needs an `App` that `RenderContext` does not carry, and `showPopover` sets `textContent`. So `ui/check-menu.ts` **goes** — not even as the reuse path inside the form, which is one labelled `<select>` and would be two dismissal regimes stacked as a nested `Menu` — and with it the stub's `Menu` and `MenuItem`, `calibrate.mjs`' `.menu` entry and `theme.css`'s fallback. **Nothing is committed, so none of it appears in the history**, which is the working-order rule paying for itself twice in one feature |
| §6: "**A modifier cell holds the names of the modifiers the row applies**, separated by `;`" | A cell holds parts separated by `;`, each either a definition's name **or** `<target> += <expr>` / `<target> = <expr>`, with optional ` as <type>` and ` when <cond>` clauses | **The load-bearing half of the reversal, and the one that reaches the note's bytes.** The discriminator is the assignment itself, not a sigil and not "anything with an operator": a sigil would sit in front of an assignment that already says the same thing, and "anything with an operator" loses on the evidence a comma lost on as a separator — *+1 Longsword*, *Ring of Protection +2*, *Bracers of Armor, Greater* are the canonical item names in every system surveyed and half of them carry a `+`. Tightened enough to survive those names, the discriminator *is* one name token then `+=` or `=`. Constraint 3 still holds because `replaceCell` returns a segment untouched when the unescaped trimmed text equals the stored value — **verified against the code, and conditional on the stored value staying the raw cell text**, which it does — and it gains one new rule: **a commit rewrites only the part the reader edited** and re-joins the others byte for byte, without which one edit would canonicalise a cell's other parts |
| — | **§7 is new: the reading of `SPEC` §2 that licenses a typed modifier, with its edge** | **Not a correction: the argument the reversal owes and did not previously need.** §13's own objection to a per-row definition is that it is "structure in character data", and wave 2 answered it by moving the definition out of the note. The reading the owner accepted: structure is what the sheet reads *in order to lay itself out*, and a typed modifier is an expression with a destination — **delete every one of them and the sheet draws exactly the same sheet**, which is the counterfactual test and is checkable rather than rhetorical. Roll20's repeating sections are the precedent, storing a player-typed expression per row in the most used sheet system in the category. **The edge is that nothing in a note is addressable**: structure has a name something else can spell, and a typed effect has none, so the moment a note would hold something another part of the sheet refers to by name the exception has been left behind. That is also what §8 *is* — naming an effect is the act of moving it out of the note |
| — | **§8 is new: promotion appends one definition and converts the part that promoted it** | **Not a correction: the third settled question, and the first sheet-side layout edit in this plugin.** Bounded to appending, so it can orphan nothing: the layout write lands first and the cell is rewritten only on success, four failures each name their fix, and a name the layout already declares is **refused always** rather than reused, because the existing definition may say something different and silently repointing the row would change its arithmetic under a gesture whose promise is that nothing changes. The promoting row **becomes a reference** rather than keeping its formula, on §1's own spine: an inline copy left beside the definition it was lifted from is a cache of what that definition says, which is Sandbox issue #15's shape and the one thing this design forbids absolutely. **Other rows holding identical text are untouched** — that search is the migration §10 declines to perform, needs a vault scan on a button press, and two identical texts are not evidence of one intent. A component still never touches the file: `promote` is reported to the sheet view, exactly as `onChange` is (PATTERNS §5) |
| §5: "**it cannot know what a definition is**", of the component | True of `scopeModifiers`, which pushes a part's raw text; **not true of the component**, which now knows a modifier's *shape* and none of its meaning | **A sentence this wave narrows, and it must not be left standing.** `ModifierPush.definition` becomes `part` — the raw text of one part, so the formula layer decides whether it is a name or an assignment — and that keeps the *push* ignorant. But the form shows and writes a target, an operator, an amount, a bonus type and a condition, so Table knows there are five slots. It still does not resolve one, does not know what a bonus type means arithmetically, and does not know what an operator does: the parse is `parse/`'s, the resolution is `formula/`'s, the labels are the context's. The honest statement is the shape without the meaning |
| Wave 2 removed `targets` and `publishes` from `ModifierContext` and called it "**the model change paying for itself in deleted surface**" | They come back, with `bonusTypes` beside them | **A stated win handed back, and it is the mirror image of the sentence above.** A target can be typed on a row again, so the sheet needs the accepting set to offer, the published set for a label, and the bonus types for a select. Recorded rather than performed quietly, because the deletion was argued as evidence *for* wave 2's model. **One §13 consequence**: the undeclared-`modifierType` entry says the sheet cannot know the declared list because "that check is handed a config and never the layout" — with `bonusTypes` on the context that reason is gone, and the form does show `<type> (not declared)`. The entry is **amended, not resolved**: it is about a column's type and about refusing rather than reporting |
| `SPEC` §5: a bonus type "lives in configuration and never in the expression language… A column rather than a row, decisively because **nothing stored ever names a type** — so a layout edit that drops one cannot orphan character data, and §10 is satisfied by construction rather than by a rule" | A typed part may name one, so §10 needs a rule where it had a construction guarantee: **rendered, not corrected** — the effect applies, contests as its own kind, and the form shows `<type> (not declared)` | **The one rule this wave breaks, and the alternative was measured rather than dismissed.** An **untyped-only** second tier would have kept §5 intact and cost the tier the plugin's headline arithmetic: two rings of protection typed by hand would stack, which is the exact wrongness bonus types exist to prevent. Keeping the type and gaining one §10 rule is the cheaper side — and it is **the one sub-decision here an owner may take the other way**, so §1 states the alternative and it is an open item rather than a closed one |
| "A table with a modifier column on a layout declaring **no definitions at all**" was an error naming the Layout panel, and the sixth error state | **Not an error.** A layout with no named modifiers is an ordinary layout: the editor's report goes, the columns-list note stays, and the form's `Modifier` select simply offers the one option that types a new effect | **A report the third wave retires rather than adds, which is worth naming because this table's rows usually run the other way.** It was true under reference-only — a column with nothing to point at *was* pointless — and it is false the moment a row can type its own effect. The error-state count **stays at six**, which is a coincidence rather than a sign nothing moved — this report is retired and the unfinished typed effect is new — so the count is stated where a reader can check it and the coincidence is named beside it |
| The glyph's `zap-off` had **five** reasons | Six, the sixth being **a typed effect with no amount** | **A count that had to move, and the count is in this table on purpose.** An unfinished effect is settled as changing nothing rather than as an error, because that is what makes the form safe to commit one field at a time — the part exists the moment **Changes** is chosen, and it must not blank a card while the reader is still typing. Two rows of this table already record a count of `zap-off` reasons being one short of its own code, which is why this one is moved deliberately |
| "The popup closes on every change. Two modifiers is two openings, and a swap is two" (Risk 9) | **Gone.** The panel stays open across every commit | **The best thing the reversal buys, and it was wave 2's loudest cost.** It was structural rather than chosen: Obsidian's menu closes on select and the commit re-rendered the row the menu was anchored to. A panel of this plugin's own does not, and the price is what Risk 10 now carries — placement, dismissal, **keyboard navigation, focus management and a phone regime**, four things `Menu` gave free and two of which are owed outright. Six criteria exist for exactly that |
| "`On this row · select to remove`", and position under a heading carrying membership | `On this row`, one list, and **Remove** inside the open form | **A press that opens cannot also delete.** Position carried state because there were two lists; there is one, so the label carries it and the second section's job — offering what the row could apply — is the `Modifier` select inside the form. Removal borrows `.sheetsmith-table-remove-button`'s arm-then-commit, the sheet's own destructive gesture, rather than inventing one. **What survives from the menu round is listed in the Design section as a table**, rather than left for a reviewer to work out |
| Risk 6 said the accepting set's over-report reached one surface, the editor's target picker | It reaches two: the form's **Changes** select is over the same set | **A deferral getting wider rather than a new finding, and it stays open.** A player choosing from the form can aim an effect at a name that ignores it; the row then draws `zap` and changes nothing, and neither the sheet nor the editor can tell, because the target *is* accepting. Unchanged in kind, wider in reach. `docs/UI.md` §12 holds it with the four-line sharper predicate |
| §4's third bullet argued that the flag stays a `toggle` column because "a modifier cell holds *names of modifiers*" and a flag is a different kind of value | It stays a column because a flag has to be **addressable**: many modifiers on one row read it, and a `when` in the layout reads it too | **The same bullet's stated reason spent for the second time, which is why the third version says so.** Its first reason — "a separator is a syntax in a file the user hand-edits" — was spent when wave 2 took a separator, and this table records that. Its replacement, "a cell holds one kind of value", is spent the moment a cell holds expressions as well as names. The conclusion has been right all three times and its reason has now been rebuilt twice, so the third one follows from §7 rather than from what a cell happens to contain: packing a flag into a modifier part would make it reachable only from that part, undrawable as the ring a `toggle` column already gives it, and invisible to the definition that wants to read it |
| §3's "not at selection time" gave two structural reasons: a modal needs an `App`, and `docs/UI.md` §9 "refuses a fourth kind of panel beside a row of cards" | One reason, and it was always the real one: **a message shown once at selection is gone the next time the sheet opens** | **A reason this wave spends by building the thing it said was impossible.** The sheet now has an anchored panel of its own, so a confirmation at the moment of choosing is buildable. It is still not built, and the argument that survives is about transience rather than mechanism — a mark on the row and a line in the breakdown are there every time. Rewritten in place, because an argument whose stated reason has been spent is worse than a wrong conclusion, and this table has now caught that same failure four times |
| The fixture demonstrated the named tier only, and press step 2 was "switch the override off" | The fixture holds a mixed cell, a typed override, an undeclared bonus type, an unfinished effect and a name carrying a `+1`; press step 2 is **typing a number on a row and watching the sheet move** | **The recipe is what the owner presses from, so it is rewritten rather than patched.** Fourteen rows, each for one fact, and the arithmetic is stated in the section so a step cannot contradict it — armour class **22**, `mod.abilities.STR` **+4** — because this table already records one round where the recipe was internally inconsistent and one where its numbers and the fixture's disagreed. Both hand-spelled cells stay, and one of them is now a typed part spelled `armour_class+=2 as item when Worn`, so the tolerant read and the byte-identical round trip cover both tiers in the file rather than only in a test |
| The authoring surface was **one icon column**, so "any number of modifier columns is allowed" and "an item that changes two values is one row with two cells" | **One glyph per row**, standing for every modifier the row applies, with a popup on it; the retired cap is not replaced by a second column but by a cell holding a list | **A decision taken with the owner, and the largest one in this table.** The first answer was built, reviewed on all three axes and remediated — and a table carrying two modifier columns then drew two bolts on a row applying two modifiers, which is `docs/UI.md` §9's two-answers-to-one-question in the smallest space available. One row is one item and an item should read as one mark. The cap this document was pleased to remove turned out to have been holding the surface together by accident, so **the removal is retired**: one modifier column is what a table wants, and a second is reported as redundant rather than refused, because `configError` would take the table and every modifier its rows apply down with it |
| — | **A modifier cell holds several names, separated by `;`, and a definition's name may not contain one** | **The file-format half of the decision above, and §6 is new for it.** A cell must hold several enrolments where it held one, so this is the note's shape rather than a surface, and it is the only part of the second wave that reaches `parse/`. The separator has a trap — a name containing it breaks — and `parse/modifier-definitions.ts` permits any trimmed non-empty string as a name, so **the name is constrained rather than the separator made safe**: there is no character a name cannot hold, since even a pipe survives the table layer's escaping. A `;`-bearing name is reported and dropped, on the parser's own argument for a nameless one — "there is nothing to write in the cell". A comma was measured against and refused: item names carry commas as a matter of course, so the constraint would bite constantly |
| §5 and the Data and file model section both said the note side of Constraint 3 "is not in the diff" | The cell's format **is** in the diff, and the constraint holds because `parse/table.ts` rewrites only the cells whose text actually changed | **True when written and false the moment a cell held a list.** The dodge is no longer available, so the constraint is argued: reading is tolerant (`A ;B`, `A;;B`, `A ; B`), writing is canonical, and neither runs over a cell nobody edited — so there is no normalising pass for byte identity to lose to. Both passages say so now, and the acceptance criteria gained the hand-edited spellings, which the fixture also carries so the property is in a file and not only in a test |
| §4 kept the condition's flag out of the modifier cell because "a second stored fact in the icon column's cell would need a separator, which is a syntax in a file the user hand-edits" | The flag stays a `toggle` column because a boolean and a list of modifier names are different kinds of value, and one cell holding both would give the separator a second meaning | **An argument this document later contradicted by taking a separator.** The conclusion was right and its stated reason had been spent, which is worse than a wrong conclusion: a reader would have found the two passages and been unable to tell which one the build followed. Rewritten in place, and Risk 8 now carries the honest version — the separator *is* a syntax where there was none |
| The control was a `<select>` with the glyph as its face, a press opening the picker and a press-and-hold opening the explanation through `bindLongPress`'s `claimTouchPress` | A `<button>` whose face is the glyph, one gesture, and the popup carrying the explanation. `claimTouchPress` is removed from `ui/popover.ts` | **A simplification the decision made available, taken rather than left.** A native `<select>` is the right control for choosing one thing from a closed list and has no shape for "several of these, and here is what each is doing". With the popup carrying the explanation there is one job and one gesture, so the second gesture and the option added for it both go — and **nothing is committed, so the option never appears in the history**, which is the working-order rule paying for itself. `docs/UI.md` §9's paragraph about the pair was *already* stale against the built code and is rewritten once, in the docs commit, rather than corrected twice |
| A blank modifier cell drew nothing, "and a sheet full of notices about absent things is worse than a quiet one" | A blank cell draws a faint `plus` | **Right for a control that chose, wrong for one that manages.** An empty cell is now the entry point for adding a modifier, and an unmarked entry point is a dead end — `docs/UI.md` §7 refuses a hover-only affordance and a phone has no hover, which is the argument the delete glyph one column over already carries ("always rendered, and faint"). `plus` and not a fainter `zap`, because "none" against "applying" would then be a difference of fill strength alone, which §6 refuses. The sentence about `zap` rather than `plus` on a *filled* cell is unaffected and is kept straight in the body. Risk 11 records the cost and the one contrast question a reviewer may take the other way |
| Three glyph states, with no rule for a row where one modifier applies and another does not | The glyph is about **the row**: `zap` where any applies, `zap-off` where none does, and the count in words | **A state the old three could not describe, which is the decision's most direct consequence.** A fourth shape for "some" was refused: a partial-state glyph is a mark most readers meet once and could not name. What carries the rest is one builder at three depths — `2 applying, 1 changing nothing` in the accessible name, `(changes nothing)` on the `title`'s line, and the reason in the popup — so the three cannot disagree. The accessible name's several-form gives a count and not the names, which is **parity**: the glyph gives a sighted reader no names either |
| The row was "marked inert" through `.sheetsmith-table-inert`, and `docs/UI.md` §9 calls the state "three channels" | The class goes, and the state is two channels: the glyph's shape and the accessible name | **A paint channel that has never painted.** `.sheetsmith-table-inert`'s only declaration on this cell is `color: var(--text-muted)`, which is byte-identical to the base `.sheetsmith-table-modifier-cell` rule it was written to override — so a stray cell and a working one have always been the same colour, and the shape and the name were doing all of the work. Found while settling what one glyph does for several modifiers. The test asserting the class asserts the glyph instead, and §9's sentence becomes two channels with the colour a legibility floor rather than a channel |
| Risk 2 said "the bounded override step widens which names enter the modifier walk" | It is `ModifierContext.outcome` that widens it; the override step widens nothing | **The exact failure this table exists to catch, found once more.** The correction was taken two rounds earlier and recorded four rows above — and Risk 2 still carried the pre-correction sentence, because the round that fixed §5 Plumbing and the finding itself did not look in the risk list. Fixed, and the disclosure gains the second wave's one clause: the popup asks `outcome` for definitions a row does *not* name, but on a **press**, so it can never be the first entry into the walk in a render |
| — | The vault fixture now demonstrates one row changing two different values | **Not a correction: a gap this table recorded for the owner, closed by the second wave.** The previous round recorded that "the vault fixture no longer demonstrates the column-cap removal *working* at all, because the second cell of its only two-cell row is the inert one… the owner cannot see it by pressing, and that is a gap for them rather than a decision taken here." One cell holding a list closes it: the Belt row names `Belt of Giant Strength` and `Bracers of Defence`, moving Strength and armour class from one row under one glyph, and it is the first row of the table. `Bracers of Defence` is the one definition the fixture gains, and `circumstance` stops being the declared-and-unused type — so a fourth, `morale`, is declared to keep that demonstration rather than dropping it |
| The glyph-states table gave four `zap-off` reasons and `src/styles/sheet.css`'s comment on the inert cell gave a *different* four | Five, which is the union: a false condition, no such modifier, an amount that will not resolve, a lost same-type or override contest, and a target reading no modifier | **Two incomplete lists, neither wrong about what it held.** This table omitted the amount that will not resolve; the stylesheet omitted the target reading no modifier, which arrived in the review round that bounded `outcome`. Found while settling what one glyph shows for several modifiers, since the question "what does `zap-off` mean now" made the enumeration load-bearing. Both are the union now, and the count is stated where a reader can check it |
| — | Six error states, not five | **Not a correction, but the count is in this table on purpose.** The previous round recorded four sentences left behind by a change that added a `zap-off` reason, including two counts. The second wave adds the second modifier column as the sixth error state, so the count is moved deliberately and named here, where a reader can check it against the list |
| The fixture recipe made `Cloak of Elvenkind` an **item** bonus, and press steps 1, 3 and 4 read `18 + 1 = 19`, `13 + 1`, and "drops by one" | The Cloak is a **status** bonus; step 1 is `18 + 1 + 1 = 20`, step 3 is `13 + 1 + 1 = 15`, and step 4 drops it to 19 | **The recipe was internally inconsistent and no amount was going to save it.** Two item +1 bonuses at `armour_class` — the Ring's and the Cloak's — are the same type, so typed stacking keeps exactly one of them: step 1's total of `+1` and step 4's "drops by one" cannot both hold, whichever amount either carries. Verified independently by the spec reviewer as real and unavoidable. Step 4 is the step that exists to show a condition working, so the Cloak became the different type. The numbers here were then still the old ones while `src/test/fixtures/modifiers/Ilona.md` and `view/vault-fixture.test.ts` carried the new ones — and this section is what the owner presses from, so the fixture criterion was handing them two wrong values (B5) |
| The Plumbing section put the bounded override step in `buildSheetScope` | `formula/resolve.ts`'s `fieldReaders`, bounded by the slot actually having been read | **The placement was false about its own code.** The name table is one of two callers of that evaluation: a Card draws through `context.resolveField('derived', …, config.id)` and the sheet publishes through `resolve(display.field, …, name)`. An override applied in the thunk alone published 20 for armour class while the card's own face drew 14 — the existing rule that "a name and the cell it came from must not disagree", broken by the design. One site is the only correct number of sites. The bound moved with it and got *tighter*: the slot's own read is this document's own sentence — "an override reaches a target on exactly the same condition an addition does" — made exact, where the static accepting set is deliberately lazy-proof and so wider |
| The cycle-guard finding says the widening comes from the override step | The override step widens nothing; the widening is `ModifierContext.outcome` | **A correction to the finding rather than to the design, and it was reported the wrong way twice.** The build session first concluded the feature widened nothing at all, having checked the override step and generalised from it; review then found the entry the finding never described. `outcome` is asked by a modifier cell for every filled cell it draws, and running at render in grid order it can be the *first* entry into the walk in a render — so this document's "reachable from more places and, in a render, sometimes earlier" is true of the build, by another route. It is now bounded by the accepting set, which is the bound this document named, and `/land-it` should write the §13 amendment against `outcome` and not against the override (B1) |
| Risk 6 said the editor's per-definition report was "the only surface left" for a definition aimed at a value that reads no modifier | The row says it too, for a target **outside** the accepting set — and Risk 6's own case, a target *inside* it, is still uncovered on both surfaces | **A decision taken during review, and this row overclaimed which half of Risk 6 it answered.** Ungated, `outcome` drew `zap` on a cell whose target reads no modifier — claiming an effect, because the reduction at that name has no line to suppress and nothing downstream could tell. Bounding it on the accepting set for B1's sake made the honest answer free, and it restores what the previous feature's design wave had specifically fixed: a row that changes nothing must not be indistinguishable from one that does (`docs/UI.md` §6). **But Risk 6 is about the accepting set *over-reporting*** — a target inside the set whose own formula reads no slot, such as a column total beside a computed column — and for that case nothing changed: `outcome` still enters the walk, finds no contest, and draws `zap`. `parseModifierDefinitions` reports no problem for it either, because the target *is* accepting. Risk 6 now says which half is which, and `docs/UI.md` §12 holds the uncovered one |
| — | The total line of a breakdown prints the number its caller drew | **Not a correction to this document, which never said where that number came from.** `components/modifier-breakdown.ts` recomputed `override + total` under the accepting set while `resolve.ts` applied it under the slot's own read, and the two printed `Total 19` over the number 10. A wrong delta was an unexplained delta; a wrong *value* is a false statement about the number under the cursor (B3) |
| §3 said the losing row's popover "says which row won", and that a tie sends the losing row to `zap-off` | The row says why in the breakdown's own words; a tie applies on both rows and only the sum attributes it | **Two sentences of §3 that the Design section already contradicted, and only the Design section's is reachable.** Naming the row that won needs a row index to leave the component, which §4.2 refuses, so `suppressionOf` answers by *value* — which makes a tie symmetric: deleting either row changes nothing, so both say they are changing the value while the breakdown still credits one line, because a sum must. The residue is recorded in §3 rather than left to be found: the sheet says two things about one fact, and they are true of different questions (B1's batch, B5's) |
| The `ModifierOutcome` block gave `amount: number \| null`, "null where it is not applying" | `amount` is present on a row that is not applying; `applies` and `condition` are members | **The block contradicted this document's own cell text.** `Strength — item +1` over `Not applied: a larger item bonus applies` is an amount on a non-applying row, and the popover for a *stowed* item wants the same thing — what the row would do is the question a reader looking at it is asking. Once the amount is populated while inactive, "is this row changing the value" is no longer derivable from the other members, which is what earns `applies` its place rather than a derivation |
| Criterion 1 said a layout declaring `modifiers` "round-trips byte-identically" | The round trip proves key order and a promoted key; byte identity is named against the fixture's test | **Neither half was true where it was claimed.** A layout file carries no byte-identical promise — only a character note does — and `serialiseLayout` pretty-prints, so the property cannot hold over a compact source: measured false. `parse/layout.test.ts`'s case was also *named* for byte identity while asserting structural equality, so it has been renamed for what it proves and now measures the negative too. Byte identity over a layout carrying `modifiers` is `view/vault-fixture.test.ts`'s, where the file is already in the serialiser's formatting |
| Criterion 2 put all ten reported problems in `parse/modifier-definitions.test.ts` | Nine there; the undeclared bonus type in `parse/modifier-types.test.ts` | The Design bullet describing that problem named `parse/modifier-types.ts` as its home in the same sentence that listed it under the definitions list, so the criterion and the bullet disagreed. It stays where the vocabulary is kept and where the fix is — and the fact reaches the definition anyway, through its **Bonus type** select carrying `<type> (not declared)` |
| — | Two rows enrol in `Cloak of Elvenkind`, one worn and one not | **Not a correction: this document asked for exactly that** — "one row on and one off" — and only the on side was in the file, so the code was short of the spec rather than the spec wrong. It was filed as a correction and has been moved here, because a row in this table is a claim that a *sentence* was false. **A criterion met by a string replace in a test is a criterion the owner cannot see:** the off side was manufactured at the press step rather than shipped, so the reader had to press for a state the fixture is supposed to *show* — and the pair is the plainest statement the model has: one definition, two rows, two answers |
| The `parse/modifier-definitions.ts` bullet said the module was "`parse/modifier-types.ts`'s exact shape" | It is that shape plus one **required** argument, the accepting-set sources, and the bullet now argues why | **A sentence about its own code that the build had to break, and the table did not record it.** The bonus types parser takes the layout alone; two of this one's problems are about a *target*, and whether a name is published — and whether its own formula reads a slot — is a question about the components' definitions in the registry, which Constraint 5 forbids a pure module from reaching. So the sources arrive as an argument, and **not an optional one**: with none, both name sets are empty and every definition with a target earns "this layout publishes no value under it", including every correct one. The bullet gained that paragraph in the build and this row is the entry it should have had, since "exact shape" is exactly the kind of claim this section exists to catch |
| Press step 2 said pointing the Plate armour row at `—` returns armour class to `10 + Dex + 1` and loses two breakdown lines | Step 2 clears **both** override rows and returns it to `10 + Dex + 1 + 1 = 14`; clearing Plate armour alone is step 3, and gives 15 | **False about its own arithmetic, and the owner presses these steps in a real vault.** Mage armour carries no `when`, so it simply takes over at 13 — armour class is 15, not the formula, and the breakdown loses one line rather than two. The `+ 1` also omitted the Cloak's status +1. Half of this was pre-existing and half was the fixture correction in the first row of this table not propagating. `view/vault-fixture.test.ts` held the same contradiction inside one test — *named* for step 2's fact, asserting step 3's, with a comment six lines down explaining why Mage armour had won — and is now two tests, each named for what it asserts |
| The glyph-states table gave three `zap-off` reasons, "**Error states.** Four" gave four, press step 7 and fixture item 4 said the Cloak of Elvenkind row "changes two values" | Four reasons and five error states, the fifth being a target whose own formula reads no modifier; step 7 and item 4 say the row fills two cells and moves one number | **Four sentences that did not follow a change made two rows above in this table.** Bounding `outcome` on the accepting set added a `zap-off` reason and a sheet-side message, and the two counts, the risk and the two prose descriptions were all left at the old shape — with fixture item 4 contradicting item 7 of the same note, one saying the row changes two values and the other saying that cell draws `zap-off`. **What is now recorded rather than fixed:** the vault fixture no longer demonstrates the column-cap removal *working* at all, because the second cell of its only two-cell row is the inert one. The criterion about a cell's several enrolments holds the working pair in `table.test.ts` and the harness's Belt row draws it, so nothing is unverified — but the owner cannot see it by pressing, and that is a gap for them rather than a decision taken here. **Closed by the second wave**, in the fixture row above: one cell holding a list puts two applying modifiers on one row, and the owner can see it by pressing |
| The sheet's message for a target that reads no modifier quoted a formula identifier and a formula fragment at a player | `Passive perception — item +2` over "does not take modifiers, so nothing changes. Its own formula has to ask for them, which is a layout edit." | **A sentence written for the wrong reader.** `targetLabel` fell back to the bare name for a non-accepting target *by construction* — it was taken from the accepting map, which by definition has no entry for this case — so a popover a player opens on their own inventory row read `passive_perception`, and the fix it named, `add "+ mod.self" to that value's own formula`, is a layout edit they may not own. `publishedTargets` now carries a label for every published name, so the label exists wherever the value does. **The split, not a softening:** the sheet says *what* and *whose job*, in the words it already uses for that value; the literal `+ mod.self` stays in `parseModifierDefinitions`' report, drawn beside the picker that chose the target, where the person who can act on it is standing and where a raw name is the right vocabulary. The stray-reference message already has this shape, telling the reader to choose another and the author to add one |
| — | The press-and-hold on a modifier cell goes through `bindLongPress` | **Not a correction either**: this document asked only that "press opens the picker and long press explains, so the two gestures do not collide". It was built as a hand-rolled copy of the helper, re-spelling four of its five pieces and driving neither of the two that were its reason. The helper now takes a `claimTouchPress` callback, which is the whole of what a `<select>` needs that a level ring does not (B6). **Retired by the second wave**, five rows up: with the popup carrying the explanation there is one gesture and no `<select>`, so the option goes — and since nothing is committed it never appears in the history at all |

Two things about this document that review confirmed rather than corrected, recorded
so they are not re-litigated:

- **The override-before-additions ordering is buildable as written.** It needed no
  revisiting, and the arithmetic falls out of two reductions of one walk exactly as §3
  argues. §3 is the one settled section the third wave leaves untouched. **This bullet
  also said the storage model needed no revisiting, and that half has now been spent
  twice**: review did not revisit it, and the owner has, in both directions — wave 2
  made a cell hold a list, wave 3 made a part hold an expression. Kept rather than
  deleted, because what review confirmed is still what review confirmed.
- **Risk 1 stands as accepted.** A formula using `mod.self` as anything but a plain
  addend gets different arithmetic under an override; the canonical spelling is
  `+ mod.self` everywhere in this document and in both fixtures.

One gap left open with the owner's agreement, so it does not return as a surprise: a
breakdown is offered wherever `acceptingTargets` says a name takes a modifier, and
that set is two rules ORed together — the component's own formula mentions `mod.self`,
**or** any formula anywhere mentions `mod.<name>` — while only the first can move a
value. So a *listed contributor with no effect* is still reachable, even though the
value no longer lies. The sharper predicate exists and is four lines; `docs/UI.md` §12
holds it, because changing it changes which cards draw a mark at all.

**The deferrals this wave does not touch**, listed so none of them is quietly lost in
a revision that rewrites half the document. Each is live, each is unchanged unless
this list says otherwise, and each is somebody's open item rather than this feature's:

- **A breakdown lists contributors that did not move the number**, above, and
  `docs/UI.md` §12 holds it with the four-line sharper predicate.
- **The accepting set over-reports *inside* itself** — a target within the accepting
  set whose own formula reads no slot, such as a column total beside a computed column,
  where `outcome` enters the walk, finds no contest and draws `zap`. **Wider than it
  was**, since the form's **Changes** select is now over the same set: Risk 6 has the
  half that changed and this is the half that did not.
- **`ModifierContext.outcome` is the widening entry into the modifier walk**, bounded
  by the accepting set and reachable at render in grid order. The live disclosure is
  under Interaction with the two cycle guards, in full, and it is not closed. Wave 3
  changes its wording and not its substance: a cell's parts ask once each and the form
  asks on a **press**, which happens after a render has finished.
- **The `Item` column truncation is `docs/UI.md` §12's loudest instance**, and the
  answer is a distribution rule for a table with more room than columns. One glyph
  column rather than two changes which columns compete for the slack and changes
  nothing about the rule that is missing, so the row stays exactly as written.
- **Obsidian's dropdown chevron is invisible in forced colors**, so every `<select>` in
  the editor pane loses its affordance there — including the **Bonus type** and
  **Changes** selects this feature added, with three measured dead ends behind the row.
  **And now the form's four selects on the sheet join that set**, where wave 2's
  modifier cell had left it by becoming a button. The decision the row waits on is
  still one call for all of them, and it is now ten controls rather than six.
- **`--text-error` is 4.20:1 in the light theme**, on every `.sheetsmith-error` and
  `.sheetsmith-field-problem` — and so on the form's own problem line and on §8's
  promotion refusals. A host pair the plugin does not own; the fix, if it is taken, is
  a companion channel rather than a different red.
- **A list entry labels `Name` once in a header where five detail labels repeat per
  entry**, which is the shared geometry of all four editor lists rather than a
  Modifiers defect, so closing it is a pane-wide change to the labelling model.
- **Nothing below a 500px viewport has ever been photographed**, so the panel's phone
  regime is read rather than seen, exactly as the breakdown bubble's was — and the
  panel owes more there than a bubble did, since `Menu`'s phone regime was one of the
  four things it gave free.
- **`.sheetsmith-list-scroll`'s `20em` cap** still carries no comment saying what it
  was chosen against. Partly answered by deletion; neither the definitions list nor the
  sheet's form goes inside it.
- **`editor/function-library-field.ts` is `PATTERNS` §11's one remaining violation** of
  the rule settled in this feature's pass: a module in `editor/` with its own entry
  point and its own reportable output earns a test file. Waiting on
  `function-library-field.test.ts`, which is a diff of its own and no longer a
  decision.
- **Migrating a renamed definition into character notes** stays an open item, and wave
  3 makes it no easier: a cell holds parts, so a migration would have to rewrite one
  part of one cell in an unknown number of notes.
