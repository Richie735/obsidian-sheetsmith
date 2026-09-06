/*
 * Choosing a bundled layout, and copying it into the vault
 * (`docs/features/starter-layouts.md`).
 *
 * No sheet UI is drawn and no CSS is added: every surface here is Obsidian's own
 * chrome — the command palette, a suggest modal and a notice — so `docs/UI.md`'s
 * vocabulary and the `.sheetsmith-view` scope are untouched.
 *
 * **The modal lives beside its one consumer rather than in `src/ui/`**, which is
 * `ConfirmModal`'s and the editor's `NameModal`'s precedent: one consumer earns
 * no generalisation (`docs/PATTERNS.md` §1).
 */

import { App, Notice, SuggestModal } from 'obsidian';
import type SheetsmithPlugin from '../main';
import { createLayout } from '../layouts';
import { parseLayout } from '../parse/layout';
import { Starter, STARTERS } from './index';

/**
 * What an install did, in the words the notice shows.
 *
 * Failure is a value (`docs/PATTERNS.md` §4): a name the folder already holds
 * and a source that will not parse are both things a user can meet, and the
 * caller has to be able to tell them from a write that landed. The two are
 * deliberately one shape, because the surface that announces either is one
 * notice.
 */
export type InstallResult = { ok: true; message: string } | { error: string };

/**
 * Validate a starter and write it into the layout folder.
 *
 * **The bytes are not copied.** The source goes through `parseLayout` — the
 * identical gate every vault layout passes, so a starter gone stale against the
 * schema is refused loudly rather than landing broken — and what reaches the
 * vault is what `serialiseLayout` says, through `createLayout`. The tree's own
 * files are pinned canonical by `index.test.ts`, so in practice the bytes
 * *are* the file a reviewer read; that is discipline rather than a promise the
 * layout format makes (`parse/layout.ts` — Constraint 3 is about character
 * notes).
 *
 * **Nothing is overwritten and nothing is suffixed.** The existing file may be
 * the user's edited copy of an earlier install, and both silent answers destroy
 * it (Constraint 4), so a taken name is refused in `createLayout`'s own words.
 */
export async function installStarter(
	app: App,
	folder: string,
	starter: Starter,
): Promise<InstallResult> {
	try {
		const layout = parseLayout(JSON.stringify(starter.source));
		await createLayout(app, folder, layout.name, layout);
		// The folder as well as the name, because the folder is configurable and
		// a user who changed it needs to know where the file went.
		return { ok: true, message: `Added "${layout.name}" to ${folder}.` };
	} catch (error) {
		// The vault's own reason, or the parser's. Either way nothing was
		// written: `createLayout` refuses before it creates.
		return { error: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * The bundled layouts, offered by name with a line saying which is which.
 *
 * The list is bundled, so it holds every entry until the reader narrows it, and
 * the only way to see none is to type a query matching neither a name nor a
 * description — an empty state that belongs to `SuggestModal` rather than to
 * this class, since `getSuggestions` is abstract and the app draws whatever it
 * is handed.
 */
class StarterModal extends SuggestModal<Starter> {
	constructor(private plugin: SheetsmithPlugin) {
		super(plugin.app);
		this.setPlaceholder('Choose a starter layout');
	}

	getSuggestions(query: string): Starter[] {
		const wanted = query.trim().toLowerCase();
		if (wanted === '') return [...STARTERS];
		// The description is searched as well as the name, because the names are
		// deliberately alike — a reader typing "modifiers" is asking a question
		// only the second line answers.
		return STARTERS.filter((starter) =>
			`${starter.name} ${starter.description}`.toLowerCase().includes(wanted),
		);
	}

	renderSuggestion(starter: Starter, el: HTMLElement): void {
		el.createDiv({ cls: 'suggestion-title', text: starter.name });
		el.createEl('small', {
			cls: 'suggestion-note',
			text: starter.description,
		});
	}

	onChooseSuggestion(starter: Starter): void {
		void this.chooseStarter(starter);
	}

	/**
	 * Install the chosen starter and say what happened.
	 *
	 * Separate from `onChooseSuggestion`, which the app calls and which cannot
	 * be awaited, so a test can drive the whole gesture — the write and the
	 * sentence it produces — rather than only the half before the promise.
	 */
	async chooseStarter(starter: Starter): Promise<void> {
		const result = await installStarter(
			this.app,
			this.plugin.settings.layoutFolder,
			starter,
		);
		// `'error' in` rather than `'ok' in`, which is §4's documented spelling for
		// a two-armed result and what every consumer of the sibling `PromoteResult`
		// tests: the failure arm is the one a caller must not forget.
		new Notice('error' in result ? result.error : result.message);
	}
}

/**
 * Open the starter picker.
 *
 * Exported as a function rather than the class, so `commands.ts` names a gesture
 * and not a constructor — and so the modal stays this module's own.
 */
export function chooseStarterLayout(plugin: SheetsmithPlugin): void {
	new StarterModal(plugin).open();
}

/** The modal itself, for the cases that drive its list rather than its write. */
export { StarterModal };
