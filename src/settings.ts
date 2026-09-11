import {
	App,
	PluginSettingTab,
	Setting,
	SettingDefinitionItem,
} from 'obsidian';
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
 * The tab describes itself to Obsidian as data.
 *
 * `getSettingDefinitions()` is Obsidian 1.13's settings API: a tab returns its
 * rows rather than drawing them, and the app indexes each row's `name`, `desc`
 * and `aliases` so a reader who types "character folder" into **Settings**
 * search finds this one. `display()` is the older path, still there as a
 * fallback for plugins supporting an earlier app, and deprecated since 1.13.0.
 *
 * **All four rows keep their own element, and that is the whole design.**
 * A definition either names a `control` — a key the framework reads and writes —
 * or supplies a `render` callback that receives the row's `Setting` and builds
 * whatever it likes. Both are equally searchable: the search scores the
 * definition and never looks at the control, which is why Obsidian's own
 * Appearance and About tabs are mostly `render` rows. So the choice is about who
 * owns the input, and no row here can give its own away. Two of them could not
 * under any floor:
 *
 * - **The layout folder** substitutes the default when emptied and rewrites the
 *   box on blur, so what is on screen agrees with what is in effect. No `control`
 *   can do that. `validate` rejects a value without replacing it, `defaultValue`
 *   covers `undefined` and `null` rather than `''`, and the framework never reads
 *   a stored value back into an input: `refreshDomState()` re-evaluates only
 *   `visible` and `disabled`, and the full rebuild skips the row holding the
 *   active element precisely *when that row is a `control`* — so a control is the
 *   one shape whose box is guaranteed never to be rewritten. A substituting
 *   `control` would store the default and leave the field reading empty.
 * - **The character folder** carries its own `aria-label`, because Obsidian draws
 *   a row's name in a sibling `div` — `Setting.setName` is still
 *   `nameEl.setText(name)` in 1.13.7 — so the input is programmatically nameless
 *   and a `text` control would leave it that way.
 *
 * The other two are `render` rows for a reason that is about the floor rather
 * than about them. **The sheet-view toggle is a plain bind and is still not
 * spelled as one**: a `control` is bound by the 1.13 renderer, so the row would
 * be blank on every version `display()` below exists for, and one mechanism that
 * works on both floors beats a better one that works on the higher. The layout
 * editor button would not be a `control` in any case — `action` makes the whole
 * row clickable, where this wants a call-to-action button inside it.
 *
 * **What the move gave up**, recorded because it is the tempting part: a `folder`
 * control attaches Obsidian's own folder suggester to the input, and neither
 * folder row has completion today. It arrives only with `control`, which costs
 * the two behaviours above. The route that keeps everything is a `render` row
 * adding `AbstractInputSuggest` itself, which is public API and a feature of its
 * own rather than a migration. `docs/features/declarative-settings.md` argues all
 * of this, and every claim about the app in it was read out of 1.13.7's `app.js`.
 */
/**
 * A row as this tab spells one.
 *
 * Narrower than `SettingDefinitionItem` in the two ways that matter: `name` and
 * `desc` are required, because a row missing either is a row missing from
 * settings search, and `render` takes only the `Setting`. Assignable to
 * `SettingDefinitionRender`, so `getSettingDefinitions()` returns these
 * unchanged.
 */
interface SheetsmithRow {
	name: string;
	desc: string | DocumentFragment;
	render: (setting: Setting) => void;
}

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

	/*
	 * The rows, once, for both render paths.
	 *
	 * `getSettingDefinitions()` hands these to Obsidian 1.13 and `display()`
	 * walks them for anything older, so a row is spelled in one place and
	 * neither path can drift from the other. `SheetsmithRow` is narrower than
	 * `SettingDefinitionItem` on purpose: every row here has a name, a
	 * description and its own renderer, and a renderer that takes only the
	 * `Setting` is what lets `display()` call it without a `SettingGroup` —
	 * which is itself a 1.11 API this plugin's floor sits below.
	 */
	private rows(): SheetsmithRow[] {
		return [
			{
				name: 'Layout folder',
				desc:
					// The label already says it is the folder for layouts. What it
					// cannot say is what depends on it: lookup is by name inside
					// this folder only, so moving the folder without moving the
					// layouts leaves every character reporting a layout it can no
					// longer find.
					'Layouts are found here by name. A character naming one that is not in this folder reports it as missing instead of rendering.',
				render: (setting) => {
					setting.addText((text) => {
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
				},
			},
			{
				name: 'Character folder',
				desc:
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
					 *
					 * **Sentence case is held by review here, not by the linter.**
					 * `obsidianmd/ui/sentence-case` reads the argument of `setDesc`
					 * and does not read a `desc` property, so this string and the
					 * three other names and descriptions in this method are out of
					 * its reach — which is also why the `ignoreRegex` exemption this
					 * file used to carry is gone rather than merely unused. Arrow
					 * notation quoting the app's own labels keeps their capitals;
					 * everything else is sentence case.
					 */
					'New characters are written here, and the folder is created if it is missing. Leave it empty to follow Settings → Files\u00a0and\u00a0links → Default\u00a0location\u00a0for\u00a0new\u00a0notes.',
				render: (setting) => {
					setting.addText((text) => {
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
						 *
						 * **This is the member a `control` would have cost**, and the
						 * reason the row is a `render`: a `text` control renders through
						 * plain `addText` and sets no accessible name, so the repair has
						 * nowhere to go.
						 */
						text.inputEl.setAttribute('aria-label', 'Character folder');
					});
				},
			},
			{
				name: 'Open sheets in sheet view',
				desc: createFragment((fragment) => {
					fragment.appendText('Notes with a ');
					fragment.createEl('code', { text: LAYOUT_KEY });
					fragment.appendText(
						' property open as a rendered sheet instead of Markdown.',
					);
				}),
				/*
				 * **A `render` row, though it is the one plain bind on the tab.**
				 * `control: { type: 'toggle', key: 'openInSheetView' }` is what
				 * this wants to be, and it cannot be: a `control` is read and
				 * written by the framework, which is the 1.13 renderer, so the row
				 * would be blank on the versions `display()` exists for. One
				 * mechanism that works on both floors beats a better one that
				 * works on the higher.
				 */
				render: (setting) => {
					setting.addToggle((toggle) =>
						toggle
							.setValue(this.plugin.settings.openInSheetView)
							.onChange(async (value) => {
								this.plugin.settings.openInSheetView = value;
								await this.plugin.saveSettings();
							}),
					);
				},
			},
			{
				name: 'Layout editor',
				desc:
					// Where it went, not what it is. The editor used to be on this
					// page, so a reader who remembers it here needs the sentence to
					// say that it moved rather than to describe authoring in general.
					'Layouts are designed in a pane of their own, so a sheet can sit beside one.',
				render: (setting) => {
					setting.addButton((button) =>
						button
							.setButtonText('Open layout editor')
							.setCta()
							.onClick(() => void openLayoutEditor(this.plugin)),
					);
				},
			},
		];
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return this.rows();
	}

	/*
	 * The pre-1.13 path, and it is a fallback rather than a leftover.
	 *
	 * `manifest.json` declares `minAppVersion: 1.9.0`, which is accurate for
	 * every other line in this plugin — nothing else here reaches an API newer
	 * than that. `getSettingDefinitions()` does not exist below 1.13, and on
	 * those versions the base class's `display()` is the only thing that draws a
	 * tab at all, so deleting this would leave the whole settings tab blank for
	 * anyone who has not updated. That is a worse trade than a search index is
	 * worth, so the floor stays where the rest of the code puts it and this
	 * method covers the gap.
	 *
	 * It is dead code on a current Obsidian: `renderTab()` is
	 * `settingItems.length > 0 ? paint(definitions) : this.display()`, and the
	 * definitions are never empty. `settings.test.ts` drives it anyway, because
	 * a fallback nothing exercises is a fallback nobody knows is broken.
	 *
	 * Deprecated since 1.13.0, and implemented deliberately: the typings say to
	 * "implement display() as a fallback for plugins that need to support"
	 * earlier versions, which is exactly this.
	 */
	display(): void {
		this.containerEl.empty();
		for (const row of this.rows()) {
			// The same three calls the 1.13 renderer makes, in the same order, so
			// a `render` callback meets an identically prepared row either way.
			const setting = new Setting(this.containerEl);
			setting.setName(row.name);
			setting.setDesc(row.desc);
			row.render(setting);
		}
	}
}
