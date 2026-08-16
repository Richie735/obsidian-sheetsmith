# Sheetsmith - Spec

Feature specification. Describes what the plugin does, not how it is built.

## 1. Purpose

**Sheetsmith** is an Obsidian plugin for designing and using TTRPG character sheets, tied to no game system.

The user designs a sheet by placing components on a grid and defining the formulas that connect them, then saves it as a named layout. A character is an ordinary markdown note that names a layout and holds only values. One layout serves many characters.

The plugin knows arithmetic and nothing about any game. Every rule specific to a system lives in the layout the user builds.

## 2. Core concepts

**Layout.** A reusable sheet design: which components appear, where they sit, their configuration and formulas, its own function library, and its reset triggers. Stored as a file in the vault, so it syncs, versions, and can be shared. Examples: "DnD 5e Standard", "DnD 5e Caster", "Pathfinder 2e", "Call of Cthulhu".

**Character.** A normal `.md` note naming a layout in frontmatter. Holds values only, never structure.

**Component.** A placeable block on a layout. Deliberately generic (Stat group, Pool, Table) rather than system-specific (AbilityScore, SpellSlots).

**Formula.** An expression on any numeric field, referencing other fields and layout-defined functions.

**Reset trigger.** A layout-defined named event (Long Rest, Downtime) that restores bound components in one click.

## 3. File model

### 3.1 Character note

````markdown
---
sheet-layout: DnD 5e Caster
---

## Abilities
```sheet
STR: 8
DEX: 16
WIS: 12
```

## HP
```sheet
current: 22
max: 31
temp: 0
```

## Inventory

| Item | Qty | Weight | Equipped |
|---|---|---|---|
| [[Bag of Holding]] | 1 | 15 | yes |
| [[Sunblade]] | 1 | 3 | yes |

## Backstory

Grew up in [[Neverwinter]] under [[Sildar Hallwinter]].
````

Rules:

- **Frontmatter holds one key by default**, `sheet-layout`. Character data does not go in frontmatter, so it never pollutes the vault's property namespace or appears in autocomplete on unrelated notes.
- **Each component gets its own `##` section** in the body. Adding a component adds a section. The format stays uniform and expandable.
- **Format follows the component.** Components holding only numbers and flags store their data in a fenced block, which gives unambiguous boundaries and real types. Components that can hold wikilinks store their data as plain markdown, because Obsidian does not index links inside code blocks.
- **The note stays readable and hand-editable** as ordinary markdown.
- **Single-value components store their value under the key `value`** in their fenced block, so hand-editing any of them looks the same.

### 3.2 Layout file

Stored in a configurable vault folder, `Sheetsmith layouts` by default. Contains the component list with grid positions and sizes, per-component configuration, the function library, reset trigger definitions, and the promoted field list. Contains no per-character data.

Layouts export and import as single files, so a layout can be shared or published.

## 4. Components

### 4.1 Shared contract

Every component carries the same core properties, whatever its type. Settling this before building the first component is what stops the tenth from forcing a rewrite of the first.

| Property | Set in | Purpose |
|---|---|---|
| `id` | Layout | Stable identity that survives label renames. What formulas reference. |
| `type` | Layout | Which component this is. |
| `label` | Layout | Display name, and the section heading in the note body. |
| `position` | Layout | Grid column, row, width, height. |
| `storage` | Fixed by type | `fenced` or `markdown`. A property of the component type, never a user choice. |
| `reset` | Layout, optional | Which named trigger this component responds to, and what it resets to. Only for components that hold state. |

Every component implements five things and nothing more:

- **`read`** — parse its section of the note body into data.
- **`write`** — serialise data back into a section, byte-identical when nothing changed.
- **`render`** — display itself, given its data, the resolved values from the formula engine, a resolver for evaluating formula fields against internal scopes (one ability, a table row), and a callback for reporting user edits. The sheet view owns writing reported edits back to the note; components never touch the file.
- **`formulaFields`** — declare which of its config fields accept an expression rather than a literal.
- **`configFields`** — declare its component-specific config fields (key, input kind, label, optional group for subheadings, optional visibility condition on another field's value) so the layout editor can render a configuration form without knowing the component's type. Shared fields (label, position) are the editor's own business.

Adding a component means implementing exactly those five. Nothing else in the system needs to know the component exists.

### 4.2 Catalog

For each component: what the layout configures, what the character note stores, what it does in sheet view, and which config fields accept formulas.

**Stat** — one named value on a single card, with an optional derived display and a free-text note line. Covers armour class, initiative, speed, passive perception: the standalone numbers a sheet is littered with.

- *Config:* `label`, `key` (entry name for the value in the note; defaults to `value`), `derived` (formula reading the stored value as `value`), `notePlaceholder`, `hideLabel`, `hideValue` (meaningful only with a `derived`), `hideNote`, `signed`
- *Data:* `fenced`, the value under `key` and the note line under `note`
- *Sheet view:* the label sits above the value, the note line below it, on the shared card rules below. The note, being prose rather than a number, is the one field the arrow keys do not step. The card takes a width ceiling and centres horizontally in its cell, so a wide component does not become an expanse of clickable card around a two-digit number. Vertically it holds the top edge and pins the note to the bottom, so cards sharing a grid row line their labels up with each other and their notes with each other, even when one of them carries a pill the others do not.
- *Formula fields:* `derived`

**The key is storage, and only storage.** It names the value's entry so the file reads `AC: 15` while the card reads "Armour class 15" — it is not what formulas reference. That is the component's `id` (§5), so a formula says `armour_class`, and neither the card nor the arithmetic has to know how the note happens to be spelled. Hiding the key from the card is the one thing that separates a Stat from a one-attribute Stat group, where the key *is* the card's abbreviation. `note` is reserved as an entry key, and a key holding a colon cannot be stored; either shows a configuration error on that component alone rather than writing a block that will not parse. Entries under any other key are preserved on write, and renaming the key does not move the stored value — the old entry stays in the note under the old key, as with a Stat group attribute.

**Stat group** — an ordered set of named attributes rendered as a strip of stat cards. Covers the six D&D abilities, Call of Cthulhu characteristics; a single-attribute group is a lone stat card.

- *Config:* `label`, `attributes[]` (each a `key` plus optional full `name`, in display order), `derived` (one formula computed per attribute, where `value` is that attribute's value), `direction` (`horizontal` | `vertical`), `sizing` (`fill` | `fixed`; fixed sizes cards at one per grid unit of the component's width, floored at a minimum), `align` (`start` | `center` | `end`, shown and meaningful only with fixed sizing; legacy layouts that carried sizing inside `align` still read correctly), `hideLabel`, `labelAlign` (`start` | `center` | `end`), `hideValue` (meaningful only with a `derived`), `signed`
- *Data:* `fenced`, one entry per attribute key — the `## Abilities` example in §3.1
- *Sheet view:* the group's name renders above its cards unless `hideLabel`, aligned to the start of the component unless `labelAlign` says otherwise. Each attribute edits inline. The derived part recomputes live on every keystroke, but the note is written only on commit — leaving the field or pressing Enter. Escape abandons the draft and restores the stored value. Arrow keys step a numeric value like typing: live display, committed on blur. An empty value shows "—" everywhere; "?" is reserved for a value that is present but did not resolve. Covers "DEX 16 (+3)" without the plugin knowing what a modifier is. Until the full engine lands (M3), `derived` may reference the attribute's own `value` and the standard helpers.
- *Formula fields:* `derived`

Entries in the note that no attribute maps to are preserved on write, never dropped. Renaming an attribute key does not move its stored value: the old entry stays in the note under the old key, and migrating it is part of the §10 rename story.

**Card interaction, shared by Stat and Stat group.** Both render through one card, so both behave identically under the hand.

- **Feedback is continuous, persistence is discrete.** The derived display recomputes on every keystroke; the file is written only on commit — leaving the field, or pressing Enter.
- **Enter commits in place** and moves to the next field on the card if there is one. It does not drop focus out of the sheet: committing and abandoning your position in the document are different intentions.
- **Escape abandons the draft**, restores the stored value, and announces the restore. An undo nobody can perceive does not read as one.
- **Arrow keys step a numeric value** like typing: live display, committed on blur. Shift steps by ten, for the stats that move in tens. An empty field steps from zero, because pressing up on a fresh card is the obvious first gesture and should not be a dead key. Text that is not a number keeps the arrows as caret movement.
- **An empty value shows "—" everywhere.** "?" is reserved for a value that is present but did not resolve, and it waits out a short delay before appearing: a draft on its way to being valid ("-" before "-1") is not wrong yet, and must not be told it is.
- **The whole card is the hit target**, and hovers and presses as one, so the generous target is visible rather than merely present. A click routes to the field nearest it — the padding under the note belongs to the note, not to the number at the top. Because the card is a hover target, a truncated label reveals itself on hover only when it is actually truncated; a tooltip repeating a label already fully legible is noise fired at every pass.

A single-attribute Stat group and a **Stat** are not the same component, which is why both exist. The group shows its key, sizes cards against the grid, and holds one formula that runs per attribute; the Stat hides its key, fills its cell, and carries a note line. Reach for the group when the cards belong to a set and share arithmetic, and for the Stat when the number stands alone.

**Field** — labelled text, number, or dropdown. Covers Name, Race, Alignment.

- *Config:* `label`, `input` (`text` | `number` | `select`), `options` when `select`
- *Data:* `fenced`, a single value
- *Sheet view:* inline edit appropriate to the input type
- *Formula fields:* none

**Pool** — current and max resource with adjust controls. Covers HP, spell slots, rage, ki, sanity.

- *Config:* `label`, `max`, `hasTemp`, `reset`
- *Data:* `fenced`, `current` and optionally `temp`
- *Sheet view:* increment, decrement, and direct entry, so damage and healing are one action
- *Formula fields:* `max`, `reset.to`

**Track** — a row of boxes or pips. Covers death saves, exhaustion, stress, clocks.

- *Config:* `label`, `count`, `reset`
- *Data:* `fenced`, how many boxes are filled
- *Sheet view:* click a box to fill or clear it
- *Formula fields:* `count`, `reset.to`

**Toggle** — a single boolean. Covers inspiration, equipped, trained.

- *Config:* `label`, `reset`
- *Data:* `fenced`, a boolean
- *Sheet view:* click to flip
- *Formula fields:* `reset.to`

**Table** — repeatable typed records, wikilink-aware. Covers skills, inventory, attacks, spells, features.

- *Config:* `label`, `rowMode`, `rows` (when fixed), `columns[]`
- *Data:* `markdown` table, one row per record
- *Sheet view:* cells editable, link cells navigate on click, computed cells read-only
- *Formula fields:* each column's `formula`

The most important component, because it absorbs several system-specific concepts into one generic block. Each column is typed as `text`, `number`, `toggle`, `link`, or `computed`. A computed column's formula may reference the row's own cells by column name, and anything else on the sheet by component id.

Two row modes, and the distinction carries real weight:

- **Fixed rows.** The layout defines the rows, the character only fills in cells. Correct for skills and saving throws, where every character in the system has the same list and retyping it per character would be absurd.
- **Open rows.** The character adds, removes, and reorders rows freely. Correct for inventory, attacks, spells, and features.

Table is where the design risk concentrates. It is the only component using the markdown storage path, the only one holding wikilinks, and the only one with per-row formula scope. If the shared contract in 4.1 is wrong, Table is what reveals it.

**Computed** — read-only formula output. Covers Passive Perception, spell save DC.

- *Config:* `label`, `value`
- *Data:* none, entirely derived
- *Sheet view:* read-only, hovering reveals the formula
- *Formula fields:* `value`

**Rich text** — a free markdown block. Covers backstory, notes, appearance.

- *Config:* `label`
- *Data:* `markdown`, free text
- *Sheet view:* editable, renders links and embeds
- *Formula fields:* none

**Group** — a titled container holding other components. Covers visual sectioning.

- *Config:* `title`, `collapsible`, `children`
- *Data:* none
- *Sheet view:* visual container, optionally collapsible
- *Formula fields:* none

**Image** — a portrait or symbol.

- *Config:* `label`
- *Data:* `fenced`, a path or wikilink
- *Sheet view:* click to change
- *Formula fields:* none

### 4.3 Layout schema

The layout schema is not designed separately. It is the union of the shared contract and each component's configuration, plus three layout-level pieces:

- **Function library.** The layout's own named functions.
- **Reset triggers.** The layout's own named events.
- **Promoted fields.** Which values, if any, mirror into frontmatter.

A layout is therefore metadata, a function library, a trigger list, a promoted field list, and an ordered list of component configurations. Every time a component is added to the catalog, the schema grows by exactly that component's config block and nothing else.

## 5. Formulas

- **Any numeric field configured in a layout accepts a literal or a formula.** A Pool's max, a Track's box count, an ability's derived display, a Table's computed column. There is no separate "computed field" concept to learn.
- Formulas reference other components' values by name.
- **Each layout defines its own function library.** This is what makes the plugin system-agnostic: no game's arithmetic is built in.
- Standard helpers are available: floor, ceil, round, min, max, abs, and a conditional.
- Computed values are read-only in sheet view.
- Circular references are caught when the layout is saved, not at render time.
- A formula referencing something missing shows an error on that component alone. The rest of the sheet keeps working.

Worked examples, both drawn from the original brief:

A 5e layout defines its own functions.

```
mod(score) = floor((score - 10) / 2)
prof       = ceil(level / 4) + 1
```

A skill row's computed total, where `trained` and `bonus` are cells on the same row.

```
if(trained, prof, 0) + mod(Abilities.DEX) + bonus
```

A feature's uses per day, expressed as a Pool max.

```
mod(Abilities.WIS)
```

A Call of Cthulhu layout would define entirely different functions (`half`, `fifth`) and the plugin would not notice the difference.

## 6. Reset triggers

- Each layout defines its own named triggers. A 5e layout declares Short Rest and Long Rest. A Blades layout declares Downtime.
- Any Pool, Track, or Toggle can bind to a trigger.
- Per component, the reset action is one of: restore to max, set to zero, or set to a formula result.
- Sheet view shows one button per trigger.
- Applying a trigger confirms first and is undoable.

This is the only place the sheet performs an action rather than holding values.

## 7. Layout editor

Until the grid canvas below ships (M4), an interim form-based editor lives in the plugin settings: create layouts, add and remove components, and edit each component's shared and declared config fields. It renders forms from `configFields`, so it grows automatically as components are added. The M4 editor is a dedicated workspace view, not a settings tab — an authoring tool needs width, undo scope, and a sheet beside it — and once it ships, settings keep only preferences and a button that opens the editor.

The full editor:

- **Manage layouts**: create, duplicate, rename, delete, import, export.
- **Grid canvas**: a responsive grid. Drag components in from a palette, move them, resize by grid units. Grid rather than free positioning, so sheets reflow to a single column on a phone instead of breaking.
- **Configuration panel**: select a component, configure it in a side panel.
- **Function library editor**: define the layout's own functions.
- **Trigger editor**: define named reset triggers.
- **Promoted fields**: choose which values, if any, mirror into frontmatter.
- **Preview**: render the layout with sample values while editing.

Layouts are independent of one another. "DnD 5e Standard" and "DnD 5e Caster" are separate files, duplicated and diverged rather than inherited.

## 8. Sheet view

- Notes carrying `sheet-layout` open in sheet view by default.
- A command and a toggle switch between sheet view and plain markdown view, in the Excalidraw manner.
- Any stored value is editable directly in its component. Changes write back to the note body.
- Computed values are read-only.
- Wikilinks are clickable and navigate. Hover preview works, backlinks resolve, and renaming a linked note updates the sheet, all because links live in plain markdown rather than inside a code block.
- Reset trigger buttons are available.
- The sheet reflows to a single column on narrow panes, in grid reading order — top to bottom, then left to right — regardless of the order components sit in the layout file. That order also drives tab order in the normal grid.
- If the named layout is missing, show a clear message and offer to pick another rather than failing silently.

## 9. Promoted fields

Optional, off by default.

A layout may mark specific fields to be mirrored into the character's frontmatter, making them queryable by Bases and Dataview. The use case is a party table listing every character's level and current HP side by side.

Nothing is promoted unless explicitly chosen, so a user who does not want this keeps frontmatter at a single key.

## 10. Data safety

Character data is the user's, and a layout edit must never destroy it.

- **Removing a component from a layout does not delete character data.** The section remains in the note and stops rendering.
- **Unmapped data is preserved**, never discarded. A section the layout does not map simply does not render; the sheet stays quiet about it rather than reporting it as a problem, since a note carrying sections beyond its layout is ordinary, not an error.
- **Renaming a component** offers to migrate matching sections in existing characters.
- **A malformed section shows an error on that component only.** The rest of the sheet renders and stays editable.
- **A section without a data block is empty, not malformed.** It renders editable exactly like a missing section, and the first edit writes the data block into the section, preserving any prose already there.
- **Hand edits made in markdown view** are picked up when sheet view reopens.

## 11. Non-goals

Explicitly out of scope for v1, recorded so they do not creep back in:

- **Dice rolling.** Decided out. Delegate to an existing dice plugin if it is ever wanted.
- **Bundled rules content.** No spell lists, no item databases, no SRD import.
- **Level-up automation.** Requires a content database, which requires the point above.
- **Layout inheritance.** Layouts are independent files.
- **Importing from D&D Beyond** or other external services.
- **Shared or real-time multiplayer sheets.**

## 12. Build order

| Milestone | Delivers |
|---|---|
| **M1 Render** | Read a hand-written layout file and character note, render a read-only sheet |
| **M2 Edit** | Edit values in sheet view, write back to the body, round-trip safely |
| **M3 Formulas** | Expression evaluation, layout function library, computed values |
| **M4 Editor** | Grid canvas, component palette, configuration panel |
| **M5 Finish** | Reset triggers, promoted fields, layout export and import, mobile reflow, error states |

The order is deliberate. The file model is the hardest thing to change once characters exist, so it gets proven first. The layout editor is the largest interface investment and comes only once the thing it edits is known to work.

Within the milestones, work proceeds **component by component rather than layer by layer**. The shared contract in 4.1 comes first, then each component is taken all the way through read, write, and render before the next one starts. The layout schema assembles itself as components are added, rather than being designed up front against requirements not yet met.

Component order, chosen by what each one forces you to solve:

| # | Component | Forces you to solve |
|---|---|---|
| 1 | **Stat** | The shared contract, the config and data split, fenced storage, read-only render |
| 2 | **Stat group** | Multi-entry fenced storage, per-scope formula evaluation — the row scope Table needs, proven on a simpler component |
| 3 | **Pool** | Editing interaction, a formula-capable config field, reset triggers |
| 4 | **Table** | The markdown storage path, wikilinks, fixed versus open rows, per-row formula scope (mechanism proven by Stat group) |

Stat group (built as "Abilities") was not in the original order; it jumped the queue on demand once Stat worked, and looked at the time like a replacement for it, so Stat was dropped and then rebuilt on top of the group's card once the standalone numbers turned out to want a component of their own. The detour paid for itself: it forced the render contract to grow a per-scope field resolver, which is the same mechanism Table's computed columns need per row, discovered while the codebase was small, and it left a shared card module for the Stat to render through.

The remaining seven are variations on problems those solve. Field and Toggle are simpler single-value cards, Track is a simpler Pool, Computed is a value-less card fed entirely by a formula, and Rich text, Group, and Image barely touch the formula system.

Table's contract is worth writing early even though it is built fourth, because it is the component most likely to expose a flaw in the shared contract, and that is cheapest to discover while few components depend on it.

## 13. Open questions

- Whether Group components may nest, or only hold leaf components.
- Whether a character may override a single formula locally without forking the whole layout.

Resolved: **body sections are keyed by the component's `label`**, which doubles as its heading, keeping the note readable. The `id` is the stable identity formulas reference, so renaming a label breaks no formulas, and section 10 covers migrating existing characters when it happens.

Resolved: **layout files live in `Sheetsmith layouts` by default.** The folder is configurable in settings; an empty or whitespace-only value falls back to the default rather than silently pointing at the vault root.
