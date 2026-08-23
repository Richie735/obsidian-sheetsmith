import { Plugin } from 'obsidian';
import { closePopover } from './ui/popover';
import { registerCommands } from './commands';
import {
	DEFAULT_SETTINGS,
	SheetsmithSettings,
	SheetsmithSettingTab,
} from './settings';
import { registerAutoOpen } from './view/auto-open';
import { SheetView, VIEW_TYPE_SHEET } from './view/sheet-view';

export default class SheetsmithPlugin extends Plugin {
	/*
	 * `declare`, not an assignment: Obsidian 1.13's `Plugin` owns `settings`
	 * (typed `unknown`) and this only narrows it. Under `target: ES2022` a class
	 * field is *defined* rather than assigned, so a redeclaration here would
	 * write `undefined` over the base's own property — which is what TS2612
	 * reports and what `declare` emits nothing for.
	 */
	declare settings: SheetsmithSettings;
	/** Files the user chose to keep in markdown view this session. */
	markdownOverrides = new Set<string>();

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SheetsmithSettingTab(this.app, this));
		this.registerView(VIEW_TYPE_SHEET, (leaf) => new SheetView(leaf, this));
		// A sheet's cells can hold wikilinks, so the view emits `hover-link` for
		// them. Registering it is what makes Page preview treat this view as a
		// source it knows: the user gets an entry for Sheetsmith in that plugin's
		// settings, and with it the choice of whether a preview wants the Mod key
		// — which matters on a card whose rows are dense with links.
		this.registerHoverLinkSource(VIEW_TYPE_SHEET, {
			display: this.manifest.name,
			defaultMod: false,
		});
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
