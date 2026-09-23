/*
 * What happens on screen when a layout file is created, renamed or deleted
 * anywhere in the vault (`docs/features/visible-layout-files.md`).
 *
 * A layout is a file Obsidian shows now, so the file explorer offers rename,
 * move and delete on it, and none of those go through this plugin. Two things
 * follow, and both are *reports* rather than repairs:
 *
 * - **Open sheets redraw**, so a sheet on a layout that was just renamed or
 *   deleted shows the missing-layout message now rather than on its next open,
 *   and one whose layout just arrived draws it. The layout editor pane already
 *   makes this hop after its own writes; this is the same hop for the vault's.
 * - **A rename that leaves characters behind is counted.** Character notes name
 *   a layout by its basename in a plain string, which Obsidian's rename does not
 *   carry, and SPEC §10 declines to migrate it. So the reader is told how many
 *   notes still name the old name — and nothing is rewritten.
 *
 * Registered from the plugin in `onLayoutReady`, as `auto-open.ts` registers its
 * own: the app raises `create` for every file while the vault first loads, and a
 * listener in place before that would redraw every sheet once per file.
 */

import { Notice, TAbstractFile, TFile } from 'obsidian';
import {
	isLayoutPath,
	LAYOUT_EXTENSION,
	layoutFileFor,
	LEGACY_EXTENSION,
} from '../layouts';
import { countNotesNaming } from '../layout-notes';
import type SheetsmithPlugin from '../main';
import { openSheetViews } from './sheet-view';

/** The basename of the file a path names, without its folder or extension. */
function basenameOf(path: string): string {
	const name = path.slice(path.lastIndexOf('/') + 1);
	const dot = name.lastIndexOf('.');
	return dot <= 0 ? name : name.slice(0, dot);
}

/**
 * What the reader is told about the notes a rename left behind.
 *
 * It names the old name, since that is what those notes hold and what a reader
 * would search for, and both fixes — the rename back, or repointing each note
 * through the missing-layout offer — without choosing between them.
 */
export function renameCountMessage(count: number, oldName: string): string {
	return count === 1
		? `1 character note names "${oldName}"; it will show the missing-layout message until renamed back or repointed.`
		: `${count} character notes name "${oldName}"; they will show the missing-layout message until renamed back or repointed.`;
}

/**
 * What the reader is told where a rename left an older `.json` answering the
 * name: those notes did not lose their layout, they quietly changed to another
 * file. It names the file they now read and the two ways that ends.
 */
export function fallbackCountMessage(count: number, oldName: string): string {
	const older = `${oldName}.${LEGACY_EXTENSION}`;
	return count === 1
		? `1 character note names "${oldName}"; it now uses the older ${older} until that file is converted or removed.`
		: `${count} character notes name "${oldName}"; they now use the older ${older} until it is converted or removed.`;
}

/**
 * Count the notes a layout rename affects, and say so where there are any.
 *
 * **Decided by the lookup, not by the rename's shape**, and there are two
 * outcomes worth a sentence. A note naming the old basename is *stranded*
 * where no layout in the folder now answers that name — a new basename, or a
 * move out of the folder. It *falls back* where the renamed file was the
 * `X.sheetsmith` and an older `X.json` it had been shadowing now answers
 * instead: every note on it silently starts drawing a different layout, which
 * is worse to leave unsaid than a missing one. Every other rename changes
 * nobody's sheet and says nothing — an extension-only change such as a
 * conversion, where `X.sheetsmith` now answers `X`, and a shadowed `X.json`
 * renamed while `X.sheetsmith` still answers. **Zero says nothing** in both
 * cases, which is §10's "a rename that matches nothing says nothing".
 */
async function reportStranded(
	plugin: SheetsmithPlugin,
	oldPath: string,
): Promise<void> {
	const folder = plugin.settings.layoutFolder;
	if (!isLayoutPath(oldPath, folder)) return;
	const basename = basenameOf(oldPath);
	const now = layoutFileFor(plugin.app, folder, basename);
	const fellBack =
		now !== null &&
		now.extension === LEGACY_EXTENSION &&
		oldPath.endsWith(`.${LAYOUT_EXTENSION}`);
	if (now !== null && !fellBack) return;
	const count = await countNotesNaming(plugin.app, basename);
	if (count === 0) return;
	new Notice(
		fellBack
			? fallbackCountMessage(count, basename)
			: renameCountMessage(count, basename),
	);
}

/** Redraw every open sheet, which re-resolves its layout by name. */
function refreshSheets(plugin: SheetsmithPlugin): void {
	for (const sheet of openSheetViews(plugin.app)) sheet.refresh();
}

/**
 * Listen for layout files arriving, moving and going, for the plugin's life.
 *
 * Deliberately **not** `modify`: a hand edit of a layout reaches an open sheet
 * on its next render, as it always has, and redrawing every sheet on every
 * write to a layout would redraw them on every keystroke the layout editor
 * commits. The editor pane refreshes sheets after its own writes.
 */
export function registerLayoutFileEvents(plugin: SheetsmithPlugin): void {
	const { app } = plugin;
	app.workspace.onLayoutReady(() => {
		const inFolder = (file: TAbstractFile): boolean =>
			file instanceof TFile &&
			isLayoutPath(file.path, plugin.settings.layoutFolder);

		plugin.registerEvent(
			app.vault.on('create', (file) => {
				if (inFolder(file)) refreshSheets(plugin);
			}),
		);
		plugin.registerEvent(
			app.vault.on('delete', (file) => {
				if (inFolder(file)) refreshSheets(plugin);
			}),
		);
		plugin.registerEvent(
			app.vault.on('rename', (file, oldPath) => {
				const folder = plugin.settings.layoutFolder;
				if (!inFolder(file) && !isLayoutPath(oldPath, folder)) return;
				refreshSheets(plugin);
				void reportStranded(plugin, oldPath);
			}),
		);
	});
}
