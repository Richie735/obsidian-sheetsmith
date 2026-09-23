/*
 * The layout editor's own pane.
 *
 * A main-area leaf rather than a sidebar, and rather than the settings tab the
 * editor used to live in: an authoring tool needs width, and a sheet has to be
 * able to sit beside it in a split, which is SPEC §7's own reason for the view.
 *
 * What this owns is the pane. Every region inside it, every form and every field
 * belong to `src/editor/`, and this builds none of them. What is left is the
 * frame: which layout file is open, what is selected, what survives a redraw,
 * the hop into open sheet views after a write, and what the vault tells it
 * about its own file.
 *
 * **A `FileView`, bound to one layout file** (`docs/features/visible-layout-files.md`).
 * A `.sheetsmith` file opens here from anywhere Obsidian opens a file, because
 * `layout-extension.ts` registers the extension for this view type; the pane's
 * own dropdown opens one in the same leaf through `setViewState`, which is also
 * the only route to a `.json` layout, since that extension is not registered.
 * Rename and delete are the base class's: it keeps the `TFile`, whose path
 * moves, and lets go of a file that is gone.
 */

import {
	FileView,
	Notice,
	TAbstractFile,
	TFile,
	ViewStateResult,
	WorkspaceLeaf,
} from 'obsidian';
import {
	LayoutEditorHost,
	LayoutEditorSection,
	SHEET_DESTINATION,
} from '../editor/layout-editor';
import { isLayoutExtension, layoutFileFor, listLayouts } from '../layouts';
import type SheetsmithPlugin from '../main';
import { openSheetViews } from './sheet-view';

export const VIEW_TYPE_LAYOUT_EDITOR = 'sheetsmith-layout-editor';

/** The pane's two independently scrolling regions (`layout-editor.ts`'s own
 * classes on the two halves of its split), and nowhere else — `contentEl`
 * holds them side by side and never overflows itself. */
const OUTLINE_SELECTOR = '.sheetsmith-editor-outline';
const PANEL_SELECTOR = '.sheetsmith-editor-panel';

/** Where the pane is scrolled to, one number per region. */
interface ScrollPositions {
	outline: number;
	panel: number;
}

export class LayoutEditorView extends FileView implements LayoutEditorHost {
	private plugin: SheetsmithPlugin;
	private editor: LayoutEditorSection;
	/**
	 * The element the editor last rendered into.
	 *
	 * Held so a render that awaited a vault read and came back after a newer one
	 * can tell it is stale, and so the scroll restore below only applies to the
	 * render it was measured for. Null before the first render, which is also
	 * what says a state change has nothing to redraw yet.
	 */
	private root: HTMLElement | null = null;
	/**
	 * The file the editor is handed, which is `file` except while the base
	 * class is between two files.
	 *
	 * A second field because of one ordering in `FileView`: it calls
	 * `onUnloadFile` for the file being left *before* it clears `file`, so a
	 * redraw from there would draw the file being let go of. This is cleared
	 * first, so a pane whose file was deleted draws the no-file state from inside
	 * the unload, and set again as the next file loads.
	 */
	private bound: TFile | null = null;
	/** Set while the pane closes, so letting go of its file draws nothing. */
	private closing = false;
	/** What the panel is configuring. Ephemeral state. */
	private selected: string = SHEET_DESTINATION;
	/**
	 * The containers the tree draws shut. State rather than ephemeral state,
	 * unlike the selection, because a restored workspace should come back folded
	 * the way the author left it (`docs/features/layout-editor-tree.md` §4).
	 */
	private folded = new Set<string>();

	/*
	 * `navigation` is left at `FileView`'s own `true`, which is a decision with a
	 * cost rather than a default taken. It is what lets Obsidian treat this leaf
	 * as one a file open may replace, which is how a layout clicked in the file
	 * explorer lands in the pane already showing one. The cost: a *note* clicked
	 * while this pane is the active tab replaces the pane, as it would replace a
	 * note. Pinning the tab keeps it, as it does for any file.
	 */

	/** No file at all is a state this pane has: the vacant folder, or a delete. */
	allowNoFile = true;

	constructor(leaf: WorkspaceLeaf, plugin: SheetsmithPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.editor = new LayoutEditorSection(plugin, this);
	}

	getViewType(): string {
		return VIEW_TYPE_LAYOUT_EDITOR;
	}

	/**
	 * The file's basename, which Obsidian shows in the tab and the header.
	 *
	 * The basename is the layout's name as far as anything here is concerned —
	 * it is what a note's `sheet-layout` holds — so it is the title, and the
	 * `pencil-ruler` icon is what still says which kind of pane this is.
	 */
	getDisplayText(): string {
		return this.file?.basename ?? 'Layout editor';
	}

	/**
	 * Both layout extensions, so the one route to a `.json` layout — this pane's
	 * dropdown, by path — is not refused. Only `.sheetsmith` is registered, so
	 * nothing else in the app opens a `.json` file here.
	 */
	canAcceptExtension(extension: string): boolean {
		return isLayoutExtension(extension);
	}

	onload(): void {
		super.onload();
		// The file's own writes, so a change made anywhere else — another pane
		// on the same layout, a promotion from a sheet, a hand edit — is taken
		// rather than overwritten. `FileView` owns no `modify` handler;
		// `TextFileView` does, and this pane is not one: it writes immediately
		// where that class buffers.
		this.registerEvent(
			this.app.vault.on('modify', (file) => void this.onModify(file)),
		);
	}

	getIcon(): string {
		return 'pencil-ruler';
	}

	async onOpen(): Promise<void> {
		this.redraw();
	}

	/**
	 * The base class lets go of the file, which is where the last edit is
	 * written: `onUnloadFile` flushes, and `closing` keeps it from drawing into
	 * a pane that is going.
	 */
	async onClose(): Promise<void> {
		this.closing = true;
		await super.onClose();
	}

	/** Draw the layout this pane has just been bound to. */
	async onLoadFile(file: TFile): Promise<void> {
		this.bound = file;
		this.redraw();
	}

	/**
	 * Let go of a layout: its pending edit written where the file is still
	 * there, dropped where it is gone, and its undo history cleared either way
	 * (the editor's `release`, which used to run on a name change and now runs
	 * on a file change).
	 *
	 * **Whether the file is gone is asked of the vault**, because the base class
	 * calls this for a switch, a close and a delete alike and says nothing about
	 * which. A write to a deleted file would put it back.
	 *
	 * It redraws, which for a switch is a render the next file's load replaces
	 * at once — both inside one turn, before anything paints — and for a delete
	 * is the "No layout is open" state, which nothing else would draw.
	 */
	async onUnloadFile(file: TFile): Promise<void> {
		const present = this.app.vault.getAbstractFileByPath(file.path) === file;
		this.editor.release(present);
		this.bound = null;
		if (!this.closing) this.redraw();
	}

	/**
	 * The title follows through the base class; the redraw is what moves the
	 * "no character can use it" line, since moving a file in or out of the
	 * folder is a rename. The undo history survives: the contents did not change.
	 */
	async onRename(file: TFile): Promise<void> {
		await super.onRename(file);
		if (file === this.bound) this.redraw();
	}

	/**
	 * A write to this pane's file, from here or from anywhere
	 * (`docs/features/visible-layout-files.md`).
	 *
	 * **Its own writes are told apart by content.** The file is read and compared
	 * with what the pane last wrote or loaded; a match is this pane's write
	 * coming back, including one that landed out of order, and changes nothing.
	 * A difference is somebody else's, and the pane reloads from disk — dropping
	 * any edit it had not yet written, and saying so, because writing it would
	 * overwrite the change it has just been told about. Two panes on one layout
	 * follow with no special case: each writes, and each reloads on the other's.
	 */
	private async onModify(file: TAbstractFile): Promise<void> {
		const bound = this.bound;
		if (bound === null || file !== bound) return;
		let text: string;
		try {
			text = await this.app.vault.read(bound);
		} catch {
			// Gone between the write and this read; the delete handles it.
			return;
		}
		if (this.bound !== bound || this.editor.holds(text)) return;
		const dropped = this.editor.reload();
		if (dropped) {
			new Notice(
				`"${bound.basename}" changed on disk, so the layout editor reloaded it. An edit not yet saved here was dropped.`,
			);
		}
		this.redraw();
	}

	/**
	 * Write anything the editor still has pending.
	 *
	 * Public because closing the pane is not the only thing that takes it out of
	 * the author's hands: the editor commits through a debounce, so anything that
	 * stops driving the pane has to be able to land the last edit. The settings
	 * tab said the same thing from `hide`.
	 */
	flush(): void {
		this.editor.flush();
	}

	/**
	 * Undo or redo the most recent mutation the editor recorded.
	 *
	 * Both delegate straight to `LayoutEditorSection`, which owns the two
	 * stacks and what a snapshot means; this only gives the pane's own
	 * commands (`docs/features/editor-undo.md`) something on the view to call,
	 * the same shape `flush` above already has. Each returns whether it
	 * actually undid or redid something, which is what a command uses to
	 * decide whether its own feedback fires.
	 */
	undo(): boolean {
		return this.editor.undo();
	}

	redo(): boolean {
		return this.editor.redo();
	}

	/* --- What the editor asks of its host ------------------------------- */

	get layoutFile(): TFile | null {
		return this.bound;
	}

	/**
	 * Open another layout file in this leaf, through the workspace rather than
	 * by loading it here.
	 *
	 * `setViewState` with this view's own type keeps this instance and hands it
	 * `{ file }`, which the base class loads — so the switch goes through exactly
	 * the path a file opened from anywhere else takes, unload and all. Not
	 * `openFile`, which resolves a view by extension and finds none for `.json`.
	 */
	openLayoutFile(file: TFile): void {
		void this.leaf.setViewState({
			type: VIEW_TYPE_LAYOUT_EDITOR,
			state: { file: file.path },
		});
	}

	get selection(): string {
		return this.selected;
	}

	setSelection(id: string): void {
		this.selected = id;
	}

	get collapsed(): ReadonlySet<string> {
		return this.folded;
	}

	/**
	 * Remember which containers are shut, and ask the workspace to save.
	 *
	 * The save is asked for here rather than left to the next layout change,
	 * because a fold is the whole of what changed: nothing else about the
	 * workspace moves when a chevron is pressed, so without the request a fold
	 * made just before quitting would not come back. Only where the set actually
	 * changed, since the tree also calls this from inside a render to drop an id
	 * the layout no longer holds, and a render is not an edit to the workspace.
	 */
	setCollapsed(ids: Iterable<string>): void {
		const next = new Set(ids);
		if (sameIds(next, this.folded)) return;
		this.folded = next;
		this.app.workspace.requestSaveLayout();
	}

	/**
	 * Refresh every open sheet view, after the editor has written the layout.
	 *
	 * The hop the editor used to make for itself, which had `src/editor/`
	 * importing `SheetView` — the editor layer reaching into the view layer
	 * (`docs/PATTERNS.md` §2). With a view in the picture it belongs here, and
	 * the shape is the one `ListContext` already uses: the editor asks, the host
	 * does it.
	 */
	refreshSheets(): void {
		for (const sheet of openSheetViews(this.app)) sheet.refresh();
	}

	/**
	 * Every open sheet writes what it holds, before the editor rewrites notes.
	 *
	 * Sequential rather than `Promise.all`: these are vault writes, and the
	 * migration that follows reads every one of the same files. The count is the
	 * number of sheets a reader has on screen.
	 */
	async flushSheets(): Promise<void> {
		for (const sheet of openSheetViews(this.app)) await sheet.flushSave();
	}

	/** Every open sheet re-reads its file, after the editor rewrote notes. */
	async reloadSheets(): Promise<void> {
		for (const sheet of openSheetViews(this.app)) await sheet.reload();
	}

	/**
	 * Where the pane is scrolled to, as the two regions that actually overflow
	 * — never `contentEl` itself, which merely holds them and is never taller
	 * than the leaf (`redraw`'s own note explains why that distinction is the
	 * whole bug this shape exists to avoid repeating).
	 */
	private readScroll(): ScrollPositions {
		return {
			outline: this.root?.querySelector(OUTLINE_SELECTOR)?.scrollTop ?? 0,
			panel: this.root?.querySelector(PANEL_SELECTOR)?.scrollTop ?? 0,
		};
	}

	/**
	 * Rebuild the pane from the layout as it now stands.
	 *
	 * The scroll position is restored across it, which is the pane's job and not
	 * the editor's for the reason it was the settings tab's: whoever tears the
	 * DOM down owns what survives. Focus is the other half and stays with the
	 * editor, which owns the focus-token convention every control there follows.
	 *
	 * **Two positions, not one.** `contentEl` holds the outline and the panel
	 * side by side and never overflows itself — `.sheetsmith-editor-outline` and
	 * `.sheetsmith-editor-panel` are what actually scroll, independently, since
	 * the pane split into two columns. A single `contentEl.scrollTop` measured
	 * a number that was always zero, so every edit committed from wherever the
	 * panel had scrolled to (`docs/features/`'s editor split) silently reset it
	 * to the top — reachable because nothing asserted the pane keeps its
	 * position, the gap `layout-editor-view.test.ts`'s scroll cases now close.
	 *
	 * A fresh root each time rather than emptying the old one, so a render that
	 * comes back after a newer one has an orphan to append into rather than the
	 * live pane.
	 *
	 * `scrollTo` defaults to wherever the pane is now, which is what every
	 * ordinary redraw wants. It is a parameter rather than something a caller
	 * arranges afterwards because there can only be one restore: a caller
	 * assigning scroll around this call assigns it to a pane that has just been
	 * emptied, so it clamps toward zero, and the deferred restore below then
	 * overwrites whatever survived. Anything with a position in mind hands it in
	 * here.
	 */
	redraw(scrollTo: ScrollPositions = this.readScroll()): void {
		this.contentEl.empty();
		const root = this.contentEl.createDiv();
		this.root = root;
		void this.editor.render(root).then(() => {
			// Restored only after the editor has appended: a still-short region
			// clamps the position back toward zero.
			if (this.root !== root) return;
			const outline = root.querySelector(OUTLINE_SELECTOR);
			if (outline) outline.scrollTop = scrollTo.outline;
			const panel = root.querySelector(PANEL_SELECTOR);
			if (panel) panel.scrollTop = scrollTo.panel;
		});
	}

	/* --- Posture the workspace remembers ------------------------------- */

	/**
	 * `FileView`'s own, `{ file: <path> }`, plus the containers the tree draws
	 * shut: the two pieces of posture that reopening without would read as a
	 * bug. What is *selected* is deliberately not in it: see
	 * `getEphemeralState`.
	 *
	 * `collapsed` is sorted, so a workspace file does not churn with the order the
	 * chevrons happened to be pressed in, and left out when nothing is shut, so a
	 * pane that never folded anything saves exactly what it saved before this
	 * existed.
	 */
	getState(): Record<string, unknown> {
		const state = super.getState();
		if (this.folded.size > 0) state.collapsed = [...this.folded].sort();
		return state;
	}

	/**
	 * `FileView`'s own, after one translation: the shape an earlier version
	 * saved.
	 *
	 * That was `{ layout: <basename> }`, so a workspace saved before this pane
	 * was bound to a file reopens on the same layout by resolving the name the
	 * way a character does — `.sheetsmith` first, then `.json`. A name resolving
	 * to nothing leaves the pane with no file rather than picking one. A state
	 * naming neither — which is what revealing the pane looks like — changes
	 * nothing, which is the base class's own rule for a state with no `file`.
	 */
	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const given = (state ?? {}) as Record<string, unknown>;
		const legacy = given.layout;
		if (!('file' in given) && typeof legacy === 'string') {
			const file = layoutFileFor(
				this.app,
				this.plugin.settings.layoutFolder,
				legacy,
			);
			const translated = { ...given, file: file?.path ?? null };
			this.takeCollapsed(translated);
			await super.setState(translated, result);
			return;
		}
		this.takeCollapsed(given);
		await super.setState(state, result);
	}

	/**
	 * Adopt the folds a state carries, **before** the base class loads the file
	 * it names, since loading draws and the first draw has to read them.
	 *
	 * **Per file**, which is the decision here: a state naming a different file
	 * from the one open replaces the set with whatever it carries, and that is
	 * nothing when it carries no key — the dropdown's own `{ file }` among them.
	 * An id like `abilities` means a different container in a different layout,
	 * which is the undo stack's reason for clearing at the same moment. Anything
	 * but an array of strings is ignored, as a malformed workspace file should be.
	 *
	 * A state for the file already open adopts a well-formed set and redraws, and
	 * leaves the folds alone otherwise: that is what revealing the pane sends.
	 */
	private takeCollapsed(given: Record<string, unknown>): void {
		const raw = given.collapsed;
		const carried =
			Array.isArray(raw) && raw.every((id) => typeof id === 'string')
				? raw
				: null;
		const names = 'file' in given;
		const path = typeof given.file === 'string' ? given.file : null;
		const another = names && path !== (this.file?.path ?? null);
		if (another) {
			this.folded = new Set(carried ?? []);
			return;
		}
		if (carried === null) return;
		const next = new Set(carried);
		if (sameIds(next, this.folded)) return;
		this.folded = next;
		if (this.root !== null) this.redraw();
	}

	/**
	 * What is selected, and where the reader had scrolled to.
	 *
	 * Ephemeral rather than state, because a restored workspace does not replay
	 * ephemeral state — and that is the behaviour wanted here rather than a
	 * limitation worked around. A pane that comes back on the layout's own
	 * settings is correct; one that comes back deep in a form nobody is in the
	 * middle of editing is clutter.
	 */
	getEphemeralState(): Record<string, unknown> {
		return { selection: this.selected, ...this.readScroll() };
	}

	setEphemeralState(state: unknown): void {
		const ephemeral = state as
			| { selection?: unknown; outline?: unknown; panel?: unknown }
			| null;
		const selection =
			typeof ephemeral?.selection === 'string' ? ephemeral.selection : undefined;
		const outline =
			typeof ephemeral?.outline === 'number' ? ephemeral.outline : undefined;
		const panel =
			typeof ephemeral?.panel === 'number' ? ephemeral.panel : undefined;

		if (selection !== undefined) this.selected = selection;
		// Nothing drawn yet, so there is nothing to scroll and nothing to rebuild.
		// The selection above is what the first render will use, and `onOpen`
		// draws it at the top — which is where a pane nobody has read yet belongs.
		if (this.root === null) return;
		if (selection !== undefined) {
			// The redraw carries both positions rather than a second assignment
			// carrying them. Both arriving together is every value
			// `getEphemeralState` produces, and assigning them beside the redraw
			// rather than through it is how the published position came to be
			// discarded on every one of them. Either missing defaults to the top
			// of its own region, which is where a redraw with nothing to say about
			// it belongs.
			this.redraw({ outline: outline ?? 0, panel: panel ?? 0 });
			return;
		}
		// A position on its own changes nothing about what is drawn, so it is not
		// worth a teardown: a rebuild here would throw away a half-typed field to
		// move the scrollbar.
		if (outline !== undefined) {
			const el = this.root.querySelector(OUTLINE_SELECTOR);
			if (el) el.scrollTop = outline;
		}
		if (panel !== undefined) {
			const el = this.root.querySelector(PANEL_SELECTOR);
			if (el) el.scrollTop = panel;
		}
	}
}

/** Whether two sets of ids hold the same ids. */
function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
	return a.size === b.size && [...a].every((id) => b.has(id));
}

/**
 * Show the layout editor, reusing the pane when one is already open.
 *
 * A tab rather than a split. Where the pane sits relative to a sheet is the
 * author's arrangement to make, and opening into a split would decide it for
 * them every time.
 *
 * An open pane is revealed rather than re-opened, and that is not tidiness: a
 * `setViewState` on the leaf would hand the view a state naming another file,
 * so running the command while the pane was open on the third layout would land
 * the author back on the first.
 *
 * **With none open, a new tab opens on the first layout in the folder** — the
 * pane is bound to a file and never chooses one for itself once open, so the
 * command is where "the first layout" is still decided — or on the vacant state
 * where the folder holds none.
 */
export async function openLayoutEditor(
	plugin: SheetsmithPlugin,
): Promise<void> {
	const { workspace } = plugin.app;
	const open = workspace.getLeavesOfType(VIEW_TYPE_LAYOUT_EDITOR)[0];
	if (open) {
		await workspace.revealLeaf(open);
		return;
	}
	const first = listLayouts(plugin.app, plugin.settings.layoutFolder)[0];
	const leaf = workspace.getLeaf('tab');
	await leaf.setViewState({
		type: VIEW_TYPE_LAYOUT_EDITOR,
		active: true,
		state: first ? { file: first.path } : {},
	});
	await workspace.revealLeaf(leaf);
}
