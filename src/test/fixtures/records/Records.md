---
sheet-layout: Record variations
---

Record set's variations in one place. **The thing to look at is the box and the
disclosure** — the harness can already show a record's summary line, and what it
cannot show is find-in-page reaching a closed body, a rename propagating through a
record's name, or Obsidian's own renderer drawing a record's prose.

Eight claims, in the order they are easiest to break:

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
   Every readable record's `Uses` in Features goes to **that record's own ceiling**
   and every `Attuned` to yes, because that binding is `full`; every `Level` in
   Spells goes to 0 and every `Prepared` to no, because that one is `empty`. So
   "Second Wind" reads 3, "Sunblade" 2 and "Warded cloak" 3 — and **"Torch of
   Revealing", which has set no ceiling, does not move at all while its `Attuned`
   still does**, because a record with no ceiling is a record that is not a
   counter rather than a failure. "Fey Ancestry", whose ceiling is not a number,
   is skipped for the same reason. **"Hand broken" is left exactly as it is**,
   because no write into a record whose fence will not read is accepted at all —
   and "Lucky", which has no fence, *gains* one. Nothing about "Bare list" moves,
   since it has no fields. Reopen the note afterwards and check **every ceiling is
   still in the file**: no reset action may delete one.
8. **The ceiling is the reader's, and the note keeps their spelling of it.**
   `Uses` on Features is `maxSource: "record"`, so each record draws a small field
   after the `/` and "Torch of Revealing" shows `—` where nobody has typed one.
   Type `4` into it and check the note now reads `Uses: 3 / 4`; clear it again and
   check the note reads `Uses: 3` with **no trailing slash**. Then go to
   "Sunblade", whose entry is spelled `2/2` with no spaces, and edit **both
   halves in turn** — its value, then its ceiling — confirming after each that
   the note still spells the slash with no spaces around it. The ceiling half is
   the one worth pressing: it is the only place the reader's own spelling can be
   silently canonicalised, and the note is the only thing that says whether it
   was. "Warded cloak" sits at `5 / 3`, above
   its own ceiling: it is drawn exactly as stored, with no warning treatment and
   no rewrite. Finally, switch `Uses` back to **The field** in the layout editor:
   the declared `max: 3` is drawn on every record, every stored ceiling stays in
   the note untouched, and switching back to **Each record** finds all of them
   still there.

Two things to look at that are not claims. **"Features" holds every field type
this component offers** — a number with a per-record ceiling, a toggle, a named
level with a mark, a computed field and a modifier field — so it is where a
summary line is judged for whether five things fit on one. Its `Uses` field also
keeps a declared `max: 3`, which is not an error and is simply unused: it is
there so switching the source back restores the old reading exactly. "Spells"
keeps a field-owned `max: 9` on `Level`, so both kinds of ceiling are on one
sheet. And **"Inside a group" and "Inside a tab"** are the
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
Uses: 1 / 3
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
Uses: 2/2
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
Uses: 5 / 3
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
Uses: 2 / lots
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
