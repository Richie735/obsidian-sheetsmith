# Character forms

Status: shipped
Board card: A character takes on a form that replaces part of its sheet — 5e
Wild Shape and Polymorph, a werewolf's forms, Pathfinder 2e battle forms,
Daggerheart Beastform — through one component that makes playing a
shapeshifter easy at the table: not a list of form records to scroll, every
component a form changes visibly tinted while it is active, and a stat block
whose shape each layout declares.

## Model question

**Settled with the owner on 2026-11-06, and recorded here as settled rather than
reopened.** The §13 entry is "Whether a character may take on a form that
replaces part of its sheet, and what a form is", added open by this spec; its
`Resolved:` line is `/land-it`'s. The seven answers, each with the argument that
carries it:

1. **Forms are character data.** Each known form is a `###` record in the
   character note, in Record set's storage shape and read through the shared
   `src/parse/records.ts`. The layout declares what fields a form has; the
   reader adds the forms. §11 holds: a layout holds no content, so no beast
   ships in a layout, and the 5e starter's Stat block ships empty by
   construction exactly as its Spellbook does. The evidence agrees on both
   halves — Shape+ copies a form's data onto the character so it outlives the
   bestiary entry, and D&D Beyond users keep beasts per character — and the
   overlay model it implies (one persistent character, a change applied and
   removed, never a copy) is what Fantasy Grounds, pf2e's BattleForm and
   dnd5e's own Change Form (PR 6663) converged on after dnd5e's duplicate-actor
   model produced 961, 1463 and 4535.
2. **One form at a time, as a radio.** A component-level key `exclusive: <toggle
   field key>` names the exclusive toggle. Pressing a form turns it on and the
   previously active one off **in one write**. Pressing the active form again,
   choosing **None**, or pressing **Revert** leaves no form active. A note
   hand-edited to hold two forms on is **reported and left alone**; while
   reported, both apply, stacked as any two records' modifiers already stack,
   and the report names them. This partly reopens §13's "Whether a set-level
   activation constraint belongs on a Record set — exclusivity, or a cap": that
   entry refused a press that unticks another record as a write the reader did
   not ask for, and for a form switch that write *is* the ask — nobody picking
   Wolf means "and stay a bear". The cap half stays open, and so does the
   refusal for anything that is not a form switch: a hand-edited second form is
   rendered, not corrected. Known limit, recorded and not configurable: a
   system with no formless state (Werewolf: The Apocalypse) models its base form
   as a form with no changes, and **None** is still offered.
3. **A third modifier operator, "at least"** (Foundry's Upgrade). Cell spelling
   `>=`, stored `"operator": "upgrade"`, labelled **At least**. It acts in the
   result phase. The brief calls it the fourth operator; the code holds two
   today (`ModifierOperator = 'add' | 'override'`, `src/types.ts`), so with the
   deferred multiply it is the fourth *named*, and the third built. No "at most".
   Bonus-type filtering (pf2e battle forms accept only circumstance and status
   bonuses) is out of scope and named below.
4. **A form keeps its own stored state.** Its HP is a field of its own record
   and survives switching away, which is what Lancer's mech does across an eject
   and what "a separate HP tracker for each form" asks for in the same words in
   2018 and 2025. **Reverting at 0 is not automatic** (dnd5e 833 has been open
   since 2020 over exactly that): 0 is shown by the number alone, `0 / 34`, on
   §13's ceiling precedent — render, do not correct. Carrying excess damage to
   the character's own pool is out of scope. **No on-activate trigger**:
   refilling a 5e 2014 beast's HP on shifting is the reader's press, a rest
   refill is an ordinary reset binding, and 5e 2024's temporary HP is the
   existing Pool buffer on the character's own `hp`.
5. **A new catalog component, `Stat block`** (`stat-block`), named for its shape
   under §2's rule. It covers an always-present companion or familiar block too,
   where no `exclusive` is configured. It is new rather than a Record set
   presentation because **it stores set-level state above the records** (the
   uses counter, in a `sheet` fence in the section's preamble), which changes
   the file format, and §4.2's own rule for Record set is that "a fold that has
   to change the file format is not a fold"; and because **it publishes fixed
   names** (`<id>.active`, `<id>.uses`) where Record set publishes nothing by
   name. It reuses `parse/records.ts` and never imports another component. **A
   `Forms` palette entry** prefills the exclusive `Active` toggle, an HP pool
   with each form's own ceiling, and a `Modifiers` field. It passes §4.2's
   entrance test: nobody wanting forms looks for "Stat block", and the job is
   one component's configuration.
6. **The picker's storage is the exclusive toggle**, not a stored choice. A
   stored choice needs a name-based identity where §2 says a record's identity is
   its position, and a stored position switches forms silently the moment an
   earlier form is deleted. The picker draws the toggle; there is no per-record
   ring on the panel.
7. **Restrictions on the character's own replaced parts** (their attack list,
   their spell slots, their main HP) are, for now, prose in the form's stat
   block. A `dimWhen` placement mechanism is **deferred**. pf2e's own `canCast`
   and `hasHands` "currently have no effect", which is why restrictions read as
   notes rather than enforcement. **The tint is built so `dimWhen` joins it later
   as a second condition rather than a second mechanism** (Design, The tint).

**Untouched, and said so:** §13's "Whether a character may override a single
formula locally without forking the whole layout". A form pushes at published
names through the modifier slot; the base formula still runs, which at least
depends on — it compares against what the formula came to.

**Contract, publication, storage, existing notes.**

- **The contract does not grow a member.** Stat block implements the five plus
  `scopeValues`, `scopeRows`, `scopeModifiers`, `resetColumns`, `applyReset`,
  `palette`, `example` and `sample`, all of which exist. **Two things grow
  outside the contract, named so they are not smuggled in.** `ModifierPush`
  gains one optional flag, `inPlay`, saying the push belongs to a state the
  character is currently in, which is what the tint keys on; §4.1's sentence that
  a push "carries no target, no bonus type, no amount and no reason" stays true.
  And the sheet gains one post-render pass, `view/placement-decorations.ts`,
  which is the tint's mechanism (Design). Neither names Stat block; Table could
  set `inPlay` on a Conditions row tomorrow without either changing.
- **It publishes** `<id>.active` (true while any form's exclusive toggle is on;
  only where `exclusive` is set) and `<id>.uses` (the uses left; only where
  `uses` is set), plus `scopeRows` so `count(forms)` and `count(forms, Active)`
  are arithmetic, and `scopeModifiers`.
- **It stores** one `markdown` section: an optional preamble fence holding
  `uses`, then one `###` record per form. Constraint 3 holds by `records.ts`'s
  construction for the records and by `parse/fenced.ts` for the preamble fence;
  the action list is a markdown table read and written by `parse/table.ts`
  (Data and file model).
- **Existing notes**: nothing reads or writes them. It is a new component, and
  the starter change reaches only layouts installed from now on.

## What it does

A Moon druid's player opens the **Forms** tab, chooses **Brown Bear** from the
picker, and the sheet changes under them: Strength, Dexterity and Constitution
read the bear's modifiers, armour class reads the bear's, and every one of
those numbers is tinted with a mark saying **Brown Bear**, while the panel shows
the bear's own HP with step presses, its speed, its attacks and its traits. A skill
where the druid's own number is higher stays untinted. **Revert** puts them back
in one press, and the bear's HP is still there next time.

## Smallest version

The operator, exclusivity, and a Stat block drawing the active form's fields,
HP pool and changes under a picker with **None** first, the **Every form**
library to add, name and delete forms, and the tint. **It gives up two things**:
the uses counter (a Track beside the panel counts uses, spent by hand), and the
structured action list — a form's attacks are a markdown table written in its
body, drawn by the body's own markdown render and edited as text. Same storage
either way, so the full version migrates nothing.

## Design

### The panel

One bordered component, `.sheetsmith-placed` / `.sheetsmith-placed-box` — Record
set's box, sized by its placement, content scrolling inside — so it sits beside
the sheet's other blocks as one of them rather than a fourth kind of panel
(`docs/UI.md` §9). Two faces, **In play** and **Every form**, held as the
view's reader posture through the existing `activeTab` / `onActivateTab` pair: it
is an index into alternatives, which is exactly that pair's shape, so this is a
second consumer of it rather than a fifth posture pair. Undefined is **In play**.

**In play is drawn for reading, not as the form's edit form** (amended after
the owner's vault test, where the face read as an edit form: no title, no
separation between parts, one text size, every attack a row of bordered
inputs). What a reader steps at the table stays a control; everything else is
read, and **Every form** is where a form is edited.

**It reads as a small character sheet** (amended again after the owner's second
vault test, where every section was a small-caps heading over a hairline and
nothing read as a stat block). **Each part is drawn in the sheet's own
vocabulary for what it is, and nothing new is invented**: the vitals are Card
tiles, the actions are a Table, the traits are a box in the card's clothes,
and each section is the sheet's label-over-content pair — a heading at the
component label's rank above its content, `--size-2-2` between them — so a
section reads as a placed component on a small sheet. The changes keep the
pair without a box of their own (the owner's call: a box there was one frame
too many), so sections are told apart by their headings and their surfaces,
not by dividers. One rhythm between sections (`--size-4-3`) and
the type scale's steps: the title at `--font-ui-large` bold, a vital's number at
the card value's size (`--sheetsmith-card-value-size`), a text vital at
`--font-ui-medium`, the body at `--font-ui-small`, a heading at the component
label's rank. Top to bottom:

Items 3 to 6 are the default order; a layout reorders and re-heads them with
`sections` (Config fields), and Every form follows the same order.

1. **The component's label** above the box (`.sheetsmith-component-label`,
   unless `hideLabel`), as every placed component has.
2. **The head**, one row, **ruled off from the stat block under it** with the
   border the sheet's row rules use, the section rhythm (`--size-4-3`) on both
   sides of the rule — the gap below opened to it rather than the rule dropped,
   so the title still reads as the block's: **the form's name as the block's title** (*No form
   active* in muted text where none is, *Brown Bear and Wolf* where two are on),
   then — where `uses` is set — the uses counter, then the compact picker and
   **Revert**, wrapping under the title on a narrow block.
   - The uses counter: one `paintLevelRing` ring per use, filled for each use
     left, `Uses 1 of 2` to a screen reader. A press on a ring sets the count
     there, a press on the ring the count stands on clears it, and the arrow keys
     step — Track's run rule, on Track's one-focusable-control model, but painted
     with the shared ring rather than segments, since a count of two to four
     reads as dots. A count stored above its ceiling is drawn as the rings plus
     `3 / 2` in Pool's ceiling vocabulary, never clamped; past six rings it is
     the numerals alone. On **Every form** and on a companion block the counter
     sits beside the component's label instead.
   - The picker (where `exclusive` is set): a native `<select>` in the shared
     closed-list clothes (`.sheetsmith-record-select` and its chevron wrapper),
     sized to its longest option rather than to the row: **None** first, then
     every form whose fence reads, by its heading's display text, in file order.
     Changing it is the switch. **Revert** — a text button with the `undo-2`
     glyph, drawn only while a form is active, doing exactly what choosing
     **None** does. Both write once and announce through the component's live
     region: `Brown Bear active`, `Brown Bear active, 1 use left` where a use was
     spent, `No form active`.
3. **The vitals**: a row of **stat tiles** for the record's number, toggle and
   text fields — whatever the layout declares, never a list of 5e names — each
   tile in the Card's look: the card's border, radius (`--radius-m`), surface
   (`--background-secondary`) and padding, its name at the component label's
   rank above its value, a number at the card value's size, bold, in tabular
   figures. **The tiles fill the row** (`flex: 1 1` from a floor of nine of the
   body's ems, what "ARMOUR CLASS" needs whole, so a tile that cannot keep its
   label wraps rather than clipping): they share it, wrap at the gap a Card set keeps between its
   cards (`--size-4-2`), and a wrapped tile takes the whole of its own line;
   they stretch to one height. **The values sit on one baseline**: every tile
   stacks from its top — the label, the same gap, then one value line at the
   card value's size — so a number, a number in a field and a phrase set
   smaller inside that line all share its baseline, and HP's steppers hang
   below it. The exclusive toggle is never
   drawn; the picker is it.
   - a `number` field with a ceiling (`maxSource: 'record'` or a field `max`)
     draws **Pool's reading** inside its tile — the value at the headline size,
     then `/` and the ceiling muted at `--font-ui-medium` — with `−` and `+`
     step presses on a line of their own under it, on `interaction/hold-repeat.ts` (shift steps ten,
     held presses repeat), a run of presses written once. The value and the
     record's own ceiling are Record set's number fields exactly, on the same
     commit path and the same rules. **At 0** the number alone says it,
     since 0 may be a field's normal state (a Fate NPC's `Stress: 0 / 1`).
     **Below 0** the value takes `--text-error` and one sentence sits under
     the tiles: *At −3. Carry any leftover damage over by hand.*, matching a
     Pool past its boundary. Nothing unticks the form.
   - a `number` field without one is a plain number field; a `toggle` draws the
     ring; a `text` field is **read**, its words as written — edited under
     **Every form**, where it is **the action cells' one-row field that wraps**
     (a `<textarea>` one row tall, `field-sizing: content`, Enter commits and a
     line break is refused) with their hairline at rest, so a speed shows whole
     in a narrow tile rather than clipping. A text vital floors at about 8em of
     the field's size and grows with the row.
   - **a form's `=` on a component's single number is a vital too**: whatever
     a modifier field sets outright on a component's own value — one whose
     published name is its label alone, with no ` · <key>` — is drawn as a
     tile after the fields', the component's label above the number it is set
     to, and left out of the changes list. In the harness sample Brown Bear's
     `armour_class = 11` reads *Armour class* over *11* beside HP and Speed. It
     is read on both faces; the modifier glyph is where it is edited. One not
     applying is muted and says why in words beside the number, as the list
     does. An addition, an at least, and an `=` on a part of a component — an
     entry of a Card set, a row of a Table — stay in the list.
4. **The changes**, one section per `modifier` field, their items under the
   heading with no box of their own, headed by the field's own name (*Modifiers*) with the `zap` glyph beside the heading that opens
   `ui/anchored-panel.ts` with `renderModifierForm` inside it. The heading is
   the glyph's visible label, and its accessible name (`Brown Bear Modifiers: …`)
   contains it. The changes are **compact items, one line per component they
   reach**, joined by ` · `. What a line reads is built from the names the sheet
   publishes today, `<component> · <key>` for a named entry and the component's
   label for a bare one — published names have no labels of their own yet (the
   owner deferred that contract change; it is a BACKLOG row at land):
   - a named entry is its key and its outcome, grouped under its component:
     *STR +4 · DEX +0 · CON +3*;
   - a bare component is its label — though an `=` on one is a vital (item 3), so
     the list holds a bare label only for an addition or an at least;
   - a set number is signed on a named entry and plain on a bare one, on the
     reading that an entry of a set is a modifier and a component's own number a
     total; an addition and an at least keep the outcome's own words (*item +2*,
     *at least +3*);
   - a part that is not applying — an at least the number is already past — is
     drawn muted, and the list states the reason in words beside it, *(already
     higher)*, so it is never colour alone; the breakdown says it too.
   In the harness sample Brown Bear's lines read *STR +4 · DEX +0 · CON +3*,
   *perception at least +3 (already higher) · stealth at least +3* and *CON +5*
   (its Constitution save), its armour class a
   tile. Where every change a field makes is a tile, the section keeps
   its heading and glyph and draws no *No changes*. **Where it
   falls short of the owner's example** (*STR +4 · DEX +0 · CON +3* / *AC 11* /
   *Perception at least +3*): the bare label is the component's whole label,
   *Armour class* rather than *AC*, and a Table row is its key, lower case,
   *perception* rather than *Perception*, because the row's label is not
   published. Both close with the deferred labels. A value the character's sheet
   does not take a modifier for — speed, in the 5e starter — is a `text` or
   `number` field of the form instead, and changes nothing outside the panel.
5. **The actions**, where `actions` declares columns: a section headed
   `actionName` holding **the sheet's own Table** — `.sheetsmith-table` in
   `.sheetsmith-table-box`, so the Table's header row, row rules, row hover and
   framed surface — **on the tiles' surface, its header a gentle step off it**,
   on both faces (amended after the owner found a stronger step too heavy
   beside the tiles): the body is `--background-secondary`, the HP, Speed and
   Armour class tiles' fill exactly, so the table is one of the stat block's own
   surfaces; the header lays half of `--background-modifier-hover` over it
   (`color-mix`, 50%; 246 to 238 light, 40 to 47 dark), which stays under the
   Table's row hover, a whole step on the row (230 and 54), so a hovered row
   never reads as the header. Body text measures 14.7:1 light and 10.6:1 dark,
   muted header text 5.8:1 and 6.4:1. Scoped to the stat block; a placed Table
   is unchanged. Under more contrast its frame takes `--text-muted` with the
   other stat block edges — with **one column structure on both faces**, one
   `<colgroup>`: the name about 30%, a number about five characters read from
   its end in tabular figures, a text column the rest, cells wrapping rather
   than scrolling. In play the cells are text: the name is the row's header
   (`th scope="row"`), bold, with any wikilink still a live link; a number is
   signed (*+6*). No inputs and no **Add** here; the fields, **Add action** and
   the per-row delete are under **Every form**.
   - **A placeholder row is left out in play.** **Add action** writes a row named
     for `actionName` with every other cell empty, which is scaffolding to fill in
     under Every form; read as a row it would be an attack called *Attack* with
     no bonus and no damage. So In play omits a row whose name is still that word
     (or blank) and whose other cells are all empty, and says *None yet. Add them
     under Every form.* where nothing else is left. A row with a name of its own
     and no numbers — *Multiattack* — is a real action and is drawn. Every form
     shows every row, the placeholder included, since that is where it is filled.
6. **The prose**, a section whose heading is the disclosure named `bodyName`
   ("Details" by default): closed on first render, `hidden="until-found"` while
   closed (its box then takes no room), and the prose in a box in the card's
   clothes when open, as the changes are. The body is the
   form's prose: traits, the restrictions item 7 leaves as words.
7. **Foot.** A button **Every form (3)** that switches to the other face, in the
   add control's clothes (`.sheetsmith-record-add`) pinned to the foot, outside
   the scroll.

Two forms on draw the report under the head and each form's vitals and sections
in turn, each under its own name — **set apart by a rule above each name**, the
head's own rule at the section rhythm, and the name at `--font-ui-medium`
semibold, the title's next step down.

**One anatomy, two modes.** A form's stat block is drawn by one function in
both faces — the vitals' tiles and the sections, in the layout's order under
its headings (`sections`, below) — and the face decides only the mode. **In
play reads it**; **Every form edits it**: the same tiles with a text field a
field rather than words, the same changes with the same grouped items and
the edit glyph labelled **Edit changes** (its accessible name starts with those
words), the same action table with fields in its cells, and the same traits
box. An open form's line is its head there — its name at the title's size,
ruled off the same way. A ceilinged number's steppers and a toggle are controls in both.

**The action table under Every form** is In play's table with a field in every
cell, the name included — a one-row field that wraps, at one height, padding
and weight, so no cell is taller than its neighbours — plus a delete column at
the end and **Add action** as the box's foot, the Table's own add row
(`.sheetsmith-table-add-button`). **Each field draws a hairline at rest, inside
the cell's padding** — the cell's padding is the Table's less the field's
padding and border — so a field's text sits where In play's text sits, a cell
still reads as a field, and Speed's field and the cells share one treatment.
**In play's `<colgroup>` carries the same trailing delete column, left empty**,
so the percentages resolve against one width and *Bonus* and *Damage* do not
move on a face switch. A number reads signed in its field as in its row (`+6`); the
sign is the drawing's, so leaving it unchanged writes nothing and changing the
number writes it in the note's own spelling (`7`, not `+7`, where the note had
no sign). **A column heading that says what its section's heading says is hidden
from sight and kept for a screen reader** (`.sheetsmith-sr-only`): the name
column *Attack* under the section **Attack** says one word twice, while *Bonus*
and *Damage* stay. The test is by what a heading says, not by which column it
is, so a layout that heads the section otherwise shows the name column again.
**Add action** and the arm-then-commit delete are here. Under In play
the row is text, its name's wikilink live; the field under Every form shows the
link's source, as every field does.

**Traits**, in both faces: the body rendered as markdown with Obsidian's own
renderer — a paragraph per trait, so a `***Keen Smell.***` lead-in reads as the
trait's name — and edited as text only on a press, Record set's body gesture
(`record-controls.ts`'s `drawRecordBody`, the read-then-click-to-edit Rich text
set the precedent for, already shared rather than copied). No trait schema: it
stays prose. The harness has no app renderer, so it stands one in for this
component alone (`harness.ts`'s `standInMarkdown`: paragraphs and emphasis);
every other prose block in the harness keeps its plain fallback.

**Every form** is the library: every record in file order, each one line of
chevron, name field and delete glyph (Record set's summary-line vocabulary,
`.sheetsmith-record`, `-summary`, `-name`), the active one carrying a quiet
**Active** after its name, and **a closed one its vitals on the same line,
mirroring its tiles in their order** — each number field as declared, a
ceilinged one as `HP 22/34`, then each `=` the form sets on a component's single
number that applies, `HP 22/34 · Armour class 11` — so the list can be
scanned without opening each form; open, the line goes and the stat block under
it says them, and **the open form's name takes In play's title size**
(`--font-ui-large`, bold) — still the editable name field, its link layer
matched — so the form being edited is titled at the rank it is read under. A chevron opens that record's **edit form under it**, the exclusive
toggle still not drawn, so every form, active or not, is edited the same way
here. The chevron's focus ring is the keyboard's: a pointer press that focuses
it draws none (`bindDisclosure`).
Open records are view posture through `openRecords` / `onToggleRecord`.
**Add form** is the shared add control pinned at the foot: it appends a record
named for `recordName`, opens it, and lands focus in its name field. Beside it
in the foot, in the same clothes and split by a hairline, **Back to play**. Delete arms, then commits; deleting the active form leaves no
form active. Reordering is not offered: the note is the order.

**No exclusive configured** (a companion block): no picker and no faces. Every
record's stat block is drawn in turn, the first open, as the library draws
them, and every record's modifiers apply.

**Empty states.** No forms at all: *No forms yet.* and an **Add form** button,
which adds one and switches to **Every form**. Forms but none active: *No form
is active.* — and, where `spendOnPick` is on, *Choosing one spends a use.* The
noun is `recordName` lowercased throughout, so a Daggerheart layout says *No
beastform is active.*

**Error states.**

- **A configuration this component refuses** is its `configError`, on that
  component alone: `exclusive` naming a key no field declares, or a field that is
  not a `toggle`; a field keyed `uses` (reserved for the set-level counter); a
  `text` field declared as `exclusive`; `actions` with a column keyed like
  `actionName`; `sections` naming a part that is not `vitals`, `modifiers`,
  `actions` or `traits`, or naming one twice.
- **One form's fence will not read**: per record, Record set's rule. It is not
  offered in the picker (its toggle cannot be written), it is listed in **Every
  form** with its name, its body and a problem line, and its bytes survive every
  neighbour's write. If it was the active one, the panel says *Brown Bear is
  active in the note but its fields will not read* and draws nothing else for it.
- **The preamble fence will not read**: the uses counter draws a problem line in
  its place; the forms are unaffected.
- **Two forms on** (hand-edited): the picker shows one extra selected line,
  *Brown Bear and Wolf*, the way a Card's dropdown carries a stored value its
  list does not offer; the stat blocks of both are drawn in file order; and one
  line above them says *Brown Bear and Wolf are both active, so both apply.
  Choose one to keep.* Choosing anything writes one form on and every other off.

### Interactions, against `docs/UI.md` §6 and §7

No new gesture. The picker is a native select (its own keyboard, the phone's
own picker). Revert, Add, the face switch and the steppers are buttons with a
44px coarse-pointer target. Fields are `editable.ts`. Delete is arm-then-commit.
The body is Rich text's box. The modifier glyph is the anchored form. Where a
piece of Record set's body, name or number-field code is private to
`record-set.ts` and Stat block needs the same thing, **the build extracts it into
a shared module** under `docs/PATTERNS.md` §1's two-consumer rung, adds the
sibling allowlist entry and the `components/isolation.test.ts` line, and names
it in the land notes — never a copy.

**A switch is one write.** The previous form's toggle to `no`, the chosen one's
to `yes` (appending the entry where the fence has none), and — where
`spendOnPick` is on and the press turned a form on — `uses` down by one in the
preamble, all in one `onEdit`, so one save and one step back in the note's
history. At 0 uses the switch still happens and spends nothing, and the
announcement says *no uses left*: the reader may have a reason, and refusing the
press would be the plugin enforcing a rule it does not know.

**Phone width.** The component is its own reflow context (`container-type` on
its block, Passport's precedent in `docs/UI.md` §9), breaking at 360px of its
own width rather than the sheet's. Below it: the header keeps the label and the
rings on one line, the rings wrapping under the label first; **the picker takes
its own full-width line**, with **Revert** after it on the same line and
wrapping under it only where both will not fit; each stat line takes a line of
its own; the changes list wraps by part; the action table's cells wrap their
text and the table never scrolls sideways. The foot keeps its button whole.

### The tint

**A sheet-applied decoration, driven by a condition, drawn after render.** It is
neither a contract member nor a component's job. One module,
`src/view/placement-decorations.ts`, imports nothing from `obsidian` (so the view
and the harness both call it after `renderGrid`, on `grid-cells.ts`'s argument)
and is handed a list of decorations, each **a kind, a label, and the published
names it lands on**. v1 has one kind, `in-play`, whose condition is computed from
the modifier resolution: **a published name is in play where an applied line at
it came from a push flagged `inPlay`** — unsuppressed by the stacking rule, and
for an at least, only where it actually raised the number. A later `dimWhen` is a
second kind whose condition is a sheet-scope boolean formula and whose target is
a placement; it joins the same list and the same pass.

**Where a decoration lands: on the box the form changed, not on the number**
(amended after the owner's vault test, where colouring only the number read as
incomplete). The pass finds the owning component of each name (the segment
before its first `.`, which is §5's naming rule), then inside that component's
`.sheetsmith-cell` the values stamped with that name, and from each value **the
box it belongs to**:

- A value is stamped by one shared helper in `components/modifier-breakdown.ts`,
  `stampModifiedHost(host, name, box)`, setting `data-sheetsmith-name` on the
  value and `data-sheetsmith-box` on its box, called at the sites that already
  add `MODIFIED_CLASS` and so already know which element is which value and which
  box holds it.
- **Card**: the card, which is the placement's box.
- **Card set**: each card whose value the form changed — a form
  setting Strength and Constitution tints those two cards and leaves Dexterity,
  Intelligence, Wisdom and Charisma alone.
- **Roster**: in its table layout, the band head is a row and takes the row's
  rule for its box, and a row takes the row's rule; both unchanged by the
  amendment below (where the band head's tag rides is "The text mark", below).
  In its card layout, **the stat's score pill, and each row the form changed —
  never the card** (amended after the owner's 5e druid test). The rule above
  had a Roster card be the box, as a Card set's is,
  which is right for a card holding one number and wrong for a Roster card,
  which holds a score, a reading and a table of rows that each move on their
  own. Cat form raised Dexterity's score and floored Stealth, and the whole
  Dexterity card took the fill and the outline — label, pill, reading and every
  row — so the floored Stealth row, already its own box, could not be seen
  against it. Narrowed, Cat form tints Dexterity's score pill and its Stealth
  row and Strength's score pill alone, and neither card takes a fill or an
  outline:
  - **A pushed score's box is its pill**, `.sheetsmith-card-value`, the field's
    own wrapper, which the card already draws as a bordered pill
    (`.sheetsmith-card-has-derived .sheetsmith-card-value`). The score names it
    as `closest('.sheetsmith-card-value, tr')`, which in the table layout is
    still the band's `tr`. The pill alone, not the pill and the reading as one
    region: the card draws its label, its reading and its pill as siblings in
    `card-face.ts`'s order, so no element holds the two, and a wrapper round
    them would move the Card set clothes Roster borrows by building the same
    DOM shape (`roster.ts`, `drawBandHead`).
  - **The reading keeps its modified underline and takes no box**: it publishes
    the same name as the score, and it moved through its formula over the stat,
    which is "The tint marks what a form sets" below. Wherever the score field
    carries the stat's name, the reading is stamped modified with no name, so
    the pass never finds it; Roster works out the field's `differs` before it
    draws the reading, which comes first in the card's order.
  - **A pushed row's box is its row**, the Table rule and its corner rounding,
    a card's mini table included, as today.
  - **The pass's box lookup is unchanged** (`closest('[data-sheetsmith-box]') ??
    host`). Where the field carries no name — a layout with no `effective`, so
    a push moves only the reading — the reading keeps its name and the card as
    its box, so that card is tinted whole, as today. Deliberately not done.
  - **A card with `hideValue` keeps the card as its box**: it draws no pill,
    and its reading has no chrome of its own to fill, so giving it a box would
    be a new surface. Deliberately not done.
- **Table**: the row the changed value sits in.
- **Pool**, **Track**, and any later component that stamps nothing: the
  placement's own box, with no code in the component — **a component that stamps
  nothing is still tinted, at its box.**

**What it looks like.** The box takes a fill mixed from the accent into the
surface it already wears — `color-mix(in srgb, var(--interactive-accent) 12%,
transparent)` laid over the box's own background as an image, and on a table row
over each of its cells, since a row's cells paint their own — and a 1px `outline`
in `--interactive-accent` at `-1px` offset, an outline rather than a border or a
shadow so the box model is untouched and forced colors keeps it. **A table row
draws neither itself**: its cells paint their own backgrounds, the pinned name
cell on a layer of its own, so each cell — name included — takes one fill layer
and its share of one outline, as inset shadows top and bottom with the start
edge on the first cell and the end edge on the last; forced colors, which drops
a shadow, draws the row's top and bottom rules in `Highlight` instead, and a
`Highlight` rule at each end — the first cell's start, the last cell's end — so
the row is closed on all four sides as a card's outline is. **A row at a
corner of its scroller takes the scroller's corner**: the scroller rounds at
`--radius-m` and clips to that curve, so the corner cells of a last body row
(no foot after it, no add control under it) and of a first body row under no
heading row take its inner radius, `--radius-m` less its 1px border, and the
fill and the inset outline follow the curve rather than being cut by it — in a
plain Table and a Roster alike, a card's mini table included. A foot is read
from Table's `sheetsmith-table-has-totals` and a missing heading row from
Roster's `sheetsmith-table-headless`, not from `:has()`. Forced colors, whose
collapsed table borders take no radius, draws that row's outer rules on a layer
over each of its cells instead, which takes the cell's radius, so the
`Highlight` rules follow the curve too; a first row under no heading row draws
its own top there, having no rule above it to repaint. **The number
keeps its modified underline**, which is the component's, so a reader still sees
which value in the box moved.

**The text mark** is once per placement, a small pill naming the form,
`--font-ui-smaller` (the card label's fixed-pixel size, so its overhang fits the
fixed padding at any text size), `--text-on-accent` on `--interactive-accent`, clipped at 12ch
with `ui/truncation.ts`'s reveal and carrying a `.sheetsmith-sr-only` twin,
*Changed by Brown Bear*; two forms on read *Brown Bear, Wolf*. **It rides the
first box tinted, in reading order, laid over the box and taking no room**, so
it is never on a label or a value, never over a box the form left alone, and no
line is reserved for it — a box is the same size with the form on as off:

- **Card, Pool, and a Card set's or a Roster's card**: on the box's **top edge
  at its inline-start corner**, overhanging the edge by under a third of its
  height (`translateY(-30%)`, about 3px) and the rest in the box's top padding,
  which leaves 5px of the sheet's 8px gap to the box above — measured, at the
  default size, at text=24 and on the narrow Armour class under Intelligence —
  and about 2px above the label's capitals. That corner is the one every box leaves free:
  the label starts below the padding, the value and a card's score pill are
  lower, and the top inline-end corner holds a card's note mark and a Pool's
  door. Two corners were tried first. The foot covered the score's pill, which a
  narrow card fills edge to edge; a tab flush inside the top inline-start corner
  covered the label's first letters on a card under about 200px, where the
  centred label reaches the corner. On the edge it clears both at any width.
  It is one tight line (`line-height: 1.1`) at the card label's fixed-pixel
  size with its edge an outline, so the part inside fits the padding above the
  label at any text size, and it takes the pointer so a clipped name's reveal works. In a Card set the pill is on the
  first tinted card, not the set's edge.
  *This bullet records the placement this section first settled.
  `docs/features/stat-block-zones.md` later moved the tag to the box's
  **bottom edge at its inline-end corner**, inside by exactly the box's bottom
  padding and the room every card reserves for it, because on the top edge its
  clearance was slack against a font's ink. That is what the code,
  `docs/UI.md` §9 and `SPEC` say, and what the Roster bullet below builds on.*
- **A Roster card** (amended after the owner's 5e druid test, and again after
  the owner's review of the build): **where the first tinted box is a score
  pill, the tag rides the card that holds it**, at the corner a card's tag
  takes — the bottom edge at its inline-end corner, inside by the card's bottom
  padding and the room every `.sheetsmith-card` reserves, tagged or not — and
  the card takes `sheetsmith-in-play-marked` and never `sheetsmith-in-play` or
  the tint attribute, so it carries the tag but no fill and no outline.
  - **The tinted pill is what marks the moved value; the tag only names the
    form**, so it keeps the card's corner even where that corner sits by an
    untinted row — a Strength card's Athletics, with only the score pushed.
    A land-stop review ruled the opposite (a tag never next to an untinted row)
    and moved the tag beside the pill. The owner reverted that after seeing it
    built (see "Deliberately not doing").
  - **A score pushed with a row of the same card is one tag, at the card's
    corner**: the pill comes first in reading order, and the row carries only
    its tint.
  - **Row first** — a form that pushes a row and no score before it — **the tag
    stays in that row's name cell**, the Table rule, as today (the owner's
    decision: on the card's corner a row-only change would put the tag beside
    an untinted score, and read as the score having moved).
  - **Not on the pill**: the pill is about 4em of score and its padding,
    narrower than the tag's 12ch, and its bottom padding is 2px where the tag's
    geometry puts a card's 10px inside, so the tag would cover the score and,
    hanging below, the card's first row.
  - **The carrier is stamped, not inferred and not `:has()`**:
    `stampModifiedHost` takes a fourth argument, `tagBox`, written as
    `data-sheetsmith-tag-box` and declared beside `data-sheetsmith-box` in
    `modifier-breakdown.ts`, so the one route to the mark stays one. Roster
    passes the card for its score and its reading. The pass puts the tag on a
    first box that is a row in its name cell, and otherwise on
    `first.closest('[data-sheetsmith-tag-box]') ?? first`.
  - **No stylesheet rule is added**, `container-type` included: the tag takes a
    card's existing placement, its room already reserved; `pickTagText` reads
    the card's own surface, which wears no tint layer; the pill takes
    `.sheetsmith-in-play:not(tr)`'s fill and outline, which follow its
    `--radius-l`; and a focused pill shows the card's focus ring over its
    outline, the focus rule being the more specific, and keeps its fill.
- **Table, and a Roster's row**: a row has no free corner — its start holds the
  name (and a ring, where the table has one) and its end the value — so the pill
  is laid over the name cell's inline end, centred on the row, in the slack
  between the name and the numbers that the name cell takes by design. A name
  long enough to fill its cell runs under it. A Roster's table layout keeps
  this rule for its rows; its band head has no name cell and takes the bullet
  below.
- **A Roster's band head** (amended after the owner found it on 2026-11-11, in
  a table-layout Roster on a copy of the 5e druid layout, and again after the
  design review): **the tag rides the inline start of the band's second line,
  the reading's line**, laid over the slack before the reading and centred on
  that line; **only at one column**, where the score and the reading wrap under
  the name to the line's start, it falls back to the inline start of the name's
  line, centred on it. The band head is one `tr`
  holding one `td.sheetsmith-roster-band-head` across every column, its
  `.sheetsmith-roster-band-inner` a wrapping flex line: the name
  (`.sheetsmith-group-heading`, `--font-ui-medium` at `line-height: 1.3`,
  19.5px, centred by the table's cell rule) takes the line's slack, and the
  score and the reading stack at the inline end, each at
  `--sheetsmith-card-value-size`, so the head is about 72px tall with the name
  on the score's baseline at its top. Before the fix the band had no
  `th[scope="row"]`, so the pass appended the tag to the `tr` itself: the
  tag's containing block resolved outside the band (`-marked:not(tr)` excludes
  a `tr`) and it drew nowhere, and as the `tr`'s `:last-child` the span took the
  inline-end edge `tr.sheetsmith-in-play > :last-child` meant for the cell.
  - **The carrier is the band's tag line, stamped**: in the table layout
    `drawBandHead` draws `.sheetsmith-roster-band-tag-line`, an empty first
    flex item of the inner, a sibling before the name rather than a wrapper
    round it, drawn whether or not a form is on so nothing moves when one
    turns on. It is zero wide, gives the column gap back with a negative
    margin, and stretches to the first flex line's height. `drawBandHead`
    hands it to `drawValueField` and to `drawDerivedReading` as their
    `tagBox`, the argument a Roster card already passes its card through, so
    the tag line carries `data-sheetsmith-tag-box` wherever the band's score
    or its reading is stamped, a layout with no `effective` or a hidden score
    included. The pass, given a first box that is a `tr` with no row name,
    looks **down** for its carrier
    (`first.querySelector('[data-sheetsmith-tag-box]')`), since the tag line is
    inside the row where a card holds its pill from outside; failing that, the
    row's first cell. **A tag is never a direct child of a `tr`.** The tag line
    takes `sheetsmith-in-play-marked` and so `position: relative`, and no fill
    or outline; the `tr` keeps the tint and its cells the shadows. The name,
    `.sheetsmith-group-heading`, carries nothing.
  - **The geometry is a row tag's, mirrored**: the pill takes
    `sheetsmith-in-play-mark-inline` (16px tall, centred on its line by
    `translateY(-50%)`) and one rule under `.sheetsmith-roster-band-head`
    moves it to `inset-inline-start: 0`, 12px from the table's edge (the
    cell's 8px and the inner's 4px), capped at 12ch. **It is placed on the tag
    line's height**: where the score and the reading sit beside the name, the
    first flex line is the whole band, so the tag line spans it; where they
    wrap, it spans the name line alone. The tag's
    `inset-block-start: max(50%, calc(100% - var(--sheetsmith-band-reading-line) / 2))`
    centres it on the reading's line, the band's last, and falls to 50%, the
    name line, when that is all the tag line spans.
    `--sheetsmith-band-reading-line` is an `@property` length,
    `calc(var(--sheetsmith-card-value-size) * 1.05)`, copying
    `.sheetsmith-card-derived`'s `line-height: 1.05`, which a `styles.test.ts`
    case holds equal. A band with only a score or only a reading has one line
    beside the name and the tag centres on it. **Only at one column does the
    band wrap**: no container query or breakpoint drives it, the inner being a
    wrapping flex line, and measured it never wraps on a 380 sheet or with the
    Roster at two or three columns. **Why line two**: the design review's
    `harness/shots/sheet-forms-roster-band-narrow.png`, at 380px, showed the
    tag on the name line covering the name, *[Brown Bear]onstitution*: the
    score had not wrapped yet, so the centred *Constitution* left about 75px of
    leading slack and a two-word tag is about 80px. A short name, not the long
    one the first placement allowed to run under it. The reading's line holds
    only the reading, at the inline end, so its inline start has about 260px of
    empty slack at 380 and at full width, and the tag reaches neither the name
    above it nor the score, the reading or the note mark beside it. At one
    column the name line is the only line with slack at its start, the score
    and the reading being on the lines under it, so the tag falls back there;
    16px sits inside the name's 19.5px line, so it reaches no other line, the
    UI sizes being fixed pixels. A name long enough to reach it there runs
    under it, as a row's name does, and the reveal answers a clipped tag.
  - **It sits by nothing the form left alone**: it is inside the band's own
    head, above the band's rows, and a tagged band is tinted, so the
    tag is never over an untinted box. **A band head tinted with one of its
    rows is one tag, on the band head**: the band's `tr` comes before its rows,
    so it is the first tinted box, and the row carries only its tint. A row
    tinted in an earlier band keeps the tag in its name cell, the Table rule.
  - **The outline closes on all four sides.** With the span gone, the band's
    one cell is both `:first-child` and `:last-child`, and the two shadow rules
    each set the whole `box-shadow`, so the later one would drop the start edge
    in its turn. A `tr.sheetsmith-in-play > :only-child` rule draws all four
    edges. **The bottom edge was missing too**: the owner's check in Obsidian
    showed it as a corner stub on both tinted bands, the untagged one
    included, because the inner's own hairline paints over the cell's inset
    bottom shadow. So on every tinted band, tagged or not, the hairline takes
    `--sheetsmith-tint-edge` (2px of the shadow still showing under more
    contrast). **In forced colors the band's cell carries its own full-width
    bottom rule** (style `solid`, its colour from the existing repaints of a
    row's rules) **and the inner's hairline drops**: the hairline sits inside
    the cell's inline padding, so as a tinted band's bottom it stopped short of
    both end rules, and as the rule above a tinted row it was no cell's for the
    repaint to reach. Untinted bands therefore draw a full-width bottom rule in
    forced colors too, like every other row, at the same height. Descendant
    rules on the stamped class, no `:has()`.
  - **The tag's text is measured on the band's tint**: `pickTagText` reads the
    box's tint layer off the carrier, which on a band is the tag line, wearing
    none; it reads the layer from the nearest element at or above the carrier
    that wears one instead, which is the band's cell. A card carrier still
    finds none and reads its plain surface, as today.
  - Rejected: **the name line's inline start at every width**, the first
    placement — at mid widths, before the score wraps, a short centred name
    leaves less slack than a two-word tag and the tag covers the name (the
    380px shot above); **the cell's bottom inline-start corner** — rejected at
    the first pass for one column, where the score and the reading wrap to the
    line's start, which the name-line fallback now covers; **the cell's bottom
    inline-end corner, as a card's tag** — that
    is where the reading sits, the band reserves no bottom padding for a tag,
    and hanging below it lands on the first row's value; **beside the centred
    name's text** — an absolute tag cannot find the end of centred text
    without a wrapper round the words, and the wrapper changes the DOM the
    band shares with a Roster card; **inline after the name** — in flow it
    takes room, moving the centred name off centre and, at one column, onto a
    second line when a form turns on, against "a box is the same size with
    the form on as off"; **the row rule, the inline end centred on the band**
    — it would cover the score and the reading, the value the form changed.

The colour is never the only channel (WCAG 1.4.1): the outline is a shape, the
pill is words, and the underline marks the number. Under `prefers-contrast: more`
the fill is dropped and the outline is 2px. **No literal colour**, so
`docs/UI.md` §1 holds; §4.2's "a shape rather than a colour" is amended for the
form's values alone, as scoped above (the docs commit below).

**The breakdown stays the detail behind it.** Its lines already carry the row's
label, so a line from a form names the form — *Brown Bear — sets to 4* — and the
press on the number is unchanged. An at least that did not raise the number is
listed with its reason, *Brown Bear — at least +3 (not applied: already
higher)*, which is the
"own, higher" of the sketch, stated where the stacking rule's other reasons
already are, and that value stays untinted.

**The tint is scoped to the active form, and an ordinary modifier keeps the
shape-only mark.** A value an item, a condition or a typed one-off changes draws
exactly what it draws today: the underline and the breakdown behind it, no fill,
no outline, no pill. Only a value changed by a form that is on — an applied line
from a push flagged `inPlay` — adds the tint, and it adds it *on top of* its text
mark: the fill and outline say "the form did this", the pill names the form, and
the underline still says the number moved. So §4.2's rule that a modified number
takes "a shape rather than a colour" stands for every modifier but one source,
and the amendment says so in those words rather than replacing the rule.

**The tint marks what a form sets, not everything that moved.** A form pushing
`abilities.STR = 4` tints Strength; Athletics and the Strength save move too,
through their own formulas, and stay untinted, because nothing was pushed at
them — their breakdowns are unchanged and their numbers are simply the formula's
over a tinted input. Tinting every dependant would need the dependency graph at
render time, which a `compute` hides by design (§4.1), and it would paint half a
5e sheet for one form, which is the opposite of a reading.

**What it does not reach:** a Tab set's strip (a tinted component in a hidden
tab tints nothing on the strip), and the Stat block itself (nothing pushes at
it).

### Ability scores, and what a typed value lands on

**The stat block shows the modifiers a form sets, not its ability scores.** A
form's changes section lists what it pushes — `STR +4 · DEX +0 · CON +3` — and
nothing in the component stores or draws a score: a beast's Strength 19 is
entered as the modifier it gives, `abilities.STR = 4`. A layout wanting the
scores on the block as reference can declare a `text` field for them, which
changes nothing outside the panel. (An owner call is open on whether the block
should carry scores natively; this is what is built.)

**A form overrides ability *modifiers*, not scores.** A Brown Bear's Strength 19
is `abilities.STR = 4`: the Card set's `derived` is the published name, an
override is result phase and replaces what it came to, and the value pill keeps
showing the stored score, the druid's own 10. The card is tinted and its derived
carries the breakdown naming the bear. Value-phase overrides stay deferred
(`src/types.ts`'s `ModifierPhase` comment records why).

**A value the reader types while in form lands on the base, always, and by
construction rather than by a rule added for forms.** An override is result
phase and is applied to the published evaluation only; every editable field
holds and commits the *stored* value — a card's pill swaps to the stored number
on focus (§4.2), a Table's computed cell is read-only, a level cell stores the
training, and the druid's own `hp` is not the form's HP. So typing 12 into
Strength while a bear writes `STR: 12` and the card still reads +4; reverting
shows +1. An acceptance criterion pins it.

**5e starter formulas that read a raw score**, listed per the brief: the only
one is **`capacity`, `abilities.STR.value * 15`**. It cannot be routed through
`mod.self` — it reads a score, and a form changes modifiers — so it is a
**known limit**: a druid's carrying capacity stays their own in form. No other
starter formula reads `.value` of an ability (`hit_dice.value` is a Pool's).
**The second known limit is `speed`**, a Card with no `derived` and so no
modifier target (the starter section below): the druid's speed card does not
follow the form, and the form's own speed is read off its stat block.

### The 5e starter (`src/starters/5e.json`)

A starter change for the release notes; it reaches only layouts installed from
now on, and rewrites nothing in any vault (§3.2).

- `abilities.derived`: `mod(value)` → `mod(value + mod.self)`, which is what makes
  the six abilities modifier targets at all — today none of them is, so an
  override pushed at one would change nothing.
- `saves` `Total`: `ability + Prof * prof` → `ability + Prof * prof + mod.self`.
- `skills` `Total`: `ability + Training * prof` → `ability + Training * prof +
  mod.self`.
- `speed` is **left as it is**, with no `derived`, so it is not a modifier
  target and a form's speed does not reach the druid's speed card. That is a
  **known limit**, beside `capacity` above: the form's stat block shows its own
  speed as a field, and the card keeps the druid's.
- `Bark Skin` (a starter definition) moves from `override` to `upgrade`
  (**At least**), since the spell is a floor ("can't be less than"). Listed for
  the release notes.
- **A Forms tab**: a Stat block `forms`, labelled **Forms**, as a direct child of
  the `pages` Tab set (5 × 10, after **Equipment**), built from the Forms entry
  plus a `Speed` text field, `actions` columns `Bonus` (number) and `Damage`
  (text), `actionName` "Attack" and `bodyName` "Traits". **No forms**, by §11. `uses` left blank: the
  starter is class-agnostic and a fighter would otherwise carry two dots for
  ever; a druid's layout sets it in one field.
- **Long rest** gains two bindings on `forms`: `column: "Active"`, `empty` (no
  form active after a long rest), and `column: "HP"`, `full` (every form's HP to
  its own ceiling, skipping forms with none, Record set's rule).

### Polymorph, and a Conditions row

**Polymorph is a form.** A Polymorph row on a Conditions Table stacking against
an active form resolves by the existing rules — two sources pushing at one name
— and that is wrong for 5e, where Polymorph replaces the shape the druid is in.
The documented answer, in §4.2's Stat block entry and the Forms entry's spirit,
is to add Polymorph to the forms. No rule makes a Conditions row and a form
aware of each other.

### The three worked examples

Each is expressible through layout alone, and each is in the vault fixture.

- **5e beast** (Brown Bear): fields `Active` (toggle, exclusive), `HP` (number,
  `maxSource: 'record'`), `Speed` (text), `Modifiers`; actions `Bonus`,
  `Damage`; body "Traits". Record: `Active: yes`, `HP: 22 / 34`,
  `Speed: 40 ft., climb 30 ft.`, `Modifiers: abilities.STR = 4;
  abilities.DEX = 0; abilities.CON = 3; armour_class = 11;
  skills.perception >= 3`; attacks Bite +6 `1d8+4 piercing`, Claws +6
  `2d6+4 slashing`; body *Keen Smell…*.
- **Daggerheart Beastform** (Agile Scout): fields `Active`, `Tier` (number),
  `Stress cost` (number), `Attack` (text: `Melee, Agility, d4 phy`),
  `Modifiers: evasion += 2; traits.agility += 1` — additive, the Daggerheart
  combine rule. **No HP field**: the layout simply declares none. Marking Stress
  is the reader's press on their own Stress track; `spendOnPick` reaches only
  this component's own counter.
- **Werewolf form** (Crinos): fields `Active`, `Modifiers` only:
  `attributes.strength += 4; attributes.dexterity += 1; attributes.stamina += 3;
  attributes.manipulation += -2`. **Homid** is a form with no changes, the known
  limit in item 2.

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `recordName` | text | Record name | What one record is called. Names the add control, the empty states and a new record's heading in the note; changing it renames no record already written. Defaults to "Record". |
| `fields` | columns | Fields | The typed values every record holds, each an entry in that record's fence: number, toggle, text or modifier. Removing one leaves its entry in every note untouched; a text field refuses a wikilink, since a fence hides links from Obsidian. |
| `exclusive` | text | One at a time by | The key of a toggle field. Choosing a record turns it on and every other off in one write, and only that record's modifiers apply and tint the sheet. Blank draws every record at once and applies all of them, as a companion block. |
| `uses` | formula | Uses | The ceiling of a counter kept above the records, drawn as dots and stored once for the whole list. Blank stores and draws no counter; an existing count stays in the note. |
| `spendOnPick` | boolean | Choosing spends a use | With Uses set, turning a record on spends one use in the same write; turning it off spends nothing. Off by default. |
| `actions` | columns | Action columns | The columns of a table at the head of each record's body, for attacks or actions: text or number. Blank keeps any such table in the note and draws it as part of the body's prose. |
| `actionName` | text | Action column heading | The heading of the action table's first column, which names each row. Defaults to "Action". |
| `bodyName` | text | Body heading | What the disclosure over each record's prose is called. Defaults to "Details". Changes nothing in the note. |
| `sections` | columns | Sections | The order a form's parts are drawn in, each keyed `vitals`, `modifiers`, `actions` or `traits`, with the heading over it. A part left out is drawn after the listed ones, so nothing a form holds is hidden. Blank draws vitals, modifiers, actions, then traits, under the field's name, the action column heading and the body heading. Changes nothing in the note. |
| `hideLabel` | boolean | Hide label | Hides the component's name above the panel. The section heading in the note is unchanged. |

`reset` is the editor's. `formulaFields`: `uses`, `reset.*.to`. **No
`reset.*.where`**: a form-scoped rest has not been asked for, and declaring it
obliges honouring it (`docs/PATTERNS.md` §8).

**The Forms palette entry.** Name **Forms**; description *Forms the character
takes on one at a time, such as wild shape, polymorph or a werewolf.* (88
characters). Prefill, and nothing else:

| Key | Value |
| --- | --- |
| `recordName` | `Form` |
| `fields` | `Active` `toggle`; `HP` `number` with `maxSource: 'record'`; `Modifiers` `modifier` |
| `exclusive` | `Active` |

Both §4.2 registry rules hold: every prefilled key (`recordName`, `fields`,
`exclusive`) is a config field Stat block renders, and Forms is the type's only
entry. No `uses`, `actions` or `bodyName`: each is one system's number or word,
and the entrance test is about findability, not saving typing. `contract.test.ts`
gains `stat-block bare`, `stat-block Forms` and `stat-block example` in `SWEPT`.

**Component description** (≤90, a shape and never a job): *Records drawn as stat
blocks, optionally one in play at a time under a picker.*

## Data and file model

````markdown
## Wild Shape
```sheet
uses: 1
```

### Brown Bear
```sheet
Active: yes
HP: 22 / 34
Speed: 40 ft., climb 30 ft.
Modifiers: abilities.STR = 4; abilities.DEX = 0; abilities.CON = 3; armour_class = 11; skills.perception >= 3
```

| Attack | Bonus | Damage |
|---|---|---|
| Bite | 6 | 1d8+4 piercing |
| Claws | 6 | 2d6+4 slashing |

Keen Smell. The bear has advantage on Wisdom (Perception) checks that rely on smell.

### Wolf
```sheet
Active: no
HP: 11 / 11
Speed: 40 ft.
Modifiers: abilities.DEX = 2; skills.stealth >= 4
```
````

- **The preamble** is `records.ts`'s, preserved untouched. Stat block reads the
  first `sheet` fence in it through `parse/fenced.ts` for `uses`; every other
  entry and any prose there survive. The first write of a count inserts the
  fence at the preamble's head.
- **A record** is Record set's exactly: heading, fence, body; identity is
  position; a new record appends.
- **The action list is the body's leading markdown table**, and that is the
  decision the brief asked to be justified. A table at the head of the body —
  the first non-blank lines — is the list; a table anywhere else is the reader's
  own prose. Read and written by `parse/table.ts` (`readTable` / `writeTable`
  already preserve every byte around a table and every unchanged row), and the
  body's prose is what follows it, on `parse/markdown-body.ts`'s framing. **Why
  not a declared field**: a fence is one `key: value` line, so a list of attacks
  would be `Attack 1: Bite | +6 | 1d8+4` — plugin syntax inside a value — and
  every cell would be free text inside a fence, which Constraint 2 forbids a
  link in; *Bite* as `[[Bite (Brown Bear)]]` is reasonable and would be refused.
  **Why it is not the nested record Record set closed**: a row has no body, no
  fence, pushes nothing, publishes nothing and is identified by its position in
  one table, which is a Table row's definition (§2), not a record in a record.
  **Constraint 2** holds because the table and the prose are plain markdown, and
  every free-text route *into the fence* — a `text` field, a number field, a
  modifier part — refuses a link at the commit with `components/fenced-link.ts`'s
  sentence, Record set's rule. **Constraint 3** holds per piece: `records.ts`
  for the records, `fenced.ts` for each fence, `bounded-entry.ts` for `22 / 34`,
  `table.ts` for the list, `markdown-body.ts` for the prose.
- **The smallest version stores exactly this**, and draws the leading table as
  part of the body's markdown, so the full version changes the drawing, not the
  file.
- **`>=` in a cell**: `target >= amount [as type] [when cond] [note: text]`. The
  assignment shape widens from `+=` / `=` to `+=` / `>=` / `=`, matched before a
  bare `=` and anchored at the start, so `skills.stealth >= 4 when
  abilities.DEX >= 14` reads its condition's own `>=` as a comparison. **No `to
  result` clause** and no stored `applies`: at least is result phase by
  construction, so the clause is dropped in a cell and refused in the editor, as
  for an override. The corpus gains that exact cell and must round-trip it byte
  for byte. **Two edges, recorded rather than handled**: a part a note holds
  today reading `x >= 3` is a stray name and becomes a typed at least (no
  layout or note is known to hold one); and a definition *named* in that shape,
  legal today, becomes unreachable from a cell — the editor's existing
  assignment-shape refusal on a promoted name widens with the regex.
- **`"operator": "upgrade"` in a layout** is read by `operatorOf`, which gains the
  case. **An older plugin reads it as `add`** — `operatorOf`'s safe default — so a
  layout saved by this version and opened by an older one adds 4 to Stealth
  rather than flooring it. Nothing guards it, so the release notes say it
  (Release notes, below).

**The arithmetic.** Where today a published name is `base + resultTotal` with
`base = override === null ? formula : override + valueTotal`
(`formula/resolve.ts`, `withPublishedModifiers`), it becomes **`max(base,
highest at least) + resultTotal`**: value-phase additions stay inside the formula
(and are re-added under an override, as now), at least floors what that came to,
and result-phase additions land on top. This is the brief's `max(override ??
formula, …)` read against the shipped override rule rather than a change to it.
Several at leasts take the highest and list the rest suppressed (*a higher at
least applies*, or the tie wording). Not a number: the formula's own value, as
for a result-phase addition. **Whether the at least raised the number is one
fact**, recorded where the published evaluation computes it and read by both the
breakdown and the tint pass, so the two cannot disagree; `ModifierResult` and
`ModifierBreakdown` carry `atLeast` beside `override`.

**Gating by the exclusive toggle.** Where `exclusive` is set, `scopeModifiers`
pushes **only the parts of records whose exclusive toggle is on**, each flagged
`inPlay`. "Only the active form" means exactly that — only forms that are on —
so a note hand-edited to hold two forms on pushes both, and both apply and tint
while the report stands (model item 2); gating never picks one of them. So a form's modifiers need no `when Active` — writing one is legal and
redundant — and forgetting it cannot make every known form apply at once, which
is the failure a library of twelve beasts would otherwise be one omission from.
This is the component choosing which rows enrol, as a Table pushes every row;
it decides nothing about what a modifier means. Without `exclusive`, every
record pushes, unflagged, and a part's own `when` is the only condition.

**Reset.** `resetColumns`: each `number` and `toggle` field by key, plus `uses`
where it is set. `empty`, `full` and `formula` on a field mean exactly what they
mean on a Record set field (the record's own ceiling, skipping records with
none, toggles derived from the number), and on `uses` what they mean on a Pool
(0, the `uses` ceiling, the resolved number). **No `resetWhole`**: a binding names
its part, on Table's terms. The per-record arithmetic is Record set's; where it
is private to `record-set.ts`, it is extracted, not copied (Interactions).

**Existing notes.** Nothing reads them. A section a Stat block finds under its
label that a Record set wrote reads as records with no preamble fence, which is
§10's adoption rule working and the same report.

## Acceptance criteria

**The operator**

- [x] `parse/modifier-cell.test.ts`'s round-trip corpus holds
      `skills.stealth >= 4 when abilities.DEX >= 14` and it round-trips byte for
      byte, parsing as target `skills.stealth`, operator `upgrade`, amount `4`,
      condition `abilities.DEX >= 14`.
- [x] A cell `skills.stealth >= 4 to result` drops the clause on write, as an
      override's does, named in a test.
- [x] `operatorOf({ operator: 'upgrade' })` is `upgrade`; `OPERATOR_LABELS` and
      the modifier form's operator select both offer **At least**, and choosing
      it disables the phase control as **Sets** does.
- [x] `formula/modifiers.test.ts`: with own Stealth 2 and an at least 4 the name
      is 4; with own 6 it is 6 and the line is suppressed *already higher*; two at
      leasts 3 and 5 give 5 with the 3 listed *a higher at least applies*; an
      override 18 plus value total 1 plus an at least 20 plus a result addition 2
      gives 22. The shuffling assertion still passes with upgrades in the mix.
- [x] The breakdown and the tint agree on whether an at least raised a number,
      asserted in one test over both readers.

**Exclusivity and the component**

- [x] `stat-block` is registered by one line in `components/index.ts`;
      `contract.test.ts` passes with `stat-block bare`, `stat-block Forms` and
      `stat-block example` added to `SWEPT` and no rule relaxed.
- [x] Choosing a form in the picker produces **one** `onEdit` setting the chosen
      record's `Active` to `yes` and the previous one's to `no`, every other byte
      of the section unchanged; with `spendOnPick` on, the same edit lowers
      `uses` by one, and at `uses: 0` it switches and writes no `uses` change.
- [x] Choosing **None**, and pressing **Revert**, each produce one `onEdit`
      turning every active form off; **Revert** is not in the DOM with no form
      active.
- [x] A section with two forms `Active: yes` renders both stat blocks, the
      picker's extra *Brown Bear and Wolf* line, and the report sentence; no
      write happens on render; both forms' modifiers apply.
- [x] With `exclusive` set, `scopeModifiers` pushes only the parts of records
      whose toggle is on, each `inPlay` — both records' parts where two are on —
      and with it blank every record pushes and none is `inPlay`.
- [x] An ordinary modifier (an item row, a Conditions row) changing a value
      draws the underline and no fill, outline or pill; the same value changed
      by an active form draws all four. Named in
      `view/placement-decorations.test.ts`.
- [x] `scopeValues` publishes `<id>.active` (boolean) only with `exclusive` set and
      `<id>.uses` only with `uses` set.
- [x] A record whose fence will not read is absent from the picker, listed in
      **Every form** with its problem line, and its bytes survive a switch on a
      neighbour.
- [x] A form at `HP: 0 / 34` draws the value in `--text-error` with the
      leftover-damage sentence, and its `Active` stays `yes`.
- [x] Switching away from a form and back leaves its `HP` entry byte-identical.
- [x] The action list: a body opening with a table draws it, under **Every
      form**, as rows whose cells commit through `writeTable` leaving the prose
      byte-identical, one commit per cell; a body whose table is not at its head
      draws that table as prose; **Add action** on a body with none inserts the
      header row and the new row at the body's head.
- [x] Both faces draw through one function (`drawForm`) in the layout's
      `sections` order: a listed order and headings are drawn as listed, an
      unlisted part follows in the default order, and an unknown or repeated
      part is a configuration error; absent, the order is vitals, modifiers,
      actions, traits.
- [x] Under Every form: the changes are the same grouped items as In play, the
      glyph labelled **Edit changes**; every action cell, the name included, is
      the same one-row field, a number reading signed (`+6`) and writing the
      note's own spelling; a column heading equal to its section's heading is
      in `.sheetsmith-sr-only` and the others are visible; an open form's name
      field takes In play's title size; a closed form's line carries its vitals
      (`HP 11/11`), gone while it is open.
- [x] **In play draws the action list as the sheet's Table with text cells**
      — `.sheetsmith-table` in `.sheetsmith-table-box`, a header row, the same
      `<colgroup>` as Every form's table, its delete column empty, no `<input>`,
      no `<textarea>`, the name the row's bold `th`, a number column signed
      (`+6`), a wikilink in a name still a link, a placeholder row left out
      while a named row with empty cells stays — and the head carries the form's name as its title with
      the uses, the picker and **Revert**; the changes read as compact items
      grouped by component under a heading that labels the edit glyph, except a
      form's `=` on a component's single number, which is a vital tile
      on both faces, muted with its reason where it is not applying.
- [x] (Under **Every form**, where they are fields.) A wikilink typed into a `text` field, a `number` field or a modifier part is
      declined with `fenced-link.ts`'s sentence; one typed into an action cell or
      the body is written.
- [x] Long rest on the 5e starter's `forms` writes `Active: no` on every record
      and each `HP` to its own ceiling, skipping a record with none, as one batch
      with one undo.
- [x] `configError` covers each case listed under Error states, one test each.

**Typed values land on the base**

- [x] On a sheet where an active form pushes `abilities.STR = 4`, committing 12
      into the Strength pill writes `STR: 12` to the note, the card's derived
      still reads +4 and the pill reads 12; with the form reverted the derived
      reads +1. Named in a sheet-level test.

**The tint**

- [x] `view/placement-decorations.test.ts`: a name in play tints the box its
      value belongs to — each changed card of a Card set (Intelligence, Wisdom
      and Charisma untinted), a Table's changed row — and never the number alone;
      one whose component stamped none tints the placement; a name whose at least
      did not raise its number tints nothing; the pill appears once per placement
      on the first tinted box, in the row's name cell on a table, with the
      form's name, and *Brown Bear, Wolf* with two forms on.
- [x] Card, Card set, Table and Roster stamp `data-sheetsmith-name` (and the box's `data-sheetsmith-box`) through
      `stampModifiedHost` at every site that adds `MODIFIED_CLASS`, and through
      no other path — asserted in each component's suite and by a scan in
      `isolation.test.ts`.
- [x] `styles.test.ts` finds no literal colour in the new rules; under
      `prefers-contrast: more` the fill is gone and the outline is 2px; the
      pill is absolutely placed on its box's top edge, the box reserves no line
      for it; forced colors rules a tinted row at both ends as well as top and
      bottom.
- [x] A breakdown line from a form names the form, and an unraised at least reads
      *Brown Bear — at least +3 (not applied: already higher)*.

**The tint on a Roster card** (amended after the owner's 5e druid test, and its
tag after the owner's review of the build)

- [ ] `roster.test.ts`: in the card layout, a stat whose `effective` moved
      stamps its field with its pill (`.sheetsmith-card-value`) as the box, not
      the card, which replaces *names its card as the box in the card layout*;
      the card carries no `data-sheetsmith-box`; the reading is marked modified
      and carries no `data-sheetsmith-name`, and with no `effective` it keeps
      its name and the card as its box; a computed row's box is still its `tr`;
      in the table layout the score's box is still the band's `tr` (*marks the
      value field and names the row*, unchanged). The card carries
      `data-sheetsmith-tag-box`, written through `stampModifiedHost`'s `tagBox`
      and no other path (the `isolation.test.ts` scan).
- [ ] `view/placement-decorations.test.ts`, on a card-layout Roster with a
      form pushing at one stat's score and at that card's last row, and at a
      second stat's score alone: the two pills and the row carry
      `sheetsmith-in-play` and the tint attribute; neither card nor reading
      carries either; **the first card carries `sheetsmith-in-play-marked` and
      the one tag** (one tag, at the card's corner, with the row tinted and
      untagged), and neither pill nor the second card a tag. A form pushing only
      at a score tags that score's card; a form pushing only at a row tags that
      row's name cell. A Roster with no `effective`, whose push moves only the
      reading, tints the card, as today.
- [ ] A test pins the `=` claim under "Deliberately not doing": an `=` push on
      a Roster stat with `effective` declared moves the reading and not the
      score, so the score field carries no name and the card is tinted whole.
- [ ] `styles.test.ts` passes with no rule added; the tint stays within the
      colour list.
- [ ] Harness: the forms sample's card-layout Roster `checks` gains
      `effective: 'value + mod.self'` and `derived: 'mod(value + mod.self)'`
      with `signed: true`, so its reading reads *+2*, not *2*,
      and Brown Bear adds `checks.CON += 2`. With the bear on, the Constitution
      card shows a tinted pill, a tinted Concentration row (its last row, so its
      bottom corners are rounded as before) with no tag of its own, its reading
      underlined and untinted, no fill or outline on the card, and the tag at the
      card's bottom inline-end corner; the Wisdom card shows its Insight
      row tinted (its only row, all four corners) and its pill untinted. In
      `sheet-forms-light`, `-dark`, `-narrow` (380, the cards stacked full
      width), `-forced-colors` and `-contrast-more`.
- [ ] Harness: `sheet-forms-roster-score` and `sheet-forms-roster-score-dark`
      (the Wolf adding to the Constitution score alone) show the tinted pill,
      Endurance and Concentration untinted, and the tag at the card's bottom
      inline-end corner under Concentration, as the owner's rule allows.
- [ ] `node harness/measure-form-tag.mjs`, on `forms` and `forms-roster-score`,
      reports the Roster card's tag at `content` 0 or less, `overlap` 0 and
      `clipped` 0 at `text=15`, `16` and `24`, so the tag hangs into the gap
      below the card without the placement cutting it or reaching the last row.

**The tag on a Roster band head** (amended after the owner's table-layout
Roster, 2026-11-11)

- [x] `roster.test.ts`: in the table layout a stat whose `effective` moved
      stamps its field with the band's `tr` as the box and its tag line,
      `.sheetsmith-roster-band-tag-line`, as the tag box, which replaces *names
      the band row as the score's box in the table layout, and no tag carrier*;
      the tag line is the inner's first child, empty, and is drawn with no
      form on too; the name carries no `data-sheetsmith-tag-box`; with no
      `effective`, the reading names the `tr` and the tag line likewise. The
      `isolation.test.ts` scan still finds the attribute in the helper alone.
- [x] `view/placement-decorations.test.ts`, on a table-layout Roster with a
      form pushing at one stat's score and a second band untinted below: the
      band's `tr` carries `sheetsmith-in-play`, its tag line
      `sheetsmith-in-play-marked` and the one tag with
      `sheetsmith-in-play-mark-inline`, and **no `tr` in the placement has a
      child that is not a `td` or a `th`**; the second band carries neither.
      Pushing at that score and at one of its rows: one tag, on the band's
      tag line, the row tinted and untagged. Pushing at a row of the first band
      and the second band's score: the tag in the row's name cell.
- [x] `styles.test.ts`: a tinted row's lone cell draws all four inset edges; a
      tinted band's inner hairline takes the edge colour whether the band
      carries the tag or not, so an untagged tinted band also closes on all
      four sides, its bottom edge included; in forced colors the band cell's
      bottom rule is `solid` and the inner's hairline none, tinted or not; a
      band head's tag is placed at its line's inline start;
      the new rules name no literal colour and no `:has()`.
- [x] Harness: the forms sample gains `forms-roster-band`, the `checks` Roster
      drawn in its table layout (`cardLayout` off, everything else as the card
      sample has it, `effective` included) with Brown Bear on, so the
      Constitution band is tinted with Concentration and tagged once on its
      second line, Endurance untinted, the Wisdom band untinted below with its
      Insight row tinted and untagged; and `forms-roster-band-score`, the Wolf
      alone adding to Constitution's score, the band head the only tinted box.
      Shots `sheet-forms-roster-band`, `-dark`, `-narrow` (380), `-contrast-more`
      and `-forced-colors`, `sheet-forms-roster-band-onecol` (at a width where
      the score and the reading wrap under the name), and
      `sheet-forms-roster-band-score`, each with an explicit frame. At 380 and
      at full width the tag is on the band's second line, at its inline start,
      clear of the name, the score, the reading and the note mark; in the
      one-column shot it is on the name line's inline start, clear of the name
      and of the score and the reading below; the band outlined on all four
      sides in each mode, and in forced colors every band, tinted or not, ruled
      full width at its bottom; nothing else on the sheet moved.
- [x] The fixture: a copy of `Sheetsmith layouts/5e Druid.sheetsmith` saved as
      `5e Druid table.sheetsmith`, its `abilities` Roster with `cardLayout`
      off, and a copy of `Characters/Thorne - Character Sheet.md` as
      `Characters/Thorne table.md` naming it. Put **Cat Form** in play and see
      Dexterity's and Strength's band heads tinted and each closed on all four
      sides, the untagged one included; Cat Form's tag once, on the second line
      of the first tinted band in the layout's stat order (Dexterity, in the
      druid layout's order INT, WIS, DEX, CHA, STR, CON), at its inline start;
      Strength tinted without a tag; revert and see every tint and the tag go,
      with no band or row moved between on and off. Stealth stays untinted:
      Cat Form's at least (+7) loses to the +10 Stealth already reads. Seen in
      Obsidian by the owner on the uncommitted build, which also settles the
      harness line's "nothing else on the sheet moved".

**The starter**

- [x] `src/starters/5e.json` carries the formula changes, the `forms` tab with no
      records, and the two Long rest bindings; it installs through
      `installLayoutSource` unchanged; `src/starters` tests pass.
- [x] The spec's raw-score list is checked by a test that scans the starter for
      `abilities.*.value` and finds `capacity` alone.

**Harness and review**

- [x] `harness/samples.ts` holds a **Wild Shape** sample on a sheet carrying
      abilities, skills, saves and armour class as targets and a speed Card
      with no `derived`, with Brown Bear active and Wolf inactive, so the tint is
      drawn on a Card set, a Table and a Card at once, one skill where the
      druid's own number wins stays untinted, the speed card stays untinted, and
      an item-modified initiative shows the shape-only mark beside them. Brown
      Bear also floors Stealth at 3, so the tinted Table row is a skill the form
      raises, and sets the Constitution save to +5 on a small `saves` Table whose
      totals read `+ mod.self` as the starter's do, so a save row tints too. The panel is ten rows tall so the In play face's sections, the
      library's open record and the two-on blocks are on screen.
- [x] New shot views, each with an explicit frame: `sheet-forms-light`,
      `sheet-forms-dark`, `sheet-forms-narrow` (380px), `sheet-forms-none` (no
      form active), `sheet-forms-two-on`, `sheet-forms-library` (**Every form**,
      one record open), `sheet-forms-zero-hp`, `sheet-forms-forced-colors`,
      `sheet-forms-contrast-more`. Fresh `npm run harness` then `npm run
      harness:shot` output goes to the design review.
- [x] `npm test`, `npm run lint` (at `--max-warnings 0`) and `npm run build`
      pass; `components/isolation.test.ts` is re-run before a failure of it is
      read.

**The vault fixture**, `~/Developer/sheetsmith-test-vault/`, outside the
repository by `AGENTS.md`'s rule, so the recipe is here:

- [x] Layout `Sheetsmith layouts/Stat block variations.sheetsmith` and note
      `Characters/Forms.md` (`sheet-layout: Stat block variations`). Aramil and
      the plain sheets are not touched. The layout holds three groups:
      1. **Moon druid** — a Passport with `level` 5; `abilities` Card set (STR
         10, DEX 14, CON 13, INT 12, WIS 16, CHA 8) with `derived: mod(value +
         mod.self)`; `skills` Table with Perception (Proficient), Stealth
         (Untrained) and Athletics (Untrained) publishing `ability + Training * prof + mod.self`;
         an `armour_class` Card with a `+ mod.self` derived; a `speed` Card with
         no `derived`, as the starter has it; an `initiative` Card with a `+
         mod.self` derived and an item row granting it `+1`, the ordinary
         modifier beside the form's; the druid's own `hp` Pool; and a Stat block **Wild Shape** built from the Forms
         entry with `uses` `2`, `spendOnPick` on, actions `Bonus` / `Damage`,
         `bodyName` "Traits", holding **Brown Bear** and **Wolf** as in the Data
         section (the entry plus a `Speed` text field), Brown Bear active,
         `uses: 1`.
      2. **Werewolf** — `attributes` Card set (strength, dexterity, stamina,
         manipulation) with `value + mod.self` deriveds, and a Stat block
         **Forms** holding Homid (no changes, active), Glabro, Crinos, Hispo and
         Lupus as additive changes.
      3. **Beastform and companion** — `evasion` Card and `traits` Card set with
         `+ mod.self`, a Stat block **Beastform** (no HP field, `Stress cost`,
         `Attack` text) holding Agile Scout inactive, and a Stat block
         **Familiar** with no `exclusive`, one record with `HP: 3 / 3`.
- [x] What to press, in order: with Brown Bear active, see STR, DEX, CON and
      armour class tinted with **Brown Bear**, speed showing the druid's 30 untinted
      while the panel reads *40 ft., climb 30 ft.*, initiative's item bonus
      drawing the underline alone, Perception untinted
      with *Brown Bear — at least +3 (not applied: already higher)* in its
      breakdown (own 6 against at least 3), and
      Athletics moved by the new STR but untinted; choose **Wolf** and watch the
      tint leave STR, CON and armour class, and DEX and Stealth (own 2
      against at least 4) take Wolf's, the uses dots drop to none, and *no uses left* be
      announced on the next switch; type 12 into Strength and see the note hold
      `STR: 12`; step Wolf's HP to 0 and see the warning and the sentence with
      Wolf still active; **Revert**, then choose **Brown Bear** and see its HP as
      it was left; hand-edit the note to turn both on and see the report; open
      **Every form**, add a form, name it `[[Giant Spider]]`, delete it; switch
      Werewolf to Crinos and see the additive tint; press **Long rest** on a
      layout installed from the 5e starter and see no form active.
- [ ] The Roster-card amendment's fixture is the owner's own druid, already in
      the vault: layout `Sheetsmith layouts/5e Druid.sheetsmith`, whose
      `abilities` Roster draws its stats as cards (`cardLayout: true`, `derived:
      mod(value + mod.self)`, `effective: value + mod.self`, rows under each
      stat with a published `Total`), and note `Characters/Thorne - Character
      Sheet.md`, whose Stat block holds **Cat Form**. What to press: put Cat Form
      in play (a library modifier: STR and DEX raised to the Wisdom score, Stealth
      floored at Wisdom's modifier plus proficiency, armour class floored) and see
      Dexterity's pill and its Stealth row (where the floor raised it) tinted, Strength's
      pill alone tinted, both readings underlined and untinted, no card filled
      or outlined, and Cat Form's tag beside the first tinted pill in reading
      order, nothing tagged by Strength's Athletics or any other untinted row;
      revert and see every tint go.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through the
build and every round of findings; one branch, one land.

1. `feat: Add an at least operator that floors a value at a number`. The cell
   spelling, `operatorOf`, the engine's `atLeast` reduction and the
   `withPublishedModifiers` step, the breakdown wording, `OPERATOR_LABELS`, the
   form's select, and their tests including the corpus line.
2. `refactor: Share the record body and number field pieces Stat block needs`.
   Only if the build finds them private to `record-set.ts`; each extraction with
   its allowlist and isolation lines. Dropped if nothing needs extracting.
3. `feat: Add a stat block that puts one form in play at a time`. The component,
   its palette entry, its `sample` and `example`, its tests, registration, its
   stylesheet part.
4. `feat: Tint every value a form changes`. `ModifierPush.inPlay`,
   `stampModifiedHost` (value and box) and its call sites, `view/placement-decorations.ts`
   called from the sheet view and the harness, the stylesheet rules, the tests.
5. `feat: Give the 5e starter a forms tab its abilities answer to`. The starter
   edits and their test.
6. `test: Show forms in the harness`. The sample and the shot views.
7. `docs: Record the stat block, the at least operator and the form tint`. §2
   (**Stat block**, **At least**, **In play** terms), §4.2's Stat block entry
   with its Forms palette bullet and the Polymorph sentence, §4.2's card
   interaction bullet amended where it says a modified number takes "a shape
   rather than a colour", §5's override and phase bullets gaining at least, the
   activation-constraint bullet in §13 noting its exclusivity half settled for
   forms, and `docs/UI.md` §9 rows for the tint and the panel. The §4.2 card
   bullet's amendment is scoped: an ordinary modifier keeps the shape-only
   mark, and only a value changed by the active form adds the tint on top of
   its text mark. The release-note lines are the next section's.

The Roster-card amendment, on its own branch:

1. `fix: Tint a Roster card's score and rows rather than the whole card`.
   Roster's score boxed to its pill and its reading stamped without a name
   where the score carries it, the pass's box lookup unchanged;
   `stampModifiedHost`'s `tagBox` argument and `data-sheetsmith-tag-box`, and
   the pass's tag carrier, so the card carries its pill's tag; and their tests.
2. `test: Show a form raising a Roster card's score in the harness`. The `checks`
   sample and the bear's push, the `forms-roster-score` state and its two
   shots, and `measure-form-tag.mjs` reading the card that carries a tag.
3. `docs: Record that a Roster card is not a form's box`. `SPEC` §8's tint
   sentence ("each changed card of a Card set or Roster") and `docs/UI.md` §9's
   tint row narrowed to match, by `/land-it`.

The band-head amendment, on its own branch:

1. `fix: Show a form's tag on a Roster's band head`. Roster's
   `.sheetsmith-roster-band-tag-line`, drawn in every band head, as the table
   layout's `tagBox`, the `--sheetsmith-band-reading-line` property and its
   match with the reading's line height, the pass looking down a row for its carrier and
   never writing into a `tr`, `pickTagText` reading the nearest tint layer,
   the `:only-child` edges, the band hairline and its forced-colors cell rule,
   and the band tag's second-line and one-column rules, and their tests.
2. `test: Show a form tagging a Roster's band head in the harness`. The
   `forms-roster-band` and `-score` states and their shots, the one-column
   shot included.
3. `docs: Record where a form's tag rides on a Roster's band head`. `SPEC`
   §8's tint sentence and `docs/UI.md` §9's tint row gain the band head's
   placement, by `/land-it`.

## Release notes

Items for `/release` to carry, recorded here so they are not re-derived:

- **A layout using At least needs Sheetsmith 0.9.0.** Older versions read
  `"operator": "upgrade"` as an addition, so a floor of 4 adds 4 instead.
- **The 5e starter changed, for layouts installed from now on**: abilities,
  saves and skills take modifiers (`mod(value + mod.self)`, `+ mod.self`); a
  Forms tab with an empty Stat block and two Long rest bindings; Bark Skin is now
  **At least** 16 rather than **Sets** 16. Installed layouts are not rewritten.
- **Known limits in the starter**: carrying capacity and the speed card keep the
  character's own values while a form is active.

## Deliberately not doing

- **`dimWhen`**, and with it any visible restriction on the character's own
  attack list, spell slots or main HP while in form. Deferred; the tint's pass is
  built to take it as a second kind. Restrictions are prose in the form's body.
- **Bonus-type filtering on a form** (pf2e battle forms taking only circumstance
  and status bonuses).
- **"At most"**, **multiply**, and **value-phase overrides** (a form setting the
  score rather than the modifier).
- **Automatic revert at 0, carrying excess damage to the character's pool, and
  any on-activate trigger** (a 2014 beast's HP refilled on shifting is the
  reader's press).
- **The cap half** of §13's activation-constraint entry, and exclusivity on a
  Record set or a Table.
- **Overriding a single formula locally** (§13, untouched).
- **Dice** (§11). A beast's damage is text.
- **A visible "own, higher" caption under an unraised value**; the breakdown says
  it.
- **A tint on a Tab set's strip**, and on the Stat block itself.
- **Pool's adjust (`±`) control on a form's HP**; the steppers and typing are
  the gestures.
- **A stored form choice, a per-record ring on the panel, reordering forms, an
  expand-all, a card-grid presentation.**
- **`reset.*.where` on Stat block, and `resetWhole`.**
- **Forms that change the character's labels or which components are shown**:
  a label is identity here (§13's rename paragraph), and showing or hiding a
  component is `dimWhen`'s neighbour.
- **Spending another component's resource on a switch** (Daggerheart's Stress):
  `spendOnPick` reaches this component's own counter only.
- **From the Roster-card amendment**:
  - **A box round a Roster card's pill and reading together.** No element holds
    the two, and a wrapper would move the Card set clothes the card borrows.
  - **A box for a `hideValue` card's reading.** That card keeps the card as its
    box, as today; its reading has no chrome to fill, and giving it some is a
    new surface.
  - **Moving a tinted row's tag on a Roster card to the card's corner**, so a
    card had one place for its tag whatever was tinted. The owner's decision:
    a row's tag stays in its name cell, as a Table's does, because on the
    card's corner a row-only change would put the tag beside an untinted score
    and read as the score having moved.
  - **A card-layout Roster with no `effective`, where a push moves only the
    reading**: the card is still tinted whole. Fixing it needs a box that does
    not contain its value, which means changing the shared box lookup Card,
    Card set and Table use; the reported layout and the 5e starter (whose
    `abilities` Roster is not card layout) do not reach the case.
  - **The tag beside the pill, at its inline-end side** (amended after the
    owner's review of the build): it crowds the value and the card's edge
    (owner review of the Dexterity card at the default size). Built once
    after a land-stop review, and reverted.
  - **The tag at the card's top inline-start corner**: it brings back the
    clearance against a font's capitals that `stat-block-zones.md` abandoned,
    and covers a centred label at the Roster card's 192px floor.
  - **An `=` push on a Roster stat** (amended after the owner's land-stop
    review): it sets the published reading and never moves the score, so the
    card is still tinted whole even with `effective` declared. The same reason
    as the line above: the reading would need a box that does not contain it.
  - **Any change to Card, Card set, Table, Pool or Track boxing, to the colour
    words or per-form tint, to the corner rounding of tinted rows, or to a
    Roster's table layout** beyond its band head's tag (below).
- **From the band-head amendment**:
  - **A Roster card's score pill and its tag at the card's corner, and a table
    row's tag in its name cell**: unchanged; the pass's look-down reaches a
    `tr` with no row name alone.
  - **A wrapper round a band head's name**, which a tag beside the name's text
    would need; the card layout draws the same heading.
  - **A Stat block without a picker taking a reading face, the layout canvas
    drawing a features entry's markdown, a guard holding stamped classes over
    `:has()`, and modifiers that set toggles, levels or text**: none of them
    is reached by this fix.
  - The card amendment's own exclusions stand: a card-layout Roster with no
    `effective`, and an `=` push on a Roster stat.
  - **Clearing the name at one column**, the owner's accepted trade: where the
    score and the reading wrap under the name, the fallback tag on the name's
    line covers most of a short name (`sheet-forms-roster-band-onecol` shows
    only "tit" of "Constitution"). Clearing it needs a line of its own, which
    would change the band's height with the form on, against `docs/UI.md` §9's
    "the box is the same size with the form on as off". Accepted as is.
