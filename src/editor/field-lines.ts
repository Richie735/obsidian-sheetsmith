/*
 * What a line is, in a textarea field holding a list of them.
 *
 * Three fields in this folder hold a list one-per-line — the function library,
 * the reset triggers and the bonus types — and each read a line back its own
 * way. Two definitions, three copies, and nothing deciding which was right: the
 * next copier picked whichever file they happened to open.
 *
 * **The two rules are both correct, for two different kinds of content**, which
 * is why this names them rather than unifying them:
 *
 * - **A stored identifier is trimmed at both ends.** A trigger name and a bonus
 *   type are matched byte for byte against what something else stored — a
 *   binding's `trigger`, a modifier definition's `bonusType` — so `  item` and
 *   `item` surviving as two entries makes two types that stack, which is the
 *   arithmetic being wrong for a reason nothing on screen shows.
 * - **A line of code keeps its leading layout.** A function definition is parsed
 *   after `parseFunctions` trims it anyway, so the leading space changes no
 *   arithmetic; what it changes is the file, and indentation an author typed is
 *   theirs to keep.
 *
 * So the drift was never a bug in either behaviour, only in there being no name
 * for either. `PATTERNS.md` §1's one-step tier is the argument for a module this
 * small: where the duplicated thing is a *policy*, drift is the entire risk and a
 * guard test over the copies could only assert they still agree.
 *
 * **One consumer per rule now, and it still stands.** The twins were merged into
 * `line-list-field.ts` after this was written, so `storedLines` has that one
 * caller and `codeLines` has the function library. That is not the one-consumer
 * case §1 tells you to keep private: what this module holds is the *difference*
 * between two rules that live in two files, which is exactly the thing a single
 * caller cannot state and the next copier cannot find. Fold either back into its
 * caller and the two rules stop being visible in one place, which is the state
 * the three copies were already in.
 *
 * **What is deliberately not here is the field**, and two of the three have since
 * merged: `line-list-field.ts` is the form the trigger list and the bonus types
 * share. The function library is not a consumer of it — it renders a third child
 * per problem row and a count sentence with an extra clause, which are render
 * callbacks rather than data — so it keeps its own form and takes only the line
 * rule from here.
 */

/** Trailing blank lines are an artefact of typing, not content. */
function withoutTrailingBlanks(lines: string[]): string[] {
	const kept = [...lines];
	// Interior blanks stay: every parser here reports one, and a line deleted
	// with nothing said is worse than a named mistake.
	while (kept.length > 0 && kept.at(-1) === '') kept.pop();
	return kept;
}

/**
 * A list of identifiers the file stores and something else matches on.
 *
 * Trimmed at both ends, because a leading space would make a second entry that
 * looks identical on screen.
 */
export function storedLines(text: string): string[] {
	return withoutTrailingBlanks(text.split('\n').map((line) => line.trim()));
}

/**
 * A list of definitions, where a line is code.
 *
 * Trimmed at the end only: the parser trims each line before reading it, so the
 * leading space is the author's own layout rather than something to correct.
 */
export function codeLines(text: string): string[] {
	return withoutTrailingBlanks(text.split('\n').map((line) => line.trimEnd()));
}
