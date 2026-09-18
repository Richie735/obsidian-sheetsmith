# Rows a character adds to a Track

Status: shipped
Board card: A Track row the character invents — a named counter this actor keeps
and no other does, with its own number of segments, sitting beside the rows the
layout declared.

## Model question

Yes, and §13 carries no bullet for it. Writing one is part of this spec, the way
`docs/features/promoted-fields.md` did: the question was asked and settled in
conversation, and the entry `/land-it` will place is at the end of this section.

**The owner has taken all three answers.** What follows records the arguments,
because a spec that only asserted them would leave the next reader re-deriving
them from `docs/features/open-rows-for-table.md` — which answers the same three
questions the *other* way on two of them, and a reader who finds that first will
read this as an inconsistency rather than as the file model biting.

The questions are the three `open-rows-for-table.md` had to answer, asked of a
fenced component instead of a markdown one:

1. What identifies a row the character added?
2. What does it publish?
3. Where does its ceiling come from?

### Part 1 — identity is the character's typed name, and it is the fence key

**A character-added row is one entry in the section's `sheet` fence, keyed by the
name the character typed.** `Longsword: 2 / 4`.

**Why the fence forces the opposite answer to Table's.** `open-rows-for-table.md`
chose position, and its stated reason is that position "is not derived from
anything the user types". That reason does not transfer, because **a fence has no
ordinal the format states.** A markdown table is an ordered list of lines and a
row *is* its line: `parse/table.ts` can address the third row because the third
row is a thing the file has. A `sheet` fence is a set of `key: value` lines whose
only address is the key — `readFenced` returns a `Map` keyed by it, `writeFenced`
rewrites the line whose key matches, and every component over this storage
(`card.ts`, `card-set.ts`, `pool.ts`, `track.ts`, `roster.ts`, `passport.ts`)
addresses by key and nothing else. Reaching for position here would mean
addressing an entry by how far down the fence it sits, which is a property the
format does not claim: a hand-editor is told "one line per declared field", not
"line four is the fourth field", and re-ordering the lines by hand is a thing
§3.1 invites and must not break.

So the choice is between the key the character types and a key the plugin
generates.

**The generated key is rejected twice over.** `open-rows-for-table.md` already
rejected opaque generated ids on readability — "it also puts a column of noise
into a file whose whole promise is that it stays readable and hand-editable
(§3.1)" — and a fence is *worse* than a table here, because a generated key would
sit at the front of every line, where the name the reader is looking for should
be. `row_8f2a: 2 / 4` with the name stored… where? Beside it, which is the second
key `docs/features/per-record-ceiling.md` spent its model question refusing:
"given `Uses` and `Uses max`, `read` cannot tell a ceiling from a field the layout
dropped, so the second entry is either claimed (breaking §10) or orphaned". A
generated key plus a name key is the same shape, with the same §10 problem and
none of the composite's escape.

**The typed name is therefore the only identity a fence has**, and it is the only
one that stays hand-editable. A player who opens their note in a Markdown pane
sees `Longsword: 2 / 4` and can change either number, rename the row, or add
another line — all of which is what §3.1 promises and none of which is true of a
generated key.

**What that costs, stated rather than hidden.** Identity by typed name inherits
exactly the three failures `open-rows-for-table.md` names for keying a table by
its first cell, and each has to be answered here rather than designed around.
Two daggers cannot both be called `Dagger`; a duplicate key is a whole-section
failure in this storage rather than a silent second row; and capitalisation is
load-bearing in a way it is not on a table. **Design** answers all three, and
the answers are the sharpest part of this spec.

### Part 2 — it publishes nothing, and Track has no escape hatch

**No `<id>.<key>` for a character-added row, no `.left`, and Track does not gain
`scopeRows`.** Consistent with Table and with Record set, which publish nothing
for a character-added row and no names at all respectively.

This is not a new guard. `scopeValues` builds `named` from `config.rows`
([track.ts:845](../../src/components/track.ts#L845)), so a row that is not in the
config appears nowhere in it — `declared-row-publication.md`'s own sentence, one
component over: "this is not a new guard; it is what building from the config
rather than the data means."

**The first argument is the one the claim rule was written against.** A name that
resolves only because somebody typed it is CSB #313's failure class: a formula
naming a row broke on capitalisation, and the shipped fix was a regex. `d6` and
`D6` are two entries in this fence, byte-exact and case-sensitive, so
`hit_dice.d6` resolving or not would depend on which of the two spellings a
player happened to type on a Tuesday. Nothing in §5 can express "this name means
whichever of these two things exists".

**The second argument is sharper and is specific to this component.** **Track has
never gated a row key on `isName`.** Table refuses a declared row's publish key
that is not a formula-legal name, in its own words and with the fix
([table.ts:707](../../src/components/table.ts#L707)); Track's configuration check
refuses only a blank key, a colon, a line break and a duplicate
([track.ts:244-252](../../src/components/track.ts#L244)), and `scopeValues`
publishes whatever is there. So publishing a character-typed name would publish
`Longsword` and fail to publish `Bag of Holding`, which is
`open-rows-for-table.md`'s own verdict on `total` over a computed column: "one
name meaning 'publishable, sometimes' is worse than a refusal that says why".
Gating it on `isName` instead would mean a character learns the expression
language's name grammar to name their own counter, which is the authoring wall
that feature exists to stay off.

**The accepted cost, stated plainly.** A character-added row is **inert to
formulas**. That is the Roll20 second-class outcome the research names as the
thing to avoid, and unlike an open Table it has no partial answer: a Table
declares no row names either, but it publishes a column total and can be walked
by `sum()` and `count()`, so *something* about the rows the character added is
reachable. **Track has neither.** It declares no `scopeRows` today and gains none
here, so a character-added row is reachable by nothing at all — not by name, not
by aggregate, not by total.

**Why `scopeRows` is not the fix, stated so a reviewer does not report its
absence as a gap.** An aggregate over a Track's rows would answer "how many
segments are filled across every row" — a number no surveyed system wants and one
that mixes a character's invented counters in with the layout's declared ones,
which are the two kinds of thing this feature exists to keep distinguishable.
The demand that would change the answer is a real one asking to total a Track,
and it would be a feature of its own with §5's "one unreadable row fails the
whole aggregate" rule to settle first.

### Part 3 — the character types the length, in the composite already there

**The length is a number the character types, stored in the existing composite
`key: filled / length`**, which is `maxSource: 'character'`'s storage shape
reused whole: `parse/bounded-entry.ts`'s `splitBounded`/`withCeiling`,
`characterLength` ([track.ts:514](../../src/components/track.ts#L514)),
`refuseRowLength`'s slash refusal
([track.ts:558](../../src/components/track.ts#L558)), and the length field's own
`.sheetsmith-track-row-length` wrapper.

**The mode is implied by the key not being declared.** There is no stored flag
saying "this row is the character's" and no third value of `maxSource`. The rule
is one sentence — *an entry whose key no declared row spells is the character's*
— and it is the same shape as Table's claim rule with the scan replaced by a map
lookup. Nothing has to be written into the note to record who owns a row, which
is what makes the toggle reversible in both directions with no data loss.

**Why the length is not a formula, and what that costs.** Five surveyed systems
derive a track's length from another value: Vampire V5 health is Stamina + 3,
Shadowrun's condition monitor is `ceil(Body / 2) + 8`, Cyberpunk RED humanity is
Empathy × 10, Pathfinder 2e's focus pool and Genesys strain likewise. **A
declared row answers all five**, because `rows.*.count` is a formula field. **A
character-typed number answers none of them.** That is a real limit and it is
recorded rather than worked around, because the thing that would lift it — a
character typing an expression against a row they invented — is the open §13
question on whether a character may override a single formula locally without
forking the layout, and it is broader than this feature. `track-row-length.md`
declined to settle that question for a *pre-declared, opt-in switch on one
field*; this is further from settling it, not nearer, because here there is no
declared field for an override to attach to.

### What this does not reach

**The scene or party tracker stays exactly as open as it was.** §13 asks whether
a tracker belonging to a scene or a party has a home here, and this feature does
not move it. The evidence pulls at it and that is worth recording: a Blades
progress clock is 4, 6, 8 or 12 segments chosen by complexity and owned by the
GM, a PbtA countdown clock belongs to the threat rather than to any character,
and 2d20 momentum is a pool the whole table spends from. **A fixed menu of
lengths was on the table and was not taken**, on the ground that those trackers
belong to the table rather than to a character: offering 4/6/8/12 as a choice
would be this plugin taking a position on a shared object it has no home for,
inside a component that lives in one character's note. What this feature gives a
GM is a character note of their own holding named counters, which is the
single-player half §13 already calls "a single-player question rather than a
multiplayer one" — and it leaves the multiplayer half untouched.

**The counter-examples this design does not cover, named honestly.** "The player
types a name and a count" assumes five things, and the cases below satisfy some
and not others.

- **Delta Green's bonds break it outright.** A bond is a single rating, not a run
  of segments, so there is nothing to fill in. Its number is not typed: every
  bond starts at the agent's Charisma score, identical across all of them, and
  drifts up and down through play, so the value a Track would call a ceiling is
  itself the thing that moves. How many bonds an agent may hold is fixed by
  profession, two to four, so the player names them without choosing how many
  rows exist. And a bond is created or destroyed by an event in the fiction, not
  by opening a control once. Of the five assumptions bonds satisfy only the
  name, and that name is a person rather than a resource. **Bonds are a Table
  with `openRows` on and a `number` column, and this feature does not claim
  them.**
- **5e multiclass hit dice is the milder and likelier break.** Which die-type
  rows exist is a consequence of class levels, so a player hand-adding a `d10`
  row is retyping something the sheet already knows. That case is
  `track-row-length.md`'s — four declared rows, `maxSource: 'character'`, add the
  ones you have — and it stays there. **This feature is for a row the layout
  could not have anticipated**, which hit dice is not.

The cases it does cover are the ones asked for literally: a freely named counter
attached to this actor and no other ("number of kills"), and a progress clock
whose number of stages the character chooses rather than a fixed four.

### The §13 entry to place at land time

Not written into `docs/SPEC.md` here — `/land-it` places it, because nothing is
resolved until it is built. This is the text.

> - **What identifies a Track row the character added, what it publishes, and
>   where its length comes from.** Track's rows are entries in a `sheet` fence,
>   so the answer `docs/features/open-rows-for-table.md` gave for a markdown
>   table cannot simply be ported: that feature chose position as a row's
>   identity precisely because position "is not derived from anything the user
>   types", and **a fence has no ordinal the format states**. Its only address is
>   the key, every component over this storage addresses by key and nothing else,
>   and §3.1 invites a hand-editor to re-order the lines.
>
> Resolved: **the character's typed name is the fence key, a character-added row
> publishes nothing, and the character types the length into the composite
> `key: filled / length` that `maxSource: 'character'` already uses.**
>
> **The typed name is the only identity a fence has, and the generated-key
> alternative loses twice.** It puts a column of noise at the front of every line
> of a file whose whole promise is that it stays readable and hand-editable —
> `open-rows-for-table.md`'s own readability argument, sharper here because the
> key is where the name should be — and it needs a second key beside it to hold
> the name, which is the shape `docs/features/per-record-ceiling.md` refused
> under §10: given two keys, `read` cannot tell one of them from a field the
> layout dropped, so the second entry is either claimed or orphaned. The cost is
> that identity by typed name inherits every failure of keying by a name: two
> rows cannot share one, a duplicate key is a whole-section failure in this
> storage, and capitalisation is load-bearing. **The design answers those with
> one rule — the fence is exact everywhere and the input's guard is lenient
> once** — so the plugin never creates a collision and never folds one a
> hand-edit made.
>
> **A character-added row publishes nothing**, consistent with Table and Record
> set, and the accepted cost is that it is inert to formulas. A name that
> resolves only because somebody typed it is the CSB #313 failure class the claim
> rule was written against, and **Track has never gated a row key on `isName`**
> the way Table gates a declared row's publish key, so most typed names would
> publish names no formula can spell — "publishable, sometimes", which
> `open-rows-for-table.md` already judged worse than a refusal that says why.
> Unlike an open Table, Track has **no aggregate escape hatch**: it declares no
> `scopeRows` and gains none here, so nothing at all about a character-added row
> is reachable, rather than the row names being unreachable while a total is not.
>
> **The character types the length**, into the composite `key: filled / length`
> that `maxSource: 'character'` already stores, reusing `splitBounded`,
> `characterLength` and the slash refusal unchanged. **The mode is implied by the
> key not being declared** — no stored flag, no third `maxSource` value — which
> is what makes the toggle reversible with no data loss in either direction.
>
> **What it does not reach.** A character-typed *formula* for the length, which
> would answer the five systems that derive a track's length from another value
> (Vampire V5 health, Shadowrun's condition monitor, Cyberpunk RED humanity,
> Pathfinder 2e's focus pool, Genesys strain) — all five of which a *declared*
> row already answers, `count` being a formula field, and none of which a typed
> number does. That is blocked on this section's own open question about whether
> a character may override a single formula locally without forking the layout,
> and this feature moves it no nearer. **And the scene or party tracker question
> above is not moved either**: a fixed menu of clock lengths was considered and
> not taken, on the ground that a Blades clock, a countdown clock and a momentum
> pool belong to the table rather than to a character
> (`docs/features/character-added-track-rows.md`).

### The contract does not grow

Nothing changes in `src/types.ts`'s `ComponentDefinition`, `RenderContext`,
`ScopeEntry` or `ScopeValues`. What changes is inside `track.ts`, one config
field, one editor field, and `TrackData` — the component's own data shape — which
gains two members: `own`, the character's keys in the note's own order, filled by
`read` and never by a delta; and `rename`, a one-gesture delta. `renameFencedEntry`
gains its first caller from a component; it has been pure, exported and tested in
`src/parse/fenced.ts` since it was written, with `component-rename-migration.ts`
as its only consumer.

## What it does

A Track may let the character add rows the layout never declared, each with a
name they type and a number of segments they choose, drawn beside whatever rows
the layout did declare. A player keeps a `Kills` counter nobody else's sheet has;
a GM runs a six-stage clock on a card the layout only said could hold clocks. The
rows are the character's to rename and remove, they survive a layout edit
untouched, and no formula can name one.

## Smallest version

`openRows` on Track, plus an **Add** panel taking a name and a length, writing
`<name>: / <length>` as an entry no declared row maps to; the row then draws,
stores and resets exactly as a declared `maxSource: 'character'` row already
does, and **Remove** deletes it. What it gives up: renaming in place, so a typo
is fixable only by removing and retyping, which loses the marks; the length
field's prefill from the card's own `count`, so a layout cannot seed a clock's
usual size; and the sample's character-added row, so an author does not see the
toggle's effect on the editor canvas until they open a character. The rename is
the one worth arguing over, because remove-and-retype is data loss the reader
chose rather than data loss the plugin caused, which is the line Constraint 4
actually draws.

## Design

### One boolean, named the way Table's is

`openRows?: boolean` on `TrackConfig`, default false, absent from every layout
that does not ask for it. The same key and the same label Table carries, because
§2 names a thing for what it is and this is the same thing: whether characters
may add rows. A component never imports another component, and this is a
vocabulary decision rather than shared code.

**With the toggle off, every path in this file is exactly the one that is there
today**, including `read` dropping an entry no declared row maps to. That is not
a courtesy; it is what keeps the re-cut guarantee below, and a test pins it.

### It makes the card a row set, always

`isRowSet(config)` reads true where `openRows` is on, whether or not `rows[]`
holds anything. Without that, `runsOf` synthesises `{ key: VALUE_KEY }`
([track.ts:199-203](../../src/components/track.ts#L199)) and the card is one
anonymous run storing under `value` — which is the key §3.1 reserves for a
single-value component, and which a character could then collide with by typing
it. So a card with `openRows` on and no declared rows is a row set holding no
declared runs: it draws its label and one **Add** trigger, and publishes no bare
id, exactly as any other row set does.

Two consequences follow and both are refusals in the configuration check, which
reports on this component alone per §10:

- **`openRows` with `levels` is refused.** "Named steps are one run's meaning and
  rows are many runs' identities" is already §4.2's sentence for `rows` against
  `levels`; `openRows` joins `rows`'s side of it and changes that rule in no
  other way. `count` against `levels` is likewise untouched.
- **`openRows` on a flag card is refused**, naming the fix (raise the segment
  count, or turn the toggle off). `isFlagCard` already refuses to call a
  character-owned row a flag, in its own words:
  [track.ts:471-476](../../src/components/track.ts#L471) skips any row whose
  `maxSource` is `'character'` "whatever `row.count` happens to say". Every
  character-added row is character-owned by construction, so `openRows` on a flag
  card would create exactly the row that refusal says cannot exist. `isFlagCard`
  also gains one defensive clause — **an empty run list is not a flag card** —
  because `every` over `[]` is vacuously true and `runsOf` can now return an
  empty list for the first time.

### What the reader sees

```
Kills
  Goblins   [ 6 ]  ▨▨▨▨▢▢
  Dragons   [ 3 ]  ▨▢▢
                  + 🗑
```

A character-added row draws in the same three subgrid columns a declared row does
— name, length, run — and the only visible difference is that **its name is a
field rather than static text.** That is the same read-only/editable split Table
already draws over a declared row against a character's own. No badge, no glyph,
no second treatment.

**What that buys at rest is less than this section first claimed, and the
correction is the design reviewer's rather than a concession.** It read "it is
the whole of how a reader tells who owns a row", and at rest it is not: a
chromeless field is a field precisely because it looks like text, so the four
names on a mixed card are identical in colour, size and weight until something
is pointed at them. Ownership becomes legible **on hover, on focus, and in the
Remove list**, and those are real answers — but they are answers to a gesture,
not to a glance.

**The sharper half is that "a field means mine" is contradicted on this very
card.** A declared row whose `maxSource` is `'character'` draws a length field
of its own, `.sheetsmith-pool-max-input`, one column to the right — so a reader
who learned the rule from the name column meets a field in the next column that
means the layout's. The rule was never "a field means mine"; it is "the *name*
being a field means mine", which is a finer distinction than a card can teach.

What a reader actually has at rest is **order** — declared rows first, the
character's after — and nothing on screen states that. The cue that would fix it
outright is a badge or a glyph, which this section rules out two sentences up and
which the owner has kept ruled out. **So this is accepted rather than
overlooked**: the behaviour ships, and the claim is narrowed to what the screen
delivers.

Order: **declared rows in `rows[]`'s own order, then the character's in the note's
own order.** Table's order exactly, and the only order the file itself states.

**Nothing may take a draw order off `Object.keys(data.values)`.** `read` copies
`readFenced`'s `Map` into a plain object ([track.ts:152](../../src/components/track.ts#L152),
filled at [:757](../../src/components/track.ts#L757)) and a plain object puts
integer-like keys first in numeric order however they were inserted — so a
character who names a row `1` would see it jump above every other row, and `write`
would append a new one in the wrong place. `TrackData.own` is what the order is
read off instead: the keys no declared row maps to, in note order, filled by
`read`. A test drives a fence whose first entry is `10` and whose second is
`Goblins` and asserts both the draw order and the bytes.

### The Add panel, which is where a name is checked before it exists

`openRows` does not change what the **Add** trigger is
(`.sheetsmith-track-action-button`, `aria-haspopup="dialog"`, the second-press
toggle read off `openAnchoredPanelKey()`), and it does not change what its panel
already holds: one `.sheetsmith-panel-line` per not-yet-added declared row, in
declared order. **It appends a form below them**, separated by the panel's own
rule: a **Name** text field, a **Length** number field, and one **Add** button.
Enter in either field submits. Where the card has no declared rows to offer, the
form is the whole panel and the trigger is drawn whenever `openRows` is on,
rather than only while something is left to add.

The panel is `ui/anchored-panel.ts`, which exists precisely to hold controls —
"`Menu` closes on selection and `MenuItem` takes a title, an icon and a click, so
it hosts no controls at all" — and the modifier form is the precedent for a form
inside one. `panel.place()` after a refusal message appears, so a panel anchored
above its trigger does not drift off it when it grows a line.

**The name is typed before the entry exists, and that is the load-bearing
decision.** Record set's **Add** writes a record named after the noun and lands
focus in its name field, which works because a record's identity is its position
and two records called "Shield" are two records. Here the name *is* the key, so a
placeholder pressed twice would be a duplicate — and a duplicate key is not a
second row, it is a **whole-section failure**: `Duplicate key "…" in sheet block.`
([fenced.ts:83-85](../../src/parse/fenced.ts#L83)), which takes the entire card
down. Uniquifying a placeholder would be name-plus-occurrence, the syntax
`open-rows-for-table.md` rejected for inventing something the note does not
contain. So the name is typed into the form, checked there, and only then
written. **Nothing the reader can do through this plugin can put the section into
the duplicate-key state.**

**The Length field is prefilled from the card's own `count` where the layout sets
one and it resolves**, and the character may overwrite or clear it. This is what
lets a layout say "a clock here is usually six" without a second storage mode:
`count` is a *seed for the field*, consulted once at the add and never again.
Once the entry exists, its length is the stored one and only the stored one —
`countFor`'s `'character'` branch is untouched, and a character-added row with a
blank length has no length, exactly as a declared one does. The field is
optional: blank writes a bare `<name>:` entry and the row draws with `—` and no
run, which is the state `track-row-length.md` already calls "added, empty".

On submit: the panel closes, `context.onChange` reports one new key,
`awaitingAdd = { id, key }` is set before the change as it already is, and focus
lands in the new row's length field on the next render — the existing mechanism,
unchanged, because the reader who cleared the prefill needs to be there and the
run is one Tab away for the reader who did not.

### What the name field refuses, and where

One list, two callers: the Add form's **Name** field and a drawn row's own name
field, which is the rename below. Each refusal keeps the draft and says its own
sentence, except the blank, which restores the stored name — Record set's
precedent and its argument, that keeping an empty draft leaves a blank field with
a message beside it where the name actually stored would say more.

1. **Blank.** "A row needs a name." A fence entry with no key is not an entry,
   and `ENTRY`'s own regex would read a whitespace-only key back as the empty
   string.
2. **A colon or a line break.** `fencedKeyProblem`'s clause with this component's
   own subject — the shared sentence, already read at two moments, and this is
   the third.
3. **A note reference.** `fencedLinkRefusal`, Constraint 2: Obsidian indexes no
   link inside a code fence, so a name holding one would create a link that never
   appears in backlinks, graph view or a rename. `refuseRowLength` already says
   this for the length field one function over; the name field says it with its
   own subject.
4. **`value`.** §3.1 reserves it for a single-value component and `runsOf`
   synthesises it for a plain run, so an entry under that key would become the
   card's own run the moment an author turned `openRows` back off.
5. **A name already taken.** Any declared row's key, or any key already in this
   character's fence — **compared case-insensitively**, naming the spelling that
   is already there so the reader can see what they collided with.

### Exact everywhere, lenient once

This is the answer to three separate traps and it is one rule:

> **The fence is exact. The input's guard is lenient. Nothing in between.**

**Exact**, byte for byte and case-sensitively: what `readFenced` stores, which
declared row an entry maps to (`data.values[row.key]`, a map lookup, as it is
today), what `write` addresses, what `renameFencedEntry` calls a collision, and
what the note keeps as its own spelling. `d6` and `D6` are two entries and both
survive.

**Lenient**, exactly once: the guard that decides whether the *input* may create
a name. It folds case, and it folds in the refusing direction.

**`parse/row-claims.ts` is not reused, and that is deliberate.** `claimRows`
matches case-insensitively, which is safe on a Table because "no formula names a
row, so what a row's capitalisation can change is which declared row claims it,
never what any arithmetic resolves" — and because a table scan can pick a
*different* line than an exact match would without anything else in the component
disagreeing. Here the rest of the component addresses by exact key: `read`,
`write`, `applyReset` and `scopeValues` all index `values` by `row.key` directly.
A lenient claim would have a declared `d6` claim a note's `D6` while every other
path went on looking for `d6` and finding nothing — a fold in one place and not
in the others, which is precisely the failure mode of the export that produced
1,899 files where 1,906 were expected. So the claim stays exact and the
vocabulary is all that carries over: `TrackData.own` is named after `RowClaims.own`,
"note rows no declared row claimed, in note order: the character's own".

**What the reader actually meets, in each direction.**

- A note carrying `Priority` and `priority` **reads, and draws two rows**, both
  editable, neither folded, neither lost, each keeping its own spelling. The
  plugin will not create that pair — the guard refuses the second — and it will
  not repair one either, because repairing means writing over a name the user
  typed. The vault that had exactly this had one of the two recognised and no
  automatic merge, and the repair affected Dataview vault-wide; refusing to
  create it and refusing to fold it is how this design avoids both halves.
- A note carrying `Longsword` twice **fails the whole section** and always has:
  `Duplicate key "Longsword" in sheet block.`, drawn on this card alone per §10,
  with the rest of the sheet rendering and editable. The note is not touched, and
  the fix is to rename one of the two lines by hand. Unchanged behaviour; this
  feature only makes it reachable by hand-editing, never by a control.
- A note carrying `D6` where the layout declares `d6` draws **two rows**: the
  declared `d6`, empty, and a character-added row called `D6`. That is the honest
  consequence of exactness, and it is *visible* — two rows on screen — rather than
  silent. Leniency would have produced one row and quietly dropped a line's worth
  of a player's marks, which is the loss §10 exists to refuse.

**Where this design is lenient is therefore one function, reached from two
fields, and it can only ever prevent a write.** Nothing in the lookup chain
folds.

### Renaming a row, and what it does to the stored value

**A character-added row's name is editable in place.** `bindEditable`'s rules —
live display, committed on blur or Enter, Escape restoring and announcing — and
the refusals above. A declared row's name stays static text.

Renaming is the only way to fix a typo without losing the marks, which is why it
is in the design rather than deferred: **Remove** deletes the entry whole, marks
and length together, so remove-and-retype costs a session's worth of marked
segments.

**What it does to the stored value: nothing.** `renameFencedEntry` rewrites the
key token alone and puts the separator, the value, the trailing text and the line
ending back verbatim — that is its stated contract and its test file drives it.
`Longswrd: 2 / 4` becomes `Longsword: 2 / 4` with the marks, the length, the
spacing and the position of the line untouched.

**Why not a delete-plus-add delta.** `writeFenced` flushes a key it did not find
at the fence's closing line, so writing `{ old: null, new: value }` would delete
the line in place and append the row at the bottom — a rename that silently
re-orders the reader's note. `renameFencedEntry` exists for exactly this and has
had no caller from a component; this is the first.

`TrackData` gains `rename?: { from: string; to: string }`, singular because one
gesture reports one rename (`PATTERNS` §7). `write` applies it to the body
*before* `writeFenced` runs, so a rename and an unrelated value edit in the same
commit cannot address a key that no longer exists. A `collision` verdict coming
back from `renameFencedEntry` is a state the input's guard already excluded, so
it is handled defensively: the stored name is put back and the card says so,
rather than the write being attempted and half-applied.

**`component-rename-migration.md`'s boundary does not cover this, and does not
need to.** That migration's scope is "every author-declared name that addresses
one entry in a `sheet` fence", and it walks every character note on the layout
because an author-declared name addresses data in all of them. A character-typed
key addresses data in **one** note, so renaming it is an ordinary sheet edit
rather than a vault walk. Nothing in `src/component-rename-migration.ts` changes,
and a reviewer should not read its silence as a gap.

### Removing a row

The **Remove** picker's list gains the character's rows, after the declared
character-owned ones, in the same note order the card draws them. The gesture is
unchanged: picking arms the line and the row it names, relabels the line to
`armedName`'s sentence and announces `armedPrompt`'s; picking the same line again
writes `null` for that key and closes the panel; picking a different line disarms
the first; dismissing the panel stands the armed row down silently, announcing
`STOOD_DOWN`.

**It confirms**, for the reason `track-row-length.md` already gave and which is
stronger here: an added row can be several sessions' worth of marked segments,
and unlike a declared row **it does not come back.** Removing a declared row puts
it back in the **Add** panel's list; removing a character-added row deletes the
only record that it ever existed, and re-creating it means typing the name again.
That difference is the one thing about **Remove** this feature changes, and the
armed line says the name so the reader reads it before the second pick.

`writeFenced` deletes the whole line for a `null` and leaves every other byte
alone — the primitive `track-row-length.md` already made a caller of, doing the
same work for a key that happens to be the character's.

### Resets reach a character-added row, on identical terms

A character-added row is inert to formulas and **is not inert to triggers**,
which is the one place the second-class outcome is avoided rather than accepted.
`applyReset` walks the character's rows beside the declared ones and the three
actions read exactly as they do today for a declared `maxSource: 'character'`
row:

- **`empty`** zeroes the marks through the join, keeping the length.
- **`full`** restores a row with a length to it, and **skips, without failing the
  rest of the reset**, a row whose length is blank.
- **`formula`** resolves one segment count for the component and applies it to
  every row through the join.

And the rule under all three is unchanged: **a reset never creates a row and
never removes one.** It cannot create one here either, because there is no
declared row for it to materialise — every key it could write is one the note
already holds.

### A layout change that arrives after the data

Two cases, and the second is the sharp one.

**An author declares a row under a name a character already invented.** The entry
is `Longsword: 2 / 4`; the layout now declares `rows[]` with `key: "Longsword"`.
On the next read the entry maps to the declared row — the declared row claims what
is already there, exactly Table's fourth case, which "is not a case at all". The
marks survive whole. What happens to the typed length depends on the row's mode,
and both answers are already this component's:

- `maxSource: 'character'` — the length goes on being read as the character's.
  The only visible change is the name going read-only. **It keeps its place in
  the `Remove` list**, which this section originally had backwards: a declared
  character-owned row is exactly what that picker has listed since
  `track-row-length.md`, where removing one takes it back to the un-added state
  and puts it on the **Add** panel's list. What changes is what **Remove** now
  *means* for that row — it becomes reversible, where a row the character named
  does not come back.
- `maxSource` absent or `'calculated'` — the row **does** leave the **Remove**
  list, because nothing about it is the character's to remove any more; the
  layout owns its length and the entry is data under a declared key.
  `splitBounded` is applied to every row's
  entry whatever its mode, so `read` takes the value half and the layout's formula
  supplies the length; the `/ 4` sits in the file, unread and untouched, ready if
  the row is ever switched back. That is `track-row-length.md`'s own rule for why
  the split is not gated on the mode, and this is the case it was written for.

Nothing is deleted, nothing is merged, and a write with nothing changed is
byte-identical.

**Dropping a declared row and re-adding it — where the toggle costs something.**
`read` deliberately drops an entry no declared row maps to, and the comment says
why: "An entry no row maps to is not read… so it stays in the note untouched,
which is what makes a slot table safe to re-cut (§7)"
([track.ts:759-762](../../src/components/track.ts#L759)). **With `openRows` on,
that guarantee inverts.** A dropped row's leftover entry is no longer unmapped-and-
invisible; it is a character-added row, drawn, named after the key the author
just removed, carrying a name field and a place in the **Remove** list. Re-adding
the row to `rows[]` turns it back into a declared row, silently and correctly.

**This is accepted and recorded rather than mitigated**, because the settled model
leaves no way out: the typed name is the only identity a fence has, so nothing
distinguishes a leftover from a row the character typed. What is worth saying is
what is actually lost, which is **quietness, not data.** §10 promises the entry
survives, and it does, in both states and in both directions — the re-cut is
still safe, it is merely no longer invisible. The exposure it adds is that a
character could now *Remove* an entry that would have come back, which is a
deliberate, armed, twice-confirmed gesture against a named row rather than an
accident.

Two things bound it. **The toggle off is exactly today's behaviour**, so a layout
whose Track is a slot table — the shape re-cutting is done to — is unaffected
unless its author turns this on. And **turning the toggle off again hides every
character-added entry without deleting one**, so an author who is about to re-cut
has a one-click way back to the quiet behaviour, and turning it on afterwards
brings every row back exactly as it was. That reversibility is the strongest
Constraint 4 property this design has and it comes free from the mode being
implied rather than stored.

### Empty and error states

- **`openRows` on, nothing declared, nothing added.** The card draws its label
  and one **Add** trigger. Not a `—`, not a `?`, not an error: an empty list a
  reader can fill is the ordinary state of a new character.
- **A duplicate key in a hand-edited note.** The section fails to read and the
  card draws `Duplicate key "…" in sheet block.` alone, per §10. Unchanged.
- **A value half that is not a number of marks.** The whole section is malformed
  and reports as it does today, in the same sentence, because a character-added
  row's value half is validated exactly as a declared row's is.
- **A length half that is not a number.** Not an error: the row draws with `—`
  and no run, `bounded-entry.ts`'s own rule that a ceiling which is not a number
  behaves as no ceiling.
- **A refused name.** The message sits under the field that refused it, inside
  the panel or on the card, with the draft kept — except the blank, which puts
  the stored name back and says so.

### What it reuses

Everything but the name field and the form. `ui/anchored-panel.ts` and its
`.sheetsmith-panel-line`; `arm-to-confirm.ts`'s three sentences, imported
directly and not its gesture, as the third pass left them; `bindEditable`;
`fencedKeyProblem`; `fencedLinkRefusal` through `components/fenced-link.ts`;
`refuseRowLength`; `splitBounded`/`withValue`/`withCeiling`; `writeFenced`'s
`null` delete; `renameFencedEntry`; `awaitingAdd`; Pool's ceiling reading for the
length field; `.sheetsmith-track-action-button`. The one new shape on screen is a
row whose name is an input, and it is the shape Table already draws for the same
fact.

**Three more were reached for during the build and belong on this list**, since
a closed list that quietly grew is worse than an open one. `ui/truncation.ts`'s
`revealWhenTruncated` on the name field, because an invented name has no length
the column knows about and every other clipped string here reveals on hover;
Pool's own `.sheetsmith-pool-max-input` **hover and focus ring**, taken by the
name field as well as by the length field, since §6 asks one treatment per
component; and `interaction/editable.ts`'s `keptRatherThanBlank`, which was
Record set's sentence spelled out in place and is now one name shared by both
(`docs/PATTERNS.md` §1's one-step tier).

### The layout editor

One boolean in the configuration panel, after `rows`. No `visibleWhen` — the
condition that would matter is "hidden while `levels` is set", and `visibleWhen`
tests equality against one key, so the configuration refusal and the description
carry it instead.

`list-fields.ts` is untouched: this adds no per-row control, and a
character-added row has no row in `rows[]` to configure.

The panel's published-name inventory gains nothing, which is itself worth
checking: a Track with `openRows` on publishes exactly what it published before,
so the chips are the declared rows and `<id>.count` as they always were.

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `openRows` | `boolean` | Characters may add rows | Adds a control under the runs for naming a row of this character's own and choosing how many segments it holds — a counter this actor keeps and no other does. Rows a character adds are theirs to rename and remove, and **no formula can name one**, so a value another card has to read belongs in a row declared above. The rows declared above are unaffected. Turning this off hides the rows characters added without deleting them, and turning it back on brings them back. Refused where the runs are named levels, or where every run is one segment. |

The `rows` field's description gains one sentence: "Characters may add rows of
their own beside these, where the setting below allows it."

`formulaFields` is unchanged — `count`, `rows.*.count`, `reset.*.to`. A
character-added row resolves nothing.

## Data and file model

`storage: 'fenced'`, unchanged. One entry per row, declared or not.

```
## Kills

​```sheet
Goblins: 6 / 10
Dragons: 3 / 5
Nothing yet:
​```
```

- **An entry whose key no declared row spells is the character's**, where
  `openRows` is on. That is the whole of the mode; nothing in the note records
  it.
- **The composite is `maxSource: 'character'`'s**, byte for byte: `filled /
  length`, split by `splitBounded`, joined by `withValue`/`withCeiling`, with the
  canonical ` / ` reached only where this component composes a composite for the
  first time and nothing rewriting a spelling already in the file.
- **A blank length drops the separator with it**, so a cleared length is
  `Goblins: 6` and never `Goblins: 6 /` — `withCeiling`'s own rule, which is what
  makes the round trip an identity in both directions.
- **A blank value half is a blank value**, not zero: a row added with a length
  and no marks reads `Goblins:  / 10`, the same reading `per-record-ceiling.md`
  gives its own composite.

**`TrackData` gains two members.**

```ts
interface TrackData {
	values: Record<string, string | null>;
	/**
	 * The character's own keys, in the note's own order. Filled by `read`,
	 * never by a delta — a plain object's key order puts `10` before `Goblins`
	 * whatever the note says, so nothing may read an order off `values`.
	 */
	own?: readonly string[];
	/** One gesture: rename this key, keeping its whole line. */
	rename?: { from: string; to: string };
}
```

**`read`**, where `openRows` is on, walks `readFenced`'s `Map` rather than only
`runsOf(config)`: an entry whose key a declared row spells maps as it does today;
every other entry is validated as marks the same way, kept in `values`, and its
key appended to `own`. Where `openRows` is off, `read` is the code path that is
there now, unmapped entries dropped and all.

**`write`** applies `rename` to the body first, then `writeFenced` for the value
deltas, then returns. An entry it is not asked to touch survives byte for byte.

**Round-tripping (Constraint 3).** `values` holds the note's own bytes, unread
and unsplit, exactly as it does today; the split happens where a caller turns a
string into a mark count or a length. `own` is derived and never written. A
rename changes the key token and nothing else. So `write(read(body), body)` is
the identical string for an untouched note, with the toggle on or off.

**Existing notes (Constraint 4).** No note changes until an author turns the
toggle on, and turning it on writes nothing: it makes entries that were already
in the file visible and editable. Turning it off makes them invisible again and
deletes none. Every note written before this feature reads exactly as it does
today in both states. The one behaviour change to a note this feature did not
write is the one named above: with the toggle on, an entry left behind by a
dropped declared row is drawn as the character's rather than ignored — and that
is a row appearing, never a row or a value disappearing.

### The sample

Where `openRows` is on, `sample()` writes **one** character-added row, keyed
`sampleText(config.label, 0)` — `Kills 1` for a card labelled Kills — with a
composed length and a partial fill seeded off `config.id` the way a
character-owned row's already is. **It invents no vocabulary**, per §4.1: the
name comes from the config, exactly as Table's open-row sample takes its names
from `rowHeader`. The row is skipped where that name is already a declared key,
so a sample can never compose a duplicate and can never fail its own round trip.

## Acceptance criteria

**The toggle, and what it does not touch**

- [ ] With `openRows` absent or false, `read`, `write`, `render`, `applyReset`
      and `scopeValues` behave exactly as they do today, including `read`
      dropping an entry no declared row maps to; a test drives a note holding an
      unmapped entry through `read` and `write` and asserts the bytes are
      unchanged and the entry never drew.
- [ ] `openRows` with `levels` is refused by the configuration check, naming the
      fix; `openRows` on a card every one of whose declared runs is one segment
      is refused, naming the fix; `count` against `levels` is unchanged.
- [ ] `isRowSet` reads true where `openRows` is on with no declared rows, so
      `runsOf` synthesises no `value` run and the card publishes no bare id.
- [ ] `isFlagCard` returns false for an empty run list.

**Identity, and the guard**

- [ ] `Goblins: 6 / 10` in a note whose layout declares no row called `Goblins`
      reads as a character-added row filled 6 of 10, and round-trips
      byte-identically with nothing changed.
- [ ] The Add form refuses a blank name, a name holding a colon or a line break,
      a name holding a wikilink, the name `value`, a name a declared row already
      spells, and a name this character's fence already holds — each with its own
      sentence, the draft kept, and nothing written.
- [ ] A name differing from an existing one only in case is refused, and the
      message names the spelling already in the note.
- [ ] A hand-edited note holding `Priority` and `priority` reads, draws two rows,
      and round-trips byte-identically; neither is folded into the other and
      neither spelling is rewritten.
- [ ] A hand-edited note holding the same key twice draws
      `Duplicate key "…" in sheet block.` on this card alone, leaves the note
      untouched, and the rest of the sheet renders and stays editable.
- [ ] A note holding `D6` under a layout declaring `d6` draws two rows: an empty
      declared `d6` and a character-added `D6`.

**Adding**

- [ ] Pressing **Add** on a card with `openRows` on and no declared rows to offer
      opens the panel showing the form alone.
- [ ] Submitting a name and a length writes one entry, `<name>: / <length>`, and
      touches no other line; the row draws in note order after every declared
      row; focus lands in its length field.
- [ ] Submitting a name with the length cleared writes a bare `<name>:`, and the
      row draws with `—` and no run.
- [ ] The Length field is prefilled with the card's own `count` where the layout
      sets one and it resolves, and with nothing where it does not; the stored
      length is always what the field held at submit, and `count` is never
      consulted for that row again.

**Renaming**

- [ ] Editing a character-added row's name commits on blur and on Enter, restores
      on Escape, and rewrites only that line's key token — the marks, the length,
      the separator spelling, the surrounding whitespace and the line's position
      in the fence all unchanged.
- [ ] A declared row's name is static text and cannot be edited from the card.
- [ ] A rename refused by the guard keeps the draft and writes nothing; a blank
      name restores the stored name and says so.

**Removing**

- [ ] The **Remove** picker lists the character's rows after the declared
      character-owned ones, in note order; picking one arms it, picking it again
      deletes the whole entry — marks and length — and leaves every other line
      untouched; picking a different one disarms the first; dismissing the panel
      stands the armed row down and announces `STOOD_DOWN`.
- [ ] A removed character-added row does **not** appear in the **Add** panel's
      list afterwards, unlike a removed declared row.

**Ordering**

- [ ] A fence whose first entry is `10` and whose second is `Goblins` draws them
      in that order and writes them in that order; nothing reads an order off
      `Object.keys(data.values)`.

**Resets**

- [ ] `empty`, `full` and `formula` each reach a character-added row on the same
      terms as a declared `maxSource: 'character'` row; `full` skips one with a
      blank length without failing the rest; no action creates or removes a row.

**Publication**

- [ ] `<id>.<name>` fails as an unknown name for every character-added row, under
      every spelling, and `<id>.<name>.left` likewise; the declared rows publish
      exactly what they published before; Track declares no `scopeRows`, so
      `sum(<id>, …)` says the component holds no rows.

**Layout changes**

- [ ] Declaring a row under a name a character already used claims the existing
      entry: the marks survive, nothing duplicates, the name goes read-only, and
      a write with nothing changed is byte-identical.
- [ ] With `maxSource: 'character'` the typed length keeps being read and the row
      **stays** in the **Remove** list, as every declared character-owned row has
      since `track-row-length.md`; with `'calculated'` the layout's formula
      supplies the length, the `/ n` stays in the file unread, and the row
      **leaves** the **Remove** list.
- [ ] Dropping a declared row on a card with `openRows` on draws its leftover
      entry as a character-added row; re-declaring it turns it back into a
      declared row; neither direction writes anything.
- [ ] Turning `openRows` off hides every character-added row and deletes none;
      turning it back on draws every one of them again, in the same order.

**The sample and the build**

- [ ] `sample()` writes one character-added row named from `config.label` where
      `openRows` is on, skips it where that name is a declared key, and
      round-trips through `read` and `write`.
- [ ] `src/components/contract.test.ts` passes unchanged in shape.
- [ ] `npm test`, `npm run lint` and `npm run build` are green.

**Look criteria**, in the harness, both themes:

- [ ] A character-added row's name field at rest reads as an editable field
      without drawing a box around itself, and sits in the same column as a
      declared row's static name, so a mixed card's runs stay in one column.
- [ ] A card holding two declared rows and two character-added ones draws no
      badge and no glyph, and the character's rows sit after the declared ones
      in the note's own order.
- [ ] Which rows are the character's is legible **on hover, on focus, and in the
      Remove list** — not at rest, where the four names are deliberately one
      treatment. This criterion was "reads as 'these two are the sheet's and
      these two are mine' from the name treatment alone", and the tree does not
      meet that: a chromeless field looks like text, and a declared
      `maxSource: 'character'` row draws a field of its own one column over, so
      the card cannot teach "a field means mine". Narrowed rather than dropped,
      and the badge that would answer it at rest stays ruled out.
- [ ] The Add panel's form reads as part of the panel rather than as a second
      surface inside it, and the panel stays anchored to its trigger when a
      refusal message grows it a line.
- [ ] An armed character-added row in the **Remove** panel tints in the same red
      Table's armed row does.
- [ ] A card with `openRows` on and nothing in it is a label and one **Add**
      trigger, and does not read as broken.

**Vault fixture** (`~/Developer/sheetsmith-test-vault`, mirrored under
`src/test/fixtures/tracks/` and driven through the real parsers by
`src/view/vault-fixture.test.ts`). `Track variations.json` and
`Characters/Tracks.md` already exist and gain, per the rule that capability-only
variations share a component's file:

- `openRows` turned on for the existing `hit_dice` row set, so one card shows
  declared character-owned rows and character-added ones side by side.
- A second Track, `kills`, labelled **Kills**, `openRows` on, `rows` empty, `count`
  unset — the freely named counter with nothing declared.
- A third, `clocks`, labelled **Clocks**, `openRows` on, `rows` empty, `count: 6`
  — the prefill case, so an author can see a seeded length.
- `Characters/Tracks.md` gains a `## Kills` section holding `Goblins: 6 / 10`
  and `Dragons: 3 / 5`, and a `## Clocks` section holding one entry whose name
  has a space in it, so the unpublishable-name case is on screen.
- **And `## Hit dice` gains `Homebrew d4: 1 / 2`**, which the bullets above did
  not name and the sentence above them requires: without an entry under a key
  none of `d6`/`d8`/`d10`/`d12` spells, that card shows declared
  character-owned rows and nothing beside them, so the one thing it is there to
  show — the two kinds of row on one card, told apart by the name treatment
  alone — is not on screen. It is also the case the feature is *for*, a row the
  layout could not have anticipated, where the four die types are the case
  `track-row-length.md` already answered.

**The press list**: on **Kills**, confirm the card draws two named rows and the
**Add** and **Remove** triggers; press **Add**, confirm the panel holds the form
alone, type `Goblins` and confirm it is refused naming the entry already there;
type `goblins` and confirm it is refused the same way; type `Wolves` with a length
of 4 and confirm the note gains `Wolves:  / 4` and nothing else changed; edit
`Wolves` to `Direwolves` on the card and confirm the note's line is rewritten in
place, the ` / 4` and the line's position intact; press **Remove**, pick
`Direwolves` twice, and confirm the whole line is gone and `Direwolves` is not
offered by **Add**. On **Clocks**, press **Add** and confirm the Length field
arrives holding 6. On **Hit dice**, confirm the declared `d6`/`d8`/`d10`/`d12`
rows behave exactly as they did, with read-only names, and that **Add** offers
both the un-added declared rows and the form — and that `Homebrew d4` sits below
all four with a name that is a *field*, which is the whole of what says whose row
it is. Finally, edit the layout to declare
a row keyed `Goblins` on **Kills**, `maxSource: 'character'`, and confirm that
row's marks and its typed length both survive, its name goes read-only, and it is
still offered by **Remove** — now as a declared row, which comes back on the
**Add** list rather than being gone for good. Declare it `'calculated'` with a
`count` instead and confirm it leaves the **Remove** list altogether. Drop it
again either way and confirm it comes back as the character's with its marks.

## Commit boundaries

A plan for `/land-it`, applied once at the end. The work stays in one uncommitted
tree through implementation and every round of findings.

1. **`feat: Let a Track read the rows a layout never declared`.** `openRows` on
   `TrackConfig`, the configuration refusals against `levels` and a flag card,
   `isRowSet` and `isFlagCard`'s two clauses, `TrackData.own`, and `read` walking
   the fence where the toggle is on. Nothing draws them yet; this is the commit
   that answers "can a note hold both kinds of row and still round-trip".
2. **`feat: Draw a Track row the character owns`.** `render` appending the
   character's rows after the declared ones in `own`'s order, the name field
   beside the length field, the ordering test, and `applyReset` reaching them.
   The feature works for a hand-edited note after this.
3. **`feat: Name a Track row on the character's own sheet`.** The Add panel's
   form, the shared name guard and its five refusals, the `count` prefill, and
   the `awaitingAdd` landing. This is the commit after which a row can be created
   from the sheet.
4. **`feat: Rename a Track row the character named`.** `TrackData.rename`,
   `write`'s ordering, and `renameFencedEntry`'s first caller from a component.
5. **`feat: Remove a Track row the character named`.** The **Remove** picker's
   second list and what it deletes.
6. **`feat: Offer character-added rows in the layout editor`.** The `openRows`
   config field, the amended `rows` description, and the sample.
7. **`docs: Let a character add Track rows of their own`.** This document's
   `Status` to `built`; §13's new entry; §4.2's Track paragraph; `docs/UI.md`'s
   add-control and arm-to-confirm rows amended for the form and the second list,
   **and its focus-roster row**, which this boundary did not anticipate: a row
   the character named draws its name as a chromeless field *inline on a card
   row*, which takes neither of §9's two existing rosters — it takes the pool's
   own hover and ring, since §6 asks one treatment per component and the length
   field beside it already wears them. Also `docs/PATTERNS.md` §2's `setIcon`
   sentence, which named one component while four take it. The vault fixture's
   press list re-verified against the built behaviour.

## Deliberately not doing

- **No publication of any kind.** Argued in the model question. A character-added
  row is inert to formulas, and Track gains no `scopeRows`, no total and no
  aggregate. Recorded here so a reviewer does not report the absence as a gap.
- **No character-typed formula for a length.** Blocked on §13's open question
  about a local formula override, and named there. The five systems that derive a
  track's length are answered by a *declared* row today.
- **No scene or party tracker**, and no fixed menu of clock lengths. §13's
  question is not moved; the argument is in the model question.
- **No reordering.** A declared row's position is `rows[]`'s and a character's is
  the note's. There is no drag handle. Reordering a character's rows means moving
  the lines in a Markdown pane, which is a thing §3.1 already invites and which
  this feature keeps working by reading the order off the file.
- **No merge, and no repair, of two names differing only in case.** The guard
  refuses creating the second and the component refuses folding the first.
  Repairing one means writing over a name the user typed.
- **No recovery of the re-cut guarantee.** With the toggle on, a dropped declared
  row's leftover entry is drawn as the character's. Argued above; the mitigation
  is that the toggle off is today's behaviour and that turning it off is a way
  back.
- **No change to `src/component-rename-migration.ts`.** A character-typed key
  addresses data in one note, so it is outside that migration's stated scope and
  needs nothing from it.
- **Not folded into Record set**, and Track does not become two components. Both
  were argued and settled — `record-set.md` §"Why the catalog grows" and
  `track-row-length.md`'s own note that modelling this as a Record set trades
  Track's segmented run for a numeric `Uses 1 / 4` reading, which is the loss the
  component exists to avoid.
- **No fix to the open conformance rows against `track.ts`**: the shared
  two-state ring extraction and its ARIA wiring, and `stored-flag.ts`'s
  flag-reading policy with no application. Both are in `docs/BACKLOG.md` with
  decisions of their own pending, and neither is reached by this work.
- **No delete-confirmation lighter than the picker's.** Removing a character-added
  row is the only delete in this plugin whose target does not come back, so it
  keeps the arm-then-confirm gesture rather than dropping to one press.
- **No default name.** Record set's add writes a record named after the noun
  because identity is position there; here a default would collide on the second
  press, so the name is typed before the entry exists.
