// @vitest-environment happy-dom
/*
 * Creating a character note, and the gesture around it
 * (`docs/features/layout-picker.md`).
 *
 * The vault here is `src/test/obsidian-stub.ts`'s, which is a real map of paths
 * to content, so the three things this path decides are all observable without
 * the app: the bytes that land, the folder they land in, and the name they land
 * under when one is taken. `FileManager.getNewFileParent` is a recorder there —
 * the app answers it from a preference nothing here models — so what is
 * asserted is the folder it was told to use and the source path it was asked
 * about.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App as ObsidianApp } from 'obsidian';
import { createCharacter } from './characters';
import { parseCharacter, serialiseCharacter } from './parse/character';
import { App, TFolder } from './test/obsidian-stub';

const LAYOUT = 'Starter 5e';

let app: App;

/**
 * The stub app where the real one is asked for.
 *
 * `picker.test.ts`'s own helper and its reason: the stub is a *double* for
 * `App` rather than an implementation of it, so every call site would otherwise
 * carry the same `as unknown` and the same paragraph.
 */
const vault = () => app as unknown as ObsidianApp;

const contentAt = async (path: string): Promise<string> => {
	const file = app.vault.getFileByPath(path);
	expect(file, `${path} was not written`).not.toBeNull();
	return app.vault.read(file as NonNullable<typeof file>);
};

beforeEach(() => {
	app = new App();
	vi.restoreAllMocks();
});

describe('createCharacter', () => {
	it('writes frontmatter and nothing else', async () => {
		const result = await createCharacter(vault(), LAYOUT, '');
		expect(result).toEqual({ ok: true, path: 'Untitled character.md' });
		expect(await contentAt('Untitled character.md')).toBe(
			'---\nsheet-layout: Starter 5e\n---\n',
		);
	});

	it('writes a note that round-trips byte for byte', async () => {
		// Constraint 3, on the bytes that actually reached the vault rather than
		// on a string a test composed.
		await createCharacter(vault(), LAYOUT, '');
		const written = await contentAt('Untitled character.md');
		const note = parseCharacter(written);
		expect(serialiseCharacter(note)).toBe(written);
		expect(note.layoutName).toBe(LAYOUT);
		expect(note.sections).toEqual([]);
	});

	it('lands in the folder the app names, with no leading slash at the root', async () => {
		/*
		 * **The vault root's path is `/`, not the empty string**, and this
		 * assertion is the one that was wrong. Obsidian's own `normalizePath`
		 * answers `/` for an empty path and `getNewFileParent` returns
		 * `vault.getRoot()` for the default **Default location for new notes**,
		 * so the root is the *common* case rather than an edge — and a joined
		 * `/` + name is what shipped a note the sheet could not open. The
		 * premise is asserted here first, because every line below it is only
		 * meaningful if the double still says `/`.
		 */
		expect(app.fileManager.newFileParent.path).toBe('/');
		expect(app.vault.getRoot().path).toBe('/');

		const root = await createCharacter(vault(), LAYOUT, '');
		expect(root).toEqual({ ok: true, path: 'Untitled character.md' });
		// No leading slash, and — the half that was missing — the path handed
		// back is a path the vault actually resolves.
		expect(app.vault.getFileByPath('Untitled character.md')).not.toBeNull();

		app.fileManager.newFileParent = new TFolder('Characters/Party', app.vault);
		const named = await createCharacter(vault(), LAYOUT, '');
		expect(named).toEqual({
			ok: true,
			path: 'Characters/Party/Untitled character.md',
		});
		expect(
			app.vault.getFileByPath('Characters/Party/Untitled character.md'),
		).not.toBeNull();
	});

	it('checks the path it is about to write, and no other spelling of it', async () => {
		/*
		 * The invariant the bug broke, asserted on its own rather than through a
		 * symptom. `getFileByPath` is a raw map lookup and `vault.create`
		 * normalises before writing, so a caller that builds one spelling for
		 * the check and lets the vault derive another gets "free" from every
		 * check and `File already exists.` from the write. Whatever this
		 * function returns has to be the path the vault ends up holding.
		 */
		const result = await createCharacter(vault(), LAYOUT, '');
		if ('error' in result) throw new Error(result.error);
		expect(app.vault.getFileByPath(result.path)).not.toBeNull();
		expect(result.path).not.toMatch(/^\//);
		expect(result.path).not.toContain('//');
	});

	it('asks the app where a new note goes, naming the file it was run from', async () => {
		// The source path is what makes **Same folder as current file** mean
		// what it says; the empty string is what the app itself passes where
		// there is no current file.
		await createCharacter(vault(), LAYOUT, 'Party/Aramil.md');
		await createCharacter(vault(), LAYOUT, '');
		expect(app.fileManager.newFileParentSources).toEqual([
			'Party/Aramil.md',
			'',
		]);
	});

	it('numbers the next one and leaves the first alone', async () => {
		await createCharacter(vault(), LAYOUT, '');
		const first = await contentAt('Untitled character.md');

		expect(await createCharacter(vault(), 'Starter PF2e', '')).toEqual({
			ok: true,
			path: 'Untitled character 1.md',
		});
		expect(await createCharacter(vault(), 'Starter PF2e', '')).toEqual({
			ok: true,
			path: 'Untitled character 2.md',
		});
		// Constraint 4: the note that was already there is untouched, including
		// the layout it names.
		expect(await contentAt('Untitled character.md')).toBe(first);
		expect(await contentAt('Untitled character 1.md')).toBe(
			'---\nsheet-layout: Starter PF2e\n---\n',
		);
	});

	it('returns the vault’s own reason and writes nothing where the write is refused', async () => {
		// A read-only vault, which is a state a reader can genuinely be in and
		// the one the stub cannot reach on its own.
		vi.spyOn(app.vault, 'create').mockRejectedValue(
			new Error('the vault is read-only'),
		);
		expect(await createCharacter(vault(), LAYOUT, '')).toEqual({
			error: 'the vault is read-only',
		});
		expect(app.vault.getFileByPath('Untitled character.md')).toBeNull();
	});

	it('quotes a layout name a plain scalar would read differently', async () => {
		await createCharacter(vault(), 'Blades: the sequel', '');
		expect(await contentAt('Untitled character.md')).toBe(
			'---\nsheet-layout: "Blades: the sequel"\n---\n',
		);
	});
});
