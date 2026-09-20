/*
 * How a boolean is spelled in a character note, and which spellings read as set.
 *
 * Shared by every component that stores one, and by the module that says what a
 * typed value means: a Table's `toggle` column, a Track whose run is one segment
 * (SPEC §4.2), a Record set's `toggle` field, a Roster cell, and
 * `typed-value.ts`. **Five importers, and this sentence said "the two
 * components" until somebody counted** — a count of files is not the rule and
 * goes stale silently, which is the drift `PATTERNS` §2 records against its own
 * `setIcon` paragraph for exactly this reason. The rule is that one file owns
 * the spellings; the roster is what it happens to have grown to. It is
 * `column-types.ts`'s reason one step over. PATTERNS §1 names
 * this case twice — the truthiness spellings are its standing example of what a
 * second reader has to match, and its policy tier says a *set* climbs the reuse
 * ladder in one step, because the only thing a guard test over two copies could
 * assert is that they still agree, which is what one name says for free.
 *
 * Each of the two would drift on its own:
 *
 * - **Which spellings mean yes.** A note hand-edited to `✔` reads as ticked in a
 *   table cell and as untouched on a card, from the same file, with nothing on
 *   screen to say why.
 * - **What gets written.** Two components writing `yes` and `true` into one note
 *   makes the file inconsistent in a way the user never asked for and cannot
 *   fix, since each card rewrites its own entry on the next press.
 *
 * It held a third — **what a two-state control is called** — and that one has
 * gone with the function that computed it. `SPEC` §13 ruled that `aria-pressed`
 * says an unnamed flag's state and no word is announced beside it, so there was
 * nothing left for the pair of strings to be read by: every caller computed the
 * reading and discarded it. What is left is note format and nothing else, which
 * is why every member below is now driven by a real read or a real write.
 *
 * The application is here rather than only the values, which is the half that
 * matters: a shared set with `has(text.toLowerCase())` written at both sites is
 * a policy shared and its application duplicated, and the copy that can still
 * drift is the one nothing is watching.
 */

/** What the note is written as. `yes` and `no` read well in a file for a flag. */
const TRUE_TEXT = 'yes';
const FALSE_TEXT = 'no';

/**
 * Everything that reads as set. Wider than what is written, because a note is
 * hand-editable and a person writing a flag by hand writes whichever of these
 * their own sheets use.
 */
const SET = new Set([TRUE_TEXT, 'true', 'x', '✓', '✔', '1']);

/**
 * Everything that reads as cleared, beyond a blank and a zero.
 *
 * Named rather than left as "anything else" because one caller needs to tell a
 * flag from a mistake: Track reports a value that is neither a number nor a flag
 * as a malformed section, so `no` has to be a spelling it knows rather than
 * merely something that is not `yes`.
 */
const CLEAR = new Set([FALSE_TEXT, 'false']);

/** What to write into the note for a flag's state. */
export function flagText(on: boolean): string {
	return on ? TRUE_TEXT : FALSE_TEXT;
}

/** Whether a stored value reads as set. Anything unrecognised is not. */
export function isFlagSet(raw: string): boolean {
	return SET.has(raw.trim().toLowerCase());
}

/**
 * Whether a stored value is a flag at all, either way.
 *
 * The question a reader asks before rejecting a value: `no` is a flag and
 * `maybe` is a malformed section, and only a named set of spellings separates
 * them.
 */
export function isFlagSpelling(raw: string): boolean {
	const text = raw.trim().toLowerCase();
	return SET.has(text) || CLEAR.has(text);
}
