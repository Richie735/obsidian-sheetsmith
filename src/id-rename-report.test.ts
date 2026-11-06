// @vitest-environment happy-dom
/*
 * Which character notes still read a renamed id, and the sentence the `Notice`
 * says it in (`docs/features/component-id-rename.md` §3).
 *
 * happy-dom because `obsidian` resolves to the stub, whose `Vault` and
 * `MetadataCache` are what the scan reads its candidates and their content out
 * of. What only this module owns is asserted here: which notes count, that none
 * is ever written, and the words. The pane's half — the flush before the scan,
 * the **Undo** — is in `editor/layout-editor.test.ts`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App as ObsidianApp } from 'obsidian';
import { idRenameMessage, notesReadingId } from './id-rename-report';
import { Layout } from './parse/layout';
import { App } from './test/obsidian-stub';
import { ComponentConfig } from './types';

let app: App;
const vault = () => app as unknown as ObsidianApp;

beforeEach(() => {
	app = new App();
});

const LAYOUT: Layout = {
	name: 'Id renames',
	components: [
		{
			id: 'pool',
			type: 'pool',
			label: 'HP',
			position: { col: 1, row: 1, width: 2, height: 1 },
		},
		{
			id: 'inventory',
			type: 'table',
			label: 'Inventory',
			position: { col: 1, row: 2, width: 6, height: 2 },
			rowHeader: 'Item',
			openRows: true,
			columns: [
				{ key: 'level', type: 'number' },
				{ key: 'Effect', type: 'modifier' },
			],
		} as ComponentConfig,
		{
			id: 'features',
			type: 'record-set',
			label: 'Features',
			position: { col: 1, row: 4, width: 6, height: 3 },
			recordName: 'Feature',
			fields: [{ key: 'Uses', type: 'number', maxSource: 'record' }],
		} as ComponentConfig,
	],
	modifiers: [{ name: 'Ring of vigour', target: 'pool', amount: '1' }],
};

/** A character on the layout whose Inventory holds these rows, `Item | level | Effect`. */
function character(rows: [string, string, string][], extra = ''): string {
	const table = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
	return `---\nsheet-layout: Id renames\n---\n\n## Inventory\n\n| Item | level | Effect |\n|---|---|---|\n${table}\n${extra}`;
}

async function scan(id: string) {
	return notesReadingId(vault(), LAYOUT, 'Id renames', id);
}

describe('notesReadingId', () => {
	it('finds a typed part reading the id as its target, in its amount, or in its when', async () => {
		await app.vault.create('Characters/Target.md', character([['Amulet', '1', 'pool += 2']]));
		await app.vault.create('Characters/Amount.md', character([['Charm', '1', 'abilities += pool']]));
		await app.vault.create(
			'Characters/When.md',
			character([['Torc', '1', 'abilities += 1 when pool > 3']]),
		);
		await app.vault.create('Characters/Plain.md', character([['Rope', '1', '']]));
		expect(await scan('pool')).toEqual({ names: ['Amount', 'Target', 'When'], unreadable: 0 });
	});

	it('skips a named part, and a when reading a column of its own row', async () => {
		await app.vault.create('Named.md', character([['Charm', '1', 'Ring of vigour']]));
		await app.vault.create('Own.md', character([['Charm', '1', 'abilities += 1 when level > 2']]));
		expect(await scan('pool')).toEqual({ names: [], unreadable: 0 });
		expect(await scan('level')).toEqual({ names: [], unreadable: 0 });
	});

	it('does not count a record ceiling, which the sentence says it does not', async () => {
		// The one note-held expression no member returns (decision D, cut):
		// "in modifier cells" is the sentence's half of this.
		await app.vault.create(
			'Ceiling.md',
			character([], '\n## Features\n\n### Second wind\n```sheet\nUses: 1 / pool\n```\n'),
		);
		expect(await scan('pool')).toEqual({ names: [], unreadable: 0 });
	});

	it('leaves a note on another layout alone, and counts a note it cannot read', async () => {
		await app.vault.create(
			'Other.md',
			'---\nsheet-layout: Other\n---\n\n## Inventory\n\n| Item | level | Effect |\n|---|---|---|\n| Amulet | 1 | pool += 2 |\n',
		);
		await app.vault.create('Fine.md', character([['Amulet', '1', 'pool += 2']]));
		await app.vault.create('Broken.md', character([]));
		const read = app.vault.read.bind(app.vault);
		vi.spyOn(app.vault, 'read').mockImplementation(async (file) => {
			if (file.path === 'Broken.md') throw new Error('locked');
			return read(file);
		});
		expect(await scan('pool')).toEqual({ names: ['Fine'], unreadable: 1 });
	});

	it('names notes in vault-path order, by basename', async () => {
		await app.vault.create('b/Zed.md', character([['Amulet', '1', 'pool += 2']]));
		await app.vault.create('a/Yan.md', character([['Amulet', '1', 'pool += 2']]));
		expect((await scan('pool')).names).toEqual(['Yan', 'Zed']);
	});

	it('writes no note', async () => {
		await app.vault.create('Fine.md', character([['Amulet', '1', 'pool += 2']]));
		const process = vi.spyOn(app.vault, 'process');
		const modify = vi.spyOn(app.vault, 'modify');
		await scan('pool');
		expect(process).not.toHaveBeenCalled();
		expect(modify).not.toHaveBeenCalled();
	});
});

describe('idRenameMessage', () => {
	const none = { names: [], unreadable: 0 };

	it('counts the places it rewrote', () => {
		expect(idRenameMessage('pool', 'hp', 3, none)).toBe(
			'Renamed "pool" to "hp" and updated the 3 places that read it.',
		);
		expect(idRenameMessage('pool', 'hp', 1, none)).toBe(
			'Renamed "pool" to "hp" and updated the place that read it.',
		);
	});

	it('names up to five notes, and says where they read it', () => {
		expect(idRenameMessage('pool', 'hp', 0, { names: ['Ilona', 'Id renames'], unreadable: 0 })).toBe(
			'Renamed "pool" to "hp". 2 character notes still read "pool" in modifier cells: Ilona, Id renames. Change those by hand.',
		);
		expect(idRenameMessage('pool', 'hp', 3, { names: ['Id renames'], unreadable: 0 })).toBe(
			'Renamed "pool" to "hp" and updated the 3 places that read it. 1 character note still reads "pool" in modifier cells: Id renames. Change those by hand.',
		);
	});

	it('counts past five and names five among them', () => {
		const names = ['Ilona', 'Id renames', 'Ravel', 'Sera', 'Thora', 'Wren', 'Mireth', 'Garrick'];
		expect(idRenameMessage('pool', 'hp', 0, { names, unreadable: 0 })).toBe(
			'Renamed "pool" to "hp". 8 character notes still read "pool" in modifier cells, among them Ilona, Id renames, Ravel, Sera and Thora. Change those by hand.',
		);
	});

	it('closes on the notes it could not read', () => {
		expect(idRenameMessage('pool', 'hp', 2, { names: [], unreadable: 1 })).toBe(
			'Renamed "pool" to "hp" and updated the 2 places that read it. 1 character note could not be read and was left alone.',
		);
		expect(idRenameMessage('pool', 'hp', 2, { names: [], unreadable: 3 })).toContain(
			'3 character notes could not be read and were left alone.',
		);
	});

	it('says nothing where nothing was rewritten and no note was found', () => {
		expect(idRenameMessage('pool', 'hp', 0, none)).toBeNull();
	});
});
