import {
	App,
	getLinkpath,
	HoverPopover,
	Keymap,
	Notice,
	TextFileView,
	type ViewState,
	WorkspaceLeaf,
} from 'obsidian';
import { getComponent } from '../components';
import { closePopover } from '../ui/popover';
import {
	closeAnchoredPanel,
	dropDetachedAnchoredPanel,
} from '../ui/anchored-panel';
import { ConfirmModal } from '../ui/confirm-modal';
import {
	appendModifierDefinition,
	hasLayouts,
	loadLayout,
} from '../layouts';
import { pickLayout } from '../layout-picker';
import type SheetsmithPlugin from '../main';
import {
	applySectionWrites,
	CharacterNote,
	CharacterParseError,
	getSection,
	parseCharacter,
	serialiseCharacter,
	withLayoutName,
} from '../parse/character';
import {
	applyPromotedFields,
	parsePromotedFields,
	PromotedFieldRefusal,
} from '../parse/promoted-fields';
import { modifierTargetSource } from '../formula/modifier-targets';
import {
	FormulaEnv,
	makeFieldExplainer,
	makeFieldResolver,
	publishedFieldNames,
	resolveFormulaFields,
} from '../formula/resolve';
import { parseFunctions } from '../formula/functions';
import { buildSheet } from '../formula/sheet';
import { DEFAULT_COLUMNS, Layout } from '../parse/layout';
import { walkComponents } from '../parse/layout-walk';
import { parseTriggers } from '../parse/triggers';
import {
	ComponentConfig,
	ComponentDefinition,
	isContainer,
	LinkContext,
	PromoteResult,
	TypedEffect,
} from '../types';
import { captureFocus, restoreFocus } from './cell-focus';
import { attachFileSuggest, FileSuggest } from './file-suggest';
import { renderGrid } from './grid-cells';
import { MarkdownPasses } from './markdown-pass';
import { renderMissingLayout } from './missing-layout';

export const VIEW_TYPE_SHEET = 'sheetsmith-sheet';

/**
 * What a leaf is asked for in order to show `path` as a sheet.
 *
 * Three callers now — auto-open, **Open as sheet**, and a character just
 * created — which is `docs/PATTERNS.md` §1's third-consumer rung. What makes it
 * worth a name rather than three object literals is that **the compiler cannot
 * check the half that matters**: `ViewState.state` is a
 * `Record<string, unknown>`, so `{ path }` or `{ filePath }` in place of
 * `{ file }` type-checks perfectly and opens a sheet view with no file in it.
 * One spelling, in the module that owns the view type it names.
 *
 * The **Open as Markdown** command builds the same shape with `type:
 * 'markdown'` and is deliberately not folded in: that is the app's own view
 * type rather than this plugin's, it has one call site, and a helper taking the
 * type as an argument would no longer be able to say "sheet" in its name.
 */
export function sheetViewState(path: string): ViewState {
	return { type: VIEW_TYPE_SHEET, state: { file: path } };
}

/**
 * The sheets currently on screen, in every leaf of this view type.
 *
 * One `getLeavesOfType` and one `instanceof`, named because two modules walk
 * them now: the layout editor pane after it writes a layout, and
 * `layout-file-events.ts` after a layout file is created, renamed or deleted
 * anywhere. **The `instanceof` is the load-bearing half** — a leaf of this type
 * can hold a deferred view, which is not a `SheetView` and has none of its
 * methods — and a copy that dropped it would throw on the first restored
 * workspace.
 */
export function openSheetViews(app: App): SheetView[] {
	const sheets: SheetView[] = [];
	for (const leaf of app.workspace.getLeavesOfType(VIEW_TYPE_SHEET)) {
		if (leaf.view instanceof SheetView) sheets.push(leaf.view);
	}
	return sheets;
}

/**
 * How long the undo stays offered after a trigger. Long enough to notice a
 * rest was the wrong one, short enough that it is not still sitting there
 * when the note has moved on.
 */
const UNDO_TIMEOUT = 12000;

/**
 * A warning naming the components it affected, one per line.
 *
 * A list rather than a sentence. These messages are read to be counted and
 * checked against the sheet — which pools did not reset, which sections did
 * not save — and several names run together with semicolons is a sentence to
 * parse before the question can be answered. One per line also survives a
 * long reason on each: a failure carries the formula's own explanation, and
 * two of those in one paragraph is unreadable.
 */
function warn(heading: string, items: readonly string[]): void {
	new Notice(
		createFragment((fragment) => {
			fragment.appendText(heading);
			fragment.createEl('ul', { cls: 'sheetsmith-affected' }, (list) => {
				for (const item of items) list.createEl('li', { text: item });
			});
		}),
	);
}

/**
 * What the sheet says about a promoted property it could not write (SPEC §9).
 *
 * **The only thing the sheet ever says about a promoted field**, and it goes
 * through the channel this view already has for a write that did not land — the
 * `Notice` `applyEdits` fires when a section could not be saved. `docs/UI.md`
 * §10 wants failure in place and there is no place: a promoted property belongs
 * to the layout rather than to a component, so no card is the right one to draw
 * it on, and every card renders exactly as it would have.
 *
 * Outside the class because it reads no view state, which is what lets it be
 * driven directly — the same reason `resetSummary` above is a function.
 */
export function promotedFieldMessage(refusal: PromotedFieldRefusal): string {
	return refusal.property === undefined
		? `Sheetsmith could not write this note's promoted properties: ${refusal.reason}`
		: `Sheetsmith could not write the property "${refusal.property}": ${refusal.reason}`;
}

/** A component read for this render, with whatever its section gave up. */
interface PreparedComponent {
	config: ComponentConfig;
	component: ComponentDefinition | undefined;
	error: string | null;
	data: unknown;
}

/**
 * What a trigger will touch on one component, for the confirmation.
 *
 * The component's label alone over-claims now that a binding can name a column:
 * a reader pressing **Long rest** was told "It resets: Spell list" and watched
 * one of three columns change, on a component whose other columns the feature
 * guarantees are left byte-identical. This is the one surface whose whole job is
 * to say what a press will touch, so it is the one place the difference has to
 * appear — the sheet itself draws no mark, because a binding is a fact about the
 * layout rather than a state of the data.
 *
 * **It teaches this file nothing about columns.** `binding.column` is shared
 * config the view already reads, and the label comes back from the component's
 * own `resetColumns`, so what is joined here is a string the component named. A
 * component that names no part of itself is unchanged, which is Pool, Track and
 * Record set.
 *
 * Outside the class because it reads no view state, which is the whole of why it
 * is here rather than beside its one caller: `SheetView` cannot be constructed
 * without a workspace, so a method could not be driven at all, and a function
 * over the two fields it actually reads can be.
 */
export function resetSummary(
	name: string,
	entry: { config: ComponentConfig; component: ComponentDefinition | undefined },
): string {
	const named = (entry.config.reset ?? [])
		.filter((binding) => binding.trigger === name)
		.map((binding) => binding.column)
		.filter((column): column is string => column !== undefined);
	if (named.length === 0) return entry.config.label;
	const offered = entry.component?.resetColumns?.(entry.config) ?? [];
	const shown = named.map(
		(key) => offered.find((column) => column.key === key)?.label ?? key,
	);
	return `${entry.config.label} — ${shown.join(', ')}`;
}

/**
 * Sheet view. Renders a character note against its layout, and writes
 * component edits back into the note body. All writes go through the parse
 * layer, so untouched sections stay byte-identical.
 */
export class SheetView extends TextFileView {
	private plugin: SheetsmithPlugin;
	/** Generation counter; a render that awaits and comes back stale bails. */
	private renderId = 0;
	/**
	 * Whether this view holds an edit the file does not.
	 *
	 * The plugin's own answer to a question `TextFileView` does not expose:
	 * `requestSave` is a bare debouncer with no `isPending`, so the only party
	 * that can know an edit is outstanding is the one that made it. Raised by
	 * `commit`, which is the single `requestSave` call site, and lowered
	 * wherever `data` stops being the reader's — a completed `save`, either
	 * door into `setViewData`, and `clear`.
	 */
	private pendingSave = false;
	/**
	 * Where a hover preview opened from one of this sheet's links lives.
	 *
	 * Declared because the view hands itself to `hover-link` as the popover's
	 * parent, and a parent is the thing that owns one: only `MarkdownView`
	 * declares this, so a `TextFileView` passing itself was promising an
	 * interface it did not implement and Page preview was assigning onto an
	 * object with no place for it.
	 */
	hoverPopover: HoverPopover | null = null;
	/**
	 * Which alternative the reader has opened in each container, by component id.
	 *
	 * Held here rather than in the note, because it is this reader's posture and
	 * not the character's data — a plugin writing its own UI state into a file the
	 * user hand-edits would break the promise the whole plugin rests on, and
	 * Obsidian keeps its own folds out of markdown for the same reason. Held here
	 * rather than in the component, because the sheet re-renders on every
	 * committed edit: a tab set taking its state from its own closure would snap
	 * back to the first tab the moment a pool inside it was edited. The precedent
	 * is `cell-focus.ts`, which carries structural state across exactly this
	 * rebuild.
	 *
	 * Dropped when the leaf moves to another file, so a reopened note starts from
	 * the first tab rather than inheriting the last note's.
	 */
	private activeTab = new Map<string, number>();
	/**
	 * Which records the reader has open in each list, by component id.
	 *
	 * The sibling of `activeTab` above and held here for exactly its reasons: not
	 * in the component, because the sheet re-renders on every committed edit, and
	 * not in the note, because it is this reader's posture and not the character's
	 * data. A `Set` rather than an index, because several records may be open at
	 * once (`types.ts`, `openRecords`).
	 *
	 * Dropped when the leaf moves to another file, so a reopened note starts with
	 * everything closed rather than inheriting the last note's.
	 */
	private openRecords = new Map<string, Set<number>>();
	/**
	 * The lifecycle of markdown a component asked the app to draw.
	 *
	 * Here rather than in the component that wants it, because
	 * `MarkdownRenderer.render` needs an `App` and a parent `Component` and a
	 * component has neither — it takes a callback on its `RenderContext`, on
	 * `link`'s own terms. Bounded by this view, so closing the leaf unloads
	 * whatever the last render left loaded.
	 */
	private markdown: MarkdownPasses;
	/**
	 * Every vault file suggester attached during the render in progress.
	 *
	 * `editor/layout-editor.ts`'s own precedent for `FormulaSuggest`, one render
	 * loop over: an input removed mid-focus fires no `blur`, so nothing else
	 * would close a popup left open across a rebuild, and this view rebuilds far
	 * more often than that editor pane does — on every committed edit to any
	 * component on the sheet, not only on a layout change
	 * (`docs/features/picture-fit-and-suggest.md`).
	 */
	private fileSuggests: FileSuggest[] = [];
	/**
	 * What the note is expected to hold when the offered undo is pressed.
	 *
	 * A box rather than the string `offerUndo` used to close over, because the
	 * text a trigger leaves is **not** the text the note ends up holding: the
	 * reset's own render writes the promoted properties the reset moved (SPEC §9),
	 * and it does so a turn later, after `applyTrigger` has already finished
	 * synchronously. Measured: `applyEdits` → `commit` → `void renderSheet()`
	 * returns before the render awaits its layout, so the snapshot was always the
	 * pre-promotion text, `restoreDocument`'s guard always failed, and **Undo**
	 * answered "this note has changed since the reset" on every layout that
	 * promotes a value a reset moves — current HP, spell slots — which is this
	 * feature's own motivating case.
	 *
	 * Carried forward by `commit` and only where the plugin is writing its own
	 * output on top of exactly the text this box holds. A *reader's* edit lands
	 * through the redrawing branch and never advances it, which is what keeps an
	 * undo from swallowing an edit made while the offer was standing — and once
	 * the reader has edited, the box stops matching and stays stale, so the
	 * refusal happens for the reason it is for.
	 */
	private undoExpectation: { text: string } | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: SheetsmithPlugin) {
		super(leaf);
		this.plugin = plugin;
		// In the constructor body rather than as a field initialiser: `app` is the
		// base class's, and a field depending on one is an initialisation order a
		// reader has to know the class hierarchy to check.
		this.markdown = new MarkdownPasses(this, this.app);
	}

	getViewType(): string {
		return VIEW_TYPE_SHEET;
	}

	getDisplayText(): string {
		return this.file?.basename ?? 'Sheet';
	}

	getIcon(): string {
		return 'layout-grid';
	}

	getViewData(): string {
		return this.data;
	}

	/**
	 * Write only what this reader typed, and lower the flag once it has landed.
	 *
	 * **Not the thing that closes the debounce race, and an earlier draft of this
	 * comment claimed it was.** `requestSave` is typed `() => void` with no
	 * `cancel`, so a pending write cannot be called off and firing `save()` early
	 * does not discharge it — it still arrives about two seconds later. But the
	 * base class refuses it on its own: its `save` returns early when
	 * `lastSavedData === getViewData()`, and after a flush the view's text *is*
	 * what it last saved. The race is closed with or without this guard.
	 *
	 * What the guard buys is worth having anyway. It says the same thing in
	 * members the typings admit, rather than resting on a private field — the
	 * `Debouncer.cancel` the runtime object probably has was declined on that
	 * ground, as the suggestion popup's `suggestEl` was. It is assertable from
	 * outside, which `lastSavedData` is not, so the rule is checkable rather than
	 * merely argued. And it suppresses the redundant write `reload` would
	 * otherwise invite, since `reload` moves `data` without touching the
	 * platform's own bookkeeping — which is what keeps a modified time meaning
	 * something. **Nothing is lost by refusing**: the flag is down only when
	 * every edit this reader made is already on disk, `commit` being the one door
	 * into `data` that raises it and the only one the reader can reach.
	 *
	 * It also settles the close write in the same safe direction — a view holding
	 * text staler than its file no longer overwrites it on the way out, which is
	 * the pre-existing half of this that `docs/BACKLOG.md` records.
	 *
	 * The flag drops **after** `super.save()`, never before: a write that throws
	 * leaves the edit outstanding, which is what the flag is for.
	 */
	async save(clear?: boolean): Promise<void> {
		if (!this.pendingSave) return;
		await super.save(clear);
		this.pendingSave = false;
	}

	setViewData(data: string, clear: boolean): void {
		this.data = data;
		/*
		 * **Only a new file means nothing is owed**, which is what `clear` says —
		 * `onLoadFile` calls the platform's loader with it set, an external-change
		 * update calls it unset. The difference is load bearing and an earlier
		 * draft of this lowered the flag either way, which quietly broke the
		 * platform's merge: a dirty view that has just had an external write
		 * merged into it is handed the *merged* text through this door, still owes
		 * a write of it, and is still `dirty` as far as the base class is
		 * concerned. Clearing the flag there left that merge unsaveable by the
		 * `save` below and lost it on close.
		 */
		if (clear) this.pendingSave = false;
		void this.renderSheet();
	}

	clear(): void {
		// Detach all state from the outgoing file: stale text must never be
		// reported by getViewData, and an in-flight render for the previous
		// file must bail rather than repaint the emptied view.
		this.data = '';
		// And nothing is owed on the file being left. Were this to stay raised,
		// a flush arriving after a clear would write the empty string over a
		// note whose only fault was being open a moment ago.
		this.pendingSave = false;
		this.renderId++;
		this.activeTab.clear();
		this.openRecords.clear();
		// An undo offered on the note being left has nothing to restore into.
		this.undoExpectation = null;
		// The outgoing note's embeds go with it: a transclusion loaded for the
		// file just closed has nothing left to be attached to.
		this.markdown.end();
		this.contentEl.empty();
		// A popover and a modifier form both live on document.body, so emptying
		// this element does not reach either — they would be left pointing at a
		// cell of the file just closed. The form survives a *render*, deliberately,
		// which is why the file changing has to say so explicitly.
		closePopover();
		closeAnchoredPanel();
	}

	async onClose(): Promise<void> {
		closePopover();
		closeAnchoredPanel();
	}

	/** Re-render from current data, e.g. after the layout file changed. */
	refresh(): void {
		void this.renderSheet();
	}

	/**
	 * Write what this view holds, if it is holding an edit nobody has saved.
	 *
	 * **`requestSave` is a two-second debounce** — that is what `obsidian.d.ts`
	 * calls it — so for two seconds after a reader leaves a cell, the value they
	 * typed exists only in `this.data`. Anything that scans the vault in that
	 * window reads a note without it, which is how a rename committed moments
	 * after an edit found no section to migrate and reported nothing
	 * (`docs/features/component-rename-migration.md` § Design, "Open sheets").
	 *
	 * **The question is this view's own dirt, never whether the file differs**,
	 * and the two come apart in exactly one direction — the destructive one. A
	 * note whose bytes moved because something *else* wrote it (a Markdown pane
	 * in a split on the same note, which `view/auto-open.ts`'s per-file override
	 * makes a supported state; Sync; another plugin; an earlier rename) differs
	 * from `this.data` while this view has nothing to contribute. Comparing bytes
	 * would call that a flush and write the *older* text over it, because no
	 * vault event ever told this view it was behind. Unsaved, that write waits
	 * for the reader's next edit or for the close; asked for on every rename, it
	 * would be forced on a note the reader never touched.
	 *
	 * So the flag is also what keeps the promise the mtime check in the vault
	 * fixture rests on: a sheet with nothing pending is not written, and there is
	 * no read here at all.
	 */
	async flushSave(): Promise<void> {
		// Straight to `save`, which owns the "only what this reader typed" rule
		// for every caller including the debounce. Repeating the flag test here
		// would be a second copy of a decision that has to hold in one place.
		await this.save();
	}

	/**
	 * Take the file's current contents as this view's, and redraw from them.
	 *
	 * **The other half of the flush above**, and the one the reader sees: nothing
	 * in this folder registers a vault event, so a note rewritten underneath an
	 * open sheet leaves `this.data` holding the text from before. `refresh()`
	 * re-renders *from that*, which after a rename means drawing the renamed
	 * component off a heading its own data no longer carries — a card that goes
	 * blank with its value still in the file. Worse than the blank: `getViewData`
	 * is what a save writes, so the next edit on that sheet, or closing it, puts
	 * the pre-rename heading back and orphans the data for good.
	 */
	async reload(): Promise<void> {
		if (!this.file) return;
		/*
		 * **A view holding an unsaved edit is left to the platform**, which does
		 * this better than a reload can. `TextFileView.onload` registers
		 * `vault.on('modify', this.onModify)` — the base class this extends owns a
		 * vault event even though nothing in `src/view/` registers one — and on a
		 * write to the open file it re-reads, and where the view is dirty it
		 * three-way merges the reader's text against it (base: what the view last
		 * saved) and says so: "…has been modified externally, merging changes
		 * automatically."
		 *
		 * Overwriting `data` here instead would throw the reader's keystroke away
		 * — a keystroke committed between the flush and this call is exactly the
		 * window — and lower the flag that would have saved it, which is worse
		 * than the staleness this method exists to fix and worse than doing
		 * nothing at all. The guard on `onModify` is `this.saving || file !==
		 * this.file`, and `flushSheets` awaits each save to completion before the
		 * migration writes, so `saving` is false by then and the handler is
		 * genuinely reached.
		 *
		 * The clean case — no unsaved edit, which is the ordinary one — still
		 * reloads here, and that is what step 4 is for.
		 */
		if (this.pendingSave) return;
		// Through `setViewData`, which is the one door the app itself uses to put
		// text into this view, and which renders. A second way in would be a
		// second answer to what loading a file means.
		this.setViewData(await this.app.vault.read(this.file), false);
	}

	/**
	 * Parse and load first, touch the DOM last: overlapping runs are routine
	 * (an edit commit, a layout-editor save, and an external modify can all
	 * land inside one vault read), so only the newest run may render, and the
	 * previous sheet stays visible until its replacement is ready.
	 */
	private async renderSheet(): Promise<void> {
		const run = ++this.renderId;
		const root = this.contentEl;
		root.addClass('sheetsmith-view');
		// Closed before anything else, so every exit below — an error message,
		// a missing layout, or the grid itself — starts from none standing,
		// whichever one the render before this took.
		for (const suggest of this.fileSuggests) suggest.close();
		this.fileSuggests = [];

		let note: CharacterNote;
		try {
			note = parseCharacter(this.data);
		} catch (error) {
			root.empty();
			this.renderMessage(
				error instanceof CharacterParseError
					? error.message
					: String(error),
			);
			return;
		}

		let layout: Layout | null = null;
		let loadError: string | null = null;
		try {
			layout = await loadLayout(
				this.app,
				this.plugin.settings.layoutFolder,
				note.layoutName,
			);
		} catch (error) {
			loadError = error instanceof Error ? error.message : String(error);
		}
		if (run !== this.renderId) return;

		const focus = captureFocus(root);
		// `root` is the scroll container (`overflow-y: auto`), and emptying it
		// collapses its scroll height to zero — the browser clamps `scrollTop`
		// to 0 right along with it. Captured here and reapplied once the grid
		// is rebuilt, or every committed edit would jump the reader back to the
		// top of the sheet mid-way through editing several fields.
		const scrollTop = root.scrollTop;
		// Everything a popover could be anchored to is about to be replaced.
		// A pointer interaction dismisses it on its own, but a rebuild driven
		// by anything else — an external edit, a layout saved in settings —
		// would strand it over a cell that no longer exists.
		closePopover();
		root.empty();
		if (loadError !== null) {
			this.renderMessage(loadError);
			return;
		}
		if (!layout) {
			// SPEC §8's last bullet: a clear message, and the offer to pick
			// another beside it. **Not on the `loadError` branch above**, where
			// the layout is present and its JSON will not parse — that is a
			// layout the reader *has*, and its fix is to repair it, so offering
			// "pick another" there would invite them to abandon it and silently
			// repoint the character at a sheet its author did not build.
			const folder = this.plugin.settings.layoutFolder;
			renderMissingLayout(this.contentEl, {
				message: `Layout "${note.layoutName}" was not found in "${folder}".`,
				folder,
				hasLayouts: hasLayouts(this.app, folder),
				onPick: () =>
					pickLayout(this.plugin, (name) => this.repointLayout(name)),
			});
			return;
		}

		// Created before the grid so the buttons sit above it, filled in once
		// the components have been read and the name table built — a reset
		// resolves formulas, so it needs both.
		const triggerBar = root.createDiv('sheetsmith-triggers');

		const grid = root.createDiv('sheetsmith-grid');
		grid.style.setProperty(
			'--sheetsmith-columns',
			String(layout.columns ?? DEFAULT_COLUMNS),
		);

		// Grid order, not file order, and depth first: a container's children
		// are read where the container sits, before its next neighbour (SPEC
		// §8). Explicit grid-column/row make DOM order invisible while a grid
		// holds, but it decides two things that matter: tab order, and the
		// single-column sequence once the narrow reflow drops the grid and lays
		// cells out in DOM order.
		const walk = walkComponents(layout.components);

		// Read everything before rendering anything: a formula may name any
		// component on the sheet, including one that sits later in grid
		// order or inside a container that is closed, so the name table has to
		// be complete before the first card draws. A component that failed to
		// read publishes nothing, which makes formulas depending on it report an
		// unknown name rather than compute from a blank.
		const prepared: PreparedComponent[] = walk.map(({ config }) => {
			const component = getComponent(config.type);
			// A container has no section, so there is nothing to look for and no
			// note body to be misread as its own: unmapped prose under a heading
			// that happens to match a container's label is never even read
			// (SPEC §10).
			const readable = isContainer(component) ? undefined : component;
			const section = readable ? getSection(note, config.label) : undefined;
			const result =
				readable && section ? readable.read(section.body, config) : null;
			return {
				config,
				component,
				error: result && !result.ok ? result.error : null,
				data: result?.ok === true ? result.data : null,
			};
		});

		// The layout's own arithmetic (SPEC §5). Definitions that failed to
		// parse are left out and reported in the layout editor, where they
		// can be fixed; a formula calling one fails on its own component.
		const { library } = parseFunctions(layout.functions);

		// A published value may itself be computed, so the tables take a way
		// to build each component's resolver rather than finished numbers:
		// it is what closes the loop between "this card reads the sheet" and
		// "the sheet reads this card".
		//
		// **One call rather than the five steps it is made of**, and the reason is
		// that review could not see the five: dropping the modifier input here left
		// the whole suite green while every card read unmodified and every modifier
		// cell still drew `zap`. `buildSheet` holds the sequence, the harness and
		// the fixture test go through the same one, and `sheet.test.ts` scans all
		// three for it.
		const { env, modifiers } = buildSheet(
			layout,
			prepared,
			library,
			/*
			 * **The one path in this plugin where a character's sheet writes the
			 * layout file** (SPEC §7), and it is the view's because a
			 * component never touches a file (PATTERNS §5). Bounded to appending one
			 * definition, ordered so the layout lands before the cell is rewritten,
			 * and every failure is a value the form puts in front of the reader.
			 */
			(name: string, effect: TypedEffect): Promise<PromoteResult> =>
				/*
				 * **The effect goes over whole, never rebuilt member by member.** A
				 * `TypedEffect` is a `ModifierDefinition` minus its name, so it
				 * satisfies this parameter as it stands — and `contract.test.ts` forces
				 * any member added to one interface onto the other, which a host
				 * spelling the five fields would then silently drop, because an
				 * optional member missing from an object literal type-checks. The
				 * harness would go on drawing a promotion this never performed, which
				 * is the class of bug the host scan in `sheet.test.ts` exists for — and
				 * that scan holds this too.
				 */
				appendModifierDefinition(
					this.app,
					this.plugin.settings.layoutFolder,
					note.layoutName,
					name,
					effect,
				),
		);

		// One pass per render, begun before the first component draws and ended by
		// the next render or by the file changing. Resolved against this note's own
		// path, exactly as `linkContext` is, so a relative link or embed inside a
		// block means what it would mean written in the note body.
		// The link context is built once here rather than per component, because
		// the markdown pass needs its `resolves` too: the renderer draws its own
		// anchors and marks none of them unresolved.
		const link = this.linkContext();
		const renderMarkdown = this.markdown.begin(this.file?.path ?? '', (target) =>
			link.resolves(target),
		);

		renderGrid(grid, walk, prepared, ({ config, component, data }) => ({
			resolved: resolveFormulaFields(component, config, data, env),
			resolveField: makeFieldResolver(component, config, data, env),
			explainField: makeFieldExplainer(component, config, data, env),
			onChange: (edited: unknown) => this.applyEdit(component, config, edited),
			link,
			modifiers,
			renderMarkdown,
			resource: (target) => this.resourceUrl(target),
			suggestFile: (input, commit) => {
				this.fileSuggests.push(
					attachFileSuggest(this.app, input, commit, this.file?.path ?? ''),
				);
			},
			activeTab: this.activeTab.get(config.id),
			onActivateTab: (index: number) => this.activeTab.set(config.id, index),
			openRecords: [...(this.openRecords.get(config.id) ?? [])],
			onToggleRecord: (index: number, open: boolean) => {
				const held = this.openRecords.get(config.id) ?? new Set<number>();
				if (open) held.add(index);
				else held.delete(index);
				this.openRecords.set(config.id, held);
			},
		}));

		// SPEC §10: sections the layout does not map are left alone — they stay
		// in the note untouched and simply do not render.

		this.renderTriggers(triggerBar, layout, prepared, env);

		restoreFocus(root, focus);
		root.scrollTop = scrollTop;
		/*
		 * A modifier form left over from the render before this one is handed to the
		 * cell it belongs to while the grid is being built, which is what keeps it
		 * open across a commit. If this render no longer draws that cell — the file
		 * changed, the layout changed, the row went — nothing claimed it, so it goes
		 * rather than floating over a sheet it has nothing to do with.
		 */
		dropDetachedAnchoredPanel();

		// Last, and after everything on screen is final: a promoted property is
		// derived from the same `env` the cards drew from, so there is nothing
		// left to compute and nothing on screen it could change.
		this.writePromotedProperties(run, note, layout, prepared, env);
	}

	/**
	 * Mirror this layout's promoted values into the note's frontmatter (SPEC §9).
	 *
	 * **At the end of the render, from the same `env` the cards drew from.**
	 * Picked over the other three cadences a plugin could choose — on edit, on
	 * save, on close — because it is the only one that covers every way a promoted
	 * value changes: a value edit, a layout edit (a formula, the function library,
	 * a modifier definition), a first open after a field was promoted, and a reset
	 * trigger. What makes it affordable is the change guard: the render already
	 * holds the note parsed and the sheet resolved, so the added cost on a sheet
	 * whose values have not moved is one string comparison per promoted field and
	 * no write at all.
	 *
	 * **A layout with no `promotedFields` key does no work**, which is the
	 * off-by-default promise honoured in the code path and not only in the config.
	 *
	 * **It does not re-render**, which is why `commit` is asked not to. The only
	 * difference between the old text and the new is a frontmatter line no
	 * component draws, so there is nothing on screen to recompute — and without
	 * this the write would cost a second full render on every edit that moved a
	 * promoted value, terminating on the guard rather than by construction.
	 *
	 * **The generation is re-checked here rather than only before the paint.**
	 * Today that is the same answer, because nothing between the check after
	 * `loadLayout` and this line awaits; it is stated at the *write* so that an
	 * await introduced anywhere in the render cannot silently leave this one
	 * statement outliving its own generation. What it guards is the properties-panel
	 * race: such an edit arrives through `setViewData`, which bumps `renderId`, and
	 * a write derived from frontmatter that has since changed would put the older
	 * block back.
	 */
	private writePromotedProperties(
		run: number,
		note: CharacterNote,
		layout: Layout,
		prepared: readonly PreparedComponent[],
		env: FormulaEnv,
	): void {
		if (layout.promotedFields === undefined) return;
		if (run !== this.renderId) return;

		// The same assembly the layout editor's own picker and report read, so
		// the two cannot disagree about what this layout publishes
		// (`formula/modifier-targets.ts`). Every problem this parser reports is
		// the editor's; reporting one here would be `docs/UI.md` §9's two answers
		// to one question.
		const { fields, retired } = parsePromotedFields(
			layout,
			prepared.map((entry) =>
				modifierTargetSource(entry.config, entry.component),
			),
		);
		if (fields.length === 0 && retired.length === 0) return;

		const { note: written, refusals } = applyPromotedFields(
			note,
			{ fields, retired },
			(name) => env.sheet(name),
		);
		if (refusals.length > 0) {
			// At most one per render that attempted a refused write, which is the
			// cadence the existing save warning already has. A refusal changes
			// nothing, so it re-fires whenever the value moves again — acceptable,
			// because the state is rare, user-caused, named, and fixable in one
			// gesture. One `Notice` rather than `warn`'s list: each refusal is a
			// whole sentence naming its own property and its own fix, where
			// `warn`'s items are names read to be counted.
			new Notice(refusals.map(promotedFieldMessage).join(' '));
		}
		if (written === 'unchanged') return;
		this.commit(serialiseCharacter(written), false);
	}

	/**
	 * What a component needs to make a note reference in a cell work.
	 *
	 * The vault half of a rendered wikilink: a component draws the anchor from
	 * the text alone and asks this whether the note exists, where to go, and what
	 * to preview. Resolved against this note's own path, so a relative link in a
	 * cell means what it would mean written in the note body.
	 */
	private linkContext(): LinkContext {
		const source = this.file?.path ?? '';
		return {
			resolves: (target) =>
				this.app.metadataCache.getFirstLinkpathDest(
					getLinkpath(target),
					source,
				) !== null,
			open: (target, event) => {
				// The modifier that means "new tab" is the app's to define, not a
				// component's — which is half the reason this is passed in.
				void this.app.workspace.openLinkText(
					target,
					source,
					Keymap.isModEvent(event),
				);
			},
			preview: (target, anchor, event) => {
				// The Page preview plugin listens for this and owns the popover,
				// including whether the user asked for it on hover at all.
				this.app.workspace.trigger('hover-link', {
					event,
					source: VIEW_TYPE_SHEET,
					hoverParent: this,
					targetEl: anchor,
					linktext: target,
					sourcePath: source,
				});
			},
		};
	}

	/**
	 * A URL for a file a component names, or null where the vault holds no such
	 * file.
	 *
	 * `linkContext`'s `resolves` with one more step on the end, and resolved
	 * against the same source path, so an embed in a section means what it would
	 * mean written in the note body. **No extension list, deliberately** — the app
	 * answers whether the file exists and the browser answers whether it can draw
	 * it, and a plugin holding its own idea of which formats count is how webp
	 * stopped rendering inside one while working one line outside it.
	 */
	private resourceUrl(target: string): string | null {
		const file = this.app.metadataCache.getFirstLinkpathDest(
			getLinkpath(target),
			this.file?.path ?? '',
		);
		return file ? this.app.vault.getResourcePath(file) : null;
	}

	/**
	 * One button per declared trigger (SPEC §6). This is the only place the
	 * sheet performs an action rather than holding values.
	 */
	private renderTriggers(
		bar: HTMLElement,
		layout: Layout,
		prepared: readonly PreparedComponent[],
		env: FormulaEnv,
	): void {
		const { names } = parseTriggers(layout);
		if (names.length === 0) {
			bar.remove();
			return;
		}

		for (const name of names) {
			// A component that failed to read has no data to reset and would
			// be written from nothing, so it is not bound here either.
			const bound = prepared.filter(
				(entry) =>
					entry.error === null &&
					entry.component?.applyReset !== undefined &&
					// Any of its bindings, not one: a component may answer to
					// several triggers, which is how a system whose long rest
					// includes its short rest gets said at all.
					(entry.config.reset ?? []).some(
						(binding) => binding.trigger === name,
					),
			);

			const button = bar.createEl('button', {
				text: name,
				cls: 'sheetsmith-trigger',
			});
			button.type = 'button';

			if (bound.length === 0) {
				// Shown but inert: the layout declares this trigger, and hiding
				// it would make a half-built layout look like a broken one.
				button.disabled = true;
				button.setAttribute(
					'aria-label',
					`${name}. Nothing on this sheet resets on it.`,
				);
				button.title = `Nothing on this sheet resets on ${name}.`;
				continue;
			}

			button.addEventListener('click', () => {
				new ConfirmModal(
					this.app,
					`Apply ${name}? This can be undone. It resets:`,
					`Apply ${name}`,
					() => this.applyTrigger(name, bound, env),
					bound.map((entry) => resetSummary(name, entry)),
				).open();
			});
		}
	}

	/**
	 * Reset every component bound to this trigger, in one write.
	 *
	 * SPEC §6: what resolves is applied and what does not is named. A pool
	 * whose max is broken must not stop the rest of a long rest, which is why
	 * the failures are collected rather than thrown.
	 */
	private applyTrigger(
		name: string,
		bound: readonly PreparedComponent[],
		env: FormulaEnv,
	): void {
		const before = this.data;
		const edits: {
			component: ComponentDefinition;
			config: ComponentConfig;
			data: unknown;
		}[] = [];
		const failed: string[] = [];

		for (const { component, config, data } of bound) {
			if (!component?.applyReset) continue;
			const resolve = makeFieldResolver(component, config, data, env);
			const explain = makeFieldExplainer(component, config, data, env);
			/*
			 * The same mapping the pre-resolve pass uses, so a rest restores to the
			 * ceiling the card is *drawing* rather than to the one it drew before a
			 * modifier arrived. `max` and `count` are formulas that become published
			 * names, so `mod.self` inside either has to mean the same thing on this
			 * path as it does at the render — which is what `resolveFormulaFields`
			 * now guarantees on the other side.
			 *
			 * Supplied here rather than spelled in each component, and that is the
			 * point of it: a component restating which of its own fields publishes a
			 * name would be a second copy of the conditions `scopeValues` already
			 * decides — a Track's `count` carries a `display` only when it is
			 * neither a row set, nor named levels, nor a flag — and a copy of that
			 * predicate is what `PATTERNS.md` §1's one-step tier refuses.
			 */
			const published = publishedFieldNames(component, config);

			/*
			 * **Every binding this trigger matches, not the first.** This was a
			 * `findIndex`, which was right while one component had at most one
			 * binding per trigger; a binding may now name a column, so a long
			 * rest that clears Conditions and refills Uses on one table is two
			 * bindings the parser accepts and the button has to apply.
			 *
			 * Nothing merges component data: two edits carrying one label compose
			 * through `applySectionWrites`, the second `write` reading the body
			 * the first produced. So the sheet still knows nothing about any
			 * component's shape, and §6's "applies what it can and names what it
			 * could not" holds per column as well as per component.
			 */
			for (const [index, reset] of (config.reset ?? []).entries()) {
				if (reset.trigger !== name) continue;
				// The bindings are a list, so this one's expression lives at
				// `reset.<index>.to`. The component asks for it by the one name
				// it has — `reset.to` — and the sheet, which knows which binding
				// is being applied, rewrites it. Without this a component would
				// have to know its own position in its own config.
				const at = (field: string): string =>
					field === 'reset.to' ? `reset.${index}.to` : field;

				const result = component.applyReset(data, config, reset, {
					resolve: (field, scope) =>
						resolve(at(field), scope, published.get(at(field))),
					explain: (field, scope) =>
						explain(at(field), scope, published.get(at(field))),
				});
				if (result.ok) edits.push({ component, config, data: result.data });
				else failed.push(`${config.label} — ${result.error}`);
			}
		}

		if (failed.length > 0) {
			warn(`${name} could not reset:`, failed);
		}
		if (edits.length === 0) return;

		this.applyEdits(edits);
		// Nothing moved, so there is nothing to offer taking back.
		if (this.data === before) return;
		// A box, because this render's own promoted-field write lands a turn from
		// now and is part of what the trigger did rather than something the reader
		// did (see `undoExpectation`).
		this.undoExpectation = { text: this.data };
		this.offerUndo(name, before, this.undoExpectation);
	}

	/**
	 * Offer to put the note back as it was immediately before the trigger.
	 *
	 * One string swapped for another, which is what the batched write bought:
	 * no inverse edits to compute, and nothing that can half-succeed.
	 */
	private offerUndo(
		name: string,
		before: string,
		after: { text: string },
	): void {
		const notice = new Notice('', UNDO_TIMEOUT);
		notice.messageEl.createSpan({ text: `${name} applied. ` });
		const undo = notice.messageEl.createEl('a', {
			text: 'Undo',
			cls: 'sheetsmith-undo',
		});
		undo.addEventListener('click', () => {
			notice.hide();
			this.restoreDocument(before, after);
		});
	}

	/**
	 * Put `previous` back, but only if the note still holds what the trigger
	 * left. Between the offer and the press the player can edit a field, and a
	 * restore that swallowed that edit would destroy more than it reverted.
	 *
	 * **`expected` is a box rather than a string**, because what the trigger left
	 * is still arriving when the offer is made: the reset's own render writes the
	 * promoted properties it moved, a turn later. `undoExpectation` carries the
	 * argument.
	 */
	private restoreDocument(previous: string, expected: { text: string }): void {
		if (this.data !== expected.text) {
			new Notice(
				'Sheetsmith did not undo: this note has changed since the reset.',
			);
			return;
		}
		this.commit(previous);
	}

	/**
	 * Take `text` as the note's new contents: save it, and redraw from it.
	 *
	 * The three lines every write on this sheet ends with, and a name for them
	 * on `docs/PATTERNS.md` §1's third-consumer rung — an undo, a batch of
	 * component edits, and a layout repointed. Three copies rather than a drift
	 * between them: the guard below is `applyEdits`' own, and it is **inert on
	 * the undo path**, which is why `restoreDocument` never carried one and had
	 * no bug for want of it. An undo is only offered where the reset moved the
	 * text (`offerUndo` is reached from that check), so the text it restores is
	 * never the text on screen.
	 *
	 * **Identical text is not a write.** Obsidian's own save of unchanged bytes
	 * produces no `modify`, so the rebuild that a changed file would have
	 * brought never arrives — which is why the callers cannot simply lean on the
	 * round trip and why the redraw is here rather than left to the vault.
	 *
	 * The redraw is what recomputes every derived display from the fresh data,
	 * and `renderSheet` captures and restores focus, so tabbing into the next
	 * input survives it.
	 *
	 * **`redraw` is asked for by every caller but one**, and the exception is
	 * what the parameter exists for rather than a convenience: the promoted-field
	 * write (SPEC §9) changes one frontmatter line **no component draws**, so
	 * there is nothing on screen to recompute — and it runs *at the end of a
	 * render*, so redrawing would cost a second full render on every edit that
	 * moved a promoted value and would terminate on the change guard rather than
	 * by construction. Suppressing the redraw is not an optimisation there; it is
	 * what keeps the write from being recursive.
	 */
	private commit(text: string, redraw = true): void {
		if (text === this.data) return;
		/*
		 * A write the plugin made as its own *output* carries a standing undo's
		 * expectation forward with it, and the promoted-field write is the only
		 * one — which is what the suppressed redraw already marks.
		 *
		 * **Only where it is writing on top of exactly the text that expectation
		 * holds**, and that condition is the whole of the rule rather than
		 * caution. Advancing unconditionally would be worse than the bug it
		 * fixes: a reader edits a card while the offer stands, that edit lands
		 * through the redrawing branch and correctly leaves the expectation
		 * stale, and its own render's promoted write would then advance the box
		 * onto the reader's text — so **Undo** would be accepted and would
		 * swallow the edit. Matching first is what keeps a refusal refusing for
		 * the reason it is for.
		 */
		if (!redraw && this.undoExpectation?.text === this.data) {
			this.undoExpectation.text = text;
		}
		this.data = text;
		this.pendingSave = true;
		this.requestSave();
		if (redraw) void this.renderSheet();
	}

	/** One component's edit, as handed to `applyEdits`. */
	private applyEdit(
		component: ComponentDefinition,
		config: ComponentConfig,
		data: unknown,
	): void {
		this.applyEdits([{ component, config, data }]);
	}

	/**
	 * Write edited component data back into the note. Re-parses the current
	 * text so the write always lands on the freshest content, and saves only
	 * when the serialised note actually differs.
	 *
	 * Takes a batch because a reset trigger (SPEC §6) changes several
	 * components at once, and one section at a time would mean one parse,
	 * serialise, save, and re-render per component. An edit from a single
	 * control is a batch of one and behaves exactly as it did.
	 */
	private applyEdits(
		edits: readonly {
			component: ComponentDefinition;
			config: ComponentConfig;
			data: unknown;
		}[],
	): void {
		if (edits.length === 0) return;
		try {
			const { text, failed } = applySectionWrites(
				this.data,
				edits.map(({ component, config, data }) => ({
					label: config.label,
					write: (body: string | null) => component.write(data, body, config),
				})),
			);
			// Every section that could be written still is; the ones that could
			// not are named. A batch must not be all-or-nothing, or one
			// misconfigured component would refuse a whole long rest.
			if (failed.length > 0) {
				warn(
					'Sheetsmith could not save:',
					failed.map((failure) => `${failure.label} — ${failure.error}`),
				);
			}
			this.commit(text);
		} catch (error) {
			// The note itself would not parse, so there is no partial result to
			// keep — nothing was written.
			new Notice(
				`Sheetsmith could not save this change: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Point this note at a different layout, through the view's own save path.
	 *
	 * Through `commit` above, which is the tail every value edit on the sheet
	 * already ends with — the same writer and the same spelling, so there is no
	 * second path into a file this view owns and is the editor of.
	 * `withLayoutName` changes the one frontmatter line and nothing else in the
	 * file, so every other property, the preamble and every section come
	 * through byte for byte.
	 *
	 * **No section is added, removed or migrated.** SPEC §10 does the rest:
	 * sections the new layout does not map do not render and are not reported,
	 * so repointing a note is losslessly reversible by repointing it back
	 * (Constraint 4).
	 *
	 * The parse cannot fail on the layout the reader just picked — this state is
	 * reached only after one succeeded — but the picker is a modal, so the file
	 * may have been edited into something unparseable while it was open. That is
	 * `saveSectionWrites`' own case and takes its answer: nothing is written and
	 * the reason is announced.
	 */
	private repointLayout(name: string): void {
		try {
			this.commit(
				serialiseCharacter(withLayoutName(parseCharacter(this.data), name)),
			);
		} catch (error) {
			new Notice(
				`Sheetsmith could not change this note's layout: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private renderMessage(text: string): void {
		this.contentEl.createDiv('sheetsmith-notice', (el) => el.setText(text));
	}
}
