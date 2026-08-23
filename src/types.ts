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
 * of them forgetting.** Group honoured `parentShowsLabel` and Stat, Stat group,
 * Pool, Track and Table did not, so a Table tab drew its heading under a strip
 * that had just named it — in a different type treatment, which reads as an
 * accident rather than a repeat. Enumerating the obligation in five files is how
 * the sixth misses it, and `contract.test.ts` now holds every component that
 * draws a label to asking this.
 *
 * **Only the visible label.** An `aria-label`, a `title` and a status message are
 * not this: they name a control for someone who cannot see the strip, so they
 * stay in every case. `stat-card.ts` has said so about its own `hideTitle` since
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
