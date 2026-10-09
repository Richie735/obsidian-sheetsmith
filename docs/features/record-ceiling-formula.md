# A record's ceiling may be a formula

Status: shipped
Board card: A Record set's number field takes a formula as its ceiling. A field whose
ceiling is the record's own (`maxSource: 'record'`) can hold `prof` there instead of
only a typed number, so a feature with "proficiency bonus uses per Long Rest" stops
needing a hand edit on every record each time the bonus changes.

## Model question

**Settled with the owner before this document existed. It is written down here, not
asked again.** The question was where a ceiling that comes from a formula lives, on a
component whose `number` field already lets each record hold its own ceiling
(`docs/features/per-record-ceiling.md`).

### The answer (C)

> "The ceiling slot holds a number or an expression, resolved in that record's scope.
> No field-level formula and no override rule. A typed number stays valid and reads
> as before, so nothing migrates."

So a fence entry may read any of:

```
Uses: 1 / prof
Uses: 0 / abilities.WIS
Uses: 2 / 3
Uses: 2
```

Each record has one ceiling, and it is a number, an expression, or nothing. There is
no field-level formula, no default, and no precedence rule. (The owner's examples
were `pb` and `wis_mod`. The 5e starter spells them `prof`, a function-library
constant, and `abilities.WIS`, a Card set entry, so the examples here use those.)

### Why C, and what was rejected

The case that settles it is the 5e starter itself. `src/starters/5e.json`'s
`features` Record set has one `Uses` field with `maxSource: 'record'` for **every**
feature on the sheet. That one list needs four different ceilings side by side:

- Second Wind: a typed `1`.
- Spellfire Flame: `prof`.
- Bardic Inspiration: `abilities.CHA`.
- Darkvision: no ceiling at all, because it is not a counter.

- **(A) A third `maxSource: 'formula'` with a field-level `max` expression, exclusive
  with the record's own. Rejected.** One field formula applies to every record on the
  list. Passive traits would become `prof` counters too, and no single record could
  say `abilities.CHA`. The author would need one Record set per kind of ceiling, which
  splits one Features list into several.
- **(B) A field formula as the default, overridden by a record's typed ceiling.
  Rejected** for the same reason. It also needs new note syntax for "this record has
  no ceiling" when the field has a default, and a precedence rule a hand-editor has
  to learn.

C needs no new key, no new syntax and no new mode. The ceiling half of `Uses: 2 / 3`
already exists, so this feature only widens what that half may hold.

### What it overturns

§13's resolved entry **"Where a `number` field's ceiling comes from on a Record
set"** lists two items under **What stays closed** that this reopens:

- **"a per-record ceiling that comes from a formula"**
- **"arithmetic in the ceiling field"**

**The reason for overturning both:** one list needs `prof`, a typed number,
`abilities.CHA` and no ceiling side by side, and a field-level `max` cannot express
that.

The closure's own reason was "resolving `max` in the record's scope inside
`applyReset` is a second failure path on a control that already has one". It is
answered, not ignored. **Data and file model** says why one record's failure here
skips that record instead of failing the reset.

The arithmetic closure was about *settling*. Pool's `31+7` is a commit rule that
turns the draft into 38, and putting that rule beside a value field without it would
give one line two commit rules. An expression ceiling settles nothing. `prof + 1` is
stored exactly as typed and evaluated on every read, which is the same commit rule
the value field has: store what was typed. Pool-style settling stays out (see
**Deliberately not doing**).

A §13 entry recording the question and this agreed answer is added to
`docs/SPEC.md` with this spec, marked agreed and to be built. `/land-it` turns it into
a `Resolved:` entry and strikes the two closures above.

### Can the contract express it?

**No. The contract has to grow, and this is a decision.**

`FieldResolver` evaluates a *config path* (`fields.3.visibleWhen`, `reset.0.to`).
`formula/resolve.ts`'s `fieldReaders` reads the expression text out of the config
with `readPath`. A ceiling's text is in the **note**, so no config path names it.
Three ways round that were considered:

- **Declare a fake formula field, such as `records.*.ceiling`. Refused.** The resolver
  would look in the config and find nothing. `formula-field-coverage.test.ts` would
  then demand an editor control for a path the layout can never hold.
- **Let the component evaluate the text itself. Refused.** It can import
  `formula/expression.ts`, which is pure, but it cannot reach the sheet's name table,
  function library or modifier slots. Those belong to the host's `FormulaEnv`.
- **Chosen: two optional members carrying an expression the component holds,
  evaluated against the sheet the host already built.**
  - `RenderContext` gains `resolveExpression?(text, scope)` and
    `explainExpression?(text, scope)`.
  - `ResetContext` gains `resolveExpression?(text, scope)`.
  - Their signatures are `FieldResolver`'s and `FieldExplainer`'s, with the
    expression in place of the path. They publish no name, so `mod.self` is 0 on
    `fieldReaders`' existing rule.
  - They are built from `fieldReaders`' own `read` with the text supplied, in
    `formula/resolve.ts`. **One evaluator, not a second.**
  - `formulaContext` supplies them to all four render hosts (the sheet, the canvas,
    the picker preview, the harness), and `bindingContext` supplies the reset one.
    So no host spells them by hand.

**Why optional, against the rule that a silent default is worse than none.** Being
absent is loud here, not silent. A host with no evaluator makes every
*expression* ceiling draw `?` with the line under it saying it could not be worked
out. A typed number never reaches the evaluator at all (below). That is the
`link`/`explainField` terms: absent means "no sheet to ask", and the component says
so instead of guessing. Making the members required would mean editing about 80
hand-built test contexts.

**Optional in the type, required of every production builder, and a test holds
that** (an owner amendment). If a production host dropped a member, every expression
ceiling would show `?` and only a reader would notice. So
`src/expression-context-coverage.test.ts` drives each production builder through its
real entry point with a probe component that records the context it is handed:

- `RenderContext`: the sheet view's render, the layout editor's canvas, and the
  component picker's preview;
- `ResetContext`: `planTrigger` in `view/reset-plan.ts`, through `bindingContext`.

It asserts that `resolveExpression` and `explainExpression` (render) and
`resolveExpression` (reset) are functions, and that each one evaluates `1 + 1` to
`2`. A host that builds its context without `formulaContext` or `bindingContext`
fails here. It is a file of its own at `src/`, on `formula-field-coverage.test.ts`'s
argument: it guards hosts in several folders and belongs to none of them. The
harness is a dev tool and is not a production host, but it goes through
`formulaContext` too.

### What it publishes

**Nothing new.** `scopeRows` keeps seeing the value half and never the ceiling, so
`sum(features, Uses)` is unchanged. There is still no row-scope name for the ceiling.

### What it stores and the round trip

The same entry, with the ceiling half holding the expression text as typed:

- **`parse/bounded-entry.ts` is unchanged.** Its split is lazy on the value half, so
  `Uses: 1 / level / 2` already reads as the value `1` and the ceiling `level / 2`.
  A slash inside an expression is division, and it lands on the side of the
  separator that can hold it.
- **`RecordEntry.fields` still holds the note's own bytes**, so Constraint 3 holds
  by construction for an untouched entry, exactly as it does today.

### Existing notes and Constraint 4

Nothing is written and nothing migrates:

- A typed numeric ceiling takes the code path it takes today (**Design**, "A typed
  number reads exactly as before").
- A ceiling that is not a number changes what it reads as, not what is stored. See
  question 2.

### The three questions the owner asked be answered before approval

#### 1. Renames

**What happens today.** No rename anywhere rewrites an expression, except a paste:

- §10's migration (`component-rename-migration.ts`) moves a **section label** and a
  **declared entry key**: the `## ` heading and the fence's `key:`. It never touches
  a formula.
- A component's `id` cannot be edited in the pane at all. `uniqueId` derives it once,
  at creation, and the form shows it as a copyable chip. It changes only by
  hand-editing the layout file.
- Changing a published name the pane *does* edit leaves every **layout** formula that
  reads it broken, and nothing rewrites them:
  - a Card set entry key (`abilities.WIS`);
  - a Track or Table row key;
  - a function-library line (`prof = …`).
- `formula/rename-names.ts` can rewrite names safely, on the tokenizer's own spans,
  but its only caller is `editor/paste.ts`.
- **A note already holds published names in its data, and no rename rewrites
  them.** A typed modifier cell stores `armour_class += 2 as item when Attuned`: a
  target, an amount and a condition, all names. So `Uses: 1 / prof` is the second
  case of an existing pattern, not the first.

**One premise to correct.** §13's rename entry excludes the `id` from §10's promise
because it "is never written into a note at all". That has not been true since typed
modifiers. This feature makes it false a second time. At landing, that sentence is
amended to say a note may *read* a name inside an expression, and that §10's
promise still covers only the names that *address* stored data.

**Option 1: migrate.** A rename of `prof` rewrites `/ prof` in every note on the
layout. Its costs:

- **Hooks at every site that changes a published name**: the function-library
  field, and the Card set, Track, Table and Roster key edits. The `id` itself has no
  commit site to hook, since it changes only by hand.
- **A vault scan that reads every Record set's per-record fences.** That is Record
  set's own storage format. Either the migration learns it, which breaks "nothing
  outside a component knows it exists", or the contract grows a
  `renameInData(data, from, to)` member that one component implements.
- **Notes and layout end up disagreeing.** The layout's own formulas reading `prof`
  are not rewritten by any of these renames today. Migrating the notes alone leaves
  every note right and every layout formula broken. That is the disagreement
  `docs/features/level-list-reorder-report.md` refused, the other way round.
- **Typed modifier cells would be the obvious next ask**, and they are prose-like
  cell text, which §10's modifier bullet declines as an unbounded search.

**Option 2: report in the layout editor, as the level reorder does.** A `Notice` at
the commit that changed the name. Its costs:

- **The same hook sites**, and still nothing for an `id` change.
- **A count of the affected notes needs field-level reading**: which notes' ceilings
  name the old name. The level-reorder spec refused exactly that, because it is the
  storage objection again: "count sections, never fields".
- **A section-level count is noise.** It would fire on *every* published-name rename
  on a layout with any `maxSource: 'record'` field, whether or not one note reads
  the name.
- **The reorder report exists because a reorder fails silently.** A stored level
  silently means something else, and nothing on any sheet says so. A renamed
  ceiling name fails **loudly**. That is the difference between the two cases.

**Option 3: report on the sheet, which §5 already requires.** A ceiling that reads a
name the sheet no longer publishes is an unknown name. The record draws `?` in the
slot and the explainer's sentence on a line under it (**Design**, error state).
`full` skips that record and the note keeps its bytes. Its costs:

- **Nothing new to build.** It is this feature's own error state.
- **The author learns of it only when someone opens a sheet**, not at the commit.
- **One silent case exists:** a rename followed by a *new* component taking the old
  name. The ceiling then reads the new thing. Every layout formula and typed
  modifier has the same exposure today.

**Decided with the owner: Option 3. Report, never migrate, and the report is the
record's own error line.** It is the level-reorder ruling's first reason applied
here: an expression is not something the plugin rewrites in step with the layout.
Option 2 is dropped from this feature. It stays under **Deliberately not doing**
with its cost.

#### 2. Existing notes whose ceiling half is not a number

**What was searched**, for any `number` entry whose ceiling half is not a number:

- all of `src/test/fixtures/` (records, modifiers, tracks; `.md` and `.sheetsmith`);
- `src/starters/5e.json`, `pf2e.json` and `forged-in-the-dark.json`;
- `harness/samples.ts`;
- `src/components/record-set.test.ts`, `src/parse/bounded-entry.test.ts` and
  `src/view/vault-fixture.test.ts`;
- the throwaway vault, `~/Developer/sheetsmith-test-vault`, every note outside
  `.obsidian`.

**What was found:**

| Where | Entry | Field mode | Under C |
| --- | --- | --- | --- |
| `src/test/fixtures/records/Records.md`, "Fey Ancestry" (and the vault's copy, `Characters/Records.md:163`) | `Uses: 2 / lots` | `'record'` | `lots` is an unknown name. The error line is drawn, `full` skips the record, and the bytes are unchanged. |
| `src/view/vault-fixture.test.ts:1560` | asserts the fixture's bytes `2 / lots` | — | Still passes: the bytes do not change. Its comment ("a ceiling that is not one") is reworded. |
| `src/components/record-set.test.ts:365` | `Uses: 2 / lots` in the round-trip table | — | Unaffected: round-tripping bytes means nothing about evaluating them. |
| `src/components/record-set.test.ts` ~1436–1475 | `Uses: 2 / lots`. The test asserts no clamp, `40 / lots` written, and the announcement `C Uses 40` | `'record'` | **Changes on purpose.** The clamp, the write and the announcement are unchanged, but the record now also draws the error line. The test gains that assertion and keeps the "agrees with the clamp" half. |
| `src/parse/bounded-entry.test.ts:52` | `2 / lots` | — | Unaffected: the parse module gives no meaning to either half. |
| The vault's `Characters/Garrick.md:4, 26` | `class: Fighter 3 / Wizard 3` | not a Record set `number` field | Unaffected: no split is applied. |

**Not found anywhere:**

- **No starter holds character data**, so no starter holds a ceiling. 5e's
  `features` and `companions`, and pf2e's fields, declare `maxSource` and no values.
- `src/test/fixtures/tracks/Tracks.md` holds `d6: 1 / 4` and similar entries. Those
  are **Track**'s own `maxSource: 'character'`, which is out of scope and untouched.
- The harness's `traits` subject holds numeric ceilings only: `5 / 3`, `1/2`,
  `3 / 3` and the rest.

**What an existing note with prose after the slash does now.** Only where the field
is `maxSource: 'record'`:

- `2 / lots` and `2 / day` are unknown names.
- `2 / once per day` and `2 / 3 per rest` do not parse.

In every case the record draws the parser's or the explainer's sentence under it, the
slot shows `?`, the value is not clamped, `full` and `formula` skip that field on
that record, and **no byte is written**. Under `maxSource: 'field'`, or with no
`maxSource`, the ceiling half is carried and never evaluated, exactly as today.

**No guard, and that is the decision.** The tempting guard is "a ceiling that will
not parse is text and means no ceiling", which is today's rule. It would make a
mistyped expression (`prfo`, `prof +`) silently uncapped. That is the silent default
§5 forbids and the failure Q3's skip has to be able to see. The two cannot be told
apart: `lots` is a perfectly good name, as far as the parser knows.

What the change costs is a visible line on a record that used to be quiet, and only
where someone typed words into a field documented as a maximum. The fix is in the
line: clear it, or type a number. The only known instance is a deliberate fixture.

#### 3. What `full` does when one record's ceiling will not evaluate

**The owner's default, adopted: skip that record's field, draw its error inline, and
refill the rest.** The component's `ResetResult` is `ok: true`. One bad ceiling never
fails the reset.

- **Per (record, field), as the existing no-ceiling skip is.** A `toggle` on that
  record still resets. A second `number` field on it whose ceiling is fine is still
  refilled.
- **`formula` skips the same field too.** It holds its amount to the record's
  ceiling, and with a ceiling it cannot work out it cannot hold to anything. Writing
  the amount unclamped could put a counter above a ceiling the reader meant, so the
  field is skipped. `empty` is unaffected: it needs no ceiling, which is the existing
  comment's "a list whose ceilings are broken can still be spent".
- **A named-field binding** (`column: 'Uses'`) and **a scoped one** (`where`) follow
  the same rule, on the records they reach. `ResetReach.reached` counts scope, not
  writes, so a skipped record still counts. That is its documented meaning.

**Reconciled with `where` and `to`, which fail closed and whole**
(`docs/features/record-set-reset-scope.md`; SPEC §4.2's reset bullet). The
difference is **who wrote the expression, and how many records it speaks for.**

- **`where` and a named field's `to` are each *one* statement by the *author*,
  applied to every record.** If it cannot be worked out on one record, the author's
  rule is known to be broken for the list.
  - Applying it to the rest would mean writing under a rule that is known to be
    wrong.
  - For `where` it is worse. A record whose condition fails *might be one the author
    excluded*, and SPEC records that "at a rest the worse way to be wrong is writing
    records the author excluded".
  - So the binding writes nothing and names the first record.
- **A ceiling is *one* statement per record, by whoever holds the character.**
  Record A's broken `prfo` says nothing about whether record B's `prof` or typed `3`
  is right. The admission question is not involved: the record was already admitted
  by `where`.
  - Skipping A writes nothing wrong anywhere.
  - Failing the whole list would mean one typo refusing a Long rest for thirty
    spells. That is §6's "refusing the whole rest because one component is
    misconfigured is a worse answer", one level in. It is also the exact argument
    `per-record-ceiling.md` made for skipping a record with no ceiling.
  - This is the no-ceiling skip, extended to "a ceiling that cannot be read".

**§6's "names what it could not": the confirmation and the report say how many were
skipped** (an owner amendment; commit 4). §6 names failures per *component*, through
`ResetResult`. So the skip needs a channel that is not a failure.

**What it costs.** The pieces already exist:

- The confirmation (`view/reset-confirmation.ts`, `resetSummary`) is drawn from the
  planned `ResetResult`s. It already appends a component's own count, `2 of 5`, from
  `result.reach`, which is the same route `where`'s reach takes
  (`docs/features/record-set-reset-scope.md`).
- The report after **Apply** is `plan.failed`, collected in one loop in
  `view/reset-plan.ts` and drawn by `sheet-view.ts`'s `warn`.

So the change is:

- one optional field on the existing result;
- one clause in `resetSummary`;
- one line in the plan's loop;
- a test beside each.

**That fits one small commit.** It is the same shape `reach` was added in, and
`per-record-ceiling.md`'s refusal of a "restored what it could" channel is overturned
by this amendment.

**The channel.** `ResetResult`'s success branch gains `skipped?: string`, which is
**the component's own sentence** about parts the binding reached and did not write,
for a reason the reader can fix:

- **A sentence, not a count**, because the view does not know the component's noun.
  "1 feature" is Record set's word, and `resetSummary` "teaches this file nothing
  about columns or records".
- **Only for a ceiling that will not work out.** A record with *no* ceiling is not a
  counter, and is not counted. Saying "3 features skipped" on every rest because
  three passive traits have no `Uses` would be noise.
- **Absent where nothing was skipped**, so every existing confirmation reads as it
  did.

**The copy**, in sentence case, built by Record set from `recordCount`'s spelling:

- one record: `1 feature skipped, its maximum could not be worked out`
- several: `2 features skipped, their maximums could not be worked out`

"Maximum" and not "ceiling", because the field's own `title` and `aria-label` say
**maximum** and "ceiling" is this repository's word, not the reader's.

**Where it appears:**

- **The confirmation**, after the moving parts and before any refusal:
  - `Features — 1 feature skipped, its maximum could not be worked out`
  - with a `where` reach, `Rest features — 2 of 5, 1 feature skipped, its maximum
    could not be worked out`
  - on a named field, `Features — Uses, 1 feature skipped, …`
- **The report after Apply.** The plan's loop pushes
  `${label} — ${skipped}` into the same list as the failures. So `warn`'s existing
  `<trigger> could not reset:` notice lists it, one per line, and it is raised only
  when something was skipped or failed, as today. The heading is accurate: those
  records did not reset.

The skipped record also still carries its `?` and its line on the sheet, so the
reader can find which one it was.

### A stored value above a lowered ceiling

**`Uses: 3 / prof` with `prof` dropping from 3 to 2 draws `3 / 2` and rewrites
nothing.** That is the standing rule ("render, do not correct"), which
`per-record-ceiling.md` already applies to a typed ceiling lowered under its value.

It meets `track-stored-value-past-shortened-run.md`'s precedent, "no step starts from
a value the reader cannot see", for a structural reason. The value is the number in
the field, always fully on screen, so nothing is hidden past an edge the way a
Track's segments were.

What touches the value afterwards:

- **A step or a typed commit** is held to 2, because the reader can see the 2 they
  are being held to. That is unchanged from a typed ceiling.
- **Blur with no edit** writes nothing (`editable.ts`).
- **A `full` reset** writes 2. That is an explicit write the reader confirmed, which
  is Track's own carve-out: "Resets are explicit writes and are not part of this".
- **`empty`** writes 0.
- **`formula`** holds its amount to 2.

So the only things that move a stored value past a lowered ceiling are a gesture on
that value and a confirmed trigger, which is the precedent's line.

## What it does

A record's ceiling slot, where the field gives each record its own, accepts a
formula as well as a number:

- Type `prof` after the slash on Spellfire Flame and the record reads `Uses 1 / 3`.
  The 3 follows the character's proficiency bonus from then on, and a Long rest
  refills it to whatever the bonus is that day.
- A typed number still works exactly as it did.
- A formula that cannot be worked out shows `?` and says why, on that record alone.

## Smallest version

Commits 1 to 3 below. They cover:

- the evaluation in the record's scope, through every channel;
- the drawn number at rest, with the expression on focus;
- the parser's sentence and the evaluator's sentence under the record;
- the reset skip.

What it gives up:

- **the skipped-record count** in the confirmation and the report (commit 4);
- **name suggestions in the ceiling field** (commit 5). The reader types `prof`
  without a list offering it.

**The owner approved the whole design, commits 1 to 6**, so this section is recorded
and not chosen.

## Design

### At rest: the number, never the text

**The slot draws what the ceiling came to.** A field's text stays in the DOM, but
what the reader sees is a rendered layer over it. That is `docs/UI.md` §9's stacked
arrangement, "Rendered text and the field that edits it are stacked, never swapped",
which the record's name already uses for its wikilinks.

```
▸  Second Wind        Uses 1 / 1
▸  Spellfire Flame    Uses 1 / 3        ← ceiling is `prof`, drawn as 3
▸  Bardic Inspiration Uses 0 / 4        ← ceiling is `abilities.CHA`
▸  Darkvision         Uses   / —
▸  Dragon's Breath    Uses 2 / ?        ← ceiling is `prfo`
   Uses maximum could not be worked out: Unknown name "prfo". Change it after the slash, or clear it.
```

The reason after the colon is always the parser's or the evaluator's own sentence,
unchanged, so a ceiling naming nothing says what a condition naming nothing says.

- **Unfocused**, the layer shows the number in the existing ceiling reading:
  `.sheetsmith-pool-max`, muted, with tabular figures, through `card-face.ts`'s
  `formatDerived`. That is Pool's own formatter for a calculated max, `?` included.
  The field's own text is transparent under the layer.
- **Focused**, the layer goes inert and the field shows the stored text (`prof`).
  The reader edits the expression, not its result.
- **The layer is `pointer-events: none`**, which is the table cell's choice of hit
  testing in that same UI.md row. The ceiling is one short line, so a press lands
  the caret in the field.
- **A typed number gets no layer at all.** It draws the same DOM it draws today:
  `nameField`'s "a name with no link gets the field alone", and UI.md's "a cell with
  nothing to render gets none of it". This is what makes "a typed number reads
  exactly as before" true by construction, not only by care.
- **Forced colors** follows Record set's existing departure for its stacked name
  field: the layer is hidden and the field is shown. `docs/BACKLOG.md`'s row on Table
  doing otherwise is not touched.
- **Width is unchanged at rest**, because the layer shows one or two digits. The
  field's fixed two-digit box (UI.md §9: fixed, not content-sized, so stepping does
  not move the line) is kept. **A long expression scrolls inside the box while it is
  edited**, and the box does not widen on focus, since "neither child changes size
  on focus" is the same row's rule. That is a real cost on
  `max(1, abilities.WIS)`, and it is recorded rather than designed around.

### Evaluation: one function, every channel

**`ceilingOf` keeps its job and gains an outcome.** It becomes
`ceilingOf(text, scope)` and returns one of three things:

- a number;
- `none` (nothing there);
- `{ error }`, carrying the sentence to draw.

It reads the text in this order:

1. **Blank** is `none`, as today.
2. **`Number(trimmed)` is finite**: that number, by the code that runs today.
   **Typed numbers never reach the evaluator.** So `03`, `1.5`, `+3` and `1e3` keep
   reading exactly what they read now, whatever the expression grammar thinks of
   them.
3. **Otherwise**, `expressionProblem(trimmed)` from `formula/expression.ts`, which
   is pure. Any problem is `{ error }` with the parser's sentence.
4. **Otherwise**, `resolveExpression(trimmed, storedLayer(config, record))`.
   - A finite number is that number.
   - `null` is `{ error }` with `explainExpression`'s sentence, or "it did not
     resolve." where there is none. Not "could not be worked out": the reason is
     drawn after `Uses maximum could not be worked out:`, so that phrase would
     appear twice in one line. Where there is no evaluator at all, the reason is
     `there is no sheet here to work "<text>" out against.`
   - Anything else is `{ error }` saying `it came to "x", which is not a number`.
     That is the sentence `to` already uses.

**The scope is the record's stored layer**: its stored fields, then the sheet, never
a computed field. That is the grammar `visibleWhen`, `where` and a named field's `to`
already share, so a ceiling is §5's fourth row-scope formula, and the first held in
the note. A ceiling reading its own field (`Uses: 1 / Uses`) reads the stored value.
It is pointless and harmless, and refused nowhere.

**Held to the field's `min` where one is declared**, for an evaluated ceiling as for
a typed one, because "a ceiling under the floor describes a range no value can
occupy". With no `min`, an evaluated `-1` is used as is: render, do not correct.

**Every channel takes the one answer**, which is the lesson of the "of lots"
defect that `ceilingOf`'s own comment records:

- the drawn number;
- the value's clamp (`valueBounds`, and the `get max()` getter);
- the announcement's "of 3";
- `fieldBounds`, `recordCeiling` and `fieldWrite` in `applyReset`.

While the ceiling is being edited, `ceilingNow()` passes the *draft* text through
the same function, Pool's rule that "what the value is held to is what the reader can
see".

### Typing it

These are the changes to the ceiling input. Everything else on it (`editable.ts`'s
rules, the `—` placeholder, the `min` hold, clearing it to remove the ceiling) is
unchanged.

- **`inputMode` becomes `text`, always.** It was `numeric`, and a phone's numeric
  keypad has no letters, so `prof` could not be typed there. The cost is that a
  reader typing a plain number on a phone now gets the full keyboard.

  **The owner asked for the keypad to stay while the ceiling is a plain number, and
  it cannot, without a new surface.** The proposal was to set `inputMode` from the
  text, `numeric` while it holds digits and `text` once it holds anything else. That
  is a few lines, set on focus from the stored text. It only works in one direction:
  - **An existing expression ceiling**, focused, would get the full keyboard. That
    is right.
  - **An empty or numeric ceiling that should become `prof`** would get the numeric
    keypad, which has no letters on iOS or Android. A non-digit can never be typed,
    so the switch to `text` can never happen from the keypad itself. The only way
    to turn `3` into `prof` on a phone would be markdown view.
  - **"The author asks for an expression"** would need an affordance to ask with: a
    toggle, a glyph or a menu item beside the ceiling. That is a new surface on a
    summary line that UI.md §12 already records as crowded, and the amendment said
    not to add one.

  So the fallback the amendment named is taken: the full keyboard always, and
  nothing new on the line. Desktop is unaffected either way.
- **The slash refusal is lifted on the ceiling and kept on the value.** In
  `refuseNumber`, the value half can still hold no slash, since the split is at the
  first slash. A slash in the ceiling half is division, and it reads back correctly
  (**Model question**, the round trip). The wikilink refusal stays on both inputs,
  for Constraint 2.
- **Arrow keys step a typed number and leave an expression alone.** That is
  `editable.ts`'s existing "genuinely non-numeric text is not a number to step".
- **Nothing settles.** `prof + 1` is stored as typed.
- **A parse problem is stored, not refused.** That is
  `docs/features/formula-field-errors.md`'s rule for the editor ("stores it either
  way"): a draft the reader typed is kept in the note, and the sentence says what is
  wrong. A refusal would keep the draft only until the next render, and the note is
  where the reader's words belong. The commit's own announcement appends the problem:
  `… maximum prof +, which could not be worked out`.
- **`title`** reads `Maximum ${name}, held by this ${noun}.` today. For an expression
  it gains ` Worked out from ${text}.` A typed number's title is unchanged.

### Suggestions (commit 5)

- **`RenderContext.suggestFormula?(input, owner)`**, on the same terms as
  `suggestText` and `suggestFile`:
  - it is optional, so the canvas and the harness pass none;
  - a component cannot import `AbstractInputSuggest`;
  - the caller closes whatever it attaches before the next render.
- **`view/sheet-view.ts` binds `attachFormulaSuggest`** from `editor/formula-suggest.ts`.
  The view already imports from `editor/`. The vocabulary is built once per render,
  the way `layout-editor.ts`'s `vocabulary()` builds it: `vocabularySource` per
  component, plus the layout's functions.
- **`owner` is the Record set's id**, so the record's own stored fields are offered
  first, as on **Only where** and a named field's **Resets to**. Computed fields are
  withheld from the row names on the same `computed` flag those fields use, since the
  ceiling's scope has none.
- **`formula-suggest.ts`'s header** stops saying "in the layout editor pane". Moving
  the file is not proposed: it already has one job, and the folder question is a
  judgement for `/patterns-review`.

### What `formulaFields` and the coverage test mean here

The owner's words were "declared as a formula field per PATTERNS". The honest
reading is that **the declaration cannot apply, and what it protects does.**

**Why it cannot apply.** `formulaFields` is a list of *config paths*, and every
reader of it is a reader of the config:

- the resolver;
- the paste's rewrite;
- the editor's checks;
- `formula-field-coverage.test.ts`.

A ceiling has no config path. Declaring one would be a false statement to all four
readers, and the coverage test would then demand an editor control for a path the
layout never holds.

**What it protects, and how this meets it.** The rule exists so that every
expression is checked and completed where it is typed, and so that a test fails if
one is not. Here:

- **The check** is `expressionProblem` at the ceiling, at render and on commit.
- **The completion** is `suggestFormula`.
- **The test** is a `record-set.test.ts` case per channel, driving the real input:
  - a ceiling that does not parse draws the parser's sentence;
  - the seam is called with the ceiling input and the component's id;
  - a typed number never calls `resolveExpression`.
- **`docs/PATTERNS.md` §8** gains one line beside the formula-field rule. It is
  worded so the exemption is the *location* of the text, which a config key can
  never claim:

  > **An expression stored in a character note, and nowhere in the layout, is not
  > a formula field, because `formulaFields` names layout config paths and no config
  > path holds it** (a record's ceiling, `Uses: 1 / prof`). **Any expression held
  > anywhere in a layout's config, at any depth, is a formula field and is
  > declared** — the exemption is where the text lives, never what it is used
  > for. A note-held expression's input still owes what a declaration buys: the
  > parser's sentence where it is typed, and the suggester. [judgement]
- **`formulaFields` and `formula-field-coverage.test.ts` are unchanged**, and Record
  set's `formulaFields` bullet in SPEC §4.2 says why the ceiling is not on it.

### Empty and error states

- **No ceiling**: `—`, unchanged.
- **An empty list, or a record whose fence will not read**: unchanged. No ceiling is
  drawn or evaluated on an unreadable record.
- **A ceiling that will not parse, names something the sheet does not publish, or
  comes to something that is not a number**:
  - the slot reads `?`, the class Pool's calculated max uses for the same state;
  - a `.sheetsmith-error` line hangs on the record, where a field's refusal already
    hangs. The summary line has nowhere to put a sentence. It is drawn on **every
    render** and not only after a commit, so a hand-edited or renamed ceiling says so
    on first paint;
  - its text is `${field} maximum could not be worked out: ${reason} Change it after
    the slash, or clear it.`
  - two fields failing on one record draw two lines.
  - the line is separate from the refusal line, so a refused link on the value field
    does not clear it.
- **No new configuration error.** Nothing about the layout is wrong when a note's
  ceiling is.

## Config fields

The component's own `configFields` are unchanged in number.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `fields` | `columns` | Fields | **Amended.** The sentence `per-record-ceiling.md` added ("…or to each record, so a reader types it on the sheet…") becomes: "…or to each record, so a reader types it on the sheet beside the value, as a number or a formula such as prof…". |

Per-field keys inside `fields[]`:

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `maxSource` | select, on a `number` field | Maximum from | **Amended.** "…or **each record**, a number or a formula the reader types on the sheet beside the value, worked out from that record's own fields and the sheet. A formula follows the sheet, so a feature with proficiency-bonus uses reads `prof` and refills to whatever the bonus is. A reset set to full restores each record to whichever applies, and leaves alone a record that has set none or whose formula cannot be worked out." |

**Where the `maxSource` sentence lives.** The **Maximum from** select carries no
description of its own: a per-field key inside `fields[]` is drawn by the shared
columns field, which has no description slot per detail control. So the sentence
above is folded into the `fields` description, beside the sentence the row before
amends, rather than given a home that does not exist.

`formulaFields`: unchanged. `palette`: unchanged. `sample`: unchanged, because the
sample's two different ceilings stay numeric. A sample expression would have to name
something every layout publishes, and no such name exists.

## Data and file model

- **Storage:** unchanged. One `###` block per record, and a `number` entry is
  `value / ceiling`, where the ceiling half may now be an expression's text.
- **Round trip:** `parse/bounded-entry.ts` is untouched. An untouched entry's bytes go
  back in unchanged, and a touched one keeps the reader's separator spelling, exactly
  as today.
- **Which entries are evaluated:** only the ceiling half of a `number` field with
  `maxSource: 'record'`. In `'field'` mode the half is carried, never evaluated, as
  today.
- **Existing notes:** no byte changes. A non-numeric ceiling changes from "no
  ceiling" to an error line, as question 2 sets out.
- **Constraints:**
  - **Constraint 2**: the wikilink refusal is kept on both inputs.
  - **Constraint 5**: `formula/resolve.ts` gains its evaluator-from-text with no
    `obsidian` import.
  - **Constraint 1**: nothing is `eval`ed. The text goes through the existing
    `parseExpression`.

**What changes in `docs/SPEC.md` at landing** (`/land-it`'s job; listed so it is
checked):

- **§4.2 Record set, *Sheet view, reset* (line ~517).** "What this does not cover is
  a ceiling that comes from a *formula*, since `max` is a literal on the field — §13."
  is replaced by:
  - a record's own ceiling may be a number or a formula, worked out in that record's
    stored scope;
  - `full` and `formula` skip a field whose ceiling cannot be worked out, as `full`
    skips one with none, while `empty` and the record's toggles still reset;
  - a field's own `max` stays a literal.
- **§4.2 *Sheet view* (line ~511) and *Sheet view, editing* (line ~513).**
  - The editable branch draws what the ceiling came to at rest and the text while
    editing, stacked, with `?` and a line under the record where it cannot be worked
    out.
  - The ceiling field steps only a typed number and takes letters on a phone.
  - The slash refusal applies to the value field only.
- **§4.2 *Data* (line ~509):** "the ceiling it is read against" gains "a number or
  an expression".
- **§4.2 *Formula fields*:** one clause saying the ceiling is not one, and why.
- **§4.1 / `RenderContext`, `ResetContext`:** the two optional members, named in the
  contract's list of what sits outside it.
- **§5:** the row-scope paragraph gains the ceiling as its fourth formula, and the
  first one held in note data.
- **§13**, three changes:
  - the agreed entry added now becomes `Resolved:`;
  - the two closures in "Where a `number` field's ceiling comes from" are struck,
    pointing at it;
  - the rename entry's "an `id` is never written into a note at all" is amended, per
    question 1.
- **§10:** one sentence under the modifier-definition bullet, or beside it: a name
  read inside a note's expression is reported by the sheet and never migrated.

## Acceptance criteria

**Held by tests**:

- [ ] `Uses: 1 / prof` on a `maxSource: 'record'` field, on a sheet where `prof` is
      3, draws `1 / 3`. The value is held to 3, and the announcement says "of 3".
- [ ] A typed numeric ceiling (`2 / 3`, `2/3`, `03`, `1.5`) never calls
      `resolveExpression` and draws exactly today's DOM: one input, no layer.
- [ ] The ceiling is evaluated in the record's stored scope. `Uses: 1 / Bonus` reads
      that record's own `Bonus` field before the sheet, and a computed field is not
      in scope.
- [ ] A ceiling that does not parse (`prof +`), names nothing (`prfo`), or comes to
      something that is not a number draws `?` in the slot and the line under the
      record carrying the parser's or explainer's sentence. This happens on first
      render, with no commit.
- [ ] The same failure on a field whose `maxSource` is absent or `'field'` evaluates
      nothing and draws nothing new.
- [ ] Focusing the ceiling shows the stored text, and blurring shows the number. The
      layer is `pointer-events: none`, and the field is in the tab order in both
      states.
- [ ] A ceiling input accepts `level / 2`, which commits and reads back as the value
      `1` and the ceiling `level / 2`. The value input still refuses a slash, and
      both still refuse a wikilink.
- [ ] The ceiling input's `inputMode` is not `numeric`. Arrow keys step a typed
      number and do nothing to an expression.
- [ ] A ceiling committed as `prof +` is written to the note as typed, and the line
      under the record names the parse problem.
- [ ] `full` on a list where one record's ceiling fails returns `ok: true`. It
      refills every other record's field to its own ceiling, worked out per record,
      leaves the failing field's bytes alone, and still sets that record's toggles.
- [ ] `formula` skips a field whose ceiling fails. `empty` writes `0 / prfo`.
- [ ] A named-field binding and a `where`-scoped binding skip the failing record the
      same way. `reach.reached` still counts it.
- [ ] `Uses: 3 / prof` with `prof` at 2 draws `3 / 2` and writes nothing. A step up
      writes 2, and a `full` writes 2.
- [ ] `sum(features, Uses)` is unchanged by any ceiling, valid or broken.
- [ ] `resolveExpression` / `explainExpression` are supplied by `formulaContext` and
      `bindingContext`, and are driven once through each. A context without them
      draws an expression ceiling as `?` with its line, never as a number or as no
      ceiling.
- [ ] **Every production builder supplies every new member, and a missing one fails
      a test** (`src/expression-context-coverage.test.ts`, commit 1). The sheet
      view's render, the layout editor canvas and the component picker preview each
      hand a probe component a `RenderContext` whose `resolveExpression` and
      `explainExpression` are functions. `planTrigger` hands `applyReset` a
      `ResetContext` whose `resolveExpression` is one. Each evaluates `1 + 1` to `2`.
      Deleting a member from `formulaContext` or `bindingContext`, or building a host
      context without them, turns the file red.
- [ ] **The fixture's `Uses: 2 / lots` fails loudly and keeps its bytes**
      (`src/view/vault-fixture.test.ts`). Read and rendered from
      `src/test/fixtures/records/Records.md`, "Fey Ancestry":
      - the slot draws `?`, not `—`;
      - its line under the record carries the evaluator's own sentence for an
        unknown name, `Unknown name "lots".` — the sentence **Shown when** and
        **Only where** already show, not one written for this feature;
      - a value commit there is not clamped;
      - a Long rest leaves the field alone and the confirmation counts it as skipped;
      - the `Uses` entry's bytes are identical before and after both, while its
        toggles reset as question 3 says a skipped record's do.
      The fixture entry and its vault copy are not edited.
- [ ] The confirmation for a `full` binding on a list with one failing ceiling reads
      `Features — 1 feature skipped, its maximum could not be worked out`, and with
      two, `2 features skipped, their maximums could not be worked out`. With a
      `where` reach it reads `… — 2 of 5, 1 feature skipped, …`
      (`src/view/reset-confirmation.test.ts`).
- [ ] After **Apply**, the same sentence is listed under `<trigger> could not
      reset:`, one per line, beside any failures (`src/view/reset-flow.test.ts`).
- [ ] A record with *no* ceiling is not counted as skipped. A list with nothing
      skipped has no `skipped` on its result, and its confirmation is
      byte-identical to today's.
- [ ] Parse then serialise is byte-identical for `1 / prof`, `1/prof`,
      `0 / max(1, abilities.WIS)` and `1 / level / 2`.
- [ ] Commit 5: `suggestFormula` is called once per ceiling input with the
      component's id, and not on the value input. The sheet view closes what it
      attached before the next render.
- [ ] `git diff --stat` shows no change to `src/parse/bounded-entry.ts`,
      `src/components/typed-value.ts`, `pool.ts`, `track.ts`, `table.ts`,
      `src/formula-field-coverage.test.ts`, or `formulaFields`.
- [ ] `npm test`, `npm run lint` and `npm run build` are green.

**Look criteria**, run `npm run harness` and then `npm run harness:shot`, at 1400px
and 520px, in both themes:

- [ ] On `traits`, a ceiling worked out from an expression is indistinguishable at
      rest from a typed one beside it: same size, same muted colour, same figures.
- [ ] A failing ceiling's `?` and line read as this record's problem. They are not
      a list-level error, and they do not push the summary line's fields.
- [ ] The summary line's field-wrap crowding point (UI.md §12, the 338/346/361px
      rows) does not move, because at rest the slot holds digits.
- [ ] Forced colors: the stacked ceiling shows one layer, not both.

**Vault fixture** (`~/Developer/sheetsmith-test-vault`, with both files also in
`src/test/fixtures/records/` and driven by `src/view/vault-fixture.test.ts`):

- `Record variations.sheetsmith` gains a Card `prof` ("Proficiency bonus", stored
  `value: 2`). It is the one published name the press list can change by hand.
- `Records.md` gains three Features records:
  - one at `Uses: 1 / prof`;
  - one at `Uses: 2 / prof`, so lowering `prof` puts it above its ceiling;
  - one at `Uses: 1 / prfo`.
- "Fey Ancestry" keeps `2 / lots`, now as the existing-note case. Claims 7 and 8 are
  reworded to match.

**The press list:**

1. Set `prof` to 3. The two `prof` records read `/ 3`, and no note line changed.
2. Set `prof` to 1. The second record reads `2 / 1` and its note still says
   `2 / prof`.
3. Press Long rest. Both `prof` records read their ceiling of 1. `prfo` and
   `lots` are untouched and still show their lines, and every other record
   refilled.
4. Type `prof + 1` into a numeric ceiling. The note holds `prof + 1` and the slot
   reads 2.

Aramil and `DnD 5e Caster` are not touched.

The press list passed in the app on 2026-10-08, Obsidian 1.14.4 over the DevTools protocol, on `Characters/Records.md`, whose `prof` card stood at 99 from an earlier press (both records read `/ 99`). At 3 both read `/ 3` and only the card's line changed. At 1 Bardic Inspiration read `2 / 1` with its note still `2 / prof`. **Long rest** confirmed `Features — 2 features skipped, their maximums could not be worked out` and, applied, wrote both `prof` records to 1, left `prfo` and `lots` with their lines and their bytes, refilled the rest, and set the skipped records' toggles. `prof + 1` typed into Second Wind's ceiling was written as typed and read 2. The ceiling's suggestions opened in the app on typing and not on focus, at desktop and at a phone emulation of 390 × 844 (not a device): ` + pr` after `prof` offered `prof`, Proficiency bonus. The vault note was put back afterwards. Method: `record-summary-fields-first.md` § In the app, 2026-10-08.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. `feat: Evaluate an expression a component holds rather than its layout`.
   - `formula/resolve.ts`: the text-supplied evaluator from `fieldReaders`' own
     `read`.
   - `types.ts`: the optional `resolveExpression` / `explainExpression` on
     `RenderContext` and `resolveExpression` on `ResetContext`.
   - `formulaContext` and `bindingContext` supply them.
   - Tests for both builders, and `src/expression-context-coverage.test.ts` over
     every production host.
   - No consumer yet, so it builds and changes no behaviour.
2. `feat: Let a record's ceiling be a formula`. In `record-set.ts`:
   - `ceilingOf` with its three outcomes, threaded through every channel;
   - the stacked layer and its one stylesheet rule;
   - the `?` and the line under the record;
   - `inputMode` on the ceiling (always `text`), and the slash refusal moved to the
     value field only;
   - the `title`;
   - the `lots` test's new assertion;
   - the harness `traits` records, and the vault fixture and its test, including
     the loud `2 / lots` assertion (minus the reset half, which lands in 3 and 4).
3. `feat: Skip a record whose ceiling cannot be worked out at a reset`.
   `applyReset`'s `full` and `formula` read the evaluated ceiling and skip a failing
   field per (record, field), with the named-field and scoped cases.
4. `feat: Say how many records a reset skipped`.
   - `ResetResult`'s success branch gains `skipped?: string` in `types.ts`;
   - Record set fills it from the failing-ceiling count;
   - one clause in `resetSummary`, and one line in `reset-plan.ts`'s loop;
   - tests in `reset-confirmation.test.ts` and `reset-flow.test.ts`, and the
     fixture's skip assertion.
5. `feat: Suggest names in a record's ceiling`.
   - `RenderContext.suggestFormula`;
   - `sheet-view.ts` building the vocabulary and binding `attachFormulaSuggest`;
   - `formula-suggest.ts`'s header.
6. `docs: Record that a record's ceiling may be a formula`.
   - SPEC §4.1, §4.2, §5, §6, §10 and §13 as listed under **Data and file model**.
     In §6, the confirmation and the report also list a component's own sentence
     about the parts it skipped.
   - `docs/UI.md` §9's ceiling row gains the stacked, evaluated branch;
   - the one line in `docs/PATTERNS.md` §8;
   - one sentence in `docs/features/per-record-ceiling.md`'s **Deliberately not
     doing**, pointing here.

## Deliberately not doing

- **A field-level formula `max` on a Record set field, and any precedence between a
  field and a record** (A and B above). `max` on a field stays a literal.
- **Any change to how `maxSource: 'field'` evaluates.** It evaluates nothing, as
  today.
- **Pool's and Track's `max`**, including Track's own `maxSource: 'character'`
  composite (`d6: 1 / 4`). It looks the same in a note and is a different component.
- **Table**, whose `number` columns keep a literal `max` and no per-row ceiling.
- **The reset binding's `to` expression and a row-scope name for the ceiling.** The
  open §13 question about modifier targets, and §6's deferred "a name for a record's
  own ceiling that `to` could read", are not touched. `count(features, Uses < max)`
  is still not writable.
- **Publishing the ceiling** (`features.Spellfire.max`), for the reason a record
  publishes nothing.
- **Migrating a note's ceiling on a rename**, and **a layout-editor `Notice` for
  one** (question 1, Options 1 and 2). The owner ruled that the record's own report
  is enough. The `Notice`'s cost is listed there: hook sites with no `id` site, a
  field-level count, and noise on every rename.
- **A guard reading a non-numeric ceiling as "no ceiling"** (question 2).
- **Naming *which* record a reset skipped in the confirmation or the report.** The
  count is said (commit 4), and the record says it on the sheet. Listing names
  would put a variable-length list inside one confirmation line.
- **A keypad that switches between numeric and full** (Design, "Typing it"). It
  needs an affordance to ask for an expression, which is a new surface on a crowded
  line.
- **Pool-style settling** of arithmetic in the ceiling, where `2+1` becomes `3`. An
  expression is kept.
- **Widening the ceiling box on focus.** A long expression scrolls inside it.
- **A sample expression ceiling, and a palette change.** The 5e starter's `features`
  list is unchanged. Its `Uses` already has `maxSource: 'record'`, and a starter holds
  no character data.
- **Moving `formula-suggest.ts` out of `editor/`.**
- **Every unrelated row in `docs/BACKLOG.md`**, including the forced-colors row on
  Table's stacked cell and the suggester's ARIA row.
