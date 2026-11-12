# A modifier grants temporary points

Status: shipped
Board card: Formulas can read, give, edit and remove a Pool's temporary points,
from any source that can push a modifier: a form in play, a spell, a worn item, a
condition.

## Model question

This touches no question §13 already holds open. It opens one, recorded in §13
with this spec: **is a temporary-point grant a modifier or a write?** The owner
settled it before this spec was written, as option A below. What follows states
the answer, the argument for it, and the decisions the answer left open.

**Why it is a question at all.** Three positions in the documents bear on it, and
the obvious answer breaks one of them.

- **§2 Modifier**: the direction is push. The row names the value, and the value
  names no source.
- **§6, last line**: "This is the only place the sheet performs an action rather
  than holding values." A reset trigger is the only write the sheet makes that
  the reader did not type.
- **`docs/features/character-forms.md` item 4**: "No on-activate trigger … 5e
  2024's temporary HP is the existing Pool buffer on the character's own `hp`."

The obvious answer is a write: when a source comes on, write its points into the
Pool's `temp`, and when it goes off, take back whatever is left. That is an
on-activate trigger, a second place the sheet performs an action, and a note
rewritten by something other than the reader's own edit. It also cannot tell
"what is left of the grant" from "what the reader typed afterwards", because both
are the same number in the note.

**The options.**

- **A. A derived grant.** A modifier pushes a grant at a Pool's buffer. While the
  source is active, the Pool's effective buffer is worked out from its own stored
  temp and the active grants. The Pool stores how much of each grant has been
  spent, keyed by source, so the record survives a rebuild. Turning the source off
  removes its grant, and what was left goes with it, with no note write for the
  grant itself.
- **B. A write on activation.** As above: an on-activate and on-deactivate write
  into `temp`. Breaks §6's last line and forms item 4, and loses the distinction
  between granted and typed points.
- **C. A reset-shaped binding.** A buffer `to` on an ordinary reset binding ("a
  long rest sets temp to `level`"). Covers a rest that grants points, but not a
  source turning on, so it cannot answer a form, a spell or a worn item.

**The answer is A.** It keeps §2's push model whole: the Pool learns nothing
about forms, spells or items, and every component that already pushes modifiers
grants with no change to it. It keeps §6's last line true, because the grant
itself is never written; it is worked out at render, exactly as a level a
modifier sets is (`docs/features/non-number-modifiers.md`). And it is the
reading §4.2 Pool already gave for per-instance grants: "a value paired with a
duration … belongs to whatever granted it rather than to the pool". The source's
own toggle is the duration. C is not refused; it is the named next route (see
**Deliberately not doing**).

**What A has to store, and why.** A grant that is only derived would come back
full on every rebuild, so damage taken through it would be forgotten. So the Pool
stores one number per grant: how much of it has been spent. That is character
data, written only by the reader's own spend, exactly as `temp` is today. It is
the one new thing a note holds.

**The contract grows, and each growth passes §4.1's rule.**

- **`ScopeEntry.buffer`**, beside `state` and `states`: an entry says its value is
  a buffer a grant may raise, and carries the spent records the note holds. The
  alternative is the formula layer knowing that a Pool's `temp` is a buffer and
  where its spent records live.
- **`endGrants`**, a new optional component member beside `hasBuffer`: given the
  component's data and the keys of grants that just ended, return the data with
  their spent records cleared. The alternative is the sheet view knowing a Pool's
  fence keys.

**What it publishes.** No new names. `<id>.temp` now carries the effective
buffer, and `<id>.temp.value` keeps what the note stores, on §4.1's rule that
`.value` is always the stored value (the same move D4 of
`non-number-modifiers.md` made for a flag).

**Storage.** A Pool's fence gains one line per grant that has been spent from:
`spent · <source> · <row>: <points>`. Nothing else is new. A layout file gains no
key: a grant is a change whose target is a buffer and whose operator is At least,
which every tier already spells. Every existing note and layout round-trips
byte for byte (Constraint 3).

**Existing notes.** Untouched until the reader spends through a grant. A layout
edit that removes a grant leaves its spent record in the note, reported and never
cleaned up (Constraint 4).

## What it does

A form, a spell, an item or a condition can give a Pool temporary points while it
is active. `hp.temp >= 10` on a form's Modifiers field gives the character 10
temporary hit points while the form is in play. Damage drains them first, as it
drains the Pool's own temporary points, and the sheet remembers what was spent
across rebuilds. When the form leaves play, whatever is left of its grant goes
with it. The Temp pill shows the points in effect, carries the modifier mark, and
its breakdown names each grant, what is left of it, and any grant the higher one
passed over.

## Smallest version

At least aimed at a Pool's `temp` from any pushing component, higher wins, a
spend draining every active buffer alike, spent records keyed by source, a
grant's record cleared in the write that ended it, and the pill showing the
effective value with its mark and door. **What it gives up:** the form tint on a
Pool a form in play grants (D12), and the layout editor's definitions report for
an Adds to or a Sets aimed at a buffer; the sheet still refuses both, and the
pickers still offer only At least.

## Design

### Decisions this spec takes

The owner settled the model, the stacking rule, the pill, removal on deactivation,
what the sheet shows, the clear on deactivation, the key's precedent and what
`buffer: 'clear'` reaches. These are what the answer left open.

- **D1. A grant is spelled At least at the buffer's name: `hp.temp >= 10 when
  Worn`.** No new operator, no new clause, and no new token in a cell's
  discriminator. At least is already the higher-wins operator (§2, §5: "Several
  take the highest and list the rest suppressed"), which is exactly the stacking
  rule the owner chose. A definition is `{ "target": "hp.temp", "operator":
  "upgrade", "amount": "10" }`. The `grant` keyword the owner floated was
  considered and refused: `ASSIGNMENT` in `parse/modifier-cell.ts` is the whole
  discriminator between a named part and a typed one, so a third keyword operator
  widens what reads as typed, and a part reading `hp.temp grant 10` today, a stray
  name, would change meaning. The cost is that "at least 10" reads as the full
  grant even after some of it is spent; the breakdown's words carry the
  difference (D9). **Built: the row's own words say `grants 10`, not `at least
  10`**, on the row's popup, its `title` and a Stat block form's change line
  (`HP · temp grants 10`, the buffer's whole label, since its short half names
  no pool). The door's account says `grants 10, 7 left`, and `docs/UI.md` §9
  holds the outcome to one spelling across every surface that names it, so the
  row reading `at least 10` beside a door reading `grants 10` would be two
  spellings of one change. The cell grammar and the stored operator are still At
  least; only the words a reader sees changed.
- **D2. Only At least grants. Adds to and Sets aimed at a buffer are refused**,
  each with the one sentence `BUFFER_TAKES_AT_LEAST` (in a new
  `src/formula/modifier-buffers.ts`, its fault `TEXT.bufferRefusesOperator` in
  `src/en.ts`): `Temporary points do not add up, so only the highest grant
  applies. Choose At least.`, the operator composed from `OPERATOR_LABELS` as
  `STATE_REFUSES_ADD` composes it. Adds to contradicts §4.2's "nothing anywhere
  adds temporary points to temporary points"; Sets would be a second spelling of
  the same grant that also overrode a larger stored buffer, which no system asks
  for. The refusal refuses that change only, listed in the account with its
  sentence and granting nothing; it does not refuse the buffer.
- **D3. What a buffer is.** A component's published entry declares `buffer`. Pool
  declares it on `<id>.temp` where `hasTemp` is on, and nowhere else. A grant at a
  name with no `buffer` is the ordinary At least it is today. A grant at `hp.temp`
  where `hasTemp` is off is a push at a name the sheet does not publish, which §5
  says is rendered at the row and is not an error. Targets are read statically,
  as `stateTargets` reads states: a new `bufferTargets` in
  `formula/modifier-targets.ts`, from `scopeValues(null, config)`.
- **D4. A grant's amount is a whole number of points.** The amount is an
  expression like any other. A fraction or a non-number is refused for that grant
  with `"2.5" is not a whole number of points, so <called> grants nothing. Give it
  a whole number, for example with floor().`, through `inRowMessage`. A negative
  grants nothing and is not refused, which is the pill's own rule that a negative
  is clamped to 0 (`docs/features/pool-temp-refuses.md`). An amount that will not
  resolve refuses the buffer on §5's rule (D11).
- **D5. A source is one row, and its key is what the reader reads.** The key is
  `<source> · <row>`: the push's `source` (the component's label) and the row's
  `label`, which `RowValues` already guarantees is the reader's text and never the
  file's, so a wikilink never reaches the fence (Constraint 2). This is Track's
  precedent for character-added rows: the typed name is the fence key, because a
  fence's only address is its key (`docs/features/character-added-track-rows.md`
  part 1). Consequences, each stated rather than handled:
  - **Two parts on one row granting at one buffer are one source**: the higher
    applies, and they share one record.
  - **Two rows with one label in one component are one source**, two `Potion`
    rows or two `Unnamed row`s alike. A fence cannot hold a duplicate key, and a
    position is what open rows refused to key by.
  - **Renaming a row, a record or the component is a new source.** The old key's
    record is cleared in the rename's own write (D7), and the new name grants in
    full. A component label rename's migration (§10) does not rewrite spent keys.
  - **A label holding a colon or a line break cannot be a fence key**
    (`fencedKeyProblem`). That grant is listed in the account and grants nothing,
    with `"<label>" cannot grant temporary points, because the pool keeps what is
    spent under the row's name and a sheet block cannot hold a colon or a line
    break. Rename the row without one.` It refuses only itself: its amount is
    known, and refusing the buffer over an item's name would blank `hp.temp` for
    a reason that is not about the buffer. **The key is the component's label
    too**, so where the colon is there instead the sentence names that half and
    its fix: `"<label>" cannot grant temporary points, because the pool keeps
    what is spent under "<component>", and a sheet block cannot hold a colon or
    a line break. Rename that component without one in the layout editor.` One
    verdict (`grantVerdict`) serves the walk and the row's popup, which is handed
    the row's component, so the two cannot disagree.
- **D6. The arithmetic.** For each active grant, `left = max(0, amount − spent)`,
  where `spent` is the Pool's record for its key or 0. The effective buffer is
  `max(stored, left of each active grant)`, where `stored` is the note's `temp`
  read by today's rule (a refused stored buffer counts as 0). A spend of `d` is
  absorbed up to the effective buffer, `absorbed = min(effective, d)`, and every
  active buffer is drained by `absorbed`, each floored at 0: `stored' = max(0,
  stored − absorbed)`, and each grant's `spent' = spent + min(left, absorbed)`.
  So the effective buffer after a spend is exactly `effective − absorbed`, which
  is the owner's "max minus damage", and `landing()` keeps its current signature
  with the effective buffer as its `temp`. Restoring never refills any of them,
  unchanged. **Accepted cost, not a rule**: when a grant ends, whatever is left of
  the stored temp stays, which is a little more generous than 5e's "choose one".
- **D7. A grant's spent record is cleared in the write that ends it.** "Ends"
  means a grant that was active on the sheet the reader was looking at, with a
  spent record, is no longer active once the reader's edit is applied: a toggle
  turned off, a form switched out, a row or record deleted or renamed, a `when`
  that stopped holding. **It is not a second action**: the record is the grant's
  own bookkeeping, written only by the reader spending through it, and it is
  cleared in the same `applySectionWrites` batch as the edit that ended the grant,
  so it is one write, one save and one rebuild. The mechanism is the view's, and
  generic:
  1. `applyEdits` builds the next text from the reported edits, as today.
  2. Where the current sheet has any active grant with a spent record, it builds
     the sheet's modifier walk over the next text and asks each buffer which
     grants are active there. Where none has a record, it skips this, so a sheet
     with no grants spends nothing on it.
  3. For each buffer whose recorded grants are no longer all active, it adds that
     component's `endGrants(data, config, ended)` to the same batch, and writes
     once.

  The same path serves a reset trigger's batch, so a long rest whose Conditions
  binding turns `Active` off clears those conditions' records in the rest's one
  write. **How it fits undo.** A reset's undo restores the note it replaced
  whole, so it brings the record back with the toggles. An ordinary toggle has no
  sheet undo; Obsidian's own history holds the one write with both halves.
  Pressing the toggle on again is not an undo but a recast, by the owner's
  decision: the grant comes back in full. A grant ending without a reader's edit
  (a layout edit, a hand edit in markdown view) writes nothing, and its record
  stays as a leftover (D10).
- **D8. Typing into the pill edits the stored part.** The pill shows the effective
  value. Focusing it selects that number, as today
  (`docs/features/number-field-focus-select.md`), and a commit writes what was
  typed as the stored `temp`, under every existing rule: whole numbers, refused
  rather than settled, a negative clamped to 0. **The field is compared against
  what it drew, never against the stored value**, so focusing and leaving the pill
  untouched writes nothing; without this, a pill drawing 10 over a stored 3 would
  write 10 on blur. Where the typed value is below a grant still in effect, the
  pill goes on drawing the grant, and the sentence
  `<label> temporary 10, granted by <source · row>; your own is now 3.` is
  **shown under the pill on commit**, in the slot
  `docs/features/pool-temp-refuses.md` already uses for a refused draft, through
  that slot's existing notice path (`markTemp`) and its `aria-describedby`, and
  cleared on the next edit of the pill. It is a notice, not a refusal: the
  commit was written, so the field takes no `aria-invalid` and no refused
  border. The card's live region also speaks it once the commit lands. This is
  the one place a typed value is not what the pill draws, and §12's rule that an
  outcome a control's input does not show must be on screen is why it is both
  shown and spoken. Because the slot already exists, the card grows only as a
  refused draft already makes it grow, and no fourth copy of the refusal notice
  is built. The spend gesture reads the stored part from the data and the
  effective part from the account, never from the field's text.
- **D9. The sentence naming the source in effect is the pill's description, not a
  line on the card.** `aria-description` and `title`: `Granted by Wild Shape ·
  Brown Bear; your own: 5.`, present only while a grant is in effect, which is the
  ring's `Set by a modifier; your own: Untrained` read for a buffer. Not a line
  under the pill: a line that appears when a source turns on would grow the card
  and every card in its grid row, against `docs/UI.md` §9's "the box is the same
  size with the form on as off". The account's first line says it too (below).
- **D10. A spent record with no active grant is a leftover: reported, never
  rewritten.** It arises from a hand edit, a layout edit, or a grant that has not
  come back on since a reader's own edit could not see it end. The account lists
  it (`Not granting now: Gear · Old ring, 4 spent`), the Pool keeps its bytes, and
  should its source come back on, the record applies to it. §10's rule for a name
  read inside a note's expression is the precedent: reported by the sheet, never
  migrated. It never grants points nobody earned, since a record only ever
  lowers a grant. **And it is never stuck**: turning the source off on the sheet
  clears the record (D7), and turning it on again grants in full.
- **D11. A refused buffer publishes nothing that reads it.** Where a grant's amount
  will not resolve, the buffer is refused, the `non-number-modifiers.md` D7 rule
  for a state: the pill draws the stored `temp`, the door's account opens on the
  refusal, `hp.temp` fails with that sentence and draws `?` wherever it is read,
  and `hp.temp.value` still resolves. A spend drains the stored part alone and
  writes no spent record, since nothing knows what the grant is worth.
- **D12. The form tint reaches a Pool whose buffer a form in play grants**, where
  that grant is the one in effect. §8's rule is that a value a form in play changed
  directly is tinted, and the effective buffer is such a value. The tint lands on
  the Pool's card, its box, with the form's pill, through `view/placement-
  decorations.ts` reading the buffer's lines as it reads state lines. A grant a
  higher one passed over changes nothing and is not tinted, which is the At least
  number's `already higher` rule.
- **D13. The cycle case.** A grant's amount or condition reading the buffer it
  grants at (`hp.temp >= 5 when hp.temp < 3`) re-enters the walk. Reached cold it
  is refused by the walk's guard with `A modifier's own condition or amount reads
  "hp.temp", which a grant raises, and the modifiers on this sheet are still being
  worked out. Read the value as stored (hp.temp.value) instead.`; reached warm, by
  the name table's guard with the row named. Neither recurses. This is the states
  cycle case, reworded.

### The engine (`src/formula/`)

- **A fourth reduction of the one walk.** The walk already keys contributions to
  slots, notes and states. A change whose target `bufferTargets` lists, and whose
  verdict applies, is keyed by target into `granted`, beside `stated`, and never
  reaches a slot. The refusals in D2, D4 and D5 are per grant; D11's is per buffer,
  in `grantRefused`. `walked()`'s memo rule extends: held only where neither
  `refused`, `stateRefused` nor `grantRefused` holds anything.
- **`foldBuffer(stored, spent, lines)`** in `formula/modifier-buffers.ts` returns
  the account: the effective value, which grant is in effect (or own), each
  grant's amount, spent and left with its verdict, and the leftovers. One function
  for every reader: the name table's bare name, the Pool's render through
  `ModifierContext.buffer`, and the breakdown. Highest wins, ties to own first and
  then to walk order, which is §5's shuffle rule: the effective value does not
  depend on walk order, only which tied line is named in effect does.
- **`ModifierContext.buffer?(name, stored, spent)`** answers the account or null
  where no grant addresses the name and no leftover is recorded, so a pill with
  nothing pushed draws no mark and no door. `spent` is the Pool's own map, handed
  over as `state()` is handed `stored`.
- **The name table.** `hp.temp` folds through `foldBuffer` with the entry's
  `buffer.spent`, and `hp.temp.value` reads the stored `temp`.
- **What the view asks after an edit** is one exported function,
  `activeGrantKeys(modifiers, name)`, over a walk built from the next text.

### The Pool (`components/pool.ts`)

- **`read`** collects every fence key starting `spent · ` into `data.spent`, the
  rest of the key the source key and the value the points as stored text. A value
  that is not a whole number of 0 or more counts as 0 spent, is marked in the
  account as the stored buffer's own refusal is (`storedTempMark`'s rule), and is
  never rewritten.
- **`write`** writes `temp` and the spent records in one change, adding a line for
  a key spent from for the first time and touching no other line. A record is
  written only by a spend; a spend that drains no grant writes none.
- **`endGrants`** returns the data with each ended key's line removed, or null
  where none of them is recorded. Removal is `writeFenced`'s `null` update.
- **The spend.** Every spending gesture (step, arrow key, drag, throw, the adjust
  control) already goes through one origin-and-net path, so a run of
  adjustments still derives from where it began: the origin gains the spent map,
  and a step back up refunds the grants a step down drained, exactly as it refunds
  `temp` today. `landing()`'s preview line and live-region words read the
  effective buffer, `−17 → 50 · temp 0`.
- **The pill** draws the effective value. It carries the ceiling's own mark, the
  2px dotted rule in `--text-muted` (`docs/features/pool-ceiling-modifier-door.md`),
  wherever the account has an active grant, and not the underline: the pill's press
  edits, so the underline's `cursor: help` would promise a press it does not have.
  Its `aria-description` and `title` carry D9's sentence.
- **One door per card.** The card already has one `info` door in its corner for a
  calculated ceiling. Where the card has both a ceiling breakdown and a buffer
  account, the door opens both, headed `Max` and `Temporary`, which is the Roster
  row's one-door rule ("a door of one part carries no heading"). Where it has only
  the buffer, the same door is drawn for it alone. Its `.sheetsmith-sr-only` twin
  carries the same text.
- **`buffer: 'clear'`** on a reset sets the stored `temp` to `0` and touches no
  spent record, by the owner's decision. So a reset clears the Pool's own
  temporary points and leaves what an active grant has left exactly as it was.

### The account (`components/modifier-breakdown.ts`)

The state account's shape, read for a buffer:

```
Your own: 5

Wild Shape · Brown Bear — grants 10, 7 left
Gear · Ring of Vitality — grants 5, 3 left (not applied: a higher grant applies)

Not granting now: Gear · Old ring, 4 spent

Now 7
```

- **The first line gives the stored buffer, where a grant is in effect**, and is
  absent where the Pool's own points are, which is the state account's own rule.
- **One line per active grant**, in walk order: the source token on §9's rule,
  `grants <amount>, <left> left`, and the verdict. A grant passed over reads
  `(not applied: a higher grant applies)`, or `another grant of the same value
  applies` on a tie, through `suppressionWording('grant', …, 'value')`. A grant the
  Pool's own points beat reads `(not applied: already higher)`. A refused grant
  (D2, D4, D5) reads its sentence in place of the verdict, and keeps the amount
  it asked for — `Gear · Ring — grants 5 (not applied: …)` — but **carries no
  remainder**: it granted nothing, so `5 left` would offer points it never
  gave and `0 left` would claim a spend that never happened. **The row's own
  popup reads the same verdict**: it folds the grants against the note's own
  points and records as the door does, so a grant the pool's own points beat is
  `already higher` on the row as at the door, and a larger grant spent below a
  smaller one is the one passed over on both.
- **Leftovers** follow the grants, one line each (D10).
- **The last line is `Now <effective>`**, as a state's is.
- **A refused buffer** opens on the refusal and has no own line (D11).

### Where it lands, by component

- **Pool**: declares `buffer` on `<id>.temp` where `hasTemp` is on, implements
  `endGrants`, and draws as above. A Pool without `hasTemp` is unchanged.
- **Table, Record set, Stat block**: unchanged. Each already pushes every part of
  its modifier cells, a Stat block only for the form in play, and a grant is one
  more kind of change those parts hold. A Conditions entry's `when Active` is the
  condition doing its job.
- **Every other component**: unchanged.

### The pickers (`modifier-form.ts`, the layout editor's definitions field)

- **The Value select gains a group, `Temporary points`**, after `Levels and flags`
  and before `Notes only`, listing each buffer target by its label (`HP · temp`).
  Left out where empty, so a layout with no buffer draws today's list.
- **With a buffer chosen, the Operator select offers only At least**; a stored
  other operator is carried so the select can show what the change says, with
  D2's sentence beside it, on both pickers, as a level or a flag carries a stored
  Adds to (`docs/features/non-number-modifiers.md`). Moving an
  existing change onto a buffer switches it to At least, announced as the state
  move announces `Operator Sets`. Bonus type and phase are hidden, as they already
  are for At least.
- **Amount keeps its expression field, with a legend under it**: `Whole points.
  The highest grant, or the pool's own, applies.`, in the position legend's
  spelling.
- **The definitions report** lists D2's sentence for an Adds to or a Sets aimed
  at a buffer.

### Empty and error states

- **No grant pushed**: the pill is exactly as it is today, with no mark and no
  door.
- **A grant whose `when` is false**: nothing listed, no mark, as for a number.
- **A grant fully spent**: listed `grants 10, 0 left`. Where the Pool's own points
  are 0 too, the pill draws `0` in its drained colour, the mark and door still
  drawn because a grant is active.
- **A grant the Pool's own points beat**: the door is drawn and the line reads
  `already higher`; no description and no tint.
- **A refused grant**: listed with its sentence; the buffer still works.
- **A refused buffer**: D11.
- **A leftover only**: the door is drawn for the leftover line, and the pill
  carries no mark, since nothing is raising it.

### Harness views

Three sheet views, each a Pool with `hasTemp` beside one pushing component, and
each shot twice, light theme, at the default width:

- **`pool-grant-form`**: a Stat block `Wild Shape`, its form Brown Bear in play
  with `hp.temp >= 10` in its Modifiers field. The Pool stores `temp: 3` and
  `spent · Wild Shape · Brown Bear: 4`, so the pill draws `6` with its mark, the
  card is tinted with the form's pill (D12), and the door sits in the corner. Shot
  `pool-grant-form-active.png`. The same view with no form in play, the record
  cleared: the pill draws `3`, no mark, no tint, no door. Shot
  `pool-grant-form-ended.png`.
- **`pool-grant-spell`**: a Record set `Spells`, its record False Life with an
  `Active` toggle on and `hp.temp >= 8 when Active`. Stored `temp: 0`, no record,
  so the pill draws `8`. Shot `pool-grant-spell-active.png`; then Active off, the
  pill `0` in its drained colour, no mark. Shot `pool-grant-spell-ended.png`.
- **`pool-grant-item`**: a Table `Gear` with open rows, a `Worn` toggle, and Ring
  of Vitality worn with `hp.temp >= 5 when Worn`. Stored `temp: 6`, so the grant is
  passed over and the pill draws `6` with its mark, untinted. Shot
  `pool-grant-item-active.png`; then Worn off, the pill `6`, no mark. Shot
  `pool-grant-item-ended.png`.

Two more, because decision 5's account and D8's sentence are things being
reviewed, and the six above show neither:

- **`pool-grant-door`**: the form view's door opened, the account reading as under
  **The account**, with a passed-over item line and a leftover line. Shot
  `pool-grant-door.png`.
- **`pool-grant-typed-under`**: the form view after `2` is typed into the pill
  and committed under Brown Bear's grant. The pill still draws `6`, and D8's
  sentence sits under it in the refused-draft slot, with no refused border. Shot
  `pool-grant-typed-under.png`.

## Config fields

None on any component, and no new layout key. A grant is a change whose `target`
is a buffer and whose `operator` is `upgrade`, which both tiers already spell. The
pickers gain the group and the legend above.

## Data and file model

- **Character note.** A Pool's fence may hold lines of the form
  `spent · <source> · <row>: <points>`, after its other entries:

  ````markdown
  ## HP
  ```sheet
  current: 22
  temp: 3
  spent · Wild Shape · Brown Bear: 4
  ```
  ````

  A line is added by the first spend through that grant, changed by later ones,
  and removed by the write that ends the grant (D7). The key's prefix is what
  tells a spent record from any other entry the Pool preserves, and the key is
  compared whole and never split, so a label holding ` · ` is fine. A fence key
  cannot hold a colon or a line break (D5). Constraint 2 holds by construction:
  the key is the row's reader-facing label, never its wikilink.
- **Round trip.** `writeFenced` touches only lines whose value changed, so a note
  with no spent record keeps its bytes, and a hand-spaced record keeps its
  spelling until its value moves (Constraint 3).
- **Existing notes.** Nothing is written until a reader spends through a grant.
- **Layout edits.** Removing a grant, a definition, `hasTemp` or the source
  component leaves every spent record where it is; the account reports it as a
  leftover while the Pool still draws (D10), and the Pool keeps it as an
  unmapped entry when it does not (Constraint 4).
- **An older plugin.** A layout aiming At least at `hp.temp` reads there as an
  At least at a name that accepts no modifier: nothing moves, and nothing is
  written. An older Pool preserves the spent lines as entries it does not own. The
  release notes say a layout using grants needs this version.

## Acceptance criteria

The model, as tests:

- [x] `formula/modifier-buffers.test.ts`: `foldBuffer` over stored 5 and a grant
      of 10 gives 10 with the grant in effect and own line 5; stored 12 gives 12,
      the grant `already higher`; two grants of 10 and 8 give 10 with the 8
      `a higher grant applies`; a tie names `another grant of the same value
      applies`. The result's effective value is unchanged under shuffled walk
      order.
- [x] The owner's case, named for it: stored 5, a grant of 10, a spend of 7.
      Stored goes to 0, the grant's record to 7, the effective buffer to 3, and the
      pool loses nothing. A second spend of 4 drains the buffer to 0 and the pool
      by 1.
- [x] Each refusal has a test asserting its exact sentence: Adds to and Sets at a
      buffer (D2), an amount of `2.5` (D4), a label holding a colon (D5), an
      unresolved amount refusing the buffer (D11). A negative amount grants 0 and
      is not refused.
- [x] D13's cycle: refused cold through the walk's guard with its sentence, and
      warm through the name table's guard with the row named; neither recurses.
- [x] `hp.temp` reads the effective buffer and `hp.temp.value` the stored one; a
      grant at `hp.temp` where `hasTemp` is off is a stray and changes nothing.
- [x] A grant at a buffer leaves `mod.hp.temp` and every slot's breakdown
      byte-identical to having no grant.

The Pool, as tests:

- [x] `pool.test.ts`: a note with spent records round-trips byte for byte; a
      hand-spaced record keeps its spelling; a record whose value is `x` counts as
      0 and is marked, never rewritten.
- [x] A spend through two active grants and the stored buffer writes `temp` and
      both records in one `onChange`; a step down then up in one gesture refunds
      them all to where they began.
- [x] Focusing the pill and leaving it untouched while a grant is in effect writes
      nothing. Typing `3` under a grant of 10 writes `temp: 3`, the pill draws 10,
      D8's sentence is shown under the pill in the refused-draft slot (the field
      described by it, with no `aria-invalid`), and the live region says the
      same sentence. The next edit of the pill clears it. Typing `2.5` is refused
      with the existing sentence, in the same slot. No new notice builder is
      added beside `markTemp`.
- [x] `buffer: 'clear'` writes `temp: 0` and leaves every spent record.
- [x] `endGrants` removes exactly the ended keys' lines and answers null where
      none is recorded.
- [x] `contract.test.ts`: a component declaring a `buffer` entry implements
      `endGrants` and declares `hasBuffer`; one implementing `endGrants` declares
      a `buffer` entry.

The view, as tests:

- [x] `sheet-view.test.ts` (or a sibling): turning a Table row's `Worn` off, with a
      spent record for its grant, writes the toggle and removes the record in one
      save. Switching a Stat block's form out, deleting a Record set record, and
      renaming a Table row each do the same. An edit on a sheet where no active grant has a spent record
      builds no second walk.
- [x] A reset whose binding empties a Conditions table's `Active` column removes
      those conditions' records in the rest's one write, and its Undo restores
      both.
- [x] A hand-edited note whose grant source is off keeps its record, and the
      account lists it as `Not granting now`.
- [x] A leftover is never stuck, named for it: with a spent record, a source
      turned off in markdown view keeps its record; turned back on in the sheet,
      its grant reads partly spent; turned off and on again in the sheet, it
      grants in full.

The face:

- [x] The pill draws the effective value, the dotted mark wherever an active grant
      is listed, and D9's description only while a grant is in effect.
- [x] The door's account text equals the block under **The account** for the
      `pool-grant-door` sample; on a card with a calculated ceiling and a grant,
      one door opens two parts headed `Max` and `Temporary`.
- [x] `view/placement-decorations.test.ts`: a form in play whose grant is in effect
      tints the Pool's card; a passed-over grant does not.
- [x] With no grant anywhere, every existing Pool, Table, Record set and Stat block
      test's DOM and text are unchanged.

The pickers:

- [x] The modifier form and the definitions field list `Temporary points` with
      `HP · temp`; choosing it offers only At least and shows the legend; a layout
      with no buffer draws today's groups. The definitions report lists D2's
      sentence.

The harness and the vault:

- [x] The six shots `pool-grant-form-active.png`, `pool-grant-form-ended.png`,
      `pool-grant-spell-active.png`, `pool-grant-spell-ended.png`,
      `pool-grant-item-active.png` and `pool-grant-item-ended.png` show what
      **Harness views** says each holds, and the card is the same size in each
      pair. `pool-grant-door.png` shows the account, and
      `pool-grant-typed-under.png` shows D8's sentence under the pill.
- [x] **The vault fixture**, so a clone can rebuild it: a new
      `Sheetsmith layouts/Grant variations.sheetsmith` holding
      - `hp`, a Pool labelled `HP`, `max: "30"`, `hasTemp` on, bound to a `Long
        rest` trigger with `action: "full"` and `buffer: "clear"`;
      - `wild_shape`, a Stat block labelled `Wild Shape`, `exclusive` on an
        `Active` toggle, a `Modifiers` field;
      - `spells`, a Record set labelled `Spells`, fields `Active` (toggle) and
        `Modifiers` (modifier);
      - `gear`, a Table labelled `Gear`, open rows, columns `Item`, `Worn`
        (toggle), `Modifiers` (modifier);
      - `conditions`, the Conditions palette entry, labelled `Conditions`, its
        `Active` column bound to `Long rest` with `action: "empty"`.

      And `Characters/Grants.md` on that layout, holding: HP `current: 22`,
      `temp: 3`, `spent · Gear · Ring of Vitality: 1`, and a leftover
      `spent · Gear · Old ring: 4`; Wild Shape's Brown Bear, not in play, with
      `hp.temp >= 10`; Spells' False Life, Active off, with
      `hp.temp >= 8 when Active`; Gear's Ring of Vitality, Worn, with
      `hp.temp >= 5 when Worn`; Conditions' Heroism, Active off, with
      `hp.temp >= 4 when Active`.

      What to press, and what each shows: on open the pill draws `4` with its
      mark (the ring's 5 − 1 beats the own 3), untinted, `Granted by Gear · Ring
      of Vitality; your own: 3.` on hover, and its door lists the ring and
      `Not granting now: Gear · Old ring, 4 spent`. Put Brown Bear in play: the
      pill draws `10`, the card tinted, the ring listed `a higher grant
      applies`. Spend 7 with the adjust control: the pill draws `3`, HP stays
      22, and in one save the note's `temp` becomes `0`, the ring's record `5`,
      and it gains `spent · Wild Shape · Brown Bear: 7`. Take Brown Bear out of
      play: the Brown Bear line goes in the same save as the switch, and the
      pill draws `0`. Put it back in: `10`, in full. Type `2` into the pill:
      `temp: 2` is written, the pill still draws `10`, and the sentence
      `HP temporary 10, granted by Wild Shape · Brown Bear; your own is now 2.`
      sits under it until the pill is edited again. Turn on False Life: `10`
      still, False Life listed `a higher grant applies`. Take the ring off: its
      line goes in that save. Spend 3, so False Life has a record, then press
      Long rest: HP `30`, `temp: 0`, False Life's record and the Old ring
      leftover both kept (`buffer: 'clear'` reaches the stored points only);
      Undo puts the note back. Then the leftover's recovery: put the ring back on
      in the sheet and spend 2, so the note holds `spent · Gear · Ring of
      Vitality: 2`. In markdown view, set the ring's `Worn` cell to `no`: the
      record stays, and back in the sheet the account lists it `Not granting
      now: Gear · Ring of Vitality, 2 spent`. Turn Worn on in the sheet: the
      ring reads `grants 5, 3 left`, partly spent. Turn it off and on in the
      sheet: the record goes with the off, and the ring reads `grants 5, 5
      left`, in full.
- [x] `npm run lint` (0 warnings), `npm test`, `npm run build`, `npm run harness`
      and `npm run harness:shot` pass.

The docs:

- [x] `docs/SPEC.md` is amended as drafted under **For `/land-it`** below, and
      `docs/features/character-forms.md` with it.
- [x] `docs/UI.md` §9 names the pill's mark, the one door carrying two parts, and
      the buffer account's first and last lines.

## For `/land-it`

The §13 entry was written with this spec and has no `Resolved:` line. These are
the texts to apply once the build is settled, adjusted to what the build found.

**§13, the entry's `Resolved:` paragraph:**

> Resolved: **built as settled — a grant is an At least aimed at a buffer, worked
> out at render, and the Pool stores only what each grant has had spent**
> (`docs/features/granted-temporary-points.md`). The argument is §2's push model
> kept whole: a form, a spell, an item or a condition grants by pushing a change
> like any other, `hp.temp >= 10 when Worn`, and the Pool learns no source. At
> least was already the higher-wins operator, so the cell grammar and both tiers
> are unchanged, and Adds to and Sets aimed at a buffer are refused. The effective
> buffer is the highest of the stored `temp` and each active grant's remainder,
> and a spend drains every one of them by the same amount, so the buffer reads as
> its maximum minus the damage and a passed-over grant cannot come back larger.
> What a grant has spent is stored in the Pool's fence under `spent · <source> ·
> <row>`, the row's reader-facing label as the key on Track's precedent for
> character-added rows, and cleared in the same write as the reader's edit that
> ends the grant, which is why §6's last line still holds: the grant is never
> written, and the record is the grant's own bookkeeping. A record no active
> grant claims is reported and never rewritten (§10). The contract grew twice,
> `ScopeEntry.buffer` and `endGrants`, each passing §4.1's rule. **Still open**:
> a buffer `to` on an ordinary reset binding ("a long rest sets temp to
> `level`"), the next route; keeping leftover points after a source ends, which
> needs a write; and one-shot grants.

**§2**, after **Modifier slot**, a new term:

> **Grant.** A change aimed at a buffer, a Pool's `temp`, spelled as an At least:
> `hp.temp >= 10 when Worn`. It raises the buffer while its row is active and is
> never written: the buffer the Pool draws is the highest of its own stored points
> and each active grant's remainder, and the Pool stores only how much of each
> grant has been spent, keyed by the row's label. *Avoid* calling it a bonus: a
> grant does not add, and the higher one wins (`docs/features/granted-temporary-
> points.md`).

And in **Modifier**, after "names no source however many rows push at it": "A
change may also grant temporary points to a Pool's buffer (**Grant**, below)."

**§4.1**:

- In `scopeValues`, after the `state`/`states` sentence: "**An entry may also say
  its value is a buffer a grant may raise** (`buffer`), carrying what the note
  stores of each grant's spending, so the walk can fold the grants onto the
  stored value without learning the component's fence
  (`docs/features/granted-temporary-points.md`)."
- In `hasBuffer`, a closing sentence: "A component declaring a `buffer` entry
  declares this too."
- A new member after `hasBuffer`: "**`endGrants`**. Clear the spent records of
  grants that have just ended, given the component's data and their keys. The
  sheet view calls it in the same batch as the reader's edit that ended them, so a
  grant's end is one write (§6). `hasBuffer`'s argument: the alternative is the
  view knowing a Pool's fence keys. Declaring a `buffer` entry obliges it."

**§4.2 Pool**:

- *Data:* "`fenced`, `current`, optionally `temp`, `max` where the character owns
  the ceiling, and one `spent · <source> · <row>` entry per grant spent from."
- After "Per-instance durations are out of scope…", replace the paragraph with:
  "**A grant is a per-instance buffer, and it belongs to whatever granted it.** A
  modifier aimed at `<id>.temp` with At least raises the buffer while its row is
  active, and the source's own toggle is its duration. The buffer the card draws
  is the highest of the stored `temp` and each active grant's remainder; a spend
  drains every one of them by the amount absorbed, each floored at 0, so the
  buffer reads as its maximum less the damage. What each grant has had spent is
  stored under `spent · <source> · <row>`, the row's label as the reader reads it,
  and cleared by the write that ends the grant. Typing into the pill edits the
  stored part; the pill draws the effective value, and while a grant is in effect
  its description names it. Where a typed value lands below a grant still in
  effect, a sentence under the pill says so on commit, in the slot a refused
  draft uses, until the pill is next edited. **The accepted cost**: when a grant ends, what is left
  of the stored points stays, a little more generous than 5e's choose-one rule."
- In "Which event clears the buffer…": "`buffer: 'clear'` empties the stored
  points and leaves what an active grant has left."
- The publish sentence: "…and its temporary points as `<id>.temp` where the
  layout asks for them, the effective buffer once a grant raises it, with
  `<id>.temp.value` the stored points."
- In the shared card rules' mark paragraph, after the ceiling's door: "**A Pool's
  temporary points do, while a grant is listed**: the pill takes the ceiling's
  dotted rule, and the same corner door opens the buffer's account, headed
  `Temporary` where it also carries the ceiling's."

**§5**, after the "which names accept a modifier" bullet's state sentence: "**A
buffer accepts a grant without a slot**: a stored `temp` has no formula to read
`mod.self`, so a component declares which of its entries a grant may raise
(`ScopeEntry.buffer`, §4.1), and those accept At least only
(`docs/features/granted-temporary-points.md`)."

**§6**:

- The `buffer: 'clear'` bullet: "…for a component that declares a buffer, which
  clears the points the component stores and never what an active grant has
  left."
- The last line becomes: "This is the only place the sheet performs an action
  rather than holding values. **A grant's end is not a second one**: a grant is
  never written, and what is cleared when it ends is the record of its own
  spending, in the same write as the reader's edit that ended it
  (`docs/features/granted-temporary-points.md`)."

**`docs/features/character-forms.md`**:

- Item 4's last sentence: "…a rest refill is an ordinary reset binding, and 5e
  2024's temporary HP is a grant from the form to the character's own `hp`
  buffer, removed when the form leaves play
  (`docs/features/granted-temporary-points.md`)."
- In **Deliberately not doing**, the "any on-activate trigger" item gains: "A form
  granting temporary points is not one: it is a grant, worked out at render
  (`docs/features/granted-temporary-points.md`)."

## Commit boundaries

These are a plan for `/land-it`, not a schedule. The tree stays uncommitted
through the build and every round of findings. No commit carries a
`Co-Authored-By` trailer.

1. `feat: Fold a grant onto a pool's temporary points`. `ScopeEntry.buffer`,
   `bufferTargets`, the walk's fourth reduction, `formula/modifier-buffers.ts`
   with `foldBuffer` and the refusals, `src/en.ts`, the bare name and `.value`,
   the cycle sentence, and the engine tests.
2. `feat: Keep what a grant has spent`. Pool's `buffer` entry, its spent records'
   read and write, the spend's fan-out and refund, the pill drawing the effective
   value against what it drew, `endGrants`, and the contract checks.
3. `feat: Clear a grant's spent points when it ends`. The view's second pass in
   `applyEdits` and the reset batch, `activeGrantKeys`, and the view tests.
4. `feat: Show a pool's grants at its temporary points`. The pill's mark and
   description, the one door with two parts, the buffer account in
   `modifier-breakdown.ts`, and the live-region sentence.
5. `feat: Offer temporary points as a modifier value`. The `Temporary points`
   group, the operator restriction, the legend, and the definitions report.
6. `feat: Tint a pool a form in play grants`. The decoration pass reading buffer
   lines.
7. `test: Stage grants from a form, a spell and an item`. The three harness views
   and `pool-grant-door`.
8. `docs: Let a modifier grant temporary points`. This file at `built`, the
   `SPEC.md` amendments, `character-forms.md`, and `UI.md` §9.

## Deliberately not doing

- **Naming a buffer generically.** The sentences that name the pool — D5's
  "the pool keeps what is spent", the legend's "or the pool's own" — say
  "pool" because a Pool is the only component that declares a buffer. They are
  reworded if a second component ever declares one.

- **C's reset half**: a buffer `to` on an ordinary reset binding ("a long rest
  sets temp to `level`"). The named next route. A rest that refreshes a
  partially spent grant belongs with it; until then a worn item's spent grant
  comes back only by taking it off and on.
- **Keeping leftover points after a source ends.** It needs a write of the leftover
  into `temp`, which is option B's cost.
- **One-shot grants**: a source grants while something on its row is true, and the
  player turns it off when it ends.
- **A grant at anything but a Pool's `temp`**: no other component declares a
  buffer.
- **Migrating spent keys** on a row, record or component rename: the rename is a
  new source (D5).
- **The temp pill not following the text size** (`.sheetsmith-pool-temp-input`,
  `docs/BACKLOG.md` § UI), untouched.
- **The refusal notice built three times** (`markTemp` is one,
  `docs/BACKLOG.md` § Patterns), untouched. D8's sentence reuses the existing slot
  and its notice path, so no fourth copy is added.
- **A form's tag overlapping a row label in a narrow Roster card**, its own bug
  run.
- **A modifier setting a text value**, gated on its own §13 entry.
