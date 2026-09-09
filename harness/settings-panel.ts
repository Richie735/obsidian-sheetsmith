/*
 * Renders the plugin's real settings tab outside Obsidian.
 *
 * Three preferences and a button that opens the layout editor, which is all this
 * tab is since the editor moved into a pane of its own — and it is still worth
 * a surface: what it draws is Obsidian's own settings chrome, and the harness is
 * where a row that has stopped lining up with the app's is noticed. The two
 * folder rows are the pair to look at together: one holds a real value and one
 * ships empty showing its placeholder, which is what says at a glance that one
 * of them has a default and the other defers to the app.
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
	/**
	 * The layout to put in the stub vault, so the *layout* folder preference
	 * names one. The character folder names nothing on purpose: empty is its
	 * shipped value.
	 */
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
