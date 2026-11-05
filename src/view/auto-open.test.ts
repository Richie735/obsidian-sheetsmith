// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type SheetsmithPlugin from '../main';
import { serialiseLayout } from '../parse/layout';
import { App, MarkdownView, TFile, View, WorkspaceLeaf } from '../test/obsidian-stub';
import { LAYOUT_FOLDER } from '../test/plugin';
import { fixture } from '../test/layout-editor-pane';
import { loadPlugin, unloadPlugin } from '../test/plugin-shell';
import { openView, showFile } from '../test/workspace';
import { SheetView, VIEW_TYPE_SHEET } from './sheet-view';

/*
 * When a note may switch to a sheet (SPEC §8), driven through the plugin's own
 * `onload`.
 *
 * **The double shows none of the ordering this rule answers.** It fires nothing
 * itself, has no capture press, no history and no deferred load, and its cache
 * is synchronous. So each case fires what Obsidian 1.15.0 was measured firing for
 * that move, as `docs/features/auto-open-on-arrival.md`'s table records it, and a
 * `null` answer replaces `getFileCache` for the one case that needs it. A leaf
 * also stays on its view when asked to switch, so `switches` reads the request.
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

/** A markdown view holding `path`, with nothing fired to say so yet. */
async function holding(path: string): Promise<MarkdownView> {
	const view = await open(MarkdownView);
	await showFile(view, path);
	return view;
}

/** What the app does around a leaf moving to a file: the move, then the event. */
async function moveTo(view: MarkdownView, path: string): Promise<void> {
	await showFile(view, path);
	app.workspace.trigger('layout-change');
}

/** Replace what a leaf shows, as the app does when the view type changes. */
async function swapView<T extends View>(leaf: WorkspaceLeaf, next: T): Promise<T> {
	leaf.containerEl.replaceChildren();
	await leaf.open(next);
	return next;
}

function switches(view: { leaf: unknown }): string[] {
	return (view.leaf as WorkspaceLeaf).viewStates
		.filter((state) => state.type === VIEW_TYPE_SHEET)
		.map((state) => state.state?.file as string);
}

function plainNote(): TFile {
	const file = app.vault.getFileByPath(PLAIN);
	if (!(file instanceof TFile)) throw new Error(`no note at "${PLAIN}"`);
	return file;
}

/** What a restored leaf holds until first shown: the type, and no more. */
class DeferredView extends View {
	getViewType(): string {
		return 'markdown';
	}
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
});

describe('after the layout is ready', () => {
	beforeEach(async () => {
		plugin = await loadPlugin(app);
	});

	it('switches a keyed note the first time a leaf shows it', async () => {
		const view = await holding(KEYED);
		expect(switches(view)).toEqual([]);

		app.workspace.trigger('layout-change');

		expect(switches(view)).toEqual([KEYED]);
	});

	it('switches when a leaf moves to a keyed note, and not when it moves to a plain one', async () => {
		const view = await holding(PLAIN);
		app.workspace.trigger('layout-change');
		expect(switches(view)).toEqual([]);

		await moveTo(view, KEYED);
		expect(switches(view)).toEqual([KEYED]);

		await moveTo(view, PLAIN);
		expect(switches(view)).toEqual([KEYED]);
	});

	it('does not switch on activation: neither active-leaf-change nor file-open reaches it', async () => {
		// A keyed note nothing has ever told auto-open about, which is exactly what
		// either event used to switch.
		const view = await holding(KEYED);
		await app.workspace.revealLeaf(view.leaf);

		app.workspace.trigger('active-leaf-change', view.leaf);
		app.workspace.trigger('file-open', view.file);

		expect(switches(view)).toEqual([]);
	});

	it('leaves a note just given the key alone until the leaf leaves and returns', async () => {
		const view = await holding(PLAIN);
		const other = await holding(SECOND);
		app.workspace.trigger('layout-change');
		expect(switches(view)).toEqual([]);
		const file = plainNote();

		// Into the view as well: leaving the file saves its `data` over the note.
		view.data = KEY_BLOCK;
		await app.vault.modify(file, KEY_BLOCK);
		app.metadataCache.trigger('changed', file, KEY_BLOCK, {});
		app.workspace.trigger('active-leaf-change', other.leaf);
		app.workspace.trigger('active-leaf-change', view.leaf);
		app.workspace.trigger('file-open', file);
		app.workspace.trigger('layout-change');
		expect(switches(view)).toEqual([]);

		await moveTo(view, SECOND);
		view.leaf.viewStates.length = 0;
		await moveTo(view, PLAIN);
		expect(switches(view)).toEqual([PLAIN]);
	});

	it('does not read a rename as an arrival', async () => {
		const file = plainNote();
		const view = await holding(PLAIN);
		app.workspace.trigger('layout-change');
		await app.vault.modify(file, KEY_BLOCK);

		await app.vault.rename(file, 'Notes/Renamed.md');
		app.workspace.trigger('layout-change');

		expect(view.file?.path).toBe('Notes/Renamed.md');
		expect(switches(view)).toEqual([]);
	});

	it('does not read sheet to markdown on one file as an arrival', async () => {
		const parent = document.createElement('div');
		host.appendChild(parent);
		const sheet = await openView(app, parent, SheetView, plugin);
		await showFile(sheet, KEYED);
		app.workspace.trigger('layout-change');
		const leaf = sheet.leaf as unknown as WorkspaceLeaf;
		leaf.viewStates.length = 0;

		const markdown = await swapView(leaf, new MarkdownView(leaf));
		await showFile(markdown, KEYED);
		app.workspace.trigger('layout-change');

		expect(switches(markdown)).toEqual([]);
	});

	it('counts a second leaf on the same file as an arrival', async () => {
		const first = await holding(KEYED);
		app.workspace.trigger('layout-change');
		expect(switches(first)).toEqual([KEYED]);

		const second = await holding(KEYED);
		app.workspace.trigger('layout-change');

		expect(switches(second)).toEqual([KEYED]);
		expect(switches(first)).toEqual([KEYED]);
	});

	it('forgets a leaf that showed a view with no file', async () => {
		/** Anything that is neither view: a graph, or the empty tab. */
		class OtherView extends View {
			getViewType(): string {
				return 'graph';
			}
		}
		const view = await holding(KEYED);
		app.workspace.trigger('layout-change');
		const leaf = view.leaf;
		await swapView(leaf, new OtherView(leaf));
		app.workspace.trigger('layout-change');

		const back = await swapView(leaf, new MarkdownView(leaf));
		leaf.viewStates.length = 0;
		await showFile(back, KEYED);
		app.workspace.trigger('layout-change');

		expect(switches(back)).toEqual([KEYED]);
	});

	it('records an arrival whose cache has no answer, and does not switch when the index answers', async () => {
		const answer = app.metadataCache.getFileCache.bind(app.metadataCache);
		app.metadataCache.getFileCache = () => null;
		const view = await holding(KEYED);
		app.workspace.trigger('layout-change');
		expect(switches(view)).toEqual([]);

		app.metadataCache.getFileCache = answer;
		app.metadataCache.trigger('changed', view.file, KEY_BLOCK, {});
		app.workspace.trigger('layout-change');

		expect(switches(view)).toEqual([]);
		expect(
			view.containerEl.querySelector('[aria-label="Open as sheet"]'),
		).not.toBeNull();

		await moveTo(view, PLAIN);
		await moveTo(view, KEYED);
		expect(switches(view)).toEqual([KEYED]);
	});
});

describe('at the layout being ready', () => {
	it('restored: converts every loaded keyed leaf at layout ready', async () => {
		const first = await holding(KEYED);
		const second = await holding(SECOND);
		const plain = await holding(PLAIN);
		app.workspace.layoutReady = false;

		plugin = await loadPlugin(app);

		expect(switches(first)).toEqual([KEYED]);
		expect(switches(second)).toEqual([SECOND]);
		expect(switches(plain)).toEqual([]);
	});

	it('restored: leaves a deferred leaf alone, then converts it when it loads', async () => {
		const deferred = await open(DeferredView);
		const { leaf } = deferred;
		app.workspace.layoutReady = false;
		plugin = await loadPlugin(app);
		app.workspace.trigger('layout-change');
		expect(leaf.viewStates).toEqual([]);

		const real = await swapView(leaf, new MarkdownView(leaf));
		await showFile(real, KEYED);
		app.workspace.trigger('layout-change');

		expect(switches(real)).toEqual([KEYED]);
	});

	it('enabling mid-session converts no open leaf, and a later arrival still does', async () => {
		const view = await holding(KEYED);
		plugin = await loadPlugin(app);
		expect(switches(view)).toEqual([]);

		// Recorded rather than merely skipped: the walk's first event is no arrival.
		app.workspace.trigger('layout-change');
		expect(switches(view)).toEqual([]);

		await moveTo(view, PLAIN);
		await moveTo(view, KEYED);
		expect(switches(view)).toEqual([KEYED]);
	});

	it('converts a leaf still deferred after a mid-session enable, when it first loads', async () => {
		const deferred = await open(DeferredView);
		const { leaf } = deferred;
		plugin = await loadPlugin(app);
		expect(leaf.viewStates).toEqual([]);

		const real = await swapView(leaf, new MarkdownView(leaf));
		await showFile(real, KEYED);
		app.workspace.trigger('layout-change');

		expect(switches(real)).toEqual([KEYED]);
	});

	it('stops answering on unload', async () => {
		plugin = await loadPlugin(app);
		unloadPlugin(plugin);

		const view = await holding(KEYED);
		app.workspace.trigger('layout-change');

		expect(switches(view)).toEqual([]);
	});
});

describe('what stops a switch', () => {
	it('holds the override and the setting at every arrival', async () => {
		// Startup holds the setting only: `markdownOverrides` is built empty with the
		// plugin, so no override can exist yet. The second load is what shows it was
		// the setting holding the leaf.
		const restored = await holding(KEYED);
		app.workspace.layoutReady = false;
		plugin = await loadPlugin(app, { openInSheetView: false });
		expect(switches(restored)).toEqual([]);
		unloadPlugin(plugin);
		plugin = await loadPlugin(app);
		expect(switches(restored)).toEqual([KEYED]);

		// A leaf moving to the note, for each of the two.
		const view = await holding(PLAIN);
		app.workspace.trigger('layout-change');
		plugin.markdownOverrides.add(KEYED);
		await moveTo(view, KEYED);
		expect(switches(view)).toEqual([]);

		await moveTo(view, PLAIN);
		plugin.markdownOverrides.clear();
		plugin.settings.openInSheetView = false;
		await moveTo(view, KEYED);
		expect(switches(view)).toEqual([]);

		await moveTo(view, PLAIN);
		plugin.settings.openInSheetView = true;
		await moveTo(view, KEYED);
		expect(switches(view)).toEqual([KEYED]);

		// A new leaf on the note, for each of the two.
		plugin.markdownOverrides.add(SECOND);
		const overridden = await holding(SECOND);
		app.workspace.trigger('layout-change');
		expect(switches(overridden)).toEqual([]);

		plugin.markdownOverrides.clear();
		plugin.settings.openInSheetView = false;
		const unset = await holding(SECOND);
		app.workspace.trigger('layout-change');
		expect(switches(unset)).toEqual([]);
	});
});
