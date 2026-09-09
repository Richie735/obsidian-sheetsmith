import { App, PluginSettingTab, Setting } from 'obsidian';
import SheetsmithPlugin from './main';
import { LAYOUT_KEY } from './types';
import { openLayoutEditor } from './view/layout-editor-view';

export interface SheetsmithSettings {
	/** Vault folder holding layout files. */
	layoutFolder: string;
	/**
	 * Vault folder a new character note is written to, or `''` for the app's own
	 * **Default location for new notes**.
	 *
	 * The empty value is the shipped one and is not a missing setting: it is an
	 * override that has not been asked for, so an untouched install creates
	 * characters exactly where every other note-creating gesture in the app
	 * does. That is why this folder's empty value falls back to an app setting
	 * where `layoutFolder`'s falls back to a folder name — a layout is looked up
	 * by name inside its folder and a character note is looked up by nothing
	 * (`docs/features/character-folder.md`).
	 */
	characterFolder: string;
	/** Open notes carrying the layout key in sheet view rather than markdown view. */
	openInSheetView: boolean;
}

export const DEFAULT_SETTINGS: SheetsmithSettings = {
	layoutFolder: 'Sheetsmith layouts',
	characterFolder: '',
	openInSheetView: true,
};

/*
 * Obsidian 1.13 asks a settings tab to describe itself declaratively through
 * `getSettingDefinitions()`, so the app can index each setting for search.
 *
 * This tab used to answer that with "most of it is the interim layout editor,
 * and static definitions cannot describe a form whose shape is decided at
 * runtime". That answer has expired: the editor is a workspace pane now, and
 * what is left here is three preferences and a button, which is exactly the
 * shape the declarative API is for.
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
 * **Neither folder preference is a plain bind, and they are not a plain bind in
 * two different ways.** An emptied layout folder falls back to the default
 * rather than being rejected, because an empty folder silently relocates layout
 * lookup and creation to the vault root — and the displayed value is rewritten
 * on blur so what is on screen is what is in effect. `validate` rejects a
 * value; it does not substitute one. The character folder substitutes nothing
 * and rewrites nothing, but it still trims, and a trim is a value the framework
 * would have to be told to make rather than one it can read off a control.
 *
 * **Waiting on:** a stub that renders `getSettingDefinitions()`, so the
 * adoption can be looked at rather than assumed, and a decision on whether an
 * emptied layout folder is an error or a fallback. The rule is turned off for
 * this file in eslint.config.mts, because the plugin's own config forbids
 * silencing it inline.
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
			.setName('Character folder')
			.setDesc(
				/*
				 * Both directions, per `docs/PATTERNS.md` §8: what a folder does,
				 * and what an empty field defers to. The second half is the one
				 * the label cannot carry, because "empty" is this field's
				 * default and reads as unset unless something names what
				 * answers instead.
				 *
				 * **The `\u00a0` escapes hold each app label together.**
				 * `AGENTS.md` asks for arrow notation, and a label that wraps
				 * mid-phrase defeats it — at the shipped shot's own column width
				 * this broke after "Files and" and opened the next line with
				 * "links →", which reads as a step named "links". They sit
				 * *inside* the two multi-word labels only; the spaces around the
				 * arrows stay breakable, so the path still wraps at its own joints
				 * and the longest unbreakable run is one label. Written as escapes
				 * because the whole point is a space that does not look like the
				 * one beside it, and a pasted one is invisible to every reader of
				 * this file.
				 */
				'New characters are written here, and the folder is created if it is missing. Leave it empty to follow Settings → Files\u00a0and\u00a0links → Default\u00a0location\u00a0for\u00a0new\u00a0notes.',
			)
			.addText((text) => {
				text
					/*
					 * **A value, not a sentence, because the box is 146px and the
					 * app's own label is 181px of text.** This read `Default
					 * location for new notes`, which was cut mid-phrase to
					 * "Default location for new" with nothing marking that more
					 * existed — `docs/UI.md` §12's own defect class, a hard cut
					 * that reads as damaged data rather than as truncation. And it
					 * had no route out: on an empty field `scrollWidth` equals
					 * `clientWidth`, so a reveal-on-truncation cannot fire, and
					 * widening the input is not available either — the 164px is
					 * the UA default and Obsidian sets no width on a settings-row
					 * input anywhere, its own **Attachment folder path** included.
					 *
					 * So the string is what changes, which is also what matches
					 * the app: every `setPlaceholder` in 1.13.7 is a short hint or
					 * a default *value* — `Attachments` for that very row — never a
					 * sentence. This says where the note goes when the field is
					 * empty, in the app's own terms, and nothing is lost because
					 * the full label path is in the description above, verbatim.
					 */
					.setPlaceholder('Same as new notes')
					.setValue(this.plugin.settings.characterFolder)
					.onChange(async (value) => {
						// Trimmed and stored as it comes, with no fallback: empty
						// is a legal value here and means the app answers, so a
						// field of spaces has to mean empty rather than a folder
						// named `   `.
						this.plugin.settings.characterFolder = value.trim();
						await this.plugin.saveSettings();
					});
				/*
				 * **No `blur` listener, deliberately, and the layout folder row
				 * above is not the precedent it looks like.** There an emptied
				 * field means the default folder is in effect, so a box left
				 * reading empty would be a control lying about its value. Here
				 * empty *is* the value the reader chose, and writing anything
				 * into the box on blur would take that choice away in the one
				 * gesture — clear the field, click away — that expresses it.
				 */

				/*
				 * **The row's name, again, as the accessible name.** Obsidian
				 * draws a settings row's name in a sibling element rather than a
				 * `<label for>`, so this input is programmatically nameless and a
				 * screen reader falls through to the placeholder — announcing a
				 * folder field as "Same as new notes", which never says
				 * *character*.
				 *
				 * `docs/UI.md` §12's rule is that `aria-label` replaces a name,
				 * so it must not invent a word the control does not show: this is
				 * the row's own visible name to the character, which is what WCAG
				 * 2.5.3 asks and what leaves voice control something to match.
				 * The two literals therefore have to stay identical — spelled out
				 * twice rather than shared through a constant, because
				 * `obsidianmd/ui/sentence-case` reads a literal and would stop
				 * checking the visible name if it came from a variable.
				 */
				text.inputEl.setAttribute('aria-label', 'Character folder');
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
