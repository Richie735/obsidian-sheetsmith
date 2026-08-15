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
	/** What to reset to: 'max', 'zero', or a formula expression. */
	to: string;
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
	 * Input kind. 'formula' is a text field holding an expression;
	 * 'attributes' is an ordered list of { key, name? } entries.
	 */
	kind: 'text' | 'number' | 'boolean' | 'formula' | 'select' | 'attributes';
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
 * Evaluates one of the component's formula fields against extra names, such
 * as a table row or one ability's value. Returns null when the field has no
 * expression or it cannot be evaluated.
 */
export type FieldResolver = (
	field: string,
	scope: Readonly<Record<string, FieldValue>>,
) => FieldValue | null;

/** What render is given beyond the data itself. */
export interface RenderContext<TData = unknown> {
	resolved: ResolvedValues;
	/** Per-scope formula evaluation for components with internal structure. */
	resolveField: FieldResolver;
	/**
	 * Report edited data. The sheet view owns writing it back to the note;
	 * components never touch the file themselves.
	 */
	onChange: (data: TData) => void;
}

/**
 * The four things a component implements, and the only surface the rest of
 * the system sees.
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
	/** Which config fields accept an expression rather than a literal. */
	formulaFields: readonly string[];
	/**
	 * The component-specific config fields the layout editor shows. Shared
	 * fields (label, position) are handled by the editor itself.
	 */
	configFields: readonly ConfigFieldSpec[];
}
