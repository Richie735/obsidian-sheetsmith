// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type SheetsmithPlugin from './main';
import { parseLayout, serialiseLayout } from './parse/layout';
import { App, Notice } from './test/obsidian-stub';
import { LAYOUT_FOLDER } from './test/plugin';
import { loadPlugin } from './test/plugin-shell';
import { control, fixture, settle, tick, type } from './test/layout-editor-pane';
import { openView, showFile } from './test/workspace';
import { ComponentConfig } from './types';
import { LayoutEditorView } from './view/layout-editor-view';

/*
 * The layout editor's **Undo layout edit** and **Redo layout edit** commands,
 * and the one thing they say: "Undone." or "Redone.", only where the action
 * happened (`docs/features/editor-undo.md`, `docs/features/unsaveable-layout.md`
 * §3).
 *
 * Driven through the plugin's own `onload`, so the command is the one
 * `commands.ts` registers, pressed through its `checkCallback` with the pane
 * the active view. **The case the notice turns on is a write in flight**: the
 * action then waits for it, and may be skipped when the author has moved on, so
 * the notice has to follow the outcome and not the press.
 */

const HOME = `${LAYOUT_FOLDER}/Test sheet.sheetsmith`;
const OTHER = `${LAYOUT_FOLDER}/Other sheet.sheetsmith`;

let app: App;
let plugin: SheetsmithPlugin;
let pane: LayoutEditorView;
/** The next write to the open layout waits on this, where set. */
let held: { resolve: () => void } | null;
let holdNext: boolean;

/** Run a registered command the way the palette runs one. */
function run(id: string): void {
	const command = (plugin as unknown as { commands: { id: string; checkCallback?: (checking: boolean) => boolean }[] }).commands.find(
		(candidate) => candidate.id === id,
	);
	if (command?.checkCallback === undefined) throw new Error(`no command "${id}"`);
	command.checkCallback(false);
}

/** Commit the Pool's maximum through its own field. */
function max(value: string): void {
	type(control<HTMLInputElement>({ container: pane.contentEl }, 'cfg-hit_points-max'), value);
}

async function maxOnDisk(): Promise<string | undefined> {
	const text = await app.vault.read(app.vault.getFileByPath(HOME)!);
	return (parseLayout(text).components[1] as ComponentConfig & { max?: string }).max;
}

beforeEach(async () => {
	app = new App();
	await app.vault.createFolder(LAYOUT_FOLDER);
	await app.vault.create(HOME, serialiseLayout(fixture()));
	await app.vault.create(OTHER, serialiseLayout({ ...fixture(), name: 'Other sheet' }));
	plugin = await loadPlugin(app);
	pane = await openView(app, document.body, LayoutEditorView, plugin);
	await showFile(pane, HOME);
	// Active the way the app makes a leaf active: revealing it.
	await app.workspace.revealLeaf(pane.leaf as never);
	held = null;
	holdNext = false;
	const modify = app.vault.modify.bind(app.vault);
	app.vault.modify = async (file, content) => {
		if (file.path === HOME && holdNext) {
			holdNext = false;
			await new Promise<void>((resolve) => {
				held = { resolve };
			});
			held = null;
		}
		return modify(file, content);
	};
	control({ container: pane.contentEl }, 'edit-hit_points').click();
	await settle(pane);
	Notice.messages = [];
});

describe('the undo and redo commands', () => {
	it('say "Undone." for an undo that happened, and nothing on an empty stack', async () => {
		run('layout-editor-undo');
		await tick();
		expect(Notice.messages).toEqual([]);
		max('20');
		await settle(pane);
		run('layout-editor-undo');
		await tick();
		expect(Notice.messages).toEqual(['Undone.']);
		run('layout-editor-redo');
		await tick();
		expect(Notice.messages).toEqual(['Undone.', 'Redone.']);
	});

	it('does not undo a commit made between the press and the writes landing, and says nothing', async () => {
		max('20');
		await settle(pane);
		holdNext = true;
		max('21');
		await tick();
		expect(held).not.toBeNull();

		run('layout-editor-undo');
		// Another commit while the undo is waiting: the press was not about it.
		max('22');
		await tick();
		held!.resolve();
		await tick();
		await tick();
		await settle(pane);

		expect(await maxOnDisk()).toBe('22');
		expect(Notice.messages).not.toContain('Undone.');
	});

	it('says nothing for an undo dropped because the file was left', async () => {
		holdNext = true;
		max('20');
		await tick();
		expect(held).not.toBeNull();

		run('layout-editor-undo');
		const leaving = showFile(pane, OTHER);
		await tick();
		held!.resolve();
		await leaving;
		await tick();

		expect(pane.file?.path).toBe(OTHER);
		expect(await maxOnDisk()).toBe('20');
		expect(Notice.messages).not.toContain('Undone.');
	});

	it('undoes the step before a write in flight that changed no bytes, and says so', async () => {
		const original = await app.vault.read(app.vault.getFileByPath(HOME)!);
		max('20');
		await settle(pane);
		holdNext = true;
		// The same value again: a write goes out and changes nothing.
		max('20');
		await tick();
		expect(held).not.toBeNull();

		run('layout-editor-undo');
		held!.resolve();
		await tick();
		await tick();
		await settle(pane);

		expect(await app.vault.read(app.vault.getFileByPath(HOME)!)).toBe(original);
		expect(Notice.messages).toEqual(['Undone.']);
	});
});
