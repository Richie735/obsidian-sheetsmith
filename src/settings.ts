import { App, PluginSettingTab, Setting } from 'obsidian';
import SheetsmithPlugin from './main';
import { LAYOUT_KEY } from './types';
import { openLayoutEditor } from './view/layout-editor-view';

export interface SheetsmithSettings {
	/** Vault folder holding layout files. */
	layoutFolder: string;
	/** Open notes carrying the layout key in sheet view rather than markdown view. */
	openInSheetView: boolean;
}

export const DEFAULT_SETTINGS: SheetsmithSettings = {
	layoutFolder: 'Sheetsmith layouts',
	openInSheetView: true,
};

/*
 * Obsidian 1.13 asks a settings tab to describe itself declaratively through
 * `getSettingDefinitions()`, so the app can index each setting for search.
 *
 * This tab used to answer that with "most of it is the interim layout editor,
 * and static definitions cannot describe a form whose shape is decided at
 * runtime". That answer has expired: the editor is a workspace pane now, and
 * what is left here is two preferences and a button, which is exactly the shape
 * the declarative API is for.
 *
 * Two things still block it, and both are about being able to tell whether the
 * adoption worked.
 *
 * **The storage seam is documented but not specified.** A `control` definition
 * names a key and the framework reads and writes it through `getControlValue`
 * and `setControlValue`, which `PluginSettingTab` overrides to reach "their
 * conventional settings storage". Whether a write also persists — this plugin
 * saves through `saveSettings`, and nothing in the typings says the framework
 * calls it — is the difference between preferences that save and preferences
 * that silently stop saving. Nothing here can catch that either way:
 * `src/test/obsidian-stub.ts` renders `Setting` rows, and rendering a tab built
 * from definitions would mean reimplementing Obsidian's own renderer rather
 * than doubling it, so neither a test nor the harness could look at the result.
 *
 * **The folder preference is not a plain bind.** An emptied field falls back to
 * the default rather than being rejected, because an empty folder silently
 * relocates layout lookup and creation to the vault root — and the displayed
 * value is rewritten on blur so what is on screen is what is in effect.
 * `validate` rejects a value; it does not substitute one.
 *
 * **Waiting on:** a stub that renders `getSettingDefinitions()`, so the
 * adoption can be looked at rather than assumed, and a decision on whether an
 * emptied folder is an error or a fallback. The rule is turned off for this file
 * in eslint.config.mts, because the plugin's own config forbids silencing it
 * inline.
 */
export class SheetsmithSettingTab extends PluginSettingTab {
	/*
	 * `declare`, as on `main.ts`'s `settings`, and for a reason the compiler
	 * cannot reach here: `PluginSettingTab` holds a `plugin` at runtime — its own
	 * `getControlValue` and `setControlValue` are documented as reading
	 * `this.plugin.settings` — but does not declare one in its typings. So TS2612
	 * fires for `Plugin.settings` and cannot fire for this, while
	 * `useDefineForClassFields` makes an uninitialized field *define* rather than
	 * assign: without `declare` this emits `plugin;`, writing `undefined` over
	 * the base's own property the instant `super()` returns. The assignment below
	 * happens to repair it, which is exactly why this needed writing down.
	 */
	declare plugin: SheetsmithPlugin;

	constructor(app: App, plugin: SheetsmithPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Layout folder')
			.setDesc(
				// The label already says it is the folder for layouts. What it
				// cannot say is what depends on it: lookup is by name inside
				// this folder only, so moving the folder without moving the
				// layouts leaves every character reporting a layout it can no
				// longer find.
				'Layouts are found here by name. A character naming one that is not in this folder reports it as missing instead of rendering.',
			)
			.addText((text) => {
				text
					.setPlaceholder('Sheetsmith layouts')
					.setValue(this.plugin.settings.layoutFolder)
					.onChange(async (value) => {
						// An empty folder would silently relocate layout
						// lookup and creation to the vault root.
						const folder = value.trim();
						this.plugin.settings.layoutFolder =
							folder === '' ? DEFAULT_SETTINGS.layoutFolder : folder;
						await this.plugin.saveSettings();
					});
				// The displayed value and the effective value must agree:
				// an emptied field falls back to the default, so show it.
				text.inputEl.addEventListener('blur', () => {
					text.setValue(this.plugin.settings.layoutFolder);
				});
			});

		new Setting(containerEl)
			.setName('Open sheets in sheet view')
			.setDesc(
				createFragment((fragment) => {
					fragment.appendText('Notes with a ');
					fragment.createEl('code', { text: LAYOUT_KEY });
					fragment.appendText(
						' property open as a rendered sheet instead of Markdown.',
					);
				}),
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.openInSheetView)
					.onChange(async (value) => {
						this.plugin.settings.openInSheetView = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Layout editor')
			.setDesc(
				// Where it went, not what it is. The editor used to be on this
				// page, so a reader who remembers it here needs the sentence to
				// say that it moved rather than to describe authoring in general.
				'Layouts are designed in a pane of their own, so a sheet can sit beside one.',
			)
			.addButton((button) =>
				button
					.setButtonText('Open layout editor')
					.setCta()
					.onClick(() => void openLayoutEditor(this.plugin)),
			);
	}
}
