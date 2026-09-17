/*
 * Which line of a note's stored rows a declared row is (SPEC §4.2).
 *
 * Extracted from `table.ts` on `markdown-body.ts`'s own argument: the claim
 * rule decides which line of the note a declared row reads, and two copies of
 * that is precisely the drift Constraints 3 and 4 exist to prevent — a second
 * component declaring rows over its own stored lines must claim them exactly
 * the way a Table does, or the same note read through two components would
 * disagree about which line is whose.
 *
 * Pure position matching, nothing about a note's format: it takes the names a
 * caller already read out of its own storage and answers which of them a
 * declared row owns. `table.ts` calls this over a markdown table's first
 * column; a second caller storing rows a different way calls it just the
 * same, over whatever names its own rows carry.
 */

/** Where each declared row sits in the note, and which rows are the character's. */
export interface RowClaims {
	/**
	 * Note row index per declared row, in declared order; null where the note
	 * holds no row by that name yet.
	 */
	declared: (number | null)[];
	/** Note rows no declared row claimed, in note order: the character's own. */
	own: number[];
}

/**
 * **A declared row claims the first note row spelling its name, scanning top to
 * bottom, case-insensitively. Every unclaimed note row belongs to the
 * character.**
 *
 * One rule, and it settles the whole card: a 5e skill list claims every row and
 * behaves exactly as it did; an attack table declares nothing and every row is
 * the character's; a Blades load list has its printed gear declared above the
 * blank lines a player fills. It also disposes of the per-row flags a tool
 * carrying this feature needs — the claim *is* "who owns this row", so
 * "may not be deleted" is "claimed" and nothing has to be stored.
 *
 * Case-insensitive matching is safe here for the reason it was not safe in the
 * tool that shipped it: no formula names a row, so what a row's capitalisation
 * can change is which declared row claims it, never what any arithmetic
 * resolves. The note keeps its own spelling either way.
 *
 * One helper because a render and a write must agree, whichever component
 * calls it. A delete control drawn over a row the writer would refuse to
 * delete is worse than no control at all.
 */
export function claimRows(
	declaredLabels: readonly string[],
	noteNames: readonly string[],
): RowClaims {
	const claimed = new Set<number>();
	const declared = declaredLabels.map((raw) => {
		const label = raw.trim().toLowerCase();
		const at = noteNames.findIndex(
			(name, index) =>
				!claimed.has(index) && name.trim().toLowerCase() === label,
		);
		if (at === -1) return null;
		claimed.add(at);
		return at;
	});
	const own: number[] = [];
	noteNames.forEach((_, index) => {
		if (!claimed.has(index)) own.push(index);
	});
	return { declared, own };
}
