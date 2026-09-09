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

/**
 * Why a layout the folder does not hold cannot be acted on.
 *
 * One sentence over the two callers in this file — a promotion appending to a
 * layout, and a copy reading one — because both state the same fact about the
 * same folder, and
 * `docs/PATTERNS.md` §1's one-step tier is that the only thing a guard test
 * over two copies of a sentence could assert is that they still read the same.
 * It names the folder for `noLayoutsMessage`'s reason: the folder is
 * configurable, and a reader who moved it needs to know which one was looked in.
 *
 * **It names both halves of the lookup and nothing else, deliberately.** The
 * recovery is a control beside it at every surface that shows it, never a clause
 * inside it: `view/missing-layout.ts` says so in its own words for the third
 * audience — the message is "kept verbatim… and the offer goes beside it, not
 * instead of it" — the copy arm leaves the modal open with the dropdown that
 * named the stale layout still on screen, and a promotion draws the refusal
 * beside the cell. §4's own example is this shape: `max: 'con' is not defined on
 * this sheet` names both operands and leaves the fix to the surface.
 *
 * **A third spelling of this sentence stands inline in `view/sheet-view.ts`**,
 * feeding that missing-layout surface, and it should be this function's — one
 * line there plus an export here, byte-identical output, no test touched. Not
 * taken in this feature, which has no business in the sheet view; recorded here
 * rather than nowhere, and the row belongs in `docs/BACKLOG.md` § Patterns.
 * Until it moves, this stays unexported: `nameAlreadyDeclared` beside it is out
 * because the harness fakes a write and has to refuse it in the same words, and
 * an export with no importer is an invitation rather than a rule.
 */
function layoutNotFound(name: string, folder: string): string {
	return `Layout "${name}" was not found in "${folder}".`;
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
 * The name to offer for a copy of `source`: the first one the folder does not
 * already hold.
 *
 * Here rather than in the modal for `hasLayouts`'s own stated reason — this is
 * the module that knows how the layout folder is read — and on
 * `noLayoutsMessage`'s and `nameAlreadyDeclared`'s precedent, that a
 * user-facing name policy about that folder belongs beside the folder.
 *
 * **A proposal, never an application.** The pane puts this in a box the reader
 * can edit before pressing anything, so the suffix is a suggestion; the writer
 * still refuses a taken name in `createLayout`'s own words, and the two do not
 * reach into each other.
 *
 * `copy` rather than Obsidian's own trailing ` 1`: a layout name is a sheet's
 * name an author reads back later, and "Cutter 1" reads as a variant of Cutter
 * rather than a copy of it, where "copy" is legible as a placeholder and so is
 * the more useful prompt to rename. The ladder starts at 2 because the
 * unsuffixed one is the first.
 */
export function suggestCopyName(
	app: App,
	folder: string,
	source: string,
): string {
	const taken = new Set(
		listLayouts(app, folder).map((file) => file.basename),
	);
	const first = `${source} copy`;
	if (!taken.has(first)) return first;
	// Terminates because `taken` is finite: some `n` is free.
	let n = 2;
	while (taken.has(`${first} ${n}`)) n += 1;
	return `${first} ${n}`;
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
 * What an install did, in the words the notice shows.
 *
 * Failure is a value (`docs/PATTERNS.md` §4): a name the folder already holds
 * and a source that will not parse are both things a user can meet, and the
 * caller has to be able to tell them from a write that landed. The two are
 * deliberately one shape, because the surface that announces either is one
 * notice.
 *
 * **`name` is the name the file actually landed under**, which is the one fact
 * only the writer holds: it is either the source's own or the caller's override,
 * and which of the two it is depends on the blank-means-absent rule below. A
 * caller that re-derived it would be holding a second copy of that rule, and the
 * only thing a guard test over the two could assert is that they still agree
 * (`docs/PATTERNS.md` §1's one-step tier) — while what they could silently
 * disagree about is which file a notice names and which one a pane then opens.
 */
export type InstallResult =
	| { ok: true; message: string; name: string }
	| { error: string };

/**
 * A thrown thing as a sentence, which is the one shape a refusal is reported in
 * here.
 *
 * Four sites in this file turn a `catch` into an `{ error }`, and every one of
 * them wants the vault's own reason or the parser's rather than a sentence of
 * ours (`docs/PATTERNS.md` §4). One name because that is all a guard test over
 * the copies could ever assert — that they still say the same thing.
 *
 * **Private, with twelve anonymous copies of the same ternary outside this
 * file, and that is a known gap rather than an oversight.** They stand in
 * `characters.ts`, `parse/character.ts`, `parse/layout.ts`,
 * `formula/functions.ts`, `view/sheet-view.ts` and `editor/layout-editor.ts` —
 * four in that last one, and this module's arrival removed a thirteenth from it.
 * A shared module would be the §1-consistent answer and would have to live
 * outside `parse/` and `formula/` reach, importing nothing from `obsidian`
 * (Constraint 5), which is easy; what it costs is a pass over six files that
 * this feature has no business editing. So the extraction stops at the file that
 * needed it, and the ledger is here rather than nowhere: the row belongs in
 * `docs/BACKLOG.md` § Patterns, waiting on a pass that does only that.
 */
function reason(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * A write that landed, in one voice for every arm that lands one.
 *
 * Split out of `installLayoutSource` on that function's own header's sanction —
 * "the *order* is what may not be duplicated, and the wording is negotiable" —
 * because the blank arm goes through `createLayout`, which composes no message,
 * and one gesture with three sources that announces two of them and stays quiet
 * on the third invites a reader to infer the quiet one did something different.
 *
 * The folder as well as the name, because the folder is configurable and a user
 * who changed it needs to know where the file went.
 *
 * **The whole arm rather than just the sentence**, which is `docs/PATTERNS.md`
 * §1's "share the application, not just the fact" and the mistake this function
 * was one revision away from being: the sentence had a name while the three
 * fields around it stayed written out at both writers, so the next field added
 * to the `ok` arm would have been added by one of the two and missed by the
 * other. `roundSum`'s own history is the worked example — a policy shared and
 * its application duplicated.
 */
function landed(name: string, folder: string): InstallResult {
	return { ok: true, message: `Added "${name}" to ${folder}.`, name };
}

/**
 * Validate a layout's own source text and write it into the layout folder.
 *
 * **The one thing this function is, is the ordering**, and that is why it has a
 * name at all: `parseLayout` runs first and `createLayout` only after it, so a
 * source that will not parse never reaches the vault. Three sources of text
 * reach this folder — a bundled starter (`src/starters/picker.ts`), a pasted
 * layout and a copy of one already in the folder, the last two through
 * `startLayout` below — and copies of that order are exactly what
 * `docs/PATTERNS.md` §1 forbids, where the only thing a guard could assert is
 * that they still call the two functions in the same order. That is what one
 * name says for free.
 *
 * It is not a convenience either. A refused import leaving the vault byte for
 * byte as it was is this plugin's whole answer to the defect the closest prior
 * art has open on this gesture (`docs/features/layout-import-export.md`), and
 * the order is what makes it structural rather than careful.
 *
 * **The bytes are not copied.** The source goes through `parseLayout` — the
 * identical gate every vault layout passes — and what reaches the vault is what
 * `serialiseLayout` says, through `createLayout`: one writer, one spelling.
 *
 * **Nothing is overwritten and nothing is suffixed.** The existing file may be
 * the user's own edited copy, and both silent answers destroy it (Constraint 4),
 * so a taken name is refused in `createLayout`'s own words.
 *
 * `rename` replaces the name inside the source, so the filename and the `name`
 * key still agree — the invariant `loadLayout` and `listLayouts` both rely on.
 * **Blank means absent**, which is `docs/features/character-folder.md`'s
 * empty-means-the-default shape and is the rule here rather than at the field,
 * so a caller offering an optional name does not also have to own what an
 * untouched box means — which is why the result carries the name it settled on
 * rather than leaving the caller to work it out again.
 *
 * One sentence comes along with the ordering rather than being a reason for it:
 * `Added "X" to <folder>.` A later caller wanting different words should feel
 * free to take a parameter or split the sentence out — the *order* is what may
 * not be duplicated, and the wording is negotiable.
 */
export async function installLayoutSource(
	app: App,
	folder: string,
	source: string,
	rename?: string,
): Promise<InstallResult> {
	try {
		const parsed = parseLayout(source);
		const chosen = rename?.trim() ?? '';
		const layout: Layout = chosen === '' ? parsed : { ...parsed, name: chosen };
		await createLayout(app, folder, layout.name, layout);
		return landed(layout.name, folder);
	} catch (error) {
		// The vault's own reason, or the parser's. Either way nothing was
		// written: `parseLayout` runs before anything is created, and
		// `createLayout` refuses before it creates.
		return { error: reason(error) };
	}
}

/** What a new layout starts from. */
export type LayoutSource =
	| { blank: true }
	| { copyOf: string }
	| { text: string };

/**
 * Whether this source needs a name given to it.
 *
 * **One predicate rather than one per side of the seam** (`docs/PATTERNS.md`
 * §1's one-step tier): a pasted layout carries a name of its own, which is
 * `installLayoutSource`'s blank-means-absent rule, and the other two sources
 * have no other source of one. The writer refuses a blank name on those two and
 * the surface disables its button on exactly the same split — and the two were
 * deriving it independently, one on `'text' in source` and one on a control's
 * own `'paste'`. The only thing a guard test over those could assert is that
 * they still agree, which is what one name says for free; what they were free to
 * drift about is whether a reader meets a dead button on an arm that would have
 * worked, or a live one on an arm that cannot.
 */
export function nameRequiredFor(source: LayoutSource): boolean {
	return !('text' in source);
}

/**
 * Start a new layout from one of the three sources, and say what happened.
 *
 * **What this is, is one result shape over three arms.** `createLayout` throws
 * and `installLayoutSource` returns a value, and `docs/PATTERNS.md` §4 is
 * explicit that a failure a user can cause is a value the caller can act on —
 * so the branch, the try/catch and the blank-name refusal live in the module
 * that owns the folder, and the surface has one `'error' in result` to read.
 * Three arms is §1's "three consumers, extract" rung outright, and what they
 * share is a *set* and a *policy*: the refusal set, and the ordering that
 * parses before it writes. Spelling that at the call site would be `roundSum`'s
 * own mistake — a fact shared while its application stayed written out at both
 * sites (`docs/PATTERNS.md` §1). **Share the application, not just the fact.**
 *
 * **The copy arm reads the source file here rather than in the surface**, which
 * is the whole reason it is an arm at all. `getFileByPath` answers `null` for a
 * source another pane deleted rather than throwing, so a modal handed
 * `{ text }` would have to invent both that branch and a user-facing sentence
 * for it — a second failure shape in the one surface this function exists to
 * spare, with a sentence owned by nobody. It also makes "a copy reads the
 * source's *file*, and reconstructs nothing from editor state" a guarantee of
 * this module: no surface can be refactored into reading the pane's in-memory
 * layout instead, because no surface reads anything.
 *
 * **A blank name is refused on the two arms where blank cannot mean anything
 * else, and legal on the one where it can.** For a paste, blank means "use the
 * name inside the JSON", which is `installLayoutSource`'s rule and stated in
 * its header — so the paste arm goes straight there with the box untrimmed. For
 * the other two there is no other source of a name, and `createLayout` handed a
 * blank one would write `<folder>/.json`. That is a hole nothing else closes,
 * and it is why this refusal is a writer-side guarantee rather than a second
 * copy of the surface's disabled button: the two happen to agree about which
 * arms they cover, which is what makes the disabled control honest rather than
 * what makes this necessary.
 */
export async function startLayout(
	app: App,
	folder: string,
	name: string,
	source: LayoutSource,
): Promise<InstallResult> {
	const chosen = name.trim();
	// The fix rather than the fault (`docs/PATTERNS.md` §4). Unreachable from
	// the pane's own modal, where the button and the Enter handler both refuse
	// it first; reachable by any other caller, and by a test with no modal.
	if (nameRequiredFor(source) && chosen === '') {
		// Not "or paste one that carries a name": this fires on the copy arm
		// too, where that is no fix at all. The sentence has to serve both arms
		// it can reach.
		return { error: 'A new layout needs a name. Type one first.' };
	}

	// The box goes across untrimmed on this arm: what a blank one means is
	// `installLayoutSource`'s rule, and a `.trim()` here would be a second copy
	// of it (`docs/PATTERNS.md` §1).
	if ('text' in source) {
		return installLayoutSource(app, folder, source.text, name);
	}

	if ('copyOf' in source) {
		const path = normalizePath(`${folder}/${source.copyOf}.json`);
		const file = app.vault.getFileByPath(path);
		if (file === null) return { error: layoutNotFound(source.copyOf, folder) };
		let text: string;
		try {
			text = await app.vault.read(file);
		} catch (error) {
			return { error: reason(error) };
		}
		// The source's text, through the same gate every layout in the folder
		// passed: `parseLayout` first, so a source that will not parse never
		// reaches the vault, and the bytes are `serialiseLayout`'s.
		return installLayoutSource(app, folder, text, chosen);
	}

	try {
		// The empty layout `createLayout` already defaults to, so what a blank
		// start is stays one definition rather than two.
		await createLayout(app, folder, chosen);
	} catch (error) {
		return { error: reason(error) };
	}
	return landed(chosen, folder);
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
		return { error: layoutNotFound(layoutName, folder) };
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
		return { error: reason(error) };
	}
	// Past the `catch`, so this is the path an app that swallowed the throw
	// takes. Nothing was appended either way.
	if (refusal !== null) return { error: refusal };
	return { ok: true };
}
