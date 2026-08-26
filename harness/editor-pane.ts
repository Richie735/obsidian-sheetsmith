/*
 * Renders the plugin's real layout editor pane — where a sheet is actually
 * designed — outside Obsidian.
 *
 * The view is the genuine `LayoutEditorView` in a genuine leaf, so what appears
 * is the frame a user works in: the leaf's own box, its header, and the pane's
 * two columns inside it. Editing here writes the real serialised JSON back into
 * the stub vault, and the callback re-renders the sheet from it — which closes
 * the loop the two surfaces have in the app and nowhere else: change a
 * component's config, watch the card change.
 */

import { App } from '../src/test/obsidian-stub';
import { openView } from '../src/test/workspace';
import { LayoutEditorView } from '../src/view/layout-editor-view';
import { Layout } from '../src/parse/layout';
import { fakePlugin } from '../src/test/plugin';
import { LayoutSource, plantLayout, watchLayoutFile } from './stub-app';

/** Which of the pane's own controls a view wants driven. */
export interface PaneView {
	/**
	 * A component id whose settings to open — a Table's rows and columns lists
	 * are most of what the layout editor is, and a screenshot has no way to
	 * click. The layout's own settings are `::sheet::`, which is the selection's
	 * word for the top level.
	 */
	open?: string;
	/** An **Add component** option to select, as a type id or `<type>:<index>`. */
	choice?: string;
}

export interface PaneHost {
	/** Called whenever the editor saves, with the layout as it now stands. */
	onLayoutChange: (layout: Layout) => void;
}

export async function renderEditorPane(
	container: HTMLElement,
	host: PaneHost,
	/**
	 * The layout to put in the stub vault, so both surfaces read one — or
	 * `'none'` or `'broken'`, which are the two states the editor draws instead
	 * of a tree and which have no other way of being reached here.
	 */
	layout: LayoutSource,
	/**
	 * Which of the pane's own controls to drive once it has drawn, for the views
	 * that live inside one. Every one of these presses the control a user would
	 * press rather than reaching into the view's state, so the harness stays a
	 * page that clicks buttons.
	 */
	view: PaneView = {},
): Promise<void> {
	const app = new App();
	watchLayoutFile(app.vault, host.onLayoutChange);
	await plantLayout(app, layout);

	const pane = await openView(
		app,
		container,
		LayoutEditorView,
		fakePlugin(app),
	);
	if (view.open !== undefined) await select(pane.contentEl, view.open);
	if (view.choice !== undefined) await chooseAdd(pane.contentEl, view.choice);
}

/**
 * Wait for one of the pane's controls to exist, by its focus token.
 *
 * A view's first render starts asynchronously and nothing it draws exists when
 * `openView` resolves — hence the wait rather than a straight query. The token is
 * the address because the editor already gives every control one, to restore
 * focus across its own rebuilds.
 */
async function control(
	root: HTMLElement,
	token: string,
): Promise<HTMLElement | null> {
	const selector = `[data-sheetsmith-focus="${token}"]`;
	for (let attempt = 0; attempt < 40; attempt++) {
		const el = root.querySelector(selector);
		if (el instanceof HTMLElement) return el;
		await new Promise((resolve) => window.setTimeout(resolve, 25));
	}
	return null;
}

/** Press a tree row's name, which is what selects it. */
async function select(root: HTMLElement, id: string): Promise<void> {
	const row = await control(root, `edit-${id}`);
	if (row === null) {
		console.warn(`No "${id}" in the tree to select.`);
		return;
	}
	row.click();
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
		console.warn('No add menu in the pane.');
		return;
	}
	if (!Array.from(menu.options).some((option) => option.value === value)) {
		console.warn(`No add choice "${value}". Try a type id, or "<type>:<index>".`);
		return;
	}
	menu.value = value;
	menu.dispatchEvent(new Event('change'));
}
