import { MarkdownView, TFile, WorkspaceLeaf } from 'obsidian';
import { carriesLayoutKey } from '../layout-notes';
import type SheetsmithPlugin from '../main';
import { SheetView, sheetViewState } from './sheet-view';

/**
 * Open notes carrying the layout key in sheet view (SPEC §8), in the
 * Excalidraw manner: the "Open as Markdown" command records a per-file,
 * session-scoped override so auto-open never fights the user's explicit
 * choice.
 *
 * **A note switches when it arrives in a leaf, never because a view already
 * showing it gained focus.** The leaf's capture `pointerdown` activates it, so a
 * switch on activation swallowed a press meant for a control in that view, and
 * flipped a note just given the key at the next tab return. `file-open` is no
 * better than `active-leaf-change`: it fires on activation whenever the active
 * file changes. So arrival is `layout-change` against a memory of what each leaf
 * last showed (`docs/features/auto-open-on-arrival.md`, with the measurements).
 *
 * **What this gives up, by decision.** An arrival whose cache has no answer yet
 * reads as carrying no key, so it is recorded and stays markdown. Nothing waits
 * for the index, because a late flip can land on a reader already in the note;
 * `open-as-sheet.ts` offers the way across when `changed` answers.
 */
export function registerAutoOpen(plugin: SheetsmithPlugin): void {
	const { workspace } = plugin.app;

	// Read now, before `onLayoutReady`: by the time that callback runs it is true
	// on both paths. False is app startup and true is an enable mid-session, which
	// has just emptied `markdownOverrides`, so converting a view already loaded
	// then would undo a reader's explicit choice, possibly while they type.
	const atStartup = !workspace.layoutReady;

	// By identity and not by path: a rename keeps the `TFile` and raises
	// `layout-change`, so a path compare would read it as an arrival. A `WeakMap`
	// so a closed leaf takes its entry with it.
	const lastShown = new WeakMap<WorkspaceLeaf, TFile>();

	const maybeSwitch = (leaf: WorkspaceLeaf, file: TFile): void => {
		if (!plugin.settings.openInSheetView) return;
		if (plugin.markdownOverrides.has(file.path)) return;
		if (!carriesLayoutKey(plugin.app, file)) return;
		void leaf.setViewState(sheetViewState(file.path));
	};

	const walk = (arrivalsSwitch: boolean): void => {
		workspace.iterateAllLeaves((leaf) => {
			const { view } = leaf;
			const file =
				view instanceof MarkdownView || view instanceof SheetView
					? view.file
					: null;
			// Any other view forgets, a deferred one included: it has no `file`, so a
			// tab closed to empty or sent to a graph and reopened on the note counts,
			// and a deferred leaf converts when it first loads, even after an enable
			// mid-session, since it cannot hold a choice made this session.
			if (!file) {
				lastShown.delete(leaf);
				return;
			}
			if (lastShown.get(leaf) === file) return;
			lastShown.set(leaf, file);
			// A `SheetView` is recorded and not switched. Without it, a sheet followed
			// by a link and two Backs would read as an arrival, and trap Back.
			if (arrivalsSwitch && view instanceof MarkdownView) maybeSwitch(leaf, file);
		});
	};

	// Registered after layout restore, so the events of restoring it are not read.
	workspace.onLayoutReady(() => {
		walk(atStartup);
		plugin.registerEvent(workspace.on('layout-change', () => walk(true)));
	});
}
