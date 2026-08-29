---
sheet-layout: Modifier variations
---

Modifier variations in one place, in **two tiers**: the layout names the changes
that **repeat**, and a row may **type its own** in its own cell — which draws as a
**single glyph however many there are**. Press the glyph and a **form** opens: which
value this row changes, whether it adds or sets, by how much, its bonus type, and
when it applies. A change typed here can be **saved to the layout** to reuse it.
Nothing about a *named* change is in this note — only which changes each row
applies — so editing one in the layout editor moves every character using it.
**Twelve things are worth looking at, and five of them nothing outside the app can
show**: a form opened by a press, that form under a finger, a layout file written
from this sheet, a rename propagating, and a wikilink that hovers.

1. **A row can now type its own change, and that is what this wave is for.** The
   `Bracers of Warding +2` row's cell reads
   `Ring of Protection; armour_class += 2 as item when Worn` — a **name** and an
   **effect typed on the row**, in one cell, under one glyph. Press it, select the
   typed line, change **Amount** from `2` to `3`, and armour class moves with no
   layout edit anywhere.
2. **Both item bonuses at armour class are on that one row, and only the larger
   applies.** The typed `+2` wins; the `Ring of Protection` in the *same cell* and
   the one on **Worn items** both read "a larger item bonus applies". Typed
   stacking does not care which file a modifier came out of.
3. **A typed override contests with a named one on equal terms.** `Barkskin` reads
   `armour_class = 16` and loses to `Plate armour`'s 18, exactly as `Mage armour`'s
   13 does. Armour class is **22**: 18 set, then item **+2**, status **+1** and
   circumstance **+1** on top. Press the number — the last line reads `Total 22`
   and not a signed amount, because base-plus-total is no longer the arithmetic.
4. **A name may carry arithmetic and is not read as arithmetic.** The layout
   declares `Bracers of Defence +1`, and the first row's cell names it beside the
   Belt: `Belt of Giant Strength ;Bracers of Defence +1`. One glyph, two numbers
   moving, and a `+1` in a cell that is a *name*. What makes a part an effect is an
   assignment at the front of it, never a `+` anywhere in it.
5. **And that cell is spelled by hand.** No space before the semicolon, none
   after. The sheet reads it as the same two parts as the canonical spelling five
   rows down, and the file keeps the spacing exactly as typed, because parse then
   serialise touches no cell nobody edited. Change *one part* through the form and
   only that part is rewritten — the others come back byte for byte.
6. **Save a typed change to the layout, and the row becomes a reference.** In the
   `Bracers of Warding +2` form, type `Bracers of Warding` under **Reuse this
   elsewhere** and select **Save to the layout**. The definition appears at the end
   of the Modifiers list in the layout editor; the cell becomes
   `Ring of Protection; Bracers of Warding`; armour class is unchanged at **22**.
   Try to save a second effect under that name and read the refusal. An inline copy
   left beside the definition it was lifted from would be a *cache* of what that
   definition says, which is the one thing this design forbids absolutely.
7. **Both suppression wordings are on this sheet, and each is true of only one
   case.** `Barkskin` and `Mage armour` read "a higher override applies". The two
   `Ring of Protection` rows are the same size as each other, so where the typed
   `+2` is switched off one of them reads "another item bonus of the same size
   applies" — telling a reader a larger one applies would send them hunting for a
   number that is not there.
8. **A breakdown drawing on two tables names the table on every line**, including
   the lines that never collided: `Worn items · Ring of Protection` beside
   `Magic items · Bracers of Warding +2 · Ring of Protection`, which names three
   things because that row applies a modifier it is not named after. Delete the Worn
   items row and *every* table prefix goes, because they genuinely all come from one
   place now. That row's name is a wikilink in the file and every other row is plain
   text: a breakdown shows the reader's spelling, never the file's.
9. **One definition, two rows, two answers.** `Cloak +1` and `Spare cloak` both
   name `Cloak of Elvenkind`; the first is worn and the second is not, so the first
   draws `zap` and the second `zap-off` with the same sentence saying no. That is
   the whole of what a *shared* definition means: nothing about the change is in
   this note, and the row supplies only the flag the condition reads.
10. **A typed effect may name a bonus type the layout does not declare.**
    `Lucky charm` reads `abilities.STR += 1 as luck`, and `luck` is nowhere in this
    layout's **Bonus types**. It applies and contests as its own kind; the form
    shows `luck (not declared)`. Rendered, not corrected — this is the one thing
    stored in this note that names the layout's vocabulary.
11. **A typed effect with no amount changes nothing and is not an error.**
    `Unfinished ward` reads `armour_class +=`. The row draws `zap-off`, its line
    says it needs an amount, and every other contributor at armour class still
    lands. That is what makes the form safe to commit one field at a time: choosing
    a value brings the part into existence, and it must not blank a card while you
    are still typing.
12. **Two cells say they change nothing for two more reasons, and each says whose
    job the fix is.** `Torch of Nothing` names `Belt of Giant Strengh`, misspelled
    by hand: the form carries its stored spelling with the fix on the line under it.
    The `Cloak of Displacement` line on `Cloak +1` names a real modifier aimed at a
    value that does not take modifiers, so it says so and says that changing it is a
    layout edit. Neither is corrected, and neither is an error.

The full fifteen steps, including the ones that change the layout, are in
`docs/features/modifier-definitions.md` in the plugin repository.

## Abilities
```sheet
STR: 15
DEX: 14
CON: 13
INT: 12
WIS: 10
CHA: 8
```

## Skills

| Skill |
| --- |
| Acrobatics |
| Perception |

## Magic items

| Item | Modifiers | Worn | Notes |
| --- | --- | --- | --- |
| Belt of Giant Strength | Belt of Giant Strength ;Bracers of Defence +1 | yes | two values from one glyph, spelled by hand |
| Gauntlets of Ogre Power | Gauntlets of Ogre Power | yes | the smaller item bonus |
| Bull's Strength | Bull's Strength | yes | a different type, so it adds |
| Bracers of Warding +2 | Ring of Protection; armour_class += 2 as item when Worn | yes | a name and a typed effect in one cell |
| Plate armour | Plate armour | yes | sets it, and the bonuses land on top |
| Barkskin | armour_class = 16 | yes | a typed override, losing to a named one |
| Mage armour | Mage armour | yes | the lowest override |
| Cloak +1 | Cloak of Elvenkind; Cloak of Displacement | yes | two named, one applying |
| Spare cloak | Cloak of Elvenkind |  | the same modifier, switched off |
| Lucky charm | abilities.STR += 1 as luck | yes | a bonus type the layout does not declare |
| Unfinished ward | armour_class += | yes | typed, with no amount yet |
| Eyes of the Eagle | Eyes of the Eagle | yes | a modifier aimed at a published table row |
| Torch of Nothing | Belt of Giant Strengh | yes | hand-edited: no such modifier |
| Chalk |  |  | nothing on this row yet |

## Worn items

| Worn | Modifiers |
| --- | --- |
| [[Ring of Protection]] | Ring of Protection |
