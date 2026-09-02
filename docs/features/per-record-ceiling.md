# A ceiling each record sets for itself

Status: shipped
Board card: ✨ A `number` field on a Record set whose ceiling the reader sets on the
sheet rather than the layout declaring it, so a homebrew feature with three uses
reads `2 / 3` on a layout that declares no maximum.

## Model question

This is a model question and not a UI one, and the gating half was settled with the
owner before this document existed: **where does a ceiling the reader types live, on
a component whose fence keys are the layout's to name?** What is written here is the
argument, in enough detail that `/land-it` can lift a §13 entry out of it. **Nothing
is resolved until it is built, so §13 is not edited here.**

### Which §13 question this touches

Not an open bullet. §13's Record set entry lists, under **what stays closed**, "a
per-record uses ceiling that differs per record, since `max` is a literal on the
field" — and `docs/features/record-set.md` names the same thing twice, once as a cost
in its reset section ("a record whose uses are its own is two number fields and a
reader who edits one") and once in **Deliberately not doing**. **This feature
overturns that closure, and the closure was half right.** Its stated reason is about
a *formula* ceiling: "making `max` a formula field means resolving it in the record's
scope inside `applyReset`, which is a second failure path on a control that already
has one." That reason is untouched and a formula ceiling stays closed (**Deliberately
not doing**). What it does not reach is a ceiling the reader **types**, which resolves
nothing, runs no expression, and adds no failure path to `applyReset` that the stored
value does not already have. The closure was correct about its own subject and was
being read as covering a second one.

### The answer

**The ceiling lives inside the value entry it belongs to.** The fence entry becomes:

```
Uses: 2 / 3
```

No new key, no reserved key shape, no widening of the file model.

### Why that one, and not the three a reader reaches for first

**It is the only candidate that answers §13's standing "does this need new storage"
question with *no*.** §13 has asked that in several forms — a second reserved suffix,
a per-row body beside a table, a prose column, a Field component's storage — and it
has never once widened the file model to answer one. `.left` was admitted precisely
because it was "one more hardcoded suffix, not a namespace a component may grow a
third segment into". This is the same discipline, one level down.

**And the fact that decided it: a Record set's fence already holds a composite value
per entry.** A `modifier` field's entry is
`Modifiers: armour_class += 1 as item when Worn` — a target, an operator, an amount, a
bonus type and a condition, in one `key: value` line, split by `parse/modifier-cell.ts`
on `;` and again by the formula layer. So `Uses: 2 / 3` is not a new *kind* of thing in
this component's fence. It is the same move at a much lower cost: one separator, two
halves, both numbers.

**Pool's own reversal does not bind here, and the spec says why rather than ignoring
it.** §4.2 records that a Pool's value field once held either a value or an
instruction, and that three defects came out of that one ambiguity: everything painted
from the field read a pending amount as the value, a caret landing left of the digits
turned a spend into a set, and a press arriving before the commit took the amount as
its origin. **None of the three is reachable here, and the reason is structural rather
than careful.** There, *one input* held two incompatible kinds of thing with nothing
on screen to tell them apart. Here there are **two inputs**, a `/` between them saying
which is which, and the two halves are **the same kind of thing** — a number and the
number it is read against. Nothing paints from a field whose meaning is in doubt,
there is no caret position that changes what a keystroke means, and a press on one
half cannot be read as the other. The reversal's lesson is *do not put two meanings in
one control*; this puts one meaning in each of two controls and one line in the file.

**§10's rule is never reached, which is what a reserved second key could not say.**
§10 promises that a field the layout no longer declares keeps its entry untouched.
That is exactly why a reserved second key is hard: given `Uses` and `Uses max`, `read`
cannot tell a ceiling from a field the layout dropped, so the second entry is either
claimed (breaking §10) or orphaned. Under this answer there is no second entry, so the
rule is not reached at all. **A constraint routed around bites later; one not reached
is settled.**

### The three rejected alternatives, each named because a reader will reach for it

**1. A reserved fence key — `Uses max: 3`.** Rejected. It widens the note format with
a new *class* of key to solve a problem that does not need it widened, and it refuses
`Damage max` as an ordinary author key forever — the same shape Card's `note` key was
refused as a declarable key for. Once a reserved key shape exists the next component
reaches for the same trick, and the fence stops being "one line per declared field",
which is the sentence a hand-editor is given. It is also the option §10 cannot
disambiguate, above.

**2. `Uses.max:` — a dot in a key.** Rejected on §13's `.left` entry, which is
explicit: `.value` and `.left` are hardcoded suffixes, "not a namespace a component may
grow a third segment into", and `isName` still refuses a dot in a published key. **The
honest half**: a Record set publishes no names at all, so `isName` is never actually
reached and nothing mechanically fails. The objection is to the *spelling*, which
invites the namespace reading that entry spent its length refusing — and a
file-format convention that reads as a namespace is one an author will try to extend.

**3. A colon inside a key.** Already a configuration error on this component:
"a colon separates a key from its value in the block". Nothing to decide.

**4. Refusal, leaving the two-field workaround standing.** `record-set.md` names the
current answer: "a record whose uses are its own is two number fields and a reader who
edits one." Rejected on three counts, and none of them is taste. **Nothing ties the
two fields together**, so nothing clamps the value to the ceiling and a reader can
sit at 7 of 3. **`applyReset`'s `full` cannot know which of two number fields is the
ceiling**, so the one action the counter exists for cannot be written at all — the
trigger would restore both fields to a `max` neither declares. And **the pair reads as
two numbers rather than one reading**, which is the whole of what `5 / 3` is for and
the whole of why the read-only ceiling shipped in the first place.

### The known weakness, stated head-on

A reserved second key would write an **independent line**, and `writeFenced` already
touches only lines whose value changed, so Constraint 3 would be free. This answer
rewrites *one line's value* whenever either half changes, so the split and the rejoin
have to either preserve the reader's own spelling or fix a canonical one. **This is
the first place a reviewer will look, so here is how it holds, by construction where
possible.**

- **`RecordEntry.fields` keeps holding the note's own bytes.** `read` is unchanged: an
  entry's raw trimmed text goes into `fields[key]`, composite or not. The split
  happens *above* that, wherever this component turns a stored entry into a value.
  So `write`'s delta carries the same string `read` produced whenever nothing was
  edited, `writeFenced`'s existing "rewrite only lines whose value changed" comparison
  matches, and **an untouched entry is byte-identical because the identical bytes go
  back in**. Nothing rebuilds a piece it was not asked to change — `parse/records.ts`'s
  own sentence, one level in.
- **The split keeps the separator run verbatim and the join puts it back.** This is
  `parse/fenced.ts`'s own shape: its `ENTRY = /^([^:]+?)([ \t]*:[ \t]*)(.*)$/` captures
  the separator precisely so a rewrite can restore it. The new module does the same
  with `/`, so a note spelling `Uses: 2/3` and one spelling `Uses: 2 / 3` each keep
  their own spelling when the *other* half is edited. There is no canonicalisation
  pass over a note the reader did not touch.
- **A canonical form exists only for a composite this component composes for the first
  time**: ` / `, which is what the reading on screen says and what `sample` writes.
  Nothing rewrites an existing spelling into it.
- **Clearing a ceiling drops the separator with it**, so a cleared entry is
  `Uses: 2` and not `Uses: 2 /`. The join emits a separator only where there is a
  ceiling to put after it, which makes the round trip an identity on both directions
  of the change rather than only the one that adds.

### What the contract has to grow

**Nothing.** No new member, no changed signature, no new `RenderContext` member. What
changes is inside `record-set.ts`, plus one note-format primitive and one editor
parameter, both named below so neither is smuggled in as "nothing changed":

- **`src/parse/bounded-entry.ts`** — what a fence entry holding a value and the
  ceiling it is read against is, in bytes. Split and join, exact inverses. It goes in
  `parse/` on §2's rule that a module lives in the folder naming what it *does*: this
  is note format, it imports nothing from `obsidian`, and Constraint 3 is the whole of
  its design. One consumer is enough for that folder — `parse/records.ts` and
  `parse/markdown-body.ts` were each admitted with one. It is a note-format primitive
  on their terms, so `docs/PATTERNS.md` §10's third exception applies and it is driven
  through this component's round trip rather than through a test file of its own.
- **`ColumnOptionsSpec.holderMax`** — whether the list offers a per-holder maximum,
  the editor half. `ColumnOptionsSpec` is the parameter Record set's own landing added
  and §12 already carries the qualification about; this is one more member on it, not
  a second mechanism.

**`typed-value.ts` is not touched, and that is deliberate**, because it is shared with
Table and a change to what bounds a number there would reach a component this feature
is explicitly not designing for. The value handed to `typedValue` and `boundedText` is
one number, exactly as it is today; the splitting happens on Record set's side of the
call. See **Deliberately not doing**.

### What it publishes

**Nothing new, and the ceiling publishes nothing at all.** Say it outright so a reader
does not wonder: `spells.Fireball.max` does not work, and it does not work for the
reason `spells.Fireball` does not — `<id>.<name>` is a fixed-row mechanism and every
record is the character's. Pool publishes `hp.max` because a Pool has one name; a
Record set has none to hang a suffix off, so `.left` is not reachable here either.

**`scopeRows` goes on seeing the value, never the ceiling.** `sum(spells, Uses)` adds
up what the characters have left, which is what it added up before this feature and
what it must go on adding up: a record's `Uses` name is worth `2` when the entry says
`2 / 3`. **This is the sharp regression risk of the whole feature** — an aggregate
reading `'2 / 3'` as text produces a name that is not a number and takes a card down
with a `?` — and it is why the split is applied to **every** `number` field's entry
rather than only to fields whose ceiling the reader owns (below).

What is not reachable, named as a cost rather than left to be found: a formula cannot
ask "how many features are below full", because that needs the ceiling under a name in
the row scope and a record's fields have only their own keys. `count(features, Uses)`
counts records with any uses left and `sum(features, Uses)` totals them; the
comparison against a per-record ceiling is not writable. That is a consequence of the
settled publication model rather than a new decision, and it goes in the same box as
the formula ceiling.

### Constraint 2

**Not reached by the ceiling itself** — a ceiling is a number, and no branch this
feature adds puts a wikilink in a fence. Said rather than left unmentioned, because
the fence is exactly where it would land.

**But the route is real, and this feature found a pre-existing hole in it.** A
record's `number` field is an `<input type="text">` with `inputMode="numeric"`, and
`boundedText` leaves text that is not a number exactly as typed — so a pasted
`[[Ring]]` in a `Uses` field is written into the fence **today**. `record-set.ts`
already holds the sentence for this (`refuseLink`) and already applies it, but only on
the `modifier` field's two routes; the number field was covered by the claim that "no
field type this component offers can hold a wikilink", which is true of the *type* and
false of the *input*. Criterion 6 of `record-set.md` scans the offered types, which is
why the scan did not catch it.

**Decision: this feature closes it, for both inputs, in a commit of its own.** The
ceiling input is a second free-text field of exactly the same kind on the same line,
so refusing a link in one and accepting it in the other would be two answers to one
question a hand's width apart. `refuseLink` already exists in this file with the right
sentence, so the fix is its call sites. Named loudly as a scope addition rather than
buried: it is a Constraint 2 fix that this feature's own new route makes indefensible
to leave.

### What happens to existing character notes

**Nothing is rewritten and nothing is lost.**

- Nothing has ever written a composite entry, so no note holds one. A note holding
  `Uses: 2` reads exactly as it does today: value `2`, no separator, no ceiling.
- A hand-typed `Uses: 2 / 3` reads as `2` today only in the sense that it does not —
  `Number('2 / 3')` is `NaN`, so `typedValue` returns it as text and an aggregate over
  it fails. After this it reads as `2` with a ceiling of `3`. That is a strict
  improvement on a note that was already broken, and it is the only behaviour change
  to an existing note.
- **A layout dropping the field** leaves the whole composite entry untouched, §10
  unchanged: the ceiling is character data and travels with the value it is written
  beside, which is a second thing the single-entry storage buys.

## What it does

A `number` field on a Record set can say that its ceiling belongs to **each record**
rather than to the field. Where it does, every record draws a small quiet field after
the `/` and the reader types the number there — so a homebrew feature with three uses
reads `Uses 2 / 3` on a layout that declares no maximum, a feature with one use reads
`1 / 1` on the same list, and a passive trait that counts nothing leaves it blank. A
`full` reset restores each record to its own ceiling.

This is Pool's `maxSource: 'character'` ported one level down, and Pool's own argument
transfers almost word for word: pointing a formula at a separate Card "still works, but
it costs a second card for a number that belongs to this one, and it shows the max
twice on a sheet where the reading already says it." Here the second card is a second
`number` field, and it is worse than Pool's case, because nothing ties the pair
together and `applyReset` cannot tell which of the two is the ceiling.

## Design

### The layout says, per field, whose ceiling it is

**`maxSource` on the field, ported from Pool, with this level's own two words.**

```json
{ "key": "Uses", "type": "number", "maxSource": "record" }
```

Absent means `'field'`, so every layout written before this reads exactly as it did —
Pool's own sentence about its own default.

**The key is Pool's and the two option words are not, and the divergence is the
decision rather than an oversight.** Pool spells them `'calculated' | 'character'`.
Both are false here:

- **`'calculated'`** names a formula, and there is no formula. `max` on a field is a
  literal, deliberately — a formula ceiling resolved in the record's own scope inside
  `applyReset` is the failure path the Record set entry closed and this feature does
  not reopen. An author meeting `maxSource: 'calculated'` beside `max: 3` in a layout
  file would go looking for the expression.
- **`'character'`** would say one number per character, and this is one number per
  *record*. A character holds forty spells and each has its own.

So the two words are the two things that actually differ at this level: **`'field'`**,
one ceiling the field states for every record, and **`'record'`**, each record's own.
The *key* stays `maxSource` because it is the same question — where does the ceiling
come from — and §2's naming discipline is that one idea keeps one word across the
catalog.

**A string union rather than a boolean**, for §6's reason read forward: `to` could not
be both a formula and a sentinel, and a boolean here could not grow the third source
that is already named as deferred. A `characterMax: true` would have to be replaced
rather than extended the day a formula ceiling arrives.

**Why the opt-in exists at all**, since the alternative is tempting: without it, every
`number` field grows an editable ceiling affordance whether or not it is a counter, on
every record — width this component cannot afford (below) on fields that are not
counters at all. And `applyReset`'s `full` would have no way to say whether a record
with no ceiling set is a *failure* (a counter nobody configured) or a *field that was
never a counter*, which is the distinction the whole reset section turns on.

### The ceiling is per (record, field), and that is right

The storage answer makes it inherently per record **and** per field: the ceiling lives
inside the field's own entry, so a record with two number fields has two ceilings and
neither can be mistaken for the other's.

**Tested against the spellbook, which is the case that decides it.** Every spell has
its own number of uses; a *per-record* ceiling — one number per record, whatever
fields it holds — would immediately have to answer "which of this record's numbers does
it bound", which is the exact question the two-field workaround could not answer and
the reason `applyReset` could not use it. A ceiling belongs to the number it bounds,
not to the record the number sits on. Pool's is per component because a Pool *is* one
value; a record is several, so the ceiling goes one level in with them.

### What the reader sees

Unchanged everywhere except inside a bounded `number` field:

```
▸  Second Wind          Uses 1 / 3    ⚡
▸  Action Surge         Uses 0 / 1
▸  Keen Mind            Uses   / —
```

The reading is the same reading. What changes is that the ceiling is a field rather
than a span, and where nothing has been typed it shows `—`, which is Pool's own
placeholder and here, as there, is also the only invitation to type.

**What an input does to the emphasis ruling, which is not re-litigated.** The design
review already ruled that the ceiling sits at the value's own size, on the argument
that equal-size tabular digits either side of the slash read as one number, with the
field name a size down. An input is heavier than a span, and **Pool's answer to
exactly that is what is ported**: `.sheetsmith-pool-max-input` keeps the span's colour
and size and strips every piece of chrome, "because nothing about a max is worth the
card's centre line". Applied here the consequence is that **at rest the editable
ceiling is drawn identically to the read-only one** — same size, same `--text-muted`,
same tabular figures — and the weight an input adds arrives only under a pointer or a
caret. Two things are genuinely new and both are states rather than resting weight:
the `—` placeholder where nothing is set, and a hover surface. The ruling stands
because the borrowed treatment is a field styled to be a span until it is touched.

**One thing the input gains that the span could not have.** A bare span is
`role=generic`, which prohibits naming, so the read-only ceiling reaches a screen
reader only through the field's announcement. An input is nameable, so the editable
ceiling carries `${record} ${field} maximum` — "Second Wind Uses maximum" — and a
`title` of `Maximum ${field}, held by this record.`, which is Pool's
"held by this character" one level down. The announcement keeps saying "of 3" as
well; the two are not alternatives.

### The gestures

Every one already exists.

- **Typing** is `editable.ts`'s rules, exactly as the value beside it: live display,
  committed on blur or Enter, Escape restoring and announcing, arrow keys stepping.
- **No arithmetic**, and this is a departure from Pool stated rather than hidden.
  Pool's character max settles `31+7` because `bindEditable`'s `arithmetic` is set on
  it. A record's *value* field does not set it, so giving the ceiling beside it
  arithmetic would put two commit rules on one line, which is the defect this whole
  document is about in miniature. If arithmetic is ever wanted here it arrives on both
  halves in one pass.
- **The ceiling is held to the field's `min` where one is declared, and to nothing
  else.** A ceiling under the floor describes a range no value can occupy, and the
  value beside it is already clamped to that same floor — one line must not hold a
  floor the value obeys and the ceiling contradicts. There is no upper bound on a
  ceiling to hold it to.
- **Clearing it** empties the field, which removes the ceiling: the entry drops back to
  a bare number, the field shows `—`, the value stops being clamped, and `full` leaves
  that record's field alone. Pool's answer, unchanged.
- **The value is clamped to the record's own ceiling** on commit, through the same
  `boundedText` call, handed the record's ceiling in place of the field's. A uses
  counter typed past its ceiling is the same mistake as one stepped there.
- **Lowering the ceiling under the value does not rewrite the value.** `5 / 3` is drawn
  as it is stored. This is the plugin's standing rule — render, do not correct — and
  the alternative is a write the reader did not ask for on the press of an unrelated
  field (Constraint 4's spirit). **No warning tint**: Pool's boundary colour is a Pool's
  own status and the shared ceiling vocabulary has never carried one, so adding a state
  to it here would be a lookalike in behaviour rather than in CSS. The reading `5 / 3`
  is what says it.
- **A ceiling that is not a number** is kept exactly as typed, on `boundedText`'s own
  rule, and behaves as no ceiling: nothing clamps to it and `full` skips the field on
  that record.
- **A note reference in either field is declined at the commit**, with the sentence
  `refuseLink` already writes, and the field keeps the draft — the modifier field's
  answer, on the two inputs that reach the same fence. See **Constraint 2** above.

### What it reuses, and the one place Pool's classes are deliberately not taken

The ceiling *reading* is Pool's, unchanged and unrenamed:
`.sheetsmith-pool-ceiling`, `.sheetsmith-pool-separator`, `.sheetsmith-pool-max` —
which the field already wears today, with the record's single size override to
`--font-ui-small`. The input carries `.sheetsmith-pool-max` too, so that override lands
on it for free.

**`.sheetsmith-pool-max-input` is *not* borrowed, and that is not a contradiction of
"reuse Pool's vocabulary".** That class is the *pool card's* field chrome — the
chromeless big-card treatment, its own hover background, its own focus ring, sized in
`ch` against `--font-ui-medium`. A record's number field already has its own chrome
(`.sheetsmith-record-input`: transparent border, bordered hover, the shared transparent-
field focus). Two fields on one summary line answering a hover two different ways is
precisely the defect §9's "reuse rather than a lookalike" rule exists to prevent — and
here the lookalike would be the *pool's* treatment sitting next to the record's. So the
ceiling input wears **the record's field chrome and the pool's reading**: it carries
both `.sheetsmith-record-input` and `.sheetsmith-pool-max`, and the stylesheet gains
**one rule of two declarations** — the muted colour back (the record input's
`--text-normal` otherwise wins on specificity) and a narrower width, since a ceiling is
one or two digits where a value may be three.

`docs/UI.md` §9's ceiling row gains the editable branch as a second clause rather than
a second row.

### Empty and error states

- **A field with `maxSource: 'record'` and a record with no ceiling** is the ordinary
  state, not an error: `—`, no clamp, and `full` leaves it. Most records in a features
  list are not counters.
- **An empty list** is unchanged: the **Add** control and nothing else.
- **A record whose fence will not read** draws its problem line and no fields at all,
  unchanged. No ceiling is drawn and no write reaches it.
- **Configuration errors.** No new one, and two existing ones are narrowed:
  - the `min` above `max` check fires only where the ceiling is the **field's**. Where
    it is the record's, `config.max` is not read at all, so reporting a relation
    between two numbers the component ignores would send an author to fix a number
    nothing uses.
  - **`max` declared beside `maxSource: 'record'` is not an error.** It is simply
    unused, and it survives untouched, which is Pool's rule verbatim: "a note carrying
    a `max` entry is read in both modes and used only in one." The editor withholds the
    **Maximum** input in that mode, so this arises only from a switch or a hand edit,
    and switching back finds the number still there.
  - **`maxSource` on a field that is not a `number`** is ignored rather than refused,
    on `secondary` and `hideHeading`'s rule: it promises nothing the component would
    have to deliver, and a key a hand-edited layout may carry has to survive the round
    trip. `total` and `publish` are refused because each promises a *name* or a *row*
    that cannot exist; a ceiling source on a toggle promises nothing.

### What happens when a layout later declares a `max` on records that already hold one

Both exist. Constraint 4 says neither may be deleted; §10 says render, do not correct;
neither settles which is drawn. **The opt-in switch is the resolver, and it resolves it
completely.**

- **Switching a field to `'field'`** (or leaving it there) while records hold
  ceilings: the **layout's** `max` is drawn, restored to, and clamped against. Every
  stored ceiling is **carried in the bytes and never rewritten** — including when the
  value beside it is edited, because the join puts the untouched half back. This is
  exactly Pool's calculated mode over a note holding a `max` entry, and it is right for
  Pool's reason: with a layout-declared ceiling, every character on the layout shares
  one statement, and a stale per-record number silently overriding it is the stale
  derived value Table's storage rules refuse.
- **Switching a field to `'record'`** while it declares a `max`: each record's own
  ceiling is drawn, and a record that has none shows `—` rather than inheriting the
  layout's number. **Not inheriting is the decision**: an inherited ceiling would make
  "no ceiling set" indistinguishable from "set to the layout's number", which is
  exactly the distinction `full` has to make below. The declared `max` stays in the
  layout, unused, so switching back restores the previous reading exactly.
- **No character data is deleted in either direction**, and the reason is
  construction rather than care: the ceiling and the value are one entry, and this
  component only ever rewrites an entry whose value the reader changed.
- **The one honest cost**: in `'field'` mode a note may say `2 / 5` while the sheet
  draws `2 / 3`. That is the same read-in-both-modes-used-in-one asymmetry §4.2 already
  records for a Pool, and the alternative — correcting the note to match the layout —
  is the write Constraint 4 exists to forbid.

### `applyReset`

**`empty` is unchanged, and the ceiling survives it.** Zero is zero whatever the
ceiling is. The write goes through the join, so an emptied counter is `Uses: 0 / 3`
and not `Uses: 0` — a reset that deleted the reader's ceiling would be Constraint 4
broken by the one control whose job is to restore.

**`formula` is unchanged in shape**: it writes the resolved number into every number
field, held to that field's own bounds — which now means the *record's* ceiling where
the field has one. `to: '3'` on a record whose ceiling is 2 writes 2.

**`full` is where the work is.**

- A field whose ceiling is the **field's**: exactly as today. Restore to `field.max`,
  and **fail naming the field** where it declares none. Unchanged, and still the right
  answer there — the layout stated one ceiling for every record, so a missing one is a
  configuration nobody can act on from the sheet.
- A field whose ceiling is the **record's**: restore that record's field to that
  record's own stored ceiling.
- **A record with no ceiling set is skipped, not failed, and the whole reset still
  applies.** This is the decision the brief asks be justified, and the justification is
  that the two situations are not the same failure. A Pool with no max has nothing the
  button was for; a *record* with no ceiling is, in the ordinary case, **a record that
  is not a counter** — a passive trait on a features list whose `Uses` field is blank
  on purpose. Failing the whole component would mean one passive trait refusing a Long
  Rest for thirty spells, which is §6's "refusing the whole rest because one component
  is misconfigured is a worse answer" read one level in. The field on that record is
  left exactly as it was; nothing is written.
- **It must not, and does not, silently write 0.** `full` means restore to the ceiling;
  where there is no ceiling there is nothing to restore to, so nothing is written. A
  zero would be a value the reader never asked for in the one action whose job is to
  put a number *back* — the same defect the `formula` action was corrected for.
- **The toggles on a skipped record still reset.** The ceiling bounds one number
  field, not the record; a `Used` toggle beside a blank `Uses` still clears on the
  rest. The skip is per (record, field), like the storage.
- **Nothing is reported, and the explanation is on screen.** `ResetResult` is
  all-or-nothing per component, so a "applied but note this" channel would mean growing
  the contract for one component — refused on §4.1's rule. It costs nothing here,
  because the record whose counter did not move is the record showing `—` in the
  ceiling slot, in the list the reader is already looking at. That is Pool's own
  answer: the placeholder is the explanation.

### The layout editor

**One control, on the number field's own detail line, and `list-fields.ts` still knows
nothing about which component it is drawing.**

`ColumnOptionsSpec` gains `holderMax?: boolean`, default **false** — offered only where
a component asks for it, unlike `total`, `publish` and `hideHeading`, which are
existing controls a component may *withdraw*. Record set sets it true; Table does not,
which is what keeps Table out of this feature.

Where it is set, the `number` branch of the columns list draws a select and hides one
input:

- **Maximum from**, a select. Its two options are composed from the field's own
  vocabulary — `The ${unit}` and `Each ${holder}` — so a Record set reads
  **The field** / **Each record** and the deferred Table version would read
  **The column** / **Each row** with no change to this module. `'field'` is written out
  as absence, per the form's standing rule that a value equal to the effective default
  is omitted.
- **Maximum**, the existing number input, is offered only while **Maximum from** is
  *the field* — `visibleWhen`'s shape, hand-rolled here as the level branch already
  hand-rolls its own conditional inputs. **Minimum** stays either way, because a floor
  is the layout's in both modes.

`contract.test.ts` gains one case: a field spec declaring `holderMax` must offer
`number` among its types, since a per-holder maximum on a list that cannot hold a
number is a control with nothing to attach to. That is the same class of check the
`types`-against-`COLUMN_TYPES` case already is.

**No new `formulaFields` entry**, and it is worth saying: a ceiling here is a typed
number and never an expression, which is the whole of why this feature is separable
from the one below it.

### The sample

A bounded field's sample already draws "a partial of a partial per record, because one
partial gave both records the same number", so an author can see that the *value*
varies per record and the ceiling does not.

**Under `maxSource: 'record'` the two sample records get different ceilings as well**,
and this is the direct extension of that reasoning rather than a new rule: the thing an
author has just turned on is precisely that the ceiling is the record's, and two
records reading `Uses 2 / 3` and `Uses 1 / 2` say it in the picture where
`Uses 2 / 3` beside `Uses 1 / 3` would say the opposite. The ceiling comes from
`sampleNumber` keyed on this list's own seed and the value from `samplePart` of it, so
two record sets in one layout do not draw the same two pairs.

The sample must round-trip byte-identically through this component's own `read` and
`write`, which `contract.test.ts` already asserts — so the composite it writes is the
canonical ` / ` form, forced rather than chosen.

### Narrow width

**This feature widens `docs/UI.md` §12's field-wrap row rather than closing it, and the
row must be re-measured rather than left as it stands.**

§12 records that a six-field record's field cluster wraps inside its own grid track
between about **338px and 361px** of container width, that the 320px container query
was derived for four things where a record can carry six, and that drawing the
read-only ceiling "moved the crowding point by about 16px — a 14px span at a 2px gap"
without being its cause.

An editable ceiling is wider than a span, and it lands on **more fields than the span
did**, which is the part worth being explicit about: under `maxSource: 'record'` the
ceiling slot is drawn on every record whether or not a ceiling is set, because
otherwise there is nothing to type into. So the band moves further left again. The
root cause — a threshold derived for four things on a line an author can build six of —
is untouched, and the mitigation is the opt-in: only a field the layout marked grows
the affordance.

So: **re-measure at the three container widths §12 already names (338, 346 and 361),
restate the band, and leave the row open with its existing "waiting on" unchanged.**
The number goes in from the harness rather than being asserted here.

### The harness

`traits`, the six-field subject §12's measurements were taken on, switches its `Uses`
field to `maxSource: 'record'` and its records to different ceilings; `spells` keeps
`Level` with a declared `max: 9`. That puts a reader-set ceiling and a layout-declared
one on **one sheet at one width**, which is the comparison a design review needs and
which no second subject could give as cheaply — and it holds the field count constant,
so the §12 re-measurement is comparable to the one already recorded.

## Config fields

The component's own `configFields` are **unchanged in number**. One description gains a
sentence and one field gains a `columnOptions` member; both are listed so a reviewer
can see exactly what moved.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `recordName` | `text` | Record name | Unchanged. |
| `fields` | `columns` | Fields | **Amended.** Adds: "A number field's maximum may belong to the field, so every record shares it, or to each record, so a reader types it on the sheet — and a reset restores each record to whichever one applies." `columnOptions` gains `holderMax: true`. |
| `hideLabel` | `boolean` | Hide the heading | Unchanged. |

Per-field keys inside `fields[]` (the layout file, not a `configFields` row):

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `maxSource` | select, on a `number` field | Maximum from | Where the ceiling comes from: **the field**, one number every record is read against, or **each record**, a number the reader types on the sheet beside the value. Each record's own is what a homebrew feature needs, where three characters' copies of one feature have different numbers of uses. A reset set to full restores each record to whichever applies, and leaves a record that has set none alone. Defaults to the field. |

`formulaFields`: unchanged — `fields.*.formula` and `reset.*.to`.

`palette`: unchanged. Neither **Spellbook** nor **Features** prefills `maxSource`. The
Features entry's `Uses` field keeps `max: 1`, which is the once-per-rest counter and
the honest common case; an author whose feature has its own count changes one select.

## Data and file model

`storage: 'markdown'`, one `###` block per record, unchanged. What changes is what one
fence entry may hold.

````markdown
## Features

### Second Wind
```sheet
Uses: 1 / 3
Modifiers: Second Wind
```
Once per short rest, regain 1d10 + fighter level hit points as a bonus action.

### Keen Mind
```sheet
Uses:
Attuned: yes
```
You always know which way is north.
````

**The shape, rule by rule.**

- **An entry is `value / ceiling` where the field's ceiling is the record's**, and a
  bare value where it has none. The separator is a single `/` with whatever whitespace
  the note spells around it.
- **The split is applied to every `number` field's entry**, whatever the field's
  `maxSource` says. The *value half* is always what `typedValue`, `scopeRows`, the
  input and the clamp see; the *ceiling half* is drawn, clamped against and restored to
  only where the ceiling is the record's, and carried untouched otherwise. Gating the
  split on the mode instead would mean that switching a field back to `'field'` turned
  every stored composite into text and poisoned `sum()` with `NaN` — the sharp
  regression named in the model question.
- **The three cases `read` meets**: a bare number is a value with no ceiling; a
  composite is a value and its ceiling; **and text that is neither** — `frog`,
  `2 / lots`, an empty entry — is kept exactly as it is, on `boundedText`'s standing
  rule that replacing what somebody wrote with a number they did not is worse than
  storing it. A blank value half (`Uses:  / 3`) is a blank value, which is what a
  blank `Uses:` already means: zero to a formula, empty in the field.
- **The join is the split's exact inverse**, separator included, and emits no
  separator where there is no ceiling.
- **A canonical ` / ` is used only where this component composes a composite that did
  not exist**, which is a ceiling typed for the first time and the sample. Nothing
  rewrites an existing spelling.
- Everything else — the heading is the name, a record with no fence has no fields, the
  preamble survives, identity is position, order is the file's — is unchanged.

**Round-tripping.** `parse/bounded-entry.ts` splits and rejoins; `RecordEntry.fields`
holds the note's own bytes, so `writeFenced`'s "rewrite only the lines whose value
changed" comparison sees an identical string for anything the reader did not touch.
Constraint 3 holds by construction for the untouched case and by spelling-preservation
for the touched one.

**Existing notes.** No note holds a composite entry, because nothing has ever written
one. A hand-typed one currently reads as text and breaks any aggregate over it; after
this it reads correctly. Nothing migrates and nothing is rewritten.

## Acceptance criteria

- [ ] A `number` field with `maxSource: 'record'` draws an editable ceiling after the
      `/` on every record — Pool's `-ceiling`, `-separator` and `-max` classes, with
      the record's own field chrome — and a record with none shows the `—` placeholder.
- [ ] A field with `maxSource` absent draws exactly what it draws today: a read-only
      span where the layout declares a `max`, nothing where it does not, and a `min`
      alone changes neither.
- [ ] An entry reading `Uses: 2 / 3` reads as value 2 and ceiling 3; `Uses: 2` as value
      2 and no ceiling; `Uses: frog` and `Uses: 2 / lots` are kept exactly as typed,
      with the second's ceiling behaving as none.
- [ ] `sum(features, Uses)` over records storing `2 / 3` and `1 / 1` is **3**, and it
      is 3 whether the field's `maxSource` is `'record'`, `'field'` or absent.
- [ ] Parse then serialise with nothing changed is byte-identical over ten spellings
      of a composite entry: `2 / 3`, `2/3`, `2 /3`, `2/ 3`, tabs around the slash, a
      blank value half, a blank ceiling half, a bare value, a non-numeric ceiling, and
      a composite under a key the layout no longer declares.
- [ ] Editing a record's value where the entry is `Uses: 2/3` writes `Uses: 1/3` — the
      reader's own separator spelling kept — and leaves every other byte in the
      section, including a neighbour's odd spacing, alone.
- [ ] Typing a ceiling into a bare entry writes `Uses: 2 / 3`; clearing a ceiling
      writes `Uses: 2` with no trailing separator; and each of those round-trips.
- [ ] A value committed above the record's own ceiling is held to it, and the
      announcement says "held to 3 of 3". A value committed on a record with no ceiling
      is not clamped and its announcement carries no "of".
- [ ] Lowering a record's ceiling below its value writes only the ceiling: the value
      stays as stored, the field reads `5 / 3`, and no warning treatment appears.
- [ ] The ceiling input is stepped by the arrow keys, is held to the field's `min`
      where one is declared, does not settle arithmetic, and carries
      `aria-label` "&lt;record&gt; &lt;field&gt; maximum" and a `title` naming the
      record as its holder.
- [ ] A note reference committed into either a record's value field or its ceiling
      field is declined with `refuseLink`'s sentence, the field keeps the draft, and
      the note is unchanged. **Driven through both inputs**, because the pre-existing
      hole was invisible to a scan over the offered types.
- [ ] A `full` reset restores every record's counter to that record's own ceiling,
      leaves a record that has set none exactly as it was, still sets that record's
      toggles, and returns success for the component.
- [ ] A `full` reset on a field whose `maxSource` is `'field'` and which declares no
      `max` still fails naming the field, unchanged.
- [ ] An `empty` reset writes `Uses: 0 / 3` and never `Uses: 0`: no reset action
      deletes a reader-set ceiling.
- [ ] A `formula` reset holds its resolved number to each record's own ceiling.
- [ ] A field switched from `'record'` to `'field'` draws the layout's `max`, leaves
      every stored ceiling in the note untouched, and an edit to the value beside one
      preserves it; switching back finds every ceiling still there.
- [ ] A field with `maxSource: 'record'` and a declared `max` is not a configuration
      error, ignores the `max`, and does not report a `min` above it.
- [ ] `maxSource` on a `toggle`, `level`, `computed` or `modifier` field is ignored,
      draws nothing, and survives the round trip.
- [ ] The layout editor offers **Maximum from** on a `number` field only where
      `columnOptions.holderMax` is set, composes its two options from `unit` and
      `holder` so no component name appears in `list-fields.ts`, and withholds
      **Maximum** while it reads *each record*. Table's columns list is unchanged.
- [ ] `contract.test.ts` fails a `columns` field declaring `holderMax` without
      offering `number`.
- [ ] The sample for a field with `maxSource: 'record'` gives the two records
      **different** ceilings, and the sample round-trips byte-identically through
      `read` and `write`.
- [ ] `git diff --stat` shows no change to `src/components/typed-value.ts`,
      `src/components/table.ts`, or any other component.
- [ ] `npm test`, `npm run lint` and `npm run build` are green.

**Look criteria**, in the harness at 1400px and 520px, both themes:

- [ ] A reader-set ceiling at rest is indistinguishable from a layout-declared one:
      same size, same muted colour, same tabular figures, and the slash sits between
      two things that read as one number. `traits` and `spells` on one sheet is the
      comparison.
- [ ] The ceiling field's hover and focus match the value field's on the same line,
      not the pool card's. Two fields, one treatment.
- [ ] A record with no ceiling reads as a blank waiting to be filled — `Uses  / —` —
      rather than as a broken or missing value, beside records that have one.
- [ ] Re-measured at container widths 338, 346 and 361 on the six-field `traits`
      subject: the new crowding point recorded, `docs/UI.md` §12's row updated with it,
      and the row left open.
- [ ] Forced colors: the ceiling field is distinguishable from the ceiling span it
      replaces, and the placeholder survives.

**Vault fixture** (`~/Developer/sheetsmith-test-vault`, with both files also in
`src/test/fixtures/records/` and driven through the real parsers by
`src/view/vault-fixture.test.ts`, on the existing Record set fixture's own terms):

`Sheetsmith layouts/Record variations.json` gains a `maxSource: 'record'` on one
`number` field beside a field that keeps a declared `max`, and its Long Rest binding
stays `full`. `Characters/Records.md` gains a record with a ceiling, a record with none,
a record whose ceiling is above its value, one whose ceiling is below it, one whose
ceiling is not a number, and one composite entry written with no spaces around the
slash. **The press list**: type a ceiling on a record that had none and check the note
holds `key: value / ceiling`; clear it and check the note holds a bare value with no
trailing slash; press Long Rest and check that the counters with ceilings are restored,
the one without is untouched, and every ceiling is still in the file. Aramil and
`DnD 5e Caster` are not touched.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. `fix: Decline a note reference typed into a record's number field`. `refuseLink`'s
   call sites extended to the `number` field's commit. Pre-existing, stands alone, and
   ordered first because the ceiling this feature adds is a second input on the same
   route.
2. `feat: Split a record's fence entry into a value and its ceiling`.
   `parse/bounded-entry.ts` and the component's use of it: every `number` field's entry
   is read as a value and an optional ceiling, and every write rejoins it. No config
   key and no UI, so the behaviour change is confined to a note that already held a
   composite. Carries the round-trip cases.
3. `feat: Let each record hold its own ceiling`. `maxSource` on `RecordField`, the
   editable ceiling and its placeholder, the clamp and the announcement against the
   record's own number, the two narrowed configuration checks, the one stylesheet rule,
   the sample's per-record ceilings, and the harness subject.
4. `feat: Restore each record to its own ceiling`. `applyReset`'s `full` reading the
   record's ceiling, the skip for a record that has none, and `empty` and `formula`
   preserving what they write beside.
5. `feat: Offer a per-record maximum in the layout editor`.
   `ColumnOptionsSpec.holderMax`, the **Maximum from** select and the conditional
   **Maximum** input in `list-fields.ts`, and the contract check.
6. `docs: Record where a record's ceiling comes from`. §4.2's Record set entry, §13's
   new entry with its `Resolved:` line and the correction to the Record set entry's
   "what stays closed" list, `docs/UI.md` §9's ceiling row gaining the editable branch,
   and §12's field-wrap row re-measured.

## Deliberately not doing

- **A per-record ceiling that comes from a formula.** `max` stays a literal. The Record
  set entry's reason is unchanged and is the reason this feature exists separately from
  it: resolving an expression in the record's own scope inside `applyReset` is a second
  failure path on a control that already has one. A reader-typed ceiling and a computed
  one are different features; this is the first, and `maxSource` is a string union
  precisely so the third source can be added without replacing a boolean.
- **The same treatment for Table's `number` columns.** Table has the identical
  ambiguity — `boundedText` clamps to a ceiling nothing on screen states — and it is a
  separate design question because a Table cell sits under a `<th>` in a tabular grid,
  so the ceiling either repeats in every row or moves into the header. **The design
  keeps this feature out of Table by construction**: the split lives on Record set's
  side of the call, `typed-value.ts` goes on meaning one number, and
  `ColumnOptionsSpec.holderMax` defaults to false so the editor control is not offered.
  What the deferred version would inherit is the parse module and the editor's
  vocabulary composition, which already reads **The column** / **Each row** with no
  change to `list-fields.ts`.
- **A ceiling on a `level` field.** Levels are named and their count is their ceiling.
- **Publishing the ceiling.** `spells.Fireball.max` does not exist and cannot, for the
  reason `spells.Fireball` does not. Stated in the model question so nobody wonders.
- **A row-scope name for the ceiling**, so `count(features, Uses < max)` is not
  writable. Named as a cost; it waits with the formula ceiling.
- **A warning treatment for a value above its ceiling.** The reading `5 / 3` says it,
  and adding a status colour to the shared ceiling vocabulary would be a lookalike in
  behaviour where §9 forbids one in CSS.
- **Arithmetic in the ceiling field.** Pool has it; the record's value field beside it
  does not, and two commit rules on one line is what this whole document argues
  against. If it arrives it arrives on both halves at once.
- **A "restored what it could" channel on `ResetResult`.** Growing the contract for one
  component, where the `—` on screen already explains the record that did not move.
- **Anything about the disclosure, the modifier field, the body, or the reset actions
  beyond what a ceiling forces.**
- **The five backlog rows Record set left behind**, and every entry in that feature's
  own **Deliberately not doing** list except the per-record ceiling, which this
  overturns.
