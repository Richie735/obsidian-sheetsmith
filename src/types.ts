/*
 * Shared component contract (SPEC §4.1).
 *
 * Every component implements ComponentDefinition and nothing more. Nothing
 * outside a component may depend on a specific component type existing.
 */

/**
 * Frontmatter key marking a note as a character sheet and naming its layout.
 * This is the only property Sheetsmith requires on a character note.
 */
export const LAYOUT_KEY = 'sheet-layout';

/**
 * How a component stores its section. Fixed by type, never a user choice.
 *
 * `none` is a container (SPEC §4.1): it holds other components rather than a
 * value, so it has no section in the note, nothing reads it and nothing writes
 * it. Declared rather than left implicit in a `read` that always returns
 * nothing, because that is a claim only a reader of the component could check —
 * and it is what lets the sheet skip `getSection` and `read` for one, so a note
 * holding unmapped prose under a heading that happens to match a container's
 * label is never even looked at (SPEC §10).
 */
export type StorageKind = 'fenced' | 'markdown' | 'none';

/** Grid placement of a component within a layout. */
export interface GridPosition {
	col: number;
	row: number;
	width: number;
	height: number;
}

/**
 * Every key of a placement, in the order a form offers them, keyed on the type
 * so it cannot fall short of it.
 *
 * Two readers walk these four in order and neither can name them itself: the
 * parser validates one number per key, and the editor's panel mints one field
 * per key. A bare list spelled twice is `docs/PATTERNS.md` §1's one-step tier —
 * the only thing a guard test could assert is that the copies still hold the
 * same four — and it went from two spellings in one file to two in two when the
 * panel moved out, which is the drift nothing can see by reading either file.
 *
 * **A `Record` rather than an array, and that is the whole of why it looks like
 * this.** `readonly (keyof GridPosition)[]` is the obvious spelling and it only
 * rejects a typo: a four-element array satisfies it while `GridPosition` holds
 * five keys, so the fifth would be skipped by the parser and absent from the
 * form with nothing saying so. `Record<keyof GridPosition, number>` does not
 * compile until every key is named, which is §1's "where a type can carry the
 * guard instead, prefer that" — the same shape as the editor's
 * `Record<ColumnType, string>`, and for the same reason.
 *
 * The numbers are the order, read rather than assumed: `Object.keys` gives
 * insertion order for string keys, but relying on that would make the order a
 * property of how this object happens to be typed out.
 */
const POSITION_ORDER = {
	col: 1,
	row: 2,
	width: 3,
	height: 4,
} satisfies Record<keyof GridPosition, number>;

/**
 * The four keys of `GridPosition`, in the order a form offers them.
 *
 * `readonly`, like `EDITOR_OWNED_KEYS` below and for the same reason: a shared
 * vocabulary two modules iterate is one that neither may edit. The `satisfies`
 * above guards what the list *contains* at compile time and says nothing about a
 * reader calling `.reverse()` or `.push()` on it, which is a way to drift the one
 * copy this export exists to prevent — measured, not assumed: appending
 * `GRID_POSITION_KEYS.reverse()` to a consumer compiled before this annotation
 * and does not after. It cannot be `as const` where its sibling can, because it
 * is derived from the `Record` rather than written out, and that derivation is
 * what carries the completeness guard.
 */
export const GRID_POSITION_KEYS: readonly (keyof GridPosition)[] = (
	Object.keys(POSITION_ORDER) as (keyof GridPosition)[]
).sort((a, b) => POSITION_ORDER[a] - POSITION_ORDER[b]);

/** Reset behaviour for stateful components (SPEC §6). */
export interface ResetBinding {
	/** Name of the layout-defined trigger this component responds to. */
	trigger: string;
	/**
	 * What resetting means for the component's own value. The states are named
	 * rather than numbered because the same three cover a Toggle, where full
	 * and empty are true and false, as readily as a Pool, where they are its
	 * max and zero.
	 *
	 * Optional, because a trigger may be about the buffer alone: 4e clears
	 * temporary hit points at the end of an encounter and touches nothing else.
	 * A binding still has to do something, so one of `action` and `buffer` is
	 * required.
	 */
	action?: 'full' | 'empty' | 'formula';
	/**
	 * The expression, for `action: 'formula'` and nothing else. It is a
	 * formula field like any other, declared as `reset.to`, which is why the
	 * action is a separate key: one string cannot be both an expression the
	 * evaluator reads and a literal word standing in for one.
	 */
	to?: string;
	/**
	 * Clear the component's secondary buffer, independently of `action`.
	 *
	 * Which event empties a buffer is a rule of the system and nothing a pool
	 * could infer: 5e clears temporary hit points on a long rest, 4e at the end
	 * of an encounter, Blades at the next score. All of those are events a
	 * trigger already models, and before this the layout had no way to say so.
	 *
	 * Only components declaring `hasBuffer` honour it, and the editor offers it
	 * only for those — so it is not a key every binding carries the weight of.
	 */
	buffer?: 'clear';
}

/** Properties every component carries, whatever its type (SPEC §4.1). */
export interface ComponentConfig {
	/** Stable identity that survives label renames. What formulas reference. */
	id: string;
	/** Which component this is. */
	type: string;
	/** Display name, and the section heading in the note body. */
	label: string;
	position: GridPosition;
	/**
	 * The components this one contains, each placed on this component's own
	 * grid, which is this component's `width` in columns by its `height` in
	 * rows — so an inner column is a sheet column and an inner row is a sheet
	 * row, and a child two rows high is the size of the identical component two
	 * rows high outside it (SPEC §4.2, §8).
	 *
	 * Shared config the plugin itself reads, the category `position` and
	 * `reset` are already in: the parser runs over every child for its
	 * position, its id migration and the id-and-label uniqueness that keys note
	 * sections globally, and the sheet has to flatten the tree before its name
	 * table can be complete. A component never declares it in `configFields`.
	 *
	 * A container inside a container may hold only leaves — `parseLayout`
	 * refuses a third — and containment is not addressing: a child publishes
	 * exactly the name it would publish at the top level, at any depth.
	 */
	children?: ComponentConfig[];
	/**
	 * Every trigger this component responds to (SPEC §6), each with its own
	 * action. A list because the triggers a system declares overlap: in 5e
	 * everything a short rest restores is restored by a long rest too, and a
	 * component that could name only one trigger could not say so.
	 *
	 * A layout may write one binding on its own rather than a list of one; the
	 * parser normalises it, so everything downstream sees a list.
	 */
	reset?: ResetBinding[];
}

/**
 * Outcome of applying a reset (SPEC §6). Shaped like `ReadResult` because it
 * is the same situation: one component's failure, reported on that component
 * while everything else carries on.
 *
 * A result rather than plain data, because a reset has a failure the caller
 * cannot see any other way. `full` on a Pool whose `max` will not resolve
 * produces no new value, and data returned unchanged is indistinguishable
 * from a pool that was already full — so the trigger would report success
 * for a component it never reset. It also spares the component inventing a
 * data object when it was handed null and has nothing to reset.
 */
export type ResetResult<TData> =
	| { ok: true; data: TData }
	| { ok: false; error: string };

/**
 * Outcome of parsing a section body. An error affects that component only.
 * `data: null` means the section exists but holds no data yet — it renders
 * editable, exactly like a missing section, and the first edit writes the
 * data block in place.
 */
export type ReadResult<TData> =
	| { ok: true; data: TData | null }
	| { ok: false; error: string };

/**
 * Values the formula engine resolved for this component's formula fields,
 * keyed by field name. Empty until M3 wires the engine in.
 */
export type ResolvedValues = Readonly<
	Record<string, string | number | boolean | null | undefined>
>;

/** A config field the layout editor renders for a component. */
export interface ConfigFieldSpec {
	/** Key in the component's config object. */
	key: string;
	/** Field label shown in the editor. */
	label: string;
	/**
	 * Input kind. 'formula' is a text field holding an expression; 'text-list'
	 * is an ordered list of plain strings, edited as one comma-separated field
	 * and stored as an array; the last four are ordered lists the editor
	 * renders as a table of their own — 'entries' of the two columns the
	 * field's own `entryColumns` names, 'track-rows' of those two plus a count
	 * and a sense, 'rows' of { label, values? }, and 'columns' of typed column
	 * definitions.
	 */
	kind:
		| 'text'
		| 'number'
		| 'boolean'
		| 'formula'
		| 'select'
		| 'text-list'
		| 'entries'
		| 'track-rows'
		| 'rows'
		| 'columns';
	/**
	 * Help text shown under the field. Required: a field the layout editor
	 * renders with no explanation is a field the author has to guess at, and
	 * the guess is usually about what the setting does to the note. State the
	 * consequence, not the label.
	 */
	description: string;
	/**
	 * Optional grouping label; consecutive fields sharing one render under
	 * a subheading in the layout editor.
	 */
	group?: string;
	/**
	 * Show this field only while another config key holds a value, e.g.
	 * alignment only when sizing is fixed.
	 *
	 * Matched against the controlling field's effective value, not the stored
	 * one: a key whose value equals its own default is omitted from the
	 * config, so a condition naming that default is satisfied by its absence.
	 * That is what lets a field be visible in the ordinary mode and hidden in
	 * the exceptional one, rather than only the other way round.
	 */
	visibleWhen?: { key: string; equals: unknown };
	/** Default for boolean fields; the key is omitted when it matches. */
	default?: boolean;
	/** Choices for 'select' fields. The first is the default and is omitted. */
	options?: readonly string[];
	/**
	 * What an 'entries' or 'track-rows' list calls its two content columns.
	 * Required on those two kinds, which `contract.test.ts` checks: the member
	 * is optional here because no other kind has a use for it, and the editor
	 * draws no table for a list field that declares none.
	 *
	 * A field of these kinds is two columns of one shape — a required name and
	 * an optional second string — under three different vocabularies: a Card
	 * set's entries are a key and a full name, a Track's rows a key and a name,
	 * and a Card's options a value and a label. The words cannot be shared,
	 * because a Card already has a `key` (SPEC §13), and they cannot sit in the
	 * editor either: a shared field holding one caller's words is the thing
	 * PATTERNS §1's worked example is against.
	 */
	entryColumns?: readonly [EntryColumnSpec, EntryColumnSpec];
}

/**
 * One content column of an 'entries' list: the property each cell writes on
 * the entry, and the word over it.
 *
 * The heading is the column's only name — it is also the input's placeholder
 * and its accessible name, so a screen reader hears what the eye reads
 * (`docs/UI.md` §6).
 */
export interface EntryColumnSpec {
	key: string;
	heading: string;
	/**
	 * This column holds prose rather than an abbreviation, so it takes the
	 * width instead of a fixed narrow track.
	 *
	 * The field was built for a Card set, whose key is `STR` and whose name is
	 * "Strength", so the shape it left behind is a narrow first column and a
	 * wide second one. A Card's options invert it — the value is the word and
	 * the label is usually blank — and a list that moved its vocabulary and
	 * kept its geometry clips "The Dagger Isles" beside an empty box five
	 * times its width. The second column is the remainder in every shape, so
	 * this only ever changes the first.
	 */
	wide?: boolean;
}

/**
 * Shared config the layout editor owns. A component declares none of it, in
 * `configFields` or in a palette entry.
 *
 * Two rules need this list and they are checked at different times — a
 * `configFields` entry is data, so the registry contract asks at runtime, while a
 * palette entry's config *is* the shape, so the compiler asks. PATTERNS §1's
 * policy tier is why there is one copy rather than two: a set is where drift is
 * the entire risk, and a guard test over two spellings of six strings could only
 * assert they still agree.
 *
 * **The const is the copy and the type is derived from it**, not the other way
 * round, because the failure is one-directional. A seventh key added to a
 * hand-written type compiles, and the runtime check silently stops covering it —
 * a component could then declare it in `configFields` with the build still
 * green. Derived, a seventh key has nowhere to be added that the check does not
 * see. `column-types.ts` is the same shape for the same reason.
 */
export const EDITOR_OWNED_KEYS = [
	'id',
	'type',
	'label',
	'position',
	'reset',
	'children',
] as const;

export type EditorOwnedKey = (typeof EDITOR_OWNED_KEYS)[number];

/**
 * One way the layout editor offers a component, with configuration prefilled
 * (SPEC §4.2, §13).
 *
 * A layout stores the component an entry produced and never the entry itself, so
 * nothing here reaches a file: the entry is a starting point the author then
 * edits like any other component. That is also why an entry may be named for a
 * job where a component may not (SPEC §2) — Table offered as "Inventory" costs
 * the plugin no neutrality, because the type stays generic.
 */
export interface PaletteEntry<TConfig extends ComponentConfig = ComponentConfig> {
	/**
	 * What the palette calls it, and the label the new component starts with.
	 *
	 * One string for both, because they are the same answer: an author who chose
	 * "Checkbox" has a component called Checkbox until they rename it, and a
	 * second name would only be a second thing to keep in step.
	 */
	name: string;
	/**
	 * What the entry is for, and what it does to the note.
	 *
	 * Required on `ConfigFieldSpec.description`'s rule: it is the only
	 * explanation the author is given, and here the menu line is one or two
	 * words. State the consequence, not the label.
	 */
	description: string;
	/**
	 * Config written into the new component.
	 *
	 * The keys the editor owns are excluded by the type rather than by a check,
	 * because there is no editor field here for a check to hang on. Two of them
	 * are worth the sentence. A `reset` prefill would name a trigger the layout
	 * may not have declared, which SPEC §6 reports in the editor rather than
	 * refusing, so the entry would hand over a binding that reaches nothing. A
	 * `children` prefill would make an entry that produces several components,
	 * which SPEC §13 rules out: a palette entry is one component with its config
	 * filled in, so a job needing two has nothing for one entry to be.
	 */
	config: Partial<Omit<TConfig, EditorOwnedKey>>;
}

/** A value a formula can produce or a scope can hold. */
export type FieldValue = string | number | boolean;

/**
 * What a published name is worth, where the note's own value is not it.
 *
 * An entry takes at most one of the two, and declaring both is refused rather
 * than resolved in some order: an entry saying two things about one name has
 * no right answer.
 *
 * `display` names one of the component's own formula fields, so a reader of
 * the layout can in principle follow the edge from one component to the next,
 * and SPEC §5's save-time cycle check has an edge to see. `compute` is the
 * component's own code, which that check can never see through, so it is for
 * the value nothing else could produce — a Track's filled segments out of its
 * stored marks, a Table row's cell in its published column. `display` stays
 * the one to reach for wherever it will do.
 */
type ScopeEntrySource =
	| {
			/**
			 * The formula field producing the displayed value, and the internal
			 * scope to run it in (one entry's own `value`, later a table row).
			 * Evaluated lazily, because it may reference other components.
			 */
			display?: {
				field: string;
				scope: Readonly<Record<string, FieldValue>>;
			};
			compute?: never;
	  }
	| {
			display?: never;
			/**
			 * The value this component alone can produce, given a resolver bound
			 * to the finished sheet. Called lazily by the name table, inside the
			 * same guard `display` runs under, so a name computed from another
			 * name is memoised and a cycle through one is caught rather than
			 * recursed. Null or undefined publishes nothing.
			 */
			compute?: (resolve: FieldResolver) => FieldValue | null | undefined;
	  };

/**
 * One name a component publishes to the rest of the sheet.
 *
 * A bare reference gets what the card shows: the `display` formula's result or
 * the `compute`d one where there is either, and the stored value otherwise.
 * `<name>.value` always gets the stored value, for the formula that wants the
 * raw score rather than the modifier the card puts in large type.
 */
export type ScopeEntry = {
	/** What the note stores. Referenced as `<name>.value`. */
	value?: FieldValue;
	/**
	 * How many of this entry's ceiling remain, referenced as `<name>.left`.
	 * Sits outside `ScopeEntrySource` rather than as a third alternative in
	 * it: `.left` is not a source for what the name itself is worth, so it
	 * coexists with `display` or `compute` or neither, exactly as `value`
	 * already does.
	 *
	 * Optional in a stronger sense than `display` and `compute` are: those
	 * two are how *every* entry says what it is worth, so one of them (or
	 * neither, falling back to `value`) is always live. `left` has no such
	 * universal role — most entries never set it, and `.left` is published
	 * only where this member is present at all (SPEC §5). A row's ceiling is
	 * the motivating case: arithmetic over a config field no formula on the
	 * sheet can see, the same reason `compute`'s own doc comment gives for
	 * existing, so it takes the same lazily-supplied resolver. It returns
	 * `number | undefined` rather than `compute`'s general `FieldValue`,
	 * because "how many are left" is definitionally a count and never a
	 * string or boolean — narrower on purpose, not out of laziness.
	 */
	left?: (resolve: FieldResolver) => number | undefined;
} & ScopeEntrySource;

/**
 * What a component publishes to formulas elsewhere on the sheet (SPEC §5).
 *
 * `self` is referenced by the bare component id — an armour class is just
 * `armour_class`. `named` entries are referenced as `<id>.<name>`, which is
 * how a group of entries exposes each one: `abilities.DEX`.
 */
export interface ScopeValues {
	self?: ScopeEntry;
	named?: Readonly<Record<string, ScopeEntry>>;
}

/**
 * Evaluates one of the component's formula fields against extra names, such
 * as a table row or one ability's value. Returns null when the field has no
 * expression or it cannot be evaluated.
 *
 * `published` is what makes `mod.self` mean anything (SPEC §5): a modifier is
 * pushed at a published name, and a formula reads what was pushed at the name
 * its own result becomes. It is the exact shape `value` already has, read one
 * layer out — `value` is the number this evaluation is about, and `mod.self` is
 * what has been pushed at the name this evaluation becomes.
 *
 * **Optional, and that is a live risk rather than a convenience.** A component
 * that publishes a name and forgets to say so here reads `mod.self` as 0, and
 * nothing reports it: the accepting set is computed from the formula text, so it
 * still claims the name takes a modifier. `contract.test.ts` cannot see it
 * either, since passing an argument is not a member. It is caught only by a test
 * per publishing component, which is why Card, Card set and Table each have one.
 */
export type FieldResolver = (
	field: string,
	scope: Readonly<Record<string, FieldValue>>,
	published?: string,
	/**
	 * Whether this evaluation is for display only rather than the one that
	 * becomes the published name (SPEC §5).
	 *
	 * A component evaluating one name twice — a Card's `derived`, which becomes
	 * the name, and its `effective`, which is a second reading for the value pill
	 * — passes `true` for the second. Both see the value phase; only the one that
	 * publishes takes the result phase and the override, which land on the
	 * published number rather than on a display of what is behind it.
	 *
	 * Absent is `false`, so a component that publishes one number per name says
	 * nothing and means what it always meant.
	 */
	displayOnly?: boolean,
) => FieldValue | null;

/**
 * One row an aggregate walks (SPEC §5).
 *
 * A row, unlike everything else a formula reads, has no name of its own: what
 * an aggregate is for is the rows whose number the layout does not know. So it
 * carries the two things a walk needs and nothing that could identify it.
 */
export interface RowValues {
	/**
	 * The row as a reader sees it, for wherever an error has to name one. Never
	 * as the file spells it: a name cell may hold a wikilink, and a message
	 * reading "[[Sunblade|sword]]" names nothing anybody can find on the card.
	 */
	label: string;
	/**
	 * The names this row's expressions may read. A name that would not resolve
	 * is absent rather than zero, so an expression reading it fails and the
	 * aggregate says which row — publishing a silent zero is the quietly wrong
	 * number SPEC §5 refuses everywhere else.
	 */
	values: Readonly<Record<string, FieldValue>>;
}

/**
 * A component's rows, built with a resolver bound to the finished sheet.
 *
 * A factory rather than the rows themselves, and for the same reason
 * `ScopeEntry.compute` is one: a row may hold a computed column, which is a
 * formula that reads the rest of the sheet, and the sheet is the thing being
 * built. Called at most once per sheet.
 */
export type RowsSource = (resolve: FieldResolver) => readonly RowValues[];

/**
 * The two things a modifier definition can do to a number (SPEC §5).
 *
 * Two named steps and no priority integer: **an override applies first and the
 * additions land on top of it.** That is the property the whole design rests on
 * — overrides reduce to one number (the highest) and additions reduce to one
 * number (typed stacking), so there is nothing to sequence *within* either step
 * and the result cannot depend on the order the enrolments are walked in.
 *
 * **"Step" and not "phase", deliberately, because this file now holds both
 * senses.** `ModifierPhase` above is SPEC §5's word for *where a modifier lands*
 * — inside the formula or on what it came to — and that is the spec's own
 * vocabulary, so it keeps the word. This one is *when the engine resolves it*,
 * overrides then additions, and it is comment text with no type behind it. The
 * two sat fifteen lines apart saying "phase" at each other until a review read
 * them together. "Step" is already this repository's word for it — the override
 * step is what `docs/features/modifier-definitions.md` calls this.

 *
 *
 * Foundry carried a user-facing priority integer for thirteen major versions and
 * added phases in v14 to "avoid priority competition"; its own #14519 is what
 * that fragility costs, an ADD change silently losing to a DOWNGRADE because a
 * default priority read 0. The operator is what an author picks and the phase is
 * what it implies, so naming the phase as well would be a second field saying
 * one thing — which is the priority integer arriving under a new name.
 */
export type ModifierOperator = 'add' | 'override';

/**
 * Which part of a target's arithmetic an addition lands on (SPEC §5).
 *
 * A published name has one slot and its formula decides where the slot's total
 * goes, which is what makes `floor((value + mod.self - 10) / 2)` raise a score
 * and `floor((value - 10) / 2) + mod.self` raise a modifier. That is right for
 * the *layout* and wrong for the *character*: on one ability card a belt raises
 * the score and a blessing adds to the check, and the formula cannot be both.
 *
 * So the slot has two totals and a modifier says which it joins.
 *
 * - `value` — inside the formula, which is what `mod.self` resolves to. The
 *   default, and what every modifier written before this existed is.
 * - `result` — added to the number the formula came to, after it ran. The phase
 *   an override has always been in.
 *
 * **They contest separately**, which falls out of what they are: an item bonus to
 * a score and an item bonus to a check are two different quantities, so the
 * best-of-a-type rule runs once per phase rather than across both.
 *
 * **Only additions carry one.** An override sets the published number and stays
 * where it has always been, in the result phase; a "set your Strength score to
 * 21" would be a value-phase override and needs the *component* to take part,
 * since `value` is passed into the evaluation rather than owned by it.
 */
export type ModifierPhase = 'value' | 'result';

/**
 * Which phase a modifier lands in, from whatever its `applies` holds.
 *
 * **This predicate is the backward-compatibility guarantee, not a convenience.**
 * Every modifier in every layout and every note written before the phase existed
 * says nothing, and all of them must go on meaning what `mod.self` has always
 * meant. So the default is load-bearing in the direction it points: anything but
 * the literal `result` is `value`, which leaves a hand-edited typo doing what it
 * did before rather than silently moving it onto a number the author never aimed
 * at.
 *
 * Beside the type on `operatorOf`'s own terms, and it arrives with that entry's
 * history rather than repeating it: the operator's default was spelled out at
 * four sites after being extracted at one, and this one had reached **five** —
 * twice as a private function of this exact name and body in two files that do
 * not mention each other, each re-arguing the fallback in its own words. `PATTERNS`
 * §1's one-step tier is explicit that a predicate extracts on the *second*
 * consumer, because the only thing a guard test over two copies could assert is
 * that they still agree, and one name says that for free. One copy drifting to
 * `!== 'value'` is the whole risk, and it is silent.
 *
 * `unknown` rather than `ModifierPhase | undefined`, for `operatorOf`'s reason and
 * one more of its own: the parse tier holds a definition straight out of a layout
 * file where every member is still free, and it reads the key **trimmed**, so the
 * trim belongs here or the parser and its four siblings disagree about
 * `" result "`.
 */
export function phaseOf(raw: { applies?: unknown }): ModifierPhase {
	return typeof raw.applies === 'string' && raw.applies.trim() === 'result'
		? 'result'
		: 'value';
}

/**
 * Which step a definition belongs to, from whatever its `operator` holds.
 *
 * **The fact worth naming is the default**: anything but the literal `override`
 * is `add`, which is what a definition that says nothing is — and a misspelt
 * operator adding rather than setting is the safe direction to be wrong in, since
 * an addition of the wrong size is visible in the breakdown where a silent
 * override replaces a number the reader can no longer account for.
 *
 * Beside the type rather than in a reader, on `isContainer`'s own terms: a
 * predicate over a shape is the shape's, and this one was spelled out at four
 * sites after being extracted at one. The drift the one-step tier warns about is
 * concrete here — add a third operator and the editor's
 * `Record<ModifierOperator, string>` stops compiling, deliberately, while four
 * hand-written ternaries silently map it to `add`.
 *
 * `unknown` rather than the declared type, because two of the four callers hold a
 * definition straight out of a layout file where every member is still free.
 */
export function operatorOf(raw: { operator?: unknown }): ModifierOperator {
	return raw.operator === 'override' ? 'override' : 'add';
}

/**
 * One change the layout names, which a character's row may enrol in (SPEC §5).
 *
 * **It lives in the layout and never in a note.** A row that enrols in one holds
 * the name and nothing else, so editing a definition moves every character on the
 * layout at once — which is what the named tier is *for*, and every tool surveyed
 * recommends it for whatever repeats.
 *
 * **The other tier is `TypedEffect` below**, and the difference between the two is
 * exactly §7's edge: a definition has a name something else can spell, and a typed
 * effect has none. That is why the two are separate interfaces of the same shape
 * rather than one expressed in terms of the other.
 *
 * **The note holds no derived record of what a modifier did**, either. Everything
 * recomputes from the layout on every render, which is what makes every answer to
 * a layout edit "the cell keeps its text" rather than "the number is stuck at
 * what it was set to" — Sandbox System Builder's issue #15, which caches on the
 * actor what a shared definition did and cannot reverse it once the definition
 * moves.
 */
export interface ModifierDefinition {
	/**
	 * What a cell stores and what the form shows.
	 *
	 * Contains no `;` and reads as no assignment (SPEC §4.2): whatever
	 * separates two parts of a cell, a name containing it breaks, and whatever
	 * discriminates a typed part, a name matching it is read as one.
	 * `parse/modifier-definitions.ts` reports and drops both, through the two
	 * tests `parse/modifier-cell.ts` exports.
	 */
	name: string;
	/** The published name this changes. */
	target: string;
	/** Omitted for 'add', which is what a definition that says nothing is. */
	operator?: ModifierOperator;
	/** An expression, evaluated in the enrolling row's scope. */
	amount: string;
	/** One of the layout's `modifierTypes`. Absent is untyped. */
	bonusType?: string;
	/**
	 * Which phase this addition lands in. Omitted for `value`, which is what a
	 * definition that says nothing is, and what every definition written before
	 * the phase existed stays.
	 */
	applies?: ModifierPhase;
	/** An expression; absent means always. */
	when?: string;
}

/**
 * One effect typed on a row: a definition with no name and no home in the layout
 * (SPEC §2, and §13's two-tier entry).
 *
 * **Deliberately the same shape as `ModifierDefinition` minus its name, and
 * deliberately not `Omit<ModifierDefinition, 'name'>`.** The two are the same
 * shape for a reason that will not hold forever: a definition is a thing with a
 * name in a shared file and an effect is an anonymous fact in a note, and §7's
 * edge is precisely that being nameable is what separates them. Naming one in
 * terms of the other invites the next feature to give a typed effect a name in
 * place, which is the thing §7 forbids. Two interfaces, one comment each pointing
 * at the other, and `contract.test.ts` holds the field list once.
 *
 * **It is not a cache of anything**, which is §1's one absolute rule. A cache is a
 * second copy of a fact whose first copy can move underneath it; a typed effect
 * has no first copy, because nothing else holds it. That is also why promotion
 * *converts* the row it promoted (§8) rather than leaving the text behind.
 */
export interface TypedEffect {
	/** The published name this changes. */
	target: string;
	operator: ModifierOperator;
	/**
	 * An expression, evaluated on the row that typed it.
	 *
	 * **May be blank, which is an unfinished effect: it changes nothing and is not
	 * an error** (SPEC §4.2). That is what makes the form safe to commit one
	 * field at a time — the part exists the moment a target is chosen, and it must
	 * not blank a card while the reader is still typing.
	 */
	amount: string;
	/**
	 * One of the layout's `modifierTypes`. Absent is untyped.
	 *
	 * **The one thing stored in a note that names the layout's vocabulary**, which
	 * amends SPEC §5's "nothing stored ever names a type" from a construction
	 * guarantee to a rule: a type the layout no longer declares is rendered, not
	 * corrected — the effect applies and contests as its own kind.
	 */
	bonusType?: string;
	/**
	 * Which phase this addition lands in. Omitted for `value`, which is what an
	 * effect that says nothing is — so every cell written before the phase
	 * existed keeps meaning exactly what it meant.
	 */
	applies?: ModifierPhase;
	/** An expression; absent means always. */
	when?: string;
}

/**
 * A definition as a sheet shows one: the layout's own words, plus what to call
 * the value it changes.
 *
 * The label travels with the definition rather than being looked up per surface,
 * so the editor's list, the form's line and a breakdown all call the value the
 * same thing: "Armour class" where `armour_class` is the name. A typed effect has
 * no view of its own — the form and the sheet label its target through
 * `ModifierContext.published`, which is the same derivation.
 */
export interface ModifierDefinitionView extends ModifierDefinition {
	/** The publishing component's own label, or the bare name where none. */
	targetLabel: string;
}

/**
 * One part of one row's modifier cell (SPEC §5).
 *
 * **A push is one part, as raw text.** The row says what its cell says and hands
 * over its own scope; the formula layer decides whether that text is a name or an
 * assignment and resolves it. So the push holds no operator, no bonus type, no
 * amount column and no failure channel, and **`scopeModifiers` cannot know what a
 * definition is** — which is Sandbox System Builder's actor entry, the one shape
 * in the surveyed category that a shared definition is safe under.
 *
 * **That sentence is true of the push and no longer true of the component**, which
 * this wave has to say rather than leave standing. The form shows and writes a
 * target, an operator, an amount, a bonus type and a condition, so Table knows a
 * modifier has five slots. It still does not resolve one, does not know what a
 * bonus type means arithmetically, and does not know what an operator does: the
 * parse and the spelling are `parse/modifier-cell.ts`'s, the resolution is
 * `formula/`'s, the labels and the option lists are the context's. The honest
 * statement is that the component knows the *shape* of a modifier and none of its
 * meaning.
 *
 * What it publishes is unchanged: nothing. A modifier row publishes no name; a
 * slot is published by the sheet under `mod.<name>`; `<id>.<row name>` still
 * fails as an unknown name. **And a typed effect publishes nothing either**, which
 * is §7's edge read at the contract: it has no name, so there is no spelling by
 * which anything could reach it.
 */
export interface ModifierPush {
	/**
	 * One part of one modifier cell, as the cell spells it: a definition's name,
	 * or an assignment.
	 *
	 * **Raw text rather than a parsed part, deliberately.** That is what keeps
	 * `scopeModifiers` unable to know what a modifier *is*: Table splits a cell on
	 * `;` and pushes each part's own bytes, and nothing in the push says which tier
	 * it is.
	 */
	part: string;
	/**
	 * The component the row lives on, as its label reads.
	 *
	 * Set by the component, which is the only thing holding its own label at
	 * this point. It is here because a row's label is not enough to name a
	 * source: two modifier tables on one sheet, worn items and weapons, can each
	 * hold a row called "Ring", and a breakdown listing both gives the reader two
	 * lines they cannot tell apart. `modifierBreakdown` decides when to show it.
	 */
	source: string;
	/**
	 * The row: its reader-facing label and the names its expressions may read.
	 *
	 * `RowValues` whole rather than its two members spread, because the row is
	 * already a named thing in the contract and an enrolment is a row plus which
	 * definition it enrols in.
	 */
	row: RowValues;
}

/**
 * A component's enrolments, built with a resolver bound to the finished sheet.
 *
 * A factory for exactly `RowsSource`'s reason: a row may hold a computed column,
 * which is a formula that reads the rest of the sheet, and the sheet is the
 * thing being built.
 *
 * **The explainer went with the definition.** It was here because a slot refused
 * for an unreadable amount had to name the row *and the reason*, and a resolver
 * returning null could not. The amount is now evaluated in the formula layer,
 * which holds the reason in hand, so the failure channel and its explainer both
 * leave the component.
 */
export type ModifierSource = (resolve: FieldResolver) => readonly ModifierPush[];

/**
 * One contributor to a modified number, as a reader is shown it.
 *
 * A suppressed line is listed rather than dropped, and that is the whole reason
 * a breakdown beats a mark: a reader who bought two rings of protection and
 * watched the number not move will otherwise conclude the plugin is broken.
 */
export interface ModifierLine {
	/** The row as a reader sees it — `RowValues.label`'s rule, one layer out. */
	label: string;
	/** The component the row lives on, for wherever the row alone is ambiguous. */
	source: string;
	/**
	 * The modifier, as the layout spells its name, or absent where it has none.
	 *
	 * **Here because a row is not a contributor once a row can apply two.** While a
	 * cell held one name, an item's row was named after the modifier it applied and
	 * the two words were the same word — so a line naming the row named the change
	 * too, by coincidence. A cell holding a list breaks that: the Bracers of
	 * Defence reach armour class from a row called *Belt of Giant Strength*, and a
	 * line carrying only the row told a player a Strength item was giving them
	 * armour class.
	 *
	 * The layout's own spelling rather than the cell's, so this line, the form's
	 * line and the editor's list all say one thing — a stray never reaches a
	 * breakdown at all, so there is no case where the cell's text is the only
	 * spelling there is.
	 *
	 * **Optional, because a typed effect has no name and §7's edge says it never
	 * will.** The line then falls back to the row's own label, and **the outcome
	 * half is what tells two lines on one row apart** — a row applying a typed
	 * `item +2` and a typed `circumstance +1` reads as two lines with the same label
	 * and two different changes, which is exactly the question the reader is asking.
	 */
	definition?: string;
	/**
	 * Which phase this line belongs to, so a line can read "sets to 18" rather
	 * than "+18". A fact rather than text: the wording is assembled in
	 * `components/modifier-breakdown.ts`, which is where it already is.
	 */
	operator: ModifierOperator;
	/**
	 * The declared stacking type, or null where the modifier is untyped.
	 *
	 * Always null on an override, because overrides do not contest by type: the
	 * highest wins whatever either of them was called.
	 */
	type: string | null;
	amount: number;
	/**
	 * Which phase this addition landed in, so a breakdown can say so where it
	 * matters and stay quiet where it does not.
	 *
	 * Always `result` on an override, whose phase is fixed by construction (SPEC
	 * §5): it replaces the number the formula came to, which is where the result
	 * phase lands. The *line* does not say so — `change()` reads "sets to N" and
	 * never reaches this — but the field carries the phase rather than the wording,
	 * and it read `value` until a review put the two sentences side by side.
	 *
	 * **Optional, and absent means `value`** — the same default `TypedEffect` and
	 * `ModifierDefinition` already carry, for the same reason. `stackModifiers`
	 * always sets it; what the default buys is that a reader constructing a line
	 * to ask a question about something else need not state a phase to do it.
	 */
	applies?: ModifierPhase;
	/** Why this line contributes nothing, or null where it does. */
	suppressed: string | null;
}

/**
 * What applies at one name, and what it comes to.
 *
 * The total travels with the lines rather than being re-added by whoever draws
 * them. It is `roundSum`'s answer over the pushes, and a second addition of the
 * applied lines could only be held to it by a test asserting the two still agree
 * — which is what one number says for free (PATTERNS §1). The number on the
 * card, the last line of the breakdown and a formula reading the slot all come
 * from the same sum.
 */
export interface ModifierBreakdown {
	lines: readonly ModifierLine[];
	/**
	 * The winning override, or null where nothing overrode the value.
	 *
	 * The total line changes shape on this and on nothing else: with nothing
	 * overriding it is `Total +3`, and with an override it is the value —
	 * `Total 19` — because base-plus-total is no longer the arithmetic and a
	 * signed number there would invite the reader to add it to something.
	 */
	override: number | null;
	/** The value-phase total, which is what `mod.<name>` itself resolves to. */
	total: number;
	/**
	 * The result-phase total, added to what the target's formula came to.
	 *
	 * Separate from `total` because they are separately contested and land in
	 * different places: a formula reading `mod.self` gets the first, and only the
	 * evaluation that becomes the published name gets the second.
	 *
	 * **Optional, and absent means 0**, on `applies` above's rule: the phase is
	 * what a sheet gains here, and a breakdown built to ask about anything else
	 * does not acquire a second number to state.
	 */
	resultTotal?: number;
}

/**
 * One name a modifier may be pushed at, and what to show for it.
 *
 * The layout editor's **Changes** picker, now that a definition names its target
 * once instead of every row naming one. Foundry's own Active Effects article
 * tells users to press F12 and run a console script to enumerate attribute keys;
 * this is the answer to that, moved from the sheet to the one place a target is
 * chosen.
 */
export interface ModifierTarget {
	/** The published name, as a formula and a definition's target spell it. */
	name: string;
	/** What to show for it, which is the component's own label. */
	label: string;
}

/**
 * What one part of one row's modifier cell comes to, as the cell draws itself.
 *
 * Members rather than a discriminated union, because every consumer reads
 * `applies`, `amount`, `targetLabel` and `suppressed` regardless of tier — so a
 * union would make four common reads a narrow each. Keeping the rule in one
 * boolean is also what stops a component re-deriving it from the nullable members
 * and getting a different answer from the mark on the number.
 */
export interface ModifierOutcome {
	/**
	 * The definition this part names, or null where it names none or is typed.
	 *
	 * **`definition` and `typed` are both nullable and never both set**: a stray
	 * part has neither, a named part has the first, a typed part has the second.
	 */
	definition: ModifierDefinitionView | null;
	/** The effect this part spells out, or null where it names a definition. */
	typed: TypedEffect | null;
	/**
	 * What the reader is shown this modifier changes, and its label.
	 *
	 * Both are blank on a stray, where there is no target to name. The label is
	 * the component's own word for the value wherever the sheet publishes it, so a
	 * player reads `Passive perception` and never `passive_perception`.
	 */
	target: string;
	targetLabel: string;
	/**
	 * Whether this row is changing its target's value. The glyph reads this and
	 * nothing else.
	 */
	applies: boolean;
	/**
	 * What the amount comes to on this row, or null where it could not be worked
	 * out — an unknown definition, an unfinished typed effect, or an expression
	 * that will not resolve.
	 *
	 * Present on a row whose condition is false, deliberately: the form then says
	 * what the row *would* do, which is the question a reader looking at a stowed
	 * item is asking — and it is what a line in the form's `Modifier` select says
	 * about a definition the row does not apply at all.
	 */
	amount: number | null;
	/**
	 * Whether the condition holds on this row, or null where there is none.
	 * Carried rather than folded into `suppressed` because "not right now" and
	 * "not applied" are different facts and the form says them in different words.
	 */
	condition: boolean | null;
	/**
	 * Why it is not applying, where the reason is not the condition: a larger
	 * bonus of its type, a higher override, an amount that will not resolve.
	 * Null where it applies, and null where the condition is what stopped it.
	 */
	suppressed: string | null;
}

/**
 * What a component cannot work out about modifiers for itself (SPEC §5).
 *
 * On `LinkContext`'s terms: sheet-wide knowledge, absent where there is no
 * sheet, and a component draws what it can without it — a modifier cell with no
 * context offers only its stored value, which is the truth where there is no
 * layout to look a definition up in.
 *
 * **`targets`, `published` and `bonusTypes` are a wave-2 deletion undone.** They
 * were removed and the removal was argued as "the model change paying for itself
 * in deleted surface", on the grounds that a target had become layout data. A
 * target can be typed on a row again, so the sheet needs the accepting set to
 * offer, the published set for a label, and the bonus types for a select. That is
 * this wave's cost in added surface, named rather than performed quietly.
 */
export interface ModifierContext {
	/**
	 * Every definition this layout declares, in declaration order.
	 *
	 * What the form's **Modifier** select offers beside `Typed on this row`, and
	 * the same list for every table on the sheet: a definition is the layout's, so
	 * which ones a row may pick has nothing to do with which table it is on.
	 */
	definitions: readonly ModifierDefinitionView[];
	/**
	 * The values a modifier may be aimed at, for the form's **Changes** select.
	 *
	 * The accepting set — every published name whose own formula reads a modifier —
	 * derived once in `formula/modifier-targets.ts` and shared with the layout
	 * editor's own picker, so the sheet and the pane cannot offer different lists.
	 */
	targets: readonly ModifierTarget[];
	/**
	 * Every published name and its label, so a stored target outside the accepting
	 * set still has a word.
	 *
	 * A typed effect's target lives in a note, so the sheet is where that check
	 * happens — and a target the layout publishes but whose formula reads no
	 * modifier has a *label*, which is what keeps `passive_perception` out of a
	 * popover on a player's inventory row.
	 */
	published: readonly ModifierTarget[];
	/** The layout's bonus types, for the form's **Bonus type** select. */
	bonusTypes: readonly string[];
	/**
	 * What one part of one cell comes to on this row.
	 *
	 * Takes the part's raw text rather than a name, and the row rather than an
	 * index, so nothing about a row's position leaves the component (SPEC §4.2).
	 */
	outcome(part: string, row: RowValues): ModifierOutcome;
	/**
	 * What applies at this name, in declaration order, and what it comes to. No
	 * lines where nothing does, and none for a name that accepts no modifier — so
	 * a card can never draw a mark for a modifier that is not being applied.
	 */
	breakdown(name: string): ModifierBreakdown;
	/**
	 * Add one definition to the layout under `name`, then answer whether it landed
	 * (SPEC §7).
	 *
	 * **Additive only**: it appends, it refuses a name the layout already declares,
	 * it never edits a definition and never deletes one. That bound is the whole of
	 * why the first sheet-side layout edit in this plugin is safe under Constraint
	 * 4 — nothing that resolved a moment ago stops resolving.
	 *
	 * **Reported, not performed** (PATTERNS §5: the sheet view owns writing). The
	 * component hands over a name and an effect and awaits an answer; the view does
	 * the layout write *first* and tells the caller, and only then does the caller
	 * rewrite the cell. The reverse order would leave a cell naming a definition
	 * that does not exist.
	 *
	 * The one asynchronous member on this context, because a vault write is.
	 */
	promote(name: string, effect: TypedEffect): Promise<PromoteResult>;
}

/**
 * Whether a promotion landed, or why not.
 *
 * A value and never an exception (PATTERNS §4), because every failure here is one
 * a user can cause: a blank name, a name a cell could not spell, a name the layout
 * already declares, or a vault that refused the write. The form shows the message
 * in the shared `.sheetsmith-field-problems` clothes.
 */
export type PromoteResult = { ok: true } | { error: string };

/**
 * Why a formula field did not resolve, in words, or null where it did. The
 * component asks only about a field it has already seen fail, so the cost of
 * evaluating twice is paid on the error path alone.
 */
export type FieldExplainer = (
	field: string,
	scope: Readonly<Record<string, FieldValue>>,
	/** As `FieldResolver`'s: the name this evaluation publishes, for `mod.self`. */
	published?: string,
) => string | null;

/**
 * What `applyReset` is given beyond the binding itself (SPEC §6).
 *
 * The same resolve/explain pair `render` carries, and for the same reason: a
 * `FieldResolver` returns null both for a field that was never declared and
 * for one whose expression threw, so on its own it can only ever produce
 * some flavour of "could not resolve". Reset is where the difference pays off
 * most — the user has just pressed a button and watched nothing happen, and
 * "max: 'con' is not defined on this sheet" is the gap between a dead control
 * and a fixable one.
 */
export interface ResetContext {
	resolve: FieldResolver;
	explain: FieldExplainer;
}

/**
 * What a component needs from the app to make a note reference work.
 *
 * Drawing a link needs none of this — the markup and the classes come out of
 * parsing the text (`parse/wikilink.ts`), which is why a component can render one
 * without importing `obsidian` and a test can assert it under happy-dom.
 * Resolving a target, opening it and previewing it are the parts that are the
 * vault's business, and only the view has the vault.
 */
export interface LinkContext {
	/** Whether the target names a note that exists. Drives `is-unresolved`. */
	resolves(target: string): boolean;
	/** Follow the link. The event carries the modifier that opens a new tab. */
	open(target: string, event: MouseEvent): void;
	/** Offer Obsidian's hover preview for this anchor. */
	preview(target: string, anchor: HTMLElement, event: MouseEvent): void;
}

/** What render is given beyond the data itself. */
export interface RenderContext<TData = unknown> {
	resolved: ResolvedValues;
	/** Per-scope formula evaluation for components with internal structure. */
	resolveField: FieldResolver;
	/**
	 * Why a formula field failed. Optional, because a component can always
	 * fall back to saying only that it did — but "ability is not defined on
	 * this sheet" is the difference between a status and a next action.
	 */
	explainField?: FieldExplainer;
	/**
	 * Report edited data. The sheet view owns writing it back to the note;
	 * components never touch the file themselves.
	 */
	onChange: (data: TData) => void;
	/**
	 * Resolve, open and preview a note reference a cell holds.
	 *
	 * Optional, and the split is deliberate: a component paints its own anchors
	 * either way, so a unit test and the harness both show a real link. What is
	 * absent without this is the vault — an anchor paints as resolved and a click
	 * does nothing, which is the truth where there is no vault to navigate.
	 */
	link?: LinkContext;
	/**
	 * What has been pushed at the names this component publishes, and which names
	 * anywhere on the sheet accept a modifier (SPEC §5).
	 *
	 * Optional on exactly `link`'s terms: sheet-wide knowledge a component cannot
	 * reach for itself, absent where there is no sheet, and a component draws what
	 * it can without it. A target cell with no context offers only its stored
	 * value, which is the truth where nothing is published, and a number with no
	 * context carries no mark — which is also the truth, since nothing has been
	 * pushed at it.
	 */
	modifiers?: ModifierContext;
	/**
	 * Draw markdown into an element, using the app's own renderer.
	 *
	 * Optional on exactly `link`'s terms: without it a component draws what it
	 * can from the text alone, which is the truth where there is no app to ask.
	 * A Rich text block falls back to paragraphs with their wikilinks live, so a
	 * unit test and the harness both show real prose and real links, and what is
	 * absent without this is every other piece of markdown.
	 *
	 * It passes §4.1's rule for an optional member read one level out: the
	 * alternative is `obsidian` inside `src/components/`, which is the boundary
	 * the whole component layer rests on — `MarkdownRenderer` needs an `App`, a
	 * source path and a `Component` for the lifecycle of what it draws, and none
	 * of the three is a component's to hold.
	 *
	 * **Not offered to a table cell**, though the member is on the context and a
	 * cell could reach it. `parse/wikilink.ts`'s header holds the argument: block
	 * markup in a row whose height its neighbours already agreed is the case this
	 * is right for and that is wrong for. A Rich text block's height is its
	 * placement, so markup arriving a frame later cannot move anything.
	 *
	 * The caller owns the lifecycle, so a result landing after its render pass
	 * ended writes nothing (`view/markdown-pass.ts`).
	 *
	 * **`onFailure` fires where the app's renderer rejected**, and it is a required
	 * argument rather than an optional one because a renderer that can fail and a
	 * consumer that ignores it is the defect: the render is asynchronous, so a
	 * component has already returned by then and has no other route to hear about
	 * it. What a component should do with it is what it does without a renderer at
	 * all — draw what it can from the text alone — which is why this is a callback
	 * back into the component rather than an error the view writes into the box.
	 * There is no fix to name in such a message (PATTERNS §4), and the reader would
	 * rather have their prose than be told it exists somewhere else. Not called
	 * where the pass has already ended, since the element is detached by then.
	 */
	renderMarkdown?: (
		markdown: string,
		into: HTMLElement,
		onFailure: () => void,
	) => void;
	/**
	 * A URL an `<img>` can take for a file the vault holds, or null where the
	 * target names no file.
	 *
	 * The third member on `link`'s terms, and the smallest of them: two calls the
	 * app already offers, resolving a linkpath against this note and asking the
	 * vault for a resource URL. A component draws its own frame, its own label and
	 * its own field either way — what is absent without this is the picture, which
	 * is the truth where there is no vault to hold one.
	 *
	 * **Null means "no file", never "not an image".** Nothing here enumerates
	 * image extensions and nothing should: Fantasy Statblocks 455 is webp silently
	 * ceasing to render inside a plugin while the same syntax worked one line
	 * outside it, which is what a resolution path diverging from the app's own
	 * looks like. There is no list here to diverge from, the app answers whether
	 * the file exists, and the browser answers whether it can draw it — so a
	 * component reports what happened rather than predicting it.
	 */
	resource?: (target: string) => string | null;
	/**
	 * Draw this component's `children` into an element of its own choosing
	 * (SPEC §4.2).
	 *
	 * The view owns the recursion, the inner grid and the cells on it, because
	 * those are the same grid rules the sheet already has one level up. What a
	 * container owns is *where* the region sits inside its own chrome, which is
	 * the one thing the view cannot know: a heading above it, a tab strip above
	 * it, or nothing at all.
	 *
	 * Absent where the layout gave this component no children, so an empty
	 * container can draw its heading over a quiet empty region rather than over
	 * an empty grid.
	 */
	renderChildren?: (into: HTMLElement) => void;
	/**
	 * Each child on its own, in the order the layout wrote them, for a container
	 * that shows one at a time rather than all of them together.
	 *
	 * The sibling of `renderChildren`, and a container uses exactly one of the
	 * two: that one says "put all of my children on a grid inside this element",
	 * which is the only thing a region wants, and this says "draw my *n*th child
	 * inside this element, filling it", which is the only thing a tab strip can
	 * use. One callback answering both would need a second argument changing what
	 * the first means, which is the shape §4.1 already refuses for `display`
	 * against `compute`.
	 *
	 * **File order, not grid order**, because a child drawn this way has no
	 * placement — it fills the element it is given — so there is no grid order to
	 * read and §8's rule stops at this boundary. That is also why the index is
	 * enough to line these up with `config.children`, which is where a container
	 * reads the name to show for each one.
	 *
	 * Absent on the same terms as `renderChildren`: a layout that gave this
	 * component no children.
	 */
	childRegions?: readonly ((into: HTMLElement) => void)[];
	/**
	 * True where the container holding this component is already showing its
	 * name, so drawing it again would say it twice.
	 *
	 * Set for a child reached through `childRegions`: a tab set's strip is drawn
	 * from its children's own labels, so the tab and the region under it carry one
	 * name between them. **A component that draws its own label must honour
	 * this**, and Group is the only one that can be reached this way today.
	 *
	 * The twin of the placement rule, and the same sentence read for chrome rather
	 * than geometry: a child a container shows one at a time has no placement of
	 * its own *and* no heading of its own, because the container supplies both.
	 *
	 * A context flag rather than the author's `hideLabel`, because there is no
	 * configuration in which the duplicate is wanted — and a setting with one
	 * correct value in a context should be supplied by the code rather than
	 * remembered by the author. Both fixtures had it written by hand, which is
	 * exactly why nobody noticed the component was not doing it: the editor's add
	 * row wrote no such flag, so a Group added into a tab set through the settings
	 * tab named itself twice.
	 *
	 * Nothing is lost for assistive tech: the panel carries `aria-labelledby`
	 * pointing at its tab, so the region is still named where a visible heading is
	 * gone.
	 */
	parentShowsLabel?: boolean;
	/**
	 * Which of this component's alternatives the reader has open, and undefined
	 * where they have not chosen.
	 *
	 * Held by the view rather than by the component, because the sheet re-renders
	 * on every committed edit: state in the component's own closure would snap
	 * back to the first alternative the moment a pool inside it was edited. Held
	 * by the view rather than by the note, because it is this reader's posture and
	 * not the character's data — Obsidian keeps its own folds out of markdown for
	 * the same reason, and a container that stored anything would stop being a
	 * container (SPEC §13).
	 *
	 * An index rather than a child's id, because it is the layout's own order that
	 * the strip draws; a component clamps it, since a layout that lost a tab
	 * leaves a reader pointing past the end.
	 *
	 * Named for what it is rather than as a general slot of view state: one
	 * consumer earns no generalisation (PATTERNS §1), which is what made the
	 * collapse's equivalent pair cheap to delete when the collapse went.
	 */
	activeTab?: number;
	/** Report the reader opening one of this component's alternatives. */
	onActivateTab?: (index: number) => void;
}

/**
 * The five things a component implements, and the only surface the rest of
 * the system sees.
 *
 * Beyond the five, a member is optional only where the alternative is code
 * outside the component knowing that component's data shape (SPEC §4.1). The
 * rule is the point, not the count: `scopeValues` passes it because the name
 * table cannot publish a value it has no way to read, and `applyReset`
 * because a reset button cannot write "restore to full" into a shape it does
 * not know. Most candidates will not pass it.
 */
export interface ComponentDefinition<
	TConfig extends ComponentConfig = ComponentConfig,
	TData = unknown,
> {
	type: string;
	storage: StorageKind;
	/**
	 * True where this container shows one child at a time rather than all of
	 * them together, so **a child of it has no placement**: it fills the region
	 * the container gives it, and the container's own `width × height` is the box
	 * (SPEC §4.2).
	 *
	 * Declared rather than inferred, for exactly the reason `hasBuffer` is: the
	 * alternative is the layout editor knowing that a Tab set shows one tab and a
	 * Group shows every child. It is the one thing the editor cannot work out —
	 * both containers hold `children`, both take the same context, and which of
	 * `renderChildren` and `childRegions` a component reaches for is not
	 * something anything outside it can see.
	 *
	 * What it decides is all editor-side, and all of it is wrong without it: a
	 * grid schematic of children that all sit at the same position draws them
	 * stacked on one another and reports every one as overlapping every other,
	 * the four position fields on a tab's form edit numbers nothing reads, and
	 * there is no way left to reorder the tabs. So the editor offers an ordered
	 * list instead, and drops the position fields for a child of one.
	 *
	 * Absent is the common case — a container that places its children, which is
	 * what a region is — and only the exception declares it. Meaningless on a
	 * component that holds no children at all, and `contract.test.ts` refuses it
	 * there rather than leaving it as a flag with no reading.
	 */
	showsOneChild?: boolean;
	/**
	 * What a section of this component would hold, for a config it was handed:
	 * the plausible filler the layout editor's canvas draws in place of an empty
	 * character's blank (`docs/features/preview-sample-values.md`).
	 *
	 * **A body, not data**, and that is the decision this member exists to record.
	 * The alternative — returning `TData` — is compiler-checked and reaches
	 * `render` one step sooner, and it skips the one call that makes a sample
	 * *true*: a body goes through this component's own `read`, so what the preview
	 * draws is exactly what a note holding that text would draw, and a sample that
	 * could not be stored in a note fails loudly instead of drawing a state no
	 * character can be in. It also buys two checks a data-shaped member could not
	 * have — `read(sample(config))` is `ok`, and `write` of what that read produced
	 * returns the sample byte for byte, which is Constraint 3 asserted over one
	 * more body per component.
	 *
	 * Declared directly before `read` because it is the body `read` is handed: the
	 * data path's own first step, in the one context where there is no note.
	 *
	 * **Optional under §4.1's rule**, and it passes squarely — the alternative is
	 * code outside Pool knowing that a Pool's section is a `sheet` fence holding
	 * `current`, `max` and `temp`; that a Card's is one key the author named; that
	 * a Table's is a markdown table whose header is the author's own column keys,
	 * that a `modifier` cell enrols a row in a definition, and that a declared row
	 * is not a row the sample may add. That is the entirety of seven components'
	 * data shapes.
	 *
	 * **Optional rather than required wherever `storage` is not `none`**, and
	 * Image is why: it draws an empty frame whenever `RenderContext.resource` is
	 * absent, and the canvas has no vault to give it one, so an Image sample would
	 * be a body nothing could ever paint. A member every component must implement
	 * and one component can only implement uselessly is a member with a lie in it.
	 * Absent means what it already means everywhere else here — this component has
	 * nothing to say — and a container declaring one is refused by
	 * `contract.test.ts`, since a member with no reading is worse than none.
	 *
	 * The filler vocabulary is `components/sample-values.ts`, shared so the canvas
	 * reads as one system rather than as six authors' idea of a placeholder. A
	 * config that names nothing to fill returns the empty body, which is exactly
	 * what the canvas drew before this existed.
	 */
	sample?(config: TConfig): string;
	/** Parse this component's section body into data. */
	read(body: string, config: TConfig): ReadResult<TData>;
	/**
	 * Serialise data into a section body. `body` is the current body, or null
	 * when the section does not exist yet. Must return `body` byte for byte
	 * when the data is unchanged.
	 */
	write(data: TData, body: string | null, config: TConfig): string;
	/**
	 * Display the component. `data` is null when the section is missing or
	 * failed to read.
	 *
	 * The context carries what a component cannot reach for itself: the field
	 * resolver, the change callback, and — for a component whose text may hold a
	 * note reference — the vault side of a link.
	 */
	render(
		container: HTMLElement,
		config: TConfig,
		data: TData | null,
		context: RenderContext<TData>,
	): void;
	/**
	 * Values this component publishes to formulas elsewhere on the sheet.
	 * Optional: a component holding nothing referencable — a heading, an
	 * image, a block of prose — simply leaves it off, and the rest of the
	 * system never learns it exists.
	 */
	scopeValues?(data: TData | null, config: TConfig): ScopeValues;
	/**
	 * The rows an aggregate walks, where this component holds any (SPEC §5).
	 *
	 * Named for its sibling: `scopeValues` publishes this component's *names*,
	 * and this publishes the rows that have none. Optional under §4.1's rule,
	 * and it passes squarely — the alternative is the formula engine knowing
	 * that a Table has columns and rows, that a cell is text mapping to a
	 * number by column type, that a blank number cell is zero, that declared
	 * rows come first and the character's follow in note order, and that a row
	 * carries named expressions layered over its cells. That is the entirety of
	 * one component's data shape, and nothing else could build it.
	 *
	 * Returns undefined where there is nothing to walk, which is how a
	 * misconfigured card declines: an aggregate over it fails rather than
	 * summing rows the card is refusing to show.
	 */
	scopeRows?(data: TData | null, config: TConfig): RowsSource | undefined;
	/**
	 * The changes this component declares against names that are not its own
	 * (SPEC §5), where it declares any.
	 *
	 * The third reading of one job, which is why it sits here: `scopeValues`
	 * publishes this component's names, `scopeRows` the rows that have none, and
	 * this the changes it pushes at names belonging to somebody else.
	 *
	 * Optional under §4.1's rule, and it passes squarely — the alternative is the
	 * formula engine knowing that a Table has a modifier column, that a blank
	 * cell enrols in nothing, that a row may hold several such cells, and that a
	 * row's names are its stored cells layered under its declared values layered
	 * under its computed columns. `scopeRows` cannot be reused for it either:
	 * `RowValues` carries cells by column key with no way to say which of them
	 * names a definition.
	 *
	 * Returns undefined where there is nothing to push, which is how a
	 * misconfigured card declines: a slot must not be filled from a configuration
	 * the card is refusing to draw.
	 */
	scopeModifiers?(
		data: TData | null,
		config: TConfig,
	): ModifierSource | undefined;
	/**
	 * Apply a reset trigger to this component's data (SPEC §6).
	 *
	 * Takes the binding rather than a finished value, because only the
	 * component knows what `full` means for it — a Pool's max, a Track's
	 * count, a Toggle's true — and a caller that knew would be holding the
	 * per-type knowledge the contract exists to keep out of it.
	 *
	 * The context reads any of this component's formula fields, not just
	 * `reset.to`: `full` on a Pool means resolving its `max`, which is a
	 * formula like any other and can fail like one. Returning `{ ok: false }`
	 * with the reason is how a component says so, and the sheet reports that
	 * one while the rest of the trigger still applies (SPEC §6).
	 *
	 * Implementing it is what declares the component stateful: the editor
	 * offers a reset binding only to components that have it, and a trigger
	 * passes over the ones that do not.
	 */
	applyReset?(
		data: TData | null,
		config: TConfig,
		reset: ResetBinding,
		context: ResetContext,
	): ResetResult<TData>;
	/**
	 * True where this component holds a secondary buffer a trigger may clear
	 * on its own, independently of the component's main value.
	 *
	 * Declared rather than inferred, because the alternative is the layout
	 * editor knowing that a Pool has temporary points and a Track does not —
	 * which is the rule in §4.1 that decides what may be an optional member at
	 * all. The editor offers `reset.buffer` exactly where this is set.
	 */
	hasBuffer?: boolean;
	/**
	 * Which config fields accept an expression rather than a literal.
	 *
	 * An entry is normally a config key ('derived'), but it may be a dotted
	 * path into the config with `*` standing for one segment
	 * ('columns.*.formula'). That is what a component with repeating
	 * structure needs: a Table's expressions live one per column and one
	 * per row, so no fixed list could name them all.
	 */
	formulaFields: readonly string[];
	/**
	 * The component-specific config fields the layout editor shows. Shared
	 * fields (label, position) are handled by the editor itself.
	 */
	configFields: readonly ConfigFieldSpec[];
	/**
	 * Ways the layout editor may offer this component with its configuration
	 * already filled in (SPEC §4.2, §13).
	 *
	 * Optional under §4.1's rule, and §13 settled which side of it this falls:
	 * the alternative is a table in `src/editor/` holding Table's column shape
	 * and Track's count, which is code outside a component knowing what that
	 * component is. A component with nothing worth prefilling leaves it off and
	 * appears in the palette as its bare type, which is what every component did
	 * before this existed.
	 */
	palette?: readonly PaletteEntry<TConfig>[];
	/**
	 * What to call one configuration of this component, where the type's own
	 * name is not the honest answer. `null` means it is.
	 *
	 * The editor shows it wherever it would otherwise show the type, so an
	 * author who chose **Dropdown** from the add menu is not told a line later
	 * that they have a Card. It is derived from the config every time rather
	 * than stored: a layout keeps the component a palette entry produced and
	 * never the entry itself (SPEC §13), so the only honest source for the name
	 * is what the configuration now says — an author who deletes a card's last
	 * option has a Card again, and should be told so.
	 *
	 * Optional under §4.1's rule, and here for the reason `palette` is: the
	 * alternative is the editor asking whether a config has options, which is
	 * code outside a component knowing what that component is.
	 */
	configName?(config: TConfig): string | null;
}

/**
 * Whether this component holds other components rather than a value (SPEC §4.2).
 *
 * One function rather than four comparisons against a string. Where the shared
 * thing is a policy rather than a behaviour it climbs §1's ladder in one step: a
 * guard test over the call sites could only assert that they all still spell
 * `'none'`, which is what one predicate says for free. The four are not
 * interchangeable either — the sheet view and the harness use it to decide
 * whether a section is read at all, and those two disagreeing is invisible in
 * review, because appearance is reviewed in the harness.
 *
 * The equivalence is SPEC §4.1's, in words: "`none` is a container." So it is a
 * consequence of the storage kind rather than a declaration of its own, and a
 * storage-less component that was *not* a container would move the marker —
 * which is the whole reason it is written down once. `contract.test.ts` names
 * the roster, so a second container is a deliberate edit rather than a drift.
 *
 * Takes the definition or nothing, because every caller has just asked the
 * registry for it and a layout may name a type that is not there. An unknown
 * type is not a container: there is no component to say where its region goes.
 *
 * A plain boolean rather than a `component is ComponentDefinition` predicate,
 * which was tried and is wrong: it narrows the *false* branch by excluding the
 * whole type, so the two callers that keep the component when it is not a
 * container were left holding `never`. A non-container is still a component.
 */
export function isContainer(
	component: ComponentDefinition | undefined,
): boolean {
	return component?.storage === 'none';
}

/**
 * Whether this component gives each of its children a placement of its own,
 * rather than showing one at a time in a region they all fill.
 *
 * The complement of `showsOneChild`, named once rather than negated at each
 * site. It was spelled four times before this, in two complementary pairs —
 * `=== true` where a caller wanted the alternatives case and `!== true` where it
 * wanted the placed one — and §1's policy tier is the argument: a guard test
 * over them could only assert they still spell the same thing, which is what one
 * predicate says for free. Two of the four were far enough apart that a rule
 * growing a second clause would have been added to one and missed on the other,
 * leaving a form that edits numbers nothing reads or an add row that writes a
 * placement the form then hides.
 *
 * True for a leaf, which holds no children to place. Harmless rather than
 * meaningful: every caller has already established it is looking at a container,
 * and answering "yes, placed" for a component with nothing to place is the same
 * answer as for the sheet itself.
 */
/**
 * Whether a component should draw its own visible label.
 *
 * Two reasons not to, and a component that checked only the first drew its name
 * twice: the layout asked for no label, or the container above it has already
 * shown one. The second is `parentShowsLabel` — a tab strip is built from its
 * children's labels, so the tab and the region under it carry one name between
 * them.
 *
 * **One predicate because five components had to remember this and one bug is one
 * of them forgetting.** Group honoured `parentShowsLabel` and Card, Card set,
 * Pool, Track and Table did not, so a Table tab drew its heading under a strip
 * that had just named it — in a different type treatment, which reads as an
 * accident rather than a repeat. Enumerating the obligation in five files is how
 * the sixth misses it, and `contract.test.ts` now holds every component that
 * draws a label to asking this.
 *
 * **Only the visible label.** An `aria-label`, a `title` and a status message are
 * not this: they name a control for someone who cannot see the strip, so they
 * stay in every case. `card-face.ts` has said so about its own `hideTitle` since
 * before there were containers.
 */
export function showsOwnLabel(
	// Intersected rather than the bare optional: `{ hideLabel?: boolean }` is a
	// weak type, so TypeScript refuses a config that has no such key at all —
	// which is Pool, the one component here that never had the setting.
	config: ComponentConfig & { hideLabel?: boolean },
	context: { parentShowsLabel?: boolean },
): boolean {
	return config.hideLabel !== true && context.parentShowsLabel !== true;
}

export function placesChildren(
	component: ComponentDefinition | undefined,
): boolean {
	return component?.showsOneChild !== true;
}
