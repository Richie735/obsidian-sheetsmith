// @vitest-environment happy-dom
/*
 * The folder-creation policy both file writers copy
 * (`docs/features/character-folder.md`).
 *
 * `layouts.ts`'s `createLayout` and `characters.ts`'s `createCharacter` each
 * spell the same three lines — normalise the configured folder once, ask
 * `getFolderByPath` whether it is there, create it when it is not — and then
 * build a path under that same one spelling. Two consumers of one behaviour,
 * which `docs/PATTERNS.md` §1 allows **only** under a test driving both copies
 * over the same cases and failing when they disagree. This is that test, and it
 * is why the duplication is allowed rather than owed a module.
 *
 * **A module was weighed and is not this diff's to add.** `layouts.ts` is the
 * wrong home — extracting into one of two consumers is the shape §11 already
 * holds an open row against for `editor/list-fields.ts` — and a `src/vault/`
 * module for shared vault-writing policy is a folder-level decision rather than
 * a side effect of adding a settings row. So the rung below it is taken, on
 * purpose and in writing.
 *
 * **What drift means here is a shipped bug, already met once.**
 * `availablePath`'s header records it: two halves of one function disagreeing
 * about what a path is produced `//Untitled character.md`, which
 * `getFileByPath` read as free and `create` normalised onto an existing note.
 * The folder check is a third half of the same kind — `getFolderByPath` is a raw
 * map lookup too — so a copy that normalises after checking, or not at all, is
 * told a folder that is there is absent and asks the vault to create it twice.
 *
 * The cases are held in one array and run against both writers, so "the same
 * cases" is structural rather than something a reader has to verify by eye. Each
 * writer returns the path it wrote and the assertions are about the *folder* half
 * of it, which is the half the two share; the file names are each writer's own.
 *
 * **What is here and what stays in `characters.test.ts`.** That file's
 * "normalises the folder once…" case drives the same two spellings and overlaps
 * this one deliberately, because it asserts something this file cannot: that the
 * second write lands on `Untitled character 1.md`, which is `availablePath`'s
 * dedupe rather than the folder policy. So the shared invariant is held here,
 * over both writers, and each module keeps the cases that are about its own
 * naming.
 *
 * happy-dom because `characters.ts` reaches a modal and a leaf, and both build
 * an element in their constructor.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App as ObsidianApp } from 'obsidian';
import { createCharacter } from './characters';
import { createLayout } from './layouts';
import { App } from './test/obsidian-stub';

let app: App;

const vault = () => app as unknown as ObsidianApp;

beforeEach(() => {
	app = new App();
});

/** The folder half of a path, which is what the two writers share. */
const folderOf = (path: string): string =>
	path.slice(0, path.lastIndexOf('/'));

/**
 * The two copies, each reduced to "given this folder, where did you write".
 *
 * A refusal is raised rather than returned, so the two failure shapes —
 * `createLayout` throws, `createCharacter` returns `{ error }` — reach the
 * assertions as one thing.
 */
const writers = [
	{
		name: 'createLayout',
		write: async (folder: string): Promise<string> =>
			(await createLayout(vault(), folder, 'Starter 5e')).path,
	},
	{
		name: 'createCharacter',
		write: async (folder: string): Promise<string> => {
			const result = await createCharacter(vault(), folder, 'Starter 5e', '');
			if ('error' in result) throw new Error(result.error);
			return result.path;
		},
	},
];

it('holds both writers, by name', () => {
	/*
	 * **The floor this file cannot do without** (`docs/PATTERNS.md` §10). A
	 * hand-written array iterated with no assertion on its contents halves
	 * silently: delete the `createLayout` entry and the file below still passes,
	 * with three cases instead of six and one copy of the policy held to
	 * nothing. That matters more here than in an ordinary iterated test, because
	 * this file *is* the permission slip — §1 tolerates the duplication only
	 * under a test driving both copies, and there is no §11 row for it precisely
	 * because this test closed the question.
	 *
	 * The roster rather than the count, so it also carries the trigger §11 asks
	 * every deferred decision to name: a **third** writer of this policy arrives
	 * as a third entry, the ladder then says extract rather than guard, and this
	 * line is what turns that arrival into a red build instead of a quietly
	 * longer test run.
	 */
	expect(writers.map((writer) => writer.name)).toEqual([
		'createLayout',
		'createCharacter',
	]);
});

for (const writer of writers) {
	describe(writer.name, () => {
		it('creates a missing folder once, under one spelling, and writes inside it', async () => {
			const created = vi.spyOn(app.vault, 'createFolder');
			const path = await writer.write('Sheets//Files/');
			expect(folderOf(path)).toBe('Sheets/Files');
			expect(created.mock.calls).toEqual([['Sheets/Files']]);
			expect(app.vault.getFolderByPath('Sheets/Files')).not.toBeNull();
		});

		it('writes into a folder that is already there, spelled differently', async () => {
			// The discriminating case. `getFolderByPath` does not normalise, so a
			// copy that checked before normalising would be told this folder is
			// absent and ask for it again — and the vault refuses that outright,
			// so the write fails rather than landing somewhere odd.
			await app.vault.createFolder('Sheets/Files');
			const created = vi.spyOn(app.vault, 'createFolder');
			const path = await writer.write('Sheets//Files/');
			expect(folderOf(path)).toBe('Sheets/Files');
			expect(created).not.toHaveBeenCalled();
		});

		it('writes into the configured folder as spelled where it needs no fixing', async () => {
			await app.vault.createFolder('Sheets/Files');
			const path = await writer.write('Sheets/Files');
			expect(folderOf(path)).toBe('Sheets/Files');
		});
	});
}
