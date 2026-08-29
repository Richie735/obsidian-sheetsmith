import { App, normalizePath, TFile } from 'obsidian';
import { Layout, parseLayout, serialiseLayout } from './parse/layout';
import { unspellableName } from './parse/modifier-cell';
import { ModifierDefinition, PromoteResult } from './types';

/**
 * Load a layout by name from the configured layout folder.
 * Returns null when no such file exists; throws LayoutParseError when the
 * file exists but is invalid.
 */
export async function loadLayout(
	app: App,
	folder: string,
	name: string,
): Promise<Layout | null> {
	const path = normalizePath(`${folder}/${name}.json`);
	const file = app.vault.getFileByPath(path);
	if (!file) return null;
	return parseLayout(await app.vault.read(file));
}

/** All layout files in the folder, sorted by name. */
export function listLayouts(app: App, folder: string): TFile[] {
	const parent = app.vault.getFolderByPath(normalizePath(folder));
	if (!parent) return [];
	return parent.children
		.filter((child): child is TFile => child instanceof TFile && child.extension === 'json')
		.sort((a, b) => a.basename.localeCompare(b.basename));
}

/** Create an empty layout file, creating the folder when needed. */
export async function createLayout(
	app: App,
	folder: string,
	name: string,
): Promise<TFile> {
	const dir = normalizePath(folder);
	if (!app.vault.getFolderByPath(dir)) {
		await app.vault.createFolder(dir);
	}
	const path = normalizePath(`${dir}/${name}.json`);
	if (app.vault.getFileByPath(path)) {
		throw new Error(`A layout named "${name}" already exists.`);
	}
	return app.vault.create(
		path,
		serialiseLayout({ name, columns: 6, components: [] }),
	);
}

/**
 * Why a promotion under a name the layout already declares is refused.
 *
 * **Exported because the harness fakes this write and has to refuse it in the same
 * words.** There is no vault there, so it cannot call the function below — and a
 * second copy of the sentence would let the instrument show a refusal the plugin
 * does not give, which is what the host scan in `formula/sheet.test.ts` exists to
 * prevent one layer up.
 *
 * **Refused, always**, and the message says what to do instead rather than doing
 * it: the existing definition may say something different, and silently pointing
 * the row at it would change the row's arithmetic under a gesture whose whole
 * promise is that nothing changes.
 */
export function nameAlreadyDeclared(name: string): string {
	return `This layout already has a modifier called "${name}". Choose another name, or pick that one from the list above.`;
}

/**
 * Append one modifier definition to a layout file, and say whether it landed
 * (SPEC §7).
 *
 * **The first path in this plugin where a character's sheet writes the layout**,
 * so it is bounded to the one operation that cannot lose anything: it appends. It
 * never edits a definition, never deletes one, and never touches any other row,
 * cell or note — so nothing that resolved a moment ago stops resolving, which is
 * the whole of Constraint 4 here.
 *
 * **Failure is a value** (PATTERNS §4), because every one of these is a failure a
 * user can cause, and the caller needs to know: the cell is rewritten only on
 * `ok`, so a refusal here leaves the note exactly as it was and the worst outcome
 * is that nothing happened. The reverse order would leave a cell naming a
 * definition that does not exist — recoverable, since that is a stray and strays
 * are rendered rather than corrected, but it would be this plugin manufacturing
 * one.
 *
 * **A name the layout already declares is refused, always.** Not "reuse the
 * existing one": that definition may say something different, and silently
 * pointing the row at it would change the row's arithmetic under a gesture whose
 * whole promise is that nothing changes. And not "compare the five fields and
 * reuse it if they match" either, which is a same-ness test on two expressions
 * that would have to decide whether `2` and `1 + 1` are the same definition.
 *
 * **It re-reads the file rather than writing a layout held in memory**, because
 * the sheet's copy was loaded when the sheet last rendered and a second pane may
 * have edited the file since. The whole file goes back through `serialiseLayout`,
 * so a layout promoted into is formatted exactly as one edited in the pane is:
 * there is one writer and one spelling.
 */
export async function appendModifierDefinition(
	app: App,
	folder: string,
	layoutName: string,
	name: string,
	definition: Omit<ModifierDefinition, 'name'>,
): Promise<PromoteResult> {
	const chosen = name.trim();
	// The three name refusals through the one builder that owns them, beside the
	// predicates they come from: a reader who meets the rule here, in the layout
	// editor's report and in the panel meets one sentence rather than three copies
	// of it (`PATTERNS.md` §1).
	const unspellable = unspellableName(chosen);
	if (unspellable !== null) return { error: unspellable };

	const path = normalizePath(`${folder}/${layoutName}.json`);
	const file = app.vault.getFileByPath(path);
	if (file === null) {
		return { error: `Layout "${layoutName}" was not found in "${folder}".` };
	}
	try {
		const layout = parseLayout(await app.vault.read(file));
		const held = layout.modifiers ?? [];
		if (held.some((one) => (one.name ?? '').trim() === chosen)) {
			return { error: nameAlreadyDeclared(chosen) };
		}
		const next: Layout = {
			...layout,
			// Appended at the end, in declaration order, exactly as one added in the
			// layout editor is. The list is no longer only author-written.
			modifiers: [...held, { name: chosen, ...definition }],
		};
		await app.vault.modify(file, serialiseLayout(next));
		return { ok: true };
	} catch (error) {
		// The vault's own reason, or the parser's: the layout file is gone,
		// read-only, or no longer parses. Either way the cell is untouched.
		return { error: error instanceof Error ? error.message : String(error) };
	}
}
