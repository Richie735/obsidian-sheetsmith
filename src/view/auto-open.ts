import { MarkdownView, WorkspaceLeaf } from 'obsidian';
import type SheetsmithPlugin from '../main';
import { LAYOUT_KEY } from '../types';
import { VIEW_TYPE_SHEET } from './sheet-view';

/**
 * Open notes carrying the layout key in sheet view (SPEC §8), in the
 * Excalidraw manner: the "Open as Markdown" command records a per-file,
 * session-scoped override so auto-open never fights the user's explicit
 * choice.
 */
export function registerAutoOpen(plugin: SheetsmithPlugin): void {
	const maybeSwitch = (leaf: WorkspaceLeaf | null): void => {
		if (!plugin.settings.openInSheetView) return;
		if (!leaf || !(leaf.view instanceof MarkdownView)) return;
		const file = leaf.view.file;
		if (!file || plugin.markdownOverrides.has(file.path)) return;
		const frontmatter =
			plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter || frontmatter[LAYOUT_KEY] === undefined) return;
		void leaf.setViewState({
			type: VIEW_TYPE_SHEET,
			state: { file: file.path },
		});
	};

	// Registered after layout restore so an existing workspace is not
	// rewritten at startup; restored tabs convert when they become active.
	plugin.app.workspace.onLayoutReady(() => {
		plugin.registerEvent(
			plugin.app.workspace.on('active-leaf-change', (leaf) =>
				maybeSwitch(leaf),
			),
		);
		plugin.registerEvent(
			// Covers in-leaf navigation (following a link), where the leaf
			// stays active and 'active-leaf-change' never fires.
			plugin.app.workspace.on('file-open', () => {
				maybeSwitch(
					plugin.app.workspace.getActiveViewOfType(MarkdownView)?.leaf ??
						null,
				);
			}),
		);
		maybeSwitch(
			plugin.app.workspace.getActiveViewOfType(MarkdownView)?.leaf ?? null,
		);
	});
}
