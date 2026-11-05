/*
 * The way back from a markdown view to a sheet (SPEC §8): the behaviour the
 * **Open as sheet** command and the header action share, and the action itself.
 *
 * `SheetView` carries the other direction and simply adds its action once,
 * because every sheet offers it. This one is conditional on the note, and the
 * views it sits on are the app's, so nothing here can own a view's lifecycle:
 * the action is reconciled from outside, against what each view holds now.
 */

import { MarkdownView } from 'obsidian';
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
				// `addAction` is outside the sentence-case lint's reach. The command's
				// literal is inside it, and the test holds this title to that name.
				view.addAction('layout-grid', 'Open as sheet', () =>
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
