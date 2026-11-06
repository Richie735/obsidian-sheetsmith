/*
 * The way back from a markdown view to a sheet (SPEC §8): the behaviour the
 * **Open as sheet** command, the header action and the pane menu entry share,
 * and the two doors a markdown view shows.
 *
 * `SheetView` carries the other direction and simply adds its action and its
 * menu item itself, because every sheet offers them. These are conditional on
 * the note, and the views they sit on are the app's, so nothing here can own a
 * view's lifecycle: the action is reconciled from outside, against what each
 * view holds now, and the menu item is offered each time the app builds a menu.
 */

import { MarkdownView } from 'obsidian';
import { TEXT } from '../en';
import { carriesLayoutKey } from '../layout-notes';
import type SheetsmithPlugin from '../main';
import { sheetViewState } from './sheet-view';

/** Show the view's note as a sheet, and let auto-open take it from here again. */
export function openAsSheet(plugin: SheetsmithPlugin, view: MarkdownView): void {
	const file = view.file;
	if (!file) return;
	plugin.markdownOverrides.delete(file.path);
	void view.leaf.setViewState(sheetViewState(file.path));
}

/**
 * Keep the action on exactly the markdown views whose note carries the key.
 *
 * **Not behind `openInSheetView`.** That setting decides whether a note switches
 * by itself, and the command has never been gated by it, so a reader who turned
 * it off keeps the same door they asked to press themselves.
 *
 * **Two events, because a view can change its answer in two ways**, both
 * measured in Obsidian 1.15.0. `metadataCache` `changed` is the key arriving or
 * leaving while the view stays on one file, which is the reported flow: the
 * layout is applied to a note already open, and no workspace event fires for
 * that at all. `layout-change` is the view moving to another file, or a deferred
 * leaf becoming a real view. `file-open` is not enough for the second: it fires
 * for the active leaf only, and a link opened into a background tab raises
 * `layout-change` and nothing else.
 *
 * A `WeakMap` so a closed view takes its entry with it. It cannot be walked, so
 * the unload walks the leaves instead, and a view no longer in a leaf has no
 * header left to clean.
 */
export function registerOpenAsSheetAction(plugin: SheetsmithPlugin): void {
	const { workspace, metadataCache } = plugin.app;
	const actions = new WeakMap<MarkdownView, HTMLElement>();

	/*
	 * The `instanceof` is `openSheetViews`' point again: a restored leaf of this
	 * type holds a deferred view until it is first shown, which has no `file` and
	 * no header. It gets its action from the `layout-change` that loads it.
	 */
	const markdownViews = (): MarkdownView[] =>
		workspace
			.getLeavesOfType('markdown')
			.flatMap((leaf) => (leaf.view instanceof MarkdownView ? [leaf.view] : []));

	const reconcile = (view: MarkdownView): void => {
		const wanted = view.file !== null && carriesLayoutKey(plugin.app, view.file);
		const held = actions.get(view);
		if (wanted && !held) {
			actions.set(
				view,
				view.addAction('layout-grid', TEXT.openAsSheet, () =>
					openAsSheet(plugin, view),
				),
			);
		} else if (!wanted && held) {
			held.remove();
			actions.delete(view);
		}
	};

	// After layout restore, as auto-open registers: the app raises `changed` for
	// every file it indexes while a vault first loads.
	workspace.onLayoutReady(() => {
		plugin.registerEvent(
			workspace.on('layout-change', () => markdownViews().forEach(reconcile)),
		);
		plugin.registerEvent(
			metadataCache.on('changed', (file) => {
				for (const view of markdownViews()) {
					if (view.file?.path === file.path) reconcile(view);
				}
			}),
		);
		markdownViews().forEach(reconcile);
	});

	// A markdown view outlives this plugin, so nothing else would take these off.
	plugin.register(() => {
		for (const view of markdownViews()) {
			actions.get(view)?.remove();
			actions.delete(view);
		}
	});
}

/**
 * Which `file-menu` sources are a view's own pane menu, measured in Obsidian
 * 1.15.0, where `FileView` raises `file-menu` from its `onPaneMenu` with the
 * source it was handed: **More options**, a tab header's context menu, and the
 * same tab menu on a leaf docked in a sidebar, which the app names apart.
 */
const PANE_MENU_SOURCES: ReadonlySet<string> = new Set([
	'more-options',
	'tab-header',
	'sidebar-context-menu',
]);

/**
 * Offer **Open as sheet** in a keyed markdown view's pane menu, which is the
 * door a phone can read: an action's title is a tooltip a finger cannot raise.
 *
 * **Through `file-menu`, because the view is the app's.** `SheetView` adds its
 * entry in its own `onPaneMenu`; a markdown view's is the app's to override, not
 * this plugin's, and the event is how the app lets a plugin into that menu.
 *
 * **Only for a pane menu, by decision.** The same event builds the file
 * explorer's context menu and every other menu on a file, where there is no
 * view to switch: pressing it there would have to choose a leaf, which is a
 * different command from this one. So the entry asks for both the source and a
 * `MarkdownView` in the leaf, and reads the key off that view's file.
 *
 * **Not behind `openInSheetView`**, for the action's reason above.
 */
export function registerOpenAsSheetMenu(plugin: SheetsmithPlugin): void {
	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu, _file, source, leaf) => {
			if (!PANE_MENU_SOURCES.has(source)) return;
			const view = leaf?.view;
			if (!(view instanceof MarkdownView) || !view.file) return;
			if (!carriesLayoutKey(plugin.app, view.file)) return;
			menu.addItem((item) =>
				item
					.setTitle(TEXT.openAsSheet)
					.setIcon('layout-grid')
					.setSection('pane')
					.onClick(() => openAsSheet(plugin, view)),
			);
		}),
	);
}
