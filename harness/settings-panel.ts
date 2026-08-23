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

/** Which of the settings tab's own controls a view wants driven. */
export interface SettingsView {
	/**
	 * A component id whose form to open — a Table's rows and columns lists are
	 * most of what the layout editor is, and a screenshot has no way to click.
	 */
	open?: string;
	/** An **Add component** option to select, as a type id or `<type>:<index>`. */
	choice?: string;
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
	 * Which of the tab's own controls to drive once it has drawn, for the views
	 * that live inside one. Every one of these presses the control a user would
	 * press rather than reaching into the tab's state, so the harness stays a
	 * page that clicks buttons.
	 *
	 * An object rather than a trailing parameter each: `src/formula/`'s resolvers
	 * grew to five of those before somebody stopped (SPEC §12), and two is where
	 * the choice is still free.
	 */
	view: SettingsView = {},
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
	if (view.open !== undefined) await openComponent(tab.containerEl, view.open);
	if (view.choice !== undefined) await chooseAdd(tab.containerEl, view.choice);
}

/**
 * Wait for one of the tab's controls to exist, by its focus token.
 *
 * `display()` starts the layout loading and returns, so nothing the editor draws
 * exists yet when it does — hence the wait rather than a straight query. The
 * token is the address because the editor already gives every control one, to
 * restore focus across its own rebuilds.
 */
async function control(root: HTMLElement, token: string): Promise<HTMLElement | null> {
	const selector = `[data-sheetsmith-focus="${token}"]`;
	for (let attempt = 0; attempt < 40; attempt++) {
		const el = root.querySelector(selector);
		if (el instanceof HTMLElement) return el;
		await new Promise((resolve) => window.setTimeout(resolve, 25));
	}
	return null;
}

/** Press a component's edit control, which opens its form. */
async function openComponent(root: HTMLElement, id: string): Promise<void> {
	const edit = await control(root, `edit-${id}`);
	if (edit === null) {
		console.warn(`No component "${id}" on the settings tab to open.`);
		return;
	}
	edit.click();
}

/**
 * Select one option of the **Add component** menu.
 *
 * Without this the menu can only ever be shot on its first option, which is a
 * bare type — so a palette entry's description, the line that says what the
 * prefill is *for*, was unreachable to any still. A native `<select>` shows only
 * its selection, so the indent still needs a hand on the mouse; the description
 * does not.
 */
async function chooseAdd(root: HTMLElement, value: string): Promise<void> {
	const menu = await control(root, 'add-choice');
	if (!(menu instanceof HTMLSelectElement)) {
		console.warn('No add menu on the settings tab.');
		return;
	}
	if (!Array.from(menu.options).some((option) => option.value === value)) {
		console.warn(`No add choice "${value}". Try a type id, or "<type>:<index>".`);
		return;
	}
	menu.value = value;
	menu.dispatchEvent(new Event('change'));
}
