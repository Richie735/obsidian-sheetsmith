# A Record set reset names the field it writes

Status: shipped

A reset bound to a Record set writes into every `number` field, and every `toggle`,
of each record it reaches. `resetWrite` and `applyReset` in
`src/components/record-set.ts` walk `storedFields(config)` and write each one. So a
scoped **Short rest** `full` refills Second Wind's `Uses` and also sets its
`Save DC` to 20. The binding has no way to say which field it is for. The same gap
is why its `to` is resolved once in sheet scope: `Uses + 1` read per record would
land in the DC as well. So Channel Divinity cannot get one use back on a short
rest.

This is the follow-up that `docs/features/record-set-reset-scope.md` defers under
**Deliberately not doing**. It closes the `docs/BACKLOG.md` § Patterns row "A
Record set reset writes every `number` field of each record it reaches".

## Model question

**No open §13 bullet asks this. The question is the deferred half of a resolved
one**: "How a reset trigger reaches only the records it applies to". Its
`Resolved:` paragraph records the deferral, and so do its "three questions" and
"What the build found" paragraphs. It is still a model question. It changes
what a binding's `column` may name, adds one optional contract member, and adds
one rule about two bindings on one trigger that `bindingKey` cannot express. Each
of these is a decision to take on purpose rather than a side effect of making a
button work.

**Settled with the owner before this document, and not re-derived here:**

- **Record scope is tied to the target field, not to `where`.** A binding that
  names a field evaluates `to` in that record's own scope: its stored fields, then
  the sheet. A binding that names no field keeps sheet scope and today's
  behaviour, so every existing layout means what it meant.
- **The per-record amount and field targeting ship together**, because a
  per-record `to` is unsafe until a binding names its field. The acceptance case is
  Channel Divinity's one use back (`Uses + 1`).
- **The design is modelled on Table's `resetColumns`.** Record set declares its
  `number` and `toggle` fields as reset targets, and a binding names one of them.

What follows are the decisions that settlement leaves open, each with its
argument.

### Part 1: the field is named in `column`, and Record set answers `resetColumns`

The binding is written like this:

```json
{ "trigger": "Short rest", "column": "Uses", "action": "formula", "to": "Uses + 1", "where": "Recharges == 4" }
```

**The key stays `column`, although a Record set's parts are fields.** The Table
entry in §13 saw this coming and chose not to solve it early: "a second
component whose parts are not columns would persist them under a key that names
them wrongly, and renaming it then is a layout migration. Recorded rather than
pre-solved, because one reader is not a rule." There is now a second reader. It
still does not pay for a rename, for three reasons:

- **`column` has shipped since 0.3.0.** Renaming it means `parseBinding` accepting
  two spellings forever, or refusing every Table layout written since then.
  Refusing is not an option: a layout the parser refuses blanks every sheet on
  it. Accepting both spellings creates a second name for one key, and the editor
  would have to pick which one it writes.
- **A Record set field already is a column in every shared module.**
  `RecordField.type` is a `ColumnType`, the field list is drawn by the same
  `renderColumnsEditor` a Table's columns are, and `rowNamesOf` reads both through
  the `columns` config kind. The word matches the code the key is read against.
- **Nobody sees the key who does not also read the file.** The editor row is
  **Acts on**, and the entries carry the component's own labels. The confirmation
  shows `Uses`, not `column: Uses`.

**`resetColumns` and `ResetColumn` keep their names for the same reason.** They
are internal and could be renamed at no cost to a file, but a second noun for one
thing is the drift that cost is meant to prevent. The doc comments stop claiming
"a Table column, and nothing else today".

**What Record set offers.** Its `number` and `toggle` fields. `computed` stores
nothing, `modifier` holds words, and `text` is refused by the component anyway.
`level` is left out, on the ground the Table entry already recorded: a rest
restoring a graded level has no reading in any system anyone can name. Record set
already leaves a `level` field alone under every action. Two refusals are
declared per entry, with the component's own sentence, exactly as Table does:

- a **field-owned** `number` with no `max` refuses `full`;
- a field under `maxSource: 'record'` refuses nothing. A record with no ceiling
  of its own is skipped, not failed, as `per-record-ceiling.md` built it.

**One list, two readers**, as on Table. `applyReset` looks up a binding's
`column` in the same `resetColumnsOf(config)` the editor draws its picker from, so
the two cannot disagree about which fields are eligible or about why one refuses
an action.

### Part 2: a binding naming no field still means every field, and the component says so

The owner's settlement keeps a binding with no `column` on a Record set writing
every `number` and `toggle` field. On Table the same absence is an error: "this
trigger does not say which column to act on". That makes two components
declaring `resetColumns` that read a missing `column` in opposite ways. **The
layout editor has to know which reading applies**, or it will draw **Nothing yet**
with an error over a Record set binding that works exactly as its author wrote
it.

**The contract grows one optional member, deliberately:**

```ts
/**
 * What the Acts on picker calls a binding that names no part, on a component
 * that reads one as the whole of itself (SPEC §6). Absent: a binding naming no
 * part acts on nothing, and the editor asks for one.
 */
resetWhole?: string;
```

Record set declares `resetWhole: 'Every field'`. Table declares none. Declaring it
obliges `resetColumns` [checked, `contract.test.ts`], because without a picker
there is nowhere to offer it.

It passes §4.1's rule for an optional member. The alternative would be
`src/editor/` knowing that a Record set treats absence as the whole list while a
Table treats it as a mistake, which is the component's behaviour written into the
editor. Two other candidates were rejected:

- **A reserved entry in `resetColumns`**, such as a `*` key. It would put a new
  spelling into the file for a meaning the file already expresses by leaving the
  key out. Every existing layout would then have two ways to say "every field".
- **A boolean member, with the label composed by the editor.** The editor would
  have to write "Every field" or "Every column", which is exactly the naming of
  a component's kind that `resetColumns` exists to avoid. The string belongs to
  the component, as a `ResetColumn`'s `label` does.

**"Every field" stays a real choice, not a legacy marker.** On a list where every
field is a counter, "refill all of it" is what the author means. Offering it only
where it is already selected would make it a one-way door. What changes is the
default: **Add reset** now gives a Record set binding the first field it can name
rather than every field (see **Design**).

### Part 3: what a binding naming a field writes

That field, and only that field, of each record the binding reaches. Every other
field of a reached record, and every field of an excluded one, is left out of the
delta, so its bytes are identical after the press.

| Action | `number` field | `toggle` field |
| --- | --- | --- |
| `empty` | 0, held to the field's bounds, ceiling kept (`Uses: 0 / 3`) | `no` |
| `full` | the field's `max`, or the record's own ceiling under `maxSource: 'record'`; a record with none is skipped | `yes` |
| `formula` | `to` worked out on this record (Part 4), held to whichever ceiling applies | `to` worked out on this record, read as a flag at 1 and above |

These are the per-field rules a binding naming no field already applies to every
field, restricted to one. **One writer, `fieldWrite`, for both readings**,
found missing in structural review and added: the draft above let the
named-field path restate `resetWrite`'s per-field arithmetic — empty writes
zero, full reads the ceiling, formula derives the flag from the amount — as a
second copy that only a test driving both could have caught disagreeing. Every
write still goes through the join, so a reader-set ceiling survives
(Tidy5e 733). **`full` fails only on the named field.** Today a `full` binding
fails if *any* field-owned `number` field lacks a `max`, which is why a DC with no
maximum blocks refilling `Uses`. A binding naming `Uses` is not blocked by the DC.
A binding naming the DC refuses `full` through `refuses`, with the sentence
`resetWrite` already composes.

**A named field that is not offered fails the binding and writes nothing.** There
are two cases, told apart as Table tells them apart:

- the key is declared but is not a `number` or `toggle` field:
  `the field "Recharges" holds no value a trigger can restore. Point this trigger at a number or toggle field instead.`
- the key is not declared at all, for example after a key rename:
  `this list has no field called "Uses". Point the trigger at one it has, or remove the binding.`

**A key rename does not rewrite `column`.** Table does not rewrite it either, and a
key rename rewrites no `where` or `to` (the `visibleWhen` ruling). The editor
shows the stored name with `(missing)` and an error line. The press fails and names
it. Nothing is written. That is the recoverable direction.

### Part 4: a named field's `to` is worked out on each record

**Per reached record, in that record's own scope**: the stored layer
(`storedLayer`), then the sheet, and never a computed field. This is the grammar
`where` and `visibleWhen` already use, and `storedLayer` exists to be their one
spelling. It is resolved only on records `where` admits, after `where` has been
worked out on every readable record. `Uses + 1` reads `Uses` as the value half of
the entry, so `0 / 2` reads as 0 and writes `1 / 2`. A blank reads as the language
reads a blank (`typed-value.ts`).

**It fails closed and whole, in the shape of Part 2 of the scope spec.** If `to`
cannot be worked out on any reached record, whether because a name is unknown,
the text will not parse, or the result is not a number, the binding writes
nothing on that list. The sentence names the first record and how many failed:

`its reset formula could not be worked out on "Rage", so it resets none: Unknown name "Charges". Fix it under Resets to in the layout editor.`

The count-and-first-record phrasing `admittedRecords` builds for `where` becomes
one private helper that both sentences call. Two copies of it could only drift,
which is §1's one-step tier.

**A binding naming no field is untouched.** Its `to` is still resolved once, with
an empty scope, before any record is looked at. That is the owner's rule that
existing layouts mean what they meant.

**The editor has to know when `to` reads the record, and it reads that from
declarations already present, not a new member.** The rule is: a binding that
names a part, on a component that declares `reset.*.where`, works out `to` in that
part's scope. Both halves are needed. Declaring `reset.*.where` is the component
saying it has per-part scopes to evaluate in, and naming a part is the settled
trigger for using one. One predicate in `types.ts`, `resolvesResetPerPart(component,
binding)`, is the only spelling. Two things read it: the **Resets to** row, for its
suggester owner and description, and the reorder Notice's scope for `to`.
`contract.test.ts` holds the component to it: every component that declares both
`reset.*.where` and `resetColumns` is driven over its `example` with a binding
naming its first part and a `to` reading that part's key, and the resolver must see
a non-empty scope. Today that is Record set alone. **Table is not affected**: it
declares no `reset.*.where`, so its column `to` stays once, in sheet scope. If a
condition ever narrows a Table column to some rows (open in §13), per-row `to`
follows from this rule rather than needing a new one, and that question stays open.


### Part 5: two bindings on one trigger

**This answers the question the scope spec's Part 5 left to this follow-up, and
the owner chose the smallest answer.** Naming a field makes the existing refusal
a refusal *per field*. It does not make it depend on `where`. The rule, on one
Record set and one trigger:

- **Two bindings naming the same field are refused, whatever their `where`s say.**
  This is today's refusal. `bindingKey` is already the trigger and the `column`
  together, so once a binding names a field the key is that field. The parser,
  `bindingKey` and `parseReset` do not change. `where` is still not part of a
  binding's identity, for the reason the scope spec gave: whether two conditions
  overlap depends on the data.
- **Two bindings naming different fields are legal**, whatever their `where`s say,
  because their writes never meet. "Clear `Used`, refill `Uses`" on one Long rest
  is two bindings. `bindingKey` already allows it.
- **A binding naming no field beside one naming a field is refused, whatever
  their `where`s say.** **Every field** includes the named field, so the pair is
  two bindings writing `Uses` on one trigger: the same-field duplicate, reached by
  another route.

**The third rule is one `bindingKey` cannot see**, because the two keys differ:
`["Short rest", null]` and `["Short rest", "Uses"]`. So it needs one predicate
of its own, and a decision on where it is enforced.

**Not in the parser, because the parser cannot know which components mean it.**
Whether a missing `column` means "the whole list" or "nothing yet" is the
component's answer (`resetWhole`, Part 2). `src/parse/` imports no registry, and
the scope spec's Part 4 draws the same line for `where`. A component-agnostic
parser rule, "no binding without a `column` beside one with a `column` on one
trigger", would reach components this rule is not about:

- **A Table.** Such a layout loads today. It renders, and at the press the
  column-less binding fails with "this trigger does not say which column to act
  on" while the column binding applies. The editor never writes a column-less
  Table binding. But a hand-written layout can hold one, and the parser has
  accepted it since 0.3.0. **A parse refusal would blank every sheet on that
  layout.** That consequence is real, so the parser is not where this rule goes.
- **A Pool or a Track carrying a stray `column`.** The same: it loads today, and
  would stop loading for a key the component ignores.

**Enforced where the component's declaration can be read, and nowhere a layout
that loads today would stop loading.** `types.ts` gains one predicate beside
`checksResetCondition`:

```ts
/**
 * Whether two bindings on this component would both write one part: the same
 * trigger-and-column pair, or, on a component that reads a binding naming no part
 * as the whole of itself, one naming no part beside one naming a part.
 */
export function claimsSamePart(
	component: Pick<ComponentDefinition, 'resetWhole'> | undefined,
	a: ResetBinding,
	b: ResetBinding,
): boolean;
```

It is the only spelling, on §1's one-step tier for a predicate. **`bindingKey`
moved here too, beside it**: the draft above kept it in `parse/layout.ts` on the
argument that `types.ts` importing it back would be a cycle, and structural review
found that argument false — `types.ts` imports nothing, and `bindingKey` is a
pure one-liner of `ResetBinding`. `claimsSamePart`'s same-key half now calls it
directly instead of restating its comparison, and `parse/layout.ts` imports it
from here. The two could otherwise only be tested for still agreeing, which is
exactly what §1's one-step tier forbids. Three places read `claimsSamePart`:

1. **The editor's duplicate guard.** The trigger dropdown and **Acts on** refuse a
   change that would make two bindings claim one part. The change is put back
   inline, as today.
2. **Add reset's availability.** On a component declaring `resetWhole`, a trigger
   is offered only when no binding on it names no part and some offered part has
   no binding on it. The new binding takes the first such part.
3. **The plan, at the press.** `planTrigger` checks the bindings of one component
   against each other before any of them is handed to `applyReset`. Each binding
   in a claiming pair fails, and nothing is written. This is the scope spec's
   Part 4 shape: a component-level refusal decided from a declaration, recorded as
   a failure, and shown in the confirmation while **Cancel** is still available.
   A same-key pair never reaches this check, because the parser has already
   refused it.

**Both bindings fail, not the later one**, because failing the later one would
make file order decide. Each gets its own sentence, framed as a `ResetResult`
error continuing `<label> — `, so the confirmation does not print one sentence
twice. The plan takes the **Every field** wording from the component's
`resetWhole` and the field's label from its `resetColumns`, so it composes the
sentence without learning what a field is. **Neither sentence says "field"**: the
plan is shared by every component that can declare `resetWhole`, and a Table's
parts are columns rather than fields, so the fix names no noun at all —
"something else" rather than "another field", found in structural review:

- the binding naming no part:
  `its Every field reset on this trigger includes "Uses", which another reset on this trigger names, so neither applies. Point one of them at something else, or remove one.`
- the binding naming the part:
  `another reset on this trigger covers Every field, which includes "Uses", so neither applies. Point one of them at something else, or remove one.`

**Table is untouched**, because it declares no `resetWhole`. Its column-less
binding beside a column-naming one loads, and fails at the press with its own
sentence while the other applies, exactly as today.

**Did any layout that loads on release/0.5.0 stop loading? No.** The parser is not
changed at all. The earlier draft's claim that "the parser only relaxes" is
withdrawn: it does not relax, it stays as it is. **Two hand-written Record set
layouts that load today now mean something different**, and both changes make a
problem louder, not quieter:

- **A Record set binding that already carries a stray `column`.** On
  release/0.5.0 Record set ignores the key and writes every field. The editor
  never wrote one, because Record set drew no **Acts on** row, so only a
  hand-edited or hand-copied binding carries one. After this change the key names
  a field. If it is offered, only that field is written. If it is not, the press
  fails naming it and the editor shows it as `(missing)`.
- **Such a binding beside a column-less one on the same trigger.** Today the
  parser accepts the pair, since the keys differ, and both bindings write every
  field, the second one winning without saying so. After this change the pair
  loads, the plan refuses both at the press, and the editor reports it on open.

The release notes state both.

**What this leaves unwritable, stated plainly: the mixed short rest on one
field.** "Refill `Uses` where `Recharges == 1`, and give one `Uses` back where
`Recharges == 4`" is two bindings on one trigger naming one field, and it stays
refused. What *is* writable is one binding, `formula` with `to: 'Uses + 1'` and
`where: 'Recharges == 1 || Recharges == 4'`. That covers a list where every
short-rest feature holds one use, because one back is then a refill, held to the
ceiling. The harness sample is written that way on purpose. A short-rest feature
holding more than one use would get one back, not all of them. Two routes to the
full case are named and deferred under **Deliberately not doing**.

**`ResetReach` keeps its shape**: `{ reached, of }`. Nothing compares two reaches.

**The cross-version cost.** 0.4.x knows `column` but Record set there declares
no `resetColumns`. So in 0.4.x a 0.5.0 layout loads, its Record set bindings write
every field again, and a `to` reading a record key (`Uses + 1`) fails at the
press as an unknown name. This is quieter than a refusal, and it is the release
notes' to state. It is not mitigated.

### Part 6: level positions

A named field's `to` can read a level by position (`if(Recharges == 4, …)`), just as
a `where` can. **The reorder Notice's `resetsReading` counts a binding's `to`
wherever `resolvesResetPerPart` would hold**, and asks the predicate exactly, not
an approximation of it: `list-fields.ts` already reads `record.type` to draw the
rest of the field, so looking the definition up through `getComponent` and calling
`resolvesResetPerPart(definition, binding)` costs one registry import rather than
teaching this module a component's declarations by hand. The earlier draft of this
paragraph accepted a false positive from approximating the predicate as "names a
`column` and its `action` is `formula`"; that draft is superseded, and the false
positive does not exist. The Notice's reset clause names the row to check: **Only
where**, **Resets to**, or both. This keeps the Notice's existing contract true: it
names the resets that read this key by position. The `docs/BACKLOG.md` row about
extending the Notice to every level list is a different question and is untouched.

### What it publishes, stores, and does to existing files

- **Publishes:** nothing. No name, and no change to `scopeValues`, `scopeRows` or
  `scopeModifiers`.
- **Stores:** nothing new in the layout. `column` is an existing key, now
  meaningful on one more component. The character note is untouched in format. A
  reset writes the same fence entries it wrote before, for one field instead of
  all of them.
- **Existing layouts** parse to the same objects, byte for byte. The parser is
  unchanged, so every layout that loads today still loads. The editor never wrote
  a `column` on a Record set, so every such layout also means what it meant: a
  binding with no `column` writes every field, with `to` in sheet scope. The two
  hand-written exceptions are in Part 5.
- **Existing notes:** untouched until a trigger is pressed. Constraint 4 is not
  reachable: a reset never adds, removes or renames a record or a field.
- **Constraints 1, 2, 3 and 5.** `to` goes through the one parser (1). It is
  layout text and writes no markdown (2). `read` and `write` do not change, so the
  note's round trip is untouched (3). `src/parse/` and `src/formula/` gain nothing
  (5).

## What it does

A layout author points a Record set's reset at one field under **Acts on**.
**Short rest** gives one `Uses` back with `to: 'Uses + 1'`, worked out on each
record `where: 'Recharges == 1 || Recharges == 4'` admits. **Long rest** refills
`Uses` with `full`. `Save DC` is never written by either. The confirmation reads
`Rest features — Uses 3 of 6`. A binding that names no field reads **Every
field** and behaves exactly as before. One trigger may reach several fields, one
binding each. It may not reach one field twice, and it may not reach **Every
field** beside a field.

## Smallest version

The owner chose this version, and it is the design above:

- Record set answers `resetColumns` and `resetWhole`. A binding naming a field
  writes only that field, and its `to` is worked out on each record it reaches.
- Per field, one binding per trigger. The same field twice stays refused by the
  parser, and **Every field** beside a field is refused by `claimsSamePart` in the
  editor and at the press.
- **Acts on** on a Record set, with **Every field**. **Resets to** reads the
  record.

It gives up:

- the mixed short rest on one field (both deferred routes are in **Deliberately
  not doing**);
- renaming `column`, and rewriting it on a key rename;
- `level` fields as targets.

## Design

**Nothing changes on the sheet.** As before, a binding is a fact about the layout,
not a state of the data. The two surfaces that change are the confirmation and the
editor's reset field.

### The confirmation

The modal is unchanged in structure. In `resetSummary`, a successful binding that
names a part contributes that part's label, followed by its reach where it reports
one:

| Planned outcome | Item |
| --- | --- |
| Record set, no field, no `where` | `Recharging features, unheaded` (unchanged) |
| Record set, no field, with `where` | `Rest features — 2 of 5` (unchanged) |
| A binding naming `Uses`, with `where` | `Rest features — Uses 3 of 6` |
| Bindings naming `Used` and `Uses` | `Rest features — Used 2 of 6, Uses 3 of 6` |
| Table, two columns, no `where` | `Conditions — Active, Uses` (unchanged) |
| **Every field** beside `Uses` | `Rest features — will not reset: its Every field reset … another reset …` (both sentences) |
| `Uses` fails, `Used` applies | `Rest features — Used; Uses will not reset: …` |

- **One binding per part per trigger**, so a count is that binding's own. Nothing
  is summed.
- **A part with no reach is its bare label**, as Table's columns are today.
- **A binding naming no part** gives the bare count or the bare label as today. It
  is not relabelled **Every field**, so every existing layout's confirmation reads
  as it did.
- Parts are joined by `, `, and refusals follow after `; `, as today.

### The layout editor's reset field

**Acts on is drawn for a Record set**, because Record set now declares
`resetColumns`. It is the existing row, with one addition and a copy change:

- **An Every field option** wherever the component declares `resetWhole`, first in
  the list and labelled with the component's string. Selecting it deletes
  `column`. A binding with no `column` shows it selected, with no error. The
  **Nothing yet** sentinel and its error stay for a component that declares no
  `resetWhole`, which is Table.
- **The row's words stop saying "column"**, since the row now serves two
  components and the editor must not name a component's kind:

  | Where | Today | Becomes |
  | --- | --- | --- |
  | Description | Which column this trigger acts on. Cells in every other column are left exactly as they are. | What this trigger acts on. Everything else is left exactly as it is. |
  | Missing part | …Choose one of the columns it does, or this trigger resets nothing. | …Choose one it does, or this trigger resets nothing. |
  | Nothing offered | …Add a column it can act on, or remove this binding. | …Give it a number or toggle to act on, or remove this binding. |
  | Duplicate, same part | This component already resets that column on that trigger. | This component already resets "Uses" on Short rest. |
  | Duplicate, whole and part | (none) | Choosing a field when **Every field** holds the trigger: Another reset on Short rest covers Every field, which includes "Uses". Choosing **Every field** when a field holds it: Another reset on Short rest names "Uses", which Every field includes. Both continue, so neither applies when it is pressed. Point one of them at something else, or remove one. |
  | Add reset, all taken | This component already resets every column on every trigger. | This component already resets everything it offers on every trigger. |

  "Number or toggle" comes from the shared column-type vocabulary
  (`column-types.ts`). It is not a component's noun.
- **A claiming pair already in the file**, which only a hand edit can produce, is
  reported when the form opens. The report goes on both bindings' **Acts on**
  selects through `showFieldError`, and nothing is written, in the same
  whole-beside-part clause the edit guard refuses with — one composition for
  both, so the two surfaces cannot describe one pair two ways. On the binding
  naming no field: "Another reset on Short rest names \"Uses\", which Every
  field includes, so neither applies when it is pressed. Point one of them at
  something else, or remove one." On the binding naming the field: "Another
  reset on Short rest covers Every field, which includes \"Uses\", so neither
  applies when it is pressed. Point one of them at something else, or remove
  one."
- **Order and focus tokens are unchanged**: **Acts on**, then **Only where**, then
  **Resets to**. Scope reads before amount.

**Resets to**, for a binding where `resolvesResetPerPart` holds:

- The suggester is bound with the component as owner, so the record's own keys
  come first, as they do under **Only where**.
- The description reads: "Formula giving the value to restore, worked out
  separately for each entry this trigger reaches, reading that entry's own values
  first." The example is `<column> + 1`, built from the binding's own field key
  (`Uses + 1`), in a code element. The word is "entry" because the editor must not
  say "record".
- Validation is unchanged: `resetToProblem`, which checks parsing only. An unknown
  name is a claim about data, and the press reports it.

**Add reset** on a Record set gives the new binding the first offered field that no
binding on the trigger names, and never a trigger that holds an **Every field**
binding (Part 5). The action is `full`, as today.

### Empty and error states

- **A Record set with no `number` or `toggle` field**: **Acts on** offers **Every
  field** alone, and such a binding writes nothing. Nothing is reported, which
  matches today.
- **A named field that is gone or not eligible**: shown as `Uses (missing)`, with
  the error line under it. The press fails with Part 3's sentence.
- **`full` on a number whose maximum is set on the field and is missing**: the
  field's own refusal appears under **Acts on**, and the press fails naming the
  field.
- **A `to` that cannot be worked out on a record**: the press fails naming the
  record (Part 4). The editor shows only parse errors, as today.
- **Every field beside a field**: the editor refuses to make the pair. A
  hand-written one is reported when the form opens and refused at the press.
- **No records**: `Uses 0 of 0` where the binding has a `where`. Nothing is written.

## Config fields

`reset` is not a config field and may not become one (`RESERVED_KEYS`), so this
adds no entry to any component's `configFields`. For the record, the controls it
changes:

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `reset.*.column` | select, drawn by `reset-field.ts`; on Record set, absent is **Every field** | Acts on | What this trigger acts on. Everything else is left exactly as it is. |
| `reset.*.to` | text input, a formula | Resets to | For a Record set binding that names a field: Formula giving the value to restore, worked out separately for each entry this trigger reaches, reading that entry's own values first. For example: `Uses + 1`. Otherwise unchanged. |

Record set's `formulaFields` is unchanged. `reset.*.to` is already declared there,
and the resolver already accepts a scope.

## Data and file model

**The layout:** no new key, and no parser change. `parseBinding` carries `column`
as it does today, so a Record set binding that names a field round-trips
byte-identically through `parseLayout` and `serialiseLayout`. `parseReset` goes on
refusing a repeated `bindingKey`, which now covers the same field twice on one
trigger.

**The note:** no new key, section, fence entry or byte shape. `applyReset` returns
a `RecordSetData` delta holding one entry for each record the binding reaches: the
named field. `write` is untouched, and `applyDelta` rewrites only the keys in the
delta, so every other fence line of a reached record keeps its bytes. Two bindings
on one trigger naming *different* fields compose through `applySectionWrites`,
the second `write` reading the body the first produced. That is the precedent
Table's two columns set.

**The view:** `planTrigger` gains the `claimsSamePart` check before `applyReset`,
in `reset-plan.ts`. `resetSummary` puts a part's count beside its label. Undo is
untouched: it is still one write, with the note text from before it kept.

**The contract:**

- `ComponentDefinition.resetWhole?: string`, placed after `resetColumns` in
  `MEMBER_ORDER` and in PATTERNS §3.
- Two predicates in `types.ts`, `resolvesResetPerPart` and `claimsSamePart`.
- `ResetReach` and `ResetBinding` keep their types. The doc comment on `column`
  stops saying "a Table column, and nothing else today".

**Paste and id rename:** `column` travels with the copied config. A named field's
`to` reads the record's own keys, and `localNames` already skips those for every
expression on the component, so `Uses` in `Uses + 1` is never rewritten as an id.
A test holds this (below).

## Acceptance criteria

### Held by tests

The component tests use the scope spec's list: `Recharges` (a level), `Uses`
(`maxSource: 'record'`) and `DC` (`max: 20`), plus a `Used` toggle. No case can
then pass just because the list avoids the shape where writing every field
shows.

- [x] **No field, no change.** Every existing `recordSet.applyReset` case, and
      every case under "a reset that reaches only the records its condition
      admits", passes unchanged for a binding with no `column`. That includes the
      assertions that `DC` is written. They are relabelled as the no-field
      reading, and their comments stop calling it a defect waiting for a
      follow-up. (`record-set.test.ts`)
- [x] **A named field is the only field written.** With `column: 'Uses'`:
      - `full` refills `Uses` to each record's ceiling;
      - `empty` writes `Uses: 0 / 3`;
      - `formula` with `to: '2'` writes 2, held to the ceiling.

      `DC` and `Used` are byte-identical, and so is every record outside the
      delta. The same three with `column: 'Used'` write only the flag. `formula`
      derives it from the number, so `to: '0'` writes `no`. (`record-set.test.ts`)
- [x] **`full` fails only on the named field.** With `DC` declaring no `max`, a
      `full` binding naming `Uses` succeeds. One naming `DC` fails with the
      field's own refusal and writes nothing. (`record-set.test.ts`)
- [x] **A field that is not offered.** `column: 'Recharges'` (a level) and
      `column: 'Gone'` each fail with Part 3's two different sentences and write
      nothing. So does a binding with a stray `column` naming a key the list lacks.
      (`record-set.test.ts`)
- [x] **`to` in the record's scope.** With a spy on the resolver, a `formula`
      binding naming a field resolves `reset.to` once per admitted record, each
      time with that record's stored layer, and never with an empty scope.
      `Uses + 1` takes `0 / 2` to `1 / 2`, and `1 / 1` stays `1 / 1`. A binding
      naming no field still resolves `reset.to` exactly once, with an empty scope.
      (`record-set.test.ts`)
- [x] **`to` fails whole.** A `to` on a named field that names an unknown key, and
      one that comes to something other than a number on one record of five, each
      return `ok: false`. The error names the first record and the count, the fix
      names **Resets to**, and no record is written. `where` is worked out first,
      so a broken `where` reports the `where` sentence even when `to` is broken
      too. (`record-set.test.ts`)
- [x] **`resetColumns` and `resetWhole`.** Record set offers its `number` and
      `toggle` fields by label, and never a `level`, `computed` or `modifier`
      field. A number whose maximum is set on the field and missing refuses
      `full`. A number whose ceiling is set per record refuses nothing.
      `resetWhole` is `Every field`. (`record-set.test.ts`)
- [x] **The parser is unchanged.** Two bindings on one trigger naming one `column`
      are refused with no `where`, with a `where` on one, and with different
      `where`s on both. Different columns are carried. A binding without a
      `column` beside one with a `column` on one trigger is carried, for a Record
      set and a Table alike. A layout carrying a field-naming Record set binding
      round-trips byte-identically. (`layout.test.ts`)
- [x] **Every field beside a field, at the press.** A Record set holding a Short
      rest binding with no `column` and one naming `Uses` is not handed to
      `applyReset` for either (a spy), whether or not either binding carries a
      `where`. Each fails with its own sentence, and the section is
      byte-identical. A third binding on the same trigger naming `Used` still
      fails, since `Used` sits inside **Every field** too. A Long rest binding on
      the same list still applies. (`reset-flow.test.ts`, driving `planTrigger`)
- [x] **The pair fails whole at the press, whatever the two `where`s say.**
      Neither the Every field binding nor the field binding writes anything, and
      the plan's edits hold nothing from either. This holds with no `where` on
      either, a `where` on one, and a `where` on both. (`reset-flow.test.ts`)
- [x] **The confirmation names the refusal before Apply.** For that pair, the
      confirmation opened from the plan lists Rest features as not resetting,
      with both sentences, before **Apply** is pressed. **Cancel** leaves the note
      byte-identical. (`reset-confirmation.test.ts`, `reset-flow.test.ts`)
- [x] **Table is untouched by that rule.** A Table holding a column-less Long rest
      binding beside one naming `Active` loads. At the press the column-less one
      fails with "this trigger does not say which column to act on", and `Active`
      is cleared. (`reset-flow.test.ts`)
- [x] **`claimsSamePart`.** It is true for one trigger-and-column pair, and for no
      column beside a column on a component declaring `resetWhole`. It is false
      for that second case on a Table, and false for two different columns.
      (`types.test.ts`, or wherever `checksResetCondition` is tested)
- [x] **The confirmation.** `resetSummary` gives:
      - `Rest features — Uses 3 of 6` for a conditioned binding naming a field;
      - `Rest features — Used 2 of 6, Uses 3 of 6` for two fields;
      - `Rest features — 2 of 5` and the bare label for bindings naming no field,
        as before;
      - `Conditions — Active, Uses` for Table, as before;
      - both sentences for an **Every field** beside a field, each once.

      (`reset-confirmation.test.ts`)
- [x] **The editor.** (`reset-field.test.ts`)
      - **Acts on** is drawn for a Record set binding. Its options are **Every
        field**, then the offered fields.
      - A binding with no `column` selects **Every field** with no error, and
        opening the form writes nothing.
      - Choosing a field writes `column`, and choosing **Every field** deletes it.
      - A Table binding with no `column` still shows **Nothing yet** and its
        error.
      - The row's new wording appears on both components, and "column" appears in
        none of it.
      - On a Record set, choosing through **Acts on** or the trigger dropdown
        anything `claimsSamePart` refuses is refused inline and put back:
        - a field another binding on the trigger names;
        - **Every field** beside a field;
        - a field beside **Every field**.
      - A hand-written claiming pair shows the report on both **Acts on** selects
        when the form opens, and nothing is written.
      - **Add reset** on a Record set gives the first field that no binding on
        the trigger names. It offers no trigger held by **Every field**, and it
        never gives a pair `claimsSamePart` refuses.
      - **Resets to** on a Record set binding that names a field binds the
        suggester with the component as owner and shows `Uses + 1`. On a Table
        binding it does neither.
- [x] **The reorder Notice.** On a Record set whose Short rest binding names
      `Uses` with `to: 'if(Recharges == 4, Uses + 1, 0)'`, reordering `Recharges`'
      names raises one Notice naming Short rest and **Resets to**. A `to`
      naming `Recharges` on a binding that names no field adds no clause, as
      before. (`level-reorder.test.ts`, `list-fields.test.ts`)
- [x] **Registry contract.** (`contract.test.ts`)
      - Declaring `resetWhole` obliges `resetColumns`.
      - A component declaring both `reset.*.where` and `resetColumns` resolves a
        part-naming `to` with a non-empty scope over its `example`.
      - At least one registered component declares `resetWhole`, and at least
        one that declares `resetColumns` does not.
- [x] **Paste.** A pasted Record set keeps `column: 'Uses'` and `to: 'Uses + 1'`
      verbatim, even where the paste renames a copied component whose id is
      `Uses`. (`paste.test.ts`)
- [x] `npm test`, `npm run lint` and `npm run build` pass, and `styles.css` matches
      `src/styles/`.

### Held by looking (`npm run harness`, then `npm run harness:shot`, then `/design-review`)

**`rest_features` in `harness/samples.ts` changes in place.** It gets no new
placement, so `SHEET_FRAME` does not move:

- `Recharges` gains a fifth level, `One back` (position 4). It is
  appended, so no existing position moves.
- A sixth record, **Channel Divinity**: `Recharges: 4`, `Uses: 0 / 2`, `DC: 14`.
- **Two bindings, one per trigger, both naming `Uses`:**
  - **Short rest**, `column: 'Uses'`, `formula`, `to: 'Uses + 1'`,
    `where: 'Recharges == 1 || Recharges == 4'`
  - **Long rest**, `column: 'Uses'`, `full`,
    `where: 'Recharges == 1 || Recharges == 2 || Recharges == 4'`
- The comment says the DC is there on purpose, and that it is now what the write
  leaves alone. It also says Short rest is one binding because Second Wind and
  Action Surge each hold one use, so one back is a refill. A short-rest feature
  with more uses would need the deferred mixed rest.
- `state=broken` rewrites `Recharges` to `Recharge` in the Short rest `where`, the
  rename trap as before.

**`recharging_plain` gains one binding that names no field**,
`{ trigger: 'Long rest', action: 'empty' }`, as the sample of **Every field**.

- [x] **`sheet-reset-confirm`** and **`-dark`** (`confirm=Short rest`): `Rest
      features — Uses 3 of 6`, beside the other Short rest items in their existing
      words. Legible in both themes.
- [x] **`sheet-reset-confirm-long`**: `Rest features — Uses 4 of 6`, and
      `Recharging features, unheaded` as a bare label.
- [x] **`sheet-reset-confirm-broken`**, **`-narrow`**, **`-narrow-broken`**: the
      broken sentence wraps inside the modal, and the buttons stay reachable.
- [x] **`editor-reset-where`**, **`-dark`**, **`-large-text`**
      (`open=rest_features`): each binding reads as one block. That is the trigger
      and action, then **Acts on** showing `Uses`, then **Only where**, then, on
      Short rest, **Resets to** with `Uses + 1`.
- [x] **`editor-reset-every-field`** and **`-dark`** (new, `open=recharging_plain`):
      **Acts on** shows **Every field** selected, with no error.
- [x] **`editor-reset-column`** and **`-dark`**: Table's **Acts on** reads the new
      description, and nothing else moves.
- [x] **Existing shots that move, and only these**: the shots above, the sheet
      shots whose frame shows `rest_features` (one more record, in a list that
      scrolls), and any editor shot whose tree lists the samples' rows. The build
      lists every PNG that changed and gives the reason. A shot that moved for any
      other reason is a finding. **Before building, run the full shot set once
      from a clean `npm run harness` and keep it as the baseline.** The scope spec
      lost this comparison to a partial run.

### The throwaway vault fixture

The vault is `~/Developer/sheetsmith-test-vault/`. It lives outside the
repository, so its recipe lives here (`AGENTS.md`).

**In `Sheetsmith layouts/Record variations.sheetsmith`, `rest_features`:**

- `Recharges` gains `One back` as its fifth level, appended.
- Its bindings become the harness's two.
- `recharging` is unchanged. Its Long rest binding has no `column` and no `where`,
  and it is the control: **Every field**, reaching every record.
- `ki` is unchanged: it is the Part 4 case.

**In `Characters/Records.md`, under `## Rest features`:**

- Add `### Channel Divinity` with `Recharges: 4`, `Uses: 0 / 2`, `DC: 14` and a
  line of prose.
- First, put the existing five back to the harness's values: `Save DC 13` on
  Second Wind, and no DC entry on Action Surge. The scope spec's recipe left them
  at 20, which is the defect this work fixes.

**Press:**

- **The short rest.** Spend Second Wind and Action Surge to `0 / 1`, then press
  **Short rest**. The confirmation lists `Rest features — Uses 3 of 6`. Apply.
  - Second Wind and Action Surge read `1 / 1`, and Channel Divinity reads `1 / 2`.
  - **Second Wind's DC is still 13, Action Surge still holds no DC entry, and
    Channel Divinity's DC is still 14.** Diff `Records.md`: only three `Uses:`
    lines changed.
- **One back, not all.** Press **Short rest** again. Channel Divinity reads
  `2 / 2`, and Second Wind stays `1 / 1`, held to its ceiling. Press once more:
  nothing moves.
- **The long rest.** Spend Rage to `0 / 3` and Channel Divinity to `0 / 2`, then
  press **Long rest**. The confirmation reads `Uses 4 of 6`. Both are full, and
  every DC is unchanged.
- **The pair rule in the editor.** Open `rest_features` and press **Add reset**.
  It gives a Short rest binding on `Save DC`, which is the free field.
  - Set its **Acts on** to `Uses`: refused inline, and put back.
  - Set it to **Every field**: refused inline, and put back.
  - Remove the binding.
- **A hand-written pair.** In the layout file, add
  `{ "trigger": "Short rest", "action": "full" }` beside the Short rest binding.
  - The layout loads.
  - Opening `rest_features` shows the report on both **Acts on** rows.
  - **Short rest** says Rest features will not reset, with both sentences.
  - **Cancel**, and confirm that `Records.md`'s modified time did not move.
  - Remove the line.
- **The legacy control.** Open `recharging`: **Acts on** reads **Every field**,
  with no error. Press **Long rest**: it writes every field, as it always has.
- **The rename.** Rename the field `Uses` to `Charges`.
  - Every note migrates.
  - Both bindings show `Uses (missing)`.
  - **Short rest** says Rest features will not reset, naming the field.
  - Cancel and undo.
- **Undo.** After any press, **Undo** restores the note byte for byte.

## Commit boundaries

These are a plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. `feat: Name the field a Record set reset writes`. `ComponentDefinition.resetWhole`,
   its place in `MEMBER_ORDER` and its contract rule. Record set's `resetColumns`
   and `resetWhole`, and the named-field path in `applyReset` over all three
   actions, with `to` still resolved once. The no-field path is untouched. Tests
   in `record-set.test.ts`, `contract.test.ts`, and `layout.test.ts`'s
   parser-unchanged cases.
2. `feat: Work out a named field's reset amount on each record`. `to` per admitted
   record in its stored layer, the whole-binding failure, and the shared
   count-and-first-record helper. `resolvesResetPerPart` and its contract case.
3. `feat: Refuse every field beside one of its fields on one trigger`.
   `claimsSamePart` and the check in `planTrigger`, with its two sentences. Tests
   in `reset-flow.test.ts`, including the Table case left untouched.
4. `feat: Count a named field in a trigger's confirmation`. `resetSummary` putting
   a part's count beside its label. Tests in `reset-confirmation.test.ts`.
5. `feat: Choose the field a Record set reset writes in the layout editor`.
   **Every field**, the new wording, the **Resets to** owner and example, the guard
   and **Add reset** through `claimsSamePart`, and the report for a hand-written
   pair. Tests in `reset-field.test.ts`.
6. `feat: Report a level reorder a reset amount reads through`. `resetsReading`
   reading the `to` of a formula binding that names a column, and the clause
   naming its row.
7. `test: Photograph a reset that names its field`. `rest_features`,
   `recharging_plain` and the new `shot.mjs` views.
8. `docs: Record that a Record set reset names its field`. The owed edits:
   - **SPEC §4.1**: `resetWhole`.
   - **SPEC §4.2**, Record set, *Sheet view: reset*: a binding names a field or
     none. Say what each action writes to the named field, that a named field's
     `to` reads the record, and that **Every field** is today's reading.
   - **SPEC §5**: a named-field reset's `to` is a row-scope formula evaluated only
     by `applyReset`.
   - **SPEC §6**:
     - The first bullet's "a Table's column is the only one today" becomes Table's
       columns and Record set's fields.
     - The duplicate paragraph gains the third rule, **Every field** beside a
       field, and says where it is enforced and why not in the parser.
     - The "`where` is not part of a binding's identity" paragraph now names the
       mixed short rest on one field as still unwritable, with its two deferred
       routes.
   - **SPEC §7**: **Acts on** on a Record set with **Every field**, **Resets to**
     reading the record, and the Notice reaching `to`.
   - **SPEC §13**, under "How a reset trigger reaches only the records it applies
     to":
     - a `Resolved:` paragraph for the deferred half, which is `/land-it`'s own to
       write;
     - updates to the entry's "three questions" and "What the build found"
       paragraphs, so neither still describes writing every field as the only
       reading;
     - an update to its **What stays open**, which gains the mixed short rest on
       one field and its two candidate routes.

     The Table entry's "What stays closed" sentence on the noun is amended to
     record the second reader, and why the key stayed `column`.
   - **PATTERNS §3**: `resetWhole` after `resetColumns`.
   - **PATTERNS §8**:
     - "declaring `resetWhole` obliges `resetColumns`" [checked];
     - the per-part `to` rule [checked];
     - the `[judgement]` bullet stops listing Record set among the components that
       reset as one value.
   - **`docs/BACKLOG.md`**: remove the row "A Record set reset writes every
     `number` field of each record it reaches". It is closed.
   - **`docs/features/record-set-reset-scope.md`**: its **Deliberately not doing**
     deferral, and Part 1's "What `where` does not fix", gain a line pointing
     here. Writing every field is now the reading of a binding that names no
     field, not a defect with no way out. Part 5's pair question now has its
     answer here.
   - **The release notes**:
     - 0.4.x writes every field and fails a record-reading `to`;
     - a hand-written stray `column` on a Record set binding now names a field;
     - a hand-written pair of **Every field** beside a field is now refused at
       the press.
   - This document's status.

**The vault fixture belongs to no boundary.** What is committed is the recipe
above.

## Deliberately not doing

- **The overlap rule: two bindings on one trigger naming one field, told apart by
  their conditions.** The owner chose the smallest version, so what the first
  draft proposed is deferred whole:
  - such a pair would load where either binding carries a `where`, through a
    shared `collides` predicate relaxing `parseReset`;
  - the plan would compare the bindings' reaches and refuse both at the press
    wherever one record is reached by both, naming it;
  - `ResetReach` would carry which parts it reached (`parts: { at, label }[]`,
    replacing `reached`);
  - **Only where** would report a static overlap;
  - the confirmation and `plan.failed` would say an identical failure once;
  - it carries a cost: 0.4.x, which drops `where`, would refuse such a layout
    outright.

  The argument for it stands on record. The scope spec objected that each binding
  would have to evaluate its siblings' conditions. That stopped being true once
  the trigger was planned before it is confirmed, because overlap is then a
  comparison of finished results. It is the first route to the mixed short rest.
- **The second route to the mixed short rest: letting `to` read a record's
  ceiling.** With a name for the ceiling, one binding such as
  `if(Recharges == 4, Uses + 1, <ceiling>)`, where `where` admits both kinds,
  would refill one kind of record and give one back to the other. It needs no
  pair rule at all. It would publish a new name into record scope, and choosing
  its spelling is a model question of its own. Deferred, not built.
- **A record's ceiling as a name `to` can read.** Today `to` reads the value half
  (`2` for `2 / 3`). "Refill" is `full`, and "one back" is `Uses + 1` held to the
  ceiling, so the case this document builds needs no ceiling name. What a ceiling
  name *would* buy is the second route above, and it is deferred with it.
- **Whether a reset binding's `to` is a modifier target.** Deferred in SPEC §13
  and untouched. A named field's `to` is resolved through the same resolver, with
  `mod.self` meaning what it meant.
- **Whether a condition narrows a Table column's reset to some rows.** Open in
  SPEC §13, left open by the Table entry, and not reached. Table declares no
  `reset.*.where`, so Part 4's per-part `to` does not apply to it. Part 4 says what
  would follow if that question is answered yes.
- **Every other `docs/BACKLOG.md` row**, including the row about extending the
  level-reorder Notice to every level list and the `renderSheet` mirror row, even
  where this work passes near them. Part 6 keeps the existing Notice's own
  contract true and goes no further.
- **A budget of choices on a rest** (Daggerheart's downtime) and **dice
  recovery** (13th Age, `1d6` uses). These are out of scope. §5 has no dice.
- **Refusing Every field beside a field in the parser.** The parser cannot know
  which components mean it, and a component-agnostic rule would stop a Table
  layout that loads today from loading (Part 5).
- **Renaming `column`**, or giving the picker a noun specific to one component.
  Argued in Part 1.
- **Rewriting `column` when a field key is renamed.** It is reported, not
  migrated, as on Table.
- **`level` fields as reset targets.** Refused on the ground the Table entry
  recorded.
