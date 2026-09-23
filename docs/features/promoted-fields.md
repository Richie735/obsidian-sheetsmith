# Promoted fields

Status: shipped
Board card: `docs/SPEC.md` §9 — "A layout may mark specific fields to be mirrored into the character's frontmatter, making them queryable by Bases and Dataview." Optional, off by default.

## Model question

Yes, and §13 carries no bullet for it — writing one is part of this spec, because
the question was asked and settled in conversation before this document existed.
The draft entry is at the bottom of this section, for `/land-it` to place.

The question has two halves, and the owner settled both at the model-question
stop. What follows records the arguments, because a spec that only asserted the
answers would leave the next reader re-deriving them from §10, which reads as
forbidding the first half.

### Part 1 — who owns a promoted key once it is in the note

**The sheet wins, silently.** The promoted key is plugin-owned output, written
under a key the layout author names. A write guarded on an actual change
overwrites a divergence on the next render. There is no staleness indicator, no
conflict prompt and no new sheet surface.

**Why that is consistent with §10 rather than a violation of it.** §10's promises
are about *character data* — the section, the value the user typed into a card,
the row they added. A promoted key is none of those. It is a **copy the layout
asked for**, derived on every render from data that lives in the body, and the
body is where the user's own value stays untouched. Read the other way round: if
the promoted key were character data, then every write this feature makes would
be the plugin overwriting the user's data on every render, which is plainly not what §9
is asking for. So the key is output, and output is owned by whatever produces it.
The line worth remembering is that **removing the promoted key from a note loses
nothing**, which is the test that separates the two categories: deleting a
section loses a value nothing else holds, and deleting a promoted key loses a
value the next render reproduces.

**The cost, accepted with eyes open and written down here because it is the one
thing a user will report as a bug.** A *stored* value — current HP, a character's
name — promoted and then edited in the note's properties panel **looks like it
took**: the panel accepts the edit, the note on disk holds it, `metadataCache`
re-parses it, and a Base refreshes to the new number. The next time that
character's sheet renders, the sheet's own value is written back over it. Under
this answer that is the design, not the write-back race being a bug. The
properties panel is not an input for this plugin's values; the card is. The field
description says so in the words a user will read before they try it.

**Why the question could not be avoided.** Four surveyed tools of four that
compute a value make the computed value read-only wherever it lands — Airtable
refuses the write outright ("Cannot modify a computed field"), Notion excludes
formula and rollup properties from every editable operation, Foundry's
`prepareDerivedData` never writes to the database and its own docs warn that
`update()` on a derived value "will likely cause an infinite loop, as `update()`
will re-trigger `prepareData()`", and Roll20's auto-calc hands a sheet worker the
formula string rather than the number. None of the four resolves a conflict
because none of the four permits one. **A frontmatter key cannot be made
read-only**, so the mechanism every precedent uses to avoid the question is
unavailable and the question has to be answered.

### Part 2 — which values may be promoted

**Any published name, derived or stored alike, including the `.value` and `.left`
forms.** This came from §5 rather than from the research, and the argument is that
"stored only" is not a restriction this vocabulary is able to state.

§5's rule is that **a bare name gives what the card shows, not what the note
stores**: `abilities.DEX` is the +6 in large type, not the 22 behind it. So every
bare published name is already the derived reading wherever the component computes
anything, and "promote only stored values" would have to mean "only `.value`
names". That is worse than a restriction, because §5 also says a computed Table
column publishes nothing under `.value` at all — "a formula reading it fails as an
unknown name" — so the rule would exclude a character level that is a sum over
classes, a max HP, an AC, and every Track's `.left`, which is the whole list the
feature exists for. **The case the design has to survive is that the value a party
table wants is usually derived**: current HP is stored and nobody tabulates it
alone, max HP and AC are formulas, and D&D 5e's own rule that "your levels in all
your classes are added together to determine your character level" means a Fighter
3/Wizard 2 has no stored 5 anywhere in the note.

So the promotable set is exactly the published-name set, taken from the one
assembly that already answers "what does this layout publish"
(`formula/modifier-targets.ts` `publishedEntries`), plus the two suffix forms an
entry answers to. Nothing new is published, and no name resolves differently
because it is promoted.

### What the author-named key decides, and what it retires

The deciding mechanism is that **the frontmatter key is named by the layout
author and never derived by the plugin**. It collapses three separate failure
modes into one decision the author makes knowingly:

- **The vault-global property-type collision becomes the author's**, because they
  typed the key. Obsidian's own help states the rule — "Once a property type is
  assigned to a property name, all properties with that name across your vault
  will use the same type" — and the plugin never invents `level` in somebody's
  vault on the strength of a component label.
- **The flattening problem disappears.** Nothing derives a key from
  `slots.L1.count`, so no dot separator has to be chosen and no nesting has to be
  attempted. Obsidian has no object property type at all — the supported list is
  Text, List, Number, Checkbox, Date, Date & time and Tags, and the help's own
  *Not supported* line reads "Nested properties: To view nested properties, we
  recommend using the source mode" — with the multi-level-YAML request open since
  27 July 2023 across roughly two hundred posts and no official reply. A derived
  key was the trap in both directions: nesting has no type, and a flat key
  literally named `sheet.level` reads to a query layer as nested access.
  **Neither claim is load-bearing here and the dotted-key one was deliberately
  not verified**, because the mechanism removed the need to answer it — an author
  who types a dotted key gets a dotted key, and the field description cautions
  against one rather than the plugin refusing a character YAML allows.
- **A Track's projection is chosen by which name is promoted**, `.left` against
  the bare name, so the plugin never picks a projection. Blades trauma promoted as
  a filled count or as a remainder is the author's choice expressed as a name, and
  it needs no new config anywhere.

### §3.2 stays as written: the list lives in the layout, not on the component

The research is convergent the other way — three tools of three make exposure an
opt-in flag on the field's own configuration rather than a list maintained
elsewhere (Foundry's Custom Fields module adds a "Set as Resource" checkbox to a
field; Metadata Menu's auto-update is per-field; `CONFIG.Actor.trackableAttributes`
is the same idea in code) — and §3.2 says the layout file holds "the promoted
field list". **§3.2 wins, and is not amended**, on four grounds, the first of
which is decisive on its own:

1. **A per-component flag cannot carry an author-named key.** There is nowhere on
   a Card set to put the frontmatter name for `abilities.DEX` without inventing a
   per-entry field for it, and the author-named key is the mechanism the whole
   answer rests on. A shape that cannot express the deciding decision is
   disqualified before taste comes into it.
2. **The promotable set spans suffixes no component declares.** `.left` is
   `formula/sheet.ts`'s construction and `.value` is universal
   (`docs/features/name-depth.md`), so a flag on a Track row could not say
   "promote the remainder" without Track growing a second field that duplicates a
   suffix the formula language already spells.
3. **The precedent does not transfer, because in all three tools the exposed
   thing is the field itself under its own name.** Foundry exposes that field at
   its own path; Metadata Menu recomputes the field in place. Neither has a second
   namespace to land in, so neither has a key to name. Here the destination is a
   different namespace with a vault-global type, which makes the decision one
   about the *destination* — and a decision about a destination belongs with the
   destination's list rather than distributed over its sources.
4. **The list is the answer to a question no checkbox can answer**: "what does
   this layout put into my vault's property namespace?" A central list answers it
   by being read; a set of per-component flags answers it only by walking the
   whole layout.

What does survive from the one precedent that persists a computed value into
user-visible storage — Metadata Menu, which writes into frontmatter, keeps the
value there without Dataview, makes auto-update a per-field choice, and documents
that it "can slow down obsidian if you have many of those fields and a lot of
files" — is **the per-field opt-in and the named performance cost**. Its staleness
surface (a file marked stale in a warning colour, plus one command to refresh
everything) does not: the owner chose against a staleness indicator, and
"the sheet wins" is what makes one unnecessary.

### The remaining model answers: contract, publication, storage, existing notes

- **The component contract does not grow.** No member is added to
  `ComponentDefinition`, no component learns that it is promoted, and no component
  touches a file (PATTERNS §5). The write is the view's, exactly as the modifier
  promote path is.
- **It publishes nothing.** No new name enters the formula language, and a
  promoted name resolves exactly as it did before it was promoted.
- **What it stores, and Constraint 3.** One frontmatter line per promoted field,
  written by a byte-faithful writer of our own (below) that carries every other
  byte of the note through untouched — the precedent being `withLayoutName`, which
  already rewrites the one `sheet-layout` line and nothing else. Constraint 3
  holds in the form it is stated: **a note where nothing changed round-trips byte
  for byte**, because a write that would emit the line the note already holds is
  not made. A note where a promoted value genuinely changed has exactly one line
  different, which is the line whose change was the point.
- **What happens to existing character notes, and Constraint 4.** Nothing, until
  the author promotes something. No section is read, written, moved or removed by
  this feature at any point; a promoted key is only ever added, rewritten or
  removed, and a note carrying a promoted key from a layout that no longer
  promotes it keeps the key, inert, exactly as §10 keeps an unmapped section.

### The §13 entry to place at land time

Not written into `docs/SPEC.md` here — `/land-it` places both halves, because
nothing is resolved until it is built. This is the text.

> - **Who owns a promoted key once it is in a note, and which values may be
>   promoted at all.** §9 promises the mirror and says nothing about the
>   direction, which leaves two questions the feature cannot be built without.
>   The first is a genuine conflict: a frontmatter key is editable by the
>   properties panel, by a Markdown pane, by another plugin and by Sync, and §10
>   promises the user owns their data, so a plugin writing over an edit somebody
>   just made needs an argument rather than a mechanism. Every surveyed tool that
>   computes a value avoids the question by making the computed value read-only
>   wherever it lands, and a frontmatter key cannot be made read-only. The second
>   is narrower and sharper: §5's rule that a bare name gives what the card shows
>   means most published names are already derived readings, so "promote stored
>   values only" cannot be stated in this vocabulary without excluding a
>   multiclass character level, a max HP and an AC — which is the whole list §9's
>   own party table is about.
>
> Resolved: **the sheet wins, silently, and any published name may be promoted.**
>
> **The promoted key is plugin-owned output, and that is a reading of §10 rather
> than an exception to it.** §10's promises are about character data — the
> section, the value the user typed, the row they added — and a promoted key is a
> copy the layout asked for, reproduced from the body on every render. The test
> that separates the two is that removing a promoted key from a note loses
> nothing, where removing a section loses a value nothing else holds. So a write
> guarded on an actual change overwrites a divergence on the next render, with no
> staleness indicator and no new sheet surface. **The cost is accepted and
> recorded rather than mitigated**: a stored value promoted and then edited in the
> properties panel looks like it took — the panel accepts it and `metadataCache`
> re-parses it — and the next render puts the sheet's value back.
>
> **Ownership settles what an absent value means, and it means two different
> things.** Where the layout no longer publishes the name — a component removed,
> an id or key changed, a suffix gone — the claim is one the plugin still holds
> and can no longer honour, so the property is **cleared**: a stale number
> outliving the reading it was a copy of is the one thing this design cannot
> leave behind. Where the name is published and merely did not resolve on this
> render — a formula mid-edit, a section that will not read, a cycle guard — the
> property is **left exactly as it is**, because the sheet has no answer either
> and is showing `?` for the same reason, and because stripping and restoring it
> through every intermediate state of a layout edit would be two writes per field
> per settling, each destroying a modified time the change guard exists to
> protect. A row *removed* from the list is a third thing again: the claim is
> withdrawn, so the property is nobody's and is left.
>
> **The mechanism that made this answerable is that the author names the
> frontmatter key**, and it retires three problems at once. The vault-global
> property-type rule becomes the author's, because they typed the key. The
> flattening question never arises, because nothing derives a key from
> `slots.L1.count` — which matters because Obsidian has no object property type
> and its help recommends source mode for nested properties. And a Track's
> projection is chosen by promoting `.left` or the bare name, so the plugin never
> picks one.
>
> **Any published name may be promoted, derived or stored, including the `.value`
> and `.left` forms**, on §5 rather than on preference: a bare name is already the
> derived reading wherever a component computes anything, and a computed Table
> column publishes nothing under `.value`, so "stored only" would mean "only
> `.value` names, and only where one resolves" and would exclude every value the
> feature exists for.
>
> **§3.2 is unamended: the list stays in the layout file.** The convergent
> precedent — three tools of three putting exposure on the field's own
> configuration — does not transfer, because in each of those the exposed thing
> keeps its own name and there is no second namespace to land in, so there is no
> key to name. A per-component flag could not carry an author-named key for
> `abilities.DEX`, could not reach the suffixes no component declares, and could
> not answer "what does this layout put in my property namespace" without walking
> the whole layout.
>
> **What stays closed**: no vault-wide backfill, so a note not opened since a
> field was promoted does not carry it yet; no promotion of an expression, only of
> a name; no `mod.` slot promotion; and no cleanup pass when a field stops being
> promoted (`docs/features/promoted-fields.md`).

## What it does

A layout may list values to mirror into each character's frontmatter, each under
a property name the layout's author types, so Bases and Dataview can read them.
Nothing is promoted unless it is in the list, so a user who does not want this
keeps frontmatter at the single `sheet-layout` key. A character's promoted
properties are rewritten whenever its sheet renders and the value has actually
changed, and nothing on the sheet itself looks different.

## Smallest version

A `promotedFields` list in the layout, one row per field in the layout editor's
Layout panel — a picker over published names and a text input for the property —
and a write at the end of the sheet's render that rewrites only the lines whose
value changed. What it gives up: no vault-wide backfill, no cleanup when a field
is un-promoted, no expressions in the list, and no report anywhere of a property
this plugin could not write. This spec adds only the last of those four, because
a refusal the user cannot see is a feature that silently does not work.

## Design

### Two facts checked rather than inferred

**A Base cannot read anything in a note body, so the feature's justification
holds.** The syntax page enumerates three kinds of referenceable value — note
properties ("stored in the YAML frontmatter"), file properties, and a base's own
formula properties — and nothing else. The file-property table is `file.name`,
`basename`, `path`, `folder`, `ext`, `size`, `properties`, `tags`, `links`,
`embeds`, `ctime`, `mtime`: structural facts about a file and no route to its
text. There is no `file.content` and no function taking one. So a value in a
fenced `sheet` block or a markdown table is unreachable to a Base, which is the
whole reason §9 exists. Checked because the page never states the exclusion, so
"a Base cannot see a fenced block" was an inference from what is listed, and the
feature's justification rests on it.

**Obsidian's property types are vault-global and there is no object type.** Both
quoted above in the model question. The second is what the author-named key
answers; the first is what makes the key the author's to choose.

**What is deliberately still unknown**: what Obsidian does when a promoted key
collides with an existing key of a *different* vault-assigned type. The help
states the vault-wide rule and never describes the collision, so it is
undocumented everywhere — and this design is built so that **the answer does not
change any behaviour**: the plugin writes a scalar, refuses a structure, and
never asks Obsidian what type a property has. The observation is still owed, and
it is a criterion of the manual vault walkthrough rather than a claim in this
document.

### The layout key

**"Promote" already means something else in this plugin, and the two are kept
apart by never using the bare word.** A **typed modifier** is promoted into a
**modifier definition** — `buildSheet`'s own `promote` parameter,
`layouts.ts`'s `appendModifierDefinition`, `src/view/promote-flow.test.ts` — and
that sense writes the *layout file*, where this one writes the *note*. The owner
chose to keep both words and disambiguate rather than rename, so the §2 entry
below does the disambiguating and the convention here is a naming rule with no
exceptions: **no identifier this feature adds is the bare word.** So
`promotedFields`, `PromotedField`, `parsePromotedFields`, `applyPromotedFields`,
`promotableNames` and `promoted-fields-field.ts` are all fine, and nothing is
called `promote`, `promoted`, `promotion` or `promoteFlow` — each of which would
read in a diff as the modifier path, which already owns those spellings.

```json
"promotedFields": [
	{ "name": "level", "property": "level" },
	{ "name": "hp.current", "property": "hp" },
	{ "name": "armour_class", "property": "ac" }
]
```

`name` is a published name exactly as a formula would write it, including the
`.value` and `.left` forms. `property` is the frontmatter key. Both are strings,
and a row carries nothing else — **a promoted field names a value, never an
expression** (below).

**Read on `modifiers`' own terms**, which is the fifth key on those terms: the
*shape* of the key is the file format's business and refuses the layout — a
`promotedFields` that is not an array of objects has no `name` or `property` to
read off, exactly as a `columns` that is not an array has nothing — while what
each row *says* is contents, reported in the editor, with every sheet on the
layout still rendering. `parse/layout.ts`'s index signature already preserves
unknown top-level keys and its own comment names promoted fields as the case it
was written for, so a hand-written list round-trips today; what this adds is the
typed key, the shape check, and a reader that reports what is wrong with the
contents.

**An empty list is an absent key.** The editor holds the array locally until the
first add and never materialises `"promotedFields": []` into a layout that was
merely opened — `modifier-definitions-field.ts`'s recorded trap, and the
`options: []` one again.

### What may be promoted, from one assembly

The promotable set is `publishedEntries(source)` over every component in the
layout — the same single walk the modifier target picker, the suggester and the
panel's own published-names inventory read — plus, per entry, the suffix forms it
answers to: `.value` always, and `.left` where the entry publishes one.

**The suffix policy takes a name**, because this is its fourth site.
`formula/sheet.ts` builds `${name}.value` and conditionally `${name}.left`,
`formula/vocabulary.ts`'s private `forms()` decides the same pair for the
suggester, and `editor/published-names.ts` decides it again for the inventory's
chips. A fourth copy in new code is exactly what PATTERNS §1 forbids, so
`publishedSuffixes(entry)` is exported beside `publishedEntries` in
`formula/modifier-targets.ts` and those three become its consumers. **Only the
suffixes move, not the words**: the suggester's secondary text ("Stored value",
"Remaining"), the inventory's chip text (`.value`, `.left`) and this picker's
label suffix are three different strings for three different surfaces, and each
keeps its own — declared as a `Record` over the suffix union so a third suffix
does not compile until each surface has a word for it, which is
`components/column-types.ts`'s trick and a check nobody has to remember to run.

**`formula/modifier-targets.ts` is the wrong file name for a fourth non-modifier
export, and the gap is recorded rather than fixed here.** That module's own
header already claims a job wider than its name — "the single walk over
`ScopeValues`", with three readers — so the rename is a pass of its own and
`docs/BACKLOG.md` § Patterns gains a row for it rather than this feature
half-doing it.

**`promotableNames(sources)` lives in `parse/promoted-fields.ts`**, not in
`formula/`, because it is about the promoted list rather than about the formula
language: it composes `publishedEntries` and `publishedSuffixes` into
`{ name, label }` pairs in layout declaration order. `parse/` → `formula/` is an
existing edge (`parse/layout.ts` imports both `isName` and
`MODIFIER_NAMESPACE`), and there is no cycle, since nothing in `formula/` imports
`parse/`.

**`mod.<name>` is not offered**, and that is a cut rather than an oversight: a
modifier slot total is a diagnostic about how a number was arrived at, not a
value of the character, and offering the namespace would multiply the picker's
list for a value no party table wants. Recorded under Deliberately not doing.

### The editor surface

One new field, **Promoted fields**, in the layout editor's Layout panel, drawn
last — after Grid columns, Reset triggers, Function library, Bonus types and
Modifiers. Last because it reads *from* everything above it: a promoted value may
be a formula calling the library, and may be a number a modifier changed, so the
reader meets what a value is made of before they meet where it is copied to.

**A list on `modifier-definitions-field.ts`'s geometry**, which is this pane's
idiom for a structured list and the fourth consumer of the shared helpers
(`listField`, `labelled`, `addControls`, `addControlSpacers`, `setOptional`). Not
inside `.sheetsmith-list-scroll`, for that field's stated reason: a capped
scroller is what clipped a detail line, and this list sizes to its content.
**Both controls sit on the entry row and there is no detail line at all** — this
is a two-field row where Modifiers is a six-field one, so a detail line would put
one control on a line of its own under a header that reserved a track for it.

Per row, left to right:

- **Value** — a `<select>` over `promotableNames`, showing each name's *label*
  rather than the name a formula writes: `Abilities · DEX`, `Abilities · DEX ·
  stored`, `Slots · L1 · remaining`. Labels are unique on a layout by
  construction (`parseLayout` refuses a duplicate), so this is the target
  picker's own ruling — the name costs most of the option's width to a truncation
  and adds nothing a reader can use, and the formula name is on screen in the
  component's own published-names inventory one selection away. The chosen
  option's own words go into a `title`, because a `<select>` clips its face with
  no mark and nothing on the page can detect the cut — `ui/truncation.ts` reads
  `textContent`, which is empty on a form control, and a select's `scrollWidth`
  equals its `clientWidth` however long the chosen option is. That rule is
  `titleChosen` in `modifier-definitions-field.ts` and this is its **second
  consumer**, so it is extracted rather than copied (PATTERNS §1's one-step
  tier). Given the wider share of the row, since it is the field whose values are
  authored labels rather than short words.
- **Property** — a text input for the frontmatter key, `aria-label` "Frontmatter
  property", no placeholder value that could be mistaken for a default.
- The shared **move** and **remove** controls, with a confirmation that names
  what removing cannot undo: the property stays in every character note that
  already has it.

**A stored value the picker does not offer is carried as an extra last option**,
marked, rather than snapped to blank — §4.2's rule for a Card's stray option and
the modifier target's own behaviour, for the same reason: silently retyping an
author's layout would change what every character on it writes into a vault's
property namespace, and the report under the list already says which of the two
things is wrong with it.

**Empty state**: `No promoted fields yet.` in `.sheetsmith-entry-empty`, with the
heading's description doing the teaching, and the count line absent — the three
list fields beside it already behave this way.

**Error state**: two surfaces, on `modifier-definitions-field.ts`'s split, because
the moments differ. A *stored* fault is judged as the field renders, so a
hand-edited layout arrives with the offending input marked rather than looking
clean beside a row that does nothing; the words are the parser's own, since the
report under the list is on screen at the same time and two wordings for one fault
in one picture is what UI.md §9 refuses. A *typed* fault is judged on commit,
between renders, puts the stored value back, and says what the field was left as —
a field holding text that was refused lies about the file the moment focus moves.

The report block under the list is the shared `.sheetsmith-field-problems` with
`role="status"`, a locator span where there is one, and the count line that is the
only confirmation a working list gets — the same report the function library, the
triggers, the bonus types and the modifiers all draw.

**Heading description**, stating consequences rather than restating the label:

> The values this layout copies into each character's frontmatter, so Bases and
> Dataview can read them. Each row picks a value the sheet publishes and the
> property to write it under — you name the property, because Obsidian gives
> every property of one name the same type everywhere in your vault. The sheet
> owns what it writes: a promoted property edited in a note's properties is put
> back the next time that sheet renders, and a row pointed at a value this layout
> no longer has stops writing its property and clears it. A character's
> properties are written while its sheet is open, so a note you have not opened
> since adding a row does not have it yet.

Four sentences, and the copy budget for this panel is already §13's open question
rather than this feature's to settle. It is spent on the things a user cannot find
out by looking: that the property name is theirs and vault-global, that the sheet
overwrites a hand edit, that a row whose value went away clears its property, and
that an unopened note is not written.

**It was six, and the two that went were said again on the same surface.**
Measured at six: 135 words over 7 lines at 1400 and 8 at the threshold, above a
255px list — and in the empty state the prose stood about 1.4× the height of the
thing it explains, the longest description in this panel by a third. "Nothing is
promoted unless it is listed here" is the first sentence read the other way
round, and the empty state says it in three words. "Removing a row here changes
no character note" is said in full by the removal confirmation, at the moment it
matters. The fourth fact the six were spent on — that removal leaves the key
behind — is therefore still bought, just not twice.

### The write

**Our own byte-faithful writer, not `processFrontMatter`**, which is where the
existing code already stands. `processFrontMatter` cannot round-trip: js-yaml has
no round-trip mode, and the team chose it, in an Obsidian developer's own
explanation, "for plugins to be able to interact with frontmatter easily". It
drops YAML comments, normalises quotes, strips explicit type tags, converts
inline arrays to block style and rewrites `2022-01-25` as a timestamp —
and it does that to **the whole block, including keys the plugin does not own**.
Constraint 3 holds every other write in this plugin to byte-faithfulness, and
`parse/character.ts` already declines `processFrontMatter` for precisely this, in
`withLayoutName`'s own comment: "repointing one key is not licence to reformat the
properties around it". A user's `aliases`, `tags`, `cssclasses` and their comments
are the user's by any reading of §10, so normalising them as a side effect of
writing `level` is not a cost this feature gets to accept on their behalf.

The price is real and is the reason this is the first commit: **it is a YAML
writer**, and `isPlainLayoutValue`'s recorded gap becomes load-bearing.

**`src/parse/frontmatter.ts`** — one job: read and write one top-level key of a
frontmatter block without touching another byte. Imports nothing from `obsidian`
(Constraint 5).

- **It scans column-0 lines only.** A line with leading whitespace belongs to the
  key above it and is skipped, which is what stops a nested `  level: 3` under
  `stats:` being mistaken for a top-level `level`. A column-0 line **as read**
  is one of: blank, a comment, or a key line (`key:`, then optionally a space and
  optionally a value — so a hand-written `level:5` is read as one, and the
  rewrite rule below is about what is *written* rather than about what is
  accepted). **Anything else at column 0 makes the whole block undecidable** and
  every write into it is refused — the plugin does not edit a frontmatter block it
  cannot fully account for.
- **It writes a single-line scalar and refuses anything else**, in one sentence:
  the plugin owns one line. So a key whose value is a block sequence, a block
  mapping, a flow sequence (`[…]`), a flow mapping (`{…}`), a multi-line scalar
  (`|`, `>`) or an anchor, alias or tag is **refused, never merged** — the rename
  migration's own rule read onto a shape instead of a name, and for its reason: a
  list the user built under the property they chose cannot be told from a scalar
  afterwards. A key appearing at column 0 twice is refused on exactly that
  argument.
- **An absent key is appended** as a new column-0 line immediately before the
  closing `---`, in the layout's declaration order where several are added at
  once. Existing keys stay exactly where they are; nothing is reordered.
- **A rewrite keeps the line's own ending**, so a note written with CRLF stays
  CRLF, which is `withLayoutName`'s rule. The line it **writes** does not keep
  the line's own spacing after the colon: `level:5` becomes `level: 5` once and
  then stays, because the line is the plugin's and its spelling is part of what
  the plugin is asserting.

**The scalar rule, which is where the type comes from.** A promoted number must
read back as a Number or a Base cannot sort on it, and a string that merely *looks*
like a number must not. So `frontmatter.ts` owns one function turning a
`FieldValue` into the YAML scalar that reads back as that exact type:

- a boolean is `true` or `false`;
- a finite number is `String(value)` — recorded edge: a magnitude large enough to
  print in exponent form is written in exponent form, which YAML reads as a float,
  and no value on a character sheet reaches it;
- a non-finite number (`NaN`, `±Infinity`) is **treated as not having resolved**,
  so it falls into the transient arm above and its property is left exactly as it
  is. `.nan` and `.inf` are YAML 1.1 spellings Obsidian's property UI has no type
  for, so there is nothing to write; and a sheet holding a number it cannot
  express is in the same position as a sheet holding no number yet, which is what
  makes this that arm rather than a third one;
- a string is plain where plain means the same thing to every reader, and
  double-quoted otherwise, with `"` and `\` escaped and any newline or tab
  escaped.

**"Plain" is narrower than `isPlainLayoutValue` is today, and errs toward
quoting.** The existing predicate requires a letter or digit first — which rules
out every YAML indicator in one condition rather than a list — and forbids `:`,
`#` and a trailing space. What it is missing is the half the `docs/BACKLOG.md`
§ Patterns row against `isPlainLayoutValue` names: it writes `12`, `No` and
`null` unquoted, and real YAML gives those back as a number, a boolean and
nothing at all. So the predicate gains a third condition —
**not a number spelling, not one of YAML's boolean words, not one of its null
words** — and the boolean and null word sets are taken *wide*, YAML 1.1's rather
than 1.2's, on a deliberate asymmetry: **a needless quote costs nothing, because
a quoted string is still Text, while a missing one changes the property's type
vault-wide.** Which js-yaml version Obsidian ships, and therefore whether `yes`
and `on` coerce, is then something this plugin does not need to know.

**This is also the fix the backlog row against `isPlainLayoutValue` names, in the
direction it names it** — "either the predicate quotes what a bool or number
resolver takes, or the probe reads the app" — so `character.ts`'s
`layoutKeyLine` calls the shared predicate and the row leaves the backlog. The
change is safe in both directions: `extractLayoutName` already strips one
surrounding pair of quotes, so a layout named `12` written as `"12"` reads back
as `12`, and a note already holding the unquoted spelling still parses
unchanged. Nothing migrates, because no note's existing bytes are rewritten
except by a repoint, which is already a change.

**`src/parse/promoted-fields.ts`** — one job, stated without an "and": the
promoted field list. What the layout declares, what is wrong with it, what the
picker may offer, and what a note's frontmatter therefore says. Those are one
decision seen at four moments, which is `component-rename-migration.ts`'s own
argument for holding a scan, a write and a sentence together; the middle two are
the only ones with a choice in them, and splitting the report from the thing it is
a report about would put the problem messages one import away from the rule that
produces them.

- `parsePromotedFields(layout, sources)` → `{ fields, retired, problems }`, on
  `parse/modifier-definitions.ts`'s shape plus one list, for the reason the next
  bullet needs: a usable list, a list of rows whose property is to be *removed*,
  and a list of `{ message, locator? }`. The faults, each with the locator naming
  the property where there is one: **no value chosen**; **no property**; **a
  property promoted twice** (the first is kept and the second dropped, since two
  values under one property could not be told apart, which is the parser's
  existing rule for a repeated modifier name); **a property named
  `sheet-layout`**, which is the plugin's own key and writing to it would repoint
  the note; **a property the frontmatter format refuses** (a `:` or `#`, a
  leading or trailing space, empty); and **a value this layout does not publish**,
  which is the modifier target's own "not published" report one surface over.

  **`retired` is that last fault and only that one.** A row with a usable
  property whose *name* the layout no longer publishes still claims that
  property and is reported, so its property is removed. Every other fault leaves
  every note alone: a blank property has nothing to remove, and the second of two
  rows claiming one property must not remove what the first one writes — so a
  property claimed by any row in `fields` is never retired, whatever a sibling
  row says about it.
- `applyPromotedFields(note, { fields, retired }, resolve)` → the note's new
  frontmatter, or `'unchanged'`, plus the refusals. For a `retired` row it removes
  the property. For a `fields` row it resolves the name through the resolver it is
  handed, turns the value into a scalar, and asks `frontmatter.ts` to set that one
  key. It hands back a `CharacterNote` rather than a string, so the view's own
  `serialiseCharacter` produces the text — the same two-step `repointLayout`
  already uses, and the reason this function needs no knowledge of how a note is
  assembled.

**"The value is not there" is two different situations, and they get two
different answers.** An earlier draft of this spec had one rule — a name that
publishes nothing has its property removed — and that rule was right about one of
the two cases and expensive about the other.

- **The layout no longer publishes the name at all**, which is structural: the
  component was removed, its `id` or an entry `key` changed, or the suffix went
  (a Track that stopped being a row set publishes no `.left`). **The property is
  removed.** This is the arm the old rule was right about, and the argument is
  unchanged: a Base column that is empty where the card reads `?` is honest, and
  a stale number that outlives the thing it was a reading of is a lie the note
  will keep telling for as long as nobody opens that sheet. It is decided by
  `parsePromotedFields` against the layout's *statically* published set, not by
  the resolver, so it needs no character in hand and cannot be mistaken for the
  case below.
- **The name is published but did not resolve on this render**, which is
  transient: a half-typed formula while the layout editor sits beside an open
  sheet, a function library mid-edit, a cycle guard firing, a component whose
  section will not read, or a value that resolved to something with no YAML
  spelling (below). **The property is left exactly as it is** — neither rewritten
  nor removed.

**A component whose `type` this version of the plugin does not have is the
transient case, and it is the one the structural arm gets wrong by default.**
`parseLayout` never refuses an unknown type — it imports nothing from
`src/components/` — so a layout shared from a newer plugin version, or a
hand-edited `type` typo, renders every other cell, fails that one in place, and
publishes none of that component's names. Read off the published set alone, every
promoted row pointing at it is structural and its property is *cleared from every
character note whose sheet is opened*, one real write per note, for a component
still declared and still holding its data. The spec's own separator puts it the
other way: the sheet has no answer about that value because it cannot draw the
component at all, and `view/grid-cells.ts` already frames it in one line — "the
layout is broken, not the sheet". So **the structural arm is decided only over
components the registry holds**, `ModifierTargetSource.unknownType` carries the
distinction from the one place the lookup's failure is visible, and a name under
an undrawable component is unresolved: no write, and a report naming the real
cause rather than telling the author to repoint a row that is correct.

**Why doing nothing is the honest answer to the transient case, rather than a
concession.** The sheet itself has no answer yet either: the card beside it is
showing `?` for the same reason, and `?` is this plugin's word for "not now",
never for "zero" and never for "gone" (§13's own entry on what a derived sheet
owes a reader before there is data). Removing the property would assert something
stronger than the sheet is willing to assert about the same value on screen.

**And the cost the old rule carried is the cost that settles it.** A layout edit
is a sequence of intermediate states, and each one that fails to resolve would
have stripped every promoted property from every open sheet and restored it on
the next keystroke's commit: two real writes per promoted field per settling,
each one destroying the note's modified time — the very thing the change guard
exists to protect — and each one a sync revision on a note nobody touched. The
churn paragraph this replaces called that "the right cost" on the strength of the
honesty argument, and the honesty argument turns out to belong to the structural
arm alone, where the churn does not exist because a layout is only edited that
way once.

**The distinction costs a branch, not machinery.** `parsePromotedFields` already
had to tell an unpublished name from a resolution failure, because the first is a
fault it reports in the editor and the second is not a fault at all; `retired` is
that existing judgement given somewhere to go.

**The change guard is a text comparison, and that is what makes the whole thing
cheap and decidable.** `setFrontmatterKey` compares the line it *would* emit
against the line the note holds, and reports `'unchanged'` where they match. So:
a second render writes nothing, which is what stops the write recursing; a write
that changes nothing is never made, so the note's modified time is not destroyed
by the write most likely to run on every render; and **nothing has to read YAML
back**, which means no `metadataCache` read, no cache lag, and no dependence on
the test double's frontmatter reader — the one the backlog records as unable to
model real YAML at all. A hand edit spelled differently but meaning the same
(`level: "5"` against `level: 5`) is rewritten, and that is the design: the sheet
owns the spelling because the spelling is the type.

### Cadence, ordering and the race

**The write runs at the end of `renderSheet`, from the same `env` the cards drew
from.** Picked over the other three cadences a plugin could choose — on edit, on
save, on close — because it is the only one that covers every way a promoted
value changes: a value edit, a layout edit (a formula, the
function library, a modifier definition), a first open after a field was promoted,
and a reset trigger. No surveyed tool documents its write cadence at all — Metadata
Menu comes closest by making it a toggle and naming the cost of the eager side —
so this is picked rather than borrowed, and the reason it is affordable is the
guard above: the render already holds the note parsed and the sheet resolved, so
the added cost on a sheet whose values have not moved is one string comparison per
promoted field and no write. **A layout with no `promotedFields` key does no work
at all**, which is the off-by-default promise honoured in the code path and not
only in the config.

**It does not re-render.** The write goes through the view's own `commit`, which is
the one write path on this sheet, with the redraw suppressed — because the only
difference between the old text and the new is a frontmatter line **no component
draws**, so there is nothing on screen to recompute. Without this the
promoted-field write would cost a second full render on every edit that moved a
promoted value, and the recursion would only terminate on the guard rather than
by construction.

**Ordering, and the race.** The promoted-field write is the last thing the newest render
does, after `renderSheet`'s existing `run !== this.renderId` guard is re-checked.
That guard is what closes the write-back race for the rest of the frontmatter, and
it closes it without new machinery:

- The write derives its text from `this.data` and never reads the file, so there
  is no second reader to be stale. `this.data` is kept current by the platform:
  `TextFileView.onload` registers `vault.on('modify')`, and `SheetView` overrides
  no `onload`, so it inherits a handler that re-reads a clean view and three-way
  merges a dirty one, announcing the merge.
- A properties-panel edit landing between the render's parse and the
  promoted-field write therefore arrives through `setViewData`, which calls
  `renderSheet` and bumps `renderId` — so the in-flight render's write is
  abandoned rather than writing text derived from frontmatter that has since
  changed. **This is why the
  guard is re-checked immediately before the write and not only before the
  paint.**
- "The sheet wins" makes the *promoted key's* own race benign by design. It does
  **not** make it benign for the rest of the frontmatter, which is exactly what
  the two points above are for.
- The rename migration's bracket needs no extension: it flushes, migrates, reloads
  through `setViewData`, which renders, which promotes. One ordering, already
  correct.

### What the reader sees on the sheet

Nothing. No card changes, no badge, no staleness mark, no new gesture. The one
thing the sheet ever says about a promoted field is a failure, and it says it through the
channel it already has for a write that did not land: the `Notice` `applyEdits`
already fires when a section could not be saved. UI.md §10 wants failure in place
and there is no place — a promoted property belongs to the layout, not to a
component — so the sentence names the property and the fix, and the sheet renders
every card exactly as it would have:

> Sheetsmith could not write the property "level": this note already has a
> "level" holding a list. Remove it, or point the layout's promoted field at
> another property.

The clause after the colon names what was found, so a doubled key and a
frontmatter block the writer cannot account for each say their own thing rather
than sharing one vague sentence.

It fires at most once per render that attempted a refused write, which is the
same cadence the existing save warning has. A refusal changes nothing, so it
re-fires whenever the value moves again — acceptable, because the state is rare,
user-caused, named, and fixable in one gesture.

### Un-promoting, and what is deliberately asymmetric

Removing a field from the layout's list **leaves its property in every character
note**, inert. Adding one writes it to every character whose sheet is opened.
**Renaming a row's property is therefore an un-promote plus a promote**: the old
property stays behind in every note and the new one appears on the next render.
That is a foot-gun worth naming rather than solving, because the alternative —
chasing the old name across the vault — is the migration §10 declines for a
modifier definition, and for its reason: nothing in a note says which plugin wrote
a property, so the search is over a name the user may well be using elsewhere.

Those look asymmetric and are the same rule: **while a field is promoted the
plugin owns that property and keeps it true; the moment it is un-promoted the
plugin has no claim on it and touching it would be reaching into frontmatter it no
longer owns.** That is §10's shape for a removed component exactly — while mapped,
the sheet keeps the section current; once unmapped, it is left precisely as it was
— and it is why there is no cleanup pass and no second vault-wide writer.

**That same rule is what separates removing a row from a row whose value went
away**, and the pair reads as a contradiction until the claim is what you look
at. A row deleted from the list is a claim withdrawn, so the property is nobody's
and is left. A row still in the list, pointed at a name the layout no longer
publishes, is a **claim the plugin still holds and can no longer honour** — so it
clears the property rather than leaving a number behind under a name it is still
asserting ownership of. The author sees both halves of that: the property empties
in every note whose sheet renders, and the row is marked in the editor with the
report naming the value it can no longer find.

### Two devices

Nothing was found in either direction on what a promoted key does when it is
written on two devices between syncs, and the answer is that **this feature adds
no new sync hazard, because it adds no new authority**: the promoted key is
derived, so a conflict over it is a conflict over a value both devices recompute
identically from body data they already sync. However a conflict is resolved, the
next render on each device rewrites the key from that device's own sheet. The one
way it flip-flops is where the two devices hold *different versions of the layout
file*, which is the same condition under which every derived number on the sheet
already disagrees between them, and not this feature's to fix.

## Config fields

**No component gains a `configFields` entry**, and no `ComponentConfig` gains a
key. The promoted list is layout-level, for the four reasons in the model question,
so the fields below are the two controls of the layout editor's own
**Promoted fields** list rather than a component's declared config.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `promotedFields[].name` | select over `promotableNames` | Value | Which value this row copies. Choosing a Track's `remaining` form instead of its bare name copies how many marks are left rather than how many are filled; choosing a card's `stored` form copies what the note holds rather than what the card shows. |
| `promotedFields[].property` | text | Property | The frontmatter property this value is written under. You name it, because Obsidian gives every property of one name the same type everywhere in your vault. A name already used by another row here, or `sheet-layout`, is refused. |

## Data and file model

**Stored in the layout**: one `promotedFields` array of `{ name, property }`.
Absent where nothing is promoted. Layout files carry no byte-identical promise,
so the key serialises through `serialiseLayout`'s one canonical formatting like
every other.

**Stored in the character note**: one frontmatter line per promoted field, at the
top level of the block, written by `parse/frontmatter.ts`. Nothing else in the
note is read or written by this feature at any point — no section, no fence, no
body.

**Round trip.** Constraint 3 holds in the form it is stated: a note where nothing
changed is byte-identical, because a write whose emitted line matches the line the
note holds is not made. Where a promoted value did change, exactly one line
differs and every other byte — the other properties, their comments and their
quoting, the preamble, every section — comes through untouched, which is
`withLayoutName`'s guarantee one key over and is asserted the same way.

**Existing notes.** Untouched until a layout promotes something. Then:

- a note whose property is absent gains one line before the closing `---`;
- a note whose property already holds a single-line scalar has that one line
  rewritten, whoever wrote it — the settled ownership answer;
- a note whose property holds a structure, or holds the key twice, or whose
  frontmatter block this writer cannot fully account for, is **left exactly as it
  was** and reported;
- a note whose promoted value did not resolve on this render is **left exactly as
  it was**, property and modified time both;
- a note whose promoted row points at a name the layout no longer publishes has
  that one property's line removed, and nothing else;
- a note on a layout that *stops* promoting a field keeps the property, inert,
  exactly as §10 keeps an unmapped section.

**Constraint 4** is not reachable: no section is written, moved or removed by any
path in this feature, and a promoted property is output rather than character
data (the model question's argument).

## Acceptance criteria

- [x] `src/parse/frontmatter.ts` sets one top-level key in a frontmatter block and
      carries every other byte through: a note with three other properties, a
      YAML comment, a single-quoted value, an inline array and a CRLF line ending
      has exactly one line different after a write, and the rewritten line keeps
      its own ending.
- [x] A key absent from the block is appended as the last line before the closing
      `---`, and no existing key moves; several appended in one pass arrive in the
      layout's declaration order.
- [x] An indented `level:` nested under another key is **not** treated as the
      top-level `level`: writing `level` into such a note appends a new top-level
      line and leaves the nested one untouched.
- [x] The scalar rule is asserted case by case, each spelling written out
      literally rather than iterated from an exported set: `5`, `-2` and `13.5`
      write unquoted; `true` and `false` write unquoted; the strings `"12"`,
      `"No"`, `"null"`, `"yes"`, `"on"`, `"~"`, `""`, `"a: b"`, `"# x"`,
      `" pad"`, `"pad "`, `"quote\"inside"` and `"back\\slash"` each write
      double-quoted with `"` and `\` escaped; `NaN` and `Infinity` have **no
      spelling at all**, so the writer hands back none and the caller leaves
      that property exactly as it is. *(This read "remove the key" while the
      transient arm was still being settled, and contradicted both the Design
      section above and the two-arms criterion below. A number a sheet cannot
      express is in the same position as a number it does not have yet, which is
      the transient arm.)*
- [x] A write whose emitted line equals the line the note already holds reports
      `'unchanged'` and returns the input string identically — the guard that
      keeps a render from touching a note's modified time.
- [x] Each refusal is a named case and leaves the note byte-identical: the key's
      value is a block sequence; a block mapping; a flow sequence; a flow mapping;
      a multi-line scalar (`|` and `>` both); a tag or anchor; the key appears at
      column 0 twice; the block holds a column-0 line that is neither blank, a
      comment, nor a key line.
- [x] `parse/character.ts`'s `layoutKeyLine` reads its plain-value rule from
      `frontmatter.ts`, so a layout named `12`, `No` or `null` is written quoted
      and `extractLayoutName` reads each back as its own name —
      the three cases the backlog row against `isPlainLayoutValue`
      names, and that row leaves the backlog in the same commit. Every existing
      case in `character.test.ts` passes unmodified.
- [x] `parseLayout` refuses a `promotedFields` that is not an array of objects,
      with a message naming the key and the shape, on `modifiers`' wording; a
      `promotedFields` this version can read round-trips through
      `parseLayout`/`serialiseLayout` unchanged, and one carrying an unknown extra
      member keeps it.
- [x] `parsePromotedFields` reports each fault with a locator where there is one:
      a row with no value; a row with no property; a property promoted twice, the
      first kept and the second dropped; a property named `sheet-layout`; a
      property holding `:`, `#`, a leading or trailing space, or empty; and a
      value the layout does not publish. Usable rows survive an unusable sibling.
- [x] `parsePromotedFields` returns a row whose name the layout does not publish
      in `retired` and in no other list, and returns **no** other fault there —
      asserted case by case, since this is the one list that causes a note to be
      written. A property claimed by a row in `fields` is never in `retired`,
      even where a sibling row claims the same property with an unpublished name.
- [x] `promotableNames` over one layout holding a Card, a Card set, a Track row
      set and a Table offers every published name, each name's `.value`, and
      `.left` only where the entry publishes one — asserted to equal what
      `publishedEntries` plus `publishedSuffixes` produce, so the picker cannot
      drift from the assembly.
- [x] `publishedSuffixes` agrees with what `buildSheetScope` actually registers:
      a guard case over a synthetic `ScopeEntry` with and without `left` asserts
      that every suffix the function returns resolves through the built scope and
      that no other suffix does.
- [x] `applyPromotedFields` writes each field's property once, reports
      `'unchanged'` where every line already agrees, and still writes the other
      fields where one is refused.
- [x] **The two arms of "the value is not there" are asserted apart, and this is
      the criterion the revised rule turns on.** A row in `retired` has its
      property removed from the note. A row in `fields` whose name does not
      resolve on this render leaves its property **byte-identical**, and the
      whole note with it. Driven as **the rule once at the parse seam** — where
      every cause is a resolver answering nothing and so indistinguishable by
      construction — plus **at least one real cause through the view**, a card
      whose formula will not parse, so that a real path is shown to reach that
      rule. `NaN` and `Infinity` keep their own cases, because they arrive as a
      value rather than as an absence.
      *(This asked for each cause "separately". Three of the four were the same
      input under three titles, which would all have passed had every real path
      regressed — `docs/PATTERNS.md` §10's vacuous pass one step over — and
      collapsing them left this criterion naming two causes that are now driven
      nowhere.)*
- [x] A layout edited through a sequence of unresolvable intermediate states
      writes nothing to any note at all — the churn case the old rule paid for,
      asserted as a write count of zero rather than as a final state, since a
      strip-and-restore ends where it started.
- [x] A sheet whose promoted values all agree with the note makes no write: the
      view's data is the same string after the render and no save is pending.
- [x] A sheet whose promoted value differs writes the note through the view's own
      commit path and **does not re-render** — asserted with a render counter, so
      one edit to a promoted value is one render, not two.
- [x] A refused property reports through the sheet's existing `Notice` channel,
      naming the property and the fix, and every card on the sheet still renders
      and stays editable.
- [x] A sheet whose note will not parse, or whose layout is missing or will not
      parse, writes no frontmatter at all.
- [x] A layout with no `promotedFields` key causes no frontmatter read and no
      write: the note's text is untouched and identical after a render.
- [x] The promoted-field write is abandoned where the render generation moved
      between the sheet being built and the write being made — the
      properties-panel race, driven by overlapping `setViewData` calls so the
      older render is stale when its layout load returns.
      *(The guard after `loadLayout` is the one whose window a test can open.
      The re-check immediately before the write is **stated rather than
      reachable**: nothing between the two awaits, so today it is the same
      answer, and it exists so that an await introduced anywhere in the render
      cannot leave this one statement outliving its own generation. An earlier
      draft promised a case driven by "firing the stub's `modify` between the
      two", which no test can write — the double models no vault `modify` event
      and `TextFileView` models no `onModify` — and which promised more than the
      Design section does.)*
- [x] `docs/SPEC.md` §8's reflow order, §10's promises and every existing
      `component-rename-migration.test.ts` case are unchanged: a rename's flush,
      scan and reload bracket gains nothing and loses nothing.
- [x] The editor's **Promoted fields** list draws one row per entry with a
      **Value** select and a **Property** input, an empty state reading
      `No promoted fields yet.`, a count line only where the list is non-empty,
      and the shared move and remove controls with a confirmation naming what
      removal leaves behind.
- [x] A stored value the picker does not offer is carried as a marked extra last
      option rather than snapped to blank, and the report under the list names it.
- [x] Committing a property the format refuses, one already promoted by another
      row, or `sheet-layout`, puts the stored value back and shows the reason
      inline naming what the field was left as; committing a valid one persists
      the layout and redraws.
- [x] A stored fault is marked as the field renders, and the field's wording for
      each fault is contained in what the report block says about the same
      layout — the guard that stops the two surfaces being reworded apart.
- [x] The select's clipped-value `title` rule is one function shared with
      `modifier-definitions-field.ts` rather than a second copy, and both fields
      are driven over a chosen option long enough to clip.
- [x] `docs/BACKLOG.md` § Patterns gains one row for renaming
      `formula/modifier-targets.ts` to match the job its own header claims, with
      a trigger named, and `src/backlog.test.ts` still passes.
- [x] No identifier added anywhere in the feature is `promote`, `promoted`,
      `promotion` or `promoteFlow` — the spellings the modifier path already owns
      (`buildSheet`'s `promote` parameter, `layouts.ts`'s
      `appendModifierDefinition`, `view/promote-flow.test.ts`). Checked by
      reading the diff rather than by a scan, since a scan over a word this
      common would report the modifier path's own existing uses.
- [x] `npm test`, `npm run lint` and `npm run build` all pass.
- [x] No edit lands in `docs/SPEC.md` as part of building this — the §2, §3.1,
      §9, §4.3, §10 and §13 edits named below are `/land-it`'s.
- [ ] **OUTSTANDING AT LAND — the manual vault walkthrough has not been run.**
      The owner landed the feature without it and runs it afterwards, which is a
      decision recorded here rather than a box quietly ticked. **Two
      observations are therefore unwritten**, and this document owes both: what
      Obsidian's properties panel does with a Number written under a name the
      vault types as List (§7 of the walkthrough, and undocumented everywhere —
      the design is built so the answer changes no behaviour, but the
      observation is still owed), and confirmation that the transient arm leaves
      a note's modified time where it was (§5's own check, which is the one
      claim in the two-arms design that only a filesystem can settle).

      **The fixture is in place and nothing has to be rebuilt**, which is what
      the remaining work costs: `Sheetsmith layouts/DnD 5e Standard.json` carries
      the five rows — `passport.level`→`level`, `passport.class`→`class`,
      `hp`→`hp`, `armour_class`→`ac`, `spell_dc`→`spell_save_dc`, taken from that
      layout's own published-name inventory — `Characters/Thora.md` and
      `Characters/Garrick.md` are the two notes on it, and `Party.base` and
      `Party (Dataview).md` are the two query surfaces. Neither note has a
      promoted property pre-written, so step 1 proves something. The one step
      that needs a file made is §7's non-character note holding a list-valued
      `level`, which is that step's own gesture.

      **Two departures from the § Vault fixture section below, both forced by
      the vault.** `Aramil.md` is on `DnD 5e Caster` and the note called
      `Multiclass.md` is on `Passport variations`, so neither was available and
      `Garrick.md` was created instead. And this layout *stores* level on the
      Passport — its function library reads `level = passport.level` — so there
      is no summed level to promote here and the split is two derived and three
      stored rather than three and two: the third stored slot went to `hp`,
      which resets on Long rest and therefore makes the reset-Undo defect fixed
      in review observable by pressing two buttons.

## Vault fixture

Not a new fixture pair. Promoted fields are a layout-level capability rather than
a registered component, and the vault's convention is one fixture per component
with capability-only variations merged, so this rides on the playable layout it
was designed for.

**`Sheetsmith layouts/DnD 5e Standard.json`** gains:

```json
"promotedFields": [
	{ "name": "level", "property": "level" },
	{ "name": "hp", "property": "hp" },
	{ "name": "hp.max", "property": "hp_max" },
	{ "name": "armour_class", "property": "ac" },
	{ "name": "passport.class", "property": "class" }
]
```

Three of the five are derived and two are stored — a Pool's bare name is its
*current* value (`pool.ts`'s `self: { value: data?.current }`), and a Passport
field's name is what the note holds — which is what makes the walkthrough's
overwrite step observable on a stored value and its removal step observable on a
derived one. `hp.max` is the Pool's ceiling, which is a `display` entry where that
pool's max is a formula and a stored one where it is not, so the same name covers
both cases. Exact names to be taken from that layout's own published-name
inventory when the fixture is placed, not from this list.

**`Characters/`** holds at least two notes on that layout, one of them `Aramil.md`
(deliberately a plain sheet) and one multiclass character, so the promoted `level`
is a sum with no stored counterpart anywhere in the note.

**`Party.base`**, a Base over `Characters/`, with columns `file.basename`, `level`,
`hp`, `hp_max`, `ac` and `class`, sorted by `level` descending. This is §9's own
use case and the only place the feature can be seen working.

**`Party (Dataview).md`**, holding one `dataview` block:
`TABLE level, hp, ac FROM "Characters" SORT level DESC`.

**What to press, in order.**

1. Open each character's sheet once. Each note's properties panel shows the five
   properties, and `level`, `hp`, `hp_max` and `ac` are typed **Number** while
   `class` is **Text**. Open `Party.base`: every character is a row and the
   `level` sort works, which is the whole promise.
2. Change an ability score that feeds AC. The card updates, and the Base's `ac`
   column follows without the sheet being closed.
3. Edit `hp` in a note's own properties panel to a wrong number. The panel accepts
   it and the Base refreshes. Reopen or re-render that sheet: the sheet's value is
   back. **This is the accepted cost being confirmed as behaviour, not a bug.**
4. In the layout editor, rename the `hp_max` row's **Property** from `hp_max` to
   `max_hp`. Every note gains `max_hp` on its next render and **keeps `hp_max`**,
   inert — renaming a property is an un-promote plus a promote, and this is the
   step that shows it. Then remove the `ac` row and confirm every note keeps its
   `ac` property too.
5. **The transient arm.** With a sheet open beside the layout editor, break a
   formula the promoted `hp_max` reads — type it half-way and leave it. The card
   shows `?` and the `hp_max` property **does not change**, in that note or any
   other; the Base still shows the last good number. Check the note's modified
   time before and after and confirm it did not move. Fix the formula and the
   card comes back with the property never having been disturbed.
6. **The structural arm.** Delete the component `hp_max` reads from, or change
   its `id`, leaving the promoted row pointing at the old name. The row is marked
   in the editor and the report names the value it can no longer find, and the
   `hp_max` property is **cleared** from every note whose sheet renders. Put the
   component back and the property returns. Both arms in the same sitting, in
   this order, because they are the pair the design turns on.
7. **The undocumented case.** On a note in the vault that is *not* a character,
   create a property `level` holding a list, so the vault assigns `level` the List
   type. Then open a character sheet: observe what Obsidian's properties panel
   does with a Number written under a name the vault types as List, and record it
   in this document. Separately, add a list-valued `level` to a *character* note
   by hand and confirm the sheet refuses it, leaves the note byte-identical and
   says so in one `Notice` naming the property and the fix.
8. Confirm the modified time of a note whose values have not changed is untouched
   by opening and closing its sheet.

## Commit boundaries

A plan for `/land-it`, applied once at the end. The work stays in one uncommitted
tree through implementation and every round of findings.

1. **`feat: Write one frontmatter key without reformatting the rest`.**
   `src/parse/frontmatter.ts` and its test: the column-0 scan, the set/remove/
   refuse outcomes, the scalar rule, and the change guard. Plus
   `parse/character.ts`'s `layoutKeyLine` reading the shared plain-value
   predicate, which removes the backlog row against `isPlainLayoutValue`.
   Nothing is
   promoted yet; this is the commit that answers "can we write frontmatter at all
   without breaking Constraint 3".
2. **`feat: Read the layout's promoted field list`.** `types.ts`'s
   `PromotedField`, `parse/layout.ts`'s `promotedFields` key and shape check, and
   `src/parse/promoted-fields.ts` with `parsePromotedFields`, `promotableNames`
   and `applyPromotedFields`, plus tests. Also
   `formula/modifier-targets.ts`'s `publishedSuffixes`, with
   `formula/vocabulary.ts` and `editor/published-names.ts` converted to call it
   and the guard case against `buildSheetScope`. Still nothing writes.
3. **`feat: Mirror promoted values into a character's frontmatter`.**
   `view/sheet-view.ts`: the promoted-field pass at the end of `renderSheet`, the
   generation re-check, the commit with the redraw suppressed, and the refusal
   `Notice`. This is the commit after which the feature works for a hand-written
   layout key.
4. **`feat: Choose which values a layout promotes`.**
   `src/editor/promoted-fields-field.ts` and its test, the `config-panel.ts`
   wiring, and whatever `src/styles/` needs for a two-control entry row. The
   authoring surface, last, because it is the half a hand-edited layout does not
   need.

## Deliberately not doing

- **No vault-wide backfill.** A character not opened since a field was promoted
  does not carry it. Doing better means resolving every note's whole sheet, which
  is `view/` machinery rather than the rename migration's text substitution, and
  it is precisely the cost Metadata Menu documents for its own eager side ("can
  slow down obsidian if you have many of those fields and a lot of files"). The
  trigger that would change the answer is a user reporting a half-populated Base,
  and the shape it would take then is **one explicit command**, not a write fired
  by every layout commit.
- **No second vault-wide writer**, and no change to
  `src/component-rename-migration.ts`. Its bracket already covers the one path
  that crosses a rename and a render.
- **No cleanup when a field stops being promoted.** A row *removed* from the list
  is a claim withdrawn, so its property stays in every note, inert, and the field
  description says so. Not to be confused with a row still in the list whose name
  the layout no longer publishes, which *is* cleared — the pair is argued in
  Design, and the difference is whether the plugin still holds a claim on the
  property.
- **No expression in the promoted list.** A promoted field names a value, never a
  formula. An expression there would be a second formula surface with no card to
  report its errors on, where the sheet's own `?` is how a broken formula is
  surfaced today. The answer to "I want something computed promoted" is to put it
  on a card, which is also how the author sees it — and where they genuinely do
  not want it on screen, a card in a Tab set's inactive tab still resolves, since
  SPEC §8 has hiding change what the reader sees and never what the sheet
  computes.
- **No `mod.<name>` promotion.** A modifier slot total is a diagnostic about how a
  number was reached rather than a value of the character, and offering the
  namespace would multiply the picker for something no party table wants.
- **No staleness surface of any kind** — no indicator, no warning colour, no
  refresh command. This is the half of Metadata Menu's answer the owner chose
  against, and "the sheet wins" is what makes it unnecessary.
- **No per-component promote flag**, and **§3.2 is not amended**. Four arguments
  in the model question; recorded here so a reviewer does not read the convergent
  research as a gap.
- **No `processFrontMatter`.** Argued in Design; recorded here because reaching
  for it is the obvious shortcut and it normalises keys the plugin does not own.
- **No property-type control.** The plugin writes a scalar whose spelling implies
  its type and never tells Obsidian what type a property is. There is no API for
  it, and the type is vault-global and therefore the user's.
- **No date or list promotion.** Obsidian has Date, Date & time and List types
  and the formula language has no value that is one — §5's language has no
  collection and no date — so there is nothing to write. The trigger is the string
  question in §13, not this feature.
- **No fix to the `obsidian-stub` weaknesses beyond what this exercises.** The
  `isPlainLayoutValue` row is closed by commit 1, because the predicate it names
  is the thing this feature makes load-bearing; the probe row — nothing holding
  the double's comments about the app to the app — stays open, and
  `Vault.create`'s own two rows are not
  reached at all, since nothing here creates a file. The text-comparison guard is
  what keeps this feature off the double's frontmatter reader entirely, which is
  why that row can be closed by tightening the predicate rather than by building the
  probe.
- **No mobile reflow pass.** The list is the fourth consumer of a geometry whose
  narrow layout already exists; a real-device pass is its own work.
- **No rework of the copy budget** for the configuration panel, which is already
  §13's open question. This field spends six sentences on a heading description
  and says why.

## Where `docs/SPEC.md` changes at land time

Not performed here. `/land-it` owns every edit below.

**§9 is rewritten** from four sentences of intent into the settled design: the
author-named key and what it retires; the promotable set being every published
name including `.value` and `.left`; the sheet owning the key, with the §10
argument and the accepted cost; the cadence being the sheet's own render with a
change guard; a structure or a doubled key refused rather than merged; the two
arms of a missing value — a name the layout no longer publishes having its
property cleared, a name that merely did not resolve on this render having it
left alone; un-promoting leaving the property behind; and off by default meaning
no work at all where the key is absent.

**§2 gains a `Promote` entry**, because this feature ships a second, unrelated
meaning of a word §2 already uses. §2's own opening for its coined terms says
"Where a term has a wrong twin already in use, the twin is named so it stops
spreading", and it does exactly this for **Card** against **Container** and for
**Row** against **Record**. Here neither sense is the wrong one — §2's
**Typed modifier** entry already says "A typed part may be **promoted** into a
definition from the sheet (§7)", and that path is in the tree as
`src/view/promote-flow.test.ts` — so the entry follows **Card**'s form instead,
which names a word that is deliberately two things and says what tells them
apart. It belongs immediately after **Typed modifier**, where the first sense is
introduced.

> **Promote.** Two unrelated moves share the word, both already in this document,
> and neither is the wrong one. A **typed modifier** is promoted into a **modifier
> definition** (§7): a one-off written on one character's row becomes a rule the
> layout names, which every other character may then enrol in. A **promoted
> field** is a published value copied into a character's frontmatter (§9): a
> number only the sheet could reach becomes a property Bases and Dataview can
> read. What they share is only the shape of the move — each takes something
> reachable in one place and makes it reachable more widely — and **what tells
> them apart is which file is written, which is the opposite file in each case**:
> promoting a modifier is the one path where a character's sheet writes the
> *layout*, and a promoted field is the sheet writing its own *note*. So a
> sentence about promotion has to say which of the two it means.

**The claim that both write the layout file is false, and it is worth having
checked**, because it would have been the obvious thing to write and it is exactly
backwards for one of the two: `src/view/promote-flow.test.ts`'s own header calls
promoting a modifier "the first path in this plugin where a character's sheet
writes the layout", and `layouts.ts`'s `appendModifierDefinition` is that write,
while a promoted field never touches a layout at all. The opposite directions are
the sharpest discriminator available, which is why the entry ends on them.

**§3.1's first bullet** already says frontmatter holds one key "by default" and
gains the clause pointing at §9 for what makes it more than one.

**§3.2 is unchanged**, which is itself a decision — it already says the layout
file holds the promoted field list, and the model question argues why the
convergent research does not move it.

**§4.3's "Promoted fields" line** gains the shape: a list of value-and-property
pairs.

**§10 gains a bullet** stating that a promoted frontmatter key is plugin-owned
output rather than character data, with the test that separates them — removing it
loses nothing, because the next render reproduces it — so that the next reader of
§10 does not read it as forbidding §9.

**§13 loses nothing and gains the entry above**, both the question and its
`Resolved:` paragraph, in the prose style its neighbours use, naming what stays
closed.
