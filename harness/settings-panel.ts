/*
 * Renders the plugin's real settings tab outside Obsidian.
 *
 * Two preferences and a button that opens the layout editor, which is all this
 * tab is since the editor moved into a pane of its own — and it is still worth
 * a surface: what it draws is Obsidian's own settings chrome, and the harness is
 * where a row that has stopped lining up with the app's is noticed.
 *
 * The tab itself is the real `SheetsmithSettingTab`, not a copy.
 */

import { App } from '../src/test/obsidian-stub';
import { SheetsmithSettingTab } from '../src/settings';
import { Layout } from '../src/parse/layout';
import { fakePlugin } from '../src/test/plugin';
import { plantLayout } from './stub-app';

export async function renderSettings(
	container: HTMLElement,
	/** The layout to put in the stub vault, so the folder preference names one. */
	layout: Layout,
): Promise<void> {
	const app = new App();
	await plantLayout(app, layout);
	const plugin = fakePlugin(app);

	const tab = new SheetsmithSettingTab(
		app as unknown as ConstructorParameters<typeof SheetsmithSettingTab>[0],
		plugin,
	);
	container.replaceChildren();
	container.appendChild(tab.containerEl);
	tab.display();
}
