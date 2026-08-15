import { MarkdownView } from 'obsidian';
import type SheetsmithPlugin from './main';
import { LAYOUT_KEY } from './types';
import { SheetView, VIEW_TYPE_SHEET } from './view/sheet-view';

export function registerCommands(plugin: SheetsmithPlugin): void {
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
