# Pool ceiling modifier door

Status: built
Board card: A Pool's ceiling moves with no mark and no door (`docs/BACKLOG.md` § UI)

## Model question

None. Which names accept a modifier is settled (SPEC §5: static, coarse at the
component), `hp.max` is already published, and a push at it already reaches the
numeral, the bar and the clamp. This feature only draws what is already computed.

One fact decides the scope, and it comes from the code rather than a ruling.
**A stored ceiling cannot be moved by a modifier.** With `maxSource: 'character'`,
`pool.scopeValues` publishes `max` as `{ value: data.max }`. That is a stored
value with no formula, so nothing evaluates it and nothing can read its slot. The
numeral, `ceilingOf()`, the bar and the clamp all read the typed number. A push at
`<id>.max` on such a pool lands only where some *other* formula reads
`mod.<id>.max`. The pool's own number never moves.

So the mark and the door are drawn **only on a derived ceiling**: `maxSource` is
not `character` and `config.max` is set. This does not settle the narrow-set row.
That row is about *which formula* reads the slot. A stored ceiling has no formula
at all, so neither half of the OR can move it. A Card already draws its mark on
the `derived` only, never on the stored value pill, so this follows that rule.

## What it does

When a modifier moves a Pool's calculated maximum, the ceiling numeral after the
slash gets a dotted rule under it. An `info` door in the card's top corner opens
the shared breakdown popover: what moved the maximum, by how much, and the total.
A pool whose maximum nothing moved looks exactly as it does today.

## Smallest version

The door alone, on a derived ceiling, with `modifierBreakdown` in `showPopover`
and an `aria-describedby` twin. What it gives up: the mark at the number, so a
reader sees that *something* on the card was modified but not that it was the
ceiling. That is the backlog row's own complaint, "no mark", so the smallest
version that closes the row includes the dotted rule.

## Design

### The door

Track's door, ported (`docs/UI.md` §9, "A door onto a breakdown"):

- A `<button type="button">` with `setIcon(button, 'info')` and
  `aria-label` `Modifiers on <label>`. Its click calls
  `showPopover(button, text)`. It has class `sheetsmith-pool-modifier-button`, a
  new name for what this one is about. Its treatment comes by joining
  `.sheetsmith-track-modifier-button` on **every** selector list that rule sits on:
  box, ink, hover, focus ring, the `--text-muted` raise and the `--icon-xs` glyph.
  No copied declarations.
- `text` is `modifierBreakdown(context.modifiers?.breakdown(maxName), shown)`.
  `maxName` comes from `publishedFieldNames(pool, config).get('max')`, Track's
  spelling, and `shown` is the resolved max. The door is drawn only where `text`
  is non-null, so it **follows the wide set**, as Track's door and Card's
  underline do. If the narrow-set row is ruled later, it moves all three together.
- It has an `aria-describedby` pointing at a `.sheetsmith-sr-only` twin that holds
  the same `text`, the note mark's spelling. Without the twin, a keyboard reader
  hears only "Modifiers on Hit points" and has to press to learn anything. The
  ceiling span is not focusable, so the door is the one control that can carry
  the account.
- **Placement is the note mark's corner, not Track's heading row.** A Track's
  label is start-aligned, so a flex row of label and door costs it nothing. A
  Pool is centred (`.sheetsmith-pool` has `align-items: center`), like a Card,
  and a heading row would push the label off centre by half the door's width. So
  the door uses the `.sheetsmith-card-has-note > .sheetsmith-note-mark` corner,
  by selector list: out of flow, `top` and `inset-inline-end` at `--size-2-3`.
  The card takes `.sheetsmith-pool-has-door` (`position: relative`), and the label
  takes the symmetric reserve and the 200px wrap rule by joining those lists.
  **With the label hidden** (`showsOwnLabel` false), the door keeps its corner,
  as the note mark does.
- The card's `pointerdown` router already returns early on
  `target.closest('button')`, so a press on the door never routes focus to a
  field. No router change.
- **A ceiling that will not resolve** (`?`, `.sheetsmith-pool-max-unresolved`)
  draws no mark, because `?` is a status and not a number. If the breakdown still
  has lines, the door draws, and its text leads with the same sentence the `?`
  carries in its `title` (`context.explainField('max')`), followed by a blank line
  and the breakdown. That is Track's `withBreakdown` rule: the popover carries
  what the reader cannot otherwise see. A slot that itself errors returns an
  empty breakdown from `sheet.ts`, so in that case there is no door, only the
  `?` and its `title`, exactly as today.
- **Notes can join later without a second glyph.** Notes on Pool are out of
  scope, but the corner holds exactly one `info` door. Notes would arrive as
  `drawsNotes: true` plus the text switching from `modifierBreakdown` to
  `modifierAccount`. The door would then draw for `account.text` rather than
  `arithmetic`, and the mark would keep following `arithmetic`. The note mark
  already wears `info` (`docs/UI.md` §9, "Which glyph"), so a noted pool gets the
  same door and not a second corner glyph. That matches the "one face door on a
  Pool" plan in `docs/features/modifier-notes.md`.

### The mark: what is Pool's own

`.sheetsmith-pool-max-modified` goes on the `.sheetsmith-pool-max` span:
`border-bottom: 2px dotted var(--text-muted)`, with no `cursor` change.

- **Why not `.sheetsmith-modified`.** That class has two problems here. First,
  its `cursor: help` promises a press on the number, and this numeral has no
  press of its own: the card's router hands a press there to the nearest field.
  The door is the one route in. Second, its plain underline is the "reads as a
  link" row, and adding a consumer would widen an open finding.
- **Why `border-bottom` works here when it was reverted on Card.** It was
  reverted on Card because it draws on the element's box, and a right-aligned
  number in a wide cell is narrower than its box. The ceiling span is a flex item
  of `.sheetsmith-pool-ceiling` (`display: flex`, `white-space: nowrap`), sized to
  its digits, so its box is the numeral. This is also the spelling the Card row
  wanted and lint refused (dotted, muted, 2px as `text-decoration-*`), so Pool's
  mark is what Card's mark would be with a box that fits.
- **Dotted, not dashed.** Dashed is Track's "a modifier *granted* this", which is
  one direction only. A ceiling's mark says "moved" in both directions, like
  Card's. Dotted, under text, is the `abbr` convention for "there is an
  explanation for this".
- **`--text-muted`**, for the measured reason `.sheetsmith-modified` records: the
  rule is the only thing at the number saying it moved, so it needs 3:1. Muted
  measures 6.19 or better on a card in both themes, and faint measures under 3:1.
  It matches the numeral's own colour, so the rule reads as part of the numeral
  and not as a divider.
- **Forced colors.** A border's style and width survive `forced-colors: active`
  and only its colour is repainted, so the dotted rule stays visible. The door's
  SVG uses `currentColor` and follows. No `@media (forced-colors)` rule is needed.
  Nothing relies on colour, which keeps WCAG F13 out.
- **The bar and the clamp take no mark.** The fill already shows the moved
  ceiling. A second channel on the bar would be the "second ceiling" that the
  Track design refused.

### Stored against derived

| Ceiling | What is drawn | Why |
| --- | --- | --- |
| Derived (`maxSource: calculated`, `max` set), something pushed | Dotted rule under the numeral, `info` door in the corner | The numeral is a formula result the push moved |
| Derived, nothing pushed | Today's card, byte for byte in the DOM | No breakdown text, so no class, no door and no twin |
| Derived, `?` | `?` unmarked; door only if the breakdown has lines, leading with the `?` sentence | `?` is a status |
| Stored (`maxSource: character`, the input form) | Today's card, always, whatever is pushed at `<id>.max` | No formula, so nothing a modifier does can move the typed number. A mark on an input the reader types would claim the typed value is not the value |
| No ceiling (`max` absent) | Today's card | No `<id>.max` is published |

A stored ceiling with a push aimed at it is not a silent failure. If nothing on
the layout reads the slot, the modifier row's own stray line says so, as for any
target that ignores its push. If something does read it, the push is that
formula's, not the pool's.

## Config fields

None. The feature reads existing config (`maxSource`, `max`) and adds no field.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |

## Data and file model

Nothing stored and nothing written. The note's fenced block is untouched,
including a character-mode `max:` entry. Round-trip (Constraint 3) and existing
notes (Constraint 4) are unaffected, because the render reads only
`context.resolved` and `context.modifiers`.

## Acceptance criteria

- [x] A Pool with `maxSource: calculated` and `max: '<n> + mod.self'`, with a push
      at `<id>.max`, draws its ceiling numeral with
      `.sheetsmith-pool-max-modified`. The numeral and the fill both reflect the
      pushed value (`pool.test.ts`).
- [x] The same card draws one `button.sheetsmith-pool-modifier-button` with the
      `info` glyph, `aria-label` `Modifiers on <label>`, and `aria-describedby`
      naming a `.sheetsmith-sr-only` element whose text equals the
      `modifierBreakdown` text. A click opens `showPopover` with that same text
      (`pool.test.ts`).
- [x] An unmodified derived Pool has no modified class, no door, no twin and no
      `.sheetsmith-pool-has-door` (`pool.test.ts`).
- [x] A Pool with `maxSource: character` and a push at `<id>.max` draws no mark and
      no door, including when its config also holds a leftover
      `max: '… + mod.self'` that makes `<id>.max` accepting (`pool.test.ts`).
- [x] A derived ceiling that resolves to `?`, with a breakdown that has lines,
      draws no mark. Its door's text starts with the `explainField('max')`
      sentence (`pool.test.ts`).
- [x] A `pointerdown` on the door does not move focus to a field
      (`pool.test.ts`).
- [x] `sheet.css`: `.sheetsmith-pool-modifier-button` appears on every selector
      list that holds `.sheetsmith-track-modifier-button`, the corner position
      and label reserve are added by selector list, and no declaration block is
      duplicated. The `styles.css` parity test passes.
- [x] Harness, `populated` state: a derived-ceiling Pool raised by a push and one
      lowered by a push, each showing the dotted rule and the corner door, and a
      character-mode Pool with a push at its `.max` showing neither, in both
      themes. The `Worn items` table pushes at all three. The two derived Pools
      sit together in the nearest free row to it (row 38). The character-mode
      Pool sits in a three-column slot elsewhere (row 46), because that row has
      only two columns left and a two-column pool clips its own reading at a
      520px container, which is a limit of Pool's own width and not this
      feature's to photograph. A
      shot under `forced-colors` emulation, or the reviewer's stated reason it
      cannot be taken, shows the rule surviving.
- [x] Harness, `unmodified` state: the same three Pools draw no mark and no door.
- [x] The dotted rule spans the numeral only, not a wider box. Measured in the
      harness, the `.sheetsmith-pool-max` span's width equals its text's width at
      the default size and in the `sheet-large-text` view (`text=24`). A
      `sheet-large-text` shot showing the marked Pools is presented at the land
      stop.
- [x] The label stays centred over the reading on a door-bearing Pool at the
      sample width, and wraps rather than running under the door below 200px
      (harness shot).
- [x] `npm run lint` (0 warnings), `npm test`, `npm run build`,
      `npm run harness` and `npm run harness:shot` all pass. Moved PNGs are named
      in the review.
- [x] `docs/BACKLOG.md`'s row "A Pool's ceiling moves with no mark and no door"
      is deleted. Its two neighbours remain.
- [x] `docs/UI.md` §9 "A door onto a breakdown" names Pool as the **fourth**
      door, records the corner placement and why it is not Track's heading row,
      and the "A number something has been pushed at" row names Pool's dotted
      rule and why it is not `.sheetsmith-modified`. The `SPEC` §4.2 sentence
      "What it still has nothing of is the mark" is rewritten to say what is
      drawn.
- [x] `docs/SPEC.md` §13 gains an open entry, "May a modifier move a typed
      (character-mode) Pool maximum?". It argues for (a rolled maximum plus a
      feat is real) and against (it needs a formula over a stored value, which
      is Card's opt-in `effective` precedent and a model change of its own).

## Commit boundaries

A plan for `/land-it` at the end, not a schedule. The tree stays uncommitted
through the build and every round of findings. No commit carries a
`Co-Authored-By` trailer.

1. `feat: Mark a Pool's ceiling a modifier moved and open its breakdown`.
   `components/pool.ts` (the door, the twin, the mark class, the derived-only
   gate), the `src/styles/` parts and the regenerated `styles.css`, and the
   `pool.test.ts` cases.
2. `test: Stage Pools whose ceiling a modifier moved`. The harness samples, the
   `Worn items` push rows, and the PNGs.
3. `docs: Pool ceiling modifier door`. This file at `built`, the `UI.md` §9 rows,
   the `SPEC` sentence, the new open `SPEC` §13 entry on a modifier moving a
   typed Pool maximum, and the `BACKLOG.md` row deleted.

## Deliberately not doing

- **Notes on Pool.** Pool does not declare `drawsNotes`. A note aimed at
  `<pool>.max` keeps today's "cannot show a note yet" sentence. The door is
  shaped so a notes group joins it later (above), and none of that is built.
- **A modifier on a stored ceiling.** Making a typed maximum modifiable would
  need a formula over it, such as Card's opt-in `effective`. That is a model
  change for its own card, not something this feature should do on the side.
  It is left open in `SPEC` §13, "May a modifier move a typed (character-mode)
  Pool maximum?", which this feature adds.
- **A mark on the current value or the buffer.** Both are stored, so no push
  moves them.
- **The Card underline row** ("A modified number's mark is a plain underline, so
  it reads as a link") and **the narrow-set row** ("A breakdown lists
  contributors that did not move the number it is about"). Both stay open and
  wait on rulings. This feature adds no consumer to `.sheetsmith-modified` and
  gates on the same wide set the existing marks use.
- **A press on the numeral itself.** The door is the only route in, and the
  card's router keeps the numeral's press.
- **Any other `docs/BACKLOG.md` row**, including every forced-colors,
  `--text-faint` and harness-browser row.
- **A Record set `number` field's ceiling**, which shares the
  `.sheetsmith-pool-max` reading. `.sheetsmith-pool-max-modified` is Pool's
  alone, and a record's ceiling is its own question.

## Deferred at the land stop

Seen in review and left unbuilt by the owner's call, recorded here so the next
reader knows they were looked at rather than missed:

- **The door and its twin do not name the maximum.** `Modifiers on Stamina
  reserve` says what is modified, not that it is the ceiling. Track's door has
  the same shape, so a change belongs to both.
- **A one-digit ceiling's rule is three dots.** At `--font-ui-medium` a single
  digit is about 9px wide, so the dotted border draws three dots. It still reads
  as the mark, but thinly.
- **A Pool's bar fill vanishes in forced colors.** That predates this feature,
  and no backlog row records it.
- **A check that every glyph button in a card is in that card's own-control
  selector.** The batch 1 hover finding (`POOL_CONTROLS`) would have been caught
  by one. It was suggested and not built.
- **The Passport and Charisma heading overlap in the harness** predates this
  feature and was seen in its shots.
