# Sheetsmith - Spec

Feature specification. Describes what the plugin does, not how it is built.

## 1. Purpose

**Sheetsmith** is an Obsidian plugin for designing and using TTRPG character sheets, tied to no game system.

The user designs a sheet by placing components on a grid and defining the formulas that connect them, then saves it as a named layout. A character is an ordinary markdown note that names a layout and holds only values. One layout serves many characters.

The plugin knows arithmetic and nothing about any game. Every rule specific to a system lives in the layout the user builds.

## 2. Core concepts

**Layout.** A reusable sheet design: which components appear, where they sit, their configuration and formulas, its own function library, and its reset triggers. Stored as a file in the vault, so it syncs, versions, and can be shared. Examples: "DnD 5e Standard", "DnD 5e Caster", "Pathfinder 2e", "Call of Cthulhu".

**Character.** A normal `.md` note naming a layout in frontmatter. Holds values only, never structure.

**Component.** A placeable block on a layout. Deliberately generic (Stat, Pool, Table) rather than system-specific (AbilityScore, SpellSlots).

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

### 3.2 Layout file

Stored in a configurable vault folder. Contains the component list with grid positions and sizes, per-component configuration, the function library, reset trigger definitions, and the promoted field list. Contains no per-character data.

Layouts export and import as single files, so a layout can be shared or published.

## 4. Components

| Component | Purpose | Example use |
|---|---|---|
| **Stat** | A value with an optional derived display beside it | Ability scores, AC, Speed |
| **Field** | Labelled text, number, or dropdown | Name, Race, Alignment |
| **Pool** | Current / max resource with adjust controls | HP, spell slots, rage, ki, sanity |
| **Track** | Row of boxes or pips | Death saves, exhaustion, stress, clocks |
| **Toggle** | Single boolean | Inspiration, equipped, trained |
| **Table** | Repeatable typed records, wikilink-aware | Skills, inventory, attacks, spells, features |
| **Computed** | Read-only formula output | Passive Perception, spell save DC |
| **Rich text** | Free markdown block | Backstory, notes, appearance |
| **Group** | Titled container holding other components | Visual sectioning |
| **Image** | Portrait or symbol | Character art |

Detail on the ones that carry weight:

**Stat.** Configured with a label and an optional derived formula. Stores one value. In sheet view the value is editable and the derived part updates live. Covers "DEX 16 (+3)" without the plugin knowing what a modifier is.

**Pool.** Configured with a label, a max that may be a literal or a formula, an optional temp track, and an optional reset trigger. Stores current and temp. In sheet view it offers increment, decrement, and direct entry, so damage and healing are one action.

**Track.** Configured with a label, a box count that may be a literal or a formula, and an optional reset trigger. Stores how many boxes are filled.

**Table.** The most important component, because it absorbs several system-specific concepts into one generic block. Configured with a column list, each column typed as text, number, toggle, link, or computed. A computed column has a per-row formula that can reference the row's own cells and any value elsewhere on the sheet.

Tables come in two row modes, and the distinction matters:

- **Fixed rows.** The layout defines the rows, the character only fills in cells. Correct for skills and saving throws, where every character in the system has the same list.
- **Open rows.** The character adds, removes, and reorders rows freely. Correct for inventory, attacks, spells, and features.

Link-typed cells render as real wikilinks and navigate on click.

**Computed.** Read-only display of a formula result. Hovering reveals the formula.

## 5. Formulas

- **Any numeric field configured in a layout accepts a literal or a formula.** A Pool's max, a Track's box count, a Stat's derived display, a Table's computed column. There is no separate "computed field" concept to learn.
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
- The sheet reflows to a single column on narrow screens.
- If the named layout is missing, show a clear message and offer to pick another rather than failing silently.

## 9. Promoted fields

Optional, off by default.

A layout may mark specific fields to be mirrored into the character's frontmatter, making them queryable by Bases and Dataview. The use case is a party table listing every character's level and current HP side by side.

Nothing is promoted unless explicitly chosen, so a user who does not want this keeps frontmatter at a single key.

## 10. Data safety

Character data is the user's, and a layout edit must never destroy it.

- **Removing a component from a layout does not delete character data.** The section remains in the note and stops rendering.
- **Unmapped data is preserved** and surfaced as a notice, never silently discarded.
- **Renaming a component** offers to migrate matching sections in existing characters.
- **A malformed section shows an error on that component only.** The rest of the sheet renders and stays editable.
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

The order is deliberate. The file model is the hardest thing to change once characters exist, so it gets proven first with hand-written files. The layout editor is the largest interface investment and comes only once the thing it edits is known to work.

## 13. Open questions

- Default vault folder for layout files.
- Whether body sections are identified by heading text or by a stable hidden id. Heading text is readable but breaks when a component is renamed.
- Whether Group components may nest, or only hold leaf components.
- Whether a character may override a single formula locally without forking the whole layout.
