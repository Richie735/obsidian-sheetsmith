# Sheetsmith - Spec

Feature specification. Describes what the plugin does, not how it is built.

## 1. Purpose

**Sheetsmith** is an Obsidian plugin for designing and using TTRPG character sheets, tied to no game system.

The user designs a sheet by placing components on a grid and defining the formulas that connect them, then saves it as a named layout. A character is an ordinary markdown note that names a layout and holds only values. One layout serves many characters.

The plugin knows arithmetic and nothing about any game. Every rule specific to a system lives in the layout the user builds.

## 2. Core concepts

**Layout.** A reusable sheet design: which components appear, where they sit, their configuration and formulas, its own function library, and its reset triggers. Stored as a file in the vault, so it syncs, versions, and can be shared. Examples: "DnD 5e Standard", "DnD 5e Caster", "Pathfinder 2e", "Call of Cthulhu".

**Character.** A normal `.md` note naming a layout in frontmatter. Holds values only, never structure.

**Component.** A placeable block on a layout. Deliberately generic in *capability* (Stat group, Pool) rather than system-specific (AbilityScore, SpellSlots): what a component can do is never tied to one game's rules, and every rule lives in the layout.

A component's *name* is a separate matter, settled per component. **Skill card** is named for the job it was built for even though it implements a generic one — named rows, typed columns, per-row formula scope — because the name a user picks a block by should describe what they are about to build, not the shape of its data model. The cost is real and worth stating: the same block is what §4.2 has covering inventory, attacks, and spells, and its name will read oddly there. Naming those is an open question (§13), not something the file model forces.

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
| `reset` | Layout, optional | Which named triggers this component responds to, and what each one does to it (§6). A list, because the triggers a system declares overlap. Only for components that hold state. |

Every component implements five things and nothing more:

- **`read`** — parse its section of the note body into data.
- **`write`** — serialise data back into a section, byte-identical when nothing changed.
- **`render`** — display itself, given its data, the resolved values from the formula engine, a resolver for evaluating formula fields against internal scopes (one ability, a table row), and a callback for reporting user edits. The sheet view owns writing reported edits back to the note; components never touch the file.
- **`formulaFields`** — declare which of its config fields accept an expression rather than a literal. Usually a config key; a component whose structure repeats declares a path with `*` standing for one segment (`columns.*.formula`), because its expressions live one per column or one per row and a flat list could not name them.
- **`configFields`** — declare its component-specific config fields (key, input kind, label, optional group for subheadings, optional visibility condition on another field's value) so the layout editor can render a configuration form without knowing the component's type. Shared fields (label, position) are the editor's own business.

Beyond those five are the optional members, and they exist under a rule rather than to a count: **a member is optional only where the alternative is code outside the component knowing that component's data shape.** Counting them invites the next one; the rule is what refuses it. Both current members pass — the sheet-wide name table cannot publish a value it has no way to read, and a reset button cannot write "restore to full" into a shape it does not know — and most candidates will not.

- **`scopeValues`** — publish this component's values to the sheet-wide name table (§5): a `self` value referenced by the bare component id, and `named` entries referenced as `<id>.<name>`. Each entry carries what the note stores and, when the card computes a display, which formula field produces it and the internal scope to run it in; the table evaluates that lazily, since it may reference another component. A component holding nothing a formula could reference — a heading, an image, a block of prose — leaves it off, and nothing else learns it exists.
- **`hasBuffer`** — declare that this component holds a secondary buffer a trigger may clear on its own, so the editor can offer `buffer: 'clear'` on a binding. Declared rather than inferred for exactly the reason the rule above gives: the alternative is the layout editor knowing that a Pool has temporary points and a Track does not.
- **`applyReset`** — apply a reset trigger to this component's data (§6), given the binding and the same resolve-and-explain pair `render` gets. It takes the binding rather than a finished value because only the component knows what `full` means for it: a Pool's max, a Track's count, a Toggle's true — and resolving that is a formula that can fail, which is why it reports an outcome rather than returning data. A caller that knew would be holding exactly the per-type knowledge the contract exists to keep out of it. A component without it holds no state, is offered no reset binding in the editor, and is untouched when a trigger fires.

Adding a component means implementing those five, and an optional member only where that rule says it must. Nothing else in the system needs to know the component exists.

### 4.2 Catalog

For each component: what the layout configures, what the character note stores, what it does in sheet view, and which config fields accept formulas.

**Stat** — one named value on a single card, with an optional derived display and a free-text note line. Covers armour class, initiative, speed, passive perception: the standalone numbers a sheet is littered with.

- *Config:* `label`, `key` (entry name for the value in the note; defaults to `value`), `derived` (formula reading the stored value as `value`), `notePlaceholder`, `hideLabel`, `hideValue` (meaningful only with a `derived`), `hideNote`, `signed`
- *Data:* `fenced`, the value under `key` and the note line under `note`
- *Sheet view:* the label sits above the value, the note line below it, on the shared card rules below. The note, being prose rather than a number, is the one field the arrow keys do not step. The card fills the cell it was placed in, on the shared rule below that a component occupies the columns the layout gave it: a two-column Stat is two columns of card. It used to cap itself at tile width and centre in the remainder, so a wide component did not become an expanse of clickable card around a two-digit number — but that is a placement the author chose, and the one-column placement is how to ask for a tile. Vertically it holds the top edge and pins the note to the bottom, so cards sharing a grid row line their labels up with each other and their notes with each other, even when one of them carries a pill the others do not.
- *Formula fields:* `derived`

**The key is storage, and only storage.** It names the value's entry so the file reads `AC: 15` while the card reads "Armour class 15" — it is not what formulas reference. That is the component's `id` (§5), so a formula says `armour_class`, and neither the card nor the arithmetic has to know how the note happens to be spelled. Hiding the key from the card is the one thing that separates a Stat from a one-attribute Stat group, where the key *is* the card's abbreviation. `note` is reserved as an entry key, and a key holding a colon cannot be stored; either shows a configuration error on that component alone rather than writing a block that will not parse. Entries under any other key are preserved on write, and renaming the key does not move the stored value — the old entry stays in the note under the old key, as with a Stat group attribute.

**Stat group** — an ordered set of named attributes rendered as a strip of stat cards. Covers the six D&D abilities, Call of Cthulhu characteristics; a single-attribute group is a lone stat card.

- *Config:* `label`, `attributes[]` (each a `key` plus optional full `name`, in display order), `derived` (one formula computed per attribute, where `value` is that attribute's value), `direction` (`horizontal` | `vertical`), `sizing` (`fill` | `fixed`; fixed sizes cards at one per grid unit of the component's width, floored at a minimum), `align` (`start` | `center` | `end`, shown and meaningful only with fixed sizing; legacy layouts that carried sizing inside `align` still read correctly), `hideLabel`, `labelAlign` (`auto` | `start` | `center` | `end`; `auto` is the default and follows the cards), `hideValue` (meaningful only with a `derived`), `signed`
- *Data:* `fenced`, one entry per attribute key — the `## Abilities` example in §3.1
- *Sheet view:* the group's name renders above its cards unless `hideLabel`. At `auto`, its default, its position follows the cards' own alignment — a heading belongs over the thing it heads, and centred cards under a name pinned to the far left do not read as one block. Any other `labelAlign` pins it there, `start` included: the default needs a name of its own, or "follow the cards" and "hold the start edge" become the same unset key and one of them cannot be chosen. Each attribute edits inline on the shared card rules below. Covers "DEX 16 (+3)" without the plugin knowing what a modifier is. `derived` may reference the attribute's own `value`, anything the sheet publishes (§5), the standard helpers, and the layout's own functions.
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

- *Config:* `label`, `maxSource`, `max`, `hasTemp`, `hideFill`, `reset`
- *Buffer:* declares `hasBuffer`, so a reset binding may offer `buffer: 'clear'` without the layout editor knowing what temporary points are
- *Data:* `fenced`, `current`, optionally `temp`, and `max` where the character owns the ceiling
- *Sheet view:* increment, decrement, direct entry, a drag on the number itself, and an adjust control for spending or restoring an amount, so damage and healing are one action. The controls sit together in one row under the reading — `− ± +` — and the step buttons move the value by one, or by ten with shift, and repeat while held. A press steps what is on screen rather than what was last saved, so a typed draft is what moves
- *Formula fields:* `max`, `reset.to`

**A pool reads as a proportion, not as two numerals.** A hairline fill under the card carries current against max, because the question at the table is "am I in trouble", not "what integer am I on", and `12 / 54` makes the reader do the division. This is the language a `level` column already speaks — its ring grades its fill so a column can be read as a shape — and a pool has more need of it than a proficiency mark does: it is the one component whose state is inherently a proportion. The bar clamps at both ends; the value does not. Whether a pool may run below zero or above its ceiling is a rule of the game, so the number is left free and only its colour changes, which makes the boundary a status rather than a fence.

`hideFill` leaves the bar off, and it is an opt-out rather than an opt-in because a proportion is what a pool usually is. The case for turning it off is the pool whose max is a limit rather than a quantity — a counter of uses spent, where filling up is the ordinary state and an emptying bar would read as damage. The numbers and the boundary colour stay either way: the bar is the shape of the value, not the value's status.

**An amount is a control, not a typing convention.** `Adjust` under the value opens a small field for a number and a direction — **Spend** or **Restore** — and applies it, because the amount is what a player has in hand at the table: nobody is holding the number 45. Spend is the default, so the common path is press, type, Enter, with the direction never touched. The amount may be arithmetic, so `2*3` spends six. A typed sign still wins and moves the direction to match it, which keeps the control from ever showing a direction its own outcome contradicts.

It goes through the same path a press does, so the buffer takes it first: no route to a number on this card walks past the buffer. And the card gains a line for the one sentence it could not say anywhere else — `−17 → 50 · temp 0`, previewed before it is applied. A spend the buffer covers whole leaves the big number exactly where it was, which the flash on the pill could only report after the fact. That line sits above the controls rather than inside the row, and is held open whether or not anything is pending: beside the field it competed for width with a button either side of it, wrapped on a narrow card, and grew every card in the grid row with it.

**This was a typing convention first, and the reversal is the entry worth keeping.** `-17` in the value field read as a change rather than a value. It worked, and it cost nothing on the card, which is why it shipped that way. What it actually cost was that the field then held two incompatible kinds of thing with nothing to tell them apart, and three defects came out of that single ambiguity:

- Everything painted from the field read the amount as the value. Typing `-2` on a pool at 5 drained the fill bar to nothing and marked the number spent for as long as the draft sat there, then snapped back to 3 — a warning state, which is the one thing that styling is reserved for, fired for a value nobody asked for.
- A caret landing left of the digits turned a spend into a set. Tapping the left half of `5` puts the caret at offset zero, so typing `-2` produced `-25` and committed **−20**; on a two-digit pool, `6-172` committed **−166**. Both went to the note with no confirmation anywhere.
- A press or a drag arriving before the commit took the amount as its origin. Typing `-2` then pressing plus twice committed 0 rather than 5, because the interpretation flipped at the moment the draft's own sign flipped.

None of the three is a bug in the convention's implementation; they are what a field holding both a value and an instruction costs. The control gives the value field back its invariant — everything painted from it is true — and buys two things besides. There is no caret to land in the wrong place, because the field starts empty. And the direction being a button is what makes the gesture reachable at all on iOS, whose numeric keypad has no minus key: the amount is bare digits, so the one platform most likely to be at a table can now use it. The cost is a line on the card, and the hint text is three sentences shorter than it was, because two of them existed only to teach that a leading minus meant something other than a minus and then to teach the escape hatch for what a minus no longer did.

**The card divides into what the pool is and what changes it.** The reading takes a row of its own and every control sits in one row beneath it: `− ± +`, with the two directions either side of "by how much". The steppers used to flank the number, on the argument that adjacency is the plainest statement of what changes what — and that lost to a grouping argument on every count that could actually be checked. The value now takes the card's full width and centre line, so a sheet of pools reads as a column of numbers rather than numbers interleaved with chrome. The steppers stop being cramped: flanking a four-character field inside a 220px card is why they needed a container query to shrink and an invisible expansion to stay reachable by a thumb. And the card is no taller, because the amount already had a row and the steppers moved into it.

The cost lands only on a pool with a buffer: `−` now sits nearer the Temp pill than the number it decrements. The steppers do spend through the buffer, so the proximity is imprecise rather than wrong, and the pill's absorb flash is what teaches the rule in any case.

**`− ± +`, and every label on the row is a glyph.** The amount's trigger is `±` at the steppers' exact size, because the three are one set read at a glance and a word in the middle was the odd element — and a text glyph rather than an icon, because the marks either side of it are text glyphs. `±` also says the right thing: an amount, either way, rather than naming an action the press does not take. What distinguishes it from its neighbours is not its shape at rest but what the press does — it is replaced in place by a field, which no stepper does, and that happens on the press, so there is never a moment where nothing appears to have happened.

The direction inside the panel is the sign it will apply, `−` or `+`, joined to the field so that `− 17` reads as minus seventeen and needs no decoding. It was an arrow first, to keep a third minus glyph off a row that already carried two steppers — the same collision the buffer pill refused steppers over. That objection died when the steppers began standing down while the panel is open: at the moment the glyph is read there is no other minus on the card, so the clearest mark is available, and the arrow turned out to be a way of dodging a conflict that no longer exists. The words stay in the accessible name and the tooltip, and a restore is still marked in the accent — the sign carries the direction on its own, but leaving the default unmarked is what makes the exception visible. A glyph that is the only explanation of a control is not a label, which is why every one of these is named twice.

The direction and the amount are drawn as one control rather than two, sharing a seam and a focus ring. They are two halves of one value — this much, that way — and as a square glyph button beside a separate field they read as two things that happened to land next to each other. The field is sized against the button it is joined to for the same reason: left at an input's own defaults it was half the height of its neighbour, which made the thing being typed into the quietest part of its own control.

The controls row and the fill bar travel together. The card's free space is collected above the row rather than above the bar, so a pool in a tall cell stretches the gap under the reading and not the one between the controls and the bar — the bar is a picture of the value and the row is what changes it, and those two belong at the foot as a pair.

**Opening takes the row over, and that is a rule about layout under a finger.** The panel is wider than the `±` it replaces, and a centred row answers a growing middle child by pushing its neighbours outwards — roughly 38px each, instantly, on pointer-down, while the finger is still resting on the card. Layout must not move under a gesture in progress, least of all the two most-pressed buttons on the sheet, so the steppers stand down while an amount is being entered and the panel has the row to itself. Two other things fall out of it: the compound press that spent an amount and then stepped it again is unreachable, and the row stops carrying four directional marks that mean three different things.

The panel does not float. The card clips its own overflow so the radius can clip the fill bar, and that would clip a popover with it; taking the trigger's place in the row means nothing on the sheet moves either. The swap is motioned like everything else a finger touches here — the throw coasts, the buffer flashes, the fill eases, the step gives under the press — scaled about the centre it shares with the glyph it replaces, so the form grows out of the `±` rather than arriving from nowhere, and mirrored on the way out so an abandoned control retraces its path. `transition-behavior: allow-discrete` and `@starting-style` are what let a `display` swap animate at all, and both degrade to the hard cut this started as.

**Leaving abandons the amount, which is the one place this card breaks its own rule.** Every field on a sheet commits on the way out, and that rule is right for a field holding a value and wrong for a control issuing a command. A typed value can be re-read and retyped because it is still on screen; a throw can be caught mid-flight; a step is worth one point. A pending amount was the only gesture here where a stray tap elsewhere spent seventeen points silently and left nothing behind to say what had done it. So a mode dismisses where a field commits: Enter and the keyboard's own Done key are how to mean it, Escape abandons it from anywhere in the control — not from the field alone, which left the escape hatch with a hole in it at the direction toggle — and anything else that takes focus away simply puts it back.

A commit re-renders the sheet, and focus returns to the `±`: the view captures the focused control by cell and index before rebuilding and restores it after (§7), and the panel's children stay in the DOM whether it is open or closed, so the trigger's index does not move. A run of amounts costs one press of `±` between them.

**The pending amount is drawn on the bar as well as written out.** `−17 → 45` is the outcome as a number; the bar is the card's answer to "am I in trouble", and having the number update before the shape did meant the two halves of one piece of feedback arrived at different times. While an amount is pending the solid bar is the smaller of where the pool is and where it would land, and a faint bar reaches the larger — so a spend reads as "this much stays, this much goes" and a restore as "this much you have, this much arrives", from one rule and one `landing()` call shared with the preview text.

**And it is spoken, not only drawn.** The written line is a shape on a screen and the bar is a picture, so §12's rule — where a control's input is not its outcome, the outcome has to be on screen before it is applied — was being kept for the eye alone: a screen-reader user heard the direction and the amount, and then the result only after committing it, which is the same asymmetry the buffer flash was added to fix for the sighted reader. The pending outcome goes to the card's own live region once the amount stops changing, composed for speech rather than for the eye — `Spend 17, 5 from temporary, HP 50, 0 temporary`, where the line reads `−17 → 50 · temp 0`. Debounced, or it narrates every digit on the way in; and cancelled whenever the amount clears, so a preview can never land on top of the announcement of a commit that has already happened.

**The value field reads arithmetic on commit**, so `43-7` settles as `36`. The one thing a sheet with an expression parser in it should never do is ask the user to do the sum themselves, and a field that only accepted a settled number did exactly that. This is the rule that *can* live on a value field, and the contrast with the amount is the whole point: it is unambiguous by construction, differing from a plain number only when an operator follows one. So `-7` sets the pool to minus seven, `0-17` sets minus seventeen, and `62-17` sets 45 without touching the buffer — a set is a set. Text that is not arithmetic stays exactly as typed, and it is the same parser the formula engine uses, never an evaluated string.

**Large changes are a gesture, not a count.** A table deals damage in sevens, so a held step button repeats and accelerates, and the number can be dragged sideways to scrub it — tracking the pointer and, on a flick, carrying past where the finger stopped. Every one of those moves the draft alone; the note is written once when the gesture ends, which is the same rule the cards follow and is what keeps a two-second hold from writing the note twenty times. A press below the drag threshold still places a caret, so typing an exact value is untouched.

**A throw coasts, and can be caught.** The projected distance is spent over successive frames rather than applied the instant the finger lifts: landing it at once is a teleport, and the motion stops being continuous at exactly the moment it should feel most so — with the fill bar easing to a value the number had already snapped to. Coasting also gives the gesture the only undo it can have, since a press anywhere on the card catches the throw where it has reached. Nothing is written until it settles. Under reduced motion the value arrives without the journey, which is the one case where skipping the animation costs nothing: the destination was never in question.

**A boundary resists.** Past zero, and past the ceiling, the pointer buys roughly a quarter as much per pixel. Zero is the most consequential value this component renders, and a flat mapping made crossing it feel identical to any other ten points; resistance makes it a decision rather than a slip, and signals through the hand what the colour signals to the eye. It still does not clamp, so the boundary remains a status and not a fence.

A throw is bounded by a quarter of the pool's ceiling. The projection that suits a scrolling list is calibrated in pixels of content, and a pool is a short range read exactly rather than a long one skimmed: unbounded, a firm flick empties a character in one movement, and the gesture that covers ground fastest is also the one hardest to undo. The bound is what keeps it a shortcut rather than a hazard.

**The layout says where the max comes from: calculated, or the character's own.** `maxSource` picks between them and defaults to calculated, so every layout written before the choice existed reads exactly as it did.

*Calculated* is the original rule and the reason for it is unchanged: `max` is a formula field, the note never stores it, and a stored copy would be the stale derived value Skill card's storage rules refuse. Every character on that layout has the same expression, and changing it changes all of them at once.

*Character* is for the max that is rolled or assigned rather than derived — hit points, most obviously. The pool stores a `max` entry beside `current` and renders it as a small field inside the reading, so `22 / 31` is typed where it is read.

**Storing that is not the thing the rule forbids.** What Skill card refuses is a copy of a value some formula also produces, because the two can disagree and nothing says which is right. A character-owned max is produced by nothing: it is an authored number, the same kind of thing as `current`, and there is no second answer for it to drift from. The modes are exclusive by construction — a calculated max is never written to a note, a character's max is never computed from one — which is what keeps exactly one answer to "what is this character's maximum".

The old answer to a rolled max was to point the formula at a component holding it: `max_hp` on a Stat, and the pool's max reads it. That still works and is still right where the number is wanted elsewhere on the sheet under a name of its own. What it costs is a second card for a number that belongs to this one, and a max shown twice on a sheet whose reading already says it. `hp.max` publishes the same either way (§5), so a formula asking a pool for its ceiling never learns which mode it is in.

A max the character owns is edited plainly: it settles arithmetic like any value field, so `31+7` is a roll added to a total, and the arrow keys step it without touching the buffer — spending through temporary points is a rule about the pool, and a max is not the pool. The ceiling is read rather than captured, so the fill, the boundary colour and the throw's bound all follow a max being typed before it is committed; the change is written in the same edit as the value it bounds. With no max stored yet the field shows `—` and the pool has no ceiling and no bar, which is also why the field renders when it is empty: it is the only thing on the card left to press. A `full` reset restores to the stored number and fails, saying so, where there is none — the same outcome a formula that will not resolve produces, for the same reason.

A note carrying a `max` entry is read in both modes and used only in one. A calculated pool neither renders nor writes it, so the entry survives untouched per §10 — and a layout that later hands the max to the character finds the number already there.

**Temporary points are a buffer, and spending takes them first.** `hasTemp` adds a second value above the maximum, and what makes it part of the pool rather than a number parked beside it is that every spending gesture — the step down, the arrow key, a drag — drains it before touching the pool itself, crossing into the pool with whatever is left over. Without that it would be a Stat the layout could have placed for itself, which is the one thing a declared config field must not be.

Healing never refills it, and the pill has no steppers. A buffer is granted in lumps and replaced, not counted up to: nothing anywhere adds temporary points to temporary points, so typing over the value is the whole interaction. A second pair of step buttons would also put a minus on the card meaning something different from the minus above it. It is floored at nothing, however the value arrives, because a buffer is this component's own invention and no system has negative temporary points. The pill drains its colour while it holds nothing, so its presence on the card carries information rather than sitting there all session saying zero.

**Which event clears the buffer is the layout's to say**, through `buffer: 'clear'` on a reset binding (§6). Every system that has such a buffer empties it on some event and they disagree about which: a long rest in 5e, the end of an encounter in 4e, the next score in Blades. The pool cannot infer that and the plugin must not assume it. Because clearing the buffer is independent of restoring the value, `action` is optional on a binding — a 4e encounter ends, the buffer goes, and hit points are untouched — and a binding must carry one or the other, since a binding that does nothing has no reading.

Per-instance durations are out of scope. A system where each grant of temporary points expires on its own clock is describing a value paired with a duration, and that belongs to whatever granted it rather than to the pool.

**Where the buffer ends and a second Pool begins.** `hasTemp` is the non-stacking, non-healable buffer granted in lumps and spent first. Anything with a maximum of its own — Starfinder's stamina, Genesys's strain — is a second Pool with its own `max` and its own reset, not a flag on this one. That line is what stops the buffer growing into a component.

The fill bar ignores the buffer, and that follows rather than being a separate decision: the bar is the pool's proportion, and while only the buffer is draining the pool has not moved.

**A run of adjustments is one gesture, measured from where it began.** Every step is derived from the values the gesture started with plus its net movement, never applied on top of the last one — and that is what lets it be undone. Applied incrementally, a step down took a point off the buffer and a step up handed it to the pool, so a press and its reversal left the card in a third state that was neither. Derived from the origin, a net of nothing is exactly where you started. Three taps down and one up is one gesture, one write, and the up refunds the buffer the downs drained.

The run is written when it goes quiet, or sooner: leaving either field, releasing a drag, or typing a value all end it. Nothing is written from a card a rebuild has already replaced, since the values would be read out of detached fields.

**The buffer is floored at nothing, and the pool is not.** The argument for leaving the pool unclamped — whether it may run past either end is the game's rule — does not reach the buffer, because the buffer is this component's own invention. No system has negative temporary points.

A spend that crosses from the buffer into the pool changes two values, and they are written as one change. Two writes for one press would be two saves and two rebuilds, with the second racing the first.

The pool publishes its current value under its bare id, its ceiling as `<id>.max`, and its temporary points as `<id>.temp` where the layout asks for them, so `hp.max / 2` needs no second copy of the expression.

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

**Skill card** (`skill-card`) — repeatable typed records, wikilink-aware. Covers skills and saving throws, and the same block covers inventory, attacks, spells, and features, whose naming §13 leaves open.

- *Config:* `label`, `rowHeader` (heading of the column holding row names; defaults to "Name"), `namePosition` (where that column is drawn among the others; 0, first, by default), `rows[]` (each a `label` plus optional `values`), `columns[]` (each a `key`, optional `name`, `type`, `hideHeading`, and the type's own fields), `hideLabel`
- *Data:* `markdown` table, one row per record, one column per stored column
- *Sheet view:* cells editable on the shared editing rules, computed cells read-only, hovering one reveals its formula — or, where it failed, the name it could not find, since that is the half a reader can act on. A hover is the desktop half of that: a tap on a computed cell and a long press on a level both open the same text anchored to the cell, because a phone has no hover and a glyph with no route to its meaning is a dead end. The row name stays pinned while the table scrolls sideways, so a column of numbers never loses the row it belongs to. The "—" and "?" rule holds here as on a card: a computed column with no formula has nothing to compute and reads as empty, and "?" stays reserved for a formula that is present and did not resolve
- *Formula fields:* `columns.*.formula`, `rows.*.values.*`

The most important component, because it absorbs several system-specific concepts into one generic block — which is what the name does not say, and §2 records why. Each column is typed as `text` (with optional `secondary`), `number` (with optional `min` and `max`), `level`, `toggle`, or `computed` (with a `formula` and optional `signed`). A computed column's formula may reference the row's own cells by column key, the row's own values by name, and anything else on the sheet by component id.

**A `level` column and a `toggle` are one control with a different number of states.** A one-level column already *was* an ordinary toggle by this section's own account, and the two now render identically: two adjacent columns doing the same job must not measure differently under the same finger, and a native checkbox had none of the ring's hit target, coarse-pointer sizing, or press feedback. `toggle` goes on storing yes and no, which is what reads well in a file for a flag.

**A `level` column is one graded control, stored as the level it is on.** It exists because a graded proficiency is neither a number you type nor a set of boxes you tick: a spinner holding 0 to 2 asks the player to know that expertise is spelled "2", and a row of checkboxes offers the states nobody means — none ticked but the second one, or two of the wrong ones. One answer gets one control.

- **It reads as a toggle carrying the level's initial**: a filled circle holding "P" or "E", and an empty ring for none, which is what an unticked proficiency looks like on paper and needs no letter to say so. One glyph keeps the column as narrow as a checkbox would; the full name is a hover away on a pointer, a long press away on touch, and is what assistive tech is given.
- **The fill grades with the level**, mixed from the accent towards the page by how far up the column the cell is: the first grade a tint, the top one the full colour, and the ring at full accent throughout so even the faintest fill still reads as marked. A column of rings then has a shape — how trained this character is, read before any of the letters are — and it costs nothing, since the glyph and the name were already carrying the exact answer. Short of the top the glyph reads against the page rather than the accent, because white on a tint is the one place the ramp could cost legibility. Under `prefers-contrast: more` every marked level goes back to the full fill: a shape read down the column is the wrong thing to trade contrast for.
- **`levels`** names the states from none upwards (`["Untrained", "Proficient", "Expertise"]`), and naming them settles how many there are, so `max` is only for a column whose levels are not worth naming — those show their number as the glyph instead. A named level reads as itself to a screen reader rather than as the number behind it.
- **A level name may also say what its ring shows**, after a colon: `"Proficient:"` for a fill carrying no letter at all, `"Proficient:★"` for a mark of the layout's own. A mark is one character, which is all the circle holds and also what keeps the syntax from changing what an existing file means — `"Trained: the useful one"` is a name with a colon in it, and reads as one. An unnamed column's level count is held to 20 for the same reason a level column is a ring at all: past that it is a number to type rather than a control to cycle, and the editor draws a ring per level. Left alone it carries the initial of its name, which is what every existing layout says and so what it keeps saying. This is what covers 5e — an empty ring, a plain fill for proficiency, the fill with "E" on it for expertise — without the plugin knowing anything about 5e. The marker lives in the name because which levels are worth lettering is a per-level answer; a flag on the column could only offer the guesses someone thought of (all, none, the highest), and the layout is the thing that knows. The name is never optional: it is what a dropdown lists and what assistive tech is given, so a level with a mark and no name is a configuration error (§10). The layout editor draws every state of the column beside the field, painted by the same code the sheet uses — and each named level's ring is also the control for whether it carries a mark, because a colon typed into a text field is exact and unguessable while a ring that answers a press is neither. The two write the same string and the field updates as the rings are pressed, so the picture is never a second place the truth is kept. None is not a control, since an empty ring is what none is, and neither is a level with no name to keep a mark in. A mark of the author's own is remembered across the press that hides it: a toggle that loses what it was holding is a trap.
- **`input`** is `cycle` (the default) or `select`. Cycling wraps, so one control reaches every level and returns to none without a second gesture; the arrow keys step without wrapping, for the hand that would rather aim than count. A dropdown suits a column whose levels are many or whose names are worth reading before choosing.
- The stored value is an integer either way, so the arithmetic is unchanged: `Training * prof` covers untrained, proficient, and expertise in one expression, and the note still reads `| Perception | 2 | 0 |` and stays hand-editable.
- With one level it is an ordinary toggle storing 0 and 1, which is what a system with a single grade of training wants. `toggle` remains for the flags that read better in the file as yes and no.

**A row carries expressions of its own, not just a name.** A row's `values` are named expressions evaluated in that row's scope, and they are what let one column formula serve a whole list: the column says `ability + Training * prof + Bonus`, and each row says which ability it means (`ability: abilities.DEX`). Without them a skill list needs eighteen nearly identical formulas, one per row, and the layout stops being a description of the system and becomes a copy of it.

Two row modes, and the distinction carries real weight:

- **Fixed rows.** The layout defines the rows, the character only fills in cells. Correct for skills and saving throws, where every character in the system has the same list and retyping it per character would be absurd.
- **Open rows.** The character adds, removes, and reorders rows freely. Correct for inventory, attacks, spells, and features. Not built yet; fixed rows came first because they are what a skill list needs, and they settle the storage format that open rows will reuse.

Three rules the storage follows, each of them a decision rather than an accident:

- **A computed column is never written to the note.** It is derived, and a stored copy of a derived value is a stale copy waiting to happen. The note holds the columns the character owns and no others.
- **A blank cell in a `number` column is zero.** The layout declared the column numeric, and an untrained skill is left blank on every character sheet ever printed. This is the one place a missing value resolves rather than failing, and it is confined to a column whose type the layout stated.
- **A row the layout no longer declares stays in the note**, unrendered and untouched, as does a column, a second row under the same name, and any prose around the table (§10).
- **A column may leave its heading off the sheet** with `hideHeading`, for the one whose control names itself: a proficiency ring is legible without a word above it, and the word is several times wider than the ring, so the heading was setting the column's width against a control that needed none of it. The heading is still rendered for assistive tech, so the column keeps its name where a name is all there is.
- **A text column may read as a gloss on the row** with `secondary`, which gives it the clothes the abbreviation wears under a stat card's name: a size down, tracked, and faint, at full contrast while it is hovered or focused. For the column that qualifies the row rather than adding to it — the ability behind a skill, the source of an item — where equal weight leaves the eye deciding which of two things per row the row actually is. Opt-in per column, and confined to `text`: muted user data otherwise reads as disabled, and a number is the row's arithmetic rather than a note beside it.
- **The name is always the note's first column**, whatever `namePosition` draws on the sheet. It is what identifies the row, so a display preference must not move it: a proficiency mark reads better before the skill, and the file still has to say which skill the row is before it says anything else about it.

This is where the design risk concentrates. It is the first component using the markdown storage path, the first holding wikilinks, and the first with per-row formula scope. It is also what forced `formulaFields` to grow paths (§4.1): its expressions live one per column and one per row, so no flat list of config keys could name them.

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

- **Any numeric field configured in a layout accepts a literal or a formula.** A Pool's max, a Track's box count, an ability's derived display, a Skill card's computed column. There is no separate "computed field" concept to learn.
- **Formulas reference other components' values by name**, and the name is the component's `id`, never its label — renaming a label must not break arithmetic. An id must therefore be a name the expression parser accepts: letters, digits, and underscores, never starting with a digit. A hyphen would read as subtraction — `armour-class` is "armour minus class" — so an id carrying one is rewritten when the layout loads (`armour_class`) rather than rejected: an unreferencable id is one nothing can be pointing at, which is what makes renaming it safe, and blanking a whole sheet over it would not be. A component holding one value answers to its bare id (`armour_class`); one holding several answers to `<id>.<name>` (`abilities.DEX`). What a component publishes is declared by its `scopeValues` (§4.1); a name the sheet does not publish fails to resolve rather than defaulting to zero.
- **A bare name gives what the card shows, not what the note stores.** `abilities.DEX` is the +6 in large type, not the 22 behind it: the sheet has already decided what that ability means, and a formula reading it should get the same answer the reader does. Where a component computes nothing, the two are the same thing. The stored value stays reachable as `<name>.value` — `abilities.DEX.value` is 22 — for the formula that genuinely wants the raw score.
- Names resolve nearest-first: a scope internal to the component (one ability's `value`, a table row's cells), then the component's own data, then the sheet. A card's `value` therefore always means its own.
- **Each layout defines its own function library.** This is what makes the plugin system-agnostic: no game's arithmetic is built in. Definitions are written one per line — `mod(score) = floor((score - 10) / 2)` — and one taking no arguments is a named value, written as a bare name: `prof`, not `prof()`, though both are accepted rather than one being made an error over punctuation. Lines starting with `#` are the author's own notes.
- **A function body sees its parameters and the sheet, and nothing of its caller.** A function is not a text substitution, so `mod(score)` means the same arithmetic wherever it is called: the calling component's nearer scopes — an ability's `value`, a table row's cells — are not visible inside it, and only its parameters and the sheet are. Parameters shadow the sheet. A name the sheet publishes wins over a no-argument function spelled the same, so a component keeps the meaning of its own id.
- **A definition that will not parse is reported, not fatal.** It stays out of the library and is named in the layout editor, where it can be fixed, while a formula calling it fails on its own component like any other unknown name. One typo must not blank every sheet the layout serves. A function defined in terms of itself, directly or through another, is refused on the same terms — the runtime floor under the save-time cycle check below, and for the same reason.
- **The shape of the key is not forgiven the way its contents are.** What a line says is the library's business; that the key is a list of lines at all is the file format's, and a `functions` that is anything else refuses the layout, as a bad `columns` does. The two are not in tension: a typo is a mistake inside something the user can see and correct in the editor, and a wrong shape is a file the editor cannot open at all, so saying so plainly beats ignoring the key and leaving the author to wonder where their arithmetic went. Two things the editor does not yet check are a cycle between functions and a definition shadowed by a component of the same id: both are reported on the card that calls them, which names the reason but says it a long way from where it was written.
- A layout may not redefine a standard helper, since a formula reading `floor` must mean the one thing everywhere.
- Standard helpers are available: floor, ceil, round, min, max, abs, and a conditional.
- Computed values are read-only in sheet view.
- **A name that will not resolve publishes nothing**, rather than falling back to the value behind it. Handing back 22 where the +6 was meant is a worse answer than none: the formula reading it fails, and its own component says so.
- Circular references are caught when the layout is saved, not at render time. Because published values are computed, one name can depend on another, so the sheet-wide table is also lazy, memoised, and refuses a name that needs its own result — a cycle leaves both components unresolved and every component outside it working. That runtime floor is not a substitute for the save-time check; it is what stops a two-line cycle taking the app down with it while the check does not exist.
- A formula referencing something missing shows an error on that component alone. The rest of the sheet keeps working.

Worked examples, both drawn from the original brief:

A 5e layout defines its own functions.

```
mod(score) = floor((score - 10) / 2)
prof       = ceil(level / 4) + 1
```

A skill row's computed total, where `Training` and `Bonus` are cells on the same row, `prof` is a component elsewhere on the sheet, and `ability` is one of the row's own values, defined by that row as `abilities.DEX` — which gives the +3 the ability card shows, not the 16 behind it, by the rule above.

```
ability + Training * prof + Bonus
```

`Training` is a level column named untrained, proficient, and expertise, so the same formula covers all three, and the rule for each level is arithmetic the layout wrote rather than a concept the plugin knows. A system whose levels are not evenly spaced writes the rule out instead:

```
ability + if(Training == 2, prof * 2, if(Training == 1, prof, 0)) + Bonus
```

A feature's uses per day, expressed as a Pool max.

```
mod(Abilities.WIS)
```

A Call of Cthulhu layout would define entirely different functions (`half`, `fifth`) and the plugin would not notice the difference.

## 6. Reset triggers

- Each layout defines its own named triggers. A 5e layout declares Short Rest and Long Rest. A Blades layout declares Downtime.
- Any Pool, Track, or Toggle can bind to as many triggers as it needs, each with its own action.
- Per binding, the reset `action` is one of `full`, `empty`, or `formula`, and only `formula` carries an expression, in `to`. It is optional, because a binding may instead — or also — carry `buffer: 'clear'` for a component that declares a buffer; one of the two is required, since a binding that does nothing has no reading.
- Sheet view shows one button per trigger.
- Applying a trigger confirms first and is undoable.

**A component binds to a list of triggers, because the triggers a system declares overlap.** In 5e everything a short rest restores is restored by a long rest as well, and not the reverse — so a component that could name only one trigger could not describe the system at all: bind ki to the short rest and a long rest leaves it spent. Each binding carries its own action, which is the part a trigger hierarchy could not express: a pool may regain one use on a short rest and all of them on a long one, and that is two different answers to two different events rather than one answer inherited.

A single binding may be written on its own rather than as a list of one, the way §5 accepts `prof` beside `prof()`. Two bindings on one trigger refuses the layout: the button would apply both in file order and the second would silently win, which is no reading anyone intended.

The cost is real and worth stating. The rule "a long rest covers a short rest" is a fact about the triggers, and writing it per component means repeating it on each, with a new short-rest pool silently failing to restore on a long rest until someone remembers. A trigger that declared it included another would say it once. That is deliberately not built: it is sugar over this, expressible by expanding one binding into several at the moment a button is pressed, and it needs no change to what a component implements. The list is the primitive, and it is the one that can say things the hierarchy cannot.

**The action is a key of its own, and the states are named rather than numbered.** `to` is declared a formula field on Pool, Track, and Toggle (§4.2), so it is handed to the evaluator as an expression; a `to` that also had to hold the literal word `max` could not be. One string cannot be both a formula and a sentinel standing in for one, and the way to find out is to write a layout that resets to `max` and watch the evaluator look for a name nothing published. `full` and `empty` name the states rather than the numbers because the same three actions have to cover a Toggle, where they are true and false, as readily as a Pool, where they are its max and zero.

**A binding the plugin cannot act on refuses the layout**, as a bad `columns` does and for §5's reason: `reset` is shared config the plugin itself reads, not a component's private business, so a missing or unknown `action` is a wrong shape rather than a typo to report in the editor. The pre-split `{ trigger, to: "max" }` is refused rather than migrated — nothing has ever written this key, so unlike a hyphenated id there is no file in the wild the refusal could cost. An expression left beside `full` or `empty` is kept and simply not run, so changing the action in the editor and changing it back does not throw away what was typed.

**A trigger name that matches nothing is contents, not shape.** Whether `reset` is a binding at all is the file format's business and refuses the layout; whether its `trigger` names one the layout declares is the library's, and follows §5's rule for a function that will not parse — reported in the editor where it can be fixed, while every sheet on the layout goes on rendering. The component simply binds to nothing and no button reaches it. The check cannot live where the rest of the binding is validated in any case: a component is parsed without the layout around it, so nothing at that point knows which triggers exist.

The same rule covers the declarations themselves. A blank name is dropped and reported, because a binding stores the name it matched and an empty one would match every component that set no trigger at all. A name declared twice keeps its first appearance and reports the second, since two buttons with one name could not be told apart. A declared trigger that nothing binds to yet is not a problem yet — that is what a layout part-way through being built looks like.

**A trigger applies what it can and names what it could not.** A Long Rest that resets three Pools and finds the fourth's `to` unresolvable leaves that one as it was, resets the rest, and says which one failed. This is §5's rule — one failure must not take the sheet down — and being a button rather than a render does not earn an exception: refusing the whole rest because one component is misconfigured is a worse answer than a rest that happened and reported a gap.

**Undo restores the note as it was immediately before the trigger, and declines if the note has moved since.** Between the confirmation and the undo the player can edit a field, and a restore that silently swallowed that edit would destroy more than it reverted.

This is the only place the sheet performs an action rather than holding values.

## 7. Layout editor

Until the grid canvas below ships (M4), an interim form-based editor lives in the plugin settings: create layouts, add and remove components, edit each component's shared and declared config fields, declare the layout's reset triggers, and write its function library. A component that can act on a reset — one implementing `applyReset` (§4.1) — gains a binding of its own: which trigger restores it, which of §6's three actions it takes, and the expression where that action is `formula`. Components that hold no state are never offered one, so the field appears exactly where it means something. It renders forms from `configFields`, so it grows automatically as components are added. The M4 editor is a dedicated workspace view, not a settings tab — an authoring tool needs width, undo scope, and a sheet beside it — and once it ships, settings keep only preferences and a button that opens the editor.

A schematic of the grid sits above the forms, and the block is the control: drag it to move, drag its bottom-right corner to resize, arrow keys and shift+arrows for the same two things. `col` and `row` anchor the top left while `width` and `height` grow right and down, which is why one corner is enough — the other three would have to move a block and resize it at once, and moving is what dragging the block already does. Both gestures write the same four numbers the form shows, so neither is the real editor and the position fields are never the only way in. A block cannot be pushed or grown past the last column; one already out there, from a hand-authored file or a `columns` reduced under it, is left where it is rather than snapped back.

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
- **A component fills its placement.** A card sized two columns wide occupies both, rather than holding a tile width and floating centred in the slack. The grid is the sizing control: an author who wants a small card places a small component, and a component that second-guessed the placement made the grid look broken wherever it disagreed. Stat group's `fixed` sizing is the deliberate exception, and it is opt-in and still grid-derived — one card per grid unit.
- **The grid fills the pane.** A sheet is a dashboard, not prose: its width is a column count the author placed components into, so reading width would leave a wide pane empty on both sides while squeezing the cards meant to fill it. The `--sheetsmith-sheet-max-width` custom property caps it for anyone who wants reading width back; prose the view writes itself, such as the missing-layout notice, still holds that width.
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
| 2 | **Stat group** | Multi-entry fenced storage, per-scope formula evaluation — the row scope Skill card needs, proven on a simpler component |
| 3 | **Pool** | Editing interaction, a formula-capable config field, reset triggers |
| 4 | **Skill card** | The markdown storage path, wikilinks, fixed versus open rows, per-row formula scope (mechanism proven by Stat group) |

Skill card jumped Pool for the same reason Stat group jumped Stat: a skill list was wanted, and it is a fixed-row record block rather than a component of its own. Fixed rows shipped first, with `text`, `number`, `level`, `toggle`, and `computed` columns; open rows and `link` columns wait for the inventory that needs them. `level` was not in the original column list. It arrived once the skill list was on screen and a spinner for a two-grade proficiency turned out to be the wrong control, and then changed shape again — from a row of marks to one cycling control — because a set of checkboxes can express states the value cannot. Both corrections came from looking at a rendered sheet, which is the argument for building a component all the way through render before starting the next. Pool followed, and inherited both — the editing gesture already shared by cards and cells, and a function library its `max` can call. The library was built before it rather than after: a formula-capable config field written against a half-finished engine would have been written twice. It shipped without its reset binding, which is the one thing on its §4.2 entry it does not yet implement. That was deliberate: reset triggers are a layer across several components rather than a part of any one of them, and a Pool that renders is what the trigger machinery gets to be built against. The split cost one thing worth naming — `applyReset` and `reset.to` are absent from the component until that layer lands, so the contract's rule that declaring one implies the other holds vacuously for now.

Reset triggers followed it rather than arriving inside it, and that split is worth recording because the build order says component by component. A trigger is not a part of any component: it is declared once per layout, drawn once per sheet, and applied across several components at once. What belongs to the component is only `applyReset`, and that turned out to need the binding rather than a finished value — a caller that could compute "full" would have to know a Pool's max from a Track's count, which is the per-type knowledge the contract exists to keep out of it. So Pool shipped first without a binding, and the layer went across it afterwards: the trigger list on the layout, the binding in the editor, the buttons on the sheet, and the batched write underneath so a rest is one write and one undo rather than one per component.

Its one surprise was that the max could not be character data. The §3.1 example had stored one since before `max` was a formula field, and the two could not both be right; a stored copy of a derived value is the thing Skill card's columns already refuse.

Its one reversal was the typed amount, and the lesson generalises past this component. `-17` reading as a change was cheap, needed no new control, and matched what a player says at the table — every argument for it was sound, and it still had to go, because a field that holds both a value and an instruction cannot tell them apart and neither can anything reading it. The three defects in §4.2 were all downstream of that, and none was findable by reasoning about the convention: each turned up by driving the rendered card and watching what it committed. **Where a control's input is not its outcome, the outcome has to be on screen before it is applied** — which is the rule the drag and the held button already followed, and the one the typed route quietly did not.

Stat group (built as "Abilities") was not in the original order; it jumped the queue on demand once Stat worked, and looked at the time like a replacement for it, so Stat was dropped and then rebuilt on top of the group's card once the standalone numbers turned out to want a component of their own. The detour paid for itself: it forced the render contract to grow a per-scope field resolver, which is the same mechanism Skill card's computed columns need per row, discovered while the codebase was small, and it left a shared card module for the Stat to render through.

The remaining seven are variations on problems those solve. Field and Toggle are simpler single-value cards, Track is a simpler Pool, Computed is a value-less card fed entirely by a formula, and Rich text, Group, and Image barely touch the formula system.

Skill card's contract was worth writing early even though it was scheduled fourth, because it is the component most likely to expose a flaw in the shared contract, and that is cheapest to discover while few components depend on it.

## 13. Open questions

- Whether Group components may nest, or only hold leaf components.
- Whether a character may override a single formula locally without forking the whole layout.
- **What the open-row version of Skill card is called.** The block is generic — named rows, typed columns, per-row formula scope — and §4.2 has it covering inventory, attacks, and spells, none of which is a skill. Either open rows ship as a second component sharing this one's implementation, or the name widens again. Deciding it before open rows are built would be deciding it without the thing that will make the answer obvious.
- **How a Skill card publishes its rows to the rest of the sheet.** `10 + skills.perception` is the obvious way to write a passive perception, and Skill card currently publishes nothing, so it cannot be written that way yet. The obstacle is mechanical rather than a matter of taste: a row's published value is a computed column evaluated in a scope that itself contains formulas (the row's `values`), and `scopeValues` (§4.1) hands the sheet plain values, having no resolver of its own at the time it is called. Either the scope entry grows a way to name an expression to evaluate, or a component gains a say in how its resolver is built. Until then a total is readable on the sheet and not from a formula.

Resolved: **body sections are keyed by the component's `label`**, which doubles as its heading, keeping the note readable. The `id` is the stable identity formulas reference, so renaming a label breaks no formulas, and section 10 covers migrating existing characters when it happens.

Resolved: **layout files live in `Sheetsmith layouts` by default.** The folder is configurable in settings; an empty or whitespace-only value falls back to the default rather than silently pointing at the vault root.
