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
 *
 * **Rendered through `update()`, which is Obsidian 1.13's path**, so what the
 * shots show is the grouped card the app draws: one shared card with hairline
 * dividers, capped at `--setting-group-max-width` and centred, rather than four
 * separately-carded rows. Both halves of that had to be true at once — the
 * double builds the `.setting-group` wrapper and `calibrate.mjs` collects the
 * rules anchored on it — and while only one of them was, this surface
 * photographed the *older* imperative look while claiming to show the current
 * one. The tab's own `display()` fallback still draws the four cards, for the
 * versions below 1.13 it exists for, and nothing here renders that path;
 * `settings.test.ts` does.
 *
 * **The `requireApiVersion` guard below is that paragraph written as code.**
 * `update()` arrived in 1.13 and `manifest.json` declares a floor of 1.9.0, so
 * an unguarded call is a plugin reaching four minor versions past what it
 * claims to support — which is what `obsidianmd/no-unsupported-api` reports,
 * and it is right to, whatever the prose above says. The guard is the
 * difference between a decision and an oversight, and it costs one `if`. The
 * stub answers `true`, because the stub implements one Obsidian and it is the
 * newest one.
 */

import { App, requireApiVersion } from '../src/test/obsidian-stub';
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
	if (requireApiVersion('1.13.0')) tab.update();
}
