# Number field focus select

Status: shipped
Board card: none. Scoped by the owner: *focusing a number field by touch leaves
the caret wherever the tap landed, so typing appends to the old value.*

## Model question

None. This is about where a caret lands. Nothing is stored, published or
migrated, and no §13 question is involved.

## What it does

When a finger, the keyboard or a card's own hit target focuses a field holding a
number, the whole number is selected, so the at-the-table gesture of tapping the
value and typing a new one replaces it: `27`, a tap, and `5` gives `5`, not
`527`. A mouse press on the field still puts the caret where it was aimed, and a
second press into a field that already has focus places the caret normally, so
fixing one digit is still possible.

## Smallest version

One rule in `bindEditable`, keyed on what the field already declares: a field
that steps or settles arithmetic, holding a finite number at the moment it is
focused, selects that number unless a mouse or pen pressed it. No new option, no
component edits. What it gives up: a pen tap keeps the caret where it lands
(it is aimed, like a mouse), and a number field holding a non-number keeps
platform behaviour.

## Design

### Which fields select on focus

The test is the one the arrow keys already use: the field binds with `step` or
`arithmetic`, **and** its value at focus time, after any swap to the stored
number (below), is a finite number. `step` alone is not enough, because some
fields that step can also hold a word, and selecting a word on a tap would make a
one-letter fix harder. The value test is what separates a Passport level from a
species. This is not the content-switching keypad that `docs/UI.md` §7 rejects:
that keypad could never be left once shown, while a selection is gone after the
next keystroke or tap.

**Select on focus (when holding a number):**

| Component | Field | Binding site |
| --- | --- | --- |
| Card, Card set | the value field of every card | `card-face.ts` value `bindEditable` |
| Pool | current value | `pool.ts`, `handle = bindEditable(input, …)` |
| Pool | max, where `maxSource: 'character'` | `pool.ts`, `maxHandle` |
| Pool | temporary points | `pool.ts`, `tempHandle` |
| Table | every cell of a `number` column | `table.ts`, `step: type === 'number'` |
| Roster | a stat's stored value, and every column cell | `roster.ts`, both `step: true` sites |
| Record set | a value field, and its ceiling | `record-set.ts`, both `step: true` sites |
| Track | a row's length field | `track.ts`, `wireLength` |
| Passport | a scalar field whose value is a number (a level, an age) | `passport.ts`, the `step: true` scalar site |

**Keep the caret where it lands:**

| Component | Field | Why |
| --- | --- | --- |
| Card | the note line | prose; no `step` |
| Card, Roster, Passport | a stepping field holding a word (`Lawful`, `Elf`) | fails the value test |
| Table | text cells, and the row name | no `step` |
| Record set | the record name, and text fields | no `step` |
| Track | a row the character named | no `step` |
| Passport | the name, list parts, and a new list part | no `step` |
| Picture frame | the reference field | no `step`; it keeps its own select on a press on the frame (`picture-frame.ts`), which is unchanged |
| Modifier form | amount, note, condition | no `step`; an amount is an expression, not a number |
| Pool | the Adjust amount | not `bindEditable`, and it starts empty |
| Rich text | the block | `bindMultiline`, out of scope |

An empty field has nothing to select, so it behaves as it does today.

### Which focus selects

| Focus came from | Result |
| --- | --- |
| A touch press on the field itself | selects |
| A touch or mouse press on the card around it, routed to the field (`card-face.ts`'s `onclick`) | selects |
| Keyboard: Tab, or Enter moving to the next field | selects |
| Any other focus called from code | selects |
| A mouse or pen press on the field itself | caret where it was aimed |
| A press of any kind on a field that **already has focus** | caret where it was aimed |

The only reason to keep the caret is that someone aimed it at a character. A
mouse or a pen tip on the field does that. A finger cannot (that is the defect),
and a press routed from the card's padding or a keystroke never pointed at a
digit, so selecting in those cases takes nothing away. This includes a mouse
click on a card's padding, which now selects as well: a desktop reader can
click the card and type, as a phone reader can.

**Treating a pen like a mouse is unverified.** It assumes an Apple Pencil tip
lands the caret where it is aimed. That has not been tried by hand on an iPad,
and it stays an assumption until it has.

Keyboard focus needs saying even though desktop browsers select a field's text
on Tab already. A card whose pill shows the effective number swaps the stored
number in on focus, and setting `value` puts the caret at the end, so Tab onto a
modified card leaves the caret at the end. The binding selects after the swap,
which fixes that case as well.

**Second press.** The binding records the pointer type of a `pointerdown` only
when the field is not already the active element, which is the
`picture-frame.ts` click handler's own guard. A press into a focused field
records nothing and selects nothing. **A touch one also collapses the selection
on its `pointerdown`**, where the whole value is selected, because a tap on
selected text is iOS's own gesture for its edit menu: the first device pass
found a second tap opening Cut / Copy / Paste / Replace with the value still
selected. Collapsed before the tap ends, the platform places the caret where the
finger lands, so a player can tap again to edit one digit. A mouse or pen press
already places its caret and is left alone, and a selection the reader made
themselves, anything short of the whole value, keeps the platform's menu.

**A press that becomes a scrub** (Pool's value, `interaction/scrub.ts`) is a
drag, not a tap. Scrub already clears any selection when the drag passes its
threshold, and no selection may come back after the drag ends.

### Where it sits beside "the field goes back to the stored number on focus"

They are two steps of one focus, and the order is fixed: **swap first, then
select.** The swap is a data rule (SPEC §4.2: what every gesture acts on), and
the selection is of whatever the swap leaves, so a tap on a Strength pill
showing the effective `17` selects the stored `15`, and typing replaces `15`.
The swap listeners in `card-face.ts` and `roster.ts` are added after
`bindEditable`, so the selection has to wait until every focus listener has run.
The value test also runs after the swap. Nothing else changes: Escape still
restores the stored number, a blur with no typing still writes nothing, and the
swap back to the effective reading on that blur still happens.

### Mechanism, and the constraint the device sets

All of it lives in `bindEditable`, on the field's own `pointerdown` and `focus`,
so no listener outlives the field and no component changes. The recorded press is
used up by the focus it caused. A press that slides off without focusing fires no
click, so it waits for the next focus: a stale touch is harmless, since that
focus selects anyway, and a stale pen makes the next Tab keep the caret, which is
accepted because pen behaviour is unverified. On iOS, WebKit
places the caret when the tap ends, after `focus`, which may undo a selection
made in the focus handler. So for a touch press the selection is made again at
the end of that same press. Whether that happens on `pointerup` or `click` is
the build's choice, and the device check below decides.

`docs/PATTERNS.md` §1: no `selectOnFocus` option. The rule follows from
`step`/`arithmetic`, which every number field already declares. Add an option
only when a field shows up that needs to differ.

### Doc amendments, made by the dev in the same work

- **SPEC §4.2, "Card interaction"**: a bullet after "The field goes back to the
  stored number the moment it is focused" saying: *Focusing a field that holds
  a number selects it, except where a mouse or pen pressed the field itself, so
  a tap and a typed number replace the value rather than appending to it. The
  swap to the stored number comes first and the selection is of what it leaves.
  A second press into a focused field places the caret, so one digit can still
  be edited.* The Pool paragraph's caret defect should gain a clause saying the
  value field now avoids it too, by selection, as the Adjust amount does by
  starting empty.
- **`docs/UI.md` §7 Touch**: a bullet beside the keypad rule saying: *A
  focused number is selected, because a finger cannot aim a caret*
  [checked: the focus-kind tests below]. It should name the condition (`step`
  or `arithmetic`, holding a number), the one exemption (a mouse or pen press on
  the field), the second-press rule, and point to this doc for the field list.

## Config fields

None.

## Data and file model

Nothing stored changes. Selection does not change a field's value, so a focus
followed by a blur writes nothing, as it does today. No existing note is
affected.

## Acceptance criteria

- [x] On a Card value field, a Table number cell and a Pool current value, each
      of these has a test, named for its focus kind:
      - touch press on an unfocused field: `selectionStart === 0` and
        `selectionEnd === value.length`;
      - mouse press: the caret is not changed by the binding;
      - keyboard / programmatic focus: whole value selected;
      - a second touch press into the already-focused field: the binding does
        not reselect.
- [x] A card whose pill reads the effective number, focused by touch or
      keyboard, has the **stored** number selected (test).
- [x] A press routed from a card's padding selects the value (test).
- [x] A stepping field holding a word (a Card or Passport field holding `Elf`)
      is not selected on touch focus (test).
- [x] A Table text cell, a Card note and a Record set name are not selected on
      touch focus (test).
- [x] A touch focus followed by a blur with no typing commits nothing (test).
- [x] A Pool scrub still steps the value and leaves no selection after release
      (existing scrub tests still pass, plus one asserting no selection).
- [x] No component file gains focus-select code; the diff to `src/components/`
      is tests only.
- [x] SPEC §4.2 and `docs/UI.md` §7 carry the amendments above.
- [x] `npm run lint`, `npm test`, `npm run build` pass.
- [ ] **Device check, after landing**, on a phone and on an iPad (the phone half
      passed in the device pass below, except two rows of the "select" table
      it did not try, a Record set value field and a Roster column cell; those
      two rows on the phone, and the whole iPad half, are open): tap the Hit
      points value `27` and type `-5`, which settles `-5`, not `-527`; tap a
      Card's Strength and type `14`, which gives `14`; tap a Table Bonus cell
      and type, which replaces the value; tap the focused field again, and the
      caret lands where tapped; tap a Card's note and a Passport species, and
      the caret lands where tapped with no selection. Go through every row of
      the "select" table above once.
- [x] **Device check**: after a touch focus, the whole value is selected and
      no iOS edit menu (Cut / Copy / Paste) is shown over the field, and typing
      replaces the value. Selection handles are expected: iOS draws them for any
      selection in a focused field.
- [x] **Device check**: after a second tap into a field that already has focus,
      nothing stays selected and the selection menu (Cut / Copy / Paste) does not
      appear; iOS's caret menu (Paste / Select / Select All / AutoFill) may, and
      a third tap dismisses it. Typing inserts at the caret. **iOS snaps a single
      tap to a word boundary**, so a tap between two digits puts the caret at
      the start or end of the number: native behaviour, not a defect.
- [ ] **Device check, iPad with an Apple Pencil**: a Pencil tap on a number
      field leaves the caret where it was aimed, with no selection. Until this
      has been tried by hand, the Pencil-as-mouse rule is unverified.

**Device pass, iPhone 17, iOS 27, Obsidian 1.14.5 mobile.** First tap: the
whole value selected with handles and no menu, and typing replaced the value
(as the first pass on the same phone had already found on every listed field),
on Card, Pool current, max and
temp, a Table number cell, a Passport level, a Record set ceiling, a Roster stat
and a Track row length; the caret-keeping fields (Card note, Table text cell,
Passport text) kept the caret. Second tap: the selection collapsed and the caret
landed where the finger did, a typed digit inserting there (`10` → `109`, `27` →
`279`, `6` → `69`), with no Cut / Copy / Paste menu. A drag on a focused,
selected Pool value stepped it and left nothing selected. The first pass on the
same phone found the second tap opening the edit menu, which the collapse on a
touch `pointerdown` fixed. Not tried on the phone: a Record set value field and
a Roster column cell. No iPad was tried, so the iPad half and the Pencil
criterion stay open.

## Commit boundaries

1. `fix: Select a number field's value when a finger or the keyboard focuses it`.
   The rule in `src/interaction/editable.ts` and its focus-kind tests on Card,
   Table and Pool, plus the negative cases.
2. `docs: Record that focusing a number selects it`. SPEC §4.2 "Card
   interaction" and the Pool paragraph, `docs/UI.md` §7, and this doc's status.

## Deliberately not doing

- `inputMode` / which keyboard a field asks for: settled in `docs/UI.md` §7.
- The Adjust control's sign handling, a Track Add form storing a sum as typed,
  and pool temp accepting values its rule refuses. Each is tracked separately.
- `bindMultiline` and Rich text. Prose keeps the caret where it lands.
- The tablet canvas `touch-action` row in `docs/BACKLOG.md` § UI.
- Removing the existing explicit `select()` calls (Passport's Enter, Record
  set's landing, Card's Enter to the note, Picture frame's press). They select
  fields this rule does not cover and stay as they are.
- A pen-specific rule. A pen tip aims like a mouse. If the device pass shows an
  Apple Pencil tap misses the way a finger does, that is a follow-up.
