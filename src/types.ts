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

/** How a component stores its section. Fixed by type, never a user choice. */
export type StorageKind = 'fenced' | 'markdown';

/** Grid placement of a component within a layout. */
export interface GridPosition {
	col: number;
	row: number;
	width: number;
	height: number;
}

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
	 * renders as a table of their own — 'attributes' of { key, name? },
	 * 'track-rows' of { key, name?, count?, sense? }, 'rows' of { label, values? },
	 * and 'columns' of typed column definitions.
	 */
	kind:
		| 'text'
		| 'number'
		| 'boolean'
		| 'formula'
		| 'select'
		| 'text-list'
		| 'attributes'
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
	 * alignment only when sizing is fixed, options only when input is a
	 * select.
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
			 * scope to run it in (one attribute's own `value`, later a table row).
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
} & ScopeEntrySource;

/**
 * What a component publishes to formulas elsewhere on the sheet (SPEC §5).
 *
 * `self` is referenced by the bare component id — an armour class is just
 * `armour_class`. `named` entries are referenced as `<id>.<name>`, which is
 * how a group of attributes exposes each one: `abilities.DEX`.
 */
export interface ScopeValues {
	self?: ScopeEntry;
	named?: Readonly<Record<string, ScopeEntry>>;
}

/**
 * Evaluates one of the component's formula fields against extra names, such
 * as a table row or one ability's value. Returns null when the field has no
 * expression or it cannot be evaluated.
 */
export type FieldResolver = (
	field: string,
	scope: Readonly<Record<string, FieldValue>>,
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
 * Why a formula field did not resolve, in words, or null where it did. The
 * component asks only about a field it has already seen fail, so the cost of
 * evaluating twice is paid on the error path alone.
 */
export type FieldExplainer = (
	field: string,
	scope: Readonly<Record<string, FieldValue>>,
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
}
