/*
 * What a table column holds, and what can be done with one.
 *
 * Shared by the component that renders typed columns and by the editor field
 * that configures them, which is the whole reason the file exists: the two held
 * the same three policies as copies, and a list of strings copied into two files
 * drifts in silence. Each copy had its own failure:
 *
 * - **Which types can be totalled.** Add a sixth type whose cells are numeric,
 *   put it in one copy only, and either the editor offers a total the component
 *   reports as a configuration error or it hides one the component would have
 *   accepted. Neither side's tests notice, because both only ever assert the
 *   types that already exist.
 * - **Which types there are.** A type the editor cannot select is a type no
 *   layout can be given.
 * - **Which type is the default.** The worst of the three, because it misreads
 *   stored data rather than offering the wrong control: the editor leaves the
 *   default out of the file and the component reads a missing key as its own
 *   default, so two answers to "which is first" turn every numeric column in
 *   every layout into a text column, silently.
 *
 * PATTERNS §1 names this case exactly: a policy value climbs the reuse ladder in
 * one step, because a guard test over two copies can only assert they are still
 * equal, which is what one copy says for free.
 */

/**
 * Every column kind, in the order they are offered, the default first.
 * `computed` is read-only; the rest are character data.
 */
export const COLUMN_TYPES = [
	'text',
	'number',
	'level',
	'toggle',
	'computed',
] as const;

export type ColumnType = (typeof COLUMN_TYPES)[number];

/**
 * What a column with no type is.
 *
 * Named because both sides depend on it and neither can see the other: the
 * component reads a missing `type` as this, and the editor leaves the key out of
 * the file for exactly that reason. Two copies of "text is first" is the one
 * drift in this file that would misread stored data rather than merely offer the
 * wrong control — make `number` the editor's first option and every numeric
 * column in every layout silently becomes a text column.
 */
export const DEFAULT_COLUMN_TYPE: ColumnType = COLUMN_TYPES[0];

/**
 * Column types a total can be taken over: the ones whose cell is a number
 * before any formula runs.
 *
 * A total is a name the rest of the sheet can read (SPEC §5), so it has to come
 * from stored data alone. `text` has nothing to add up, and `computed` cannot
 * publish a value until §13's publication question is settled — which is the
 * change this file is waiting for, and the reason the set is in one place.
 */
const TOTALLABLE: readonly ColumnType[] = ['number', 'level', 'toggle'];

/**
 * Held as strings rather than as `ColumnType`, so a caller holding a type out of
 * a layout file can ask without a cast. The array above is what is type-checked.
 */
export const TOTALLED_TYPES: ReadonlySet<string> = new Set(TOTALLABLE);
