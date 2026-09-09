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

/**
 * Whether the folder holds any layout at all.
 *
 * A name rather than `listLayouts(...).length` at each site, on
 * `docs/PATTERNS.md` §1's one-step tier: a predicate is the same case as a
 * number, and the two sites spelled it *complementarily* — `=== 0` where one
 * wanted the empty branch and `> 0` where the other wanted the full one, which
 * is `placesChildren`'s own shape. The only thing a guard test over the two
 * copies could assert is that they still negate each other, which is what one
 * name says for free — and what the copies were free to drift about is whether
 * a reader is offered a picker that cannot succeed.
 *
 * It sits here rather than beside either caller because both of them ask it
 * about *this* folder, which is what this module is: one place that knows how
 * the layout folder is read.
 */
export function hasLayouts(app: App, folder: string): boolean {
	return listLayouts(app, folder).length > 0;
}

/**
 * What a reader with no layouts at all is told, in one place.
 *
 * Beside the predicate above, because the two are one policy — when there is
 * nothing to pick, say this — and `docs/PATTERNS.md` §1's "share the
 * application, not just the fact" is the rule the split version broke: the
 * sentence had a name while the condition deciding whether to say it stayed
 * written out at both sites. `nameAlreadyDeclared` below is the precedent for
 * the sentence being here at all: a user-facing refusal about the layout folder
 * belongs to the module that owns the folder.
 *
 * The folder is named because it is configurable — a reader who moved it needs
 * to know which folder was looked in — and the fix is named because it is one
 * command away. Deliberately not `SuggestModal`'s `emptyStateText`: that string
 * answers "nothing matches what you typed", which is a fact about the query,
 * where this is a fact about the vault and true whatever is typed.
 */
export function noLayoutsMessage(folder: string): string {
	return `No layouts in "${folder}" yet. Run "Add a starter layout" from the command palette to get one.`;
}

/**
 * Create a layout file, creating the folder when needed.
 *
 * `layout` is what lands in it, and it defaults to the empty layout the editor's
 * **New layout** has always written. The parameter exists so a starter
 * (`src/starters/`) is written by the one function that already owns folder
 * creation and the duplicate refusal, rather than by a second copy of both — and
 * it goes through `serialiseLayout` here for `appendModifierDefinition`'s own
 * reason one file down: one writer, one spelling.
 */
export async function createLayout(
	app: App,
	folder: string,
	name: string,
	layout: Layout = { name, columns: 6, components: [] },
): Promise<TFile> {
	const dir = normalizePath(folder);
	if (!app.vault.getFolderByPath(dir)) {
		await app.vault.createFolder(dir);
	}
	const path = normalizePath(`${dir}/${name}.json`);
	if (app.vault.getFileByPath(path)) {
		throw new Error(`A layout named "${name}" already exists.`);
	}
	return app.vault.create(path, serialiseLayout(layout));
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
	// The refusal, set before the throw that carries it out, and read again
	// after the write either way. `obsidian.d.ts` says nothing about what
	// `process` does with a callback that throws, and the whole refusal cannot
	// rest on an answer we assumed and then wrote into our own stub: an app that
	// swallowed it would hand this function an `{ ok: true }` for a definition
	// it never appended, and `sheet-view.ts` would rewrite the cell into a
	// reference to it, which is the stray the paragraph above says this must
	// never manufacture. So the flag is the contract and the throw is the
	// optimisation, and the flag is correct under either behaviour.
	let refusal: string | null = null;
	try {
		// `process` rather than `read` then `modify`, because the bytes written
		// here are derived from the bytes read: the two-step spelling leaves a
		// window in which a write landing between them is overwritten by a layout
		// parsed before it existed. That closes one direction of the promise the
		// paragraph above makes and not both. The other direction is still open:
		// `layout-editor.ts` writes a whole-file snapshot of what its pane holds
		// in memory, taking no lock and reading nothing, and nothing in `src/`
		// listens for a vault `modify`. So a promotion landing while a pane is
		// open on that layout is dropped by that pane's next save, and no
		// spelling of this call site can prevent it.
		//
		// The refusal throws, which is the only way a synchronous callback can
		// decline to write. It is caught by this function's own `catch` and
		// turned back into the value this function returns, so the refusal is a
		// value everywhere it is visible; what it buys over the flag alone is
		// that a name already declared leaves the file untouched rather than
		// rewritten with its own bytes.
		await app.vault.process(file, (current) => {
			// Cleared first, so the flag reports what *this* invocation decided.
			// `process` is documented as "atomically read, modify, and save" and
			// says nothing about how many times it may call this, so a retry after
			// a concurrent write is a shape the typings permit. Without this line a
			// refusal from a superseded attempt would outlive it: the append would
			// land and the function would still answer `{ error }`, `sheet-view.ts`
			// would leave the cell alone, and the definition would be orphaned in
			// the layout. That is the mirror of the stray the flag exists to
			// prevent, and one statement buys both directions.
			refusal = null;
			const layout = parseLayout(current);
			const held = layout.modifiers ?? [];
			if (held.some((one) => (one.name ?? '').trim() === chosen)) {
				refusal = nameAlreadyDeclared(chosen);
				throw new Error(refusal);
			}
			const next: Layout = {
				...layout,
				// Appended at the end, in declaration order, exactly as one added in
				// the layout editor is. The list is no longer only author-written.
				modifiers: [...held, { name: chosen, ...definition }],
			};
			return serialiseLayout(next);
		});
	} catch (error) {
		// The refusal above, the vault's own reason, or the parser's: the layout
		// file is gone, read-only, or no longer parses. Either way the cell is
		// untouched.
		return { error: error instanceof Error ? error.message : String(error) };
	}
	// Past the `catch`, so this is the path an app that swallowed the throw
	// takes. Nothing was appended either way.
	if (refusal !== null) return { error: refusal };
	return { ok: true };
}
