// @vitest-environment happy-dom
/*
 * Pasting a layout in.
 *
 * The vault here is `src/test/obsidian-stub.ts`'s, which is a real map of paths
 * to content: a folder that does not exist is a folder that does not exist, and
 * `create` on a taken path is the refusal `createLayout` already owns. So every
 * arm this feature can end in is reachable without the app.
 *
 * **A file of its own**, under `docs/PATTERNS.md` §10's boundary: a module in
 * `editor/` with its own entry point *and* its own reportable output earns one,
 * and `promptImportLayout` has both — it is called by name rather than reached
 * by pressing something the editor drew, and what it reports is a file in the
 * vault and a sentence. The two cases that are the *pane's* — that the dropdown
 * option opens this, and that a successful import leaves the pane on the
 * layout that landed — stay in `layout-editor.test.ts` with the pane harness.
 *
 * **A refusal case asserts what is still there, not that the new thing is
 * absent.** The closest prior art has an open defect where importing into an
 * existing item template deleted it, so "the layout was not created" is only
 * half the claim: the other half is that nothing which was already there moved.
 *
 * Six of the seven cases under `a refusal` are about the vault; the seventh is
 * about the surface — the modal staying open with what was typed — and asserts
 * no vault state at all. Five of the six make the claim as a count of the
 * folder's contents. **The sixth cannot, and says so at the case**: where the
 * folder's own path is held by a file, `listLayouts` has no folder to list and
 * answers `[]` for a vault that had lost everything, so that one asserts the
 * existing file's bytes instead — the same claim by the only route open to it.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { App as ObsidianApp } from 'obsidian';
import { App, Notice } from '../test/obsidian-stub';
import { LAYOUT_FOLDER } from '../test/plugin';
import { listLayouts } from '../layouts';
import { serialiseLayout } from '../parse/layout';
import { promptImportLayout } from './layout-import';

/** A layout as somebody would paste it: valid, and named. */
const SOURCE = JSON.stringify({
	name: 'Shared sheet',
	columns: 12,
	components: [
		{
			id: 'armour',
			type: 'card',
			label: 'Armour class',
			position: { col: 1, row: 1, width: 2, height: 1 },
		},
	],
});

const pathOf = (name: string): string => `${LAYOUT_FOLDER}/${name}.json`;

let app: App;
let imported: string[];
let cancelled: number;

/**
 * The stub app where the real one is asked for.
 *
 * `picker.test.ts`'s own helper and its reason: the stub is a *double* for
 * `App` rather than an implementation of it, so every call site would otherwise
 * carry the same `as unknown` and the same paragraph.
 */
const vault = () => app as unknown as ObsidianApp;

/** One turn of the event loop, which flushes the awaited write behind a click. */
async function tick(): Promise<void> {
	await new Promise((resolve) => window.setTimeout(resolve, 0));
}

/**
 * Every layout the folder holds, by path, through the plugin's own lister.
 *
 * **Scoped to the layout folder rather than the whole vault**, and the reason is
 * a reservation rather than a shortcut: `src/test/obsidian-stub.ts` has no
 * double for `Vault.getFiles()`, and `docs/features/layout-import-export.md`
 * reserves adding one for the deferred file-chosen import.
 *
 * **Two limits, both stated because neither is visible at a call site.** It
 * lists direct children only, so a name carrying a separator — writing to
 * `<folder>/sub/x.json` — is invisible to it; and it answers `[]` rather than
 * failing where the folder's path is held by a file. Both are `docs/BACKLOG.md`
 * rows, and the arm that would exercise the first is the one the double cannot
 * refuse at all.
 */
function files(folder = LAYOUT_FOLDER): string[] {
	return listLayouts(vault(), folder)
		.map((file) => file.path)
		.sort();
}

function open(folder = LAYOUT_FOLDER): void {
	promptImportLayout(
		vault(),
		folder,
		(name) => imported.push(name),
		() => {
			cancelled += 1;
		},
	);
}

/** The modal the gesture opened, or a failure naming what is missing. */
function modal(): HTMLElement {
	const el = document.body.querySelector('.modal-container');
	if (!el) throw new Error('no modal is open');
	return el as HTMLElement;
}

function isOpen(): boolean {
	return document.body.querySelector('.modal-container') !== null;
}

/**
 * The field in the setting row carrying this name.
 *
 * By row name rather than by a `data-sheetsmith-focus` token, which the modal
 * deliberately sets none of: that attribute is the pane's focus-restoration
 * vocabulary and a modal never rebuilds, so a token here would be a test
 * selector in shipped markup. The name is the label a reader picks the field by,
 * which is `layout-editor.test.ts`'s own `checkbox(harness, name)` route.
 */
function field<T extends HTMLElement = HTMLElement>(name: string): T {
	for (const item of Array.from(modal().querySelectorAll('.setting-item'))) {
		if (item.querySelector('.setting-item-name')?.textContent !== name) continue;
		const el = item.querySelector(
			'.setting-item-control textarea, .setting-item-control input',
		);
		if (el) return el as T;
	}
	throw new Error(`no field in a row named "${name}"`);
}

/** The button in the open modal carrying this label. */
function button(label: string): HTMLButtonElement {
	for (const el of Array.from(modal().querySelectorAll('button'))) {
		if (el.textContent === label) return el;
	}
	throw new Error(`no button labelled "${label}"`);
}

/** Type into a field the way a paste does: the value, then the event. */
function type(el: HTMLTextAreaElement | HTMLInputElement, value: string): void {
	el.value = value;
	el.dispatchEvent(new Event('input'));
}

/** Paste a source, optionally name it, and press **Import**. */
async function importing(source: string, name?: string): Promise<void> {
	open();
	type(field<HTMLTextAreaElement>('Layout JSON'), source);
	if (name !== undefined) type(field<HTMLInputElement>('Name'), name);
	button('Import').click();
	await tick();
}

beforeEach(() => {
	app = new App();
	Notice.messages = [];
	imported = [];
	cancelled = 0;
	document.body.replaceChildren();
});

describe('importing a pasted layout', () => {
	it('writes the layout under the name inside it, creating the folder', async () => {
		// The premise: without this the assertions below could be passing over a
		// folder or a file some other case left behind.
		expect(app.vault.getFolderByPath(LAYOUT_FOLDER)).toBeNull();

		await importing(SOURCE);

		expect(app.vault.getFolderByPath(LAYOUT_FOLDER)).not.toBeNull();
		expect(files()).toEqual([pathOf('Shared sheet')]);
	});

	it('writes what serialiseLayout says rather than the pasted bytes', async () => {
		// One writer, one spelling: a layout that lands is formatted exactly as
		// one the pane edited is, whatever whitespace the paste arrived with.
		await importing(`   ${SOURCE}   `);

		const file = app.vault.getFileByPath(pathOf('Shared sheet'));
		expect(file).not.toBeNull();
		expect(await app.vault.read(file as NonNullable<typeof file>)).toBe(
			serialiseLayout({
				name: 'Shared sheet',
				columns: 12,
				components: [
					{
						id: 'armour',
						type: 'card',
						label: 'Armour class',
						position: { col: 1, row: 1, width: 2, height: 1 },
					},
				],
			}),
		);
	});

	it('says where it went, in the one sentence the one writer gives', async () => {
		// The same words `installStarter` gives, because it is the same function
		// saying them. The folder is named because it is configurable.
		await importing(SOURCE);
		expect(Notice.messages).toEqual([
			`Added "Shared sheet" to ${LAYOUT_FOLDER}.`,
		]);
	});

	it('follows the configured folder rather than the default', async () => {
		promptImportLayout(
			vault(),
			'Elsewhere/Sheets',
			(name) => imported.push(name),
			() => {
				cancelled += 1;
			},
		);
		type(field<HTMLTextAreaElement>('Layout JSON'), SOURCE);
		button('Import').click();
		await tick();

		expect(files('Elsewhere/Sheets')).toEqual([
			'Elsewhere/Sheets/Shared sheet.json',
		]);
		expect(Notice.messages).toEqual([
			'Added "Shared sheet" to Elsewhere/Sheets.',
		]);
	});

	it('hands the caller the name the file landed under', async () => {
		await importing(SOURCE);
		expect(imported).toEqual(['Shared sheet']);
		// The cancel arm is what snaps the dropdown back, so a successful import
		// must not also fire it.
		expect(cancelled).toBe(0);
	});

	it('closes on success', async () => {
		await importing(SOURCE);
		expect(isOpen()).toBe(false);
	});
});

describe('the optional name', () => {
	it('overrides the name inside the JSON, in the file and in the key', async () => {
		await importing(SOURCE, 'Borrowed sheet');

		// The filename and the `name` key still agree, which is the invariant
		// `loadLayout` and `listLayouts` both rest on.
		expect(files()).toEqual([pathOf('Borrowed sheet')]);
		const file = app.vault.getFileByPath(pathOf('Borrowed sheet'));
		const written = await app.vault.read(file as NonNullable<typeof file>);
		expect((JSON.parse(written) as { name: string }).name).toBe(
			'Borrowed sheet',
		);
		expect(Notice.messages).toEqual([
			`Added "Borrowed sheet" to ${LAYOUT_FOLDER}.`,
		]);
		expect(imported).toEqual(['Borrowed sheet']);
	});

	it('treats a blank box as absent rather than as a name', async () => {
		// "Leave empty to use the name inside the JSON" is the field's own copy,
		// and whitespace is what an accidental space bar leaves behind.
		await importing(SOURCE, '   ');
		expect(files()).toEqual([pathOf('Shared sheet')]);
		// And the caller is handed what the file got. This is the one path where
		// the blank-means-absent rule actually decides something, so it is the
		// one place a name the write settled on could disagree with the name the
		// pane then opens — which is why the `ok` arm carries it.
		expect(imported).toEqual(['Shared sheet']);
	});

	it('answers a taken name once it is changed', async () => {
		// The refusal below is actionable precisely because this works: the fix
		// for the commonest failure is the box already on screen.
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(pathOf('Shared sheet'), 'mine, edited');

		await importing(SOURCE, 'Shared sheet copy');

		expect(files()).toEqual([
			pathOf('Shared sheet copy'),
			pathOf('Shared sheet'),
		].sort());
		const mine = app.vault.getFileByPath(pathOf('Shared sheet'));
		expect(await app.vault.read(mine as NonNullable<typeof mine>)).toBe(
			'mine, edited',
		);
	});
});

describe('a refusal', () => {
	it('writes no file at all for text that is not JSON', async () => {
		await importing('this is not a layout');

		expect(files()).toEqual([]);
		// The parser's own sentence, rather than a second one composed here.
		expect(Notice.messages).toHaveLength(1);
		expect(Notice.messages[0]).toContain('Layout file is not valid JSON:');
	});

	it('writes nothing for JSON with no name, and no name typed', async () => {
		await importing(JSON.stringify({ columns: 6, components: [] }));

		expect(files()).toEqual([]);
		expect(Notice.messages).toEqual([
			'The layout needs a non-empty "name" string.',
		]);
	});

	it('still refuses nameless JSON when a name is typed', async () => {
		/*
		 * The gate runs before the rename, which is the whole of the ordering
		 * `installLayoutSource` exists to hold: nothing is written until the
		 * source has parsed, and the source cannot parse without a name. The
		 * **Name** field's own copy says "change it", not "supply it", so this
		 * is the field's boundary rather than a hole in it: a layout with no
		 * `name` is malformed, and inventing one on the author's behalf is the
		 * plugin editing content it does not own. Settled rather than pinned —
		 * the spec's failure table and criterion 4 both say so now.
		 */
		await importing(JSON.stringify({ columns: 6, components: [] }), 'Named');

		expect(files()).toEqual([]);
		expect(Notice.messages).toEqual([
			'The layout needs a non-empty "name" string.',
		]);
	});

	it('writes nothing for JSON the schema refuses', async () => {
		await importing(JSON.stringify({ name: 'Stale' }));

		expect(files()).toEqual([]);
		expect(Notice.messages).toEqual([
			'The layout needs a "components" array.',
		]);
	});

	it('leaves the existing file’s bytes unchanged when the name is taken', async () => {
		/*
		 * The criterion Custom System Builder issue 516 is the evidence for:
		 * importing into an existing template there deletes it. Import here has
		 * no gesture that targets an existing layout at all, so the guarantee is
		 * structural — and it is asserted as the bytes rather than as the path,
		 * because a file overwritten with something else still exists.
		 */
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(pathOf('Shared sheet'), 'mine, edited');

		await importing(SOURCE);

		expect(files()).toEqual([pathOf('Shared sheet')]);
		const file = app.vault.getFileByPath(pathOf('Shared sheet'));
		expect(await app.vault.read(file as NonNullable<typeof file>)).toBe(
			'mine, edited',
		);
		expect(Notice.messages).toEqual([
			'A layout named "Shared sheet" already exists.',
		]);
	});

	it('reports the vault’s own reason when the write itself fails', async () => {
		/*
		 * A file sitting where the layout folder must go, which is one of the
		 * three the spec's failure table names and the one this double actually
		 * refuses: `createFolder` asks `adapter.exists` in the app, so a *file*
		 * at that path refuses in the app's own words.
		 *
		 * **Not the `/`-in-a-name arm the criterion names**, because the double
		 * disagrees with the app there — Obsidian's adapter writes through
		 * `fs`, so a path under a folder that does not exist is `ENOENT`, while
		 * this vault is a flat map of paths and writes it happily. A green case
		 * over that would be the kind instrument `docs/UI.md` §11 warns about,
		 * so the gap is a `docs/BACKLOG.md` row rather than an assertion.
		 */
		await app.vault.create(LAYOUT_FOLDER, 'not a folder');

		await importing(SOURCE);

		// **The file that was already there, byte for byte.** `files()` is no
		// use on this arm — with a file at the folder's own path it answers `[]`
		// for a vault that had lost everything — so what carries the claim is
		// the one thing that existed before the press.
		const held = app.vault.getFileByPath(LAYOUT_FOLDER);
		expect(held).not.toBeNull();
		expect(await app.vault.read(held as NonNullable<typeof held>)).toBe(
			'not a folder',
		);
		expect(app.vault.getFileByPath(pathOf('Shared sheet'))).toBeNull();
		// The vault's own sentence, not one composed here, and not "Added".
		expect(Notice.messages).toEqual(['Folder already exists.']);
	});

	it('leaves the modal open with the paste and the name as typed', async () => {
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(pathOf('Shared sheet'), 'mine, edited');

		await importing(SOURCE, 'Shared sheet');

		// A 23KB paste and a typed name are expensive to reproduce, and the fix
		// for this refusal is the box that is already on screen.
		expect(isOpen()).toBe(true);
		expect(field<HTMLTextAreaElement>('Layout JSON').value).toBe(SOURCE);
		expect(field<HTMLInputElement>('Name').value).toBe(
			'Shared sheet',
		);
		// Nothing was imported, and the cancel arm has not fired either: the
		// dropdown that opened this must not snap back while it is still open.
		expect(imported).toEqual([]);
		expect(cancelled).toBe(0);
	});
});

describe('the modal itself', () => {
	it('disables Import while the paste box is blank or whitespace', () => {
		open();
		const submit = button('Import');
		expect(submit.disabled).toBe(true);

		type(field<HTMLTextAreaElement>('Layout JSON'), '   \n  ');
		expect(submit.disabled).toBe(true);

		type(field<HTMLTextAreaElement>('Layout JSON'), SOURCE);
		expect(submit.disabled).toBe(false);

		type(field<HTMLTextAreaElement>('Layout JSON'), '');
		expect(submit.disabled).toBe(true);
	});

	it('tells the caller nothing was imported when it is cancelled', () => {
		open();
		button('Cancel').click();

		expect(isOpen()).toBe(false);
		expect(imported).toEqual([]);
		// The redraw that snaps the dropdown back off the sentinel.
		expect(cancelled).toBe(1);
		expect(Notice.messages).toEqual([]);
		expect(files()).toEqual([]);
	});

	it('names itself and says what each box is for', () => {
		open();
		expect(modal().querySelector('.modal-title')?.textContent).toBe(
			'Import a layout',
		);
		const names = Array.from(
			modal().querySelectorAll('.setting-item-name'),
		).map((el) => el.textContent);
		expect(names).toEqual(['Layout JSON', 'Name', '']);
		expect(
			field<HTMLTextAreaElement>('Layout JSON').placeholder,
		).toBe("Paste the layout's JSON here");
		// The description states the consequence of leaving it empty, which is
		// the one thing the label cannot (`docs/PATTERNS.md` §8).
		expect(
			Array.from(modal().querySelectorAll('.setting-item-description')).map(
				(el) => el.textContent,
			),
		).toContain(
			'Leave empty to use the name inside the JSON. Change it here if the layout folder already holds that name.',
		);
	});
});
