/*
 * The plugin object a surface is constructed with, outside the app.
 *
 * Scaffolding, not a test case (`docs/PATTERNS.md` §2), and a module rather than
 * a helper in a test file for the reason `workspace.ts` gives beside it: the cast
 * is the point. The real class extends Obsidian's `Plugin`, the stub is a double
 * for that rather than an implementation of it, and every call site would
 * otherwise carry the same `as unknown` and the same paragraph explaining it.
 *
 * **The member list is the whole value of having one copy.** It is what the
 * surfaces actually reach and nothing else, so a surface that grows a
 * dependency on the plugin fails here and has to be added deliberately. Three
 * copies had drifted that way already: the harness's declared
 * `markdownOverrides`, `loadSettings`, `addSettingTab`, `registerView`,
 * `registerEvent` and `addCommand`, none of which anything ever called, which is
 * exactly the "pretending otherwise would hide which members are reached" the
 * comment above it was warning about.
 */

import type SheetsmithPlugin from '../main';
import { DEFAULT_SETTINGS } from '../settings';
import { App } from './obsidian-stub';

/**
 * The folder the stand-in plugin looks for layouts in.
 *
 * Shared because it has to agree in two places at once: the plugin's own
 * `layoutFolder`, and the paths a caller writes its layout files to. Two copies
 * of that agreeing is what one name says for free.
 */
export const LAYOUT_FOLDER = 'Sheetsmith layouts';

export function fakePlugin(app: App): SheetsmithPlugin {
	return {
		app,
		settings: { ...DEFAULT_SETTINGS, layoutFolder: LAYOUT_FOLDER },
		async saveSettings() {},
	} as unknown as SheetsmithPlugin;
}
