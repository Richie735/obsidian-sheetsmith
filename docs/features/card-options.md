# Options on a Card, and the Field that folded into them

Status: shipped
Board card: Build the Field component — labelled text, number or dropdown, a single
fenced value.

One deliverable and one withdrawal. **Card gains `options`**, and declaring any is
what makes its value a dropdown; **Field leaves the catalog**, because everything
else it carried a Card already had. The catalog does not grow.

## Model question

Settled before any of the design below was written, and recorded in `docs/SPEC.md`
— §2's new **Option** term, §4.2's amended Card entry and withdrawn Field entry,
§5's clause on what a name is worth, §12's build order, and §13's `Resolved:` entry
with two new open questions beside it. Repeated here in short, because a build
session reads this file and not that one.

**Field does not exist.** §12 scheduled it as "a simpler single-value card", and
that turned out to be the literal answer rather than a description. A labelled text
or number value is a Card with its note hidden *today*, with no new code:
`card.ts` already carries `hideLabel`, `hideValue`, `hideNote`, a configurable
storage `key`, `derived` and `signed`. Asked the entrance question in the form §12
puts it — name in one sentence what Field has that a Card does not — nothing
survived the sentence. So the fold, and the one thing Field carried that Card
lacked is one config field.

**Why this is not an `input` field.** The obvious shape is the one §4.2's Field
entry already had: one component with `input` taking `text`, `number` or `select`.
It is refused, and the prior art is what refuses it. Not one of three independent
catalogs ships a single field entry with an input-type setting — Custom System
Builder has Text field, Number field, Drop-down list, Radio buttons and Checkbox as
five entries of seventeen; Sandbox System Builder has Simple Text, Simple Numeric,
List, Radio Buttons and Checkbox as five property types of ten; Meta Bind names
twenty-one input field types. The counter-shape is Notion, which is a database
rather than a sheet builder.

**That objection is answered by not adding `input`.** What those catalogs split
*over* is configuration that diverges: Custom System Builder's own text and number
fields share `key` and `label` and then part company over allowed characters and
maximum length against decimals, bounds, relative modification, increment buttons
and a slider mode. A Card has none of those on either side. Text against number
needs no setting here and never did — §4.2's arrow rule already steps a value that
is a number and moves the caret in a value that is not, so the kind is a property
of what is stored. What is left is the choice, and a choice needs a list rather
than a mode: **a card with options is a dropdown and a card without is a field**,
so there is nothing for an `input` key to say that `options` does not already say
by being there or not.

That is the flag Track's rule applied to a control rather than to storage
(`palette-entries-and-flags.md`, question 1): the thing follows from what the
layout declared, and a flag beside it saying the same thing again would be an
authored fact disagreeing with an authored fact. `input: 'select'` beside an empty
list has no reading, and `input: 'text'` beside a declared list has none either.

**What it publishes** is what a Card already publishes: its stored value, under the
bare id and under `<id>.value`, which are the same thing on a card with no
`derived`. What `scopeValues` publishes does not change — see the one line it
gains, below. **What it stores** is that value, in
the fence, under the same `key`, so Constraint 3 holds by `write` being untouched.
**What happens to existing notes** is nothing, in both directions: a card that
gains options keeps whatever text it held and shows it, and a note holding a value
an author later removed from the list keeps it too (Constraint 4).

## The seven questions

### 1. Does Field exist as a component at all?

**No.** Above. What remains to state is the shape of the fold and the one entry it
earns.

Card gains **one** config field, `options`, an ordered list of `{ value, label? }`.
Everything else about the component is untouched: the same `read`, the same
`write`, the same `scopeValues`, the same card face, the same note line, the same
`derived`, the same `key`. §4.2's Field entry is withdrawn, and §12's remaining
list goes from four variations to three.

**Field does not become a palette entry either**, and that is a decision rather
than an omission. §4.2's rule is that an entry earns its place "where a job an
author would go looking for is one component's configuration away, and the name of
the component that does it would not lead them to it". *Field* fails the second
half twice over: it is a category rather than a job — the exact defect that made
"Abilities" wrong and then "Stat group" wrong — and Card, whose own description is
"one named value on a single card", is precisely where somebody wanting a labelled
Name or Race would land. An entry that only saves typing is a worse menu line for
no gain.

**Dropdown does earn one**, on the same rule read the other way: nobody wanting a
dropdown looks for a component called Card. It is Checkbox's argument exactly —
one field away, and the component's name does not lead there.

### 2. What does a chosen option store?

**Its declared `value`.** Not its label, and not an index into the list.

Four tools converge on the first, which is this project's bar for load-bearing:
Custom System Builder's drop-down takes "one key and one Label per row" and says
outright that "you can only reference the value of the key in formulas, it's not
possible to do so with the Label"; Meta Bind writes `option(bad)` to store the
display text and `option(1, bad)` to store `1` and show "bad"; Roll20 stores an
option's `value` attribute and never its text, read by a sheet worker as
`eventInfo.newValue`; Notion gives an option both an `id` and a `name`, and its API
states that "the name and color of an existing option cannot be updated".

The index is the strategy nobody in the set uses, and it is the one already in this
codebase — `table.ts:1649` renders a `<select>` over a `level` column's named levels
and stores an index, which `table.test.ts:766` drives as `{ cells: { Training: '2' } }`
for the third named level. Question 3 is why both are right.

**What makes the value-and-label split load-bearing here is local rather than
borrowed.** The expression language has no string literals, refused deliberately
with the aggregate (§13: adding quote handling to the grammar so one argument could
be quoted is "a larger and more permanent tax"). So `race == Elf` reads `Elf` as a
name and fails as an unknown one, and there is no other spelling. A dropdown whose
stored values are words therefore publishes something no formula can compare, add
to, or branch on. The split is what lets an author put the arithmetic *in* the
value — `2` labelled "Expertise" — which is exactly what users asked the closest
analogue for in issue #423: "there is no option in the Dropdown to add a value for
each of the options in the Dropdown", wanting a training level worth +2, +4, +6 or
+10 against armour class. `coerceValue` turns a stored `2` into the number 2
already, so `Training * prof` works on a card exactly as it works in a cell, with
no new code in `src/formula/`.

The cost is the other half of the same fact, and it is issue #312 in the same
tracker — "I want to show the dropdown list label (not key) in item container ...
but only show key. Is it possible to show the label?" — which is structural there
and structural here. **A label is display and is unreachable from a formula.** §5
now says so rather than leaving it to be found. `label` defaults to `value`, so a
list of plain words is the ordinary case and the split is paid for only where it
buys something.

**The five edits, one line each.** These are the answer to "what does a note hold
after…", and none of them writes a note:

| The author… | A note holding `2` then… |
| --- | --- |
| renames a label | holds `2`. Every card shows the new word. Renaming is free, and forty Custom System Builder issues matching "dropdown" contain no rename complaint at all, which is that split working. |
| renames a value | holds `2`. The card shows `2` as a stray choice (below), because a layout edit does not reach into character notes (Constraint 4). |
| reorders the list | holds `2`. The menu reorders; nothing else moves. This is the whole reason the index was refused. |
| adds an option | holds `2`. No default moves, because there is no default. |
| removes that option | holds `2`, shown as a stray choice. Nothing is deleted, and §10 says so. |

**No option is a default, and that is designed against explicitly.** The dropdown's
first line is the card's own `—`, which is not one of the options, and only choosing
an option writes. It is the existing rule that an empty value shows `—`, not a new
one, and it closes the trap this control is best known for: a Roll20 sheet author
added a placeholder option at the top and every existing sheet appeared to reset,
because a select with nothing stored had always been showing its first option and
"players that wanted it leaved the select at that, not touching it and therefore
not creating a corresponding attribute". Nothing was lost, because nothing had ever
been saved — the defect was that the list's *order* was acting as a default.
`column-types.ts` already carries this warning one abstraction up, for the editor's
own type list: "make `number` the editor's first option and every numeric column in
every layout silently becomes a text column."

**A stored value no longer among the options is rendered, not corrected.** This is
the one case in the whole prior art that nothing documents — not Custom System
Builder, not Meta Bind, not Roll20 — so it is decided here rather than copied, and
the nearest rule already written down is what decides it: a stored value outside a
Track's run is rendered rather than fixed (§4.2), for the reason that a layout
change must never destroy a player's data. So the select carries the stored value
as one extra line at the end of the menu, showing it raw, and the card renders it.
Choosing anything else drops the line. Snapping to the first option, or to blank,
would be a layout edit deleting character data.

The match is exact — byte for byte against what `read` returns — and not
case-insensitive. Table's claim rule is case-insensitive because it matches a row
name a human typed into a note; an option's value is layout configuration compared
against a stored value, and forgiving case there would mean two options differing
only in case could both claim one stored value.

**With one normalisation, on the layout's side, which the build found and this
sentence originally denied: a declared value is trimmed.** `readFenced` trims the
values it returns, so a stored value never carries surrounding space — and an
option declaring `" Elf"` could therefore never match one. Worse, it would not
survive its own round trip: choosing it writes `" Elf"`, the note reads back
`"Elf"`, and the next render shows the card's own choice as a value the layout no
longer offers. So the trim is what makes the exact match *possible* rather than an
exception to it, and it is on the half that is configuration: two trimmed strings
are then compared byte for byte, case included. It is also what the duplicate
check compares, so `"Elf"` and `"Elf "` are two options sharing a value and the
card says so. A label is left exactly as authored, being display.

### 3. Is this the same mechanism as a level column's `input: 'select'`?

**Different, and the difference is that a level is ordered and an option is not.**

A `level` column's states are graded: §4.2 already says "the stored value is an
integer either way, so the arithmetic is unchanged: `Training * prof` covers
untrained, proficient, and expertise in one expression". The position *is* the
value there — 2 means twice 1, in the layout's own arithmetic — and the ring grades
its fill by that position so a column can be read as a shape. Reordering such a
list is a redefinition of the grades, which is why storing the index costs nothing.

An option has no position. "Half-elf" is not above "Dwarf". Storing an index would
make every note's meaning depend on display order, so reordering the menu — a pure
presentation edit — would silently rewrite what every character is. That is
finding 8's first trap arriving through the back door, and it is the one thing this
design is most obliged to prevent.

**So the plugin holds two storage strategies for one control, and that is right.**
Finding 3 says every builder holding two dropdowns splits them by *control*, a
dropdown against a radio group, over one storage. This plugin does the opposite:
one control over two storages. The opposite is the better axis, and the argument is
local rather than a preference — a control is a rendering and the file is the thing
that has to survive, so the split that matters is the one the file can see. It is
also the split this catalog already made one level down, where "a `level` column and
a `toggle` are one control with a different number of states" and the two store an
integer and a `yes`.

The boundary states itself, and belongs in the build session's head: **a closed
ordered set whose position is arithmetic is a `level` (or a Track); a closed
unordered set is a card's options.** A layout wanting a graded proficiency on a
standalone card writes numeric values and labels — which works — and gets a menu
rather than a ring, because a card has no column of neighbours to read as a shape.

### 4. Where do options come from?

**A literal list, only.** `options` is a value. It never accepts an expression, and
it is *not* added to `formulaFields`.

The demand is real and was granted in the closest analogue — Custom System Builder
issues #81 (2022) and #271 (2023), thirteen months apart, both asking for a
drop-down's choices to come from a dynamic table's column; #528 (open) asking for a
reusable lookup list feeding several; and the wiki now documenting three sources,
Custom, Dynamic Table and Formula, the last returning an array "e.g. from
`lookup()`". Across systems the same shape: Lancer's mounts follow the frame, a
Blades playbook's friend and rival come from that playbook's own NPC list, a 5e
subclass follows the class.

**It is deferred by a decision already taken, not by this feature's preference.** A
formula source needs an expression that evaluates to a list, and §13's aggregate
entry refused a collection value outright, with the reason specific to this codebase:
a value here has five destinations and one of them is `applyReset` writing it into a
note, so "the guard here is that the type does not exist". A rows source needs a
component reference in a config field, widening what §5 states is "the one position
in the language where that is true" from one argument of one builtin to a config
key. Reopening either is its own feature. It is now an open question in §13 so the
next session does not re-research it.

### 5. Does Table gain a `select` column type?

**Out of scope**, and open in §13 rather than refused, because the model half is
settled by this feature and only the editor's shape is missing.

Everything question 2 answers would carry over unchanged: a select cell would store
the option's `value`, hold no default, render a stray value rather than correcting
it, join `text` in `TOTALLABLE`'s refusals — copper plus silver is a quantity of
nothing, and a set of unordered keys is worse — and join `PUBLISHABLE_TYPES` for
the reason question 6 gives.

What has no home is the options list itself. It is a list inside one row of
`columns[]`, which is a list inside a config field, and `list-fields.ts` renders
records whose cells are scalars. That is an editor feature, it belongs with M4's
canvas, and smuggling it into a component's diff is how a sixth column type ends up
in the tree by accident — `COLUMN_TYPES` is ordered and its own header records that
the order decides the default. Two more things wait with it: finding 8's fourth
trap is specifically a cell defect (#351 has a drop-down working inside a dynamic
table with no per-row default and "when selecting an option for one of the rows it
will often change the selected option in other rows"), and a `level` column already
covers the *graded* cell-level choice, which is the only one the catalog has wanted
so far.

### 6. What does a Field publish, and is a select value publishable at all?

**Exactly what a Card publishes now: its stored value, under the bare id and under
`<id>.value`.** No name is worth anything different, and no name is added. The
function gains exactly one line, and it is not about publication: a card whose
options will not configure publishes nothing at all, for the reason the error
state below gives.

§4.2 refuses publishing a `text` *column*, and the question is whether that
argument reaches here. **It does not, and the reason is that the refusal was never
about text.** Its words are that "the card shows `sword` where the note holds
`[[Sunblade|sword]]`, and a name meaning either is a name meaning both" — a cell
whose display and storage can disagree with nothing to say which the name means. A
Card's plain value cannot disagree with itself at all: the card face draws the
stored string, with none of Table's wikilink layer, which is why Card publishes
free text today and always has.

A dropdown *does* show one thing and store another, so the question is real. It is
answered by the layout having written the mapping down: **the value is the meaning
and the label is its presentation**, and only one of the two was ever a candidate
for a name. That is §5's own rule read from the other side rather than an exception
to it — a bare name gives what the card shows because a `derived` is what the sheet
worked out that a stored number *means*; here the reader is shown a presentation of
a value, and the value is the meaning. Findings 1 and 7 are both this: four tools
publish the key, and what users asked for was arithmetic over the choice.

**`derived` keeps working, and is the other half of finding 7.** A card storing `2`
with `derived: value * 2` shows `+4` over a menu reading "Expertise", which is #423
answered on the card itself rather than only in another component's formula. The
`derived` reads `value` as the stored value, exactly as it does on a free-text card,
and `referencesName` still decides whether an empty value blanks it.

### 7. Does the select belong beside free text?

**Yes, and it already is — which is the strongest single argument for the fold.**

Across game systems the demand is not a bare dropdown. In Blades in the Dark,
heritage, background and vice are each a closed choice plus a written line: "Choose
a vice from the list, and describe it on the line above with the specific details
and the name and location of your vice purveyor", and "when you choose a heritage,
write a detail about your family life on the line above". The detail is where the
content is — "Ore miners, now war refugees" is the heritage, and the listed option
is the bucket.

The component that already holds a value and a note line is Card. So the fold puts
the choice where the line already is, and a Field built beside Card would have
shipped the choice *without* the line and then needed a second component under it
to be usable for three fields of one widely played sheet. `hideNote` turns the line
off for Race and Alignment, where there is nothing to write.

**So the Dropdown palette entry does not prefill `hideNote`**, and that is
deliberate rather than an oversight: the note line on by default is the Blades case
working out of the box, and hiding it is one checkbox for the cards that do not
want it.

## What it does

A Card whose layout declares options renders its value as a dropdown over them
instead of as a field. Each option stores a `value` in the note and shows a
`label`; a formula reads the value, so a choice can carry arithmetic. Nothing is
chosen until the reader chooses it, and a stored value the layout no longer offers
is shown rather than corrected.

Field leaves §4.2. The editor's add menu gains one entry, **Dropdown**, over Card.

## Design

### The control is a native `<select>`, in the card's value slot

There is no custom menu anywhere in this feature. Obsidian's own property editor
uses a native select; `table.ts` already draws one for a `level` column whose
`input` is `select`; and on a phone a native select is the OS picker, which is
better than anything drawn here and free. UI.md §7's "a finger has no hover and no
pixel to aim at" is satisfied by the platform rather than by us.

It is drawn by `card-face.ts` rather than by `card.ts`, in the slot the value field
occupies now. That module's stated job is the face of one card — "Card renders its
lone card through here, Card set one per entry, and Pool takes the derived
formatting" — so the value slot having two possible controls is inside its one
responsibility, and the alternative is the card's value drawn in two files whose
typography would drift on the first change to either. `CardFaceOptions.value` grows
an optional `options` list; absent, it renders the field it renders today, unchanged
to the byte.

### It wears the card's clothes, not the table's

`.sheetsmith-card-select` is a new class, and it deliberately does **not** share one
with `.sheetsmith-table-select`. The two are the same element doing the same job and
they are not the same object on the page: a table cell's select is
`--font-ui-small` in a row of cells, and a card's value is
`--sheetsmith-card-value-size` at `--font-bold`, centred, and drops into a small pill
when a `derived` takes the headline. This is exactly what `.sheetsmith-card-input`
and a table cell's field already are — one gesture (`editable.ts`), two classes, two
sets of clothes — and a native select needs no gesture module at all, so there is
nothing to share but a name that would then have to mean two sizes.

Stated because a reviewer should not report it as a missed reuse. UI.md §9's rule is
against a *lookalike* — a fourth kind of panel beside a row of cards — and two
selects at two sizes in two components is the card and the cell agreeing, not
diverging. The `-select` naming also earns `styles.test.ts`'s scope check,
which had covered `-input` and `-current` and now covers a third spelling — it
was widened here rather than matching for free, and widening it brought
`.sheetsmith-table-select` under a guard it had never been under either.

Under `.sheetsmith-view` per UI.md §2, or Obsidian's `select` rules at (0,1,1) win
and the card's value silently reverts to form-control size.

### The one mark this feature draws: a chevron beside the value

**Written after the build, because the build found the hole rather than the spec
predicting it.** The section above says what the menu is *not* to wear — a table
cell's clothes — and then leaves it in the card's, which turns out to be a control
with nothing at all saying it is one: Obsidian's bare `select` rule is what draws
the box, and stripping it (as the card's chromeless field requires) leaves a piece
of centred bold text. The card's own field is also chromeless, so a dropdown card
and a text card would be indistinguishable until pressed. Something has to say
"menu", and this is the only thing in the feature that is drawn rather than
borrowed, so it is the one that owes an argument.

`.sheetsmith-card-dropdown` on the value slot, with the chevron as a `::after`.
The class and the painter behind it (`renderDropdown`) are named for the control
the reader meets, not for a word of the code's own: *choice* was the first
spelling and it was already taken — the layout editor's add menu calls its own
entries choices (`AddChoice`, `addChoices`, `choice=card:0`), so one word meant
two things across two modules. `-select` stays on the control itself, because
that class names the *element* the way `.sheetsmith-card-input` does, and
`styles.test.ts` scopes it by that naming.
The alternatives, in the order they were tried:

- **Keep Obsidian's dropdown background**, which is free and says "control"
  immediately. Refused: the card's value would become a filled form control sitting
  on a sheet whose every other field is chromeless — the exact thing the look
  criterion below refuses — and `--input-height` clips text at the card's value
  size, so it does not survive contact anyway.
- **Borrow `.dropdown` for the arrow it carries.** Refused on UI.md §9: borrowing
  one of Obsidian's class names buys the name and not the styling, and that arrow
  is a black stroke over a themed ellipse, scoped to a class a sheet is not.
- **A `background-image` data URI.** Refused on UI.md §1: a data URI cannot read
  `currentColor`, so the mark would be a literal colour, which this plugin has
  none of.
- **`mask-image` on the select**, which sounds like it isolates the mark. It masks
  the element's text with it.

So the mark rides on the slot, because a `<select>` can carry no pseudo-element —
and as a **flex sibling rather than an absolute overlay**, so the value and its
chevron centre as a pair and a long label cannot run underneath it. Two borders on
a rotated square, sized in `em` so it follows the card's own type (UI.md §5), and
painted `var(--text-muted)` — **not the `var(--text-faint)` this first shipped
with**, which the design pass measured at 2.12:1 in a light theme and 2.57:1 in a
dark one against `legibility.md` §3's 3:1 for a mark that is the only thing
carrying a state. This mark is exactly that case, by the argument three
paragraphs up, so the faint variable was the wrong one by this feature's own
reasoning. Muted is 6.19:1 and 7.03:1; `prefers-contrast: more` now goes a step
further to `--text-normal` rather than raising faint to what the default already
is. `field-sizing: content` on the select is
part of the same decision: it sizes the box to the *chosen* option rather than the
longest one, which is what keeps the chevron beside the word instead of a menu's
width away from it.

The cost is one class and one rule for one consumer, so it earns no row in UI.md
§9's vocabulary table — that table takes a thing on its third drawing, and a second
component wanting a menu on a card reuses this rather than inventing one.

### What is in the menu, and in what order

1. **`—` first**, with an empty value. It is not one of the options. It is what the
   card already shows for an empty value, so the empty state reads identically
   whether the card is a field or a dropdown, and it is what makes "no option is a
   default" true rather than merely intended. Choosing it clears the value.
2. **The layout's options**, in the order the layout wrote them, each showing its
   `label` or, where it has none, its `value`.
3. **The stray value, only where one exists**: the stored value, shown raw, when it
   matches no option. Last rather than first, so the layout's own list keeps the
   shape the author gave it and the anomaly is not the first thing the eye meets. It
   disappears from the menu as soon as anything else is chosen.

While the stray line is the selection, the select carries a `title` saying the
value is not one of this card's options. `title` and not `aria-label`, per UI.md §6:
the control's visible content is words, so the supplementary explanation adds to the
name rather than replacing it. No status colour and no `?`: `?` is reserved for a
value that is present and did not resolve, and this one resolved fine — it is
exactly what the note says.

**So the explanation is hover-only, and that is accepted rather than missed.**
UI.md §7 rules out a hover-*affordance*, and this is not one: what a reader has to
be able to reach is the stored value, which is on the card in full whatever the
pointer does. The `title` says only *why* it is not among the choices, which is a
gloss on a card whose menu shows the layout's list one press away. A listener gets
it as the control's description; a finger does not, and the three routes out are
all worse. A status colour or a `?` would say the value failed, which is false —
it is exactly what the note holds, and §10 reserves both marks for something else.
A visible note on the card would put layout advice inside a character's data. The
long press that gives touch a route to a level ring's name is the platform's own
gesture on a `<select>`, and taking it would cost the picker. Recorded as a known
cost of the design rather than a gap in it.

### Interaction

A select has no draft, so most of §4.2's card interaction rules have nothing to
act on. They are not being departed from; they are about a field holding a value on
its way to being committed, and there is no such state here.

| Input | What it does |
| --- | --- |
| Choosing an option | Writes, on the `change` event, synchronously — as a `level` column's dropdown already does. The outcome *is* the input, so §12's rule about previewing an outcome before applying it does not engage, and a debounce would only delay the note. |
| Enter, Escape | The platform's, on the open menu. Nothing added: there is no draft for Enter to commit or Escape to abandon. |
| Arrow keys | The select's own. A card's arrow rule steps a *numeric draft in a field*; a menu has no draft, and taking the arrows away would break the platform's only keyboard route through a closed select. |
| A press on the card's padding | Focuses the select **and opens the menu**, as a click already routes to the control nearest it. This row first said the opposite; the measurement below is what reversed it. |

The card keeps one tab stop for its value either way, so nothing about focus
restoration across a rebuild changes.

**Why the padding press opens the menu, having first been written not to.** The
original argument was that opening a menu is a larger outcome than focusing a
field, so a press on the card's edge should stop at focus. It is desktop
reasoning, and it assumed the two controls' targets were comparable. The design
pass measured them at 1400, and they are not: a plain Card gives its field
432x29, while an Alignment card gives its menu 196x29, a Heritage card 73x29, the
same card with nothing stored 28x29, and a card whose `derived` puts the menu in
the pill 16x14. A menu's box is as wide as the chosen option and no wider, which
is the same `field-sizing: content` that keeps the chevron beside its word — the
two are one decision with two faces. None of it grows under a coarse pointer,
while the level ring beside it goes to 36.6x44.6.

So the compensation the design was already leaning on — the card's own press
routing — was handing the reader silence: focus on an `<input>` is the edit
gesture, a caret and a keyboard, and focus on a `<select>` is a ring on a desktop
and nothing observable at all under a finger. That is `docs/UI.md` §7's rule
("hit targets are the card, not the mark") applied to the case it was written
for, and the empty card is both the worst target and the one most likely to be
pressed.

`showPicker()` where the platform has it, `focus()` where it does not, and the
focus happens either way so a dismissed picker leaves the keyboard where the
press aimed it. **The alternative was `width: 100%` on the select**, which the
review offered and which is refused: it buys back the pointer target on a
top-level card only, leaves the pill's 16x14 exactly as it is, does nothing for
touch beyond the control's own box, and pushes the chevron to the card's edge —
paying the one thing that says "menu" for half of one thing that was silent.

`aria-label` is the card's own label, which is the line `.sheetsmith-card-input`
already takes: the control's visible content is a value rather than a name, so the
name has to come from somewhere, and the card's label is on screen where a reader
can see it agree. The live region the card already carries for Escape restores gets
nothing new to say.

### The empty state and the error state

**Empty** is `—` selected, which is the card's existing empty reading and needs no
new rule. A card with options and nothing stored publishes nothing, exactly as an
empty text card does, so a `derived` reading `value` blanks by `referencesName`'s
existing test and a formula elsewhere fails on an unknown name rather than getting
a silent zero.

**Except under a `derived`, where the line is blank — the branch the field already
has, and this first missed it.** `card-face.ts` drops the field's `—` placeholder
when a derived owns the headline, because the dash would be the card's second copy
of the same nothing; the menu was drawing it anyway, so an empty Stealth card
showed `—` in large type and `— ⌄` in the pill under it, with the smaller of the
two identical marks being the control. The empty line stays in the menu, because
it is what clears a value, but its text goes with the placeholder it matches. What
says the pill is still a menu is the chevron, which is what it is for. The cost is
that the open list's first line is blank there rather than an em dash, which is the
same blank the field shows in the same place.

**Error** is a configuration error on that card alone, drawn by the
`.sheetsmith-error` branch `card.ts` already has for a bad `key`, with the rest of
the sheet rendering and editable (§10). Two of them, both about the file rather
than about taste (PATTERNS §7):

- **An option with no `value`.** The value is what the note stores; an option with
  none has nothing to be chosen.
- **Two options sharing a `value`.** A `<select>` holding one value twice cannot
  say which was chosen, so the card could not round-trip its own control.

Both follow `valueKey()`'s shape exactly — a discriminated `{ options } | { error }`
checked with `'error' in`, no throw — and both name the fix rather than the fault.
An option with a blank `label` is not an error: it shows its value, which is the
default and the ordinary case.

**Neither names the card**, and that is a known gap rather than a decision taken
here: the view prefixes a failed `read` with the component's label and cannot
prefix what `render` draws into the cell itself (`docs/UI.md` §12). This feature is
what makes it visible — an options list that will not configure is no reason a note
cannot be *parsed*, so unlike an unusable `key` it never travels the labelled path.
The two fixes that suggest themselves are both refused. Naming the card inside the
message is what §12's row rules out, because the labelled path would then say it
twice the day the view is fixed. Checking the options in `read` would buy the
prefix by claiming the section is unreadable, which is false — the note parses, the
card does not draw — and it is the one thing this feature promised not to touch.

`scopeValues` returns `{}` on either, as it already does for an unusable `key`: a
card that cannot draw its own control must not publish a name the sheet would then
be built on.

### The editor's list field learns to name its own columns

`options` is a two-column ordered list with add, remove and reorder — which is
`renderEntriesEditor`, the field Card set's `entries` already uses. It cannot be
reused as it stands, for one reason: it reads `entry.key` and `entry.name` and
prints "Key" and "Full name" over them, and a card's options are `value` and
`label` (§13 records why the spelling could not just be `key` — a Card already has
a `key`, and one word meaning two things on one component is the defect the card
pair's rename was taken to fix).

So the field learns its two property names, its two headings **and which of the
two holds the word** from the field spec. This is PATTERNS §1's worked example in its original direction — a shared
module is passed `'sheetsmith-pool-step'` rather than naming a pool itself —
applied to a list field that had its first caller's vocabulary compiled in. It is
behaviour-preserving for Card set and gets its own commit for that reason.

**No default, which this said at first and a review corrected.** Defaulting to
Card set's words leaves the shared field still holding one caller's vocabulary,
and picking between two callers' words — a track's rows head that column "Name"
where a set's entries head it "Full name" — is the shared method asking which
caller it is, which is the half of the worked example that is easy to miss. So
all three fields declare their own and the parameter is required: Card set's
`entries` and Track's `rows` gain the key alongside Card's `options`, and
`contract.test.ts` holds every field of those two kinds to declaring it, the way
it already holds a `select` field to a non-empty options list. What stays keyed on
the *kind* rather than on the caller is `withCount` — whether a row carries a
length and a sense — and the empty line's noun.

**The geometry is part of the vocabulary, which a second review caught.** Moving
the words and leaving the track sizes is the same defect one layer down: the
grid was `7em` then the remainder, sized for `STR` beside "Strength", and a
Card's options invert that — the value is the word and the label is usually
blank, which this spec argues is the ordinary case. So "The Dagger Isles" clipped
mid-word next to five empty Label boxes about five times its width. A column
declares `wide` when it holds prose rather than an abbreviation, the list carries
a class saying so, and the stylesheet reads it — the same shape the counted list
already used, and only the first track ever moves, because the second is the
remainder in every shape. Card set's and Track's lists are untouched.

One thing comes free with it and is worth doing in the same pass: those inputs'
`aria-label`s still read **"Attribute key"** and **"Attribute full name"**. §13
records `attributes` being renamed to `entries` because "*attributes* is the D&D
term for STR/DEX/CON and was the 'Abilities' mistake still living inside the config
of the type renamed to fix it" — and this is the same mistake, still live, in the
one place only a screen reader hears it. The labels become the column headings.

### The editor calls it a Dropdown, and the component is what says so

**Added after the build, on the plainest finding of the round: an author picks
Dropdown out of the add menu and the row beneath it says "Card".** The menu and
the list were disagreeing about the thing that had just been created, and the
fold's whole claim — that a dropdown is a Card and the catalog does not grow — is
what put the two words a line apart.

The fix is one word in the editor and none in the file. `configName` is a new
optional contract member (§4.1): *what to call one configuration of this
component, where the type's own name is not the honest answer*. Card answers
"Dropdown" while it holds options and `null` otherwise, and the editor shows it
wherever it would otherwise show the type — the component list and a tab set's
tab list. The add menu keeps the type's name, because there it is naming types
and the prefills already sit under them by name.

**The component answers, not the editor.** Asking `config.options?.length` in
`layout-editor.ts` would be the one thing the contract exists to prevent, and it
is how a registry grows a table of special cases — Track's `count: 1` and Table's
`openRows` would be next, each in a module that must not know those components
exist.

**Derived every time, never stored.** A layout keeps the component an entry
produced and never the entry itself (§13), so the configuration is the only
honest source: clear a card's last option and the editor calls it a Card again,
which is exactly what it then is.

**What this is not** is a second component type. That was weighed and refused
where it was first refused: a Dropdown component would share Card's `read`, its
`write`, its `scopeValues`, its note format and its card face, which is a copy
rather than a component — and it would put a migration in front of every layout
already holding one.

### The palette entry

**Dropdown**, on Card, prefilling two placeholder options. It passes §4.2's
entrance rule on both halves: the job is one field away, and nobody wanting a
dropdown looks for a component called Card — Checkbox's argument exactly. Its
description states the consequence a menu line cannot, and the row it sits on is
`.sheetsmith-add-row` already, so a growing description drops below the controls
rather than moving **Add** (UI.md §9).

Placeholder values and no labels, because words are the ordinary case (Race,
Alignment, Heritage) and an author editing one column beats an author clearing two.
The value/label split is taught by the `options` field's description, which is where
an author configuring it is looking.

## Config fields

One new field on Card, between `key` and `derived`: it changes what the control
*is*, so it reads before the things that decorate it.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `options` | `entries` (columns `value` / `label`, headed **Value** and **Label**) | Options | Turns the value into a dropdown over these choices. The value is what the character note stores and what a formula reads; the label is what the card shows, and an option with no label shows its value. A formula cannot read a label, so a choice worth arithmetic stores the number and shows the word — 2 labelled "Expertise". Nothing is chosen until the reader chooses it, and a stored value you later remove from this list is kept and still shown. |

No other field changes, and no other component gains one. `formulaFields` stays
`['derived']`: `options` is a value and never an expression (question 4).

`hideValue` with a `derived` hides the dropdown, leaving no way to change the
choice. That is the same trade the field already makes for a text value and its
description already carries it ("Show only the derived result"), so it is left
alone rather than grown a special case.

## Data and file model

**The note gains nothing.** A dropdown card's fenced entry holds the chosen
`value`, under the same `key`, in the same section, in the same fence. `## Race` /
`value: Half-elf` is what §3.1 asks a scalar component to look like, and it is
indistinguishable from what a free-text card writes — which is the point:
the layout decides how a value is chosen, and the file records only what was
chosen.

**The layout gains one config block key**, which is what §4.3 promises a component
may do and nothing more.

**Constraint 3** holds by the write path being untouched. `write` still sets one
key from a delta and `writeFenced` still rewrites only a line whose value differs,
so a render that changes nothing writes nothing — including on a card whose stored
value matches no option, which must not be "corrected" into the note on the next
blur. Nothing normalises on write; the stray value is handled entirely on the read
and render side, which is the same discipline the flag Track landed on ("a run's
'what the note holds' is initialised in the run's own spelling, and a press is the
only thing that writes").

**Constraint 4** is engaged twice and answered both times. A layout that *adds*
options to a card already holding free text keeps that text and renders it as the
stray choice, so turning a Name card into a dropdown destroys nothing. A layout
that removes or renames an option leaves every note holding what it held. Neither
direction rewrites a note, and §10's "removing a component from a layout does not
delete character data" is the same promise one level down.

## Acceptance criteria

- [x] A Card with no `options` renders and writes exactly as it does today, and its
      behaviour tests are unchanged. One assertion in `card.test.ts` does move: the
      contract describe enumerates `configFields`, so it names the new key. Nothing
      about what a plain card does changes with it.
- [x] A Card with `options` renders a `<select>` in the value slot, with `—` first
      and one line per option, in the layout's order.
- [x] An option with a `label` shows the label; one without shows its `value`.
- [x] Choosing an option writes its `value` — not its label and not its index — to
      the fenced entry under the card's `key`.
- [x] Choosing `—` clears the stored value.
- [x] A card with nothing stored selects `—`, publishes nothing, and writes nothing
      on render.
- [x] A stored value matching no option is shown as one extra line at the end of the
      menu, selected, with a `title` saying it is not one of the card's options; the
      note is not rewritten. Choosing another option drops the line.
- [x] The match is exact: a stored `elf` against an option `Elf` is a stray value,
      not a match.
- [x] Reordering, adding to, renaming within, and deleting from an options list all
      leave a stored value untouched, driven as four cases over one note.
- [x] A card with numeric option values publishes a number: `Training * prof`
      resolves against a card storing `2`.
- [x] A `derived` on a dropdown card reads the stored value as `value`, recomputes
      on the change, and blanks on an empty value exactly as it does on a text card.
- [x] An option with a blank value, and two options sharing a value, each render a
      configuration error on that card alone, name the fix, and publish nothing.
      An option with a blank label is not an error.
- [x] The select's accessible name is the card's label; the card keeps one tab stop
      for its value.
- [x] Round-trip: a note read and written back with nothing changed is
      byte-identical, on a card whose stored value is an option and on one whose
      stored value is a stray.
- [x] `card-face.ts` renders the existing field when no options are passed, proven
      by Card set's and Pool's card rendering being untouched. Pool's file is
      untouched outright; Card set's gains `entryColumns` on its entries field,
      which is the editor's business and reaches no card.
- [x] The `entries` list field takes its two property names and headings from the
      field spec, with no default of its own; Card set's and Track's lists are
      unchanged, and no input's `aria-label` says "Attribute".
- [x] Card declares a `palette` of one entry, and the contract test holds it to a
      name, a description and a config touching no editor-owned key.
- [x] The add menu lists Dropdown indented under Card, and pressing **Add** writes
      `type: 'card'` with two options, labelled "Dropdown".
- [x] The editor calls a card with options a **Dropdown** wherever it would name
      the type, and a Card again once the last option is cleared. The component
      says so through `configName`; the editor never asks what a Card is.
- [x] `styles.css` and `src/styles/` agree.
- [x] Variations are placed in the throwaway test vault, in a **second** layout and
      character beside Aramil rather than piled onto the playable sheet: a dropdown
      with a note line, one with numeric values feeding a formula, one holding a
      stray value, and one misconfigured. **As first written this was not checkable
      from this repository**, which is public and does not contain the vault, so it
      is split the way `aggregate-over-table-rows.md` split the same criterion:
      - [x] The repository carries the same four variations, through the real
            layout parser, the real registered components and `buildSheetEnv` —
            which is what a reviewer can actually run. `view/worked-examples.test.ts`
            drives the numeric one over one parsed layout and one parsed note
            (`training` storing 2, published as a number, read by another card, and
            publishing nothing at all once the section is gone);
            `components/card.test.ts` drives the note line, the stray value and
            both misconfigurations; and `harness/samples.ts` draws all four.
      - [~] The vault pair itself — `Sheetsmith layouts/Dropdown variations.json`
            and `Characters/Dropdowns.md`, nine components over six sections.
            **Placed and driven through the real pipeline here, not confirmed in
            Obsidian**: every section round-trips byte-identically, `stealth`
            resolves to 16 and both misconfigured cards publish nothing, but that
            was run against files outside this repository, so nothing in the diff
            shows it. Opening the note and pressing the menus is yours, and the
            note's own prose names the four things to look at in order, so the
            check is to read it and press what it points at rather than to guess.

### Look criteria

Read from the harness at both themes and at 1400, 620 and 380, per UI.md §11.

- [x] **A dropdown card beside a plain Card and a Pool.** It reads as the same card
      and the same value, wearing a menu rather than a field — not as a form control
      that landed on a sheet.
- [x] **The chevron**, which is the only thing drawn rather than borrowed and the
      only thing saying this value is a menu. It has to read as a mark on the card
      rather than as a second value competing with the first: quiet enough beside a
      bold headline, still legible inside the `derived` pill at `--font-ui-small`,
      and still beside its word at `Text → 24` where it scales with the type. It
      clears 3:1 in both themes as the mark carrying the control's only state —
      `--text-muted`, 6.19:1 and 7.03:1, after the design pass measured
      `--text-faint` at 2.12:1 and 2.57:1. The `prefers-contrast: more` branch is
      read rather than seen: it only moves the same mark further from the
      background, and **no view renders that block for any component**, which is
      now a `docs/UI.md` §12 row with the reason no shot can — Chrome has no
      command-line switch for it, only the DevTools protocol.
- [x] **A dropdown card with a `derived`.** The choice drops into the small pill
      under the headline number and stays legible there.
- [x] **A long label in a narrow card.** It clips inside the card rather than
      widening it, and the card holds its column. **It does not stay centred**, and
      that was raised as a defect and checked against a field: a plain Card holding
      the identical string renders identically at 380 — flush to the left padding,
      filling the row — and without even an ellipsis, because an input clips where
      a select truncates. Centring only shows where there is slack, so no cap on
      the select's width recovers it (tried, at the slot's width and below it). It
      is what a value longer than its card looks like here, on either control.
- [x] **The empty state.** `—`, at the same weight and position the card's empty
      value already shows — and, on a card with a `derived`, *one* em dash rather
      than two: the headline keeps it and the pill shows the chevron alone, which
      is the branch the field already takes on its placeholder.
- [x] **A stray stored value.** It reads as data rather than as a warning, and it
      is visibly the selection.
- [x] **The error state**, in the harness rather than only in a vault fixture: a
      duplicate-value card draws `.sheetsmith-error` in place, with the sheet around
      it live.
- [x] **Focus.** One focus treatment, the card's, per UI.md §6 — the select must not
      arrive with Obsidian's own focus ring beside the card's. **Photographed
      rather than trusted**: a still cannot press Tab, so the harness gained
      `&focus=<css selector>` and `harness:shot` gained `sheet-focus`, which is the
      first view in this repository to show a focus ring at all. The select takes
      the card's accent ring and nothing else; a focused field in the same sheet
      takes the identical ring on its pill.
- [x] **The Dropdown entry's description on the Add row**, via
      `?surface=settings&choice=card:0`, with the name, the menu, the destination and
      **Add** landing on identical pixels whether a bare type or the entry is
      selected.
- [x] **The options list in the editor**, showing **Value** and **Label** over its
      two columns, beside Card set's list still showing **Key** and **Full name** —
      and the two columns *sized* for what they hold: equal halves here, where a
      Card set keeps its narrow key beside a wide name.

## Commit boundaries

1. `refactor: Let a list field name its own columns`. The field spec's new optional
   key, `renderEntriesEditor` parameterised over its two property names and two
   headings, the declarations on Card set's and Track's own fields that keep both
   identical, the contract rule that requires them, and the stale "Attribute"
   `aria-label`s. First and on its own, because it touches the editor, changes no
   rendered result, and is the one thing here a reviewer should be able to read as a
   rename.

   **It carries one behaviour change, and the message has to say so**: the method
   opened with `if (!Array.isArray(record[key])) record[key] = []`, so *opening* a
   component's form wrote an empty list into the layout file — `entries: []` for a
   Card set that had none, `rows: []` for a Track, and `options: []` for every Card
   once this feature added the field. That is the editor reformatting a file it was
   asked only to show, which is the promise the undo round-trip in
   `layout-editor.test.ts` already held it to and which this feature's new field is
   what finally tripped. The list is now held locally until the first **Add**
   attaches it. It is a fix rather than a rename, it predates this feature on two
   components, and calling the commit purely behaviour-preserving would be false.
2. `feat: Offer a card's value as a choice from a list`. `CardConfig.options`, the
   validator beside `valueKey`, `card-face.ts`'s select and its `CardFaceOptions`
   growth, the `options` config field, the stylesheet's card-select rules and its
   chevron, and Card's `palette` with its Dropdown entry. The `configName`
   contract member belongs here too: it is one member, one implementation and two
   call sites, and splitting it out would leave a commit whose only content is an
   editor asking a question nothing yet answers. Two one-line passengers, named
   because a review asked where they were recorded: `card-face.ts`'s em dash
   becomes one constant, since the field's placeholder and the menu's first line
   are the same mark and the argument for the line is that they agree; and
   `ConfigFieldSpec.visibleWhen`'s doc comment loses its example, which was
   "options only when input is a select" — the shape of the Field entry this
   feature withdraws.
3. `docs: Record that a field is a card with options`. §2's **Option** term, §4.2's
   amended Card entry and withdrawn Field entry, §5's clause on what a name is worth
   where a card shows a label, §12's remaining-variations sentence, §13's `Resolved:`
   entry and its two new open questions, and UI.md §9's vocabulary row.
4. `test: Show a dropdown card in the harness`. The samples: a dropdown with a note
   line, one with a `derived` over numeric values, one holding a stray value, and one
   misconfigured, plus the settings view's `choice=card:0`. The instrument changes
   belong here too and are not this feature's alone: `&focus=` and the `sheet-focus`
   view, which photograph a focus ring for the first time, and the narrow frame
   raised from 1400 to 4200 — it had been cropping two thirds of the one-column
   sheet, so every reading ever taken "at 380" from the default shot had seen the
   top of it only.

## Deliberately not doing

Each of these is separate work, and none is a gap.

- **A Field component.** That is the deliverable, stated as a withdrawal. If a
  reviewer wants one, the sentence to produce is what it has that a Card does not.
- **An `input` config field, on Card or anywhere.** Question 1. Adding one is how
  this feature becomes the shape nothing in the prior art ships.
- **A `select` column type on Table.** Question 5, and now open in §13. It waits on
  an editor field that can hold a list inside a list, not on a decision.
- **Options from a formula, or from another component's rows.** Question 4, and now
  open in §13. Both need something the language deliberately does not have.
- **Radio buttons, or any second control over one options list.** Finding 3 has
  every builder splitting a dropdown from a radio group as two entries; this plugin
  unified `cycle` and `select` on a level column instead, and doing it again here
  would be a second control with no new data behind it. A closed set of three or
  four is what a dropdown is for, and where the *count* is the design — one flag,
  two states — Track already answers it.
- **Options on Card set.** A strip of cards sharing one `derived` is a set of
  numbers by construction, and a dropdown per entry is a table with the columns
  taken away.
- **Publishing an option's label under a second name.** Finding 8's third trap, and
  it stays a trap on purpose: a label is display, §5 says so, and the fix for a
  layout that needs the word in a formula is to make the word the value.
- **Resolving a stored value as a reference to another component.** Custom System
  Builder #386 wants exactly this and reports it half-working; here a stored value is
  a value and the name table is not consulted, which is the same answer §5 gives for
  every other stored string.
- **Any change to `read` or `write`.** The fold is a control and a config key. If
  the diff touches the data path, something in it is wrong. `scopeValues` is the
  one deliberate exception and it is a guard rather than a publication: it returns
  `{}` where the options will not configure, exactly as it already does for an
  unusable `key`, because a card that cannot draw its own control must not publish
  a name the sheet is then built on. What it publishes when the card *is* drawable
  is unchanged to the line.
- **Marking a stray value as an error.** It is what the note says, it resolved, and
  `?` is reserved for something else.
