/*
 * The stand-in app both of the plugin's own surfaces run against.
 *
 * An in-memory vault holding one layout file, a plugin object carrying settings
 * and a save, and a watch on that file so an edit made in the layout editor
 * re-renders the sheet beside it. Everything here is scaffolding for the app:
 * the settings tab and the layout editor pane are the real classes, not copies.
 *
 * Its own module because two surfaces need it and neither should have to know
 * how the other is built.
 */

import { App, Vault } from '../src/test/obsidian-stub';
import { LAYOUT_FOLDER } from '../src/test/plugin';
import { Layout, parseLayout, serialiseLayout } from '../src/parse/layout';
import { Sample, SAMPLES } from './samples';

const LAYOUT_NAME = 'Harness sheet';

/**
 * The layout the sheet side renders, as a file the editor can open.
 *
 * Takes its components, because the two surfaces have to be looking at the
 * same layout: the sheet swaps configs when the state changes, and an editor
 * still holding the populated layout would show a healthy form beside a card
 * rendering an error — the instrument disagreeing with itself, which is worse
 * than showing nothing (UI.md §11).
 */
export function harnessLayout(samples: readonly Sample[] = SAMPLES): Layout {
	return {
		name: LAYOUT_NAME,
		columns: 12,
		components: samples.map((sample) => sample.config),
		functions: ['mod(score) = floor((score - 10) / 2)'],
		triggers: ['Long rest', 'Short rest'],
	};
}

/**
 * What the layout folder holds: a layout, or one of the two states the editor
 * has to draw instead of one.
 *
 * `'none'` is a configured folder with nothing in it, which is what a new vault
 * looks like. `'broken'` is a file that will not parse, which is the ordinary
 * way a layout is wrong — it is a thing people hand-edit and share.
 */
export type LayoutSource = Layout | 'none' | 'broken';

/** A truncated file, which is what a hand edit interrupted actually leaves. */
const UNPARSEABLE = '{\n\t"name": "Harness sheet",\n\t"components": [\n';

/**
 * Put the layout in the stub vault, where the plugin's folder preference looks
 * for it.
 *
 * The folder is created either way, including for `'none'`: an author who has
 * set a layout folder and put nothing in it has a folder, and the editor's empty
 * state is about having no layouts rather than no folder.
 *
 * The plugin object itself is `src/test/plugin.ts`'s, shared with the tests. Two
 * calls at each surface rather than one function doing both, because writing a
 * file and building a plugin are two jobs and the combined one could only be
 * named with an "and" (`docs/PATTERNS.md` §1).
 */
export async function plantLayout(
	app: App,
	layout: LayoutSource,
): Promise<void> {
	await app.vault.createFolder(LAYOUT_FOLDER);
	if (layout === 'none') return;
	await app.vault.create(
		`${LAYOUT_FOLDER}/${LAYOUT_NAME}.json`,
		layout === 'broken' ? UNPARSEABLE : serialiseLayout(layout),
	);
}

/**
 * Watch the layout file for writes rather than hooking the editor.
 *
 * The editor saves through `app.vault.modify`, and giving the harness its own
 * notification would mean the harness knowing when a save happens — which is
 * exactly the coupling the plugin does not have. Wrapping the vault keeps the
 * editor unmodified and unaware.
 */
export function watchLayoutFile(
	vault: Vault,
	onChange: (layout: Layout) => void,
): void {
	const modify = vault.modify.bind(vault);
	vault.modify = async (file, content) => {
		await modify(file, content);
		try {
			onChange(parseLayout(content));
		} catch {
			// An in-progress edit can leave the file briefly unparseable. The
			// editor reports that itself; the sheet simply keeps the last good
			// layout rather than blanking.
		}
	};
}
