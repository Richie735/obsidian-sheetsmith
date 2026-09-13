/*
 * What separates the parts of a value that holds several, and the split itself.
 *
 * One job: the character, and cutting a stored string on it. Nothing here knows
 * what a part *means* — a modifier cell's assignment grammar, a name's shape, a
 * definition lookup — because the two domains that share this one fact, a
 * modifier cell (`parse/modifier-cell.ts`) and a Passport list field
 * (`components/passport.ts`), have nothing else in common: Passport does not have
 * "effects" or "definitions", it has parts of a value.
 *
 * **Extracted rather than imported, on `docs/PATTERNS.md` §1's one-step tier.**
 * The separator is a bound exactly like `interaction/commit-window.ts`'s
 * `GESTURE_COMMIT` — one character, chosen for one reason, that two domains must
 * not silently drift apart on. A two-copy guard test here could only assert `';'`
 * still equals `';'`, which is what one constant says for free.
 *
 * `modifier-cell.ts` re-exports `LIST_SEPARATOR`, `listParts` and `joinParts` as
 * its own `MODIFIER_SEPARATOR`, `storedParts` and `spellParts`, so its own
 * importers and its own test suite see no change at all.
 *
 * **`joinParts` arrived a pass later than the split did, on the same argument
 * applied to the other half of the round trip.** The split extracted first
 * because Passport's own first design never reassembled parts — a commit wrote
 * back exactly the raw text a reader typed, so there was no join to share. The
 * owner's second pass replaced that with per-part editing, where every commit —
 * an edit, an add, or a remove — has to reassemble the surviving parts into one
 * stored string, which is exactly `modifier-cell.ts`'s own join
 * (`docs/features/passport-field-lists.md`). Leaving it behind there and
 * writing a second copy in Passport would be the exact drift the split was
 * written to prevent, one function later.
 *
 * Pure, so Constraint 5 holds.
 */

/**
 * What separates two parts of a value that holds several (`docs/features/
 * passport-field-lists.md`).
 *
 * **A semicolon and not the character a reader would guess.** A comma is what a
 * list looks like and is the one separator this domain cannot have: a modifier
 * cell's item names carry commas as a matter of course — *Bracers of Armor,
 * Greater* — and a Passport's own list field is chosen for the same reason: a
 * class name a reader will actually type, *Bard, College of Lore*, carries one
 * too. ` + ` fails worse, since `+1` and `+2` are suffixed to half the items in
 * every system surveyed; `|` would put a backslash in every multi-part cell of a
 * file people hand-edit, because `parse/table.ts` escapes it; and a newline
 * cannot be one at all, since both a table row and a fenced entry are one line.
 */
export const LIST_SEPARATOR = ';';

/**
 * The parts a value holds, in its own order: split, trimmed, empties dropped.
 *
 * **Exactly `storedParts`'s old body, generalised**: no assignment-awareness, no
 * repeat-collapsing. `modifier-cell.ts`'s `cellParts` collapses a repeated
 * *named* part because two identical enrolments are one modifier applied twice
 * on paper; a Passport list field has no such rule, because two identical parts
 * there are two chips a reader chose to write twice, not one thing counted twice.
 *
 * A trailing separator a hand edit left behind therefore draws no trailing empty
 * part: `"A; B;"` gives `['A', 'B']`, not `['A', 'B', '']`.
 */
export function listParts(raw: string): readonly string[] {
	const parts: string[] = [];
	for (const piece of raw.split(LIST_SEPARATOR)) {
		const part = piece.trim();
		if (part !== '') parts.push(part);
	}
	return parts;
}

/**
 * How several parts are joined back into one stored value: canonical, one
 * space after the separator.
 *
 * **Exactly `spellParts`'s old body.** Two identical parts join as two —
 * nothing here is a `Set` — because they are two chips or two effects a reader
 * wrote twice, not one thing counted twice; that reading is `cellParts`'s own,
 * upstream of this function, and has no analogue for a Passport list field at
 * all.
 *
 * **Not `listParts`'s exact inverse, and that is inherited rather than new.**
 * `joinParts(listParts(x))` reproduces `x` only where `x` already had no
 * irregular separator spacing: `listParts('A;B ;C')` gives `['A', 'B', 'C']`,
 * and joining that back gives `'A; B; C'`, not the original. A commit
 * therefore canonicalises the spacing of every part it rejoins, which is the
 * cost a modifier cell's own commits already pay and Constraint 3 does not
 * reach — an **untouched** entry never calls this function at all, so it
 * round-trips byte for byte regardless.
 */
export function joinParts(parts: readonly string[]): string {
	return parts.join(`${LIST_SEPARATOR} `);
}
