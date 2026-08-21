# An aggregate over a table's rows

Status: shipped
Board card: ✨ An aggregate over a table's rows — a formula reaching into a table
and picking: sum this column, over these rows, where this predicate holds. The
first collection-valued thing in the formula language.

*The board card's last sentence is the one claim this spec rejects. Nothing here
is collection-valued, and §1 below argues why, because the alternative it names
is the load-bearing decision of the whole feature rather than a detail of it.*

## Model question

§13's **"Whether the formula language may aggregate over the rows a character
added, and what shape that takes"**, added by this diff so the question exists in
its own right before anything answers it. It was previously admitted only inside
two `Resolved:` entries that declined it while settling something else.

Seven questions have to be answered before any code. They are answered in order,
and each names what it costs.

### 1. Syntax: the language gains no collection

**The shape.** An aggregate is one builtin call whose first argument names a
component and whose remaining arguments are expressions evaluated once per row:

```
sum(<component>, <expression per row>, [<predicate per row>])
count(<component>, [<predicate per row>])
```

So the three cases the category is asked for, written out:

```
sum(inventory, Weight)                    # total weight
sum(inventory, Qty * Weight)              # encumbrance, which §13 refused
sum(inventory, Weight, equipped)          # the weight of what is carried
count(inventory, equipped)                # how many are equipped
```

`Value` stays `number | boolean | string`. No expression anywhere in the language
evaluates to a collection, before or after this feature.

**What the prior art converges on, and which half of it this takes.** The
convergent evidence makes two claims, not one:

1. **One expression beats a configured aggregation object.** Notion moved from
   the second to the first and said why; Dataview, CSB and modern spreadsheets
   (`SUM(FILTER(...))`) all sit on the first; nothing in the set moved the other
   way. Every tool that put the aggregate somewhere other than the expression
   language generated a documented workaround genre.
2. **The expression names a collection**, which some other expression then
   consumes: `sum(lookup(...))`, `sum(filter(rows, …))`,
   `map(…).filter(…).sum()`, `SUM(FILTER(…))`.

Claim 1 is taken without argument. It is what rules out the obvious alternative
here, which is a `filter` beside `total` in a column's config — the exact shape
Notion abandoned and the exact shape whose absence created its filtered-rollup
workaround genre. A predicate as a string, SUMIF's design, is not revisited; the
direction of travel across three decades is one way.

Claim 2 is declined, and the reason is specific to this codebase rather than a
preference. In every tool in the set the destination of a collection is a display
surface the tool owns: a spreadsheet cell, a Notion property, a Dataview view. In
Sheetsmith a `Value` has five destinations, and they are not display surfaces:

- `FieldResolver` returns one, and every component's `render` prints it on a
  card. A Pool's `max` is a formula field; so is a Track's `count`, a Stat
  group's `derived`, a Table's column formula.
- `ScopeEntry.value` and `ScopeValues` carry one into the sheet-wide name table.
- `coerceValue` produces one from anything a note holds.
- `applyReset` resolves `reset.*.to` to one and **writes it into the note**.
- The two `asNumber`/`asBoolean` gates are the only thing standing between an
  expression and all four of the above.

So widening `Value` does not put a collection into a cell that tolerates it. It
puts a collection one typo from `write`, and Constraints 3 and 4 — byte-identical
round-trip, and never losing character data — both live downstream of `write`. A
layout author who means `sum(filter(inventory, equipped))` and types
`filter(inventory, equipped)` into a Pool's `max` has written a Pool whose
maximum is a list, whose bar clamps against a list, and whose long rest restores
it to one. That is not a hypothetical: it is one missing `sum(` away, at the one
field on the sheet that both renders and persists.

Every guard the prior art offers is a guard against *that* reaching *there*, and
none of them is free:

| Guard | Cost here |
| --- | --- |
| A documentation warning (CSB) | The engine still does it. `lookup(…) + 5` returns a list, and a formula reading as arithmetic quietly returns one. |
| A runtime dispatch table (Dataview) | The cheapest thing that works, and it leaks exactly where this codebase is weakest: Dataview registers its string handlers against the wildcard, so `rows.weight + " lb"` stringifies the array instead of failing. A Table cell is a string. |
| A static type check (Notion) | A type system for a language whose whole point is that a layout is data an author edits in a form. Nothing else in `src/formula/` has a type phase to hang it on. |
| Implicit reduction (Excel, pre-2018) | Named by Microsoft's own history as the mistake, corrected by introducing an operator whose only job is to confess where it was happening. |

**The guard this design uses is that the type does not exist.** A collection lives
for the duration of one builtin's own frame, is never a `Value`, and has no way
to reach a card, a name, or a note. That is Sandbox's and Roll20's answer to
"what stops a collection leaking into arithmetic", without their cost, because
unlike them this language does have the aggregate. It is the branch nobody in the
prior art occupies, and nobody occupies it because nobody in the set was in this
position: a scalar-only value type feeding directly into note-writing components,
with a predicate that can still be a real expression.

**What is kept of claim 2.** The two lazy argument positions do the work `map`
and `filter` do. `sum(inventory, Qty * Weight, equipped)` carries the whole
expressive content of `sum(filter(map(rows, r => r.qty * r.weight), equipped))`;
what is lost is *holding* the intermediate. So the departure is narrower than it
looks: this is `SUM(FILTER(MAP(…)))` with the parentheses collapsed into argument
positions, not SUMIF.

**What it costs, stated plainly.**

- **The language grows by builtin rather than by composition.** `avg`, `min` over
  rows, "the heaviest item", "the names of what is equipped" each need a new
  builtin or cannot be written. Four tools in the set get all of those from one
  collection value and two combinators.
- **A filtered set cannot be named and reused.** Two aggregates over the same
  filter walk the table twice and spell the predicate twice, with nothing keeping
  the two spellings in step.
- **There is no `first()`**, so "the weight of the first equipped item" is
  unwritable rather than awkward.
- **If a second collection consumer arrives, the language widens after all**, and
  then these builtins become special cases of the general thing. That is the real
  risk and it is worth naming. It is also strictly additive: widening `Value`
  later does not un-write `sum(inventory, Weight)`, because the aggregate names a
  component rather than a collection and would keep meaning what it means.

**The one exception this buys, and it is a real one.** Argument 1 of an aggregate
is a **component reference, not a value.** Every other position in the language
is a value. `inventory` there is read from the parse tree as identifier text and
never resolved through the name table, so a component that publishes a bare name
is not read as that name in that position. One text, two meanings, in one
argument position of one builtin family.

The alternative is a string literal, which is what CSB uses (`lookup('equipment',
…)`) precisely to avoid this. The tokenizer has no quote handling at all: adding
string literals to the grammar so that one argument can be quoted is a larger and
more permanent tax than the exception, and it would make the first argument look
like the one thing the prior art is unanimous against, a language inside a string.
A dotted suffix (`inventory.rows`) is worse still — it would answer §13's parked
suffix-namespace question by accident. So: a bare name, in one position, stated as
a rule rather than left to be discovered.

### 2. What names the rows: nothing does

**The aggregate names the component, never a row.** `inventory` is knowable when
the formula is written, which is the whole of §4.2's requirement; the rows are
reached as a set whose cardinality the layout does not know, which is the whole
of what an aggregate is for.

So §4.2's rule is untouched, not bent: `inventory.Dagger` still fails as an
unknown name, whatever its capitalisation, because the name table is still built
from `config.rows` and a row the character typed still has nowhere to appear in
it. Nothing about row identity changes either — a row is still its position in
the note's table, and the aggregate never sees an index.

**How the rows reach the formula: the contract grows one optional member.**

```ts
scopeRows?(data, config): RowsSource | undefined;
```

Named for its sibling. `scopeValues` publishes this component's *names*;
`scopeRows` publishes the rows that have none.

```ts
/** One row an aggregate walks: what to call it, and the names it holds. */
export interface RowValues {
	/** As a reader sees the row, for wherever an error has to name one. */
	label: string;
	/** A name that would not resolve is absent, never zero. */
	values: Readonly<Record<string, FieldValue>>;
}

/** A component's rows, built with a resolver bound to the finished sheet. */
export type RowsSource = (resolve: FieldResolver) => readonly RowValues[];
```

This passes §4.1's rule for an optional member — **a member is optional only
where the alternative is code outside the component knowing that component's data
shape** — and it passes it squarely. The alternative is the formula engine, or the
sheet view, knowing that a Table has `columns` and `rows`, that a cell is text
that maps to a number by column type, that a blank number cell is zero, that
declared rows come first and character rows follow in note order, and that a row
carries named expressions layered over its cells. That is the entirety of Table's
data shape. Nothing else could build it, so the contract grows, by decision.

It takes the resolver for the same reason `compute` does: a row's names may
include a computed column, which is a formula evaluated against the finished
sheet. It is the same signature shape and the same laziness.

### 3. The predicate's scope: it is not a function body

**The predicate and the row expression are argument positions, not definitions.**
`if` is the precedent already in the codebase: it is handled in `evalNode` rather
than `callBuiltin` because its branches are lazy, and a lazy argument is evaluated
in a scope the callee chooses. The aggregate's second and third arguments are that
with one addition — the row's names layered nearest.

§5's rule is about definitions, and it survives verbatim. "A function is not a
text substitution, so `mod(score)` means the same arithmetic wherever it is
called": a function body called from inside a row expression still sees only its
parameters and the sheet, and never the row. `sum(inventory, weight_of(Qty))` is
fine; `weight_of` reading `Weight` off the row is not, and fails as an unknown
name. That is the rule working, not an obstacle to it.

**The layering, nearest first**, extending §5's existing three layers by one:

1. **The row's names** — every stored cell by its column key, then the row's own
   named expressions, then its computed columns.
2. The caller's own internal scope, whatever the enclosing formula field already
   had (one ability's `value`, an enclosing table row).
3. The component's own data.
4. The sheet.

**The row is the nearest scope there is, nearer than a function's own
parameters.** So `load(Weight) = sum(inventory, Weight)` sums the column, not the
parameter. This is a decided trade rather than an oversight: a row expression that
could not see a column because a parameter happened to share its name is the
harder surprise, and §5's "means the same arithmetic wherever it is called" is not
threatened, because the table is named in the same expression as the shadowing —
the meaning is fixed at the definition, not at the call.

A column key that is not a name §5 accepts is unreachable to a row expression,
exactly as it is untotallable. `sum(inventory, Load cost)` cannot be written for
the same reason `total` on that column is refused. One limit, one rule, no new
sentence.

### 4. An aggregate may read a computed column

**Yes.** And table.ts's refusal near line 697 stays correct *as a statement about
`total`*, because what made it a refusal was never "a derived value cannot be
summed". Read it again: "a total adds up stored cells and a computed column stores
none, it works one row out at a time, over as many rows as the character has."
Every clause is about `total` — a declarative flag on a column, with no scope in
which to evaluate a formula and no lazy path to a finished sheet.

The aggregate has both. It is evaluated inside the name table's existing guard,
with a resolver bound to the finished sheet, which is precisely what `compute`
gave a declared row. So the two halves §4.2 separated — "publishing a single row's
derived value and summing a column of them are different questions, and the
paragraph below answers only the first" — are both answered now, in two places,
and §4.2 gains the pointer.

Two consequences to carry:

- **`total` on a computed column stays a configuration error**, and its message
  changes. Per PATTERNS §4, error text names the fix, and the fix is now
  `sum(<id>, <expression>)` rather than "total a stored column instead".
- **The computed column is often unnecessary.** Because argument 2 is an arbitrary
  row expression, `sum(inventory, Qty * Weight)` needs no `Load` column to exist.
  A declared computed column is still readable, for the card that wants to show
  the per-row number as well as the total.

### 5. The save-time cycle check: this edge is visible

The check does not exist yet — §5 says circular references are caught when the
layout is saved, and nothing in `src/editor/` implements it. So the question is
whether this feature makes the eventual check more incomplete than it already is,
and the answer is that it makes it **less** incomplete in one direction and adds
one obligation.

**An aggregate is a pull written out in the layout's own text.** `sum(inventory,
Load)` names `inventory` in a formula field a reader can read. It is not a
`compute`, which §4.1 records as the one thing the check can never see through.
The existing `referencesName(source, name)` already reports true for `inventory`
in that formula, so the edge is visible to machinery that is already here.

What it adds is that the edge is **coarse**: a component reference reaches the
whole Table, including every computed column the walk evaluates, so a
component-level reading may report a cycle where none exists at runtime.
`encumbrance = sum(inventory, Weight)` with `inventory`'s computed `Load =
encumbrance / 2` is a cycle to a coarse check and not one in fact, because the
walk's failure to produce `Load` never reaches an aggregate that asked for
`Weight`. Reading it precisely means following which names the walk actually
touches, which needs the row scope, which is the component's. **This feature's
obligation is to make the edge readable, not to build the check**, and it
discharges that.

The runtime floor therefore has to hold on its own, and it needs one new guard:

- **Cycles through a published name** are already caught. `encumbrance` publishes
  through `display`, so the aggregate runs inside `buildSheetScope`'s `active`
  guard; a computed column reading `encumbrance` gets `undefined`, is absent from
  the row, and the expression reading it fails. Both ends unresolved, everything
  else on the sheet live. No change.
- **A cycle with no published name in it is new.** `Load = sum(inventory,
  Weight)`, a computed column aggregating over its own table, recurses through no
  name at all and would not terminate. **A row set being walked cannot be walked
  again**: the second attempt is a failure with its own message, so the cell shows
  `?` and says why. This is the same shape as `Runtime.active` for functions and
  `active` in `buildSheetScope`, and it is not optional.

  Three things this paragraph does not say, and each had to be got right in the
  build. **Every walk in the cycle is refused, not only the attempt that
  re-entered one**, or the other end completes and is held as a whole row set
  with the column that reached across silently absent. **And nothing outside the
  cycle**: a walk that merely reached it is not in it, and marking every walk in
  flight tells a table a formula on its rows loops back when none does. The
  active chain is insertion-ordered, so the suffix from the re-entered id is the
  ring. And **the refusal lasts the walk and no longer** — held against the
  component it condemns the coarse edge above, which is not a cycle, and takes
  every unrelated aggregate over that table with it in one evaluation order and
  not the other. The name table wants the same correction: it must cache what
  resolved rather than the `undefined` a transiently-refused thunk produced.

### 6. `total` stays, and it is not a second mechanism

`total` does two things the aggregate does not, and cannot be replaced by it:

1. **It renders.** A number under the column, moving per keystroke off the draft.
2. **It publishes a name**, `<id>.<key>`, which the rest of the sheet reads.

An aggregate is somebody else's formula. It renders where that formula's component
renders and publishes whatever that component publishes. So this is not two
mechanisms for one job; it is one mechanism for the aggregate a Table shows about
itself and another for the aggregate a formula asks about a Table.

But the *arithmetic* must be one rule, and PATTERNS §1's two-consumer tier is what
governs. The reason they are not merged: `total` reads the draft and the row table
reads the note, which is §4.2's "a published name reads the note; a cell reads the
draft" — routing the totals row through the formula engine would rebuild the
sheet-wide name table on every keystroke, which is the thing that sentence
refuses. So two call sites, and:

- Both go through table.ts's existing `columnTotal`/`cellValue` split, which
  already separates "what a cell is worth" from "where the cells are read from".
  Both call sites are inside table.ts, so nothing is extracted across a module
  boundary.

  **Both of those sentences turned out false in the build, and neither was
  load-bearing.** The aggregate's loop cannot be a table.ts function: its second
  argument is an expression evaluated per row in the row's own scope, which is
  the evaluator's job, so the second call site is in `expression.ts`. What
  crosses the boundary is therefore not nothing but `roundSum`, and that is the
  smallest thing that can — sharing only `TOTAL_PRECISION` left
  `Math.round(x * P) / P` written out at both sites, which drifts by a `floor`
  or a missing divide. `cellValue` stays shared and stays the one rule for what a
  cell is worth.
- **`TOTAL_PRECISION` climbs PATTERNS §1's ladder in one step**, being a policy
  number: the aggregate's `sum` and the totals row must round identically or one
  expression reads `0.30000000000000004` where the number under the column reads
  `0.3`. It moves to `src/formula/`, named for where a sum stops being exact, and
  table.ts imports it — which it already does for `isName`.
- **A guard test drives both paths over the same note and fails when they
  disagree**, which is the two-consumer tier's requirement. **Its scope is
  `number` and `level` columns**, and the third totallable type is a stated
  exception rather than a gap in it.

  **A `toggle` column's aggregate is `count(<id>, <key>)`, not `sum`.** A toggle
  cell is `true` to a formula — that is `cellValue`, unchanged, and it is why a
  computed column cannot write `Training * Worn` either — while the totals row
  maps it to 1 on its way into a sum. So `total` on a toggle publishes a count,
  and the aggregate that answers the same question is the one that counts. The
  two produce the same number for the same question; what differs is the
  spelling, and `sum(inventory, Worn)` names `count` as the fix rather than
  earning the language a numeric meaning for yes and no that no operator in it
  has. Coercing here would be the second implementation this section is about:
  `Worn + 1` would still fail, so the coercion would hold inside one builtin and
  nowhere else.

### 7. A failed aggregate publishes nothing, and one bad row is a failure

§5's rule applies unchanged: the aggregate throws, the enclosing formula fails,
the consuming component shows `?` and its own name publishes nothing.

**One row out of nine with an unreadable cell fails the whole aggregate**, and the
error names that row. This is `columnTotal`'s existing rule — "reporting the row
beats adding up the rest, because a quietly wrong number is worse than a missing
one" — extended rather than a second answer to the same question, and `rowLabel`
already exists in table.ts for exactly this naming job.

The prior art decides this, and it decides it on field evidence rather than on
documentation. The failure users actually hit in the closest analogues is
**silent wrongness**: CSB #511 is a `sum(lookup(…))` returning the wrong number
when a per-row conditional has a falsy branch; the recurring Roll20 complaint is a
total that silently never updated. SUMPRODUCT's documented behaviour — "treats
non-numeric array entries as if they were zeros" — is the mechanism that produces
exactly that, so skipping the bad row is the option to refuse. Meanwhile the
failure the documentation warns about, a collection reaching arithmetic, cannot
arise here at all (§1).

**An empty row set is not a failure.** `sum` and `count` over zero rows are 0. An
empty inventory weighs nothing, and a new character's sheet must not be full of
`?`. That is the sibling of §4.2's blank-cell rule and the reason `min`/`max` over
rows are deferred rather than shipped: they have no answer over an empty set, so
they would need a rule this one does not.

### What this settles, and what it leaves open

It settles the §13 bullet this diff adds, in full. It does **not** settle §13's
depth question, and it does not close the Item modifiers card despite the board
saying that card waits on this one. The prior art is a counter-example there and
worth acting on: both Foundry builders answer item modifiers by **push** — a row
declaring a MOD or an Active Effect against a named target — and CSB is
deprecating its own pull-side modifier system in favour of Foundry's push. The
pull aggregate requires the target to enumerate every source that could modify it,
which is the thing push exists to avoid. So the ordering claim on that card
deserves a second look before it drives anything, and this feature should not be
described as delivering it.

## What it does

A layout author can write one expression that reaches into a table and sums
something over its rows, including the rows a character added after the layout was
written: `sum(inventory, Qty * Weight)` is a pack's encumbrance, `sum(inventory,
Weight, equipped)` is the weight of what is actually carried, and
`count(inventory, equipped)` is how many things are. The expression is a formula
like any other, so its result is a name the rest of the sheet reads, feeds an
encumbrance status, and can be a Pool's maximum.

Nothing about the language's values changes: no expression evaluates to a list,
and a table's rows still have no names. The aggregate names the table and the
arithmetic, and the table's own rows stay anonymous.

## Design

### Where it appears

**Nowhere new.** This is the whole of the interface decision and it is worth
stating as one, because a reviewer will look for a control and there is not one.
An aggregate is text in a formula field, so its surfaces are the ones every
formula already has:

- **The layout editor**, in whichever formula field the author types it: a Pool's
  max, a Computed component's expression, a Table's column formula, a reset
  binding's `to`.
- **The consuming component's error state**, in place, per UI §10. A broken
  aggregate is the consuming card showing `?` with the reason in its explanation,
  exactly as an unknown name is today. Nothing about the Table it read changes
  appearance.
- **The harness**, through an example layout: an inventory with `openRows` on
  beside a Computed component reading `sum(inventory, Qty * Weight)`, so the
  feature can be looked at rather than only tested.

**A filtered total does not render under the column.** "The weight of what is
equipped" appears wherever the author put the component that asks for it, not in
the table's footer. Putting it in the footer would mean a column configuring a
filter, which is the branch §1 rejects on the prior art's clearest convergence.

### The error states, which are the whole of the visible design

Each names the fix, per PATTERNS §4 and UI §10.

| What went wrong | What the reader sees |
| --- | --- |
| Argument 1 is not a bare name | `sum() names a table first, then what to add up: sum(inventory, Weight).` |
| The same, from `count` | `count() names a table first: count(inventory).` |
| Argument 1 names nothing on the sheet | `There is no table called "inventroy" on this sheet. An aggregate names a component by its layout id, which is not the heading shown on its card.` — the second sentence because the first is a true sentence about a table the author is looking at: they have the heading in front of them and wrote that, and the id is the thing a formula names. |
| Argument 1 names a component with no rows | `"armour_class" holds no rows for sum() to read. Only a table does, and a table showing an error of its own holds none until that is fixed.` — the second sentence because three situations reach this and only the first makes the first sentence literally true: a component that is not a list of rows, one whose configuration is refused, and one whose section would not read. The row table cannot tell them apart, and an author told their inventory is empty when it is refusing to answer would go looking in the wrong place. |
| A row's expression will not evaluate | `Row "Dagger": unknown name "Wieght".` — the existing message, prefixed with the row as a reader sees it. |
| A row's expression is not a number | `Row "Rope": sum() needs a number, got "coil".` |
| A row's expression is yes or no | `Row "Dagger": sum() adds numbers up and this is yes or no. Count the rows it holds for instead, with count(inventory, <condition>).` — the mistake §6's toggle exception invites, and the one place a message names the other aggregate as the fix. |
| The predicate is not a boolean | `Row "Dagger": sum()'s condition needs true or false, got "2".` |
| The table is already being walked | `"inventory" is already being read, so an aggregate over it cannot resolve. A formula on its rows reaches back to it, directly or through another table — break that loop.` — "a column on it cannot sum it" was the first wording and was true only of the shape it was written against, a table whose own formula sums it. On a ring of two it is false of both ends and sends the reader hunting for a self-sum that is not there. |
| Wrong argument count | `sum() takes a table, what to add up, and optionally a condition.` |
| The same, from `count` | `count() takes a table, and optionally a condition.` |

A row with a blank name cell is named `Unnamed row`, which is the constant
table.ts already uses everywhere a row has to be named.

**Two of the rows are spelled twice** because `count` takes one argument fewer
and adds nothing up, so a message written for `sum` names a shape it does not
have. The rest are shared, spelling the caller into the sentence. Written out per
aggregate rather than derived, because the message is the whole value of the
entry: "takes 2 or 3 arguments" names the fault, and PATTERNS §4 wants the fix.
The table is the complete set, which is what F5 measures.

### What it reuses

- **`if`'s laziness.** Handled in `evalNode` rather than `callBuiltin`, for the
  same reason: arguments that must not be evaluated eagerly, or in the caller's
  scope.
- **`min`/`max`'s variadic precedent** for a builtin whose arity is not fixed.
- **`buildSheetScope`'s lazy, memoised, re-entry-guarded shape**, which the row
  table copies rather than invents.
- **table.ts's `rowViews`, `rowScope`, `cellValue`, `columnTotal` and
  `rowLabel`**, all of which exist and all of which `scopeRows` is assembled
  from. `rowScope` is already the helper that exists so a cell and a published
  name cannot disagree about what a row says; the row set is its third consumer.
- **`FormulaError` and `explainField`**, so every message above reaches the card
  through the path that already carries them.

### Plumbing

Three pieces, and the third is the only subtle one.

**`src/formula/rows.ts`, the sheet-wide row table.** Lazy, memoised per component
id, and guarded against a re-entrant walk. It owns the "no such table" and
"already being read" messages, because it is the thing that knows the component
ids. It hands `expression.ts` a result, never a throw, per PATTERNS §4:

```ts
export type RowSetResult = { rows: readonly RowValues[] } | { error: string };
export type RowLookup = (id: string, caller: string) => RowSetResult;
```

`caller` is the builtin asking, and this sketch was one parameter short of what
the error table above already demanded: `"armour_class" holds no rows for sum()
to read.` names the aggregate, and `count` has to be able to name itself there.
The other two answers are about the sheet rather than about the call and read the
same whichever asked.

**`FunctionEnv` gains `rows?: RowLookup`.** `expression.ts` stays a pure consumer
and holds no state of its own: it looks the table up, walks it, and throws the
message it was handed.

**The two tables are mutually lazy, and that is the one construction subtlety.** A
published name may contain an aggregate, and a row's computed column may read a
published name, so the name table needs the row table and the row table needs a
resolver bound to the name table. Both are already built out of closures called
lazily, so `sheet.ts` gains one entry point that builds both and hands each
component's resolver factory the finished environment:

```ts
export function buildSheetEnv(
	components: readonly PublishedComponent[],
	library: FunctionLibrary,
): FormulaEnv;
```

`PublishedComponent.resolver` changes from `(sheet: Scope) => FieldResolver` to
`(env: FormulaEnv) => FieldResolver`. `buildSheetScope` stays exported, because
tests drive it directly and its job has not changed.

This is `sheet.ts` keeping its job rather than gaining one: the file exists to
build what every formula on the sheet resolves against, and that is now two tables
instead of one. If it reads as two jobs after the change, the tie belongs in a
third module and the reviewer should say so.

**`src/formula/resolve.ts`'s three factories take one environment instead of two
trailing positionals.** `(component, config, data, sheet, functions)` is already
five parameters and this feature makes it six. It becomes `(component, config,
data, env?)`, which is a mechanical change across six call sites in
`sheet-view.ts` and four test files, and it lands as its own commit ahead of the
feature.

## Config fields

**None.** The feature adds no config field to any component, which follows from §1:
the aggregate lives in the expression language, not in a component's
configuration.

Two existing descriptions change, both on Table, and both because they currently
tell an author something that will no longer be true:

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `columns` | list | Columns | …gains: "A column's total sums what the note stores; a formula elsewhere can sum an expression over the rows instead, with `sum(<component id>, <expression>)`." |
| `openRows` | toggle | Let characters add rows | …gains, replacing "total a column instead": "no formula can name a row a character added — total a column, or aggregate over the rows with `sum(<component id>, <expression>)`." |

And one refusal message changes, at table.ts's `total`-on-`computed` branch, from
"Total a stored column instead, or publish a single row's value by giving that row
a key" to naming the aggregate as the fix.

## Data and file model

**Nothing is stored, and no note is read or written differently.** The aggregate is
layout text living in an existing formula field, evaluated at render time. The
layout schema gains no key: `sum` and `count` are grammar inside a string a
`formulaFields` path already declares.

- **Constraint 3, round-trip.** Untouched. No component's `read` or `write` is
  changed by this feature, so `parse → serialise` is byte-identical for the same
  reason it was before.
- **Constraint 4, no data loss.** Untouched. Nothing is migrated, nothing is
  cleaned up, and opening a character on a layout carrying an aggregate writes
  nothing.
- **Existing character notes.** Unaffected, in both directions: an existing note
  under a layout that gains an aggregate renders the new number and stores no more
  than it did, and a note under a layout that loses one loses only the number.
- **Existing layouts.** One behaviour change reaches them: `sum` and `count` join
  `RESERVED_NAMES`, so a layout defining either is reported in the editor and left
  out of the library, as any other reserved name already is. Nothing is released,
  so no layout outside this repository's fixtures and a throwaway vault can be
  holding one.
- **Constraint 5.** `src/formula/rows.ts` imports from `../types` alone, as
  `sheet.ts` already does.
- **Constraint 1.** No new evaluation path. The aggregate is nodes in the existing
  parse tree, evaluated by the existing recursive-descent evaluator.

## Acceptance criteria

**The arithmetic**

- [x] `sum(inventory, Weight)` over a table of rows a character added equals the
      number the totalled `Weight` column shows, and **one test drives both paths
      over the same note and fails if they disagree**, including a column of
      tenths where float summation would otherwise part them.
- [x] `sum(inventory, Qty * Weight)` resolves — the encumbrance §13 refused.
- [x] `sum(inventory, Weight, equipped)` sums only rows whose toggle is on.
- [x] `count(inventory)` is the row count; `count(inventory, equipped)` filters it.
- [x] An aggregate over a table with both declared and character rows walks all of
      them, in the same order `render` draws them.
- [x] `sum` and `count` over a table with no rows are `0`, not an error.
- [x] `sum(inventory, Load)` resolves where `Load` is a declared computed column.
- [x] An aggregate resolves inside a layout function's body, and inside a Pool's
      `max`, and a reset binding's `to: full` restores to it.

**The failures**

- [x] One row holding text in a number column: the aggregate publishes nothing,
      and the consuming component's explanation names that row.
- [x] A row whose name cell is blank is named `Unnamed row` in that message, the
      same as everywhere else a Table names a row.
- [x] A computed column that aggregates over its own table shows `?`, says the
      table is already being read, and the rest of the sheet stays live and
      editable.
- [x] **Two tables whose row formulas each aggregate over the other** leave both
      ends refused rather than one end refused and the other holding a row set
      with the column that reached across silently absent — whichever of the two
      an aggregate asks for first. And **a table that merely reads one of them is
      not refused with them**: the ring is the suffix of the walk chain, not every
      walk in flight, so a table with no formula looping back is never told it has
      one, and aggregates over what it does hold keep working.
- [x] **A refusal lasts one walk.** Nothing is held against a component across
      evaluations, and the name table caches what resolved rather than the
      `undefined` a transiently-refused thunk produced — or the coarse edge above
      stops being coarse and grid order decides whether the sheet works.
- [x] A cycle through a published name — an aggregate reading a table whose
      computed column reads the aggregate's own component — leaves both ends
      unresolved, and every component outside it working **on any evaluation
      after the first**. That last clause is the amendment: a card holding an
      aggregate over the same table and drawing before the published name
      resolves enters the ring at the rows, so the row table's guard closes it
      and refuses that walk, and the card shows `?` once. The name resolves on
      the next attempt, the row set is built and memoised, and the same formula
      is the number from then on. Pinned in `formula/sheet.test.ts` from both
      ends, and the residual is `SPEC` §13's guard-coupling question.

      **The clause this criterion used to carry, "through the existing
      `buildSheetScope` guard and with no new guard involved", is false and was
      written before the row table existed.** Which guard catches the ring
      depends on which end of it a formula reaches first. Entered at the name,
      `buildSheetScope`'s guard catches it and nothing else is involved: the
      column reading the name gets `undefined`, is absent from the row, and the
      expression reading it fails. Entered at the *rows* — a card holding
      `sum(inventory, Weight)` that draws before `encumbrance` resolves — the row
      table's guard catches it instead, because `encumbrance`'s thunk is running
      inside the row walk and is not yet its own dependency. Both catches are
      correct and they do not produce the same outcome: the second refuses the
      whole walk, so that one card shows `?` where the identical formula on a card
      drawing later shows the number. See the cost recorded against the guard in
      `SPEC` §5.
- [x] Each row of the error table above has a test asserting its message, and each
      message names a fix rather than a fault. The table is complete: every
      `FormulaError` the aggregate and the row table can raise is a row in it,
      including the two `count` spells and the yes/no one.

**The language**

- [x] `Value` in `src/formula/expression.ts` is unchanged, and no type in
      `src/types.ts` gains a collection member. Checkable by reading the diff.
- [x] A layout function called from inside a row expression cannot see the row:
      `sum(inventory, weight_of(Qty))` where `weight_of` reads `Weight` fails as
      an unknown name.
- [x] A row's names shadow the caller's scope and a function's parameters, with a
      test for each.
- [x] A layout defining `sum` or `count` is reported in the editor, left out of
      the library, and does not blank the sheet.
- [x] `sum(inventory, Load cost)` is not writable, and the column-key limit is the
      same sentence `total` already carries rather than a second one.

**The sheet around it**

- [x] **A section that failed to read publishes nothing and holds no rows.** A
      Table whose markdown is malformed hands out no declared rows with blank
      cells, so no total reads 0 and no aggregate reads the declared-row count
      beside a card saying it could not read the section. Every component is still
      listed, so an aggregate naming it says it holds no rows rather than denying
      it is on the sheet.
- [x] One builder does that for the sheet view, the harness and both test
      mirrors, so an instrument cannot publish differently from the thing it
      measures.

**The structure**

- [x] `contract.test.ts` accepts `scopeRows` as an optional member, still refuses a
      component declaring anything outside the contract, and still enforces the
      member order with `scopeRows` placed in it.
- [x] A component declaring no `scopeRows` is unaffected: four of the five
      registered components gain nothing, and `sum` naming one of them says it
      holds no rows.
- [x] The rounding exists once, in `src/formula/`, applied by table.ts through
      it rather than rewritten — `roundSum`, with `TOTAL_PRECISION` private
      behind it, because the number was never the copy that could drift.
- [x] Table imports nothing from another component, and `isolation.test.ts` still
      passes.

**Looking at it**

- [x] The harness renders an inventory with `openRows` on beside a readout of
      `sum(inventory, Qty * Weight)`, in both themes. Looked at, at 1400x1100 so
      the readout row is not cropped: `Weight carried 18`, `Weight worn 4`,
      `Things worn 2`, `Attacks known 2`, beside the column totals `17 / 2` —
      five numbers for five questions, none of them each other. The error state
      shows all four as `?` in place with the card errors beside them.
- [ ] **The readout follows a row being added, edited and deleted, watched rather
      than asserted.** Split from the line above, because a still cannot settle
      it and the two halves were passing as one. The behaviour is pinned in
      `components/table.test.ts`, which drives the real loop — render, take the
      reported edit, `write`, `read` back, rebuild the environment, ask again:
      adding leaves 24 standing while the count goes to 4, filling the row in
      makes it 26, deleting the rope makes it 14. What is outstanding is somebody
      opening `npm run harness` and watching it, which is the half of this
      criterion that is a look. **Left unticked deliberately**: the tests are not
      a substitute for it, and recording a look nobody took is worse than
      recording that one is owed.
- [x] Adding a row updates the readout on commit and not per keystroke, which is
      §4.2's "a published name reads the note" showing on screen. Driven in
      `components/table.test.ts`: typing into a cell reports nothing and leaves
      the readout at 24, and the blur that commits it moves it to 120.
- [x] Variations are placed in the throwaway test vault — and **the criterion as
      first written is not checkable from this repository**, which is public and
      does not contain the vault. Split, so a reader can settle each half:
      - [x] The repository carries the same variations end to end, through the real
            layout parser, the real registered components and `buildSheetEnv` —
            which is what a reviewer can run. `view/worked-examples.test.ts`
            drives all five over one parsed layout and one parsed note: the
            unfiltered expression sum `sum(inventory, Qty * Weight)`, a filtered
            sum, a count, a row whose cell will not read, and a section that will
            not read. The five numbers that note produces are deliberately
            distinct — 5, 4, 2, 2, 3 — so none of them can pass by reading
            another. `view/reset-flow.test.ts` drives the expression sum a second
            way, as a Pool's `max` that a long rest writes into a note, which is
            the only path where an aggregate's result reaches a file.
      - [x] The vault carries them too, which is a manual step and stays one: a
            layout is a file on somebody's disk. What must be in it, so the next
            reader knows what to look for rather than guessing:
            `sum(inventory, Qty * Weight)` unfiltered,
            `sum(inventory, Weight, Worn)` filtered, `count(inventory, Worn)`,
            `sum(load, Load, Taken)` over a second table,
            `sum(inventory, Wieght)` misspelling a column,
            `count(spellbook)` naming nothing on the sheet, and a computed column
            on the Attacks table reading `sum(attacks, Uses)` so the re-entry
            refusal is on screen. The check is to open the character note and read
            the cards; every one of those resolved or failed as expected when the
            real pipeline was run over the vault's own files.

## Commit boundaries

A plan for `/ship`, applied once at the end. The tree stays uncommitted through
implementation and every round of findings.

1. **`refactor: Give a formula one environment instead of trailing arguments`**.
   `resolve.ts`'s three factories take `(component, config, data, env?)` where
   `env` carries the sheet and the function library; `PublishedComponent.resolver`
   becomes a factory over that environment; six call sites in `sheet-view.ts` and
   four test files updated. No behaviour change, and the diff should read as one.
2. **`feat: Sum a column over the rows a character added`**. The thin path end to
   end: `scopeRows` on the contract with `RowValues` and `RowsSource` in
   `types.ts`; `src/formula/rows.ts` with its memoisation, its re-entry guard and
   its two messages; `sum` in `evalNode` beside `if`; `TOTAL_PRECISION` moved and
   imported back; Table implementing `scopeRows` over stored cells and row values;
   `buildSheetEnv` tying the two tables; the guard test against the totals row.
3. **`feat: Filter an aggregate, and count what it reaches`**. The third argument,
   `count`, both names into `RESERVED_NAMES`, and the arity and predicate-type
   messages.
4. **`feat: Let an aggregate read a computed column`**. Computed columns join the
   row scope; the re-entry guard gets its test through a self-summing column;
   `total`-on-`computed` keeps its refusal and gains a message naming the
   aggregate as the fix; the two `configFields` descriptions.
5. **`feat: Show a pack's encumbrance in the harness`**. The example layout, the
   test-vault variations, and whatever the harness needs to render a Computed
   component beside a Table.
6. **`docs: Record what an aggregate over a table's rows settles`**. `SPEC` §4.1
   for the new optional member, §4.2 for the pointer out of the two halves it
   separated, §5 for the aggregate and the row layer, §12 for what this component
   ordering exposed, and §13's bullet becoming a `Resolved:` entry. `PATTERNS` §1
   if the `TOTAL_PRECISION` move needs a line.

## Deliberately not doing

**The collection type.** No `Value` member, no `filter`, `map`, `first` or `join`,
no way to name or hold a set of rows. §1 is the argument and the cost. If a second
consumer arrives that genuinely needs a collection — "the names of what is
equipped, joined" is the likely one — the language widens then, additively, and
these builtins become special cases of the general shape.

**`min`, `max` and `avg` over rows.** `min` and `max` already exist as variadic
scalar helpers, and giving either a component reference in argument 1 would give
one name two grammars. They also have no answer over an empty row set, which
`sum` and `count` both do. Separate work, and it needs the empty-set rule §7 did
not have to write.

**A filtered total rendering under a column.** The aggregate renders where its
consuming component renders. A footer total with a filter is a column configuring
an aggregation, which §1 rejects.

**Aggregating over anything but a Table.** Only Table implements `scopeRows`. A
Stat group's attributes and a Track's runs both have names a formula can already
reach, so neither needs a set, and neither gains one here.

**Item modifiers.** A row that adds to a value elsewhere on the sheet. It consumes
this feature and is separate work — and per §1's closing paragraph, the prior art
says a pull aggregate is not the mechanism that delivers it, so the board's
dependency between the two cards deserves re-examining rather than acting on.

**Encumbrance as a shipped rule**, including the prefilled `total` on the
Inventory palette entry's Weight column. §13's Inventory prefill is unchanged by
this diff. What the aggregate delivers is that an author *can* write the loaded
pack's rule; which rule a prefill ships with is a palette question.

**"How many slots are left."** It also waits on §13's published-name-depth
question, which this feature does not settle: a Track's row set publishes
`slots.L1` and its ceiling would be `slots.L1.count`, one segment past what
`<id>.<name>` reaches.

**The save-time cycle check.** It does not exist, this feature does not build it,
and §5 gains one sentence about the edge an aggregate makes visible rather than a
check that reads it.

**§12's stale sentence**, "`link` columns still wait for the inventory that needs
them", which §13 has already parked. A real contradiction, and not this diff's.

**Precision beyond six decimals** and any other numeric behaviour `total` already
has. The aggregate matches the totals row; it does not improve on it.
