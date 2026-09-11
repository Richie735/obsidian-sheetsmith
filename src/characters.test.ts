// @vitest-environment happy-dom
/*
 * Creating a character note, and the gesture around it
 * (`docs/features/layout-picker.md`, `docs/features/character-folder.md`).
 *
 * The vault here is `src/test/obsidian-stub.ts`'s, which is a real map of paths
 * to content, so the three things this path decides are all observable without
 * the app: the bytes that land, the folder they land in, and the name they land
 * under when one is taken. `FileManager.getNewFileParent` is a recorder there —
 * the app answers it from a preference nothing here models — so what is
 * asserted is the folder it was told to use and the source path it was asked
 * about.
 *
 * **The recorder being a recorder is what makes the folder setting drivable
 * both ways.** With no folder configured, what can be held is the folder it was
 * told to use and the source path it was asked about. With one configured, the
 * assertion inverts and gets stronger: the recorder stays *empty*, so "the
 * setting won" is a fact about a call that did not happen rather than about a
 * path that happens to match.
 *
 * happy-dom rather than node because the gesture reaches a modal and a leaf,
 * and both build an element in their constructor.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App as ObsidianApp } from 'obsidian';
import {
	chooseLayoutForNewCharacter,
	createCharacter,
	openNewCharacter,
} from './characters';
import { noLayoutsMessage } from './layouts';
import { parseCharacter, serialiseCharacter } from './parse/character';
import {
	App,
	Notice,
	TFile,
	TFolder,
	WorkspaceLeaf,
} from './test/obsidian-stub';
import { fakePlugin, LAYOUT_FOLDER } from './test/plugin';
import { VIEW_TYPE_SHEET } from './view/sheet-view';

const LAYOUT = 'Starter 5e';

/**
 * The shipped character folder, which is no folder at all.
 *
 * Named rather than written as a bare `''` beside `sourcePath`'s bare `''`,
 * because the two empty strings mean different things: this one is "the reader
 * has expressed no opinion, so the app answers", and that one is "there is no
 * current file". A reader of `createCharacter(vault(), '', LAYOUT, '')` cannot
 * tell which is which, and the argument for the empty default is the whole of
 * `docs/features/character-folder.md`.
 */
const NO_FOLDER = '';

let app: App;

/**
 * The stub app where the real one is asked for.
 *
 * `picker.test.ts`'s own helper and its reason: the stub is a *double* for
 * `App` rather than an implementation of it, so every call site would otherwise
 * carry the same `as unknown` and the same paragraph.
 */
const vault = () => app as unknown as ObsidianApp;

/** A layout file in the configured folder, so the picker has something to list. */
const giveLayout = async (name: string): Promise<void> => {
	if (!app.vault.getFolderByPath(LAYOUT_FOLDER)) {
		await app.vault.createFolder(LAYOUT_FOLDER);
	}
	await app.vault.create(
		`${LAYOUT_FOLDER}/${name}.json`,
		JSON.stringify({ name, columns: 6, components: [] }),
	);
};

const contentAt = async (path: string): Promise<string> => {
	const file = app.vault.getFileByPath(path);
	expect(file, `${path} was not written`).not.toBeNull();
	return app.vault.read(file as NonNullable<typeof file>);
};

beforeEach(() => {
	app = new App();
	Notice.messages = [];
	document.body.replaceChildren();
	// One case spies on `WorkspaceLeaf.prototype`, which outlives a fresh `App`
	// and would answer for every case after it.
	vi.restoreAllMocks();
});

describe('createCharacter', () => {
	it('writes frontmatter and nothing else', async () => {
		const result = await createCharacter(vault(), NO_FOLDER, LAYOUT, '');
		expect(result).toEqual({ ok: true, path: 'Untitled character.md' });
		expect(await contentAt('Untitled character.md')).toBe(
			'---\nsheet-layout: Starter 5e\n---\n',
		);
	});

	it('writes a note that round-trips byte for byte', async () => {
		// Constraint 3, on the bytes that actually reached the vault rather than
		// on a string a test composed.
		await createCharacter(vault(), NO_FOLDER, LAYOUT, '');
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

		const root = await createCharacter(vault(), NO_FOLDER, LAYOUT, '');
		expect(root).toEqual({ ok: true, path: 'Untitled character.md' });
		// No leading slash, and — the half that was missing — the path handed
		// back is a path the vault actually resolves.
		expect(app.vault.getFileByPath('Untitled character.md')).not.toBeNull();

		app.fileManager.newFileParent = new TFolder('Characters/Party', app.vault);
		const named = await createCharacter(vault(), NO_FOLDER, LAYOUT, '');
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
		const result = await createCharacter(vault(), NO_FOLDER, LAYOUT, '');
		if ('error' in result) throw new Error(result.error);
		expect(app.vault.getFileByPath(result.path)).not.toBeNull();
		expect(result.path).not.toMatch(/^\//);
		expect(result.path).not.toContain('//');
	});

	it('asks the app where a new note goes, naming the file it was run from', async () => {
		// The source path is what makes **Same folder as current file** mean
		// what it says; the empty string is what the app itself passes where
		// there is no current file.
		await createCharacter(vault(), NO_FOLDER, LAYOUT, 'Party/Aramil.md');
		await createCharacter(vault(), NO_FOLDER, LAYOUT, '');
		expect(app.fileManager.newFileParentSources).toEqual([
			'Party/Aramil.md',
			'',
		]);
	});

	it('numbers the next one and leaves the first alone', async () => {
		await createCharacter(vault(), NO_FOLDER, LAYOUT, '');
		const first = await contentAt('Untitled character.md');

		expect(await createCharacter(vault(), NO_FOLDER, 'Starter PF2e', '')).toEqual({
			ok: true,
			path: 'Untitled character 1.md',
		});
		expect(await createCharacter(vault(), NO_FOLDER, 'Starter PF2e', '')).toEqual({
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
		expect(await createCharacter(vault(), NO_FOLDER, LAYOUT, '')).toEqual({
			error: 'the vault is read-only',
		});
		expect(app.vault.getFileByPath('Untitled character.md')).toBeNull();
	});

	it('quotes a layout name a plain scalar would read differently', async () => {
		await createCharacter(vault(), NO_FOLDER, 'Blades: the sequel', '');
		expect(await contentAt('Untitled character.md')).toBe(
			'---\nsheet-layout: "Blades: the sequel"\n---\n',
		);
	});
});

/*
 * The configured character folder (`docs/features/character-folder.md`).
 *
 * Every case above passes `NO_FOLDER`, which is the shipped value and the whole
 * of what this feature promises not to change. What is driven here is the
 * override: the folder it writes into, that it stops asking the app once one is
 * set, that a folder it is told about is created rather than refused, and that
 * one spelling of the path reaches all three halves of the function.
 */
describe('the character folder', () => {
	it('defers to the app where none is configured, and asks about the source file', async () => {
		/*
		 * The criterion that an untouched install is unchanged, asserted against
		 * the *setting* rather than as a side effect of another case. The two
		 * cases above that overlap it are about other things — one about the
		 * root's path being `/`, one about `getNewFileParent`'s argument — and
		 * neither would fail if this branch started reading the folder wrongly
		 * in a way that happened to land at the root.
		 */
		app.fileManager.newFileParent = new TFolder('Party', app.vault);
		expect(await createCharacter(vault(), NO_FOLDER, LAYOUT, 'Party/Aramil.md')).toEqual({
			ok: true,
			path: 'Party/Untitled character.md',
		});
		expect(app.fileManager.newFileParentSources).toEqual(['Party/Aramil.md']);
	});

	it('writes into the configured folder and never asks the app', async () => {
		// The second half is the point of the setting: where the reader has said
		// which folder, **Same folder as current file** must not still get a
		// vote, so the recorder stays empty rather than merely being ignored.
		await app.vault.createFolder('Characters');
		expect(
			await createCharacter(vault(), 'Characters', LAYOUT, 'Party/Aramil.md'),
		).toEqual({ ok: true, path: 'Characters/Untitled character.md' });
		expect(await contentAt('Characters/Untitled character.md')).toBe(
			'---\nsheet-layout: Starter 5e\n---\n',
		);
		expect(app.fileManager.newFileParentSources).toEqual([]);
	});

	it('creates a configured folder that is missing, once, and writes inside it', async () => {
		// `createLayout`'s branch, and the count is the assertion: the existence
		// check has to be asked with the same spelling the create used, or the
		// second character re-creates a folder that is already there — which the
		// app refuses outright.
		const created = vi.spyOn(app.vault, 'createFolder');
		expect(
			await createCharacter(vault(), 'Characters/New', LAYOUT, ''),
		).toEqual({ ok: true, path: 'Characters/New/Untitled character.md' });
		expect(
			await createCharacter(vault(), 'Characters/New', 'Starter PF2e', ''),
		).toEqual({ ok: true, path: 'Characters/New/Untitled character 1.md' });
		expect(created.mock.calls).toEqual([['Characters/New']]);
		expect(app.vault.getFolderByPath('Characters/New')).not.toBeNull();
		expect(
			await contentAt('Characters/New/Untitled character.md'),
		).toBe('---\nsheet-layout: Starter 5e\n---\n');
	});

	it('normalises the folder once, so the check, the dedupe and the write agree', async () => {
		/*
		 * `availablePath`'s invariant with a third half added to it. The folder
		 * check is `getFolderByPath`, a raw map lookup like `getFileByPath`, so
		 * an unnormalised spelling is told the folder is absent; the write
		 * normalises on its own. Two spellings of one folder therefore have to
		 * produce one path, and the dedupe has to see the first note when the
		 * second is written under the other spelling.
		 */
		expect(
			await createCharacter(vault(), 'Sheets//Characters/', LAYOUT, ''),
		).toEqual({ ok: true, path: 'Sheets/Characters/Untitled character.md' });
		expect(
			await createCharacter(vault(), 'Sheets/Characters', LAYOUT, ''),
		).toEqual({ ok: true, path: 'Sheets/Characters/Untitled character 1.md' });
	});

	it('returns the vault’s own reason where the folder cannot be created', async () => {
		// A file sitting where the folder would go, which is a state a reader can
		// genuinely type their way into. The app's `createFolder` checks
		// `adapter.exists` rather than looking for a folder, so a file at that
		// path refuses with `Folder already exists.` — and nothing is written,
		// because the folder comes before the note.
		await app.vault.create('Characters', 'not a folder');
		expect(await createCharacter(vault(), 'Characters', LAYOUT, '')).toEqual({
			error: 'Folder already exists.',
		});
		expect(
			app.vault.getFileByPath('Characters/Untitled character.md'),
		).toBeNull();
		expect(await contentAt('Characters')).toBe('not a folder');
	});

	it('leaves the folder it created behind where the note is then refused', async () => {
		/*
		 * The two writes in one `try`, in order, which is the one case where the
		 * error arm does not mean "nothing happened": the folder lands, the note
		 * is refused, and the folder stays. Pinned rather than fixed — the empty
		 * folder is what the branch prices as the cost of a typo, and deleting a
		 * folder the reader named to tidy up a failed write is a second
		 * destructive call on the one path where the vault has just proved it
		 * refuses writes. A test says so, so the next reader meets the
		 * behaviour rather than the comment alone.
		 */
		vi.spyOn(app.vault, 'create').mockRejectedValue(
			new Error('the vault is read-only'),
		);
		expect(await createCharacter(vault(), 'Characters/New', LAYOUT, '')).toEqual({
			error: 'the vault is read-only',
		});
		expect(app.vault.getFolderByPath('Characters/New')).not.toBeNull();
		expect(
			app.vault.getFileByPath('Characters/New/Untitled character.md'),
		).toBeNull();
	});
});

describe('openNewCharacter', () => {
	it('opens the created note as a sheet, at a path that resolves', async () => {
		const plugin = fakePlugin(app);
		await openNewCharacter(plugin, LAYOUT);
		const leaf = app.workspace.leaves.at(-1);
		expect(leaf?.viewStates).toEqual([
			{ type: VIEW_TYPE_SHEET, state: { file: 'Untitled character.md' } },
		]);
		/*
		 * **The path in the state has to name a file the vault holds**, which is
		 * the assertion whose absence made "creates it but does not open it"
		 * invisible. Asking only what was *requested* passes for any string:
		 * `setViewState` resolves the file itself, so a path that resolves to
		 * nothing opens a sheet with no note in it and the request looks
		 * perfect from here.
		 */
		const asked = leaf?.viewStates.at(0)?.state?.file;
		expect(typeof asked).toBe('string');
		expect(app.vault.getFileByPath(asked as string)).not.toBeNull();
		// The sheet appearing is the feedback; there is no success notice.
		expect(Notice.messages).toEqual([]);
	});

	it('opens as a sheet whatever the open-in-sheet-view preference says', async () => {
		// That preference governs opening a note the reader already has. This
		// gesture's whole promise is a sheet on screen.
		for (const openInSheetView of [true, false]) {
			const plugin = fakePlugin(app);
			plugin.settings.openInSheetView = openInSheetView;
			await openNewCharacter(plugin, LAYOUT);
			expect(
				app.workspace.leaves.at(-1)?.viewStates.at(0)?.type,
				String(openInSheetView),
			).toBe(VIEW_TYPE_SHEET);
		}
	});

	it('passes the active file’s path through to the app', async () => {
		app.workspace.activeFile = new TFile('Party/Aramil.md', app.vault);
		await openNewCharacter(fakePlugin(app), LAYOUT);
		expect(app.fileManager.newFileParentSources).toEqual(['Party/Aramil.md']);
	});

	it('passes the configured character folder through, and opens what it wrote', async () => {
		/*
		 * The seam: the setting is read here rather than inside
		 * `createCharacter`, so nothing else in the plugin can reach it. Driven
		 * to the *opened* note rather than only to the written one, because a
		 * folder that reached the write and not the view state is a sheet with
		 * no note in it — which is the failure the case above this block exists
		 * for, one argument over.
		 */
		const plugin = fakePlugin(app);
		plugin.settings.characterFolder = 'Characters/Party';
		app.workspace.activeFile = new TFile('Elsewhere/Aramil.md', app.vault);
		await openNewCharacter(plugin, LAYOUT);
		expect(app.workspace.leaves.at(-1)?.viewStates).toEqual([
			{
				type: VIEW_TYPE_SHEET,
				state: { file: 'Characters/Party/Untitled character.md' },
			},
		]);
		expect(
			app.vault.getFileByPath('Characters/Party/Untitled character.md'),
		).not.toBeNull();
		expect(app.fileManager.newFileParentSources).toEqual([]);
		expect(Notice.messages).toEqual([]);
	});

	it('says so where the note landed and the sheet would not open', async () => {
		// The note is on disk and no sheet is on screen, which is the one state
		// the reader cannot see: a rejection here reaches a caller that can only
		// `void` this, so unanswered it is an unhandled promise and silence.
		vi.spyOn(WorkspaceLeaf.prototype, 'setViewState').mockRejectedValue(
			new Error('that view type is not registered'),
		);
		await openNewCharacter(fakePlugin(app), LAYOUT);
		expect(app.vault.getFileByPath('Untitled character.md')).not.toBeNull();
		expect(Notice.messages).toEqual([
			'Sheetsmith created "Untitled character.md" but could not open it as a sheet: that view type is not registered',
		]);
	});

	it('announces a refusal and opens nothing', async () => {
		vi.spyOn(app.vault, 'create').mockRejectedValue(
			new Error('the vault is read-only'),
		);
		await openNewCharacter(fakePlugin(app), LAYOUT);
		expect(Notice.messages).toEqual(['the vault is read-only']);
		expect(app.workspace.leaves.flatMap((leaf) => leaf.viewStates)).toEqual([]);
	});
});

describe('the create gesture', () => {
	const modals = (): number =>
		document.body.querySelectorAll('.modal-container').length;

	/** One turn of the loop, so the choice's own promise has run. */
	const settle = (): Promise<unknown> =>
		new Promise((resolve) => window.setTimeout(resolve, 0));

	it('opens the picker where the folder holds a layout', async () => {
		await giveLayout(LAYOUT);
		chooseLayoutForNewCharacter(fakePlugin(app));
		expect(modals()).toBe(1);
		expect(Notice.messages).toEqual([]);
	});

	it('writes the note and opens it when a row is chosen', async () => {
		/*
		 * The wiring, driven through the app's own `onChooseSuggestion` rather
		 * than around it. Until this case existed, deleting the body of the
		 * callback the gesture passes to `pickLayout` left the whole suite
		 * green while the command opened a picker that did nothing at all —
		 * every other case here drives `createCharacter` or
		 * `openNewCharacter` directly, so none of them crosses that seam.
		 */
		await giveLayout(LAYOUT);
		const picker = chooseLayoutForNewCharacter(fakePlugin(app));
		expect(picker).not.toBeNull();
		const [row] = picker?.getSuggestions('') ?? [];
		if (!row) throw new Error('the picker listed no layout to choose');
		expect(row.basename).toBe(LAYOUT);

		picker?.onChooseSuggestion(row);
		await settle();

		expect(await contentAt('Untitled character.md')).toBe(
			'---\nsheet-layout: Starter 5e\n---\n',
		);
		expect(app.workspace.leaves.at(-1)?.viewStates).toEqual([
			{ type: VIEW_TYPE_SHEET, state: { file: 'Untitled character.md' } },
		]);
	});

	it('opens no picker to hand back where there are no layouts', () => {
		expect(chooseLayoutForNewCharacter(fakePlugin(app))).toBeNull();
	});

	it('opens no modal over a folder with no layouts, and names the fix', () => {
		// Cold start: a reader who has not run **Add a starter layout** yet. A
		// suggester over zero rows is a control that cannot succeed under any
		// input, so it is not opened at all.
		chooseLayoutForNewCharacter(fakePlugin(app));
		expect(modals()).toBe(0);
		expect(Notice.messages).toEqual([noLayoutsMessage(LAYOUT_FOLDER)]);
	});

	it('names the configured folder rather than the default', () => {
		const plugin = fakePlugin(app);
		plugin.settings.layoutFolder = 'Elsewhere/Sheets';
		chooseLayoutForNewCharacter(plugin);
		expect(modals()).toBe(0);
		expect(Notice.messages).toEqual([
			'No layouts in "Elsewhere/Sheets" yet. Run "Add a starter layout" from the command palette to get one.',
		]);
	});

	it('opens no modal over a folder that holds files but no layout', async () => {
		// The folder exists and is not empty; nothing in it is a layout.
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(`${LAYOUT_FOLDER}/notes.md`, 'not a layout');
		chooseLayoutForNewCharacter(fakePlugin(app));
		expect(modals()).toBe(0);
		expect(Notice.messages).toEqual([noLayoutsMessage(LAYOUT_FOLDER)]);
	});
});
