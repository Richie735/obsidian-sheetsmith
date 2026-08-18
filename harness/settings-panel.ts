/*
 * Renders the plugin's real settings tab — and so the layout editor, which is
 * where most of a sheet is actually configured — outside Obsidian.
 *
 * Everything here is scaffolding standing in for the app: a plugin object with
 * settings and a save, and an in-memory vault holding one layout file. The tab
 * itself is the real `SheetsmithSettingTab`, not a copy, so what appears is
 * what a user configures against.
 *
 * Editing a layout here writes the real serialised JSON back into the stub
 * vault, and the callback re-renders the sheet from it. That closes the loop
 * the two surfaces have in the app and nowhere else: change a component's
 * config, watch the card change.
 */

import { App, Vault } from '../src/test/obsidian-stub';
import { SheetsmithSettingTab, DEFAULT_SETTINGS } from '../src/settings';
import type SheetsmithPlugin from '../src/main';
import { Layout, serialiseLayout, parseLayout } from '../src/parse/layout';
import { SAMPLES } from './samples';

const FOLDER = 'Sheetsmith layouts';
const LAYOUT_NAME = 'Harness sheet';

/** The layout the sheet side renders, as a file the editor can open. */
export function harnessLayout(): Layout {
	return {
		name: LAYOUT_NAME,
		columns: 12,
		components: SAMPLES.map((sample) => sample.config),
		functions: ['mod(score) = floor((score - 10) / 2)'],
		triggers: ['Long rest', 'Short rest'],
	};
}

export interface SettingsHost {
	/** Called whenever the editor saves, with the layout as it now stands. */
	onLayoutChange: (layout: Layout) => void;
}

/**
 * Build the stand-in plugin. Typed through `unknown` deliberately: the real
 * class extends Obsidian's `Plugin`, which the stub does not implement beyond
 * what the settings tab touches, and pretending otherwise would hide which
 * members are actually reached.
 */
async function fakePlugin(app: App): Promise<SheetsmithPlugin> {
	await app.vault.createFolder(FOLDER);
	await app.vault.create(
		`${FOLDER}/${LAYOUT_NAME}.json`,
		serialiseLayout(harnessLayout()),
	);
	const plugin = {
		app,
		settings: { ...DEFAULT_SETTINGS, layoutFolder: FOLDER },
		markdownOverrides: new Set<string>(),
		async saveSettings() {},
		async loadSettings() {},
		addSettingTab() {},
		registerView() {},
		registerEvent() {},
		addCommand() {},
	};
	return plugin as unknown as SheetsmithPlugin;
}

/**
 * Watch the layout file for writes rather than hooking the editor.
 *
 * The editor saves through `app.vault.modify`, and giving the harness its own
 * notification would mean the harness knowing when a save happens — which is
 * exactly the coupling the plugin does not have. Wrapping the vault keeps the
 * editor unmodified and unaware.
 */
function watchLayoutFile(vault: Vault, onChange: (layout: Layout) => void): void {
	const modify = vault.modify.bind(vault);
	vault.modify = async (file, content) => {
		await modify(file, content);
		try {
			onChange(parseLayout(content));
		} catch {
			// An in-progress edit can leave the file briefly unparseable. The
			// editor reports that itself; the sheet simply keeps the last good
			// layout rather than blanking.
		}
	};
}

export async function renderSettings(
	container: HTMLElement,
	host: SettingsHost,
): Promise<void> {
	const app = new App();
	watchLayoutFile(app.vault, host.onLayoutChange);
	const plugin = await fakePlugin(app);

	const tab = new SheetsmithSettingTab(
		app as unknown as ConstructorParameters<typeof SheetsmithSettingTab>[0],
		plugin,
	);
	container.replaceChildren();
	container.appendChild(tab.containerEl);
	tab.display();
}
