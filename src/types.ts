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
	 * What resetting means here. The states are named rather than numbered
	 * because the same three cover a Toggle, where full and empty are true
	 * and false, as readily as a Pool, where they are its max and zero.
	 */
	action: 'full' | 'empty' | 'formula';
	/**
	 * The expression, for `action: 'formula'` and nothing else. It is a
	 * formula field like any other, declared as `reset.to`, which is why the
	 * action is a separate key: one string cannot be both an expression the
	 * evaluator reads and a literal word standing in for one.
	 */
	to?: string;
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
	reset?: ResetBinding;
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
	 * Input kind. 'formula' is a text field holding an expression; the last
	 * three are ordered lists the editor renders as a table of their own —
	 * 'attributes' of { key, name? }, 'rows' of { label, values? }, and
	 * 'columns' of typed column definitions.
	 */
	kind:
		| 'text'
		| 'number'
		| 'boolean'
		| 'formula'
		| 'select'
		| 'attributes'
		| 'rows'
		| 'columns';
	/** Help text shown under the field. */
	description?: string;
	/**
	 * Optional grouping label; consecutive fields sharing one render under
	 * a subheading in the layout editor.
	 */
	group?: string;
	/**
	 * Show this field only while another config key holds a value, e.g.
	 * alignment only when sizing is fixed, options only when input is a
	 * select.
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
 * One name a component publishes to the rest of the sheet.
 *
 * A bare reference gets what the card shows: the `display` formula's result
 * when there is one, and the stored value otherwise. `<name>.value` always
 * gets the stored value, for the formula that wants the raw score rather
 * than the modifier the card puts in large type.
 */
export interface ScopeEntry {
	/** What the note stores. Referenced as `<name>.value`. */
	value?: FieldValue;
	/**
	 * The formula field producing the displayed value, and the internal
	 * scope to run it in (one attribute's own `value`, later a table row).
	 * Evaluated lazily, because it may reference other components.
	 */
	display?: {
		field: string;
		scope: Readonly<Record<string, FieldValue>>;
	};
}

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
	 * Which config fields accept an expression rather than a literal.
	 *
	 * An entry is normally a config key ('derived'), but it may be a dotted
	 * path into the config with `*` standing for one segment
	 * ('columns.*.formula'). That is what a component with repeating
	 * structure needs: a Skill card's expressions live one per column and one
	 * per row, so no fixed list could name them all.
	 */
	formulaFields: readonly string[];
	/**
	 * The component-specific config fields the layout editor shows. Shared
	 * fields (label, position) are handled by the editor itself.
	 */
	configFields: readonly ConfigFieldSpec[];
}
