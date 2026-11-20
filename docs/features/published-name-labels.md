# A published name's own label

Status: shipped
Board card: A published name gains display text of its own in the component
contract, and the surfaces that name a target indirectly read it. A form's
change lines say *STR*, *AC* and *Perception* rather than a key or a whole
component label, and a group's members are named by the row a reader sees.

## Model question

**No §13 question blocks this.** The contract change is the one
`docs/features/character-forms.md` deferred ("published names have no labels of
their own yet"), and the owner settled its model before this spec. That ruling
is restated here because the design is built on it, not reopened:

1. **Two widths, never derived.** A published name has a **full** label and an
   optional **short** one. Short is never computed from full: no truncation, no
   initials, no slug. Fallbacks: short width is short → full → key; full width
   is full → key.
2. **The author declares it.** The full label is display text the configuration
   already holds (Card set entry `name`, Table and Roster row `label`, Track row
   `name`, Passport field `name`, Roster stat `name`, a bare component's own
   `label`). It covers 54 of the 62 named entries in the 5e starter. `short` is
   new, optional and author-typed. Names a component builds for itself get fixed
   words from `src/en.ts`. A column total, and a row with no text, falls back to
   its key. No label is inferred by looking anything up.
3. **Composition is structured.** The walk carries parts and never a phrase
   template. A surface that already shows the component draws the entry part
   alone. A list that mixes components draws `Component · Entry` with a fixed
   separator. A per-name author override (*Strength save*) is deferred to a new
   §13 entry (below).
4. **The surface picks the width.** That is stated per surface in **Design**. A
   layout that wants the short form everywhere (Call of Cthulhu) types *CON* as
   the full label and needs no switch.
5. **Shared text is allowed.** An ability and its save may both be *CON*. The
   change line keeps them apart with the component part, not by detecting the
   clash (see **Design**, "Why every line names its component").

What the contract has to grow, as a decision and not a side effect:

- **A shared `short` property** beside `label` (§4.1's table). It is set in the
  layout and owned by the editor's shared fields, the same as `label`. It is the
  component part's short width. It is shared rather than a per-type
  `configFields` entry because the walk reads the component part off
  `ComponentConfig`, as it reads `label` today, and a per-type field would mean
  every publishing component declaring the same key.
- **`ScopeEntry.label` and `ScopeEntry.short`**, the entry part a component
  supplies from its own configuration in `scopeValues`.
  **`UnnamedMember.short`** joins the existing `UnnamedMember.label`. Both pass
  §4.1's rule for optional members squarely. The alternative is
  `formula/modifier-targets.ts` knowing that a Card set's display text lives in
  `entries[].name` and a Table's in `rows[].label`, which is each component's
  data shape.

**What it publishes to formulas: nothing new, and that is the constraint that
matters most here.** A label is never a name, a target, a group spelling or a
search key. No code compares, parses or matches one. Every resolution (the name
table, the accepting and marked sets, group membership, a definition's target,
a state, buffer or choice target) still keys on the name. A test holds this by
rewriting every label and checking that nothing resolves differently.

**What it stores, and existing notes.** Nothing in a character note changes.
Sections key on the component's `label`, which this feature does not touch, and
`short` keys nothing. Constraints 3 and 4 are not engaged. The layout file gains
optional keys that are omitted while absent, so an existing layout reads and
writes byte-identically.

## What it does

Every surface that names a value a modifier reaches now uses the text the
author wrote for that value, never its storage key. The Brown Bear's form reads
*AC 11*, *Abilities: STR sets to 4 · DEX sets to 0 · CON sets to 3* and
*Saves: CON sets to 5*. A cloak's reach line reads *Not Saving throws ·
Strength*. An author who wants a tight form of a name types it once, in a
**Short label** field, and the tight surfaces use it.

## Smallest version

Full labels only, with no `short` anywhere. The walk carries structured parts
with each entry's display text, `compactChange` and `setsOneNumber` read those
parts instead of splitting a string, and the reach line and the editor's member
count read the same parts. Both BACKLOG rows close. What it gives up: tight
surfaces draw the full label, so the bear reads *Armor class 11* and *Saving
throws: Constitution sets to 5*. That reading is correct, apart and long.
Commits 1 and 2 below are this version.

## Design

### The walk carries parts (`formula/modifier-targets.ts`)

`publishedEntries` is still the one walk. Each `PublishedEntry` gains a
structured `parts`:

```ts
/** One part of a published name's display text. `full` has already fallen back to the key. */
interface LabelPart { full: string; short?: string }

/** What a published name is called, as parts: never a joined string something later splits. */
interface NameLabel {
	/** The publishing component: its id (for grouping, never shown), its label → id, its `short`. */
	component: LabelPart & { id: string };
	/** The entry under `named`, absent for the component's own bare name. */
	entry?: LabelPart;
	/** The column a state change names on the entry's row (`stateTargets`), as today: its key. */
	column?: string;
}
```

The walk fills `component` from `ModifierTargetSource` (which gains `short`,
copied by `modifierTargetSource` from `config.short`, as it copies `label`).
It fills `entry` from `ScopeEntry.label ?? key` and `ScopeEntry.short`. The
existing `PublishedEntry.label` string stays, but it is now produced from
`parts` at full width by the composer below and is never built inline. It
remains the text for surfaces that want the full breadcrumb, such as the
picker, `promoted-fields.ts` and the definitions report. Nothing may split it.

`groupIndex` builds each `GroupMember` with `parts`. A named member takes the
walk's parts. An unnamed member takes the component part plus
`{ full: member.label, short: member.short }`. `GroupReach.missed` carries
`parts` in place of `label`. `stateTargets`, `bufferTargets` and
`choiceTargets` hand on the walk's parts. A column state's `label` is composed
with `column` set, not as `${label} · ${column}`.

### One composer (`formula/name-label.ts`, new, pure)

The only place a `NameLabel` becomes text:

- `BREADCRUMB = ' · '`. It is the existing separator and it is the only
  spelling.
- `partText(part, width)`: short width gives `short ?? full`, full width gives
  `full`.

**A part with no `short` draws exactly its full label on every surface that
asks for short, unconditionally.** No code path produces a short form from a
label or a key: `short` is only ever the author's text, read as written, or
absent. The one fallback is `short ?? full`, and `full` is already the label,
or the key where there is no label. This holds for the component part and the
entry part alike, on every row of the width table below that asks for short.
- `nameText(label, width, { component })`: the entry part alone, or the
  breadcrumb when `component` is true. A bare name is its component part
  whatever is asked. A `column` is appended last.

Every surface below goes through these two functions. No surface joins parts
itself, and no code reads text back out of a composed string. That is
`docs/PATTERNS.md` §1's one-step tier: one composition, so no guard test has to
check that copies agree.

### The outcome carries parts (`types.ts`, `formula/sheet.ts`)

`ModifierOutcome` gains `targetName?: NameLabel`. It is set wherever `target`
is a published name and is absent on a stray, on a part aimed at groups, and on
a target the layout does not publish. `targetLabel` stays as the full-width
text, for the breakdown and the definitions report. `sheet.ts` keeps a name →
`NameLabel` map beside its existing name → label map. The column variant passes
`column` rather than appending ` · ${column}`.

`types.ts`' comment citing "BACKLOG § Patterns row 146" is a stale reference.
It is reworded to cite this doc, since the row it pointed at closes here.

### Which width each surface asks for

| Surface | Component part | Entry part | Composition |
| --- | --- | --- | --- |
| Form change list (`stat-block.ts`) | short | short | Line lead, then entries (below) |
| Vitals strip tile caption | short | n/a (a vital is a bare name) | Component part alone: *AC* over *11* |
| Closed form's vitals summary | short | n/a | *AC 11* |
| Group reach line, `Not …` (`modifier-breakdown.ts`) | full | full | Breadcrumb: *Not Saving throws · Strength* |
| Target picker, **Value** select on the sheet's form and the editor's **Changes** | full | full | Breadcrumb, `column` last |
| Editor member count `title` (`modifier-groups-field.ts`) | full | full | Breadcrumbs joined by `, ` |
| Breakdown and outcome text (`modifierOutcomeText`'s first line, a cell's `title`) | full | full | Breadcrumb: *Saving throws · Constitution — sets to 5* |
| Accessible names composed for a control with no visible words (the form glyph's `Brown Bear Modifiers: …`) | full | full | Breadcrumb |
| `title` on any text drawn at short width | full | full | The same item at full width |

**The rule behind the table:** short where space is the constraint and the
component is on screen or in the line lead; full wherever the text is a
sentence, a tooltip, a picker or an accessible name. A screen reader saying
*CON* where the sheet means *Constitution* is the dnd5e 4675 trap (a compact
form becoming the only name). It is held off by `UI.md` §6's own rule: visible
text keeps its own name, and the full form rides in `title`, which adds to a
name rather than replacing it. A `title` is drawn only where the item actually
used a declared `short`, which is a structural test (is `short` present) and
not a comparison of two strings.

### The form's change list

`compactChange` is rewritten to read `outcome.targetName` and stops splitting
`targetLabel`. `setsOneNumber` stops searching it for `' · '`. Its "a
component's single number" test becomes `targetName !== undefined &&
targetName.entry === undefined`.

- **Lines are grouped by structure, not by text.** The line key is
  `targetName.component.id` plus whether the target is the bare name. A group
  part, or a target with no `targetName`, keys on `outcome.target` as today.
  Today's key is the label string, so two components with one label would share
  a line, which is a label being matched.
- **A line of entries leads with its component part at short width**, drawn as
  a muted lead span (`.sheetsmith-stat-block-change-lead`, `--text-muted`, the
  abbreviation's treatment in `UI.md` §6) followed by a colon, *Abilities: STR
  sets to 4*, on every theme. The colon is a glyph, so a lead still reads as a
  lead in forced colors, where the muted colour is gone; and it is not the
  breadcrumb's dot, which stays for a published name's own breadcrumb (*Saving
  throws · Strength* on the reach line, the pickers, a `title`). Owner's
  decision at the land stop.
  Then each item is its entry part at short width plus the outcome's own words.
  A column change appends its column, as the composer does.
- **A line holding the bare name** reads the component part at short width
  plus the words (*AC +2*), with no lead. A component with both a bare and a
  named change gets two lines, so *HP +5* never sits under an *HP ·* lead.
- **The grant special case goes, into a rule that covers it.** A name the
  component builds for itself takes a fixed word (*Maximum*, *Temporary*,
  *Length*, *Active*, *Uses left*, *Name*), and that word names nothing without its
  component: *Temporary grants 10* alone does not say whose. So a line holding
  such an entry is always led, whatever the line count, and *HP: Temporary
  grants 10* reads the same alone as beside other lines. The walk carries the
  fact on the part (`ownWord`), set by the component that chose the word, so no
  surface tests for a grant or for a word.
- **A group part** keeps today's reading: the groups' labels and the words, on
  a line of its own.

**Why every line names its component, which differs from the owner's example
in one place.** The example reads *CON sets to 3* bare on the Abilities line and
*Saves · CON sets to 5* on the saves line (the owner's example, in its own
punctuation). The only rule that produces exactly
that is "lead only the line whose entry text appears on an earlier line". That
rule compares two labels, which is what this feature is forbidden to do. It is
also order-dependent: swap the two lines and the other one gets the lead. A lead
only where the author declared a `short` would turn `short` into a display flag
and break the fallback rule. So the rule is `UI.md` §9's breakdown rule for a
contributor, applied to targets: **the component appears where the list draws
more than one line**. That is a count, not a comparison. Lines, not components:
a Pool's own number and its maximum are one component on two lines (*HP +5*,
*HP: Maximum +10*), and a lead is what tells the second from the first. A field
whose changes all land on one line draws its entries with no lead, unless an
entry's text is a component's own word (above). The bear's changes fall on
three lines, so they read:

> **Abilities**: STR sets to 4 · DEX sets to 0 · CON sets to 3
> **Skills**: Perception at least 3 (already higher) · Stealth at least 3
> **Saves**: CON sets to 5

(the bold standing for the muted lead). The cost is one lead word on the
Abilities line. The owner may prefer the literal example. If so, that is the
first case for the deferred per-name override, not for a comparison.

**Which width each crumb takes on the change line**, as asked: the lead
(component part) is short → full → key, and each item's entry part is
short → full → key. With the starter's shorts that is *Saves: CON*. With none
it is *Saving throws: Constitution*.

**The In play brief's one change line reads the same lines**, led by the same
rule and joined by the list's separator: *Abilities: STR sets to 4 · CON sets
to 3 · Skills: Perception at least 3 · Saves: CON sets to 5*, so the ability's
CON and the save's read apart there too (owner's decision at the land stop).
One builder serves both, `changeLines` in `stat-block.ts`.

### The vitals strip

`drawSetVital`'s caption is `nameText(targetName, 'short')`, which is the bare
component's short → full → key. With no `short` it is exactly the full label
(*Armor class* over *11*). Where `short` was used, the caption carries
`title` with the full label. `vitalsSummary` reads the same short text: *AC 11*.
A refused vital keeps its muted number and its reason in words, unchanged.

### The reach line and the editor's member count

`reachLines` writes `Not ${nameText(missed.parts, 'full', { component: true })}`.
`modifier-groups-field.ts` titles its count with each member's full breadcrumb
joined by `, `. The count text itself (*6 values*) does not change, so the PNG
of the count looks the same and the `title` is checked by a test.

### Where the author types `short`

- **On a component:** a **Short label** text field directly under **Label** in
  the configuration panel. It is shared, the editor owns it, and it commits as
  **Label** does. It is drawn only for a component whose static read publishes
  at least one name (`modifierTargetSource(config, definition).values` holds a
  `self`, a `named` or an `unnamed`). A container, a Rich text or an Image never
  shows it, since nothing would read it.
- **On an entry or a row:** a **Short** text input on the item's detail line,
  the line `memberGroups` already draws (`table-row-modifier-target.md` D12). It
  is declared by a new optional `ConfigFieldSpec` member, `shortLabel`, on the
  `memberGroups` precedent: the field tells the editor to draw it, the editor
  stores it under `short` on the item, and the editor learns nothing about which
  component it is drawing. Its description is one footnote under the list, on
  the 2026-11-18 amendment's precedent, not a line on every row. It is declared
  on Card set `entries`, Table `rows`, Track `rows`, Roster `stats` and `rows`,
  and Passport `fields`. It is **not** declared on a Card's `options`, which are
  not published names.

**The unlabelled case.** An author who never types a short gets full labels on
every tight surface. That is the smallest version's reading: correct and
longer. An entry with no display text reads its key, which is the only name
there is. A blank or all-space `short` is absent: it is trimmed on read and the
editor removes the key on commit. A `short` longer than the full label is
accepted without comment, because comparing the two would be code reading a
label.

### Fixed words for names a component builds (`src/en.ts`)

Each is a full label with no short, so the short width falls back to it:

| Name | Component | Full label |
| --- | --- | --- |
| `<id>.max` | Pool | *Maximum* |
| `<id>.temp` | Pool | *Temporary* |
| `<id>.count` | Track | *Length* |
| `<id>.active` | Stat block | *Active* |
| `<id>.uses` | Stat block | *Uses left* |
| `<id>.<nameKey>` | Passport | *Name* |

Column totals (`inventory.Weight`) supply no label and read their key.

### The 5e starter and the harness

The owner's example is *STR +4 · DEX +0 · CON +3* / *AC 11* / *Perception at
least +3*. The **label** half of it is what the harness shows after this
feature. The **sign** half is not, by `UI.md` §9's standing ruling that a set
and an at least are unsigned (*sets to 4*, *at least 3*), which
`character-forms.md` already records as a decision rather than a shortfall.

- `src/starters/5e.json` gains `short` on: `abilities` entries
  (*STR*…*CHA*), `saves` rows (*STR*…*CHA*), `saves` itself (*Saves*),
  `armour_class` (*AC*) and `hp` (*HP*). Nothing else. *Perception* and the
  other skills are already short enough as full labels. This changes only new
  layouts made from the starter. An existing layout is the user's file and is
  not touched.
- `harness/samples.ts`' forms samples gain the same shorts on their
  `abilities`, `saves` and `armour_class`, so `sheet-forms-*` shows the example.
  The group-target samples get **no** shorts, so `group-target-reach-*` shows
  the full-width breadcrumb, which is the surface's width anyway.

### Empty and error states

- No `short` anywhere: full labels, as in the smallest version.
- A layout whose `short` is not a string: the layout parser refuses it as it
  refuses a non-string `label`, with the same sentence shape naming the key.
- A form part that names nothing (a stray) has no `targetName`, and its line
  reads the part as written, as today.

## Config fields

The component-level field is shared and editor-owned, like **Label**, so no
component declares it. It joins the list `contract.test.ts` refuses in a
component's `configFields` (`PATTERNS.md` §8's "never redeclare"). The item
field is declared through `shortLabel` on the list fields named above.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `short` (component) | text | Short label | A shorter name for tight spaces, such as a form's change list. Empty uses the label. Formulas and notes never read it. |
| `short` (entry or row, via `shortLabel`) | text | Short | The list's one footnote: Short is what tight spaces call each row (each entry, on an entries list), such as STR for Strength. Empty uses the full name. Formulas and notes never read it. On a Card set's entries it adds: The card shows the key. |

The component description carries no example because `obsidianmd/ui/sentence-case`
reads it at `setDesc` and lowercases an acronym (*such as ac for armor class*),
and quoting it does not help. The footnote is composed with its noun, so the lint
does not read it and review holds it (`docs/PATTERNS.md` §1); it opens with
**Short** because a footnote under a list names the field it is about. Its
`shortLabel` declaration carries no words for the shared sentence, which is the
editor's one copy rather than six declared copies; a list may add one sentence
of its own (`shortLabel: { also }`), which only Card set does, since only its
card draws the key (owner's decision at the land stop).

## Data and file model

- **Layout file.** It gains an optional `short` on a component beside `label`,
  and on each item of the lists above. Both are omitted while absent
  (`PATTERNS.md` §8), so every existing layout parses and serialises unchanged.
  Copy and paste, import and export carry `short` as ordinary config.
- **Character notes.** Untouched. No section, fence key or row claim reads
  `short` or any label this feature introduces. A Table row's `label` keeps its
  existing double role (display text and the claim on a note row). This feature
  reads it as display text and changes nothing about the claim.
- **Round trip (Constraint 3).** No note is written by this feature.
- **Data safety (Constraint 4).** No data path changes. Renaming a `short`
  migrates nothing because nothing keys on it.

## Acceptance criteria

Model and contract:

- [x] `PublishedEntry`, `GroupMember`, `GroupReach.missed`, `ModifierOutcome`
      (`targetName`) and the state, buffer and choice targets carry a
      `NameLabel`, built only in `publishedEntries` and `groupIndex`.
- [x] `formula/name-label.ts` is the only module that turns a `NameLabel` into
      text. It imports nothing from `obsidian` (Constraint 5).
- [x] A test named for it rewrites every display text that is not storage
      (every `short`, set, cleared and made identical across components; Card
      set entry `name`; Track row `name`; Passport field `name`; Roster stat
      `name`) on the 5e starter and the forms sample. It asserts that these are
      unchanged: `publishedTargets`' names in order, `acceptingTargets`,
      `markedTargets`, `noteTargets`, every group's member names, the state,
      buffer and choice targets' names, the definitions report's problems, and
      the bear's resolved values. Table and Roster row `label` are excluded and
      the test says why: a row label claims a note row.
- [x] A source check fails on `split`, `indexOf`, `lastIndexOf`, `includes`,
      `startsWith` or `endsWith` called with `' · '` anywhere under `src/`
      outside tests [checked]. `compactChange` and `setsOneNumber` no longer
      contain either call.
- [x] Each component-built name carries its `src/en.ts` word (table above),
      checked per component in its own test file. A column total's label is
      its key.
- [x] `contract.test.ts` refuses a component declaring `short` in
      `configFields`, and refuses `shortLabel` on a list field kind other than
      `entries`, `rows` or `track-rows`.
- [x] A layout with no `short` parses and serialises byte-identically before
      and after (the starter and every harness layout). A non-string `short` is
      refused by the layout parser with a sentence naming the key.

Surfaces (checked by test name and by PNG):

- [x] `sheet-forms-light` and `sheet-forms-dark`: the bear's vitals strip reads
      *AC* over *11*. The changes read *Abilities: STR sets to 4 · DEX sets to
      0 · CON sets to 3*, *Skills: Perception at least 3 (already higher) ·
      Stealth at least 3* and *Saves: CON sets to 5*, each lead and its colon
      muted.
- [x] A form test: a brief's change line reads the leads too, *… CON sets to 3
      · … · Saves: CON sets to 5*.
- [x] `sheet-forms-library-closed`: the bear's summary reads *… · AC 11*.
- [x] A form test: with the shorts removed, the same lines read the full label
      over *11* (*Armour class* in the sample's spelling) and *Saving throws: Constitution sets to 5*. With every change
      on one component, the line has no lead.
- [x] A test in `formula/name-label.test.ts` and one per surface that asks for
      short (the change list's lead and items, the vitals tile caption, the
      closed form's summary): given a name with no `short` on its component or
      its entry, each draws exactly its full label, byte for byte, and with no
      label either it draws the key. A second assertion runs on the invariance
      fixture with every `short` cleared: every name's short-width text equals
      its full-width text, for the component part and the entry part, so no
      code path derives a short from a label or a key.
- [x] A form test: an item drawn at short width carries `title` with its full
      text (*Saving throws · Constitution sets to 5*). An item with no `short`
      carries none.
- [x] A form test: two components sharing one label draw two lines.
- [x] A form test: a Pool's `+= 5` and `.max += 10` from one form draw *HP +5*
      and *HP: Maximum +10* as two lines. A grant reads *HP: Temporary grants
      10* with no branch on the grant, alone on its field as beside others,
      since its entry's text is the Pool's own word.
- [x] `group-target-reach-light` and `group-target-reach-dark`: the reach line
      reads *Not Saving throws · Strength*, or that sample's own labels, never
      a key.
- [x] A test on `modifier-groups-field.ts`: the count's `title` lists full
      breadcrumbs (*Saving throws · Strength, …*). `group-target-editor-*`
      PNGs show the count unchanged.
- [x] The **Value** select on the sheet's form and in the editor's **Changes**
      shows full breadcrumbs (*Abilities · Strength*), and choosing one still
      stores the name.
- [x] The form glyph's accessible name uses full breadcrumbs.
- [x] Editor: **Short label** appears under **Label** for a Card, a Pool, a
      Card set and a Table, and not for a Group, a Rich text or an Image. A
      **Short** input appears on each Card set entry's and each Table row's
      detail line, with one footnote under the list. A shot of the editor with
      the abilities Card set selected shows both.
- [x] `docs/BACKLOG.md` § UI no longer holds either row. No reference to "row
      146" remains in `src/` or `docs/` outside a shipped doc's history.

## Commit boundaries

1. `feat: Carry a published name's label as parts from the walk`. `NameLabel`,
   `formula/name-label.ts`, `ScopeEntry.label`/`.short`,
   `UnnamedMember.short`, `ModifierTargetSource.short`. Each publishing
   component supplies its entry text and its `src/en.ts` words. Parts on
   `PublishedEntry`, `GroupMember`, `GroupReach.missed`, the state, buffer and
   choice targets, and `ModifierOutcome.targetName`. The invariance test.
   Surfaces unchanged except where the walk's full text now reads display text
   in place of a key.
2. `fix: Name a form's changes and a group's members by their labels`.
   `compactChange` and `setsOneNumber` read parts, lines group by component id,
   the muted lead, short width on the change list and the vitals strip, `title`
   on short items. The reach line and the editor count title. The `' · '`
   source check. The `types.ts` comment's stale reference.
3. `feat: Let an author give a published name a short label`. The shared
   `short` on `ComponentConfig` and its parse check, the editor's **Short
   label** field, `ConfigFieldSpec.shortLabel` and its detail-line input,
   declared on the six lists. Contract checks.
4. `feat: Give the 5e starter and the forms sample short labels`.
   `src/starters/5e.json` and `harness/samples.ts`, plus the shots.
5. `docs: Record published-name labels`. `docs/SPEC.md` §4.1 (below) and the
   new §13 entry. `docs/UI.md` §9 gains "A published name has two widths, and
   the surface picks one", carrying the width table's rule. In
   `docs/features/character-forms.md`, item 4's "published names have no labels
   of their own yet" and "Where it falls short" paragraph are amended to point
   here. In `docs/BACKLOG.md`, both § UI rows are removed. The
   `table-row-modifier-target.md` line citing row 146 is marked as closed here.

### What SPEC §4.1 gains (written at land)

- In the shared-property table, after `label`: `short` | Layout, optional |
  *What a tight surface calls the component, beside `label`. Display text only:
  nothing keys on it, no formula reads it, and it is never derived from the
  label. Absent, every surface uses the label.*
- In `scopeValues`' paragraph, one sentence: *Each entry may also carry the
  text a reader knows it by, `label` and an optional `short`, from the
  component's own configuration. Where there is none the key is shown. A label
  is display text and never identity: no name, target, group or search
  resolves through one, and a surface composes it only through
  `formula/name-label.ts`.*

### The new §13 entry (written now as open; never resolved by this feature)

- **Whether a published name may carry an author-written label of its own,
  overriding the composed one.** Composition here is structural (*Saving throws
  · Strength*), and a reader may think *Strength save*. Systems disagree on
  word order (*Wisdom (Perception)* in D&D 2024, *Fighting (Agility)* in Savage
  Worlds), which is why there are no phrase templates. A per-name override is
  the escape hatch that would not need one. It is deferred because no layout
  yet misreads, and an override is a third string per name for authors to keep
  in step. **Trigger:** a real layout whose breadcrumb misreads at a surface
  this plugin draws.

## Deliberately not doing

- **No storage, formula or id change.** Keys, ids, group spellings and section
  headings are untouched, and no label becomes something a formula, target,
  group or search matches on.
- **No modifier relabelling its target.** Dropped by §13
  (`docs/features/modifier-notes.md`) and not reopened.
- **No localisation.** The `src/en.ts` words are the one language.
- **No derived short form**, no truncation, no initials, no "use the key as the
  short form". A Card set's key is already drawn as the card's abbreviation,
  and the card face keeps drawing the key. That is the card's existing face,
  not a surface asking for short width: no surface in this spec reads the key
  as a short form, and a Card set entry with no `short` draws its full `name`
  wherever short is asked for. Moving the card face onto `short` is a separate
  question.
- **No label-collision detection or warning.** Two entries may share text.
  Detecting it would be code comparing labels.
- **The formula suggester keeps showing names and component labels as it
  does** (`formula-name-suggestions.md`). It is an author surface that works in
  names.
- **Groups gain no short form.** A group part's line keeps its groups' labels.
- **Promoted-field picker labels** keep appending their suffix word to the
  walk's full text. They change only in that the entry part now reads display
  text.
- **The per-name override**, deferred to the §13 entry above.
- **Every other § UI backlog row.**
