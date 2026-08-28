---
sheet-layout: Modifier variations
---

Modifier variations in one place: a row of a table declaring a change against a
value published elsewhere on the sheet, which the target's own formula reads as
`mod.self`. **Four things are worth looking at, and three of them nothing outside
the app can show** — a real select in a cell, a popover under a finger, and a
wikilink that hovers and follows a rename.

1. **Two bonuses of one type do not stack, and the suppressed one says why.**
   Strength is **+5**: +2 from a score of 15, the Belt's item +2, and Bull's
   Strength's status +1 of a different type. The Gauntlets' item +1 is listed and
   not applied. Press the number to see all three.
2. **Both suppression wordings are on this sheet, and each is true of only one
   case.** The Gauntlets read "a larger item bonus applies". The two Rings of
   Protection are the same size, so one of them reads "another item bonus of the
   same size applies" instead — telling a reader a larger one applies would send
   them hunting for a number that is not there.
3. **A breakdown drawing on two tables names the table on every line, including
   the lines that never collided.** Armour class is **13** and its two
   contributors read `Magic items · Ring of Protection` and
   `Worn items · Ring of Protection`. Delete the Worn items row and *both*
   prefixes go, because they genuinely all come from one place now — that is the
   half of the rule that is only visible in the delete direction. Note that one
   of the two rows is a wikilink in the file and the other is plain text: a
   breakdown shows the reader's spelling, never the file's.
4. **The last two Magic items rows target something that will not take it, and
   they say different sentences because the fixes differ.** Cloak of Displacement
   points at a value that reads no modifier; Amulet of Misspelling points at a
   name this sheet does not publish. Neither is corrected, and neither is an
   error. Open both selects.

The full ten steps, including the ones that change the layout, are in
`docs/features/item-modifiers.md` in the plugin repository.

## Abilities
```sheet
STR: 15
DEX: 14
CON: 13
INT: 12
WIS: 10
CHA: 8
```

## Magic items

| Item | Modifies | Bonus | Aid | Notes |
| --- | --- | --- | --- | --- |
| Belt of Giant Strength | abilities.STR | 2 |  | attuned |
| Gauntlets of Ogre Power | abilities.STR | 1 |  | the smaller item bonus |
| Bull's Strength | abilities.STR |  | 1 | a different type, so it adds |
| [[Ring of Protection]] | armour_class | 1 |  | a real wikilink and a real modifier |
| Cloak of Displacement | passive_perception | 2 |  | reads no modifier |
| Amulet of Misspelling | armor_class | 1 |  | hand-edited: not a name this sheet has |

## Worn items

| Worn | Modifies | Bonus |
| --- | --- | --- |
| Ring of Protection | armour_class | 1 |
