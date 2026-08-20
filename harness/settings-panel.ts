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
import { Sample, SAMPLES } from './samples';

const FOLDER = 'Sheetsmith layouts';
const LAYOUT_NAME = 'Harness sheet';

/**
 * The layout the sheet side renders, as a file the editor can open.
 *
 * Takes its components, because the two surfaces have to be looking at the
 * same layout: the sheet swaps configs when the state changes, and a settings
 * tab still holding the populated layout would show a healthy form beside a
 * card rendering an error — the instrument disagreeing with itself, which is
 * worse than showing nothing (UI.md §11).
 */
export function harnessLayout(samples: readonly Sample[] = SAMPLES): Layout {
	return {
		name: LAYOUT_NAME,
		columns: 12,
		components: samples.map((sample) => sample.config),
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
async function fakePlugin(app: App, layout: Layout): Promise<SheetsmithPlugin> {
	await app.vault.createFolder(FOLDER);
	await app.vault.create(
		`${FOLDER}/${LAYOUT_NAME}.json`,
		serialiseLayout(layout),
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
	/** The layout to put in the stub vault, so both surfaces read one. */
	layout: Layout,
	/**
	 * A component id whose form to open once the tab has drawn, for the views
	 * that live inside one — a Table's rows and columns lists are most of what
	 * the layout editor is, and a screenshot has no way to click.
	 *
	 * Opened through the tab's own edit control rather than by reaching into
	 * its state, so the harness stays a page that presses the buttons a user
	 * would.
	 */
	open?: string,
): Promise<void> {
	const app = new App();
	watchLayoutFile(app.vault, host.onLayoutChange);
	const plugin = await fakePlugin(app, layout);

	const tab = new SheetsmithSettingTab(
		app as unknown as ConstructorParameters<typeof SheetsmithSettingTab>[0],
		plugin,
	);
	container.replaceChildren();
	container.appendChild(tab.containerEl);
	tab.display();
	if (open !== undefined) await openComponent(tab.containerEl, open);
}

/**
 * Press a component's edit control once the tab has drawn it.
 *
 * `display()` starts the layout loading and returns, so the control does not
 * exist yet when it does — hence the wait rather than a straight query.
 */
async function openComponent(root: HTMLElement, id: string): Promise<void> {
	const selector = `[data-sheetsmith-focus="edit-${id}"]`;
	for (let attempt = 0; attempt < 40; attempt++) {
		const edit = root.querySelector(selector);
		if (edit instanceof HTMLElement) {
			edit.click();
			return;
		}
		await new Promise((resolve) => window.setTimeout(resolve, 25));
	}
	console.warn(`No component "${id}" on the settings tab to open.`);
}
