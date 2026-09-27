# A Record set reset that reaches only the records it applies to

Status: shipped

Today a reset trigger bound to a Record set acts on every record in the same way.
**Short rest** refills a feature whose `Recharges` field says Long rest, and it
refills the passive traits too wherever they hold a ceiling. The binding has no
way to say which records it is for: `applyReset` in
`src/components/record-set.ts` walks every readable record.

## Model question

**No open §13 bullet asks this.** It is still a model question: it adds a key to
`ResetBinding`, which is shared config the plugin reads itself (§6), and it changes
what `applyReset` hands back. **The owner settled the model half before this
document was written, and reopened one answer when approving the spec** (below).
What follows writes the result out with its arguments. **Nothing counts as
resolved until it is built**, so this feature adds only an open entry to §13, with
its candidates and its settled status. `/land-it` writes the `Resolved:`
paragraph.

**The answer reopened at approval: the recovery amount.** The first draft had a
`formula` reset's `to` evaluated once per record, reading that record's own values,
so that D&D 2024's Channel Divinity could regain one use on a short rest. The owner
reopened that, for a reason the research did not have:

> A per-record amount is not safe until a binding can name the field it writes.

A Record set reset writes its number into **every** `number` field of each record
it reaches. Today's `to: '0'` into every field is at least coherent. A `to` that
reads the record is exactly what makes writing every field wrong: `Uses + 1` on a
record that also holds a DC writes `Uses + 1` into the DC. So the per-record amount
and field targeting are **one follow-up**, modelled on Table's `resetColumns`, and
this feature does neither. **`to` is resolved once, in sheet scope, exactly as
today.** `where` is the only thing evaluated per record.

The follow-up's scope rule is also the owner's, and is recorded here so it is not
re-derived: **record scope is tied to the target field, not to `where`.** A binding
that names a field evaluates in that record's scope, and one that names no field
keeps sheet scope. Existing layouts then mean what they meant, and the scope
follows from what the binding writes rather than from whether another key happens
to be present.

Five §13 entries border this feature, and it leaves each of them where it stands:

- **"Whether a field's placement may follow another field's value."** That entry
  fixed the grammar a condition on a record is written in: a boolean formula in the
  record's own scope. This feature reuses that grammar for a second purpose,
  deciding which records a reset reaches. It does not touch visibility (Part 1).
- **"What a string type in the expression language would unlock…"** The
  magic-number cost that entry records now has a third reader. A reset's condition
  names a level by its position, exactly as `visibleWhen` does (see **Level
  positions**).
- **"How a reset trigger reaches a Table."** That entry is the precedent for adding a
  key to the binding and for asking a component rather than teaching the view, and
  its `resetColumns` is the model for the follow-up. Its own open question, whether
  a Table's *rows* can be scoped, stays open.
- **"Whether a reset binding's own `to` expression is a modifier target."**
  Deferred, and untouched. `to` is not changed at all.
- **"Whether two conditions that hide each other should be refused or reported."**
  Not reached. A reset's condition hides nothing, so it cannot lock a control.

### Part 1: the scope lives on the binding, as a per-record condition

`ResetBinding` gains one optional key, **`where`**:

```json
{ "trigger": "Short rest", "action": "full", "where": "Recharges == 1" }
```

**The condition is a boolean formula, evaluated once per record in that record's
own scope.** It uses the grammar `visibleWhen` fixed: the record's stored fields,
then the sheet, and never a computed field (§5, "a computed field reads the stored
layer"). It must come to true or false, which is the language's own rule for
`if()`, `&&` and an aggregate's condition. **With no `where`, the binding reaches
every record, exactly as it does today.** A blank `where` is read as absent, as
every optional formula key is (§7).

**It narrows all three actions and changes none of them.** `full` restores each
reached record's ceiling and skips a record that has set none, as
`docs/features/per-record-ceiling.md` built it. `empty` resolves nothing. `formula`
writes its one sheet-scope number into the reached records. A record the condition
excludes is not in the delta at all, so its bytes are identical after the press.
Every write still goes through the join, so a reader-set ceiling survives (Tidy5e
733), and a `level` field is still left alone by every action. `full` stays `full`
(dnd5e 871). A reset that "regains one" is the follow-up's.

**The Recharges case works with `full`**: `where: 'Recharges == 1'` on **Short
rest**, and `where: 'Recharges == 1 || Recharges == 2'` on **Long rest**.

**What `where` does not fix, stated so nobody reads it as fixed.** Within a reached
record, every `number` field is written, as today. On a list whose records hold a
`Uses` counter *and* a `Save DC` with `max: 20`, a scoped `full` refills `Uses` and
also sets every reached record's DC to 20. `empty` writes the DC to 0. A `formula`
writes its number into both. A DC field with no `max` makes `full` fail naming the
field, as today. `where` narrows *which records* are written, and naming *which
field* is the follow-up's (see **Deliberately not doing**). The harness sample and
the vault fixture both hold that second field, so the defect is on screen rather
than avoided.

**Why the binding, and not the record or the trigger.** The prior art splits three
ways:

- **The record names the event.** dnd5e 4.x `uses.recovery[]`, pf2e
  `frequency.per` and DnD UI Toolkit's `reset_on` all put the event on the item.
  Here, "Recharges" would have to be a field type that stores trigger names. The
  expression language has no strings, and §4.2 refuses a `text` field. So a record
  could only name a trigger by a number, which is the level-by-position hazard with
  nothing to read it through.
- **The trigger lists what it includes.** dnd5e's
  `restTypes.long.recoverPeriods = ["lr","sr"]` is this shape, and §6 declines it:
  a trigger that declares it includes another stays sugar over the list of
  bindings.
- **The action filters by field value.** Notion database buttons and Airtable
  automations filter rows by a field value (`Recharges = Short Rest`). This is the
  shape chosen. The layout says it once, on the one binding that means it, in a
  grammar the layout already has.

**The name is `where`**, the filter's own word, for three reasons:

- It is deliberately not `visibleWhen`, so nobody reads the reset's scope as a
  field's visibility.
- It is deliberately not ` when `, which is the modifier part's clause and already
  means "this change applies while". That is a different job, done one section
  away.
- It reads correctly in the file: *reset this binding where Recharges is 1*.

**Visibility stays a sink.** `applyReset` still never evaluates a `visibleWhen`,
and `render` never evaluates a `where`. A hidden field resets exactly as a shown
one does, and a record whose `Uses` is hidden is reached or not reached by its
`where` alone. The two conditions share a grammar and nothing else. A test holds
both directions.

**The parser assumes nothing about the old shape** (dnd5e 4845). `where` is
optional, and a binding without it is the same bytes it always was. `parseBinding`
gains one line beside `column`'s: `where` must be a string where it is present,
and anything else refuses the layout, because a binding is shared config and its
shape is the file format's business (§6). What the text says is contents. An
expression that will not parse is reported in the editor and fails at the press,
like every formula field (§7).

**One cross-version cost, which this feature cannot fix and must state.**
`parseBinding` rebuilds a binding from the keys it knows. So Sheetsmith 0.4.x and
earlier *drop* `where` when they read a layout that holds one. That layout, opened
in an older plugin, resets every record, and an editor save there writes the key
away. The release notes record it. It is not mitigated.

### Part 2: how `where` fails

**`where` is the one per-record evaluation, and it adds a failure path to the
button.** `docs/features/per-record-ceiling.md` closed a per-record formula ceiling
because it would be "a second failure path on a control that already has one".
Three things bound this one:

1. **The outcome keeps its granularity: a binding succeeds or fails as a whole.** If
   `where` cannot be worked out on any readable record, whether because a name is
   unknown, the result is not true or false, or the text will not parse, that
   binding writes nothing on that list. The failure names the first record, the
   reason, and how many records failed, in the shape of the `visibleWhen` problem
   line. So the reader never gets a partial rest they have to reconcile record by
   record. That is the aggregate's rule (§5, "a quietly wrong number is worse than
   a missing one"). The cost is that one hand-typed word in a field a condition
   reads holds back that list's binding, and the line names the record, so the fix
   is one field away.
2. **It runs only when a trigger is planned.** A formula ceiling would have run on
   every render, clamp and commit. `where` runs on no render.
3. **The failure is seen before anything is written.** A trigger is now planned
   before its confirmation opens (Part 3), so a condition broken by a rename is on
   screen while **Cancel** is still available.

**It fails closed, which is the opposite of `visibleWhen`, on purpose.** That
spec's fail-open argument is that a hidden value is the worse way to be wrong on a
sheet. For a reset the worse way to be wrong is writing records the author
excluded: the mis-scoped rest, which is the research's worst trap. Writing nothing
and saying so is the recoverable direction.

**`to` is unchanged**: it is resolved once, before any record is looked at, and it
fails as it fails today.

### Part 3: the confirmation says how many records each list will reset

The owner's words, carried verbatim:

> Say it in the confirmation, not after the rest. A rest already asks for
> confirmation before it runs. Something like "Short Rest refills 3 of 7 Features"
> there catches a mis-scoped rest before anything is written. The research's
> worst trap is a rest that reports success after a rename or reorder changed what
> it reached. Your "Silent" option hides that. Your "Counted in report" option
> only shows it after the notes have been overwritten, and on every rest it adds a
> line to a report that currently names only failures.

So **the confirmation carries a reach count for each list, worked out before
anything is written, and the report after the rest still names only failures.**

**How the sheet gets the count without learning that Record set exists: `applyReset`
already computes it, so the result carries it.** `ResetResult`'s success arm gains
one optional field:

```ts
export type ResetResult<TData> =
	| { ok: true; data: TData; reach?: ResetReach }
	| { ok: false; error: string };

/** How much of a component one binding reaches, where it reaches only some. */
export interface ResetReach {
	/** The parts this binding reaches. */
	reached: number;
	/** The parts it was checked against. */
	of: number;
}
```

**The contract grows no member, and that is the decision to name.** The
alternative, a `resetReach(data, config, reset, context)` member beside
`applyReset`, passes §4.1's rule. It loses on the rule's own sibling argument, "one
list, two readers" (`resetColumns`). Two members would evaluate one condition
twice, and the day they disagree is the dnd5e 1065 trap exactly: a control that
announces one scope and acts on a narrower one. Carried on the result, the number
the confirmation shows and the records the press writes come from **one
evaluation**, so they cannot disagree.

**For that to be true, the sheet plans a trigger before it confirms one.** Today
`applyTrigger` runs the bindings after **Apply** is pressed. Instead, a press on the
trigger button runs every binding through `applyReset` and holds the outcomes. The
confirmation is drawn from them, and **Apply** writes exactly the edits it held.
This moves nothing in time that matters. Both today's path and this one read the
component data of the render that drew the button. The plan is a pure function in
a module of its own (`src/view/reset-plan.ts`), which three things use: the view,
the harness (for the confirmation shot) and `reset-flow.test.ts`. That test can
drive it directly instead of keeping its own copy of `applyTrigger`, which is half
of `docs/BACKLOG.md`'s "A mirror of `renderSheet` is spelled five times" row.

**Where a reach is given.** Record set returns one only where the binding carries a
`where`. There, `reached` is the readable records the condition admits, and `of`
is every record in the list, unreadable ones included, since the reader sees all of
them. A binding with no `where` returns no reach, so its line is today's bare
label: "7 of 7" on every rest would be the line the owner said a report should not
gain. A record the condition admits and `full` then skips, because it holds no
ceiling, still counts as reached. The count is the binding's *scope*, not its
writes, which keeps the number stable whether or not the records are already full.

**A planned failure appears in the confirmation as well as after the rest.** For
the owner's trap (a rename that leaves `where` reading a key nobody has any more)
the plan fails, and the confirmation cannot say "3 of 7". It says instead that this
list will not reset, and why. The rule is generic, one branch in the view: *any*
component whose planned outcome failed is listed as not resetting, with the
component's own reason. So the confirmation of a Pool with a broken `max` changes
too. The report after **Apply** is unchanged, and names the same failures and only
failures.

### Part 4: a component that cannot check a condition is left alone

**The spec's proposal, which stood at approval.** Pool, Track and Table have no
records for a `where` to be checked against. A condition honoured by Record set and
silently ignored by a Pool bound to the same trigger is the dnd5e 1065 trap: the
author scoped the rest, and the Pool refilled anyway.

**It is reported in the layout editor and refused at the press.** The component is
left exactly as it was, and named in the confirmation and in the report. The
layout is not refused.

- **Not a parser refusal.** `parse/layout.ts` would have to know which components
  honour the key, and no module in `src/parse/` imports the component registry
  today. §6 draws the line in the same place for `column`: whether `where` is a
  string is shape, and whether this component can check it is contents. Refusing
  the layout would also blank every sheet on it over one key.
- **Not ignored.** Silently resetting the whole Pool is the trap itself.
- **Fail closed at the press.** A binding carrying `where` on a component that does
  not declare `reset.*.where` among its `formulaFields` is not handed to
  `applyReset`. The plan records the failure itself: *"it resets as a whole, so it
  cannot check a condition, and this trigger leaves it as it is. Clear **Only
  where** on this reset in the layout editor."* The view reads a declaration, not a
  shape: `formulaFields` is the component saying which config holds an expression
  it reads.
- **In the editor**, the **Only where** row is drawn for such a binding anyway,
  holding the stored text with the error under it. That follows the trigger
  dropdown's rule that opening the form must not silently change the binding.
  Clearing the field removes the key.

**The declaration is the gate, in both places.** The editor offers **Only where**
where the component declares `reset.*.where`, and the plan honours `where` on the
same condition. A `hasBuffer`-style boolean member was the alternative, and it
loses on "one list, two readers": `reset.*.where` has to be in `formulaFields`
anyway, for the paste rewrite, the id-rename rewrite and the name suggester. So a
second declaration could only come to disagree with the first.

**A Table's rows are not reached by this feature.** Table declares no
`reset.*.where`, so a `where` on a Table binding is left alone and reported like a
Pool's. Whether a condition should narrow a Table column's reset to some rows stays
open in §13.

### Part 5: two bindings on one trigger

**`where` is not part of a binding's identity.** `bindingKey` stays the trigger
and the column, so two bindings on one trigger on a Record set are **still
refused** by `parseReset`, whatever their conditions say. Overlap depends on the
data (`Recharges >= 1` and `Uses < 2` can both be true), so no static check can
refuse it, and each answer to a record both conditions admit is bad:

- **Apply both in file order.** The second write wins unannounced, which is the
  exact reason §6 refuses duplicates.
- **First match wins.** File order becomes meaning, and nothing on screen shows
  that order.
- **Leave the overlap alone and report it.** Correct, but it makes each binding
  evaluate its siblings' conditions to know whether it overlaps them.

The research found no incident of double-applying. **What this costs is the mixed
trigger**: "refill these, regain one on that" on one short rest cannot be written
until the follow-up, where a binding names its field. That follow-up has to answer
the same overlap question for two bindings naming one field, and this section is
its starting point.

### Level positions

**A reorder of a level's names changes what every scoped reset means**, just as it
changes what a `visibleWhen` means.

- **The editor's reorder Notice (commit `2067601`) is extended to cover `where`.**
  `renderColumnsEditor` is handed the whole component config as `record`, and
  `reset` is shared config, so reading `record.reset` teaches `list-fields.ts`
  nothing about Record set. Where a binding's `where` reads the reordered key as a
  bare name (`conditionReads`), the Notice names that trigger too. Only `where`:
  `to` is in sheet scope and reads no record field. A level renamed in place still
  moves nothing and says nothing, and a key rename rewrites no condition, which is
  the `visibleWhen` ruling.
- **The confirmation count does not catch a reorder, and the spec says so rather
  than claim it.** A reorder changes what the stored numbers *mean*, not which
  records hold them. Second Wind still stores `1`, `Recharges == 1` still admits
  it, and the count still reads the same, while `1` now draws as Long rest. So the
  Notice at the commit is the whole defence against a reorder. The count is the
  defence against everything that changes *which* records match: a rename, which
  fails and says so, a condition edited wrongly, and a character's data drifting.
- **No position legend under Only where.** The legend is drawn from the list's own
  level fields, and `reset-field.ts` cannot read those without learning Record
  set's shape.

### What it publishes, stores, and does to existing files

- **Publishes:** nothing. No name, and no change to `scopeValues`, `scopeRows` or
  `scopeModifiers`.
- **Stores:** one optional key on a binding in the layout. The character note is
  untouched in format, and a reset writes the fence entries it already wrote, for
  fewer records.
- **Existing layouts** parse unchanged, byte for byte, and mean exactly what they
  meant. A binding with no `where` reaches every record, and `to` is not touched.
- **Existing notes:** untouched until a trigger is pressed. Constraint 4 is not
  reachable: a reset never adds, removes or renames a record, and an excluded record
  is byte-identical.
- **Constraints 1, 2, 3 and 5.** `where` goes through the one parser (1). It is
  layout text and writes no markdown (2). The note's round trip is untouched,
  because `read` and `write` do not change (3). `src/parse/` gains one string check
  and `src/formula/` gains nothing (5).

## What it does

A layout author writes a condition on a Record set's reset, such as
`Recharges == 1` under **Only where**, and the trigger resets only the records
where it holds, by whichever of `full`, `empty` or `formula` the binding already
takes. Pressing **Short rest** asks "Apply Short rest? … It resets:" over a list
reading `Rest features — 2 of 5`, so a mis-scoped rest is caught before any note is
written. A reorder of the level a condition reads raises a Notice at the commit.

## Smallest version

This is the owner's cut. It covers:

- `where` scoping over `full`, `empty` and `formula`, with `to` still resolved once.
- The Pool, Track and Table refusal at the press.
- **Only where** in the editor.
- Plan-before-confirm and the reach count, with the confirmation shots.
- The reorder Notice covering `where`.

What it gives up: a per-record amount (Channel Divinity's one use back) and naming
which field a reset writes. Both go to one follow-up. Within a reached record,
every `number` field is still written.

## Design

**Nothing changes on the sheet.** A binding is a fact about the layout, not a state
of the data, which is the rule `reset-on-a-table-column.md` held. No record carries
a mark saying which rest reaches it. The two surfaces that change are the
confirmation and the editor's reset field.

### The confirmation

The modal is unchanged in structure: `ConfirmModal`, its message
`Apply Short rest? This can be undone. It resets:`, one `.sheetsmith-affected` list
item per bound component, and **Cancel** / **Apply Short rest**. The item text
comes from `resetSummary`, which now also takes the planned outcome for that
component:

| Planned outcome | Item |
| --- | --- |
| Succeeded, no reach, no column | `Hit points` (unchanged) |
| Succeeded, bindings name columns | `Conditions — Active, Uses` (unchanged) |
| Succeeded with a reach | `Rest features — 2 of 5` |
| Failed | `Rest features — will not reset: <the component's reason>` |
| Some column bindings failed, others succeeded | `Conditions — Active; Uses left will not reset: <the component's reason>` |

- **A reach is shown where the component's one binding for this trigger
  reported one.** Only a component that names no column can report a reach, and
  such a component holds at most one binding per trigger (Part 5), so a reach and
  a column list never meet on one line.
- **A partial failure is said per part.** Only a component whose bindings name
  parts can half-fail on one trigger. The parts that move are listed first, then
  each part that will not reset with its reason, joined by `; `, so the line does
  not claim the component will not reset when most of it will. Every binding
  failing is the **Failed** row.
- **The reason is the same string the report after the rest shows**, composed by
  the component. It already continues `<label> — ` in lower case (the `ResetColumn`
  framing rule), so one sentence serves both surfaces.
- **"2 of 5" has no noun after it.** The label names the list, and the heading
  carries the verb, which is the owner's own "refills 3 of 7 Features". It also
  means pluralising `recordName` is never needed.
- **`0 of 5` is listed, not dropped.** A rest that reaches nothing on a list is
  exactly the mis-scope the count exists to show.
- **The Record set failure sentences**, where `N` and the noun follow the
  `visibleWhen` problem line (`every feature`, `2 features`), with the first
  record named wherever not every record failed (`2 features, starting with
  "Rage"`):
  - `its condition under Only where could not be worked out on every feature, so
    it resets none: Unknown name "Recharge". Fix it under Only where in the
    layout editor.`
  - `its condition under Only where could not be worked out on "Rage", so it
    resets none: it came to "2", which is not true or false. Fix it under Only
    where in the layout editor.`

  The reason after the colon is the formula engine's own sentence, the one the
  **Shown when** problem line prints, so it keeps its capital: it is a sentence
  of its own after a colon, not the continuation of `<label> — `, which the
  lower-case opening `its condition…` already is.
- **The unhonoured `where`** (Part 4): `Ki — will not reset: it resets as a whole,
  so it cannot check a condition, and this trigger leaves it as it is. Clear Only
  where on this reset in the layout editor.`

No class is added. The items wrap inside the modal's own width, which a narrow shot
checks.

### The layout editor's reset field

`src/editor/reset-field.ts` gains one continuation row, **Only where**, drawn with
`detailRow` so it joins the binding's block. It goes after **Acts on** and before
**Resets to**, so scope reads before amount.

- **Drawn** where the component declares `reset.*.where` in `formulaFields`, which
  is Record set, *or* where the binding already carries a `where`, which is the
  Part 4 report.
- **A text input.** Placeholder `All of it`. `aria-label`
  `${trigger || 'This trigger'} only where`, on **Acts on**'s argument that a
  repeated control has to say which binding it belongs to. Focus token
  `reset-where-${id}-${index}`.
- **Name:** Only where. **Description:** "Resets only where this condition holds,
  such as `Recharges == 1`, and leaves everything else exactly as it is. Blank
  resets all of it. A level is read by its position, from 0 for its first name."
  The example goes in a code element, as the **Resets to** example does.
- **Committed with `onCommit`**, trimmed, and **blank deletes the key**. Unlike
  **Resets to**, blank is not refused, because an absent `where` is the ordinary
  binding.
- **Checked on render and on commit** with `formulaProblem`, through `fieldError`,
  and stored anyway, as every formula field is (§7). The check is parsing only.
  An unknown name is a claim about data, and the confirmation reports it.
- **The name suggester is bound with this component as owner**
  (`context.suggestNames(input, config.id)`), so the record's own field keys come
  first, as they do under **Shown when**. **Resets to** is unchanged.
- **The Part 4 error**, through `showFieldError` on the input, for a component that
  does not declare the path: "This component resets as a whole and cannot check a
  condition, so this trigger leaves it as it is. Clear this to reset all of it."
- **Add reset, the duplicate guard and the trigger dropdown are unchanged.** `where`
  is not in `bindingKey` (Part 5).

### The reorder Notice

`levelReorderNotice` gains the trigger names whose bindings' `where` reads the key,
beside the field keys, and its sentence gains one clause for them:

`"Recharges" levels moved: "Always-on" was 3 and is now 2. The condition on
"Active" reads Recharges by position, so it now means something else. Check it
under Shown when. The Short rest reset reads it by position too, so what it resets
has changed. Check it under Only where.`

With resets only, the field clause is left out and the reset clause reads
`The Short rest reset reads Recharges by position…`. More than one trigger is named
through `series`, `spelled`'s unquoted sibling in `parse/spelled.ts`, since a trigger
name is the layout's own words (`The Short rest and Long rest resets read…`).

### Empty and error states

- **No records:** `0 of 0` where the binding has a `where`, and nothing is written.
- **An unreadable record:** never evaluated and never reached. It counts in `of`
  and not in `reached`, and it is left byte-identical, as today.
- **A condition that will not parse:** the parse error under **Only where**. At the
  press the plan fails, and the confirmation says so.
- **A condition naming a key that does not exist**, such as after a rename: the
  plan fails on every record, and the confirmation says `will not reset` with the
  reason. Nothing is written.
- **A condition that comes to a number:** the same, naming the record and what it
  came to.
- **Every bound component failing:** the modal still opens, listing each one as not
  resetting, and **Apply** reports the same failures and writes nothing. It is not
  disabled, because a plan that fails is information and the modal is where it is
  read.

## Config fields

`reset` is not a config field and may not become one (`RESERVED_KEYS`), so this adds
no entry to any component's `configFields`. The control it adds, for the record:

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `reset.*.where` | text input, a formula, drawn by `reset-field.ts`; absent means every record | Only where | Resets only where this condition holds, such as `Recharges == 1`, and leaves everything else exactly as it is. Blank resets all of it. A level is read by its position, from 0 for its first name. |

Record set's `formulaFields` becomes
`['fields.*.formula', 'fields.*.visibleWhen', 'reset.*.to', 'reset.*.where']`.

## Data and file model

**The layout:** one optional string per binding, `where`. `parseBinding` carries it
between `column` and `action` in the object it rebuilds, so an editor-written
layout round-trips byte-identically through `parseLayout` and `serialiseLayout`. A
non-string refuses the layout with `"where" must be a string.` A blank one is
carried and read as absent.

**The note:** no new key, section, fence entry or byte shape. `applyReset` returns
the same `RecordSetData` delta it returns today, holding only the reached records.
`write` is untouched, so every record outside the delta keeps its bytes, and a
reached record already at the value is byte-identical.

**The view:** `applyTrigger` splits into `planTrigger` (pure, in
`src/view/reset-plan.ts`) and the write. The plan's `at()` rewrite generalises from
the one path `reset.to` to any unindexed `reset.<key>`, so a component asks for
`reset.where` by the one name it has, as it already does for `reset.to`. Undo is
untouched: it is still one write, with the note text before it kept for the undo.

**The contract:** `ResetResult`'s success arm gains `reach?: ResetReach`, and
`ResetBinding` gains `where?: string`. No member is added.

## Acceptance criteria

### Held by tests

The component tests run on a list with **two** `number` fields, `Uses`
(`maxSource: 'record'`) and `DC` (`max: 20`), beside a `Recharges` level
(`None / Short rest / Long rest / Always-on`), so no case passes because the list
avoids the layout where every-field writing shows.

- [x] **No `where`, no change.** `applyReset` returns the same data it returns today
      for `full`, `empty` and `formula`, with no `reach`. (`record-set.test.ts`)
- [x] **A `where` narrows all three actions, and changes nothing within a record.**
      With `where: 'Recharges == 1'`:
      - `full` writes each short-rest record's `Uses` to its own ceiling **and its
        `DC` to 20**.
      - `empty` writes both to 0, and the ceiling survives (`Uses: 0 / 3`).
      - `formula` with `to: '2'` writes 2 into both, each held to its own bounds.

      Every other record is absent from the delta, and the section is
      byte-identical outside the reached records. The DC writes are asserted as
      today's behaviour, with a comment naming the follow-up that ends them.
      (`record-set.test.ts`)
- [x] **`full` still fails on a field-owned ceiling that is missing.** The same list
      with `DC` declaring no `max` fails naming `DC`, whether or not the binding
      has a `where`, and writes nothing. (`record-set.test.ts`)
- [x] **`to` is resolved once, in sheet scope.** With a spy on the resolver, a
      scoped `formula` resolves `reset.to` exactly once, with an empty scope,
      however many records it reaches. (`record-set.test.ts`)
- [x] **The reach.** A scoped binding returns `reach: { reached: <records
      admitted>, of: <all records> }`. An unreadable record counts in `of` and not
      in `reached`. A record admitted and then skipped by `full` for holding no
      `Uses` ceiling counts as reached, and its `DC` is still written.
      (`record-set.test.ts`)
- [x] **Failing whole, and closed.** A `where` that names an unknown key, one that
      comes to a number on one record of five, and one that will not parse each
      return `ok: false`. The error names the first failing record, the count, and
      the fix, and **no record is written**. (`record-set.test.ts`)
- [x] **Visibility stays a sink.** With a spy on the resolver, `applyReset` resolves
      no `fields.*.visibleWhen` path and `render` resolves no `reset.*.where` path.
      A `where` admits a record whose `Uses` is hidden, and the reset writes it.
      (`record-set.test.ts`)
- [x] **A `level` field is written by no action**, with or without `where`.
      (`record-set.test.ts`)
- [x] **The parser.** `where` as a string is carried, and as a number, boolean or
      object refuses the layout, naming the key. A blank one is carried and reaches
      every record. A binding without it parses to the same object as before, and
      a layout carrying it round-trips byte-identically. Two Record set bindings
      on one trigger with different `where` text are still refused by
      `parseReset`. (`layout.test.ts`)
- [x] **The plan.** `planTrigger` returns every binding's outcome, and the edits
      **Apply** writes are exactly the plan's.
      - A binding carrying `where` on a Pool, a Track and a Table is not handed to
        `applyReset` (a spy). It is a failure naming the component with the Part 4
        sentence, and it leaves that section byte-identical, while a Record set on
        the same trigger applies.
      - `reset.where` reaches the component as `reset.<index>.where`.

      (`reset-flow.test.ts`, driving `planTrigger` itself rather than a mirror)
- [x] **The confirmation.** `resetSummary` gives:
      - `Rest features — 2 of 5` for a reach, and `0 of 5` for none;
      - the bare label for a Record set binding with no `where`;
      - `Conditions — Active, Uses` for columns, as before;
      - `<label> — will not reset: <reason>` for any failed plan, a Pool's broken
        `max` included.

      (`reset-confirmation.test.ts`, beside `src/view/reset-confirmation.ts`,
      which holds `resetSummary` and the one opener the view and the harness share)
- [x] **The report after the rest names only failures**: a scoped rest that
      succeeds raises no Notice. (`reset-flow.test.ts`)
- [x] **The editor.**
      - **Only where** is drawn for a Record set binding, and for no Pool, Track or
        Table binding without the key.
      - Typing writes `where`, and blanking deletes it.
      - A condition that will not parse shows `formulaProblem`'s sentence on render
        and on commit, and is stored anyway.
      - The suggester is bound with the component as owner.
      - A Pool binding carrying a hand-written `where` draws the row, the stored
        text and the Part 4 error, clearing it deletes the key, and opening the form
        writes nothing.

      (`reset-field.test.ts`)
- [x] **The reorder Notice.** On a list whose Short rest binding's `where` reads
      `Recharges`, reordering `Recharges`' names raises one Notice naming Short rest
      and **Only where**. A reset whose `to` names `Recharges` adds no reset
      clause. Renaming a level in place raises none, and a list with no condition
      and no `where` reading the key raises none, as before.
      (`level-reorder.test.ts`, `list-fields.test.ts`)
- [x] **Registry contract.** A component declaring `reset.*.where` declares
      `applyReset`. Driven over its `example` with a binding
      `{ trigger, action: 'empty', where: 'false' }`, it writes nothing and returns
      `reach.reached === 0`. At least one registered component declares the path,
      and at least one stateful component does not. (`contract.test.ts`)
- [x] **The paste and id-rename rewrites reach `where`.** A pasted Record set whose
      `where` reads another component's id has that id rewritten on the copy.
      (`paste.test.ts`)
- [x] `npm test`, `npm run lint` and `npm run build` pass, and `styles.css` matches
      `src/styles/`.

### Held by looking (`npm run harness`, then `npm run harness:shot`, then `/design-review`)

**The harness gains the confirmation**, which `docs/BACKLOG.md`'s row "The harness
draws neither the trigger bar nor the sheet's notice" lists as never looked at. A
`confirm=<trigger>` query on the sheet surface runs `planTrigger` over the sample
sheet and opens `ConfirmModal` against the stub `App`. That closes the row's
confirmation half. The trigger bar, the undo notice and the failure notice stay on
it, and the row is amended to say so.

**The harness gains `rest_features`**, in the first free rows after
`recharging_broken`, with `SHEET_FRAME` re-measured. It is headed, seven columns
wide, `recordName` `Feature`, and has three fields:

- `Recharges`: a `level` select, `None, Short rest, Long rest, Always-on`
- `Uses`: a `number`, `maxSource: 'record'`
- `DC`: a `number` named `Save DC`, `max` 20, `placement: 'body'`

Its records:

| Record | Recharges | Uses | DC |
| --- | --- | --- | --- |
| Second Wind | 1 | `0 / 1` | 13 |
| Action Surge | 1 | `0 / 1` | none |
| Rage | 2 | `1 / 3` | 15 |
| Darkvision | 0 | none | none |
| Aura of Protection | 3 | none | 15 |

Its bindings are **Short rest** `full` with `where: 'Recharges == 1'`, and **Long
rest** `full` with `where: 'Recharges == 1 || Recharges == 2'`. Under
`state=broken` the Short rest `where` reads `Recharge`, which is the rename trap. A
Pool, `rest_pool`, is placed beside it with a Short rest `full` binding carrying a
hand-written `where`.

- [x] **`sheet-reset-confirm`** and **`sheet-reset-confirm-dark`**
      (`confirm=Short rest`): the list reads `Rest features — 2 of 5`, beside the
      harness's other Short rest components in their existing words, and
      `rest_pool`'s refusal. Legible in both themes.
- [x] **`sheet-reset-confirm-long`** (`confirm=Long rest`): `Rest features — 3 of 5`.
- [x] **`sheet-reset-confirm-broken`** (`state=broken&confirm=Short rest`):
      `Rest features — will not reset: …every feature…`. The long items wrap inside
      the modal with no clipping.
- [x] **`sheet-reset-confirm-narrow`** (`sheet-reset-confirm` in a 520px window)
      and **`sheet-reset-confirm-narrow-broken`** (`sheet-reset-confirm-broken` in
      the same window): the same items wrap, and the buttons stay reachable. 520
      rather than 380 because headless Chrome floors a viewport at 500
      (`docs/BACKLOG.md`), and the modal sizes against the viewport rather than
      the harness's own container, so a `width=380` query would photograph a
      520px modal and call it 380.
- [x] **`editor-reset-where`** and **`editor-reset-where-dark`**
      (`open=rest_features`): each binding reads as one block, trigger and action
      then **Only where**, with the condition text in it.
- [x] **`editor-reset-where-refused`** (`state=broken&open=rest_pool`): **Only
      where** holds the stored text, with the Part 4 error under it.
- [ ] **Existing shots that move, and only these.** The sheet shots that capture the
      rows `rest_features` takes, because the frame grows. Any editor shot that
      opens a Record set carrying a reset binding, because it gains an empty
      **Only where** row. The build lists every PNG that changed and says which of
      these two reasons moved it. A shot outside both is a finding.

      **Not checkable, and left unticked.** Eight baseline shots (`sheet-light`,
      `sheet-dark`, `sheet-wide`, `sheet-narrow`, `sheet-list-narrow`,
      `sheet-large-text`, `sheet-recharging-open`, `sheet-recharging-open-dark`)
      were overwritten by an accidental partial run from this tree during the
      build, and shots are gitignored, so no HEAD comparison exists to list what
      moved against. The owner was told at the land stop and approved landing
      with this criterion open. Separately, every editor shot's tree gains the two
      new samples' rows, a third reason this criterion did not name.
- [x] **Large text** (`text=24`) on `editor-reset-where`: the row's description and
      error share **Resets to**'s `--font-ui-small`.

### The throwaway vault fixture

The vault is `~/Developer/sheetsmith-test-vault/`. It lives outside the repository,
so its recipe lives here (`AGENTS.md`).

**`Sheetsmith layouts/Record variations.sheetsmith`** declares **Short rest** and
**Long rest** (add either that is missing) and gains:

- **`rest_features`** ("Rest features"), a Record set at column 1, row 23, six wide
  and four tall, `fieldHeadings: true`, `recordName` "Feature". It has the harness
  sample's three fields, `Save DC` included, and its two bindings.
- **`ki`** ("Ki"), a Pool at column 1, row 27, two wide and two tall, `max` 4, with
  a Short rest `full` binding carrying a hand-written `"where": "Recharges == 1"`,
  the Part 4 case.
- `recharging` and everything else are unchanged. `recharging`'s own Long rest
  binding has no `where` and is the control that reaches every record.

**`Characters/Records.md`** gains `## Rest features` holding the harness's five
records, each with a line of prose, and `## Ki` holding `current: 1`.

Press:

- **The scope.** Press **Short rest**. The confirmation lists
  `Rest features — 2 of 5` and `Ki — will not reset: …`. Apply.
  - Second Wind and Action Surge read `1 / 1`.
  - **Both show `Save DC 20`**: Second Wind's 13 is overwritten, and Action Surge
    gains a DC entry it never held. That is today's every-field write, visible on
    purpose, and it is what the follow-up ends.
  - Rage is still `1 / 3`, DC 15. Ki is still 1.

  Diff `Records.md`: only the two reached records changed. The Notice after the
  rest names Ki alone.
- **The long rest.** Spend Rage to `0 / 3` and press **Long rest**: the confirmation
  reads `3 of 5`. Rage reads `3 / 3` with DC 20, and Darkvision and Aura are
  byte-identical.
- **The rename trap.** In the layout editor, rename `Recharges` to `Recharge`.
  Every note migrates, and both `where`s still read `Recharges`. Press **Short
  rest**: the confirmation says Rest features will not reset, naming every feature
  and the unknown name. **Cancel**, confirm that `Records.md`'s modified time did
  not move, and undo the rename.
- **The reorder.** Reorder `Recharges`' names to put `Long rest` before
  `Short rest`. The Notice names the Short rest and Long rest resets and **Only
  where**. Press **Short rest**: the count still reads `2 of 5` while Second Wind
  now draws as Long rest. That is the documented limit of the count, and the Notice
  is what caught the reorder. Cancel and undo.
- **The editor.** Open `ki`: **Only where** holds `Recharges == 1` with the Part 4
  error. Clear it and press **Short rest**, and Ki now refills. Undo.
- **Undo.** After any press, **Undo** restores the note byte for byte.

## Commit boundaries

These are a plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. `feat: Let a reset binding carry a condition`. `ResetBinding.where` and its doc
   comment, including why it is not `visibleWhen` and not in `bindingKey`, with
   `parseBinding`'s string check and the `layout.test.ts` cases, the round trip
   among them.
2. `feat: Plan a trigger before it is confirmed`. `src/view/reset-plan.ts`'s
   `planTrigger`, with `at()` generalised to any unindexed `reset.<key>`.
   `applyTrigger` becomes planning at the press and writing the plan's edits at
   **Apply**. `reset-flow.test.ts` drives the real plan instead of its mirror. No
   behaviour change yet.
3. `feat: Reset only the records a condition admits`. `ResetReach` on
   `ResetResult`, and Record set's `reset.*.where` in `formulaFields`. `where`
   evaluated per record over all three actions, the whole-binding failure and its
   sentences, and the reach. Tested in `record-set.test.ts` on the two-number-field
   list, with the registry contract's new case.
4. `feat: Leave alone a component that cannot check a reset's condition`. The
   plan's refusal for a binding carrying `where` on a component that does not
   declare `reset.*.where`, with its tests.
5. `feat: Count what a trigger will reset in its confirmation`. `resetSummary`'s
   reach and failure items in `src/view/reset-confirmation.ts`, with the opener the
   view and the harness share, and the tests in `reset-confirmation.test.ts`.
6. `feat: Write a reset's condition in the layout editor`. **Only where**, its parse
   error, its suggester and its Part 4 error. Tested in `reset-field.test.ts`.
7. `feat: Report a level reorder a reset reads through`. `levelReorderNotice`'s
   trigger clause, and `list-fields.ts` reading `record.reset`'s `where`, with its
   tests.
8. `test: Photograph a reset that reaches some records`. The harness's `confirm=`
   query, `rest_features` and `rest_pool` in `harness/samples.ts`, the re-measured
   frame, and the new `shot.mjs` views.
9. `docs: Record a reset that reaches only some records`. The owed edits:
   - SPEC §4.1: a reset's result may carry a reach, and no member was added.
   - SPEC §4.2: Record set's *Config*, *Sheet view: reset* and *Formula fields*,
     including that `where` narrows records and not fields.
   - SPEC §5: `where` is a row-scope formula evaluated only by `applyReset`.
   - SPEC §6: `where`; the component that cannot honour it; that a trigger is
     planned before it is confirmed; and that the confirmation carries a reach and
     every planned failure.
   - SPEC §7: **Only where**, and the reorder Notice reaching resets.
   - `docs/PATTERNS.md` §8: declaring `reset.*.where` obliges honouring it in
     `applyReset`, checked.
   - `docs/BACKLOG.md`: row 126's confirmation half is closed, row 58's
     `reset-flow.test.ts` mirror is noted as gone, and a new row for the
     every-number-field write, whose fix is the follow-up.
   - This document's status.

   The §13 `Resolved:` paragraph is `/land-it`'s own.

**The vault fixture belongs to no boundary**, since the vault lives outside the
repository. The recipe above is what is committed.

## Deliberately not doing

- **A per-record amount, and naming which field a Record set reset writes:
  deferred together, as one follow-up modelled on Table's `resetColumns`.** Record
  set declares its fields as reset targets, and a binding names the field it
  writes. **Record scope is tied to that target field**: a binding that names a
  field evaluates `to` in that record's scope, and one that names none keeps sheet
  scope, so existing layouts mean what they meant. Channel Divinity's one use back
  (`Uses + 1`) arrives there. **Why together:** a per-record amount is not safe
  until a binding can name the field it writes. A Record set reset writes every
  `number` field of each reached record, so `Uses + 1` on a record that also holds
  a DC writes `Uses + 1` into the DC, where today's sheet-scope `to: '0'` into
  every field is at least coherent. **This feature does not defer the
  every-field write by hiding it.** It is live today and stays live within the
  records `where` reaches. The tests, the harness sample and the vault fixture each
  hold a `Save DC` beside `Uses`, and the criteria assert what the write does to it.
  The follow-up also owns the overlap question for two bindings naming one field
  (Part 5).
- **A budget of choices on a rest.** Daggerheart's downtime offers the player a
  number of moves to choose between. It targets no record the layout can name, and
  this design does not imply it is covered.
- **Per-record random recovery.** 13th Age recharges a power on a d20, and dnd5e
  recovers `1d6` uses. §5 has no dice, and dice are out of scope.
- **Reaching a Table's rows.** A `where` on a Table binding is refused at the press
  and reported (Part 4). Whether a condition should narrow a column's reset to some
  rows is open in §13.
- **Two bindings on one trigger distinguished by condition.** Refused as before
  (Part 5).
- **Reading visibility.** `where` never reads whether a field is shown, and
  `applyReset` never evaluates `visibleWhen`.
- **A trigger that includes another.** Declined in §6, and still sugar.
- **Whether `to` is a modifier target.** Deferred in §13, and untouched.
- **A position legend under Only where.** It would need Record set's field shape in
  `reset-field.ts`. The reorder Notice carries the hazard.
- **Naming the reached records in the confirmation.** It would catch a reorder,
  which the count cannot (see **Level positions**). Not built.
- **Rewriting a `where` on a key rename or a level reorder.** Reported, not
  migrated, as with `visibleWhen`.
- **A reach line for an unconditioned binding.** `7 of 7` on every rest is noise.
- **A mark on the sheet for which rest reaches a record.** A binding is layout
  config, not data state.
- **Protecting older plugin versions.** 0.4.x drops `where` and resets every
  record. The release notes say so, and nothing else can.
- **Table and Roster as build targets, and every other `docs/BACKLOG.md` row.**
