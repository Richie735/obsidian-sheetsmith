// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type SheetsmithPlugin from '../main';
import { serialiseLayout } from '../parse/layout';
import {
	App,
	MarkdownView,
	Menu,
	TFile,
	View,
	WorkspaceLeaf,
} from '../test/obsidian-stub';
import { LAYOUT_FOLDER } from '../test/plugin';
import { fixture } from '../test/layout-editor-pane';
import {
	commandOf,
	loadPlugin,
	pressCommand,
	unloadPlugin,
} from '../test/plugin-shell';
import { openView, showFile } from '../test/workspace';
import { SheetView, VIEW_TYPE_SHEET } from './sheet-view';

/*
 * The toggle SPEC §8 promises, in both directions: two header actions and two
 * commands, and the one behaviour each pair shares (GitHub issue #3).
 *
 * Driven through the plugin's own `onload`, so auto-open and the action run as
 * registered. **The double fires no event of its own**, so each case fires what
 * Obsidian 1.15.0 was measured firing for that move: `layout-change` for a leaf
 * navigating, in the background or not, and `metadataCache` `changed` for the
 * key arriving under a view that stays put. `open-as-sheet.ts` records that
 * measurement, which no test here can repeat.
 */

const KEYED = 'Characters/Aramil.md';
const SECOND = 'Characters/Lia.md';
const PLAIN = 'Notes/Plain.md';
const KEY_BLOCK = '---\nsheet-layout: Test sheet\n---\n';

let app: App;
let plugin: SheetsmithPlugin;
let host: HTMLElement;

/** A view opened into a leaf of its own, in an element of its own. */
async function open<T extends object>(view: new (leaf: never) => T): Promise<T> {
	const parent = document.createElement('div');
	host.appendChild(parent);
	return openView(app, parent, view);
}

async function markdownOn(path: string): Promise<MarkdownView> {
	const view = await open(MarkdownView);
	await showFile(view, path);
	app.workspace.trigger('layout-change');
	return view;
}

async function sheetOn(path: string): Promise<SheetView> {
	const parent = document.createElement('div');
	host.appendChild(parent);
	const view = await openView(app, parent, SheetView, plugin);
	await showFile(view, path);
	return view;
}

function actionOf(view: { containerEl: HTMLElement }, title: string): HTMLElement | null {
	return view.containerEl.querySelector<HTMLElement>(
		`.view-header .view-actions .view-action[aria-label="${title}"]`,
	);
}

const wayBack = (view: { containerEl: HTMLElement }) => actionOf(view, 'Open as sheet');

/** Write a note's text, and fire what the app fires once it has indexed it. */
async function rewrite(path: string, content: string): Promise<void> {
	const file = app.vault.getFileByPath(path);
	if (!(file instanceof TFile)) throw new Error(`no note at "${path}"`);
	await app.vault.modify(file, content);
	app.metadataCache.trigger('changed', file, content, {});
}

function requested(view: { leaf: unknown }): WorkspaceLeaf['viewStates'] {
	return (view.leaf as WorkspaceLeaf).viewStates;
}

beforeEach(async () => {
	app = new App();
	host = document.createElement('div');
	document.body.replaceChildren(host);
	await app.vault.createFolder(LAYOUT_FOLDER);
	await app.vault.create(
		`${LAYOUT_FOLDER}/Test sheet.sheetsmith`,
		serialiseLayout(fixture()),
	);
	await app.vault.createFolder('Characters');
	await app.vault.createFolder('Notes');
	await app.vault.create(KEYED, KEY_BLOCK);
	await app.vault.create(SECOND, KEY_BLOCK);
	await app.vault.create(PLAIN, 'Nothing here.\n');
	plugin = await loadPlugin(app);
});

describe.each([
	['the header action', (view: SheetView) => actionOf(view, 'Open as Markdown')?.click()],
	['the command', () => void pressCommand(plugin, 'open-as-markdown')],
])('opening a sheet as markdown through %s', (_route, press) => {
	it('keeps the note in markdown for the session and asks for the markdown view', async () => {
		const view = await sheetOn(KEYED);
		await app.workspace.revealLeaf(view.leaf as never);
		requested(view).length = 0;

		press(view);

		expect(plugin.markdownOverrides.has(KEYED)).toBe(true);
		expect(requested(view)).toEqual([
			{ type: 'markdown', state: { file: KEYED } },
		]);
	});
});

describe.each([
	['the header action', (view: MarkdownView) => wayBack(view)?.click()],
	['the command', () => void pressCommand(plugin, 'open-as-sheet')],
])('opening a note as a sheet through %s', (_route, press) => {
	it('clears the override and asks for the sheet view', async () => {
		plugin.markdownOverrides.add(KEYED);
		const view = await markdownOn(KEYED);
		await app.workspace.revealLeaf(view.leaf);
		requested(view).length = 0;

		press(view);

		expect(plugin.markdownOverrides.has(KEYED)).toBe(false);
		expect(requested(view)).toEqual([
			{ type: VIEW_TYPE_SHEET, state: { file: KEYED } },
		]);
	});

	it('works with opening in sheet view turned off', async () => {
		plugin.settings.openInSheetView = false;
		const view = await markdownOn(KEYED);
		await app.workspace.revealLeaf(view.leaf);
		requested(view).length = 0;

		press(view);

		expect(requested(view)).toEqual([
			{ type: VIEW_TYPE_SHEET, state: { file: KEYED } },
		]);
	});
});

/*
 * The lint reads the sentence case of a literal `name:` and not of an `addAction`
 * title, so the action's title is held to the name the lint can see. A menu
 * item's `setTitle` the lint does read, so what holds it here is the wording:
 * one door, one name, wherever it is drawn.
 */
describe('what the two doors are called', () => {
	it('is the command\'s own name on the sheet\'s action, drawn as an icon', async () => {
		const action = actionOf(await sheetOn(KEYED), commandOf(plugin, 'open-as-markdown').name);
		expect(action).not.toBeNull();
		expect(action?.querySelector('svg')).not.toBeNull();
	});

	it('is the command\'s own name on the way-back action, drawn as an icon', async () => {
		const action = actionOf(await markdownOn(KEYED), commandOf(plugin, 'open-as-sheet').name);
		expect(action).not.toBeNull();
		expect(action?.querySelector('svg')).not.toBeNull();
	});

	it('is the command\'s own name on the way-back menu entry, drawn with an icon', async () => {
		const view = await markdownOn(KEYED);
		const menu = new Menu();
		app.workspace.trigger('file-menu', menu, view.file, 'more-options', view.leaf);
		const [item] = menu.items;
		expect(item?.dom.textContent).toBe(commandOf(plugin, 'open-as-sheet').name);
		expect(item?.dom.querySelector('svg')).not.toBeNull();
	});
});

describe('the sheet header action', () => {
	it('is on a sheet with opening in sheet view turned off', async () => {
		plugin.settings.openInSheetView = false;
		expect(actionOf(await sheetOn(KEYED), 'Open as Markdown')).not.toBeNull();
	});
});

describe('the way-back action', () => {
	it('sits on a note carrying the key and on no other', async () => {
		expect(wayBack(await markdownOn(KEYED))).not.toBeNull();
		expect(wayBack(await markdownOn(PLAIN))).toBeNull();
	});

	it('agrees with the command on which notes those are', async () => {
		const keyed = await markdownOn(KEYED);
		await app.workspace.revealLeaf(keyed.leaf);
		expect(pressCommand(plugin, 'open-as-sheet', true)).toBe(true);
		const plain = await markdownOn(PLAIN);
		await app.workspace.revealLeaf(plain.leaf);
		expect(pressCommand(plugin, 'open-as-sheet', true)).toBe(false);
	});

	it('counts a key left empty, as the command and auto-open do', async () => {
		await rewrite(PLAIN, '---\nsheet-layout:\n---\n');
		expect(wayBack(await markdownOn(PLAIN))).not.toBeNull();
	});

	it('is there with opening in sheet view turned off', async () => {
		plugin.settings.openInSheetView = false;
		expect(wayBack(await markdownOn(KEYED))).not.toBeNull();
	});

	it('appears when the key arrives under a view that stays on the file', async () => {
		const view = await markdownOn(PLAIN);
		expect(wayBack(view)).toBeNull();

		await rewrite(PLAIN, KEY_BLOCK);

		expect(wayBack(view)).not.toBeNull();
		expect(view.file?.path).toBe(PLAIN);
	});

	it('goes when the key leaves under a view that stays on the file', async () => {
		const view = await markdownOn(KEYED);

		await rewrite(KEYED, 'No key any more.\n');

		expect(wayBack(view)).toBeNull();
		expect(view.containerEl.querySelector('.view-actions')?.children).toHaveLength(0);
	});

	it('does not linger when the leaf moves to another file, and returns with it', async () => {
		const view = await markdownOn(KEYED);

		await showFile(view, PLAIN);
		app.workspace.trigger('layout-change');
		expect(wayBack(view)).toBeNull();

		await showFile(view, KEYED);
		app.workspace.trigger('layout-change');
		expect(wayBack(view)).not.toBeNull();
	});

	it('opens the file the view holds at the press, not the one it was added for', async () => {
		const view = await markdownOn(KEYED);
		await showFile(view, SECOND);
		app.workspace.trigger('layout-change');
		requested(view).length = 0;

		wayBack(view)?.click();

		expect(requested(view)).toEqual([
			{ type: VIEW_TYPE_SHEET, state: { file: SECOND } },
		]);
	});

	it('is added once however many events say the same thing', async () => {
		const view = await markdownOn(KEYED);

		app.workspace.trigger('layout-change');
		app.workspace.trigger('layout-change');
		await rewrite(KEYED, KEY_BLOCK);

		expect(
			view.containerEl.querySelectorAll('[aria-label="Open as sheet"]'),
		).toHaveLength(1);
	});

	it('answers per leaf, and a change to one note touches only the views on it', async () => {
		const first = await markdownOn(KEYED);
		const second = await markdownOn(KEYED);
		const other = await markdownOn(SECOND);
		const plain = await markdownOn(PLAIN);
		expect(
			[first, second, other, plain].map((view) => wayBack(view) !== null),
		).toEqual([true, true, true, false]);

		await rewrite(KEYED, 'No key any more.\n');

		expect(
			[first, second, other, plain].map((view) => wayBack(view) !== null),
		).toEqual([false, false, true, false]);
	});

	it('leaves a deferred leaf alone, then serves it once it is a real view', async () => {
		/** What a restored leaf holds until first shown: the type, and no more. */
		class DeferredView extends View {
			getViewType(): string {
				return 'markdown';
			}
		}
		const deferred = await open(DeferredView);
		const leaf = deferred.leaf;

		// Neither event may reach for a member a deferred view does not have.
		app.workspace.trigger('layout-change');
		await rewrite(KEYED, KEY_BLOCK);

		const real = new MarkdownView(leaf);
		leaf.containerEl.replaceChildren();
		await leaf.open(real);
		await showFile(real, KEYED);
		app.workspace.trigger('layout-change');
		expect(wayBack(real)).not.toBeNull();
	});

	it('takes in a view already open when the plugin loads', async () => {
		const view = await markdownOn(KEYED);
		unloadPlugin(plugin);
		expect(wayBack(view)).toBeNull();

		plugin = await loadPlugin(app);

		expect(wayBack(view)).not.toBeNull();
	});

	it('leaves nothing behind on unload, and stops answering', async () => {
		const first = await markdownOn(KEYED);
		const second = await markdownOn(SECOND);
		expect(wayBack(first)).not.toBeNull();
		expect(wayBack(second)).not.toBeNull();

		unloadPlugin(plugin);

		expect(host.querySelectorAll('[aria-label="Open as sheet"]')).toHaveLength(0);
		app.workspace.trigger('layout-change');
		await rewrite(KEYED, KEY_BLOCK);
		expect(host.querySelectorAll('[aria-label="Open as sheet"]')).toHaveLength(0);
	});
});

describe('the pane menu', () => {
	it.each(['more-options', 'tab-header'])(
		'offers Open as Markdown in the pane menu for either source, under the command\'s name (%s)',
		async (source) => {
			const view = await sheetOn(KEYED);
			await app.workspace.revealLeaf(view.leaf as never);
			requested(view).length = 0;
			const menu = new Menu();

			view.onPaneMenu(menu as never, source);

			const [item, ...rest] = menu.items;
			expect(rest).toEqual([]);
			expect(item?.dom.textContent).toBe(commandOf(plugin, 'open-as-markdown').name);
			expect(item?.dom.querySelector('svg')).not.toBeNull();
			expect(item?.section).toBe('pane');

			item?.dom.click();

			expect(plugin.markdownOverrides.has(KEYED)).toBe(true);
			expect(requested(view)).toEqual([
				{ type: 'markdown', state: { file: KEYED } },
			]);
		},
	);
});

/*
 * The app raises `file-menu` from a markdown view's `onPaneMenu`, which the
 * double's `MarkdownView` does not, so each case raises it with the arguments
 * Obsidian 1.15.0 was measured passing: the view's leaf for a pane menu, and no
 * leaf for the explorer's.
 */
describe('the way-back menu entry', () => {
	function paneMenu(view: { file: unknown; leaf: unknown }, source: string): Menu {
		const menu = new Menu();
		app.workspace.trigger('file-menu', menu, view.file, source, view.leaf);
		return menu;
	}

	const wayBackItem = (menu: Menu) =>
		menu.items.find((item) => item.dom.textContent === 'Open as sheet');

	it.each(['more-options', 'tab-header', 'sidebar-context-menu'])(
		'is offered on a keyed note for a pane menu (%s)',
		async (source) => {
			plugin.markdownOverrides.add(KEYED);
			const view = await markdownOn(KEYED);
			await app.workspace.revealLeaf(view.leaf);
			requested(view).length = 0;

			const [item, ...rest] = paneMenu(view, source).items;

			expect(rest).toEqual([]);
			expect(item?.dom.textContent).toBe('Open as sheet');
			expect(item?.section).toBe('pane');

			item?.dom.click();

			expect(plugin.markdownOverrides.has(KEYED)).toBe(false);
			expect(requested(view)).toEqual([
				{ type: VIEW_TYPE_SHEET, state: { file: KEYED } },
			]);
		},
	);

	it('is not offered on a plain note', async () => {
		expect(paneMenu(await markdownOn(PLAIN), 'more-options').items).toEqual([]);
	});

	it('is not offered on a sheet, whose own menu has the other door', async () => {
		expect(wayBackItem(paneMenu(await sheetOn(KEYED), 'more-options'))).toBeUndefined();
	});

	it('is not offered in the file explorer, keyed note or not', () => {
		const menu = new Menu();
		app.workspace.trigger(
			'file-menu',
			menu,
			app.vault.getFileByPath(KEYED),
			'file-explorer-context-menu',
		);
		expect(menu.items).toEqual([]);
	});

	it('is not offered for another menu on a keyed note\'s leaf', async () => {
		const view = await markdownOn(KEYED);
		expect(paneMenu(view, 'link-context-menu').items).toEqual([]);
	});

	it('is offered with opening in sheet view turned off', async () => {
		plugin.settings.openInSheetView = false;
		expect(wayBackItem(paneMenu(await markdownOn(KEYED), 'more-options'))).toBeDefined();
	});

	it('reads the key at the press, so a note given it in place is offered it', async () => {
		const view = await markdownOn(PLAIN);
		await rewrite(PLAIN, KEY_BLOCK);
		expect(wayBackItem(paneMenu(view, 'more-options'))).toBeDefined();
	});

	it('stops being offered on unload', async () => {
		const view = await markdownOn(KEYED);
		unloadPlugin(plugin);
		expect(paneMenu(view, 'more-options').items).toEqual([]);
	});
});

describe('the toggle and auto-open', () => {
	/** A markdown view on the note, whose arrival nothing has announced yet. */
	async function arriving(path: string): Promise<MarkdownView> {
		const view = await open(MarkdownView);
		await showFile(view, path);
		requested(view).length = 0;
		return view;
	}

	it('does not flip a note the markdown action just opened', async () => {
		const sheet = await sheetOn(KEYED);
		actionOf(sheet, 'Open as Markdown')?.click();
		const view = await arriving(KEYED);

		app.workspace.trigger('layout-change');

		expect(requested(view)).toEqual([]);
		expect(wayBack(view)).not.toBeNull();
	});

	it('takes over again once the way-back action has cleared the override', async () => {
		plugin.markdownOverrides.add(KEYED);
		const pressed = await markdownOn(KEYED);
		wayBack(pressed)?.click();

		const reopened = await arriving(KEYED);
		app.workspace.trigger('layout-change');

		expect(requested(reopened)).toEqual([
			{ type: VIEW_TYPE_SHEET, state: { file: KEYED } },
		]);
	});

	it('leaves the switching to the reader with the setting off, action or no action', async () => {
		plugin.settings.openInSheetView = false;
		const view = await arriving(KEYED);

		app.workspace.trigger('layout-change');

		expect(requested(view)).toEqual([]);
		expect(wayBack(view)).not.toBeNull();
	});
});
