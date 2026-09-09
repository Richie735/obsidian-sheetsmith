/*
 * Creating a character note (`docs/features/layout-picker.md`).
 *
 * Beside `layouts.ts`, which owns the other file kind this plugin writes: one
 * module per kind, and this one holds the whole of what "create a character"
 * means — the note's path and bytes, and the gesture that gets a layout name
 * for it and puts the sheet on screen. `starters/picker.ts` holds the same pair
 * for its own command; the difference here is that the modal is shared with a
 * second caller and so lives in `layout-picker.ts`, while the write and the
 * gesture belong to this caller alone.
 *
 * **The character folder is an override, and it ships empty**
 * (`docs/features/character-folder.md`). Obsidian already asks where a new note
 * goes, once, globally, in **Settings → Files and links → Default location for
 * new notes**, and `getNewFileParent` is the API that answers it — so out of the
 * box this module holds no opinion and every note-creating gesture in the app
 * still agrees with every other. A vault that wants characters landing in one
 * place types a folder into the settings tab and gets that folder instead, for
 * every character the plugin creates.
 *
 * **The two folder settings fall back to different kinds of thing, and that
 * asymmetry with the layout folder is what decides the empty default.** A layout
 * is looked up *by name inside* a folder, so the folder is part of the lookup
 * and the plugin cannot work without knowing it — which is why an emptied layout
 * folder falls back to a folder name of the plugin's own. A character note is
 * looked up by nothing: the note names the layout, the layout never names the
 * note, and the plugin finds a character because the reader opened it. So a
 * character note can be moved anywhere at any time and nothing breaks, and this
 * setting has nothing to fall back *to* except the app's own answer.
 */

import { App, normalizePath, Notice } from 'obsidian';
import { hasLayouts, noLayoutsMessage } from './layouts';
import { LayoutModal, pickLayout } from './layout-picker';
import type SheetsmithPlugin from './main';
import { newCharacterNote } from './parse/character';
import { sheetViewState } from './view/sheet-view';

/**
 * The placeholder name a new character note is given.
 *
 * Obsidian's **Create new note** writes `Untitled` and hands the reader the
 * app's own rename gesture, which is one keystroke, knows the vault's illegal
 * characters better than any modal here could, and updates every link to the
 * note. This follows it and says which kind of thing the file is, because the
 * folder may hold several; and it reads as a placeholder, so nobody mistakes it
 * for a name they chose.
 */
const BASE_NAME = 'Untitled character';

/**
 * Where the note went, or why it did not.
 *
 * Failure is a value (`docs/PATTERNS.md` §4) and `installStarter`'s
 * `InstallResult` is the shape: a read-only vault and a refused path are both
 * things a reader can meet, and the caller has to be able to tell either from a
 * write that landed. The path rather than the `TFile`, because what the caller
 * does next is name the file in a view state.
 */
export type CreateResult = { ok: true; path: string } | { error: string };

/**
 * The first `Untitled character` path in `folder` that no file holds.
 *
 * Deduped Obsidian-style — `Untitled character 1`, `Untitled character 2` — with
 * a loop over `vault.getFileByPath` rather than
 * `getAvailablePathForAttachment`, which resolves into the *attachment* folder
 * and would answer a different question. The vault holds finitely many files,
 * so the loop ends.
 *
 * **Every path here goes through `normalizePath`, which is the whole of the
 * fix for a bug that shipped past a green suite.** This function used to join
 * explicitly — `folder === '' ? name : folder + '/' + name` — on the stated
 * premise that "the vault root's path is the empty string". It is not: the
 * app's own `normalizePath` answers `/` for an empty path, and
 * `getNewFileParent` returns `vault.getRoot()` for the *default* **Default
 * location for new notes**. So at the root the join produced
 * `//Untitled character.md`, and the two halves of this function then disagreed
 * about what a path is: `getFileByPath` is a raw map lookup and missed the
 * existing note, so the loop always believed the name was free, while
 * `vault.create` normalises before writing and landed on
 * `Untitled character.md`. First run wrote a file and handed its caller a path
 * that resolves to nothing; second run hit `File already exists.`
 *
 * **One spelling for the check and the write is the invariant**, and
 * `normalizePath` is what gives it: the path this returns is the path `create`
 * will use, so a name the loop calls free is a name the vault will accept. It
 * is also how `layouts.ts` has spelled every path it builds all along, five
 * times over, so the two file kinds this plugin writes now agree about what a
 * path is instead of one of them re-deriving it.
 */
function availablePath(app: App, folder: string): string {
	const join = (name: string): string => normalizePath(`${folder}/${name}.md`);
	let path = join(BASE_NAME);
	for (let n = 1; app.vault.getFileByPath(path) !== null; n++) {
		path = join(`${BASE_NAME} ${n}`);
	}
	return path;
}

/**
 * Write a new character note naming `layoutName`, and say where it went.
 *
 * `folder` is the configured character folder and sits second, mirroring
 * `createLayout(app, folder, name)`: the setting is read at the plugin boundary
 * in `openNewCharacter`, so this stays a function of an app and a folder that a
 * test can drive without a plugin. **Empty means the app answers**, which is how
 * the plugin ships.
 *
 * **A trimmed folder is a precondition rather than something proved here.** The
 * settings tab trims what is typed and `loadSettings` trims what was persisted,
 * so nothing in the plugin reaches this with a padded value and there is no
 * third copy of that rule inside this function — but `loadSettings` runs only
 * from `onload` and no test drives it (`docs/PATTERNS.md` §11), so that is a
 * contract this function relies on, not a guarantee it can point at. An
 * untrimmed folder is out of contract: it would create a folder whose name has
 * the spaces in it, because `normalizePath` does not trim and the app treats a
 * trailing space as part of a folder name.
 *
 * `sourcePath` is the file the gesture was run from, passed through to
 * `getNewFileParent` so that **Same folder as current file** means what it
 * says. The empty string is the vault root, which is what the app itself
 * passes when there is no current file. A configured folder makes it moot:
 * `getNewFileParent` is not asked at all, because the whole point of the
 * setting is that the answer does not depend on where the gesture was run.
 *
 * **The layout is never read here.** This writes a name, not a shape, so
 * creating a character against a layout whose JSON is broken still produces a
 * valid note and the broken layout is reported where it is broken — on the
 * sheet, in place (`docs/UI.md` §10) — rather than turning a create gesture
 * into a parse error.
 *
 * `vault.create` refuses a path that is taken, which is the backstop behind the
 * dedupe above rather than a substitute for it: nothing is overwritten even if
 * a file appeared between the two calls.
 */
export async function createCharacter(
	app: App,
	folder: string,
	layoutName: string,
	sourcePath: string,
): Promise<CreateResult> {
	try {
		/*
		 * **Normalised exactly once, and the emptiness check comes first.**
		 * `normalizePath('')` is `/`, the vault root, so normalising before
		 * asking whether a folder was configured at all would silently turn
		 * "follow the app's setting" into "write at the root" and take **Same
		 * folder as current file** away from every reader who never touched the
		 * preference.
		 *
		 * One spelling then reaches all three halves — the existence check, the
		 * dedupe loop and the write — which is `availablePath`'s own invariant
		 * with a third half added to it. `getFolderByPath` is a raw map lookup
		 * like `getFileByPath`, so an unnormalised spelling would miss a folder
		 * that is there and try to create it again.
		 */
		const configured = folder === '' ? null : normalizePath(folder);
		if (configured !== null && !app.vault.getFolderByPath(configured)) {
			/*
			 * `createLayout`'s branch, one module over, on the same evidence: a
			 * reader who typed a folder into a field reading "New characters are
			 * written here" has said where they want characters, and the plugin
			 * already creates its own layout folder on no more than that. The
			 * alternative — refuse, and send them to the file explorer — buys
			 * only the typo case, and what a typo costs here is an empty folder.
			 */
			await app.vault.createFolder(configured);
		}
		// `??` short-circuits, so a configured folder never asks the app: the
		// setting's whole promise is a folder that does not depend on the note
		// the gesture was run from.
		const dir = configured ?? app.fileManager.getNewFileParent(sourcePath).path;
		const path = availablePath(app, dir);
		await app.vault.create(path, newCharacterNote(layoutName));
		return { ok: true, path };
	} catch (error) {
		/*
		 * The vault's own reason: read-only, a path refused, a folder gone, or a
		 * configured folder the vault will not create because a file is sitting
		 * at that path.
		 *
		 * **No note is written on any of those, which is what makes one arm
		 * enough — but the folder above can already have landed.** There are two
		 * writes in this `try` and they are ordered, so a `create` that fails
		 * after a `createFolder` that succeeded leaves an empty folder behind
		 * while this returns `{ error }`. That is the same empty folder the
		 * branch above prices as the cost of a typo, so it is not worth a
		 * rollback — deleting a folder to tidy up a failed write is a second
		 * destructive call on a path the reader named, on the one code path
		 * where the vault has just proved it refuses writes.
		 */
		return { error: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * Create a character on `layoutName` and open it as a sheet.
 *
 * **Sheet view always, whatever `openInSheetView` says.** That preference
 * governs what happens when a note the reader already has is *opened*; this
 * gesture's whole promise is a sheet on screen, and **Open as Markdown** is one
 * press away for anyone who wants the other thing. The second reason decides it
 * on its own: `view/auto-open.ts` reads `metadataCache`, which indexes a
 * freshly created file asynchronously, so leaning on auto-open here would be a
 * race. `setViewState` needs no cache.
 *
 * The active leaf (`getLeaf(false)`), matching Obsidian's own **Create new
 * note**, so the app's back arrow returns to what was there.
 *
 * **No success notice.** The sheet appearing is the feedback, and the note's
 * placeholder name is visible in the tab and the note header, which is where
 * the rename gesture lives.
 */
export async function openNewCharacter(
	plugin: SheetsmithPlugin,
	layoutName: string,
): Promise<void> {
	// The configured folder is read here, beside
	// `chooseLayoutForNewCharacter`'s read of `layoutFolder`: the settings live
	// at the plugin boundary and `createCharacter` takes a folder.
	const result = await createCharacter(
		plugin.app,
		plugin.settings.characterFolder,
		layoutName,
		plugin.app.workspace.getActiveFile()?.path ?? '',
	);
	// `'error' in` rather than `'ok' in`, which is §4's documented spelling for
	// a two-armed result: the failure arm is the one a caller must not forget.
	if ('error' in result) {
		new Notice(result.error);
		return;
	}
	/*
	 * **The open is a failure a reader can meet too**, so it is answered rather
	 * than allowed to escape (§4). It is awaited inside a gesture the app calls
	 * without awaiting — `onChooseSuggestion` is synchronous, so the caller can
	 * only `void` this — and a rejection there is an unhandled promise: the note
	 * is on disk, no sheet is on screen, and nothing on screen says either. The
	 * sentence names the note, because the note existing is the part the reader
	 * cannot see and the part they can act on.
	 */
	try {
		await plugin.app.workspace
			.getLeaf(false)
			.setViewState(sheetViewState(result.path));
	} catch (error) {
		new Notice(
			`Sheetsmith created "${result.path}" but could not open it as a sheet: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * The **Create a character** gesture: pick a layout, write the note, open it.
 *
 * **The picker never opens over an empty folder.** Cold start is a reader who
 * has not run **Add a starter layout** yet, so their layout folder is empty or
 * absent, and a suggester over zero rows is a control that cannot succeed under
 * any input. They get `noLayoutsMessage` instead, which names the folder and the
 * command that fills it.
 *
 * Exported as the gesture the command names, which is `chooseStarterLayout`'s
 * precedent — and what makes the empty branch's sentence assertable, since a
 * command callback is reachable only through a registered command.
 *
 * Returns the picker it opened, or null where it opened none. Nothing in the
 * plugin reads that; a case does, because the app calls `onChooseSuggestion`
 * and the callback below is the whole of the wiring between a chosen row and a
 * note on screen (`pickLayout`'s own header carries the argument).
 */
export function chooseLayoutForNewCharacter(
	plugin: SheetsmithPlugin,
): LayoutModal | null {
	const folder = plugin.settings.layoutFolder;
	if (!hasLayouts(plugin.app, folder)) {
		new Notice(noLayoutsMessage(folder));
		return null;
	}
	return pickLayout(plugin, (name) => void openNewCharacter(plugin, name));
}
