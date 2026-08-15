import { Plugin } from 'obsidian';
import { registerCommands } from './commands';
import {
	DEFAULT_SETTINGS,
	SheetsmithSettings,
	SheetsmithSettingTab,
} from './settings';
import { registerAutoOpen } from './view/auto-open';
import { SheetView, VIEW_TYPE_SHEET } from './view/sheet-view';

export default class SheetsmithPlugin extends Plugin {
	settings!: SheetsmithSettings;
	/** Files the user chose to keep in markdown view this session. */
	markdownOverrides = new Set<string>();

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SheetsmithSettingTab(this.app, this));
		this.registerView(VIEW_TYPE_SHEET, (leaf) => new SheetView(leaf, this));
		registerCommands(this);
		registerAutoOpen(this);
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<SheetsmithSettings>,
		);
		// Guard against untrimmed or emptied values already persisted.
		const folder = this.settings.layoutFolder.trim();
		this.settings.layoutFolder =
			folder === '' ? DEFAULT_SETTINGS.layoutFolder : folder;
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
