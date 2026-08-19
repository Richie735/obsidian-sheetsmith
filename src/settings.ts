import { App, PluginSettingTab, Setting } from 'obsidian';
import { LayoutEditorSection } from './editor/layout-editor';
import SheetsmithPlugin from './main';
import { LAYOUT_KEY } from './types';

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
 * This tab cannot, yet, and the obstacle is not effort. Most of it is not a
 * list of settings at all: it is the interim layout editor (SPEC §12), an
 * authoring form that rebuilds itself on every edit, carries a debounced
 * draft, and generates a component's fields from its own `configFields` at
 * runtime. Static definitions cannot express a form whose shape is decided by
 * which component the author selected a moment ago.
 *
 * The M4 workspace view takes the editor out of settings, leaving exactly the
 * two preferences the declarative API is for. That is when this gets adopted,
 * and adopting it earlier would mean describing the editor as something it is
 * not. The rule is turned off for this file in eslint.config.mts, because the
 * plugin's own config forbids silencing it inline.
 */
export class SheetsmithSettingTab extends PluginSettingTab {
	plugin: SheetsmithPlugin;
	private layoutEditor: LayoutEditorSection;

	constructor(app: App, plugin: SheetsmithPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.layoutEditor = new LayoutEditorSection(plugin, () => this.redraw());
	}

	hide(): void {
		// A debounced edit may still be pending; closing the tab must never
		// lose it.
		this.layoutEditor.flush();
	}

	display(): void {
		this.redraw();
	}

	/*
	 * The body of `display`, under a name of its own.
	 *
	 * Obsidian deprecated `display()` in 1.13, so anything calling it lands on
	 * a deprecated symbol — including this tab calling itself to redraw, which
	 * is the one caller that has nothing to do with the deprecation. Obsidian
	 * still invokes `display()`; the plugin does not have to.
	 */
	private redraw(): void {
		const { containerEl } = this;

		// A redraw empties and rebuilds the tab. Preserve the scroll
		// position and the focused control (by its focus id) across it, or
		// every interaction snaps the page to the top and drops focus.
		const scroller = this.findScroller();
		const scrollTop = scroller.scrollTop;
		const active = containerEl.ownerDocument.activeElement;
		const focusId =
			active && active.instanceOf(HTMLElement)
				? active.dataset.sheetsmithFocus
				: undefined;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Layout folder')
			.setDesc('Folder where sheet layouts are stored.')
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

		// Restore only after the async layout section has appended, or the
		// still-short page would clamp the position back toward zero.
		void this.layoutEditor.render(containerEl).then(() => {
			scroller.scrollTop = scrollTop;
			if (focusId) this.refocus(focusId);
		});
	}

	private refocus(focusId: string): void {
		for (const candidate of Array.from(
			this.containerEl.querySelectorAll('[data-sheetsmith-focus]'),
		)) {
			if (
				candidate.instanceOf(HTMLElement) &&
				candidate.dataset.sheetsmithFocus === focusId
			) {
				candidate.focus({ preventScroll: true });
				return;
			}
		}
	}

	/** The nearest scrollable ancestor of the tab content. */
	private findScroller(): HTMLElement {
		let el: HTMLElement | null = this.containerEl;
		while (el) {
			const style = el.win.getComputedStyle(el);
			if (
				el.scrollHeight > el.clientHeight &&
				(style.overflowY === 'auto' || style.overflowY === 'scroll')
			) {
				return el;
			}
			el = el.parentElement;
		}
		return this.containerEl;
	}
}
