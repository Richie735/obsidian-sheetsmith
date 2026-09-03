# Conditions palette entry

Status: shipped
Board card: standard Conditions palette entry on Table

One palette entry on Table, named **Conditions**: the home for Rage, Bless,
Shield and the like, which are states a character is *in* rather than things
they carry. One entry with its config prefilled and nothing else. The catalog
does not grow, no column type is added, no contract member is added, and no
other component changes.

`docs/features/reset-on-a-table-column.md` named this feature in its own
"Deliberately not doing" and said it lands after: "an entry prefilling a name
column, a `toggle` and a modifier column is worth having and is not what makes
the trigger reach it." This is that.

## Model question

**None open.** The three §13 questions this touches all carry `Resolved:`
paragraphs already, and nothing here re-opens one.

- **"a palette entry is an optional member on the component definition"** —
  resolved: §4.1 gained `palette`, a list of entries each carrying a name (also
  the label the new component starts with), a description, and a partial config
  the type forbids from touching editor-owned keys. The interim add menu offers
  entries beside types, indented under the type each prefills, with the selected
  entry's description below the row. This entry is one more item on that list.
- **"the five blocks still on the list are three palette entries and two layout
  patterns"** — resolved: the catalog does not grow; a palette entry is one
  component with its config filled in. Conditions passes that same check — a
  toggle beside a modifier column is one Table, not two components.
- **"How a reset trigger reaches a Table"** — resolved: a binding names the
  column it acts on, `ComponentDefinition.resetColumns` and `ResetBinding.column`
  are what the contract grew, and `text` and `modifier` columns are refused as
  reset targets because neither "full" nor "empty" has a reading over words.
  This entry produces exactly one bindable column, and prefills no binding.

The contract does not grow: `palette` already exists and Table already declares
it. It publishes nothing new — a Table with a `toggle` column and a `modifier`
column already publishes rows through `scopeRows` and pushes through
`scopeModifiers`, and this config sets no `total` and no `publish`, so there is
no new name on the sheet. It stores nothing new: a markdown table, on Table's
own round trip, so Constraint 3 is inherited rather than newly claimed.
Constraint 4 does not arise — a layout stores the component an entry produced
and never the entry, so no existing note is read or written by anything here.

### The entrance test, recorded

§4.1's rule: **an entry earns its place where a job an author would go looking
for is one component's configuration away, and the name of the component that
does it would not lead them to it.** Conditions passes both halves. Nobody
looking for a conditions list looks for a component called Table, and a toggle
column beside a modifier column is exactly one configuration — not two
components placed together, which is what disqualified the card-beside-its-skills
pattern. The two registry-enforced rules hold too: every key prefilled here is a
config field Table renders (`rowHeader`, `columns`, `openRows`), and no other
Table entry is called Conditions.

**Why a toggle *and* a modifier column, rather than either alone.** A toggle
alone is a checklist, which Track already does better on a card. A modifier
column alone has no `when` to read, so every row would apply always and turning
a condition off would mean deleting it. The pair is the whole entry: the flag is
addressable, the definition's `when` names it, and the row goes inert without
being removed.

**And why this is not Features under another name**, which is the refusal §4.2
asks an entry to state, the way the Record set entry states it against Feats.
Conditions is one column from Features — `Uses` number plus `Modifiers` on a
Record set against `Active` toggle plus `Modifiers` on a Table — so a reader
will ask. The sentence that separates them is the one that moved Features off
Table in the first place: **a feature's text is a paragraph and a table cell is
one line.** A condition has no body. It is a name, a flag, and what it changes
while the flag is set, all of which fit on a line — so the same sentence that
sent Features to Record set keeps Conditions on Table. Neither prefill would
serve for the other, which is what Feats failed.

## What it does

An author adding a component picks **Conditions** under Table in the add menu
and gets a Table already shaped for states: a `Condition` name column, an
`Active` toggle, a `Modifiers` column, open rows, and no rows declared. They
type the states their system has, or leave the list for the player to fill.

The prefill is what makes the two mechanisms already in the plugin meet: a
modifier definition whose `when` reads `Active` goes inert the moment the row's
flag is switched off, and the `Active` column is the one part of the component a
reset binding may name, so a rest can clear the lot.

## Design

Nothing is drawn that is not already drawn. The entry adds one line to the add
menu — "Conditions", indented under Table beside "Inventory", with its
description shown below the row when it is selected, on `docs/UI.md` §9's rule
for a settings row whose description grows. The component it produces is an
ordinary Table and takes Table's own appearance, gestures, empty state (**Add
row**, since it declares none) and error state (Table's `configError`) without
change. No new gesture, no new vocabulary.

**The prefill**, in Inventory's own terms:

| Key | Value |
| --- | --- |
| `rowHeader` | `Condition` |
| `columns` | `Active` of type `toggle`, then `Modifiers` of type `modifier` with `hideHeading` on |
| `openRows` | `true` |
| `rows` | not set — declared rows are the layout author's to type |

**Name:** `Conditions`.

**Description**, against the other three entries' voice — job and examples
first, then what it does to the note:

> An open list of the states the character is in: raging, blessed, poisoned.
> Each row carries an Active flag beside the Modifiers it applies while that flag
> is set, so a modifier conditioned on Active stops counting the moment the row
> is switched off. A Table storing as ordinary markdown, so a rest can be bound
> to empty the whole Active column at once.

**It names `Active` and `Modifiers`, and that is the difference from the first
draft**, which described the columns without spelling either. Both things an
author does after placing the entry need the exact word — a definition's `when`
reads `Active`, and a reset binding names the `Active` column — and "the whole
column" is ambiguous where the prefill has two columns that are not the name. All
three sibling entries name what they prefill: Currency lists its five
denominations, Spellbook names level and prepared, Inventory names "a quantity
and a weight". The second sentence also joins with "so" rather than "and", which
is Inventory's parallel construction.

Why the pair of columns is the entry, and why this is not Features under another
name, are both in the Model question's entrance-test subsection above.

## Config fields

None. The entry prefills existing Table fields and declares no new ones; the
table above is the prefill, not a new surface. `reset` is excluded from an
entry's config by `PaletteEntry`'s type — a prefilled binding would name a
trigger the layout may not declare — so the author binds `Active` after placing
the entry.

## Data and file model

A markdown table, exactly as Table writes one today. No new fence, no new key,
no reserved spelling. Round-tripping is Table's existing guarantee, and a
`modifier` column already round-trips byte for byte
(`table.test.ts`, "round-trips a modifier column byte for byte"). Existing
character notes are untouched: an entry only ever produces a new component in a
layout the author is editing.

## Acceptance criteria

- [x] `table.palette` carries a second entry named `Conditions`, prefilling
      `rowHeader: 'Condition'`, an `Active` `toggle` column, a `Modifiers`
      `modifier` column with `hideHeading` on, and `openRows: true`, with no
      `rows`.
- [x] `contract.test.ts` passes with `table Conditions` added to its `SWEPT`
      list and no other change — the constant's own comment names that edit as
      the decision being asked for, "a palette entry added or a sample dropped is
      a line somebody edits" — and no palette rule is relaxed. Those rules are
      what assert that every key the entry prefills is a field Table renders and
      that no two Table entries share a name. *(This criterion said "passes
      unchanged" when it was written, which was wrong: five cases in that file
      are keyed to the swept list and go red without the line.)*
- [x] Choosing **Conditions** in the layout editor's add menu writes a component
      of type `table` labelled "Conditions" holding exactly that config, and the
      entry's description is shown below the add row while it is selected.
- [x] `layout-editor.test.ts`'s disambiguation case — the one that finds
      whichever type offers more than one entry — still passes with Table now
      offering two, and is not rewritten to name a type. Confirm it by running
      the suite; which type the `find` lands on is not asserted here.
- [x] **Verification case 1, named in a test:** a definition whose `when` reads
      `Active`, enrolled from a row of a Table built on *this exact prefilled
      config*, applies on a row whose `Active` cell is `yes` and changes nothing
      on a row whose cell is `no` — asserted through `table.scopeModifiers` and
      the sheet's modifier table, not against a hand-written column list. No new
      code is expected; the case is what says so.
- [x] **Verification case 2, named in a test:** `table.resetColumns` over this
      prefilled config returns `Active` and nothing else — `Modifiers` is refused
      as a reset target per §4.2 — and `table.applyReset` with
      `{ action: 'empty', column: 'Active' }` over a note holding rows in mixed
      states writes `no` into every `Active` cell while every `Modifiers` cell
      comes out byte-identical.
- [x] `harness/samples.ts` holds a Conditions table built from the entry's
      config, with at least one row whose `Active` is `yes` carrying a modifier
      conditioned on `Active`, and one whose `Active` is `no` carrying the same,
      so the sheet shows the applied and the inert glyph side by side on one
      component.
- [x] The label collision is resolved: the existing Track checklist sample
      labelled "Conditions" is renamed (its comment with it), because two
      components sharing a label would be two `## Conditions` sections in one
      note.
- [x] With the pane's **Sample values** toggle on, the canvas draws the fresh
      Conditions table as two character-added rows named for `Condition`, with
      alternating `Active` flags and empty `Modifiers` cells — `sample()`
      inventing no modifier is correct and is looked at rather than assumed.
      Captured by the existing `canvas-samples-light` / `canvas-samples-dark`
      shots; no new shot view is added.
- [x] Fresh `npm run harness:shot` output is handed to the findings stop, and
      the add-menu line is looked at live in both themes.
- [x] The throwaway vault's existing Conditions fixture on `DnD 5e Caster` /
      `Aramil.md` — declared rows Blinded / Charmed / Frightened / Poisoned, an
      `Active` toggle bound to **Long rest** with `empty`, a `Uses` number column
      with `max: 3` and a `Notes` column — gains a `Modifiers` modifier column
      between `Uses` and `Notes`, and one row enrolled in a definition carrying
      `when: Active`.

      **Three edits, not one, and the two beyond the column are preconditions
      without which nothing moves at all.** A cell naming a definition the layout
      does not declare is a stray — rendered, carried, changing no number
      (`parse/modifier-cell.ts`) — and a published name accepts a modifier only
      where some formula reads `mod.self` or `mod.<name>`
      (`formula/modifier-targets.ts`), which this layout had nowhere. So:

      1. `conditions.columns` gains `{ "key": "Modifiers", "type": "modifier" }`
         before `Notes`.
      2. The layout gains a `modifiers` array holding one definition —
         `Shield of Faith`, target `armour_class`, amount `2`, `when: "Active"`,
         no bonus type, since this layout declares no `modifierTypes`.
      3. `armour_class`'s `derived` becomes `10 + abilities.DEX + mod.self`. It
         read no modifier before, so without this the definition is declared,
         the glyph says it changes nothing, and the press below shows nothing.

      The enrolled row is **`Shield of Faith`**, a fifth row the character added
      — `| Shield of Faith | yes | 1 | Shield of Faith | +2 while it holds |` —
      chosen so every declared row keeps the bytes it had. It is deliberately
      **not** `Charmed`: the `Charmed` tripwire in
      `docs/features/reset-on-a-table-column.md` still applies — that row is
      declared and the note has never held a line for it, and this script is
      touch-then-press, so touching `Charmed` first would spend the tripwire.

      What to press: switch `Shield of Faith`'s `Active` off and watch **Armour
      class** fall by 2 and its breakdown line drop the modifier; switch it back
      on and watch both return; then press **Long rest** and confirm one write
      empties every `Active` cell the note holds — the enrolled row going inert
      along with the rest, and no `Charmed` line appearing.

      **One thing to look at rather than assume:** the component is 3 of 6
      columns wide and now draws five columns, so `Modifiers` may sit past the
      edge and need the sideways scroll the pinned row name exists for. Left at
      3 wide on purpose, so the fixture stays the one the sibling recipe
      describes; if it is uncomfortable, the fix is the placement or
      `hideHeading` on the column, not the recipe. That column predates the
      entry and is hand-configured, so it is the one `Modifiers` column here
      *without* the hidden heading the shipped prefill now carries — matching it
      to the entry is the obvious move if the scroll bites.
- [x] `npm test`, `npm run lint` and `npm run build` pass, lint at
      `--max-warnings 0`. `src/components/isolation.test.ts` is re-run before
      anything is read into a failure of it (`docs/PATTERNS.md` §11).

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

**What actually landed was five, and the divergence is the two review waves.**
The four below were written before either. In the log: the entry commit carries
the design wave's `hideHeading` and its rewritten description rather than adding
them afterwards, because a history that replays the review records the
back-and-forth instead of the result that was approved; the harness commit
carries the `entryConfig` helper, the Track rename and the comment counts, which
are one thing — showing the entry rendered; and the `effectiveSamples` comment
correction went ahead of it as its own `docs:` commit, because those digits were
already stale before this feature and the fix is not about conditions.

1. `feat: Offer a conditions list beside the inventory`. The `palette` entry on
   `src/components/table.ts` and its description. `sample()`'s comment there
   already says "both palette entries do exactly that" about declaring no rows —
   stale since Features moved to Record set, and true again with this one; leave
   it as it reads rather than editing it in passing.
2. `test: Pin a condition's flag against its modifier and its reset`. The two
   verification cases, both built from the entry's own config.
3. `test: Show a conditions table in the harness`. The sample, the rename of the
   Track checklist sample that frees the label, and its comment.
4. `docs: Record the conditions entry on Table`. §4.2's Table entry gains a
   *Palette* bullet carrying **Conditions** beside **Inventory**, the two
   entrance-test sentences and the clause separating it from Features, and §13
   gains the short paragraph below the five-blocks entry. Both are written out
   below so neither is re-derived at the land stop.

The vault fixture belongs to no boundary, for the reason
`docs/features/reset-on-a-table-column.md` gives: `AGENTS.md` puts the throwaway
vault outside the repository, so what is committed is the recipe above.

### What the §4.2 Palette bullet says

Table has no *Palette* bullet today even though Inventory is registered, so the
bullet is written rather than extended, and it carries both entries:

> - *Palette:* **Inventory** — `rowHeader` "Item", a `Qty` number column and a
>   `Weight` number column with `total` on, no declared rows, `openRows` on.
>   **Conditions** — `rowHeader` "Condition", an `Active` toggle column and a
>   `Modifiers` modifier column with its heading hidden, no declared rows,
>   `openRows` on. The modifier heading is hidden and the flag's is not, which is
>   `docs/UI.md` §9's own sentence applied twice: a modifier cell draws as one
>   glyph, "because a word above it several times its width sets the column's
>   width against a control that needs none of it" — 90px of heading over a 37px
>   control, which on a four-column placement is more than the whole overflow and
>   pushes the row's delete glyph out of the table. `Active` keeps its heading
>   because that word is load-bearing off the card: a definition's `when` names
>   it and so does a reset binding, so an author has to be able to read it off
>   the table they placed. Nobody looking
>   for a conditions list looks for a Table, and a flag beside the changes it
>   makes while set is exactly one configuration. It is not the Features entry
>   under another name: a feature's text is a paragraph and a cell is one line,
>   which is what sent Features to Record set, and a condition has no body to
>   send it after.

### What the §13 paragraph says

Recorded here so it is not re-derived at the land stop. Below the five-blocks
entry, in the voice of the corrections already there: **Conditions is the
catalog's next palette entry and it opens nothing.** It passes §4.2's entrance
test on both halves — nobody looking for a conditions list looks for a Table,
and a toggle beside a modifier column is one configuration — and it is
deliberately narrow. **No reset prefill**: `reset` is an editor-owned key the
entry's type excludes, and a prefilled binding would name a trigger the layout
may not declare. **No declared rows**, and the reason is shape rather than
flavour — a prefill flavoured by one system costs the plugin no neutrality, as
this entry's own prefills paragraph already says of Currency's denominations.
`table.ts`'s `sample()` comment carries the honest reason: "A declared row is
one every character has." No character is permanently Blinded. A condition is a
state entered and left, so declaring one is wrong in kind and not merely wrong
for one system, which is the same fact that makes `openRows` the load-bearing
half of the prefill and the same reason Inventory declares none. **And
the every-row modifier question stays untouched** — what a Table publishes as a
*target* is still unwritten, and a condition's modifier is one definition per
row, so this entry does not need it.

## Deliberately not doing

- **A modifier landing on every row of a Table.** Gated on an unwritten §13
  question about what a Table publishes as a target. This entry does not need
  it: a condition's modifier is one definition per row.
- **Any reset binding prefilled by the entry.** The type forbids it; the author
  binds `Active` to a trigger after placing the entry.
- **Declared default rows.** One system's list, and the layout author's to type.
- **The `link` column type.** Parked in §13, not a type today.
- **A new column type, a new contract member, or a change to any other
  component.** The catalog does not grow.
- **Formula-field autocompletion, inline formula failure marks, and the
  `docs/UI.md` §12 rows on the sheet.** Separate work.
- **A new harness shot view.** The samples canvas and the sheet shots already
  cover the component; the add-menu line is looked at live.
