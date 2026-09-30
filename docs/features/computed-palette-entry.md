# Computed palette entry

Status: shipped
Board card: standard Computed palette entry on Card

One palette entry on Card, named **Computed**: a Card with its value hidden and
a `derived` prefilled, offered in the component picker as a read-only number fed
entirely by a formula. One entry with its config prefilled, plus the name the
editor calls that configuration. The catalog does not grow, no contract member is
added, and no other component changes.

This is the last of the five blocks §13's resolved entry said were three palette
entries and two layout patterns. Currency, Inventory and the Record set entries
have shipped. Computed was the one §4.2 still carried as a component of its own.

## Model question

**None open.** The §13 entry this touches is already resolved: "the five blocks
still on the list are three palette entries and two layout patterns, and the
catalog does not grow". §12 already says what the remaining block is: "Computed
is a value-less card fed entirely by a formula." This feature takes that sentence
at its word.

**§4.2's Computed entry is withdrawn, the way the Field entry was.** Asked in the
form §12's rule and the Field resolution put it: name in one sentence what
Computed has that a Card does not. Its whole entry is *Config:* `label`, `value`,
*Data:* none, *Sheet view:* read-only, *Formula fields:* `value`. Every part of
that is already a Card. The formula is `derived`. Read-only is `hideValue` (the
card then draws no control, so nothing can be edited). And `render` already keeps
a formula that never reads `value` working with nothing stored (`needsValue` in
`card.ts`). Nothing survives the sentence. **Only one clause of the old entry does
not carry over: "hovering reveals the formula".** A Card's `derived` sets a
`title` only while it is unresolved, and then the title holds the reason rather
than the formula. Giving the card that hover is a change to Card's face and is out
of scope here (see Deliberately not doing). The SPEC edit records the clause as
dropped, with that reason, so it does not vanish unnoticed.

**The contract does not grow.** `palette` and `configName` both exist, and Card
declares both already. **It publishes nothing new.** A Card publishes its bare id
from `derived` whenever one is set, and that holds whether the value is shown or
hidden, so `gold_value` is a name the moment the card is placed. **It stores
nothing new** (see Data and file model). Constraint 3 is inherited from Card's
fenced round trip, not newly claimed. **Constraint 4 does not arise.** A layout
stores the component an entry produced and never the entry, so no existing note
is read or written by anything here. Turning an existing Card into a Computed one
by ticking **Hide value** keeps its stored value in the fence, because `write`
preserves entries it did not touch and a hidden value is never offered for
editing. Unticking it shows the value again.

### The entrance test, recorded

§4.2's rule: an entry earns its place where a job an author would go looking for
is one component's configuration away, and the component's own name would not
lead them to it. **Both halves pass.**

The job is one Card, fully configured. The evidence is that this configuration
already exists by hand. The vault's `DnD 5e Standard` layout builds its spell
save DC as a Card with `hideValue`, `hideNote` and `signed: false` over a
`derived`. It builds proficiency, spell attack, armour class, initiative, prepared,
weight carried, carrying capacity and attuned the same way, give or take the
note. Nine components in one layout reached this shape through two Appearance checkboxes and
a formula field.

The name does not lead there. Someone who wants Passive Perception or a spell
save DC wants a number nobody types, and Card's description ("One labelled value
on a card, with an optional derived number and a note line") offers a value to
type. The read-only part sits behind **Hide value** under Appearance, and that
field's own description ("Show only the derived result") only means something
once the author already knows a derived exists. This is Checkbox's argument on
Track, and Dropdown's on Card, a third time.

**The two registry-enforced rules hold.** Every key the entry prefills
(`derived`, `hideValue`, `hideNote`, `signed`) is a config field Card renders, in
form order. No other Card entry is called Computed. **No key is prefilled at its
default.** `hideValue` and `hideNote` default to `false` and `signed` to `true`,
so all three are prefilled against their defaults, and `derived` has no default
at all.

### Names are case-sensitive, and §13's example does not resolve

§13's Currency paragraph spells the weighted sum `coins.gp + coins.sp / 10`. **As
written, that fails.**

- Card set publishes `named[entry.key]` with the key as written in the layout
  (`card-set.ts`, `scopeValues`).
- The sheet registers each name as `${component.id}.${name}` in a plain `Map`
  (`formula/sheet.ts`), and looks names up with `thunks.get(name)`. Nothing along
  that path folds case.
- The Currency entry prefills the keys `CP`, `SP`, `EP`, `GP` and `PP`.

So `coins.gp` is an unknown name and the card reads `?`. The spelling that
resolves is **`coins.GP + coins.SP / 10`**. The only case-insensitive matching
in `src/formula/` is the completion popup's prefix tier (`vocabulary.ts`, "The
exact tier is case-sensitive and the prefix tier is not"). That helps an author
find `GP` by typing `gp`, and it has no effect on what the formula resolves.

The example is **not silently rewritten.** The land stop records it as a
correction in §13's own voice (text below), and one acceptance criterion pins
the lowercase spelling as failing, so the correction stays accurate.

## What it does

An author opens the component picker, types "computed" or "formula", or looks
under Card, and picks **Computed**. They get a card that shows one number and has
nothing to type into: no value field, no note line, and no `+` in front of a
positive number. They replace the placeholder formula with the arithmetic they
want, such as `10 + skills.perception`, `8 + prof + casting`, or
`coins.GP + coins.SP / 10`. The card then shows that result on the sheet and in
the editor preview, and publishes it under its id for the rest of the sheet to
read.

## Smallest version

The `palette` entry on Card, `configName` answering **Computed** for a card whose
value is hidden behind a derived, and the SPEC edits. That alone satisfies the
card. It gives up the harness sample and the named picker shot, so the entry
would be reviewed live only. It also gives up the two worked-example tests, so
the case discrepancy in §13 would be corrected with no test pinning it. Both are
cheap, and they are in the design below.

## Design

**Nothing is drawn that is not already drawn.** The entry adds one line to the
picker, "Computed", indented under Card after "Dropdown". The picker shows the
line's description below it, and its preview draws the entry's own config, as
every entry's does (`component-preview.ts`). The component it produces is an
ordinary Card with its value hidden. The harness already draws that face
("Inspired bonus" in `harness/samples.ts`): the label above one large number,
with no value pill and no note line. No new gesture, no new vocabulary, and no
new CSS.

**The prefill**:

| Key | Value | Why |
| --- | --- | --- |
| `derived` | `0` | See below. |
| `hideValue` | `true` | The whole entry. The card draws no control, so nothing can be edited. |
| `hideNote` | `true` | §4.2's promise was "Data: none", and an open note line is the one control left on the card that writes. It is also a pressable line on a card that otherwise answers nothing, which is the wrong invitation on a read-only number. The vault shows both uses: the spell save DC hides its note, while armour class keeps one for "chain mail, shield". The entry takes the Computed case, and showing the note again is one checkbox. |
| `signed` | `false` | A spell save DC, a passive score or a coin total reads `15`, not `+15`. A signed number is a modifier, and a modifier-shaped card (initiative) is a Card with a value shown, not this entry. |

**Why `0` as the placeholder formula.** It is the one prefill whose choice
matters, and four things constrain it:

1. **It must not read `value`.** With the value hidden, `needsValue` would draw
   `—` for ever and the card would offer no way to type the value. An entry that
   produces a card that can never show a number is the menu line lying. This is
   the same failure Dropdown's comment names for an empty options list.
2. **It must parse and resolve**, so that the fresh card and the picker's preview
   draw a number and not `?`. A `?` on a card nobody has touched reads as broken,
   and it would pre-empt the §13 "?" question this feature leaves open.
3. **It must not name anything.** Any name, such as `prof` or `abilities.WIS`,
   is one system's vocabulary, and on a layout without that name the card reads
   `?`.
4. **It must not be a system constant.** `10` is D&D's passive base and `8` its
   DC base, and a starting point shaped like one system's rule is flavour the
   entry does not need.

`0` is the only candidate that meets all four. It draws as a plain `0` on the
fresh card, which an author reads as "not written yet" and replaces from the
**Derived** field. It is not a default, since `derived` declares none, so the
"no value a field already defaults to" check has nothing to say about it.

**`configName`.** A Card whose value is hidden behind a derived is reported as
**Computed**. **Computed wins over Dropdown when both hold**, because `configName`
names what the configuration *is on the page*. With the value hidden, the menu is
hidden with it ("Hiding the value hides the menu with it, the same trade the
field already makes", `card.ts`), so a card with options and a hidden value draws
no dropdown and is a computed number. Calling it a Dropdown would name a control
the card does not have.

The condition is **exactly `render`'s own `showValue`**, which is
`hideValue !== true || derived === undefined`, negated. Clearing the **Derived**
field deletes the key (`config-panel.ts`, blank commits `delete record[key]`).
That brings the value back on the card, and the name goes back to Card or
Dropdown with it. That is the "derived, never stored" rule §4.1 already states
for Dropdown. `render` and `configName` are two readers of one policy, so the
condition moves into one private function in `card.ts` (named for what it
answers, such as `valueShown(config)`) that both call, not two copies of the
expression (PATTERNS §1). A hidden value over a `derived` that reads `value` is
still called Computed. The card then reads `—`, which is the configuration the
author wrote, and the name is honest about it. A commit that changes what
`configName` answers redraws the pane, so the component row follows; `persist`
alone does not redraw the tree, and a text or checkbox commit otherwise leaves
the row reading the old name (`config-panel.ts`).

**Name:** `Computed`. It is the word §4.2, §12 and §13 already use, the column
type Table already has for the same idea, and one word.

**Description** (78 characters, one sentence, the same voice as Dropdown and
Checkbox, describing what the card looks like and does):

> A read-only number worked out by a formula from values elsewhere on the sheet.

The picker searches names and descriptions only, so "computed", "formula" and
"read-only" find it and "passive" does not. That is §4.2's own rule ("`stress`
finds nothing"): "passive" is one system's word.

**Empty state.** On a fresh card, `0`. On a formula whose names have no data
yet, such as a Coins section that does not exist, the card shows whatever the
formula resolves to under §5's existing rules, which for a name with nothing
stored is `?`. That state is §13's open question "Whether a derived sheet owes a
reader anything better than "?" before there is data", and it stays open. **Error
state.** Card's own. An unparseable or failing `derived` draws the unresolved `?`
with its reason in the `title` (`card-face.ts`, `setDerived`). A bad `key` or
bad options draws `configError`, on this card alone. Nothing new.

## Config fields

None. The entry prefills existing Card fields and declares no new ones, and the
table above is the prefill, not a new surface.

## Data and file model

**A Computed card whose `derived` never reads `value`, with its note hidden,
writes nothing, ever. The note holds no section for it.** This follows from three
existing rules, not from anything new:

- With `hideValue` in effect and `hideNote` on, `render` draws no control, so
  `onChange` is never called.
- Card's `read` of a missing section is `{ ok: true, data: null }`, "an editable
  empty card, not an error".
- `parse/character.ts`: "A section is created by content, never by an empty
  write."

So §4.2's "Data: none" is kept, with the Card being `storage: 'fenced'` rather
than `none`. **The difference from §4.2's promise matters in one direction
only.** `fenced` means the section *may* exist. It does, where a hand-edited note
holds one, or where the author turns the note line back on and a player writes in
it. Then `read` reads it, `write` preserves every entry it did not touch, and the
round trip is Card's. `storage: 'none'` would be wrong: §4.1 reserves `none` for a
container, which "has no section, so nothing reads it and nothing writes it". A
Computed card whose note an author later shows must be able to store that note.

**Promotion (§9) still works.** A promoted `gold_value` is plugin-owned output in
the frontmatter, not a section, so writing nothing to the body is unaffected by
it.

**One sample-side consequence, accepted.** Card's `sample` writes a value under
the key unless the config fails `valueKey` or `optionList`, and it does not
consult `hideValue`. So the canvas preview reads a Computed card's section as
`value: <n>` that the card never draws. It changes nothing the card shows, since
the prefill's `derived` reads no `value`, and it keeps `card Computed` off the
contract's `EMPTY` list. Teaching `sample` to skip a hidden value is recorded
under Deliberately not doing.

## Acceptance criteria

- [x] `card.palette` carries a second entry, after Dropdown, named `Computed`,
      with the description above, prefilling exactly
      `{ derived: '0', hideValue: true, hideNote: true, signed: false }` in that
      key order.
- [x] `card.configName` returns `'Computed'` for a config with `hideValue: true`
      and a `derived`. It returns `'Dropdown'` for one with options and the value
      shown, and `null` for a plain card. **Computed wins** for a config with
      options, `hideValue: true` and a `derived`. A config with `hideValue: true`
      and no `derived` is not Computed, since the card then shows its value.
      Each is a named case in `card.test.ts`'s palette describe block.
- [x] `render` and `configName` read one shared private predicate for "the value
      is shown", not two copies of `hideValue !== true || derived === undefined`.
- [x] `contract.test.ts` passes with `'card Computed'` added to `SWEPT` after
      `'card Dropdown'`, and no other change. No palette rule is relaxed.
      `EMPTY` is unchanged, because the Computed sample still writes a value
      (Data and file model).
- [x] `card.test.ts`'s `'offers a dropdown, because nobody looks for one under Card'`
      is updated to expect `['Dropdown', 'Computed']`, and its name is amended to
      say both.
- [x] In `layout-editor.test.ts`: choosing `card:1` and pressing **Add** writes a
      component of type `card` labelled "Computed" holding exactly the prefill.
      The component list's row then reads "Computed". Clearing that card's
      **Derived** field makes the row read "Card" again. The existing
      disambiguation case, which finds whichever type offers more than one entry,
      still passes without being rewritten to name a type. Confirm it by running
      the suite. Card is now such a type, and which type `find` lands on is not
      asserted.
- [x] **The acceptance case, on the sheet, named in `view/worked-examples.test.ts`:**
      a layout holding a Card set with id `coins` built from the Currency entry's
      config, and a Card with id `gold_value` built from the Computed entry's
      config with `derived` set to `coins.GP + coins.SP / 10`, over a note whose
      Coins section holds `GP: 12` and `SP: 35`. The card resolves to `15.5`,
      and the note holds no `## Gold value` section, before or after the sheet
      is built. Both configs come from `paletteEntries`, not retyped.
- [x] **The case discrepancy, pinned in the same file:** the same layout with the
      derived spelled `coins.gp + coins.sp / 10` does not resolve. The card is
      unresolved and its explanation names `coins.gp` as unknown. This is what
      keeps the §13 correction true.
- [x] **The acceptance case, in the editor preview, named in `editor/canvas.test.ts`'s
      "the canvas filled with sample values" block:** the same two components
      drawn with samples on show a Gold value card whose number equals the
      drawn GP plus the drawn SP / 10. Read the two numbers off the Currency
      strip rather than hardcoding them, since sample numbers are seeded.
- [x] `harness/samples.ts` holds a Computed card built with
      `entryConfig('card', 'Computed')`, labelled "Gold value", beside the
      existing `currency` sample (row 16, cols 6–7, which are free), with
      `derived` `currency.GP + currency.SP / 10`. Against that sample's
      `GP: 7`, `SP: 18` it reads `8.8` on `sheet-light` and `sheet-dark`, and it
      reads the equivalent over sampled values on `canvas-samples-light` and
      `canvas-samples-dark`. The comment above the currency sample, which counts
      "Two of the three palette prefills", is corrected to count this one.
- [x] `harness/shot.mjs` gains one view, `picker-computed`, copying
      `picker-entry` with `pickerActive=card:1`. It shows the Computed line
      active, its description, and a preview of a label over a single `0`. It is
      looked at in the findings stop together with the add-menu line live in
      both themes.
- [~] **The vault fixture.** `Characters/Cards.md` names `sheet-layout: Card variations`,
      and **`Sheetsmith layouts/Card variations.sheetsmith` is not in the vault**:
      the note currently opens on "layout not found". **The owner's decision is to
      rebuild it**, since Cards.md still points at it and so it was meant to exist.
      The build session rebuilds it with the two groups the note's preamble
      describes, `Dropdown & select` and `Prefill`. Each group's components are
      reconstructed from the note's own `##` sections and prose, so every section
      Cards.md holds is claimed again. It then adds a third top-level `group`,
      `Computed`, holding:
      1. a Card set `coins` from the Currency entry;
      2. `gold_value`, the Computed entry with `coins.GP + coins.SP / 10`;
      3. `gold_wrong_case`, the same with `coins.gp + coins.sp / 10`, to see the
         `?` and its reason in the app;
      4. `computed_with_note`, the Computed entry with `hideNote` off, to see the
         one route by which it writes;
      5. `computed_dropdown`, a Card with two options, `hideValue` on and a
         `derived`, whose row in the editor must read Computed.

      `Cards.md` gains a `## Coins` fence holding `GP: 12` and `SP: 35`, and a
      `### Computed` intro in its preamble (never a `##`, per the fixture's own
      convention). **What to press:** change GP to 13 and watch Gold value go
      from 15.5 to 16.5. Confirm the note gained no `## Gold value` section.
      Type in `computed_with_note`'s note line and confirm a section appears
      holding only `note:`. Open the layout in the editor and confirm the row
      names for 2, 4 and 5. Once rebuilt, the layout goes through `parseLayout`
      and Cards.md through a byte-identical `parseCharacter` /
      `serialiseCharacter` round trip. The note is also opened in the app to
      confirm it no longer reports "layout not found".
      **Rebuilt and driven through the real pipeline, not opened in Obsidian.**
      The layout parses, the note round-trips byte-identically, every section is
      claimed, and the sheet resolves 15.5, `?` naming `coins.gp`, and the
      Computed row names — but the build session could not open the app on the
      throwaway vault, so the in-app check and the presses above are the
      owner's.
- [x] `npm test`, `npm run lint` (at `--max-warnings 0`) and `npm run build` pass.
      `src/components/isolation.test.ts` is re-run before anything is read into a
      failure of it (PATTERNS §11).

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. `feat: Offer a computed card beside the dropdown`. The `palette` entry and its
   comment in `card.ts`, the shared "value shown" predicate, `configName`
   answering Computed with its comment extended, the `config-panel.ts` redraw
   when a commit changes the component's name, the `card.test.ts` palette and
   `configName` cases, the `SWEPT` line, and the `layout-editor.test.ts` cases,
   including the **Derived** and **Hide value** routes that make the row follow
   and the file-scope `rowName` the Dropdown cases now share.
2. `test: Pin a computed card reading the coin purse`. The two worked-example
   cases, including the lowercase one, and the canvas preview case, with
   `src/test/palette-entry.ts`, the one throwing lookup of an entry's prefill,
   whose first importers they are.
3. `test: Show a computed card in the harness`. The Gold value sample, the
   corrected sample comment, the `picker-computed` shot view, and the
   harness's move onto the shared `entryConfig`, dropping its own copy.
4. `docs: Record the computed entry on Card`. The SPEC edits below, written out
   so none of them is re-derived at the land stop.

The vault fixture belongs to no boundary. `AGENTS.md` puts the throwaway vault
outside the repository, so what is committed is the recipe above.

### The SPEC edits

**§4.1, `configName`.** After "A Card with options is a Dropdown, and an author
who chose Dropdown out of the add menu should not be told a line later that they
have a Card." add:

> A Card whose value is hidden behind a derived is a Computed, and Computed wins
> where both hold, since a hidden value hides the menu with it and the name is for
> what the card is on the page.

**§4.2, Card.** Replace the *Palette* bullet with:

> - *Palette:* **Dropdown**, two placeholder options. **Computed**, `derived`
>   `0`, `hideValue` and `hideNote` on, `signed` off. The formula is `0` because
>   it is the one placeholder that reads no `value` (a hidden value that a
>   formula reads draws `—` for ever), resolves on any layout, and names no
>   system's rule.

After the paragraph beginning "**A card with options is a dropdown, and there is
no setting that says so.**" add:

> **A card whose value is hidden is a Computed, and that is where the Computed
> entry went.** §4.2 used to carry Computed as a component of its own: config
> `label` and `value`, no data, read-only, with its formula revealed on hover.
> Every part of that is a Card. The formula is `derived`. Read-only is
> `hideValue`, which leaves the card no control. And a derived that never reads
> `value` resolves with nothing stored, so a note holds no section for it until
> something writes one. It stays `fenced` rather than `none` because `none` is a
> container's, and a Computed card whose note line is turned back on has to be
> able to store it. One clause did not carry over: a Card's derived carries a
> `title` only while it fails, and then the title is the reason rather than the
> formula. Revealing the formula on hover is dropped, not promised.

**§4.2, the Computed entry** (*Config:* `label`, `value` … *Formula fields:*
`value`) is **deleted**, as the Field entry was. The paragraph above is its
withdrawal.

**§12.** After "Computed is a value-less card fed entirely by a formula." append:

> It turned out to be exactly that sentence: a Card with its value hidden,
> offered as a palette entry rather than built (§4.2, §13).

**§13**, below the Conditions paragraph, in the voice of the corrections already
there:

> **Computed is the last of the five and it is a Card.** A value-less card fed
> entirely by a formula was already a Card with `hideValue` over a `derived`.
> The vault's 5e sheet had built nine by hand, so the block is a palette entry
> on Card and §4.2's Computed entry is withdrawn. That makes the tally three
> components' palette entries and two layout patterns, as this entry said, with
> the Record set correction above changing which component two of them sit on.
>
> **One sentence of this entry's Currency paragraph was wrong and is corrected
> here rather than edited away.** It spelled the weighted sum
> `coins.gp + coins.sp / 10`. Published names are case-sensitive. A Card set
> publishes each entry under its key as the layout wrote it, and the sheet's
> name table does not fold case, while the Currency entry prefills `GP` and
> `SP`. So that expression fails as an unknown name, and the one that works is
> `coins.GP + coins.SP / 10`. The formula field's completion matches a prefix
> without regard to case, which is how an author typing `gp` is offered `GP`.
> The formula itself never does.

## Deliberately not doing

- **A separate Computed component type.** The model question above is the
  argument.
- **Any change to Card's formula evaluation, `needsValue`, `toDerived` or
  `formatComputed`.** A non-integer such as `15.5` prints as the engine returns
  it.
- **Revealing a Computed card's formula on hover: a §4.2 promise, withdrawn.**
  The old Computed entry's *Sheet view* promised "read-only, hovering reveals the
  formula". A Card's face titles only a failure: its derived carries a `title`
  only while unresolved, and then the title holds the reason, not the formula.
  Keeping the promise would change Card's face (and Card set's, which shares
  it). So the loss is recorded in the §4.2 withdrawal paragraph, not silently
  lost and not promised for later.
- **A hidden value over a formula that reads `value`.** Such a card draws `—`
  for ever with no way to type the value, and the editor still names it
  Computed (the owner confirmed this). The trap is Card's existing `hideValue`
  behaviour, not this entry's, and the prefilled `0` avoids it. It stays out of
  scope.
- **Teaching Card's `sample` to skip a hidden value.** It is harmless for this
  entry, and it would change what the canvas previews for every existing
  hidden-value card.
- **Rewording Card's **Derived** or **Hide value** descriptions** to suit a
  Computed card ("computed from the stored value" reads oddly on one). A copy
  change on shared fields, and the owner's call if the picker review asks for it.
- **Table's `select` column.**
- **§13's "?" before there is data.** It stays open. A Computed card over an
  empty Coins section shows what §5 already makes it show.
- **A starter layout edit.** The starters' hand-built computed cards stay as
  they are. An entry is a starting point, not a migration.
