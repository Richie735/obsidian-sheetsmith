/*
 * The layout editor's own pane.
 *
 * A main-area leaf rather than a sidebar, and rather than the settings tab the
 * editor used to live in: an authoring tool needs width, and a sheet has to be
 * able to sit beside it in a split, which is SPEC §7's own reason for the view.
 *
 * What this owns is the pane. Every region inside it, every form and every field
 * belong to `src/editor/`, and this builds none of them. What is left is the
 * frame: which layout is open, what is selected, what survives a redraw, and the
 * hop into open sheet views after a write.
 */

import { ItemView, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import {
	LayoutEditorHost,
	LayoutEditorSection,
	SHEET_DESTINATION,
} from '../editor/layout-editor';
import type SheetsmithPlugin from '../main';
import { SheetView, VIEW_TYPE_SHEET } from './sheet-view';

export const VIEW_TYPE_LAYOUT_EDITOR = 'sheetsmith-layout-editor';

export class LayoutEditorView extends ItemView implements LayoutEditorHost {
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
	/** Which layout the pane has open, by basename. Workspace state. */
	private openLayout: string | null = null;
	/** What the panel is configuring. Ephemeral state. */
	private selected: string = SHEET_DESTINATION;

	/*
	 * `navigation` is Obsidian's own property, and the API's test for it is
	 * whether the view "opens a file or can be otherwise navigated". The layout
	 * picker is a control inside the pane rather than the workspace's own
	 * history, so nothing here is navigated to: false.
	 */
	navigation = false;

	constructor(leaf: WorkspaceLeaf, plugin: SheetsmithPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.editor = new LayoutEditorSection(plugin, this);
	}

	getViewType(): string {
		return VIEW_TYPE_LAYOUT_EDITOR;
	}

	getDisplayText(): string {
		return 'Layout editor';
	}

	getIcon(): string {
		return 'pencil-ruler';
	}

	async onOpen(): Promise<void> {
		this.redraw();
	}

	async onClose(): Promise<void> {
		this.flush();
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

	get layoutName(): string | null {
		return this.openLayout;
	}

	setLayoutName(name: string | null): void {
		this.openLayout = name;
	}

	get selection(): string {
		return this.selected;
	}

	setSelection(id: string): void {
		this.selected = id;
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
		for (const leaf of this.plugin.app.workspace.getLeavesOfType(
			VIEW_TYPE_SHEET,
		)) {
			if (leaf.view instanceof SheetView) leaf.view.refresh();
		}
	}

	/**
	 * Rebuild the pane from the layout as it now stands.
	 *
	 * The scroll position is restored across it, which is the pane's job and not
	 * the editor's for the reason it was the settings tab's: whoever tears the
	 * DOM down owns what survives. Focus is the other half and stays with the
	 * editor, which owns the focus-token convention every control there follows.
	 *
	 * A fresh root each time rather than emptying the old one, so a render that
	 * comes back after a newer one has an orphan to append into rather than the
	 * live pane.
	 *
	 * `scrollTo` defaults to wherever the pane is now, which is what every
	 * ordinary redraw wants. It is a parameter rather than something a caller
	 * arranges afterwards because there can only be one restore: a caller
	 * assigning `scrollTop` around this call assigns it to a pane that has just
	 * been emptied, so it clamps toward zero, and the deferred restore below then
	 * overwrites whatever survived. Anything with a position in mind hands it in
	 * here.
	 */
	redraw(scrollTo = this.contentEl.scrollTop): void {
		this.contentEl.empty();
		const root = this.contentEl.createDiv();
		this.root = root;
		void this.editor.render(root).then(() => {
			// Restored only after the editor has appended: a still-short pane
			// clamps the position back toward zero.
			if (this.root === root) this.contentEl.scrollTop = scrollTo;
		});
	}

	/* --- Posture the workspace remembers ------------------------------- */

	/**
	 * Which layout is open, and nothing else.
	 *
	 * This is what a restored workspace comes back to, so it carries the one
	 * piece of posture that reopening on a different layout would read as a bug.
	 * What is *selected* is deliberately not here: see `getEphemeralState`.
	 */
	getState(): Record<string, unknown> {
		return { layout: this.openLayout };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);
		const layout = (state as { layout?: unknown } | null)?.layout;
		// A `setViewState` carrying no layout — which is what opening the pane
		// looks like — must not clear the one already open. Only a state that
		// names a layout changes which one it is.
		if (typeof layout === 'string') this.openLayout = layout;
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
		return { selection: this.selected, scroll: this.contentEl.scrollTop };
	}

	setEphemeralState(state: unknown): void {
		const ephemeral = state as
			| { selection?: unknown; scroll?: unknown }
			| null;
		const selection =
			typeof ephemeral?.selection === 'string' ? ephemeral.selection : undefined;
		const scroll =
			typeof ephemeral?.scroll === 'number' ? ephemeral.scroll : undefined;

		if (selection !== undefined) this.selected = selection;
		// Nothing drawn yet, so there is nothing to scroll and nothing to rebuild.
		// The selection above is what the first render will use, and `onOpen`
		// draws it at the top — which is where a pane nobody has read yet belongs.
		if (this.root === null) return;
		if (selection !== undefined) {
			// The redraw carries the position rather than a second assignment
			// carrying it. Both halves arriving together is every value
			// `getEphemeralState` produces, and assigning the scroll beside the
			// redraw rather than through it is how the published position came to
			// be discarded on every one of them.
			this.redraw(scroll);
			return;
		}
		// A position on its own changes nothing about what is drawn, so it is not
		// worth a teardown: a rebuild here would throw away a half-typed field to
		// move the scrollbar.
		if (scroll !== undefined) this.contentEl.scrollTop = scroll;
	}
}

/**
 * Show the layout editor, reusing the pane when one is already open.
 *
 * A tab rather than a split. Where the pane sits relative to a sheet is the
 * author's arrangement to make, and opening into a split would decide it for
 * them every time.
 *
 * An open pane is revealed rather than re-opened, and that is not tidiness: a
 * `setViewState` on the leaf would hand the view a state naming no layout, so
 * running the command while the pane was open on the third layout would land the
 * author back on the first.
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
	const leaf = workspace.getLeaf('tab');
	await leaf.setViewState({ type: VIEW_TYPE_LAYOUT_EDITOR, active: true });
	await workspace.revealLeaf(leaf);
}
