import { Plugin } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	SheetsmithSettings,
	SheetsmithSettingTab,
} from './settings';

/**
 * Frontmatter key marking a note as a character sheet and naming its layout.
 * This is the only property Sheetsmith requires on a character note.
 */
export const LAYOUT_KEY = 'sheet-layout';

export default class SheetsmithPlugin extends Plugin {
	settings!: SheetsmithSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SheetsmithSettingTab(this.app, this));

		// M1 registers the sheet view here.
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<SheetsmithSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
