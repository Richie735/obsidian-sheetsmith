import { App, PluginSettingTab, Setting } from 'obsidian';
import SheetsmithPlugin from './main';

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

export class SheetsmithSettingTab extends PluginSettingTab {
	plugin: SheetsmithPlugin;

	constructor(app: App, plugin: SheetsmithPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Layout folder')
			.setDesc('Folder where sheet layouts are stored.')
			.addText((text) =>
				text
					.setPlaceholder('Sheetsmith layouts')
					.setValue(this.plugin.settings.layoutFolder)
					.onChange(async (value) => {
						this.plugin.settings.layoutFolder = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Open sheets in sheet view')
			.setDesc(
				'Notes with a sheet-layout property open as a rendered sheet instead of Markdown.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.openInSheetView)
					.onChange(async (value) => {
						this.plugin.settings.openInSheetView = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
