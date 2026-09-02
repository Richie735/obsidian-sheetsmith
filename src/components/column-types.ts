/*
 * What a table column holds, and what can be done with one.
 *
 * Shared by the components that render typed columns — Table's cells and a
 * Record set's fields — and by the editor field that configures both, which is
 * the whole reason the file exists: the readers held the same policies as
 * copies, and a list of strings copied into two files drifts in silence. There
 * are four now, and each copy had its own failure:
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
 * - **Where a `number`'s maximum comes from.** The fourth, and it arrived the
 *   same way the others did rather than by analogy: the two ids were literals
 *   in `editor/list-fields.ts` and the union was spelled again in
 *   `components/record-set.ts`. The editor imports nothing from a component, so
 *   renaming one left the build green while the select silently stopped taking
 *   effect — and it carries the third policy's defect too, since the editor
 *   omits the default from the file and the component reads a missing key as
 *   its own.
 *
 * PATTERNS §1 names this case exactly: a policy value climbs the reuse ladder in
 * one step, because a guard test over two copies can only assert they are still
 * equal, which is what one copy says for free.
 *
 * **The third policy is the one a second rendering component does not hold, and
 * saying which is the point of this paragraph.** A Record set refuses a `text`
 * field, so `DEFAULT_COLUMN_TYPE` is not *its* default — and giving it one of its
 * own is exactly the drift above, because the editor omits the key when it equals
 * this constant and a component reads a missing key as this constant. The
 * resolution keeps one answer to "which type is first" and takes `text` out of
 * what that component's field *offers* instead: `ConfigFieldSpec.columnOptions`
 * names the types a field holds, the first of them is written out where it is not
 * this default, and a type this file knows nothing about cannot reach either
 * reader (`contract.test.ts`). So the first two policies are shared by three
 * readers and the third by two, deliberately — and the fourth by two as well,
 * for a different reason rather than the same one: only one rendering component
 * has a per-holder maximum at all, and the editor field that configures it is
 * the second reader.
 *
 * **The fourth is the one a *type* holds rather than a test**, which is §1's
 * stated preference where it is available: `list-fields.ts` builds its labels
 * as a `Record<MaxSource, string>`, so a third source cannot be added below
 * without a word for it, and the component's own `maxSource` key takes the
 * union from here — so renaming it fails to compile at every call site instead
 * of going quiet.
 *
 * The *behaviour* built on these — what a stored cell is worth to a formula,
 * what a typed number is clamped to, what an unresolved computed value reads as
 * — is `components/typed-value.ts`, not here: §10 records this file as tested
 * through its consumers precisely because "a file of its own could assert little
 * past a constant equalling itself", and behaviour here would make that false.
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
	// **Appended, never inserted.** The order decides the default (below), so a
	// new type put first would silently reread every untyped column in every
	// layout as that type.
	//
	// `target` was here and is gone: a row no longer names what it changes, it
	// names one of the layout's modifier definitions, and the definition names the
	// target. A column a layout still types `target` reads as the default, which
	// is `text` — so its cells keep their names on screen and in the note, and the
	// author retypes the column to `modifier` when they have written the
	// definitions those names should have been.
	'modifier',
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
 * Where a `number` entry's maximum comes from: the entry itself, one number
 * every holder is read against, or **each holder**, a number the reader types
 * on the sheet beside the value.
 *
 * **Here for this file's own reason and not by analogy.** The ids were spelled
 * as literals in `editor/list-fields.ts` and the union was spelled again in
 * `components/record-set.ts`, with nothing relating them: the editor imports
 * nothing from a component, so renaming the union left the build green while
 * the select silently stopped taking effect. That is exactly the drift this
 * file's header opens by describing, and the third policy it names — two
 * answers to "which value is first" — is the same failure, because the editor
 * omits the default from the file and the component reads a missing key as its
 * own default.
 *
 * **The words are the vocabulary's and never a component's**, which is what
 * keeps `ColumnOptionsSpec`'s boundary claim true rather than half true: a
 * Record set reads **The field** / **Each record** and a Table would read **The
 * column** / **Each row**, but both persist these two ids, so the *labels* vary
 * per component and the stored value does not. `list-fields.ts` builds those
 * labels as a `Record<MaxSource, string>`, so a third source cannot be added
 * here without one — the guard §1 prefers to a test, because nobody has to
 * remember to run it.
 */
export const MAX_SOURCES = ['field', 'record'] as const;

export type MaxSource = (typeof MAX_SOURCES)[number];

/**
 * What an entry that does not say is, which is written out as absence exactly
 * as `DEFAULT_COLUMN_TYPE` is — so a layout written before a per-holder maximum
 * existed reads as it always did.
 */
export const DEFAULT_MAX_SOURCE: MaxSource = MAX_SOURCES[0];

/**
 * The one a caller actually tests for. Named because both the component and the
 * editor branch on it, and a literal in each is the copy that drifts.
 */
export const HOLDER_MAX_SOURCE: MaxSource = 'record';

/**
 * Column types a total can be taken over: the ones whose cell is a number
 * before any formula runs.
 *
 * A total sums what the note stores, over however many rows the character
 * happens to have. `text` has nothing to add up, and a `computed` column stores
 * nothing to sum — its values are derived per row, which is a different
 * question from publishing one row's value and is answered separately, below.
 * `modifier` holds the name of a definition, and a name is not a number.
 */
const TOTALLABLE: readonly ColumnType[] = ['number', 'level', 'toggle'];

/**
 * Held as strings rather than as `ColumnType`, so a caller holding a type out of
 * a layout file can ask without a cast. The array above is what is type-checked.
 */
export const TOTALLED_TYPES: ReadonlySet<string> = new Set(TOTALLABLE);

/**
 * Column types a declared row may publish its cell from: everything but `text`.
 *
 * A published row answers to `<component id>.<row key>` (SPEC §5), so the cell
 * has to mean one value. A text cell does not: the card shows "sword" where the
 * note holds "[[Sunblade|sword]]", and a name meaning either is a name meaning
 * both. A computed column is here where it is absent from the set above,
 * because one row's derived value is a value and a sum of them is not. A
 * `modifier` cell holds a definition's name, and the language has nothing to
 * compare a name to.
 */
const PUBLISHABLE: readonly ColumnType[] = [
	'number',
	'level',
	'toggle',
	'computed',
];

/** As above: strings, so a type read out of a layout file can be asked about. */
export const PUBLISHABLE_TYPES: ReadonlySet<string> = new Set(PUBLISHABLE);
