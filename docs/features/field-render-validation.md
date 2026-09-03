# A stored value is validated at render, not only at the keystroke that changes it

Status: shipped
Board card: `docs/UI.md` §12's row, "A value the file already holds is never marked
as wrong" — every inline error in the editor fires from a `change` handler, so a
layout arriving with a value its component refuses draws a field that looks
perfectly normal beside a card rendered entirely as an error. The fix is to run
each list field's own rule over its stored value as it renders and seed
`context.errors` from it, which is the same rule in the same place rather than a
second copy of it.

## Model question

None. This changes when an existing editor-side rule runs (also at render, not
only on `change`) and what message it composes when it does; it adds no config
field, no stored key, and no component-contract member, and touches no file this
plugin's model questions are about. `docs/SPEC.md` §13 is untouched.

## What it does

Three list-shaped fields in `editor/list-fields.ts` — a Table's rows, a Table's
columns, and the two-column entries list a Card set, a Card and a Track's rows
share — draw an inline error under a control the moment the pane renders it, if
the value the layout already holds is one the rule refuses, exactly as if the
author had just typed it and had it rejected. Opening a hand-edited layout no
longer requires touching a field before its own problem is visible: a row
labelled twice, a row key with a space in it, a column key two columns share, a
level column short a name, all show their message on first paint. Nothing is
written to the layout by this — no `persist()`, no mutation — the fields only
read what is already there and mark it.

## Design

### The eight rules, and what each one needs

Every `showFieldError` call site in `list-fields.ts` lives inside a `change`
listener today. Read against the file, there are eight — three in the rows
editor, four in the columns editor, one in the entries editor — and every one of
them already has everything it needs to run again at render, because the render
function that draws the control already holds the sibling list the rule checks
against; nothing new is threaded in.

| # | Field, token | Rule | Needs |
| - | --- | --- | --- |
| 1 | Row value name, `${prefix}-value-${name}` | `isName(name)` | Itself only. A duplicate can't reach this field: `names` is built by `!names.includes(name)`, so the array holding it is already deduplicated by construction — the rule's duplicate branch is a typing-time-only case that can never fire against a stored value. |
| 2 | Row label, `${prefix}-row-${index}-label` | Non-empty, and unique among `rows[].label` | The `rows` array (siblings) |
| 3 | Row key ("Publishes as"), `${prefix}-row-${index}-key` | Empty is valid; else `isName(key)` and unique among `rows[].key` | `rows` |
| 4 | Column key, `${prefix}-col-${index}-key` | Non-empty, and unique case-insensitively among `columns[].key` | `columns` |
| 5 | Level names, `${prefix}-col-${key}-levels` | Empty is valid; else ≥2 parsed names and every one has a name before its colon | Itself only |
| 6 | Levels (max), `${prefix}-col-${key}-max` | Empty is valid; else a whole number, 1 to `MAX_LEVELS` | Itself only |
| 7 | Number min/max, `${prefix}-col-${key}-min`/`-max` | Empty is valid; else a real number | Itself only |
| 8 | Entries primary field, `attr-${prefix}-${index}-key` | Non-empty, and unique among `list[]` via `nameOf` | `list` |

Nothing else in these three functions is validated at all — the row-value
expression cells, a column's heading text, its type and `maxSource` selects,
every boolean `checkField` flag, and the entries list's secondary/count/sense
fields commit freely today and stay that way; this feature does not add rules,
only runs the ones that exist earlier.

Rules 5, 6 and 7 are self-contained and their existing messages carry no mention
of a previous value — `'At least two names, starting with the one for none.'`,
`'Whole number, 1 to 8.'`, `'This field needs a number.'` — so these three are
reused **verbatim**, unchanged, called once per render instead of only from
`change`.

### The other five need their message split in two

Rules 1–4 and 8 word their refusal as a revert: *"…, so it was left as
`"${old}"`."* That clause describes an edit that just happened — the author
typed something, it was rejected, and the field was put back. Nothing is being
put back at render; the stored value simply **is** what it is. Reusing the
revert sentence verbatim against a stored value produces a message that
describes an edit that never occurred (worst case, the entries editor's own
`next === stored` at render would read "'Foo' is already used by another entry,
so this one was left as 'Foo'" — true and circular).

So each of these five splits into a **reason** — the bare statement of what is
wrong, with no clause about where the value came from — and a **revert
clause**, added only by the `change` listener when it is actually reverting a
rejected keystroke. The `change` listener's behaviour and wording are
unchanged; the render-time call uses the reason alone:

| Field | Reason (render-time message) |
| --- | --- |
| Row value name | `A row value needs a name a formula can read — letters, digits and underscores, not starting with a digit.` |
| Row label (empty) | `A row name is required.` |
| Row label (duplicate) | `"${row.label}" is already used by another row.` |
| Row key (not a name) | `A row key is a name a formula reads — letters, digits and underscores, not starting with a digit.` |
| Row key (duplicate) | `"${row.key}" is already the key of the row "${taken.label}".` |
| Column key (empty) | `A key is required.` |
| Column key (duplicate) | `"${column.key}" is already used by another column.` |
| Entries primary (empty) | `A ${primary.heading.toLowerCase()} is required.` |
| Entries primary (duplicate) | `"${next}" is already used by another entry.` |

The entries editor's `refuse()` closure already special-cases `stored === ''`
to drop the revert clause — built for the one place a refusal can land on
nothing to describe. That branch is the model for the other four: extracting
the reason is removing the revert clause that special-case already knows how
to omit, not inventing a new judgement.

Exact wording above is illustrative and may be adjusted for tone during
implementation; the rule each reason states and the field it attaches to are
not.

### Where the call goes

Each render function already iterates its rows once to draw them
(`rows.forEach`, `columns.forEach`, `list.forEach`) and the header pass over
`names`. The seeding call is one line dropped into that same pass, right after
the input's `.value` is set and it is attached to the DOM (so
`showFieldError`'s `input.parentElement` lookup succeeds): call the same
reason-producing check the `change` listener uses, and call
`fieldError(input, reasonOrNull)` with the result — `null` when the current
value passes, exactly as a successful commit already clears the field today.
No new data reaches these functions: `context.errors` is already `ListContext`'s
and every sibling list the checks need is already a local in scope.

Two rows or two columns sharing an offending value **both** show the message,
where the `change`-time version could only ever mark the one field being
typed into. This is a direct, correct consequence of validating each field
independently against its current siblings on every render, not a
inconsistency to paper over: there is no one "original" side to leave clean
when both are read from the file at once, and correcting either one clears
both on the next redraw, since each is re-validated afresh.

### `restoreFieldErrors` and this are two mechanisms, not one, and neither changes the other

`layout-editor.ts`'s `render()` already calls `this.panel.render(...)` — where
this fix lives — **before** `this.restoreFieldErrors(container)`. That order is
already exactly right and needs no change:

- The render-time check above is unconditional and stateless: every render, it
  recomputes each of the eight rules fresh against whatever the layout
  currently holds and calls `fieldError` either way, `null` included. By the
  time `panel.render()` returns, `context.errors` already holds the complete,
  correct set of messages for every list field on screen.
- `restoreFieldErrors` keeps its existing job, unchanged: replay whatever the
  map still holds onto a matching token, for whichever field drew one. Run
  after the render-time check, it finds the map already accurate for every
  list-field token — reapplying the same message to the same input it was
  just shown on, which is a harmless no-op — and it remains the only thing
  putting an error back for every field **outside** this feature's three
  functions: `config-panel.ts`'s own label, position, layout column count and
  generic `kind: 'number'` config fields, none of which validate at render
  after this change and all of which still rely purely on the replay.

So `layout-editor.ts` needs no code change. The backlog row names it because
it is the seam this fix depends on — the render order that makes seeding
safe — not because anything in it is wrong.

### A field that validates clean is indistinguishable from one never touched

Because the check is unconditional on every render, "clean" and "untouched"
collapse into the same state: no `sheetsmith-input-invalid` class, no message
element, no entry in `context.errors`. There is nothing to track beyond what
`fieldError(input, null)` already does on every other successful commit in the
pane today — no new flag for "checked and passed" versus "never checked."

### Side effect on `docs/PATTERNS.md`'s open question, and where it stops

That file's row on `editor/field-error.ts` / `editor/config-panel.ts` — "A
refused edit's complaint outlives the text it was about" — names this exact
fix as what it is "waiting on," because a reverted field validating clean at
render clears its own message on the next unrelated redraw. **That happens
here, for the eight rules above, because they now run again on every render
including the one after an unrelated redraw.** It does not happen for
`config-panel.ts`'s own three field groups — the component label, the four
position numbers, the layout's column count, and the generic per-`configFields`
number/text fields at the bottom of `renderComponentForm` — none of which are
`list-fields.ts` functions and none of which this feature touches. The
PATTERNS.md row should be updated to say its question is resolved for
`list-fields.ts` and still open for `config-panel.ts`'s own fields, rather than
closed outright.

### What this does not fix, named rather than silently left

**The backlog quote's third example — "a totalled column key with a space in
it" — is not caught by this feature.** The column key field's own rule (row 4
above) checks only non-empty and case-insensitive uniqueness; it has no
`isName` branch at all, typed or stored. The check that refuses a totalled
column whose key is not a formula name lives only in
`components/table.ts`'s `baseConfigError` (`column.total === true &&
!isName(key)`), which is the whole-config rule the sheet's card runs, not a
single field's own rule in the editor. "Run each list field's own rule" has
nothing to reuse here — inventing one would be adding a rule, not running an
existing one, so it is left alone. The result: a totalled column whose key is
`"item total"` still renders a normal-looking Key field in the editor beside a
broken card on the sheet, exactly as before this feature. Worth a fresh
`docs/UI.md` §12 row of its own — the column key field never checks `isName`
against `total`, on either the typed path or this one — rather than treated as
closed by this pass.

**`modifier-definitions-field.ts` and `reset-field.ts` share the identical
gap and are out of scope.** Both call `showFieldError` into the same kind of
`errors: Map<string, string>` from inside a `change` listener only:
`modifier-definitions-field.ts`'s modifier name (non-empty, unique among
`layout.modifiers`, the same shape as rule 2/8 above) and `reset-field.ts`'s
three call sites (a duplicate trigger binding, a formula-reset's required
expression, and a buffer-toggle guard — two of the three don't even pass the
errors map, so they don't survive a rebuild at all today). Neither file is
named in the backlog row's "Where" (`editor/list-fields.ts`,
`editor/layout-editor.ts` only), and both are a small enough repeat of the same
shape that fixing them here would be answering a row that was not raised.
Recorded as the same family of gap rather than silently left unlisted.

**`function-library-field.ts` does not share this gap and needs no change.**
`renderFunctionLibrary` calls `showProblems(layout.functions ?? [])`
unconditionally at the end of its own render, before any `change` fires —
already validating the stored value on every render, first paint included. It
uses a different mechanism entirely (`aria-invalid` and a `toggleClass` set
directly from `parseFunctions`'s own problem list, not `context.errors` or
`showFieldError`), immune to the "outlives its text" bug by the same
construction this feature gives the eight rules above: it re-derives its
state from the model on every render rather than remembering a past verdict.
This is confirmation the row's own fix is the right shape, applied here to a
field that already had it.

## Config fields

None. No `configFields` entry, stored key, or component-contract member is
added or changed.

## Data and file model

Unchanged. Every check reads `record`/`columns`/`rows`/`list`/`layout` values
already in memory and writes only to the DOM (`sheetsmith-input-invalid`,
a `.sheetsmith-field-error` div) and to `context.errors`, a runtime map that is
never serialised. No call to `persist()` is added, so Constraint 3
(parse-then-serialise is byte-identical) is untouched by construction — nothing
here can cause a layout to be rewritten on open. Constraint 4 does not apply:
no character note is read or written by any of this.

## Acceptance criteria

- [x] Rendering `renderRowsEditor` over a `rows` array containing a row whose
      `label` is `''` shows "A row name is required." under that row's name
      field with no `change` event fired.
- [x] Rendering it over two rows sharing a `label` shows the duplicate message
      under **both** rows' name fields.
- [x] Rendering it over a row whose `key` fails `isName` (e.g. contains a
      space) shows the not-a-name message under that row's "Publishes as"
      field.
- [x] Rendering it over two rows sharing a `key` shows the duplicate-key
      message under both.
- [x] Rendering it over a row value name (header input) that fails `isName`
      shows the message under that header field.
- [x] Rendering `renderColumnsEditor` over two columns sharing a `key`
      (case-insensitively) shows the duplicate message under both columns'
      Key fields; over a column with `key: ''` shows the required message.
- [x] Rendering it over a `level` column whose `levels` holds one name, or
      whose `levels` includes an entry with no name before its colon, shows
      the corresponding message under **Level names**.
- [x] Rendering it over a `level` column with no `levels` and a `max` outside
      1–`MAX_LEVELS` shows the message under **Levels**.
- [x] Rendering it over a `number` column whose stored `min` or `max` is not a
      finite number shows "This field needs a number." under the relevant
      field.
- [x] Rendering `renderEntriesEditor` over an entries list with a blank
      primary field, or two entries sharing the same primary value, shows the
      corresponding message under the affected entry or entries (both, for
      the duplicate case).
- [x] None of the above calls `context.persist()` or `context.redraw()` —
      asserted directly against the `Recorded` counters the existing test file
      already tracks.
- [x] A field refused while typing, then left uncorrected through an
      unrelated redraw elsewhere in the pane, shows no error after that
      redraw once its stored (reverted, valid) value is what render-time
      validation now checks — closing `docs/PATTERNS.md`'s open question for
      `list-fields.ts`'s fields specifically.
- [x] `docs/UI.md` §12's row is closed, and two narrower rows take its place:
      one naming `modifier-definitions-field.ts` and `reset-field.ts` as
      sharing the same gap, unfixed; one naming the column key field's
      missing `isName`-when-`total` rule.
- [x] `docs/PATTERNS.md`'s `field-error.ts`/`config-panel.ts` row is reworded
      to record that its question is resolved for `list-fields.ts` and open
      for `config-panel.ts`'s own fields.
- [x] `npm test`, `npm run lint` and `npm run build` all pass.

## Commit boundaries

1. `fix: Validate a rows list's stored values as it renders them` —
   `renderRowsEditor`'s three rules (row value name, row label, row key)
   split into reason and revert clause, and the reason called during the
   render pass over `rows` and `names`; tests in `list-fields.test.ts`.
2. `fix: Validate a columns list's stored values as it renders them` — the
   same treatment for `renderColumnsEditor`'s four rules (column key, level
   names, levels max, number min/max); tests.
3. `fix: Validate an entries list's stored values as it renders them` — the
   same for `renderEntriesEditor`'s one rule; tests.
4. `docs: Close the stored-value backlog row and record what is left` —
   update `docs/UI.md` §12 and `docs/PATTERNS.md`'s `field-error.ts` row per
   the acceptance criteria above.

## Deliberately not doing

- **Not adding an `isName`-when-`total` rule to the column key field.** It
  would close the backlog quote's third example fully, but there is no
  existing per-field rule to run — writing one is inventing, not running.
  Left as a new, narrower backlog row.
- **Not touching `modifier-definitions-field.ts` or `reset-field.ts`.** Same
  gap, same shape, not named in the backlog row's "Where." Recorded rather
  than silently carried forward unlisted.
- **Not touching `function-library-field.ts`.** It already validates its
  stored value unconditionally at render; there is nothing to fix.
- **Not changing `showFieldError`'s signature or `field-error.ts`'s policy
  header.** The fix is entirely about when the existing rules run and how
  their message is composed, not about the shared helper's contract.
- **Not resolving `docs/PATTERNS.md`'s open question for `config-panel.ts`'s
  own fields** (label, position, layout column count, generic config
  fields). Those are not `list-fields.ts` functions and are outside this
  backlog row's "Where."
