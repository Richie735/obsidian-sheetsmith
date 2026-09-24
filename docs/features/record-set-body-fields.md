# A Record set field inside the opened record

Status: shipped
Board card: A Record set draws one summary line per record: the chevron, the name,
then every declared field in declared order, then the delete glyph. A field that is
read once and set rarely (a 5e feature's Recharges, a `level` field with named states
such as "Short rest" / "Long rest") takes summary width from the fields used at the
table (Uses, Prepared). Let an author place a declared field inside the opened
record, above the body's prose, instead of on the summary line.

## Model question

**It touched one, and it is settled and already written.** `docs/SPEC.md` §13 now
carries "**Whether a Record set field may sit in the opened record rather than on its
summary line.**" with its `Resolved:` paragraph, and §4.2's Record set entry says
where a body field draws and that the strip counts only summary fields. The owner
asked for both to be written before this spec, overriding the usual rule that
`/land-it` writes a `Resolved:` entry. This document does not reopen the answer, and
restates it only as far as the design leans on it:

1. **The strip.** A body field has no column. Its track is left out of the grid, and
   the strip and each record's subgrid are built from summary fields only, so N in
   `14.5em + 6em × N` and in the `sheetsmith-record-set-fields-N` table is the
   summary count. N = 0 means no strip (Custom System Builder #335: a heading over
   nothing, or a hole that misaligns the subgrid).
2. **The closed record** shows nothing for a body field: no count and no mark. The
   field is inside the body, so it is under `hidden="until-found"` with everything
   else there. A reset changing a value nobody is looking at is accepted: same entry,
   same write, correct when opened. The guard is the editor's description copy.
3. **A per-field key, not a component-level list:** `placement: 'summary' | 'body'`
   on `RecordField`, absent meaning `'summary'`. It is a string union, on
   `maxSource`'s argument.
4. **`RecordField.secondary` is left alone.** It stays declared, ignored and
   round-tripped.
5. **Formulas, resets and storage do not change.** A body field is **the same
   control, drawn by the same function, on the same commit path**, only attached to
   the body, and never a second copy.

A second §13 bullet, **open**, records state-driven placement (Daggerheart Recall
Cost, 5e Recharge, PF2e Heightened, Lancer LIMITED): accepted as static, the way a
printed sheet accepts it, and not built.

**What the contract has to grow: nothing.** `read`, `write`, `sample`,
`formulaFields`, `scopeRows`, `scopeModifiers` and `applyReset` are untouched. Two
additions sit outside the component, and both are named here so that nothing gets
in as "nothing changed":

- `components/column-types.ts` gains the placement vocabulary: the `Placement`
  union and `BODY_PLACEMENT`, the one id either side tests for or writes. No
  default constant, unlike `DEFAULT_MAX_SOURCE`: a checkbox's off state is the
  key's absence, so the default is never spelled on either side. The reason is that
  file's own fourth policy, the one `MAX_SOURCES` is under: the editor writes the id
  and the component reads it, and neither can import the other's copy.
- `ColumnOptionsSpec.placement`, the editor half. It is opt-in on `holderMax`'s
  precedent, because a list whose component draws no body has nowhere for a field to
  move to. Record set asks for it and Table does not.

**Publishes:** nothing new. **Stores:** one optional layout key per field. **The
character note is not touched.** **Existing notes and layouts (Constraint 4):** a
layout without the key draws exactly what it draws today. Moving a field in either
direction writes only the layout, so it cannot lose a value.

## What it does

An author can tick a field so that it draws inside the opened record, in a short
block of named fields above the prose, and no longer on the record's summary line.
The summary line and the strip over it get that width back. The value is stored,
counted, reset and pushed exactly as before, and a closed record simply does not
show it.

## Smallest version

The `placement` key, read by the component; the body block; a strip and subgrid
counted on summary fields; and the editor checkbox with its description copy. That
is the ask, and nothing in it can go. What could be cut: `nameOnScreen: true` for a
ring in the body (keeping `false` costs only a tooltip that repeats the visible
name); the narrow `:empty` fix if the measurement shows no stray row; and the second
body field in the harness fixture.

## Design

### At a glance

A closed record looks as though the body field was never declared. Open it, and the
body opens with one line of named values above the prose, the way a 5e spell card
prints **Casting Time** and **Range** above its description, a PF2e stat block
prints its traits line, and a Daggerheart card prints its recall cost. The same
arrangement holds at every width.

```
▸ Second Wind            Uses 1 / 3   ○   ◐   2   ⚡   🗑
▾ Ring of Protection     Uses 0 / 1   ●   ◑   3   ⚡   🗑
    Recharge [Long rest ▾]    Save DC 15
    A resolved wikilink as a name, and a typed effect that is applying: ...
```

### Where a body field draws

- **A block at the top of the body.** It is `.sheetsmith-record-body-fields`, the
  first child of `.sheetsmith-record-body`, and holds the record's body fields in
  declared order. It is drawn only when the record's fence read and the
  configuration has at least one body field. The prose layers (field and rendered
  layer, or the read-only layer) come after it, unchanged.
- **The body's grid gains a row only when it has the block.** Today
  `.sheetsmith-record-body > *` stacks every child in `grid-area: 1 / 1`, which is
  the two-layer prose arrangement. A block dropped in there would stack under the
  prose. So the body carries `sheetsmith-record-body-has-fields` when it draws the
  block: the block takes row 1, and the prose layers take row 2, still stacked in one
  cell. With no block, the class, the row and the DOM are all absent, so a layout
  without the key draws the same tree to the node.
- **Every body field draws its own name at every width.** No strip ever names a body
  field, so the name is the only one it gets. A `number` field already draws its
  name beside its value (`.sheetsmith-card-abbreviation`, muted). In the body, the
  same span goes before a ring, a level select, a computed value and a modifier
  glyph as well. It is one span drawn by `drawField` for every type in the body,
  and it is never hidden: the headed regime's rule that hides a number's inline name
  is scoped to the summary line (see **Stylesheet scoping**).
- **The pairs wrap, and a pair never splits.** The block is a flex row with
  `flex-wrap: wrap`, keeping the field row's `gap: var(--size-4-5)` for the target
  clearance `docs/UI.md` sets between two controls. Each field is the existing
  `.sheetsmith-record-field` inline-flex, which keeps a name with its control. The
  block sits a `--size-2-2` step above the prose, with no rule between them: the type
  already separates them, and a hairline would read as a second disclosure boundary.
- **A body field's name lines up ink under ink with the record's name.** The body's
  box is indented to the name *field's* box, and the name's text starts that field's
  `--size-2-2` padding further in, as the prose's does. So the block is inset by the
  same `--size-2-2` on both sides: the first name starts where the record's name and
  the prose start, and a pair wraps where the prose wraps. This is the 320px rule's
  "the ink, not the column", one block over.

### What stays on the summary line

- **The strip and the subgrid are built from summary fields.** In `record-set.ts`
  the headed condition, the `sheetsmith-record-set-fields-N` stamp,
  `--sheetsmith-record-fields` and the strip's children all read the summary fields
  and never `fields`. With no summary field, nothing is stamped and the list is the
  unheaded one, whatever `fieldHeadings` says.
- **The summary line of a record set whose every field is in the body is the one a
  Record set with `fields: []` draws**, empty fields wrapper included. That is a
  criterion. If the narrow rule (container ≤ 320px) turns out to give that empty
  wrapper a row of its own, the fix is `.sheetsmith-record-fields:empty` taking no
  row. That fix changes the `fields: []` case too, and it is recorded as a deliberate
  correction, not a side effect.

  **Measured, and deferred.** It does: on `traits` at `width=520` (a 280px list, so
  the stacking rule applies), emptying one record's fields wrapper leaves a 36px
  summary against the 34px one line needs, a 2px stray row gap. A Record set with
  `fields: []` has exactly the same 2px today, and the vault's `spell_cards` shows
  it below 320px. The `:empty` fix is not applied in this feature: neither the
  380px nor the 520px shot holds a list whose every field is in the body, so no
  view shows it, and correcting `fields: []` is a change to a case this feature
  did not otherwise touch.
- **`fields.${index}.formula` keeps the declared index.** A computed field is
  resolved by its position in `config.fields`, not in either partition. A computed
  field declared after a body field must resolve by its own declared index. The
  obvious implementation, iterating a filtered array with its own indices, gets this
  wrong.

### The same control, not a copy

`drawRecord` partitions the declared fields once, keeping each one's declared index,
and calls **the one `drawField`** for both lists: into the summary's
`.sheetsmith-record-fields` for one, into the body block for the other. The `commit`
closure, the delta `{ records: { [at]: { fields: { [key]: next } } } }`,
`editable.ts`'s rules, the per-record ceiling field, the ring, the select, the
computed value's popover and the modifier form are the same code with the same
arguments. The one argument that differs is the body flag, which does two things:
it draws the name span for every type, and it passes `nameOnScreen: true` to the
ring (below). Nothing is parked off-screen in a second copy (the Airtable failure
mode, where a hidden field was never saved).

**Body fields are in the DOM whether the record is open or closed**, just as the
body's textarea already is. That has three effects. `cell-focus.ts`'s control index
counts the same controls across a rebuild whatever is open. Find-in-page has text to
reach inside a closed body. And a `modifier` field's glyph and its counting do not
depend on the disclosure. `scopeModifiers` reads the fence, so a closed record's
modifier still pushes.

### A ring in the body names itself on screen

`bindRingControl` takes `nameOnScreen` as a fact about the surface. On the summary
line that fact depends on a width only the stylesheet sees, so it stays `false`
(`docs/features/record-set-heading-strip.md`). **In the body the fact is decidable at
draw time**: the name span is beside the ring at every width. So a body ring passes
`true`, which is Table's position, where the heading is present at every width. A
body toggle therefore has no tooltip and no long press repeating a name the reader
can see, and a body *named* level still gets its level's word, which the glyph cannot
draw (`docs/UI.md` §6). If the owner prefers one answer for every ring in a Record
set, keeping `false` is harmless; it is listed as cuttable above.

### Stylesheet scoping

The wide headed regime has five rules written against `.sheetsmith-record-field` or
`.sheetsmith-record-fields` with no summary scope:

- the subgrid on `.sheetsmith-record-fields`
- `justify-self` and `margin-inline` on `.sheetsmith-record-field`
- `translateX(-0.4em)` on `.sheetsmith-record-field-number`
- `display: none` on the field's abbreviation

None of them may reach the body. The block uses its own wrapper class, so the first
cannot match it. The other four are narrowed to
`.sheetsmith-record-summary .sheetsmith-record-field…`. Without that, a body
number's name would vanish on a wide headed list, and nothing would name it at all,
which is the one state the strip feature swore off. A `styles.test.ts` guard holds
it: every rule in the strip block that names `.sheetsmith-record-field` is scoped
under `.sheetsmith-record-summary`. The 320px narrow rule is already written against
the summary and the fields wrapper, and needs the same check.

### Narrow widths

**There is no body regime of its own.** The block wraps, one pair per line at worst.
The summary line's own narrow rules (320px stacking; the strip dropping below its
threshold) are untouched and now count fewer fields, which is the point: with its
reference fields in the body, a summary line stacks later and keeps the strip
longer. At `width=380` a body pair must neither clip nor overflow the body. Its name
and control stay together, and a `<select>` shrinks within its own `max-width`
rather than widening the box.

### Empty and error states

- **No prose:** the block, then the body's empty field with its placeholder ("Write
  anything about this feature."), exactly as a record with no body today, one block
  higher.
- **An unreadable fence:** no block. The record draws no fields anywhere, as it
  draws none on its summary line today, and the read-only body and the problem line
  are unchanged.
- **Every field in the body:** no strip, no field tracks, and a summary line of
  chevron, name and delete (above).
- **No records:** nothing to open. The list is its add control, as today.
- **A body field with no stored value:** its empty state, the same one it has on the
  summary line (`—` placeholder, ring at none, `plus` glyph, and so on), with one
  addition. **A bare `number` (no ceiling) shows Pool's `—` as its placeholder in the
  body, in `--text-faint`,** where on the summary line it is blank. On the summary
  line the slot reads as a slot among its neighbours. In the body a name followed by
  nothing reads as missing content, or as a subheading over the prose. The
  placeholder is body-only, so the summary line and every layout without a body
  field draw exactly what they drew.
- **An unknown `placement` value** (`'Body'`, `'header'`): read as `'summary'`, with
  no configuration error, on `maxSource`'s precedent, where only the one value a
  caller tests for means anything. It round-trips untouched.
- **A refused commit** in a body field (a wikilink in a number, a refused modifier
  part): the same message on the same element, the record's own, as on the summary
  line.

### No third disclosure level

The block is plain. It has no chevron, no "more fields" toggle, no count and no
heading of its own. A record is already one disclosure deep, and NN/g's finding that
more than two levels test poorly applies directly. The block is part of the body and
opens and closes with it.

### Find-in-page

A closed body is `hidden="until-found"`, and a `beforematch` listener opens it when
the browser finds text inside. MDN documents that as revealing on a *text* match.
Whether a match on an `<input>`'s value, or on a `<select>`'s shown option, also
reveals is not documented, and it may differ by engine. Mozilla bug 58305 is the
long-standing report that Firefox's find does not reach form-control values. Whether
Chromium's does, and whether such a match fires `beforematch`, was not confirmed by
the research: it is expected rather than known, and it is what the measurement below
is for. **The body field's name is plain text in the block**, so finding "Recharge"
should reveal the record in any engine that honours `until-found`. The value is the
part in doubt.

**This is measured during the build, not assumed, and recorded here and in SPEC
§4.2's disclosure bullet.** In Chrome (the built harness opened in a browser, not
headless) and in Obsidian (the vault fixture), with every record closed, press
Cmd/Ctrl-F and search for:

1. a body field's name
2. a body `number` field's value
3. a body `level` select's shown word
4. a word from the prose, as the control

For each, record whether it is found and whether the record opens. No behaviour is
required beyond recording it. A value that is not found is an accepted cost of static
placement, and the name is the find route.

**Not yet measured, and nothing above is a result.** The build could not take it:
headless Chrome, which is how the harness is photographed, cannot drive the browser's
find bar, and `window.find()` is a different mechanism from the find-in-page that
`until-found` answers. The four searches remain to be done by hand, in Chrome and in
Obsidian, and are recorded here and in SPEC §4.2 when they are. Until then the only
claim this feature makes is the structural one: the name is plain text inside a body
that is `hidden="until-found"`.

### Assistive technology

- **Accessible names do not change.** Each control is still `${record} ${field}`,
  from the same code. **Label in Name (WCAG 2.5.3) holds in the body** because the
  visible name span's text is contained in that accessible name. A test holds it.
- **Reading and tab order is DOM order:** the chevron, the name, the summary fields
  and the delete glyph, then (open) the body fields and then the prose field. A body
  field is reached by opening its record and continuing forward, which is where it
  is drawn.
- **A closed body's controls are not tab stops.** `hidden="until-found"` runs on
  `content-visibility: hidden`, which takes the content out of the focus order. Tab
  from a closed record's delete glyph goes to the next record's chevron. **Not yet
  checked**: the two by-hand Tab presses in the vault fixture's press list were not
  done at landing, so this is the platform's documented behaviour rather than an
  observation. happy-dom
  implements none of this, so it is a check in the vault by hand, not a test.
- **No role, no `aria-hidden` and no live region on the block.** The body is already
  the region the chevron's `aria-controls` names, and its fields announce themselves.
  The component's existing live region still announces a commit or an
  Escape-restore.
- **The name spans are not `aria-hidden`.** They duplicate part of the accessible
  name, which is what the number field's span already does, and hiding them would
  let a screen reader in browse mode skip a word the sighted reader sees.

### Reuse

| Need | Reused | Not written |
| --- | --- | --- |
| Every body control | `drawField` and everything under it, unchanged but for the body flag | a body-specific field renderer |
| Field name | `.sheetsmith-card-abbreviation` in the record's muted override | a body label class |
| Wrap and clearance | `.sheetsmith-record-field`, `gap: var(--size-4-5)` | new spacing tokens |
| Disclosure | the record's chevron and `hidden="until-found"` | a second disclosure |
| Ring naming | `bindRingControl`'s `nameOnScreen` | a naming route of its own |
| Placement ids | `components/column-types.ts`, beside `MAX_SOURCES` | literals in the editor and the component |

### Layout editor

- **One checkbox on each field's detail line**, offered where
  `columnOptions.placement` is `true`, on every type the list offers. Its label is
  composed from `holder`, so it reads **Inside the opened record** here, and a
  component with other words would say its own. Checking it writes
  `placement: 'body'`. Unchecking deletes the key, which is `checkField`'s rule that
  a default is written as absence. `checkField` writes `true`, so it gains a value
  parameter (or a small sibling) for a flag whose "on" is a string id; that is the
  only change to its shape. A hand-written `placement: 'summary'` shows as unticked
  and survives until the box is pressed.
- **It sits last on the detail line, after Maximum from**, because it is about the
  field as a whole and not about its value.
- **The `fields` description gains the guard**, since `list-fields.ts` draws no
  description per control: "Tick **Inside the opened record** for a value read once
  and changed rarely: it draws above the record's prose and is not shown while the
  record is closed. A field used every turn belongs on the summary line."
- **The canvas preview** draws the sample's two records closed, so ticking the box
  makes the field leave the preview's summary line and does not show it anywhere
  until a record is opened. The description's "is not shown while the record is
  closed" is what makes that read as intended rather than as the field being lost.

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `fields.*.placement` | checkbox on the field's detail line, `'body'` or absent | Inside the opened record | (none of its own; the `fields` description carries it) |
| `fields` (amended) | columns | Fields | Existing text, plus: "Tick **Inside the opened record** for a value read once and changed rarely: it draws above the record's prose and is not shown while the record is closed. A field used every turn belongs on the summary line." |

`RecordField.secondary` and `RecordField.hideHeading` stay declared, ignored and
round-tripped, and neither affects placement.

## Data and file model

**No change to the character note.** No key, section, fence entry or body byte
changes. A body field's value is the same `key: value` line in the same fence, which
is why moving a field needs no migration and cannot lose data. `read`, `write`,
`sample`, `scopeRows`, `scopeModifiers` and `applyReset` are not touched, and no
note round-trip test changes (Constraint 3 is not in play).

**The layout gains one optional key per field.** `placement: 'body'` is written, and
the default is absent. A hand-written `'summary'` or an unknown value is carried
untouched. A layout with the key round-trips byte-identically through `parseLayout`
and `serialiseLayout`. A layout without it draws what it drew. Constraint 2 is not
in play: a body field's value is in the same fence under the same commit-time
refusals, and the block writes no markdown.

## Acceptance criteria

### Held by tests

- [x] With no field carrying `placement`, the harness's `traits`, `spells` and `known_spells` configs draw no `.sheetsmith-record-body-fields` and no `sheetsmith-record-body-has-fields`, every body is the bare `sheetsmith-record-body`, and `placement: 'summary'` spelled out on every field draws the same `innerHTML` as the key's absence. (`record-set.test.ts`) *That the tree is identical to the pre-feature code's was checked once during the build rather than stored: the three configs, closed and open, rendered by the base commit's `recordSet` and by this one gave byte-identical `innerHTML` (78,407 bytes each). A stored snapshot was not taken, because the repository has no snapshot convention and one would fail on every later legitimate markup change to the component.*
- [x] A `placement: 'body'` field is not in the record's `.sheetsmith-record-fields`. It is in `.sheetsmith-record-body-fields`, which is the body's first child, in declared order among the body fields, and the body carries `sheetsmith-record-body-has-fields`. (`record-set.test.ts`)
- [x] Body fields are in the DOM while their record is closed, inside the body that carries `hidden="until-found"`. (`record-set.test.ts`)
- [x] **Same control, same commit.** For `number` (both ceiling modes), `toggle`, `level` (cycle and select) and `modifier`, the body control has the summary control's classes and `aria-label`, and an edit through it produces the same delta and the same note bytes as the same edit made with the field on the summary line. (`record-set.test.ts`)
- [x] The strip holds one heading per *summary* field. `sheetsmith-record-set-fields-N` and `--sheetsmith-record-fields` carry the summary count. With every field in the body and `fieldHeadings: true`, there is no strip, no headed class and no custom property. (`record-set.test.ts`)
- [x] A summary line whose every field is in the body renders the same tree as the same record under `fields: []`. (`record-set.test.ts`)
- [x] A `computed` field declared after a body field resolves by its declared index (`fields.<i>.formula`), in both placements, and a `computed` body field resolves while its record is closed. (`record-set.test.ts`)
- [x] `count`/`sum` over the list reach body fields; `empty`, `full` and `formula` resets write body `number` and `toggle` fields as they write summary ones; a `modifier` body field on a closed record pushes. (`record-set.test.ts`)
- [x] Every body field draws a visible `.sheetsmith-card-abbreviation` name, and for all five types that text is contained in the control's accessible name (Label in Name). (`record-set.test.ts`)
- [x] A body toggle has no `title`, and a body named level's `title` is its level's word alone (`nameOnScreen: true`). Summary rings are unchanged. (`record-set.test.ts`)
- [x] An unreadable fence draws no body block. A record with no prose draws the block and the empty body field with its placeholder. (`record-set.test.ts`)
- [x] An unknown `placement` value draws on the summary line, raises no configuration error and round-trips. `secondary: true` and `hideHeading: true` still change nothing. (`record-set.test.ts`)
- [x] The block has no `role`, no `aria-hidden` and no button of its own other than the fields' controls. (`record-set.test.ts`)
- [x] The checkbox is offered where `columnOptions.placement` is `true` and on no Table column. Ticking it writes `placement: 'body'`, unticking deletes the key, and an untouched `'summary'` is preserved. (`list-fields` tests)
- [x] `BODY_PLACEMENT` is the only spelling of the id: the component and the editor both import it, and neither compares or writes a placement literal. The registry contract passes. (`contract.test.ts`, `isolation.test.ts` where the allowlist needs it)
- [x] A layout with `placement: 'body'` round-trips byte-identically, and the default is never written. (layout parse/serialise test)
- [x] Every strip-block rule that names `.sheetsmith-record-field` is scoped under `.sheetsmith-record-summary`, and the `-has-fields` row rules exist only under that class. (`styles.test.ts`)

### Held by looking (`npm run harness:shot`, then `/design-review`)

The harness's `traits` fixture (headed, seven columns, records 1 and 2 open) gains
two body fields: `Recharge`, a `level` with `input: 'select'` and levels `None`,
`Short rest` and `Long rest`; and `DC`, a `number` named `Save DC`. **Ring of
Protection** (open) holds both. **Torch of Revealing** (open) holds neither.
**Second Wind** (closed) holds `Recharge: 1`. `spells` stays as the unheaded
control. The palette's **Features** entry is not changed (see **Deliberately not
doing**).

- [x] **The strip does not move.** `traits` still has five headings, over the same five fields, aligned as `docs/features/record-set-heading-strip.md` measured: the body fields added no track.
- [x] **A closed record is unchanged.** Second Wind's summary line is pixel-identical to the previous shot, with no mark for the body field it holds.
- [x] **The block reads as the head of the body.** On Ring of Protection, `Recharge` and `Save DC` sit above the prose, each beside its own name, the first name's text starting under the record name's text, with one `--size-2-2` step and no rule before the prose. On Torch, the empty select and the `—` placeholder are legible as empty.
- [x] **Narrow.** `sheet-list-narrow` (520px) and `sheet-narrow` (380px): the pairs wrap whole, nothing clips or overflows, and a summary line with fewer fields stacks no earlier than before.
- [x] **Both themes and large text** (`text=24`): names legible, pairs wrap whole.
- [x] **The editor.** `editor-record-fields`: the checkbox sits last on each field's detail line, reads **Inside the opened record**, and the `fields` description carries the guard sentence.
- [ ] **Find-in-page, measured and recorded** (see **Find-in-page**): the four searches in Chrome and in Obsidian, with the results written into this section and into SPEC §4.2's disclosure bullet. **Not met at landing, and moved to Deliberately not doing:** headless Chrome cannot drive the find bar, so the searches were not taken. Both places record it as not yet measured, and the box stays unticked until someone runs them by hand.
- [x] `npm run lint`, `npm test` and `npm run build` pass, and `styles.css` matches `src/styles/`.

**Not photographed, and recorded rather than claimed:** `prefers-contrast: more`
and forced colours, which the headless harness cannot render. The block adds no
border and borrows the field clothes, so it inherits their handling.

### The throwaway vault fixture

The vault is outside the repository, so its recipe lives here (`AGENTS.md`). The
vault is `~/Developer/sheetsmith-test-vault/`.

**`Sheetsmith layouts/Record variations.sheetsmith`** gains:

- On `features` (four columns wide, headed, five summary fields): a sixth field,
  `Recharge`, a `level` with levels `None`, `Short rest` and `Long rest`,
  `input: 'select'` and `placement: 'body'`. This is the mixed case, and the strip
  still names five.
- A new Record set, `spell_cards` ("Spell cards"), at column 1, row 15, six columns
  wide and three rows tall, `fieldHeadings: true`, with every field in the body:
  `Level` (number, `max: 9`), `Concentration` (toggle) and `Ritual` (toggle). This is
  the N = 0 case: a headed list with nothing to head.
- `items`, `spells`, `group_records`, `tab_records` and `bare_list` are unchanged
  controls.

**`Characters/Records.md`** gains `Recharge:` entries on two `## Features` records
(one `1`, one `2`), and an `## Spell cards` section of four records: three with
prose and one with none, and one whose `Level` differs in digit count.

Press:

- Open and close a `features` record, and confirm the strip does not move.
- Change `Recharge` in an open record, close it, reopen it, and confirm the value
  held.
- Press a Short rest reset, then open the record it changed.
- Resize the pane across `features`' threshold.
- On `spell_cards`, confirm no strip at any width, then open the record with no
  prose.
- Tick and untick **Inside the opened record** in the layout editor, and watch the
  sheet redraw. Confirm `Records.md`'s bytes do not change, using the file's
  modified time or a diff.
- Run the four find-in-page searches above with every record closed.
- **By hand, for the owner:** Tab from a closed record's delete glyph (it must land
  on the next chevron), then open the record and Tab from the delete glyph into the
  body's first field.

## Commit boundaries

These are a plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. `feat: Let a Record set field sit in the opened record`. The placement vocabulary
   in `column-types.ts`, `RecordField.placement`, the partition by declared index,
   the body block through the one `drawField`, `nameOnScreen` for a body ring, the
   strip and stamps on the summary count, the `-has-fields` rows and the summary
   scoping in `src/styles/sheet.css`, the regenerated `styles.css`, and the
   component, contract, round-trip and `styles.test.ts` tests. A hand-edited layout
   can use it from here.
2. `feat: Offer a field's placement in the layout editor`. `ColumnOptionsSpec.placement`,
   the checkbox and `checkField`'s value parameter in `list-fields.ts`,
   `placement: true` in Record set's `columnOptions`, the amended `fields`
   description, and the editor tests.
3. `test: Photograph a Record set field in the opened record`. `harness/samples.ts`
   (`Recharge` and `DC` on `traits`, and the three records' values), and any
   `SHEET_FRAME` figures the shots need.
4. `docs: Record where a Record set field may draw`. The find-in-page measurement
   in SPEC §4.2's disclosure bullet; `docs/UI.md` §6 (a body ring's name is on
   screen at every width, so it answers `true`) and §9 (the summary-line row gains
   the body block; the secondary-text row gains a body field's name); and this
   document's status. SPEC §13 and §4.2's config and sheet-view text are already in
   the tree from the spec session and land in this commit.

## Deliberately not doing

- **A field shown only for some values of another field** (conditional
  visibility). A separate question; not designed here.
- **Placement that follows record state.** Recorded open in §13 and not built.
- **A set-level activation constraint on a Record set.** The existing §13 bullet,
  untouched.
- **Honouring `hideHeading` or `secondary`.** Both stay declared, ignored and
  round-tripped; `secondary` is not repurposed (§13).
- **A count, mark or "N more fields" hint on a closed record.** Settled: nothing.
- **A disclosure of the body block's own**, a heading over it, or a rule under it.
- **A player-side choice of placement.** The author decides, as in every surveyed
  TTRPG tool.
- **A component-level list of summary keys, or several views.** Settled: per-field.
- **Changing the palette's Features or Spellbook entry.** A palette entry is what
  every new layout starts from, and which of its fields belong in the body is a
  system's call. The harness fixture carries the demonstration.
- **Placement on a Table column.** Table has no body; `columnOptions.placement` is
  opt-in and Table does not ask for it.
- **Making an `<input>` value findable** where the engine does not find it. It is
  to be measured and recorded, not worked around.
- **Measuring find-in-page in the build.** Headless Chrome cannot drive the find
  bar, so the four searches under **Find-in-page** were not taken and are left to
  be done by hand in Chrome and in Obsidian. The look criterion that asked for them
  is unticked and says so.
- **The two by-hand Tab presses** in the vault fixture's press list, which were not
  done at landing. What a closed body does to the focus order is the platform's
  documented `until-found` behaviour, not an observation.
- **The `.sheetsmith-record-fields:empty` fix.** Measured at 2px below a 320px list
  (**What stays on the summary line**) and deferred, since it would change the
  `fields: []` case this feature did not otherwise touch.
- **Spacing a body number's name nearer its own value** than the control before
  it. A design review measured the name about equidistant from the two; accepted
  as it is, since the name, its control and the gap to the next pair are the
  summary line's own `.sheetsmith-record-field` geometry.
- **Keeping the editor's detail line to what a type needs.** The **Inside the
  opened record** checkbox adds a detail row to every `toggle` and `modifier`
  field, which had none; accepted as it is, because the checkbox is about the field
  as a whole and is offered on every type the list holds.
- **Every other `docs/BACKLOG.md` row**, including the six-field wrap row and the
  unheaded 320px rule's subject.
