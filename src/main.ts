import { Plugin } from 'obsidian';
import { closePopover } from './components/popover';
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

	onunload() {
		// The one piece of DOM this plugin puts outside its own views: a cell
		// popover attaches to document.body to escape the table's overflow
		// clip, and takes three capture-phase listeners with it. Nothing else
		// would collect them, so an unload with a bubble open would leave both
		// behind.
		closePopover();
	}

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
