---
sheet-layout: Record variations
---

Record set's variations in one place. **The thing to look at is the box and the
disclosure** — the harness can already show a record's summary line, and what it
cannot show is find-in-page reaching a closed body, a rename propagating through a
record's name, or Obsidian's own renderer drawing a record's prose.

Seven claims, in the order they are easiest to break:

1. **The box is the placement and the list scrolls inside it.** "Features" (4×3)
   holds seven records and "Spells" (2×3) holds five. Open every record in
   Features, then close them all, and **nothing below either box may move** — the
   "Bare list", "Armour class" and "Attuned things" on the next rows are there to
   be watched. SPEC §8 forbids a component ceasing to fill its placement, and this
   is the one component whose content can grow without limit.
2. **Nothing is open on first render, and several may be open at once.** Open two
   records in Features, then edit a `Uses` counter in a third: both stay open
   across the re-render. Delete a record *above* an open one and the right record
   stays open. Then open a different note and come back — everything is closed
   again, because a reader's posture is not the character's data.
3. **Find-in-page reaches a closed body.** Close every record and press Cmd-F for
   `catoblepas`, which appears only in the body of "Second Wind". Obsidian's own
   find should reveal it *and* the chevron should agree the record is open. This
   is the one thing Tab set had to give up, and it is only claimed here because
   the box is fixed.
4. **A record's name is real markdown.** `[[Sunblade]]` in the "Sunblade" record's
   heading navigates, hovers to a preview, and **follows a rename** — rename
   `Sunblade.md` and watch the heading change in this note. `[[Torch of
   Revealing]]` points at nothing and draws faint. Click into either and the raw
   `[[…]]` is what is edited. **This is the whole reason storage is markdown**
   rather than a fence (Constraint 2).
5. **Failure is per record.** "Hand broken" has a fence line that is not a
   `key: value` entry. It draws its name, its body and a problem line, with no
   field controls and no name field — and **every other record on the list still
   renders and still edits**. Type into a neighbour, save, reopen, and check that
   Hand broken's bytes came back exactly as they were.
6. **`## ` and `### ` are the two lines a body cannot hold.** Open any record,
   type `### Chapter two` into its body, and leave the field. The write is
   declined, the field keeps what you typed, and the message names the line and
   `#### `. Do the same with `## Chapter two`. Then reopen the note and confirm
   nothing was written either time.
7. **The reset reaches a counter the layout never declared.** Press **Long rest**.
   Every readable record's `Uses` in Features goes to 3 and every `Attuned` to yes,
   because that binding is `full`; every `Level` in Spells goes to 0 and every
   `Prepared` to no, because that one is `empty`. **"Hand broken" is left exactly as
   it is**, because no write into a record whose fence will not read is accepted at
   all — and "Lucky", which has no fence, *gains* one. Nothing about "Bare list"
   moves, since it has no fields. Then take `max` off `Uses` in the layout editor
   and press it again: the trigger has to *name the field* rather than failing
   quietly — and the `/ 3` beside every `Uses` has to be gone with it, because a
   field with no ceiling has none to draw.

Two things to look at that are not claims. **"Features" holds every field type
this component offers** — a bounded number, a toggle, a named level with a mark, a
computed field and a modifier field — so it is where a summary line is judged for
whether five things fit on one. And **"Inside a group" and "Inside a tab"** are the
same component one level down: a record set inside a Group and inside a Tab set,
each beside a Card counting it, so containment and the aggregate are both visible
at once.

The modifiers, because they are the half a screenshot cannot settle. "Blessed
Armour" enrols in a named definition the layout declares and "Warded cloak"
spells a typed one out on the record itself, both conditional on that record's own
`Attuned` toggle. Tick and untick either and watch "Armour class" move; press the
glyph and check the breakdown names the record *and* the component. "Ring of
Nonexistence" names a definition the layout does not declare and is carried rather
than corrected.

## Features

Anything written above the first record is a preamble. It is preserved untouched
and never drawn on the sheet, which is SPEC §10's rule for prose around a table
read one level in.

### Second Wind
```sheet
Uses: 1
Attuned: no
Rank: 1
```
Once per short rest you can use a bonus action to regain hit points equal to 1d10
plus your fighter level. This body is deliberately far longer than the box that
holds it, so it has to scroll inside the list rather than growing it, and a second
paragraph follows because the space between two of them is part of what an open
record has to get right.

A catoblepas is the word to search for with the record closed: it appears nowhere
else in this note, so find-in-page either reaches it or it does not.

Once you use this feature you must finish a short or long rest before you can use
it again.

### [[Sunblade]]
```sheet
Uses: 0
Attuned: yes
Rank: 2
Modifiers: Blessed Armour
```
A resolved wikilink as a name. Rename `Sunblade.md` in the vault and this heading
follows it, which is the whole reason a record's name is plain markdown.

### [[Torch of Revealing]]
```sheet
Uses: 3
Attuned: no
Rank: 0
Modifiers: Blessed Armour
```
A name pointing at a note this vault does not hold, so the link draws faint — and
a modifier whose condition is false, so the glyph says the record is changing
nothing.

### Warded cloak
```sheet
Uses: 2
Attuned: yes
Rank: 1
Modifiers: armour_class += 2 as item when Attuned; Ring of Nonexistence
```
A typed modifier and a stray in one field: the typed one applies while Attuned is
set, and the stray names a definition the layout does not declare and is carried
rather than corrected.

### Hand broken
```sheet
Uses: 1
this line is not an entry
```
A record whose fence will not read. Its name and this body draw, a problem line
sits under them, and no control on it edits — while every other record on this
list keeps working.

### Fey Ancestry
```sheet
Uses: 3
Attuned: no
Rank: 0
Retired: 4
```
An entry under a key the layout no longer declares. `Retired` stays in the note
untouched, nothing on the sheet reports it, and no edit anywhere else removes it.

### Lucky

## Spells

### Fireball
```sheet
Level: 3
Prepared: yes
```
A bright streak flashes to a point you choose, then blossoms with a low roar into
an explosion of flame.

### Shield
```sheet
Level: 1
Prepared: yes
```
An invisible barrier of magical force appears and protects you.

### Mage Armour
```sheet
Level: 1
Prepared: no
```
A protective magical force surrounds a willing creature you touch.

### Counterspell
```sheet
Level: 3
Prepared: no
```
You attempt to interrupt a creature in the process of casting a spell.

### Prestidigitation
```sheet
Level: 0
Prepared: yes
```
A minor magical trick that novice spellcasters use for practice.

## Bare list

### A record with no fields at all
A list whose component declares no fields is a name and a body per record, and
that is a whole component rather than a broken one.

### And a second

## Armour class

```sheet
AC: 14
note: leather, shield
```

## Attuned things

## Inside a group

### Keen hearing
```sheet
Uses: 2
```
A record set inside a Group, so a card beside it can count the records.

### Sure footed
```sheet
Uses: 1
```

## Inside a tab

### Great Weapon Master
```sheet
Taken: yes
```
A record set as a whole tab, which is the case where a tab has no placement of its
own and fills the panel.

### Sentinel
```sheet
Taken: no
```

## Traits counted

## Feats counted
