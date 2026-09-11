// @vitest-environment happy-dom
/*
 * The members of this module that have no consumer of their own to be
 * observable through.
 *
 * It began as the two that answer "is there anything to pick, and what do we say
 * when there is not" (`docs/features/layout-picker.md`), and
 * `docs/features/starting-a-new-layout.md` added three more of the same kind: a
 * name policy (`suggestCopyName`) and the one result shape three ways of
 * starting a layout share (`startLayout`), whose whole argument is that the
 * branch, the try/catch and the blank-name refusal are the *writer's* — so
 * every arm a user can meet is driveable here, with no modal in existence, and
 * two of them are unreachable from the surface by design.
 *
 * The rest of `layouts.ts` is still driven by the consumers that were written
 * with it —
 * `createLayout` through `starters/picker.test.ts`, `appendModifierDefinition`
 * through `view/promote-flow.test.ts`, `loadLayout`'s two answers through the
 * cut they decide in `view/pick-layout-flow.test.ts`, and
 * `installLayoutSource` through **both** of its own — `starters/picker.test.ts`
 * for the starter that delegates to it and `editor/new-layout.test.ts` for
 * the pasted layout, which is the pair the ordering it holds exists for
 * (`docs/features/layout-import-export.md`). What every member here shares is
 * `docs/PATTERNS.md` §1's one-step tier: a predicate, two sentences, a name
 * policy and an ordering, each put in one place precisely because two copies
 * could only ever be tested for still agreeing.
 *
 * happy-dom because `obsidian` resolves to the stub, whose `TFolder` and
 * `Vault` are what a folder listing is read out of.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { App as ObsidianApp } from 'obsidian';
import {
	hasLayouts,
	noLayoutsMessage,
	startLayout,
	suggestCopyName,
} from './layouts';
import { parseLayout, serialiseLayout } from './parse/layout';
import { layoutPaths } from './test/layout-folder';
import { App } from './test/obsidian-stub';
import { LAYOUT_FOLDER } from './test/plugin';

let app: App;

const vault = () => app as unknown as ObsidianApp;

const pathOf = (name: string): string => `${LAYOUT_FOLDER}/${name}.json`;

/** A layout as a source: valid, named, and with something in it. */
const SOURCE = serialiseLayout({
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

async function seed(name: string, text = SOURCE): Promise<void> {
	if (!app.vault.getFolderByPath(LAYOUT_FOLDER)) {
		await app.vault.createFolder(LAYOUT_FOLDER);
	}
	await app.vault.create(pathOf(name), text);
}

async function read(path: string): Promise<string> {
	const file = app.vault.getFileByPath(path);
	if (!file) throw new Error(`${path} is gone`);
	return app.vault.read(file);
}

beforeEach(() => {
	app = new App();
});

describe('hasLayouts', () => {
	it('is false where the folder does not exist', () => {
		// Cold start: the plugin has never written the folder and neither has
		// the reader.
		expect(hasLayouts(vault(), LAYOUT_FOLDER)).toBe(false);
	});

	it('is false where the folder exists and holds no layout', async () => {
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(`${LAYOUT_FOLDER}/notes.md`, 'not a layout');
		expect(hasLayouts(vault(), LAYOUT_FOLDER)).toBe(false);
	});

	it('is true where the folder holds one', async () => {
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(`${LAYOUT_FOLDER}/Starter 5e.json`, '{}');
		expect(hasLayouts(vault(), LAYOUT_FOLDER)).toBe(true);
	});

	it('answers about the folder it is asked about', async () => {
		// The folder is configurable, so a reader who moved the setting must not
		// be told about the one they left.
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(`${LAYOUT_FOLDER}/Starter 5e.json`, '{}');
		expect(hasLayouts(vault(), 'Elsewhere/Sheets')).toBe(false);
	});
});

describe('noLayoutsMessage', () => {
	it('names the folder that was looked in and the command that fills it', () => {
		expect(noLayoutsMessage('Elsewhere/Sheets')).toBe(
			'No layouts in "Elsewhere/Sheets" yet. Run "Add a starter layout" from the command palette to get one.',
		);
	});
});

describe('suggestCopyName', () => {
	beforeEach(async () => {
		await app.vault.createFolder(LAYOUT_FOLDER);
	});

	it('offers the plain suffix where the folder does not hold it', async () => {
		await app.vault.create(pathOf('Cutter'), SOURCE);
		expect(suggestCopyName(vault(), LAYOUT_FOLDER, 'Cutter')).toBe(
			'Cutter copy',
		);
	});

	it('climbs the ladder past every name already taken', async () => {
		// Two steps, because one would pass against a rule that only ever
		// appends `2`. The suffix is searched when the source is chosen, so in
		// the ordinary case the writer's refusal is never met.
		await app.vault.create(pathOf('Cutter'), SOURCE);
		await app.vault.create(pathOf('Cutter copy'), SOURCE);
		expect(suggestCopyName(vault(), LAYOUT_FOLDER, 'Cutter')).toBe(
			'Cutter copy 2',
		);

		await app.vault.create(pathOf('Cutter copy 2'), SOURCE);
		expect(suggestCopyName(vault(), LAYOUT_FOLDER, 'Cutter')).toBe(
			'Cutter copy 3',
		);
	});

	it('proposes rather than applies, so a taken name is still refused', async () => {
		// The pane's policy and the writer's refusal do not reach into each
		// other: this only reads the folder, and nothing here writes.
		await app.vault.create(pathOf('Cutter copy'), 'mine, edited');
		expect(suggestCopyName(vault(), LAYOUT_FOLDER, 'Cutter')).toBe(
			'Cutter copy 2',
		);
		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([pathOf('Cutter copy')]);
	});
});

/*
 * The three ways of starting a layout, driven with no modal in existence
 * (`docs/features/starting-a-new-layout.md`).
 *
 * That is the point of the function rather than a convenience of the test: the
 * branch, the try/catch and the blank-name refusal are the writer's, so every
 * arm a user can meet is reachable here — including the two the surface makes
 * unreachable, and the copy arm's missing source, which `getFileByPath` answers
 * with `null` rather than a throw.
 */
describe('startLayout from a blank grid', () => {
	it('writes the empty layout, creating the folder', async () => {
		// The premise: nothing here existed before the call.
		expect(app.vault.getFolderByPath(LAYOUT_FOLDER)).toBeNull();

		const result = await startLayout(vault(), LAYOUT_FOLDER, 'Scratch', {
			blank: true,
		});

		expect(result).toEqual({
			ok: true,
			message: `Added "Scratch" to ${LAYOUT_FOLDER}.`,
			name: 'Scratch',
		});
		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([pathOf('Scratch')]);
		expect(parseLayout(await read(pathOf('Scratch')))).toEqual({
			name: 'Scratch',
			columns: 6,
			components: [],
		});
	});

	it('announces in the same sentence a pasted layout does', async () => {
		// One gesture with three sources that announces two of them and stays
		// quiet on the third invites a reader to infer the quiet one did
		// something different. One builder, so the two cannot drift.
		const blank = await startLayout(vault(), LAYOUT_FOLDER, 'Scratch', {
			blank: true,
		});
		const pasted = await startLayout(vault(), LAYOUT_FOLDER, '', {
			text: SOURCE,
		});

		expect('ok' in blank && blank.message).toBe(
			`Added "Scratch" to ${LAYOUT_FOLDER}.`,
		);
		expect('ok' in pasted && pasted.message).toBe(
			`Added "Shared sheet" to ${LAYOUT_FOLDER}.`,
		);
	});

	it('refuses a blank name as a value, and writes no file at all', async () => {
		const result = await startLayout(vault(), LAYOUT_FOLDER, '  ', {
			blank: true,
		});

		expect(result).toEqual({
			error: 'A new layout needs a name. Type one first.',
		});
		// **In particular no `<folder>/.json`**, which is what `createLayout`
		// handed a blank name would have written. The folder is not created
		// either, because nothing was attempted.
		expect(app.vault.getFileByPath(`${LAYOUT_FOLDER}/.json`)).toBeNull();
		expect(app.vault.getFolderByPath(LAYOUT_FOLDER)).toBeNull();
	});

	it('refuses a name the folder already holds, in createLayout’s words', async () => {
		await seed('Scratch', 'mine, edited');

		const result = await startLayout(vault(), LAYOUT_FOLDER, 'Scratch', {
			blank: true,
		});

		expect(result).toEqual({
			error: 'A layout named "Scratch" already exists.',
		});
		// The bytes rather than the path: a file overwritten with something else
		// still exists (Constraint 4).
		expect(await read(pathOf('Scratch'))).toBe('mine, edited');
		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([pathOf('Scratch')]);
	});

	it('reports the vault’s own reason when it refuses the name', async () => {
		/*
		 * **A name the vault itself refuses**, which is its own arm of the
		 * failure table and its own code path: the taken name is refused by
		 * `createLayout` before the vault is reached, and the folder-shaped
		 * refusal below comes out of `createFolder`, so nothing else covers the
		 * `vault.create` rejection.
		 *
		 * **The throw is injected, and it has to be.** The double is a flat map
		 * of paths, so it accepts every spelling the real adapter's `fs` write
		 * would reject — `docs/BACKLOG.md` carries the row, and modelling
		 * `ENOENT` there is priced across 81 test files. Injecting is
		 * `layout-editor.test.ts`'s own technique for the unreadable file one
		 * control over. The message is Obsidian's own so that what a reader sees
		 * is what this case shows, and what is actually asserted is the
		 * *pass-through*: whatever the vault said, verbatim, and nothing
		 * written.
		 */
		const refused =
			'File name cannot contain any of the following characters: * " \\ / < > : | ?';
		app.vault.create = async () => {
			throw new Error(refused);
		};

		const result = await startLayout(vault(), LAYOUT_FOLDER, 'a/b', {
			blank: true,
		});

		expect(result).toEqual({ error: refused });
		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([]);
	});

	it('reports the vault’s own reason where a file holds the folder’s path', async () => {
		/*
		 * The one folder-shaped refusal this double honours, and the route the
		 * shipped import feature already took: `createFolder` asks
		 * `adapter.exists` in the app, so a *file* at that path refuses in the
		 * app's own words. `layoutPaths` is no use on this arm — with a file at
		 * the folder's own path `listLayouts` answers `[]` for a vault that had
		 * lost everything — so the claim is the bytes.
		 */
		await app.vault.create(LAYOUT_FOLDER, 'not a folder');

		const result = await startLayout(vault(), LAYOUT_FOLDER, 'Scratch', {
			blank: true,
		});

		expect(result).toEqual({ error: 'Folder already exists.' });
		expect(await read(LAYOUT_FOLDER)).toBe('not a folder');
		expect(app.vault.getFileByPath(pathOf('Scratch'))).toBeNull();
	});
});

describe('startLayout from an existing layout', () => {
	it('copies the source byte for byte but for its name', async () => {
		await seed('Cutter');

		const result = await startLayout(vault(), LAYOUT_FOLDER, 'Cutter copy', {
			copyOf: 'Cutter',
		});

		expect(result).toMatchObject({ ok: true, name: 'Cutter copy' });
		// A layout the plugin wrote copies identically, because
		// `serialiseLayout` wrote it both times — and the `name` key equals the
		// filename, which is the invariant `loadLayout` and `listLayouts` rest
		// on.
		const copied = parseLayout(await read(pathOf('Cutter copy')));
		const source = parseLayout(await read(pathOf('Cutter')));
		expect(copied).toEqual({ ...source, name: 'Cutter copy' });
		expect(await read(pathOf('Cutter copy'))).toBe(
			serialiseLayout({ ...source, name: 'Cutter copy' }),
		);
		// And the source is untouched.
		expect(await read(pathOf('Cutter'))).toBe(SOURCE);
	});

	it('reads the source’s file rather than anything held in memory', async () => {
		/*
		 * Fantasy Statblocks issue 443's shape: a copy path that rebuilds
		 * something the source had rather than carrying it across. The read
		 * lives here, so what the file says at the moment of the press is what
		 * lands — another pane may have written since.
		 */
		await seed('Cutter');
		const changed = serialiseLayout({
			name: 'Cutter',
			columns: 4,
			components: [],
		});
		const file = app.vault.getFileByPath(pathOf('Cutter'));
		await app.vault.modify(file as NonNullable<typeof file>, changed);

		await startLayout(vault(), LAYOUT_FOLDER, 'Cutter copy', {
			copyOf: 'Cutter',
		});

		expect(parseLayout(await read(pathOf('Cutter copy')))).toEqual({
			name: 'Cutter copy',
			columns: 4,
			components: [],
		});
	});

	it('refuses a source the folder no longer holds, and writes nothing', async () => {
		// Deleted between the dropdown being drawn and the press.
		// `getFileByPath` answers `null` rather than throwing, so this arm only
		// exists because the read is here.
		await seed('Cutter');

		const result = await startLayout(vault(), LAYOUT_FOLDER, 'Gone copy', {
			copyOf: 'Gone',
		});

		expect(result).toEqual({
			error: `Layout "Gone" was not found in "${LAYOUT_FOLDER}".`,
		});
		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([pathOf('Cutter')]);
	});

	it('reports the vault’s own reason when the source cannot be read', async () => {
		await seed('Cutter');
		app.vault.read = async () => {
			throw new Error('The file is gone.');
		};

		const result = await startLayout(vault(), LAYOUT_FOLDER, 'Cutter copy', {
			copyOf: 'Cutter',
		});

		expect(result).toEqual({ error: 'The file is gone.' });
		// The folder's own list, like every other refusal arm: "the new file is
		// absent" is half the claim, and the monkeypatch is on `read`, which
		// `listLayouts` does not call — so nothing stops the fuller assertion
		// here.
		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([pathOf('Cutter')]);
	});

	it('refuses a source that will not parse, in the parser’s words', async () => {
		// A duplicate enters the vault, so it inherits the install rule: the
		// source goes through the identical gate every layout in the folder
		// passed, and a broken one cannot be duplicated at all.
		await seed('Broken', '{');

		const result = await startLayout(vault(), LAYOUT_FOLDER, 'Broken copy', {
			copyOf: 'Broken',
		});

		expect('error' in result && result.error).toContain(
			'Layout file is not valid JSON:',
		);
		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([pathOf('Broken')]);
	});

	it('refuses a blank name, because a copy has no other source of one', async () => {
		await seed('Cutter');

		const result = await startLayout(vault(), LAYOUT_FOLDER, '   ', {
			copyOf: 'Cutter',
		});

		expect(result).toEqual({
			error: 'A new layout needs a name. Type one first.',
		});
		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([pathOf('Cutter')]);
	});
});

describe('startLayout from pasted text', () => {
	it('leaves the blank-means-absent rule to installLayoutSource', async () => {
		// The one arm where a blank name is legal, because the source carries
		// one. A `.trim()` here would be a second copy of that rule.
		const result = await startLayout(vault(), LAYOUT_FOLDER, '   ', {
			text: SOURCE,
		});

		expect(result).toMatchObject({ ok: true, name: 'Shared sheet' });
		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([pathOf('Shared sheet')]);
	});

	it('renames what it writes when a name is given', async () => {
		const result = await startLayout(vault(), LAYOUT_FOLDER, 'Borrowed', {
			text: SOURCE,
		});

		expect(result).toMatchObject({ ok: true, name: 'Borrowed' });
		expect(parseLayout(await read(pathOf('Borrowed')))).toMatchObject({
			name: 'Borrowed',
		});
	});

	it('writes nothing for a paste that will not parse', async () => {
		const result = await startLayout(vault(), LAYOUT_FOLDER, '', {
			text: 'this is not a layout',
		});

		expect('error' in result && result.error).toContain(
			'Layout file is not valid JSON:',
		);
		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([]);
	});

	it('writes nothing for a paste with no name and no name given', async () => {
		const result = await startLayout(vault(), LAYOUT_FOLDER, '', {
			text: JSON.stringify({ columns: 6, components: [] }),
		});

		expect(result).toEqual({
			error: 'The layout needs a non-empty "name" string.',
		});
		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([]);
	});

	it('writes nothing for a paste the schema refuses', async () => {
		const result = await startLayout(vault(), LAYOUT_FOLDER, '', {
			text: JSON.stringify({ name: 'Stale' }),
		});

		expect(result).toEqual({
			error: 'The layout needs a "components" array.',
		});
		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([]);
	});
});
