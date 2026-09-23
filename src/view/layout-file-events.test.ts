// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { serialiseLayout } from '../parse/layout';
import { App, Notice, TextFileView } from '../test/obsidian-stub';
import { LAYOUT_FOLDER } from '../test/plugin';
import { loadPlugin } from '../test/plugin-shell';
import { openView } from '../test/workspace';
import { fallbackCountMessage, renameCountMessage } from './layout-file-events';
import { SheetView } from './sheet-view';

/*
 * A layout file renamed, moved or deleted by the file explorer rather than by
 * this plugin (`docs/features/visible-layout-files.md`).
 *
 * Driven through the plugin's own `onload`, because the claim is that the
 * *plugin* listens — a case registering the listeners by hand would pass with
 * the call missing from `main.ts`. Every rename goes through the vault, which
 * is what the explorer does.
 */

const LAYOUT = serialiseLayout({
	name: 'Alpha',
	columns: 12,
	components: [
		{
			id: 'armour',
			type: 'card',
			label: 'AC',
			position: { col: 1, row: 1, width: 2, height: 1 },
		},
	],
});

const NOTE = '---\nsheet-layout: Alpha\n---\n\n## AC\n\n```sheet\nvalue: 15\n```\n';

async function tick(): Promise<void> {
	await new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function vault(): Promise<App> {
	const app = new App();
	await app.vault.createFolder(LAYOUT_FOLDER);
	await app.vault.create(`${LAYOUT_FOLDER}/Alpha.sheetsmith`, LAYOUT);
	await app.vault.createFolder('Characters');
	await app.vault.create('Characters/Aramil.md', NOTE);
	await app.vault.create('Characters/Bree.md', NOTE);
	await app.vault.create('Characters/Other.md', NOTE.replace('Alpha', 'Beta'));
	return app;
}

async function text(app: App, path: string): Promise<string> {
	return app.vault.read(app.vault.getFileByPath(path)!);
}

beforeEach(() => {
	Notice.messages = [];
});

describe('a layout renamed in the file explorer', () => {
	it('counts the notes still naming the old name, once, and rewrites none', async () => {
		const app = await vault();
		await loadPlugin(app);
		Notice.messages = [];

		await app.vault.rename(
			app.vault.getFileByPath(`${LAYOUT_FOLDER}/Alpha.sheetsmith`)!,
			`${LAYOUT_FOLDER}/Omega.sheetsmith`,
		);
		await tick();

		expect(Notice.messages).toEqual([renameCountMessage(2, 'Alpha')]);
		expect(Notice.messages[0]).toBe(
			'2 character notes name "Alpha"; they will show the missing-layout message until renamed back or repointed.',
		);
		expect(await text(app, 'Characters/Aramil.md')).toBe(NOTE);
		expect(await text(app, 'Characters/Bree.md')).toBe(NOTE);
	});

	it('counts a move out of the folder the same way', async () => {
		const app = await vault();
		await loadPlugin(app);
		await app.vault.createFolder('Elsewhere');
		Notice.messages = [];

		await app.vault.rename(
			app.vault.getFileByPath(`${LAYOUT_FOLDER}/Alpha.sheetsmith`)!,
			'Elsewhere/Alpha.sheetsmith',
		);
		await tick();

		expect(Notice.messages).toEqual([renameCountMessage(2, 'Alpha')]);
	});

	it('says nothing where no note names it', async () => {
		const app = await vault();
		await app.vault.create(`${LAYOUT_FOLDER}/Unused.sheetsmith`, LAYOUT);
		await loadPlugin(app);
		Notice.messages = [];

		await app.vault.rename(
			app.vault.getFileByPath(`${LAYOUT_FOLDER}/Unused.sheetsmith`)!,
			`${LAYOUT_FOLDER}/Still unused.sheetsmith`,
		);
		await tick();

		expect(Notice.messages).toEqual([]);
	});

	it('says nothing about a conversion, which strands nobody', async () => {
		const app = new App();
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(`${LAYOUT_FOLDER}/Alpha.json`, LAYOUT);
		await app.vault.create('Aramil.md', NOTE);
		await loadPlugin(app);
		Notice.messages = [];

		await app.fileManager.renameFile(
			app.vault.getFileByPath(`${LAYOUT_FOLDER}/Alpha.json`)!,
			`${LAYOUT_FOLDER}/Alpha.sheetsmith`,
		);
		await tick();

		expect(Notice.messages).toEqual([]);
	});

	it('says the notes now read the older .json where one was hidden behind it', async () => {
		const app = await vault();
		const older = serialiseLayout({ name: 'Alpha', columns: 6, components: [] });
		await app.vault.create(`${LAYOUT_FOLDER}/Alpha.json`, older);
		await loadPlugin(app);
		Notice.messages = [];

		await app.vault.rename(
			app.vault.getFileByPath(`${LAYOUT_FOLDER}/Alpha.sheetsmith`)!,
			`${LAYOUT_FOLDER}/Omega.sheetsmith`,
		);
		await tick();

		expect(Notice.messages).toEqual([
			'2 character notes name "Alpha"; they now use the older Alpha.json until it is converted or removed.',
		]);
		expect(await text(app, 'Characters/Aramil.md')).toBe(NOTE);
		expect(await text(app, 'Characters/Bree.md')).toBe(NOTE);
	});

	it('says nothing about a fallback no note is on', async () => {
		const app = new App();
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(`${LAYOUT_FOLDER}/Alpha.sheetsmith`, LAYOUT);
		await app.vault.create(`${LAYOUT_FOLDER}/Alpha.json`, LAYOUT);
		await loadPlugin(app);
		Notice.messages = [];

		await app.vault.rename(
			app.vault.getFileByPath(`${LAYOUT_FOLDER}/Alpha.sheetsmith`)!,
			`${LAYOUT_FOLDER}/Omega.sheetsmith`,
		);
		await tick();

		expect(Notice.messages).toEqual([]);
	});

	it('singularises one note falling back', () => {
		expect(fallbackCountMessage(1, 'Alpha')).toBe(
			'1 character note names "Alpha"; it now uses the older Alpha.json until that file is converted or removed.',
		);
	});

	it('singularises one note', () => {
		expect(renameCountMessage(1, 'Alpha')).toBe(
			'1 character note names "Alpha"; it will show the missing-layout message until renamed back or repointed.',
		);
	});
});

describe('an open sheet whose layout file moves', () => {
	async function sheetOn(app: App): Promise<SheetView> {
		const plugin = await loadPlugin(app);
		const sheet = await openView(app, document.body, SheetView, plugin);
		await (sheet as unknown as TextFileView).onLoadFile(
			app.vault.getFileByPath('Characters/Aramil.md')!,
		);
		await tick();
		return sheet;
	}

	function pickButton(sheet: SheetView): HTMLButtonElement | null {
		for (const button of Array.from(sheet.contentEl.querySelectorAll('button'))) {
			if (button.textContent === 'Pick another layout') return button;
		}
		return null;
	}

	it('shows the missing-layout message and the offer without being reopened', async () => {
		const app = await vault();
		const sheet = await sheetOn(app);
		expect(sheet.contentEl.querySelector('.sheetsmith-grid')).not.toBeNull();

		await app.vault.rename(
			app.vault.getFileByPath(`${LAYOUT_FOLDER}/Alpha.sheetsmith`)!,
			`${LAYOUT_FOLDER}/Omega.sheetsmith`,
		);
		await tick();

		expect(sheet.contentEl.textContent).toContain(
			`Layout "Alpha" was not found in "${LAYOUT_FOLDER}".`,
		);
		expect(pickButton(sheet)).not.toBeNull();
	});

	it('draws the layout again when it comes back', async () => {
		const app = await vault();
		const sheet = await sheetOn(app);
		const file = app.vault.getFileByPath(`${LAYOUT_FOLDER}/Alpha.sheetsmith`)!;
		await app.vault.delete(file);
		await tick();
		// The folder is empty now, so the offer is the cold-start sentence rather
		// than a picker that could not succeed (`view/missing-layout.ts`).
		expect(sheet.contentEl.textContent).toContain(
			`Layout "Alpha" was not found in "${LAYOUT_FOLDER}".`,
		);
		expect(sheet.contentEl.querySelector('.sheetsmith-grid')).toBeNull();

		await app.vault.create(`${LAYOUT_FOLDER}/Alpha.sheetsmith`, LAYOUT);
		await tick();

		expect(sheet.contentEl.querySelector('.sheetsmith-grid')).not.toBeNull();
	});
});
