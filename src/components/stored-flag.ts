/*
 * How a boolean is spelled in a character note, and which spellings read as set.
 *
 * Shared by the two components that store one: a Table's `toggle` column, and a
 * Track whose run is one segment (SPEC §4.2). That is the whole reason the file
 * exists, and it is `column-types.ts`'s reason one step over. PATTERNS §1 names
 * this case twice — the truthiness spellings are its standing example of what a
 * second reader has to match, and its policy tier says a *set* climbs the reuse
 * ladder in one step, because the only thing a guard test over two copies could
 * assert is that they still agree, which is what one name says for free.
 *
 * Each of the three would drift on its own:
 *
 * - **Which spellings mean yes.** A note hand-edited to `✔` reads as ticked in a
 *   table cell and as untouched on a card, from the same file, with nothing on
 *   screen to say why.
 * - **What gets written.** Two components writing `yes` and `true` into one note
 *   makes the file inconsistent in a way the user never asked for and cannot
 *   fix, since each card rewrites its own entry on the next press.
 * - **What a two-state control is called.** "Yes" and "No" are what a reader
 *   hears and what a title says, and a pair of strings is a policy like any
 *   other number.
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

/**
 * What a two-state control is called, to a reader and to a listener.
 *
 * Only where the states have no names of their own. A named level says itself,
 * which is the whole point of naming it.
 */
export function flagReading(on: boolean): string {
	return on ? 'Yes' : 'No';
}
