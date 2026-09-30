/*
 * The real plugin, loaded against the stub (`docs/features/visible-layout-files.md`).
 *
 * Scaffolding, not a test case (`docs/PATTERNS.md` §2), and a module of its own
 * rather than a member of `plugin.ts` beside it for one reason: that module is
 * imported by the harness and by nearly every surface test, and this one
 * imports `main.ts` — the whole plugin. `fakePlugin` stays the cheap stand-in a
 * surface is constructed with; this is for a case whose claim is about what
 * `onload` itself registers, in what order, and what the registrations then do.
 *
 * It exists because the stub now carries a `Plugin` double, a view registry and
 * `Workspace.onLayoutReady` — the members `onload` reaches — which is the
 * plugin-shell fixture two `docs/BACKLOG.md` rows wait on.
 */

import SheetsmithPlugin from '../main';
import { App } from './obsidian-stub';

/** The manifest the stub plugin is constructed with: the members `onload` reads. */
const MANIFEST = { id: 'sheetsmith', name: 'Sheetsmith', version: '0.0.0' };

/**
 * A `SheetsmithPlugin` constructed the way the app constructs one, with
 * `onload` run to completion. `data` is what `loadData` answers — null, as a
 * fresh install's is, unless a case says otherwise.
 */
export async function loadPlugin(
	app: App,
	data: unknown = null,
): Promise<SheetsmithPlugin> {
	const plugin = new SheetsmithPlugin(app as never, MANIFEST as never);
	(plugin as unknown as { data: unknown }).data = data;
	await plugin.onload();
	return plugin;
}

/**
 * Unload a plugin `loadPlugin` loaded, the way the app turns one off.
 *
 * `loadPlugin` runs `onload` itself rather than through `load()`, so the double
 * has not marked the component loaded, and its `unload` would return without
 * running anything. Marking it here is that one missing line, not a model of
 * how the app unloads: which of the plugin's views close, and when, is the
 * app's, and the double closes none (`docs/features/unsaveable-layout.md` §4).
 */
export function unloadPlugin(plugin: SheetsmithPlugin): void {
	(plugin as unknown as { loaded: boolean }).loaded = true;
	plugin.unload();
}
