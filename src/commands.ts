import { MarkdownView } from 'obsidian';
import type SheetsmithPlugin from './main';
import { LAYOUT_KEY } from './types';
import { LayoutEditorView, openLayoutEditor } from './view/layout-editor-view';
import { SheetView, VIEW_TYPE_SHEET } from './view/sheet-view';

export function registerCommands(plugin: SheetsmithPlugin): void {
	plugin.addCommand({
		id: 'open-layout-editor',
		name: 'Open layout editor',
		callback: () => void openLayoutEditor(plugin),
	});

	plugin.addCommand({
		id: 'open-as-sheet',
		name: 'Open as sheet',
		checkCallback: (checking) => {
			const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			const file = view?.file;
			if (!view || !file) return false;
			const frontmatter =
				plugin.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!frontmatter || frontmatter[LAYOUT_KEY] === undefined) return false;
			if (!checking) {
				plugin.markdownOverrides.delete(file.path);
				void view.leaf.setViewState({
					type: VIEW_TYPE_SHEET,
					state: { file: file.path },
				});
			}
			return true;
		},
	});

	// Scoped to the pane rather than a raw keydown listener, so the command
	// palette lists both and an author can rebind either the way they would
	// any other command (docs/features/editor-undo.md). `checking` only asks
	// whether a Sheetsmith layout editor pane is the active view — not
	// whether its stack happens to be non-empty — which is what keeps the
	// command listed and rebindable even before there is anything to undo.
	plugin.addCommand({
		id: 'sheetsmith-layout-editor-undo',
		name: 'Undo layout edit',
		hotkeys: [{ modifiers: ['Mod'], key: 'z' }],
		checkCallback: (checking) => {
			const view = plugin.app.workspace.getActiveViewOfType(LayoutEditorView);
			if (!view) return false;
			if (!checking) view.undo();
			return true;
		},
	});

	plugin.addCommand({
		id: 'sheetsmith-layout-editor-redo',
		name: 'Redo layout edit',
		hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'z' }],
		checkCallback: (checking) => {
			const view = plugin.app.workspace.getActiveViewOfType(LayoutEditorView);
			if (!view) return false;
			if (!checking) view.redo();
			return true;
		},
	});

	plugin.addCommand({
		id: 'open-as-markdown',
		name: 'Open as Markdown',
		checkCallback: (checking) => {
			const view = plugin.app.workspace.getActiveViewOfType(SheetView);
			const file = view?.file;
			if (!view || !file) return false;
			if (!checking) {
				// Remembered for the session so auto-open does not flip the
				// note straight back to sheet view.
				plugin.markdownOverrides.add(file.path);
				void view.leaf.setViewState({
					type: 'markdown',
					state: { file: file.path },
				});
			}
			return true;
		},
	});
}
