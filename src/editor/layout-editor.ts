import {
	ButtonComponent,
	debounce,
	Notice,
	Setting,
	TFile,
} from 'obsidian';
import {
	RenameIntent,
	reportComponentRename,
} from '../component-rename-migration';
import { getComponent } from '../components';
import { Canvas } from './canvas';
import { ComponentPicker } from './component-picker';
import { ConfigPanel } from './config-panel';
import {
	LayoutFileRowHost,
	promptForNewLayout,
	renderLayoutFileRow,
} from './layout-file-row';
import { showFieldError } from './field-error';
import { attachFormulaSuggest, FormulaSuggest } from './formula-suggest';
import { focusToken } from './focus-token';
import { ConfirmModal } from '../ui/confirm-modal';
import { NEW_LAYOUT_LABEL } from './new-layout';
import { isResolvedLayout, listLayouts } from '../layouts';
import { ListContext } from './list-fields';
import { PickerChoice } from './picker-catalog';
import type SheetsmithPlugin from '../main';
import { Layout, parseLayout, serialiseLayout } from '../parse/layout';
import { WalkEntry, walkComponents } from '../parse/layout-walk';
import { parseFunctions } from '../formula/functions';
import { Vocabulary, vocabularySource } from '../formula/vocabulary';
import { nextFreeRow, renderTree, SHEET_DESTINATION } from './tree';
import { ComponentConfig } from '../types';
import { UndoStack } from './undo-stack';
import { childIsPlaced } from '../view/grid-cells';

/**
 * The top level, wherever something has to be named that is not a component.
 *
 * Defined in `tree.ts` and re-exported here: the tree needs it to draw and
 * select the layout's own row, and this module needs it for the same
 * question one level up (what the panel configures when nothing else is
 * selected; the component picker's destination imports it from `tree.ts`
 * too) — declaring it in
 * whichever of the two imports the other would make a cycle of two runtime
 * values, where this file already imports `renderTree` from `tree.ts`.
 */
export { SHEET_DESTINATION };

/** How long a rebuilt region stays marked, before fading over its own transition. */
const FLASH_HOLD = 900;

/**
 * What the editor needs from the pane hosting it.
 *
 * The two pieces of state are the *author's posture* rather than the layout's
 * content — which layout file they have open, and what they are looking at — so
 * both belong to the view, which is where a workspace remembers posture at all
 * (`View.getState` for one, `View.setEphemeralState` for the other). The editor
 * reads them at render time and asks for a change; it never keeps a copy,
 * because a copy is a second answer to "what is selected" and the two would
 * disagree the first time a pane was restored.
 *
 * **The open layout is a file, and the editor can only ask for another one**
 * (`docs/features/visible-layout-files.md`). It used to be a basename the editor
 * set for itself and resolved out of `listLayouts`, which made "which file is
 * open" a thing the editor could change behind the view's back. The pane is a
 * `FileView` now and the file is its binding, so the editor is handed the file
 * and asks the host to open a different one — and the host does that the way
 * Obsidian opens any file, in the same leaf.
 *
 * `setSelection` does not redraw. A render that has to correct the selection —
 * one naming a component the layout no longer holds — would otherwise redraw
 * from inside a render, and the caller that wants both says so in two lines
 * instead.
 *
 * `refreshSheets` is here for a different reason: a write to the layout file has
 * to reach every sheet rendering it, and reaching into a view is the view
 * layer's hop to make rather than this one's (`docs/PATTERNS.md` §2).
 */
export interface LayoutEditorHost {
	/** The layout file the pane has open, or null where it has none. */
	readonly layoutFile: TFile | null;
	/**
	 * Open another layout file in this pane. The host lets go of the one it
	 * had — which is where a pending edit is written and the undo history is
	 * cleared — and draws the new one.
	 */
	openLayoutFile(file: TFile): void;
	/**
	 * What the panel configures: a component id, or `SHEET_DESTINATION` for the
	 * layout itself.
	 */
	readonly selection: string;
	/** Remember what is selected. Does not redraw. */
	setSelection(id: string): void;
	/** Rebuild both regions from the layout as it now stands. */
	redraw(): void;
	/** Refresh every open sheet view, after a write to the layout file. */
	refreshSheets(): void;
	/**
	 * Let every open sheet write what it is holding, before this pane rewrites
	 * the notes underneath them.
	 *
	 * An open sheet's edits reach disk through a two-second debounce, so what a
	 * vault scan reads is not what the reader has typed
	 * (`docs/features/component-rename-migration.md` § Design, "Open sheets").
	 * The migration is the one caller: every other write this pane makes is to
	 * the layout file, which no sheet is the editor of.
	 */
	flushSheets(): Promise<void>;
	/**
	 * Re-read every open sheet from its file, and redraw. The pair of
	 * `flushSheets` above, for after the notes have been rewritten: a sheet
	 * refreshed from its own memory draws the renamed component blank and then
	 * saves the old heading back over the migration.
	 */
	reloadSheets(): Promise<void>;
}

/** The two regions of the pane, and which one a thing is drawn into. */
interface Regions {
	/** The picker, the schematics, the tree and the add row. */
	outline: HTMLElement;
	/** The settings of whatever is selected. */
	panel: HTMLElement;
}

/**
 * The outline of the layout editor: the picker naming which layout is open, the
 * schematics of the grids it holds, the tree of everything in it, and the row
 * that adds one. Knows no component types — the panel beside it builds a form
 * from each `configFields` declaration, and `config-panel.ts` is what draws it —
 * and knows nothing about a leaf either: it renders into an element it is
 * handed, and asks its host for the two pieces of posture that are the pane's to
 * remember.
 *
 * It still owns the *render*, which is why the class is not named for the
 * outline alone: it loads the file, draws both regions, and applies the pending
 * focus and flash afterwards. What it no longer holds is the configuration of
 * whatever is selected (`docs/PATTERNS.md` §11), nor the **Layout file** row and
 * its file operations, which `layout-file-row.ts` draws.
 *
 * Text fields commit on change (blur or Enter), never per keystroke, and
 * invalid input shows an inline error instead of being silently ignored.
 */
export class LayoutEditorSection {
	private plugin: SheetsmithPlugin;
	private host: LayoutEditorHost;
	private redraw: () => void;
	private file: TFile | null = null;
	private layout: Layout | null = null;
	/**
	 * The entry being dragged, in whichever list is mid-drag. One cursor for
	 * every list in the pane, so a drag started in one is never read as a drop
	 * into another; the list editors in list-fields.ts share this object.
	 */
	private drag: { index: number | null } = { index: null };
	/**
	 * The component id mid-drag in the tree, shared with `tree.ts` the way
	 * `drag` above is shared with `list-fields.ts` — a drag started on one
	 * row has to be read by whichever row the pointer ends up over.
	 */
	private treeDrag: { id: string | null } = { id: null };
	/** Focus token to apply after the next render, e.g. a newly added row. */
	private pendingFocus: string | null = null;
	/** Region to mark after the next render, e.g. fields a type change built. */
	private pendingFlash: string | null = null;
	/** The pane's own element, for the updates that must not rebuild it. */
	private rootEl: HTMLElement | null = null;
	/** The two regions of the last render, or null before the first. */
	private regions: Regions | null = null;
	/** The layout's live render and its gestures (`docs/features/grid-canvas.md`). */
	private canvas: Canvas;
	/**
	 * What **Add component** opens (`docs/features/component-picker.md`). Built
	 * once, like the canvas, because it holds posture a redraw must keep: open,
	 * the query, the active line, the destination and its last report.
	 */
	private picker = new ComponentPicker();
	/**
	 * Inline errors, by the focus token of the field showing them. A redraw
	 * tears down the DOM they live in, so an error on one field would vanish
	 * because an unrelated field was corrected — the message goes with the
	 * field, not with the render that happened to draw it.
	 */
	private fieldErrors = new Map<string, string>();
	/**
	 * The name suggesters bound by the current render, so the next one can close
	 * them before it empties the container.
	 *
	 * Held here rather than in the panel for `fieldErrors`' own reason one line
	 * up: what outlives a render belongs to the thing that owns the render loop.
	 * The failure it prevents is narrow and real — an input removed while its
	 * popup is open fires no `blur`, because a removed focused element does not,
	 * so **Undo layout edit** pressed with a list up would leave that list
	 * stranded at the notice layer over a pane that no longer holds the field.
	 */
	private suggests: FormulaSuggest[] = [];
	/** Generation counter; a render that awaits and comes back stale bails. */
	private renderId = 0;
	/** The panel drawing whatever is selected, and the fields it holds. */
	private panel: ConfigPanel;
	/** What the **Layout file** row reads and asks for, built once like the panel. */
	private fileRow: LayoutFileRowHost;
	/**
	 * The layout's bytes as this session last knew them on disk: what the
	 * initial read produced, or what the last successful `persist` wrote.
	 *
	 * The undo stack's baseline. `persist` cannot diff against `this.layout`
	 * itself, because every mutation site has already changed it in place by
	 * the time `persist` runs — this is the only record of what the file held
	 * *before* the write about to happen, which is exactly what a step needs
	 * to push. Null before a layout has been loaded.
	 */
	private onDisk: string | null = null;
	/**
	 * Whether the canvas is drawn with each component's own sample values
	 * (`docs/features/preview-sample-values.md` §3).
	 *
	 * **Per pane, on for a pane that has just opened, and never written
	 * anywhere.** It is posture rather than content — no layout key, no
	 * frontmatter key, no preference — so `persist` is not called for it and the
	 * settings tab does not offer it: a third row there would be a persisted
	 * answer to a question that only exists while a pane is open. It lives here
	 * rather than on `LayoutEditorHost` because nothing outside this class asks
	 * it, unlike the two the pane owns; a redraw for any other reason keeps it,
	 * and closing the pane forgets it.
	 *
	 * On by default, because an empty canvas is the state that *hides* what a
	 * preview exists to reveal — a column too narrow for its number, a table that
	 * pushes its neighbour off the grid, a formula that reads fine at zero — and
	 * the row above the canvas turns it off in one press.
	 */
	private sampleValues = true;
	/** Undo and redo history, one snapshot per `persist` that changed a byte. */
	private undoStack = new UndoStack();
	private redoStack = new UndoStack();

	/**
	 * Debounced persist, used only by rapid-fire paths (keyboard nudging).
	 *
	 * `nudgePending` says whether it is holding a write, which the debouncer
	 * cannot: Obsidian's `Debouncer` offers `run` and `cancel` and no way to ask.
	 * The one reader is an outside change to the file, which drops a pending
	 * edit rather than writing it and has to know whether there was one to say
	 * so (`discardPending`).
	 */
	private persistSoon = debounce(
		() => {
			this.nudgePending = false;
			void this.persist();
		},
		500,
		true,
	);
	private nudgePending = false;

	constructor(plugin: SheetsmithPlugin, host: LayoutEditorHost) {
		this.plugin = plugin;
		this.host = host;
		// A redraw tears the pane down and builds the function library back from
		// the layout, so anything typed into it has to be read out first or it
		// is gone. Blur is not enough on its own: a pointerdown on the grid
		// calls preventDefault, which suppresses the focus change and with it
		// the textarea's change event, so clicking a block after typing a
		// definition would discard it. Wrapped here rather than guarded at each
		// call site — there are a dozen, and the one that gets missed is the
		// one that loses a library.
		this.redraw = () => {
			this.flush();
			// The control the author is standing in, so the rebuild does not drop
			// them on the body. The focus token is this module's own convention,
			// which is why restoring across a rebuild is this module's job and
			// not the pane's — the pane owns the scroll, which is the half it can
			// see. Only where nothing has already asked: a list field that just
			// added a row wants focus on the row, not on the button that made it.
			this.pendingFocus ??= this.focusedToken();
			host.redraw();
		};
		// What the canvas reads `sampleValues` through, declared out here because a
		// getter cannot be an arrow and `this` inside the object literal below is
		// the host rather than this section.
		const samplesOn = (): boolean => this.sampleValues;
		// Arrow functions throughout, for the reasons `redraw` above states for
		// itself and `persist` states for the `void`: `this.persist` is async and
		// `no-misused-promises` refuses a promise-returning function where a void
		// return is expected, measured rather than assumed — `.bind(this)` there
		// fails lint. The rest are arrows to match, so the block reads as one
		// mapping rather than a mix of two kinds.
		this.canvas = new Canvas({
			persist: () => void this.persist(),
			persistSoon: () => {
				this.nudgePending = true;
				this.persistSoon();
			},
			// Delegated rather than answered here: those four fields are the
			// panel's own, minted under the panel's own token, so finding them
			// again from out here would be this half querying for controls the
			// other half drew.
			syncPositionFields: (config) => this.panel.syncPositionFields(config),
			select: (id) => this.select(id),
			get selection(): string {
				return host.selection;
			},
			// The live answer rather than a copy taken when the canvas was
			// constructed, which is the same rule `selection` above follows.
			get sampleValues(): boolean {
				return samplesOn();
			},
		});
		// The same mapping one region over, and the same reasons for the arrows.
		// `errors` is the exception and deliberately not a getter: the panel is
		// handed the map itself, so both halves write into one map rather than two
		// answering the same question.
		this.panel = new ConfigPanel({
			persist: (rename) => void this.persist(true, rename),
			redraw: () => this.redraw(),
			redrawSchematics: () => this.canvas.redraw(),
			// The canvas reads `layout.columns` itself on every draw, so there is
			// nothing left for this to write — `redrawSchematics` right after it
			// is what actually shows the new count. Kept on `ConfigPanelHost`
			// rather than removed, since `config-panel.ts` is unchanged by this
			// feature and the field still names a real question the panel asks.
			setGridColumns: () => undefined,
			errors: this.fieldErrors,
			listContext: () => this.listContext(),
			suggestNames: (input, owner) => this.suggestNames(input, owner),
		});
		// The row's host, and the same mapping again. `redraw` is the wrapped one
		// above rather than the host's, for the flush and the focus it adds, and
		// the two getters stay live because the trash reads them after a confirm
		// modal rather than when the row was drawn.
		this.fileRow = {
			app: plugin.app,
			get folder(): string {
				return plugin.settings.layoutFolder;
			},
			get layoutFile(): TFile | null {
				return host.layoutFile;
			},
			openLayoutFile: (file) => host.openLayoutFile(file),
			redraw: () => this.redraw(),
		};
	}

	/**
	 * Bind the formula-name suggester to one input, and remember it.
	 *
	 * A command on the host rather than an `App` handed down, so neither the
	 * panel nor the two field modules learns that a suggester exists or needs an
	 * app to build one — the same shape `confirm` already takes for a modal.
	 */
	private suggestNames(input: HTMLInputElement, owner?: string): void {
		this.suggests.push(
			attachFormulaSuggest(
				this.plugin.app,
				input,
				() => this.vocabulary(),
				owner,
			),
		);
	}

	/**
	 * What the layout publishes, read fresh on every query a popup answers.
	 *
	 * A thunk rather than a value, so the list reflects the layout as it now
	 * stands — a column key renamed in the list above is offered by the field
	 * below it without the pane having to rebuild — and so nothing assembles the
	 * name tree on a keystroke that no popup is open for.
	 */
	private vocabulary(): Vocabulary {
		const layout = this.layout;
		if (layout === null) return { components: [], functions: new Map() };
		return {
			components: walkComponents(layout.components).map((entry) =>
				vocabularySource(entry.config, getComponent(entry.config.type)),
			),
			functions: parseFunctions(layout.functions).library,
		};
	}

	/** The focus token of whatever is focused inside the pane, if anything. */
	private focusedToken(): string | null {
		const active = this.rootEl?.ownerDocument.activeElement;
		if (!active?.instanceOf(HTMLElement)) return null;
		if (!this.rootEl?.contains(active)) return null;
		return active.dataset.sheetsmithFocus ?? null;
	}

	/** Write any pending edit now. Called before a redraw, and on tab close. */
	flush(): void {
		// The panel's two textarea fields are read rather than waited on, and
		// either can be holding an edit when the pane closes. Which fields those
		// are is the panel's to know; that they are read before the write is
		// this method's.
		if (this.panel.commitPending()) void this.persist();
		this.persistSoon.run();
	}

	/**
	 * Let go of the loaded layout, so the next render reads it fresh.
	 *
	 * Flushes first, and that order is the whole point of the method: a
	 * pending edit belongs to the layout being released, and `persist` writes
	 * `this.layout` to `this.file`. Clear those first and the commit lands on
	 * an object nothing will ever write, silently.
	 *
	 * **`write` is false for a file that is gone**, and only then: a pending
	 * edit has nowhere to land when the file was deleted underneath the pane,
	 * and writing it would put the file back. The pane's own `onUnloadFile` is
	 * the caller and the one that knows which case it is in.
	 *
	 * The pane calls this on every real change of which file is open — the
	 * dropdown, **New layout**, the trash, a file opened from anywhere Obsidian
	 * opens one, a delete from outside — so this is also where the undo history
	 * is scoped per layout (`docs/features/editor-undo.md`): an author's undo
	 * posture belongs to the file they were editing, and Mod+Z reaching across
	 * a switch to rewrite a *different* layout would be a worse surprise than an
	 * empty stack. A rename is not a change of file and does not come here.
	 */
	release(write = true): void {
		if (write) this.flush();
		else this.discardPending();
		this.forget();
		this.file = null;
	}

	/**
	 * Take the file's new contents rather than what this pane holds, because
	 * something else wrote it (`docs/features/visible-layout-files.md`).
	 *
	 * **A pending edit is dropped, not written.** Writing it would overwrite the
	 * very change the pane has just been told about, which is the lost update
	 * this exists to prevent; so what the reader had not yet committed goes, and
	 * the return value says whether there was any, for the one sentence the pane
	 * shows about it. **Both stacks go too**: a step recorded against the old
	 * contents would restore text nobody on disk ever had.
	 *
	 * The file stays bound, so the next render reads it again.
	 */
	reload(): boolean {
		const dropped = this.discardPending();
		this.forget();
		return dropped;
	}

	/**
	 * Whether `text` is what this pane last wrote or loaded — the test for a
	 * `modify` that is the pane's own write coming back rather than somebody
	 * else's. By content rather than by a "saving" flag, because a flag cannot
	 * tell two quick writes of this pane's apart from one outside write between
	 * them, and content can.
	 */
	holds(text: string): boolean {
		return this.onDisk !== null && text === this.onDisk;
	}

	/** Drop the loaded layout and its history, keeping which file it is. */
	private forget(): void {
		this.layout = null;
		this.onDisk = null;
		this.undoStack.clear();
		this.redoStack.clear();
		// Closed and cleared where the undo history is, which is the same moment:
		// the picker's posture belongs to the layout it was adding to.
		this.picker.reset();
	}

	/**
	 * Throw away whatever edit is still waiting to be written, and say whether
	 * there was one.
	 *
	 * The panel's textareas are read through `commitPending`, which folds what
	 * was typed into `this.layout` — about to be dropped by every caller — so
	 * reading them is how "was anything typed" gets answered without a second
	 * copy of which fields those are.
	 */
	private discardPending(): boolean {
		const typed = this.layout !== null && this.panel.commitPending();
		const nudged = this.nudgePending;
		this.persistSoon.cancel();
		this.nudgePending = false;
		return typed || nudged;
	}

	/**
	 * Every component in the layout, flattened.
	 *
	 * Ids and labels are unique across the whole sheet whatever a component sits
	 * inside — a label still keys a section in a flat note — so anything checking
	 * one has to look here rather than at a single level.
	 */
	private allComponents(): ComponentConfig[] {
		return walkComponents(this.layout?.components ?? []).map(
			(entry) => entry.config,
		);
	}

	/**
	 * Draw the editor into the element it is handed.
	 *
	 * Two regions, and which side a thing goes on is the design's one structural
	 * rule: the left column is everything about *where* — the picker, the grids,
	 * the tree of what the layout holds — and the panel is everything about the
	 * one thing selected. That is what puts nothing between a container's row
	 * and the rows of what it holds, which a form drawn under its own row could
	 * not avoid (`docs/UI.md` §12).
	 */
	async render(container: HTMLElement): Promise<void> {
		// Before anything is drawn or torn down: a popup outlives the input it
		// hangs off, and the pane rebuilds every input it has.
		this.closeSuggests();
		this.rootEl = container;
		// The query container the two-column rule reads, and it has to be an
		// ancestor of the grid rather than the grid itself: an element cannot
		// query its own width.
		container.addClass('sheetsmith-layout-editor-pane');

		const folder = this.plugin.settings.layoutFolder;
		const files = listLayouts(this.plugin.app, folder);
		const open = this.host.layoutFile;

		// Only where there is nothing to show at all. A pane open on a file
		// outside the folder has something to show even when the folder is
		// empty, so it draws the picker with that one file in it.
		if (open === null && files.length === 0) {
			this.renderVacant(container);
			return;
		}

		// The file the pane is bound to, taken as given. Nothing here resolves
		// or corrects it: which file is open is the view's, and a different one
		// is only ever asked for (`LayoutEditorHost`). What this does is notice
		// that the host has moved on, which is also how a first render loads.
		if (this.file !== open) {
			this.forget();
			this.file = open;
		}

		const grid = container.createDiv('sheetsmith-layout-editor');
		// The left column exists from here, because the picker goes in it and the
		// picker is how an author leaves a layout they cannot edit. **The panel
		// does not**, and that is the point rather than an ordering accident:
		// every path that gives up below draws its message here and returns, and
		// a panel created in advance would leave the two-column rule reserving
		// 620px of empty pane beside one line of error text. The rule is keyed on
		// the panel being there, so not drawing one is the whole of the fix.
		const outline = grid.createDiv('sheetsmith-editor-outline');
		this.regions = null;

		renderLayoutFileRow(outline, files, this.fileRow);
		if (open === null) return;

		if (this.layout === null) {
			const run = ++this.renderId;
			let source: string;
			try {
				source = await this.plugin.app.vault.read(open);
			} catch (error) {
				if (run !== this.renderId || this.file !== open) return;
				// Where the tree would be, under the picker rather than over it.
				// The order is load bearing: the picker is how an author leaves a
				// layout they cannot edit, so a message that displaced it would
				// trap them on the broken one.
				outline.createDiv('sheetsmith-error', (el) =>
					el.setText(
						`"${open.basename}" cannot be read: ${error instanceof Error ? error.message : String(error)}`,
					),
				);
				return;
			}
			// A redraw may have rebuilt the pane while the read was in flight,
			// or the pane moved to another file; only the newest run, still on
			// the file it read, may append.
			if (run !== this.renderId || this.file !== open) return;
			try {
				this.layout = parseLayout(source);
			} catch (error) {
				this.layout = null;
				// Named, because the pane now opens on whatever file the reader
				// clicked, from anywhere Obsidian opens one — so "this layout"
				// could be a file they did not know was one. Nothing is written
				// in this state: `persist` returns without a parsed layout, and
				// what recovers the pane is the view's reload on an outside fix.
				outline.createDiv('sheetsmith-error', (el) =>
					el.setText(
						`"${open.basename}" cannot be edited until its file is fixed: ${error instanceof Error ? error.message : String(error)}`,
					),
				);
				return;
			}
			// The undo baseline for this freshly loaded layout. Constraint 3
			// makes `source` itself safe to use rather than re-serialising: a
			// parse then serialise with nothing changed is byte-identical.
			this.onDisk = source;
		}
		const layout = this.layout;

		// Past every giving-up path, so this is where the second column earns its
		// track.
		const panel = grid.createDiv('sheetsmith-editor-panel');
		// What the two-column rule keys on. It used to read
		// `:has(> .sheetsmith-editor-panel)`, which was true by construction and
		// needed nobody to remember this line; the class is the same fact stamped
		// by hand, and it is stamped *here* — the one statement that creates a
		// panel — so the two cannot disagree without this line being deleted.
		grid.addClass('sheetsmith-editor-split');
		this.regions = { outline, panel };

		// A selection naming nothing falls back to the layout's own settings,
		// never to the first component: landing an author in a form nobody chose
		// is the failure the reset binding's dropdown already guards against.
		const selected = this.selectedEntry(layout);
		if (selected === null && this.host.selection !== SHEET_DESTINATION) {
			this.host.setSelection(SHEET_DESTINATION);
		}

		// Above the canvas it governs and under the picker, which is where the
		// pane's other two `Setting` rows sit — and only once there is a canvas
		// for it to govern, so the row never stands over the two states that
		// draw no layout at all.
		this.renderSampleRow(outline);
		// The canvas draws the whole tree live, in one pass, whatever is
		// selected — `docs/features/grid-canvas.md` §4 retires the old
		// selection-gated schematic here.
		this.canvas.draw(outline.createDiv(), layout);
		// Above the tree it adds into, not below it: a layout with a long
		// component list otherwise buries the one row that can grow it.
		this.picker.render(outline, layout, {
			insert: (choice, into) => this.insert(layout, choice, into),
			focusAfterRedraw: (token) => {
				this.pendingFocus = token;
			},
			redraw: () => this.redraw(),
		});
		renderTree(outline, layout, {
			persist: () => void this.persist(),
			redraw: () => this.redraw(),
			select: (id) => this.select(id),
			// A snapshot rather than a live getter: every reader of this host
			// is either synchronous within this one render (the rows'
			// selected mark) or a later command with nothing to do with
			// selection, so there is no stale copy for a getter to avoid.
			selection: this.host.selection,
			confirm: (message, cta, onConfirm) =>
				new ConfirmModal(this.plugin.app, message, cta, onConfirm).open(),
			drag: this.treeDrag,
		});

		this.panel.render(panel, layout, selected);

		this.restoreFieldErrors(container);

		if (this.pendingFlash !== null) {
			this.flash(panel, this.pendingFlash);
			this.pendingFlash = null;
		}

		if (this.pendingFocus !== null) {
			focusToken(container, this.pendingFocus);
			this.pendingFocus = null;
		}
	}

	/**
	 * The vault holds no layouts yet, which is the one state with no tree and no
	 * panel to draw.
	 *
	 * Centred on the pane rather than left as a row in the top-left corner. In a
	 * settings tab a row is what everything else looks like; on a surface of its
	 * own it is one line stranded in an empty rectangle.
	 */
	private renderVacant(container: HTMLElement): void {
		container.createDiv('sheetsmith-editor-vacant', (vacant) => {
			vacant.createDiv({
				cls: 'setting-item-description',
				text: 'No layouts yet.',
			});
			new ButtonComponent(vacant)
				// The same gesture and the same words as the row's button, which
				// is what makes the modal's **Start from** row the one place
				// cold-start import is reachable from. A CTA here, unlike on the
				// row, because here it is the only thing on screen.
				.setButtonText(NEW_LAYOUT_LABEL)
				.setCta()
				.onClick(() => promptForNewLayout(this.fileRow));
		});
	}

	/**
	 * The walk entry for the selected component, or null where the layout itself
	 * is selected — and also where the selection names a component the layout no
	 * longer holds, which reads the same way and is corrected by the caller.
	 */
	private selectedEntry(layout: Layout): WalkEntry | null {
		if (this.host.selection === SHEET_DESTINATION) return null;
		return (
			walkComponents(layout.components).find(
				(entry) => entry.config.id === this.host.selection,
			) ?? null
		);
	}

	/**
	 * Close every name-suggestion popup the last render bound, and forget them.
	 *
	 * **`close()` rather than waiting for a `blur`**, which is the whole reason
	 * this exists: a focused element that is *removed* fires no `blur`, so a
	 * redraw driven from the keyboard — **Undo layout edit** with a list up —
	 * would leave the popup at the notice layer over a pane that no longer holds
	 * the field it describes. The platform's class offers no teardown, and
	 * `close()` is a declared public member of `PopoverSuggest` and idempotent.
	 */
	private closeSuggests(): void {
		for (const suggest of this.suggests) suggest.close();
		this.suggests = [];
	}

	/**
	 * Put back the inline errors whose field is still on screen, and forget
	 * the ones whose field is gone — a message about a control that no longer
	 * exists is worse than no message.
	 */
	private restoreFieldErrors(container: HTMLElement): void {
		if (this.fieldErrors.size === 0) return;
		for (const [token, message] of [...this.fieldErrors]) {
			const input = container.querySelector(
				`[data-sheetsmith-focus="${CSS.escape(token)}"]`,
			);
			if (input?.instanceOf(HTMLInputElement)) {
				showFieldError(input, message, this.fieldErrors);
			} else {
				this.fieldErrors.delete(token);
			}
		}
	}

	/**
	 * The **Sample values** row: whether the canvas is filled or empty
	 * (`docs/features/preview-sample-values.md` §3).
	 *
	 * **A row of the pane's own chrome, not a field in the configuration
	 * panel**, even though the Layout row's panel is where a layout's own
	 * settings live: everything in that panel writes the layout file, and this
	 * writes nothing. A view-state switch among fields that persist is a
	 * confusion worth one row of chrome to avoid.
	 *
	 * Toggling redraws the canvas and nothing else — no `persist`, so no undo
	 * step, and the tree's selection, the panel's fields and the scroll position
	 * all survive it. The focus token is what puts an author back on this control
	 * when a full pane redraw happens for some other reason.
	 */
	private renderSampleRow(container: HTMLElement): void {
		new Setting(container)
			.setName('Sample values')
			// The second sentence is the one worth having: the first thing a
			// cautious author wonders on seeing numbers appear is whose they are.
			.setDesc(
				'Draw the canvas with example values instead of an empty character\'s. Nothing is written to any note.',
			)
			.addToggle((toggle) => {
				toggle.setValue(this.sampleValues);
				toggle.toggleEl.dataset.sheetsmithFocus = 'sample-values';
				toggle.onChange((value) => {
					this.sampleValues = value;
					this.canvas.redraw();
				});
			});
	}

	/**
	 * Mark a region the last interaction rebuilt, and let the mark fade.
	 * Colour only, so there is nothing here for reduced motion to strip.
	 */
	private flash(scope: HTMLElement, token: string): void {
		const el = scope.querySelector(
			`[data-sheetsmith-flash="${CSS.escape(token)}"]`,
		);
		if (!el?.instanceOf(HTMLElement)) return;
		el.addClass('sheetsmith-flash');
		el.win.setTimeout(() => el.removeClass('sheetsmith-flash'), FLASH_HOLD);
	}

	/**
	 * Put the component a picker line describes into the layout, select it and
	 * persist; the picker redraws once it has written its report. Returns the
	 * label the component was given.
	 *
	 * Moved out of the old **Add** button without changing what it writes
	 * (`docs/features/component-picker.md` §7): a bare type writes `config: {}`
	 * and never its `example`, which is why the picker labels an example.
	 */
	private insert(
		layout: Layout,
		choice: PickerChoice,
		parent: ComponentConfig | null,
	): string {
		// `children` is shared config the editor owns, so this is where a
		// container becomes one: a component holds the key only once something
		// has been put in it.
		const list = parent === null ? layout.components : (parent.children ??= []);
		// Checked against the whole sheet, not this list: a label keys a note
		// section and an id is what a formula writes, and containment scopes
		// neither.
		const all = this.allComponents();
		// The line's own name, so an author who chose "Checkbox" has a component
		// called Checkbox until they rename it.
		const label = uniqueLabel(choice.name, all);
		// A tab has no placement, so the numbers written here are not read by
		// anything — but they are still in the file, and a hand-editor reading
		// `row: 4` on a tab would reasonably conclude it sits somewhere. The
		// container's own size is the honest thing to write: it is the box the
		// tab actually fills. `parsePosition` requires all four, which is why this
		// is a sensible value rather than no key.
		//
		// It goes stale the moment the container is resized, and nothing keeps it
		// in step on purpose: every drawing asks `innerPlacement` for the live box
		// instead. Do not add a sync — reading this number was the bug, not
		// writing it.
		list.push({
			// The prefill first, so nothing an entry carries can displace what the
			// editor owns. The type forbids those keys outright; this is the spread
			// order that makes the refusal true at runtime as well.
			...choice.config,
			id: uniqueId(label, all),
			type: choice.type,
			label,
			position: childIsPlaced(parent)
				? {
						col: 1,
						row: nextFreeRow(list),
						// Never wider than the grid it lands on. A child spanning
						// past its container's last column would open an implicit
						// column and take the alignment with it.
						width: Math.min(2, parent?.position.width ?? 2),
						height: 1,
					}
				: { ...(parent as ComponentConfig).position, col: 1, row: 1 },
		});
		const added = list[list.length - 1]?.id;
		if (added !== undefined) this.host.setSelection(added);
		void this.persist();
		return label;
	}

	/** Select a component, or the layout itself, and rebuild both regions. */
	private select(id: string): void {
		// Pressing what is already selected does nothing at all, rather than
		// rebuilding what is already on screen. Deselecting to nowhere would
		// leave the panel empty and nothing is the wrong thing to configure; and
		// a redraw for no change would throw away a half-typed field and put the
		// focus back where it was for the sake of it.
		if (this.host.selection === id) return;
		this.host.setSelection(id);
		this.redraw();
	}

	/** What the list editors in list-fields.ts need from this editor. */
	private listContext(): ListContext {
		return {
			persist: (rename) => void this.persist(true, rename),
			redraw: () => this.redraw(),
			focusAfterRedraw: (token) => {
				this.pendingFocus = token;
			},
			flashAfterRedraw: (token) => {
				this.pendingFlash = token;
			},
			confirm: (message, cta, onConfirm) =>
				new ConfirmModal(this.plugin.app, message, cta, onConfirm).open(),
			errors: this.fieldErrors,
			drag: this.drag,
			suggestNames: (input, owner) => this.suggestNames(input, owner),
		};
	}

	/**
	 * Validate and write the layout, then refresh open sheet views. Invalid
	 * states stay in memory with a notice and are written once corrected.
	 *
	 * `record` is the only thing that separates an author's own edit from an
	 * undo or a redo replaying one: every ordinary call site keeps calling
	 * this with no argument, so `true` is what a mutation has always meant,
	 * and `undo`/`redo` below are the only two callers that pass `false`. A
	 * `record` write pushes what the file held *before* this write onto the
	 * undo stack and clears the redo stack — the standard rule that a fresh
	 * edit forgets whatever a redo could have replayed — but only where the
	 * write actually changes a byte: opening a form calls this on the way
	 * past nothing that changed it, and a step that did nothing is not a step
	 * to undo. An `undo`/`redo` write skips both, because the caller already
	 * did its own push onto the *other* stack before calling this.
	 *
	 * `rename` is the one thing every other caller omits: a label or a
	 * declared-key commit's own old and new value, captured at the moment it
	 * committed. **The layout lands first, always** — the write above is the
	 * whole of this method's existing body, untouched by this parameter — and
	 * the migration begins only once it has resolved
	 * (`docs/features/component-rename-migration.md`). A layout write that
	 * throws returns above and never reaches this, so a rename never touches a
	 * single character note when the layout itself could not be saved.
	 *
	 * **Ahead of the re-render, and that ordering is correctness rather than
	 * preference.** Nothing in `src/view/` registers a vault event *of its own* —
	 * the base `TextFileView` does, which is what makes a dirty sheet safe to
	 * leave alone — so a refresh run before the scan re-renders an open sheet
	 * from text the migration has not written yet, drawing the renamed component
	 * off a heading the layout no longer names, blank, until the reader
	 * navigated away and back. The cost is that the render waits for the scan;
	 * one rename gesture is one scan, because every commit here is on `change`
	 * and never per keystroke (`field-commit.ts`).
	 *
	 * **A rename migrates only where the file is the one its name resolves
	 * to.** The notes a migration rewrites are the notes naming this file's
	 * basename, and those notes read *this* file only where the folder's lookup
	 * lands on it. A file opened from outside the folder, or a `.json` a
	 * `.sheetsmith` of the same name shadows, shares its basename with a
	 * different layout or with none — so migrating from it would rewrite
	 * characters built on some other file, which is Constraint 4 broken by an
	 * edit to a file those characters never read. The layout still saves; the
	 * notes are left alone, as they are for any edit to a file nobody uses.
	 */
	private async persist(record = true, rename?: RenameIntent): Promise<void> {
		// Taken once, before the write is awaited: the pane may be on another
		// file by the time it resolves, and the migration below belongs to the
		// file this write went to.
		const file = this.file;
		if (!file || !this.layout) return;
		let serialised: string;
		try {
			serialised = serialiseLayout(this.layout);
			parseLayout(serialised);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
			return;
		}
		if (record && serialised !== this.onDisk) {
			if (this.onDisk !== null) this.undoStack.push(this.onDisk);
			this.redoStack.clear();
		}
		this.onDisk = serialised;
		// `modify`, not `process`, and the only one left in `src/`. A `process`
		// callback is handed the file's current contents so that the new ones can
		// be derived from them, and there is nothing to derive here: `serialised`
		// is a whole-file snapshot of what this pane holds in memory. The callback
		// would ignore its argument, which makes the call a lock wearing a
		// read-modify-write's clothes, and it would still overwrite another
		// writer exactly as this does. Worse, it would read as if `this.onDisk`
		// had been reconciled with the file when it cannot be. `layouts.ts` is
		// the site that genuinely derives, and it converted.
		/*
		 * **Reported, not thrown.** `persist` is called as `void this.persist(…)`
		 * from every field's commit, so a rejection here had nowhere to go: the
		 * author was told nothing and the app got an unhandled rejection. That
		 * was inconsistent with the branch a dozen lines up, where a layout that
		 * will not serialise announces itself — the same failure to save, from
		 * the author's side, reported in one case and silent in the other.
		 *
		 * Returning is what the rename path needs as much as the message is: the
		 * migration must not run when the layout it is migrating *to* is not on
		 * disk, which is this method's own first promise and Acceptance criterion
		 * 9 in `docs/features/component-rename-migration.md`. `onDisk` is left
		 * holding the text that was not written, which is the pre-existing
		 * behaviour of this method and not something this guard changes.
		 */
		try {
			await this.plugin.app.vault.modify(file, serialised);
		} catch (error) {
			new Notice(
				`Sheetsmith could not save this layout: ${error instanceof Error ? error.message : String(error)}`,
			);
			return;
		}
		if (
			rename !== undefined &&
			isResolvedLayout(
				this.plugin.app,
				this.plugin.settings.layoutFolder,
				file,
			)
		) {
			/*
			 * **The scan is bracketed by the open sheets, and both halves are
			 * corrections rather than care.** A sheet's own edits reach disk
			 * through Obsidian's two-second `requestSave` debounce, and nothing
			 * in `src/view/` registers a vault event, so without this bracket
			 * one rename gesture produced the whole of the owner's report: the
			 * value typed seconds earlier was still only in the view, so the
			 * scan found no section, migrated nothing and said nothing — no
			 * `Notice` at all — and then the pending write landed the old
			 * heading on disk under a layout that no longer named it, leaving
			 * the card blank with its value still in the file.
			 *
			 * `reloadSheets` is the return half and stands in for
			 * `refreshSheets` on this path: it renders, and it renders from
			 * what the migration actually wrote. Refreshing instead drew the
			 * renamed component off the stale text — blank — and left
			 * `getViewData` holding the pre-rename heading, so the next edit on
			 * that sheet, or closing it, wrote the migration back out.
			 */
			await this.host.flushSheets();
			await reportComponentRename(this.plugin.app, file.basename, rename);
			await this.host.reloadSheets();
			return;
		}
		this.host.refreshSheets();
	}

	/**
	 * Put the layout back to a snapshot popped off an undo or a redo stack.
	 *
	 * Re-parses rather than diffing, on the same argument the mechanism as a
	 * whole rests on (`docs/features/editor-undo.md`): a whole-file snapshot
	 * restores everything a multi-part mutation touched by construction. The
	 * write goes through `persist(false)`, so this does not itself touch
	 * either stack — the caller already pushed what it is leaving onto the
	 * other one.
	 *
	 * The selection fallback the feature promises needs no code of its own:
	 * `render`'s existing rule already corrects `host.selection` to
	 * `SHEET_DESTINATION` whenever it names a component the current
	 * `this.layout` does not hold, and that rule runs on every redraw
	 * regardless of why `this.layout` changed.
	 */
	private restoreSnapshot(snapshot: string): void {
		this.layout = parseLayout(snapshot);
		this.redraw();
		void this.persist(false);
	}

	/**
	 * Undo the most recent recorded mutation. Returns whether there was one.
	 */
	undo(): boolean {
		const snapshot = this.undoStack.pop();
		if (snapshot === undefined || !this.file) return false;
		if (this.onDisk !== null) this.redoStack.push(this.onDisk);
		this.restoreSnapshot(snapshot);
		return true;
	}

	/**
	 * Redo the most recently undone mutation. Returns whether there was one.
	 */
	redo(): boolean {
		const snapshot = this.redoStack.pop();
		if (snapshot === undefined || !this.file) return false;
		if (this.onDisk !== null) this.undoStack.push(this.onDisk);
		this.restoreSnapshot(snapshot);
		return true;
	}
}

function uniqueLabel(base: string, components: ComponentConfig[]): string {
	const taken = new Set(components.map((c) => c.label));
	let label = base;
	let counter = 2;
	while (taken.has(label)) label = `${base} ${counter++}`;
	return label;
}

/**
 * The id is what formulas reference, so it has to be a name the expression
 * parser accepts: underscores rather than hyphens, since a hyphen would read
 * as subtraction, and never a leading digit. Kept in step with COMPONENT_ID
 * in parse/layout.ts, which migrates anything this could not have produced —
 * including the hyphenated ids this function itself emitted before the clash
 * with the parser was understood.
 */
function uniqueId(label: string, components: ComponentConfig[]): string {
	const taken = new Set(components.map((c) => c.id));
	let base =
		label
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '') || 'component';
	if (/^[0-9]/.test(base)) base = `_${base}`;
	let id = base;
	let counter = 2;
	while (taken.has(id)) id = `${base}_${counter++}`;
	return id;
}

